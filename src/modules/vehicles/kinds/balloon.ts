// 열기구(v:balloon): Space 버너로 떠오르고 C 로 내려간다. 놓으면 천천히 내려앉는다.
import * as THREE from 'three';
import * as M from '../models';
import { nextXZ, throttle, turn } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef } from '../types';

const tmp = new THREE.Vector3();

export const balloon: KindDef = {
  kind: 'balloon', name: '열기구', medium: 'air', boat: false, land: false,
  cam: 3.4, view: 2200, reach: 2.8, speed: 8, unlockKey: unlockKeyOf('balloon'), dex: 'v_balloon', focusY: 3.0, margin: 2.4,
  make: () => M.balloon(),
  drive(v, input, dt, g, rt) {
    const t = g.time;
    const ax = input.axis();
    throttle(v, ax, rt.boost(input) ? 12 : 8, 2, dt);
    turn(v, ax, 0.8, dt, 1, 1);
    const up = input.down('Space') ? 1 : (input.down('KeyC') || input.down('ControlLeft')) ? -1 : 0;
    v.vy += (up * 4.5 - 0.15 - v.vy) * Math.min(1, dt * 1.2);
    const { nx, nz } = nextXZ(v, rt, dt);
    const gy = Math.max(rt.groundAt(nx, nz), 0);
    v.pos.x = nx; v.pos.z = nz;
    v.pos.y = THREE.MathUtils.clamp(v.pos.y + v.vy * dt, gy, 320);
    if (v.pos.y <= gy + 0.01) { v.v *= Math.exp(-dt * 3); if (v.vy < 0) v.vy = 0; }
    v.roll = Math.sin(t * 0.7) * 0.02 - v.steer * 0.05; v.pitch = Math.sin(t * 0.5) * 0.02;
    const fl = v.model!.bits.flame;
    fl.scale.setScalar(up > 0 ? 1.5 + 0.25 * Math.sin(t * 30) : 0.7 + 0.1 * Math.sin(t * 20));
    if (up > 0 && rt.rnd() < dt * 30) {
      tmp.set(0, 2.95, 0).applyMatrix4(v.model!.root.matrixWorld);
      rt.fire.emit(tmp.x, tmp.y, tmp.z, 0, 4, 0, { life: 0.35, s0: 0.16, s1: 0.05, color: '#ffb347', drag: 3 });
    }
    rt.finish(v, g, dt, { camK: 1.5 });
  },
  idle(v, t, dt, rt) {
    const gy = Math.max(rt.groundAt(v.pos.x, v.pos.z), 0);
    if (v.pos.y > gy + 0.01 && dt > 0) { v.pos.y = Math.max(gy, v.pos.y - dt * 1.6); rt.place(v, t); }
    v.model!.bits.flame.scale.setScalar(0.6 + 0.08 * Math.sin(t * 17 + v.idx));
  },
  exit(v) {
    const side = new THREE.Vector3(Math.cos(v.h), 0, -Math.sin(v.h));
    const out = v.pos.clone().addScaledVector(side, 1.3);
    out.y = v.pos.y + 0.3;
    return out;
  },
};
