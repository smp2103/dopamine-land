// 주민 부탁(GDD 4.6.1)·오늘의 손님 생물(4.4) — 게임 날짜로 시드 고정. 부수효과 없는 순수 모듈.
// 게시판은 하루 3개, 주민은 한 명당 하루 1개(requestsFor). 완료 판정·보상 지급은 economy.ts 가 한다.
import type { EconRequest } from '../../core/api';
import { nearestPalette, type PaletteName } from '../../core/art';
import { ISLANDS, islandName } from '../../core/world';
import { MATERIALS, RECIPES, round10 } from './data';
import type { RollSpecies } from './roll';
import { rotatePick } from './price';

export type ReqKind = 'species' | 'materials' | 'color' | 'rarity' | 'furniture' | 'night' | 'letter' | 'birthday';

/** 부탁 종 모양(Species 의 부분) */
export interface ReqSpecies extends RollSpecies {
  name?: string;
  price?: number;
  p1?: boolean;
  witness?: boolean;
  look?: { c1?: string; colors?: unknown[]; [k: string]: unknown };
  /** 낚시 데이터의 하루 시간대(all·day·night·morning·evening) — where 가 없을 때 쓴다 */
  time?: string;
}

/** 덤 보상(4.6.1 — 레시피 카드·감사 편지 가구·캡슐 티켓·열쇠 조각) */
export interface ReqBonus { kind: 'recipe' | 'furniture' | 'capsule' | 'keypiece'; id: string; n: number; name: string }

/** 부탁 한 장(EconRequest + 템플릿 정보) */
export interface Req extends EconRequest {
  kind: ReqKind;
  /** 말풍선 한 줄 */
  text: string;
  /** '아무거나' 조건(색·희귀도) — item 대신 */
  any?: { color?: ColorFamily; minRarity?: number; cats?: string[] };
  /** 편지 받을 섬(⑦) */
  to?: string;
  /** 같이 갈 곳·시간(⑥) */
  at?: { island: string; tod: 'night' };
  bonus?: ReqBonus;
  birthday?: boolean;
  /** 지금 가진 수(economy 가 부를 때마다 채운다) */
  have?: number;
}

/** 생성에 필요한 바깥 정보 */
export interface ReqWorld {
  day: number;
  hour: number;
  tod: string;
  weather: string;
  species: ReqSpecies[];
  /** 아직 모르는 레시피 카드(덤으로 줄 수 있는 것) */
  unknownCards?: string[];
}
export interface ReqNpc { id: string; name?: string; island?: string; birthday?: number | null }

// ── 색 묶음(③) ──
export type ColorFamily = 'blue' | 'pink' | 'yellow' | 'green' | 'purple' | 'red' | 'white';
export const COLOR_FAMILY: Readonly<Record<ColorFamily, { name: string; icon: string; palette: PaletteName[] }>> = {
  blue: { name: '파란', icon: '💙', palette: ['sky', 'blue', 'navy', 'teal'] },
  pink: { name: '분홍', icon: '🩷', palette: ['pink', 'lightPink', 'magenta'] },
  yellow: { name: '노란', icon: '💛', palette: ['yellow', 'gold', 'cream'] },
  green: { name: '초록', icon: '💚', palette: ['lime', 'green', 'olive', 'neon', 'mint'] },
  purple: { name: '보라', icon: '💜', palette: ['purple', 'lavender'] },
  red: { name: '빨간', icon: '❤️', palette: ['red', 'orange', 'coral', 'apricot'] },
  white: { name: '하얀', icon: '🤍', palette: ['white', 'silver', 'beige', 'sand'] },
};
/** 종의 바탕색 — look.c1, 없으면 낚시·곤충의 look.colors[0], 그다음 look.color·body */
function baseColorOf(look: Record<string, unknown> | undefined): unknown {
  if (!look) return undefined;
  if (look.c1 != null) return look.c1;
  if (Array.isArray(look.colors) && look.colors.length) return look.colors[0];
  return look.color ?? look.body;
}
/** 종의 바탕색 묶음 */
export function colorFamilyOf(s: { look?: object } | undefined | null): ColorFamily | null {
  const c = baseColorOf(s?.look as Record<string, unknown> | undefined);
  if (typeof c !== 'string' && typeof c !== 'number') return null;
  let p: PaletteName;
  try { p = nearestPalette(c); } catch { return null; }
  for (const [k, f] of Object.entries(COLOR_FAMILY) as Array<[ColorFamily, (typeof COLOR_FAMILY)[ColorFamily]]>) if (f.palette.includes(p)) return k;
  return null;
}

