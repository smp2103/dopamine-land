// secrets(숨은 곳 A — 말랑·공룡·솜눈·버섯 12곳) — 시간·날씨 문 열림 표, 아기 매머드 녹이기 상태 기계, 발견은 곳마다 한 번,
// 결정적 청크·모델 이름(secret-<id>), 실내 등록·들어가기, 하루 한 번 줍기, 눈사태 파기, 요정 보름 선물.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import { sceneStats } from './kit/three';
import buildSecrets from '../src/modules/secrets';
import { PLACES } from '../src/core/world';
import { heightAt } from '../src/core/island';
import { DAY_SEC, HOUR_SEC, MOON_DAYS, moonPhaseOf, isFullMoon, type Weather } from '../src/core/api';
import {
  MY_SECRETS, SECRETS, GATES, gateOpen, shouldFind, moonCycle, mammothStep, freshMammoth, thawProgress, sanitizeMammoth, ensureFlags,
  THAW_NEED, THAW_SEC, HOT_ITEMS, avalancheTier, AVALANCHE_MOUNDS, rollDaily, DAILY, foundCard, islandFound,
  type GateEnv, type MySecret, type MammothState,
} from '../src/modules/secrets/logic';
import { buildSpotModel, ANCHORS } from '../src/modules/secrets/outdoor';
import { Builder, G } from '../src/modules/secrets/kit';
import { buildRoom, roomFloor, type RoomId } from '../src/modules/secrets/rooms';
import { rngFor } from '../src/core/rng';

const env = (hour: number, o: { fullMoon?: boolean; ice?: Weather } = {}): GateEnv => ({
  hour, fullMoon: !!o.fullMoon, weatherOf: (r) => (r === 'ice' ? o.ice ?? 'clear' : 'clear'),
});

// ───────────── 문 열림 표 ─────────────
describe('시간·날씨 문 열림 표', () => {
  const table: Array<[MySecret, GateEnv, boolean, string]> = [
    ['home-cliff-beach', env(4.9), false, '04:54 — 아직 밤'],
    ['home-cliff-beach', env(5), true, '05:00 아침 시작'],
    ['home-cliff-beach', env(8.99), true, '08:59'],
    ['home-cliff-beach', env(9), false, '09:00 낮'],
    ['home-cliff-beach', env(14), false, '낮'],
    ['home-fairy-ring', env(23, { fullMoon: true }), true, '보름 밤'],
    ['home-fairy-ring', env(2, { fullMoon: true }), true, '보름 새벽 2시'],
    ['home-fairy-ring', env(23), false, '보름 아닌 밤'],
    ['home-fairy-ring', env(12, { fullMoon: true }), false, '보름 낮'],
    ['home-fairy-ring', env(20.9, { fullMoon: true }), false, '보름 저녁(밤 전)'],
    ['ice-aurora-cave', env(23, { ice: 'aurora' }), true, '오로라'],
    ['ice-aurora-cave', env(23, { ice: 'snow' }), false, '눈'],
    ['ice-aurora-cave', env(23, { ice: 'clear' }), false, '맑은 밤'],
    ['mush-moon-deck', env(21), true, '밤 21시'],
    ['mush-moon-deck', env(4.5), true, '밤 04:30'],
    ['mush-moon-deck', env(18), false, '저녁'],
    ['mush-moon-deck', env(10), false, '낮'],
  ];
  it.each(table)('%s @ %#', (id, e, want, why) => { expect(gateOpen(id, e), why).toBe(want); });
  it('표에 없는 곳은 늘 열려 있고, 표에 있는 곳은 안내 문구가 있다', () => {
    for (const id of MY_SECRETS) {
      if (!GATES[id]) for (const h of [0, 6, 12, 18, 23]) expect(gateOpen(id, env(h)), id).toBe(true);
      else expect(GATES[id]!.hint.length).toBeGreaterThan(5);
    }
    expect(Object.keys(GATES).sort()).toEqual(['home-cliff-beach', 'home-fairy-ring', 'ice-aurora-cave', 'mush-moon-deck']);
  });
  it('발견 규칙: near 는 거리만, near-open 은 문까지, enter 는 들어가야', () => {
    expect(shouldFind('ice-mammoth', { dist: 11, env: env(12) })).toBe(true);
    expect(shouldFind('ice-mammoth', { dist: 13, env: env(12) })).toBe(false);
    expect(shouldFind('home-fairy-ring', { dist: 3, env: env(12, { fullMoon: true }) })).toBe(false);
    expect(shouldFind('home-fairy-ring', { dist: 3, env: env(23, { fullMoon: true }) })).toBe(true);
    expect(shouldFind('mush-moon-deck', { dist: 2, env: env(13) })).toBe(false);
    expect(shouldFind('mush-moon-deck', { dist: 2, env: env(22) })).toBe(true);
    expect(shouldFind('ice-aurora-cave', { dist: 0, env: env(23, { ice: 'aurora' }) })).toBe(false);
    expect(shouldFind('ice-aurora-cave', { entered: true, env: env(12) })).toBe(true);
    for (const id of MY_SECRETS) if (SECRETS[id].find === 'enter') expect(SECRETS[id].room, id).toBeTruthy();
  });
  it('보름 밤 전체가 한 달 주기 번호 안에 든다(요정 선물은 보름마다 한 번)', () => {
    for (let c = 0; c < 4; c++) {
      const base = c * MOON_DAYS * DAY_SEC;
      const nights: number[] = [];
      for (let s = base; s < base + MOON_DAYS * DAY_SEC; s += HOUR_SEC / 4) {
        const h = (s % DAY_SEC) / HOUR_SEC;
        if (isFullMoon(moonPhaseOf(s)) && gateOpen('home-fairy-ring', env(h, { fullMoon: true }))) nights.push(moonCycle(s));
      }
      expect(nights.length).toBeGreaterThan(10);
      expect(new Set(nights)).toEqual(new Set([c]));
    }
  });
});

