// 공룡 규칙(순수) — 하트(친밀도)·하루 상한·먹이 판정·사는 구역 고르기·하루 선물 횟수. three·DOM 없음 → 테스트가 바로 부른다.
// 저장은 game.state.flags.dino 하나(계약 v2 7장): {hearts, dayGain, fed, petDay, tinoFish, eggs, …} — P1 칸(알·목장 …)은 p1logic.DinoP1Flags.
import { MATERIALS } from '../economy/data';
import type { DinoSpec, DinoZone, Fav, TimeCode } from './data';
import { ensureP1, type DinoP1Flags } from './p1logic';

// ───────────── 하트 ─────────────
/** 하트 칸(화면에 보이는 최대) */
export const HEART_MAX = 5;
/** 하루에 오를 수 있는 하트(종마다) */
export const DAY_CAP = 2;
/** 친구 되는 하트: P0 2, 정식 5(GDD 4.8) */
export const threshold = (p0: boolean) => (p0 ? 2 : HEART_MAX);
/** 하트가 오르는 일 */
export type GainKind = 'feed' | 'pet' | 'request';
/** 쓰다듬기 +0.5(하루 1번), 부탁 +1 — 먹이는 foodValue 로 */
export const PET_GAIN = 0.5;
export const REQUEST_GAIN = 1;

export interface DinoFlags extends DinoP1Flags {
  /** 종 id → 하트(0.5 단위) */
  hearts: Record<string, number>;
  /** 게임 날 → 종 id → 그날 오른 하트 */
  dayGain: Record<string, Record<string, number>>;
  /** 종 id → 먹이 준 횟수 */
  fed: Record<string, number>;
  /** 종 id → 마지막으로 쓰다듬은 날 */
  petDay: Record<string, number>;
  /** 티노에게 준 물고기(P1 전설 탈것은 30번) */
  tinoFish: number;
  /** 게임 날 → 종 id → 그날 받은 선물 수 */
  drops: Record<string, Record<string, number>>;
  /** 한 번만 주는 선물(가구)을 받았나 */
  gifts: Record<string, boolean>;
  /** 같이 다니는 펫 종(null = 없음) */
  pet: string | null;
  /** 티노 언덕 금상자를 연 마지막 날(-1 = 아직) */
  tinoChest: number;
  /** 오늘의 공룡 부탁을 들어준 날 */
  reqDay: number;
  /** econ 이 없을 때 해금 기록(대체) */
  unlocked: Record<string, boolean>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numMap = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
  return out;
};
const nestedMap = (v: unknown): Record<string, Record<string, number>> => {
  const out: Record<string, Record<string, number>> = {};
  if (isObj(v)) for (const [k, m] of Object.entries(v)) out[k] = numMap(m);
  return out;
};

/** 깨진·옛 모양도 받아서 늘 같은 모양으로(제자리에 고친다 — 저장 객체를 그대로 쓴다) */
export function ensureFlags(raw: unknown): DinoFlags {
  const f = (isObj(raw) ? raw : {}) as Record<string, unknown>;
  f.hearts = numMap(f.hearts);
  f.dayGain = nestedMap(f.dayGain);
  f.fed = numMap(f.fed);
  f.petDay = numMap(f.petDay);
  f.tinoFish = num(f.tinoFish);
  f.drops = nestedMap(f.drops);
  const gifts: Record<string, boolean> = {};
  if (isObj(f.gifts)) for (const [k, b] of Object.entries(f.gifts)) if (b) gifts[k] = true;
  f.gifts = gifts;
  f.pet = typeof f.pet === 'string' ? f.pet : null;
  f.tinoChest = num(f.tinoChest, -1);
  f.reqDay = num(f.reqDay, -1);
  const un: Record<string, boolean> = {};
  if (isObj(f.unlocked)) for (const [k, b] of Object.entries(f.unlocked)) if (b) un[k] = true;
  f.unlocked = un;
  // P1: 알·목장·대이동·리듬·복원·전설 티노(p1logic.ensureP1)
  ensureP1(f);
  return f as unknown as DinoFlags;
}

