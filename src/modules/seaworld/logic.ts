// 바다 이벤트(seaworld) 순수 규칙 — three·DOM 없이 테스트한다.
// 해류 고속도로(GDD 2.3 폴리라인을 모서리 둥글게 → 폭 40 m 띠, 가운데 8 m/s) · 소용돌이 회오리 흐름 ·
// 일정표(유령선 = 밤 + 안개, 고래 = 아침 창 + 하루 두 번, 금요일 고래 길은 하루 종일) · 표류 상자 · 소용돌이 상자 ·
// 토요일 해적 상자 · 돌고래 경주 상태 기계 · 갈매기 도둑 고르기 · 블랙박스(한 번만) · flags.seaworld 정리.
import { todOf, weekdayOf } from '../../core/api';
import { rngFor } from '../../core/rng';

// ───────────── 상수 ─────────────
/** GDD 2.3 해류 경로(시계 방향 고리) */
export const CURRENT_PATH: ReadonlyArray<{ x: number; z: number }> = [
  { x: 0, z: 120 }, { x: 900, z: 1050 }, { x: 2150, z: 1050 }, { x: 1750, z: -300 },
  { x: 300, z: -1950 }, { x: -1500, z: -1300 }, { x: -1350, z: 900 }, { x: -200, z: 300 },
];
/** 띠 폭 40 m → 가운데에서 20 m 까지 */
export const BAND_HALF = 20;
/** 이 안쪽은 힘이 꽉 찬다(그 바깥은 가장자리로 갈수록 부드럽게 0) */
export const BAND_CORE = 10;
/** 배로 타면 +8 m/s(GDD 2.3) */
export const CURRENT_SPEED = 8;
/** 수영하면 튜브처럼 떠내려가는 비율(8 × 0.5 = 4 m/s) */
export const SWIM_DRIFT = 0.5;
/** 모서리 둥글리기 반경(m) */
const FILLET_R = 180;
/** 띠 샘플 간격(m) */
const STEP = 10;
/** 격자 칸(m) — 가까운 구간 찾기 */
const CELL = 64;

/** 소용돌이(PLACES.whirlpool 과 같은 값 — 모듈은 PLACES 를 넘겨 쓴다) */
export const WHIRL = { x: 3200, z: -2600, r: 60 } as const;
/** 상자가 도는 고리 반경 = r × 0.8 */
export const WHIRL_RING = 0.8;
/** 소용돌이 흐름이 닿는 반경 = r × 1.6 */
export const WHIRL_REACH = 1.6;
/** 고리 둘레 접선 속도(m/s) */
export const WHIRL_SPIN = 6;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ───────────── 해류 띠 ─────────────
export interface BandHit {
  /** 가운데 선까지 거리(부호 없음) */
  d: number;
  /** 진행 방향 오른쪽(+) / 왼쪽(−) */
  side: number;
  /** 진행 방향 단위 벡터 */
  tx: number; tz: number;
  /** 고리 처음부터 잰 길이(m) */
  s: number;
  /** 가장 가까운 점 */
  px: number; pz: number;
}
export interface CurrentVec { x: number; z: number }

