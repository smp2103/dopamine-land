// hidden 실내 모델(먼 지구 자리, ext.interiors 에 등록): 해적 동굴 · 협곡 지하수 동굴 · 운석 속 무중력 방 · 모래 피라미드 퍼즐 방 3 + 보물방.
// 모두 지붕 없는 둥근 방(아늑 카메라가 위에서 본다). 앞(+z, 남쪽) 벽은 낮게 — 카메라를 가리지 않게.
// 좌표는 모두 실내 원점 기준 로컬(m). 바닥 y = 0.
import * as THREE from 'three';
import { addEyes, addBlush, blobShadow } from '../../core/art';
import { Bake, sph, ell, cyl, cap, rbox, tor, cone, lump, vgrad, stripes, matBase, matShiny, matGlow, matSoft, mesh, type Geo } from './kit';
import { buildChest, buildScarab, stardustOrbGeo, type ChestModel, type ColBox } from './models';
import { ROOMS, CELL, cellToLocal, roomCenterZ, localToCell, type Room } from './puzzle';

const TAU = Math.PI * 2;

/** 둥근 방 공통: 바닥 원판 + 바위 고리 벽 + 충돌 고리 */
interface RoundOpts { R: number; floor: string; floorEdge: string; rock: [string, string]; wallH: number; rnd: () => number; door?: number }
function roundRoom(o: RoundOpts): { floor: Geo; walls: Geo; cols: ColBox[] } {
  const fg = new Bake().add(new THREE.CircleGeometry(o.R + 1.2, 64, 0, TAU), (p, out) => {
    const d = Math.hypot(p.x, p.y) / (o.R + 1.2);
    out.set(o.floor).lerp(new THREE.Color(o.floorEdge), Math.min(1, d * d));
  }, { r: [-Math.PI / 2, 0, 0] });
  const wb = new Bake();
  const n = Math.round(o.R * 2.6);
  const doorHalf = o.door ?? 0.32;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    // 남쪽(+z = a 가 π/2 근처)은 문 자리 — 비우고 양옆은 낮게
    const toDoor = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
    if (toDoor < doorHalf) continue;
    const south = Math.max(0, Math.sin(a));
    const h = o.wallH * (1 - 0.8 * south) * (0.85 + o.rnd() * 0.3);
    const r = (1.0 + o.rnd() * 0.5) * (1 - 0.5 * south);
    wb.add(lump(r, o.rnd, 0.22, 14, 10), vgrad(o.rock[0], o.rock[1], -r, r), { p: [Math.cos(a) * (o.R + r * 0.6), h * 0.45, Math.sin(a) * (o.R + r * 0.6)], s: [1, h / (r * 1.6), 1] });
  }
  const cols: ColBox[] = [];
  const m = 28;
  for (let i = 0; i < m; i++) {
    const a = (i / m) * TAU;
    const toDoor = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
    if (toDoor < doorHalf * 0.8) continue;
    cols.push({ hx: 0.9, hy: 2, hz: 0.9, x: Math.cos(a) * (o.R + 0.9), y: 2, z: Math.sin(a) * (o.R + 0.9) });
  }
  // 문 바깥 막이(나가기는 문 앞 E)
  cols.push({ hx: 2.4, hy: 2, hz: 0.5, x: 0, y: 2, z: o.R + 1.6 });
  return { floor: fg.build(), walls: wb.build(), cols };
}
/** 둥근 방 바닥 판정(로컬) */
export const roundFloor = (R: number) => (x: number, z: number) => (Math.hypot(x, z) <= R + 1.4 ? 0 : null);

export interface RoomBuilt { root: THREE.Group; cols: ColBox[]; floorAt(x: number, z: number): number | null; spawn: THREE.Vector3; exit: THREE.Vector3 }

