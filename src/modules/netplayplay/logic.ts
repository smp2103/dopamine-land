// netplay-play 규칙(GDD 4.15) — 친구와 노는 놀이의 순수한 셈. three·DOM·게임 없음 → 테스트가 바로 몬다.
// 방문객 상자(하루 1번) · 친구 섬 시세 · 레이스 체크포인트 · 낚시 대회 · 티노 소음 · 협동 보스 HP · 도감 교환 표시 ·
// 숨바꼭질 · 하트 짝 보너스(같은 물가) · 칭호. 통신 쪽지 모양(decodeMsg)도 여기서 거른다(친구가 보낸 것도 믿지 않는다).

import { saturationMult } from '../economy/price';

// ───────────── 통신 쪽지 ─────────────
/** netplay 'app' 통로 이름 — 이 모듈 쪽지는 전부 여기로 */
export const APP_KIND = 'np';

export type RaceKind = 'bike' | 'boat' | 'run';
export type BossKind = 'mosasaur' | 'oarfish' | 'whale';
/** 초대로 시작하는 놀이 */
export type GameKind = `race-${RaceKind}` | 'contest' | 'hide';

export type Msg =
  | { t: 'hi'; dex: string[]; day: number }
  | { t: 'chest'; on: boolean; day: number }
  | { t: 'chest-open'; q: number }
  | { t: 'chest-r'; q: number; ok: boolean; why?: string }
  | { t: 'quote'; q: number; ids: string[] }
  | { t: 'quote-r'; q: number; prices: Record<string, number>; hot: string[] }
  | { t: 'sold'; id: string; n: number; coins: number }
  | { t: 'inv'; g: GameKind; id: string }
  | { t: 'inv-r'; id: string; ok: boolean }
  | { t: 'race-ready'; id: string }
  | { t: 'race-go'; id: string }
  | { t: 'race-cp'; id: string; i: number }
  | { t: 'race-fin'; id: string; ms: number }
  | { t: 'quit'; id: string }
  | { t: 'fc-score'; id: string; total: number; n: number; best: number }
  | { t: 'tino'; g: number; near: boolean }
  | { t: 'boss-ask'; kind: BossKind }
  | { t: 'boss-no'; kind: BossKind; why: string }
  | { t: 'boss'; id: string; kind: BossKind; hp: number; max: number; left: number; x: number; y: number; z: number; st: BossState }
  | { t: 'boss-hit'; id: string; n: number }
  | { t: 'dex-offer'; xid: string; give: string }
  | { t: 'dex-accept'; xid: string; give: string | null }
  | { t: 'dex-no'; xid: string }
  | { t: 'hs-found'; id: string }
  | { t: 'hs-end'; id: string; win: 'hider' | 'seeker' }
  | { t: 'fw'; x: number; y: number; z: number; seed: number }
  | { t: 'star5'; id: string; size: number; variant: string | null }
  | { t: 'drive'; kind: string | null; seats: number }
  | { t: 'ride-ask' }
  | { t: 'ride-ok'; kind: string }
  | { t: 'ride-no'; why: string }
  | { t: 'seat'; x: number; y: number; z: number; yaw: number }
  | { t: 'ride-pedal'; on: boolean }
  | { t: 'ride-off' }
  | { t: 'launch' };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** 범위 안 숫자(아니면 null) */
const numIn = (v: unknown, lo: number, hi: number): number | null => (fin(v) && v >= lo && v <= hi ? v : null);
const ID_RE = /^[A-Za-z0-9_:.@-]{1,48}$/;
const isId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);
const RACE_KINDS: readonly RaceKind[] = ['bike', 'boat', 'run'];
const GAME_KINDS: readonly string[] = ['race-bike', 'race-boat', 'race-run', 'contest', 'hide'];
export const BOSS_KINDS: readonly BossKind[] = ['mosasaur', 'oarfish', 'whale'];
const BOSS_STATES: readonly string[] = ['on', 'won', 'lost'];
/** 좌표 한계(월드 ±4000 + 우주 30000 근처) */
const XYZ = 40000;

