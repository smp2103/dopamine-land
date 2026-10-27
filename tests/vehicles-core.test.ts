// 탈것(vehicles-core): 잠금 안내 · 소환 자리(물/땅) · flags.vehicles 왕복 · 로켓 관문(canLaunch) · 발사 시간표(launch → setWorld 한 번) · 도감 18칸.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import * as Island from '../src/core/island';
import buildVehicles from '../src/modules/vehicles';
import {
  gateLabel, requirementBody, isRidable, readFlags, noteOwned, findWaterSpot, findLandSpot, chooseSummon, LaunchTimeline, completeLaunch,
  launchPhase, LAUNCH_T, unlockKeyOf, normKind, type Terrain, type GateEcon,
} from '../src/modules/vehicles/logic';
import { VEHICLE_DEX } from '../src/modules/vehicles/data';
import { canLaunch, requirementText } from '../src/modules/economy/progression';
import { ROCKET_PARTS } from '../src/modules/economy/data';

/** 해금 키 집합으로 도는 가짜 경제(잠금 안내는 진짜 requirementText) */
function fakeEcon(game?: FakeGame, keys: string[] = []) {
  const set = new Set(keys);
  const econ: GateEcon & { unlock(k: string, why?: string): void; set: Set<string> } = {
    set,
    p0: true,
    isUnlocked: (k) => set.has(k),
    unlock(k, why) { if (set.has(k)) return; set.add(k); game?.state.emit({ type: 'unlock', key: k, why }); },
    requirement: (k) => requirementText(k, econ, true),
    rocket() {
      const parts = ROCKET_PARTS.filter((p) => set.has(p.key)).length;
      return { blueprint: set.has('rocket:blueprint'), count: parts, pad: set.has('rocket:pad') };
    },
  };
  return econ;
}
const ALL_PARTS = ROCKET_PARTS.map((p) => p.key);

/** 테스트 지형: x ≤ 10 은 높이 1 인 마른 땅, 그 너머는 갈수록 깊어지는 바다(수면 0) */
const coast: Terrain = {
  height: (x) => (x <= 10 ? 1 : -(x - 10) * 0.5),
  water: (x) => (x <= 10 ? -Infinity : 0),
};

// 디버그 훅(window.__vehicles)을 읽으려고 node 에 window 를 깐다
beforeEach(() => { stubLocalStorage(); (globalThis as any).window ??= globalThis; });

function boot(o: { keys?: string[]; pos?: [number, number]; econ?: boolean } = {}) {
  const game = makeFakeGame({ pos: o.pos });
  const econ = fakeEcon(game, o.keys ?? []);
  if (o.econ !== false) game.econ = econ as never;
  const ev = recordEvents(game);
  const root = buildVehicles(makeCtx(game) as never) as THREE.Object3D;
  return { game, econ, ev, root, api: game.vehicles! };
}

