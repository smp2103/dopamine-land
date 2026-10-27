// 오리튜브: 수영 ×1.5(걷기 3.4 → 5.1, 달리기 5.5 → 8.25 m/s), 잠수 없음, 체력도 안 닳는다(탄 동안은 수영이 아니다). 해변 가게.
import * as M from '../models';
import { driveBoat, shoreExit } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef } from '../types';

/** 수영 속도(core Player 의 수영 3.4 / 달리기 5.5) × 1.5 */
export const DUCK_SPEED = { swim: 3.4 * 1.5, run: 5.5 * 1.5 } as const;

export const duckTube: KindDef = {
  kind: 'duck_tube', name: '오리튜브', medium: 'water', boat: true, land: false,
  cam: 1.0, view: 140, reach: 1.8, speed: DUCK_SPEED.swim, unlockKey: unlockKeyOf('duck_tube'), dex: 'v_duck_tube', focusY: 0.1, depth: 0.35,
  make: () => M.duckTube(),
  drive(v, input, dt, g, rt) {
    driveBoat(v, input, dt, g, rt, { maxV: DUCK_SPEED.swim, boostV: DUCK_SPEED.run, acc: 5, turn: 2.2, depth: 0.35, rollK: 0.1, pitchK: 0.02 });
    rt.wake(v, dt, g.time);
    rt.finish(v, g, dt, { camK: 2.6 });
  },
  place(v, t, rt) {
    rt.place(v, t);
    const m = v.model;
    if (!m) return;
    // 둥둥: 통통 위아래 + 뒤뚱
    m.root.position.y += 0.05 * Math.sin(t * 2.6 + v.idx);
    m.root.rotateZ(0.05 * Math.sin(t * 1.9 + v.idx));
    m.root.updateMatrixWorld(true);
  },
  exit: (v, _g, rt) => shoreExit(v, rt, 0.9),
};
