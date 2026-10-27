// islanddev 데이터 — 섬 개발 5단계(GDD 4.7)·섬 특산 시설·단계별 새 생물(DEV_SPECIES)·상자 구역·마당 꾸미기 목록(4.12)·섬 별점 공식.
// 부수효과 없는 순수 표. 도감·HUD·테스트가 읽어도 된다.
import { MATERIALS } from '../economy/data';

/** 개발할 수 있는 섬(쪼꼬미섬 빼고) */
export const DEV_ISLANDS = ['home', 'coral', 'mushroom', 'dino', 'ice', 'desert', 'launch'] as const;
export type DevIsland = (typeof DEV_ISLANDS)[number];
export const isDevIsland = (id: unknown): id is DevIsland => typeof id === 'string' && (DEV_ISLANDS as readonly string[]).includes(id);

/** 단계 번호 1~5 */
export type StageN = 1 | 2 | 3 | 4 | 5;
export const STAGE_NS: readonly StageN[] = [1, 2, 3, 4, 5];

export interface StageInfo {
  n: StageN;
  name: string;
  icon: string;
  /** 한 줄 설명(창 위) */
  desc: string;
  /** 열리면 무엇이 생기나 */
  effect: string;
  color: string;
}
export const STAGES: Record<StageN, StageInfo> = {
  1: { n: 1, name: '등대 복구', icon: '🗼', desc: '꺼진 등대에 다시 불을 켜요', effect: '비눗방울 정류장 · 섬 지도 공개', color: '#ffd23f' },
  2: { n: 2, name: '부두 · 다리', icon: '🌉', desc: '배를 댈 부두와 섬 안 지름길 다리 2개', effect: '배 정박 · 지름길', color: '#ffb36e' },
  3: { n: 3, name: '섬 특산 시설', icon: '🏪', desc: '섬에서만 나는 재료로 특별한 시설을 지어요', effect: '섬 고유 기능', color: '#c58cff' },
  4: { n: 4, name: '주민 이주', icon: '🏡', desc: '새 친구가 이 섬으로 이사 와요', effect: '주민 집 · 매일 부탁', color: '#ff9fb8' },
  5: { n: 5, name: '섬 별 5개', icon: '🌟', desc: '섬 도감 80% + 꾸미기로 별 다섯 개!', effect: '섬 깃발 · 음악 상자 · 섬 전용 가구', color: '#7fd18b' },
};

/** 정식 비용(GDD 4.7). ③ 은 섬 특산 재료(아무거나 섞어서) 20개 */
export const STAGE_COST = {
  1: { coins: 20000, items: { it_lighthouse_kit: 1 } as Record<string, number> },
  2: { coins: 30000, items: { it_bridge_kit: 2 } as Record<string, number> },
  3: { coins: 80000, items: {} as Record<string, number>, specialty: 20 },
} as const;
/** ④ 주민 이주: 이 섬 주민 부탁 N 번(정식 2 · P0 1) 또는 주민 초대권 1장 */
export const MOVEIN_REQUESTS = 2;
export const MOVEIN_REQUESTS_P0 = 1;
export const INVITE_ITEM = 'it_invite';
/** ⑤ 섬 별 5개: 섬 도감 % 하한 */
export const STAR5_DEX = 80;

/** 섬 특산 재료(economy 표의 specialty:<섬> 태그) */
export function specialtyIds(island: string): string[] {
  return MATERIALS.filter((m) => m.tags.includes(`specialty:${island}` as never)).map((m) => m.id);
}

