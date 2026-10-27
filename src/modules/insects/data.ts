// 곤충 도감 데이터 — 도감·상점·스포너가 읽는다. GDD 3.6 의 71종(섬·구역·시간·날씨·행동·생김새)을 한곳에.
// id 정책(계약 v2 3장): 예전부터 있던 종은 id 를 그대로 두고 gdd 에 GDD id 를 단다. 새 종은 GDD id(b_*) 그대로.
// GDD 표에 짝이 없는 옛 종은 LEGACY_INSECTS 로 따로 둔다(도감 칸 71 에는 안 들어가고, 옛 저장의 id 풀이용).
// 순수 데이터 + 순수 함수(poolFor) — three·DOM 없이 테스트에서 바로 읽는다.
import type { Species } from '../../core/state';
import type { Weather, SpeciesWhere } from '../../core/api';
import type { Part } from '../../core/art';

export type BugKind =
  | 'butterfly' | 'moth' | 'dragonfly' | 'damselfly' | 'bee' | 'beetle' | 'ladybug' | 'stag' | 'rhino'
  | 'cicada' | 'grasshopper' | 'mantis' | 'firefly' | 'ant' | 'spider' | 'snail' | 'strider'
  | 'snowbug' | 'sporebug' | 'scorpion' | 'dungbeetle' | 'pillbug' | 'caterpillar'
  // GDD 새 몸형: 대벌레 · 솜뭉치 · 소라게 · 잎사귀 · 호박 속 모기
  | 'stick' | 'puff' | 'crust' | 'leaf' | 'amber';

/** 서식 위치: 꽃 위 · 나무(그루터기) · 바위 옆 · 땅 · 물 위 · 공중 */
export type BugSpot = 'flower' | 'tree' | 'rock' | 'ground' | 'water' | 'air';
export type BugTod = 'morning' | 'day' | 'sunset' | 'night';
/** 표의 시간 코드(GDD 0.3) — 정오·자정은 시각 창으로 본다 */
export type BugTime = BugTod | 'noon' | 'midnight' | 'all';
/** 섬 테마(islet = 보물 작은 섬들) */
export type BugIsland = 'home' | 'dino' | 'ice' | 'mushroom' | 'coral' | 'desert' | 'launch' | 'islet';
/** GDD 3.6 행동 코드 7종 + 줍기(호박속모기) */
export type BugBehavior = 'fly' | 'hover' | 'perch' | 'hop' | 'crawl' | 'hide' | 'glow' | 'pickup';
/** 숨은 곤충이 나오는 계기: 나무 흔들기 · 돌 두드리기 · 모래 구덩이 · 삽으로 X 파기 */
export type BugHide = 'tree' | 'rock' | 'pit' | 'dig';
/** GDD 0.3 몸형 이름(도감·사진용 표기) */
export type BugBody =
  | 'BUTTERFLY' | 'BEETLE' | 'DRAGONFLY' | 'BEE' | 'HOPPER' | 'SNAIL' | 'MANTIS' | 'SPIDER' | 'STICK' | 'ANT' | 'PUFF' | 'CRUST';

export type BugPattern =
  | 'plain' | 'spots' | 'stripes' | 'eyes' | 'rainbow' | 'tiger' | 'glow' | 'iri'
  // GDD 0.3·0.5 무늬: 은하 · 오로라(hue 순환) · 불꽃 그라디언트 · 투명 · 하트 · 별 · 용암 균열 · 잎맥 · 얼음 결정 · 왕관(금·흰)
  | 'galaxy' | 'huecycle' | 'fire' | 'clear' | 'heart' | 'star' | 'crack' | 'leaf' | 'crystal' | 'crown' | 'meteor';

export interface BugLook {
  body: BugBody;
  parts?: Part[];
  /** 밤에 빛나는 종 */
  glow?: boolean;
  /** 반투명 날개(벚꽃나비·유령나방) */
  sheer?: boolean;
  /** 날개 작게(호박벌) */
  smallWings?: boolean;
  /** 길쭉한 껍질(비단벌레) · 둥근 껍질(개미귀신) · 울퉁불퉁(운석) */
  shell?: 'long' | 'round' | 'lumpy';
  /** 잎사귀를 머리에 이고 다닌다(잎꾼개미) */
  leaf?: boolean;
  /** 쇠똥 공 배율(1 = 기본) */
  ball?: number;
  [k: string]: unknown;
}

export interface BugSpecies extends Species {
  kind: BugKind;
  spot: BugSpot;
  /** where 에서 뽑은 섬 목록(옛 스포너·도감 서식지 표기용) */
  islands: BugIsland[];
  /** where 에서 뽑은 시간대 목록(정오 → 낮, 자정 → 밤) */
  tods: BugTod[];
  /** 몸 색 · 두 번째 색 · 포인트 색 */
  colors: [string, string, string];
  /** 모델 배율(m, 몸길이 대략) */
  size: number;
  /** 무늬 변주(종마다 다르게) */
  pattern?: BugPattern;
  /** 겁 많음(1 = 보통) — 도망 거리·성공률에 곱 */
  shy?: number;
  /** 크기 범위(cm) — 잡을 때 크기 표기 */
  cm: [number, number];
  /** GDD 3.6 행동 코드 */
  behavior: BugBehavior;
  /** 평소엔 안 보이고 이 계기로만 나온다 */
  hide?: BugHide;
  /** 삽으로 X 파기에서 나올 확률(호박속모기 5%) */
  digChance?: number;
  /** 이 높이(m, 땅 위) 이상에서만 난다(왕관나비 15 m) */
  minAlt?: number;
  /** 랜드마크 꼭대기에만 앉는다(할미벚 · 버섯 탑 · 피라미드 · 발사탑) */
  top?: 'sakura' | 'mushroom-tower' | 'pyramid' | 'launch-tower';
  /** 보름달일 때만 where 의 날씨 배율이 켜진다(달나방: 맑음 + 보름 ×3) */
  moon?: 'full';
  /** 친구 섬 방문 중이면 이 배율(하트무당벌레 ×2) */
  visit?: number;
  /** 잡으면 덤으로 주는 재료(별가루나방: 별가루 3) */
  drop?: { id: string; n: number };
  look: BugLook;
  where: SpeciesWhere[];
  tags: string[];
}

const ALL: BugTod[] = ['morning', 'day', 'sunset', 'night'];

// ───────── 이름표(도감 서식지 글) ─────────
export function islandName(i: BugIsland | string): string {
  return ({
    home: '말랑섬', dino: '쿵쿵공룡섬', ice: '솜눈섬', mushroom: '반딧불버섯섬', coral: '산호빛섬',
    desert: '모래시계섬', launch: '별똥별섬', islet: '보물 섬',
  } as Record<string, string>)[i] ?? i;
}
export function spotName(s: BugSpot): string {
  return { flower: '꽃 위', tree: '나무 그루터기', rock: '바위 옆', ground: '땅 위', water: '물 위', air: '하늘' }[s];
}
export function todName(t: BugTod | BugTime): string {
  return { morning: '아침', day: '낮', sunset: '저녁', night: '밤', noon: '정오', midnight: '자정', all: '하루 종일' }[t];
}
const ZONE_KO: Record<string, string> = {
  flower: '꽃밭', tree: '숲 나무', river: '강가', grass: '풀숲', rock: '바위', heartpond: '하트 연못', sakura: '할미벚 언덕',
  orchard: '과수원', beach: '해변', jungle: '정글', palm: '야자수', mangrove: '맹그로브', waterfall: '폭포',
  fern: '고사리 숲', ranch: '초원 목장', volcano: '화산 기슭', lava: '용암 돌밭', fossil: '화석층', ancientlake: '고대 호수 위',
  snow: '눈밭', icecave: '얼음 동굴', sky: '눈 오는 하늘', cabin: '오두막 불빛', snowtree: '눈꽃 나무', icelake: '얼음 호수 위',
  aurorahill: '오로라 언덕', swamp: '반딧불 늪', mushroom: '버섯 숲', shade: '버섯 그늘', shipwreck: '난파선 해안',
  foglake: '안개 호수', giant: '거인 나무', desertgrass: '사막 풀밭', sand: '모래 언덕', ruin: '유적', pit: '모래 구덩이',
  cactus: '선인장 밭', oasis: '오아시스 야자', pyramid: '피라미드 꼭대기', hill: '별 언덕', antenna: '안테나',
  pad: '발사대', meadow: '바람개비 초원', telescope: '천문대', wreckshore: '탐사선 해안',
};
/** 구역 코드 → 한국어(섬마다 뜻이 다른 tower·crater 는 섬을 같이 본다) */
export function zoneName(zone: string, island?: string): string {
  if (zone === 'tower') return island === 'launch' ? '발사탑 꼭대기' : '버섯 탑 꼭대기';
  if (zone === 'crater') return island === 'launch' ? '크레이터' : '분화구 가장자리';
  return ZONE_KO[zone] ?? zone;
}
const WEATHER_KO: Record<string, string> = {
  clear: '맑은 날', rain: '비 오는 날', storm: '폭풍 치는 날', fog: '안개 낀 날', meteor: '유성우 밤', snow: '눈 오는 날',
  blizzard: '눈보라 치는 날', rainbow: '무지개 뜬 날', aurora: '오로라 밤', sandstorm: '모래바람 부는 날',
};

