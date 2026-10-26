// 탈것: 자전거·스쿠터·카트(Rapier)·돛단배·모터보트(섬마다)·잠수정·열기구·프로펠러 비행기·로켓(우주 발사).
// E 로 타고 E 로 내린다. 내린 자리에 남는다. 가까이 갈 때 만들고(지연 생성) 멀면 숨긴다.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game, Input, Mountable } from '../core/game';
import { RAPIER } from '../core/physics';
import { applyCurve } from '../core/curve';
import { mats } from './vehicles/kit';
import * as M from './vehicles/models';
import type { Model } from './vehicles/models';
import { Puffs, SpeedLines } from './vehicles/fx';

// 마을 꽃·나무가 탈것 자리를 피하도록 먼저 자리를 잡는다
export const order = 6;

type Kind = 'bike' | 'scooter' | 'kart' | 'sail' | 'motor' | 'sub' | 'balloon' | 'plane' | 'rocket';

interface Spec { kind: Kind; name: string; x: number; z: number; rot: number; make: () => Model }

const CAM: Record<Kind, number> = { bike: 1.0, scooter: 1.1, kart: 1.25, sail: 1.9, motor: 1.7, sub: 1.5, balloon: 3.4, plane: 2.4, rocket: 4.2 };
const VIEW: Record<Kind, number> = { bike: 130, scooter: 130, kart: 150, sail: 420, motor: 320, sub: 160, balloon: 2200, plane: 700, rocket: 3200 };
const REACH: Record<Kind, number> = { bike: 2.0, scooter: 2.2, kart: 2.6, sail: 3.6, motor: 3.4, sub: 3.4, balloon: 2.8, plane: 3.6, rocket: 11 };
const NAMES: Record<Kind, string> = { bike: '자전거', scooter: '스쿠터', kart: '꼬마 카트', sail: '돛단배', motor: '모터보트', sub: '노란 잠수정', balloon: '열기구', plane: '프로펠러 비행기', rocket: '로켓' };

const tmpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export default function build(ctx: Ctx) {
  const root = new THREE.Group();
  root.name = 'vehicles';
  root.userData.world = 'earth';
  const game = ctx.game;
  const I = ctx.island;
  mats();

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

  // ── 자리 찾기
  /** 근처에서 평평한 땅(소용돌이 탐색) */
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
  /** 근처에서 배가 뜰 만한 물(깊이 depth 이상) — 가장 가까운 곳, 뱃머리는 먼바다 쪽 */
  const findWater = (x: number, z: number, depth: number, maxR = 260) => {
    for (let r = 0; r <= maxR; r += 2) {
      const n = Math.max(1, Math.floor(r * 0.8));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (I.waterLevelAt(px, pz) === 0 && I.heightAt(px, pz) < -depth && clearWater(px, pz, depth * 0.6, 3)) {
          // 먼바다 쪽 = 깊어지는 쪽
          const e = 4;
          const gx = I.heightAt(px + e, pz) - I.heightAt(px - e, pz), gz = I.heightAt(px, pz + e) - I.heightAt(px, pz - e);
          return { x: px, z: pz, rot: Math.atan2(-gx, -gz) };
        }
      }
    }
    return { x, z, rot: 0 };
  };
  const clearWater = (x: number, z: number, depth: number, r: number) => {
    for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (!(I.waterLevelAt(x + ox, z + oz) === 0 && I.heightAt(x + ox, z + oz) < -depth)) return false;
    return true;
  };
  const reserve = (x: number, z: number, r: number) => {
    ctx.scatter({ key: `vehicles:res:${x.toFixed(1)},${z.toFixed(1)}`, count: 1, minDist: 0.1, bounds: { minX: x - 0.01, maxX: x + 0.01, minZ: z - 0.01, maxZ: z + 0.01 }, accept: () => true, avoidOccupied: false, occupy: r });
  };

  // ── 배치
  const P = I.PLACES;
  const specs: Spec[] = [];
  const rack = findLand(P.bikeRack.x, P.bikeRack.z, 1.0, 12);
  specs.push({ kind: 'bike', name: NAMES.bike, x: rack.x, z: rack.z, rot: P.bikeRack.rotY + Math.PI / 2, make: () => M.bike() });
  const sc = findLand(rack.x + Math.cos(P.bikeRack.rotY) * 2.2, rack.z - Math.sin(P.bikeRack.rotY) * 2.2, 1.1, 12);
  specs.push({ kind: 'scooter', name: NAMES.scooter, x: sc.x, z: sc.z, rot: P.bikeRack.rotY + Math.PI / 2 + 0.25, make: () => M.scooter() });
  const kt = findLand(11, 5, 1.8, 24);
  specs.push({ kind: 'kart', name: NAMES.kart, x: kt.x, z: kt.z, rot: -2.4, make: () => M.kart() });
  const dock = findWater(P.boatDock.x, P.boatDock.z, 0.9);
  specs.push({ kind: 'sail', name: NAMES.sail, x: dock.x, z: dock.z, rot: dock.rot, make: () => M.sailboat() });
  const d2 = findWater(dock.x + Math.cos(dock.rot) * 6, dock.z - Math.sin(dock.rot) * 6, 0.9);
  specs.push({ kind: 'motor', name: NAMES.motor, x: d2.x, z: d2.z, rot: d2.rot, make: () => M.motorboat() });
  const d3 = findWater(dock.x - Math.cos(dock.rot) * 7, dock.z + Math.sin(dock.rot) * 7, 2.2);
  specs.push({ kind: 'sub', name: NAMES.sub, x: d3.x, z: d3.z, rot: d3.rot, make: () => M.submarine() });
  // 섬마다 부두에 배 한 척(색이 다른 모터보트 · 돛단배)
  const dockCols: Record<string, [string, string]> = { dino: ['#7ddc9a', '#dcffe6'], ice: ['#8fc8ff', '#e8f6ff'], mushroom: ['#c5a3ff', '#f1e8ff'], coral: ['#ff9f8a', '#ffe8e0'], desert: ['#ffcf5a', '#fff4cf'], launch: ['#7fb8ff', '#e6f1ff'] };
  for (const [id, d] of Object.entries(P.docks)) {
    const w = findWater(d.x, d.z, 0.9, 320);
    const c = dockCols[id] ?? ['#ff8a9e', '#ffe1e8'];
    if (id === 'ice' || id === 'coral') specs.push({ kind: 'sail', name: NAMES.sail, x: w.x, z: w.z, rot: w.rot, make: () => M.sailboat() });
    else specs.push({ kind: 'motor', name: NAMES.motor, x: w.x, z: w.z, rot: w.rot, make: () => M.motorboat(c[0], c[1]) });
  }
  // 하늘: 열기구는 마을 동쪽 언덕(멀리서도 보이는 랜드마크), 비행기는 북쪽 들판
  const bl = findLand(34, -30, 2.4, 60);
  specs.push({ kind: 'balloon', name: NAMES.balloon, x: bl.x, z: bl.z, rot: Math.atan2(-bl.x, -bl.z), make: () => M.balloon() });
  const pl = findLand(-10, -70, 3.2, 80);
  specs.push({ kind: 'plane', name: NAMES.plane, x: pl.x, z: pl.z, rot: 0.6, make: () => M.plane() });
  specs.push({ kind: 'rocket', name: NAMES.rocket, x: P.launchPad.x, z: P.launchPad.z, rot: P.launchPad.rotY, make: () => M.rocket() });
  for (const s of specs) if (s.kind === 'bike' || s.kind === 'scooter' || s.kind === 'kart' || s.kind === 'balloon' || s.kind === 'plane') reserve(s.x, s.z, s.kind === 'balloon' ? 2.2 : s.kind === 'plane' ? 3 : 1.3);

  const vehicles = specs.map((s, i) => makeVehicle(s, i));

  // ── 탈것 하나
  function makeVehicle(s: Spec, idx: number) {
    const v = {
      s, idx, model: null as Model | null,
      pos: new THREE.Vector3(s.x, 0, s.z),
      h: s.rot, v: 0, vy: 0, pitch: 0, roll: 0, steer: 0,
      mounted: false, phase: 0, phaseT: 0,
      focus: new THREE.Object3D(),
      body: null as RAPIER.RigidBody | null,
      coll: null as RAPIER.Collider | null,
      cc: null as RAPIER.KinematicCharacterController | null,
      mountable: null as unknown as Mountable,
      wheelA: 0, spinA: 0,
    };
    const k = s.kind;
    if (k === 'sail' || k === 'motor' || k === 'sub') v.pos.y = 0;
    else v.pos.y = I.heightAt(s.x, s.z);
    v.mountable = {
      name: s.name,
      seat: v.focus, object: v.focus,
      camDistance: CAM[k],
      drive: (input, dt, g) => drive(v, input, dt, g),
      onExit: (g) => exit(v, g),
    };
    return v;
  }
  type V = ReturnType<typeof makeVehicle>;

  function ensure(v: V) {
    if (v.model) return v.model;
    const m = v.s.make();
    v.model = m;
    m.root.name = 'veh:' + v.s.kind;
    if (v.s.kind === 'rocket') m.root.scale.setScalar(1.6);
    m.root.add(v.focus);
    const fy: Record<Kind, number> = { bike: 0.3, scooter: 0.3, kart: 0.2, sail: 0.4, motor: 0.2, sub: 0.6, balloon: 3.0, plane: 0.6, rocket: 5.5 };
    v.focus.position.set(0, fy[v.s.kind], 0);
    v.mountable.seat = m.seat;
    v.mountable.object = v.s.kind === 'rocket' ? m.bits.body : v.focus;
    if (v.s.kind === 'rocket') { const f = new THREE.Object3D(); f.position.set(0, 6, 0); m.bits.body.add(f); v.mountable.object = f; }
    m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.castShadow && true; });
    applyCurve(m.root);
    root.add(m.root);
    place(v, 0);
    return m;
  }

  /** 모델을 v.pos·v.h 에 놓고 지형/파도에 맞춰 기울인다 */
  function place(v: V, t: number) {
    const m = v.model;
    if (!m) return;
    const k = v.s.kind;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, v.h);
    if (k === 'bike' || k === 'scooter' || k === 'kart' || ((k === 'plane' || k === 'balloon') && v.pos.y <= groundAt(v.pos.x, v.pos.z) + 0.05)) {
      // 바퀴 앞뒤·좌우 높이로 기울기
      const L = k === 'kart' ? 0.9 : k === 'plane' ? 1.4 : 0.6, W = k === 'kart' ? 0.6 : k === 'plane' ? 0.8 : 0.3;
      const fx = Math.sin(v.h), fz = Math.cos(v.h);
      const hf = groundAt(v.pos.x + fx * L, v.pos.z + fz * L), hb = groundAt(v.pos.x - fx * L, v.pos.z - fz * L);
      const hr = groundAt(v.pos.x - fz * W, v.pos.z + fx * W), hl = groundAt(v.pos.x + fz * W, v.pos.z - fx * W);
      const pitch = Math.atan2(hb - hf, 2 * L);
      const roll = Math.atan2(hr - hl, 2 * W);
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch + v.pitch, 0, roll + v.roll, 'YXZ')));
    } else if (k === 'sail' || k === 'motor' || (k === 'sub' && v.pos.y > -0.6)) {
      const wp = 0.05 * Math.sin(t * 1.3 + v.idx) + v.pitch, wr = 0.06 * Math.sin(t * 1.05 + v.idx * 2.1) + v.roll;
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(wp, 0, wr, 'YXZ')));
    } else {
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(v.pitch, 0, v.roll, 'YXZ')));
    }
    m.root.quaternion.copy(q);
    m.root.position.copy(v.pos);
    if (k === 'sail' || k === 'motor' || (k === 'sub' && v.pos.y > -0.6)) m.root.position.y = waveY(v.pos.x, v.pos.z, t) + (k === 'sub' ? -0.95 : 0);
    m.root.updateMatrixWorld(true);
  }

  const groundAt = (x: number, z: number) => I.heightAt(x, z);
  const waveY = (x: number, z: number, t: number) => 0.08 * Math.sin(x * 0.23 + z * 0.11 + t * 0.9) + 0.06 * Math.sin(-x * 0.13 + z * 0.29 + t * 1.25) - 0.02;

  // ── 운전
  const followCam = (g: Game, v: V, dt: number, k = 2.2) => {
    if (g.input.dragging || Math.abs(v.v) < 1.2) return;
    const want = (v.v >= 0 ? v.h : v.h) + Math.PI;
    let d = want - g.cam.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.cam.yaw += d * Math.min(1, dt * k);
  };
  const boost = (input: Input) => input.down('ShiftLeft') || input.down('ShiftRight');
  const fwdOf = (v: V) => new THREE.Vector3(Math.sin(v.h), 0, Math.cos(v.h));

  function drive(v: V, input: Input, dt: number, g: Game) {
    if (!v.model || dt <= 0) { place(v, g.time); return; }
    const k = v.s.kind;
    const ax = input.axis();
    const t = g.time;
    if (k === 'rocket') { launch(v, dt, g); return; }
    if (k === 'kart') { driveKart(v, input, dt, g); return; }
    let maxV = 0, acc = 0;
    switch (k) {
      case 'bike': maxV = boost(input) ? 13 : 9; acc = 6; break;
      case 'scooter': maxV = boost(input) ? 19 : 14; acc = 9; break;
      case 'sail': maxV = boost(input) ? 24 : 20; acc = 5; break;
      case 'motor': maxV = boost(input) ? 30 : 25; acc = 12; break;
      case 'sub': maxV = boost(input) ? 14 : 10; acc = 5; break;
      case 'balloon': maxV = boost(input) ? 12 : 8; acc = 2; break;
      case 'plane': maxV = boost(input) ? 46 : 36; acc = 7; break;
    }
    // 속도
    if (k === 'plane') {
      const target = ax.y > 0 ? maxV : ax.y < 0 ? 0 : Math.max(v.v, v.pos.y > groundAt(v.pos.x, v.pos.z) + 1 ? 20 : 0);
      v.v += Math.sign(target - v.v) * Math.min(Math.abs(target - v.v), acc * dt);
    } else {
      const target = ax.y > 0 ? maxV : ax.y < 0 ? -maxV * 0.3 : 0;
      const a = ax.y === 0 ? acc * 0.6 : (Math.sign(target - v.v) !== Math.sign(v.v) && v.v !== 0 ? acc * 1.8 : acc);
      v.v += Math.sign(target - v.v) * Math.min(Math.abs(target - v.v), a * dt);
    }
    // 회전
    const turnRate = k === 'bike' ? 2.2 : k === 'scooter' ? 2.0 : k === 'plane' ? 0.9 : k === 'balloon' ? 0.8 : 1.3;
    const grip = k === 'balloon' || k === 'sub' ? 1 : Math.max(k === 'plane' ? 0 : 0.45, Math.min(1, Math.abs(v.v) / 4)); // 막혀 멈춰도 제자리에서 돌 수 있게
    v.steer += (ax.x - v.steer) * Math.min(1, dt * 6);
    v.h -= v.steer * turnRate * grip * Math.sign(v.v || 1) * dt;
    const f = fwdOf(v);
    let nx = v.pos.x + f.x * v.v * dt, nz = v.pos.z + f.z * v.v * dt;
    const b = I.WORLD_BOUNDS;
    nx = THREE.MathUtils.clamp(nx, b.minX + 5, b.maxX - 5); nz = THREE.MathUtils.clamp(nz, b.minZ + 5, b.maxZ - 5);

    if (k === 'bike' || k === 'scooter') {
      const gy = groundAt(nx, nz);
      const wl = I.waterLevelAt(nx, nz);
      const blocked = (Number.isFinite(wl) && wl - gy > 0.45) || gy - v.pos.y > 1.1 * Math.max(0.3, Math.abs(v.v * dt) * 3);
      if (blocked) { v.v *= -0.25; }
      else if (v.cc && v.coll && v.body) {
        // 나무·집·바위 같은 정적 충돌은 캐릭터 컨트롤러로 막고, 공은 밀어낸다
        const want = { x: nx - v.pos.x, y: gy - v.pos.y, z: nz - v.pos.z };
        v.cc.computeColliderMovement(v.coll, want);
        const mv = v.cc.computedMovement();
        const wl2 = Math.hypot(want.x, want.z), ml = Math.hypot(mv.x, mv.z);
        const px = v.pos.x + mv.x, pz = v.pos.z + mv.z;
        v.pos.set(px, groundAt(px, pz), pz);
        v.body.setNextKinematicTranslation({ x: px, y: v.pos.y + 0.8, z: pz });
        if (wl2 > 0.02 && ml < wl2 * 0.35 && Math.abs(v.v) > 3) {
          const f2 = fwdOf(v);
          for (let i = 0; i < 5; i++) puffs.emit(v.pos.x + f2.x * 0.8, v.pos.y + 0.5, v.pos.z + f2.z * 0.8, (fxRnd() - 0.5) * 3, 1 + fxRnd() * 2, (fxRnd() - 0.5) * 3, { life: 0.5, s0: 0.1, s1: 0.22, color: '#fff6e8', g: -2 });
          v.v *= -0.3;
        } else if (wl2 > 0.02) v.v *= Math.min(1, 0.4 + 0.6 * ml / wl2);
      } else { v.pos.set(nx, gy, nz); }
      v.roll += (-v.steer * Math.min(1, Math.abs(v.v) / 8) * 0.28 - v.roll) * Math.min(1, dt * 5);
      v.pitch = 0;
      dust(v, dt, k === 'bike' ? 0.6 : 1);
    } else if (k === 'sail' || k === 'motor') {
      const deep = I.waterLevelAt(nx, nz) === 0 && groundAt(nx, nz) < -0.55;
      if (!deep) { v.v *= -0.3; } else { v.pos.x = nx; v.pos.z = nz; }
      v.pos.y = 0;
      v.roll += (v.steer * Math.min(1, Math.abs(v.v) / 12) * (k === 'sail' ? 0.22 : 0.16) - v.roll) * Math.min(1, dt * 3);
      v.pitch += (-Math.min(1, Math.abs(v.v) / maxV) * 0.09 - v.pitch) * Math.min(1, dt * 2);
      wake(v, dt, t);
    } else if (k === 'sub') {
      const up = input.down('Space') ? 1 : (input.down('KeyC') || input.down('ControlLeft')) ? -1 : 0;
      v.vy += (up * 3.5 - v.vy) * Math.min(1, dt * 2);
      const floor = groundAt(nx, nz) + 1.2;
      const ok = I.waterLevelAt(nx, nz) === 0 && floor < -0.2;
      if (ok) { v.pos.x = nx; v.pos.z = nz; } else v.v *= -0.3;
      v.pos.y = THREE.MathUtils.clamp(v.pos.y + v.vy * dt, Math.min(-0.0, groundAt(v.pos.x, v.pos.z) + 1.2), 0);
      v.pitch += (-v.vy * 0.06 - v.pitch) * Math.min(1, dt * 3);
      v.roll += (v.steer * 0.15 - v.roll) * Math.min(1, dt * 3);
      if (v.pos.y < -0.8) bubbles(v, dt); else wake(v, dt, t);
    } else if (k === 'balloon') {
      const up = input.down('Space') ? 1 : (input.down('KeyC') || input.down('ControlLeft')) ? -1 : 0;
      v.vy += (up * 4.5 - 0.15 - v.vy) * Math.min(1, dt * 1.2);
      const gy = Math.max(groundAt(nx, nz), 0);
      v.pos.x = nx; v.pos.z = nz;
      v.pos.y = THREE.MathUtils.clamp(v.pos.y + v.vy * dt, gy, 320);
      if (v.pos.y <= gy + 0.01) { v.v *= Math.exp(-dt * 3); if (v.vy < 0) v.vy = 0; }
      v.roll = Math.sin(t * 0.7) * 0.02 - v.steer * 0.05; v.pitch = Math.sin(t * 0.5) * 0.02;
      const fl = v.model.bits.flame;
      fl.scale.setScalar(up > 0 ? 1.5 + 0.25 * Math.sin(t * 30) : 0.7 + 0.1 * Math.sin(t * 20));
      if (up > 0 && fxRnd() < dt * 30) {
        tmpV.set(0, 2.95, 0).applyMatrix4(v.model.root.matrixWorld);
        fire.emit(tmpV.x, tmpV.y, tmpV.z, 0, 4, 0, { life: 0.35, s0: 0.16, s1: 0.05, color: '#ffb347', drag: 3 });
      }
    } else if (k === 'plane') {
      const gy = Math.max(groundAt(nx, nz), 0);
      const air = v.pos.y > gy + 0.3;
      const pull = input.down('Space') ? 1 : (input.down('KeyC') || input.down('ControlLeft')) ? -1 : 0;
      let pt = pull * 0.42;
      if (!air && v.v > 17) pt = Math.max(pt, 0.28); // 속도가 붙으면 저절로 이륙
      if (!air && v.v < 17) pt = Math.min(pt, 0);
      if (air && v.v < 12) pt = Math.min(pt, -0.15); // 너무 느리면 기수가 숙여진다
      v.pitch += (-pt - v.pitch) * Math.min(1, dt * 2.2); // 기수 들기 = -x 회전
      v.roll += (v.steer * (air ? 0.55 : 0.05) - v.roll) * Math.min(1, dt * 3);
      v.pos.x = nx; v.pos.z = nz;
      v.pos.y = THREE.MathUtils.clamp(v.pos.y + Math.sin(-v.pitch) * v.v * dt, gy, 420);
      if (v.pos.y <= gy + 0.01 && v.pitch > 0) v.pitch = Math.min(v.pitch, 0.02);
      const air2 = v.pos.y > gy + 0.3;
      if (!air2) { v.pitch = Math.max(v.pitch, -0.05); dust(v, dt, 1.4); }
      v.model.spin[0].rotation.z += dt * (8 + v.v * 1.2);
      // 날개 끝 구름 꼬리
      if (air2 && v.v > 20) {
        for (const sx of [-2.6, 2.6]) {
          tmpV.set(sx, 0.95, 0.0).applyMatrix4(v.model.root.matrixWorld);
          puffs.emit(tmpV.x, tmpV.y, tmpV.z, 0, 0, 0, { life: 0.5, s0: 0.05, s1: 0.08, color: '#ffffff', drag: 2 });
        }
      }
    }
    // 바퀴·페달·프로펠러
    const m = v.model;
    v.wheelA += v.v * dt / 0.3;
    for (const w of m.wheels) w.rotation.x = v.wheelA;
    if (k === 'bike') m.spin[0].rotation.x = v.wheelA * 0.55;
    if (k === 'motor' || k === 'sub') m.spin[0].rotation.z += dt * (4 + Math.abs(v.v) * 2.5);
    if (k === 'sail') m.bits.sail.rotation.y = -v.steer * 0.35 + Math.sin(t * 3.1) * 0.02;
    if (k === 'plane' && m.bits.scarf) { const f = Math.min(1, Math.abs(v.v) / 20); m.bits.scarf.rotation.set(Math.sin(t * 13) * 0.12 * (0.4 + f), Math.sin(t * 9.5) * 0.25 * (0.4 + f), 0); }
    place(v, t);
    followCam(g, v, dt, k === 'plane' || k === 'balloon' ? 1.5 : 2.4);
    const speed = Math.abs(v.v);
    const dir = fwdOf(v);
    if (k === 'plane') dir.y = Math.sin(-v.pitch);
    lines.feed(dt, tmpV.copy(v.pos).add(new THREE.Vector3(0, k === 'plane' ? 1 : 0.6, 0)), dir.normalize(), speed, fxRnd, k === 'plane' ? 4 : 2.6);
  }

  // ── 카트(Rapier): 공 두 개 몸체, 회전은 y 만. 언덕을 오르고 공을 밀고 부딪히면 튕긴다
  function driveKart(v: V, input: Input, dt: number, g: Game) {
    const b = v.body;
    if (!b) { place(v, g.time); return; }
    const ax = input.axis();
    const maxV = boost(input) ? 17 : 12.5;
    const target = ax.y > 0 ? maxV : ax.y < 0 ? -5 : 0;
    const lv = b.linvel();
    const f = fwdOf(v);
    // 실제 앞 방향 속도(부딪히면 줄어든다)
    const real = lv.x * f.x + lv.z * f.z;
    if (Math.abs(real) < Math.abs(v.v) - 2.5) {
      // 쿵! 작은 먼지와 함께 튕긴다
      for (let i = 0; i < 6; i++) puffs.emit(v.pos.x + f.x * 1.1, v.pos.y + 0.4, v.pos.z + f.z * 1.1, (fxRnd() - 0.5) * 3, 1 + fxRnd() * 2, (fxRnd() - 0.5) * 3, { life: 0.6, s0: 0.18, s1: 0.35, color: '#fff6e8', g: -2 });
      v.v = real * 0.6 - Math.sign(v.v) * 1.5;
    }
    v.v += Math.sign(target - v.v) * Math.min(Math.abs(target - v.v), (ax.y === 0 ? 6 : 10) * dt);
    v.steer += (ax.x - v.steer) * Math.min(1, dt * 7);
    const yawRate = -v.steer * 2.1 * Math.min(1, Math.abs(v.v) / 3) * Math.sign(v.v || 1);
    v.h += yawRate * dt;
    const nf = fwdOf(v);
    // 옆미끄럼은 빨리 없앤다(드리프트 조금)
    b.setLinvel({ x: nf.x * v.v + (lv.x - f.x * real) * 0.2, y: Math.min(lv.y, 6), z: nf.z * v.v + (lv.z - f.z * real) * 0.2 }, true);
    b.setRotation(new THREE.Quaternion().setFromAxisAngle(UP, v.h), true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const p = b.translation();
    // 물에 빠지지 않게: 깊은 물이면 되돌린다
    const wl = I.waterLevelAt(p.x, p.z);
    if (Number.isFinite(wl) && wl - groundAt(p.x, p.z) > 0.6) {
      b.setTranslation({ x: v.pos.x - nf.x * 0.3, y: v.pos.y + 0.6, z: v.pos.z - nf.z * 0.3 }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      v.v = 0;
    } else {
      const gy = groundAt(p.x, p.z);
      v.pos.set(p.x, Math.max(gy, p.y - 0.5), p.z);
      if (p.y - 0.5 < gy - 0.4) b.setTranslation({ x: p.x, y: gy + 0.55, z: p.z }, true);
    }
    v.roll += (v.steer * Math.min(1, Math.abs(v.v) / 10) * 0.08 - v.roll) * Math.min(1, dt * 5);
    v.pitch = 0;
    const m = v.model!;
    v.wheelA += v.v * dt / 0.28;
    for (const w of m.wheels) w.rotation.x = v.wheelA;
    for (const w of m.wheels.slice(2)) w.rotation.y = v.steer * 0.35;
    m.bits.steer.rotation.z = v.steer * 0.8;
    place(v, g.time);
    dust(v, dt, 1.3);
    followCam(g, v, dt, 2.6);
    lines.feed(dt, tmpV.copy(v.pos).add(new THREE.Vector3(0, 0.6, 0)), fwdOf(v), Math.abs(v.v) * 1.3, fxRnd, 2.4);
  }

  function kartBody(v: V, g: Game) {
    const w = g.physics.world;
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(v.pos.x, v.pos.y + 0.55, v.pos.z).setLinearDamping(0.1).setCcdEnabled(true);
    const b = w.createRigidBody(bd);
    b.setEnabledRotations(false, true, false, true);
    for (const z of [-0.45, 0.45]) w.createCollider(RAPIER.ColliderDesc.ball(0.55).setTranslation(0, 0, z).setFriction(0.0).setRestitution(0.35).setDensity(3), b);
    b.setRotation(new THREE.Quaternion().setFromAxisAngle(UP, v.h), true);
    v.body = b;
  }

  // ── 효과 내보내기
  function dust(v: V, dt: number, amt: number) {
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
  function wake(v: V, dt: number, t: number) {
    const sp = Math.abs(v.v);
    if (sp < 1.5 || !v.model) return;
    const m = v.model;
    const f = fwdOf(v), side = new THREE.Vector3(f.z, 0, -f.x);
    const n = Math.min(6, sp * dt * 9);
    for (let i = 0; i < 6 && fxRnd() < n - i; i++) {
      // 항적: 꼬리에서 양옆으로 퍼지는 흰 거품
      tmpV.copy(m.tail).applyMatrix4(m.root.matrixWorld);
      const s = fxRnd() < 0.5 ? -1 : 1;
      puffs.emit(tmpV.x + side.x * s * 0.4, waveY(tmpV.x, tmpV.z, t) + 0.16, tmpV.z + side.z * s * 0.4,
        side.x * s * (0.8 + sp * 0.08), 0, side.z * s * (0.8 + sp * 0.08),
        { life: 1.8 + fxRnd(), s0: 0.16, s1: 0.36 + sp * 0.008, color: '#ffffff', drag: 1.4, flat: 0.35 });
    }
    // 뱃머리 물보라
    if (sp > 6) {
      const ns = Math.min(3, sp * dt * 3);
      for (let i = 0; i < 3 && fxRnd() < ns - i; i++) {
        const s = fxRnd() < 0.5 ? -1 : 1;
        const bowZ = v.s.kind === 'sub' ? 1.4 : 1.4;
        tmpV.set(s * 0.6, 0.05, bowZ).applyMatrix4(m.root.matrixWorld);
        puffs.emit(tmpV.x, Math.max(tmpV.y, 0.05), tmpV.z, side.x * s * (2 + fxRnd() * 2) + f.x * sp * 0.2, 2.5 + fxRnd() * 2.5 + sp * 0.08, side.z * s * (2 + fxRnd() * 2) + f.z * sp * 0.2,
          { life: 0.6, s0: 0.06, s1: 0.13, color: '#e8fbff', g: -14, drag: 0.6 });
      }
    }
  }
  function bubbles(v: V, dt: number) {
    if (!v.model || fxRnd() > dt * (6 + Math.abs(v.v) * 2)) return;
    tmpV.copy(v.model.tail).applyMatrix4(v.model.root.matrixWorld);
    puffs.emit(tmpV.x + (fxRnd() - 0.5) * 0.3, tmpV.y, tmpV.z + (fxRnd() - 0.5) * 0.3, 0, 1.5 + fxRnd(), 0, { life: 1.4, s0: 0.05, s1: 0.11, color: '#d8f6ff', g: 1.5, drag: 1.5 });
  }

  // ── 로켓 발사 연출
  function launch(v: V, dt: number, g: Game) {
    const m = v.model!;
    const body = m.bits.body, flame = m.bits.flame;
    v.phaseT += dt;
    const T = v.phaseT;
    const base = new THREE.Vector3().setFromMatrixPosition(body.matrixWorld);
    if (v.phase === 0) {
      // 카운트다운 3·2·1 — 아래에서 김이 모락모락
      const sec = 3 - Math.floor(T);
      if (sec !== v.steer && sec > 0) { v.steer = sec; g.ui.toast(`🚀 ${sec}`); }
      if (fxRnd() < dt * 18) {
        const a = fxRnd() * Math.PI * 2;
        puffs.emit(base.x + Math.cos(a) * 1.2, base.y + 0.2, base.z + Math.sin(a) * 1.2, Math.cos(a) * 3, 0.5, Math.sin(a) * 3, { life: 2.2, s0: 0.5, s1: 1.4, color: '#ffffff', drag: 1.2 });
      }
      if (T >= 3) { v.phase = 1; v.phaseT = 0; v.vy = 0; flame.visible = true; g.ui.toast('발사!'); }
    } else if (v.phase === 1) {
      // 상승: 점점 빠르게 + 흔들림 + 연기 기둥 + 불꽃
      v.vy += (6 + T * 9) * dt;
      body.position.y += v.vy * dt;
      body.position.x = Math.sin(T * 41) * 0.04 * Math.max(0, 1 - T * 0.3);
      flame.scale.set(1 + 0.1 * Math.sin(T * 50), 1 + 0.25 * Math.sin(T * 37) + Math.min(1, T * 0.5), 1 + 0.1 * Math.sin(T * 50));
      const n = Math.min(9, dt * 140);
      for (let i = 0; i < 9 && fxRnd() < n - i; i++) {
        const a = fxRnd() * Math.PI * 2, r = fxRnd() * 0.8;
        const gy = v.pos.y + 0.6;
        // 바닥 근처면 옆으로 퍼지는 구름, 높으면 꼬리 연기
        const near = base.y - gy < 6;
        const sp2 = near ? 7 + fxRnd() * 6 : 1.5 + fxRnd() * 3;
        puffs.emit(base.x + Math.cos(a) * r, base.y - 1.0, base.z + Math.sin(a) * r,
          Math.cos(a) * sp2, near ? 0.3 + fxRnd() : -2 - fxRnd() * 3, Math.sin(a) * sp2,
          { life: 2.5 + fxRnd() * 2, s0: 0.5 + fxRnd() * 0.4, s1: (near ? 2.0 : 1.4) + fxRnd() * 1.4, color: fxRnd() < 0.5 ? '#ffffff' : '#f6eefa', drag: near ? 1.3 : 0.7 });
        fire.emit(base.x + Math.cos(a) * r * 0.6, base.y - 1.2, base.z + Math.sin(a) * r * 0.6, Math.cos(a) * 2, -14 - fxRnd() * 6, Math.sin(a) * 2, { life: 0.35, s0: 0.5, s1: 0.2, color: fxRnd() < 0.5 ? '#ffb347' : '#ffe08a', drag: 2 });
      }
      if (T > 7.5) {
        v.phase = 2;
        g.ui.toast('우주로!');
        g.setWorld('space');
      }
    }
    m.root.updateMatrixWorld(true);
    // 카메라는 로켓을 올려다보게
    g.cam.pitch = THREE.MathUtils.lerp(g.cam.pitch, v.phase === 1 ? -0.1 : 0.15, Math.min(1, dt * 1.5));
  }
  function resetRocket(v: V) {
    const m = v.model;
    if (!m) return;
    m.bits.body.position.set(0, 0.6, 0);
    m.bits.flame.visible = false;
    v.phase = 0; v.phaseT = 0; v.vy = 0; v.steer = 0;
    m.root.updateMatrixWorld(true);
  }

  // ── 타기 / 내리기
  function mount(v: V, g: Game) {
    ensure(v);
    v.mounted = true;
    v.v = 0; v.vy = 0; v.steer = 0;
    if (v.s.kind === 'kart') kartBody(v, g);
    if (v.s.kind === 'bike' || v.s.kind === 'scooter') {
      const w = g.physics.world;
      const b = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(v.pos.x, v.pos.y + 0.8, v.pos.z));
      v.coll = w.createCollider(RAPIER.ColliderDesc.ball(0.4), b);
      const cc = w.createCharacterController(0.05);
      cc.setUp({ x: 0, y: 1, z: 0 });
      cc.enableAutostep(0.5, 0.2, false);
      cc.setApplyImpulsesToDynamicBodies(true);
      cc.setCharacterMass(80);
      v.cc = cc; v.body = b;
    }
    if (v.s.kind === 'rocket') resetRocket(v);
    g.player.mount(v.mountable);
    g.cam.yaw = v.s.kind === 'rocket' ? v.h + 0.5 : v.h + Math.PI;
    if (v.s.kind === 'rocket') { g.cam.pitch = 0.15; }
  }
  function exit(v: V, g: Game): THREE.Vector3 {
    v.mounted = false;
    if (v.cc) { g.physics.world.removeCharacterController(v.cc); v.cc = null; v.coll = null; }
    if (v.body) { g.physics.world.removeRigidBody(v.body); v.body = null; }
    const k = v.s.kind;
    if (k === 'rocket') { resetRocket(v); return new THREE.Vector3(v.pos.x - 6, v.pos.y, v.pos.z + 4); }
    v.v = k === 'plane' && v.pos.y > groundAt(v.pos.x, v.pos.z) + 1 ? v.v : 0;
    v.steer = 0;
    const side = new THREE.Vector3(Math.cos(v.h), 0, -Math.sin(v.h));
    const off = k === 'kart' ? 1.5 : k === 'plane' ? 3.2 : k === 'balloon' ? 1.3 : k === 'sail' || k === 'motor' ? 1.4 : 1.0;
    const out = v.pos.clone().addScaledVector(side, off);
    // 배·잠수정은 가까운 땅이 있으면 거기로
    if (k === 'sail' || k === 'motor' || k === 'sub') {
      out.y = 0;
      for (let r = 2; r <= 12; r += 1) {
        let found = false;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const x = v.pos.x + Math.cos(a) * r, z = v.pos.z + Math.sin(a) * r;
          if (groundAt(x, z) > 0.15) { out.set(x, groundAt(x, z), z); found = true; break; }
        }
        if (found) break;
      }
    }
    if (k === 'balloon') out.y = v.pos.y + 0.3;
    return out;
  }

  // ── 상호작용(가장 가까운 탈것)
  if (game) {
    game.addProvider('vehicles', (p, g) => {
      if (p.mounted || g.world !== 'earth') return null;
      let best: V | null = null, bd = Infinity;
      for (const v of vehicles) {
        if (v.mounted) continue;
        const dx = v.pos.x - p.pos.x, dz = v.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        const dy = Math.abs((v.s.kind === 'sub' ? v.pos.y : v.pos.y) - p.pos.y);
        if (d < REACH[v.s.kind] && dy < 4 && d < bd) { best = v; bd = d; }
      }
      if (!best) return null;
      const v = best;
      return { label: v.s.kind === 'rocket' ? '로켓 타고 우주로 발사!' : `${v.s.name} 타기`, dist: bd * 0.9, use: () => mount(v, g) };
    });
    game.onWorld((w) => { root.visible = w === 'earth'; });
  }

  // ── 매 프레임: 지연 생성·거리 숨김·쉬는 동안의 흔들림·효과
  let frame = 0;
  ctx.onUpdate((t, dt) => {
    frame++;
    const focus = game ? game.player.pos : new THREE.Vector3(ctx.camera.position.x, 0, ctx.camera.position.z);
    let built = 0;
    for (const v of vehicles) {
      const d = Math.hypot(v.pos.x - focus.x, v.pos.z - focus.z);
      const vis = d < VIEW[v.s.kind];
      if (vis && !v.model && built < 1) { ensure(v); built++; }
      if (!v.model) continue;
      v.model.root.visible = vis;
      if (!vis || v.mounted) continue;
      const k = v.s.kind;
      // 쉬는 동안
      if (k === 'sail' || k === 'motor' || (k === 'sub' && v.pos.y > -0.6)) place(v, t);
      else if (k === 'balloon') {
        const gy = Math.max(groundAt(v.pos.x, v.pos.z), 0);
        if (v.pos.y > gy + 0.01 && dt > 0) { v.pos.y = Math.max(gy, v.pos.y - dt * 1.6); place(v, t); }
        v.model.bits.flame.scale.setScalar(0.6 + 0.08 * Math.sin(t * 17 + v.idx));
      } else if (k === 'plane') {
        const gy = Math.max(groundAt(v.pos.x, v.pos.z), 0);
        if (v.pos.y > gy + 0.01 && dt > 0) {
          // 사람 없이 활강해서 내려앉는다
          v.v = Math.max(0, v.v - dt * 3);
          const f = fwdOf(v);
          v.pos.x += f.x * v.v * dt; v.pos.z += f.z * v.v * dt;
          v.pos.y = Math.max(gy, v.pos.y - dt * 4);
          v.pitch = 0.08; v.roll *= 0.98;
          place(v, t);
        } else if (v.pitch !== 0 || v.roll !== 0) { v.pitch = 0; v.roll = 0; place(v, t); }
        v.model.spin[0].rotation.z += dt * 2;
      } else if (k === 'sub' && v.pos.y <= -0.6 && dt > 0) {
        v.pos.y = Math.min(0, v.pos.y + dt * 0.8); place(v, t);
      }
    }
    if (game && !game.player.mounted) lines.update(dt);
    puffs.update(dt);
    fire.update(dt);
    void frame;
  });

  // 룩 테스트(게임 없음)·촬영 첫 장면에서도 마을 근처 탈것은 바로 보이게
  for (const v of vehicles) {
    const d = Math.hypot(v.pos.x, v.pos.z);
    if (d < 60) ensure(v);
  }
  // 디버그·촬영용
  (window as unknown as { __vehicles?: unknown }).__vehicles = {
    list: vehicles,
    mount: (kind: Kind, i = 0) => { if (!game) return; const v = vehicles.filter((x) => x.s.kind === kind)[i]; if (!v) return; game.player.teleport(v.pos.x, v.pos.z); mount(v, game); },
    /** 촬영용: 탈것을 (x,z) 로 옮겨 태우고 카메라를 비스듬히 */
    show: (kind: Kind, x = 0, z = 0.5, h = 0, camOff = 0.8, dist = 3.4, pitch = 0.22, y?: number) => {
      if (!game) return; const v = vehicles.filter((q) => q.s.kind === kind)[0]; if (!v) return;
      ensure(v); v.pos.set(x, y ?? (kind === 'sail' || kind === 'motor' || kind === 'sub' ? 0 : I.heightAt(x, z)), z); v.h = h; place(v, game.time);
      game.player.teleport(x, z); mount(v, game); game.cam.yaw = h + camOff; game.cam.pitch = pitch; game.cam.dist = dist;
    },
    goto: (kind: Kind, i = 0) => { if (!game) return; const v = vehicles.filter((x) => x.s.kind === kind)[i]; if (!v) return; ensure(v); game.player.teleport(v.pos.x + 2.5, v.pos.z + 2.5); },
  };
  return root;
}