/** 받은 쪽지 거르기 — 모양이 틀리면 null(조용히 버린다) */
export function decodeMsg(d: unknown): Msg | null {
  if (!isObj(d) || typeof d.t !== 'string') return null;
  const ids = (v: unknown, max: number) => (Array.isArray(v) ? v.filter(isId).slice(0, max) : []);
  const xyz = () => {
    const x = numIn(d.x, -XYZ, XYZ), y = numIn(d.y, -XYZ, XYZ), z = numIn(d.z, -XYZ, XYZ);
    return x === null || y === null || z === null ? null : { x, y, z };
  };
  switch (d.t) {
    case 'hi': return { t: 'hi', dex: ids(d.dex, 2000), day: Math.round(numIn(d.day, 0, 1e7) ?? 0) };
    case 'chest': return typeof d.on === 'boolean' ? { t: 'chest', on: d.on, day: Math.round(numIn(d.day, 0, 1e7) ?? 0) } : null;
    case 'chest-open': return fin(d.q) ? { t: 'chest-open', q: d.q } : null;
    case 'chest-r': return fin(d.q) && typeof d.ok === 'boolean' ? { t: 'chest-r', q: d.q, ok: d.ok, ...(typeof d.why === 'string' ? { why: d.why.slice(0, 60) } : {}) } : null;
    case 'quote': return fin(d.q) ? { t: 'quote', q: d.q, ids: ids(d.ids, 120) } : null;
    case 'quote-r': {
      if (!fin(d.q) || !isObj(d.prices)) return null;
      const prices: Record<string, number> = {};
      let k = 0;
      for (const [id, p] of Object.entries(d.prices)) {
        if (k >= 120) break;
        const v = numIn(p, 0, 1e7);
        if (isId(id) && v !== null) { prices[id] = Math.round(v); k++; }
      }
      return { t: 'quote-r', q: d.q, prices, hot: ids(d.hot, 8) };
    }
    case 'sold': {
      const n = numIn(d.n, 1, 999), c = numIn(d.coins, 0, 1e9);
      return isId(d.id) && n !== null && c !== null ? { t: 'sold', id: d.id, n: Math.round(n), coins: Math.round(c) } : null;
    }
    case 'inv': return typeof d.g === 'string' && GAME_KINDS.includes(d.g) && isId(d.id) ? { t: 'inv', g: d.g as GameKind, id: d.id } : null;
    case 'inv-r': return isId(d.id) && typeof d.ok === 'boolean' ? { t: 'inv-r', id: d.id, ok: d.ok } : null;
    case 'race-ready': case 'race-go': case 'quit': case 'hs-found':
      return isId(d.id) ? { t: d.t, id: d.id } as Msg : null;
    case 'race-cp': { const i = numIn(d.i, 0, 99); return isId(d.id) && i !== null ? { t: 'race-cp', id: d.id, i: Math.round(i) } : null; }
    case 'race-fin': { const ms = numIn(d.ms, 0, 3.6e6); return isId(d.id) && ms !== null ? { t: 'race-fin', id: d.id, ms: Math.round(ms) } : null; }
    case 'fc-score': {
      const total = numIn(d.total, 0, 1e7), n = numIn(d.n, 0, 1e5), best = numIn(d.best, 0, 1e6);
      return isId(d.id) && total !== null && n !== null && best !== null ? { t: 'fc-score', id: d.id, total, n: Math.round(n), best } : null;
    }
    case 'tino': { const g = numIn(d.g, 0, 100); return g !== null ? { t: 'tino', g, near: d.near === true } : null; }
    case 'boss-ask': return BOSS_KINDS.includes(d.kind as BossKind) ? { t: 'boss-ask', kind: d.kind as BossKind } : null;
    case 'boss-no': return BOSS_KINDS.includes(d.kind as BossKind) && typeof d.why === 'string' ? { t: 'boss-no', kind: d.kind as BossKind, why: d.why.slice(0, 80) } : null;
    case 'boss': {
      const p = xyz();
      const hp = numIn(d.hp, 0, 1e6), max = numIn(d.max, 1, 1e6), left = numIn(d.left, 0, 3600);
      if (!p || !isId(d.id) || !BOSS_KINDS.includes(d.kind as BossKind) || hp === null || max === null || left === null || !BOSS_STATES.includes(d.st as string)) return null;
      return { t: 'boss', id: d.id, kind: d.kind as BossKind, hp: Math.min(hp, max), max, left, ...p, st: d.st as BossState };
    }
    case 'boss-hit': { const n = numIn(d.n, 1, 60); return isId(d.id) && n !== null ? { t: 'boss-hit', id: d.id, n: Math.round(n) } : null; }
    case 'dex-offer': return isId(d.xid) && isId(d.give) ? { t: 'dex-offer', xid: d.xid, give: d.give } : null;
    case 'dex-accept': return isId(d.xid) && (d.give === null || isId(d.give)) ? { t: 'dex-accept', xid: d.xid, give: d.give as string | null } : null;
    case 'dex-no': return isId(d.xid) ? { t: 'dex-no', xid: d.xid } : null;
    case 'hs-end': return isId(d.id) && (d.win === 'hider' || d.win === 'seeker') ? { t: 'hs-end', id: d.id, win: d.win } : null;
    case 'fw': { const p = xyz(); const s = numIn(d.seed, 0, 1e9); return p && s !== null ? { t: 'fw', ...p, seed: Math.round(s) } : null; }
    case 'star5': return isId(d.id) ? { t: 'star5', id: d.id, size: numIn(d.size, 0, 1e5) ?? 0, variant: d.variant === 'shiny' || d.variant === 'crown' || d.variant === 'tiny' ? d.variant : null } : null;
    case 'drive': return (d.kind === null || isId(d.kind)) ? { t: 'drive', kind: d.kind as string | null, seats: Math.round(numIn(d.seats, 0, 8) ?? 1) } : null;
    case 'ride-ask': case 'ride-off': case 'launch': return { t: d.t } as Msg;
    case 'ride-ok': return isId(d.kind) ? { t: 'ride-ok', kind: d.kind } : null;
    case 'ride-no': return typeof d.why === 'string' ? { t: 'ride-no', why: d.why.slice(0, 80) } : null;
    case 'seat': { const p = xyz(); const yaw = numIn(d.yaw, -100, 100); return p && yaw !== null ? { t: 'seat', ...p, yaw } : null; }
    case 'ride-pedal': return typeof d.on === 'boolean' ? { t: 'ride-pedal', on: d.on } : null;
  }
  return null;
}
export const isRaceKind = (v: unknown): v is RaceKind => RACE_KINDS.includes(v as RaceKind);