/** 꺾인 폴리라인 → 모서리를 2차 베지어로 둥글린 닫힌 고리 샘플(약 STEP m 간격) */
export function smoothLoop(pts: ReadonlyArray<{ x: number; z: number }>, radius = FILLET_R, step = STEP): Array<{ x: number; z: number }> {
  const n = pts.length;
  const corner: Array<{ a: { x: number; z: number }; p: { x: number; z: number }; b: { x: number; z: number } }> = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p = pts[i], p1 = pts[(i + 1) % n];
    const l0 = Math.hypot(p.x - p0.x, p.z - p0.z), l1 = Math.hypot(p1.x - p.x, p1.z - p.z);
    const d0 = { x: (p.x - p0.x) / l0, z: (p.z - p0.z) / l0 }, d1 = { x: (p1.x - p.x) / l1, z: (p1.z - p.z) / l1 };
    const turn = Math.acos(clamp(d0.x * d1.x + d0.z * d1.z, -1, 1));
    const t = Math.min(radius * Math.tan(turn / 2), 0.45 * Math.min(l0, l1));
    corner.push({ a: { x: p.x - d0.x * t, z: p.z - d0.z * t }, p, b: { x: p.x + d1.x * t, z: p.z + d1.z * t } });
  }
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < n; i++) {
    const c = corner[i], nx = corner[(i + 1) % n];
    // 모서리 곡선(a → b, 조절점 p)
    const arc = Math.hypot(c.p.x - c.a.x, c.p.z - c.a.z) + Math.hypot(c.b.x - c.p.x, c.b.z - c.p.z);
    const k = Math.max(2, Math.ceil(arc / step));
    for (let j = 0; j < k; j++) {
      const u = j / k, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
      out.push({ x: w0 * c.a.x + w1 * c.p.x + w2 * c.b.x, z: w0 * c.a.z + w1 * c.p.z + w2 * c.b.z });
    }
    // 곧은 구간(b → 다음 a)
    const L = Math.hypot(nx.a.x - c.b.x, nx.a.z - c.b.z);
    const m = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < m; j++) {
      const u = j / m;
      out.push({ x: c.b.x + (nx.a.x - c.b.x) * u, z: c.b.z + (nx.a.z - c.b.z) * u });
    }
  }
  return out;
}

/**
 * 해류장: 띠(가까운 구간 찾기 격자) + 소용돌이.
 * fade(x,z) 0..1 = 땅·얕은 물에서 힘을 빼는 배율(모듈은 해저 높이로, 테스트는 기본 1).
 */
