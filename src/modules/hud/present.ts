// HUD 보여 주기 규칙(wave 7 — "모든 게 게임 속에 녹아든다") — 화면(DOM) 없이 테스트하는 순수 규칙만.
// 1) 큰 연출 자리(Stage): 배너·지역 이름·가운데 카드는 한 번에 하나, 사이 숨 고르기 0.6초. 놀기 전·컷신 중엔 줄만 선다.
//    잡았다!/상자 같은 도파민 연출이 끼어들면 지금 배너를 잠깐 비켜 준다.
// 2) 토스트 한 줄(ToastLine): 새 토스트는 앞 것을 바꿔 친다(그래도 0.9초는 읽히게).
// 3) 칩 살짝 보이기(PeekTracker): 보이는 내용이 바뀌면 3초쯤 떠오른다 — 칩마다 쉬는 시간, 자꾸 바뀌는 칩은 조용히.
// 4) 말랑 주머니(Tab): 방울 고르기·순서(pocketApps), 플레이어 둘레 고리 자리(ringLayout), 위쪽 상태 무지개(arcRows), 키 이동(pocketNav).
// 5) 안내 말풍선(HintQueue): 하나씩, 우선순위, 본 것은 다시 안 띄움, 창·컷신 중엔 잠깐 숨는다.
// 6) 조작 안내(controlRows) · 키 모자 글 쪼개기(hintParts) · 콤보 보이기.
import type { HintOpts } from '../../core/api';
import { keyCap } from './logic';

// ───────────── 놀기 시작 ─────────────
/** game.started 읽기: false 일 때만 '아직'(옛 코어·시험은 없으니 늘 시작한 셈) */
export const startedOf = (v: unknown): boolean => v !== false;
/** 컷신(연출)으로 보는 잠금 주인 — 이 동안 배너·토스트는 줄만 선다 */
export const CINEMATIC_LOCKS: ReadonlySet<string> = new Set(['story', 'intro', 'title', 'boot', 'cinematic', 'cutscene', 'ending']);
export const isCinematic = (owners: readonly string[] | null | undefined) => !!owners?.some((o) => CINEMATIC_LOCKS.has(o));

// ───────────── 1. 큰 연출 자리 ─────────────
export interface StageItem { kind: 'banner' | 'region'; ms: number }
/** 배너와 배너 사이 숨 고르기(ms) */
export const STAGE_GAP = 600;
/**
 * 큰 연출 자리 — 한 번에 하나. update(now, gate, hold) 를 자주 부르면 된다.
 * - gate=false(놀기 전·컷신·창 전환)면 새로 띄우지 않는다(떠 있는 건 제 시간대로 내린다).
 * - 내린 뒤 gap 동안은 다음 것을 안 띄운다. 지역 이름은 줄 맨 앞에 선다(하지만 떠 있는 배너를 밀어내진 않는다).
 * - claim(ms): 다른 모듈의 가운데 카드가 자리를 쓴다. interrupt(ms): 잡았다!처럼 바로 끼어든다(떠 있는 배너는 내리고, 막 떴으면 다시 줄 앞에).
 */
