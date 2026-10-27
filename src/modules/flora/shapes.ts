// 식물 모양들 — 모두 로컬 원점(땅) 기준, +y 위. 정점색 + aTint(인스턴스 색 받는 부분).
import * as THREE from 'three';
import { blob, sweep, lathe, petal, ball, paint, merge, xf, C, ramp, lerpC, sstep, cells, type Rnd, type Ball } from './geo';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = (ax: THREE.Vector3, a: number) => new THREE.Quaternion().setFromAxisAngle(ax, a);
const Y = V3(0, 1, 0), X = V3(1, 0, 0), Z = V3(0, 0, 1);
const mat = (p: THREE.Vector3, q: THREE.Quaternion, s = 1) => new THREE.Matrix4().compose(p, q, V3(s, s, s));

/** 해상도 단계(가까운 곳 = hi). 만들기 전에 flora.ts 가 바꾼다. */
export const res = { hi: true, lo: false };
/** 해상도: hi(가까이) / 기본 lo / res.lo = 아주 먼 고리(더 거칠게) */
const RS = (hi: number, lo: number) => (res.hi ? hi : res.lo ? (lo < 3 ? lo : Math.max(3, Math.round(lo * 0.6))) : lo);

// ── 활엽수 ───────────────────────────────────────────
export interface Anchor { p: THREE.Vector3; n: THREE.Vector3 }

const TRUNK = [C('#6e4a33'), C('#8d6141'), C('#a77a52')];
function trunkColor(p: THREE.Vector3, top: number) {
  const a = Math.atan2(p.z, p.x);
  const stripe = 0.93 + 0.07 * Math.sin(a * 6 + p.y * 2.2);
  return ramp(TRUNK, p.y / top).multiplyScalar(stripe);
}

