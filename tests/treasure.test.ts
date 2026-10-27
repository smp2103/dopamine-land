// treasure — 화석 X 하루 개수·결정성, 삽 잠금, 병편지 비율, 풍선 시간표, 보물지도 목적지(땅), 터뜨린 풍선 수, 일요일 크레이터 ×2.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import buildTreasure from '../src/modules/treasure';
import { rngFor } from '../src/core/rng';
import { ISLANDS } from '../src/core/world';
import {
  MAIN_ISLANDS, ISLETS, planDigs, xCount, rollBottle, nearLaunch, balloonPlan, balloonXZ, BALLOON_ALT, pickMapTarget, islandSampler,
  craterCounts, planCrater, rollDig, fossilChance, ensureFlags, rollDay, inSlingCone, bottleShare, planBeach, planSeabed, planFeathers,
  coastPoint, SLING_RANGE,
} from '../src/modules/treasure/logic';

// ───────────── 순수 계산 ─────────────
describe('화석 X 하루 계획', () => {
  it('공룡섬 12개, 다른 큰 섬 4개 — 마른 땅 위', () => {
    for (const day of [0, 1, 5]) {
      for (const isl of MAIN_ISLANDS) {
        const xs = planDigs(day, isl);
        expect(xs.length, `${isl} day ${day}`).toBe(isl === 'dino' ? 12 : 4);
        expect(xs.length).toBe(xCount(isl));
        for (const s of xs) {
          const g = islandSampler(s.x, s.z);
          expect(g.island).toBe(isl);
          expect(g.coast).toBeGreaterThan(4);
          expect(g.wet).toBe(false);
          expect(['cliff', 'lava', 'river', 'sea']).not.toContain(g.kind);
        }
        expect(new Set(xs.map((s) => s.id)).size).toBe(xs.length);
      }
    }
  });
  it('같은 날은 언제 물어도 같고, 날이 바뀌면 자리가 바뀐다', () => {
    const a = planDigs(3, 'dino'), b = planDigs(3, 'dino'), c = planDigs(4, 'dino');
    expect(a).toEqual(b);
    expect(a.map((s) => `${s.x},${s.z}`)).not.toEqual(c.map((s) => `${s.x},${s.z}`));
    expect(a[0].id).toBe('x:3:dino:0');
  });
  it('파기 굴림: 공룡섬 화석 약 70%, 다른 섬 약 35% · 화석 담당이 없으면 호박/돌', () => {
    const fos = (_r: () => number) => 'fos_trike_skull';
    for (const isl of ['dino', 'home'] as const) {
      let n = 0;
      const N = 4000;
      for (let i = 0; i < N; i++) if (rollDig(rngFor(`d:${isl}:${i}`), isl, fos).kind === 'fossil') n++;
      expect(Math.abs(n / N - fossilChance(isl))).toBeLessThan(0.03);
    }
    const ids = new Set<string>();
    for (let i = 0; i < 3000; i++) { const o = rollDig(rngFor(`nf:${i}`), 'home', null); expect(o.kind).not.toBe('fossil'); ids.add(o.id); }
    for (const id of ['m_amber', 'm_stone', 't_tire', 'bait_worm', 'key:silver']) expect(ids.has(id), id).toBe(true);
  });
});

