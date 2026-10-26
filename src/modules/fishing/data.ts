// 낚시 도감 데이터 — 물고기·수생생물. 도감·상점이 읽는다.
import type { Species } from '../../core/state';

export type Habitat = 'river' | 'lake' | 'pond' | 'coast' | 'reef' | 'offshore' | 'deep' | 'ice' | 'oasis' | 'hotspring';
export type FishTime = 'all' | 'day' | 'night' | 'morning' | 'evening';
export type FishShape =
  | 'round' | 'long' | 'tall' | 'flatfish' | 'puffer' | 'box' | 'ray' | 'shark' | 'whaleshark' | 'eel'
  | 'seahorse' | 'octopus' | 'squid' | 'crab' | 'shrimp' | 'jelly' | 'turtle' | 'sunfish' | 'tadpole' | 'star' | 'angler';
export type FishPattern = 'none' | 'stripe' | 'spots' | 'grad' | 'band';

export interface FishLook {
  shape: FishShape;
  /** 등 · 배 · 포인트(무늬·지느러미) */
  colors: [string, string, string];
  pattern: FishPattern;
  /** 화려한 꼬리(금붕어·베타) */
  fancy?: boolean;
  whiskers?: boolean;
  claws?: boolean;
  glow?: boolean;
  clear?: boolean;
  bill?: boolean;
  wings?: boolean;
}

export interface FishSpecies extends Species {
  hab: Habitat[];
  time: FishTime;
  /** 크기 범위(cm) */
  size: [number, number];
  look: FishLook;
}

export const HABITAT_NAME: Record<Habitat, string> = {
  river: '강', lake: '호수', pond: '연못', coast: '해안', reef: '산호초', offshore: '먼바다',
  deep: '심해', ice: '얼음 구멍', oasis: '오아시스', hotspring: '화산 온천',
};
const TIME_NAME: Record<FishTime, string> = { all: '하루 종일', day: '낮', night: '밤', morning: '아침', evening: '저녁' };

const BASE_PRICE = [0, 90, 320, 1200, 4500, 15000];

type Row = [id: string, name: string, rarity: number, hab: string, time: FishTime, size: [number, number],
  shape: FishShape, colors: [string, string, string], pattern: FishPattern, desc: string, extra?: Partial<FishLook>];

