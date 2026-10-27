// 우주 생물 도감 데이터 — 도감·상점이 읽는다(GDD 3.9.1 우주 생물 18종 + 예전부터 있던 달 친구들).
// ID 정책: 예전 id 는 그대로(gdd 로 GDD id 를 단다), 새 종은 GDD id. 가격 = round10(BASE[★] × SIZE[그림자] × 우주 1.8).
import type { Species } from '../../core/state';
import type { Part } from '../../core/art';

export type SpaceKind =
  | 'bunny' | 'jelly' | 'turtle' | 'slime' | 'whale' | 'fish' | 'chick' | 'ufo' | 'mole' | 'cat' | 'snail' | 'sheep' | 'penguin'
  | 'moth' | 'moonbug' | 'starsaurus' | 'alien' | 'brachio' | 'jellybear' | 'ringsnake' | 'hedgehog' | 'ufojelly' | 'fox' | 'littlestar';

/** 잡는 법: net 잠자리채(앞쪽 부채꼴) · float 점프해서 잠자리채(공중) · mole 두더지 잡기 · greet 인사(목격) · pickup E 줍기(느림) · grab E 잡기 */
export type CatchHow = 'net' | 'float' | 'mole' | 'greet' | 'pickup' | 'grab';
/** 달에서 나오는 곳(p1 종은 없음 — planets 가 addSpawn 으로 자기 행성에 둔다) */
export type MoonZone = 'plain' | 'sky' | 'village' | 'crater' | 'field' | 'nest' | 'wreck' | 'farhill';

export interface SpaceSpecies extends Species {
  kind: SpaceKind;
  /** 몸 색 · 두 번째 색 · 포인트 색 */
  colors: [string, string, string];
  /** 모델 배율 */
  size: number;
  /** 공중에 떠 있는 높이(m, 0 = 땅) */
  hover: number;
  cm: [number, number];
  line: string;
  how: CatchHow;
  /** 달 위 출현 구역(없으면 달에 안 나온다) */
  zone?: MoonZone;
  /** 달 출현 시간: all · night(우주 밤 = 저녁·밤) · earth(지구가 뜰 때 = 아침·낮) */
  when?: 'all' | 'night' | 'earth';
  /** 잡으면 덤으로 주는 재료 */
  drop?: { id: string; n: number };
}

