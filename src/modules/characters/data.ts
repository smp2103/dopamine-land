// 주민 목록과 대사 — 섬마다 테마 동물 2~3명, 섬별·시간대별 랜덤 대사 + 생일·좋아하는 선물(GDD 4.6.1).
// 시설 NPC(GDD 3.10.1 P0: 꽥사장·느릿 관장·펭박사·곰 몽실 + 조선소 카운터 펠리 선장)와 4.6.3 대사.
// P1(GDD 3.10.1 · 4.6.1 · 4.6.2): 역할 NPC(통통·보들·프로 박사·낙타 상인·너구리 고물상·꾸물이·양 자매) +
// 섬 주인 7(몽실·보들·부엉 교수·목길이 할머니·흰눈 영감·소금별·삐뽀) + 이주민 후보 16(새로 오는 9명은 MIGRANTS) +
// 섬마다 주민 자리 수(ISLAND_CAP) + 주민끼리 수다(CHATTER).
// 순수 데이터 — 다른 모듈(economy 부탁·게시판)도 ext.npc 를 거쳐 읽는다.
import type { AnimalSpec } from './animal';
import type { BubbleKind } from './tex';
import type { SpecialKind } from './special';

/** 선물 범주(dialog.giftCategory 가 가방 아이템을 이 중 하나로 나눈다) */
export type GiftCat =
  | 'fish' | 'bug' | 'sea' | 'space' | 'dino' | 'fossil'
  | 'fruit' | 'flower' | 'shell' | 'sweet' | 'shiny' | 'mushroom'
  | 'material' | 'junk' | 'furniture' | 'clothes' | 'item';

/** 우정·선물용(주민·시설 NPC 공통) */
export interface NpcSocial {
  /** 생일 = 게임 날 % 28 */
  birthday: number;
  likes: GiftCat[];
  dislikes: GiftCat[];
  /** 말소리 높이(talk-blip pitch, 1 = 보통) */
  voice: number;
}

export interface ResidentDef extends NpcSocial {
  id: string;
  name: string;
  island: string;
  /** 말버릇(동숲식) */
  catchphrase: string;
  spec: AnimalSpec;
  /** 이름표 색 */
  accent: string;
  /** 평소 감정 말풍선 */
  moods: BubbleKind[];
  /** 배치: 'village' 면 마을 좌표 그대로, 아니면 섬 부두에서 안쪽으로 */
  at?: { x: number; z: number };
  /** 부두에서 섬 안쪽으로 몇 m, 옆으로 몇 m */
  inward?: number;
  side?: number;
  lines?: string[];
  /** 동물 빌더 대신 특별 모델(spec 은 색만 쓴다) */
  model?: SpecialKind;
}

