// 섬별 식물 모양 — 고사리·소철·큰 잎·거대 버섯·눈 덮인 침엽수·얼음 꽃·선인장·히비스커스·생울타리·풀 다발·체리.
// 모두 로컬 원점(땅) 기준, +y 위. 정점색 + aTint(인스턴스 색 받는 부분 — 버섯·꽃은 밤 발광 마스크로도 쓴다).
import * as THREE from 'three';
import { blob, sweep, lathe, petal, ball, paint, merge, C, ramp, lerpC, sstep, cells, type Rnd, type Ball } from './geo';
import { cedar, res } from './shapes';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = (ax: THREE.Vector3, a: number) => new THREE.Quaternion().setFromAxisAngle(ax, a);
const Y = V3(0, 1, 0), X = V3(1, 0, 0);
const mat = (p: THREE.Vector3, q: THREE.Quaternion, s = 1) => new THREE.Matrix4().compose(p, q, V3(s, s, s));
const RS = (hi: number, lo: number) => (res.hi ? hi : res.lo ? (lo < 3 ? lo : Math.max(3, Math.round(lo * 0.6))) : lo);

/** 잎자루가 휘어 늘어진 깃꼴 잎(고사리·소철) */
function frond(rnd: Rnd, L: number, W: number, droop: number, pinnae: number, cols: THREE.Color[]): THREE.BufferGeometry {
  const g = petal({
    len: L, width: W, cup: W * 0.25, curl: -droop, nu: RS(Math.max(10, pinnae), 6), nv: RS(2, 1),
    shape: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + u * 0.92)), 0.7) * (0.62 + 0.38 * Math.pow(Math.abs(Math.sin(u * pinnae * Math.PI)), 0.5)),
    bend: (u) => 0.06 * L * Math.sin(u * Math.PI),
  });
  void rnd;
  paint(g, (q, n) => {
    const d = Math.hypot(q.x, q.z) / L;
    const mid = Math.exp(-q.x * q.x / (W * W * 0.02));
    return lerpC(ramp(cols, 0.25 + 0.6 * d + 0.15 * Math.max(0, n.y)), C('#c8ec8a'), mid * 0.35);
  }, 1);
  return g;
}

/** 고사리 덤불(공룡 섬에선 크게 키운다) */
export function fern(rnd: Rnd): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 9;
  const cols = [C('#1e6b3c'), C('#2f9348'), C('#5cbd55'), C('#9ade6e')];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const L = 0.85 + rnd() * 0.3;
    const f = frond(rnd, L, 0.2, L * (0.55 + rnd() * 0.25), 11, cols);
    f.applyMatrix4(mat(V3(0, 0.02, 0), Q(Y, a).multiply(Q(X, -1.0 + rnd() * 0.25))));
    parts.push(f);
  }
  // 가운데 말린 새순(고사리 머리)
  for (let i = 0; i < 2; i++) {
    const a = rnd() * 6.28;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const ang = t * 4.2;
      const r = 0.11 * (1 - t * 0.7);
      pts.push(V3(Math.cos(a) * (0.02 + t * 0.06), 0.05 + t * 0.4 + Math.sin(ang) * r * t, Math.sin(a) * (0.02 + t * 0.06)).add(V3(Math.cos(a) * Math.cos(ang) * r * t, 0, Math.sin(a) * Math.cos(ang) * r * t)));
    }
    const s = sweep(pts, (t) => 0.022 * (1 - 0.4 * t), 6, 12);
    paint(s, () => C('#7cc95a'), 1);
    parts.push(s);
  }
  return merge(parts);
}

