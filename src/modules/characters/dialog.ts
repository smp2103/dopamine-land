// 대화·우정 순수 로직(DOM·three 없음 — 테스트가 그대로 부른다).
// 대사 고르기(첫 만남 → 평소 + 시간대 + 섬 + 특별 대사), 말풍선 쪽 나누기, 타자기(한 글자씩) 계산,
// 우정 0~100(하트 = 20 마다 한 칸) · 선물 점수(좋아함 +5 / 보통 +2 / 싫어함 −1, 생일 ×3) · 선물 범주,
// flags.npc 저장 모양 정리 + 옛 id 옮기기(toto → res_toto_home, bori → npc_mongsil).
// P1: 이사(home·hx·hz), 우정 100 이사 제안(prop·pto)·사진 선물(photo), 감정 기록(memo), 통통 집 증축 대사, 고정 대사(pinned).
import type { GiftCat, NpcSocial } from './data';

// ───────────── 우정 ─────────────
/** flags.npc[id] 한 칸 */
export interface NpcFlag {
  /** 우정 0..100 */
  f: number;
  /** 처음 인사를 했나 */
  met: boolean;
  /** 마지막으로 말 건 게임 날(-1 = 아직) */
  last: number;
  /** 지금까지 받은 선물 수 */
  gifts: number;
  /** 선물 받은 마지막 날 · 그날 받은 수(하루 우정 상한용) */
  gday?: number;
  gtoday?: number;
  /** 이사 온 섬(없으면 원래 섬) + 집 자리 */
  home?: string;
  hx?: number;
  hz?: number;
  /** 우정 100 이사 제안: 1 기다림 · 2 이사함 · 3 끝(거절·이사 없는 NPC) */
  prop?: number;
  /** 제안한 섬 */
  pto?: string;
  /** 사진 선물을 받았나 */
  photo?: boolean;
  /** 작은 기록(프로 박사: 감정한 화석 id) */
  memo?: string[];
}

/** 이사 제안 단계 */
export const PROP_PENDING = 1, PROP_MOVED = 2, PROP_DONE = 3;
/** memo 최대 길이 */
export const MEMO_MAX = 200;

export const F_MAX = 100;
/** 하트 한 칸 = 우정 20 */
export const F_PER_HEART = 20;
/** 하루에 우정이 오르는 선물 수 */
export const GIFTS_PER_DAY = 2;

export const heartsOf = (f: number) => Math.max(0, Math.min(5, Math.floor(Math.max(0, f) / F_PER_HEART)));
export const clampF = (f: number) => Math.max(0, Math.min(F_MAX, Math.round(Number.isFinite(f) ? f : 0)));

export function emptyFlag(): NpcFlag { return { f: 0, met: false, last: -1, gifts: 0 }; }

/** 아무 모양(옛 저장·손상된 값)을 NpcFlag 로 */
export function normalizeFlag(x: unknown): NpcFlag {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const r: NpcFlag = {
    f: clampF(num(o.f, 0)),
    met: o.met === true,
    last: Math.floor(num(o.last, -1)),
    gifts: Math.max(0, Math.floor(num(o.gifts, 0))),
  };
  if (typeof o.gday === 'number') r.gday = Math.floor(o.gday);
  if (typeof o.gtoday === 'number') r.gtoday = Math.max(0, Math.floor(o.gtoday));
  if (typeof o.home === 'string' && o.home) r.home = o.home;
  if (typeof o.hx === 'number' && Number.isFinite(o.hx)) r.hx = o.hx;
  if (typeof o.hz === 'number' && Number.isFinite(o.hz)) r.hz = o.hz;
  if (typeof o.prop === 'number' && o.prop >= 1 && o.prop <= 3) r.prop = Math.floor(o.prop);
  if (typeof o.pto === 'string' && o.pto) r.pto = o.pto;
  if (o.photo === true) r.photo = true;
  if (Array.isArray(o.memo)) r.memo = o.memo.filter((x): x is string => typeof x === 'string').slice(-MEMO_MAX);
  return r;
}

/** 옛 id → 새 id(저장 옮기기) */
export const NPC_ID_MIGRATIONS: Readonly<Record<string, string>> = {
  toto: 'res_toto_home',
  bori: 'npc_mongsil',
};

