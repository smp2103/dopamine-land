// hidden 모델 도구: 정점색 부품을 하나로 굽는 Bake(메시 하나 = 그리기 한 번) · 공유 재질 · 둥근 기본 도형.
// 공유 지오메트리·재질·텍스처는 userData.shared = true(청크가 버릴 때 dispose 하지 않는다) — 모듈 전역 캐시에만 붙인다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type Geo = THREE.BufferGeometry;
export type Tint = string | ((p: THREE.Vector3, out: THREE.Color) => void);
export interface Put { p?: [number, number, number]; r?: [number, number, number]; s?: number | [number, number, number] }

const tmpC = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

/** 부품을 정점색으로 칠해 모았다가 하나로 합친다 */
export class Bake {
  private parts: Geo[] = [];
  add(geo: Geo, color: Tint, o: Put = {}): this {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      if (typeof color === 'string') tmpC.set(color);
      else { v.fromBufferAttribute(pos, i); color(v, tmpC); }
      col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const s = o.s ?? 1;
    _s.set(...(typeof s === 'number' ? [s, s, s] as [number, number, number] : s));
    _e.set(...(o.r ?? [0, 0, 0]));
    _q.setFromEuler(_e);
    _p.set(...(o.p ?? [0, 0, 0]));
    g.applyMatrix4(_m.compose(_p, _q, _s));
    this.parts.push(g);
    geo.dispose();
    return this;
  }
  get empty() { return this.parts.length === 0; }
  /** shared 는 모듈 전역 캐시(조개·구슬·블록)에만 true — 기본은 개체 전용(청크가 버릴 때 함께 dispose) */
  build(shared = false): Geo {
    const g = this.parts.length ? mergeGeometries(this.parts, false)! : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    g.userData.shared = shared;
    return g;
  }
}

// ───────────── 기본 도형 ─────────────
export const sph = (r: number, w = 28, h = 18) => new THREE.SphereGeometry(r, w, h);
export const ell = (rx: number, ry: number, rz: number, w = 28, h = 18) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
export const cyl = (r0: number, r1: number, h: number, rs = 24, open = false) => new THREE.CylinderGeometry(r0, r1, h, rs, 1, open);
export const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 8, 16);
export const rbox = (w: number, h: number, d: number, r = 0.12, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
export const tor = (R: number, r: number, rs = 12, ts = 40, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, rs, ts, arc);
export const cone = (r: number, h: number, rs = 24) => new THREE.ConeGeometry(r, h, rs);
export const dome = (r: number, w = 32, h = 12) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2);

/** 울퉁불퉁 돌덩이(정점을 결정적으로 흔든 구) */
export function lump(r: number, rnd: () => number, amp = 0.22, w = 18, h = 12): Geo {
  const g = new THREE.SphereGeometry(r, w, h);
  const p = g.attributes.position, v = new THREE.Vector3();
  // 같은 자리 정점(이음선)은 같은 값으로 흔들어 틈이 나지 않게
  const seed = [rnd() * 10, rnd() * 10, rnd() * 10];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = Math.sin(v.x * 3.1 + seed[0]) * Math.sin(v.y * 2.7 + seed[1]) * Math.sin(v.z * 3.3 + seed[2]);
    v.multiplyScalar(r * (1 + amp * n));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** 위아래 두 색 그라데이션(부품 자기 좌표 y 기준) */
export const vgrad = (a: string, b: string, y0: number, y1: number): Tint => {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return (p, out) => out.copy(ca).lerp(cb, Math.max(0, Math.min(1, (p.y - y0) / (y1 - y0 || 1))));
};
/** 가로 줄무늬(자기 좌표 y) */
export const stripes = (a: string, b: string, period: number): Tint => {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return (p, out) => out.copy(Math.floor((p.y + 1000) / period) % 2 ? ca : cb);
};

// ───────────── 공유 재질 ─────────────
const mats = new Map<string, THREE.Material>();
const shared = <T extends THREE.Material>(m: T): T => { m.userData.shared = true; return m; };
/** 정점색 기본(살짝 반질) */
export function matBase(): THREE.MeshStandardMaterial {
  let m = mats.get('base') as THREE.MeshStandardMaterial | undefined;
  if (!m) { m = shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 })); mats.set('base', m); }
  return m;
}
/** 반짝 금속(금·보석) */
export function matShiny(): THREE.MeshStandardMaterial {
  let m = mats.get('shiny') as THREE.MeshStandardMaterial | undefined;
  if (!m) { m = shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.55 })); mats.set('shiny', m); }
  return m;
}
/** 스스로 빛나는(불빛·진주·별가루·수정) — 톤매핑 안 받음 */
export function matGlow(): THREE.MeshBasicMaterial {
  let m = mats.get('glow') as THREE.MeshBasicMaterial | undefined;
  if (!m) { m = shared(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); mats.set('glow', m); }
  return m;
}
/** 반투명 빛(물웅덩이·바람 띠) */
export function matSoft(opacity = 0.5): THREE.MeshBasicMaterial {
  const k = `soft:${opacity}`;
  let m = mats.get(k) as THREE.MeshBasicMaterial | undefined;
  if (!m) { m = shared(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); mats.set(k, m); }
  return m;
}
/** 한 개체 전용 사라지는 재질(신전) — 공유하지 않는다 */
export function matFade(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.02, transparent: true, opacity: 1 });
}

/** 메시 만들기(그림자 옵션) */
export function mesh(geo: Geo, mat: THREE.Material, o: { cast?: boolean; receive?: boolean; name?: string } = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  if (o.name) m.name = o.name;
  return m;
}

/** 이름표 캔버스 판(표지판 글씨) — 'Jua' 글꼴 */
export function labelTexture(lines: string[], o: { w?: number; h?: number; bg?: string; fg?: string; size?: number } = {}): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const W = o.w ?? 512, H = o.h ?? 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = o.bg ?? '#fff3dc';
  g.fillRect(0, 0, W, H);
  g.fillStyle = o.fg ?? '#5a3b28';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = o.size ?? 54;
  g.font = `${size}px Jua, sans-serif`;
  lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 청크·실내가 버릴 때: 공유 아닌 지오메트리·재질·재질 텍스처를 dispose */
export function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mt of mats) {
      if (mt.userData.shared) continue;
      const map = (mt as THREE.MeshStandardMaterial).map;
      if (map && !map.userData.shared) map.dispose();
      mt.dispose();
    }
  });
}
