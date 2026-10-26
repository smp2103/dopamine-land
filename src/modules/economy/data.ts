// economy 데이터 — 재료·상점·레시피·상자 등급·판매가 공식(GDD 0.7·4.3·4.5·4.6). 도감·상점·HUD 가 읽는다.
import type { Species } from '../../core/state';

export const BASE: Record<number, number> = { 1: 60, 2: 200, 3: 700, 4: 2500, 5: 9000 };
export const round10 = (v: number) => Math.max(10, Math.round(v / 10) * 10);

/** 재료(category 'item') — 아이콘은 HUD 에서 둥근 칩 + 그림 글자로 */
export interface Material { id: string; name: string; price: number; icon: string; color: string }
export const MATERIALS: Material[] = [
  { id: 'm_wood', name: '나무', price: 20, icon: '🪵', color: '#e8c39a' },
  { id: 'm_hardwood', name: '단단한 나무', price: 40, icon: '🪵', color: '#c99a6b' },
  { id: 'm_stone', name: '돌', price: 15, icon: '🪨', color: '#cfd3dc' },
  { id: 'm_clay', name: '점토', price: 30, icon: '🟤', color: '#e9b48f' },
  { id: 'm_iron', name: '철광석', price: 150, icon: '⛓️', color: '#b9c3d6' },
  { id: 'm_gold', name: '금광석', price: 1500, icon: '🥇', color: '#ffe08a' },
  { id: 'm_vine', name: '덩굴 밧줄', price: 30, icon: '🌿', color: '#bfe6a5' },
  { id: 'm_petal', name: '꽃잎', price: 15, icon: '🌸', color: '#ffc9dc' },
  { id: 'm_honey', name: '꿀', price: 200, icon: '🍯', color: '#ffd77a' },
  { id: 'm_shell', name: '조개껍데기', price: 30, icon: '🐚', color: '#ffe3d1' },
  { id: 'm_seaweed', name: '해초', price: 20, icon: '🌱', color: '#a8e0c2' },
  { id: 'm_coral', name: '산호 조각', price: 120, icon: '🪸', color: '#ffb3a7' },
  { id: 'm_pearl', name: '진주', price: 2000, icon: '🫧', color: '#f3eefe' },
  { id: 'm_spore', name: '버섯 포자', price: 60, icon: '🍄', color: '#ffc1c1' },
  { id: 'm_glowcap', name: '발광 버섯', price: 150, icon: '🍄', color: '#c9f1ff' },
  { id: 'm_icecrystal', name: '얼음 결정', price: 300, icon: '❄️', color: '#cdeeff' },
  { id: 'm_sandglass', name: '모래유리', price: 300, icon: '🔶', color: '#ffe2b0' },
  { id: 'm_volcanic', name: '화산유리', price: 300, icon: '🔻', color: '#ffb0a0' },
  { id: 'm_amber', name: '호박', price: 800, icon: '🟠', color: '#ffcf8a' },
  { id: 'm_feather', name: '깃털', price: 120, icon: '🪶', color: '#e6dcff' },
  { id: 'm_fern', name: '고사리', price: 15, icon: '🌿', color: '#c4ebb0' },
  { id: 'm_stardust', name: '별가루', price: 500, icon: '✨', color: '#fff2a8' },
  { id: 'm_starapple', name: '별사과', price: 400, icon: '🍎', color: '#ffc4c4' },
  { id: 'm_meteor', name: '운석 조각', price: 600, icon: '☄️', color: '#d8c8ff' },
  { id: 'm_moonrock', name: '월석', price: 1200, icon: '🌕', color: '#f1f0e4' },
  { id: 'm_apple', name: '사과', price: 100, icon: '🍎', color: '#ffb8b8' },
  { id: 'm_peach', name: '복숭아', price: 100, icon: '🍑', color: '#ffd0bd' },
  { id: 'm_cherry', name: '체리', price: 100, icon: '🍒', color: '#ffb3c6' },
  { id: 'm_orange', name: '오렌지', price: 100, icon: '🍊', color: '#ffd29a' },
  { id: 'm_coconut', name: '코코넛', price: 150, icon: '🥥', color: '#e7d2bf' },
];
export const MAT = new Map(MATERIALS.map((m) => [m.id, m]));

export const MATERIAL_SPECIES: Species[] = MATERIALS.map((m) => ({ id: m.id, name: m.name, category: 'item', rarity: m.price >= 1000 ? 4 : m.price >= 300 ? 3 : m.price >= 100 ? 2 : 1, price: m.price }));