/** 같은 주민 칸 두 개 합치기(옛 id·새 id 가 둘 다 있을 때) */
function mergeFlags(a: NpcFlag, b: NpcFlag): NpcFlag {
  const r: NpcFlag = { f: Math.max(a.f, b.f), met: a.met || b.met, last: Math.max(a.last, b.last), gifts: a.gifts + b.gifts };
  const gd = Math.max(a.gday ?? -1, b.gday ?? -1);
  if (gd >= 0) { r.gday = gd; r.gtoday = (a.gday === gd ? a.gtoday ?? 0 : 0) + (b.gday === gd ? b.gtoday ?? 0 : 0); }
  // 이사·제안·사진은 새 칸(b) 우선
  const home = b.home ? b : a.home ? a : null;
  if (home?.home) { r.home = home.home; if (home.hx != null) r.hx = home.hx; if (home.hz != null) r.hz = home.hz; }
  const prop = Math.max(a.prop ?? 0, b.prop ?? 0);
  if (prop) r.prop = prop;
  if (b.pto ?? a.pto) r.pto = b.pto ?? a.pto;
  if (a.photo || b.photo) r.photo = true;
  if (a.memo || b.memo) r.memo = [...new Set([...(a.memo ?? []), ...(b.memo ?? [])])].slice(-MEMO_MAX);
  return r;
}

/**
 * flags.npc 를 정리해 돌려준다(입력은 건드리지 않는다). 옛 id 는 새 id 로 옮기고, 둘 다 있으면 합친다.
 * changed = 저장을 다시 써야 하나.
 */
export function migrateNpcFlags(raw: unknown): { flags: Record<string, NpcFlag>; changed: boolean } {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Record<string, NpcFlag> = {};
  let changed = !(raw && typeof raw === 'object' && !Array.isArray(raw));
  for (const [k, v] of Object.entries(src)) {
    const id = NPC_ID_MIGRATIONS[k] ?? k;
    if (id !== k) changed = true;
    const f = normalizeFlag(v);
    if (JSON.stringify(f) !== JSON.stringify(v)) changed = true;
    out[id] = out[id] ? mergeFlags(out[id], f) : f;
  }
  return { flags: out, changed };
}

export interface FriendStep { flag: NpcFlag; before: number; after: number; heartsBefore: number; heartsAfter: number }
/** 우정 더하기(0..100 으로 자른다). 새 칸을 돌려준다 */
export function addFriend(flag: NpcFlag, delta: number): FriendStep {
  const before = flag.f;
  const after = clampF(before + delta);
  return { flag: { ...flag, f: after }, before, after, heartsBefore: heartsOf(before), heartsAfter: heartsOf(after) };
}

/** 오늘 처음 말 걸면 +1 */
export const talkGain = (flag: NpcFlag, day: number) => (flag.last === day ? 0 : 1);

/** 부탁을 들어주면 +5..10(부탁 id 로 고정 굴림) */
export function requestGain(rnd: () => number): number {
  return 5 + Math.min(5, Math.floor(rnd() * 6));
}

/** 생일: 게임 날 % 28 이 같은 날 */
export const isBirthdayToday = (birthday: number | null | undefined, day: number) =>
  typeof birthday === 'number' && Number.isFinite(birthday) && ((Math.floor(day) % 28) + 28) % 28 === ((Math.floor(birthday) % 28) + 28) % 28;

/** 28일 달력을 '봄 3일' 처럼(계절 7일씩) */
export function birthdayText(b: number): string {
  const d = ((Math.floor(b) % 28) + 28) % 28;
  return `${['봄', '여름', '가을', '겨울'][Math.floor(d / 7)]} ${(d % 7) + 1}일`;
}

/**
 * 선물 점수(GDD 4.6.1): 좋아하는 범주 +5, 싫어하는 범주 −1, 그 밖 +2. 생일이면 ×3.
 * 하루에 GIFTS_PER_DAY 개를 넘으면 0(받기는 받는다).
 */
export function giftDelta(cat: GiftCat, social: Pick<NpcSocial, 'likes' | 'dislikes'>, o: { birthday?: boolean; giftsToday?: number } = {}): number {
  if ((o.giftsToday ?? 0) >= GIFTS_PER_DAY) return 0;
  const base = social.likes.includes(cat) ? 5 : social.dislikes.includes(cat) ? -1 : 2;
  return o.birthday ? base * 3 : base;
}

/** 오늘 받은 선물 수(날이 바뀌면 0) */
export const giftsToday = (flag: NpcFlag, day: number) => (flag.gday === day ? flag.gtoday ?? 0 : 0);