export const RESIDENTS: ResidentDef[] = [
  // ── 시작 섬(마을) ── 곰 '몽실'(npc_mongsil)은 기존 마을 주민(villager.ts) — 아래 MONGSIL
  {
    id: 'nabi', name: '나비', island: 'home', catchphrase: '냐옹', accent: '#ff9f6e',
    birthday: 2, likes: ['fish', 'sweet'], dislikes: ['junk'], voice: 1.25,
    spec: { kind: 'cat', fur: '#ffc98f', light: '#fff4e2', iris: '#4f7a3a', shirt: { a: '#ffe27a', b: '#ffffff', pattern: 'dots' }, acc: 'bow', accColor: '#ff7aa8', lashes: true },
    moods: ['heart', 'note'], at: { x: 6.5, z: -7.5 },
    lines: ['상점 앞 의자가 따끈따끈해서 졸려, {c}.', '오늘 산 리본 어때? 반짝반짝하지, {c}?', '나비를 쫓다가 진짜 나비랑 친구가 됐어, {c}!'],
  },
  {
    id: 'res_toto_home', name: '토리', island: 'home', catchphrase: '깡총', accent: '#8fd3ff',
    birthday: 6, likes: ['fruit', 'flower'], dislikes: ['bug'], voice: 1.3,
    spec: { kind: 'rabbit', fur: '#fff6f0', light: '#ffffff', earIn: '#ffb6c8', iris: '#a0526a', shirt: { a: '#a6e3ff', b: '#ffffff', pattern: 'stripe' }, acc: 'none' },
    moods: ['sparkle', 'note'], at: { x: 1.3, z: -2.7 },
    lines: ['게시판에 내 그림 붙였어! 봤어, {c}?', '당근 케이크 굽는 중이야, {c}. 냄새 나지?', '저 강에서 큰 물고기 봤어, {c}! 진짜야!'],
  },
  // ── 공룡 섬 ──
  {
    id: 'pengdal', name: '펭달', island: 'dino', catchphrase: '탐험탐험', accent: '#7cc96b',
    birthday: 9, likes: ['fossil', 'dino'], dislikes: ['flower'], voice: 1.05,
    spec: { kind: 'penguin', fur: '#3d4a6b', light: '#ffffff', iris: '#3a2a20', acc: 'safari', accColor: '#7a5a3a', blush: '#ff9aa8' },
    moods: ['sparkle', 'question'], inward: 42, side: -6,
    lines: ['저 큰 발자국 봤어? 공룡 거라니까, {c}!', '화석 하나만 더 찾으면 표본 완성이야, {c}.', '정글 덩굴 조심해! 난 세 번 걸렸어, {c}.'],
  },
  {
    id: 'rex', name: '렉스', island: 'dino', catchphrase: '왈왈', accent: '#ffb347',
    birthday: 13, likes: ['fossil', 'material'], dislikes: ['shiny'], voice: 0.95,
    spec: { kind: 'dog', fur: '#f4d6a8', light: '#c98b55', iris: '#5a3a28', shirt: { a: '#8fd18a', b: '#e9ffd8', pattern: 'stripe' }, acc: 'safari', accColor: '#ff8f6e' },
    moods: ['note', 'bang'], inward: 48, side: 7,
    lines: ['뼈다귀인 줄 알고 팠는데 공룡 뼈였어, {c}!', '화산 쪽은 뜨거우니까 물 챙겨, {c}.', '아기 공룡이 날 엄마로 아는 것 같아, {c}...'],
  },
  // ── 얼음 섬 ──
  {
    id: 'snowy', name: '눈송이', island: 'ice', catchphrase: '뽀득', accent: '#7fb8ff',
    birthday: 22, likes: ['sweet', 'fish'], dislikes: ['junk'], voice: 0.85,
    spec: { kind: 'polar', fur: '#fbfcff', light: '#ffffff', earIn: '#ffc7d2', iris: '#3a3a4a', acc: 'scarf', accColor: '#ff6f7f', scale: 1.12 },
    moods: ['heart', 'note'], inward: 40, side: -5,
    lines: ['눈 위에 누워서 천사 모양 만들었어, {c}!', '코코아 마시러 올래? 마시멜로 세 개 넣어 줄게, {c}.', '얼음 낚시는 기다림이 반이야, {c}.'],
  },
  {
    id: 'pengpeng', name: '펭펭', island: 'ice', catchphrase: '펭', accent: '#5fb0ff',
    birthday: 24, likes: ['fish', 'shell'], dislikes: ['bug'], voice: 1.15,
    spec: { kind: 'penguin', fur: '#36456e', light: '#ffffff', iris: '#2a2030', acc: 'beanie', accColor: '#ffd36e' },
    moods: ['sparkle', 'note'], inward: 46, side: 6,
    lines: ['배로 미끄러지면 제일 빨라, {c}! 해 봐!', '오로라 보려면 밤에 와야 해, {c}.', '내 털모자 직접 떴어, {c}. 귀엽지?'],
  },
  {
    id: 'bingsu', name: '빙수', island: 'ice', catchphrase: '사각', accent: '#b6a6ff',
    birthday: 26, likes: ['sweet', 'shiny'], dislikes: ['fossil'], voice: 1.4,
    spec: { kind: 'penguin', fur: '#5a6fa8', light: '#ffffff', iris: '#2a2030', acc: 'scarf', accColor: '#8fe3c8', scale: 0.82 },
    moods: ['heart', 'question'], inward: 36, side: 1,
    lines: ['나 아직 아기 펭귄이야, {c}. 그래도 수영은 잘해!', '눈사람 코를 당근으로 할까 사탕으로 할까, {c}?'],
  },
  // ── 버섯 요정 섬 ──
  {
    id: 'dotori', name: '도토리', island: 'mushroom', catchphrase: '뀨', accent: '#ff7a8a',
    birthday: 16, likes: ['mushroom', 'fruit'], dislikes: ['junk'], voice: 1.35,
    spec: { kind: 'squirrel', fur: '#d9935a', light: '#fff1dc', earIn: '#ffb3ad', iris: '#4a2a20', acc: 'fairy', accColor: '#ff5f6d', lashes: true },
    moods: ['sparkle', 'heart'], inward: 40, side: -6,
    lines: ['버섯 밑에 반짝이는 가루가 떨어져 있었어, {c}!', '밤이 되면 버섯들이 빛나, 꼭 봐야 해, {c}.', '도토리 숨긴 곳을 또 까먹었어, {c}...'],
  },
  {
    id: 'kongi', name: '콩이', island: 'mushroom', catchphrase: '퐁퐁', accent: '#c58cff',
    birthday: 4, likes: ['flower', 'mushroom'], dislikes: ['fossil'], voice: 1.3,
    spec: { kind: 'rabbit', fur: '#e9d8ff', light: '#ffffff', earIn: '#ffb6d8', iris: '#6a3a8a', shirt: { a: '#fff1a8', b: '#ffd6f0', pattern: 'dots' }, acc: 'flower', lashes: true },
    moods: ['note', 'sparkle'], inward: 46, side: 7,
    lines: ['요정 고리 안에 들어가면 소원을 빌 수 있대, {c}!', '이 꽃 화관 너도 하나 만들어 줄까, {c}?', '보라색 버섯은 먹으면 안 돼, {c}! 웃음이 안 멈춰.'],
  },
  // ── 산호 섬 ──
  {
    id: 'jogae', name: '조개', island: 'coral', catchphrase: '찰방', accent: '#4fd1c5',
    birthday: 10, likes: ['shell', 'sea'], dislikes: ['material'], voice: 1.0,
    spec: { kind: 'otter', fur: '#a8774f', light: '#f4dcc0', earIn: '#e9b39a', iris: '#3a2a20', acc: 'lei' },
    moods: ['heart', 'note'], inward: 36, side: -5,
    lines: ['배 위에 조개 올려놓고 둥둥 떠 있는 게 최고야, {c}.', '산호 사이에 무지개 물고기가 살아, {c}!', '잠수하면 반짝이는 진주를 찾을 수도 있어, {c}.'],
  },
  {
    id: 'mulgyeol', name: '물결', island: 'coral', catchphrase: '보글', accent: '#6fb6ff',
    birthday: 12, likes: ['sea', 'fish'], dislikes: ['junk'], voice: 1.1,
    spec: { kind: 'otter', fur: '#7d5a40', light: '#f2d9bf', earIn: '#e9b39a', iris: '#2a1a14', acc: 'sunhat', accColor: '#6fd3ff', scale: 0.9 },
    moods: ['sparkle', 'note'], inward: 44, side: 6,
    lines: ['파도 소리 들으면서 낮잠 자면 꿈도 파래, {c}.', '해파리는 귀엽지만 만지면 안 돼, {c}!', '노을 질 때 바다가 딸기우유 색이 돼, {c}.'],
  },
  // ── 사막 오아시스 섬 ──
  {
    id: 'morae', name: '모래', island: 'desert', catchphrase: '사박', accent: '#ffb347',
    birthday: 18, likes: ['fruit', 'shiny'], dislikes: ['sea'], voice: 0.8,
    spec: { kind: 'camel', fur: '#e8c08a', light: '#fbe6c4', earIn: '#e8b08a', iris: '#4a3020', shirt: { a: '#ff9f6e', b: '#ffe3a8', pattern: 'stripe' }, acc: 'sunhat', accColor: '#ff6f91', scale: 1.08 },
    moods: ['sweat', 'note'], inward: 40, side: -6,
    lines: ['혹 안에는 물이 아니라 꿈이 들었어, {c}.', '오아시스 물은 하늘보다 파래, {c}!', '선인장 꽃 피는 거 봤어? 일 년에 한 번이야, {c}.'],
  },
  {
    id: 'sabaki', name: '사막이', island: 'desert', catchphrase: '쫑긋', accent: '#ff8f5e',
    birthday: 20, likes: ['bug', 'shiny'], dislikes: ['fish'], voice: 1.2,
    spec: { kind: 'fox', fur: '#ffcf8a', light: '#fffaf0', earIn: '#ffc0b0', iris: '#6a3a20', shirt: { a: '#8fe3c8', b: '#ffffff', pattern: 'plain' }, acc: 'scarf', accColor: '#c9a6ff' },
    moods: ['sparkle', 'question'], inward: 46, side: 7,
    lines: ['귀가 커서 모래 속 보물 소리도 들려, {c}!', '사막 밤하늘엔 별이 쏟아져, {c}.', '모래폭풍 오면 오아시스로 뛰어, {c}!'],
  },
  // ── 발사대 섬 ──
  {
    id: 'mungstrong', name: '멍스트롱', island: 'launch', catchphrase: '멍멍', accent: '#7f8cff',
    birthday: 27, likes: ['space', 'material'], dislikes: ['flower'], voice: 1.0,
    spec: { kind: 'dog', fur: '#ffffff', light: '#c98b55', iris: '#3a2a20', shirt: { a: '#ffffff', b: '#dfe8ff', pattern: 'plain' }, acc: 'helmet', accColor: '#ff5f6d' },
    moods: ['sparkle', 'note'], inward: 40, side: -6,
    lines: ['달에 가면 제일 먼저 뼈다귀를 꽂을 거야, {c}!', '로켓 카운트다운은 열부터! 같이 세자, {c}.', '우주에선 점프가 엄청 높아, {c}. 꼭 해 봐!'],
  },
  {
    id: 'nyangho', name: '냥이호', island: 'launch', catchphrase: '냥', accent: '#ff9fc6',
    birthday: 0, likes: ['space', 'fish'], dislikes: ['junk'], voice: 1.25,
    spec: { kind: 'cat', fur: '#b8b8c8', light: '#ffffff', iris: '#3a7ab0', shirt: { a: '#ffffff', b: '#ffd6e8', pattern: 'plain' }, acc: 'helmet', accColor: '#ffd36e', lashes: true, scale: 0.92 },
    moods: ['heart', 'sparkle'], inward: 47, side: 6,
    lines: ['별사탕 행성이 있다는 소문 들었어, {c}?', '헬멧 안에서 하품하면 김이 서려, {c}.', '무중력에선 털이 다 뻗쳐, {c}! 사진 보여 줄까?'],
  },
];

