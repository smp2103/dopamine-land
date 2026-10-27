// 행성 P1 — 행성마다 중력·가두기·땅 높이, 까만 도넛 일식 관문, 해금 사슬(앞 행성 방문 + 별), 미끄럼·튕김·가변 중력,
// 별공룡 친해지기 하트, 낚시 구역·시간 거르기. 화면 없이 가짜 게임(tests/kit)에 space + planets 를 띄워 여행·도착·해금 이벤트까지 본다.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import buildSpace from '../src/modules/space';
import buildPlanets from '../src/modules/planets';
import { SPACE_ORIGIN } from '../src/core/game';
import {
  PLANETS, PLANET_BY_ID, PLANET_ORDER, PLANET_GAP, HEIGHTS, planetOrigin, gravityAccel, clampLocal, travelCheck, travelWhyText, planetKey,
  donutGravity, slideBlend, bounceVel, FROST_FRICTION, feedSaur, STARSAURUS_MAX, fishZoneAt, zonePool, timeOk, spaceMeteor, whenOk,
  SUGAR_RING, onSugarRing, JELLY_SEA, CLOUD_ISLES, onCloudSea, beltRocks, rockTopAt, DONUT, STATION, type TravelState,
} from '../src/modules/planets/logic';
import { surfStep, SURF } from '../src/modules/planets/surf';
import { beltOres, DETAIL_R } from '../src/modules/planets/props';
import { DAY_SEC } from '../src/core/api';

beforeEach(() => { stubLocalStorage(); });

describe('행성 표 · 중력(GDD 6.4)', () => {
  it('일곱 행성, 순번마다 3 km 떨어진 origin', () => {
    expect(PLANETS.map((p) => p.id)).toEqual(['sugar', 'jelly', 'frost', 'cloud', 'belt', 'station', 'blackhole']);
    expect(PLANET_ORDER.length).toBe(7);
    const os = PLANETS.map((p) => planetOrigin(SPACE_ORIGIN, p.idx));
    for (const [i, o] of os.entries()) {
      expect(o.x - SPACE_ORIGIN.x).toBe((i + 1) * PLANET_GAP);
      expect(o.z).toBe(SPACE_ORIGIN.z);
      // 달(반경 400 + 먼 청크 1.1 km)과 겹치지 않는다
      expect(Math.hypot(o.x - SPACE_ORIGIN.x, o.z - SPACE_ORIGIN.z)).toBeGreaterThan(2000);
    }
  });
  it('중력: 슈가링 0.5 · 젤리별 0.7 · 서리볼 0.4 · 성운 ~0 · 자갈띠 0.05 · 별다방 1', () => {
    const g = (id: string) => PLANET_BY_ID.get(id)!.gravity;
    expect(g('sugar')).toBe(0.5); expect(g('jelly')).toBe(0.7); expect(g('frost')).toBe(0.4);
    expect(g('cloud')).toBeLessThanOrEqual(0.05); expect(g('belt')).toBe(0.05); expect(g('station')).toBe(1);
    expect(gravityAccel(1)).toBeCloseTo(-22); expect(gravityAccel(0.5)).toBeCloseTo(-11);
    // 0 '둥둥'도 아주 약하게는 떨어진다
    expect(gravityAccel(0)).toBeLessThan(0); expect(gravityAccel(0)).toBeGreaterThan(-1);
  });
  it('까만 도넛 가변 중력: 시간에 따라 출렁, 구멍 가까이 무겁다, 범위 안', () => {
    const vals = Array.from({ length: 40 }, (_, i) => donutGravity(i, DONUT.rMid));
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.3);
    expect(donutGravity(5, DONUT.rIn)).toBeGreaterThan(donutGravity(5, DONUT.rMid));
    for (let t = 0; t < 60; t += 0.7) for (const R of [0, 40, 80, 120, 160]) { const v = donutGravity(t, R); expect(v).toBeGreaterThanOrEqual(0.12); expect(v).toBeLessThanOrEqual(1.4); }
  });
});

