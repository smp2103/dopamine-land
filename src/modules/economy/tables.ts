// economy 큰 표 — 재료(GDD 4.3)·상점 품목(4.5)·DIY 레시피 49개(4.6)·물건 이름표.
// 부수효과 없는 순수 데이터. 다른 모듈은 여기 말고 economy/data.ts 에서 가져다 쓴다(data.ts 가 다시 내보낸다).
// 탈것 도감 칸(v_*)은 vehicles 담당이라 여기엔 없다 — 탈것 상품·레시피는 해금 키(v:*)만 연다.

// ── 공통 타입 ────────────────────────────────────────────────

/** 비용: 코인·반짝별·아이템(id → 개수) */
export interface Cost { coins?: number; stars?: number; items?: Record<string, number> }

/** 재료·쓰레기·잡동사니 태그 */
export type MatTag = 'junk' | 'space-goods' | 'fruit' | 'misc' | `specialty:${string}`;

/** 재료(category 'item') — 아이콘은 HUD 에서 둥근 칩 + 그림 글자로 */
export interface Material {
  id: string;
  name: string;
  /** 기본 판매가(코인). noSell 이면 0 */
  price: number;
  icon: string;
  color: string;
  tags: MatTag[];
  /** 나는 섬(특산·과일) */
  origin?: string;
  /** 주요 쓰임 한 줄 */
  desc?: string;
  /** 팔 수 없음(병편지·녹슨 열쇠·별조각 …) */
  noSell?: true;
  /** 줍는 즉시 바뀌는 것 — 'keypiece:silver' = 은열쇠 조각 +1 (가방에 안 들어감) */
  onObtain?: string;
  /** 다른 섬에서 팔 때 기본가(과일 300, GDD 4.3) */
  foreignPrice?: number;
}

export type ShopId =
  | 'quack' | 'shipyard' | 'peng' | 'beach' | 'bazaar' | 'diving'
  | 'potion' | 'moon' | 'junk' | 'station' | 'sheep' | 'capsule';

export type ShopKind =
  | 'bait' | 'tool' | 'seed' | 'furniture' | 'vehicle' | 'bag' | 'recipe'
  | 'capsule' | 'house' | 'licence' | 'invite' | 'wing' | 'rocket';

/** 상점 품목(4.5). P0 가격은 p0Cost 가 있으면 그것, 없으면 cost 의 각 수치 ceil(x/5) */
export interface ShopItem {
  id: string;
  name: string;
  icon: string;
  shop: ShopId;
  cost: Cost;
  p0Cost?: Cost;
  /** 사면 가방에 들어오는 것(없으면 {}) */
  gives: Record<string, number>;
  /** 사면 열리는 해금 키(4.8) */
  unlock?: string;
  /** 살 수 있는 조건 — parseGate 로 읽는다. 'cond:<counter><n>' 또는 해금 키 */
  gate?: string;
  /** P0 에서 바뀌는 조건: null = P0 에선 조건 없음 */
  p0Gate?: string | null;
  /** P0 에선 처음부터 열려 있음(박물관 동) */
  p0Unlocked?: true;
  /** 한 번만 살 수 있음 */
  once?: true;
  /** 순서대로 사는 묶음(가방·집) 안의 순번 */
  seq?: number;
  kind: ShopKind;
  desc: string;
  /** P1 품목(오늘 밤엔 진열만) */
  p1?: true;
  /** @deprecated 예전 코드 호환 — cost.coins ?? 0 */
  price: number;
}

export type RecipeKind = '도구' | '미끼' | '요리' | '탈것 부품' | '로켓 부품' | '섬 개발' | '가구';

/** DIY 레시피(4.6) */
export interface Recipe {
  id: string;
  name: string;
  icon: string;
  /** 재료 id → 개수. 'any:*' 는 ANY_NEEDS 로 읽는다 */
  needs: Record<string, number>;
  /** P0 재료(없으면 needsOf 가 ceil(n/5)) */
  p0Needs?: Record<string, number>;
  /** 만들면 가방에 들어오는 것(해금만 하는 레시피는 {}) */
  gives: Record<string, number>;
  /** 만들면 열리는 해금 키 */
  unlock?: string;
  /** 'base' | 'card:<반짝별>' | 'cond:<counter><n>' | 해금 키 — parseGate 로 읽는다 */
  gate: string;
  /** P0 에서 바뀌는 조건: null = P0 에선 조건 없음 */
  p0Gate?: string | null;
  /** 조건을 사람 말로(게시판·작업대 힌트) */
  hint?: string;
  kind: RecipeKind;
  /** 먹으면 걸리는 버프(게임 분) */
  effect?: { buff: string; minutes: number };
  desc: string;
  pri: 'P0' | 'P1';
  /** GDD 표 밖의 예전 레시피(호환용) */
  extra?: true;
}

// ── 4.3 재료 ────────────────────────────────────────────────