/** 오래된 날 기록 지우기(오늘·어제만 남긴다) */
function prune(m: Record<string, Record<string, number>>, day: number) {
  for (const k of Object.keys(m)) if (Number(k) < day - 1) delete m[k];
}

/** 오늘 이 종에 더 오를 수 있는 하트 */
export function remainingToday(f: DinoFlags, id: string, day: number): number {
  return Math.max(0, DAY_CAP - (f.dayGain[day]?.[id] ?? 0));
}

export interface GainResult {
  /** 실제로 오른 하트 */
  added: number;
  hearts: number;
  /** 이번에 친구 하트(threshold)를 넘었나 */
  crossed: boolean;
  /** 오늘 상한에 막혔나(조금이라도 잘렸으면 true) */
  capped: boolean;
}

/**
 * 하트 올리기 — 하루 상한(+2)·최대 5칸을 지킨다. 0.5 단위로 저장.
 * crossed = 이번 호출로 threshold(P0 2 / 정식 5)에 처음 닿았나.
 */
export function applyGain(f: DinoFlags, id: string, amount: number, day: number, p0: boolean): GainResult {
  const before = f.hearts[id] ?? 0;
  const room = Math.min(remainingToday(f, id, day), HEART_MAX - before);
  const want = Math.max(0, amount);
  const added = Math.max(0, Math.min(want, room));
  const hearts = Math.round((before + added) * 2) / 2;
  if (added > 0) {
    f.hearts[id] = hearts;
    const d = (f.dayGain[day] ??= {});
    d[id] = Math.round(((d[id] ?? 0) + added) * 2) / 2;
    prune(f.dayGain, day);
  }
  const th = threshold(p0);
  return { added, hearts, crossed: before < th && hearts >= th, capped: added < want };
}

/** 하트 줄: ♥♥♡♡♡ (반 칸은 뒤에 '+½') */
export function heartLine(h: number): string {
  const c = Math.max(0, Math.min(HEART_MAX, h));
  const full = Math.floor(c), half = c - full >= 0.5;
  return '♥'.repeat(full) + '♡'.repeat(HEART_MAX - full) + (half ? ' +½' : '');
}

// ───────────── 먹이(GDD 3.7) ─────────────
/** 초식 먹이: 과일(m_*, 'fruit' 태그) + 고사리 + 은행 */
export const FRUIT_IDS: readonly string[] = MATERIALS.filter((m) => m.tags.includes('fruit')).map((m) => m.id);
export const HERB_FOODS: readonly string[] = [...FRUIT_IDS, 'm_fern', 'm_ginkgo'];

/** 가방 아이템 → 종 정보(물고기인지·★) */
export type SpeciesLookup = (id: string) => { category: string; rarity: number } | undefined;

export interface FoodValue { ok: boolean; gain: number; fav: boolean }

/** fav 에 맞나 */
function isFav(fav: Fav | null, id: string, fish?: { rarity: number }): boolean {
  if (!fav) return false;
  if (fav.items?.includes(id)) return true;
  if (fav.fruit && FRUIT_IDS.includes(id)) return true;
  if (fav.fish && fish && fish.rarity >= fav.fish) return true;
  return false;
}

/**
 * 이 아이템을 먹나, 하트가 얼마나 오르나.
 * - 초식: HERB_FOODS 만. +1, 좋아하는 먹이 +2.
 * - 육식: 가방의 아무 물고기(category 'fish', 변이 키 '…@crown' 은 아깝다고 안 먹는다). 하트 = ★ 수(★1 = +1 … ★5 = +5), 좋아하는 먹이면 +1 더.
 */