export class Stage<T extends StageItem> {
  private q: T[] = [];
  cur: T | null = null;
  private shownAt = 0;
  private until = 0;
  private freeAt = 0;
  private claimUntil = -1e12;
  dropped = 0;
  constructor(private gap = STAGE_GAP, private max = 8) {}
  push(item: T) {
    if (item.kind === 'region') {
      // 같은 지역 이름이 줄에 있으면 새 것으로(빠르게 섬을 넘나들 때 쌓이지 않게)
      this.q = this.q.filter((x) => x.kind !== 'region');
      this.q.unshift(item);
    } else this.q.push(item);
    while (this.q.length > this.max) {
      // 오래 기다린 배너부터 버린다(지역 이름은 남긴다)
      const i = this.q.findIndex((x) => x.kind !== 'region');
      this.q.splice(i >= 0 ? i : 0, 1);
      this.dropped++;
    }
  }
  /** 다른 모듈이 ms 동안 자리를 쓴다(끝나고 gap 뒤에 다음 것) */
  claim(ms: number, now: number) { this.claimUntil = Math.max(this.claimUntil, now + Math.max(0, ms)); }
  /** 바로 끼어들기 — 내려야 할 배너(있으면)를 돌려준다 */
  interrupt(ms: number, now: number): T | null {
    this.claim(ms, now);
    const was = this.cur;
    if (!was) return null;
    this.cur = null;
    this.freeAt = now;
    // 막 떴던 건(1초 안) 끼어든 게 끝나면 다시 보여 준다
    if (now - this.shownAt < 1000) this.q.unshift(was);
    return was;
  }
  /** 자리가 차 있나(떠 있음 · 남의 연출 · 숨 고르기) */
  busy(now: number): boolean { return !!this.cur || now < this.claimUntil + this.gap || now < this.freeAt; }
  update(now: number, gate = true, hold = false): { show?: T; hide?: T } | null {
    if (this.cur && !hold && now >= this.until) {
      const was = this.cur;
      this.cur = null;
      this.freeAt = now + this.gap;
      return { hide: was };
    }
    if (!this.cur && gate && this.q.length && now >= this.freeAt && now >= this.claimUntil + this.gap) {
      this.cur = this.q.shift()!;
      this.shownAt = now;
      this.until = now + Math.max(400, this.cur.ms);
      return { show: this.cur };
    }
    return null;
  }
  /** 지금 것 바로 내리기 */
  skip(now: number) { this.until = now; }
  pending(): readonly T[] { return this.q; }
  clear() { this.q = []; this.cur = null; }
}

// ───────────── 2. 토스트 한 줄 ─────────────
export interface ToastItem { text: string; ms: number }
/**
 * 토스트는 늘 한 줄 — 새 것이 앞 것을 바꿔 친다. 다만 앞 것이 minShow 도 안 됐으면 그만큼 기다렸다 바꾼다.
 * gate=false(놀기 전·컷신)면 줄만 서고(max 개, 같은 글은 하나), 열리면 차례로 하나씩.
 */
export class ToastLine {
  private q: ToastItem[] = [];
  cur: ToastItem | null = null;
  private shownAt = 0;
  private until = 0;
  constructor(private minShow = 900, private max = 4) {}
  push(t: ToastItem) {
    this.q = this.q.filter((x) => x.text !== t.text);
    this.q.push(t);
    while (this.q.length > this.max) this.q.shift();
  }
  update(now: number, gate = true, hold = false): { show?: ToastItem; hide?: ToastItem } | null {
    if (gate && this.q.length && (!this.cur || now - this.shownAt >= this.minShow)) {
      this.cur = this.q.shift()!;
      this.shownAt = now;
      // 뒤에 줄이 있으면 짧게(그래도 minShow 는) — 줄이 비면 제 시간만큼
      this.until = now + Math.max(this.minShow, this.cur.ms);
      return { show: this.cur };
    }
    if (this.cur && !hold && now >= this.until) {
      const was = this.cur;
      this.cur = null;
      return { hide: was };
    }
    return null;
  }
  pending(): readonly ToastItem[] { return this.q; }
}

// ───────────── 3. 칩 살짝 보이기 ─────────────
export interface PeekOpts {
  /** 떠 있는 시간(ms) */
  holdMs: number;
  /** 내린 뒤 같은 칩이 저절로 다시 뜨기까지(ms) */
  cooldownMs: number;
  /** 한 번에 떠 있는 칩 수 */
  max: number;
  /** jitterWindow 안에 jitterN 번 넘게 바뀌면 자꾸 바뀌는 칩 → jitterMute 동안 저절로 안 뜬다 */
  jitterN: number;
  jitterWindow: number;
  jitterMute: number;
  /** 이 시간(ms) 안에 잇달아 바뀐 건 한 번으로 센다(숫자가 촤르르 올라가는 한 번의 변화) */
  burstMs: number;
  /** 떠 있는 동안 또 바뀌면 늘려 주되, 처음 뜬 뒤 이 시간(ms)까지만 */
  maxHoldMs: number;
}
export const PEEK_DEFAULTS: PeekOpts = { holdMs: 3000, cooldownMs: 6000, max: 3, jitterN: 4, jitterWindow: 30000, jitterMute: 90000, burstMs: 1500, maxHoldMs: 7000 };
export type PeekResult = { start?: string; extend?: string; evicted?: string[] } | null;
interface PeekRec { sig: string | null; changes: number[]; lastCount: number; mutedUntil: number; endedAt: number; startAt: number; until: number }
/**
 * 칩마다 마지막 내용(sig)을 들고 있다가 바뀌면 띄울지 정한다(띄우기·늘리기·버리기는 렌더러가).
 * - 처음 본 내용(기준)은 안 띄운다. 빈 칩(안 보이는 칩)은 안 띄운다.
 * - auto=false(시계처럼 늘 바뀌는 칩)·canPeek=false(놀기 전·주머니 열림)면 기준만 바꾼다.
 * - 떠 있는 동안 또 바뀌면 시간을 늘린다(최대 maxHoldMs). 내린 뒤 cooldown 동안은 저절로 안 뜬다.
 * - 자꾸 바뀌는 칩(jitter)은 한동안 저절로 안 뜬다. request(id) 는 쉬는 시간을 무시한다(hud.peek).
 */
