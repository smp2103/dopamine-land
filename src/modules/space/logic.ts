// 우주(토끼달) 순수 로직 — 화면·WebGL 없이 테스트할 수 있는 것만: 달 지형 높이, 크레이터·연못, 장소 좌표,
// 산소 타임라인(env.gameSec), 행성 등록소(가두기·바닥), 하루마다 바뀌는 우주상자 자리, 우주 시간대.
// 좌표 약속: '국소(local)' = 행성 origin 기준(x, z), 월드 = origin + 국소. 높이 함수는 국소 좌표를 받아 국소 높이(origin.y 기준)를 돌려준다.
import * as THREE from 'three';
import { HOUR_SEC, todOf, type PlanetDef, type PlanetSpawner, type Pond } from '../../core/api';
import { rngFor } from '../../core/rng';

// ───────────── 상수 ─────────────
/** 달 반경(m) — 이 원판 밖은 작은 별처럼 둥글게 떨어진다 */
export const MOON_R = 400;
/** 달 바닥 기준 높이 — 지구 바다 높이(0)보다 넉넉히 위라 크레이터 바닥에서도 '수영'이 되지 않는다 */
export const MOON_BASE = 12;
/** 착륙장 높이(평평하게 다진 곳) */
export const PAD_H = MOON_BASE + 0.4;
/** 착륙장 평평한 반경 */
export const PAD_R = 9;
/** 달 중력(지구 −22 의 약 1/5) */
export const MOON_GRAVITY = -4.5;
/** 산소 캡슐 1개 = 게임 4시간(게임 초) */
export const OXY_PER_CAPSULE = 4 * HOUR_SEC;
/** 캡슐이 하나도 없을 때 펭박사 비상 산소(게임 1시간) — 착륙하자마자 돌아가지 않게 */
export const OXY_GRACE = HOUR_SEC;
/** 첫 방문 선물 캡슐 수 */
export const FIRST_VISIT_CAPSULES = 3;
/** 우주상자 수(하루마다 자리가 바뀐다) */
export const SPACE_CHESTS = 15;
/** 공중에서 Space 를 누르고 있으면 둥실 떠 있는 시간(초) */
export const FLOAT_SEC = 3;
/** 둥실 중 떨어지는 속도(m/s, 아래 방향) */
export const FLOAT_FALL = 0.25;
/** 가두기 반경 비율(행성 반경 × 이 값 밖이면 살짝 되돌린다) */
export const CLAMP_FRAC = 0.96;
/** 이 반경 비율 안이면 그 행성 땅 공급자가 높이를 맡는다 */
export const GROUND_FRAC = 1.6;

export interface P2 { x: number; z: number }
/** 6.3 표 — 국소 좌표 */
export const MOON_PLACES = {
  pad: { x: 0, z: 0 },
  village: { x: 80, z: -60 },
  ponds: [{ x: -120, z: 40 }, { x: 60, z: 150 }, { x: -40, z: -180 }] as P2[],
  field: { x: 200, z: 50 },
  hill: { x: -200, z: -100 },
  nest: { x: 150, z: -220 },
  wreck: { x: -250, z: 200 },
  /** 달브라키오가 거니는 먼 언덕 */
  farHill: { x: 300, z: 150 },
} as const;
/** 장소 이름(발견·사진 명소) */
export const PLACE_NAMES: Record<string, string> = {
  pad: '착륙장', village: '떡방아 토끼 마을', ponds: '크레이터 연못', field: '월석 들판', hill: '지구 전망 언덕',
  nest: '별공룡 둥지', wreck: 'UFO 잔해', farHill: '달브라키오 언덕',
};

// ───────────── 크레이터 ─────────────
export interface Crater { x: number; z: number; r: number; d: number; pond?: boolean }
const POND_CR = 19;
const POND_DEPTH = 2.6;

/** 크레이터를 피해야 하는 곳(장소 중심, 반경) */
const KEEP_OUT: Array<[number, number, number]> = [
  [0, 0, 26], [80, -60, 44], [200, 50, 34], [-200, -100, 70], [150, -220, 30], [-250, 200, 32], [300, 150, 36],
  ...MOON_PLACES.ponds.map((p) => [p.x, p.z, POND_CR + 12] as [number, number, number]),
];

