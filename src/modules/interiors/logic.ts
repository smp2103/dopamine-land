// 실내 규칙(GDD 4.12 · 5.6) — 가구 표(발자국·층·테마·안에 넣는 것)·벽지/바닥 견본·집 단계별 방 크기·집 점수·
// 박물관 동별 전시 목록·느릿 관장 해설·실내 자리(먼 지구 좌표). 부수효과 없는 순수 모듈(테스트가 화면 없이 부른다).
import type { Footprint, Placed, RoomGrid } from './placement';

// ───────────── 실내 자리 ─────────────
/** 실내 i 번째 자리: 먼 지구 좌표(x = -20000 + i·300, y = 600) — 세계 경계 밖이라 아무 섬과도 안 겹친다 */
export const INTERIOR_Y = 600;
export const interiorOrigin = (i: number) => ({ x: -20000 + Math.max(0, Math.floor(i)) * 300, y: INTERIOR_Y, z: 0 });
/** 정해진 자리 번호(나중에 비밀 동굴 등은 2 부터)
 *  다른 모듈이 맡은 자리 — 겹치지 않게 여기에 적어 둔다:
 *   12~15 hidden(해적 12 · 물 동굴 13 · 운석 14 · 피라미드 15)
 *   20~26 secrets(폭포 20 · 벽화 21 · 거품 22 · 잠수 23 · 오로라 24 · 오두막 25 · 나무 26) */
export const SLOT = { house: 0, museum: 1 } as const;

// ───────────── 테마 ─────────────
export type Theme = 'sea' | 'aqua' | 'bug' | 'fossil' | 'astro' | 'nature' | 'glow' | 'cozy' | 'junk' | 'toy' | 'royal' | 'sky' | 'desert';
export const THEME_KO: Record<Theme, { name: string; icon: string }> = {
  sea: { name: '바다', icon: '🐚' }, aqua: { name: '수족관', icon: '🐠' }, bug: { name: '곤충', icon: '🦋' }, fossil: { name: '화석', icon: '🦴' },
  astro: { name: '우주', icon: '🪐' }, nature: { name: '자연', icon: '🌿' }, glow: { name: '반짝 불빛', icon: '✨' }, cozy: { name: '아늑', icon: '🧸' },
  junk: { name: '재활용', icon: '🥫' }, toy: { name: '장난감', icon: '🪀' }, royal: { name: '임금님', icon: '👑' }, sky: { name: '하늘', icon: '☁️' },
  desert: { name: '사막', icon: '🌵' },
};

// ───────────── 가구 표 ─────────────
/** 안에 넣는 것: 물고기(수조) · 곤충(케이지) · 아무 생물(피규어) */
export type Holds = 'fish' | 'bug' | 'creature';
export interface FurnitureDef {
  /** 발자국(0.5 m 칸) */
  w: number;
  d: number;
  layer?: 'floor' | 'solid';
  themes: Theme[];
  holds?: Holds;
  /** 안에 넣는 마릿수(대왕 수조 3) */
  slots?: number;
  /** 키(m) — 충돌 상자 높이 */
  h?: number;
  /** 밤에 빛나나 */
  glow?: boolean;
}
const F = (w: number, d: number, themes: Theme[], o: Partial<FurnitureDef> = {}): FurnitureDef => ({ w, d, themes, ...o });

