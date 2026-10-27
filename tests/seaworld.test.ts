// 바다 이벤트(seaworld): 해류 띠 방향·세기·폭(40 m) · 소용돌이 흐름 · 일정표(유령선 = 밤 + 안개, 고래 창·금요일 확정·분수 박자) ·
// 표류·소용돌이·해적 상자 결정성 · 돌고래 경주 상태 기계 · 갈매기 도둑 고르기 · 블랙박스는 secret-found 를 한 번만.
// 마지막 묶음은 가짜 게임(tests/kit)에 모듈을 통째로 띄워 ext.currents·geo.currentAt·블랙박스·토요일 해적 상자를 본다.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { stubLocalStorage } from './kit/storage';
import { makeFakeGame, makeCtx, recordEvents } from './kit/fakeGame';
import buildSeaworld from '../src/modules/seaworld';
import {
  CurrentField, CURRENT_PATH, BAND_HALF, CURRENT_SPEED, WHIRL, WHIRL_RING, smoothLoop,
  ghostSurfaced, whaleWindows, whaleActive, whalePhase, whaleCoins, isWhaleRoadDay, isPirateDay, WHALE_CYCLE,
  driftChests, driftPos, DRIFT_N, whirlChests, whirlAngle, pirateChests, PIRATE_N,
  newRace, stepRace, RACE_SEC, RACE_GRACE, RACE_ARRIVE, raceCoins,
  pickStealable, readSeaFlags, rollSeaDay, takeBlackBox, roadNearest,
} from '../src/modules/seaworld/logic';
import type { GeoApi } from '../src/core/api';

beforeEach(() => { stubLocalStorage(); });

const F = new CurrentField(CURRENT_PATH);
/** 첫 곧은 구간((0,120)→(900,1050)) 한가운데 — 모서리 둥글림과 멀다 */
const A = CURRENT_PATH[0], B = CURRENT_PATH[1];
const L = Math.hypot(B.x - A.x, B.z - A.z);
const TX = (B.x - A.x) / L, TZ = (B.z - A.z) / L;
const MID = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
/** 진행 방향 기준 옆으로 d m */
const off = (d: number) => ({ x: MID.x - TZ * d, z: MID.z + TX * d });

