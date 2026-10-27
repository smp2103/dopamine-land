// calendar 데이터 — 요일 이벤트 표(GDD 4.13) · 부표 우체통 6(2.4) · 주민 편지 문장 · 첨부 선물 · 하루 루틴 10(4.13) · 날씨 이름표.
// 부수효과 없는 순수 표. 다른 담당이 읽어도 된다(읽기만).
import type { Weather } from '../../core/api';
import { WEEKDAY_EVENTS, type WeekdayEventId } from '../../core/events';

export { WEEKDAY_EVENTS, type WeekdayEventId };

/** 요일 글자(0 월 … 6 일) */
export const WEEKDAY_KO = ['월', '화', '수', '목', '금', '토', '일'] as const;

export interface WeekdayInfo {
  id: WeekdayEventId;
  /** 0 월 … 6 일 */
  wd: number;
  name: string;
  icon: string;
  color: string;
  /** 배너 아랫줄 */
  sub: string;
  /** 우편 공지·소식 창 설명 */
  desc: string;
  /** 어디서 */
  where: string;
}

/** 요일 이벤트 7(계약 v2 4장 id 고정) */
export const WEEKDAY_INFO: Readonly<Record<WeekdayEventId, WeekdayInfo>> = {
  petalrain: {
    id: 'petalrain', wd: 0, name: '꽃잎비', icon: '🌸', color: '#ffb3c6', where: '말랑섬 꽃잎 언덕',
    sub: '말랑섬 꽃잎 언덕에 꽃잎이 흩날려요! 꽃잎 생물 ×2',
    desc: '하루 종일 말랑섬 꽃잎 언덕에 꽃잎이 내려요. 반짝이는 꽃잎 소용돌이를 지나가면 꽃잎을 주울 수 있고, 꽃잎 생물이 두 배로 나와요!',
  },
  migration: {
    id: 'migration', wd: 1, name: '공룡 대이동', icon: '🦕', color: '#a8dc8c', where: '쿵쿵공룡섬 초원',
    sub: '쿵쿵공룡섬 초원을 공룡들이 줄지어 건너가요!',
    desc: '공룡 친구들이 줄을 지어 초원을 건너가는 날이에요. 쿵쿵공룡섬에 가서 같이 걸어 봐요!',
  },
  sandtemple: {
    id: 'sandtemple', wd: 2, name: '모래폭풍 뒤 신전', icon: '🏜️', color: '#ffd29a', where: '모래시계섬',
    sub: '모래시계섬에 모래폭풍이 불어요(6시간)! 걷히면 신전이…',
    desc: '아침부터 모래시계섬에 모래폭풍이 6시간 동안 불어요. 폭풍이 지나간 모래 언덕 너머에 옛 신전이 모습을 드러낸대요.',
  },
  firefly: {
    id: 'firefly', wd: 3, name: '반딧불 대축제', icon: '✨', color: '#d9f59a', where: '반딧불버섯섬',
    sub: '밤이 되면 반딧불버섯섬이 반딧불로 가득해요!',
    desc: '오늘 밤은 반딧불 대축제! 해가 지면 반딧불버섯섬 늪과 숲이 반짝반짝 빛으로 가득 차요.',
  },
  whaleroad: {
    id: 'whaleroad', wd: 4, name: '고래 길', icon: '🐋', color: '#9fd4ff', where: '말랑섬 ↔ 모래시계섬 바닷길',
    sub: '말랑섬과 모래시계섬 사이 바닷길에 혹등고래가 나타나요!',
    desc: '혹등고래들이 말랑섬과 모래시계섬 사이 바닷길을 지나가요. 물 뿜는 분수에 맞으면 무지개와 코인 비가 내린대요!',
  },
  pirate: {
    id: 'pirate', wd: 5, name: '해적선 보물', icon: '🏴‍☠️', color: '#c6b4ff', where: '유령선 으스스호',
    sub: '유령선 으스스호 근처에 은상자가 더 놓였어요!',
    desc: '해적들이 숨겨 둔 보물이 떠올랐어요. 반딧불버섯섬 남서쪽 유령선 으스스호 근처에 은상자가 더 놓여요.',
  },
  meteor: {
    id: 'meteor', wd: 6, name: '유성우의 밤', icon: '🌠', color: '#d8c8ff', where: '별똥별섬',
    sub: '오늘 밤 21시부터 유성우 확정! 별똥별섬 별가루 ×2',
    desc: '일요일 밤(21시~새벽 5시)엔 유성우가 꼭 내려요. 별똥별섬에서 소원을 빌고 별가루를 두 배로 주워요!',
  },
};