export function foodValue(spec: Pick<DinoSpec, 'diet' | 'fav'>, itemId: string, lookup: SpeciesLookup): FoodValue {
  const no: FoodValue = { ok: false, gain: 0, fav: false };
  if (!spec.fav || itemId.includes('@')) return no;
  if (spec.diet === 'herb') {
    if (!HERB_FOODS.includes(itemId)) return no;
    const fav = isFav(spec.fav, itemId);
    return { ok: true, gain: fav ? 2 : 1, fav };
  }
  const sp = lookup(itemId);
  if (!sp || sp.category !== 'fish') return no;
  const fav = isFav(spec.fav, itemId, sp);
  const r = Math.max(1, Math.min(5, Math.round(sp.rarity)));
  return { ok: true, gain: r + (fav ? 1 : 0), fav };
}

/**
 * 가방에서 줄 먹이 고르기: 오늘 남은 하트(room)를 가장 많이 채우는 것 → 같으면 초식은 좋아하는 것·싼 것, 육식은 ★ 낮은 물고기.
 * 줄 게 없으면 null.
 */
export function pickFood(spec: Pick<DinoSpec, 'diet' | 'fav'>, bag: Record<string, number>, lookup: SpeciesLookup, room: number): ({ id: string } & FoodValue) | null {
  let best: ({ id: string; eff: number; cost: number } & FoodValue) | null = null;
  const ids = Object.keys(bag).sort();
  for (const id of ids) {
    if ((bag[id] ?? 0) <= 0) continue;
    const v = foodValue(spec, id, lookup);
    if (!v.ok) continue;
    const eff = Math.min(v.gain, Math.max(0, room));
    const cost = spec.diet === 'carni' ? (lookup(id)?.rarity ?? 1) : (MATERIALS.find((m) => m.id === id)?.price ?? 50);
    // 육식은 같은 효과면 덜 귀한 물고기(★5 를 아끼게), 초식은 같은 효과면 좋아하는 먹이 → 싼 것
    const better = !best || eff > best.eff || (eff === best.eff && (spec.diet === 'carni'
      ? cost < best.cost || (cost === best.cost && v.fav && !best.fav)
      : (v.fav && !best.fav) || (v.fav === best.fav && cost < best.cost)));
    if (better) best = { id, ...v, eff, cost };
  }
  return best ? { id: best.id, ok: best.ok, gain: best.gain, fav: best.fav } : null;
}

/** 좋아하는 먹이 한 줄(카드·안내) */
export function favText(fav: Fav | null, name: (id: string) => string = (i) => i): string {
  if (!fav) return '먹이를 받지 않아요';
  if (fav.fish) return fav.fish > 1 ? `★${fav.fish} 이상 물고기` : '물고기';
  if (fav.fruit) return '과일';
  return (fav.items ?? []).map(name).join('·');
}

// ───────────── 깨어 있는 시간 ─────────────
/** 시간 칸(아침·낮·저녁·밤) → 깨어 노는 시각 범위. 앞뒤로 넉넉히(그 밖엔 그 자리에서 쿨쿨) */
const AWAKE: Record<TimeCode, [number, number]> = { morning: [4, 12], day: [6, 20], sunset: [15, 23], night: [19, 7] };
const inRange = (h: number, [a, b]: [number, number]) => (a <= b ? h >= a && h < b : h >= a || h < b);
export function awakeAt(time: DinoSpec['time'], hour: number): boolean {
  if (time === 'all') return true;
  const h = ((hour % 24) + 24) % 24;
  return time.some((c) => inRange(h, AWAKE[c]));
}

// ───────────── 사는 구역 ─────────────
export interface HabitatIn {
  /** 섬 id(없으면 바다) */
  island: string | null;
  /** geo.zoneAt 의 구역 코드 */
  zone: string;
  /** 해안까지 거리(m, 바다면 음수) */
  coast: number;
  /** 땅 높이 */
  h: number;
  /** 근처 호수 종류(ancientlake·pond·swamp·hotspring …, 없으면 null) */
  lake?: string | null;
  /** 가파른가 */
  steep?: boolean;
  /** 표면(lava·snow …) */
  kind?: string;
}