export class PeekTracker {
  private recs = new Map<string, PeekRec>();
  /** 떠 있는 칩(새 것이 앞) */
  stack: string[] = [];
  private o: PeekOpts;
  constructor(o: Partial<PeekOpts> = {}) { this.o = { ...PEEK_DEFAULTS, ...o }; }
  private rec(id: string): PeekRec {
    let r = this.recs.get(id);
    if (!r) { r = { sig: null, changes: [], lastCount: -1e12, mutedUntil: 0, endedAt: -1e12, startAt: 0, until: 0 }; this.recs.set(id, r); }
    return r;
  }
  isPeeking(id: string) { return this.stack.includes(id); }
  /** 칩 내용 보고. sig '' = 빈 칩 */
  observe(id: string, sig: string, now: number, o: { auto: boolean; canPeek: boolean }): PeekResult {
    const r = this.rec(id);
    if (r.sig === null) { r.sig = sig; return null; }
    if (r.sig === sig) return null;
    r.sig = sig;
    if (!o.auto || !o.canPeek) return null;
    // 자꾸 바뀜 세기 — 놀기 전·창이 열린 동안 바뀐 건 안 센다. 잇달아(burstMs 안) 바뀐 건 한 번으로
    if (now - r.lastCount > this.o.burstMs) {
      r.lastCount = now;
      r.changes.push(now);
      while (r.changes.length && now - r.changes[0] > this.o.jitterWindow) r.changes.shift();
      if (r.changes.length > this.o.jitterN) r.mutedUntil = now + this.o.jitterMute;
    }
    if (!sig) return null;
    if (this.isPeeking(id)) {
      const until = Math.min(r.startAt + this.o.maxHoldMs, now + this.o.holdMs);
      if (until > r.until) r.until = until;
      return { extend: id };
    }
    if (now < r.mutedUntil) return null;
    if (now - r.endedAt < this.o.cooldownMs) return null;
    return this.begin(id, this.o.holdMs, now);
  }
  /** 일부러 띄우기(쉬는 시간·자꾸 바뀜 무시) */
  request(id: string, ms: number | undefined, now: number): PeekResult {
    const r = this.rec(id);
    const hold = Math.max(600, ms ?? this.o.holdMs);
    if (this.isPeeking(id)) { r.until = Math.max(r.until, now + hold); return { extend: id }; }
    return this.begin(id, hold, now);
  }
  private begin(id: string, hold: number, now: number): PeekResult {
    const r = this.rec(id);
    r.startAt = now;
    r.until = now + hold;
    this.stack.unshift(id);
    const evicted: string[] = [];
    while (this.stack.length > this.o.max) { const old = this.stack.pop()!; evicted.push(old); this.rec(old).endedAt = now; }
    return evicted.length ? { start: id, evicted } : { start: id };
  }
  /** 시간이 다 된 칩 — 렌더러가 퐁 하고 내린다 */
  update(now: number, hold = false): string[] {
    if (hold) return [];
    const out: string[] = [];
    this.stack = this.stack.filter((id) => {
      const r = this.rec(id);
      if (now < r.until) return true;
      r.endedAt = now;
      out.push(id);
      return false;
    });
    return out;
  }
  /** 전부 바로 내리기(주머니가 열릴 때) */
  clear(now: number): string[] {
    const out = this.stack;
    for (const id of out) this.rec(id).endedAt = now;
    this.stack = [];
    return out;
  }
  forget(id: string) { this.recs.delete(id); this.stack = this.stack.filter((x) => x !== id); }
  /** 디버그 */
  info(id: string) { const r = this.recs.get(id); return r ? { sig: r.sig, muted: r.mutedUntil, ended: r.endedAt, until: r.until } : null; }
}
/** 칩 내용 → 비교할 글(보이는 글 + 보이는지). 안 보이면 '' */
export function chipSig(text: string | null | undefined, visible: boolean): string {
  if (!visible) return '';
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

// ───────────── 게이지·콤보 ─────────────
/** 게이지를 내린 뒤 스르르 사라지는 시간(ms) */
export const GAUGE_FADE_MS = 600;
/** 콤보 숫자는 5 이상이고 최근(ms)에 늘었을 때만 */
export const COMBO_SHOW_MS = 4500;
export const comboShown = (n: number, changedAt: number, now: number) => Number.isFinite(n) && n >= 5 && now - changedAt < COMBO_SHOW_MS;

// ───────────── 4. 말랑 주머니 ─────────────
export interface AppIn {
  kind: string;
  title: string;
  icon?: string;
  color?: string;
  app?: false | { order?: number };
  /** false 면 지금은 숨김(상황이 안 맞음) */
  when?: boolean;
}
/** 아는 창의 기본 순서(작을수록 앞 — 12시 방향부터 시계 방향) */
export const APP_ORDER: Readonly<Record<string, number>> = {
  dex: 10, bag: 20, map: 30, mail: 40, journal: 50, '@photo': 60, garage: 70, friends: 80, netplayplay: 85, story: 90, letter: 95,
  settings: 900, controls: 910,
};
/** NPC·자리에서 여는 창 — 주머니에 안 넣는다(def.app 으로 바꿀 수 있다) */
export const CONTEXT_PANELS: ReadonlySet<string> = new Set([
  'pocket', 'shop', 'craft', 'museum', 'board', 'npc', 'storage', 'planets', 'startravel', 'asteroid', 'capsule', 'bagfull',
  'figure', 'save', 'travel', 'yard', 'dev', 'shipyard',
]);
/** 주머니 방울 목록(순서대로). app:false · 상황 창 · when:false 는 뺀다. 같은 kind 는 하나 */
export function pocketApps<T extends AppIn>(list: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: Array<{ a: T; o: number; i: number }> = [];
  list.forEach((a, i) => {
    if (seen.has(a.kind)) return;
    if (a.app === false || a.when === false) return;
    const explicit = a.app && typeof a.app === 'object';
    if (!explicit && CONTEXT_PANELS.has(a.kind)) return;
    seen.add(a.kind);
    const o = explicit && typeof (a.app as { order?: number }).order === 'number' ? (a.app as { order: number }).order : APP_ORDER[a.kind] ?? 500;
    out.push({ a, o, i });
  });
  return out.sort((x, y) => x.o - y.o || x.i - y.i).map((x) => x.a);
}
/** 방울 뱃지 글('' 이면 없음): 숫자는 99+, 글은 앞 3자 */
export function badgeText(v: unknown): string {
  if (v === null || v === undefined || v === false || v === '' || v === 0) return '';
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? (v > 99 ? '99+' : String(Math.floor(v))) : '';
  return String(v).slice(0, 3);
}

export interface RingIn {
  /** 방울 수 */
  n: number;
  /** 플레이어 화면 자리(px) */
  px: number; py: number;
  /** 화면 크기 */
  W: number; H: number;
  /** 방울 지름(px) */
  bubble?: number;
  /** 고리 위 상태 무지개 높이(px) */
  arcH?: number;
  /** 화면 가장자리 여백 */
  margin?: number;
}
export interface RingOut { cx: number; cy: number; r: number; scale: number; pts: Array<{ x: number; y: number; a: number }>; top: number; bottom: number }
/**
 * 고리 자리: 플레이어 둘레(12시부터 시계 방향). 방울이 많으면 반지름을 키우고, 화면이 작으면 줄인다(scale).
 * 고리 + 위 무지개(arcH) + 이름표가 화면 안에 들어오게 가운데를 민다(clamp).
 */
export function ringLayout(o: RingIn): RingOut {
  const n = Math.max(1, Math.floor(o.n));
  const b = o.bubble ?? 86, m = o.margin ?? 16, arcH = o.arcH ?? 0;
  // 방울 사이가 지름의 1.7배쯤 되게(이름표가 옆 방울에 안 겹치게)
  const r0 = Math.min(270, Math.max(190, (n * b * 1.7) / (Math.PI * 2)));
  const ext0 = r0 + b / 2 + 22; // 이름표 자리
  const scale = Math.max(0.45, Math.min(1, (o.W - m * 2) / (ext0 * 2), (o.H - m * 2) / (ext0 * 2 + arcH)));
  const r = r0 * scale, ext = ext0 * scale, ah = arcH * scale;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const cx = clamp(Number.isFinite(o.px) ? o.px : o.W / 2, m + ext, o.W - m - ext);
  const cy = clamp(Number.isFinite(o.py) ? o.py : o.H / 2, m + ah + ext, o.H - m - ext);
  const pts: RingOut['pts'] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a });
  }
  return { cx, cy, r, scale, pts, top: cy - ext - ah, bottom: cy + ext };
}