describe('땅 · 가두기', () => {
  it('가두기: 반경 × clampFrac 안은 null, 밖은 테두리 위로', () => {
    for (const p of PLANETS) {
      const lim = p.radius * p.clampFrac;
      expect(clampLocal(p, lim * 0.5, 0)).toBeNull();
      const c = clampLocal(p, lim * 1.3, lim * 0.2)!;
      expect(c).not.toBeNull();
      expect(Math.hypot(c.x, c.z)).toBeCloseTo(lim, 3);
      // 방향은 그대로
      expect(Math.atan2(c.z, c.x)).toBeCloseTo(Math.atan2(lim * 0.2, lim * 1.3), 5);
    }
  });
  it('가둔 반경 안 땅은 늘 바다(0) 위 — 우주에서 수영이 되지 않는다. 도착 자리는 평평', () => {
    for (const p of PLANETS) {
      const h = HEIGHTS[p.id], lim = p.radius * p.clampFrac;
      for (let x = -lim; x <= lim; x += 9) for (let z = -lim; z <= lim; z += 9) {
        if (Math.hypot(x, z) > lim) continue;
        const y = h(x, z);
        expect(Number.isFinite(y)).toBe(true);
        expect(y).toBeGreaterThan(1.5);
      }
      const s = p.spawn, y0 = h(s.x, s.z);
      expect(Math.abs(h(s.x + 1.5, s.z) - y0)).toBeLessThan(0.3);
      expect(Math.abs(h(s.x, s.z + 1.5) - y0)).toBeLessThan(0.3);
    }
  });
  it('행성 특징: 사탕 고리 볼록 · 젤리 바다 낮음 · 구름섬 > 구름바다 · 소행성 윗면 · 별다방 갑판 밖은 뚝 · 도넛 구멍', () => {
    expect(onSugarRing(SUGAR_RING.r, 0)).toBe(true);
    expect(HEIGHTS.sugar(SUGAR_RING.r, 0)).toBeGreaterThan(HEIGHTS.sugar(SUGAR_RING.r + 16, 0));
    expect(HEIGHTS.jelly(JELLY_SEA.x, JELLY_SEA.z)).toBeLessThan(HEIGHTS.jelly(-60, -30));
    for (const c of CLOUD_ISLES) expect(HEIGHTS.cloud(c.x, c.z)).toBeGreaterThan(HEIGHTS.cloud(c.x + c.r * 1.6, c.z) + 2);
    expect(onCloudSea(CLOUD_ISLES[0].x, CLOUD_ISLES[0].z)).toBe(false);
    const rocks = beltRocks();
    expect(rocks.length).toBeGreaterThanOrEqual(20);
    expect(beltRocks()).toBe(rocks); // 결정적(같은 배열)
    for (const a of rocks) { const top = rockTopAt(a.x, a.z)!; expect(top).toBeGreaterThan(a.y); expect(top).toBeGreaterThan(HEIGHTS.belt(a.x, a.z)); }
    expect(HEIGHTS.station(STATION.deck + 6, 0)).toBeLessThan(HEIGHTS.station(10, 10) - 5);
    expect(HEIGHTS.blackhole(0, 0)).toBeLessThan(HEIGHTS.blackhole(0, DONUT.rMid) - 8);
  });
});

describe('해금 사슬 · 일식 관문', () => {
  const mk = (o: Partial<TravelState> & { seen?: string[]; paidIds?: string[] } = {}): TravelState => ({
    visited: (id) => (o.seen ?? []).includes(id), paid: (id) => (o.paidIds ?? []).includes(id), stars: o.stars ?? 0, eclipse: o.eclipse ?? false, free: o.free,
  });
  it('첫 행성(슈가링)은 토끼달을 다녀와야, 그다음은 앞 행성을 다녀와야 열린다', () => {
    expect(travelCheck('sugar', mk({ stars: 99 })).why).toBe('locked');
    expect(travelCheck('sugar', mk({ stars: 99 })).need).toBe('moon');
    expect(travelCheck('sugar', mk({ stars: 99, seen: ['moon'] }))).toEqual({ ok: true, cost: 10 });
    for (let i = 1; i < PLANET_ORDER.length - 1; i++) {
      const id = PLANET_ORDER[i], prev = PLANET_ORDER[i - 1];
      expect(travelCheck(id, mk({ stars: 999, seen: ['moon'] })).why).toBe('locked');
      const ok = travelCheck(id, mk({ stars: 999, seen: ['moon', prev] }));
      expect(ok.ok).toBe(true);
      expect(ok.cost).toBe(PLANET_BY_ID.get(id)!.cost);
    }
  });
  it('별이 모자라면 stars, 이미 냈거나 다녀왔으면 공짜, free(하늘고래·치트)면 별 없이', () => {
    expect(travelCheck('jelly', mk({ stars: 3, seen: ['moon', 'sugar'] })).why).toBe('stars');
    expect(travelCheck('jelly', mk({ stars: 0, seen: ['moon', 'sugar'], paidIds: ['jelly'] }))).toEqual({ ok: true, cost: 0 });
    expect(travelCheck('jelly', mk({ stars: 0, seen: ['jelly'] }))).toEqual({ ok: true, cost: 0 });
    expect(travelCheck('jelly', mk({ stars: 0, seen: ['moon', 'sugar'], free: true }))).toEqual({ ok: true, cost: 0 });
    expect(travelCheck('pluto', mk()).why).toBe('unknown');
    expect(travelWhyText({ ok: false, cost: 15, why: 'stars' })).toContain('15');
    expect(planetKey('jelly')).toBe('space:planet:jelly');
  });
  it('까만 도넛은 일식 때만 — 다녀온 뒤에도', () => {
    const all = ['moon', ...PLANET_ORDER];
    expect(travelCheck('blackhole', mk({ stars: 999, seen: all, eclipse: false })).why).toBe('eclipse');
    expect(travelCheck('blackhole', mk({ stars: 999, seen: ['moon', 'station'], eclipse: true }))).toEqual({ ok: true, cost: 50 });
    expect(travelCheck('blackhole', mk({ stars: 999, seen: ['moon', 'belt'], eclipse: true })).why).toBe('locked');
  });
});

