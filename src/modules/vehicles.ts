// 탈것: 종류 등록부(kinds/*) · 해금(🔒 안내) · 내 탈것(flags.vehicles {owned, at}) · F 부르기 · 도감 18칸 · 로켓 발사 연출(GDD 6.2).
// E 로 타고 E 로 내린다. 내린 자리에 남고(내 탈것이면 저장), 가까이 갈 때 만들고(지연 생성) 멀면 숨긴다.
//
// game.vehicles = { current(), owned(), summon(kind), isBoat(kind), registerKind(def) } — 계약 v2 2장.
//   current() → {kind, speed, boat, seats?} (kind 는 바깥 이름: tugboat · motorboat · yacht · submarine …). 통통배가 멈추면(speed < 1) fishing 이 갑판 낚시를 연다.
//   registerKind(def): kinds/<kind>.ts 모양(KindDef)이면 세상에 놓고 탈 수 있고, 모양 없이 {kind, name, boat?, unlock?} 만 주면 이름·해금·isBoat 만 안다.
// 읽는 것(늘 늦게, `?.`): econ(해금·잠금 안내·로켓 상태) · ocean.waveAt(파도) · ext.currents.at / geo.currentAt(해류) · space.landingSpawn(달 착륙장).
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game, Input } from '../core/game';
import type { VehicleKindDef, VehicleNow, VehiclesApi } from '../core/api';
import { applyCurve } from '../core/curve';
import { RAPIER } from '../core/physics';
import { mats } from './vehicles/kit';
import { motorboat as motorboatModel } from './vehicles/models';
import { Puffs, SpeedLines } from './vehicles/fx';
import { LaunchFx } from './vehicles/launchfx';
import { VEHICLE_DEX, VEHICLE_DEX_BY_ID } from './vehicles/data';
import {
  gateLabel, isRidable, normKind, publicId, readFlags, noteOwned, findWaterSpot, findLandSpot, deepAt, dryAt, chooseSummon, unlockKeyOf,
  type Medium, type Terrain, type VehFlags, type SummonSpot, type GateEcon,
} from './vehicles/logic';
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

// 마을 꽃·나무가 탈것 자리를 피하도록 먼저 자리를 잡는다
export const order = 6;

/** 기본 종류(웨이브 4 는 registerKind 로 더한다) */
export const BUILTIN_KINDS: KindDef[] = [bike, scooter, kart, sail, motor, sub, balloon, plane, rocket, raft, tugboat, duckTube];

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();

/** 모양 없이 이름·해금만 아는 종류(공룡 탑승처럼 다른 담당이 직접 태우는 것) */
interface DataKind { kind: string; name: string; boat: boolean; seats?: number; unlockKey: string }

