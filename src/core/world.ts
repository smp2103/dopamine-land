// 군도 세계 — 8km × 8km 바다 위 테마 섬들. 섬마다 해안 모양·지형 생성기가 다르다.
// 마을(룩 테스트 장면, 원점)은 시작 섬 남쪽 해안의 반도로 이어진다(island.ts 가 합친다).
// 지형 특징(해구·늪·온천·크레이터·협곡·맹그로브·하트 연못·빙산 …)도 여기서 높이장에 녹인다.
// 모든 값은 시드 고정 노이즈 + 연속 함수 — 같은 좌표는 언제 물어도 같은 높이(청크를 다시 만들어도 이음매 없음).
import { createNoise2D } from 'simplex-noise';
import { mulberry32 } from './rng';
import type { SecretId } from './events';

export type IslandTheme = 'home' | 'dino' | 'ice' | 'mushroom' | 'coral' | 'desert' | 'launch' | 'islet';

export interface IslandDef {
  id: string;
  name: string;
  theme: IslandTheme;
  x: number;
  z: number;
  /** 평균 반경(m) */
  r: number;
  seed: number;
}

export const WORLD_BOUNDS = { minX: -4000, maxX: 4000, minZ: -4000, maxZ: 4000 };
export const SEA_FLOOR = -38;
/** 꼬르륵 해구 가장 깊은 곳(GDD 2.3) */
export const TRENCH_FLOOR = -120;

/** 섬 표시 이름(GDD 2.2 정본) — ui·hud 가 이 표로 이름을 띄운다 */
export const ISLAND_NAMES: Readonly<Record<string, string>> = {
  home: '말랑섬',
  dino: '쿵쿵공룡섬',
  ice: '솜눈섬',
  mushroom: '반딧불버섯섬',
  coral: '산호빛섬',
  desert: '모래시계섬',
  launch: '별똥별섬',
  'islet-a': '쪼꼬미섬 A',
  'islet-b': '쪼꼬미섬 B',
  'islet-c': '쪼꼬미섬 C',
  'islet-d': '쪼꼬미섬 D',
  'islet-e': '쪼꼬미섬 E',
  'islet-f': '쪼꼬미섬 F',
  'islet-g': '쪼꼬미섬 G',
  'islet-h': '쪼꼬미섬 H',
};

/** 섬 id → 표시 이름(모르는 id 는 그대로) */
export function islandName(id: string): string {
  return ISLAND_NAMES[id] ?? id;
}

export const ISLANDS: IslandDef[] = [
  { id: 'home', name: ISLAND_NAMES.home, theme: 'home', x: -120, z: -560, r: 560, seed: 11 },
  { id: 'dino', name: ISLAND_NAMES.dino, theme: 'dino', x: 1750, z: -900, r: 650, seed: 22 },
  { id: 'ice', name: ISLAND_NAMES.ice, theme: 'ice', x: -1900, z: -1550, r: 600, seed: 33 },
  { id: 'mushroom', name: ISLAND_NAMES.mushroom, theme: 'mushroom', x: -1750, z: 1100, r: 520, seed: 44 },
  { id: 'coral', name: ISLAND_NAMES.coral, theme: 'coral', x: 900, z: 1500, r: 480, seed: 55 },
  { id: 'desert', name: ISLAND_NAMES.desert, theme: 'desert', x: 2650, z: 1050, r: 550, seed: 66 },
  { id: 'launch', name: ISLAND_NAMES.launch, theme: 'launch', x: 300, z: -2350, r: 450, seed: 77 },
  // 보물 작은 섬들(쪼꼬미섬)
  { id: 'islet-a', name: ISLAND_NAMES['islet-a'], theme: 'islet', x: 520, z: 420, r: 70, seed: 101 },
  { id: 'islet-b', name: ISLAND_NAMES['islet-b'], theme: 'islet', x: -900, z: 300, r: 90, seed: 102 },
  { id: 'islet-c', name: ISLAND_NAMES['islet-c'], theme: 'islet', x: 1200, z: 300, r: 55, seed: 103 },
  { id: 'islet-d', name: ISLAND_NAMES['islet-d'], theme: 'islet', x: -700, z: -1900, r: 80, seed: 104 },
  { id: 'islet-e', name: ISLAND_NAMES['islet-e'], theme: 'islet', x: 2300, z: -2200, r: 110, seed: 105 },
  { id: 'islet-f', name: ISLAND_NAMES['islet-f'], theme: 'islet', x: -2800, z: -200, r: 120, seed: 106 },
  { id: 'islet-g', name: ISLAND_NAMES['islet-g'], theme: 'islet', x: 400, z: 2900, r: 100, seed: 107 },
  { id: 'islet-h', name: ISLAND_NAMES['islet-h'], theme: 'islet', x: 3300, z: -400, r: 75, seed: 108 },
];

const n1 = createNoise2D(mulberry32(9001));
const n2 = createNoise2D(mulberry32(9002));
const n3 = createNoise2D(mulberry32(9003));

const sm = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function fbm(n: (x: number, z: number) => number, x: number, z: number, oct: number): number {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, z * f); a *= 0.5; f *= 2.07; }
  return s;
}

/** 동숲식 계단 지형: 연속 높이를 층(step m)으로 끊고 모서리만 둥글게 */
function terrace(h: number, step: number, soft = 0.12): number {
  const k = h / step, i = Math.floor(k), f = k - i;
  return (i + sm(0.5 - soft, 0.5 + soft, f)) * step;
}

/** 선분까지 거리 */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  if (l2 < 1e-9) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/** 섬 중심 기준 비율 좌표(u = 동쪽 +, v = 남쪽 +) → 월드 좌표 */
function uv(id: string, u: number, v: number): { x: number; z: number } {
  const d = ISLANDS.find((q) => q.id === id)!;
  return { x: d.x + u * d.r, z: d.z + v * d.r };
}

// ── 해구·빙산·모래톱(바다 지형) ─────────────────────────────────
/** 꼬르륵 해구 타원(GDD 2.3): 중심 (−500, 3200), 반축 1400 × 500 */
export const TRENCH = { x: -500, z: 3200, rx: 1400, rz: 500, edgeDepth: -60, floor: TRENCH_FLOOR };
/** 월드 가장자리 고리: 원점에서 이 거리 밖은 −60 m 보다 깊어진다 */
export const EDGE_RING = { r0: 3700, depth: -60, deepest: -80 };
/** 얼음 성 빙산(솜눈섬 남동 만 한가운데 떠 있는 얼음 작은 섬) */
export const ICEBERG = { x: -1650, z: -1250, r: 46, top: 15 };
/** 솜눈섬 남동 만(빙산이 떠 있는 펭귄 만) — 캡슐 A→B, 반경 r */
const ICE_BAY = { ax: -1650, az: -1250, bx: -1470, bz: -1040, r: 135 };

/** 해구 세기 0..1(타원 안쪽 1, 바깥 0) — zoneAt·심해 생물 판정에도 쓴다 */
export function trenchAt(x: number, z: number): number {
  const e = Math.hypot((x - TRENCH.x) / TRENCH.rx, (z - TRENCH.z) / TRENCH.rz);
  return sm(1.2, 0.95, e);
}

/** 빙산까지 해안 부호 거리(양수 = 빙산 위) */
function bergCoast(x: number, z: number): number {
  const dd = Math.hypot(x - ICEBERG.x, z - ICEBERG.z);
  // 멀어지면 해안 노이즈를 서서히 꺼서(1.3r → 1.5r) 먼 곳은 노이즈 계산 없이 이어지게
  const k = 1 - sm(ICEBERG.r * 1.3, ICEBERG.r * 1.5, dd);
  if (k <= 0) return ICEBERG.r - dd;
  const a = Math.atan2(z - ICEBERG.z, x - ICEBERG.x);
  return ICEBERG.r * (1 + 0.14 * k * n2(Math.cos(a) * 1.4 + 31, Math.sin(a) * 1.4 - 17)) - dd;
}
/** 솜눈섬 만 안쪽 부호 거리(양수 = 만 물 안) */
function iceBayIn(x: number, z: number): number {
  const B = ICE_BAY;
  const sd = segDist(x, z, B.ax, B.az, B.bx, B.bz);
  // 만 가장자리 노이즈는 바깥 80~120 m 에서 꺼진다(먼 곳은 노이즈 계산 생략, 값은 이어진다)
  const k = 1 - sm(B.r + 80, B.r + 120, sd);
  if (k <= 0) return B.r - sd;
  return B.r + 14 * k * n1(x * 0.012 + 5, z * 0.012 - 9) - sd;
}

/** 섬의 해안 부호 거리(양수 = 육지). 각도별 노이즈로 들쭉날쭉한 해안. */
export function islandCoast(d: IslandDef, x: number, z: number): number {
  const dx = x - d.x, dz = z - d.z;
  const dist = Math.hypot(dx, dz);
  if (dist > d.r * 1.5 + 60) return d.r * 1.5 - dist; // 멀면 대충
  const s = d.seed * 13.7;
  const ax = dx / d.r, az = dz / d.r;
  const wob = 0.22 * fbm(n1, ax * 1.6 + s, az * 1.6 - s, 3) + 0.06 * n2(x * 0.02 + s, z * 0.02);
  let c = d.r * (1 + wob) - dist;
  if (d.theme === 'ice') {
    // 남동 펭귄 만을 파내고, 그 한가운데 빙산 하나
    if (Math.abs(x - ICEBERG.x) < 520 && Math.abs(z - ICEBERG.z) < 520) {
      c = Math.min(c, -iceBayIn(x, z));
      c = Math.max(c, bergCoast(x, z));
    }
  }
  return c;
}

export interface WorldSample {
  h: number;
  coast: number;
  island: IslandDef | null;
  /** 지형 종류 힌트 */
  kind: 'sea' | 'sand' | 'grass' | 'cliff' | 'rock' | 'snow' | 'jungle' | 'desert' | 'lava' | 'river';
  /** 섬 안쪽 깊이 0..1(해안 0, 중심 1) */
  inland: number;
  /** 계단 좌표(층 높이 단위, fract 0.5 근처가 흙벽) — 지형 셰이더용, 없으면 0 */
  terr?: number;
  /** 계단 흙벽 세기 0..1 */
  wallAmp?: number;
  /** 바위 비율 0..1(화산 사면·메사·설산 바위) */
  rock?: number;
  /** 특수 표면 0..1(공룡 섬 용암 / 얼음 섬 언 호수) */
  special?: number;
  /** 호수·강 물 높이(물 위가 아니면 -Infinity) */
  water?: number;
  /** 근처 물 높이(물 밖이어도 호수·강 둘레면 그 높이, 아니면 0 = 바다) — 셰이더 보간용 */
  waterRef?: number;
}

const BEACH = 22;

