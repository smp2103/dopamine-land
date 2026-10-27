// economy 데이터 표: GDD 4.3 재료 · 4.5 상점 가격 · 4.6 레시피 49개 · 5.5 도감 탭 7개가 정본과 맞는지.
import { describe, it, expect } from 'vitest';
import {
  MATERIALS, MAT, MATERIAL_SPECIES, SHOP_ITEMS, SHOP, RECIPES, GDD_RECIPES, GOODS, DEX_TABS, ANY_NEEDS, ITEM_PREFIXES,
  RECIPE_ALIASES, recipeById, needsOf, recipeGateOf, costOf, shopGateOf, parseGate, anyMatches, materialBase, itemDef,
  NAV_CHIP, ROCKET_PARTS, STARS_FIRST, STARS_DONATE, BAG, ZONE_MULT, P0_OPEN_KEYS,
} from '../src/modules/economy/data';

// GDD 4.6 표 48행 + 물뿌리개(r_watering_can, econ-data 지시) = 49
const GDD_RECIPE_IDS = [
  'r_rod', 'r_net', 'r_shovel', 'r_hammer', 'r_slingshot', 'r_good_rod', 'r_golden_rod', 'r_good_net', 'r_golden_net',
  'r_snorkel', 'r_wetsuit', 'r_worm_bait', 'r_dough_bait', 'r_shiny_lure', 'r_golden_bait', 'r_lava_bait',
  'r_grilled_fish', 'r_fruit_pie', 'r_lucky_cookie', 'r_oxygen', 'r_raft', 'r_sail', 'r_engine', 'r_sub_hull',
  'r_balloon', 'r_sled', 'r_rocket_body', 'r_rocket_engine', 'r_rocket_window', 'r_rocket_wing', 'r_rocket_fuel',
  'r_fish_tank', 'r_bug_cage', 'r_firefly_lantern', 'r_figure', 'r_shell_bed', 'r_coral_lamp', 'r_amber_lamp',
  'r_mushroom_lamp', 'r_boot_planter', 'r_can_robot', 'r_bone_slide', 'r_cactus_pot', 'r_incubator',
  'r_lighthouse_kit', 'r_bridge_kit', 'r_flower_crown', 'r_space_lamp', 'r_watering_can',
];
// 재료 칸에 쓰이는 생물 id(insects 담당 종)
const CREATURE_NEEDS = ['firefly'];

describe('재료(4.3)', () => {
  it('30종 이상 + 새 재료·쓰레기·잡동사니가 다 있다', () => {
    expect(MATERIALS.filter((m) => m.id.startsWith('m_')).length).toBeGreaterThanOrEqual(30);
    for (const id of ['m_ginkgo', 'm_frostberry', 'm_pear', 'm_banana', 'm_date', 'm_balloon_scrap', 'm_cactusflower', 'm_moonflower', 'm_mochi',
      't_boot', 't_can', 't_tire', 't_bottle', 't_rustykey', 'it_capsule', 'it_oxygen', 'it_map', 'it_letter', 'it_blackbox', 'it_invite',
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => `it_starpiece_${n}`)]) expect(MAT.has(id), id).toBe(true);
  });
  it('id 가 겹치지 않고 모양이 맞다', () => {
    expect(new Set(MATERIALS.map((m) => m.id)).size).toBe(MATERIALS.length);
    for (const m of MATERIALS) {
      expect(m.name && m.icon && /^#[0-9a-f]{6}$/i.test(m.color), m.id).toBeTruthy();
      expect(Array.isArray(m.tags)).toBe(true);
      for (const t of m.tags) expect(/^(junk|space-goods|fruit|misc|specialty:[a-z]+)$/.test(t), `${m.id}:${t}`).toBe(true);
    }
  });
  it('GDD 기본 판매가', () => {
    const want: Record<string, number> = { m_wood: 20, m_hardwood: 40, m_stone: 15, m_iron: 150, m_gold: 1500, m_pearl: 2000, m_ginkgo: 40,
      m_frostberry: 120, m_moonrock: 1200, m_apple: 100, m_pear: 100, m_banana: 150, m_balloon_scrap: 50, t_boot: 10, t_can: 10, t_tire: 10 };
    for (const [id, p] of Object.entries(want)) expect(MAT.get(id)!.price, id).toBe(p);
  });
  it('녹슨 열쇠는 은열쇠 조각, 쓰레기 태그', () => {
    expect(MAT.get('t_rustykey')!.onObtain).toBe('keypiece:silver');
    for (const id of ['t_boot', 't_can', 't_tire', 't_bottle', 't_rustykey']) expect(MAT.get(id)!.tags).toContain('junk');
    expect(MAT.get('m_moonrock')!.tags).toContain('space-goods');
  });
  it('다른 섬 과일은 300', () => {
    expect(materialBase('m_apple', 'home')).toBe(100);
    expect(materialBase('m_apple', 'coral')).toBe(300);
    expect(materialBase('m_coconut', 'coral')).toBe(150);
    expect(materialBase('m_coconut', 'home')).toBe(300);
    expect(materialBase('m_iron', 'ice')).toBe(150);
    expect(materialBase('t_bottle')).toBe(0);
  });
  it('MATERIAL_SPECIES 는 category item', () => {
    expect(MATERIAL_SPECIES.length).toBe(MATERIALS.length);
    for (const s of MATERIAL_SPECIES) expect(s.category).toBe('item');
    expect(itemDef('it_map_3')?.id).toBe('it_map');
  });
});

