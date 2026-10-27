// 낚시 규칙(순수 — DOM·WebGL·game 없이 돈다). fishing.ts 가 이걸로 판정하고, tests/fishing-mechanics.test.ts 가 시험한다.
//   낚싯대 문(tool:rod·goodrod·goldrod) · 던지기 3~10m · 미끼 고르기·쓰기 · 그림자 1~3개 미리 굴리기(econ.rollCatch commit:false)
//   · 입질 창(★1~3 0.7s, ★4 0.55s, ★5 0.45s, 좋은·황금 낚싯대 +0.1s) · 갑판 규칙(통통배 속도 < 1) · 먼바다·심해는 배 위에서만
//   · 달 연못 = moonfish · 살금살금(달리면 > 6.3 m/s 그림자가 놀람) · 톡·톡·꾹 상태 기계 · 성공/실패/쓰레기 결과 처리.
// 다른 모듈 파일을 import 하지 않는다(타입만 core/api). 종 목록·poolFor 는 부르는 쪽이 넘긴다.
import type { Activity, RollQuery, RollResult, RollSpecies, Variant, VehicleNow, ZoneInfo } from '../../core/api';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

// ───────────── 낚싯대 ─────────────
export type RodTier = 'none' | 'rod' | 'goodrod' | 'goldrod';
export const ROD_NAME: Record<RodTier, string> = { none: '', rod: '낚싯대', goodrod: '좋은 낚싯대', goldrod: '황금 낚싯대' };

/** 지금 쓸 수 있는 가장 좋은 낚싯대. isUnlocked 가 없으면(경제 없음) 기본 낚싯대로 본다 */
export function rodTier(isUnlocked?: ((key: string) => boolean) | null): RodTier {
  if (!isUnlocked) return 'rod';
  if (isUnlocked('tool:goldrod')) return 'goldrod';
  if (isUnlocked('tool:goodrod')) return 'goodrod';
  if (isUnlocked('tool:rod')) return 'rod';
  return 'none';
}

// ───────────── 입질 창 ─────────────
/** 꾹! 뒤 E 를 누를 수 있는 시간(초) — GDD 3.5 #3 */
export const BITE_WINDOW: Readonly<Record<number, number>> = Object.freeze({ 1: 0.7, 2: 0.7, 3: 0.7, 4: 0.55, 5: 0.45 });
/** 좋은 낚싯대·황금 낚싯대 덤 */
export const ROD_WINDOW_BONUS = 0.1;

/** 희귀도·낚싯대 → 입질 창(초). 쓰레기(희귀도 0)는 ★1 과 같다 */
export function biteWindow(rarity: number, rod: RodTier): number {
  const r = clamp(Math.round(Number.isFinite(rarity) ? rarity : 1), 1, 5);
  const bonus = rod === 'goodrod' || rod === 'goldrod' ? ROD_WINDOW_BONUS : 0;
  return round2(BITE_WINDOW[r] + bonus);
}

// ───────────── 던지기 ─────────────
export const CAST_MIN = 3;
export const CAST_MAX = 10;
/** 이만큼(초) 누르고 있으면 끝까지(10m) */
export const CHARGE_SEC = 1.2;

/** 누른 시간 → 던지는 거리(m), 3~10 */
export function castDistance(chargeSec: number): number {
  const k = clamp((Number.isFinite(chargeSec) ? chargeSec : 0) / CHARGE_SEC, 0, 1);
  return round2(CAST_MIN + (CAST_MAX - CAST_MIN) * k);
}
/** 충전 0..1(게이지·표적 고리) */
export const chargeFrac = (chargeSec: number) => clamp(chargeSec / CHARGE_SEC, 0, 1);

/**
 * 찌가 떨어질 거리: 원하는 거리가 물이면 그대로, 아니면 가까운 쪽(→3m)부터, 그다음 먼 쪽(→10m)으로 0.5m 씩 찾는다.
 * 3~10m 안에 물이 없으면 null.
 */
