// 곤충 자리: 꽃 무더기 · 나무 그루터기 · 이끼 바위. 청크 하나의 자리들을 정점색 한 메시로 합친다(draw call 1).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BugIsland } from './data';

let PERCH_MAT: THREE.MeshPhysicalMaterial | null = null;
export function perchMat() {
  PERCH_MAT ??= new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.7, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#fff6ee'),
    emissive: '#000000',
  });
  return PERCH_MAT;
}

type ColorFn = (p: THREE.Vector3) => THREE.Color;
const C = (c: string) => new THREE.Color(c);

class Bag {
  geos: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, color: string | ColorFn, m: THREE.Matrix4, grad = 0.2) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    const local = (g.attributes.position as THREE.BufferAttribute).clone();
    g.applyMatrix4(m);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3(), lv = new THREE.Vector3();
    const span = Math.max(1e-4, bb.max.y - bb.min.y);
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      lv.fromBufferAttribute(local, i);
      const base = typeof color === 'string' ? C(color) : color(lv);
      const t = (v.y - bb.min.y) / span;
      const c = base.clone().multiplyScalar(1 - grad * 0.6).lerp(base.clone().lerp(white, grad * 0.6), t);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geos.push(g);
  }
  mesh(): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const g = mergeGeometries(this.geos, false);
    if (!g) return null;
    const m = new THREE.Mesh(g, perchMat());
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const SPH = new THREE.SphereGeometry(1, 24, 16);
const SPH_S = new THREE.SphereGeometry(1, 14, 10);

const FLOWER_COLORS: Record<BugIsland, string[][]> = {
  home: [['#ff9fc0', '#ffd84a'], ['#ffffff', '#ffd04a'], ['#ffe066', '#ff9a3a'], ['#c9a8ff', '#fff27a'], ['#ff8a8a', '#fff0a0']],
  islet: [['#ff9fc0', '#ffd84a'], ['#ffffff', '#ffd04a'], ['#8fd8ff', '#ffffff']],
  launch: [['#ffe066', '#ff9a3a'], ['#ffffff', '#ffd04a'], ['#8fd8ff', '#ffe066']],
  mushroom: [['#d7b8ff', '#fff3a8'], ['#9fe8ff', '#ffffff'], ['#ffb3e6', '#fff27a']],
  coral: [['#ff6a7a', '#ffe066'], ['#ff9fc0', '#ffffff'], ['#ffb04a', '#fff27a']],
  desert: [['#ff7a4a', '#ffe066'], ['#ff5a8a', '#fff0a0'], ['#ffd04a', '#ff8a3a']],
  dino: [['#ff6a3a', '#ffe066'], ['#ff4aa0', '#fff27a'], ['#ffd04a', '#ff6a3a']],
  ice: [['#eaf6ff', '#bfe0ff'], ['#ffffff', '#9fd0ff'], ['#d8e6ff', '#ffffff']],
};

/** 꽃 하나: 줄기 + 잎 둘 + 통통한 꽃잎 6장 + 동그란 수술. 머리 위 높이를 돌려준다 */
function flower(bag: Bag, x: number, y: number, z: number, h: number, petal: string, center: string, rot: number, s: number, tilt = 0) {
  const stem = new THREE.CylinderGeometry(0.022 * s, 0.03 * s, h, 8, 1);
  bag.add(stem, '#5cbf5f', M(x, y + h / 2, z, tilt * 0.5, 0, tilt * 0.3), 0.3);
  for (const sg of [-1, 1]) {
    bag.add(SPH_S.clone(), '#6fd06a', M(x + sg * 0.09 * s, y + h * 0.35, z, 0, rot + sg * 0.3, sg * 0.6, 0.11 * s, 0.025 * s, 0.05 * s), 0.35);
  }
  const hy = y + h, hx = x + Math.sin(tilt * 0.3) * h * 0.2, hz = z + Math.sin(tilt * 0.5) * h * 0.2;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    bag.add(SPH.clone(), petal, M(hx + Math.cos(a) * 0.075 * s, hy + 0.01, hz + Math.sin(a) * 0.075 * s, 0, -a, 0.18, 0.085 * s, 0.03 * s, 0.06 * s), 0.25);
  }
  bag.add(SPH.clone(), center, M(hx, hy + 0.025 * s, hz, 0, 0, 0, 0.05 * s, 0.035 * s, 0.05 * s), 0.3);
  return hy + 0.045 * s;
}

export interface PerchSpot {
  type: 'flower' | 'tree' | 'rock';
  x: number; y: number; z: number;
  theme: BugIsland;
  rnd: () => number;
}

export interface Anchor {
  pos: THREE.Vector3;
  /** 몸 위쪽 방향(그루터기 옆면이면 바깥쪽) */
  up: THREE.Vector3;
  /** 머리 방향 */
  fwd: THREE.Vector3;
}