describe('해류 고속도로 — currentAt', () => {
  it('가운데에서는 진행 방향(시계 방향 고리 순서)으로 8 m/s', () => {
    const c = F.at(MID.x, MID.z)!;
    expect(c).not.toBeNull();
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(CURRENT_SPEED, 3);
    // 방향 = 경로 순서((0,120) → (900,1050))
    expect((c.x * TX + c.z * TZ) / Math.hypot(c.x, c.z)).toBeGreaterThan(0.999);
    expect(F.onBand(MID.x, MID.z)).toBe(true);
  });
  it('폭 40 m: 가장자리로 갈수록 약해지고, 20 m 밖은 null', () => {
    const s = (d: number) => { const p = off(d); const c = F.at(p.x, p.z); return c ? Math.hypot(c.x, c.z) : null; };
    expect(s(8)).toBeCloseTo(CURRENT_SPEED, 3);
    expect(s(-8)).toBeCloseTo(CURRENT_SPEED, 3);
    const s15 = s(15)!, s19 = s(19)!;
    expect(s15).toBeGreaterThan(0.5);
    expect(s15).toBeLessThan(CURRENT_SPEED);
    expect(s19).toBeLessThan(s15);
    expect(s(-19)).not.toBeNull();
    expect(s(BAND_HALF + 1)).toBeNull();
    expect(s(-(BAND_HALF + 1))).toBeNull();
    expect(F.onBand(off(19.5).x, off(19.5).z)).toBe(true);
    expect(F.onBand(off(21).x, off(21).z)).toBe(false);
    // 섬 한가운데·먼 바다는 해류 없음
    expect(F.at(-120, -560)).toBeNull();
    expect(F.at(3500, 3500)).toBeNull();
  });
  it('모든 구간이 경로 순서대로 흐르고, 고리는 닫혀 있다', () => {
    for (let i = 0; i < CURRENT_PATH.length; i++) {
      const p = CURRENT_PATH[i], q = CURRENT_PATH[(i + 1) % CURRENT_PATH.length];
      const m = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
      const l = Math.hypot(q.x - p.x, q.z - p.z);
      const c = F.at(m.x, m.z)!;
      expect(c, `구간 ${i}`).not.toBeNull();
      expect((c.x * (q.x - p.x) + c.z * (q.z - p.z)) / l / Math.hypot(c.x, c.z)).toBeGreaterThan(0.99);
    }
    const a = F.pointAt(0), b = F.pointAt(F.length);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
    // 꺾인 선 길이(약 11.8 km)보다 조금 짧다(모서리 둥글림)
    expect(F.length).toBeGreaterThan(11000);
    expect(F.length).toBeLessThan(11850);
    // 샘플 간격 ~10 m
    const sm = smoothLoop(CURRENT_PATH);
    for (let i = 0; i < sm.length; i++) {
      const j = (i + 1) % sm.length;
      expect(Math.hypot(sm[j].x - sm[i].x, sm[j].z - sm[i].z)).toBeLessThan(12);
    }
  });
  it('모서리(둥글린 곳)에서도 띠가 끊기지 않는다', () => {
    for (let s = 0; s < F.length; s += 37) {
      const p = F.pointAt(s);
      const c = F.at(p.x, p.z);
      expect(c, `s=${s}`).not.toBeNull();
      expect(Math.hypot(c!.x, c!.z)).toBeGreaterThan(CURRENT_SPEED * 0.99);
    }
  });
  it('땅·얕은 물(fade 0)에서는 해류가 끊긴다', () => {
    const G = new CurrentField(CURRENT_PATH, () => 0);
    expect(G.at(MID.x, MID.z)).toBeNull();
    expect(G.onBand(MID.x, MID.z)).toBe(false);
    const H = new CurrentField(CURRENT_PATH, () => 0.5);
    expect(Math.hypot(H.at(MID.x, MID.z)!.x, H.at(MID.x, MID.z)!.z)).toBeCloseTo(CURRENT_SPEED / 2, 3);
  });
  it('소용돌이: 고리에서 시계 반대로 돌고, 바깥은 안으로·안쪽은 밖으로 모인다', () => {
    const ring = WHIRL.r * WHIRL_RING;
    const c = F.at(WHIRL.x + ring, WHIRL.z)!; // 동쪽 → 접선 = +z
    expect(c.z).toBeGreaterThan(4);
    expect(Math.abs(c.x)).toBeLessThan(0.5);
    const out = F.at(WHIRL.x + WHIRL.r * 1.3, WHIRL.z)!;
    expect(out.x).toBeLessThan(0);
    const inn = F.at(WHIRL.x + ring * 0.4, WHIRL.z)!;
    expect(inn.x).toBeGreaterThan(0);
    expect(F.at(WHIRL.x + WHIRL.r * 1.7, WHIRL.z)).toBeNull();
    for (let a = 0; a < 6.28; a += 0.3) for (const r of [10, 30, 48, 70, 90]) {
      const v = F.at(WHIRL.x + Math.cos(a) * r, WHIRL.z + Math.sin(a) * r)!;
      expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(8);
    }
  });
});