// ── 섬 안 호수·강 ──────────────────────────────────────────────
/** 호수 종류 — 낚시·곤충 구역 코드(GDD 3.5·3.6)와 같은 말 */
export type LakeKind = 'pond' | 'heartpond' | 'hotspring' | 'swamp' | 'foglake' | 'ancientlake' | 'icelake' | 'oasis' | 'crater' | 'footprint';
/** 호수 모양: 기본은 들쭉날쭉한 원, heart = 하트(뾰족한 끝이 rot 방향), foot = 공룡 발자국(발가락이 rot 방향) */
export type LakeShape = 'round' | 'heart' | 'foot';
/** 호수 정의(섬 중심 기준 반경 비율 좌표) */
interface LakeDef {
  island: string; u: number; v: number; r: number; kind: LakeKind;
  frozen?: boolean; shape?: LakeShape; rot?: number;
  /** 바닥 깊이(m, 기본 2.6) */
  depth?: number;
  /** 크레이터 호수: 물이 은하색 */
  galaxy?: boolean;
  /** 얼음 구멍 수(언 호수만) */
  holes?: number;
}
// 순서 = 호수 id(`${island}-lake${i}`) — 기존 호수는 앞에 그대로 두고 새 호수는 뒤에 붙인다
const LAKE_DEFS: LakeDef[] = [
  { island: 'home', u: -0.08, v: -0.42, r: 46, kind: 'pond' },
  { island: 'home', u: 0.42, v: -0.12, r: 26, kind: 'pond' },
  { island: 'dino', u: -0.6, v: 0.25, r: 34, kind: 'ancientlake', depth: 3.4 },
  { island: 'dino', u: 0.45, v: 0.55, r: 22, kind: 'pond' },
  { island: 'ice', u: -0.52, v: 0.08, r: 56, kind: 'icelake', frozen: true, holes: 7 },
  // (예전 u 0.3, v 0.45 — 남동 펭귄 만이 생기며 안쪽으로 옮겼다)
  { island: 'ice', u: 0.0, v: 0.3, r: 24, kind: 'icelake', frozen: true, holes: 2 },
  { island: 'mushroom', u: 0.3, v: 0.22, r: 26, kind: 'pond' },
  { island: 'mushroom', u: -0.38, v: -0.22, r: 32, kind: 'pond' },
  { island: 'mushroom', u: 0.05, v: -0.55, r: 20, kind: 'pond' },
  { island: 'desert', u: 0.32, v: -0.3, r: 34, kind: 'oasis' },
  { island: 'launch', u: 0.5, v: 0.02, r: 34, kind: 'crater', galaxy: true, depth: 5.5 },
  // ── 새 호수 ──
  // 말랑섬 꽃잎 언덕(북동)의 하트 연못 — 뾰족한 끝이 남쪽(마을)을 본다
  { island: 'home', u: 0.36, v: -0.5, r: 22, kind: 'heartpond', shape: 'heart', rot: 0, depth: 1.8 },
  // 쿵쿵공룡섬: 화산 기슭 온천 3곳 + 동남 늪 + 초원 발자국 연못 3
  { island: 'dino', u: 0.36, v: -0.1, r: 10, kind: 'hotspring', depth: 1.1 },
  { island: 'dino', u: 0.43, v: -0.29, r: 8, kind: 'hotspring', depth: 1.0 },
  { island: 'dino', u: 0.24, v: 0.06, r: 11, kind: 'hotspring', depth: 1.2 },
  { island: 'dino', u: 0.6, v: 0.3, r: 44, kind: 'swamp', depth: 0.8 },
  { island: 'dino', u: -0.08, v: 0.22, r: 7, kind: 'footprint', shape: 'foot', rot: 0.3, depth: 0.9 },
  { island: 'dino', u: 0.0, v: 0.31, r: 7, kind: 'footprint', shape: 'foot', rot: 0.25, depth: 0.9 },
  { island: 'dino', u: -0.06, v: 0.4, r: 7, kind: 'footprint', shape: 'foot', rot: 0.35, depth: 0.9 },
  // 솜눈섬 간헐천 골짜기 온천 2
  { island: 'ice', u: 0.1, v: 0.12, r: 8, kind: 'hotspring', depth: 1.0 },
  { island: 'ice', u: 0.17, v: 0.18, r: 6, kind: 'hotspring', depth: 0.9 },
  // 반딧불버섯섬: 남쪽 반딧불 늪 + 서쪽 안개 호수
  { island: 'mushroom', u: 0.02, v: 0.56, r: 48, kind: 'swamp', depth: 0.7 },
  { island: 'mushroom', u: -0.6, v: 0.05, r: 40, kind: 'foglake', depth: 3.0 },
  // 모래시계섬 서쪽 오아시스(바자르 옆)
  { island: 'desert', u: -0.62, v: -0.1, r: 30, kind: 'oasis' },
];
/** 강(섬 중심 기준 비율 좌표, 상류 → 하구). 첫 점은 호수 안. */
interface RiverDef { island: string; pts: Array<[number, number]>; halfW: number; /** 하구 폭 배율(삼각주처럼 넓어진다) */ estuary?: number; }
const RIVER_DEFS: RiverDef[] = [
  { island: 'home', halfW: 4.2, estuary: 2.6, pts: [[-0.08, -0.42], [-0.2, -0.3], [-0.34, -0.14], [-0.42, 0.04], [-0.55, 0.2], [-0.7, 0.32], [-0.86, 0.42], [-1.08, 0.5]] },
  { island: 'home', halfW: 3.0, pts: [[0.42, -0.12], [0.55, -0.02], [0.68, 0.1], [0.82, 0.2], [1.06, 0.3]] },
  { island: 'dino', halfW: 5.0, pts: [[-0.6, 0.25], [-0.72, 0.38], [-0.84, 0.48], [-1.08, 0.6]] },
  { island: 'mushroom', halfW: 3.0, pts: [[0.3, 0.22], [0.45, 0.35], [0.62, 0.45], [0.8, 0.52], [1.06, 0.6]] },
];

export interface LakeInfo {
  id: string; island: string; x: number; z: number; r: number; level: number; frozen: boolean;
  kind: LakeKind;
  shape: LakeShape;
  /** 모양 방향(라디안, 0 = 남쪽 +z) */
  rot: number;
  /** 바닥 깊이(m) */
  depth: number;
  /** 크레이터 호수의 은하색 물 */
  galaxy: boolean;
  /** 언 호수의 얼음 구멍(낚시 자리) */
  holes: Array<{ x: number; z: number; r: number }>;
}
export interface RiverInfo { island: string; halfW: number; estuary: number; pts: Array<{ x: number; z: number; level: number }>; }

let lakeCache: LakeInfo[] | null = null;
let riverCache: RiverInfo[] | null = null;
let buildingWater = false;

/** 2D 하트 SDF(음수 = 안쪽, 뾰족한 끝이 원점, 둥근 쪽이 +y) */
function sdHeart(px: number, py: number): number {
  px = Math.abs(px);
  if (py + px > 1) return Math.hypot(px - 0.25, py - 0.75) - Math.SQRT2 / 4;
  const a = Math.hypot(px, py - 1);
  const m = 0.5 * Math.max(px + py, 0);
  const b = Math.hypot(px - m, py - m);
  return Math.min(a, b) * Math.sign(px - py);
}

/** 호수 가장자리까지 부호 거리(양수 = 물 안쪽), 가장자리는 살짝 들쭉날쭉 */
export function lakeEdge(L: { x: number; z: number; r: number; shape?: LakeShape; rot?: number; kind?: LakeKind }, x: number, z: number): number {
  const dx = x - L.x, dz = z - L.z;
  if (L.shape === 'heart' || L.shape === 'foot') {
    // 모양 좌표: rot 방향이 '앞'(하트는 뾰족한 끝, 발자국은 발가락)
    const ro = L.rot ?? 0, c = Math.cos(ro), s = Math.sin(ro);
    const f = dx * s + dz * c; // 앞쪽 성분
    const side = dx * c - dz * s;
    if (L.shape === 'heart') {
      const S = L.r * 1.7;
      // 하트 SDF 는 +y 가 둥근 쪽 → 앞(뾰족)이 -y
      const d = sdHeart(side / S, (-f) / S + 0.55) * S;
      return -d + 0.6 * n2(x * 0.08, z * 0.08);
    }
    // 발자국: 뒤꿈치 패드 + 앞쪽 발가락 3
    let best = L.r * 0.62 - Math.hypot(side, f + L.r * 0.1);
    for (const a of [-0.55, 0, 0.55]) {
      const tx = Math.sin(a) * L.r * 0.82, tf = Math.cos(a) * L.r * 0.82;
      best = Math.max(best, L.r * 0.3 - Math.hypot(side - tx, f - tf));
    }
    return best;
  }
  const a = Math.atan2(dz, dx);
  const wob = L.kind === 'swamp'
    ? 0.16 * n2(Math.cos(a) * 1.2 + L.x * 0.01, Math.sin(a) * 1.2 + L.z * 0.01) + 0.2 * n1(Math.cos(a) * 3.1 + L.z * 0.01, Math.sin(a) * 3.1 - L.x * 0.01)
    : 0.16 * n2(Math.cos(a) * 1.2 + L.x * 0.01, Math.sin(a) * 1.2 + L.z * 0.01);
  return L.r * (1 + wob) - Math.hypot(dx, dz);
}

/** 섬 안 호수 목록(물 높이 포함, 한 번 계산) */
export function worldLakes(): LakeInfo[] {
  if (lakeCache) return lakeCache;
  buildingWater = true;
  const out: LakeInfo[] = [];
  LAKE_DEFS.forEach((L, i) => {
    const d = ISLANDS.find((q) => q.id === L.island)!;
    const x = d.x + L.u * d.r, z = d.z + L.v * d.r;
    // 물 높이: 가장자리 둘레의 가장 낮은 땅보다 조금 아래(물이 넘치지 않게)
    let lo = rawLand(d, x, z);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      for (const f of [1.0, 1.3]) lo = Math.min(lo, rawLand(d, x + Math.cos(a) * L.r * f, z + Math.sin(a) * L.r * f));
    }
    const drop = L.frozen ? 0.2 : L.kind === 'hotspring' || L.kind === 'footprint' ? 0.4 : 0.55;
    // 얼음 구멍: 언 호수 안쪽에 시드 고정으로 흩뿌린다(서로 4 m 이상 떨어지게)
    const holes: LakeInfo['holes'] = [];
    if (L.frozen && L.holes) {
      const rnd = mulberry32(7000 + i * 31);
      for (let t = 0; t < 200 && holes.length < L.holes; t++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * L.r * 0.62;
        const hx = x + Math.cos(a) * rr, hz = z + Math.sin(a) * rr;
        if (holes.every((q) => Math.hypot(q.x - hx, q.z - hz) > 6)) holes.push({ x: hx, z: hz, r: 1.3 });
      }
    }
    out.push({
      id: `${L.island}-lake${i}`, island: L.island, x, z, r: L.r, level: Math.max(0.6, lo - drop), frozen: !!L.frozen,
      kind: L.kind, shape: L.shape ?? 'round', rot: L.rot ?? 0, depth: L.depth ?? 2.6, galaxy: !!L.galaxy, holes,
    });
  });
  lakeCache = out;
  // 강: 상류 호수 높이에서 시작해 하류로 갈수록 낮아진다(땅이 계단이면 폭포)
  const rivers: RiverInfo[] = [];
  for (const R of RIVER_DEFS) {
    const d = ISLANDS.find((q) => q.id === R.island)!;
    const P = R.pts.map(([u, v]) => ({ x: d.x + u * d.r, z: d.z + v * d.r }));
    const dense: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / 6));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const f = (a: number, b: number, c: number, e: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - e) * t2 + (-a + 3 * b - 3 * c + e) * t3);
        let x = f(p0.x, p1.x, p2.x, p3.x), z = f(p0.z, p1.z, p2.z, p3.z);
        if (i > 0 || k > 2) { const w = 9 * n1(x * 0.006 + 40, z * 0.006 - 40); x += w * 0.7; z -= w * 0.5; }
        dense.push({ x, z });
      }
    }
    dense.push(P[P.length - 1]);
    const src = out.find((l) => l.island === R.island && Math.hypot(l.x - P[0].x, l.z - P[0].z) < 5);
    let level = src ? src.level : rawLand(d, dense[0].x, dense[0].z) - 0.6;
    const pts = dense.map((p) => {
      // 강둑 양쪽 중 낮은 땅 기준
      let g = rawLand(d, p.x, p.z);
      for (const [ox, oz] of [[R.halfW + 3, 0], [-R.halfW - 3, 0], [0, R.halfW + 3], [0, -R.halfW - 3]]) g = Math.min(g, rawLand(d, p.x + ox, p.z + oz));
      level = Math.min(level, Math.max(-0.05, g - 0.6));
      return { x: p.x, z: p.z, level };
    });
    rivers.push({ island: R.island, halfW: R.halfW, estuary: R.estuary ?? 0, pts });
  }
  riverCache = rivers;
  buildingWater = false;
  return lakeCache;
}