/** 섬 id(islet-a 등) → 테마 */
export function themeOf(islandId: string | null | undefined): BugIsland | null {
  if (!islandId) return null;
  if (islandId.startsWith('islet')) return 'islet';
  return islandId as BugIsland;
}

// ───────── GDD 표 → 행 ─────────
/** 판매가(GDD 0.7): round10(BASE[★] × SIZE(곤충 M = 1) × ZONE(말랑섬 1, 다른 섬 1.15)) */
const BASE = [0, 60, 200, 700, 2500, 9000];
export const bugPrice = (rarity: number, island: string) => Math.round((BASE[rarity] ?? 60) * (island === 'home' ? 1 : 1.15) / 10) * 10;

/** 날씨 칸: '-' · 전용(only) · ×N(boost) */
type W = { only?: Weather[]; boost?: Weather[]; x?: number } | undefined;
const only = (...w: Weather[]): W => ({ only: w });
const boost = (x: number, ...w: Weather[]): W => ({ boost: w, x });

interface GddRow {
  gdd: string;
  /** 예전 id(접두사 'bug-' 뺀 것). 없으면 새 종 */
  old?: string;
  name: string;
  island: Exclude<BugIsland, 'islet'>;
  zones: string[];
  time: BugTime | BugTime[];
  weather?: W;
  rarity: 1 | 2 | 3 | 4 | 5;
  behavior: BugBehavior;
  kind: BugKind;
  body: BugBody;
  spot: BugSpot;
  colors: [string, string, string];
  pattern?: BugPattern;
  size: number;
  cm: [number, number];
  desc: string;
  parts?: Part[];
  extra?: Partial<Pick<BugSpecies, 'shy' | 'hide' | 'digChance' | 'minAlt' | 'top' | 'moon' | 'visit' | 'drop'>>;
  look?: Partial<BugLook>;
  tags?: string[];
  /** 보물 섬에서도 나오는 흔한 종 */
  islet?: boolean;
}

// 색은 GDD 0.5 이름표 값 그대로(순수 검정·회색 없음)
const INK = '#3d3a4a', WHITE = '#fffaf2', CREAM = '#fff1cf';