/** 소철: 통통한 비늘 줄기 + 빳빳한 깃꼴 잎 왕관 */
export function cycad(rnd: Rnd): THREE.BufferGeometry {
  const H = 0.9 + rnd() * 0.4;
  const trunk = sweep([V3(0, -0.2, 0), V3(0, H * 0.5, 0), V3(0.03, H, 0)], (t, a) => {
    const scale = 0.04 * Math.abs(Math.sin(a * 4)) * Math.abs(Math.sin(t * 22));
    return 0.3 - 0.06 * t + scale;
  }, RS(16, 8), RS(16, 6));
  paint(trunk, (p, n) => ramp([C('#6b4a2e'), C('#9a7048'), C('#c79a62')], 0.3 + 0.5 * Math.abs(Math.sin(p.y * 22)) * 0.6 + 0.2 * Math.max(0, n.y)));
  const parts = [trunk];
  const cols = [C('#1d6a3a'), C('#2c8a44'), C('#58b552'), C('#8fd468')];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
    const L = 1.25 + rnd() * 0.25;
    const f = frond(rnd, L, 0.2, L * 0.45, 16, cols);
    f.applyMatrix4(mat(V3(0, H, 0), Q(Y, a).multiply(Q(X, -0.55 - rnd() * 0.35))));
    parts.push(f);
  }
  const bud = ball(0.16, RS(3, 1), 0.8);
  bud.translate(0.03, H + 0.04, 0);
  paint(bud, () => C('#d9a64a'));
  parts.push(bud);
  return merge(parts);
}

/** 큰 잎(토란·몬스테라풍) 다발 */
export function bigLeaf(rnd: Rnd): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
    const h = 0.55 + rnd() * 0.45;
    const out = V3(Math.cos(a), 0, Math.sin(a));
    const tip = out.clone().multiplyScalar(0.3 + rnd() * 0.15).add(V3(0, h, 0));
    const st = sweep([V3(0, -0.05, 0), out.clone().multiplyScalar(0.06).add(V3(0, h * 0.5, 0)), tip], (t) => 0.028 * (1 - 0.4 * t), RS(6, 4), RS(6, 3), false);
    paint(st, (p) => lerpC(C('#3a8a3a'), C('#7cc35a'), p.y / h));
    parts.push(st);
    const L = 0.75 + rnd() * 0.25;
    const lf = petal({
      len: L, width: L * 0.62, cup: L * 0.1, curl: -L * 0.22, nu: RS(10, 5), nv: RS(3, 2),
      shape: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + u * 0.82)), 0.8) * (1.05 - 0.35 * u),
    });
    lf.applyMatrix4(mat(tip, Q(Y, -a + Math.PI / 2).multiply(Q(X, -0.35))));
    paint(lf, (q, nn) => {
      const d = q.clone().sub(tip);
      const along = d.length() / L;
      const vein = Math.exp(-Math.pow(Math.sin(Math.atan2(d.x, d.z) * 5), 2) * 18) * 0.25;
      return lerpC(ramp([C('#1f6e3a'), C('#3a9a48'), C('#76c85c')], 0.3 + along * 0.5 + 0.2 * Math.max(0, nn.y)), C('#b6e68a'), vein);
    }, 1);
    parts.push(lf);
  }
  return merge(parts);
}

