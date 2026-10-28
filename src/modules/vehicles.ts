// 탈것: 종류 등록부(kinds/*) · 해금(🔒 안내) · 내 탈것(flags.vehicles {owned, at, skins, skinBox, top}) · F 부르기 · 도감 18칸(+달리미) · 로켓 발사 연출(GDD 6.2).
// E 로 타고 E 로 내린다. 내린 자리에 남고(내 탈것이면 저장), 가까이 갈 때 만들고(지연 생성, 한 프레임에 하나) 멀면 숨긴다.
//
// game.vehicles = { current(), owned(), summon(kind), isBoat(kind), registerKind(def) } — 계약 v2 2장. 덤(P1):
//   current() → {kind, speed, boat, seats?, riders} (kind 는 바깥 이름: tugboat · motorboat · yacht · submarine · rover · ufo …).
//              통통배가 멈추면(speed < 1) fishing 이 갑판 낚시를 연다.
//   registerKind(def): kinds/<kind>.ts 모양(KindDef)이면 세상에 놓고 탈 수 있고, 모양 없이 {kind, name, boat?, unlock?} 만 주면 이름·해금·isBoat 만 안다.
//   setPassenger({on, pedal?} | null) → 지금 탄 탈것의 뒷자리 Object3D(2인승이 아니면 null). netplay 가 친구 아바타를 붙이고,
//              자전거는 둘 다 밟으면(pedal) ×1.3. game.ext.net.coPedal === true 도 같은 뜻으로 읽는다.
//   seat(i)    지금 탄 탈것의 i 번째 자리(0 = 운전석, 1 = 뒷자리)
//   wind()     오늘의 바람 {angle, strength, x, z}(요트 순풍 35 / 역풍 15 · 열기구 6 m/s 표류)
//   padPose()  발사대 로켓 자리 {x, y, z, rotY} — 마을 발사탑 단계(비계)가 이 자리에 맞춘다
//   stats()    {top: {kind: 최고 m/s}, stunts} — 업적(ach_speed: top.motorboat ≥ 40)이 읽는다
// P1: 요트 바람 · 수상바이크(산호빛 부두) · 잠수정 서치라이트 + 로봇팔(E, 심해·해구 dive 굴림) · 펭귄 썰매(솜눈섬) · 모래 버기(모래시계섬) ·
//     열기구(풍선 30 + ⭐300 → econ.spend → unlock) · 비행기(로켓 부품 1+) · 달 로버(달 첫 도착) · UFO(우주 도감 80%, 빔 E) · 스킨 3색(차고 T) · 2인승.
// 이벤트: mount · dismount{vehicle, top} · summon · stunt{vehicle, name} · harvest(로봇팔·빔 재료) · catch(로봇팔, econ.reportCatch)
// 읽는 것(늘 늦게, `?.`): econ(해금·잠금 안내·로켓 상태·rollCatch·give) · env(날짜·시각·날씨 → 바람) · ocean.waveAt(파도) ·
//   ext.currents.at / geo.currentAt(해류) · geo.zoneAt(심해·해구) · ext.treasure.stats().popped(열기구) · space.landingSpawn·planet(달 로버) · ext.net.coPedal.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game, Input } from '../core/game';
import type { Species } from '../core/state';
import type { RollResult, RollSpecies, VehicleKindDef, VehicleNow, VehiclesApi } from '../core/api';
import { applyCurve } from '../core/curve';
import { trimSmallShadows } from '../core/chunks';
import { RAPIER } from '../core/physics';
import { mats, sphere, torus } from './vehicles/kit';
import { motorboat as motorboatModel } from './vehicles/models';
import { Puffs, SpeedLines } from './vehicles/fx';
import { LaunchFx } from './vehicles/launchfx';
import { VEHICLE_DEX, VEHICLE_DEX_BY_ID, VEHICLE_DEX_EXTRA } from './vehicles/data';
import {
  gateLabel, isRidable, normKind, publicId, readFlags, noteOwned, findWaterSpot, findLandSpot, deepAt, dryAt, chooseSummon, unlockKeyOf,
  type Medium, type Terrain, type VehFlags, type SummonSpot, type GateEcon, type GateResult,
} from './vehicles/logic';
import {
  windOf, windArrowRotation, windWord, yachtMaxSpeed, balloonGate, tryUnlockBalloon, autoUnlocks, SKINS, SKIN_COUNT, skinId, skinOwned,
  applySkinChoice, seatsOf, noteTop, type Wind, type P1Econ,
} from './vehicles/p1logic';
import { applySkin } from './vehicles/skins';
import type { KindDef, Rt, Veh } from './vehicles/types';
import { dropBody } from './vehicles/drive';
import { bike } from './vehicles/kinds/bike';
import { scooter } from './vehicles/kinds/scooter';
import { kart } from './vehicles/kinds/kart';
import { sail } from './vehicles/kinds/sail';
import { motor } from './vehicles/kinds/motor';
import { sub } from './vehicles/kinds/sub';
import { balloon } from './vehicles/kinds/balloon';
import { plane } from './vehicles/kinds/plane';
import { rocket, RocketLaunch, resetRocket } from './vehicles/kinds/rocket';
import { raft } from './vehicles/kinds/raft';
import { tugboat } from './vehicles/kinds/tugboat';
import { duckTube } from './vehicles/kinds/duck_tube';
import { jetski } from './vehicles/kinds/jetski';
import { sled } from './vehicles/kinds/sled';
import { buggy } from './vehicles/kinds/buggy';
import { rover, MOON_C, MOON_RIDE_R } from './vehicles/kinds/rover';
import { ufo, UFO_HOVER } from './vehicles/kinds/ufo';

// 마을 꽃·나무가 탈것 자리를 피하도록 먼저 자리를 잡는다
export const order = 6;

/** 기본 종류(P0 + 웨이브 3) */
export const BUILTIN_KINDS: KindDef[] = [bike, scooter, kart, sail, motor, sub, balloon, plane, rocket, raft, tugboat, duckTube];
/** P1 종류 — registerKind 로 더한다(웨이브 4) */
export const P1_KINDS: KindDef[] = [jetski, sled, buggy, rover, ufo];
/** 해금되면 안내 카드를 띄우는 P1 탈것 */
const P1_CARD = new Set(['sail', 'sub', 'balloon', 'plane', 'jetski', 'sled', 'buggy', 'rover', 'ufo']);
/** 차고·카드에 쓰는 아이콘 */
const ICON: Record<string, string> = {
  bike: '🚲', scooter: '🛵', kart: '🏎️', sail: '⛵', motor: '🚤', sub: '🟡', balloon: '🎈', plane: '✈️', raft: '🛶', tugboat: '🚢',
  duck_tube: '🦆', jetski: '🌊', sled: '🛷', buggy: '🏜️', rover: '🌙', ufo: '🛸', rocket: '🚀',
};

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();

/** 모양 없이 이름·해금만 아는 종류(공룡 탑승처럼 다른 담당이 직접 태우는 것) */
interface DataKind { kind: string; name: string; boat: boolean; seats?: number; unlockKey: string }
/** 로봇팔·빔으로 집을 반짝이 자리 */
interface PickSpot { key: string; x: number; y: number; z: number }
/** P1 덤 API(계약 VehiclesApi 위에) */
export interface VehiclesP1 {
  setPassenger(o: { on: boolean; pedal?: boolean } | null): THREE.Object3D | null;
  seat(i?: number): THREE.Object3D | null;
  wind(): Wind;
  padPose(): { x: number; y: number; z: number; rotY: number };
  stats(): { top: Record<string, number>; stunts: number };
}

/** 로봇팔로 집는 재료(심해) */
const ARM_ITEMS: Array<{ id: string; w: number; kind: string; n: [number, number] }> = [
  { id: 'm_pearl', w: 15, kind: 'pearl', n: [1, 1] }, { id: 'm_coral', w: 25, kind: 'coral', n: [1, 3] }, { id: 'm_shell', w: 25, kind: 'shell', n: [1, 3] },
  { id: 'm_seaweed', w: 20, kind: 'seaweed', n: [2, 4] }, { id: 't_bottle', w: 10, kind: 'bottle', n: [1, 1] }, { id: 't_rustykey', w: 5, kind: 'junk', n: [1, 1] },
];
/** 빔으로 끌어올리는 것(땅 종류별) */
const BEAM_ITEMS: Record<string, Array<{ id: string; w: number; kind: string; n: [number, number] }>> = {
  space: [{ id: 'm_moonrock', w: 50, kind: 'moonrock', n: [2, 3] }, { id: 'm_stardust', w: 40, kind: 'stardust', n: [2, 4] }, { id: 'm_moonflower', w: 10, kind: 'moonflower', n: [1, 1] }],
  sea: [{ id: 'm_seaweed', w: 40, kind: 'seaweed', n: [2, 3] }, { id: 'm_shell', w: 35, kind: 'shell', n: [1, 3] }, { id: 't_bottle', w: 25, kind: 'bottle', n: [1, 1] }],
  sand: [{ id: 'm_shell', w: 60, kind: 'shell', n: [1, 3] }, { id: 'm_coconut', w: 40, kind: 'fruit', n: [1, 1] }],
  desert: [{ id: 'm_cactusflower', w: 45, kind: 'flower', n: [1, 1] }, { id: 'm_sandglass', w: 30, kind: 'dig', n: [1, 2] }, { id: 'm_date', w: 25, kind: 'fruit', n: [1, 2] }],
  snow: [{ id: 'm_icecrystal', w: 70, kind: 'dig', n: [1, 2] }, { id: 'm_frostberry', w: 30, kind: 'fruit', n: [1, 2] }],
  rock: [{ id: 'm_stone', w: 60, kind: 'rock', n: [2, 4] }, { id: 'm_iron', w: 40, kind: 'rock', n: [1, 2] }],
  grass: [{ id: 'm_petal', w: 50, kind: 'petal', n: [2, 4] }, { id: 'm_feather', w: 25, kind: 'feather', n: [1, 2] }, { id: 'm_wood', w: 25, kind: 'chop', n: [1, 3] }],
};
/** 재료 이름(안내 토스트용 — 모르면 econ 이 붙인 이름 없이 id) */
const ITEM_NAME: Record<string, string> = {
  m_pearl: '진주', m_coral: '산호', m_shell: '조개껍데기', m_seaweed: '해초', t_bottle: '병편지', t_rustykey: '녹슨 열쇠', m_moonrock: '월석', m_stardust: '별가루',
  m_moonflower: '달꽃', m_coconut: '코코넛', m_cactusflower: '선인장꽃', m_sandglass: '모래유리', m_date: '대추야자', m_icecrystal: '얼음결정', m_frostberry: '서리베리',
  m_stone: '돌', m_iron: '철광석', m_petal: '꽃잎', m_feather: '깃털', m_wood: '나무',
};
const pickW = <T extends { w: number }>(list: T[], r: number): T => {
  const tot = list.reduce((s, x) => s + x.w, 0);
  let k = r * tot;
  for (const x of list) { k -= x.w; if (k <= 0) return x; }
  return list[list.length - 1];
};