/** 섬별 공통 대사(주민 대사와 섞인다). {c} = 말버릇 */
export const ISLAND_LINES: Record<string, string[]> = {
  home: [
    '안녕! 오늘도 반짝반짝한 하루야, {c}!',
    '상자 열어 봤어? 오늘 운이 좋을 것 같아, {c}.',
    '강가에서 낚시하면 가끔 엄청 큰 게 걸려, {c}!',
    '나무를 흔들면 뭐가 떨어질지 몰라, {c}. 두근두근!',
    '박물관에 기증하면 관장님이 엄청 좋아해, {c}.',
    '배 타고 다른 섬에 가 봤어? 섬마다 완전 달라, {c}!',
    '저기 풍선 선물 보여? 잡으면 행운이래, {c}.',
    '꽃에 물 주면 새 색깔 꽃이 필 수도 있어, {c}.',
    '오늘 바람이 좋아서 패러글라이더 타기 딱이야, {c}!',
    '도감 다 채우면 무슨 일이 생길까, {c}?',
    '네가 와서 섬이 더 북적북적해졌어, {c}!',
    '잠자리채 휘두를 땐 살금살금 다가가야 해, {c}.',
  ],
  dino: [
    '이 섬엔 진짜 공룡이 살아, {c}! 쉿!',
    '고사리 숲이 엄청 커서 길 잃기 쉬워, {c}.',
    '땅 파면 화석이 나올 때가 있어, {c}. 삽 있어?',
    '용암 근처는 따끈따끈해, {c}. 너무 가까이 가진 마.',
    '공룡 알 본 적 있어? 엄청 동글동글해, {c}!',
    '저 높은 바위 위에서 활공하면 섬이 다 보여, {c}.',
    '프테라노돈이 내 모자를 노려, {c}...',
    '탐험 일지를 쓰고 있어. 오늘은 네 이름도 적을게, {c}!',
    '쿵쿵 소리 들리면 잠깐 숨는 게 좋아, {c}.',
    '정글 열매는 새콤달콤해, {c}!',
  ],
  ice: [
    '여긴 추워도 마음은 따뜻해, {c}!',
    '얼음 위에선 살금살금 걸어야 해, {c}.',
    '눈싸움 할래? 난 엄청 잘 던져, {c}!',
    '오로라는 하늘이 춤추는 거래, {c}.',
    '얼음 동굴 안에 반짝이는 게 있었어, {c}.',
    '숨 쉬면 하얀 김이 나와, 신기하지, {c}?',
    '바다표범이랑 친구 하고 싶어, {c}.',
    '눈사람 만들기 대회 우승은 나야, {c}!',
    '이글루 안은 생각보다 아늑해, {c}.',
    '빙하에서 내려다보는 바다는 진짜 파래, {c}.',
  ],
  mushroom: [
    '여긴 버섯이 집보다 커, {c}!',
    '반딧불이가 길을 알려 줄 거야, {c}.',
    '요정 가루를 모으면 날 수 있대, {c}!',
    '버섯 우산 아래서 비 피하는 거 좋아해, {c}.',
    '밤엔 숲 전체가 빛나, 꼭 와 봐, {c}.',
    '이끼 위에 누우면 폭신폭신해, {c}.',
    '보랏빛 안개 속에 비밀 길이 있어, {c}.',
    '나무 구멍에 편지 넣으면 요정이 답장해 줘, {c}.',
    '오늘은 버섯 수프 끓이는 날이야, {c}!',
    '쉿, 버섯들이 낮잠 자는 중이야, {c}.',
  ],
  coral: [
    '바닷물이 유리처럼 맑지, {c}?',
    '산호초에서 잠수하면 다른 세상이야, {c}!',
    '소라 껍데기를 귀에 대면 바다 노래가 들려, {c}.',
    '거북이가 지나가면 손 흔들어 줘, {c}.',
    '야자수 그늘이 이 섬 최고 명당이야, {c}.',
    '물속에서 숨 오래 참기 내기할래, {c}?',
    '모래사장에 별 모양 조개가 있어, {c}!',
    '파도 타는 거 배우고 싶어, {c}.',
    '바닷속 보물 상자 얘기 들었어, {c}?',
    '해 질 녘 바다는 반짝반짝 금빛이야, {c}.',
  ],
  desert: [
    '모래가 따끈따끈해서 발이 간질간질해, {c}.',
    '오아시스 옆이 제일 시원해, {c}!',
    '선인장은 안아 주면 안 돼, {c}!',
    '모래 언덕 위에서 미끄럼 타 봤어, {c}?',
    '피라미드 안에 보물이 잠들어 있대, {c}.',
    '사막 여우 귀는 에어컨이래, {c}.',
    '물 많이 마셔! 여긴 덥다구, {c}.',
    '신기루 봤어? 아이스크림 가게였는데 사라졌어, {c}...',
    '별똥별은 사막에서 제일 잘 보여, {c}.',
    '모래 속에 반짝이는 게 있으면 파 봐, {c}!',
  ],
  launch: [
    '저 로켓 타면 우주까지 간대, {c}!',
    '발사 소리가 엄청 커, 귀 막아, {c}!',
    '우주 정거장엔 별 모양 간식이 있대, {c}.',
    '연료는 반짝이 사탕으로 만든다는 소문이 있어, {c}.',
    '헬멧 쓰면 세상이 둥글게 보여, {c}.',
    '오늘 하늘 맑아서 발사하기 딱 좋아, {c}!',
    '달에서 보면 우리 섬이 콩알만 하대, {c}.',
    '우주복 입고 점프 연습 중이야, {c}!',
    '카운트다운 들리면 같이 외쳐 줘, {c}!',
    '별을 하나 따다 줄게, {c}. 약속!',
  ],
};

/** 시간대별 대사 */
export const TOD_LINES: Record<string, string[]> = {
  morning: ['좋은 아침! 이슬이 반짝반짝해, {c}.', '아침 공기 상쾌하다, {c}! 기지개 쭉~', '일찍 일어난 새가 벌레를 잡는대, {c}. 너도 뭐 잡으러 가?'],
  day: ['햇살 좋다! 산책하기 딱이야, {c}.', '점심 먹었어? 난 샌드위치, {c}!', '낮잠 자기 좋은 날씨야, {c}...'],
  sunset: ['노을이 솜사탕 색이야, {c}!', '하루가 벌써 끝나 가네, {c}. 오늘 재밌었어?', '해 질 때 나오는 물고기도 있어, {c}!'],
  night: ['밤하늘 별 진짜 많다, {c}...', '하암~ 졸려, {c}. 너도 일찍 자.', '밤에만 나오는 벌레를 찾고 있어, {c}. 쉿!'],
};

// ───────────── 시설 NPC(GDD 3.10.1 · 4.6.3) ─────────────
/** 시설 NPC 가 서는 자리(characters.ts 가 PLACES·village 위치로 좌표를 낸다) */
export type NpcSpot = 'shop' | 'museum' | 'pengLab' | 'pier' | 'shipyard' | 'plaza'
  // P1 역할 NPC
  | 'workbench' | 'diving' | 'fossilLab' | 'bazaar' | 'junkBeach' | 'sheepShop' | 'station'
  // P1 섬 주인
  | 'fireflyGarden' | 'giantForest' | 'iceHut' | 'oasis' | 'controlTower';

