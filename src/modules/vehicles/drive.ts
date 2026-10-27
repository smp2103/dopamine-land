// 종류들이 함께 쓰는 운전 도우미: 땅 달리기(캐릭터 컨트롤러로 나무·집에 막힘), 물 위 달리기, 물가에 내리기.
import * as THREE from 'three';
import type { Game, Input } from '../../core/game';
import { RAPIER } from '../../core/physics';
import type { Rt, Veh } from './types';

const clamp = THREE.MathUtils.clamp;

/** 앞뒤 입력으로 속도 맞추기(놓으면 천천히 서고, 반대로 누르면 빨리 선다) */
export function throttle(v: Veh, ax: { y: number }, maxV: number, acc: number, dt: number, back = 0.3) {
  const target = ax.y > 0 ? maxV : ax.y < 0 ? -maxV * back : 0;
  const a = ax.y === 0 ? acc * 0.6 : (Math.sign(target - v.v) !== Math.sign(v.v) && v.v !== 0 ? acc * 1.8 : acc);
  v.v += Math.sign(target - v.v) * Math.min(Math.abs(target - v.v), a * dt);
}

/** 좌우 입력으로 돌기. grip: 속도가 있어야 돈다(막혀 멈춰도 조금은 돌 수 있게 최소 minGrip) */
export function turn(v: Veh, ax: { x: number }, rate: number, dt: number, minGrip = 0.45, gripV = 4) {
  v.steer += (ax.x - v.steer) * Math.min(1, dt * 6);
  const grip = Math.max(minGrip, Math.min(1, Math.abs(v.v) / gripV));
  v.h -= v.steer * rate * grip * Math.sign(v.v || 1) * dt;
}

/** 다음 자리(월드 가장자리 안으로) */
export function nextXZ(v: Veh, rt: Rt, dt: number, extra?: { x: number; z: number }) {
  const f = rt.fwd(v);
  const b = rt.I.WORLD_BOUNDS;
  const nx = clamp(v.pos.x + (f.x * v.v + (extra?.x ?? 0)) * dt, b.minX + 5, b.maxX - 5);
  const nz = clamp(v.pos.z + (f.z * v.v + (extra?.z ?? 0)) * dt, b.minZ + 5, b.maxZ - 5);
  return { nx, nz };
}

// ───────────── 땅 ─────────────

/** 땅 탈것 몸체: 운동학 공 + 캐릭터 컨트롤러(정적 충돌은 막고, 공은 밀어낸다) */
export function landBody(v: Veh, g: Game) {
  const w = g.physics?.world;
  if (!w) return;
  const b = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(v.pos.x, v.pos.y + 0.8, v.pos.z));
  v.coll = w.createCollider(RAPIER.ColliderDesc.ball(0.4), b);
  const cc = w.createCharacterController(0.05);
  cc.setUp({ x: 0, y: 1, z: 0 });
  cc.enableAutostep(0.5, 0.2, false);
  cc.setApplyImpulsesToDynamicBodies(true);
  cc.setCharacterMass(80);
  v.cc = cc; v.body = b;
}
/** 물리 몸체 치우기 */
export function dropBody(v: Veh, g: Game) {
  const w = g.physics?.world;
  if (v.cc && w) w.removeCharacterController(v.cc);
  if (v.body && w) w.removeRigidBody(v.body);
  v.cc = null; v.coll = null; v.body = null;
}

export interface LandOpts {
  maxV: number;
  boostV: number;
  acc: number;
  turn: number;
  /** 내리막 가속 세기(0 = 없음). 오르막은 조금 느려진다 */
  downhill?: number;
  /** Space 점프 세기(m/s, 0 = 없음) */
  jump?: number;
  dustAmt?: number;
  lean?: number;
}