describe('행성 물리 · 친해지기 · 낚시', () => {
  it('서리볼 미끄럼: 마찰 0.05 면 속도가 아주 천천히 바뀐다', () => {
    const v = slideBlend({ x: 0, z: 0 }, { x: 5, z: 0 }, FROST_FRICTION);
    expect(v.x).toBeGreaterThan(0); expect(v.x).toBeLessThan(0.6);
    expect(slideBlend({ x: 0, z: 0 }, { x: 5, z: 0 }, 1).x).toBeCloseTo(5);
    // 손을 놓아도 바로 서지 않는다
    expect(slideBlend({ x: 6, z: 0 }, { x: 0, z: 0 }, FROST_FRICTION).x).toBeGreaterThan(5);
  });
  it('트램펄린: 세게 떨어질수록 높이, 살짝은 안 튕김, 상한', () => {
    expect(bounceVel(-1)).toBe(0);
    expect(bounceVel(-10)).toBeGreaterThan(bounceVel(-5));
    expect(bounceVel(-200)).toBeLessThanOrEqual(18);
  });
  it('트램펄린: 통통통 튀다가 몇 번 안에 멈춰 선다(젤리·구름 둘 다)', () => {
    for (const [rest, min] of [[0.82, 5], [0.5, 3]] as const) {
      for (const drop of [3, 6, 8.3, 12, 18]) {
        let v = bounceVel(-drop, rest, min), n = 0;
        // 튕겨 오른 속도 그대로 다시 떨어진다고 치고(공기 저항 없이) 반복
        while (v > 0 && n < 20) { v = bounceVel(-v, rest, min); n++; }
        expect(v).toBe(0);
        expect(n).toBeLessThanOrEqual(8);
      }
    }
    // 그냥 서 있다가 살짝 떨어진 정도는 바로 멈춤
    expect(bounceVel(-4, 0.82, 5)).toBe(0);
  });
  it('별공룡 하트: 하루 1개, 최대 5', () => {
    let st = feedSaur(undefined, 0);
    expect(st.gain).toBe(1); expect(st.st.hearts).toBe(1);
    st = feedSaur(st.st, 0);
    expect(st.gain).toBe(0); expect(st.st.hearts).toBe(1);
    for (let d = 1; d < 10; d++) st = feedSaur(st.st, d);
    expect(st.st.hearts).toBe(STARSAURUS_MAX);
    expect(st.max).toBe(true);
  });
  it('낚시 구역: 구름바다·젤리 바다·블랙홀 구멍, 시간·유성우로 종 거르기', () => {
    expect(fishZoneAt('cloud', 0, 0)).toBeNull();
    expect(fishZoneAt('cloud', 30, 25)).toBe('cloudsea');
    expect(fishZoneAt('jelly', JELLY_SEA.x, JELLY_SEA.z)).toBe('jellysea');
    expect(fishZoneAt('blackhole', 0, 5)).toBe('blackhole');
    expect(fishZoneAt('sugar', 0, 0)).toBeNull();
    const sp = [
      { id: 'a', where: [{ island: 'cloud', zone: 'cloudsea', time: 'all' }] },
      { id: 'b', where: [{ island: 'cloud', zone: 'cloudsea', time: 'sunset' }] },
      { id: 'c', where: [{ island: 'jelly', zone: 'jellysea', time: 'day' }] },
      { id: 'd', where: [{ island: 'cloud', zone: 'cloudsea', time: 'all', weather: { only: ['meteor'] } }] },
    ];
    expect(zonePool(sp, 'cloud', 'cloudsea', 12, false).map((s) => s.id)).toEqual(['a']);
    expect(zonePool(sp, 'cloud', 'cloudsea', 18, true).map((s) => s.id)).toEqual(['a', 'b', 'd']);
    // 일식 물고기(moon:'eclipse')는 일식 때만
    const bh = [{ id: 'e', where: [{ island: 'blackhole', zone: 'blackhole', moon: 'eclipse' }] }, { id: 'f', where: [{ island: 'blackhole', zone: 'blackhole' }] }];
    expect(zonePool(bh, 'blackhole', 'blackhole', 12, false).map((s) => s.id)).toEqual(['f']);
    expect(zonePool(bh, 'blackhole', 'blackhole', 12, false, true).map((s) => s.id)).toEqual(['e', 'f']);
    expect(timeOk(['sunset', 'night'], 23)).toBe(true);
    expect(spaceMeteor({ weatherLaunch: 'meteor', hour: 12 })).toBe(true);
    expect(spaceMeteor({ weekday: 6, hour: 22 })).toBe(true);
    expect(spaceMeteor({ weekday: 2, hour: 22 })).toBe(false);
    expect(whenOk('night', 12, false)).toBe(false);
    expect(whenOk('meteorNight', 22, true)).toBe(true);
  });
  it('고리 서핑: W 로 빨라지고, 고리 폭 안에서만 옆으로, 점프하고 내려온다', () => {
    let s = { a: 0, speed: 6, off: 0, hopY: 0, hopV: 0 };
    for (let i = 0; i < 120; i++) s = surfStep(s, { x: 0, y: 1 }, false, 1 / 60);
    expect(s.speed).toBeGreaterThan(6); expect(s.speed).toBeLessThanOrEqual(SURF.max);
    expect(s.a).toBeGreaterThan(0);
    for (let i = 0; i < 600; i++) s = surfStep(s, { x: 1, y: 0 }, false, 1 / 60);
    expect(Math.abs(s.off)).toBeLessThanOrEqual(SUGAR_RING.half - 1.5 + 1e-9);
    s = surfStep(s, { x: 0, y: 0 }, true, 1 / 60);
    expect(s.hopY).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) s = surfStep(s, { x: 0, y: 0 }, false, 1 / 60);
    expect(s.hopY).toBe(0);
  });
});

