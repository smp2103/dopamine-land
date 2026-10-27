// 노란 잠수정(v:submarine): 10 m/s, Space 떠오르기 · C 가라앉기. 수면 가까이면 파도를 탄다.
import * as THREE from 'three';
import * as M from '../models';
import { nextXZ, shoreExit, throttle, turn } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef } from '../types';

export const sub: KindDef = {
  kind: 'sub', id: 'submarine', name: '꼬르륵호 잠수정', medium: 'water', boat: true, land: false,
  cam: 1.5, view: 160, reach: 3.4, speed: 10, unlockKey: unlockKeyOf('sub'), dex: 'v_submarine', focusY: 0.6, depth: 2.2,
  make: () => M.submarine(),
  drive(v, input, dt, g, rt) {
    const ax = input.axis();
    throttle(v, ax, rt.boost(input) ? 14 : 10, 5, dt);
    v.steer += (ax.x - v.steer) * Math.min(1, dt * 6);
    turn(v, { x: v.steer }, 1.3, dt, 1, 1);
    const up = input.down('Space') ? 1 : (input.down('KeyC') || input.down('ControlLeft')) ? -1 : 0;
    v.vy += (up * 3.5 - v.vy) * Math.min(1, dt * 2);
    const { nx, nz } = nextXZ(v, rt, dt);
    const floor = rt.groundAt(nx, nz) + 1.2;
    const ok = rt.I.waterLevelAt(nx, nz) === 0 && floor < -0.2;
    if (ok) { v.pos.x = nx; v.pos.z = nz; } else v.v *= -0.3;
    v.pos.y = THREE.MathUtils.clamp(v.pos.y + v.vy * dt, Math.min(0, rt.groundAt(v.pos.x, v.pos.z) + 1.2), 0);
    v.pitch += (-v.vy * 0.06 - v.pitch) * Math.min(1, dt * 3);
    v.roll += (v.steer * 0.15 - v.roll) * Math.min(1, dt * 3);
    if (v.pos.y < -0.8) rt.bubbles(v, dt); else rt.wake(v, dt, g.time);
    v.model!.spin[0].rotation.z += dt * (4 + Math.abs(v.v) * 2.5);
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
    // 사람 없이 천천히 떠오른다
    if (v.pos.y <= -0.6 && dt > 0) { v.pos.y = Math.min(0, v.pos.y + dt * 0.8); sub.place!(v, t, rt); }
  },
  exit: (v, _g, rt) => shoreExit(v, rt, 1.4),
};