export function landingDistance(want: number, isWater: (d: number) => boolean): number | null {
  const d0 = clamp(want, CAST_MIN, CAST_MAX);
  if (isWater(d0)) return d0;
  for (let d = d0 - 0.5; d >= CAST_MIN - 1e-6; d -= 0.5) if (isWater(round2(d))) return round2(d);
  for (let d = d0 + 0.5; d <= CAST_MAX + 1e-6; d += 0.5) if (isWater(round2(d))) return round2(d);
  return null;
}

// ───────────── 그림자 ─────────────
/** 찌 둘레 그림자가 처음 나타나는 반경(m) */
export const SHADOW_R_MIN = 6;
export const SHADOW_R_MAX = 12;
/** 그림자 수 1~3(놀랐으면 1) */
export function shadowCount(u: number, spooked = false): number {
  if (spooked) return 1;
  return clamp(1 + Math.floor(clamp(u, 0, 0.9999) * 3), 1, 3);
}
/** 그림자 나타나는 반경 6~12m */
export const shadowRadius = (u: number) => round2(SHADOW_R_MIN + (SHADOW_R_MAX - SHADOW_R_MIN) * clamp(u, 0, 1));

// ───────────── 살금살금(GDD 1.4: 걷기 = 살금, 달리기 = 들킴) ─────────────
/** 이보다 빠르면(달리기) 물가 그림자가 놀란다 */
export const SPOOK_SPEED = 6.3;
/** 놀란 뒤 이 시간(초) 동안 그림자가 숨는다 */
export const SPOOK_SEC = 4;
/** 물이 이 거리(m) 안에 있으면 '물가' */
export const SPOOK_NEAR = 14;
/** 놀란 채 던지면 그림자가 이만큼(초) 늦게 온다 */
export const SPOOK_DELAY = 2.5;

/** 달리면 놀람 시계를 다시 건다. 돌려주는 값 = 새 '놀람 끝' 시각 */
export function spookUntil(prevUntil: number, t: number, speed: number, nearWater: boolean): number {
  return nearWater && speed > SPOOK_SPEED ? Math.max(prevUntil, t + SPOOK_SEC) : prevUntil;
}
export const isSpooked = (until: number, t: number) => t < until;

// ───────────── 갑판·구역 ─────────────
/** 갑판 낚시가 되는 탈것(GDD 3.8: 통통배) */
export const DECK_KINDS: readonly string[] = ['tugboat'];
/** 이보다 느리면 '멈춘' 배 */
export const DECK_MAX_SPEED = 1;

/** 탄 채로 낚시해도 되나: 통통배이고 거의 멈췄을 때만 */
export function deckFishingOk(v: Pick<VehicleNow, 'kind' | 'speed'> | null | undefined): boolean {
  return !!v && DECK_KINDS.includes(v.kind) && Math.abs(Number(v.speed) || 0) < DECK_MAX_SPEED;
}

/** 배 위에서만 닿는 물 구역 */
export const BOAT_ONLY_ZONES: readonly string[] = ['offshore', 'deep'];
/** 먼바다·심해는 배 위에서만 — 땅에서 던졌으면 해안(shore) 후보로 */
export function fishingZone(zone: string | null | undefined, onBoat: boolean): string {
  const z = zone || 'shore';
  return BOAT_ONLY_ZONES.includes(z) && !onBoat ? 'shore' : z;
}

export interface CastSpot {
  world: 'earth' | 'space';
  /** 달 연못(space.pondAt) 위인가 */
  pond: boolean;
  /** 찌 자리 geo.zoneAt(없으면 null) */
  zone?: ZoneInfo | null;
  onBoat: boolean;
}
export interface CastPlan {
  activity: Activity;
  zone: string;
  island: string | null;
  /** 쓰레기 굴림(지구 물만) */
  junk: boolean;
}
/** 찌 자리 → 활동·구역. 우주 연못은 moonfish·moonpond(쓰레기 없음) */
export function planCast(s: CastSpot): CastPlan {
  if (s.world === 'space' || s.pond) return { activity: 'moonfish', zone: 'moonpond', island: 'moon', junk: false };
  return { activity: 'fish', zone: fishingZone(s.zone?.zone, s.onBoat), island: s.zone?.island ?? null, junk: true };
}

