// 내 집(텐트 → 집 증축 0~4단계)·집 앞 우체통·섬 주민 집. 원점 = 땅, 앞 = +z(마을 쪽).
// 0 텐트 · 1 작은 오두막(house:1) · 2 현관 달린 집 · 3 옆채 달린 집 · 4 2층 집 + 둥근 탑.
import * as THREE from 'three';
import { add, cap, cyl, sph, dome, rbox, grad, roundExtrude, roundRectShape, compactLive, V, WOOD, WOOD_DARK, BONE, type Built, type Col } from './common';

export const HOUSE_STAGES = 4;
/** 단계 이름(HUD·디버그용) */
export const HOUSE_STAGE_NAMES = ['캠핑 텐트', '아담한 오두막', '현관 집', '옆채 집', '2층 집'] as const;

/** 해금 키(house:1~4)에서 집 단계(0~4). 순서와 상관없이 가장 높은 단계 */
export function houseStageFromUnlocks(isUnlocked: (key: string) => boolean): number {
  let s = 0;
  for (let n = 1; n <= HOUSE_STAGES; n++) if (isUnlocked(`house:${n}`)) s = n;
  return s;
}
/** 'house:<n>' 키 → n(아니면 null) */
export function houseKeyStage(key: string): number | null {
  const m = /^house:(\d)$/.exec(key);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= HOUSE_STAGES ? n : null;
}
export function clampStage(n: number): number {
  return Math.max(0, Math.min(HOUSE_STAGES, Math.round(Number.isFinite(n) ? n : 0)));
}

