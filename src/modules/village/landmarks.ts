// 섬마다 랜드마크(멀리서도 보이는 큰 실루엣) + 도착 부두. 섬 하나 = 묶음 하나(bake 로 재질별 합침).
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import type { Placer } from '../village';
import { add, rod, cap, cyl, sph, dome, rbox, grad, blob, label, stripesY, stripesA, roundExtrude, roundRectShape, V, BONE, WOOD_DARK, type Built } from './common';
import { buildPier } from './town';
import type { Imp, ImpKind } from './impostors';
import { giantRocket, gantry, fuelTank, radarDish, antenna, runway } from './rocketpad';

type FootY = (x: number, z: number, r: number) => number;

// ───────── 시작 섬: 등대·풍차 ─────────
function lighthouse(): Built {
  const g = new THREE.Group();
  add(g, cyl(5.2, 4.8, 1.2, 40), 'stone', ['#a9a094', '#cfc7b9'], 0, 0, 0);
  const tw = new THREE.CylinderGeometry(1.7, 2.6, 15, 40, 60);
  stripesY(tw, ['#ffffff', '#ff6f61'], 2.5, -7.5);
  add(g, tw, 'gloss', null, 0, 7.8, 0);
  add(g, cyl(2.3, 2.3, 0.5, 40), 'paint', '#3f5a52', 0, 15.5, 0);
  add(g, new THREE.TorusGeometry(2.25, 0.07, 8, 48), 'gloss', '#3f5a52', 0, 16.4, 0, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; add(g, cap(0.05, 0.8), 'gloss', '#3f5a52', Math.cos(a) * 2.25, 16.0, Math.sin(a) * 2.25); }
  add(g, cyl(1.35, 1.35, 2.0, 32), 'glow', null, 0, 16.9, 0);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(g, cap(0.08, 2.0), 'gloss', '#3f5a52', Math.cos(a) * 1.4, 16.9, Math.sin(a) * 1.4); }
  add(g, dome(1.8, 40, 16), 'gloss', ['#e8564a', '#ff7b6b'], 0, 17.9, 0, undefined, [1, 0.9, 1]);
  add(g, sph(0.3), 'gold', null, 0, 19.7, 0);
  const ds = new THREE.Shape(); ds.moveTo(-0.55, 0); ds.lineTo(0.55, 0); ds.lineTo(0.55, 1.2); ds.absarc(0, 1.2, 0.55, 0, Math.PI, false); ds.lineTo(-0.55, 0);
  add(g, roundExtrude(ds, 0.14, 0.05, 24), 'wood', ['#7d4f33', '#a06b45'], 0, 0.3, 2.55);
  for (const y of [6, 10, 13.5]) add(g, rbox(0.55, 0.75, 0.1, 0.18, 3), 'window', null, 0, y, 2.6 - ((y - 0.3) / 15) * 0.9 + 0.02, [-0.06, 0, 0]);
  return { g, cols: [{ kind: 'cyl', r: 2.6, hh: 9, x: 0, y: 9, z: 0 }], foot: 4.5 };
}

function windmill(): Built {
  const g = new THREE.Group();
  const tw = cyl(3.2, 2.2, 9, 40);
  grad(tw, '#f2e2c4', '#fff8ea');
  add(g, tw, 'matte', null, 0, 4.5, 0);
  add(g, rbox(7.2, 0.5, 7.2, 0.2, 4), 'stone', ['#bfb5a6', '#ddd5c6'], 0, 0.1, 0);
  add(g, new THREE.ConeGeometry(3.0, 3.6, 40, 4), 'paint', ['#4f86c6', '#78a9e6'], 0, 10.7, 0);
  add(g, sph(0.35), 'gold', null, 0, 12.6, 0);
  for (const y of [3.2, 6.2]) add(g, rbox(0.8, 1.0, 0.12, 0.25, 3), 'window', null, 0, y, 3.2 - (y / 9) * 1.0);
  const ds = new THREE.Shape(); ds.moveTo(-0.6, 0); ds.lineTo(0.6, 0); ds.lineTo(0.6, 1.3); ds.absarc(0, 1.3, 0.6, 0, Math.PI, false); ds.lineTo(-0.6, 0);
  add(g, roundExtrude(ds, 0.14, 0.05, 24), 'wood', ['#7d4f33', '#a06b45'], 0, 0.3, 3.15);
  const rotor = new THREE.Group();
  rotor.position.set(0, 8.4, 2.9);
  rotor.userData.live = true;
  add(rotor, sph(0.5), 'paint', '#ff8f8f', 0, 0, 0.3);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / 4) * Math.PI * 2;
    add(arm, rbox(0.22, 6.2, 0.16, 0.08, 3), 'wood', WOOD_DARK, 0, 3.4, 0.2);
    add(arm, rbox(1.5, 4.8, 0.08, 0.3, 4), 'cloth', ['#fff4e2', '#ffffff'], 0.8, 3.9, 0.25);
    for (let k = 0; k < 4; k++) add(arm, rbox(1.6, 0.06, 0.1, 0.03, 2), 'wood', '#b98352', 0.8, 1.9 + k * 1.3, 0.3);
    rotor.add(arm);
  }
  g.add(rotor);
  return {
    g, foot: 3.8, cols: [{ kind: 'cyl', r: 3.0, hh: 5, x: 0, y: 5, z: 0 }],
    anim: [{ o: rotor, fn: (o, b, t) => { o.quaternion.copy(b).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -t * 0.6)); } }],
  };
}

