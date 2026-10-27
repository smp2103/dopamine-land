// islanddev 모델 — 섬 개발 기부함, 부두·다리(지름길), 섬 깃발·음악 상자, 마당 꾸미기 조각, 비눗방울·리프트 의자, 연못 물고기·아기 공룡.
// 정적인 것은 Builder 에 모아 청크마다 굽는다. 움직이는 것(물고기·공룡·반딧불)은 작은 메시 몇 개만.
import * as THREE from 'three';
import { addEyes, blobShadow } from '../../core/art';
import { Builder, rbox, sph, cyl, cone, torus, cap, labelMesh } from './kit';
import { YARD_CELL, ISLAND_FLAG, type DevIsland } from './data';
import { footprint, pieceCenter, type Span, type YardPiece } from './logic';

const WOOD: [string, string] = ['#b9834f', '#d9a66d'];
const WOOD_D: [string, string] = ['#8e5f36', '#a8743f'];

// ───────────── 기부함(섬 개발 창 열기) ─────────────
/** 기부함 + 간판. (0,0,0) = 땅, 앞 = +z. 단계 수만큼 별 전구가 켜진다 */
export function addDevBox(b: Builder, color: string, stage: number) {
  // 받침 + 통통한 나무 상자
  b.add(rbox(1.3, 0.16, 1.0, 0.06), 'wood', WOOD_D, 0, 0.08, 0);
  b.add(rbox(1.05, 0.9, 0.78, 0.16, 4), 'wood', WOOD, 0, 0.62, 0);
  // 하트 투입구 띠
  b.add(rbox(1.08, 0.18, 0.8, 0.07, 3), 'matte', color, 0, 0.95, 0);
  b.add(rbox(0.5, 0.06, 0.06, 0.02, 2), 'matte', '#6a4a2a', 0, 1.08, 0.36);
  // 하트(앞면)
  const heart = new THREE.Shape();
  heart.moveTo(0, -0.12); heart.bezierCurveTo(-0.22, 0.02, -0.12, 0.17, 0, 0.07); heart.bezierCurveTo(0.12, 0.17, 0.22, 0.02, 0, -0.12);
  b.add(new THREE.ExtrudeGeometry(heart, { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 10 }), 'matte', '#ff8fae', 0, 0.62, 0.38, undefined, 1.2);
  // 지붕(둥근 박공)
  b.add(rbox(0.78, 0.1, 1.05, 0.05), 'matte', '#fff3dc', -0.33, 1.26, 0, [0, 0, 0.42]);
  b.add(rbox(0.78, 0.1, 1.05, 0.05), 'matte', '#fff3dc', 0.33, 1.26, 0, [0, 0, -0.42]);
  b.add(sph(0.09), 'matte', color, 0, 1.44, 0);
  // 단계 전구 5개(앞 띠 아래)
  for (let i = 0; i < 5; i++) {
    const on = i < stage;
    b.add(sph(0.055, 10, 8), on ? 'glow' : 'matte', on ? '#ffe58a' : '#d9cbb4', -0.36 + i * 0.18, 0.28, 0.4);
  }
  // 옆 간판 기둥
  b.add(cyl(0.05, 0.06, 1.9, 8), 'wood', WOOD_D, 0.95, 0.95, 0.1);
  b.add(rbox(1.2, 0.5, 0.08, 0.06), 'wood', WOOD, 0.95, 1.75, 0.16);
}
/** 기부함 간판 글씨(따로 붙는 판) */
export function devBoxLabel(name: string): THREE.Object3D {
  const m = labelMesh(`${name} 개발`, 1.08, 0.38, { fg: '#5a3a22' });
  m.position.set(0.95, 1.75, 0.21);
  return m;
}

/** 작은 비눗방울 정류장(집 앞 — 등대 정류장은 village 가 만든다): 둥근 발판 + 방울 고리 + 떠 있는 방울 */
export function addBubbleStop(b: Builder) {
  b.add(cyl(1.05, 1.15, 0.16, 28), 'matte', ['#cfeeff', '#ffffff'], 0, 0.08, 0);
  b.add(torus(0.98, 0.06, 8, 32), 'matte', '#8fd3ff', 0, 0.17, 0, [Math.PI / 2, 0, 0]);
  b.add(cyl(0.05, 0.06, 1.8, 8), 'metal', ['#d9dfe6', '#ffffff'], 0.95, 0.9, -0.2);
  b.add(torus(0.32, 0.05, 8, 24), 'matte', '#ff9fb8', 0.95, 2.05, -0.2, [0, Math.PI / 2, 0]);
  for (let i = 0; i < 4; i++) b.add(sph(0.12 + i * 0.05, 14, 10), 'glow', '#dff4ff', 0.6 - i * 0.35, 2.3 + i * 0.32, -0.2 + i * 0.1);
}

