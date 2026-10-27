// 탈것 P1(vehicles-p1): 바람(요트 순풍 35 / 역풍 15 · 열기구 6 m/s) · 썰매 경사 속도 · P1 해금 조건(열기구 ⭐300 · 비행기 · UFO · 달 로버) ·
// 스킨 입히기(차고) · 2인승 좌석(current().seats · setPassenger · 자전거 ×1.3) · registerKind 로 더한 종류들.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import * as Island from '../src/core/island';
import buildVehicles from '../src/modules/vehicles';
import {
  windOf, yachtMaxSpeed, windWord, balloonDrift, windArrowRotation, BALLOON_DRIFT, YACHT_DOWN, YACHT_UP,
  sledStep, sledTerminal, SLED_MAX, SLED_PUSH,
  balloonGate, tryUnlockBalloon, autoUnlocks, planeReady, ufoReady, BALLOON_STARS,
  SKINS, skinId, parseSkin, skinOwned, applySkinChoice, tintColors, dominantHue,
  seatsOf, pedalMul, COPEDAL_MUL, noteTop, type P1Econ,
} from '../src/modules/vehicles/p1logic';
import { stuntName } from '../src/modules/vehicles/kinds/jetski';
import { roverStep } from '../src/modules/vehicles/kinds/rover';
import { gateLabel, type GateEcon } from '../src/modules/vehicles/logic';
import { requirementText } from '../src/modules/economy/progression';
import { ROCKET_PARTS } from '../src/modules/economy/data';
import { rngFor } from '../src/core/rng';
import type { Rt, Veh } from '../src/modules/vehicles/types';

const rng = (k: string) => rngFor(k);

/** 해금 키 + 반짝별을 들고 있는 가짜 경제 */
function fakeEcon(game?: FakeGame, keys: string[] = [], stars = 0) {
  const set = new Set(keys);
  const spent: Array<{ stars?: number }> = [];
  const econ: GateEcon & P1Econ & { set: Set<string>; stars: number; spent: typeof spent; give(id: string, n: number): number } = {
    set, spent, stars, p0: true,
    isUnlocked: (k) => set.has(k),
    unlock(k, why) { if (set.has(k)) return; set.add(k); game?.state.emit({ type: 'unlock', key: k, why }); },
    requirement: (k) => requirementText(k, econ, true),
    rocket() { return { blueprint: set.has('rocket:blueprint'), count: ROCKET_PARTS.filter((p) => set.has(p.key)).length, pad: set.has('rocket:pad') }; },
    spend(c, _why) { const s = c.stars ?? 0; if (econ.stars < s) return false; econ.stars -= s; spent.push({ stars: s }); return true; },
    give(id, n) { game?.state.addItem(id, n); return n; },
  };
  return econ;
}

beforeEach(() => { stubLocalStorage(); (globalThis as any).window ??= globalThis; });

function boot(o: { keys?: string[]; stars?: number; pos?: [number, number] } = {}) {
  const game = makeFakeGame({ pos: o.pos });
  const econ = fakeEcon(game, o.keys ?? [], o.stars ?? 0);
  game.econ = econ as never;
  const ev = recordEvents(game);
  buildVehicles(makeCtx(game) as never);
  const V = (window as any).__vehicles;
  return { game, econ, ev, api: game.vehicles as any, V, list: V.list as Veh[] };
}

/** 탄 탈것을 n 프레임 몰기(가짜 게임은 drive 를 부르지 않는다) */
function drive(game: FakeGame, frames: number, dt = 1 / 30) {
  const m = game.player.mounted as any;
  for (let i = 0; i < frames; i++) { m.drive(game.input, dt, game); game.tick(dt); }
}

