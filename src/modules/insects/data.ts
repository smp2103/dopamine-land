// 곤충 도감 데이터 — 도감·상점이 읽는다. 섬·시간대·서식 위치·생김새(모델 원형 + 색)까지 한곳에.
import type { Species } from '../../core/state';

export type BugKind =
  | 'butterfly' | 'moth' | 'dragonfly' | 'damselfly' | 'bee' | 'beetle' | 'ladybug' | 'stag' | 'rhino'
  | 'cicada' | 'grasshopper' | 'mantis' | 'firefly' | 'ant' | 'spider' | 'snail' | 'strider'
  | 'snowbug' | 'sporebug' | 'scorpion' | 'dungbeetle' | 'pillbug' | 'caterpillar';

/** 서식 위치: 꽃 위 · 나무(그루터기) · 바위 옆 · 땅 · 물 위 · 공중 */
export type BugSpot = 'flower' | 'tree' | 'rock' | 'ground' | 'water' | 'air';
export type BugTod = 'morning' | 'day' | 'sunset' | 'night';
/** 섬 테마(islet = 보물 작은 섬들) */
export type BugIsland = 'home' | 'dino' | 'ice' | 'mushroom' | 'coral' | 'desert' | 'launch' | 'islet';

export interface BugSpecies extends Species {
  kind: BugKind;
  spot: BugSpot;
  islands: BugIsland[];
  tods: BugTod[];
  /** 몸 색 · 두 번째 색 · 포인트 색 */
  colors: [string, string, string];
  /** 모델 배율(m, 몸길이 대략) */
  size: number;
  /** 무늬 변주(종마다 다르게) */
  pattern?: 'plain' | 'spots' | 'stripes' | 'eyes' | 'rainbow' | 'tiger' | 'glow' | 'iri';
  /** 겁 많음(1 = 보통) — 도망 거리·성공률에 곱 */
  shy?: number;
  /** 크기 범위(cm) — 잡을 때 크기 표기 */
  cm: [number, number];
}

const ALL: BugTod[] = ['morning', 'day', 'sunset', 'night'];
const DAY: BugTod[] = ['morning', 'day'];
const LATE: BugTod[] = ['sunset', 'night'];
const MEADOW: BugIsland[] = ['home', 'islet', 'launch'];

