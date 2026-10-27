// 행성 P1(GDD 3.9 P1 · 6.4) 순수 로직 — 화면·WebGL 없이 테스트할 수 있는 것만:
// 행성 표(이름·중력·반경·여행 별 값·이전 행성), 행성마다 지형 높이(국소 좌표), 지형 특징(사탕 고리·젤리 바다·구름섬·소행성·정거장·도넛),
// 해금 사슬(이전 행성 방문 + 별 값 · 까만 도넛은 일식 때만), 미끄럼(마찰)·트램펄린 튕김·가변 중력, 별공룡 친해지기 하트, 낚시 구역·입질.
// 좌표 약속은 space 와 같다: '국소' = 행성 origin 기준(x, z), 높이 함수는 국소 좌표 → 국소 높이(origin.y 기준).
import { todOf } from '../../core/api';
import { rngFor } from '../../core/rng';

// ───────────── 행성 표 ─────────────
export type PlanetId = 'sugar' | 'jelly' | 'frost' | 'cloud' | 'belt' | 'station' | 'blackhole';
/** 여행 순서(앞 행성을 다녀와야 다음 행성이 열린다). 첫 행성의 앞은 토끼달 */
export const PLANET_ORDER: readonly PlanetId[] = ['sugar', 'jelly', 'frost', 'cloud', 'belt', 'station', 'blackhole'];
/** 행성 사이 간격(m) — SPACE_ORIGIN + (순번 × 3000, 0, 0). 달 청크(900 m + 칸 200 m)와 겹치지 않게 넉넉히 */
export const PLANET_GAP = 3000;
/** 모든 행성 땅의 기준 높이 — 지구 바다 높이(0)보다 넉넉히 위라 우주에서 '수영'이 되지 않는다 */
export const BASE = 12;

export interface PlanetInfo {
  id: PlanetId;
  name: string;
  /** SPACE_ORIGIN 에서 몇 번째 칸(1..7) */
  idx: number;
  /** 행성 반경(m) */
  radius: number;
  /** 가두기 반경 비율(space 의 clampFrac) */
  clampFrac: number;
  /** 중력(지구 −22 배율, GDD 6.4) — 까만 도넛은 들어갈 때 값이고 실제로는 가변 */
  gravity: number;
  /** 처음 갈 때 내는 별(★) */
  cost: number;
  /** 이 행성을 다녀와야 열린다 */
  prev: PlanetId | 'moon';
  /** 대표색(배너·지도) · 짙은 색 */
  color: string;
  dark: string;
  icon: string;
  /** 한 줄 소개 */
  sub: string;
  /** 도착 자리(국소) */
  spawn: { x: number; z: number };
  /** 여행 정류장 표지판(국소) */
  stop: { x: number; z: number };
}

