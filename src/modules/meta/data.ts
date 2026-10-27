// meta 데이터 — 업적 65개(GDD 5.7), 일일 미션 템플릿 15개(4.10), 세트 수집 보너스(4.11), 숙련·섬 도감 보상(4.1.1·5.5).
// 조건은 전부 선언형(AchCond) — 판정은 meta/logic.ts 가 MetaView(카운터·도감·해금)를 읽어서 한다.
// 런타임 없음(순수 표). 다른 모듈·테스트가 그냥 읽어도 된다.
import type { KeyColor, Weather } from '../../core/api';

// ───────────── 조건 ─────────────
/** 종 고르기(도감 칸 기준) — 모든 칸이 맞아야 한다 */
export interface SpeciesMatch {
  /** 분류(하나 또는 여럿) */
  cat?: string | readonly string[];
  /** 이 태그가 있어야 */
  tag?: string;
  /** 정확히 이 희귀도 */
  rarity?: number;
  /** 이 날씨 '전용'(where[].weather.only)이어야 */
  weatherOnly?: Weather;
}

/**
 * 업적·세트 조건. have/need 진행도로 바뀐다(logic.progressOf).
 * - count: 누적 카운터 ≥ n · max: 최고 기록 ≥ n
 * - dexPct: 도감 % · dexAny: GDD id 중 하나라도 등록 · dexN: 고른 종 n칸 등록 · dexAll: 고른 종 전부 등록(최소 min칸)
 * - variant: 반짝이·왕관 개체 누적 수 · seen: 다녀간 곳 수(섬·쪼꼬미섬·랜드마크·등대)
 * - unlocked: 해금 키 중 n개 · skeletons: 완성 골격 수 · rocketParts: 로켓 부품 수
 */
export type AchCond =
  | { k: 'count'; key: string; n: number }
  | { k: 'max'; key: string; n: number }
  | { k: 'dexPct'; pct: number }
  | { k: 'dexAny'; ids: readonly string[] }
  | { k: 'dexN'; match: SpeciesMatch; n: number }
  | { k: 'dexAll'; match: SpeciesMatch; min?: number }
  | { k: 'variant'; v: 'shiny' | 'crown'; n: number }
  | { k: 'seen'; set: SeenSet; n: number }
  | { k: 'unlocked'; keys: readonly string[]; n: number }
  | { k: 'skeletons'; n: number }
  | { k: 'rocketParts'; n: number };

export type SeenSet = 'island' | 'islet' | 'landmark' | 'lighthouse';

// ───────────── 카운터 이름(누적 c · 오늘 d · 최고 max) ─────────────
/** 이벤트 → 카운터. meta.ts 가 올리고 업적·미션이 읽는다 */
export const C = {
  fish: 'catch:fish', bug: 'catch:bug', dive: 'catch:dive', moonfish: 'catch:moonfish', space: 'catch:space',
  r3: 'catch:r3', newDex: 'new', hot: 'catch:hot',
  rainNightFish: 'rainnight:fish', meteorDust: 'meteor:stardust',
  chest: 'chest', chestGold: 'chest:gold', chestWreck: 'chest:wreck', chestTino: 'chest:tino', chestMap: 'chest:treasure-map',
  mimic: 'mimic', balloon: 'harvest:balloon', dig: 'harvest:dig', rock: 'rock', shake: 'shake',
  stung: 'stung', sold: 'sold', earned: 'earned', donate: 'donate', craft: 'craft',
  feed: 'dino:feed', dinoRide: 'mount:dino', launch: 'launch', tinoWake: 'tino:wake', travel: 'travel', raft: 'raft',
  current: 'current:m', release: 'release', photo: 'photo', secret: 'secret', unlock: 'unlock',
  // 최고 기록(max)
  combo: 'combo', sellDay: 'sellday', swim: 'swim:coast', dinoHearts: 'dino:hearts', speed: 'speed:motorboat', moonJump: 'moon:jump',
} as const;