export function worldRivers(): RiverInfo[] {
  if (!riverCache) worldLakes();
  return riverCache!;
}

/** 강 중심선까지 거리 + 그 자리 물 높이(폭포 마디는 끝에서 급하게 떨어진다) */
function riverQuery(id: string, x: number, z: number): { d: number; level: number; halfW: number; estuary: number; fall: boolean } | null {
  let best: { d: number; level: number; halfW: number; estuary: number; fall: boolean } | null = null;
  for (const R of riverCache!) {
    if (R.island !== id) continue;
    const pts = R.pts;
    const pad = 32 + R.halfW * (1 + R.estuary);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (x < Math.min(a.x, b.x) - pad || x > Math.max(a.x, b.x) + pad || z < Math.min(a.z, b.z) - pad || z > Math.max(a.z, b.z) + pad) continue;
      const vx = b.x - a.x, vz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
      const d = Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t));
      if (!best || d < best.d) {
        const drop = a.level - b.level;
        const tt = drop > 1.2 ? sm(0.62, 0.72, t) : t;
        best = { d, level: a.level + (b.level - a.level) * tt, halfW: R.halfW, estuary: R.estuary, fall: drop > 1.2 && t > 0.5 && t < 0.84 };
      }
    }
  }
  return best;
}

/** 섬 안 물(호수·강)이 깎은 땅 + 물 높이 */
function carveWater(d: IslandDef, x: number, z: number, h: number, coast: number): { h: number; water: number; special: number; ref: number; fall: boolean } {
  if (buildingWater) return { h, water: -Infinity, special: 0, ref: 0, fall: false };
  if (!lakeCache) worldLakes();
  let water = -Infinity, special = 0, ref = 0, fall = false;
  for (const L of lakeCache!) {
    if (L.island !== d.id) continue;
    if (Math.abs(x - L.x) > L.r * 1.6 + 14 || Math.abs(z - L.z) > L.r * 1.6 + 14) continue;
    const sd = lakeEdge(L, x, z);
    if (sd > -14) ref = Math.max(ref, L.level);
    if (L.frozen) {
      // 언 호수: 평평한 얼음판(걸을 수 있다) + 얼음 구멍(물이 보이는 낚시 자리)
      const flat = sm(-12, 1, sd);
      h = h * (1 - flat) + L.level * flat;
      let ice = sm(-1.2, 1.2, sd);
      for (const q of L.holes) {
        const hd = Math.hypot(x - q.x, z - q.z);
        if (hd > q.r + 1) continue;
        const k = sm(q.r + 0.6, q.r - 0.4, hd);
        h -= 1.3 * k;
        ice *= 1 - k;
        if (hd < q.r) water = Math.max(water, L.level);
      }
      special = Math.max(special, ice);
      continue;
    }
    const bottom = L.level - 0.25 - L.depth * sm(0, Math.min(14, L.r * 0.6), sd);
    const shore = L.level - 0.25 + Math.max(0, -sd) * 0.32;
    const target = sd > 0 ? bottom : shore;
    if (target < h) {
      // 상자 테두리에서 이음매가 생기지 않게 바깥으로 갈수록 깎기를 놓는다
      const w = 1 - sm(L.r * 1.45, L.r * 1.6 + 12, Math.hypot(x - L.x, z - L.z));
      h += (target - h) * w;
    }
    if (h < L.level) water = Math.max(water, L.level);
  }
  for (const R of riverCache!) {
    if (R.island !== d.id) continue;
    const q = riverQuery(d.id, x, z);
    if (q) {
      // 하구: 바다에 가까워지고 물이 바다 높이에 닿을수록 넓어진다
      const wide = q.estuary > 0 ? 1 + q.estuary * sm(70, 6, coast) * sm(0.7, 0.05, q.level) : 1;
      const hw = q.halfW * wide;
      if (q.d < hw + 24) {
        const e = q.d - hw;
        if (e < 16) ref = Math.max(ref, q.level);
        const bed = q.level - 0.25 - 1.2 * sm(0, -hw * 0.8, e);
        const bank = q.level - 0.25 + Math.max(0, e) * 0.5;
        const target = e < 0 ? bed : bank;
        // 둑 바깥 끝에서 이음매가 생기지 않게(높은 땅을 지나는 강은 골짜기 벽이 서서히 땅에 붙는다)
        if (target < h) { h += (target - h) * (1 - sm(12, 24, e)); if (q.fall && e < 12) fall = true; }
        if (h < q.level && e < 2) water = Math.max(water, q.level);
      }
    }
    break;
  }
  return { h, water, special, ref, fall };
}

const ridge = (v: number) => 1 - Math.abs(v);

interface Land {
  h: number; kind: WorldSample['kind']; terr: number; wallAmp: number; rock: number; special: number;
  /** 큰 계단(6 m 이상)의 벽 띠 안 — worldSample 이 기울기를 재서 절벽으로 표시한다 */
  band: boolean;
  /** 맹그로브 수로·석호처럼 바다와 이어진 물(높이 0) */
  seaWater: boolean;
}