/** 가구 아이템(f_*) 전부 — economy GOODS 의 가구와 같은 id. 모르는 f_* 는 furnitureDef 가 상자 모양으로 받아 준다 */
export const FURNITURE: Record<string, FurnitureDef> = {
  f_tank: F(2, 2, ['aqua', 'sea'], { holds: 'fish', h: 1.1 }),
  f_bugcage: F(2, 2, ['bug', 'nature'], { holds: 'bug', h: 1.0 }),
  f_fireflylantern: F(1, 1, ['glow', 'bug'], { h: 0.9, glow: true }),
  f_figure: F(1, 1, ['toy'], { holds: 'creature', h: 0.8 }),
  f_shellbed: F(4, 3, ['sea', 'cozy'], { h: 0.8 }),
  f_corallamp: F(1, 1, ['sea', 'glow'], { h: 1.1, glow: true }),
  f_amberlamp: F(1, 1, ['fossil', 'glow'], { h: 1.1, glow: true }),
  f_mushlamp: F(1, 1, ['nature', 'glow'], { h: 1.1, glow: true }),
  f_bootplanter: F(1, 1, ['junk', 'nature'], { h: 0.8 }),
  f_canrobot: F(1, 1, ['junk', 'toy'], { h: 0.9 }),
  f_boneslide: F(4, 2, ['fossil', 'toy'], { h: 1.3 }),
  f_cactuspot: F(1, 1, ['nature', 'desert'], { h: 0.9 }),
  f_incubator: F(2, 2, ['fossil'], { h: 1.1, glow: true }),
  f_flowercrown: F(1, 1, ['nature'], { h: 0.8 }),
  f_spacelamp: F(1, 1, ['astro', 'glow'], { h: 1.0, glow: true }),
  f_pot: F(1, 1, ['nature', 'cozy'], { h: 0.9 }),
  f_fruitbasket: F(1, 1, ['cozy', 'nature'], { h: 0.5 }),
  f_bench: F(3, 1, ['cozy', 'nature'], { h: 0.6 }),
  f_spacechair: F(2, 2, ['astro'], { h: 0.9 }),
  f_cloudrug: F(4, 3, ['cozy', 'sky'], { layer: 'floor' }),
  f_pastelchair: F(2, 2, ['cozy'], { h: 0.9 }),
  f_shellclock: F(1, 1, ['sea', 'cozy'], { h: 1.4 }),
  f_rainbowlamp: F(1, 1, ['glow', 'sky'], { h: 1.2, glow: true }),
  f_starthrone: F(2, 2, ['astro', 'royal'], { h: 1.5 }),
  f_thanks_letter: F(1, 1, ['cozy'], { h: 1.1 }),
  f_aq_bubblelamp: F(1, 1, ['aqua', 'glow'], { h: 1.1, glow: true }),
  f_aq_fishmobile: F(2, 2, ['aqua', 'toy'], { h: 1.6 }),
  f_aq_kelpcurtain: F(3, 1, ['aqua', 'sea'], { h: 1.8 }),
  f_aq_whalesofa: F(4, 2, ['aqua', 'cozy'], { h: 0.9 }),
  f_aq_grandtank: F(4, 2, ['aqua', 'sea'], { holds: 'fish', slots: 3, h: 1.4 }),
  f_sea_shellchair: F(2, 2, ['sea'], { h: 1.0 }),
  f_sea_starrug: F(3, 3, ['sea'], { layer: 'floor' }),
  f_sea_anchorclock: F(1, 1, ['sea'], { h: 1.4 }),
  f_sea_jellylamp: F(1, 1, ['sea', 'glow'], { h: 1.2, glow: true }),
  f_sea_shipwheel: F(2, 1, ['sea', 'royal'], { h: 1.4 }),
  f_bug_leafstool: F(1, 1, ['bug', 'nature'], { h: 0.5 }),
  f_bug_ladybuglamp: F(1, 1, ['bug', 'glow'], { h: 0.9, glow: true }),
  f_bug_honeyshelf: F(2, 1, ['bug', 'nature'], { h: 1.3 }),
  f_bug_butterflyscreen: F(3, 1, ['bug'], { h: 1.4 }),
  f_bug_beetlethrone: F(2, 2, ['bug', 'royal'], { h: 1.5 }),
  f_fos_bonestool: F(1, 1, ['fossil'], { h: 0.5 }),
  f_fos_ammonitelamp: F(1, 1, ['fossil', 'glow'], { h: 1.1, glow: true }),
  f_fos_eggchair: F(2, 2, ['fossil', 'cozy'], { h: 1.1 }),
  f_fos_footrug: F(3, 2, ['fossil'], { layer: 'floor' }),
  f_fos_trexmodel: F(2, 2, ['fossil', 'toy'], { h: 1.2 }),
  f_astro_starlamp: F(1, 1, ['astro', 'glow'], { h: 1.2, glow: true }),
  f_astro_moonrug: F(3, 3, ['astro'], { layer: 'floor' }),
  f_astro_planetmobile: F(2, 2, ['astro', 'toy'], { h: 1.7 }),
  f_astro_telescope: F(2, 2, ['astro'], { h: 1.4 }),
  f_astro_rocketbed: F(4, 2, ['astro', 'cozy'], { h: 1.0 }),
  f_stego_plate: F(2, 1, ['fossil'], { h: 1.0 }),
  f_dino_musicbox: F(1, 1, ['fossil', 'toy'], { h: 0.6 }),
};
/** 모르는 가구(나중에 생긴 f_*) — 2×2 선물 상자 */
const GENERIC: FurnitureDef = F(2, 2, ['cozy'], { h: 0.8 });
export const isFurniture = (id: string) => typeof id === 'string' && id.startsWith('f_') && !id.includes('@');
export const furnitureDef = (id: string): FurnitureDef => FURNITURE[id] ?? GENERIC;
/** placement.ts 가 읽는 발자국 */
export const footOf = (id: string): Footprint => { const d = furnitureDef(id); return { w: d.w, d: d.d, layer: d.layer ?? 'solid' }; };