// ───────────── 섬 깃발 · 음악 상자(⑤ 보상) ─────────────
export function addIslandFlag(b: Builder, island: DevIsland) {
  const [a, c] = ISLAND_FLAG[island];
  b.add(cyl(0.06, 0.08, 4.2, 10), 'metal', ['#d9dfe6', '#ffffff'], 0, 2.1, 0);
  b.add(sph(0.13), 'glow', '#ffe58a', 0, 4.28, 0);
  // 물결 깃발: 띠 셋(위 색·흰·아래 색)
  for (let i = 0; i < 3; i++) {
    const col = i === 1 ? '#ffffff' : i === 0 ? a : c;
    for (let s = 0; s < 6; s++) b.add(rbox(0.26, 0.3, 0.05, 0.02, 2), 'matte', col, 0.18 + s * 0.24, 3.85 - i * 0.3, Math.sin(s * 0.9) * 0.08, [0, Math.cos(s * 0.9) * 0.25, 0]);
  }
  b.add(cyl(0.3, 0.38, 0.22, 14), 'matte', '#fff3dc', 0, 0.11, 0);
}
export function addMusicBox(b: Builder, color: string) {
  b.add(rbox(0.7, 0.42, 0.5, 0.1, 3), 'wood', WOOD, 0, 0.21, 0);
  b.add(rbox(0.74, 0.1, 0.54, 0.05, 3), 'matte', color, 0, 0.47, 0);
  b.add(cyl(0.035, 0.035, 0.22, 8), 'metal', '#ffd36b', 0.42, 0.26, 0, [0, 0, Math.PI / 2]);
  b.add(sph(0.06, 10, 8), 'metal', '#ffd36b', 0.55, 0.26, 0);
  // 위에 도는 별(따로 움직이지 않는 장식)
  b.add(cone(0.08, 0.16, 5), 'glow', '#fff2a8', 0, 0.62, 0);
  b.add(cone(0.08, 0.16, 5), 'glow', '#fff2a8', 0, 0.62, 0, [Math.PI, 0, 0]);
}

// ───────────── 다리 · 부두 ─────────────
/**
 * 지름길 다리(또는 부두) — 판자 + 난간 + 기둥 + 끝 경사로. ground(x,z) 로 기둥·경사로 끝을 땅에 맞춘다.
 * 돌려주는 충돌체: 판(상자 하나) + 난간 2 + 경사로 2.
 */