// prettier-ignore
const GDD: GddRow[] = [
  // ══════ 3.6.1 말랑섬 — 21종 ══════
  { gdd: 'b_cabbage_white', old: 'cabbage-white', name: '팔랑이흰나비', island: 'home', zones: ['flower'], time: 'day', rarity: 1, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'flower',
    colors: [WHITE, '#dfe6ee', INK], pattern: 'spots', size: 0.32, cm: [4, 6], desc: '첫 잠자리채의 첫 친구. 하얀 날개 끝 먹색 점 두 개가 매력 포인트.', islet: true },
  { gdd: 'b_yellow_butterfly', old: 'yellow-butterfly', name: '노랑나비', island: 'home', zones: ['flower'], time: ['morning', 'day'], rarity: 1, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'flower',
    colors: ['#ffd84a', '#ffa24c', '#fff8d0'], pattern: 'plain', size: 0.34, cm: [4, 6], desc: '햇빛 한 조각이 날아다닌다. 날개에서 햇볕 냄새가 난대요.', islet: true },
  { gdd: 'b_honeybee', old: 'honeybee', name: '붕붕꿀벌', island: 'home', zones: ['flower'], time: 'day', rarity: 1, behavior: 'fly', kind: 'bee', body: 'BEE', spot: 'flower',
    colors: ['#ffd84a', INK, WHITE], pattern: 'stripes', size: 0.24, cm: [1, 2], desc: '꿀 배달 중이라 바쁘다. 꽃을 맴돌며 콧노래를 불러요.', islet: true, tags: ['honey'] },
  { gdd: 'b_ladybug', old: 'seven-ladybug', name: '칠점이무당벌레', island: 'home', zones: ['flower'], time: 'morning', rarity: 1, behavior: 'perch', kind: 'ladybug', body: 'BEETLE', spot: 'flower',
    colors: ['#ff6b6b', INK, WHITE], pattern: 'spots', size: 0.21, cm: [0.7, 0.9], desc: '점 세는 걸 좋아한다. 정확히 일곱 개! 같이 세어 봐요.', islet: true },
  { gdd: 'b_cicada', old: 'cicada', name: '맴맴이매미', island: 'home', zones: ['tree'], time: 'day', weather: boost(2, 'clear'), rarity: 1, behavior: 'perch', kind: 'cicada', body: 'BEETLE', spot: 'tree',
    colors: ['#9bb35a', '#6e7a4a', '#c8ff9a'], pattern: 'plain', size: 0.32, cm: [3, 4], parts: ['wings-clear'], desc: '노래 실력은 아직 연습 중. 맴맴~ 음이탈도 귀여워요.' },
  { gdd: 'b_red_dragonfly', old: 'red-dragonfly', name: '고추잠자리', island: 'home', zones: ['river'], time: 'sunset', rarity: 1, behavior: 'hover', kind: 'dragonfly', body: 'DRAGONFLY', spot: 'air',
    colors: ['#ff6b6b', '#ff9a7a', '#ffe0d6'], pattern: 'plain', size: 0.4, cm: [4, 5], parts: ['wings-clear'], desc: '노을과 같은 색. 노을을 꼬리에 묻히고 다녀요.', islet: true },
  { gdd: 'b_snail', old: 'snail', name: '비오면산책달팽이', island: 'home', zones: ['flower', 'rock'], time: 'all', weather: only('rain'), rarity: 1, behavior: 'crawl', kind: 'snail', body: 'SNAIL', spot: 'rock',
    colors: ['#ff9fb8', CREAM, '#ff7fae'], pattern: 'stripes', size: 0.3, cm: [2, 4], desc: '비 오는 날만 외출한다. 우산은 등에 지고 다녀요.' },
  { gdd: 'b_pillbug', old: 'pillbug', name: '데굴데굴공벌레', island: 'home', zones: ['rock'], time: 'all', rarity: 1, behavior: 'hide', kind: 'pillbug', body: 'BEETLE', spot: 'rock',
    colors: ['#b8b8c4', '#8aa0b8', '#dfe6ee'], pattern: 'stripes', size: 0.28, cm: [1, 1.5], extra: { hide: 'rock' }, desc: '부끄러우면 공이 된다. 돌을 톡톡 두드리면 데굴데굴 나와요.', islet: true },
  { gdd: 'b_water_strider', old: 'strider', name: '물위걷기소금쟁이', island: 'home', zones: ['river'], time: 'day', rarity: 1, behavior: 'crawl', kind: 'strider', body: 'SPIDER', spot: 'water',
    colors: ['#a8764f', '#6e4a33', '#c8d8ff'], pattern: 'plain', size: 0.3, cm: [1, 2], parts: ['legs-long'], desc: '물 위가 바닥이다. 스케이트 타듯 쓱쓱.' },
  { gdd: 'b_cricket', old: 'cricket', name: '왕귀뚜라미', island: 'home', zones: ['grass'], time: 'night', rarity: 1, behavior: 'hop', kind: 'grasshopper', body: 'HOPPER', spot: 'ground',
    colors: ['#8a5a3a', '#6e4a33', '#c8a07a'], pattern: 'plain', size: 0.28, cm: [2, 3], desc: '밤의 바이올린 담당. 귀뚤귀뚤~ 앙코르도 받아 줘요.', islet: true },
  { gdd: 'b_swallowtail', old: 'swallowtail', name: '어흥나비호랑나비', island: 'home', zones: ['flower'], time: 'day', weather: boost(2, 'clear'), rarity: 2, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'flower',
    colors: ['#ffd84a', INK, '#8fd3f4'], pattern: 'tiger', size: 0.42, cm: [8, 11], desc: '이름만 무섭다. 줄무늬 정장을 차려입은 꽃밭의 신사.' },
  { gdd: 'b_sakura_butterfly', old: 'pink-petal', name: '벚꽃나비', island: 'home', zones: ['sakura'], time: 'day', rarity: 2, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'flower',
    colors: ['#ffd0de', '#ff9fb8', '#fff0f6'], pattern: 'spots', size: 0.34, cm: [5, 7], look: { sheer: true }, tags: ['petal'], desc: '꽃잎이 날아다니는 줄. 날개 너머로 햇살이 비쳐요.' },
  { gdd: 'b_bumblebee', old: 'bumblebee', name: '뚱벌호박벌', island: 'home', zones: ['flower'], time: 'morning', rarity: 2, behavior: 'fly', kind: 'bee', body: 'BEE', spot: 'flower',
    colors: ['#ffd84a', INK, '#ffa24c'], pattern: 'stripes', size: 0.3, cm: [2, 3], parts: ['fluffy'], look: { smallWings: true }, tags: ['honey'], desc: '날개가 너무 작아 보이는데 잘 난다. 튤립 사이에서 둥실.' },
  { gdd: 'b_flower_chafer', old: 'chafer', name: '초록보석꽃무지', island: 'home', zones: ['flower'], time: 'day', rarity: 2, behavior: 'perch', kind: 'beetle', body: 'BEETLE', spot: 'flower',
    colors: ['#5cc16a', '#2f8a6a', '#c8ffb0'], pattern: 'iri', size: 0.26, cm: [1.5, 2.5], desc: '꽃 속에서 낮잠. 초록 보석 같은 등이 반짝반짝.' },
  { gdd: 'b_firefly', old: 'firefly', name: '반짝반딧불이', island: 'home', zones: ['river'], time: 'night', rarity: 3, behavior: 'glow', kind: 'firefly', body: 'BEETLE', spot: 'air',
    colors: [INK, '#7a6a8a', '#c8ff5a'], pattern: 'glow', size: 0.22, cm: [1, 1.5], look: { glow: true }, tags: ['set:glow', 'firefly'], desc: '강가의 작은 별. 꼬리 등불을 켜고 밤 산책을 나와요.' },
  { gdd: 'b_rhino_beetle', old: 'rhino-beetle', name: '대장뿔장수풍뎅이', island: 'home', zones: ['tree'], time: 'night', rarity: 3, behavior: 'hide', kind: 'rhino', body: 'BEETLE', spot: 'tree',
    colors: ['#a8764f', '#6e4a33', '#d8a070'], pattern: 'plain', size: 0.42, cm: [5, 8], parts: ['horn'], extra: { hide: 'tree' }, tags: ['sumo'], desc: '마을 씨름 대장. 나무를 흔들면 뿔부터 쑥 나와요.' },
  { gdd: 'b_stag_beetle', old: 'stag-beetle', name: '집게왕사슴벌레', island: 'home', zones: ['tree'], time: 'night', rarity: 3, behavior: 'hide', kind: 'stag', body: 'BEETLE', spot: 'tree',
    colors: [INK, '#2f2c3c', '#8a7aa0'], pattern: 'plain', size: 0.4, cm: [4, 7], parts: ['claws-big'], extra: { hide: 'tree' }, tags: ['sumo'], desc: '집게 자랑을 멈추지 않는다. 그래도 사실 순해요.' },
  { gdd: 'b_rainbow_beetle', old: 'jungle-beetle', name: '무지개딱정벌레', island: 'home', zones: ['flower'], time: 'all', weather: only('rainbow'), rarity: 3, behavior: 'perch', kind: 'beetle', body: 'BEETLE', spot: 'flower',
    colors: ['#ff9fb8', '#8fd3f4', '#ffd84a'], pattern: 'rainbow', size: 0.3, cm: [2, 3], tags: ['rainbow'], desc: '등에 무지개를 접어 둠. 무지개 뜬 날 꽃잎 언덕에만 놀러 와요.' },
  { gdd: 'b_heart_ladybug', old: 'heart-ladybug', name: '하트무당벌레', island: 'home', zones: ['heartpond', 'sakura'], time: 'day', rarity: 3, behavior: 'perch', kind: 'ladybug', body: 'BEETLE', spot: 'flower',
    colors: ['#ff9fb8', '#ff6b6b', WHITE], pattern: 'heart', size: 0.22, cm: [0.8, 1.0], extra: { visit: 2, shy: 1.2 }, desc: '둘이 보면 행운. 친구가 놀러 오면 두 배로 나와요.' },
  { gdd: 'b_orchid_mantis', old: 'orchid-mantis', name: '난초사마귀', island: 'home', zones: ['flower'], time: 'sunset', rarity: 4, behavior: 'perch', kind: 'mantis', body: 'MANTIS', spot: 'flower',
    colors: ['#ffd0de', WHITE, '#ff9fb8'], pattern: 'plain', size: 0.36, cm: [5, 7], parts: ['flower'], extra: { shy: 1.2 }, tags: ['camo'], desc: '꽃인 척하는 연기 대상 수상. 1.5m 안으로 오면 깜짝 도망!' },
  { gdd: 'b_crown_butterfly', old: 'rainbow-butterfly', name: '왕관나비', island: 'home', zones: ['sakura'], time: 'morning', weather: only('clear'), rarity: 5, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'air',
    colors: ['#ffcf4a', WHITE, '#fff4b0'], pattern: 'crown', size: 0.5, cm: [10, 13], parts: ['crown'], extra: { shy: 1.4, minAlt: 15, top: 'sakura' }, tags: ['petal'],
    desc: '할미벚이 키운 나비의 여왕. 맑은 아침, 15m 높이에서만 춤춰요.' },

  // ══════ 3.6.2 산호빛섬 — 9종 ══════
  { gdd: 'b_hermit_crab', name: '이사왕소라게', island: 'coral', zones: ['beach'], time: 'morning', rarity: 1, behavior: 'crawl', kind: 'crust', body: 'CRUST', spot: 'ground',
    colors: ['#ff8a7a', '#ffc59a', CREAM], pattern: 'spots', size: 0.3, cm: [3, 6], tags: ['shell:random', 'sideways'], desc: '곤충 칸에 들어온 이유는 본인도 모름. 껍데기 색은 그날 기분.' },
  { gdd: 'b_leafcutter', old: 'ant', name: '잎꾼개미', island: 'coral', zones: ['jungle'], time: 'day', rarity: 1, behavior: 'crawl', kind: 'ant', body: 'ANT', spot: 'ground',
    colors: ['#a8764f', '#6e4a33', '#5cc16a'], pattern: 'plain', size: 0.25, cm: [0.8, 1.2], look: { leaf: true }, tags: ['march'], desc: '잎 우산 행렬. 영차영차 줄 서서 출근 중.' },
  { gdd: 'b_orange_wasp', old: 'hoverfly', name: '쏘지마벌', island: 'coral', zones: ['palm'], time: 'day', rarity: 2, behavior: 'fly', kind: 'bee', body: 'BEE', spot: 'flower',
    colors: ['#ffa24c', INK, WHITE], pattern: 'stripes', size: 0.26, cm: [1.5, 2.5], desc: '쏘지 않겠다고 약속했다. 새끼손가락 걸고!' },
  { gdd: 'b_stick_insect', old: 'jungle-mantis', name: '나뭇가지씨대벌레', island: 'coral', zones: ['jungle'], time: 'sunset', rarity: 3, behavior: 'perch', kind: 'stick', body: 'STICK', spot: 'tree',
    colors: ['#b9804e', '#8a5a3a', '#a8e06a'], pattern: 'plain', size: 0.5, cm: [8, 15], extra: { shy: 1.1 }, tags: ['camo'], desc: '찾아내면 진짜 뿌듯. 가지인 척 꼼짝 안 해요.' },
  { gdd: 'b_leaf_insect', name: '잎인척잎사귀벌레', island: 'coral', zones: ['jungle'], time: 'day', rarity: 3, behavior: 'perch', kind: 'leaf', body: 'BEETLE', spot: 'tree',
    colors: ['#a8e06a', '#5cc16a', '#e8ffb0'], pattern: 'leaf', size: 0.4, cm: [6, 9], extra: { shy: 1.1 }, tags: ['camo'], desc: '잎맥까지 그려 넣은 정성. 바람 불면 같이 살랑살랑.' },
  { gdd: 'b_jewel_beetle', old: 'jewel-beetle', name: '비단벌레', island: 'coral', zones: ['palm'], time: 'day', weather: boost(2, 'clear'), rarity: 3, behavior: 'perch', kind: 'beetle', body: 'BEETLE', spot: 'tree',
    colors: ['#3fd07a', '#4a6aff', '#ff6a9a'], pattern: 'iri', size: 0.3, cm: [3, 4], look: { shell: 'long' }, desc: '보석상 단골. 보는 각도마다 색이 바뀌어요.' },
  { gdd: 'b_birdwing', old: 'black-swallowtail', name: '비단제비나비', island: 'coral', zones: ['jungle'], time: 'day', weather: boost(2, 'clear'), rarity: 4, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'flower',
    colors: ['#3fc7b4', INK, '#9ef0d2'], pattern: 'iri', size: 0.5, cm: [12, 16], extra: { shy: 1.2 }, desc: '날개에 정글을 담았다. 히비스커스 꽃만 골라 앉아요.' },
  { gdd: 'b_morpho', old: 'morpho', name: '파란꿈모르포나비', island: 'coral', zones: ['waterfall'], time: 'morning', rarity: 4, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'air',
    colors: ['#4a9cf0', '#3b5bb5', '#d8f4ff'], pattern: 'iri', size: 0.5, cm: [12, 15], extra: { shy: 1.2 }, desc: '날갯짓마다 파란 반짝임. 폭포 물보라 속 아침 산책.' },
  { gdd: 'b_hercules', old: 'hercules', name: '헤라클이헤라클레스장수풍뎅이', island: 'coral', zones: ['jungle'], time: 'night', rarity: 5, behavior: 'hide', kind: 'rhino', body: 'BEETLE', spot: 'tree',
    colors: ['#ffd84a', INK, '#fff4c8'], pattern: 'spots', size: 0.62, cm: [14, 17], parts: ['horn'], extra: { hide: 'tree', shy: 1.4 }, tags: ['sumo'], desc: '곤충계의 헤라클레스. 거목을 흔들면 긴 뿔 두 개가 쑥!' },

  // ══════ 3.6.3 쿵쿵공룡섬 — 8종 ══════
  { gdd: 'b_fern_hopper', old: 'grasshopper', name: '풀쩍고사리메뚜기', island: 'dino', zones: ['fern'], time: 'day', rarity: 1, behavior: 'hop', kind: 'grasshopper', body: 'HOPPER', spot: 'ground',
    colors: ['#a8e06a', '#5cc16a', '#e8ffb0'], pattern: 'plain', size: 0.3, cm: [3, 4], desc: '공룡 발밑에서도 겁이 없다. 폴짝폴짝 트램펄린 선수.' },
  { gdd: 'b_dung_beetle', old: 'dung-beetle', name: '공룡똥쇠똥구리', island: 'dino', zones: ['ranch'], time: 'morning', rarity: 2, behavior: 'crawl', kind: 'dungbeetle', body: 'BEETLE', spot: 'ground',
    colors: ['#6e4a33', '#4a3328', '#a8764f'], pattern: 'plain', size: 0.3, cm: [2, 3], parts: ['ball'], look: { ball: 1.45 }, tags: ['ball'], desc: '꿈은 크게, 공은 더 크게. 자기보다 세 배 큰 공을 영차!' },
  { gdd: 'b_lava_firefly', old: 'lava-firefly', name: '불똥이화산반딧불', island: 'dino', zones: ['volcano'], time: 'night', rarity: 2, behavior: 'glow', kind: 'firefly', body: 'BEETLE', spot: 'air',
    colors: [INK, '#ff6a3a', '#ffa24c'], pattern: 'glow', size: 0.24, cm: [1.5, 2], look: { glow: true }, tags: ['set:glow', 'firefly'], desc: '화산 불꽃을 빌려 온다. 꼬리가 따끈따끈.' },
  { gdd: 'b_lava_beetle', name: '숯검댕용암딱정벌레', island: 'dino', zones: ['lava'], time: 'sunset', rarity: 2, behavior: 'hide', kind: 'beetle', body: 'BEETLE', spot: 'rock',
    colors: [INK, '#2f2c3c', '#ffa24c'], pattern: 'crack', size: 0.3, cm: [2, 3], look: { glow: true }, extra: { hide: 'rock' }, tags: ['set:glow'], desc: '등이 늘 따뜻하다. 용암 돌을 두드리면 쏙 나와요.' },
  { gdd: 'b_heart_scorpion', old: 'pink-scorpion', name: '하트꼬리전갈', island: 'dino', zones: ['rock'], time: 'night', rarity: 3, behavior: 'crawl', kind: 'scorpion', body: 'SPIDER', spot: 'rock',
    colors: [CREAM, '#ffc59a', '#ff9fb8'], pattern: 'heart', size: 0.32, cm: [4, 6], parts: ['claws-big'], extra: { hide: 'rock' }, desc: '꼬리 끝이 하트 모양. 무서운 척하는 수줍음쟁이.' },
  { gdd: 'b_amber_mosquito', name: '호박속모기', island: 'dino', zones: ['fossil'], time: 'all', rarity: 3, behavior: 'pickup', kind: 'amber', body: 'BEETLE', spot: 'ground',
    colors: ['#ffcf4a', '#ffa24c', '#6e4a33'], pattern: 'clear', size: 0.26, cm: [1, 2], extra: { hide: 'dig', digChance: 0.05 }, tags: ['ancient'], desc: '1억 년째 같은 자세. 화석층 X 를 파면 가끔 반짝 나와요.' },
  { gdd: 'b_meganeura', old: 'meganeura', name: '큰잠자리할배메가네우라', island: 'dino', zones: ['ancientlake'], time: 'day', weather: boost(2, 'clear'), rarity: 4, behavior: 'hover', kind: 'dragonfly', body: 'DRAGONFLY', spot: 'air',
    colors: ['#3fc7b4', '#2a8a8a', '#e8fff8'], pattern: 'stripes', size: 1.15, cm: [65, 75], parts: ['wings-clear'], extra: { shy: 1.5 }, tags: ['ancient'], desc: '날개 한 번에 바람이 분다. 공룡보다 먼저 하늘을 날았대요.' },
  { gdd: 'b_fire_butterfly', old: 'desert-orange', name: '불꽃나비', island: 'dino', zones: ['crater'], time: 'noon', weather: only('clear'), rarity: 5, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'air',
    colors: ['#ff6b6b', '#ffd84a', '#ffa24c'], pattern: 'fire', size: 0.44, cm: [9, 12], look: { glow: true }, extra: { shy: 1.4 }, tags: ['set:glow'], desc: '용암의 춤이 나비가 됐다. 맑은 날 정오, 분화구 가장자리에서만.' },

  // ══════ 3.6.4 솜눈섬 — 7종 ══════
  { gdd: 'b_springtail', name: '톡톡이톡토기', island: 'ice', zones: ['snow'], time: 'all', rarity: 1, behavior: 'hop', kind: 'puff', body: 'PUFF', spot: 'ground',
    colors: ['#3b5bb5', '#8fd3f4', WHITE], pattern: 'plain', size: 0.2, cm: [0.3, 0.6], extra: { hide: 'rock' }, desc: '눈밭에서 톡톡 튄다. 눈 덮인 돌을 두드리면 톡!' },
  { gdd: 'b_cave_cricket', name: '꼽꼽이동굴귀뚜라미', island: 'ice', zones: ['icecave'], time: 'night', rarity: 1, behavior: 'hop', kind: 'grasshopper', body: 'HOPPER', spot: 'rock',
    colors: ['#e9d3a8', '#c8a878', CREAM], pattern: 'clear', size: 0.3, cm: [2, 3], parts: ['legs-long'], desc: '동굴 메아리 담당. 꼽꼽~ 하고 울면 동굴이 따라 해요.' },
  { gdd: 'b_snow_bug', old: 'snowflake-bug', name: '눈송이벌레', island: 'ice', zones: ['sky'], time: 'all', weather: only('snow'), rarity: 2, behavior: 'fly', kind: 'puff', body: 'PUFF', spot: 'air',
    colors: [WHITE, '#dfe6ee', '#8fd3f4'], pattern: 'plain', size: 0.24, cm: [0.5, 1], parts: ['fluffy'], look: { smallWings: true }, desc: '눈송이인 줄 알고 그냥 지나친다. 눈 오는 날 둥둥.' },
  { gdd: 'b_scarf_moth', old: 'snow-moth', name: '털목도리나방', island: 'ice', zones: ['cabin'], time: 'night', rarity: 2, behavior: 'fly', kind: 'moth', body: 'BUTTERFLY', spot: 'air',
    colors: [CREAM, '#e9d3a8', '#ff6b6b'], pattern: 'plain', size: 0.34, cm: [4, 6], parts: ['fluffy'], desc: '목도리 없이는 못 난다. 오두막 불빛을 빙글빙글.' },
  { gdd: 'b_snow_ladybug', old: 'ice-ladybug', name: '흰점이눈꽃무당벌레', island: 'ice', zones: ['snowtree'], time: 'day', rarity: 2, behavior: 'perch', kind: 'ladybug', body: 'BEETLE', spot: 'tree',
    colors: [WHITE, '#8fd3f4', WHITE], pattern: 'spots', size: 0.22, cm: [0.6, 0.9], desc: '겨울 한정판. 하얀 등에 하늘색 눈꽃 점.' },
  { gdd: 'b_frost_butterfly', old: 'frost-butterfly', name: '서리나비', island: 'ice', zones: ['icelake'], time: 'morning', rarity: 3, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'air',
    colors: ['#e8f7ff', '#8fd3f4', WHITE], pattern: 'crystal', size: 0.38, cm: [6, 8], look: { sheer: true }, desc: '손대면 녹을까 봐 조심. 날갯짓마다 눈가루가 흩날려요.' },
  { gdd: 'b_aurora_butterfly', name: '오로라나비', island: 'ice', zones: ['aurorahill'], time: 'night', weather: only('aurora'), rarity: 5, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'air',
    colors: ['#9ef0d2', '#a77be0', '#8fd3f4'], pattern: 'huecycle', size: 0.46, cm: [10, 13], look: { glow: true }, extra: { shy: 1.4 }, desc: '오로라 조각이 나비가 됐다. 오로라 밤에만 언덕 위로 내려와요.' },

  // ══════ 3.6.5 반딧불버섯섬 — 9종 ══════
  { gdd: 'b_firefly_swarm', old: 'galaxy-firefly', name: '깜빡이반딧불이', island: 'mushroom', zones: ['swamp'], time: 'night', rarity: 1, behavior: 'glow', kind: 'firefly', body: 'BEETLE', spot: 'air',
    colors: ['#6e7a5a', '#9bb35a', '#c8ff5a'], pattern: 'glow', size: 0.2, cm: [0.8, 1.2], look: { glow: true }, tags: ['set:glow', 'firefly', 'swarm'], desc: '수백 마리가 같이 깜빡인다. 하나, 둘, 셋 — 반짝!' },
  { gdd: 'b_swamp_dragonfly', old: 'emperor-dragonfly', name: '늪장수잠자리', island: 'mushroom', zones: ['swamp'], time: 'sunset', rarity: 2, behavior: 'hover', kind: 'dragonfly', body: 'DRAGONFLY', spot: 'air',
    colors: ['#5cc16a', INK, '#d8ffe0'], pattern: 'stripes', size: 0.5, cm: [7, 9], parts: ['wings-clear'], desc: '늪 경비대장. 커다란 눈으로 모든 걸 봐요.' },
  { gdd: 'b_shroom_bug', old: 'spore-bug', name: '갓쓴벌레', island: 'mushroom', zones: ['mushroom'], time: 'all', weather: boost(3, 'rain'), rarity: 2, behavior: 'perch', kind: 'sporebug', body: 'BEETLE', spot: 'ground',
    colors: ['#c89a6a', '#ff6b6b', WHITE], pattern: 'spots', size: 0.28, cm: [1, 2], desc: '우산을 들고 다니는 대신 길렀다. 비 오면 신나서 잔뜩 나와요.' },
  { gdd: 'b_jumping_spider', old: 'jumping-spider', name: '털뭉치깡총거미', island: 'mushroom', zones: ['mushroom'], time: 'day', rarity: 2, behavior: 'hop', kind: 'spider', body: 'SPIDER', spot: 'tree',
    colors: ['#c9b6f2', '#a77be0', WHITE], pattern: 'plain', size: 0.24, cm: [0.6, 1], parts: ['fluffy'], desc: '눈이 너무 커서 무서울 틈이 없다. 폴짝 뛰어 인사해요.' },
  { gdd: 'b_neon_snail', old: 'rainbow-snail', name: '네온달팽이', island: 'mushroom', zones: ['shade'], time: 'night', rarity: 3, behavior: 'crawl', kind: 'snail', body: 'SNAIL', spot: 'rock',
    colors: ['#3fc7b4', '#c8fff0', '#9ef0d2'], pattern: 'glow', size: 0.3, cm: [2, 4], look: { glow: true }, tags: ['set:glow'], desc: '밤길 가로등 담당. 껍데기가 은은하게 빛나요.' },
  { gdd: 'b_ghost_moth', old: 'silkmoth', name: '스르르유령나방', island: 'mushroom', zones: ['shipwreck'], time: 'night', weather: boost(3, 'fog'), rarity: 3, behavior: 'fly', kind: 'moth', body: 'BUTTERFLY', spot: 'air',
    colors: [WHITE, '#dfe6ee', '#c9b6f2'], pattern: 'clear', size: 0.38, cm: [5, 7], look: { sheer: true }, tags: ['flicker', 'fog'], desc: '보였다 안 보였다. 안개 낀 밤엔 세 배로 놀러 와요.' },
  { gdd: 'b_glasswing', old: 'fairy-butterfly', name: '유리날개나비', island: 'mushroom', zones: ['foglake'], time: 'day', rarity: 4, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'air',
    colors: [WHITE, '#ff9fb8', '#ffd0de'], pattern: 'clear', size: 0.38, cm: [5, 6], parts: ['wings-clear'], extra: { shy: 1.2 }, desc: '날개 너머가 다 보인다. 분홍 테두리만 살짝.' },
  { gdd: 'b_moon_moth', old: 'luna-moth', name: '달나방', island: 'mushroom', zones: ['giant'], time: 'night', weather: boost(3, 'clear'), rarity: 4, behavior: 'fly', kind: 'moth', body: 'BUTTERFLY', spot: 'air',
    colors: ['#a8e06a', CREAM, '#ffe48a'], pattern: 'eyes', size: 0.5, cm: [9, 12], extra: { moon: 'full', shy: 1.2 }, tags: ['moon'], desc: '달빛을 날개에 담는다. 맑은 보름달 밤이면 세 배로 나와요.' },
  { gdd: 'b_firefly_queen', name: '별빛반딧불여왕', island: 'mushroom', zones: ['tower'], time: 'midnight', rarity: 5, behavior: 'glow', kind: 'firefly', body: 'BEETLE', spot: 'air',
    colors: ['#ffcf4a', '#c98f3a', '#fff27a'], pattern: 'glow', size: 0.36, cm: [3, 4], parts: ['crown'], look: { glow: true }, extra: { shy: 1.3, top: 'mushroom-tower' }, tags: ['set:glow', 'firefly'],
    desc: '섬의 모든 반딧불이 따른다. 자정, 버섯 탑 꼭대기에서 반짝.' },

  // ══════ 3.6.6 모래시계섬 — 8종 ══════
  { gdd: 'b_desert_hopper', old: 'sand-hopper', name: '모래뛰기메뚜기', island: 'desert', zones: ['desertgrass'], time: 'day', rarity: 1, behavior: 'hop', kind: 'grasshopper', body: 'HOPPER', spot: 'ground',
    colors: ['#f4e2b0', '#d8b88a', '#fff4d8'], pattern: 'spots', size: 0.28, cm: [2, 3], desc: '모래 위 멀리뛰기 챔피언. 모래색이라 숨바꼭질도 1등.' },
  { gdd: 'b_silver_ant', old: 'red-ant', name: '은빛달리기사막개미', island: 'desert', zones: ['sand'], time: 'noon', rarity: 1, behavior: 'crawl', kind: 'ant', body: 'ANT', spot: 'ground',
    colors: ['#dfe6ee', '#8aa0b8', WHITE], pattern: 'iri', size: 0.25, cm: [0.6, 1], tags: ['fast'], desc: '뜨거워서 늘 뛴다. 정오의 모래 위 단거리 선수.' },
  { gdd: 'b_scarab', old: 'coconut-beetle', name: '스카라브쇠똥구리', island: 'desert', zones: ['ruin'], time: 'morning', rarity: 2, behavior: 'crawl', kind: 'dungbeetle', body: 'BEETLE', spot: 'ground',
    colors: ['#3fc7b4', '#2a8a8a', '#9ef0d2'], pattern: 'iri', size: 0.3, cm: [2, 3], parts: ['ball'], tags: ['ball'], desc: '해를 굴리는 꿈을 꾼다. 유적 앞이 단골 연습장.' },
  { gdd: 'b_antlion', name: '깔때기개미귀신', island: 'desert', zones: ['pit'], time: 'all', rarity: 3, behavior: 'hide', kind: 'beetle', body: 'BEETLE', spot: 'ground',
    colors: ['#e9d3a8', '#c8a878', CREAM], pattern: 'plain', size: 0.28, cm: [1, 1.5], parts: ['claws-big'], look: { shell: 'round' }, extra: { hide: 'pit' }, desc: '구덩이 장인. 모래 깔때기를 들여다보면 쏙 나와요.' },
  { gdd: 'b_star_scorpion', old: 'emperor-scorpion', name: '꼬리별전갈', island: 'desert', zones: ['ruin'], time: 'night', weather: boost(2, 'clear'), rarity: 3, behavior: 'hide', kind: 'scorpion', body: 'SPIDER', spot: 'rock',
    colors: ['#3fc7b4', '#2a8a8a', '#9ef0d2'], pattern: 'glow', size: 0.36, cm: [6, 9], parts: ['claws-big'], look: { glow: true }, extra: { hide: 'rock', shy: 1.2 }, tags: ['set:glow'], desc: '달빛을 받으면 빛난다. 유적 돌 밑에서 꼬리별이 반짝.' },
  { gdd: 'b_tarantula', name: '털보거미왕', island: 'desert', zones: ['cactus'], time: 'night', rarity: 4, behavior: 'crawl', kind: 'spider', body: 'SPIDER', spot: 'ground',
    colors: ['#a8764f', '#6e4a33', '#ffa24c'], pattern: 'stripes', size: 0.42, cm: [10, 14], parts: ['fluffy'], extra: { shy: 1.2 }, desc: '털 손질에 하루를 다 쓴다. 주황 무릎 양말이 포인트.' },
  { gdd: 'b_sundial_cicada', old: 'big-cicada', name: '해시계매미', island: 'desert', zones: ['oasis'], time: 'noon', weather: only('clear'), rarity: 4, behavior: 'perch', kind: 'cicada', body: 'BEETLE', spot: 'tree',
    colors: ['#ffcf4a', '#c98f3a', '#fff4b0'], pattern: 'plain', size: 0.36, cm: [4, 5], parts: ['wings-clear'], desc: '정오에만 운다. 맑은 날 오아시스 야자에서 "지금 12시!"' },
  { gdd: 'b_golden_scarab', old: 'golden-stag', name: '황금풍뎅이', island: 'desert', zones: ['pyramid'], time: 'all', rarity: 5, behavior: 'perch', kind: 'beetle', body: 'BEETLE', spot: 'rock',
    colors: ['#ffcf4a', '#c98a1a', '#fff4b0'], pattern: 'iri', size: 0.36, cm: [4, 6], extra: { shy: 1.4, top: 'pyramid' }, desc: '유적의 진짜 보물. 피라미드 꼭대기에서 반짝반짝 기다려요.' },

  // ══════ 3.6.7 별똥별섬 — 9종(이 섬에만 사는 친구들) ══════
  { gdd: 'b_wind_dragonfly', old: 'blue-damsel', name: '바람잠자리', island: 'launch', zones: ['meadow'], time: 'day', rarity: 1, behavior: 'hover', kind: 'dragonfly', body: 'DRAGONFLY', spot: 'air',
    colors: ['#8fd3f4', '#4a9cf0', '#e0f6ff'], pattern: 'plain', size: 0.38, cm: [3, 5], parts: ['wings-clear'], desc: '바람개비 따라 빙글. 바람이 불면 신나서 뱅글뱅글.' },
  { gdd: 'b_star_firefly', old: 'star-firefly', name: '별똥이별빛반딧불', island: 'launch', zones: ['hill'], time: 'night', rarity: 2, behavior: 'glow', kind: 'firefly', body: 'BEETLE', spot: 'air',
    colors: [INK, '#ffd84a', '#fff8b0'], pattern: 'star', size: 0.23, cm: [1, 1.5], look: { glow: true }, tags: ['set:glow', 'firefly'], desc: '별자리 흉내를 낸다. 꼬리 등불이 별 모양!' },
  { gdd: 'b_antenna_moth', old: 'fluffy-moth', name: '안테나나방', island: 'launch', zones: ['antenna'], time: 'night', rarity: 2, behavior: 'perch', kind: 'moth', body: 'BUTTERFLY', spot: 'tree',
    colors: ['#8aa0b8', '#6a7ea0', CREAM], pattern: 'plain', size: 0.34, cm: [3, 5], parts: ['antenna-big'], desc: '우주 신호를 듣는 중. 쉿, 지금 외계인이랑 통화 중이래요.' },
  { gdd: 'b_launch_cricket', name: '발사뛰기귀뚜라미', island: 'launch', zones: ['pad'], time: 'day', rarity: 2, behavior: 'hop', kind: 'grasshopper', body: 'HOPPER', spot: 'ground',
    colors: ['#ff6b6b', WHITE, WHITE], pattern: 'stripes', size: 0.3, cm: [2, 3], tags: ['hop:10', 'rocket'], desc: '로켓 흉내 대장. 3, 2, 1 — 10m 높이 발사!' },
  { gdd: 'b_meteor_beetle', old: 'silver-chafer', name: '돌덩이벌레운석딱정벌레', island: 'launch', zones: ['crater'], time: 'all', rarity: 3, behavior: 'perch', kind: 'beetle', body: 'BEETLE', spot: 'rock',
    colors: ['#b8b8c4', '#8aa0b8', '#ffcf4a'], pattern: 'meteor', size: 0.32, cm: [2, 3], look: { shell: 'lumpy' }, desc: '하늘에서 같이 떨어졌다. 울퉁불퉁 등에 금가루가 반짝.' },
  { gdd: 'b_satellite_ladybug', name: '궤도점위성무당벌레', island: 'launch', zones: ['telescope'], time: 'night', rarity: 3, behavior: 'perch', kind: 'ladybug', body: 'BEETLE', spot: 'rock',
    colors: ['#3b5bb5', '#ffd84a', WHITE], pattern: 'spots', size: 0.24, cm: [0.8, 1], parts: ['ring'], desc: '등 위에 작은 태양계. 노란 점이 빙글빙글 공전해요.' },
  { gdd: 'b_stardust_moth', name: '별가루나방', island: 'launch', zones: ['crater'], time: 'night', weather: only('meteor'), rarity: 3, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'air',
    colors: ['#dfe6ee', '#3b5bb5', '#fff27a'], pattern: 'galaxy', size: 0.38, cm: [5, 7], look: { glow: true }, extra: { drop: { id: 'm_stardust', n: 3 } }, tags: ['stardust'],
    desc: '잡으면 별가루 3개. 유성우 밤 크레이터 위를 반짝반짝 날아요.' },
  { gdd: 'b_galaxy_butterfly', name: '은하나비', island: 'launch', zones: ['wreckshore'], time: 'night', weather: boost(3, 'meteor'), rarity: 4, behavior: 'fly', kind: 'butterfly', body: 'BUTTERFLY', spot: 'air',
    colors: ['#3b5bb5', '#a77be0', '#fff27a'], pattern: 'galaxy', size: 0.46, cm: [9, 12], extra: { shy: 1.2 }, desc: '우주에서 길을 잃고 온 나비. 날개 속에 은하가 하나.' },
  { gdd: 'b_comet_dragonfly', name: '혜성잠자리', island: 'launch', zones: ['tower'], time: 'night', weather: only('meteor'), rarity: 5, behavior: 'hover', kind: 'dragonfly', body: 'DRAGONFLY', spot: 'air',
    colors: [WHITE, '#ffcf4a', '#fff4b0'], pattern: 'plain', size: 0.5, cm: [8, 10], parts: ['wings-clear', 'light-tail'], look: { glow: true }, extra: { shy: 1.4, top: 'launch-tower' },
    desc: '발사탑에 앉아 별을 기다린다. 금빛 꼬리가 혜성처럼 길게.' },
];

