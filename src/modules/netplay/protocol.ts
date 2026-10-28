// netplay 통신 약속(버전 붙음) — 두 사람 사이에 오가는 쪽지 모양과 검사. 순수 함수만(DOM·three 없음).
// 쪽지 한 장 = JSON 한 줄 `{ v: PROTO, t: '<종류>', ... }`. 받은 쪽은 decodeMsg 로 모양·길이·숫자 범위를 다 걸러 낸다
// (친구가 보낸 것이라도 믿지 않는다 — 이상한 건 버린다).
//
// 종류
//   hello  {name, colors{tee, hair}, summary{dex, total, stars, coins, day}, role}      — 연결되자마자 서로 한 번
//   bye    {reason}                                                                      — 끊기 전 인사
//   ping   {t}  /  pong {t}                                                              — 살아 있나(2초마다)
//   pose   {t, x, y, z, yaw, m(움직임 모드), a(동작|null), w(세계), s(속도)}            — 10Hz
//   emote  {id}                                                                          — 이모트·스티커(EMOTES)
//   chat   {text, preset?}                                                               — 정해진 말(CHAT_PRESETS) 또는 40자 자유
//   gift   {gid, id, n}  /  gift-ack {gid, got}                                          — 선물(보낸 쪽 econ.spend → 받은 쪽 econ.give)
//   trade  {op, tid, items?, rev?, theirRev?, host?, guest?, ok?}                        — 교환 창(trade.ts 상태 기계)
//   gb-sign {text}  /  gb {entries}                                                      — 방명록(방장의 flags.net.guestbook)
//   app    {kind, data}                                                                  — netplay-play 같은 다른 모듈용 통로
// 버전: PROTO 가 같은 큰 버전끼리만 이야기한다(hello 에서 확인, 다르면 안내하고 끊는다).

/** 통신 약속 버전 — 쪽지 모양을 바꾸면 올린다 */
export const PROTO = 1;
/** 이보다 오래된 상대와는 못 논다 */
export const PROTO_MIN = 1;
/** 쪽지 한 장 최대 크기(글자) */
export const MAX_MSG = 64 * 1024;
/** 자유 채팅 최대 글자 수 */
export const CHAT_MAX = 40;
/** 이름 최대 글자 수 */
export const NAME_MAX = 10;
/** 방명록 최대 줄 수(오래된 것부터 지운다) */
export const GUESTBOOK_MAX = 50;
/** 선물·교환 한 번에 한 종류 최대 개수 */
export const ITEM_N_MAX = 99;
/** 교환 창 한쪽 최대 종류 수 */
export const TRADE_SLOTS = 6;

export type Role = 'host' | 'guest';
export type MoveMode = 'ground' | 'air' | 'glide' | 'swim' | 'dive' | 'mounted';
export const MOVE_MODES: readonly MoveMode[] = ['ground', 'air', 'glide', 'swim', 'dive', 'mounted'];

export interface Colors { tee: string; hair: string }
export interface SaveSummary { dex: number; total: number; stars: number; coins: number; day: number }
/** look: 꾸미기 모습 글자(encodeLook 'L1.xxxxxxx') — 옛 친구는 안 보내고, 받는 쪽은 색으로 짐작한다 */
export interface Profile { name: string; colors: Colors; look?: string }
export type Items = Record<string, number>;

/** 이모트·스티커: id → 머리 위 그림 + 아바타 포즈(있으면) */
export const EMOTES: ReadonlyArray<{ id: string; icon: string; label: string; pose?: string; sec?: number }> = [
  { id: 'wave', icon: '👋', label: '안녕', pose: 'wave', sec: 1.6 },
  { id: 'cheer', icon: '🎉', label: '만세', pose: 'cheer', sec: 1.6 },
  { id: 'peace', icon: '✌️', label: '브이', pose: 'peace', sec: 1.6 },
  { id: 'heart', icon: '💖', label: '좋아' },
  { id: 'laugh', icon: '😆', label: '깔깔' },
  { id: 'wow', icon: '😮', label: '우와' },
  { id: 'sad', icon: '🥲', label: '흑흑' },
  { id: 'sleep', icon: '💤', label: '졸려', pose: 'sleep', sec: 2.4 },
  { id: 'sit', icon: '🪑', label: '앉기', pose: 'sit', sec: 3 },
  { id: 'photo', icon: '📸', label: '찰칵', pose: 'photo', sec: 1.4 },
  { id: 'star', icon: '⭐', label: '별' },
  { id: 'fish', icon: '🐟', label: '물고기' },
];
export const emoteById = (id: string) => EMOTES.find((e) => e.id === id) ?? null;