// ───────── 섬 특산 시설(village FACILITY_IDS 와 같은 이름) ─────────
export type FacilityId = 'apiary' | 'divingCenter' | 'fireflyGarden' | 'fossilLab' | 'iceHut' | 'bazaar' | 'observatory' | 'potionShop' | 'skiLift';
export interface FacilityInfo { id: FacilityId; island: DevIsland; name: string; icon: string; bonus: string }
export const FACILITIES: FacilityInfo[] = [
  { id: 'apiary', island: 'home', name: '꿀벌 농장 · 꽃시장', icon: '🐝', bonus: '매일 꿀 5개를 받아요' },
  { id: 'divingCenter', island: 'coral', name: '뽀글 다이빙 센터', icon: '🤿', bonus: '다이빙 숍 단골 할인 20%' },
  { id: 'fireflyGarden', island: 'mushroom', name: '반딧불 정원', icon: '✨', bonus: '밤이 되면 반딧불이 두 배로 반짝여요' },
  { id: 'potionShop', island: 'mushroom', name: '보글 물약 가게', icon: '🧪', bonus: '물약 가게 단골 할인 10%' },
  { id: 'fossilLab', island: 'dino', name: '화석 연구소 · 부화장', icon: '🦴', bonus: '화석 감정(가끔 진품 보너스!)' },
  { id: 'iceHut', island: 'ice', name: '얼음낚시 오두막', icon: '🎣', bonus: '매일 얼음낚시 미끼 5개' },
  { id: 'skiLift', island: 'ice', name: '스키 리프트', icon: '🚡', bonus: '리프트 타고 설산 꼭대기로 슝' },
  { id: 'bazaar', island: 'desert', name: '오아시스 바자르', icon: '🏜️', bonus: '하루 첫 구매 15% 돌려받기' },
  { id: 'observatory', island: 'launch', name: '별빛 천문대', icon: '🔭', bonus: '유성우 예보를 볼 수 있어요' },
];
export const FACILITY_BY_ID = new Map(FACILITIES.map((f) => [f.id, f]));
export const facilitiesOf = (island: string): FacilityInfo[] => FACILITIES.filter((f) => f.island === island);
/** 상점 단골 할인(비율) — 시설이 열렸을 때 */
export const SHOP_DISCOUNT: Record<string, { facility: FacilityId; rate: number; daily?: boolean }> = {
  diving: { facility: 'divingCenter', rate: 0.2 },
  potion: { facility: 'potionShop', rate: 0.1 },
  bazaar: { facility: 'bazaar', rate: 0.15, daily: true },
};
/** 꿀벌 농장 매일 꿀 · 얼음 오두막 매일 미끼 */
export const DAILY_HONEY = { item: 'm_honey', n: 5 };
export const DAILY_BAIT = { item: 'bait_worm', n: 5 };
/** 화석 감정 값(정식) — P0 는 1/5 */
export const APPRAISE_COST = 200;
/** 감정 진품 보너스 확률(은열쇠 조각 1) */
export const APPRAISE_LUCK = 0.25;
/** 4곳 등대 복구 → 별똥별섬 발사장(facility:launch) */
export const LAUNCH_LIGHTHOUSES = 4;

// ───────── 단계마다 새로 나오는 생물(where.dev = 'dev:<섬>:<n>') ─────────
// GDD id(state.byGdd 로 찾는다). 세트(무지개 구피·별자리·볼빵빵·밤의 빛)·업적 핵심 종은 피했다.
export const DEV_SPECIES: Record<DevIsland, Record<StageN, string>> = {
  home: { 1: 'f_softshell', 2: 'f_leopard_mandarin', 3: 'b_stag_beetle', 4: 'f_heart_koi', 5: 'f_cloud_carp' },
  coral: { 1: 'f_archerfish', 2: 'b_leaf_insect', 3: 'b_jewel_beetle', 4: 'f_napoleon', 5: 'b_hercules' },
  mushroom: { 1: 'b_jumping_spider', 2: 'f_shroom_jelly', 3: 'b_ghost_moth', 4: 'f_crown_frog', 5: 'f_moss_turtle' },
  dino: { 1: 'b_dung_beetle', 2: 'f_horseshoe', 3: 'f_sturgeon', 4: 'b_meganeura', 5: 'f_dunkle' },
  ice: { 1: 'f_hair_crab', 2: 'b_frost_butterfly', 3: 'f_clione', 4: 'f_king_crab', 5: 'b_aurora_butterfly' },
  desert: { 1: 'f_hump_crucian', 2: 'f_mirror_fish', 3: 'b_antlion', 4: 'b_tarantula', 5: 'f_sand_whale' },
  launch: { 1: 'b_antenna_moth', 2: 'b_satellite_ladybug', 3: 'b_stardust_moth', 4: 'f_meteor_turtle', 5: 'b_comet_dragonfly' },
};
/** 해금 키 'dev:<섬>:<n>' */
export const devKey = (island: string, n: number) => `dev:${island}:${n}`;
/** 'dev:<섬>:<n>' → {island, n} (모양이 틀리면 null) */
export function parseDevKey(key: string): { island: DevIsland; n: StageN } | null {
  const m = /^dev:([a-z]+):([1-5])$/.exec(key);
  if (!m || !isDevIsland(m[1])) return null;
  return { island: m[1], n: Number(m[2]) as StageN };
}