// ───────────── 미끼 ─────────────
/** 고를 수 있는 미끼(고르는 순서) */
export const BAITS: readonly string[] = ['bait_worm', 'bait_dough', 'bait_lure', 'bait_golden', 'bait_lava'];
export const BAIT_NAME: Record<string, string> = {
  bait_worm: '지렁이', bait_dough: '떡밥', bait_lure: '반짝 루어', bait_golden: '황금 미끼', bait_lava: '화산 미끼', none: '미끼 없음',
};
/** 고르지 않았을 때 저절로 쓰는 미끼(아끼는 루어·황금 미끼는 직접 골랐을 때만) */
const AUTO_BAITS = ['bait_worm', 'bait_dough'];

/**
 * 이번에 쓸 미끼. pref = 'none' 이면 안 쓴다. 고른 게 있으면 그것, 다 떨어졌으면 지렁이·떡밥 순으로, 없으면 undefined.
 */
export function chooseBait(pref: string | null | undefined, count: (id: string) => number): string | undefined {
  if (pref === 'none') return undefined;
  if (pref && BAITS.includes(pref) && count(pref) > 0) return pref;
  for (const b of AUTO_BAITS) if (count(b) > 0) return b;
  return undefined;
}
/** 던질 때 미끼 하나를 쓴다 — 쓴 미끼 id(없으면 undefined) */
export function takeBait(pref: string | null | undefined, count: (id: string) => number, take: (id: string) => void): string | undefined {
  const b = chooseBait(pref, count);
  if (b) take(b);
  return b;
}
/** 다음 미끼(가진 것 + '미끼 없음' 사이를 돈다) */
export function cycleBait(pref: string | null | undefined, count: (id: string) => number): string {
  const opts = ['none', ...BAITS.filter((b) => count(b) > 0)];
  const cur = pref && opts.includes(pref) ? pref : chooseBait(pref, count) ?? 'none';
  return opts[(opts.indexOf(cur) + 1) % opts.length];
}

// ───────────── 미리 굴리기 ─────────────
/** econ.rollCatch 에 commit:false(미리 굴림) 를 붙인 질의 */
export type PreRollQuery = RollQuery & { commit?: boolean };

/**
 * 그림자 n 개를 미리 굴린다(GDD 3.5 #2). 미끼는 한 번 쓰고 굴림마다 같이 넘긴다.
 * 빈손(후보 없음) 결과는 버린다 — 하나도 없으면 빈 배열.
 */
export function rollShadows(o: { n: number; plan: CastPlan; pool: RollSpecies[]; bait?: string; roll: (q: PreRollQuery) => RollResult }): RollResult[] {
  const out: RollResult[] = [];
  for (let i = 0; i < o.n; i++) {
    const q: PreRollQuery = { activity: o.plan.activity, pool: o.pool, junk: o.plan.junk, commit: false };
    if (o.bait) q.bait = o.bait;
    const r = o.roll(q);
    if (r && (r.species || r.junk)) out.push(r);
  }
  return out;
}

// ───────────── 구역 후보(poolFor 가 없거나 비었을 때) ─────────────
export interface PoolPlace {
  island: string | null;
  zone: string;
  hour: number;
  tod: string;
  noon: boolean;
  midnight: boolean;
  weather: string;
  moonPhase: number;
}
/** 후보로 쓸 종 모양(새 데이터 where, 옛 데이터 hab·time 둘 다 받는다) */
export type PoolFish = RollSpecies & { hab?: string[]; time?: string; p1?: boolean };
/** 데이터 담당 poolFor 모양(island 는 없으면 undefined) */
export type PoolFn = (q: Omit<PoolPlace, 'island'> & { island?: string }) => PoolFish[] | null | undefined;