export const PLANETS: readonly PlanetInfo[] = [
  { id: 'sugar', name: '슈가링', idx: 1, radius: 200, clampFrac: 0.95, gravity: 0.5, cost: 10, prev: 'moon', color: '#ff9fc8', dark: '#6b3358', icon: '🍬',
    sub: '분홍 사탕 고리 행성 · 고리 위를 서핑보드로!', spawn: { x: 0, z: 10 }, stop: { x: 6, z: 6 } },
  { id: 'jelly', name: '젤리별', idx: 2, radius: 190, clampFrac: 0.95, gravity: 0.7, cost: 15, prev: 'sugar', color: '#ffb0e0', dark: '#5d2f6b', icon: '🍮',
    sub: '말랑 젤리 바다 · 바닥이 통통 트램펄린', spawn: { x: 0, z: 10 }, stop: { x: 6, z: 6 } },
  { id: 'frost', name: '서리볼', idx: 3, radius: 180, clampFrac: 0.95, gravity: 0.4, cost: 20, prev: 'jelly', color: '#bfe9ff', dark: '#33507a', icon: '❄️',
    sub: '얼음별 · 미끌미끌 다 미끄러져요', spawn: { x: 0, z: 10 }, stop: { x: 6, z: 6 } },
  { id: 'cloud', name: '솜사탕 성운', idx: 4, radius: 230, clampFrac: 0.95, gravity: 0.04, cost: 25, prev: 'frost', color: '#ffd6f0', dark: '#5a3a78', icon: '☁️',
    sub: '땅 없는 구름 군도 · 둥둥 떠다녀요', spawn: { x: 0, z: 6 }, stop: { x: 5, z: 2 } },
  { id: 'belt', name: '자갈띠', idx: 5, radius: 240, clampFrac: 0.95, gravity: 0.05, cost: 30, prev: 'cloud', color: '#d8c8ff', dark: '#3b3566', icon: '☄️',
    sub: '소행성대 · 바위 사이를 폴짝, 운석 캐기', spawn: { x: 0, z: 10 }, stop: { x: 6, z: 6 } },
  { id: 'station', name: '별다방', idx: 6, radius: 110, clampFrac: 0.58, gravity: 1, cost: 20, prev: 'belt', color: '#ffe3a8', dark: '#4a3b2a', icon: '☕',
    sub: '우주정거장 허브 · 꾸물이 상점과 친구 모임', spawn: { x: 0, z: 26 }, stop: { x: 7, z: 30 } },
  { id: 'blackhole', name: '까만 도넛', idx: 7, radius: 170, clampFrac: 0.94, gravity: 0.45, cost: 50, prev: 'station', color: '#c9a2ff', dark: '#2a2140', icon: '🍩',
    sub: '블랙홀 끝판 · 일식 때만 열려요 · 중력이 출렁출렁', spawn: { x: 0, z: 100 }, stop: { x: 6, z: 96 } },
];
export const PLANET_BY_ID = new Map<string, PlanetInfo>(PLANETS.map((p) => [p.id, p]));
export const isPlanetId = (id: unknown): id is PlanetId => typeof id === 'string' && PLANET_BY_ID.has(id);

/** 행성 origin(월드) — base 는 SPACE_ORIGIN */
export function planetOrigin(base: { x: number; y: number; z: number }, idx: number) {
  return { x: base.x + idx * PLANET_GAP, y: base.y, z: base.z };
}

// ───────────── 높이 도우미 ─────────────
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const gauss = (d2: number, s: number) => Math.exp(-d2 / (2 * s * s));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 가장자리: 반경 93% 밖은 둥글게 떨어져 작은 별 수평선이 보이게 */
function edgeFall(R: number, radius: number) { const f = Math.max(0, R - radius * 0.93); return f * f * 0.03; }
/** 도착 자리 둘레를 평평하게 다진다 */
function flatten(h: number, x: number, z: number, at: { x: number; z: number }, to: number, r0 = 7, r1 = 13) {
  const d = Math.hypot(x - at.x, z - at.z);
  return d < r1 ? lerp(h, to, 1 - smooth(r0, r1, d)) : h;
}

// ───────────── 슈가링: 사탕 고리 ─────────────
/** 고리(서핑 길) 반경 · 반폭 · 볼록 높이 */
export const SUGAR_RING = { r: 120, half: 9, lift: 2.4 } as const;
/** 사탕 언덕(국소) */
const SUGAR_HILLS: ReadonlyArray<[number, number, number, number]> = [[-70, -60, 7, 18], [80, -40, 5, 15], [-40, 75, 6, 16], [150, 90, 4, 14], [-150, 20, 5, 16]];
export function sugarHeight(x: number, z: number) {
  const R = Math.hypot(x, z);
  let h = BASE + 1.1 * Math.sin(x * 0.03 + 0.5) * Math.cos(z * 0.027) + 0.45 * Math.sin(x * 0.07 + z * 0.05) + 0.18 * Math.sin(x * 0.4 - z * 0.33);
  for (const [hx, hz, a, s] of SUGAR_HILLS) h += a * gauss((x - hx) ** 2 + (z - hz) ** 2, s);
  // 고리 길: 단면이 둥근 사탕 띠(가운데는 살짝 평평해서 서핑이 매끄럽다)
  const u = Math.abs(R - SUGAR_RING.r) / SUGAR_RING.half;
  if (u < 1.6) {
    const bump = u < 1 ? 1 - 0.25 * u * u : Math.max(0, 0.75 - (u - 1) * 1.25);
    h = lerp(h, BASE + 0.4, smooth(1.6, 0.6, u) * 0.85) + SUGAR_RING.lift * bump;
  }
  h = flatten(h, x, z, PLANET_BY_ID.get('sugar')!.spawn, BASE + 0.3);
  return h - edgeFall(R, 200);
}
/** 고리 위인가(서핑 가능) */
export const onSugarRing = (x: number, z: number) => Math.abs(Math.hypot(x, z) - SUGAR_RING.r) < SUGAR_RING.half;

