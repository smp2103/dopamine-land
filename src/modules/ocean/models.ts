// 귀여운 바다 생물 모델(코드로 빚기). 앞 = +Z, 위 = +Y, 바닥 생물은 y=0 에 앉는다.
// 모델 하나 = 칠한 부품을 합친 지오메트리 하나(재질 공유, 드로우콜 하나).
import * as THREE from 'three';
import { at, cap, cone, cyl, ell, ellZ, face, merge, paint, paintFn, sph, torus, type Geo } from './kit';

const PI = Math.PI;
const C = (h: string) => new THREE.Color(h);

function tentacle(parts: Geo[], x: number, y: number, z: number, dir: number, len: number, r0: number, col: string, col2: string, curl = 1, droop = 0.6) {
  // 구슬을 이어 둥글게 말린 다리
  const n = 7;
  let px = x, py = y, pz = z, a = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = r0 * (1 - t * 0.6);
    parts.push(at(paint(sph(r, 14, 10), t < 0.5 ? col : col2, col), px, py, pz));
    a += 0.28 * curl;
    const step = (len / n);
    px += Math.sin(dir) * step * Math.cos(a);
    pz += Math.cos(dir) * step * Math.cos(a);
    py += -step * droop * (1 - t) + Math.sin(a) * step * 0.6 * curl;
  }
}

function eyeStalk(parts: Geo[], x: number, y: number, z: number, h: number, r: number, stalk: string) {
  parts.push(at(paint(cyl(r * 0.35, r * 0.45, h, 10), stalk), x, y + h / 2, z));
  parts.push(at(paint(sph(r * 1.05, 18, 14), '#ffffff', '#eef0ff'), x, y + h + r * 0.4, z));
  parts.push(at(paint(ell(r * 0.62, r * 0.75, r * 0.4, 16, 12), '#2a1e30'), x, y + h + r * 0.45, z + r * 0.75));
  parts.push(at(paint(sph(r * 0.24, 10, 8), '#ffffff'), x - r * 0.18, y + h + r * 0.75, z + r * 1.0));
}