/** 구역 코드 → 옛 데이터 서식지(hab) */
export const ZONE_HAB: Readonly<Record<string, readonly string[]>> = Object.freeze({
  river: ['river'], waterfall: ['river'], stream: ['river'], estuary: ['river', 'coast'],
  pond: ['pond', 'lake'], heartpond: ['pond', 'lake'], footprint: ['pond'], swamp: ['pond', 'lake'], foglake: ['lake', 'pond'],
  ancientlake: ['lake'], crater: ['lake', 'pond'],
  shore: ['coast'], shallow: ['coast'], icesea: ['ice', 'coast'], icehole: ['ice'], icelake: ['ice', 'lake'],
  mangrove: ['reef', 'coast'], lagoon: ['reef', 'lake'], reef: ['reef', 'coast'],
  hotspring: ['hotspring'], oasis: ['oasis'], ruin: ['oasis'], cave: ['oasis'], dune: ['oasis'],
  offshore: ['offshore', 'deep'], deep: ['deep', 'offshore'], trench: ['deep'],
});
/** 해안 줄(zone 'shore')이 같이 열리는 바다 구역 */
const SHOREISH = new Set(['shore', 'shallow', 'estuary', 'icesea', 'reef', 'mangrove']);
const ALL_TIME = new Set(['all', 'any', 'always', '종일']);

function timeOk(t: string | string[] | undefined, p: PoolPlace): boolean {
  if (t == null) return true;
  const ts = Array.isArray(t) ? t : [t];
  if (!ts.length) return true;
  return ts.some((x) => ALL_TIME.has(x) || x === p.tod
    || (x === 'day' && p.tod === 'morning') || (x === 'evening' && p.tod === 'sunset')
    || (x === 'noon' && p.noon) || (x === 'midnight' && p.midnight));
}

/** 이 자리 후보(데이터의 where 줄 → 없으면 hab) */
export function localPool(fish: readonly PoolFish[], p: PoolPlace, ignoreTime = false): PoolFish[] {
  const habs = ZONE_HAB[p.zone] ?? [];
  return fish.filter((sp) => {
    if (sp.p1) return false;
    if (sp.where && sp.where.length) {
      return sp.where.some((w) => {
        const zoneOk = w.zone === p.zone || (w.zone === 'shore' && SHOREISH.has(p.zone));
        if (!zoneOk) return false;
        const islandOk = !w.island || w.island === 'any' || w.zone === 'shore' || !p.island || w.island === p.island;
        if (!islandOk) return false;
        const only = w.weather?.only;
        if (only && only.length && !(only as readonly string[]).includes(p.weather)) return false;
        return ignoreTime || timeOk(w.time, p);
      });
    }
    if (!sp.hab || !sp.hab.some((h) => habs.includes(h))) return false;
    return ignoreTime || timeOk(sp.time === 'all' ? undefined : sp.time, p);
  });
}

/**
 * 이 자리 낚시 후보: poolFor(데이터 담당) → 비면 데이터에서 직접 → 그래도 비면 비슷한 물(해안·민물).
 * 시간 때문에 다 빠지면 시간은 빼고 한 번 더(빈 물은 없게).
 */
export function zonePool(fish: readonly PoolFish[], p: PoolPlace, poolFor?: PoolFn | null): PoolFish[] {
  if (poolFor) {
    try {
      const r = poolFor({ ...p, island: p.island ?? undefined });
      if (Array.isArray(r) && r.length) return r;
    } catch { /* 데이터 쪽 오류는 아래 대체 후보로 */ }
  }
  let out = localPool(fish, p);
  if (out.length) return out;
  out = localPool(fish, p, true);
  if (out.length) return out;
  const sea = SHOREISH.has(p.zone) || BOAT_ONLY_ZONES.includes(p.zone) || p.zone === 'trench';
  const alt = p.zone === 'moonpond' ? 'moonpond' : sea ? 'shore' : 'pond';
  if (alt !== p.zone) {
    out = localPool(fish, { ...p, zone: alt });
    if (out.length) return out;
  }
  // 달 연못 물고기가 아직 데이터에 없으면 연못 민물고기로
  if (p.zone === 'moonpond') {
    out = localPool(fish.filter((f) => !f.where?.length), { ...p, zone: 'pond' });
    if (out.length) return out;
  }
  // 집섬 밖의 흐르는 물(공룡섬 강 등)은 구역 물고기가 없다 → 그 섬의 고인 물 → 섬 무시
  if (p.island && GENERIC_WATER.has(p.zone)) {
    for (const z of ISLAND_WATER[p.island] ?? []) {
      const q = { ...p, zone: z };
      if (poolFor) {
        try {
          const r = poolFor({ ...q, island: p.island });
          if (Array.isArray(r) && r.length) return r;
        } catch { /* 아래로 */ }
      }
      out = localPool(fish, q, true);
      if (out.length) return out;
    }
    out = localPool(fish, { ...p, island: null }, true);
    if (out.length) return out;
    out = localPool(fish, { ...p, island: null, zone: sea ? 'shore' : 'pond' }, true);
    if (out.length) return out;
  }
  return [];
}

