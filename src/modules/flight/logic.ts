// 별길 비행(GDD 6.2 P1 · 6.4 · 4.14) 순수 로직 — 화면·WebGL·DOM 없이 테스트할 수 있는 것만:
//  ① 20초 별가루 비행 미니게임: 코스(고리·금고리·혜성) 만들기 · 고정 1/60 초 시뮬레이션 · 점수/별가루 계산 · 자동 조종(디버그·테스트)
//  ② 여행 목록: 다녀온·갈 수 있는 행성 + '다음' 행성 하나(별 값) + 내 소행성
//  ③ 엔딩: 도감 100% → 불꽃놀이 한 번 → ending 한 번(story 의 엔딩이 먼저 오면 그걸 같이 쓴다)
//  ④ 내 소행성: 5×4 = 20칸 가구 자리(interiors/placement 격자 도우미)
// 좌표: 비행 화면은 정규화 평면 — 가운데 (0, 0), 오른쪽 +x, 위 +y. 우주선은 x ±SHIP_X, y ±SHIP_Y 안에서 움직인다.
import { rngFor } from '../../core/rng';
import { canPlace, placeItem, removeItem, restoreLayout, normRot, nextRot, newUid, type Placed, type RoomGrid, type Footprint } from '../interiors/placement';

// ───────────── ① 비행 미니게임 ─────────────
/** 비행 길이(초) — GDD 6.2 '20초 별가루 모으기' */
export const FLIGHT_SEC = 20;
/** 출발 전 '3, 2, 1' (초, 비행 시간에 안 든다) */
export const INTRO_SEC = 2.4;
/** 고정 시뮬레이션 간격 — 프레임 속도와 상관없이 같은 입력이면 같은 결과 */
export const STEP = 1 / 60;
/** 우주선이 움직일 수 있는 범위 */
export const SHIP_X = 0.9, SHIP_Y = 0.78;
/** 가속 · 감쇠(최고 속도 = ACC / DAMP) */
export const SHIP_ACC = 6.2, SHIP_DAMP = 4.4;
/** 우주선 반경 · 고리 반경(안쪽) · 혜성 반경 */
export const SHIP_R = 0.085, RING_R = 0.27, GOLD_R = 0.22, COMET_R = 0.12;
/** 혜성에 부딪힌 뒤 비틀거리는 시간 · 그동안 무적 */
export const STUN_SEC = 0.8;
/** 점수: 고리 10 · 금고리 30 · 콤보마다 +2 */
export const PTS = { ring: 10, gold: 30, combo: 2 } as const;
/** 별가루: 고리 1 · 금고리 3 · 최고 콤보 5마다 +1 · 다 지나고 안 부딪히면 +3 · 상한 30 */
export const DUST = { ring: 1, gold: 3, comboEvery: 5, perfect: 3, max: 30 } as const;

