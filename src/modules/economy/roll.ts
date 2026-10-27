// 잡기 굴림 — GDD 5.2(알고리즘)·5.3(천장·콤보·오늘 첫 잡기)·3.5(쓰레기). 부수효과 없는 순수 모듈.
// economy.ts 가 RollEnv 를 만들어 부르고, fishing·insects·ocean·space 는 game.econ.rollCatch 로 쓴다.
// 미리 굴리는 쪽(낚시 그림자 1~3개·청크마다 곤충 2~5마리)은 { commit:false } 로 굴리고,
// 정말 잡았을 때 commitCatch(=econ.reportCatch) 로 천장·콤보·오늘 첫 잡기를 반영한다.
// 다른 파일을 import 하지 않는다(타입도 여기서 정의) — 어디서든 읽기 전용으로 가져다 써도 된다.
// 변경되는 건 넘겨받은 RollState(flags.econ.roll) 하나뿐이다.

export type Activity = 'fish' | 'bug' | 'dive' | 'space' | 'moonfish';

export interface RollSpecies {
  id: string;
  rarity: number;
  category?: string;
  tags?: string[];
  /** 평균 크기 cm — 있으면 개체 크기를 굴린다 */
  len?: number;
  where?: Array<{ island?: string; zone?: string; time?: string | string[]; weather?: { only?: string[]; boost?: string[]; x?: number }; dev?: string }>;
}

export interface RollQuery {
  activity: Activity;
  /** 지금 자리(섬·구역·시간)에서 나올 수 있는 종 — 호출하는 쪽이 고른다 */
  pool: RollSpecies[];
  /** 미끼 아이템 id(bait_worm·bait_dough·bait_lure·bait_golden …). 아무 미끼나 있으면 쓰레기 8% */
  bait?: string;
  /** 켜진 버프 이름(grilled_fish·friend …) */
  buffs?: string[];
  /** 주면 env.rng(key) 대신 이 난수를 쓴다(테스트·특수 굴림) */
  rng?: () => number;
  /** true 면 낚시 쓰레기를 먼저 굴린다(activity 'fish' 만) */
  junk?: boolean;
  /** 반짝이 확률 배율(황금 잠자리채·행운 쿠키 ×2 등, 기본 1) */
  luckMult?: number;
  /**
   * 기본 true — 굴리자마자 잡은 걸로 치고 천장·콤보·오늘 첫 잡기를 갱신한다.
   * false 면 굴림 횟수(count, 난수 키)만 올리고 나머지는 그대로 — 잡았을 때 commitCatch 로 반영한다.
   */
  commit?: boolean;
  /**
   * 지금 자리. 주면 where 줄 중 이 자리(섬·구역·시간)에 맞는 줄만 본다(GDD 5.2 1단계).
   * island 'any'·zone 'shore' 줄은 모든 섬에서 맞는다. time 을 안 주면 env.tod.
   * 안 주면 자리 검사를 건너뛴다 — 그땐 호출하는 쪽이 pool 의 where 를 이 자리 줄로 잘라서 넘겨야 한다.
   */
  place?: RollPlace;
}

export interface RollPlace { island?: string; zone?: string; time?: string }

export interface RollEnv {
  day: number;
  hour: number;
  tod: string;
  weather: string;
  p0: boolean;
  /** 오늘의 손님 생물 id — 같은 희귀도 안에서 ×5 */
  guestId?: string;
  /** 태그별 출현 배율(ext.calendar.boosts()) — 맞는 태그마다 곱한다 */
  boostTags?: Record<string, number>;
  /** 해금 키 확인 — 없으면 전부 해금으로 본다 */
  isUnlocked?: (k: string) => boolean;
  /** 키 → 시드 고정 난수(ctx.rng / rngFor) */
  rng: (key: string) => () => number;
}

export interface RollState {
  /** activity 별 천장 카운터 — 마지막 ★3+/★4+/★5 뒤로 몇 번 잡았나 */
  pity: Record<string, { since3: number; since4: number; since5: number }>;
  /** 연속 성공 수(catchFail 이면 0) */
  combo: number;
  /** activity 별 '오늘 첫 잡기' 를 받은 게임 날짜 */
  firstDay: Record<string, number>;
  /** activity 별 굴림 횟수(난수 키에 쓴다) */
  count: Record<string, number>;
}