// ───────────── 해적 동굴 ─────────────
export interface PirateRoom extends RoomBuilt { chest: ChestModel; chestAt: THREE.Vector3; crab: THREE.Group; crabAt: THREE.Vector3 }
export function buildPirateRoom(rnd: () => number): PirateRoom {
  const R = 9;
  const root = new THREE.Group();
  root.name = 'hidden-room-pirate';
  const rr = roundRoom({ R, floor: '#f6dfae', floorEdge: '#d9b47a', rock: ['#8f7aa8', '#c9b6dc'], wallH: 4.2, rnd });
  root.add(mesh(rr.floor, matBase(), { cast: false }), mesh(rr.walls, matBase()));
  const b = new Bake();
  // 보물 더미(북쪽): 동전 산 + 보석
  b.add(ell(3.0, 0.9, 2.0), vgrad('#f2b33d', '#ffe08a', -0.5, 0.8), { p: [0, 0.1, -5.6] });
  for (let i = 0; i < 40; i++) {
    const a = rnd() * TAU, r = rnd() * 3.2;
    b.add(cyl(0.18, 0.18, 0.05, 14), rnd() < 0.5 ? '#ffd36b' : '#ffe9a0', { p: [Math.cos(a) * r, 0.05 + rnd() * 0.5 * (1 - r / 3.2), -5.6 + Math.sin(a) * r * 0.65], r: [rnd() - 0.5, 0, rnd() - 0.5] });
  }
  // 통·나무상자·밧줄 더미
  for (const [x, z] of [[-5.5, -2.5], [-6.2, -0.8], [5.8, 1.2]] as const) {
    b.add(cyl(0.5, 0.5, 1.0, 20), stripes('#c98f5a', '#9a6640', 0.33), { p: [x, 0.5, z] }).add(ell(0.47, 0.2, 0.47), '#9a6640', { p: [x, 1.0, z], s: [1, 0.35, 1] });
  }
  b.add(rbox(1.2, 1.0, 1.2, 0.1), '#d9a06a', { p: [6.2, 0.5, -1.6] }).add(rbox(0.9, 0.8, 0.9, 0.1), '#c98f5a', { p: [6.0, 1.4, -1.5], r: [0, 0.4, 0] });
  b.add(tor(0.45, 0.14, 10, 24), '#e8cf9a', { p: [-4.2, 0.12, 3.6], r: [Math.PI / 2, 0, 0] });
  // 작은 바닷물 웅덩이 테두리
  b.add(tor(1.7, 0.25, 10, 40), '#b9a3c9', { p: [-4.0, 0.08, 1.6], r: [Math.PI / 2, 0, 0], s: [1, 0.8, 1] });
  // 벽 깃발 장대 + 걸이 등
  b.add(cyl(0.07, 0.08, 3.4, 10), '#9a6640', { p: [3.6, 1.7, -7.4] });
  for (const [x, z] of [[-6.6, -4.6], [6.6, -4.4], [-7.4, 2.4], [7.2, 3.0]] as const) b.add(cyl(0.05, 0.05, 1.4, 8), '#5a3b28', { p: [x, 2.6, z] });
  root.add(mesh(b.build(), matBase()));
  const glow = new Bake();
  for (let i = 0; i < 7; i++) { const a = rnd() * TAU, r = rnd() * 2.4; glow.add(sph(0.16, 10, 8), ['#ff9fc8', '#9ff0ff', '#b8ffb0', '#e7c8ff'][i % 4], { p: [Math.cos(a) * r, 0.55 + rnd() * 0.3, -5.6 + Math.sin(a) * r * 0.6] }); }
  for (const [x, z] of [[-6.6, -4.6], [6.6, -4.4], [-7.4, 2.4], [7.2, 3.0]] as const) glow.add(sph(0.26, 14, 10), '#ffe7a0', { p: [x, 1.8, z] });
  glow.add(new THREE.CircleGeometry(1.6, 32), '#7fe0d6', { r: [-Math.PI / 2, 0, 0], p: [-4.0, 0.06, 1.6], s: [1, 0.8, 1] });
  root.add(mesh(glow.build(), matGlow(), { cast: false }));
  // 해적 깃발(천)
  const fl = new Bake().add(new THREE.PlaneGeometry(1.5, 0.95), '#4a4370').add(sph(0.26, 14, 10), '#fff6e4', { p: [0, 0.05, 0.02], s: [1, 1, 0.2] });
  const flag = mesh(fl.build(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(4.35, 3.0, -7.4);
  root.add(flag);
  // 보물상자(더미 꼭대기)
  const chest = buildChest('gold');
  const chestAt = new THREE.Vector3(0, 0.95, -5.2);
  chest.root.position.copy(chestAt);
  root.add(chest.root);
  // 꼬마 해적 꽃게(두건 + 볼터치)
  const crab = new THREE.Group();
  const cb = new Bake()
    .add(ell(0.62, 0.38, 0.5), vgrad('#ff7f7f', '#ffb0a0', -0.3, 0.4), { p: [0, 0.42, 0] })
    .add(dome2(0.5), '#5aaef0', { p: [0, 0.68, -0.02], s: [1.05, 0.55, 1.0] }) // 두건
    .add(sph(0.1, 10, 8), '#5aaef0', { p: [0.35, 0.78, -0.35] });
  for (const s of [-1, 1]) {
    cb.add(ell(0.26, 0.2, 0.18), '#ff8f8f', { p: [s * 0.78, 0.55, 0.32] }).add(cone(0.08, 0.22, 8), '#ff8f8f', { p: [s * 0.86, 0.72, 0.4], r: [0, 0, -s * 0.4] });
    for (let i = 0; i < 3; i++) cb.add(cap(0.04, 0.36), '#ff9f8f', { p: [s * 0.6, 0.18, -0.2 + i * 0.18], r: [0, 0, s * 1.0] });
  }
  crab.add(mesh(cb.build(), matBase()));
  const face = new THREE.Group(); face.position.set(0, 0.5, 0.46);
  addEyes(face, { size: 0.17, y: 0.02, gap: 0.3 });
  crab.add(face);
  crab.add(blobShadow(0.8));
  const crabAt = new THREE.Vector3(3.2, 0, -3.0);
  crab.position.copy(crabAt);
  crab.rotation.y = -0.6;
  root.add(crab);
  const cols: ColBox[] = [...rr.cols, { hx: 2.4, hy: 0.6, hz: 1.3, x: 0, y: 0.6, z: -5.8 }, { hx: 0.6, hy: 0.6, hz: 0.6, x: 6.2, y: 0.6, z: -1.6 }];
  for (const [x, z] of [[-5.5, -2.5], [-6.2, -0.8], [5.8, 1.2]] as const) cols.push({ hx: 0.5, hy: 0.6, hz: 0.5, x, y: 0.6, z });
  return { root, cols, floorAt: roundFloor(R), spawn: new THREE.Vector3(0, 0, R - 1.6), exit: new THREE.Vector3(0, 0, R - 0.6), chest, chestAt, crab, crabAt };
}
const dome2 = (r: number) => new THREE.SphereGeometry(r, 24, 10, 0, TAU, 0, Math.PI / 2);

// ───────────── 협곡 지하수 동굴 ─────────────
export interface WaterRoom extends RoomBuilt { chest: ChestModel; chestAt: THREE.Vector3; springAt: THREE.Vector3; pool: THREE.Mesh; drips: THREE.Mesh }
export function buildWaterRoom(rnd: () => number): WaterRoom {
  const R = 10;
  const root = new THREE.Group();
  root.name = 'hidden-room-water';
  const rr = roundRoom({ R, floor: '#e8c49a', floorEdge: '#c98f5a', rock: ['#c9875a', '#f2c08a'], wallH: 4.6, rnd });
  root.add(mesh(rr.floor, matBase(), { cast: false }), mesh(rr.walls, matBase()));
  const b = new Bake();
  // 샘 둘레 돌 + 북쪽 샘 받침(물이 졸졸)
  b.add(tor(3.4, 0.35, 12, 48), vgrad('#b98a6a', '#e8c49a', -0.3, 0.3), { p: [0, 0.12, 0], r: [Math.PI / 2, 0, 0] });
  b.add(lump(1.3, rnd, 0.15), vgrad('#b07a5a', '#e0b080', -1, 1), { p: [0, 0.9, -6.4], s: [1.4, 1, 1] })
    .add(cyl(0.9, 0.7, 0.5, 24), '#d9a06a', { p: [0, 0.25, -5.0] })
    .add(cyl(0.75, 0.75, 0.06, 24), '#7fe0d6', { p: [0, 0.52, -5.0] });
  // 종유석·석순
  for (let i = 0; i < 14; i++) {
    const a = rnd() * TAU, r = R - 1.6 - rnd() * 2;
    if (Math.sin(a) > 0.7) continue;
    b.add(cone(0.3 + rnd() * 0.25, 1.2 + rnd() * 1.4, 10), vgrad('#d99a6a', '#f6d0a0', 0, 1.5), { p: [Math.cos(a) * r, 0.6, Math.sin(a) * r] });
  }
  root.add(mesh(b.build(), matBase()));
  // 빛나는 수정 · 버섯
  const g = new Bake();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU * 0.8 + Math.PI * 1.1, r = R - 1.2;
    g.add(cone(0.22 + rnd() * 0.15, 0.9 + rnd() * 0.9, 6), i % 2 ? '#9ff0ff' : '#c8fff0', { p: [Math.cos(a) * r, 0.5, Math.sin(a) * r], r: [(rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5] });
  }
  for (let i = 0; i < 8; i++) {
    const a = rnd() * TAU, r = 4.4 + rnd() * 3.5;
    if (Math.sin(a) > 0.8) continue;
    g.add(cyl(0.05, 0.06, 0.3, 8), '#fff6e4', { p: [Math.cos(a) * r, 0.15, Math.sin(a) * r] }).add(dome2(0.18), '#8ff0d0', { p: [Math.cos(a) * r, 0.3, Math.sin(a) * r] });
  }
  root.add(mesh(g.build(), matGlow(), { cast: false }));
  // 샘물(반투명, 살랑) — 걸어 들어가면 찰박
  const pool = mesh(new Bake().add(new THREE.CircleGeometry(3.25, 48), (p, out) => out.set('#5fd8ea').lerp(new THREE.Color('#c8fbff'), Math.min(1, Math.hypot(p.x, p.y) / 3.2)), { r: [-Math.PI / 2, 0, 0], p: [0, 0.05, 0] }).build(), matSoft(0.75), { cast: false, name: 'hidden-spring-pool' });
  root.add(pool);
  // 떨어지는 물방울(위아래로 움직인다)
  const dr = new Bake();
  for (let i = 0; i < 6; i++) dr.add(sph(0.07, 8, 6), '#c8fbff', { p: [(rnd() - 0.5) * 4, 2 + rnd() * 2, (rnd() - 0.5) * 4], s: [1, 1.4, 1] });
  const drips = mesh(dr.build(), matGlow(), { cast: false });
  root.add(drips);
  const chest = buildChest('silver');
  const chestAt = new THREE.Vector3(6.4, 0, -2.2);
  chest.root.position.copy(chestAt);
  chest.root.rotation.y = -1.1;
  root.add(chest.root);
  const cols: ColBox[] = [...rr.cols, { hx: 1.6, hy: 0.9, hz: 1.1, x: 0, y: 0.9, z: -6.5 }, { hx: 0.6, hy: 0.4, hz: 0.6, x: 6.4, y: 0.4, z: -2.2 }];
  return { root, cols, floorAt: roundFloor(R), spawn: new THREE.Vector3(0, 0, R - 1.6), exit: new THREE.Vector3(0, 0, R - 0.6), chest, chestAt, springAt: new THREE.Vector3(0, 0, -4.6), pool, drips };
}

// ───────────── 운석 속 무중력 방 ─────────────
export interface MeteorRoom extends RoomBuilt { orbs: THREE.Mesh[]; orbAt: THREE.Vector3[]; core: THREE.Mesh; coreAt: THREE.Vector3; rocks: THREE.Mesh }
/** 떠 있는 바위 발판(로컬): 가운데 높이 y, 반지름 r */
export const METEOR_PADS: Array<{ x: number; z: number; y: number; r: number }> = [
  { x: -3.2, z: -1.6, y: 1.6, r: 1.1 }, { x: 2.8, z: -3.0, y: 2.8, r: 1.0 }, { x: 0.4, z: 2.4, y: 2.2, r: 0.9 },
];
export function buildMeteorRoom(rnd: () => number): MeteorRoom {
  const R = 7.5;
  const root = new THREE.Group();
  root.name = 'hidden-room-meteorite';
  const rr = roundRoom({ R, floor: '#8a7cc0', floorEdge: '#5f5190', rock: ['#5a4c8c', '#9a8bc8'], wallH: 5.2, rnd, door: 0.28 });
  root.add(mesh(rr.floor, matBase(), { cast: false }), mesh(rr.walls, matBase()));
  // 떠 있는 바위 발판
  const pb = new Bake();
  for (const p of METEOR_PADS) pb.add(lump(p.r, rnd, 0.12, 16, 10), vgrad('#6f5f9e', '#b8a8e0', -p.r, p.r * 0.4), { p: [p.x, p.y - 0.3, p.z], s: [1, 0.38, 1] });
  const rocks = mesh(pb.build(), matBase(), { name: 'hidden-meteor-pads' });
  root.add(rocks);
  // 벽의 별·수정(빛)
  const g = new Bake();
  for (let i = 0; i < 46; i++) {
    const a = rnd() * TAU, y = 0.4 + rnd() * 4.5;
    if (Math.sin(a) > 0.85 && y < 2.5) continue;
    g.add(sph(0.05 + rnd() * 0.06, 6, 4), rnd() < 0.5 ? '#fff3b0' : '#e7c8ff', { p: [Math.cos(a) * (R + 0.2), y, Math.sin(a) * (R + 0.2)] });
  }
  for (let i = 0; i < 7; i++) { const a = rnd() * TAU, r = 2 + rnd() * 4.5; if (Math.sin(a) > 0.7) continue; g.add(cone(0.18, 0.7 + rnd() * 0.6, 6), i % 2 ? '#b8f6ff' : '#e6c8ff', { p: [Math.cos(a) * r, 0.3, Math.sin(a) * r] }); }
  root.add(mesh(g.build(), matGlow(), { cast: false }));
  // 가운데 운석 핵(둥실 도는 수정)
  const cg = new Bake().add(new THREE.OctahedronGeometry(0.6, 1), '#e7c8ff', { s: [1, 1.4, 1] }).add(tor(0.95, 0.04, 6, 40), '#fff3b0', { r: [Math.PI / 2.4, 0, 0] });
  const core = mesh(cg.build(), matGlow(), { cast: false, name: 'hidden-meteor-core' });
  const coreAt = new THREE.Vector3(0, 3.6, -1.2);
  core.position.copy(coreAt);
  root.add(core);
  // 떠다니는 별가루 구슬 6
  const orbs: THREE.Mesh[] = [], orbAt: THREE.Vector3[] = [];
  const spots: Array<[number, number, number]> = [[-3.2, 3.0, -1.6], [2.8, 4.3, -3.0], [0.4, 3.6, 2.4], [-5.0, 1.4, 1.8], [4.6, 1.8, 1.0], [-1.0, 5.0, -4.4]];
  for (const [x, y, z] of spots) {
    const m = mesh(stardustOrbGeo(), matGlow(), { cast: false, name: 'hidden-stardust-orb' });
    m.position.set(x, y, z);
    root.add(m);
    orbs.push(m); orbAt.push(new THREE.Vector3(x, y, z));
  }
  const cols: ColBox[] = [...rr.cols];
  for (const p of METEOR_PADS) cols.push({ hx: p.r * 0.75, hy: 0.15, hz: p.r * 0.75, x: p.x, y: p.y - 0.15, z: p.z });
  return { root, cols, floorAt: roundFloor(R), spawn: new THREE.Vector3(0, 0, R - 1.4), exit: new THREE.Vector3(0, 0, R - 0.5), orbs, orbAt, core, coreAt, rocks };
}

// ───────────── 모래 피라미드 퍼즐 방 ─────────────
export const WALL_H = 2.8, FRONT_H = 0.9;
export interface PyramidRoom extends RoomBuilt {
  /** 방마다 블록 메시(순서 = 퍼즐 블록 순서) */
  blocks: THREE.Mesh[][];
  /** 방마다 발판 빛(덮이면 밝아진다) */
  plates: THREE.Mesh[][];
  /** 방마다 문 돌판(열리면 바닥으로 내려간다) */
  doors: Array<THREE.Mesh | null>;
  /** 되돌리기 레버 자리(퍼즐 방마다) */
  levers: THREE.Vector3[];
  leverMeshes: THREE.Object3D[];
  scarab: THREE.Group;
  scarabAt: THREE.Vector3;
  chest: ChestModel;
  chestAt: THREE.Vector3;
  /** 바깥으로 나가는 자리(첫 방 입구) */
  exitAt: THREE.Vector3;
}
let blockGeo: Geo | null = null;
/** 밀 수 있는 돌 블록(풍뎅이 무늬) — 공유 */
export function pushBlockGeo(): Geo {
  if (blockGeo) return blockGeo;
  const b = new Bake().add(rbox(1.8, 1.6, 1.8, 0.22, 4), vgrad('#d9a65e', '#f6d79a', -0.8, 0.8), { p: [0, 0.8, 0] });
  for (const [rx, ry] of [[0, 0], [0, Math.PI / 2], [0, Math.PI], [0, -Math.PI / 2]] as const) {
    const q = new THREE.Euler(rx, ry, 0);
    const n = new THREE.Vector3(0, 0, 0.91).applyEuler(q);
    b.add(ell(0.32, 0.26, 0.06), '#5aaef0', { p: [n.x, 0.85, n.z], r: [0, ry, 0] }).add(ell(0.14, 0.12, 0.05), '#86c8ff', { p: [n.x * 1.01, 1.18, n.z * 1.01], r: [0, ry, 0] });
  }
  return (blockGeo = b.build(true));
}
export function buildPyramidRoom(): PyramidRoom {
  const root = new THREE.Group();
  root.name = 'hidden-room-pyramid';
  const blocks: THREE.Mesh[][] = [], plates: THREE.Mesh[][] = [], doors: Array<THREE.Mesh | null> = [], levers: THREE.Vector3[] = [], leverMeshes: THREE.Object3D[] = [];
  const cols: ColBox[] = [];
  const wallB = new Bake(), floorB = new Bake(), glowB = new Bake();
  const plateMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  for (let k = 0; k < ROOMS.length; k++) {
    const r = ROOMS[k];
    blocks.push([]); plates.push([]);
    for (let y = 0; y < r.h; y++) {
      // 벽 줄 묶기(충돌 상자 수를 줄인다)
      let run = -1;
      const flush = (x1: number) => {
        if (run < 0) return;
        const a = cellToLocal(k, run, y), b = cellToLocal(k, x1, y);
        cols.push({ hx: (b.x - a.x) / 2 + CELL / 2, hy: 1.6, hz: CELL / 2, x: (a.x + b.x) / 2, y: 1.6, z: a.z });
        run = -1;
      };
      for (let x = 0; x < r.w; x++) {
        const c = cellToLocal(k, x, y);
        const isWall = r.walls[y * r.w + x] && !r.pedestals.some((p) => p[0] === x && p[1] === y);
        const isPed = r.pedestals.some((p) => p[0] === x && p[1] === y);
        const front = y === r.h - 1;
        const tile = (x + y) % 2 ? '#f3d9a4' : '#ecca8a';
        if (!isWall || isPed) floorB.add(rbox(CELL * 0.98, 0.2, CELL * 0.98, 0.06), tile, { p: [c.x, -0.1, c.z] });
        if (isWall) {
          const h = front ? FRONT_H : WALL_H;
          wallB.add(rbox(CELL, h, CELL, 0.18), vgrad('#d3a663', '#f6d79a', 0, h), { p: [c.x, h / 2, c.z] });
          if (!front && (x + y) % 3 === 0) wallB.add(ell(0.28, 0.2, 0.05), '#5aaef0', { p: [c.x, h * 0.62, c.z + (y === 0 ? CELL / 2 + 0.02 : 0)] });
          if (run < 0) run = x;
        } else flush(x - 1);
        if (isPed) {
          wallB.add(cyl(0.7, 0.85, 1.0, 24), '#e0b56e', { p: [c.x, 0.5, c.z] }).add(cyl(0.75, 0.75, 0.1, 24), '#ffd36b', { p: [c.x, 1.05, c.z] });
          cols.push({ hx: 0.8, hy: 0.5, hz: 0.8, x: c.x, y: 0.5, z: c.z });
        }
      }
      flush(r.w - 1);
    }
    // 횃불(방 네 모서리 안쪽)
    for (const [x, y] of [[1, 1], [r.w - 2, 1]] as const) {
      const c = cellToLocal(k, x, y);
      const off = { x: x === 1 ? -0.7 : 0.7, z: -0.7 };
      wallB.add(cyl(0.08, 0.1, 1.6, 10), '#9a6640', { p: [c.x + off.x, 0.8, c.z + off.z] }).add(cyl(0.22, 0.14, 0.3, 14), '#c98f5a', { p: [c.x + off.x, 1.65, c.z + off.z] });
      glowB.add(cone(0.2, 0.5, 12), '#ffcf6a', { p: [c.x + off.x, 2.0, c.z + off.z] }).add(sph(0.12, 10, 8), '#fff3b0', { p: [c.x + off.x, 1.92, c.z + off.z] });
    }
    // 발판(빛 고리 — 덮이면 밝아진다)
    for (const [x, y] of r.plates) {
      const c = cellToLocal(k, x, y);
      floorB.add(rbox(CELL * 0.9, 0.08, CELL * 0.9, 0.05), '#c99a5a', { p: [c.x, 0.03, c.z] });
      const pg = new Bake().add(tor(0.62, 0.08, 8, 36), '#ffd36b', { r: [Math.PI / 2, 0, 0] }).add(ell(0.3, 0.02, 0.36), '#ffd36b', { p: [0, 0, 0] }).build();
      const pm = new THREE.Mesh(pg, plateMat.clone());
      pm.position.set(c.x, 0.1, c.z);
      pm.name = 'hidden-plate';
      root.add(pm);
      plates[k].push(pm);
    }
    // 블록
    for (const [x, y] of r.start) {
      const c = cellToLocal(k, x, y);
      const bm = mesh(pushBlockGeo(), matBase(), { name: 'hidden-push-block' });
      bm.position.set(c.x, 0, c.z);
      root.add(bm);
      blocks[k].push(bm);
    }
    // 문 돌판
    if (r.door) {
      const c = cellToLocal(k, r.door[0], r.door[1]);
      const dg = new Bake().add(rbox(CELL * 0.96, WALL_H, 0.6, 0.15), vgrad('#c99a5a', '#f2c97e', 0, WALL_H), { p: [0, WALL_H / 2, 0] })
        .add(ell(0.5, 0.36, 0.08), '#5aaef0', { p: [0, WALL_H * 0.55, 0.32] }).add(ell(0.22, 0.16, 0.06), '#ffd36b', { p: [0, WALL_H * 0.78, 0.33] }).build();
      const dm = mesh(dg, matBase(), { name: 'hidden-door' });
      dm.position.set(c.x, 0, c.z + CELL / 2 - 0.3);
      root.add(dm);
      doors.push(dm);
      // 되돌리기 레버(입구 옆 안쪽)
      const lc = cellToLocal(k, r.entry[0] + 1, r.entry[1] - 1);
      const lv = new THREE.Group();
      lv.add(mesh(new Bake().add(rbox(0.5, 0.4, 0.4, 0.08), '#9a6640', { p: [0, 0.2, 0] }).add(cap(0.06, 0.6), '#c98f5a', { p: [0, 0.65, 0], r: [0.5, 0, 0] }).add(sph(0.14, 12, 10), '#ff8f8f', { p: [0, 1.0, 0.18] }).build(), matBase()));
      lv.position.set(lc.x + 0.55, 0, lc.z + 0.55);
      lv.name = 'hidden-lever';
      root.add(lv);
      levers.push(lv.position.clone());
      leverMeshes.push(lv);
    } else doors.push(null);
  }
  root.add(mesh(floorB.build(), matBase(), { cast: false }), mesh(wallB.build(), matBase()), mesh(glowB.build(), matGlow(), { cast: false }));
  // 보물방: 받침대 둘(왼쪽 풍뎅이 · 오른쪽 금상자)
  const V = ROOMS.length - 1, vr = ROOMS[V];
  const [p0, p1] = vr.pedestals;
  const a = cellToLocal(V, p0[0], p0[1]), b = cellToLocal(V, p1[0], p1[1]);
  const scarab = buildScarab();
  const scarabAt = new THREE.Vector3(a.x, 1.1, a.z);
  scarab.position.copy(scarabAt);
  scarab.scale.setScalar(1.6);
  root.add(scarab);
  const chest = buildChest('gold');
  const chestAt = new THREE.Vector3(b.x, 1.1, b.z);
  chest.root.position.copy(chestAt);
  root.add(chest.root);
  // 보물방 금빛 바닥 무늬
  const vc = roomCenterZ(V);
  const deco = new Bake().add(tor(2.6, 0.08, 8, 64), '#ffd36b', { r: [Math.PI / 2, 0, 0], p: [0, 0.02, vc + 1] });
  root.add(mesh(deco.build(), matShiny(), { cast: false }));
  // 첫 방 입구 바깥 막이
  const e = ROOMS[0].entry, ec = cellToLocal(0, e[0], e[1]);
  cols.push({ hx: CELL, hy: 1.6, hz: 0.4, x: ec.x, y: 1.6, z: ec.z + CELL / 2 + 0.4 });
  const floorAt = (x: number, z: number) => (localToCell(x, z) ? 0 : null);
  return {
    root, cols, floorAt,
    spawn: new THREE.Vector3(ec.x, 0, ec.z - 0.4), exit: new THREE.Vector3(ec.x, 0, ec.z), exitAt: new THREE.Vector3(ec.x, 0, ec.z + 0.3),
    blocks, plates, doors, levers, leverMeshes, scarab, scarabAt, chest, chestAt,
  };
}
/** 발판 색(덮임 여부) */
export function tintPlate(m: THREE.Mesh, on: boolean) {
  const mat = m.material as THREE.MeshBasicMaterial;
  mat.color.set(on ? '#ffffff' : '#9a8a70');
}
export type { Room };
export { addBlush };