const F300 = 300;
export const MATERIAL_TABLE: Material[] = [
  // 기본 재료
  { id: 'm_wood', name: '나무', price: 20, icon: '🪵', color: '#e8c39a', tags: [], desc: '모든 DIY, 뗏목, 다리' },
  { id: 'm_hardwood', name: '단단한 나무', price: 40, icon: '🪵', color: '#c99a6b', tags: [], desc: '로켓 동체, 썰매' },
  { id: 'm_stone', name: '돌', price: 15, icon: '🪨', color: '#cfd3dc', tags: [], desc: '등대, 다리, 망치' },
  { id: 'm_clay', name: '점토', price: 30, icon: '🟤', color: '#e9b48f', tags: [], desc: '화분, 도자기 가구' },
  { id: 'm_iron', name: '철광석', price: 150, icon: '⛓️', color: '#b9c3d6', tags: [], desc: '도구 업그레이드, 배, 로켓' },
  { id: 'm_gold', name: '금광석', price: 1500, icon: '🥇', color: '#ffe08a', tags: [], desc: '황금 도구, 황금 미끼, 로켓 엔진' },
  { id: 'm_vine', name: '덩굴 밧줄', price: 30, icon: '🌿', color: '#bfe6a5', tags: [], desc: '뗏목, 돛' },
  { id: 'm_petal', name: '꽃잎', price: 15, icon: '🌸', color: '#ffc9dc', tags: ['specialty:home'], origin: 'home', desc: '돛, 화관, 열기구' },
  { id: 'm_honey', name: '꿀', price: 200, icon: '🍯', color: '#ffd77a', tags: ['specialty:home'], origin: 'home', desc: '황금 미끼, 로켓 날개, 요리' },
  { id: 'm_shell', name: '조개껍데기', price: 30, icon: '🐚', color: '#ffe3d1', tags: [], desc: '스노클, 루어, 조개 가구' },
  { id: 'm_seaweed', name: '해초', price: 20, icon: '🌱', color: '#a8e0c2', tags: [], desc: '잠수복, 산소 캡슐' },
  { id: 'm_coral', name: '산호 조각', price: 120, icon: '🪸', color: '#ffb3a7', tags: ['specialty:coral'], origin: 'coral', desc: '잠수복, 산호 램프, 산소 캡슐' },
  { id: 'm_pearl', name: '진주', price: 2000, icon: '🫧', color: '#f3eefe', tags: ['specialty:coral'], origin: 'coral', desc: '황금 낚싯대, 잠수복, 램프' },
  { id: 'm_spore', name: '버섯 포자', price: 60, icon: '🍄', color: '#ffc1c1', tags: [], origin: 'mushroom', desc: '요리, 버섯 가구' },
  { id: 'm_glowcap', name: '발광 버섯', price: 150, icon: '🍄', color: '#c9f1ff', tags: ['specialty:mushroom'], origin: 'mushroom', desc: '잠수정 조명, 버섯 램프' },
  { id: 'm_icecrystal', name: '얼음 결정', price: 300, icon: '❄️', color: '#cdeeff', tags: ['specialty:ice'], origin: 'ice', desc: '로켓 조종석 창, 썰매' },
  { id: 'm_sandglass', name: '모래유리', price: 300, icon: '🔶', color: '#ffe2b0', tags: ['specialty:desert'], origin: 'desert', desc: '로켓 창, 수조, 랜턴' },
  { id: 'm_volcanic', name: '화산유리', price: 300, icon: '🔻', color: '#ffb0a0', tags: ['specialty:dino'], origin: 'dino', desc: '로켓 엔진, 통통 엔진, 부화기' },
  { id: 'm_amber', name: '호박', price: 800, icon: '🟠', color: '#ffcf8a', tags: [], origin: 'dino', desc: '호박 램프, 로켓 연료 첨가' },
  { id: 'm_feather', name: '깃털', price: 120, icon: '🪶', color: '#e6dcff', tags: ['specialty:dino'], origin: 'dino', desc: '로켓 날개, 화관' },
  { id: 'm_fern', name: '고사리', price: 15, icon: '🌿', color: '#c4ebb0', tags: [], origin: 'dino', desc: '초식 공룡 먹이' },
  { id: 'm_ginkgo', name: '은행', price: 40, icon: '🌰', color: '#f3e08a', tags: [], origin: 'dino', desc: '공룡 먹이, 요리' },
  { id: 'm_stardust', name: '별가루', price: 500, icon: '✨', color: '#fff2a8', tags: ['specialty:launch'], origin: 'launch', desc: '로켓 연료, 행운 쿠키, 황금 잠자리채' },
  { id: 'm_starapple', name: '별사과', price: 400, icon: '🍎', color: '#ffc4c4', tags: ['specialty:launch'], origin: 'launch', desc: '로켓 연료' },
  { id: 'm_meteor', name: '운석 조각', price: 600, icon: '☄️', color: '#d8c8ff', tags: [], origin: 'launch', desc: '우주 가구, 로켓' },
  { id: 'm_moonrock', name: '월석', price: 1200, icon: '🌕', color: '#f1f0e4', tags: ['space-goods'], origin: 'moon', desc: '우주 가구, 지구에서 고가 판매' },
  { id: 'm_frostberry', name: '서리 열매', price: 120, icon: '🫐', color: '#c9dcff', tags: ['fruit'], origin: 'ice', foreignPrice: F300, desc: '매머드 먹이, 셔벗' },
  // 과일 5종(말랑섬) + 열대 과일 — 다른 섬에서 팔면 300
  { id: 'm_apple', name: '사과', price: 100, icon: '🍎', color: '#ffb8b8', tags: ['fruit'], origin: 'home', foreignPrice: F300, desc: '먹기(힘), 요리, 공룡 먹이, 선물' },
  { id: 'm_peach', name: '복숭아', price: 100, icon: '🍑', color: '#ffd0bd', tags: ['fruit'], origin: 'home', foreignPrice: F300, desc: '먹기(힘), 요리, 공룡 먹이, 선물' },
  { id: 'm_cherry', name: '체리', price: 100, icon: '🍒', color: '#ffb3c6', tags: ['fruit'], origin: 'home', foreignPrice: F300, desc: '먹기(힘), 요리, 공룡 먹이, 선물' },
  { id: 'm_orange', name: '오렌지', price: 100, icon: '🍊', color: '#ffd29a', tags: ['fruit'], origin: 'home', foreignPrice: F300, desc: '먹기(힘), 요리, 공룡 먹이, 선물' },
  { id: 'm_pear', name: '배', price: 100, icon: '🍐', color: '#e8f0a8', tags: ['fruit'], origin: 'home', foreignPrice: F300, desc: '먹기(힘), 요리, 공룡 먹이, 선물' },
  { id: 'm_coconut', name: '코코넛', price: 150, icon: '🥥', color: '#e7d2bf', tags: ['fruit'], origin: 'coral', foreignPrice: F300, desc: '먹기(힘), 요리, 공룡 먹이, 선물' },
  { id: 'm_banana', name: '바나나', price: 150, icon: '🍌', color: '#fff0a0', tags: ['fruit'], origin: 'coral', foreignPrice: F300, desc: '먹기(힘), 요리, 공룡 먹이, 선물' },
  { id: 'm_date', name: '대추야자', price: 150, icon: '🌴', color: '#e8b98a', tags: ['fruit'], origin: 'desert', foreignPrice: F300, desc: '먹기(힘), 요리, 공룡 먹이, 선물' },
  // 그 밖의 재료
  { id: 'm_balloon_scrap', name: '풍선 조각', price: 50, icon: '🎈', color: '#ffc6e0', tags: [], desc: '열기구' },
  { id: 'm_cactusflower', name: '선인장꽃', price: 150, icon: '🌵', color: '#ffb8e8', tags: [], origin: 'desert', desc: '선인장 화분' },
  { id: 'm_moonflower', name: '달맞이꽃', price: 600, icon: '🌼', color: '#fff6c8', tags: ['space-goods'], origin: 'moon', desc: '우주 가구, 선물' },
  { id: 'm_mochi', name: '달떡', price: 300, icon: '🍡', color: '#fff0f4', tags: ['space-goods'], origin: 'moon', desc: '우주 상점 화폐(P1)' },
  // 쓰레기(낚시) — 너구리 고물상 10코인
  { id: 't_boot', name: '헌 장화', price: 10, icon: '🥾', color: '#c8b6a6', tags: ['junk'], desc: '장화 화분, 너구리 고물상' },
  { id: 't_can', name: '찌그러진 깡통', price: 10, icon: '🥫', color: '#d6dbe3', tags: ['junk'], desc: '깡통 로봇, 너구리 고물상' },
  { id: 't_tire', name: '헌 타이어', price: 10, icon: '🛞', color: '#bdb8c6', tags: ['junk'], desc: '재활용 DIY, 너구리 고물상' },
  { id: 't_bottle', name: '병편지', price: 0, icon: '🍾', color: '#cfeee6', tags: ['junk'], noSell: true, desc: '열면 보물지도·레시피·주민 사연' },
  { id: 't_rustykey', name: '녹슨 열쇠', price: 0, icon: '🗝️', color: '#e0c3a0', tags: ['junk'], noSell: true, onObtain: 'keypiece:silver', desc: '줍는 즉시 은열쇠 조각 +1' },
  // 잡동사니(it_) — 팔지 않는 것들
  { id: 'it_capsule', name: '캡슐 티켓', price: 0, icon: '🎫', color: '#ffd6f0', tags: ['misc'], noSell: true, desc: '두근두근 캡슐머신 1회' },
  { id: 'it_oxygen', name: '산소 캡슐', price: 50, icon: '🫙', color: '#d4f2ff', tags: ['misc'], desc: '달 체류(1개 = 게임 4시간)' },
  ...[1, 2, 3, 4, 5, 6, 7].map((n): Material => ({
    id: `it_starpiece_${n}`, name: `별조각 ${'①②③④⑤⑥⑦'[n - 1]}`, price: 0, icon: '⭐', color: '#fff0a8', tags: ['misc'], noSell: true, desc: '섬 주인 부탁 체인의 마지막 선물',
  })),
  { id: 'it_map', name: '보물지도', price: 0, icon: '🗺️', color: '#f6e2b8', tags: ['misc'], noSell: true, desc: '쪼꼬미섬 X 에 금상자가!' },
  { id: 'it_letter', name: '주민 편지', price: 0, icon: '💌', color: '#ffe0e8', tags: ['misc'], noSell: true, desc: '읽으면 반짝별 3' },
  { id: 'it_blackbox', name: '블랙박스', price: 0, icon: '📦', color: '#c9c3d9', tags: ['misc'], noSell: true, desc: '추락한 탐사선의 기록' },
  { id: 'it_invite', name: '주민 초대권', price: 0, icon: '🎟️', color: '#ffe9b0', tags: ['misc'], noSell: true, desc: '새 주민을 섬으로 불러요' },
];

