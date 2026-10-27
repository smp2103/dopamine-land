// 솜눈섬 얼음 구멍 미니게임(GDD 3.5 P1) — 순수 규칙. fishing/p1.ts 가 그림·입력을 붙인다.
//   ① 구멍 뚫기: 얼어붙은 구멍 위에서 E 연타(DRILL_PRESSES 번) — 가만히 있으면 조금씩 다시 언다. 뚫은 구멍은 그날(게임 하루) 열려 있다.
//   ② 줄 내리기 → 기다림 → 꾹!(입질 창 안 E) → ③ 타이밍 릴: 오가는 하트가 민트 칸에 있을 때 E.
//      ★ 가 높을수록 하트가 빠르고 칸이 좁고 맞혀야 하는 수가 많다. 두 번 빗나가면 도망.
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

// ───────────── ① 뚫기 ─────────────
export const DRILL_PRESSES = 8;
/** 안 누르면 다시 어는 속도(/초) */
export const DRILL_REFREEZE = 0.12;
/** 연타 한 번 → 새 진행도(0..1). 안 누른 프레임은 천천히 준다 */
export function drillStep(p: number, press: boolean, dt: number): number {
  if (press) return clamp(p + 1 / DRILL_PRESSES, 0, 1);
  return clamp(p - DRILL_REFREEZE * Math.max(0, dt), 0, 1);
}
export const drilled = (p: number) => p >= 1 - 1e-9;

/** 뚫은 구멍 기록(flags.fishing.ice) — 날이 바뀌면 다시 언다 */
export interface IceFlags { day: number; open: string[] }
export function holeOpen(f: IceFlags | undefined, day: number, id: string): boolean {
  return !!f && f.day === day && f.open.includes(id);
}
/** 구멍을 열었다고 적는다(날이 바뀌었으면 새로) — 돌려주는 값이 새 기록 */
export function openHole(f: IceFlags | undefined, day: number, id: string): IceFlags {
  const base: IceFlags = f && f.day === day ? { day, open: [...f.open] } : { day, open: [] };
  if (!base.open.includes(id)) base.open.push(id);
  return base;
}

// ───────────── ② 기다림 ─────────────
export const DROP_SEC = 0.8;
export const WAIT_RANGE: readonly [number, number] = [1.4, 3.6];
export const waitTime = (u: number) => round3(WAIT_RANGE[0] + (WAIT_RANGE[1] - WAIT_RANGE[0]) * clamp(u, 0, 1));

// ───────────── ③ 타이밍 릴 ─────────────
export interface Timing {
  rarity: number;
  /** 맞혀야 하는 수 · 맞힌 수 · 빗나간 수 */
  need: number;
  hits: number;
  misses: number;
  /** 민트 칸 가운데·폭(0..1 막대 위) */
  center: number;
  width: number;
  /** 하트가 막대를 왕복하는 빠르기(왕복/초) */
  speed: number;
  /** 하트 시계 기준 */
  t0: number;
  done: null | 'win' | 'fail';
}
/** 빗나가도 되는 수(이만큼 빗나가면 도망) */
export const MAX_MISSES = 2;

export const timingNeed = (rarity: number) => 2 + Math.floor(clamp(Math.round(rarity), 1, 5) / 2);
export const timingWidth = (rarity: number) => round3(0.34 - 0.04 * clamp(Math.round(rarity), 1, 5));
export const timingSpeed = (rarity: number) => round3(0.55 + 0.12 * clamp(Math.round(rarity), 1, 5));

/** 민트 칸 자리(막대 끝에 붙지 않게) */
function placeZone(width: number, u: number) { return round3(width / 2 + 0.04 + (1 - width - 0.08) * clamp(u, 0, 1)); }

export function newTiming(rarity: number, t: number, rng: () => number): Timing {
  const width = timingWidth(rarity);
  return { rarity, need: timingNeed(rarity), hits: 0, misses: 0, center: placeZone(width, rng()), width, speed: timingSpeed(rarity), t0: t, done: null };
}

/** 하트 자리 0..1(삼각파 왕복) */
export function markerPos(s: Pick<Timing, 't0' | 'speed'>, t: number): number {
  const ph = ((t - s.t0) * s.speed) % 1;
  const p = ph < 0 ? ph + 1 : ph;
  return round3(p < 0.5 ? p * 2 : 2 - p * 2);
}
export const inZone = (s: Pick<Timing, 'center' | 'width'>, pos: number) => Math.abs(pos - s.center) <= s.width / 2 + 1e-9;

/** E 를 눌렀다 → 'hit'(맞힘, 칸이 옮겨 간다) · 'miss' · 'win'(다 맞힘) · 'fail'(너무 많이 빗나감) */
export function timingPress(s: Timing, t: number, rng: () => number): 'hit' | 'miss' | 'win' | 'fail' {
  if (s.done) return s.done;
  if (inZone(s, markerPos(s, t))) {
    s.hits++;
    if (s.hits >= s.need) { s.done = 'win'; return 'win'; }
    // 다음 칸: 조금 좁아지고 다른 자리로
    s.width = round3(Math.max(0.1, s.width - 0.02));
    s.center = placeZone(s.width, rng());
    return 'hit';
  }
  s.misses++;
  if (s.misses >= MAX_MISSES) { s.done = 'fail'; return 'fail'; }
  return 'miss';
}
