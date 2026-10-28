// 플레이어 머리카락: 낮은 해상도 '두피 헬멧' 위에 통통한 덩어리(lock)를 두 겹으로 얹는다.
// 덩어리 단면 = 아몬드(등은 볼록, 배는 조금 납작, 가장자리는 둥글고 두께가 있다 → 비스듬히 봐도 칼날 같은 검은 줄이 안 생긴다).
// 길이·폭·끝 방향을 들쭉날쭉하게, 뿌리는 진하고 끝은 밝게, 덩어리마다 명도가 조금씩 달라 뒤에서 봐도 '호박 갈비' 가 아니다.
// 정수리 앞쪽엔 정점 색 '천사 고리' 윤기 띠. 모양 4가지: 말랑 단발(+경단) · 삐죽 숏컷 · 젤리 양갈래 · 구름 뽀글.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SURF, rng } from './mats';
import type { HairStyle } from './look';

export type Sph = readonly [az: number, el: number, k: number];
export interface HeadR { rx: number; ry: number; rz: number }
export interface HairPal { base: string; shade: string; shine: string }

export function sph(h: HeadR, [az, el, k]: Sph, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(az) * Math.cos(el) * h.rx * k, Math.sin(el) * h.ry * k, Math.cos(az) * Math.cos(el) * h.rz * k);
}
const sstep = THREE.MathUtils.smoothstep;
const PI = Math.PI;

interface LockDef {
  c: Sph[];
  /** 뿌리 반폭·반두께(m) */
  w: number; t: number;
  /** 끝 모양: round = 둥글게 모임, point = 짧게 뾰족 */
  tip?: 'round' | 'point';
  /** 명도 흔들림(±) */
  val?: number;
}

/** 색 계산에 쓰는 공용 값 */
interface Painter { h: HeadR; base: THREE.Color; shade: THREE.Color; shine: THREE.Color; band: number }

function hairColorAt(P: Painter, p: THREE.Vector3, along: number, up: number, val: number, out: THREE.Color): THREE.Color {
  const x = p.x / P.h.rx, y = p.y / P.h.ry, z = p.z / P.h.rz;
  const r = Math.hypot(x, y, z) || 1;
  const el = Math.asin(THREE.MathUtils.clamp(y / r, -1, 1));
  const az = Math.atan2(x, z);
  // 목덜미 쪽으로 갈수록 진하게(부드러운 명도 기울기) + 뿌리 그늘
  const low = sstep(-el, -0.35, 0.8);
  out.copy(P.base).lerp(P.shade, 0.55 * low + 0.35 * (1 - sstep(along, 0, 0.35)));
  // 끝은 살짝 밝게
  out.lerp(P.shine, 0.12 * sstep(along, 0.55, 1));
  // 천사 고리(앞쪽이 더 또렷, 물결)
  const ring = Math.exp(-(((el - P.band - 0.035 * Math.sin(az * 7)) / 0.075) ** 2)) * (0.5 + 0.5 * Math.cos(az * 0.5) ** 2);
  out.lerp(P.shine, 0.62 * ring * Math.max(0, up));
  out.multiplyScalar((1 + val) * (up < 0 ? 0.9 : 0.93 + 0.07 * up));
  return out;
}