/** 자리를 bag 에 그리고, 곤충이 앉을 곳을 돌려준다 */
export function addPerch(bag: Bag, p: PerchSpot): Anchor {
  const { x, y, z, rnd, theme } = p;
  if (p.type === 'flower') {
    const pal = FLOWER_COLORS[theme] ?? FLOWER_COLORS.home;
    const main = pal[Math.floor(rnd() * pal.length)];
    const top = flower(bag, x, y, z, 0.5 + rnd() * 0.12, main[0], main[1], rnd() * 6, 1.25);
    // 곁꽃 몇 송이(작게)
    const k = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < k; i++) {
      const a = rnd() * Math.PI * 2, r = 0.22 + rnd() * 0.25;
      const c = pal[Math.floor(rnd() * pal.length)];
      flower(bag, x + Math.cos(a) * r, y - 0.02, z + Math.sin(a) * r, 0.22 + rnd() * 0.2, c[0], c[1], rnd() * 6, 0.8 + rnd() * 0.3, (rnd() - 0.5) * 0.4);
    }
    // 밑동 풀 한 줌
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2;
      bag.add(new THREE.ConeGeometry(0.03, 0.22 + rnd() * 0.12, 6), '#6ccf5e', M(x + Math.cos(a) * 0.1, y + 0.08, z + Math.sin(a) * 0.1, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4), 0.4);
    }
    return { pos: new THREE.Vector3(x, top, z), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(Math.cos(rnd() * 6.28), 0, Math.sin(rnd() * 6.28)).normalize() };
  }
  if (p.type === 'tree') {
    const h = 0.75 + rnd() * 0.25, r = 0.34 + rnd() * 0.06;
    const bark = theme === 'ice' ? '#a8a0a8' : theme === 'desert' ? '#b0885a' : theme === 'mushroom' ? '#b0889a' : '#b9804e';
    const barkFn: ColorFn = (lp) => {
      const a = Math.atan2(lp.z, lp.x);
      const g = Math.sin(a * 9 + lp.y * 2) * 0.5 + 0.5;
      return C(bark).multiplyScalar(0.86 + g * 0.22);
    };
    bag.add(new THREE.CylinderGeometry(r * 0.94, r * 1.12, h, 28, 3), barkFn, M(x, y + h / 2 - 0.02, z), 0.25);
    // 뿌리 혹
    for (let i = 0; i < 4; i++) {
      const a = rnd() + (i / 4) * Math.PI * 2;
      bag.add(SPH.clone(), bark, M(x + Math.cos(a) * r * 0.95, y + 0.04, z + Math.sin(a) * r * 0.95, 0, -a, 0, 0.17, 0.12, 0.12), 0.2);
    }
    // 나이테 윗면
    const ringFn: ColorFn = (lp) => {
      const d = Math.hypot(lp.x, lp.z) / r;
      return Math.sin(d * 22) > 0.55 ? C('#d9a868') : C('#f3d6a0');
    };
    bag.add(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.04, 28, 1), ringFn, M(x, y + h - 0.01, z), 0.05);
    // 이끼 + 새싹
    const moss = theme === 'ice' ? '#f4fbff' : theme === 'desert' ? '#c8d86a' : '#7ad06a';
    bag.add(SPH.clone(), moss, M(x + r * 0.5, y + h + 0.02, z + r * 0.2, 0, 0, 0, r * 0.45, 0.07, r * 0.4), 0.3);
    const sa = rnd() * Math.PI * 2;
    const sx = x + Math.cos(sa) * r * 0.9, sz = z + Math.sin(sa) * r * 0.9;
    bag.add(new THREE.CylinderGeometry(0.015, 0.02, 0.2, 6), '#5cbf5f', M(sx, y + h * 0.55 + 0.1, sz, 0, 0, Math.cos(sa) * -0.5), 0.2);
    bag.add(SPH_S.clone(), '#7ad86a', M(sx + Math.cos(sa) * 0.06, y + h * 0.55 + 0.21, sz + Math.sin(sa) * 0.06, 0, -sa, 0.5, 0.08, 0.02, 0.045), 0.3);
    if (theme === 'mushroom' || rnd() < 0.35) {
      const ma = sa + 2.2;
      const mx = x + Math.cos(ma) * (r + 0.12), mz = z + Math.sin(ma) * (r + 0.12);
      bag.add(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 10), '#fff4e4', M(mx, y + 0.07, mz), 0.2);
      bag.add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), theme === 'mushroom' ? '#b07aff' : '#ff6a5a', M(mx, y + 0.13, mz, 0, 0, 0, 0.11, 0.08, 0.11), 0.35);
    }
    // 곤충은 옆면에(바깥을 등지고 위로 기어오르는 자세)
    const a = rnd() * Math.PI * 2;
    const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    return { pos: new THREE.Vector3(x + n.x * r * 1.0, y + h * 0.55, z + n.z * r * 1.0), up: n, fwd: new THREE.Vector3(0, 1, 0) };
  }
  // 바위: 둥근 돌 2~3 개(윗면 이끼/눈)
  const ice = theme === 'ice', sand = theme === 'desert';
  const stone = ice ? '#c8d8ea' : sand ? '#d8b88a' : theme === 'mushroom' ? '#a8a0c0' : '#a8b0b8';
  const topC = ice ? '#ffffff' : sand ? '#ecd2a0' : '#8ad06a';
  const rockFn: ColorFn = (lp) => (lp.y > 0.45 ? C(topC) : C(stone));
  const R = 0.38 + rnd() * 0.12;
  bag.add(SPH.clone(), rockFn, M(x, y + R * 0.4, z, 0, rnd() * 6, 0, R, R * 0.7, R * 0.85), 0.35);
  const k = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < k; i++) {
    const a = rnd() * Math.PI * 2, r2 = R * (0.4 + rnd() * 0.2);
    bag.add(SPH.clone(), rockFn, M(x + Math.cos(a) * R * 1.1, y + r2 * 0.35, z + Math.sin(a) * R * 1.1, 0, rnd() * 6, 0, r2, r2 * 0.7, r2 * 0.85), 0.35);
  }
  const a = rnd() * Math.PI * 2;
  const fwd = new THREE.Vector3(Math.cos(a + 1.2), 0, Math.sin(a + 1.2));
  return { pos: new THREE.Vector3(x + Math.cos(a) * (R + 0.18), y, z + Math.sin(a) * (R + 0.18)), up: new THREE.Vector3(0, 1, 0), fwd };
}

export { Bag };