let cratersCache: Crater[] | null = null;
/** 크레이터 30개(연못 3 + 도톰한 도넛 테 27) — 결정적 */
export function moonCraters(): Crater[] {
  if (cratersCache) return cratersCache;
  const out: Crater[] = MOON_PLACES.ponds.map((p) => ({ x: p.x, z: p.z, r: POND_CR, d: POND_DEPTH, pond: true }));
  const rnd = rngFor('space:moon:craters');
  // 시작 시선(-Z) 앞 가까운 작은 크레이터 2개: 착륙하자마자 달 표면 결이 보이게
  out.push({ x: -16, z: -34, r: 6.5, d: 1.3 }, { x: 22, z: -42, r: 8, d: 1.6 });
  for (let i = 0; i < 600 && out.length < 30; i++) {
    const a = rnd() * Math.PI * 2, rr = 30 + Math.sqrt(rnd()) * 330;
    const r = 5 + rnd() * rnd() * 22;
    const c: Crater = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, r, d: r * (0.15 + rnd() * 0.07) };
    if (Math.hypot(c.x, c.z) + c.r > MOON_R - 30) continue;
    if (KEEP_OUT.some(([x, z, k]) => Math.hypot(c.x - x, c.z - z) < k + c.r)) continue;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < (o.r + c.r) * 1.15)) continue;
    out.push(c);
  }
  return (cratersCache = out);
}

/** 두더지 잡기 크레이터(가운데 가까운 중간 크기 3개) */
export function moleCraters(): Crater[] {
  return moonCraters().filter((c) => !c.pond && c.r >= 6 && c.r <= 16)
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, 3);
}

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const gauss = (d2: number, s: number) => Math.exp(-d2 / (2 * s * s));

export interface MoonSample {
  /** 국소 높이 */
  h: number;
  /** 크레이터 바닥 정도 0..1 */
  bowl: number;
  /** 크레이터 테 0..1 */
  rim: number;
  /** 가장자리(떨어지는 곳) 0..1 */
  edge: number;
  /** 언덕 정도 0..1 */
  hill: number;
}

