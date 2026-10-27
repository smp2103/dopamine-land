// 프로펠러 꼬마비행기(v:plane, P1): 50 m/s 낮은 자유 비행(GDD 3.8). 속도가 붙으면 저절로 이륙, Space 기수 들기 · C 숙이기.
// 땅에서 60 m(바다 위 90 m) 넘게 오르면 기수가 저절로 숙여진다(낮게 낮게). 내리면 혼자 활강해 내려앉는다.
import * as THREE from 'three';
import * as M from '../models';
import { nextXZ, turn } from '../drive';
import { unlockKeyOf } from '../logic';
import type { KindDef } from '../types';

const tmp = new THREE.Vector3();
export const PLANE_SPEED = 50;
/** 낮은 비행 한계(땅 위 m) */
export const PLANE_CEIL = 60;

export const plane: KindDef = {
  kind: 'plane', name: '프로펠러 꼬마비행기', medium: 'air', boat: false, land: false,
  cam: 2.4, view: 700, reach: 3.6, speed: PLANE_SPEED, unlockKey: unlockKeyOf('plane'), dex: 'v_plane', focusY: 0.6, margin: 3.2,
  lockText: (g) => {
    let n = 0;
    try { n = g.econ?.rocket?.().count ?? 0; } catch { n = 0; }
    return `🔒 프로펠러 꼬마비행기 — 우주센터 로켓 부품 모으기 ${Math.min(1, n)}/1 🚀`;
  },
  make: () => M.plane(),
  drive(v, input, dt, g, rt) {
    const ax = input.axis();
    const maxV = rt.boost(input) ? PLANE_SPEED : 40;
    const target = ax.y > 0 ? maxV : ax.y < 0 ? 0 : Math.max(v.v, v.pos.y > rt.groundAt(v.pos.x, v.pos.z) + 1 ? 24 : 0);
    v.v += Math.sign(target - v.v) * Math.min(Math.abs(target - v.v), 8 * dt);
    turn(v, ax, 0.9, dt, 0, 4);
    const { nx, nz } = nextXZ(v, rt, dt);
    const gy = Math.max(rt.groundAt(nx, nz), 0);
    const air = v.pos.y > gy + 0.3;
    const pull = input.down('Space') ? 1 : (input.down('KeyC') || input.down('ControlLeft')) ? -1 : 0;
    let pt = pull * 0.42;
    if (!air && v.v > 20) pt = Math.max(pt, 0.28); // 속도가 붙으면 저절로 이륙
    if (!air && v.v < 20) pt = Math.min(pt, 0);
    if (air && v.v < 14) pt = Math.min(pt, -0.15); // 너무 느리면 기수가 숙여진다
    // 낮게 낮게: 한계 높이를 넘으면 기수를 숙인다
    const ceil = gy + (gy <= 0.5 ? PLANE_CEIL * 1.5 : PLANE_CEIL);
    if (v.pos.y > ceil) pt = Math.min(pt, -0.12 - Math.min(0.3, (v.pos.y - ceil) * 0.03));
    v.pitch += (-pt - v.pitch) * Math.min(1, dt * 2.2);
    v.roll += (v.steer * (air ? 0.55 : 0.05) - v.roll) * Math.min(1, dt * 3);
    v.pos.x = nx; v.pos.z = nz;
    v.pos.y = THREE.MathUtils.clamp(v.pos.y + Math.sin(-v.pitch) * v.v * dt, gy, ceil + 20);
    if (v.pos.y <= gy + 0.01 && v.pitch > 0) v.pitch = Math.min(v.pitch, 0.02);
    const air2 = v.pos.y > gy + 0.3;
    if (!air2) { v.pitch = Math.max(v.pitch, -0.05); rt.dust(v, dt, 1.4); }
    const m = v.model!;
    m.spin[0].rotation.z += dt * (8 + v.v * 1.2);
    v.wheelA += v.v * dt / 0.3;
    for (const w of m.wheels) w.rotation.x = v.wheelA;
    // 날개 끝 구름 꼬리
    if (air2 && v.v > 24) {
      for (const sx of [-2.6, 2.6]) {
        tmp.set(sx, 0.95, 0.0).applyMatrix4(m.root.matrixWorld);
        rt.puffs.emit(tmp.x, tmp.y, tmp.z, 0, 0, 0, { life: 0.5, s0: 0.05, s1: 0.08, color: '#ffffff', drag: 2 });
      }
    }
    if (m.bits.scarf) { const f = Math.min(1, Math.abs(v.v) / 20); m.bits.scarf.rotation.set(Math.sin(g.time * 13) * 0.12 * (0.4 + f), Math.sin(g.time * 9.5) * 0.25 * (0.4 + f), 0); }
    const dir = rt.fwd(v);
    dir.y = Math.sin(-v.pitch);
    rt.finish(v, g, dt, { camK: 1.5, lineY: 1, lineR: 4, dir: dir.normalize() });
  },
  idle(v, t, dt, rt) {
    const gy = Math.max(rt.groundAt(v.pos.x, v.pos.z), 0);
    if (v.pos.y > gy + 0.01 && dt > 0) {
      // 사람 없이 활강해서 내려앉는다
      v.v = Math.max(0, v.v - dt * 3);
      const f = rt.fwd(v);
      v.pos.x += f.x * v.v * dt; v.pos.z += f.z * v.v * dt;
      v.pos.y = Math.max(gy, v.pos.y - dt * 4);
      v.pitch = 0.08; v.roll *= 0.98;
      rt.place(v, t);
    } else if (v.pitch !== 0 || v.roll !== 0) { v.pitch = 0; v.roll = 0; rt.place(v, t); }
    v.model!.spin[0].rotation.z += dt * 2;
  },
  exit(v, _g, rt) {
    // 날던 중이면 속도를 남긴다(혼자 활강)
    v.v = v.pos.y > rt.groundAt(v.pos.x, v.pos.z) + 1 ? v.v : 0;
    const side = new THREE.Vector3(Math.cos(v.h), 0, -Math.sin(v.h));
    return v.pos.clone().addScaledVector(side, 3.2);
  },
};
