// 공룡 섬 데이터 — 공룡 도감 25칸(category 'dino')·화석 조각 60개 + 골격 20칸(category 'fossil')·공룡 선물 가구.
// GDD 3.7 표가 정본. 예전 id(dino-trike …)는 바꾸지 않고 gdd 별칭(z_triceratops …)을 단다(계약 v2 3장 ID 정책).
// 순수 데이터 — three·DOM 없음. hud·economy·treasure 가 읽어도 된다.
import type { Species } from '../../core/state';
import type { Part } from '../../core/art';

export type Feature =
  | 'frill' | 'horns3' | 'plates' | 'sail' | 'dome' | 'crest' | 'crests2' | 'club' | 'shell'
  | 'feathers' | 'tailSpikes' | 'eggHat' | 'noseHorn' | 'spots' | 'stripes' | 'beak'
  // 3A 새 종
  | 'thumb' | 'claws' | 'fluffy' | 'tusks' | 'trunk' | 'fangs' | 'ears' | 'crown';

export type Personality = 'curious' | 'shy' | 'follow' | 'calm';
export type Habitat = 'land' | 'sky' | 'sea' | 'deep' | 'nest';
/** GDD 0.3 공룡 몸형 5종 */
export type DinoForm = 'QUAD' | 'BIPED' | 'LONGNECK' | 'WING' | 'SWIM';
/** 무리가 사는 구역(섬 안 배치) — logic.habitatAt 이 좌표에서 고른다 */
export type DinoZone =
  | 'meadow' | 'forest' | 'jungle' | 'volcano' | 'lake' | 'swamp' | 'nest' | 'summit' | 'tino'
  | 'snowfield' | 'snowpeak' | 'snowforest' | 'sea' | 'deep';
/** GDD 시간 칸: 종일 / 아침·낮·저녁·밤 */
export type TimeCode = 'morning' | 'day' | 'sunset' | 'night';

/** 좋아하는 먹이: 정확한 아이템 / 과일 아무거나 / ★ 이상 물고기 */
export interface Fav { items?: string[]; fruit?: boolean; fish?: number }

/** 하트 5(P0 2) 보상 */
export type Reward =
  | { kind: 'mount'; ride: { walk: number; run: number; cam: number; mode: 'land' | 'glide' | 'water'; charge?: boolean }; text: string }
  | { kind: 'pet'; flock?: number; text: string }
  | { kind: 'gift'; perDay: number; items: Array<{ id: string; w: number; n?: [number, number] }>; verb: string; fx: 'thump' | 'headbutt' | 'pick' | 'feather'; text: string }
  | { kind: 'item'; item: string; text: string }
  | { kind: 'pose'; pose: string; line: string; text: string }
  | { kind: 'p1'; text: string };

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
  /** 탈 수 있는 종(안장을 그린다) */
  mount?: boolean;
  /** 무리 크기 [최소, 최대] */
  herd: [number, number];
  /** 출현 가중치(0 = 무리로 안 나온다) */
  weight: number;
  // ── GDD 3.7 칸
  gdd: string;
  form: DinoForm;
  diet: 'herb' | 'carni';
  /** 좋아하는 먹이(null = 먹이 안 받음: 모사) */
  fav: Fav | null;
  /** 사는 섬 */
  home: 'dino' | 'ice' | 'sea';
  zones: DinoZone[];
  /** 깨어 노는 시간('all' = 종일) */
  time: 'all' | TimeCode[];
  /** 행동 한 줄 */
  behavior: string;
  reward: Reward;
}

// GDD 0.7 판매가 바탕(화석 조각 값에 쓴다)
const BASE: Record<number, number> = { 1: 60, 2: 200, 3: 700, 4: 2500, 5: 9000 };
const round10 = (v: number) => Math.max(10, Math.round(v / 10) * 10);

type DinoIn = Omit<DinoSpec, 'category' | 'price' | 'tags' | 'len' | 'shadow' | 'where' | 'look' | 'diet'> & { parts?: Part[]; len?: number };
/** 몸 크기 → 0.8 그림자 칸 */
const shadowOf = (scale: number): DinoSpec['shadow'] => (scale < 1 ? 'M' : scale < 1.7 ? 'L' : scale < 2.6 ? 'XL' : 'XXL');
const ZONE_CODE: Record<DinoZone, string> = {
  meadow: 'ranch', forest: 'fern', jungle: 'jungle', volcano: 'volcano', lake: 'ancientlake', swamp: 'swamp', nest: 'fossil',
  summit: 'crater', tino: 'ranch', snowfield: 'snow', snowpeak: 'snow', snowforest: 'snowtree', sea: 'shore', deep: 'trench',
};
const S = (o: DinoIn): DinoSpec => {
  const diet: 'herb' | 'carni' = o.fav && o.fav.fish ? 'carni' : 'herb';
  const island = o.home === 'sea' ? (o.zones.includes('deep') ? 'any' : 'dino') : o.home;
  return {
    ...o,
    category: 'dino', price: 0, diet,
    len: o.len ?? Math.round(o.scale * 110),
    shadow: shadowOf(o.scale),
    tags: ['ancient', ...(diet === 'carni' ? ['food:carni'] : []), ...(o.witness ? ['witness'] : [])],
    where: o.zones.map((z) => ({ island, zone: ZONE_CODE[z], time: o.time === 'all' ? undefined : [...o.time] })),
    look: { parts: o.parts ?? [] },
  };
};

const FERN: Fav = { items: ['m_fern'] };
const FRUIT: Fav = { fruit: true };
const FISH: Fav = { fish: 1 };

