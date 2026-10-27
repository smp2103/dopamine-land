// 섬별 열매 나무·새 식생·랜드마크 나무·돌 모양 — 코코넛·바나나·대추·별사과·서리 열매·은행, 맹그로브·부채 선인장·유성초·바람개비,
// 소원나무(느티나무)·할미벚, 두드릴 돌. 모두 로컬 원점(땅) 기준 +y 위, 정점색 + aTint(인스턴스 색·밤 발광 마스크).
import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import { blob, sweep, petal, ball, paint, merge, C, ramp, lerpC, sstep, cells, type Rnd, type Ball } from './geo';
import { broadleaf, palm, res, type Anchor } from './shapes';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = (ax: THREE.Vector3, a: number) => new THREE.Quaternion().setFromAxisAngle(ax, a);
const Y = V3(0, 1, 0), X = V3(1, 0, 0), Z = V3(0, 0, 1);
const mat = (p: THREE.Vector3, q: THREE.Quaternion, s = 1) => new THREE.Matrix4().compose(p, q, V3(s, s, s));
const RS = (hi: number, lo: number) => (res.hi ? hi : res.lo ? (lo < 3 ? lo : Math.max(3, Math.round(lo * 0.6))) : lo);

// ───────────── 수관 다시 칠하기 ─────────────
/** aTint=1 인 잎 정점을 밝기 순서 그대로 새 색 사다리로 옮긴다(나무 모양은 그대로, 잎 색만 섬답게) */
function recolorLeaves(g: THREE.BufferGeometry, cols: THREE.Color[], keepTint = 1): THREE.BufferGeometry {
  const col = g.attributes.color as THREE.BufferAttribute, tn = g.attributes.aTint as THREE.BufferAttribute;
  let lo = 9, hi = -9;
  const lum = (i: number) => col.getX(i) * 0.3 + col.getY(i) * 0.59 + col.getZ(i) * 0.11;
  for (let i = 0; i < col.count; i++) if (tn.getX(i) > 0.5) { const l = lum(i); lo = Math.min(lo, l); hi = Math.max(hi, l); }
  if (hi <= lo) return g;
  for (let i = 0; i < col.count; i++) {
    if (tn.getX(i) <= 0.5) continue;
    const c = ramp(cols, (lum(i) - lo) / (hi - lo));
    col.setXYZ(i, c.r, c.g, c.b);
    tn.setX(i, keepTint);
  }
  return g;
}

/** 수관 위쪽(법선이 위를 보는 곳)에 눈을 얹는다 */
function snowCap(g: THREE.BufferGeometry, from = 0.35): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
  const col = g.attributes.color as THREE.BufferAttribute, tn = g.attributes.aTint as THREE.BufferAttribute;
  const snow = C('#ffffff');
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 1.6) continue;
    const k = sstep(from, from + 0.3, nor.getY(i) + 0.06 * Math.sin(pos.getX(i) * 11 + pos.getZ(i) * 9));
    if (k <= 0) continue;
    col.setXYZ(i, col.getX(i) * (1 - k) + snow.r * k, col.getY(i) * (1 - k) + snow.g * k, col.getZ(i) * (1 - k) + snow.b * k);
    tn.setX(i, tn.getX(i) * (1 - k));
  }
  return g;
}

// ───────────── 열매 나무(활엽수 바탕) ─────────────
export type BroadFruitTree = 'starapple' | 'frostberry' | 'ginkgo';
const TREE_LEAF: Record<BroadFruitTree, string[]> = {
  // 별사과: 보랏빛 밤하늘 잎
  starapple: ['#6a62b8', '#8c86d8', '#aba8ec', '#cac9f7', '#ebebff'],
  // 눈꽃나무: 민트빛 서리 잎
  frostberry: ['#4f8f9a', '#6fb3b8', '#9fd6d4', '#cdeeea', '#f1fbfa'],
  // 은행: 샛노란 부채잎
  ginkgo: ['#b98a1e', '#e0b22e', '#f4cf4a', '#ffe27a', '#fff2b0'],
};
/** 활엽수 모양 + 섬 색 수관. 열매 자리(anchors)는 broadleaf 그대로 */
export function broadFruitTree(kind: BroadFruitTree, rnd: Rnd, detail: number, seed: number, hi: boolean): { geo: THREE.BufferGeometry; anchors: Anchor[] } {
  const { geo, anchors } = broadleaf(rnd, detail, seed, hi);
  recolorLeaves(geo, TREE_LEAF[kind].map(C), 1);
  if (kind === 'frostberry') snowCap(geo, 0.45);
  if (kind === 'ginkgo') {
    // 은행나무는 위로 길쭉하게
    geo.scale(0.82, 1.12, 0.82);
    for (const a of anchors) { a.p.x *= 0.82; a.p.y *= 1.12; a.p.z *= 0.82; }
  }
  return { geo, anchors };
}