// ───────────── 벽지·바닥 ─────────────
export type Pattern = 'stripe' | 'dots' | 'check' | 'cloud' | 'wave' | 'leaf' | 'brick' | 'stars' | 'plank' | 'tile' | 'grass' | 'sand';
export interface Swatch { id: string; name: string; a: string; b: string; pattern: Pattern; theme: Theme }
export const WALLPAPERS: readonly Swatch[] = [
  { id: 'w_cream', name: '크림 줄무늬', a: '#fff1dc', b: '#ffe2c0', pattern: 'stripe', theme: 'cozy' },
  { id: 'w_pinkdot', name: '분홍 물방울', a: '#ffe3ec', b: '#ffbfd2', pattern: 'dots', theme: 'cozy' },
  { id: 'w_mint', name: '민트 체크', a: '#e2f8ec', b: '#bfeed6', pattern: 'check', theme: 'nature' },
  { id: 'w_sky', name: '뭉게구름 하늘', a: '#cfeaff', b: '#ffffff', pattern: 'cloud', theme: 'sky' },
  { id: 'w_sea', name: '찰랑 파도', a: '#bfe8f5', b: '#8fd3f4', pattern: 'wave', theme: 'sea' },
  { id: 'w_leaf', name: '나뭇잎 숲', a: '#e6f6d2', b: '#a8e06a', pattern: 'leaf', theme: 'bug' },
  { id: 'w_brick', name: '모래 벽돌', a: '#f6e2c0', b: '#e4c08e', pattern: 'brick', theme: 'fossil' },
  { id: 'w_stars', name: '반짝 밤하늘', a: '#3b4a8e', b: '#ffe58a', pattern: 'stars', theme: 'astro' },
];
export const FLOORS: readonly Swatch[] = [
  { id: 'fl_wood', name: '나무 마루', a: '#e8c08e', b: '#d4a26e', pattern: 'plank', theme: 'cozy' },
  { id: 'fl_pinktile', name: '분홍 타일', a: '#ffd8e4', b: '#ffffff', pattern: 'tile', theme: 'cozy' },
  { id: 'fl_grass', name: '잔디 카펫', a: '#b8e68a', b: '#9fd772', pattern: 'grass', theme: 'nature' },
  { id: 'fl_sand', name: '고운 모래', a: '#f6e6bc', b: '#ead39a', pattern: 'sand', theme: 'sea' },
  { id: 'fl_aqua', name: '물빛 타일', a: '#c8eef8', b: '#9edcef', pattern: 'tile', theme: 'aqua' },
  { id: 'fl_stone', name: '화석 돌바닥', a: '#e4d8c4', b: '#cbbba0', pattern: 'brick', theme: 'fossil' },
  { id: 'fl_cloud', name: '구름 카펫', a: '#f2f6ff', b: '#dfe8ff', pattern: 'cloud', theme: 'sky' },
  { id: 'fl_star', name: '별빛 마루', a: '#4a5a9e', b: '#ffe58a', pattern: 'stars', theme: 'astro' },
];
export const DEFAULT_WALL = 'w_cream';
export const DEFAULT_FLOOR = 'fl_wood';
export const wallById = (id: string | undefined) => WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
export const floorById = (id: string | undefined) => FLOORS.find((w) => w.id === id) ?? FLOORS[0];

// ───────────── 집 단계 → 방 ─────────────
/** 집 단계(0 텐트 … 4 2층 집) → 방 크기(칸). 단계가 오를수록 넓어진다 */
export function roomForStage(stage: number): RoomGrid {
  const s = Math.max(0, Math.min(4, Math.floor(Number(stage) || 0)));
  return ([{ w: 10, d: 10 }, { w: 12, d: 12 }, { w: 16, d: 13 }, { w: 20, d: 15 }, { w: 24, d: 17 }] as const)[s];
}
export const STAGE_NAME = ['아기 텐트', '통나무 오두막', '아늑한 집', '넓은 집', '2층 집'] as const;