/** 정해진 말(누르기만 하면 된다) */
export const CHAT_PRESETS: readonly string[] = [
  '안녕! 놀러 왔어 👋', '반가워!', '이리 와 봐!', '같이 낚시하자 🎣', '같이 곤충 잡자 🦋',
  '이거 선물이야 🎁', '고마워! 💕', '우와 대박!', '잠깐만 기다려!', '조금 있다 또 놀자',
  '여기 예쁘다 ✨', '배고파 🍎',
];

/** 방명록 한 줄 */
export interface GuestEntry { name: string; text: string; day: number; at: number; tee: string }

export type TradeOp = 'invite' | 'accept' | 'decline' | 'offer' | 'confirm' | 'unconfirm' | 'cancel' | 'commit' | 'done';
export const TRADE_OPS: readonly TradeOp[] = ['invite', 'accept', 'decline', 'offer', 'confirm', 'unconfirm', 'cancel', 'commit', 'done'];

export interface PoseMsg { t: 'pose'; ts: number; x: number; y: number; z: number; yaw: number; m: MoveMode; a: string | null; w: string; s: number }
export type Msg =
  | { t: 'hello'; v: number; name: string; colors: Colors; summary: SaveSummary; role: Role; look?: string }
  | { t: 'bye'; reason: string }
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }
  | PoseMsg
  | { t: 'emote'; id: string }
  | { t: 'chat'; text: string; preset?: number }
  | { t: 'gift'; gid: string; id: string; n: number }
  | { t: 'gift-ack'; gid: string; got: number }
  | { t: 'trade'; op: TradeOp; tid: string; items?: Items; rev?: number; theirRev?: number; host?: Items; guest?: Items; ok?: boolean }
  | { t: 'gb-sign'; text: string }
  | { t: 'gb'; entries: GuestEntry[] }
  | { t: 'app'; kind: string; data: unknown };
export type MsgType = Msg['t'];

// ───────────── 거르기 ─────────────
/** 꾸미기 모습 글자 모양(L<버전>.<칸들>[f]) */
const LOOK_RE = /^L\d{1,3}\.[0-9a-z]{1,24}f?$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** 숫자 범위 — 숫자가 아니면 null */
const numIn = (v: unknown, a: number, b: number): number | null => (fin(v) ? clamp(v, a, b) : null);

/** 조절 글자·폭 없는 글자·방향 글자(문자열로 만든다 — 줄 나눔 글자를 소스에 그대로 두지 않게) */
const CTRL_RE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]', 'g');
/** 보이지 않는 조절 글자·줄바꿈을 지우고 공백을 하나로, 앞뒤 공백 자르고, 글자(코드포인트) 수로 자른다 */
export function cleanText(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  const t = s.replace(CTRL_RE, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, max).join('').trim();
}
/** 채팅 글(40자) */
export const cleanChat = (s: unknown) => cleanText(s, CHAT_MAX);
/** 이름(10자, 비면 '친구') */
export const cleanName = (s: unknown) => cleanText(s, NAME_MAX) || '친구';
/** #rrggbb 만 */
export const cleanColor = (s: unknown, d: string) => (typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : d);

/** 아이템 id 모양(가방 키, 변이 꼬리 포함) */
export const ITEM_RE = /^[A-Za-z0-9_:-]{1,40}(@(shiny|crown|tiny))?$/;
export const isItemId = (s: unknown): s is string => typeof s === 'string' && ITEM_RE.test(s);
/** 짧은 id(gid·tid·app kind) */
const ID_RE = /^[A-Za-z0-9_:.-]{1,48}$/;
const isId = (s: unknown): s is string => typeof s === 'string' && ID_RE.test(s);
/** 개수: 1..ITEM_N_MAX 정수만 */
export const cleanN = (v: unknown): number | null => (fin(v) && Number.isInteger(v) && v >= 1 && v <= ITEM_N_MAX ? v : null);

