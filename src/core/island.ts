// 섬 높이장 — 모든 모듈이 같은 함수로 땅 높이·표면 종류를 묻는다.
// 단위: 1 = 1 m(동숲 한 칸). 해수면 y = 0.
import { createNoise2D } from 'simplex-noise';
import { mulberry32 } from './rng';

export type SurfaceKind = 'sea' | 'sand' | 'grass' | 'cliff' | 'river';

export interface Surface {
  /** 지면 높이(강·바다면 바닥 높이) */
  h: number;
  kind: SurfaceKind;
  /** 0 = 바다/해변, 1 = 기본 들판, 2 = 절벽 위 고원 */
  tier: number;
  /** 강 중심선까지 거리(m) */
  riverDist: number;
  /** 해안선까지 부호 거리: 양수 = 육지 안쪽 */
  coastDist: number;
}

export const TIER_H = [0.0, 1.0, 3.0] as const;
export const RIVER_HALF_W = 1.35;
export const RIVER_DEPTH = 0.9;
/** 강물 표면이 들판보다 얼마나 낮은가 */
export const RIVER_WATER_DROP = 0.42;

/** 룩 테스트 연출 기준점 — 카메라 'ac' 가 player 를 본다. */
export const HERO = {
  player: { x: 0, z: 0 },
  chest: { x: 2.4, z: -1.1 },
  villager: { x: -1.9, z: -2.0 },
  /** 강 낚시 포인트(물고기 그림자) */
  fishing: { x: -4.6, z: 2.6 },
  /** 바다 낚시 포인트 */
  seaFishing: { x: 15.5, z: 3.0 },
  /** 플레이어 주변 비워 둘 반경(지정 소품 제외) */
  clearRadius: 2.8,
};

const ISLAND_C = { x: -14, z: -10 };
const ISLAND_R = 28;
const BEACH_W = 4.2;
const PLATEAU_C = { x: -13, z: -21 };
const PLATEAU_R = 11;

/** 강 중심선: 고원 → 들판 → 남쪽 바다 */
export const RIVER_PATH: ReadonlyArray<{ x: number; z: number }> = [
  { x: -15, z: -18 },
  { x: -10, z: -11 },
  { x: -6.5, z: -5.5 },
  { x: -5.2, z: 0.5 },
  { x: -4.4, z: 5 },
  { x: -2.5, z: 10 },
  { x: -1.0, z: 16 },
  { x: 0.5, z: 22 },
];

const noise = createNoise2D(mulberry32(20261026));
const noise2 = createNoise2D(mulberry32(777));

function fbm(x: number, z: number, oct = 3): number {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise(x * f, z * f);
    a *= 0.5;
    f *= 2.03;
  }
  return s;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
  return Math.hypot(dx, dz);
}

export function riverDistAt(x: number, z: number): number {
  // 굽이: 중심선 자체를 노이즈로 살짝 흔든다
  const wx = x + 0.8 * noise2(z * 0.08, 3.1);
  let d = Infinity;
  for (let i = 0; i < RIVER_PATH.length - 1; i++) {
    const a = RIVER_PATH[i], b = RIVER_PATH[i + 1];
    d = Math.min(d, segDist(wx, z, a.x, a.z, b.x, b.z));
  }
  return d;
}

/** 해안선 부호 거리(양수 = 육지) */
export function coastDistAt(x: number, z: number): number {
  const dx = x - ISLAND_C.x, dz = z - ISLAND_C.z;
  const ang = Math.atan2(dz, dx);
  const wobble = 2.6 * noise(Math.cos(ang) * 1.3, Math.sin(ang) * 1.3) + 1.2 * fbm(x * 0.06, z * 0.06, 2);
  return ISLAND_R + wobble - Math.hypot(dx, dz);
}