describe('잠금 안내(gating)', () => {
  it('잠겼으면 🔒 이름 — 조건, 열리면 이름 타기', () => {
    const econ = fakeEcon();
    const bike = { kind: 'bike', name: '장바구니 자전거', unlockKey: unlockKeyOf('bike') };
    const locked = gateLabel(bike, econ);
    expect(locked.ok).toBe(false);
    expect(locked.label).toBe('🔒 장바구니 자전거 — 꽥꽥상회 1,600');
    econ.set.add('v:bike');
    expect(gateLabel(bike, econ)).toMatchObject({ ok: true, label: '장바구니 자전거 타기' });
    // 스쿠터는 자전거 키, 돛단배는 요트 키, 부두 모터보트는 모터보트 키
    expect(unlockKeyOf('scooter')).toBe('v:bike');
    expect(unlockKeyOf('sail')).toBe('v:yacht');
    expect(unlockKeyOf('motor')).toBe('v:motorboat');
    expect(unlockKeyOf('sub')).toBe('v:submarine');
    expect(unlockKeyOf('kart')).toBe('v:kart');
    expect(unlockKeyOf('rocket')).toBe('rocket:pad');
    expect(isRidable('scooter', 'v:bike', econ)).toBe(true);
    expect(isRidable('sail', 'v:yacht', econ)).toBe(false);
    // 뗏목 안내는 작업대 재료
    expect(gateLabel({ kind: 'raft', name: '통나무 뗏목', unlockKey: 'v:raft' }, econ).label).toMatch(/^🔒 통나무 뗏목 — 작업대 /);
  });

  it('requirementBody 는 머리를 떼고 조건만', () => {
    expect(requirementBody('🔒 자전거 — 꽥꽥상회 1,600')).toBe('꽥꽥상회 1,600');
    expect(requirementBody('🔒 뭔가')).toBe('뭔가');
    expect(requirementBody(undefined)).toBe('');
  });

  it('모듈: 잠긴 자전거는 안내만, 해금하면 탄다(mount 이벤트)', () => {
    const { game, econ, ev } = boot();
    const bike = (window as any).__vehicles.list.find((v: any) => v.def.kind === 'bike');
    game.player.teleport(bike.pos.x + 0.5, bike.pos.z);
    const row = game.listInteractions().find((r) => r.id === 'vehicles:ride');
    expect(row?.label).toBe('🔒 장바구니 자전거 — 꽥꽥상회 1,600');
    game.interact('vehicles:ride');
    expect(game.player.mounted).toBeNull();
    expect(game.ui.toasts.at(-1)).toContain('🔒 장바구니 자전거');
    econ.unlock('v:bike', 'buy');
    expect(game.listInteractions().find((r) => r.id === 'vehicles:ride')?.label).toBe('장바구니 자전거 타기');
    game.interact('vehicles:ride');
    expect(game.player.mounted).not.toBeNull();
    expect(ev.of('mount')[0]).toMatchObject({ vehicle: 'bike' });
    expect(game.vehicles!.current()).toMatchObject({ kind: 'bike', boat: false });
    game.player.dismount();
    expect(ev.of('dismount')).toHaveLength(1);
    // 해금·첫 탑승으로 도감 칸이 생겼다(가방엔 안 들어간다)
    expect(game.state.dex.v_bike?.count).toBe(1);
    expect(game.state.bag.v_bike).toBeUndefined();
  });
});