/** 아이템 묶음 거르기 — 이상한 줄은 빼고, 최대 TRADE_SLOTS 종류 */
export function cleanItems(v: unknown): Items {
  const out: Items = {};
  if (!isObj(v)) return out;
  let k = 0;
  for (const [id, n] of Object.entries(v)) {
    if (k >= TRADE_SLOTS) break;
    const c = cleanN(n);
    if (!isItemId(id) || c === null) continue;
    out[id] = c;
    k++;
  }
  return out;
}

export const DEFAULT_COLORS: Colors = { tee: '#ff8e86', hair: '#784a2e' };
/** 고를 수 있는 옷·머리 색(GDD 0.5 파스텔) */
export const TEE_COLORS: readonly string[] = ['#ff8e86', '#ffb36b', '#ffd36b', '#8fdc9a', '#7cc8f0', '#a99cf0', '#ff9fd0', '#fff2e0'];
export const HAIR_COLORS: readonly string[] = ['#784a2e', '#3f3346', '#c98a4b', '#f2d27a', '#e88aa8', '#7aa0e8'];

function cleanSummary(v: unknown): SaveSummary {
  const d = isObj(v) ? v : {};
  const i = (x: unknown, max: number) => Math.round(numIn(x, 0, max) ?? 0);
  return { dex: i(d.dex, 9999), total: i(d.total, 9999), stars: i(d.stars, 1e9), coins: i(d.coins, 1e12), day: i(d.day, 1e7) };
}
function cleanEntry(v: unknown): GuestEntry | null {
  if (!isObj(v)) return null;
  const text = cleanChat(v.text);
  if (!text) return null;
  return { name: cleanName(v.name), text, day: Math.round(numIn(v.day, 0, 1e7) ?? 0), at: Math.round(numIn(v.at, 0, 1e15) ?? 0), tee: cleanColor(v.tee, DEFAULT_COLORS.tee) };
}
/** 방명록 묶음 거르기(최대 GUESTBOOK_MAX 줄, 뒤쪽이 최신) */
export function cleanGuestbook(v: unknown): GuestEntry[] {
  if (!Array.isArray(v)) return [];
  const out: GuestEntry[] = [];
  for (const e of v.slice(-GUESTBOOK_MAX)) { const c = cleanEntry(e); if (c) out.push(c); }
  return out;
}

/** 'app' 통로 data 는 JSON 이 되는 아무 값(크기는 MAX_MSG 가 막는다) */
function cleanApp(v: unknown): unknown { return v === undefined ? null : v; }

/** 쪽지 → 글. 늘 v 를 붙인다 */
export function encodeMsg(m: Msg): string {
  return JSON.stringify({ v: PROTO, ...m });
}

export type MsgDecode = { ok: true; msg: Msg } | { ok: false; err: 'size' | 'parse' | 'version' | 'type' | 'shape'; v?: number };