export function broadleaf(rnd: Rnd, detail: number, seed: number, hi: boolean): { geo: THREE.BufferGeometry; anchors: Anchor[]; height: number } {
  const lean = V3((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3);
  const topY = 2.1;
  const pts = [V3(0, -0.3, 0), V3(0, 0.45, 0), V3(lean.x * 0.4 - lean.z * 0.2, 1.25, lean.z * 0.4), V3(lean.x, topY, lean.z)];
  const ph = rnd() * 6.28;
  const trunk = sweep(pts, (_t, a, P) => {
    const y = Math.max(0, P.y);
    const root = Math.pow(Math.max(0, Math.cos(3 * a + ph)), 3);
    return 0.19 * (1 - 0.3 * Math.min(1, y / topY)) + 0.16 * Math.exp(-y * 6.0) * (0.5 + 0.9 * root);
  }, hi ? 20 : 10, hi ? 22 : 9);
  paint(trunk, (p) => trunkColor(p, topY));

  // 가지 둘: 수관 아래에서 살짝 보이게
  const branches: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 2; i++) {
    const a = ph + i * Math.PI + (rnd() - 0.5);
    const b0 = V3(lean.x * 0.75, 1.45, lean.z * 0.75);
    const b1 = V3(lean.x + Math.cos(a) * 0.4, 1.9, lean.z + Math.sin(a) * 0.4);
    const b2 = V3(lean.x + Math.cos(a) * 0.7, 2.3, lean.z + Math.sin(a) * 0.7);
    const g = sweep([b0, b1, b2], (t) => 0.1 * (1 - 0.55 * t), hi ? 10 : 6, hi ? 8 : 4);
    paint(g, (p) => trunkColor(p, topY));
    branches.push(g);
  }

  // 수관: 크게 부푼 구름
  const cy = 2.5 + rnd() * 0.1;
  const balls: Ball[] = [
    { x: lean.x, y: cy, z: lean.z, r: 1.12 + rnd() * 0.08, sy: 0.86 },
    { x: lean.x + (rnd() - 0.5) * 0.3, y: cy + 0.58, z: lean.z + (rnd() - 0.5) * 0.3, r: 0.7 + rnd() * 0.08 },
  ];
  const nSide = 3 + Math.floor(rnd() * 2);
  const a0 = rnd() * 6.28;
  for (let i = 0; i < nSide; i++) {
    const a = a0 + (i / nSide) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
    const d = 0.72 + rnd() * 0.16;
    balls.push({ x: lean.x + Math.cos(a) * d, y: cy - 0.12 + rnd() * 0.3, z: lean.z + Math.sin(a) * d, r: 0.66 + rnd() * 0.14, sy: 0.9 });
  }
  const { geo: crown, dome, crease, c0 } = blob(balls, { detail, k: 0.5, cell: 0.7, amp: 0.085, seed });
  const LEAF = [C('#1f5e3a'), C('#2f8443'), C('#47a64b'), C('#74c457'), C('#a2da6a')];
  paint(crown, (p, n, i) => {
    const t = sstep(c0.y - 1.15, c0.y + 1.25, p.y + n.y * 0.35);
    // 잔 잎 덩어리 무늬는 색으로만
    const fine = cells(p.x, p.y, p.z, 0.2, seed + 7);
    const c = ramp(LEAF, t * 0.9 + 0.1 * dome[i]);
    const cr = (0.8 + 0.2 * (0.5 * crease[i] + 0.5 * dome[i])) * (0.9 + 0.1 * (0.6 * fine.dome + 0.4 * fine.crease));
    return c.multiplyScalar(cr);
  }, 1);

  // 과일 자리: 옆 둘레, 서로 떨어지게
  const anchors: Anchor[] = [];
  const pos = crown.attributes.position as THREE.BufferAttribute, nor = crown.attributes.normal as THREE.BufferAttribute;
  const cands: Anchor[] = [];
  for (let i = 0; i < pos.count; i += 7) {
    const n = V3().fromBufferAttribute(nor, i);
    const p = V3().fromBufferAttribute(pos, i);
    if (n.y > -0.25 && n.y < 0.35 && p.y < c0.y + 0.35 && dome[i] > 0.5) cands.push({ p, n });
  }
  for (let tries = 0; tries < 400 && anchors.length < 5 && cands.length; tries++) {
    const c = cands[Math.floor(rnd() * cands.length)];
    const ang = Math.atan2(c.n.z, c.n.x);
    if (anchors.some((a) => Math.abs(Math.atan2(Math.sin(Math.atan2(a.n.z, a.n.x) - ang), Math.cos(Math.atan2(a.n.z, a.n.x) - ang))) < 0.95)) continue;
    anchors.push({ p: c.p.clone().addScaledVector(c.n, 0.02), n: c.n.clone() });
  }
  return { geo: merge([trunk, ...branches, crown]), anchors, height: cy + 1.4 };
}