// ───────── 부품 ─────────
/** x 로 세로 줄무늬(천막) — 아래로 갈수록 살짝 진하게 */
function stripesX(geo: THREE.BufferGeometry, cols: string[], band: number): THREE.BufferGeometry {
  const cs = cols.map((c) => new THREE.Color(c));
  const p = geo.attributes.position;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const a = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = Math.floor((p.getX(i) - bb.min.x) / band) % cs.length;
    const t = (p.getY(i) - bb.min.y) / Math.max(1e-4, bb.max.y - bb.min.y);
    c.copy(cs[k]).multiplyScalar(0.88 + 0.12 * t);
    a.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** 통통한 박공 지붕(용마루 = z, 박공이 앞을 본다). 원점 = 벽 윗면 가운데 */
function gableRoof(span: number, length: number, RH: number, color: THREE.ColorRepresentation, o: { balls?: boolean; gable?: string } = {}): THREE.Group {
  const roof = new THREE.Group();
  const RW = span / 2 + 0.04, RL = length;
  const tri = new THREE.Shape();
  tri.moveTo(-RW, 0); tri.lineTo(RW, 0);
  tri.quadraticCurveTo(RW * 0.15, RH * 0.95, 0, RH); tri.quadraticCurveTo(-RW * 0.15, RH * 0.95, -RW, 0);
  const gable = roundExtrude(tri, RL - 0.06, 0.07, 20);
  gable.rotateY(Math.PI / 2);
  add(roof, gable, 'matte', [o.gable ?? '#fff0d6', '#fff7e8'], 0, 0, 0);
  const slope = Math.atan2(RH, RW), T = 0.24, zA = -0.06, zB = RW + 0.3;
  const slabLen = (zB - zA) / Math.cos(slope), roofW = RL + 0.5;
  const rc = new THREE.Color(color);
  for (const sg of [-1, 1]) {
    const slab = add(roof, rbox(roofW, T, slabLen, 0.11, 6), 'paint', [rc.clone().multiplyScalar(0.8), rc.clone().lerp(new THREE.Color('#ffffff'), 0.1)], 0, 0, 0);
    const zc = (zA + zB) / 2, ye = RH - zc * Math.tan(slope);
    slab.position.set(0, ye + (T / 2) * Math.cos(slope), sg * (zc + (T / 2) * Math.sin(slope)));
    slab.rotation.x = sg * slope;
    for (let i = 0; i < 3; i++) add(slab, cap(0.045, roofW - 0.45, 8).rotateZ(Math.PI / 2), 'paint', rc.clone().multiplyScalar(0.9), 0, T / 2 - 0.012, sg * (-0.25 + i * 0.36) * slabLen * 0.5);
    if (o.balls) {
      const yE = RH - zB * Math.tan(slope), n = Math.max(4, Math.round(roofW / 0.42));
      for (let i = 0; i < n; i++) add(roof, sph(0.16, 12, 8), 'paint', i % 2 ? '#ffffff' : rc.clone().lerp(new THREE.Color('#ffffff'), 0.45), -roofW / 2 + (roofW / n) * (i + 0.5), yE - 0.05, sg * (zB + 0.02), undefined, [1, 0.62, 0.6]);
    }
  }
  add(roof, cap(0.15, roofW - 0.2).rotateZ(Math.PI / 2), 'paint', rc.clone().lerp(new THREE.Color('#ffffff'), 0.15), 0, RH + 0.17, 0);
  roof.rotation.y = Math.PI / 2;
  return roof;
}

/** 둥근 윗변 문(+ 문틀·손잡이·계단). z = 벽 앞면 */
function door(g: THREE.Group, x: number, y: number, z: number, w = 0.6, h = 1.05, color = '#9a6440') {
  const ds = new THREE.Shape();
  const r = w / 2, hs = h - r;
  ds.moveTo(-r, 0); ds.lineTo(r, 0); ds.lineTo(r, hs); ds.absarc(0, hs, r, 0, Math.PI, false); ds.lineTo(-r, 0);
  add(g, roundExtrude(ds, 0.08, 0.03, 16), 'matte', '#f7f1e6', x, y + 0.01, z + 0.01, undefined, [1.18, 1.1, 1]);
  add(g, roundExtrude(ds, 0.1, 0.035, 16), 'wood', [new THREE.Color(color).multiplyScalar(0.9), color], x, y + 0.02, z + 0.05);
  add(g, sph(0.045, 16, 12), 'gold', null, x + r * 0.6, y + h * 0.48, z + 0.12);
  add(g, rbox(w + 0.4, 0.12, 0.45, 0.06, 4), 'stone', ['#bdb0a0', '#ddd2c2'], x, 0.06, z + 0.35);
}

/** 십자 창(+ 꽃상자). z = 벽 앞면, ry 로 옆벽에도 */
function windowBox(g: THREE.Group, x: number, y: number, z: number, s = 1, ry = 0, flowers = true) {
  const w = new THREE.Group();
  add(w, rbox(0.58 * s, 0.58 * s, 0.08, 0.1, 3), 'matte', '#ffffff', 0, 0, 0.02);
  add(w, rbox(0.44 * s, 0.44 * s, 0.06, 0.07, 2), 'window', null, 0, 0, 0.04);
  add(w, rbox(0.05, 0.46 * s, 0.05, 0.02, 2), 'matte', '#ffffff', 0, 0, 0.08);
  add(w, rbox(0.46 * s, 0.05, 0.05, 0.02, 2), 'matte', '#ffffff', 0, 0, 0.08);
  if (flowers) {
    add(w, rbox(0.62 * s, 0.14, 0.18, 0.05, 2), 'wood', WOOD, 0, -0.36 * s, 0.11);
    const fc = ['#ff8fb1', '#ffd34f', '#ffffff', '#ff8fb1', '#ffd34f'];
    for (let i = 0; i < 5; i++) {
      add(w, sph(0.06, 10, 7), 'matte', fc[i], -0.24 * s + i * 0.12 * s, -0.26 * s + (i % 2) * 0.03, 0.12);
      if (i < 4) add(w, sph(0.05, 8, 6), 'matte', '#6cc46a', -0.18 * s + i * 0.1 * s, -0.3 * s, 0.15, undefined, [1.2, 0.6, 1]);
    }
  }
  w.position.set(x, y, z);
  w.rotation.y = ry;
  g.add(w);
}

/** 벽 몸통(주춧돌 + 벽 + 아랫단 나무 판) */
function body(g: THREE.Group, W: number, D: number, H: number, wall: [string, string], x = 0, z = 0, y0 = 0) {
  const B = 0.2;
  add(g, rbox(W + 0.25, B, D + 0.25, 0.09, 4), 'stone', ['#b9ab98', '#d8ccb8'], x, y0 + B / 2, z);
  add(g, rbox(W, H, D, 0.16, 6), 'matte', wall, x, y0 + B + H / 2, z);
  add(g, rbox(W + 0.05, 0.3, D + 0.05, 0.12, 5), 'wood', ['#a77650', '#bf8c60'], x, y0 + B + 0.15, z);
  return B;
}

function chimney(g: THREE.Group, x: number, y: number, z: number) {
  add(g, rbox(0.38, 0.8, 0.38, 0.08, 4), 'stone', ['#a98f7c', '#c9b3a0'], x, y, z);
  add(g, rbox(0.48, 0.12, 0.48, 0.05, 3), 'stone', '#8b7768', x, y + 0.42, z);
}

function shrub(g: THREE.Group, x: number, z: number, k: number, c: string) {
  add(g, sph(0.32 * k, 14, 10), 'matte', '#6cc46a', x, 0.24 * k, z, undefined, [1, 0.78, 1]);
  for (let i = 0; i < 4; i++) add(g, sph(0.07, 8, 6), 'matte', c, x + Math.cos(i * 1.7) * 0.22 * k, 0.34 * k + (i % 2) * 0.05, z + Math.sin(i * 1.7) * 0.22 * k);
}

function fence(g: THREE.Group, x0: number, z0: number, x1: number, z1: number) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / 0.55));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    add(g, cap(0.06, 0.5, 8), 'paint', '#fffaf0', x, 0.3, z);
    add(g, sph(0.075, 8, 6), 'paint', '#fffaf0', x, 0.62, z);
  }
  const a = Math.atan2(x1 - x0, z1 - z0);
  for (const y of [0.25, 0.45]) add(g, rbox(0.05, 0.06, L, 0.02, 2), 'paint', '#fff3e0', (x0 + x1) / 2, y, (z0 + z1) / 2, [0, a, 0]);
}