// ───────────── flags.net(이 모듈 몫) ─────────────
/** flags.net.play — 이 모듈만 쓰는 칸 */
export interface PlayFlags {
  /** 방장: 우리 섬 방문객 상자를 마지막으로 연 날(게임 날) · 누가 */
  chest: { day: number; by: string };
  /** 손님: 친구 섬(이름)별로 방문객 상자를 연 날 */
  visited: Record<string, number>;
  /** 칭호 id 들(얻은 순) */
  titles: string[];
  /** 이긴 횟수 */
  wins: Record<string, number>;
  /** 보상 받은 놀이 수(하루 단위) {day, n} */
  daily: { day: number; n: Record<string, number> };
  /** 협동 보스를 그날 잡은 기록(종류 → 날) */
  boss: Record<string, number>;
  /** 티노 둘이 몰래 오르기 성공한 날 */
  duo: number;
  /** 친구와 처음 로켓을 쏜 적 */
  launched?: boolean;
}
/** flags.net.dexFrom — "○○가 준 친구" 표시(종 id → 준 친구) */
export type DexFrom = Record<string, { name: string; day: number }>;

export function ensurePlay(net: Record<string, unknown>): PlayFlags {
  const p = (isObj(net.play) ? net.play : (net.play = {})) as Partial<PlayFlags>;
  if (!isObj(p.chest)) p.chest = { day: -1, by: '' };
  if (!isObj(p.visited)) p.visited = {};
  if (!Array.isArray(p.titles)) p.titles = [];
  if (!isObj(p.wins)) p.wins = {};
  if (!isObj(p.daily) || !isObj((p.daily as { n?: unknown }).n)) p.daily = { day: -1, n: {} };
  if (!isObj(p.boss)) p.boss = {};
  if (!fin(p.duo)) p.duo = -1;
  return p as PlayFlags;
}
export function ensureDexFrom(net: Record<string, unknown>): DexFrom {
  return (isObj(net.dexFrom) ? net.dexFrom : (net.dexFrom = {})) as DexFrom;
}