// ───────────── 가짜 게임에 띄우기 ─────────────
interface FakeEcon { stars: number; unlocked: Set<string>; spent: number; [k: string]: unknown }
function fakeEcon(stars = 100): FakeEcon {
  const e: FakeEcon = {
    stars, unlocked: new Set(['tool:rod', 'tool:net']), spent: 0,
    isUnlocked(k: string) { return e.unlocked.has(k); },
    unlock(k: string) { e.unlocked.add(k); },
    spend(c: { stars?: number }) { const n = c.stars ?? 0; if (e.stars < n) return false; e.stars -= n; e.spent += n; return true; },
    spendStars(n: number) { return (e.spend as (c: { stars: number }) => boolean)({ stars: n }); },
    day() { return 0; },
  };
  return e;
}
async function boot(o: { stars?: number; moon?: boolean } = {}) {
  const game = makeFakeGame({ load: false });
  const econ = fakeEcon(o.stars ?? 100);
  if (o.moon !== false) econ.unlocked.add('space:moon');
  (game as unknown as { econ: unknown }).econ = econ;
  const ctx = makeCtx(game);
  await buildSpace(ctx as never);
  await buildPlanets(ctx as never);
  return { game, ctx, econ };
}
type Ext = { list(): Array<{ id: string; ok: boolean }>; travel(id: string): boolean; check(id: string): { ok: boolean; why?: string }; current(): string | null; visited(id: string): boolean; stationShop: { pos: THREE.Vector3 | null; claimed: boolean } };
const extOf = (g: FakeGame) => g.ext.planets as Ext;
const spaceOf = (g: FakeGame) => g.space as NonNullable<FakeGame['space']> & { planets(): string[]; active(): string | null };