// ───────────── 아기 매머드 ─────────────
describe('아기 매머드 녹이기 상태 기계', () => {
  const run = (s: MammothState, ...evs: Parameters<typeof mammothStep>[1][]) => {
    const fx: string[] = [];
    for (const e of evs) { const r = mammothStep(s, e); s = r.s; fx.push(...r.fx); }
    return { s, fx };
  };
  it('따뜻한 것 3개 → 녹기 시작 → THAW_SEC 뒤 풀려남', () => {
    let { s, fx } = run(freshMammoth(), { type: 'heat' }, { type: 'heat' });
    expect(s).toMatchObject({ phase: 'frozen', heat: 2 });
    expect(fx).toEqual(['heat', 'heat']);
    expect(thawProgress(s)).toBeLessThan(0.2);
    ({ s, fx } = run(s, { type: 'heat' }));
    expect(s.phase).toBe('thawing');
    expect(fx).toEqual(['heat', 'thaw-start']);
    ({ s, fx } = run(s, { type: 'tick', dt: THAW_SEC / 2 }));
    expect(s.phase).toBe('thawing');
    expect(thawProgress(s)).toBeCloseTo(0.5, 5);
    ({ s, fx } = run(s, { type: 'tick', dt: THAW_SEC }));
    expect(s.phase).toBe('free');
    expect(fx).toEqual(['free']);
    expect(thawProgress(s)).toBe(1);
  });
  it('모닥불 하나로도 녹는다 · 녹는 중·풀린 뒤엔 무시', () => {
    let { s, fx } = run(freshMammoth(), { type: 'fire' });
    expect(s).toMatchObject({ phase: 'thawing', fire: true });
    expect(fx).toEqual(['fire', 'thaw-start']);
    ({ s, fx } = run(s, { type: 'heat' }, { type: 'fire' }));
    expect(fx).toEqual(['ignored', 'ignored']);
    expect(s.heat).toBe(0);
    ({ s } = run(s, { type: 'tick', dt: 0 }, { type: 'tick', dt: -1 }));
    expect(s.t).toBe(0);
    ({ s, fx } = run(s, { type: 'tick', dt: 100 }));
    expect(s.phase).toBe('free');
    ({ s, fx } = run(s, { type: 'heat' }, { type: 'fire' }, { type: 'tick', dt: 1 }));
    expect(fx).toEqual(['ignored', 'ignored']);
    expect(s.phase).toBe('free');
  });
  it('불러온 값은 고쳐 쓴다', () => {
    expect(sanitizeMammoth(null)).toEqual(freshMammoth());
    expect(sanitizeMammoth({ phase: 'boom', heat: 99, t: -3 })).toEqual({ phase: 'frozen', heat: THAW_NEED, fire: false, t: 0 });
    expect(sanitizeMammoth({ phase: 'thawing', heat: 3, t: 2.5 })).toMatchObject({ phase: 'thawing', t: 2.5 });
    expect(HOT_ITEMS).toContain('m_volcanic');
  });
});

