// 곤충 P1 규칙(GDD 3.6 P1 · 4.6.2 ③) — 반딧불 군무 · 반딧불 놓아주기 · 곤충 씨름 · 쇠똥구리 따라가기 · 난초사마귀 위장.
// 순수 함수만(three·DOM 없음) → tests/insects-p1.test.ts 가 바로 부른다. 그리기·입력은 insects/p1world.ts.
import { splitVariant } from '../../core/api';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
/** 0..1 로 감기(음수도) */
const wrap1 = (v: number) => ((v % 1) + 1) % 1;

/** 이 모듈이 읽는 종 모양(data.BugSpecies 의 일부 — 테스트는 가짜 종을 넘긴다) */
export interface P1Species {
  id: string;
  gdd?: string;
  name: string;
  kind?: string;
  rarity: number;
  cm?: readonly [number, number];
  tags?: string[];
  p1?: boolean;
}

// ═════════════════════ ① 반딧불 군무 ═════════════════════
export const DANCE = {
  /** 평소 마릿수(GDD: 30마리 동시) */
  n: 30,
  /** 목요일 대축제 마릿수 */
  festivalN: 90,
  /** 놓아준 반딧불 3마리마다 1마리씩 군무에 합류(최대) */
  releaseBonusMax: 30,
  /** 퍼지는 반경(m) */
  radius: 7,
  festivalRadius: 13,
  /** 한 번 깜빡이는 주기(초) */
  period: 2.2,
  /** 처음엔 제각각 → 이 시간 상수로 박자가 맞아 간다(초) */
  syncTau: 5,
  /** 한 주기 안에서 켜져 있는 몫 */
  flash: 0.3,
  /** 꺼져 있을 때도 남는 은은한 불빛 */
  ember: 0.08,
  /** 이 거리(m) 안에 오면 군무를 그린다 */
  showDist: 140,
} as const;

/** 지금 군무 시간인가 — 밤(21~05) + 저녁 20시부터 */
export function danceTime(tod: string, hour: number): boolean {
  if (tod === 'night') return true;
  return tod === 'sunset' && hour >= 20;
}

/** 대축제(목요일 = weekday 3, 또는 calendar 의 weekday-event 'firefly' 가 켜짐) */
export function festivalOn(weekday: number | null | undefined, eventActive: boolean | null | undefined): boolean {
  return !!eventActive || weekday === 3;
}

/** 군무 마릿수: 평소 30 / 대축제 90, 놓아준 반딧불이 조금씩 합류 */
export function danceCount(festival: boolean, released = 0): number {
  const bonus = Math.min(DANCE.releaseBonusMax, Math.floor(Math.max(0, released) / 3));
  return (festival ? DANCE.festivalN : DANCE.n) + bonus;
}

/** 한 마리 처음 박자 어긋남(−0.5..0.5) — rnd 하나 */
export const danceOffset = (rnd: () => number) => rnd() - 0.5;

/**
 * 한 마리의 깜빡 위상(0..1). 모두 같은 큰 박자(t/period)를 따르고,
 * 처음 어긋남(off0)은 군무가 시작된 뒤(age) exp(-age/syncTau)로 줄어든다 → 15초쯤이면 다 같이 반짝.
 */
export function dancePhase(off0: number, age: number, t: number, period: number = DANCE.period): number {
  const k = Math.exp(-Math.max(0, age) / DANCE.syncTau);
  return wrap1(t / period + off0 * k);
}

/** 위상 → 밝기(0..1): 주기 앞쪽 flash 몫 동안 둥글게 켜졌다 꺼진다 */
export function flashOf(phase: number): number {
  const p = wrap1(phase);
  if (p < DANCE.flash) return DANCE.ember + (1 - DANCE.ember) * Math.sin((p / DANCE.flash) * Math.PI);
  return DANCE.ember;
}