// ───────── 단계마다 새 상자 구역(econ.addChestArea) ─────────
export const CHEST_AREAS: Record<StageN, { r: number; n: number; tier: 'wood' | 'silver' | 'gold' }> = {
  1: { r: 16, n: 3, tier: 'wood' },
  2: { r: 20, n: 4, tier: 'wood' },
  3: { r: 22, n: 4, tier: 'silver' },
  4: { r: 26, n: 5, tier: 'silver' },
  5: { r: 30, n: 6, tier: 'gold' },
};
export const chestAreaId = (island: string, n: number) => `islanddev:${island}:${n}`;

// ───────── ⑤ 보상 ─────────
/** 섬 전용 가구(economy 에 있는 가구 중 섬 분위기에 맞는 것) */
export const STAR5_FURNITURE: Record<DevIsland, string> = {
  home: 'f_rainbowlamp', coral: 'f_shellbed', mushroom: 'f_mushlamp', dino: 'f_fos_trexmodel',
  ice: 'f_cloudrug', desert: 'f_cactuspot', launch: 'f_starthrone',
};
export const STAR5_STARS = 50;
/** 섬 깃발 색(위·아래 줄) */
export const ISLAND_FLAG: Record<DevIsland, [string, string, string]> = {
  home: ['#7fd18b', '#ffe58a', '🌸'], coral: ['#ff9f8a', '#7fe0d6', '🐚'], mushroom: ['#ff9ccf', '#c58cff', '🍄'],
  dino: ['#9fcf5a', '#ffb36e', '🦕'], ice: ['#8fd3ff', '#ffffff', '❄️'], desert: ['#ffc46b', '#ff8f5e', '🌵'], launch: ['#a99bff', '#fff2a8', '⭐'],
};
/** 음악 상자 가락(반음 — audio.sfx pitch 로 연주) */
export const MUSIC_BOX_TUNES: Record<DevIsland, number[]> = {
  home: [0, 4, 7, 12, 7, 4, 0], coral: [0, 2, 4, 7, 9, 7, 4], mushroom: [0, 3, 7, 10, 7, 3, 0], dino: [0, 0, 7, 7, 9, 9, 7],
  ice: [12, 11, 9, 7, 9, 11, 12], desert: [0, 1, 4, 5, 7, 5, 4], launch: [0, 7, 12, 16, 19, 16, 12],
};