export interface SpanCol { hx: number; hy: number; hz: number; x: number; y: number; z: number; rotY: number; tiltX: number }
export function addSpan(b: Builder, s: Span, ground: (x: number, z: number) => number, accent: string): SpanCol[] {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const L = Math.hypot(dx, dz), rotY = Math.atan2(dx, dz);
  const cx = (s.ax + s.bx) / 2, cz = (s.az + s.bz) / 2;
  const pier = s.kind === 'pier';
  const W = pier ? 2.4 : 2.1;
  b.setBase(cx, s.y, cz, rotY);
  // 판자(0.5 m 간격, 살짝 엇갈린 색)
  const n = Math.max(2, Math.round(L / 0.52));
  for (let i = 0; i < n; i++) {
    const z = -L / 2 + (i + 0.5) * (L / n);
    b.add(rbox(W, 0.12, L / n - 0.05, 0.03, 2), 'wood', i % 2 ? ['#c48d57', '#dcae78'] : ['#b9834f', '#d4a06b'], 0, -0.06, z);
  }
  // 밑 들보 2
  for (const sx of [-1, 1]) b.add(rbox(0.16, 0.16, L, 0.04, 2), 'wood', WOOD_D, sx * (W / 2 - 0.25), -0.2, 0);
  // 기둥 + 난간(부두는 바다 끝만 난간 낮게)
  const step = 2.2;
  const posts = Math.max(2, Math.round(L / step) + 1);
  const c = Math.cos(rotY), si = Math.sin(rotY);
  for (let i = 0; i < posts; i++) {
    const z = -L / 2 + (i / (posts - 1)) * L;
    for (const sx of [-1, 1]) {
      const lx = sx * (W / 2 - 0.06);
      // 난간 기둥
      b.add(cyl(0.06, 0.07, 0.85, 8), 'wood', WOOD_D, lx, 0.42, z);
      b.add(sph(0.08, 10, 8), 'matte', i === 0 || i === posts - 1 ? accent : '#fff3dc', lx, 0.88, z);
      // 아래 받침 기둥(땅·바닥까지, 너무 깊으면 4 m 에서 끊는다)
      const wx = cx + lx * c + z * si, wz = cz - lx * si + z * c;
      const gy = ground(wx, wz);
      const drop = Math.min(6, s.y - gy);
      if (drop > 0.5) b.add(cyl(0.11, 0.13, drop, 8), 'wood', WOOD_D, lx, -drop / 2 - 0.1, z);
    }
  }
  // 난간 줄(밧줄 색)
  for (const sx of [-1, 1]) b.add(rbox(0.07, 0.07, L, 0.03, 2), 'wood', ['#e9d3a6', '#f5e6c4'], sx * (W / 2 - 0.06), 0.78, 0);
  // 끝 등불(양쪽 첫 기둥 위)
  b.add(sph(0.12, 12, 10), 'glow', '#ffe58a', W / 2 - 0.06, 1.05, -L / 2);
  b.add(sph(0.12, 12, 10), 'glow', '#ffe58a', -(W / 2 - 0.06), 1.05, L / 2);
  const cols: SpanCol[] = [
    { hx: W / 2, hy: 0.08, hz: L / 2 + 0.2, x: cx, y: s.y - 0.08, z: cz, rotY, tiltX: 0 },
  ];
  for (const sx of [-1, 1]) {
    const lx = sx * (W / 2 + 0.02);
    cols.push({ hx: 0.06, hy: 0.45, hz: L / 2, x: cx + lx * c, y: s.y + 0.45, z: cz - lx * si, rotY, tiltX: 0 });
  }
  // 끝 경사로(땅이 판보다 낮으면)
  for (const end of [-1, 1]) {
    if (pier && end === 1) continue;
    const ex = cx + (end * L / 2) * si, ez = cz + (end * L / 2) * c;
    const gy = ground(ex + end * si * 1.2, ez + end * c * 1.2);
    const drop = s.y - gy;
    if (drop < 0.12 || drop > 2.4) continue;
    const rl = Math.min(4.5, Math.max(1.2, drop / 0.32));
    const tilt = Math.atan2(drop, rl);
    const midZ = end * (L / 2 + rl / 2);
    b.add(rbox(W * 0.9, 0.1, Math.hypot(rl, drop), 0.03, 2), 'wood', ['#b9834f', '#d4a06b'], 0, -drop / 2 - 0.05, midZ, [end * tilt, 0, 0]);
    cols.push({ hx: W * 0.45, hy: 0.06, hz: Math.hypot(rl, drop) / 2, x: cx + midZ * si, y: s.y - drop / 2 - 0.05, z: cz + midZ * c, rotY, tiltX: end * tilt });
  }
  // 부두 끝: 계선주 + 작은 보트
  if (pier) {
    for (const sx of [-1, 1]) b.add(cyl(0.12, 0.15, 0.35, 10), 'metal', '#8a9aa8', sx * 0.7, 0.18, L / 2 - 0.4);
    b.add(rbox(1.1, 0.4, 2.6, 0.3, 3), 'matte', ['#ffffff', accent], W / 2 + 0.9, -s.y + 0.15, L / 2 - 2.2);
    b.add(rbox(0.9, 0.06, 0.4, 0.03, 2), 'wood', WOOD, W / 2 + 0.9, -s.y + 0.38, L / 2 - 2.2);
  }
  b.resetBase();
  return cols;
}

