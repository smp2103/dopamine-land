// economy 데이터 — 재료·상점·레시피·상자 등급·판매가 공식(GDD 0.7·4.3·4.5·4.6·5.5·6.1). 도감·상점·HUD 가 읽는다.
// 큰 표는 tables.ts 에 있고 여기서 다시 내보낸다 — 다른 모듈은 언제나 이 파일에서 가져간다(부수효과 없음).
import type { Species } from '../../core/state';
export {
  MATERIAL_TABLE, SHOP_TABLE, RECIPE_TABLE, GOODS_TABLE, ANY_NEEDS, RECIPE_ALIASES,
  COSMETIC_TABLE, CAPSULE_COSMETICS, SKIN_KINDS, SKIN_COLORS, CAPSULE_FURNITURE, type Cosmetic,
  type Cost, type MatTag, type Material, type ShopId, type ShopKind, type ShopItem, type RecipeKind, type Recipe, type AnyNeed,
} from './tables';
import { MATERIAL_TABLE, SHOP_TABLE, RECIPE_TABLE, GOODS_TABLE, ANY_NEEDS, RECIPE_ALIASES, type Material, type ShopItem, type Recipe, type Cost } from './tables';

export const BASE: Record<number, number> = { 1: 60, 2: 200, 3: 700, 4: 2500, 5: 9000 };
export const round10 = (v: number) => Math.max(10, Math.round(v / 10) * 10);

/** 재료(4.3) — 기본 재료·과일·쓰레기(t_)·잡동사니(it_) */
export const MATERIALS: Material[] = MATERIAL_TABLE;
export const MAT = new Map(MATERIALS.map((m) => [m.id, m]));
/** 번호 붙는 잡동사니(it_map_3, it_letter_12)는 바탕 id 로 찾는다 */
export const itemDef = (id: string): Material | undefined => MAT.get(id) ?? MAT.get(id.replace(/^(it_map|it_letter)_\d+$/, '$1'));

/** 재료 도감 칸(category 'item', 도감 탭엔 안 나온다) — 태그·산지까지 싣는다 */
export type MaterialSpecies = Species & { tags: string[]; origin?: string };
export const MATERIAL_SPECIES: MaterialSpecies[] = MATERIALS.map((m) => ({
  id: m.id, name: m.name, category: 'item', price: m.price, desc: m.desc, tags: [...m.tags], origin: m.origin,
  rarity: m.price >= 1000 ? 4 : m.price >= 300 ? 3 : m.price >= 100 ? 2 : 1,
}));

/** 다른 섬 특산 과일 기본가(GDD 4.3) */
export const FOREIGN_FRUIT_PRICE = 300;
/** 재료 기본가 — island 를 주면 다른 섬 과일은 300 */
export const materialBase = (id: string, island?: string): number => {
  const m = itemDef(id);
  if (!m || m.noSell) return 0;
  if (island && m.foreignPrice && m.origin && m.origin !== island) return Math.max(m.price, m.foreignPrice);
  return m.price;
};

/** 가방에 쓰는 아이템 접두어(CONTRACT2 8) */
export const ITEM_PREFIXES = ['m_', 't_', 'tool_', 'bait_', 'seed_', 'f_', 'p_', 'it_', 'fos_', 'cos_', 'skin_'] as const;

// ── 상점(4.5) ──

export const SHOP_ITEMS: ShopItem[] = SHOP_TABLE;
export const SHOP = new Map(SHOP_ITEMS.map((s) => [s.id, s]));
export const shopItemsOf = (shop: string) => SHOP_ITEMS.filter((s) => s.shop === shop);

/** P0 1/5 (올림). 명시값(p0Cost)이 있으면 그것 */
const fifth = (c: Cost): Cost => ({
  ...(c.coins != null ? { coins: Math.ceil(c.coins / 5) } : {}),
  ...(c.stars != null ? { stars: Math.ceil(c.stars / 5) } : {}),
  ...(c.items ? { items: Object.fromEntries(Object.entries(c.items).map(([k, v]) => [k, Math.ceil(v / 5)])) } : {}),
});
export const costOf = (it: ShopItem, p0: boolean): Cost => (p0 ? it.p0Cost ?? fifth(it.cost) : it.cost);
/** 살 때의 조건 — P0 면 p0Gate(null = 조건 없음) */
export const shopGateOf = (it: ShopItem, p0: boolean): string | undefined => (p0 && it.p0Gate !== undefined ? it.p0Gate ?? undefined : it.gate);
/** P0 에서 처음부터 열려 있는 해금 키(박물관 동 전부) */
export const P0_OPEN_KEYS: string[] = SHOP_ITEMS.filter((s) => s.p0Unlocked && s.unlock).map((s) => s.unlock!);
/** 새 저장의 시작 해금·지급(4.8) */
export const START_UNLOCKS = ['tool:rod', 'tool:net', 'wing:aquarium'];
export const STARTER_KIT: Record<string, number> = { tool_rod: 1, tool_net: 1 };