/** 집채만 한 버섯: 통통한 줄기 + 둥근 갓 + 흰 점박이. 갓은 aTint=1(인스턴스 색 + 밤 발광). */
export function giantMushroom(rnd: Rnd, seed: number): THREE.BufferGeometry {
  const lean = (rnd() - 0.5) * 0.25;
  const stem = lathe([
    [0.0, 2.05], [0.3, 2.05], [0.33, 1.6], [0.36, 1.0], [0.42, 0.45], [0.55, 0.1], [0.62, -0.05], [0.0, -0.08],
  ].map(([r, y]) => [r, y] as [number, number]), RS(24, 12), (p) => { p.x += lean * p.y * 0.25; });
  paint(stem, (p, n) => ramp([C('#e8d6bd'), C('#fff1dc'), C('#fff8ee')], 0.2 + 0.6 * sstep(0, 2, p.y) + 0.2 * Math.max(0, n.x)), 0);
  const capR = 1.25 + rnd() * 0.2, capH = 0.85 + rnd() * 0.15;
  const prof: Array<[number, number]> = [];
  const NS = RS(22, 11);
  for (let i = 0; i <= NS; i++) {
    const t = i / NS; // 0 = 꼭대기 → 1 = 가장자리
    const ang = t * Math.PI * 0.56;
    prof.push([i === 0 ? 0 : Math.sin(ang) * capR * (1 + 0.04 * t), 1.9 + Math.cos(ang) * capH - t * t * 0.12]);
  }
  // 가장자리에서 아래로 말려 들어가 주름(아랫면)으로
  prof.push([capR * 1.02, 1.9 + capH * Math.cos(Math.PI * 0.56) - 0.2]);
  prof.push([capR * 0.88, 1.88 + capH * Math.cos(Math.PI * 0.56) - 0.26]);
  prof.push([capR * 0.4, 2.0]);
  prof.push([0.0, 2.05]);
  const cap = lathe(prof, RS(36, 16), (p) => { p.x += lean * 0.5; });
  const cy = 1.9;
  paint(cap, (p, n) => {
    if (n.y < -0.2) return lerpC(C('#f3dcc4'), C('#e2c0a0'), Math.abs(Math.sin(Math.atan2(p.z, p.x) * 24)) * 0.6);
    const t = sstep(cy, cy + capH, p.y);
    return ramp([C('#d9d9d9'), C('#f2f2f2'), C('#ffffff')], t).multiplyScalar(0.92 + 0.08 * cells(p.x, p.y, p.z, 0.4, seed).dome);
  }, (_p, n) => (n.y < -0.2 ? 0 : 1));
  const parts = [stem, cap];
  // 점박이
  const spots: THREE.Vector3[] = [];
  for (let k = 0; k < 60 && spots.length < 9; k++) {
    const a = rnd() * 6.28, t = 0.15 + rnd() * 0.7;
    const ang = t * Math.PI * 0.56;
    const p = V3(Math.cos(a) * Math.sin(ang) * capR + lean * 0.5, cy + Math.cos(ang) * capH - t * t * 0.12, Math.sin(a) * Math.sin(ang) * capR);
    if (spots.some((s) => s.distanceTo(p) < 0.5)) continue;
    spots.push(p);
    const nn = V3(Math.cos(a) * Math.sin(ang), Math.cos(ang) * 1.3, Math.sin(a) * Math.sin(ang)).normalize();
    const s = ball(0.13 + rnd() * 0.08, RS(2, 1), 0.35);
    s.applyMatrix4(mat(p.clone().addScaledVector(nn, 0.0), new THREE.Quaternion().setFromUnitVectors(Y, nn)));
    paint(s, () => C('#fffaf0'), 0.3);
    parts.push(s);
  }
  return merge(parts);
}

/** 작은 버섯 무리(땅) */
export function mushroomTuft(rnd: Rnd): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, d = i === 0 ? 0 : 0.12 + rnd() * 0.1;
    const s = i === 0 ? 1 : 0.55 + rnd() * 0.3;
    const g = giantMushroomSmall(s);
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(g);
  }
  return merge(parts);
}
function giantMushroomSmall(s: number): THREE.BufferGeometry {
  const st = lathe([[0, 0.2 * s], [0.035 * s, 0.2 * s], [0.04 * s, 0.08 * s], [0.05 * s, 0], [0, -0.02]], RS(10, 6));
  paint(st, () => C('#fff3e2'), 0);
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, ang = t * Math.PI * 0.55; prof.push([i === 0 ? 0 : Math.sin(ang) * 0.13 * s, 0.17 * s + Math.cos(ang) * 0.1 * s]); }
  prof.push([0.1 * s, 0.17 * s]); prof.push([0, 0.19 * s]);
  const cap = lathe(prof, RS(14, 8));
  paint(cap, (_p, n) => (n.y < -0.2 ? C('#f0dcc4') : C('#ffffff')), (_p, n) => (n.y < -0.2 ? 0 : 1));
  return merge([st, cap]);
}