const builders: Record<string, () => Geo> = {
  cucumber() {
    const p: Geo[] = [];
    p.push(at(paint(ell(0.12, 0.1, 0.32), '#f1ae86', '#c27357'), 0, 0.1, 0));
    for (let i = 0; i < 16; i++) {
      const z = -0.26 + (i % 8) * 0.07, s = i < 8 ? -1 : 1;
      p.push(at(paint(sph(0.028, 12, 10), '#ffd2ae', '#f3b48e'), s * 0.06, 0.18 - Math.abs(z) * 0.08, z));
    }
    p.push(...face({ y: 0.13, z: 0.29, sep: 0.045, r: 0.028, zAt: ellZ(0.12, 0.1, 0.32, 0.1) }));
    return merge(p);
  },
  abalone() {
    const p: Geo[] = [];
    p.push(at(paint(ell(0.17, 0.06, 0.21), '#ffe1bd', '#f0c595'), 0, 0.05, 0.02));
    p.push(at(paint(ell(0.2, 0.09, 0.25), '#a7d7c5', '#6fa596'), 0, 0.1, -0.02));
    p.push(at(paint(torus(0.19, 0.025, 10, 40).scale(1, 1.25, 1).rotateX(PI / 2), '#e8d8ff', '#bfe9ff'), 0, 0.09, -0.02));
    for (let i = 0; i < 5; i++) p.push(at(paint(sph(0.018, 10, 8), '#5f8b80'), 0.12, 0.13, -0.15 + i * 0.07));
    p.push(...face({ y: 0.08, z: 0.22, sep: 0.05, r: 0.026, zAt: ellZ(0.17, 0.06, 0.21, 0.05, 0.02) }));
    return merge(p);
  },
  urchin() {
    const p: Geo[] = [];
    p.push(at(paint(sph(0.14), '#9b7bf0', '#5a3cb0'), 0, 0.13, 0));
    const n = 46;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 1.6, rr = Math.sqrt(1 - y * y), th = i * 2.39996;
      const d = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
      if (d.z > 0.55 && Math.abs(d.y) < 0.6) continue; // 얼굴 자리
      const g = paint(cone(0.016, 0.16, 8), '#e9dcff', '#8a6ae0');
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      p.push(at(g, d.x * 0.2, 0.13 + d.y * 0.2, d.z * 0.2));
    }
    p.push(...face({ y: 0.15, z: 0.13, sep: 0.05, r: 0.032, zAt: ellZ(0.14, 0.14, 0.14, 0.13) }));
    return merge(p);
  },
  octopus() { return octo('#ff9d8f', '#f2696d', '#ffd0c4', 1); },
  webfoot() { return octo('#ffc28a', '#e98a5a', '#ffe2c4', 0.75); },
  squid() {
    const p: Geo[] = [];
    p.push(at(paint(ell(0.11, 0.26, 0.11), '#fff1fb', '#f2b7de'), 0, 0.42, 0));
    p.push(at(paint(ell(0.14, 0.09, 0.025), '#ffd7f0', '#f6b5dd'), 0, 0.62, -0.02));
    for (let i = 0; i < 6; i++) p.push(at(paint(sph(0.02, 10, 8), '#ff9fd0'), Math.sin(i) * 0.06, 0.38 + i * 0.04, 0.1));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      tentacle(p, Math.sin(a) * 0.06, 0.18, Math.cos(a) * 0.06, a, 0.22, 0.026, '#f6c2e4', '#ffe3f4', 0.3, 0.9);
    }
    p.push(...face({ y: 0.3, z: 0.1, sep: 0.045, r: 0.03, zAt: ellZ(0.11, 0.26, 0.11, 0.42) }));
    return merge(p);
  },
  seahorse() { return seahorse('#ffd36e', '#ff9f4a', '#fff0b8'); },
  goldhorse() { return seahorse('#fff3a0', '#f5b520', '#ffffff'); },
  scallop() {
    const p: Geo[] = [];
    const stripe = (a: string, b: string) => (v: THREE.Vector3, o: THREE.Color) => {
      const ang = Math.atan2(v.x, v.z + 0.2);
      o.copy(C(a)).lerp(C(b), 0.5 + 0.5 * Math.cos(ang * 18));
    };
    const top = new THREE.SphereGeometry(1, 40, 20, 0, PI * 2, 0, PI / 2).scale(0.2, 0.09, 0.18);
    p.push(at(paintFn(top, stripe('#ffb8cc', '#ff86a6')), 0, 0.06, 0, 0.12, 0, 0));
    const bot = new THREE.SphereGeometry(1, 40, 20, 0, PI * 2, PI / 2, PI / 2).scale(0.19, 0.05, 0.17);
    p.push(at(paintFn(bot, stripe('#ffe0e8', '#ffc4d4')), 0, 0.055, 0));
    p.push(at(paint(ell(0.09, 0.03, 0.05), '#ff9ab5'), 0, 0.06, -0.18));
    p.push(at(paint(ell(0.16, 0.02, 0.03), '#fff6e8'), 0, 0.065, 0.13));
    p.push(...face({ y: 0.085, z: 0.17, sep: 0.05, r: 0.024, cheek: '#ff7aa0' }));
    return merge(p);
  },
  pearl() { return clam('#b6b9e8', '#8a8fcf', '#fff4fb', true, 0.17); },
  oyster() {
    const p: Geo[] = [];
    const rough = (v: THREE.Vector3, o: THREE.Color) => { o.copy(C('#c9c0d9')).lerp(C('#9d93b4'), 0.5 + 0.5 * Math.sin(v.x * 70 + Math.sin(v.z * 50) * 2)); };
    p.push(at(paintFn(ell(0.17, 0.06, 0.13), rough), 0, 0.06, 0));
    p.push(at(paintFn(ell(0.15, 0.05, 0.12), rough), 0.01, 0.1, -0.01, 0.1, 0.2, 0));
    p.push(at(paint(ell(0.12, 0.015, 0.02), '#fff3fa'), 0, 0.08, 0.11));
    p.push(...face({ y: 0.11, z: 0.12, sep: 0.045, r: 0.024 }));
    return merge(p);
  },
  mussel() {
    const p: Geo[] = [];
    p.push(at(paint(ell(0.07, 0.065, 0.16), '#5a6aa8', '#2e3768'), 0, 0.065, 0));
    p.push(at(paint(torus(0.065, 0.012, 8, 32).scale(1, 2.3, 1).rotateX(PI / 2), '#8fa0dc'), 0, 0.065, 0.02));
    p.push(...face({ y: 0.09, z: 0.1, sep: 0.03, r: 0.02, zAt: ellZ(0.07, 0.065, 0.16, 0.065) }));
    return merge(p);
  },
  giantclam() {
    const p: Geo[] = [];
    const wave = (a: string, b: string) => (v: THREE.Vector3, o: THREE.Color) => { o.copy(C(a)).lerp(C(b), 0.5 + 0.5 * Math.cos(v.x * 30)); };
    const s1 = new THREE.SphereGeometry(1, 40, 20, 0, PI * 2, PI / 2, PI / 2).scale(0.45, 0.22, 0.3);
    p.push(at(paintFn(s1, wave('#e6ecf6', '#b9c4da')), 0, 0.22, 0));
    const s2 = new THREE.SphereGeometry(1, 40, 20, 0, PI * 2, 0, PI / 2).scale(0.45, 0.22, 0.3);
    p.push(at(paintFn(s2, wave('#eef2fb', '#c2cbe0')), 0, 0.26, -0.06, -0.55, 0, 0));
    const mantle = (v: THREE.Vector3, o: THREE.Color) => { o.copy(C('#29c7d8')).lerp(C('#7c5cff'), 0.5 + 0.5 * Math.sin(v.x * 40 + v.z * 25)); };
    p.push(at(paintFn(ell(0.4, 0.05, 0.22), mantle), 0, 0.24, 0.0));
    for (let i = 0; i < 9; i++) p.push(at(paint(sph(0.022, 10, 8), '#b8ffef'), -0.3 + i * 0.075, 0.29, 0.05 + Math.sin(i * 1.7) * 0.06));
    p.push(...face({ y: 0.33, z: 0.16, sep: 0.09, r: 0.045 }));
    return merge(p);
  },
  crab() { return crab('#ff8a66', '#e6553f', 1); },
  hermit() {
    const p: Geo[] = [];
    // 소라 껍데기 집
    spiral(p, '#ffe2c6', '#f2a6b5', 0.15, -0.04);
    p.push(at(paint(ell(0.08, 0.07, 0.07), '#ff8a6a', '#e45b45'), 0, 0.08, 0.12));
    for (const s of [-1, 1]) {
      p.push(at(paint(ell(0.05, 0.035, 0.045), '#ff7b5c', '#d94c3a'), s * 0.08, 0.06, 0.18));
      for (let k = 0; k < 2; k++) p.push(at(paint(cap(0.012, 0.07, 4, 8), '#ff9a7c'), s * (0.07 + k * 0.03), 0.03, 0.08 + k * 0.03, 0, 0, s * 1.0));
    }
    eyeStalk(p, -0.03, 0.12, 0.15, 0.05, 0.022, '#ff9a7c');
    eyeStalk(p, 0.03, 0.12, 0.15, 0.05, 0.022, '#ff9a7c');
    return merge(p);
  },
  lobster() {
    const p: Geo[] = [];
    const red = '#ff6f5e', red2 = '#d9413a';
    p.push(at(paint(ell(0.1, 0.085, 0.16), red, red2), 0, 0.1, 0.05));
    for (let i = 0; i < 5; i++) p.push(at(paint(ell(0.085 - i * 0.01, 0.06 - i * 0.006, 0.05), red, red2), 0, 0.09 - i * 0.008, -0.13 - i * 0.065));
    for (const s of [-1, 0, 1]) p.push(at(paint(ell(0.035, 0.012, 0.06), '#ff8f7e'), s * 0.045, 0.05, -0.47, 0, s * 0.4, 0));
    for (const s of [-1, 1]) {
      p.push(at(paint(cap(0.022, 0.12, 4, 10), red), s * 0.12, 0.1, 0.18, PI / 2, 0, s * 0.6));
      p.push(at(paint(ell(0.07, 0.045, 0.1), '#ff7f6a', red2), s * 0.18, 0.11, 0.3, 0, s * 0.3, 0));
      p.push(at(paint(ell(0.025, 0.02, 0.06), '#ff9a8a'), s * 0.15, 0.11, 0.39, 0, -s * 0.4, 0));
      p.push(at(paint(cyl(0.006, 0.004, 0.5, 6), '#ff8f7e'), s * 0.04, 0.2, 0.38, 1.0, 0, s * 0.4));
      for (let k = 0; k < 3; k++) p.push(at(paint(cap(0.012, 0.09, 4, 8), red), s * 0.11, 0.04, 0.06 - k * 0.07, 0, 0, s * 1.1));
    }
    p.push(...face({ y: 0.13, z: 0.2, sep: 0.045, r: 0.028, zAt: ellZ(0.1, 0.085, 0.16, 0.1, 0.05) }));
    return merge(p);
  },
  shrimp() {
    const p: Geo[] = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1)) * PI * 0.85;
      const r = 0.065 * (1 - i * 0.1);
      p.push(at(paint(ell(r, r * 0.95, r * 0.9), '#ffb79a', '#ff8a6e'), 0, 0.2 + Math.cos(a) * 0.1, Math.sin(a) * -0.12 + 0.06));
    }
    p.push(at(paint(ell(0.05, 0.015, 0.04), '#ffc8b4'), 0, 0.1, 0.0, 0.4, 0, 0));
    for (const s of [-1, 1]) {
      p.push(at(paint(cyl(0.004, 0.003, 0.3, 6), '#ff9a80'), s * 0.03, 0.38, 0.15, -0.9, 0, s * 0.3));
      for (let k = 0; k < 3; k++) p.push(at(paint(cap(0.008, 0.05, 3, 6), '#ffc2ad'), s * 0.03, 0.14, 0.05 - k * 0.03, 0, 0, s * 0.4));
    }
    p.push(...face({ y: 0.31, z: 0.12, sep: 0.035, r: 0.022 }));
    return merge(p);
  },
  jelly() { return jelly('#ffc8ea', '#ff9fd2', '#ffe6f6'); },
  moonjelly() { return jelly('#d6e2ff', '#a9b8ff', '#f2f5ff', true); },
  turtle() {
    const p: Geo[] = [];
    const shell = (v: THREE.Vector3, o: THREE.Color) => {
      const cx = Math.round(v.x / 0.22), cz = Math.round(v.z / 0.24);
      const d = Math.hypot(v.x - cx * 0.22, v.z - cz * 0.24);
      o.copy(C('#9fd68a')).lerp(C('#5aa86a'), Math.min(1, d / 0.12) * 0.8).lerp(C('#3f8a58'), v.y < 0.05 ? 0.4 : 0);
    };
    const top = new THREE.SphereGeometry(1, 40, 20, 0, PI * 2, 0, PI / 2).scale(0.55, 0.3, 0.68);
    p.push(at(paintFn(top, shell), 0, 0, 0));
    p.push(at(paint(ell(0.52, 0.09, 0.64), '#fff2c9', '#f3df9e'), 0, -0.02, 0));
    p.push(at(paint(sph(0.19), '#b8e6a3', '#86c47e'), 0, 0.05, 0.78));
    p.push(...face({ y: 0.1, z: 0.9, sep: 0.08, r: 0.05, zAt: ellZ(0.19, 0.19, 0.19, 0.05, 0.78) }));
    for (const s of [-1, 1]) {
      p.push(at(paint(ell(0.42, 0.04, 0.14), '#a6dc92', '#7cbc78'), s * 0.62, -0.02, 0.32, 0, s * 0.5, s * -0.15));
      p.push(at(paint(ell(0.2, 0.035, 0.1), '#a6dc92', '#7cbc78'), s * 0.42, -0.02, -0.55, 0, -s * 0.6, 0));
    }
    p.push(at(paint(cone(0.06, 0.18, 12), '#a6dc92'), 0, -0.01, -0.75, -PI / 2, 0, 0));
    return merge(p);
  },
  puffer() {
    const p: Geo[] = [];
    p.push(at(paint(sph(0.19), '#ffe489', '#fff8dc'), 0, 0.2, 0));
    const n = 40;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), th = i * 2.39996;
      const d = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
      if (d.z > 0.5 && Math.abs(d.y) < 0.65) continue;
      const g = paint(cone(0.014, 0.05, 8), '#fff6c8', '#e8c060');
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      p.push(at(g, d.x * 0.205, 0.2 + d.y * 0.205, d.z * 0.205));
    }
    for (let i = 0; i < 7; i++) p.push(at(paint(sph(0.022, 10, 8), '#c79a3a'), Math.cos(i * 0.9) * 0.12, 0.33 + Math.sin(i * 2.1) * 0.02, -0.05 + Math.sin(i * 0.9) * 0.1));
    p.push(at(paint(ell(0.04, 0.09, 0.07), '#ffd36a'), 0, 0.2, -0.22));
    for (const s of [-1, 1]) p.push(at(paint(ell(0.015, 0.05, 0.05), '#ffd36a'), s * 0.19, 0.18, 0.04, 0, 0, s * 0.3));
    p.push(...face({ y: 0.23, z: 0.18, sep: 0.07, r: 0.04, mouth: 'o', zAt: ellZ(0.19, 0.19, 0.19, 0.2) }));
    return merge(p);
  },
  clown() {
    const p: Geo[] = [];
    const stripes = (v: THREE.Vector3, o: THREE.Color) => {
      const z = v.z;
      const white = Math.abs(z - 0.06) < 0.022 || Math.abs(z + 0.06) < 0.02;
      o.set(white ? '#ffffff' : '#ff8a3c');
      if (v.y < -0.06) o.lerp(C('#ffd0a8'), 0.5);
    };
    p.push(at(paintFn(ell(0.065, 0.1, 0.16), stripes), 0, 0.15, 0));
    p.push(at(paint(ell(0.012, 0.07, 0.07), '#ff8a3c'), 0, 0.17, -0.18));
    p.push(at(paint(ell(0.01, 0.04, 0.06), '#ff9a50'), 0, 0.26, -0.02));
    for (const s of [-1, 1]) p.push(at(paint(ell(0.01, 0.035, 0.04), '#ffb070'), s * 0.065, 0.12, 0.05, 0, 0, s * 0.4));
    p.push(...face({ y: 0.17, z: 0.14, sep: 0.032, r: 0.024, zAt: ellZ(0.065, 0.1, 0.16, 0.15) }));
    return merge(p);
  },
  ray() {
    const p: Geo[] = [];
    const wing = new THREE.SphereGeometry(1, 40, 20).scale(0.48, 0.07, 0.36);
    const pos = wing.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setZ(i, z - Math.abs(x) * 0.35 + 0.08);
      pos.setY(i, pos.getY(i) + Math.abs(x) * Math.abs(x) * 0.25);
    }
    wing.computeVertexNormals();
    p.push(at(paint(wing, '#f6cf7c', '#fff4dc'), 0, 0.2, 0));
    p.push(at(paint(cyl(0.012, 0.004, 0.55, 8), '#e6b45e'), 0, 0.2, -0.5, PI / 2, 0, 0));
    for (let i = 0; i < 6; i++) p.push(at(paint(sph(0.025, 10, 8), '#ffe9b0'), Math.sin(i * 2.3) * 0.2, 0.26, -0.1 + Math.cos(i * 1.7) * 0.12));
    // 눈은 위에 — 위에서 보면 웃는다
    p.push(...face({ y: 0.27, z: 0.18, sep: 0.07, r: 0.035 }));
    return merge(p);
  },
  starfish() {
    const p: Geo[] = [];
    p.push(at(paint(ell(0.08, 0.04, 0.08), '#ffa66b', '#f07f4a'), 0, 0.035, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      const g = paint(ell(0.05, 0.032, 0.13), '#ffb27a', '#f0784a');
      g.translate(0, 0, 0.11);
      g.rotateY(a);
      p.push(at(g, 0, 0.03, 0));
      for (let k = 0; k < 3; k++) p.push(at(paint(sph(0.012, 8, 6), '#fff0c8'), Math.sin(a) * (0.07 + k * 0.05), 0.065 - k * 0.006, Math.cos(a) * (0.07 + k * 0.05)));
    }
    // 위를 보는 얼굴
    const f = face({ y: 0, z: 0, sep: 0.03, r: 0.02 });
    for (const g of f) { g.rotateX(-PI / 2); g.translate(0, 0.07, 0.0); p.push(g); }
    return merge(p);
  },
  conch() {
    const p: Geo[] = [];
    spiral(p, '#ffd9b8', '#ff9fb2', 0.18, 0);
    p.push(at(paint(ell(0.07, 0.05, 0.03), '#ffe7f0', '#ffb5c9'), 0, 0.07, 0.13));
    p.push(...face({ y: 0.08, z: 0.15, sep: 0.03, r: 0.018 }));
    return merge(p);
  },
  nudi() {
    const p: Geo[] = [];
    p.push(at(paint(ell(0.06, 0.05, 0.16), '#a98bff', '#6a4fe0'), 0, 0.05, 0));
    p.push(at(paint(ell(0.075, 0.012, 0.17), '#ffffff', '#e9e2ff'), 0, 0.012, 0));
    for (let i = 0; i < 14; i++) {
      const z = -0.12 + (i % 7) * 0.035, s = i < 7 ? -1 : 1;
      p.push(at(paint(cone(0.016, 0.07, 10), '#ffcf5a', '#ff7a3c'), s * 0.035, 0.11, z, 0, 0, s * -0.4));
    }
    for (const s of [-1, 1]) p.push(at(paint(cap(0.01, 0.06, 4, 8), '#ffb03c'), s * 0.025, 0.12, 0.12, 0.3, 0, s * -0.2));
    p.push(...face({ y: 0.05, z: 0.15, sep: 0.03, r: 0.018, zAt: ellZ(0.06, 0.05, 0.16, 0.05) }));
    return merge(p);
  },
  squirt() {
    const p: Geo[] = [];
    p.push(at(paint(ell(0.12, 0.15, 0.12), '#ff9070', '#e05050'), 0, 0.15, 0));
    for (let i = 0; i < 22; i++) {
      const y = 1 - (i + 0.5) / 22 * 1.5, rr = Math.sqrt(1 - y * y), th = i * 2.39996;
      if (Math.sin(th) * rr > 0.6 && Math.abs(y) < 0.5) continue;
      p.push(at(paint(sph(0.03, 12, 10), '#ffb08a', '#ff7a5a'), Math.cos(th) * rr * 0.11, 0.15 + y * 0.14, Math.sin(th) * rr * 0.11));
    }
    for (const [x, ry] of [[-0.05, 0.3], [0.05, -0.2]]) {
      p.push(at(paint(cyl(0.035, 0.04, 0.08, 14), '#ffb08a', '#ff8060'), x, 0.3, 0, 0, 0, ry));
      p.push(at(paint(torus(0.032, 0.012, 8, 16).rotateX(PI / 2), '#ffd0b8'), x - ry * 0.04, 0.34, 0));
    }
    p.push(...face({ y: 0.15, z: 0.12, sep: 0.04, r: 0.026, zAt: ellZ(0.12, 0.15, 0.12, 0.15) }));
    return merge(p);
  },
};