export const DINOS: DinoSpec[] = [
  // ── 초식 ──
  S({
    id: 'z_iguanodon', gdd: 'z_iguanodon', name: '엄지척', rarity: 1, habitat: 'land', form: 'BIPED', home: 'dino', zones: ['meadow'], time: 'all',
    desc: '엄지 뿔을 척 세우고 "좋아요!" 한다. 이구아노돈.', behavior: '풀 뜯기, 엄지 "좋아요"',
    col: { top: '#a8e06a', side: '#c6ee94', belly: '#fff1cf', accent: '#fff6e2', mark: '#8fd05a' },
    scale: 1.8, biped: true, body: { len: 0.95, rx: 0.44, ry: 0.44, tilt: 0.3 },
    neck: { fwd: 0.22, up: 0.3, r: 0.24 }, head: { r: 0.38, ry: 0.34, rz: 0.4, snout: 0.36 },
    tail: { len: 0.85, r: 0.26, up: 0.1 }, leg: { len: 0.36, r: 0.15 }, arm: { len: 0.22, r: 0.07 },
    feat: ['thumb', 'beak'], parts: ['horn'], personality: 'calm', speed: 1.3, herd: [3, 5], weight: 1.4,
    fav: FERN, reward: { kind: 'pose', pose: 'peace', line: '엄지척! 찰칵!', text: '사진 포즈 "엄지척"을 같이 해 줘요' },
  }),
  S({
    id: 'dino-proto', gdd: 'z_protoceratops', name: '꼬마프로토', rarity: 1, habitat: 'land', form: 'QUAD', home: 'dino', zones: ['meadow'], time: 'all',
    desc: '작은 프릴이 자랑. 친해지면 졸졸 따라온다. 프로토케라톱스.', behavior: '졸졸 따라옴',
    col: { top: '#ffc59a', side: '#ffd6b5', belly: '#fff1cf', accent: '#fff6e2', mark: '#ffb07a' },
    scale: 1.14, biped: false, body: { len: 0.85, rx: 0.4, ry: 0.36 },
    neck: { fwd: 0.18, up: 0.08, r: 0.24 }, head: { r: 0.42, ry: 0.38, rz: 0.42, snout: 0.32 },
    tail: { len: 0.5, r: 0.2, up: 0.08 }, leg: { len: 0.24, r: 0.12 },
    feat: ['frill', 'noseHorn', 'beak'], parts: ['frill'], personality: 'curious', speed: 1.5, herd: [3, 5], weight: 1.3,
    fav: FRUIT, reward: { kind: 'pet', text: '어디든 졸졸 따라다니는 펫이 돼요' },
  }),
  S({
    id: 'dino-trike', gdd: 'z_triceratops', name: '뿔뿔이', rarity: 2, habitat: 'land', form: 'QUAD', home: 'dino', zones: ['meadow'], time: ['day'],
    desc: '말랑해 보이는 뿔 세 개로 바위를 영차 민다. 트리케라톱스.', behavior: '머리로 바위 밀기', mount: true,
    col: { top: '#8fd3f4', side: '#b6e4f8', belly: '#fff1cf', accent: '#ff9fb8', mark: '#ff9fb8' },
    scale: 2.04, biped: false, body: { len: 1.0, rx: 0.5, ry: 0.42 },
    neck: { fwd: 0.22, up: 0.08, r: 0.3 }, head: { r: 0.44, ry: 0.4, rz: 0.46, snout: 0.42 },
    tail: { len: 0.55, r: 0.24, up: 0.05 }, leg: { len: 0.3, r: 0.14 },
    feat: ['frill', 'horns3', 'beak'], parts: ['horn3', 'frill-heart'], personality: 'calm', speed: 1.3, herd: [2, 4], weight: 1.3,
    fav: FRUIT, reward: { kind: 'mount', ride: { walk: 7, run: 12, cam: 1.35, mode: 'land', charge: true }, text: '타고 돌진! Shift 로 바위를 깨면 철광석이 나와요' },
  }),
  S({
    id: 'dino-stego', gdd: 'z_stegosaurus', name: '접시등', rarity: 2, habitat: 'land', form: 'QUAD', home: 'dino', zones: ['volcano'], time: ['day'],
    desc: '등판 위에서 낮잠을 잘 수 있을 만큼 순하다. 스테고사우루스.', behavior: '햇볕 쬐기',
    col: { top: '#9bb35a', side: '#b5c97a', belly: '#fff1cf', accent: '#ff9fb8', mark: '#87a04a' },
    scale: 1.92, biped: false, body: { len: 1.05, rx: 0.46, ry: 0.46 },
    neck: { fwd: 0.3, up: -0.08, r: 0.2 }, head: { r: 0.32, ry: 0.29, rz: 0.36, snout: 0.35 },
    tail: { len: 0.85, r: 0.24, up: 0.25 }, leg: { len: 0.3, r: 0.14 },
    feat: ['plates', 'tailSpikes'], parts: ['plates', 'spikes'], personality: 'calm', speed: 1.1, herd: [2, 3], weight: 1.1,
    fav: FERN, reward: { kind: 'item', item: 'f_stego_plate', text: '꽃 등판 장식을 선물로 줘요' },
  }),
  S({
    id: 'dino-ankylo', gdd: 'z_ankylosaurus', name: '망치꼬리', rarity: 2, habitat: 'land', form: 'QUAD', home: 'dino', zones: ['volcano'], time: 'all',
    desc: '꼬리 망치로 바위를 쿵! 가끔 좋은 걸 떨어뜨린다. 안킬로사우루스.', behavior: '꼬리로 바위·나무 쿵',
    col: { top: '#e9d3a8', side: '#f1e0bd', belly: '#fff1cf', accent: '#a8764f', mark: '#f4e2b0' },
    scale: 1.74, biped: false, body: { len: 1.0, rx: 0.56, ry: 0.36 },
    neck: { fwd: 0.18, up: 0.0, r: 0.24 }, head: { r: 0.34, ry: 0.28, rz: 0.36, snout: 0.25 },
    tail: { len: 0.75, r: 0.18, up: 0.05 }, leg: { len: 0.22, r: 0.14 },
    feat: ['shell', 'club'], parts: ['club-tail', 'spikes'], personality: 'shy', speed: 0.9, herd: [1, 3], weight: 0.9,
    fav: FRUIT,
    reward: { kind: 'gift', perDay: 3, verb: '꼬리 쿵!', fx: 'thump', items: [{ id: 'm_iron', w: 45 }, { id: 'm_stone', w: 25, n: [1, 3] }, { id: 'm_apple', w: 15 }, { id: 'm_peach', w: 15 }], text: '하루 3번, 꼬리로 쿵! 광석·과일을 떨어뜨려 줘요' },
  }),
  S({
    id: 'dino-parasaur', gdd: 'z_parasaurolophus', name: '나팔이', rarity: 2, habitat: 'land', form: 'BIPED', home: 'dino', zones: ['lake'], time: ['morning'],
    desc: '머리 뒤 나팔 볏으로 아침마다 뿌우~ 합창한다. 파라사우롤로푸스.', behavior: '아침 합창 "뿌우~"',
    col: { top: '#ffd84a', side: '#ffe68a', belly: '#fff1cf', accent: '#ffa24c', mark: '#ffc93a' },
    scale: 1.86, biped: true, body: { len: 0.95, rx: 0.4, ry: 0.42, tilt: 0.22 },
    neck: { fwd: 0.28, up: 0.38, r: 0.2 }, head: { r: 0.34, ry: 0.32, rz: 0.36, snout: 0.4 },
    tail: { len: 0.85, r: 0.24, up: 0.1 }, leg: { len: 0.38, r: 0.14 }, arm: { len: 0.2, r: 0.06 },
    feat: ['crest', 'beak'], parts: ['crest'], personality: 'calm', speed: 1.4, herd: [2, 4], weight: 1.1,
    fav: FERN, reward: { kind: 'item', item: 'f_dino_musicbox', text: '뿌우~ 소리가 나는 음악 상자를 줘요' },
  }),
  S({
    id: 'dino-pachy', gdd: 'z_pachy', name: '박치기', rarity: 2, habitat: 'land', form: 'BIPED', home: 'dino', zones: ['forest'], time: ['day'],
    desc: '나무에 콩! 박치기하면 열매랑 벌레가 우수수. 파키케팔로사우루스.', behavior: '나무 박치기',
    col: { top: '#8fd3f4', side: '#b6e4f8', belly: '#fff1cf', accent: '#a8764f', mark: '#8f6340' },
    scale: 1.44, biped: true, body: { len: 0.8, rx: 0.36, ry: 0.38, tilt: 0.35 },
    neck: { fwd: 0.16, up: 0.24, r: 0.22 }, head: { r: 0.42, ry: 0.4, rz: 0.42, snout: 0.24 },
    tail: { len: 0.75, r: 0.22, up: 0.12 }, leg: { len: 0.32, r: 0.12 }, arm: { len: 0.14, r: 0.05 },
    feat: ['dome'], parts: ['dome-skull'], personality: 'curious', speed: 1.8, herd: [2, 4], weight: 1.0,
    fav: FRUIT,
    reward: { kind: 'gift', perDay: 3, verb: '박치기!', fx: 'headbutt', items: [{ id: 'm_apple', w: 30 }, { id: 'm_peach', w: 25 }, { id: 'm_ginkgo', w: 25 }, { id: 'm_pear', w: 20 }], text: '하루 3번 나무 박치기! 열매와 벌레가 떨어져요' },
  }),
  S({
    id: 'dino-galli', gdd: 'z_gallimimus', name: '달리미', rarity: 2, habitat: 'land', form: 'BIPED', home: 'dino', zones: ['meadow'], time: ['sunset'],
    desc: '섬에서 제일 빠른 달리기 선수. 저녁이면 무리 지어 질주한다. 갈리미무스.', behavior: '무리 질주', mount: true,
    col: { top: '#ffc59a', side: '#ffd9bb', belly: '#fffaf2', accent: '#ffa24c', mark: '#ffb07a' },
    scale: 1.5, biped: true, body: { len: 0.75, rx: 0.32, ry: 0.32, tilt: 0.1 },
    neck: { fwd: 0.22, up: 0.55, r: 0.13 }, head: { r: 0.3, ry: 0.28, rz: 0.32, snout: 0.3 },
    tail: { len: 0.8, r: 0.18, up: 0.15 }, leg: { len: 0.5, r: 0.1 }, arm: { len: 0.18, r: 0.045 },
    feat: ['beak', 'feathers'], parts: ['legs-long', 'feathers'], personality: 'shy', speed: 3.2, herd: [3, 5], weight: 1.0,
    fav: FRUIT, reward: { kind: 'mount', ride: { walk: 8, run: 16, cam: 1.15, mode: 'land' }, text: '땅 위에서 제일 빠른 탈것(16 m/s)!' },
  }),
  S({
    id: 'dino-brachio', gdd: 'z_brachio', name: '목길어', rarity: 3, habitat: 'land', form: 'LONGNECK', home: 'dino', zones: ['forest'], time: ['day'],
    desc: '목이 길어서 구름 냄새를 맡을 수 있다. 세상에서 제일 순한 거인. 브라키오사우루스.', behavior: '높은 나무 잎 먹기',
    col: { top: '#8fd3f4', side: '#b6e4f8', belly: '#fff1cf', accent: '#ffd0de', mark: '#fffaf2' },
    scale: 3.48, biped: false, body: { len: 1.15, rx: 0.52, ry: 0.5 },
    neck: { fwd: 0.55, up: 1.55, r: 0.17 }, head: { r: 0.3, ry: 0.27, rz: 0.33, snout: 0.3 },
    tail: { len: 1.0, r: 0.24, up: 0.15 }, leg: { len: 0.55, r: 0.16 },
    feat: ['spots'], parts: [], personality: 'calm', speed: 0.9, herd: [1, 2], weight: 0.7,
    fav: FRUIT, reward: { kind: 'p1', text: '목 엘리베이터로 절벽 위에 데려다줄 거래요(준비 중)' },
  }),
  S({
    id: 'z_apatosaurus', gdd: 'z_apatosaurus', name: '미끄럼틀', rarity: 3, habitat: 'land', form: 'LONGNECK', home: 'dino', zones: ['lake'], time: ['day'],
    desc: '긴 꼬리를 호수에 담그고 첨벙첨벙. 꼬리가 미끄럼틀 같다. 아파토사우루스.', behavior: '호수에 발 담그기',
    col: { top: '#c9b6f2', side: '#dccdf7', belly: '#f6f0ff', accent: '#ffd0de', mark: '#b49fe6' },
    scale: 3.1, biped: false, body: { len: 1.25, rx: 0.5, ry: 0.46 },
    neck: { fwd: 0.85, up: 1.1, r: 0.16 }, head: { r: 0.28, ry: 0.26, rz: 0.32, snout: 0.28 },
    tail: { len: 1.6, r: 0.26, up: 0.05 }, leg: { len: 0.5, r: 0.16 },
    feat: ['spots'], parts: [], personality: 'calm', speed: 0.9, herd: [1, 2], weight: 0.6,
    fav: FERN, reward: { kind: 'p1', text: '꼬리 미끄럼틀 → 호수 풍덩! (준비 중)' },
  }),
  S({
    id: 'z_oviraptor', gdd: 'z_oviraptor', name: '알도둑', rarity: 3, habitat: 'nest', form: 'BIPED', home: 'dino', zones: ['nest'], time: ['morning'],
    desc: '이름은 도둑이지만 사실 알을 소중히 품는 엄마. 가방 과일은 조금 훔친다. 오비랍토르.', behavior: '가방 과일 훔쳐 도망',
    col: { top: '#ffa24c', side: '#ffc17e', belly: '#fff1cf', accent: '#4a9cf0', mark: '#ff8f3a' },
    scale: 1.25, biped: true, body: { len: 0.75, rx: 0.34, ry: 0.36, tilt: 0.25 },
    neck: { fwd: 0.2, up: 0.36, r: 0.16 }, head: { r: 0.36, ry: 0.34, rz: 0.36, snout: 0.26 },
    tail: { len: 0.7, r: 0.2, up: 0.2 }, leg: { len: 0.4, r: 0.11 }, arm: { len: 0.2, r: 0.05 },
    feat: ['crest', 'beak', 'feathers'], parts: ['crest', 'feathers'], personality: 'curious', speed: 2.6, herd: [2, 3], weight: 0.9,
    fav: FRUIT, reward: { kind: 'p1', text: '쫓아가 잡으면 공룡 알을 준대요(준비 중)' },
  }),
  S({
    id: 'z_therizino', gdd: 'z_therizino', name: '손톱정원사', rarity: 3, habitat: 'land', form: 'BIPED', home: 'dino', zones: ['jungle'], time: ['day'],
    desc: '긴 손톱은 과일 따기 전용. 복슬복슬 크림색 정원사. 테리지노사우루스.', behavior: '긴 손톱으로 과일 따기',
    col: { top: '#fff1cf', side: '#fff6de', belly: '#fffaf2', accent: '#ffe0b8', mark: '#f4e2b0' },
    scale: 1.9, biped: true, body: { len: 0.9, rx: 0.5, ry: 0.5, tilt: 0.55 },
    neck: { fwd: 0.18, up: 0.4, r: 0.2 }, head: { r: 0.3, ry: 0.28, rz: 0.3, snout: 0.22 },
    tail: { len: 0.6, r: 0.24, up: 0.15 }, leg: { len: 0.36, r: 0.16 }, arm: { len: 0.3, r: 0.08 },
    feat: ['claws', 'feathers', 'fluffy', 'beak'], parts: ['long-claws', 'feathers', 'fluffy'], personality: 'calm', speed: 1.0, herd: [1, 2], weight: 0.8,
    fav: FRUIT,
    reward: { kind: 'gift', perDay: 5, verb: '과일 따 줘!', fx: 'pick', items: [{ id: 'm_apple', w: 25 }, { id: 'm_peach', w: 20 }, { id: 'm_orange', w: 20 }, { id: 'm_banana', w: 15 }, { id: 'm_coconut', w: 10 }, { id: 'm_cherry', w: 10 }], text: '하루 5개 과일을 따 줘요' },
  }),
  // ── 육식(물고기 좋아함) ──
  S({
    id: 'z_compy', gdd: 'z_compy', name: '졸졸이', rarity: 1, habitat: 'land', form: 'BIPED', home: 'dino', zones: ['jungle'], time: ['day'],
    desc: '다섯 마리가 한 줄로 졸졸졸. 물고기 냄새를 귀신같이 맡는다. 콤프소그나투스.', behavior: '떼로 뒤를 따라다님',
    col: { top: '#a8e06a', side: '#c8ef9a', belly: '#fff1cf', accent: '#ffd84a', mark: '#ffd84a' },
    scale: 0.62, biped: true, body: { len: 0.7, rx: 0.3, ry: 0.32, tilt: 0.2 },
    neck: { fwd: 0.18, up: 0.3, r: 0.15 }, head: { r: 0.4, ry: 0.37, rz: 0.4, snout: 0.3 },
    tail: { len: 0.9, r: 0.18, up: 0.2 }, leg: { len: 0.34, r: 0.1 }, arm: { len: 0.14, r: 0.04 },
    feat: ['stripes'], parts: [], personality: 'curious', speed: 2.4, herd: [5, 5], weight: 1.0,
    fav: FISH, reward: { kind: 'pet', flock: 5, text: '다섯 마리 떼로 졸졸 따라다녀요' },
  }),
  S({
    id: 'dino-raptor', gdd: 'z_raptor', name: '콩콩이', rarity: 2, habitat: 'land', form: 'BIPED', home: 'dino', zones: ['forest'], time: ['day'],
    desc: '깃털 공 같은 몸으로 덤불에 쏙 숨는다. 숨바꼭질 대장. 깃털 랩터.', behavior: '숨바꼭질(덤불에 숨음)',
    col: { top: '#6fc4f2', side: '#9adaf8', belly: '#f4fbff', accent: '#ffb35c', mark: '#4fa9e0' },
    scale: 1.38, biped: true, body: { len: 0.85, rx: 0.32, ry: 0.34, tilt: 0.18 },
    neck: { fwd: 0.24, up: 0.32, r: 0.17 }, head: { r: 0.34, ry: 0.31, rz: 0.37, snout: 0.42 },
    tail: { len: 1.0, r: 0.2, up: 0.18 }, leg: { len: 0.42, r: 0.11 }, arm: { len: 0.2, r: 0.05 },
    feat: ['feathers', 'stripes'], parts: ['feathers'], personality: 'shy', speed: 2.6, herd: [3, 3], weight: 1.0,
    fav: FISH, reward: { kind: 'pet', text: '깃털 친구가 졸졸 따라다녀요' },
  }),
  S({
    id: 'dino-dilo', gdd: 'z_dilopho', name: '짜잔', rarity: 3, habitat: 'land', form: 'BIPED', home: 'dino', zones: ['jungle'], time: ['sunset'],
    desc: '목도리를 활짝 펴며 "짜잔!" 머리 볏 두 개는 리본이라고 우긴다. 딜로포사우루스.', behavior: '목도리 펼치며 "짜잔"',
    col: { top: '#5cc16a', side: '#86d68e', belly: '#fff1cf', accent: '#ffd84a', mark: '#ffd84a' },
    scale: 1.56, biped: true, body: { len: 0.85, rx: 0.36, ry: 0.38, tilt: 0.28 },
    neck: { fwd: 0.22, up: 0.32, r: 0.19 }, head: { r: 0.36, ry: 0.33, rz: 0.38, snout: 0.38 },
    tail: { len: 0.9, r: 0.22, up: 0.12 }, leg: { len: 0.36, r: 0.12 }, arm: { len: 0.16, r: 0.05 },
    feat: ['crests2', 'frill'], parts: ['frill', 'crest'], personality: 'curious', speed: 1.7, herd: [1, 3], weight: 0.8,
    fav: FISH, reward: { kind: 'pose', pose: 'peace', line: '짜잔~! 목도리 활짝!', text: '사진 찍을 때 목도리를 활짝 펴 줘요' },
  }),
  S({
    id: 'dino-trex', gdd: 'z_baby_rex', name: '꼬마렉스', rarity: 3, habitat: 'land', form: 'BIPED', home: 'dino', zones: ['volcano'], time: ['day'],
    desc: '"꺅!" 하고 작게 포효한다. 팔이 짧아서 박수를 못 친다. 아기 티라노.', behavior: '"꺅!" 포효(작음)',
    col: { top: '#5fc98a', side: '#8fe0a6', belly: '#fff3c9', accent: '#ffd36b', mark: '#45b07a' },
    scale: 1.86, biped: true, body: { len: 0.95, rx: 0.42, ry: 0.44, tilt: 0.42 },
    neck: { fwd: 0.18, up: 0.3, r: 0.3 }, head: { r: 0.5, ry: 0.44, rz: 0.5, snout: 0.38 },
    tail: { len: 0.95, r: 0.3, up: 0.1 }, leg: { len: 0.34, r: 0.15 }, arm: { len: 0.16, r: 0.06 },
    feat: ['spots'], parts: [], personality: 'curious', speed: 1.6, herd: [1, 2], weight: 0.9,
    fav: FISH, reward: { kind: 'pet', text: '소리를 따라 하며 졸졸 따라다녀요' },
  }),
  S({
    id: 'dino-spino', gdd: 'z_spino', name: '돛등이', rarity: 4, habitat: 'land', form: 'BIPED', home: 'dino', zones: ['swamp'], time: ['sunset'],
    desc: '늪에서 낚시를 한다. 등 돛을 펴고 해바라기. 스피노사우루스.', behavior: '늪에서 낚시',
    col: { top: '#3fc7b4', side: '#7fdcd2', belly: '#f2fff8', accent: '#ffa24c', mark: '#35ae9e' },
    scale: 2.22, biped: true, body: { len: 1.05, rx: 0.4, ry: 0.42, tilt: 0.3 },
    neck: { fwd: 0.26, up: 0.32, r: 0.24 }, head: { r: 0.4, ry: 0.34, rz: 0.46, snout: 0.6 },
    tail: { len: 1.1, r: 0.26, up: 0.1 }, leg: { len: 0.34, r: 0.14 }, arm: { len: 0.2, r: 0.07 },
    feat: ['sail'], parts: ['sail', 'snout-long'], personality: 'calm', speed: 1.3, herd: [1, 1], weight: 0.5,
    fav: { fish: 3 }, reward: { kind: 'p1', text: '낚시 대결을 하자고 해요(이기면 황금 미끼!)' },
  }),
  S({
    id: 'z_tino', gdd: 'z_tino', name: '대장렉스 티노', rarity: 5, habitat: 'land', form: 'BIPED', home: 'dino', zones: ['tino'], time: ['sunset', 'night'],
    desc: '낮엔 언덕에서 쿨쿨. 깨면 쫓아오지만 짧은 팔로는 안을 수가 없어 시무룩. 티라노 어른.', behavior: '스텔스 놀이, 깨면 쫓아오다 시무룩',
    col: { top: '#ffa24c', side: '#ffbe7e', belly: '#fff1cf', accent: '#ffcf4a', mark: '#ff9038' },
    scale: 3.4, biped: true, body: { len: 1.0, rx: 0.48, ry: 0.48, tilt: 0.4 },
    neck: { fwd: 0.2, up: 0.3, r: 0.32 }, head: { r: 0.52, ry: 0.44, rz: 0.54, snout: 0.45 },
    tail: { len: 1.1, r: 0.32, up: 0.08 }, leg: { len: 0.4, r: 0.17 }, arm: { len: 0.13, r: 0.055 },
    feat: ['crown', 'spots'], parts: ['crown'], personality: 'calm', speed: 1.4, herd: [1, 1], weight: 0,
    fav: FISH, reward: { kind: 'p1', text: '물고기 선물 30번이면 전설의 탈것이 된대요(준비 중)' },
  }),
  // ── 하늘·물(목격형) ──
  S({
    id: 'dino-ptera', gdd: 'z_pteranodon', name: '슝슝이', rarity: 3, habitat: 'sky', form: 'WING', home: 'dino', zones: ['nest'], time: ['day'], witness: true,
    desc: '둥지 절벽에서 바람을 타고 슝~. 플레이어에게 활공을 가르쳐 줬다는 소문. 프테라노돈.', behavior: '절벽에서 활공', mount: true,
    col: { top: '#8fd3f4', side: '#b6e4f8', belly: '#fff1cf', accent: '#ffd84a', mark: '#7cc4ea' },
    scale: 2.16, biped: true, body: { len: 0.6, rx: 0.26, ry: 0.26, tilt: 0.25 },
    neck: { fwd: 0.15, up: 0.12, r: 0.14 }, head: { r: 0.28, snout: 0.5 }, tail: { len: 0.2, r: 0.1 }, leg: { len: 0.26, r: 0.07 },
    feat: ['crest', 'beak'], parts: ['crest'], personality: 'calm', speed: 1.2, herd: [1, 2], weight: 0.6,
    fav: FISH, reward: { kind: 'mount', ride: { walk: 4, run: 6, cam: 1.5, mode: 'glide' }, text: '높은 곳에서 출발해 하늘을 활공해요! 하루 깃털 2개도 줘요' },
  }),
  S({
    id: 'z_quetzal', gdd: 'z_quetzal', name: '꼬마케찰', rarity: 4, habitat: 'sky', form: 'WING', home: 'dino', zones: ['summit'], time: ['day'],
    desc: '화산 꼭대기에서 바람을 탄다. 꼬마라는데 날개가 집채만 하다. 케찰코아틀루스.', behavior: '정상에서 바람 타기',
    col: { top: '#ff9fb8', side: '#ffc2d2', belly: '#fffaf2', accent: '#fffaf2', mark: '#ff8aa8' },
    scale: 2.8, biped: true, body: { len: 0.65, rx: 0.28, ry: 0.28, tilt: 0.3 },
    neck: { fwd: 0.3, up: 0.35, r: 0.13 }, head: { r: 0.3, snout: 0.6 }, tail: { len: 0.2, r: 0.1 }, leg: { len: 0.3, r: 0.07 },
    feat: ['crest', 'beak'], parts: ['crest'], personality: 'calm', speed: 1.0, herd: [1, 1], weight: 0.5,
    fav: { fish: 4 }, reward: { kind: 'p1', text: '섬 사이를 날아 주는 탈것이 될 거래요(준비 중)' },
  }),
  S({
    id: 'dino-plesio', gdd: 'z_plesio', name: '목욕룡', rarity: 4, habitat: 'sea', form: 'SWIM', home: 'sea', zones: ['sea', 'lake'], time: ['day'], witness: true,
    desc: '고대 호수와 앞바다의 수영 선생님. 목을 쭉 빼고 인사한다. 플레시오사우루스.', behavior: '고개 내밀기', mount: true,
    col: { top: '#6fa8f0', side: '#9cc6ff', belly: '#eef6ff', accent: '#bfe4ff', mark: '#5a94e0' },
    scale: 2.64, biped: false, body: { len: 1.0, rx: 0.5, ry: 0.36 },
    neck: { fwd: 0.7, up: 1.0, r: 0.15 }, head: { r: 0.28, snout: 0.35 }, tail: { len: 0.5, r: 0.18 }, leg: { len: 0, r: 0 },
    feat: ['spots'], parts: [], personality: 'calm', speed: 2, herd: [1, 1], weight: 0,
    fav: FISH, reward: { kind: 'mount', ride: { walk: 7, run: 10.5, cam: 1.6, mode: 'water' }, text: '물 위 탈것! 수영보다 3배 빨라요' },
  }),
  S({
    id: 'dino-mosa', gdd: 'z_mosasaur', name: '바다왕 모사', rarity: 5, habitat: 'deep', form: 'SWIM', home: 'sea', zones: ['deep'], time: ['night'], witness: true,
    desc: '먼바다의 커다란 그림자. 잠수정 앞을 한 바퀴 돌고 사라진다. 모사사우루스.', behavior: '한 바퀴 돌고 사라짐',
    col: { top: '#3b5bb5', side: '#5a78c8', belly: '#fffaf2', accent: '#3b5bb5' },
    scale: 7.2, biped: false, body: { len: 1, rx: 0.4, ry: 0.3 }, neck: { fwd: 0, up: 0, r: 0 },
    head: { r: 0.3, snout: 0.3 }, tail: { len: 1, r: 0.2 }, leg: { len: 0, r: 0 },
    feat: [], parts: [], personality: 'calm', speed: 4, herd: [1, 1], weight: 0,
    fav: null, reward: { kind: 'p1', text: '협동 낚시를 같이 할 거래요(준비 중)' },
  }),
  // ── 빙하기 손님(솜눈섬) ──
  // 매머드는 무리로 안 나온다(weight 0): 빙하 속에 얼어 있다가(secrets ice-mammoth) 녹이면 dino:z_mammoth 가 풀리고
  // 눈사람 마을에 한 마리가 산다(dinos.ts 녹은 매머드). zones 는 도감·구역 표시용.
  S({
    id: 'z_mammoth', gdd: 'z_mammoth', name: '털뭉치 매머드', rarity: 4, habitat: 'land', form: 'QUAD', home: 'ice', zones: ['snowfield'], time: 'all',
    desc: '털뭉치 아기 매머드. 코로 눈을 퐁퐁 뿌린다. 빙하기 손님.', behavior: '코로 눈 뿌리기',
    col: { top: '#a8764f', side: '#bf8e64', belly: '#e9d3a8', accent: '#fff1cf', mark: '#8f6340' },
    scale: 1.5, biped: false, body: { len: 0.95, rx: 0.55, ry: 0.55 },
    neck: { fwd: 0.15, up: 0.12, r: 0.38 }, head: { r: 0.5, ry: 0.48, rz: 0.46, snout: 0.1 },
    tail: { len: 0.25, r: 0.08, up: 0 }, leg: { len: 0.3, r: 0.17 },
    feat: ['fluffy', 'tusks', 'trunk', 'ears'], parts: ['fluffy'], personality: 'follow', speed: 1.0, herd: [1, 1], weight: 0,
    fav: { items: ['m_frostberry'] }, reward: { kind: 'pet', text: '털뭉치 아기가 졸졸 따라다녀요' },
  }),
  S({
    id: 'z_sabertooth', gdd: 'z_sabertooth', name: '송곳니 검치호', rarity: 3, habitat: 'land', form: 'QUAD', home: 'ice', zones: ['snowpeak'], time: ['night'],
    desc: '송곳니는 길지만 하는 짓은 고양이. 눈 위에서 데굴데굴. 빙하기 손님.', behavior: '눈 위에서 뒹굴기',
    col: { top: '#fff1cf', side: '#fff4dc', belly: '#fffaf2', accent: '#fffaf2', mark: '#a8764f' },
    scale: 1.3, biped: false, body: { len: 0.95, rx: 0.38, ry: 0.36 },
    neck: { fwd: 0.22, up: 0.18, r: 0.26 }, head: { r: 0.42, ry: 0.38, rz: 0.4, snout: 0.18 },
    tail: { len: 0.7, r: 0.11, up: 0.3 }, leg: { len: 0.32, r: 0.12 },
    feat: ['fangs', 'ears', 'stripes'], parts: [], personality: 'shy', speed: 2.0, herd: [1, 2], weight: 0.8,
    fav: FISH, reward: { kind: 'p1', text: '썰매를 끌어 줄 거래요(준비 중)' },
  }),
  S({
    id: 'z_yutyrannus', gdd: 'z_yutyrannus', name: '털복숭이', rarity: 4, habitat: 'land', form: 'BIPED', home: 'ice', zones: ['snowforest'], time: 'all',
    desc: '온몸이 깃털 이불. 눈이 오면 신나서 깡총깡총. 유티라누스.', behavior: '눈 오면 신나서 뜀',
    col: { top: '#fffaf2', side: '#f2f8ff', belly: '#fffaf2', accent: '#8fd3f4', mark: '#c9e9fa' },
    scale: 2.0, biped: true, body: { len: 0.95, rx: 0.44, ry: 0.46, tilt: 0.4 },
    neck: { fwd: 0.2, up: 0.3, r: 0.28 }, head: { r: 0.46, ry: 0.4, rz: 0.48, snout: 0.4 },
    tail: { len: 0.95, r: 0.28, up: 0.12 }, leg: { len: 0.36, r: 0.15 }, arm: { len: 0.18, r: 0.06 },
    feat: ['feathers', 'fluffy'], parts: ['feathers', 'fluffy'], personality: 'curious', speed: 1.6, herd: [1, 2], weight: 1.0,
    fav: FISH, reward: { kind: 'pet', text: '깃털 이불 친구가 졸졸 따라다녀요' },
  }),
];

