// 우주(토끼달) — 산소 타임라인(env.gameSec), 도착 이벤트, 지구 발사대 앞 귀환, 연못 pondAt, 행성 등록소(가두기·바닥·중력·addSpawn),
// 우주상자 자리 결정성, GDD 우주 생물 18종, 둥실 3초, 인사(목격) 등록. 화면 없이 가짜 게임(tests/kit)으로 띄운다.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import buildSpace from '../src/modules/space';
import { SPACE_ORIGIN } from '../src/core/game';
import * as Island from '../src/core/island';
import {
  MOON_R, OXY_PER_CAPSULE, OXY_GRACE, SPACE_CHESTS, MOON_PLACES, PAD_H, CLAMP_FRAC,
  chestSpots, moonHeight, moonPondsLocal, pondsWorld, pondAtIn, stepOxygen, clampToPlanet, planetGround, floorRescue, gravityOf,
  moonCraters, PlanetRegistry, actRank, ACT_DIST_MAX, type PlanetEntry,
} from '../src/modules/space/logic';
import { SPACE_SPECIES, GDD_SPACE_IDS, spaceByGdd } from '../src/modules/space/data';
import { isPart } from '../src/core/art';

const O = SPACE_ORIGIN;

async function boot(o: { world?: 'earth' | 'space' } = {}) {
  const game = makeFakeGame({ load: false });
  const ctx = makeCtx(game);
  await buildSpace(ctx as never);
  if (o.world === 'space') game.setWorld('space');
  return { game, ctx };
}
const space = (g: FakeGame) => g.space as NonNullable<FakeGame['space']> & { returnToEarth(w?: string): void; active(): string | null };

beforeEach(() => { stubLocalStorage(); });

describe('달 지형·장소', () => {
  it('크레이터 30개(연못 3 포함), 착륙장은 평평, 지구 전망 언덕이 가장 높다', () => {
    const cr = moonCraters();
    expect(cr.length).toBe(30);
    expect(cr.filter((c) => c.pond).length).toBe(3);
    expect(moonHeight(0, 0)).toBeCloseTo(PAD_H, 1);
    expect(Math.abs(moonHeight(4, 3) - PAD_H)).toBeLessThan(0.05);
    const hill = moonHeight(MOON_PLACES.hill.x, MOON_PLACES.hill.z);
    let max = -Infinity;
    for (let x = -380; x <= 380; x += 6) for (let z = -380; z <= 380; z += 6) if (Math.hypot(x, z) < MOON_R * 0.95) max = Math.max(max, moonHeight(x, z));
    expect(hill).toBeGreaterThanOrEqual(max - 0.5);
    // 크레이터 바닥도 지구 바다(0)보다 한참 위 → 달에서 '수영'이 되지 않는다
    for (const c of cr) expect(moonHeight(c.x, c.z)).toBeGreaterThan(2);
    // 가장자리 너머는 둥글게 떨어진다
    expect(moonHeight(MOON_R + 20, 0)).toBeLessThan(moonHeight(MOON_R * 0.8, 0) - 10);
  });
});

describe('연못 pondAt', () => {
  it('세 연못 안쪽은 물 높이, 바깥은 null', () => {
    const ponds = pondsWorld(O);
    expect(ponds.length).toBe(3);
    for (const [i, p] of ponds.entries()) {
      const L = MOON_PLACES.ponds[i];
      expect(p.x).toBeCloseTo(O.x + L.x); expect(p.z).toBeCloseTo(O.z + L.z);
      const hit = pondAtIn(ponds, p.x + p.r * 0.5, p.z);
      expect(hit).not.toBeNull();
      expect(hit!.y).toBeCloseTo(p.y);
      // 물은 연못 바닥보다 위
      expect(p.y - O.y).toBeGreaterThan(moonHeight(L.x, L.z) + 0.5);
      expect(pondAtIn(ponds, p.x + p.r + 1, p.z)).toBeNull();
    }
    expect(pondAtIn(ponds, O.x, O.z)).toBeNull();
  });
  it('game.space.pondAt 이 같은 값을 준다', async () => {
    const { game } = await boot();
    const sp = space(game);
    const p = sp.ponds[1];
    expect(sp.pondAt(p.x, p.z)?.y).toBeCloseTo(p.y);
    expect(sp.pondAt(p.x + p.r + 2, p.z + p.r + 2)).toBeNull();
    expect(moonPondsLocal()[1].r).toBeCloseTo(p.r);
  });
});

