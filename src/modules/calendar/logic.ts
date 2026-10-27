// calendar 순수 로직 — 아침 우편 만들기(날짜 시드 고정) · 우편함 읽음/받기 · 요일 이벤트 강제 날씨 계획 · 하루 루틴 진행 ·
// 꽃잎 자리 · 부표 선물. DOM·three·game 없이 테스트된다(flags.calendar 모양도 여기서 정한다).
import { DAY_SEC, HOUR_SEC, weekdayOf, type Weather } from '../../core/api';
import { weekdayEventOf, type WeekdayEventId } from '../../core/events';
import { islandName } from '../../core/world';
import {
  WEEKDAY_INFO, WEEKDAY_KO, EVENT_BOOSTS, SANDSTORM, METEOR_NIGHT, BUOY_LINKS, BUOY_GIFTS, BUOY_LINES,
  LETTERS, BIRTHDAY_LETTER, WELCOME, SPECIALTY_GIFTS, SMALL_GIFTS, BEST_GIFTS, LETTERS_PER_DAY, MAILBOX_KEEP,
  ROUTINE, type RoutineDef,
} from './data';

export type RngOf = (key: string) => () => number;

// ───────────── 모양 ─────────────
export interface MailAttach { id: string; n: number }
export interface ForecastRow { region: string; w: Weather[] }
/** 오늘의 소식(아침에 찍어 둔 것) */
export interface NewsData {
  hot: string[];
  mult?: Record<string, number>;
  guest: string | null;
  forecast: ForecastRow[];
  event: WeekdayEventId;
  tomorrow: WeekdayEventId;
}
export type MailKind = 'welcome' | 'letter' | 'birthday' | 'news' | 'event' | 'buoy';
export interface Mail {
  id: string;
  day: number;
  kind: MailKind;
  from: string;
  icon: string;
  title: string;
  text: string;
  /** 보낸 NPC id(주민 편지) */
  npc?: string;
  attach?: MailAttach[];
  /** 첨부를 다 받았나 */
  claimed?: boolean;
  read?: boolean;
  news?: NewsData;
  event?: WeekdayEventId;
}
/** 강제 날씨 하나(다시 불러오면 env 에 다시 건다 — env 강제는 저장되지 않는다) */
export interface ForceRec { key: string; region: string; w: Weather; until: number }
export interface RoutineState { day: number; c: Record<string, number>; done: string[]; bonus: boolean }

/** flags.calendar */
export interface CalFlags {
  v: 1;
  /** 우편함(새것이 앞) */
  box: Mail[];
  /** 마지막으로 아침 우편이 온 날(-1 = 아직) */
  lastMail: number;
  /** 첫 우편(환영 편지)을 보냈나 */
  welcomed: boolean;
  /** 지금 켜 둔 요일 이벤트 */
  ev: { day: number; id: WeekdayEventId } | null;
  /** 배너를 띄운 날 */
  banner: number;
  /** 살아 있는 강제 날씨 */
  force: ForceRec[];
  /** 이미 건 강제 날씨 키('sandtemple:2' …) — 최근 것만 */
  forceDone: string[];
  /** 오늘 주운 꽃잎 자리 */
  petals: { day: number; got: string[] };
  /** 부표: 들른 곳 · 선물 받은 날 */
  buoys: { seen: string[]; gift: Record<string, number> };
  routine: RoutineState;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);