// ───────────── 젤리별: 젤리 언덕 · 젤리 바다 ─────────────
export const JELLY_SEA = { x: 60, z: -50, r: 36 } as const;
/** 젤리 바다 표면(국소 높이) */
export const JELLY_SEA_Y = BASE - 1.2;
const JELLY_DOMES: ReadonlyArray<[number, number, number, number]> = [[-60, -30, 8, 14], [-30, 70, 6, 12], [70, 60, 9, 15], [-110, 50, 7, 13], [120, -100, 6, 12], [-90, -110, 8, 14], [20, 140, 5, 11]];
export function jellyHeight(x: number, z: number) {
  const R = Math.hypot(x, z);
  let h = BASE + 0.9 * Math.sin(x * 0.05) * Math.sin(z * 0.045 + 0.7) + 0.35 * Math.sin(x * 0.13 + z * 0.09);
  for (const [dx, dz, a, s] of JELLY_DOMES) h += a * gauss((x - dx) ** 2 + (z - dz) ** 2, s);
  const ds = Math.hypot(x - JELLY_SEA.x, z - JELLY_SEA.z);
  if (ds < JELLY_SEA.r * 1.4) h = lerp(h, JELLY_SEA_Y, 1 - smooth(JELLY_SEA.r * 0.9, JELLY_SEA.r * 1.4, ds));
  h = flatten(h, x, z, PLANET_BY_ID.get('jelly')!.spawn, BASE + 0.2);
  return h - edgeFall(R, 190);
}
export const inJellySea = (x: number, z: number, k = 0.92) => Math.hypot(x - JELLY_SEA.x, z - JELLY_SEA.z) < JELLY_SEA.r * k;

// ───────────── 서리볼: 눈 둔덕 · 얼음판 ─────────────
export const FROST_RINKS: ReadonlyArray<{ x: number; z: number; r: number }> = [{ x: -50, z: -40, r: 26 }, { x: 70, z: 30, r: 22 }, { x: -20, z: 90, r: 20 }];
export const IGLOO = { x: -80, z: 50 } as const;
const FROST_MOUNDS: ReadonlyArray<[number, number, number, number]> = [[40, -90, 9, 16], [-110, -20, 7, 14], [110, 100, 8, 15], [-60, 140, 6, 13], [130, -40, 7, 13]];
export function frostHeight(x: number, z: number) {
  const R = Math.hypot(x, z);
  let h = BASE + 0.8 * Math.sin(x * 0.04 + 1.1) * Math.cos(z * 0.035) + 0.3 * Math.sin(x * 0.11 - z * 0.08);
  for (const [mx, mz, a, s] of FROST_MOUNDS) h += a * gauss((x - mx) ** 2 + (z - mz) ** 2, s);
  for (const r of FROST_RINKS) {
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < r.r * 1.5) h = lerp(h, BASE - 0.2, 1 - smooth(r.r * 0.95, r.r * 1.5, d));
  }
  h = flatten(h, x, z, IGLOO, BASE + 0.4, 6, 11);
  h = flatten(h, x, z, PLANET_BY_ID.get('frost')!.spawn, BASE + 0.2);
  return h - edgeFall(R, 180);
}
/** 반짝이는 얼음판 정도 0..1 */
export function rinkAt(x: number, z: number) {
  let k = 0;
  for (const r of FROST_RINKS) k = Math.max(k, 1 - smooth(r.r * 0.85, r.r * 1.05, Math.hypot(x - r.x, z - r.z)));
  return k;
}