// ───────── 마당 꾸미기(GDD 4.12, 격자 0.5 m) ─────────
export type YardKind = 'fence' | 'flowerbed' | 'path' | 'lamp' | 'pond' | 'dinofence' | 'fireflyspot' | 'furn';
export interface YardDef {
  k: YardKind;
  name: string;
  icon: string;
  /** 격자 칸(가로 w × 세로 d, 칸 = 0.5 m) */
  w: number;
  d: number;
  /** 재료 비용(가구는 가방의 그 가구 1개) */
  cost: Record<string, number>;
  /** 꾸미기 점수 */
  pts: number;
  desc: string;
}
export const YARD_DEFS: Record<YardKind, YardDef> = {
  fence: { k: 'fence', name: '나무 울타리', icon: '🪵', w: 2, d: 1, cost: { m_wood: 2 }, pts: 1, desc: '마당 테두리를 둘러요' },
  flowerbed: { k: 'flowerbed', name: '꽃밭', icon: '🌷', w: 2, d: 2, cost: { m_wood: 1, m_petal: 2 }, pts: 3, desc: '알록달록 꽃이 피어요' },
  path: { k: 'path', name: '돌길', icon: '🪨', w: 2, d: 2, cost: { m_stone: 2 }, pts: 1, desc: '동글동글 징검돌' },
  lamp: { k: 'lamp', name: '마당 가로등', icon: '🏮', w: 1, d: 1, cost: { m_wood: 1, m_iron: 1 }, pts: 2, desc: '밤에 노랗게 켜져요' },
  pond: { k: 'pond', name: '작은 연못', icon: '🐟', w: 4, d: 4, cost: { m_stone: 6 }, pts: 5, desc: '잡은 물고기를 놓아줄 수 있어요' },
  dinofence: { k: 'dinofence', name: '공룡 울타리', icon: '🦕', w: 6, d: 6, cost: { m_wood: 8, m_stone: 2 }, pts: 6, desc: '친해진 아기 공룡이 놀러 와요' },
  fireflyspot: { k: 'fireflyspot', name: '반딧불 풀숲', icon: '✨', w: 2, d: 2, cost: { m_wood: 2 }, pts: 3, desc: '반딧불을 놓아주면 밤이 반짝여요' },
  furn: { k: 'furn', name: '마당 가구', icon: '🪑', w: 2, d: 2, cost: {}, pts: 4, desc: '가방의 가구를 마당에 놓아요' },
};
export const YARD_KINDS = Object.keys(YARD_DEFS) as YardKind[];
/** 마당에 놓을 수 있는 가방 가구(바깥 모양을 islanddev 가 만든다) */
export const YARD_FURNITURE = [
  'f_bench', 'f_pastelchair', 'f_pot', 'f_cactuspot', 'f_bootplanter', 'f_fruitbasket', 'f_mushlamp', 'f_corallamp', 'f_amberlamp',
  'f_spacelamp', 'f_rainbowlamp', 'f_canrobot', 'f_starthrone', 'f_spacechair', 'f_fos_trexmodel', 'f_stego_plate', 'f_dino_musicbox',
  'f_shellbed', 'f_cloudrug', 'f_shellclock',
] as const;
/** 반짝별 특별 가구·섬 전용 가구는 점수 +2 */
export const YARD_FANCY = new Set(['f_rainbowlamp', 'f_starthrone', ...Object.values(STAR5_FURNITURE)]);
/** 격자 한 칸(m) · 마당 반쪽 크기(칸) — 12 m × 12 m */
export const YARD_CELL = 0.5;
export const YARD_HALF = 12;
/** 연못 물고기 · 반딧불 · 종류 다양성 보너스 */
export const YARD_POND_MAX = 6;
export const YARD_FIREFLY_MAX = 8;
export const YARD_VARIETY_PTS = 2;
export const YARD_DINO_PTS = 3;
/** 이 점수면 꾸미기 100% */
export const DECO_FULL = 40;

// ───────── 섬 별점(4.12: 꾸미기 점수 + 섬 도감 %) ─────────
/** 별점 점수 = 도감% × 0.6 + 꾸미기% × 0.4, 별 = 1 + (20·40·60·80 넘은 수) */
export const RATING_W = { dex: 0.6, deco: 0.4 } as const;
export const RATING_STEPS = [20, 40, 60, 80] as const;

/** 빠른 이동 정류장 종류 */
export type NodeKind = 'home' | 'lighthouse' | 'buoy' | 'station' | string;
export const NODE_ICON: Record<string, string> = { home: '🏠', lighthouse: '🗼', buoy: '📮', station: '🫧', summit: '🏔️' };