export const DINO_BY_ID = new Map(DINOS.map((d) => [d.id, d]));
/** GDD id 또는 실제 id → 종 */
export const dinoByAny = (id: string): DinoSpec | undefined => DINO_BY_ID.get(id) ?? DINOS.find((d) => d.gdd === id);
/** 땅 위 무리로 나오는 종(공룡섬·솜눈섬) */
export const LAND_DINOS = DINOS.filter((d) => d.home !== 'sea' && d.id !== 'z_tino');
/** 목격만 해도 도감에 적히는 종 */
export const WITNESS_IDS = DINOS.filter((d) => d.witness).map((d) => d.id);
/** 짧은 이름(v:dino_<short> 해금 키·탈것 도감 v_dino_<short>) */
export const shortId = (id: string) => id.replace(/^dino-|^z_/, '');
/** 해금 키 */
export const dinoKey = (id: string) => `dino:${id}`;
export const mountKey = (id: string) => `v:dino_${shortId(id)}`;

// ───────────── 공룡이 주는 가구(선물) ─────────────
export const DINO_GOODS: Species[] = [
  { id: 'f_stego_plate', name: '꽃 등판 장식', category: 'item', rarity: 3, price: 1200, tags: ['furniture', 'dino-gift'], desc: '접시등이 준 등판 모양 장식. 꽃이 피어 있다.' },
  { id: 'f_dino_musicbox', name: '뿌우 음악 상자', category: 'item', rarity: 3, price: 1200, tags: ['furniture', 'dino-gift'], desc: '열면 나팔이 합창이 뿌우~ 흘러나온다.' },
];