describe('바람(요트·열기구)', () => {
  it('바람은 날마다 정해지고(결정적), 같은 날이면 같다', () => {
    const a = windOf(3, 12, rng), b = windOf(3, 12, rng), c = windOf(4, 12, rng);
    expect(a).toEqual(b);
    expect(a.angle).not.toBeCloseTo(c.angle, 3);
    expect(a.strength).toBeGreaterThanOrEqual(0.75);
    expect(a.strength).toBeLessThanOrEqual(1);
    // 시각에 따라 천천히 흔들린다(±0.35 rad 안)
    const d = Math.abs(Math.atan2(Math.sin(windOf(3, 18, rng).angle - a.angle), Math.cos(windOf(3, 18, rng).angle - a.angle)));
    expect(d).toBeLessThanOrEqual(0.71);
  });

  it('요트: 순풍 35 · 역풍 15 · 옆바람 25', () => {
    expect(yachtMaxSpeed(1.0, 1.0)).toBeCloseTo(YACHT_DOWN);
    expect(yachtMaxSpeed(1.0 + Math.PI, 1.0)).toBeCloseTo(YACHT_UP);
    expect(yachtMaxSpeed(1.0 + Math.PI / 2, 1.0)).toBeCloseTo(25);
    expect(windWord(0, 0)).toBe('순풍');
    expect(windWord(Math.PI, 0)).toBe('역풍');
    expect(windWord(Math.PI / 2, 0)).toBe('옆바람');
  });

  it('열기구: 떠 있으면 바람 쪽으로 6 m/s, 땅에선 0', () => {
    const w = windOf(1, 9, rng);
    const d = balloonDrift(w, true);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(BALLOON_DRIFT);
    expect(Math.atan2(d.x, d.z)).toBeCloseTo(w.angle);
    expect(balloonDrift(w, false)).toEqual({ x: 0, z: 0 });
  });

  it('바람 화살표: 카메라가 바람 쪽을 보면 위(0), 바람이 오른쪽이면 시계 방향', () => {
    // 카메라 yaw = 보는 쪽 + π
    expect(windArrowRotation(0.7, 0.7 + Math.PI)).toBeCloseTo(0);
    // h 가 줄면 오른쪽(turn 문법) → 화면에선 시계 방향(+)
    expect(windArrowRotation(0.7 - 0.5, 0.7 + Math.PI)).toBeCloseTo(0.5);
  });

  it('모듈: 요트가 순풍이면 35 m/s 근처, 바람 칩은 요트에서만', () => {
    const { game, api, V, list } = boot({ keys: ['v:yacht'] });
    const yacht = list.find((v) => v.def.kind === 'sail' && v.personal)!;
    const w = api.wind();
    // 넓은 바다로 옮겨 순풍으로 몬다
    V.show('yacht', 600, -200, w.angle);
    expect(api.current()).toMatchObject({ kind: 'yacht', boat: true, seats: 2 });
    game.input.hold('KeyW');
    drive(game, 30 * 12);
    expect(yacht.v).toBeGreaterThan(31);
    expect(yacht.v).toBeLessThanOrEqual(YACHT_DOWN + 0.01);
    // 칩: 탄 동안 보인다
    const chip = game.hud.chips().find((c) => c.id === 'vehicles:wind')!;
    const el = { innerHTML: '', style: { display: '' }, querySelector: () => ({ style: {} as any, textContent: '' }) } as any;
    chip.render(el);
    chip.update!(el, 0.1);
    expect(el.style.display).toBe('');
    game.input.release('KeyW');
    game.player.dismount();
    chip.update!(el, 0.1);
    expect(el.style.display).toBe('none');
  });
});