function octo(c1: string, c2: string, c3: string, s: number): Geo {
  const p: Geo[] = [];
  p.push(at(paint(ell(0.2, 0.21, 0.19), c1, c2), 0, 0.3, -0.02));
  p.push(at(paint(sph(0.03, 12, 10), '#ffffff'), -0.08, 0.44, 0.05));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + PI / 8;
    tentacle(p, Math.sin(a) * 0.1, 0.13, Math.cos(a) * 0.1 - 0.02, a, 0.3, 0.05, c1, c3, 1.2, 0.35);
  }
  p.push(...face({ y: 0.27, z: 0.16, sep: 0.07, r: 0.04, mouth: 'o', zAt: ellZ(0.2, 0.21, 0.19, 0.3, -0.02) }));
  const g = merge(p);
  g.scale(s, s, s);
  return g;
}

function seahorse(c1: string, c2: string, c3: string): Geo {
  const p: Geo[] = [];
  p.push(at(paint(ell(0.08, 0.13, 0.085), c1, c2), 0, 0.3, 0, 0.15, 0, 0));
  p.push(at(paint(ell(0.06, 0.1, 0.03), c3), 0, 0.3, 0.06, 0.15, 0, 0));
  for (let i = 0; i < 5; i++) p.push(at(paint(torus(0.075 - i * 0.006, 0.008, 6, 20).rotateX(PI / 2), c2), 0, 0.22 + i * 0.04, -0.005));
  p.push(at(paint(sph(0.08), c1, c2), 0, 0.47, 0.02));
  p.push(at(paint(cyl(0.022, 0.03, 0.09, 12), c1), 0, 0.45, 0.11, PI / 2, 0, 0));
  p.push(at(paint(sph(0.026, 12, 10), c1), 0, 0.45, 0.155));
  for (let i = 0; i < 3; i++) p.push(at(paint(cone(0.018, 0.05, 8), c2), 0, 0.555 - i * 0.02, -0.02 - i * 0.04, -0.5 - i * 0.3, 0, 0));
  p.push(at(paint(torus(0.06, 0.028, 10, 24, PI * 1.6), c1, c2), 0, 0.13, -0.03, 0, PI / 2, PI * 0.2));
  p.push(at(paint(ell(0.008, 0.05, 0.04), c3), 0, 0.33, -0.09));
  p.push(...face({ y: 0.49, z: 0.07, sep: 0.035, r: 0.022, zAt: ellZ(0.08, 0.08, 0.08, 0.47, 0.02) }));
  return merge(p);
}

