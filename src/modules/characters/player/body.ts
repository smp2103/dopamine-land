// 플레이어 몸 부품(정점 색 + 표면): 조각한 찹쌀떡 머리, 옷 4벌(젤리 원피스 · 후드+반바지 · 멜빵 · 세일러), 팔(소매 · 팔꿈치 · 엄지 벙어리 손),
// 다리(무릎 · 통통 젤리 운동화), 말랑 주머니(젤리 방울 + 대롱대롱 별), 모자·핀(토토 별 핀 · 꽃 핀 · 젤리 모자 · 꿀 벙거지).
// 모두 '몸 재질' 하나로 그리도록 Batch 에 색·표면을 칠해 담는다(관절마다 메시 하나).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ellipsoid, lathe, capsule } from '../geo';
import { Batch, SURF, painted, rng, type Surf } from './mats';
import { sph, type HeadR } from './hair';
import type { Outfit, Hat } from './look';

const sstep = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ── 치수(루트 배율 1.12 전) ──
export const HIP_Y = 0.27;
export const SHOULDER_Y = 0.515;
export const HEAD_Y = 0.84;
export const H: HeadR = { rx: 0.312, ry: 0.288, rz: 0.292 };
export const ELBOW = 0.11;
export const HAND = 0.138;
export const KNEE = 0.125;
export const WHITE = '#fffaf4';
export const LEMON = '#ffd75a';
export const GOLD = '#ffc94a';

/** 둥근 상자(초타원체) */
export function roundBox(sx: number, sy: number, sz: number, p = 0.45, ws = 24, hs = 16): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const a = g.attributes.position as THREE.BufferAttribute;
  const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), p);
  for (let i = 0; i < a.count; i++) a.setXYZ(i, f(a.getX(i)) * sx, f(a.getY(i)) * sy, f(a.getZ(i)) * sz);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-6);
  m.computeVertexNormals();
  return m;
}
const ring = (r: number, tube: number, rs = 10, ts = 40) => new THREE.TorusGeometry(r, tube, rs, ts).rotateX(Math.PI / 2);
function tube(pts: THREE.Vector3[], r: number, seg = 24, rad = 8, closed = false): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), seg, r, rad, closed);
}
/** 다섯 꼭지 통통 별 */
export function starGeo(r: number, depth: number, curve = 3): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r * 0.5 : r;
    if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: r * 0.22, bevelThickness: r * 0.3, bevelSegments: curve, curveSegments: 2 });
  g.center();
  return g;
}
/** 하트(주머니 속 젤리 알맹이) */
export function heartGeo(s: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(0, -s);
  sh.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.9, s * 1.05, 0, s * 0.35);
  sh.bezierCurveTo(s * 0.9, s * 1.05, s * 1.4, -s * 0.1, 0, -s);
  const g = new THREE.ExtrudeGeometry(sh, { depth: s * 0.5, bevelEnabled: true, bevelSize: s * 0.25, bevelThickness: s * 0.25, bevelSegments: 3, curveSegments: 10 });
  g.center();
  return g;
}

// ───────────── 머리 조각 ─────────────
/** 단위 구 위 점 → 조각한 머리 표면(턱은 짧고 좁게, 볼 통통, 이마 둥글, 코 혹, 뒤통수 넉넉) */
export function sculpt(x: number, y: number, z: number, r: HeadR, out: THREE.Vector3): THREE.Vector3 {
  const fz = Math.max(0, z);
  const front = sstep(z, -0.1, 0.7);
  const cheek = 1 + 0.1 * Math.exp(-(((y + 0.42) / 0.27) ** 2)) * (0.4 + 0.6 * fz) * sstep(Math.abs(x), 0.05, 0.55);
  const jaw = 1 - 0.17 * sstep(-y, 0.42, 1.0);
  const brow = 1 + 0.03 * Math.exp(-(((y - 0.38) / 0.3) ** 2)) * fz;
  const flat = 1 - 0.065 * sstep(z, 0.5, 1.0);
  const back = z < 0 ? 1 + 0.05 * sstep(-z, 0, 0.6) : 1;
  // 아래 얼굴을 짧게(턱이 길면 '달덩이')
  const yy = y < 0 ? y * (1 - 0.15 * sstep(-y, 0.15, 1.0)) : y;
  let Z = z * r.rz * cheek * jaw * brow * flat * back;
  // 코 혹 없음(반짝 인형) — 턱끝만 살짝 앞으로
  Z += 0.006 * Math.exp(-(((y + 0.82) / 0.12) ** 2)) * front;
  return out.set(x * r.rx * cheek * jaw, yy * r.ry, Z);
}