/** 달 지형(국소 좌표). 둥근 둔덕 + 도톰한 크레이터 + 장소마다 다진 땅 + 가장 높은 지구 전망 언덕 + 둥글게 떨어지는 가장자리 */
export function moonSample(x: number, z: number): MoonSample {
  const P = MOON_PLACES;
  // 넓은 둔덕 + 발밑 잔물결(가까운 땅에도 빛과 그늘)
  let und = 1.1 * Math.sin(x * 0.021 + 0.7) * Math.cos(z * 0.017) + 0.55 * Math.sin(x * 0.052 + z * 0.031) + 0.25 * Math.sin(x * 0.13 - z * 0.11)
    + 0.26 * Math.sin(x * 0.55 + Math.sin(z * 0.3) * 1.5) * Math.cos(z * 0.47 - 0.6) + 0.14 * Math.sin(x * 0.93 - z * 0.71 + 2.0);
  // 연못 크레이터 안은 둔덕을 눌러 둥근 물가가 되게
  for (const p of P.ponds) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < POND_CR * 1.6) und *= smooth(POND_CR * 0.9, POND_CR * 1.6, d);
  }
  let h = MOON_BASE + und;
  // 지구 전망 언덕(가장 높은 곳) + 달브라키오 먼 언덕
  const dh2 = (x - P.hill.x) ** 2 + (z - P.hill.z) ** 2;
  const hill = gauss(dh2, 40);
  h += 26 * hill;
  const df2 = (x - P.farHill.x) ** 2 + (z - P.farHill.z) ** 2;
  h += 7 * gauss(df2, 26);
  // 크레이터
  let bowl = 0, rim = 0;
  for (const c of moonCraters()) {
    const dx = x - c.x, dz = z - c.z;
    const d2 = (dx * dx + dz * dz) / (c.r * c.r);
    if (d2 > 2.6) continue;
    const d = Math.sqrt(d2);
    if (d < 1.05) { const k = 1 - Math.min(1, d2); const b = k * k * (3 - 2 * k); h -= c.d * b; bowl = Math.max(bowl, b); }
    // 도톰한 도넛 테
    const rr = Math.exp(-((d - 1.04) * (d - 1.04)) / 0.06);
    h += c.d * 0.5 * rr;
    rim = Math.max(rim, rr);
  }
  // 별공룡 둥지: 얕은 접시 + 둥근 둑
  {
    const d = Math.hypot(x - P.nest.x, z - P.nest.z);
    if (d < 26) h += -1.1 * (1 - smooth(0, 13, d)) + 0.7 * Math.exp(-((d - 13) ** 2) / 8);
  }
  // UFO 잔해: 미끄러진 자국(고랑) + 끝의 흙더미
  {
    const ax = P.wreck.x + 40, az = P.wreck.z - 34, bx = P.wreck.x, bz = P.wreck.z;
    const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
    const px = ax + vx * t, pz = az + vz * t, dd = Math.hypot(x - px, z - pz);
    if (dd < 9) h -= 0.9 * (1 - smooth(0, 6, dd)) * smooth(0, 0.25, t);
    const dm = Math.hypot(x - (bx - vx * 0.12), z - (bz - vz * 0.12));
    if (dm < 14) h += 1.6 * gauss(dm * dm, 4.5);
  }
  // 장소 다지기: 착륙장 · 마을 · 월석 들판
  {
    const dp = Math.hypot(x - P.pad.x, z - P.pad.z);
    if (dp < PAD_R + 8) h = lerp(h, PAD_H, 1 - smooth(PAD_R, PAD_R + 8, dp));
    const dv = Math.hypot(x - P.village.x, z - P.village.z);
    if (dv < 40) h = lerp(h, MOON_BASE + 0.8, (1 - smooth(24, 40, dv)) * 0.85);
  }
  // 가장자리: 둥글게 떨어져 검은 하늘 수평선이 보이게
  const R = Math.hypot(x, z);
  const edge = smooth(MOON_R * 0.86, MOON_R, R);
  const fall = Math.max(0, R - MOON_R * 0.93);
  h -= fall * fall * 0.03;
  return { h: Math.max(h, -80), bowl, rim, edge, hill };
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 달 높이(국소) */
export const moonHeight = (x: number, z: number) => moonSample(x, z).h;

/**
 * 먼 LOD 꼭짓점 높이: 둘레 ±reach 안의 최솟값 − 여유. 거친 격자의 선형 보간이 가까운(고운) 땅을 절대 뚫고 올라오지 않는다.
 */
export function moonHeightLow(x: number, z: number, reach: number, margin = 0.35) {
  let m = Infinity;
  const n = 2;
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) m = Math.min(m, moonHeight(x + (i / n) * reach, z + (j / n) * reach));
  return m - margin;
}