export type ItemKind = 'ring' | 'gold' | 'comet';
export interface FlightItem {
  id: number;
  kind: ItemKind;
  /** 우주선 평면을 지나는 시각(비행 시작부터 초) */
  t: number;
  x: number;
  y: number;
  /** 판정 반경 */
  r: number;
  /** 그림용 위상(돌기·흔들기) */
  ph: number;
}
export interface Course {
  key: string;
  dur: number;
  /** 길 모양 위상 */
  ph: [number, number, number];
  items: FlightItem[];
  rings: number;
  golds: number;
  comets: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 고리 길(시간 → 위치). 부드러운 사인 둘을 겹쳐 따라가기 쉽게 */
export function pathAt(t: number, ph: readonly [number, number, number]): { x: number; y: number } {
  const x = 0.5 * Math.sin(0.62 * t + ph[0]) + 0.18 * Math.sin(1.7 * t + ph[1]);
  const y = 0.38 * Math.sin(0.47 * t + ph[2]) + 0.1 * Math.cos(1.3 * t + ph[0]);
  return { x: clamp(x, -SHIP_X * 0.85, SHIP_X * 0.85), y: clamp(y, -SHIP_Y * 0.8, SHIP_Y * 0.8) };
}

/**
 * 코스 만들기(같은 key 면 늘 같은 코스).
 * 고리는 길 위에 0.85초마다, 그중 약 1/6 은 금고리(조금 비껴 있다). 혜성은 길에서 0.42 이상 떨어진 곳 — 길을 따라가면 피할 수 있다.
 */
export function makeCourse(key: string, dur = FLIGHT_SEC): Course {
  const rng = rngFor(`flight:course:${key}`);
  const ph: [number, number, number] = [rng() * 6.283, rng() * 6.283, rng() * 6.283];
  const items: FlightItem[] = [];
  let id = 0, rings = 0, golds = 0, comets = 0;
  for (let t = 1.6; t <= dur - 0.6; t += 0.85) {
    const p = pathAt(t, ph);
    const gold = rings + golds >= 3 && rng() < 0.17;
    if (gold) {
      // 금고리는 길에서 살짝 비껴서 — 욕심내면 다음 고리를 놓칠 수도
      const a = rng() * 6.283, off = 0.12 + rng() * 0.1;
      items.push({ id: id++, kind: 'gold', t, x: clamp(p.x + Math.cos(a) * off, -SHIP_X, SHIP_X), y: clamp(p.y + Math.sin(a) * off, -SHIP_Y, SHIP_Y), r: GOLD_R, ph: rng() * 6.283 });
      golds++;
    } else {
      items.push({ id: id++, kind: 'ring', t, x: p.x, y: p.y, r: RING_R, ph: rng() * 6.283 });
      rings++;
    }
  }
  for (let t = 2.6; t <= dur - 0.9; t += 0.95 + rng() * 0.55) {
    const p = pathAt(t, ph);
    // 길에서 0.42~0.7 떨어진 자리(화면 안)
    let x = 0, y = 0;
    for (let k = 0; k < 8; k++) {
      const a = rng() * 6.283, d = 0.42 + rng() * 0.28;
      x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d;
      if (Math.abs(x) <= SHIP_X && Math.abs(y) <= SHIP_Y) break;
    }
    x = clamp(x, -SHIP_X, SHIP_X); y = clamp(y, -SHIP_Y, SHIP_Y);
    // 길과 너무 가까워졌으면(가장자리에 눌려서) 길 반대쪽으로 민다
    const dx = x - p.x, dy = y - p.y, dl = Math.hypot(dx, dy);
    if (dl < 0.42) { const k = dl > 1e-6 ? 0.42 / dl : 1; x = clamp(p.x + (dl > 1e-6 ? dx * k : 0.42 * -Math.sign(p.x || 1)), -SHIP_X, SHIP_X); y = clamp(p.y + dy * k, -SHIP_Y, SHIP_Y); }
    items.push({ id: id++, kind: 'comet', t, x, y, r: COMET_R, ph: rng() * 6.283 });
    comets++;
  }
  items.sort((a, b) => a.t - b.t || a.id - b.id);
  return { key, dur, ph, items, rings, golds, comets };
}

export type FlightPhase = 'intro' | 'fly' | 'done';
export interface FlightHit { id: number; kind: ItemKind | 'miss'; t: number; x: number; y: number; pts: number }
export interface FlightState {
  course: Course;
  phase: FlightPhase;
  /** 지금까지 흐른 시간(intro 포함) */
  clock: number;
  /** 비행 시각(0 → dur) */
  t: number;
  x: number; y: number; vx: number; vy: number;
  score: number;
  combo: number;
  bestCombo: number;
  rings: number;
  golds: number;
  missed: number;
  hits: number;
  /** 비틀거림 남은 초 */
  stun: number;
  /** 다음에 볼 아이템 번호 */
  next: number;
  /** 시뮬레이션 남은 자투리 */
  acc: number;
  /** 지난 갱신 동안 일어난 일(화면 연출용 — 갱신마다 비운다) */
  events: FlightHit[];
  /** 지금까지 판정한 아이템 결과(id → 'pass' | 'miss' | 'hit' | 'dodge') */
  result: Record<number, 'pass' | 'miss' | 'hit' | 'dodge'>;
}

export function newFlight(course: Course, o: { intro?: number } = {}): FlightState {
  return {
    course, phase: (o.intro ?? INTRO_SEC) > 0 ? 'intro' : 'fly', clock: -(o.intro ?? INTRO_SEC), t: 0,
    x: 0, y: -0.2, vx: 0, vy: 0, score: 0, combo: 0, bestCombo: 0, rings: 0, golds: 0, missed: 0, hits: 0, stun: 0,
    next: 0, acc: 0, events: [], result: {},
  };
}

/** 한 칸(STEP) 진행. input 은 -1..1 축(위 = +y) */
export function stepOnce(s: FlightState, ax: number, ay: number): void {
  if (s.phase === 'done') return;
  s.clock += STEP;
  if (s.clock < 0) { s.phase = 'intro'; return; }
  s.phase = 'fly';
  const prevT = s.t;
  s.t = Math.min(s.course.dur, s.clock);
  // 조종: 비틀거리는 동안엔 입력이 안 먹고 빙글
  const stunned = s.stun > 0;
  const ix = stunned ? 0 : clamp(ax, -1, 1), iy = stunned ? 0 : clamp(ay, -1, 1);
  s.vx += (ix * SHIP_ACC - s.vx * SHIP_DAMP) * STEP;
  s.vy += (iy * SHIP_ACC - s.vy * SHIP_DAMP) * STEP;
  s.x += s.vx * STEP; s.y += s.vy * STEP;
  if (s.x < -SHIP_X || s.x > SHIP_X) { s.x = clamp(s.x, -SHIP_X, SHIP_X); s.vx *= -0.3; }
  if (s.y < -SHIP_Y || s.y > SHIP_Y) { s.y = clamp(s.y, -SHIP_Y, SHIP_Y); s.vy *= -0.3; }
  if (stunned) s.stun = Math.max(0, s.stun - STEP);
  // 판정: 이번 칸에 평면을 지난 아이템
  const items = s.course.items;
  while (s.next < items.length && items[s.next].t <= s.t && items[s.next].t > prevT - 1e-9) {
    judge(s, items[s.next]);
    s.next++;
  }
  // 앞에서 건너뛴 것(시작 0 이하 등)도 정리
  while (s.next < items.length && items[s.next].t <= prevT - 1e-9) s.next++;
  if (s.t >= s.course.dur) s.phase = 'done';
}

function judge(s: FlightState, it: FlightItem) {
  const d = Math.hypot(s.x - it.x, s.y - it.y);
  if (it.kind === 'comet') {
    if (d < it.r + SHIP_R && s.stun <= 0) {
      s.hits++; s.combo = 0; s.stun = STUN_SEC;
      s.vx += (s.x - it.x) * 6; s.vy += (s.y - it.y) * 6;
      s.result[it.id] = 'hit';
      s.events.push({ id: it.id, kind: 'comet', t: it.t, x: it.x, y: it.y, pts: 0 });
    } else s.result[it.id] = 'dodge';
    return;
  }
  if (d <= it.r) {
    s.combo++;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    const pts = (it.kind === 'gold' ? PTS.gold : PTS.ring) + PTS.combo * (s.combo - 1);
    s.score += pts;
    if (it.kind === 'gold') s.golds++; else s.rings++;
    s.result[it.id] = 'pass';
    s.events.push({ id: it.id, kind: it.kind, t: it.t, x: it.x, y: it.y, pts });
  } else {
    // 금고리는 놓쳐도 콤보가 안 끊긴다(보너스니까)
    if (it.kind === 'ring') { s.combo = 0; s.missed++; }
    s.result[it.id] = 'miss';
    s.events.push({ id: it.id, kind: 'miss', t: it.t, x: it.x, y: it.y, pts: 0 });
  }
}

/** 실제 시간 dt 만큼 진행(자투리는 다음에). 갱신마다 events 를 비우고 이번 일만 담는다 */
export function stepFlight(s: FlightState, input: { x: number; y: number } | ((s: FlightState) => { x: number; y: number }), dt: number): FlightState {
  s.events = [];
  if (s.phase === 'done') return s;
  s.acc += Math.max(0, Math.min(0.25, dt));
  let n = 0;
  while (s.acc >= STEP - 1e-9 && n < 30 && (s.phase as FlightPhase) !== 'done') {
    const i = typeof input === 'function' ? input(s) : input;
    stepOnce(s, i.x, i.y);
    s.acc -= STEP;
    n++;
  }
  return s;
}

/** 비행 끝까지 한 번에(테스트·건너뛰기 계산) */
export function runFlight(s: FlightState, input: (s: FlightState) => { x: number; y: number }): FlightState {
  let guard = 0;
  while (s.phase !== 'done' && guard++ < 100000) { const i = input(s); stepOnce(s, i.x, i.y); }
  s.events = [];
  return s;
}

/** 자동 조종: 다음 고리(가까운 것)로, 혜성은 비켜서 — 디버그 __flight.auto 와 테스트가 쓴다 */
export function autopilot(s: FlightState): { x: number; y: number } {
  const items = s.course.items;
  let tx = s.x, ty = s.y;
  for (let i = s.next; i < items.length; i++) {
    const it = items[i];
    if (it.kind === 'comet') continue;
    tx = it.x; ty = it.y;
    // 금고리가 너무 멀면 다음 고리 쪽으로(욕심 안 냄)
    if (it.kind === 'gold' && Math.hypot(it.x - s.x, it.y - s.y) > (it.t - s.t) * 1.2) continue;
    break;
  }
  // 바로 앞 혜성이 길목이면 옆으로
  for (let i = s.next; i < items.length && items[i].t - s.t < 0.5; i++) {
    const it = items[i];
    if (it.kind !== 'comet') continue;
    const d = Math.hypot(tx - it.x, ty - it.y);
    if (d < it.r + SHIP_R + 0.06) { const k = (it.r + SHIP_R + 0.1) / Math.max(1e-3, d); tx = it.x + (tx - it.x) * k; ty = it.y + (ty - it.y) * k; }
  }
  // PD: 목표까지 거리 → 가속, 속도로 브레이크
  const ex = tx - s.x, ey = ty - s.y;
  return { x: clamp(ex * 5 - s.vx * 0.8, -1, 1), y: clamp(ey * 5 - s.vy * 0.8, -1, 1) };
}

/** 비행 결과 → 별가루(mult = 일요일 유성의 밤 ×2 같은 배율). 상한 DUST.max × mult */
export interface FlightReward { dust: number; score: number; rings: number; golds: number; hits: number; bestCombo: number; perfect: boolean; total: number }
export function flightReward(s: Pick<FlightState, 'score' | 'rings' | 'golds' | 'hits' | 'bestCombo' | 'missed' | 'course'>, mult = 1): FlightReward {
  const base = s.rings * DUST.ring + s.golds * DUST.gold;
  // 콤보 보너스: 최고 콤보 5마다 +1
  const combo = Math.floor(s.bestCombo / DUST.comboEvery);
  const perfect = s.hits === 0 && s.missed === 0 && s.rings >= s.course.rings;
  const raw = base + combo + (perfect ? DUST.perfect : 0);
  const m = Number.isFinite(mult) && mult > 0 ? mult : 1;
  const dust = Math.min(Math.round(DUST.max * m), Math.round(raw * m));
  return { dust, score: s.score, rings: s.rings, golds: s.golds, hits: s.hits, bestCombo: s.bestCombo, perfect, total: s.course.rings + s.course.golds };
}

/** 칭찬 한 마디(점수 비율) */
export function flightGrade(r: FlightReward): { grade: string; line: string } {
  const k = r.total ? (r.rings + r.golds) / r.total : 0;
  if (r.perfect) return { grade: 'S', line: '완벽해요! 별길의 주인공! 🌟' };
  if (k >= 0.8) return { grade: 'A', line: '반짝반짝 멋진 비행이었어요! ✨' };
  if (k >= 0.5) return { grade: 'B', line: '꽤 잘 날았어요! 다음엔 더 많이~' };
  return { grade: 'C', line: '괜찮아요, 별길은 또 있어요! 💫' };
}

/** 비행 코스 key(같은 날 같은 길은 같은 코스) */
export const courseKey = (from: string, to: string, day: number, n: number) => `${from}>${to}:${day}:${n}`;

/** 화면 투영: 평면까지 남은 시간 → 크기 비율(1 = 우주선 평면). 멀수록 작다 */
export const DEPTH_SPEED = 34, FOCAL = 10;
export function projScale(dtAhead: number): number {
  const d = Math.max(0, dtAhead) * DEPTH_SPEED;
  return FOCAL / (FOCAL + d);
}

// ───────────── ② 여행 목록 ─────────────
/** ext.planets.list() 한 줄(필요한 것만) */
export interface PlanetRowIn { id: string; name: string; icon: string; color: string; cost: number; visited: boolean; ok: boolean; why?: string; text: string; gravity?: number }
export interface TravelRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** 처음 갈 때 내는 별(이미 냈거나 다녀왔으면 0) */
  cost: number;
  ok: boolean;
  visited: boolean;
  /** 아직 못 가는 '다음' 행성(보여 주기만) */
  next: boolean;
  here: boolean;
  text: string;
}
export const ASTEROID_ID = 'asteroid';
export const ASTEROID_NAME = '내 소행성';
/**
 * 여행 목록: 갈 수 있거나 다녀온 행성은 전부, 못 가는 것 중엔 첫 번째('다음' 목표)만 — 그 별 값과 까닭을 같이.
 * planets 가 없으면 토끼달만. 내 소행성은 엔딩 뒤에만 맨 끝에.
 */