/** 생물(도감 칸이 있는 것)인가 — 부탁 대상 */
const CREATURE_CATS = ['fish', 'bug', 'insect', 'sea'];
const isAsked = (s: ReqSpecies) => CREATURE_CATS.includes(s.category ?? '') && !s.p1 && !s.witness && !s.tags?.includes('vehicle') && !s.tags?.includes('mimic') && s.rarity >= 1;
const CAT_NAME: Record<string, string> = { fish: '물고기', bug: '곤충', insect: '곤충', sea: '바다 생물' };

/** '아무거나' 조건에 맞는 종인가 */
export function matchesAny(any: NonNullable<Req['any']>, s: ReqSpecies | undefined | null): boolean {
  if (!s || !isAsked(s)) return false;
  if (any.cats && !any.cats.includes(s.category ?? '')) return false;
  if (any.minRarity != null && s.rarity < any.minRarity) return false;
  if (any.color && colorFamilyOf(s) !== any.color) return false;
  return true;
}

/** 부탁 재료 후보(돌·나무처럼 줍는 것 — 우주 물건·쓰레기·잡동사니·비싼 것 빼고) */
export const REQ_MATERIALS: string[] = MATERIALS.filter((m) => !m.noSell && m.price <= 300 && !m.tags.some((t) => t === 'junk' || t === 'misc' || t === 'space-goods')).map((m) => m.id);
/** 생일 선물 후보(과일·꽃잎·꿀) */
const GIFT_ITEMS = ['m_apple', 'm_peach', 'm_cherry', 'm_orange', 'm_pear', 'm_petal', 'm_honey', 'm_coconut', 'm_banana'];
/** 가구 부탁 — 작업대 가구 레시피(f_* 를 주는 것) */
export const REQ_FURNITURE: Array<{ rid: string; item: string; name: string }> = RECIPES
  .filter((r) => r.kind === '가구' && (r.gate === 'base' || r.extra))
  .map((r) => ({ rid: r.id, item: Object.keys(r.gives)[0] ?? '', name: r.name }))
  .filter((x) => x.item.startsWith('f_'));
const matName = (id: string) => MATERIALS.find((m) => m.id === id)?.name ?? id;

const clampCoins = (v: number) => round10(Math.min(3000, Math.max(300, v)));
const int = (u: number, a: number, b: number) => a + Math.floor(u * (b - a + 1));