export interface ArcItem { i: number; row: number; x: number; y: number; rot: number }
/**
 * 상태 무지개: 칩 폭(widths)을 줄(maxW 안)로 나누고, 줄마다 가운데 맞춤 + 무지개처럼 휘게(가장자리가 아래로, 살짝 기울게).
 * x 는 줄 가운데에서의 거리(칩 가운데), y 는 무지개 위쪽 끝에서 아래로(px). 폭 0 인 칩은 뺀다.
 */
export function arcRows(widths: readonly number[], maxW: number, o: { gap?: number; rowH?: number; bend?: number; tilt?: number } = {}): { items: ArcItem[]; rows: number; height: number; rowW: number[] } {
  const gap = o.gap ?? 10, rowH = o.rowH ?? 50, bend = o.bend ?? 26, tilt = o.tilt ?? 7;
  const rows: number[][] = [];
  let cur: number[] = [], w = 0;
  widths.forEach((wd, i) => {
    if (!(wd > 0)) return;
    const add = cur.length ? gap + wd : wd;
    if (cur.length && w + add > maxW) { rows.push(cur); cur = [i]; w = wd; }
    else { cur.push(i); w += add; }
  });
  if (cur.length) rows.push(cur);
  const items: ArcItem[] = [];
  const rowW: number[] = [];
  const half = Math.max(1, maxW / 2);
  rows.forEach((row, ri) => {
    const total = row.reduce((s, i) => s + widths[i], 0) + gap * (row.length - 1);
    rowW.push(total);
    let x = -total / 2;
    for (const i of row) {
      const cxp = x + widths[i] / 2;
      const k = Math.max(-1, Math.min(1, cxp / half));
      items.push({ i, row: ri, x: cxp, y: ri * rowH + bend * k * k, rot: tilt * k });
      x += widths[i] + gap;
    }
  });
  return { items, rows: rows.length, height: rows.length ? rows.length * rowH + bend : 0, rowW };
}

