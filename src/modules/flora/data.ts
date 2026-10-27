// 식물에서 얻는 아이템과 채집 규칙표(GDD 3.4·4.3) — 도감·상점이 읽는다. 이름·값은 economy/data.ts 의 MATERIALS 가 정본.
import { MAT } from '../economy/data';

/** 나무에 열리는 열매 종류(모양 이름) */
export type WFruit = 'apple' | 'peach' | 'orange' | 'pear' | 'cherry' | 'coconut' | 'banana' | 'date' | 'starapple' | 'frostberry' | 'ginkgo';
export const WFRUITS: readonly WFruit[] = ['apple', 'peach', 'orange', 'pear', 'cherry', 'coconut', 'banana', 'date', 'starapple', 'frostberry', 'ginkgo'];

/** 받침 있는 글자면 true(조사 고르기) */
export const hasBatchim = (w: string) => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
/** 조사 붙이기: josa('사과', '이가') → '사과가', josa('은행', '을를') → '은행을' */
export const josa = (w: string, pair: '이가' | '을를' | '은는' | '과와') => w + (hasBatchim(w) ? pair[0] : pair[1]);

/** 아이템 이름(MATERIALS 에 없으면 id 그대로) */
export const itemName = (id: string) => MAT.get(id)?.name ?? id;

const fruitIds: Record<WFruit, string> = {
  apple: 'm_apple', peach: 'm_peach', orange: 'm_orange', pear: 'm_pear', cherry: 'm_cherry',
  coconut: 'm_coconut', banana: 'm_banana', date: 'm_date', starapple: 'm_starapple', frostberry: 'm_frostberry', ginkgo: 'm_ginkgo',
};
/** 열매 → 가방 아이템(이름·가격은 MATERIALS) */
export const FRUIT_ITEMS: Record<WFruit, { id: string; name: string; josa: string; price: number }> = Object.fromEntries(
  WFRUITS.map((f) => {
    const id = fruitIds[f];
    const m = MAT.get(id);
    const name = m?.name ?? id;
    return [f, { id, name, josa: hasBatchim(name) ? '이' : '가', price: m?.price ?? 100 }];
  }),
) as Record<WFruit, { id: string; name: string; josa: string; price: number }>;

// ── 흔들기(GDD 3.4 P0-2) ──
export const SHAKE = {
  /** 열매 나무에서 떨어지는 열매 수 */
  fruitMin: 1, fruitMax: 3,
  /** 코인 주머니 5% (100~1,000) */
  coins: 0.05, coinMin: 100, coinMax: 1000,
  /** 벌집 3% → beehive 이벤트(벌떼는 insects 몫) + 꿀 */
  hive: 0.03,
  /** 가구 2% — P1 전까지는 코인으로 */
  furniture: 0.02, furnitureCoins: 500,
} as const;

// ── 베기(GDD 3.4 P0-4) ──
export const CHOP = {
  /** 나무마다 하루 3번(나무 재료 3개) */
  perDay: 3,
  /** 한 번 벨 때 단단한 나무가 나올 확률 */
  hardwood: 0.2,
  /** 덩굴이 나오는 섬(야자·거대 버섯) */
  vineIslands: ['coral', 'mushroom'] as readonly string[],
} as const;

// ── 돌 두드리기(GDD 3.4 P0-3) ──
export const ROCK = {
  /** 섬마다 돌 수 */
  perIsland: 5,
  /** 돌마다 하루 두드리기 수(8번째에 부서진다) */
  hitsPerDay: 8,
  /** 이 간격(초) 안에 다시 치면 콤보 */
  comboWindow: 0.9,
  /** 기본 비율: 돌 60 · 점토 15 · 철광석 15 · 금광석 3 · 섬 특산 7 */
  weights: { m_stone: 60, m_clay: 15, m_iron: 15, m_gold: 3, special: 7 },
  /** 콤보 1마다 철광석·금광석 배율 증가(콤보 7에서 멈춤) */
  comboIron: 0.2, comboGold: 0.35, comboMax: 7,
} as const;
/** 섬 특산 돌 재료 */
export const ROCK_SPECIAL: Record<string, string> = {
  dino: 'm_volcanic', ice: 'm_icecrystal', desert: 'm_sandglass', launch: 'm_meteor', coral: 'm_shell', mushroom: 'm_spore', home: 'm_clay', islet: 'm_shell',
};

// ── 작은 채집물(꽃·버섯·고사리) ──
export type GatherKind = 'flower' | 'mushroom' | 'fern' | 'cactus';
export const GATHER: Record<GatherKind, { label: string; item: string; harvest: 'flower' | 'spore' | 'fern'; night?: { item: string; harvest: 'glowcap' } }> = {
  flower: { label: '꽃 줍기', item: 'm_petal', harvest: 'flower' },
  mushroom: { label: '버섯 따기', item: 'm_spore', harvest: 'spore', night: { item: 'm_glowcap', harvest: 'glowcap' } },
  fern: { label: '고사리 뜯기', item: 'm_fern', harvest: 'fern' },
  cactus: { label: '선인장꽃 따기', item: 'm_cactusflower', harvest: 'flower' },
};

/** 식물에서 얻는 아이템 전부(상점·도감 표 — 모두 MATERIALS 에 있어야 한다) */
export const FLORA_ITEMS: Array<{ id: string; name: string; price: number }> = [
  ...new Set([
    ...WFRUITS.map((f) => FRUIT_ITEMS[f].id),
    'm_honey', 'm_wood', 'm_hardwood', 'm_vine',
    'm_stone', 'm_clay', 'm_iron', 'm_gold', ...Object.values(ROCK_SPECIAL),
    ...Object.values(GATHER).flatMap((g) => [g.item, ...(g.night ? [g.night.item] : [])]),
  ]),
].map((id) => ({ id, name: itemName(id), price: MAT.get(id)?.price ?? 0 }));