/** 섬 하나의 육지 높이(물이 깎기 전). 테마별 생성기. */
function landRaw(d: IslandDef, x: number, z: number, c: number): Land {
  const inland = Math.min(1, c / d.r);
  const lx = (x - d.x) / d.r, lz = (z - d.z) / d.r;
  const rc = Math.hypot(lx, lz);
  const beachT = sm(0, BEACH, c);
  const base = 1.0;
  let h = base, kind: WorldSample['kind'] = 'grass', terr = 0, wallAmp = 0, rock = 0, special = 0, band = false, seaWater = false;
  /** 이 생성기가 직접 정한 절벽(협곡 벽·해안 절벽) — 해변 판정보다 우선 */
  let forced: WorldSample['kind'] | null = null;
  const hill = fbm(n3, x * 0.004 + d.seed, z * 0.004 - d.seed, 4);
  /** 계단: 연속값 v 를 step 층으로 */
  const steps = (v: number, step: number, amp = 1, soft = 0.14) => {
    terr = v / step; wallAmp = amp;
    if (step >= 6 && amp > 0.3) { const f = terr - Math.floor(terr); band = Math.abs(f - 0.5) < soft + 0.08; }
    return terrace(v, step, soft);
  };
  /** 해안선 안쪽 c0..c1 m 에서 솟는 해안 절벽(높이 rise) — 아래 해변은 남는다 */
  const coastCliff = (mask: number, rise: number) => {
    if (mask <= 0) return 0;
    const k = sm(BEACH + 2, BEACH + 9, c) * mask;
    if (mask * rise > 1.6 && c > BEACH + 0.5 && c < BEACH + 10.5) forced = 'cliff';
    rock = Math.max(rock, mask * sm(BEACH, BEACH + 14, c) * (1 - sm(BEACH + 20, BEACH + 40, c)));
    return rise * k;
  };
  switch (d.theme) {
    case 'home': {
      // 마을(원점) 근처는 평평, 안쪽으로 갈수록 계단 언덕 + 가운데 높은 대지(호수가 앉는 곳)
      const away = sm(60, 200, Math.hypot(x, z));
      const up = Math.max(0, 1 - Math.hypot(lx + 0.05, lz + 0.38) / 0.7);
      const v = Math.max(0, (hill + 0.3) * 16 * sm(0.02, 0.3, inland) + up * up * 34);
      h = base + away * steps(v, 4.5, away);
      // 북쪽 해안 절벽(등대 곶 쪽 바다를 내려다보는 벼랑, 아래엔 작은 해변)
      h += coastCliff(sm(-0.52, -0.74, lz) * sm(0.85, 0.5, Math.abs(lx + 0.05)) * away, 12);
      break;
    }
    case 'dino': {
      // 정글 저지대 + 가운데 거대한 화산(둥근 원뿔, 분화구에 용암)
      // 화산은 섬 북쪽(GDD: 높이 ~120 m, 분화구 지름 ~80 m)
      const rv = Math.hypot(lx, lz + 0.33);
      const cone = Math.max(0, 1 - rv / 0.42);
      const vol = Math.pow(cone, 1.5) * 150 + cone * 8 * fbm(n2, x * 0.02, z * 0.02, 2);
      const rim = 150 * Math.pow(Math.max(0, 1 - 0.07 / 0.42), 1.5);
      const crater = sm(0.075, 0.045, rv);
      const low = steps(Math.max(0, (hill + 0.35) * 12 * sm(0.02, 0.3, inland)), 3, 1 - sm(0.2, 0.6, cone));
      // 티노 낮잠 언덕: 섬 중앙 북쪽, 화산 기슭에 동그랗게 솟은 풀 언덕(꼭대기는 평평)
      const TH = TINO_HILL_UV;
      const tino = 13 * sm(0.085, 0.03, Math.hypot(lx - TH.u, lz - TH.v));
      h = base + low + vol + tino;
      h = h * (1 - crater) + (rim - 22) * crater;
      // 중앙 초원 계곡(풀밭) / 남·서 정글 / 화산 바위
      const meadow = sm(0.42, 0.3, Math.hypot(lx - 0.02, lz - 0.15));
      kind = crater > 0.5 ? 'lava' : cone > 0.3 ? 'rock' : meadow > 0.5 || tino > 2 ? 'grass' : 'jungle';
      rock = sm(0.18, 0.5, cone);
      special = sm(0.6, 0.95, crater);
      break;
    }
    case 'ice': {
      if (bergCoast(x, z) > -6) {
        // 얼음 성 빙산: 둘레 좁은 얼음 턱 → 가파른 얼음벽 → 평평한 꼭대기
        const cb = bergCoast(x, z);
        h = base + ICEBERG.top * sm(5, 17, cb) + 1.2 * n1(x * 0.05, z * 0.05) * sm(17, 30, cb);
        kind = 'snow';
        rock = 0;
        special = 0.35;
        break;
      }
      // 설산 둘(능선) + 해안 빙하 절벽 대지
      // 설산은 북쪽(GDD: 정상 ~140 m)
      const p1 = Math.max(0, 1 - Math.hypot(lx + 0.02, lz + 0.36) / 0.5);
      const p2 = Math.max(0, 1 - Math.hypot(lx - 0.36, lz + 0.5) / 0.3);
      const rid = ridge(n2(x * 0.006 + 3, z * 0.006)) * 0.5 + ridge(n1(x * 0.013, z * 0.013 + 7)) * 0.25;
      const mtn = Math.pow(p1, 1.5) * 130 + Math.pow(p2, 1.6) * 80 + (p1 + p2) * rid * 30;
      const shelf = steps(sm(0.0, 0.08, inland) * 14 + Math.max(0, hill + 0.2) * 10 * sm(0.05, 0.3, inland), 7, 1);
      h = base + shelf + mtn;
      // 간헐천 골짜기(중앙): 김 나는 온천이 앉는 둥근 분지
      const GV = GEYSER_VALLEY_UV;
      const gv = sm(0.15, 0.05, Math.hypot(lx - GV.u, lz - GV.v));
      h = Math.max(base + 0.6, h - 7 * gv);
      kind = 'snow';
      rock = sm(0.25, 0.55, p1 + p2 * 0.8) * 0.6;
      break;
    }
    case 'mushroom': {
      // 둥글둥글한 언덕(동산)들
      const b1 = Math.max(0, fbm(n3, x * 0.007 + 13, z * 0.007 - 5, 2) + 0.12);
      const dome = Math.pow(b1, 1.3) * 34 * sm(0.03, 0.3, inland);
      h = base + dome + Math.max(0, hill) * 3;
      break;
    }
    case 'coral': {
      // 낮고 평평한 고리 섬 + 가운데 석호(바다 높이 아래)
      h = base + Math.max(0, hill + 0.1) * 5 * sm(0.04, 0.25, inland);
      // 서쪽 정글 폭포 언덕(섬에서 제일 높은 곳 — 석호와 바다가 한눈에)
      const jh = sm(0.2, 0.05, Math.hypot(lx + 0.68, lz - 0.05));
      if (jh > 0) h += steps(jh * 18, 6, jh);
      const lagoon = sm(0.44, 0.27, rc);
      h = h * (1 - lagoon) + -3.2 * lagoon;
      kind = h < 2.2 ? 'sand' : jh > 0.2 ? 'jungle' : 'grass';
      // 동쪽 맹그로브 수로: 바다와 석호를 잇는 구불구불한 얕은 물길(서로 엇갈려 작은 미로)
      const M = sm(0.36, 0.56, lx) * sm(0.62, 0.42, Math.abs(lz));
      if (lx > 0.3) {
        const dist = mangroveDist(x, z);
        if (dist < 30) {
          const hc = -1.1 + (h + 1.1) * sm(MANGROVE_HALF_W, MANGROVE_HALF_W + Math.max(4, (h + 1.1) * 1.1), dist);
          if (hc < h) h = hc;
        }
      }
      if (M > 0.3) kind = 'jungle';
      if (h < 0) seaWater = true;
      break;
    }
    case 'desert': {
      // 바람결 모래 언덕 + 층층이 붉은 메사
      const wv = n1(x * 0.004 + 3, z * 0.004) * 3;
      const dune = Math.pow(ridge(Math.sin(x * 0.022 + z * 0.008 + wv)), 2.2) * 7 * (0.6 + 0.4 * n2(x * 0.003, z * 0.003));
      // 북쪽 협곡 미로 구역(메사·모래 언덕 대신 깎아지른 미로 벽)
      const CY = CANYON_UV;
      const P = sm(0.34, 0.24, Math.hypot(lx - CY.u, (lz - CY.v) * 1.15)) * sm(0.03, 0.12, inland);
      const mv = sm(0.36, 0.66, n2(x * 0.0045 + 5, z * 0.0045 + 9)) * sm(0.05, 0.25, inland) * (1 - P);
      const mesa = mv * 46;
      const mesaT = steps(mesa, 11.5, sm(0.0, 0.2, mv), 0.3); // 벽을 조금 눕혀 1 m 격자 계단이 덜 보이게
      h = base + dune * sm(0.02, 0.2, inland) * (1 - mv) * (1 - P * 0.8) + mesaT;
      kind = mv > 0.4 ? 'rock' : 'desert';
      rock = sm(0.25, 0.6, mv);
      if (P > 0) {
        // 두 노이즈의 등고선(0 근처)이 서로 엇갈려 길이 갈라지고 막힌다
        const f = Math.min(Math.abs(n1(x * 0.011 + 211, z * 0.011 - 97)), Math.abs(n2(x * 0.009 - 53, z * 0.013 + 29)) * 1.1);
        const wallT = sm(0.07, 0.13, f);
        h += P * (18 * wallT + 1.2 * n3(x * 0.05, z * 0.05) * wallT);
        rock = Math.max(rock, P * wallT);
        if (P > 0.06) {
          if (wallT > 0.04 && wallT < 0.96) forced = 'cliff';
          else if (wallT >= 0.96) kind = 'rock';
        }
      }
      // 남쪽 화석층 절벽(줄무늬 바위 벼랑 — 꼭대기에 완전한 티라노 화석)
      h += coastCliff(sm(0.4, 0.6, lz) * sm(0.75, 0.45, Math.abs(lx)), 16);
      break;
    }
    case 'launch': {
      // 해안 절벽 위 넓은 고원(발사대)
      const pl = sm(0.03, 0.12, inland) * 26;
      h = base + steps(pl, 13, 1) + Math.max(0, hill) * 2;
      // 북쪽 천문대 언덕(둥근 동산, 꼭대기 평평)
      const OH = OBS_HILL_UV;
      const oh = sm(0.25, 0.07, Math.hypot(lx - OH.u, lz - OH.v));
      h += 16 * oh;
      // 동쪽 크레이터: 둥근 테두리 둑 + 사발처럼 꺼진 바닥(크레이터 호수가 고인다)
      const CR = CRATER_UV;
      const cd = Math.hypot(lx - CR.u, lz - CR.v) * d.r / CR.r; // 크레이터 반경 단위
      const rimUp = 6 * Math.exp(-((cd - 1.45) * (cd - 1.45)) / 0.12);
      const bowl = 12 * sm(1.3, 0.25, cd);
      h += rimUp - bowl;
      if (cd < 1.9) rock = Math.max(rock, 0.5 * sm(1.9, 1.2, cd));
      if (oh > 0.4) kind = 'grass';
      break;
    }
    case 'islet': {
      h = base + Math.pow(Math.max(0, 1 - rc), 1.4) * 7 * (0.7 + 0.3 * hill);
      break;
    }
  }
  // 해변: 물가에서 0 → BEACH 안쪽에서 육지 높이로
  const beachH = -0.3 + 1.4 * sm(0, 1, c / BEACH);
  h = beachH * (1 - beachT) + h * beachT;
  wallAmp *= sm(0.6, 1, beachT);
  if (c < BEACH * 0.7 && d.theme !== 'ice') kind = d.theme === 'desert' ? 'desert' : 'sand';
  if (c < BEACH * 0.7 && d.theme === 'ice') kind = iceBayIn(x, z) > -80 && bergCoast(x, z) < -6 ? 'sand' : 'snow'; // 펭귄 해변(남동 만)만 모래
  if (forced) kind = forced;
  return { h, kind, terr, wallAmp, rock, special, band, seaWater };
}

/** 지형 특징 위치(섬 중심 기준 비율 좌표) — 생성기와 장소 표가 같이 쓴다 */
const TINO_HILL_UV = { u: 0.05, v: -0.02 };
const GEYSER_VALLEY_UV = { u: 0.12, v: 0.14 };
const CANYON_UV = { u: 0.0, v: -0.55 };
const OBS_HILL_UV = { u: 0.0, v: -0.55 };
/** 크레이터(발사대 섬 동쪽 호수와 같은 자리, r = 호수 반경 m) */
const CRATER_UV = { u: 0.5, v: 0.02, r: 34 };

/** 산호빛섬 동쪽 맹그로브 수로(섬 비율 좌표, 바다 → 석호). 강처럼 촘촘히 펴서 둑 기울기를 일정하게 한다. */
const MANGROVE_HALF_W = 3.4;
const MANGROVE_DEFS: Array<Array<[number, number]>> = [
  [[1.08, -0.2], [0.9, -0.24], [0.78, -0.16], [0.66, -0.2], [0.52, -0.12], [0.38, -0.1]],
  [[1.08, 0.05], [0.92, 0.1], [0.8, 0.02], [0.68, 0.06], [0.55, 0.0], [0.38, 0.02]],
  [[1.05, 0.3], [0.9, 0.26], [0.78, 0.34], [0.64, 0.24], [0.52, 0.2], [0.4, 0.12]],
  // 수로끼리 잇는 샛길
  [[0.78, -0.16], [0.79, -0.07], [0.8, 0.02]],
  [[0.68, 0.06], [0.63, 0.15], [0.64, 0.24]],
];
const MANGROVE = (() => {
  const segs: Array<[number, number, number, number]> = [];
  for (const def of MANGROVE_DEFS) {
    const P = def.map(([u, v]) => uv('coral', u, v));
    let prev: { x: number; z: number } | null = null;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 8));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        let x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        // 양끝(연결점)은 그대로, 가운데만 노이즈로 굽이
        const w = Math.sin(Math.PI * t) * 7 * n2(x * 0.02 + 9, z * 0.02 - 4);
        const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        x += (-(b.z - a.z) / l) * w; z += ((b.x - a.x) / l) * w;
        if (prev && Math.hypot(x - prev.x, z - prev.z) > 1e-3) segs.push([prev.x, prev.z, x, z]);
        prev = { x, z };
      }
    }
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [ax, az, bx, bz] of segs) { minX = Math.min(minX, ax, bx); maxX = Math.max(maxX, ax, bx); minZ = Math.min(minZ, az, bz); maxZ = Math.max(maxZ, az, bz); }
  // 칸(CELL m)마다 REACH m 안에 걸치는 선분 목록 — 한 점 질의는 자기 칸만 본다
  const CELL = 32, REACH = 32;
  const x0 = minX - REACH, z0 = minZ - REACH;
  const nx = Math.ceil((maxX - minX + 2 * REACH) / CELL), nz = Math.ceil((maxZ - minZ + 2 * REACH) / CELL);
  const grid: number[][] = Array.from({ length: nx * nz }, () => []);
  segs.forEach(([ax, az, bx, bz], i) => {
    const i0 = Math.floor((Math.min(ax, bx) - REACH - x0) / CELL), i1 = Math.floor((Math.max(ax, bx) + REACH - x0) / CELL);
    const j0 = Math.floor((Math.min(az, bz) - REACH - z0) / CELL), j1 = Math.floor((Math.max(az, bz) + REACH - z0) / CELL);
    for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) for (let k = Math.max(0, i0); k <= Math.min(nx - 1, i1); k++) grid[j * nx + k].push(i);
  });
  return { segs, grid, x0, z0, nx, nz, CELL };
})();
/** 맹그로브 수로 중심선까지 거리(m, 32 m 보다 멀면 1e9) */
function mangroveDist(x: number, z: number): number {
  const G = MANGROVE;
  const i = Math.floor((x - G.x0) / G.CELL), j = Math.floor((z - G.z0) / G.CELL);
  if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return 1e9;
  let d = 1e9;
  for (const k of G.grid[j * G.nx + i]) {
    const [ax, az, bx, bz] = G.segs[k];
    d = Math.min(d, segDist(x, z, ax, az, bx, bz));
  }
  return d;
}