describe('산소 타임라인', () => {
  it('stepOxygen: 캡슐을 차례로 열고, 다 떨어지면 out', () => {
    const o = { value: 100, max: OXY_PER_CAPSULE };
    let caps = 2;
    const take = () => (caps > 0 ? (caps--, true) : false);
    expect(stepOxygen(o, 40, take)).toEqual({ used: 0, out: false });
    expect(o.value).toBe(60);
    expect(stepOxygen(o, 60 + 120, take)).toEqual({ used: 1, out: false });
    expect(o.value).toBe(OXY_PER_CAPSULE - 120);
    // 한 번에 크게 건너뛰면(env.advance) 캡슐 여러 개를 연다
    expect(stepOxygen(o, (OXY_PER_CAPSULE - 120) + OXY_PER_CAPSULE + 10, take)).toEqual({ used: 1, out: true });
    expect(o.value).toBe(0);
  });

  it('도착: 첫 방문 캡슐 3개 → 1개 열기 · env.gameSec 로 줄고 · 0 이면 숨차! 자동 귀환(arrive earth)', async () => {
    const { game } = await boot();
    const ev = recordEvents(game);
    game.setWorld('space');
    const sp = space(game);
    expect(ev.of('arrive').map((e) => e.to)).toEqual(['moon']);
    expect(sp.oxygen.value).toBe(OXY_PER_CAPSULE);
    expect(game.state.bag.it_oxygen).toBe(2);
    game.tick(1 / 60);
    // 게임 시계로 2시간
    game.env!.advance(150);
    game.tick(1 / 60);
    expect(sp.oxygen.value).toBeCloseTo(OXY_PER_CAPSULE - 150, 5);
    // 4시간 더 → 캡슐 하나 더 열림
    game.env!.advance(OXY_PER_CAPSULE);
    game.tick(1 / 60);
    expect(game.state.bag.it_oxygen ?? 0).toBe(1);
    expect(sp.oxygen.value).toBeCloseTo(OXY_PER_CAPSULE - 150, 5);
    // 남은 걸 다 쓰고도 넘친다 → out
    game.env!.advance(OXY_PER_CAPSULE * 2);
    game.tick(1 / 60);
    expect(ev.of('oxygen-out')).toHaveLength(1);
    expect(ev.of('oxygen-out')[0].where).toBe('space');
    expect(game.ui.toasts.some((t) => t.includes('숨차!'))).toBe(true);
    game.tick(1 / 60, 100);
    expect(game.world).toBe('earth');
    expect(ev.of('arrive').map((e) => e.to)).toEqual(['moon', 'earth']);
    const L = Island.PLACES.launchPad;
    expect(Math.hypot(game.player.pos.x - L.x, game.player.pos.z - L.z)).toBeLessThan(30);
    expect(game.player.locked).toBe(false);
  });

  it('캡슐이 하나도 없으면 비상 산소 1시간', async () => {
    const { game } = await boot();
    (game.state.flags as Record<string, unknown>).space = { visited: true };
    game.setWorld('space');
    expect(space(game).oxygen.value).toBe(OXY_GRACE);
  });

  it('남은 산소는 다음 여행으로 이어진다', async () => {
    const { game } = await boot();
    game.setWorld('space');
    game.tick(1 / 60);
    game.env!.advance(100);
    game.tick(1 / 60);
    space(game).returnToEarth();
    game.tick(1 / 60, 100);
    expect(game.world).toBe('earth');
    const caps = game.state.bag.it_oxygen;
    game.setWorld('space');
    expect(space(game).oxygen.value).toBeCloseTo(OXY_PER_CAPSULE - 100, 5);
    expect(game.state.bag.it_oxygen).toBe(caps);
  });
});