/** 큰 섬 중 가장 가까운 다른 섬(편지 배달) */
export function neighbourIsland(from: string): string {
  const mains = ISLANDS.filter((d) => d.theme !== 'islet');
  const a = mains.find((d) => d.id === from) ?? mains[0];
  let best = mains.find((d) => d.id !== a.id)!, bd = Infinity;
  for (const d of mains) {
    if (d.id === a.id) continue;
    const dd = Math.hypot(d.x - a.x, d.z - a.z);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best.id;
}

/** 덤 보상 굴리기 */
function rollBonus(rng: () => number, unknownCards: string[] | undefined, force?: ReqBonus['kind']): ReqBonus | undefined {
  const u = force ? -1 : rng();
  const pick = force ?? (u < 0.42 ? null : u < 0.6 ? 'recipe' : u < 0.74 ? 'furniture' : u < 0.87 ? 'capsule' : 'keypiece');
  if (!pick) return undefined;
  if (pick === 'recipe') {
    const list = unknownCards ?? [];
    if (!list.length) return { kind: 'capsule', id: 'it_capsule', n: 1, name: '캡슐 티켓' };
    const rid = list[Math.floor(rng() * list.length)];
    return { kind: 'recipe', id: `recipe:${rid}`, n: 1, name: `레시피 카드: ${RECIPES.find((r) => r.id === rid)?.name ?? rid}` };
  }
  if (pick === 'furniture') return { kind: 'furniture', id: 'f_thanks_letter', n: 1, name: '감사 편지 액자' };
  if (pick === 'capsule') return { kind: 'capsule', id: 'it_capsule', n: 1, name: '캡슐 티켓' };
  const gold = rng() < 0.2;
  return { kind: 'keypiece', id: gold ? 'key:gold' : 'key:silver', n: 1, name: gold ? '금열쇠 조각' : '은열쇠 조각' };
}

/** 종의 하루 시간대(where.time 들 + 낚시 time) — 종일이면 null */
export function timesOf(s: ReqSpecies): string[] | null {
  const ts: string[] = [];
  let all = false;
  if (s.where?.length) {
    for (const wl of s.where) {
      if (wl.time == null) { all = true; continue; }
      const l = Array.isArray(wl.time) ? wl.time : [wl.time];
      if (!l.length || l.some((t) => ALL_TIME.has(t))) all = true; else ts.push(...l);
    }
  } else if (typeof s.time === 'string' && !ALL_TIME.has(s.time)) ts.push(s.time);
  else all = true;
  return all || !ts.length ? null : [...new Set(ts)];
}
const ALL_TIME = new Set(['all', 'any', 'always', '종일']);
const TIME_HINT: Record<string, string> = { morning: '아침', day: '낮', evening: '저녁', sunset: '저녁', night: '밤', noon: '정오', midnight: '자정' };
/** 시간대 귀띔 한 마디('밤에 나온대!') — 종일이면 빈 문자열 */
function timeHint(s: ReqSpecies): string {
  const ts = timesOf(s);
  if (!ts) return '';
  const names = [...new Set(ts.map((t) => TIME_HINT[t]).filter(Boolean))];
  return names.length ? ` ${names.join('·')}에 나온대!` : '';
}

/**
 * 오늘 잡을 수 있는 종(①) — 공룡·P1·목격 종 빼고.
 * 지금 시각·날씨는 보지 않는다: 같은 날이면 몇 시에 불러도(새로고침해도) 같은 부탁이 나와야 해서
 * 하루 중 언젠가 나오는 종 전부가 후보다. 시간대가 정해진 종은 말풍선에 '밤에 나온대!' 를 붙인다.
 * 날씨 전용 줄(weather.only)만 있는 종은 그 날씨가 아닐 수도 있으니 뺀다.
 */
export function availableToday(w: Pick<ReqWorld, 'species'>, maxRarity = 4): ReqSpecies[] {
  return w.species.filter((s) => isAsked(s) && s.rarity <= maxRarity
    && (!s.where?.length || s.where.some((wl) => !wl.weather?.only?.length)));
}
/** @deprecated availableToday — 옛 이름 */
export const availableNow = availableToday;

/** 템플릿 하나로 부탁 만들기 — 못 만들면 null(다른 템플릿으로) */
export function makeRequest(kind: ReqKind, id: string, w: ReqWorld, rng: () => number, npc?: ReqNpc, exclude: ReadonlySet<string> = new Set()): Req | null {
  const base = { id, npc: npc?.id, done: false };
  const island = npc?.island ?? 'home';
  switch (kind) {
    case 'species': {
      const c = availableToday(w).filter((s) => !exclude.has(s.id)).sort((a, b) => a.id.localeCompare(b.id));
      if (!c.length) return null;
      const s = c[Math.floor(rng() * c.length)];
      const reward = clampCoins((s.price ?? 200) * 1.6 + 200);
      return { ...base, kind, species: s, n: 1, reward, stars: Math.max(1, Math.min(5, s.rarity)), text: `${s.name ?? s.id} 보고 싶어! 잡아다 줄래? 🥺${timeHint(s)}`, bonus: rollBonus(rng, w.unknownCards) };
    }
    case 'materials': {
      const c = REQ_MATERIALS.filter((m) => !exclude.has(m));
      if (!c.length) return null;
      const item = c[Math.floor(rng() * c.length)];
      const price = MATERIALS.find((m) => m.id === item)?.price ?? 30;
      return { ...base, kind, item, n: 3, reward: clampCoins(price * 3 * 2 + 300), stars: 1, text: `${matName(item)} 3개 가져다줄래? 🧺`, bonus: rollBonus(rng, w.unknownCards) };
    }
    case 'color': {
      const fams = (Object.keys(COLOR_FAMILY) as ColorFamily[]).filter((f) => w.species.filter((s) => isAsked(s) && s.rarity <= 3 && colorFamilyOf(s) === f).length >= 2);
      if (!fams.length) return null;
      const f = fams[Math.floor(rng() * fams.length)];
      return { ...base, kind, item: `any:color:${f}`, any: { color: f }, n: 1, reward: clampCoins(int(rng(), 500, 900)), stars: 2, text: `${COLOR_FAMILY[f].name} 거 아무거나! 생물이면 다 좋아 ${COLOR_FAMILY[f].icon}`, bonus: rollBonus(rng, w.unknownCards) };
    }
    case 'rarity': {
      const cats = rng() < 0.6 ? ['fish'] : ['bug', 'insect'];
      return { ...base, kind, item: `any:rarity3:${cats[0]}`, any: { minRarity: 3, cats }, n: 1, reward: clampCoins(int(rng(), 1200, 2000)), stars: 3, text: `★3 이상 ${CAT_NAME[cats[0]]}! 반짝반짝한 걸로 ✨`, bonus: rollBonus(rng, w.unknownCards) };
    }
    case 'furniture': {
      const c = REQ_FURNITURE.filter((f) => !exclude.has(f.item));
      if (!c.length) return null;
      const f = c[Math.floor(rng() * c.length)];
      return { ...base, kind, item: f.item, n: 1, reward: clampCoins(int(rng(), 1000, 2500)), stars: 2, text: `우리 집에 ${f.name} 놔줘! 작업대에서 만들 수 있대 🏠`, bonus: rollBonus(rng, w.unknownCards, 'furniture') };
    }
    case 'night': {
      return { ...base, kind, item: `night:${island}`, at: { island, tod: 'night' }, n: 1, reward: clampCoins(int(rng(), 800, 1500)), stars: 2, text: `오늘 밤 ${islandName(island)}에서 같이 반딧불 보러 가자 🌙`, bonus: rollBonus(rng, w.unknownCards) };
    }
    case 'letter': {
      const to = neighbourIsland(island);
      const no = 1 + Math.floor(rng() * 999);
      return { ...base, kind, item: `it_letter_${no}`, to, n: 1, reward: clampCoins(int(rng(), 1500, 3000)), stars: 3, text: `${islandName(to)}에 사는 친구한테 편지 좀 전해 줄래? 💌`, bonus: rollBonus(rng, w.unknownCards) };
    }
    case 'birthday': {
      const item = GIFT_ITEMS[Math.floor(rng() * GIFT_ITEMS.length)];
      return { ...base, kind, item, n: 1, birthday: true, reward: clampCoins(int(rng(), 600, 1000) * 3), stars: 3, text: `오늘 내 생일이야! 선물로 ${matName(item)} 주면 좋겠다 🎂`, bonus: rollBonus(rng, w.unknownCards, 'furniture') };
    }
  }
}

/** 게시판 하루 3장 — 게시판 창이 가방 수로 셀 수 있는 템플릿(종·재료·가구)만 */
export function boardRequests(w: ReqWorld, rngFor: (key: string) => () => number, npcs: ReqNpc[] = []): Req[] {
  const r = rngFor(`req:${w.day}`);
  const kinds: ReqKind[] = ['species', 'species', r() < 0.3 ? 'furniture' : 'materials'];
  const out: Req[] = [];
  const used = new Set<string>();
  kinds.forEach((k, i) => {
    const npc = npcs.length ? npcs[Math.floor(r() * npcs.length)] : undefined;
    const rq = makeRequest(k, `req:${w.day}:b${i}`, w, rngFor(`req:${w.day}:b${i}`), npc, used)
      ?? makeRequest('materials', `req:${w.day}:b${i}`, w, rngFor(`req:${w.day}:b${i}:m`), npc, used);
    if (!rq) return;
    used.add(rq.species?.id ?? rq.item ?? '');
    out.push(rq);
  });
  return out;
}

/** 주민 템플릿 가중치(①~⑦, ⑧ 은 생일에만) */
const NPC_KINDS: ReadonlyArray<{ kind: ReqKind; w: number }> = [
  { kind: 'species', w: 3 }, { kind: 'materials', w: 3 }, { kind: 'color', w: 2 }, { kind: 'rarity', w: 2 },
  { kind: 'furniture', w: 1 }, { kind: 'night', w: 1 }, { kind: 'letter', w: 1.5 },
];
/** 생일인가 — 생일은 게임 날짜 % 28 */
export const isBirthday = (b: number | null | undefined, day: number) => typeof b === 'number' && Number.isFinite(b) && ((day % 28) + 28) % 28 === ((Math.floor(b) % 28) + 28) % 28;

/** 주민 한 명의 오늘 부탁(1개) */
export function residentRequest(w: ReqWorld, npc: ReqNpc, rngFor: (key: string) => () => number): Req | null {
  const id = `req:${w.day}:npc:${npc.id}`;
  const r = rngFor(id);
  if (isBirthday(npc.birthday, w.day)) {
    const b = makeRequest('birthday', id, w, r, npc);
    if (b) return b;
  }
  const total = NPC_KINDS.reduce((a, k) => a + k.w, 0);
  let x = r() * total, kind: ReqKind = 'species';
  for (const k of NPC_KINDS) { x -= k.w; if (x < 0) { kind = k.kind; break; } }
  return makeRequest(kind, id, w, r, npc) ?? makeRequest('materials', id, w, r, npc);
}

// ── 오늘의 손님 생물(4.4) ──

/** 손님 후보: 물고기·곤충·바다 ★2~4(낚시·바다 데이터엔 where 가 없어도 된다 — 서식지·시간은 각 모듈이 본다) */
export function guestPool(species: ReqSpecies[]): string[] {
  return species.filter((s) => isAsked(s) && s.rarity >= 2 && s.rarity <= 4).map((s) => s.id).sort();
}
/** 오늘의 손님(하루 한 종, 어제와 다르게) */
export function pickGuest(species: ReqSpecies[], day: number, rngFor: (key: string) => () => number): string | null {
  const pool = guestPool(species);
  if (!pool.length) return null;
  return pool[rotatePick(pool.length, day, (b) => rngFor(`guest:${b}`))];
}
/** 손님 판매가 배율·기증 반짝별 */
export const GUEST_PRICE_MULT = 5;
export const GUEST_DONATE_STARS = 5;