describe('상점(4.5)', () => {
  it('id 가 겹치지 않는다', () => {
    expect(new Set(SHOP_ITEMS.map((s) => s.id)).size).toBe(SHOP_ITEMS.length);
  });
  it('정식 가격이 GDD 와 같다', () => {
    const coins: Record<string, number> = {
      shop_worm: 100, shop_dough: 300, shop_lure: 800, shop_shovel: 800, shop_hammer: 600, shop_slingshot: 1200, shop_bike: 8000,
      shop_bag30: 5000, shop_bag40: 25000, shop_bag50: 100000, shop_house1: 9800, shop_house2: 98000, shop_house3: 198000, shop_house4: 498000,
      shop_tugboat: 30000, shop_yacht: 60000, shop_motorboat: 150000, shop_wing_bug: 50000, shop_wing_fossil: 100000, shop_wing_sea: 80000,
      shop_wing_astro: 200000, shop_launchpad: 300000, shop_watering_can: 500,
    };
    for (const [id, c] of Object.entries(coins)) { expect(SHOP.get(id)?.cost.coins, id).toBe(c); expect(SHOP.get(id)!.price, id).toBe(c); }
    expect(SHOP.get('shop_wing_aquarium')!.cost).toEqual({});
    expect(SHOP.get('shop_blueprint')!.cost).toEqual({ stars: 200 });
    expect(SHOP.get('shop_capsule')!.cost).toEqual({ stars: 20 });
    expect(SHOP.get('shop_yacht')!.cost.items).toEqual({ p_sail: 1 });
    expect(SHOP.get('shop_motorboat')!.cost.items).toEqual({ p_engine: 1 });
  });
  it('P0 가격·조건', () => {
    expect(costOf(SHOP.get('shop_bike')!, true)).toEqual({ coins: 1600 });
    expect(costOf(SHOP.get('shop_tugboat')!, true)).toEqual({ coins: 6000 });
    expect(costOf(SHOP.get('shop_motorboat')!, true)).toEqual({ coins: 30000, items: { p_engine: 1 } });
    expect(costOf(SHOP.get('shop_blueprint')!, true)).toEqual({ stars: 20 });
    expect(costOf(SHOP.get('shop_launchpad')!, true)).toEqual({ coins: 30000 });
    expect(costOf(SHOP.get('shop_lure')!, true)).toEqual({ coins: 160 });
    expect(costOf(SHOP.get('shop_bike')!, false)).toEqual({ coins: 8000 });
    expect(shopGateOf(SHOP.get('shop_tugboat')!, true)).toBeUndefined();
    expect(shopGateOf(SHOP.get('shop_tugboat')!, false)).toBe('cond:homeDex30');
    expect(shopGateOf(SHOP.get('shop_blueprint')!, true)).toBeUndefined();
    expect(shopGateOf(SHOP.get('shop_launchpad')!, true)).toBe('cond:parts6');
    expect(parseGate('cond:parts6')).toEqual({ type: 'cond', counter: 'parts', n: 6 });
    expect(parseGate('islands3')).toEqual({ type: 'cond', counter: 'islands', n: 3 });
    for (const w of ['wing:aquarium', 'wing:bug', 'wing:fossil', 'wing:sea', 'wing:astro']) expect(P0_OPEN_KEYS).toContain(w);
  });
  it('해금 키·순서', () => {
    expect(SHOP.get('shop_bike')!.unlock).toBe('v:bike');
    expect(SHOP.get('shop_blueprint')!.unlock).toBe('rocket:blueprint');
    expect(SHOP.get('shop_launchpad')!.unlock).toBe('rocket:pad');
    for (const t of ['shovel', 'hammer', 'slingshot', 'net']) expect(SHOP.get(`shop_${t}`)!.unlock).toBe(`tool:${t}`);
    expect([1, 2, 3].map((n) => SHOP.get(`shop_bag${20 + n * 10}`)!.seq)).toEqual([1, 2, 3]);
    expect(SHOP.get('shop_bag40')!.gate).toBe('bag:30');
  });
  it('레시피 카드는 card 레시피마다 하나, 반짝별 10~50', () => {
    const cards = SHOP_ITEMS.filter((s) => s.kind === 'recipe');
    const cardRecipes = RECIPES.filter((r) => r.gate.startsWith('card:'));
    expect(cards.length).toBe(cardRecipes.length);
    for (const c of cards) {
      expect(c.cost.stars! >= 10 && c.cost.stars! <= 50, c.id).toBe(true);
      expect(c.unlock!.startsWith('recipe:r_')).toBe(true);
      expect(recipeById(c.unlock!.slice(7)), c.id).toBeTruthy();
    }
  });
});