/** 요일 이벤트 출현 배율(econ RollEnv.boostTags) — 그날 하루만 */
export const EVENT_BOOSTS: Readonly<Partial<Record<WeekdayEventId, Record<string, number>>>> = {
  petalrain: { petal: 2 },
};

/** 수요일 모래폭풍: 모래시계섬 6시간 */
export const SANDSTORM = { region: 'desert', w: 'sandstorm' as Weather, hours: 6, /** 이 시각 넘어서 처음 보면 남은 시간만 */ from: 5 } as const;
/** 일요일 유성우: 밤 블록 21시 ~ 다음 날 05시, 모든 지역 */
export const METEOR_NIGHT = { region: '*', w: 'meteor' as Weather, from: 21, to: 29 } as const;

// ───────────── 부표 우체통 6(GDD 2.4) ─────────────
export interface BuoyInfo { id: string; n: number; x: number; z: number; links: [string, string]; name: string }
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
/** 부표마다 잇는 두 섬 — 이 섬으로 가는 편지를 넣을 수 있다 */
export const BUOY_LINKS: Readonly<Record<string, [string, string]>> = {
  'buoy-1': ['home', 'dino'],
  'buoy-2': ['home', 'coral'],
  'buoy-3': ['home', 'mushroom'],
  'buoy-4': ['home', 'ice'],
  'buoy-5': ['dino', 'desert'],
  'buoy-6': ['home', 'launch'],
};
export const buoyName = (n: number) => `부표 우체통 ${CIRCLED[n - 1] ?? n}`;
/** 부표에 탄 채로(배 위) 우체통을 쓸 수 있는 거리(m) */
export const BUOY_REACH = 8;
/** 집 앞 우체통 거리(m) */
export const MAILBOX_REACH = 2.4;

/** 부표 우체통 선물 표(하루 부표마다 한 번) — 바다 우체부 갈매기 '끼룩' */
export const BUOY_GIFTS: ReadonlyArray<{ id: string; n: [number, number]; w: number }> = [
  { id: 'm_shell', n: [2, 4], w: 26 },
  { id: 'm_seaweed', n: [2, 4], w: 22 },
  { id: 'bait_worm', n: [2, 3], w: 16 },
  { id: 'm_coral', n: [1, 1], w: 12 },
  { id: 'bait_dough', n: [1, 2], w: 10 },
  { id: 't_bottle', n: [1, 1], w: 8 },
  { id: 'it_capsule', n: [1, 1], w: 4 },
  { id: 'm_pearl', n: [1, 1], w: 2 },
];
export const BUOY_LINES: readonly string[] = [
  '끼룩! 바닷바람에 실려 온 선물이야. 항해 조심해, 끼룩!',
  '끼룩끼룩~ 오늘 바다는 반짝반짝! 우체통 청소하다 찾은 거 줄게!',
  '끼룩! 파도가 우체통 문을 똑똑 두드리고 갔어. 안에 뭐가 있나 봐!',
  '끼룩? 너 또 왔구나! 바다 친구한테는 늘 선물이 있지, 끼룩!',
  '끼룩! 멀리 섬에서 날아온 소포야. 받는 사람: 바다를 좋아하는 친구!',
  '끼룩끼룩! 오늘 고래가 지나가면서 놓고 간 거래. 진짜야, 끼룩!',
];
/** 처음 들른 부표: 비눗방울 정류장 등록 + 첫 인사 */
export const BUOY_FIRST = '끼룩! 처음 보는 얼굴이네? 여긴 바다 우체국이야. 편지도 받고, 비눗방울 정류장도 열어 줄게!';

