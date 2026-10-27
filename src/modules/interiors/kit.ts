// 실내 모델 도구: 둥근 기본 도형 + 정점 색으로 칠하고, 재질 종류(matte·gloss·glass·glow·metal)마다 하나로 굽는다(draw call 절약).
// 가구·방·전시대는 전부 이걸로 만든다 → 가구 40개를 놓아도 굽고 나면 재질 수만큼만 그린다.
// 기본 지오메트리·재질은 모듈 전역 공유(userData.shared). 구운 지오메트리는 그 방 것이라 방을 버릴 때 dispose 한다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { pastelize } from '../../core/art';

export type MatKind = 'matte' | 'gloss' | 'glass' | 'glow' | 'metal' | 'cloth';
export const MAT_KINDS: readonly MatKind[] = ['matte', 'cloth', 'gloss', 'metal', 'glass', 'glow'];

const shared = <T extends THREE.BufferGeometry | THREE.Material>(o: T): T => { o.userData.shared = true; return o; };

let mats: Record<MatKind, THREE.Material> | null = null;
/** 공용 재질(정점 색) */
export function kitMats(): Record<MatKind, THREE.Material> {
  if (mats) return mats;
  mats = {
    matte: shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 })),
    cloth: shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })),
    gloss: shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0 })),
    metal: shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.65 })),
    glass: shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })),
    glow: shared(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
  };
  return mats;
}