function clam(out1: string, out2: string, inner: string, pearl: boolean, r: number): Geo {
  const p: Geo[] = [];
  const rib = (a: string, b: string) => (v: THREE.Vector3, o: THREE.Color) => { o.copy(C(a)).lerp(C(b), 0.5 + 0.5 * Math.cos(Math.atan2(v.x, v.z + r) * 14)); };
  const bot = new THREE.SphereGeometry(1, 40, 20, 0, PI * 2, PI / 2, PI / 2).scale(r, r * 0.4, r * 0.85);
  p.push(at(paintFn(bot, rib(out1, out2)), 0, r * 0.4, 0));
  p.push(at(paint(ell(r * 0.92, r * 0.05, r * 0.78), inner, '#f3dcff'), 0, r * 0.39, 0));
  const top = new THREE.SphereGeometry(1, 40, 20, 0, PI * 2, 0, PI / 2).scale(r, r * 0.4, r * 0.85);
  top.translate(0, 0, r * 0.85);
  p.push(at(paintFn(top, rib(out1, out2)), 0, r * 0.42, -r * 0.85, -0.75, 0, 0));
  const inTop = new THREE.SphereGeometry(1, 32, 12, 0, PI * 2, PI / 2 + 0.05, PI / 2 - 0.05).scale(r * 0.92, r * 0.25, r * 0.78);
  inTop.translate(0, 0, r * 0.85);
  p.push(at(paint(inTop, inner, '#ead6ff'), 0, r * 0.44, -r * 0.85, -0.75, 0, 0));
  if (pearl) p.push(at(paint(sph(r * 0.3), '#ffffff', '#ffe6f4'), 0, r * 0.62, -r * 0.1));
  p.push(...face({ y: r * 0.5, z: r * 0.8, sep: r * 0.28, r: r * 0.13 }));
  return merge(p);
}

