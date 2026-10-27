// 실내 생물 무리(수조 물고기·케이지 곤충·피규어·박물관 전시) — 모양 6가지(물고기·곤충·바다·우주·공룡·통통이)를
// 역할(몸·포인트·왼눈·오른눈·볼터치)마다 InstancedMesh 하나로 그린다. 몇백 마리여도 모양 × 5 draw call.
// 얼굴은 art.ts 공용 눈·볼터치(GDD 7.2) — 눈 지오메트리를 모양마다 구워 둔다. 색은 종 look.colors → 분류 기본색 + 희귀도 포인트.
// 쓰는 법(즉시 모드): 매 프레임 begin() → push(모양, 행렬, 몸색, 포인트색) … → end().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addEyes, eyeMaterial, blushMaterial, pastelize, PALETTE } from '../../core/art';

export type Shape = 'fish' | 'bug' | 'sea' | 'space' | 'dino' | 'blob';
export const SHAPES: readonly Shape[] = ['fish', 'bug', 'sea', 'space', 'dino', 'blob'];
type Role = 'body' | 'accent' | 'eyeL' | 'eyeR' | 'blush';
const ROLES: readonly Role[] = ['body', 'accent', 'eyeL', 'eyeR', 'blush'];

const shared = <T extends THREE.BufferGeometry | THREE.Material>(o: T): T => { o.userData.shared = true; return o; };

/** 분류별 기본 색 */
const CAT_TINT: Record<string, string> = {
  fish: PALETTE.sky, sea: PALETTE.coral, bug: PALETTE.lime, insect: PALETTE.lime, dino: PALETTE.green,
  fossil: PALETTE.cream, space: PALETTE.lavender,
};
export interface LookSpecies { id: string; category: string; rarity?: number; look?: { colors?: unknown; [k: string]: unknown }; name?: string }
/** 종 대표 색 두 개(몸·포인트) */
export function critterColors(s: LookSpecies): [string, string] {
  const cs = s.look?.colors;
  const list = Array.isArray(cs) ? cs.filter((c): c is string => typeof c === 'string') : [];
  const r = s.rarity ?? 1;
  const base = list[0] ?? CAT_TINT[s.category] ?? PALETTE.apricot;
  const acc = list[1] ?? (r >= 4 ? PALETTE.gold : r >= 3 ? PALETTE.pink : r >= 2 ? PALETTE.cream : PALETTE.white);
  const safe = (c: string) => { try { return pastelize(c); } catch { return PALETTE.apricot; } };
  return [safe(base), safe(acc)];
}
/** 분류 → 모양 */
export function shapeOfSpecies(s: { category: string }): Shape {
  switch (s.category) {
    case 'fish': return 'fish';
    case 'bug': case 'insect': return 'bug';
    case 'sea': return 'sea';
    case 'space': return 'space';
    case 'dino': return 'dino';
    default: return 'blob';
  }
}

// ───────────── 모양 만들기(앞 = +z, 가장 긴 쪽 ≈ 1) ─────────────
const SPH = shared(new THREE.SphereGeometry(0.5, 20, 14));
const CYL = shared(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
const TOR = shared(new THREE.TorusGeometry(0.5, 0.06, 8, 32));

function piece(parent: THREE.Object3D, role: 'body' | 'accent', geo: THREE.BufferGeometry, s: [number, number, number], p: [number, number, number], r: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo);
  m.scale.set(...s); m.position.set(...p); m.rotation.set(...r);
  m.userData.role = role;
  parent.add(m);
  return m;
}
function face(parent: THREE.Object3D, size: number, r: number, c: [number, number, number], lift = 0.12) {
  const holder = new THREE.Group();
  parent.add(holder);
  addEyes(holder, { size, head: { r, center: new THREE.Vector3(...c) }, lift });
}

