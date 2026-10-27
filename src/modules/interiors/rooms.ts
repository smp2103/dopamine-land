// 방 껍데기: 벽지·바닥 무늬(캔버스) · 집 방(뒤·옆 벽 + 낮은 앞 턱 + 문틀 · 창문 · 벽 등 · 붙박이 보관함·진열장) · 박물관 동 6칸(줄지어).
// 카메라가 앞 위에서 내려다보는 인형의 집 구도라 천장·앞 벽은 없다(앞은 낮은 턱 + 보이지 않는 충돌 벽).
import * as THREE from 'three';
import { Builder, G, makeCanvas } from './kit';
import type { Swatch, WingInfo } from './logic';
import type { RoomGrid } from './placement';

export const WALL_H = 2.6;
export const LEDGE_H = 0.32;

// ───────────── 무늬 텍스처 ─────────────
const texCache = new Map<string, THREE.Texture | null>();
/** 견본 → 1 m 한 칸 무늬(반복). 캔버스가 없으면 null(단색으로) */
export function swatchTexture(s: Swatch, kind: 'wall' | 'floor'): THREE.Texture | null {
  const k = `${kind}:${s.id}`;
  if (texCache.has(k)) return texCache.get(k)!;
  const N = 256;
  const c = makeCanvas(N, N);
  if (!c) { texCache.set(k, null); return null; }
  const g = c.getContext('2d')!;
  g.fillStyle = s.a; g.fillRect(0, 0, N, N);
  g.fillStyle = s.b; g.strokeStyle = s.b;
  const circle = (x: number, y: number, r: number) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  switch (s.pattern) {
    case 'stripe': for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 8, 0, 28, N); g.fillStyle = '#ffffff55'; for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 44, 0, 4, N); break;
    case 'dots': for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) circle(x * 64 + 32 + (y % 2) * 32, y * 64 + 32, 11); break;
    case 'check': g.globalAlpha = 0.7; for (let i = 0; i < 4; i++) { g.fillRect(i * 64, 0, 32, N); g.fillRect(0, i * 64, N, 32); } g.globalAlpha = 1; break;
    case 'cloud': for (const [x, y] of [[60, 70], [190, 170], [200, 40], [80, 210]]) { circle(x, y, 22); circle(x + 22, y - 8, 26); circle(x + 46, y, 20); g.fillRect(x - 4, y, 54, 18); } break;
    case 'wave': g.lineWidth = 9; g.lineCap = 'round'; for (let row = 0; row < 4; row++) { g.beginPath(); for (let x = 0; x <= N; x += 4) { const y = row * 64 + 32 + Math.sin((x / N) * Math.PI * 4) * 10; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); } break;
    case 'leaf': for (const [x, y, r] of [[50, 60, 0.6], [170, 40, -0.4], [120, 150, 0.9], [220, 200, -0.8], [40, 210, 0.2]]) { g.save(); g.translate(x, y); g.rotate(r); g.beginPath(); g.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2); g.fill(); g.restore(); } break;
    case 'brick': for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) { g.fillRect(x * 64 + (y % 2) * 32 + 3, y * 32 + 3, 58, 26); } g.fillStyle = s.a; g.globalAlpha = 0.45; for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) g.fillRect(x * 64 + (y % 2) * 32 + 8, y * 32 + 7, 30, 8); g.globalAlpha = 1; break;
    case 'stars': { const st = (x: number, y: number, r: number) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }; for (const [x, y, r] of [[40, 50, 14], [160, 30, 9], [210, 130, 16], [90, 170, 10], [30, 230, 8], [180, 220, 12], [120, 90, 6]]) st(x, y, r); break; }
    case 'plank': for (let i = 0; i < 4; i++) { g.fillRect(0, i * 64 + 61, N, 3); g.fillRect(((i * 97) % 200) + 20, i * 64, 3, 64); } g.globalAlpha = 0.18; for (let i = 0; i < 16; i++) g.fillRect(0, i * 16 + 6, N, 1); g.globalAlpha = 1; break;
    case 'tile': for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * 64, y * 64, 64, 64); g.fillStyle = '#ffffff88'; for (let i = 0; i < 4; i++) { g.fillRect(i * 64, 0, 2, N); g.fillRect(0, i * 64, N, 2); } break;
    case 'grass': g.lineWidth = 3; g.lineCap = 'round'; for (let i = 0; i < 60; i++) { const x = (i * 53) % N, y = (i * 97) % N; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y - 10); g.stroke(); } g.fillStyle = '#ffffffaa'; for (const [x, y] of [[60, 80], [190, 200]]) circle(x, y, 5); break;
    case 'sand': g.globalAlpha = 0.6; for (let i = 0; i < 90; i++) circle((i * 71) % N, (i * 43 + (i % 7) * 13) % N, 2 + (i % 3)); g.globalAlpha = 1; g.fillStyle = '#ffd0de'; circle(70, 190, 7); break;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.shared = true;
  texCache.set(k, t);
  return t;
}