// ── 물건 이름표(상점·제작 결과) — v_* 는 넣지 않는다 ──────────────

export const GOODS_TABLE: Record<string, { name: string; icon: string }> = {
  // 도구(벨트)
  tool_rod: { name: '낚싯대', icon: '🎣' },
  tool_net: { name: '잠자리채', icon: '🥅' },
  tool_shovel: { name: '삽', icon: '🪏' },
  tool_hammer: { name: '돌망치', icon: '🔨' },
  tool_slingshot: { name: '새총', icon: '🎯' },
  tool_goodrod: { name: '좋은 낚싯대', icon: '🎣' },
  tool_goldrod: { name: '황금 낚싯대', icon: '✨' },
  tool_goodnet: { name: '좋은 잠자리채', icon: '🥅' },
  tool_goldnet: { name: '황금 잠자리채', icon: '✨' },
  tool_snorkel: { name: '스노클 마스크', icon: '🤿' },
  tool_wetsuit: { name: '잠수복', icon: '🩱' },
  tool_wateringcan: { name: '물뿌리개', icon: '🚿' },
  // 미끼
  bait_worm: { name: '지렁이 미끼', icon: '🪱' },
  bait_dough: { name: '떡밥', icon: '🍡' },
  bait_lure: { name: '반짝 루어', icon: '🪝' },
  bait_golden: { name: '황금 미끼', icon: '🌟' },
  bait_lava: { name: '화산 미끼', icon: '🌋' },
  // 씨앗
  seed_tulip: { name: '튤립 씨앗', icon: '🌷' },
  seed_sunflower: { name: '해바라기 씨앗', icon: '🌻' },
  seed_apple: { name: '사과 묘목', icon: '🌳' },
  // 탈것 부품(p_)
  p_sail: { name: '꽃잎 돛', icon: '⛵' },
  p_engine: { name: '통통 엔진', icon: '⚙️' },
  p_sub_hull: { name: '잠수정 선체', icon: '🛟' },
  p_balloon: { name: '열기구 풍선', icon: '🎈' },
  // 먹을거리·키트(it_)
  it_grilled_fish: { name: '생선구이', icon: '🍢' },
  it_fruit_pie: { name: '과일 파이', icon: '🥧' },
  it_lucky_cookie: { name: '행운 쿠키', icon: '🥠' },
  it_lighthouse_kit: { name: '등대 수리 키트', icon: '🗼' },
  it_bridge_kit: { name: '다리 키트', icon: '🌉' },
  // 가구(f_)
  f_tank: { name: '물고기 수조', icon: '🐠' },
  f_bugcage: { name: '곤충 케이지', icon: '🦗' },
  f_fireflylantern: { name: '반딧불 랜턴', icon: '🏮' },
  f_figure: { name: '피규어', icon: '🧸' },
  f_shellbed: { name: '조개 침대', icon: '🛏️' },
  f_corallamp: { name: '산호 램프', icon: '🪸' },
  f_amberlamp: { name: '호박 램프', icon: '🏮' },
  f_mushlamp: { name: '버섯 램프', icon: '🍄' },
  f_bootplanter: { name: '장화 화분', icon: '🥾' },
  f_canrobot: { name: '깡통 로봇', icon: '🤖' },
  f_boneslide: { name: '뼈 미끄럼틀', icon: '🦴' },
  f_cactuspot: { name: '선인장 화분', icon: '🌵' },
  f_incubator: { name: '공룡 부화기', icon: '🥚' },
  f_flowercrown: { name: '화관', icon: '💐' },
  f_spacelamp: { name: '월석 램프', icon: '🌕' },
  f_pot: { name: '도자기 화분', icon: '🪴' },
  f_fruitbasket: { name: '과일 바구니', icon: '🧺' },
  f_bench: { name: '통나무 벤치', icon: '🪑' },
  f_spacechair: { name: '운석 의자', icon: '🪐' },
  f_cloudrug: { name: '구름 러그', icon: '☁️' },
  f_pastelchair: { name: '말랑 의자', icon: '🪑' },
  f_shellclock: { name: '조개 시계', icon: '🕰️' },
  f_rainbowlamp: { name: '무지개 램프', icon: '🌈' },
  f_starthrone: { name: '별빛 왕좌', icon: '👑' },
};

// ── 레시피 재료 칸의 '아무거나' 표기 ─────────────────────────────