/** 눈 덮인 둥근 침엽수: 삼나무 층 위에 눈 모자 */
export function snowPine(rnd: Rnd, seed: number): THREE.BufferGeometry {
  const { geo } = cedar(rnd, seed);
  const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute, tn = geo.attributes.aTint as THREE.BufferAttribute;
  const snowA = C('#e8f1ff'), snowB = C('#ffffff');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), ny = nor.getY(i);
    if (y < 0.5) continue;
    const k = sstep(0.32, 0.62, ny + 0.08 * Math.sin(pos.getX(i) * 9 + pos.getZ(i) * 7));
    if (k <= 0) continue;
    const c = lerpC(snowA, snowB, ny);
    col.setXYZ(i, col.getX(i) * (1 - k) + c.r * k, col.getY(i) * (1 - k) + c.g * k, col.getZ(i) * (1 - k) + c.b * k);
    tn.setX(i, tn.getX(i) * (1 - k));
  }
  return geo;
}

/** 얼음 결정 꽃: 길쭉한 결정 다섯 + 가운데 빛나는 알 */
export function iceFlower(rnd: Rnd): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 5 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const L = 0.22 + rnd() * 0.16;
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(0.045, L, 0.045);
    g.translate(0, L * 0.85, 0);
    const p = paint(g, (q) => lerpC(C('#9fe6ff'), C('#f4fdff'), q.y / (L * 1.8)), 1);
    p.applyMatrix4(mat(V3(0, 0, 0), Q(Y, a).multiply(Q(X, 0.35 + rnd() * 0.3))));
    parts.push(p);
  }
  const c = ball(0.05, 2);
  c.translate(0, 0.06, 0);
  paint(c, () => C('#ffffff'), 1);
  parts.push(c);
  return merge(parts);
}

/** 귀여운 선인장: 0 = 둥근 통 선인장(꽃 모자), 1 = 통통한 기둥 + 팔 둘 */
export function cactus(rnd: Rnd, kind: number): THREE.BufferGeometry {
  const GR = [C('#2f8a52'), C('#4dae5f'), C('#86d07a')];
  const rib = (a: number) => 1 - 0.07 * Math.pow(Math.abs(Math.cos(a * 6)), 0.6);
  const parts: THREE.BufferGeometry[] = [];
  const colorFn = (p: THREE.Vector3, n: THREE.Vector3, top: number) => {
    const a = Math.atan2(p.z, p.x);
    const ribL = 0.82 + 0.18 * Math.pow(Math.abs(Math.sin(a * 6)), 0.5);
    return ramp(GR, 0.25 + 0.55 * sstep(0, top, p.y) + 0.2 * Math.max(0, n.y)).multiplyScalar(ribL);
  };
  let top = 0;
  if (kind === 0) {
    const R = 0.42 + rnd() * 0.1, H = 0.7 + rnd() * 0.2;
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14, ang = t * Math.PI; prof.push([i === 0 || i === 14 ? 0 : Math.sin(ang) * R, H * 0.5 + Math.cos(ang) * H * 0.55]); }
    const g = lathe(prof, RS(36, 16), (p, _s, a) => { const k = rib(a); p.x *= k; p.z *= k; });
    paint(g, (p, n) => colorFn(p, n, H), 0);
    parts.push(g);
    top = H * 1.05;
  } else {
    const H = 1.5 + rnd() * 0.4, R = 0.38;
    // 통통한 기둥: 위가 둥근 회전체
    const prof: Array<[number, number]> = [[0, H + R * 0.95]];
    for (let i = 1; i <= 6; i++) { const ang = (i / 6) * Math.PI * 0.5; prof.push([Math.sin(ang) * R, H + Math.cos(ang) * R * 0.95]); }
    prof.push([R * 1.02, H * 0.5], [R * 1.08, 0.1], [R * 1.05, -0.1], [0, -0.12]);
    const body = lathe(prof, RS(30, 14), (p, _s, a) => { const k = rib(a); p.x *= k; p.z *= k; });
    paint(body, (p, n) => colorFn(p, n, H), 0);
    parts.push(body);
    for (let s = -1; s <= 1; s += 2) {
      const y0 = H * (0.32 + rnd() * 0.2), out = 0.6 + rnd() * 0.12, up = 0.5 + rnd() * 0.35;
      const arm = sweep([V3(0, y0, 0), V3(s * out * 0.75, y0 + 0.02, 0), V3(s * out, y0 + 0.25, 0), V3(s * out, y0 + up, 0)], (t, a) => 0.21 * rib(a) * (1 - 0.1 * t), RS(18, 8), RS(12, 6));
      paint(arm, (p, n) => colorFn(p, n, H), 0);
      parts.push(arm);
    }
    top = H + R * 0.95;
  }
  // 꼭대기 꽃(틴트)
  const nP = 6;
  for (let k = 0; k < nP; k++) {
    const pt = petal({ len: 0.13, width: 0.075, cup: 0.02, curl: 0.03, nu: RS(5, 3), nv: 1 });
    pt.applyMatrix4(mat(V3(0, top - 0.02, 0), Q(Y, (k / nP) * Math.PI * 2).multiply(Q(X, -0.6))));
    paint(pt, (q) => C('#ffffff').multiplyScalar(0.8 + 0.2 * Math.min(1, Math.hypot(q.x, q.z) / 0.1)), 1);
    parts.push(pt);
  }
  const c = ball(0.04, 1);
  c.translate(0, top + 0.01, 0);
  paint(c, () => C('#ffe46a'), 0);
  parts.push(c);
  return merge(parts);
}