// ───────────── 업적(GDD 5.7) ─────────────
export type AchGroup = 'catch' | 'dex' | 'weather' | 'travel' | 'dino' | 'treasure' | 'econ' | 'space';
export const ACH_GROUPS: ReadonlyArray<{ id: AchGroup; name: string; icon: string }> = [
  { id: 'catch', name: '낚시·채집', icon: '🎣' },
  { id: 'dex', name: '도감·희귀', icon: '📖' },
  { id: 'weather', name: '날씨·특별한 친구', icon: '🌈' },
  { id: 'travel', name: '여행·바다', icon: '⛵' },
  { id: 'dino', name: '공룡', icon: '🦕' },
  { id: 'treasure', name: '보물', icon: '🎁' },
  { id: 'econ', name: '살림·마을', icon: '🪙' },
  { id: 'space', name: '우주', icon: '🚀' },
];

export interface AchDef {
  id: string;
  name: string;
  /** 조건 한 줄(화면 표시) */
  desc: string;
  icon: string;
  group: AchGroup;
  stars: number;
  cond: AchCond;
}

/** 모든 섬(쪼꼬미섬 빼고) */
export const MAIN_ISLANDS = ['home', 'dino', 'ice', 'mushroom', 'coral', 'desert', 'launch'] as const;
export const ISLETS = ['islet-a', 'islet-b', 'islet-c', 'islet-d', 'islet-e', 'islet-f', 'islet-g', 'islet-h'] as const;
/** 모터보트 '최고 속도'(40 m/s 의 90%) */
export const SPEED_TOP = 36;
/** 먼바다 수영 거리(m, 해안에서) */
export const SWIM_FAR_M = 200;
/** 해류 띠 거리(m) */
export const CURRENT_M = 1000;
/** 달 높이뛰기(m) */
export const MOON_JUMP_M = 10;
/** 공룡 친구 하트 */
export const DINO_FRIEND_HEARTS = 5;
/** 도감 전체 칸(GDD 5.5) — 덜 실려도 % 는 이 칸 수로 */
export const DEX_SLOTS = 314;

const A = (id: string, name: string, desc: string, icon: string, group: AchGroup, stars: number, cond: AchCond): AchDef => ({ id, name, desc, icon, group, stars, cond });
const cnt = (key: string, n: number): AchCond => ({ k: 'count', key, n });
const max = (key: string, n: number): AchCond => ({ k: 'max', key, n });
const DEX_CATS = ['fish', 'bug', 'sea', 'space', 'dino'] as const;