// ───────────── 솜사탕 성운: 구름섬 · 구름바다 ─────────────
/** 구름바다(낚시 zone cloudsea) 표면 국소 높이 */
export const CLOUD_SEA_Y = BASE - 4;
export interface CloudIsle { x: number; z: number; r: number; top: number }
/** 구름섬(첫 섬이 도착 자리) */
export const CLOUD_ISLES: readonly CloudIsle[] = [
  { x: 0, z: 0, r: 26, top: BASE + 1 }, { x: -62, z: -38, r: 18, top: BASE + 5 }, { x: 58, z: -52, r: 20, top: BASE + 3 },
  { x: 72, z: 40, r: 16, top: BASE + 8 }, { x: -48, z: 66, r: 19, top: BASE + 4 }, { x: -120, z: 10, r: 22, top: BASE + 9 },
  { x: 10, z: -120, r: 17, top: BASE + 11 }, { x: 128, z: -10, r: 18, top: BASE + 6 }, { x: 40, z: 130, r: 21, top: BASE + 7 },
  { x: -100, z: -120, r: 16, top: BASE + 12 }, { x: 140, z: 120, r: 15, top: BASE + 10 },
];
/** 그 자리 구름섬(가장 가까운, 반경 1.05 안) */
export function cloudIsleAt(x: number, z: number): CloudIsle | null {
  let best: CloudIsle | null = null, bd = Infinity;
  for (const c of CLOUD_ISLES) { const d = Math.hypot(x - c.x, z - c.z) / c.r; if (d < 1.05 && d < bd) { bd = d; best = c; } }
  return best;
}
export function cloudHeight(x: number, z: number) {
  const R = Math.hypot(x, z);
  // 구름바다: 뭉게뭉게 잔물결
  let h = CLOUD_SEA_Y + 0.35 * Math.sin(x * 0.09 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.08) + 0.15 * Math.sin(x * 0.31 + z * 0.27);
  for (const c of CLOUD_ISLES) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d > 1.35) continue;
    // 위는 둥근 솜사탕 언덕, 가장자리는 몽실 떨어진다
    const top = c.top + 1.4 * (1 - d * d) + 0.4 * Math.sin(x * 0.4 + z * 0.3);
    const k = 1 - smooth(0.78, 1.3, d);
    h = Math.max(h, lerp(CLOUD_SEA_Y, top, k));
  }
  h = flatten(h, x, z, PLANET_BY_ID.get('cloud')!.spawn, CLOUD_ISLES[0].top + 1.2, 5, 10);
  return h - edgeFall(R, 230);
}
/** 구름바다 위인가(섬 밖) */
export const onCloudSea = (x: number, z: number) => !CLOUD_ISLES.some((c) => Math.hypot(x - c.x, z - c.z) < c.r * 1.12);

