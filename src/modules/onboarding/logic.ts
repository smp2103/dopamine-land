// onboarding 순수 로직 — 반짝이가 하나씩 알려 주는 첫 안내(화면·WebGL 없이 테스트한다).
// 흐름(step): 떠 있는 안내가 있으면 → 해냈나(done) · 시간 다 됐나(ttl) · 바쁜가(잠깐 숨김) 만 본다.
//            없으면 → 이미 해 본 안내는 건너뛰기(skip) 로 적고, 조용한 틈(6~10초)이 지나면 조건이 맞는 것 중 우선순위 높은 하나를 띄운다.
// 한 번 끝난 안내(done · ttl · skip)는 기록(rec)에 남아 다시 안 뜬다 — 기록은 flags.onboarding.done 에 저장된다.

// ───────────── 신호(매 프레임 모듈이 채운다) ─────────────
/** 안내 판단에 쓰는 지금 상황. 'did' 류는 한 번 켜지면 계속 켜져 있다(처음부터 쭉 지켜본다) */
export interface Signals {
  /** 타이틀을 지나 놀기 시작했나 */
  started: boolean;
  /** 창·연출·사진 모드·잠금 중(안내를 띄우지도 시간을 세지도 않는다) */
  busy: boolean;
  /** 지금까지 논 시간(초, 저장 간 이어짐) */
  playSec: number;
  world: 'earth' | 'space';
  // ── 움직이기
  movedM: number;
  ranSec: number;
  jumped: boolean;
  // ── 상호작용(지금 범위 안 / 해 봤나)
  nearInteract: boolean;
  interacted: boolean;
  // ── 낚시
  nearFishWater: boolean;
  hasRod: boolean;
  fished: boolean;
  // ── 바다
  deepWater: boolean;
  dived: boolean;
  // ── 말랑 주머니
  gotItem: boolean;
  gotMail: boolean;
  pouchOpened: boolean;
  // ── 도감 · 상점
  caught: boolean;
  dexOpened: boolean;
  gotCoins: boolean;
  sold: boolean;
  // ── 탈것 · 카메라
  ownsVehicle: boolean;
  summoned: boolean;
  camToggled: boolean;
}

export function blankSignals(o: Partial<Signals> = {}): Signals {
  return {
    started: false, busy: false, playSec: 0, world: 'earth',
    movedM: 0, ranSec: 0, jumped: false,
    nearInteract: false, interacted: false,
    nearFishWater: false, hasRod: false, fished: false,
    deepWater: false, dived: false,
    gotItem: false, gotMail: false, pouchOpened: false,
    caught: false, dexOpened: false, gotCoins: false, sold: false,
    ownsVehicle: false, summoned: false, camToggled: false,
    ...o,
  };
}

// ───────────── 안내 정의 ─────────────
export interface HintDef {
  id: string;
  /** 반짝이 말. [키] 는 키캡으로 그린다 */
  text: string;
  /** 해냈을 때 반짝이가 하는 말 */
  yay?: string;
  /** 떠 있는 최대 시간(초, 바쁜 동안은 안 센다) */
  ttl: number;
  /** 같은 때 여럿이 맞으면 큰 것 먼저 */
  priority: number;
  /** 이 안내들이 끝난(어떻게든) 뒤에만 */
  after?: string[];
  /** 이만큼 논 뒤에만(초) */
  minPlay?: number;
  /** 이미 놀아 본 사람(예전 저장)에겐 건너뜀 */
  veteranSkip?: boolean;
  /** 띄울 때인가(지금 상황) */
  trigger: (s: Signals) => boolean;
  /** 해냈나(띄우기 전에 이미 참이면 건너뛴다) */
  done: (s: Signals) => boolean;
}

export const MOVE_M = 4;
export const RUN_SEC = 2;
/** 카메라 안내는 5분 놀고 나서 */
export const CAM_AFTER_SEC = 300;
/** 탈것 안내는 처음 1분 30초는 참는다(시작이 붐비지 않게) */
export const VEHICLE_AFTER_SEC = 90;
/** 첫 안내까지(놀기 시작한 뒤) */
export const FIRST_DELAY = 1.4;
export const GAP_MIN = 6;
export const GAP_MAX = 10;