describe('저장·표·굴림', () => {
  it('ensureFlags: 엉망인 값도 모양을 맞춘다', () => {
    const f = ensureFlags({ found: { 'ice-mammoth': 3, bad: 'x' }, chest: { a: 1, b: 0 }, daily: { lava: 2 }, aval: { day: 4, dug: [0, 9, 'x', 2] }, mammoth: { phase: 'free' } });
    expect(f.found).toEqual({ 'ice-mammoth': 3 });
    expect(f.chest).toEqual({ a: true });
    expect(f.aval).toEqual({ day: 4, dug: [0, 2] });
    expect(f.mammoth.phase).toBe('free');
    expect(f.fairy).toBe(-1);
    expect(ensureFlags(undefined).found).toEqual({});
  });
  it('눈사태 상자 등급 비율(나무 60 · 은 32 · 금 8)', () => {
    const c = { wood: 0, silver: 0, gold: 0 };
    const N = 8000;
    for (let i = 0; i < N; i++) c[avalancheTier(rngFor(`t:${i}`))]++;
    expect(Math.abs(c.wood / N - 0.6)).toBeLessThan(0.03);
    expect(Math.abs(c.silver / N - 0.32)).toBeLessThan(0.03);
    expect(Math.abs(c.gold / N - 0.08)).toBeLessThan(0.015);
  });
  it('하루 줍기: 확률 없는 것은 늘, 진주는 가끔', () => {
    let pearls = 0;
    for (let i = 0; i < 2000; i++) {
      const got = rollDaily(DAILY.bubble, rngFor(`b:${i}`));
      expect(got.find((x) => x.id === 'm_shell')?.n).toBe(3);
      if (got.some((x) => x.id === 'm_pearl')) pearls++;
    }
    expect(Math.abs(pearls / 2000 - 0.2)).toBeLessThan(0.03);
  });
  it('발견 카드는 섬 숨은 곳 n/3', () => {
    const found = { 'ice-mammoth': 1, 'ice-avalanche': 2, 'home-fairy-ring': 0 };
    expect(islandFound(found, 'ice')).toBe(2);
    expect(foundCard('ice-avalanche', found).body).toContain('솜눈섬 숨은 곳 2/3');
  });
});