export function travelRows(planets: readonly PlanetRowIn[] | null, o: { here: string; asteroid: boolean; moonVisited?: boolean }): TravelRow[] {
  const out: TravelRow[] = [];
  const src: PlanetRowIn[] = planets && planets.length ? [...planets] : [{ id: 'moon', name: '토끼달', icon: '🌙', color: '#fff1cf', cost: 0, visited: !!o.moonVisited, ok: true, text: '언제든 갈 수 있어요' }];
  if (!src.some((r) => r.id === 'moon')) src.unshift({ id: 'moon', name: '토끼달', icon: '🌙', color: '#fff1cf', cost: 0, visited: !!o.moonVisited, ok: true, text: '언제든 갈 수 있어요' });
  let nextShown = false;
  for (const r of src) {
    const reachable = r.ok || r.visited;
    if (!reachable) {
      // 일식 때만 열리는 곳은 다녀왔어도 '지금은 못 가요'로 보여 준다(위 reachable 이 visited 로 들여보냈다)
      if (nextShown) continue;
      nextShown = true;
      out.push({ id: r.id, name: r.name, icon: r.icon, color: r.color, cost: Math.max(0, r.cost | 0), ok: false, visited: r.visited, next: true, here: o.here === r.id, text: r.text });
      continue;
    }
    out.push({ id: r.id, name: r.name, icon: r.icon, color: r.color, cost: r.ok ? Math.max(0, r.cost | 0) : 0, ok: r.ok, visited: r.visited, next: false, here: o.here === r.id, text: r.text });
  }
  if (o.asteroid) out.push({ id: ASTEROID_ID, name: ASTEROID_NAME, icon: '🪨', color: '#ffd6a8', cost: 0, ok: true, visited: true, next: false, here: o.here === ASTEROID_ID, text: '내가 꾸미는 작은 별 · 공짜' });
  return out;
}