describe('펭귄 썰매(경사 속도)', () => {
  it('경사가 가파를수록 빨라지고 최대 20 m/s', () => {
    expect(sledTerminal(0)).toBe(0);
    const flat = sledTerminal(0, { push: true });
    expect(flat).toBeGreaterThan(SLED_PUSH * 0.8);
    expect(flat).toBeLessThanOrEqual(SLED_PUSH + 0.5);
    const a = sledTerminal(0.1), b = sledTerminal(0.18), c = sledTerminal(0.6);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBe(SLED_MAX);
    // 눈이 아니면 마찰 ×3 → 훨씬 느리다
    expect(sledTerminal(0.18, { snow: false })).toBeLessThan(b * 0.5);
    // 오르막은 속도를 줄이고, 브레이크는 더 빨리 세운다
    expect(sledStep(10, -0.2, 0.1)).toBeLessThan(10);
    expect(sledStep(10, 0, 0.1, { brake: true })).toBeLessThan(sledStep(10, 0, 0.1));
  });

  it('모듈: 솜눈섬에 썰매가 있고, 내리막을 타면 미끄러져 빨라진다', () => {
    const { game, list, V } = boot({ keys: ['v:sled'] });
    const s = list.find((v) => v.def.kind === 'sled')!;
    expect(s).toBeTruthy();
    expect(Island.islandAt(s.pos.x, s.pos.z)?.id).toBe('ice');
    // 근처 눈 비탈(1.5 m 앞이 꾸준히 낮은 곳)을 찾아 내리막으로 놓고 놓아 둔다(밀지 않음)
    let spot: { x: number; z: number; h: number } | null = null;
    for (let r = 0; r < 160 && !spot; r += 4) for (let i = 0; i < 24 && !spot; i++) {
      const a = (i / 24) * Math.PI * 2, x = s.pos.x + Math.cos(a) * r, z = s.pos.z + Math.sin(a) * r;
      if (Island.surfaceAt(x, z).kind !== 'snow') continue;
      const e = 1.5, gx = Island.heightAt(x + e, z) - Island.heightAt(x - e, z), gz = Island.heightAt(x, z + e) - Island.heightAt(x, z - e);
      const h = Math.atan2(-gx, -gz), fx = Math.sin(h), fz = Math.cos(h);
      let ok = true;
      for (let k = 0; k < 6 && ok; k++) {
        const d = (Island.heightAt(x + fx * k * 1.5, z + fz * k * 1.5) - Island.heightAt(x + fx * (k + 1) * 1.5, z + fz * (k + 1) * 1.5)) / 1.5;
        if (d < 0.12 || d > 0.5) ok = false;
      }
      if (ok) spot = { x, z, h };
    }
    expect(spot).not.toBeNull();
    V.show('sled', spot!.x, spot!.z, spot!.h);
    drive(game, 30 * 1);
    expect(s.v).toBeGreaterThan(1.5);
    expect(s.v).toBeLessThanOrEqual(SLED_MAX);
    expect(Number.isFinite(s.pos.y)).toBe(true);
  });
});