describe('space 에 붙이기', () => {
  it('일곱 행성이 등록되고 ext.planets 가 생긴다', async () => {
    const { game } = await boot();
    const ids = spaceOf(game).planets();
    for (const p of PLANETS) expect(ids).toContain(p.id);
    expect(extOf(game).list().map((r) => r.id)).toEqual(['moon', ...PLANET_ORDER]);
  });
  it('여행: 별을 내고 슈가링 도착 → 이름 붙은 장면 · 중력 0.5 · 해금 키 · arrive/discover · 다음 행성 열림', async () => {
    const { game, econ } = await boot({ stars: 30 });
    const ev = recordEvents(game);
    game.setWorld('space');
    expect(extOf(game).travel('sugar')).toBe(true);
    expect(econ.stars).toBe(20);
    expect(spaceOf(game).active()).toBe('sugar');
    expect(extOf(game).current()).toBe('sugar');
    expect(game.spaceRoot.getObjectByName('planet-sugar')).toBeTruthy();
    expect(game.physics.gravity).toBeCloseTo(-11);
    expect(econ.unlocked.has('space:planet:sugar')).toBe(true);
    expect(ev.of('arrive').some((e) => e.to === 'sugar')).toBe(true);
    expect(ev.of('discover').some((e) => e.place === 'planet:sugar')).toBe(true);
    // 도착 자리는 행성 땅 위
    const O = planetOrigin(SPACE_ORIGIN, 1);
    expect(Math.abs(game.player.pos.x - O.x)).toBeLessThan(20);
    expect(game.player.pos.y).toBeGreaterThan(10);
    // 다시 가면 공짜, 다음 행성(젤리별)은 이제 열림
    expect(extOf(game).check('jelly').ok).toBe(true);
    expect(extOf(game).travel('jelly')).toBe(true);
    expect(econ.stars).toBe(5);
    expect(game.spaceRoot.getObjectByName('planet-sugar')).toBeFalsy(); // 활성 행성만 짓는다
    expect(game.spaceRoot.getObjectByName('planet-jelly')).toBeTruthy();
    expect(extOf(game).travel('frost')).toBe(false); // 별 모자람
    expect(extOf(game).travel('sugar')).toBe(true);
    expect(econ.stars).toBe(5);
  });
  it('토끼달을 안 다녀왔으면 슈가링이 잠겨 있다', async () => {
    const { game } = await boot({ moon: false });
    expect(extOf(game).check('sugar').why).toBe('locked');
    expect(extOf(game).travel('sugar')).toBe(false);
    // 달에 한 번 내리면(flags.space.visited) 열린다
    game.setWorld('space');
    expect(extOf(game).check('sugar').ok).toBe(true);
  });
  it('까만 도넛: 일식이 아니면 못 가고, 일식이면 간다(가변 중력)', async () => {
    const { game, econ } = await boot({ stars: 999 });
    for (const id of ['sugar', 'jelly', 'frost', 'cloud', 'belt', 'station']) econ.unlocked.add(planetKey(id));
    game.setWorld('space');
    game.env!.eclipse = false;
    expect(extOf(game).check('blackhole').why).toBe('eclipse');
    expect(extOf(game).travel('blackhole')).toBe(false);
    game.env!.eclipse = true;
    expect(extOf(game).travel('blackhole')).toBe(true);
    expect(spaceOf(game).active()).toBe('blackhole');
    const g0 = game.physics.gravity;
    game.tick(1 / 60, 1);
    const ga = game.physics.gravity;
    game.tick(0.5, 10);
    expect(game.physics.gravity).not.toBeCloseTo(ga, 3);
    expect(g0).toBeLessThan(0);
  });
  it('자갈띠 운석: 캐면 숨고, 거기 머무는 동안 날이 바뀌면 다시 나타난다', async () => {
    const { game, econ } = await boot({ stars: 999 });
    for (const id of ['sugar', 'jelly', 'frost', 'cloud']) econ.unlocked.add(planetKey(id));
    game.setWorld('space');
    expect(extOf(game).travel('belt')).toBe(true);
    const ore = beltOres[0];
    game.player.teleport(ore.pos.x, ore.pos.z + 0.5, ore.pos.y);
    game.tick(1 / 60, 1);
    expect(game.interact(`planets:${ore.id}`)).toBe(true);
    const m = new THREE.Matrix4();
    ore.im.getMatrixAt(ore.index, m);
    expect(m.elements[0]).toBe(0);
    game.env!.advance(DAY_SEC);
    for (let i = 0; i < 4; i++) game.tick(0.5, 2 + i);
    ore.im.getMatrixAt(ore.index, m);
    m.elements.forEach((v, i) => expect(v).toBeCloseTo(ore.m.elements[i], 2)); // Float32 칸이라 근사로
  });
  it('흩뿌린 장식은 detail 층: 플레이어 둘레만, 낮음이면 더 적게', async () => {
    const { game, econ } = await boot({ stars: 999 });
    game.setWorld('space');
    expect(extOf(game).travel('sugar')).toBe(true);
    void econ;
    game.tick(0.5, 1);
    const gum = game.spaceRoot.getObjectByName('sugar-gumdrops') as THREE.InstancedMesh;
    expect(gum.userData.detail).toBe(true);
    const hi = gum.count;
    expect(hi).toBeGreaterThan(0);
    // 반경 밖 인스턴스는 없다
    const m = new THREE.Matrix4(), p = game.player.pos;
    for (let i = 0; i < gum.count; i++) { gum.getMatrixAt(i, m); expect(Math.hypot(m.elements[12] - p.x, m.elements[14] - p.z)).toBeLessThanOrEqual(DETAIL_R + 0.01); }
    game.chunks.detail = 0.6;
    game.tick(0.5, 2);
    expect(gum.count).toBeLessThan(hi);
  });
  it('별다방: 꾸물이 상점 자리가 생기고 가판대 E 가 open-shop station', async () => {
    const { game, econ } = await boot({ stars: 999 });
    for (const id of ['sugar', 'jelly', 'frost', 'cloud', 'belt']) econ.unlocked.add(planetKey(id));
    game.setWorld('space');
    expect(extOf(game).travel('station')).toBe(true);
    const shop = extOf(game).stationShop.pos!;
    expect(shop).toBeTruthy();
    const ev = recordEvents(game);
    game.player.teleport(shop.x, shop.z + 1.5);
    game.tick(1 / 60, 1);
    expect(game.interact('planets:station:shop')).toBe(true);
    expect(ev.of('open-shop')[0]?.shop).toBe('station');
  });
  it('별공룡 둥지: 별사과를 주면 하트 + befriend(kind dino), 하루 한 번', async () => {
    const { game } = await boot();
    const ev = recordEvents(game);
    game.setWorld('space');
    const O = SPACE_ORIGIN;
    const x = O.x + 150 - 11, z = O.z - 220 + 9 + 2;
    game.player.teleport(x, z);
    game.state.addItem('m_starapple', 2);
    game.tick(1 / 60, 1);
    expect(game.interact('planets:saur:feed')).toBe(true);
    const b = ev.of('befriend');
    expect(b.length).toBe(1);
    expect(b[0]).toMatchObject({ id: 's_starsaurus', hearts: 1, kind: 'dino' });
    expect(game.state.bag['m_starapple']).toBe(1);
    game.tick(1 / 60, 1);
    game.interact('planets:saur:feed');
    expect(ev.of('befriend').length).toBe(1); // 오늘은 배불러요
    expect(game.state.bag['m_starapple']).toBe(1); // 배부를 땐 별사과를 안 먹는다
    expect((game.state.flags as Record<string, { saur?: { hearts: number } }>).planets.saur!.hearts).toBe(1);
  });
  it('행성 생물이 자기 행성에 뜬다(젤리곰 6색 — 낮)', async () => {
    const { game, econ } = await boot({ stars: 999 });
    econ.unlocked.add(planetKey('sugar'));
    game.env!.setHour(12);
    game.setWorld('space');
    extOf(game).travel('jelly');
    const life = game.spaceRoot.getObjectByName('planets-life-jelly')!;
    expect(life).toBeTruthy();
    let bears = 0;
    life.traverse((o) => { if (o.name.startsWith('planets-jellybear:')) bears++; });
    expect(bears).toBe(6);
    // 지구로 돌아가면 행성이 치워진다
    game.setWorld('earth');
    expect(extOf(game).current()).toBeNull();
  });
});