// ───────────── 연못 ─────────────
/** 연못 물 높이·반경(국소) — 크레이터 벽 78% 지점 높이가 물가 */
export function moonPondsLocal(): Array<{ x: number; z: number; r: number; y: number }> {
  return MOON_PLACES.ponds.map((p) => {
    const rw = POND_CR * 0.8;
    // 둘레 8방향 높이의 최솟값 — 물이 테 밖으로 넘치지 않게
    let y = Infinity;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; y = Math.min(y, moonHeight(p.x + Math.cos(a) * rw, p.z + Math.sin(a) * rw)); }
    return { x: p.x, z: p.z, r: rw, y: y - 0.05 };
  });
}
/** 월드 좌표 연못 목록 */
export function pondsWorld(origin: { x: number; y: number; z: number }): Pond[] {
  return moonPondsLocal().map((p) => ({ x: origin.x + p.x, z: origin.z + p.z, r: p.r, y: origin.y + p.y }));
}
/** 그 자리가 연못 안이면 물 높이 */
export function pondAtIn(ponds: readonly Pond[], x: number, z: number): { y: number } | null {
  for (const p of ponds) if ((x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r) return { y: p.y };
  return null;
}

// ───────────── 산소 ─────────────
export interface OxyState { value: number; max: number }
/**
 * 산소를 dSec(게임 초)만큼 쓴다. 다 떨어지면 take() 로 캡슐을 하나 더 연다.
 * 돌려주는 것: used = 이번에 연 캡슐 수, out = 캡슐도 없이 0 이 됐다.
 */
export function stepOxygen(o: OxyState, dSec: number, take: () => boolean): { used: number; out: boolean } {
  let rem = Math.max(0, Number.isFinite(dSec) ? dSec : 0), used = 0;
  for (let guard = 0; guard < 10000; guard++) {
    if (o.value > rem) { o.value -= rem; return { used, out: false }; }
    rem -= o.value;
    o.value = 0;
    if (!take()) return { used, out: true };
    o.value = o.max;
    used++;
    if (rem <= 0) return { used, out: false };
  }
  return { used, out: false };
}

// ───────────── 우주 시간대 ─────────────
/** 우주 밤: 지구 시계로 저녁·밤(17~05시) */
export const isSpaceNight = (hour: number) => { const t = todOf(hour); return t === 'night' || t === 'sunset'; };
/** 지구가 높이 떠 있을 때(아침·낮) — 둥실이 달빛해파리가 내려온다 */
export const isEarthUp = (hour: number) => !isSpaceNight(hour);

// ───────────── 우주상자 ─────────────
/** 그 날의 우주상자 자리 15개(국소). 첫 번째는 늘 UFO 잔해 옆 */
export function chestSpots(day: number): P2[] {
  const P = MOON_PLACES;
  const out: P2[] = [{ x: P.wreck.x + 7, z: P.wreck.z - 5 }];
  const ponds = moonPondsLocal();
  const rnd = rngFor(`space:chests:${Math.floor(day)}`);
  for (let i = 0; i < 4000 && out.length < SPACE_CHESTS; i++) {
    const a = rnd() * Math.PI * 2, r = 20 + Math.sqrt(rnd()) * 330;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z) < PAD_R + 8) continue;
    if (ponds.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 4)) continue;
    if (Math.hypot(x - P.village.x, z - P.village.z) < 20) continue;
    if (out.some((q) => Math.hypot(q.x - x, q.z - z) < 34)) continue;
    // 너무 가파른 곳은 피한다
    const e = 1.2, sl = Math.hypot(moonHeight(x + e, z) - moonHeight(x - e, z), moonHeight(x, z + e) - moonHeight(x, z - e)) / (2 * e);
    if (sl > 0.45) continue;
    out.push({ x, z });
  }
  return out;
}

/** 캡슐도 economy 도 없을 때 우주상자 대체 표(5.4 우주상자) — 월석 2~4 40% · 별가루 3~8 30% · 코인 20% · 레시피 8% · 헬멧 2% */
export function fallbackSpaceLoot(r: () => number): Array<{ id: string; n: number }> {
  const x = r();
  if (x < 0.4) return [{ id: 'm_moonrock', n: 2 + Math.floor(r() * 3) }];
  if (x < 0.7) return [{ id: 'm_stardust', n: 3 + Math.floor(r() * 6) }];
  if (x < 0.9) return [{ id: 'coins', n: Math.round((3000 + r() * 5000) / 10) * 10 }];
  if (x < 0.98) return [{ id: 'recipe:r_space_lamp', n: 1 }];
  return [{ id: 'stars', n: 30 }];
}

// ───────────── 행성 등록소 ─────────────
/** 등록소 행성 — api.PlanetDef + 선택 필드(가두기 반경 비율) */
export type PlanetEntry = PlanetDef & { clampFrac?: number };

/** 월드 (x, z) 가 행성 영역이면 국소 좌표 */
export function toLocal(def: Pick<PlanetDef, 'origin'>, x: number, z: number) { return { x: x - def.origin.x, z: z - def.origin.z }; }

/** 땅 공급자 값: 행성 반경 × GROUND_FRAC 안이면 월드 높이, 아니면 null */
export function planetGround(def: PlanetEntry, x: number, z: number): number | null {
  const l = toLocal(def, x, z);
  if (l.x * l.x + l.z * l.z > (def.radius * GROUND_FRAC) ** 2) return null;
  const h = def.heightAt(l.x, l.z);
  return Number.isFinite(h) ? def.origin.y + h : null;
}