/** 붙박이 칸(문 앞 발판·보관함·진열장) — 가구를 못 놓는다. 방 크기가 바뀌면 다시 계산 */
export function fixtureCells(room: RoomGrid): { door: Array<[number, number]>; chest: Array<[number, number]>; display: Array<[number, number]> } {
  const mid = Math.floor(room.w / 2);
  const door: Array<[number, number]> = [];
  for (let x = mid - 2; x < mid + 2; x++) for (let z = room.d - 2; z < room.d; z++) door.push([x, z]);
  const chest: Array<[number, number]> = [];
  for (let x = room.w - 3; x < room.w; x++) for (let z = 0; z < 2; z++) chest.push([x, z]);
  const display: Array<[number, number]> = [];
  for (let x = 0; x < 4; x++) for (let z = 0; z < 2; z++) display.push([x, z]);
  return { door, chest, display };
}
export function blockedCells(room: RoomGrid): Set<string> {
  const f = fixtureCells(room);
  return new Set([...f.door, ...f.chest, ...f.display].map(([x, z]) => `${x},${z}`));
}

// ───────────── 집 점수 ─────────────
export interface HouseScore {
  score: number;
  /** 1~5 */
  stars: number;
  items: number;
  variety: number;
  /** 테마별 가구 수 */
  themes: Partial<Record<Theme, number>>;
  /** 가장 많은 테마 */
  top: Theme | null;
  creatures: number;
  /** 점수 내역(창에 보여 준다) */
  parts: Array<{ label: string; pts: number }>;
}
/** 별 기준 점수 */
export const SCORE_STARS = [0, 60, 150, 300, 500] as const;
export const starsOf = (score: number) => { let s = 1; SCORE_STARS.forEach((v, i) => { if (score >= v) s = i + 1; }); return s; };
/** 테마 묶음 보너스: 3개 20 · 5개 50 · 8개 100 */
export const themeBonus = (n: number) => (n >= 8 ? 100 : n >= 5 ? 50 : n >= 3 ? 20 : 0);

/**
 * 집 점수(GDD 4.12 '집 평가 점수') = 가구 수(×3) + 서로 다른 가구(×10) + 테마 묶음 + 벽지·바닥이 가장 많은 테마와 맞으면 각 25
 * + 전시한 생물(서로 다른 종 ×6 — 수조·케이지·피규어·진열장).
 */
export function houseScore(layout: readonly Placed[], wall: string | undefined, floor: string | undefined, displayed: readonly string[] = []): HouseScore {
  const themes: Partial<Record<Theme, number>> = {};
  const kinds = new Set<string>();
  const shown = new Set<string>();
  for (const p of layout) {
    kinds.add(p.item);
    for (const t of furnitureDef(p.item).themes) themes[t] = (themes[t] ?? 0) + 1;
    if (p.arg) for (const a of p.arg.split('|')) if (a) shown.add(a);
  }
  for (const d of displayed) if (d) shown.add(d);
  const parts: HouseScore['parts'] = [];
  const items = layout.length, variety = kinds.size;
  if (items) parts.push({ label: `가구 ${items}개`, pts: items * 3 });
  if (variety) parts.push({ label: `서로 다른 가구 ${variety}종`, pts: variety * 10 });
  let top: Theme | null = null;
  for (const [t, n] of Object.entries(themes) as Array<[Theme, number]>) {
    if (!top || n > (themes[top] ?? 0) || (n === themes[top] && t < top)) top = t;
    const b = themeBonus(n);
    if (b) parts.push({ label: `${THEME_KO[t].icon} ${THEME_KO[t].name} 테마 ${n}개`, pts: b });
  }
  if (top && (themes[top] ?? 0) >= 3) {
    if (wallById(wall).theme === top) parts.push({ label: `벽지가 ${THEME_KO[top].name} 테마와 딱!`, pts: 25 });
    if (floorById(floor).theme === top) parts.push({ label: `바닥이 ${THEME_KO[top].name} 테마와 딱!`, pts: 25 });
  }
  if (shown.size) parts.push({ label: `전시한 친구 ${shown.size}종`, pts: shown.size * 6 });
  const score = parts.reduce((a, p) => a + p.pts, 0);
  return { score, stars: starsOf(score), items, variety, themes, top, creatures: shown.size, parts };
}