/** 야자(코코넛·대추): 기본 야자에서 코코넛 묶음을 빼고 열매 자리를 꼭대기 둘레에 둔다 */
export function fruitPalm(kind: 'coconut' | 'date', rnd: Rnd): { geo: THREE.BufferGeometry; anchors: Anchor[] } {
  const { geo, top } = palm(rnd, { nuts: false });
  if (kind === 'date') {
    // 대추야자: 잎이 은빛 도는 회녹색
    recolorLeaves(geo, ['#4f7d5a', '#6f9e72', '#9cc493', '#c9e2b6'].map(C), 1);
  }
  const anchors: Anchor[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const n = V3(Math.cos(a), -0.15, Math.sin(a)).normalize();
    anchors.push({ p: V3(top.x + Math.cos(a) * 0.17, top.y - (kind === 'date' ? 0.08 : 0.12), top.z + Math.sin(a) * 0.17), n });
  }
  return { geo, anchors };
}

/** 바나나 나무: 통통한 헛줄기 + 크게 휘어 늘어진 잎 + 꽃봉오리. 바나나 송이는 열매(anchors) */
export function bananaPlant(rnd: Rnd): { geo: THREE.BufferGeometry; anchors: Anchor[] } {
  const H = 2.1 + rnd() * 0.3;
  const stem = sweep([V3(0, -0.2, 0), V3(0.02, H * 0.5, 0), V3(0.05, H, 0.02)], (t, a) => (0.17 - 0.05 * t) * (1 + 0.03 * Math.sin(a * 7)), RS(14, 8), RS(10, 5));
  paint(stem, (p, n) => ramp([C('#5f8f3a'), C('#86b04c'), C('#b6d478')], 0.25 + 0.5 * (p.y / H) + 0.2 * Math.max(0, n.x)).multiplyScalar(0.92 + 0.08 * Math.sin(p.y * 9)));
  const parts = [stem];
  const NL = 7;
  for (let k = 0; k < NL; k++) {
    const a = (k / NL) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const L = 1.45 + rnd() * 0.3;
    const lf = petal({
      len: L, width: 0.36, cup: 0.06, curl: -L * 0.55, nu: RS(14, 7), nv: RS(2, 1),
      shape: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + u * 0.92)), 0.55) * (1 - 0.12 * Math.abs(Math.sin(u * 23))),
    });
    lf.applyMatrix4(mat(V3(0.04, H - 0.05, 0.02), Q(Y, a).multiply(Q(X, -0.9 - rnd() * 0.35))));
    paint(lf, (q) => {
      const d = Math.hypot(q.x - 0.04, q.z - 0.02) / L;
      return ramp([C('#2f8a3e'), C('#4cae4c'), C('#8ed06a')], 0.35 + 0.5 * d);
    }, 1);
    parts.push(lf);
  }
  // 늘어진 꽃줄기 끝의 자주색 봉오리
  const sx = 0.32;
  const stalk = sweep([V3(0.05, H - 0.1, 0.02), V3(sx * 0.7, H - 0.25, 0.04), V3(sx, H - 0.75, 0.04)], () => 0.025, 6, 6);
  paint(stalk, () => C('#7aa548'));
  parts.push(stalk);
  const bud = ball(0.09, RS(3, 1), 1.6);
  bud.translate(sx, H - 0.85, 0.04);
  paint(bud, (q) => lerpC(C('#8a2a5a'), C('#c2508a'), (q.y - (H - 0.95)) * 4));
  parts.push(bud);
  return { geo: merge(parts), anchors: [{ p: V3(sx * 0.6, H - 0.38, 0.04), n: V3(1, 0, 0) }] };
}