/** 선물 하나 기록(받은 수만 — 우정은 addFriend 로 따로) */
export function recordGift(flag: NpcFlag, day: number): NpcFlag {
  return { ...flag, gifts: flag.gifts + 1, gday: day, gtoday: giftsToday(flag, day) + 1 };
}

const FRUIT = new Set(['m_apple', 'm_banana', 'm_cherry', 'm_coconut', 'm_date', 'm_frostberry', 'm_orange', 'm_peach', 'm_pear', 'm_starapple']);
const FLOWER = new Set(['m_cactusflower', 'm_moonflower', 'm_petal', 'm_fern', 'm_ginkgo', 'm_vine']);
const SHELL = new Set(['m_shell', 'm_coral', 'm_pearl', 'm_seaweed']);
const SWEET = new Set(['m_honey', 'm_mochi']);
const SHINY = new Set(['m_amber', 'm_gold', 'm_icecrystal', 'm_meteor', 'm_stardust', 'm_moonrock', 'm_sandglass']);
const MUSH = new Set(['m_glowcap', 'm_spore']);

/** 가방 키(변이 꼬리 포함 가능) → 선물 범주. species 는 state.species.get(id) */
export function giftCategory(bagKey: string, species?: { category?: string; tags?: string[] } | null): GiftCat {
  const at = bagKey.lastIndexOf('@');
  const id = at > 0 ? bagKey.slice(0, at) : bagKey;
  if (id.startsWith('t_') || species?.tags?.includes('junk')) return 'junk';
  if (id.startsWith('fos_') || species?.category === 'fossil') return 'fossil';
  // 생물은 도감 범주가 먼저(물고기 id 도 f_ 로 시작한다 — 가구 f_ 와 겹침)
  switch (species?.category) {
    case 'fish': return 'fish';
    case 'bug': return 'bug';
    case 'sea': return 'sea';
    case 'space': return 'space';
    case 'dino': return 'dino';
    default: break;
  }
  if (id.startsWith('f_')) return 'furniture';
  if (id.startsWith('cos_') || id.startsWith('skin_')) return 'clothes';
  if (FRUIT.has(id)) return 'fruit';
  if (FLOWER.has(id)) return 'flower';
  if (SHELL.has(id)) return 'shell';
  if (SWEET.has(id)) return 'sweet';
  if (SHINY.has(id)) return 'shiny';
  if (MUSH.has(id)) return 'mushroom';
  if (id.startsWith('m_')) return 'material';
  return 'item';
}

/** 선물에 쓰면 안 되는 것(도구·탈것 줄·해금 표) */
export const giftable = (bagKey: string) => !/^(tool_|v_|it_letter_|it_blackbox)/.test(bagKey);

export const GIFT_CAT_NAME: Readonly<Record<GiftCat, string>> = {
  fish: '물고기', bug: '곤충', sea: '바다 생물', space: '우주 생물', dino: '공룡 친구', fossil: '화석',
  fruit: '과일', flower: '꽃·풀', shell: '조개·산호', sweet: '달콤한 것', shiny: '반짝이는 것', mushroom: '버섯',
  material: '재료', junk: '잡동사니', furniture: '가구', clothes: '옷', item: '물건',
};

/** 선물 받은 반응 한 줄 */
export function giftReaction(delta: number, o: { birthday?: boolean; full?: boolean; c?: string } = {}): string {
  const c = o.c ? `, ${o.c}` : '';
  if (o.full) return `벌써 선물을 많이 받았는걸${c}! 마음만 받을게 💕`;
  if (o.birthday && delta > 0) return `내 생일 기억해 줬구나${c}! 평생 간직할게 🎂`;
  if (delta >= 5) return `우와아! 이거 정말 갖고 싶었어${c}! 💖`;
  if (delta < 0) return `어… 고, 고마워${c}… 😅`;
  return `고마워${c}! 소중히 할게 😊`;
}

// ───────────── 대사 ─────────────
export type TodName = 'morning' | 'day' | 'sunset' | 'night';

/** 말 거는 대상의 대사 묶음 */
export interface TalkDef {
  id: string;
  /** 말버릇 — 대사의 {c} 자리 */
  catchphrase: string;
  /** 첫 만남(순서대로 다) */
  first?: string[];
  /** 평소(하나 고른다) */
  usual: string[];
  /** 시간대 대사 */
  tod?: Partial<Record<TodName, string[]>>;
  /** 역할(특별 대사): 꽥사장 인기 생물 · 펭박사 로켓 · 몽실 뗏목 · 통통 집 증축 */
  role?: 'quack' | 'peng' | 'mongsil' | 'museum' | 'shipyard' | 'tongtong' | 'pro' | 'merchant' | 'owner';
}