export const HINTS: HintDef[] = [
  {
    id: 'move', text: '[WASD] 로 걸어 봐요', yay: '잘 걷네요!', ttl: 30, priority: 9, veteranSkip: true,
    trigger: (s) => s.world === 'earth', done: (s) => s.movedM >= MOVE_M,
  },
  {
    id: 'run', text: '[Shift] 를 누르면 달려요', yay: '쌩쌩~!', ttl: 22, priority: 8, after: ['move'], veteranSkip: true,
    trigger: () => true, done: (s) => s.ranSec >= RUN_SEC,
  },
  {
    id: 'jump', text: '[Space] 로 폴짝!', yay: '폴짝 성공!', ttl: 20, priority: 7, after: ['run'], veteranSkip: true,
    trigger: () => true, done: (s) => s.jumped,
  },
  // ── 그 순간에만 맞는 안내(지나가면 놓치니까 걷기 다음이면 끼어든다)
  {
    id: 'fish', text: '물가에서 [E] 를 누르면 낚시해요', yay: '퐁당~ 기다려 봐요!', ttl: 14, priority: 20, after: ['move'],
    trigger: (s) => s.nearFishWater && s.hasRod, done: (s) => s.fished,
  },
  {
    id: 'dive', text: '[C] 로 잠수!', yay: '보글보글~', ttl: 14, priority: 19, after: ['move'],
    trigger: (s) => s.deepWater, done: (s) => s.dived,
  },
  {
    id: 'interact', text: '[E] 로 말을 걸거나 주울 수 있어요', yay: '그거예요!', ttl: 14, priority: 18, after: ['jump'],
    trigger: (s) => s.nearInteract, done: (s) => s.interacted,
  },
  // ── 한 번 생기면 계속 맞는 안내(걷기·달리기·점프가 끝난 뒤 차례로)
  {
    id: 'pouch', text: '[Tab] 을 누르면 말랑 주머니가 열려요 — 가방·도감·우편이 다 여기 있어요', yay: '말랑말랑~', ttl: 24, priority: 15, after: ['jump'],
    trigger: (s) => s.gotItem || s.gotMail, done: (s) => s.pouchOpened,
  },
  {
    id: 'dex', text: '도감([B])에 새로 올랐어요!', yay: '멋진 기록이에요!', ttl: 10, priority: 14, after: ['jump'],
    trigger: (s) => s.caught, done: (s) => s.dexOpened,
  },
  {
    id: 'sell', text: '잡은 건 상점에서 팔 수 있어요 💰', ttl: 9, priority: 12, after: ['jump'],
    trigger: (s) => s.gotCoins, done: (s) => s.sold,
  },
  {
    id: 'vehicle', text: '[F] 로 탈것을 불러요', yay: '부릉부릉!', ttl: 14, priority: 10, after: ['jump'], minPlay: VEHICLE_AFTER_SEC,
    trigger: (s) => s.ownsVehicle && s.world === 'earth', done: (s) => s.summoned,
  },
  {
    id: 'cam', text: '[V] 로 카메라를 바꿔 봐요', yay: '어때요, 아늑하죠?', ttl: 12, priority: 5, after: ['jump'], minPlay: CAM_AFTER_SEC,
    trigger: () => true, done: (s) => s.camToggled,
  },
];

// ───────────── 글 → 조각(키캡) ─────────────
export type TextPart = { t: 'text' | 'key'; v: string };
/** '[E] 로 …' → 조각들 + 키 목록 + 괄호 뺀 글 */
export function parseText(text: string): { parts: TextPart[]; keys: string[]; plain: string } {
  const parts: TextPart[] = [];
  const keys: string[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) });
    parts.push({ t: 'key', v: m[1] });
    if (!keys.includes(m[1])) keys.push(m[1]);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });
  return { parts, keys, plain: text.replace(re, '$1') };
}

// ───────────── 상태 기계 ─────────────
/** 끝난 까닭: done 해냄 · ttl 시간 다 됨 · skip 이미 해 봄(안 띄움) */
export type Outcome = 'done' | 'ttl' | 'skip';
export interface Active { id: string; age: number; paused: boolean }
export interface OnbState {
  rec: Record<string, Outcome>;
  active: Active | null;
  /** 다음 안내까지 남은 조용한 시간(초) */
  quiet: number;
}
export interface StepOut {
  show?: HintDef;
  /** 바빠서 숨겼던 안내를 다시 보여 준다 */
  resume?: HintDef;
  /** 바빠서 잠깐 숨긴다 */
  pause?: HintDef;
  end?: { def: HintDef; why: 'done' | 'ttl' };
  /** 이번에 건너뛴 안내 id */
  skipped: string[];
}

export function makeState(rec: Record<string, Outcome> = {}): OnbState {
  return { rec: { ...rec }, active: null, quiet: FIRST_DELAY };
}

/** 6~10초 틈(r 은 0..1) */
export const gapOf = (r: number) => GAP_MIN + Math.max(0, Math.min(1, r)) * (GAP_MAX - GAP_MIN);

const ready = (st: OnbState, d: HintDef) => !d.after || d.after.every((a) => a in st.rec);

/**
 * 한 걸음. dt 는 실제 초. nextGap() 은 안내가 끝날 때마다 다음 틈(초)을 준다.
 * 같은 프레임에 끝내기와 띄우기는 함께 일어나지 않는다(늘 틈을 둔다).
 */