type Row = Omit<SpaceSpecies, 'category' | 'habitat'> & { habitat?: string };
const ALL = 'all';
const rows: Row[] = [
  // ── GDD 3.9.1 P0 (달) ──
  {
    id: 's_glitter_moth', name: '반짝가루나방', kind: 'moth', colors: ['#dfe6ee', '#c9b6f2', '#fff2a8'], size: 0.8, hover: 1.5, rarity: 1, price: 90,
    cm: [6, 12], len: 9, shadow: 'S', line: '날개를 털면 별가루가 우수수!', desc: '은빛 가루를 뿌리며 나는 나방. 날개 가루가 곧 별가루다.',
    how: 'net', zone: 'plain', when: 'all', drop: { id: 'm_stardust', n: 2 }, habitat: '달·소행성대',
    where: [{ island: 'moon', zone: 'plain', time: ALL }], look: { parts: ['antenna-big', 'wings-clear'] }, tags: ['space-goods'],
  },
  {
    id: 'moon-bunny', gdd: 's_mochi_rabbit', name: '쿵떡이 떡방아토끼', kind: 'bunny', colors: ['#fffaf2', '#ffd0de', '#ff9fb8'], size: 1, hover: 0, rarity: 1, price: 110,
    cm: [28, 46], len: 36, shadow: 'M', line: '쿵떡쿵떡! 떡 하나 먹고 갈래?', desc: '달 마을에서 떡방아를 찧는 하얀 토끼. 쓰다듬으면 귀가 쫑긋 선다.',
    how: 'greet', zone: 'village', when: 'all', witness: true, habitat: '달 마을',
    where: [{ island: 'moon', zone: 'village', time: ALL }], tags: ['witness'],
  },
  {
    id: 's_moon_bug', name: '달빛벌레', kind: 'moonbug', colors: ['#dfe6ee', '#9ef0d2', '#fff2a8'], size: 0.8, hover: 0, rarity: 2, price: 310,
    cm: [3, 7], len: 5, shadow: 'S', line: '등껍질이 달빛처럼 반짝!', desc: '우주 밤이면 은빛으로 빛나는 딱정벌레. 평원을 또르르 기어 다닌다.',
    how: 'net', zone: 'plain', when: 'night', habitat: '달 평원',
    where: [{ island: 'moon', zone: 'plain', time: ['sunset', 'night'] }], tags: ['set:glow'],
  },
  {
    id: 'crater-mole', gdd: 's_crater_mole', name: '구멍쏙 크레이터두더지', kind: 'mole', colors: ['#c9b6f2', '#ffd0de', '#ff9fb8'], size: 0.95, hover: 0, rarity: 2, price: 360,
    cm: [20, 34], len: 26, shadow: 'M', line: '쏙! 이 크레이터 내가 팠어!', desc: '크레이터 구멍에서 쏙쏙 튀어나오는 두더지. 나왔을 때 재빨리!',
    how: 'mole', zone: 'crater', when: 'all', habitat: '달 크레이터',
    where: [{ island: 'moon', zone: 'crater', time: ALL }],
  },
  {
    id: 'star-jelly', gdd: 's_moon_jelly', name: '둥실이 달빛해파리', kind: 'jelly', colors: ['#c8e8ff', '#8fd3f4', '#ffe58a'], size: 1, hover: 4.2, rarity: 2, price: 360,
    cm: [20, 40], len: 30, shadow: 'M', line: '말랑말랑 별빛 젤리!', desc: '지구가 높이 뜨면 달 위 3~6m 를 둥실둥실 떠다닌다. 점프해서 잡자.',
    how: 'float', zone: 'sky', when: 'earth', habitat: '달 상공 3~6m',
    where: [{ island: 'moon', zone: 'sky', time: ['morning', 'day'] }], look: { parts: ['dome-head'] },
  },
  {
    id: 'meteor-turtle', gdd: 's_moonrock_turtle', name: '돌등이 월석거북', kind: 'turtle', colors: ['#e9e4f2', '#cfc8dd', '#ffd28a'], size: 1.1, hover: 0, rarity: 3, price: 1260,
    cm: [35, 70], len: 50, shadow: 'M', line: '등껍질이 진짜 월석이야!', desc: '월석을 등에 지고 다니는 느긋한 거북. 데려가면 월석이 우수수.',
    how: 'pickup', zone: 'field', when: 'night', drop: { id: 'm_moonrock', n: 3 }, habitat: '달 평원',
    where: [{ island: 'moon', zone: 'field', time: ['sunset', 'night'] }], tags: ['space-goods'],
  },
  {
    id: 's_starsaurus', name: '별공룡 스타사우루스', kind: 'starsaurus', colors: ['#8fd3f4', '#ffcf4a', '#fffaf2'], size: 1, hover: 0, rarity: 4, price: 7650,
    cm: [180, 260], len: 220, shadow: 'XL', line: '헬멧 쓴 공룡이 꾸벅 인사했어!', desc: '우주로 간 공룡의 후손. 투명 헬멧 속에서 눈을 반짝인다.',
    how: 'greet', zone: 'nest', when: 'all', witness: true, habitat: '달 별공룡 둥지',
    where: [{ island: 'moon', zone: 'nest', time: ALL }], look: { parts: ['horn3', 'helmet'] }, tags: ['witness', 'ancient'], diet: 'herb',
  },
  {
    id: 's_alien_kid', name: '삐리 외계인 꼬마', kind: 'alien', colors: ['#a8e06a', '#c8ff5a', '#c9b6f2'], size: 1, hover: 0, rarity: 4, price: 4500,
    cm: [60, 80], len: 70, shadow: 'M', line: '삐리리~ 지구인 친구다!', desc: 'UFO 가 고장 나 달에 사는 외계인 꼬마. 눈이 세 개라 윙크가 어렵다.',
    how: 'greet', zone: 'wreck', when: 'all', witness: true, habitat: '달 UFO 잔해',
    where: [{ island: 'moon', zone: 'wreck', time: ALL }], look: { parts: ['antenna-big'] }, tags: ['witness'],
  },
  {
    id: 's_moon_brachio', name: '달브라키오', kind: 'brachio', colors: ['#dfe6ee', '#ffcf4a', '#c9b6f2'], size: 1, hover: 0, rarity: 5, price: 35640,
    cm: [900, 1300], len: 1100, shadow: 'XXL', line: '우와… 목이 하늘까지 닿겠어!', desc: '달의 먼 언덕을 천천히 거니는 거대한 목긴 공룡. 헬멧까지 은빛이다.',
    how: 'greet', zone: 'farhill', when: 'all', witness: true, habitat: '달 먼 언덕', p1: true,
    where: [{ island: 'moon', zone: 'farhill', time: ALL }], look: { parts: ['helmet'] }, tags: ['witness', 'ancient'], diet: 'herb',
  },
  // ── GDD 3.9.1 P1(다른 행성 — 예전 달 친구는 gdd 별칭) ──
  {
    id: 'star-sheep', gdd: 's_cotton_sheep', name: '구름뭉치 솜사탕양', kind: 'sheep', colors: ['#ffd0de', '#8fd3f4', '#fff2a8'], size: 1, hover: 0, rarity: 2, price: 360,
    cm: [40, 70], len: 55, shadow: 'M', line: '복슬복슬 솜사탕 털!', desc: '슈가링에 사는 솜사탕 양. 털을 깎으면 솜사탕 재료가 된다.',
    how: 'grab', habitat: '슈가링', p1: true, where: [{ island: 'sugar', zone: 'ring', time: ALL }], look: { parts: ['fluffy'] },
  },
  {
    id: 's_jelly_bear', name: '말캉곰 젤리곰', kind: 'jellybear', colors: ['#ff9fb8', '#ffd84a', '#9ef0d2'], size: 0.8, hover: 0, rarity: 2, price: 310,
    cm: [12, 20], len: 16, shadow: 'S', line: '말캉말캉 여섯 빛깔 곰!', desc: '젤리별의 투명한 곰. 여섯 가지 색을 다 모으면 세트!',
    how: 'net', habitat: '젤리별', p1: true, where: [{ island: 'jelly', zone: 'jelly', time: ['day'] }], tags: ['set:rainbow'],
  },
  {
    id: 'ufo-octo', gdd: 's_balloon_octo', name: '빵빠레 풍선문어', kind: 'ufo', colors: ['#ffd84a', '#bfe9ff', '#ff9fb8'], size: 1, hover: 1.6, rarity: 3, price: 1260,
    cm: [25, 45], len: 35, shadow: 'M', line: '붙잡으면 같이 둥실!', desc: '솜사탕 성운에서 머리를 부풀려 떠다니는 문어.',
    how: 'grab', habitat: '솜사탕 성운', p1: true, where: [{ island: 'cloud', zone: 'cloud', time: ALL }], look: { parts: ['tentacles6'] },
  },
  {
    id: 's_ring_snake', name: '훌라후프 고리뱀', kind: 'ringsnake', colors: ['#9ef0d2', '#fffaf2', '#ff9fb8'], size: 0.9, hover: 0, rarity: 3, price: 1260,
    cm: [40, 70], len: 55, shadow: 'M', line: '빙글빙글 훌라후프!', desc: '슈가링 고리 위를 동그랗게 말려 굴러다닌다.',
    how: 'net', habitat: '슈가링 고리', p1: true, where: [{ island: 'sugar', zone: 'ring', time: ALL }], look: { parts: ['ring'] },
  },
  {
    id: 's_crystal_hedgehog', name: '수정가시 고슴도치', kind: 'hedgehog', colors: ['#8fd3f4', '#fffaf2', '#c9b6f2'], size: 0.8, hover: 0, rarity: 3, price: 1070,
    cm: [14, 22], len: 18, shadow: 'S', line: '가시가 반짝반짝 수정!', desc: '서리볼의 밤에 나오는 고슴도치. 가시가 얼음 결정이다.',
    how: 'grab', habitat: '서리볼', p1: true, where: [{ island: 'frost', zone: 'frost', time: ['night'] }], look: { parts: ['spikes'] },
  },
  {
    id: 's_ufo_jelly', name: 'UFO해파리', kind: 'ufojelly', colors: ['#dfe6ee', '#ff9fb8', '#c8e8ff'], size: 0.9, hover: 1.8, rarity: 4, price: 4500,
    cm: [30, 50], len: 40, shadow: 'M', line: '빛 촉수가 하늘하늘~', desc: '유성우 때 자갈띠에 나타나는 접시 모양 해파리.',
    how: 'net', habitat: '자갈띠 소행성대', p1: true, where: [{ island: 'belt', zone: 'belt', time: ALL, weather: { only: ['meteor'] } }],
  },
  {
    id: 'space-whale', gdd: 's_sky_whale', name: '하늘고래', kind: 'whale', colors: ['#fffaf2', '#c8e8ff', '#ffd0de'], size: 1.6, hover: 3.5, rarity: 5, price: 35640,
    cm: [400, 900], len: 650, shadow: 'XXL', line: '우와… 은하수를 헤엄치는 고래!', desc: '솜사탕 성운의 저녁에 나타나는 하늘고래. 친해지면 태워 준다.',
    how: 'grab', habitat: '솜사탕 성운', p1: true, where: [{ island: 'cloud', zone: 'cloud', time: ['sunset'] }], look: { parts: ['fluffy'] },
  },
  {
    id: 's_comet_fox', name: '꼬리별 혜성여우', kind: 'fox', colors: ['#ffa24c', '#fffaf2', '#fff2a8'], size: 0.9, hover: 0, rarity: 5, price: 16200,
    cm: [40, 60], len: 50, shadow: 'M', line: '꼬리에 별빛이 주르륵!', desc: '유성우 밤 자갈띠를 달리는 여우. 잡으면 소원 하나!',
    how: 'net', habitat: '자갈띠', p1: true, where: [{ island: 'belt', zone: 'belt', time: ['night'], weather: { only: ['meteor'] } }], look: { parts: ['light-tail'] },
  },
  {
    id: 's_little_star', name: '꼬마별', kind: 'littlestar', colors: ['#ffd84a', '#fff2a8', '#ffa24c'], size: 0.8, hover: 1, rarity: 5, price: 11340,
    cm: [8, 14], len: 11, shadow: 'XS', line: '반짝! 나랑 같이 갈래?', desc: '까만 도넛 근처, 일식 때만 나타나는 작은 별. 머리 위를 빙글빙글.',
    how: 'grab', habitat: '까만 도넛', p1: true, where: [{ island: 'blackhole', zone: 'blackhole', time: ALL }], tags: ['set:glow'],
  },
  // ── 예전부터 달에 살던 친구들(GDD 표 밖 — 달 평원에서 E 잡기) ──
  { id: 'alien-slime', name: '외계 슬라임', kind: 'slime', colors: ['#8ff0c4', '#d4ffe8', '#ff8fb8'], size: 0.9, hover: 0, rarity: 1, price: 250, cm: [15, 30], len: 22, how: 'grab', zone: 'plain', when: 'all', line: '뾰롱! 더듬이가 쫑긋!', desc: '크레이터 바닥에 고인 말랑한 외계 친구.' },
  { id: 'meteor-fish', name: '별똥별 물고기', kind: 'fish', colors: ['#ffb37a', '#fff2a8', '#ff7aa8'], size: 0.9, hover: 1.8, rarity: 3, price: 1500, cm: [18, 36], len: 26, how: 'float', zone: 'sky', when: 'night', line: '소원 빌 틈도 없이 슝!', desc: '꼬리에 불꽃 꼬리를 달고 쏜살같이 헤엄친다.' },
  { id: 'comet-chick', name: '혜성 병아리', kind: 'chick', colors: ['#ffe27a', '#fff8d6', '#ff9a6a'], size: 0.85, hover: 0, rarity: 1, price: 280, cm: [12, 22], len: 16, how: 'grab', zone: 'plain', when: 'all', line: '삐약! 꼬리가 반짝반짝!', desc: '혜성 꼬리 같은 깃털을 가진 병아리.' },
  { id: 'nebula-cat', name: '성운 고양이', kind: 'cat', colors: ['#b8a2ff', '#ffb8e0', '#8fe6ff'], size: 0.95, hover: 1.2, rarity: 4, price: 4200, cm: [30, 48], len: 38, how: 'float', zone: 'sky', when: 'night', line: '냐아~ 털에서 은하가 보여!', desc: '털 속에 작은 성운이 소용돌이친다. 떠다니며 낮잠을 잔다.' },
  { id: 'ring-snail', name: '토성 달팽이', kind: 'snail', colors: ['#ffd9a8', '#ffb07a', '#c9b6ff'], size: 0.9, hover: 0, rarity: 2, price: 700, cm: [10, 22], len: 15, how: 'grab', zone: 'plain', when: 'all', line: '집에 고리가 달렸어!', desc: '토성을 닮은 껍데기. 고리를 빙글빙글 돌린다.' },
  { id: 'astro-penguin', name: '우주 펭귄', kind: 'penguin', colors: ['#5b6fb0', '#fffaf2', '#ffb35a'], size: 0.95, hover: 0, rarity: 2, price: 900, cm: [30, 50], len: 40, how: 'grab', zone: 'plain', when: 'all', line: '헬멧 쓴 펭귄 대원 출동!', desc: '헬멧을 쓰고 달 탐사 중인 펭귄 대원.' },
  { id: 'gold-bunny', name: '황금 달토끼', kind: 'bunny', colors: ['#ffe9a8', '#ffd06a', '#ff9a6a'], size: 1.05, hover: 0, rarity: 5, price: 15000, cm: [30, 50], len: 40, how: 'grab', zone: 'plain', when: 'night', line: '반짝반짝 전설의 토끼!!', desc: '보름달 같은 황금빛 토끼. 본 사람은 행운이 온다고.' },
];