// ───────────── 기본 도형(공유) ─────────────
const cache = new Map<string, THREE.BufferGeometry>();
const memo = (k: string, f: () => THREE.BufferGeometry) => { let g = cache.get(k); if (!g) { g = shared(f()); cache.set(k, g); } return g; };
/** 둥근 상자(가로·높이·깊이 1 → scale 로 늘린다 — 모서리 반지름은 r 비율) */
export const G = {
  box: (r = 0.18) => memo(`box:${r}`, () => new RoundedBoxGeometry(1, 1, 1, 3, r)),
  sphere: () => memo('sph', () => new THREE.SphereGeometry(0.5, 22, 16)),
  hemi: () => memo('hemi', () => new THREE.SphereGeometry(0.5, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
  cyl: (seg = 22) => memo(`cyl:${seg}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg)),
  /** 위가 좁은 원기둥(위 반지름 비율 t) */
  taper: (t: number) => memo(`tap:${t}`, () => new THREE.CylinderGeometry(0.5 * t, 0.5, 1, 22)),
  cone: () => memo('cone', () => new THREE.ConeGeometry(0.5, 1, 20)),
  torus: (tube = 0.12, arc = Math.PI * 2) => memo(`tor:${tube}:${arc}`, () => new THREE.TorusGeometry(0.5, tube, 10, 32, arc)),
  capsule: () => memo('cap', () => new THREE.CapsuleGeometry(0.5, 1, 6, 14)),
  // 낮은 다각형판(박물관처럼 조각이 아주 많은 곳 — 삼각형 예산) : 둥근 상자 108 · 구 216 · 캡슐 ~130
  boxLo: (r = 0.18) => memo(`boxlo:${r}`, () => new RoundedBoxGeometry(1, 1, 1, 1, r)),
  sphereLo: () => memo('sphlo', () => new THREE.SphereGeometry(0.5, 14, 9)),
  capsuleLo: () => memo('caplo', () => new THREE.CapsuleGeometry(0.5, 1, 3, 8)),
  disc: () => memo('disc', () => new THREE.CircleGeometry(0.5, 28).rotateX(-Math.PI / 2)),
  ring: (inner = 0.35) => memo(`ring:${inner}`, () => new THREE.RingGeometry(inner, 0.5, 32).rotateX(-Math.PI / 2)),
  plane: () => memo('plane', () => new THREE.PlaneGeometry(1, 1)),
  /** 별(납작 5각) */
  star: () => memo('star', () => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.22 : 0.5;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 }).translate(0, 0, -0.125);
  }),
  /** 하트(납작) */
  heart: () => memo('heart', () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.45);
    s.bezierCurveTo(-0.55, -0.05, -0.5, 0.42, -0.22, 0.42);
    s.bezierCurveTo(-0.06, 0.42, 0, 0.3, 0, 0.22);
    s.bezierCurveTo(0, 0.3, 0.06, 0.42, 0.22, 0.42);
    s.bezierCurveTo(0.5, 0.42, 0.55, -0.05, 0, -0.45);
    return new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 }).translate(0, 0, -0.1);
  }),
};

type V3 = [number, number, number];
interface Piece { geo: THREE.BufferGeometry; kind: MatKind; color: THREE.Color; m: THREE.Matrix4 }

const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const colorCache = new Map<string, THREE.Color>();
/** 색 이름(hex) → THREE.Color(파스텔 규칙을 지킨다: 순수 검정·회색은 먹색·은은한 색으로) */
export function col(c: string): THREE.Color {
  let v = colorCache.get(c);
  if (!v) { v = new THREE.Color(pastelize(c)); colorCache.set(c, v); }
  return v;
}

/**
 * 조각 모으기: add(도형, 재질, 색, 위치, 회전, 크기). 부모 변환(push/pop)을 쌓을 수 있다.
 * bake() 로 재질마다 하나씩 합친 Group 을 돌려준다.
 */
export class Builder {
  pieces: Piece[] = [];
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  /** 지금 부모 변환 */
  get top() { return this.stack[this.stack.length - 1]; }
  push(p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: number | V3 = 1) {
    const m = new THREE.Matrix4().compose(tmpP.set(...p), tmpQ.setFromEuler(tmpE.set(...r)), typeof s === 'number' ? tmpS.setScalar(s) : tmpS.set(...s));
    this.stack.push(this.top.clone().multiply(m));
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  add(geo: THREE.BufferGeometry, kind: MatKind, color: string, p: V3 = [0, 0, 0], s: number | V3 = 1, r: V3 = [0, 0, 0]) {
    const m = new THREE.Matrix4().compose(tmpP.set(...p), tmpQ.setFromEuler(tmpE.set(...r)), typeof s === 'number' ? tmpS.setScalar(s) : tmpS.set(...s));
    this.pieces.push({ geo, kind, color: col(color), m: this.top.clone().multiply(m) });
    return this;
  }
  /** 다른 Builder 의 조각을 지금 변환 아래로 가져온다 */
  absorb(b: Builder) {
    for (const p of b.pieces) this.pieces.push({ ...p, m: this.top.clone().multiply(p.m) });
    return this;
  }
  get empty() { return this.pieces.length === 0; }
  /** 재질마다 하나로 굽기 */
  bake(name = 'baked', o: { shadow?: boolean } = {}): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    const M = kitMats();
    for (const kind of MAT_KINDS) {
      const ps = this.pieces.filter((p) => p.kind === kind);
      if (!ps.length) continue;
      const geos = ps.map((p) => paint(p.geo, p.m, p.color));
      const g = mergeGeometries(geos, false);
      for (const x of geos) x.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, M[kind]);
      mesh.name = `${name}:${kind}`;
      const sh = o.shadow !== false && kind !== 'glass' && kind !== 'glow';
      mesh.castShadow = sh;
      mesh.receiveShadow = kind !== 'glow';
      if (kind === 'glass') mesh.renderOrder = 3;
      out.add(mesh);
    }
    return out;
  }
}

/** 변환을 굽고 정점 색을 칠한 비색인 사본(position·normal·color 만) */
function paint(src: THREE.BufferGeometry, m: THREE.Matrix4, c: THREE.Color): THREE.BufferGeometry {
  const g0 = src.index ? src.toNonIndexed() : src.clone();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', g0.getAttribute('position').clone());
  const n = g0.getAttribute('normal');
  if (n) g.setAttribute('normal', n.clone()); else g.computeVertexNormals();
  g0.dispose();
  g.applyMatrix4(m);
  const cnt = g.getAttribute('position').count;
  const ca = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  return g;
}

/** 공유가 아닌 지오메트리·재질만 버린다 */
export function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mm = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(mm) ? mm : mm ? [mm] : []) {
      if (x.userData.shared) continue;
      const map = (x as THREE.MeshStandardMaterial).map;
      if (map && !map.userData.shared) map.dispose();
      x.dispose();
    }
  });
}

// ───────────── 캔버스 ─────────────
/** 브라우저면 캔버스, 테스트(document 없음)면 null */
export function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  try {
    const c = document.createElement('canvas');
    if (!c || typeof c.getContext !== 'function') return null;
    c.width = w; c.height = h;
    return c.getContext('2d') ? c : null;
  } catch { return null; }
}

/** 둥근 표지판 글씨 텍스처(박물관 동 이름·안내판). 캔버스가 없으면 null */
export function signTexture(lines: string[], o: { bg?: string; fg?: string; border?: string; w?: number; h?: number } = {}): THREE.CanvasTexture | null {
  const W = o.w ?? 512, H = o.h ?? 160;
  const c = makeCanvas(W, H);
  if (!c) return null;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  const r = H * 0.28;
  g.fillStyle = o.bg ?? '#fff8e8';
  g.strokeStyle = o.border ?? '#e2b97a';
  g.lineWidth = H * 0.06;
  g.beginPath();
  g.moveTo(r, 4); g.lineTo(W - r, 4); g.quadraticCurveTo(W - 4, 4, W - 4, r); g.lineTo(W - 4, H - r); g.quadraticCurveTo(W - 4, H - 4, W - r, H - 4);
  g.lineTo(r, H - 4); g.quadraticCurveTo(4, H - 4, 4, H - r); g.lineTo(4, r); g.quadraticCurveTo(4, 4, r, 4);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = o.fg ?? '#4a3b2a';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = Math.max(1, lines.length);
  lines.forEach((t, i) => {
    const size = i === 0 ? H * (n > 1 ? 0.36 : 0.5) : H * 0.22;
    g.font = `${size}px Jua, 'Apple SD Gothic Neo', sans-serif`;
    const y = n === 1 ? H / 2 : H * (0.36 + (i * 0.4) / Math.max(1, n - 1) * (n > 2 ? 1 : 0.95));
    g.fillText(t, W / 2, y, W * 0.9);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