/** 문패 기둥(집 이름은 안 쓰고 하트) */
function heartPlate(g: THREE.Group, x: number, z: number, color = '#ff8fb1') {
  add(g, cap(0.05, 0.85), 'wood', WOOD_DARK, x, 0.45, z);
  add(g, roundExtrude(roundRectShape(0.5, 0.36, 0.14), 0.06, 0.02), 'wood', ['#d6a571', '#e8be8c'], x, 0.95, z + 0.04);
  const hs = new THREE.Shape();
  hs.moveTo(0, -0.09);
  hs.bezierCurveTo(0.14, 0.02, 0.09, 0.13, 0, 0.06);
  hs.bezierCurveTo(-0.09, 0.13, -0.14, 0.02, 0, -0.09);
  add(g, roundExtrude(hs, 0.04, 0.012, 16), 'gloss', color, x, 0.95, z + 0.09);
}

// ───────── 0: 캠핑 텐트 ─────────
function tent(): Built {
  const g = new THREE.Group();
  // 바닥 깔개
  add(g, cyl(2.0, 2.0, 0.06, 40), 'cloth', '#a8d8a0', 0, 0.03, 0.4, undefined, [1, 1, 0.85]);
  // 천막 몸통: 통통한 삼각 기둥(앞뒤 = z), 주황·크림 줄
  const W = 2.6, Hh = 2.0, D = 2.8;
  const tri = new THREE.Shape();
  tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0);
  tri.quadraticCurveTo(W * 0.1, Hh * 0.9, 0, Hh); tri.quadraticCurveTo(-W * 0.1, Hh * 0.9, -W / 2, 0);
  const shell = roundExtrude(tri, D, 0.12, 24);
  stripesX(shell, ['#ffb36b', '#fff1dc'], 0.42);
  add(g, shell, 'cloth', null, 0, 0.05, 0);
  // 앞 입구: 걷어 올린 문(어두운 안쪽 + 묶은 자락)
  const hole = new THREE.Shape();
  hole.moveTo(-0.55, 0); hole.lineTo(0.55, 0); hole.quadraticCurveTo(0.12, 1.05, 0, 1.15); hole.quadraticCurveTo(-0.12, 1.05, -0.55, 0);
  add(g, roundExtrude(hole, 0.05, 0.015, 16), 'matte', '#7a5a4a', 0, 0.06, D / 2 + 0.02);
  for (const sx of [-1, 1]) add(g, cap(0.12, 0.6), 'cloth', '#ff9f5a', sx * 0.62, 0.55, D / 2 + 0.05, [0, 0, sx * 0.5]);
  // 기둥 + 깃발 + 줄 고정 말뚝
  add(g, cap(0.05, 0.6), 'wood', WOOD_DARK, 0, Hh + 0.25, D / 2 - 0.05);
  add(g, rbox(0.04, 0.26, 0.42, 0.04, 3), 'cloth', '#ff6f8f', 0, Hh + 0.45, D / 2 + 0.17);
  for (const [x, z] of [[-1.7, 1.6], [1.7, 1.6], [-1.7, -1.6], [1.7, -1.6]] as const) {
    add(g, cap(0.035, 0.18), 'wood', WOOD_DARK, x, 0.1, z);
    const top = V(Math.sign(x) * 0.3, Hh * 0.85, Math.sign(z) * (D / 2 - 0.1));
    const pts = [V(x, 0.2, z), V((x + top.x) / 2, (0.2 + top.y) / 2 - 0.08, (z + top.z) / 2), top];
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.015, 5), 'matte', '#f0dcb4', 0, 0, 0);
  }
  // 캠핑 랜턴(밤에 켜짐)
  add(g, cyl(0.12, 0.14, 0.06, 16), 'gloss', '#3f5a52', 1.15, 0.03, D / 2 + 0.45);
  add(g, cap(0.1, 0.12), 'lampGlow', null, 1.15, 0.2, D / 2 + 0.45);
  add(g, dome(0.13, 16, 8), 'gloss', '#3f5a52', 1.15, 0.33, D / 2 + 0.45, undefined, [1, 0.6, 1]);
  add(g, new THREE.TorusGeometry(0.07, 0.015, 6, 16, Math.PI), 'gloss', '#3f5a52', 1.15, 0.4, D / 2 + 0.45);
  // 모닥불(돌 고리 + 장작 + 불씨) + 통나무 의자
  const fx = -1.0, fz = D / 2 + 1.8;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(g, sph(0.15, 14, 10), 'stone', ['#a9a094', '#cfc7b9'], fx + Math.cos(a) * 0.45, 0.08, fz + Math.sin(a) * 0.45, undefined, [1, 0.7, 1]); }
  for (let i = 0; i < 3; i++) add(g, cap(0.06, 0.55).rotateZ(Math.PI / 2), 'wood', '#9a6a43', fx, 0.12 + i * 0.02, fz, [0, (i / 3) * Math.PI, 0.25]);
  add(g, sph(0.16, 16, 12), 'glow', null, fx, 0.2, fz, undefined, [1, 0.8, 1]);
  add(g, cyl(0.22, 0.24, 0.36, 18).rotateZ(Math.PI / 2), 'wood', ['#a77650', '#c8955f'], fx + 1.15, 0.22, fz + 0.2, [0, 0.4, 0]);
  shrub(g, -1.9, 0.3, 0.9, '#ffd34f');
  heartPlate(g, 1.9, D / 2 + 0.9);
  return { g, foot: 2.2, front: D / 2 + 0.6, cols: [{ kind: 'box', hx: W / 2 - 0.1, hy: 0.9, hz: D / 2, x: 0, y: 0.9, z: 0 }] };
}