/** 대화가 끝나면 여는 창(이벤트) — open-craft: 작업대 창, appraise: 화석 감정 창(npc 창의 감정 탭) */
export type NpcAfter = { type: 'open-shop'; shop: string } | { type: 'open-museum' } | { type: 'menu' } | { type: 'open-craft' } | { type: 'appraise' };

export interface FacilityNpcDef extends NpcSocial {
  /** GDD 3.10.1 id */
  id: string;
  name: string;
  island: string;
  catchphrase: string;
  accent: string;
  /** 대사 역할(dialog.TalkDef.role) */
  role: 'quack' | 'museum' | 'peng' | 'mongsil' | 'shipyard' | 'tongtong' | 'pro' | 'merchant' | 'owner';
  /** 서는 곳(여러 곳이면 같은 NPC 가 여러 자리에 — 펭박사: 발사장 + 말랑섬 부두) */
  spots: NpcSpot[];
  /** 모델(곰 몽실은 기존 villager 모델이라 없음) */
  spec?: AnimalSpec;
  /** 두 번째 자리의 모델(양 자매 — 동생) */
  alt?: AnimalSpec;
  /** 동물 빌더 대신 특별 모델(spec 은 색만) */
  model?: SpecialKind;
  /** 섬 주인(GDD 4.6.2 별조각 체인)이면 그 섬 */
  owner?: string;
  moods: BubbleKind[];
  after: NpcAfter;
  first: string[];
  usual: string[];
  tod?: Partial<Record<'morning' | 'day' | 'sunset' | 'night', string[]>>;
}