function shapeGroup(shape: Shape): THREE.Group {
  const g = new THREE.Group();
  switch (shape) {
    case 'fish': {
      piece(g, 'body', SPH, [0.58, 0.64, 0.92], [0, 0, 0]);
      piece(g, 'accent', SPH, [0.07, 0.34, 0.28], [0, 0.14, -0.5], [0.55, 0, 0]);
      piece(g, 'accent', SPH, [0.07, 0.34, 0.28], [0, -0.14, -0.5], [-0.55, 0, 0]);
      piece(g, 'accent', SPH, [0.06, 0.26, 0.34], [0, 0.32, -0.06], [-0.2, 0, 0]);
      for (const sx of [-1, 1]) piece(g, 'accent', SPH, [0.04, 0.12, 0.2], [sx * 0.28, -0.1, 0.06], [0, sx * 0.6, 0]);
      face(g, 0.17, 0.3, [0, 0.06, 0.16], 0.1);
      break;
    }
    case 'bug': {
      piece(g, 'body', SPH, [0.56, 0.5, 0.66], [0, 0, -0.12]);
      piece(g, 'body', SPH, [0.44, 0.42, 0.42], [0, 0.06, 0.3]);
      for (const sx of [-1, 1]) {
        piece(g, 'accent', SPH, [0.4, 0.05, 0.52], [sx * 0.22, 0.27, -0.14], [0, sx * 0.25, sx * 0.32]);
        piece(g, 'accent', CYL, [0.025, 0.28, 0.025], [sx * 0.08, 0.34, 0.4], [-0.45, 0, -sx * 0.35]);
        piece(g, 'accent', SPH, [0.08, 0.08, 0.08], [sx * 0.14, 0.47, 0.47]);
      }
      face(g, 0.14, 0.21, [0, 0.06, 0.3], 0.1);
      break;
    }
    case 'sea': {
      piece(g, 'body', SPH, [0.74, 0.64, 0.74], [0, 0.14, 0]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        piece(g, 'accent', SPH, [0.16, 0.28, 0.16], [Math.cos(a) * 0.26, -0.2, Math.sin(a) * 0.26]);
      }
      piece(g, 'accent', SPH, [0.12, 0.08, 0.12], [-0.14, 0.44, -0.08]);
      piece(g, 'accent', SPH, [0.09, 0.06, 0.09], [0.12, 0.45, -0.12]);
      face(g, 0.17, 0.36, [0, 0.13, 0], 0.08);
      break;
    }
    case 'space': {
      piece(g, 'body', SPH, [0.72, 0.66, 0.7], [0, 0, 0]);
      piece(g, 'accent', CYL, [0.03, 0.26, 0.03], [0, 0.42, 0]);
      piece(g, 'accent', SPH, [0.14, 0.14, 0.14], [0, 0.58, 0]);
      piece(g, 'accent', TOR, [1.0, 1.0, 1.0], [0, -0.02, 0], [Math.PI / 2 - 0.3, 0, 0.15]);
      face(g, 0.18, 0.35, [0, 0.03, 0], 0.1);
      break;
    }
    case 'dino': {
      piece(g, 'body', SPH, [0.5, 0.46, 0.7], [0, 0, -0.06]);
      piece(g, 'body', SPH, [0.4, 0.38, 0.4], [0, 0.32, 0.32]);
      piece(g, 'body', SPH, [0.16, 0.16, 0.5], [0, 0.02, -0.46], [0.25, 0, 0]);
      for (const [x, z] of [[-0.15, 0.15], [0.15, 0.15], [-0.15, -0.22], [0.15, -0.22]]) piece(g, 'body', CYL, [0.12, 0.2, 0.12], [x, -0.24, z]);
      for (let i = 0; i < 3; i++) piece(g, 'accent', SPH, [0.05, 0.16, 0.14], [0, 0.26 - i * 0.04, 0.06 - i * 0.22]);
      face(g, 0.13, 0.2, [0, 0.34, 0.32], 0.1);
      break;
    }
    default: {
      piece(g, 'body', SPH, [0.8, 0.72, 0.76], [0, 0, 0]);
      piece(g, 'accent', SPH, [0.22, 0.12, 0.22], [0, 0.34, -0.05]);
      face(g, 0.18, 0.38, [0, 0.02, 0], 0.1);
    }
  }
  return g;
}