export class CurrentField {
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  /** 샘플까지 누적 길이 */
  readonly ss: Float64Array;
  readonly length: number;
  readonly n: number;
  private grid = new Map<string, number[]>();
  constructor(
    pts: ReadonlyArray<{ x: number; z: number }> = CURRENT_PATH,
    readonly fade: (x: number, z: number) => number = () => 1,
    readonly whirl: { x: number; z: number; r: number } | null = WHIRL,
  ) {
    const sm = smoothLoop(pts);
    this.n = sm.length;
    this.xs = new Float64Array(this.n); this.zs = new Float64Array(this.n); this.ss = new Float64Array(this.n + 1);
    for (let i = 0; i < this.n; i++) { this.xs[i] = sm[i].x; this.zs[i] = sm[i].z; }
    let s = 0;
    for (let i = 0; i < this.n; i++) {
      this.ss[i] = s;
      const j = (i + 1) % this.n;
      s += Math.hypot(this.xs[j] - this.xs[i], this.zs[j] - this.zs[i]);
    }
    this.ss[this.n] = s;
    this.length = s;
    // 구간마다 덮는 칸(띠 반폭 + 여유)
    const pad = BAND_HALF + 4;
    for (let i = 0; i < this.n; i++) {
      const j = (i + 1) % this.n;
      const x0 = Math.min(this.xs[i], this.xs[j]) - pad, x1 = Math.max(this.xs[i], this.xs[j]) + pad;
      const z0 = Math.min(this.zs[i], this.zs[j]) - pad, z1 = Math.max(this.zs[i], this.zs[j]) + pad;
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
          const k = cx + ',' + cz;
          let a = this.grid.get(k);
          if (!a) this.grid.set(k, (a = []));
          a.push(i);
        }
      }
    }
  }

  /** 띠 가운데 선에서 가장 가까운 점(띠 근처 칸에 없으면 null) */
  nearest(x: number, z: number): BandHit | null {
    const segs = this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    if (!segs) return null;
    let best: BandHit | null = null, bd = Infinity;
    for (const i of segs) {
      const j = (i + 1) % this.n;
      const ax = this.xs[i], az = this.zs[i], dx = this.xs[j] - ax, dz = this.zs[j] - az;
      const L2 = dx * dx + dz * dz || 1;
      const u = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
      const px = ax + dx * u, pz = az + dz * u;
      const d = Math.hypot(x - px, z - pz);
      if (d < bd) {
        bd = d;
        const L = Math.sqrt(L2);
        const tx = dx / L, tz = dz / L;
        // 진행 방향 기준 오른쪽 = (−tz, tx) … xz 평면에서 tx,tz 를 시계 방향으로 돌린 쪽
        const side = Math.sign((x - px) * -tz + (z - pz) * tx) || 1;
        best = { d, side, tx, tz, s: this.ss[i] + L * u, px, pz };
      }
    }
    return best;
  }

  /** 띠 안인가(폭 40 m) — 땅·얕은 물(fade 0)은 띠가 끊긴다 */
  onBand(x: number, z: number): boolean {
    const h = this.nearest(x, z);
    return !!h && h.d <= BAND_HALF && this.fade(x, z) > 0;
  }

  /** 띠의 힘 0..1(가운데 1, 가장자리 0) */
  bandStrength(d: number): number { return d > BAND_HALF ? 0 : 1 - smooth(BAND_CORE, BAND_HALF, d); }

  /** 소용돌이 흐름(m/s) — 고리(r×0.8)로 모으며 시계 반대 방향으로 돈다. 닿지 않으면 null */
  whirlAt(x: number, z: number): CurrentVec | null {
    const W = this.whirl;
    if (!W) return null;
    const dx = x - W.x, dz = z - W.z, r = Math.hypot(dx, dz);
    const reach = W.r * WHIRL_REACH;
    if (r > reach || r < 1e-6) return r < 1e-6 ? { x: 0, z: 0 } : null;
    const ring = W.r * WHIRL_RING;
    const ux = dx / r, uz = dz / r;
    // 접선(시계 반대: (−uz, ux)) — 고리에서 가장 세고 바깥으로 갈수록 약해진다
    const spin = WHIRL_SPIN * (r < ring ? 0.4 + 0.6 * (r / ring) : 1 - smooth(ring, reach, r));
    // 반지름 방향: 고리보다 바깥이면 안으로, 안쪽이면 밖으로(고리에 모인다)
    const pull = -1.4 * clamp((r - ring) / (W.r * 0.5), -1, 1) * (1 - smooth(ring, reach, r) * 0.6);
    return { x: -uz * spin + ux * pull, z: ux * spin + uz * pull };
  }

  /** 해류 속도(m/s) — 띠 · 소용돌이 밖이면 null(geo.currentAt 계약) */
  at(x: number, z: number): CurrentVec | null {
    const w = this.whirlAt(x, z);
    if (w) return w;
    const h = this.nearest(x, z);
    if (!h || h.d > BAND_HALF) return null;
    const f = this.fade(x, z);
    if (f <= 0) return null;
    const k = CURRENT_SPEED * this.bandStrength(h.d) * clamp(f, 0, 1);
    return { x: h.tx * k, z: h.tz * k };
  }

  /** 고리 위 길이 s 의 점과 진행 방향(물고기·화살표 배치용) */
  pointAt(s: number): { x: number; z: number; tx: number; tz: number } {
    const L = this.length;
    const q = ((s % L) + L) % L;
    let lo = 0, hi = this.n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.ss[mid] <= q) lo = mid; else hi = mid - 1; }
    const i = lo, j = (i + 1) % this.n;
    const segL = this.ss[i + 1] - this.ss[i] || 1, u = (q - this.ss[i]) / segL;
    const dx = this.xs[j] - this.xs[i], dz = this.zs[j] - this.zs[i], l = Math.hypot(dx, dz) || 1;
    return { x: this.xs[i] + dx * u, z: this.zs[i] + dz * u, tx: dx / l, tz: dz / l };
  }

  /** 사각형(청크)과 겹치는 샘플 구간 번호 — 띠 메시를 청크로 자른다 */
  segmentsIn(x0: number, z0: number, x1: number, z1: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.n; i++) {
      const j = (i + 1) % this.n;
      const mx = (this.xs[i] + this.xs[j]) / 2, mz = (this.zs[i] + this.zs[j]) / 2;
      if (mx >= x0 && mx < x1 && mz >= z0 && mz < z1) out.push(i);
    }
    return out;
  }
}

