// secrets 모델 도구 — 둥근 기본 도형을 정점 색으로 칠해 굽는다. 불투명(무광·말랑·반질·쇠·빛)은 정점마다 거칠기·쇠·빛 값을 실어
// 재질 하나(solid)로 합치고, 비치는 것(얼음·유리·물)만 따로 — 숨은 곳 하나가 메시 몇 개로만 그려진다.
// 기본 지오메트리·재질은 모듈 전역 공유(userData.shared = true → 청크를 버려도 dispose 안 함). 구운 지오메트리는 그 자리 것.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { pastelize } from '../../core/art';
import { rngFor } from '../../core/rng';

export type MatKind = 'matte' | 'soft' | 'gloss' | 'metal' | 'ice' | 'glass' | 'water' | 'glow';
export const MAT_KINDS: readonly MatKind[] = ['matte', 'soft', 'gloss', 'metal', 'ice', 'glass', 'water', 'glow'];
/** 한 재질(solid)로 합쳐지는 불투명 종류 → [거칠기, 쇠, 빛(1 = 그림자·조명 없이 제 색)] */
const SOLID: Partial<Record<MatKind, [number, number, number]>> = {
  matte: [0.8, 0, 0], soft: [0.96, 0, 0], gloss: [0.3, 0, 0], metal: [0.32, 0.6, 0], glow: [1, 0, 1],
};
/** 굽는 묶음(같은 묶음 = 메시 하나) */
const BUCKETS: ReadonlyArray<{ id: string; kinds: readonly MatKind[] }> = [
  { id: 'solid', kinds: ['matte', 'soft', 'gloss', 'metal', 'glow'] }, { id: 'ice', kinds: ['ice'] }, { id: 'glass', kinds: ['glass'] }, { id: 'water', kinds: ['water'] },
];

export const shared = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(o: T): T => { o.userData.shared = true; return o; };

/** 정점 속성 rm(거칠기·쇠·빛)을 읽는 표준 재질 — 불투명 조각을 한 번에 그린다 */
function solidMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 rm;\nvarying vec3 vRM;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvRM = rm;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, diffuseColor.rgb, vRM.z);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'secrets-solid-rm';
  return m;
}

let mats: Record<MatKind, THREE.Material> | null = null;
/** 공용 재질(정점 색). 불투명 종류는 모두 같은 solid 재질 */
export function kitMats(): Record<MatKind, THREE.Material> {
  if (mats) return mats;
  const solid = shared(solidMaterial());
  mats = {
    matte: solid, soft: solid, gloss: solid, metal: solid, glow: solid,
    ice: shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.62, emissive: '#bfe9ff', emissiveIntensity: 0.18, depthWrite: false })),
    glass: shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true })),
    water: shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true })),
  };
  return mats;
}
let plain: Partial<Record<'glass' | 'water', THREE.MeshStandardMaterial>> = {};
/** 정점 색 없는 도형(알갱이·웅덩이)용 유리·물 재질 */
export function plainMat(kind: 'glass' | 'water'): THREE.MeshStandardMaterial {
  let m = plain[kind];
  if (!m) {
    m = shared((kitMats()[kind] as THREE.MeshStandardMaterial).clone());
    m.vertexColors = false;
    m.color.set(kind === 'glass' ? '#eefaff' : '#bfefff');
    plain = { ...plain, [kind]: m };
  }
  return m;
}

// ───────────── 기본 도형(공유) ─────────────
const cache = new Map<string, THREE.BufferGeometry>();
const memo = (k: string, f: () => THREE.BufferGeometry) => { let g = cache.get(k); if (!g) { g = shared(f()); cache.set(k, g); } return g; };