export const FACILITY_NPCS: FacilityNpcDef[] = [
  {
    id: 'npc_quack', name: '꽥사장', island: 'home', catchphrase: '꽥', accent: '#ffb347', role: 'quack', spots: ['shop'],
    birthday: 3, likes: ['shiny', 'fish'], dislikes: ['junk'], voice: 1.45,
    spec: { kind: 'duck', fur: '#fff3c4', light: '#fffaf0', iris: '#3a2a20', outfit: 'overalls', outfitColor: '#7fb8ff', acc: 'none', acc2: 'none', scale: 1.02 },
    moods: ['sparkle', 'note'], after: { type: 'open-shop', shop: 'quack' },
    first: ['꽥! 새 얼굴이구먼! 잡은 건 뭐든 사 주지.', '오늘 인기 생물은 게시판에 붙여 놨어!'],
    usual: ['꽥! 또 왔구먼!', '그건 오늘 두 배야, 꽥!', '가방이 터지겠구먼, 꽥.', '꽥! 좋은 물건이구먼!'],
    tod: {
      morning: ['꽥! 아침 장사는 부지런해야 하는 법이지!'],
      sunset: ['슬슬 문 닫을 시간이구먼… 그래도 너라면 사 주지, 꽥!'],
      night: ['꽥… 밤에도 손님이 오다니, 장사꾼은 잠도 없지!'],
    },
  },
  {
    id: 'npc_slow', name: '느릿 관장', island: 'home', catchphrase: '오오……', accent: '#8fd18a', role: 'museum', spots: ['museum'],
    birthday: 8, likes: ['fossil', 'sea'], dislikes: ['junk'], voice: 0.62,
    spec: { kind: 'turtle', fur: '#a8dc8c', light: '#fff1c8', mark: '#c99a5e', iris: '#3a2a20', acc: 'glasses', accColor: '#b08850', outfit: 'pocket', outfitColor: '#c9a6ff', scale: 1.0 },
    moods: ['question', 'heart'], after: { type: 'open-museum' },
    first: ['오오…… 어서…… 오세요……', '처음 보는…… 생물을…… 가져오면…… 전시해…… 드리죠……'],
    usual: ['오오…… 또…… 오셨군요……', '천천히…… 둘러보세요…… 서두를…… 것…… 없어요……', '기증은…… 언제나…… 환영이에요……'],
    tod: {
      morning: ['아침…… 햇살이…… 전시실을…… 깨우는…… 시간이죠……'],
      night: ['밤의…… 박물관은…… 조금…… 신비롭죠……'],
    },
  },
  {
    id: 'npc_peng', name: '펭박사', island: 'launch', catchphrase: '펭', accent: '#7f8cff', role: 'peng', spots: ['pengLab', 'pier'],
    birthday: 15, likes: ['space', 'shiny'], dislikes: ['junk'], voice: 1.1,
    spec: { kind: 'penguin', fur: '#4a5a8f', light: '#ffffff', iris: '#2a2030', acc: 'glasses', accColor: '#ffcf4a', acc2: 'scarf', scale: 1.05 },
    moods: ['sparkle', 'question'], after: { type: 'open-shop', shop: 'peng' },
    first: ['난 날개는 있는데 날 줄은 몰라. 그래서 로켓을 만들지!', '부품 여섯 개만 모아 주게. 모든 섬을 다 돌아야 할 걸세!'],
    usual: ['날개는 없지만 엔진은 있지!', '오늘도 계산을 해 봤는데… 우주는 생각보다 가깝다네!', '로켓 창문은 동그래야 귀엽고 튼튼하지!'],
    tod: {
      night: ['오늘 밤은 별이 잘 보이는군. 저기가 우리가 갈 곳일세!'],
      morning: ['좋은 아침일세! 아침 공기는 연료처럼 상쾌하지!'],
    },
  },
  {
    id: 'npc_mongsil', name: '곰 몽실', island: 'home', catchphrase: '곰곰', accent: '#ffb36e', role: 'mongsil', spots: ['plaza'], owner: 'home',
    birthday: 1, likes: ['sweet', 'fruit'], dislikes: ['junk'], voice: 0.9,
    moods: ['note', 'heart'], after: { type: 'menu' },
    first: ['어서 와! 도파민랜드에 온 걸 환영해, 곰곰!', '왔구나! 오늘은 뭐 잡았어?'],
    usual: ['왔구나! 오늘은 뭐 잡았어?', '강가 그림자 봤어? 살금살금 가야 해!', '뗏목 만들면 저 바다 너머도 갈 수 있대!', '꿀 한 숟갈이면 하루가 행복해, 곰곰.', '보물 상자에서 반짝이는 게 보였어, 곰곰!'],
    tod: {
      morning: ['좋은 아침! 이슬 맺힌 꽃 봤어, 곰곰?'],
      sunset: ['노을 진다… 오늘 재밌었어, 곰곰?'],
      night: ['하암… 밤엔 반딧불이 보러 가는 거야, 곰곰.'],
    },
  },
  {
    id: 'npc_peli', name: '펠리 선장', island: 'home', catchphrase: '끼룩', accent: '#5fb0ff', role: 'shipyard', spots: ['shipyard'],
    birthday: 19, likes: ['sea', 'fish'], dislikes: ['bug'], voice: 0.78,
    spec: { kind: 'pelican', fur: '#fffaf2', light: '#ffffff', iris: '#2a2030', acc: 'captain', accColor: '#3b5bb5', outfit: 'stripe', outfitColor: '#5f8fe0', scale: 1.05 },
    moods: ['note', 'sparkle'], after: { type: 'open-shop', shop: 'shipyard' },
    first: ['부리에 바다를 담았지! 난 펠리 선장이라네.', '배가 필요하면 언제든 이 계산대로 오게, 끼룩!'],
    usual: ['부리에 바다를 담았지!', '파도가 좋구먼. 출항하기 딱이야, 끼룩!', '뗏목부터 요트까지, 다 내 손을 거쳤지!'],
    tod: {
      sunset: ['노을 진 바다는 선장의 보물이지, 끼룩.'],
      night: ['밤바다엔 등대 불빛만 믿고 가는 거라네.'],
    },
  },
  // ───────── P1 역할 NPC ─────────
  {
    id: 'npc_tongtong', name: '통통', island: 'home', catchphrase: '뚝딱', accent: '#ff9f6e', role: 'tongtong', spots: ['workbench'],
    birthday: 5, likes: ['material', 'furniture'], dislikes: ['junk'], voice: 1.05,
    spec: { kind: 'beaver', fur: '#c08a5e', light: '#f6dcc0', iris: '#3a2a20', outfit: 'overalls', outfitColor: '#ff9f6e', acc: 'beanie', accColor: '#ffd36e', acc2: 'none', scale: 1.0 },
    moods: ['sparkle', 'note'], after: { type: 'open-craft' },
    first: ['뚝딱뚝딱! 난 목수 통통이야.', '나무랑 돌만 있으면 뭐든 만들어 줄게! 작업대는 언제든 써, 뚝딱!'],
    usual: ['뚝딱뚝딱! 오늘은 뭘 만들어 볼까?', '못 하나에도 정성이 들어가야 해, 뚝딱.', '다리 하나 놓으면 강 건너가 엄청 가까워진대!', '레시피 카드 모았어? 새 가구는 언제나 설레, 뚝딱!'],
    tod: {
      morning: ['아침엔 대패질 소리가 제일 상쾌해, 뚝딱!'],
      night: ['밤엔 망치 소리 줄이고 조용조용 다듬는 중이야… 뚝딱.'],
    },
  },
  {
    id: 'npc_bodeul', name: '보들', island: 'coral', catchphrase: '보들보들', accent: '#4fd1c5', role: 'owner', spots: ['diving'], owner: 'coral',
    birthday: 11, likes: ['sea', 'shell'], dislikes: ['junk'], voice: 1.3,
    spec: { kind: 'otter', fur: '#b88a5e', light: '#f4dcc0', earIn: '#e9b39a', iris: '#2a1a14', outfit: 'stripe', outfitColor: '#4fd1c5', acc: 'glasses', accColor: '#4fd1c5', acc2: 'none', scale: 1.0 },
    moods: ['note', 'sparkle'], after: { type: 'open-shop', shop: 'diving' },
    first: ['어머어머, 새 친구다! 난 보들, 이 섬 다이빙 센터 주인이야!', '스노클 있어? 잠수복은? 잠수정은 꿈이지? 다 여기 있어, 보들보들!'],
    usual: ['오늘 바닷속 시야가 엄청 좋아! 들어가 봐, 보들보들!', '산호 사이에 해마가 숨어 있었어, 진짜야!', '꿀꺽호 난파선 얘기 들었어? 선장 망원경이 아직 거기 있대!', '잠수하다 숨차면 바로 올라와야 해, 약속!'],
    tod: {
      sunset: ['노을 질 때 바다에 들어가면 물이 분홍색이야, 보들보들!'],
      night: ['밤바다엔 반짝이는 플랑크톤이 있어… 쉿, 예쁘지?'],
    },
  },
  {
    id: 'npc_pro', name: '프로 박사', island: 'dino', catchphrase: '흠흠', accent: '#7cc96b', role: 'pro', spots: ['fossilLab'],
    birthday: 14, likes: ['fossil', 'dino'], dislikes: ['junk'], voice: 0.92,
    model: 'proto', spec: { kind: 'bear', fur: '#ffcf9e', light: '#fff4e2', mark: '#e8a878', accColor: '#fffaf2', scale: 1.0 },
    moods: ['question', 'sparkle'], after: { type: 'appraise' },
    first: ['흠흠, 반갑네. 난 화석 연구소의 프로 박사일세.', '뼈 조각을 가져오면 감정해 주지. 감정료는 300코인, 학문엔 돈이 드는 법이라네!'],
    usual: ['흠흠, 오늘은 어떤 뼈를 가져왔나?', '머리뼈·몸뼈·꼬리뼈, 세 조각이면 골격이 완성되지!', '화석은 서두르면 깨진다네. 살살, 살살.', '내 프릴은 장식이 아니라 학자의 품격일세, 흠흠.'],
    tod: { night: ['밤엔 화석들이 옛날 꿈을 꾼다는 학설이 있지… 흠흠, 농담일세.'] },
  },
  {
    id: 'npc_camel', name: '낙타 상인', island: 'desert', catchphrase: '흥정흥정', accent: '#ffb347', role: 'merchant', spots: ['bazaar'],
    birthday: 17, likes: ['shiny', 'fruit'], dislikes: ['sea'], voice: 0.8,
    spec: { kind: 'camel', fur: '#e8c08a', light: '#fbe6c4', earIn: '#e8b08a', iris: '#4a3020', outfit: 'stripe', outfitColor: '#ffb347', acc: 'scarf', accColor: '#ff6f91', acc2: 'none', scale: 1.1 },
    moods: ['sparkle', 'note'], after: { type: 'open-shop', shop: 'bazaar' },
    first: ['어서 오시오, 여행자! 사막 바자르에 온 걸 환영하오.', '여기 시세는 저 말랑섬과 다르다오. 흥정은 언제나 환영이지, 흥정흥정!'],
    usual: ['좋은 물건엔 좋은 값을! 흥정흥정!', '이 혹 안엔 장사 비법이 가득하다오.', '모래폭풍 지나간 다음 날엔 귀한 물건이 들어오지.', '오아시스 물 한 잔 하고 가시오, 공짜라오!'],
    tod: { sunset: ['해 질 녘 사막은 금빛 시장이 된다오. 흥정흥정!'] },
  },
  {
    id: 'npc_raccoon', name: '너구리 고물상', island: 'home', catchphrase: '킁킁', accent: '#8fae6a', role: 'merchant', spots: ['junkBeach'],
    birthday: 21, likes: ['junk', 'material'], dislikes: ['flower'], voice: 1.15,
    spec: { kind: 'raccoon', fur: '#c9b4a2', light: '#fff4ea', iris: '#3a2a20', outfit: 'overalls', outfitColor: '#8fae6a', acc: 'beanie', accColor: '#ff9f6e', acc2: 'none', scale: 1.0 },
    moods: ['question', 'sparkle'], after: { type: 'open-shop', shop: 'junk' },
    first: ['킁킁! 냄새 좋은 손님이네. 난 해변 고물상 너구리야.', '낡은 장화, 빈 깡통… 남들이 버린 건 다 내 보물이야! 가져오면 사 줄게, 킁킁.'],
    usual: ['킁킁, 오늘 바다가 뭘 밀어 줬을까?', '녹슨 열쇠는 언젠가 뭔가를 열어 준다구!', '쓰레기도 모으면 반짝별이 돼. 진짜야, 킁킁.', '이 깡통 탑, 멋지지? 내 작품이야!'],
    tod: { night: ['밤 해변은 보물찾기 시간이야… 킁킁, 쉿!'] },
  },
  {
    id: 'npc_kkumul', name: '꾸물이', island: 'space', catchphrase: '꾸물꾸물', accent: '#9ef0d2', role: 'merchant', spots: ['station'],
    birthday: 23, likes: ['space', 'sweet'], dislikes: ['junk'], voice: 0.95,
    model: 'octopus', spec: { kind: 'bear', fur: '#c9b6f2', light: '#f4eeff', accColor: '#9ef0d2', scale: 1.0 },
    moods: ['note', 'sparkle'], after: { type: 'open-shop', shop: 'station' },
    first: ['꾸물꾸물~ 별다방에 어서 와! 난 꾸물이야.', '다리 여덟 개로 커피도 내리고 우주 굿즈도 팔아. 한 번에 여덟 잔도 가능해, 꾸물꾸물!'],
    usual: ['별빛 라떼는 오늘도 반짝반짝해, 꾸물꾸물!', '우주에서 온 손님은 오랜만이야! 지구는 어때?', 'UFO 부품 구경해 볼래? 반짝이는 게 많아, 꾸물!', '여덟 다리 중에 제일 좋아하는 건 셋째야. 비밀이야!'],
  },
  {
    id: 'npc_sheep', name: '양 자매', island: 'home', catchphrase: '메에', accent: '#ff9fc6', role: 'merchant', spots: ['sheepShop', 'sheepShop'],
    birthday: 25, likes: ['clothes', 'flower'], dislikes: ['junk'], voice: 1.2,
    spec: { kind: 'sheep', fur: '#fff8ec', light: '#ffe2d2', earIn: '#ffc0c8', iris: '#5a3a48', outfit: 'dress', outfitColor: '#ff9fc6', acc: 'bow', accColor: '#ff7aa8', acc2: 'none', lashes: true, scale: 1.0 },
    alt: { kind: 'sheep', fur: '#fff3fa', light: '#ffe6dc', earIn: '#ffc0c8', iris: '#4a3a5a', outfit: 'dress', outfitColor: '#a6e3ff', acc: 'flower', accColor: '#ffd36e', acc2: 'none', lashes: true, scale: 0.9 },
    moods: ['heart', 'sparkle'], after: { type: 'open-shop', shop: 'sheep' },
    first: ['메에~ 어서 와! 우리는 양 자매 옷가게야.', '언니가 고르고 동생이 리본 달아 줄게! 오늘의 너에게 딱 맞는 옷이 있어, 메에!'],
    usual: ['오늘 너 정말 귀엽다, 메에!', '이번 계절 유행은 동글동글 모자래!', '털 깎은 날엔 목이 시려… 그래서 목도리를 만들었지, 메에.', '언니랑 동생, 누가 더 패셔너블해? 비밀로 해 줘, 메에!'],
    tod: { morning: ['아침엔 밝은 색 옷이 기분 좋아, 메에!'] },
  },
  // ───────── P1 섬 주인(별조각 체인 — 체인 대사는 story 가 addDialog 로 더한다) ─────────
  {
    id: 'npc_owl_prof', name: '부엉 교수', island: 'mushroom', catchphrase: '부엉', accent: '#b6e86a', role: 'owner', spots: ['fireflyGarden'], owner: 'mushroom',
    birthday: 7, likes: ['bug', 'mushroom'], dislikes: ['junk'], voice: 0.85,
    spec: { kind: 'owl', fur: '#c9a07a', light: '#fff0dc', iris: '#3a2a20', outfit: 'pocket', outfitColor: '#8fae6a', acc: 'glasses', accColor: '#c99a5e', acc2: 'none', scale: 1.08 },
    moods: ['question', 'note'], after: { type: 'menu' },
    first: ['부엉… 반갑구려. 난 반딧불을 연구하는 부엉 교수라오.', '이 섬의 빛은 다 반딧불이 친구들 덕분이지. 잘 부탁하오, 부엉.'],
    usual: ['부엉… 밤이 깊을수록 숲이 환해진다오.', '반딧불이는 잡는 것보다 놓아줄 때 더 예쁘지, 부엉.', '버섯 탑 꼭대기에서 보는 별은 각별하다오.', '연구 노트가 벌써 백 권째라오. 부엉부엉.'],
    tod: { day: ['부엉… 낮엔 조금 졸리구려. 하아암.'], night: ['부엉! 지금이 내 연구 시간이라오. 저 빛들 좀 보게!'] },
  },
  {
    id: 'npc_grandma', name: '목길이 할머니', island: 'dino', catchphrase: '허허', accent: '#8fe3c8', role: 'owner', spots: ['giantForest'], owner: 'dino',
    birthday: 0, likes: ['flower', 'fruit'], dislikes: ['junk'], voice: 0.7,
    model: 'brachio', spec: { kind: 'bear', fur: '#a8dcc0', light: '#f4fff0', mark: '#86c8a4', accColor: '#ff9fb8', scale: 1.0 },
    moods: ['heart', 'note'], after: { type: 'menu' },
    first: ['어이구, 꼬마 손님이 왔구나. 허허, 목길이 할머니란다.', '이 숲 거목들은 할머니보다 나이가 많지. 천천히 쉬었다 가렴.'],
    usual: ['허허, 목이 길면 멀리까지 보인단다.', '옛날 옛적엔 하늘에서 별이 쏟아졌지… 그 얘기 들어 볼래?', '고사리 새순은 봄에 제일 달단다, 허허.', '티노는 낮잠꾸러기야. 깨우지 말고 살금살금 지나가렴.'],
    tod: { sunset: ['노을이 지면 할머니 목에 해가 걸린단다, 허허.'], night: ['별 보며 옛날 생각 중이란다… 허허.'] },
  },
  {
    id: 'npc_snow_elder', name: '흰눈 영감', island: 'ice', catchphrase: '허엄', accent: '#7fb8ff', role: 'owner', spots: ['iceHut'], owner: 'ice',
    birthday: 2, likes: ['fish', 'sweet'], dislikes: ['bug'], voice: 0.68,
    spec: { kind: 'polar', fur: '#fbfcff', light: '#ffffff', earIn: '#ffc7d2', iris: '#3a3a4a', outfit: 'hoodie', outfitColor: '#7fb8ff', acc: 'beanie', accColor: '#ff6f7f', acc2: 'glasses', scale: 1.25 },
    moods: ['note', 'heart'], after: { type: 'menu' },
    first: ['허엄… 이 추운 데까지 왔구먼. 흰눈 영감이라네.', '얼음 낚시도, 오로라도 다 기다림이 반이지. 천천히 놀다 가게.'],
    usual: ['허엄, 눈 냄새가 나는구먼. 곧 함박눈이 오겠어.', '오로라 뜨는 밤엔 오로라나비가 춤춘다네.', '얼음 구멍 앞에선 숨도 살살 쉬어야 해, 허엄.', '이 털모자는 할멈이 떠 준 거라네. 따뜻하지.'],
    tod: { night: ['허엄… 하늘 좀 보게. 오늘은 초록 불이 뜰지도 몰라.'] },
  },
  {
    id: 'npc_saltstar', name: '소금별', island: 'desert', catchphrase: '반짝', accent: '#c9b6f2', role: 'owner', spots: ['oasis'], owner: 'desert',
    birthday: 18, likes: ['space', 'shiny'], dislikes: ['sea'], voice: 1.25,
    spec: { kind: 'fox', fur: '#f6dcb0', light: '#fffaf0', earIn: '#ffc0b0', iris: '#4a3a6a', outfit: 'dress', outfitColor: '#c9b6f2', acc: 'scarf', accColor: '#7f8cff', acc2: 'glasses', earScale: 1.45, scale: 0.95 },
    moods: ['sparkle', 'question'], after: { type: 'menu' },
    first: ['반짝! 사막에 온 걸 환영해. 난 별을 읽는 사막여우, 소금별이야.', '귀가 커서 별이 속삭이는 소리도 들려. 진짜라니까, 반짝!'],
    usual: ['반짝! 오늘 밤엔 어떤 별자리가 뜰까?', '모래폭풍 뒤엔 하늘이 유리처럼 맑아져.', '피라미드 꼭대기는 별이랑 제일 가까운 곳이야, 반짝.', '모래알을 세다 보면 별을 세는 기분이 들어.'],
    tod: { night: ['쉿, 지금 별이 노래하는 중이야… 반짝반짝.'] },
  },
  {
    id: 'npc_ppippo', name: '삐뽀', island: 'launch', catchphrase: '삐뽀', accent: '#ff7a8a', role: 'owner', spots: ['controlTower'], owner: 'launch',
    birthday: 26, likes: ['space', 'material'], dislikes: ['sea'], voice: 1.4,
    model: 'robot', spec: { kind: 'bear', fur: '#e8f4ff', light: '#dff7f0', accColor: '#ff7a8a', scale: 1.0 },
    moods: ['sparkle', 'note'], after: { type: 'menu' },
    first: ['삐뽀삐뽀! 관제탑 로봇 삐뽀, 인사합니다!', '하늘 길, 별 길, 바닷길 다 지켜보고 있어요. 발사 준비 완료, 삐뽀!'],
    usual: ['삐뽀! 오늘 하늘 상태: 반짝반짝 맑음!', '카운트다운은 삐뽀가 제일 잘해요. 열, 아홉… 삐뽀!', '별자리 물고기 신호가 크레이터 호수에서 잡혔어요!', '배터리 충전 완료! 기분 최고, 삐뽀삐뽀!'],
    tod: { night: ['밤하늘 레이더 가동 중… 별똥별 발견! 삐뽀!'] },
  },
];