/** 상점 품목(4.5) — P0 테스트 가격 = 1/5 */
export interface ShopItem { id: string; name: string; price: number; icon: string; gives: Record<string, number>; desc: string; kind: 'tool' | 'seed' | 'furniture' | 'bait' }
export const SHOP_ITEMS: ShopItem[] = [
  { id: 'shop_worm', name: '지렁이 미끼 ×5', price: 100, icon: '🪱', gives: { bait_worm: 5 }, desc: '기본 미끼', kind: 'bait' },
  { id: 'shop_dough', name: '떡밥 ×3', price: 300, icon: '🍡', gives: { bait_dough: 3 }, desc: '★2 이상이 잘 물어요', kind: 'bait' },
  { id: 'shop_lure', name: '반짝 루어', price: 800, icon: '🎣', gives: { bait_lure: 1 }, desc: '★3 이상 ×1.5', kind: 'bait' },
  { id: 'shop_shovel', name: '삽', price: 800, icon: '🪏', gives: { tool_shovel: 1 }, desc: '화석 X 파기', kind: 'tool' },
  { id: 'shop_hammer', name: '돌망치', price: 600, icon: '🔨', gives: { tool_hammer: 1 }, desc: '돌 두드리기·나무 베기', kind: 'tool' },
  { id: 'shop_net', name: '잠자리채', price: 500, icon: '🥅', gives: { tool_net: 1 }, desc: '곤충 잡기', kind: 'tool' },
  { id: 'shop_slingshot', name: '새총', price: 1200, icon: '🎯', gives: { tool_slingshot: 1 }, desc: '풍선 선물 맞추기', kind: 'tool' },
  { id: 'shop_seed_tulip', name: '튤립 씨앗', price: 80, icon: '🌷', gives: { seed_tulip: 1 }, desc: '알록달록 튤립', kind: 'seed' },
  { id: 'shop_seed_sunflower', name: '해바라기 씨앗', price: 120, icon: '🌻', gives: { seed_sunflower: 1 }, desc: '키 큰 해바라기', kind: 'seed' },
  { id: 'shop_seed_apple', name: '사과 묘목', price: 400, icon: '🌳', gives: { seed_apple: 1 }, desc: '사흘 뒤 사과가 열려요', kind: 'seed' },
  { id: 'shop_f_lamp', name: '버섯 스탠드', price: 1500, icon: '💡', gives: { f_mushlamp: 1 }, desc: '은은한 빛', kind: 'furniture' },
  { id: 'shop_f_rug', name: '구름 러그', price: 900, icon: '☁️', gives: { f_cloudrug: 1 }, desc: '폭신폭신', kind: 'furniture' },
];

