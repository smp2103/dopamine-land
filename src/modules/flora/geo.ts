// 식물 지오메트리 도구 — 부드러운 법선, 정점색, 틴트 마스크(aTint), 회전체·튜브·덩어리 구름.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export type Rnd = () => number;
type G = THREE.BufferGeometry;

const _c = new THREE.Color();
/** sRGB hex → 선형 색 */
export const C = (hex: string) => new THREE.Color(hex);
export const lerpC = (a: THREE.Color, b: THREE.Color, t: number) => _c.copy(a).lerp(b, Math.min(1, Math.max(0, t))).clone();
/** 여러 색을 0..1 에 고르게 놓고 보간 */
export function ramp(cols: THREE.Color[], t: number): THREE.Color {
  t = Math.min(1, Math.max(0, t)) * (cols.length - 1);
  const i = Math.min(cols.length - 2, Math.floor(t));
  return lerpC(cols[i], cols[i + 1], t - i);
}
export const sstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** 위치만 남기고 같은 자리 정점을 합쳐 법선을 부드럽게 */
export function smooth(geo: G): G {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  const g = mergeVertices(geo, 1e-5);
  g.computeVertexNormals();
  return g;
}

/** 정점색(선형)과 틴트 마스크(1 = 인스턴스 색을 받음)를 칠한다 */
export function paint(
  geo: G,
  color: (p: THREE.Vector3, n: THREE.Vector3, i: number) => THREE.Color,
  tint: number | ((p: THREE.Vector3, n: THREE.Vector3, i: number) => number) = 0,
): G {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const tn = new Float32Array(pos.count);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const c = color(p, n, i);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    tn[i] = typeof tint === 'number' ? tint : tint(p, n, i);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tn, 1));
  return geo;
}

/** 고친 나쁜 정점 수(디버그) */
export const floraBad = { n: 0 };

/** 칠한 조각들을 하나로(색·틴트 필수) */
export function merge(parts: G[]): G {
  const ps = parts.map((g) => {
    const x = g.index ? g : mergeVertices(g, 1e-6);
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'color', 'aTint'].includes(k)) x.deleteAttribute(k);
    return x;
  });
  const m = mergeGeometries(ps, false);
  if (!m) throw new Error('flora merge 실패(속성 불일치)');
  // 퇴화 삼각형 때문에 길이 0·NaN 법선이 생기면 후처리(블룸·심도)가 NaN 을 번지게 한다 → 위쪽으로 고친다
  const pos = m.attributes.position as THREE.BufferAttribute, nor = m.attributes.normal as THREE.BufferAttribute;
  let bad = 0;
  for (let i = 0; i < nor.count; i++) {
    const x = nor.getX(i), y = nor.getY(i), z = nor.getZ(i);
    const l = Math.hypot(x, y, z);
    if (!(l > 1e-4)) { nor.setXYZ(i, 0, 1, 0); bad++; }
    if (!Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))) { pos.setXYZ(i, 0, 0, 0); bad++; }
  }
  if (bad) floraBad.n += bad;
  m.computeBoundingSphere();
  return m;
}

/** 행렬을 적용한 복사본 */
export function xf(geo: G, m: THREE.Matrix4): G {
  const g = geo.clone();
  g.applyMatrix4(m);
  return g;
}
export const M = {
  t: (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z),
  compose: (p: THREE.Vector3, q: THREE.Quaternion, s: number | THREE.Vector3) =>
    new THREE.Matrix4().compose(p, q, typeof s === 'number' ? new THREE.Vector3(s, s, s) : s),
};

// ── 셀 노이즈(잎 덩어리 요철) ─────────────────────────────
function hash3(x: number, y: number, z: number, s: number): [number, number, number] {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(s, 1274126177)) >>> 0;
  const f = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
  return [f(), f(), f()];
}
/** 둥근 혹(돔) 0..1 과 혹 사이 골(crease) 0..1 */
export function cells(x: number, y: number, z: number, size: number, seed: number): { dome: number; crease: number } {
  const px = x / size, py = y / size, pz = z / size;
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  let f1 = 9, f2 = 9;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const h = hash3(ix + dx, iy + dy, iz + dz, seed);
    const fx = ix + dx + 0.1 + 0.8 * h[0] - px, fy = iy + dy + 0.1 + 0.8 * h[1] - py, fz = iz + dz + 0.1 + 0.8 * h[2] - pz;
    const d = Math.sqrt(fx * fx + fy * fy + fz * fz);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  const dome = Math.sqrt(Math.max(0, 1 - (f1 / 0.9) ** 2));
  const crease = sstep(0, 0.35, f2 - f1);
  return { dome, crease };
}