/** 히비스커스 덤불: 둥근 덤불 + 큰 다섯 잎 꽃(틴트) */
export function hibiscus(rnd: Rnd, seed: number): THREE.BufferGeometry {
  const balls: Ball[] = [{ x: 0, y: 0.45, z: 0, r: 0.58, sy: 0.9 }];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + rnd(); balls.push({ x: Math.cos(a) * 0.42, y: 0.38, z: Math.sin(a) * 0.42, r: 0.4 }); }
  balls.push({ x: 0, y: 0.82, z: 0, r: 0.38 });
  const { geo, dome, crease, c0 } = blob(balls, { detail: RS(9, 5), k: 0.3, cell: 0.3, amp: 0.08, seed });
  paint(geo, (p, nn, i) => ramp([C('#1f6438'), C('#2f8a46'), C('#66bb58')], sstep(-0.05, c0.y + 0.6, p.y + nn.y * 0.1)).multiplyScalar(0.74 + 0.26 * (0.5 * crease[i] + 0.5 * dome[i])), 0);
  const parts = [geo];
  const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute;
  const placed: THREE.Vector3[] = [];
  for (let tries = 0; tries < 2000 && placed.length < 9; tries++) {
    const i = Math.floor(rnd() * pos.count);
    const p = V3().fromBufferAttribute(pos, i), nn = V3().fromBufferAttribute(nor, i);
    if (nn.y < -0.1 || p.y < 0.3 || placed.some((q) => q.distanceTo(p) < 0.32)) continue;
    placed.push(p);
    const q = new THREE.Quaternion().setFromUnitVectors(Y, nn).multiply(Q(Y, rnd() * 6.28));
    const head: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const pt = petal({ len: 0.16, width: 0.12, cup: 0.02, curl: 0.04, nu: RS(5, 3), nv: RS(2, 1),
        shape: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.85)), 0.5) });
      pt.applyMatrix4(mat(V3(0, 0.02, 0), Q(Y, (k / 5) * Math.PI * 2).multiply(Q(X, -0.3))));
      paint(pt, (qq) => C('#ffffff').multiplyScalar(0.62 + 0.38 * Math.min(1, Math.hypot(qq.x, qq.z) / 0.1)), 1);
      head.push(pt);
    }
    const pist = sweep([V3(0, 0, 0), V3(0, 0.08, 0.02), V3(0, 0.14, 0.05)], () => 0.008, 4, 3);
    paint(pist, () => C('#ffe46a'), 0);
    head.push(pist);
    const hg = merge(head);
    hg.applyMatrix4(mat(p, q));
    parts.push(hg);
  }
  return merge(parts);
}