export const ACHIEVEMENTS: readonly AchDef[] = [
  // 낚시·채집
  A('ach_first_fish', '첫 손맛', '물고기 1마리 낚기', '🎣', 'catch', 5, cnt(C.fish, 1)),
  A('ach_first_bug', '첫 날갯짓', '곤충 1마리 잡기', '🦋', 'catch', 5, cnt(C.bug, 1)),
  A('ach_fish_10', '낚시꾼 견습', '물고기 10마리', '🐟', 'catch', 5, cnt(C.fish, 10)),
  A('ach_fish_100', '낚시꾼', '물고기 100마리', '🐠', 'catch', 20, cnt(C.fish, 100)),
  A('ach_fish_1000', '낚시 장인', '물고기 1,000마리', '🐋', 'catch', 50, cnt(C.fish, 1000)),
  A('ach_bug_10', '채집가 견습', '곤충 10마리', '🐞', 'catch', 5, cnt(C.bug, 10)),
  A('ach_bug_100', '채집가', '곤충 100마리', '🦗', 'catch', 20, cnt(C.bug, 100)),
  A('ach_bug_1000', '채집 장인', '곤충 1,000마리', '🪲', 'catch', 50, cnt(C.bug, 1000)),
  A('ach_combo_10', '손이 안 멈춰', '콤보 10', '🔥', 'catch', 10, max(C.combo, 10)),
  A('ach_combo_25', '물때 장인', '콤보 25', '💫', 'catch', 30, max(C.combo, 25)),
  A('ach_dive_10', '잠수부', '잠수 생물 10마리', '🤿', 'catch', 10, cnt(C.dive, 10)),
  // 도감·희귀
  A('ach_dex_10', '도감 10%', '도감 10% 채우기', '📗', 'dex', 10, { k: 'dexPct', pct: 10 }),
  A('ach_dex_25', '도감 25%', '도감 25% 채우기', '📘', 'dex', 20, { k: 'dexPct', pct: 25 }),
  A('ach_dex_50', '도감 50%', '도감 50% 채우기', '📙', 'dex', 40, { k: 'dexPct', pct: 50 }),
  A('ach_dex_75', '도감 75%', '도감 75% 채우기', '📕', 'dex', 60, { k: 'dexPct', pct: 75 }),
  A('ach_dex_100', '도감 100%', '도감을 전부 채우기', '👑', 'dex', 200, { k: 'dexPct', pct: 100 }),
  A('ach_rare_first', '파란 빛', '첫 ★3 친구', '💙', 'dex', 5, { k: 'dexN', match: { cat: DEX_CATS, rarity: 3 }, n: 1 }),
  A('ach_epic_first', '보랏빛 두근', '첫 ★4 친구', '💜', 'dex', 10, { k: 'dexN', match: { cat: DEX_CATS, rarity: 4 }, n: 1 }),
  A('ach_legend_first', '전설의 시작', '첫 ★5 친구', '💛', 'dex', 20, { k: 'dexN', match: { cat: DEX_CATS, rarity: 5 }, n: 1 }),
  A('ach_legend_all', '전설 수집가', '★5 친구 전부', '🌟', 'dex', 100, { k: 'dexAll', match: { cat: DEX_CATS, rarity: 5 }, min: 1 }),
  A('ach_shiny_first', '반짝!', '첫 반짝이', '✨', 'dex', 20, { k: 'variant', v: 'shiny', n: 1 }),
  A('ach_shiny_5', '반짝이 헌터', '반짝이 5마리', '🌈', 'dex', 50, { k: 'variant', v: 'shiny', n: 5 }),
  A('ach_crown_first', '왕관을 쓴 자', '첫 왕관 개체', '👑', 'dex', 10, { k: 'variant', v: 'crown', n: 1 }),
  // 날씨·특별한 친구
  A('ach_rain_night', '비 오는 밤의 낚시꾼', '비 오는 밤에 물고기 10마리', '🌧️', 'weather', 10, cnt(C.rainNightFish, 10)),
  A('ach_meteor_wish', '별에게 소원을', '유성우 밤에 별가루 10개', '🌠', 'weather', 10, cnt(C.meteorDust, 10)),
  A('ach_fog_ghost', '안개 속 친구', '유령잉어 또는 유령해파리', '👻', 'weather', 15, { k: 'dexAny', ids: ['f_ghost_carp', 'd_ghost_jelly'] }),
  A('ach_aurora', '오로라 아래서', '오로라 전용 생물 1', '🌌', 'weather', 20, { k: 'dexN', match: { weatherOnly: 'aurora' }, n: 1 }),
  A('ach_rainbow', '무지개 너머', '무지개 전용 생물 1', '🌈', 'weather', 15, { k: 'dexN', match: { weatherOnly: 'rainbow' }, n: 1 }),
  A('ach_taiyaki', '꽥사장 군침', '붕어빵붕어 낚기', '🐟', 'weather', 10, { k: 'dexAny', ids: ['f_taiyaki'] }),
  A('ach_grandpa', '100년 이야기', '왕메기할배 낚기', '👴', 'weather', 20, { k: 'dexAny', ids: ['f_grandpa_catfish'] }),
  A('ach_zodiac', '별자리 완성', '별자리 물고기 12종', '♈', 'weather', 50, { k: 'dexN', match: { cat: 'fish', tag: 'set:zodiac' }, n: 12 }),
  A('ach_guppy7', '일곱 빛깔', '무지개구피 7색', '🎨', 'weather', 20, { k: 'dexN', match: { cat: 'fish', tag: 'set:rainbow' }, n: 7 }),
  // 여행·바다
  A('ach_island_all', '군도 여행자', '섬 7곳 방문', '🗺️', 'travel', 20, { k: 'seen', set: 'island', n: MAIN_ISLANDS.length }),
  A('ach_islet_all', '무인도 수집가', '쪼꼬미섬 8곳 방문', '🏝️', 'travel', 20, { k: 'seen', set: 'islet', n: ISLETS.length }),
  A('ach_landmark_10', '보이는 곳은 다 간다', '랜드마크 10곳', '🗼', 'travel', 15, { k: 'seen', set: 'landmark', n: 10 }),
  A('ach_swim_far', '먼바다 수영', `해안에서 ${SWIM_FAR_M}m 까지 수영`, '🏊', 'travel', 5, max(C.swim, SWIM_FAR_M)),
  A('ach_wreck', '꿀꺽호의 비밀', '난파선 상자 열기', '🏴‍☠️', 'travel', 10, cnt(C.chestWreck, 1)),
  A('ach_raft', '첫 항해', '뗏목으로 다른 섬 가기', '🛶', 'travel', 10, cnt(C.raft, 1)),
  A('ach_tugboat', '통통통', '통통배 구입', '🚤', 'travel', 10, { k: 'unlocked', keys: ['v:tugboat'], n: 1 }),
  A('ach_speed', '물보라 질주', '모터보트 최고 속도', '💨', 'travel', 10, max(C.speed, SPEED_TOP)),
  A('ach_current', '해류 타기', `해류 띠 ${CURRENT_M / 1000}km`, '🌊', 'travel', 5, cnt(C.current, CURRENT_M)),
  A('ach_lighthouse_4', '불을 켜는 사람', '등대 4개 밝히기', '💡', 'travel', 20, { k: 'seen', set: 'lighthouse', n: 4 }),
  // 공룡
  A('ach_tino_sneak', '티노를 안 깨웠다', '낮잠 언덕 금상자 열기', '🤫', 'dino', 20, cnt(C.chestTino, 1)),
  A('ach_tino_wake', '미안해 티노', '티노를 깨움', '😵', 'dino', 5, cnt(C.tinoWake, 1)),
  A('ach_dino_friend', '공룡 친구', `공룡 하트 ${DINO_FRIEND_HEARTS}`, '💚', 'dino', 15, max(C.dinoHearts, DINO_FRIEND_HEARTS)),
  A('ach_dino_ride', '공룡 라이더', '공룡 타기', '🦖', 'dino', 20, cnt(C.dinoRide, 1)),
  A('ach_fossil_5', '꼬마 고생물학자', '골격 5개 완성', '🦴', 'dino', 15, { k: 'skeletons', n: 5 }),
  A('ach_fossil_all', '공룡관 완성', '골격 20개 완성', '🏛️', 'dino', 80, { k: 'skeletons', n: 20 }),
  // 보물
  A('ach_chest_10', '보물 사냥꾼', '상자 10개 열기', '📦', 'treasure', 5, cnt(C.chest, 10)),
  A('ach_chest_100', '보물왕', '상자 100개 열기', '💎', 'treasure', 30, cnt(C.chest, 100)),
  A('ach_mimic', '속았다!', '미믹 상자게 잡기', '🦀', 'treasure', 10, cnt(C.mimic, 1)),
  A('ach_gold_chest', '금빛 뚜껑', '금상자 열기', '🟨', 'treasure', 10, cnt(C.chestGold, 1)),
  A('ach_balloon_10', '새총 명사수', '풍선 선물 10개', '🎈', 'treasure', 10, cnt(C.balloon, 10)),
  A('ach_bottle_map', '보물지도의 끝', '보물지도 X 찾기', '🗺️', 'treasure', 15, cnt(C.chestMap, 1)),
  A('ach_stung', '퉁퉁', '벌에 쏘이기', '🐝', 'treasure', 5, cnt(C.stung, 1)),
  // 살림·마을
  A('ach_sell_100k', '큰손', '하루에 100,000코인어치 팔기', '💰', 'econ', 15, max(C.sellDay, 100_000)),
  A('ach_million', '도파 백만장자', '누적 1,000,000코인 벌기', '🤑', 'econ', 50, cnt(C.earned, 1_000_000)),
  A('ach_donate_50', '박물관의 친구', '박물관 기증 50', '🏛️', 'econ', 20, cnt(C.donate, 50)),
  A('ach_craft_10', '뚝딱뚝딱', '제작 10번', '🔨', 'econ', 10, cnt(C.craft, 10)),
  // 우주
  A('ach_rocket_part', '부품 하나', '로켓 부품 1개', '🔩', 'space', 10, { k: 'rocketParts', n: 1 }),
  A('ach_launch', '3, 2, 1, 발사!', '첫 발사', '🚀', 'space', 50, cnt(C.launch, 1)),
  A('ach_moon_jump', '달에서 높이뛰기', `달에서 ${MOON_JUMP_M}m 점프`, '🐰', 'space', 15, max(C.moonJump, MOON_JUMP_M)),
  A('ach_moon_fish', '달 낚시꾼', '달 물고기 3마리', '🌙', 'space', 15, cnt(C.moonfish, 3)),
  A('ach_starsaurus', '공룡의 후손', '별공룡에게 인사', '🦕', 'space', 30, { k: 'dexAny', ids: ['s_starsaurus'] }),
  A('ach_space_5', '우주 첫걸음', '우주 생물 5종', '🪐', 'space', 20, { k: 'dexN', match: { cat: 'space' }, n: 5 }),
];
export const ACH_BY_ID: ReadonlyMap<string, AchDef> = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