// prettier-ignore
const ROWS: Row[] = [
  // ── 강 · 호수 · 연못 ──
  ['pirami', '피라미', 1, 'river', 'all', [8, 15], 'long', ['#9fc4e6', '#f6fbff', '#ff9db8'], 'stripe', '강의 꼬마 달리기 선수. 수컷은 분홍 줄무늬로 멋을 낸다.'],
  ['songsari', '송사리', 1, 'river,pond', 'day', [3, 5], 'long', ['#cfe2b8', '#fffbe8', '#9cc8e8'], 'grad', '작아도 친구들이랑 몰려다니면 하나도 안 무서워!'],
  ['bungeo', '붕어', 1, 'river,lake,pond', 'all', [15, 30], 'round', ['#c7b072', '#f6ecc8', '#e8c27a'], 'grad', '동글동글 붕어빵의 원조 모델.'],
  ['ingeo', '잉어', 2, 'river,lake', 'all', [40, 80], 'round', ['#d4a84e', '#f8e8b8', '#f0b860'], 'grad', '물속 동네 할아버지. 멋진 수염이 자랑이다.', { whiskers: true }],
  ['koi', '비단잉어', 3, 'pond', 'all', [40, 70], 'round', ['#ffffff', '#fff8f0', '#ff6a48'], 'spots', '연못의 아이돌. 무늬가 하나도 똑같지 않다.', { whiskers: true }],
  ['megi', '메기', 2, 'river,lake', 'night', [40, 90], 'long', ['#7d7a6a', '#d8d2bc', '#5a5648'], 'grad', '수염으로 세상을 더듬는 느긋한 밤의 탐정.', { whiskers: true }],
  ['ssogari', '쏘가리', 3, 'river', 'evening', [25, 45], 'round', ['#e0bc62', '#faf0cc', '#7a5530'], 'spots', '강의 호랑이. 표범 무늬 옷이 잘 어울린다.'],
  ['euneo', '은어', 2, 'river', 'day', [15, 25], 'long', ['#a8cbc6', '#f4faf4', '#ffd24a'], 'grad', '수박 향기가 나는 은빛 물고기.'],
  ['sancheoneo', '산천어', 3, 'river', 'morning', [20, 35], 'long', ['#8fb0a6', '#f6f0e4', '#f28ca6'], 'spots', '맑은 계곡에서만 사는 깔끔쟁이.'],
  ['yeoneo', '연어', 3, 'river,coast', 'all', [60, 90], 'long', ['#8ea8c0', '#fbf2ec', '#ff8a6a'], 'band', '먼 바다를 돌고 고향 강으로 돌아온 효자.'],
  ['rainbow-trout', '무지개송어', 2, 'lake,river', 'all', [30, 60], 'long', ['#86ad92', '#fff2ea', '#ff8fb6'], 'band', '옆구리에 무지개 띠를 두른 멋쟁이.'],
  ['sturgeon', '철갑상어', 4, 'river', 'night', [100, 200], 'shark', ['#8f9dab', '#eef2f4', '#6c7a88'], 'none', '공룡 시대부터 살았다. 등에 갑옷 단추가 있다.'],
  ['ppaga', '동자개', 2, 'river', 'night', [15, 30], 'long', ['#d4aa58', '#f8eac8', '#7a5530'], 'spots', '"빠가빠가!" 하고 우는 수다쟁이.', { whiskers: true }],
  ['gajae', '가재', 1, 'river,pond', 'all', [8, 12], 'shrimp', ['#c8664a', '#f6c6a8', '#8a3a2a'], 'band', '집게를 번쩍! 강가의 작은 기사.', { claws: true }],
  ['jara', '자라', 3, 'river,pond', 'day', [20, 35], 'turtle', ['#8aa86a', '#f2e8c8', '#5f7a4a'], 'spots', '목을 쏙 넣었다 빼꼼. 낯을 좀 가린다.'],
  ['golden-carp', '황금잉어', 5, 'lake,pond', 'morning', [60, 100], 'round', ['#ffd84a', '#fff6c8', '#ffa53a'], 'grad', '아침 이슬에 반짝이는 전설의 잉어. 보면 소원이 이뤄진대.', { whiskers: true, fancy: true }],
  ['bluegill', '블루길', 1, 'lake', 'all', [10, 20], 'tall', ['#6f9fc0', '#ffd8a0', '#3a5a80'], 'grad', '파란 귀를 단 호수의 장난꾸러기.'],
  ['bass', '배스', 2, 'lake', 'all', [30, 50], 'long', ['#88a462', '#eef2da', '#4f6a3a'], 'stripe', '입이 엄청 크다. 웃을 때도 크다.'],
  ['gamulchi', '가물치', 3, 'lake,pond', 'night', [50, 80], 'eel', ['#667458', '#ded8c0', '#3a3a2a'], 'spots', '물 밖에서도 숨을 쉬는 연못의 대장.'],
  ['goldfish', '금붕어', 1, 'pond', 'all', [5, 12], 'round', ['#ff8a4a', '#ffd6a6', '#ffb070'], 'grad', '하늘하늘 꼬리로 인사하는 연못 친구.', { fancy: true }],
  ['ranchu', '난주', 2, 'pond', 'day', [8, 15], 'round', ['#ff6a3a', '#fff2e4', '#ffffff'], 'spots', '머리에 혹 모자를 쓴 금붕어 귀족.', { fancy: true }],
  ['tadpole', '올챙이', 1, 'pond', 'morning', [2, 4], 'tadpole', ['#5a6a5a', '#b8c4a8', '#3a4a3a'], 'grad', '언젠가 개구리가 될 꼬물꼬물 꼬마.'],
  ['bullfrog-tadpole', '황소올챙이', 2, 'lake', 'evening', [8, 14], 'tadpole', ['#7a8a4a', '#e8e0b0', '#4a5a2a'], 'spots', '올챙이인데 벌써 덩치가 형님급.'],
  // ── 오아시스 ──
  ['piranha', '피라냐', 3, 'oasis', 'day', [20, 30], 'round', ['#a4adb6', '#ff8a6a', '#ff5a48'], 'grad', '이빨은 날카롭지만 사실 겁쟁이래.'],
  ['angelfish', '엔젤피시', 2, 'oasis', 'day', [10, 15], 'tall', ['#f6f2e2', '#fffcf2', '#3a3a52'], 'stripe', '천사 날개 같은 지느러미를 가졌다.'],
  ['discus', '디스커스', 3, 'oasis', 'evening', [15, 20], 'tall', ['#ff9a5a', '#ffd6a8', '#4aa6e0'], 'stripe', '동그란 접시처럼 생긴 열대의 왕.'],
  ['guppy', '구피', 1, 'oasis', 'all', [3, 6], 'long', ['#a6d4ff', '#ffffff', '#ff7ab6'], 'grad', '꼬리가 몸보다 화려한 패션 리더.', { fancy: true }],
  ['neon-tetra', '네온테트라', 1, 'oasis', 'night', [2, 4], 'long', ['#4acaff', '#fff4f4', '#ff4a6a'], 'band', '밤에 더 반짝이는 작은 네온사인.', { glow: true }],
  ['arowana', '아로와나', 4, 'oasis', 'morning', [60, 90], 'long', ['#ecd4a2', '#fff8e4', '#ffb84a'], 'grad', '용을 닮은 황금빛 비늘. 행운을 부른다.', { whiskers: true }],
  ['pirarucu', '피라루쿠', 5, 'oasis', 'evening', [150, 300], 'long', ['#6e7e6a', '#ffcaa8', '#ff5a48'], 'grad', '사막 오아시스의 전설. 꼬리 비늘이 빨간 보석처럼 빛난다.'],
  ['betta', '베타', 2, 'oasis', 'all', [5, 8], 'round', ['#6a7aff', '#ccd4ff', '#ff6ab6'], 'grad', '드레스 자락 같은 지느러미의 무도회 주인공.', { fancy: true }],
  ['pupfish', '사막송사리', 2, 'oasis', 'day', [3, 5], 'long', ['#6aa6ff', '#eaf2ff', '#ffd84a'], 'grad', '뜨거운 사막 웅덩이에서도 씩씩하게 산다.'],
  // ── 해안 ──
  ['godeungeo', '고등어', 1, 'coast', 'all', [25, 40], 'long', ['#4a8cb6', '#f6faff', '#2a4a6e'], 'stripe', '등에 파도 무늬를 그린 바다의 국민 생선.'],
  ['jeongaengi', '전갱이', 1, 'coast', 'all', [15, 30], 'long', ['#a4bccc', '#f6faff', '#ffe08a'], 'band', '노란 줄이 반짝 지나가는 바다 달리기 선수.'],
  ['sardine', '정어리', 1, 'coast', 'morning', [10, 20], 'long', ['#6a9cca', '#ffffff', '#3a5a8a'], 'spots', '혼자보다 수천 마리가 함께일 때 더 멋지다.'],
  ['ureok', '우럭', 2, 'coast', 'night', [25, 45], 'round', ['#7a7464', '#e2dac8', '#4a4438'], 'spots', '바위틈에서 졸다가 미끼만 보면 번쩍.'],
  ['gwangeo', '광어', 2, 'coast', 'all', [40, 80], 'flatfish', ['#a89a76', '#ffffff', '#6a5a40'], 'spots', '눈이 한쪽에 몰려 있다. 왼쪽이 광어!'],
  ['gajami', '가자미', 2, 'coast', 'all', [20, 40], 'flatfish', ['#b4a282', '#ffffff', '#8a7454'], 'spots', '눈이 오른쪽에 몰려 있다. 모래 숨바꼭질 챔피언.'],
  ['chamdom', '참돔', 3, 'coast', 'morning', [40, 70], 'tall', ['#ff9aa6', '#fff2f2', '#6ac6ff'], 'spots', '분홍 몸에 하늘색 점. 바다의 공주님.'],
  ['nongeo', '농어', 2, 'coast', 'evening', [50, 90], 'long', ['#a4b4bc', '#fafafa', '#6a7a88'], 'grad', '저녁 물때에 힘차게 뛰어오르는 은빛 검객.'],
  ['bok', '복어', 2, 'coast', 'all', [15, 30], 'puffer', ['#f2d684', '#fffaf0', '#6a5a3a'], 'spots', '화나면 빵빵! 사실은 부끄러워서 그런 거래.'],
  ['jwichi', '쥐치', 1, 'coast', 'day', [15, 25], 'tall', ['#ccbc8e', '#f4ecd4', '#8a7a5a'], 'grad', '쥐포가 되기 싫은 바다의 쥐돌이.'],
  ['muneo', '문어', 3, 'coast', 'night', [40, 90], 'octopus', ['#ff8a7a', '#ffd6c8', '#d85a5a'], 'spots', '여덟 팔로 동시에 하이파이브 가능.'],
  ['kkotge', '꽃게', 2, 'coast', 'all', [15, 25], 'crab', ['#8a80d6', '#f2eaff', '#ff8a5a'], 'grad', '보라색 등딱지가 자랑인 옆걸음 멋쟁이.', { claws: true }],
  ['saewoo', '보리새우', 1, 'coast', 'night', [10, 20], 'shrimp', ['#ffb4a2', '#fff0e8', '#ff7a6a'], 'band', '톡톡 튀는 꼬리로 뒤로 슝!'],
  ['haema', '해마', 3, 'coast,reef', 'day', [8, 15], 'seahorse', ['#ffcf6a', '#fff2c8', '#ff9a4a'], 'band', '아빠가 아기를 품는 바다의 말.'],
  ['ojingeo', '오징어', 2, 'coast', 'night', [20, 40], 'squid', ['#ffc8b4', '#fff4ee', '#ff8a7a'], 'spots', '불빛만 보면 신이 나서 몰려든다.'],
  ['galchi', '갈치', 3, 'coast', 'night', [80, 150], 'eel', ['#e6eef8', '#ffffff', '#b8c8dc'], 'grad', '은빛 칼처럼 반짝. 서서 헤엄친다.'],
  ['bungjang', '붕장어', 2, 'coast', 'night', [40, 80], 'eel', ['#8c7c5c', '#f2e8d0', '#ffffff'], 'spots', '모래에서 쏙 고개만 내밀고 구경한다.'],
  ['moon-jelly', '보름달물해파리', 1, 'coast', 'all', [10, 30], 'jelly', ['#f0e8ff', '#ffffff', '#c8a8ff'], 'none', '머리에 네잎클로버가 그려진 둥실둥실 친구.', { clear: true }],
  ['starfish', '별불가사리', 1, 'coast', 'day', [8, 15], 'star', ['#ff9a5a', '#ffd6a8', '#ff6a48'], 'spots', '바닷가에 떨어진 별. 소원은 안 들어준다.'],
  ['sea-urchin', '성게', 2, 'coast', 'night', [5, 10], 'puffer', ['#6a4a8a', '#a88ac8', '#3a2a5a'], 'none', '가시투성이지만 마음은 말랑말랑.'],
  // ── 산호초 ──
  ['clownfish', '흰동가리', 2, 'reef', 'day', [6, 11], 'round', ['#ff8a3a', '#ffb070', '#ffffff'], 'stripe', '말미잘 집에 사는 줄무늬 꼬마.'],
  ['blue-tang', '블루탱', 2, 'reef', 'day', [15, 30], 'tall', ['#3a7aff', '#7ab6ff', '#ffd84a'], 'grad', '깜빡깜빡 잘 잊어버리지만 늘 웃는다.'],
  ['butterflyfish', '나비고기', 2, 'reef', 'day', [10, 20], 'tall', ['#ffe04a', '#fff8d4', '#2a2a3a'], 'band', '산호 사이를 팔랑팔랑 나는 바다 나비.'],
  ['lionfish', '쏠배감펭', 3, 'reef', 'night', [20, 35], 'round', ['#ffb4a2', '#ffffff', '#c84a3a'], 'stripe', '갈기 같은 지느러미를 펼친 바다의 사자.', { wings: true }],
  ['parrotfish', '앵무고기', 3, 'reef', 'day', [30, 60], 'round', ['#6ad6c4', '#b4f4e4', '#ff8ad4'], 'grad', '산호를 오독오독 먹고 하얀 모래를 만든다.'],
  ['moray', '곰치', 3, 'reef', 'night', [80, 150], 'eel', ['#dcc44e', '#f8ecb0', '#4a3a2a'], 'spots', '무섭게 생겼다고? 웃으면 꽤 귀엽다.'],
  ['stingray', '노랑가오리', 3, 'reef,coast', 'all', [50, 100], 'ray', ['#d0a87c', '#fff4e6', '#a07a54'], 'spots', '모래 이불을 덮고 낮잠 자는 납작이.'],
  ['sea-turtle', '바다거북', 4, 'reef', 'day', [60, 100], 'turtle', ['#8ab46e', '#f4ecc8', '#5a7a44'], 'spots', '백 년 동안 바다를 여행한 느긋한 할머니.'],
  ['manta', '만타가오리', 5, 'reef,offshore', 'night', [300, 500], 'ray', ['#3e4e72', '#ffffff', '#24304e'], 'none', '바다를 나는 커다란 담요. 만나면 그날은 행운의 날!'],
  ['cleaner-wrasse', '청소놀래기', 1, 'reef', 'day', [5, 10], 'long', ['#6ab6ff', '#ffffff', '#2a2a4a'], 'band', '친구들 이빨을 닦아 주는 바다 치과 의사.'],
  ['boxfish', '거북복', 2, 'reef', 'day', [10, 20], 'box', ['#ffe04a', '#fff8d0', '#2a2a3a'], 'spots', '네모네모 상자 모양. 헤엄이 서툴러도 괜찮아.'],
  ['mandarin', '만다린피시', 4, 'reef', 'evening', [5, 8], 'round', ['#3a8aff', '#ff9a4a', '#4ad6a0'], 'stripe', '물감을 엎지른 듯한 산호초의 화가.', { fancy: true }],
  ['nudibranch', '갯민숭달팽이', 3, 'reef', 'day', [3, 8], 'tadpole', ['#a07aff', '#ffffff', '#ffd84a'], 'spots', '바닷속 젤리 과자 같은 달팽이.'],
  // ── 먼바다 ──
  ['sunfish', '개복치', 4, 'offshore', 'day', [100, 250], 'sunfish', ['#a8bacb', '#f2f6fa', '#7a8ca0'], 'grad', '깜짝 놀라면 기절한다는 소문의 주인공.'],
  ['tuna', '참다랑어', 4, 'offshore', 'all', [100, 250], 'long', ['#2a4c80', '#eef4fa', '#ffd84a'], 'grad', '평생 쉬지 않고 헤엄치는 바다 마라토너.'],
  ['skipjack', '가다랑어', 2, 'offshore', 'day', [40, 80], 'long', ['#3a5c90', '#f2f6fa', '#4a6aa0'], 'stripe', '배에 줄무늬 네 개. 가쓰오부시가 되기 싫어.'],
  ['flyingfish', '날치', 2, 'offshore', 'day', [20, 35], 'long', ['#6ab6ff', '#f4faff', '#a8dcff'], 'grad', '지느러미 날개로 파도 위를 활공한다.', { wings: true }],
  ['mahimahi', '만새기', 3, 'offshore', 'day', [60, 120], 'long', ['#4ad6a6', '#ffe86a', '#3a9aff'], 'grad', '이마가 넓적한 무지갯빛 바다 무지개.'],
  ['marlin', '청새치', 4, 'offshore', 'day', [200, 350], 'long', ['#2a5ca6', '#f0f6ff', '#5a9aff'], 'stripe', '뾰족한 코로 파도를 가르는 바다의 기사.', { bill: true }],
  ['shark', '백상아리', 4, 'offshore', 'all', [200, 400], 'shark', ['#8c9db4', '#ffffff', '#6a7a90'], 'none', '이빨은 무서워도 웃는 얼굴은 귀엽다.'],
  ['hammerhead', '귀상어', 4, 'offshore', 'evening', [150, 300], 'shark', ['#9aa6b0', '#f6f8fa', '#7a8690'], 'none', '망치 머리 덕분에 시야가 넓다. 자랑이 많다.'],
  ['whale-shark', '고래상어', 5, 'offshore', 'day', [600, 1000], 'whaleshark', ['#4a6c9e', '#f2f6ff', '#ffffff'], 'spots', '바다에서 가장 큰 물고기. 플랑크톤만 먹는 순둥이.'],
  ['oarfish', '산갈치', 5, 'deep,offshore', 'night', [300, 800], 'eel', ['#e8f0ff', '#ffffff', '#ff6a8a'], 'grad', '빨간 볏을 단 은빛 리본. 용궁의 사신이래.'],
  // ── 심해 ──
  ['anglerfish', '아귀', 3, 'deep', 'night', [40, 100], 'angler', ['#7a6a7a', '#c8b8c0', '#ffe86a'], 'spots', '머리 위 등불로 길을 밝히는 심해 가로등.'],
  ['lantern-angler', '초롱아귀', 4, 'deep', 'night', [10, 30], 'angler', ['#3e3e62', '#8a8ab4', '#7affe8'], 'none', '파란 초롱을 들고 다니는 심해 꼬마 등대지기.', { glow: true }],
  ['deep-jelly', '무지개빗해파리', 3, 'deep', 'night', [5, 15], 'jelly', ['#b4a0ff', '#ffffff', '#7affd6'], 'none', '몸에서 무지개 불빛이 줄줄이 흐른다.', { clear: true, glow: true }],
  ['giant-squid', '대왕오징어', 5, 'deep', 'night', [600, 1300], 'squid', ['#ff8a74', '#ffe0d4', '#c84a4a'], 'spots', '심해의 거인. 눈이 축구공만 하다!'],
  ['dumbo', '덤보문어', 4, 'deep', 'all', [20, 30], 'octopus', ['#ffb4c8', '#fff0f4', '#ff8ab0'], 'none', '귀 같은 지느러미로 팔랑팔랑 나는 심해의 아기 코끼리.', { wings: true }],
  ['barreleye', '통안어', 4, 'deep', 'night', [10, 15], 'long', ['#8a9aaa', '#d8e4ee', '#7affb4'], 'none', '투명한 머리 속으로 초록 눈이 보인다.', { clear: true }],
  ['coelacanth', '실러캔스', 5, 'deep', 'all', [120, 180], 'round', ['#4a5c8c', '#8aa2cc', '#e8f0ff'], 'spots', '4억 년 동안 모습을 바꾸지 않은 살아 있는 화석.'],
  ['deep-shrimp', '심해새우', 1, 'deep', 'all', [5, 10], 'shrimp', ['#ff5a4a', '#ffb4a2', '#c83a2a'], 'band', '깜깜한 바다에서는 빨간색이 투명 망토다.'],
  ['blobfish', '블롭피시', 3, 'deep', 'all', [20, 30], 'round', ['#ffb4b4', '#ffd8d4', '#ff8a8a'], 'none', '세상에서 가장 못생겼다고? 볼수록 정 드는 얼굴.'],
  ['dragonfish', '용치', 4, 'deep', 'night', [15, 40], 'eel', ['#2a2a4a', '#5a5a8a', '#ff6ae0'], 'spots', '몸에 보석 같은 발광점을 박은 심해 용.', { glow: true }],
  // ── 얼음 구멍 ──
  ['bingeo', '빙어', 1, 'ice', 'all', [8, 15], 'long', ['#cfe6ff', '#ffffff', '#a8d0f0'], 'none', '속이 훤히 비치는 겨울의 요정.', { clear: true }],
  ['arctic-char', '북극곤들매기', 2, 'ice', 'day', [30, 60], 'long', ['#6e8ea4', '#ffb4a2', '#ffe0d8'], 'spots', '얼음 아래서 분홍 배를 숨긴 수줍은 물고기.'],
  ['daegu', '대구', 2, 'ice', 'all', [50, 90], 'round', ['#ac9e7e', '#faf2e2', '#7a6a4a'], 'spots', '입이 커서 대구! 탕으로 유명하지만 쉿.', { whiskers: true }],
  ['clione', '클리오네', 3, 'ice', 'night', [2, 4], 'tadpole', ['#eaf4ff', '#ffffff', '#ff8a5a'], 'none', '날개로 팔랑이는 얼음 바다의 천사.', { clear: true, wings: true }],
  ['king-crab', '킹크랩', 3, 'ice', 'all', [60, 120], 'crab', ['#ff6a4a', '#ffd0b4', '#c84a3a'], 'spots', '가시 갑옷을 입은 얼음 바다의 왕.', { claws: true }],
  ['icefish', '얼음물고기', 4, 'ice', 'night', [30, 50], 'long', ['#eef6ff', '#ffffff', '#c8e0ff'], 'none', '피까지 투명한 남극의 신비한 물고기.', { clear: true }],
  ['snow-crab', '대게', 3, 'ice,deep', 'all', [50, 80], 'crab', ['#ff9a6a', '#fff0e0', '#e86a4a'], 'grad', '다리가 대나무처럼 길쭉. 겨울 별미 협회장.', { claws: true }],
  ['aurora-trout', '오로라송어', 5, 'ice', 'night', [60, 90], 'long', ['#7affd6', '#e6d6ff', '#ff8aff'], 'grad', '오로라가 뜨는 밤에만 얼음 구멍으로 찾아온다.', { glow: true }],
  ['ice-seal-pup', '얼음 해파리', 2, 'ice', 'morning', [10, 20], 'jelly', ['#d4f0ff', '#ffffff', '#8ad4ff'], 'none', '살얼음처럼 반짝이는 차가운 우산.', { clear: true }],
  // ── 화산 온천 ──
  ['doctor-fish', '닥터피시', 1, 'hotspring', 'all', [3, 8], 'long', ['#ccbca4', '#f8f0e4', '#8a7a64'], 'grad', '발을 콕콕 간지럽히는 온천 마사지사.'],
  ['lava-medaka', '용암송사리', 2, 'hotspring', 'night', [4, 8], 'long', ['#ff8a4a', '#ffe0b4', '#ff4a2a'], 'grad', '꼬리에 작은 불씨가 반짝인다.', { glow: true }],
  ['onsen-turtle', '온천거북', 3, 'hotspring', 'day', [25, 45], 'turtle', ['#d4a46a', '#fff0d0', '#a86a3a'], 'spots', '머리에 수건을 얹고 반신욕을 즐긴다.'],
  ['flame-carp', '불꽃잉어', 4, 'hotspring', 'evening', [50, 80], 'round', ['#ff5a3a', '#ffd84a', '#ffb43a'], 'grad', '지느러미가 불꽃처럼 일렁이는 뜨거운 녀석.', { glow: true, whiskers: true }],
  ['volcano-eel', '화산장어', 3, 'hotspring', 'night', [50, 90], 'eel', ['#4a3a3a', '#8a6a5a', '#ff6a3a'], 'band', '몸에 용암 줄무늬가 흐른다.', { glow: true }],
  ['onsen-shrimp', '온천새우', 2, 'hotspring', 'all', [5, 10], 'shrimp', ['#ff9a6a', '#ffe0c8', '#ff6a3a'], 'band', '따끈따끈 익은 것 같지만 원래 이 색이다.'],
  ['phoenix-goldfish', '불사조금붕어', 5, 'hotspring', 'night', [20, 40], 'round', ['#ff4a3a', '#ffe04a', '#ffb43a'], 'grad', '용암 온천에서 태어났다는 전설의 금붕어. 꼬리가 불꽃이다.', { fancy: true, glow: true }],
  ['hot-crab', '온천게', 1, 'hotspring', 'day', [5, 10], 'crab', ['#ff8a6a', '#fff0e0', '#ff5a3a'], 'grad', '뜨끈한 물에 몸을 담그고 집게로 브이.', { claws: true }],
];