// ── DIY 레시피(4.6) ──

export const RECIPES: Recipe[] = RECIPE_TABLE;
/** 예전 레시피가 가방에 넣던 아이템 → 새 해금 키(저장 이전용) */
export const LEGACY_ITEMS: Record<string, string> = { v_raft: 'v:raft', v_sled: 'v:sled', p_rocketwing: 'rocket:part:wing', p_fuel: 'rocket:part:fuel' };
const RECIPE_MAP = new Map(RECIPES.map((r) => [r.id, r]));
/** 예전 id(r_goldrod …)도 받아 준다 */
export const recipeById = (id: string): Recipe | undefined => RECIPE_MAP.get(RECIPE_ALIASES[id] ?? id);
/** GDD 4.6 표에 있는 레시피(호환용 extra 제외) */
export const GDD_RECIPES: Recipe[] = RECIPES.filter((r) => !r.extra);

/** 재료 — P0 면 p0Needs, 없으면 각 수치 ceil(n/5) */
export const needsOf = (r: Recipe, p0: boolean): Record<string, number> =>
  !p0 ? r.needs : r.p0Needs ?? Object.fromEntries(Object.entries(r.needs).map(([k, v]) => [k, Math.ceil(v / 5)]));
/** 만들 때의 조건 — P0 면 p0Gate(null = 조건 없음 → 'base') */
export const recipeGateOf = (r: Recipe, p0: boolean): string => (p0 && r.p0Gate !== undefined ? r.p0Gate ?? 'base' : r.gate);

/** 조건 문자열 읽기 — base / card(반짝별, 열쇠 recipe:<rid>) / cond(카운터 n 이상) / key(해금 키) */
export type Gate =
  | { type: 'base' }
  | { type: 'card'; stars: number; key: string }
  | { type: 'cond'; counter: string; n: number }
  | { type: 'key'; key: string };
export const parseGate = (gate: string | undefined | null, rid?: string): Gate => {
  if (!gate || gate === 'base') return { type: 'base' };
  if (gate.startsWith('card:')) return { type: 'card', stars: Number(gate.slice(5)) || 0, key: `recipe:${rid ?? ''}` };
  const c = /^(?:cond:)?([A-Za-z_]+?)(\d+)$/.exec(gate);
  if (c && (gate.startsWith('cond:') || !gate.includes(':'))) return { type: 'cond', counter: c[1], n: Number(c[2]) };
  return { type: 'key', key: gate };
};
/** cond 카운터 이름 — economy 가 세는 것 */
export const GATE_COUNTERS: Record<string, string> = {
  fish: '낚시 횟수', bug: '곤충 채집 횟수', balloon: '풍선 선물 터뜨린 수', wish: '유성우 소원 수',
  homeDex: '말랑섬 도감 %', islands: '방문한 섬 수', parts: '만든 로켓 부품 수',
  visit_ice: '솜눈섬 방문', visit_mushroom: '반딧불버섯섬 방문', visit_desert: '모래시계섬 방문',
};

/** 'any:*' 재료 칸이 이 아이템/생물로 채워지는가 — 순수 판정(같은 종·중복 조건은 부르는 쪽이 센다) */
export const anyMatches = (token: string, s: { id: string; category?: string; rarity?: number; tags?: string[] }): boolean => {
  const a = ANY_NEEDS[token];
  if (!a) return false;
  if (a.cat && s.category !== a.cat && !(a.cat === 'bug' && s.category === 'insect')) return false;
  if (a.rarity != null && s.rarity !== a.rarity) return false;
  if (a.prefix && !s.id.startsWith(a.prefix)) return false;
  if (a.tag) {
    const tags = s.tags ?? itemDef(s.id)?.tags ?? [];
    if (!tags.some((t) => (a.tag!.endsWith(':') ? t.startsWith(a.tag!) : t === a.tag))) return false;
  }
  if (token === 'any:same' && (!s.category || s.category === 'item')) return false;
  return true;
};