function spiral(p: Geo[], c1: string, c2: string, s: number, z0: number) {
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const r = s * (0.55 - t * 0.42);
    const a = t * PI * 3;
    p.push(at(paint(sph(r, 24, 18), i % 2 ? c1 : c2, c1), Math.cos(a) * s * 0.18 * (1 - t), s * 0.5 + t * s * 0.9, z0 - t * s * 0.6 + Math.sin(a) * s * 0.1));
  }
  p.push(at(paint(cone(s * 0.12, s * 0.35, 12), c2), 0, s * 1.55, z0 - s * 0.62, -0.5, 0, 0));
}

function crab(c1: string, c2: string, k: number): Geo {
  const p: Geo[] = [];
  p.push(at(paint(ell(0.22, 0.11, 0.16), c1, c2), 0, 0.12, 0));
  p.push(at(paint(ell(0.2, 0.04, 0.14), '#ffe0c8'), 0, 0.06, 0.01));
  for (let i = 0; i < 5; i++) p.push(at(paint(sph(0.018, 10, 8), '#ffc4a8'), -0.12 + i * 0.06, 0.2, -0.04 + Math.abs(i - 2) * -0.015));
  for (const s of [-1, 1]) {
    p.push(at(paint(cap(0.03, 0.08, 4, 10), c1), s * 0.22, 0.12, 0.1, 0, 0, s * 1.2));
    p.push(at(paint(ell(0.08, 0.06, 0.07), c1, c2), s * 0.3, 0.15, 0.2));
    p.push(at(paint(ell(0.03, 0.025, 0.05), '#ffd2bd'), s * 0.33, 0.14, 0.27, 0, s * -0.5, 0));
    for (let j = 0; j < 3; j++) p.push(at(paint(cap(0.02, 0.12, 4, 10), c1), s * 0.25, 0.06, -0.06 + j * 0.06, 0, j * 0.2 - 0.2, s * 1.0));
  }
  eyeStalk(p, -0.06, 0.18, 0.08, 0.07, 0.035, c1);
  eyeStalk(p, 0.06, 0.18, 0.08, 0.07, 0.035, c1);
  p.push(at(paint(torus(0.035, 0.009, 6, 12, PI), '#7a2c3a'), 0, 0.125, 0.155, 0, 0, PI));
  for (const s of [-1, 1]) p.push(at(paint(ell(0.035, 0.02, 0.01), '#ffb3c8'), s * 0.1, 0.12, 0.15));
  const g = merge(p);
  g.scale(k, k, k);
  return g;
}