/** 위상들이 얼마나 흩어졌나(원형 평균에서 가장 먼 거리, 0..0.5) — 0 이면 완전히 같이 깜빡 */
export function phaseSpread(phases: readonly number[]): number {
  if (!phases.length) return 0;
  let sx = 0, sy = 0;
  for (const p of phases) { sx += Math.cos(p * Math.PI * 2); sy += Math.sin(p * Math.PI * 2); }
  const mean = wrap1(Math.atan2(sy, sx) / (Math.PI * 2));
  let worst = 0;
  for (const p of phases) {
    const d = Math.abs(wrap1(p - mean + 0.5) - 0.5);
    if (d > worst) worst = d;
  }
  return worst;
}

/** 한 마리의 집(군무 중심 기준): 반경 안 돔 모양으로 흩뿌린다 */
export interface DanceFly { hx: number; hz: number; hy: number; off0: number; ph: number; sp: number }
export function danceFlies(n: number, radius: number, rnd: () => number): DanceFly[] {
  const out: DanceFly[] = [];
  for (let i = 0; i < n; i++) {
    // 해바라기 씨앗 배치 + 흔들기(뭉치지 않게 고르게)
    const a = i * 2.39996 + rnd() * 0.6;
    const r = radius * Math.sqrt((i + 0.5) / n) * (0.8 + rnd() * 0.3);
    out.push({
      hx: Math.cos(a) * r, hz: Math.sin(a) * r,
      hy: 0.7 + rnd() * 2.4 * (1 - (r / radius) * 0.4),
      off0: danceOffset(rnd), ph: rnd() * Math.PI * 2, sp: 0.6 + rnd() * 0.6,
    });
  }
  return out;
}

/** 떠도는 자리(중심 기준 오프셋). 대축제엔 박자에 맞춰 원이 천천히 돈다 */
export function flyOffset(f: DanceFly, t: number, festival: boolean, out: { x: number; y: number; z: number }) {
  const a = t * 0.35 * f.sp + f.ph;
  let x = f.hx + Math.sin(a) * 0.7 + Math.sin(a * 2.3) * 0.25;
  let z = f.hz + Math.cos(a * 0.8) * 0.7;
  if (festival) {
    // 대축제: 전체가 느리게 회전 + 숨 쉬듯 부풀었다 오므라든다
    const rot = t * 0.12;
    const c = Math.cos(rot), s = Math.sin(rot);
    const k = 1 + 0.12 * Math.sin(t * 0.9);
    const rx = (x * c - z * s) * k, rz = (x * s + z * c) * k;
    x = rx; z = rz;
  }
  out.x = x; out.z = z;
  out.y = f.hy + Math.sin(a * 1.7) * 0.35;
  return out;
}

// ═════════════════════ ② 반딧불 놓아주기 ═════════════════════
/** 놓아주는 순서: 말랑섬 반딧불이 먼저, 그다음 늪의 깜빡이, 나머지 반딧불 종 */
export const RELEASE_ORDER = ['b_firefly', 'b_firefly_swarm', 'b_lava_firefly', 'b_star_firefly'] as const;

export interface ReleasePick { id: string; species: string; n: number }

/** 반딧불인가(별빛반딧불여왕 ★5 은 아껴 두게 빼고) */
export const isFirefly = (sp: P1Species | undefined | null) =>
  !!sp && (sp.kind === 'firefly' || !!sp.tags?.includes('firefly')) && sp.gdd !== 'b_firefly_queen' && sp.rarity < 5;

/**
 * 가방에서 놓아줄 반딧불 한 묶음 고르기 — 변이(@shiny·@crown·@tiny)는 아까우니 건드리지 않는다.
 * byId: 실제 id(bug-firefly) 또는 GDD id(b_firefly) → 종.
 */