// ───────────── 자갈띠: 떠 있는 소행성 ─────────────
/** 바닥(별먼지 들판) 국소 높이 */
export const BELT_FLOOR = BASE - 6;
export interface Asteroid { x: number; z: number; y: number; r: number; squash: number; spin: number; ore: number }
let beltCache: Asteroid[] | null = null;
/** 떠 있는 소행성 26개(국소, 결정적). y = 바위 가운데 높이. ore = 운석 광맥 수 */
export function beltRocks(): Asteroid[] {
  if (beltCache) return beltCache;
  const out: Asteroid[] = [];
  const r = rngFor('planets:belt:rocks');
  // 도착 자리 앞 디딤돌(점프 연습)
  out.push({ x: -8, z: -12, y: BELT_FLOOR + 5, r: 5, squash: 0.6, spin: 0.4, ore: 1 }, { x: 10, z: -30, y: BELT_FLOOR + 10, r: 6.5, squash: 0.58, spin: 1.3, ore: 2 });
  for (let i = 0; i < 3000 && out.length < 26; i++) {
    const a = r() * Math.PI * 2, rr = 30 + Math.sqrt(r()) * 180;
    const rad = 5 + r() * r() * 14;
    const c: Asteroid = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: BELT_FLOOR + 6 + r() * 34, r: rad, squash: 0.5 + r() * 0.25, spin: r() * 6.28, ore: r() < 0.6 ? 1 + Math.floor(r() * 2) : 0 };
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < (o.r + c.r) * 1.25)) continue;
    if (Math.hypot(c.x, c.z) < 18) continue;
    out.push(c);
  }
  return (beltCache = out);
}
export function beltHeight(x: number, z: number) {
  const R = Math.hypot(x, z);
  let h = BELT_FLOOR + 0.9 * Math.sin(x * 0.06 + 0.3) * Math.cos(z * 0.05) + 0.4 * Math.sin(x * 0.17 - z * 0.13) + 0.15 * Math.sin(x * 0.6 + z * 0.45);
  // 작은 언덕(바닥에도 결이 보이게)
  h += 3 * gauss(x * x + (z + 70) ** 2, 22) + 2.5 * gauss((x - 90) ** 2 + (z - 60) ** 2, 18);
  h = flatten(h, x, z, PLANET_BY_ID.get('belt')!.spawn, BELT_FLOOR + 0.6, 7, 13);
  return h - edgeFall(R, 240);
}
/** 바위 윗면 높이(국소) — 바위 위가 아니면 null. 높이 = 가운데 + 반지름 × 납작 비율 × 둥근 윗면 */
export function rockTopAt(x: number, z: number, rocks: readonly Asteroid[] = beltRocks()): number | null {
  let best: number | null = null;
  for (const a of rocks) {
    const d = Math.hypot(x - a.x, z - a.z) / a.r;
    if (d >= 0.95) continue;
    const y = a.y + a.r * a.squash * Math.sqrt(1 - d * d);
    if (best === null || y > best) best = y;
  }
  return best;
}

// ───────────── 별다방: 정거장 ─────────────
/** 갑판 반경 · 가운데 카페 단 */
export const STATION = { deck: 64, cafe: { x: 0, z: 0, r: 14 }, shop: { x: -26, z: -14 }, latte: { x: 0, z: -10 }, benches: [{ x: 24, z: 10 }, { x: 20, z: -20 }, { x: -18, z: 22 }] } as const;
export function stationHeight(x: number, z: number) {
  const R = Math.hypot(x, z);
  let h = BASE;
  // 가운데 카페 단(살짝 높고 둘레가 완만한 경사)
  h += 0.5 * (1 - smooth(STATION.cafe.r, STATION.cafe.r + 4, Math.hypot(x - STATION.cafe.x, z - STATION.cafe.z)));
  // 갑판 밖은 뚝(난간 너머)
  if (R > STATION.deck) h -= (R - STATION.deck) * 1.6 + (R - STATION.deck) ** 2 * 0.05;
  return h;
}

// ───────────── 까만 도넛 ─────────────
/** 도넛 고리(안 반경 · 가운데 · 반폭) · 블랙홀 구멍 반경(낚시 zone blackhole) */
export const DONUT = { rIn: 40, rMid: 100, half: 60, hole: 34 } as const;
export function donutHeight(x: number, z: number) {
  const R = Math.hypot(x, z);
  const u = (R - DONUT.rMid) / DONUT.half;
  let h: number;
  if (Math.abs(u) <= 1) h = BASE - 8 + 14 * Math.sqrt(1 - u * u);
  else h = BASE - 8 - (Math.abs(u) - 1) * 6;
  // 반죽 결(작은 울퉁불퉁)
  h += 0.3 * Math.sin(Math.atan2(z, x) * 9 + R * 0.05) + 0.2 * Math.sin(x * 0.2 + z * 0.17);
  // 구멍 안쪽은 깔때기(바닥은 바다보다 위)
  if (R < DONUT.rIn) h = Math.max(2.5, lerp(BASE - 8, 2.5, 1 - R / DONUT.rIn));
  return h - edgeFall(R, 170);
}
/** 까만 도넛 가변 중력(지구 배율) — 20초 주기로 출렁 + 구멍 가까이 갈수록 무겁다 */
export function donutGravity(t: number, R: number) {
  const wave = 0.45 + 0.3 * Math.sin((t / 20) * Math.PI * 2);
  const well = 1 + 1.1 * (1 - smooth(DONUT.rIn, DONUT.rMid, R));
  return Math.min(1.4, Math.max(0.12, wave * well));
}

