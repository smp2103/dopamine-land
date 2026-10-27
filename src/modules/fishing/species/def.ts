// 종 표 한 줄 쓰기 도우미 — GDD 3.5 표를 거의 그대로 옮겨 적을 수 있게(장소·시간·날씨·★·크기·몸형·색).
// species/<섬>.ts 가 이걸로 FishDef 배열을 만들고, data.ts 가 모아서 FishSpecies(가격·도감 문구 포함)로 바꾼다.
import type { Part } from '../../../core/art';
import type { ShadowSize, Weather } from '../../../core/api';
import type { FishLook, FishPattern, FishShape, FishWhere, FishMoon } from '../data';

export interface FishDef {
  /** GDD 표 id(f_*) */
  gdd: string;
  /** 이미 있던 종 id(fish-*) — 있으면 그 id 를 그대로 쓰고 gdd 를 별칭으로 단다 */
  legacy?: string;
  name: string;
  rarity: 1 | 2 | 3 | 4 | 5;
  where: FishWhere[];
  shadow: ShadowSize;
  /** 평균 크기 cm */
  len: number;
  look: FishLook;
  desc: string;
  tags?: string[];
  /** 데이터만(출현은 P1) */
  p1?: boolean;
}

/** 날씨 조건 */
export interface WeatherCond { only?: Weather[]; boost?: Weather[]; x?: number }
/** '전용' — 그 날씨에만 */
export const only = (...w: Weather[]): WeatherCond => ({ only: w });
/** '×n' — 그 날씨면 n 배(기본 3) */
export const boost = (x: number, ...w: Weather[]): WeatherCond => ({ boost: w, x });

/**
 * 장소 줄: 섬 · 구역들('river,pond') · 시간('all' 또는 'morning,day' — 정오 noon · 자정 midnight 포함) · 날씨 · 달.
 * 구역마다 한 줄씩 나온다(같은 조건).
 */
export function at(island: string, zones: string, time = 'all', weather?: WeatherCond, moon?: FishMoon): FishWhere[] {
  const t: string | string[] = time === 'all' ? 'all' : time.split(',').map((s) => s.trim());
  return zones.split(',').map((z) => {
    const w: FishWhere = { island, zone: z.trim(), time: t };
    if (weather && (weather.only?.length || weather.boost?.length)) w.weather = { ...weather };
    if (moon) w.moon = moon;
    return w;
  });
}

/** 모양: 몸형 · [등, 배, 포인트] 색(0.5 이름표 키 또는 hex) · 무늬 · 그 밖(파츠·장식·발광 …) */
export function look(shape: FishShape, colors: [string, string, string], pattern: FishPattern = 'none', extra: Partial<FishLook> = {}): FishLook {
  return { shape, colors, pattern, ...extra };
}

/** 'S/15' → [그림자, 평균 cm] */
export function size(s: string): [ShadowSize, number] {
  const [a, b] = s.split('/');
  return [a as ShadowSize, Number(b)];
}

/** 표 한 줄 → FishDef */
export function fish(gdd: string, legacy: string | null, name: string, where: FishWhere[], rarity: 1 | 2 | 3 | 4 | 5, sz: string,
  lk: FishLook, desc: string, extra: { tags?: string[]; p1?: boolean } = {}): FishDef {
  const [shadow, len] = size(sz);
  const d: FishDef = { gdd, name, rarity, where, shadow, len, look: lk, desc };
  if (legacy) d.legacy = legacy;
  if (extra.tags?.length) d.tags = extra.tags;
  if (extra.p1) d.p1 = true;
  return d;
}

/** 파츠 목록(타입 확인용) */
export const parts = (...p: Part[]): Part[] => p;