/** 울퉁불퉁 둥근 돌(시드별 8가지) — 구에 부드러운 잡음 */
function lumpGeo(seed: number, detail: number) {
  const g = new THREE.IcosahedronGeometry(0.5, detail);
  const r = rngFor(`secrets:lump:${seed}`);
  const k = [r() * 6, r() * 6, r() * 6, r() * 6];
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = 1 + 0.09 * Math.sin(v.x * 3.1 + k[0]) * Math.cos(v.z * 2.7 + k[1]) + 0.06 * Math.sin(v.y * 4.3 + k[2] + v.x * 2) + 0.04 * Math.cos(v.z * 5.1 + k[3]);
    v.multiplyScalar(0.5 * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export const G = {
  box: (r = 0.18) => memo(`box:${r}`, () => new RoundedBoxGeometry(1, 1, 1, 3, r)),
  sphere: () => memo('sph', () => new THREE.SphereGeometry(0.5, 20, 14)),
  sphereLo: () => memo('sphlo', () => new THREE.SphereGeometry(0.5, 12, 8)),
  hemi: () => memo('hemi', () => new THREE.SphereGeometry(0.5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
  cyl: (seg = 18) => memo(`cyl:${seg}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg)),
  /** 위가 좁은 원기둥(위 반지름 비율 t) */
  taper: (t: number, seg = 18) => memo(`tap:${t}:${seg}`, () => new THREE.CylinderGeometry(0.5 * t, 0.5, 1, seg)),
  cone: (seg = 16) => memo(`cone:${seg}`, () => new THREE.ConeGeometry(0.5, 1, seg)),
  torus: (tube = 0.12, arc = Math.PI * 2) => memo(`tor:${tube}:${arc}`, () => new THREE.TorusGeometry(0.5, tube, 8, 28, arc)),
  capsule: () => memo('cap', () => new THREE.CapsuleGeometry(0.5, 1, 4, 12)),
  disc: (seg = 28) => memo(`disc:${seg}`, () => new THREE.CircleGeometry(0.5, seg).rotateX(-Math.PI / 2)),
  ring: (inner = 0.35) => memo(`ring:${inner}`, () => new THREE.RingGeometry(inner, 0.5, 32).rotateX(-Math.PI / 2)),
  plane: () => memo('plane', () => new THREE.PlaneGeometry(1, 1)),
  /** 반원통 막(물 커튼) — 지름 1 · 높이 1, 앞(+z)으로 볼록, 위아래 열림 */
  sheet: () => memo('sheet', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 6, true, -Math.PI / 2, Math.PI)),
  /** 울퉁불퉁 돌(variant 0..7) */
  lump: (variant = 0, detail = 2) => memo(`lump:${variant & 7}:${detail}`, () => lumpGeo(variant & 7, detail)),
  /** 납작 별 */
  star: () => memo('star', () => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.22 : 0.5;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 }).translate(0, 0, -0.11);
  }),
  /** 납작 하트 */
  heart: () => memo('heart', () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.45);
    s.bezierCurveTo(-0.55, -0.05, -0.5, 0.42, -0.22, 0.42);
    s.bezierCurveTo(-0.06, 0.42, 0, 0.3, 0, 0.22);
    s.bezierCurveTo(0, 0.3, 0.06, 0.42, 0.22, 0.42);
    s.bezierCurveTo(0.5, 0.42, 0.55, -0.05, 0, -0.45);
    return new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 }).translate(0, 0, -0.1);
  }),
  /** 초승달(납작) */
  crescent: () => memo('crescent', () => {
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
    const h = new THREE.Path(); h.absarc(0.22, 0.12, 0.42, 0, Math.PI * 2, true); s.holes.push(h);
    return new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 20 }).translate(0, 0, -0.08);
  }),
  /** 뾰족 수정(육각 기둥 + 뾰족 끝) — 밑동이 0 */
  crystal: () => memo('crystal', () => {
    const g = new THREE.CylinderGeometry(0.32, 0.4, 0.7, 6, 1);
    g.translate(0, 0.35, 0);
    const c = new THREE.ConeGeometry(0.32, 0.5, 6, 1);
    c.translate(0, 0.95, 0);
    const m = mergeGeometries([g.toNonIndexed(), c.toNonIndexed()], false)!;
    m.computeVertexNormals();
    return m;
  }),
};

type V3 = [number, number, number];
interface Piece { geo: THREE.BufferGeometry; kind: MatKind; color: THREE.Color; m: THREE.Matrix4 }

const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const colorCache = new Map<string, THREE.Color>();
/** 색(hex) → THREE.Color — 순수 검정·회색은 파스텔 규칙대로 바뀐다 */
export function col(c: string): THREE.Color {
  let v = colorCache.get(c);
  if (!v) { v = new THREE.Color(pastelize(c)); colorCache.set(c, v); }
  return v;
}

/**
 * 조각 모으기: add(도형, 재질, 색, 위치, 크기, 회전). push/pop 으로 부모 변환을 쌓는다.
 * bake() 는 묶음(solid·ice·glass·water)마다 하나씩 합친 Group 을 돌려준다.
 */
export class Builder {
  pieces: Piece[] = [];
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  /** 땅 높이(로컬 x, z → 뿌리 높이와의 차) — 주면 맨 위 단계 조각을 비탈에 앉힌다 */
  ground: ((x: number, z: number) => number) | null = null;
  get top() { return this.stack[this.stack.length - 1]; }
  push(p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: number | V3 = 1) {
    const m = new THREE.Matrix4().compose(tmpP.set(...p), tmpQ.setFromEuler(tmpE.set(...r)), typeof s === 'number' ? tmpS.setScalar(s) : tmpS.set(...s));
    this.stack.push(this.top.clone().multiply(m));
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  add(geo: THREE.BufferGeometry, kind: MatKind, color: string, p: V3 = [0, 0, 0], s: number | V3 = 1, r: V3 = [0, 0, 0]) {
    const gy = this.ground && this.stack.length === 1 ? this.ground(p[0], p[2]) : 0;
    const m = new THREE.Matrix4().compose(tmpP.set(p[0], p[1] + gy, p[2]), tmpQ.setFromEuler(tmpE.set(...r)), typeof s === 'number' ? tmpS.setScalar(s) : tmpS.set(...s));
    this.pieces.push({ geo, kind, color: col(color), m: this.top.clone().multiply(m) });
    return this;
  }
  /** 변환 행렬로 바로 놓기(부모 변환은 곱한다) */
  addMatrix(geo: THREE.BufferGeometry, kind: MatKind, color: string | THREE.Color, m: THREE.Matrix4) {
    this.pieces.push({ geo, kind, color: typeof color === 'string' ? col(color) : color, m: this.top.clone().multiply(m) });
    return this;
  }
  /** 두 점을 잇는 막대(원기둥) */
  rod(a: V3, b: V3, r: number, kind: MatKind, color: string) {
    const ga = this.ground && this.stack.length === 1 ? this.ground(a[0], a[2]) : 0;
    const va = new THREE.Vector3(a[0], a[1] + ga, a[2]), vb = new THREE.Vector3(b[0], b[1] + ga, b[2]);
    const d = vb.clone().sub(va), len = d.length();
    if (len < 1e-4) return this;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    const mid = va.add(vb).multiplyScalar(0.5);
    const g = this.ground;
    this.ground = null;
    try { return this.add(G.cyl(10), kind, color, [mid.x, mid.y, mid.z], [r * 2, len, r * 2], [e.x, e.y, e.z]); } finally { this.ground = g; }
  }
  get empty() { return this.pieces.length === 0; }
  /** 묶음(solid · ice · glass · water)마다 하나로 굽기 */
  bake(name = 'baked', o: { shadow?: boolean } = {}): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    const M = kitMats();
    for (const bk of BUCKETS) {
      const ps = this.pieces.filter((p) => bk.kinds.includes(p.kind));
      if (!ps.length) continue;
      const geos = ps.map((p) => paint(p.geo, p.m, p.color, SOLID[p.kind] ?? null));
      const g = mergeGeometries(geos, false);
      for (const x of geos) x.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, M[bk.kinds[0]]);
      mesh.name = `${name}:${bk.id}`;
      const solid = bk.id === 'solid';
      mesh.castShadow = o.shadow !== false && solid;
      mesh.receiveShadow = solid;
      if (!solid) mesh.renderOrder = 3;
      out.add(mesh);
    }
    return out;
  }
  /** 구워서 메시 하나만(불투명만 있을 때 — 떼 지어 그리기용 지오메트리) */
  bakeGeometry(): THREE.BufferGeometry | null {
    const geos = this.pieces.map((p) => paint(p.geo, p.m, p.color, SOLID[p.kind] ?? null));
    const g = geos.length ? mergeGeometries(geos, false) : null;
    for (const x of geos) x.dispose();
    g?.computeBoundingSphere();
    return g;
  }
}

/** 변환을 굽고 정점 색을 칠한 비색인 사본(position·normal·color 만) */
function paint(src: THREE.BufferGeometry, m: THREE.Matrix4, c: THREE.Color, rm: [number, number, number] | null): THREE.BufferGeometry {
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
  if (rm) {
    const ra = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { ra[i * 3] = rm[0]; ra[i * 3 + 1] = rm[1]; ra[i * 3 + 2] = rm[2]; }
    g.setAttribute('rm', new THREE.BufferAttribute(ra, 3));
  }
  return g;
}

/** 공유가 아닌 지오메트리·재질·텍스처만 버린다(InstancedMesh 는 instanceMatrix 버퍼도) */
export function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    if ((c as THREE.InstancedMesh).isInstancedMesh) (c as THREE.InstancedMesh).dispose();
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

const texCache = new Map<string, THREE.Texture | null>();
/** 그림 텍스처(같은 key 는 한 번만 그린다, 공유). 캔버스가 없으면 null */
export function paintedTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture | null {
  if (texCache.has(key)) return texCache.get(key)!;
  const c = makeCanvas(w, h);
  let tex: THREE.Texture | null = null;
  if (c) {
    draw(c.getContext('2d')!, w, h);
    tex = shared(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }
  texCache.set(key, tex);
  return tex;
}

/** 그림판(평면) 메시 — 텍스처가 없으면(테스트) 색 판 */
export function picturePlane(key: string, w: number, h: number, pxW: number, pxH: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, o: { transparent?: boolean; glow?: boolean; color?: string } = {}): THREE.Mesh {
  const tex = paintedTexture(key, pxW, pxH, draw);
  const mat = o.glow
    ? new THREE.MeshBasicMaterial({ map: tex, color: o.color ?? '#ffffff', transparent: o.transparent ?? true, depthWrite: !(o.transparent ?? true), toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true })
    : new THREE.MeshStandardMaterial({ map: tex, color: o.color ?? '#ffffff', roughness: 0.9, transparent: !!o.transparent, side: THREE.DoubleSide, forceSinglePass: true });
  const m = new THREE.Mesh(G.plane(), mat);
  m.scale.set(w, h, 1);
  m.name = `picture:${key}`;
  return m;
}

/** 둥근 표지판 글씨 그리기 */
export function drawSign(g: CanvasRenderingContext2D, W: number, H: number, lines: string[], o: { bg?: string; fg?: string; border?: string } = {}) {
  g.clearRect(0, 0, W, H);
  const r = H * 0.28;
  g.fillStyle = o.bg ?? '#fff8e8';
  g.strokeStyle = o.border ?? '#e2b97a';
  g.lineWidth = H * 0.06;
  g.beginPath();
  g.roundRect(4, 4, W - 8, H - 8, r);
  g.fill(); g.stroke();
  g.fillStyle = o.fg ?? '#4a3b2a';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = Math.max(1, lines.length);
  lines.forEach((t, i) => {
    const size = i === 0 ? H * (n > 1 ? 0.34 : 0.48) : H * 0.22;
    g.font = `${size}px Jua, 'Apple SD Gothic Neo', sans-serif`;
    const y = n === 1 ? H / 2 : H * (0.34 + (i * 0.38) / Math.max(1, n - 1));
    g.fillText(t, W / 2, y, W * 0.9);
  });
}

// ───────────── 공유 알갱이(반짝이·거품·눈송이) ─────────────
let sparkGeo: THREE.BufferGeometry | null = null;
/** 반짝이 하나(작은 팔면체) — InstancedMesh 용 */
export function sparkGeometry() { return (sparkGeo ??= shared(new THREE.OctahedronGeometry(0.5, 0))); }
const sparkMats = new Map<string, THREE.MeshBasicMaterial>();
/** 반짝이·빛 재질(색별 공유, 살짝 투명) */
export function glowMat(c: string, opacity = 0.9): THREE.MeshBasicMaterial {
  const k = `${c}:${opacity}`;
  let m = sparkMats.get(k);
  if (!m) { m = shared(new THREE.MeshBasicMaterial({ color: pastelize(c), transparent: opacity < 1, opacity, depthWrite: false, toneMapped: false })); sparkMats.set(k, m); }
  return m;
}

/** 위아래 둥실 + 빙글(알갱이 떼) — 매 프레임 setMatrixAt. 떼 둘레 구로 화면 밖이면 안 그린다 */
export class Motes {
  readonly mesh: THREE.InstancedMesh;
  private base: Array<{ x: number; y: number; z: number; s: number; ph: number; sp: number; rise: number }> = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sv = new THREE.Vector3();
  private pv = new THREE.Vector3();
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, pts: Array<{ x: number; y: number; z: number; s: number }>, rnd: () => number, private mode: 'float' | 'rise' = 'float', private height = 2) {
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
    this.mesh.count = pts.length;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    for (const p of pts) this.base.push({ ...p, ph: rnd() * Math.PI * 2, sp: 0.6 + rnd() * 0.8, rise: rnd() });
    // 움직이는 범위까지 넉넉한 구(매 프레임 다시 재지 않는다)
    const box = new THREE.Box3();
    for (const p of pts) box.expandByPoint(this.pv.set(p.x, p.y, p.z)).expandByPoint(this.pv.set(p.x, p.y + (mode === 'rise' ? height : 0.3), p.z));
    if (!pts.length) box.expandByPoint(this.pv.set(0, 0, 0));
    this.mesh.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    this.mesh.boundingSphere.radius += 0.8;
    this.update(0);
  }
  /** keep(i) 가 false 인 알갱이는 숨긴다(크기 0) */
  update(t: number, amp = 1, keep?: (i: number) => boolean) {
    const sv = this.sv, pv = this.pv;
    this.base.forEach((b, i) => {
      let y = b.y;
      let s = keep && !keep(i) ? 0 : b.s * amp;
      if (this.mode === 'rise') {
        const u = (b.rise + t * 0.18 * b.sp) % 1;
        y = b.y + u * this.height;
        s *= Math.sin(u * Math.PI) * 1.1;
      } else y = b.y + Math.sin(t * b.sp + b.ph) * 0.25;
      this.e.set(t * b.sp, t * 0.7 * b.sp + b.ph, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(pv.set(b.x + (this.mode === 'rise' ? Math.sin(t * 2 * b.sp + b.ph) * 0.08 : 0), y, b.z), this.q, sv.setScalar(Math.max(0.0001, s)));
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