/** 섬 이름표만 붙은 흔한 물(geo 가 다른 섬 물에도 river·waterfall 을 붙인다) */
const GENERIC_WATER = new Set(['river', 'waterfall', 'stream', 'pond']);
/** 섬마다 대신 쓸 고인 물 구역(앞에서부터) */
export const ISLAND_WATER: Readonly<Record<string, readonly string[]>> = Object.freeze({
  home: ['river', 'pond'],
  coral: ['stream', 'lagoon'],
  dino: ['ancientlake', 'footprint', 'swamp'],
  mushroom: ['foglake', 'swamp'],
  ice: ['icelake', 'icehole'],
  desert: ['oasis', 'ruin', 'cave'],
  launch: ['crater'],
  moon: ['moonpond'],
});

/** 그 구역 안에서 그냥 보이는 그림자 종 하나 고르기(굴림 카운터를 쓰지 않는 장식용) */
export const AMBIENT_W: Readonly<Record<number, number>> = Object.freeze({ 1: 55, 2: 27, 3: 12, 4: 5, 5: 1 });
export function pickAmbient<T extends { rarity: number }>(pool: readonly T[], u: number): T | null {
  if (!pool.length) return null;
  let total = 0;
  for (const s of pool) total += AMBIENT_W[s.rarity] ?? 1;
  let x = clamp(u, 0, 0.99999) * total;
  for (const s of pool) { x -= AMBIENT_W[s.rarity] ?? 1; if (x < 0) return s; }
  return pool[pool.length - 1];
}

// ───────────── 크기 ─────────────
/** 굴림에 크기가 없을 때(len 없는 옛 데이터): 크기 범위 안에서 작은 쪽이 흔하게 */
export function fallbackSize(sp: { len?: number; size?: [number, number] }, u: number): number {
  if (sp.size && sp.size.length === 2) return Math.round((sp.size[0] + (sp.size[1] - sp.size[0]) * Math.pow(clamp(u, 0, 1), 1.6)) * 10) / 10;
  if (sp.len) return Math.round(sp.len * (0.8 + 0.4 * clamp(u, 0, 1)) * 10) / 10;
  return 20;
}
const cm = (v: number) => `${Math.round(v * 10) / 10}cm`;
/**
 * 크기 기록 한 줄(GDD 5.1 왕관): 왕관이면 '최대 크기 경신! 62cm→71cm'(처음이면 '왕관 크기! 71cm'),
 * 왕관이 아니어도 전에 잡은 최대를 넘으면 경신 줄. 아니면 null.
 */
export function sizeLine(prevBest: number | undefined, size: number | undefined, variant?: Variant): string | null {
  if (size == null || !Number.isFinite(size)) return null;
  const had = prevBest != null && Number.isFinite(prevBest) && prevBest > 0;
  if (variant === 'crown') return had && prevBest! < size ? `최대 크기 경신! ${cm(prevBest!)}→${cm(size)}` : `👑 왕관 크기! ${cm(size)}`;
  if (had && size > prevBest!) return `최대 크기 경신! ${cm(prevBest!)}→${cm(size)}`;
  return null;
}

