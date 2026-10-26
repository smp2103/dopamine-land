// 공룡 섬 데이터 — 공룡 도감(category 'dino')·화석(category 'fossil') 종 목록과 모양 명세.
import type { Species } from '../../core/state';

export type Feature =
  | 'frill' | 'horns3' | 'plates' | 'sail' | 'dome' | 'crest' | 'crests2' | 'club' | 'shell'
  | 'feathers' | 'tailSpikes' | 'eggHat' | 'noseHorn' | 'spots' | 'stripes' | 'beak';

export type Personality = 'curious' | 'shy' | 'follow' | 'calm';
export type Habitat = 'land' | 'sky' | 'sea' | 'deep' | 'nest';

export interface DinoSpec extends Species {
  /** 색: 등 / 옆 / 배 / 장식(판·뿔·볏) / 무늬 */
  col: { top: string; side: string; belly: string; accent: string; mark?: string };
  /** 전체 크기 배율(1 = 아기 곰 주민보다 조금 큰 정도) */
  scale: number;
  biped: boolean;
  /** 몸통 길이·반지름(가로·세로), 몸 기울기(두 발 공룡은 앞이 들린다) */
  body: { len: number; rx: number; ry: number; tilt?: number };
  /** 목: 앞으로 길이, 위로 높이, 굵기 */
  neck: { fwd: number; up: number; r: number };
  /** 머리 반지름(가로·세로·앞뒤), 주둥이 내밀기 */
  head: { r: number; ry?: number; rz?: number; snout: number };
  tail: { len: number; r: number; up?: number };
  leg: { len: number; r: number };
  arm?: { len: number; r: number };
  feat: Feature[];
  personality: Personality;
  habitat: Habitat;
  /** 걷는 속도 m/s(크기 반영 전) */
  speed: number;
  mount?: boolean;
  /** 무리 크기 [최소, 최대] */
  herd: [number, number];
  /** 출현 가중치 */
  weight: number;
}

const S = (o: Omit<DinoSpec, 'category'>): DinoSpec => ({ ...o, category: 'dino' });