function jelly(c1: string, c2: string, c3: string, clover = false): Geo {
  const p: Geo[] = [];
  const dome = new THREE.SphereGeometry(1, 40, 20, 0, PI * 2, 0, PI * 0.55).scale(0.2, 0.17, 0.2);
  p.push(at(paint(dome, c3, c1), 0, 0.35, 0));
  p.push(at(paint(ell(0.19, 0.035, 0.19), c1, c2), 0, 0.33, 0));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    p.push(at(paint(ell(0.035, 0.028, 0.035, 14, 10), c3, c1), Math.cos(a) * 0.19, 0.325, Math.sin(a) * 0.19));
  }
  if (clover) for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    p.push(at(paint(torus(0.035, 0.012, 8, 20).rotateX(PI / 2), '#b39cff'), Math.cos(a) * 0.07, 0.49, Math.sin(a) * 0.07));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    for (let k = 0; k < 6; k++) {
      p.push(at(paint(sph(0.022 - k * 0.002, 10, 8), c2, c1), Math.cos(a) * 0.12 + Math.sin(k * 1.3 + i) * 0.025, 0.28 - k * 0.055, Math.sin(a) * 0.12));
    }
  }
  for (let k = 0; k < 4; k++) p.push(at(paint(ell(0.03, 0.04, 0.03, 12, 10), c3, c2), Math.sin(k * 2) * 0.03, 0.27 - k * 0.07, 0));
  p.push(...face({ y: 0.4, z: 0.17, sep: 0.06, r: 0.03, zAt: (x, y) => { const k = 1 - (x * x) / 0.04 - ((y - 0.35) ** 2) / 0.0289; return 0.2 * Math.sqrt(Math.max(0.02, k)); } }));
  return merge(p);
}

const cache = new Map<string, Geo>();
/** 모델 지오메트리(공유) */
export function seaModel(key: string): Geo {
  let g = cache.get(key);
  if (!g) {
    g = (builders[key] ?? builders.starfish)();
    g.userData.shared = true;
    cache.set(key, g);
  }
  return g;
}

export const MODEL_KEYS = Object.keys(builders);