describe('레시피(4.6)', () => {
  it('GDD 49개 id 가 전부 있다', () => {
    expect(GDD_RECIPE_IDS.length).toBe(49);
    const ids = new Set(RECIPES.map((r) => r.id));
    for (const id of GDD_RECIPE_IDS) expect(ids.has(id), id).toBe(true);
    expect(GDD_RECIPES.map((r) => r.id).sort()).toEqual([...GDD_RECIPE_IDS].sort());
  });
  it('id 가 겹치지 않는다', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });
  it('재료 id 는 MATERIALS 이거나 아는 접두어', () => {
    for (const r of RECIPES) for (const k of [...Object.keys(r.needs), ...Object.keys(r.p0Needs ?? {})]) {
      const ok = MAT.has(k) || (k.startsWith('any:') && !!ANY_NEEDS[k]) || ITEM_PREFIXES.some((p) => p !== 'm_' && p !== 't_' && k.startsWith(p)) || CREATURE_NEEDS.includes(k);
      expect(ok, `${r.id} → ${k}`).toBe(true);
    }
  });
  it('뗏목: P0 나무 4 + 덩굴 1, 정식 20 + 5, v:raft 해금만', () => {
    const raft = recipeById('r_raft')!;
    expect(needsOf(raft, true)).toEqual({ m_wood: 4, m_vine: 1 });
    expect(needsOf(raft, false)).toEqual({ m_wood: 20, m_vine: 5 });
    expect(raft.unlock).toBe('v:raft');
    expect(raft.gives).toEqual({});
    expect(raft.gate).toBe('base');
  });
  it('P0 재료는 1/5 올림', () => {
    expect(needsOf(recipeById('r_rocket_body')!, true)).toEqual({ m_iron: 8, m_hardwood: 4 });
    expect(needsOf(recipeById('r_rocket_fuel')!, true)).toEqual({ m_stardust: 10, m_starapple: 2 });
    expect(needsOf(recipeById('r_snorkel')!, true)).toEqual({ m_shell: 1, m_seaweed: 1, m_iron: 1 });
  });
  it('로켓 부품 5개 레시피 + 항법 칩', () => {
    const want: Record<string, [string, Record<string, number>]> = {
      r_rocket_body: ['body', { m_iron: 40, m_hardwood: 20 }],
      r_rocket_engine: ['engine', { m_volcanic: 15, m_gold: 10 }],
      r_rocket_window: ['window', { m_icecrystal: 10, m_sandglass: 10 }],
      r_rocket_wing: ['wing', { m_feather: 20, m_honey: 10 }],
      r_rocket_fuel: ['fuel', { m_stardust: 50, m_starapple: 10 }],
    };
    for (const [id, [part, needs]] of Object.entries(want)) {
      const r = recipeById(id)!;
      expect(r.needs).toEqual(needs);
      expect(r.gate).toBe('rocket:blueprint');
      expect(r.unlock).toBe(`rocket:part:${part}`);
    }
    expect(NAV_CHIP).toMatchObject({ tag: 'set:zodiac', p0: 3, full: 12 });
    expect(ROCKET_PARTS.map((p) => p.part)).toEqual(['body', 'engine', 'window', 'wing', 'fuel', 'chip']);
  });
  it('생선구이 버프 · 별칭 · 조건', () => {
    expect(recipeById('r_grilled_fish')!.effect).toEqual({ buff: 'grilled', minutes: 30 });
    for (const [o, n] of Object.entries(RECIPE_ALIASES)) expect(recipeById(o)?.id, o).toBe(n);
    expect(recipeById('r_goldrod')!.id).toBe('r_golden_rod');
    for (const id of ['r_pot', 'r_fruitbasket', 'r_bench', 'r_spacechair']) expect(recipeById(id)?.extra, id).toBe(true);
    expect(parseGate('card:30', 'r_wetsuit')).toEqual({ type: 'card', stars: 30, key: 'recipe:r_wetsuit' });
    expect(parseGate(recipeById('r_good_rod')!.gate)).toEqual({ type: 'cond', counter: 'fish', n: 30 });
    expect(parseGate('rocket:blueprint')).toEqual({ type: 'key', key: 'rocket:blueprint' });
    expect(recipeGateOf(recipeById('r_oxygen')!, true)).toBe('base');
    expect(recipeGateOf(recipeById('r_oxygen')!, false)).toBe('facility:spacecenter');
  });
  it('가구 14개, 탈것 부품', () => {
    expect(GDD_RECIPES.filter((r) => r.kind === '가구').length).toBe(14);
    expect(recipeById('r_sail')!.gives).toEqual({ p_sail: 1 });
    expect(recipeById('r_engine')!.gives).toEqual({ p_engine: 1 });
    expect(recipeById('r_sled')!.unlock).toBe('v:sled');
  });
  it('any 재료 판정', () => {
    expect(anyMatches('any:fruit', { id: 'm_apple' })).toBe(true);
    expect(anyMatches('any:fruit', { id: 'm_wood' })).toBe(false);
    expect(anyMatches('any:fish:1', { id: 'x', category: 'fish', rarity: 1 })).toBe(true);
    expect(anyMatches('any:fish:1', { id: 'x', category: 'fish', rarity: 2 })).toBe(false);
    expect(anyMatches('any:specialty', { id: 'm_coral' })).toBe(true);
    expect(anyMatches('any:fosdup', { id: 'fos_trex_skull' })).toBe(true);
  });
});