export function step(st: OnbState, defs: readonly HintDef[], s: Signals, dt: number, nextGap: () => number): StepOut {
  const out: StepOut = { skipped: [] };
  // ── 떠 있는 안내
  if (st.active) {
    const a = st.active;
    const def = defs.find((d) => d.id === a.id);
    if (!def) { st.active = null; return out; }
    if (def.done(s)) {
      st.rec[def.id] = 'done';
      st.active = null;
      st.quiet = nextGap();
      out.end = { def, why: 'done' };
      return out;
    }
    if (!s.started || s.busy) {
      if (!a.paused) { a.paused = true; out.pause = def; }
      return out;
    }
    if (a.paused) { a.paused = false; out.resume = def; }
    a.age += dt;
    if (a.age >= def.ttl) {
      st.rec[def.id] = 'ttl';
      st.active = null;
      st.quiet = nextGap();
      out.end = { def, why: 'ttl' };
    }
    return out;
  }
  // ── 이미 해 본 건 건너뛴다(처음부터 쭉 지켜본 신호로)
  for (const d of defs) {
    if (d.id in st.rec) continue;
    let did = false;
    try { did = d.done(s); } catch { did = false; }
    if (did) { st.rec[d.id] = 'skip'; out.skipped.push(d.id); }
  }
  if (!s.started || s.busy) return out;
  st.quiet = Math.max(0, st.quiet - dt);
  if (st.quiet > 0) return out;
  // ── 고르기: 조건 맞는 것 중 우선순위 큰 것(같으면 목록 순)
  let pick: HintDef | null = null;
  for (const d of defs) {
    if (d.id in st.rec || !ready(st, d)) continue;
    if (d.minPlay != null && s.playSec < d.minPlay) continue;
    let ok = false;
    try { ok = d.trigger(s); } catch { ok = false; }
    if (!ok) continue;
    if (!pick || d.priority > pick.priority) pick = d;
  }
  if (pick) { st.active = { id: pick.id, age: 0, paused: false }; out.show = pick; }
  return out;
}

/** 지금 떠 있는 안내를 바로 끝낸다(디버그 next) — 'ttl' 로 적고 틈 없이 */
export function finishActive(st: OnbState, defs: readonly HintDef[]): HintDef | null {
  if (!st.active) return null;
  const def = defs.find((d) => d.id === st.active!.id) ?? null;
  if (def) st.rec[def.id] = 'ttl';
  st.active = null;
  st.quiet = 0;
  return def;
}

// ───────────── 저장 ─────────────
export interface OnbFlags { v: 1; done: Record<string, Outcome>; play: number }

const OUTCOMES: readonly string[] = ['done', 'ttl', 'skip'];
/** flags.onboarding 읽기(망가진 값은 버린다) */
export function readFlags(raw: unknown): OnbFlags | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { done?: unknown; play?: unknown };
  const done: Record<string, Outcome> = {};
  if (r.done && typeof r.done === 'object') {
    for (const [k, v] of Object.entries(r.done as Record<string, unknown>)) if (typeof v === 'string' && OUTCOMES.includes(v)) done[k] = v as Outcome;
  }
  const play = typeof r.play === 'number' && Number.isFinite(r.play) && r.play > 0 ? r.play : 0;
  return { v: 1, done, play };
}

/**
 * 예전부터 놀던 사람인가(onboarding 이 생기기 전 저장). 그런 사람에겐 움직이기 안내를 안 띄운다.
 * - 예전 '환영해요' 키 안내를 봤다(flags.ui.tutorial) · 게임 시계가 10분 넘게 흘렀다(flags.env.sec) · 도감에 생물이 있다
 */
export function isVeteran(o: { hasOnbFlags: boolean; tutorialSeen: boolean; envSec: number; dexIds: readonly string[] }): boolean {
  if (o.hasOnbFlags) return false;
  if (o.tutorialSeen) return true;
  if (o.envSec >= 600) return true;
  // 탈것 줄(v_*)·도구는 새 저장에도 저절로 적힐 수 있어 뺀다
  return o.dexIds.some((id) => !id.startsWith('v_') && !id.startsWith('tool_'));
}

/** 시작 기록: 저장된 기록 + hud 가 기억한 안내(flags.ui.hints) + 예전 사람이면 움직이기 건너뛰기 */
export function initialRec(defs: readonly HintDef[], saved: OnbFlags | null, hudHints: unknown, veteran: boolean): Record<string, Outcome> {
  const rec: Record<string, Outcome> = { ...(saved?.done ?? {}) };
  const ids = new Set(defs.map((d) => d.id));
  const seen = Array.isArray(hudHints) ? hudHints : hudHints && typeof hudHints === 'object' ? Object.keys(hudHints) : [];
  for (const h of seen) {
    const id = typeof h === 'string' ? h.replace(/^onboarding:/, '') : '';
    if (ids.has(id) && !(id in rec)) rec[id] = 'done';
  }
  if (veteran) for (const d of defs) if (d.veteranSkip && !(d.id in rec)) rec[d.id] = 'skip';
  return rec;
}