// ───────────── 아침 우편: 주민 편지 ─────────────
/** 우정 단계(하트 0~1 · 2~3 · 4~5)별 편지 문장 — {isl} 은 그 주민의 섬 */
export const LETTERS: Readonly<Record<'new' | 'friend' | 'best', readonly string[]>> = {
  new: [
    '안녕! 요즘 섬에서 너 자주 봤어. 다음에 만나면 인사해 줄래? 나도 반갑게 인사할게!',
    '처음 편지 써 봐서 떨려… {isl}에 놀러 오면 내가 좋아하는 산책길 알려 줄게!',
    '오늘 아침 하늘이 정말 맑더라. 너도 봤어? 날씨 좋은 날엔 낚시가 잘된대!',
    '{isl}에 이상한 그림자가 돌아다녀. 혹시 네가 잡아 줄 수 있을까? 헤헤.',
    '우리 아직 많이 못 친해졌지? 그래도 편지는 보내고 싶었어. 좋은 하루 보내!',
  ],
  friend: [
    '어제 너랑 얘기해서 즐거웠어! 덕분에 하루 종일 콧노래가 나왔지 뭐야~',
    '{isl}에 꽃이 잔뜩 폈어. 너한테 제일 먼저 알려 주고 싶었어! 작은 선물도 넣었어.',
    '요즘 뭐 잡았어? 나는 어제 엄청 큰 그림자를 놓쳤어… 다음엔 같이 가자!',
    '너 가방 터지겠더라! 정리할 때 쓰라고 작은 걸 하나 넣었어. 헤헤.',
    '바람이 솔솔 부는 날엔 네 생각이 나. 우리 섬에도 자주 놀러 와!',
  ],
  best: [
    '세상에서 제일 다정한 친구에게! 오늘도 네 덕분에 {isl}이 반짝반짝해. 고마워!',
    '있잖아, 너랑 친구가 돼서 정말 좋아. 아끼는 걸 하나 보낼게. 소중히 해 줘!',
    '어젯밤 별똥별한테 소원 빌었어. "우리 계속 친구 하게 해 주세요!" …비밀이야!',
    '네가 오면 {isl}이 축제 같아! 오늘도 맛있는 거 챙겨 먹어. 선물 동봉!',
    '단짝에게 💖 새로 만든 것 중에 제일 예쁜 걸 넣었어. 받으면 꼭 자랑해 줘!',
  ],
};
/** 생일 초대 */
export const BIRTHDAY_LETTER = '오늘은 내 생일이야! 🎂 {isl}에서 작은 파티를 열 거야. 선물 들고 놀러 와 주면 정말 기쁠 것 같아!';
/** 첫 우편(새 저장 첫 아침) — 곰 몽실 */
export const WELCOME = {
  from: '곰 몽실', icon: '🐻', npc: 'npc_mongsil',
  text: '말랑섬에 온 걸 환영해! 이 우편함엔 매일 아침 편지랑 오늘의 소식이 와. 편지에 선물이 들어 있으면 꼭 받아 가! 게시판 부탁도 잊지 말고~',
  attach: [{ id: 'm_wood', n: 5 }, { id: 'bait_dough', n: 2 }],
};

/** 섬 특산 첨부(우정 2단계부터) */
export const SPECIALTY_GIFTS: Readonly<Record<string, readonly string[]>> = {
  home: ['m_honey', 'm_petal', 'm_apple', 'm_peach'],
  dino: ['m_feather', 'm_ginkgo', 'm_fern'],
  ice: ['m_icecrystal', 'm_frostberry'],
  mushroom: ['m_glowcap', 'm_spore'],
  coral: ['m_coral', 'm_coconut', 'm_banana', 'm_shell'],
  desert: ['m_cactusflower', 'm_date', 'm_sandglass'],
  launch: ['m_starapple', 'm_meteor'],
};
/** 새 친구가 가끔 넣는 소소한 것 */
export const SMALL_GIFTS: readonly string[] = ['m_wood', 'm_shell', 'm_petal', 'm_stone', 'm_vine', 'bait_worm'];
/** 단짝이 가끔 넣는 특별한 것 */
export const BEST_GIFTS: readonly string[] = ['it_capsule', 'bait_lure', 'm_gold', 'bait_golden'];

/** 하루 주민 편지 최대 수(생일 초대 빼고) */
export const LETTERS_PER_DAY = 2;
/** 우편함에 남겨 둘 편지 수 */
export const MAILBOX_KEEP = 40;
/** 아침 우편이 오는 시각(05시) */
export const MAIL_HOUR = 5;