// ───────────── 높이 표 ─────────────
export const HEIGHTS: Record<PlanetId, (x: number, z: number) => number> = {
  sugar: sugarHeight, jelly: jellyHeight, frost: frostHeight, cloud: cloudHeight, belt: beltHeight, station: stationHeight, blackhole: donutHeight,
};

// ───────────── 중력·가두기 ─────────────
/** 지구 배율 → 가속(m/s², space 의 gravityOf 와 같은 식 — 0 '둥둥'도 아주 약하게는 떨어진다) */
export const gravityAccel = (g: number) => -22 * Math.max(0.03, g);
/** 가두기: 국소 (x, z) 가 행성 가장자리(반경 × clampFrac) 밖이면 안쪽 점 */
export function clampLocal(p: Pick<PlanetInfo, 'radius' | 'clampFrac'>, x: number, z: number): { x: number; z: number } | null {
  const R = Math.hypot(x, z), lim = p.radius * p.clampFrac;
  if (R <= lim) return null;
  const k = lim / R;
  return { x: x * k, z: z * k };
}

// ───────────── 미끄럼·튕김 ─────────────
/** 서리볼 마찰 */
export const FROST_FRICTION = 0.05;
/**
 * 마찰 섞기: 플레이어가 이번 프레임에 맞춘 속도(cur) 쪽으로 prev 에서 k 만큼만 간다. friction 1 = 그대로, 0.05 = 미끌미끌.
 * 플레이어 가속(바닥 14/s)에 곱해지는 셈이라 프레임 속도와 거의 상관없다.
 */
export function slideBlend(prev: { x: number; z: number }, cur: { x: number; z: number }, friction: number) {
  const k = Math.min(1, Math.max(0.02, friction / 0.55));
  return { x: prev.x + (cur.x - prev.x) * k, z: prev.z + (cur.z - prev.z) * k };
}
/**
 * 트램펄린: 떨어지던 속도(음수) → 튕겨 오르는 속도(0 = 안 튕김). rest 0.82 젤리 / 0.5 구름.
 * 덧셈 없이 rest 만 곱해서 통통통… 점점 낮아지다가 min 아래로 떨어지면 멈춰 선다(가만히 서 있을 수 있게).
 */
export function bounceVel(impactVy: number, rest = 0.82, min = 5, max = 18) {
  if (!(impactVy < -min)) return 0;
  return Math.min(max, -impactVy * rest);
}
/** 젤리 위 점프는 더 높이 */
export const JELLY_JUMP_MUL = 1.45;

// ───────────── 해금 사슬 ─────────────
export interface TravelState {
  /** 다녀온 곳인가('moon' 포함) */
  visited(id: string): boolean;
  /** 별을 이미 냈나(냈는데 아직 못 갔을 때) */
  paid(id: string): boolean;
  stars: number;
  eclipse: boolean;
  /** 별 없이(치트·하늘고래 친구) */
  free?: boolean;
}
export type TravelWhy = 'unknown' | 'eclipse' | 'locked' | 'stars';
export interface TravelCheck { ok: boolean; cost: number; why?: TravelWhy; need?: string }
/** 그 행성으로 갈 수 있나 · 낼 별 */
export function travelCheck(id: string, s: TravelState): TravelCheck {
  const p = PLANET_BY_ID.get(id);
  if (!p) return { ok: false, cost: 0, why: 'unknown' };
  if (p.id === 'blackhole' && !s.eclipse) return { ok: false, cost: 0, why: 'eclipse' };
  if (s.visited(id) || s.paid(id)) return { ok: true, cost: 0 };
  if (!s.visited(p.prev)) return { ok: false, cost: p.cost, why: 'locked', need: p.prev };
  if (s.free) return { ok: true, cost: 0 };
  if (s.stars < p.cost) return { ok: false, cost: p.cost, why: 'stars' };
  return { ok: true, cost: p.cost };
}
/** 막힌 까닭(귀여운 말투) */
export function travelWhyText(c: TravelCheck): string {
  switch (c.why) {
    case 'eclipse': return '일식 때만 열려요 🌑';
    case 'locked': return `${c.need === 'moon' ? '토끼달' : PLANET_BY_ID.get(c.need ?? '')?.name ?? '이전 행성'}부터 다녀와요!`;
    case 'stars': return `별 ★${c.cost}개가 필요해요`;
    case 'unknown': return '모르는 행성이에요';
    default: return c.cost > 0 ? `★${c.cost}` : '갈 수 있어요';
  }
}
/** 해금 키 */
export const planetKey = (id: string) => `space:planet:${id}`;