export interface RollResult {
  /** 잡힌 종. 쓰레기거나 후보가 없으면 null */
  species: RollSpecies | null;
  /** 정해진 희귀도(쓰레기·빈손이면 0) */
  rarity: number;
  /** 쓰레기 아이템 id */
  junk?: string;
  /** 개체 크기 cm(종에 len 이 있을 때만) */
  size?: number;
  variant?: 'shiny' | 'crown' | 'tiny';
  /** 이번 굴림 뒤 콤보 */
  combo: number;
  /** 천장으로 희귀도가 올라갔나 */
  pityHit?: boolean;
  /** 오늘 첫 잡기 보상(★3+ 확정)이었나 */
  firstOfDay?: boolean;
}

/** 희귀도 기본 가중치(GDD 5.1) */
export const RARITY_W: Readonly<Record<number, number>> = Object.freeze({ 1: 55, 2: 27, 3: 12, 4: 5, 5: 1 });

/** 낚시 쓰레기 표(GDD 3.5 #5) — 녹슨 열쇠는 은열쇠 조각, 병편지는 편지 */
export const JUNK_TABLE: ReadonlyArray<{ readonly id: string; readonly w: number }> = Object.freeze([
  { id: 't_boot', w: 35 },
  { id: 't_can', w: 35 },
  { id: 'm_seaweed', w: 15 },
  { id: 't_rustykey', w: 10 },
  { id: 't_bottle', w: 5 },
]);

/** 쓰레기 확률: 미끼 있으면 8%, 없으면 12% */
export const JUNK_RATE = { bait: 0.08, none: 0.12 } as const;
/** 반짝이 기본 확률 */
export const SHINY_P = 1 / 256;
/** 크기 표준편차 = 평균 × 0.15, 왕관 z>2.33(상위 1%), 꼬마 z<−1.88(하위 3%) */
export const SIZE_SD = 0.15, CROWN_Z = 2.33, TINY_Z = -1.88;
/** 쑥쑥 물약 버프('bigsize')가 크기 z 에 더하는 값 */
export const BIG_Z = 0.35;
/** 천장(GDD 5.3): ★3+ 20회 안, ★4+ 80회 안, ★5 300회부터 상승·400회 확정 */
export const PITY = { r3: 19, r4: 79, r5ramp: 300, r5ramp_w: 0.6, r5: 399, gauge: 400 } as const;

const RARITIES = [1, 2, 3, 4, 5] as const;

export function newRollState(): RollState {
  return { pity: {}, combo: 0, firstDay: {}, count: {} };
}

/** 저장에서 읽은 상태가 비었거나 깨졌어도 굴릴 수 있게 채운다 */
function fix(s: RollState) {
  if (!s.pity || typeof s.pity !== 'object') s.pity = {};
  if (!s.firstDay || typeof s.firstDay !== 'object') s.firstDay = {};
  if (!s.count || typeof s.count !== 'object') s.count = {};
  if (!Number.isFinite(s.combo)) s.combo = 0;
}

function pityOf(s: RollState, a: Activity) {
  fix(s);
  let p = s.pity[a];
  if (!p) p = s.pity[a] = { since3: 0, since4: 0, since5: 0 };
  return p;
}

/** 놓쳤다(catch-fail): 콤보만 0 으로. 천장은 그대로 */
export function catchFail(s: RollState, _activity: Activity): void {
  fix(s);
  s.combo = 0;
}

/** HUD 두근 게이지 = since5 / 400 (0~1). 0.8 을 넘으면 낚싯줄이 분홍으로 반짝 */
export function pityGauge(s: RollState, activity: Activity): number {
  const p = s?.pity?.[activity];
  return p ? Math.min(1, Math.max(0, p.since5 / PITY.gauge)) : 0;
}

/** 콤보 보너스(★3+): 연속 5회부터 1회당 +2%, 최대 +20% — 콤보 5 = +10%, 10 이상 = +20% */
export function comboBonus(combo: number): number {
  return combo >= 5 ? Math.min(0.2, 0.02 * combo) : 0;
}

type Where = NonNullable<RollSpecies['where']>[number];

/** 하루 종일 나오는 시간 표기 */
const ALL_TIME = new Set(['all', 'any', 'always', '종일']);

