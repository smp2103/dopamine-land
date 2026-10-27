// 장바구니 자전거(P0): 11 m/s, 내리막에서 저절로 빨라지고 Space 로 작게 폴짝.
// 2인승(P1): 뒷자리 친구와 둘이 같이 밟으면 ×1.3(netplay 가 setPassenger({pedal:true}) 로 알린다).
import * as M from '../models';
import { driveLand, landBody, sideExit } from '../drive';
import { unlockKeyOf } from '../logic';
import { pedalMul } from '../p1logic';
import type { KindDef } from '../types';

export const bike: KindDef = {
  kind: 'bike', name: '장바구니 자전거', medium: 'land', boat: false, land: true, seats: 2,
  cam: 1.0, view: 130, reach: 2.0, speed: 11, unlockKey: unlockKeyOf('bike'), dex: 'v_bike', focusY: 0.3, margin: 1.0,
  make: () => M.bike(),
  mount: (v, g) => landBody(v, g),
  drive(v, input, dt, g, rt) {
    const r = rt.riders();
    const k = pedalMul('bike', r.n, r.pedal);
    driveLand(v, input, dt, g, rt, { maxV: 11 * k, boostV: 13.5 * k, acc: 6.5 * k, turn: 2.2, downhill: 9, jump: 5.2, dustAmt: 0.6 });
    // 페달은 바퀴의 반 박자
    v.model!.spin[0].rotation.x = v.wheelA * 0.55;
    rt.finish(v, g, dt, { camK: 2.4 });
  },
  exit: (v) => sideExit(v, 1.0),
};