/** 하루 보상 횟수 — 같은 놀이로 끝없이 벌지 않게(놀이마다 하루 REWARD_PER_DAY 번) */
export const REWARD_PER_DAY = 3;
export function takeDaily(p: PlayFlags, key: string, day: number, max = REWARD_PER_DAY): boolean {
  if (p.daily.day !== day) p.daily = { day, n: {} };
  const n = p.daily.n[key] ?? 0;
  if (n >= max) return false;
  p.daily.n[key] = n + 1;
  return true;
}

// ───────────── 방문객 상자(GDD 5.4 · 4.15) ─────────────
/** 방장 섬 광장 — 꽥사장 가게 동쪽 빈 잔디(나무·건물 없는 자리를 골라 둠) */
export const VISITOR_CHEST = { x: 14.5, z: -15 } as const;
/** E 거리 */
export const CHEST_REACH = 2.6;
/** 오늘 아직 안 열었나(방장 쪽 기록) */
export const chestReady = (c: PlayFlags['chest'], day: number) => c.day !== day;
/**
 * 방장이 손님의 "열래요"를 받아 판정 — 오늘 처음이면 기록하고 true. 두 번째부터 false(하루 1번).
 * 손님 쪽 기록(visited)도 같이 본다(같은 친구 섬을 같은 날 다시 와도 한 번).
 */
export function claimVisitorChest(host: PlayFlags['chest'], day: number, by: string): boolean {
  if (!chestReady(host, day)) return false;
  host.day = day;
  host.by = by;
  return true;
}
export function guestMayOpen(visited: Record<string, number>, hostName: string, hostDay: number): boolean {
  return visited[hostName] !== hostDay;
}

// ───────────── 친구 섬 시세(GDD 4.4 P1) ─────────────
export interface MarketRow { id: string; have: number; unit: number; hot: boolean }
/** 손님 가방 × 방장 시세 → 팔 수 있는 줄(값 큰 순) */
export function marketRows(bag: Record<string, number>, prices: Record<string, number>, hot: readonly string[]): MarketRow[] {
  const base = (k: string) => k.split('@')[0];
  return Object.entries(bag)
    .filter(([id, n]) => n > 0 && (prices[id] ?? 0) > 0)
    .map(([id, n]) => ({ id, have: n, unit: prices[id], hot: hot.includes(base(id)) }))
    .sort((a, b) => b.unit - a.unit || a.id.localeCompare(b.id));
}
/**
 * 친구 섬에서 n 개 판 값 — 방장 시세(포화 전 한 개 값) × 판매 포화(GDD 4.4: 오늘 이 종 11번째부터 −5%씩, 최저 50%).
 * soldBefore = 손님이 오늘 이미 판 수(집·친구 섬 합쳐 하나로 센다)
 */
export function friendSale(unit: number, n: number, soldBefore = 0): number {
  const u = Math.max(0, Math.round(unit)), k = Math.max(0, Math.floor(n)), s0 = Math.max(0, Math.floor(soldBefore));
  let total = 0;
  for (let i = 0; i < k; i++) total += Math.round(u * saturationMult(s0 + i));
  return total;
}
/** 시세 표가 이만큼 지나면 다시 물어본다(초) */
export const QUOTE_TTL = 45;

// ───────────── 레이스(체크포인트 순서) ─────────────
export interface Checkpoint { x: number; z: number; r: number }
/** 코스: 0번 = 출발선, 마지막 = 결승선 */
export interface Course { kind: RaceKind; name: string; cps: Checkpoint[] }