export default function build(ctx: Ctx) {
  const root = new THREE.Group();
  root.name = 'vehicles';
  const game = ctx.game;
  const I = ctx.island;
  mats();
  // 지구 탈것은 earth 묶음(우주에선 숨김), 달 로버·우주의 UFO 는 game.spaceRoot 아래(지구에선 코어가 숨긴다)
  const earthGroup = new THREE.Group();
  earthGroup.name = 'vehicles-earth';
  root.add(earthGroup);
  const spaceGroup = new THREE.Group();
  spaceGroup.name = 'vehicles-space';
  if (game) game.spaceRoot.add(spaceGroup); else root.add(spaceGroup);
  const groupOf = (w: 'earth' | 'space') => (w === 'space' ? spaceGroup : earthGroup);

  // ── 종류 등록부
  const kinds = new Map<string, KindDef>();
  const dataKinds = new Map<string, DataKind>();
  for (const k of BUILTIN_KINDS) kinds.set(k.kind, k);
  /** 그 세계에서 탈 수 있는 종류인가 */
  const worldOk = (def: KindDef, w: 'earth' | 'space') => { const dw = def.world ?? 'earth'; return dw === 'both' || dw === w; };

  // ── 효과(두 세계 공용 — 묶음 밖 root 에)
  const puffMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, transparent: true, opacity: 0.78, depthWrite: false, emissive: '#ffffff', emissiveIntensity: 0.12 });
  const puffs = new Puffs(700, puffMat);
  const fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 1.8) });
  const fire = new Puffs(260, fireMat);
  const lines = new SpeedLines(60);
  // 투명 물(바다) 뒤에 그려지지 않게 — 물보다 나중에
  puffs.mesh.renderOrder = 20; fire.mesh.renderOrder = 21; lines.mesh.renderOrder = 22;
  root.add(puffs.mesh, fire.mesh, lines.mesh);
  const fxRnd = ctx.rng('vehicles:fx');
  const launchFx = new LaunchFx(ctx.rng('vehicles:launch-stars'));

  // ── 지형 질문
  /** 위에 부두·지붕 같은 충돌체가 있나(아래로 광선) — 플레이어 몸은 빼고 */
  const pierA = { x: I.PLACES.pier.x, z: I.PLACES.pier.z }, pierB = { x: I.PLACES.boatDock.x, z: I.PLACES.boatDock.z };
  /** 마을 부두(PLACES.pier → boatDock, 끝 마루 포함) 둘레 */
  const nearPier = (x: number, z: number) => {
    const dx = pierB.x - pierA.x, dz = pierB.z - pierA.z, L2 = dx * dx + dz * dz;
    const k = THREE.MathUtils.clamp(((x - pierA.x) * dx + (z - pierA.z) * dz) / L2, -0.6, 1.25);
    return Math.hypot(x - (pierA.x + dx * k), z - (pierA.z + dz * k)) < 3.2;
  };
  const blockedAt = (x: number, z: number) => {
    if (nearPier(x, z)) return true;
    const w = game?.physics?.world;
    if (!w) return false;
    const top = Math.max(0, I.heightAt(x, z)) + 6;
    const hit = w.castRay(new RAPIER.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }), 6, true, undefined, undefined, game?.player?.collider);
    if (!hit) return false;
    const y = top - hit.timeOfImpact;
    return y > Math.max(0, I.heightAt(x, z)) + 0.35;
  };
  const T: Terrain = { height: (x, z) => I.heightAt(x, z), water: (x, z) => I.waterLevelAt(x, z), buildable: (x, z, m) => I.isBuildable(x, z, m), blocked: blockedAt };
  /** 바닥 높이: 우주에선 행성 땅 공급자(space 모듈), 지구에선 섬 지형 */
  const groundAt = (x: number, z: number) => (game?.world === 'space' ? game.groundProviderAt(x, z) ?? 0 : I.heightAt(x, z));
  /** 잔물결(ocean 이 없을 때) */
  const ripple = (x: number, z: number, t: number) => 0.08 * Math.sin(x * 0.23 + z * 0.11 + t * 0.9) + 0.06 * Math.sin(-x * 0.13 + z * 0.29 + t * 1.25) - 0.02;
  /** 수면 높이: 바다는 game.ocean.waveAt(늦게 읽기, 없으면 잔물결), 호수·강은 그 높이 */
  const waterY = (x: number, z: number, t: number) => {
    const wl = I.waterLevelAt(x, z);
    if (wl === 0) {
      const oc = game?.ocean;
      if (oc && typeof oc.waveAt === 'function') {
        const y = oc.waveAt(x, z, t);
        if (Number.isFinite(y)) return y;
      }
      return ripple(x, z, t);
    }
    return Number.isFinite(wl) ? wl + 0.25 * ripple(x, z, t) : 0;
  };
  /** 해류(seaworld 의 ext.currents.at 또는 geo.currentAt) — 최대 8 m/s */
  const current = (x: number, z: number) => {
    let c: unknown = null;
    try { c = game?.ext?.currents?.at?.(x, z) ?? game?.geo?.currentAt?.(x, z) ?? null; } catch { c = null; }
    const o = c as { x?: number; z?: number; dx?: number; dz?: number } | null;
    let cx = Number(o?.x ?? o?.dx ?? 0), cz = Number(o?.z ?? o?.dz ?? 0);
    if (!Number.isFinite(cx) || !Number.isFinite(cz)) return { x: 0, z: 0 };
    const L = Math.hypot(cx, cz);
    if (L > 8) { cx *= 8 / L; cz *= 8 / L; }
    return { x: cx, z: cz };
  };
  /** 오늘의 바람(같은 시각이면 다시 계산하지 않는다) */
  let windKey = '', windNow: Wind = windOf(0, 12, (k) => ctx.rng(k));
  const wind = (): Wind => {
    const day = Math.floor(game?.env?.day ?? 0), hour = game?.env?.hour ?? 12;
    const key = `${day}:${hour.toFixed(2)}`;
    if (key !== windKey) { windKey = key; windNow = windOf(day, hour, (k) => ctx.rng(k)); }
    return windNow;
  };
  /** 같이 탄 사람(netplay) */
  const riders = { n: 1, pedal: false };

  // ── 공용 런타임(종류들이 쓴다)
  const fwdOf = (v: Veh) => new THREE.Vector3(Math.sin(v.h), 0, Math.cos(v.h));
  const rt: Rt = {
    game, I, puffs, fire, lines, rnd: fxRnd, groundAt, waterY, current,
    deep: (x, z, depth) => deepAt(T, x, z, depth),
    followCam(g, v, dt, k = 2.2) {
      if (g.input.dragging || Math.abs(v.v) < 1.2) return;
      let d = v.h + Math.PI - g.cam.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.cam.yaw += d * Math.min(1, dt * k);
    },
    boost: (input: Input) => input.down('ShiftLeft') || input.down('ShiftRight'),
    fwd: fwdOf,
    dust, wake, bubbles,
    place: (v, t) => defaultPlace(v, t),
    finish(v, g, dt, o = {}) {
      placeV(v, g.time);
      rt.followCam(g, v, dt, o.camK ?? 2.4);
      const dir = o.dir ?? fwdOf(v);
      lines.feed(dt, tmpV.copy(v.pos).add(new THREE.Vector3(0, o.lineY ?? 0.6, 0)), dir, o.speed ?? Math.abs(v.v), fxRnd, o.lineR ?? 2.6);
    },
    emit(type, data = {}) { game?.state.emit({ type, ...data }); },
    wind,
    riders: () => ({ n: riders.n, pedal: riders.pedal || game?.ext?.net?.coPedal === true }),
    sfx(name, o) { try { game?.audio?.sfx?.(name, o); } catch { /* 소리는 없어도 된다 */ } },
    toast(text) { game?.ui.toast(text); },
  };

  // ── 처음 자리(소용돌이 탐색) — 마을 탈것끼리 겹치지 않게 차지한 곳을 기억한다
  const taken: Array<{ x: number; z: number; r: number }> = [{ x: I.HERO.player.x, z: I.HERO.player.z, r: 3 }, { x: I.HERO.chest.x, z: I.HERO.chest.z, r: 2 }];
  const findLand = (x: number, z: number, margin: number, maxR = 40) => {
    for (let r = 0; r <= maxR; r += 0.5) {
      const n = Math.max(1, Math.floor(r * 4));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (taken.some((t) => Math.hypot(t.x - px, t.z - pz) < t.r + margin)) continue;
        if (I.isBuildable(px, pz, margin) && I.surfaceAt(px, pz).kind !== 'sand') { taken.push({ x: px, z: pz, r: margin }); return { x: px, z: pz }; }
      }
    }
    return { x, z };
  };
  /** 바다(waterLevel 0) 중 가장 가까운 배 자리 — 부두용 */
  const seaT: Terrain = { height: T.height, water: (x, z) => (I.waterLevelAt(x, z) === 0 ? 0 : -Infinity) };
  const findWater = (x: number, z: number, depth: number, maxR = 260) => findWaterSpot(seaT, x, z, depth, maxR, 2, 3) ?? { x, z, rot: 0 };
  const reserve = (x: number, z: number, r: number) => {
    ctx.scatter({ key: `vehicles:res:${x.toFixed(1)},${z.toFixed(1)}`, count: 1, minDist: 0.1, bounds: { minX: x - 0.01, maxX: x + 0.01, minZ: z - 0.01, maxZ: z + 0.01 }, accept: () => true, avoidOccupied: false, occupy: r });
  };

  // ── 탈것들
  const vehicles: Veh[] = [];

  function makeVehicle(def: KindDef, x: number, z: number, rot: number, personal: boolean): Veh {
    const w: 'earth' | 'space' = def.world === 'space' ? 'space' : def.world === 'both' && game?.world === 'space' ? 'space' : 'earth';
    const v: Veh = {
      def, idx: vehicles.length, model: null,
      pos: new THREE.Vector3(x, def.medium === 'water' ? 0 : groundAt(x, z), z),
      h: rot, v: 0, vy: 0, pitch: 0, roll: 0, steer: 0, mounted: false, air: false, st: {},
      focus: new THREE.Object3D(), body: null, coll: null, cc: null,
      mountable: null as unknown as Veh['mountable'], wheelA: 0, personal, world: w, top: 0,
    };
    if (def.kind === 'ufo') v.pos.y += UFO_HOVER;
    v.mountable = {
      name: def.name, seat: v.focus, object: v.focus, camDistance: def.cam,
      drive: (input, dt, g) => driveV(v, input, dt, g),
      onExit: (g) => exitV(v, g),
    };
    vehicles.push(v);
    return v;
  }

  // ── 배치(마을 정류장·부두·섬 부두·하늘·발사대)
  const P = I.PLACES;
  const rack = findLand(P.bikeRack.x, P.bikeRack.z, 1.0, 12);
  makeVehicle(bike, rack.x, rack.z, P.bikeRack.rotY + Math.PI / 2, true);
  const sc = findLand(rack.x + Math.cos(P.bikeRack.rotY) * 2.2, rack.z - Math.sin(P.bikeRack.rotY) * 2.2, 1.1, 12);
  makeVehicle(scooter, sc.x, sc.z, P.bikeRack.rotY + Math.PI / 2 + 0.25, true);
  const kt = findLand(11, 5, 1.8, 24);
  makeVehicle(kart, kt.x, kt.z, -2.4, true);
  const dock = findWater(P.boatDock.x, P.boatDock.z, 0.9);
  makeVehicle(sail, dock.x, dock.z, dock.rot, true);
  const d2 = findWater(dock.x + Math.cos(dock.rot) * 6, dock.z - Math.sin(dock.rot) * 6, 0.9);
  makeVehicle(motor, d2.x, d2.z, d2.rot, true);
  const d3 = findWater(dock.x - Math.cos(dock.rot) * 7, dock.z + Math.sin(dock.rot) * 7, 2.2);
  makeVehicle(sub, d3.x, d3.z, d3.rot, true);
  // 조선소 앞바다에 통통배 한 척(잠겨 있으면 '🔒 통통배 — 조선소 …')
  const yard = P.shipyard;
  const d4 = findWater(yard.x, yard.z, 1.0, 120);
  makeVehicle(tugboat, d4.x, d4.z, d4.rot, true);
  // 섬마다 부두에 배 한 척(색이 다른 모터보트 · 돛단배) — 내 탈것과 같은 해금 키
  const dockCols: Record<string, [string, string]> = { dino: ['#7ddc9a', '#dcffe6'], ice: ['#8fc8ff', '#e8f6ff'], mushroom: ['#c5a3ff', '#f1e8ff'], coral: ['#ff9f8a', '#ffe8e0'], desert: ['#ffcf5a', '#fff4cf'], launch: ['#7fb8ff', '#e6f1ff'] };
  for (const [id, d] of Object.entries(P.docks)) {
    const w = findWater(d.x, d.z, 0.9, 320);
    const c = dockCols[id] ?? ['#ff8a9e', '#ffe1e8'];
    if (id === 'ice' || id === 'coral') makeVehicle(sail, w.x, w.z, w.rot, false);
    else makeVehicle({ ...motor, make: () => motorboatModel(c[0], c[1]) }, w.x, w.z, w.rot, false);
  }
  // 하늘: 열기구는 마을 동쪽 언덕(멀리서도 보이는 랜드마크), 비행기는 북쪽 들판
  const bl = findLand(34, -30, 2.4, 60);
  makeVehicle(balloon, bl.x, bl.z, Math.atan2(-bl.x, -bl.z), true);
  const pl = findLand(-10, -70, 3.2, 80);
  makeVehicle(plane, pl.x, pl.z, 0.6, true);
  makeVehicle(rocket, P.launchPad.x, P.launchPad.z, P.launchPad.rotY, true);
  for (const v of vehicles) if (v.def.medium === 'land' || v.def.medium === 'air') reserve(v.pos.x, v.pos.z, v.def.kind === 'balloon' ? 2.2 : v.def.kind === 'plane' ? 3 : 1.3);

  // ── P1 자리: 섬마다 그 섬다운 탈것(멀리 있으니 가까이 갈 때 만든다)
  /** 부두에서 섬 가운데 쪽으로 k 만큼 들어간 마른 평지 */
  const inland = (id: string, k: number, margin: number) => {
    const d = P.docks[id], isl = I.islandById(id);
    if (!d || !isl) return null;
    const x = d.x + (isl.x - d.x) * k, z = d.z + (isl.z - d.z) * k;
    const s = findLandSpot(T, x, z, margin, 60, 1);
    return s ? { ...s, rot: Math.atan2(isl.x - s.x, isl.z - s.z) } : null;
  };
  {
    // 수상바이크: 산호빛섬 부두(다이빙 센터 앞)
    const cd = P.docks.coral;
    if (cd) {
      // 부두의 돛단배와 겹치지 않게(8 m 넘게) 떨어진 물
      const away = (x: number, z: number) => vehicles.every((o) => o.def.medium !== 'water' || Math.hypot(o.pos.x - x, o.pos.z - z) > 8);
      const awayT: Terrain = { ...seaT, blocked: (x, z) => !away(x, z) || blockedAt(x, z) };
      const w = findWaterSpot(awayT, cd.x - 10, cd.z + 8, 0.7, 200, 2, 2) ?? findWater(cd.x - 10, cd.z + 8, 0.7, 200);
      makeVehicle(jetski, w.x, w.z, w.rot, true);
    }
    // 펭귄 썰매: 솜눈섬 눈 언덕 아래 · 모래 버기: 모래시계섬 모래밭
    const sl = inland('ice', 0.32, 1.0);
    if (sl) { makeVehicle(sled, sl.x, sl.z, sl.rot, true); reserve(sl.x, sl.z, 1.3); }
    const bg = inland('desert', 0.25, 1.8);
    if (bg) { makeVehicle(buggy, bg.x, bg.z, bg.rot, true); reserve(bg.x, bg.z, 1.8); }
    // UFO: 별똥별섬 발사대 옆 들판 위에 둥실
    const us = findLandSpot(T, P.launchPad.x + 34, P.launchPad.z + 26, 2.4, 60, 1);
    if (us) { makeVehicle(ufo, us.x, us.z, 0, true); reserve(us.x, us.z, 2.4); }
  }

  // ── 모델 만들기·놓기
  function ensure(v: Veh) {
    if (v.model) return v.model;
    const m = v.def.make();
    v.model = m;
    m.root.name = 'vehicle-' + publicId(v.def.kind);
    m.root.userData.kind = v.def.kind;
    if (v.def.scale) m.root.scale.setScalar(v.def.scale);
    m.root.add(v.focus);
    v.focus.position.set(0, v.def.focusY, 0);
    v.mountable.seat = m.seat;
    v.mountable.object = v.focus;
    applyCurve(m.root);
    // 그림자는 차체·선체 같은 큰 덩어리만(볼트·전조등·손잡이는 그림자 패스에서 뺀다)
    trimSmallShadows(m.root, 0.28);
    groupOf(v.world).add(m.root);
    if (v.personal) applySkin(m.root, skinOf(v.def.kind));
    placeV(v, game?.time ?? 0);
    return m;
  }
  function placeV(v: Veh, t: number) {
    if (!v.model) return;
    if (v.def.place) v.def.place(v, t, rt); else defaultPlace(v, t);
  }

  /** 매체별 기본 놓기: 땅은 바퀴 높이로 기울이고, 물은 파도 앞뒤·좌우 높이로 출렁인다 */
  function defaultPlace(v: Veh, t: number) {
    const m = v.model;
    if (!m) return;
    const med = v.def.medium;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, v.h);
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    let y = v.pos.y;
    const grounded = (med === 'land' && !v.air) || (med === 'air' && v.pos.y <= groundAt(v.pos.x, v.pos.z) + 0.05);
    if (grounded) {
      const k = v.def.kind;
      const L = k === 'kart' || k === 'buggy' ? 0.9 : k === 'plane' ? 1.4 : 0.6, W = k === 'kart' || k === 'buggy' ? 0.6 : k === 'plane' ? 0.8 : 0.3;
      const hf = groundAt(v.pos.x + fx * L, v.pos.z + fz * L), hb = groundAt(v.pos.x - fx * L, v.pos.z - fz * L);
      const hr = groundAt(v.pos.x - fz * W, v.pos.z + fx * W), hl = groundAt(v.pos.x + fz * W, v.pos.z - fx * W);
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan2(hb - hf, 2 * L) + v.pitch, 0, Math.atan2(hr - hl, 2 * W) + v.roll, 'YXZ')));
    } else if (med === 'water' && !v.air) {
      // 뱃머리·꼬리·양옆 수면 차이 + 작은 흔들림
      const L = 1.2, W = 0.6;
      const yb = waterY(v.pos.x + fx * L, v.pos.z + fz * L, t), ys = waterY(v.pos.x - fx * L, v.pos.z - fz * L, t);
      const yr = waterY(v.pos.x - fz * W, v.pos.z + fx * W, t), yl = waterY(v.pos.x + fz * W, v.pos.z - fx * W, t);
      const wp = Math.atan2(ys - yb, 2 * L) * 0.8 + 0.04 * Math.sin(t * 1.3 + v.idx) + v.pitch;
      const wr = Math.atan2(yr - yl, 2 * W) * 0.5 + 0.05 * Math.sin(t * 1.05 + v.idx * 2.1) + v.roll;
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(wp, 0, wr, 'YXZ')));
      y = (yb + ys + yr + yl) * 0.25;
    } else {
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(v.pitch, 0, v.roll, 'YXZ')));
    }
    m.root.quaternion.copy(q);
    m.root.position.set(v.pos.x, y, v.pos.z);
    m.root.updateMatrixWorld(true);
  }

  // ── 효과 내보내기
  function dust(v: Veh, dt: number, amt: number) {
    const sp = Math.abs(v.v);
    if (sp < 2.5 || !v.model) return;
    const surf = I.surfaceAt(v.pos.x, v.pos.z).kind;
    const col = surf === 'sand' || surf === 'desert' ? '#f3dfb6' : surf === 'snow' ? '#ffffff' : surf === 'grass' || surf === 'jungle' ? '#f7fbef' : '#efe6da';
    const grassy = surf === 'grass' || surf === 'jungle';
    const n = sp * dt * (grassy ? 2.2 : 6) * amt;
    for (let i = 0; i < 3 && fxRnd() < n - i; i++) {
      tmpV.copy(v.model.tail).applyMatrix4(v.model.root.matrixWorld);
      const f = fwdOf(v);
      puffs.emit(tmpV.x + (fxRnd() - 0.5) * 0.6, tmpV.y + 0.05, tmpV.z + (fxRnd() - 0.5) * 0.6, -f.x * sp * 0.15 + (fxRnd() - 0.5), 0.6 + fxRnd(), -f.z * sp * 0.15 + (fxRnd() - 0.5),
        { life: 0.7 + fxRnd() * 0.5, s0: 0.05, s1: 0.16 + sp * 0.008, color: col, drag: 2.5, flat: 0.75 });
    }
  }
  function wake(v: Veh, dt: number, t: number) {
    const sp = Math.abs(v.v);
    if (sp < 1.5 || !v.model || v.air) return;
    const m = v.model;
    const f = fwdOf(v), side = new THREE.Vector3(f.z, 0, -f.x);
    const n = Math.min(6, sp * dt * 9);
    for (let i = 0; i < 6 && fxRnd() < n - i; i++) {
      // 항적: 꼬리에서 양옆으로 퍼지는 흰 거품
      tmpV.copy(m.tail).applyMatrix4(m.root.matrixWorld);
      const s = fxRnd() < 0.5 ? -1 : 1;
      puffs.emit(tmpV.x + side.x * s * 0.4, waterY(tmpV.x, tmpV.z, t) + 0.16, tmpV.z + side.z * s * 0.4,
        side.x * s * (0.8 + sp * 0.08), 0, side.z * s * (0.8 + sp * 0.08),
        { life: 1.8 + fxRnd(), s0: 0.16, s1: 0.36 + sp * 0.008, color: '#ffffff', drag: 1.4, flat: 0.35 });
    }
    // 뱃머리 물보라
    if (sp > 6) {
      const ns = Math.min(3, sp * dt * 3);
      for (let i = 0; i < 3 && fxRnd() < ns - i; i++) {
        const s = fxRnd() < 0.5 ? -1 : 1;
        tmpV.set(s * 0.6, 0.05, 1.4).applyMatrix4(m.root.matrixWorld);
        puffs.emit(tmpV.x, Math.max(tmpV.y, waterY(tmpV.x, tmpV.z, t) + 0.05), tmpV.z, side.x * s * (2 + fxRnd() * 2) + f.x * sp * 0.2, 2.5 + fxRnd() * 2.5 + sp * 0.08, side.z * s * (2 + fxRnd() * 2) + f.z * sp * 0.2,
          { life: 0.6, s0: 0.06, s1: 0.13, color: '#e8fbff', g: -14, drag: 0.6 });
      }
    }
  }
  function bubbles(v: Veh, dt: number) {
    if (!v.model || fxRnd() > dt * (6 + Math.abs(v.v) * 2)) return;
    tmpV.copy(v.model.tail).applyMatrix4(v.model.root.matrixWorld);
    puffs.emit(tmpV.x + (fxRnd() - 0.5) * 0.3, tmpV.y, tmpV.z + (fxRnd() - 0.5) * 0.3, 0, 1.5 + fxRnd(), 0, { life: 1.4, s0: 0.05, s1: 0.11, color: '#d8f6ff', g: 1.5, drag: 1.5 });
  }
  /** 펑! 부르기 연기 고리 */
  function poof(x: number, y: number, z: number, r = 1.4) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + fxRnd() * 0.3;
      puffs.emit(x + Math.cos(a) * r * 0.5, y + 0.3 + fxRnd() * 0.4, z + Math.sin(a) * r * 0.5, Math.cos(a) * 3.2, 1.2 + fxRnd() * 1.4, Math.sin(a) * 3.2,
        { life: 0.9 + fxRnd() * 0.4, s0: 0.25, s1: 0.6 + fxRnd() * 0.3, color: i % 3 === 0 ? '#ffe3ee' : '#ffffff', drag: 2.8 });
    }
    for (let i = 0; i < 6; i++) fire.emit(x + (fxRnd() - 0.5) * r, y + 0.6 + fxRnd() * 0.8, z + (fxRnd() - 0.5) * r, 0, 2 + fxRnd() * 2, 0, { life: 0.5, s0: 0.08, s1: 0.02, color: '#fff3a0', drag: 2 });
  }

  // ── 저장(flags.vehicles)
  const flags = (): VehFlags => {
    const st = game?.state;
    if (!st) return readFlags(null);
    const raw = st.flags.vehicles;
    // 처음 한 번만 고쳐 쓴다(이후엔 같은 객체)
    if (!raw || (raw as { __ok?: boolean }).__ok !== true) {
      const f = readFlags(raw);
      Object.defineProperty(f, '__ok', { value: true, enumerable: false });
      st.flags.vehicles = f;
    }
    return st.flags.vehicles as VehFlags;
  };
  const save = () => game?.state.save();
  /** P1 저장 칸(skins · skinBox · top · stunts · pick) — 이상한 값이면 새로 */
  const p1f = () => {
    const f = flags() as VehFlags & { skins?: Record<string, number>; skinBox?: string[]; top?: Record<string, number>; stunts?: number; pick?: { day: number; taken: string[] } };
    if (!f.skins || typeof f.skins !== 'object' || Array.isArray(f.skins)) f.skins = {};
    if (!Array.isArray(f.skinBox)) f.skinBox = [];
    if (!f.top || typeof f.top !== 'object' || Array.isArray(f.top)) f.top = {};
    if (typeof f.stunts !== 'number') f.stunts = 0;
    return f as VehFlags & { skins: Record<string, number>; skinBox: string[]; top: Record<string, number>; stunts: number; pick?: { day: number; taken: string[] } };
  };
  /** 그 종류에 입힌 스킨(0 = 기본) */
  const skinOf = (kind: string) => {
    const n = Number(p1f().skins[publicId(kind)] ?? 0);
    return Number.isInteger(n) && n >= 0 && n <= SKIN_COUNT ? n : 0;
  };

  /** 내 탈것(종류마다 한 대). 없으면 null */
  const personalOf = (kind: string) => vehicles.find((v) => v.personal && v.def.kind === kind) ?? null;

  /** 저장된 자리로 내 탈것을 옮기거나(없으면 만들어) 놓는다 — 자리가 그 매체에 안 맞으면 무시. 달 로버는 달에 갈 때(spawnRover) */
  function restoreAt(kind: string) {
    const def = kinds.get(kind);
    const at = flags().at[kind];
    if (!def || !at || def.medium === 'pad' || def.world === 'space') return;
    const okSpot = def.medium === 'water' ? deepAt(T, at.x, at.z, (def.depth ?? 0.9) * 0.6) : dryAt(T, at.x, at.z);
    if (!okSpot) return;
    const v = personalOf(kind) ?? makeVehicle(def, at.x, at.z, at.h, true);
    if (v.world !== 'earth') moveWorld(v, 'earth');
    const gy = I.heightAt(at.x, at.z);
    v.pos.set(at.x, def.medium === 'water' ? 0 : def.medium === 'air' && at.y !== undefined ? Math.max(gy, at.y) : gy, at.z);
    v.h = at.h;
    placeV(v, game?.time ?? 0);
  }
  function rememberAt(v: Veh) {
    if (!v.personal || v.def.medium === 'pad') return;
    // UFO 가 우주에 내렸으면 지구 자리는 그대로 둔다(다시 불러온다)
    if (v.world === 'space' && v.def.world !== 'space') return;
    const f = flags();
    f.at[v.def.kind] = { x: +v.pos.x.toFixed(2), z: +v.pos.z.toFixed(2), h: +v.h.toFixed(3), ...(v.def.medium === 'air' || v.def.world === 'space' ? { y: +v.pos.y.toFixed(2) } : {}) };
    save();
  }
  /** UFO 처럼 두 세계를 오가는 탈것을 다른 세계로 */
  function moveWorld(v: Veh, w: 'earth' | 'space') {
    if (v.world === w) return;
    v.world = w;
    if (v.model) groupOf(w).add(v.model.root);
  }

  // ── 해금·소유
  const econ = (): GateEcon | null => (game?.econ as GateEcon | null | undefined) ?? null;
  const ridable = (kind: string) => {
    const def = kinds.get(kind) ?? dataKinds.get(kind);
    return !!def && isRidable(kind, def.unlockKey, econ());
  };
  const popped = () => { try { return Number(game?.ext?.treasure?.stats?.()?.popped ?? 0) || 0; } catch { return 0; } };
  /** 타기 안내: 열렸으면 '이름 타기', 잠겼으면 종류별 조건(열기구는 지금 열 수 있으면 '열기구 열기') */
  function gateFor(def: KindDef): GateResult & { ready?: boolean } {
    const e = econ();
    const g0 = gateLabel(def, e);
    if (g0.ok || !game) return g0;
    if (def.kind === 'balloon') {
      const b = balloonGate(popped(), Number(game.econ?.stars ?? 0), false);
      return { ok: false, label: b.text, why: b.text, ready: b.ready };
    }
    const t = def.lockText?.(game);
    return t ? { ok: false, label: t, why: t } : g0;
  }
  /** 도감 칸 기록(처음 한 번, 목격처럼 도감만) */
  function recordDex(def: { dex?: string }) {
    const st = game?.state;
    const sp = def.dex ? VEHICLE_DEX_BY_ID.get(def.dex) : undefined;
    if (!st || !sp || st.dex[sp.id]) return;
    st.collect({ species: sp, keep: false, activity: 'vehicle' });
  }
  /** 경제가 생기면 이미 열린 탈것을 소유 목록에 맞춘다 */
  let synced = false;
  function syncOwned() {
    const e = econ();
    if (!e || synced) return;
    synced = true;
    const f = flags();
    let changed = false;
    for (const def of kinds.values()) {
      if (def.medium === 'pad' || f.owned.includes(def.kind)) continue;
      if (isRidable(def.kind, def.unlockKey, e)) { f.owned.unshift(def.kind); changed = true; recordDex(def); }
    }
    if (changed) save();
    p1Check();
  }
  /** P1 저절로 해금(비행기 부품 1+ · UFO 우주 도감 80% · 수상바이크 바다 친구 10종) */
  function p1Check() {
    const e = game?.econ;
    if (!game || !e) return;
    const sp = game.state.dexCount('space'), sea = game.state.dexCount('sea');
    let parts = 0;
    try { parts = e.rocket?.().count ?? 0; } catch { parts = 0; }
    autoUnlocks(e as unknown as P1Econ, { parts, spaceGot: sp.got, spaceTotal: sp.total, seaGot: sea.got, moon: false });
  }
  /** 해금 안내 카드(한 프레임에 몰리면 한 장으로) */
  const pendingCards: string[] = [];
  function flushCards() {
    if (!game || !pendingCards.length) return;
    const list = pendingCards.splice(0);
    if (list.length > 2) {
      game.hud.card({ title: `탈것 ${list.length}종이 열렸어요!`, body: '차고(T)에서 보고 F 로 불러요 ✨', icon: '🎉', color: '#ffd0e6', ms: 4200 });
      return;
    }
    for (const k of list) {
      const def = kinds.get(k);
      if (!def) continue;
      const where: Record<string, string> = {
        jetski: '산호빛섬 부두에 있어요', sled: '솜눈섬 눈밭에 있어요', buggy: '모래시계섬 모래밭에 있어요', ufo: '별똥별섬 발사대 옆에 둥실',
        rover: '달 착륙장 옆에 있어요 — E 로 타요', sub: '마을 부두 앞바다에 있어요', sail: '마을 부두에 매어 있어요',
      };
      game.hud.card({ title: `${def.name} 열렸어요!`, body: `${where[k] ?? '가까이 가서 E'} · F 로 불러요`, icon: ICON[k] ?? '✨', color: '#ffe7c2', ms: 4200 });
    }
  }

  // ── 탑승 중 운전(종류에 맡긴다)
  function driveV(v: Veh, input: Input, dt: number, g: Game) {
    if (!v.model || dt <= 0) { placeV(v, g.time); return; }
    v.def.drive(v, input, dt, g, rt);
    const sp = Math.abs(v.v);
    if (sp > v.top) v.top = sp;
  }

  // ── 로켓 발사
  let launch: RocketLaunch | null = null;
  let whiteOut = 0;

  // ── 타기 / 내리기
  function mountV(v: Veh, g: Game) {
    ensure(v);
    v.mounted = true;
    v.v = 0; v.vy = 0; v.steer = 0; v.air = false; v.top = 0;
    riders.n = 1; riders.pedal = false;
    v.def.mount?.(v, g, rt);
    g.player.mount(v.mountable);
    if (v.def.kind === 'rocket') {
      launch = new RocketLaunch(v, g, rt, launchFx);
    } else g.cam.yaw = v.h + Math.PI;
    // 탄 차례 기억(F 는 가장 최근 것부터) + 처음 타면 도감 칸
    if (v.def.medium !== 'pad') noteOwned(flags(), v.def.kind);
    recordDex(v.def);
    save();
    rt.emit('mount', { vehicle: publicId(v.def.kind) });
  }
  function exitV(v: Veh, g: Game): THREE.Vector3 {
    v.mounted = false;
    if (v.def.kind === 'rocket' && launch && !launch.done) { launch.abort(); launch = null; }
    let out = v.def.exit?.(v, g, rt) ?? null;
    dropBody(v, g);
    if (!out) { out = v.pos.clone().addScaledVector(new THREE.Vector3(Math.cos(v.h), 0, -Math.sin(v.h)), 1.0); }
    if (v.def.medium !== 'air') v.v = 0;
    v.steer = 0;
    v.air = false; v.vy = 0;
    if (v.def.medium === 'water') v.pos.y = 0;
    placeV(v, g.time);
    rememberAt(v);
    riders.n = 1; riders.pedal = false;
    const pub = publicId(v.def.kind);
    const top = Math.round(v.top * 10) / 10;
    if (top > 0 && noteTop(p1f().top, pub, top)) save();
    rt.emit('dismount', { vehicle: pub, top });
    return out;
  }

  // ── F 부르기
  /** 플레이어가 물속인가(수영·잠수 또는 발밑이 깊은 물) */
  const inWater = (g: Game) => g.world === 'earth' && (g.player.mode === 'swim' || g.player.mode === 'dive' || deepAt(T, g.player.pos.x, g.player.pos.z, 0.95));
  /** 그 종류를 부를 자리 */
  function spotFor(medium: Medium, kind: string, g: Game): SummonSpot | null {
    const def = kinds.get(kind);
    if (!def || !worldOk(def, g.world)) return null;
    const p = g.player.pos;
    const f = g.player.facing?.() ?? new THREE.Vector3(0, 0, -1);
    const yaw = Math.atan2(f.x, f.z);
    if (g.world === 'space') {
      // 달: 앞 3 m(행성 가장자리 안)
      const x = p.x + f.x * 3, z = p.z + f.z * 3;
      if (def.kind === 'rover' && Math.hypot(x - MOON_C.x, z - MOON_C.z) > MOON_RIDE_R) return null;
      return { x, z, rot: yaw };
    }
    if (medium === 'water') {
      const sx = p.x + f.x * 2.5, sz = p.z + f.z * 2.5;
      return findWaterSpot(T, sx, sz, def.depth ?? 0.9, 50, 1.5, def.kind === 'duck_tube' ? 1 : 2.5);
    }
    if (inWater(g)) return def.kind === 'ufo' ? { x: p.x + f.x * 3, z: p.z + f.z * 3, rot: yaw } : null;
    const s = findLandSpot(T, p.x + f.x * 2.6, p.z + f.z * 2.6, def.margin ?? 1, 12, 0.5);
    return s ? { x: s.x, z: s.z, rot: yaw } : null;
  }
  /** 그 자리에 내 탈것을 놓는다(없으면 만든다) */
  function bring(kind: string, spot: SummonSpot, g: Game | null): Veh | null {
    const def = kinds.get(kind);
    if (!def) return null;
    const v = personalOf(kind) ?? makeVehicle(def, spot.x, spot.z, spot.rot, true);
    if (v.mounted) return null;
    if (g) moveWorld(v, def.world === 'space' ? 'space' : def.world === 'both' ? g.world : 'earth');
    const gy = def.medium === 'water' ? 0 : groundAt(spot.x, spot.z);
    v.pos.set(spot.x, def.kind === 'ufo' ? Math.max(gy, v.world === 'earth' ? 0 : gy) + UFO_HOVER : gy, spot.z);
    v.h = spot.rot; v.v = 0; v.vy = 0; v.air = false; v.pitch = 0; v.roll = 0; v.steer = 0;
    ensure(v);
    v.model!.root.visible = true;
    placeV(v, g?.time ?? 0);
    poof(spot.x, def.medium === 'water' ? waterY(spot.x, spot.z, g?.time ?? 0) : v.pos.y, spot.z, def.kind === 'tugboat' || def.kind === 'motor' || def.kind === 'ufo' ? 2.4 : 1.4);
    noteOwned(flags(), kind);
    rememberAt(v);
    rt.emit('summon', { vehicle: publicId(kind) });
    return v;
  }
  /** 정해진 종류 부르기(잠겨 있거나 자리가 없으면 false) */
  function summon(kindIn: string, o: { quiet?: boolean; force?: boolean } = {}): boolean {
    const g = game;
    if (!g || g.player.mounted) return false;
    const kind = normKind(kindIn);
    const def = kinds.get(kind);
    if (!def || def.medium === 'pad') { if (!o.quiet) g.ui.toast('그 탈것은 부를 수 없어요'); return false; }
    if (!worldOk(def, g.world)) { if (!o.quiet) g.ui.toast(g.world === 'space' ? `${def.name}은(는) 지구에서 불러요 🌏` : `${def.name}은(는) 달에서 불러요 🌙`); return false; }
    if (!o.force && !ridable(kind)) {
      if (!o.quiet) g.ui.toast(gateFor(def).why || `🔒 ${def.name}`);
      return false;
    }
    const spot = spotFor(def.medium, kind, g);
    if (!spot) {
      if (!o.quiet) g.ui.toast(def.medium === 'water' ? `근처에 ${def.name}이(가) 뜰 물이 없어요 🌊` : `여기선 ${def.name}을(를) 꺼낼 자리가 없어요`);
      return false;
    }
    bring(kind, spot, g);
    if (!o.quiet) g.ui.toast(`${def.name} 등장! 펑 ✨`);
    return true;
  }
  /** F: 지금 매체에 맞는, 가장 최근에 얻은/탄 탈것 */
  function summonAuto(): boolean {
    const g = game;
    if (!g) return false;
    syncOwned();
    const pick = chooseSummon(flags().owned, (k) => { const d = kinds.get(k); return d && worldOk(d, g.world) ? d.medium : null; }, ridable, (m, k) => spotFor(m, k, g));
    if (!pick) {
      const any = flags().owned.some((k) => { const d = kinds.get(k); return d && d.medium !== 'pad' && ridable(k); });
      g.ui.toast(!any ? '아직 부를 탈것이 없어요 — 상점·작업대에서 구해 봐요 🚲' : g.world === 'space' ? '달에서 부를 탈것이 없어요 🌙' : inWater(g) ? '물 위에서 탈 배가 없어요 🌊' : '여기선 부를 수 있는 탈것이 없어요');
      return false;
    }
    bring(pick.kind, pick.spot, g);
    g.ui.toast(`${kinds.get(pick.kind)!.name} 등장! 펑 ✨`);
    return true;
  }

  // ── 달 로버: 달에 처음 내리면 받고, 착륙장 옆에 둔다
  function spawnRover(): Veh | null {
    if (!game || game.world !== 'space') return null;
    const planet = game.space?.planet ?? 'moon';
    if (planet !== 'moon') return null;
    const have = personalOf('rover');
    if (have) return have;
    const at = flags().at.rover;
    const ls = game.space?.landingSpawn;
    const base = ls ? { x: ls.x, z: ls.z } : { x: MOON_C.x, z: MOON_C.z + 6 };
    const ok = at && Math.hypot(at.x - MOON_C.x, at.z - MOON_C.z) < MOON_RIDE_R;
    const x = ok ? at!.x : base.x + 6, z = ok ? at!.z : base.z - 2;
    const v = makeVehicle(kinds.get('rover') ?? rover, x, z, ok ? at!.h : Math.PI * 0.5, true);
    ensure(v);
    return v;
  }

  // ── 로봇팔(잠수정)·빔(UFO): 그날의 반짝이 자리
  const markerMat = new THREE.MeshStandardMaterial({ color: '#fff6c8', emissive: '#ffe58a', emissiveIntensity: 1.4, roughness: 0.3, transparent: true, opacity: 0.92 });
  const makeMarker = (col: string) => {
    const g = new THREE.Group();
    g.name = 'vehicles-sparkle';
    const core = new THREE.Mesh(sphere(0.22, 20, 14), markerMat);
    const ring = new THREE.Mesh(torus(0.5, 0.04, 8, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    g.add(core, ring);
    g.visible = false;
    return g;
  };
  const armMarker = makeMarker('#9ff0ff');
  earthGroup.add(armMarker);
  const beamMarker = makeMarker('#ffc6ef');
  const today = () => Math.floor(game?.env?.day ?? game?.econ?.day?.() ?? 0);
  const pickLog = () => {
    const f = p1f();
    const d = today();
    if (!f.pick || f.pick.day !== d || !Array.isArray(f.pick.taken)) f.pick = { day: d, taken: [] };
    return f.pick;
  };
  /** 심해·해구인가(geo 가 없으면 깊이 12 m 이상) */
  const deepSea = (x: number, z: number) => {
    const sea = game?.geo?.zoneAt?.(x, z)?.sea;
    if (sea) return sea === 'deep' || sea === 'trench' || (sea === 'offshore' && I.heightAt(x, z) < -14);
    return I.waterLevelAt(x, z) === 0 && I.heightAt(x, z) < -12;
  };
  /** 둘레 칸마다(칸 cell m) 그날 반짝이 하나씩(확률 p) — 결정적 */
  function spotsNear(prefix: string, x: number, z: number, cell: number, p: number, test: (x: number, z: number) => boolean, yAt: (x: number, z: number) => number): PickSpot[] {
    const out: PickSpot[] = [];
    const cx0 = Math.floor(x / cell), cz0 = Math.floor(z / cell), d = today();
    const done = pickLog().taken;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const cx = cx0 + i, cz = cz0 + j;
      const key = `${prefix}:${cx},${cz}`;
      if (done.includes(key)) continue;
      const r = ctx.rng(`vehicles:${prefix}:${cx},${cz}:${d}`);
      if (r() > p) continue;
      const sx = (cx + 0.15 + r() * 0.7) * cell, sz = (cz + 0.15 + r() * 0.7) * cell;
      if (!test(sx, sz)) continue;
      out.push({ key, x: sx, y: yAt(sx, sz), z: sz });
    }
    return out;
  }
  const nearestSpot = (list: PickSpot[], x: number, z: number) => {
    let best: PickSpot | null = null, bd = Infinity;
    for (const s of list) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
    return best ? { s: best, d: bd } : null;
  };
  /** 지금 탄 탈것 */
  const ridingV = (): Veh | null => {
    const m = game?.player.mounted;
    return m ? vehicles.find((x) => x.mountable === m) ?? null : null;
  };
  let armSpot: PickSpot | null = null, beamSpot: PickSpot | null = null;
  /** 재료 주기(econ.give, 없으면 가방) + harvest 이벤트 */
  function giveItem(id: string, n: number, kind: string, why: string, island: string): number {
    const e = game?.econ;
    let got = n;
    if (e && typeof e.give === 'function') got = e.give(id, n, why);
    else game?.state.addItem(id, n);
    if (got > 0) rt.emit('harvest', { kind, item: id, n: got, island });
    return got;
  }
  /** 로봇팔: 심해·해구 종(dive 굴림) 또는 재료 */
  function armPick(v: Veh, s: PickSpot) {
    if (!game) return;
    pickLog().taken.push(s.key);
    save();
    v.st.arm = 1;
    armSpot = null;
    armMarker.visible = false;
    const r = ctx.rng(`vehicles:armroll:${s.key}:${today()}`);
    // 심해·해구 종 중 잡을 수 있는 것만 — 목격 전용(모사사우루스)·공룡·고대종은 뺀다. 시간대는 rollCatch 의 place:{} 가 거른다
    const pool = [...game.state.species.values()].filter((sp) => {
      const x = sp as Species & { witness?: boolean };
      if (x.witness || sp.tags?.includes('witness') || sp.category === 'dino' || sp.category === 'ancient') return false;
      return (sp.where ?? []).some((w) => w.zone === 'deep' || w.zone === 'trench');
    });
    if (pool.length && r() >= 0.3) {
      const e = game.econ;
      let res: RollResult | null = null;
      if (e && typeof e.rollCatch === 'function') {
        try {
          res = e.rollCatch({ activity: 'dive', pool: pool as unknown as RollSpecies[], place: {} } as Parameters<typeof e.rollCatch>[0]);
          if (res.species) res = (e.reportCatch(res) as unknown as RollResult | void) ?? res;
        } catch (err) { console.error('[vehicles arm rollCatch]', err); res = null; }
      }
      let sp: Species | undefined = res?.species ? game.state.species.get(res.species.id) : undefined;
      if (!sp && !res) {
        // 경제가 없으면: 낮은 등급이 잘 나오는 간단 굴림 + catch 이벤트
        const w = pool.map((x) => ({ x, w: [0, 55, 27, 12, 5, 1][x.rarity] ?? 1 }));
        sp = pickW(w, r()).x;
        rt.emit('catch', { activity: 'dive', species: sp, rarity: sp.rarity, combo: 0 });
      }
      if (sp) {
        const size = res?.size ?? sp.len ?? undefined;
        game.ui.showCatch({ species: sp, size, sizeText: size ? `${size.toFixed(1)}cm` : undefined, variant: res?.variant, activity: 'dive', line: '로봇팔로 쏙! 심해 친구를 건졌다 🦾' });
        rt.sfx('pick', { pitch: 0.8 });
        return;
      }
    }
    const it = pickW(ARM_ITEMS, r());
    const n = it.n[0] + Math.floor(r() * (it.n[1] - it.n[0] + 1));
    const got = giveItem(it.id, n, it.kind, 'sub-arm', 'sea');
    if (got > 0) game.ui.toast(`🦾 집었다! ${ITEM_NAME[it.id] ?? it.id} ×${got}`);
    rt.sfx('pick', { pitch: 0.9 });
  }
  /** 빔: 아래 반짝이를 끌어올린다(땅 종류별 재료) */
  const flyers: Array<{ obj: THREE.Object3D; v: Veh; t: number; from: THREE.Vector3 }> = [];
  function beamPick(v: Veh, s: PickSpot) {
    if (!game) return;
    pickLog().taken.push(s.key);
    save();
    v.st.beam = 1;
    beamSpot = null;
    const kind = game.world === 'space' ? 'space' : (() => {
      const k = I.surfaceAt(s.x, s.z).kind;
      return k === 'sea' ? 'sea' : k === 'sand' ? 'sand' : k === 'desert' ? 'desert' : k === 'snow' ? 'snow' : k === 'rock' || k === 'cliff' ? 'rock' : 'grass';
    })();
    const r = ctx.rng(`vehicles:beamroll:${s.key}:${today()}`);
    const it = pickW(BEAM_ITEMS[kind] ?? BEAM_ITEMS.grass, r());
    const n = it.n[0] + Math.floor(r() * (it.n[1] - it.n[0] + 1));
    const island = game.world === 'space' ? 'moon' : I.islandAt(s.x, s.z)?.id ?? 'sea';
    const got = giveItem(it.id, n, it.kind, 'ufo-beam', island);
    if (got > 0) game.ui.toast(`🛸 슝~ ${ITEM_NAME[it.id] ?? it.id} ×${got} 끌어올렸다!`);
    rt.sfx('shiny', { pitch: 1.2, vol: 0.6 });
    // 반짝이가 빔을 타고 접시로 쏙
    beamMarker.visible = true;
    flyers.push({ obj: beamMarker, v, t: 0, from: new THREE.Vector3(s.x, s.y, s.z) });
  }

  // ── 바깥 API(game.vehicles)
  const api: VehiclesApi & VehiclesP1 = {
    current(): VehicleNow | null {
      const v = ridingV();
      if (!v) return null;
      const seats = v.def.seats ?? seatsOf(v.def.kind);
      const r = rt.riders();
      return { kind: publicId(v.def.kind), speed: Math.abs(v.v), boat: v.def.boat, ...(v.def.seats ? { seats } : {}), riders: Math.min(seats, r.n), ...(r.pedal ? { coPedal: true } : {}) } as VehicleNow;
    },
    owned: () => { syncOwned(); return flags().owned.map(publicId); },
    summon: (kind: string) => summon(kind),
    isBoat(kind: string) {
      const k = normKind(kind);
      return kinds.get(k)?.boat ?? dataKinds.get(k)?.boat ?? false;
    },
    registerKind(raw: VehicleKindDef | KindDef) {
      const d = raw as Partial<KindDef> & VehicleKindDef;
      const kind = normKind(String(d.kind ?? ''));
      if (!kind) return;
      const unlockKey = (d.unlockKey as string | undefined) ?? (d.unlock as string | undefined) ?? unlockKeyOf(kind);
      if (typeof d.make === 'function' && typeof d.drive === 'function') {
        const boat = !!d.boat;
        const full: KindDef = {
          id: d.id, cam: 1.5, view: 200, reach: 2.5, speed: 10, focusY: 0.4, land: !boat, medium: boat ? 'water' : 'land',
          ...d, kind, name: d.name ?? kind, boat, unlockKey, make: d.make, drive: d.drive,
        } as KindDef;
        kinds.set(kind, full);
        dataKinds.delete(kind);
        // 이미 놓인 그 종류도 새 정의로(다시 등록해 바꿔 끼우기)
        for (const v of vehicles) if (v.def.kind === kind) { v.def = full; v.mountable.name = full.name; v.mountable.camDistance = full.cam; }
        if (flags().at[kind]) restoreAt(kind);
      } else {
        dataKinds.set(kind, { kind, name: d.name ?? kind, boat: !!d.boat, seats: d.seats, unlockKey });
      }
    },
    setPassenger(o) {
      const v = ridingV();
      // 뒷자리가 실제로 있는 모델만(통통배는 seats:2 지만 seat2 가 없다)
      if (!v || (v.def.seats ?? 1) < 2 || !v.model?.seat2) { riders.n = 1; riders.pedal = false; return null; }
      riders.n = o?.on ? 2 : 1;
      riders.pedal = !!(o?.on && o.pedal);
      return v.model?.seat2 ?? null;
    },
    seat(i = 0) {
      const v = ridingV();
      if (!v?.model) return null;
      return i === 0 ? v.model.seat : i === 1 && (v.def.seats ?? 1) >= 2 ? v.model.seat2 ?? null : null;
    },
    wind,
    padPose() {
      const r = vehicles.find((v) => v.def.kind === 'rocket');
      const x = r?.pos.x ?? P.launchPad.x, z = r?.pos.z ?? P.launchPad.z;
      return { x, y: r?.pos.y ?? I.heightAt(x, z), z, rotY: r?.h ?? P.launchPad.rotY };
    },
    stats: () => { const f = p1f(); return { top: { ...f.top }, stunts: f.stunts }; },
  };
  // P1 종류는 registerKind 로(자리는 위에서 먼저 잡아 두었다 — 저장된 자리가 있으면 그리로 옮긴다)
  for (const k of P1_KINDS) api.registerKind(k as unknown as VehicleKindDef);

  // ── 차고(스킨) 패널
  const pubOwned = () => {
    const out: string[] = [];
    for (const k of flags().owned) {
      const d = kinds.get(k);
      if (!d || d.medium === 'pad' || out.includes(k)) continue;
      if (!ridable(k)) continue;
      out.push(k);
    }
    return out.reverse();
  };
  /** 차고에서 스킨 입히기(가방 것은 차고로 옮긴다) */
  function chooseSkin(kind: string, n: number): boolean {
    if (!game) return false;
    const pub = publicId(kind);
    const ok = applySkinChoice(p1f(), pub, n, game.state.bag, (id) => {
      // 경제에는 '가방에서 빼기' 호출이 없다 — 스킨은 가방 칸을 안 쓰니 상태에서 바로 뺀다
      game.state.addItem(id, -1);
    });
    if (!ok) return false;
    for (const v of vehicles) if (v.personal && v.def.kind === kind && v.model) applySkin(v.model.root, n);
    save();
    return true;
  }
  if (game) {
    game.hud.registerPanel({
      kind: 'garage', title: '내 탈것 차고', color: '#ffd0e6', icon: '🎨',
      meta: () => `${pubOwned().length}대`,
      render(body, c) {
        const list = pubOwned();
        const f = p1f();
        if (!list.length) { body.innerHTML = '<p style="color:#4a3b2a;padding:12px">아직 탈것이 없어요 — 상점·작업대에서 구해 봐요 🚲</p>'; return; }
        body.innerHTML = '<p style="color:#4a3b2a;margin:4px 0 10px">스킨은 두근두근 캡슐머신 · 금상자에서 나와요. 눌러서 입혀요 ✨</p>';
        for (const k of list) {
          const def = kinds.get(k)!;
          const pub = publicId(k);
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;margin:6px 0;border-radius:14px;background:#fff8e8;color:#4a3b2a;box-shadow:0 2px 0 #ecd9b4';
          const seats = def.seats ?? 1;
          row.innerHTML = `<div style="font-size:26px">${ICON[k] ?? '✨'}</div><div style="flex:1"><b>${c.h.esc(def.name)}</b><div style="font-size:12px;opacity:.8">${def.kind === 'sail' ? '순풍 35 / 역풍 15' : c.h.fmt(Math.round(def.speed))} m/s${seats >= 2 ? ' · 2인승 🫂' : ''}</div></div>`;
          const cur = skinOf(k);
          const sw = document.createElement('div');
          sw.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end';
          const opts = [{ n: 0, name: '기본', hex: '#fffaf2' }, ...SKINS];
          for (const s of opts) {
            const have = skinOwned(pub, s.n, game.state.bag, f.skinBox);
            const b = c.h.button(`<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${s.hex};border:2px solid #fff;box-shadow:0 0 0 1px #d8c6a4;vertical-align:-2px"></span> ${c.h.esc(s.name)}${have ? '' : ' 🔒'}`, () => {
              if (!have) { game.ui.toast(`🔒 ${s.name} 스킨 — 캡슐머신·금상자에서 나와요 (${skinId(pub, s.n)})`); return; }
              if (chooseSkin(k, s.n)) { game.ui.toast(`${def.name}에 ${s.name} 입혔어요 🎨`); c.rerender(); }
            });
            b.style.opacity = have ? '1' : '0.5';
            if (cur === s.n) b.style.outline = '2px solid #ff8fb8';
            sw.appendChild(b);
          }
          row.appendChild(sw);
          body.appendChild(row);
        }
      },
    });
    game.hud.registerHotkey({
      id: 'vehicles:garage', code: 'KeyT', label: '탈것 꾸미기', hint: true, panel: 'garage',
      when: () => pubOwned().length > 0,
      run: () => game.hud.toggle('garage'),
    });

    // ── 바람 칩(요트·열기구를 탈 때만)
    game.hud.registerChip({
      id: 'vehicles:wind', order: 30, peek: 'live',
      render(el) {
        el.innerHTML = '<div class="chip dl-card" title="바람" style="display:flex;align-items:center;gap:6px"><span class="arr" style="display:inline-block;font-size:18px;color:#5aa9e6;transition:transform .25s">⬆</span><span class="v">—</span></div>';
        el.style.display = 'none';
      },
      update(el) {
        const v = ridingV();
        const on = !!v && (v.def.kind === 'sail' || v.def.kind === 'balloon');
        el.style.display = on ? '' : 'none';
        if (!on || !v) return;
        const w = wind();
        const arr = el.querySelector('.arr') as HTMLElement | null;
        const tx = el.querySelector('.v') as HTMLElement | null;
        if (arr) arr.style.transform = `rotate(${windArrowRotation(w.angle, game.cam.yaw).toFixed(3)}rad)`;
        const text = v.def.kind === 'sail' ? `${windWord(v.h, w.angle)} ${Math.round(yachtMaxSpeed(v.h, w.angle))} m/s` : '바람 따라 둥실 6 m/s';
        if (tx && tx.textContent !== text) tx.textContent = text;
      },
    });
  }

  if (game) {
    game.vehicles = api;
    game.state.register([...VEHICLE_DEX, ...VEHICLE_DEX_EXTRA]);

    // 내 탈것 자리 되살리기
    for (const k of Object.keys(flags().at)) restoreAt(k);

    // ── 상호작용(가장 가까운 탈것) — 잠겨 있으면 '🔒 이름 — 조건' 만 보이고 쓰면 안내만
    game.addProvider('vehicles', (p, g) => {
      if (p.mounted) return null;
      let best: Veh | null = null, bd = Infinity;
      for (const v of vehicles) {
        if (v.mounted || v.world !== g.world) continue;
        const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
        const dy = Math.abs(v.pos.y - p.pos.y);
        if (d < v.def.reach && dy < 4 && d < bd) { best = v; bd = d; }
      }
      if (!best) return null;
      const v = best;
      const gate = gateFor(v.def);
      return {
        id: 'vehicles:ride', label: gate.label, dist: bd * 0.9,
        use: () => {
          if (gate.ok) { mountV(v, g); return; }
          // 열기구: 조건이 되면 ⭐300 을 쓰고 연다
          if (v.def.kind === 'balloon' && gate.ready) {
            if (tryUnlockBalloon(g.econ as unknown as P1Econ, popped())) g.ui.toast('🎈 열기구가 열렸어요! 다시 E 로 타요');
            else g.ui.toast(gate.why);
            return;
          }
          g.ui.toast(gate.why);
        },
      };
    });
    // 발사 중엔 E 가 내리기가 되지 않게(아무것도 안 하는 E)
    game.addProvider('vehicles:launch', () => (launch && !launch.done ? { id: 'vehicles:launching', label: '🚀 두근두근 발사 중…', dist: 0, whileMounted: true, use: () => {} } : null));
    // 잠수정 로봇팔(E) · UFO 빔(E) — 탄 채로. 집을 것이 가까이 있을 때만(수면·땅 위에선 E 는 내리기)
    game.addProvider('vehicles:arm', (_p, g) => {
      const v = ridingV();
      if (!v || v.def.kind !== 'sub' || g.world !== 'earth' || !armSpot || (v.st.arm ?? 0) > 0) return null;
      const s = armSpot;
      const d = Math.hypot(s.x - v.pos.x, s.z - v.pos.z);
      if (d > 5 || Math.abs(s.y - v.pos.y) > 4.5) return null;
      return { id: 'vehicles:arm', label: '🦾 로봇팔로 줍기', dist: d * 0.2, whileMounted: true, use: () => armPick(v, s) };
    });
    game.addProvider('vehicles:beam', () => {
      const v = ridingV();
      if (!v || v.def.kind !== 'ufo' || !beamSpot || (v.st.beam ?? 0) > 0) return null;
      const s = beamSpot;
      const d = Math.hypot(s.x - v.pos.x, s.z - v.pos.z);
      if (d > 6 || v.pos.y - s.y > 30 || v.pos.y < s.y) return null;
      return { id: 'vehicles:beam', label: '🛸 빔으로 끌어올리기', dist: d * 0.2, whileMounted: true, use: () => beamPick(v, s) };
    });

    // ── F = 부르기(코어가 이번 프레임 F 상호작용을 골랐으면 그쪽이 먼저)
    game.hud.registerHotkey({
      id: 'vehicles:summon', code: 'KeyF', label: '탈것 부르기', hint: true,
      when: () => !game.player.mounted && !launch && game.currentAlt?.key !== 'KeyF' && !game.consumedKeys.has('KeyF')
        && flags().owned.some((k) => { const d = kinds.get(k); return !!d && d.medium !== 'pad' && worldOk(d, game.world); }),
      run: () => { summonAuto(); },
    });

    // ── 해금되면: 소유 + 도감 칸. 뗏목은 안내 카드 + 가까운 물에 저절로 둥실, P1 탈것은 안내 카드
    game.state.on((e) => {
      if (e.type === 'arrive' && e.to === 'moon') {
        // 달 첫 도착 → 깡총카 달 로버
        const ec = game.econ;
        if (ec && !ec.isUnlocked('v:rover')) ec.unlock('v:rover', 'moon');
        else if (!ec) noteOwned(flags(), 'rover');
        if (ridable('rover')) spawnRover();
        return;
      }
      if (e.type === 'stunt') { p1f().stunts++; save(); return; }
      if (e.type === 'collect') {
        const cat = (e.species as { category?: string } | undefined)?.category;
        if (cat === 'space' || cat === 'sea') p1Check();
        return;
      }
      if (e.type !== 'unlock') return;
      const key = String(e.key ?? '');
      for (const def of kinds.values()) {
        if (def.unlockKey !== key || def.medium === 'pad') continue;
        noteOwned(flags(), def.kind);
        recordDex(def);
        save();
        if (def.kind === 'raft') {
          game.hud.card({ title: '뗏목 완성!', body: '가까운 물에 둥실 띄워 놨어요. F 로 언제든 불러요 🛶', icon: '🛶', color: '#9fdcff', ms: 4200 });
          if (!summon('raft', { quiet: true })) {
            // 물이 멀면 마을 부두 앞바다에
            const w = findWater(P.boatDock.x, P.boatDock.z, 0.6, 120);
            bring('raft', { x: w.x, z: w.z, rot: w.rot }, game);
          }
        } else if (P1_CARD.has(def.kind) && !pendingCards.includes(def.kind)) pendingCards.push(def.kind);
        if (def.kind === 'rover' && game.world === 'space') spawnRover();
      }
      if (key === 'rocket:pad') recordDex(rocket);
      if (key.startsWith('rocket:part:')) p1Check();
    });
    game.onWorld((w) => {
      earthGroup.visible = w === 'earth';
      if (w !== 'earth' && launch && !launch.done) { launch.abort(); launch = null; }
      armMarker.visible = false; beamMarker.visible = false; armSpot = null; beamSpot = null;
      if (w === 'space' && ridable('rover')) spawnRover();
    });
  }

  // ── 매 프레임: 발사 연출·지연 생성·거리 숨김·쉬는 동안의 흔들림·효과·반짝이 자리
  let spotT = 0;
  ctx.onUpdate((t, dt) => {
    syncOwned();
    flushCards();
    // 발사(탑승 중 drive 대신 여기서 — setWorld 가 탑승 해제를 부르므로)
    if (launch) {
      launch.step(dt);
      if (launch.done) { launch = null; whiteOut = 1; }
    } else if (whiteOut > 0) {
      // 달에 내린 뒤 흰 화면이 천천히 걷힌다
      whiteOut = Math.max(0, whiteOut - dt / 1.3);
      launchFx.setWhite(whiteOut);
      launchFx.setSky(0);
      if (whiteOut <= 0) launchFx.hide();
    }
    const focus = game ? game.player.pos : new THREE.Vector3(ctx.camera.position.x, 0, ctx.camera.position.z);
    const world = game?.world ?? 'earth';
    const moon = (game?.space?.planet ?? 'moon') === 'moon';
    let built = 0;
    for (const v of vehicles) {
      const here = v.world === world && (v.def.kind !== 'rover' || moon);
      const d = Math.hypot(v.pos.x - focus.x, v.pos.z - focus.z);
      const vis = (here && d < v.def.view) || v.mounted;
      if (vis && !v.model && built < 1) { ensure(v); built++; }
      if (!v.model) continue;
      v.model.root.visible = vis;
      if (!vis || v.mounted) continue;
      // 쉬는 동안
      if (v.def.medium === 'water') placeV(v, t);
      v.def.idle?.(v, t, dt, rt);
    }
    // 로봇팔·빔 반짝이(탄 동안, 0.25초마다 고른다)
    const rv = ridingV();
    spotT -= dt;
    if (spotT <= 0) {
      spotT = 0.25;
      armSpot = rv && rv.def.kind === 'sub' && rv.pos.y < -3 ? nearestSpot(spotsNear('arm', rv.pos.x, rv.pos.z, 22, 0.55, deepSea, (x, z) => I.heightAt(x, z) + 0.35), rv.pos.x, rv.pos.z)?.s ?? null : null;
      if (armSpot && Math.hypot(armSpot.x - rv!.pos.x, armSpot.z - rv!.pos.z) > 28) armSpot = null;
      if (rv && rv.def.kind === 'ufo') {
        const yAt = (x: number, z: number) => (game?.world === 'space' ? groundAt(x, z) : Math.max(I.heightAt(x, z), 0)) + 0.3;
        const ok = (x: number, z: number) => (game?.world === 'space' ? Math.hypot(x - MOON_C.x, z - MOON_C.z) < MOON_RIDE_R : true);
        const n = nearestSpot(spotsNear('beam', rv.pos.x, rv.pos.z, 26, 0.5, ok, yAt), rv.pos.x, rv.pos.z);
        beamSpot = n && n.d < 34 ? n.s : null;
      } else beamSpot = null;
    }
    armMarker.visible = !!armSpot;
    if (armSpot) { armMarker.position.set(armSpot.x, armSpot.y + Math.sin(t * 3) * 0.12, armSpot.z); armMarker.scale.setScalar(1 + 0.15 * Math.sin(t * 5)); armMarker.rotation.y = t; }
    if (!flyers.length) {
      beamMarker.visible = !!beamSpot;
      if (beamSpot) {
        if (beamMarker.parent !== groupOf(world)) groupOf(world).add(beamMarker);
        beamMarker.position.set(beamSpot.x, beamSpot.y + Math.sin(t * 3) * 0.12, beamSpot.z);
        beamMarker.scale.setScalar(1 + 0.15 * Math.sin(t * 5)); beamMarker.rotation.y = t;
      }
    }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt / 0.9;
      const k = Math.min(1, f.t);
      if (f.obj.parent !== groupOf(f.v.world)) groupOf(f.v.world).add(f.obj);
      f.obj.position.lerpVectors(f.from, tmpV.copy(f.v.pos).add(new THREE.Vector3(0, 0.2, 0)), k * k);
      f.obj.scale.setScalar(1 - k * 0.7);
      f.obj.rotation.y += dt * 8;
      if (k >= 1) { f.obj.visible = false; flyers.splice(i, 1); }
    }
    if (game && !game.player.mounted) lines.update(dt);
    puffs.update(dt);
    fire.update(dt);
  });

  // 룩 테스트(게임 없음)·촬영 첫 장면에서도 마을 근처 탈것은 바로 보이게
  for (const v of vehicles) if (v.world === 'earth' && Math.hypot(v.pos.x, v.pos.z) < 60) ensure(v);

  // ── 디버그·촬영용(window.__vehicles)
  const byKind = (kind: string, i = 0) => vehicles.filter((x) => x.def.kind === normKind(kind))[i] ?? null;
  if (typeof window !== 'undefined') (window as unknown as { __vehicles?: unknown }).__vehicles = {
    list: vehicles,
    kinds: () => [...kinds.keys()],
    /** 잠금 무시하고 태우기(우주 종류는 지금 세계가 맞을 때) */
    mount: (kind: string, i = 0) => {
      if (!game) return false;
      let v = byKind(kind, i);
      if (v && v.world !== game.world) { if (v.def.world === 'both') moveWorld(v, game.world); else return false; }
      if (!v) { const def = kinds.get(normKind(kind)); if (!def || !worldOk(def, game.world)) return false; v = makeVehicle(def, game.player.pos.x, game.player.pos.z, 0, true); }
      game.player.teleport(v.pos.x, v.pos.z, game.world === 'space' ? v.pos.y + 0.5 : undefined); mountV(v, game); return true;
    },
    /** 부르기(force=true 면 잠금 무시) */
    summon: (kind?: string, force = false) => (kind ? summon(kind, { force }) : summonAuto()),
    owned: () => api.owned(),
    flags: () => JSON.parse(JSON.stringify(flags())),
    current: () => api.current(),
    gate: (kind: string) => { const d = kinds.get(normKind(kind)); return d ? gateFor(d) : null; },
    /** 발사 상태 */
    launch: () => (launch ? { t: launch.tl.t, phase: launch.tl.phase, shown: launchFx.shown, sky: launchFx.skyK, white: launchFx.whiteK } : { t: -1, phase: 'idle', shown: launchFx.shown, sky: launchFx.skyK, white: launchFx.whiteK }),
    /** 촬영용: 탈것을 (x,z) 로 옮겨 태우고 카메라를 비스듬히 */
    show: (kind: string, x = 0, z = 0.5, h = 0, camOff = 0.8, dist = 3.4, pitch = 0.22, y?: number) => {
      if (!game) return; const v = byKind(kind) ?? (() => { const def = kinds.get(normKind(kind)); return def ? makeVehicle(def, x, z, h, true) : null; })(); if (!v) return;
      if (v.def.world === 'both') moveWorld(v, game.world);
      ensure(v); v.pos.set(x, y ?? (v.def.medium === 'water' ? 0 : groundAt(x, z)), z); v.h = h; placeV(v, game.time);
      game.player.teleport(x, z, game.world === 'space' ? v.pos.y + 0.5 : undefined); mountV(v, game); game.cam.yaw = h + camOff; game.cam.pitch = pitch; game.cam.dist = dist;
    },
    goto: (kind: string, i = 0) => { if (!game) return; const v = byKind(kind, i); if (!v) return; ensure(v); game.player.teleport(v.pos.x + 2.5, v.pos.z + 2.5, v.world === 'space' ? v.pos.y + 1 : undefined); },
    resetRocket: () => { const v = byKind('rocket'); if (v) resetRocket(v); },
    // ── P1
    wind: () => ({ ...wind() }),
    /** 스킨 입히기(cheat=true 면 가진 것으로 치고) */
    skin: (kind: string, n: number, cheat = false) => {
      if (!game) return false;
      const k = normKind(kind);
      if (cheat && n > 0) { const f = p1f(); const id = skinId(publicId(k), n); if (!f.skinBox.includes(id)) f.skinBox.push(id); }
      return chooseSkin(k, n);
    },
    passenger: (on = true, pedal = false) => api.setPassenger({ on, pedal }),
    armSpot: () => armSpot, beamSpot: () => beamSpot,
    arm: () => { const v = ridingV(); if (v?.def.kind === 'sub' && armSpot) { armPick(v, armSpot); return true; } return false; },
    beam: () => { const v = ridingV(); if (v?.def.kind === 'ufo' && beamSpot) { beamPick(v, beamSpot); return true; } return false; },
    p1Check: () => p1Check(),
    spawnRover: () => !!spawnRover(),
    padPose: () => api.padPose(),
    stats: () => api.stats(),
  };
  return root;
}