// ───────── 공룡 섬: 유적·화석 발굴장 ─────────
function ruins(rng: () => number): Built {
  const g = new THREE.Group();
  const cols: Built['cols'] = [];
  add(g, cyl(13, 12.5, 1.0, 48), 'stone', ['#8f9a84', '#b9c2a6'], 0, 0, 0);
  for (const sx of [-1, 1]) {
    add(g, rbox(2.4, 10, 2.4, 0.5, 4), 'stone', ['#9aa38c', '#c9cdb4'], sx * 3.6, 5, 0);
    cols.push({ kind: 'box', hx: 1.2, hy: 5, hz: 1.2, x: sx * 3.6, y: 5, z: 0 });
  }
  add(g, rbox(10, 2.2, 2.8, 0.6, 4), 'stone', ['#a6ae96', '#d2d6bd'], 0, 11.0, 0);
  add(g, blob(1.6, 0.4, 0.15, 3, 4), 'matte', ['#5aa84a', '#7fcf66'], -1.5, 12.2, 0);
  add(g, blob(1.1, 0.45, 0.15, 6, 4), 'matte', ['#5aa84a', '#7fcf66'], 3.0, 12.1, 0.3);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    if (Math.abs(Math.sin(a)) < 0.3 && Math.cos(a) > 0) continue;
    const h = 3 + rng() * 6;
    const x = Math.cos(a) * 10, z = Math.sin(a) * 10;
    add(g, cyl(0.95, 0.8, h, 28), 'stone', ['#98a18a', '#c6cab0'], x, h / 2, z, [rng() * 0.1, 0, rng() * 0.1]);
    add(g, sph(1.0, 20, 14), 'matte', '#6fb85a', x, h + 0.1, z, undefined, [1, 0.45, 1]);
    cols.push({ kind: 'cyl', r: 0.9, hh: h / 2, x, y: h / 2, z });
  }
  // 공룡 머리 석상(귀여운 눈·볼)
  const head = new THREE.Group();
  add(head, blob(2.6, 0.85, 0.06, 7, 5), 'stone', ['#9aa38c', '#c9cdb4'], 0, 0, 0, undefined, [1, 1, 1.4]);
  for (const sx of [-1, 1]) {
    add(head, sph(0.6), 'matte', '#ffffff', sx * 1.25, 0.75, 2.35);
    add(head, sph(0.36), 'gloss', '#2b2b33', sx * 1.25, 0.78, 2.75);
    add(head, sph(0.11), 'matte', '#ffffff', sx * 1.25 + 0.12, 0.95, 3.05);
    add(head, sph(0.45, 20, 14), 'matte', '#f0a0a0', sx * 1.9, 0.0, 2.35, undefined, [1, 0.55, 0.4]);
  }
  for (let i = 0; i < 4; i++) add(head, new THREE.ConeGeometry(0.6, 1.4, 20), 'stone', '#b8c0a4', 0, 2.1 - i * 0.2, 0.9 - i * 1.0, [-0.3 - i * 0.2, 0, 0]);
  head.position.set(0, 3.0, -6.5);
  g.add(head);
  add(g, rbox(5, 1.6, 5, 0.4, 4), 'stone', ['#8f9a84', '#b9c2a6'], 0, 0.8, -6.5);
  cols.push({ kind: 'box', hx: 2.6, hy: 3.5, hz: 3.4, x: 0, y: 3.5, z: -6.5 });
  return { g, cols, foot: 12 };
}

function fossilDig(rng: () => number): Built {
  const g = new THREE.Group();
  add(g, blob(9, 0.12, 0.05, 5, 5), 'matte', ['#d6b47e', '#f0d7a4'], 0, 0.1, 0, undefined, [1.3, 1, 0.9]);
  const spine: THREE.Vector3[] = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    spine.push(V(-9 + t * 18, 1.2 + Math.sin(t * Math.PI) * 4.2 - (t > 0.85 ? (t - 0.85) * 8 : 0), Math.sin(t * 5) * 0.6));
  }
  for (let i = 0; i < spine.length; i++) {
    const p = spine[i];
    const r = 0.45 + Math.sin((i / 22) * Math.PI) * 0.35;
    add(g, sph(r, 20, 14), 'matte', BONE, p.x, p.y, p.z, undefined, [0.8, 1, 1]);
    if (i > 4 && i < 16 && i % 2 === 0) {
      const R = 1.8 + Math.sin((i / 22) * Math.PI) * 1.2;
      for (const s of [-1, 1]) {
        const rib = new THREE.TorusGeometry(R, 0.17, 10, 24, Math.PI * 0.6);
        // 위(등뼈)에서 옆으로 둥글게 내려오는 갈비
        const m = add(g, rib, 'matte', BONE, p.x, p.y - R, p.z, [0, Math.PI / 2, 0]);
        m.rotation.set(0, Math.PI / 2, s > 0 ? Math.PI / 2 - Math.PI * 0.6 : Math.PI / 2);
      }
    }
  }
  const sk = spine[spine.length - 1];
  add(g, blob(1.6, 0.8, 0.08, 9, 4), 'matte', [BONE, '#fffaf0'], sk.x + 1.3, sk.y + 0.4, sk.z, undefined, [1.5, 1, 1]);
  for (const sz of [-1, 1]) add(g, sph(0.42, 20, 14), 'gloss', '#4a3b33', sk.x + 1.6, sk.y + 0.85, sk.z + sz * 1.0);
  for (let i = 0; i < 5; i++) add(g, new THREE.ConeGeometry(0.15, 0.5, 12), 'matte', '#ffffff', sk.x + 2.6 - i * 0.35, sk.y - 0.3, sk.z + 0.75, [Math.PI, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 12, z = Math.sin(a) * 8.5;
    add(g, cap(0.09, 1.2), 'wood', '#c8955f', x, 0.7, z);
    add(g, sph(0.13, 12, 10), 'gloss', '#ffcc45', x, 1.35, z);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, b = ((i + 1) / 8) * Math.PI * 2;
    rod(g, V(Math.cos(a) * 12, 1.25, Math.sin(a) * 8.5), V(Math.cos(b) * 12, 1.25, Math.sin(b) * 8.5), 0.035, 'matte', '#ffd34f', 6);
  }
  const tent = new THREE.ConeGeometry(3.2, 3.2, 40, 2);
  stripesA(tent, ['#ffcf6a', '#fff3d6'], 10, 0.15);
  add(g, tent, 'cloth', null, -13, 1.6, -6);
  add(g, cap(0.08, 4.0), 'wood', WOOD_DARK, -13, 2.0, -6);
  add(g, rbox(1.2, 0.8, 0.8, 0.12, 3), 'wood', ['#b98352', '#d6a571'], -10.5, 0.4, -4.2);
  for (let k = 0; k < 3; k++) add(g, rbox(0.6, 0.45, 0.6, 0.1, 3), 'wood', '#c48f5c', 10 + k * 0.8, 0.25, 6 - k * 0.5, [0, rng(), 0]);
  add(g, cap(0.05, 1.3), 'wood', '#d6a571', 6, 1.0, -5.5, [0.2, 0, 0.15]);
  add(g, rbox(0.4, 0.5, 0.06, 0.12, 3), 'gloss', '#8c98a8', 6.05, 0.28, -5.6, [0.2, 0, 0.15]);
  return { g, cols: [{ kind: 'box', hx: 9, hy: 2.5, hz: 1.4, x: 0, y: 2.5, z: 0 }], foot: 10 };
}