/** 주머니 키 이동: 화살표·WASD 로 한 칸, 숫자 1~9·0 으로 바로, Enter·Space·E 로 고르기 */
export function pocketNav(focus: number, n: number, code: string): { focus: number; pick: boolean } | null {
  if (n <= 0) return null;
  const f = Number.isFinite(focus) && focus >= 0 ? focus % n : -1;
  if (code === 'ArrowRight' || code === 'ArrowDown' || code === 'KeyD' || code === 'KeyS') return { focus: f < 0 ? 0 : (f + 1) % n, pick: false };
  if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'KeyA' || code === 'KeyW') return { focus: f < 0 ? n - 1 : (f - 1 + n) % n, pick: false };
  const d = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (d) {
    const i = d[1] === '0' ? 9 : Number(d[1]) - 1;
    return i < n ? { focus: i, pick: true } : null;
  }
  if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'KeyE') return f >= 0 ? { focus: f, pick: true } : { focus: 0, pick: false };
  return null;
}

// ───────────── 5. 안내 말풍선 ─────────────
export interface HintLive { h: HintOpts; seq: number; shownMs: number; lastAt: number }
/** 안내 말풍선 기본 시간(ms) */
export const HINT_TTL = 12000;
/**
 * 안내 말풍선 줄 — 한 번에 하나. priority 큰 것 먼저, 같으면 먼저 온 것.
 * - 본 id(seen) 는 again 이 아니면 다시 안 받는다. 처음 띄울 때 seen 에 넣는다(onSeen 으로 저장).
 * - until() 이 참이 되면 'done'(퐁), ttl 이 다 되면 'timeout'. gate=false(창·주머니·컷신·놀기 전)면 잠깐 숨는다(시간은 멈춘다).
 * - 줄에 있다가 until() 이 이미 참이면 띄우지 않고 버린다.
 */