function rawLand(d: IslandDef, x: number, z: number): number {
  const c = islandCoast(d, x, z);
  if (c < 0) return -1;
  return landRaw(d, x, z, c).h;
}

// ── 바다 지형: 난파선 둔덕·모래톱·해구·가장자리 고리 ─────────────────
/** 바다 장소 아래 해저를 정해진 깊이로 돋운다(GDD 2.4 깊이) */
const SEABED_PADS: Array<{ x: number; z: number; r: number; depth: number }> = [
  { x: -650, z: 650, r: 30, depth: -14 }, // 꿀꺽호
  { x: -2700, z: 2000, r: 35, depth: -20 }, // 으스스호
  { x: 1100, z: -2900, r: 26, depth: -30 }, // 별빛 탐사선
];
/** 썰물 모래톱 길(산호빛섬 → 쪼꼬미섬 C): 물 바로 아래(−0.7 m) 얕은 모래 둑 */
const SANDBAR = (() => {
  const a = ISLANDS.find((q) => q.id === 'coral')!, b = ISLANDS.find((q) => q.id === 'islet-c')!;
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  return { ax: a.x + ux * a.r * 0.9, az: a.z + uz * a.r * 0.9, bx: b.x - ux * b.r * 0.8, bz: b.z - uz * b.r * 0.8, halfW: 7, depth: -0.7 };
})();

function seaFloor(x: number, z: number, off: number): number {
  let h = Math.max(SEA_FLOOR, -0.3 - off * 0.09 - Math.max(0, off - 80) * 0.12) + n1(x * 0.01, z * 0.01) * 1.5 * sm(0, 30, off);
  // 모래톱
  const S = SANDBAR;
  if (x > Math.min(S.ax, S.bx) - 60 && x < Math.max(S.ax, S.bx) + 60 && z > Math.min(S.az, S.bz) - 60 && z < Math.max(S.az, S.bz) + 60) {
    const sd = segDist(x, z, S.ax, S.az, S.bx, S.bz);
    const w = sm(S.halfW + 30, S.halfW, sd);
    if (w > 0) {
      const t = S.depth + 0.25 * n2(x * 0.03, z * 0.03);
      h += (Math.max(h, t) - h) * w;
    }
  }
  // 난파선 둔덕
  for (const p of SEABED_PADS) {
    const dd = Math.hypot(x - p.x, z - p.z);
    if (dd > p.r + 100) continue;
    const w = sm(p.r + 90, p.r, dd);
    h += (Math.max(h, p.depth + 0.6 * n2(x * 0.05, z * 0.05)) - h) * w;
  }
  // 꼬르륵 해구: 가장자리 −60 → 가운데 −120 (섬 둘레 120 m 는 해안 비탈을 지킨다)
  const tw = trenchAt(x, z) * sm(0, 120, off);
  if (tw > 0) {
    const e = Math.hypot((x - TRENCH.x) / TRENCH.rx, (z - TRENCH.z) / TRENCH.rz);
    const td = TRENCH.edgeDepth + (TRENCH.floor - TRENCH.edgeDepth) * sm(1, 0, e) + 3 * n2(x * 0.004, z * 0.004);
    h += (Math.min(h, td) - h) * tw;
  }
  // 월드 가장자리 고리: 원점에서 3700 m 밖은 점점 깊어진다
  const ro = Math.hypot(x, z);
  if (ro > EDGE_RING.r0 - 120) {
    const w = sm(EDGE_RING.r0 - 100, EDGE_RING.r0 + 100, ro);
    const ed = EDGE_RING.depth + (EDGE_RING.deepest - EDGE_RING.depth) * sm(EDGE_RING.r0 + 100, EDGE_RING.r0 + 900, ro);
    h += (Math.min(h, ed) - h) * w;
  }
  return h;
}

/** 세계 높이(마을 제외). 가장 가까운(해안 거리가 가장 큰) 섬이 결정한다. */
export function worldSample(x: number, z: number): WorldSample {
  let best: IslandDef | null = null, bestC = -Infinity;
  for (const d of ISLANDS) {
    const dx = x - d.x, dz = z - d.z;
    if (Math.abs(dx) > d.r * 1.6 + 400 || Math.abs(dz) > d.r * 1.6 + 400) continue;
    const c = islandCoast(d, x, z);
    if (c > bestC) { bestC = c; best = d; }
  }
  if (!best || bestC < 0) {
    // 바다: 해안에서 멀어질수록 깊어진다(얕은 바다 → 심해 → 해구)
    const off = best ? -bestC : 400;
    return { h: seaFloor(x, z, off), coast: best ? bestC : -400, island: best, kind: 'sea', inland: 0, water: 0 };
  }
  const L = landRaw(best, x, z, bestC);
  const w = carveWater(best, x, z, L.h, bestC);
  let kind = L.kind;
  let water = w.water;
  // 바다와 이어진 물(석호·맹그로브 수로)은 바다 높이 0
  if (L.seaWater && w.h < 0) water = Math.max(water, 0);
  // 폭포 벽(물이 떨어지는 계단 면)은 절벽
  if (w.fall) kind = 'cliff';
  else if (water > w.h) kind = 'river';
  else if (L.band && kind !== 'cliff') {
    // 큰 계단 벽: 실제로 가파르면 절벽(걸어 오르는 비탈이 아니다)
    const e = 0.7;
    const hx = landRaw(best, x + e, z, islandCoast(best, x + e, z)).h - L.h;
    const hz = landRaw(best, x, z + e, islandCoast(best, x, z + e)).h - L.h;
    if (Math.hypot(hx, hz) / e > 1.6) kind = 'cliff';
  }
  return {
    h: w.h, coast: bestC, island: best, kind, inland: Math.min(1, bestC / best.r),
    terr: L.terr, wallAmp: L.wallAmp, rock: L.rock, special: Math.max(L.special, w.special), water, waterRef: L.seaWater ? Math.max(w.ref, 0) : w.ref,
  };
}

/** 섬 안 호수·강 물 높이(물이 없으면 -Infinity). 바다는 따로(0). */
export function inlandWaterAt(x: number, z: number): number {
  const s = worldSample(x, z);
  if (s.coast < 0) return -Infinity;
  return s.water !== undefined && s.water > s.h ? s.water : -Infinity;
}

/** 이 자리의 호수(물 안쪽이면) — 낚시 구역·물색 판정용 */
export function lakeAt(x: number, z: number): LakeInfo | null {
  for (const L of worldLakes()) {
    if (Math.abs(x - L.x) > L.r * 1.4 || Math.abs(z - L.z) > L.r * 1.4) continue;
    if (lakeEdge(L, x, z) > 0) return L;
  }
  return null;
}

export function islandById(id: string): IslandDef | undefined {
  return ISLANDS.find((d) => d.id === id);
}

/** 어느 섬 위(또는 가장 가까운 섬 앞바다)인가 */
export function islandAt(x: number, z: number): IslandDef | null {
  return worldSample(x, z).island;
}

/** 섬 안에서 걸어갈 수 있는 땅 위 임의 지점들(시드 고정) — 스폰·배치용. 물·절벽·용암은 건너뛴다. */
export function islandSpawnPoints(id: string, count: number, minInland = 0.05): Array<{ x: number; z: number }> {
  const d = islandById(id);
  if (!d) return [];
  const rnd = mulberry32(d.seed * 7919);
  const out: Array<{ x: number; z: number }> = [];
  let tries = 0;
  while (out.length < count && tries++ < count * 50) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * d.r;
    const x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
    const s = worldSample(x, z);
    if (s.island !== d || s.coast <= 0 || s.inland < minInland) continue;
    if ((s.water ?? -Infinity) > s.h || s.kind === 'cliff' || s.kind === 'lava') continue;
    out.push({ x, z });
  }
  return out;
}

// ── 자리 찾기(장소 표가 지형을 보고 정한다 — 결정적) ───────────────────
const H = (x: number, z: number) => worldSample(x, z).h;
/** 물·절벽·용암이 아닌 마른 땅인가 */
function dryLand(x: number, z: number, minH = 0.6): boolean {
  const s = worldSample(x, z);
  return s.coast > 0 && s.h > minH && !((s.water ?? -Infinity) > s.h - 0.05) && s.kind !== 'cliff' && s.kind !== 'lava' && s.kind !== 'river';
}
function gradAt(x: number, z: number, e = 1.5): { gx: number; gz: number; g: number } {
  const gx = (H(x + e, z) - H(x - e, z)) / (2 * e), gz = (H(x, z + e) - H(x, z - e)) / (2 * e);
  return { gx, gz, g: Math.hypot(gx, gz) };
}
/** 평평한 마른 땅(반경 rad 안 높이 차 maxD 이하) */
function flatAt(x: number, z: number, rad: number, maxD: number): boolean {
  if (!dryLand(x, z)) return false;
  const h0 = H(x, z);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
    if (!dryLand(px, pz) || Math.abs(H(px, pz) - h0) > maxD) return false;
  }
  return true;
}
/** 씨앗 자리에서 나선으로 넓혀 가며 조건을 처음 만족하는 곳 */
function findSpot(x0: number, z0: number, ok: (x: number, z: number) => boolean, maxR = 160, step = 4): { x: number; z: number } | null {
  if (ok(x0, z0)) return { x: x0, z: z0 };
  for (let r = step; r <= maxR; r += step) {
    const n = Math.max(6, Math.round((2 * Math.PI * r) / step));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
      if (ok(x, z)) return { x, z };
    }
  }
  return null;
}
const faceTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
const r2 = (v: number) => Math.round(v * 100) / 100;
type Spot = { x: number; z: number; rotY: number; island: string };
/** 평평한 자리(못 찾으면 가장 가까운 마른 땅, 그래도 없으면 씨앗) — rotY 는 face 쪽을 본다 */
function flatSpot(island: string, x0: number, z0: number, face: { x: number; z: number } | null, rad = 5, maxD = 0.8): Spot {
  const p = findSpot(x0, z0, (x, z) => flatAt(x, z, rad, maxD)) ?? findSpot(x0, z0, (x, z) => dryLand(x, z), 240) ?? { x: x0, z: z0 };
  const d = islandById(island);
  const to = face ?? (d ? { x: p.x + (p.x - d.x), z: p.z + (p.z - d.z) } : { x: 0, z: 0 });
  return { x: r2(p.x), z: r2(p.z), rotY: r2(faceTo(p, to)), island };
}
/** 동굴 입구: 등 뒤로 땅이 크게 솟은 비탈 아래 마른 땅 — rotY 는 입구가 열린 쪽(내리막) */
function caveSpot(island: string, x0: number, z0: number, maxR = 200): Spot {
  const ok = (x: number, z: number) => {
    if (!dryLand(x, z, 0.8)) return false;
    const g = gradAt(x, z);
    if (g.g < 0.12 || g.g > 1.1) return false;
    const ux = g.gx / g.g, uz = g.gz / g.g;
    const up = H(x + ux * 9, z + uz * 9) - H(x, z);
    return up > 4.5 && dryLand(x - ux * 4, z - uz * 4, 0.6);
  };
  const p = findSpot(x0, z0, ok, maxR) ?? findSpot(x0, z0, (x, z) => dryLand(x, z), 240) ?? { x: x0, z: z0 };
  const g = gradAt(p.x, p.z);
  const rotY = g.g > 1e-4 ? Math.atan2(-g.gx, -g.gz) : 0;
  return { x: r2(p.x), z: r2(p.z), rotY: r2(rotY), island };
}

