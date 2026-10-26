// 바다 모듈 공통 부품: 정점색으로 칠한 부품을 하나의 지오메트리로 합친다(생물·산호 = 메시 하나 = 드로우콜 하나).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Geo = THREE.BufferGeometry;
const tmpC = new THREE.Color();
const tmpV = new THREE.Vector3();

/** 비색인 + position/normal 만 */
function prep(g: Geo): Geo {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  return n;
}

/** 위(top) → 아래(bot) 그라디언트로 칠한다(부품 자기 공간 기준 y) */
export function paint(g: Geo, top: string, bot?: string, axis: 'x' | 'y' | 'z' = 'y'): Geo {
  g = prep(g);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const a = new THREE.Color(top), b = new THREE.Color(bot ?? top);
  const pos = g.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const lo = bb.min[axis], span = bb.max[axis] - lo || 1;
  for (let i = 0; i < pos.count; i++) {
    const v = axis === 'x' ? pos.getX(i) : axis === 'y' ? pos.getY(i) : pos.getZ(i);
    const t = (v - lo) / span;
    tmpC.copy(b).lerp(a, t);
    arr[i * 3] = tmpC.r; arr[i * 3 + 1] = tmpC.g; arr[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** 위치마다 색을 고른다(줄무늬·점무늬) */
export function paintFn(g: Geo, fn: (p: THREE.Vector3, out: THREE.Color) => void): Geo {
  g = prep(g);
  const pos = g.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    tmpV.fromBufferAttribute(pos, i);
    fn(tmpV, tmpC);
    arr[i * 3] = tmpC.r; arr[i * 3 + 1] = tmpC.g; arr[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
/** 옮기고 돌린다(라디안, XYZ) */
export function at(g: Geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): Geo {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return g;
}

export const sph = (r: number, w = 32, h = 24) => new THREE.SphereGeometry(r, w, h);
export const ell = (rx: number, ry: number, rz: number, w = 32, h = 24) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
export const cap = (r: number, len: number, cs = 6, rs = 14) => new THREE.CapsuleGeometry(r, len, cs, rs);
export const cone = (r: number, h: number, rs = 12) => new THREE.ConeGeometry(r, h, rs, 1);
export const cyl = (r0: number, r1: number, h: number, rs = 16) => new THREE.CylinderGeometry(r0, r1, h, rs, 1);
export const torus = (r: number, t: number, rs = 10, ts = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);

/** 정점을 법선 방향으로 밀어낸다(울퉁불퉁) */
export function bump(g: Geo, fn: (p: THREE.Vector3) => number): Geo {
  g = g.index ? g.toNonIndexed() : g;
  const pos = g.attributes.position, nor = g.attributes.normal;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    tmpV.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const d = fn(tmpV);
    pos.setXYZ(i, tmpV.x + n.x * d, tmpV.y + n.y * d, tmpV.z + n.z * d);
  }
  // 같은 위치 정점끼리 법선을 평균내기 위해 색인을 다시 만든다
  const merged = mergeVerts(g);
  merged.computeVertexNormals();
  return merged;
}

function mergeVerts(g: Geo): Geo {
  const pos = g.attributes.position;
  const map = new Map<string, number>();
  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let j = map.get(k);
    if (j === undefined) { j = verts.length / 3; verts.push(x, y, z); map.set(k, j); }
    idx.push(j);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  o.setIndex(idx);
  return o;
}

/** 칠한 부품들을 하나로 */
export function merge(parts: Geo[]): Geo {
  const g = mergeGeometries(parts.map(prepKeepColor), false)!;
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData.shared = true;
  return g;
}
function prepKeepColor(g: Geo): Geo {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') n.deleteAttribute(k);
  if (!n.attributes.color) paint(n, '#ffffff');
  return n;
}

/** 귀여운 얼굴(+Z 를 본다): 큰 눈 + 하이라이트 두 개 + 볼터치 + 웃는 입 */
export function face(o: {
  x?: number; y: number; z: number; sep: number; r: number;
  cheek?: string | null; mouth?: 'smile' | 'o' | 'none'; zAt?: (x: number, y: number) => number; eye?: string;
}): Geo[] {
  const out: Geo[] = [];
  const r = o.r, cx = o.x ?? 0;
  const zAt = o.zAt ?? (() => o.z);
  for (const s of [-1, 1]) {
    const ex = cx + s * o.sep, ey = o.y;
    const ez = zAt(ex, ey);
    out.push(at(paint(ell(r * 0.78, r, r * 0.5, 16, 12), o.eye ?? '#3a2a3e', o.eye ?? '#1e1424'), ex, ey, ez));
    out.push(at(paint(sph(r * 0.34, 12, 10), '#ffffff'), ex - r * 0.22, ey + r * 0.38, ez + r * 0.38));
    out.push(at(paint(sph(r * 0.15, 10, 8), '#ffffff'), ex + r * 0.26, ey - r * 0.34, ez + r * 0.4));
    if (o.cheek !== null) {
      const chx = cx + s * (o.sep + r * 1.05), chy = ey - r * 1.15;
      out.push(at(paint(ell(r * 0.72, r * 0.42, r * 0.18, 12, 8), o.cheek ?? '#ff8fb0'), chx, chy, zAt(chx, chy) - r * 0.05));
    }
  }
  const mouth = o.mouth ?? 'smile';
  const my = o.y - r * 1.25, mz = zAt(cx, my);
  if (mouth === 'smile') out.push(at(paint(torus(r * 0.42, r * 0.11, 6, 14, Math.PI), '#7a2c3a'), cx, my + r * 0.3, mz, 0, 0, Math.PI));
  else if (mouth === 'o') out.push(at(paint(torus(r * 0.26, r * 0.1, 6, 14), '#7a2c3a'), cx, my, mz));
  return out;
}

/** 타원체 표면 z(앞면) */
export const ellZ = (a: number, b: number, c: number, cy = 0, cz = 0) => (x: number, y: number) => {
  const k = 1 - (x * x) / (a * a) - ((y - cy) * (y - cy)) / (b * b);
  return cz + c * Math.sqrt(Math.max(0.02, k));
};

/** 공유 재질: 정점색 + 보송한 sheen + 그늘에서도 자기 색이 살짝 빛나게(가짜 SSS) */
export function cuteMat(o: { rough?: number; sheen?: number; clearcoat?: number; fill?: number; transparent?: boolean; opacity?: number; side?: THREE.Side } = {}): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: o.rough ?? 0.55, metalness: 0,
    sheen: o.sheen ?? 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff'),
    clearcoat: o.clearcoat ?? 0.25, clearcoatRoughness: 0.45,
    transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
    depthWrite: !o.transparent,
  });
  const fill = o.fill ?? 0.2;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       totalEmissiveRadiance += diffuseColor.rgb * ${fill.toFixed(3)};`,
    );
  };
  m.customProgramCacheKey = () => 'ocean-cute-' + fill.toFixed(3);
  return m;
}