// ───────────── 일일 미션(GDD 4.10) ─────────────
export interface MissionTpl {
  id: string;
  text: string;
  icon: string;
  /** 오늘 카운터(d) 이름 */
  key: string;
  goal: number;
  /** 진행 숫자 단위(표시) */
  unit?: string;
}
export const MISSIONS_PER_DAY = 5;
export const MISSION_STARS = 3;
export const MISSIONS_ALL_STARS = 10;
/** 미션 하나 덤 열쇠 조각 · 다섯 개 모두 덤(GDD 4.1 '일일 미션' 열쇠 조각) */
export const MISSION_KEY: { color: KeyColor; n: number } = { color: 'silver', n: 1 };
export const MISSIONS_ALL_KEY: { color: KeyColor; n: number } = { color: 'gold', n: 1 };

export const MISSION_TEMPLATES: readonly MissionTpl[] = [
  { id: 'fish5', text: '물고기 5마리 낚기', icon: '🎣', key: C.fish, goal: 5, unit: '마리' },
  { id: 'bug3', text: '곤충 3마리 잡기', icon: '🦋', key: C.bug, goal: 3, unit: '마리' },
  { id: 'rare1', text: '★3 이상 1마리 잡기', icon: '💙', key: C.r3, goal: 1, unit: '마리' },
  { id: 'new1', text: '처음 보는 친구 1 등록', icon: '❓', key: C.newDex, goal: 1, unit: '종' },
  { id: 'chest3', text: '상자 3개 열기', icon: '📦', key: C.chest, goal: 3, unit: '개' },
  { id: 'rock5', text: '돌 5번 두드리기', icon: '🪨', key: C.rock, goal: 5, unit: '번' },
  { id: 'shake5', text: '나무 5번 흔들기', icon: '🌳', key: C.shake, goal: 5, unit: '번' },
  { id: 'dig2', text: '화석 X 2개 파기', icon: '❌', key: C.dig, goal: 2, unit: '개' },
  { id: 'donate2', text: '박물관에 2번 기증', icon: '🏛️', key: C.donate, goal: 2, unit: '번' },
  { id: 'sell5k', text: '5,000코인어치 팔기', icon: '🪙', key: C.sold, goal: 5000, unit: '코인' },
  { id: 'travel1', text: '다른 섬에 가 보기', icon: '⛵', key: C.travel, goal: 1, unit: '곳' },
  { id: 'dive2', text: '잠수 생물 2마리', icon: '🤿', key: C.dive, goal: 2, unit: '마리' },
  { id: 'feed3', text: '공룡에게 먹이 3번', icon: '🍖', key: C.feed, goal: 3, unit: '번' },
  { id: 'balloon1', text: '풍선 선물 1개 맞히기', icon: '🎈', key: C.balloon, goal: 1, unit: '개' },
  { id: 'hot1', text: '오늘의 인기 생물 잡기', icon: '🔥', key: C.hot, goal: 1, unit: '마리' },
];
export const MISSION_BY_ID: ReadonlyMap<string, MissionTpl> = new Map(MISSION_TEMPLATES.map((m) => [m.id, m]));