/** 이 줄로 지금 날아갈 수 있나(여기면 못 간다) */
export function canFly(r: TravelRow | undefined, stars: number): { ok: boolean; why?: 'here' | 'locked' | 'stars' | 'unknown' } {
  if (!r) return { ok: false, why: 'unknown' };
  if (r.here) return { ok: false, why: 'here' };
  if (!r.ok) return { ok: false, why: 'locked' };
  if (r.cost > 0 && stars < r.cost) return { ok: false, why: 'stars' };
  return { ok: true };
}

// ───────────── ③ 엔딩 ─────────────
/** 도감 탭(economy/data DEX_TABS 모양) */
export interface DexTabLike { id: string; slots: number; match(s: { category: string; tags?: string[] }): boolean }
/** 도감 합계(hud 의 dexTotals 와 같은 셈): 탭마다 칸 = max(실린 종, 표의 칸 수) */
export function dexProgress(tabs: readonly DexTabLike[], species: Iterable<{ id: string; category: string; tags?: string[] }>, has: (id: string) => boolean): { got: number; total: number; pct: number } {
  const list = [...species];
  let got = 0, total = 0;
  for (const t of tabs) {
    let reg = 0, g = 0;
    for (const s of list) if (t.match(s)) { reg++; if (has(s.id)) g++; }
    got += g; total += Math.max(reg, t.slots);
  }
  return { got, total, pct: total > 0 ? got / total : 0 };
}