// ───────────── 모델 ─────────────
describe('모델', () => {
  it('바깥 12곳: 이름 secret-<id> · 결정적 · 예산 안(그리기 ≤ 40)', () => {
    for (const id of MY_SECRETS) {
      const a = buildSpotModel(id, rngFor(`secrets:${id}`));
      expect(a.root.name).toBe(`secret-${id}`);
      const st = sceneStats(a.root);
      expect(st.drawCalls, id).toBeLessThanOrEqual(40);
      expect(st.triangles, id).toBeLessThan(150000);
      const b = buildSpotModel(id, rngFor(`secrets:${id}`));
      expect(sceneStats(b.root)).toEqual(st);
      // 상태를 바꿔 가며 update 가 넘어지지 않는다
      for (const open of [false, true]) a.update(1.5, { open, night: open ? 1 : 0, found: open, chest: !open, daily: open, mammoth: freshMammoth(), dug: [true, false, true, false], freeAge: 3 });
    }
  });
  it('불투명 조각(무광·반질·쇠·빛)은 메시 하나로 굽힌다(정점마다 거칠기·쇠·빛)', () => {
    const B = new Builder();
    B.add(G.sphere(), 'matte', '#ff9a8a').add(G.box(), 'gloss', '#ffffff', [1, 0, 0]).add(G.cyl(), 'metal', '#ffd54a', [2, 0, 0]).add(G.cone(), 'glow', '#fff3a8', [3, 0, 0]);
    B.add(G.sphere(), 'water', '#9fe9ff', [0, 1, 0]);
    const g = B.bake('t');
    expect(g.children.map((c) => c.name).sort()).toEqual(['t:solid', 't:water']);
    const solid = g.getObjectByName('t:solid') as THREE.Mesh;
    expect(solid.geometry.getAttribute('rm').itemSize).toBe(3);
    expect(solid.castShadow).toBe(true);
  });
  it('바깥 곳 하나는 메시 몇 개로만(가까이서 그림자·이웃까지 40 안)', () => {
    for (const id of MY_SECRETS) {
      const m = buildSpotModel(id, rngFor(`secrets:${id}`));
      // 문 열림·밤(가장 많이 보일 때)
      m.update(1, { open: true, night: 1, found: true, chest: true, daily: true, mammoth: freshMammoth(), dug: [false, false, false, false], freeAge: 0 });
      let n = 0;
      m.root.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) n++; });
      expect(n, id).toBeLessThanOrEqual(16);
    }
  });
  it('실내 7곳: 바닥 판정·충돌체·자리', () => {
    for (const r of ['waterfall', 'mural', 'bubble', 'dive', 'aurora', 'hut', 'tree'] as RoomId[]) {
      const m = buildRoom(r, rngFor(`room:${r}`));
      expect(roomFloor(m.R, 0, 0)).toBe(0);
      expect(roomFloor(m.R, m.R + 3, 0)).toBeNull();
      for (const p of [m.spawn, m.exit, ...Object.values(m.anchors)]) expect(roomFloor(m.R, p[0], p[2]), `${r} ${p}`).toBe(0);
      expect(m.cols.length).toBeGreaterThan(20);
      const rs = sceneStats(m.root);
      expect(rs.drawCalls, r).toBeLessThanOrEqual(40);
      m.update(2, { chest: true, daily: true, star: true });
      m.update(3, { chest: false, daily: false, star: false });
    }
  });
});

// ───────────── 모듈(가짜 게임) ─────────────
/** interiors 대역: 등록·들어가기·나가기(onEnter/onExit 부르기) */
function fakeInteriors(game: FakeGame) {
  const defs = new Map<string, { id: string; build(): THREE.Object3D; onEnter?(): void; onExit?(): void; spawn: THREE.Vector3 | (() => THREE.Vector3); exitTo: THREE.Vector3 | (() => THREE.Vector3); update?(t: number, dt: number): void; colliders?(): unknown[] }>();
  let cur: string | null = null;
  const v = (p: THREE.Vector3 | (() => THREE.Vector3)) => (typeof p === 'function' ? p() : p);
  const api = {
    defs,
    register: (d: never) => { const def = d as { id: string }; defs.set(def.id, d); return () => defs.delete(def.id); },
    enter: (id: string) => {
      const d = defs.get(id);
      if (!d) return false;
      if (cur) api.exit();
      d.build();
      d.colliders?.();
      cur = id;
      const s = v(d.spawn); game.player.teleport(s.x, s.z, s.y);
      d.onEnter?.();
      return true;
    },
    exit: () => { if (!cur) return false; const d = defs.get(cur)!; cur = null; d.onExit?.(); const e = v(d.exitTo); game.player.teleport(e.x, e.z); return true; },
    current: () => cur,
    origin: (i: number) => ({ x: -20000 + i * 300, y: 600, z: 0 }),
  };
  return api;
}

