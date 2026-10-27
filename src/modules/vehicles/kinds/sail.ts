// 돛단배(바람이 돛단요트 자리, v:yacht): 20 m/s, 돌 때 돛이 돌아간다.
import * as M from '../models';
import { driveBoat, shoreExit } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef } from '../types';

export const sail: KindDef = {
  kind: 'sail', id: 'yacht', name: '바람이 돛단요트', medium: 'water', boat: true, land: false,
  cam: 1.9, view: 420, reach: 3.6, speed: 20, unlockKey: unlockKeyOf('sail'), dex: 'v_yacht', focusY: 0.4, depth: 0.55,
  make: () => M.sailboat(),
  drive(v, input, dt, g, rt) {
    driveBoat(v, input, dt, g, rt, { maxV: 20, boostV: 24, acc: 5, turn: 1.3, depth: 0.55, rollK: 0.22 });
    v.model!.bits.sail.rotation.y = -v.steer * 0.35 + Math.sin(g.time * 3.1) * 0.02;
    rt.wake(v, dt, g.time);
    rt.finish(v, g, dt, { camK: 2.4 });
  },
  exit: (v, _g, rt) => shoreExit(v, rt, 1.4),
};