/** DIY 레시피 — P0 22개 */
export interface Recipe { id: string; name: string; icon: string; needs: Record<string, number>; gives: string; kind: '가구' | '도구' | '탈것 부품' }
export const RECIPES: Recipe[] = [
  { id: 'r_raft', name: '통나무 뗏목', icon: '🛶', needs: { m_wood: 10, m_vine: 4 }, gives: 'v_raft', kind: '탈것 부품' },
  { id: 'r_sail', name: '꽃잎 돛', icon: '⛵', needs: { m_petal: 8, m_vine: 3 }, gives: 'p_sail', kind: '탈것 부품' },
  { id: 'r_engine', name: '통통 엔진', icon: '⚙️', needs: { m_iron: 4, m_volcanic: 2 }, gives: 'p_engine', kind: '탈것 부품' },
  { id: 'r_balloon', name: '열기구 풍선', icon: '🎈', needs: { m_petal: 12, m_wood: 4 }, gives: 'p_balloon', kind: '탈것 부품' },
  { id: 'r_sled', name: '눈 썰매', icon: '🛷', needs: { m_hardwood: 6, m_icecrystal: 2 }, gives: 'v_sled', kind: '탈것 부품' },
  { id: 'r_rocketwing', name: '로켓 날개', icon: '🚀', needs: { m_feather: 4, m_honey: 2, m_iron: 2 }, gives: 'p_rocketwing', kind: '탈것 부품' },
  { id: 'r_fuel', name: '별빛 연료', icon: '⛽', needs: { m_stardust: 2, m_starapple: 3 }, gives: 'p_fuel', kind: '탈것 부품' },
  { id: 'r_rod', name: '튼튼 낚싯대', icon: '🎣', needs: { m_wood: 5, m_vine: 2 }, gives: 'tool_rod', kind: '도구' },
  { id: 'r_net', name: '튼튼 잠자리채', icon: '🥅', needs: { m_wood: 4, m_vine: 3 }, gives: 'tool_net', kind: '도구' },
  { id: 'r_shovel', name: '튼튼 삽', icon: '🪏', needs: { m_wood: 3, m_iron: 1 }, gives: 'tool_shovel', kind: '도구' },
  { id: 'r_goldrod', name: '황금 낚싯대', icon: '✨', needs: { m_gold: 1, m_pearl: 1, m_wood: 5 }, gives: 'tool_goldrod', kind: '도구' },
  { id: 'r_snorkel', name: '조개 스노클', icon: '🤿', needs: { m_shell: 6, m_seaweed: 4 }, gives: 'tool_snorkel', kind: '도구' },
  { id: 'r_lure', name: '조개 루어', icon: '🪝', needs: { m_shell: 3, m_iron: 1 }, gives: 'bait_lure', kind: '도구' },
  { id: 'r_mushlamp', name: '버섯 램프', icon: '🍄', needs: { m_spore: 4, m_glowcap: 2 }, gives: 'f_mushlamp', kind: '가구' },
  { id: 'r_corallamp', name: '산호 램프', icon: '🪸', needs: { m_coral: 3, m_pearl: 1 }, gives: 'f_corallamp', kind: '가구' },
  { id: 'r_shellbed', name: '조개 침대', icon: '🛏️', needs: { m_shell: 10, m_wood: 6 }, gives: 'f_shellbed', kind: '가구' },
  { id: 'r_pot', name: '도자기 화분', icon: '🪴', needs: { m_clay: 4 }, gives: 'f_pot', kind: '가구' },
  { id: 'r_amberlamp', name: '호박 램프', icon: '🏮', needs: { m_amber: 1, m_wood: 3 }, gives: 'f_amberlamp', kind: '가구' },
  { id: 'r_fruitbasket', name: '과일 바구니', icon: '🧺', needs: { m_apple: 2, m_peach: 2, m_wood: 2 }, gives: 'f_fruitbasket', kind: '가구' },
  { id: 'r_flowercrown', name: '꽃 화관', icon: '💐', needs: { m_petal: 6, m_feather: 1 }, gives: 'f_flowercrown', kind: '가구' },
  { id: 'r_tank', name: '모래유리 수조', icon: '🐠', needs: { m_sandglass: 3, m_stone: 4 }, gives: 'f_tank', kind: '가구' },
  { id: 'r_spacechair', name: '운석 의자', icon: '🪐', needs: { m_meteor: 2, m_moonrock: 1 }, gives: 'f_spacechair', kind: '가구' },
  { id: 'r_bench', name: '통나무 벤치', icon: '🪑', needs: { m_wood: 6, m_stone: 2 }, gives: 'f_bench', kind: '가구' },
];

/** 상점·제작으로 얻는 물건 이름 */
export const GOODS: Record<string, { name: string; icon: string }> = {};
for (const s of SHOP_ITEMS) for (const k of Object.keys(s.gives)) GOODS[k] = { name: s.name.replace(/ ×\d+$/, ''), icon: s.icon };
for (const r of RECIPES) GOODS[r.gives] = { name: r.name, icon: r.icon };

/** 보물상자 등급 */
export type ChestTier = 'common' | 'rare' | 'epic' | 'legend';
export const TIERS: Record<ChestTier, { name: string; color: string; glow: string; weight: number; coins: [number, number]; mats: number; stars: number }> = {
  common: { name: '일반', color: '#9be7a6', glow: '#d9ffe0', weight: 70, coins: [60, 180], mats: 1, stars: 0 },
  rare: { name: '희귀', color: '#7cc8ff', glow: '#d6efff', weight: 22, coins: [300, 700], mats: 2, stars: 1 },
  epic: { name: '영웅', color: '#c48bff', glow: '#f0dcff', weight: 6.5, coins: [1200, 2600], mats: 3, stars: 3 },
  legend: { name: '전설', color: '#ffc94a', glow: '#fff3c4', weight: 1.5, coins: [6000, 12000], mats: 4, stars: 10 },
};
/** 천장: 영웅 이상 30회, 전설 90회 */
export const PITY = { epic: 30, legend: 90 };

/** 도감 카테고리 탭 */
export const DEX_TABS: Array<{ id: string; name: string; icon: string; cats: string[] }> = [
  { id: 'fish', name: '물고기', icon: '🐟', cats: ['fish'] },
  { id: 'sea', name: '바다', icon: '🐙', cats: ['sea'] },
  { id: 'bug', name: '곤충', icon: '🦋', cats: ['bug', 'insect'] },
  { id: 'dino', name: '공룡', icon: '🦕', cats: ['dino'] },
  { id: 'fossil', name: '화석', icon: '🦴', cats: ['fossil'] },
  { id: 'space', name: '우주', icon: '🪐', cats: ['space'] },
];

export const CAT_ICON: Record<string, string> = { fish: '🐟', sea: '🐙', bug: '🦋', insect: '🦋', dino: '🦕', fossil: '🦴', space: '🪐', item: '📦' };
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