// ───────────── 일정표 ─────────────
/** 유령선 으스스호: 밤(21~05) + 안개일 때만 수면에 뜬다 */
export const ghostSurfaced = (hour: number, weather: string) => todOf(hour) === 'night' && weather === 'fog';

/** 요일 이벤트 기본값(달력 모듈이 없을 때): 금 = 고래 길, 토 = 해적선 보물 */
export const isWhaleRoadDay = (day: number) => weekdayOf(day) === 4;
export const isPirateDay = (day: number) => weekdayOf(day) === 5;

export interface Window { from: number; to: number }
/**
 * 고래 길 혹등고래가 떠오르는 시간 창(게임 시각). 평일 = 아침 06~08 창(GDD d_humpback 아침) + 낮·저녁 1.5시간 창 2개.
 * 금요일(고래 길 이벤트)이나 friday=true 면 하루 종일 확정.
 */
export function whaleWindows(day: number, friday = isWhaleRoadDay(day)): Window[] {
  if (friday) return [{ from: 0, to: 24 }];
  const r = rngFor(`seaworld:whale:${Math.floor(day)}`);
  const a = 9 + Math.floor(r() * 8) * 0.5;            // 09:00 ~ 12:30 시작
  const b = Math.max(a + 2, 14 + Math.floor(r() * 10) * 0.5); // 14:00 ~ 18:30 시작
  return [{ from: 6, to: 8 }, { from: a, to: a + 1.5 }, { from: b, to: b + 1.5 }];
}
export const whaleActive = (day: number, hour: number, friday?: boolean) =>
  whaleWindows(day, friday).some((w) => hour >= w.from && hour < w.to);

/** 혹등고래 숨쉬기 한 바퀴(실제 초) */
export const WHALE_CYCLE = 16;
/** 한 바퀴 안: 0~10초 떠 있음, 2.5~6.5초 물 뿜기 */
export function whalePhase(t: number): { k: number; surf: number; spouting: boolean; cycle: number } {
  const cycle = Math.floor(t / WHALE_CYCLE);
  const k = t - cycle * WHALE_CYCLE;
  const surf = k < 10 ? Math.sin((k / 10) * Math.PI) : 0;
  return { k, surf, spouting: k >= 2.5 && k < 6.5, cycle };
}
/** 고래 분수 하루 최대 보상 횟수 */
export const WHALE_MAX_PER_DAY = 5;
/** 분수 맞기 보상 코인(결정적) — 금요일 ×2 */
export function whaleCoins(day: number, n: number, friday = isWhaleRoadDay(day)): number {
  const r = rngFor(`seaworld:whale-coins:${Math.floor(day)}:${n}`)();
  return (300 + Math.floor(r * 8) * 50) * (friday ? 2 : 1);
}
/** 무지개 코인 비 — 떨어지는 동전 개수(그림)는 코인 수에 맞춘다 */
export const coinDrops = (coins: number) => clamp(Math.round(coins / 40), 8, 40);