// 칙칙한 회색·은색 종을 파스텔 청회·민트회로, 회색 배는 맑은 흰색으로(실루엣은 그대로, 색만 밝게)
function pastelize(cs: [string, string, string], seed: number): [string, string, string] {
  const hx = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
  const hsl2rgb = (h: number, s: number, l: number) => {
    const f = (n: number) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)];
  };
  return cs.map((c, i) => {
    const [r, g, b] = hx(c); const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2, sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    if (sat > 0.2 || l < 0.12) return c;
    if (i === 1) return l > 0.5 ? '#f6fbff' : c;
    const hue = seed % 2 ? 0.55 : 0.45; // 청회 / 민트회
    const [rr, gg, bb] = hsl2rgb(hue, 0.38, Math.max(l, 0.6));
    return toHex(rr, gg, bb);
  }) as [string, string, string];
}

export const FISH: FishSpecies[] = ROWS.map(([id, name, rarity, hab, time, size, shape, colors, pattern, desc, extra]) => {
  const habs = hab.split(',') as Habitat[];
  const price = Math.round((BASE_PRICE[rarity] * (1 + size[1] / 300)) / 10) * 10;
  return {
    id: 'fish-' + id, name, category: 'fish', rarity, desc,
    habitat: habs.map((h) => HABITAT_NAME[h]).join('·') + ' · ' + TIME_NAME[time],
    price, hab: habs, time, size,
    look: { shape, colors: pastelize(colors, id.length), pattern, ...(extra ?? {}) },
  };
});