/** 섬 중심에서 각도 ang 방향으로 걸어 나가며 해안 거리가 coast 이상인 가장 바깥 땅(village/landmarks.ts 의 spot 과 같은 식) */
export function coastSpot(id: string, ang: number, coast: number): { x: number; z: number } {
  const d = islandById(id)!;
  let best = { x: d.x, z: d.z };
  for (let r = 0; r < d.r * 1.6; r += 3) {
    const x = d.x + Math.cos(ang) * r, z = d.z + Math.sin(ang) * r;
    const s = worldSample(x, z);
    if (s.island?.id === id && s.coast >= coast) best = { x, z };
  }
  return best;
}

/** 섬 등대 자리: 원점(말랑섬)을 바라보는 해안. 말랑섬은 기존 등대 자리 spot('home', 0.75, 10) 그대로. */
export function lighthouseSpot(id: string): { x: number; z: number; rotY: number } {
  const d = islandById(id)!;
  if (id === 'home') { const p = coastSpot('home', 0.75, 10); return { ...p, rotY: 0.5 }; }
  // 원점 쪽 해안 — 도착 부두와 45m 안이면 각도를 조금씩 비껴 다음 해안점(등대와 잔교가 겹치지 않게)
  const a0 = Math.atan2(-d.z, -d.x), dock = PLACES.docks[id];
  let p = coastSpot(id, a0, 10);
  for (let k = 1; dock && Math.hypot(p.x - dock.x, p.z - dock.z) < 45 && k <= 8; k++) {
    const q = coastSpot(id, a0 + (k % 2 ? 1 : -1) * 0.15 * Math.ceil(k / 2), 10);
    if (Math.hypot(q.x - dock.x, q.z - dock.z) >= 45) p = q;
  }
  return { ...p, rotY: faceTo(p, { x: 0, z: 0 }) };
}

/** 등대를 세우는 섬 7개 */
export const LIGHTHOUSE_ISLANDS = ['home', 'dino', 'ice', 'mushroom', 'coral', 'desert', 'launch'] as const;

/** 다리 자리: 말랑섬 큰 강(마을 북쪽 구간)에서 폭포가 아니고 양쪽 둑이 마른 평지인 곳 3군데 */
function computeBridges(): Array<{ x: number; z: number; rot: number; len: number }> {
  const R = worldRivers().find((r) => r.island === 'home')!;
  const cand: Array<{ x: number; z: number; rot: number; len: number; score: number }> = [];
  const P = R.pts;
  for (let i = 2; i < P.length - 3; i++) {
    const a = P[i - 1], b = P[i + 1], p = P[i];
    if (Math.abs(a.level - b.level) > 0.3) continue; // 폭포 마디
    const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz);
    const cx = -tz / tl, cz = tx / tl; // 강을 가로지르는 방향
    // 양쪽으로 걸어가며 물이 끝나는 둑을 찾는다
    const bank = (sgn: number) => {
      for (let s = 0; s < 30; s += 0.5) {
        const x = p.x + cx * s * sgn, z = p.z + cz * s * sgn;
        if (dryLand(x, z, 0.4)) return s;
      }
      return -1;
    };
    const s1 = bank(1), s2 = bank(-1);
    if (s1 < 0 || s2 < 0) continue;
    const e1 = { x: p.x + cx * (s1 + 1), z: p.z + cz * (s1 + 1) }, e2 = { x: p.x - cx * (s2 + 1), z: p.z - cz * (s2 + 1) };
    if (!dryLand(e1.x, e1.z) || !dryLand(e2.x, e2.z)) continue;
    const dh = Math.abs(H(e1.x, e1.z) - H(e2.x, e2.z));
    if (dh > 1.2) continue;
    const mx = (e1.x + e2.x) / 2, mz = (e1.z + e2.z) / 2;
    // 마을(원점)에서 가까운 곳 + 양쪽 둑 높이가 비슷한 곳을 고른다
    cand.push({ x: mx, z: mz, rot: Math.atan2(cx, cz), len: s1 + s2 + 2, score: Math.hypot(mx, mz) + dh * 60 });
  }
  cand.sort((p, q) => p.score - q.score);
  const out: Array<{ x: number; z: number; rot: number; len: number }> = [];
  for (const c of cand) {
    if (out.length >= 3) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 70)) continue;
    out.push({ x: r2(c.x), z: r2(c.z), rot: r2(c.rot), len: r2(c.len) });
  }
  return out;
}

/** 큰 폭포(말랑섬 큰 강에서 물 높이가 가장 크게 떨어지는 마디) */
function bigWaterfall(): { x: number; z: number; drop: number; dir: { x: number; z: number } } {
  const R = worldRivers().find((r) => r.island === 'home')!;
  let bi = 0, bd = -1;
  for (let i = 0; i < R.pts.length - 1; i++) { const dr = R.pts[i].level - R.pts[i + 1].level; if (dr > bd) { bd = dr; bi = i; } }
  const a = R.pts[bi], b = R.pts[bi + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: a.x + (b.x - a.x) * 0.67, z: a.z + (b.z - a.z) * 0.67, drop: bd, dir: { x: (b.x - a.x) / l, z: (b.z - a.z) / l } };
}

type HiddenSpot = { x: number; z: number; island: string; /** 물속·물 위에 있는 숨은 곳 */ water?: boolean };
function computeHidden(): Record<SecretId, HiddenSpot> {
  const land = (island: string, u: number, v: number, rad = 3, maxD = 1.2): HiddenSpot => {
    const p = uv(island, u, v), s = flatSpot(island, p.x, p.z, null, rad, maxD);
    return { x: s.x, z: s.z, island };
  };
  const cave = (island: string, u: number, v: number): HiddenSpot => { const p = uv(island, u, v), s = caveSpot(island, p.x, p.z); return { x: s.x, z: s.z, island }; };
  const lake = (kind: LakeKind, island: string): HiddenSpot => {
    const L = worldLakes().find((q) => q.kind === kind && q.island === island)!;
    return { x: r2(L.x), z: r2(L.z), island, water: true };
  };
  // 해안 가까운 마른 땅(각도 ang 방향 해안 거리 ≈ cst)
  const shore = (island: string, ang: number, cst: number): HiddenSpot => {
    const d = islandById(island)!;
    let p = { x: d.x, z: d.z };
    for (let r = 0; r < d.r * 1.6; r += 2) {
      const x = d.x + Math.cos(ang) * r, z = d.z + Math.sin(ang) * r;
      const s = worldSample(x, z);
      if (s.island?.id === island && s.coast >= cst && dryLand(x, z)) p = { x, z };
    }
    return { x: r2(p.x), z: r2(p.z), island };
  };
  const wf = bigWaterfall();
  // 폭포 아래 둑(물이 떨어지는 벽 바로 옆 마른 땅)
  const wfp = findSpot(wf.x + wf.dir.x * 6, wf.z + wf.dir.z * 6, (x, z) => dryLand(x, z), 40, 1.5) ?? { x: wf.x, z: wf.z };
  const crater = uv('dino', 0, -0.33 - 0.058);
  const lavaGarden = findSpot(crater.x, crater.z, (x, z) => { const s = worldSample(x, z); return s.kind !== 'lava' && s.coast > 0 && s.h > 0.5 && s.kind !== 'cliff' && gradAt(x, z).g < 1.0; }, 40, 2) ?? crater;
  const coralD = islandById('coral')!, isC = islandById('islet-c')!;
  return {
    'home-waterfall-cave': { x: r2(wfp.x), z: r2(wfp.z), island: 'home' },
    'home-cliff-beach': shore('home', -Math.PI / 2 - 0.05, 9),
    'home-fairy-ring': land('home', -0.36, -0.06, 6, 0.6),
    'dino-lava-garden': { x: r2(lavaGarden.x), z: r2(lavaGarden.z), island: 'dino' },
    'dino-mural-cave': cave('dino', -0.52, -0.42),
    'dino-bubble-cave': shore('dino', Math.PI + 0.35, 6),
    'ice-mammoth': cave('ice', -0.3, -0.62),
    'ice-aurora-cave': cave('ice', -0.62, -0.34),
    'ice-avalanche': land('ice', 0.3, -0.24, 3, 2.5),
    'mush-moon-deck': land('mushroom', 0.0, -0.05),
    'mush-swamp-hut': lake('swamp', 'mushroom'),
    'mush-tree-room': land('mushroom', -0.18, -0.45, 4, 1),
    'coral-clam': { x: coralD.x, z: coralD.z, island: 'coral', water: true },
    'coral-pirate-cave': shore('coral', Math.PI * 0.75, 5),
    'coral-sandbar': shore('coral', Math.atan2(isC.z - coralD.z, isC.x - coralD.x), 8),
    'desert-temple': land('desert', 0.36, 0.12, 6, 1.5),
    'desert-water-cave': (() => { const p = uv('desert', CANYON_UV.u, CANYON_UV.v); const q = findSpot(p.x, p.z, (x, z) => dryLand(x, z) && worldSample(x, z).rock! < 0.2 && H(x, z) < 4 && gradAt(x, z).g < 1.0, 160, 2) ?? p; return { x: r2(q.x), z: r2(q.z), island: 'desert' }; })(),
    'desert-trex': land('desert', 0.0, 0.6, 3, 1.5),
    'launch-meteorite': lake('crater', 'launch'),
    'launch-glide': shore('launch', Math.PI / 2, 60),
    'launch-probe': { x: 1100, z: -2900, island: 'launch', water: true },
  };
}

/** 섬 시설(GDD 3.12 P1 특산 시설 + 물약 가게·스키 리프트) */
type FacilityId = 'apiary' | 'divingCenter' | 'fireflyGarden' | 'fossilLab' | 'iceHut' | 'bazaar' | 'observatory' | 'potionShop' | 'skiLift';
function computeFacilities(): Record<FacilityId, Spot> {
  const at = (island: string, u: number, v: number, rad = 6, maxD = 0.9) => { const p = uv(island, u, v); return flatSpot(island, p.x, p.z, null, rad, maxD); };
  const dk = PLACES.docks;
  const iceLake = worldLakes().find((l) => l.island === 'ice' && l.kind === 'icelake')!;
  const coralD = islandById('coral')!;
  // 다이빙 센터: 산호빛섬 부두에서 섬 안쪽 30 m 해변
  const dc = { x: dk.coral.x + (coralD.x - dk.coral.x) * 0.08, z: dk.coral.z + (coralD.z - dk.coral.z) * 0.08 };
  const obs = uv('launch', OBS_HILL_UV.u, OBS_HILL_UV.v);
  return {
    apiary: at('home', -0.6, -0.28),
    divingCenter: flatSpot('coral', dc.x, dc.z, dk.coral, 5, 0.8),
    fireflyGarden: at('mushroom', 0.12, 0.36),
    fossilLab: at('dino', -0.72, 0.04, 7),
    iceHut: flatSpot('ice', iceLake.x + iceLake.r + 10, iceLake.z, { x: iceLake.x, z: iceLake.z }, 4, 0.8),
    bazaar: at('desert', -0.58, 0.06, 7),
    observatory: flatSpot('launch', obs.x, obs.z, { x: 0, z: 0 }, 6, 1.0),
    potionShop: at('mushroom', 0.56, -0.08, 5),
    skiLift: at('ice', -0.12, -0.02, 5, 1.2),
  };
}

