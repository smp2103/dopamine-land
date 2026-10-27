// ★4 이상 릴 줄다리기(GDD 3.5 P1) — 순수 모델. fishing/fight.ts 가 화면·입력·협동을 붙이고 tests/fishing-p1.test.ts 가 시험한다.
//   텐션 게이지 0..1: E 연타로 당기면 감기(progress)가 늘고 텐션이 오른다. 물고기는 좌우로 끌며(돌진) 텐션을 올린다.
//   빨간 칸(텐션 ≥ RED)에서 계속 당기면 툭 끊어진다(snap) → 빨간 칸에선 E 를 놓는다(텐션이 빨리 풀린다).
//   A·D 를 물고기 반대쪽으로 누르면 버티기(끄는 힘 줄고 돌진 중에도 덜 밀린다). 감기 1 = 잡았다, 0 이하·시간 초과 = 도망.
//   협동 릴: 친구가 같이 감고 있으면(coop) 연타 한 번의 감기가 두 배.
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 여기부터 빨간 칸 */
export const RED = 0.78;
/** 텐션이 여기 닿으면 줄이 끊어진다 */
export const SNAP = 1;
/** 시작 텐션·감기 */
export const START_TENSION = 0.25;
export const START_PROGRESS = 0.22;
/** 연타 한 번: 감기 · 텐션 */
export const MASH_GAIN = 0.035;
export const MASH_TENSION = 0.06;
/** 빨간 칸에서 또 당기면 덤으로 오르는 텐션(무리하게 당기기) */
export const RED_MASH_TENSION = 0.07;
/** 마지막 연타 뒤 이 시간(초)까지는 '당기는 중'(연타 사이 프레임도 줄이 팽팽하다) */
export const PULL_HOLD = 0.3;
/** 줄이 풀리는 속도(/초): 당기는 중 · 놓았을 때 */
export const RELAX_HOLD = 0.35;
export const RELAX_FREE = 0.9;
/** 물고기 기본 끄는 힘 · 돌진 덤(/초, 세기 k 를 곱한다) */
export const PULL_BASE = 0.1;
export const PULL_SURGE = 0.55;
/** 안 당길 때 물고기가 도로 끌고 가는 감기(/초) · 돌진 중 덤 */
export const SLIP = 0.03;
export const SURGE_SLIP = 0.06;
/** 돌진 간격 · 길이(초) */
export const SURGE_GAP: readonly [number, number] = [1.6, 3.2];
export const SURGE_LEN: readonly [number, number] = [0.7, 1.1];
/** 버티기(반대쪽 A·D) — 끄는 힘 배율 · 같은 쪽으로 누르면 */
export const COUNTER_MUL = 0.55;
export const WRONG_MUL = 1.25;
/** 이 시간(초)이 지나면 물고기가 지쳐서… 가 아니라 도망 */
export const FIGHT_MAX_SEC = 40;
/** 협동 릴: 친구의 감기 신호가 이 시간(초) 안에 있으면 협동 중 */
export const COOP_WINDOW = 1.5;
export const COOP_MULT = 2;

export type ReelEnd = 'win' | 'snap' | 'escape';
export interface ReelState {
  rarity: number;
  /** 물고기 세기(★4 = 1, ★5 = 1.35, 큰 개체일수록 조금 더) */
  k: number;
  tension: number;
  progress: number;
  t: number;
  /** 물고기가 끄는 쪽(-1 왼쪽 · 1 오른쪽) */
  dir: -1 | 1;
  /** 화면용 좌우 흔들림 -1..1(dir 쪽으로 천천히) */
  sway: number;
  /** 돌진 중이면 남은 시간 */
  surge: number;
  /** 다음 돌진까지 */
  nextSurge: number;
  /** 연타 수 · 그중 협동으로 두 배 된 수 */
  mashes: number;
  coopMashes: number;
  /** 빨간 칸에 머문 시간 */
  redTime: number;
  /** 마지막 연타 뒤 흐른 시간 */
  sinceMash: number;
  done: ReelEnd | null;
}
export interface ReelInput {
  /** 이번 프레임 E 를 눌렀다(연타 한 번) */
  mash: boolean;
  /** A·D (-1..1) */
  steer: number;
  /** 친구가 같이 감는 중 */
  coop?: boolean;
}
export type ReelEvent = { type: 'surge'; dir: -1 | 1 } | { type: 'red' } | { type: 'safe' } | { type: 'end'; end: ReelEnd };

/** 세기: ★ · 크기 비율(잡힌 크기 ÷ 평균 길이) */
export function fishStrength(rarity: number, sizeRatio = 1): number {
  const base = rarity >= 5 ? 1.35 : rarity >= 4 ? 1 : 0.75;
  return Math.round(base * clamp(Math.sqrt(Number.isFinite(sizeRatio) && sizeRatio > 0 ? sizeRatio : 1), 0.85, 1.3) * 1000) / 1000;
}