/** 모양 → 역할별 지오메트리(구운 것, 공유) */
const geoCache = new Map<Shape, Record<Role, THREE.BufferGeometry | null>>();
function shapeGeos(shape: Shape): Record<Role, THREE.BufferGeometry | null> {
  const hit = geoCache.get(shape);
  if (hit) return hit;
  const g = shapeGroup(shape);
  g.updateMatrixWorld(true);
  const by: Record<Role, THREE.BufferGeometry[]> = { body: [], accent: [], eyeL: [], eyeR: [], blush: [] };
  const blush = blushMaterial(false);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const role: Role | null = m.userData.role ?? (m.userData.eye === 'L' ? 'eyeL' : m.userData.eye === 'R' ? 'eyeR' : m.material === blush ? 'blush' : null);
    if (!role) return;
    const c = m.geometry.clone();
    c.applyMatrix4(m.matrixWorld);
    by[role].push(c);
  });
  const out = {} as Record<Role, THREE.BufferGeometry | null>;
  for (const r of ROLES) {
    const list = by[r];
    out[r] = list.length ? shared(mergeGeometries(list, false) ?? list[0]) : null;
    if (out[r]) out[r]!.computeBoundingSphere();
  }
  geoCache.set(shape, out);
  return out;
}

let bodyMat: THREE.MeshStandardMaterial | null = null;
const roleMat = (r: Role): THREE.Material => {
  if (r === 'eyeL') return eyeMaterial('L');
  if (r === 'eyeR') return eyeMaterial('R');
  if (r === 'blush') return blushMaterial(false);
  return (bodyMat ??= shared(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0 })));
};

/** 모양마다 몇 마리까지(넘치면 그 프레임엔 안 그린다) */
export type Caps = Partial<Record<Shape, number>>;

export class CritterSet {
  readonly root = new THREE.Group();
  private ims = new Map<Shape, Partial<Record<Role, THREE.InstancedMesh>>>();
  private n = new Map<Shape, number>();
  private caps: Caps;
  constructor(caps: Caps, name = 'critters') {
    this.caps = caps;
    this.root.name = name;
    for (const s of SHAPES) {
      const cap = caps[s] ?? 0;
      if (cap <= 0) continue;
      const geos = shapeGeos(s);
      const row: Partial<Record<Role, THREE.InstancedMesh>> = {};
      for (const r of ROLES) {
        const geo = geos[r];
        if (!geo) continue;
        const im = new THREE.InstancedMesh(geo, roleMat(r), cap);
        im.name = `${name}:${s}:${r}`;
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = r === 'body' || r === 'accent';
        im.receiveShadow = false;
        if (r === 'body' || r === 'accent') im.setColorAt(0, new THREE.Color('#ffffff'));
        if (r === 'eyeL' || r === 'eyeR' || r === 'blush') im.renderOrder = 2;
        row[r] = im;
        this.root.add(im);
      }
      this.ims.set(s, row);
    }
  }
  /** 이 모양을 그릴 수 있나(용량이 있나) */
  has(shape: Shape) { return this.ims.has(shape); }
  /** 그 모양 남은 자리 */
  room(shape: Shape) { return (this.caps[shape] ?? 0) - (this.n.get(shape) ?? 0); }
  begin() { this.n.clear(); }
  /** 한 마리. 다 차면 false */
  push(shape: Shape, m: THREE.Matrix4, a: THREE.Color, b: THREE.Color): boolean {
    const row = this.ims.get(shape) ?? this.ims.get('blob');
    const sh = this.ims.has(shape) ? shape : 'blob';
    if (!row) return false;
    const i = this.n.get(sh) ?? 0;
    if (i >= (this.caps[sh] ?? 0)) return false;
    for (const r of ROLES) {
      const im = row[r];
      if (!im) continue;
      im.setMatrixAt(i, m);
      if (r === 'body') im.setColorAt(i, a);
      else if (r === 'accent') im.setColorAt(i, b);
    }
    this.n.set(sh, i + 1);
    return true;
  }
  end() {
    for (const [s, row] of this.ims) {
      const n = this.n.get(s) ?? 0;
      for (const r of ROLES) {
        const im = row[r];
        if (!im) continue;
        im.count = n;
        im.visible = n > 0;
        if (n) {
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
        }
      }
    }
  }
  /** 지금 그리는 마릿수 */
  total() { let t = 0; for (const v of this.n.values()) t += v; return t; }
  dispose() {
    for (const row of this.ims.values()) for (const im of Object.values(row)) im?.dispose();
    this.ims.clear();
  }
}

/** 색 문자열 → THREE.Color(캐시) */
const cc = new Map<string, THREE.Color>();
export const critterColor = (c: string) => { let v = cc.get(c); if (!v) { v = new THREE.Color(c); cc.set(c, v); } return v; };