/** 맹그로브: 짧은 줄기 + 갯벌 위로 활처럼 휜 뿌리 + 짙고 둥근 수관 */
export function mangrove(rnd: Rnd, seed: number): THREE.BufferGeometry {
  const H = 2.0;
  const trunk = sweep([V3(0, 0.45, 0), V3(0.05, 1.4, 0), V3(0, H + 0.3, 0)], (t) => 0.2 - 0.06 * t, RS(10, 6), RS(6, 3));
  const BARK = [C('#6f5a46'), C('#8f765c'), C('#b39a7c')];
  paint(trunk, (p) => ramp(BARK, p.y / (H + 0.4)));
  const parts = [trunk];
  const NR = 7;
  for (let k = 0; k < NR; k++) {
    const a = (k / NR) * Math.PI * 2 + rnd() * 0.5;
    const R = 0.6 + rnd() * 0.3, h0 = 0.6 + rnd() * 0.3;
    const d = V3(Math.cos(a), 0, Math.sin(a));
    const pts = [V3(0, h0, 0), d.clone().multiplyScalar(R * 0.45).add(V3(0, h0 + 0.2, 0)), d.clone().multiplyScalar(R * 0.85).add(V3(0, 0.45, 0)), d.clone().multiplyScalar(R).add(V3(0, -0.15, 0))];
    const rt = sweep(pts, (t) => 0.09 - 0.025 * t, RS(6, 4), RS(8, 4));
    paint(rt, (p) => ramp(BARK, 0.3 + p.y * 0.5));
    parts.push(rt);
  }
  const balls: Ball[] = [{ x: 0, y: H + 0.55, z: 0, r: 1.0, sy: 0.75 }];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28 + rnd(); balls.push({ x: Math.cos(a) * 0.75, y: H + 0.4 + rnd() * 0.2, z: Math.sin(a) * 0.75, r: 0.6 + rnd() * 0.12, sy: 0.8 }); }
  const { geo, dome, crease, c0 } = blob(balls, { detail: RS(11, 6), k: 0.4, cell: 0.5, amp: 0.07, seed });
  paint(geo, (p, n, i) => ramp([C('#1e5a3c'), C('#2f7a48'), C('#4f9c58'), C('#86c46a')], sstep(c0.y - 0.9, c0.y + 0.9, p.y + n.y * 0.3)).multiplyScalar(0.8 + 0.2 * (0.5 * dome[i] + 0.5 * crease[i])), 1);
  parts.push(geo);
  return merge(parts);
}

/** 부채 선인장(오푼티아): 납작한 둥근 판이 층층이 + 분홍 꽃 */
export function fanCactus(rnd: Rnd): THREE.BufferGeometry {
  const GR = [C('#3b8f58'), C('#5cb468'), C('#94d886')];
  const parts: THREE.BufferGeometry[] = [];
  const pad = (p: THREE.Vector3, yaw: number, tilt: number, s: number, flower: boolean) => {
    const g = ball(0.32 * s, RS(3, 2));
    g.scale(1, 1.25, 0.34);
    paint(g, (q, n) => ramp(GR, 0.3 + 0.4 * sstep(-0.3 * s, 0.4 * s, q.y) + 0.3 * Math.abs(n.z)).multiplyScalar(0.9 + 0.1 * cells(q.x, q.y, q.z, 0.08, 5).dome), 0);
    const m = mat(p, Q(Y, yaw).multiply(Q(Z, tilt)));
    g.applyMatrix4(m);
    parts.push(g);
    // 가시 점(밝은 점)
    if (flower) {
      const top = V3(0, 0.4 * s, 0).applyMatrix4(m);
      for (let k = 0; k < 5; k++) {
        const pt = petal({ len: 0.08, width: 0.05, cup: 0.015, curl: 0.02, nu: RS(4, 2), nv: 1 });
        pt.applyMatrix4(mat(top, Q(Y, (k / 5) * Math.PI * 2).multiply(Q(X, -0.7))));
        paint(pt, () => C('#ffffff'), 1);
        parts.push(pt);
      }
      const c = ball(0.025, 1); c.translate(top.x, top.y + 0.01, top.z); paint(c, () => C('#ffe46a')); parts.push(c);
    }
    return m;
  };
  const m0 = pad(V3(0, 0.36, 0), rnd() * 6.28, 0, 1.1, false);
  const tip = V3(0, 0.36, 0).applyMatrix4(m0);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const m1 = pad(V3(tip.x + s * 0.18, tip.y + 0.22, tip.z), rnd() * 6.28, s * (0.35 + rnd() * 0.2), 0.85, rnd() < 0.7);
    if (i === 1) { const t1 = V3(0, 0.3, 0).applyMatrix4(m1); pad(V3(t1.x + 0.05, t1.y + 0.18, t1.z), rnd() * 6.28, 0.15, 0.6, true); }
  }
  return merge(parts);
}