/** 다듬은 생울타리(길이 3 m, x 축) */
export function hedge(seed: number): THREE.BufferGeometry {
  const balls: Ball[] = [];
  for (let i = 0; i < 6; i++) balls.push({ x: -1.25 + i * 0.5, y: 0.5, z: 0, r: 0.42, sy: 1.25, sz: 1.0 });
  const { geo, dome, crease } = blob(balls, { detail: RS(16, 8), k: 0.6, cell: 0.22, amp: 0.05, seed });
  paint(geo, (p, n, i) => ramp([C('#25703c'), C('#3b9448'), C('#78c35e')], sstep(0, 1.1, p.y) * 0.8 + 0.2 * Math.max(0, n.y)).multiplyScalar(0.8 + 0.2 * (0.5 * dome[i] + 0.5 * crease[i])), 1);
  return geo;
}

/** 동그란 토피어리(막대 위 공 둘) */
export function topiary(seed: number): THREE.BufferGeometry {
  const st = sweep([V3(0, -0.1, 0), V3(0, 0.5, 0), V3(0, 1.0, 0)], () => 0.06, 8, 4);
  paint(st, (p) => lerpC(C('#7a5236'), C('#a77a52'), p.y), 0);
  const { geo, dome, crease } = blob([{ x: 0, y: 1.25, z: 0, r: 0.5 }, { x: 0, y: 1.95, z: 0, r: 0.32 }], { detail: RS(12, 6), k: 0.1, cell: 0.2, amp: 0.04, seed });
  paint(geo, (p, n, i) => ramp([C('#25703c'), C('#3b9448'), C('#86cf62')], 0.3 + 0.5 * Math.max(0, n.y) + 0.2 * sstep(1, 2.2, p.y)).multiplyScalar(0.82 + 0.18 * (0.5 * dome[i] + 0.5 * crease[i])), 1);
  const pot = lathe([[0, 0.02], [0.28, 0.02], [0.3, 0.32], [0.36, 0.38], [0.36, 0.42], [0.0, 0.42]] as Array<[number, number]>, 16);
  paint(pot, (p) => lerpC(C('#d9774f'), C('#f2a27a'), p.y * 2), 0);
  return merge([st, geo, pot]);
}

