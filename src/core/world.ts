// 군도 세계 — 8km × 8km 바다 위 테마 섬들. 섬마다 해안 모양·지형 생성기가 다르다.
// 마을(룩 테스트 장면, 원점)은 시작 섬 남쪽 해안의 반도로 이어진다(island.ts 가 합친다).
import { createNoise2D } from 'simplex-noise';
import { mulberry32 } from './rng';

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

export const ISLANDS: IslandDef[] = [
  { id: 'home', name: '시작 섬', theme: 'home', x: -120, z: -560, r: 560, seed: 11 },
  { id: 'dino', name: '공룡 섬', theme: 'dino', x: 1750, z: -900, r: 650, seed: 22 },
  { id: 'ice', name: '얼음 섬', theme: 'ice', x: -1900, z: -1550, r: 600, seed: 33 },
  { id: 'mushroom', name: '버섯 요정 섬', theme: 'mushroom', x: -1750, z: 1100, r: 520, seed: 44 },
  { id: 'coral', name: '산호 섬', theme: 'coral', x: 900, z: 1500, r: 480, seed: 55 },
  { id: 'desert', name: '사막 오아시스 섬', theme: 'desert', x: 2650, z: 1050, r: 550, seed: 66 },
  { id: 'launch', name: '발사대 섬', theme: 'launch', x: 300, z: -2350, r: 450, seed: 77 },
  // 보물 작은 섬들
  { id: 'islet-a', name: '보물 섬 A', theme: 'islet', x: 520, z: 420, r: 70, seed: 101 },
  { id: 'islet-b', name: '보물 섬 B', theme: 'islet', x: -900, z: 300, r: 90, seed: 102 },
  { id: 'islet-c', name: '보물 섬 C', theme: 'islet', x: 1200, z: 300, r: 55, seed: 103 },
  { id: 'islet-d', name: '보물 섬 D', theme: 'islet', x: -700, z: -1900, r: 80, seed: 104 },
  { id: 'islet-e', name: '보물 섬 E', theme: 'islet', x: 2300, z: -2200, r: 110, seed: 105 },
  { id: 'islet-f', name: '보물 섬 F', theme: 'islet', x: -2800, z: -200, r: 120, seed: 106 },
  { id: 'islet-g', name: '보물 섬 G', theme: 'islet', x: 400, z: 2900, r: 100, seed: 107 },
  { id: 'islet-h', name: '보물 섬 H', theme: 'islet', x: 3300, z: -400, r: 75, seed: 108 },
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

/** 섬의 해안 부호 거리(양수 = 육지). 각도별 노이즈로 들쭉날쭉한 해안. */
export function islandCoast(d: IslandDef, x: number, z: number): number {
  const dx = x - d.x, dz = z - d.z;
  const dist = Math.hypot(dx, dz);
  if (dist > d.r * 1.5 + 60) return d.r * 1.5 - dist; // 멀면 대충
  const s = d.seed * 13.7;
  const ax = dx / d.r, az = dz / d.r;
  const wob = 0.22 * fbm(n1, ax * 1.6 + s, az * 1.6 - s, 3) + 0.06 * n2(x * 0.02 + s, z * 0.02);
  return d.r * (1 + wob) - dist;
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
/** 호수 정의(섬 중심 기준 반경 비율 좌표) */
interface LakeDef { island: string; u: number; v: number; r: number; frozen?: boolean; }
const LAKE_DEFS: LakeDef[] = [
  { island: 'home', u: -0.08, v: -0.42, r: 46 },
  { island: 'home', u: 0.42, v: -0.12, r: 26 },
  { island: 'dino', u: -0.6, v: 0.25, r: 34 },
  { island: 'dino', u: 0.45, v: 0.55, r: 22 },
  { island: 'ice', u: -0.52, v: 0.08, r: 56, frozen: true },
  { island: 'ice', u: 0.3, v: 0.45, r: 24, frozen: true },
  { island: 'mushroom', u: 0.3, v: 0.22, r: 26 },
  { island: 'mushroom', u: -0.38, v: -0.22, r: 32 },
  { island: 'mushroom', u: 0.05, v: -0.55, r: 20 },
  { island: 'desert', u: 0.32, v: -0.3, r: 34 },
  { island: 'launch', u: 0.5, v: 0.02, r: 34 },
];
/** 강(섬 중심 기준 비율 좌표, 상류 → 하구). 첫 점은 호수 안. */
interface RiverDef { island: string; pts: Array<[number, number]>; halfW: number; }
const RIVER_DEFS: RiverDef[] = [
  { island: 'home', halfW: 4.2, pts: [[-0.08, -0.42], [-0.2, -0.3], [-0.34, -0.14], [-0.42, 0.04], [-0.55, 0.2], [-0.7, 0.32], [-0.86, 0.42], [-1.08, 0.5]] },
  { island: 'home', halfW: 3.0, pts: [[0.42, -0.12], [0.55, -0.02], [0.68, 0.1], [0.82, 0.2], [1.06, 0.3]] },
  { island: 'dino', halfW: 5.0, pts: [[-0.6, 0.25], [-0.72, 0.38], [-0.84, 0.48], [-1.08, 0.6]] },
  { island: 'mushroom', halfW: 3.0, pts: [[0.3, 0.22], [0.45, 0.35], [0.62, 0.45], [0.8, 0.52], [1.06, 0.6]] },
];

export interface LakeInfo { id: string; island: string; x: number; z: number; r: number; level: number; frozen: boolean; }
export interface RiverInfo { island: string; halfW: number; pts: Array<{ x: number; z: number; level: number }>; }

let lakeCache: LakeInfo[] | null = null;
let riverCache: RiverInfo[] | null = null;
let buildingWater = false;

/** 호수 가장자리까지 부호 거리(양수 = 물 안쪽), 가장자리는 살짝 들쭉날쭉 */
export function lakeEdge(L: { x: number; z: number; r: number }, x: number, z: number): number {
  const a = Math.atan2(z - L.z, x - L.x);
  return L.r * (1 + 0.16 * n2(Math.cos(a) * 1.2 + L.x * 0.01, Math.sin(a) * 1.2 + L.z * 0.01)) - Math.hypot(x - L.x, z - L.z);
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
    out.push({ id: `${L.island}-lake${i}`, island: L.island, x, z, r: L.r, level: Math.max(0.6, lo - (L.frozen ? 0.2 : 0.55)), frozen: !!L.frozen });
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
    rivers.push({ island: R.island, halfW: R.halfW, pts });
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
function riverQuery(id: string, x: number, z: number): { d: number; level: number; halfW: number } | null {
  let best: { d: number; level: number; halfW: number } | null = null;
  for (const R of riverCache!) {
    if (R.island !== id) continue;
    const pts = R.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (x < Math.min(a.x, b.x) - 22 || x > Math.max(a.x, b.x) + 22 || z < Math.min(a.z, b.z) - 22 || z > Math.max(a.z, b.z) + 22) continue;
      const vx = b.x - a.x, vz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
      const d = Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t));
      if (!best || d < best.d) {
        const drop = a.level - b.level;
        const tt = drop > 1.2 ? sm(0.62, 0.72, t) : t;
        best = { d, level: a.level + (b.level - a.level) * tt, halfW: R.halfW };
      }
    }
  }
  return best;
}

