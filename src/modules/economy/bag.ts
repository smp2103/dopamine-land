// 가방 규칙(GDD 4.2) — 칸 = 아이템 종류 하나. 생물 한 칸 10마리, 재료 30개, 넘치면 다음 칸으로.
// 도구(tool_*)는 가방이 아니라 도구 벨트 5칸에 — 벨트가 차면 남는 도구가 가방 한 칸씩 쓴다.
// 기본 20칸, 가방 확장(bag:30·40·50)마다 +10, 자전거(v:bike) 바구니 +5. 부수효과 없는 순수 함수만.
import { splitVariant } from '../../core/api';
import { BAG } from './data';

/** 종 모양(가방이 보는 것만) */
export interface BagSpecies { category?: string; tags?: string[] }

/** 가방 규칙에 필요한 바깥 정보 */
export interface BagRules {
  /** 모든 칸 수 */
  size: number;
  /** id → 등록된 종(없으면 재료로 본다) */
  speciesOf(id: string): BagSpecies | undefined;
  /** 가방에 들지 않는 것(줍는 즉시 바뀌는 녹슨 열쇠 등) */
  passThrough?(id: string): boolean;
}

/** 도구 벨트 칸 수 */
export const BELT_SIZE = BAG.belt;
/** 벨트에 보여 줄 도구 순서(앞이 먼저) — 좋은 도구가 앞 */
export const TOOL_ORDER = [
  'tool_goldrod', 'tool_goodrod', 'tool_rod',
  'tool_goldnet', 'tool_goodnet', 'tool_net',
  'tool_shovel', 'tool_hammer', 'tool_slingshot',
  'tool_wetsuit', 'tool_snorkel', 'tool_wateringcan',
];

export const isTool = (id: string) => splitVariant(id).id.startsWith('tool_');

/** 가방 크기: 20 + 확장 10씩 + 자전거 바구니 5 */
export function bagSize(isUnlocked: (k: string) => boolean): number {
  let n: number = BAG.base;
  for (const k of ['bag:30', 'bag:40', 'bag:50']) if (isUnlocked(k)) n += 10;
  if (isUnlocked('v:bike')) n += BAG.bikeBasket;
  return n;
}

/** 생물인가(도감 생물 칸 — 재료·탈것 줄은 아니다) */
const isCreature = (s: BagSpecies | undefined) => !!s && !!s.category && s.category !== 'item';

/** 한 칸에 몇 개: 생물 10 · 재료 30 · 도구 1 */
export function stackMaxOf(id: string, speciesOf: BagRules['speciesOf']): number {
  if (isTool(id)) return 1;
  return isCreature(speciesOf(splitVariant(id).id)) ? BAG.stack.creature : BAG.stack.material;
}

/** 벨트에 걸린 도구(최대 5개, TOOL_ORDER 순, 모르는 도구는 이름순 뒤로) */
export function beltOf(bag: Record<string, number>): string[] {
  const tools = Object.keys(bag).filter((k) => isTool(k) && (bag[k] ?? 0) > 0);
  const rank = (k: string) => { const i = TOOL_ORDER.indexOf(k); return i < 0 ? TOOL_ORDER.length : i; };
  tools.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return tools.slice(0, BELT_SIZE);
}

/** 한 종류가 쓰는 칸 수(벨트 도구·통과 아이템은 0) */
function slotsFor(id: string, n: number, rules: BagRules, belt: ReadonlySet<string>): number {
  if (n <= 0) return 0;
  if (rules.passThrough?.(id)) return 0;
  if (isTool(id)) return belt.has(id) ? 0 : 1;
  return Math.ceil(n / stackMaxOf(id, rules.speciesOf));
}

/** 지금 쓰는 칸 수 */
export function usedSlots(bag: Record<string, number>, rules: BagRules): number {
  const belt = new Set(beltOf(bag));
  let used = 0;
  for (const [k, n] of Object.entries(bag)) used += slotsFor(k, n, rules, belt);
  return used;
}

/**
 * id 를 최대 몇 개까지 더 넣을 수 있나(want 이하).
 * 같은 종류 칸의 남은 자리 + 빈 칸 × 한 칸 개수. 도구는 하나만(벨트가 차면 가방 한 칸).
 */
export function addableCount(bag: Record<string, number>, id: string, want: number, rules: BagRules): number {
  if (want <= 0) return 0;
  if (rules.passThrough?.(id)) return want;
  const have = bag[id] ?? 0;
  const free = rules.size - usedSlots(bag, rules);
  if (isTool(id)) {
    if (have >= 1) return 0;
    const beltFree = beltOf(bag).length < BELT_SIZE;
    return beltFree || free >= 1 ? 1 : 0;
  }
  const max = stackMaxOf(id, rules.speciesOf);
  const room = have > 0 ? Math.ceil(have / max) * max - have : 0;
  return Math.min(want, room + Math.max(0, free) * max);
}

/** n 개를 다 넣을 수 있나 */
export const canAddTo = (bag: Record<string, number>, id: string, n: number, rules: BagRules) => addableCount(bag, id, n, rules) >= n;

/** 여러 개를 한꺼번에(제작 결과·상점 꾸러미) 넣을 수 있나 — 앞의 것을 넣은 뒤의 가방으로 다음 것을 본다 */
export function canAddAll(bag: Record<string, number>, items: Record<string, number>, rules: BagRules): boolean {
  const sim = { ...bag };
  for (const [k, n] of Object.entries(items)) {
    if (n <= 0) continue;
    if (!canAddTo(sim, k, n, rules)) return false;
    sim[k] = (sim[k] ?? 0) + n;
  }
  return true;
}