/** 머리 지오메트리: 그룹 0 = 얼굴 판(uv), 그룹 1 = 나머지 피부(정점 색). 이음매 없이 법선이 이어진다 */
export function headGeo(r: HeadR, skin: string, ws = 72, hs = 54): THREE.BufferGeometry {
  const base = new THREE.SphereGeometry(1, ws, hs);
  base.deleteAttribute('uv');
  base.deleteAttribute('normal');
  const g = mergeVertices(base, 1e-6);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    sculpt(p.getX(i), p.getY(i), p.getZ(i), r, v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = 0.5 + p.getX(i) / (2 * r.rx);
    uv[i * 2 + 1] = 0.5 + p.getY(i) / (2 * r.ry);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const pg = painted(g, skin, SURF.skin, true);
  const idx = pg.index!.array;
  const front: number[] = [], backI: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    (p.getZ(a) + p.getZ(b) + p.getZ(c) > 0.3 * r.rz ? front : backI).push(a, b, c);
  }
  pg.setIndex([...front, ...backI]);
  pg.clearGroups();
  pg.addGroup(0, front.length, 0);
  pg.addGroup(front.length, backI.length, 1);
  return pg;
}

/** 얼굴 판 위 점(F = 얼굴 좌표) → 머리 표면 위치·법선 */
export function onFace(r: HeadR, fx: number, fy: number, lift = 0): { p: THREE.Vector3; n: THREE.Vector3 } {
  const z = Math.sqrt(Math.max(0.05, 1 - fx * fx - fy * fy));
  const d = new THREE.Vector3(fx, fy, z).normalize();
  const p = sculpt(d.x, d.y, d.z, r, new THREE.Vector3());
  const e = 1e-3;
  const px = sculpt(d.x + e, d.y, d.z, r, new THREE.Vector3()).sub(p);
  const py = sculpt(d.x, d.y + e, d.z, r, new THREE.Vector3()).sub(p);
  const n = new THREE.Vector3().crossVectors(px, py).normalize();
  if (n.z < 0) n.negate();
  p.addScaledVector(n, lift);
  return { p, n };
}

// ───────────── 옷 ─────────────
export interface Palette { main: string; deep: string; pants: string; skin: string; shoe: string; shoeLight: string }

interface Prof { pts: Array<[number, number]>; z: number }
/** 옷 몸판 단면(반지름, 높이) — 아래→위 */
const PROFILES: Record<Outfit, Prof> = {
  smock: { pts: [[0.15, 0.216], [0.2, 0.21], [0.212, 0.225], [0.198, 0.27], [0.175, 0.35], [0.162, 0.43], [0.152, 0.5], [0.125, 0.55], [0.07, 0.58], [0.0, 0.585]], z: 0.86 },
  hoodie: { pts: [[0.0, 0.252], [0.17, 0.256], [0.188, 0.278], [0.185, 0.32], [0.177, 0.4], [0.166, 0.48], [0.15, 0.53], [0.118, 0.565], [0.07, 0.585], [0, 0.59]], z: 0.84 },
  overalls: { pts: [[0.0, 0.25], [0.158, 0.254], [0.168, 0.28], [0.166, 0.36], [0.158, 0.45], [0.146, 0.51], [0.12, 0.555], [0.07, 0.58], [0, 0.586]], z: 0.84 },
  sailor: { pts: [[0.0, 0.27], [0.165, 0.274], [0.178, 0.3], [0.172, 0.38], [0.16, 0.46], [0.148, 0.515], [0.12, 0.555], [0.07, 0.58], [0, 0.586]], z: 0.84 },
};