describe('귀환 · 도착', () => {
  it('로켓 E "지구로!" → 발사대 앞(땅 위)으로, arrive {to:earth}', async () => {
    const { game } = await boot({ world: 'space' });
    const ev = recordEvents(game);
    game.player.teleport(O.x + 1, O.z + 4);
    const row = game.listInteractions().find((r) => r.id === 'space:rocket');
    expect(row?.label).toContain('지구로');
    expect(game.interact('space:rocket')).toBe(true);
    expect(game.player.locked).toBe(true);
    game.tick(1 / 60, 90);
    expect(game.world).toBe('earth');
    expect(ev.of('arrive').map((e) => e.to)).toEqual(['earth']);
    const sp = space(game);
    const L = Island.PLACES.launchPad;
    expect(Math.hypot(sp.returnSpawn.x - L.x, sp.returnSpawn.z - L.z)).toBeLessThan(30);
    expect(Island.heightAt(sp.returnSpawn.x, sp.returnSpawn.z)).toBeGreaterThan(0.3);
    expect(Island.waterLevelAt(sp.returnSpawn.x, sp.returnSpawn.z)).toBeLessThan(Island.heightAt(sp.returnSpawn.x, sp.returnSpawn.z));
    expect(game.player.pos.x).toBeCloseTo(sp.returnSpawn.x);
    expect(game.player.pos.z).toBeCloseTo(sp.returnSpawn.z);
    expect(sp.active()).toBeNull();
  });
  it('착륙 자리는 착륙장 위, 중력은 −4.5, 땅 공급자가 달 높이를 맡는다', async () => {
    const { game } = await boot({ world: 'space' });
    const sp = space(game);
    expect(Math.hypot(sp.landingSpawn.x - O.x, sp.landingSpawn.z - O.z)).toBeLessThan(10);
    expect(game.physics.gravity).toBeCloseTo(-4.5);
    expect(game.groundAt(O.x + 50, O.z - 30)).toBeCloseTo(O.y + moonHeight(50, -30));
    expect(game.spaceRoot.getObjectByName('planet-moon')).toBeTruthy();
    expect(game.spaceRoot.getObjectByName('moon-earth')).toBeTruthy();
    game.setWorld('earth');
    expect(game.groundProviderAt(O.x + 50, O.z - 30)).toBeNull();
    expect(game.spaceRoot.getObjectByName('planet-moon')).toBeUndefined();
  });
});

describe('행성 등록소', () => {
  const ball = (id: string, dx: number, radius: number, h = 5): PlanetEntry => ({
    id, name: id, origin: new THREE.Vector3(O.x + dx, 0, O.z), radius, gravity: 0.5,
    heightAt: () => h, build: () => { const g = new THREE.Group(); g.name = `planet-${id}`; return g; },
  });
  it('순수: 가두기·바닥·중력 배율', () => {
    const d = ball('b', 3000, 100);
    expect(clampToPlanet(d, d.origin.x + 50, d.origin.z)).toBeNull();
    const c = clampToPlanet(d, d.origin.x + 150, d.origin.z)!;
    expect(c.x - d.origin.x).toBeCloseTo(100 * CLAMP_FRAC);
    expect(clampToPlanet(d, d.origin.x + 5000, d.origin.z)).toBeNull();
    expect(planetGround(d, d.origin.x, d.origin.z)).toBe(5);
    expect(planetGround(d, d.origin.x + 1000, d.origin.z)).toBeNull();
    expect(floorRescue(d, d.origin.x, 1, d.origin.z)).toBeCloseTo(5.05);
    expect(floorRescue(d, d.origin.x, 6, d.origin.z)).toBeNull();
    expect(gravityOf(-4.5)).toBe(-4.5);
    expect(gravityOf(0.5)).toBe(-11);
    expect(gravityOf(0)).toBeLessThan(0);
    const reg = new PlanetRegistry();
    reg.register(d); reg.register(ball('far', 6000, 200));
    expect(reg.planetAt(d.origin.x + 10, d.origin.z)?.id).toBe('b');
    expect(reg.planetAt(O.x + 4500, O.z)).toBeNull();
  });

  it('goPlanet: 활성 행성만 지어지고, 중력·가두기·바닥이 그 행성 기준, addSpawn 은 들어갈 때 build', async () => {
    const { game } = await boot();
    const sp = space(game);
    const ev = recordEvents(game);
    const built: THREE.Object3D[] = [];
    let ups = 0;
    sp.addSpawn('moon', { id: 'test-moon', build: (root) => { built.push(root); } });
    sp.registerPlanet(ball('ball', 3000, 100));
    sp.addSpawn('ball', { id: 'test-ball', build: (root) => { built.push(root); }, update: () => { ups++; } });
    // 지구에서 달로(로켓처럼)
    game.setWorld('space', sp.landingSpawn.clone());
    expect(built.map((r) => r.name)).toEqual(['planet-moon']);
    // 달 → 공 행성
    sp.goPlanet('ball');
    expect(sp.planet).toBe('ball');
    expect(built.map((r) => r.name)).toEqual(['planet-moon', 'planet-ball']);
    expect(game.spaceRoot.getObjectByName('planet-moon')).toBeUndefined();
    expect(game.spaceRoot.getObjectByName('planet-ball')).toBeTruthy();
    expect(game.physics.gravity).toBeCloseTo(-11);
    expect(ev.of('arrive').map((e) => e.to)).toEqual(['moon', 'ball']);
    game.tick(1 / 60, 3);
    expect(ups).toBe(3);
    // 가장자리 밖 → 안으로
    game.player.teleport(O.x + 3000 + 150, O.z, 5);
    game.tick(1 / 60);
    expect(Math.hypot(game.player.pos.x - (O.x + 3000), game.player.pos.z - O.z)).toBeLessThanOrEqual(100 * CLAMP_FRAC + 0.01);
    // 땅 밑 → 위로
    game.player.teleport(O.x + 3010, O.z, -3);
    game.tick(1 / 60);
    expect(game.player.pos.y).toBeGreaterThanOrEqual(5);
    // 이미 그 행성이면 addSpawn 이 바로 짓는다
    sp.addSpawn('ball', { id: 'late', build: (root) => { built.push(root); } });
    expect(built.length).toBe(3);
    // 지구에서 바로 그 행성으로
    game.setWorld('earth');
    sp.goPlanet('ball');
    expect(game.world).toBe('space');
    expect(sp.planet).toBe('ball');
    expect(built.filter((r) => r.name === 'planet-ball').length).toBe(4);
  });

  it('달 가장자리 가두기', async () => {
    const { game } = await boot({ world: 'space' });
    game.tick(1 / 60);
    game.player.teleport(O.x + MOON_R + 30, O.z);
    game.tick(1 / 60);
    expect(Math.hypot(game.player.pos.x - O.x, game.player.pos.z - O.z)).toBeLessThanOrEqual(MOON_R * CLAMP_FRAC + 0.01);
    expect(game.player.pos.y).toBeGreaterThan(O.y + 2);
  });
});