// ───────────── 마당 꾸미기 조각 ─────────────
const FLOWER = ['#ff9fb8', '#ffe58a', '#c9b8ff', '#ffffff', '#ffb36e', '#8fd3ff'];
/** 마당 조각 하나를 Builder 에 — (lx, lz) = 조각 가운데(마당 로컬은 setBase 가 맡는다), r = 0..3 */
export function addYardPiece(b: Builder, p: YardPiece, h: (lx: number, lz: number) => number, rnd: () => number) {
  const c = pieceCenter(p);
  const rot = p.r * (Math.PI / 2);
  const f = footprint(p.k, p.r);
  const W = f.w * YARD_CELL, D = f.d * YARD_CELL;
  const y = h(c.x, c.z);
  const at = (lx: number, ly: number, lz: number): [number, number, number] => {
    // 조각 로컬(+z 앞) → 마당 로컬
    const cc = Math.cos(rot), s = Math.sin(rot);
    return [c.x + lx * cc + lz * s, y + ly, c.z - lx * s + lz * cc];
  };
  const R = (ry = 0): [number, number, number] => [0, rot + ry, 0];
  const k = p.k;
  if (k === 'fence') {
    for (const sx of [-0.45, 0.45]) b.add(rbox(0.12, 0.62, 0.12, 0.04, 2), 'wood', WOOD, ...at(sx, 0.31, 0), R());
    for (const yy of [0.22, 0.46]) b.add(rbox(1.0, 0.08, 0.06, 0.03, 2), 'wood', ['#c8955f', '#e3b27c'], ...at(0, yy, 0), R());
    for (const sx of [-0.45, 0.45]) b.add(sph(0.075, 10, 8), 'matte', '#fff3dc', ...at(sx, 0.66, 0));
  } else if (k === 'flowerbed') {
    b.add(rbox(W, 0.16, D, 0.06, 2), 'wood', WOOD_D, ...at(0, 0.08, 0), R());
    b.add(rbox(W - 0.12, 0.08, D - 0.12, 0.04, 2), 'matte', '#8a6a4a', ...at(0, 0.17, 0), R());
    for (let i = 0; i < 9; i++) {
      const lx = ((i % 3) - 1) * 0.28 + (rnd() - 0.5) * 0.06, lz = (Math.floor(i / 3) - 1) * 0.28 + (rnd() - 0.5) * 0.06;
      const col = FLOWER[Math.floor(rnd() * FLOWER.length)];
      b.add(cyl(0.015, 0.02, 0.26, 5), 'leaf', '#6cc46a', ...at(lx, 0.32, lz));
      b.add(sph(0.08, 10, 8), 'matte', col, ...at(lx, 0.47, lz), undefined, [1, 0.7, 1]);
      b.add(sph(0.035, 8, 6), 'matte', '#ffe58a', ...at(lx, 0.51, lz));
    }
  } else if (k === 'path') {
    for (let i = 0; i < 4; i++) {
      const lx = ((i % 2) - 0.5) * 0.5 + (rnd() - 0.5) * 0.08, lz = (Math.floor(i / 2) - 0.5) * 0.5 + (rnd() - 0.5) * 0.08;
      b.add(cyl(0.2 + rnd() * 0.05, 0.22, 0.07, 12), 'matte', ['#cfc4b4', '#e8e0d2'], ...at(lx, 0.03, lz));
    }
  } else if (k === 'lamp') {
    b.add(cyl(0.12, 0.15, 0.1, 10), 'metal', '#7c8a96', ...at(0, 0.05, 0));
    b.add(cyl(0.04, 0.05, 1.5, 8), 'metal', '#7c8a96', ...at(0, 0.8, 0));
    b.add(sph(0.17, 14, 10), 'glow', '#ffe58a', ...at(0, 1.66, 0));
    b.add(cone(0.22, 0.16, 12), 'matte', '#ff9f8a', ...at(0, 1.85, 0));
  } else if (k === 'pond') {
    // 둥근 돌 테두리 + 물
    const rr = Math.min(W, D) / 2 - 0.12;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      b.add(sph(0.16 + rnd() * 0.05, 10, 8), 'matte', ['#bfb6a8', '#e0d8ca'], ...at(Math.cos(a) * rr, 0.06, Math.sin(a) * rr), undefined, [1, 0.6, 1]);
    }
    b.add(cyl(rr - 0.05, rr - 0.1, 0.06, 24), 'matte', '#5aa8b8', ...at(0, 0.02, 0));
    b.add(cyl(rr - 0.06, rr - 0.06, 0.02, 24), 'water', '#7fe0d6', ...at(0, 0.09, 0));
    // 연잎
    for (let i = 0; i < 3; i++) b.add(cyl(0.14, 0.14, 0.02, 12), 'leaf', '#8fd18a', ...at((rnd() - 0.5) * rr, 0.11, (rnd() - 0.5) * rr));
  } else if (k === 'dinofence') {
    const hw = W / 2 - 0.1, hd = D / 2 - 0.1;
    const side = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 0.75));
      const ry = Math.atan2(x1 - x0, z1 - z0);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        b.add(cap(0.08, 0.55), 'wood', WOOD, ...at(x, 0.36, z));
      }
      for (const yy of [0.3, 0.55]) b.add(rbox(0.06, 0.08, len, 0.03, 2), 'wood', ['#c8955f', '#e3b27c'], ...at((x0 + x1) / 2, yy, (z0 + z1) / 2), R(ry));
    };
    side(-hw, -hd, hw, -hd); side(hw, -hd, hw, hd); side(-hw, -hd, -hw, hd);
    // 앞쪽은 문 자리를 비운다
    side(-hw, hd, -0.5, hd); side(0.5, hd, hw, hd);
    // 풀밭 + 먹이통 + 뼈다귀 장난감
    b.add(rbox(W - 0.3, 0.04, D - 0.3, 0.02, 2), 'leaf', '#a8e08a', ...at(0, 0.02, 0), R());
    b.add(rbox(0.7, 0.25, 0.4, 0.08, 3), 'wood', WOOD_D, ...at(-hw + 0.6, 0.13, -hd + 0.5), R());
    b.add(rbox(0.6, 0.06, 0.3, 0.03, 2), 'leaf', '#6cc46a', ...at(-hw + 0.6, 0.27, -hd + 0.5), R());
    b.add(cap(0.05, 0.3), 'matte', '#fff3dc', ...at(hw - 0.7, 0.06, hd - 0.8), [0, 0, Math.PI / 2]);
    b.add(rbox(0.9, 0.3, 0.06, 0.04, 2), 'wood', WOOD, ...at(0, 0.95, hd), R());
  } else if (k === 'fireflyspot') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rnd();
      b.add(sph(0.22 + rnd() * 0.08, 12, 8), 'leaf', ['#5fae62', '#8fd18a'], ...at(Math.cos(a) * 0.32, 0.18, Math.sin(a) * 0.32), undefined, [1, 0.8, 1]);
    }
    b.add(cyl(0.04, 0.04, 0.6, 6), 'wood', WOOD_D, ...at(0, 0.3, 0));
    b.add(sph(0.1, 12, 8), 'glow', '#d9ff8a', ...at(0, 0.66, 0));
  } else if (k === 'furn') {
    addFurniture(b, p.item ?? '', at, R);
  }
}

