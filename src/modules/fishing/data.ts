// 낚시 도감 데이터 — GDD 3.5 물고기·수생 135종(+ 무지개구피 6색 · 예전 종 38) 전부. 도감·상점·낚시·박물관이 읽는다.
// 표는 species/<섬>.ts 에 GDD 순서대로(장소·시간·날씨·★·크기·몸형·색). 여기서 모아 FishSpecies 로 바꾸고 가격(0.7 공식)·사는 곳 문구를 붙인다.
// ID: 원래 있던 종은 id(fish-*)를 그대로 두고 gdd 별칭(f_*), 새 종은 GDD id 를 그대로 쓴다(계약 v2 3장 ID POLICY).
// poolFor 는 순수 함수 — 섬·구역·시간(정오·자정)·날씨·달 위상으로 지금 나올 수 있는 종만 고른다(굴림은 econ.rollCatch).
import { pastelize, type Part } from '../../core/art';
import { isEclipse, isFullMoon, isMidnight, isNoon, todOf, type ShadowSize, type SpeciesWhere, type Weather } from '../../core/api';
import type { Species } from '../../core/state';
import { BASE, SIZE_MULT, ZONE_MULT, round10 } from '../economy/data';
import type { FishDef } from './species/def';
import { HOME_FISH, SHORE_FISH } from './species/home';
import { CORAL_FISH } from './species/coral';
import { DINO_FISH } from './species/dino';
import { ICE_FISH } from './species/ice';
import { MUSHROOM_FISH } from './species/mushroom';
import { DESERT_FISH } from './species/desert';
import { LAUNCH_FISH } from './species/launch';
import { OFFSHORE_FISH, DEEP_FISH } from './species/sea';
import { SPACE_FISH } from './species/space';
import { LEGACY_FISH } from './species/legacy';

// ───────────── 모양 타입 ─────────────
/** 예전 사는 곳 이름(낚시 자리 판정이 아직 읽는다) */
export type Habitat = 'river' | 'lake' | 'pond' | 'coast' | 'reef' | 'offshore' | 'deep' | 'ice' | 'oasis' | 'hotspring';
/** 예전 시간 이름(timeMatches) */
export type FishTime = 'all' | 'day' | 'night' | 'morning' | 'evening';
/** 몸형 생성기(model.ts) */
export type FishShape =
  | 'round' | 'long' | 'tall' | 'flatfish' | 'puffer' | 'box' | 'ray' | 'shark' | 'whaleshark' | 'eel'
  | 'seahorse' | 'octopus' | 'squid' | 'crab' | 'shrimp' | 'jelly' | 'turtle' | 'sunfish' | 'tadpole' | 'star' | 'angler'
  | 'bighead' | 'snail' | 'isopod' | 'horseshoe' | 'whale' | 'frog';
/** 무늬(GDD 0.3 pattern — vstripe = stripe, hstripe 여러 줄, band 옆줄 하나, solid = none) */
export type FishPattern =
  | 'none' | 'stripe' | 'hstripe' | 'spots' | 'grad' | 'band' | 'rainbow' | 'galaxy' | 'constellation' | 'huecycle'
  | 'chrome' | 'scales' | 'bandage' | 'heart' | 'cheek' | 'taiyaki' | 'glowdots';
/** GDD 0.3 몸형 14종(물고기·수생) */
export type FishBody = 'BALL' | 'SLEEK' | 'FLAT' | 'LONG' | 'DISC' | 'BIGHEAD' | 'HORSE' | 'JELLY' | 'OCTO' | 'CRUST' | 'RADIAL' | 'GIANT' | 'SHELL' | 'TAD';
/** 종 하나만 쓰는 장식(파츠 어휘 0.4 에 없는 것) — parts.ts 가 그린다 */
export type FishDeco =
  | 'clear-tail' | 'petal-tail' | 'cloud-fin' | 'color-tail' | 'galaxy-tail' | 'heart-tail' | 'arrow-fin' | 'lobe-fins' | 'fin-feet' | 'flaps'
  | 'whisker-flower' | 'sleepy' | 'brows' | 'pout' | 'teeth' | 'big-smile' | 'beak' | 'top-eyes' | 'blind' | 'eyespot'
  | 'smile-belly' | 'scarf' | 'towel' | 'armor' | 'gem' | 'bones' | 'moss' | 'forest' | 'cap' | 'jar' | 'mochi' | 'rabbit-ears'
  | 'snowman' | 'taiyaki' | 'axolotl' | 'stars' | 'curl-horn' | 'horns2' | 'mane' | 'twin' | 'twin-ribbon' | 'scale-mark'
  | 'meteor-shell' | 'crater-shell' | 'flat-shell' | 'heart-core' | 'cerata' | 'bumpy' | 'cephalic' | 'curl-wings' | 'trilobe'
  | 'front-claws' | 'melty' | 'long-body' | 'long-ball' | 'long-spikes' | 'urchin' | 'candy-tips' | 'glow-ring' | 'upside-down';

