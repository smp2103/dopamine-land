// 반짝 UFO(v:ufo, P1): 우주 도감 80% 로 열린다. 60 m/s 자유 비행(GDD 3.8) — 지구 하늘과 달 둘 다(부른 세계에 나타난다).
// W/S 앞뒤 · A/D 돌기 · Space 오르기 · C 내리기. 손을 떼면 그 높이에 둥실. 빔(E)으로 아래 반짝이를 끌어올리는 건 vehicles.ts 가 한다.
import * as THREE from 'three';
import { ufo as ufoModel } from '../models2';
import { nextXZ, throttle, turn } from '../drive';
import { unlockKeyOf } from '../logic';
import { UFO_DEX } from '../p1logic';
import type { KindDef, Veh } from '../types';

export const UFO_SPEED = 60;
/** 땅 위 둥실 높이(쉬는 동안) */
export const UFO_HOVER = 1.2;

/** 빔 켜기(st.beam 0..1 이 줄어드는 동안) */
function beamFx(v: Veh, t: number) {
  const m = v.model;
  if (!m) return;
  const b = m.bits.beam as THREE.Mesh | undefined;
  if (!b) return;
  const k = v.st.beam ?? 0;
  b.visible = k > 0;
  if (k > 0) { const s = 0.6 + 0.4 * Math.min(1, k * 3); b.scale.set(s * (1 + 0.04 * Math.sin(t * 14)), 1, s * (1 + 0.04 * Math.sin(t * 14))); }
}

export const ufo: KindDef = {
  kind: 'ufo', name: '반짝 UFO', medium: 'air', boat: false, land: false, world: 'both',
  cam: 2.4, view: 900, reach: 3.4, speed: UFO_SPEED, unlockKey: unlockKeyOf('ufo'), dex: 'v_ufo', focusY: 0.9, margin: 2.4,
  lockText: (g) => {
    const d = g.state.dexCount('space');
    const pct = d.total > 0 ? Math.floor((d.got / d.total) * 100) : 0;
    return `🔒 반짝 UFO — 우주 도감 ${pct}/${Math.round(UFO_DEX * 100)}% 🛸`;
  },
  make: () => ufoModel(),
  drive(v, input, dt, g, rt) {
    const ax = input.axis();
    throttle(v, ax, rt.boost(input) ? UFO_SPEED : 36, 22, dt, 0.4);
    turn(v, ax, 1.8, dt, 0.8, 4);
    const up = input.down('Space') ? 1 : (input.down('KeyC') || input.down('ControlLeft')) ? -1 : 0;
    v.vy += (up * 14 - v.vy) * Math.min(1, dt * 3);
    const space = v.world === 'space';
    const { nx, nz } = space ? { nx: v.pos.x + rt.fwd(v).x * v.v * dt, nz: v.pos.z + rt.fwd(v).z * v.v * dt } : nextXZ(v, rt, dt);
    const gy = space ? rt.groundAt(nx, nz) : Math.max(rt.groundAt(nx, nz), 0);
    v.pos.x = nx; v.pos.z = nz;
    const ceil = gy + (space ? 160 : 260);
    v.pos.y = THREE.MathUtils.clamp(v.pos.y + v.vy * dt, gy + 0.3, ceil);
    // 기울기(돌 때 옆으로, 앞으로 갈 때 앞으로)
    v.roll += (v.steer * 0.35 - v.roll) * Math.min(1, dt * 4);
    v.pitch += (Math.min(1, Math.abs(v.v) / UFO_SPEED) * 0.18 * Math.sign(v.v) - v.pitch) * Math.min(1, dt * 3);
    v.st.beam = Math.max(0, (v.st.beam ?? 0) - dt / 1.4);
    beamFx(v, g.time);
    const m = v.model!;
    m.bits.lights.rotation.y += dt * (1.5 + Math.abs(v.v) * 0.08);
    m.bits.body.position.y = Math.sin(g.time * 2.2) * 0.08;
    if (Math.abs(v.v) > 20 && rt.rnd() < dt * 20) {
      const tp = m.tail.clone().applyMatrix4(m.root.matrixWorld);
      rt.fire.emit(tp.x, tp.y, tp.z, 0, 0, 0, { life: 0.5, s0: 0.16, s1: 0.03, color: rt.rnd() < 0.5 ? '#ffc6ef' : '#fff3a0', drag: 2 });
    }
    rt.finish(v, g, dt, { camK: 1.6, lineY: 0.6, lineR: 3.6 });
  },
  place(v) {
    const m = v.model;
    if (!m) return;
    m.root.quaternion.setFromEuler(new THREE.Euler(v.pitch, v.h, v.roll, 'YXZ'));
    m.root.position.copy(v.pos);
    m.root.updateMatrixWorld(true);
  },
  idle(v, t, dt, rt) {
    const m = v.model!;
    m.bits.lights.rotation.y += dt * 0.8;
    m.bits.body.position.y = Math.sin(t * 1.6 + v.idx) * 0.12;
    // 사람이 없으면 땅 위 둥실 높이로 천천히 내려온다
    const gy = (v.world === 'space' ? rt.groundAt(v.pos.x, v.pos.z) : Math.max(rt.groundAt(v.pos.x, v.pos.z), 0)) + UFO_HOVER;
    if (Math.abs(v.pos.y - gy) > 0.02 && dt > 0) {
      v.pos.y += THREE.MathUtils.clamp(gy - v.pos.y, -dt * 3, dt * 3);
      v.pitch *= 0.95; v.roll *= 0.95;
      ufo.place!(v, t, rt);
    }
    v.st.beam = 0;
    beamFx(v, t);
  },
  exit(v, _g, rt) {
    // 땅 가까이로 내려 준다(높이 날던 중이면 아래 땅으로)
    const side = new THREE.Vector3(Math.cos(v.h), 0, -Math.sin(v.h));
    const out = v.pos.clone().addScaledVector(side, 2.4);
    const gy = v.world === 'space' ? rt.groundAt(out.x, out.z) : Math.max(rt.groundAt(out.x, out.z), 0);
    out.y = Math.min(v.pos.y, gy + 0.4);
    v.st.beam = 0;
    return out;
  },
};