/** 마당에 놓는 가구 바깥 모양(대표 모양 몇 가지) */
function addFurniture(b: Builder, id: string, at: (x: number, y: number, z: number) => [number, number, number], R: (ry?: number) => [number, number, number]) {
  const col = (id.includes('rainbow') ? '#ff9fc6' : id.includes('star') || id.includes('space') ? '#a99bff' : id.includes('coral') || id.includes('shell') ? '#ffb3a7'
    : id.includes('mush') ? '#ff9ccf' : id.includes('amber') ? '#ffc46b' : id.includes('cactus') ? '#8fd18a' : id.includes('cloud') ? '#e8f4ff' : '#ffd36b');
  if (id === 'f_bench') {
    b.add(rbox(1.0, 0.1, 0.38, 0.05, 2), 'wood', WOOD, ...at(0, 0.42, 0), R());
    b.add(rbox(1.0, 0.32, 0.08, 0.04, 2), 'wood', WOOD, ...at(0, 0.66, -0.17), R());
    for (const sx of [-0.4, 0.4]) b.add(cyl(0.07, 0.08, 0.4, 8), 'wood', WOOD_D, ...at(sx, 0.2, 0));
  } else if (id === 'f_pastelchair' || id === 'f_spacechair' || id === 'f_starthrone') {
    const big = id === 'f_starthrone' ? 1.25 : 1;
    b.add(rbox(0.55 * big, 0.18, 0.5 * big, 0.08, 3), 'matte', col, ...at(0, 0.36, 0), R());
    b.add(rbox(0.55 * big, 0.55 * big, 0.14, 0.07, 3), 'matte', col, ...at(0, 0.66, -0.2 * big), R());
    for (const sx of [-0.2, 0.2]) for (const sz of [-0.18, 0.18]) b.add(cyl(0.04, 0.05, 0.3, 8), 'wood', WOOD_D, ...at(sx * big, 0.14, sz * big));
    if (id === 'f_starthrone') b.add(cone(0.12, 0.22, 5), 'glow', '#fff2a8', ...at(0, 1.12, -0.25));
  } else if (id.endsWith('lamp')) {
    b.add(cyl(0.16, 0.2, 0.1, 12), 'matte', '#fff3dc', ...at(0, 0.05, 0));
    b.add(cyl(0.035, 0.035, 0.7, 8), 'metal', '#c9b8a0', ...at(0, 0.42, 0));
    b.add(sph(0.24, 16, 10), 'glow', col, ...at(0, 0.9, 0), undefined, [1, id === 'f_mushlamp' ? 0.6 : 1, 1]);
  } else if (id === 'f_pot' || id === 'f_cactuspot' || id === 'f_bootplanter') {
    b.add(cyl(0.2, 0.15, 0.3, 14), 'matte', id === 'f_bootplanter' ? '#7c8a96' : '#d0704e', ...at(0, 0.15, 0));
    if (id === 'f_cactuspot') { b.add(cap(0.11, 0.35), 'leaf', '#6cc46a', ...at(0, 0.55, 0)); b.add(cap(0.06, 0.12), 'leaf', '#6cc46a', ...at(0.14, 0.55, 0), [0, 0, -0.6]); b.add(sph(0.05), 'matte', '#ff9fb8', ...at(0, 0.82, 0)); }
    else { b.add(sph(0.26, 14, 10), 'leaf', '#6cc46a', ...at(0, 0.48, 0), undefined, [1, 0.85, 1]); b.add(sph(0.06), 'matte', '#ffe58a', ...at(0.1, 0.62, 0.12)); }
  } else if (id === 'f_fruitbasket') {
    b.add(cyl(0.26, 0.2, 0.22, 14), 'wood', WOOD, ...at(0, 0.11, 0));
    for (let i = 0; i < 5; i++) b.add(sph(0.08), 'matte', ['#ff6b6b', '#ffb347', '#ffe58a', '#ff9fb8', '#8fd18a'][i], ...at(Math.cos(i * 1.3) * 0.12, 0.26, Math.sin(i * 1.3) * 0.12));
  } else if (id === 'f_canrobot') {
    b.add(cyl(0.18, 0.18, 0.4, 14), 'metal', '#c9d3dc', ...at(0, 0.3, 0));
    b.add(rbox(0.3, 0.24, 0.26, 0.08, 3), 'metal', '#dfe6ec', ...at(0, 0.64, 0), R());
    b.add(sph(0.04), 'glow', '#8fd3ff', ...at(0, 0.85, 0));
  } else if (id === 'f_fos_trexmodel' || id === 'f_stego_plate') {
    b.add(rbox(0.6, 0.08, 0.4, 0.03, 2), 'wood', WOOD_D, ...at(0, 0.04, 0), R());
    b.add(sph(0.18, 14, 10), 'matte', '#f3e6cc', ...at(0, 0.32, 0), undefined, [1.3, 0.9, 0.8]);
    b.add(sph(0.12, 12, 8), 'matte', '#f3e6cc', ...at(0.22, 0.48, 0));
    if (id === 'f_stego_plate') for (let i = 0; i < 4; i++) b.add(cone(0.07, 0.16, 4), 'matte', '#ff9fb8', ...at(-0.15 + i * 0.1, 0.5, 0));
  } else if (id === 'f_shellbed' || id === 'f_cloudrug') {
    b.add(rbox(0.9, 0.12, 0.9, 0.06, 3), 'matte', col, ...at(0, 0.06, 0), R());
    if (id === 'f_shellbed') b.add(sph(0.45, 16, 8, ), 'matte', '#ffd9cf', ...at(0, 0.12, -0.3), undefined, [1, 0.6, 0.4]);
  } else {
    // 음악 상자·시계 등: 작은 받침 위 상자
    b.add(rbox(0.5, 0.36, 0.4, 0.08, 3), 'wood', WOOD, ...at(0, 0.18, 0), R());
    b.add(rbox(0.52, 0.08, 0.42, 0.04, 2), 'matte', col, ...at(0, 0.4, 0), R());
  }
}