/** 레시피 needs 의 'any:*' 토큰 — 이름·아이콘·고르는 규칙 */
export interface AnyNeed {
  name: string;
  icon: string;
  /** 카테고리 조건(생물) */
  cat?: string;
  /** 희귀도 조건 */
  rarity?: number;
  /** 태그 조건('fruit' · 'specialty:' 는 접두어) */
  tag?: string;
  /** id 접두어 조건 */
  prefix?: string;
  /** 전부 같은 종이어야 함 */
  same?: true;
  /** 이미 1개 이상 남겨 둔 중복분만 */
  dupOnly?: true;
}
export const ANY_NEEDS: Record<string, AnyNeed> = {
  'any:fish': { name: '물고기 아무거나', icon: '🐟', cat: 'fish' },
  'any:fish:1': { name: '★1 물고기', icon: '🐟', cat: 'fish', rarity: 1 },
  'any:bug': { name: '곤충 아무거나', icon: '🦋', cat: 'bug' },
  'any:fruit': { name: '과일 아무거나', icon: '🍎', tag: 'fruit' },
  'any:specialty': { name: '섬 특산 재료', icon: '🏝️', tag: 'specialty:', same: true },
  'any:same': { name: '같은 종 생물', icon: '🧸', same: true },
  'any:fosdup': { name: '중복 화석 조각', icon: '🦴', prefix: 'fos_', dupOnly: true },
};

// ── 4.6 DIY 레시피 49개 (+ 예전 가구 레시피 호환분) ────────────────