/** 고래 길(원점 앞바다 ↔ 모래시계섬 서쪽 해안) */
export const WHALE_ROAD = { a: { x: 60, z: 150 }, b: { x: 2150, z: 900 } } as const;
/** 고래 길 위 가장 가까운 점(u 0..1)과 거리 */
export function roadNearest(x: number, z: number, R: { a: { x: number; z: number }; b: { x: number; z: number } } = WHALE_ROAD) {
  const dx = R.b.x - R.a.x, dz = R.b.z - R.a.z, L2 = dx * dx + dz * dz;
  const u = clamp(((x - R.a.x) * dx + (z - R.a.z) * dz) / L2, 0, 1);
  const px = R.a.x + dx * u, pz = R.a.z + dz * u;
  const L = Math.sqrt(L2);
  return { u, px, pz, d: Math.hypot(x - px, z - pz), tx: dx / L, tz: dz / L, len: L };
}

// ───────────── 상자 ─────────────
export type SeaChestTier = 'wood' | 'silver' | 'gold';
export interface DriftChest { id: string; x: number; z: number; tier: SeaChestTier; phase: number }
/** 매일 먼바다에 떠다니는 상자 수 */
export const DRIFT_N = 10;
const tierOf = (r: number): SeaChestTier => (r < 0.05 ? 'gold' : r < 0.3 ? 'silver' : 'wood');

/**
 * 그날의 표류 상자(결정적). accept(x,z) = 먼바다인가(모듈은 해저 깊이·해안 거리로 판단).
 * 같은 날이면 늘 같은 자리·등급, 날이 바뀌면 새로.
 */
export function driftChests(day: number, accept: (x: number, z: number) => boolean, n = DRIFT_N, bound = 3500): DriftChest[] {
  const d = Math.floor(day);
  const r = rngFor(`seaworld:drift:${d}`);
  const out: DriftChest[] = [];
  for (let tries = 0; out.length < n && tries < 600; tries++) {
    const x = Math.round((r() * 2 - 1) * bound), z = Math.round((r() * 2 - 1) * bound);
    const tr = r(), ph = r() * Math.PI * 2;
    if (!accept(x, z)) continue;
    if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 250)) continue;
    out.push({ id: `drift:${d}:${out.length}`, x, z, tier: tierOf(tr), phase: ph });
  }
  return out;
}
/** 표류 상자 지금 자리 — 제자리에서 반경 8 m 를 2분에 한 바퀴 둥둥(게임 초 기준이라 다시 켜도 같다) */
export function driftPos(c: { x: number; z: number; phase: number }, gameSec: number): { x: number; z: number } {
  const a = gameSec / 120 * Math.PI * 2 + c.phase;
  return { x: c.x + Math.cos(a) * 8, z: c.z + Math.sin(a) * 8 };
}

export interface RingChest { id: string; a0: number; tier: SeaChestTier; lift: number }
/** 소용돌이 고리를 빙글빙글 도는 상자 4개(그날 결정적) */
export function whirlChests(day: number, n = 4): RingChest[] {
  const d = Math.floor(day);
  const r = rngFor(`seaworld:whirl:${d}`);
  return Array.from({ length: n }, (_, i) => {
    const a0 = (i / n) * Math.PI * 2 + r() * 0.8;
    const t = r();
    return { id: `whirl:${d}:${i}`, a0, tier: t < 0.12 ? 'gold' : t < 0.55 ? 'silver' : 'wood', lift: r() };
  });
}
/** 고리 위 각도(라디안) — 접선 속도 WHIRL_SPIN 과 같은 빠르기로 돈다 */
export const whirlAngle = (c: { a0: number }, gameSec: number, ring = WHIRL.r * WHIRL_RING) => c.a0 + gameSec * (WHIRL_SPIN * 0.35) / ring;

/** 토요일 해적선 보물: 유령선 둘레에 은상자 3개 더(seaworld 가 낸다 — 계약 4장) */
export const PIRATE_N = 3;
export function pirateChests(day: number, active = isPirateDay(day)): Array<{ id: string; a: number; r: number }> {
  if (!active) return [];
  const d = Math.floor(day);
  const r = rngFor(`seaworld:pirate:${d}`);
  return Array.from({ length: PIRATE_N }, (_, i) => ({ id: `pirate:${d}:${i}`, a: (i / PIRATE_N) * Math.PI * 2 + r() * 0.9, r: 26 + r() * 10 }));
}