export interface EndingState {
  /** 도감 100% 불꽃놀이를 시작했다 */
  dexDone?: 1;
  /** ending 이벤트가 (누가 보냈든) 한 번 났다 */
  ended?: 1;
  /** 누가 먼저 엔딩을 냈나 */
  by?: 'dex' | 'story' | string;
}
/**
 * 도감 진행을 보고 할 일: 'fireworks' = 지금 불꽃놀이를 시작(한 번만). 그 밖엔 null.
 * 이미 엔딩이 났어도(story 가 먼저) 도감 100% 불꽃놀이는 한 번 본다 — ending 이벤트만 다시 안 낸다.
 */
export function endingOnDex(st: EndingState, got: number, total: number): 'fireworks' | null {
  if (st.dexDone) return null;
  if (!(total > 0) || got < total) return null;
  st.dexDone = 1;
  return 'fireworks';
}
/** 불꽃놀이가 끝났을 때: ending 을 낼지(아직 아무도 안 냈을 때만) */
export function endingAfterFireworks(st: EndingState): boolean {
  if (st.ended) return false;
  st.ended = 1;
  st.by = 'dex';
  return true;
}
/** 다른 곳(story 의 토토 엔딩)에서 ending 이 왔을 때 — 같이 쓴다. 처음이면 true */
export function endingExternal(st: EndingState, by = 'story'): boolean {
  if (st.ended) return false;
  st.ended = 1;
  st.by = by;
  return true;
}
/** 불러올 때: 도감 100% 를 찍고 불꽃놀이가 끝나기 전에 저장됐으면 이어 간다.
 *  'fireworks' 불꽃놀이 다시(끝나면 ending + 소행성) · 'unlock' ending 은 났는데 소행성만 못 열었다 · null 할 일 없음 */