/** 연타 한 번의 감기(협동이면 두 배) — GDD 4.15 협동 릴 */
export const mashGain = (k: number, coop: boolean) => (MASH_GAIN / Math.max(0.5, k)) * (coop ? COOP_MULT : 1);
/** 친구 감기 신호가 아직 살아 있나 */
export const coopActive = (peer: boolean, lastPartnerAt: number, t: number) => peer && t - lastPartnerAt <= COOP_WINDOW && t >= lastPartnerAt - 0.001;

const between = (r: readonly [number, number], u: number) => r[0] + (r[1] - r[0]) * clamp(u, 0, 1);

export function newReel(rarity: number, sizeRatio: number, rng: () => number): ReelState {
  return {
    rarity, k: fishStrength(rarity, sizeRatio), tension: START_TENSION, progress: START_PROGRESS, t: 0,
    dir: rng() < 0.5 ? -1 : 1, sway: 0, surge: 0, nextSurge: between(SURGE_GAP, rng()) * 0.6,
    mashes: 0, coopMashes: 0, redTime: 0, sinceMash: 99, done: null,
  };
}

/** 빨간 칸인가 */
export const inRed = (s: Pick<ReelState, 'tension'>) => s.tension >= RED;

/** 한 프레임 진행 */
export function stepReel(s: ReelState, dt: number, inp: ReelInput, rng: () => number): ReelEvent[] {
  const ev: ReelEvent[] = [];
  if (s.done) return ev;
  dt = Math.max(0, Math.min(0.1, dt));
  s.t += dt;
  const wasRed = inRed(s);
  // 돌진 일정
  if (s.surge > 0) {
    s.surge -= dt;
    if (s.surge <= 0) { s.surge = 0; s.nextSurge = between(SURGE_GAP, rng()); }
  } else {
    s.nextSurge -= dt;
    if (s.nextSurge <= 0) {
      s.surge = between(SURGE_LEN, rng());
      // 대개 반대쪽으로 방향을 튼다
      s.dir = rng() < 0.75 ? (s.dir === 1 ? -1 : 1) : s.dir;
      ev.push({ type: 'surge', dir: s.dir });
    }
  }
  // 버티기: 물고기 반대쪽으로 A·D
  const steer = clamp(Number(inp.steer) || 0, -1, 1);
  const counter = steer !== 0 && Math.sign(steer) === -s.dir;
  const wrong = steer !== 0 && Math.sign(steer) === s.dir;
  const mul = counter ? COUNTER_MUL : wrong ? WRONG_MUL : 1;
  const surging = s.surge > 0;
  // 물고기가 끈다
  s.tension += s.k * (PULL_BASE + (surging ? PULL_SURGE : 0)) * mul * dt;
  // 줄이 풀린다(놓았을 때 빨리)
  s.sinceMash = inp.mash ? 0 : s.sinceMash + dt;
  const pulling = s.sinceMash < PULL_HOLD;
  s.tension -= (pulling ? RELAX_HOLD : RELAX_FREE) * dt;
  if (inp.mash) {
    const coop = !!inp.coop;
    s.mashes++;
    if (coop) s.coopMashes++;
    s.progress += mashGain(s.k, coop);
    s.tension += MASH_TENSION * Math.sqrt(s.k) + (wasRed ? RED_MASH_TENSION : 0);
  } else if (!pulling) {
    s.progress -= SLIP * s.k * dt;
  }
  if (surging) s.progress -= SURGE_SLIP * s.k * (counter ? 0.3 : 1) * dt;
  s.tension = clamp(s.tension, 0, 1.2);
  s.progress = Math.min(1, s.progress);
  s.sway += ((surging ? s.dir : s.dir * 0.35) - s.sway) * Math.min(1, dt * 2.5);
  const red = inRed(s);
  if (red) s.redTime += dt;
  if (red && !wasRed) ev.push({ type: 'red' });
  if (!red && wasRed) ev.push({ type: 'safe' });
  if (s.tension >= SNAP) s.done = 'snap';
  else if (s.progress >= 1) s.done = 'win';
  else if (s.progress <= 0 || s.t >= FIGHT_MAX_SEC) s.done = 'escape';
  if (s.done) ev.push({ type: 'end', end: s.done });
  return ev;
}

/** 화면용: 물고기까지 거리(감기 0 → start m, 1 → 1.2 m) */
export const fishDistance = (s: Pick<ReelState, 'progress'>, start: number) => 1.2 + (Math.max(1.6, start) - 1.2) * (1 - clamp(s.progress, 0, 1));
