// 꼬르륵호 잠수정(v:submarine, P1): 8 m/s(GDD 3.8). Space 떠오르기 · C 가라앉기, 손을 떼면 부력으로 천천히 떠오른다.
// 바닥 1.2 m 위까지 내려간다(해구도). 물속에선 서치라이트 원뿔이 켜지고, 로봇팔(E)은 vehicles.ts 의 줍기가 움직인다.
import * as THREE from 'three';
import * as M from '../models';
import { lightCone } from '../models2';
import { nextXZ, shoreExit, throttle, turn } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef, Veh } from '../types';

/** 부력(손을 떼면 떠오르는 속도 m/s) */
export const SUB_BUOY = 0.45;
export const SUB_SPEED = 8;
/** 이 깊이(수면 아래 m)부터 서치라이트 */
const LIGHT_DEPTH = 1.5;

/** 서치라이트 켜고 끄기(밝기는 깊을수록) */
function lamp(v: Veh, on: boolean, t: number) {
  const m = v.model;
  if (!m) return;
  let cone = m.bits.cone as THREE.Mesh | undefined;
  if (!cone && on) {
    cone = lightCone(16, 3.4, '#fff1b8', 'z', 0.3);
    m.bits.lamp.add(cone);
    m.bits.cone = cone;
  }
  if (!cone) return;
  cone.visible = on;
  // 살짝 일렁이는 빛
  if (on) cone.scale.set(1 + 0.03 * Math.sin(t * 2.3), 1 + 0.03 * Math.sin(t * 1.7 + 1), 1);
}

export const sub: KindDef = {
  kind: 'sub', id: 'submarine', name: '꼬르륵호 잠수정', medium: 'water', boat: true, land: false,
  cam: 1.5, view: 160, reach: 3.4, speed: SUB_SPEED, unlockKey: unlockKeyOf('sub'), dex: 'v_submarine', focusY: 0.6, depth: 2.2,
  make: () => M.submarine(),
  drive(v, input, dt, g, rt) {
    const ax = input.axis();
    throttle(v, ax, SUB_SPEED, 4, dt);
    v.steer += (ax.x - v.steer) * Math.min(1, dt * 6);
    turn(v, { x: v.steer }, 1.2, dt, 1, 1);
    const up = input.down('Space') ? 1 : (input.down('KeyC') || input.down('ControlLeft')) ? -1 : 0;
    // 부력: 손을 떼면 살짝 떠오른다(수면이면 0)
    const want = up !== 0 ? up * 3.2 : v.pos.y < -0.05 ? SUB_BUOY : 0;
    v.vy += (want - v.vy) * Math.min(1, dt * 1.6);
    const { nx, nz } = nextXZ(v, rt, dt);
    const floorN = rt.groundAt(nx, nz) + 1.2;
    // 바다여야 하고, 앞 바닥이 너무 얕거나(수면 근처) 벽처럼 솟았으면 못 간다 — 완만한 오르막은 타고 올라간다
    const ok = rt.I.waterLevelAt(nx, nz) === 0 && floorN < -0.2 && floorN - v.pos.y < 2.5 * Math.max(0.3, Math.abs(v.v * dt) * 4);
    if (ok) { v.pos.x = nx; v.pos.z = nz; } else v.v *= -0.3;
    const floor = Math.min(0, rt.groundAt(v.pos.x, v.pos.z) + 1.2);
    v.pos.y = THREE.MathUtils.clamp(v.pos.y + v.vy * dt, floor, 0);
    if (v.pos.y <= floor + 1e-3 && v.vy < 0) v.vy = 0;
    v.pitch += (-v.vy * 0.07 - v.pitch) * Math.min(1, dt * 3);
    v.roll += (v.steer * 0.12 - v.roll) * Math.min(1, dt * 3);
    const under = v.pos.y < -0.8;
    if (under) rt.bubbles(v, dt); else rt.wake(v, dt, g.time);
    lamp(v, v.pos.y < -LIGHT_DEPTH, g.time);
    const m = v.model!;
    m.spin[0].rotation.z += dt * (4 + Math.abs(v.v) * 2.5);
    // 로봇팔: 줍는 중(st.arm 0..1)이면 쭉 펴고, 아니면 접는다
    const a = v.st.arm ?? 0;
    if (a > 0) v.st.arm = Math.max(0, a - dt / 1.1);
    const ext = a > 0 ? Math.sin(Math.min(1, a) * Math.PI) : 0;
    m.bits.arm.rotation.x = 1.2 - ext * 1.05;
    m.bits.claw.rotation.z = ext > 0.6 ? Math.sin(g.time * 18) * 0.2 : 0;
    rt.finish(v, g, dt, { camK: 2.4 });
  },
  place(v, t, rt) {
    const m = v.model;
    if (!m) return;
    if (v.pos.y > -0.6) {
      // 수면: 배처럼 파도 위(몸통 반쯤 잠김)
      rt.place(v, t);
      m.root.position.y -= 0.95;
    } else {
      m.root.quaternion.setFromEuler(new THREE.Euler(v.pitch, v.h, v.roll, 'YXZ'));
      m.root.position.copy(v.pos);
    }
    m.root.updateMatrixWorld(true);
  },
  idle(v, t, dt, rt) {
    // 사람 없이 부력으로 천천히 떠오른다
    if (v.pos.y <= -0.6 && dt > 0) { v.pos.y = Math.min(0, v.pos.y + dt * 0.8); sub.place!(v, t, rt); }
    lamp(v, false, t);
  },
  exit: (v, _g, rt) => { lamp(v, false, 0); v.st.arm = 0; return shoreExit(v, rt, 1.4); },
};