export function endingResume(st: EndingState, asteroidUnlocked: boolean): 'fireworks' | 'unlock' | null {
  if (st.dexDone && !st.ended) return 'fireworks';
  if (st.ended && !asteroidUnlocked) return 'unlock';
  return null;
}

// ───────────── ④ 내 소행성 가구 자리 ─────────────
/** 5 × 4 = 20칸 */
export const ASTEROID_ROOM: RoomGrid = { w: 5, d: 4 };
export const ASTEROID_SLOTS = ASTEROID_ROOM.w * ASTEROID_ROOM.d;
/** 칸 간격(m) — 가구 하나가 칸 하나 */
export const SLOT_GAP = 3;
/** 가구는 모두 한 칸(같은 'solid' 층) */
export const slotFoot = (_item: string): Footprint => ({ w: 1, d: 1, layer: 'solid' });
export const slotIndex = (gx: number, gz: number) => gz * ASTEROID_ROOM.w + gx;
export const slotCell = (i: number) => ({ gx: i % ASTEROID_ROOM.w, gz: Math.floor(i / ASTEROID_ROOM.w) });
/** 칸 가운데(소행성 국소 좌표 m). 칸판은 착륙 자리 앞(−z 쪽)에 */
export const SLOT_CENTER = { x: 0, z: -7 } as const;
export function slotLocal(i: number): { x: number; z: number } {
  const { gx, gz } = slotCell(i);
  return { x: SLOT_CENTER.x + (gx - (ASTEROID_ROOM.w - 1) / 2) * SLOT_GAP, z: SLOT_CENTER.z + (gz - (ASTEROID_ROOM.d - 1) / 2) * SLOT_GAP };
}
/** 가구 아이템인가(f_*) */
export const isFurniture = (id: string) => typeof id === 'string' && id.startsWith('f_') && !id.includes('@');