// ───────────── 화석(GDD 3.7 · 5.5) ─────────────
/** 화석 부위 */
export type FossilPart = 'skull' | 'body' | 'tail';
export const FOSSIL_PARTS: readonly FossilPart[] = ['skull', 'body', 'tail'];
const PART_NAME: Record<FossilPart, string> = { skull: '머리뼈', body: '몸뼈', tail: '꼬리뼈' };
/** 화석이 되는 공룡 20종(바다 2·빙하기 손님 3 제외) */
export const FOSSIL_DINOS: DinoSpec[] = DINOS.filter((d) => d.home === 'dino');
/** 'z_baby_rex' → 'baby_rex' (화석 id 가운데 토막) */
export const fossilKey = (d: DinoSpec) => d.gdd.replace(/^z_/, '');

export interface FossilSpec extends Species {
  /** 'skull'|'body'|'tail' = 조각, 'skeleton' = 골격 칸 */
  model: FossilPart | 'skeleton';
  /** 어느 공룡(화석 키) */
  dino: string;
  /** 공룡 종 id */
  of: string;
  tint: string;
}

const boneTint = (d: DinoSpec) => d.col.side;
/** 조각 60개: fos_<dino>_<part> */
export const FOSSIL_PIECES: FossilSpec[] = FOSSIL_DINOS.flatMap((d) => FOSSIL_PARTS.map((p): FossilSpec => ({
  id: `fos_${fossilKey(d)}_${p}`, name: `${d.name} ${PART_NAME[p]}`, category: 'fossil', rarity: d.rarity,
  price: round10(BASE[d.rarity] * 0.5), tags: [`fos:${fossilKey(d)}:${p}`, 'fossil-part'],
  desc: `${d.name}의 ${PART_NAME[p]} 화석. 세 조각을 모아 박물관에 기증하면 골격이 완성된다.`,
  model: p, dino: fossilKey(d), of: d.id, tint: boneTint(d),
})));
/** 골격 20칸: fos_<dino> — economy 가 세 조각 기증 때 채운다 */
export const FOSSIL_SKELETONS: FossilSpec[] = FOSSIL_DINOS.map((d): FossilSpec => ({
  id: `fos_${fossilKey(d)}`, name: `${d.name} 골격`, category: 'fossil', rarity: d.rarity, price: 0,
  tags: ['skeleton', `fos:${fossilKey(d)}`], desc: `머리·몸·꼬리 세 조각이 모인 ${d.name} 골격. 박물관 화석관의 자랑.`,
  model: 'skeleton', dino: fossilKey(d), of: d.id, tint: boneTint(d),
}));
export const FOSSILS: FossilSpec[] = [...FOSSIL_PIECES, ...FOSSIL_SKELETONS];
export const FOSSIL_BY_ID = new Map(FOSSILS.map((f) => [f.id, f]));
/** 조각 id → {dino, part}(태그로 읽는다 — 'baby_rex' 처럼 밑줄 든 키도 안전) */
export function parseFossil(id: string): { dino: string; part: FossilPart } | null {
  const f = FOSSIL_BY_ID.get(id);
  const tag = f?.tags?.find((t) => t.startsWith('fos:') && t.split(':').length === 3);
  if (!tag) return null;
  const [, dino, part] = tag.split(':');
  return { dino, part: part as FossilPart };
}