describe('P1 해금 조건', () => {
  it('열기구: 풍선 30개 + ⭐300 이면 econ.spend → econ.unlock', () => {
    expect(balloonGate(12, 999, false)).toMatchObject({ ok: false, ready: false });
    expect(balloonGate(12, 999, false).text).toContain('12/30');
    expect(balloonGate(30, 120, false).text).toContain('120/300');
    expect(balloonGate(31, 300, false)).toMatchObject({ ready: true });
    expect(balloonGate(0, 0, true).ok).toBe(true);
    const poor = fakeEcon(undefined, [], 299);
    expect(tryUnlockBalloon(poor, 30)).toBe(false);
    expect(poor.spent).toHaveLength(0);
    const rich = fakeEcon(undefined, [], 450);
    expect(tryUnlockBalloon(rich, 29)).toBe(false);
    expect(tryUnlockBalloon(rich, 30)).toBe(true);
    expect(rich.stars).toBe(450 - BALLOON_STARS);
    expect(rich.set.has('v:balloon')).toBe(true);
    expect(tryUnlockBalloon(rich, 30)).toBe(false); // 두 번 쓰지 않는다
  });

  it('모듈: 열기구 앞에서 E → 조건이 되면 ⭐300 쓰고 열린다', () => {
    const { game, econ, list } = boot({ stars: 320 });
    game.ext.treasure = { stats: () => ({ popped: 30 }) };
    const b = list.find((v) => v.def.kind === 'balloon')!;
    game.player.teleport(b.pos.x + 0.8, b.pos.z);
    expect(game.listInteractions().find((r) => r.id === 'vehicles:ride')?.label).toBe('🎈 열기구 열기 (⭐300)');
    game.interact('vehicles:ride');
    expect(econ.set.has('v:balloon')).toBe(true);
    expect(econ.stars).toBe(20);
    expect(game.listInteractions().find((r) => r.id === 'vehicles:ride')?.label).toBe('둥실풍선 열기구 타기');
    game.ext.treasure = { stats: () => ({ popped: 3 }) };
  });

  it('비행기(부품 1+) · UFO(우주 도감 80%) · 수상바이크(바다 10종) · 로버(달)', () => {
    expect(planeReady(0)).toBe(false);
    expect(planeReady(1)).toBe(true);
    expect(ufoReady(15, 20)).toBe(false);
    expect(ufoReady(16, 20)).toBe(true);
    expect(ufoReady(0, 0)).toBe(false);
    const e = fakeEcon();
    expect(autoUnlocks(e, { parts: 0, spaceGot: 1, spaceTotal: 20, seaGot: 2, moon: false })).toEqual([]);
    expect(autoUnlocks(e, { parts: 1, spaceGot: 16, spaceTotal: 20, seaGot: 10, moon: true }).sort()).toEqual(['v:jetski', 'v:plane', 'v:rover', 'v:ufo']);
    expect(autoUnlocks(e, { parts: 1, spaceGot: 16, spaceTotal: 20, seaGot: 10, moon: true })).toEqual([]);
  });

  it('모듈: 로켓 부품이 생기면 비행기, 달에 도착하면 로버, 잠금 안내는 종류별', () => {
    const { game, econ, list, V } = boot();
    expect(V.gate('plane').ok).toBe(false);
    expect(V.gate('ufo').label).toMatch(/^🔒 반짝 UFO — 우주 도감 \d+\/80%/);
    expect(V.gate('rover').label).toContain('달에 처음 도착');
    expect(V.gate('jetski').label).toContain('다이빙 센터');
    econ.unlock('rocket:part:body', 'craft');
    expect(econ.set.has('v:plane')).toBe(true);
    game.tick(1 / 60);
    expect(game.hudLog.cards.some((c) => /꼬마비행기/.test(c.title))).toBe(true);
    // 달 도착(우주 땅은 평평한 공급자)
    game.addGroundProvider((_x, _z) => (game.world === 'space' ? 5 : null), 'test-moon');
    game.space = { planet: 'moon', landingSpawn: new THREE.Vector3(0, 5, 30010) } as never;
    game.setWorld('space', new THREE.Vector3(0, 5, 30010));
    game.state.emit({ type: 'arrive', to: 'moon' });
    expect(econ.set.has('v:rover')).toBe(true);
    const r = list.find((v) => v.def.kind === 'rover')!;
    expect(r).toBeTruthy();
    expect(r.world).toBe('space');
    expect(r.pos.y).toBeCloseTo(5);
    expect(api(game).owned()).toContain('rover');
    // 달에서 로버 타고 앞으로: 반경 안에서 15 m/s 근처
    V.mount('rover');
    expect(api(game).current()).toMatchObject({ kind: 'rover' });
    game.input.hold('KeyW');
    drive(game, 30 * 4);
    expect(r.v).toBeGreaterThan(12);
    expect(r.v).toBeLessThanOrEqual(15.01);
    expect(Math.hypot(r.pos.x, r.pos.z - 30000)).toBeLessThanOrEqual(380.01);
  });
});
const api = (g: FakeGame) => g.vehicles as any;