/** flags.calendar 를 만들거나 고친다(모르는 값은 버린다) */
export function ensureCalFlags(flags: Record<string, unknown>): CalFlags {
  const raw = isObj(flags.calendar) ? flags.calendar : {};
  const box = Array.isArray(raw.box) ? (raw.box as unknown[]).filter((m): m is Mail => isObj(m) && typeof m.id === 'string' && typeof m.kind === 'string') : [];
  const ev = isObj(raw.ev) && typeof raw.ev.id === 'string' ? { day: num(raw.ev.day, -1), id: raw.ev.id as WeekdayEventId } : null;
  const force = Array.isArray(raw.force)
    ? (raw.force as unknown[]).filter((f): f is ForceRec => isObj(f) && typeof f.key === 'string' && typeof f.region === 'string' && typeof f.w === 'string' && typeof f.until === 'number')
    : [];
  const pet = isObj(raw.petals) ? raw.petals : {};
  const bu = isObj(raw.buoys) ? raw.buoys : {};
  const gift: Record<string, number> = {};
  if (isObj(bu.gift)) for (const [k, v] of Object.entries(bu.gift)) if (typeof v === 'number') gift[k] = v;
  const ro = isObj(raw.routine) ? raw.routine : {};
  const c: Record<string, number> = {};
  if (isObj(ro.c)) for (const [k, v] of Object.entries(ro.c)) if (typeof v === 'number' && Number.isFinite(v)) c[k] = v;
  const f: CalFlags = {
    v: 1,
    box,
    lastMail: num(raw.lastMail, -1),
    welcomed: raw.welcomed === true,
    ev,
    banner: num(raw.banner, -1),
    force,
    forceDone: strs(raw.forceDone),
    petals: { day: num(pet.day, -1), got: strs(pet.got) },
    buoys: { seen: strs(bu.seen), gift },
    routine: { day: num(ro.day, -1), c, done: strs(ro.done), bonus: ro.bonus === true },
  };
  flags.calendar = f;
  return f;
}

// ───────────── 아침 우편 ─────────────
/** 주민 한 명(ext.npc.list + friendship) */
export interface NpcLite { id: string; name: string; island: string; kind?: string; f: number; birthday?: number | null }
/** 아침 우편에 필요한 바깥 정보(그날 아침에 한 번 찍는다) */
export interface MailWorld {
  npcs: NpcLite[];
  hot: string[];
  mult?: Record<string, number>;
  guest: string | null;
  forecast: ForecastRow[];
  /** 환영 편지를 넣나(새 저장 첫 우편) */
  welcome: boolean;
}

export const heartsOf = (f: number) => Math.max(0, Math.min(5, Math.floor((Number(f) || 0) / 20)));
export type LetterTier = 'new' | 'friend' | 'best';
export const tierOf = (f: number): LetterTier => { const h = heartsOf(f); return h <= 1 ? 'new' : h <= 3 ? 'friend' : 'best'; };
export const isBirthdayOn = (b: number | null | undefined, day: number) =>
  typeof b === 'number' && Number.isFinite(b) && (((day % 28) + 28) % 28) === (((Math.floor(b) % 28) + 28) % 28);

const ICON: Record<string, string> = { home: '🏡', dino: '🦕', ice: '⛄', mushroom: '🍄', coral: '🐚', desert: '🏜️', launch: '🚀' };
const fill = (t: string, isl: string) => t.split('{isl}').join(islandName(isl));
const pickOne = <T>(r: () => number, a: readonly T[]): T => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
const intIn = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

/** 우정 단계별 첨부 */
export function letterAttach(tier: LetterTier, island: string, r: () => number): MailAttach[] {
  const spec = SPECIALTY_GIFTS[island] ?? SMALL_GIFTS;
  if (tier === 'new') return r() < 0.3 ? [{ id: pickOne(r, SMALL_GIFTS), n: intIn(r, 1, 3) }] : [];
  if (tier === 'friend') return r() < 0.75 ? [{ id: pickOne(r, spec), n: intIn(r, 1, 2) }] : [];
  const out: MailAttach[] = [{ id: pickOne(r, spec), n: intIn(r, 2, 3) }];
  if (r() < 0.3) out.push({ id: pickOne(r, BEST_GIFTS), n: 1 });
  return out;
}

/** 무게 비례로 k 명(겹치지 않게) */
function pickWeighted<T>(r: () => number, items: T[], w: (x: T) => number, k: number): T[] {
  const pool = items.map((x) => ({ x, w: Math.max(0, w(x)) })).filter((p) => p.w > 0);
  const out: T[] = [];
  while (out.length < k && pool.length) {
    const tot = pool.reduce((s, p) => s + p.w, 0);
    let u = r() * tot, i = 0;
    for (; i < pool.length - 1; i++) { u -= pool[i].w; if (u <= 0) break; }
    out.push(pool[i].x);
    pool.splice(i, 1);
  }
  return out;
}

