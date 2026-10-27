// 둥실풍선 열기구(v:balloon, P1): 오르내리기만(Space 버너 · C 공기 빼기) — 옆으로는 오늘의 바람을 따라 6 m/s 표류(GDD 3.8).
// 놓으면 천천히 내려앉는다. 2인승(바구니에 나란히). 해금은 풍선 선물 30개 + 반짝별 300(vehicles.ts 가 econ.spend → unlock).
import * as THREE from 'three';
import * as M from '../models';
import { nextXZ } from '../drive';
import { unlockKeyOf } from '../logic';
import { balloonDrift, wrapAngle, BALLOON_DRIFT } from '../p1logic';
import type { KindDef } from '../types';

const tmp = new THREE.Vector3();

export const balloon: KindDef = {
  kind: 'balloon', name: '둥실풍선 열기구', medium: 'air', boat: false, land: false, seats: 2,
  cam: 3.4, view: 2200, reach: 2.8, speed: BALLOON_DRIFT, unlockKey: unlockKeyOf('balloon'), dex: 'v_balloon', focusY: 3.0, margin: 2.4,
  make: () => M.balloon(),
  drive(v, input, dt, g, rt) {
    const t = g.time;
    const up = input.down('Space') ? 1 : (input.down('KeyC') || input.down('ControlLeft')) ? -1 : 0;
    v.vy += (up * 4.5 - 0.25 - v.vy) * Math.min(1, dt * 1.2);
    const gy0 = Math.max(rt.groundAt(v.pos.x, v.pos.z), 0);
    const airborne = v.pos.y > gy0 + 0.6;
    // 바람 따라(조종 없음): 머리도 바람 쪽으로 천천히 돈다
    const w = rt.wind();
    const d = balloonDrift(w, airborne);
    const sp = Math.hypot(d.x, d.z);
    v.v += (sp - v.v) * Math.min(1, dt * 0.8);
    if (sp > 0) v.h += wrapAngle(w.angle - v.h) * Math.min(1, dt * 0.4);
    v.steer = 0;
    const { nx, nz } = nextXZ(v, rt, dt);
    const gy = Math.max(rt.groundAt(nx, nz), 0);
    // 높은 언덕에 부딪히면 그 앞에서 멈춘다(버너로 넘는다)
    if (gy < v.pos.y + 0.2) { v.pos.x = nx; v.pos.z = nz; } else v.v = 0;
    const gNow = Math.max(rt.groundAt(v.pos.x, v.pos.z), 0);
    v.pos.y = THREE.MathUtils.clamp(v.pos.y + v.vy * dt, gNow, 320);
    if (v.pos.y <= gNow + 0.01) { v.v *= Math.exp(-dt * 3); if (v.vy < 0) v.vy = 0; }
    v.roll = Math.sin(t * 0.7) * 0.02; v.pitch = Math.sin(t * 0.5) * 0.02;
    const fl = v.model!.bits.flame;
    fl.scale.setScalar(up > 0 ? 1.5 + 0.25 * Math.sin(t * 30) : 0.7 + 0.1 * Math.sin(t * 20));
    if (up > 0 && rt.rnd() < dt * 30) {
      tmp.set(0, 2.95, 0).applyMatrix4(v.model!.root.matrixWorld);
      rt.fire.emit(tmp.x, tmp.y, tmp.z, 0, 4, 0, { life: 0.35, s0: 0.16, s1: 0.05, color: '#ffb347', drag: 3 });
      if (rt.rnd() < 0.08) rt.sfx('wind', { pitch: 0.6, x: v.pos.x, z: v.pos.z, vol: 0.5 });
    }
    rt.finish(v, g, dt, { camK: 0.6 });
  },
  idle(v, t, dt, rt) {
    const gy = Math.max(rt.groundAt(v.pos.x, v.pos.z), 0);
    if (v.pos.y > gy + 0.01 && dt > 0) {
      // 사람 없이 내려앉는 동안에도 바람에 조금 밀린다
      const w = rt.wind();
      v.pos.x += Math.sin(w.angle) * dt * 1.5; v.pos.z += Math.cos(w.angle) * dt * 1.5;
      v.pos.y = Math.max(Math.max(rt.groundAt(v.pos.x, v.pos.z), 0), v.pos.y - dt * 1.6);
      rt.place(v, t);
    }
    v.model!.bits.flame.scale.setScalar(0.6 + 0.08 * Math.sin(t * 17 + v.idx));
  },
  exit(v) {
    const side = new THREE.Vector3(Math.cos(v.h), 0, -Math.sin(v.h));
    const out = v.pos.clone().addScaledVector(side, 1.3);
    out.y = v.pos.y + 0.3;
    return out;
  },
};