/** 마당 팻말(마당 가운데 앞 — 'E 마당 꾸미기') */
export function addYardSign(b: Builder) {
  b.add(cyl(0.05, 0.06, 1.2, 8), 'wood', WOOD_D, 0, 0.6, 0);
  b.add(rbox(0.9, 0.42, 0.07, 0.06, 2), 'wood', WOOD, 0, 1.15, 0.03);
  for (let i = 0; i < 3; i++) b.add(sph(0.07, 10, 8), 'matte', FLOWER[i], -0.3 + i * 0.3, 0.12, 0.12);
}
export function yardSignLabel(): THREE.Object3D {
  const m = labelMesh('우리 마당', 0.8, 0.32, { fg: '#5a3a22' });
  m.position.set(0, 1.15, 0.075);
  return m;
}

// ───────────── 움직이는 것 ─────────────
/** 연못 물고기(작은 통통 물고기 — 같은 지오메트리를 공유) */
let fishGeo: THREE.BufferGeometry | null = null;
const fishMats = new Map<string, THREE.MeshStandardMaterial>();
export function miniFish(color: string): THREE.Mesh {
  if (!fishGeo) {
    const body = new THREE.SphereGeometry(0.09, 12, 8); body.scale(0.6, 0.7, 1.3);
    const tail = new THREE.ConeGeometry(0.06, 0.1, 6); tail.rotateX(-Math.PI / 2); tail.translate(0, 0, -0.15);
    const b = new Builder(); b.add(body, 'matte', '#ffffff'); b.add(tail, 'matte', '#ffffff');
    const g = b.bake();
    fishGeo = (g.children[0] as THREE.Mesh).geometry;
    fishGeo.userData.shared = true;
  }
  let m = fishMats.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.5 }); m.userData.shared = true; fishMats.set(color, m); }
  const mesh = new THREE.Mesh(fishGeo, m);
  mesh.castShadow = false;
  return mesh;
}