// ───────── 1~4: 집 ─────────
interface HouseOpts { W: number; D: number; H: number; roof: string; wall?: [string, string]; RH?: number; porch?: boolean; chimney?: boolean; balls?: boolean }
function cottage(o: HouseOpts): Built & { top: number } {
  const g = new THREE.Group();
  const wall = o.wall ?? ['#efdcbc', '#fff4df'];
  const B = body(g, o.W, o.D, o.H, wall);
  const top = B + o.H - 0.02, RH = o.RH ?? Math.min(1.5, o.W * 0.42);
  const roof = gableRoof(o.W, o.D, RH, o.roof, { balls: o.balls });
  roof.position.y = top;
  g.add(roof);
  door(g, 0, B, o.D / 2);
  const nWin = o.W > 3.8 ? 2 : 1;
  for (let i = 0; i < nWin; i++) {
    const sx = nWin === 1 ? 1 : i ? 1 : -1;
    windowBox(g, sx * (o.W * 0.3 + 0.1), B + 0.95, o.D / 2, 1);
  }
  if (nWin === 1) windowBox(g, -o.W * 0.3 - 0.1, B + 0.95, o.D / 2, 0.85, 0, false);
  // 옆벽 창
  for (const sx of [-1, 1]) windowBox(g, sx * (o.W / 2), B + 0.95, 0, 0.9, sx * Math.PI / 2, false);
  // 박공 다락 둥근 창
  add(g, new THREE.TorusGeometry(0.18, 0.045, 12, 32), 'matte', '#ffffff', 0, top + RH * 0.4, o.D / 2 + 0.06);
  add(g, cyl(0.17, 0.17, 0.05, 32).rotateX(Math.PI / 2), 'window', null, 0, top + RH * 0.4, o.D / 2 + 0.03);
  if (o.chimney) chimney(g, o.W * 0.27, top + RH * 0.65, -o.D * 0.22);
  const cols: Col[] = [{ kind: 'box', hx: o.W / 2 + 0.1, hy: (top + RH) / 2, hz: o.D / 2 + 0.1, x: 0, y: (top + RH) / 2, z: 0 }];
  if (o.porch) {
    // 현관 지붕(작은 박공) + 둥근 기둥 두 개 + 나무 마루
    add(g, rbox(2.1, 0.14, 1.35, 0.06, 3), 'wood', ['#b9834f', '#d6a571'], 0, 0.07, o.D / 2 + 0.75);
    for (const sx of [-1, 1]) {
      add(g, cap(0.08, 1.75), 'paint', '#fffaf0', sx * 0.88, 0.95, o.D / 2 + 1.3);
      add(g, sph(0.11, 14, 10), 'paint', '#fffaf0', sx * 0.88, 1.92, o.D / 2 + 1.3);
    }
    const pr = gableRoof(2.0, 1.55, 0.55, o.roof);
    pr.position.set(0, 1.98, o.D / 2 + 0.7);
    g.add(pr);
  }
  return { g, cols, foot: Math.max(o.W, o.D) / 2 + 0.6, front: o.D / 2 + (o.porch ? 1.6 : 0.6), top: top + RH };
}