/** GDD 표 id 71개(표 순서) */
export const GDD_BUG_IDS: readonly string[] = GDD.map((r) => r.gdd);

function timesOf(t: BugTime | BugTime[]): BugTime[] { return Array.isArray(t) ? t : [t]; }
function todsOf(ts: BugTime[]): BugTod[] {
  if (ts.includes('all')) return [...ALL];
  const out = new Set<BugTod>();
  for (const t of ts) if (t !== 'all') out.add(t === 'noon' ? 'day' : t === 'midnight' ? 'night' : t);
  return ALL.filter((t) => out.has(t));
}
function habitatOf(r: GddRow): string {
  const zones = r.zones.map((z) => zoneName(z, r.island)).join('·');
  let w = '';
  if (r.weather?.only) w = ` · ${r.weather.only.map((x) => WEATHER_KO[x] ?? x).join('·')}에만`;
  else if (r.weather?.boost) w = ` · ${r.weather.boost.map((x) => WEATHER_KO[x] ?? x).join('·')}엔 ×${r.weather.x ?? 3}`;
  if (r.extra?.moon) w += ' (보름달)';
  if (r.extra?.visit) w += ` · 친구 방문 ×${r.extra.visit}`;
  return `${islandName(r.island)} · ${zones} · ${timesOf(r.time).map(todName).join('·')}${w}`;
}