// ───────────── 돌고래 경주 ─────────────
/** 배가 이 속도 이상이어야 돌고래가 나란히 달린다(m/s) */
export const RACE_SPEED = 12;
/** 나란히 20초 */
export const RACE_SEC = 20;
/** 조건이 깨져도 이만큼은 기다려 준다 */
export const RACE_GRACE = 2.5;
/** 떼가 다가오는 시간 */
export const RACE_ARRIVE = 1.5;
/** 하루 최대 보상 */
export const RACE_MAX_PER_DAY = 3;
/** 한 번 이긴 뒤 쉬는 시간(실제 초) */
export const RACE_COOLDOWN = 90;

export type RaceMode = 'idle' | 'arrive' | 'race' | 'leave' | 'rest';
export interface RaceState { mode: RaceMode; t: number; progress: number; grace: number; rest: number }
export const newRace = (): RaceState => ({ mode: 'idle', t: 0, progress: 0, grace: 0, rest: 0 });
/**
 * 한 프레임 진행. ok = 배를 타고 먼바다에서 RACE_SPEED 이상. allowed = 오늘 보상이 남았나.
 * 돌려주는 값: 'start'(떼가 붙음) · 'lost'(떨어져 나감) · 'win'(20초 완주) · null
 */
export function stepRace(s: RaceState, ok: boolean, dt: number, allowed = true): 'start' | 'lost' | 'win' | null {
  s.t += dt;
  switch (s.mode) {
    case 'rest':
      s.rest -= dt;
      if (s.rest <= 0) { s.mode = 'idle'; s.t = 0; }
      return null;
    case 'idle':
      if (ok && allowed) { s.mode = 'arrive'; s.t = 0; }
      return null;
    case 'arrive':
      if (!ok) { s.mode = 'idle'; s.t = 0; return null; }
      if (s.t >= RACE_ARRIVE) { s.mode = 'race'; s.t = 0; s.progress = 0; s.grace = 0; return 'start'; }
      return null;
    case 'race':
      if (ok) { s.grace = 0; s.progress += dt; }
      else { s.grace += dt; if (s.grace >= RACE_GRACE) { s.mode = 'leave'; s.t = 0; s.progress = 0; return 'lost'; } }
      if (s.progress >= RACE_SEC) { s.mode = 'rest'; s.rest = RACE_COOLDOWN; s.t = 0; s.progress = RACE_SEC; return 'win'; }
      return null;
    case 'leave':
      if (s.t >= 3) { s.mode = 'idle'; s.t = 0; }
      return null;
  }
}
/** 돌고래 경주 보상 코인(결정적) */
export function raceCoins(day: number, n: number): number {
  const r = rngFor(`seaworld:dolphin:${Math.floor(day)}:${n}`)();
  return 500 + Math.floor(r * 6) * 100;
}

// ───────────── 갈매기 도둑 ─────────────
/** 갈매기를 쫓을 수 있는 시간(실제 초) */
export const GULL_CHASE = 45;
/** 이만큼 가까이(수평 m) 가면 물고기를 떨어뜨린다 */
export const GULL_CATCH = 4;
/** 몇 초마다 한 번 노려보나 */
export const GULL_CHECK = 30;
/** 한 번 노릴 때 훔칠 확률 */
export const GULL_CHANCE = 0.16;
/**
 * 가방에서 훔칠 물고기 한 마리(결정적). isFish(id) = 물고기 종인가. 변이 키(@shiny 등)는 고르지 않는다(귀한 변이는 안 훔친다).
 * 가장 흔한 것부터 노린다(희귀도 낮은 쪽 가중) — 귀한 걸 잃는 슬픔을 줄인다.
 */