/** 유성초: 가는 줄기 끝의 통통한 별꽃(틴트 = 밤 발광) */
export function meteorFlower(rnd: Rnd): THREE.BufferGeometry {
  const H = 0.3 + rnd() * 0.08;
  const top = V3((rnd() - 0.5) * 0.05, H, (rnd() - 0.5) * 0.05);
  const stem = sweep([V3(0, -0.03, 0), V3(top.x * 0.3, H * 0.5, top.z * 0.3), top], () => 0.012, RS(5, 3), RS(4, 2), false);
  paint(stem, (p) => lerpC(C('#3a7f6a'), C('#6cc0a0'), p.y / H));
  const parts = [stem];
  for (let i = 0; i < 2; i++) {
    const lf = petal({ len: 0.12, width: 0.03, cup: 0.01, curl: -0.04, nu: RS(4, 2), nv: 1 });
    lf.applyMatrix4(mat(V3(0, 0.02, 0), Q(Y, i * Math.PI + rnd()).multiply(Q(X, -0.8))));
    paint(lf, () => C('#5aa88a'));
    parts.push(lf);
  }
  const star = puffyStar(0.075, 0.5);
  paint(star, (q) => C('#ffffff').multiplyScalar(0.82 + 0.18 * Math.min(1, Math.hypot(q.x, q.y) / 0.06)), 1);
  star.applyMatrix4(mat(top, Q(X, -1.2 + (rnd() - 0.5) * 0.4).premultiply(Q(Y, rnd() * 6.28))));
  parts.push(star);
  const c = ball(0.022, 1); c.translate(top.x, top.y + 0.02, top.z); paint(c, () => C('#fff3a0'), 0); parts.push(c);
  return merge(parts);
}

/** 통통한 별(별사과·유성초): 가운데 공 + 다섯 팔(구슬 둘씩)을 부드럽게 합친다. xy 평면, z 는 납작 */
function puffyStar(r: number, flat: number): THREE.BufferGeometry {
  const balls: Ball[] = [{ x: 0, y: 0, z: 0, r: r * 0.62, sz: flat }];
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + (k / 5) * Math.PI * 2;
    balls.push({ x: Math.cos(a) * r * 0.55, y: Math.sin(a) * r * 0.55, z: 0, r: r * 0.36, sz: flat });
    balls.push({ x: Math.cos(a) * r * 0.95, y: Math.sin(a) * r * 0.95, z: 0, r: r * 0.2, sz: flat });
  }
  return blob(balls, { detail: RS(8, 4), k: r * 0.22, cell: r, amp: 0, seed: 9 }).geo;
}

