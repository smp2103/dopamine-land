// 동물 머리 조형: 구를 해석적으로 빚는다(볼 통통 · 턱 살짝 · 이마 둥글 · 얼굴 앞면 평평 · 뒤통수 볼록 · 볼 털 뭉치).
// 같은 식(headPoint)으로 귀·주둥이 자리를 곡면에 정확히 붙인다.
// 머리 무늬(판다 눈가 · 너구리 가면 · 고양이 줄무늬 · 뒤통수 무늬 …)는 정점이 아니라 등장방형 텍스처로 —
// 캔버스 없이 픽셀마다 3D 방향으로 그려서(노드 테스트에서도 된다) 앞·뒤 어디든 무늬를 넣는다.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { seg } from '../geo';

export interface HeadShape {
  rx: number; ry: number; rz: number;
  /** 아래 옆 볼 통통 */
  cheek: number;
  /** 턱 모으기 */
  jaw: number;
  /** 앞면 평평 */
  flat: number;
  /** 뒤통수 볼록 */
  back: number;
  /** 볼 털 뭉치(옆 지그재그) 세기 · 갈래 수 */
  ruff?: number;
  ruffN?: number;
  /** 정수리 납작(고양이·개구리) */
  topFlat?: number;
  /** 이마 볼록 */
  brow?: number;
  /** 뒷목 털 뭉치(뒤 아래 지그재그) — 뒤에서 본 실루엣 */
  nape?: number;
  /** 볼 통통을 뒤로 갈수록 줄이기 0..1(햄스터: 뒤에서 버섯 갓처럼 안 퍼지게 아래로 둥글게 말린다) */
  cheekBack?: number;
}

