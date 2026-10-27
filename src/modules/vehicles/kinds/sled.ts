// 펭귄 썰매(v:sled, P1): 경사 비례 속도(최대 20 m/s, GDD 3.8) — 내리막이 당기고 눈 위 마찰이 늦춘다(눈이 아니면 마찰 ×3).
// 미끄러짐·드리프트: 미끄러지는 방향(st.vx·vz)이 머리를 늦게 따라온다. Shift 를 누르면 꽉 잡지 않고 더 미끄러진다, S 는 브레이크.
import * as THREE from 'three';
import { sled as sledModel } from '../models2';
import { landBody, sideExit } from '../drive';
import { unlockKeyOf } from '../logic';
import { sledStep, SLED_MAX } from '../p1logic';
import type { KindDef } from '../types';

const SNOWY = new Set(['snow', 'cliff', 'rock']);

export const sled: KindDef = {
  kind: 'sled', name: '펭귄 썰매', medium: 'land', boat: false, land: true,
  cam: 1.1, view: 160, reach: 2.2, speed: SLED_MAX, unlockKey: unlockKeyOf('sled'), dex: 'v_sled', focusY: 0.3, margin: 1.0,
  make: () => sledModel(),
  mount: (v, g) => { landBody(v, g); v.st.vx = 0; v.st.vz = 0; },
  drive(v, input, dt, g, rt) {
    const ax = input.axis();
    const f = rt.fwd(v);
    // 경사: 미끄러지는 쪽(없으면 머리 쪽) 1.5 m 앞이 얼마나 낮나
    let dx = v.st.vx ?? 0, dz = v.st.vz ?? 0;
    const sp0 = Math.hypot(dx, dz);
    const ux = sp0 > 0.3 ? dx / sp0 : f.x, uz = sp0 > 0.3 ? dz / sp0 : f.z;
    const here = rt.groundAt(v.pos.x, v.pos.z);
    const slope = (here - rt.groundAt(v.pos.x + ux * 1.5, v.pos.z + uz * 1.5)) / 1.5;
    const kind = rt.I.surfaceAt(v.pos.x, v.pos.z).kind;
    const snow = SNOWY.has(kind) || rt.game?.env?.weather === 'snow' || rt.game?.env?.weather === 'blizzard';
    const sp = sledStep(sp0, slope, dt, { push: ax.y > 0, brake: ax.y < 0, snow });
    // 돌기: 빠를수록 덜 돌고, 드리프트(Shift)는 더 돈다
    const drift = rt.boost(input);
    v.steer += (ax.x - v.steer) * Math.min(1, dt * 6);
    v.h -= v.steer * (drift ? 2.4 : 1.6) * (0.5 + 0.5 * Math.min(1, sp / 6)) * dt;
    // 미끄러지는 방향이 머리를 따라온다(붙잡는 힘 — 드리프트면 약하게)
    const nf = rt.fwd(v);
    const grip = (drift ? 0.9 : 3.2) * (snow ? 1 : 2.5);
    const kx = sp0 > 0.3 ? ux : nf.x, kz = sp0 > 0.3 ? uz : nf.z;
    let mx = kx + (nf.x - kx) * Math.min(1, grip * dt), mz = kz + (nf.z - kz) * Math.min(1, grip * dt);
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    dx = mx * sp; dz = mz * sp;
    // 옆으로 미끄러질 때 눈보라
    const side = Math.abs(mx * nf.z - mz * nf.x);
    const b = rt.I.WORLD_BOUNDS;
    const nx = THREE.MathUtils.clamp(v.pos.x + dx * dt, b.minX + 5, b.maxX - 5), nz = THREE.MathUtils.clamp(v.pos.z + dz * dt, b.minZ + 5, b.maxZ - 5);
    const gy = rt.groundAt(nx, nz);
    const wl = rt.I.waterLevelAt(nx, nz);
    const wet = Number.isFinite(wl) && wl - gy > 0.3;
    if (wet || gy - v.pos.y > 0.9) { dx *= -0.2; dz *= -0.2; }
    else if (v.cc && v.coll && v.body) {
      const want = { x: nx - v.pos.x, y: gy - v.pos.y, z: nz - v.pos.z };
      v.cc.computeColliderMovement(v.coll, want);
      const mv = v.cc.computedMovement();
      const wl2 = Math.hypot(want.x, want.z), mvl = Math.hypot(mv.x, mv.z);
      const px = v.pos.x + mv.x, pz = v.pos.z + mv.z;
      v.pos.set(px, rt.groundAt(px, pz), pz);
      v.body.setNextKinematicTranslation({ x: px, y: v.pos.y + 0.8, z: pz });
      // 나무·바위에 쿵: 튕기며 멈춘다
      if (wl2 > 0.02 && mvl < wl2 * 0.35) {
        for (let i = 0; i < 6; i++) rt.puffs.emit(v.pos.x + mx * 0.8, v.pos.y + 0.4, v.pos.z + mz * 0.8, (rt.rnd() - 0.5) * 3, 1 + rt.rnd() * 2, (rt.rnd() - 0.5) * 3, { life: 0.6, s0: 0.12, s1: 0.26, color: '#ffffff', g: -2 });
        dx *= -0.25; dz *= -0.25;
      }
    } else v.pos.set(nx, gy, nz);
    v.st.vx = dx; v.st.vz = dz;
    const speed = Math.hypot(dx, dz);
    v.v = speed;
    // 눈가루: 날 뒤에서, 드리프트면 옆으로 확
    const amt = speed * dt * (snow ? 5 : 1.5) * (1 + side * 2);
    for (let i = 0; i < 4 && rt.rnd() < amt - i; i++) {
      rt.puffs.emit(v.pos.x - mx * 0.9 + (rt.rnd() - 0.5) * 0.6, v.pos.y + 0.06, v.pos.z - mz * 0.9 + (rt.rnd() - 0.5) * 0.6,
        -mx * speed * 0.12 + nf.z * side * (rt.rnd() - 0.5) * 4, 0.8 + rt.rnd() * 1.2, -mz * speed * 0.12 - nf.x * side * (rt.rnd() - 0.5) * 4,
        { life: 0.7 + rt.rnd() * 0.4, s0: 0.06, s1: 0.18, color: snow ? '#ffffff' : '#f7f1e6', drag: 2.2, flat: 0.6 });
    }
    v.pitch = 0;
    v.roll += (-v.steer * Math.min(1, speed / 8) * 0.22 - side * 0.12 - v.roll) * Math.min(1, dt * 5);
    rt.finish(v, g, dt, { camK: 2.2, dir: new THREE.Vector3(mx, 0, mz), speed });
  },
  exit: (v) => { v.st.vx = 0; v.st.vz = 0; v.v = 0; return sideExit(v, 1.0); },
};