describe('우주상자', () => {
  it('하루마다 15개, 같은 날은 같은 자리, 첫 상자는 UFO 잔해 옆', () => {
    const a = chestSpots(5), b = chestSpots(5), c = chestSpots(6);
    expect(a).toEqual(b);
    expect(a.length).toBe(SPACE_CHESTS);
    expect(c).not.toEqual(a);
    expect(Math.hypot(a[0].x - MOON_PLACES.wreck.x, a[0].z - MOON_PLACES.wreck.z)).toBeLessThan(12);
    const ponds = moonPondsLocal();
    for (const s of [...a, ...c]) {
      expect(Math.hypot(s.x, s.z)).toBeLessThan(MOON_R * 0.9);
      for (const p of ponds) expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThan(p.r);
    }
  });
  it('여는 건 하루 한 번(economy 없으면 대체 표)', async () => {
    const { game } = await boot({ world: 'space' });
    const s = chestSpots(game.env!.day)[3];
    game.player.teleport(O.x + s.x + 1, O.z + s.z + 1);
    game.tick(1 / 60);
    const row = game.listInteractions().find((r) => r.id === 'space:chest:3');
    expect(row?.label).toBe('우주상자 열기');
    const before = game.state.coins + Object.values(game.state.bag).reduce((a, b) => a + b, 0);
    expect(game.interact('space:chest:3')).toBe(true);
    const after = game.state.coins + Object.values(game.state.bag).reduce((a, b) => a + b, 0);
    expect(after).toBeGreaterThan(before);
    game.tick(1 / 60);
    expect(game.listInteractions().some((r) => r.id === 'space:chest:3')).toBe(false);
    expect((game.state.flags as { space: { chests: { open: number[] } } }).space.chests.open).toEqual([3]);
  });
});

