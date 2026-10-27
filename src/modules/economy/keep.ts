// 가방 밖에 두기(GDD 4.2 집 보관함·4.11 피규어 공방·4.12 전시, wave 4 econ-p1) — 부수효과 없는 순수 계산.
//   보관함: 200칸, 칸 규칙은 가방과 같다(생물 10 · 재료 30 · 도구 1 — bag.ts).
//   피규어: 같은 종 5마리 → f_figure_<종 id> 하나. 꼬마(@tiny)는 2마리로 친다. 반짝이·왕관은 쓰지 않는다(소중해요).
//   전시: 집 진열장에 생물을 올린다(가방에서 빠진다). 칸은 집 크기를 따라 10 + 단계마다 5.
import { splitVariant } from '../../core/api';
import { addableCount, canAddTo, usedSlots, type BagRules } from './bag';

/** 집 보관함 칸 수(GDD 4.2) */
export const STORAGE_SIZE = 200;
/** 피규어 하나에 드는 점수(보통 1 · 꼬마 2) */
export const FIGURE_NEED = 5;
export const FIGURE_PREFIX = 'f_figure_';
/** 전시 칸: 집 단계(0~4)마다 */
export const DISPLAY_BASE = 10, DISPLAY_PER_HOUSE = 5;

export const figureId = (speciesId: string) => `${FIGURE_PREFIX}${splitVariant(speciesId).id}`;
export const figureSpecies = (id: string) => (id.startsWith(FIGURE_PREFIX) ? id.slice(FIGURE_PREFIX.length) : null);

/** 피규어 점수(가방 안 보통 + 꼬마×2) */
export function figurePoints(bag: Readonly<Record<string, number>>, speciesId: string): number {
  const id = splitVariant(speciesId).id;
  return Math.max(0, bag[id] ?? 0) + 2 * Math.max(0, bag[`${id}@tiny`] ?? 0);
}

/**
 * 피규어 재료 고르기 — 점수 5 를 가장 적은 마리로(같으면 넘치는 점수가 적은 쪽).
 * 모자라면 null. 돌려주는 건 가방 키 → 마리.
 */
export function figurePlan(bag: Readonly<Record<string, number>>, speciesId: string): Record<string, number> | null {
  const id = splitVariant(speciesId).id;
  const normal = Math.max(0, bag[id] ?? 0), tiny = Math.max(0, bag[`${id}@tiny`] ?? 0);
  let best: { t: number; n: number } | null = null;
  for (let t = 0; t <= Math.min(tiny, Math.ceil(FIGURE_NEED / 2)); t++) {
    const n = Math.max(0, FIGURE_NEED - 2 * t);
    if (n > normal) continue;
    const used = t + n, over = 2 * t + n - FIGURE_NEED;
    if (!best || used < best.t + best.n || (used === best.t + best.n && over < 2 * best.t + best.n - FIGURE_NEED)) best = { t, n };
  }
  if (!best) return null;
  const take: Record<string, number> = {};
  if (best.n) take[id] = best.n;
  if (best.t) take[`${id}@tiny`] = best.t;
  return take;
}

/** 피규어를 만들 수 있는 종(가방 기준) — 점수 높은 순 */
export function figureCandidates(bag: Readonly<Record<string, number>>, isCreature: (id: string) => boolean): Array<{ id: string; points: number }> {
  const ids = new Set<string>();
  for (const k of Object.keys(bag)) {
    const { id, variant } = splitVariant(k);
    if (variant && variant !== 'tiny') continue;
    if (isCreature(id)) ids.add(id);
  }
  return [...ids].map((id) => ({ id, points: figurePoints(bag, id) }))
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
}

/** 보관함 규칙 — 가방 규칙의 칸 수만 200 으로(통과 아이템도 칸을 쓴다: 보관함은 옷장이 아니다) */
export const storageRules = (bagRules: BagRules): BagRules => ({ size: STORAGE_SIZE, speciesOf: bagRules.speciesOf });
export const storageUsed = (store: Readonly<Record<string, number>>, r: BagRules) => usedSlots(store as Record<string, number>, r);
export const storageRoom = (store: Readonly<Record<string, number>>, id: string, n: number, r: BagRules) => addableCount(store as Record<string, number>, id, n, r);
export const storageFits = (store: Readonly<Record<string, number>>, id: string, n: number, r: BagRules) => canAddTo(store as Record<string, number>, id, n, r);

/** 전시 칸 수(집 단계 0~4) */
export const displayMax = (houseLevel: number) => DISPLAY_BASE + DISPLAY_PER_HOUSE * Math.max(0, Math.min(4, Math.floor(houseLevel)));
/** 전시 중인 수 */
export const displayCount = (d: Readonly<Record<string, number>>) => Object.values(d).reduce((a, n) => a + Math.max(0, n), 0);