// ── 덩어리 구름(겹친 구를 부드럽게 합친 표면) ─────────────────
export interface Ball { x: number; y: number; z: number; r: number; sx?: number; sy?: number; sz?: number }
export interface BlobOpts {
  /** 정이십면체 분할 수(선형) */
  detail: number;
  /** 부드러운 합 반경 */
  k: number;
  /** 잎 덩어리 셀 크기·높이 */
  cell: number;
  amp: number;
  seed: number;
}
export function blob(balls: Ball[], o: BlobOpts): { geo: G; dome: Float32Array; crease: Float32Array; c0: THREE.Vector3 } {
  const c0 = new THREE.Vector3();
  let wsum = 0;
  for (const b of balls) { c0.x += b.x * b.r; c0.y += b.y * b.r; c0.z += b.z * b.r; wsum += b.r; }
  c0.divideScalar(wsum);
  let rmax = 0;
  for (const b of balls) rmax = Math.max(rmax, Math.hypot(b.x - c0.x, b.y - c0.y, b.z - c0.z) + b.r * Math.max(b.sx ?? 1, b.sy ?? 1, b.sz ?? 1));
  rmax *= 1.25;
  const k = o.k;
  const sdf = (x: number, y: number, z: number) => {
    let d = 1e9;
    for (const b of balls) {
      const dx = (x - b.x) / (b.sx ?? 1), dy = (y - b.y) / (b.sy ?? 1), dz = (z - b.z) / (b.sz ?? 1);
      const di = Math.sqrt(dx * dx + dy * dy + dz * dz) - b.r;
      const h = Math.max(k - Math.abs(d - di), 0) / k;
      d = Math.min(d, di) - h * h * k * 0.25;
    }
    return d;
  };
  let g: G = new THREE.IcosahedronGeometry(1, o.detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const dome = new Float32Array(pos.count), crease = new Float32Array(pos.count);
  const d = new THREE.Vector3(), p = new THREE.Vector3(), gr = new THREE.Vector3();
  const step = rmax / 90, e = 0.01;
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    // 바깥에서 안으로 걸어 들어와 처음 표면을 만나는 곳(가장 바깥 껍질)
    let r = rmax;
    while (r > 0 && sdf(c0.x + d.x * r, c0.y + d.y * r, c0.z + d.z * r) > 0) r -= step;
    let lo = Math.max(0, r), hi = r + step;
    for (let j = 0; j < 18; j++) {
      const m = (lo + hi) / 2;
      if (sdf(c0.x + d.x * m, c0.y + d.y * m, c0.z + d.z * m) > 0) hi = m; else lo = m;
    }
    p.copy(c0).addScaledVector(d, (lo + hi) / 2);
    gr.set(
      sdf(p.x + e, p.y, p.z) - sdf(p.x - e, p.y, p.z),
      sdf(p.x, p.y + e, p.z) - sdf(p.x, p.y - e, p.z),
      sdf(p.x, p.y, p.z + e) - sdf(p.x, p.y, p.z - e),
    ).normalize();
    const c = o.amp > 0 ? cells(p.x, p.y, p.z, o.cell, o.seed) : { dome: 1, crease: 1 };
    dome[i] = c.dome; crease[i] = c.crease;
    const bump = (0.65 * c.dome + 0.35 * c.crease - 0.6) * o.amp;
    p.addScaledVector(gr, bump);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return { geo: g, dome, crease, c0 };
}

// ── 튜브(줄기·가지): 곡선을 따라 반경 함수로 ─────────────────────
export function sweep(
  pts: THREE.Vector3[],
  radius: (t: number, a: number, p: THREE.Vector3) => number,
  radial: number,
  seg: number,
  capTop = true,
): G {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const verts: number[] = [];
  const idx: number[] = [];
  let nPrev = new THREE.Vector3();
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T).normalize();
    if (i === 0) {
      nPrev.set(1, 0, 0);
      if (Math.abs(T.x) > 0.9) nPrev.set(0, 0, 1);
    }
    N.copy(nPrev).addScaledVector(T, -nPrev.dot(T)).normalize();
    nPrev = N.clone();
    B.crossVectors(T, N);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const r = radius(t, a, P);
      verts.push(
        P.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r,
        P.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r,
        P.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r,
      );
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, c, b, b, c, d);
  }
  if (capTop) {
    const top = verts.length / 3;
    curve.getPointAt(1, P);
    curve.getTangentAt(1, T);
    const rr = radius(1, 0, P);
    verts.push(P.x + T.x * rr * 0.4, P.y + T.y * rr * 0.4, P.z + T.z * rr * 0.4);
    const base = seg * radial;
    for (let j = 0; j < radial; j++) idx.push(base + j, top, base + ((j + 1) % radial));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return fixOutward(g, (i, p) => {
    const tt = Math.min(1, Math.floor(i / radial) / seg);
    return p.clone().sub(curve.getPointAt(tt));
  }, Math.floor(seg / 2) * radial);
}