export class HintQueue {
  private q: HintLive[] = [];
  cur: HintLive | null = null;
  private seq = 0;
  suspended = false;
  constructor(readonly seen: Set<string> = new Set(), private onSeen?: (id: string) => void) {}
  push(h: HintOpts): boolean {
    if (!h?.id || !h.text) return false;
    // 떠 있는 것과 같은 id 면 글만 바꾼다(본 것으로 이미 적혀 있다)
    if (this.cur?.h.id === h.id) { this.cur.h = h; return true; }
    if (!h.again && this.seen.has(h.id)) return false;
    const i = this.q.findIndex((x) => x.h.id === h.id);
    if (i >= 0) { this.q[i].h = h; return true; }
    this.q.push({ h, seq: this.seq++, shownMs: 0, lastAt: 0 });
    return true;
  }
  remove(id: string): boolean {
    const i = this.q.findIndex((x) => x.h.id === id);
    if (i >= 0) this.q.splice(i, 1);
    if (this.cur?.h.id === id) { this.cur = null; return true; }
    return i >= 0;
  }
  private static done(h: HintOpts): boolean { try { return !!h.until?.(); } catch { return false; } }
  update(now: number, gate: boolean): { show?: HintOpts; hide?: HintOpts; why?: 'done' | 'timeout' | 'suspend' } | null {
    const c = this.cur;
    if (c) {
      if (HintQueue.done(c.h)) { this.cur = null; return { hide: c.h, why: 'done' }; }
      if (!gate) {
        if (!this.suspended) { this.suspended = true; return { hide: c.h, why: 'suspend' }; }
        c.lastAt = now;
        return null;
      }
      if (this.suspended) { this.suspended = false; c.lastAt = now; return { show: c.h }; }
      c.shownMs += Math.max(0, now - c.lastAt);
      c.lastAt = now;
      if (c.shownMs >= (c.h.ttl ?? HINT_TTL)) { this.cur = null; return { hide: c.h, why: 'timeout' }; }
      return null;
    }
    if (!gate || !this.q.length) return null;
    // 이미 해낸 건 버린다
    this.q = this.q.filter((x) => !HintQueue.done(x.h));
    if (!this.q.length) return null;
    this.q.sort((a, b) => (b.h.priority ?? 0) - (a.h.priority ?? 0) || a.seq - b.seq);
    const next = this.q.shift()!;
    next.lastAt = now;
    this.cur = next;
    this.suspended = false;
    if (!this.seen.has(next.h.id)) { this.seen.add(next.h.id); this.onSeen?.(next.h.id); }
    return { show: next.h };
  }
  pending(): readonly HintLive[] { return this.q; }
}