/** 풀잎 다발(젤다식 물결용): 넓고 끝이 둥근 잎 몇 장. 색 = 그 자리 땅색(aTint=1) → 끝으로 갈수록 +10% 밝게(짙은 끝 없음) */
export function grassTuft(rnd: Rnd, blades = 5, h = 0.22): THREE.BufferGeometry {
  const verts: number[] = [];
  const ts: number[] = [];
  const idx: number[] = [];
  const NSEG = 3, TIP = 4;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rnd() * 0.9;
    const r0 = Math.sqrt(rnd()) * 0.12;
    const bx = Math.cos(a) * r0, bz = Math.sin(a) * r0;
    const H = h * (0.45 + rnd() * 0.9);
    const w = 0.07 + rnd() * 0.035;
    const face = a + Math.PI / 2 + (rnd() - 0.5) * 0.6;
    const lean = 0.3 + rnd() * 0.35;
    const lx = Math.cos(a) * lean * H, lz = Math.sin(a) * lean * H;
    const fx = Math.cos(face) * w, fz = Math.sin(face) * w;
    const base = verts.length / 3;
    const body = 0.72;
    // 몸통(거의 같은 폭) + 반원 끝
    for (let i = 0; i <= NSEG; i++) {
      const t = (i / NSEG) * body;
      const ww = 1 - 0.18 * t;
      const x = bx + lx * t * t, z = bz + lz * t * t, y = H * t - 0.02;
      verts.push(x - fx * ww, y, z - fz * ww, x + fx * ww, y, z + fz * ww);
      ts.push(t, t);
    }
    for (let i = 0; i < NSEG; i++) { const p = base + i * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
    const top = base + NSEG * 2;
    const tw = 1 - 0.18 * body;
    const tipCenter = verts.length / 3;
    { const t = body, x = bx + lx * t * t, z = bz + lz * t * t, y = H * t - 0.02; verts.push(x, y, z); ts.push(t); }
    const rim: number[] = [top];
    for (let k = 1; k < TIP; k++) {
      const th = (k / TIP) * Math.PI;
      const c = -Math.cos(th), sn = Math.sin(th);
      const t = body + (1 - body) * sn;
      const x = bx + lx * t * t + fx * tw * c, z = bz + lz * t * t + fz * tw * c, y = H * t - 0.02;
      rim.push(verts.length / 3);
      verts.push(x, y, z); ts.push(t);
    }
    rim.push(top + 1);
    for (let k = 0; k < rim.length - 1; k++) idx.push(tipCenter, rim[k + 1], rim[k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  // 법선 = 거의 위쪽(땅과 같은 음영 → 잎이 땅에서 자연스럽게 솟음)
  const nor = new Float32Array(verts.length);
  for (let i = 0; i < verts.length / 3; i++) { const n = V3(verts[i * 3] * 0.6, 1, verts[i * 3 + 2] * 0.6).normalize(); nor[i * 3] = n.x; nor[i * 3 + 1] = n.y; nor[i * 3 + 2] = n.z; }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const col = new Float32Array(ts.length * 3), tn = new Float32Array(ts.length);
  const tip = C('#fffbe0');
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const k = 0.97 + 0.13 * sstep(0.1, 1, t);
    const c = lerpC(C('#ffffff'), tip, sstep(0.5, 1, t) * 0.5).multiplyScalar(k);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    tn[i] = 1;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aTint', new THREE.BufferAttribute(tn, 1));
  g.computeBoundingSphere();
  return g;
}

/** 체리 한 쌍(나무에 매달림·떨어짐) */
export function cherry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let s = -1; s <= 1; s += 2) {
    const b = ball(0.1, 3);
    b.translate(s * 0.07, 0, 0);
    paint(b, (q) => ramp([C('#9c0f2a'), C('#e0283f'), C('#ff7a86')], sstep(-0.1, 0.12, q.y + q.z * 0.4)));
    parts.push(b);
    const st = sweep([V3(s * 0.07, 0.08, 0), V3(s * 0.04, 0.18, 0), V3(0, 0.26, 0)], () => 0.01, 5, 4);
    paint(st, () => C('#5f8a32'));
    parts.push(st);
  }
  const lf = petal({ len: 0.13, width: 0.06, cup: 0.012, curl: -0.02, nu: 4, nv: 1 });
  lf.applyMatrix4(mat(V3(0, 0.26, 0), Q(Y, 0.6).multiply(Q(X, -0.5))));
  paint(lf, (q) => lerpC(C('#3d9a3f'), C('#78c95a'), q.z * 6));
  parts.push(lf);
  return merge(parts);
}

/** 벌집(떨어지는 이벤트) */
export function beehive(): THREE.BufferGeometry {
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20, ang = t * Math.PI; prof.push([i === 0 || i === 20 ? 0 : Math.sin(ang) * 0.24 * (0.92 + 0.08 * Math.cos(t * 40)), 0.3 - t * 0.6]); }
  const g = lathe(prof, 20);
  paint(g, (p) => ramp([C('#c98a1a'), C('#f2c24a'), C('#ffe08a')], 0.5 + 0.5 * Math.cos(p.y * 52)));
  const hole = ball(0.06, 1, 0.8);
  hole.translate(0, -0.05, 0.22);
  paint(hole, () => C('#4a2f12'));
  return merge([g, hole]);
}

/** 눈 덮인 둥근 덤불(얼음 섬) */
export function snowBush(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.clone();
  const nor = g.attributes.normal as THREE.BufferAttribute, col = g.attributes.color as THREE.BufferAttribute, tn = g.attributes.aTint as THREE.BufferAttribute;
  for (let i = 0; i < nor.count; i++) {
    const k = sstep(-0.1, 0.35, nor.getY(i));
    const c = lerpC(C('#5f9fb0'), C('#ffffff'), k).lerp(C('#e6f2ff'), 0.2 * (1 - k));
    col.setXYZ(i, c.r, c.g, c.b);
    tn.setX(i, 0);
  }
  return g;
}