/** 오늘의 요일 이벤트 공지 */
export function eventMail(day: number): Mail {
  const id = weekdayEventOf(day), info = WEEKDAY_INFO[id];
  const next = WEEKDAY_INFO[weekdayEventOf(day + 1)];
  return {
    id: `d${day}:event`, day, kind: 'event', from: '섬 소식지', icon: info.icon, event: id,
    title: `${WEEKDAY_KO[info.wd]}요일 이벤트 — ${info.name}`,
    text: `${info.desc}\n📍 ${info.where}\n내일(${WEEKDAY_KO[next.wd]})은 ${next.icon} ${next.name}!`,
  };
}

/** 오늘의 소식(인기 생물 3 · 날씨 예보 · 오늘의 손님) */
export function newsMail(day: number, w: Pick<MailWorld, 'hot' | 'mult' | 'guest' | 'forecast'>): Mail {
  const wd = weekdayOf(day);
  return {
    id: `d${day}:news`, day, kind: 'news', from: '도파민 섬 신문', icon: '📰',
    title: `오늘의 소식 · ${day + 1}일째 (${WEEKDAY_KO[wd]})`,
    text: '오늘의 인기 생물, 섬 날씨 예보, 오늘의 손님 생물이에요!',
    news: {
      hot: w.hot.slice(0, 3), mult: w.mult ? { ...w.mult } : undefined, guest: w.guest,
      forecast: w.forecast.map((f) => ({ region: f.region, w: [...f.w] })),
      event: weekdayEventOf(day), tomorrow: weekdayEventOf(day + 1),
    },
  };
}

/**
 * 그날 아침 우편 — 같은 날·같은 바깥 정보면 늘 같다(rng 키 `calendar:mail:<day>`).
 * 순서: 환영 → 요일 공지 → 오늘의 소식 → 생일 초대 → 주민 편지(우정에 비례, 하루 최대 2).
 */
export function morningMail(day: number, w: MailWorld, rngOf: RngOf): Mail[] {
  const out: Mail[] = [];
  if (w.welcome) {
    out.push({
      id: `d${day}:welcome`, day, kind: 'welcome', from: WELCOME.from, icon: WELCOME.icon, npc: WELCOME.npc,
      title: '말랑섬에 온 걸 환영해!', text: WELCOME.text, attach: WELCOME.attach.map((a) => ({ ...a })),
    });
  }
  out.push(eventMail(day));
  out.push(newsMail(day, w));
  // 생일 초대(우정과 상관없이 — 선물 들고 가면 생일 부탁이 기다린다)
  const npcs = [...w.npcs].sort((a, b) => a.id.localeCompare(b.id));
  const bday = npcs.filter((n) => isBirthdayOn(n.birthday, day));
  for (const n of bday) {
    out.push({
      id: `d${day}:bday:${n.id}`, day, kind: 'birthday', from: n.name, icon: '🎂', npc: n.id,
      title: `${n.name}의 생일 초대장`, text: fill(BIRTHDAY_LETTER, n.island),
    });
  }
  // 주민 편지
  const r = rngOf(`calendar:mail:${day}`);
  const cands = npcs.filter((n) => n.kind !== 'facility' && !bday.includes(n));
  const friends = cands.filter((n) => n.f > 0);
  let senders: NpcLite[];
  if (friends.length) {
    const k = Math.min(LETTERS_PER_DAY, 1 + (r() < 0.45 ? 1 : 0));
    senders = pickWeighted(r, friends, (n) => 1 + heartsOf(n.f) * 1.5, k);
  } else {
    // 아직 친구가 없으면 가끔 처음 보는 이웃이 인사 편지를
    senders = cands.length && r() < 0.35 ? [pickOne(r, cands)] : [];
  }
  for (const n of senders) {
    const lr = rngOf(`calendar:mail:${day}:${n.id}`);
    const tier = tierOf(n.f);
    const attach = letterAttach(tier, n.island, lr);
    out.push({
      id: `d${day}:letter:${n.id}`, day, kind: 'letter', from: n.name, icon: ICON[n.island] ?? '💌', npc: n.id,
      title: tier === 'best' ? `단짝 ${n.name}의 편지 💖` : tier === 'friend' ? `${n.name}의 편지` : `${n.name}이(가) 보낸 첫 편지`,
      text: fill(pickOne(lr, LETTERS[tier]), n.island),
      ...(attach.length ? { attach } : {}),
    });
  }
  return out;
}

