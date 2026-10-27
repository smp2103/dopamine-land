// 수상바이크(v:jetski, P1): 45 m/s(GDD 3.8) + 스턴트 점프 — Space 로 붕 뜨고, 공중에서 A/D 로 빙글(옆 돌기) · S 로 공중제비.
// 한 바퀴 가까이 돌고 내려앉으면 '스턴트!' + flags.vehicles.stunts 기록. 파도 마루에서도 저절로 뜬다.
import * as THREE from 'three';
import { jetski as jetskiModel } from '../models2';
import { driveBoat, shoreExit } from '../drive';
import { unlockKeyOf } from '../logic';
import { JETSKI_SEA } from '../p1logic';
import type { KindDef, Rt, Veh } from '../types';

export const JETSKI_SPEED = 45;
const tmp = new THREE.Vector3();

/** 첨벙 물방울 고리 */
function splash(v: Veh, rt: Rt, y: number, n: number, k = 1) {
  for (let i = 0; i < n; i++) {
    const a = rt.rnd() * Math.PI * 2, s = (2 + rt.rnd() * 3) * k;
    rt.puffs.emit(v.pos.x + Math.cos(a) * 0.8, y + 0.1, v.pos.z + Math.sin(a) * 0.8, Math.cos(a) * s, 2.5 + rt.rnd() * 3 * k, Math.sin(a) * s,
      { life: 0.7, s0: 0.07, s1: 0.16, color: '#e8fbff', g: -14, drag: 0.6 });
  }
}

/** 스턴트 판정: 옆 돌기·공중제비 각(라디안) → 이름(모자라면 null) */
export function stuntName(spin: number, flip: number): string | null {
  const s = Math.abs(spin) / (Math.PI * 2), f = Math.abs(flip) / (Math.PI * 2);
  if (s >= 0.8 && f >= 0.8) return '빙글빙글 콤보 스턴트';
  if (s >= 1.7) return '두 바퀴 빙글 스턴트';
  if (s >= 0.8) return '빙글 스턴트';
  if (f >= 0.8) return '공중제비 스턴트';
  return null;
}

export const jetski: KindDef = {
  kind: 'jetski', name: '수상바이크', medium: 'water', boat: true, land: false,
  cam: 1.5, view: 320, reach: 3.0, speed: JETSKI_SPEED, unlockKey: unlockKeyOf('jetski'), dex: 'v_jetski', focusY: 0.3, depth: 0.5,
  lockText: () => `🔒 수상바이크 — 다이빙 센터 의뢰: 바다 친구 ${JETSKI_SEA}종 만나기 🤿`,
  make: () => jetskiModel(),
  drive(v, input, dt, g, rt) {
    const t = g.time;
    const m = v.model!;
    const ax = input.axis();
    const sp = Math.abs(v.v);
    v.st.cool = (v.st.cool ?? 0) - dt;
    v.st.crestCool = (v.st.crestCool ?? 0) - dt;
    if (v.air) {
      // 공중: 앞으로는 그대로, 좌우·뒤 키는 몸 돌리기
      const f = rt.fwd(v);
      v.pos.x += f.x * v.v * dt; v.pos.z += f.z * v.v * dt;
      v.vy -= 20 * dt;
      v.pos.y += v.vy * dt;
      v.st.spin = (v.st.spin ?? 0) + ax.x * 9 * dt;
      v.st.flip = (v.st.flip ?? 0) + (ax.y < 0 ? 8 * dt : 0);
      v.roll = -(v.st.spin ?? 0);
      v.pitch = THREE.MathUtils.clamp(-v.vy * 0.04, -0.3, 0.25) - (v.st.flip ?? 0);
      const wy = rt.waterY(v.pos.x, v.pos.z, t);
      if (v.pos.y <= wy) {
        // 착수: 잘 돌았으면 스턴트!
        const name = stuntName(v.st.spin ?? 0, v.st.flip ?? 0);
        const near = (a: number) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
        const clean = near(v.st.spin ?? 0) < 0.9 && near(v.st.flip ?? 0) < 0.9;
        v.pos.y = wy; v.air = false; v.vy = 0; v.st.cool = 0.4;
        v.roll = 0; v.pitch = 0; v.st.spin = 0; v.st.flip = 0;
        if (name && clean) {
          rt.toast(`${name}! ✨`);
          rt.sfx('achievement', { x: v.pos.x, z: v.pos.z, vol: 0.6 });
          rt.emit('stunt', { vehicle: 'jetski', name });
          splash(v, rt, wy, 20, 1.4);
        } else {
          if (name) rt.toast('첨벙! 살짝 삐끗했어요 💦');
          v.v *= name ? 0.5 : 0.9;
          splash(v, rt, wy, 12, 1);
        }
      }
    } else {
      driveBoat(v, input, dt, g, rt, { maxV: JETSKI_SPEED, boostV: JETSKI_SPEED + 5, acc: 16, turn: 1.6, depth: 0.5, rollK: 0.32, pitchK: 0.1 });
      const wy = rt.waterY(v.pos.x, v.pos.z, t);
      const rise = dt > 0 ? (wy - (v.st.wy ?? wy)) / dt : 0;
      // 물마루 자동 점프는 큰 물결에서만, 자주 튀지 않게(cool 2.5초) — Space 는 언제든
      const crest = (v.st.crestCool ?? 0) <= 0 && sp > 24 && rise > 0.6;
      const jump = (v.st.cool ?? 0) <= 0 && (crest || (sp > 8 && input.hit('Space')));
      if (crest && jump) v.st.crestCool = 2.5;
      if (jump) {
        v.air = true; v.vy = 5 + sp * 0.11 + Math.max(0, rise) * 1.5; v.st.cool = 1;
        v.st.spin = 0; v.st.flip = 0;
        splash(v, rt, wy, 8, 0.8);
        rt.sfx('splash', { x: v.pos.x, z: v.pos.z, vol: 0.5 });
      }
      v.pos.y = wy;
      rt.wake(v, dt, t);
      // 꼬리 물기둥(빠를수록 높이)
      if (sp > 10) {
        const n = Math.min(4, sp * dt * 5);
        for (let i = 0; i < 4 && rt.rnd() < n - i; i++) {
          tmp.copy(m.tail).applyMatrix4(m.root.matrixWorld);
          const f = rt.fwd(v);
          rt.puffs.emit(tmp.x, wy + 0.2, tmp.z, -f.x * sp * 0.2 + (rt.rnd() - 0.5) * 1.5, 3 + sp * 0.12 + rt.rnd() * 2, -f.z * sp * 0.2 + (rt.rnd() - 0.5) * 1.5,
            { life: 0.8, s0: 0.1, s1: 0.22, color: '#f2fdff', g: -13, drag: 0.5 });
        }
      }
    }
    v.st.wy = rt.waterY(v.pos.x, v.pos.z, t);
    rt.finish(v, g, dt, { camK: 2.4 });
  },
  exit: (v, _g, rt) => { v.air = false; v.vy = 0; v.st.spin = 0; v.st.flip = 0; v.roll = 0; v.pitch = 0; return shoreExit(v, rt, 1.2); },
};
