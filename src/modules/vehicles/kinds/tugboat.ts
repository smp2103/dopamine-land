// 통통배(P0): 25 m/s, 굴뚝에서 통통 동그란 연기. 멈추면(속도 < 1) 갑판 낚시 — fishing 이 vehicles.current() 를 본다.
import * as THREE from 'three';
import * as M from '../models';
import { driveBoat, shoreExit } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef, Rt, Veh } from '../types';

const tmp = new THREE.Vector3();

/** 굴뚝 연기 한 덩이(속도가 붙을수록 자주·뒤로 흘러간다) */
function puff(v: Veh, rt: Rt, big: number) {
  const m = v.model;
  if (!m) return;
  tmp.setFromMatrixPosition(m.bits.chimney.matrixWorld);
  const f = rt.fwd(v);
  const back = Math.abs(v.v) * 0.35;
  rt.puffs.emit(tmp.x, tmp.y + 0.05, tmp.z, -f.x * back + (rt.rnd() - 0.5) * 0.3, 1.5 + rt.rnd() * 0.6, -f.z * back + (rt.rnd() - 0.5) * 0.3,
    { life: 2.2 + rt.rnd() * 0.8, s0: 0.18 * big, s1: (0.6 + rt.rnd() * 0.22) * big, color: rt.rnd() < 0.5 ? '#f4f1ff' : '#e9e4f6', drag: 0.9 });
}

export const tugboat: KindDef = {
  kind: 'tugboat', name: '통통배', medium: 'water', boat: true, land: false, seats: 2,
  cam: 1.8, view: 380, reach: 3.6, speed: 25, unlockKey: unlockKeyOf('tugboat'), dex: 'v_tugboat', focusY: 0.5, depth: 0.9,
  make: () => M.tugboat(),
  drive(v, input, dt, g, rt) {
    driveBoat(v, input, dt, g, rt, { maxV: 25, boostV: 28, acc: 7, turn: 1.15, depth: 0.9, rollK: 0.12, pitchK: 0.06 });
    // 통·통·통: 박자마다 한 덩이(빠를수록 촘촘)
    v.st.puff = (v.st.puff ?? 0) - dt;
    if (v.st.puff <= 0) {
      v.st.puff = 0.5 - Math.min(0.32, Math.abs(v.v) / 25 * 0.32);
      puff(v, rt, 1 + Math.min(0.4, Math.abs(v.v) / 40));
    }
    v.model!.bits.helm.rotation.z = -v.steer * 1.6;
    rt.wake(v, dt, g.time);
    rt.finish(v, g, dt, { camK: 2.0, lineR: 3.2 });
  },
  idle(v, _t, dt, rt) {
    // 매어 둔 동안에도 가끔 퐁
    v.st.puff = (v.st.puff ?? rt.rnd() * 2) - dt;
    if (v.st.puff <= 0) { v.st.puff = 1.6 + rt.rnd(); puff(v, rt, 0.7); }
  },
  exit: (v, _g, rt) => shoreExit(v, rt, 1.6),
};