/**
 * 좌표 정보 → 공룡이 사는 구역(GDD 3.7 '구역' 칸).
 * 공룡섬: 초원 계곡(ranch) · 거목 숲(안쪽 고사리) · 해안 정글(해안 가까운 고사리) · 화산 기슭 · 호숫가 · 늪 · 둥지 절벽(fossil) · 화산 정상(crater)
 * 솜눈섬: 눈밭 · 설산(높은 곳·aurorahill) · 눈꽃 숲(snowtree)
 */
export function habitatAt(i: HabitatIn): DinoZone | null {
  if (!i.island || i.coast < 6 || i.kind === 'lava' || i.zone === 'lava') return null;
  if (i.island === 'dino') {
    if (i.zone === 'crater') return 'summit';
    if (i.lake === 'swamp' || i.zone === 'swamp') return 'swamp';
    if (i.lake === 'ancientlake' || i.lake === 'pond' || i.lake === 'footprint') return 'lake';
    if (i.zone === 'fossil') return 'nest';
    if (i.zone === 'volcano') return i.h < 40 ? 'volcano' : null;
    if (i.zone === 'ranch') return 'meadow';
    if (i.steep) return null;
    return i.coast < 90 ? 'jungle' : 'forest';
  }
  if (i.island === 'ice') {
    if (i.zone === 'icecave' || i.zone === 'cabin' || i.zone === 'beach') return null;
    if (i.zone === 'snowtree') return 'snowforest';
    if (i.zone === 'aurorahill' || (i.zone === 'snow' && (i.h > 22 || i.steep))) return 'snowpeak';
    if (i.zone === 'snow') return 'snowfield';
    return null;
  }
  return null;
}

/** 이 구역에 사는 종(가중치 > 0) */
export function speciesFor(zone: DinoZone, list: readonly DinoSpec[]): DinoSpec[] {
  return list.filter((d) => d.weight > 0 && d.zones.includes(zone));
}

/** 가중치로 하나 고르기(결정적) */
export function pickWeighted<T extends { weight: number }>(list: readonly T[], rnd: () => number): T | null {
  const tot = list.reduce((s, d) => s + d.weight, 0);
  if (!list.length || tot <= 0) return null;
  let r = rnd() * tot;
  for (const d of list) { r -= d.weight; if (r <= 0) return d; }
  return list[list.length - 1];
}

// ───────────── 하루 선물 ─────────────
/** 오늘 남은 선물 횟수 */
export function dropsLeft(f: DinoFlags, id: string, day: number, perDay: number): number {
  return Math.max(0, perDay - (f.drops[day]?.[id] ?? 0));
}
/** 선물 한 번 쓰기(남았으면 true) */
export function useDrop(f: DinoFlags, id: string, day: number, perDay: number): boolean {
  if (dropsLeft(f, id, day, perDay) <= 0) return false;
  const d = (f.drops[day] ??= {});
  d[id] = (d[id] ?? 0) + 1;
  prune(f.drops, day);
  return true;
}

// ───────────── 오늘의 공룡 부탁 ─────────────
export interface DinoRequest { id: string; item: string; n: number; fish?: number }
/**
 * 게임 날마다 공룡섬의 한 종이 부탁을 한다(rnd 는 `dino:req:<날>` 같은 날 고정 난수). 초식은 좋아하는 먹이 3개(과일 좋아하면 사과 3), 육식은 ★ 조건 물고기 2마리.
 * 들어주면 하트 +1(부탁).
 */
export function requestOfDay(list: readonly DinoSpec[], rnd: () => number): DinoRequest | null {
  const pool = list.filter((d) => d.home === 'dino' && d.fav && d.weight > 0);
  if (!pool.length) return null;
  const d = pool[Math.floor(rnd() * pool.length) % pool.length];
  const fav = d.fav!;
  if (fav.fish) return { id: d.id, item: 'fish', n: 2, fish: fav.fish };
  if (fav.items?.length) return { id: d.id, item: fav.items[0], n: 3 };
  return { id: d.id, item: 'm_apple', n: 3 };
}
