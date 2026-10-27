// 예전 도감(웨이브 0 이전)에만 있던 종 38종 — GDD 표에 짝이 없어 그대로 남긴다(저장 기록이 사라지지 않게 id 고정).
// 사는 곳(hab)·시간은 GDD 구역 줄로 옮기고(강 → 말랑섬 river …), 크기 범위로 len·그림자를 정한다. 'legacy' 태그.
import type { ShadowSize } from '../../../core/api';
import type { FishLook, FishPattern, FishShape, FishWhere, FishTime } from '../data';
import type { FishDef } from './def';

type Row = [id: string, name: string, rarity: 1 | 2 | 3 | 4 | 5, hab: string, time: FishTime, size: [number, number],
  shape: FishShape, colors: [string, string, string], pattern: FishPattern, desc: string, extra?: Partial<FishLook>];

// prettier-ignore
const ROWS: Row[] = [
  ['ingeo', '잉어', 2, 'river,lake', 'all', [40, 80], 'round', ['#d4a84e', '#f8e8b8', '#f0b860'], 'grad', '물속 동네 할아버지. 멋진 수염이 자랑이다.', { whiskers: true }],
  ['euneo', '은어', 2, 'river', 'day', [15, 25], 'long', ['#a8cbc6', '#f4faf4', '#ffd24a'], 'grad', '수박 향기가 나는 은빛 물고기.'],
  ['sancheoneo', '산천어', 3, 'river', 'morning', [20, 35], 'long', ['#8fb0a6', '#f6f0e4', '#f28ca6'], 'spots', '맑은 계곡에서만 사는 깔끔쟁이.'],
  ['ppaga', '동자개', 2, 'river', 'night', [15, 30], 'long', ['#d4aa58', '#f8eac8', '#7a5530'], 'spots', '"빠가빠가!" 하고 우는 수다쟁이.', { whiskers: true }],
  ['bluegill', '블루길', 1, 'lake', 'all', [10, 20], 'tall', ['#6f9fc0', '#ffd8a0', '#3a5a80'], 'grad', '파란 귀를 단 호수의 장난꾸러기.'],
  ['bass', '배스', 2, 'lake', 'all', [30, 50], 'long', ['#88a462', '#eef2da', '#4f6a3a'], 'stripe', '입이 엄청 크다. 웃을 때도 크다.'],
  ['gamulchi', '가물치', 3, 'lake,pond', 'night', [50, 80], 'eel', ['#667458', '#ded8c0', '#3d3a4a'], 'spots', '물 밖에서도 숨을 쉬는 연못의 대장.'],
  ['ranchu', '난주', 2, 'pond', 'day', [8, 15], 'round', ['#ff6a3a', '#fff2e4', '#ffffff'], 'spots', '머리에 혹 모자를 쓴 금붕어 귀족.', { fancy: true, parts: ['hump'] }],
  ['bullfrog-tadpole', '황소올챙이', 2, 'lake', 'evening', [8, 14], 'tadpole', ['#7a8a4a', '#e8e0b0', '#4a5a2a'], 'spots', '올챙이인데 벌써 덩치가 형님급.'],
  ['discus', '디스커스', 3, 'oasis', 'evening', [15, 20], 'tall', ['#ff9a5a', '#ffd6a8', '#4aa6e0'], 'stripe', '동그란 접시처럼 생긴 열대의 왕.'],
  ['neon-tetra', '네온테트라', 1, 'oasis', 'night', [2, 4], 'long', ['#4acaff', '#fff4f4', '#ff4a6a'], 'band', '밤에 더 반짝이는 작은 네온사인.', { glow: true }],
  ['nongeo', '농어', 2, 'coast', 'evening', [50, 90], 'long', ['#a4b4bc', '#fafafa', '#6a7a88'], 'grad', '저녁 물때에 힘차게 뛰어오르는 은빛 검객.'],
  ['gajami', '가자미', 2, 'coast', 'all', [20, 40], 'flatfish', ['#b4a282', '#ffffff', '#8a7454'], 'spots', '눈이 오른쪽에 몰려 있다. 모래 숨바꼭질 챔피언.'],
  ['jwichi', '쥐치', 1, 'coast', 'day', [15, 25], 'tall', ['#ccbc8e', '#f4ecd4', '#8a7a5a'], 'grad', '쥐포가 되기 싫은 바다의 쥐돌이.'],
  ['kkotge', '꽃게', 2, 'coast', 'all', [15, 25], 'crab', ['#8a80d6', '#f2eaff', '#ff8a5a'], 'grad', '보라색 등딱지가 자랑인 옆걸음 멋쟁이.', { claws: true }],
  ['saewoo', '보리새우', 1, 'coast', 'night', [10, 20], 'shrimp', ['#ffb4a2', '#fff0e8', '#ff7a6a'], 'band', '톡톡 튀는 꼬리로 뒤로 슝!'],
  ['galchi', '갈치', 3, 'coast', 'night', [80, 150], 'eel', ['#e6eef8', '#ffffff', '#b8c8dc'], 'grad', '은빛 칼처럼 반짝. 서서 헤엄친다.'],
  ['bungjang', '붕장어', 2, 'coast', 'night', [40, 80], 'eel', ['#8c7c5c', '#f2e8d0', '#ffffff'], 'spots', '모래에서 쏙 고개만 내밀고 구경한다.'],
  ['starfish', '별불가사리', 1, 'coast', 'day', [8, 15], 'star', ['#ff9a5a', '#ffd6a8', '#ff6a48'], 'spots', '바닷가에 떨어진 별. 소원은 안 들어준다.'],
  ['sea-urchin', '성게', 2, 'coast', 'night', [5, 10], 'puffer', ['#6a4a8a', '#a88ac8', '#4a3a6a'], 'none', '가시투성이지만 마음은 말랑말랑.', { parts: ['spikes'], deco: ['long-spikes', 'urchin'] }],
  ['cleaner-wrasse', '청소놀래기', 1, 'reef', 'day', [5, 10], 'long', ['#6ab6ff', '#ffffff', '#3d3a4a'], 'band', '친구들 이빨을 닦아 주는 바다 치과 의사.'],
  ['mandarin', '만다린피시', 4, 'reef', 'evening', [5, 8], 'round', ['#3a8aff', '#ff9a4a', '#4ad6a0'], 'stripe', '물감을 엎지른 듯한 산호초의 화가.', { fancy: true }],
  ['nudibranch', '갯민숭달팽이', 3, 'reef', 'day', [3, 8], 'tadpole', ['#a07aff', '#ffffff', '#ffd84a'], 'spots', '바닷속 젤리 과자 같은 달팽이.', { deco: ['cerata'] }],
  ['sea-turtle', '바다거북', 4, 'reef', 'day', [60, 100], 'turtle', ['#8ab46e', '#f4ecc8', '#5a7a44'], 'spots', '백 년 동안 바다를 여행한 느긋한 할머니.'],
  ['skipjack', '가다랑어', 2, 'offshore', 'day', [40, 80], 'long', ['#3a5c90', '#f2f6fa', '#4a6aa0'], 'stripe', '배에 줄무늬 네 개. 가쓰오부시가 되기 싫어.'],
  ['shark', '백상아리', 4, 'offshore', 'all', [200, 400], 'shark', ['#8c9db4', '#ffffff', '#6a7a90'], 'none', '이빨은 무서워도 웃는 얼굴은 귀엽다.', { deco: ['big-smile'] }],
  ['lantern-angler', '초롱아귀', 4, 'deep', 'night', [10, 30], 'angler', ['#3e3e62', '#8a8ab4', '#7affe8'], 'none', '파란 초롱을 들고 다니는 심해 꼬마 등대지기.', { glow: true, parts: ['lantern'] }],
  ['deep-shrimp', '심해새우', 1, 'deep', 'all', [5, 10], 'shrimp', ['#ff5a4a', '#ffb4a2', '#c83a2a'], 'band', '깜깜한 바다에서는 빨간색이 투명 망토다.'],
  ['dragonfish', '용치', 4, 'deep', 'night', [15, 40], 'eel', ['#2a2a4a', '#5a5a8a', '#ff6ae0'], 'glowdots', '몸에 보석 같은 발광점을 박은 심해 용.', { glow: true }],
  ['snow-crab', '대게', 3, 'ice-sea', 'all', [50, 80], 'crab', ['#ff9a6a', '#fff0e0', '#e86a4a'], 'grad', '다리가 대나무처럼 길쭉. 겨울 별미 협회장.', { claws: true, parts: ['legs-long'] }],
  ['icefish', '얼음물고기', 4, 'ice-lake', 'night', [30, 50], 'long', ['#eef6ff', '#ffffff', '#c8e0ff'], 'none', '피까지 투명한 남극의 신비한 물고기.', { clear: true, deco: ['bones'] }],
  ['ice-seal-pup', '얼음 해파리', 2, 'ice-sea', 'morning', [10, 20], 'jelly', ['#d4f0ff', '#ffffff', '#8ad4ff'], 'none', '살얼음처럼 반짝이는 차가운 우산.', { clear: true }],
  ['onsen-turtle', '온천거북', 3, 'hotspring', 'day', [25, 45], 'turtle', ['#d4a46a', '#fff0d0', '#a86a3a'], 'spots', '머리에 수건을 얹고 반신욕을 즐긴다.', { deco: ['towel'] }],
  ['flame-carp', '불꽃잉어', 4, 'hotspring', 'evening', [50, 80], 'round', ['#ff5a3a', '#ffd84a', '#ffb43a'], 'grad', '지느러미가 불꽃처럼 일렁이는 뜨거운 녀석.', { glow: true, whiskers: true }],
  ['volcano-eel', '화산장어', 3, 'hotspring', 'night', [50, 90], 'eel', ['#6a4a4a', '#8a6a5a', '#ff6a3a'], 'band', '몸에 용암 줄무늬가 흐른다.', { glow: true }],
  ['onsen-shrimp', '온천새우', 2, 'hotspring', 'all', [5, 10], 'shrimp', ['#ff9a6a', '#ffe0c8', '#ff6a3a'], 'band', '따끈따끈 익은 것 같지만 원래 이 색이다.'],
  ['phoenix-goldfish', '불사조금붕어', 5, 'hotspring', 'night', [20, 40], 'round', ['#ff4a3a', '#ffe04a', '#ffb43a'], 'grad', '용암 온천에서 태어났다는 전설의 금붕어. 꼬리가 불꽃이다.', { fancy: true, glow: true }],
  ['hot-crab', '온천게', 1, 'hotspring', 'day', [5, 10], 'crab', ['#ff8a6a', '#fff0e0', '#ff5a3a'], 'grad', '뜨끈한 물에 몸을 담그고 집게로 브이.', { claws: true }],
];