/** 섬 안 물(호수·강)이 깎은 땅 + 물 높이 */
function carveWater(d: IslandDef, x: number, z: number, h: number): { h: number; water: number; special: number; ref: number } {
  if (buildingWater) return { h, water: -Infinity, special: 0, ref: 0 };
  if (!lakeCache) worldLakes();
  let water = -Infinity, special = 0, ref = 0;
  for (const L of lakeCache!) {
    if (L.island !== d.id) continue;
    if (Math.abs(x - L.x) > L.r * 1.6 + 14 || Math.abs(z - L.z) > L.r * 1.6 + 14) continue;
    const sd = lakeEdge(L, x, z);
    if (sd > -14) ref = Math.max(ref, L.level);
    if (L.frozen) {
      // 언 호수: 평평한 얼음판(걸을 수 있다)
      const flat = sm(-12, 1, sd);
      h = h * (1 - flat) + L.level * flat;
      special = Math.max(special, sm(-1.2, 1.2, sd));
      continue;
    }
    const bottom = L.level - 0.25 - 2.6 * sm(0, 14, sd);
    const shore = L.level - 0.25 + Math.max(0, -sd) * 0.32;
    const target = sd > 0 ? bottom : shore;
    if (target < h) h = target;
    if (h < L.level) water = Math.max(water, L.level);
  }
  for (const R of riverCache!) {
    if (R.island !== d.id) continue;
    const q = riverQuery(d.id, x, z);
    if (q && q.d < q.halfW + 16) {
      const e = q.d - q.halfW;
      ref = Math.max(ref, q.level);
      const bed = q.level - 0.25 - 1.2 * sm(0, -q.halfW * 0.8, e);
      const bank = q.level - 0.25 + Math.max(0, e) * 0.5;
      const target = e < 0 ? bed : bank;
      if (target < h) h = target;
      if (h < q.level && e < 2) water = Math.max(water, q.level);
    }
    break;
  }
  return { h, water, special, ref };
}

