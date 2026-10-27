// 섬 상인 시세(GDD 4.4 '상인별 보정'·'친구 섬 시세', wave 4 econ-p1) — 부수효과 없는 순수 계산.
// economy.ts 의 sell(id, n, shop)·priceOf(id, {shop, where}) 가 가게 id 로 부른다.
//   bazaar(낙타 상인): 곤충 ×1.3 · 물고기 ×0.9
//   moon(떡순이): 지구 생물 ×1.5, 생물(지구·달) 판 값 400코인마다 달떡(m_mochi) 1개 덤 — 모자란 값은 다음 판매로 이월
//     (재료·우주 물건·달떡 자신은 덤에 안 친다 — 달떡을 팔아 달떡을 받는 고리를 막는다)
//   junk(너구리): 쓰레기는 한 개 10코인 고정 + 재활용 포인트 1(10포인트 = 반짝별 1), 그 밖의 것은 ×0.7
//   station(꾸물이): 우주 물건·우주 생물 ×1.2
//   diving(보들): 바다 생물 ×1.1
//   friend(친구 섬 꽥사장): 인기 생물이 다르다(friendHot) — 내 인기 생물 ×2 는 없어지고 친구 인기 생물이 ×2

/** 가게가 보는 물건 모양 */
export interface MerchantItem {
  id: string;
  category?: string;
  tags?: string[];
  where?: Array<{ island?: string; zone?: string }>;
}

/** 쓰레기 한 개 값(너구리 고물상) */
export const JUNK_PAY = 10;
/** 재활용 포인트 → 반짝별 1 */
export const RECYCLE_PER_STAR = 10;
/** 달떡 덤: 판 값 이만큼마다 1개 */
export const MOCHI_PER_COINS = 400;
/** 우주에 사는 곳(섬 id·구역) — 이 줄이 있는 종은 '지구 생물'이 아니다 */
const SPACE_ISLANDS = new Set(['moon', 'space', 'sugar', 'jelly', 'frost', 'nebula', 'gravel', 'station', 'blackhole']);
const SPACE_ZONES = new Set(['moonpond', 'cloudsea', 'jellysea', 'blackhole', 'crater-moon', 'ring', 'nebula']);
/** 생물 범주(재료·탈것 줄 'item' 은 아니다) */
const CREATURE_CATS = new Set(['fish', 'bug', 'insect', 'sea', 'dino', 'fossil', 'space']);

export const isCreatureItem = (it: MerchantItem) => !!it.category && CREATURE_CATS.has(it.category);
export const isJunkItem = (it: MerchantItem) => !!it.tags?.includes('junk') || it.id.startsWith('t_');
export const isSpaceItem = (it: MerchantItem) =>
  it.category === 'space' || !!it.tags?.includes('space-goods') ||
  !!it.where?.some((w) => (w.island && SPACE_ISLANDS.has(w.island)) || (w.zone && SPACE_ZONES.has(w.zone)));
/** 지구에서 잡은 생물(달 떡방아가 ×1.5 로 사 준다) */
export const isEarthCreature = (it: MerchantItem) => isCreatureItem(it) && !isSpaceItem(it);

/** 가게마다 한 줄 안내(가게 창·대사) */
export const MERCHANT_NOTE: Record<string, string> = {
  bazaar: '곤충은 비싸게(×1.3), 물고기는 조금 싸게(×0.9) 사요',
  moon: '지구 생물은 ×1.5! 팔면 달떡도 덤으로 줘요 🍡',
  junk: '쓰레기는 한 개 10코인 + 재활용 포인트(10포인트 = 반짝별 1) ♻️',
  station: '우주 물건·우주 생물은 ×1.2 로 사요 🛰️',
  diving: '바다 생물은 ×1.1 로 사요 🐙',
  friend: '친구 섬은 인기 생물이 달라요!',
};

/**
 * 가게 보정 배율(쓰레기 고정값은 junkFixed 로 따로). 모르는 가게·보정 없는 가게는 1.
 */
export function merchantMult(shop: string | undefined | null, it: MerchantItem): number {
  switch (shop) {
    case 'bazaar':
      if (it.category === 'bug' || it.category === 'insect') return 1.3;
      if (it.category === 'fish') return 0.9;
      return 1;
    case 'moon': return isEarthCreature(it) ? 1.5 : 1;
    case 'junk': return isJunkItem(it) ? 1 : 0.7;
    case 'station': return isSpaceItem(it) ? 1.2 : 1;
    case 'diving': return it.category === 'sea' ? 1.1 : 1;
    default: return 1;
  }
}

/** 이 가게에서 이 물건이 고정 값인가(너구리의 쓰레기 10코인) — 고정이면 그 값, 아니면 null */
export function junkFixed(shop: string | undefined | null, it: MerchantItem): number | null {
  return shop === 'junk' && isJunkItem(it) ? JUNK_PAY : null;
}

/** 이 가게에서 팔면 쌓이는 재활용 포인트(쓰레기 한 개 1) */
export const recyclePoints = (shop: string | undefined | null, it: MerchantItem, n: number) =>
  shop === 'junk' && isJunkItem(it) ? Math.max(0, Math.floor(n)) : 0;

/** 재활용 포인트 → 반짝별(10포인트마다 1) + 남은 포인트 */
export function recycleToStars(points: number): { stars: number; left: number } {
  const p = Math.max(0, Math.floor(points));
  return { stars: Math.floor(p / RECYCLE_PER_STAR), left: p % RECYCLE_PER_STAR };
}

/**
 * 달떡 덤 — 달(moon)에서 판 생물 값(코인) + 이월분 → 달떡 수와 새 이월분.
 * 생물(지구·달 생물, GDD '달 생물 판매')만 친다. 재료·쓰레기·우주 물건(달떡 포함)은 0 이고 이월분도 그대로.
 */
export function mochiFor(shop: string | undefined | null, it: MerchantItem, coins: number, carry = 0): { mochi: number; carry: number } {
  const c0 = carry > 0 ? Math.floor(carry) : 0;
  if (shop !== 'moon' || !isCreatureItem(it) || !(coins > 0)) return { mochi: 0, carry: c0 };
  const sum = c0 + Math.floor(coins);
  return { mochi: Math.floor(sum / MOCHI_PER_COINS), carry: sum % MOCHI_PER_COINS };
}

/**
 * 친구 섬 인기 생물 — 내 인기 목록(own)과 같은 칸에서 고르되 시드가 다르다.
 * pools[i] 는 own[i] 와 같은 무리(물고기·곤충·바다/공룡)의 정렬된 id 목록, pick(i, len) 은 그날의 칸.
 * 내 것과 겹치면 다음 칸으로 민다(무리가 하나뿐이면 어쩔 수 없이 같다).
 */
export function friendHot(pools: string[][], own: string[], pick: (group: number, len: number) => number): string[] {
  const out: string[] = [];
  pools.forEach((pool, gi) => {
    if (!pool.length) return;
    let i = pick(gi, pool.length) % pool.length;
    if (pool.length > 1 && own.includes(pool[i])) i = (i + 1) % pool.length;
    out.push(pool[i]);
  });
  return out;
}