// ───────── 얼음 섬: 이글루 마을·얼음 성 ─────────
function igloo(r: number): Built {
  const g = new THREE.Group();
  const d = dome(r, 40, 20);
  stripesY(d, ['#f4fbff', '#dcefff'], r * 0.22);
  add(g, d, 'ice', null, 0, -0.05, 0);
  const tun = new THREE.CylinderGeometry(r * 0.42, r * 0.42, r * 0.8, 32, 1, false, -Math.PI / 2, Math.PI);
  tun.rotateX(Math.PI / 2);
  add(g, tun, 'ice', '#eaf6fd', 0, 0, r * 0.9);
  add(g, new THREE.CircleGeometry(r * 0.32, 32, 0, Math.PI), 'matte', '#5a7894', 0, 0.01, r * 1.31);
  add(g, sph(r * 0.12, 16, 12), 'glow', null, r * 0.5, r * 0.7, r * 0.55);
  return { g, cols: [{ kind: 'cyl', r: r * 0.9, hh: r * 0.5, x: 0, y: r * 0.5, z: 0 }], foot: r };
}

function iceCastle(): Built {
  const g = new THREE.Group();
  const cols: Built['cols'] = [];
  add(g, cyl(17, 15, 9, 56), 'matte', ['#cfe6f5', '#ffffff'], 0, -3.6, 0);
  const tower = (x: number, z: number, r: number, h: number, roofC: string) => {
    const tw = cyl(r, r * 0.9, h, 40);
    grad(tw, '#a8d4f0', '#eef9ff', 0.8);
    add(g, tw, 'ice', null, x, h / 2, z);
    add(g, cyl(r * 1.15, r * 1.15, 0.8, 40), 'ice', '#dff2ff', x, h, z);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      add(g, rbox(r * 0.4, 0.8, r * 0.4, 0.15, 3), 'ice', '#eaf7ff', x + Math.cos(a) * r * 1.05, h + 0.75, z + Math.sin(a) * r * 1.05);
    }
    add(g, new THREE.ConeGeometry(r * 1.1, r * 2.6, 40, 4), 'gloss', [roofC, '#ffffff'], x, h + 0.4 + r * 1.3, z);
    add(g, sph(r * 0.18), 'ice', '#ffffff', x, h + 0.4 + r * 2.6, z);
    for (const y of [h * 0.45, h * 0.75]) add(g, rbox(r * 0.4, r * 0.75, 0.2, r * 0.2, 3), 'glow', null, x, y, z + r * 0.93);
    cols.push({ kind: 'cyl', r, hh: h / 2, x, y: h / 2, z });
  };
  tower(0, -2, 5.5, 24, '#7fb8ff');
  tower(-10, 4, 3.4, 15, '#a99cff');
  tower(10, 4, 3.4, 15, '#a99cff');
  tower(-13, -8, 2.8, 12, '#7fd8ff');
  tower(13, -8, 2.8, 12, '#7fd8ff');
  for (const [ax, az, bx, bz] of [[-10, 4, 10, 4], [-10, 4, -13, -8], [10, 4, 13, -8]] as const) {
    const len = Math.hypot(bx - ax, bz - az);
    const w = rbox(len, 6, 2.2, 0.6, 4);
    grad(w, '#b5daf2', '#eaf7ff');
    const ry = -Math.atan2(bz - az, bx - ax);
    add(g, w, 'ice', null, (ax + bx) / 2, 3, (az + bz) / 2, [0, ry, 0]);
    cols.push({ kind: 'box', hx: len / 2, hy: 3, hz: 1.1, x: (ax + bx) / 2, y: 3, z: (az + bz) / 2, ry });
  }
  const ds = new THREE.Shape(); ds.moveTo(-1.8, 0); ds.lineTo(1.8, 0); ds.lineTo(1.8, 2.4); ds.absarc(0, 2.4, 1.8, 0, Math.PI, false); ds.lineTo(-1.8, 0);
  add(g, roundExtrude(ds, 0.5, 0.15, 32), 'matte', '#5f86b0', 0, 0, 5.25);
  for (let i = 0; i < 7; i++) add(g, sph(0.9, 24, 16), 'matte', '#ffffff', -9 + i * 3, 6.2, 4, undefined, [1.2, 0.5, 1]);
  return { g, cols, foot: 16 };
}