// ───────────── 하루 루틴(GDD 4.13) ─────────────
export interface RoutineDef {
  id: string;
  icon: string;
  text: string;
  /** 카운터 키와 목표(여러 개면 각각 min(have, goal) 을 더한다) */
  parts: Array<{ key: string; goal: number }>;
}
/** 카운터 키 */
export const RC = {
  mail: 'mail', board: 'board', rock: 'rock', shake: 'shake', dig: 'dig', firstFish: 'first:fish', firstBug: 'first:bug',
  sell: 'sell', donate: 'donate', craft: 'craft', sail: 'sail', night: 'night',
} as const;
export const ROUTINE: readonly RoutineDef[] = [
  { id: 'mail', icon: '📬', text: '우편함 열기 (편지·선물·오늘의 소식)', parts: [{ key: RC.mail, goal: 1 }] },
  { id: 'board', icon: '📌', text: '게시판 부탁 받기', parts: [{ key: RC.board, goal: 1 }] },
  { id: 'rock', icon: '🪨', text: '돌 5번 두드리기 (연타 콤보!)', parts: [{ key: RC.rock, goal: 5 }] },
  { id: 'shake', icon: '🌳', text: '나무 흔들기 + 화석 X 4개 파기', parts: [{ key: RC.shake, goal: 1 }, { key: RC.dig, goal: 4 }] },
  { id: 'first', icon: '🎣', text: '오늘 첫 낚시·첫 곤충 (★3 이상 확정)', parts: [{ key: RC.firstFish, goal: 1 }, { key: RC.firstBug, goal: 1 }] },
  { id: 'sell', icon: '🦆', text: '꽥꽥상회에 팔기 (오늘의 인기 생물!)', parts: [{ key: RC.sell, goal: 1 }] },
  { id: 'donate', icon: '🏛️', text: '박물관에 기증하기', parts: [{ key: RC.donate, goal: 1 }] },
  { id: 'craft', icon: '🔨', text: '작업대에서 만들기', parts: [{ key: RC.craft, goal: 1 }] },
  { id: 'sail', icon: '⛵', text: '다른 섬으로 항해하기', parts: [{ key: RC.sail, goal: 1 }] },
  { id: 'night', icon: '🌙', text: '밤에 채집하기 (반딧불·심해어·별가루)', parts: [{ key: RC.night, goal: 1 }] },
];
/** 루틴 10개 다 하면 */
export const ROUTINE_BONUS_STARS = 5;

// ───────────── 날씨 이름표 ─────────────
export const WEATHER_ICON: Readonly<Record<Weather, string>> = {
  clear: '☀️', rain: '🌧️', storm: '⛈️', fog: '🌫️', meteor: '🌠', snow: '❄️', blizzard: '🌨️', rainbow: '🌈', aurora: '🌌', sandstorm: '🌪️',
};
export const WEATHER_KO: Readonly<Record<Weather, string>> = {
  clear: '맑음', rain: '비', storm: '폭풍', fog: '안개', meteor: '유성우', snow: '눈', blizzard: '눈보라', rainbow: '무지개', aurora: '오로라', sandstorm: '모래폭풍',
};
/** 예보에 싣는 섬(큰 섬 7) */
export const FORECAST_REGIONS = ['home', 'dino', 'ice', 'mushroom', 'coral', 'desert', 'launch'] as const;
/** 예보 시간(지금부터 몇 시간 뒤) */
export const FORECAST_HOURS = [4, 8, 12] as const;
/** 날씨마다 소식 한 줄 */
export const WEATHER_TIP: Readonly<Partial<Record<Weather, string>>> = {
  rain: '비 오는 날엔 물고기 그림자가 커진대요 🎣',
  storm: '폭풍엔 파도가 두 배! 배는 조심조심 ⛵',
  fog: '안개 속에선 신기한 생물이 나온대요 👀',
  meteor: '유성우! 별똥별섬에서 별가루를 주워요 ✨',
  snow: '눈 오는 날엔 솜눈섬 생물이 반짝여요 ❄️',
  rainbow: '무지개가 뜨면 무지개 생물을 찾아봐요 🌈',
  aurora: '오로라 밤엔 오로라나비가 날아요 🦋',
  sandstorm: '모래폭풍 뒤엔 모래 속 보물이 드러나요 🏜️',
};