export interface AsteroidData { layout: Placed[] }
/** 저장값 → 깨끗한 배치(범위 밖·겹침·가구 아닌 것은 dropped) */
export function restoreAsteroid(raw: unknown): { layout: Placed[]; dropped: Placed[] } {
  const arr = raw && typeof raw === 'object' ? (raw as { layout?: unknown }).layout : null;
  return restoreLayout(arr, ASTEROID_ROOM, slotFoot, { known: isFurniture });
}
export const slotOf = (layout: readonly Placed[], i: number): Placed | null => {
  const { gx, gz } = slotCell(i);
  return layout.find((p) => p.gx === gx && p.gz === gz) ?? null;
};
export const freeSlots = (layout: readonly Placed[]) => {
  const out: number[] = [];
  for (let i = 0; i < ASTEROID_SLOTS; i++) if (!slotOf(layout, i)) out.push(i);
  return out;
};
export type AsteroidPlace = { ok: true; layout: Placed[]; slot: number; placed: Placed } | { ok: false; why: 'full' | 'taken' | 'bounds' | 'item' };
/** 놓기: slot 을 안 주면 첫 빈칸. 20칸이 다 차면 'full' */
export function asteroidPlace(layout: readonly Placed[], item: string, slot?: number, rot = 0): AsteroidPlace {
  if (!isFurniture(item)) return { ok: false, why: 'item' };
  if (layout.length >= ASTEROID_SLOTS) return { ok: false, why: 'full' };
  let i = slot;
  if (i === undefined) { const f = freeSlots(layout); if (!f.length) return { ok: false, why: 'full' }; i = f[0]; }
  if (!Number.isInteger(i) || i < 0 || i >= ASTEROID_SLOTS) return { ok: false, why: 'bounds' };
  const { gx, gz } = slotCell(i);
  const cand: Placed = { uid: newUid(layout, item), item, gx, gz, rot: normRot(rot) };
  const c = canPlace(layout, cand, ASTEROID_ROOM, slotFoot);
  if (!c.ok) return { ok: false, why: c.why === 'overlap' ? 'taken' : 'bounds' };
  return { ok: true, layout: placeItem(layout, cand), slot: i, placed: cand };
}
/** 빼기 → 뺀 가구(없으면 null) */
export function asteroidTake(layout: readonly Placed[], slot: number): { layout: Placed[]; took: Placed | null } {
  const p = slotOf(layout, slot);
  if (!p) return { layout: [...layout], took: null };
  return { layout: removeItem(layout, p.uid), took: p };
}
/** 돌리기(90°씩) */
export function asteroidRotate(layout: readonly Placed[], slot: number): Placed[] {
  return layout.map((p) => { const c = slotCell(slot); return p.gx === c.gx && p.gz === c.gz ? { ...p, rot: nextRot(p.rot) } : p; });
}