// ───────── 버섯 섬: 버섯 집 ─────────
function mushroomHouse(s: number, capC: string, rng: () => number): Built {
  const g = new THREE.Group();
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    prof.push(new THREE.Vector2(1.0 * s * (1 + 0.18 * Math.sin(t * Math.PI) - 0.15 * t), t * 2.4 * s));
  }
  const stem = new THREE.LatheGeometry(prof, 40);
  grad(stem, '#f2e2c4', '#fff8ea');
  add(g, stem, 'matte', null, 0, 0, 0);
  const capG = new THREE.SphereGeometry(2.0 * s, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const cc = new THREE.Color(capC);
  grad(capG, cc.clone().multiplyScalar(0.82), cc.clone().lerp(new THREE.Color('#ffffff'), 0.15));
  add(g, capG, 'gloss', null, 0, 2.0 * s, 0, undefined, [1, 0.75, 1]);
  add(g, new THREE.TorusGeometry(1.75 * s, 0.22 * s, 16, 48), 'matte', '#fff2dc', 0, 2.25 * s, 0, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, el = 0.25 + rng() * 0.9;
    const r = 2.0 * s;
    const x = Math.cos(a) * Math.sin(el) * r, y = Math.cos(el) * r * 0.75 + 2.0 * s, z = Math.sin(a) * Math.sin(el) * r;
    const sp = add(g, sph(0.32 * s, 20, 12), 'matte', '#ffffff', x, y, z, undefined, [1, 0.35, 1]);
    sp.quaternion.setFromUnitVectors(V(0, 1, 0), V(x, (y - 2.0 * s) / 0.75, z).normalize());
  }
  const ds = new THREE.Shape(); ds.moveTo(-0.35 * s, 0); ds.lineTo(0.35 * s, 0); ds.lineTo(0.35 * s, 0.7 * s); ds.absarc(0, 0.7 * s, 0.35 * s, 0, Math.PI, false); ds.lineTo(-0.35 * s, 0);
  add(g, roundExtrude(ds, 0.12 * s, 0.04 * s, 24), 'wood', ['#9a6440', '#c08654'], 0, 0.05, 1.07 * s);
  add(g, sph(0.05 * s, 12, 10), 'gold', null, 0.2 * s, 0.55 * s, 1.17 * s);
  add(g, new THREE.TorusGeometry(0.26 * s, 0.06 * s, 10, 28), 'wood', '#b98352', 0.75 * s, 1.45 * s, 0.85 * s, [0, 0.72, 0]);
  add(g, new THREE.CircleGeometry(0.24 * s, 28), 'window', null, 0.74 * s, 1.45 * s, 0.84 * s, [0, 0.72, 0]);
  add(g, cyl(0.16 * s, 0.18 * s, 1.0 * s, 20), 'stone', '#9d8a7a', -0.9 * s, 3.4 * s, -0.4 * s);
  return { g, cols: [{ kind: 'cyl', r: 1.1 * s, hh: 1.3 * s, x: 0, y: 1.3 * s, z: 0 }], foot: 1.2 * s };
}

// ───────── 산호 섬: 티키 오두막·해적선 잔해 ─────────
function tikiHut(s: number): Built {
  const g = new THREE.Group();
  add(g, rbox(4.4 * s, 0.25, 4.4 * s, 0.1, 3), 'wood', ['#a77650', '#c8955f'], 0, 1.1, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, cyl(0.16, 0.16, 1.2, 16), 'wood', WOOD_DARK, x * 1.9 * s, 0.55, z * 1.9 * s);
  const wall = cyl(1.7 * s, 1.75 * s, 2.0 * s, 40);
  stripesA(wall, ['#d9a86a', '#c79558'], 40, 0.2);
  add(g, wall, 'wood', null, 0, 1.2 + s, 0);
  const roof = new THREE.ConeGeometry(2.6 * s, 2.4 * s, 40, 6);
  const p = roof.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -1.1 * s) p.setY(i, p.getY(i) - 0.18 * Math.abs(Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 9)));
  roof.computeVertexNormals();
  add(g, roof, 'cloth', ['#d9b25c', '#f3d98a'], 0, 1.2 + 2 * s + 1.1 * s, 0);
  add(g, rbox(0.9 * s, 1.4 * s, 0.1, 0.1, 3), 'matte', '#5a3b28', 0, 1.25 + 0.7 * s, 1.72 * s);
  for (const sx of [-1, 1]) {
    add(g, cyl(0.12, 0.12, 2.2, 14), 'wood', WOOD_DARK, sx * 2.6 * s, 1.1, 2.6 * s);
    add(g, sph(0.22, 16, 12), 'glow', null, sx * 2.6 * s, 2.35, 2.6 * s, undefined, [1, 1.3, 1]);
  }
  return { g, cols: [{ kind: 'cyl', r: 2.0 * s, hh: 1.6 * s, x: 0, y: 1.6 * s, z: 0 }], foot: 2.2 * s };
}

