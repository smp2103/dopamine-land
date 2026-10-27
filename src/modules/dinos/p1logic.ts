// 공룡 P1 규칙(순수) — 알 부화(게임 3일)·성장 3단계·목장 칸·나팔이 리듬 놀이 채점·화요일 대이동 일정·티노 물고기 30번·화석 복원기.
// three·DOM 없음 → tests/dinos-p1.test.ts 가 바로 부른다. 저장은 flags.dino 안(logic.ensureFlags 가 ensureP1 로 모양을 맞춘다).
import { DINOS, FOSSIL_PIECES, type DinoSpec } from './data';

// ───────────── 시간 ─────────────
/** 게임 날(실수): 날 + 시각/24 — env.gameSec 기준이 아니라 화면 시계(날·시)와 똑같이 센다 */
export const nowDays = (day: number, hour: number) => day + (((hour % 24) + 24) % 24) / 24;

/** 남은 날(실수) → "2일 5시간" · "3시간" · "곧!" */
export function leftText(days: number): string {
  if (days <= 0) return '지금!';
  const h = Math.ceil(days * 24);
  if (h <= 1) return '곧!';
  const d = Math.floor(h / 24), r = h % 24;
  if (!d) return `${r}시간`;
  return r ? `${d}일 ${r}시간` : `${d}일`;
}

// ───────────── 알 부화 ─────────────
/** 인큐베이터·부화장에 넣고 게임 3일 */
export const HATCH_DAYS = 3;
/** 화석 연구소 부화장 칸 수 */
export const HATCHERY_SLOTS = 3;
/** 가방의 알(종은 넣을 때 정해지고, 깨어날 때까지 비밀) */
export const EGG_ITEM = 'it_dino_egg';

export type EggWhere = 'incubator' | 'hatchery';
export interface EggRec {
  uid: string;
  /** 깨어날 종(넣을 때 굴림) */
  sp: string;
  where: EggWhere;
  /** 인큐베이터 가구 uid 또는 부화장 칸 번호('0'~'2') */
  slot: string;
  /** 넣은 때(nowDays) */
  start: number;
  /** '곧 깨어나요' 알림을 띄웠나 */
  told?: boolean;
}

/** 부화까지 남은 날 */
export const eggLeft = (e: Pick<EggRec, 'start'>, now: number) => Math.max(0, HATCH_DAYS - (now - e.start));
export const eggReady = (e: Pick<EggRec, 'start'>, now: number) => eggLeft(e, now) <= 1e-9;
/** 0..1 */
export const eggProgress = (e: Pick<EggRec, 'start'>, now: number) => Math.max(0, Math.min(1, (now - e.start) / HATCH_DAYS));

/** 알에서 나오는 종: 공룡섬 땅 공룡(하늘·바다·티노 빼고) */
export const EGG_POOL: readonly DinoSpec[] = DINOS.filter((d) => d.home === 'dino' && d.form !== 'WING' && d.form !== 'SWIM' && d.id !== 'z_tino');
/** 알 희귀도 가중치(★1 흔함 … ★4 드묾) */
export const EGG_W: Readonly<Record<number, number>> = { 1: 40, 2: 32, 3: 20, 4: 8, 5: 2 };
/** 알 종 굴림(결정적: rnd 는 `dinos:egg:<uid>`) */
export function rollEggSpecies(rnd: () => number, pool: readonly DinoSpec[] = EGG_POOL): string {
  const tot = pool.reduce((s, d) => s + (EGG_W[d.rarity] ?? 1), 0);
  let r = rnd() * tot;
  for (const d of pool) { r -= EGG_W[d.rarity] ?? 1; if (r <= 0) return d.id; }
  return pool[pool.length - 1].id;
}

// ───────────── 성장 3단계 ─────────────
/** 단계가 바뀌는 나이(게임 날): 아기 0 → 꼬마 1.5 → 어른 3 */
export const GROW_AT: readonly number[] = [0, 1.5, 3];
export const STAGE_NAME: readonly string[] = ['아기', '꼬마', '어른'];
/** 단계별 몸 크기(어른 = 1) */
export const STAGE_SCALE: readonly number[] = [0.5, 0.74, 1];
/** 하루 한 번 밥을 주면 그만큼 더 자란다(날) */
export const FEED_BOOST = 0.25;

