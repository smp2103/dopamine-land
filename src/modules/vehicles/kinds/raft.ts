// 통나무 뗏목(P0): 12 m/s, 파도에 출렁, 영차영차 노 젓기. DIY(v:raft) 로 열리면 가까운 물에 저절로 떠오른다.
import * as THREE from 'three';
import * as M from '../models';
import { driveBoat, shoreExit } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef } from '../types';

const tmp = new THREE.Vector3();

export const raft: KindDef = {
  kind: 'raft', name: '통나무 뗏목', medium: 'water', boat: true, land: false,
  cam: 1.5, view: 320, reach: 3.0, speed: 12, unlockKey: unlockKeyOf('raft'), dex: 'v_raft', focusY: 0.35, depth: 0.5,
  make: () => M.raft(),
  drive(v, input, dt, g, rt) {
    driveBoat(v, input, dt, g, rt, { maxV: 12, boostV: 14, acc: 4.2, turn: 1.25, depth: 0.5, rollK: 0.2, pitchK: 0.03 });
    // 노 젓기: 움직일수록 빠르게 원을 그린다. 물갈퀴가 물에 들어갈 때 찰박
    const m = v.model!;
    const moving = Math.abs(v.v) > 0.4 || input.axis().y !== 0;
    const prev = v.st.row ?? 0;
    v.st.row = prev + dt * (moving ? 2.2 + Math.abs(v.v) * 0.35 : 0.6);
    const ph = v.st.row;
    m.bits.oar.rotation.set(Math.sin(ph) * 0.5, Math.cos(ph) * 0.32, Math.sin(ph) * 0.12);
    if (moving && Math.floor(prev / Math.PI) !== Math.floor(ph / Math.PI) && Math.sin(ph) < 0) {
      tmp.set(-1.0, -0.7, 0).applyMatrix4(m.bits.oar.matrixWorld);
      for (let i = 0; i < 4; i++) rt.puffs.emit(tmp.x, rt.waterY(tmp.x, tmp.z, g.time) + 0.08, tmp.z, (rt.rnd() - 0.5) * 1.6, 1.2 + rt.rnd() * 1.2, (rt.rnd() - 0.5) * 1.6, { life: 0.5, s0: 0.05, s1: 0.11, color: '#e8fbff', g: -9 });
    }
    m.bits.flag.rotation.y = Math.sin(g.time * 6.5) * 0.22 + v.steer * 0.2;
    rt.wake(v, dt, g.time);
    rt.finish(v, g, dt, { camK: 2.0 });
  },
  place(v, t, rt) {
    rt.place(v, t);
    // 통나무라 더 출렁: 수면 위아래 + 살짝 흔들
    const m = v.model;
    if (!m) return;
    m.root.position.y += 0.035 * Math.sin(t * 2.1 + v.idx);
    m.root.rotateZ(0.03 * Math.sin(t * 1.6 + v.idx * 1.7));
    m.root.updateMatrixWorld(true);
  },
  idle(v, t) { if (v.model) v.model.bits.flag.rotation.y = Math.sin(t * 5.5 + v.idx) * 0.22; },
  exit: (v, _g, rt) => shoreExit(v, rt, 1.3),
};
