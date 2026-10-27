// 바람이 돛단요트(v:yacht, P1): 오늘의 바람(env.day rng)을 받으면 순풍 35 m/s · 역풍 15 m/s(GDD 3.8).
// 돛은 바람 쪽으로 돌아가고 옆바람이면 배가 기운다. 2인승(뱃머리 방석). 바람 화살표 칩은 vehicles.ts 가 그린다.
import * as THREE from 'three';
import * as M from '../models';
import { driveBoat, shoreExit } from '../drive';
import { unlockKeyOf } from '../logic';
import { wrapAngle, yachtMaxSpeed, YACHT_DOWN } from '../p1logic';
import type { KindDef } from '../types';

export const sail: KindDef = {
  kind: 'sail', id: 'yacht', name: '바람이 돛단요트', medium: 'water', boat: true, land: false, seats: 2,
  cam: 1.9, view: 420, reach: 3.6, speed: YACHT_DOWN, unlockKey: unlockKeyOf('sail'), dex: 'v_yacht', focusY: 0.4, depth: 0.55,
  make: () => M.sailboat(),
  drive(v, input, dt, g, rt) {
    const w = rt.wind();
    // 바람과 머리의 차이로 오늘 낼 수 있는 속도(바람이 약한 날도 표 속도는 그대로 — 손맛은 방향)
    const maxV = yachtMaxSpeed(v.h, w.angle);
    driveBoat(v, input, dt, g, rt, { maxV, boostV: maxV, acc: 6, turn: 1.2, depth: 0.55, rollK: 0.16 });
    // 돛: 바람이 오는 쪽 반대로 활짝(옆바람이면 크게 돌아간다)
    const rel = wrapAngle(w.angle - v.h);
    const sailA = THREE.MathUtils.clamp(-rel * 0.5, -1.15, 1.15);
    const s = v.model!.bits.sail;
    s.rotation.y += (sailA - s.rotation.y) * Math.min(1, dt * 2.5);
    s.rotation.y += Math.sin(g.time * 3.1) * 0.004;
    // 옆바람에 기울기(돛 기울기 — 빠를수록)
    const heel = Math.sin(rel) * 0.14 * Math.min(1, Math.abs(v.v) / 12);
    v.roll += (heel - v.roll) * Math.min(1, dt * 1.5);
    rt.wake(v, dt, g.time);
    rt.finish(v, g, dt, { camK: 2.4 });
  },
  idle(v, _t, dt, rt) {
    // 매어 둔 돛도 바람 쪽으로 천천히
    const s = v.model?.bits.sail;
    if (!s || dt <= 0) return;
    const rel = wrapAngle(rt.wind().angle - v.h);
    s.rotation.y += (THREE.MathUtils.clamp(-rel * 0.5, -1.15, 1.15) * 0.6 - s.rotation.y) * Math.min(1, dt * 0.6);
  },
  exit: (v, _g, rt) => shoreExit(v, rt, 1.4),
};