/** 바람개비: 줄무늬 막대 + 네 날개(aSpin=1 → 셰이더가 돌린다, 축 높이 PINWHEEL_HUB) */
export const PINWHEEL_HUB = 0.95;
export function pinwheel(rnd: Rnd): THREE.BufferGeometry {
  const H = PINWHEEL_HUB;
  const stick = sweep([V3(0, -0.1, 0), V3(0, H * 0.5, 0), V3(0, H + 0.02, 0)], () => 0.022, RS(8, 5), RS(8, 4));
  paint(stick, (p) => (Math.sin(p.y * 22) > 0 ? C('#ffffff') : C('#ff8fb5')));
  const parts = [stick];
  const COLS = ['#ff8fb5', '#ffd84a', '#7fe0c0', '#8fb2ff'];
  const off = rnd() * 4 | 0;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    // 접힌 삼각 날개: 가운데에서 바깥으로 넓어지는 잎 한 장을 살짝 비틀어
    const b = petal({ len: 0.24, width: 0.11, cup: 0.0, curl: 0.0, nu: RS(5, 3), nv: 1,
      shape: (u) => Math.min(1, u * 1.25) * (1 - 0.35 * sstep(0.8, 1, u)), bend: (u) => 0.04 * u * u });
    // 잎(+z 로 뻗음)을 xy 평면 반지름 방향으로 눕힌다
    b.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    b.applyMatrix4(new THREE.Matrix4().makeRotationZ(a - Math.PI / 2));
    b.translate(0, H, 0.07);
    const col = C(COLS[(k + off) % 4]);
    paint(b, (q) => col.clone().multiplyScalar(0.85 + 0.15 * Math.min(1, Math.hypot(q.x, q.y - H) / 0.2)), 0);
    parts.push(b);
  }
  const hub = ball(0.035, RS(2, 1)); hub.translate(0, H, 0.085); paint(hub, () => C('#fff6e0')); parts.push(hub);
  const g = merge(parts);
  // 날개·심(앞쪽 z)만 돈다
  const pos = g.attributes.position as THREE.BufferAttribute;
  const sp = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) sp[i] = pos.getZ(i) > 0.04 ? 1 : 0;
  g.setAttribute('aSpin', new THREE.BufferAttribute(sp, 1));
  return g;
}