/** 동굴 입구(섬마다 1~3, 안은 P1) */
function computeCaves(): Array<Spot & { id: string }> {
  const seeds: Array<[string, number, number]> = [
    ['home', -0.12, -0.62], ['home', 0.3, -0.38], ['home', -0.5, -0.4],
    ['dino', 0.3, -0.42], ['dino', -0.3, -0.2],
    ['ice', 0.2, -0.55], ['ice', -0.25, -0.1],
    ['mushroom', 0.2, -0.3], ['mushroom', -0.3, 0.3],
    ['coral', -0.7, 0.1],
    ['desert', 0.25, -0.5], ['desert', -0.3, 0.45],
    ['launch', -0.3, 0.3], ['launch', 0.1, -0.4],
  ];
  const count: Record<string, number> = {};
  return seeds.map(([island, u, v]) => {
    const p = uv(island, u, v), s = caveSpot(island, p.x, p.z);
    count[island] = (count[island] ?? 0) + 1;
    return { id: `cave:${island}:${count[island]}`, ...s };
  });
}

const lazy = <T>(f: () => T) => { let v: T | undefined; return () => (v ??= f()); };
const lzLighthouses = lazy(() => Object.fromEntries(LIGHTHOUSE_ISLANDS.map((id) => {
  const p = lighthouseSpot(id);
  return [id, { x: r2(p.x), z: r2(p.z), rotY: r2(p.rotY), island: id }];
})) as Record<(typeof LIGHTHOUSE_ISLANDS)[number], Spot>);
const lzBridges = lazy(computeBridges);
const lzHidden = lazy(computeHidden);
const lzFacilities = lazy(computeFacilities);
const lzCaves = lazy(computeCaves);
// 조선소: 부두(boatDock) 동쪽 남동 해변 모래 위
const lzShipyard = lazy((): Spot => {
  const ok = (x: number, z: number) => { const s = worldSample(x, z); return x > 54 && s.kind === 'sand' && s.coast > 3 && s.coast < 14 && s.h > 0.5 && !((s.water ?? -Infinity) > s.h); };
  const p = findSpot(56, 4, ok, 220, 2) ?? { x: 56, z: 4 };
  return { x: r2(p.x), z: r2(p.z), rotY: r2(faceTo(p, { x: p.x + 1, z: p.z + 1.6 })), island: 'home' };
});
// 집터(증축 집) + 그 앞 우체통: 마을 북동쪽 평지
const lzHouse = lazy((): Spot => flatSpot('home', 32, -78, { x: 0, z: 0 }, 9, 0.5));
const lzMailbox = lazy((): Spot => {
  const h = lzHouse();
  // 집 정면(마을 쪽) 7 m, 오른쪽 3 m
  const fx = Math.sin(h.rotY), fz = Math.cos(h.rotY);
  const p = { x: h.x + fx * 7 + fz * 3, z: h.z + fz * 7 - fx * 3 };
  const q = findSpot(p.x, p.z, (x, z) => dryLand(x, z), 20, 1) ?? p;
  return { x: r2(q.x), z: r2(q.z), rotY: h.rotY, island: 'home' };
});
// 펭박사 연구소: 발사대 옆 고원 평지(격납고·관제탑과 겹치지 않게 북서쪽)
const lzPengLab = lazy((): Spot => {
  const L = { x: 300, z: -2380 };
  const ok = (x: number, z: number) => flatAt(x, z, 7, 0.8) && Math.hypot(x - (L.x - 50), z - (L.z + 40)) > 30 && Math.hypot(x - (L.x + 55), z - (L.z + 48)) > 30 && Math.hypot(x - L.x, z - L.z) > 35;
  const p = findSpot(L.x - 70, L.z - 30, ok, 160) ?? { x: L.x - 70, z: L.z - 30 };
  return { x: r2(p.x), z: r2(p.z), rotY: r2(faceTo(p, L)), island: 'launch' };
});
const lzTinoHill = lazy(() => { const p = uv('dino', TINO_HILL_UV.u, TINO_HILL_UV.v); return { x: r2(p.x), z: r2(p.z), r: r2(0.085 * 650 * 0.6), island: 'dino' }; });
const lzCrater = lazy(() => { const L = worldLakes().find((l) => l.kind === 'crater')!; return { x: r2(L.x), z: r2(L.z), r: L.r, level: L.level, island: 'launch' }; });

/** 담당끼리 약속한 장소(건물·탈것 정류장·발사대). village 가 짓고, economy·vehicles·space 가 기능을 붙인다. y 는 heightAt 로.
 *  지형을 보고 정하는 자리(등대·다리·시설·동굴·숨은 곳 …)는 처음 읽을 때 한 번 계산한다(시드 고정, 결정적). */
export const PLACES = {
  /** 시작 마을 */
  shop: { x: 8, z: -12, rotY: -0.5, island: 'home' },
  museum: { x: -26, z: -40, rotY: 0.3, island: 'home' },
  workbench: { x: 12, z: -3, rotY: -1.2, island: 'home' },
  townBoard: { x: 4, z: 6, rotY: 0, island: 'home' },
  /** 시작 섬 남동 해변 부두(배 타는 곳) */
  pier: { x: 20, z: 12, rotY: -0.9, island: 'home' },
  boatDock: { x: 27, z: 18, rotY: -0.9, island: 'home' },
  bikeRack: { x: 6, z: 3, rotY: 0.4, island: 'home' },
  /** 섬마다 도착 부두(배가 대는 곳) — 해안 쪽 대략 */
  docks: {
    dino: { x: 1180, z: -760 }, ice: { x: -1380, z: -1290 }, mushroom: { x: -1290, z: 960 },
    coral: { x: 560, z: 1260 }, desert: { x: 2160, z: 880 }, launch: { x: 300, z: -1930 },
  } as Record<string, { x: number; z: number }>,
  /** 발사대 섬 로켓 */
  launchPad: { x: 300, z: -2380, rotY: 0, island: 'launch' },

  /** 조선소(말랑섬 남동 해변 모래, 부두 동쪽) — 배 상점·배 소환 */
  get shipyard(): Spot { return lzShipyard(); },
  /** 내 집 터(마을 북동쪽 평지, 증축 단계 house:1-4) — rotY 는 마을을 본다 */
  get house(): Spot { return lzHouse(); },
  /** 집 앞 우체통(아침 우편) */
  get mailbox(): Spot { return lzMailbox(); },
  /** 펭박사 연구소(발사대 옆) */
  get pengLab(): Spot { return lzPengLab(); },
  /** 섬마다 등대(원점 쪽 해안). 말랑섬은 기존 등대 자리. */
  get lighthouses(): Record<(typeof LIGHTHOUSE_ISLANDS)[number], Spot> { return lzLighthouses(); },
  /** 말랑섬 큰 강 다리 3: rot 은 다리 길이 방향(로컬 +z 가 강을 가로지른다, rotY 문법), len 은 둑에서 둑까지 + 여유 */
  get bridges(): Array<{ x: number; z: number; rot: number; len: number }> { return lzBridges(); },
  /** 부표 우체통 6(GDD 2.4 ①~⑥) */
  buoyMail: [
    { id: 'buoy-1', x: 800, z: -480 },
    { id: 'buoy-2', x: 450, z: 760 },
    { id: 'buoy-3', x: -880, z: 560 },
    { id: 'buoy-4', x: -1000, z: -1060 },
    { id: 'buoy-5', x: 2200, z: 80 },
    { id: 'buoy-6', x: -200, z: -1500 },
  ] as ReadonlyArray<{ id: string; x: number; z: number }>,
  /** 바다 장소(GDD 2.4) — depth 는 그 아래 해저 높이(world 가 둔덕을 돋운다) */
  wreck: { x: -650, z: 650, depth: -14, name: '꿀꺽호' },
  ghostShip: { x: -2700, z: 2000, depth: -20, name: '으스스호' },
  ufoWreck: { x: 1100, z: -2900, depth: -30, name: '별빛 탐사선' },
  whirlpool: { x: 3200, z: -2600, r: 60, name: '소용돌이' },
  /** 얼음 성 빙산(솜눈섬 남동 펭귄 만 한가운데 떠 있는 얼음 작은 섬 — 꼭대기는 땅, 둘레는 바다) */
  iceberg: { x: ICEBERG.x, z: ICEBERG.z, r: ICEBERG.r, island: 'ice', name: '얼음 성 빙산' },
  /** 섬 특산 시설 */
  get facilities(): Record<FacilityId, Spot> { return lzFacilities(); },
  /** 동굴 입구(섬마다 1~3) — rotY 는 입구가 열린 쪽 */
  get caves(): Array<Spot & { id: string }> { return lzCaves(); },
  /** 숨은 곳 21(GDD 2.2.2) — secrets/hidden 이 이 자리에 붙인다. water = 물속/물 위 */
  get hidden(): Record<SecretId, HiddenSpot> { return lzHidden(); },
  /** 티노 낮잠 언덕 꼭대기(공룡섬 중앙 북쪽) */
  get tinoHill(): { x: number; z: number; r: number; island: string } { return lzTinoHill(); },
  /** 별똥별섬 동쪽 크레이터 호수 가운데 */
  get crater(): { x: number; z: number; r: number; level: number; island: string } { return lzCrater(); },
} as const;

// ── 지형 특징 목록(world-zones 의 zoneAt·랜드마크·물색이 읽는다) ─────────────
export type FeatureKind =
  | 'trench' | 'edgeRing' | 'reef' | 'sandbar' | 'wreck' | 'ghostShip' | 'ufoWreck' | 'whirlpool' | 'iceberg' | 'narwhal'
  | 'lake' | 'estuary' | 'waterfall' | 'coastCliff' | 'heartpond'
  | 'tinoHill' | 'meadow' | 'volcano'
  | 'geyserValley' | 'geyser' | 'icehole' | 'penguinBeach'
  | 'mangrove' | 'lagoon' | 'jungleHill'
  | 'canyon' | 'fossilCliff'
  | 'crater' | 'observatoryHill';