// ───────────── 별공룡 친해지기 ─────────────
export const STARSAURUS_MAX = 5;
export interface SaurState { hearts: number; day: number; gain: number; fed: number }
/** 별사과 하나 먹이기: 하루에 하트 1개까지(최대 5) */
export function feedSaur(s: SaurState | undefined, day: number): { st: SaurState; gain: number; max: boolean } {
  const st: SaurState = s && typeof s.hearts === 'number' ? { ...s } : { hearts: 0, day: -1, gain: 0, fed: 0 };
  if (st.day !== day) { st.day = day; st.gain = 0; }
  st.fed++;
  if (st.hearts >= STARSAURUS_MAX) return { st, gain: 0, max: true };
  if (st.gain >= 1) return { st, gain: 0, max: false };
  st.hearts++; st.gain++;
  return { st, gain: 1, max: st.hearts >= STARSAURUS_MAX };
}
/** 달 별공룡 둥지(GDD 6.3 표, 토끼달 국소 좌표) */
export const MOON_NEST = { x: 150, z: -220 } as const;

// ───────────── 낚시 ─────────────
export type FishZone = 'cloudsea' | 'jellysea' | 'blackhole';
/** 낚시 구역이 있는 행성 → 섬 id(물고기 where.island) */
export const FISH_ZONES: Partial<Record<PlanetId, { zone: FishZone; island: string; name: string }>> = {
  cloud: { zone: 'cloudsea', island: 'cloud', name: '구름바다' },
  jelly: { zone: 'jellysea', island: 'jelly', name: '젤리 바다' },
  blackhole: { zone: 'blackhole', island: 'blackhole', name: '블랙홀' },
};
/** 국소 점이 그 행성 낚시 구역 물(찌가 앉는 곳)인가 */
export function fishZoneAt(id: string, x: number, z: number): FishZone | null {
  if (id === 'cloud') return onCloudSea(x, z) ? 'cloudsea' : null;
  if (id === 'jelly') return inJellySea(x, z) ? 'jellysea' : null;
  if (id === 'blackhole') return Math.hypot(x, z) < DONUT.hole ? 'blackhole' : null;
  return null;
}
/** 찌가 앉는 높이(국소) */
export function fishSurfaceY(id: string, x: number, z: number): number {
  if (id === 'cloud') return CLOUD_SEA_Y + 0.3;
  if (id === 'jelly') return JELLY_SEA_Y + 0.25;
  return donutHeight(x, z) + 0.4;
}
/** 입질까지(초) · 챔질 시간(초) */
export const biteDelay = (r: number) => 2.2 + r * 4;
export const BITE_WINDOW = 1.1;

/** where 줄 시간 표기가 지금 시각에 맞나('all' · 'day' · ['sunset','night'] …) */
export function timeOk(time: string | string[] | undefined, hour: number): boolean {
  if (time == null) return true;
  const ts = Array.isArray(time) ? time : [time];
  if (!ts.length) return true;
  const tod = todOf(hour);
  return ts.some((t) => t === 'all' || t === 'any' || t === 'always' || t === '종일' || t === tod);
}
interface WhereLike { island?: string; zone?: string; time?: string | string[]; weather?: { only?: string[] }; moon?: string }
/** 그 구역·시각에 나오는 종만(날씨 only 는 우주 유성우 여부로, moon:'eclipse' 는 일식 때만) */
export function zonePool<T extends { where?: WhereLike[] }>(all: Iterable<T>, island: string, zone: string, hour: number, meteor: boolean, eclipse = false): T[] {
  const out: T[] = [];
  for (const s of all) {
    const ws = s.where ?? [];
    if (ws.some((w) => w.island === island && w.zone === zone && timeOk(w.time, hour) && (!w.weather?.only?.length || (meteor && w.weather.only.includes('meteor'))) && (w.moon !== 'eclipse' || eclipse))) out.push(s);
  }
  return out;
}