describe('병편지', () => {
  it('보물지도 60 · 레시피 25 · 주민 사연 15', () => {
    const c: Record<string, number> = { map: 0, recipe: 0, letter: 0, space: 0 };
    const N = 20000;
    for (let i = 0; i < N; i++) c[rollBottle(rngFor(`b:${i}`), false)]++;
    expect(c.space).toBe(0);
    expect(Math.abs(c.map / N - 0.6)).toBeLessThan(0.015);
    expect(Math.abs(c.recipe / N - 0.25)).toBeLessThan(0.015);
    expect(Math.abs(c.letter / N - 0.15)).toBeLessThan(0.015);
  });
  it('별똥별섬 근처는 5% 우주에서 온 편지', () => {
    let s = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (rollBottle(rngFor(`L:${i}`), true) === 'space') s++;
    expect(Math.abs(s / N - 0.05)).toBeLessThan(0.008);
    const L = ISLANDS.find((d) => d.id === 'launch')!;
    expect(nearLaunch(L.x + L.r + 100, L.z)).toBe(true);
    expect(nearLaunch(0, 0)).toBe(false);
  });
  it('해변 병편지는 하루 6~10개(말랑섬 2개 이상), 실제로 해변 모래 위', () => {
    for (let day = 0; day < 20; day++) {
      const share = bottleShare(day);
      const tot = Object.values(share).reduce((a, b) => a + b, 0);
      expect(tot).toBeGreaterThanOrEqual(6);
      expect(tot).toBeLessThanOrEqual(10);
      expect(share.home).toBeGreaterThanOrEqual(2);
    }
    const home = planBeach(2, 'home').filter((s) => s.kind === 'bottle');
    expect(home.length).toBe(bottleShare(2).home);
    for (const s of home) { const g = islandSampler(s.x, s.z); expect(g.island).toBe('home'); expect(g.wet).toBe(false); expect(g.coast).toBeGreaterThan(0); }
  });
});