export const SPACE_SPECIES: SpaceSpecies[] = rows.map((r) => ({ ...r, category: 'space', habitat: r.habitat ?? '달 표면' }));
export const SPACE_BY_ID = new Map(SPACE_SPECIES.map((s) => [s.id, s]));
/** GDD 3.9.1 의 18줄(gdd 별칭 포함) */
export const GDD_SPACE_IDS = [
  's_glitter_moth', 's_mochi_rabbit', 's_moon_bug', 's_crater_mole', 's_moon_jelly', 's_moonrock_turtle', 's_starsaurus', 's_alien_kid',
  's_moon_brachio', 's_cotton_sheep', 's_jelly_bear', 's_balloon_octo', 's_ring_snake', 's_crystal_hedgehog', 's_ufo_jelly', 's_sky_whale',
  's_comet_fox', 's_little_star',
] as const;
/** GDD id 또는 실제 id → 종 */
export const spaceByGdd = (id: string) => SPACE_BY_ID.get(id) ?? SPACE_SPECIES.find((s) => s.gdd === id);
/** 달 구역 출현 목록 */
export const moonPool = (zone: MoonZone) => SPACE_SPECIES.filter((s) => s.zone === zone && !(s.p1 && s.id !== 's_moon_brachio'));
/** 데이터 확인용: 파츠가 0.4 어휘인지 */
export const partsOf = (s: SpaceSpecies): Part[] => s.look?.parts ?? [];
