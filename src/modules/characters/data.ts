// 주민 목록과 대사 — 섬마다 테마 동물 2~3명, 섬별·시간대별 랜덤 대사 + 생일·좋아하는 선물(GDD 4.6.1).
// 시설 NPC(GDD 3.10.1 P0: 꽥사장·느릿 관장·펭박사·곰 몽실 + 조선소 카운터 펠리 선장)와 4.6.3 대사.
// 순수 데이터 — 다른 모듈(economy 부탁·게시판)도 ext.npc 를 거쳐 읽는다.
import type { AnimalSpec } from './animal';
import type { BubbleKind } from './tex';

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
export type NpcSpot = 'shop' | 'museum' | 'pengLab' | 'pier' | 'shipyard' | 'plaza';

/** 대화가 끝나면 여는 창(이벤트) */
export type NpcAfter = { type: 'open-shop'; shop: string } | { type: 'open-museum' } | { type: 'menu' };

export interface FacilityNpcDef extends NpcSocial {
  /** GDD 3.10.1 id */
  id: string;
  name: string;
  island: string;
  catchphrase: string;
  accent: string;
  /** 대사 역할(dialog.TalkDef.role) */
  role: 'quack' | 'museum' | 'peng' | 'mongsil' | 'shipyard';
  /** 서는 곳(여러 곳이면 같은 NPC 가 여러 자리에 — 펭박사: 발사장 + 말랑섬 부두) */
  spots: NpcSpot[];
  /** 모델(곰 몽실은 기존 villager 모델이라 없음) */
  spec?: AnimalSpec;
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
    id: 'npc_mongsil', name: '곰 몽실', island: 'home', catchphrase: '곰곰', accent: '#ffb36e', role: 'mongsil', spots: ['plaza'],
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
];

export const MONGSIL = FACILITY_NPCS.find((n) => n.id === 'npc_mongsil')!;