describe('보물지도 목적지', () => {
  it('쪼꼬미섬 하나의 마른 땅', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const t = pickMapTarget(rngFor(`map:${i}`));
      expect(ISLETS).toContain(t.islet);
      const g = islandSampler(t.x, t.z);
      expect(g.island).toBe(t.islet);
      expect(g.coast).toBeGreaterThan(0);
      expect(g.wet).toBe(false);
      seen.add(t.islet);
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});

describe('풍선 선물 시간표', () => {
  it('큰 섬마다 게임 1시간에 하나, 땅 위 8~20 m, 결정적', () => {
    for (const isl of MAIN_ISLANDS) {
      const keys = new Set<string>();
      for (let h = 0; h < 24; h++) {
        const b = balloonPlan(2, h + 0.4, isl)!;
        expect(b.key).toBe(`balloon:2:${h}:${isl}`);
        expect(b).toEqual(balloonPlan(2, h + 0.9, isl));
        expect(b.alt).toBeGreaterThanOrEqual(BALLOON_ALT.min);
        expect(b.alt).toBeLessThanOrEqual(BALLOON_ALT.max);
        const g = islandSampler(b.x0, b.z0);
        expect(g.island).toBe(isl);
        keys.add(b.key);
      }
      expect(keys.size).toBe(24);
    }
    const b = balloonPlan(0, 9, 'home')!;
    const p0 = balloonXZ(b, 0), p1 = balloonXZ(b, 75);
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeCloseTo(b.speed * 75, 3);
  });
  it('새총 원뿔: 25 m 안, 카메라 앞쪽만', () => {
    const eye = { x: 0, y: 1, z: 0 }, fwd = { x: 0, z: -1 };
    expect(inSlingCone(eye, { x: 0, y: 12, z: -15 }, fwd)).toBe(true);
    expect(inSlingCone(eye, { x: 0, y: 12, z: 15 }, fwd)).toBe(false);
    expect(inSlingCone(eye, { x: 0, y: 12, z: -SLING_RANGE }, fwd)).toBe(false);
    expect(inSlingCone(eye, { x: 1, y: 10, z: 1 }, fwd)).toBe(true); // 바로 머리 위
  });
});

describe('하루 줍기', () => {
  it('크레이터: 별가루 3 · 운석 2, 일요일 ×2', () => {
    expect(craterCounts(0)).toEqual({ stardust: 3, meteor: 2 });
    expect(craterCounts(6)).toEqual({ stardust: 6, meteor: 4 });
    const mon = planCrater(7, 0), sun = planCrater(6, 6);
    expect(mon.filter((s) => s.kind === 'stardust').length).toBe(3);
    expect(mon.filter((s) => s.kind === 'meteor').length).toBe(2);
    expect(sun.filter((s) => s.kind === 'stardust').length).toBe(6);
    expect(sun.filter((s) => s.kind === 'meteor').length).toBe(4);
    for (const s of sun) { expect(islandSampler(s.x, s.z).wet).toBe(false); expect(s.island).toBe('launch'); }
  });
  it('조개(해변)·깃털(공룡섬·별똥별섬)·해저 거품(물속)', () => {
    const shells = planBeach(1, 'coral').filter((s) => s.kind === 'shell');
    expect(shells.length).toBeGreaterThanOrEqual(8);
    expect(shells.every((s) => s.item === 'm_shell')).toBe(true);
    expect(planFeathers(1, 'dino').length).toBe(6);
    expect(planFeathers(1, 'launch').length).toBe(5);
    expect(planFeathers(1, 'home').length).toBe(0);
    const sea = planSeabed(1);
    expect(sea.length).toBeGreaterThanOrEqual(12);
    for (const s of sea) { expect(s.dive).toBe(true); expect(islandSampler(s.x, s.z).coast).toBeLessThan(0); expect(s.y).toBeLessThan(0); }
    expect(sea.some((s) => s.kind === 'coral')).toBe(true);
  });
  it('해안 점 찾기', () => {
    const p = coastPoint('home', -Math.PI / 2, 6);
    expect(p).not.toBeNull();
    expect(Math.abs(p!.g.coast - 6)).toBeLessThan(1.3);
  });
  it('flags: 깨진 값은 기본값, 날이 바뀌면 그날 목록만 비운다', () => {
    const f = ensureFlags({ popped: 3, taken: ['a', 5], maps: { 1: { islet: 'islet-a', x: 1, z: 2, y: 0, got: 0 }, 2: 'x' }, day: 4 });
    expect(f.popped).toBe(3);
    expect(f.taken).toEqual(['a']);
    expect(Object.keys(f.maps)).toEqual(['1']);
    expect(rollDay(f, 4)).toBe(false);
    expect(rollDay(f, 5)).toBe(true);
    expect(f.taken).toEqual([]);
    expect(f.popped).toBe(3);
    expect(Object.keys(f.maps)).toEqual(['1']);
  });
});

// ───────────── 모듈(가짜 게임) ─────────────
interface FakeEcon {
  unlocks: Set<string>;
  chests: Array<[string, string]>;
  given: Array<[string, number]>;
  stars: number;
  pieces: number;
}
function boot(o: { unlocks?: string[]; day?: number; hour?: number } = {}) {
  const game = makeFakeGame({ day: o.day ?? 0, hour: o.hour ?? 10 });
  const rec: FakeEcon = { unlocks: new Set(o.unlocks ?? []), chests: [], given: [], stars: 0, pieces: 0 };
  game.econ = {
    isUnlocked: (k: string) => rec.unlocks.has(k),
    requirement: (k: string) => ({ ok: rec.unlocks.has(k), text: '삽이 필요해요! 작업대에서 만들어요' }),
    unlock: (k: string) => { rec.unlocks.add(k); },
    give: (id: string, n: number) => { rec.given.push([id, n]); game.state.addItem(id, n); return n; },
    bag: { canAdd: () => true },
    openChest: (tier: string, where: string) => { rec.chests.push([tier, where]); return { tier, loot: [] }; },
    addKeyPiece: () => { rec.pieces++; },
    addStars: (n: number) => { rec.stars += n; },
    day: () => o.day ?? 0,
  } as unknown as FakeGame['econ'];
  const ctx = makeCtx(game);
  buildTreasure(ctx as never);
  game.tick(1 / 60, 2);
  return { game, rec, api: game.ext.treasure as ReturnType<typeof apiType> };
}
// ext.treasure 모양(테스트에서 쓰는 만큼)
const apiType = () => ({} as {
  digs(island?: string): Array<{ id: string; x: number; z: number; taken: boolean }>;
  balloons(): Array<{ key: string; island: string; x: number; y: number; z: number; popped: boolean; live: boolean }>;
  stats(): { popped: number; dug: number; picked: number; bottles: number; maps: number };
  maps(): Array<{ n: number; islet: string; x: number; z: number }>;
  spots(kind?: string): Array<{ id: string; kind: string; taken: boolean }>;
  debugSpawn(kind: string): unknown;
  openBottle(at?: { x: number; z: number }): { kind: string };
});

describe('treasure 모듈', () => {
  beforeEach(() => { stubLocalStorage(); });

  it('ext.treasure·창·디버그 훅을 단다', () => {
    const { game, api } = boot();
    expect(typeof api.digs).toBe('function');
    expect(game.hud.panel('letter')).not.toBeNull();
    expect(game.chunks.keys()).toEqual(expect.arrayContaining(['treasure-items', 'treasure-fx']));
    expect(game.chunks.layer('treasure-fx')!.detail).toBe(true);
    const w = (globalThis as { window?: { __treasure?: { spawn: unknown } } }).window;
    if (w) expect(w.__treasure?.spawn).toBeTypeOf('function');
    expect(api.digs('dino').length).toBe(12);
    expect(api.digs().length).toBe(12 + 4 * 6);
  });

  it('삽이 없으면 못 파고, 있으면 판다', () => {
    const { game, rec, api } = boot();
    const ev = recordEvents(game);
    const x = api.digs('home')[0];
    game.player.teleport(x.x + 0.5, x.z);
    game.tick(1 / 60, 1);
    const row = game.listInteractions().find((r) => r.id === 'treasure-dig');
    expect(row?.label).toContain('삽');
    expect(game.interact('treasure-dig')).toBe(true);
    game.tick(0.1, 15);
    expect(api.digs('home')[0].taken).toBe(false);
    expect(game.ui.toasts.some((t) => t.includes('삽'))).toBe(true);
    expect(ev.of('harvest')).toHaveLength(0);

    rec.unlocks.add('tool:shovel');
    expect(game.interact('treasure-dig')).toBe(true);
    expect(game.player.locked).toBe(true);
    game.tick(0.1, 12);
    expect(game.player.locked).toBe(false);
    expect(api.digs('home')[0].taken).toBe(true);
    const hv = (ev.events as Array<{ type: string; kind?: string }>).filter((e) => e.type === 'harvest');
    expect(hv.length).toBe(1);
    expect(hv[0].kind).toBe('dig');
    expect(api.stats().dug).toBe(1);
    // 같은 X 는 다시 안 나온다
    game.tick(1 / 60, 1);
    expect(game.listInteractions().find((r) => r.id === 'treasure-dig' && Math.abs(r.dist) < 0.6)).toBeUndefined();
    expect((game.state.flags.treasure as { taken: string[] }).taken).toContain(x.id);
  });

  it('새총으로 풍선을 맞히면 popped 가 오르고, 떨어진 선물을 열면 나무상자 + 풍선 조각', () => {
    const { game, rec, api } = boot({ unlocks: ['tool:slingshot'] });
    const ev = recordEvents(game);
    game.player.teleport(-60, -400);
    game.cam.yaw = 0; // 카메라 앞 = -z
    const b = api.debugSpawn('balloon') as { key: string; x: number; y: number; z: number };
    expect(b.key).toContain('dbg');
    game.tick(1 / 60, 2);
    const alt = game.listInteractions().find((r) => r.id === 'treasure-balloon');
    expect(alt?.key).toBe('KeyF');
    expect(alt?.priority).toBe(20);
    expect(alt?.label).toBe('새총으로 맞추기');
    game.interact('treasure-balloon');
    game.tick(0.05, 20);
    expect(api.stats().popped).toBe(1);
    expect((game.state.flags.treasure as { popped: number }).popped).toBe(1);
    expect(api.balloons().find((x) => x.key === b.key)).toBeUndefined();
    // 선물: 물리 몸체가 생겼다 → 5초 뒤 내려앉는다
    expect(game.physics.bodies.some((x) => String(x.opts.tag ?? '').startsWith('treasure-gift'))).toBe(true);
    game.tick(0.25, 24);
    const gifts = Object.values((game.state.flags.treasure as { gifts: Record<string, { x: number; z: number }> }).gifts);
    expect(gifts.length).toBe(1);
    game.player.teleport(gifts[0].x, gifts[0].z);
    game.tick(1 / 60, 1);
    expect(game.interact('treasure-gift')).toBe(true);
    expect(rec.chests[0][0]).toBe('wood');
    expect(rec.given).toContainEqual(['m_balloon_scrap', 1]);
    expect((ev.events as Array<{ type: string; kind?: string }>).some((e) => e.type === 'harvest' && e.kind === 'balloon')).toBe(true);
    // 새총이 없으면 F 가 안 뜬다
    rec.unlocks.delete('tool:slingshot');
    api.debugSpawn('balloon');
    game.tick(1 / 60, 2);
    expect(game.listInteractions().find((r) => r.id === 'treasure-balloon')).toBeUndefined();
  });

  it('지금 시간 풍선은 가까운 큰 섬마다 하나', () => {
    const { game, api } = boot({ hour: 13.3 });
    game.player.teleport(-120, -560);
    game.tick(0.3, 2);
    const list = api.balloons().filter((x) => x.island === 'home');
    expect(list.length).toBe(1);
    expect(list[0].key).toBe('balloon:0:13:home');
    const gy = Math.max(0, game.groundAt(list[0].x, list[0].z));
    expect(list[0].y - gy).toBeGreaterThan(BALLOON_ALT.min - 1);
  });

  it('병편지 → 보물지도 → 쪼꼬미섬 X 를 파면 금상자', () => {
    const { game, rec, api } = boot({ unlocks: ['tool:shovel'] });
    // 지도가 나올 때까지 연다(결정적)
    let v = api.openBottle({ x: 0, z: 0 });
    for (let i = 0; i < 20 && v.kind !== 'map'; i++) v = api.openBottle({ x: 0, z: 0 });
    expect(v.kind).toBe('map');
    expect(game.hud.current()?.kind ?? (game.hud as unknown as { pendingOpen(): { kind: string } | null }).pendingOpen()?.kind).toBe('letter');
    const m = api.maps()[0];
    expect(ISLETS).toContain(m.islet);
    expect(game.state.bag[`it_map_${m.n}`]).toBe(1);
    game.player.teleport(m.x + 0.4, m.z);
    game.tick(1 / 60, 1);
    const row = game.listInteractions().find((r) => r.id === 'treasure-dig');
    expect(row?.label).toContain('보물지도');
    game.interact('treasure-dig');
    game.tick(0.1, 25);
    expect(rec.chests.some(([t, w]) => t === 'gold' && w.startsWith('treasure-map:'))).toBe(true);
    expect(api.maps().length).toBe(0);
    expect(game.state.bag[`it_map_${m.n}`] ?? 0).toBe(0);
  });

  it('잠수 중에만 해저 거품을 줍는다', () => {
    const { game, api } = boot();
    game.player.teleport(0, 120);
    const s = api.debugSpawn('coral') as { x: number; z: number };
    game.player.teleport(s.x, s.z);
    game.tick(1 / 60, 1);
    expect(game.listInteractions().find((r) => r.id === 'treasure-dive')).toBeUndefined();
    game.player.mode = 'dive';
    game.tick(1 / 60, 1);
    expect(game.interact('treasure-dive')).toBe(true);
    expect(game.state.bag.m_coral).toBe(1);
  });

  it('일요일엔 크레이터 별가루가 두 배', () => {
    const { game, api } = boot({ day: 6 });
    expect(game.env!.weekday).toBe(6);
    expect(api.spots('stardust').length).toBe(6);
    expect(api.spots('meteor').length).toBe(4);
    const mon = boot({ day: 7 });
    expect(mon.api.spots('stardust').length).toBe(3);
  });
});

void THREE;