describe('물건·도감·상수', () => {
  it('v_* 는 재료에도 물건에도 없다', () => {
    expect(MATERIALS.some((m) => m.id.startsWith('v_'))).toBe(false);
    expect(Object.keys(GOODS).some((k) => k.startsWith('v_'))).toBe(false);
  });
  it('상점·레시피 결과물은 이름이 있다', () => {
    for (const s of SHOP_ITEMS) for (const k of Object.keys(s.gives)) expect(!!(GOODS[k] || MAT.has(k)), `${s.id} → ${k}`).toBe(true);
    for (const r of RECIPES) for (const k of Object.keys(r.gives)) expect(!!(GOODS[k] || MAT.has(k)), `${r.id} → ${k}`).toBe(true);
  });
  it('도감 탭 7개', () => {
    expect(DEX_TABS.map((t) => t.id)).toEqual(['fish', 'sea', 'bug', 'dino', 'fossil', 'space', 'vehicle']);
    expect(DEX_TABS.reduce((a, t) => a + t.slots, 0)).toBe(314);
    const veh = DEX_TABS.find((t) => t.id === 'vehicle')!;
    expect(veh.match({ category: 'item', tags: ['vehicle'] })).toBe(true);
    expect(veh.match({ category: 'item' })).toBe(false);
    expect(DEX_TABS.find((t) => t.id === 'fish')!.match({ category: 'fish' })).toBe(true);
    expect(DEX_TABS.some((t) => t.match({ category: 'item' }))).toBe(false);
  });
  it('반짝별·가방·지역 보정', () => {
    expect(STARS_FIRST).toEqual({ 1: 1, 2: 2, 3: 3, 4: 5, 5: 10 });
    expect(STARS_DONATE).toEqual(STARS_FIRST);
    expect(BAG).toEqual({ base: 20, stack: { creature: 10, material: 30 }, belt: 5, bikeBasket: 5 });
    expect(ZONE_MULT).toEqual({ home: 1, island: 1.15, farsea: 1.3, space: 1.8 });
  });
});