export interface FishLook {
  shape: FishShape;
  /** 등 · 배 · 포인트(무늬·지느러미) — hex(이름표 키는 data 가 hex 로 바꾼다) */
  colors: [string, string, string];
  pattern: FishPattern;
  /** GDD 0.4 파츠 */
  parts?: Part[];
  /** 종 하나만 쓰는 장식 */
  deco?: FishDeco[];
  /** GDD 0.3 몸형(없으면 shape 에서) */
  body?: FishBody;
  /** 눈 크기 배율(기본 1) */
  eye?: number;
  /** 숨쉬기 배율(떡붕어 2.5 — 말랑하게 크게) */
  squish?: number;
  /** 개체마다 고르는 색 변이(별사탕송사리 5색) */
  variants?: Array<[string, string, string]>;
  /** 화려한 꼬리(금붕어·베타) */
  fancy?: boolean;
  whiskers?: boolean;
  claws?: boolean;
  glow?: boolean;
  clear?: boolean;
  bill?: boolean;
  wings?: boolean;
}

/** 달 조건: 보름(0.45~0.55) · 일식(새달 창 < 0.04 또는 > 0.96) */
export type FishMoon = 'full' | 'eclipse';
/** 계약 v2 where 줄 + 달 조건(굴림 rollCatch 는 달을 모른다 → poolFor 가 거른다) */
export interface FishWhere extends SpeciesWhere { moon?: FishMoon }

export interface FishSpecies extends Species {
  /** 예전 사는 곳(where 에서 만든다) */
  hab: Habitat[];
  /** 예전 시간 이름(where 에서 만든다) */
  time: FishTime;
  /** 크기 범위(cm) — 평균 len 의 0.7~1.3 배 */
  size: [number, number];
  look: FishLook;
  where: FishWhere[];
  len: number;
  shadow: ShadowSize;
  tags: string[];
}

// ───────────── 이름표 ─────────────
export const HABITAT_NAME: Record<Habitat, string> = {
  river: '강', lake: '호수', pond: '연못', coast: '해안', reef: '산호초', offshore: '먼바다',
  deep: '심해', ice: '얼음 구멍', oasis: '오아시스', hotspring: '화산 온천',
};

/** 낚시 구역(GDD 3.5 장소 코드) → 이름 · 예전 사는 곳. P1 우주 바다 3곳도 데이터로 */
export const FISH_ZONES: Record<string, { name: string; hab: Habitat; island?: string; p1?: boolean }> = {
  river: { name: '강', hab: 'river', island: 'home' },
  pond: { name: '연못', hab: 'pond', island: 'home' },
  waterfall: { name: '폭포', hab: 'river', island: 'home' },
  heartpond: { name: '하트 연못', hab: 'pond', island: 'home' },
  estuary: { name: '하구', hab: 'river', island: 'home' },
  shore: { name: '해안', hab: 'coast' },
  stream: { name: '정글 개울', hab: 'river', island: 'coral' },
  mangrove: { name: '맹그로브', hab: 'reef', island: 'coral' },
  lagoon: { name: '석호', hab: 'reef', island: 'coral' },
  reef: { name: '산호초', hab: 'reef', island: 'coral' },
  footprint: { name: '발자국 웅덩이', hab: 'pond', island: 'dino' },
  hotspring: { name: '온천', hab: 'hotspring', island: 'dino' },
  ancientlake: { name: '고대 호수', hab: 'lake', island: 'dino' },
  swamp: { name: '늪', hab: 'pond' },
  foglake: { name: '안개 호수', hab: 'lake', island: 'mushroom' },
  icehole: { name: '얼음 구멍', hab: 'ice', island: 'ice' },
  icelake: { name: '얼음 호수', hab: 'ice', island: 'ice' },
  icesea: { name: '얼음 바다', hab: 'ice', island: 'ice' },
  oasis: { name: '오아시스', hab: 'oasis', island: 'desert' },
  ruin: { name: '유적 수로', hab: 'pond', island: 'desert' },
  cave: { name: '동굴 웅덩이', hab: 'pond', island: 'desert' },
  dune: { name: '모래 언덕', hab: 'oasis', island: 'desert' },
  crater: { name: '크레이터 호수', hab: 'lake', island: 'launch' },
  offshore: { name: '먼바다', hab: 'offshore' },
  deep: { name: '심해 해구', hab: 'deep' },
  moonpond: { name: '달 연못', hab: 'pond', island: 'moon' },
  cloudsea: { name: '구름바다', hab: 'offshore', island: 'cloud', p1: true },
  jellysea: { name: '젤리바다', hab: 'offshore', island: 'jelly', p1: true },
  blackhole: { name: '블랙홀', hab: 'deep', island: 'blackhole', p1: true },
};
/** 섬 표시 이름(GDD 2.2 · 6.4) — 사는 곳 문구용 */
const ISLAND_LABEL: Record<string, string> = {
  home: '말랑섬', dino: '쿵쿵공룡섬', ice: '솜눈섬', mushroom: '반딧불버섯섬', coral: '산호빛섬', desert: '모래시계섬', launch: '별똥별섬',
  any: '모든 섬', islet: '쪼꼬미섬', moon: '토끼달', cloud: '구름 행성', jelly: '젤리 행성', blackhole: '블랙홀', sugar: '사탕 행성', frost: '서리 행성', belt: '소행성대',
};
const SPACE_ISLANDS = new Set(['moon', 'cloud', 'jelly', 'blackhole', 'sugar', 'frost', 'belt']);
const TIME_KO: Record<string, string> = { morning: '아침', day: '낮', sunset: '저녁', night: '밤', noon: '정오', midnight: '자정' };
const WEATHER_KO: Record<string, string> = {
  clear: '맑음', rain: '비', storm: '폭풍', fog: '안개', meteor: '유성우', snow: '눈', blizzard: '눈보라', rainbow: '무지개', aurora: '오로라', sandstorm: '모래폭풍',
};