// ───────────── 보상 ─────────────
export interface Reward {
  stars?: number;
  keys?: ReadonlyArray<{ color: KeyColor; n: number }>;
  /** 가방에 넣을 것(econ.give) */
  items?: Readonly<Record<string, number>>;
  /** 풀 해금 키(econ.unlock) */
  unlock?: readonly string[];
  /** 영구 특전(ext.meta.perk) */
  perk?: string;
}

/** 세트 보상으로만 생기는 물건 — 이름·아이콘이 보이도록 'item' 칸으로 등록한다 */
export const REWARD_ITEMS: ReadonlyArray<{ id: string; name: string; icon: string; desc: string }> = [
  { id: 'f_mallang_cushion', name: '말랑 쿠션 가구 세트', icon: '🛋️', desc: '볼빵빵 친구 10종을 모은 기념 쿠션. 앉으면 퐁!' },
  { id: 'f_seabunny_doll', name: '바다토끼 인형', icon: '🐰', desc: '젤리바니 다섯 빛깔을 닮은 말랑 인형.' },
  { id: 'cos_gold_crown', name: '금관 모자', icon: '👑', desc: '왕관 개체 10마리를 모은 컬렉터의 증표.' },
  { id: 'tool_shiny_net', name: '반짝이 잠자리채', icon: '🌈', desc: '반짝이가 두 배로 잘 보이는 잠자리채.' },
  ...MAIN_ISLANDS.flatMap((id) => [
    { id: `f_flag_${id}`, name: `${islandKo(id)} 깃발`, icon: '🚩', desc: `${islandKo(id)}의 고유종을 전부 모은 섬 마스터 깃발.` },
    { id: `f_musicbox_${id}`, name: `${islandKo(id)} 음악 상자`, icon: '🎶', desc: `${islandKo(id)}의 노래가 흘러나오는 음악 상자.` },
  ]),
];
function islandKo(id: string): string {
  return ({ home: '말랑섬', dino: '쿵쿵공룡섬', ice: '솜눈섬', mushroom: '반딧불버섯섬', coral: '산호빛섬', desert: '모래시계섬', launch: '별똥별섬' } as Record<string, string>)[id] ?? id;
}
export const ISLAND_KO = (id: string) => islandKo(id);

