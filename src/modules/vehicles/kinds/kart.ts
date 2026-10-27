// 꼬마 카트(Rapier): 공 두 개 몸체, 회전은 y 만. 언덕을 오르고 공을 밀고 부딪히면 튕긴다.
import * as THREE from 'three';
import { RAPIER } from '../../../core/physics';
import * as M from '../models';
import { sideExit } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef } from '../types';

const UP = new THREE.Vector3(0, 1, 0);

export const kart: KindDef = {
  kind: 'kart', name: '꼬마 카트', medium: 'land', boat: false, land: true,
  cam: 1.25, view: 150, reach: 2.6, speed: 12.5, unlockKey: unlockKeyOf('kart'), focusY: 0.2, margin: 1.8,
  make: () => M.kart(),
  mount(v, g) {
    const w = g.physics?.world;
    if (!w) return;
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(v.pos.x, v.pos.y + 0.55, v.pos.z).setLinearDamping(0.1).setCcdEnabled(true);
    const b = w.createRigidBody(bd);
    b.setEnabledRotations(false, true, false, true);
    for (const z of [-0.45, 0.45]) w.createCollider(RAPIER.ColliderDesc.ball(0.55).setTranslation(0, 0, z).setFriction(0.0).setRestitution(0.35).setDensity(3), b);
    b.setRotation(new THREE.Quaternion().setFromAxisAngle(UP, v.h), true);
    v.body = b;
  },
  drive(v, input, dt, g, rt) {
    const b = v.body;
    if (!b) { rt.place(v, g.time); return; }
    const ax = input.axis();
    const maxV = rt.boost(input) ? 17 : 12.5;
    const target = ax.y > 0 ? maxV : ax.y < 0 ? -5 : 0;
    const lv = b.linvel();
    const f = rt.fwd(v);
    // 실제 앞 방향 속도(부딪히면 줄어든다)
    const real = lv.x * f.x + lv.z * f.z;
    if (Math.abs(real) < Math.abs(v.v) - 2.5) {
      // 쿵! 작은 먼지와 함께 튕긴다
      for (let i = 0; i < 6; i++) rt.puffs.emit(v.pos.x + f.x * 1.1, v.pos.y + 0.4, v.pos.z + f.z * 1.1, (rt.rnd() - 0.5) * 3, 1 + rt.rnd() * 2, (rt.rnd() - 0.5) * 3, { life: 0.6, s0: 0.18, s1: 0.35, color: '#fff6e8', g: -2 });
      v.v = real * 0.6 - Math.sign(v.v) * 1.5;
    }
    v.v += Math.sign(target - v.v) * Math.min(Math.abs(target - v.v), (ax.y === 0 ? 6 : 10) * dt);
    v.steer += (ax.x - v.steer) * Math.min(1, dt * 7);
    v.h += -v.steer * 2.1 * Math.min(1, Math.abs(v.v) / 3) * Math.sign(v.v || 1) * dt;
    const nf = rt.fwd(v);
    // 옆미끄럼은 빨리 없앤다(드리프트 조금)
    b.setLinvel({ x: nf.x * v.v + (lv.x - f.x * real) * 0.2, y: Math.min(lv.y, 6), z: nf.z * v.v + (lv.z - f.z * real) * 0.2 }, true);
    b.setRotation(new THREE.Quaternion().setFromAxisAngle(UP, v.h), true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const p = b.translation();
    // 물에 빠지지 않게: 깊은 물이면 되돌린다
    const wl = rt.I.waterLevelAt(p.x, p.z);
    if (Number.isFinite(wl) && wl - rt.groundAt(p.x, p.z) > 0.6) {
      b.setTranslation({ x: v.pos.x - nf.x * 0.3, y: v.pos.y + 0.6, z: v.pos.z - nf.z * 0.3 }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      v.v = 0;
    } else {
      const gy = rt.groundAt(p.x, p.z);
      v.pos.set(p.x, Math.max(gy, p.y - 0.5), p.z);
      if (p.y - 0.5 < gy - 0.4) b.setTranslation({ x: p.x, y: gy + 0.55, z: p.z }, true);
    }
    v.roll += (v.steer * Math.min(1, Math.abs(v.v) / 10) * 0.08 - v.roll) * Math.min(1, dt * 5);
    v.pitch = 0;
    const m = v.model!;
    v.wheelA += v.v * dt / 0.28;
    for (const w of m.wheels) w.rotation.x = v.wheelA;
    for (const w of m.wheels.slice(2)) w.rotation.y = v.steer * 0.35;
    m.bits.steer.rotation.z = v.steer * 0.8;
    rt.dust(v, dt, 1.3);
    rt.finish(v, g, dt, { camK: 2.6, lineY: 0.6, lineR: 2.4, speed: Math.abs(v.v) * 1.3 });
  },
  exit: (v) => sideExit(v, 1.5),
};