type Row = Omit<BugSpecies, 'category' | 'id'> & { id: string };
const rows: Row[] = [
  // ── 나비 ──
  { id: 'yellow-butterfly', name: '노랑나비', kind: 'butterfly', spot: 'flower', islands: [...MEADOW, 'coral'], tods: DAY, rarity: 1, price: 120,
    colors: ['#ffe46a', '#ffb83d', '#fff8d0'], size: 0.34, pattern: 'spots', cm: [4, 6], desc: '꽃마다 들러 인사하는 부지런한 나비. 날개에서 햇볕 냄새가 난대요.' },
  { id: 'cabbage-white', name: '배추흰나비', kind: 'butterfly', spot: 'flower', islands: [...MEADOW, 'mushroom'], tods: DAY, rarity: 1, price: 100,
    colors: ['#ffffff', '#cfd8e6', '#7a8296'], size: 0.32, pattern: 'spots', cm: [4, 6], desc: '하얀 날개 끝에 콕 찍은 점 두 개가 매력 포인트.' },
  { id: 'swallowtail', name: '호랑나비', kind: 'butterfly', spot: 'air', islands: [...MEADOW, 'dino'], tods: ['day', 'sunset'], rarity: 2, price: 280,
    colors: ['#ffd84a', '#3a2e2a', '#7ec0ff'], size: 0.42, pattern: 'tiger', cm: [8, 11], desc: '줄무늬 정장을 차려입은 꽃밭의 신사.' },
  { id: 'black-swallowtail', name: '제비나비', kind: 'butterfly', spot: 'air', islands: ['home', 'coral', 'dino'], tods: ['day', 'sunset'], rarity: 3, price: 900,
    colors: ['#2c3150', '#5d7bd6', '#9ef0d0'], size: 0.44, pattern: 'eyes', cm: [9, 12], desc: '햇빛에 비추면 날개가 청록으로 반짝여요.' },
  { id: 'morpho', name: '하늘빛 모르포나비', kind: 'butterfly', spot: 'air', islands: ['coral', 'dino'], tods: DAY, rarity: 4, price: 3200,
    colors: ['#4fb6ff', '#1b4fae', '#d8f4ff'], size: 0.48, pattern: 'iri', cm: [12, 15], desc: '하늘 한 조각을 오려 붙인 것 같은 날개.' },
  { id: 'pink-petal', name: '분홍 꽃잎나비', kind: 'butterfly', spot: 'flower', islands: ['home', 'mushroom', 'islet'], tods: ['morning'], rarity: 2, price: 350,
    colors: ['#ffb3d1', '#ff7fae', '#fff0f6'], size: 0.34, pattern: 'spots', cm: [5, 7], desc: '아침에만 피어나는 꽃잎이 날아다니는 거래요.' },
  { id: 'rainbow-butterfly', name: '무지개나비', kind: 'butterfly', spot: 'flower', islands: ['home', 'mushroom'], tods: ['morning', 'sunset'], rarity: 5, price: 9000, shy: 1.4,
    colors: ['#ff9ec4', '#8fd8ff', '#fff27a'], size: 0.42, pattern: 'rainbow', cm: [9, 12], desc: '비 갠 아침에만 보인다는 전설의 나비. 보면 하루가 행운!' },
  { id: 'frost-butterfly', name: '서리나비', kind: 'butterfly', spot: 'air', islands: ['ice'], tods: DAY, rarity: 3, price: 1400,
    colors: ['#e8f7ff', '#8fc8ff', '#ffffff'], size: 0.38, pattern: 'iri', cm: [6, 8], desc: '날갯짓할 때마다 작은 눈가루가 흩날려요.' },
  { id: 'fairy-butterfly', name: '요정나비', kind: 'butterfly', spot: 'flower', islands: ['mushroom'], tods: ['day', 'sunset'], rarity: 3, price: 1200,
    colors: ['#d7b8ff', '#9a7bff', '#fff3a8'], size: 0.36, pattern: 'eyes', cm: [6, 8], desc: '버섯 숲 요정이 타고 다닌다는 소문이 있어요.' },
  { id: 'desert-orange', name: '사막주황나비', kind: 'butterfly', spot: 'flower', islands: ['desert'], tods: DAY, rarity: 2, price: 420,
    colors: ['#ffab4a', '#e06a2a', '#fff1c8'], size: 0.34, pattern: 'spots', cm: [5, 7], desc: '오아시스 꽃을 찾아 모래바람을 건너온 여행자.' },
  // ── 나방 ──
  { id: 'silkmoth', name: '누에나방', kind: 'moth', spot: 'tree', islands: [...MEADOW], tods: LATE, rarity: 1, price: 140,
    colors: ['#fbf3e4', '#d9c7a8', '#8a6d55'], size: 0.3, pattern: 'plain', cm: [4, 5], desc: '복슬복슬한 하얀 솜뭉치. 쓰다듬고 싶어져요.' },
  { id: 'luna-moth', name: '달빛꼬리나방', kind: 'moth', spot: 'air', islands: ['home', 'mushroom'], tods: ['night'], rarity: 3, price: 1300,
    colors: ['#b9f2d0', '#7fd3a6', '#ffe48a'], size: 0.46, pattern: 'eyes', cm: [9, 12], desc: '달빛을 모아 날개에 칠해 둔 밤의 귀부인.' },
  { id: 'fluffy-moth', name: '솜털나방', kind: 'moth', spot: 'rock', islands: [...MEADOW, 'mushroom'], tods: LATE, rarity: 2, price: 320,
    colors: ['#e8d2b4', '#b08a66', '#ffffff'], size: 0.3, pattern: 'plain', cm: [3, 5], desc: '바위 틈에서 꾸벅꾸벅 조는 털복숭이.' },
  { id: 'snow-moth', name: '눈송이나방', kind: 'moth', spot: 'rock', islands: ['ice'], tods: LATE, rarity: 2, price: 600,
    colors: ['#ffffff', '#cfe6ff', '#8fb6e8'], size: 0.32, pattern: 'plain', cm: [4, 6], desc: '추위를 하나도 안 타는 털옷 부자.' },
  { id: 'atlas-moth', name: '왕나방', kind: 'moth', spot: 'tree', islands: ['dino'], tods: ['night'], rarity: 4, price: 4200,
    colors: ['#d8774a', '#8a3e2a', '#fff0c8'], size: 0.6, pattern: 'eyes', cm: [20, 26], desc: '날개를 펴면 손바닥 두 개만 해요. 공룡도 놀란대요.' },
  // ── 잠자리 ──
  { id: 'red-dragonfly', name: '고추잠자리', kind: 'dragonfly', spot: 'air', islands: [...MEADOW, 'coral'], tods: ['day', 'sunset'], rarity: 1, price: 180,
    colors: ['#ff5a44', '#ff9a7a', '#ffe0d6'], size: 0.4, pattern: 'plain', cm: [4, 5], desc: '노을을 꼬리에 묻히고 다니는 가을 손님.' },
  { id: 'emperor-dragonfly', name: '왕잠자리', kind: 'dragonfly', spot: 'air', islands: [...MEADOW, 'mushroom'], tods: DAY, rarity: 2, price: 320,
    colors: ['#5fd06a', '#3a8fe0', '#d8ffe0'], size: 0.5, pattern: 'stripes', cm: [7, 8], desc: '하늘 순찰대장. 커다란 눈으로 모든 걸 봐요.' },
  { id: 'blue-damsel', name: '실잠자리', kind: 'damselfly', spot: 'air', islands: [...MEADOW, 'mushroom', 'coral'], tods: ['morning', 'day'], rarity: 2, price: 260,
    colors: ['#58c7ff', '#2c6fd0', '#e0f6ff'], size: 0.36, pattern: 'stripes', cm: [3, 4], desc: '바늘처럼 가느다란 몸으로 사뿐사뿐.' },
  { id: 'rainbow-dragonfly', name: '무지개잠자리', kind: 'dragonfly', spot: 'air', islands: ['coral'], tods: ['day', 'sunset'], rarity: 4, price: 2800,
    colors: ['#ff8fd0', '#7fe0ff', '#fff27a'], size: 0.46, pattern: 'rainbow', cm: [6, 8], desc: '산호 바다 위에서만 보이는 일곱 빛깔 꼬리.' },
  { id: 'aurora-dragonfly', name: '오로라잠자리', kind: 'dragonfly', spot: 'air', islands: ['ice'], tods: ['sunset', 'night'], rarity: 4, price: 3600,
    colors: ['#7ff0d0', '#8a7bff', '#e6fff8'], size: 0.46, pattern: 'iri', cm: [6, 8], desc: '얼음 하늘의 오로라가 잠자리 모양으로 내려왔대요.' },
  { id: 'meganeura', name: '고대 거대잠자리', kind: 'dragonfly', spot: 'air', islands: ['dino'], tods: DAY, rarity: 5, price: 15000, shy: 1.5,
    colors: ['#4a8a5a', '#c9a24a', '#e8ffd8'], size: 1.15, pattern: 'stripes', cm: [65, 75], desc: '공룡보다 먼저 하늘을 날았던 날개 달린 할아버지.' },
  { id: 'jungle-dragonfly', name: '정글청록잠자리', kind: 'dragonfly', spot: 'air', islands: ['dino'], tods: ['morning', 'day', 'sunset'], rarity: 2, price: 450,
    colors: ['#2fc9a8', '#1a6f6a', '#d8fff4'], size: 0.5, pattern: 'stripes', cm: [7, 9], desc: '정글 물웅덩이 위를 빙글빙글 도는 청록 화살.' },
  // ── 벌 ──
  { id: 'honeybee', name: '꿀벌', kind: 'bee', spot: 'flower', islands: [...MEADOW, 'mushroom', 'coral'], tods: DAY, rarity: 1, price: 150,
    colors: ['#ffc93d', '#5a3a26', '#ffffff'], size: 0.24, pattern: 'stripes', cm: [1, 2], desc: '오늘도 꽃가루 바구니를 꽉 채우는 중!' },
  { id: 'bumblebee', name: '호박벌', kind: 'bee', spot: 'flower', islands: ['home', 'islet', 'mushroom'], tods: ['morning', 'day', 'sunset'], rarity: 2, price: 320,
    colors: ['#ffd84a', '#2e2420', '#ff9a4a'], size: 0.3, pattern: 'stripes', cm: [2, 3], desc: '날개보다 몸이 훨씬 큰데 어떻게 나는지는 비밀.' },
  { id: 'hoverfly', name: '꽃등에', kind: 'bee', spot: 'flower', islands: [...MEADOW, 'coral', 'desert'], tods: DAY, rarity: 1, price: 130,
    colors: ['#ffb43d', '#3a2a22', '#ffffff'], size: 0.22, pattern: 'stripes', cm: [1, 2], desc: '벌 흉내를 내지만 침은 없어요. 공중에 딱 멈추는 게 특기.' },
  { id: 'blue-carpenter', name: '파랑뒤영벌', kind: 'bee', spot: 'flower', islands: ['coral', 'desert'], tods: DAY, rarity: 3, price: 1100,
    colors: ['#3a4a9a', '#7fd0ff', '#ffffff'], size: 0.3, pattern: 'stripes', cm: [2, 3], desc: '파란 줄무늬 털옷이 세련된 바닷가 멋쟁이.' },
  // ── 딱정벌레 ──
  { id: 'ladybug', name: '무당벌레', kind: 'ladybug', spot: 'flower', islands: [...MEADOW, 'mushroom'], tods: DAY, rarity: 1, price: 100,
    colors: ['#ff4a3a', '#2a2222', '#ffffff'], size: 0.2, pattern: 'spots', cm: [0.6, 0.9], desc: '빨간 등에 까만 점. 손에 올리면 행운이 와요.' },
  { id: 'seven-ladybug', name: '칠성무당벌레', kind: 'ladybug', spot: 'flower', islands: ['home', 'islet', 'coral'], tods: ['morning'], rarity: 2, price: 240,
    colors: ['#ff6a2a', '#2a2222', '#ffffff'], size: 0.21, pattern: 'spots', cm: [0.7, 0.9], desc: '점이 정확히 일곱 개! 세어 보세요.' },
  { id: 'yellow-ladybug', name: '노랑무당벌레', kind: 'ladybug', spot: 'flower', islands: ['home', 'mushroom', 'desert'], tods: DAY, rarity: 2, price: 280,
    colors: ['#ffd23a', '#5a3a22', '#ffffff'], size: 0.2, pattern: 'plain', cm: [0.4, 0.6], desc: '버섯 곰팡이를 냠냠 청소해 주는 노란 청소부.' },
  { id: 'heart-ladybug', name: '하트무당벌레', kind: 'ladybug', spot: 'flower', islands: ['islet', 'mushroom'], tods: ['morning', 'sunset'], rarity: 4, price: 3000, shy: 1.2,
    colors: ['#ff8fb8', '#ffffff', '#ffffff'], size: 0.22, pattern: 'spots', cm: [0.8, 1.0], desc: '분홍 등에 하얀 점. 고백할 때 데려가면 성공률 업!' },
  { id: 'rhino-beetle', name: '장수풍뎅이', kind: 'rhino', spot: 'tree', islands: ['home', 'islet', 'dino'], tods: LATE, rarity: 3, price: 1500,
    colors: ['#7a4a2e', '#3a241a', '#c98f55'], size: 0.42, pattern: 'plain', cm: [5, 8], desc: '힘자랑 대회 단골 우승자. 뿔이 반질반질해요.' },
  { id: 'hercules', name: '헤라클레스장수풍뎅이', kind: 'rhino', spot: 'tree', islands: ['dino'], tods: ['night'], rarity: 5, price: 20000, shy: 1.4,
    colors: ['#e8d48a', '#2a2222', '#fff4c8'], size: 0.62, pattern: 'spots', cm: [14, 17], desc: '정글의 왕. 노란 갑옷 위 까만 점이 훈장이래요.' },
  { id: 'stag-beetle', name: '사슴벌레', kind: 'stag', spot: 'tree', islands: ['home', 'islet', 'launch'], tods: LATE, rarity: 3, price: 1300,
    colors: ['#4a2e22', '#24160f', '#8a5a3a'], size: 0.4, pattern: 'plain', cm: [4, 7], desc: '집게 턱이 자랑인 숲속 기사.' },
  { id: 'giant-stag', name: '왕사슴벌레', kind: 'stag', spot: 'tree', islands: ['dino', 'home'], tods: ['night'], rarity: 4, price: 4200,
    colors: ['#2e2622', '#141010', '#6a5a4a'], size: 0.5, pattern: 'plain', cm: [6, 8], desc: '한 번 물면 놓지 않는 고집쟁이. 그래도 사실 순해요.' },
  { id: 'golden-stag', name: '황금사슴벌레', kind: 'stag', spot: 'tree', islands: ['dino', 'desert'], tods: ['night'], rarity: 5, price: 12000, shy: 1.4,
    colors: ['#ffd04a', '#c98a1a', '#fff4b0'], size: 0.46, pattern: 'iri', cm: [6, 8], desc: '온몸이 금빛으로 번쩍! 보물 상자에서 나왔다는 설이 있어요.' },
  { id: 'jewel-beetle', name: '비단벌레', kind: 'beetle', spot: 'tree', islands: ['home', 'dino', 'coral'], tods: DAY, rarity: 3, price: 1800,
    colors: ['#2fd07a', '#3a6aff', '#ff6a9a'], size: 0.3, pattern: 'iri', cm: [3, 4], desc: '보는 각도마다 색이 바뀌는 살아 있는 보석.' },
  { id: 'chafer', name: '풍뎅이', kind: 'beetle', spot: 'tree', islands: [...MEADOW, 'mushroom'], tods: DAY, rarity: 1, price: 160,
    colors: ['#5fc86a', '#2a6a3a', '#c8ffb0'], size: 0.26, pattern: 'plain', cm: [1.5, 2.5], desc: '초록 반짝 동글이. 날 때 붕붕 소리가 귀여워요.' },
  { id: 'silver-chafer', name: '은빛풍뎅이', kind: 'beetle', spot: 'tree', islands: ['launch'], tods: ['day', 'sunset'], rarity: 3, price: 1600,
    colors: ['#dfe6f0', '#8a96aa', '#ffffff'], size: 0.28, pattern: 'iri', cm: [2, 3], desc: '로켓 페인트를 뒤집어썼다는 소문의 은빛 풍뎅이.' },
  { id: 'firefly', name: '반딧불이', kind: 'firefly', spot: 'air', islands: ['home', 'islet', 'mushroom'], tods: ['night'], rarity: 2, price: 400,
    colors: ['#3a3030', '#ff8a5a', '#fff27a'], size: 0.22, pattern: 'glow', cm: [1, 1.5], desc: '꼬리에 작은 등불을 달고 밤 산책을 나와요.' },
  { id: 'galaxy-firefly', name: '은하반딧불이', kind: 'firefly', spot: 'air', islands: ['mushroom'], tods: ['night'], rarity: 4, price: 3800,
    colors: ['#2a2a4a', '#9a7bff', '#8ff0ff'], size: 0.24, pattern: 'glow', cm: [1, 1.5], desc: '푸른 빛으로 별자리를 그리며 날아요.' },
  { id: 'ice-firefly', name: '얼음반딧불이', kind: 'firefly', spot: 'air', islands: ['ice'], tods: ['sunset', 'night'], rarity: 4, price: 3400,
    colors: ['#3a4a6a', '#bfe8ff', '#c8fbff'], size: 0.24, pattern: 'glow', cm: [1, 1.5], desc: '차가운 하늘빛 등불. 만지면 살짝 시원해요.' },
  { id: 'lava-firefly', name: '불꽃반딧불이', kind: 'firefly', spot: 'air', islands: ['dino'], tods: ['sunset', 'night'], rarity: 3, price: 1500,
    colors: ['#3a2020', '#ff6a3a', '#ffb43a'], size: 0.24, pattern: 'glow', cm: [1.5, 2], desc: '화산 열기를 꼬리에 담아 온 따끈한 반딧불.' },
  { id: 'star-firefly', name: '별똥반딧불이', kind: 'firefly', spot: 'air', islands: ['launch'], tods: ['night'], rarity: 3, price: 1700,
    colors: ['#2a2a3a', '#ffd04a', '#fff8b0'], size: 0.23, pattern: 'glow', cm: [1, 1.5], desc: '발사대 위 밤하늘에서 떨어진 별 조각이래요.' },
  { id: 'dung-beetle', name: '소똥구리', kind: 'dungbeetle', spot: 'ground', islands: ['desert', 'home'], tods: DAY, rarity: 2, price: 450,
    colors: ['#3a3a4a', '#20202a', '#7a6a5a'], size: 0.3, pattern: 'plain', cm: [2, 3], desc: '영차영차! 자기보다 큰 공을 굴리는 힘센 친구.' },
  { id: 'pillbug', name: '공벌레', kind: 'pillbug', spot: 'rock', islands: [...MEADOW, 'mushroom', 'coral'], tods: ALL, rarity: 1, price: 90,
    colors: ['#8a96aa', '#5a6478', '#dfe6f0'], size: 0.28, pattern: 'stripes', cm: [1, 1.5], desc: '건드리면 데구루루 공이 되는 수줍음쟁이.' },
  // ── 매미 ──
  { id: 'cicada', name: '참매미', kind: 'cicada', spot: 'tree', islands: [...MEADOW], tods: DAY, rarity: 1, price: 150,
    colors: ['#5a6a4a', '#2a3226', '#a8e0a0'], size: 0.32, pattern: 'plain', cm: [3, 4], desc: '맴맴! 여름 노래 대회 개근상.' },
  { id: 'big-cicada', name: '말매미', kind: 'cicada', spot: 'tree', islands: ['home', 'islet', 'dino'], tods: ['day', 'sunset'], rarity: 2, price: 300,
    colors: ['#3a2e2a', '#1e1816', '#d8a86a'], size: 0.38, pattern: 'plain', cm: [4, 5], desc: '목청이 제일 큰 매미. 가까이 가면 귀가 멍~' },
  { id: 'evening-cicada', name: '쓰르라미', kind: 'cicada', spot: 'tree', islands: ['home', 'mushroom'], tods: ['sunset'], rarity: 2, price: 380,
    colors: ['#6a8a5a', '#3a4a2e', '#ffd8a0'], size: 0.3, pattern: 'plain', cm: [3, 4], desc: '해 질 녘에만 쓰르람 쓰르람 노래해요.' },
  // ── 메뚜기·풀벌레 ──
  { id: 'grasshopper', name: '메뚜기', kind: 'grasshopper', spot: 'ground', islands: [...MEADOW, 'coral'], tods: DAY, rarity: 1, price: 110,
    colors: ['#8ad05a', '#5a9a3a', '#e8ffb0'], size: 0.3, pattern: 'plain', cm: [3, 4], desc: '폴짝폴짝 뛰기 대장. 풀숲의 트램펄린 선수.' },
  { id: 'rice-grasshopper', name: '방아깨비', kind: 'grasshopper', spot: 'ground', islands: ['home', 'islet'], tods: ['day', 'sunset'], rarity: 1, price: 140,
    colors: ['#b8e070', '#7aa84a', '#ffe0a0'], size: 0.36, pattern: 'stripes', cm: [5, 8], desc: '뒷다리를 잡으면 방아를 찧듯 끄덕끄덕.' },
  { id: 'katydid', name: '여치', kind: 'grasshopper', spot: 'flower', islands: ['home', 'mushroom', 'dino'], tods: LATE, rarity: 2, price: 360,
    colors: ['#5ad07a', '#2a8a4a', '#d8ffe0'], size: 0.32, pattern: 'plain', cm: [3, 5], desc: '이파리 옷을 입은 저녁 바이올린 연주자.' },
  { id: 'cricket', name: '귀뚜라미', kind: 'grasshopper', spot: 'rock', islands: [...MEADOW, 'mushroom'], tods: ['night'], rarity: 2, price: 300,
    colors: ['#4a3a2e', '#2a201a', '#c8a07a'], size: 0.26, pattern: 'plain', cm: [2, 3], desc: '귀뚤귀뚤~ 바위 밑 밤 음악회의 주인공.' },
  { id: 'sand-hopper', name: '모래메뚜기', kind: 'grasshopper', spot: 'ground', islands: ['desert', 'coral'], tods: DAY, rarity: 1, price: 180,
    colors: ['#e8c88a', '#b08a5a', '#fff4d8'], size: 0.28, pattern: 'spots', cm: [2, 3], desc: '모래랑 똑같은 색이라 숨바꼭질 챔피언.' },
  // ── 사마귀 ──
  { id: 'mantis', name: '사마귀', kind: 'mantis', spot: 'flower', islands: [...MEADOW, 'mushroom'], tods: ['day', 'sunset'], rarity: 2, price: 420,
    colors: ['#7ad06a', '#4a9a4a', '#e8ffd0'], size: 0.4, pattern: 'plain', cm: [7, 9], desc: '두 손을 모으고 기도하는 척… 사실 간식을 기다리는 중.' },
  { id: 'orchid-mantis', name: '난초사마귀', kind: 'mantis', spot: 'flower', islands: ['coral', 'mushroom'], tods: DAY, rarity: 4, price: 3800, shy: 1.2,
    colors: ['#ffd6ea', '#ff9ac8', '#fff8fc'], size: 0.36, pattern: 'plain', cm: [5, 7], desc: '꽃인 줄 알았는데 눈을 깜빡! 세상에서 제일 예쁜 사마귀.' },
  { id: 'jungle-mantis', name: '정글대왕사마귀', kind: 'mantis', spot: 'tree', islands: ['dino'], tods: ['day', 'sunset'], rarity: 3, price: 1600,
    colors: ['#a8c84a', '#5a7a2a', '#fff0a0'], size: 0.52, pattern: 'plain', cm: [10, 13], desc: '공룡 발톱 흉내를 내는 정글의 쿵후 고수.' },
  // ── 개미·거미 ──
  { id: 'ant', name: '개미', kind: 'ant', spot: 'ground', islands: [...MEADOW, 'mushroom', 'coral'], tods: ['morning', 'day', 'sunset'], rarity: 1, price: 80,
    colors: ['#4a2e26', '#2a1a16', '#a86a4a'], size: 0.25, pattern: 'plain', cm: [0.5, 0.8], desc: '오늘도 영차영차 줄 서서 출근 중.' },
  { id: 'honeypot-ant', name: '꿀단지개미', kind: 'ant', spot: 'ground', islands: ['desert'], tods: ['sunset', 'night'], rarity: 3, price: 1200,
    colors: ['#c87a3a', '#6a3a22', '#ffcf4a'], size: 0.27, pattern: 'glow', cm: [1, 1.5], desc: '배에 꿀을 가득 저장한 걸어 다니는 꿀단지.' },
  { id: 'red-ant', name: '불개미', kind: 'ant', spot: 'ground', islands: ['dino', 'desert'], tods: DAY, rarity: 2, price: 220,
    colors: ['#e0523a', '#8a2a1a', '#ffb08a'], size: 0.25, pattern: 'plain', cm: [0.5, 0.8], desc: '화산 근처가 따뜻해서 좋대요.' },
  { id: 'orb-spider', name: '무당거미', kind: 'spider', spot: 'tree', islands: [...MEADOW, 'dino'], tods: ['day', 'sunset'], rarity: 2, price: 300,
    colors: ['#ffd23a', '#3a3a4a', '#ff7a5a'], size: 0.3, pattern: 'stripes', cm: [2, 3], desc: '줄무늬 레깅스를 신은 거미줄 건축가.' },
  { id: 'jumping-spider', name: '깡총거미', kind: 'spider', spot: 'rock', islands: [...MEADOW, 'coral', 'desert'], tods: DAY, rarity: 2, price: 360,
    colors: ['#3a3a4a', '#ffffff', '#5ac8ff'], size: 0.22, pattern: 'spots', cm: [0.6, 1], desc: '눈이 너무 커서 귀여움 반칙. 폴짝 뛰어 인사해요.' },
  { id: 'peacock-spider', name: '공작거미', kind: 'spider', spot: 'rock', islands: ['coral', 'islet'], tods: DAY, rarity: 4, price: 3600, shy: 1.3,
    colors: ['#3a6aff', '#ff5a3a', '#5ad0a0'], size: 0.22, pattern: 'rainbow', cm: [0.4, 0.6], desc: '알록달록 꼬리를 펼치며 춤추는 작은 댄서.' },
  // ── 달팽이·물 ──
  { id: 'snail', name: '달팽이', kind: 'snail', spot: 'rock', islands: [...MEADOW, 'mushroom'], tods: ['morning', 'day', 'night'], rarity: 1, price: 120,
    colors: ['#c89a6a', '#fff0d8', '#8a5a3a'], size: 0.3, pattern: 'stripes', cm: [2, 4], desc: '집을 등에 지고 느긋하게 여행 중.' },
  { id: 'rainbow-snail', name: '무지개달팽이', kind: 'snail', spot: 'rock', islands: ['mushroom', 'coral'], tods: ['morning', 'day'], rarity: 3, price: 1400,
    colors: ['#ff9ec4', '#e8f6ff', '#8fd8ff'], size: 0.32, pattern: 'rainbow', cm: [2, 4], desc: '비 온 뒤 무지개를 등껍질에 담아 왔어요.' },
  { id: 'strider', name: '소금쟁이', kind: 'strider', spot: 'water', islands: ['home', 'islet', 'mushroom', 'launch'], tods: ['morning', 'day', 'sunset'], rarity: 1, price: 130,
    colors: ['#5a5a6a', '#3a3a48', '#c8d8ff'], size: 0.3, pattern: 'plain', cm: [1, 2], desc: '물 위를 스케이트 타듯 쓱쓱. 발바닥 비결은 비밀.' },
  { id: 'sea-strider', name: '바다소금쟁이', kind: 'strider', spot: 'water', islands: ['coral', 'dino', 'desert'], tods: DAY, rarity: 3, price: 1500,
    colors: ['#3a7aaa', '#1e4a6a', '#bff0ff'], size: 0.3, pattern: 'iri', cm: [0.5, 1], desc: '넓은 바다 위를 달리는 세상에서 제일 작은 서퍼.' },
  // ── 섬 특산 ──
  { id: 'snowflake-bug', name: '눈결정벌레', kind: 'snowbug', spot: 'ground', islands: ['ice'], tods: ['morning', 'day', 'sunset'], rarity: 3, price: 1500,
    colors: ['#d8f2ff', '#8fc8ff', '#ffffff'], size: 0.3, pattern: 'iri', cm: [1, 2], desc: '등에 눈 결정을 하나씩 키워요. 똑같은 결정은 하나도 없대요.' },
  { id: 'crystal-bug', name: '수정결정벌레', kind: 'snowbug', spot: 'rock', islands: ['ice'], tods: ['night'], rarity: 4, price: 4400,
    colors: ['#c8b8ff', '#7a8aff', '#f0f8ff'], size: 0.32, pattern: 'glow', cm: [1.5, 2.5], desc: '밤이 되면 등의 결정이 별빛처럼 빛나요.' },
  { id: 'spore-bug', name: '버섯포자벌레', kind: 'sporebug', spot: 'ground', islands: ['mushroom'], tods: ['morning', 'day', 'sunset'], rarity: 2, price: 450,
    colors: ['#fff0dc', '#ff5a5a', '#ffffff'], size: 0.28, pattern: 'spots', cm: [1, 2], desc: '등에 작은 버섯 모자를 쓰고 포자를 퐁퐁 뿌려요.' },
  { id: 'glow-spore-bug', name: '반짝포자벌레', kind: 'sporebug', spot: 'rock', islands: ['mushroom'], tods: ['night'], rarity: 4, price: 3900,
    colors: ['#f0e8ff', '#7a8aff', '#8ff0ff'], size: 0.3, pattern: 'glow', cm: [1, 2], desc: '밤이면 모자의 점들이 반짝반짝 빛나요.' },
  { id: 'golden-spore-bug', name: '황금포자벌레', kind: 'sporebug', spot: 'tree', islands: ['mushroom'], tods: ['sunset'], rarity: 5, price: 11000, shy: 1.4,
    colors: ['#fff4d8', '#ffc83a', '#fff8c0'], size: 0.32, pattern: 'spots', cm: [2, 3], desc: '황금 버섯 모자를 쓴 버섯 숲의 왕자님.' },
  { id: 'desert-scorpion', name: '사막전갈', kind: 'scorpion', spot: 'rock', islands: ['desert'], tods: ['day', 'sunset'], rarity: 2, price: 600,
    colors: ['#e8b86a', '#a8783a', '#fff0c8'], size: 0.36, pattern: 'plain', cm: [6, 9], desc: '집게를 번쩍! 무섭게 보이고 싶은 수줍은 모래 친구.' },
  { id: 'emperor-scorpion', name: '황제전갈', kind: 'scorpion', spot: 'ground', islands: ['desert', 'dino'], tods: ['night'], rarity: 4, price: 4800, shy: 1.2,
    colors: ['#3a3a5a', '#1e1e30', '#8ff0ff'], size: 0.46, pattern: 'glow', cm: [15, 20], desc: '달빛 아래에서 푸르게 빛나는 사막의 황제.' },
  { id: 'pink-scorpion', name: '분홍꼬마전갈', kind: 'scorpion', spot: 'ground', islands: ['desert', 'coral'], tods: DAY, rarity: 3, price: 1400,
    colors: ['#ffb0c8', '#e07aa0', '#fff0f6'], size: 0.3, pattern: 'plain', cm: [3, 5], desc: '꼬리 끝이 하트 모양처럼 동글동글.' },
  { id: 'caterpillar', name: '애벌레', kind: 'caterpillar', spot: 'flower', islands: [...MEADOW, 'mushroom'], tods: ['morning', 'day'], rarity: 1, price: 90,
    colors: ['#9ae06a', '#5ab04a', '#ffe46a'], size: 0.3, pattern: 'spots', cm: [2, 4], desc: '잎을 냠냠. 언젠가 멋진 나비가 될 거예요.' },
  { id: 'swallowtail-larva', name: '호랑애벌레', kind: 'caterpillar', spot: 'tree', islands: ['home', 'dino'], tods: DAY, rarity: 2, price: 260,
    colors: ['#7ad07a', '#2a2a2a', '#ffd04a'], size: 0.32, pattern: 'stripes', cm: [3, 5], desc: '머리에 가짜 눈을 그려 넣은 꾀돌이 애벌레.' },
  { id: 'jungle-beetle', name: '정글무지개풍뎅이', kind: 'beetle', spot: 'tree', islands: ['dino'], tods: ['day', 'sunset'], rarity: 3, price: 1900,
    colors: ['#ff5a8a', '#3ad0a0', '#ffd04a'], size: 0.34, pattern: 'rainbow', cm: [3, 5], desc: '정글 꽃 색을 다 모아 등에 칠한 멋쟁이.' },
  { id: 'ice-ladybug', name: '눈꽃무당벌레', kind: 'ladybug', spot: 'rock', islands: ['ice'], tods: DAY, rarity: 3, price: 1300,
    colors: ['#bfe6ff', '#ffffff', '#ffffff'], size: 0.22, pattern: 'spots', cm: [0.6, 0.9], desc: '하늘색 등에 눈꽃 점. 겨울잠을 안 자는 씩씩이.' },
  { id: 'coconut-beetle', name: '야자풍뎅이', kind: 'beetle', spot: 'tree', islands: ['coral', 'desert'], tods: ['sunset', 'night'], rarity: 2, price: 520,
    colors: ['#c8783a', '#6a3a1a', '#ffe0a0'], size: 0.3, pattern: 'stripes', cm: [2, 3], desc: '야자 열매 냄새를 좋아하는 열대의 동글이.' },
];

export const INSECTS: BugSpecies[] = rows.map((r) => ({
  ...r,
  id: 'bug-' + r.id,
  category: 'bug',
  habitat: `${r.islands.map(islandName).join('·')} / ${spotName(r.spot)} / ${r.tods.map(todName).join('·')}`,
}));

export function islandName(i: BugIsland): string {
  return { home: '시작 섬', dino: '공룡 섬', ice: '얼음 섬', mushroom: '버섯 요정 섬', coral: '산호 섬', desert: '사막 섬', launch: '발사대 섬', islet: '보물 섬' }[i];
}
export function spotName(s: BugSpot): string {
  return { flower: '꽃 위', tree: '나무 그루터기', rock: '바위 옆', ground: '땅 위', water: '물 위', air: '하늘' }[s];
}
export function todName(t: BugTod): string {
  return { morning: '아침', day: '낮', sunset: '저녁', night: '밤' }[t];
}

/** 섬 id(islet-a 등) → 테마 */
export function themeOf(islandId: string | null): BugIsland | null {
  if (!islandId) return null;
  if (islandId.startsWith('islet')) return 'islet';
  return islandId as BugIsland;
}

export const INSECT_BY_ID = new Map(INSECTS.map((s) => [s.id, s]));