export interface RanchRec {
  uid: string;
  sp: string;
  /** 태어난 때(nowDays) */
  born: number;
  /** 밥으로 더 자란 날 */
  boost: number;
  /** 마지막으로 알린 단계(단계가 오르면 축하 카드) */
  stage: number;
  /** 밥 준 날 */
  fedDay: number;
}
export const ageOf = (r: Pick<RanchRec, 'born' | 'boost'>, now: number) => Math.max(0, now - r.born + (r.boost ?? 0));
export function stageOf(age: number): number {
  let s = 0;
  for (let i = 0; i < GROW_AT.length; i++) if (age >= GROW_AT[i]) s = i;
  return s;
}
/** 다음 단계까지 남은 날(어른이면 0) */
export const growLeft = (age: number) => { const s = stageOf(age); return s >= GROW_AT.length - 1 ? 0 : GROW_AT[s + 1] - age; };
export const ADULT = GROW_AT.length - 1;
/** 어른이 되면 탈 수 있다 */
export const canRideStage = (stage: number) => stage >= ADULT;
/** 밥 주기(하루 한 번 성장 보너스) — 줬으면 true */
export function feedRanch(r: RanchRec, day: number): boolean {
  if (r.fedDay === day) return false;
  r.fedDay = day;
  r.boost = Math.round(((r.boost ?? 0) + FEED_BOOST) * 1000) / 1000;
  return true;
}

/** 탈것 공룡 말고도 다 자란 목장 공룡은 탈 수 있다 — 크기·발 빠르기로 정한 탑승 값 */
export function rideOf(spec: Pick<DinoSpec, 'speed' | 'scale' | 'reward'>): { walk: number; run: number; cam: number; mode: 'land' } {
  if (spec.reward.kind === 'mount' && spec.reward.ride.mode === 'land') return { walk: spec.reward.ride.walk, run: spec.reward.ride.run, cam: spec.reward.ride.cam, mode: 'land' };
  const walk = Math.round((4.5 + Math.min(2.5, spec.speed)) * 10) / 10;
  const run = Math.round((walk * 1.7 + Math.min(2, spec.speed * 0.6)) * 10) / 10;
  return { walk, run, cam: Math.round((1.0 + Math.min(1.2, spec.scale * 0.14)) * 100) / 100, mode: 'land' };
}

// ───────────── 목장 ─────────────
/** 목장 칸: 기본 4, 고대 세트 특전 'ranch' 면 +4 */
export const RANCH_BASE = 4;
export const RANCH_PERK = 4;
export const ranchCap = (perk: boolean) => RANCH_BASE + (perk ? RANCH_PERK : 0);
export const ranchFull = (n: number, perk: boolean) => n >= ranchCap(perk);

// ───────────── 티노 ─────────────
/** 물고기 선물 30번 → 친구 + 전설 탈것 */
export const TINO_LEGEND = 30;
export const tinoLegend = (fish: number) => fish >= TINO_LEGEND;
export const tinoLeft = (fish: number) => Math.max(0, TINO_LEGEND - Math.floor(fish));
/** 티노 탑승(전설): 걷기 7 · 달리기 14 m/s */
export const TINO_RIDE = { walk: 7, run: 14, cam: 1.75, mode: 'land' as const };

// ───────────── 화요일 대이동 ─────────────
/** 0 월 … 6 일 → 1 = 화요일(weekday-event 'migration') */
export const MIG_WEEKDAY = 1;
/** 무리가 계곡을 건너는 시각(게임 시) */
export const MIG_FROM = 7;
export const MIG_TO = 19;
/** 한 번 건너는 데 걸리는 게임 시간(시) — 끝에 닿으면 돌아서서 다시 건넌다 */
export const MIG_LAP_H = 2;
/** 무리 줄 간격(m) */
export const MIG_GAP = 6.5;

/**
 * 대이동 중인가. calendar 가 weekday-event 를 보냈으면 그 값(override)이 이긴다.
 * 시각 창(7~19시) 밖에서는 override 가 켜져 있어도 무리는 쉬러 간다.
 */
export function migrationActive(weekday: number, hour: number, override: boolean | null = null): boolean {
  const h = ((hour % 24) + 24) % 24;
  const window = h >= MIG_FROM && h < MIG_TO;
  if (override !== null) return override && window;
  return (((weekday % 7) + 7) % 7) === MIG_WEEKDAY && window;
}
/** 0..1..0 왕복 */
export const pingpong = (u: number) => { const k = ((u % 2) + 2) % 2; return k <= 1 ? k : 2 - k; };
/**
 * i 번째(0 = 대장) 공룡의 길 위 위치 s(0..1)와 가는 쪽(+1 A→B, -1 B→A).
 * 줄 선 뒤 공룡은 대장보다 gapM 만큼 늦게 같은 왕복을 따라간다(끝에서 차례로 돌아선다).
 */