export interface DialogCtx {
  met: boolean;
  /** 오늘 처음 말 거나 */
  firstToday: boolean;
  /** 지금 시간대(env 에서 매번 읽는다) */
  tod: string;
  rnd: () => number;
  /** 지난번 고른 평소 대사(같은 걸 연달아 안 하게) */
  last?: string | null;
  /** 오늘 인기 생물 이름(꽥사장) */
  hot?: string[];
  /** 로켓 부품(펭박사) */
  rocket?: { count: number; blueprint: boolean } | null;
  /** 뗏목을 이미 갖고 있나(몽실 힌트) */
  hasRaft?: boolean;
  /** 오늘 생일 */
  birthday?: boolean;
  /** 다른 모듈이 addDialog 로 넣은 대사 */
  extra?: string[];
  /** 고정 대사(addDialog pin — 이야기 체인): 말 걸 때마다 평소 대사 앞에 */
  pinned?: string[];
  /** 집 증축 단계 0..4(통통) */
  house?: number;
}

export interface DialogPick {
  /** 말풍선 쪽(순서대로) */
  pages: string[];
  /** 고른 평소 대사(다음 last) */
  line: string | null;
  /** 첫 만남 대사였나 */
  first: boolean;
}

/** 받침 있으면 a, 없으면 b(한글 아니면 b) — josa('고등어','이','가') = '가' */
export function josa(word: string, a: string, b: string): string {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return b;
  return code % 28 ? a : b;
}

/** 오늘의 인기 생물 한 줄(GDD 4.4 — "오늘은 고등어가 인기래!") */
export const hotLine = (name: string) => `오늘은 ${name}${josa(name, '이', '가')} 인기래!`;

/** 펭박사 로켓 부품 대사 */
export function rocketLine(r: { count: number; blueprint: boolean } | null | undefined): string {
  const n = Math.max(0, Math.min(6, Math.floor(r?.count ?? 0)));
  if (n >= 6) return '부품 여섯 개가 다 모였네! 발사대에서 만나세! 🚀';
  if (!r?.blueprint && n === 0) return '먼저 로켓 설계도가 있어야 하네. 내 가게에서 구해 보게! 지금 부품은 0/6개일세.';
  if (n === 0) return '설계도는 생겼고… 부품은 아직 0/6개일세. 섬마다 하나씩 숨어 있다네!';
  return `부품 ${n}/6개 모았네! 남은 ${6 - n}개도 부탁하네. 날개는 없지만 엔진은 있지!`;
}

/** 몽실 뗏목 힌트(GDD 4.6.3) */
export const RAFT_HINT = '뗏목 만들면 저 바다 너머도 갈 수 있대!';

/** 통통 집 증축 대사(house:1..4 단계) */
export function houseLine(stage: number | null | undefined): string {
  const n = Math.max(0, Math.min(4, Math.floor(stage ?? 0)));
  if (n <= 0) return '아직 텐트에서 자? 집 짓고 싶으면 나한테 말해, 뚝딱뚝딱!';
  if (n >= 4) return '네 집은 이제 섬에서 제일 멋진 집이야! 내 평생 최고 작품이지, 뚝딱!';
  return `지금 집이 ${n}단계구나! 방 하나 더 붙여 볼까? 뚝딱뚝딱!`;
}

const fill = (s: string, c: string) => s.replaceAll('{c}', c);

/** 말풍선 한 쪽 최대 글자(3줄) */
export const PAGE_MAX = 36;