function stage1(): Built {
  const b = cottage({ W: 3.2, D: 2.9, H: 1.9, roof: '#ee6f62', chimney: true });
  shrub(b.g, -2.0, 1.2, 1, '#ff8fb1');
  shrub(b.g, 2.0, 1.0, 0.8, '#ffd34f');
  heartPlate(b.g, 1.7, 2.6);
  return b;
}

function stage2(): Built {
  const b = cottage({ W: 4.4, D: 3.6, H: 2.2, roof: '#4fb39c', wall: ['#fbe3cf', '#fff6ea'], porch: true, chimney: true, balls: true });
  fence(b.g, -3.4, 3.6, -1.4, 3.6);
  fence(b.g, 1.4, 3.6, 3.4, 3.6);
  shrub(b.g, -2.9, 2.2, 1.1, '#ff8fb1');
  shrub(b.g, 2.9, 2.0, 1, '#ffffff');
  heartPlate(b.g, 2.2, 4.1, '#ff6f8f');
  return b;
}

function stage3(): Built {
  const b = cottage({ W: 4.8, D: 3.8, H: 2.3, roof: '#5a8fe0', wall: ['#e8f2ff', '#fffaf2'], porch: true, chimney: true, balls: true });
  // 옆채(오른쪽, 낮은 지붕) + 둥근 내민 창
  const wing = cottage({ W: 2.8, D: 3.0, H: 1.8, roof: '#7aa8f0', wall: ['#e8f2ff', '#fffaf2'] });
  wing.g.position.set(3.75, 0, -0.35);
  b.g.add(wing.g);
  b.cols.push({ kind: 'box', hx: 1.5, hy: 1.6, hz: 1.6, x: 3.75, y: 1.6, z: -0.35 });
  add(b.g, cyl(0.62, 0.62, 1.0, 28, false), 'matte', ['#e8f2ff', '#fffaf2'], -2.4, 1.15, 0.6, undefined, [1, 1, 0.7]);
  add(b.g, dome(0.66, 28, 10), 'paint', '#5a8fe0', -2.4, 1.65, 0.6, undefined, [1, 0.5, 0.72]);
  add(b.g, rbox(0.8, 0.55, 0.1, 0.1, 3), 'window', null, -2.4, 1.15, 1.04);
  // 텃밭(나무 틀 + 동글 채소)
  add(b.g, rbox(1.8, 0.22, 1.0, 0.06, 3), 'wood', ['#a77650', '#c08c5c'], 3.8, 0.11, 2.6);
  for (let i = 0; i < 6; i++) add(b.g, sph(0.13, 12, 10), 'matte', i % 2 ? '#ff8a4a' : '#7ed38d', 3.15 + (i % 3) * 0.6, 0.3, 2.35 + Math.floor(i / 3) * 0.5);
  fence(b.g, -4.0, 4.0, -1.4, 4.0);
  fence(b.g, 1.4, 4.0, 5.2, 4.0);
  heartPlate(b.g, 2.1, 4.5, '#5aaef0');
  b.foot = 5;
  return b;
}