// ── 과일 ─────────────────────────────────────────────
export type FruitKind = 'apple' | 'peach' | 'orange' | 'pear';
export function fruit(kind: FruitKind): THREE.BufferGeometry {
  const r = 0.19;
  const body = ball(r, 5);
  const pos = body.attributes.position as THREE.BufferAttribute;
  const p = V3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const ny = p.y / r;
    let s = 1;
    if (kind === 'apple') { s = 1 - 0.22 * Math.exp(-(1 - ny) * 9) - 0.08 * Math.exp(-(1 + ny) * 6); p.y *= 0.92; }
    if (kind === 'peach') { const a = Math.atan2(p.z, p.x); s = 1 - 0.06 * Math.exp(-Math.pow(Math.sin(a - 0.3), 2) * 40) * sstep(-0.6, 0.6, ny); p.y *= 1.04; p.y += 0.02 * Math.exp(-(ny + 1) * 3) * 0 + (ny < -0.85 ? -0.01 : 0); }
    if (kind === 'orange') { s = 1 - 0.07 * Math.exp(-(1 - ny) * 10); }
    if (kind === 'pear') { const t = (ny + 1) / 2; s = 1 - 0.42 * sstep(0.35, 1, t); p.y *= 1.35; p.y += 0.02; }
    p.x *= s; p.z *= s;
    if (kind !== 'pear') p.y *= s > 0.9 ? 1 : 1;
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  body.computeVertexNormals();
  const COL: Record<FruitKind, THREE.Color[]> = {
    apple: [C('#c8263a'), C('#f04a52'), C('#ff8a7a')],
    peach: [C('#ffb48c'), C('#ffa4a8'), C('#ff7f99')],
    orange: [C('#f07818'), C('#ff9a2c'), C('#ffc060')],
    pear: [C('#b9c83a'), C('#d6dc52'), C('#eef08c')],
  };
  paint(body, (q, n) => {
    const t = sstep(-r * 1.2, r * 1.3, q.y);
    const side = kind === 'peach' ? sstep(-0.4, 0.9, n.x * 0.7 + n.z * 0.7) : 0;
    const c = ramp(COL[kind], kind === 'peach' ? 1 - side * 0.9 - (1 - t) * 0.2 : t);
    if (kind === 'orange') c.multiplyScalar(0.94 + 0.06 * cells(q.x, q.y, q.z, 0.02, 3).dome);
    return c;
  });
  const top = kind === 'pear' ? r * 1.38 : r * (kind === 'apple' ? 0.8 : 0.95);
  const stem = sweep([V3(0, top - 0.03, 0), V3(0.01, top + 0.05, 0), V3(0.035, top + 0.1, 0)], (t) => 0.018 * (1 - 0.4 * t), 6, 4);
  paint(stem, () => C('#6a4a2a'));
  const leaf = petal({ len: 0.16, width: 0.07, cup: 0.014, curl: -0.025, nu: 4, nv: 1 });
  leaf.applyMatrix4(mat(V3(0.02, top + 0.05, 0), Q(Y, -0.5).multiply(Q(X, -0.45))));
  paint(leaf, (q) => lerpC(C('#3d9a3f'), C('#78c95a'), q.z * 6));
  return merge([body, stem, leaf]);
}

// ── 삼나무(둥글린 층층 원뿔) ────────────────────────────
export function cedar(rnd: Rnd, seed: number): { geo: THREE.BufferGeometry; height: number } {
  const trunk = sweep([V3(0, -0.3, 0), V3(0, 0.4, 0), V3(0, 1.2, 0)], (_t, a, P) => {
    const y = Math.max(0, P.y);
    return 0.15 - 0.03 * y + 0.13 * Math.exp(-y * 6) * (0.6 + 0.8 * Math.pow(Math.max(0, Math.cos(3 * a)), 3));
  }, RS(14, 8), RS(10, 5));
  paint(trunk, (p) => trunkColor(p, 1.2).multiplyScalar(0.9));
  const radial = RS(34, 18);
  const parts = [trunk];
  const tiers = 4;
  const y0 = 0.55;
  const DARK = [C('#1f5b44'), C('#2f7a52'), C('#47995f'), C('#78bd6e')];
  let top = 0;
  for (let i = 0; i < tiers; i++) {
    const R = 1.3 * (1 - i * 0.2) * (0.94 + rnd() * 0.1);
    const h = 1.2 * (1 - i * 0.1);
    const yb = y0 + i * 0.68;
    // 윗면은 볼록, 끝단은 둥글게 말려 들어간다
    const ctrl = [
      V3(0, h, 0), V3(0.2 * R, h * 0.93, 0), V3(0.45 * R, h * 0.72, 0), V3(0.7 * R, h * 0.44, 0), V3(0.9 * R, h * 0.16, 0),
      V3(1.0 * R, h * 0.0, 0), V3(0.98 * R, -0.09 * h, 0), V3(0.86 * R, -0.15 * h, 0), V3(0.55 * R, -0.12 * h, 0), V3(0.22 * R, -0.04 * h, 0),
    ];
    const cr = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
    const prof: Array<[number, number]> = [];
    const NS = RS(24, 13);
    for (let s = 0; s <= NS; s++) { const q = cr.getPoint(s / NS); prof.push([s === 0 ? 0 : q.x, q.y]); }
    const ph = rnd() * 6.28;
    const geo = lathe(prof, radial, (p, s, a) => {
      // 끝단 물결(잎 덩어리) + 셀 요철
      const w = sstep(0.35, 0.65, s);
      const c = cells(p.x * 1.0 + i * 3.1, p.y + yb, p.z, 0.32, seed + i);
      const k = 1 + w * (0.07 * Math.cos(9 * a + ph) ) + 0.05 * (c.dome - 0.6) * sstep(0.05, 0.4, s);
      p.x *= k; p.z *= k;
      p.y -= w * 0.05 * (1 - Math.cos(9 * a + ph)) * 0.5;
      p.y += yb;
    });
    paint(geo, (p, n) => {
      const t = sstep(yb - 0.15 * h, yb + h, p.y) * 0.85 + 0.15 * Math.max(0, n.y);
      const tierLift = 0.06 * i;
      return ramp(DARK, Math.min(1, t + tierLift));
    }, 1);
    parts.push(geo);
    top = yb + h;
  }
  return { geo: merge(parts), height: top };
}