export const MONGSIL = FACILITY_NPCS.find((n) => n.id === 'npc_mongsil')!;

// ───────────── 섬 주인(GDD 4.6.2 — story 가 이 id 로 체인 대사를 붙인다) ─────────────
export const ISLAND_OWNERS: Readonly<Record<string, string>> = {
  home: 'npc_mongsil', coral: 'npc_bodeul', mushroom: 'npc_owl_prof', dino: 'npc_grandma',
  ice: 'npc_snow_elder', desert: 'npc_saltstar', launch: 'npc_ppippo',
};
export const OWNER_IDS: readonly string[] = Object.values(ISLAND_OWNERS);

// ───────────── 이주민(GDD 3.10.1 이주민 후보 16 중 새로 오는 9명 — moveIn 으로만 섬에 나타난다) ─────────────
export const MIGRANTS: ResidentDef[] = [
  {
    id: 'res_panda', name: '뭉치', island: 'home', catchphrase: '냠냠', accent: '#8fd18a',
    birthday: 3, likes: ['fruit', 'sweet'], dislikes: ['bug'], voice: 0.9,
    spec: { kind: 'panda', fur: '#fffaf2', light: '#ffffff', iris: '#3a2a20', acc: 'none' },
    moods: ['heart', 'note'],
    lines: ['대나무 간식 먹을래? 아삭아삭해, {c}!', '구르기 대회 하면 내가 일등이야, {c}.', '낮잠 자기 좋은 그늘 알아, {c}. 같이 갈래?'],
  },
  {
    id: 'res_frog', name: '퐁당', island: 'home', catchphrase: '개굴', accent: '#7cc96b',
    birthday: 9, likes: ['bug', 'flower'], dislikes: ['junk'], voice: 1.15,
    spec: { kind: 'frog', fur: '#9fe07a', light: '#f4ffd8', iris: '#2a3a20', acc: 'sunhat', accColor: '#ffd36e' },
    moods: ['note', 'sparkle'],
    lines: ['비 오는 날이 제일 좋아, {c}! 노래가 절로 나와.', '연잎 위에서 점프 연습 중이야, {c}.', '연못에 비친 달이 동그래서 먹고 싶어, {c}.'],
  },
  {
    id: 'res_koala', name: '쿨쿨', island: 'home', catchphrase: '하암', accent: '#b8c4d6',
    birthday: 13, likes: ['flower', 'furniture'], dislikes: ['junk'], voice: 0.8,
    spec: { kind: 'koala', fur: '#b8c4d6', light: '#fffaf2', iris: '#3a3a4a', acc: 'flower' },
    moods: ['zzz', 'heart'],
    lines: ['하루에 스무 시간 자는 게 목표야, {c}…', '나무를 꼭 안고 있으면 마음이 편해져, {c}.', '꿈에서 너랑 낚시했어, {c}. 월척이었어!'],
  },
  {
    id: 'res_hamster', name: '볼볼', island: 'home', catchphrase: '쪼르르', accent: '#ffc98a',
    birthday: 16, likes: ['sweet', 'fruit'], dislikes: ['fish'], voice: 1.5,
    spec: { kind: 'hamster', fur: '#ffc98a', light: '#fffaf0', iris: '#3a2a20', acc: 'bow', accColor: '#ff7aa8' },
    moods: ['sparkle', 'heart'],
    lines: ['볼주머니에 해바라기씨 스무 개 들어가, {c}!', '쳇바퀴 돌리면 하루가 금방 가, {c}.', '작은 몸이지만 꿈은 커, {c}!'],
  },
  {
    id: 'res_alpaca', name: '몽글', island: 'home', catchphrase: '뿌우', accent: '#e8cfa8',
    birthday: 19, likes: ['clothes', 'flower'], dislikes: ['junk'], voice: 1.0,
    spec: { kind: 'alpaca', fur: '#fff1dc', light: '#fff8ee', iris: '#4a3a2a', acc: 'scarf', accColor: '#c58cff' },
    moods: ['heart', 'note'],
    lines: ['내 털로 목도리 짜 줄까, {c}?', '구름이 나랑 닮았다는 말 자주 들어, {c}.', '높은 데서 보는 경치가 좋아, {c}!'],
  },
  {
    id: 'res_owl', name: '깃털이', island: 'home', catchphrase: '후후', accent: '#a8784f',
    birthday: 22, likes: ['bug', 'shiny'], dislikes: ['sea'], voice: 1.1,
    spec: { kind: 'owl', fur: '#e0c098', light: '#fff4e2', iris: '#3a2a20', acc: 'beanie', accColor: '#7fb8ff' },
    moods: ['question', 'zzz'],
    lines: ['밤새 별 구경했더니 졸려, {c}…', '책 읽는 게 제일 재밌어, {c}. 너도 읽어 볼래?', '부엉 교수님이 우리 삼촌이야, {c}!'],
  },
  {
    id: 'res_hedgehog', name: '밤송이', island: 'home', catchphrase: '꼼지락', accent: '#e9c9a0',
    birthday: 24, likes: ['fruit', 'mushroom'], dislikes: ['shiny'], voice: 1.3,
    spec: { kind: 'hedgehog', fur: '#e9c9a0', light: '#fff1e0', iris: '#3a2a20', acc: 'none' },
    moods: ['sparkle', 'question'],
    lines: ['가시가 있어도 안아 주면 좋아해, {c}.', '사과 굴리기 놀이 할래, {c}?', '낙엽 이불 덮고 자면 폭신폭신해, {c}.'],
  },
  {
    id: 'res_tirami', name: '티라미', island: 'home', catchphrase: '크앙', accent: '#ff8f6e',
    birthday: 6, likes: ['dino', 'fossil'], dislikes: ['flower'], voice: 1.35,
    model: 'babydino', spec: { kind: 'bear', fur: '#ffb88a', light: '#fff1dc', mark: '#ff8f6e', scale: 0.95 },
    moods: ['sparkle', 'note'],
    lines: ['티노 삼촌은 낮잠 대장이야, {c}! 크앙!', '나도 크면 엄청 크게 쿵쿵 걸을 거야, {c}.', '크앙! 무서웠어? 아니야? 히잉, {c}…'],
  },
  {
    id: 'res_piri', name: '삐리', island: 'home', catchphrase: '삐리리', accent: '#b6f0c8',
    birthday: 27, likes: ['space', 'shiny'], dislikes: ['junk'], voice: 1.6,
    model: 'alien', spec: { kind: 'bear', fur: '#b6f0c8', light: '#e9fff0', outfitColor: '#c9b6f2', scale: 0.95 },
    moods: ['sparkle', 'question'],
    lines: ['지구 음식은 다 신기해, {c}! 특히 딸기!', '우리 별에선 인사할 때 더듬이를 흔들어, {c}.', '언젠가 너도 우리 별에 놀러 와, {c}!'],
  },
];