function stage4(): Built {
  const g = new THREE.Group();
  const W = 5.6, D = 4.4, H1 = 2.4, H2 = 2.0;
  const wall: [string, string] = ['#fde6ef', '#fff8fb'];
  const B = body(g, W, D, H1, wall);
  // 1층·2층 사이 띠 + 2층 몸통(조금 작게)
  add(g, rbox(W + 0.2, 0.22, D + 0.2, 0.1, 4), 'wood', ['#c8955f', '#e3b27c'], 0, B + H1, 0);
  const W2 = 4.4, D2 = 3.6, y2 = B + H1 + 0.1;
  add(g, rbox(W2, H2, D2, 0.16, 6), 'matte', wall, 0, y2 + H2 / 2, -0.2);
  const RH = 1.6;
  const roof = gableRoof(W2, D2, RH, '#ff7fa8', { balls: true, gable: '#fff0f4' });
  roof.position.set(0, y2 + H2 - 0.02, -0.2);
  g.add(roof);
  // 1층 지붕 처마(앞 차양)
  add(g, rbox(W + 0.4, 0.16, 0.9, 0.07, 4), 'paint', ['#e86b94', '#ff9fc0'], 0, B + H1 - 0.05, D / 2 + 0.35, [0.35, 0, 0]);
  // 발코니(2층 앞) + 난간
  add(g, rbox(W2 - 0.4, 0.14, 0.9, 0.06, 3), 'wood', ['#b9834f', '#d6a571'], 0, y2 + 0.05, D2 / 2 + 0.1 - 0.2 + 0.45);
  for (let i = 0; i <= 8; i++) {
    const x = -(W2 - 0.6) / 2 + ((W2 - 0.6) / 8) * i;
    add(g, cap(0.04, 0.42), 'paint', '#ffffff', x, y2 + 0.36, D2 / 2 + 0.7);
  }
  add(g, cap(0.05, W2 - 0.5).rotateZ(Math.PI / 2), 'paint', '#ffffff', 0, y2 + 0.62, D2 / 2 + 0.7);
  door(g, 0, B, D / 2, 0.7, 1.2, '#b0705a');
  for (const sx of [-1, 1]) windowBox(g, sx * 1.75, B + 1.05, D / 2, 1.1);
  for (const sx of [-1, 1]) windowBox(g, sx * 1.2, y2 + 1.1, D2 / 2 - 0.2, 0.95, 0, false);
  door(g, 0, y2 + 0.1, D2 / 2 - 0.2, 0.55, 1.0, '#b0705a');
  for (const sx of [-1, 1]) windowBox(g, sx * (W / 2), B + 1.05, 0, 0.95, sx * Math.PI / 2, false);
  chimney(g, -1.2, y2 + H2 + RH * 0.75, -0.9);
  // 둥근 탑(왼쪽 뒤) + 고깔 지붕 + 깃발
  const tx = -W / 2 - 0.4, tz = -D / 2 + 0.6;
  add(g, cyl(0.95, 1.05, 4.6, 32), 'matte', wall, tx, B + 2.3, tz);
  add(g, new THREE.ConeGeometry(1.25, 1.9, 32, 3), 'paint', ['#e86b94', '#ff9fc0'], tx, B + 4.6 + 0.95, tz);
  add(g, sph(0.14, 14, 10), 'gold', null, tx, B + 6.6, tz);
  add(g, cap(0.03, 0.8), 'gloss', '#5a6f6a', tx, B + 7.0, tz);
  add(g, rbox(0.04, 0.3, 0.5, 0.04, 3), 'cloth', '#ffd34f', tx, B + 7.25, tz + 0.27);
  for (const y of [1.3, 3.2]) add(g, rbox(0.42, 0.6, 0.1, 0.14, 3), 'window', null, tx + 0.55, B + y, tz + 0.75, [0, 0.62, 0]);
  // 정원: 아치 문 + 울타리 + 꽃 덤불
  for (const sx of [-1, 1]) add(g, cap(0.07, 1.6), 'paint', '#ffffff', sx * 0.75, 0.85, D / 2 + 2.6);
  add(g, new THREE.TorusGeometry(0.75, 0.07, 10, 28, Math.PI), 'paint', '#ffffff', 0, 1.65, D / 2 + 2.6);
  for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI; add(g, sph(0.12, 12, 10), 'matte', i % 2 ? '#ff8fb1' : '#6cc46a', Math.cos(a) * 0.75, 1.65 + Math.sin(a) * 0.75, D / 2 + 2.6); }
  fence(g, -4.2, D / 2 + 2.6, -0.85, D / 2 + 2.6);
  fence(g, 0.85, D / 2 + 2.6, 4.2, D / 2 + 2.6);
  for (const [x, z, c] of [[-3.4, 3.0, '#ff8fb1'], [3.4, 3.1, '#ffd34f'], [3.6, -1.2, '#ffffff'], [-3.9, 0.9, '#ff8fb1']] as const) shrub(g, x, z, 1.15, c);
  heartPlate(g, 1.6, D / 2 + 3.1, '#ff6f8f');
  return {
    g, foot: 5.5, front: D / 2 + 0.6,
    cols: [
      { kind: 'box', hx: W / 2 + 0.1, hy: (y2 + H2 + RH) / 2, hz: D / 2 + 0.1, x: 0, y: (y2 + H2 + RH) / 2, z: 0 },
      { kind: 'cyl', r: 1.05, hh: 2.6, x: tx, y: 2.6, z: tz },
    ],
  };
}