// ── 야자수 ───────────────────────────────────────────
export function palm(rnd: Rnd, o: { nuts?: boolean } = {}): { geo: THREE.BufferGeometry; height: number; top: THREE.Vector3 } {
  const H = 3.0 + rnd() * 0.5;
  const bend = 0.7 + rnd() * 0.5;
  const pts = [V3(0, -0.25, 0), V3(0.05 * bend, H * 0.3, 0), V3(0.35 * bend, H * 0.65, 0), V3(0.9 * bend, H, 0)];
  const NSEG = 9;
  const trunk = sweep(pts, (t, _a, P) => {
    const y = Math.max(0, P.y);
    const f = (t * NSEG) % 1;
    const lip = sstep(0.45, 0.97, f);
    return (0.16 - 0.045 * t) * (0.9 + 0.16 * lip) + 0.08 * Math.exp(-y * 6);
  }, RS(14, 8), NSEG * RS(6, 4));
  const TR = [C('#8a6440'), C('#b78b5e'), C('#d9b285')];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  // 마디 색: 입술 쪽이 밝게
  const tPos = trunk.attributes.position as THREE.BufferAttribute;
  const ring = RS(14, 8);
  paint(trunk, (_p, _n, i) => {
    const row = Math.floor(i / ring);
    const t = Math.min(1, row / (NSEG * RS(6, 4)));
    const f = (t * NSEG) % 1;
    return ramp(TR, 0.15 + 0.85 * sstep(0.4, 0.97, f)).multiplyScalar(0.92 + 0.08 * t);
  });
  void tPos;
  const top = curve.getPoint(1);
  const parts: THREE.BufferGeometry[] = [trunk];
  const bulb = ball(0.2, RS(3, 1), 1.1);
  bulb.translate(top.x, top.y + 0.02, top.z);
  paint(bulb, () => C('#7d8a3a'));
  parts.push(bulb);
  // 코코넛(열매 나무는 따로 매단다 — nuts:false)
  for (let i = 0; i < (o.nuts === false ? 0 : 3); i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const cc = ball(0.13, RS(3, 2));
    cc.translate(top.x + Math.cos(a) * 0.18, top.y - 0.14, top.z + Math.sin(a) * 0.18);
    paint(cc, (q) => lerpC(C('#5e4426'), C('#8a6a3a'), (q.y - top.y + 0.27) * 4));
    parts.push(cc);
  }
  // 잎: 휘어 늘어진 V 단면 리본, 가장자리 톱니
  const NF = 8;
  const FR = [C('#2f8a45'), C('#4fb455'), C('#86d468')];
  for (let k = 0; k < NF; k++) {
    const a = (k / NF) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const L = 1.9 + rnd() * 0.35;
    const pitch = 0.55 + rnd() * 0.35;
    const droop = 1.05 + rnd() * 0.3;
    const dir = V3(Math.cos(a), 0, Math.sin(a));
    const NU = RS(32, 16), NV = RS(2, 1);
    const verts: number[] = [];
    const uvs: number[] = [];
    const spine = (s: number) => V3().copy(top).addScaledVector(dir, L * s * Math.cos(pitch)).add(V3(0, L * s * Math.sin(pitch) - droop * s * s * L * 0.62, 0));
    for (let i = 0; i <= NU; i++) {
      const s = i / NU;
      const P = spine(s);
      const T = spine(Math.min(1, s + 0.01)).sub(spine(Math.max(0, s - 0.01))).normalize();
      const S = V3().crossVectors(T, Y).normalize();
      const N = V3().crossVectors(S, T).normalize();
      const w0 = 0.34 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + s * 0.96)), 0.75);
      const serr = 1 - 0.32 * Math.pow((s * 12) % 1, 1.6) * sstep(0.12, 0.3, s);
      for (let j = -NV; j <= NV; j++) {
        const v = j / NV;
        const w = w0 * (Math.abs(v) > 0.5 ? serr : 1 - (1 - serr) * 0.3);
        const q = V3().copy(P).addScaledVector(S, v * w).addScaledVector(N, (0.05 - 0.22 * v * v) * w0 * 1.2);
        verts.push(q.x, q.y, q.z);
        uvs.push(s, v);
      }
    }
    const W = NV * 2 + 1;
    const idx: number[] = [];
    for (let i = 0; i < NU; i++) for (let j = 0; j < W - 1; j++) {
      const p0 = i * W + j, p1 = p0 + 1, p2 = p0 + W, p3 = p2 + 1;
      idx.push(p0, p2, p1, p1, p2, p3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    paint(g, (_q, _n, i) => {
      const s = uvs[i * 2], v = uvs[i * 2 + 1];
      const mid = Math.exp(-v * v * 30);
      return lerpC(ramp(FR, 0.3 + 0.6 * (1 - s) * 0.6 + 0.4 * (1 - Math.abs(v)) * 0.6), C('#a6dc7a'), mid * 0.6);
    }, 1);
    parts.push(g);
  }
  return { geo: merge(parts), height: top.y + 0.6, top: top.clone() };
}