/** 회전체 바깥 반지름(높이 y) */
function radiusFn(pts: Array<[number, number]>): (y: number) => number {
  const s = new THREE.CatmullRomCurve3(pts.map(([r, yy]) => V(r, yy, 0)), false, 'centripetal').getPoints(300);
  return (y: number) => {
    let best = 0;
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i], b = s[i + 1];
      if ((a.y - y) * (b.y - y) <= 0 && Math.max(a.x, b.x) > 0.05) best = Math.max(best, lerp(a.x, b.x, (y - a.y) / ((b.y - a.y) || 1)));
    }
    return best;
  };
}

export interface TorsoOut { r: (y: number) => number; z: number }

/** 젤리 자락 스목 몸판: 밑단이 젤리처럼 주르륵(짧은 방울 몇 개) */
function smockGeo(seg: number, samples: number): THREE.BufferGeometry {
  const g0 = lathe(PROFILES.smock.pts, seg, samples);
  g0.deleteAttribute('uv');
  g0.deleteAttribute('normal');
  const g = mergeVertices(g0, 1e-6);
  const p = g.attributes.position as THREE.BufferAttribute;
  const R = rng(20261028);
  const drips = Array.from({ length: 11 }, (_, i) => (i % 2 ? 0.014 : 0.028) + R() * 0.012);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const az = Math.atan2(x, z);
    let d = 0;
    drips.forEach((dk, k) => {
      let da = az - (k / drips.length) * Math.PI * 2;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      d += dk * Math.exp(-((da / 0.2) ** 2));
    });
    p.setXYZ(i, x, y - d * (1 - sstep(y, 0.225, 0.29)), z * PROFILES.smock.z);
  }
  g.computeVertexNormals();
  return g;
}

/** 물결 옷깃(스목) */
function ruffleGeo(): THREE.BufferGeometry {
  const g0 = lathe([[0.07, 0.6], [0.11, 0.592], [0.152, 0.565], [0.174, 0.54], [0.172, 0.527], [0.148, 0.54], [0.1, 0.567], [0.068, 0.582]], 64, 24);
  g0.deleteAttribute('uv');
  g0.deleteAttribute('normal');
  const g = mergeVertices(g0, 1e-6);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z), az = Math.atan2(x, z);
    const outer = sstep(r, 0.12, 0.172);
    const petal = 1 + 0.07 * outer * Math.cos(az * 8);
    const notch = 1 - 0.25 * outer * Math.exp(-((az / 0.16) ** 2));
    p.setXYZ(i, x * petal * notch, y - 0.01 * outer * Math.cos(az * 8), z * petal * notch * 0.86);
  }
  g.computeVertexNormals();
  return g;
}

/** 세일러 깃: 등에 네모 깃 + 앞으로 V 자 */
function sailorCollarGeo(): THREE.BufferGeometry {
  const g0 = lathe([[0.072, 0.6], [0.12, 0.585], [0.165, 0.548], [0.176, 0.52], [0.172, 0.505], [0.15, 0.52], [0.1, 0.56], [0.07, 0.58]], 64, 24);
  g0.deleteAttribute('uv');
  g0.deleteAttribute('normal');
  const g = mergeVertices(g0, 1e-6);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const az = Math.atan2(x, z), back = sstep(Math.abs(az), 1.6, 2.6), r = Math.hypot(x, z);
    const outer = sstep(r, 0.11, 0.17);
    // 뒤는 아래로 길게 늘어진 네모, 앞은 V 로 갈라짐
    const dy = -0.06 * back * outer;
    const v = 1 - 0.6 * outer * Math.exp(-((az / 0.35) ** 2));
    p.setXYZ(i, x * v, y + dy - 0.03 * outer * Math.exp(-((az / 0.35) ** 2)), z * v * 0.84 - 0.01 * back * outer);
  }
  g.computeVertexNormals();
  return g;
}