export const RECIPE_TABLE: Recipe[] = [
  // 기본 도구
  { id: 'r_rod', name: '낚싯대', icon: '🎣', needs: { m_wood: 5 }, gives: { tool_rod: 1 }, unlock: 'tool:rod', gate: 'base', kind: '도구', desc: '낚시 (처음 지급)', pri: 'P0' },
  { id: 'r_net', name: '잠자리채', icon: '🥅', needs: { m_wood: 5, m_vine: 1 }, gives: { tool_net: 1 }, unlock: 'tool:net', gate: 'base', kind: '도구', desc: '곤충 (처음 지급)', pri: 'P0' },
  { id: 'r_shovel', name: '삽', icon: '🪏', needs: { m_wood: 5, m_iron: 2 }, gives: { tool_shovel: 1 }, unlock: 'tool:shovel', gate: 'base', kind: '도구', desc: '화석·지렁이 파기', pri: 'P0' },
  { id: 'r_hammer', name: '돌망치', icon: '🔨', needs: { m_wood: 5, m_stone: 5 }, gives: { tool_hammer: 1 }, unlock: 'tool:hammer', gate: 'base', kind: '도구', desc: '돌 두드리기·나무 베기', pri: 'P0' },
  { id: 'r_slingshot', name: '새총', icon: '🎯', needs: { m_wood: 10 }, gives: { tool_slingshot: 1 }, unlock: 'tool:slingshot', gate: 'base', kind: '도구', desc: '풍선 선물 맞추기', pri: 'P0' },
  { id: 'r_watering_can', name: '물뿌리개', icon: '🚿', needs: { m_wood: 3, m_iron: 2 }, gives: { tool_wateringcan: 1 }, unlock: 'tool:wateringcan', gate: 'base', kind: '도구', desc: '꽃·묘목에 물 주기', pri: 'P0' },
  // 도구 업그레이드
  { id: 'r_good_rod', name: '좋은 낚싯대', icon: '🎣', needs: { m_wood: 10, m_iron: 3 }, gives: { tool_goodrod: 1 }, unlock: 'tool:goodrod', gate: 'cond:fish30', hint: '낚시 30번 하면 떠올라요', kind: '도구', desc: '입질 창 +0.1초, ★3+ +5%', pri: 'P0' },
  { id: 'r_golden_rod', name: '황금 낚싯대', icon: '✨', needs: { tool_goodrod: 1, m_gold: 5, m_pearl: 1 }, gives: { tool_goldrod: 1 }, unlock: 'tool:goldrod', gate: 'cond:fish300', hint: '낚시 300번의 달인에게', kind: '도구', desc: '★4+ +10%, 줄다리기 쉬움', pri: 'P0' },
  { id: 'r_good_net', name: '좋은 잠자리채', icon: '🥅', needs: { m_wood: 10, m_iron: 3 }, gives: { tool_goodnet: 1 }, unlock: 'tool:goodnet', gate: 'cond:bug30', hint: '곤충 30마리 잡으면 떠올라요', kind: '도구', desc: '범위 +30%', pri: 'P0' },
  { id: 'r_golden_net', name: '황금 잠자리채', icon: '✨', needs: { tool_goodnet: 1, m_gold: 5, m_stardust: 3 }, gives: { tool_goldnet: 1 }, unlock: 'tool:goldnet', gate: 'cond:bug300', hint: '곤충 300마리의 달인에게', kind: '도구', desc: '★4+ +10%, 반짝이 ×2', pri: 'P0' },
  // 잠수
  { id: 'r_snorkel', name: '스노클 마스크', icon: '🤿', needs: { m_shell: 5, m_seaweed: 5, m_iron: 1 }, gives: { tool_snorkel: 1 }, unlock: 'tool:snorkel', gate: 'base', kind: '도구', desc: '잠수 40초', pri: 'P0' },
  { id: 'r_wetsuit', name: '잠수복', icon: '🩱', needs: { m_seaweed: 20, m_coral: 10, m_pearl: 1 }, gives: { tool_wetsuit: 1 }, unlock: 'tool:wetsuit', gate: 'card:30', kind: '도구', desc: '잠수 90초, 산호초 깊은 곳', pri: 'P0' },
  { id: 'r_oxygen', name: '산소 캡슐 ×3', icon: '🫙', needs: { m_seaweed: 3, m_coral: 1 }, gives: { it_oxygen: 3 }, gate: 'facility:spacecenter', p0Gate: null, hint: '우주센터가 생기면 만들 수 있어요', kind: '도구', desc: '달 체류(1개 = 게임 4시간)', pri: 'P0' },
  // 미끼
  { id: 'r_worm_bait', name: '지렁이 미끼 ×3', icon: '🪱', needs: { 'any:fruit': 1 }, gives: { bait_worm: 3 }, gate: 'base', kind: '미끼', desc: '기본 미끼', pri: 'P0' },
  { id: 'r_dough_bait', name: '떡밥 ×3', icon: '🍡', needs: { 'any:fruit': 2, m_petal: 2 }, gives: { bait_dough: 3 }, gate: 'base', kind: '미끼', desc: '★2+ ×1.3', pri: 'P0' },
  { id: 'r_shiny_lure', name: '반짝 루어', icon: '🪝', needs: { m_shell: 3, m_iron: 1 }, gives: { bait_lure: 1 }, gate: 'card:10', kind: '미끼', desc: '★3+ ×1.5', pri: 'P0' },
  { id: 'r_golden_bait', name: '황금 미끼', icon: '🌟', needs: { m_gold: 1, m_honey: 1 }, gives: { bait_golden: 1 }, gate: 'card:30', kind: '미끼', desc: '★5 ×3', pri: 'P0' },
  { id: 'r_lava_bait', name: '화산 미끼', icon: '🌋', needs: { m_volcanic: 1, bait_worm: 3 }, gives: { bait_lava: 1 }, gate: 'recipe:r_lava_bait', hint: '상자에서 레시피 카드가 나와요', kind: '미끼', desc: '용암붕어 ×3', pri: 'P1' },
  // 요리
  { id: 'r_grilled_fish', name: '생선구이', icon: '🍢', needs: { 'any:fish:1': 3, m_wood: 2 }, gives: { it_grilled_fish: 1 }, gate: 'base', kind: '요리', effect: { buff: 'grilled', minutes: 30 }, desc: '게임 30분 동안 ★3+ +20%', pri: 'P0' },
  { id: 'r_fruit_pie', name: '과일 파이', icon: '🥧', needs: { 'any:fruit': 5, m_honey: 1 }, gives: { it_fruit_pie: 1 }, gate: 'card:10', kind: '요리', effect: { buff: 'speed', minutes: 10 }, desc: '게임 10분 동안 이동 속도 +20%', pri: 'P1' },
  { id: 'r_lucky_cookie', name: '행운 쿠키', icon: '🥠', needs: { m_stardust: 1, m_honey: 1 }, gives: { it_lucky_cookie: 1 }, gate: 'cond:wish1', hint: '유성우에 소원을 빌면 떠올라요', kind: '요리', effect: { buff: 'lucky', minutes: 1440 }, desc: '하루 동안 반짝이 확률 ×2', pri: 'P1' },
  // 탈것·부품
  { id: 'r_raft', name: '통나무 뗏목', icon: '🛶', needs: { m_wood: 20, m_vine: 5 }, p0Needs: { m_wood: 4, m_vine: 1 }, gives: {}, unlock: 'v:raft', gate: 'base', hint: '곰 몽실이 뗏목 얘기를 해 줘요', kind: '탈것 부품', desc: '뗏목 해금 → 바다 너머로!', pri: 'P0' },
  { id: 'r_sail', name: '꽃잎 돛', icon: '⛵', needs: { m_petal: 20, m_vine: 10 }, gives: { p_sail: 1 }, gate: 'card:20', kind: '탈것 부품', desc: '돛단요트 부품', pri: 'P1' },
  { id: 'r_engine', name: '통통 엔진', icon: '⚙️', needs: { m_iron: 15, m_volcanic: 5 }, gives: { p_engine: 1 }, gate: 'card:30', kind: '탈것 부품', desc: '모터보트 부품', pri: 'P0' },
  { id: 'r_sub_hull', name: '잠수정 선체', icon: '🛟', needs: { m_iron: 30, m_sandglass: 10, m_glowcap: 5 }, gives: { p_sub_hull: 1 }, gate: 'facility:diving', hint: '다이빙 센터에서 알려 줘요', kind: '탈것 부품', desc: '잠수정 부품', pri: 'P1' },
  { id: 'r_balloon', name: '열기구 풍선', icon: '🎈', needs: { m_balloon_scrap: 30, m_petal: 30, m_vine: 10 }, gives: { p_balloon: 1 }, gate: 'cond:balloon30', hint: '풍선 선물 30개를 터뜨려 봐요', kind: '탈것 부품', desc: '열기구 부품', pri: 'P1' },
  { id: 'r_sled', name: '펭귄 썰매', icon: '🛷', needs: { m_hardwood: 10, m_icecrystal: 5 }, gives: {}, unlock: 'v:sled', gate: 'cond:visit_ice1', hint: '솜눈섬에 가 보면 떠올라요', kind: '탈것 부품', desc: '썰매 해금', pri: 'P1' },
  // 로켓 부품(설계도 필요)
  { id: 'r_rocket_body', name: '로켓 동체', icon: '🚀', needs: { m_iron: 40, m_hardwood: 20 }, gives: {}, unlock: 'rocket:part:body', gate: 'rocket:blueprint', hint: '펭박사의 로켓 설계도가 필요해요', kind: '로켓 부품', desc: '로켓 부품 ① 동체', pri: 'P0' },
  { id: 'r_rocket_engine', name: '로켓 엔진', icon: '🔥', needs: { m_volcanic: 15, m_gold: 10 }, gives: {}, unlock: 'rocket:part:engine', gate: 'rocket:blueprint', hint: '펭박사의 로켓 설계도가 필요해요', kind: '로켓 부품', desc: '로켓 부품 ② 엔진', pri: 'P0' },
  { id: 'r_rocket_window', name: '조종석 창', icon: '🪟', needs: { m_icecrystal: 10, m_sandglass: 10 }, gives: {}, unlock: 'rocket:part:window', gate: 'rocket:blueprint', hint: '펭박사의 로켓 설계도가 필요해요', kind: '로켓 부품', desc: '로켓 부품 ③ 조종석 창', pri: 'P0' },
  { id: 'r_rocket_wing', name: '로켓 날개', icon: '🪽', needs: { m_feather: 20, m_honey: 10 }, gives: {}, unlock: 'rocket:part:wing', gate: 'rocket:blueprint', hint: '펭박사의 로켓 설계도가 필요해요', kind: '로켓 부품', desc: '로켓 부품 ④ 날개', pri: 'P0' },
  { id: 'r_rocket_fuel', name: '반짝 연료', icon: '⛽', needs: { m_stardust: 50, m_starapple: 10 }, gives: {}, unlock: 'rocket:part:fuel', gate: 'rocket:blueprint', hint: '펭박사의 로켓 설계도가 필요해요', kind: '로켓 부품', desc: '로켓 부품 ⑤ 연료 (호박을 넣으면 품질 업은 P1)', pri: 'P0' },
  // 섬 개발
  { id: 'r_lighthouse_kit', name: '등대 수리 키트', icon: '🗼', needs: { m_stone: 30, m_iron: 5, 'any:specialty': 5 }, gives: { it_lighthouse_kit: 1 }, gate: 'base', kind: '섬 개발', desc: '섬 개발 ① 등대 복구', pri: 'P0' },
  { id: 'r_bridge_kit', name: '다리 키트', icon: '🌉', needs: { m_wood: 30, m_stone: 10 }, gives: { it_bridge_kit: 1 }, gate: 'base', kind: '섬 개발', desc: '섬 개발 ② 부두·다리', pri: 'P1' },
  { id: 'r_incubator', name: '공룡 부화기', icon: '🥚', needs: { m_iron: 10, m_volcanic: 3, m_hardwood: 5 }, gives: { f_incubator: 1 }, gate: 'facility:fossillab', hint: '화석 연구소가 생기면 만들 수 있어요', kind: '섬 개발', desc: '공룡 알 부화(게임 3일)', pri: 'P1' },
  // 가구 14개
  { id: 'r_fish_tank', name: '물고기 수조', icon: '🐠', needs: { m_sandglass: 3, 'any:fish': 1 }, gives: { f_tank: 1 }, gate: 'base', kind: '가구', desc: '집에 그 물고기 전시(헤엄쳐요)', pri: 'P1' },
  { id: 'r_bug_cage', name: '곤충 케이지', icon: '🦗', needs: { m_wood: 5, 'any:bug': 1 }, gives: { f_bugcage: 1 }, gate: 'base', kind: '가구', desc: '집에 곤충 전시', pri: 'P1' },
  { id: 'r_firefly_lantern', name: '반딧불 랜턴', icon: '🏮', needs: { firefly: 3, m_sandglass: 1 }, gives: { f_fireflylantern: 1 }, gate: 'card:10', kind: '가구', desc: '밤에 빛나는 가구', pri: 'P1' },
  { id: 'r_figure', name: '피규어', icon: '🧸', needs: { 'any:same': 5 }, gives: { f_figure: 1 }, gate: 'facility:figure', hint: '피규어 공방이 생기면 만들 수 있어요', kind: '가구', desc: '그 종의 귀여운 피규어 가구', pri: 'P1' },
  { id: 'r_shell_bed', name: '조개 침대', icon: '🛏️', needs: { m_shell: 10, m_coral: 5 }, gives: { f_shellbed: 1 }, gate: 'recipe:r_shell_bed', hint: '상자에서 레시피 카드가 나와요', kind: '가구', desc: '폭신한 조개 침대', pri: 'P1' },
  { id: 'r_coral_lamp', name: '산호 램프', icon: '🪸', needs: { m_coral: 5, m_pearl: 1 }, gives: { f_corallamp: 1 }, gate: 'recipe:r_coral_lamp', hint: '상자에서 레시피 카드가 나와요', kind: '가구', desc: '은은한 바다빛', pri: 'P1' },
  { id: 'r_amber_lamp', name: '호박 램프', icon: '🏮', needs: { m_amber: 3, m_wood: 5 }, gives: { f_amberlamp: 1 }, gate: 'recipe:r_amber_lamp', hint: '상자에서 레시피 카드가 나와요', kind: '가구', desc: '따끈한 호박빛', pri: 'P1' },
  { id: 'r_mushroom_lamp', name: '버섯 램프', icon: '🍄', needs: { m_glowcap: 3, m_wood: 2 }, gives: { f_mushlamp: 1 }, gate: 'cond:visit_mushroom1', hint: '반딧불버섯섬에 가 보면 떠올라요', kind: '가구', desc: '몽글몽글 버섯빛', pri: 'P1' },
  { id: 'r_boot_planter', name: '장화 화분', icon: '🥾', needs: { t_boot: 1, m_petal: 3 }, gives: { f_bootplanter: 1 }, gate: 'base', kind: '가구', desc: '재활용 개그 가구', pri: 'P1' },
  { id: 'r_can_robot', name: '깡통 로봇', icon: '🤖', needs: { t_can: 5, m_iron: 1 }, gives: { f_canrobot: 1 }, gate: 'base', kind: '가구', desc: '삐걱삐걱 움직이는 재활용 가구', pri: 'P1' },
  { id: 'r_bone_slide', name: '뼈 미끄럼틀', icon: '🦴', needs: { 'any:fosdup': 5, m_wood: 10 }, gives: { f_boneslide: 1 }, gate: 'wing:fossil', hint: '박물관 화석관이 열리면 만들 수 있어요', kind: '가구', desc: '마당 놀이기구', pri: 'P1' },
  { id: 'r_cactus_pot', name: '선인장 화분', icon: '🌵', needs: { m_clay: 3, m_cactusflower: 1 }, gives: { f_cactuspot: 1 }, gate: 'cond:visit_desert1', hint: '모래시계섬에 가 보면 떠올라요', kind: '가구', desc: '뾰족 귀여운 화분', pri: 'P1' },
  { id: 'r_flower_crown', name: '화관', icon: '💐', needs: { m_petal: 10, m_feather: 1 }, gives: { f_flowercrown: 1 }, gate: 'card:10', kind: '가구', desc: '머리 장식', pri: 'P1' },
  { id: 'r_space_lamp', name: '월석 램프', icon: '🌕', needs: { m_moonrock: 3, m_meteor: 1 }, gives: { f_spacelamp: 1 }, gate: 'space:moon', hint: '달에 다녀오면 떠올라요', kind: '가구', desc: '우주 가구', pri: 'P1' },
  // 예전 가구 레시피(GDD 표 밖, 저장 호환용으로 남김)
  { id: 'r_pot', name: '도자기 화분', icon: '🪴', needs: { m_clay: 4 }, gives: { f_pot: 1 }, gate: 'base', kind: '가구', desc: '동글동글 화분', pri: 'P1', extra: true },
  { id: 'r_fruitbasket', name: '과일 바구니', icon: '🧺', needs: { m_apple: 2, m_peach: 2, m_wood: 2 }, gives: { f_fruitbasket: 1 }, gate: 'base', kind: '가구', desc: '향긋한 과일 바구니', pri: 'P1', extra: true },
  { id: 'r_bench', name: '통나무 벤치', icon: '🪑', needs: { m_wood: 6, m_stone: 2 }, gives: { f_bench: 1 }, gate: 'base', kind: '가구', desc: '앉아서 쉬어 가요', pri: 'P1', extra: true },
  { id: 'r_spacechair', name: '운석 의자', icon: '🪐', needs: { m_meteor: 2, m_moonrock: 1 }, gives: { f_spacechair: 1 }, gate: 'space:moon', kind: '가구', desc: '둥실 우주 의자', pri: 'P1', extra: true },
];