// ───────────── 열매 모양 ─────────────
export function coconut(): THREE.BufferGeometry {
  const b = ball(0.16, 3, 1.08);
  paint(b, (q) => {
    // 동그란 눈 세 개(코코넛 얼굴)
    const top = V3(0, 0.17, 0);
    const d = q.distanceTo(top);
    const eye = [0, 1, 2].some((k) => { const a = (k / 3) * Math.PI * 2; return q.distanceTo(V3(Math.cos(a) * 0.05, 0.16, Math.sin(a) * 0.05)) < 0.022; });
    if (eye) return C('#3d2c1c');
    return ramp([C('#5b3f22'), C('#86603a'), C('#b08454')], 0.3 + 0.5 * sstep(0.2, 0, d) + 0.2 * cells(q.x, q.y, q.z, 0.03, 4).dome);
  });
  return b;
}
export function bananaBunch(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stalk = sweep([V3(0, 0.22, 0), V3(0, 0.05, 0), V3(0, -0.12, 0)], () => 0.02, 6, 4);
  paint(stalk, () => C('#7a8f3a'));
  parts.push(stalk);
  for (let row = 0; row < 2; row++) for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + row * 0.6;
    const y0 = 0.06 - row * 0.1;
    const d = V3(Math.cos(a), 0, Math.sin(a));
    const pts = [V3(0, y0, 0).addScaledVector(d, 0.03), V3(0, y0 - 0.02, 0).addScaledVector(d, 0.1), V3(0, y0 + 0.06, 0).addScaledVector(d, 0.15), V3(0, y0 + 0.14, 0).addScaledVector(d, 0.16)];
    const b = sweep(pts, (t) => 0.028 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.9)), 0.5) + 0.004, RS(7, 5), RS(7, 4));
    paint(b, (_q, _n, i) => (i < 6 ? C('#6b5a2a') : C('#ffe060').lerp(C('#fff2a0'), 0.3)));
    parts.push(b);
  }
  return merge(parts);
}
export function dateCluster(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const st = sweep([V3(0, 0.12, 0), V3(0.02, 0, 0), V3(0, -0.12, 0)], () => 0.012, 5, 4);
  paint(st, () => C('#c9953a'));
  parts.push(st);
  for (let k = 0; k < 8; k++) {
    const a = k * 2.4, y = 0.06 - k * 0.025, r = 0.03 + (k % 3) * 0.012;
    const b = ball(0.035, 2, 1.45);
    b.translate(Math.cos(a) * r, y, Math.sin(a) * r);
    paint(b, (q, n) => ramp([C('#8a3e1a'), C('#c2652a'), C('#f0a050')], 0.3 + 0.6 * Math.max(0, n.y * 0.5 + n.x * 0.5)));
    parts.push(b);
  }
  return merge(parts);
}
export function starApple(): THREE.BufferGeometry {
  const s = puffyStar(0.17, 0.62);
  // 별 몸통은 틴트(밤에 은은히 빛난다) — 색은 정점색으로 레몬빛
  paint(s, (q) => ramp([C('#ffb347'), C('#ffd84a'), C('#fff3a0')], 0.4 + 0.6 * sstep(-0.12, 0.14, q.y + q.z * 0.5)), 1);
  const stem = sweep([V3(0, 0.12, 0), V3(0.01, 0.2, 0), V3(0.03, 0.25, 0)], (t) => 0.014 * (1 - 0.4 * t), 5, 3);
  paint(stem, () => C('#6a4a2a'));
  const leaf = petal({ len: 0.13, width: 0.06, cup: 0.012, curl: -0.02, nu: 4, nv: 1 });
  leaf.applyMatrix4(mat(V3(0.02, 0.22, 0), Q(Y, -0.5).multiply(Q(X, -0.45))));
  paint(leaf, (q) => lerpC(C('#5b56b8'), C('#9a93ee'), q.z * 6));
  return merge([s, stem, leaf]);
}
export function frostBerry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const BER = [V3(0, 0, 0), V3(0.075, 0.02, 0.02), V3(-0.07, 0.015, 0.03), V3(0.01, 0.03, -0.075), V3(0.02, -0.06, 0.03), V3(-0.03, 0.08, 0.01)];
  for (const p of BER) {
    const b = ball(0.055, 2);
    b.translate(p.x, p.y, p.z);
    paint(b, (q, n) => ramp([C('#3f5fbf'), C('#6f8fff'), C('#c9d8ff')], 0.35 + 0.55 * Math.max(0, n.y)).lerp(C('#ffffff'), sstep(0.7, 1, n.y) * 0.7));
    parts.push(b);
  }
  const st = sweep([V3(0, 0.08, 0), V3(0, 0.15, 0), V3(0.02, 0.2, 0)], () => 0.01, 4, 3);
  paint(st, () => C('#6f8a5a'));
  parts.push(st);
  return merge(parts);
}
export function ginkgoNuts(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const p = V3(Math.cos(a) * 0.05, -0.02 - (k % 2) * 0.03, Math.sin(a) * 0.05);
    const b = ball(0.05, 2, 1.12);
    b.translate(p.x, p.y, p.z);
    paint(b, (_q, n) => ramp([C('#d99a3a'), C('#f2c25a'), C('#ffe9a0')], 0.4 + 0.5 * Math.max(0, n.y)));
    parts.push(b);
    const st = sweep([p.clone().add(V3(0, 0.04, 0)), V3(0, 0.12, 0)], () => 0.008, 4, 2, false);
    paint(st, () => C('#8a7a3a'));
    parts.push(st);
  }
  // 작은 부채잎 하나
  const lf = petal({ len: 0.14, width: 0.12, cup: 0.01, curl: 0.0, notch: 0.8, nu: 4, nv: 2, shape: (u) => Math.min(1, u * 1.6) * (1 - 0.15 * u) });
  lf.applyMatrix4(mat(V3(0, 0.12, 0), Q(Y, 0.8).multiply(Q(X, -0.6))));
  paint(lf, () => C('#ffd84a'));
  parts.push(lf);
  return merge(parts);
}