/**
 * 말랑섬 코스(지형 표본으로 골라 둔 자리 — tests 가 땅/바다를 확인한다).
 * 자전거·달리기: 마을 → 북쪽 언덕 들판 한 바퀴 → 마을. 배: 부두 앞바다 → 서쪽 곶 → 남쪽 바다 → 부두.
 */
export const COURSES: Readonly<Record<RaceKind, Course>> = Object.freeze({
  bike: {
    kind: 'bike', name: '말랑 언덕 자전거 한 바퀴',
    cps: [[0, -6], [-4, -40], [-14, -84], [-50, -130], [-10, -170], [50, -150], [64, -100], [34, -60], [12, -24], [0, -6]].map(([x, z]) => ({ x, z, r: 6 })),
  },
  run: {
    kind: 'run', name: '말랑 들판 달리기',
    cps: [[0, -6], [-4, -40], [-14, -84], [20, -110], [50, -80], [34, -60], [12, -24], [0, -6]].map(([x, z]) => ({ x, z, r: 4.5 })),
  },
  boat: {
    kind: 'boat', name: '부두 앞바다 뱃놀이',
    cps: [[30, 34], [-40, 44], [-110, 14], [-150, -34], [-120, 60], [-30, 80], [60, 70], [110, 40], [70, 50], [30, 34]].map(([x, z]) => ({ x, z, r: 10 })),
  },
});
export const RACE_NAMES: Readonly<Record<RaceKind, string>> = { bike: '자전거 레이스', boat: '배 레이스', run: '달리기 시합' };
/** 출발선에서 이만큼 안이면 준비 완료 */
export const START_R = 14;
/** 3·2·1 */
export const COUNTDOWN = 3;
/** 이 시간 안에 못 들어오면 끝(초) */
export const RACE_LIMIT = 240;

/** 체크포인트를 순서대로만 센다(건너뛴 건 안 친다) */
export class RaceTrack {
  /** 다음에 지나야 할 칸(0 = 출발선은 이미 지난 셈 → 1 부터) */
  next = 1;
  /** 지난 시각들(초, 출발 기준) */
  splits: number[] = [];
  done = false;
  constructor(readonly course: Course) {}
  get total() { return this.course.cps.length - 1; }
  /** 지금 목표 칸 */
  target(): Checkpoint | null { return this.done ? null : this.course.cps[this.next] ?? null; }
  /** 위치 갱신 → 'cp'(칸 통과) · 'finish'(결승) · null */
  pass(x: number, z: number, t: number): 'cp' | 'finish' | null {
    const c = this.target();
    if (!c) return null;
    if (Math.hypot(x - c.x, z - c.z) > c.r) return null;
    this.splits.push(t);
    this.next++;
    if (this.next >= this.course.cps.length) { this.done = true; return 'finish'; }
    return 'cp';
  }
  /** 통과한 칸 수 */
  get passed() { return this.next - 1; }
}
/** 둘의 기록 → 누가 이겼나(작은 ms 가 이김, 못 들어온 쪽은 null) */
export function raceWinner(me: number | null, peer: number | null): 'me' | 'peer' | 'tie' | 'none' {
  if (me === null && peer === null) return 'none';
  if (peer === null) return 'me';
  if (me === null) return 'peer';
  if (Math.abs(me - peer) < 50) return 'tie';
  return me < peer ? 'me' : 'peer';
}
/** 0:41.27 */
export const fmtMs = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
};

// ───────────── 낚시 대회(10분, 총 cm) ─────────────
export const CONTEST_SEC = 600;
export class FishContest {
  total = 0;
  n = 0;
  best = 0;
  /** 한 마리(cm) */
  add(cm: number) {
    if (!(cm > 0) || !Number.isFinite(cm)) return;
    const c = Math.round(cm * 10) / 10;
    this.total = Math.round((this.total + c) * 10) / 10;
    this.n++;
    this.best = Math.max(this.best, c);
  }
}
export function contestWinner(me: number, peer: number): 'me' | 'peer' | 'tie' {
  if (Math.abs(me - peer) < 0.05) return 'tie';
  return me > peer ? 'me' : 'peer';
}
/** 잡은 크기(cm) — 이벤트 size 가 없으면 종 len */
export const catchCm = (size: unknown, len: unknown) => (fin(size) && size > 0 ? size : fin(len) && len > 0 ? len : 0);

