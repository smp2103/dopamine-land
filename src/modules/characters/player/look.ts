// 플레이어 꾸미기(순수 — THREE 없음): 피부 · 머리 모양 · 머리색 · 눈 색 · 옷 · 옷 색 · 모자/장식 · 주근깨.
// 게임 저장은 game.state.flags.look(객체), 친구 통신은 encodeLook() 문자열('L1.' 로 시작, 짧고 버전이 붙는다).
// 모르는 값·옛 데이터는 전부 기본값으로 — cleanLook() 하나로 거른다.

export const SKINS = {
  peach: { label: '복숭아', base: '#ffd5c8', rim: '#ffb8a6' },
  cream: { label: '우유', base: '#ffe6d6', rim: '#ffc9b6' },
  honey: { label: '꿀', base: '#f3c29c', rim: '#e9a37e' },
  caramel: { label: '캐러멜', base: '#d99a72', rim: '#c77d58' },
  cocoa: { label: '코코아', base: '#a86e4e', rim: '#8e5338' },
} as const;
export type SkinId = keyof typeof SKINS;

export const HAIR_STYLES = {
  bob: { label: '말랑 단발' },
  short: { label: '삐죽 숏컷' },
  twin: { label: '젤리 양갈래' },
  cloud: { label: '구름 뽀글' },
} as const;
export type HairStyle = keyof typeof HAIR_STYLES;

/** 머리색: 바탕 · 뿌리 그늘 · 윤기(천사 고리) */
export const HAIR_COLORS = {
  strawberry: { label: '딸기우유', base: '#ff9cc6', shade: '#e2649f', shine: '#fff0f7' },
  mint: { label: '민트', base: '#86dcc4', shade: '#3fae96', shine: '#effff9' },
  butter: { label: '버터', base: '#ffd977', shade: '#e8a83c', shine: '#fffbe6' },
  cocoa: { label: '코코아', base: '#8a5a3e', shade: '#5a3424', shine: '#e0b08c' },
  grape: { label: '포도', base: '#b49cff', shade: '#7c62e0', shine: '#f4efff' },
  soda: { label: '소다', base: '#8cc8ff', shade: '#4f8ee6', shine: '#eef7ff' },
  midnight: { label: '밤하늘', base: '#4a4a72', shade: '#2a2846', shine: '#b8b4e8' },
} as const;
export type HairColor = keyof typeof HAIR_COLORS;

/** 눈동자: 위(진한) · 아래 반사 */
export const EYE_COLORS = {
  berry: { label: '베리', dark: '#341334', light: '#ff7aac' },
  grape: { label: '포도', dark: '#26164a', light: '#a98cff' },
  mint: { label: '민트', dark: '#123a32', light: '#6fe0b8' },
  sky: { label: '하늘', dark: '#12284a', light: '#7cc4ff' },
  honey: { label: '꿀', dark: '#3a2008', light: '#ffbf5a' },
  cocoa: { label: '초코', dark: '#2a160c', light: '#c48a5c' },
} as const;
export type EyeColor = keyof typeof EYE_COLORS;

export const OUTFITS = {
  smock: { label: '젤리 원피스' },
  hoodie: { label: '후드 + 반바지' },
  overalls: { label: '멜빵 바지' },
  sailor: { label: '세일러 + 반바지' },
} as const;
export type Outfit = keyof typeof OUTFITS;

/** 옷 색(옷마다 같은 판) — main 이 몸판, deep 이 시보리·그늘, pants 가 바지(원피스는 블루머) */
export const OUTFIT_COLORS = {
  periwinkle: { label: '라벤더', main: '#a9b4ff', deep: '#8a95ec', pants: '#ffffff' },
  butter: { label: '버터', main: '#ffd36e', deep: '#f2b04e', pants: '#7d8ff0' },
  peach: { label: '복숭아', main: '#ffab9c', deep: '#f08878', pants: '#6f8ee8' },
  mint: { label: '민트', main: '#9fe6c8', deep: '#6ccaa6', pants: '#5d7ad8' },
  sky: { label: '하늘', main: '#9ccfff', deep: '#6eaeea', pants: '#ffffff' },
  cocoa: { label: '코코아', main: '#c89a78', deep: '#a87858', pants: '#5a6aa8' },
  cherry: { label: '체리', main: '#ff7f9a', deep: '#e85d7c', pants: '#ffffff' },
} as const;
export type OutfitColor = keyof typeof OUTFIT_COLORS;

export const HATS = {
  clip: { label: '토토 별 핀' },
  flower: { label: '꽃 핀' },
  cap: { label: '젤리 모자' },
  bucket: { label: '꿀 벙거지' },
  none: { label: '없음' },
} as const;
export type Hat = keyof typeof HATS;

export interface PlayerLook {
  skin: SkinId;
  hair: HairStyle;
  hairColor: HairColor;
  eyes: EyeColor;
  outfit: Outfit;
  outfitColor: OutfitColor;
  hat: Hat;
  freckles: boolean;
}

/** 기본: 딸기우유 젤리 아이(말랑 단발 + 원피스 + 토토 별 핀) */
export const DEFAULT_LOOK: Readonly<PlayerLook> = Object.freeze({
  skin: 'peach', hair: 'bob', hairColor: 'strawberry', eyes: 'berry', outfit: 'smock', outfitColor: 'periwinkle', hat: 'clip', freckles: false,
});