function fromGdd(r: GddRow): BugSpecies {
  const time = timesOf(r.time);
  const timeVal: string | string[] = time.length === 1 ? time[0] : time;
  const where: SpeciesWhere[] = r.zones.map((zone) => ({
    island: r.island, zone, time: timeVal, ...(r.weather ? { weather: { ...r.weather } } : {}),
  }));
  // 보물 섬(구역 무관): 말랑섬의 흔한 친구 몇몇만
  if (r.islet) where.push({ island: 'islet', time: timeVal, ...(r.weather ? { weather: { ...r.weather } } : {}) });
  const tags = new Set<string>([...(r.tags ?? []), `ai:${r.behavior}`, `island:${r.island}`]);
  if (r.extra?.hide) tags.add(`hide:${r.extra.hide}`);
  if (r.weather?.only) for (const w of r.weather.only) tags.add(`only:${w}`);
  const avg = Math.round(((r.cm[0] + r.cm[1]) / 2) * 10) / 10;
  return {
    id: r.old ? 'bug-' + r.old : r.gdd,
    gdd: r.gdd,
    name: r.name,
    category: 'bug',
    rarity: r.rarity,
    price: bugPrice(r.rarity, r.island),
    desc: r.desc,
    habitat: habitatOf(r),
    kind: r.kind,
    spot: r.spot,
    islands: r.islet ? [r.island, 'islet'] : [r.island],
    tods: todsOf(time),
    colors: r.colors,
    size: r.size,
    pattern: r.pattern ?? 'plain',
    cm: r.cm,
    len: avg,
    behavior: r.behavior,
    look: { body: r.body, ...(r.parts ? { parts: r.parts } : {}), ...(r.look ?? {}) },
    where,
    tags: [...tags],
    ...(r.extra ?? {}),
  };
}