export function migrationAt(hour: number, i: number, pathLen: number, gapM = MIG_GAP): { s: number; dir: 1 | -1 } {
  const u = (hour - MIG_FROM) / MIG_LAP_H - (i * gapM) / Math.max(1, pathLen);
  const s = pingpong(u);
  const k = ((u % 2) + 2) % 2;
  return { s, dir: k < 1 ? 1 : -1 };
}
/** 무리 구성(날마다 조금 다르게, 결정적) — 큰 목길이가 앞장선다 */
export const MIG_POOL: readonly string[] = ['dino-trike', 'z_iguanodon', 'dino-galli', 'dino-proto', 'dino-stego', 'dino-parasaur', 'z_apatosaurus', 'dino-ankylo'];
export function migrationHerd(rnd: () => number, n = 9): string[] {
  const out = [rnd() < 0.5 ? 'dino-brachio' : 'z_apatosaurus'];
  while (out.length < n) out.push(MIG_POOL[Math.floor(rnd() * MIG_POOL.length) % MIG_POOL.length]);
  return out;
}
/** 목격 보너스는 하루 한 번 */
export const witnessReady = (migDay: number, day: number) => migDay !== day;
export const WITNESS_R = 32;
export const MIG_BONUS = { stars: 3, coins: 500 };

// ───────────── 나팔이 리듬 놀이(음악 상자 음표) ─────────────
export const LANES = 3;
/** 줄 → 음 높이(도·미·솔, 음악 상자) */
export const LANE_PITCH: readonly number[] = [1, 1.26, 1.5];
export const LANE_KEYS: readonly (readonly string[])[] = [['KeyA', 'ArrowLeft'], ['KeyS', 'ArrowDown'], ['KeyD', 'ArrowRight']];
/** 판정 창(초) */
export const PERFECT_W = 0.09;
export const GOOD_W = 0.18;
/** 첫 음표까지 기다리는 시간 */
export const LEAD_IN = 2.2;

export interface Note { t: number; lane: number; hit?: Judge }
export type Judge = 'perfect' | 'good' | 'miss';

/**
 * 악보: bpm 박자 위에 마디(4박)마다 음표 2~4개. 같은 박에 겹치지 않고, 같은 줄을 세 번 연속 내지 않는다.
 * rnd 는 `dinos:rhythm:<날>` — 날마다 새 노래, 같은 날은 같은 노래.
 */
export function makeChart(rnd: () => number, bars = 8, bpm = 96): Note[] {
  const beat = 60 / bpm;
  const out: Note[] = [];
  let last = -1, same = 0;
  for (let b = 0; b < bars; b++) {
    const slots = [0, 1, 2, 3, 4, 5, 6, 7].filter((k) => k % 2 === 0 || rnd() < 0.25); // 8분음표 칸
    const want = 2 + Math.floor(rnd() * 3);
    const pick: number[] = [];
    for (const k of slots) if (k % 2 === 0 && pick.length < want) pick.push(k);
    for (const k of slots) if (k % 2 === 1 && pick.length < want + (b >= bars / 2 ? 1 : 0)) pick.push(k);
    pick.sort((a, c) => a - c);
    for (const k of pick) {
      let lane = Math.floor(rnd() * LANES) % LANES;
      if (lane === last && same >= 1) lane = (lane + 1 + Math.floor(rnd() * 2)) % LANES;
      same = lane === last ? same + 1 : 0;
      last = lane;
      out.push({ t: Math.round((LEAD_IN + (b * 4 + k / 2) * beat) * 1000) / 1000, lane });
    }
  }
  return out;
}
export const chartLength = (notes: readonly Note[]) => (notes.length ? notes[notes.length - 1].t + 1.2 : LEAD_IN);

/** 누른 때와 음표 때의 차이(초) → 판정 */
export function judge(delta: number): Judge {
  const d = Math.abs(delta);
  return d <= PERFECT_W ? 'perfect' : d <= GOOD_W ? 'good' : 'miss';
}