/** 꾸미기 창의 '추천 모습' 몇 벌(기본만 강요하지 않게) */
export const LOOK_PRESETS: ReadonlyArray<{ id: string; label: string; look: PlayerLook }> = [
  { id: 'jelly', label: '젤리 아이', look: { ...DEFAULT_LOOK } },
  { id: 'sprout', label: '새싹 탐험가', look: { skin: 'cream', hair: 'short', hairColor: 'cocoa', eyes: 'mint', outfit: 'hoodie', outfitColor: 'butter', hat: 'clip', freckles: true } },
  { id: 'mint', label: '민트 소다', look: { skin: 'honey', hair: 'twin', hairColor: 'mint', eyes: 'sky', outfit: 'sailor', outfitColor: 'sky', hat: 'flower', freckles: false } },
  { id: 'honey', label: '꿀 산책', look: { skin: 'caramel', hair: 'cloud', hairColor: 'grape', eyes: 'honey', outfit: 'overalls', outfitColor: 'peach', hat: 'bucket', freckles: false } },
];

const keys = <T extends object>(o: T) => Object.keys(o) as Array<keyof T & string>;
const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (typeof v === 'string' && (ok as readonly string[]).includes(v) ? (v as T) : d);

/** 아무 값 → 올바른 모습(모르는 칸은 기본값) */
export function cleanLook(v: unknown): PlayerLook {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_LOOK;
  return {
    skin: pick(o.skin, keys(SKINS), d.skin),
    hair: pick(o.hair, keys(HAIR_STYLES), d.hair),
    hairColor: pick(o.hairColor, keys(HAIR_COLORS), d.hairColor),
    eyes: pick(o.eyes, keys(EYE_COLORS), d.eyes),
    outfit: pick(o.outfit, keys(OUTFITS), d.outfit),
    outfitColor: pick(o.outfitColor, keys(OUTFIT_COLORS), d.outfitColor),
    hat: pick(o.hat, keys(HATS), d.hat),
    freckles: o.freckles === true,
  };
}

export function sameLook(a: PlayerLook, b: PlayerLook): boolean {
  return a.skin === b.skin && a.hair === b.hair && a.hairColor === b.hairColor && a.eyes === b.eyes && a.outfit === b.outfit
    && a.outfitColor === b.outfitColor && a.hat === b.hat && a.freckles === b.freckles;
}

// ── 통신용 짧은 글자: 'L1.' + 칸마다 목록 번호(36진수 한 글자) ──
const ORDER = ['skin', 'hair', 'hairColor', 'eyes', 'outfit', 'outfitColor', 'hat'] as const;
const TABLES: Record<(typeof ORDER)[number], readonly string[]> = {
  skin: keys(SKINS), hair: keys(HAIR_STYLES), hairColor: keys(HAIR_COLORS), eyes: keys(EYE_COLORS),
  outfit: keys(OUTFITS), outfitColor: keys(OUTFIT_COLORS), hat: keys(HATS),
};
export const LOOK_CODE_VERSION = 1;

/** 모습 → 'L1.0000000' 같은 짧은 글자(목록 뒤에 새 값을 붙여도 옛 글자는 그대로 읽힌다) */
export function encodeLook(l: PlayerLook): string {
  const c = cleanLook(l);
  return `L${LOOK_CODE_VERSION}.${ORDER.map((k) => TABLES[k].indexOf(c[k]).toString(36)).join('')}${c.freckles ? 'f' : ''}`;
}

/** 글자 → 모습. 이상하거나 더 새 버전이면 null(받는 쪽은 기본 모습으로) */
export function decodeLook(s: unknown): PlayerLook | null {
  if (typeof s !== 'string' || s.length > 32) return null;
  const m = /^L(\d+)\.([0-9a-z]{7})(f?)$/.exec(s);
  if (!m || Number(m[1]) !== LOOK_CODE_VERSION) return null;
  const o: Record<string, unknown> = { freckles: m[3] === 'f' };
  ORDER.forEach((k, i) => { o[k] = TABLES[k][parseInt(m[2][i], 36)]; });
  return cleanLook(o);
}

// ── 옛 친구(옷 색·머리 색만 보내는 통신 v1) 와 맞추기 ──
function hexRgb(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function nearest<K extends string>(hex: string, table: Record<K, string>): K | null {
  const c = hexRgb(hex);
  if (!c) return null;
  let best: K | null = null, bd = Infinity;
  for (const k of Object.keys(table) as K[]) {
    const t = hexRgb(table[k])!;
    const d = (t[0] - c[0]) ** 2 + (t[1] - c[1]) ** 2 * 1.3 + (t[2] - c[2]) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
const hairBase = Object.fromEntries(keys(HAIR_COLORS).map((k) => [k, HAIR_COLORS[k].base])) as Record<HairColor, string>;
const clothBase = Object.fromEntries(keys(OUTFIT_COLORS).map((k) => [k, OUTFIT_COLORS[k].main])) as Record<OutfitColor, string>;

/** 옷·머리 색(옛 통신) → 모습: 가장 가까운 옷 색·머리색만 바꾼 기본 모습 */
export function lookFromColors(c: { tee?: string; hair?: string } | null | undefined, base: PlayerLook = DEFAULT_LOOK): PlayerLook {
  const l = cleanLook(base);
  if (c?.hair) l.hairColor = nearest(c.hair, hairBase) ?? l.hairColor;
  if (c?.tee) l.outfitColor = nearest(c.tee, clothBase) ?? l.outfitColor;
  return l;
}

/** 모습 → 옛 통신 색(옷 = 몸판 색, 머리 = 바탕색) */
export function colorsFromLook(l: PlayerLook): { tee: string; hair: string } {
  const c = cleanLook(l);
  return { tee: OUTFIT_COLORS[c.outfitColor].main, hair: HAIR_COLORS[c.hairColor].base };
}