/** 몸판(옷) 묶음 — 엉덩이 피벗 아래(-HIP_Y) 기준이 아니라 발바닥 기준 좌표로 담고, 호출하는 쪽이 옮긴다 */
export function torsoBatch(b: Batch, outfit: Outfit, pal: Palette, lo: boolean): TorsoOut {
  const P = PROFILES[outfit];
  const seg = lo ? 16 : 64, sm = lo ? 10 : 36;
  const r = radiusFn(P.pts);
  const zz = P.z;
  const grad = (top: string, bot: string, y0: number, y1: number) => {
    const a = new THREE.Color(top), c = new THREE.Color(bot), o = new THREE.Color();
    return (p: THREE.Vector3) => o.copy(c).lerp(a, sstep(p.y, y0, y1)).getHex();
  };
  const front = (y: number, lift = 0.004) => r(y) * zz + lift;
  if (outfit === 'smock') {
    b.add(smockGeo(seg, sm), grad(pal.main, pal.deep, 0.2, 0.36), SURF.cloth);
    // 블루머(아래로 살짝)
    b.add(lathe([[0.0, 0.19], [0.1, 0.188], [0.16, 0.21], [0.17, 0.25], [0.163, 0.29], [0.0, 0.31]], lo ? 12 : 40, lo ? 6 : 16), pal.pants, SURF.cloth, 0, 0, 0, 0, 0, 0, [1, 1, 0.86]);
    if (lo) return { r, z: zz };
    b.add(ruffleGeo(), WHITE, SURF.cloth);
    // 허리 띠 선 + 앞주머니(오른쪽 아래) + 젤리 단추 둘
    b.add(ring(r(0.36) + 0.002, 0.0065, 8, 64), pal.deep, SURF.cloth, 0, 0.36, 0, 0, 0, 0, [1, 1, zz]);
    const pk = roundBox(0.048, 0.04, 0.012, 0.5);
    b.add(pk, pal.deep, SURF.cloth, -0.085, 0.29, front(0.29) - 0.012, -0.22, -0.45, 0.06);
    b.add(ring(0.04, 0.005, 6, 28), WHITE, SURF.cloth, -0.085, 0.322, front(0.322) - 0.012, -0.22 + 0.0, -0.45, 0, [1, 1, 0.3]);
    for (const y of [0.47, 0.41]) b.add(ellipsoid(0.017, 0.017, 0.01, 14, 10), LEMON, SURF.candy, 0, y, front(y));
  } else if (outfit === 'hoodie') {
    b.add(lathe(P.pts, seg, sm), grad(pal.main, pal.deep, 0.27, 0.42), SURF.cloth, 0, 0, 0, 0, 0, 0, [1, 1, zz]);
    b.add(lathe([[0, 0.2], [0.152, 0.205], [0.172, 0.245], [0.168, 0.285], [0, 0.295]], lo ? 12 : 40, 10), pal.pants, SURF.cloth, 0, 0, 0, 0, 0, 0, [1, 1, zz]);
    if (lo) return { r, z: zz };
    b.add(ring(0.183, 0.017), pal.deep, SURF.knit, 0, 0.262, 0, 0, 0, 0, [1, 1, zz]);
    b.add(ring(0.068, 0.015), pal.deep, SURF.knit, 0, 0.585, 0.004, 0, 0, 0, [1, 1, 0.92]);
    // 캥거루 주머니 + 입구 그늘
    b.add(roundBox(0.1, 0.05, 0.02, 0.55), pal.deep, SURF.cloth, 0, 0.335, front(0.335) - 0.008, -0.12);
    b.add(roundBox(0.092, 0.006, 0.01, 0.6), new THREE.Color(pal.deep).multiplyScalar(0.75).getHex(), SURF.cloth, 0, 0.383, front(0.383) + 0.004, -0.12);
    // 뒤로 접힌 모자
    const hood: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const a = -1.25 + (i / 8) * 2.5; hood.push(V(Math.sin(a) * 0.1, 0.59 + 0.012 * Math.cos(a), -Math.cos(a) * 0.085 - 0.012)); }
    b.add(tube(hood, 0.034, 32, 12), pal.deep, SURF.cloth);
    b.add(roundBox(0.11, 0.075, 0.03, 0.7), pal.main, SURF.cloth, 0, 0.53, -0.125, 0.35);
    // 후드 끈 두 가닥 + 끝 고무
    for (const m of [-1, 1]) {
      b.add(tube([V(m * 0.03, 0.58, 0.1), V(m * 0.036, 0.54, 0.128), V(m * 0.04, 0.48, 0.14), V(m * 0.042, 0.45, 0.142)], 0.0065, 12, 6), WHITE, SURF.cloth);
      b.add(capsule(0.0095, 0.03), '#ff7f86', SURF.candy, m * 0.042, 0.438, 0.143);
    }
  } else if (outfit === 'overalls') {
    // 속 티(크림) + 멜빵 바지(옷 색)
    b.add(lathe(P.pts, seg, sm), '#fff6ea', SURF.cloth, 0, 0, 0, 0, 0, 0, [1, 1, zz]);
    b.add(lathe([[0, 0.2], [0.152, 0.205], [0.172, 0.245], [0.172, 0.33], [0.166, 0.37], [0, 0.375]], lo ? 12 : 40, 12), pal.main, SURF.cloth, 0, 0, 0, 0, 0, 0, [1, 1, zz + 0.02]);
    if (lo) return { r, z: zz };
    b.add(ring(r(0.37) + 0.012, 0.008, 8, 48), pal.deep, SURF.cloth, 0, 0.37, 0, 0, 0, 0, [1, 1, zz + 0.02]);
    // 가슴 받이 + 주머니 + 단추 + 멜빵 끈(앞 → 어깨 → 등에서 X)
    b.add(roundBox(0.085, 0.07, 0.02, 0.45), pal.main, SURF.cloth, 0, 0.43, front(0.43) - 0.006, -0.08);
    b.add(roundBox(0.04, 0.03, 0.008, 0.5), pal.deep, SURF.cloth, 0, 0.44, front(0.44) + 0.01, -0.08);
    for (const m of [-1, 1]) {
      b.add(ellipsoid(0.014, 0.014, 0.008, 12, 8), LEMON, SURF.candy, m * 0.068, 0.49, front(0.49) + 0.006);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const y = lerp(0.5, 0.585, sstep(u, 0, 0.45)) - 0.17 * sstep(u, 0.55, 1);
        const a = lerp(m * 0.4, m * 2.6, u);
        const rr = (y > 0.55 ? 0.09 : r(y)) + 0.008;
        pts.push(V(Math.sin(a) * rr, y, Math.cos(a) * rr * zz));
      }
      b.add(tube(pts, 0.012, 36, 6), pal.deep, SURF.cloth);
    }
    b.add(ring(0.066, 0.012), '#fff6ea', SURF.knit, 0, 0.585, 0.004, 0, 0, 0, [1, 1, 0.92]);
  } else {
    // 세일러: 흰 몸판 + 옷 색 깃(흰 줄) + 리본 + 반바지
    b.add(lathe(P.pts, seg, sm), grad(WHITE, '#eef0fa', 0.3, 0.45), SURF.cloth, 0, 0, 0, 0, 0, 0, [1, 1, zz]);
    b.add(lathe([[0, 0.2], [0.152, 0.205], [0.172, 0.245], [0.17, 0.3], [0, 0.31]], lo ? 12 : 40, 10), pal.pants === '#ffffff' ? pal.deep : pal.pants, SURF.cloth, 0, 0, 0, 0, 0, 0, [1, 1, zz]);
    if (lo) return { r, z: zz };
    b.add(sailorCollarGeo(), (p) => (Math.abs(Math.hypot(p.x, p.z / 0.84) - 0.158) < 0.006 ? WHITE : pal.main), SURF.cloth);
    b.add(ring(0.175, 0.012), pal.main, SURF.cloth, 0, 0.282, 0, 0, 0, 0, [1, 1, zz]);
    // 리본(빨강 젤리): 매듭 + 두 날개 + 꼬리
    const ry = 0.505;
    b.add(ellipsoid(0.018, 0.016, 0.012, 14, 10), '#ff6f86', SURF.candy, 0, ry, front(ry) + 0.012);
    for (const m of [-1, 1]) {
      b.add(ellipsoid(0.034, 0.02, 0.01, 16, 10), '#ff6f86', SURF.candy, m * 0.032, ry + 0.004, front(ry) + 0.008, 0, 0, m * -0.25);
      b.add(roundBox(0.012, 0.035, 0.006, 0.6), '#ff6f86', SURF.candy, m * 0.014, ry - 0.04, front(ry - 0.04) + 0.01, -0.15, 0, m * 0.2);
    }
  }
  return { r, z: zz };
}

