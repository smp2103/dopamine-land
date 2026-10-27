// 물보라 모터보트(P0): 40 m/s, 파도 마루에서 붕 뜨는 점프(Space 로도), 양옆 물보라.
import * as THREE from 'three';
import * as M from '../models';
import { driveBoat, shoreExit } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef, Rt, Veh } from '../types';

const tmp = new THREE.Vector3();

/** 철썩: 둥근 물방울 고리 */
function splash(v: Veh, rt: Rt, y: number, n: number, k = 1) {
  for (let i = 0; i < n; i++) {
    const a = rt.rnd() * Math.PI * 2, s = (2 + rt.rnd() * 3) * k;
    rt.puffs.emit(v.pos.x + Math.cos(a) * 0.9, y + 0.1, v.pos.z + Math.sin(a) * 0.9, Math.cos(a) * s, 2.5 + rt.rnd() * 3 * k, Math.sin(a) * s,
      { life: 0.7, s0: 0.07, s1: 0.16, color: '#e8fbff', g: -14, drag: 0.6 });
  }
}

export const motor: KindDef = {
  kind: 'motor', id: 'motorboat', name: '물보라 모터보트', medium: 'water', boat: true, land: false,
  cam: 1.7, view: 320, reach: 3.4, speed: 40, unlockKey: unlockKeyOf('motor'), dex: 'v_motorboat', focusY: 0.2, depth: 0.55,
  // 형광 민트 + 흰(GDD 3.8 표) — 섬 부두 배는 섬 색
  make: () => M.motorboat('#3fe0bd', '#dcfff5'),
  drive(v, input, dt, g, rt) {
    const t = g.time;
    driveBoat(v, input, dt, g, rt, { maxV: 40, boostV: 46, acc: 13, turn: 1.25, depth: 0.55, rollK: 0.18, pitchK: 0.12 });
    const wy = rt.waterY(v.pos.x, v.pos.z, t);
    const sp = Math.abs(v.v);
    v.st.cool = (v.st.cool ?? 0) - dt;
    if (v.air) {
      v.vy -= 22 * dt;
      v.pos.y += v.vy * dt;
      v.pitch = THREE.MathUtils.clamp(-v.vy * 0.05, -0.3, 0.25);
      if (v.pos.y <= wy) {
        // 첨벙 착수
        v.pos.y = wy; v.air = false; v.vy = 0; v.st.cool = 0.5;
        splash(v, rt, wy, 14, 1.2);
        v.v *= 0.92;
      }
    } else {
      // 파도 마루를 넘을 때 위로 솟는 속도 → 빠르면 붕
      const rise = dt > 0 ? (wy - (v.st.wy ?? wy)) / dt : 0;
      const jump = v.st.cool <= 0 && ((sp > 22 && rise > 0.3) || (sp > 8 && input.hit('Space')));
      if (jump) {
        v.air = true; v.vy = 3.4 + sp * 0.07 + Math.max(0, rise) * 1.4; v.st.cool = 1.1;
        splash(v, rt, wy, 8, 0.8);
      }
      v.pos.y = wy;
      rt.wake(v, dt, t);
      // 빠를 때 양옆으로 부채꼴 물보라
      if (sp > 18) {
        const m = v.model!, f = rt.fwd(v), side = new THREE.Vector3(f.z, 0, -f.x);
        const n = Math.min(4, sp * dt * 4);
        for (let i = 0; i < 4 && rt.rnd() < n - i; i++) {
          const s = rt.rnd() < 0.5 ? -1 : 1;
          tmp.set(s * 0.75, 0.05, 0.4).applyMatrix4(m.root.matrixWorld);
          rt.puffs.emit(tmp.x, wy + 0.12, tmp.z, side.x * s * (3 + sp * 0.12) - f.x * sp * 0.15, 3 + rt.rnd() * 2.5, side.z * s * (3 + sp * 0.12) - f.z * sp * 0.15,
            { life: 0.8, s0: 0.08, s1: 0.2, color: '#f2fdff', g: -13, drag: 0.5 });
        }
      }
    }
    v.st.wy = wy;
    v.model!.spin[0].rotation.z += dt * (4 + sp * 2.5);
    rt.finish(v, g, dt, { camK: 2.2 });
  },
  exit: (v, _g, rt) => { v.air = false; v.vy = 0; return shoreExit(v, rt, 1.4); },
};