describe('소환 자리(물 vs 땅)', () => {
  it('배는 가장 가까운 깊은 물에, 먼바다를 보고', () => {
    const s = findWaterSpot(coast, 0, 0, 0.9, 60, 1, 2)!;
    expect(s).not.toBeNull();
    expect(coast.water(s.x, s.z) - coast.height(s.x, s.z)).toBeGreaterThanOrEqual(0.9);
    expect(s.x).toBeLessThan(20); // 가까운 쪽
    expect(Math.sin(s.rot)).toBeGreaterThan(0.9); // +x(깊어지는 쪽)를 본다
    expect(findWaterSpot({ height: () => 1, water: () => -Infinity }, 0, 0, 0.9, 30)).toBeNull();
  });

  it('땅 탈것은 마른 평지에', () => {
    const s = findLandSpot(coast, 20, 0, 1, 14)!;
    expect(s.x).toBeLessThanOrEqual(10);
    expect(findLandSpot(coast, 40, 0, 1, 10)).toBeNull(); // 사방이 바다
  });

  it('chooseSummon: 가장 최근 것부터, 자리가 있는 매체만', () => {
    const media: Record<string, 'land' | 'water' | 'pad'> = { bike: 'land', raft: 'water', rocket: 'pad' };
    const spot = { x: 1, z: 2, rot: 0 };
    // 물이 가까우면 마지막에 얻은 뗏목
    expect(chooseSummon(['bike', 'raft', 'rocket'], (k) => media[k], () => true, () => spot)?.kind).toBe('raft');
    // 물이 없으면 자전거로
    expect(chooseSummon(['bike', 'raft'], (k) => media[k], () => true, (m) => (m === 'water' ? null : spot))?.kind).toBe('bike');
    // 잠긴 건 건너뛴다
    expect(chooseSummon(['bike', 'raft'], (k) => media[k], (k) => k === 'bike', () => spot)?.kind).toBe('bike');
    expect(chooseSummon([], () => 'land', () => true, () => spot)).toBeNull();
  });

  it('모듈: 땅에선 자전거가 땅에, 뗏목 해금 → 카드 + 가까운 물에 저절로', () => {
    const { game, econ, ev, api } = boot({ keys: ['v:bike'] });
    game.tick(1 / 60, 2);
    // 마을 한가운데(마른 땅)
    const p = Island.HERO.player;
    game.player.teleport(p.x, p.z);
    expect(api.summon('bike')).toBe(true);
    const list = (window as any).__vehicles.list as any[];
    const bike = list.find((v) => v.def.kind === 'bike' && v.personal);
    expect(Island.waterLevelAt(bike.pos.x, bike.pos.z) - Island.heightAt(bike.pos.x, bike.pos.z)).toBeLessThan(0.05);
    expect(Math.hypot(bike.pos.x - p.x, bike.pos.z - p.z)).toBeLessThan(16);
    expect(ev.of('summon').at(-1)).toMatchObject({ vehicle: 'bike' });
    // 뗏목 해금: 안내 카드 + 물 위에 둥실
    game.player.teleport(Island.PLACES.boatDock.x - 6, Island.PLACES.boatDock.z - 6);
    econ.unlock('v:raft', 'craft');
    expect(game.hudLog.cards.some((c) => /뗏목/.test(c.title))).toBe(true);
    const raft = list.find((v) => v.def.kind === 'raft');
    expect(raft).toBeTruthy();
    const depth = Island.waterLevelAt(raft.pos.x, raft.pos.z) - Island.heightAt(raft.pos.x, raft.pos.z);
    expect(depth).toBeGreaterThanOrEqual(0.5);
    expect(api.owned()).toContain('raft');
    expect(api.isBoat('raft')).toBe(true);
    expect(api.isBoat('v_tugboat')).toBe(true);
    expect(api.isBoat('bike')).toBe(false);
    expect(game.state.dex.v_raft).toBeTruthy();
    // 물속에선 땅 탈것을 못 부른다
    game.player.mode = 'swim';
    game.player.teleport(raft.pos.x, raft.pos.z);
    expect(api.summon('bike')).toBe(false);
  });

  it('F 단축키: 그 프레임에 F 상호작용이 있으면 양보', () => {
    const { game } = boot({ keys: ['v:bike'] });
    game.tick(1 / 60, 1);
    const hk = game.hud.hotkeys().find((h) => h.id === 'vehicles:summon')!;
    expect(hk.code).toBe('KeyF');
    expect(hk.when!()).toBe(true);
    game.addProvider('test-chop', () => ({ id: 'chop', label: '베기', dist: 1, key: 'KeyF', use: () => {}, priority: 10 }));
    game.tick(1 / 60, 1);
    expect(hk.when!()).toBe(false);
  });
});

describe('flags.vehicles 왕복', () => {
  it('readFlags 는 이상한 값을 버리고 모르는 키는 남긴다', () => {
    const f = readFlags({ owned: ['bike', 'v_raft', 3, 'bike', 'motorboat'], at: { raft: { x: 1, z: 2, h: 0.5 }, bad: { x: 'no' }, v_motorboat: { x: 3, z: 4 } }, skins: { bike: 2 } });
    expect(f.owned).toEqual(['bike', 'raft', 'motor']);
    expect(f.at.raft).toEqual({ x: 1, z: 2, h: 0.5 });
    expect(f.at.motor).toEqual({ x: 3, z: 4, h: 0 });
    expect(f.at.bad).toBeUndefined();
    expect(f.skins).toEqual({ bike: 2 });
    expect(readFlags('junk')).toEqual({ owned: [], at: {} });
    expect(noteOwned(f, 'bike')).toBe(false);
    expect(f.owned.at(-1)).toBe('bike');
    expect(noteOwned(f, 'tugboat')).toBe(true);
    expect(normKind('v:duck_tube')).toBe('duck_tube');
  });

  it('저장 → 다시 불러오면 소유·자리가 그대로', () => {
    const a = boot({ keys: ['v:raft'] });
    a.game.player.teleport(Island.PLACES.boatDock.x - 6, Island.PLACES.boatDock.z - 6);
    a.game.tick(1 / 60, 1);
    expect(a.api.summon('raft')).toBe(true);
    const raft = ((window as any).__vehicles.list as any[]).find((v) => v.def.kind === 'raft');
    const at = { x: raft.pos.x, z: raft.pos.z };
    a.game.flushSave();
    a.game.dispose();
    const b = boot({ keys: ['v:raft'] });
    const f = b.game.state.flags.vehicles as any;
    expect(f.owned).toContain('raft');
    expect(f.at.raft.x).toBeCloseTo(at.x, 1);
    expect(f.at.raft.z).toBeCloseTo(at.z, 1);
    const raft2 = ((window as any).__vehicles.list as any[]).find((v) => v.def.kind === 'raft');
    expect(raft2.pos.x).toBeCloseTo(at.x, 1);
    expect(raft2.pos.z).toBeCloseTo(at.z, 1);
  });
});