/** smoothstep(x, e0, e1) — e0 > e1 이면 내려가는 쪽(THREE 것은 거꾸로 된 경계를 계단으로 만든다) */
const ss = (x: number, e0: number, e1: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const tri = (x: number) => 1 - Math.abs(((x % 1) + 1) % 1 * 2 - 1);

/** 단위 방향 → 빚은 머리 겉면 점 */
export function headPoint(s: HeadShape, dx: number, dy: number, dz: number, out = new THREE.Vector3()): THREE.Vector3 {
  const fz = Math.max(0, dz);
  const ax = Math.abs(dx);
  const cheek = 1 + s.cheek * Math.exp(-(((dy + 0.38) / 0.32) ** 2)) * (0.35 + 0.65 * Math.min(1, ax + fz * 0.5)) * (1 - (s.cheekBack ?? 0) * ss(-dz, -0.85, 0.05));
  const jaw = 1 - s.jaw * ss(-dy, 0.55, 1.0);
  const brow = 1 + (s.brow ?? 0.035) * Math.exp(-(((dy - 0.35) / 0.3) ** 2)) * fz;
  const flat = 1 - s.flat * ss(dz, 0.5, 1.0);
  const back = 1 + s.back * ss(-dz, 0.0, 0.9) * (0.6 + 0.4 * Math.max(0, dy + 0.3));
  let ruff = 1;
  if (s.ruff) {
    // 옆 아래 볼 털: 위아래로 갈래진 뾰족 뭉치(정면·뒤에서 다 실루엣에 걸린다)
    const mask = ss(ax, 0.45, 0.92) * Math.exp(-(((dy + 0.28) / 0.3) ** 2)) * (0.55 + 0.45 * ss(dz, -0.6, 0.3));
    ruff = 1 + s.ruff * mask * (0.35 + 0.65 * Math.pow(tri(dy * (s.ruffN ?? 3) + 0.5), 1.6));
  }
  if (s.nape) {
    const az = Math.atan2(dx, dz);
    const bk = Math.PI - Math.abs(az);
    const mask = ss(-dz, 0.1, 0.75) * Math.exp(-(((dy + 0.5) / 0.24) ** 2));
    ruff *= 1 + s.nape * mask * (0.3 + 0.7 * Math.pow(tri(bk * 1.6 + 0.5), 1.5));
  }
  const top = 1 - (s.topFlat ?? 0) * ss(dy, 0.55, 1.0);
  return out.set(dx * s.rx * cheek * jaw * ruff, dy * s.ry * top, dz * s.rz * cheek * jaw * brow * flat * back * (1 + (ruff - 1) * 0.4));
}

/** 머리 겉면 점(위도 el · 방위 az, 0 = 정면 +z) + 바깥 거리 k */
export function headAt(s: HeadShape, az: number, el: number, k = 1): THREE.Vector3 {
  const p = headPoint(s, Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  return p.multiplyScalar(k);
}

/**
 * 머리 지오메트리: SphereGeometry 의 UV(등장방형)를 그대로 두고 정점을 빚는다.
 * 법선은 이음매를 합친 복사본에서 구해 옮긴다(이음매 줄이 안 보이게).
 */
export function headGeo(s: HeadShape, ws = 72, hs = 54): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg(ws, 12), seg(hs, 9));
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    headPoint(s, x, y, z, v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  smoothSeams(g);
  return g;
}

/** 이음매 정점을 합친 복사본으로 법선을 구해 원본(UV 이음매 유지)에 옮긴다 */
export function smoothSeams(g: THREE.BufferGeometry): void {
  const c = g.clone();
  c.deleteAttribute('uv');
  c.deleteAttribute('normal');
  const m = mergeVertices(c, 1e-5);
  m.computeVertexNormals();
  const mp = m.attributes.position as THREE.BufferAttribute, mn = m.attributes.normal as THREE.BufferAttribute;
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
  const map = new Map<string, number>();
  for (let i = 0; i < mp.count; i++) map.set(key(mp.getX(i), mp.getY(i), mp.getZ(i)), i);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const j = map.get(key(p.getX(i), p.getY(i), p.getZ(i)));
    if (j === undefined) continue;
    n[i * 3] = mn.getX(j); n[i * 3 + 1] = mn.getY(j); n[i * 3 + 2] = mn.getZ(j);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  m.dispose(); c.dispose();
}

// ───────────── 머리 무늬 텍스처 ─────────────
/** 무늬 칠하기: (정규화 앞 좌표 X=x/rx, Y=y/ry, 앞쪽 정도 Z=z/rz, 방위 az, 위도 el) → 색 섞기 */
export type HeadPaint = (q: { X: number; Y: number; Z: number; az: number; el: number; dx: number; dy: number; dz: number }, mix: (col: THREE.Color, a: number) => void) => void;

const headTexCache = new Map<string, THREE.Texture>();
/** 무늬 텍스처(키가 같으면 주민끼리 같이 쓴다). 512×256 등장방형. */
export function headTexture(key: string, s: HeadShape, base: string, paint: HeadPaint, w = 512, h = 256): THREE.Texture {
  const k = `${key}|${base}|${s.rx},${s.ry},${s.rz}`;
  const hit = headTexCache.get(k);
  if (hit) return hit;
  const data = new Uint8Array(w * h * 4);
  const col = new THREE.Color();
  const b = new THREE.Color(base); // ColorManagement: 이미 선형
  const v = new THREE.Vector3();
  // 픽셀마다 새 객체·클로저를 만들지 않는다(주민이 놀이 중에 생겨서 13만 번 도는 이 루프가 곧 프레임 끊김)
  const cphi = new Float64Array(w), sphi = new Float64Array(w), azs = new Float64Array(w);
  for (let i = 0; i < w; i++) {
    const phi = ((i + 0.5) / w) * Math.PI * 2;
    cphi[i] = Math.cos(phi); sphi[i] = Math.sin(phi);
    azs[i] = Math.atan2(-cphi[i], sphi[i]);
  }
  const q = { X: 0, Y: 0, Z: 0, az: 0, el: 0, dx: 0, dy: 0, dz: 0 };
  const mix = (c: THREE.Color, a: number) => {
    if (a <= 0) return;
    const t = a >= 1 ? 1 : a;
    col.r += (c.r - col.r) * t; col.g += (c.g - col.g) * t; col.b += (c.b - col.b) * t;
  };
  // 선형 → sRGB 표(256 단계 근사 대신 4096 단계 — 그라데이션 띠가 안 보이게)
  const LUT_N = 4096, lut = new Uint8Array(LUT_N + 1);
  for (let i = 0; i <= LUT_N; i++) {
    const c = i / LUT_N;
    lut[i] = Math.round((c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055) * 255);
  }
  const enc = (x: number) => lut[Math.round((x < 0 ? 0 : x > 1 ? 1 : x) * LUT_N)];
  const rgb = new Float32Array(w * h * 3);
  const rowSt = new Float64Array(h), rowDy = new Float64Array(h), rowEl = new Float64Array(h);
  for (let j = 0; j < h; j++) {
    // DataTexture 는 flipY 가 없다: 0 번 줄 = v 0(아래)
    const theta = (1 - (j + 0.5) / h) * Math.PI;
    rowSt[j] = Math.sin(theta); rowDy[j] = Math.cos(theta);
    rowEl[j] = Math.asin(THREE.MathUtils.clamp(rowDy[j], -1, 1));
  }
  const sample = (i: number, j: number) => {
    const st = rowSt[j], dy = rowDy[j];
    const dx = -cphi[i] * st, dz = sphi[i] * st;
    headPoint(s, dx, dy, dz, v);
    col.copy(b);
    q.X = v.x / s.rx; q.Y = v.y / s.ry; q.Z = v.z / s.rz; q.az = azs[i]; q.el = rowEl[j]; q.dx = dx; q.dy = dy; q.dz = dz;
    paint(q, mix);
    const o = (j * w + i) * 3;
    rgb[o] = col.r; rgb[o + 1] = col.g; rgb[o + 2] = col.b;
  };
  // 사이 픽셀: 이웃 둘이 거의 같은 색이면 평균, 아니면(무늬 가장자리) 정확히 칠한다 — 칠하기 횟수가 1/3 남짓으로 준다
  const TOL = 0.012;
  const fill = (o: number, o1: number, o2: number) => {
    if (Math.abs(rgb[o1] - rgb[o2]) > TOL || Math.abs(rgb[o1 + 1] - rgb[o2 + 1]) > TOL || Math.abs(rgb[o1 + 2] - rgb[o2 + 2]) > TOL) return false;
    rgb[o] = (rgb[o1] + rgb[o2]) * 0.5; rgb[o + 1] = (rgb[o1 + 1] + rgb[o2 + 1]) * 0.5; rgb[o + 2] = (rgb[o1 + 2] + rgb[o2 + 2]) * 0.5;
    return true;
  };
  for (let j = 0; j < h; j += 2) {
    for (let i = 0; i < w; i += 2) sample(i, j);
    for (let i = 1; i < w; i += 2) {
      const r = j * w;
      if (!fill((r + i) * 3, (r + i - 1) * 3, (r + ((i + 1) % w)) * 3)) sample(i, j);
    }
  }
  for (let j = 1; j < h; j += 2) {
    for (let i = 0; i < w; i++) {
      if (j + 1 >= h || !fill((j * w + i) * 3, ((j - 1) * w + i) * 3, ((j + 1) * w + i) * 3)) sample(i, j);
    }
  }
  for (let k = 0, n = w * h; k < n; k++) {
    data[k * 4] = enc(rgb[k * 3]);
    data[k * 4 + 1] = enc(rgb[k * 3 + 1]);
    data[k * 4 + 2] = enc(rgb[k * 3 + 2]);
    data[k * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  t.userData.shared = true;
  headTexCache.set(k, t);
  return t;
}

const WH = new THREE.Vector3(0.12, 0.8, -0.58).normalize();
/**
 * 털 결(뒤통수): 정수리 뒤 가마에서 퍼져 내려가는 덩어리 결 — 결 사이 홈은 진하게, 덩어리 가운데는 밝게. 0..1 두 값.
 * 텍스처 방향 (dx,dy,dz) 를 받는다.
 */
export function furLocks(dx: number, dy: number, dz: number, n = 7): { groove: number; crest: number } {
  furLocksInto(dx, dy, dz, n, FL);
  return { groove: FL.groove, crest: FL.crest };
}
// 가마 둘레 기준 축(상수) — 픽셀마다 벡터를 새로 만들지 않게 미리 구한다
const FU = new THREE.Vector3(1, 0, 0), FV = new THREE.Vector3().crossVectors(WH, FU).normalize();
const FL = { groove: 0, crest: 0 };
/** furLocks 의 할당 없는 판(결과를 out 에 쓴다) */
export function furLocksInto(dx: number, dy: number, dz: number, n: number, out: { groove: number; crest: number }): { groove: number; crest: number } {
  const dw = dx * WH.x + dy * WH.y + dz * WH.z;
  const r = Math.acos(dw < -1 ? -1 : dw > 1 ? 1 : dw);
  const th = Math.atan2(dx * FV.x + dy * FV.y + dz * FV.z, dx);
  const w = Math.sin(th * n + r * 2.6);
  const fade = ss(r, 0.08, 0.35) * ss(r, 1.9, 1.3);
  out.groove = fade * ss(-w, 0.55, 0.95); out.crest = fade * ss(w, 0.4, 0.95);
  return out;
}

/** 칠하기 도우미: 부드러운 가장자리(e) 타원 덮임 0..1 */
export function ell(X: number, Y: number, cx: number, cy: number, rx: number, ry: number, rot = 0, e = 0.025): number {
  const c = Math.cos(rot), s = Math.sin(rot);
  const x = (X - cx) * c + (Y - cy) * s, y = -(X - cx) * s + (Y - cy) * c;
  const d = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2) - 1;
  return 1 - ss(d * Math.min(rx, ry), -e, e);
}

/** 선형 경계 덮임: v < edge 쪽이 1 */
export function below(v: number, edge: number, e = 0.03): number {
  return 1 - ss(v, edge - e, edge + e);
}