// ── 덤불 ─────────────────────────────────────────────
export type BushKind = 'round' | 'azalea' | 'hydrangea';
export function bush(rnd: Rnd, kind: BushKind, seed: number): THREE.BufferGeometry {
  const balls: Ball[] = [{ x: 0, y: 0.36, z: 0, r: 0.5, sy: 0.9 }];
  const n = 3;
  const a0 = rnd() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.28 + (rnd() - 0.5) * 0.5;
    balls.push({ x: Math.cos(a) * 0.36, y: 0.3 + rnd() * 0.08, z: Math.sin(a) * 0.36, r: 0.36 + rnd() * 0.06 });
  }
  balls.push({ x: (rnd() - 0.5) * 0.15, y: 0.62, z: (rnd() - 0.5) * 0.15, r: 0.36 });
  const { geo, dome, crease, c0 } = blob(balls, { detail: RS(13, 7), k: 0.28, cell: 0.28, amp: 0.08, seed });
  // 바닥은 땅에 묻히게 살짝 내림
  const LEAF = kind === 'round' ? [C('#2c7840'), C('#45a04f'), C('#86cf62')] : [C('#26663a'), C('#3a8c48'), C('#6cbb5a')];
  paint(geo, (p, nn, i) => {
    const t = sstep(-0.05, c0.y + 0.55, p.y + nn.y * 0.1);
    return ramp(LEAF, t).multiplyScalar(0.74 + 0.26 * (0.5 * crease[i] + 0.5 * dome[i]));
  }, 0);
  const parts = [geo];
  if (kind !== 'round') {
    const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute;
    const placed: THREE.Vector3[] = [];
    const want = kind === 'azalea' ? 34 : 7;
    const minD = kind === 'azalea' ? 0.14 : 0.3;
    for (let tries = 0; tries < 3000 && placed.length < want; tries++) {
      const i = Math.floor(rnd() * pos.count);
      const p = V3().fromBufferAttribute(pos, i), nn = V3().fromBufferAttribute(nor, i);
      if (nn.y < -0.05 || p.y < 0.2 || dome[i] < 0.4) continue;
      if (placed.some((q) => q.distanceTo(p) < minD)) continue;
      placed.push(p);
      const q = new THREE.Quaternion().setFromUnitVectors(Y, nn);
      if (kind === 'azalea') {
        const fl = flowerHead5(0.07, 0.035);
        fl.applyMatrix4(mat(p.clone().addScaledVector(nn, 0.0), q.multiply(Q(Y, rnd() * 6.28))));
        parts.push(fl);
      } else {
        const mop = mophead(0.15, seed + placed.length);
        mop.applyMatrix4(mat(p.clone().addScaledVector(nn, 0.03), q));
        parts.push(mop);
      }
    }
  }
  return merge(parts);
}