/** 가두기: 행성 가장자리(반경 × clampFrac) 밖이면 안쪽 점(월드), 아니면 null. 아주 멀면(다른 곳으로 순간이동) 건드리지 않는다 */
export function clampToPlanet(def: PlanetEntry, x: number, z: number): P2 | null {
  const l = toLocal(def, x, z);
  const R = Math.hypot(l.x, l.z), lim = def.radius * (def.clampFrac ?? CLAMP_FRAC);
  if (R <= lim || R > def.radius * 4) return null;
  const k = lim / R;
  return { x: def.origin.x + l.x * k, z: def.origin.z + l.z * k };
}

/** 바닥 안전망: 땅보다 0.25 m 넘게 아래면 올릴 높이, 아니면 null */
export function floorRescue(def: PlanetEntry, x: number, y: number, z: number): number | null {
  const g = planetGround(def, x, z);
  if (g === null) return null;
  return y < g - 0.25 ? g + 0.05 : null;
}

/** 행성 등록소(순수 — 씬에 붙이는 건 space.ts 몫) */
export class PlanetRegistry {
  defs = new Map<string, PlanetEntry>();
  spawners = new Map<string, PlanetSpawner[]>();
  register(def: PlanetEntry) {
    if (!def || !def.id) throw new Error('[space] registerPlanet: id 가 필요해요');
    this.defs.set(def.id, def);
  }
  get(id: string) { return this.defs.get(id) ?? null; }
  /** 같은 id 스포너를 다시 넣으면 바꿔 끼운다. 새로 넣었으면 true */
  addSpawn(planetId: string, s: PlanetSpawner): boolean {
    const list = this.spawners.get(planetId) ?? [];
    const i = list.findIndex((x) => x.id === s.id);
    if (i >= 0) list[i] = s; else list.push(s);
    this.spawners.set(planetId, list);
    return i < 0;
  }
  spawnersOf(planetId: string): PlanetSpawner[] { return this.spawners.get(planetId) ?? []; }
  /** 월드 점이 든 행성(가장 가까운 origin, 반경 × GROUND_FRAC 안) */
  planetAt(x: number, z: number): PlanetEntry | null {
    let best: PlanetEntry | null = null, bd = Infinity;
    for (const d of this.defs.values()) {
      const l = toLocal(d, x, z), r = Math.hypot(l.x, l.z);
      if (r <= d.radius * GROUND_FRAC && r < bd) { bd = r; best = d; }
    }
    return best;
  }
  list() { return [...this.defs.values()]; }
}

/** 행성 중력: 음수면 그대로(m/s²), 0~1.5 면 지구(−22) 배율(GDD 6.4 표 — 0 '둥둥'도 아주 약하게는 떨어진다) */
export function gravityOf(g: number): number {
  if (!Number.isFinite(g)) return MOON_GRAVITY;
  if (g < 0) return g;
  if (g <= 1.5) return -22 * Math.max(0.03, g);
  return -g;
}

/** 행성 기본 도착 자리(월드): origin + (0, 높이 + 0.2, 반경 2%) */
export function defaultSpawn(def: PlanetEntry): THREE.Vector3 {
  const lz = Math.max(6, def.radius * 0.02);
  return new THREE.Vector3(def.origin.x, def.origin.y + def.heightAt(0, lz) + 0.2, def.origin.z + lz);
}

// ───────────── 하루 기록 ─────────────
/** flags.space.daily — 그날 이미 딴 것(달꽃·월석·별가루) */
export interface DailyLog { day: number; done: Record<string, 1> }
/** 날이 바뀌었으면 비운다. 그날 기록을 돌려준다 */
export function dailyFor(log: DailyLog | undefined, day: number): DailyLog {
  if (!log || log.day !== day || typeof log.done !== 'object') return { day, done: {} };
  return log;
}

// ───────────── E 고르기 ─────────────
/** 달 E 행동이 내미는 거리 상한 — 우주를 모르는 공급자(낚시 고정 1.6 등)보다 늘 가깝게 */
export const ACT_DIST_MAX = 1.2;
/** 실제 거리 d(m) → 내미는 거리: 순서는 그대로(단조 증가), 값은 [0, ACT_DIST_MAX) 로 눌러 담는다 */
export function actRank(d: number): number {
  const x = Math.max(0, d);
  return (ACT_DIST_MAX * x) / (x + ACT_DIST_MAX);
}