// ───────────── 톡·톡·꾹 상태 기계 ─────────────
export type Phase = 'idle' | 'charge' | 'cast' | 'wait' | 'approach' | 'nibble' | 'bite' | 'fight' | 'catch' | 'miss' | 'reel';
/** 찌가 날아가는 시간 */
export const CAST_FLIGHT = 0.55;
/** 꾹! 전에 톡 하는 횟수 */
export const NIBBLES = 2;
/** 첫 톡: 그림자가 닿고 0.8~2.5초 뒤(GDD 3.5 #3) */
export const FIRST_NIBBLE: readonly [number, number] = [0.8, 2.5];
/** 톡과 톡(꾹) 사이 */
export const NIBBLE_GAP: readonly [number, number] = [0.55, 1.05];
export const CATCH_HOLD = 1.6;
export const MISS_HOLD = 1.2;
export const REEL_HOLD = 0.45;

export interface Session {
  phase: Phase;
  /** 이번 단계에 들어온 뒤 흐른 시간(초) */
  t: number;
  /** E 를 누르고 있던 시간 */
  charge: number;
  /** 던진 거리 */
  dist: number;
  /** 착수 뒤 그림자가 다가오기 시작할 때까지 */
  wait: number;
  /** 다가오는 데 걸리는 시간 */
  approach: number;
  /** 이 단계 시간이 되면 다음 톡(또는 꾹) */
  nibbleAt: number;
  /** 지금까지 톡 횟수 */
  nibbles: number;
  /** 꾹 뒤 입력 창 */
  window: number;
  /** 꾹에 E 를 맞히면 바로 잡지 않고 릴 줄다리기(★4 이상, P1) */
  fight: boolean;
}
/** 놓친 까닭: 톡에 누름 · 창을 놓침 · 줄다리기 줄 끊김 · 줄다리기 중 도망 */
export type FailWhy = 'early' | 'late' | 'snap' | 'escape';
export type FishEvent =
  | { type: 'cast'; dist: number }
  | { type: 'land' }
  | { type: 'approach' }
  | { type: 'nibble'; n: number }
  | { type: 'bite' }
  | { type: 'hook' }
  | { type: 'catch' }
  | { type: 'fail'; why: FailWhy }
  | { type: 'reel' }
  | { type: 'end' };
export interface StepInput {
  /** 이번 프레임에 E 를 눌렀다 */
  press: boolean;
  /** E 를 누르고 있다 */
  held: boolean;
  /** Esc(그만두기) */
  cancel: boolean;
}

export function newSession(): Session {
  return { phase: 'idle', t: 0, charge: 0, dist: CAST_MIN, wait: Infinity, approach: 3, nibbleAt: Infinity, nibbles: 0, window: 0.7, fight: false };
}
const go = (s: Session, p: Phase) => { s.phase = p; s.t = 0; };
const between = (r: readonly [number, number], u: number) => r[0] + (r[1] - r[0]) * clamp(u, 0, 1);

/** E 를 눌러 충전 시작 */
export function beginCharge(s: Session) { go(s, 'charge'); s.charge = 0; s.nibbles = 0; s.wait = Infinity; s.fight = false; }
/** 바로 던지기(충전 없이 — 디버그·자동 루프) */
export function beginCast(s: Session, dist: number) { go(s, 'cast'); s.dist = clamp(dist, CAST_MIN, CAST_MAX); s.wait = Infinity; s.fight = false; }
/**
 * 착수 뒤 굴린 그림자로 일정을 건다: wait 뒤 approach 동안 다가오고, window 는 그 그림자의 입질 창.
 * fight = true 면 꾹에 맞혀도 바로 잡지 않고 릴 줄다리기(hook 사건 → fight 단계)로 간다.
 */
export function arm(s: Session, o: { wait: number; approach: number; window: number; fight?: boolean }) {
  s.wait = Math.max(0, o.wait); s.approach = Math.max(0.2, o.approach); s.window = o.window; s.fight = !!o.fight;
}
/** 그만두기(줄 감기) — 결과 없이 끝 */
export function reelIn(s: Session) { if (s.phase !== 'idle' && s.phase !== 'catch' && s.phase !== 'miss' && s.phase !== 'fight') go(s, 'reel'); }
/** 바로 꾹! 단계로(디버그) */
export function forceBite(s: Session, window: number) { go(s, 'bite'); s.window = window; }
/** 바로 줄다리기 단계로(디버그·촬영) */
export function forceFight(s: Session) { go(s, 'fight'); s.fight = true; }
/**
 * 줄다리기가 끝났다(fishing.ts 가 reel.ts 모델로 판정): 이기면 catch, 아니면 줄 끊김·도망 fail.
 * fight 단계가 아니면 아무 일도 없다.
 */