// ───────────── 말랑섬 랜드마크 나무 ─────────────
/** 큰 나무 공통: 뿌리가 퍼진 굵은 줄기 + 굵은 가지 + 구름 수관. 높이 ≈ 4 m(배율로 키운다) */
function giantTree(rnd: Rnd, seed: number, o: { leaf: THREE.Color[]; spread: number; tint: number; crown: number }): { geo: THREE.BufferGeometry; crownY: number; crownR: number } {
  const topY = 2.0;
  const ph = rnd() * 6.28;
  const trunk = sweep([V3(0, -0.3, 0), V3(0, 0.5, 0), V3(0.05, 1.3, 0.02), V3(0, topY, 0)], (_t, a, P) => {
    const y = Math.max(0, P.y);
    const root = Math.pow(Math.max(0, Math.cos(4 * a + ph)), 3);
    return 0.3 * (1 - 0.32 * Math.min(1, y / topY)) + 0.32 * Math.exp(-y * 4.5) * (0.5 + 0.9 * root);
  }, RS(22, 12), RS(18, 9));
  const BARK = [C('#5e3f2c'), C('#7d5a40'), C('#a07a56')];
  paint(trunk, (p) => ramp(BARK, p.y / topY).multiplyScalar(0.92 + 0.08 * Math.sin(Math.atan2(p.z, p.x) * 7 + p.y * 3)));
  const parts = [trunk];
  const NB = 5;
  for (let i = 0; i < NB; i++) {
    const a = ph + (i / NB) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const d = V3(Math.cos(a), 0, Math.sin(a));
    const b = sweep([V3(0, 1.4, 0), d.clone().multiplyScalar(0.55 * o.spread).add(V3(0, 1.95, 0)), d.clone().multiplyScalar(1.05 * o.spread).add(V3(0, 2.45, 0))], (t) => 0.14 * (1 - 0.55 * t), RS(10, 6), RS(8, 4));
    paint(b, (p) => ramp(BARK, p.y / topY));
    parts.push(b);
  }
  const cy = 2.65;
  const balls: Ball[] = [{ x: 0, y: cy + 0.25, z: 0, r: 1.25 * o.crown, sy: 0.7 }];
  const NS = 7;
  for (let i = 0; i < NS; i++) {
    const a = ph + (i / NS) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const dd = (1.15 + rnd() * 0.25) * o.spread;
    balls.push({ x: Math.cos(a) * dd, y: cy - 0.05 + rnd() * 0.3, z: Math.sin(a) * dd, r: (0.72 + rnd() * 0.16) * o.crown, sy: 0.78 });
  }
  for (let i = 0; i < 3; i++) { const a = rnd() * 6.28; balls.push({ x: Math.cos(a) * 0.5, y: cy + 0.75, z: Math.sin(a) * 0.5, r: 0.7 * o.crown, sy: 0.8 }); }
  const { geo: crown, dome, crease, c0 } = blob(balls, { detail: RS(16, 9), k: 0.55, cell: 0.6, amp: 0.08, seed });
  paint(crown, (p, n, i) => {
    const t = sstep(c0.y - 1.0, c0.y + 1.0, p.y + n.y * 0.35);
    const fine = cells(p.x, p.y, p.z, 0.18, seed + 3);
    return ramp(o.leaf, t * 0.9 + 0.1 * dome[i]).multiplyScalar((0.82 + 0.18 * (0.5 * crease[i] + 0.5 * dome[i])) * (0.92 + 0.08 * fine.dome));
  }, o.tint);
  parts.push(crown);
  return { geo: merge(parts), crownY: cy, crownR: 1.9 * o.spread };
}

/** 소원나무(느티나무 25 m): 넓은 우산 수관 + 아래 가지에 매단 알록달록 소원 리본 */
export function wishTree(rnd: Rnd, seed: number): THREE.BufferGeometry {
  const { geo, crownY, crownR } = giantTree(rnd, seed, { leaf: [C('#2a6a3c'), C('#3d8c46'), C('#5fae52'), C('#8fd06a'), C('#b8e48a')], spread: 1.25, tint: 0, crown: 1.05 });
  const parts = [geo];
  const RIB = ['#ff8fb5', '#ffd84a', '#8fb2ff', '#7fe0c0', '#c79cff', '#ffa64a'];
  for (let k = 0; k < 22; k++) {
    const a = rnd() * 6.28, d = crownR * (0.45 + rnd() * 0.5);
    const top = V3(Math.cos(a) * d, crownY - 0.55 - rnd() * 0.25, Math.sin(a) * d);
    const L = 0.22 + rnd() * 0.16;
    const rb = petal({ len: L, width: 0.035, cup: 0, curl: 0.02, nu: 4, nv: 1, shape: () => 1 });
    rb.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2 + (rnd() - 0.5) * 0.3));
    rb.applyMatrix4(mat(top, Q(Y, rnd() * 6.28)));
    const c = C(RIB[k % RIB.length]);
    paint(rb, () => c, 0);
    parts.push(rb);
  }
  return merge(parts);
}

/** 할미벚(40 m): 분홍 구름 수관 + 아래로 처진 가지. 꽃잎 비는 halmiPetals 가 따로 */
export function halmiTree(rnd: Rnd, seed: number): THREE.BufferGeometry {
  return giantTree(rnd, seed, { leaf: [C('#e0789e'), C('#f39ab8'), C('#ffbfd3'), C('#ffd9e6'), C('#fff0f6')], spread: 1.1, tint: 0, crown: 1.12 }).geo;
}