export const FISH_BY_ID = new Map(FISH.map((f) => [f.id, f]));

/** 시간대 이름(engine tod) → 이 시간에 나오는 물고기인가 */
export function timeMatches(t: FishTime, tod: string): boolean {
  if (t === 'all') return true;
  if (t === 'day') return tod === 'day' || tod === 'morning';
  if (t === 'night') return tod === 'night';
  if (t === 'morning') return tod === 'morning';
  return tod === 'sunset';
}

/** 말장난 대사 */
export const PUNS: Record<number, string[]> = {
  1: ['{n}을(를) 잡았다! 오늘 저녁은 이걸로 정해!', '{n}! 작아도 소중한 한 마리!', '{n} 잡았다! 손맛이 살짝 좋았어~', '{n}! 이 정도면 낚시왕 연습생?'],
  2: ['{n}을(를) 잡았다! 오호, 제법인데?', '{n}! 이 녀석, 줄을 꽤 당겼어!', '우와 {n}! 도감이 한 칸 더 반짝!'],
  3: ['{n}을(를) 잡았다!! 오늘 운이 좋은걸?', '{n}! 손이 덜덜 떨려…!', '{n} 낚았다! 박물관에 자랑하러 가야지!'],
  4: ['세상에, {n}을(를) 잡았다!!! 이건 기념사진각!', '{n}!!! 낚싯대가 부러지는 줄 알았어!'],
  5: ['전설의 {n}을(를) 잡았다!!!!! 꿈이 아니지?!', '{n}…!!! 바다가 나를 인정했다!!!'],
};