/** 집 단계 n(0~4) 외형 */
export function buildHomeStage(n: number): Built {
  switch (clampStage(n)) {
    case 0: return tent();
    case 1: return stage1();
    case 2: return stage2();
    case 3: return stage3();
    default: return stage4();
  }
}

// ───────── 집 앞 우체통(깃발 = 살아 있는 조각) ─────────
export function buildHomeMailbox(): Built & { flag: THREE.Object3D } {
  const g = new THREE.Group();
  add(g, rbox(0.56, 0.1, 0.56, 0.05, 3), 'stone', ['#b9ab98', '#dcd0bd'], 0, 0.05, 0);
  add(g, rbox(0.14, 1.0, 0.14, 0.05, 3), 'wood', [WOOD_DARK, WOOD], 0, 0.55, 0);
  // 몸통: 둥근 지붕 상자(하늘색) + 흰 뚜껑 + 편지 구멍
  const arch = new THREE.Shape();
  arch.moveTo(-0.22, 0); arch.lineTo(0.22, 0); arch.lineTo(0.22, 0.2); arch.absarc(0, 0.2, 0.22, 0, Math.PI, false); arch.lineTo(-0.22, 0);
  add(g, roundExtrude(arch, 0.6, 0.06, 28), 'gloss', ['#4c9fe0', '#7cc4f5'], 0, 1.02, 0);
  add(g, roundExtrude(arch, 0.05, 0.018, 28), 'matte', '#fff6ea', 0, 1.04, 0.31, undefined, [0.86, 0.86, 1]);
  add(g, rbox(0.24, 0.04, 0.04, 0.015, 2), 'matte', '#3a4a5a', 0, 1.24, 0.34);
  // 하트 스티커 + 작은 지붕 장식
  const hs = new THREE.Shape();
  hs.moveTo(0, -0.05); hs.bezierCurveTo(0.08, 0.01, 0.05, 0.075, 0, 0.035); hs.bezierCurveTo(-0.05, 0.075, -0.08, 0.01, 0, -0.05);
  add(g, roundExtrude(hs, 0.02, 0.006, 12), 'gloss', '#ff8fb1', 0, 1.13, 0.345);
  add(g, sph(0.06, 12, 10), 'gold', null, 0, 1.47, 0);
  // 꽃 화분(기둥 아래)
  for (let i = 0; i < 5; i++) { const a = i * 1.26; add(g, sph(0.06, 12, 8), 'matte', ['#ff8fb1', '#ffd34f', '#ffffff', '#ff8fb1', '#b48cf0'][i], Math.cos(a) * 0.2, 0.16, Math.sin(a) * 0.2); }
  // 깃발(편지 오면 선다) — 옆면 축으로 돈다
  const flag = new THREE.Group();
  flag.position.set(0.25, 1.12, -0.1);
  flag.userData.live = true;
  add(flag, rbox(0.035, 0.34, 0.035, 0.015, 2), 'paint', '#f2c94c', 0, 0.15, 0);
  add(flag, rbox(0.03, 0.14, 0.2, 0.03, 3), 'paint', '#ff6f61', 0, 0.26, 0.09);
  flag.rotation.x = -Math.PI / 2; // 내린 상태
  g.add(compactLive(flag));
  return { g, foot: 0.4, front: 0.5, flag, cols: [{ kind: 'box', hx: 0.12, hy: 0.7, hz: 0.12, x: 0, y: 0.7, z: 0 }] };
}