/** where 줄 하나가 지금 자리(섬·구역·시간)에 맞나 — place 가 없으면 늘 맞는다 */
function whereHere(w: Where, place: RollPlace | undefined, env: RollEnv): boolean {
  if (!place) return true;
  // 해안(shore) 줄은 모든 섬 해안에서 후보 — 섬을 보지 않는다. island 'any' 도 어느 섬이든
  if (w.zone !== 'shore' && w.island && w.island !== 'any' && place.island && w.island !== place.island) return false;
  if (w.zone && place.zone && w.zone !== place.zone) return false;
  const tod = place.time ?? env.tod;
  // place.time 을 직접 주면 이름으로만 맞춘다. 아니면 정오·자정은 env.hour 시간 창으로 본다
  const hour = place.time == null && env.hour != null && Number.isFinite(env.hour) ? env.hour : undefined;
  // 시간대 이름도 시각도 모르면 시간은 보지 않는다(tod 가 비어도 시각이 있으면 시간 창으로 거른다)
  if (w.time != null && (tod || hour != null)) {
    const ts = Array.isArray(w.time) ? w.time : [w.time];
    if (ts.length && !ts.some(t => ALL_TIME.has(t) || (!!tod && t === tod) || inHourWindow(t, hour))) return false;
  }
  return true;
}

/** 정오(11~13시)·자정(00~02시) — tod 는 morning/day/sunset/night 뿐이라 시각으로 따로 본다(GDD 1.x) */
const HOUR_WINDOW: Readonly<Record<string, readonly [number, number]>> = Object.freeze({ noon: [11, 13], midnight: [0, 2] });

function inHourWindow(t: string, hour: number | undefined): boolean {
  const win = HOUR_WINDOW[t];
  if (!win || hour == null || !Number.isFinite(hour)) return false;
  const h = ((hour % 24) + 24) % 24;
  return h >= win[0] && h < win[1];
}

/** where 줄 하나가 지금 열려 있나: 자리 + dev 해금 + weather.only */
function whereOpen(w: Where, env: RollEnv, place?: RollPlace): boolean {
  if (!whereHere(w, place, env)) return false;
  if (w.dev && env.isUnlocked && !env.isUnlocked(w.dev)) return false;
  const only = w.weather?.only;
  if (only && only.length && !only.includes(env.weather)) return false;
  return true;
}

/**
 * 후보 거르기 — where 가 없으면 통과, 있으면 열린 줄(자리·해금·날씨가 다 맞는 줄)이 하나라도 있어야 한다.
 * place 를 안 주면 자리는 보지 않으니, 다른 섬 줄이 열려 있어 섞여 들지 않게 pool 을 미리 잘라 둘 것.
 */
export function rollCandidates(pool: RollSpecies[], env: RollEnv, place?: RollPlace): RollSpecies[] {
  const out: RollSpecies[] = [];
  for (const sp of pool) {
    if (!sp || !(sp.rarity >= 1 && sp.rarity <= 5)) continue;
    const ws = sp.where;
    if (!ws || ws.length === 0 || ws.some(w => whereOpen(w, env, place))) out.push(sp);
  }
  return out;
}

/** 희귀도 가중치 W[r] × 미끼·버프·콤보 (r 조건 맞는 것만) */
export function rarityWeights(bait: string | undefined, buffs: string[] | undefined, combo: number): Record<number, number> {
  const W: Record<number, number> = { ...RARITY_W };
  const has = (b: string) => !!buffs && buffs.includes(b);
  const cb = comboBonus(combo);
  for (const r of RARITIES) {
    let m = 1;
    if (bait === 'bait_dough' && r >= 2) m *= 1.3;
    if (bait === 'bait_lure' && r >= 3) m *= 1.5;
    if (bait === 'bait_golden' && r >= 5) m *= 3;
    if ((has('grilled_fish') || has('grilled')) && r >= 3) m *= 1.2;
    // 친구 방문 ×1.1 — 모든 희귀도에 곱하면 효과가 없으니 ★3+ 에만(생선구이와 같은 결)
    if (has('friend') && r >= 3) m *= 1.1;
    // 별빛 물약(물약 가게, wave 4) ★4+ ×1.3
    if (has('starlight') && r >= 4) m *= 1.3;
    // 무지개 루어(세트 보상, 영구) ★3+ ×1.2 — 낚시에서만 싣는다(economy.rollCatch)
    if (has('rainbowlure') && r >= 3) m *= 1.2;
    // 혜성여우 소원(하루 희귀 업) ★3+ ×1.2
    if (has('wish') && r >= 3) m *= 1.2;
    if (cb > 0 && r >= 3) m *= 1 + cb;
    W[r] *= m;
  }
  return W;
}

/** 가중치 표에서 하나 고르기 */
function pickWeighted<T>(items: T[], weight: (t: T) => number, u: number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  let x = u * total;
  for (const it of items) {
    x -= Math.max(0, weight(it));
    if (x < 0) return it;
  }
  return items[items.length - 1];
}