/** 말풍선 한 쪽에 들어갈 만큼 문장 단위로 나눈다(한 쪽 최대 max 글자) */
export function paginate(text: string, max = PAGE_MAX): string[] {
  const t = text.trim();
  if (!t) return [];
  if (Array.from(t).length <= max) return [t];
  // 문장 끝(! ? . ~ …… 뒤 공백)에서 자른다
  const parts = t.match(/[^!?.~…]*(?:[!?.~…]+|$)\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [t];
  const out: string[] = [];
  let cur = '';
  const push = () => { if (cur) out.push(cur); cur = ''; };
  for (const p of parts) {
    const pl = Array.from(p).length;
    if (pl > max) {
      // 아주 긴 문장은 띄어쓰기에서 자른다
      push();
      let w = '';
      for (const word of p.split(' ')) {
        const cand = w ? `${w} ${word}` : word;
        if (Array.from(cand).length > max && w) { out.push(w); w = word; } else w = cand;
      }
      cur = w;
      continue;
    }
    const cand = cur ? `${cur} ${p}` : p;
    if (Array.from(cand).length > max) { push(); cur = p; } else cur = cand;
  }
  push();
  return out;
}

function pickNot(pool: string[], rnd: () => number, last?: string | null): string | null {
  if (!pool.length) return null;
  let i = Math.min(pool.length - 1, Math.floor(rnd() * pool.length));
  if (pool.length > 1 && pool[i] === last) i = (i + 1) % pool.length;
  return pool[i];
}

/**
 * 대사 고르기 — 첫 만남이면 first 전부(펭박사는 로켓 부품 수까지).
 * 아니면: 생일 인사 · 오늘 첫 대화 특별 대사(꽥사장 인기 생물, 몽실 뗏목 힌트) · 평소 하나(평소 + 시간대 + 추가 대사).
 * 펭박사는 늘 부품 수를 덧붙인다.
 */
export function selectDialog(def: TalkDef, c: DialogCtx, pageMax = PAGE_MAX): DialogPick {
  const cp = def.catchphrase;
  const pages: string[] = [];
  const add = (s: string) => { for (const p of paginate(fill(s, cp), pageMax)) pages.push(p); };
  if (!c.met && def.first?.length) {
    for (const s of def.first) add(s);
    if (def.role === 'peng') add(rocketLine(c.rocket));
    if (def.role === 'mongsil' && !c.hasRaft) add(RAFT_HINT);
    return { pages, line: null, first: true };
  }
  if (c.birthday && c.firstToday) add(`오늘은 내 생일이야, {c}! 🎂 와 줘서 고마워!`);
  // 이야기 체인 같은 고정 대사는 늘 먼저(평소 대사 하나는 그 뒤에 그대로)
  for (const l of c.pinned ?? []) add(l);
  let special = false;
  if (def.role === 'tongtong' && c.firstToday) { add(houseLine(c.house)); special = true; }
  if (def.role === 'quack' && c.hot?.length && c.firstToday) {
    add(`${hotLine(c.hot[0])} 두 배로 사 주지, 꽥!`);
    if (c.hot.length > 1) add(`오늘 인기 생물은 ${c.hot.join('·')}. 전부 두 배야!`);
    special = true;
  }
  if (def.role === 'mongsil' && c.firstToday && !c.hasRaft) { add(RAFT_HINT); special = true; }
  const tod = (['morning', 'day', 'sunset', 'night'] as const).includes(c.tod as TodName) ? (c.tod as TodName) : 'day';
  // 평소 대사는 두 배 가중(시간대·추가 대사보다 자주)
  const pool = [...def.usual, ...def.usual, ...(def.tod?.[tod] ?? []), ...(c.extra ?? [])];
  if (def.role === 'quack' && c.hot?.length && !c.firstToday) pool.push(`${hotLine(c.hot[Math.floor(c.rnd() * c.hot.length) % c.hot.length])} 꽥!`);
  const line = special && def.role !== 'peng' ? null : pickNot(pool, c.rnd, c.last);
  if (line) add(line);
  if (def.role === 'peng') add(rocketLine(c.rocket));
  return { pages, line, first: false };
}

// ───────────── 타자기 ─────────────
/** 초당 글자 수 */
export const TYPE_CPS = 22;
/** 글자 단위(한글 음절·이모지가 한 칸) */
export const glyphs = (s: string) => Array.from(s);
/** 지난 시간 → 보이는 글자 수 */
export function typedCount(text: string, elapsed: number, cps = TYPE_CPS): number {
  return Math.max(0, Math.min(glyphs(text).length, Math.floor(Math.max(0, elapsed) * cps)));
}
/** 다 친 뒤 머무는 시간(읽을 시간) */
export const pageHold = (text: string) => Math.min(3.4, 1.1 + glyphs(text).length * 0.045);
/** 한 쪽을 치고 머무는 데 드는 시간 */
export const pageDuration = (text: string, cps = TYPE_CPS) => glyphs(text).length / cps + pageHold(text);
/** 소리 나는 글자(공백·문장부호·이모지는 조용히) */
export const isBlipChar = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
/** 글자마다 살짝 다른 높이(목소리 voice 기준 ±8%) */
export function blipPitch(voice: number, ch: string): number {
  const k = ((ch.codePointAt(0) ?? 0) * 2654435761) >>> 0;
  return voice * (0.92 + ((k % 1000) / 1000) * 0.16);
}