export interface RhythmScore { score: number; combo: number; maxCombo: number; perfect: number; good: number; miss: number }
export const newScore = (): RhythmScore => ({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 });
/** 점수: 완벽 100 · 좋아 50 · 콤보 10마다 +10 */
export function applyJudge(s: RhythmScore, j: Judge): number {
  if (j === 'miss') { s.miss++; s.combo = 0; return 0; }
  s.combo++;
  s.maxCombo = Math.max(s.maxCombo, s.combo);
  if (j === 'perfect') s.perfect++; else s.good++;
  const pts = (j === 'perfect' ? 100 : 50) + Math.floor(s.combo / 10) * 10;
  s.score += pts;
  return pts;
}

/**
 * 건반을 눌렀다: 그 줄에서 아직 안 친 가장 가까운 음표(좋아 창 안)를 친다. 없으면 null(헛누름 — 감점 없음).
 */
export function pressLane(notes: Note[], lane: number, time: number): { note: Note; judge: Judge } | null {
  let best: Note | null = null, bd = Infinity;
  for (const n of notes) {
    if (n.hit || n.lane !== lane) continue;
    const d = Math.abs(n.t - time);
    if (d <= GOOD_W && d < bd) { bd = d; best = n; }
  }
  if (!best) return null;
  best.hit = judge(best.t - time);
  return { note: best, judge: best.hit };
}
/** 지나가 버린 음표 → 놓침 처리(새로 놓친 것들) */
export function sweepMisses(notes: Note[], time: number): Note[] {
  const out: Note[] = [];
  for (const n of notes) if (!n.hit && time - n.t > GOOD_W) { n.hit = 'miss'; out.push(n); }
  return out;
}

export type Grade = 'S' | 'A' | 'B' | 'C';
/** 정확도 = (완벽 + 좋아×½) / 음표 수 */
export function gradeOf(s: RhythmScore, total: number): { grade: Grade; acc: number } {
  const acc = total > 0 ? (s.perfect + s.good * 0.5) / total : 0;
  return { grade: acc >= 0.92 ? 'S' : acc >= 0.75 ? 'A' : acc >= 0.5 ? 'B' : 'C', acc };
}
/** 보상: 코인·하트(나팔이)·반짝별 */
export const RHYTHM_REWARD: Readonly<Record<Grade, { coins: number; hearts: number; stars: number; line: string }>> = {
  S: { coins: 800, hearts: 1, stars: 2, line: '뿌우~~! 완벽한 합창! 나팔이가 감동했어요' },
  A: { coins: 500, hearts: 1, stars: 0, line: '뿌우~! 멋진 합창이었어요' },
  B: { coins: 250, hearts: 0.5, stars: 0, line: '뿌… 뿌우? 조금만 더 맞춰 볼까요' },
  C: { coins: 100, hearts: 0, stars: 0, line: '뿌부부… 나팔이가 웃음을 참고 있어요' },
};
/** 같은 날 보상은 3번까지(그다음은 연습) */
export const RHYTHM_PER_DAY = 3;

// ───────────── 알도둑 ─────────────
/** 훔친 뒤 도망치는 시간(초) — 이 안에 닿으면 잡는다 */
export const THIEF_SEC = 22;
/** 처음엔 빠르다가(7.6) 지쳐서 느려진다(5.2) — 플레이어 달리기 9.5 */
export const thiefSpeed = (elapsed: number) => 7.6 - 2.4 * Math.min(1, Math.max(0, elapsed) / 8);
/** 훔치러 다가오는 거리 · 다시 훔치기까지(초) */
export const STEAL_R = 6;
export const STEAL_COOLDOWN = 45;

// ───────────── 화석 복원기 ─────────────
/** 가방에 머리·몸·꼬리 세 조각이 다 있는 공룡(화석 키) */
export function restorable(bag: Readonly<Record<string, number>>): string[] {
  const by = new Map<string, number>();
  for (const f of FOSSIL_PIECES) if ((bag[f.id] ?? 0) > 0) by.set(f.dino, (by.get(f.dino) ?? 0) + 1);
  return [...by.entries()].filter(([, n]) => n >= 3).map(([d]) => d).sort();
}
/** 그 공룡 조각 중 가방에 없는 것 */
export function missingPieces(bag: Readonly<Record<string, number>>, dino: string): string[] {
  return FOSSIL_PIECES.filter((f) => f.dino === dino && !((bag[f.id] ?? 0) > 0)).map((f) => f.id);
}
/** 조각이 가장 많이 모인 공룡(안내용) */
export function bestPartial(bag: Readonly<Record<string, number>>): { dino: string; have: number } | null {
  let best: { dino: string; have: number } | null = null;
  for (const f of FOSSIL_PIECES) {
    if (!((bag[f.id] ?? 0) > 0)) continue;
    const have = FOSSIL_PIECES.filter((g) => g.dino === f.dino && (bag[g.id] ?? 0) > 0).length;
    if (!best || have > best.have || (have === best.have && f.dino < best.dino)) best = { dino: f.dino, have };
  }
  return best;
}