/** 몸형 생성기 → GDD 몸형 */
const BODY_OF: Record<FishShape, FishBody> = {
  round: 'BALL', puffer: 'BALL', box: 'BALL', long: 'SLEEK', flatfish: 'FLAT', ray: 'FLAT', eel: 'LONG', tall: 'DISC', sunfish: 'DISC',
  bighead: 'BIGHEAD', angler: 'BIGHEAD', seahorse: 'HORSE', jelly: 'JELLY', octopus: 'OCTO', squid: 'OCTO', crab: 'CRUST', shrimp: 'CRUST',
  isopod: 'CRUST', star: 'RADIAL', horseshoe: 'RADIAL', shark: 'GIANT', whaleshark: 'GIANT', whale: 'GIANT', turtle: 'SHELL', snail: 'SHELL',
  tadpole: 'TAD', frog: 'TAD',
};

// ───────────── 표 → 종 ─────────────
const timesOf = (w: FishWhere): string[] => (w.time == null || w.time === 'all' ? ['all'] : Array.isArray(w.time) ? w.time : [w.time]);

/** where 줄 → 예전 시간 이름(가장 넓은 쪽) */
function legacyTime(ws: FishWhere[]): FishTime {
  const ts = new Set(ws.flatMap(timesOf));
  if (ts.has('all')) return 'all';
  if (ts.has('day') || ts.has('noon')) return 'day';
  if (ts.has('night') || ts.has('midnight')) return 'night';
  if (ts.has('sunset')) return 'evening';
  return 'morning';
}

/** GDD 0.7 가격: round10(BASE[★] × SIZE[shadow] × ZONE) — economy/price.ts 의 구역 판정과 같은 순서 + 우주 1.8 */
export function fishPrice(rarity: number, shadow: ShadowSize, where: FishWhere[]): number {
  const far = new Set(['offshore', 'deep', 'trench']);
  const zone: keyof typeof ZONE_MULT =
    where.some((w) => w.island && SPACE_ISLANDS.has(w.island)) ? 'space'
      : where.some((w) => w.zone && far.has(w.zone)) ? 'farsea'
        : where.some((w) => !w.island || w.island === 'home' || w.island === 'any' || w.zone === 'shore') ? 'home' : 'island';
  return round10(BASE[Math.min(5, Math.max(1, rarity))] * (SIZE_MULT[shadow] ?? 1) * ZONE_MULT[zone]);
}

