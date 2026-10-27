// islanddev 모델 도구 — 둥근 조각을 정점색으로 칠해 모아 두었다가 재질마다 한 메시로 굽는다(draw call 절약).
// 재질·자주 쓰는 지오메트리는 모듈 전역에서 공유(userData.shared = true → 청크가 버릴 때 dispose 안 함).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type MatKey = 'matte' | 'wood' | 'glow' | 'water' | 'metal' | 'leaf';

let mats: Record<MatKey, THREE.MeshStandardMaterial> | null = null;
/** 공유 재질(정점색) — glow 는 밤에 emissiveIntensity 를 올린다 */
export function materials(): Record<MatKey, THREE.MeshStandardMaterial> {
  if (mats) return mats;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  mats = {
    matte: std({ roughness: 0.78, metalness: 0 }),
    wood: std({ roughness: 0.86, metalness: 0 }),
    leaf: std({ roughness: 0.7, metalness: 0 }),
    metal: std({ roughness: 0.38, metalness: 0.45 }),
    glow: std({ roughness: 0.5, emissive: new THREE.Color('#ffe08a'), emissiveIntensity: 0.25 }),
    water: std({ roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.78, depthWrite: false }),
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}
/** 밤 정도(0..1)로 등불 밝기 */
export function setNight(k: number) {
  const m = materials();
  m.glow.emissiveIntensity = 0.25 + 2.4 * k;
}

const tmpColor = new THREE.Color();
/** 지오메트리 전체에 한 색(아래→위 그라디언트면 [아래, 위]) */
export function paint(g: THREE.BufferGeometry, c: string | [string, string]): THREE.BufferGeometry {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  if (Array.isArray(c)) {
    g.computeBoundingBox();
    const bb = g.boundingBox!, h = Math.max(1e-4, bb.max.y - bb.min.y);
    const a = new THREE.Color(c[0]), b = new THREE.Color(c[1]);
    for (let i = 0; i < p.count; i++) {
      tmpColor.copy(a).lerp(b, (p.getY(i) - bb.min.y) / h);
      col[i * 3] = tmpColor.r; col[i * 3 + 1] = tmpColor.g; col[i * 3 + 2] = tmpColor.b;
    }
  } else {
    tmpColor.set(c);
    for (let i = 0; i < p.count; i++) { col[i * 3] = tmpColor.r; col[i * 3 + 1] = tmpColor.g; col[i * 3 + 2] = tmpColor.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ── 기본 조각(색은 paint 로) ──
export const rbox = (w: number, h: number, d: number, r = 0.06, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, Math.min(r, w / 2, h / 2, d / 2) - 1e-4));
export const sph = (r: number, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
export const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const cone = (r: number, h: number, seg = 14) => new THREE.ConeGeometry(r, h, seg);
export const torus = (r: number, t: number, rs = 8, ts = 20, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
export const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);

interface Part { g: THREE.BufferGeometry; mat: MatKey }

/** 조각 모으기 → bake() 로 재질마다 한 메시 */
export class Builder {
  parts: Part[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  /** 원점 자리·돌림(rotY)을 정해 두면 add 좌표가 그 기준 */
  private base = new THREE.Matrix4();

  setBase(x: number, y: number, z: number, rotY = 0) { this.base.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1)); return this; }
  resetBase() { this.base.identity(); return this; }

  /** 조각 하나(지오메트리는 복사해 굽는다 — 원본은 건드리지 않는다) */
  add(g: THREE.BufferGeometry, mat: MatKey, color: string | [string, string], x = 0, y = 0, z = 0, rot?: [number, number, number], scale?: number | [number, number, number]) {
    const gg = (g.index ? g.toNonIndexed() : g.clone());
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal') gg.deleteAttribute(k);
    if (!gg.attributes.normal) gg.computeVertexNormals();
    paint(gg, color);
    this.e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0);
    this.q.setFromEuler(this.e);
    if (typeof scale === 'number') this.s.setScalar(scale); else if (scale) this.s.set(scale[0], scale[1], scale[2]); else this.s.set(1, 1, 1);
    this.p.set(x, y, z);
    this.m.compose(this.p, this.q, this.s).premultiply(this.base);
    gg.applyMatrix4(this.m);
    this.parts.push({ g: gg, mat });
    if (g !== gg && !g.userData.keep) g.dispose();
    return this;
  }

  /** 재질마다 합친 메시 그룹 */
  bake(name = 'islanddev-baked', o: { shadow?: boolean } = {}): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    const by = new Map<MatKey, THREE.BufferGeometry[]>();
    for (const p of this.parts) { const a = by.get(p.mat) ?? []; a.push(p.g); by.set(p.mat, a); }
    const M = materials();
    for (const [k, list] of by) {
      const g = mergeGeometries(list, false);
      for (const x of list) x.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, M[k]);
      mesh.castShadow = !!o.shadow && k !== 'water' && k !== 'glow';
      mesh.receiveShadow = k !== 'water';
      mesh.name = `${name}:${k}`;
      out.add(mesh);
    }
    this.parts = [];
    return out;
  }
}

/** 글씨 판(캔버스) — 간판·기부함 이름 */
const labelCache = new Map<string, THREE.MeshBasicMaterial>();
export function labelMaterial(text: string, o: { fg?: string; bg?: string; w?: number; h?: number } = {}): THREE.MeshBasicMaterial {
  const key = `${text}|${o.fg}|${o.bg}|${o.w}|${o.h}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const W = o.w ?? 256, Hh = o.h ?? 96;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d')!;
  if (o.bg) { g.fillStyle = o.bg; g.beginPath(); g.roundRect(4, 4, W - 8, Hh - 8, Hh * 0.3); g.fill(); }
  g.fillStyle = o.fg ?? '#5a3a22';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = Math.floor(Hh * 0.56);
  g.font = `${fs}px Jua, sans-serif`;
  while (g.measureText(text).width > W - 24 && fs > 12) { fs -= 2; g.font = `${fs}px Jua, sans-serif`; }
  g.fillText(text, W / 2, Hh / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  m.userData.shared = true;
  labelCache.set(key, m);
  return m;
}
let planeGeo: THREE.PlaneGeometry | null = null;
export function labelMesh(text: string, w: number, h: number, o: { fg?: string; bg?: string } = {}): THREE.Mesh {
  planeGeo ??= Object.assign(new THREE.PlaneGeometry(1, 1), {});
  planeGeo.userData.shared = true;
  const m = new THREE.Mesh(planeGeo, labelMaterial(text, { ...o, w: 256, h: Math.round(256 * (h / w)) }));
  m.scale.set(w, h, 1);
  return m;
}

/** 지오메트리만 버린다(공유 표시는 건너뛴다) */
export function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
  });
}