export function pickRelease(bag: Readonly<Record<string, number>>, byId: (id: string) => P1Species | undefined): ReleasePick | null {
  const cands: Array<ReleasePick & { rank: number }> = [];
  for (const [key, n] of Object.entries(bag)) {
    if (!(n > 0)) continue;
    const sv = splitVariant(key);
    if (sv.variant) continue;
    const sp = byId(sv.id);
    if (!isFirefly(sp)) continue;
    const gdd = sp!.gdd ?? sp!.id;
    const r = (RELEASE_ORDER as readonly string[]).indexOf(gdd);
    cands.push({ id: key, species: gdd, n: Math.floor(n), rank: r < 0 ? RELEASE_ORDER.length : r });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
  const { id, species, n } = cands[0];
  return { id, species, n };
}

/** 놓아주기가 만지는 것(game.state 와 같은 모양) */
export interface ReleaseSink {
  bag: Record<string, number>;
  flags: Record<string, unknown>;
  addItem(id: string, n: number): void;
  emit(e: { type: string; [k: string]: unknown }): void;
  save(): void;
}

export interface ReleaseResult { species: string; n: number; where: string; total: number; id: string }

/** flags.insects(없으면 만든다) */
export function insectFlags(flags: Record<string, unknown>): InsectFlags {
  let f = flags.insects as InsectFlags | undefined;
  if (!f || typeof f !== 'object') { f = { released: 0 }; flags.insects = f; }
  if (typeof f.released !== 'number' || !Number.isFinite(f.released)) f.released = 0;
  return f;
}
export interface InsectFlags {
  /** 지금까지 놓아준 반딧불 수(계약 v2 7장 insects {released}) */
  released: number;
  /** 곤충 씨름 기록 */
  sumo?: SumoFlags;
  /** 쇠똥구리 보물: 섬 → 마지막으로 판 날 */
  dung?: Record<string, number>;
  [k: string]: unknown;
}

/**
 * 반딧불 놓아주기: 가방에서 한 묶음(max 마리까지) 빼고 → flags.insects.released += n → release {species, n, where} → 저장.
 * 놓아줄 게 없으면 null(아무것도 안 바뀜).
 */
export function releaseFireflies(
  s: ReleaseSink, byId: (id: string) => P1Species | undefined, where: string, max = Infinity,
): ReleaseResult | null {
  const pick = pickRelease(s.bag, byId);
  if (!pick) return null;
  const n = Math.max(1, Math.min(pick.n, Math.floor(max)));
  s.addItem(pick.id, -n);
  const f = insectFlags(s.flags);
  f.released += n;
  s.emit({ type: 'release', species: pick.species, n, where });
  s.save();
  return { species: pick.species, n, where, total: f.released, id: pick.id };
}

/** 놓아주기 자리: 물가·늪·하트 연못·안개 호수(+ 반딧불 정원·군무 자리 근처는 p1world 가 따로 본다) */
export const RELEASE_ZONES = new Set(['river', 'swamp', 'heartpond', 'foglake', 'oasis', 'ancientlake']);

// ═════════════════════ ③ 곤충 씨름 ═════════════════════
/** 씨름에 나갈 수 있는 몸(딱정벌레 무리) */
export const SUMO_KINDS = new Set(['rhino', 'stag', 'beetle', 'dungbeetle', 'ladybug']);
/** 종류별 힘·몸무게 보정: 장수풍뎅이 = 뿔로 들어 올리기, 사슴벌레 = 집게로 버티기 */
const KIND_POW: Record<string, number> = { rhino: 1.12, stag: 1.06, beetle: 0.96, dungbeetle: 1.0, ladybug: 0.82 };
const KIND_W: Record<string, number> = { rhino: 1.1, stag: 1.05, beetle: 1.0, dungbeetle: 1.05, ladybug: 0.85 };
/** ★ → 기본 힘 */
const RAR_POW = [0, 1, 1.25, 1.6, 2.05, 2.6];

export const SUMO = {
  /** 한 박자(초) */
  beat: 0.6,
  /** 박자 앞뒤 이만큼이면 '딱 좋아!' / '좋아!' */
  perfect: 0.075,
  good: 0.17,
  /** 최대 박자 수(그 뒤엔 판정) */
  beats: 16,
  /** 밀기 한 번 크기 */
  push: 0.17,
  /** 이 안이면 비김 */
  drawBand: 0.06,
  /** 연속 '딱 좋아!' 이만큼이면 필살 들어올리기 ×1.6 */
  comboLift: 3,
  /** 하루 별을 주는 승리 수 */
  starWinsPerDay: 5,
} as const;

export type TapGrade = 'perfect' | 'good' | 'miss';
const GRADE_MUL: Record<TapGrade, number> = { perfect: 1.15, good: 0.85, miss: 0 };

export interface Fighter {
  id: string;
  name: string;
  rarity: number;
  kind: string;
  /** 0.8..1.25 — 크기(잡은 최고 cm) 보정 */
  sizeK: number;
  power: number;
  weight: number;
}

/** 씨름에 나갈 수 있는 종인가 */
export const canSumo = (sp: P1Species | undefined | null) =>
  !!sp && !sp.p1 && (SUMO_KINDS.has(sp.kind ?? '') || !!sp.tags?.includes('sumo'));

/**
 * 능력치: ★ 와 크기에서. sizeCm 은 그 종을 잡은 최고 크기(도감 best) — 범위 안에서 0.85..1.15,
 * 왕관(crown) 변이 ×1.2 · 꼬마(tiny) ×0.8.
 */
export function sumoStats(sp: P1Species, sizeCm?: number | null, variant?: string | null): Fighter {
  const r = clamp(Math.round(sp.rarity) || 1, 1, 5);
  const kind = sp.kind ?? 'beetle';
  let sizeK = 1;
  const cm = sp.cm;
  if (cm && typeof sizeCm === 'number' && sizeCm > 0) {
    const span = Math.max(1e-6, cm[1] - cm[0]);
    sizeK = 0.85 + clamp01((sizeCm - cm[0]) / span) * 0.3;
    // 범위보다 크면(왕관급) 조금 더
    if (sizeCm > cm[1]) sizeK += Math.min(0.1, ((sizeCm - cm[1]) / span) * 0.1);
  }
  if (variant === 'crown') sizeK *= 1.2;
  else if (variant === 'tiny') sizeK *= 0.8;
  sizeK = clamp(sizeK, 0.6, 1.4);
  const power = RAR_POW[r] * (KIND_POW[kind] ?? 1) * sizeK;
  const weight = (0.8 + r * 0.1) * (KIND_W[kind] ?? 1) * sizeK;
  return { id: sp.id, name: sp.name, rarity: r, kind, sizeK, power, weight };
}

/** 박자와의 시간 차(초, 절댓값) → 판정 */
export function tapGrade(dt: number): TapGrade {
  const d = Math.abs(dt);
  if (d <= SUMO.perfect) return 'perfect';
  if (d <= SUMO.good) return 'good';
  return 'miss';
}

/** 시각 t 에서 가장 가까운 박자 번호(0..)와 그 차이 — 씨름 시작 t0, 첫 박자는 t0 + beat */
export function nearestBeat(t: number, t0: number, beat: number = SUMO.beat): { k: number; dt: number } {
  const x = (t - t0) / beat;
  const k = Math.max(1, Math.round(x));
  return { k, dt: t - (t0 + k * beat) };
}

export interface Bout {
  me: Fighter;
  opp: Fighter;
  /** -1..1 — + 면 상대가 씨름판 끝으로 밀린다(1 이면 내가 이김) */
  pos: number;
  beat: number;
  combo: number;
  perfects: number;
  over: boolean;
  result: 'win' | 'lose' | 'draw' | null;
  /** 마지막 박자에서 일어난 일(연출용) */
  last: { grade: TapGrade; my: number; their: number; lift: boolean } | null;
}

export function newBout(me: Fighter, opp: Fighter): Bout {
  return { me, opp, pos: 0, beat: 0, combo: 0, perfects: 0, over: false, result: null, last: null };
}

/**
 * 한 박자 진행: 내 밀기 = 힘 × 판정 배율(연속 '딱 좋아!' 3번이면 필살 ×1.6),
 * 상대 밀기 = 힘 × (0.55..1.0 rnd). 둘의 차이를 두 몸무게 합으로 나눠 pos 를 옮긴다.
 * |pos| ≥ 1 이면 밀려난 쪽이 진다. 정한 박자 수가 지나면 pos 로 판정(가운데 띠면 비김).
 */
export function sumoStep(b: Bout, grade: TapGrade, rnd: () => number): Bout {
  if (b.over) return b;
  const combo = grade === 'perfect' ? b.combo + 1 : 0;
  const lift = grade === 'perfect' && combo >= SUMO.comboLift && combo % SUMO.comboLift === 0;
  const my = b.me.power * GRADE_MUL[grade] * (lift ? 1.6 : 1);
  const their = b.opp.power * (0.55 + 0.45 * clamp01(rnd()));
  const pos = clamp(b.pos + ((my - their) / (b.me.weight + b.opp.weight)) * SUMO.push * 2, -1, 1);
  const beat = b.beat + 1;
  let over = false;
  let result: Bout['result'] = null;
  if (pos >= 1) { over = true; result = 'win'; }
  else if (pos <= -1) { over = true; result = 'lose'; }
  else if (beat >= SUMO.beats) { over = true; result = sumoJudge(pos); }
  return { ...b, pos, beat, combo, perfects: b.perfects + (grade === 'perfect' ? 1 : 0), over, result, last: { grade, my, their, lift } };
}

/** 시간이 다 됐을 때 판정 */
export const sumoJudge = (pos: number): 'win' | 'lose' | 'draw' => (pos > SUMO.drawBand ? 'win' : pos < -SUMO.drawBand ? 'lose' : 'draw');

/** 판 전체(테스트·자동 루프용): 판정 열을 넣으면 끝난 판 */
export function runBout(me: Fighter, opp: Fighter, grades: readonly TapGrade[], rnd: () => number): Bout {
  let b = newBout(me, opp);
  for (let i = 0; i < SUMO.beats && !b.over; i++) b = sumoStep(b, grades[Math.min(i, grades.length - 1)] ?? 'miss', rnd);
  return b;
}

export interface SumoFlags { day: number; wins: number; streak: number; total: number; best: number; bouts: number }
export function sumoFlags(f: InsectFlags, day: number): SumoFlags {
  let s = f.sumo;
  if (!s || typeof s !== 'object') { s = { day, wins: 0, streak: 0, total: 0, best: 0, bouts: 0 }; f.sumo = s; }
  if (s.day !== day) { s.day = day; s.wins = 0; }
  for (const k of ['wins', 'streak', 'total', 'best', 'bouts'] as const) if (!Number.isFinite(s[k])) s[k] = 0;
  return s;
}

/**
 * 상금: 이기면 코인 120 × 상대 ★ × (1 + 연승 0.1, 최대 +50%), 별 1(대장 3) — 별은 하루 5승까지.
 * 비기면 40 코인, 지면 참가상 15 코인.
 */
export function sumoReward(result: 'win' | 'lose' | 'draw', oppRarity: number, streak: number, winsToday: number, champion = false): { coins: number; stars: number } {
  if (result === 'lose') return { coins: 15, stars: 0 };
  if (result === 'draw') return { coins: 40, stars: 0 };
  const r = clamp(Math.round(oppRarity) || 1, 1, 5);
  const coins = Math.round((120 * r * (1 + Math.min(5, Math.max(0, streak)) * 0.1) * (champion ? 1.5 : 1)) / 10) * 10;
  const stars = winsToday < SUMO.starWinsPerDay ? (champion ? 3 : 1) : 0;
  return { coins, stars };
}

/** 대장전: 네 판째마다 마을 씨름 대장(대장뿔장수풍뎅이)이 나온다 */
export const isChampionBout = (bouts: number) => bouts > 0 && (bouts + 1) % 4 === 0;

/**
 * 상대 고르기: 내 ★ 근처(오늘 이긴 만큼 조금씩 세진다). pool 은 씨름할 수 있는 종(도감 71종 안에서).
 * 대장전이면 b_rhino_beetle(없으면 가장 센 종)을 ×1.2 크기로.
 */
export function sumoOpponent(
  pool: readonly P1Species[], me: Fighter, winsToday: number, rnd: () => number, champion = false,
): { sp: P1Species; fighter: Fighter; champion: boolean } | null {
  const list = pool.filter(canSumo);
  if (!list.length) return null;
  if (champion) {
    const boss = list.find((s) => s.gdd === 'b_rhino_beetle') ?? [...list].sort((a, b) => b.rarity - a.rarity)[0];
    const f = sumoStats(boss, boss.cm ? boss.cm[1] : null);
    return { sp: boss, fighter: { ...f, power: f.power * 1.2, weight: f.weight * 1.1, sizeK: f.sizeK * 1.2 }, champion: true };
  }
  const want = clamp(me.rarity - 1 + Math.floor(winsToday / 2), 1, 5);
  let near = list.filter((s) => s.rarity === want);
  for (let d = 1; !near.length && d < 5; d++) near = list.filter((s) => Math.abs(s.rarity - want) === d);
  const sp = near[Math.floor(clamp01(rnd()) * near.length) % near.length];
  const cm = sp.cm;
  const size = cm ? cm[0] + (cm[1] - cm[0]) * (0.3 + 0.6 * clamp01(rnd())) : null;
  return { sp, fighter: sumoStats(sp, size), champion: false };
}

/** 가방에서 가장 센 딱정벌레(변이 포함) */
export function bestFighter(
  bag: Readonly<Record<string, number>>, byId: (id: string) => P1Species | undefined, bestCm: (id: string) => number | null,
): { key: string; sp: P1Species; fighter: Fighter } | null {
  let best: { key: string; sp: P1Species; fighter: Fighter } | null = null;
  for (const [key, n] of Object.entries(bag)) {
    if (!(n > 0)) continue;
    const sv = splitVariant(key);
    const sp = byId(sv.id);
    if (!canSumo(sp)) continue;
    const f = sumoStats(sp!, bestCm(sp!.id), sv.variant ?? null);
    if (!best || f.power > best.fighter.power || (f.power === best.fighter.power && key < best.key)) best = { key, sp: sp!, fighter: f };
  }
  return best;
}

// ═════════════════════ ④ 쇠똥구리 따라가기 ═════════════════════
export const DUNG = {
  /** 이 거리 안에 오면 굴리기 시작 */
  wake: 8,
  /** 플레이어가 이만큼 뒤처지면 기다린다 */
  wait: 9,
  /** 굴리는 속도(m/s) — 걷기보다 느리게 */
  speed: 1.5,
  /** 보물까지 거리(m) */
  trip: [18, 30] as const,
  /** 공 반지름(m) — 자기보다 세 배 */
  ball: 0.42,
  /** X 를 팔 수 있는 거리 */
  digR: 1.8,
  /** 나오는 시간: 아침~낮(05~17시) */
  hours: [5, 17] as const,
} as const;

/** 쇠똥구리 보물이 나오는 섬·구역 */
export const DUNG_SITES: Readonly<Record<string, { zone: string; gdd: string }>> = {
  dino: { zone: 'ranch', gdd: 'b_dung_beetle' },
  desert: { zone: 'ruin', gdd: 'b_scarab' },
};

export const dungHour = (hour: number) => hour >= DUNG.hours[0] && hour < DUNG.hours[1];

/** 오늘 이 섬 보물은 이미 팠나 */
export const dungDoneToday = (f: InsectFlags, island: string, day: number) => (f.dung?.[island] ?? -1) === day;
export function markDung(f: InsectFlags, island: string, day: number) {
  if (!f.dung || typeof f.dung !== 'object') f.dung = {};
  f.dung[island] = day;
}

export interface DungPath { sx: number; sz: number; ex: number; ez: number; /** 굽은 길 옆으로 휘는 정도(m) */ bend: number; len: number }

/**
 * 출발점·보물 X 정하기 — ok(x,z,start) 가 그 자리 땅이 괜찮은지 본다(start = 출발점이면 구역까지). tries 번 안에 못 찾으면 null.
 * center 둘레(반경 r) 에서 출발점을, 출발점에서 trip 거리에 X 를.
 */
export function planDung(
  center: { x: number; z: number }, r: number, rnd: () => number, ok: (x: number, z: number, start: boolean) => boolean, tries = 60,
): DungPath | null {
  for (let i = 0; i < tries; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
    const sx = center.x + Math.cos(a) * d, sz = center.z + Math.sin(a) * d;
    if (!ok(sx, sz, true)) continue;
    for (let j = 0; j < 6; j++) {
      const b = rnd() * Math.PI * 2;
      const len = DUNG.trip[0] + rnd() * (DUNG.trip[1] - DUNG.trip[0]);
      const ex = sx + Math.cos(b) * len, ez = sz + Math.sin(b) * len;
      if (!ok(ex, ez, false)) continue;
      // 가운데·3/4 지점도 괜찮아야(물·절벽을 건너지 않게)
      const bend = (rnd() - 0.5) * len * 0.35;
      let fine = true;
      for (const k of [0.25, 0.5, 0.75]) {
        const p = dungPoint({ sx, sz, ex, ez, bend, len }, k);
        if (!ok(p.x, p.z, false)) { fine = false; break; }
      }
      if (fine) return { sx, sz, ex, ez, bend, len };
    }
  }
  return null;
}

/** 쇠똥구리 자리 고르기에 필요한 세상 정보(게임에선 ctx.island·g.geo, 테스트에선 진짜 지형 함수) */
export interface DungWorld {
  islandById(id: string): { x: number; z: number; r: number } | undefined | null;
  islandAt(x: number, z: number): { id: string } | null | undefined;
  zoneAt(x: number, z: number): { island: string | null; zone: string } | null;
  /** 마른 땅·완만한 비탈인가 */
  dryOk(x: number, z: number): boolean;
  landmarks: ReadonlyArray<{ id: string; kind: string; island: string; x: number; z: number; r: number }>;
}

/** 섬 안 그 구역 칸 훑기 — 한 번에 다 하면 수백 ms 라 프레임마다 조금씩(stepZoneScan) */
export interface ZoneScan { isl: string; zone: string; near: { x: number; z: number }; i: number; n: number; nx: number; x0: number; z0: number; step: number; cells: Array<{ x: number; z: number }>; done: boolean }
export function newZoneScan(w: DungWorld, isl: string, zone: string, near: { x: number; z: number }, step = 20): ZoneScan {
  const d = w.islandById(isl);
  const r = d?.r ?? 0;
  const nx = d ? Math.floor((2 * r) / step) + 1 : 0;
  return { isl, zone, near, i: 0, n: nx * nx, nx, x0: (d?.x ?? 0) - r, z0: (d?.z ?? 0) - r, step, cells: [], done: !d };
}
/** budget 칸만큼 더 훑는다 — 끝나면 anchor 에서 가까운 순으로 줄 세우고 done */
export function stepZoneScan(sc: ZoneScan, w: DungWorld, budget: number): boolean {
  if (sc.done) return true;
  const d = w.islandById(sc.isl);
  const end = Math.min(sc.n, sc.i + budget);
  for (; sc.i < end; sc.i++) {
    const x = sc.x0 + (sc.i % sc.nx) * sc.step, z = sc.z0 + Math.floor(sc.i / sc.nx) * sc.step;
    if (d && Math.hypot(x - d.x, z - d.z) > d.r) continue;
    const zi = w.zoneAt(x, z);
    if (!zi || zi.island !== sc.isl || zi.zone !== sc.zone) continue;
    if (!w.dryOk(x, z)) continue;
    sc.cells.push({ x, z });
  }
  if (sc.i >= sc.n) {
    const nr = sc.near;
    sc.cells.sort((a, b) => Math.hypot(a.x - nr.x, a.z - nr.z) - Math.hypot(b.x - nr.x, b.z - nr.z));
    sc.done = true;
  }
  return sc.done;
}
/** 한 번에 다 훑기(테스트·도구용) */
export function zoneCellsOf(w: DungWorld, isl: string, zone: string, near: { x: number; z: number }): Array<{ x: number; z: number }> {
  const sc = newZoneScan(w, isl, zone, near);
  stepZoneScan(sc, w, sc.n);
  return sc.cells;
}

/**
 * 그 섬 오늘의 쇠똥구리 길 — 랜드마크(티노 언덕·피라미드 유적) 둘레에서 먼저 찾고,
 * 둘레에 그 구역이 없으면(사막: 피라미드 ↔ 'ruin' 구역이 수백 m 떨어짐) 섬을 훑은 가장 가까운 구역 칸에서 출발.
 * cells 는 zoneCellsOf 결과(캐시) — 안 주면 여기서 훑는다. cells() 가 null 이면 아직 훑는 중 → 'pending'.
 */
export function planDungSite(
  w: DungWorld, isl: string, rnd: () => number, cells?: () => Array<{ x: number; z: number }> | null,
): DungPath | null | 'pending' {
  const siteDef = DUNG_SITES[isl];
  const d = w.islandById(isl);
  if (!siteDef || !d) return null;
  const lms = w.landmarks.filter((l) => l.island === isl);
  const anchor = isl === 'dino'
    ? lms.find((l) => l.kind === 'tinohill' || l.id.endsWith(':tinohill'))
    : lms.find((l) => /ruin|pyramid/.test(l.kind) || /ruin|pyramid/.test(l.id));
  const center = anchor ? { x: anchor.x, z: anchor.z } : { x: d.x, z: d.z };
  const r = anchor ? Math.max(60, anchor.r * 3) : d.r * 0.8;
  const ok = (x: number, z: number, start: boolean) => {
    if (!w.dryOk(x, z)) return false;
    if (w.islandAt(x, z)?.id !== isl) return false;
    if (start) {
      const zi = w.zoneAt(x, z);
      if (zi && zi.zone !== siteDef.zone) return false;
    }
    return true;
  };
  const first = planDung(center, r, rnd, ok, 240);
  if (first) return first;
  const cs = cells ? cells() : zoneCellsOf(w, isl, siteDef.zone, center);
  if (!cs) return 'pending';
  if (!cs.length) return null;
  // 가까운 칸 몇 개 중 하나(날마다 조금씩 다른 자리)
  for (let k = 0; k < 4; k++) {
    const c = cs[Math.min(cs.length - 1, Math.floor(rnd() * Math.min(cs.length, 12)))];
    const p = planDung(c, 24, rnd, ok, 120);
    if (p) return p;
  }
  return null;
}

/** 길 위 한 점(k 0..1) — 옆으로 살짝 휘는 곡선 */
export function dungPoint(p: DungPath, k: number): { x: number; z: number } {
  const t = clamp01(k);
  const dx = p.ex - p.sx, dz = p.ez - p.sz;
  const L = Math.hypot(dx, dz) || 1;
  const nx = -dz / L, nz = dx / L;
  const side = Math.sin(t * Math.PI) * p.bend;
  return { x: p.sx + dx * t + nx * side, z: p.sz + dz * t + nz * side };
}

export interface DungState { k: number; phase: 'wait' | 'roll' | 'pause' | 'arrived' }

/**
 * 한 걸음: 처음엔 제자리(wait) → 플레이어가 wake 안에 오면 굴리기 → 너무 뒤처지면(pause) 기다린다 → 끝에 닿으면 arrived.
 * playerDist = 플레이어와 공 사이 거리.
 */
export function dungStep(s: DungState, path: DungPath, playerDist: number, dt: number): DungState {
  if (s.phase === 'arrived') return s;
  if (s.phase === 'wait') return playerDist < DUNG.wake ? { ...s, phase: 'roll' } : s;
  if (playerDist > DUNG.wait) return { ...s, phase: 'pause' };
  const k = Math.min(1, s.k + (DUNG.speed * Math.max(0, dt)) / Math.max(1, path.len));
  return { k, phase: k >= 1 ? 'arrived' : 'roll' };
}

// ═════════════════════ ⑤ 난초사마귀 위장 ═════════════════════
export const ORCHID = {
  /** 이 안에 오면 꽃인 척을 그만두고 도망(GDD: 1.5 m) */
  reveal: 1.5,
} as const;

export const isOrchid = (sp: { id: string; gdd?: string; tags?: string[] } | null | undefined) =>
  !!sp && (sp.gdd === 'b_orchid_mantis' || sp.id === 'bug-orchid-mantis' || (!!sp.tags?.includes('camo') && sp.id.includes('orchid')));

/** 지금 거리에서 꽃인 척이 들통나나(움직임과 상관없이 1.5 m) */
export const orchidReveals = (dist: number) => Number.isFinite(dist) && dist < ORCHID.reveal;

/** 위장 중엔 이 이름표로(잠자리채 안내) — 들키기 전엔 그냥 '수상한 꽃' */
export const orchidPrompt = (known: boolean) => (known ? '수상한 꽃에 잠자리채 휘두르기 (난초사마귀?)' : '수상한 꽃에 잠자리채 휘두르기');