/** 사는 곳 문구: "말랑섬 강·연못 · 낮 · 비 ×3" */
function habitatText(ws: FishWhere[]): string {
  const byIsl = new Map<string, string[]>();
  for (const w of ws) {
    const isl = w.zone === 'shore' || w.zone === 'offshore' || w.zone === 'deep' ? 'any' : w.island ?? 'any';
    const zn = FISH_ZONES[w.zone ?? '']?.name ?? w.zone ?? '';
    const arr = byIsl.get(isl) ?? [];
    if (!arr.includes(zn)) arr.push(zn);
    byIsl.set(isl, arr);
  }
  const place = [...byIsl].map(([i, zs]) => `${ISLAND_LABEL[i] ?? i} ${zs.join('·')}`).join(' · ');
  const w0 = ws[0];
  const ts = timesOf(w0);
  const time = ts.includes('all') ? '종일' : ts.map((t) => TIME_KO[t] ?? t).join('·');
  const bits = [place, time];
  const only = w0?.weather?.only, boost = w0?.weather?.boost;
  if (only?.length) bits.push(only.map((x) => WEATHER_KO[x] ?? x).join(' 또는 ') + ' 전용');
  else if (boost?.length) bits.push(boost.map((x) => WEATHER_KO[x] ?? x).join('·') + ` ×${w0.weather?.x ?? 3}`);
  if (w0?.moon) bits.push(w0.moon === 'full' ? '보름달' : '일식');
  return bits.join(' · ');
}

const pal3 = (c: [string, string, string]): [string, string, string] => [pastelize(c[0]), pastelize(c[1]), pastelize(c[2])];

function toSpecies(d: FishDef): FishSpecies {
  const lk = d.look;
  const lookOut: FishLook = { ...lk, colors: pal3(lk.colors), body: lk.body ?? BODY_OF[lk.shape] };
  if (lk.variants) lookOut.variants = lk.variants.map(pal3);
  // 0.4 파츠 → 예전 모양 깃발(몸형 생성기가 같이 읽는다)
  const P = new Set(lk.parts ?? []);
  if (P.has('whiskers2') || P.has('whiskers4')) lookOut.whiskers = true;
  if (P.has('claws-big')) lookOut.claws = true;
  if (P.has('big-pec')) lookOut.wings = true;
  if (P.has('spear')) lookOut.bill = true;
  const tags = new Set(d.tags ?? []);
  const isGdd = !!d.gdd;
  if (lk.glow || P.has('lantern') || P.has('lantern-heart')) tags.add('set:glow');
  if (isGdd && lookOut.body === 'BALL') tags.add('set:ball');
  const id = d.legacy ?? d.gdd;
  const habs = [...new Set(d.where.map((w) => FISH_ZONES[w.zone ?? '']?.hab ?? 'river'))];
  const sp: FishSpecies = {
    id, name: d.name, category: 'fish', rarity: d.rarity, desc: d.desc,
    habitat: habitatText(d.where),
    price: fishPrice(d.rarity, d.shadow, d.where),
    hab: habs, time: legacyTime(d.where),
    size: [Math.max(1, Math.round(d.len * 0.7)), Math.max(2, Math.round(d.len * 1.3))],
    look: lookOut, where: d.where, len: d.len, shadow: d.shadow, tags: [...tags],
  };
  if (isGdd) sp.gdd = d.gdd;
  if (d.p1) sp.p1 = true;
  return sp;
}

/** GDD 3.5.1~3.5.11 표 순서(도감 순서) + 예전 종 */
export const FISH_DEFS: FishDef[] = [
  ...HOME_FISH, ...SHORE_FISH, ...CORAL_FISH, ...DINO_FISH, ...ICE_FISH, ...MUSHROOM_FISH, ...DESERT_FISH,
  ...LAUNCH_FISH, ...OFFSHORE_FISH, ...DEEP_FISH, ...SPACE_FISH, ...LEGACY_FISH,
];

export const FISH: FishSpecies[] = FISH_DEFS.map(toSpecies);
export const FISH_BY_ID = new Map(FISH.map((f) => [f.id, f]));
/** GDD id(f_*) → 종(예전 id 를 쓰는 종도 GDD id 로 찾는다) */
export const FISH_BY_GDD = new Map(FISH.filter((f) => f.gdd).map((f) => [f.gdd!, f]));

/** GDD id 든 실제 id 든 → 종 */
export const fishById = (id: string): FishSpecies | undefined => FISH_BY_ID.get(id) ?? FISH_BY_GDD.get(id);

/** 이 종이 나오는 구역 코드들(중복 없이, where 순서) */
export function zonesOf(sp: Pick<FishSpecies, 'where'>): string[] {
  const out: string[] = [];
  for (const w of sp.where ?? []) if (w.zone && !out.includes(w.zone)) out.push(w.zone);
  return out;
}