// ───────────── 소행성 땅 ─────────────
/** 내 소행성: 반경 · 기준 높이(지구 바다보다 넉넉히 위) · 중력(지구 배율) · origin 오프셋(SPACE_ORIGIN 기준, 다른 행성과 3 km 떨어짐) */
export const ASTEROID = { radius: 34, base: 12, gravity: 0.28, offset: { x: -3000, y: 0, z: 0 }, clampFrac: 0.9 } as const;
/** 도착 자리 · 로켓 자리(국소). 카메라는 도착 때 +z 쪽(뒤)에 서므로 로켓은 옆으로 비켜 세운다 — 뒤에 두면 화면이 로켓 몸통으로 꽉 막힌다 */
export const ASTEROID_SPAWN = { x: 0, z: 9 } as const;
export const ASTEROID_ROCKET = { x: 7, z: 9 } as const;
/** 유성의 밤(일요일 21시 ~ 월요일 05시, calendar METEOR_NIGHT 와 같은 창) — 날씨가 meteor 여도 켠다 */
export function isMeteorNight(e: { weekday?: number; hour?: number; weather?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.weather === 'meteor') return true;
  const h = e.hour ?? 12;
  return (e.weekday === 6 && h >= 21) || (e.weekday === 0 && h < 5);
}
const smooth01 = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
/** 국소 (x, z) → 국소 높이: 둥근 돌 꼭대기(가운데가 살짝 볼록) + 작은 크레이터 셋 + 가장자리에서 둥글게 떨어짐. 가구판은 평평 */
export function asteroidHeight(x: number, z: number): number {
  const R = Math.hypot(x, z), r = ASTEROID.radius;
  let h = ASTEROID.base + 1.6 * (1 - (R / r) ** 2) + 0.25 * Math.sin(x * 0.45 + 1.1) * Math.cos(z * 0.38 - 0.4);
  for (const [cx, cz, cr] of [[-19, 6, 3.6], [17, 12, 2.8], [14, -20, 3.2]] as const) {
    const d = Math.hypot(x - cx, z - cz) / cr;
    if (d < 1.5) h += d < 1 ? -0.7 * (1 - d * d) : 0.35 * Math.sin((d - 1) * Math.PI * 2) * (1.5 - d) * 2;
  }
  // 가구판·로켓 자리 다지기
  const pad = (px: number, pz: number, hw: number, hd: number, to: number) => {
    const dx = Math.max(0, Math.abs(x - px) - hw), dz = Math.max(0, Math.abs(z - pz) - hd);
    const k = 1 - smooth01(0, 3, Math.hypot(dx, dz));
    h = h + (to - h) * k;
  };
  pad(SLOT_CENTER.x, SLOT_CENTER.z, (ASTEROID_ROOM.w * SLOT_GAP) / 2 + 2.8, (ASTEROID_ROOM.d * SLOT_GAP) / 2 + 2.8, ASTEROID.base + 1.2);
  // 도착 자리 ~ 로켓 자리를 한 판으로
  pad((ASTEROID_ROCKET.x + ASTEROID_SPAWN.x) / 2, (ASTEROID_ROCKET.z + ASTEROID_SPAWN.z) / 2,
    Math.abs(ASTEROID_ROCKET.x - ASTEROID_SPAWN.x) / 2 + 3.2, Math.abs(ASTEROID_ROCKET.z - ASTEROID_SPAWN.z) / 2 + 3.2, ASTEROID.base + 0.9);
  // 가장자리: 반경 85% 밖은 둥글게 떨어져 작은 별 수평선
  const f = Math.max(0, R - r * 0.85);
  return h - f * f * 0.09;
}