/** 작은 다섯 잎 꽃(덤불용) — 꽃잎은 틴트, 가운데 노랑 */
function flowerHead5(r: number, lift: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const pt = petal({ len: r, width: r * 0.6, cup: r * 0.12, curl: r * 0.15, nu: 2, nv: 1 });
    pt.applyMatrix4(mat(V3(0, lift, 0), Q(Y, (k / 5) * Math.PI * 2).multiply(Q(X, -0.25))));
    paint(pt, (q) => C('#ffffff').multiplyScalar(0.86 + 0.14 * Math.min(1, Math.hypot(q.x, q.z) / r)), 1);
    parts.push(pt);
  }
  const c = ball(r * 0.25, 0, 0.7);
  c.translate(0, lift + r * 0.08, 0);
  paint(c, () => C('#ffd84a'));
  parts.push(c);
  return merge(parts);
}

/** 수국 꽃송이: 작은 꽃이 뭉친 공 */
function mophead(r: number, seed: number): THREE.BufferGeometry {
  const { geo, dome, crease } = blob([{ x: 0, y: 0, z: 0, r }], { detail: RS(4, 2), k: 0.05, cell: 0.06, amp: 0.035, seed });
  paint(geo, (_p, n, i) => C('#ffffff').multiplyScalar((0.7 + 0.3 * (0.5 * dome[i] + 0.5 * crease[i])) * (0.88 + 0.12 * Math.max(0, n.y))), 1);
  return geo;
}

// ── 꽃(줄기 + 잎 + 꽃송이) ─────────────────────────────
export type FlowerKind = 'cosmos' | 'tulip' | 'pansy';
const STEM = [C('#3b8a3a'), C('#5cb04c')];
function stemAndLeaves(rnd: Rnd, H: number, nLeaves: number, leafLen: number, leafW: number): { parts: THREE.BufferGeometry[]; top: THREE.Vector3 } {
  const top = V3((rnd() - 0.5) * 0.04, H, (rnd() - 0.5) * 0.04);
  const stem = sweep([V3(0, -0.03, 0), V3(top.x * 0.3, H * 0.5, top.z * 0.3), top], () => 0.015, RS(6, 4), RS(4, 2), false);
  paint(stem, (p) => lerpC(STEM[0], STEM[1], p.y / H));
  const parts = [stem];
  for (let i = 0; i < nLeaves; i++) {
    const a = (i / nLeaves) * Math.PI * 2 + rnd() * 0.8;
    const lf = petal({ len: leafLen, width: leafW, cup: leafW * 0.35, curl: -leafLen * 0.35, nu: RS(5, 3), nv: 1 });
    lf.applyMatrix4(mat(V3(0, 0.01 + i * 0.012, 0), Q(Y, a).multiply(Q(X, -0.75 + rnd() * 0.2))));
    paint(lf, (q) => lerpC(C('#3a8f3c'), C('#7ccc5c'), Math.hypot(q.x, q.z) / leafLen + q.y * 2));
    parts.push(lf);
  }
  return { parts, top };
}