// ───────────── 우편함 ─────────────
export const unreadCount = (box: readonly Mail[]) => box.reduce((s, m) => s + (m.read ? 0 : 1), 0);
export const hasGift = (m: Mail) => !!m.attach?.length && !m.claimed;
export const giftCount = (box: readonly Mail[]) => box.reduce((s, m) => s + (hasGift(m) ? 1 : 0), 0);

/** 우편 넣기(같은 id 는 건너뜀) — 새것이 앞, MAILBOX_KEEP 넘으면 오래된 다 읽은 것부터 버린다. 넣은 수 */
export function addMails(f: CalFlags, mails: readonly Mail[], keep = MAILBOX_KEEP): number {
  const have = new Set(f.box.map((m) => m.id));
  const fresh = mails.filter((m) => !have.has(m.id));
  f.box = [...fresh, ...f.box];
  while (f.box.length > keep) {
    // 뒤(오래된 쪽)에서 읽었고 받을 것 없는 편지 → 없으면 그냥 가장 오래된 것
    let i = -1;
    for (let k = f.box.length - 1; k >= 0; k--) if (f.box[k].read && !hasGift(f.box[k])) { i = k; break; }
    f.box.splice(i >= 0 ? i : f.box.length - 1, 1);
  }
  return fresh.length;
}

/** 첨부 받기 — give 가 실제로 넣은 수만큼 덜어 낸다(가방이 차면 남는다). 받은 것 */
export function claimMail(m: Mail, give: (id: string, n: number) => number): MailAttach[] {
  if (!m.attach?.length || m.claimed) return [];
  const got: MailAttach[] = [];
  const left: MailAttach[] = [];
  for (const a of m.attach) {
    let g = 0;
    try { g = Math.max(0, Math.min(a.n, Math.floor(give(a.id, a.n)) || 0)); } catch { g = 0; }
    if (g > 0) got.push({ id: a.id, n: g });
    if (g < a.n) left.push({ id: a.id, n: a.n - g });
  }
  if (left.length) m.attach = left;
  else m.claimed = true;
  return got;
}

/** 아침 우편이 올 때인가: 오늘 아직 안 왔고, 5시가 지났거나 첫 우편 */
export const mailDue = (f: CalFlags, day: number, hour: number, mailHour: number) =>
  day > f.lastMail && (hour >= mailHour || f.lastMail < 0);

// ───────────── 요일 이벤트 ─────────────
export const eventOf = (day: number): WeekdayEventId => weekdayEventOf(day);
/** 출현 배율 — 그날 이벤트가 켜져 있을 때만 */
export function boostsFor(id: WeekdayEventId | null | undefined, active: boolean): Record<string, number> {
  if (!id || !active) return {};
  return { ...(EVENT_BOOSTS[id] ?? {}) };
}

/**
 * 지금(gameSec) 걸려 있어야 할 요일 강제 날씨.
 * - 수요일(모래폭풍): 그날 05~23시 사이 처음 본 순간부터 6시간(키 `sandtemple:<day>`). 시작 시각은 부르는 쪽이 정한다 → 여기선 '걸 수 있나'만.
 * - 일요일(유성우): 21시 ~ 다음 날 05시(키 `meteor:<day>`). 월요일 새벽에 처음 봐도 남은 만큼.
 */
export function forcePlans(gameSec: number): Array<{ key: string; region: string; w: Weather; until: number; hours: number }> {
  const day = Math.floor(gameSec / DAY_SEC);
  const hour = (gameSec - day * DAY_SEC) / HOUR_SEC;
  const out: Array<{ key: string; region: string; w: Weather; until: number; hours: number }> = [];
  if (weekdayOf(day) === 2 && hour >= SANDSTORM.from && hour < 23) {
    const until = gameSec + SANDSTORM.hours * HOUR_SEC;
    out.push({ key: `sandtemple:${day}`, region: SANDSTORM.region, w: SANDSTORM.w, until, hours: SANDSTORM.hours });
  }
  // 일요일 밤(그날 21시~) 또는 월요일 새벽(전날 일요일의 밤 블록 꼬리)
  const sunday = weekdayOf(day) === 6 && hour >= METEOR_NIGHT.from ? day : weekdayOf(day) === 0 && hour < METEOR_NIGHT.to - 24 ? day - 1 : null;
  if (sunday !== null) {
    const until = sunday * DAY_SEC + METEOR_NIGHT.to * HOUR_SEC;
    if (until > gameSec) out.push({ key: `meteor:${sunday}`, region: METEOR_NIGHT.region, w: METEOR_NIGHT.w, until, hours: (until - gameSec) / HOUR_SEC });
  }
  return out;
}