function shipwreck(): Built {
  const g = new THREE.Group();
  const hull = new THREE.Group();
  const sh = new THREE.Shape();
  sh.moveTo(-11, 4); sh.quadraticCurveTo(-10, 0.5, -6, -1.2); sh.lineTo(7, -1.2); sh.quadraticCurveTo(11, 0, 12.5, 5); sh.lineTo(-11, 4);
  const hg = roundExtrude(sh, 6.5, 0.8, 32);
  hg.rotateY(Math.PI / 2);
  stripesY(hg, ['#8a5a3a', '#a06a44', '#7a4e33'], 0.9, -2);
  add(hull, hg, 'wood', null, 0, 0, 0);
  add(hull, rbox(5.6, 0.3, 20, 0.15, 3), 'wood', '#c8955f', 0, 3.6, 0);
  add(hull, rbox(6.2, 0.5, 0.5, 0.2, 3), 'paint', '#ffcc45', 0, 4.0, -11.5);
  add(hull, cyl(0.4, 0.35, 11, 20), 'wood', WOOD_DARK, 0, 9, -2, [0.12, 0, 0.05]);
  add(hull, cyl(0.3, 0.25, 6, 20), 'wood', WOOD_DARK, 1.5, 4.5, 5, [0.9, 0.3, 0]);
  const sail = new THREE.PlaneGeometry(6, 4.5, 12, 8);
  const sp = sail.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setZ(i, Math.sin(sp.getX(i) * 0.5) * 0.5 + Math.cos(sp.getY(i)) * 0.3);
  sail.computeVertexNormals();
  stripesY(sail, ['#fff4e2', '#ff8f8f'], 1.1, -2.25);
  add(hull, sail, 'cloth', null, 0, 10, -1.6, [0.12, Math.PI / 2, 0]);
  add(hull, rbox(0.06, 1.4, 2.0, 0.05, 2), 'cloth', '#3b3b45', 0, 14.2, -1.0);
  add(hull, sph(0.35, 16, 12), 'matte', '#ffffff', 0.06, 14.3, -1.0, undefined, [0.3, 1, 1]);
  for (let i = 0; i < 3; i++) add(hull, rbox(1.2, 0.9, 0.9, 0.2, 3), 'wood', ['#9a6440', '#c08654'], -2.5 + i * 2.2, 0.0 - i * 0.3, 9 + i * 1.5, [0, i, 0.2]);
  hull.rotation.set(0.05, 0, 0.32);
  g.add(hull);
  return { g, cols: [{ kind: 'box', hx: 3.3, hy: 3, hz: 11, x: 0, y: 2, z: 0 }], foot: 0 };
}

// ───────── 사막 섬: 피라미드·오아시스 천막 ─────────
function pyramid(): Built {
  const g = new THREE.Group();
  const N = 9, S = 52, Hs = 3.6;
  for (let i = 0; i < N; i++) {
    const w = S * (1 - i / N);
    add(g, rbox(w, Hs, w, 0.9, 4), 'stone', ['#e0b56e', '#f6d79a'], 0, Hs / 2 + i * Hs - 0.4, 0);
  }
  add(g, rbox((S / N) * 1.2, 4, (S / N) * 1.2, 1.0, 4), 'gold', null, 0, N * Hs + 1.4, 0);
  for (let i = 0; i < N * 2; i++) add(g, rbox(6, Hs / 2, 2.4, 0.3, 3), 'stone', ['#d3a663', '#ecca8a'], 0, Hs / 4 + (i * Hs) / 2 - 0.4, S / 2 + 0.8 - (i * S) / N / 4);
  const ds = new THREE.Shape(); ds.moveTo(-2, 0); ds.lineTo(2, 0); ds.lineTo(2, 3); ds.absarc(0, 3, 2, 0, Math.PI, false); ds.lineTo(-2, 0);
  add(g, roundExtrude(ds, 0.6, 0.2, 24), 'matte', '#5a3b28', 0, 0, S / 2 + 0.1);
  return { g, cols: [{ kind: 'box', hx: S / 2 - 3, hy: 8, hz: S / 2 - 3, x: 0, y: 8, z: 0 }, { kind: 'box', hx: S / 4, hy: 8, hz: S / 4, x: 0, y: 22, z: 0 }], foot: S / 2 };
}

function oasis(): Built {
  const g = new THREE.Group();
  add(g, blob(8, 0.06, 0.08, 4, 5), 'gloss', ['#2fb5c8', '#6fe0e8'], 0, 0.15, 0, undefined, [1.2, 1, 1]);
  add(g, new THREE.TorusGeometry(8.6, 0.6, 12, 64), 'matte', ['#8bcf6a', '#a8e07a'], 0, 0.1, 0, [Math.PI / 2, 0, 0], [1.2, 1, 1]);
  const tentC: Array<[string, string]> = [['#ff8f8f', '#fff3e0'], ['#5aaef0', '#fff3e0'], ['#ffcf6a', '#ffffff'], ['#b48cf0', '#fff3e0']];
  for (let i = 0; i < 4; i++) {
    const a = 0.6 + i * 0.75;
    const x = Math.cos(a) * 14, z = Math.sin(a) * 12;
    const t = new THREE.ConeGeometry(3.2, 3.8, 40, 3, true);
    stripesA(t, tentC[i], 12, 0.15);
    add(g, t, 'cloth', null, x, 1.9 + 1.0, z);
    add(g, cyl(3.0, 3.0, 1.0, 40, true), 'cloth', tentC[i][1], x, 0.5, z);
    add(g, cap(0.07, 1.2), 'wood', WOOD_DARK, x, 5.0, z);
    add(g, rbox(0.06, 0.5, 0.8, 0.04, 2), 'cloth', tentC[i][0], x, 5.4, z + 0.42);
    add(g, rbox(2.6, 0.06, 1.8, 0.2, 3), 'cloth', tentC[(i + 1) % 4][0], x * 0.75, 0.05, z * 0.75, [0, a, 0]);
    add(g, sph(0.45, 24, 16), 'paint', ['#c06a3a', '#e08a5a'], x * 0.75 + 1.2, 0.4, z * 0.75, undefined, [1, 1.1, 1]);
  }
  return { g, cols: [], foot: 0 };
}

