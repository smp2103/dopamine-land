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
  kind: 'sea' | 'sand' | 'grass' | 'cliff' | 'rock' | 'snow' | 'jungle' | 'desert' | 'lava';
  /** 섬 안쪽 깊이 0..1(해안 0, 중심 1) */
  inland: number;
}

const BEACH = 22;

/** 섬 하나의 육지 높이(해안 거리 c > 0). 테마별 생성기. */
function landHeight(d: IslandDef, x: number, z: number, c: number): { h: number; kind: WorldSample['kind'] } {
  const inland = Math.min(1, c / d.r);
  const lx = (x - d.x) / d.r, lz = (z - d.z) / d.r;
  const rc = Math.hypot(lx, lz);
  const beachT = sm(0, BEACH, c);
  const base = 1.0;
  let h = base, kind: WorldSample['kind'] = 'grass';
  const hill = fbm(n3, x * 0.004 + d.seed, z * 0.004 - d.seed, 4);
  switch (d.theme) {
    case 'home': {
      // 마을(원점) 근처는 평평한 1 m, 멀어질수록 계단 언덕
      const away = sm(60, 200, Math.hypot(x, z));
      h = base + away * terrace(Math.max(0, (hill + 0.35) * 26 * sm(0.02, 0.35, inland)), 4);
      break;
    }
    case 'dino': {
      // 정글 저지대 + 가운데 화산(분화구)
      const cone = Math.max(0, 1 - rc / 0.42);
      const crater = sm(0.07, 0.03, rc) * 40;
      h = base + terrace(Math.max(0, (hill + 0.4) * 18 * sm(0.02, 0.3, inland)), 3) + cone * cone * 150 - crater;
      kind = rc < 0.05 ? 'lava' : cone > 0.35 ? 'rock' : 'jungle';
      break;
    }
    case 'ice': {
      const peak = Math.max(0, 1 - rc / 0.55);
      h = base + terrace(Math.max(0, (hill + 0.4) * 20 * sm(0.02, 0.3, inland)), 4) + Math.pow(peak, 1.6) * 170;
      kind = 'snow';
      break;
    }
    case 'mushroom': {
      h = base + terrace(Math.max(0, (hill + 0.45) * 22 * sm(0.02, 0.3, inland)), 3);
      // 연못 몇 개
      const pond = n2(x * 0.012 + 7, z * 0.012 - 3);
      if (pond > 0.62 && inland > 0.15) h -= (pond - 0.62) * 30;
      break;
    }
    case 'coral': {
      // 낮고 평평한 고리 섬 + 가운데 석호(바다 높이 아래)
      h = base + Math.max(0, hill) * 4 * sm(0.02, 0.2, inland);
      const lagoon = sm(0.42, 0.25, rc);
      h = h * (1 - lagoon) + (-3.5) * lagoon;
      break;
    }
    case 'desert': {
      // 모래 언덕 + 메사(높은 평탄 바위산)
      const dune = Math.abs(n1(x * 0.01 + 3, z * 0.006)) * 6;
      const mesa = sm(0.55, 0.62, n2(x * 0.004 + 5, z * 0.004 + 9)) * 34;
      h = base + dune * sm(0.02, 0.2, inland) + mesa * sm(0.05, 0.25, inland);
      kind = mesa > 20 ? 'rock' : 'desert';
      break;
    }
    case 'launch': {
      // 해안 절벽 위 넓은 고원(발사대)
      h = base + terrace(sm(0.03, 0.12, inland) * 22, 22, 0.08) + Math.max(0, hill) * 2;
      break;
    }
    case 'islet': {
      h = base + Math.max(0, 1 - rc) * 6 * (0.6 + 0.4 * hill);
      break;
    }
  }
  // 해변: 물가에서 0 → BEACH 안쪽에서 육지 높이로
  const beachH = -0.3 + 1.4 * sm(0, 1, c / BEACH);
  h = beachH * (1 - beachT) + h * beachT;
  if (c < BEACH * 0.7 && d.theme !== 'ice') kind = d.theme === 'desert' ? 'desert' : 'sand';
  if (c < BEACH * 0.7 && d.theme === 'ice') kind = 'snow';
  return { h, kind };
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
    const h = Math.max(SEA_FLOOR, -0.3 - off * 0.09 - Math.max(0, off - 80) * 0.12) + n1(x * 0.01, z * 0.01) * 1.5;
    return { h, coast: best ? bestC : -400, island: best, kind: 'sea', inland: 0 };
  }
  const { h, kind } = landHeight(best, x, z, bestC);
  return { h, coast: bestC, island: best, kind, inland: Math.min(1, bestC / best.r) };
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