const ridge = (v: number) => 1 - Math.abs(v);

interface Land { h: number; kind: WorldSample['kind']; terr: number; wallAmp: number; rock: number; special: number; }

/** 섬 하나의 육지 높이(물이 깎기 전). 테마별 생성기. */
function landRaw(d: IslandDef, x: number, z: number, c: number): Land {
  const inland = Math.min(1, c / d.r);
  const lx = (x - d.x) / d.r, lz = (z - d.z) / d.r;
  const rc = Math.hypot(lx, lz);
  const beachT = sm(0, BEACH, c);
  const base = 1.0;
  let h = base, kind: WorldSample['kind'] = 'grass', terr = 0, wallAmp = 0, rock = 0, special = 0;
  const hill = fbm(n3, x * 0.004 + d.seed, z * 0.004 - d.seed, 4);
  /** 계단: 연속값 v 를 step 층으로 */
  const steps = (v: number, step: number, amp = 1, soft = 0.14) => { terr = v / step; wallAmp = amp; return terrace(v, step, soft); };
  switch (d.theme) {
    case 'home': {
      // 마을(원점) 근처는 평평, 안쪽으로 갈수록 계단 언덕 + 가운데 높은 대지(호수가 앉는 곳)
      const away = sm(60, 200, Math.hypot(x, z));
      const up = Math.max(0, 1 - Math.hypot(lx + 0.05, lz + 0.38) / 0.7);
      const v = Math.max(0, (hill + 0.3) * 16 * sm(0.02, 0.3, inland) + up * up * 34);
      h = base + away * steps(v, 4.5, away);
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
      h = base + low + vol;
      h = h * (1 - crater) + (rim - 22) * crater;
      kind = crater > 0.5 ? 'lava' : cone > 0.3 ? 'rock' : 'jungle';
      rock = sm(0.18, 0.5, cone);
      special = sm(0.6, 0.95, crater);
      break;
    }
    case 'ice': {
      // 설산 둘(능선) + 해안 빙하 절벽 대지
      // 설산은 북쪽(GDD: 정상 ~140 m)
      const p1 = Math.max(0, 1 - Math.hypot(lx + 0.02, lz + 0.36) / 0.5);
      const p2 = Math.max(0, 1 - Math.hypot(lx - 0.36, lz + 0.5) / 0.3);
      const rid = ridge(n2(x * 0.006 + 3, z * 0.006)) * 0.5 + ridge(n1(x * 0.013, z * 0.013 + 7)) * 0.25;
      const mtn = Math.pow(p1, 1.5) * 130 + Math.pow(p2, 1.6) * 80 + (p1 + p2) * rid * 30;
      const shelf = steps(sm(0.0, 0.08, inland) * 14 + Math.max(0, hill + 0.2) * 10 * sm(0.05, 0.3, inland), 7, 1);
      h = base + shelf + mtn;
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
      const lagoon = sm(0.44, 0.27, rc);
      h = h * (1 - lagoon) + -3.2 * lagoon;
      kind = h < 2.2 ? 'sand' : 'grass';
      break;
    }
    case 'desert': {
      // 바람결 모래 언덕 + 층층이 붉은 메사
      const wv = n1(x * 0.004 + 3, z * 0.004) * 3;
      const dune = Math.pow(ridge(Math.sin(x * 0.022 + z * 0.008 + wv)), 2.2) * 7 * (0.6 + 0.4 * n2(x * 0.003, z * 0.003));
      const mv = sm(0.36, 0.66, n2(x * 0.0045 + 5, z * 0.0045 + 9)) * sm(0.05, 0.25, inland);
      const mesa = mv * 46;
      const mesaT = steps(mesa, 11.5, sm(0.0, 0.2, mv), 0.3); // 벽을 조금 눕혀 1 m 격자 계단이 덜 보이게
      h = base + dune * sm(0.02, 0.2, inland) * (1 - mv) + mesaT;
      kind = mv > 0.4 ? 'rock' : 'desert';
      rock = sm(0.25, 0.6, mv);
      break;
    }
    case 'launch': {
      // 해안 절벽 위 넓은 고원(발사대)
      const pl = sm(0.03, 0.12, inland) * 26;
      h = base + steps(pl, 13, 1) + Math.max(0, hill) * 2;
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
  if (c < BEACH * 0.7 && d.theme === 'ice') kind = 'snow';
  return { h, kind, terr, wallAmp, rock, special };
}

function rawLand(d: IslandDef, x: number, z: number): number {
  const c = islandCoast(d, x, z);
  if (c < 0) return -1;
  return landRaw(d, x, z, c).h;
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
    // 바다: 해안에서 멀어질수록 깊어진다(얕은 바다 → 심해)
    const off = best ? -bestC : 400;
    const h = Math.max(SEA_FLOOR, -0.3 - off * 0.09 - Math.max(0, off - 80) * 0.12) + n1(x * 0.01, z * 0.01) * 1.5 * sm(0, 30, off);
    return { h, coast: best ? bestC : -400, island: best, kind: 'sea', inland: 0, water: 0 };
  }
  const L = landRaw(best, x, z, bestC);
  const w = carveWater(best, x, z, L.h);
  let kind = L.kind;
  if (w.water > w.h) kind = 'river';
  return {
    h: w.h, coast: bestC, island: best, kind, inland: Math.min(1, bestC / best.r),
    terr: L.terr, wallAmp: L.wallAmp, rock: L.rock, special: Math.max(L.special, w.special), water: w.water, waterRef: w.ref,
  };
}

/** 섬 안 호수·강 물 높이(물이 없으면 -Infinity). 바다는 따로(0). */
export function inlandWaterAt(x: number, z: number): number {
  const s = worldSample(x, z);
  if (s.coast < 0) return -Infinity;
  return s.water !== undefined && s.water > s.h ? s.water : -Infinity;
}

export function islandById(id: string): IslandDef | undefined {
  return ISLANDS.find((d) => d.id === id);
}

/** 어느 섬 위(또는 가장 가까운 섬 앞바다)인가 */
export function islandAt(x: number, z: number): IslandDef | null {
  return worldSample(x, z).island;
}

/** 섬 안에서 걸어갈 수 있는 땅 위 임의 지점들(시드 고정) — 스폰·배치용 */
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
    if (s.island === d && s.coast > 0 && s.inland >= minInland) out.push({ x, z });
  }
  return out;
}

/** 담당끼리 약속한 장소(건물·탈것 정류장·발사대). village 가 짓고, economy·vehicles·space 가 기능을 붙인다. y 는 heightAt 로. */
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
} as const;