describe('일정표', () => {
  it('유령선은 밤(21~05) + 안개일 때만', () => {
    expect(ghostSurfaced(23, 'fog')).toBe(true);
    expect(ghostSurfaced(2.5, 'fog')).toBe(true);
    expect(ghostSurfaced(21, 'fog')).toBe(true);
    expect(ghostSurfaced(5, 'fog')).toBe(false);
    expect(ghostSurfaced(12, 'fog')).toBe(false);
    expect(ghostSurfaced(19, 'fog')).toBe(false);
    for (const w of ['clear', 'rain', 'storm', 'meteor', 'snow', 'aurora']) expect(ghostSurfaced(23, w)).toBe(false);
  });
  it('고래: 평일은 아침 06~08 창 + 하루 두 창(결정적), 금요일은 하루 종일', () => {
    for (let day = 0; day < 21; day++) {
      const ws = whaleWindows(day);
      expect(whaleWindows(day)).toEqual(ws);
      if (isWhaleRoadDay(day)) {
        expect(ws).toEqual([{ from: 0, to: 24 }]);
        for (let h = 0; h < 24; h += 0.5) expect(whaleActive(day, h)).toBe(true);
        continue;
      }
      expect(ws.length).toBe(3);
      expect(whaleActive(day, 7)).toBe(true);
      expect(whaleActive(day, 3)).toBe(false);
      expect(whaleActive(day, 23)).toBe(false);
      for (const w of ws) { expect(w.to - w.from).toBeGreaterThan(0); expect(w.from).toBeGreaterThanOrEqual(6); expect(w.to).toBeLessThanOrEqual(21); }
      // 창끼리 겹치지 않는다
      const s = [...ws].sort((a, b) => a.from - b.from);
      for (let i = 1; i < s.length; i++) expect(s[i].from).toBeGreaterThanOrEqual(s[i - 1].to);
      // 하루에 떠 있는 시간 = 2 + 1.5 + 1.5
      let up = 0;
      for (let h = 0; h < 24; h += 0.05) if (whaleActive(day, h)) up += 0.05;
      expect(up).toBeCloseTo(5, 0);
    }
    // 달력 모듈이 고래 길을 알려 주면 금요일이 아니어도 하루 종일
    expect(whaleActive(0, 3, true)).toBe(true);
    expect(isWhaleRoadDay(4)).toBe(true);
    expect(isPirateDay(5)).toBe(true);
    expect(isPirateDay(12)).toBe(true);
  });
  it('고래 숨쉬기: 16초 한 바퀴, 2.5~6.5초 물 뿜기, 코인은 날·횟수마다 결정적(금요일 ×2)', () => {
    expect(whalePhase(3).spouting).toBe(true);
    expect(whalePhase(1).spouting).toBe(false);
    expect(whalePhase(8).spouting).toBe(false);
    expect(whalePhase(3 + WHALE_CYCLE).cycle).toBe(1);
    expect(whalePhase(12).surf).toBe(0);
    expect(whalePhase(5).surf).toBeCloseTo(1, 5);
    expect(whaleCoins(3, 0)).toBe(whaleCoins(3, 0));
    expect(whaleCoins(4, 0)).toBe(2 * whaleCoins(4, 0, false));
    for (let n = 0; n < 5; n++) { const c = whaleCoins(10, n, false); expect(c).toBeGreaterThanOrEqual(300); expect(c).toBeLessThanOrEqual(650); }
  });
  it('고래 길은 원점 앞바다 ↔ 모래시계섬 서쪽', () => {
    const r = roadNearest(1100, 520);
    expect(r.d).toBeLessThan(10);
    expect(r.u).toBeGreaterThan(0.4);
    expect(r.u).toBeLessThan(0.6);
  });
});