/** 덩어리 하나(정점 색·표면 포함, 인덱스, 매끈한 법선) */
function lockGeo(P: Painter, l: LockDef, seg: number, radial: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(l.c.map((c) => sph(P.h, c)), false, 'centripetal');
  const tipF = THREE.MathUtils.clamp((l.w * 1.1) / curve.getLength(), 0.12, 0.45);
  const pos: number[] = [], col: number[] = [], sf: number[] = [], idx: number[] = [];
  const c = new THREE.Vector3(), tan = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), v = new THREE.Vector3();
  const cc = new THREE.Color();
  let prevB: THREE.Vector3 | null = null;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    curve.getPointAt(u, c);
    curve.getTangentAt(u, tan);
    n.set(c.x / (P.h.rx * P.h.rx), c.y / (P.h.ry * P.h.ry), c.z / (P.h.rz * P.h.rz)).normalize();
    n.addScaledVector(tan, -n.dot(tan)).normalize();
    b.crossVectors(tan, n).normalize();
    if (prevB && b.dot(prevB) < 0) b.negate();
    prevB = b.clone();
    const rootK = sstep(u, 0, 0.2);
    // 끝: round = 폭만큼의 길이로 반구처럼 둥글게, point = 짧게 모이는 뾰족
    const ru = Math.max(0, (u - (1 - tipF)) / tipF);
    const tipK = l.tip === 'point' ? Math.pow(Math.max(0, 1 - u), 0.7) * (0.6 + 0.4 * Math.sqrt(Math.max(0, 1 - ru * ru))) : Math.sqrt(Math.max(0, 1 - ru * ru));
    const ww = Math.max(l.w * 0.04, l.w * tipK * (0.55 + 0.45 * rootK) * (1 - 0.15 * u));
    const tt = Math.max(l.t * 0.05, l.t * tipK * (0.35 + 0.65 * rootK));
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // 둥근 아몬드: 가장자리를 초타원으로 뭉툭하게, 배는 0.6 만큼
      const ex = Math.sign(ca) * Math.pow(Math.abs(ca), 0.8);
      const ey = Math.sign(sa) * Math.pow(Math.abs(sa), 0.85) * (sa < 0 ? 0.6 : 1);
      v.copy(c).addScaledVector(b, ww * ex).addScaledVector(n, tt * ey);
      pos.push(v.x, v.y, v.z);
      hairColorAt(P, v, u, sa, l.val ?? 0, cc);
      col.push(cc.r, cc.g, cc.b);
      sf.push(...SURF.hair);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b2 = i * radial + ((j + 1) % radial), c2 = a + radial, d = b2 + radial;
      idx.push(a, c2, b2, b2, c2, d);
    }
  }
  // 끝 마개(마지막 고리를 한 점으로)
  const last = seg * radial;
  curve.getPointAt(1, c);
  pos.push(c.x, c.y, c.z);
  hairColorAt(P, c, 1, 0.5, l.val ?? 0, cc);
  col.push(cc.r, cc.g, cc.b);
  sf.push(...SURF.hair);
  const tipI = pos.length / 3 - 1;
  for (let j = 0; j < radial; j++) idx.push(last + j, tipI, last + ((j + 1) % radial));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('surf', new THREE.Float32BufferAttribute(sf, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 법선을 머리 바깥쪽으로 반쯤 기울인다: 배(머리 쪽)와 가장자리가 그늘로 꺼져 실루엣에 검은 줄이 생기지 않게(말랑한 툰 느낌)
  const nn = g.attributes.normal as THREE.BufferAttribute, pp = g.attributes.position as THREE.BufferAttribute;
  const o = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < nn.count; i++) {
    o.fromBufferAttribute(pp, i);
    o.set(o.x / (P.h.rx * P.h.rx), o.y / (P.h.ry * P.h.ry), o.z / (P.h.rz * P.h.rz)).normalize();
    q.fromBufferAttribute(nn, i);
    const under = Math.max(0, -q.dot(o));
    q.lerp(o, 0.12 + 0.5 * under).normalize();
    nn.setXYZ(i, q.x, q.y, q.z);
  }
  return g;
}

