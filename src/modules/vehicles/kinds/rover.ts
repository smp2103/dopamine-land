// 깡총카 달 로버(v:rover, P1): 달에 처음 내리면 받는다. 15 m/s(GDD 3.8), 저중력(-4.5)에서 통통 튄다.
// 땅을 따라 달리다 언덕 마루를 넘으면 그 기세로 붕 뜨고, 세게 떨어지면 바퀴가 통 튕긴다. Space = 깡총 점프.
// 세계는 우주(game.spaceRoot) — 땅 높이는 game.groundAt(달 땅 공급자), 달 가장자리(반경 380 m) 밖으로는 못 간다.
import * as THREE from 'three';
import { rover as roverModel } from '../models2';
import { sideExit, throttle, turn } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef, Rt, Veh } from '../types';

export const ROVER_SPEED = 15;
export const MOON_G = 4.5;
/** 달 중심(core SPACE_ORIGIN 과 같은 값)·탈 수 있는 반경 */
export const MOON_C = { x: 0, z: 30000 }, MOON_RIDE_R = 380;

/** 한 걸음: 땅 따라가기 + 공중 + 통통 튐. 돌려주는 값은 이번에 착지했나 */
export function roverStep(v: Veh, rt: Rt, nx: number, nz: number, dt: number): boolean {
  const gNew = rt.groundAt(nx, nz);
  v.pos.x = nx; v.pos.z = nz;
  let landed = false;
  if (v.air) {
    v.vy -= MOON_G * dt;
    v.pos.y += v.vy * dt;
    if (v.pos.y <= gNew) {
      const hit = -v.vy;
      v.pos.y = gNew;
      if (hit > 2.2) { v.vy = hit * 0.38; landed = true; } // 통!
      else { v.air = false; v.vy = 0; landed = hit > 0.6; }
    }
  } else {
    // 땅을 따라 오르내린 속도 — 마루를 넘어 땅이 꺼지면 그 속도로 떠오른다
    const climb = dt > 0 ? (gNew - v.pos.y) / dt : 0;
    if (climb < v.vy - MOON_G * dt * 3 && v.vy > 0.8) { v.air = true; v.pos.y += v.vy * dt; v.vy -= MOON_G * dt; }
    else { v.vy = climb; v.pos.y = gNew; }
  }
  return landed;
}

export const rover: KindDef = {
  kind: 'rover', id: 'rover', name: '깡총카 달 로버', medium: 'land', boat: false, land: true, world: 'space',
  cam: 1.4, view: 260, reach: 3.0, speed: ROVER_SPEED, unlockKey: unlockKeyOf('rover'), dex: 'v_moon_rover', focusY: 0.7, margin: 1.8,
  lockText: () => '🔒 깡총카 달 로버 — 달에 처음 도착하면 받아요 🌙',
  make: () => roverModel(),
  drive(v, input, dt, g, rt) {
    const ax = input.axis();
    throttle(v, ax, rt.boost(input) ? ROVER_SPEED + 3 : ROVER_SPEED, v.air ? 2 : 8, dt, 0.35);
    turn(v, ax, v.air ? 0.6 : 1.7, dt);
    if (!v.air && input.hit('Space')) { v.air = true; v.vy = 5.5; rt.sfx('jump', { pitch: 0.8, vol: 0.5 }); }
    const f = rt.fwd(v);
    let nx = v.pos.x + f.x * v.v * dt, nz = v.pos.z + f.z * v.v * dt;
    // 달 가장자리: 반경 밖이면 안쪽으로 밀어 넣고 멈춘다
    const ox = nx - MOON_C.x, oz = nz - MOON_C.z, r = Math.hypot(ox, oz);
    if (r > MOON_RIDE_R) { nx = MOON_C.x + ox / r * MOON_RIDE_R; nz = MOON_C.z + oz / r * MOON_RIDE_R; v.v *= 0.5; }
    // 가파른 벽(크레이터 테두리)은 넘지 못한다
    if (!v.air && rt.groundAt(nx, nz) - v.pos.y > Math.max(0.6, Math.abs(v.v * dt) * 3)) { v.v *= -0.3; nx = v.pos.x; nz = v.pos.z; }
    const landed = roverStep(v, rt, nx, nz, dt);
    if (landed) {
      // 달먼지 고리
      for (let i = 0; i < 10; i++) {
        const a = rt.rnd() * Math.PI * 2;
        rt.puffs.emit(v.pos.x + Math.cos(a) * 0.9, v.pos.y + 0.1, v.pos.z + Math.sin(a) * 0.9, Math.cos(a) * 2.2, 0.5 + rt.rnd() * 0.8, Math.sin(a) * 2.2,
          { life: 1.2, s0: 0.12, s1: 0.32, color: '#e9e3f7', g: -1.2, drag: 1.4 });
      }
      v.st.bounce = 1;
    }
    v.st.bounce = Math.max(0, (v.st.bounce ?? 0) - dt * 2);
    // 땅 기울기
    const L = 0.9, W = 0.8, fx = Math.sin(v.h), fz = Math.cos(v.h);
    const hf = rt.groundAt(v.pos.x + fx * L, v.pos.z + fz * L), hb = rt.groundAt(v.pos.x - fx * L, v.pos.z - fz * L);
    const hr = rt.groundAt(v.pos.x - fz * W, v.pos.z + fx * W), hl = rt.groundAt(v.pos.x + fz * W, v.pos.z - fx * W);
    const tp = v.air ? THREE.MathUtils.clamp(-v.vy * 0.05, -0.3, 0.3) : Math.atan2(hb - hf, 2 * L);
    const tr = v.air ? -v.steer * 0.1 : Math.atan2(hr - hl, 2 * W);
    v.pitch += (tp - v.pitch) * Math.min(1, dt * 6);
    v.roll += (tr - v.roll) * Math.min(1, dt * 6);
    if (!v.air && Math.abs(v.v) > 3 && rt.rnd() < dt * Math.abs(v.v) * 0.6) {
      const m0 = v.model!;
      const tp2 = m0.tail.clone().applyMatrix4(m0.root.matrixWorld);
      rt.puffs.emit(tp2.x, v.pos.y + 0.1, tp2.z, -f.x * 2, 0.6 + rt.rnd() * 0.5, -f.z * 2, { life: 1.4, s0: 0.1, s1: 0.3, color: '#ece6f8', g: -0.6, drag: 1.2 });
    }
    const m = v.model!;
    v.wheelA += v.v * dt / 0.34;
    for (const w of m.wheels) w.rotation.x = v.wheelA;
    m.bits.dish.rotation.y += dt * 0.8;
    m.bits.susp.position.y = -Math.sin(v.st.bounce * Math.PI) * 0.1 + (v.air ? 0.05 : 0);
    rt.finish(v, g, dt, { camK: 2.2, lineY: 0.8 });
  },
  place(v, _t, _rt) {
    const m = v.model;
    if (!m) return;
    m.root.quaternion.setFromEuler(new THREE.Euler(v.pitch, v.h, v.roll, 'YXZ'));
    m.root.position.copy(v.pos);
    m.root.updateMatrixWorld(true);
  },
  idle(v, t, dt, rt) {
    v.model!.bits.dish.rotation.y += dt * 0.4;
    // 내린 채 공중이면 사뿐히 내려앉는다
    if (v.pos.y > rt.groundAt(v.pos.x, v.pos.z) + 0.01 && dt > 0) { v.air = true; roverStep(v, rt, v.pos.x, v.pos.z, dt); rover.place!(v, t, rt); }
  },
  exit: (v) => { const out = sideExit(v, 1.6); out.y = v.pos.y + 0.4; return out; },
};