// ───────────── 세트(GDD 4.11) ─────────────
/**
 * 세트 조건:
 * - dex: match 하는 종 need 칸 등록 · donate: match 하는 종 need 종 기증
 * - variant: 반짝이·왕관 개체 need 마리 · endemic: 그 섬 고유종(where 가 전부 그 섬) 전부
 * - extra: 덧붙는 조건(고대 = 골격 3)
 */
export interface SetDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  desc: string;
  mode: 'dex' | 'donate' | 'variant' | 'endemic';
  match?: SpeciesMatch;
  variant?: 'shiny' | 'crown';
  island?: string;
  need?: number;
  extra?: { k: 'skeletons'; n: number; label: string };
  reward: Reward;
  /** 보상 한 줄(화면 표시) */
  rewardText: string;
  /** 섬 마스터처럼 묶어서 보이는 무리 */
  group?: string;
}

/** 세트 하나 덤 열쇠 조각(금 3 = 금열쇠 1) */
const SET_KEYS = [{ color: 'gold' as KeyColor, n: 3 }];
const BIG_KEYS = [{ color: 'rainbow' as KeyColor, n: 1 }, { color: 'gold' as KeyColor, n: 3 }];

export const SETS: readonly SetDef[] = [
  {
    id: 'set-rainbow-guppy', name: '무지개 구피', icon: '🌈', color: '#ff9cb8', desc: '무지개구피 7색', mode: 'dex',
    match: { cat: 'fish', tag: 'set:rainbow' }, need: 7,
    reward: { stars: 30, keys: SET_KEYS, perk: 'rainbowlure' }, rewardText: '무지개 루어(★3+ +20% 영구) + ⭐30',
  },
  {
    id: 'set-constellation', name: '별자리 12', icon: '♈', color: '#a99bff', desc: '별자리 물고기 12종 기증', mode: 'donate',
    match: { cat: 'fish', tag: 'set:zodiac' }, need: 12,
    reward: { stars: 100, keys: BIG_KEYS, unlock: ['rocket:part:chip'] }, rewardText: '로켓 항법 칩 + ⭐100',
  },
  {
    id: 'set-glow', name: '밤의 빛', icon: '🏮', color: '#ffd36b', desc: '발광 생물 8종', mode: 'dex',
    match: { tag: 'set:glow' }, need: 8,
    reward: { stars: 40, keys: SET_KEYS, items: { f_fireflylantern: 1 }, perk: 'nightvision' }, rewardText: '반딧불 랜턴 + 밤 시야 확대 + ⭐40',
  },
  {
    id: 'set-ball', name: '볼빵빵', icon: '🐡', color: '#7cc8ff', desc: '동글동글 볼빵빵 몸 10종', mode: 'dex',
    match: { tag: 'set:ball' }, need: 10,
    reward: { stars: 30, keys: SET_KEYS, items: { f_mallang_cushion: 1 } }, rewardText: '말랑 쿠션 가구 세트 + ⭐30',
  },
  {
    id: 'set-nudi', name: '갯민숭 5색', icon: '🐰', color: '#ffb3d9', desc: '젤리바니 5색', mode: 'dex',
    match: { tag: 'set:nudi' }, need: 5,
    reward: { stars: 30, keys: SET_KEYS, items: { f_seabunny_doll: 1 } }, rewardText: '바다토끼 인형 + ⭐30',
  },
  {
    id: 'set-ancient', name: '고대', icon: '🦴', color: '#c9a37a', desc: '고대어 6종 + 골격 3', mode: 'dex',
    match: { cat: 'fish', tag: 'ancient' }, need: 6, extra: { k: 'skeletons', n: 3, label: '골격' },
    reward: { stars: 50, keys: SET_KEYS, unlock: ['facility:ranch'], perk: 'ranch' }, rewardText: '공룡 목장 확장 + ⭐50',
  },
  ...MAIN_ISLANDS.map((id): SetDef => ({
    id: `set-island-master:${id}`, name: `${islandKo(id)} 마스터`, icon: '🚩', color: '#9bd77a', desc: `${islandKo(id)} 고유종 전부`, mode: 'endemic',
    island: id, group: 'set-island-master',
    reward: { stars: 100, keys: BIG_KEYS, items: { [`f_flag_${id}`]: 1, [`f_musicbox_${id}`]: 1 } }, rewardText: '섬 깃발 + 음악 상자 + ⭐100',
  })),
  {
    id: 'set-crown', name: '왕관 컬렉터', icon: '👑', color: '#ffbe3b', desc: '왕관 개체 10마리', mode: 'variant', variant: 'crown', need: 10,
    reward: { stars: 50, keys: SET_KEYS, items: { cos_gold_crown: 1 } }, rewardText: '금관 모자 + ⭐50',
  },
  {
    id: 'set-shiny', name: '반짝이 헌터', icon: '✨', color: '#ff9cf0', desc: '반짝이 5마리', mode: 'variant', variant: 'shiny', need: 5,
    reward: { stars: 50, keys: SET_KEYS, items: { tool_shiny_net: 1 }, perk: 'shinynet' }, rewardText: '반짝이 잠자리채(반짝이 ×2) + ⭐50',
  },
  {
    id: 'set-space', name: '우주 첫걸음', icon: '🪐', color: '#8fb8ff', desc: '우주 생물 5종', mode: 'dex',
    match: { cat: 'space' }, need: 5,
    reward: { stars: 40, keys: SET_KEYS, unlock: ['facility:greenhouse'], perk: 'greenhouse' }, rewardText: '우주 온실 정원 + ⭐40',
  },
];
export const SET_BY_ID: ReadonlyMap<string, SetDef> = new Map(SETS.map((s) => [s.id, s]));
/** 특전 이름 — 읽는 쪽: rainbowlure(economy 굴림) · nightvision(atmosphere) · ranch(dinos) · shinynet(insects·economy) · greenhouse(garden) */
export const PERKS = ['rainbowlure', 'nightvision', 'ranch', 'shinynet', 'greenhouse'] as const;
export type PerkName = typeof PERKS[number];

// ───────────── 숙련(4.11 중복 처리) ─────────────
/** 0 미등록 · 1 등록 · 2 은별(10회) · 3 금별(왕관 개체) */
export const MASTERY_SILVER_COUNT = 10;
export const MASTERY_STARS: Readonly<Record<number, number>> = { 2: 1, 3: 3 };
export const MASTERY_NAME: Readonly<Record<number, string>> = { 0: '아직', 1: '등록', 2: '은별', 3: '금별' };

// ───────────── 섬 도감 %(4.1.1) ─────────────
export const ISLAND_DEX_STEPS: ReadonlyArray<{ pct: number; stars: number }> = [
  { pct: 50, stars: 20 }, { pct: 80, stars: 50 }, { pct: 100, stars: 100 },
];