// ───────────── 생물 배치 ─────────────
export type When = 'all' | 'day' | 'night' | 'sunset' | 'meteor' | 'meteorNight';
/** 우주 유성우: 별똥별섬(launch)에 유성우가 오거나 일요일 밤(유성의 밤) */
export function spaceMeteor(o: { weatherLaunch?: string | null; weekday?: number; hour: number }) {
  if (o.weatherLaunch === 'meteor') return true;
  const t = todOf(o.hour);
  return o.weekday === 6 && (t === 'night' || t === 'sunset');
}
/** 지금 나와 있을 때인가 */
export function whenOk(w: When, hour: number, meteor: boolean) {
  const t = todOf(hour);
  switch (w) {
    case 'day': return t === 'day' || t === 'morning';
    case 'night': return t === 'night';
    case 'sunset': return t === 'sunset';
    case 'meteor': return meteor;
    case 'meteorNight': return meteor && (t === 'night' || t === 'sunset');
    default: return true;
  }
}
export type How = 'net' | 'grab' | 'shear' | 'lift' | 'pet' | 'pickup';
export interface SpawnRow {
  /** 종 id(state.byGdd 로 찾는다 — space 가 등록) */
  species: string;
  n: number;
  how: How;
  when: When;
  /** 떠 있는 높이(m) */
  hover?: number;
  /** 배치 범위(국소): 원 · 고리 · 구름섬 위 · 소행성 위 */
  area: { kind: 'disc'; x: number; z: number; r: number } | { kind: 'ring'; r: number; half: number } | { kind: 'isles' } | { kind: 'rocks' };
  /** 모델 배율 */
  scale?: number;
}
export const SPAWNS: Partial<Record<PlanetId, SpawnRow[]>> = {
  sugar: [
    { species: 's_cotton_sheep', n: 4, how: 'shear', when: 'all', area: { kind: 'disc', x: -40, z: 30, r: 60 } },
    { species: 's_ring_snake', n: 4, how: 'net', when: 'all', area: { kind: 'ring', r: SUGAR_RING.r, half: 6 } },
  ],
  jelly: [
    { species: 's_jelly_bear', n: 6, how: 'net', when: 'day', area: { kind: 'disc', x: -20, z: 20, r: 80 } },
  ],
  frost: [
    { species: 's_crystal_hedgehog', n: 4, how: 'grab', when: 'night', area: { kind: 'disc', x: 10, z: -10, r: 90 } },
  ],
  cloud: [
    { species: 's_balloon_octo', n: 4, how: 'lift', when: 'all', hover: 1.6, area: { kind: 'isles' } },
    { species: 's_sky_whale', n: 1, how: 'pet', when: 'sunset', hover: 6, scale: 2.4, area: { kind: 'disc', x: 20, z: -30, r: 10 } },
  ],
  belt: [
    { species: 's_ufo_jelly', n: 3, how: 'net', when: 'meteor', hover: 1.8, area: { kind: 'rocks' } },
    { species: 's_comet_fox', n: 1, how: 'net', when: 'meteorNight', area: { kind: 'disc', x: 0, z: -60, r: 40 } },
    { species: 'ring-snail', n: 2, how: 'grab', when: 'all', area: { kind: 'rocks' } },
  ],
  blackhole: [
    { species: 's_little_star', n: 2, how: 'grab', when: 'all', hover: 1.2, area: { kind: 'disc', x: 0, z: 0, r: 50 } },
  ],
};
/** 젤리곰 6색(빨강·주황·노랑·초록·파랑·보라) */
export const JELLY_BEAR_COLORS = ['#ff7a8a', '#ffa24c', '#ffd84a', '#7fdc7a', '#6fb6ff', '#b58cff'] as const;

/** 하늘고래 친구 하트(5 = 행성 사이 공짜로 태워 준다) */
export const WHALE_MAX = 5;