export const DINOS: DinoSpec[] = [
  S({
    id: 'dino-trex', name: '꼬마 티라노', rarity: 3, price: 0, habitat: 'land',
    desc: '팔이 짧아서 박수를 못 친다. 대신 발을 동동 구른다.',
    col: { top: '#5fc98a', side: '#8fe0a6', belly: '#fff3c9', accent: '#ffd36b', mark: '#45b07a' },
    scale: 1.86, biped: true, body: { len: 0.95, rx: 0.42, ry: 0.44, tilt: 0.42 },
    neck: { fwd: 0.18, up: 0.3, r: 0.3 }, head: { r: 0.5, ry: 0.44, rz: 0.5, snout: 0.38 },
    tail: { len: 0.95, r: 0.3, up: 0.1 }, leg: { len: 0.34, r: 0.15 }, arm: { len: 0.16, r: 0.06 },
    feat: ['spots'], personality: 'curious', speed: 1.6, herd: [1, 2], weight: 1.0,
  }),
  S({
    id: 'dino-trike', name: '트리케라톱스', rarity: 2, price: 0, habitat: 'land', mount: true,
    desc: '뿔이 세 개지만 전부 말랑말랑해 보인다. 등에 태워 주는 걸 좋아한다.',
    col: { top: '#ff9470', side: '#ffb892', belly: '#fff0d6', accent: '#ffd36b', mark: '#ff7a5e' },
    scale: 2.04, biped: false, body: { len: 1.0, rx: 0.5, ry: 0.42 },
    neck: { fwd: 0.22, up: 0.08, r: 0.3 }, head: { r: 0.44, ry: 0.4, rz: 0.46, snout: 0.42 },
    tail: { len: 0.55, r: 0.24, up: 0.05 }, leg: { len: 0.3, r: 0.14 },
    feat: ['frill', 'horns3', 'beak'], personality: 'calm', speed: 1.3, herd: [2, 4], weight: 1.3,
  }),
  S({
    id: 'dino-brachio', name: '브라키오사우루스', rarity: 3, price: 0, habitat: 'land', mount: true,
    desc: '목이 길어서 구름 냄새를 맡을 수 있다. 세상에서 제일 순한 거인.',
    col: { top: '#8fa8f0', side: '#b3c4ff', belly: '#f3efff', accent: '#ffc2dd', mark: '#7c95e6' },
    scale: 3.48, biped: false, body: { len: 1.15, rx: 0.52, ry: 0.5 },
    neck: { fwd: 0.55, up: 1.55, r: 0.17 }, head: { r: 0.3, ry: 0.27, rz: 0.33, snout: 0.3 },
    tail: { len: 1.0, r: 0.24, up: 0.15 }, leg: { len: 0.55, r: 0.16 },
    feat: ['spots'], personality: 'calm', speed: 0.9, herd: [1, 2], weight: 0.7,
  }),
  S({
    id: 'dino-stego', name: '스테고사우루스', rarity: 2, price: 0, habitat: 'land',
    desc: '등의 판은 기분이 좋으면 분홍빛이 된다고 한다.',
    col: { top: '#a8d86a', side: '#c6ea8c', belly: '#fff8d8', accent: '#ff9fb0', mark: '#8cc45a' },
    scale: 1.92, biped: false, body: { len: 1.05, rx: 0.46, ry: 0.46 },
    neck: { fwd: 0.3, up: -0.08, r: 0.2 }, head: { r: 0.32, ry: 0.29, rz: 0.36, snout: 0.35 },
    tail: { len: 0.85, r: 0.24, up: 0.25 }, leg: { len: 0.3, r: 0.14 },
    feat: ['plates', 'tailSpikes'], personality: 'calm', speed: 1.1, herd: [2, 3], weight: 1.1,
  }),
  S({
    id: 'dino-ankylo', name: '안킬로사우루스', rarity: 3, price: 0, habitat: 'land',
    desc: '등껍질이 동글동글. 꼬리 망치로 도토리를 깬다.',
    col: { top: '#d9a86c', side: '#ecc794', belly: '#fff3dc', accent: '#b98552', mark: '#f5dcae' },
    scale: 1.74, biped: false, body: { len: 1.0, rx: 0.56, ry: 0.36 },
    neck: { fwd: 0.18, up: 0.0, r: 0.24 }, head: { r: 0.34, ry: 0.28, rz: 0.36, snout: 0.25 },
    tail: { len: 0.75, r: 0.18, up: 0.05 }, leg: { len: 0.22, r: 0.14 },
    feat: ['shell', 'club'], personality: 'shy', speed: 0.9, herd: [1, 3], weight: 0.9,
  }),
  S({
    id: 'dino-pachy', name: '파키케팔로사우루스', rarity: 2, price: 0, habitat: 'land',
    desc: '박치기 연습을 하지만 늘 베개에다 한다.',
    col: { top: '#ff9ccd', side: '#ffbede', belly: '#fff2f6', accent: '#ffe2f0', mark: '#ff86bd' },
    scale: 1.44, biped: true, body: { len: 0.8, rx: 0.36, ry: 0.38, tilt: 0.35 },
    neck: { fwd: 0.16, up: 0.24, r: 0.22 }, head: { r: 0.42, ry: 0.4, rz: 0.42, snout: 0.24 },
    tail: { len: 0.75, r: 0.22, up: 0.12 }, leg: { len: 0.32, r: 0.12 }, arm: { len: 0.14, r: 0.05 },
    feat: ['dome'], personality: 'curious', speed: 1.8, herd: [2, 4], weight: 1.0,
  }),
  S({
    id: 'dino-parasaur', name: '파라사우롤로푸스', rarity: 2, price: 0, habitat: 'land',
    desc: '머리 뒤 관으로 뿌우— 하고 노래한다.',
    col: { top: '#ffd25e', side: '#ffe38f', belly: '#fff8e0', accent: '#ff8f6b', mark: '#ffc04a' },
    scale: 1.86, biped: true, body: { len: 0.95, rx: 0.4, ry: 0.42, tilt: 0.22 },
    neck: { fwd: 0.28, up: 0.38, r: 0.2 }, head: { r: 0.34, ry: 0.32, rz: 0.36, snout: 0.4 },
    tail: { len: 0.85, r: 0.24, up: 0.1 }, leg: { len: 0.38, r: 0.14 }, arm: { len: 0.2, r: 0.06 },
    feat: ['crest', 'beak'], personality: 'calm', speed: 1.4, herd: [2, 4], weight: 1.1,
  }),
  S({
    id: 'dino-raptor', name: '랩터', rarity: 3, price: 0, habitat: 'land', mount: true,
    desc: '깃털 머리를 늘 손질한다. 친해지면 빛보다 빨리 달려 준다(기분상).',
    col: { top: '#6fc4f2', side: '#9adaf8', belly: '#f4fbff', accent: '#ffb35c', mark: '#4fa9e0' },
    scale: 1.38, biped: true, body: { len: 0.85, rx: 0.32, ry: 0.34, tilt: 0.18 },
    neck: { fwd: 0.24, up: 0.32, r: 0.17 }, head: { r: 0.34, ry: 0.31, rz: 0.37, snout: 0.42 },
    tail: { len: 1.0, r: 0.2, up: 0.18 }, leg: { len: 0.42, r: 0.11 }, arm: { len: 0.2, r: 0.05 },
    feat: ['feathers', 'stripes'], personality: 'shy', speed: 2.6, herd: [2, 4], weight: 1.0,
  }),
  S({
    id: 'dino-dilo', name: '딜로포사우루스', rarity: 3, price: 0, habitat: 'land',
    desc: '머리의 볏 두 개는 사실 리본이라고 우긴다.',
    col: { top: '#b6e05a', side: '#d0ef86', belly: '#fffbe0', accent: '#ff7fa8', mark: '#9fd043' },
    scale: 1.56, biped: true, body: { len: 0.85, rx: 0.36, ry: 0.38, tilt: 0.28 },
    neck: { fwd: 0.22, up: 0.32, r: 0.19 }, head: { r: 0.36, ry: 0.33, rz: 0.38, snout: 0.38 },
    tail: { len: 0.9, r: 0.22, up: 0.12 }, leg: { len: 0.36, r: 0.12 }, arm: { len: 0.16, r: 0.05 },
    feat: ['crests2', 'spots'], personality: 'curious', speed: 1.7, herd: [1, 3], weight: 0.8,
  }),
  S({
    id: 'dino-spino', name: '스피노사우루스', rarity: 4, price: 0, habitat: 'land',
    desc: '등 돛을 펴고 햇볕을 쬔다. 물놀이를 제일 좋아한다.',
    col: { top: '#4fc6c0', side: '#7fdcd2', belly: '#f2fff8', accent: '#ff9a7c', mark: '#3aaeae' },
    scale: 2.22, biped: true, body: { len: 1.05, rx: 0.4, ry: 0.42, tilt: 0.3 },
    neck: { fwd: 0.26, up: 0.32, r: 0.24 }, head: { r: 0.4, ry: 0.34, rz: 0.46, snout: 0.6 },
    tail: { len: 1.1, r: 0.26, up: 0.1 }, leg: { len: 0.34, r: 0.14 }, arm: { len: 0.2, r: 0.07 },
    feat: ['sail'], personality: 'calm', speed: 1.3, herd: [1, 1], weight: 0.5,
  }),
  S({
    id: 'dino-proto', name: '프로토케라톱스', rarity: 1, price: 0, habitat: 'land',
    desc: '작은 프릴이 자랑. 무리 지어 다니며 수다를 떤다.',
    col: { top: '#c7a3f0', side: '#dcc2fa', belly: '#fbf4ff', accent: '#fff0b0', mark: '#b48ae6' },
    scale: 1.14, biped: false, body: { len: 0.85, rx: 0.4, ry: 0.36 },
    neck: { fwd: 0.18, up: 0.08, r: 0.24 }, head: { r: 0.42, ry: 0.38, rz: 0.42, snout: 0.32 },
    tail: { len: 0.5, r: 0.2, up: 0.08 }, leg: { len: 0.24, r: 0.12 },
    feat: ['frill', 'noseHorn', 'beak'], personality: 'curious', speed: 1.5, herd: [3, 5], weight: 1.4,
  }),
  S({
    id: 'dino-galli', name: '갈리미무스', rarity: 2, price: 0, habitat: 'land',
    desc: '섬에서 제일 빠른 달리기 선수. 겁이 많아 금방 도망간다.',
    col: { top: '#ffb35c', side: '#ffcb88', belly: '#fff7e6', accent: '#ff8f6b', mark: '#ff9d40' },
    scale: 1.50, biped: true, body: { len: 0.75, rx: 0.32, ry: 0.32, tilt: 0.1 },
    neck: { fwd: 0.22, up: 0.55, r: 0.13 }, head: { r: 0.3, ry: 0.28, rz: 0.32, snout: 0.3 },
    tail: { len: 0.8, r: 0.18, up: 0.15 }, leg: { len: 0.5, r: 0.1 }, arm: { len: 0.18, r: 0.045 },
    feat: ['beak', 'feathers'], personality: 'shy', speed: 3.2, herd: [3, 5], weight: 1.0,
  }),
  S({
    id: 'dino-baby', name: '아기 공룡', rarity: 3, price: 0, habitat: 'nest',
    desc: '알에서 갓 나왔다. 처음 본 사람을 엄마라고 생각한다.',
    col: { top: '#ffb0c8', side: '#ffcadb', belly: '#fff5f8', accent: '#fffaf0', mark: '#ff9cbb' },
    scale: 0.74, biped: true, body: { len: 0.75, rx: 0.4, ry: 0.42, tilt: 0.3 },
    neck: { fwd: 0.12, up: 0.22, r: 0.28 }, head: { r: 0.56, ry: 0.52, rz: 0.54, snout: 0.22 },
    tail: { len: 0.6, r: 0.24, up: 0.12 }, leg: { len: 0.26, r: 0.14 }, arm: { len: 0.13, r: 0.06 },
    feat: ['eggHat'], personality: 'follow', speed: 1.6, herd: [1, 1], weight: 0,
  }),
  S({
    id: 'dino-egg', name: '공룡 알', rarity: 2, price: 0, habitat: 'nest',
    desc: '가끔 혼자 들썩인다. 쓰다듬으면 안에서 똑똑 답한다.',
    col: { top: '#fff6e6', side: '#fff6e6', belly: '#fff6e6', accent: '#ffb0c8', mark: '#8fd3a6' },
    scale: 1.20, biped: false, body: { len: 0.4, rx: 0.3, ry: 0.4 },
    neck: { fwd: 0, up: 0, r: 0 }, head: { r: 0.1, snout: 0 }, tail: { len: 0, r: 0 }, leg: { len: 0, r: 0 },
    feat: [], personality: 'calm', speed: 0, herd: [2, 3], weight: 0,
  }),
  S({
    id: 'dino-ptera', name: '프테라노돈', rarity: 3, price: 0, habitat: 'sky',
    desc: '화산 위를 빙글빙글. 바람을 타는 걸 플레이어에게 가르쳐 줬다는 소문.',
    col: { top: '#ff9a8a', side: '#ffbcae', belly: '#fff3ea', accent: '#ffd36b', mark: '#ff8573' },
    scale: 2.16, biped: false, body: { len: 0.6, rx: 0.26, ry: 0.26 },
    neck: { fwd: 0.15, up: 0.05, r: 0.14 }, head: { r: 0.28, snout: 0.5 }, tail: { len: 0.2, r: 0.1 }, leg: { len: 0.1, r: 0.06 },
    feat: ['crest', 'beak'], personality: 'calm', speed: 9, herd: [1, 1], weight: 0,
  }),
  S({
    id: 'dino-plesio', name: '플레시오사우루스', rarity: 4, price: 0, habitat: 'sea',
    desc: '공룡 섬 앞바다의 수영 선생님. 목을 쭉 빼고 인사한다.',
    col: { top: '#6fa8f0', side: '#9cc6ff', belly: '#eef6ff', accent: '#bfe4ff', mark: '#5a94e0' },
    scale: 2.64, biped: false, body: { len: 1.0, rx: 0.5, ry: 0.36 },
    neck: { fwd: 0.7, up: 1.0, r: 0.15 }, head: { r: 0.28, snout: 0.35 }, tail: { len: 0.5, r: 0.18 }, leg: { len: 0, r: 0 },
    feat: ['spots'], personality: 'calm', speed: 2, herd: [1, 1], weight: 0,
  }),
  S({
    id: 'dino-mosa', name: '모사사우루스', rarity: 5, price: 0, habitat: 'deep',
    desc: '먼바다의 커다란 그림자. 아무도 얼굴을 제대로 본 적이 없다.',
    col: { top: '#28466a', side: '#28466a', belly: '#28466a', accent: '#28466a' },
    scale: 7.20, biped: false, body: { len: 1, rx: 0.4, ry: 0.3 }, neck: { fwd: 0, up: 0, r: 0 },
    head: { r: 0.3, snout: 0.3 }, tail: { len: 1, r: 0.2 }, leg: { len: 0, r: 0 },
    feat: [], personality: 'calm', speed: 4, herd: [1, 1], weight: 0,
  }),
];