// ───────── 섬 주민 집(섬 색) ─────────
export const RESIDENT_ROOF: Record<string, string> = {
  home: '#ee6f62', dino: '#7cc96b', ice: '#7fb8ff', mushroom: '#c58cff', coral: '#4fd1c5', desert: '#ffb347', launch: '#7f8cff',
};
export function buildResidentHouse(island: string, accent?: string): Built {
  const roof = accent ?? RESIDENT_ROOF[island] ?? '#ee6f62';
  const wall: [string, string] = island === 'desert' ? ['#f2d6a8', '#fff0d2'] : island === 'ice' ? ['#e8f4ff', '#ffffff'] : ['#efdcbc', '#fff4df'];
  const b = cottage({ W: 3.0, D: 2.7, H: 1.8, roof, wall, chimney: island === 'ice' || island === 'home', balls: true });
  // 섬마다 한 가지 장식
  if (island === 'ice') add(b.g, dome(0.7, 20, 8), 'matte', '#ffffff', 0, 3.25, 0, undefined, [1.6, 0.3, 1.6]);
  else if (island === 'desert') add(b.g, cyl(0.25, 0.3, 0.5, 16), 'paint', ['#d0704e', '#e98c63'], 1.9, 0.25, 1.4);
  else if (island === 'coral') { add(b.g, cap(0.08, 2.0), 'wood', '#b8855a', -2.0, 1.0, 1.0); add(b.g, sph(0.5, 16, 10), 'matte', '#6cc46a', -2.0, 2.1, 1.0, undefined, [1.4, 0.35, 1.4]); }
  else if (island === 'mushroom') { add(b.g, cyl(0.1, 0.13, 0.5, 12), 'matte', BONE, 1.8, 0.25, 1.2); add(b.g, dome(0.32, 18, 8), 'gloss', '#ff7a8a', 1.8, 0.5, 1.2); }
  else if (island === 'dino') add(b.g, sph(0.32, 16, 12), 'matte', '#fff3d6', -1.85, 0.32, 1.3, undefined, [0.85, 1.15, 0.85]);
  else if (island === 'launch') { add(b.g, cap(0.03, 1.0), 'gloss', '#8c98a8', 1.1, 3.4, -0.6); add(b.g, sph(0.08, 10, 8), 'glow', null, 1.1, 3.95, -0.6); }
  shrub(b.g, -1.9, 1.2, 0.85, '#ffd34f');
  heartPlate(b.g, 1.5, 2.3, roof);
  return b;
}

export { grad };