export function endFight(s: Session, won: boolean, why: 'snap' | 'escape' = 'escape'): FishEvent[] {
  if (s.phase !== 'fight') return [];
  if (won) { go(s, 'catch'); return [{ type: 'catch' }]; }
  go(s, 'miss');
  return [{ type: 'fail', why }];
}
/** ★4 이상(쓰레기 아님)은 릴 줄다리기 — GDD 3.5 P1 */
export const FIGHT_RARITY = 4;
export const needsFight = (r: Pick<RollResult, 'rarity' | 'junk'> | null | undefined) => !!r && !r.junk && (r.rarity ?? 0) >= FIGHT_RARITY;

/**
 * 한 프레임 진행. 돌려주는 사건을 fishing.ts 가 연출·결과로 바꾼다.
 * - 대기·다가옴 중 E = 줄 감기(실패 아님) · 톡 중 E = 너무 빨라 도망(fail early) · 꾹 창 안 E = 잡았다 · 창이 지나면 fail late
 * - Esc: 톡·꾹 중이면 물고기가 도망(fail early), 그 전이면 줄 감기
 */
export function step(s: Session, dt: number, inp: StepInput, rng: () => number): FishEvent[] {
  const ev: FishEvent[] = [];
  if (s.phase === 'idle') return ev;
  s.t += Math.max(0, dt);
  switch (s.phase) {
    case 'charge':
      if (inp.cancel) { go(s, 'idle'); ev.push({ type: 'end' }); break; }
      if (inp.held) s.charge += Math.max(0, dt);
      else { s.dist = castDistance(s.charge); go(s, 'cast'); ev.push({ type: 'cast', dist: s.dist }); }
      break;
    case 'cast':
      if (inp.cancel) { go(s, 'reel'); ev.push({ type: 'reel' }); break; }
      if (s.t >= CAST_FLIGHT) { go(s, 'wait'); ev.push({ type: 'land' }); }
      break;
    case 'wait':
      if (inp.press || inp.cancel) { go(s, 'reel'); ev.push({ type: 'reel' }); break; }
      if (s.t >= s.wait) { go(s, 'approach'); ev.push({ type: 'approach' }); }
      break;
    case 'approach':
      if (inp.press || inp.cancel) { go(s, 'reel'); ev.push({ type: 'reel' }); break; }
      if (s.t >= s.approach) { go(s, 'nibble'); s.nibbles = 0; s.nibbleAt = between(FIRST_NIBBLE, rng()); }
      break;
    case 'nibble':
      if (inp.press || inp.cancel) { go(s, 'miss'); ev.push({ type: 'fail', why: 'early' }); break; }
      if (s.t >= s.nibbleAt) {
        if (s.nibbles < NIBBLES) {
          s.nibbles++;
          ev.push({ type: 'nibble', n: s.nibbles });
          s.nibbleAt = s.t + between(NIBBLE_GAP, rng());
        } else { go(s, 'bite'); ev.push({ type: 'bite' }); }
      }
      break;
    case 'bite':
      if (inp.press && s.fight) { go(s, 'fight'); ev.push({ type: 'hook' }); break; }
      if (inp.press) { go(s, 'catch'); ev.push({ type: 'catch' }); break; }
      if (inp.cancel) { go(s, 'miss'); ev.push({ type: 'fail', why: 'early' }); break; }
      if (s.t > s.window) { go(s, 'miss'); ev.push({ type: 'fail', why: 'late' }); }
      break;
    case 'fight':
      // 줄다리기는 reel.ts 모델이 판정한다 — 여기선 시간만 흐른다(Esc 는 줄을 놓아 도망)
      if (inp.cancel) { go(s, 'miss'); ev.push({ type: 'fail', why: 'escape' }); }
      break;
    case 'catch':
      if (s.t >= CATCH_HOLD) { go(s, 'idle'); ev.push({ type: 'end' }); }
      break;
    case 'miss':
      if (s.t >= MISS_HOLD) { go(s, 'idle'); ev.push({ type: 'end' }); }
      break;
    case 'reel':
      if (s.t >= REEL_HOLD) { go(s, 'idle'); ev.push({ type: 'end' }); }
      break;
  }
  return ev;
}