describe('상자', () => {
  const sea = (x: number, z: number) => Math.hypot(x, z) > 900 && Math.abs(x) < 3400;
  it('표류 상자: 같은 날이면 같은 자리·등급, 날이 바뀌면 새로', () => {
    const a = driftChests(7, sea), b = driftChests(7, sea), c = driftChests(8, sea);
    expect(a).toEqual(b);
    expect(a.length).toBe(DRIFT_N);
    expect(a.map((x) => `${x.x},${x.z}`)).not.toEqual(c.map((x) => `${x.x},${x.z}`));
    expect(new Set(a.map((x) => x.id)).size).toBe(DRIFT_N);
    for (const x of a) {
      expect(sea(x.x, x.z)).toBe(true);
      expect(['wood', 'silver', 'gold']).toContain(x.tier);
      for (const y of a) if (y !== x) expect(Math.hypot(x.x - y.x, x.z - y.z)).toBeGreaterThanOrEqual(250);
      for (const gs of [0, 33, 1000, 99999]) {
        const p = driftPos(x, gs);
        expect(Math.hypot(p.x - x.x, p.z - x.z)).toBeCloseTo(8, 5);
        expect(driftPos(x, gs)).toEqual(p);
      }
    }
    // 바다가 하나도 없으면 빈 목록(무한 반복 없음)
    expect(driftChests(1, () => false)).toEqual([]);
  });
  it('소용돌이 상자 4개는 고리 위를 돌고, 토요일엔 해적 은상자 3개', () => {
    const w = whirlChests(3);
    expect(w).toEqual(whirlChests(3));
    expect(w.length).toBe(4);
    expect(whirlAngle(w[0], 100)).toBeGreaterThan(whirlAngle(w[0], 0));
    expect(pirateChests(5).length).toBe(PIRATE_N);
    expect(pirateChests(4)).toEqual([]);
    expect(pirateChests(4, true).length).toBe(PIRATE_N);
    expect(pirateChests(12)).toEqual(pirateChests(12));
  });
});

describe('돌고래 경주 · 갈매기 도둑', () => {
  const run = (s: ReturnType<typeof newRace>, ok: boolean, sec: number, allowed = true) => {
    const ev: string[] = [];
    for (let t = 0; t < sec - 1e-9; t += 0.1) { const e = stepRace(s, ok, 0.1, allowed); if (e) ev.push(e); }
    return ev;
  };
  it('나란히 20초면 이기고, 놓치면 2.5초 기다렸다 떨어져 나간다', () => {
    const s = newRace();
    expect(run(s, true, RACE_ARRIVE + 0.15)).toEqual(['start']);
    expect(run(s, true, RACE_SEC - 0.5)).toEqual([]);
    expect(run(s, true, 0.7)).toEqual(['win']);
    expect(s.mode).toBe('rest');
    // 쉬는 동안엔 다시 안 붙는다
    expect(run(s, true, 30)).toEqual([]);
    const s2 = newRace();
    run(s2, true, RACE_ARRIVE + 0.15);
    run(s2, true, 10);
    expect(run(s2, false, RACE_GRACE - 0.3)).toEqual([]);
    expect(run(s2, false, 0.5)).toEqual(['lost']);
    // 잠깐 놓쳤다 다시 붙으면 이어 간다
    const s3 = newRace();
    run(s3, true, RACE_ARRIVE + 0.15);
    run(s3, true, 10);
    run(s3, false, 1.5);
    expect(run(s3, true, 10.2)).toEqual(['win']);
    // 오늘 보상이 끝났으면 떼가 오지 않는다
    expect(run(newRace(), true, 5, false)).toEqual([]);
    expect(raceCoins(2, 1)).toBe(raceCoins(2, 1));
  });
  it('갈매기는 물고기만, 변이(반짝이·왕관·꼬마)는 건드리지 않는다', () => {
    const fish = (k: string) => (k.startsWith('f_') ? { rarity: k === 'f_rare' ? 5 : 1 } : null);
    const bag = { m_wood: 5, 'f_carp@crown': 1, f_carp: 2, f_rare: 1, b_bee: 3 };
    const seen = new Set<string>();
    let r = 0.0;
    for (let i = 0; i < 40; i++) { r = (i + 0.5) / 40; seen.add(pickStealable(bag, fish, () => r)!); }
    expect([...seen].sort()).toEqual(['f_carp', 'f_rare']);
    expect(pickStealable({ m_wood: 3, 'f_carp@shiny': 1 }, fish, () => 0.5)).toBeNull();
    expect(pickStealable({}, fish, () => 0.5)).toBeNull();
  });
});