function plateauMask(x: number, z: number): number {
  const dx = x - PLATEAU_C.x, dz = z - PLATEAU_C.z;
  const wob = 2.2 * noise(x * 0.07 + 11, z * 0.07 - 4);
  const d = PLATEAU_R + wob - Math.hypot(dx * 1.0, dz * 1.25);
  // 절벽: 0.55 m 폭으로 급하게, 위 모서리만 둥글게
  return smooth(-0.35, 0.35, d);
}

/** 강이 깎기 전 땅 높이 */
function baseHeight(x: number, z: number): { h: number; tier: number; coast: number } {
  const coast = coastDistAt(x, z);
  if (coast < 0) {
    // 바다 바닥: 해안에서 멀어질수록 깊어진다
    const h = -0.25 + coast * 0.22;
    return { h: Math.max(h, -4), tier: 0, coast };
  }
  if (coast < BEACH_W) {
    // 모래사장: 물가 0 → 들판 쪽 0.6, 끝에서 들판으로 부드럽게
    const t = coast / BEACH_W;
    const sand = -0.25 + 0.95 * smooth(0, 1, t * 0.85);
    const toGrass = smooth(0.78, 1.0, t);
    const h = sand * (1 - toGrass) + TIER_H[1] * toGrass;
    return { h, tier: 0, coast };
  }
  const p = plateauMask(x, z);
  const h = TIER_H[1] + (TIER_H[2] - TIER_H[1]) * p;
  return { h, tier: p > 0.5 ? 2 : 1, coast };
}

export function surfaceAt(x: number, z: number): Surface {
  const b = baseHeight(x, z);
  const rd = riverDistAt(x, z);
  let h = b.h;
  let kind: SurfaceKind;
  if (b.coast < 0) kind = 'sea';
  else if (b.coast < BEACH_W * 0.8) kind = 'sand';
  else kind = 'grass';

  // 강: 둑은 둥글게, 바닥은 평평하게
  if (b.coast > -1 && rd < RIVER_HALF_W + 0.6) {
    const bank = 1 - smooth(RIVER_HALF_W - 0.35, RIVER_HALF_W + 0.6, rd);
    const bed = b.h - RIVER_DEPTH;
    h = h * (1 - bank) + bed * bank;
    if (rd < RIVER_HALF_W && b.coast > 0) kind = 'river';
  }

  if (kind === 'grass') {
    // 경사가 급하면 절벽 면
    const e = 0.12;
    const hx = baseHeight(x + e, z).h - baseHeight(x - e, z).h;
    const hz = baseHeight(x, z + e).h - baseHeight(x, z - e).h;
    if (Math.hypot(hx, hz) / (2 * e) > 1.4) kind = 'cliff';
  }
  return { h, kind, tier: b.tier, riverDist: rd, coastDist: b.coast };
}

export function heightAt(x: number, z: number): number {
  return surfaceAt(x, z).h;
}

/** 강물 표면 높이(강 밖이면 NaN). 고원→들판 경계에서 계단(폭포)이 생긴다. */
export function riverWaterY(x: number, z: number): number {
  const s = surfaceAt(x, z);
  if (s.riverDist > RIVER_HALF_W + 0.2) return NaN;
  const base = baseHeight(x, z);
  if (base.coast < 0) return 0;
  return Math.max(0, base.h - RIVER_WATER_DROP);
}

/** 위가 평평하고 물·절벽이 아닌 땅인가(소품 배치용) */
export function isBuildable(x: number, z: number, margin = 0.6): boolean {
  const s = surfaceAt(x, z);
  if (s.kind !== 'grass' && s.kind !== 'sand') return false;
  if (s.riverDist < RIVER_HALF_W + margin + 0.6) return false;
  if (s.coastDist < margin) return false;
  for (const [ox, oz] of [[margin, 0], [-margin, 0], [0, margin], [0, -margin]]) {
    const n = surfaceAt(x + ox, z + oz);
    if (n.kind === 'cliff' || Math.abs(n.h - s.h) > 0.25) return false;
  }
  return true;
}

export const ISLAND_BOUNDS = { minX: -48, maxX: 22, minZ: -44, maxZ: 26 };