/** 견본 재질에 무늬 입히기(캔버스가 없으면 바탕색) */
export function applySwatch(m: THREE.MeshStandardMaterial, s: Swatch, kind: 'wall' | 'floor') {
  const t = swatchTexture(s, kind);
  m.map = t;
  m.color.set(t ? '#ffffff' : s.a);
  m.needsUpdate = true;
}

/** uv 를 m 단위로(1 m = 무늬 한 칸) */
function meterUV(g: THREE.BufferGeometry, sx: number, sy: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
  return g;
}

// ───────────── 집 방 ─────────────
export interface HouseShell {
  group: THREE.Group;
  wallMat: THREE.MeshStandardMaterial;
  floorMat: THREE.MeshStandardMaterial;
  windowMat: THREE.MeshBasicMaterial;
  /** 방 좌표(가운데 원점) */
  W: number;
  D: number;
  chest: { x: number; z: number };
  display: { x: number; z: number; slots: Array<[number, number, number]> };
  door: { x: number; z: number };
}

export function buildHouseShell(room: RoomGrid, wall: Swatch, floor: Swatch): HouseShell {
  const W = room.w * 0.5, D = room.d * 0.5, H = WALL_H;
  const group = new THREE.Group();
  group.name = 'interiors-house-shell';
  const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.FrontSide });
  const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  applySwatch(wallMat, wall, 'wall');
  applySwatch(floorMat, floor, 'floor');
  // 바닥
  const fl = new THREE.Mesh(meterUV(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), W, D), floorMat);
  fl.receiveShadow = true;
  fl.name = 'floor';
  group.add(fl);
  // 벽지 면(안쪽): 뒤·왼·오른
  const back = new THREE.Mesh(meterUV(new THREE.PlaneGeometry(W, H), W, H), wallMat);
  back.position.set(0, H / 2, -D / 2);
  const left = new THREE.Mesh(meterUV(new THREE.PlaneGeometry(D, H), D, H), wallMat);
  left.position.set(-W / 2, H / 2, 0); left.rotation.y = Math.PI / 2;
  const right = new THREE.Mesh(meterUV(new THREE.PlaneGeometry(D, H), D, H), wallMat);
  right.position.set(W / 2, H / 2, 0); right.rotation.y = -Math.PI / 2;
  for (const m of [back, left, right]) { m.receiveShadow = true; group.add(m); }

  // 나무 테두리·벽 두께·턱·문틀·창·벽 등(굽기)
  const b = new Builder();
  const T = 0.22, wood = '#c98f5a', woodL = '#e8bb84', cream = '#fff1dc';
  b.add(G.box(0.05), 'matte', '#b07a4c', [0, -0.14, 0], [W + T * 2, 0.24, D + T * 2]);
  b.add(G.box(0.08), 'matte', cream, [0, H / 2, -D / 2 - T / 2], [W + T * 2, H + 0.06, T]);
  for (const sx of [-1, 1]) b.add(G.box(0.08), 'matte', cream, [sx * (W / 2 + T / 2), H / 2, 0], [T, H + 0.06, D + T]);
  // 굽도리·천장 몰딩
  b.add(G.box(0.03), 'matte', wood, [0, 0.07, -D / 2 + 0.02], [W, 0.14, 0.05]);
  for (const sx of [-1, 1]) b.add(G.box(0.03), 'matte', wood, [sx * (W / 2 - 0.02), 0.07, 0], [0.05, 0.14, D]);
  b.add(G.box(0.05), 'matte', woodL, [0, H + 0.05, -D / 2 - 0.02], [W + T * 2 + 0.06, 0.14, T + 0.12]);
  for (const sx of [-1, 1]) b.add(G.box(0.05), 'matte', woodL, [sx * (W / 2 + T / 2), H + 0.05, 0], [T + 0.12, 0.14, D + T * 2]);
  // 앞 턱(문 자리 2 m 비움)
  const gap = 2.0, side = (W - gap) / 2;
  for (const sx of [-1, 1]) {
    b.add(G.box(0.06), 'matte', cream, [sx * (gap / 2 + side / 2), LEDGE_H / 2, D / 2 + T / 2], [side + 0.02, LEDGE_H, T]);
    b.add(G.box(0.04), 'matte', woodL, [sx * (gap / 2 + side / 2), LEDGE_H + 0.03, D / 2 + T / 2], [side + 0.06, 0.06, T + 0.06]);
    // 앞 모서리 기둥
    b.add(G.box(0.06), 'matte', cream, [sx * (W / 2 + T / 2), LEDGE_H / 2, D / 2 + T / 2], [T, LEDGE_H, T]);
  }
  // 문틀(아치) + 발판
  for (const sx of [-1, 1]) b.add(G.box(0.06), 'matte', wood, [sx * (gap / 2 + 0.08), 1.05, D / 2 + T / 2], [0.16, 2.1, T + 0.04]);
  b.add(G.torus(0.09, Math.PI), 'matte', wood, [0, 2.1, D / 2 + T / 2], [gap + 0.16, 0.9, 1.6]);
  b.add(G.heart(), 'gloss', '#ff9fb8', [0, 2.42, D / 2 + T / 2 + 0.08], 0.22);
  b.add(G.box(0.1), 'cloth', '#ffc59a', [0, 0.012, D / 2 - 0.55], [1.5, 0.025, 0.8]);
  b.add(G.box(0.1), 'cloth', '#fff1cf', [0, 0.026, D / 2 - 0.55], [1.2, 0.01, 0.5]);
  // 창문(뒤 벽 가운데 · 넓으면 둘)
  const winXs = W >= 9 ? [-W * 0.22, W * 0.22] : [0];
  for (const wx of winXs) {
    b.add(G.box(0.06), 'matte', '#ffffff', [wx, 1.55, -D / 2 + 0.03], [1.3, 1.05, 0.08]);
    b.add(G.box(0.03), 'matte', wood, [wx, 1.55, -D / 2 + 0.08], [0.06, 0.95, 0.04]);
    b.add(G.box(0.03), 'matte', wood, [wx, 1.55, -D / 2 + 0.08], [1.2, 0.06, 0.04]);
    b.add(G.box(0.05), 'matte', woodL, [wx, 0.98, -D / 2 + 0.12], [1.45, 0.08, 0.2]);
    // 커튼
    for (const sx of [-1, 1]) b.add(G.capsule(), 'cloth', '#ffd0de', [wx + sx * 0.72, 1.55, -D / 2 + 0.1], [0.2, 0.9, 0.1]);
    b.add(G.sphere(), 'matte', '#ff9fb8', [wx - 0.25, 1.02, -D / 2 + 0.2], [0.14, 0.12, 0.12]);
    b.add(G.cyl(), 'matte', '#5cc16a', [wx + 0.3, 1.1, -D / 2 + 0.2], [0.12, 0.18, 0.12]);
  }
  // 벽 등 두 개
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.9);
    b.add(G.box(0.1), 'metal', '#ffcf4a', [x, 1.9, -D / 2 + 0.05], [0.12, 0.2, 0.06]);
    b.add(G.hemi(), 'glow', '#fff3c4', [x, 2.02, -D / 2 + 0.16], [0.26, 0.2, 0.2], [Math.PI, 0, 0]);
  }
  // 벽시계
  b.add(G.cyl(), 'gloss', '#ff9fb8', [-W / 2 + 0.06, 1.9, -D * 0.1], [0.5, 0.05, 0.5], [0, 0, Math.PI / 2]);
  b.add(G.cyl(), 'matte', '#fffaf2', [-W / 2 + 0.09, 1.9, -D * 0.1], [0.42, 0.02, 0.42], [0, 0, Math.PI / 2]);

  // 붙박이 보관함(뒤 오른쪽 구석, 3×2 칸)
  const chest = { x: W / 2 - 0.75, z: -D / 2 + 0.5 };
  b.push([chest.x, 0, chest.z]);
  b.add(G.box(0.12), 'matte', '#d9a06b', [0, 0.3, 0], [1.3, 0.6, 0.78]);
  b.add(G.box(0.12), 'gloss', '#ffb37a', [0, 0.66, 0], [1.36, 0.18, 0.84]);
  b.add(G.box(0.05), 'metal', '#ffcf4a', [0, 0.52, 0.4], [0.2, 0.18, 0.04]);
  for (const sx of [-1, 1]) b.add(G.box(0.03), 'metal', '#ffcf4a', [sx * 0.52, 0.34, 0.4], [0.06, 0.5, 0.02]);
  b.add(G.heart(), 'gloss', '#ff9fb8', [0, 0.32, 0.41], 0.18);
  b.pop();
  // 붙박이 진열장(뒤 왼쪽, 4×2 칸) — 유리 칸 3단 × 2
  const display = { x: -W / 2 + 1.0, z: -D / 2 + 0.45, slots: [] as Array<[number, number, number]> };
  b.push([display.x, 0, display.z]);
  b.add(G.box(0.06), 'matte', '#e8bb84', [0, 0.95, -0.02], [1.9, 1.9, 0.62]);
  b.add(G.box(0.04), 'matte', '#fff1dc', [0, 0.95, 0.02], [1.76, 1.76, 0.5]);
  for (const y of [0.12, 0.72, 1.32]) b.add(G.box(0.02), 'gloss', '#ffffff', [0, y, 0.04], [1.76, 0.04, 0.5]);
  b.add(G.box(0.02), 'matte', '#c98f5a', [0, 0.95, 0.06], [0.05, 1.76, 0.46]);
  b.add(G.box(0.02), 'glass', '#d4f2ff', [0, 0.95, 0.3], [1.8, 1.8, 0.03]);
  b.add(G.star(), 'metal', '#ffcf4a', [0, 1.98, 0.1], [0.24, 0.24, 0.12]);
  for (const y of [0.14, 0.74, 1.34]) for (const x of [-0.45, 0.45]) display.slots.push([display.x + x, y + 0.02, display.z + 0.08]);
  b.pop();
  group.add(b.bake('interiors-house-trim'));

  // 창밖(낮 하늘 / 밤 별) — 따로 색을 바꾼다
  const windowMat = new THREE.MeshBasicMaterial({ color: '#bfe6ff', toneMapped: false });
  for (const wx of winXs) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 0.9), windowMat);
    pane.position.set(wx, 1.55, -D / 2 + 0.075);
    group.add(pane);
  }
  return { group, wallMat, floorMat, windowMat, W, D, chest, display, door: { x: 0, z: D / 2 - 0.55 } };
}