/** 예전 레시피 id → 새 id (저장·이벤트 호환) */
export const RECIPE_ALIASES: Record<string, string> = {
  r_goldrod: 'r_golden_rod',
  r_lure: 'r_shiny_lure',
  r_rocketwing: 'r_rocket_wing',
  r_fuel: 'r_rocket_fuel',
  r_mushlamp: 'r_mushroom_lamp',
  r_corallamp: 'r_coral_lamp',
  r_shellbed: 'r_shell_bed',
  r_amberlamp: 'r_amber_lamp',
  r_flowercrown: 'r_flower_crown',
  r_tank: 'r_fish_tank',
};

// ── 4.5 상점 품목 ────────────────────────────────────────────

type ShopRow = Omit<ShopItem, 'price' | 'gives'> & { gives?: Record<string, number> };

const QUACK: ShopRow[] = [
  // 미끼
  { id: 'shop_worm', name: '지렁이 미끼 ×5', icon: '🪱', shop: 'quack', cost: { coins: 100 }, gives: { bait_worm: 5 }, kind: 'bait', desc: '기본 미끼 (삽으로 땅 파면 공짜 1)' },
  { id: 'shop_dough', name: '떡밥 ×3', icon: '🍡', shop: 'quack', cost: { coins: 300 }, gives: { bait_dough: 3 }, kind: 'bait', desc: '★2 이상이 잘 물어요 ×1.3' },
  { id: 'shop_lure', name: '반짝 루어', icon: '🪝', shop: 'quack', cost: { coins: 800 }, gives: { bait_lure: 1 }, gate: 'cond:fish50', kind: 'bait', desc: '★3 이상 ×1.5 (낚시 50번 뒤)' },
  // 도구
  { id: 'shop_shovel', name: '삽', icon: '🪏', shop: 'quack', cost: { coins: 800 }, gives: { tool_shovel: 1 }, unlock: 'tool:shovel', once: true, kind: 'tool', desc: '화석 X 파기, 지렁이' },
  { id: 'shop_hammer', name: '돌망치', icon: '🔨', shop: 'quack', cost: { coins: 600 }, gives: { tool_hammer: 1 }, unlock: 'tool:hammer', once: true, kind: 'tool', desc: '돌 두드리기, 나무 베기' },
  { id: 'shop_slingshot', name: '새총', icon: '🎯', shop: 'quack', cost: { coins: 1200 }, gives: { tool_slingshot: 1 }, unlock: 'tool:slingshot', once: true, kind: 'tool', desc: '풍선 선물 맞추기' },
  { id: 'shop_net', name: '잠자리채', icon: '🥅', shop: 'quack', cost: { coins: 500 }, gives: { tool_net: 1 }, unlock: 'tool:net', once: true, kind: 'tool', desc: '곤충 잡기 (잃어버렸을 때)' },
  { id: 'shop_watering_can', name: '물뿌리개', icon: '🚿', shop: 'quack', cost: { coins: 500 }, gives: { tool_wateringcan: 1 }, unlock: 'tool:wateringcan', once: true, kind: 'tool', desc: '꽃·묘목에 물 주기' },
  // 탈것·확장
  { id: 'shop_bike', name: '장바구니 자전거', icon: '🚲', shop: 'quack', cost: { coins: 8000 }, p0Cost: { coins: 1600 }, unlock: 'v:bike', once: true, kind: 'vehicle', desc: '씽씽! 육지에서 11 m/s' },
  { id: 'shop_bag30', name: '가방 확장 30칸', icon: '🎒', shop: 'quack', cost: { coins: 5000 }, unlock: 'bag:30', once: true, seq: 1, kind: 'bag', desc: '+10칸 (20→30)' },
  { id: 'shop_bag40', name: '가방 확장 40칸', icon: '🎒', shop: 'quack', cost: { coins: 25000 }, unlock: 'bag:40', gate: 'bag:30', once: true, seq: 2, kind: 'bag', desc: '+10칸 (30→40)' },
  { id: 'shop_bag50', name: '가방 확장 50칸', icon: '🎒', shop: 'quack', cost: { coins: 100000 }, unlock: 'bag:50', gate: 'bag:40', once: true, seq: 3, kind: 'bag', desc: '+10칸 (40→50)' },
  { id: 'shop_house1', name: '집 증축 1단계', icon: '🏠', shop: 'quack', cost: { coins: 9800 }, unlock: 'house:1', once: true, seq: 1, kind: 'house', desc: '집이 조금 넓어져요' },
  { id: 'shop_house2', name: '집 증축 2단계', icon: '🏠', shop: 'quack', cost: { coins: 98000 }, unlock: 'house:2', gate: 'house:1', once: true, seq: 2, kind: 'house', desc: '방이 하나 늘어요' },
  { id: 'shop_house3', name: '집 증축 3단계', icon: '🏡', shop: 'quack', cost: { coins: 198000 }, unlock: 'house:3', gate: 'house:2', once: true, seq: 3, kind: 'house', desc: '2층이 생겨요' },
  { id: 'shop_house4', name: '집 증축 4단계', icon: '🏰', shop: 'quack', cost: { coins: 498000 }, unlock: 'house:4', gate: 'house:3', once: true, seq: 4, kind: 'house', desc: '꿈의 대저택!' },
  // 씨앗(GDD 표 밖, 꽃밭용으로 남김)
  { id: 'shop_seed_tulip', name: '튤립 씨앗', icon: '🌷', shop: 'quack', cost: { coins: 80 }, gives: { seed_tulip: 1 }, kind: 'seed', desc: '알록달록 튤립' },
  { id: 'shop_seed_sunflower', name: '해바라기 씨앗', icon: '🌻', shop: 'quack', cost: { coins: 120 }, gives: { seed_sunflower: 1 }, kind: 'seed', desc: '키 큰 해바라기' },
  { id: 'shop_seed_apple', name: '사과 묘목', icon: '🌳', shop: 'quack', cost: { coins: 400 }, gives: { seed_apple: 1 }, kind: 'seed', desc: '사흘 뒤 사과가 열려요' },
  // 가구(코인)
  { id: 'shop_f_lamp', name: '버섯 스탠드', icon: '💡', shop: 'quack', cost: { coins: 1500 }, gives: { f_mushlamp: 1 }, kind: 'furniture', desc: '은은한 빛' },
  { id: 'shop_f_rug', name: '구름 러그', icon: '☁️', shop: 'quack', cost: { coins: 900 }, gives: { f_cloudrug: 1 }, kind: 'furniture', desc: '폭신폭신' },
  { id: 'shop_f_chair', name: '말랑 의자', icon: '🪑', shop: 'quack', cost: { coins: 1200 }, gives: { f_pastelchair: 1 }, kind: 'furniture', desc: '앉으면 말랑' },
  { id: 'shop_f_clock', name: '조개 시계', icon: '🕰️', shop: 'quack', cost: { coins: 2400 }, gives: { f_shellclock: 1 }, kind: 'furniture', desc: '째깍째깍 바다 소리' },
  // 반짝별 품목(GDD 4.1)
  { id: 'shop_capsule', name: '캡슐 티켓', icon: '🎫', shop: 'quack', cost: { stars: 20 }, gives: { it_capsule: 1 }, kind: 'capsule', desc: '두근두근 캡슐머신 1회', p1: true },
  { id: 'shop_invite', name: '주민 초대권', icon: '🎟️', shop: 'quack', cost: { stars: 50 }, gives: { it_invite: 1 }, kind: 'invite', desc: '새 주민을 섬으로 불러요', p1: true },
  { id: 'licence_scooter', name: '스쿠터 면허', icon: '🛵', shop: 'quack', cost: { stars: 30 }, unlock: 'licence:scooter', once: true, kind: 'licence', desc: '뽀릉뽀릉 스쿠터를 탈 수 있어요', p1: true },
  { id: 'licence_kart', name: '꼬마 카트 면허', icon: '🏎️', shop: 'quack', cost: { stars: 50 }, unlock: 'licence:kart', once: true, kind: 'licence', desc: '부릉부릉 카트를 탈 수 있어요', p1: true },
  { id: 'licence_balloon', name: '열기구 면허', icon: '🎈', shop: 'quack', cost: { stars: 300 }, unlock: 'v:balloon', gate: 'cond:balloon30', once: true, kind: 'licence', desc: '풍선 선물 30개 터뜨리면 살 수 있어요', p1: true },
  { id: 'shop_f_rainbowlamp', name: '무지개 램프', icon: '🌈', shop: 'quack', cost: { stars: 60 }, gives: { f_rainbowlamp: 1 }, kind: 'furniture', desc: '반짝별 특별 가구' },
  { id: 'shop_f_starthrone', name: '별빛 왕좌', icon: '👑', shop: 'quack', cost: { stars: 100 }, gives: { f_starthrone: 1 }, kind: 'furniture', desc: '반짝별 특별 가구' },
  // 박물관 증축(P0 에선 전부 열림)
  { id: 'shop_wing_aquarium', name: '수족관동', icon: '🐟', shop: 'quack', cost: {}, unlock: 'wing:aquarium', once: true, p0Unlocked: true, kind: 'wing', desc: '처음부터 열려 있어요' },
  { id: 'shop_wing_bug', name: '곤충관 증축', icon: '🦋', shop: 'quack', cost: { coins: 50000 }, unlock: 'wing:bug', once: true, p0Unlocked: true, kind: 'wing', desc: '곤충을 기증할 수 있어요' },
  { id: 'shop_wing_fossil', name: '화석관 증축', icon: '🦴', shop: 'quack', cost: { coins: 100000 }, unlock: 'wing:fossil', once: true, p0Unlocked: true, kind: 'wing', desc: '화석 골격을 기증할 수 있어요' },
  { id: 'shop_wing_sea', name: '해저관 증축', icon: '🐙', shop: 'quack', cost: { coins: 80000 }, unlock: 'wing:sea', once: true, p0Unlocked: true, kind: 'wing', desc: '바다 생물을 기증할 수 있어요' },
  { id: 'shop_wing_astro', name: '천문관 증축', icon: '🔭', shop: 'quack', cost: { coins: 200000 }, unlock: 'wing:astro', once: true, p0Unlocked: true, kind: 'wing', desc: '우주 생물을 기증할 수 있어요' },
];