describe('저장 · 블랙박스', () => {
  it('flags.seaworld 를 깨끗하게 읽고, 날이 바뀌면 오늘 기록만 비운다', () => {
    const flags: Record<string, unknown> = { seaworld: { day: 3, opened: ['drift:3:0', 7], whaleN: 2, blackbox: true, rode: 1200, gull: 5 } };
    const f = readSeaFlags(flags);
    expect(flags.seaworld).toBe(f);
    expect(f.opened).toEqual(['drift:3:0']);
    expect(f.gull).toBeNull();
    expect(rollSeaDay(f, 3)).toBe(false);
    expect(rollSeaDay(f, 4)).toBe(true);
    expect(f.opened).toEqual([]);
    expect(f.whaleN).toBe(0);
    expect(f.blackbox).toBe(true);
    expect(f.rode).toBe(1200);
    expect(readSeaFlags({}).day).toBe(-1);
  });
  it('블랙박스: 가방에 한 번, secret-found launch-probe 는 딱 한 번', () => {
    const f = readSeaFlags({});
    const emits: unknown[] = [];
    let full = true, given = 0;
    const io = { give: (_id: string, n: number) => (full ? 0 : (given += n, n)), emit: (e: unknown) => { emits.push(e); } };
    expect(takeBlackBox(f, io)).toBe('full');
    expect(emits).toEqual([]);
    full = false;
    expect(takeBlackBox(f, io)).toBe('taken');
    expect(takeBlackBox(f, io)).toBe('already');
    expect(takeBlackBox(f, io)).toBe('already');
    expect(given).toBe(1);
    expect(emits).toEqual([{ type: 'secret-found', id: 'launch-probe' }]);
  });
});