/** 가방끈: 오른 어깨 → 가슴 → 왼 엉덩이 비스듬한 고리 */
export function strapPoint(t: TorsoOut, a: number, out = 0.009): THREE.Vector3 {
  const y = 0.425 - 0.11 * Math.sin(a) + 0.015 * Math.cos(a);
  const r = t.r(y) + out;
  return V(Math.sin(a) * r, y, Math.cos(a) * r * t.z);
}

// ───────────── 팔 ─────────────
/** 소매 + 윗팔(어깨 피벗 기준) */
export function upperArmBatch(b: Batch, outfit: Outfit, pal: Palette, m: number, lo: boolean): void {
  const sl = outfit === 'sailor' ? WHITE : outfit === 'overalls' ? '#fff6ea' : pal.main;
  if (outfit === 'smock') {
    // 퍼프 소매
    b.add(lathe([[0, 0.035], [0.055, 0.026], [0.076, -0.015], [0.074, -0.062], [0.06, -0.09], [0.04, -0.086]], lo ? 10 : 36, lo ? 6 : 20), pal.main, SURF.cloth);
    if (!lo) b.add(ring(0.05, 0.008, 8, 28), WHITE, SURF.cloth, 0, -0.085, 0);
  } else {
    b.add(lathe([[0, 0.04], [0.056, 0.03], [0.074, -0.01], [0.077, -0.065], [0.072, -0.085], [0.05, -0.084]], lo ? 10 : 36, lo ? 6 : 20), sl, SURF.cloth, 0, 0, 0, 0, 0, m * -0.05);
    if (!lo) b.add(ring(0.069, 0.011, 8, 32), outfit === 'sailor' ? pal.main : pal.deep, outfit === 'hoodie' ? SURF.knit : SURF.cloth, 0, -0.082, 0);
  }
  // 아래 끝 반구의 중심 = 팔꿈치 피벗 → 팔뚝 위 끝 반구와 같은 자리에서 돌아, 굽혀도 '구슬 셋' 마디 주름이 안 생긴다
  b.add(capsule(0.035, 0.08 + 0.07), pal.skin, SURF.skin, 0, -(0.03 + ELBOW) / 2, 0);
}