// ───────── 발사대 섬: 관제탑·발사탑·격납고 ─────────
function controlTower(): Built {
  const g = new THREE.Group();
  add(g, cyl(4, 4, 1, 40), 'stone', ['#c6ccd4', '#e6eaf0'], 0, 0.5, 0);
  add(g, cyl(2.4, 1.8, 22, 40), 'matte', ['#e6ecf3', '#ffffff'], 0, 11, 0);
  for (let i = 0; i < 5; i++) add(g, rbox(0.5, 1.0, 0.12, 0.2, 3), 'window', null, 0, 4 + i * 3.6, 2.3 - i * 0.12);
  add(g, cyl(3.6, 4.6, 1.2, 48), 'paint', ['#5aaef0', '#86c8ff'], 0, 22.4, 0);
  add(g, cyl(4.6, 4.4, 3.0, 48), 'window', null, 0, 24.5, 0);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; add(g, cap(0.1, 2.8), 'gloss', '#ffffff', Math.cos(a) * 4.55, 24.5, Math.sin(a) * 4.55); }
  add(g, dome(4.7, 48, 16), 'gloss', ['#ff8f6a', '#ffb08a'], 0, 26.0, 0, undefined, [1, 0.45, 1]);
  add(g, cap(0.12, 5), 'gloss', '#e6ecf3', 0, 30, 0);
  add(g, sph(0.35), 'glow', null, 0, 32.8, 0);
  add(g, new THREE.SphereGeometry(1.6, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.35), 'gloss', '#ffffff', 2.2, 28.4, 0, [0, 0, -0.9]);
  return { g, cols: [{ kind: 'cyl', r: 2.3, hh: 13, x: 0, y: 13, z: 0 }], foot: 4 };
}

function launchTower(): Built {
  const g = new THREE.Group();
  const H = 44;
  add(g, rbox(7, 1, 7, 0.3, 3), 'stone', ['#9aa2ac', '#c6ccd4'], 0, 0.5, 0);
  const posts = [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]];
  for (const [x, z] of posts) add(g, rbox(0.55, H, 0.55, 0.15, 3), 'paint', '#ff6f61', x, H / 2, z);
  for (let y = 3; y < H; y += 4) {
    const c = Math.floor(y / 4) % 2 ? '#ffffff' : '#ff6f61';
    for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
      rod(g, V(posts[a][0], y, posts[a][1]), V(posts[b][0], y, posts[b][1]), 0.16, 'paint', c, 8);
      if (y + 4 < H) rod(g, V(posts[a][0], y, posts[a][1]), V(posts[b][0], y + 4, posts[b][1]), 0.1, 'paint', '#ffffff', 6);
    }
  }
  for (const y of [16, 30]) {
    add(g, rbox(9, 0.7, 1.4, 0.25, 3), 'paint', '#ffcc45', -6.5, y, 0);
    add(g, sph(0.4), 'glow', null, -10.8, y + 0.6, 0);
  }
  add(g, cyl(0.15, 0.15, 5, 10), 'gloss', '#c6ccd4', 0, H + 2.5, 0);
  add(g, sph(0.5), 'glow', null, 0, H + 5.2, 0);
  return { g, cols: [{ kind: 'box', hx: 2.8, hy: H / 2, hz: 2.8, x: 0, y: H / 2, z: 0 }], foot: 4 };
}

function hangar(): Built {
  const g = new THREE.Group();
  const R = 9, L = 22;
  const v = new THREE.CylinderGeometry(R, R, L, 48, 1, true, -Math.PI / 2, Math.PI);
  v.rotateX(-Math.PI / 2);
  grad(v, '#cfd8e2', '#f2f6fa');
  add(g, v, 'paint', null, 0, 0, 0);
  add(g, new THREE.CircleGeometry(R, 48, 0, Math.PI), 'matte', '#c7d1dc', 0, 0, -L / 2, [0, Math.PI, 0]);
  add(g, new THREE.TorusGeometry(R, 0.45, 12, 48, Math.PI), 'paint', '#5aaef0', 0, 0, L / 2);
  add(g, rbox(R * 1.3, R * 0.8, 0.3, 0.3, 3), 'paint', ['#ffb347', '#ffd27a'], 0, R * 0.4, L / 2 - 0.3);
  for (let i = 0; i < 6; i++) add(g, rbox(0.12, R * 0.78, 0.1, 0.04, 2), 'paint', '#e8964a', -R * 0.55 + i * R * 0.22, R * 0.4, L / 2 - 0.12);
  for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(R + 0.05, 0.18, 8, 48, Math.PI), 'paint', '#a9b5c2', 0, 0, -L / 2 + 3 + i * 5.3);
  const lb = label('격납고', 6, 1.4, { fg: '#ffffff', stroke: '#3a6ea8' });
  lb.position.set(0, R + 0.4, L / 2 + 0.6);
  g.add(lb);
  return { g, cols: [{ kind: 'box', hx: R, hy: R / 2, hz: L / 2, x: 0, y: R / 2, z: 0 }], foot: R };
}

