// 판매가(GDD 0.7·4.3·4.4) — 부수효과 없는 순수 계산. economy.ts 가 지금 자리·오늘 시세·포화 수를 넣어 부른다.
//   생물: (data price ?? BASE[★] × SIZE[shadow] × ZONE[사는 곳]) × 오늘 시세 × 개체 크기 × 변이 × 포화
//   재료: (기본가, 다른 섬 특산 과일 300) × 재료 시세 파동 × (지구에서 파는 우주 물건 ×1.8) × 변이 × 포화
import { splitVariant, type SellWhere, type Variant } from '../../core/api';
import { BASE, round10, ZONE_MULT, SIZE_MULT, itemDef, materialBase } from './data';

/** 변이 배율: 반짝이 ×5 · 왕관 ×3 · 꼬마 ×0.8 */
export const VARIANT_MULT: Record<Variant, number> = { shiny: 5, crown: 3, tiny: 0.8 };
/** 지구에서 파는 우주 물건(space-goods) 배율 */
export const SPACE_GOODS_MULT = ZONE_MULT.space;
/** 오늘의 인기 생물 배율 */
export const HOT_MULT = 2;
/** 판매 포화: 하루 이만큼까지는 제값 */
export const SAT_FREE = 10;
/** 포화 1마리당 깎이는 몫과 바닥 */
export const SAT_STEP = 0.05, SAT_FLOOR = 0.5;
/** 재료 시세 파동: ±20%, 주기 게임 5일 */
export const MAT_WAVE = { amp: 0.2, period: 5 } as const;

/** 가격이 보는 종 모양 */
export interface PriceSpecies {
  id: string;
  category?: string;
  rarity: number;
  price?: number;
  shadow?: string;
  len?: number;
  tags?: string[];
  where?: Array<{ island?: string; zone?: string }>;
}

/** 먼바다·심해·난파선 구역 */
const FAR_ZONES = new Set(['offshore', 'deep', 'trench', 'wreck', 'farsea', 'abyss']);

/** 종이 사는 곳 → ZONE 배율 키 */
export function zoneOfSpecies(s: PriceSpecies): keyof typeof ZONE_MULT {
  if (s.category === 'space') return 'space';
  const ws = s.where ?? [];
  if (ws.some((w) => w.zone && FAR_ZONES.has(w.zone))) return 'farsea';
  if (!ws.length || ws.some((w) => !w.island || w.island === 'home' || w.island === 'any' || w.zone === 'shore')) return 'home';
  return 'island';
}

/** 종 기본가: data 의 price 가 있으면 그것(이미 0.7 공식), 없으면 BASE × SIZE × ZONE */
export function speciesBasePrice(s: PriceSpecies): number {
  if (typeof s.price === 'number' && Number.isFinite(s.price) && s.price > 0) return s.price;
  const base = BASE[Math.min(5, Math.max(1, Math.round(s.rarity) || 1))];
  // 곤충은 M, 나머지는 표의 그림자 크기(없으면 M)
  const size = s.category === 'bug' || s.category === 'insect' ? 1 : SIZE_MULT[s.shadow ?? 'M'] ?? 1;
  return base * size * ZONE_MULT[zoneOfSpecies(s)];
}

/** 개체 크기 보정: 0.85 + 0.3 × (크기 / 최대 크기). 크기를 모르면 1 */
export function sizeFactor(size: number | undefined, best: number | undefined, len: number | undefined): number {
  if (!size || !Number.isFinite(size) || size <= 0) return 1;
  // 최대 크기 = 지금까지 잡은 최고 · 평균 +3σ(len × 1.45) 중 큰 쪽(지금 개체보다 작을 순 없다)
  const max = Math.max(size, best ?? 0, len ? len * 1.45 : 0);
  return 0.85 + 0.3 * Math.min(1, size / max);
}

/** 판매 포화 배율 — 오늘 이미 판 수(soldBefore) 뒤의 다음 한 마리. 11번째부터 −5%씩, 최저 50% */
export function saturationMult(soldBefore: number): number {
  const over = Math.max(0, soldBefore + 1 - SAT_FREE);
  return Math.max(SAT_FLOOR, 1 - over * SAT_STEP);
}