// ───────────── 안에 넣을 생물 고르기 ─────────────
export interface DexSpecies { id: string; name?: string; category: string; rarity: number; tags?: string[] }
const HOLD_CATS: Record<Holds, string[]> = { fish: ['fish'], bug: ['bug', 'insect'], creature: ['fish', 'bug', 'insect', 'sea', 'space', 'dino'] };
/** 그 칸에 넣을 수 있는 잡은 종(희귀한 것부터, 같으면 id 순) */
export function holderCandidates(holds: Holds, caught: Iterable<DexSpecies>): DexSpecies[] {
  const cats = HOLD_CATS[holds];
  return [...caught]
    .filter((s) => cats.includes(s.category) && !s.tags?.includes('vehicle') && !s.tags?.includes('junk'))
    .sort((a, b) => b.rarity - a.rarity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
/** 다음 후보(F 키). 지금 것이 없거나 목록에 없으면 첫 번째. 후보가 없으면 null */
export function cycleHolder(list: readonly DexSpecies[], current: string | undefined, step = 1): string | null {
  if (!list.length) return null;
  const i = current ? list.findIndex((s) => s.id === current) : -1;
  if (i < 0) return list[0].id;
  return list[(((i + step) % list.length) + list.length) % list.length].id;
}
/** 여러 마리 칸(대왕 수조): 'a|b|c' 처럼 서로 다른 종을 앞에서부터 */
export function fillSlots(list: readonly DexSpecies[], first: string | null, n: number): string {
  if (!first) return '';
  const i = Math.max(0, list.findIndex((s) => s.id === first));
  const out: string[] = [];
  for (let k = 0; k < Math.min(n, list.length); k++) out.push(list[(i + k) % list.length].id);
  return out.join('|');
}

// ───────────── 박물관 ─────────────
export type WingId = 'aquarium' | 'sea' | 'bug' | 'fossil' | 'astro';
export interface WingInfo { id: WingId; key: string; name: string; icon: string; cats: string[]; floor: string; wall: string; accent: string }
/** 동 5개(GDD 5.6) — 공룡은 친구라 기증하지 않는다 */
export const WINGS: readonly WingInfo[] = [
  { id: 'aquarium', key: 'wing:aquarium', name: '수족관동', icon: '🐟', cats: ['fish'], floor: '#bfe6f5', wall: '#dff4fb', accent: '#4a9cf0' },
  { id: 'sea', key: 'wing:sea', name: '해저관', icon: '🐙', cats: ['sea'], floor: '#f4e2b0', wall: '#cfeef0', accent: '#3fc7b4' },
  { id: 'bug', key: 'wing:bug', name: '곤충관', icon: '🦋', cats: ['bug', 'insect'], floor: '#cdeaa6', wall: '#eef8dc', accent: '#5cc16a' },
  { id: 'fossil', key: 'wing:fossil', name: '화석관', icon: '🦴', cats: ['fossil'], floor: '#e9d3a8', wall: '#f8ecd4', accent: '#a8764f' },
  { id: 'astro', key: 'wing:astro', name: '천문관', icon: '🔭', cats: ['space'], floor: '#3b4a8e', wall: '#5a5fa8', accent: '#c9b6f2' },
];
export const WING_INFO = new Map(WINGS.map((w) => [w.id, w]));
/** 동 순서(서 → 동): 수족관 · 해저 · [로비] · 곤충 · 화석 · 천문 */
export const MUSEUM_ROOMS: ReadonlyArray<WingId | 'lobby'> = ['aquarium', 'sea', 'lobby', 'bug', 'fossil', 'astro'];

export interface ExhibitSpecies extends DexSpecies { witness?: boolean }
/** 화석 조각(태그 fos:<공룡>:<부위>)이면 true — 화석관엔 골격만 선다 */
export const isFossilPart = (s: { tags?: string[] }) => !!s.tags?.some((t) => /^fos:[^:]+:[^:]+$/.test(t));
export const wingOfSpecies = (s: { category: string; tags?: string[] } | undefined | null): WingId | null => {
  if (!s || s.tags?.includes('vehicle')) return null;
  for (const w of WINGS) if (w.cats.includes(s.category)) return w.id;
  return null;
};

/**
 * 동 하나에 실제로 놓을 전시물(기증한 것만, 등록 순서 그대로).
 * 화석관은 골격(skeletons — econ.skeletonsDone 결과)만: 조각은 골격이 되기 전까진 전시하지 않는다.
 */
export function museumExhibits(wing: WingId, species: Iterable<ExhibitSpecies>, isDonated: (id: string) => boolean, skeletons: readonly string[] = []): string[] {
  const w = WING_INFO.get(wing);
  if (!w) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  if (wing === 'fossil') {
    for (const id of skeletons) if (!seen.has(id)) { seen.add(id); out.push(id); }
    for (const s of species) {
      if (s.category !== 'fossil' || isFossilPart(s) || seen.has(s.id) || !s.id.startsWith('fos_') || !isDonated(s.id)) continue;
      seen.add(s.id); out.push(s.id);
    }
    return out;
  }
  for (const s of species) {
    if (!w.cats.includes(s.category) || s.tags?.includes('vehicle') || seen.has(s.id) || !isDonated(s.id)) continue;
    seen.add(s.id);
    out.push(s.id);
  }
  return out;
}

// ───────────── 느릿 관장 해설 ─────────────
/** 기증하고 해설이 나오기까지(초) */
export const CURATOR_DELAY = 5;
/** 말풍선이 떠 있는 시간(초) */
export const CURATOR_SHOW = 7;
const LINES: Record<WingId | 'other', string[]> = {
  aquarium: ['{n}…… 이군요…… 물속에서…… 반짝반짝…… 헤엄치는 모습이…… 참…… 곱지요……', '오오…… {n}…… 수족관동…… 큰 수조에…… 바로…… 넣어 두었어요……', '{n|은는}…… 지느러미가…… 아주…… 부지런하답니다…… 저와는…… 달리요……'],
  sea: ['{n}…… 바닷속…… 친구군요…… 해저관…… 모래 위에서…… 꼼지락거려요……', '오오…… 바다 냄새가…… 나네요…… {n}…… 소중히…… 모실게요……', '{n}…… 파도 소리를…… 들려주면…… 좋아한답니다……'],
  bug: ['{n}…… 이군요…… 곤충관…… 나뭇가지에…… 살포시…… 앉혀 두었어요……', '오오…… {n}…… 날개 무늬가…… 마치…… 그림 같아요……', '{n|은는}…… 작지만…… 아주…… 씩씩한…… 친구예요……'],
  fossil: ['오오오…… {n}…… 드디어…… 뼈가…… 다 모였군요……!', '{n}…… 화석관 한가운데에…… 우뚝…… 세웠어요…… 아주…… 늠름해요……', '이 {n}…… 아주아주…… 오래전…… 이야기를…… 품고 있지요……'],
  astro: ['{n}…… 별에서…… 온…… 손님이군요…… 천문관이…… 반짝여요……', '오오…… {n}…… 둥실둥실…… 떠 있는 게…… 꼭…… 꿈 같아요……', '{n}…… 우주는…… 넓고…… 신기한…… 친구가…… 많네요……'],
  other: ['오오…… {n}…… 고마워요…… 소중히…… 전시할게요……'],
};
const RARE_TAIL = ['…… 이건…… 정말…… 귀한…… 친구예요……!', '…… 관장 생활…… 몇백 년에…… 처음 봐요……!'];
/** 받침 있으면 a(은·이), 없으면 b(는·가). 한글이 아니면 a */
export function josa(word: string, a: string, b: string): string {
  const c = word.trim().charCodeAt(word.trim().length - 1);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return a;
  return (c - 0xac00) % 28 ? a : b;
}
/** 해설 한 줄 — u(0..1)로 고른다(rng 는 부르는 쪽) */
export function curatorLine(s: { name?: string; id: string; category: string; rarity?: number; tags?: string[] }, u: number, u2 = u): string {
  const wing = wingOfSpecies(s) ?? 'other';
  const list = LINES[wing];
  const pick = (a: string[], x: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(x * a.length)))];
  const nm = s.name ?? s.id;
  let line = pick(list, u).replace(/\{n\|(.)(.)\}/g, (_m, a: string, b: string) => nm + josa(nm, a, b)).replace(/\{n\}/g, nm);
  if ((s.rarity ?? 1) >= 4) line += pick(RARE_TAIL, u2);
  return line;
}