export function flower(kind: FlowerKind, rnd: Rnd): THREE.BufferGeometry {
  if (kind === 'cosmos') {
    const { parts, top } = stemAndLeaves(rnd, 0.27 + rnd() * 0.05, 4, 0.13, 0.042);
    const head: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const pt = petal({ len: 0.13, width: 0.068, cup: 0.008, curl: 0.012, notch: 0.9, nu: RS(6, 3), nv: RS(2, 1),
        shape: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + u * 0.8)), 0.7) * (0.6 + 0.4 * u) });
      pt.applyMatrix4(mat(V3(0, 0, 0), Q(Y, (k / 5) * Math.PI * 2 + 0.3).multiply(Q(X, -0.12))));
      paint(pt, (q) => C('#ffffff').multiplyScalar(0.8 + 0.2 * Math.min(1, Math.hypot(q.x, q.z) / 0.06)), 1);
      head.push(pt);
    }
    const c = ball(0.032, RS(2, 1), 0.6);
    c.translate(0, 0.008, 0);
    paint(c, (_q, n) => lerpC(C('#e0a020'), C('#ffd94a'), n.y));
    head.push(c);
    const hg = merge(head);
    hg.applyMatrix4(mat(top, Q(X, 0.35 + (rnd() - 0.5) * 0.3).premultiply(Q(Y, rnd() * 6.28))));
    return merge([...parts, hg]);
  }
  if (kind === 'tulip') {
    const { parts, top } = stemAndLeaves(rnd, 0.22 + rnd() * 0.04, 3, 0.19, 0.06);
    // 꽃잎 여섯 장(바깥 셋·안쪽 셋)이 통통한 컵을 이룬다. 꽃잎 오목한 면(+y)이 가운데를 본다.
    const head: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const outer = k % 2 === 0;
      const L = outer ? 0.17 : 0.16, W = outer ? 0.088 : 0.08;
      const pt = petal({
        len: L, width: W, cup: W * 0.75, nu: RS(7, 4), nv: RS(3, 1),
        shape: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.2 + u * 0.8)), 0.55) * (1 - 0.25 * u * u),
        bend: (u) => -0.03 * Math.sin(Math.PI * Math.min(1, u * 1.05)) + 0.018 * u * u * u,
      });
      const a = (k / 6) * Math.PI * 2;
      const o = V3(Math.cos(a), 0, Math.sin(a));
      // 로컬 z → 위, 로컬 y → 안쪽(-o), 로컬 x → 접선
      const m = new THREE.Matrix4().makeBasis(V3().crossVectors(V3(0, 1, 0), o), o.clone().negate(), V3(0, 1, 0));
      const tilt = new THREE.Matrix4().makeRotationAxis(V3().crossVectors(Y, o).normalize(), outer ? 0.14 : 0.05);
      const g = pt.applyMatrix4(m).applyMatrix4(tilt);
      g.translate(o.x * (outer ? 0.028 : 0.012), 0, o.z * (outer ? 0.028 : 0.012));
      paint(g, (q) => C('#ffffff').multiplyScalar(0.72 + 0.28 * sstep(0.0, 0.1, q.y)), 1);
      head.push(g);
    }
    const sep = ball(0.03, RS(2, 1), 0.7);
    paint(sep, () => C('#4f9c45'));
    head.push(sep);
    const hg = merge(head);
    hg.applyMatrix4(mat(top.clone().add(V3(0, -0.015, 0)), Q(X, (rnd() - 0.5) * 0.25)));
    return merge([...parts, hg]);
  }
  // 팬지: 앞을 보는 둥근 꽃잎 다섯, 가운데 진한 무늬
  const { parts, top } = stemAndLeaves(rnd, 0.18 + rnd() * 0.04, 5, 0.11, 0.05);
  const head: THREE.BufferGeometry[] = [];
  const angs = [0.25, -0.25, 1.35, -1.35, Math.PI];
  const sizes = [0.095, 0.095, 0.1, 0.1, 0.118];
  for (let k = 0; k < 5; k++) {
    const L = sizes[k];
    const pt = petal({ len: L, width: L * 0.8, cup: L * 0.08, curl: -L * 0.15, nu: RS(5, 3), nv: RS(2, 1),
      shape: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.88)), 0.45) });
    pt.applyMatrix4(mat(V3(0, k * 0.002, 0), Q(Y, angs[k] + Math.PI / 2)));
    paint(pt, (q) => {
      const d = Math.hypot(q.x, q.z) / L;
      return C('#ffffff').multiplyScalar(0.35 + 0.65 * sstep(0.25, 0.65, d));
    }, 1);
    head.push(pt);
  }
  const c = ball(0.021, 1);
  c.translate(0, 0.012, 0);
  paint(c, () => C('#ffe040'));
  head.push(c);
  const hg = merge(head);
  // 얼굴이 앞(+z)·위로
  hg.applyMatrix4(mat(top, Q(Y, (rnd() - 0.5) * 1.2).multiply(Q(X, 0.9))));
  return merge([...parts, hg]);
}