/** 팔뚝 + 엄지 벙어리 손(팔꿈치 피벗 기준) */
export function forearmBatch(b: Batch, pal: Palette, m: number, lo: boolean): void {
  b.add(capsule(0.034, 0.1 + 0.068), pal.skin, SURF.skin, 0, -0.05, 0);
  // 벙어리 손(살짝 크게) + 엄지(앞쪽·몸 안쪽)
  b.add(roundBox(0.048, 0.056, 0.04, 0.78, lo ? 10 : 24, lo ? 8 : 18), pal.skin, SURF.skin, 0, -HAND, 0.003);
  if (!lo) {
    b.add(capsule(0.018, 0.054), pal.skin, SURF.skin, -m * 0.02, -HAND + 0.016, 0.03, -0.75, 0, m * 0.55);
    // 손등 살짝 볼록 + 손가락 사이 아주 옅은 홈
    b.add(roundBox(0.03, 0.002, 0.03, 0.8), new THREE.Color(pal.skin).multiplyScalar(0.92).getHex(), SURF.skin, m * 0.006, -HAND - 0.035, 0.012, 0.2);
  }
}

// ───────────── 다리 ─────────────
/** 허벅지 + 바짓단(엉덩이 피벗 기준) */
export function thighBatch(b: Batch, outfit: Outfit, pal: Palette, lo: boolean): void {
  b.add(capsule(0.045, 0.13), pal.skin, SURF.skin, 0, -0.07, 0);
  const cuff = outfit === 'smock' ? pal.pants : outfit === 'overalls' ? pal.main : outfit === 'sailor' ? (pal.pants === '#ffffff' ? pal.deep : pal.pants) : pal.pants;
  const y0 = -HIP_Y;
  if (outfit === 'smock') b.add(lathe([[0.03, 0.235], [0.07, 0.228], [0.08, 0.2], [0.074, 0.172], [0.055, 0.164], [0.042, 0.168]], lo ? 10 : 32, lo ? 6 : 16), cuff, SURF.cloth, 0, y0, 0);
  else {
    b.add(lathe([[0.05, 0.3], [0.088, 0.29], [0.096, 0.23], [0.094, 0.19], [0.088, 0.178], [0.055, 0.182]], lo ? 10 : 32, lo ? 6 : 16), cuff, SURF.cloth, 0, y0, 0);
    if (!lo) b.add(ring(0.091, 0.012, 8, 32), new THREE.Color(cuff).multiplyScalar(0.88).getHex(), SURF.cloth, 0, y0 + 0.186, 0);
  }
}