export default function build(ctx: Ctx) {
  const root = new THREE.Group();
  root.name = 'vehicles';
  root.userData.world = 'earth';
  const game = ctx.game;
  const I = ctx.island;
  mats();

  // ── 종류 등록부
  const kinds = new Map<string, KindDef>();
  const dataKinds = new Map<string, DataKind>();
  for (const k of BUILTIN_KINDS) kinds.set(k.kind, k);

  // ── 효과
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
  const groundAt = (x: number, z: number) => I.heightAt(x, z);
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
    const v: Veh = {
      def, idx: vehicles.length, model: null,
      pos: new THREE.Vector3(x, def.medium === 'water' ? 0 : groundAt(x, z), z),
      h: rot, v: 0, vy: 0, pitch: 0, roll: 0, steer: 0, mounted: false, air: false, st: {},
      focus: new THREE.Object3D(), body: null, coll: null, cc: null,
      mountable: null as unknown as Veh['mountable'], wheelA: 0, personal,
    };
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

  // ── 모델 만들기·놓기
  function ensure(v: Veh) {
    if (v.model) return v.model;
    const m = v.def.make();
    v.model = m;
    m.root.name = 'veh:' + v.def.kind;
    if (v.def.scale) m.root.scale.setScalar(v.def.scale);
    m.root.add(v.focus);
    v.focus.position.set(0, v.def.focusY, 0);
    v.mountable.seat = m.seat;
    v.mountable.object = v.focus;
    applyCurve(m.root);
    root.add(m.root);
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
      const L = k === 'kart' ? 0.9 : k === 'plane' ? 1.4 : 0.6, W = k === 'kart' ? 0.6 : k === 'plane' ? 0.8 : 0.3;
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

  /** 내 탈것(종류마다 한 대). 없으면 null */
  const personalOf = (kind: string) => vehicles.find((v) => v.personal && v.def.kind === kind) ?? null;

  /** 저장된 자리로 내 탈것을 옮기거나(없으면 만들어) 놓는다 — 자리가 그 매체에 안 맞으면 무시 */
  function restoreAt(kind: string) {
    const def = kinds.get(kind);
    const at = flags().at[kind];
    if (!def || !at || def.medium === 'pad') return;
    const okSpot = def.medium === 'water' ? deepAt(T, at.x, at.z, (def.depth ?? 0.9) * 0.6) : dryAt(T, at.x, at.z);
    if (!okSpot) return;
    const v = personalOf(kind) ?? makeVehicle(def, at.x, at.z, at.h, true);
    v.pos.set(at.x, def.medium === 'water' ? 0 : def.medium === 'air' && at.y !== undefined ? Math.max(groundAt(at.x, at.z), at.y) : groundAt(at.x, at.z), at.z);
    v.h = at.h;
    placeV(v, game?.time ?? 0);
  }
  function rememberAt(v: Veh) {
    if (!v.personal || v.def.medium === 'pad') return;
    const f = flags();
    f.at[v.def.kind] = { x: +v.pos.x.toFixed(2), z: +v.pos.z.toFixed(2), h: +v.h.toFixed(3), ...(v.def.medium === 'air' ? { y: +v.pos.y.toFixed(2) } : {}) };
    save();
  }

  // ── 해금·소유
  const econ = (): GateEcon | null => (game?.econ as GateEcon | null | undefined) ?? null;
  const ridable = (kind: string) => {
    const def = kinds.get(kind) ?? dataKinds.get(kind);
    return !!def && isRidable(kind, def.unlockKey, econ());
  };
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
  }

  // ── 탑승 중 운전(종류에 맡긴다)
  function driveV(v: Veh, input: Input, dt: number, g: Game) {
    if (!v.model || dt <= 0) { placeV(v, g.time); return; }
    v.def.drive(v, input, dt, g, rt);
  }

  // ── 로켓 발사
  let launch: RocketLaunch | null = null;
  let whiteOut = 0;

  // ── 타기 / 내리기
  function mountV(v: Veh, g: Game) {
    ensure(v);
    v.mounted = true;
    v.v = 0; v.vy = 0; v.steer = 0; v.air = false;
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
    rt.emit('dismount', { vehicle: publicId(v.def.kind) });
    return out;
  }

  // ── F 부르기
  /** 플레이어가 물속인가(수영·잠수 또는 발밑이 깊은 물) */
  const inWater = (g: Game) => g.player.mode === 'swim' || g.player.mode === 'dive' || deepAt(T, g.player.pos.x, g.player.pos.z, 0.95);
  /** 그 종류를 부를 자리 */
  function spotFor(medium: Medium, kind: string, g: Game): SummonSpot | null {
    const def = kinds.get(kind);
    if (!def) return null;
    const p = g.player.pos;
    const f = g.player.facing?.() ?? new THREE.Vector3(0, 0, -1);
    const yaw = Math.atan2(f.x, f.z);
    if (medium === 'water') {
      const sx = p.x + f.x * 2.5, sz = p.z + f.z * 2.5;
      return findWaterSpot(T, sx, sz, def.depth ?? 0.9, 50, 1.5, def.kind === 'duck_tube' ? 1 : 2.5);
    }
    if (inWater(g)) return null;
    const s = findLandSpot(T, p.x + f.x * 2.6, p.z + f.z * 2.6, def.margin ?? 1, 12, 0.5);
    return s ? { x: s.x, z: s.z, rot: yaw } : null;
  }
  /** 그 자리에 내 탈것을 놓는다(없으면 만든다) */
  function bring(kind: string, spot: SummonSpot, g: Game | null): Veh | null {
    const def = kinds.get(kind);
    if (!def) return null;
    const v = personalOf(kind) ?? makeVehicle(def, spot.x, spot.z, spot.rot, true);
    if (v.mounted) return null;
    v.pos.set(spot.x, def.medium === 'water' ? 0 : groundAt(spot.x, spot.z), spot.z);
    v.h = spot.rot; v.v = 0; v.vy = 0; v.air = false; v.pitch = 0; v.roll = 0; v.steer = 0;
    ensure(v);
    v.model!.root.visible = true;
    placeV(v, g?.time ?? 0);
    poof(spot.x, def.medium === 'water' ? waterY(spot.x, spot.z, g?.time ?? 0) : v.pos.y, spot.z, def.kind === 'tugboat' || def.kind === 'motor' ? 2.4 : 1.4);
    noteOwned(flags(), kind);
    rememberAt(v);
    rt.emit('summon', { vehicle: publicId(kind) });
    return v;
  }
  /** 정해진 종류 부르기(잠겨 있거나 자리가 없으면 false) */
  function summon(kindIn: string, o: { quiet?: boolean; force?: boolean } = {}): boolean {
    const g = game;
    if (!g || g.world !== 'earth' || g.player.mounted) return false;
    const kind = normKind(kindIn);
    const def = kinds.get(kind);
    if (!def || def.medium === 'pad') { if (!o.quiet) g.ui.toast('그 탈것은 부를 수 없어요'); return false; }
    if (!o.force && !ridable(kind)) {
      if (!o.quiet) g.ui.toast(gateLabel(def, econ()).why || `🔒 ${def.name}`);
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
    const pick = chooseSummon(flags().owned, (k) => kinds.get(k)?.medium ?? null, ridable, (m, k) => spotFor(m, k, g));
    if (!pick) {
      const any = flags().owned.some((k) => { const d = kinds.get(k); return d && d.medium !== 'pad' && ridable(k); });
      g.ui.toast(!any ? '아직 부를 탈것이 없어요 — 상점·작업대에서 구해 봐요 🚲' : inWater(g) ? '물 위에서 탈 배가 없어요 🌊' : '여기선 부를 수 있는 탈것이 없어요');
      return false;
    }
    bring(pick.kind, pick.spot, g);
    g.ui.toast(`${kinds.get(pick.kind)!.name} 등장! 펑 ✨`);
    return true;
  }

  // ── 바깥 API(game.vehicles)
  const api: VehiclesApi = {
    current(): VehicleNow | null {
      const m = game?.player.mounted;
      if (!m) return null;
      const v = vehicles.find((x) => x.mountable === m);
      if (!v) return null;
      return { kind: publicId(v.def.kind), speed: Math.abs(v.v), boat: v.def.boat, ...(v.def.seats ? { seats: v.def.seats } : {}) };
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
        if (flags().at[kind]) restoreAt(kind);
      } else {
        dataKinds.set(kind, { kind, name: d.name ?? kind, boat: !!d.boat, seats: d.seats, unlockKey });
      }
    },
  };

  if (game) {
    game.vehicles = api;
    game.state.register(VEHICLE_DEX);

    // 내 탈것 자리 되살리기
    for (const k of Object.keys(flags().at)) restoreAt(k);

    // ── 상호작용(가장 가까운 탈것) — 잠겨 있으면 '🔒 이름 — 조건' 만 보이고 쓰면 안내만
    game.addProvider('vehicles', (p, g) => {
      if (p.mounted || g.world !== 'earth') return null;
      let best: Veh | null = null, bd = Infinity;
      for (const v of vehicles) {
        if (v.mounted) continue;
        const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
        const dy = Math.abs(v.pos.y - p.pos.y);
        if (d < v.def.reach && dy < 4 && d < bd) { best = v; bd = d; }
      }
      if (!best) return null;
      const v = best;
      const gate = gateLabel(v.def, econ());
      return {
        id: 'vehicles:ride', label: gate.label, dist: bd * 0.9,
        use: () => { if (gate.ok) mountV(v, g); else g.ui.toast(gate.why); },
      };
    });
    // 발사 중엔 E 가 내리기가 되지 않게(아무것도 안 하는 E)
    game.addProvider('vehicles:launch', () => (launch && !launch.done ? { id: 'vehicles:launching', label: '🚀 두근두근 발사 중…', dist: 0, whileMounted: true, use: () => {} } : null));

    // ── F = 부르기(코어가 이번 프레임 F 상호작용을 골랐으면 그쪽이 먼저)
    game.hud.registerHotkey({
      id: 'vehicles:summon', code: 'KeyF', label: '탈것 부르기', hint: true,
      when: () => game.world === 'earth' && !game.player.mounted && !launch && game.currentAlt?.key !== 'KeyF' && !game.consumedKeys.has('KeyF')
        && flags().owned.some((k) => kinds.get(k)?.medium !== 'pad'),
      run: () => { summonAuto(); },
    });

    // ── 해금되면: 소유 + 도감 칸. 뗏목은 안내 카드 + 가까운 물에 저절로 둥실
    game.state.on((e) => {
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
        }
      }
      if (key === 'rocket:pad') recordDex(rocket);
    });
    game.onWorld((w) => {
      root.visible = w === 'earth';
      if (w !== 'earth' && launch && !launch.done) { launch.abort(); launch = null; }
    });
  }

  // ── 매 프레임: 발사 연출·지연 생성·거리 숨김·쉬는 동안의 흔들림·효과
  ctx.onUpdate((t, dt) => {
    syncOwned();
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
    let built = 0;
    for (const v of vehicles) {
      const d = Math.hypot(v.pos.x - focus.x, v.pos.z - focus.z);
      const vis = d < v.def.view || v.mounted;
      if (vis && !v.model && built < 1) { ensure(v); built++; }
      if (!v.model) continue;
      v.model.root.visible = vis;
      if (!vis || v.mounted) continue;
      // 쉬는 동안
      if (v.def.medium === 'water') placeV(v, t);
      v.def.idle?.(v, t, dt, rt);
    }
    if (game && !game.player.mounted) lines.update(dt);
    puffs.update(dt);
    fire.update(dt);
  });

  // 룩 테스트(게임 없음)·촬영 첫 장면에서도 마을 근처 탈것은 바로 보이게
  for (const v of vehicles) if (Math.hypot(v.pos.x, v.pos.z) < 60) ensure(v);

  // ── 디버그·촬영용(window.__vehicles)
  const byKind = (kind: string, i = 0) => vehicles.filter((x) => x.def.kind === normKind(kind))[i] ?? null;
  if (typeof window !== 'undefined') (window as unknown as { __vehicles?: unknown }).__vehicles = {
    list: vehicles,
    kinds: () => [...kinds.keys()],
    /** 잠금 무시하고 태우기 */
    mount: (kind: string, i = 0) => {
      if (!game) return false;
      let v = byKind(kind, i);
      if (!v) { const def = kinds.get(normKind(kind)); if (!def) return false; v = makeVehicle(def, game.player.pos.x, game.player.pos.z, 0, true); }
      game.player.teleport(v.pos.x, v.pos.z); mountV(v, game); return true;
    },
    /** 부르기(force=true 면 잠금 무시) */
    summon: (kind?: string, force = false) => (kind ? summon(kind, { force }) : summonAuto()),
    owned: () => api.owned(),
    flags: () => JSON.parse(JSON.stringify(flags())),
    current: () => api.current(),
    gate: (kind: string) => { const d = kinds.get(normKind(kind)); return d ? gateLabel(d, econ()) : null; },
    /** 발사 상태 */
    launch: () => (launch ? { t: launch.tl.t, phase: launch.tl.phase, shown: launchFx.shown, sky: launchFx.skyK, white: launchFx.whiteK } : { t: -1, phase: 'idle', shown: launchFx.shown, sky: launchFx.skyK, white: launchFx.whiteK }),
    /** 촬영용: 탈것을 (x,z) 로 옮겨 태우고 카메라를 비스듬히 */
    show: (kind: string, x = 0, z = 0.5, h = 0, camOff = 0.8, dist = 3.4, pitch = 0.22, y?: number) => {
      if (!game) return; const v = byKind(kind) ?? (() => { const def = kinds.get(normKind(kind)); return def ? makeVehicle(def, x, z, h, true) : null; })(); if (!v) return;
      ensure(v); v.pos.set(x, y ?? (v.def.medium === 'water' ? 0 : I.heightAt(x, z)), z); v.h = h; placeV(v, game.time);
      game.player.teleport(x, z); mountV(v, game); game.cam.yaw = h + camOff; game.cam.pitch = pitch; game.cam.dist = dist;
    },
    goto: (kind: string, i = 0) => { if (!game) return; const v = byKind(kind, i); if (!v) return; ensure(v); game.player.teleport(v.pos.x + 2.5, v.pos.z + 2.5); },
    resetRocket: () => { const v = byKind('rocket'); if (v) resetRocket(v); },
  };
  return root;
}