export const INSECTS: BugSpecies[] = GDD.map(fromGdd);

// ───────── 옛 종(GDD 표에 짝이 없는 것) ─────────
// 예전 저장에 남아 있을 수 있어 id 풀이용으로만 둔다. 도감 칸(INSECTS)에는 없고, 스폰도 안 한다(p1 + where 없음).
type LegacyRow = [id: string, name: string, kind: BugKind, spot: BugSpot, rarity: number, colors: [string, string, string], size: number, pattern: BugPattern, cm: [number, number], desc: string];
// prettier-ignore
const LEGACY: LegacyRow[] = [
  ['ladybug', '무당벌레', 'ladybug', 'flower', 1, ['#ff6b6b', INK, WHITE], 0.2, 'spots', [0.6, 0.9], '빨간 등에 까만 점. 손에 올리면 행운이 와요.'],
  ['giant-stag', '왕사슴벌레', 'stag', 'tree', 4, [INK, '#2f2c3c', '#6a5a7a'], 0.5, 'plain', [6, 8], '한 번 물면 놓지 않는 고집쟁이. 그래도 사실 순해요.'],
  ['rainbow-dragonfly', '무지개잠자리', 'dragonfly', 'air', 4, ['#ff8fd0', '#7fe0ff', '#fff27a'], 0.46, 'rainbow', [6, 8], '산호 바다 위에서만 보이는 일곱 빛깔 꼬리.'],
  ['jungle-dragonfly', '정글청록잠자리', 'dragonfly', 'air', 2, ['#2fc9a8', '#1a6f6a', '#d8fff4'], 0.5, 'stripes', [7, 9], '정글 물웅덩이 위를 빙글빙글 도는 청록 화살.'],
  ['blue-carpenter', '파랑뒤영벌', 'bee', 'flower', 3, ['#3b5bb5', '#7fd0ff', WHITE], 0.3, 'stripes', [2, 3], '파란 줄무늬 털옷이 세련된 바닷가 멋쟁이.'],
  ['yellow-ladybug', '노랑무당벌레', 'ladybug', 'flower', 2, ['#ffd84a', '#6e4a33', WHITE], 0.2, 'plain', [0.4, 0.6], '버섯 곰팡이를 냠냠 청소해 주는 노란 청소부.'],
  ['ice-firefly', '얼음반딧불이', 'firefly', 'air', 4, ['#3b4a6a', '#bfe8ff', '#c8fbff'], 0.24, 'glow', [1, 1.5], '차가운 하늘빛 등불. 만지면 살짝 시원해요.'],
  ['evening-cicada', '쓰르라미', 'cicada', 'tree', 2, ['#6a8a5a', '#3a4a2e', '#ffd8a0'], 0.3, 'plain', [3, 4], '해 질 녘에만 쓰르람 쓰르람 노래해요.'],
  ['rice-grasshopper', '방아깨비', 'grasshopper', 'ground', 1, ['#b8e070', '#7aa84a', '#ffe0a0'], 0.36, 'stripes', [5, 8], '뒷다리를 잡으면 방아를 찧듯 끄덕끄덕.'],
  ['katydid', '여치', 'grasshopper', 'flower', 2, ['#5ad07a', '#2a8a4a', '#d8ffe0'], 0.32, 'plain', [3, 5], '이파리 옷을 입은 저녁 바이올린 연주자.'],
  ['mantis', '사마귀', 'mantis', 'flower', 2, ['#7ad06a', '#4a9a4a', '#e8ffd0'], 0.4, 'plain', [7, 9], '두 손을 모으고 기도하는 척… 사실 간식을 기다리는 중.'],
  ['honeypot-ant', '꿀단지개미', 'ant', 'ground', 3, ['#c87a3a', '#6a3a22', '#ffcf4a'], 0.27, 'glow', [1, 1.5], '배에 꿀을 가득 저장한 걸어 다니는 꿀단지.'],
  ['orb-spider', '무당거미', 'spider', 'tree', 2, ['#ffd23a', '#4a4a5a', '#ff7a5a'], 0.3, 'stripes', [2, 3], '줄무늬 레깅스를 신은 거미줄 건축가.'],
  ['peacock-spider', '공작거미', 'spider', 'rock', 4, ['#3a6aff', '#ff5a3a', '#5ad0a0'], 0.22, 'rainbow', [0.4, 0.6], '알록달록 꼬리를 펼치며 춤추는 작은 댄서.'],
  ['sea-strider', '바다소금쟁이', 'strider', 'water', 3, ['#3a7aaa', '#1e4a6a', '#bff0ff'], 0.3, 'iri', [0.5, 1], '넓은 바다 위를 달리는 세상에서 제일 작은 서퍼.'],
  ['crystal-bug', '수정결정벌레', 'snowbug', 'rock', 4, ['#c8b8ff', '#7a8aff', '#f0f8ff'], 0.32, 'glow', [1.5, 2.5], '밤이 되면 등의 결정이 별빛처럼 빛나요.'],
  ['glow-spore-bug', '반짝포자벌레', 'sporebug', 'rock', 4, ['#f0e8ff', '#7a8aff', '#8ff0ff'], 0.3, 'glow', [1, 2], '밤이면 모자의 점들이 반짝반짝 빛나요.'],
  ['golden-spore-bug', '황금포자벌레', 'sporebug', 'tree', 5, ['#fff4d8', '#ffc83a', '#fff8c0'], 0.32, 'spots', [2, 3], '황금 버섯 모자를 쓴 버섯 숲의 왕자님.'],
  ['desert-scorpion', '사막전갈', 'scorpion', 'rock', 2, ['#e8b86a', '#a8783a', '#fff0c8'], 0.36, 'plain', [6, 9], '집게를 번쩍! 무섭게 보이고 싶은 수줍은 모래 친구.'],
  ['caterpillar', '애벌레', 'caterpillar', 'flower', 1, ['#9ae06a', '#5ab04a', '#ffe46a'], 0.3, 'spots', [2, 4], '잎을 냠냠. 언젠가 멋진 나비가 될 거예요.'],
  ['swallowtail-larva', '호랑애벌레', 'caterpillar', 'tree', 2, ['#7ad07a', '#3d3a4a', '#ffd04a'], 0.32, 'stripes', [3, 5], '머리에 가짜 눈을 그려 넣은 꾀돌이 애벌레.'],
  ['atlas-moth', '왕나방', 'moth', 'tree', 4, ['#d8774a', '#8a3e2a', '#fff0c8'], 0.6, 'eyes', [20, 26], '날개를 펴면 손바닥 두 개만 해요. 공룡도 놀란대요.'],
  ['aurora-dragonfly', '오로라잠자리', 'dragonfly', 'air', 4, ['#7ff0d0', '#8a7bff', '#e6fff8'], 0.46, 'iri', [6, 8], '얼음 하늘의 오로라가 잠자리 모양으로 내려왔대요.'],
];
const BODY_OF: Partial<Record<BugKind, BugBody>> = {
  butterfly: 'BUTTERFLY', moth: 'BUTTERFLY', dragonfly: 'DRAGONFLY', damselfly: 'DRAGONFLY', bee: 'BEE', grasshopper: 'HOPPER',
  mantis: 'MANTIS', ant: 'ANT', spider: 'SPIDER', strider: 'SPIDER', scorpion: 'SPIDER', snail: 'SNAIL', stick: 'STICK', puff: 'PUFF', crust: 'CRUST',
};
export const LEGACY_INSECTS: BugSpecies[] = LEGACY.map(([id, name, kind, spot, rarity, colors, size, pattern, cm, desc]) => ({
  id: 'bug-' + id, name, category: 'bug', rarity, price: bugPrice(rarity, 'home'), desc, habitat: '지금은 볼 수 없는 옛 친구',
  kind, spot, islands: [], tods: [], colors, size, pattern, cm, len: (cm[0] + cm[1]) / 2,
  behavior: 'fly', look: { body: BODY_OF[kind] ?? 'BEETLE' }, where: [], tags: ['legacy'], p1: true,
}));