/** 글 → 쪽지(모양이 맞을 때만). 숫자는 범위로 자르고 글은 다듬는다 */
export function decodeMsg(raw: unknown): MsgDecode {
  if (typeof raw !== 'string') return { ok: false, err: 'parse' };
  if (raw.length > MAX_MSG) return { ok: false, err: 'size' };
  let d: unknown;
  try { d = JSON.parse(raw); } catch { return { ok: false, err: 'parse' }; }
  if (!isObj(d)) return { ok: false, err: 'parse' };
  const v = d.v;
  if (!fin(v) || v < PROTO_MIN || Math.floor(v) > PROTO) return { ok: false, err: 'version', v: fin(v) ? v : undefined };
  const bad = { ok: false as const, err: 'shape' as const };
  switch (d.t) {
    case 'hello': {
      const c = isObj(d.colors) ? d.colors : {};
      const role = d.role === 'host' || d.role === 'guest' ? d.role : null;
      if (!role) return bad;
      const msg: Msg = { t: 'hello', v: Math.floor(v), name: cleanName(d.name), colors: { tee: cleanColor(c.tee, DEFAULT_COLORS.tee), hair: cleanColor(c.hair, DEFAULT_COLORS.hair) }, summary: cleanSummary(d.summary), role };
      // 모습 글자는 모양만 본다(속뜻은 받는 아바타가 decodeLook 으로 — 이상하면 색으로 짐작)
      if (typeof d.look === 'string' && LOOK_RE.test(d.look)) msg.look = d.look;
      return { ok: true, msg };
    }
    case 'bye': return { ok: true, msg: { t: 'bye', reason: cleanText(d.reason, 40) } };
    case 'ping': case 'pong': {
      const ts = numIn(d.ts, 0, 1e15);
      return ts === null ? bad : { ok: true, msg: { t: d.t, ts } };
    }
    case 'pose': {
      const ts = numIn(d.ts, 0, 1e15), x = numIn(d.x, -1e6, 1e6), y = numIn(d.y, -1e5, 1e5), z = numIn(d.z, -1e6, 1e6), yaw = numIn(d.yaw, -1e3, 1e3);
      if (ts === null || x === null || y === null || z === null || yaw === null) return bad;
      const m = MOVE_MODES.includes(d.m as MoveMode) ? (d.m as MoveMode) : 'ground';
      const a = typeof d.a === 'string' && /^[a-z]{1,12}$/.test(d.a) ? d.a : null;
      const w = typeof d.w === 'string' && /^[a-z0-9_:-]{1,32}$/.test(d.w) ? d.w : 'earth';
      return { ok: true, msg: { t: 'pose', ts, x, y, z, yaw, m, a, w, s: numIn(d.s, 0, 200) ?? 0 } };
    }
    case 'emote': return isId(d.id) && emoteById(d.id) ? { ok: true, msg: { t: 'emote', id: d.id } } : bad;
    case 'chat': {
      const preset = fin(d.preset) && Number.isInteger(d.preset) && d.preset >= 0 && d.preset < CHAT_PRESETS.length ? d.preset : undefined;
      const text = preset !== undefined ? CHAT_PRESETS[preset] : cleanChat(d.text);
      if (!text) return bad;
      return { ok: true, msg: preset !== undefined ? { t: 'chat', text, preset } : { t: 'chat', text } };
    }
    case 'gift': {
      const n = cleanN(d.n);
      return isId(d.gid) && isItemId(d.id) && n !== null ? { ok: true, msg: { t: 'gift', gid: d.gid, id: d.id, n } } : bad;
    }
    case 'gift-ack': {
      const got = numIn(d.got, 0, ITEM_N_MAX);
      return isId(d.gid) && got !== null ? { ok: true, msg: { t: 'gift-ack', gid: d.gid, got: Math.floor(got) } } : bad;
    }
    case 'trade': {
      if (!TRADE_OPS.includes(d.op as TradeOp) || !isId(d.tid)) return bad;
      const m: Extract<Msg, { t: 'trade' }> = { t: 'trade', op: d.op as TradeOp, tid: d.tid };
      if (d.items !== undefined) m.items = cleanItems(d.items);
      if (d.host !== undefined) m.host = cleanItems(d.host);
      if (d.guest !== undefined) m.guest = cleanItems(d.guest);
      const rev = numIn(d.rev, 0, 1e9), theirRev = numIn(d.theirRev, 0, 1e9);
      if (rev !== null) m.rev = Math.floor(rev);
      if (theirRev !== null) m.theirRev = Math.floor(theirRev);
      if (typeof d.ok === 'boolean') m.ok = d.ok;
      return { ok: true, msg: m };
    }
    case 'gb-sign': {
      const text = cleanChat(d.text);
      return text ? { ok: true, msg: { t: 'gb-sign', text } } : bad;
    }
    case 'gb': return { ok: true, msg: { t: 'gb', entries: cleanGuestbook(d.entries) } };
    case 'app': return isId(d.kind) ? { ok: true, msg: { t: 'app', kind: d.kind, data: cleanApp(d.data) } } : bad;
    default: return { ok: false, err: 'type' };
  }
}

/** 연결 코드 안에 든 것(제안·답장) */
export interface SignalCode { k: 'offer' | 'answer'; v: number; sdp: string; name: string; at: number }
export function cleanSignal(v: unknown, want: 'offer' | 'answer'): SignalCode | null {
  if (!isObj(v) || v.k !== want || typeof v.sdp !== 'string' || v.sdp.length > 60000 || !v.sdp.startsWith('v=')) return null;
  return { k: want, v: fin(v.v) ? v.v : 0, sdp: v.sdp, name: cleanName(v.name), at: fin(v.at) ? v.at : 0 };
}