describe('E 고르기', () => {
  it('우주를 모르는 공급자(낚시처럼 늘 1.6)가 있어도 로켓 "지구로!" 가 E 로 골린다', async () => {
    const { game } = await boot({ world: 'space' });
    game.addProvider('fake-fishing', () => ({ label: '낚시하기', dist: 1.6, use: () => {} }));
    game.player.teleport(O.x + 1, O.z + 4);
    game.tick(1 / 60);
    const pick = game.pickInteraction();
    expect(pick.current?.id).toBe('space:rocket');
    expect(pick.current?.label).toContain('지구로');
  });
  it('actRank: 순서는 그대로, 값은 상한 아래', () => {
    const ds = [0, 0.3, 1, 1.6, 2.4, 6.5, 40];
    const rs = ds.map(actRank);
    for (let i = 1; i < rs.length; i++) expect(rs[i]).toBeGreaterThan(rs[i - 1]);
    for (const r of rs) expect(r).toBeLessThan(ACT_DIST_MAX);
    expect(actRank(-0.4)).toBe(0);
  });
});

describe('우주 생물', () => {
  it('GDD 3.9.1 18종이 다 있고(gdd 별칭 포함) 예전 14종 id 는 그대로', async () => {
    const { game } = await boot();
    for (const id of GDD_SPACE_IDS) {
      expect(spaceByGdd(id), id).toBeTruthy();
      expect(game.state.byGdd(id)?.category, id).toBe('space');
    }
    for (const old of ['moon-bunny', 'star-jelly', 'meteor-turtle', 'alien-slime', 'space-whale', 'meteor-fish', 'comet-chick', 'ufo-octo', 'crater-mole', 'nebula-cat', 'ring-snail', 'star-sheep', 'astro-penguin', 'gold-bunny']) {
      expect(game.state.species.get(old), old).toBeTruthy();
    }
    const p1 = ['s_jelly_bear', 's_ring_snake', 's_crystal_hedgehog', 's_ufo_jelly', 's_comet_fox', 's_little_star'];
    for (const id of p1) expect(spaceByGdd(id)!.p1, id).toBe(true);
    for (const s of SPACE_SPECIES) for (const p of s.look?.parts ?? []) expect(isPart(p), `${s.id}:${p}`).toBe(true);
    expect(spaceByGdd('s_glitter_moth')!.drop).toEqual({ id: 'm_stardust', n: 2 });
    expect(spaceByGdd('s_moonrock_turtle')!.drop).toEqual({ id: 'm_moonrock', n: 3 });
    for (const id of ['s_mochi_rabbit', 's_starsaurus', 's_alien_kid', 's_moon_brachio']) expect(spaceByGdd(id)!.witness, id).toBe(true);
  });

  it('달브라키오: 인사하면 도감만(keep:false), 목격 등록소에 보인다', async () => {
    const { game } = await boot({ world: 'space' });
    const H = MOON_PLACES.farHill;
    game.player.teleport(O.x + H.x, O.z + H.z + 4);
    game.tick(1 / 60, 2);
    expect(game.witnesses.list().some((w) => w.speciesId === 's_moon_brachio')).toBe(true);
    const row = game.listInteractions().find((r) => r.id.startsWith('space:greet:s_moon_brachio'));
    expect(row).toBeTruthy();
    game.interact(row!.id);
    expect(game.state.dex.s_moon_brachio?.count).toBe(1);
    expect(game.state.bag.s_moon_brachio).toBeUndefined();
    expect(game.ui.catches.at(-1)?.keep).toBe(false);
  });
});

describe('둥실 3초', () => {
  it('공중에서 Space 를 누르고 있으면 천천히 떨어지고, 3초 뒤엔 그대로', async () => {
    const { game } = await boot({ world: 'space' });
    game.tick(1 / 60);
    const pl = game.player;
    pl.teleport(O.x + 30, O.z + 30);
    game.input.hold('Space');
    pl.mode = 'air';
    pl.vel.y = -3;
    game.tick(1 / 60);
    expect(pl.vel.y).toBeGreaterThan(-0.5);
    // 3초 넘게 누르고 있으면 더는 띄우지 않는다
    for (let i = 0; i < 200; i++) { pl.mode = 'air'; game.tick(1 / 60); }
    pl.vel.y = -3;
    game.tick(1 / 60);
    expect(pl.vel.y).toBe(-3);
    // 땅에 닿으면 다시 충전
    pl.mode = 'ground'; game.tick(1 / 60);
    pl.mode = 'air'; pl.vel.y = -3; game.tick(1 / 60);
    expect(pl.vel.y).toBeGreaterThan(-0.5);
  });
});
