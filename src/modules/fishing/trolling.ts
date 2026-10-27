// 트롤링(배 뒤 낚시, GDD 3.5 P1) — 순수 규칙. fishing/p1.ts 가 줄·루어·물살 그림을 붙인다.
//   먼바다(offshore)·심해(deep·trench) 위에서 배가 달리는 동안(속도 ≥ TROLL_MIN_SPEED) 배 뒤로 루어를 끈다.
//   달린 시간이 쌓이면 꾹! → 창 안에 E 로 걸기 → ★4 이상은 릴 줄다리기, 아니면 바로 잡는다.
//   배가 오래 느려지면(SLOW_GRACE) 루어가 가라앉아 줄을 감는다. 트롤링 중 E = 줄 감기.
import type { VehicleNow } from '../../core/api';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const TROLL_MIN_SPEED = 3;
/** 꾹까지 달려야 하는 시간(초) — 빠를수록 조금 줄어든다 */
export const TROLL_WAIT: readonly [number, number] = [5, 11];
/** 꾹 뒤 E 창(초) — 배 위라 땅보다 넉넉하게 */
export const STRIKE_WINDOW = 0.9;
/** 이만큼(초) 느리면 줄을 감는다 */
export const SLOW_GRACE = 2.5;
/** 배 뒤로 루어까지(m) */
export const LURE_BACK = 14;
/** 트롤링이 되는 바다 구역(geo.zoneAt().sea) */
export const TROLL_SEAS: readonly string[] = ['offshore', 'deep', 'trench'];

/** 이 배·바다에서 트롤링을 시작할 수 있나 */
export function canTroll(v: Pick<VehicleNow, 'boat' | 'speed'> | null | undefined, sea: string | null | undefined): boolean {
  return !!v && !!v.boat && Math.abs(Number(v.speed) || 0) >= TROLL_MIN_SPEED && !!sea && TROLL_SEAS.includes(sea);
}
/** 바다 구역 → 낚시 구역 */
export const trollZone = (sea: string | null | undefined) => (sea === 'deep' || sea === 'trench' ? 'deep' : 'offshore');

export type TrollPhase = 'lure' | 'strike' | 'done';
export interface Troll {
  phase: TrollPhase;
  /** 달린 시간 · 꾹까지 필요한 시간 */
  moved: number;
  wait: number;
  /** 느린 시간 */
  slow: number;
  /** 지금 단계 시간 */
  t: number;
  window: number;
}
export type TrollEvent = { type: 'strike' } | { type: 'hook' } | { type: 'miss' } | { type: 'reel' } | { type: 'slow' };

export function newTroll(u: number, bonusWindow = 0): Troll {
  return { phase: 'lure', moved: 0, wait: TROLL_WAIT[0] + (TROLL_WAIT[1] - TROLL_WAIT[0]) * clamp(u, 0, 1), slow: 0, t: 0, window: STRIKE_WINDOW + bonusWindow };
}

/** 한 프레임. press = E, cancel = Esc */
export function stepTroll(s: Troll, dt: number, inp: { speed: number; press: boolean; cancel: boolean }): TrollEvent[] {
  const ev: TrollEvent[] = [];
  if (s.phase === 'done') return ev;
  dt = Math.max(0, dt);
  s.t += dt;
  const sp = Math.abs(Number(inp.speed) || 0);
  if (s.phase === 'lure') {
    if (inp.press || inp.cancel) { s.phase = 'done'; ev.push({ type: 'reel' }); return ev; }
    if (sp >= TROLL_MIN_SPEED) {
      s.slow = 0;
      // 빠를수록(최대 ×1.6) 시간이 빨리 쌓인다
      s.moved += dt * clamp(sp / 8, 0.6, 1.6);
      if (s.moved >= s.wait) { s.phase = 'strike'; s.t = 0; ev.push({ type: 'strike' }); }
    } else {
      s.slow += dt;
      if (s.slow >= SLOW_GRACE) { s.phase = 'done'; ev.push({ type: 'slow' }); }
    }
    return ev;
  }
  // strike
  if (inp.press) { s.phase = 'done'; ev.push({ type: 'hook' }); return ev; }
  if (inp.cancel || s.t > s.window) { s.phase = 'done'; ev.push({ type: 'miss' }); }
  return ev;
}