/** 아기 공룡(마당 공룡 울타리) — 둥근 몸 + 눈·볼터치(art) */
export function babyDino(color: string): THREE.Group {
  const g = new THREE.Group();
  g.name = 'islanddev-babydino';
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const belly = new THREE.MeshStandardMaterial({ color: '#fff3dc', roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), mat); body.scale.set(1, 0.9, 1.15); body.position.y = 0.36; body.castShadow = true;
  const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), belly); tummy.scale.set(0.9, 0.8, 0.5); tummy.position.set(0, 0.32, 0.18);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), mat); head.position.set(0, 0.72, 0.22); head.castShadow = true;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 10), mat); tail.rotation.x = -Math.PI / 2 - 0.4; tail.position.set(0, 0.32, -0.42);
  g.add(body, tummy, head, tail);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.12, 4, 8), mat); leg.position.set(sx * 0.16, 0.1, 0.05); g.add(leg);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), belly); spike.position.set(0, 0.62 - (sx + 1) * 0.12, -0.12 - (sx + 1) * 0.08); g.add(spike);
  }
  addEyes(head, { size: 0.085, gap: 0.15, head: { r: 0.24 } });
  const sh = blobShadow(0.45); sh.position.y = 0.02; g.add(sh);
  return g;
}

/** 반딧불 점(밤에만) — 공유 점 재질 */
let ffMat: THREE.PointsMaterial | null = null;
export function fireflyPoints(n: number, rnd: () => number, spread: number, height = 1.2): THREE.Points {
  ffMat ??= Object.assign(new THREE.PointsMaterial({ color: '#e8ff8a', size: 0.16, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }), {});
  ffMat.userData.shared = true;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rnd() - 0.5) * spread; pos[i * 3 + 1] = 0.3 + rnd() * height; pos[i * 3 + 2] = (rnd() - 0.5) * spread;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, ffMat);
  p.userData.base = pos.slice();
  p.frustumCulled = false;
  return p;
}
/** 반딧불 흔들기(t 기준) */
export function animateFireflies(p: THREE.Points, t: number, on: number) {
  const base = p.userData.base as Float32Array;
  const a = p.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) {
    const ph = i * 1.7;
    a.setXYZ(i, base[i * 3] + Math.sin(t * 0.7 + ph) * 0.25, base[i * 3 + 1] + Math.sin(t * 1.1 + ph * 0.6) * 0.18, base[i * 3 + 2] + Math.cos(t * 0.6 + ph) * 0.25);
  }
  a.needsUpdate = true;
  p.visible = on > 0.05;
  (p.material as THREE.PointsMaterial).opacity = 0.35 + 0.6 * on * (0.6 + 0.4 * Math.sin(t * 3));
}

