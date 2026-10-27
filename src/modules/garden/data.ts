// garden 데이터 — 꽃밭·사과나무·교배표·민들레·네잎클로버·회전초·과일 힘 바위의 숫자와 이름표(GDD 3.4 P1 · 4.12).
// 부수효과 없는 순수 표. logic.ts·garden.ts·테스트가 같이 읽는다.

/** 심을 수 있는 씨앗 → 식물 종류 */
export const SEEDS = ['seed_tulip', 'seed_sunflower', 'seed_apple'] as const;
export type SeedId = (typeof SEEDS)[number];
export const isSeed = (s: unknown): s is SeedId => typeof s === 'string' && (SEEDS as readonly string[]).includes(s);

/** 식물 종류: 씨앗 꽃 2 + 교배로만 나는 장미 + 민들레 홀씨가 피운 들꽃 + 사과나무 */
export type PlantKind = 'tulip' | 'sunflower' | 'rose' | 'wild' | 'apple';
export type FlowerKind = Exclude<PlantKind, 'apple'>;
export const SEED_KIND: Readonly<Record<SeedId, PlantKind>> = { seed_tulip: 'tulip', seed_sunflower: 'sunflower', seed_apple: 'apple' };

/** 꽃 단계: 0 새싹 → 1 꽃봉오리 → 2 활짝(물 준 날마다 한 단계) */
export const FLOWER_STAGES = 3;
export const BLOOM = FLOWER_STAGES - 1;
/** 사과 묘목은 물 준 날 5번이면 열매 나무(단계 5) */
export const APPLE_DAYS = 5;
/** 흔들면 떨어지는 사과 수(하루 한 번) */
export const APPLE_DROP = 3;

/** 격자 한 칸(m) — 꽃밭은 1 m 칸에 하나 */
export const CELL = 1;
/** 사과나무는 둘레 이만큼(칸) 비워야 심는다 */
export const TREE_CLEAR = 1.6;
/** 심은 것 최대(성능) · 민들레가 피운 들꽃 최대(오래된 것부터 진다) */
export const PLOT_MAX = 80;
export const WILD_MAX = 40;
/** 한 번에 따라잡는 최대 일수(오래 쉬다 와도 이만큼만 계산) */
export const CATCHUP_MAX = 30;

/** 꽃 색 이름표(파스텔이지만 맑게, GDD 0.5) */
export interface ColorDef { id: string; name: string; hex: string }
export const COLORS: Readonly<Record<string, ColorDef>> = Object.freeze({
  red: { id: 'red', name: '빨강', hex: '#ff5d6e' },
  yellow: { id: 'yellow', name: '노랑', hex: '#ffd23f' },
  white: { id: 'white', name: '하양', hex: '#fff6ee' },
  pink: { id: 'pink', name: '분홍', hex: '#ff9cc2' },
  orange: { id: 'orange', name: '주황', hex: '#ffa24a' },
  purple: { id: 'purple', name: '보라', hex: '#b58cff' },
  blue: { id: 'blue', name: '하늘', hex: '#8fb2ff' },
  lemon: { id: 'lemon', name: '레몬', hex: '#fff08a' },
  lilac: { id: 'lilac', name: '라일락', hex: '#d9c2ff' },
  gold: { id: 'gold', name: '황금', hex: '#ffcf3a' },
});
export const colorHex = (id: string) => COLORS[id]?.hex ?? '#ffffff';
export const colorName = (id: string) => COLORS[id]?.name ?? id;

/** 씨앗으로 심으면 나오는 기본 색(결정적 rng 로 하나) */
export const BASE_COLORS: Readonly<Record<FlowerKind, readonly string[]>> = {
  tulip: ['red', 'yellow', 'white'],
  sunflower: ['yellow', 'yellow', 'lemon'],
  rose: ['red', 'white'],
  wild: ['white', 'yellow', 'pink', 'lilac'],
};

/** 같은 종류 두 송이(정렬한 'a|b') → 변이 색. 표에 없으면 부모 색 중 하나 */
export const BREED: Readonly<Record<'tulip' | 'sunflower' | 'rose' | 'wild', Readonly<Record<string, string>>>> = {
  tulip: {
    'red|yellow': 'orange', 'red|white': 'pink', 'white|yellow': 'lemon',
    'orange|pink': 'purple', 'pink|white': 'lilac', 'purple|white': 'blue', 'purple|purple': 'blue', 'lilac|purple': 'blue',
  },
  sunflower: { 'yellow|yellow': 'lemon', 'lemon|yellow': 'orange', 'orange|yellow': 'red', 'orange|orange': 'red', 'lemon|lemon': 'white' },
  rose: { 'red|white': 'pink', 'pink|red': 'purple', 'purple|purple': 'blue', 'pink|white': 'lilac', 'blue|white': 'blue' },
  wild: { 'pink|white': 'lilac', 'white|yellow': 'lemon', 'lilac|pink': 'purple' },
};
/** 튤립 × 해바라기 → 장미(튤립 색을 닮는다, 없는 색은 빨강) */
export const ROSE_FROM: Readonly<Record<string, string>> = { red: 'red', pink: 'pink', white: 'white', purple: 'purple', blue: 'blue', lilac: 'lilac', orange: 'red', yellow: 'white', lemon: 'white' };