export function pickStealable(bag: Record<string, number>, isFish: (key: string) => { rarity: number } | null, rnd: () => number): string | null {
  const c: Array<{ k: string; w: number }> = [];
  for (const k of Object.keys(bag).sort()) {
    if ((bag[k] ?? 0) <= 0) continue;
    const f = isFish(k);
    if (!f) continue;
    if (k.includes('@')) continue; // 변이(반짝이·왕관·꼬마)는 건드리지 않는다
    c.push({ k, w: 1 / Math.max(1, f.rarity) });
  }
  if (!c.length) return null;
  let sum = 0;
  for (const x of c) sum += x.w;
  let r = rnd() * sum;
  for (const x of c) { r -= x.w; if (r <= 0) return x.k; }
  return c[c.length - 1].k;
}
/** 그 시간 칸에 갈매기가 노리나(결정적) */
export const gullRoll = (day: number, slot: number) => rngFor(`seaworld:gull:${Math.floor(day)}:${slot}`)() < GULL_CHANCE;

// ───────────── 저장(flags.seaworld) ─────────────
export interface SeaFlags {
  v: 1;
  /** opened·whaleN 등이 가리키는 날 */
  day: number;
  /** 오늘 연 상자 id(표류·소용돌이·해적·유령선) */
  opened: string[];
  whaleN: number;
  /** 오늘 고래 목격 보여 줬나 */
  whaleSeen: boolean;
  raceN: number;
  /** 블랙박스 주웠나(평생 한 번) */
  blackbox: boolean;
  /** launch-probe 비밀 알렸나(평생 한 번) */
  probe: boolean;
  /** 갈매기가 들고 간 가방 키(새로 켜면 돌려준다) */
  gull: string | null;
  /** 오늘 갈매기가 훔친 수(하루 2번까지 — 다시 켜도 이어진다) */
  gullN?: number;
  /** 해류 띠를 탄 거리(m, 누적 — ach_current 해류 띠 1km) */
  rode: number;
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** flags.seaworld 를 깨끗한 모양으로(없거나 깨졌으면 새로) — 같은 객체를 flags 에 다시 걸어 둔다 */
export function readSeaFlags(flags: Record<string, unknown>): SeaFlags {
  const r = isObj(flags.seaworld) ? flags.seaworld : {};
  const f: SeaFlags = {
    v: 1,
    day: num(r.day, -1),
    opened: Array.isArray(r.opened) ? (r.opened as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    whaleN: num(r.whaleN), whaleSeen: r.whaleSeen === true, raceN: num(r.raceN),
    blackbox: r.blackbox === true, probe: r.probe === true,
    gull: typeof r.gull === 'string' ? r.gull : null,
    gullN: num(r.gullN),
    rode: Math.max(0, num(r.rode)),
  };
  flags.seaworld = f;
  return f;
}
/** 날이 바뀌면 오늘 기록(상자·고래·돌고래)을 비운다. 바뀌었으면 true */
export function rollSeaDay(f: SeaFlags, day: number): boolean {
  const d = Math.floor(day);
  if (f.day === d) return false;
  f.day = d; f.opened = []; f.whaleN = 0; f.whaleSeen = false; f.raceN = 0; f.gullN = 0;
  return true;
}

/**
 * 블랙박스 줍기 — 평생 한 번. give 로 가방에 넣고 secret-found {id:'launch-probe'} 는 처음 한 번만 알린다.
 * 가방이 꽉 차 못 넣었으면(give 가 0) 줍지 않은 걸로 둔다(다음에 다시).
 */
export function takeBlackBox(
  f: SeaFlags,
  io: { give(id: string, n: number): number; emit(e: { type: 'secret-found'; id: 'launch-probe' }): void },
): 'taken' | 'full' | 'already' {
  if (f.blackbox) return 'already';
  const n = io.give('it_blackbox', 1);
  if (n <= 0) return 'full';
  f.blackbox = true;
  if (!f.probe) { f.probe = true; io.emit({ type: 'secret-found', id: 'launch-probe' }); }
  return 'taken';
}