/** 떨어지는 꽃잎 한 장(작은 하트꼴 잎, 양면) */
export function petalFlake(): THREE.BufferGeometry {
  const g = petal({ len: 0.2, width: 0.13, cup: 0.02, curl: 0.02, notch: 0.9, nu: 3, nv: 1 });
  g.translate(0, 0, -0.1);
  paint(g, (q) => lerpC(C('#ff9cc2'), C('#fff0f6'), 0.4 + q.z * 2), 0);
  return g;
}

// ───────────── 두드릴 돌 ─────────────
/** 통통한 바위: 둥근 덩어리 몇 개를 합친 몸 + 꼭대기 이끼 + 반짝 광석 알갱이(두드려 보고 싶게) */
export function tapRock(seed: number): THREE.BufferGeometry {
  const r = mulberry32(seed);
  const balls: Ball[] = [{ x: 0, y: 0.34, z: 0, r: 0.62, sy: 0.72 }];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + r() * 0.6; balls.push({ x: Math.cos(a) * 0.42, y: 0.25 + r() * 0.1, z: Math.sin(a) * 0.42, r: 0.36 + r() * 0.1, sy: 0.8 }); }
  balls.push({ x: 0.1, y: 0.7, z: -0.05, r: 0.36, sy: 0.85 });
  const { geo, dome, crease, c0 } = blob(balls, { detail: RS(12, 7), k: 0.22, cell: 0.32, amp: 0.06, seed });
  // 돌빛: 라벤더 → 복숭아빛 크림(회색 단색이 되지 않게)
  const ST = [C('#a597b8'), C('#c7b8d6'), C('#ead9e6'), C('#fff1ec')];
  paint(geo, (p, n, i) => {
    const t = sstep(-0.05, c0.y + 0.55, p.y + n.y * 0.2);
    const base = ramp(ST, 0.15 + 0.7 * t).multiplyScalar(0.78 + 0.22 * (0.6 * crease[i] + 0.4 * dome[i]));
    // 위를 보는 면에 이끼
    const moss = sstep(0.62, 0.9, n.y) * sstep(0.5, 0.9, p.y);
    return lerpC(base, C('#8fd06a'), moss * 0.8);
  }, (p, n) => 1 - sstep(0.62, 0.9, n.y) * sstep(0.5, 0.9, p.y));
  const parts = [geo];
  // 광석 알갱이: 분홍·노랑·하늘 보석
  const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute;
  const GEM = ['#ff9fd0', '#ffe066', '#9fdcff', '#c9a8ff'];
  const placed: THREE.Vector3[] = [];
  for (let tries = 0; tries < 900 && placed.length < 9; tries++) {
    const i = Math.floor(r() * pos.count);
    const p = V3().fromBufferAttribute(pos, i), n = V3().fromBufferAttribute(nor, i);
    if (n.y < -0.1 || p.y < 0.15 || n.y > 0.8 || placed.some((q) => q.distanceTo(p) < 0.25)) continue;
    placed.push(p);
    const gm = new THREE.OctahedronGeometry(0.075 + r() * 0.04, 0);
    gm.scale(1, 1.4, 1);
    const g2 = paint(gm, () => C(GEM[placed.length % GEM.length]), 0);
    g2.applyMatrix4(mat(p.clone().addScaledVector(n, 0.01), new THREE.Quaternion().setFromUnitVectors(Y, n)));
    parts.push(g2);
  }
  return merge(parts);
}
/** 부서진 돌 자리(자갈 무더기) */
export function rubble(seed: number): THREE.BufferGeometry {
  const r = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const a = r() * 6.28, d = 0.12 + r() * 0.35;
    const b = ball(0.12 + r() * 0.1, RS(2, 1), 0.7);
    b.translate(Math.cos(a) * d, 0.05, Math.sin(a) * d);
    paint(b, (_q, n) => ramp([C('#a7a1b2'), C('#cfc9d8'), C('#ece8f0')], 0.3 + 0.6 * Math.max(0, n.y)), 1);
    parts.push(b);
  }
  return merge(parts);
}