// ───────────── 티노 둘이 살금살금(GDD 3.7 · 4.15) ─────────────
// dinos/tino.ts 와 같은 숫자(같이 맞춘다) — 친구 소리를 내 티노 게이지에 얹을 때 쓴다
export const TINO_HEAR_R = 10;
export const TINO_RATE_RUN = 45;
export const TINO_RATE_WALK = 9;
export const TINO_RUN_SPEED = 7;
export const TINO_SNEAK_SPEED = 2.4;
/** 둘이 꼭대기 이 반경 안에 같이 서면 성공 */
export const DUO_SUMMIT_R = 7;
/** 친구 움직임 → 게이지 오름(%/초) */
export function peerNoiseRate(speed: number, dist: number, mode?: string): number {
  if (!(dist <= TINO_HEAR_R)) return 0;
  if (mode === 'mounted') return TINO_RATE_RUN; // 탈것은 시끄럽다
  if (!(speed > TINO_SNEAK_SPEED)) return 0;
  return speed > TINO_RUN_SPEED ? TINO_RATE_RUN : TINO_RATE_WALK;
}
/** 둘이 같이 보는 게이지 = 더 높은 쪽 */
export const sharedGauge = (mine: number, peer: number) => Math.max(0, Math.min(100, Math.max(mine, peer)));

// ───────────── 협동 보스(모사사우루스·산갈치·우주고래) ─────────────
export type BossState = 'on' | 'won' | 'lost';
export interface BossDef { kind: BossKind; name: string; species: string; hp: number; sec: number; icon: string; color: string; keep: boolean }
export const BOSSES: Readonly<Record<BossKind, BossDef>> = Object.freeze({
  mosasaur: { kind: 'mosasaur', name: '바다왕 모사', species: 'z_mosasaur', hp: 240, sec: 70, icon: '🦕', color: '#5a78c8', keep: false },
  oarfish: { kind: 'oarfish', name: '용궁리본산갈치', species: 'f_oarfish', hp: 180, sec: 60, icon: '🎀', color: '#ff7a8a', keep: true },
  whale: { kind: 'whale', name: '하늘고래', species: 's_sky_whale', hp: 300, sec: 80, icon: '🐋', color: '#c8e8ff', keep: false },
});
/** 연타 한 번 = HP 1 */
export const HIT_DMG = 1;
/** 둘이 다 이 시간 안에 쳤어야 깎인다(혼자면 회복) */
export const DUO_WINDOW = 2;
/** 혼자일 때 초당 회복 */
export const BOSS_REGEN = 6;
/** 보스 곁(이 안에서만 칠 수 있다) */
export const BOSS_REACH = 40;
/** 둘이 이만큼 가까이 있어야 부를 수 있다 */
export const BOSS_PAIR_R = 60;