/** 도감 칸 id → 종(옛 종 포함) */
export const INSECT_BY_ID = new Map<string, BugSpecies>([...INSECTS, ...LEGACY_INSECTS].map((s) => [s.id, s]));
/** GDD id(b_*) → 종 */
export const INSECT_BY_GDD = new Map<string, BugSpecies>(INSECTS.map((s) => [s.gdd!, s]));
/** GDD id 또는 실제 id 로 찾기 */
export const insectOf = (id: string): BugSpecies | undefined => INSECT_BY_ID.get(id) ?? INSECT_BY_GDD.get(id);

// ───────── 출현 후보(순수) ─────────
export interface PoolQuery {
  /** 섬 id(islet-a 같은 것도 됨) 또는 테마 */
  island?: string | null;
  /** game.geo.zoneAt 의 zone 코드. 없으면 구역을 안 본다 */
  zone?: string | null;
  /** 서식 자리(꽃·나무·바위…). 없으면 안 본다 */
  spot?: BugSpot | null;
  /** 0..24 시각. tod·noon·midnight 를 안 주면 여기서 구한다 */
  hour?: number;
  tod?: BugTod | string;
  noon?: boolean;
  midnight?: boolean;
  /** 그 자리 날씨(없으면 맑음으로 본다) */
  weather?: Weather | string;
  fullMoon?: boolean;
  /** 친구 섬 방문 중(game.ext.net?.visiting) */
  visiting?: boolean;
  /** 숨은 곤충 꺼내기: 이 계기로 나오는 종만. 안 주면 숨는 종은 빼고 */
  reveal?: BugHide | null;
}