/** 예전 저장의 화석(fossil-*) — 가방에 남은 건 이름·값을 잃지 않게 재료 칸으로만 둔다(도감 칸 아님) */
export const LEGACY_FOSSILS: Species[] = [
  { id: 'fossil-ammonite', name: '암모나이트', rarity: 1, price: 300, desc: '돌돌 말린 옛날 조개.' },
  { id: 'fossil-bone', name: '공룡 뼈 조각', rarity: 1, price: 250, desc: '누구 뼈인지는 아무도 모른다.' },
  { id: 'fossil-tooth', name: '티라노 이빨', rarity: 2, price: 600, desc: '생각보다 작고 귀엽다.' },
  { id: 'fossil-footprint', name: '발자국 화석', rarity: 2, price: 500, desc: '쿵! 하고 찍힌 세 발가락.' },
  { id: 'fossil-egg', name: '알 화석', rarity: 3, price: 900, desc: '아직 따뜻한 것 같다(기분 탓).' },
  { id: 'fossil-skull', name: '트리케라톱스 두개골', rarity: 4, price: 2400, desc: '박물관 관장이 보면 기절할지도.' },
  { id: 'fossil-amber', name: '호박 속 모기', rarity: 4, price: 2000, desc: '노란 보석 안에 아주 작은 친구가 잠들어 있다.' },
  { id: 'fossil-raptor-claw', name: '랩터 발톱', rarity: 3, price: 1100, desc: '휘어진 갈고리. 등 긁개로 딱이다.' },
].map((s) => ({ ...s, category: 'item', tags: ['legacy-fossil'] }));

/** 화석 굴림 가중치(희귀도별) — 공룡섬은 희귀 화석이 조금 더 잘 나온다 */
const FOS_W: Record<number, number> = { 1: 40, 2: 30, 3: 18, 4: 9, 5: 3 };
const FOS_W_FAR: Record<number, number> = { 1: 46, 2: 32, 3: 15, 4: 6, 5: 1 };
/** ext.fossils.roll — 결정적(rng 를 받는다). 조각 하나 */
export function rollFossil(rng: () => number, islandId?: string | null): FossilSpec {
  const W = islandId === 'dino' ? FOS_W : FOS_W_FAR;
  const tot = FOSSIL_PIECES.reduce((s, f) => s + W[f.rarity], 0);
  let r = rng() * tot;
  for (const f of FOSSIL_PIECES) { r -= W[f.rarity]; if (r <= 0) return f; }
  return FOSSIL_PIECES[FOSSIL_PIECES.length - 1];
}

/** 이 모듈이 state.register 하는 전부(공룡 25 + 화석 80 + 선물 가구 + 예전 화석) */
export function allSpecies(): Species[] {
  return [...DINOS, ...FOSSILS, ...DINO_GOODS, ...LEGACY_FOSSILS];
}
