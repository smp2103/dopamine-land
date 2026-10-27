// 모래 버기(v:buggy, P1): 18 m/s(GDD 3.8), 큰 풍선 바퀴로 모래 언덕 점프 — 빠르게 언덕 마루를 넘으면 붕 뜨고, Space 로도 폴짝.
// 몸통(서스펜션)이 통통 튄다. 모래 위에선 미끄러지지 않고(제 땅), 풀밭 위에선 조금 느리다.
import * as THREE from 'three';
import { buggy as buggyModel } from '../models2';
import { driveLand, landBody, sideExit } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef } from '../types';

export const BUGGY_SPEED = 18;

export const buggy: KindDef = {
  kind: 'buggy', name: '모래 버기', medium: 'land', boat: false, land: true,
  cam: 1.35, view: 200, reach: 2.8, speed: BUGGY_SPEED, unlockKey: unlockKeyOf('buggy'), dex: 'v_buggy', focusY: 0.6, margin: 1.8,
  make: () => buggyModel(),
  mount: (v, g) => landBody(v, g),
  drive(v, input, dt, g, rt) {
    const kind = rt.I.surfaceAt(v.pos.x, v.pos.z).kind;
    const sandy = kind === 'sand' || kind === 'desert';
    const k = sandy ? 1 : 0.85;
    // 언덕 마루 점프: 오르막을 빠르게 오르다 앞이 꺼지면 그 기세로 붕
    const f = rt.fwd(v);
    const here = rt.groundAt(v.pos.x, v.pos.z);
    const ahead = rt.groundAt(v.pos.x + f.x * 1.6, v.pos.z + f.z * 1.6);
    const climb = dt > 0 ? (here - (v.st.gy ?? here)) / dt : 0;
    if (!v.air && v.v > 10 && climb > 1.6 && here - ahead > 0.15 && (v.st.cool ?? 0) <= 0) {
      v.air = true; v.vy = Math.min(9, climb * 0.9); v.st.cool = 0.8;
      rt.sfx('jump', { pitch: 0.8, x: v.pos.x, z: v.pos.z, vol: 0.5 });
    }
    v.st.cool = (v.st.cool ?? 0) - dt;
    v.st.gy = here;
    const wasAir = v.air;
    driveLand(v, input, dt, g, rt, { maxV: BUGGY_SPEED * k, boostV: (BUGGY_SPEED + 3) * k, acc: 9, turn: 1.9, downhill: 5, jump: 6.5, dustAmt: sandy ? 1.8 : 1, lean: 0.12 });
    // 서스펜션: 착지하면 꾹 눌렸다 통
    if (wasAir && !v.air) v.st.bounce = 1;
    v.st.bounce = Math.max(0, (v.st.bounce ?? 0) - dt * 2.5);
    const m = v.model!;
    const b = v.st.bounce;
    m.bits.susp.position.y = -Math.sin(b * Math.PI) * 0.12 * b + Math.sin(g.time * 22) * 0.012 * Math.min(1, Math.abs(v.v) / 8);
    m.bits.susp.rotation.x = v.air ? THREE.MathUtils.clamp(-v.vy * 0.03, -0.2, 0.2) : 0;
    m.bits.steer.rotation.z = v.steer * 0.8;
    for (const w of m.wheels.slice(2)) w.rotation.y = v.steer * 0.35;
    rt.finish(v, g, dt, { camK: 2.4, lineY: 0.8, lineR: 2.6 });
  },
  exit: (v) => sideExit(v, 1.6),
};