// ───────── 도착 부두 환영 아치 ─────────
function welcomeArch(name: string, c: string): Built {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    add(g, rbox(0.4, 3.4, 0.4, 0.15, 3), 'wood', [WOOD_DARK, '#c8955f'], sx * 2.1, 1.7, 0);
    add(g, sph(0.3), 'paint', c, sx * 2.1, 3.55, 0);
  }
  const cc = new THREE.Color(c);
  add(g, roundExtrude(roundRectShape(4.8, 0.95, 0.4), 0.2, 0.07), 'paint', [cc.clone().multiplyScalar(0.85), cc], 0, 3.1, 0);
  for (const ry of [0, Math.PI]) {
    const lb = label(name, 4.4, 0.8, { fg: '#ffffff', stroke: '#00000040' });
    lb.position.set(0, 3.1, ry ? -0.12 : 0.12);
    lb.rotation.y = ry;
    g.add(lb);
  }
  return { g, cols: [{ kind: 'box', hx: 0.2, hy: 1.7, hz: 0.2, x: -2.1, y: 1.7, z: 0 }, { kind: 'box', hx: 0.2, hy: 1.7, hz: 0.2, x: 2.1, y: 1.7, z: 0 }], foot: 2 };
}

// ───────── 배치 ─────────
export function buildLandmarks(ctx: Ctx, mk: () => Placer, footY: FootY, imps: Imp[] = []): THREE.Group[] {
  const imp = (kind: ImpKind, o: THREE.Object3D) => { imps.push({ kind, o }); return o; };
  const I = ctx.island;
  const out: THREE.Group[] = [];
  /** 섬 중심에서 각도 ang 방향으로 걸어 나가며 해안 거리가 coast 이상인 가장 바깥 땅 */
  const spot = (id: string, ang: number, coast: number) => {
    const d = I.islandById(id)!;
    let best = { x: d.x, z: d.z };
    for (let r = 0; r < d.r * 1.6; r += 3) {
      const x = d.x + Math.cos(ang) * r, z = d.z + Math.sin(ang) * r;
      const s = I.worldSample(x, z);
      if (s.island?.id === id && s.coast >= coast) best = { x, z };
    }
    return best;
  };
  const faceTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
  const put = (P: Placer, b: Built, p: { x: number; z: number }, rotY: number, sink = 0.1) => P.place(b, p.x, footY(p.x, p.z, Math.max(1, (b.foot ?? 1) * (b.scale ?? 1) * 0.8)) - sink * (b.scale ?? 1), p.z, rotY);
  const big = (b: Built, k: number) => { b.scale = k; return b; };

  const docks = I.PLACES.docks;
  const names: Record<string, [string, string]> = {
    dino: ['공룡 섬', '#6fbf5e'], ice: ['얼음 섬', '#5fa8f0'], mushroom: ['버섯 요정 섬', '#ff7fa8'],
    coral: ['산호 섬', '#ff8a6a'], desert: ['사막 오아시스 섬', '#f0a040'], launch: ['발사대 섬', '#7a8cf0'],
  };
  /** 도착 부두: 도크 지점에 아치, 섬 바깥(바다) 쪽으로 잔교 */
  const dock = (P: Placer, id: string) => {
    const d = I.islandById(id)!, k = docks[id];
    if (!k) return;
    const dir = new THREE.Vector2(k.x - d.x, k.z - d.z).normalize();
    let s = new THREE.Vector2(k.x, k.z);
    for (let i = 0; i < 300; i++) {
      const n = s.clone().addScaledVector(dir, 1);
      if (I.surfaceAt(n.x, n.y).coastDist < 1.5) break;
      s = n;
    }
    // 아치: 잔교가 시작하는 물가 조금 안쪽
    const ap = s.clone().addScaledVector(dir, -5);
    put(P, big(welcomeArch(names[id][0], names[id][1]), 1.35), { x: ap.x, z: ap.y }, Math.atan2(dir.x, dir.y), 0.05);
    const y0 = I.heightAt(s.x, s.y);
    P.place(buildPier(26, 2.6, Math.max(1.1 - y0, 0.25), 6, ctx.rng(`village:dock:${id}`)), s.x, y0, s.y, Math.atan2(dir.x, dir.y));
  };
  const angTo = (id: string) => { const d = I.islandById(id)!; return Math.atan2(docks[id].z - d.z, docks[id].x - d.x); };

  // 시작 섬: 등대(해안 곶) + 풍차(언덕)
  {
    const P = mk();
    const lh = spot('home', 0.75, 10);
    imp('lighthouse', put(P, big(lighthouse(), 1.5), lh, 0.5));
    const wm = spot('home', 1.75, 70);
    imp('windmill', put(P, big(windmill(), 1.6), wm, faceTo(wm, { x: 0, z: 0 })));
    out.push(P.root);
  }
  // 공룡 섬
  {
    const P = mk(), rng = ctx.rng('village:dino');
    const a0 = angTo('dino');
    const ru = spot('dino', a0 + 0.1, 45);
    imp('ruins', put(P, big(ruins(rng), 2.0), ru, faceTo(ru, docks.dino), 0.4));
    const fd = spot('dino', a0 - 0.1, 35);
    put(P, big(fossilDig(rng), 1.6), fd, faceTo(fd, docks.dino), 0.3);
    dock(P, 'dino');
    out.push(P.root);
  }
  // 얼음 섬: 산 중턱 성 + 해안 이글루 마을
  {
    const P = mk();
    const d = I.islandById('ice')!;
    const a0 = angTo('ice');
    const top = { x: d.x + Math.cos(a0) * 25, z: d.z + Math.sin(a0) * 25 };
    imp('iceCastle', P.place(big(iceCastle(), 2.2), top.x, I.heightAt(top.x, top.z) - 1.5, top.z, faceTo(top, docks.ice)));
    const iv = spot('ice', a0 + 0.12, 32);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = { x: iv.x + Math.cos(a) * 11, z: iv.z + Math.sin(a) * 11 };
      put(P, igloo(2.4 + (i % 3) * 0.5), p, faceTo(p, iv) + Math.PI, 0.15);
    }
    put(P, igloo(3.6), iv, faceTo(iv, docks.ice), 0.15);
    dock(P, 'ice');
    out.push(P.root);
  }
  // 버섯 섬: 큰 버섯 탑 + 버섯 집 마을
  {
    const P = mk(), rng = ctx.rng('village:mush');
    const a0 = angTo('mushroom');
    const c = spot('mushroom', a0, 60);
    const capCols = ['#ff5e6c', '#ff8fb1', '#b48cf0', '#ffb347', '#5ac3b0', '#ff7a5a'];
    imp('mushroom', put(P, mushroomHouse(8, '#ff5e6c', rng), c, faceTo(c, docks.mushroom), 0.2));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4, r = 18 + (i % 2) * 7;
      const p = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
      put(P, mushroomHouse(1.6 + (i % 3) * 0.45, capCols[i % capCols.length], rng), p, faceTo(p, docks.mushroom), 0.1);
    }
    dock(P, 'mushroom');
    out.push(P.root);
  }
  // 산호 섬: 티키 오두막 + 해적선 잔해
  {
    const P = mk();
    const a0 = angTo('coral');
    const t = spot('coral', a0 + 0.07, 30);
    for (let i = 0; i < 4; i++) {
      const p = { x: t.x + Math.cos(a0 + Math.PI / 2) * (i - 1.5) * 9, z: t.z + Math.sin(a0 + Math.PI / 2) * (i - 1.5) * 9 };
      put(P, tikiHut(1 + (i % 2) * 0.25), p, faceTo(p, docks.coral), 0.1);
    }
    const sw = spot('coral', a0 - 0.16, 2);
    imp('shipwreck', P.place(shipwreck(), sw.x, Math.max(-0.8, I.heightAt(sw.x, sw.z)) + 0.6, sw.z, a0 + 0.9));
    dock(P, 'coral');
    out.push(P.root);
  }
  // 사막 섬: 계단 피라미드 + 오아시스 천막
  {
    const P = mk();
    const a0 = angTo('desert');
    const py = spot('desert', a0 + 0.22, 95);
    imp('pyramid', put(P, pyramid(), py, faceTo(py, docks.desert), 0.8));
    const oa = spot('desert', a0 - 0.12, 55);
    put(P, oasis(), oa, 0, 0.05);
    dock(P, 'desert');
    out.push(P.root);
  }
  // 발사대 섬: 발사탑(로켓 옆) + 관제탑 + 격납고
  {
    const P = mk();
    const L = I.PLACES.launchPad;
    put(P, launchTower(), { x: L.x + 13, z: L.z }, 0, 0.3);
    const ct = { x: L.x + 55, z: L.z + 48 }, hg = { x: L.x - 50, z: L.z + 40 };
    imp('controlTower', put(P, big(controlTower(), 1.4), ct, faceTo(ct, L), 0.3));
    put(P, hangar(), hg, faceTo(hg, L), 0.3);
    // 거대 기념 로켓: 섬 스폰 지점의 기본 카메라 정면(-z) 축, 고원 안쪽 — 도착하자마자 보이고 수평선 너머에서도 읽힌다
    const R = rocketSpot(I);
    imp('rocket', put(P, giantRocket(), R, 0, 0.4));
    const gp = { x: R.x + 15, z: R.z };
    put(P, gantry(52, 7.5), gp, 0, 0.3);
    const right = { x: 1, z: 0 }, fwd = { x: 0, z: 1 };
    const at = (u: number, v: number) => ({ x: R.x + right.x * u + fwd.x * v, z: R.z + right.z * u + fwd.z * v });
    for (const [u, v, c] of [[-28, -6, '#ffb3b3'], [-34, 6, '#bfe3ff'], [-22, 14, '#fff0a8']] as const) put(P, fuelTank(c), at(u, v), 0, 0.2);
    put(P, big(radarDish(), 1.3), at(34, 18), -0.6, 0.2);
    put(P, antenna(22), at(30, -14), 0, 0.1);
    put(P, antenna(16), at(40, -4), 0, 0.1);
    put(P, antenna(18), at(-40, -16), 0, 0.1);
    // 활주 표지: 스폰 쪽(+z)에서 로켓 받침까지 이어지는 띠(지형 계단을 따라 조각조각)
    for (let v = 24; v < R.len - 12; v += 13) {
      const p = at(0, v);
      put(P, runway(18), p, 0, 0.12);
    }
    dock(P, 'launch');
    out.push(P.root);
  }
  return out;
}

/** 발사대 섬 스폰(main.ts 가 쓰는 islandSpawnPoints('launch',1,0.08)) 앞 -z 쪽으로 걸어가며 해안에서 충분히 먼 마지막 고원 자리 */
export function rocketSpot(I: Ctx['island']): { x: number; z: number; len: number } {
  const d = I.islandById('launch')!;
  const sp = I.islandSpawnPoints('launch', 1, 0.08)[0] ?? { x: d.x, z: d.z };
  let best = { x: d.x - 40, z: d.z - 30, len: 60 };
  for (let dist = 90; dist <= 230; dist += 5) {
    const x = sp.x - 18, z = sp.z - dist;
    const s = I.worldSample(x, z);
    if (s.island?.id === 'launch' && s.coast >= 45) best = { x, z, len: dist };
  }
  return best;
}