// ───────────── 저장 모양 ─────────────
export interface DinoP1Flags {
  eggs: EggRec[];
  /** 알 uid 일련번호 */
  eggN: number;
  ranch: RanchRec[];
  /** 대이동 목격 보너스 받은 날 */
  migDay: number;
  /** 알도둑을 잡아 알을 받은 날 */
  oviDay: number;
  /** 목 엘리베이터 높은 열매 받은 날 */
  fruitDay: number;
  /** 리듬 놀이: 최고 점수 · 오늘 보상 받은 횟수(날) */
  rhythmBest: number;
  rhythmDay: Record<string, number>;
  /** 꼬리 미끄럼틀 탄 횟수 */
  slides: number;
  /** 복원해서 진열한 골격(화석 키) */
  restored: string[];
  /** 티노가 전설의 친구가 됐나 */
  tinoLegend: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** P1 칸을 제자리에서 고친다(깨진 알·모르는 종은 버린다) */
export function ensureP1(f: Record<string, unknown>): void {
  const known = new Set(DINOS.map((d) => d.id));
  const eggs: EggRec[] = [];
  if (Array.isArray(f.eggs)) for (const e of f.eggs) {
    if (!isObj(e)) continue;
    const uid = str(e.uid), sp = str(e.sp), slot = str(e.slot);
    const where = e.where === 'incubator' || e.where === 'hatchery' ? e.where : null;
    if (!uid || !sp || !known.has(sp) || !slot || !where || typeof e.start !== 'number' || !Number.isFinite(e.start)) continue;
    eggs.push({ uid, sp, where, slot, start: e.start, ...(e.told ? { told: true } : {}) });
  }
  // 부화장 칸은 0..HATCHERY_SLOTS-1 하나에 하나 — 칸이 틀리거나 겹치면 빈 칸으로 옮기고, 빈 칸이 없으면 버린다
  const used = new Set<string>();
  const bad: EggRec[] = [];
  for (const e of eggs) {
    if (e.where !== 'hatchery') continue;
    const i = Number(e.slot);
    if (Number.isInteger(i) && i >= 0 && i < HATCHERY_SLOTS && String(i) === e.slot && !used.has(e.slot)) used.add(e.slot);
    else bad.push(e);
  }
  for (const e of bad) {
    let free = -1;
    for (let i = 0; i < HATCHERY_SLOTS && free < 0; i++) if (!used.has(String(i))) free = i;
    if (free < 0) { eggs.splice(eggs.indexOf(e), 1); continue; }
    e.slot = String(free); used.add(e.slot);
  }
  f.eggs = eggs;
  f.eggN = Math.max(num(f.eggN), eggs.length);
  const ranch: RanchRec[] = [];
  if (Array.isArray(f.ranch)) for (const r of f.ranch) {
    if (!isObj(r)) continue;
    const uid = str(r.uid), sp = str(r.sp);
    if (!uid || !sp || !known.has(sp) || typeof r.born !== 'number' || !Number.isFinite(r.born)) continue;
    ranch.push({ uid, sp, born: r.born, boost: Math.max(0, num(r.boost)), stage: Math.max(0, Math.min(ADULT, Math.floor(num(r.stage)))), fedDay: num(r.fedDay, -1) });
  }
  f.ranch = ranch;
  f.migDay = num(f.migDay, -1);
  f.oviDay = num(f.oviDay, -1);
  f.fruitDay = num(f.fruitDay, -1);
  f.rhythmBest = Math.max(0, num(f.rhythmBest));
  const rd: Record<string, number> = {};
  if (isObj(f.rhythmDay)) for (const [k, n] of Object.entries(f.rhythmDay)) if (typeof n === 'number' && Number.isFinite(n)) rd[k] = n;
  f.rhythmDay = rd;
  f.slides = Math.max(0, num(f.slides));
  f.restored = Array.isArray(f.restored) ? f.restored.filter((x): x is string => typeof x === 'string') : [];
  f.tinoLegend = !!f.tinoLegend;
}