// ── 클로버·잡초 ──────────────────────────────────────
export function clover(rnd: Rnd): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 0.16;
    const base = V3(Math.cos(a) * d, 0, Math.sin(a) * d);
    const h = 0.06 + rnd() * 0.08;
    const tip = V3(base.x * 1.2, h, base.z * 1.2);
    const st = sweep([V3(base.x, -0.02, base.z), V3(base.x * 1.1, h * 0.6, base.z * 1.1), tip], () => 0.006, 4, 3, false);
    paint(st, () => C('#4c9c42'));
    parts.push(st);
    for (let k = 0; k < 3; k++) {
      const lf = petal({ len: 0.06, width: 0.036, cup: 0.004, curl: -0.006, notch: 1.4, nu: 4, nv: 1,
        shape: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + u * 0.8)), 0.6) * (0.5 + 0.5 * u) });
      lf.applyMatrix4(mat(tip, Q(Y, (k / 3) * 6.28 + a).multiply(Q(X, -0.2))));
      paint(lf, (q) => lerpC(C('#3c9a46'), C('#7fd06a'), Math.hypot(q.x - tip.x, q.z - tip.z) * 18));
      parts.push(lf);
    }
  }
  if (rnd() < 0.5) {
    const { geo, dome } = blob([{ x: 0, y: 0, z: 0, r: 0.035 }], { detail: 2, k: 0.01, cell: 0.015, amp: 0.01, seed: 9 });
    geo.translate(0.03, 0.17, 0.02);
    paint(geo, (_q, _n, i) => C('#ffffff').multiplyScalar(0.85 + 0.15 * dome[i]));
    const st = sweep([V3(0.02, -0.02, 0.01), V3(0.03, 0.08, 0.02), V3(0.03, 0.15, 0.02)], () => 0.005, 4, 3, false);
    paint(st, () => C('#4c9c42'));
    parts.push(st, geo);
  }
  return merge(parts);
}

export function weed(rnd: Rnd): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 7 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + rnd() * 0.5;
    const L = 0.16 + rnd() * 0.1;
    const lf = petal({ len: L, width: 0.04, cup: 0.012, curl: -L * (0.2 + rnd() * 0.3), nu: 6, nv: 1,
      shape: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + u * 0.88)), 0.8) * (1 + 0.18 * Math.sin(u * 22)) });
    lf.applyMatrix4(mat(V3(0, 0, 0), Q(Y, a).multiply(Q(X, -1.0 + rnd() * 0.35))));
    paint(lf, (q) => lerpC(C('#3f8f36'), C('#94cf55'), q.y * 5));
    parts.push(lf);
  }
  return merge(parts);
}

export { xf };