// ───────────── 비눗방울 · 리프트 의자 ─────────────
let bubbleMat: THREE.MeshPhysicalMaterial | null = null;
let shineMat: THREE.MeshBasicMaterial | null = null;
let bubbleGeo: THREE.SphereGeometry | null = null;
let shineGeo: THREE.SphereGeometry | null = null;
/** 플레이어를 감싸는 큰 비눗방울(무지갯빛) */
export function bigBubble(): THREE.Group {
  bubbleMat ??= new THREE.MeshPhysicalMaterial({
    color: '#dff4ff', roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.32,
    iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 480], depthWrite: false, side: THREE.DoubleSide,
  });
  const g = new THREE.Group();
  g.name = 'islanddev-bubble';
  shineMat ??= new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
  bubbleGeo ??= new THREE.SphereGeometry(1.25, 32, 22);
  shineGeo ??= new THREE.SphereGeometry(0.16, 12, 8);
  bubbleGeo.userData.shared = true;
  shineGeo.userData.shared = true;
  const s = new THREE.Mesh(bubbleGeo, bubbleMat);
  s.position.y = 0.95;
  s.renderOrder = 5;
  const shine = new THREE.Mesh(shineGeo, shineMat);
  shine.position.set(-0.55, 1.6, 0.75);
  shine.scale.set(1, 0.55, 0.4);
  g.add(s, shine);
  const seat = new THREE.Object3D();
  seat.name = 'seat';
  seat.position.y = 0.1;
  g.add(seat);
  return g;
}
/** 리프트 의자(빨간 2인용 + 손잡이) */
export function liftChair(): THREE.Group {
  const b = new Builder();
  b.add(cyl(0.035, 0.035, 2.0, 8), 'metal', '#8a9aa8', 0, 1.0, 0);
  b.add(rbox(1.1, 0.12, 0.5, 0.05, 2), 'matte', '#ff7a8a', 0, 0.02, 0.05);
  b.add(rbox(1.1, 0.5, 0.1, 0.05, 2), 'matte', '#ff7a8a', 0, 0.28, -0.2);
  b.add(torus(0.09, 0.03, 8, 16), 'metal', '#8a9aa8', 0, 2.02, 0, [Math.PI / 2, 0, 0]);
  b.add(rbox(1.12, 0.04, 0.04, 0.02, 2), 'metal', '#8a9aa8', 0, 0.42, 0.32);
  const g = b.bake('islanddev-liftchair');
  g.position.y = -2.0;
  const root = new THREE.Group();
  root.add(g);
  const seat = new THREE.Object3D();
  seat.name = 'seat';
  seat.position.y = -2.05;
  root.add(seat);
  return root;
}
/** 퐁! 터지는 작은 방울 조각 */
export function popBurst(rnd: () => number): THREE.Points {
  const n = 40, pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, e = (rnd() - 0.3) * Math.PI * 0.8, sp = 2 + rnd() * 3;
    vel[i * 3] = Math.cos(a) * Math.cos(e) * sp; vel[i * 3 + 1] = Math.sin(e) * sp + 1.5; vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
    pos[i * 3 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfefff', size: 0.22, transparent: true, opacity: 1, depthWrite: false }));
  p.userData.vel = vel;
  p.frustumCulled = false;
  return p;
}
export function stepBurst(p: THREE.Points, dt: number, life: number) {
  const a = p.geometry.attributes.position as THREE.BufferAttribute, v = p.userData.vel as Float32Array;
  for (let i = 0; i < a.count; i++) {
    v[i * 3 + 1] -= 4 * dt;
    a.setXYZ(i, a.getX(i) + v[i * 3] * dt, a.getY(i) + v[i * 3 + 1] * dt, a.getZ(i) + v[i * 3 + 2] * dt);
  }
  a.needsUpdate = true;
  (p.material as THREE.PointsMaterial).opacity = Math.max(0, life);
}