/** 회전체: prof = [반경, 높이] 위→아래. 반경 0 이면 극점 하나. disp 로 정점을 직접 비튼다. */
export function lathe(
  prof: Array<[number, number]>,
  radial: number,
  disp?: (p: THREE.Vector3, s: number, a: number) => void,
): G {
  const verts: number[] = [];
  const rows: number[][] = [];
  const p = new THREE.Vector3();
  prof.forEach(([r, y], j) => {
    const s = j / (prof.length - 1);
    const row: number[] = [];
    const n = r < 1e-6 ? 1 : radial;
    for (let k = 0; k < n; k++) {
      const a = (k / radial) * Math.PI * 2;
      p.set(r * Math.cos(a), y, -r * Math.sin(a));
      disp?.(p, s, a);
      row.push(verts.length / 3);
      verts.push(p.x, p.y, p.z);
    }
    rows.push(row);
  });
  const idx: number[] = [];
  for (let j = 0; j < rows.length - 1; j++) {
    const A = rows[j], B = rows[j + 1];
    if (A.length === 1 && B.length === 1) continue;
    if (A.length === 1) { for (let k = 0; k < radial; k++) idx.push(A[0], B[k], B[(k + 1) % radial]); continue; }
    if (B.length === 1) { for (let k = 0; k < radial; k++) idx.push(A[k], B[0], A[(k + 1) % radial]); continue; }
    for (let k = 0; k < radial; k++) {
      const a = A[k], b = A[(k + 1) % radial], c = B[k], d = B[(k + 1) % radial];
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 첫 고리(위쪽 바깥면)를 기준으로 바깥을 향하게
  const ref = rows.find((r) => r.length > 1)?.[0] ?? 0;
  return fixOutward(g, (_i, q) => new THREE.Vector3(q.x, 0.3 * Math.hypot(q.x, q.z), q.z), ref);
}

/** 기준 정점의 법선이 안쪽이면 면 방향을 뒤집는다 */
function fixOutward(g: G, outward: (i: number, p: THREE.Vector3) => THREE.Vector3, ref: number): G {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const p = new THREE.Vector3().fromBufferAttribute(pos, ref);
  const n = new THREE.Vector3().fromBufferAttribute(nor, ref);
  if (n.dot(outward(ref, p)) < 0) {
    const ix = g.index!.array as Uint32Array | Uint16Array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.index!.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

/**
 * 꽃잎·잎 한 장: 원점에서 +z 로 뻗고, x 가 폭, y 는 오목함·말림.
 * shape(u) = 0..1 폭 배율, notch = 끝 홈 깊이.
 */
export function petal(o: {
  len: number; width: number; cup?: number; curl?: number; notch?: number;
  shape?: (u: number) => number; nu?: number; nv?: number; thick?: number;
  /** 길이 방향 추가 휨(y, m) */
  bend?: (u: number) => number;
}): G {
  const nu = o.nu ?? 8, nv = o.nv ?? 4;
  const shape = o.shape ?? ((u: number) => Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.97 + 0.03)), 0.65));
  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const w = o.width * shape(u);
    for (let j = 0; j <= nv * 2; j++) {
      const v = j / nv - 1; // -1..1
      const notch = (o.notch ?? 0) * Math.max(0, 1 - Math.abs(v) * 2.2) * sstep(0.75, 1, u);
      const z = o.len * (u - notch * 0.12);
      const x = v * w;
      const y = (o.cup ?? 0) * v * v * (w / Math.max(1e-4, o.width)) + (o.curl ?? 0) * u * u + (o.bend ? o.bend(u) : 0);
      verts.push(x, y, z);
    }
  }
  const W = nv * 2 + 1;
  for (let i = 0; i < nu; i++) for (let j = 0; j < W - 1; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  // 시작 끝(u=0)이 한 점으로 모이면 퇴화 삼각형이 생기므로 합친다
  const m = smooth(g);
  return m;
}

/** 작은 둥근 공(과일·꽃 가운데 등) */
export function ball(r: number, detail = 3, squash = 1): G {
  const g = smooth(new THREE.IcosahedronGeometry(r, detail));
  g.scale(1, squash, 1);
  g.computeVertexNormals();
  return g;
}