const SHIPYARD: ShopRow[] = [
  { id: 'shop_tugboat', name: '통통배', icon: '🚤', shop: 'shipyard', cost: { coins: 30000 }, p0Cost: { coins: 6000 }, unlock: 'v:tugboat', gate: 'cond:homeDex30', p0Gate: null, once: true, kind: 'vehicle', desc: '통통통! 배 위에서 낚시도 해요 (말랑섬 도감 30%)' },
  { id: 'shop_yacht', name: '바람이 돛단요트', icon: '⛵', shop: 'shipyard', cost: { coins: 60000, items: { p_sail: 1 } }, unlock: 'v:yacht', gate: 'cond:islands3', once: true, kind: 'vehicle', desc: '바람 타고 슝 (섬 3곳 방문)', p1: true },
  { id: 'shop_motorboat', name: '물보라 모터보트', icon: '🛥️', shop: 'shipyard', cost: { coins: 150000, items: { p_engine: 1 } }, p0Cost: { coins: 30000, items: { p_engine: 1 } }, unlock: 'v:motorboat', gate: 'cond:islands4', once: true, kind: 'vehicle', desc: '40 m/s 파도 점프! (섬 4곳 방문)' },
];

const PENG: ShopRow[] = [
  { id: 'shop_blueprint', name: '로켓 설계도', icon: '📜', shop: 'peng', cost: { stars: 200 }, p0Cost: { stars: 20 }, unlock: 'rocket:blueprint', gate: 'cond:islands4', p0Gate: null, once: true, kind: 'rocket', desc: '로켓 부품 레시피 6개 해금 (섬 4곳 방문)' },
  { id: 'shop_launchpad', name: '발사대 건설', icon: '🛰️', shop: 'peng', cost: { coins: 300000 }, p0Cost: { coins: 30000 }, unlock: 'rocket:pad', gate: 'cond:parts6', once: true, kind: 'rocket', desc: '로켓 부품 6개를 모으면 발사 준비 완료!' },
];