// ───────────── 박물관 ─────────────
export const MUSEUM_RW = 10;
export const MUSEUM_D = 10;
export const MUSEUM_H = 3.4;
/** 로비 안내 데스크 z(관장은 그 뒤) */
export const LOBBY_DESK_Z = -1.9;
export interface MuseumShell {
  group: THREE.Group;
  /** 방 이름 → 가운데 x(방 좌표) */
  centers: Record<string, number>;
  W: number;
  D: number;
  /** 동 이름판 메시(글자 바꾸기용) */
  signs: Map<string, THREE.Mesh>;
}

/** 박물관 껍데기: rooms 순서대로 서 → 동. 방마다 바닥·벽 색, 칸막이엔 3 m 통로 */
export function buildMuseumShell(rooms: ReadonlyArray<string>, info: (id: string) => WingInfo | null): MuseumShell {
  const n = rooms.length, RW = MUSEUM_RW, D = MUSEUM_D, H = MUSEUM_H, W = n * RW;
  const lobbyI = Math.max(0, rooms.indexOf('lobby'));
  const centers: Record<string, number> = {};
  rooms.forEach((r, i) => { centers[r] = (i - lobbyI) * RW; });
  const x0 = -lobbyI * RW - RW / 2;
  const group = new THREE.Group();
  group.name = 'interiors-museum-shell';
  const b = new Builder();
  const T = 0.3;
  // 바닥(방마다 색) + 체크 줄
  rooms.forEach((r, i) => {
    const cx = x0 + i * RW + RW / 2;
    const w = info(r);
    const fc = w?.floor ?? '#f6ecd8', wc = w?.wall ?? '#fff6e4';
    b.add(G.boxLo(0.02), 'matte', fc, [cx, -0.05, 0], [RW, 0.1, D]);
    for (let k = -2; k <= 2; k++) b.add(G.boxLo(0.02), 'gloss', k % 2 ? '#ffffff' : fc, [cx + k * 1.6, 0.003, 0], [0.8, 0.006, D * 0.96]);
    b.add(G.boxLo(0.05), 'matte', wc, [cx, H / 2, -D / 2 - T / 2], [RW, H, T]);
    b.add(G.boxLo(0.03), 'matte', w?.accent ?? '#e2b97a', [cx, 0.1, -D / 2 + 0.02], [RW, 0.2, 0.05]);
    b.add(G.boxLo(0.03), 'matte', w?.accent ?? '#e2b97a', [cx, H - 0.1, -D / 2 + 0.02], [RW, 0.12, 0.05]);
  });
  b.add(G.boxLo(0.05), 'matte', '#c9b8a0', [x0 + W / 2, -0.16, 0], [W + T * 2, 0.12, D + T * 2]);
  // 끝 벽 + 칸막이(통로 3 m, 위는 아치)
  for (const sx of [0, n]) b.add(G.boxLo(0.05), 'matte', '#fff6e4', [x0 + sx * RW, H / 2, 0], [T, H, D + T]);
  for (let i = 1; i < n; i++) {
    const x = x0 + i * RW, gap = 3.0, seg = (D - gap) / 2;
    for (const sz of [-1, 1]) b.add(G.boxLo(0.05), 'matte', '#fff6e4', [x, H / 2, sz * (gap / 2 + seg / 2)], [T, H, seg]);
    b.add(G.boxLo(0.05), 'matte', '#fff6e4', [x, H - 0.35, 0], [T, 0.7, gap]);
    b.add(G.torus(0.1, Math.PI), 'gloss', '#e2b97a', [x, H - 0.7, 0], [gap, 1.0, 1.2], [0, Math.PI / 2, 0]);
    for (const sz of [-1, 1]) b.add(G.cyl(), 'gloss', '#efe2c8', [x, (H - 0.7) / 2, sz * (gap / 2 + 0.18)], [0.36, H - 0.7, 0.36]);
  }
  // 앞 턱(로비 가운데 문 4 m 비움)
  const lx = centers.lobby ?? 0;
  for (let i = 0; i < n; i++) {
    const cx = x0 + i * RW + RW / 2;
    if (rooms[i] === 'lobby') {
      for (const sx of [-1, 1]) b.add(G.boxLo(0.06), 'matte', '#efe2c8', [cx + sx * (2 + (RW / 2 - 2) / 2), LEDGE_H / 2, D / 2 + T / 2], [RW / 2 - 2, LEDGE_H, T]);
    } else b.add(G.boxLo(0.06), 'matte', '#efe2c8', [cx, LEDGE_H / 2, D / 2 + T / 2], [RW, LEDGE_H, T]);
  }
  // 로비: 돌기둥 문 + 붉은 융단 + 안내 데스크 자리(관장은 museum.ts 가 세운다)
  for (const sx of [-1, 1]) {
    b.add(G.cyl(), 'gloss', '#efe2c8', [lx + sx * 2.2, 1.4, D / 2 + T / 2], [0.5, 2.8, 0.5]);
    b.add(G.boxLo(0.08), 'gloss', '#e8d6b6', [lx + sx * 2.2, 2.86, D / 2 + T / 2], [0.7, 0.16, 0.7]);
  }
  b.add(G.boxLo(0.05), 'cloth', '#ff8a7a', [lx, 0.012, 1.6], [2.2, 0.024, D - 3.2]);
  b.add(G.boxLo(0.05), 'cloth', '#ffd84a', [lx, 0.02, 1.6], [1.9, 0.01, D - 3.6]);
  b.add(G.boxLo(0.12), 'gloss', '#c9a6ff', [lx, 0.3, LOBBY_DESK_Z], [3.0, 0.6, 0.9]);
  b.add(G.boxLo(0.08), 'gloss', '#fff6e4', [lx, 0.64, LOBBY_DESK_Z], [3.2, 0.1, 1.05]);
  b.add(G.sphereLo(), 'gloss', '#ff9fb8', [lx - 1.1, 0.78, LOBBY_DESK_Z + 0.1], [0.22, 0.18, 0.22]);
  b.add(G.boxLo(0.05), 'matte', '#fffaf2', [lx + 0.9, 0.71, LOBBY_DESK_Z + 0.1], [0.5, 0.04, 0.36], [0, 0.3, 0]);
  b.add(G.star(), 'metal', '#ffcf4a', [lx, 0.33, LOBBY_DESK_Z + 0.48], [0.34, 0.34, 0.12]);
  for (const sx of [-1, 1]) {
    // 화분 + 벤치
    b.add(G.taper(1.3), 'gloss', '#8fd3f4', [lx + sx * 3.8, 0.25, -D / 2 + 0.8], [0.6, 0.5, 0.6]);
    b.add(G.sphereLo(), 'matte', '#5cc16a', [lx + sx * 3.8, 0.85, -D / 2 + 0.8], 0.9);
    b.add(G.boxLo(0.1), 'matte', '#d9a06b', [lx + sx * 3.4, 0.4, 2.6], [1.6, 0.12, 0.5]);
    for (const k of [-0.6, 0.6]) b.add(G.cyl(), 'matte', '#b97f4e', [lx + sx * 3.4 + k, 0.18, 2.6], [0.14, 0.36, 0.14]);
  }
  group.add(b.bake('interiors-museum-shell'));
  // 동 이름판(뒤 벽 위) — 글자는 museum.ts 가 바꾼다
  const signs = new Map<string, THREE.Mesh>();
  for (const r of rooms) {
    const m = new THREE.Mesh(G.plane(), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, toneMapped: false }));
    m.scale.set(r === 'lobby' ? 4.2 : 3.6, r === 'lobby' ? 1.3 : 1.12, 1);
    m.position.set(centers[r], H - 0.75, -D / 2 + 0.06);
    m.name = `sign:${r}`;
    signs.set(r, m);
    group.add(m);
  }
  return { group, centers, W, D, signs };
}