/** 이웃한(8칸) 활짝 핀 두 송이가 같은 날 물을 먹었으면 다음 날 이 확률로 새 꽃 */
export const BREED_CHANCE = 0.35;
/** 교배로 난 꽃이 황금장미일 확률 */
export const GOLDEN_CHANCE = 0.01;
/** 이웃 판정(m) — 8칸 이웃 = √2 칸 */
export const NEIGHBOR_R = CELL * 1.5;

/** 꽃잎 따기(하루 한 번) — 종류별 꽃잎 수 */
export const PETALS = { plain: 1, hybrid: 2, rose: 3, gold: 6, wild: 1 } as const;
/** 황금장미가 처음 피면 반짝별 */
export const GOLDEN_STARS = 3;

/** 민들레(홀씨 불기 E → 다음 날 근처에 들꽃) */
export const DANDELION = { chunk: 96, radius: 120, perChunk: [3, 7] as const, sprout: [1.4, 3.2] as const };
/** 네잎클로버: 덤불 하나를 하루 한 번 굴려 0.5%(GDD 3.4) — 걸리면 20~30줄기 가운데 한 줄기가 네잎 */
export const CLOVER = { chunk: 96, radius: 110, patches: [1, 3] as const, sprigs: [20, 30] as const, fourLeaf: 0.005, buffMin: 120 } as const;
/** 장식 풀 숲(detail 레이어) */
export const TUFTS = { chunk: 96, radius: 80, perChunk: 46 } as const;

/** 회전초(모래시계섬, 바람 타고 굴러감 → 잡으면 나무상자) */
export const TUMBLE = { max: 3, perDay: 5, spawnMin: 38, spawnMax: 55, despawn: 85, speed: [2.2, 4.2] as const, catchR: 1.9, r: 0.55 } as const;

/** 과일 힘(econ.use 로 과일을 먹으면 한 칸) — 가득 차면 큰 바위를 부순다 */
export const POWER_MAX = 3;
/** 먹으면 힘 한 칸인 과일(economy 의 'fruit' 태그 — 서리 열매는 매머드 몫이라 뺀다). 꽃밭 사과부터 */
export const EAT_FRUITS: ReadonlyArray<{ id: string; name: string; icon: string }> = [
  { id: 'm_apple', name: '사과', icon: '🍎' }, { id: 'm_peach', name: '복숭아', icon: '🍑' }, { id: 'm_cherry', name: '체리', icon: '🍒' },
  { id: 'm_orange', name: '오렌지', icon: '🍊' }, { id: 'm_pear', name: '배', icon: '🍐' }, { id: 'm_coconut', name: '코코넛', icon: '🥥' },
  { id: 'm_banana', name: '바나나', icon: '🍌' }, { id: 'm_date', name: '대추야자', icon: '🌴' },
];
/** 사과나무를 흔든 뒤 이만큼(초) 그 둘레에서 '먹고 힘내기' 를 띄운다 */
export const EAT_AFTER_SHAKE = 12;
/** 큰 바위: 섬마다 3개(숨은 곳 셋 옆 샛길), 부순 다음 날 다시 생긴다 */
export const BOULDER = { perIsland: 3, r: 1.55, chunk: 128, radius: 320, regrowDays: 1 } as const;
export const BOULDER_ISLANDS = ['home', 'dino', 'ice', 'mushroom', 'coral', 'desert', 'launch'] as const;
export type BoulderIsland = (typeof BOULDER_ISLANDS)[number];
/** 바위 부수면 나오는 것(기본) + 섬 특산 돌 */
export const BOULDER_LOOT = { stone: [3, 5] as const, clay: 0.5, iron: 0.45, gold: 0.12, coins: [200, 600] as const } as const;
export const BOULDER_SPECIAL: Readonly<Record<BoulderIsland, string | null>> = {
  home: 'm_clay', dino: 'm_volcanic', ice: 'm_icecrystal', mushroom: 'm_glowcap', coral: 'm_shell', desert: 'm_sandglass', launch: 'm_meteor',
};

/** 이름표 */
export const KIND_NAME: Readonly<Record<PlantKind, string>> = { tulip: '튤립', sunflower: '해바라기', rose: '장미', wild: '들꽃', apple: '사과나무' };
export const KIND_ICON: Readonly<Record<PlantKind, string>> = { tulip: '🌷', sunflower: '🌻', rose: '🌹', wild: '🌼', apple: '🌳' };
export const SEED_NAME: Readonly<Record<SeedId, string>> = { seed_tulip: '튤립 씨앗', seed_sunflower: '해바라기 씨앗', seed_apple: '사과 묘목' };
export const STAGE_NAME = ['새싹', '꽃봉오리', '활짝'] as const;