/** 방장 쪽 보스 — HP 의 주인. 손님은 스냅숏만 받는다 */
export class BossFight {
  hp: number;
  readonly max: number;
  left: number;
  st: BossState = 'on';
  /** 마지막으로 친 때(게임 초) */
  lastHit: Record<'me' | 'peer', number> = { me: -99, peer: -99 };
  hits: Record<'me' | 'peer', number> = { me: 0, peer: 0 };
  constructor(readonly id: string, readonly kind: BossKind, public x: number, public y: number, public z: number) {
    this.max = this.hp = BOSSES[kind].hp;
    this.left = BOSSES[kind].sec;
  }
  /** 연타 n 번 — 둘 다 최근에 쳤을 때만 깎인다 */
  hit(who: 'me' | 'peer', n: number, t: number) {
    if (this.st !== 'on' || !(n > 0)) return;
    this.lastHit[who] = t;
    this.hits[who] += n;
    if (this.duo(t)) this.hp = Math.max(0, this.hp - n * HIT_DMG);
    if (this.hp <= 0) this.st = 'won';
  }
  /** 둘이 같이 치는 중인가 */
  duo(t: number) { return t - this.lastHit.me <= DUO_WINDOW && t - this.lastHit.peer <= DUO_WINDOW; }
  step(dt: number, t: number) {
    if (this.st !== 'on') return;
    this.left = Math.max(0, this.left - dt);
    if (!this.duo(t)) this.hp = Math.min(this.max, this.hp + BOSS_REGEN * dt);
    if (this.left <= 0) this.st = 'lost';
  }
  snapshot(): Extract<Msg, { t: 'boss' }> {
    return { t: 'boss', id: this.id, kind: this.kind, hp: Math.round(this.hp * 10) / 10, max: this.max, left: Math.round(this.left * 10) / 10, x: this.x, y: this.y, z: this.z, st: this.st };
  }
}
/** 보스가 나올 자리인가(바다 구역·세계) */
export function bossPlaceOk(kind: BossKind, w: { world: string; sea: string | null; tod: string; weather: string }): { ok: boolean; why: string } {
  if (kind === 'whale') return w.world === 'space' ? { ok: true, why: '' } : { ok: false, why: '하늘고래는 우주에서만 만날 수 있어요 🚀' };
  if (w.world !== 'earth') return { ok: false, why: '지구 바다에서 불러요 🌊' };
  if (kind === 'mosasaur') {
    return w.sea === 'offshore' || w.sea === 'deep' || w.sea === 'trench' ? { ok: true, why: '' } : { ok: false, why: '먼바다·심해까지 나가야 모사가 나와요' };
  }
  if (!(w.sea === 'shallow' || w.sea === 'offshore' || w.sea === 'deep' || w.sea === 'trench')) return { ok: false, why: '배를 타고 해안 밖으로 나가요' };
  return w.tod === 'night' || w.weather === 'storm' || w.weather === 'rain' ? { ok: true, why: '' } : { ok: false, why: '산갈치는 밤이나 비바람 칠 때 올라와요 🌙' };
}

// ───────────── 도감 교환("○○가 준 친구") ─────────────
/** 하루에 친구와 바꿀 수 있는 수 */
export const DEX_PER_DAY = 3;
/** 보낼 수 있나: 내가 등록했고, 친구는 아직 없는 종(탈것 줄·재료는 빼고) */
export function dexGiftable(id: string, mine: Record<string, unknown>, peer: ReadonlySet<string>, cat: (id: string) => string | undefined): boolean {
  if (!mine[id] || peer.has(id)) return false;
  const c = cat(id);
  return !!c && c !== 'item';
}
/**
 * 받은 종 기록 — 도감에 없던 것만 표시를 남긴다(이미 직접 잡은 종엔 붙이지 않는다). 남겼으면 true.
 * 박물관 기증은 가방에 실물이 있어야 하므로 도감만 받은 종은 기증할 수 없다(직접 잡아야).
 */
export function markDexGift(from: DexFrom, dex: Record<string, unknown>, id: string, name: string, day: number): boolean {
  if (dex[id]) return false;
  from[id] = { name, day };
  return true;
}
export const dexGiftLabel = (name: string) => `${name}가 준 친구`;

// ───────────── 숨바꼭질 ─────────────
export const HIDE_SEC = 30;
export const SEEK_SEC = 150;
/** 찾았다! 거리 */
export const FIND_R = 3.2;
/** 술래 화면에서 숨은 친구가 이만큼 멀면 아바타를 감춘다 */
export const HIDE_VIS_R = 9;
/** 술래 힌트 */
export function warmth(d: number): { text: string; v: number } {
  if (d < 8) return { text: '🔥 바로 옆이야!', v: 1 };
  if (d < 20) return { text: '♨️ 따뜻따뜻', v: 0.75 };
  if (d < 45) return { text: '🌤 미지근', v: 0.5 };
  if (d < 90) return { text: '🌬 쌀쌀해', v: 0.25 };
  return { text: '❄️ 꽁꽁 추워', v: 0.08 };
}