describe('로켓 관문(canLaunch)', () => {
  const rocket = { kind: 'rocket', name: '도파민 1호', unlockKey: unlockKeyOf('rocket') };
  it('부품 6 + 발사대일 때만', () => {
    const cases: string[][] = [[], ['rocket:pad'], ALL_PARTS.slice(0, 5).concat('rocket:pad'), ALL_PARTS, ALL_PARTS.concat('rocket:pad')];
    for (const keys of cases) {
      const e = fakeEcon(undefined, keys);
      expect(gateLabel(rocket, e).ok).toBe(canLaunch(e));
    }
    const three = fakeEcon(undefined, ['rocket:blueprint', ...ALL_PARTS.slice(0, 3)]);
    expect(gateLabel(rocket, three).label).toBe('🔒 도파민 1호 — 부품 3/6 · 발사대 아직이에요');
    const six = fakeEcon(undefined, ALL_PARTS);
    expect(gateLabel(rocket, six).label).toContain('부품 6/6');
    expect(gateLabel(rocket, fakeEcon(undefined, [...ALL_PARTS, 'rocket:pad'])).label).toBe('🚀 도파민 1호 발사!');
    // 경제가 없으면 로켓은 못 쏜다(다른 탈것은 탄다)
    expect(gateLabel(rocket, null).ok).toBe(false);
    expect(gateLabel({ kind: 'bike', name: '자전거', unlockKey: 'v:bike' }, null).ok).toBe(true);
  });
});