/** 이주민 후보 16(GDD 3.10.1 순서). fixed = 그 섬을 떠나지 않는다(몽실은 말랑섬 주인) */
export const ROSTER16: ReadonlyArray<{ id: string; kind: string; fixed?: boolean }> = [
  { id: 'npc_mongsil', kind: '곰', fixed: true }, { id: 'res_toto_home', kind: '토끼' }, { id: 'nabi', kind: '고양이' }, { id: 'rex', kind: '강아지' },
  { id: 'sabaki', kind: '여우' }, { id: 'dotori', kind: '다람쥐' }, { id: 'res_panda', kind: '판다' }, { id: 'res_frog', kind: '개구리' },
  { id: 'res_koala', kind: '코알라' }, { id: 'res_hamster', kind: '햄스터' }, { id: 'res_alpaca', kind: '알파카' }, { id: 'res_owl', kind: '부엉이' },
  { id: 'res_hedgehog', kind: '고슴도치' }, { id: 'res_tirami', kind: '아기공룡' }, { id: 'pengpeng', kind: '펭귄' }, { id: 'res_piri', kind: '외계인' },
];

/** 섬마다 주민이 살 수 있는 집 수(시설 NPC 는 세지 않는다 — 말랑섬은 몽실 포함) */
export const ISLAND_CAP: Readonly<Record<string, number>> = { home: 7, dino: 4, ice: 4, mushroom: 4, coral: 4, desert: 4, launch: 4 };