// 다른 섬 가게(3.8 탈것 해금 — P1)
const ISLAND_SHOPS: ShopRow[] = [
  { id: 'shop_duck_tube', name: '오리튜브', icon: '🦆', shop: 'beach', cost: { coins: 1500 }, unlock: 'v:duck_tube', once: true, kind: 'vehicle', desc: '둥둥~ 수영 ×1.5', p1: true },
  { id: 'shop_buggy', name: '모래 버기', icon: '🏜️', shop: 'bazaar', cost: { coins: 80000 }, unlock: 'v:buggy', once: true, kind: 'vehicle', desc: '모래 언덕 점프!', p1: true },
  { id: 'shop_submarine', name: '꼬르륵호 잠수정', icon: '🟡', shop: 'diving', cost: { coins: 50000, items: { p_sub_hull: 1 } }, unlock: 'v:submarine', once: true, kind: 'vehicle', desc: '심해 탐험 (잠수정 선체 필요)', p1: true },
];

/** 레시피 카드(반짝별) — 'card:<n>' 레시피마다 하나씩 */
const RECIPE_CARDS: ShopRow[] = RECIPE_TABLE.filter((r) => r.gate.startsWith('card:')).map((r) => ({
  id: `shop_recipe_${r.id.slice(2)}`, name: `레시피 카드: ${r.name}`, icon: '📇', shop: 'quack' as const,
  cost: { stars: Number(r.gate.slice(5)) }, unlock: `recipe:${r.id}`, once: true as const, kind: 'recipe' as const, desc: `${r.name} 만드는 법`,
}));

export const SHOP_TABLE: ShopItem[] = [...QUACK, ...RECIPE_CARDS, ...SHIPYARD, ...PENG, ...ISLAND_SHOPS].map((s) => ({
  ...s, gives: s.gives ?? {}, price: s.cost.coins ?? 0,
}));