describe('발사 시간표(GDD 6.2)', () => {
  it('신호 순서와 구간', () => {
    const tl = new LaunchTimeline();
    const got: Array<[string, number]> = [];
    for (let i = 0; i < 700; i++) for (const c of tl.step(i === 0 ? 0 : 1 / 60)) got.push([c, tl.t]);
    expect(got.map((g) => g[0])).toEqual(['board', 'wave', 'count3', 'count2', 'count1', 'ignite', 'sky', 'white']);
    for (const [c, t] of got) expect(t).toBeGreaterThanOrEqual(LAUNCH_T[c as keyof typeof LAUNCH_T] - 1e-9);
    expect(tl.done).toBe(true);
    expect(tl.step(1)).toEqual([]);
    expect(launchPhase(0.2)).toBe('board');
    expect(launchPhase(2)).toBe('count');
    expect(launchPhase(5)).toBe('ascent');
    expect(launchPhase(8)).toBe('sky');
    expect(launchPhase(9)).toBe('done');
  });

  it('completeLaunch: space:moon → launch → setWorld(착륙장)', () => {
    const game = makeFakeGame();
    const econ = fakeEcon(game);
    game.econ = econ as never;
    const order: string[] = [];
    game.state.on((e) => order.push(e.type));
    const sw = game.setWorld.bind(game);
    game.setWorld = (w, s) => { order.push(`setWorld:${w}`); sw(w, s); };
    const spawn = completeLaunch(game as never);
    expect(order).toEqual(['unlock', 'launch', 'setWorld:space']);
    expect(econ.isUnlocked('space:moon')).toBe(true);
    expect(spawn.z).toBe(30000);
    expect(spawn.y).toBe(2);
    game.space = { landingSpawn: new THREE.Vector3(5, 3, 30010) } as never;
    expect(completeLaunch(game as never).x).toBe(5);
  });

  it('모듈: 발사대에서 타면 9초 뒤 launch 다음 setWorld 정확히 한 번', () => {
    const { game, ev } = boot({ keys: [...ALL_PARTS, 'rocket:blueprint', 'rocket:pad'] });
    const pad = Island.PLACES.launchPad;
    game.player.teleport(pad.x + 3, pad.z + 3);
    game.tick(1 / 60, 2);
    const row = game.listInteractions().find((r) => r.id === 'vehicles:ride');
    expect(row?.label).toBe('🚀 도파민 1호 발사!');
    const order: string[] = [];
    game.state.on((e) => { if (e.type === 'launch' || e.type === 'launch-wave') order.push(e.type); });
    let worlds = 0;
    const sw = game.setWorld.bind(game);
    game.setWorld = (w, s) => { worlds++; order.push(`setWorld:${w}`); sw(w, s); };
    game.interact('vehicles:ride');
    expect(game.player.mounted).not.toBeNull();
    // 발사 중 E 는 내리기가 아니다
    game.tick(1 / 60, 30);
    game.input.press('KeyE');
    game.tick(1 / 60, 1);
    expect(game.player.mounted).not.toBeNull();
    game.tick(1 / 60, 60 * 10);
    expect(order).toEqual(['launch-wave', 'launch', 'setWorld:space']);
    expect(worlds).toBe(1);
    expect(ev.of('launch')).toEqual([expect.objectContaining({ to: 'moon' })]);
    expect(game.world).toBe('space');
    expect(game.player.mounted).toBeNull();
    expect(game.player.pos.z).toBeCloseTo(30000, 0);
    expect(game.state.dex.v_rocket).toBeTruthy();
    // 더 돌려도 다시 안 쏜다
    game.tick(1 / 60, 120);
    expect(worlds).toBe(1);
  });

  it('부품이 모자라면 타지 않고 안내만', () => {
    const { game } = boot({ keys: ALL_PARTS.slice(0, 4) });
    const pad = Island.PLACES.launchPad;
    game.player.teleport(pad.x + 3, pad.z + 3);
    game.tick(1 / 60, 2);
    expect(game.listInteractions().find((r) => r.id === 'vehicles:ride')?.label).toBe('🔒 도파민 1호 — 부품 4/6 · 발사대 아직이에요');
    game.interact('vehicles:ride');
    expect(game.player.mounted).toBeNull();
  });
});

describe('도감 18칸(v_*)', () => {
  it('category item + tags vehicle, 모듈이 등록한다', () => {
    const ids = ['v_bike', 'v_duck_tube', 'v_raft', 'v_tugboat', 'v_yacht', 'v_motorboat', 'v_jetski', 'v_submarine', 'v_sled', 'v_buggy', 'v_balloon', 'v_plane',
      'v_dino_trike', 'v_dino_ptera', 'v_dino_plesio', 'v_rocket', 'v_moon_rover', 'v_ufo'];
    expect(VEHICLE_DEX.map((s) => s.id)).toEqual(ids);
    for (const s of VEHICLE_DEX) {
      expect(s.category).toBe('item');
      expect(s.tags).toContain('vehicle');
      expect(s.rarity).toBeGreaterThanOrEqual(1);
      expect(s.name.length).toBeGreaterThan(0);
    }
    const { game } = boot();
    for (const id of ids) expect(game.state.species.get(id)?.tags).toContain('vehicle');
  });

  it('통통배 current(): 멈추면 speed < 1 (갑판 낚시)', () => {
    const { game, api } = boot({ keys: ['v:tugboat'] });
    const tug = ((window as any).__vehicles.list as any[]).find((v) => v.def.kind === 'tugboat');
    game.player.teleport(tug.pos.x, tug.pos.z);
    (window as any).__vehicles.mount('tugboat');
    expect(api.current()).toMatchObject({ kind: 'tugboat', boat: true });
    expect(api.current()!.speed).toBeLessThan(1);
  });
});