/** 정강이 + 양말 + 통통 젤리 운동화(무릎 피벗 기준; 발바닥 = -(HIP_Y - KNEE)) */
export function shinBatch(b: Batch, pal: Palette, lo: boolean): void {
  const sole = -KNEE; // 무릎 피벗(바닥에서 KNEE 높이) 기준 발바닥
  b.add(capsule(0.042, 0.11), pal.skin, SURF.skin, 0, sole + 0.12, 0);
  const sz = 0.024;
  // 발목 양말(흰 시보리)
  b.add(lathe([[0.04, 0.075], [0.047, 0.08], [0.049, 0.112], [0.045, 0.118]], lo ? 8 : 24, 8), WHITE, SURF.knit, 0, sole, 0);
  // 윗부분(젤리) + 앞코(밝은 젤리) + 중창(흰) + 밑창 띠 + 끈 + 뒤꿈치 고리
  b.add(roundBox(0.066, 0.05, 0.1, 0.72, lo ? 10 : 28, lo ? 8 : 20), pal.shoe, SURF.jelly, 0, sole + 0.07, sz, 0.06);
  if (lo) { b.add(roundBox(0.074, 0.02, 0.11, 0.5, 10, 6), WHITE, SURF.matte, 0, sole + 0.024, sz); return; }
  b.add(ellipsoid(0.058, 0.036, 0.042, 20, 14), pal.shoeLight, SURF.jelly, 0, sole + 0.056, sz + 0.07);
  b.add(roundBox(0.074, 0.014, 0.112, 0.45, 28, 12), WHITE, SURF.matte, 0, sole + 0.03, sz);
  b.add(roundBox(0.076, 0.01, 0.114, 0.45, 28, 10), pal.shoe, SURF.candy, 0, sole + 0.012, sz);
  for (const [zz, yy] of [[0.03, 0.112], [0.056, 0.1]] as const) b.add(capsule(0.0075, 0.066), WHITE, SURF.matte, 0, sole + yy, sz + zz, 0, 0, Math.PI / 2);
  b.add(roundBox(0.022, 0.026, 0.01, 0.7), WHITE, SURF.matte, 0, sole + 0.098, sz - 0.098);
}