describe('모듈(가짜 게임)', () => {
  const geoStub = (): GeoApi => ({
    zoneAt: () => ({ island: null, theme: 'sea', zone: 'offshore', sea: 'offshore' }),
    islandName: (id) => id, landmarks: [], addLandmark() {}, discovered: () => false, currentAt: () => null,
  });
  async function boot(o: { day?: number; hour?: number } = {}) {
    const game = makeFakeGame({ load: false, day: o.day ?? 0, hour: o.hour ?? 12 });
    game.geo = geoStub();
    const ctx = makeCtx(game);
    const root = (await buildSeaworld(ctx as never)) as THREE.Object3D;
    return { game, ctx, root, hooks: root.userData.hooks as Record<string, (...a: unknown[]) => unknown> };
  }
  it('ext.currents 와 geo.currentAt 을 채운다', async () => {
    const { game } = await boot();
    const c = game.ext.currents;
    expect(typeof c.at).toBe('function');
    expect(typeof c.onBand).toBe('function');
    const v = game.geo!.currentAt(MID.x, MID.z)!;
    expect(Math.hypot(v.x, v.z)).toBeGreaterThan(7.9);
    expect(c.onBand(MID.x, MID.z)).toBe(true);
    expect(game.geo!.currentAt(-120, -560)).toBeNull();
    expect(game.chunks.keys()).toEqual(expect.arrayContaining(['seaworld-band', 'seaworld-flyfish', 'seaworld-places']));
    // 띠 청크는 같은 칸을 두 번 지어도 같다
    const cx = Math.floor(MID.x / 256), cz = Math.floor(MID.z / 256);
    expect(game.chunks.signature('seaworld-band', cx, cz)).toBe(game.chunks.signature('seaworld-band', cx, cz));
    expect(game.chunks.layer('seaworld-flyfish')!.detail).toBe(true);
  });
  it('블랙박스는 secret-found 를 한 번만, 가방엔 it_blackbox 하나', async () => {
    const { game, hooks } = await boot();
    const ev = recordEvents(game);
    expect(hooks.takeBlackBox()).toBe('taken');
    expect(hooks.takeBlackBox()).toBe('already');
    const found = ev.events.filter((e) => e.type === 'secret-found');
    expect(found).toEqual([expect.objectContaining({ type: 'secret-found', id: 'launch-probe' })]);
    expect(game.state.bag.it_blackbox).toBe(1);
    expect((game.state.flags.seaworld as { blackbox: boolean }).blackbox).toBe(true);
  });
  it('토요일엔 유령선 둘레에 해적 은상자, 평일엔 없다 · 표류 상자 10개', async () => {
    const sat = await boot({ day: 5 });
    const list = sat.hooks.chests() as Array<{ kind: string; tier: string }>;
    expect(list.filter((c) => c.kind === 'pirate').length).toBe(PIRATE_N);
    expect(list.filter((c) => c.kind === 'pirate').every((c) => c.tier === 'silver')).toBe(true);
    expect(list.filter((c) => c.kind === 'drift').length).toBe(DRIFT_N);
    expect(list.filter((c) => c.kind === 'whirl').length).toBe(4);
    const mon = await boot({ day: 7 });
    expect((mon.hooks.chests() as Array<{ kind: string }>).filter((c) => c.kind === 'pirate').length).toBe(0);
  });
  it('유령선 일정: 낮엔 안 뜨고 밤 + 안개면 뜬다', async () => {
    const { game, hooks } = await boot({ hour: 12 });
    game.env!.forceWeather('*', 'fog');
    game.tick(1 / 60, 2);
    expect((hooks.state() as { ghostUp: boolean }).ghostUp).toBe(false);
    game.env!.setHour(23);
    game.tick(0.6, 2);
    expect((hooks.state() as { ghostUp: boolean }).ghostUp).toBe(true);
    game.env!.forceWeather('*', 'clear');
    game.tick(0.6, 2);
    expect((hooks.state() as { ghostUp: boolean }).ghostUp).toBe(false);
  });
  it('수영하면 해류 따라 떠내려간다(0.5배)', async () => {
    const { game } = await boot();
    game.player.pos.set(MID.x, -0.3, MID.z);
    game.player.mode = 'swim';
    game.tick(0.1, 10);
    const dx = game.player.pos.x - MID.x, dz = game.player.pos.z - MID.z;
    expect(Math.hypot(dx, dz)).toBeCloseTo(CURRENT_SPEED * 0.5 * 1.0, 0);
    expect((dx * TX + dz * TZ) / Math.hypot(dx, dz)).toBeGreaterThan(0.99);
  });
  it('갈매기 도둑: 물고기 한 마리 들고 가고, 가까이 가면 돌려준다', async () => {
    const { game, hooks } = await boot();
    game.state.register([{ id: 'f_test', name: '테스트붕어', category: 'fish', rarity: 1 }]);
    game.state.addItem('f_test', 2);
    expect(hooks.gull()).toBe(true);
    expect(game.state.bag.f_test).toBe(1);
    expect((game.state.flags.seaworld as { gull: string }).gull).toBe('f_test');
    // 가만히 서 있으면 못 잡는다(달아나는 원은 플레이어에게서 멀어진다)
    const T = (hooks.state() as { thief: string }).thief;
    expect(T).toBe('swoop');
    for (let i = 0; i < 90; i++) game.tick(1 / 30);
    expect(game.state.bag.f_test).toBe(1);
    // 달리기(7 m/s)로 쫓아가면 되찾는다
    let back = false;
    for (let i = 0; i < 900 && !back; i++) {
      const gp = (hooks.state() as { gullPos: THREE.Vector3 }).gullPos;
      const p = game.player.pos, dx = gp.x - p.x, dz = gp.z - p.z, l = Math.hypot(dx, dz) || 1;
      p.x += (dx / l) * 7 / 30; p.z += (dz / l) * 7 / 30;
      game.tick(1 / 30);
      back = (game.state.bag.f_test ?? 0) === 2;
    }
    expect(back).toBe(true);
    expect(game.state.bag.m_feather).toBe(1);
    expect((game.state.flags.seaworld as { gull: string | null }).gull).toBeNull();
  });
});