// ───────────── 주민끼리 수다(두 줄 주고받기 — {a}/{b} 이름, {ca}/{cb} 말버릇) ─────────────
export const CHATTER: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = {
  any: [
    ['{b}! 오늘 뭐 잡았어, {ca}?', '아직 비밀이야! 저녁에 자랑할게, {cb}.'],
    ['{b}, 상자에서 반짝이는 거 나왔대, {ca}!', '진짜? 나도 열어 보고 싶다, {cb}!'],
    ['{b}, 이따 같이 산책 갈래, {ca}?', '좋아! 노을 질 때 가자, {cb}.'],
    ['{b}, 새 옷 귀엽다, {ca}!', '헤헤, 양 자매네 가게에서 샀어, {cb}!'],
    ['{b}, 어젯밤 별똥별 봤어, {ca}?', '봤어! 소원 세 개나 빌었어, {cb}.'],
    ['{b}, 너 요즘 바빠 보여, {ca}.', '도감 채우는 친구 따라다니느라, {cb}!'],
    ['{b}, 배고프지 않아, {ca}?', '방금 과일 먹었는데 또 배고파, {cb}…'],
    ['{b}, 오늘 날씨 진짜 좋다, {ca}!', '이런 날엔 낮잠이 최고야, {cb}.'],
    ['{b}, 박물관 새 전시 봤어, {ca}?', '느릿 관장님 설명 듣다 해가 졌어, {cb}…'],
    ['{b}, 나 어제 꿈에 로켓 탔어, {ca}!', '우와, 달에서 떡 먹었어, {cb}?'],
    ['{b}, 우리 섬 점점 북적북적해진다, {ca}.', '새 친구가 와서 그런가 봐, {cb}!'],
    ['{b}, 이 노래 알아? 랄랄라~ {ca}!', '알지! 같이 부르자, {cb}~'],
  ],
  home: [
    ['{b}, 강가에 큰 그림자 지나갔어, {ca}!', '살금살금 다가가야 해, {cb}!'],
    ['{b}, 꽥사장님 오늘 기분 좋아 보여, {ca}.', '인기 생물 두 배라서 그런가 봐, {cb}!'],
  ],
  dino: [
    ['{b}, 쿵쿵 소리 들었어, {ca}?', '티노가 뒤척이는 거야, 쉿, {cb}!'],
    ['{b}, 화석 하나 더 찾았어, {ca}!', '프로 박사님께 보여 드리자, {cb}!'],
  ],
  ice: [
    ['{b}, 손 시려, {ca}…', '내 목도리 같이 두르자, {cb}!'],
    ['{b}, 오로라 뜨면 깨워 줄래, {ca}?', '당연하지! 같이 보자, {cb}.'],
  ],
  mushroom: [
    ['{b}, 저 버섯 오늘 더 커진 것 같아, {ca}!', '밤에 비 와서 그래, {cb}. 쑥쑥!'],
    ['{b}, 반딧불이 몇 마리 셌어, {ca}?', '서른 마리까지 세다 잠들었어, {cb}…'],
  ],
  coral: [
    ['{b}, 오늘 물 진짜 맑다, {ca}!', '잠수하면 바닥까지 다 보여, {cb}!'],
    ['{b}, 조개 껍데기 주웠어, {ca}.', '귀에 대 봐, 바다 노래 들려, {cb}!'],
  ],
  desert: [
    ['{b}, 모래가 따끈따끈해, {ca}!', '오아시스에 발 담그러 가자, {cb}!'],
    ['{b}, 낙타 상인님 오늘 흥정 세다, {ca}.', '나도 귤 하나 덤으로 받았어, {cb}!'],
  ],
  launch: [
    ['{b}, 로켓 언제 날아가, {ca}?', '부품만 다 모이면 곧이래, {cb}!'],
    ['{b}, 삐뽀가 카운트다운 연습하더라, {ca}.', '열, 아홉… 나도 외울래, {cb}!'],
  ],
};
