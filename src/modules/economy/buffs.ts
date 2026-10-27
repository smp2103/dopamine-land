// 먹기·마시기 버프(GDD 4.6 요리·4.7 물약, 5.2 버프, wave 4 econ-p1) — 표와 시간 계산. 부수효과 없는 순수 모듈.
// 시간은 게임 시계 초(env.gameSec, 게임 1시간 = HOUR_SEC 75초)로 센다 → 게임 1분 = 1.25초.
// 켜진 버프 이름은 economy 가 rollCatch 에 저절로 넘긴다(rollMods): grilled·friend·starlight·bigsize 는 roll.ts 가 읽고,
// 반짝이 배율(lucky ×2 · shimmer ×1.5 · clover ×1.5)은 luckMult 로 곱해 준다.
import { HOUR_SEC } from '../../core/api';

/** 게임 1분 = 몇 초(게임 시계) */
export const GAME_MIN_SEC = HOUR_SEC / 60;

export interface BuffDef {
  name: string;
  label: string;
  icon: string;
  /** 효과 한 줄 */
  desc: string;
  /** 반짝이 배율(있으면 luckMult 에 곱한다) */
  luck?: number;
  /** 이동 속도 배율(코어가 econ.buffMult('speed') 로 읽는다) */
  speed?: number;
  color: string;
}

/** 버프 표 — 다른 모듈이 addBuff 로 거는 이름(friend·clover·power)도 여기에 이름표가 있다 */
export const BUFFS: Readonly<Record<string, BuffDef>> = Object.freeze({
  grilled: { name: 'grilled', label: '생선구이', icon: '🍢', desc: '★3 이상 ×1.2', color: '#ffc88a' },
  speed: { name: 'speed', label: '과일 파이', icon: '🥧', desc: '이동 속도 +20%', speed: 1.2, color: '#ffb3c6' },
  lucky: { name: 'lucky', label: '행운 쿠키', icon: '🥠', desc: '반짝이 ×2', luck: 2, color: '#ffe08a' },
  starlight: { name: 'starlight', label: '별빛 물약', icon: '🧪', desc: '★4 이상 ×1.3', color: '#d9c8ff' },
  shimmer: { name: 'shimmer', label: '반짝 물약', icon: '🫧', desc: '반짝이 ×1.5', luck: 1.5, color: '#ffe0f4' },
  bigsize: { name: 'bigsize', label: '쑥쑥 물약', icon: '🍼', desc: '큰 개체가 잘 잡혀요', color: '#c8f0d0' },
  power: { name: 'power', label: '과일 힘', icon: '💪', desc: '힘이 불끈!', color: '#ffd0bd' },
  friend: { name: 'friend', label: '친구 방문', icon: '🤝', desc: '★3 이상 ×1.1', color: '#a5dba8' },
  clover: { name: 'clover', label: '네잎클로버', icon: '🍀', desc: '반짝이 ×1.5', luck: 1.5, color: '#bfe6a5' },
});
export const buffDef = (name: string): BuffDef =>
  BUFFS[name] ?? { name, label: name, icon: '✨', desc: '', color: '#fff0a8' };

/** 먹고 마시는 것 → 버프(게임 분). 과일은 FRUIT_POWER */
export const FOODS: Readonly<Record<string, { buff: string; minutes: number; line: string; verb: '먹었다' | '마셨다' }>> = Object.freeze({
  it_grilled_fish: { buff: 'grilled', minutes: 30, line: '고소해! 큰 물고기가 잘 물 것 같아 🍢', verb: '먹었다' },
  it_fruit_pie: { buff: 'speed', minutes: 10, line: '달콤한 힘! 발이 가벼워졌어 🥧', verb: '먹었다' },
  it_lucky_cookie: { buff: 'lucky', minutes: 1440, line: '쪽지에 "오늘은 반짝반짝!" 🥠', verb: '먹었다' },
  it_potion_star: { buff: 'starlight', minutes: 20, line: '별빛이 몸에 스며들어요 ✨', verb: '마셨다' },
  it_potion_shimmer: { buff: 'shimmer', minutes: 30, line: '눈앞이 반짝반짝 🫧', verb: '마셨다' },
  it_potion_big: { buff: 'bigsize', minutes: 20, line: '쑥쑥! 큰 친구가 올 것 같아 🍼', verb: '마셨다' },
});
/** 과일을 먹으면 잠깐 '과일 힘'(garden 의 바위 부수기 힘 게이지는 'use' 이벤트를 읽는다) */
export const FRUIT_POWER = { buff: 'power', minutes: 5 } as const;

/** 버프 저장(이름 → 끝나는 게임 시계 초) */
export type BuffStore = Record<string, number>;

/** 지금(now) 부터 minutes 게임 분 뒤 */
export const untilOf = (now: number, minutes: number) => now + Math.max(0, minutes) * GAME_MIN_SEC;

/** 버프 걸기 — 이미 켜져 있으면 더 늦게 끝나는 쪽으로(겹쳐서 늘지는 않는다). 끝나는 때를 돌려준다 */
export function applyBuff(store: BuffStore, name: string, minutes: number, now: number): number {
  const until = untilOf(now, minutes);
  const cur = store[name];
  store[name] = typeof cur === 'number' && cur > until ? cur : until;
  return store[name];
}

/** 켜진 버프(끝나는 순) */
export function activeBuffs(store: BuffStore, now: number): Array<{ name: string; until: number }> {
  return Object.entries(store)
    .filter(([, u]) => typeof u === 'number' && u > now)
    .map(([name, until]) => ({ name, until }))
    .sort((a, b) => a.until - b.until || a.name.localeCompare(b.name));
}

/** 끝난 버프 지우기 — 지운 이름 */
export function pruneBuffs(store: BuffStore, now: number): string[] {
  const gone: string[] = [];
  for (const [k, u] of Object.entries(store)) if (!(typeof u === 'number' && u > now)) { delete store[k]; gone.push(k); }
  return gone;
}

/** 남은 게임 분(올림) */
export const minutesLeft = (until: number, now: number) => Math.max(0, Math.ceil((until - now) / GAME_MIN_SEC));
/** '12분' · '3시간 5분' · '하루' */
export function leftText(until: number, now: number): string {
  const m = minutesLeft(until, now);
  if (m >= 1440) return '하루';
  if (m >= 60) return `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`;
  return `${m}분`;
}

/** 굴림에 넘길 것 — 켜진 버프 이름 + 반짝이 배율(곱) */
export function rollMods(names: readonly string[]): { buffs: string[]; luckMult: number } {
  let luck = 1;
  for (const n of names) luck *= BUFFS[n]?.luck ?? 1;
  return { buffs: [...names], luckMult: luck };
}

/** 켜진 버프로 정해지는 배율(지금은 'speed' 만) */
export function buffMult(names: readonly string[], what: 'speed'): number {
  let m = 1;
  for (const n of names) m *= BUFFS[n]?.[what] ?? 1;
  return m;
}
