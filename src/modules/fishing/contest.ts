// 돛등이(스피노)와 낚시 대결(GDD 3.7 P1 — 이기면 황금 미끼 5) — 순수 규칙. fishing/p1.ts 가 돛등이 모델·HUD 를 붙인다.
//   3분 동안 쿵쿵공룡섬에서 낚은 점수를 겨룬다. 점수 = ★ 기본점 × 크기 비율(0.5~2), 쓰레기도 1점.
//   돛등이는 대결 시작 때 rng 로 정한 일정대로 낚는다(늪 낚시 고수 — ★2·3 이 잦다). 이기면 그날 처음 한 번 황금 미끼 ×5.
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const CONTEST_SEC = 180;
export const GOLDEN_PRIZE = 5;
export const PRIZE_ITEM = 'bait_golden';
/** ★ → 기본점(0 = 쓰레기) */
export const POINTS: Readonly<Record<number, number>> = Object.freeze({ 0: 1, 1: 10, 2: 25, 3: 50, 4: 100, 5: 200 });
/** 돛등이 ★ 가중치(낚시 고수) */
export const SPINO_W: Readonly<Record<number, number>> = Object.freeze({ 1: 30, 2: 35, 3: 25, 4: 9, 5: 1 });
/** 돛등이 첫 낚시 · 낚시 간격(초) */
export const SPINO_FIRST: readonly [number, number] = [12, 20];
export const SPINO_GAP: readonly [number, number] = [16, 26];

/** 한 마리 점수 */
export function contestPoints(rarity: number, size?: number, len?: number): number {
  const r = clamp(Math.round(Number.isFinite(rarity) ? rarity : 0), 0, 5);
  if (r === 0) return POINTS[0];
  const ratio = size && len && size > 0 && len > 0 ? clamp(size / len, 0.5, 2) : 1;
  return Math.max(1, Math.round(POINTS[r] * ratio));
}

export interface SpinoCatch { at: number; rarity: number; points: number; name: string }
/** 돛등이 일정: dur 초 안에 낚는 시각·★·점수. names[★] 에서 이름을 고른다 */
export function spinoSchedule(rng: () => number, dur = CONTEST_SEC, names?: Partial<Record<number, string[]>>): SpinoCatch[] {
  const out: SpinoCatch[] = [];
  // 이름표가 있으면 실제 종이 있는 희귀도만 굴린다(가중치를 다시 맞춘다) — '★5 물고기' 같은 빈 이름이 안 나오게
  const named = names ? Object.entries(SPINO_W).filter(([k]) => (names[Number(k)]?.length ?? 0) > 0) : [];
  const W = named.length ? named : Object.entries(SPINO_W);
  const total = W.reduce((a, [, b]) => a + b, 0);
  let at = SPINO_FIRST[0] + (SPINO_FIRST[1] - SPINO_FIRST[0]) * rng();
  while (at < dur - 2) {
    let x = rng() * total, rarity = Number(W[W.length - 1][0]);
    for (const [k, w] of W) { x -= w; if (x < 0) { rarity = Number(k); break; } }
    const ratio = 0.8 + rng() * 0.5;
    const pool = names?.[rarity];
    const name = pool && pool.length ? pool[Math.floor(rng() * pool.length) % pool.length] : `★${rarity} 물고기`;
    out.push({ at: Math.round(at * 100) / 100, rarity, points: Math.round(POINTS[rarity] * ratio), name });
    at += SPINO_GAP[0] + (SPINO_GAP[1] - SPINO_GAP[0]) * rng();
  }
  return out;
}

export interface Contest {
  t0: number;
  dur: number;
  me: number;
  spino: number;
  /** 내가 낚은 수 · 돛등이가 낚은 수 */
  mine: number;
  his: number;
  schedule: SpinoCatch[];
  /** 다음에 볼 일정 칸 */
  next: number;
  over: boolean;
}
export function newContest(t0: number, schedule: SpinoCatch[], dur = CONTEST_SEC): Contest {
  return { t0, dur, me: 0, spino: 0, mine: 0, his: 0, schedule, next: 0, over: false };
}
export const remaining = (c: Contest, t: number) => Math.max(0, c.dur - (t - c.t0));

/** 시간이 흐른다 → 돛등이가 이번에 낚은 것들 + 끝났나 */
export function contestTick(c: Contest, t: number): { spino: SpinoCatch[]; ended: boolean } {
  const got: SpinoCatch[] = [];
  if (c.over) return { spino: got, ended: false };
  const el = t - c.t0;
  while (c.next < c.schedule.length && c.schedule[c.next].at <= el) {
    const s = c.schedule[c.next++];
    c.spino += s.points; c.his++;
    got.push(s);
  }
  if (el >= c.dur) { c.over = true; return { spino: got, ended: true }; }
  return { spino: got, ended: false };
}
/** 내가 낚았다(대결 중일 때만 점수) — 더한 점수 */
export function addCatch(c: Contest, rarity: number, size?: number, len?: number): number {
  if (c.over) return 0;
  const p = contestPoints(rarity, size, len);
  c.me += p; c.mine++;
  return p;
}
export type ContestResult = 'win' | 'lose' | 'tie';
export const contestResult = (c: Pick<Contest, 'me' | 'spino'>): ContestResult => (c.me > c.spino ? 'win' : c.me < c.spino ? 'lose' : 'tie');
/** 상: 이기면 그날 처음 한 번만 황금 미끼 ×5 */
export const prizeFor = (res: ContestResult, lastWinDay: number | undefined, day: number) => (res === 'win' && lastWinDay !== day ? GOLDEN_PRIZE : 0);
/** 남은 시간 'm:ss' */
export const clock = (sec: number) => { const s = Math.ceil(Math.max(0, sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