export const DINO_BY_ID = new Map(DINOS.map((d) => [d.id, d]));
/** 땅 위 무리로 나오는 종 */
export const LAND_DINOS = DINOS.filter((d) => d.habitat === 'land');

export type FossilModel = 'bone' | 'skull' | 'ammonite' | 'amber' | 'tooth' | 'footprint' | 'egg';
export interface FossilSpec extends Species { model: FossilModel; tint: string; weight: number }

const F = (o: Omit<FossilSpec, 'category'>): FossilSpec => ({ ...o, category: 'fossil' });
export const FOSSILS: FossilSpec[] = [
  F({ id: 'fossil-ammonite', name: '암모나이트', rarity: 1, price: 300, model: 'ammonite', tint: '#e8c79a', weight: 5, desc: '돌돌 말린 옛날 조개. 소용돌이를 세다 보면 졸리다.' }),
  F({ id: 'fossil-bone', name: '공룡 뼈 조각', rarity: 1, price: 250, model: 'bone', tint: '#f3e6cc', weight: 6, desc: '누구 뼈인지는 아무도 모른다.' }),
  F({ id: 'fossil-tooth', name: '티라노 이빨', rarity: 2, price: 600, model: 'tooth', tint: '#fff4dc', weight: 3, desc: '생각보다 작고 귀엽다.' }),
  F({ id: 'fossil-footprint', name: '발자국 화석', rarity: 2, price: 500, model: 'footprint', tint: '#d8b98e', weight: 3, desc: '쿵! 하고 찍힌 세 발가락.' }),
  F({ id: 'fossil-egg', name: '알 화석', rarity: 3, price: 900, model: 'egg', tint: '#e9d2b0', weight: 2, desc: '아직 따뜻한 것 같다(기분 탓).' }),
  F({ id: 'fossil-skull', name: '트리케라톱스 두개골', rarity: 4, price: 2400, model: 'skull', tint: '#f6ead2', weight: 1, desc: '박물관 관장이 보면 기절할지도.' }),
  F({ id: 'fossil-amber', name: '호박 속 모기', rarity: 4, price: 2000, model: 'amber', tint: '#ffb43c', weight: 1, desc: '노란 보석 안에 아주 작은 친구가 잠들어 있다.' }),
  F({ id: 'fossil-raptor-claw', name: '랩터 발톱', rarity: 3, price: 1100, model: 'tooth', tint: '#efe2c8', weight: 2, desc: '휘어진 갈고리. 등 긁개로 딱이다.' }),
];

/** 먹이로 줄 수 있는 과일 아이템 id(가방) */
export const FRUITS = ['apple', 'peach', 'orange', 'pear', 'cherry', 'coconut', 'banana', 'fruit-apple', 'fruit-peach', 'fruit-orange', 'fruit-pear'];