/** 두피 헬멧(낮은 해상도): 머리선 아래 정점은 머리 속으로 숨는다 */
function helmet(P: Painter, front: number, side: number, back: number, puff: number, ws: number, hs: number): THREE.BufferGeometry {
  const g0 = new THREE.SphereGeometry(1, ws, hs);
  g0.deleteAttribute('uv');
  g0.deleteAttribute('normal');
  const g = mergeVertices(g0, 1e-6);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3), sf = new Float32Array(p.count * 4);
  const v = new THREE.Vector3(), cc = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const az = Math.atan2(v.x, v.z), el = Math.asin(THREE.MathUtils.clamp(v.y, -1, 1));
    const f = Math.cos(az);
    const line = f > 0 ? THREE.MathUtils.lerp(side, front, sstep(f, 0.25, 0.95)) : THREE.MathUtils.lerp(side, back, sstep(-f, 0, 0.8));
    const k = sstep(el, line - 0.16, line + 0.04);
    const s = THREE.MathUtils.lerp(0.86, 1 + puff + 0.02 * sstep(el, 0.3, 1.2), k);
    // 뒤통수는 머리 조각(뒤로 넉넉)만큼 같이 부풀려 피부가 비치지 않게
    const bk = v.z < 0 ? 1 + 0.06 * sstep(-v.z, 0, 0.6) : 1;
    p.setXYZ(i, v.x * P.h.rx * s, v.y * P.h.ry * s, v.z * P.h.rz * s * bk);
    v.fromBufferAttribute(p, i);
    hairColorAt(P, v, 0.6, 1, -0.04, cc);
    col.set([cc.r, cc.g, cc.b], i * 3);
    sf.set(SURF.hair, i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('surf', new THREE.BufferAttribute(sf, 4));
  g.computeVertexNormals();
  return g;
}