/** 말풍선 글 → 글·키 모자 조각. [E] 는 늘 키, keys 의 글자는 글 속에서 찾아 키로. 글에 없는 keys 는 앞에 붙인다 */
export function hintParts(text: string, keys: readonly string[] = []): Array<{ t: 'text' | 'key'; v: string }> {
  const caps = [...new Set(keys.map((k) => keyCap(k)).filter(Boolean))].sort((a, b) => b.length - a.length);
  const out: Array<{ t: 'text' | 'key'; v: string }> = [];
  const used = new Set<string>();
  const pushText = (s: string) => { if (s) out.push({ t: 'text', v: s }); };
  // [키] 표기 먼저
  const segs = String(text ?? '').split(/(\[[^\]\s]{1,8}\])/);
  for (const seg of segs) {
    const m = /^\[([^\]\s]{1,8})\]$/.exec(seg);
    if (m) { const c = keyCap(m[1]); out.push({ t: 'key', v: c }); used.add(c); continue; }
    if (!caps.length) { pushText(seg); continue; }
    // 키 글자: 앞뒤가 영문자·숫자가 아닐 때만(Shift 안의 S 를 키로 보지 않게). 한 글자 키가 붙어 있으면('WASD') 하나씩 키로
    const singles = caps.filter((c) => /^[A-Z0-9]$/.test(c));
    const alts = caps.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (singles.length > 1) alts.unshift(`[${singles.join('')}]{2,}`);
    const re = new RegExp(`(?<![A-Za-z0-9])(${alts.join('|')})(?![A-Za-z0-9])`, 'g');
    let last = 0;
    for (let mm = re.exec(seg); mm; mm = re.exec(seg)) {
      pushText(seg.slice(last, mm.index));
      const run = mm[1].length > 1 && !caps.includes(mm[1]) ? [...mm[1]] : [mm[1]];
      for (const v of run) { out.push({ t: 'key', v }); used.add(v); }
      last = mm.index + mm[1].length;
    }
    pushText(seg.slice(last));
  }
  const missing = caps.filter((c) => !used.has(c)).sort((a, b) => keys.findIndex((k) => keyCap(k) === a) - keys.findIndex((k) => keyCap(k) === b));
  if (missing.length) out.unshift(...missing.map((v) => ({ t: 'key' as const, v })), { t: 'text', v: ' ' });
  return out;
}

// ───────────── 6. 조작 안내 ─────────────
export interface ControlRow { caps: string[]; label: string }
export interface ControlGroup { title: string; icon: string; rows: ControlRow[] }
/** 늘 쓰는 움직임 키(코어가 직접 받는다) */
export const MOVE_ROWS: readonly ControlRow[] = [
  { caps: ['W', 'A', 'S', 'D'], label: '걷기 (화살표도 돼요)' },
  { caps: ['Shift'], label: '달리기' },
  { caps: ['Space'], label: '폴짝! · 공중에서 꾹 = 활공' },
  { caps: ['C'], label: '물속으로 잠수 (헤엄칠 때)' },
  { caps: ['E'], label: '말 걸기 · 줍기 · 하기' },
  { caps: ['F'], label: '다른 행동 · 탈것 부르기' },
  { caps: ['🖱️'], label: '끌어서 둘러보기 · 휠로 가까이' },
  { caps: ['Q', 'R'], label: '시점 돌리기' },
  { caps: ['V'], label: '카메라 바꾸기 (모험 ↔ 아늑)' },
];
/** 단축키(hint 인 것 + 이름 있는 것, 같은 키는 하나) → 조작 안내 묶음 */
export function controlRows(hotkeys: ReadonlyArray<{ code: string; label: string; hint?: boolean; when?: () => boolean }>): ControlGroup[] {
  const moveCaps = new Set(MOVE_ROWS.flatMap((r) => r.caps));
  const keys: ControlRow[] = [{ caps: ['Tab'], label: '말랑 주머니 열기·닫기' }];
  const seen = new Set<string>(['Tab', 'Escape', 'Backquote']);
  for (const h of hotkeys) {
    if (!h.hint || seen.has(h.code)) continue;
    const cap = keyCap(h.code);
    if (moveCaps.has(cap)) continue;
    seen.add(h.code);
    keys.push({ caps: [cap], label: h.label });
  }
  if (!seen.has('KeyG')) keys.push({ caps: ['G'], label: '그래픽 품질' });
  keys.push({ caps: ['Esc'], label: '창 닫기' });
  return [
    { title: '움직이기', icon: '🐾', rows: [...MOVE_ROWS] },
    { title: '바로 가기 키', icon: '⌨️', rows: keys },
  ];
}