/** 땅 달리기(자전거·스쿠터·버기 …) */
export function driveLand(v: Veh, input: Input, dt: number, g: Game, rt: Rt, o: LandOpts) {
  const ax = input.axis();
  const boost = rt.boost(input);
  let maxV = boost ? o.boostV : o.maxV;
  // 경사: 앞쪽이 낮으면 내리막(+), 높으면 오르막(-)
  const f = rt.fwd(v);
  const here = rt.groundAt(v.pos.x, v.pos.z);
  const slope = (here - rt.groundAt(v.pos.x + f.x * 1.5, v.pos.z + f.z * 1.5)) / 1.5;
  if (o.downhill && !v.air) {
    const s = clamp(slope, -0.6, 0.8);
    // 내리막이면 최고 속도도 늘고(최대 1.5배) 저절로 굴러간다
    if (s > 0.04) maxV *= 1 + Math.min(0.5, s * 1.4);
    if (s > 0.04 && v.v >= 0) v.v += s * o.downhill * dt;
    else if (s < -0.04 && v.v > 0) v.v += s * o.downhill * 0.45 * dt;
  }
  if (v.v > maxV) v.v = Math.max(maxV, v.v - o.acc * 0.5 * dt); // 넘친 속도는 천천히 줄인다
  else throttle(v, ax, maxV, v.air ? o.acc * 0.3 : o.acc, dt);
  turn(v, ax, o.turn, dt);
  // 점프
  if (o.jump && !v.air && input.hit('Space')) { v.air = true; v.vy = o.jump; }
  const { nx, nz } = nextXZ(v, rt, dt);
  const gy = rt.groundAt(nx, nz);
  const wl = rt.I.waterLevelAt(nx, nz);
  const wet = Number.isFinite(wl) && wl - gy > 0.45;
  if (v.air) {
    v.vy -= 20 * dt;
    let y = v.pos.y + v.vy * dt;
    if (wet) { v.v *= -0.25; }
    else { v.pos.x = nx; v.pos.z = nz; }
    const g2 = rt.groundAt(v.pos.x, v.pos.z);
    if (y <= g2) {
      // 착지: 통 하고 먼지
      y = g2; v.air = false; v.vy = 0;
      for (let i = 0; i < 6; i++) rt.puffs.emit(v.pos.x + (rt.rnd() - 0.5) * 0.8, y + 0.08, v.pos.z + (rt.rnd() - 0.5) * 0.8, (rt.rnd() - 0.5) * 2.4, 0.6 + rt.rnd(), (rt.rnd() - 0.5) * 2.4, { life: 0.55, s0: 0.08, s1: 0.2, color: '#fff6e8', g: -2, drag: 2.5 });
    }
    v.pos.y = y;
    v.body?.setNextKinematicTranslation({ x: v.pos.x, y: v.pos.y + 0.8, z: v.pos.z });
    v.pitch += (-Math.max(-0.2, Math.min(0.2, v.vy * 0.04)) - v.pitch) * Math.min(1, dt * 6);
  } else {
    const blocked = wet || gy - v.pos.y > 1.1 * Math.max(0.3, Math.abs(v.v * dt) * 3);
    if (blocked) v.v *= -0.25;
    else if (v.cc && v.coll && v.body) {
      const want = { x: nx - v.pos.x, y: gy - v.pos.y, z: nz - v.pos.z };
      v.cc.computeColliderMovement(v.coll, want);
      const mv = v.cc.computedMovement();
      const wl2 = Math.hypot(want.x, want.z), ml = Math.hypot(mv.x, mv.z);
      const px = v.pos.x + mv.x, pz = v.pos.z + mv.z;
      v.pos.set(px, rt.groundAt(px, pz), pz);
      v.body.setNextKinematicTranslation({ x: px, y: v.pos.y + 0.8, z: pz });
      if (wl2 > 0.02 && ml < wl2 * 0.35 && Math.abs(v.v) > 3) {
        const f2 = rt.fwd(v);
        for (let i = 0; i < 5; i++) rt.puffs.emit(v.pos.x + f2.x * 0.8, v.pos.y + 0.5, v.pos.z + f2.z * 0.8, (rt.rnd() - 0.5) * 3, 1 + rt.rnd() * 2, (rt.rnd() - 0.5) * 3, { life: 0.5, s0: 0.1, s1: 0.22, color: '#fff6e8', g: -2 });
        v.v *= -0.3;
      } else if (wl2 > 0.02) v.v *= Math.min(1, 0.4 + 0.6 * ml / wl2);
    } else v.pos.set(nx, gy, nz);
    v.pitch = 0;
    rt.dust(v, dt, o.dustAmt ?? 1);
  }
  v.roll += (-v.steer * Math.min(1, Math.abs(v.v) / 8) * (o.lean ?? 0.28) - v.roll) * Math.min(1, dt * 5);
  const m = v.model!;
  v.wheelA += v.v * dt / 0.3;
  for (const w of m.wheels) w.rotation.x = v.wheelA;
}