/** 통통한 뽀글 덩어리(구름 머리) — 울퉁불퉁한 공 */
function puffGeo(P: Painter, at: THREE.Vector3, r: number, seed: number, ws: number): THREE.BufferGeometry {
  const g0 = new THREE.IcosahedronGeometry(1, ws > 12 ? 2 : 1);
  g0.deleteAttribute('uv');
  g0.deleteAttribute('normal');
  const g = mergeVertices(g0, 1e-6);
  const p = g.attributes.position as THREE.BufferAttribute;
  const R = rng(seed);
  const ph = [R() * 6, R() * 6, R() * 6];
  const col = new Float32Array(p.count * 3), sf = new Float32Array(p.count * 4);
  const v = new THREE.Vector3(), cc = new THREE.Color(), n = at.clone().normalize();
  const val = (R() - 0.5) * 0.1;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const bump = 1 + 0.05 * Math.sin(v.x * 4 + ph[0]) * Math.sin(v.y * 4 + ph[1]) * Math.sin(v.z * 4 + ph[2]);
    v.multiplyScalar(r * bump);
    const up = v.dot(n) / r;
    v.add(at);
    p.setXYZ(i, v.x, v.y, v.z);
    hairColorAt(P, v, 0.5 + 0.5 * up, up, val, cc);
    col.set([cc.r, cc.g, cc.b], i * 3);
    sf.set(SURF.hair, i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('surf', new THREE.BufferAttribute(sf, 4));
  g.computeVertexNormals();
  return g;
}

// ───────────── 모양별 덩어리 목록 ─────────────
/** 앞머리: 가르마(-x 쪽)에서 쓸어 넘긴 덩어리. 끝 대부분은 둥글게, 한두 개만 짧게 뾰족 */
function bangs(L: LockDef[], kind: HairStyle) {
  const part = -0.28;
  const spec: Array<[az: number, end: number, w: number, tip: 'round' | 'point']> = kind === 'short'
    ? [[-0.7, 0.5, 0.085, 'point'], [-0.32, 0.44, 0.095, 'round'], [0.08, 0.5, 0.1, 'point'], [0.46, 0.42, 0.09, 'round'], [0.78, 0.48, 0.08, 'point']]
    : [[-0.68, 0.4, 0.088, 'round'], [-0.3, 0.33, 0.1, 'round'], [0.1, 0.38, 0.1, 'point'], [0.46, 0.31, 0.095, 'round'], [0.8, 0.36, 0.08, 'round']];
  spec.forEach(([az, end, w, tip], i) => {
    const a0 = part + (az - part) * 0.2;
    L.push({ c: [[a0, 1.3, 0.99], [part + (az - part) * 0.6, 1.0, 1.1], [az - 0.03, 0.72, 1.11], [az, end + 0.08, 1.08], [az + 0.04, end - 0.02, 1.02]], w, t: w * 0.5, tip, val: [0.02, -0.03, 0.03, 0, -0.02][i] });
  });
}

/** 옆머리: 얼굴을 감싸는 두 갈래(뺨까지) */
function sides(L: LockDef[], kind: HairStyle) {
  const len = kind === 'short' ? 0.35 : 0;
  for (const m of [-1, 1]) {
    L.push({ c: [[m * 1.12, 1.0, 1.05], [m * 1.06, 0.45, 1.1], [m * 1.0, -0.05 + len, 1.09], [m * 0.94, -0.34 + len, 1.06], [m * 0.82, -0.44 + len, 1.0]], w: 0.082, t: 0.042, tip: kind === 'short' ? 'point' : 'round', val: 0.02 });
    L.push({ c: [[m * 1.55, 1.0, 1.04], [m * 1.58, 0.4, 1.1], [m * 1.55, -0.12 + len, 1.1], [m * 1.5, -0.3 + len, 1.13], [m * 1.4, -0.4 + len, 1.22]], w: 0.1, t: 0.05, tip: 'round', val: -0.03 });
  }
}

/** 정수리: 뒤쪽 가마에서 앞·옆으로 퍼지는 덩어리(가르마 소용돌이) */
function crown(L: LockDef[]) {
  const whorl: Sph = [PI + 0.35, 1.05, 1.02];
  const dirs: Array<[number, number, number]> = [[-0.55, 0.85, 0.1], [0.05, 0.95, 0.11], [0.6, 0.85, 0.1], [1.4, 0.75, 0.1], [-1.4, 0.78, 0.1], [2.3, 0.7, 0.1]];
  dirs.forEach(([az, el, w], i) => {
    L.push({ c: [whorl, [THREE.MathUtils.lerp(whorl[0], az, 0.25), 1.28, 1.08], [az * 0.9, el + 0.15, 1.12], [az, el - 0.05, 1.11]], w, t: w * 0.45, tip: 'round', val: i % 2 ? 0.03 : -0.02 });
  });
}

/** 뒷머리 두 겹: 아래 겹(굵기·길이 들쭉날쭉, 옆으로 휘며 끝이 바깥으로 톡) + 위 겹(넓적하게 덮고 등 가운데서 끝이 보인다) */
function backLayers(L: LockDef[], kind: HairStyle) {
  const R = rng(kind === 'short' ? 7 : 11);
  const short = kind === 'short';
  // [가운데 az(뒤 = π 기준 오프셋), 길이, 반폭, 옆으로 휘는 양, 끝 모양]
  const lower: Array<[number, number, number, number, 'round' | 'point']> = [
    [-1.28, 0.8, 0.1, -0.22, 'round'], [-0.86, 1.08, 0.135, -0.16, 'round'], [-0.4, 0.92, 0.112, -0.1, 'point'],
    [0.04, 1.16, 0.15, 0.06, 'round'], [0.46, 0.86, 0.105, 0.14, 'round'], [0.88, 1.1, 0.13, 0.18, 'point'], [1.3, 0.82, 0.1, 0.24, 'round'],
  ];
  lower.forEach(([o, len, w, bend, tip], i) => {
    const a = PI + o + (R() - 0.5) * 0.05;
    const endEl = short ? -0.3 - 0.26 * len : -0.28 - 0.38 * len;
    const out = Math.sign(o || 0.3);
    L.push({
      c: [[a - bend * 0.3, 1.02, 1.0], [a - bend * 0.1, 0.55, 1.08], [a + bend * 0.3, 0.02, 1.1], [a + bend * 0.75, endEl + 0.14, 1.1], [a + bend + out * 0.08, endEl + 0.03, 1.27]],
      w, t: w * 0.5, tip: short ? 'point' : tip, val: (i % 2 ? 0.07 : -0.08) + (R() - 0.5) * 0.06,
    });
  });
  // 위 겹: 넓은 덩어리 넷 — 끝이 아래 겹 위에 얹혀 두 층으로 읽힌다
  const upper: Array<[number, number, number, number]> = [[-0.95, 0.12, 0.15, -0.18], [-0.28, -0.04, 0.17, -0.06], [0.42, 0.06, 0.16, 0.1], [1.05, 0.16, 0.14, 0.2]];
  upper.forEach(([o, end, w, bend], i) => {
    const a = PI + o;
    const endEl = short ? end + 0.12 : end;
    L.push({
      c: [[a - 0.12, 1.2, 1.06], [a - bend * 0.2, 0.86, 1.17], [a + bend * 0.4, 0.48, 1.2], [a + bend * 0.8, endEl + 0.1, 1.19], [a + bend + Math.sign(o) * 0.05, endEl, 1.25]],
      w, t: w * 0.55, tip: i === 1 ? 'point' : 'round', val: 0.08 + (R() - 0.5) * 0.05,
    });
  });
  if (short) {
    // 숏컷 정수리 삐침 세 가닥(위로 뾰족)
    for (const [a, w] of [[PI - 0.4, 0.07], [PI + 0.25, 0.08], [PI + 0.9, 0.065]] as const) {
      L.push({ c: [[a, 1.0, 1.0], [a, 1.2, 1.12], [a + 0.15, 1.35, 1.25], [a + 0.3, 1.3, 1.36]], w, t: w * 0.5, tip: 'point', val: 0.03 });
    }
  }
}

export interface HairExtra {
  /** 머리 기준 매달림 자리 */
  at: THREE.Vector3;
  /** 매달림 자리 기준 지오메트리(체인 마디마다 하나) */
  geos: THREE.BufferGeometry[];
  /** 마디 길이(체인 마디 사이) */
  seg: number;
  kind: 'bun' | 'tail';
  side: number;
}

export interface HairOut {
  /** 머리에 붙은 정지 머리카락(색칠됨) */
  main: THREE.BufferGeometry;
  /** 흔들리는 부품(경단·양갈래) */
  extras: HairExtra[];
}

/** 머리카락 만들기. lod far = 덩어리 수 그대로, 정점 아주 적게 */
export function buildHair(style: HairStyle, pal: HairPal, h: HeadR, lod: 'near' | 'far'): HairOut {
  const P: Painter = { h, base: new THREE.Color(pal.base), shade: new THREE.Color(pal.shade), shine: new THREE.Color(pal.shine), band: 0.78 };
  const near = lod === 'near';
  const seg = near ? 20 : 5, radial = near ? 10 : 5;
  const geos: THREE.BufferGeometry[] = [];
  const L: LockDef[] = [];
  const extras: HairExtra[] = [];
  if (style === 'cloud') {
    geos.push(helmet(P, 0.62, -0.25, -0.45, 0.1, near ? 40 : 14, near ? 28 : 10));
    // 뽀글 덩어리: 정수리·옆·뒤를 둘러싼 구름(작은 것은 앞머리)
    const R = rng(31);
    const spots: Array<[number, number, number]> = [];
    for (let ring = 0; ring < 4; ring++) {
      const el = [1.15, 0.72, 0.28, -0.12][ring], n = [4, 8, 10, 8][ring], r = [0.1, 0.105, 0.1, 0.088][ring];
      for (let i = 0; i < n; i++) {
        const az = (i / n) * PI * 2 + ring * 0.4 + (R() - 0.5) * 0.15;
        // 얼굴 앞은 비운다(앞머리 줄만)
        if (ring >= 2 && Math.abs(Math.atan2(Math.sin(az), Math.cos(az))) < 1.05) continue;
        spots.push([az, el + (R() - 0.5) * 0.08, r * (0.9 + R() * 0.25)]);
      }
    }
    // 앞머리 뽀글(이마 위 작은 줄)
    for (const az of [-0.75, -0.38, 0.0, 0.38, 0.75]) spots.push([az, 0.62 + (Math.abs(az) > 0.5 ? -0.08 : 0), 0.072]);
    spots.forEach(([az, el, r], i) => geos.push(puffGeo(P, sph(h, [az, el, 1.06]), r, 100 + i, near ? 16 : 6)));
  } else {
    geos.push(helmet(P, 0.62, -0.15, style === 'short' ? -0.62 : -0.5, 0.05, near ? 40 : 14, near ? 28 : 10));
    bangs(L, style);
    sides(L, style);
    crown(L);
    backLayers(L, style);
  }
  for (const l of L) geos.push(lockGeo(P, l, seg, radial));

  // 흔들리는 부품
  if (style === 'bob') {
    // 목덜미 낮은 젤리 경단 둘(한 마디)
    for (const m of [-1, 1]) {
      const bun = puffGeo(P, new THREE.Vector3(m * 0.014, -0.05, -0.02), 0.058, 70 + m, near ? 16 : 6);
      extras.push({ at: sph(h, [m * 2.45, -0.3, 1.04]), geos: [bun], seg: 0, kind: 'bun', side: m });
    }
  } else if (style === 'twin') {
    // 양갈래: 귀 뒤 높이에서 늘어지는 덩어리 3마디(스프링 체인)
    for (const m of [-1, 1]) {
      const segs: THREE.BufferGeometry[] = [];
      const lens = [0.12, 0.12, 0.13];
      const ws = [0.07, 0.066, 0.052];
      for (let k = 0; k < 3; k++) {
        segs.push(tailSeg(P, lens[k], ws[k], ws[k + 1] ?? ws[k] * 0.4, k === 2, seg, radial, m));
      }
      extras.push({ at: sph(h, [m * 1.85, 0.3, 1.16]), geos: segs, seg: 0.12, kind: 'tail', side: m });
    }
  }
  const main = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return { main, extras };
}

/** 양갈래 한 마디: 위에서 아래로(-y) 길이 len, 굵기 w0 → w1, 끝 마디는 둥글게 + 바깥으로 살짝 말림 */
function tailSeg(P: Painter, len: number, w0: number, w1: number, last: boolean, seg: number, radial: number, side: number): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], sf: number[] = [], idx: number[] = [];
  const cc = new THREE.Color(), v = new THREE.Vector3();
  const rows = Math.max(3, Math.round(seg * 0.6));
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const y = -u * len * (last ? 1.15 : 1.08);
    const cx = last ? side * 0.03 * u * u : 0;
    const round = last ? Math.sqrt(Math.max(0, 1 - Math.pow(u, 3))) : 1;
    const bulge = 1 + 0.12 * Math.sin(u * PI);
    const w = THREE.MathUtils.lerp(w0, last ? w0 * 0.85 : w1, u) * round * bulge;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * PI * 2;
      v.set(cx + Math.cos(a) * w, y, Math.sin(a) * w * 0.82);
      pos.push(v.x, v.y, v.z);
      cc.copy(P.base).lerp(P.shade, 0.25 + 0.2 * Math.max(0, -Math.sin(a))).lerp(P.shine, 0.15 * Math.exp(-(((u - 0.3) / 0.15) ** 2)) * Math.max(0, Math.cos(a - side * 1.2)));
      col.push(cc.r, cc.g, cc.b);
      sf.push(...SURF.hair);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, b, c, b, d, c);
  }
  // 위·아래 마개
  const top = pos.length / 3;
  pos.push(0, 0, 0); cc.copy(P.shade); col.push(cc.r, cc.g, cc.b); sf.push(...SURF.hair);
  for (let j = 0; j < radial; j++) idx.push(top, (j + 1) % radial, j);
  const bot = pos.length / 3, lr = rows * radial;
  pos.push(last ? side * 0.03 : 0, -len * (last ? 1.15 : 1.08), 0); cc.copy(P.base); col.push(cc.r, cc.g, cc.b); sf.push(...SURF.hair);
  for (let j = 0; j < radial; j++) idx.push(lr + j, lr + ((j + 1) % radial), bot);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('surf', new THREE.Float32BufferAttribute(sf, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 머리 정수리 바로 위(모자·더듬이 자리) */
export function crownPoint(h: HeadR): THREE.Vector3 { return new THREE.Vector3(0.02, h.ry * 1.02, -0.03); }