/** 아무 구역이나 되는 표기(눈 오는 하늘 = 섬 어디서든) */
const ANY_ZONE = new Set(['sky']);

function todFromHour(h: number): BugTod {
  const x = ((h % 24) + 24) % 24;
  return x >= 5 && x < 9 ? 'morning' : x >= 9 && x < 17 ? 'day' : x >= 17 && x < 21 ? 'sunset' : 'night';
}

/** 시간 코드 하나가 지금 맞나 */
export function timeOpen(t: string, q: { tod: string; noon: boolean; midnight: boolean }): boolean {
  if (t === 'all' || t === 'any' || t === '종일') return true;
  if (t === 'noon') return q.noon;
  if (t === 'midnight') return q.midnight;
  return t === q.tod;
}

/**
 * 지금 이 자리에서 나올 수 있는 곤충 후보(GDD 5.2 1단계) — 순수 함수, 같은 입력이면 같은 결과.
 * 돌려주는 건 종의 얕은 복사본이고, where 는 지금 맞는 줄만 남긴다(economy.rollCatch 가 place 없이도 바로 쓰게).
 * 그 줄의 weather.boost 는 지금 켜진 것만 남긴다: 달나방은 보름달일 때만, 하트무당벌레는 친구 방문 중이면 지금 날씨에 ×2.
 * 원래 종이 필요하면 INSECT_BY_ID.get(p.id).
 */
export function poolFor(q: PoolQuery = {}): BugSpecies[] {
  const island = themeOf(q.island ?? null);
  const hour = q.hour ?? 12;
  const tod = (q.tod as string | undefined) ?? todFromHour(hour);
  const h = ((hour % 24) + 24) % 24;
  const noon = q.noon ?? (q.hour != null ? h >= 11 && h < 13 : false);
  const midnight = q.midnight ?? (q.hour != null ? h >= 0 && h < 2 : false);
  const weather = (q.weather ?? 'clear') as string;
  const tq = { tod, noon, midnight };
  const out: BugSpecies[] = [];
  for (const sp of INSECTS) {
    if (sp.p1) continue;
    // 숨는 종은 흔들기·두드리기 때만, 꺼낼 땐 그 계기 종만
    if (q.reveal ? sp.hide !== q.reveal : !!sp.hide) continue;
    if (q.spot && sp.spot !== q.spot) continue;
    const rows: SpeciesWhere[] = [];
    for (const w of sp.where) {
      if (island && w.island && w.island !== 'any' && w.island !== island) continue;
      if (q.zone && w.zone && !ANY_ZONE.has(w.zone) && w.zone !== q.zone) continue;
      if (w.time != null) {
        const ts = Array.isArray(w.time) ? w.time : [w.time];
        if (ts.length && !ts.some((t) => timeOpen(t, tq))) continue;
      }
      const only = w.weather?.only;
      if (only && only.length && !(only as string[]).includes(weather)) continue;
      rows.push(liveRow(sp, w, q, weather));
    }
    if (rows.length) out.push({ ...sp, where: rows });
  }
  return out;
}

/** 지금 켜진 배율만 남긴 where 줄 */
function liveRow(sp: BugSpecies, w: SpeciesWhere, q: PoolQuery, weather: string): SpeciesWhere {
  const row: SpeciesWhere = { ...w };
  let wt = w.weather ? { ...w.weather } : undefined;
  // 보름달 조건이 붙은 배율은 보름달이 아니면 끈다
  if (wt?.boost && sp.moon === 'full' && !q.fullMoon) { delete wt.boost; delete wt.x; }
  // 친구 방문 배율: 지금 날씨에 ×visit (economy 는 weather.boost 로만 배율을 읽는다)
  if (sp.visit && q.visiting) wt = { ...(wt ?? {}), boost: [weather as Weather], x: Math.max(sp.visit, wt?.x ?? 0) };
  if (wt && (wt.only?.length || wt.boost?.length)) row.weather = wt;
  else delete row.weather;
  return row;
}

/** 지금 이 종이 이 자리에서 나올 수 있나(poolFor 한 종짜리) */
export function canAppear(sp: BugSpecies, q: PoolQuery = {}): boolean {
  return poolFor({ ...q, reveal: q.reveal ?? sp.hide ?? null }).some((p) => p.id === sp.id);
}

/** 이 종의 지금 배율(1 = 보통) — 스포너 미리보기·디버그용. economy 의 boost 규칙과 같다 */
export function boostOf(sp: BugSpecies, weather: string): number {
  let b = 1;
  for (const w of sp.where) if (w.weather?.boost && (w.weather.boost as string[]).includes(weather)) b = Math.max(b, w.weather.x ?? 3);
  return b;
}