/** 땅 탈것 내릴 자리(옆으로 off m) */
export function sideExit(v: Veh, off: number): THREE.Vector3 {
  const side = new THREE.Vector3(Math.cos(v.h), 0, -Math.sin(v.h));
  return v.pos.clone().addScaledVector(side, off);
}

// ───────────── 물 ─────────────

export interface BoatOpts {
  maxV: number;
  boostV: number;
  acc: number;
  turn: number;
  /** 뜰 수 있는 최소 깊이 */
  depth: number;
  /** 기울기(돌 때 옆으로) */
  rollK?: number;
  /** 빠를 때 뱃머리 들기 */
  pitchK?: number;
  /** 해류를 타나(기본 true) */
  currents?: boolean;
}

/** 물 위 달리기(뗏목·통통배·모터보트·돛단배·오리튜브). 얕으면 튕겨 나온다 */
export function driveBoat(v: Veh, input: Input, dt: number, g: Game, rt: Rt, o: BoatOpts) {
  const ax = input.axis();
  const maxV = rt.boost(input) ? o.boostV : o.maxV;
  throttle(v, ax, maxV, o.acc, dt);
  turn(v, ax, o.turn, dt, 0.45, 4);
  const cur = o.currents === false ? { x: 0, z: 0 } : rt.current(v.pos.x, v.pos.z);
  const { nx, nz } = nextXZ(v, rt, dt, cur);
  if (!rt.deep(nx, nz, o.depth)) {
    v.v *= -0.3;
    // 얕은 곳에 닿으면 작은 물보라
    if (Math.abs(v.v) > 2) for (let i = 0; i < 3; i++) rt.puffs.emit(nx, rt.waterY(nx, nz, g.time) + 0.1, nz, (rt.rnd() - 0.5) * 2, 1.5 + rt.rnd(), (rt.rnd() - 0.5) * 2, { life: 0.5, s0: 0.05, s1: 0.12, color: '#e8fbff', g: -9 });
  } else { v.pos.x = nx; v.pos.z = nz; }
  v.roll += (v.steer * Math.min(1, Math.abs(v.v) / 12) * (o.rollK ?? 0.16) - v.roll) * Math.min(1, dt * 3);
  v.pitch += (-Math.min(1, Math.abs(v.v) / Math.max(1, o.maxV)) * (o.pitchK ?? 0.09) - v.pitch) * Math.min(1, dt * 2);
}

/** 배에서 내리기: 가까운 땅(12 m 안)이 있으면 거기로, 없으면 옆 물로(수영) */
export function shoreExit(v: Veh, rt: Rt, off = 1.4): THREE.Vector3 {
  for (let r = 2; r <= 12; r += 1) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = v.pos.x + Math.cos(a) * r, z = v.pos.z + Math.sin(a) * r;
      const gy = rt.groundAt(x, z);
      const wl = rt.I.waterLevelAt(x, z);
      if (gy > 0.15 && (!Number.isFinite(wl) || wl - gy < 0.2)) return new THREE.Vector3(x, gy, z);
    }
  }
  const out = sideExit(v, off);
  out.y = 0;
  return out;
}