/** 같은 희귀도 안 종 가중치: 기본 1 × weather.boost(x, 기본 3) × 오늘의 손님 ×5 × 태그 배율(0 이면 안 나옴) */
export function speciesWeight(sp: RollSpecies, env: RollEnv, place?: RollPlace): number {
  let w = 1;
  let boost = 1;
  for (const wh of sp.where ?? []) {
    const b = wh.weather?.boost;
    if (b && b.includes(env.weather) && whereOpen(wh, env, place)) boost = Math.max(boost, wh.weather?.x ?? 3);
  }
  w *= boost;
  if (env.guestId && sp.id === env.guestId) w *= 5;
  if (env.boostTags && sp.tags) {
    for (const t of sp.tags) {
      const m = env.boostTags[t];
      if (typeof m === 'number' && Number.isFinite(m) && m >= 0) w *= m;
    }
  }
  return w;
}

/** 표준정규 z (Box-Muller) */
function gauss(rnd: () => number): number {
  const u1 = 1 - rnd(); // (0, 1]
  const u2 = rnd();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * 잡기 굴림(GDD 5.2). 순서:
 * 쓰레기 → 후보 거르기 → W × 미끼·버프·콤보 → 천장 → 오늘 첫 잡기 → r 고르기(없으면 r−1…, r+1…)
 * → 종 가중치 → 크기·왕관·꼬마 → 반짝이 → 카운터 갱신.
 * 난수는 `roll:${activity}:${day}:${count}` 하나로 — 같은 저장이면 같은 결과.
 * q.commit === false 면 count 만 올리고 천장·콤보·오늘 첫 잡기는 commitCatch 때 반영한다.
 */
export function rollCatch(q: RollQuery, s: RollState, env: RollEnv): RollResult {
  const commit = q.commit !== false;
  fix(s);
  const a = q.activity;
  const n = s.count[a] ?? 0;
  s.count[a] = n + 1;
  const rnd = q.rng ?? env.rng(`roll:${a}:${env.day}:${n}`);
  const p = pityOf(s, a);

  // 종 가중치 0(태그 배율 0 = 막기)인 종은 아예 후보에서 뺀다 — 그 희귀도가 비면 r−1/r+1 로 넘어간다
  const sw = new Map<RollSpecies, number>();
  const cands = rollCandidates(q.pool ?? [], env, q.place).filter(sp => {
    const w = speciesWeight(sp, env, q.place);
    sw.set(sp, w);
    return w > 0;
  });
  const byR: Record<number, RollSpecies[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const sp of cands) byR[sp.rarity].push(sp);
  const maxR = cands.reduce((m, sp) => Math.max(m, sp.rarity), 0);
  const firstPending = s.firstDay[a] !== env.day;
  const firstOk = firstPending && maxR >= 3;

  // 1) 쓰레기(낚시만) — 오늘 첫 잡기 보상이 남아 있으면 쓰레기를 아예 굴리지 않는다(GDD 밖 규칙, 로컬 폴백도 같게)
  const uJunk = rnd(), uJunkPick = rnd();
  if (q.junk && a === 'fish' && !firstOk) {
    const rate = q.bait ? JUNK_RATE.bait : JUNK_RATE.none;
    if (uJunk < rate) {
      const j = pickWeighted([...JUNK_TABLE], t => t.w, uJunkPick);
      return { species: null, rarity: 0, junk: j.id, combo: s.combo };
    }
  }

  const uR = rnd(), uSp = rnd();
  if (cands.length === 0) return { species: null, rarity: 0, combo: s.combo };

  // 2) 희귀도 가중치 × 보너스
  const W = rarityWeights(q.bait, q.buffs, s.combo);

  // 3) 천장 — ★5 는 300회부터 W[5] 상승, 399 면 확정
  let minR = 1;
  let pityMin = 1; // 천장이 요구하는 희귀도(후보 유무와 무관)
  if (p.since5 >= PITY.r5ramp) W[5] += (p.since5 - PITY.r5ramp) * PITY.r5ramp_w;
  if (p.since3 >= PITY.r3) pityMin = 3;
  if (p.since4 >= PITY.r4) pityMin = 4;
  if (p.since5 >= PITY.r5) pityMin = 5;
  // 후보가 없는 높이로는 올리지 않는다(있는 것 중 가장 높은 데까지만)
  minR = Math.max(minR, Math.min(pityMin, Math.max(1, maxR)));

  // 4) 오늘 첫 잡기 → ★3+ (후보가 있을 때만)
  if (firstOk) minR = Math.max(minR, 3);

  // 5) r 고르기 — minR 이상에서만 W 로 굴리고, 그 r 에 후보가 없으면 r−1…minR, r+1…5, 그래도 없으면 minR−1…1
  const pool = RARITIES.filter(r => r >= minR);
  let r: number = pickWeighted(pool as number[], x => W[x], uR);
  const order: number[] = [];
  for (let k = r; k >= minR; k--) order.push(k);
  for (let k = r + 1; k <= 5; k++) order.push(k);
  for (let k = minR - 1; k >= 1; k--) order.push(k);
  r = order.find(k => byR[k].length > 0)!;

  // 6) 같은 r 안 종 가중치
  const list = byR[r];
  const species = list.length === 1 ? list[0] : pickWeighted(list, sp => sw.get(sp) ?? 0, uSp);

  // 7) 크기·변이 — 반짝이 > 왕관 > 꼬마
  // 쑥쑥 물약(wave 4): 크기 분포를 +0.35σ 밀어 큰 개체·왕관이 잘 나온다(난수 소비 순서는 그대로)
  const z = gauss(rnd) + (q.buffs?.includes('bigsize') ? BIG_Z : 0);
  const uShiny = rnd();
  let size: number | undefined;
  if (species.len && species.len > 0) size = Math.max(0.1, Math.round(species.len * (1 + SIZE_SD * z) * 10) / 10);
  let variant: RollResult['variant'];
  const luck = q.luckMult != null && Number.isFinite(q.luckMult) && q.luckMult > 0 ? q.luckMult : 1;
  if (uShiny < SHINY_P * luck) variant = 'shiny';
  else if (z > CROWN_Z) variant = 'crown';
  else if (z < TINY_Z) variant = 'tiny';

  // 이 자리에 ★3+ 가 없으면 보상은 아껴 둔다(★3+ 가 나오는 곳에서 받는다) — firstOk 가 아니면 표시 안 함
  // combo 는 '잡으면 될 콤보'(commit:false 여도 같은 값) — 실제 반영은 8)
  const res: RollResult = { species, rarity: r, combo: s.combo + 1 };
  if (size !== undefined) res.size = size;
  if (variant) res.variant = variant;
  if (pityMin > 1 && r >= pityMin) res.pityHit = true;
  if (firstOk) res.firstOfDay = true;

  // 8) 카운터 갱신 — 잡은 걸로 칠 때만
  return commit ? commitCatch(s, a, res, env.day) : res;
}

/**
 * 정말 잡았다(econ.reportCatch): 천장 since3/4/5 를 r 에 따라 0 또는 +1, 콤보 +1,
 * res.firstOfDay 면 오늘 첫 잡기 보상을 쓴 걸로(firstDay[activity] = day).
 * 쓰레기·빈손(species null)이면 아무것도 안 바꾼다(굴림 즉시 반영하던 때와 같다).
 * 돌려주는 건 반영된 결과 사본 — combo 는 반영 뒤 값, 오늘 보상을 이미 다른 걸로 받았으면 firstOfDay 를 뗀다.
 */
export function commitCatch(s: RollState, activity: Activity, res: RollResult, day: number): RollResult {
  fix(s);
  if (!res || !res.species || !(res.rarity >= 1)) return { ...res, combo: s.combo };
  const p = pityOf(s, activity);
  const r = res.rarity;
  // 미리 굴린 그림자는 굴릴 때의 천장 표시를 들고 있다 — 지금 카운터로 다시 본다(형제 그림자가 먼저 잡혔으면 뗀다)
  const pityNow = (r >= 5 && p.since5 >= PITY.r5) || (r >= 4 && p.since4 >= PITY.r4) || (r >= 3 && p.since3 >= PITY.r3);
  p.since3 = r >= 3 ? 0 : p.since3 + 1;
  p.since4 = r >= 4 ? 0 : p.since4 + 1;
  p.since5 = r >= 5 ? 0 : p.since5 + 1;
  s.combo += 1;
  const out: RollResult = { ...res, combo: s.combo };
  if (res.pityHit && !pityNow) delete out.pityHit;
  if (res.firstOfDay) {
    if (s.firstDay[activity] === day) delete out.firstOfDay; // 같은 날 미리 굴린 두 번째 그림자
    else s.firstDay[activity] = day;
  }
  return out;
}