export interface WorldFeature {
  /** 'feat:<island|sea>:<kind>[:n]' */
  id: string;
  kind: FeatureKind;
  island: string | null;
  x: number;
  z: number;
  /** 영향 반경(m) */
  r: number;
  /** 타원(해구) 반축 */
  rx?: number;
  rz?: number;
  /** 고리 안쪽·바깥 반경(산호초 고리, 해안 거리 기준) */
  r0?: number;
  r1?: number;
  /** GDD 구역 코드(3.5·3.6 의 장소 코드와 같다) */
  zone?: string;
  /** 호수 id(lake·heartpond …) */
  lake?: string;
  /** 선 모양 특징(하구·모래톱) */
  pts?: Array<{ x: number; z: number }>;
  /** 물 높이(호수·하구) */
  level?: number;
  /** 크레이터 호수 은하색 */
  galaxy?: boolean;
}

const lzFeatures = lazy((): WorldFeature[] => {
  const F: WorldFeature[] = [];
  const add = (f: Omit<WorldFeature, 'x' | 'z' | 'r'> & { x: number; z: number; r: number }) => F.push({ ...f, x: r2(f.x), z: r2(f.z), r: r2(f.r) });
  // 바다
  add({ id: 'feat:sea:trench', kind: 'trench', island: null, x: TRENCH.x, z: TRENCH.z, r: TRENCH.rx, rx: TRENCH.rx, rz: TRENCH.rz, zone: 'deep' });
  add({ id: 'feat:sea:edgeRing', kind: 'edgeRing', island: null, x: 0, z: 0, r: EDGE_RING.r0, r0: EDGE_RING.r0, zone: 'deep' });
  add({ id: 'feat:coral:reef', kind: 'reef', island: 'coral', x: 900, z: 1500, r: 480 + 250, r0: 80, r1: 250, zone: 'reef' });
  add({ id: 'feat:home:reef', kind: 'reef', island: 'home', x: 0, z: 120, r: 160, r0: 40, r1: 200, zone: 'reef' });
  add({ id: 'feat:coral:sandbar', kind: 'sandbar', island: 'coral', x: (SANDBAR.ax + SANDBAR.bx) / 2, z: (SANDBAR.az + SANDBAR.bz) / 2, r: Math.hypot(SANDBAR.bx - SANDBAR.ax, SANDBAR.bz - SANDBAR.az) / 2, pts: [{ x: r2(SANDBAR.ax), z: r2(SANDBAR.az) }, { x: r2(SANDBAR.bx), z: r2(SANDBAR.bz) }], zone: 'shore' });
  add({ id: 'feat:sea:wreck', kind: 'wreck', island: null, x: -650, z: 650, r: 30, zone: 'offshore' });
  add({ id: 'feat:sea:ghostShip', kind: 'ghostShip', island: 'mushroom', x: -2700, z: 2000, r: 35, zone: 'offshore' });
  add({ id: 'feat:sea:ufoWreck', kind: 'ufoWreck', island: 'launch', x: 1100, z: -2900, r: 26, zone: 'offshore' });
  add({ id: 'feat:sea:whirlpool', kind: 'whirlpool', island: null, x: 3200, z: -2600, r: 60, zone: 'offshore' });
  add({ id: 'feat:ice:iceberg', kind: 'iceberg', island: 'ice', x: ICEBERG.x, z: ICEBERG.z, r: ICEBERG.r });
  add({ id: 'feat:ice:narwhal', kind: 'narwhal', island: 'ice', x: ICEBERG.x, z: ICEBERG.z, r: ICEBERG.r + 70, zone: 'icesea' });
  // 호수(종류 = 구역 코드)
  const lakeZone: Record<LakeKind, string> = {
    pond: 'pond', heartpond: 'heartpond', hotspring: 'hotspring', swamp: 'swamp', foglake: 'foglake', ancientlake: 'ancientlake',
    icelake: 'icelake', oasis: 'oasis', crater: 'crater', footprint: 'footprint',
  };
  for (const L of worldLakes()) {
    add({ id: `feat:${L.island}:${L.kind === 'heartpond' ? 'heartpond' : 'lake'}:${L.id}`, kind: L.kind === 'heartpond' ? 'heartpond' : 'lake', island: L.island, x: L.x, z: L.z, r: L.r, zone: lakeZone[L.kind], lake: L.id, level: r2(L.level), galaxy: L.galaxy || undefined });
    L.holes.forEach((q, i) => add({ id: `feat:${L.island}:icehole:${L.id}:${i}`, kind: 'icehole', island: L.island, x: q.x, z: q.z, r: q.r, zone: 'icehole', lake: L.id, level: r2(L.level) }));
  }
  // 말랑섬: 하구·큰 폭포·북쪽 절벽
  const R0 = worldRivers().find((r) => r.island === 'home')!;
  const mouth = R0.pts.slice(-6);
  add({ id: 'feat:home:estuary', kind: 'estuary', island: 'home', x: mouth[mouth.length - 1].x, z: mouth[mouth.length - 1].z, r: 60, zone: 'estuary', pts: mouth.map((p) => ({ x: r2(p.x), z: r2(p.z) })), level: 0 });
  const wf = bigWaterfall();
  add({ id: 'feat:home:waterfall', kind: 'waterfall', island: 'home', x: wf.x, z: wf.z, r: 14, zone: 'waterfall' });
  { const p = coastSpot('home', -Math.PI / 2 - 0.05, BEACH + 6); add({ id: 'feat:home:coastCliff', kind: 'coastCliff', island: 'home', x: p.x, z: p.z, r: 160 }); }
  // 공룡섬
  { const p = uv('dino', 0, -0.33); add({ id: 'feat:dino:volcano', kind: 'volcano', island: 'dino', x: p.x, z: p.z, r: 0.42 * 650, zone: 'volcano' }); }
  { const p = uv('dino', 0.02, 0.15); add({ id: 'feat:dino:meadow', kind: 'meadow', island: 'dino', x: p.x, z: p.z, r: 0.36 * 650, zone: 'ranch' }); }
  { const t = lzTinoHill(); add({ id: 'feat:dino:tinoHill', kind: 'tinoHill', island: 'dino', x: t.x, z: t.z, r: 0.085 * 650 }); }
  // 솜눈섬
  { const p = uv('ice', GEYSER_VALLEY_UV.u, GEYSER_VALLEY_UV.v); add({ id: 'feat:ice:geyserValley', kind: 'geyserValley', island: 'ice', x: p.x, z: p.z, r: 0.15 * 600 });
    const rnd = mulberry32(4242);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rnd() * 0.8, rr = 18 + rnd() * 26;
      add({ id: `feat:ice:geyser:${i}`, kind: 'geyser', island: 'ice', x: p.x + Math.cos(a) * rr, z: p.z + Math.sin(a) * rr, r: 3 });
    } }
  { // 만 안쪽 물가(섬 중심 쪽) 모래밭
    const B = ICE_BAY, d = islandById('ice')!, l = Math.hypot(B.ax - d.x, B.az - d.z);
    const s0 = { x: B.ax - ((B.ax - d.x) / l) * (B.r + 20), z: B.az - ((B.az - d.z) / l) * (B.r + 20) };
    const p = findSpot(s0.x, s0.z, (x, z) => worldSample(x, z).kind === 'sand' && dryLand(x, z, 0.3), 160, 3) ?? s0;
    add({ id: 'feat:ice:penguinBeach', kind: 'penguinBeach', island: 'ice', x: p.x, z: p.z, r: 120, zone: 'beach' }); }
  // 산호빛섬
  add({ id: 'feat:coral:lagoon', kind: 'lagoon', island: 'coral', x: 900, z: 1500, r: 0.4 * 480, zone: 'lagoon' });
  { const p = uv('coral', 0.62, 0); add({ id: 'feat:coral:mangrove', kind: 'mangrove', island: 'coral', x: p.x, z: p.z, r: 0.42 * 480, zone: 'mangrove' }); }
  { const p = uv('coral', -0.68, 0.05); add({ id: 'feat:coral:jungleHill', kind: 'jungleHill', island: 'coral', x: p.x, z: p.z, r: 0.2 * 480, zone: 'waterfall' }); }
  // 모래시계섬
  { const p = uv('desert', CANYON_UV.u, CANYON_UV.v); add({ id: 'feat:desert:canyon', kind: 'canyon', island: 'desert', x: p.x, z: p.z, r: 0.3 * 550, zone: 'cave' }); }
  { const p = coastSpot('desert', Math.PI / 2, BEACH + 6); add({ id: 'feat:desert:fossilCliff', kind: 'fossilCliff', island: 'desert', x: p.x, z: p.z, r: 180, zone: 'fossil' }); }
  // 별똥별섬
  { const c = lzCrater(); add({ id: 'feat:launch:crater', kind: 'crater', island: 'launch', x: c.x, z: c.z, r: c.r * 1.9, zone: 'crater', level: r2(c.level), galaxy: true }); }
  { const p = uv('launch', OBS_HILL_UV.u, OBS_HILL_UV.v); add({ id: 'feat:launch:observatoryHill', kind: 'observatoryHill', island: 'launch', x: p.x, z: p.z, r: 0.25 * 450, zone: 'telescope' }); }
  return F;
});

/** 지형 특징 전부(한 번 계산, 결정적) */
export function worldFeatures(): WorldFeature[] {
  return lzFeatures();
}

/** 바다 구역(GDD 2.3) — 육지면 null. world-zones 의 zoneAt 이 이걸 쓴다. */
export function seaZoneAt(x: number, z: number): 'shore' | 'shallow' | 'reef' | 'offshore' | 'deep' | 'trench' | null {
  const s = worldSample(x, z);
  if (s.coast >= 0) return null;
  const off = -s.coast;
  if (trenchAt(x, z) > 0.5) return 'trench';
  if (Math.hypot(x, z) > EDGE_RING.r0) return 'deep';
  if (s.island?.id === 'coral' && off >= 80 && off <= 250) return 'reef';
  if (z >= 40 && z <= 200 && Math.abs(x) < 180) return 'reef';
  if (off < 20) return 'shore';
  if (off < 150) return 'shallow';
  return 'offshore';
}

/** 섬 높이 단계(해안 → 평지 → 언덕 → 정상, GDD 2.2.1 "3층 고도") — 16 m 격자로 한 번 잰다 */
export interface IslandProfile { id: string; peak: { x: number; z: number; h: number }; tiers: { plain: number; hill: number; summit: number }; landArea: number; }
const lzProfiles = lazy((): IslandProfile[] => ISLANDS.map((d) => {
  const hs: number[] = [];
  let peak = { x: d.x, z: d.z, h: -Infinity };
  for (let z = d.z - d.r * 1.3; z <= d.z + d.r * 1.3; z += 16) for (let x = d.x - d.r * 1.3; x <= d.x + d.r * 1.3; x += 16) {
    const s = worldSample(x, z);
    if (s.island !== d || s.coast <= 0) continue;
    hs.push(s.h);
    if (s.h > peak.h) peak = { x, z, h: s.h };
  }
  hs.sort((a, b) => a - b);
  const q = (t: number) => (hs.length ? hs[Math.min(hs.length - 1, Math.floor(t * hs.length))] : 0);
  return { id: d.id, peak: { x: r2(peak.x), z: r2(peak.z), h: r2(peak.h) }, tiers: { plain: r2(q(0.3)), hill: r2(q(0.75)), summit: r2(q(0.97)) }, landArea: hs.length * 256 };
}));
export function islandProfiles(): IslandProfile[] {
  return lzProfiles();
}