/** 로켓 부품 6개(6.1) — 다섯은 제작, 항법 칩은 별자리 물고기 기증 */
export const NAV_CHIP = { tag: 'set:zodiac', p0: 3, full: 12, key: 'rocket:part:chip' } as const;
export const ROCKET_PARTS: Array<{ part: 'body' | 'engine' | 'window' | 'wing' | 'fuel' | 'chip'; key: string; recipe: string | null; name: string; icon: string }> = [
  { part: 'body', key: 'rocket:part:body', recipe: 'r_rocket_body', name: '동체', icon: '🚀' },
  { part: 'engine', key: 'rocket:part:engine', recipe: 'r_rocket_engine', name: '엔진', icon: '🔥' },
  { part: 'window', key: 'rocket:part:window', recipe: 'r_rocket_window', name: '조종석 창', icon: '🪟' },
  { part: 'wing', key: 'rocket:part:wing', recipe: 'r_rocket_wing', name: '날개', icon: '🪽' },
  { part: 'fuel', key: 'rocket:part:fuel', recipe: 'r_rocket_fuel', name: '반짝 연료', icon: '⛽' },
  { part: 'chip', key: NAV_CHIP.key, recipe: null, name: '항법 칩', icon: '📡' },
];

/** 상점·제작으로 얻는 물건 이름(v_* 는 vehicles 담당이라 넣지 않는다) */
export const GOODS: Record<string, { name: string; icon: string }> = { ...GOODS_TABLE };
for (const s of SHOP_ITEMS) for (const k of Object.keys(s.gives)) if (!GOODS[k] && !MAT.has(k)) GOODS[k] = { name: s.name.replace(/ ×\d+$/, ''), icon: s.icon };
for (const r of RECIPES) for (const k of Object.keys(r.gives)) if (!GOODS[k] && !MAT.has(k)) GOODS[k] = { name: r.name.replace(/ ×\d+$/, ''), icon: r.icon };
for (const [k, a] of Object.entries(ANY_NEEDS)) GOODS[k] = { name: a.name, icon: a.icon };

// ── 반짝별·가방·지역 보정(4.1.1·4.2·0.7) ──

/** 도감 첫 등록 반짝별(희귀도별) */
export const STARS_FIRST: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 10 };
/** 박물관 첫 기증 반짝별(같은 표) */
export const STARS_DONATE: Record<number, number> = { ...STARS_FIRST };
/** 반짝이 첫 등록 */
export const STARS_SHINY = 10;
/** 가방: 20칸, 칸당 생물 10·재료 30, 도구 벨트 5, 자전거 바구니 +5(P1) */
export const BAG = { base: 20, stack: { creature: 10, material: 30 }, belt: 5, bikeBasket: 5 } as const;
/** 판매 지역 보정 */
export const ZONE_MULT = { home: 1, island: 1.15, farsea: 1.3, space: 1.8 } as const;
/** 판매 크기 보정(shadow) */
export const SIZE_MULT: Record<string, number> = { XS: 0.7, S: 0.85, M: 1.0, L: 1.3, XL: 1.7, XXL: 2.2 };