// ───────────── 하트 짝 보너스(둘이 같은 물가) ─────────────
/** 하트잉어(friend-boost 태그)·하트무당벌레 ×2 */
export const HEART_TAG = 'friend-boost';
export const HEART_MULT = 2;
/** 같은 물가로 치는 거리 */
export const PAIR_R = 30;
/** 물가 찾는 반경 */
export const WATER_PROBE = 8;
export interface WaterProbe {
  lakeAt(x: number, z: number): { kind: string; x: number; z: number } | null;
  waterLevelAt(x: number, z: number): number;
  isSea(x: number, z: number): boolean;
  island(x: number, z: number): string | null;
}
/** 둘레 9 점에서 가장 먼저 닿는 물 → 이름표(호수 kind+자리 / 강·바다 + 섬) */
export function waterKey(x: number, z: number, P: WaterProbe): string | null {
  const offs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  for (const [ox, oz] of offs) {
    const px = x + ox * WATER_PROBE, pz = z + oz * WATER_PROBE;
    const L = P.lakeAt(px, pz);
    if (L) return `lake:${L.kind}:${Math.round(L.x)}:${Math.round(L.z)}`;
  }
  for (const [ox, oz] of offs) {
    const px = x + ox * WATER_PROBE, pz = z + oz * WATER_PROBE;
    if (P.isSea(px, pz)) return `sea:${P.island(x, z) ?? 'open'}`;
    if (Number.isFinite(P.waterLevelAt(px, pz))) return `river:${P.island(x, z) ?? '?'}`;
  }
  return null;
}
/** 둘이 같은 물가 + 가까우면 태그 배수 */
export function heartBoost(me: { x: number; z: number; key: string | null }, peer: { x: number; z: number; key: string | null } | null): Record<string, number> {
  if (!peer || !me.key || me.key !== peer.key) return {};
  if (Math.hypot(me.x - peer.x, me.z - peer.z) > PAIR_R) return {};
  return { [HEART_TAG]: HEART_MULT };
}

// ───────────── 2인 탈것 ─────────────
/** 친구 탈것 뒷자리에 탈 수 있는 거리 */
export const RIDE_REACH = 4.5;
/** 둘 다 밟으면 */
export const COPEDAL_MUL = 1.3;

// ───────────── 칭호 ─────────────
export interface TitleDef { id: string; name: string; icon: string; desc: string; stars: number }
export const TITLES: Readonly<Record<string, TitleDef>> = Object.freeze({
  'space-buddy': { id: 'space-buddy', name: '우주 단짝', icon: '🚀', desc: '친구와 함께 처음 로켓을 쐈어요', stars: 10 },
  'race-star': { id: 'race-star', name: '바람돌이', icon: '🏁', desc: '친구와의 레이스에서 처음 이겼어요', stars: 3 },
  'angler-king': { id: 'angler-king', name: '낚시 대회 챔피언', icon: '🏆', desc: '낚시 대회에서 처음 이겼어요', stars: 3 },
  'boss-duo': { id: 'boss-duo', name: '환상의 콤비', icon: '💞', desc: '친구와 협동 보스를 처음 물리쳤어요', stars: 5 },
  'tino-ninja': { id: 'tino-ninja', name: '살금살금 듀오', icon: '🦖', desc: '티노를 안 깨우고 둘이 꼭대기까지', stars: 3 },
  'hide-master': { id: 'hide-master', name: '숨바꼭질 달인', icon: '🙈', desc: '숨바꼭질에서 처음 이겼어요', stars: 2 },
  'dex-pal': { id: 'dex-pal', name: '도감 펜팔', icon: '📒', desc: '친구와 처음 도감을 바꿨어요', stars: 2 },
});
/** 칭호 주기 — 처음이면 true */
export function grantTitle(p: PlayFlags, id: string): boolean {
  if (!TITLES[id] || p.titles.includes(id)) return false;
  p.titles.push(id);
  return true;
}
