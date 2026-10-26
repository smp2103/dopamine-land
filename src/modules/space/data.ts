// 우주 생물 도감 데이터 — 도감·상점이 읽는다.
import type { Species } from '../../core/state';

export type SpaceKind =
  | 'bunny' | 'jelly' | 'turtle' | 'slime' | 'whale' | 'fish' | 'chick' | 'ufo' | 'mole' | 'cat' | 'snail' | 'sheep' | 'penguin';

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
}

type Row = Omit<SpaceSpecies, 'category'>;
const rows: Row[] = [
  { id: 'moon-bunny', name: '달토끼', kind: 'bunny', colors: ['#fff6fb', '#ffc6dc', '#ff8fb8'], size: 1, hover: 0, rarity: 1, price: 300, cm: [28, 46], line: '떡방아 찧던 손 그대로 폴짝!', desc: '달에서 떡을 찧는 하얀 토끼. 저중력이라 한 번 뛰면 한참 떠 있다.' },
  { id: 'star-jelly', name: '별해파리', kind: 'jelly', colors: ['#c9b6ff', '#ffe58a', '#ff9fd6'], size: 1, hover: 2.2, rarity: 2, price: 650, cm: [20, 40], line: '말랑말랑 별빛 젤리!', desc: '머리에 별을 단 해파리. 진공 속을 둥실둥실 헤엄친다.' },
  { id: 'meteor-turtle', name: '운석 거북', kind: 'turtle', colors: ['#9be3c8', '#b9a6d8', '#ffd28a'], size: 1.1, hover: 0, rarity: 2, price: 800, cm: [35, 70], line: '등껍질이 진짜 운석이야!', desc: '운석을 등에 지고 다니는 느긋한 거북.' },
  { id: 'alien-slime', name: '외계 슬라임', kind: 'slime', colors: ['#8ff0c4', '#d4ffe8', '#ff8fb8'], size: 0.9, hover: 0, rarity: 1, price: 250, cm: [15, 30], line: '뾰롱! 더듬이가 쫑긋!', desc: '크레이터 바닥에 고인 말랑한 외계 친구.' },
  { id: 'space-whale', name: '우주 고래', kind: 'whale', colors: ['#8fb6ff', '#e6f0ff', '#ffd1ea'], size: 1.6, hover: 3.5, rarity: 5, price: 12000, cm: [400, 900], line: '우와… 은하수를 헤엄치는 고래!', desc: '별빛을 먹고 사는 전설의 고래. 아주 가끔 낮게 내려온다.' },
  { id: 'meteor-fish', name: '별똥별 물고기', kind: 'fish', colors: ['#ffb37a', '#fff2a8', '#ff7aa8'], size: 0.9, hover: 1.8, rarity: 3, price: 1500, cm: [18, 36], line: '소원 빌 틈도 없이 슝!', desc: '꼬리에 불꽃 꼬리를 달고 쏜살같이 헤엄친다.' },
  { id: 'comet-chick', name: '혜성 병아리', kind: 'chick', colors: ['#ffe27a', '#fff8d6', '#ff9a6a'], size: 0.85, hover: 0, rarity: 1, price: 280, cm: [12, 22], line: '삐약! 꼬리가 반짝반짝!', desc: '혜성 꼬리 같은 깃털을 가진 병아리.' },
  { id: 'ufo-octo', name: 'UFO 문어', kind: 'ufo', colors: ['#ff9fc8', '#bfe9ff', '#ffe58a'], size: 1, hover: 1.6, rarity: 3, price: 1800, cm: [25, 45], line: '삐리리~ 지구인 친구 발견!', desc: '작은 비행접시를 몰고 다니는 문어. 지구인을 좋아한다.' },
  { id: 'crater-mole', name: '크레이터 두더지', kind: 'mole', colors: ['#c8a6ff', '#ffd6e6', '#ff8fb8'], size: 0.95, hover: 0, rarity: 2, price: 600, cm: [20, 34], line: '이 크레이터 내가 팠어!', desc: '달에 구멍을 판 범인(으로 의심된다).' },
  { id: 'nebula-cat', name: '성운 고양이', kind: 'cat', colors: ['#b8a2ff', '#ffb8e0', '#8fe6ff'], size: 0.95, hover: 1.2, rarity: 4, price: 4200, cm: [30, 48], line: '냐아~ 털에서 은하가 보여!', desc: '털 속에 작은 성운이 소용돌이친다. 떠다니며 낮잠을 잔다.' },
  { id: 'ring-snail', name: '토성 달팽이', kind: 'snail', colors: ['#ffd9a8', '#ffb07a', '#c9b6ff'], size: 0.9, hover: 0, rarity: 2, price: 700, cm: [10, 22], line: '집에 고리가 달렸어!', desc: '토성을 닮은 껍데기. 고리를 빙글빙글 돌린다.' },
  { id: 'star-sheep', name: '별자리 양', kind: 'sheep', colors: ['#fdfbff', '#ffe58a', '#9db4ff'], size: 1, hover: 0, rarity: 3, price: 1600, cm: [40, 70], line: '복슬복슬 양자리 겟!', desc: '양자리에서 내려온 양. 털이 별처럼 반짝인다.' },
  { id: 'astro-penguin', name: '우주 펭귄', kind: 'penguin', colors: ['#5b6fb0', '#ffffff', '#ffb35a'], size: 0.95, hover: 0, rarity: 2, price: 900, cm: [30, 50], line: '헬멧 쓴 펭귄 대원 출동!', desc: '헬멧을 쓰고 달 탐사 중인 펭귄 대원.' },
  { id: 'gold-bunny', name: '황금 달토끼', kind: 'bunny', colors: ['#ffe9a8', '#ffd06a', '#ff9a6a'], size: 1.05, hover: 0, rarity: 5, price: 15000, cm: [30, 50], line: '반짝반짝 전설의 토끼!!', desc: '보름달 같은 황금빛 토끼. 본 사람은 행운이 온다고.' },
];

export const SPACE_SPECIES: SpaceSpecies[] = rows.map((r) => ({ ...r, category: 'space', habitat: '달 표면' }));