/** 보물상자 등급(GDD 5.4, 계약 v2) — 나무·은·금·무지개·우주. 규칙·내용물 표는 loot.ts */
export type ChestTier = 'wood' | 'silver' | 'gold' | 'rainbow' | 'space';
/** 예전 등급 이름(저장 호환) — common→wood · rare→silver · epic→gold · legend→rainbow */
export type LegacyChestTier = 'common' | 'rare' | 'epic' | 'legend';
export interface ChestTierDef {
  name: string;
  icon: string;
  /** 상자 몸통 색(아래·위) */
  body: [string, string];
  /** 테두리·자물쇠 색 */
  trim: string;
  /** 보석 색 */
  gem: string;
  /** 빛기둥·반짝이 색 */
  color: string;
  glow: string;
  /** 여는 데 드는 열쇠(없으면 무료 E) */
  key: 'silver' | 'gold' | 'rainbow' | null;
  /** 흔들림 힌트 횟수(1 나무 / 2 은 / 3 금 이상) */
  shakes: 1 | 2 | 3;
  /** 흔들 때 빛기둥(금 이상) */
  pillar: boolean;
}
export const TIERS: Readonly<Record<ChestTier, ChestTierDef>> = {
  wood: { name: '나무', icon: '📦', body: ['#a8693d', '#e0a46c'], trim: '#ffcf4a', gem: '#ff7aa8', color: '#ffc88a', glow: '#fff0d8', key: null, shakes: 1, pillar: false },
  silver: { name: '은', icon: '🗝️', body: ['#9fb2cc', '#e4ecf6'], trim: '#f6f9ff', gem: '#6fc3ff', color: '#bfe0ff', glow: '#ffffff', key: 'silver', shakes: 2, pillar: false },
  gold: { name: '금', icon: '🔑', body: ['#f0b23a', '#ffe58a'], trim: '#fff6d0', gem: '#ff6fa0', color: '#ffcf4a', glow: '#fff3c4', key: 'gold', shakes: 3, pillar: true },
  rainbow: { name: '무지개', icon: '🌈', body: ['#ffb3c8', '#c9f3ff'], trim: '#ffffff', gem: '#b98cff', color: '#ff9fb8', glow: '#e9fbff', key: 'rainbow', shakes: 3, pillar: true },
  space: { name: '우주', icon: '🪐', body: ['#5d5aa8', '#b9a8ff'], trim: '#fff2a8', gem: '#8ff0ff', color: '#a99bff', glow: '#e5e2ff', key: null, shakes: 3, pillar: true },
};

/** 도감 탭(GDD 5.5) — 7개. 탈것은 category 'item' + tags 'vehicle'(vehicles 담당), 나머지는 category 로 거른다. 재료는 탭 없음 */
export interface DexTab { id: string; name: string; icon: string; cats: string[]; tag?: string; slots: number; match(s: { category: string; tags?: string[] }): boolean }
const catTab = (id: string, name: string, icon: string, cats: string[], slots: number): DexTab => ({ id, name, icon, cats, slots, match: (s) => cats.includes(s.category) });
export const DEX_TABS: DexTab[] = [
  catTab('fish', '물고기', '🐟', ['fish'], 135),
  catTab('sea', '바다', '🐙', ['sea'], 27),
  catTab('bug', '곤충', '🦋', ['bug', 'insect'], 71),
  catTab('dino', '공룡', '🦕', ['dino'], 25),
  // 화석 탭은 골격 20칸 — 부위 조각(fos:<공룡>:<부위>)은 칸이 아니다(5.5). 골격 태그 fos:<공룡> 은 남긴다
  { id: 'fossil', name: '화석', icon: '🦴', cats: ['fossil'], slots: 20, match: (s) => s.category === 'fossil' && !s.tags?.some((t) => /^fos:[^:]+:[^:]+$/.test(t)) },
  catTab('space', '우주', '🪐', ['space'], 18),
  { id: 'vehicle', name: '탈것', icon: '🚲', cats: [], tag: 'vehicle', slots: 18, match: (s) => !!s.tags?.includes('vehicle') },
];

export const CAT_ICON: Record<string, string> = { fish: '🐟', sea: '🐙', bug: '🦋', insect: '🦋', dino: '🦕', fossil: '🦴', space: '🪐', item: '📦', vehicle: '🚲' };
export const RARITY_COLOR = ['#c9c9c9', '#a5dba8', '#86c5ff', '#c59bff', '#ffb36b', '#ffd23f'];

/** 섬별 지역 연출 색 */
export const ISLAND_LOOK: Record<string, { sub: string; color: string }> = {
  home: { sub: '말랑말랑 시작 마을', color: '#7fd18b' },
  dino: { sub: '쿵쿵 고사리 숲', color: '#9fcf5a' },
  ice: { sub: '반짝반짝 눈꽃 평원', color: '#8fd3ff' },
  mushroom: { sub: '몽글몽글 요정 숲', color: '#ff9ccf' },
  coral: { sub: '찰랑찰랑 산호 해변', color: '#ff9f8a' },
  desert: { sub: '사각사각 모래 바자르', color: '#ffc46b' },
  launch: { sub: '두근두근 별 발사장', color: '#a99bff' },
  islet: { sub: '어딘가 보물이 있대!', color: '#ffd23f' },
};