describe('스킨(skin_<kind>_<n>)', () => {
  it('id 규칙·소유·고르기(가방 것은 차고로 옮긴다)', () => {
    expect(skinId('yacht', 2)).toBe('skin_yacht_2');
    expect(parseSkin('skin_moon_rover_3')).toEqual({ kind: 'moon_rover', n: 3 });
    expect(parseSkin('skin_bike_4')).toBeNull();
    expect(parseSkin('cos_hat')).toBeNull();
    const bag: Record<string, number> = { skin_bike_1: 1 };
    const f: { skins?: Record<string, number>; skinBox?: string[] } = {};
    expect(skinOwned('bike', 0, bag, [])).toBe(true);
    expect(skinOwned('bike', 2, bag, [])).toBe(false);
    expect(applySkinChoice(f, 'bike', 2, bag, () => {})).toBe(false);
    const take = (id: string) => { bag[id]--; };
    expect(applySkinChoice(f, 'bike', 1, bag, take)).toBe(true);
    expect(f.skins).toEqual({ bike: 1 });
    expect(f.skinBox).toEqual(['skin_bike_1']);
    expect(bag.skin_bike_1).toBe(0);
    // 차고에 들어간 건 계속 쓸 수 있고, 0 은 기본색
    expect(applySkinChoice(f, 'bike', 0, bag, take)).toBe(true);
    expect(f.skins).toEqual({});
    expect(applySkinChoice(f, 'bike', 1, bag, take)).toBe(true);
    expect(bag.skin_bike_1).toBe(0);
  });

  it('색 바꾸기: 색 있는 정점은 스킨 색상으로, 흰색·볼터치는 그대로', () => {
    const red = new THREE.Color('#ff8a9e'), white = new THREE.Color('#ffffff'), blush = new THREE.Color('#ff9fb4');
    const base = new Float32Array([red.r, red.g, red.b, white.r, white.g, white.b, blush.r, blush.g, blush.b]);
    const dom = dominantHue(base)!;
    expect(dom).not.toBeNull();
    const out = new Float32Array(9);
    tintColors(base, out, 2, dom); // 민트소다
    const c = new THREE.Color(out[0], out[1], out[2]), hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    expect(Math.abs(hsl.h - SKINS[1].hue)).toBeLessThan(0.03);
    expect([...out.slice(3, 9)].map((x) => +x.toFixed(4))).toEqual([...base.slice(3, 9)].map((x) => +x.toFixed(4)));
    tintColors(base, out, 0, dom);
    expect([...out]).toEqual([...base]);
  });

  it('모듈: 차고에서 입히면 내 탈것 정점색이 바뀌고 flags.vehicles.skins 에 남는다', () => {
    const { game, V, list } = boot({ keys: ['v:kart'] });
    const kart = list.find((v) => v.def.kind === 'kart' && v.personal)!;
    V.goto('kart');
    game.tick(1 / 60, 2);
    expect(kart.model).toBeTruthy();
    expect(kart.model!.root.name).toBe('vehicle-kart');
    const paint = kart.model!.root.getObjectByName('veh:paint') as THREE.Mesh;
    const before = Float32Array.from((paint.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array);
    // 잠긴 스킨은 못 입는다
    expect(V.skin('kart', 3)).toBe(false);
    game.state.addItem('skin_kart_3', 1);
    expect(V.skin('kart', 3)).toBe(true);
    const after = (paint.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
    expect([...after].some((x, i) => Math.abs(x - before[i]) > 0.02)).toBe(true);
    expect((game.state.flags.vehicles as any).skins).toEqual({ kart: 3 });
    expect(game.state.bag.skin_kart_3 ?? 0).toBe(0);
    // 기본으로 되돌리면 원래 색
    expect(V.skin('kart', 0)).toBe(true);
    expect([...((paint.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array)].map((x) => +x.toFixed(4))).toEqual([...before].map((x) => +x.toFixed(4)));
    // 차고 패널이 있다
    expect(game.hud.panel('garage')).toBeTruthy();
    expect(game.hud.hotkeys().some((h) => h.id === 'vehicles:garage' && h.code === 'KeyT')).toBe(true);
  });
});

describe('2인승 좌석', () => {
  it('카트·요트·열기구·자전거만 2인승, 둘이 밟으면 자전거 ×1.3', () => {
    for (const k of ['kart', 'sail', 'balloon', 'bike']) expect(seatsOf(k)).toBe(2);
    expect(seatsOf('motor')).toBe(1);
    expect(pedalMul('bike', 2, true)).toBe(COPEDAL_MUL);
    expect(pedalMul('bike', 2, false)).toBe(1);
    expect(pedalMul('bike', 1, true)).toBe(1);
    expect(pedalMul('kart', 2, true)).toBe(1);
  });

  it('모듈: current().seats · setPassenger 는 뒷자리를 준다', () => {
    const { game, api: a, V } = boot({ keys: ['v:bike', 'v:kart', 'v:motorboat', 'v:balloon'] });
    V.mount('kart');
    expect(a.current()).toMatchObject({ kind: 'kart', seats: 2, riders: 1 });
    const seat2 = a.setPassenger({ on: true });
    expect(seat2?.name).toBe('seat2');
    expect(a.current().riders).toBe(2);
    expect(a.seat(1)).toBe(seat2);
    game.player.dismount();
    V.mount('balloon');
    expect(a.current()).toMatchObject({ kind: 'balloon', seats: 2 });
    game.player.dismount();
    V.mount('motorboat');
    expect(a.current().seats).toBeUndefined();
    expect(a.setPassenger({ on: true })).toBeNull();
    game.player.dismount();
  });

  it('모듈: 자전거는 둘 다 밟으면 더 빠르다(netplay 깃발 ext.net.coPedal 도)', () => {
    // 마을 둘레에서 40 m 곧고 평평한 마른 길을 찾는다(내리막 가속이 섞이지 않게)
    let flat: { x: number; z: number; h: number } | null = null;
    const p0 = Island.HERO.player;
    for (let r = 0; r < 200 && !flat; r += 5) for (let i = 0; i < 16 && !flat; i++) for (let k = 0; k < 8 && !flat; k++) {
      const a = (i / 16) * Math.PI * 2, x = p0.x + Math.cos(a) * r, z = p0.z + Math.sin(a) * r, h = (k / 8) * Math.PI * 2;
      const y0 = Island.heightAt(x, z);
      let ok = true;
      for (let d = 0; d <= 48 && ok; d += 2) {
        const px = x + Math.sin(h) * d, pz = z + Math.cos(h) * d;
        if (Math.abs(Island.heightAt(px, pz) - y0) > 0.12 || Island.waterLevelAt(px, pz) - Island.heightAt(px, pz) > 0.2) ok = false;
      }
      if (ok) flat = { x, z, h };
    }
    expect(flat).not.toBeNull();
    const run = (pedal: 'api' | 'ext' | 'none') => {
      const { game, api: a, V, list } = boot({ keys: ['v:bike'] });
      V.show('bike', flat!.x, flat!.z, flat!.h);
      if (pedal === 'api') a.setPassenger({ on: true, pedal: true });
      if (pedal === 'ext') { a.setPassenger({ on: true }); game.ext.net = { coPedal: true }; }
      game.input.hold('KeyW');
      let top = 0;
      const bike = list.find((v) => v.def.kind === 'bike' && v.personal)!;
      for (let i = 0; i < 90; i++) { drive(game, 1); top = Math.max(top, bike.v); }
      game.dispose();
      return top;
    };
    const solo = run('none'), duo = run('api'), duo2 = run('ext');
    expect(duo).toBeGreaterThan(solo * 1.15);
    expect(duo2).toBeGreaterThan(solo * 1.15);
  });
});

describe('P1 종류들', () => {
  it('registerKind 로 더한 종류가 있고, 섬마다 놓였다', () => {
    const { V, list, api: a } = boot();
    for (const k of ['jetski', 'sled', 'buggy', 'rover', 'ufo']) expect(V.kinds()).toContain(k);
    expect(a.isBoat('jetski')).toBe(true);
    expect(a.isBoat('buggy')).toBe(false);
    const at = (k: string) => list.find((v) => v.def.kind === k);
    expect(Island.islandAt(at('buggy')!.pos.x, at('buggy')!.pos.z)?.id).toBe('desert');
    expect(Island.waterLevelAt(at('jetski')!.pos.x, at('jetski')!.pos.z)).toBe(0);
    expect(at('ufo')!.pos.y).toBeGreaterThan(Island.heightAt(at('ufo')!.pos.x, at('ufo')!.pos.z));
    // 로버는 달에 가야 생긴다
    expect(at('rover')).toBeUndefined();
    // 잠금 안내(비행기는 부품 안내 대신 econ 문구라도 🔒)
    expect(gateLabel({ kind: 'buggy', name: '모래 버기', unlockKey: 'v:buggy' }, fakeEcon()).label).toMatch(/^🔒 모래 버기/);
  });

  it('잠수정 8 m/s + 부력, 수상바이크 45 m/s 스턴트 판정', () => {
    const { game, V, list } = boot({ keys: ['v:submarine', 'v:jetski'] });
    const s = list.find((v) => v.def.kind === 'sub')!;
    V.show('submarine', 700, -150, 0.3, 0.8, 3.4, 0.22, -6);
    game.input.hold('KeyW');
    drive(game, 30 * 5);
    expect(s.v).toBeGreaterThan(7);
    expect(s.v).toBeLessThanOrEqual(8.01);
    // 손을 떼면 부력으로 떠오른다
    game.input.release('KeyW');
    const y0 = s.pos.y;
    drive(game, 30 * 2);
    if (y0 < -0.5) expect(s.pos.y).toBeGreaterThan(y0);
    // 서치라이트: 물속이면 켜진다
    s.pos.y = -8;
    drive(game, 2);
    expect((s.model!.bits.cone as THREE.Mesh | undefined)?.visible).toBe(true);
    game.player.dismount();
    expect(stuntName(Math.PI * 2, 0)).toBe('빙글 스턴트');
    expect(stuntName(0, Math.PI * 2)).toBe('공중제비 스턴트');
    expect(stuntName(Math.PI * 4, 0)).toBe('두 바퀴 빙글 스턴트');
    expect(stuntName(0.5, 0.2)).toBeNull();
    const j = list.find((v) => v.def.kind === 'jetski')!;
    V.show('jetski', 700, -150, 0.3);
    game.input.hold('KeyW');
    drive(game, 30 * 6);
    expect(j.v).toBeGreaterThan(40);
    expect(j.v).toBeLessThanOrEqual(45.01);
    game.input.release('KeyW');
    game.player.dismount();
    // 내릴 때 최고 속도 기록
    expect((game.state.flags.vehicles as any).top.jetski).toBeGreaterThan(40);
  });

  it('로버 한 걸음: 마루를 넘으면 뜨고, 세게 떨어지면 통 튄다', () => {
    let h = 0;
    const rt = { groundAt: () => h } as unknown as Rt;
    const v = { pos: new THREE.Vector3(0, 0, 0), vy: 0, air: false } as unknown as Veh;
    // 오르막을 오르다(위로 3 m/s) 땅이 평평해지면 뜬다
    h = 0.1; roverStep(v, rt, 0, 0, 1 / 30);
    expect(v.vy).toBeCloseTo(3);
    h = 0.1; roverStep(v, rt, 0, 0, 1 / 30);
    expect(v.air).toBe(true);
    // 위에서 떨어뜨리면 통
    v.pos.y = 10; v.vy = -6; v.air = true; h = 0;
    for (let i = 0; i < 60 && v.vy < 0; i++) roverStep(v, rt, 0, 0, 1 / 20);
    expect(v.vy).toBeGreaterThan(0);
  });

  it('noteTop: 더 빠를 때만', () => {
    const top: Record<string, number> = {};
    expect(noteTop(top, 'motorboat', 39.96)).toBe(true);
    expect(top.motorboat).toBe(40);
    expect(noteTop(top, 'motorboat', 20)).toBe(false);
  });

  it('padPose 는 발사대 로켓 자리', () => {
    const { api: a } = boot();
    const p = a.padPose();
    expect(p.x).toBeCloseTo(Island.PLACES.launchPad.x);
    expect(p.z).toBeCloseTo(Island.PLACES.launchPad.z);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});