describe('secrets 모듈', () => {
  let game: FakeGame;
  let ix: ReturnType<typeof fakeInteriors>;
  beforeEach(async () => {
    stubLocalStorage();
    game = makeFakeGame({ hour: 12 });
    ix = fakeInteriors(game);
    game.ext.interiors = ix;
    await buildSecrets(makeCtx(game));
  });
  const H = PLACES.hidden as Record<string, { x: number; z: number }>;
  const spot = (id: MySecret) => game.ext.secrets.spot(id) as { x: number; y: number; z: number; rotY: number };

  it('청크 레이어 셋(장식은 detail) · 칸을 지으면 secret-<id> 가 있다', () => {
    expect(game.chunks.keys()).toEqual(expect.arrayContaining(['secrets-spots', 'secrets-caves', 'secrets-dress']));
    expect(game.chunks.layer('secrets-dress')!.detail).toBe(true);
    for (const id of MY_SECRETS) {
      const o = game.chunks.buildAtWorld('secrets-spots', H[id].x, H[id].z)!;
      expect(o.getObjectByName(`secret-${id}`), id).toBeTruthy();
    }
    const a = game.chunks.signature('secrets-spots', Math.floor(H['ice-mammoth'].x / 128), Math.floor(H['ice-mammoth'].z / 128));
    const b = game.chunks.signature('secrets-spots', Math.floor(H['ice-mammoth'].x / 128), Math.floor(H['ice-mammoth'].z / 128));
    expect(a).toBe(b);
    const cv = PLACES.caves[0];
    expect(game.chunks.buildAtWorld('secrets-caves', cv.x, cv.z)!.getObjectByName(`secrets-cave-${cv.id}`)).toBeTruthy();
    expect(game.physics.statics.length).toBeGreaterThan(0);
  });

  it('물 위 오두막: 나오는 자리는 뗏목 위 · 용암 정원 상호작용은 평평한 테라스 위', () => {
    game.chunks.buildAtWorld('secrets-spots', H['mush-swamp-hut'].x, H['mush-swamp-hut'].z);
    const def = ix.defs.get('secrets:mush-swamp-hut')!;
    const at = typeof def.exitTo === 'function' ? def.exitTo() : def.exitTo;
    const hut = spot('mush-swamp-hut');
    expect(at.y).toBeGreaterThan(hut.y + 0.2);
    expect(game.groundProviderAt(at.x, at.z)).toBeCloseTo(at.y, 3);
    game.chunks.buildAtWorld('secrets-spots', H['dino-lava-garden'].x, H['dino-lava-garden'].z);
    const l = spot('dino-lava-garden');
    const c = Math.cos(l.rotY), s = Math.sin(l.rotY);
    for (const a of Object.values(ANCHORS['dino-lava-garden'])) {
      const x = l.x + c * a[0] + s * a[2], z = l.z - s * a[0] + c * a[2];
      expect(game.groundProviderAt(x, z)).toBeCloseTo(Math.max(l.y, heightAt(x, z)), 3);
      expect(Math.abs(game.groundProviderAt(x, z)! - l.y)).toBeLessThan(1.2);
    }
  });
  it('실내 7곳을 등록한다', () => {
    expect([...ix.defs.keys()].sort()).toEqual([
      'secrets:dino-bubble-cave', 'secrets:dino-bubble-dive', 'secrets:dino-mural-cave', 'secrets:home-waterfall-cave',
      'secrets:ice-aurora-cave', 'secrets:mush-swamp-hut', 'secrets:mush-tree-room',
    ]);
  });

  it('곳마다 secret-found 는 딱 한 번', () => {
    const rec = recordEvents(game);
    // near: 가까이 가면
    for (const id of ['home-cliff-beach', 'dino-lava-garden', 'ice-mammoth', 'ice-avalanche'] as MySecret[]) {
      const p = spot(id);
      game.player.teleport(p.x + 1, p.z + 1);
      game.tick(1 / 30, 10);
      game.tick(1 / 30, 10);
    }
    // near-open: 문이 닫혀 있으면 아직
    const fr = spot('home-fairy-ring');
    game.player.teleport(fr.x, fr.z);
    game.tick(1 / 30, 10);
    expect(rec.of('secret-found').map((e) => e.id)).not.toContain('home-fairy-ring');
    game.env!.gameSec = 3 * DAY_SEC + 23 * HOUR_SEC + DAY_SEC * MOON_DAYS * 0; // 3일째 23시 → 보름
    game.env!.advance(0);
    expect(game.env!.fullMoon).toBe(true);
    game.tick(1 / 30, 10);
    // 달 관측대(밤)
    const md = spot('mush-moon-deck');
    game.player.teleport(md.x + 2, md.z, md.y + 0.7);
    game.tick(1 / 30, 10);
    // enter: 실내 들어가기(오로라 동굴은 문이 닫혀 있어도 실내 들어가기는 발견)
    for (const r of ['secrets:home-waterfall-cave', 'secrets:dino-mural-cave', 'secrets:dino-bubble-cave', 'secrets:ice-aurora-cave', 'secrets:mush-swamp-hut', 'secrets:mush-tree-room', 'secrets:dino-bubble-dive']) {
      expect(ix.enter(r)).toBe(true);
      game.tick(1 / 30, 3);
      ix.exit();
      expect(ix.enter(r)).toBe(true);
      ix.exit();
    }
    // 같은 곳을 또 찾아도, 다시 가까이 가도
    for (const id of MY_SECRETS) expect(game.ext.secrets.discover(id)).toBe(false);
    const p = spot('ice-mammoth');
    game.player.teleport(p.x, p.z);
    game.tick(1 / 30, 20);
    const ids = rec.of('secret-found').map((e) => e.id as string);
    expect(ids.sort()).toEqual([...MY_SECRETS].sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(game.hudLog.cards.filter((c) => c.title.startsWith('숨은 곳 발견')).length).toBe(12);
    expect(game.ext.secrets.found()).toHaveLength(12);
    // 저장에 남는다
    expect(Object.keys((game.state.flags.secrets as { found: object }).found)).toHaveLength(12);
  });

  it('매머드: 따뜻한 것 3개 → 녹아서 dino:z_mammoth 해금', () => {
    const unlocks: string[] = [];
    game.econ = { unlock: (k: string) => { unlocks.push(k); }, isUnlocked: () => true } as never;
    const p = spot('ice-mammoth');
    game.player.teleport(p.x, p.z);
    game.tick(1 / 30, 2);
    game.state.addItem('m_volcanic', 2);
    game.state.addItem('it_grilled_fish', 1);
    for (let i = 0; i < 3; i++) expect(game.interact('secrets:mammoth', { force: true })).toBe(true);
    expect(game.ext.secrets.mammoth().phase).toBe('thawing');
    expect(game.state.bag.m_volcanic ?? 0).toBe(0);
    expect(game.interact('secrets:mammoth', { force: true })).toBe(true); // 녹는 중엔 아무 일 없음
    game.tick(1 / 10, THAW_SEC * 10 + 5);
    expect(game.ext.secrets.mammoth().phase).toBe('free');
    expect(unlocks).toEqual(['dino:z_mammoth']);
    expect(game.hudLog.cards.some((c) => c.title.includes('매머드가 친구'))).toBe(true);
  });

  it('매머드: 따뜻한 것이 없으면 안내만, 모닥불(F)은 나무 5개', () => {
    const p = spot('ice-mammoth');
    game.player.teleport(p.x, p.z);
    game.interact('secrets:mammoth', { force: true });
    expect(game.ext.secrets.mammoth()).toMatchObject({ phase: 'frozen', heat: 0 });
    expect(game.ui.toasts.at(-1)).toContain('따뜻한');
    game.interact('secrets:campfire', { force: true });
    expect(game.ext.secrets.mammoth().phase).toBe('frozen');
    game.state.addItem('m_wood', 5);
    game.interact('secrets:campfire', { force: true });
    expect(game.ext.secrets.mammoth()).toMatchObject({ phase: 'thawing', fire: true });
    expect(game.state.bag.m_wood ?? 0).toBe(0);
  });

  it('하루 한 번 줍기 · 아침 금상자 · 눈사태 파기', () => {
    const lava = spot('dino-lava-garden');
    game.player.teleport(lava.x, lava.z);
    game.interact('secrets:lava-pick', { force: true });
    expect(game.state.bag.m_volcanic).toBe(2);
    game.interact('secrets:lava-pick', { force: true });
    expect(game.state.bag.m_volcanic).toBe(2);
    // 낮에는 금상자 없음 → 아침에 한 번
    const coins0 = game.state.coins;
    game.interact('secrets:beach-chest', { force: true });
    expect(game.state.coins).toBe(coins0);
    game.env!.setHour(6);
    game.interact('secrets:beach-chest', { force: true });
    expect(game.state.coins).toBeGreaterThan(coins0);
    const c1 = game.state.coins;
    game.interact('secrets:beach-chest', { force: true });
    expect(game.state.coins).toBe(c1);
    // 눈사태: 삽 없으면 안내 · 있으면 파고 상자
    game.econ = { isUnlocked: (k: string) => k !== 'tool:shovel', requirement: () => ({ ok: false, text: '삽이 필요해요' }) } as never;
    game.interact('secrets:aval:0', { force: true });
    expect(game.ui.toasts.at(-1)).toContain('삽');
    game.econ = null;
    game.interact('secrets:aval:1', { force: true });
    expect(game.player.locked).toBe(true);
    game.tick(1 / 10, 12);
    expect(game.player.locked).toBe(false);
    const st = game.state.flags.secrets as { aval: { dug: number[] } };
    expect(st.aval.dug).toEqual([1]);
    expect(AVALANCHE_MOUNDS).toBe(4);
  });

  it('요정 선물은 보름마다 한 번', () => {
    game.env!.gameSec = 3 * DAY_SEC + 23 * HOUR_SEC;
    game.env!.advance(0);
    const fr = spot('home-fairy-ring');
    game.player.teleport(fr.x, fr.z);
    game.interact('secrets:fairy', { force: true });
    expect(game.state.bag.m_glowcap).toBe(3);
    game.interact('secrets:fairy', { force: true });
    expect(game.state.bag.m_glowcap).toBe(3);
    game.env!.advance(MOON_DAYS * DAY_SEC);
    expect(game.env!.fullMoon).toBe(true);
    game.interact('secrets:fairy', { force: true });
    expect(game.state.bag.m_glowcap).toBe(6);
  });

  it('오로라 동굴 문: 닫혀 있으면 안내, 오로라면 들어간다', () => {
    game.interact('secrets:door:ice-aurora-cave', { force: true });
    expect(ix.current()).toBeNull();
    expect(game.ui.toasts.at(-1)).toContain('오로라');
    game.env!.forceWeather('ice', 'aurora');
    game.interact('secrets:door:ice-aurora-cave', { force: true });
    expect(ix.current()).toBe('secrets:ice-aurora-cave');
    // 안에서 하루 얼음 결정
    game.interact('secrets:room-daily:aurora', { force: true });
    expect(game.state.bag.m_icecrystal).toBe(3);
    game.interact('secrets:room-exit:aurora', { force: true });
    expect(ix.current()).toBeNull();
  });

  it('거품동굴 웅덩이 → 해저 거품동굴 → 위로', () => {
    ix.enter('secrets:dino-bubble-cave');
    game.interact('secrets:room-pool', { force: true });
    expect(ix.current()).toBe('secrets:dino-bubble-dive');
    game.interact('secrets:room-exit:dive', { force: true });
    expect(ix.current()).toBe('secrets:dino-bubble-cave');
  });
});