/** 재료 시세 파동(재료마다 위상이 다르다) */
export const materialWave = (day: number, index: number) => 1 + MAT_WAVE.amp * Math.sin((day / MAT_WAVE.period) * Math.PI * 2 + index * 1.7);

/** 판매가 한 개 — 입력은 전부 부르는 쪽이 넣는다 */
export interface UnitPriceIn {
  /** 가방 키('f_carp@crown' 처럼 변이 꼬리 가능) */
  id: string;
  species?: PriceSpecies;
  /** 개체 크기 cm */
  size?: number;
  /** 도감 최고 크기 */
  best?: number;
  variant?: Variant;
  /** 파는 곳(우주 물건 보정) */
  where: SellWhere;
  /** 파는 섬(다른 섬 특산 과일 300) */
  island?: string | null;
  /** 오늘 시세 배율(인기 ×2, 재료 파동) */
  market: number;
  /** 오늘 이 종을 이미 판 수 */
  soldBefore: number;
}

/** 팔 수 없는 것인가(병편지·녹슨 열쇠·잡동사니·도구) */
export function unsellable(id: string, s?: PriceSpecies): boolean {
  const base = splitVariant(id).id;
  if (base.startsWith('tool_')) return true;
  const m = itemDef(base);
  if (m) return !!m.noSell;
  if (s) return s.category === 'item' && !(typeof s.price === 'number' && s.price > 0);
  return false;
}

export function unitPrice(o: UnitPriceIn): number {
  const { id: base, variant: v0 } = splitVariant(o.id);
  const variant = o.variant ?? v0;
  if (unsellable(o.id, o.species)) return 0;
  const m = itemDef(base);
  let p: number;
  if (m) {
    p = materialBase(base, o.island ?? undefined);
    if (m.tags.includes('space-goods') && o.where !== 'space') p *= SPACE_GOODS_MULT;
  } else if (o.species) {
    p = speciesBasePrice(o.species) * sizeFactor(o.size, o.best, o.species.len);
    // 우주 생물·우주 물건 태그는 지구에서 ×1.8(우주 생물은 이미 ZONE 1.8 이 들어 있다 — 태그 붙은 것만)
    if (o.species.tags?.includes('space-goods') && o.where !== 'space') p *= SPACE_GOODS_MULT;
  } else return 0;
  p *= o.market > 0 ? o.market : 1;
  if (variant) p *= VARIANT_MULT[variant];
  p *= saturationMult(o.soldBefore);
  return round10(p);
}

// ── 오늘의 인기(4.4) ──

/**
 * 날마다 돌아가는 고르기: 길이 len 인 목록에서 day 의 칸. 하루 걸러 같은 게 연달아 나오지 않는다.
 * len 개씩 묶은 '판'마다 섞은 순서를 쓰고, 판이 바뀌는 날 앞뒤가 같으면 새 판의 첫 둘을 바꾼다.
 */
export function rotatePick(len: number, day: number, shuffleRng: (block: number) => () => number): number {
  if (len <= 1) return 0;
  const d = Math.max(0, Math.floor(day));
  // 두 개짜리는 하루씩 번갈아(시작만 시드로)
  if (len === 2) return (d + Math.floor(shuffleRng(0)() * 2)) % 2;
  const order = (b: number) => {
    const r = shuffleRng(b);
    const a = Array.from({ length: len }, (_, i) => i);
    for (let i = len - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const b = Math.floor(d / len), k = d % len;
  const cur = order(b);
  // 판이 바뀌는 날: 앞 판의 마지막과 같으면 첫 둘을 바꾼다(len > 2 라 앞 판의 마지막 칸은 바꿈의 영향을 안 받는다)
  if (b > 0 && cur[0] === order(b - 1)[len - 1]) [cur[0], cur[1]] = [cur[1], cur[0]];
  return cur[k];
}
