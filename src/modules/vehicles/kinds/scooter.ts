// 스쿠터: 자전거 해금(v:bike)으로 함께 탄다. 14 m/s, 점프 없음.
import * as M from '../models';
import { driveLand, landBody, sideExit } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef } from '../types';

export const scooter: KindDef = {
  kind: 'scooter', name: '스쿠터', medium: 'land', boat: false, land: true,
  cam: 1.1, view: 130, reach: 2.2, speed: 14, unlockKey: unlockKeyOf('scooter'), dex: 'v_bike', focusY: 0.3, margin: 1.1,
  make: () => M.scooter(),
  mount: (v, g) => landBody(v, g),
  drive(v, input, dt, g, rt) {
    driveLand(v, input, dt, g, rt, { maxV: 14, boostV: 19, acc: 9, turn: 2.0, downhill: 4, dustAmt: 1 });
    rt.finish(v, g, dt, { camK: 2.4 });
  },
  exit: (v) => sideExit(v, 1.0),
};