// ───────────── 하루 루틴 ─────────────
export interface RoutineRow { def: RoutineDef; have: number; goal: number; done: boolean }
/** 날이 바뀌었으면 비운다. 바뀌었으면 true */
export function rollRoutine(f: CalFlags, day: number): boolean {
  if (f.routine.day === day) return false;
  f.routine = { day, c: {}, done: [], bonus: false };
  return true;
}
export const bumpRoutine = (f: CalFlags, key: string, n = 1) => { f.routine.c[key] = (f.routine.c[key] ?? 0) + n; };
export function routineRows(c: Record<string, number>): RoutineRow[] {
  return ROUTINE.map((def) => {
    const goal = def.parts.reduce((s, p) => s + p.goal, 0);
    const have = def.parts.reduce((s, p) => s + Math.min(p.goal, c[p.key] ?? 0), 0);
    return { def, have, goal, done: have >= goal };
  });
}
/** 새로 끝난 루틴 id(done 에 적어 둔다) */
export function newlyDone(f: CalFlags): RoutineDef[] {
  const out: RoutineDef[] = [];
  for (const r of routineRows(f.routine.c)) {
    if (r.done && !f.routine.done.includes(r.def.id)) { f.routine.done.push(r.def.id); out.push(r.def); }
  }
  return out;
}

// ───────────── 꽃잎 자리 ─────────────
/** 청크 하나의 꽃잎 소용돌이 자리(시드 고정) — accept 로 섬·구역을 거른다 */
export function petalSpots(cx: number, cz: number, size: number, rngOf: RngOf, accept: (x: number, z: number) => boolean, tries = 7): Array<{ key: string; x: number; z: number }> {
  const r = rngOf(`calendar-petals:${cx},${cz}`);
  const out: Array<{ key: string; x: number; z: number }> = [];
  for (let i = 0; i < tries; i++) {
    const x = cx * size + (0.08 + r() * 0.84) * size, z = cz * size + (0.08 + r() * 0.84) * size;
    if (!accept(x, z)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 9)) continue;
    out.push({ key: `${cx},${cz}:${i}`, x, z });
  }
  return out;
}
/** 꽃잎 하나 주울 때 몇 장(자리마다 고정 1~2) */
export const petalAmount = (key: string, day: number, rngOf: RngOf) => (rngOf(`calendar-petal-n:${day}:${key}`)() < 0.35 ? 2 : 1);

// ───────────── 부표 우체통 ─────────────
/** 이 부표에 그 섬으로 가는 편지를 넣을 수 있나(잇는 섬이거나, 그 섬을 잇는 부표가 하나도 없으면 아무 데나) */
export function buoyAccepts(buoyId: string, to: string | undefined | null): boolean {
  if (!to) return false;
  const links = BUOY_LINKS[buoyId];
  if (links?.includes(to)) return true;
  return !Object.values(BUOY_LINKS).some((l) => l.includes(to));
}
/** 그날 부표 선물(부표·날짜 시드 고정) */
export function buoyGift(buoyId: string, day: number, rngOf: RngOf): { line: string; attach: MailAttach[] } {
  const r = rngOf(`calendar:buoy:${buoyId}:${day}`);
  const line = pickOne(r, BUOY_LINES);
  const tot = BUOY_GIFTS.reduce((s, g) => s + g.w, 0);
  let u = r() * tot;
  let g = BUOY_GIFTS[BUOY_GIFTS.length - 1];
  for (const x of BUOY_GIFTS) { u -= x.w; if (u <= 0) { g = x; break; } }
  return { line, attach: [{ id: g.id, n: intIn(r, g.n[0], g.n[1]) }] };
}