/** 예전 사는 곳 → GDD 섬·구역 */
const HAB_WHERE: Record<string, { island: string; zone: string }> = {
  river: { island: 'home', zone: 'river' },
  lake: { island: 'home', zone: 'pond' },
  pond: { island: 'home', zone: 'pond' },
  coast: { island: 'any', zone: 'shore' },
  reef: { island: 'coral', zone: 'reef' },
  offshore: { island: 'any', zone: 'offshore' },
  deep: { island: 'any', zone: 'deep' },
  'ice-sea': { island: 'ice', zone: 'icesea' },
  'ice-lake': { island: 'ice', zone: 'icelake' },
  oasis: { island: 'desert', zone: 'oasis' },
  hotspring: { island: 'dino', zone: 'hotspring' },
};
/** 예전 시간 이름 → GDD 시간 코드 */
const TIME_CODE: Record<FishTime, string | string[]> = {
  all: 'all', day: ['morning', 'day'], night: ['night'], morning: ['morning'], evening: ['sunset'],
};

/** 평균 크기(cm) → 그림자 등급(GDD 0.8 표의 경계를 표 값들 사이로) */
export function shadowOfLen(len: number): ShadowSize {
  return len < 9 ? 'XS' : len < 32 ? 'S' : len < 65 ? 'M' : len < 140 ? 'L' : len < 260 ? 'XL' : 'XXL';
}

export const LEGACY_FISH: FishDef[] = ROWS.map(([id, name, rarity, hab, time, size, shape, colors, pattern, desc, extra]) => {
  const len = Math.round((size[0] + size[1]) / 2);
  const where: FishWhere[] = hab.split(',').map((h) => {
    const w = HAB_WHERE[h];
    return { island: w.island, zone: w.zone, time: TIME_CODE[time] };
  });
  return {
    gdd: '', legacy: 'fish-' + id, name, rarity, where, shadow: shadowOfLen(len), len,
    look: { shape, colors, pattern, ...(extra ?? {}) }, desc,
    // 예전 심해 종은 P1 표시를 하지 않는다 — 배로 가는 deep 구역 후보가 P0 에서도 비지 않게
    tags: ['legacy', ...(id === 'shark' ? ['scary'] : [])],
  };
});