// ───────────── 지금 여기 나오는 종(순수) ─────────────
export interface PoolQuery {
  /** 섬 id(home·coral … · 우주는 moon). 없으면 섬을 보지 않는다 */
  island?: string | null;
  /** 구역 코드(geo.zoneAt().zone) */
  zone: string;
  /** 게임 시각 0..24 — tod·noon·midnight 를 안 주면 여기서 만든다 */
  hour?: number;
  tod?: string;
  noon?: boolean;
  midnight?: boolean;
  /** 지금 날씨(없으면 맑음으로 본다) */
  weather?: Weather | string;
  /** 달 위상 0..1(없으면 달 조건 종은 안 나온다) */
  moonPhase?: number;
  /** true 면 P1 종(심해·다른 행성)도 넣는다 */
  p1?: boolean;
  /**
   * 기본 true — 표대로 거른 후보가 하나도 없으면(예: 맑은 아침 폭포) 같은 섬 이웃 물(ZONE_NEAR)에서,
   * 그래도 없으면 시간만 풀어서 고른다. 날씨 전용·달·P1 조건은 끝까지 지킨다. false 면 표 그대로.
   */
  fallback?: boolean;
}

/** 후보가 빌 때 빌려 올 이웃 물(같은 섬 안 — 섬 검사는 그대로라 다른 섬 종은 안 섞인다) */
export const ZONE_NEAR: Record<string, string[]> = {
  river: ['pond'], pond: ['river'], waterfall: ['river'], heartpond: ['pond'], estuary: ['river', 'shore'],
  stream: ['lagoon', 'mangrove'], mangrove: ['stream', 'lagoon'], lagoon: ['reef', 'stream'], reef: ['lagoon', 'shore'],
  footprint: ['ancientlake'], hotspring: ['footprint'], ancientlake: ['footprint', 'swamp'], swamp: ['foglake', 'ancientlake', 'footprint'],
  foglake: ['swamp'], icehole: ['icelake', 'icesea'], icelake: ['icehole', 'icesea'], icesea: ['icehole', 'icelake'],
  oasis: ['dune', 'cave'], ruin: ['oasis'], cave: ['oasis'], dune: ['oasis'], crater: [], offshore: ['shore'], deep: ['offshore'], moonpond: [],
};

/** where 줄 하나가 지금 열려 있나(자리 · 시간 · 날씨 only · 달) */
export function whereOpen(w: FishWhere, q: PoolQuery): boolean {
  if (w.zone !== q.zone) return false;
  // 해안·먼바다·심해 줄과 island 'any' 는 어느 섬에서나
  if (q.island && w.island && w.island !== 'any' && w.zone !== 'shore' && w.island !== q.island) return false;
  const hour = q.hour != null && Number.isFinite(q.hour) ? q.hour : undefined;
  const tod = q.tod ?? (hour != null ? todOf(hour) : undefined);
  const noon = q.noon ?? (hour != null ? isNoon(hour) : false);
  const midnight = q.midnight ?? (hour != null ? isMidnight(hour) : false);
  const ts = timesOf(w);
  if ((tod || noon || midnight) && !ts.some((t) => t === 'all' || t === tod || (t === 'noon' && noon) || (t === 'midnight' && midnight))) return false;
  const only = w.weather?.only;
  if (only?.length && !(only as string[]).includes(q.weather ?? 'clear')) return false;
  if (w.moon) {
    const ph = q.moonPhase;
    if (ph == null || !Number.isFinite(ph)) return false;
    if (w.moon === 'full' ? !isFullMoon(ph) : !isEclipse(ph)) return false;
  }
  return true;
}

const strictPool = (q: PoolQuery) => FISH.filter((sp) => (!sp.p1 || q.p1) && sp.where.some((w) => whereOpen(w, q)));

/**
 * 지금 이 자리에서 나올 수 있는 종(도감 순서). 날씨 boost 가중치는 rollCatch 가 where 를 보고 건다.
 * 표대로 비면 이웃 물 → 시간 풀기 순서로 채운다(fallback:false 면 끄기) — 물가에서 낚싯대를 던졌는데 아무것도 없는 일은 없게.
 */
export function poolFor(q: PoolQuery): FishSpecies[] {
  const out = strictPool(q);
  if (out.length || q.fallback === false) return out;
  const zones = [q.zone, ...(ZONE_NEAR[q.zone] ?? [])];
  for (const z of zones.slice(1)) { const p = strictPool({ ...q, zone: z }); if (p.length) return p; }
  const anyTime = { ...q, hour: undefined, tod: undefined, noon: false, midnight: false };
  for (const z of zones) { const p = strictPool({ ...anyTime, zone: z }); if (p.length) return p; }
  return [];
}

/** 시간대 이름(engine tod) → 이 시간에 나오는 물고기인가(예전 판정 — 새 코드는 poolFor) */
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