// ───────────── 결과 ─────────────
export const FAIL_TOAST: Record<FailWhy, string> = {
  early: '앗, 너무 빨랐다! 물고기가 도망갔다…',
  late: '놓쳤다… 물고기가 도망갔다!',
  snap: '툭! 줄이 끊어졌다… 빨간 칸에선 E 를 놓아 줘요!',
  escape: '물고기가 힘껏 헤엄쳐 도망갔다… 다음엔 꼭!',
};
/** 쓰레기 한 줄(카드 본문) */
export const JUNK_LINE: Record<string, string> = {
  t_boot: '누가 장화를 한 짝만 버렸지? 화분으로 쓰면 귀엽겠다!',
  t_can: '찌그렁 깡통! 너구리 고물상이 좋아할 거야.',
  t_tire: '헌 타이어…? 굴려서 놀면 재밌겠다!',
  m_seaweed: '미끌미끌 해초~ 잠수복 재료가 된대!',
  t_rustykey: '녹슨 열쇠다! 닦아 보니 은열쇠 조각이었어 ✨',
  t_bottle: '병 속에 편지가…? 두근두근, 열어 보자!',
};

export interface OutcomeHooks {
  catchFail(activity: Activity): void;
  reportCatch(r: RollResult): void;
  /** 진짜 물고기 잡았다 연출(showCatch) */
  showCatch(o: { speciesId: string; size: number; variant?: Variant; activity: Activity; line: string }): void;
  give(id: string, n: number, why: string): number;
  card(o: { title: string; body: string; icon?: string; junk: string }): void;
  /** 그 종 도감 최대 크기(없으면 undefined) */
  prevBest?(id: string): number | undefined;
  /** 말장난 한 줄 */
  pun?(r: RollResult): string;
  /** 아이템 이름·아이콘 */
  itemName?(id: string): { name: string; icon?: string } | undefined;
}

/** 놓쳤다 — 늘 econ.catchFail(activity)(콤보 0, 'catch-fail' 이벤트) */
export function resolveFail(activity: Activity, hooks: Pick<OutcomeHooks, 'catchFail'>): void {
  hooks.catchFail(activity);
}

/**
 * 잡았다! 쓰레기면 카드 + econ.give, 물고기면 showCatch(크기·변이·활동) 다음 reportCatch.
 * size 는 굴림 값(없으면 fallback). 돌려주는 값 = 'junk' | 'fish' | 'none'.
 */
export function resolveCatch(r: RollResult, activity: Activity, hooks: OutcomeHooks, fallback?: number): 'junk' | 'fish' | 'none' {
  if (r.junk) {
    const it = hooks.itemName?.(r.junk);
    const name = it?.name ?? r.junk;
    hooks.give(r.junk, 1, 'fishing-junk');
    hooks.card({ title: `${name}을(를) 낚았다…`, body: JUNK_LINE[r.junk] ?? '이건… 물고기가 아니잖아!', icon: it?.icon, junk: r.junk });
    return 'junk';
  }
  if (!r.species) return 'none';
  const size = r.size ?? fallback ?? 20;
  const prev = hooks.prevBest?.(r.species.id);
  const line = sizeLine(prev, size, r.variant) ?? hooks.pun?.(r) ?? `${r.species.name ?? '물고기'}을(를) 잡았다!`;
  hooks.showCatch({ speciesId: r.species.id, size, variant: r.variant, activity, line });
  hooks.reportCatch(r);
  return 'fish';
}