// ───────────── 모자·핀 ─────────────
/** 머리에 붙는 장식(머리 지오메트리 좌표). 돌려주는 값: 더듬이를 숨길지 */
export function hatBatch(b: Batch, hat: Hat, pal: Palette, lo: boolean): { hideAntenna: boolean; lift: number } {
  const pinAt = sph(H, [0.98, 0.45, 1.16]);
  if (hat === 'clip') {
    // 레몬 젤리 핀 + 금빛 '토토' 별(이야기 속 별 친구)
    b.add(ellipsoid(0.026, 0.036, 0.018, 18, 12), LEMON, SURF.candy, pinAt.x, pinAt.y, pinAt.z, 0.2, 0.9, -0.5);
    const s = sph(H, [0.82, 0.62, 1.2]);
    b.add(starGeo(0.034, 0.012, lo ? 1 : 3), GOLD, SURF.jelly, s.x, s.y, s.z, -0.1, 0.75, 0.25);
    return { hideAntenna: false, lift: 0 };
  }
  if (hat === 'flower') {
    const c = sph(H, [0.9, 0.52, 1.18]);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), c.clone().normalize());
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const pp = V(Math.cos(a) * 0.026, Math.sin(a) * 0.026, 0).applyQuaternion(q).add(c);
      const e = new THREE.Euler().setFromQuaternion(q);
      b.add(ellipsoid(0.022, 0.016, 0.01, 14, 10), '#ffffff', SURF.candy, pp.x, pp.y, pp.z, e.x, e.y, e.z + a);
    }
    b.add(ellipsoid(0.016, 0.016, 0.012, 12, 8), LEMON, SURF.candy, c.x, c.y, c.z);
    return { hideAntenna: false, lift: 0 };
  }
  if (hat === 'cap') {
    // 젤리 모자: 둥근 정수리 + 앞챙 + 꼭지 단추 + 별 무늬
    const dome = new THREE.SphereGeometry(1, lo ? 14 : 48, lo ? 8 : 24, 0, Math.PI * 2, 0, Math.PI * 0.47);
    dome.scale(H.rx * 1.14, H.ry * 1.1, H.rz * 1.14).rotateX(-0.22).translate(0, 0.035, -0.005);
    b.add(dome, pal.main, SURF.cloth);
    const brim = roundBox(0.17, 0.012, 0.11, 0.6, lo ? 10 : 32, 8);
    b.add(brim, pal.deep, SURF.cloth, 0, H.ry * 0.68, H.rz * 0.98, 0.32);
    b.add(ellipsoid(0.02, 0.012, 0.02, 12, 8), pal.deep, SURF.cloth, 0, H.ry * 1.15, -0.06);
    if (!lo) { const s = sph(H, [0, 0.78, 1.15]); b.add(starGeo(0.03, 0.008), GOLD, SURF.jelly, s.x, s.y, s.z, -0.75, 0, 0); }
    return { hideAntenna: false, lift: 0.05 };
  }
  if (hat === 'bucket') {
    // 꿀 벙거지: 통 + 처진 챙 + 민트 띠 + 토토 별 핀
    const crownG = lathe([[0.25, 0.0], [0.248, 0.06], [0.235, 0.12], [0.2, 0.165], [0.12, 0.185], [0.0, 0.185]], lo ? 16 : 56, lo ? 8 : 24);
    crownG.scale(1, 1, 0.97).rotateX(-0.14).translate(0, H.ry * 0.5, -0.012);
    b.add(crownG, '#ffc95c', SURF.cloth);
    const brimG = lathe([[0.245, 0.02], [0.33, -0.03], [0.375, -0.07], [0.37, -0.082], [0.32, -0.05], [0.24, 0.0]], lo ? 16 : 56, lo ? 6 : 16);
    brimG.rotateX(-0.14).translate(0, H.ry * 0.5, -0.012);
    b.add(brimG, '#ffb948', SURF.cloth);
    if (!lo) {
      const band = new THREE.CylinderGeometry(0.252, 0.254, 0.042, 56, 1, true).translate(0, 0.024, 0).rotateX(-0.14).translate(0, H.ry * 0.5, -0.012);
      b.add(band, '#3cc7b4', SURF.cloth);
      const s = V(0.13, H.ry * 0.5 + 0.06, 0.21);
      b.add(starGeo(0.036, 0.012), GOLD, SURF.jelly, s.x, s.y, s.z, -0.1, 0.55, 0.1);
    }
    return { hideAntenna: true, lift: 0.1 };
  }
  return { hideAntenna: false, lift: 0 };
}

export type { Surf };
