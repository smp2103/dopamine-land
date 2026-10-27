// 보물상자 규칙(GDD 5.4·5.3) — 등급표·내용물 굴림·흔들림 힌트·미믹·상자 천장·자리 고르기. 부수효과 없는 순수 모듈.
// economy.ts 가 결과(LootPlan)를 받아 코인·반짝별·열쇠 조각·가방·해금에 실제로 반영한다.
// 렌더(상자 모델·흔들기·빛기둥·미믹 상자게)는 chests.ts 에 있다.
import type { KeyColor } from '../../core/api';
import { MATERIALS, MAT, GOODS, RECIPES, TIERS, round10, type Material, type ChestTier } from './data';

// ── 등급 ──

export type { ChestTier, ChestTierDef as TierDef } from './data';
export const CHEST_TIERS: ChestTier[] = ['wood', 'silver', 'gold', 'rainbow', 'space'];
/** 예전 저장의 등급 → 새 등급 */
export const LEGACY_TIER: Readonly<Record<string, ChestTier>> = { common: 'wood', rare: 'silver', epic: 'gold', legend: 'rainbow' };
/** 아무 등급 이름 → 새 등급(모르면 null) */
export function toTier(t: unknown): ChestTier | null {
  if (typeof t !== 'string') return null;
  if ((CHEST_TIERS as string[]).includes(t)) return t as ChestTier;
  return LEGACY_TIER[t] ?? null;
}
/** 등급표(이름·색·열쇠·흔들림 횟수·빛기둥) — data.ts TIERS 와 같은 것 */
export const CHEST_DEF = TIERS;
/** 흔들림 한 번 길이(초) — audio 의 chest-shake 간격과 같다 */
export const SHAKE_SEC = 0.38;
/** 흔들림 힌트 횟수 */
export const shakesOf = (tier: ChestTier) => CHEST_DEF[tier].shakes;

// ── 배치·확률 상수 ──

/** 섬마다 고정 20 + 매일 20 (GDD 2.2.1) */
export const FIXED_PER_ISLAND = 20;
export const DAILY_PER_ISLAND = 20;
/** 큰 섬마다 '높은 곳' 은상자(고정) */
export const HIGH_SILVER = 2;
/** 나무상자 자리의 10% 는 은상자로 */
export const SILVER_UPGRADE = 0.1;
/** 미믹: 나무·은상자 3%, 쪼꼬미섬 15% */
export const MIMIC_RATE = { normal: 0.03, islet: 0.15 } as const;
/** 상자 천장: 나무상자 50개마다 은상자 1개 확정 */
export const CHEST_PITY = 50;

/** 미믹인가 — 나무·은상자만 */
export function rollMimic(tier: ChestTier, islet: boolean, u: number): boolean {
  if (tier !== 'wood' && tier !== 'silver') return false;
  return u < (islet ? MIMIC_RATE.islet : MIMIC_RATE.normal);
}

/**
 * 상자 천장 — 나무상자를 열 때마다 +1, 50번째는 은상자로 바뀐다(열쇠 없이).
 * state 를 바꾸고 실제 등급을 돌려준다.
 */
export function applyChestPity(state: { wood: number }, tier: ChestTier): { tier: ChestTier; pityHit: boolean } {
  if (tier !== 'wood') return { tier, pityHit: false };
  state.wood = Math.max(0, Math.floor(state.wood || 0)) + 1;
  if (state.wood >= CHEST_PITY) { state.wood = 0; return { tier: 'silver', pityHit: true }; }
  return { tier, pityHit: false };
}
/** HUD 세 번째 두근 게이지(상자) */
export const chestGauge = (wood: number) => Math.min(1, Math.max(0, wood) / CHEST_PITY);

// ── 내용물 표(5.4) ──

export type Outcome =
  | 'coins' | 'mats' | 'bait' | 'recipe' | 'keypiece' | 'capsule'
  | 'rare' | 'furniture' | 'stars' | 'goldpack' | 'skin' | 'goldbait'
  | 'jackpot' | 'moonrock' | 'stardust' | 'helmet';
/** 등급별 결과 가중치(%) — 표 그대로 */
export const LOOT_TABLE: Readonly<Record<ChestTier, ReadonlyArray<{ kind: Outcome; w: number }>>> = {
  wood: [{ kind: 'coins', w: 55 }, { kind: 'mats', w: 25 }, { kind: 'bait', w: 10 }, { kind: 'recipe', w: 5 }, { kind: 'keypiece', w: 4 }, { kind: 'capsule', w: 1 }],
  silver: [{ kind: 'coins', w: 45 }, { kind: 'rare', w: 30 }, { kind: 'furniture', w: 15 }, { kind: 'recipe', w: 7 }, { kind: 'keypiece', w: 2 }, { kind: 'capsule', w: 1 }],
  gold: [{ kind: 'stars', w: 30 }, { kind: 'coins', w: 30 }, { kind: 'goldpack', w: 20 }, { kind: 'skin', w: 12 }, { kind: 'goldbait', w: 7 }, { kind: 'keypiece', w: 1 }],
  rainbow: [{ kind: 'jackpot', w: 100 }],
  space: [{ kind: 'moonrock', w: 40 }, { kind: 'stardust', w: 30 }, { kind: 'coins', w: 20 }, { kind: 'recipe', w: 8 }, { kind: 'helmet', w: 2 }],
};
/** 코인 범위 */
const COINS: Partial<Record<ChestTier, [number, number]>> = { wood: [100, 500], silver: [1000, 3000], gold: [5000, 15000], space: [3000, 8000] };
/** 열쇠 조각 색 — 나무 → 은, 은 → 금, 금 → 무지개 */
export const PIECE_OF: Partial<Record<ChestTier, KeyColor>> = { wood: 'silver', silver: 'gold', gold: 'rainbow' };
/** 우주 헬멧 스킨(5.4 우주상자 2%) */
export const HELMET_SKIN = 'skin_helmet_1';

/** 굴린 결과 한 줄 — economy 가 반영한다 */
export type LootLine =
  | { kind: 'coins'; n: number; name: string }
  | { kind: 'stars'; n: number; name: string }
  | { kind: 'item'; id: string; n: number; name: string }
  | { kind: 'keypiece'; color: KeyColor; n: number; name: string }
  | { kind: 'unlock'; key: string; name: string };
export interface LootPlan { tier: ChestTier; outcome: Outcome; lines: LootLine[] }

/** 굴림에 필요한 바깥 정보 */
export interface LootEnv {
  /** 상자가 있는 섬(쪼꼬미섬은 'islet-a' 처럼) — 특산 재료를 고른다 */
  island?: string | null;
  /** 아직 모르는 레시피 카드 id(없으면 코인으로 바꿔 준다) */
  unknownCards?: string[];
  /** 우주 가구 레시피 중 아직 모르는 것 */
  unknownSpaceCards?: string[];
  /** 헬멧 스킨을 이미 가졌나 */
  hasHelmet?: boolean;
}

const KEY_NAME: Record<KeyColor, string> = { silver: '은열쇠 조각', gold: '금열쇠 조각', rainbow: '무지개 열쇠 조각' };
const matName = (id: string) => MAT.get(id)?.name ?? GOODS[id]?.name ?? id;
const recipeName = (rid: string) => RECIPES.find((r) => r.id === rid)?.name ?? rid;
const int = (u: number, a: number, b: number) => a + Math.floor(u * (b - a + 1));

/** 섬 특산 재료(태그 specialty:<섬>). 쪼꼬미섬·모르는 섬은 모든 섬 특산에서. maxPrice 보다 비싼 건 뺀다 */
export function specialtyOf(island: string | null | undefined, maxPrice = Infinity): Material[] {
  const all = MATERIALS.filter((m) => m.tags.some((t) => t.startsWith('specialty:')) && m.price <= maxPrice);
  if (!island) return all;
  const own = all.filter((m) => m.tags.includes(`specialty:${island}` as Material['tags'][number]));
  return own.length ? own : all;
}
/** 나무상자에 섞이는 기본 재료 */
const BASIC_MATS = ['m_wood', 'm_stone', 'm_vine', 'm_shell', 'm_clay', 'm_hardwood', 'm_wood', 'm_stone'];

/** 레시피 카드로 나올 수 있는 레시피(카드·카드 조건 레시피 — GDD 표 안) */
export const CARD_RECIPES: string[] = RECIPES.filter((r) => !r.extra && (r.gate.startsWith('card:') || r.gate.startsWith('recipe:'))).map((r) => r.id);
/** 우주상자 '우주 가구 레시피' 후보 */
export const SPACE_CARD_RECIPES: string[] = RECIPES.filter((r) => r.kind === '가구' && r.gate === 'space:moon').map((r) => r.id);

/** 가중치 표에서 결과 하나 */
export function pickOutcome(tier: ChestTier, u: number): Outcome {
  const t = LOOT_TABLE[tier];
  const total = t.reduce((a, x) => a + x.w, 0);
  let x = u * total;
  for (const row of t) { x -= row.w; if (x < 0) return row.kind; }
  return t[t.length - 1].kind;
}

/**
 * 상자 하나 굴리기(GDD 5.4 표). 같은 rng 면 같은 결과.
 * P1 칸(가구·탈것 스킨)은 표에 적힌 대로 지금은 코인 ×2·반짝별 30 으로 준다.
 */
export function rollLoot(tier: ChestTier, rng: () => number, env: LootEnv = {}): LootPlan {
  const outcome = pickOutcome(tier, rng());
  const lines: LootLine[] = [];
  const coins = (a: number, b: number, name = '도파코인') => lines.push({ kind: 'coins', n: round10(a + rng() * (b - a)), name });
  const item = (id: string, n: number) => { if (n > 0) lines.push({ kind: 'item', id, n, name: matName(id) }); };
  const piece = (c: KeyColor) => lines.push({ kind: 'keypiece', color: c, n: 1, name: KEY_NAME[c] });
  const card = (pool: string[] | undefined, fallback: [number, number]) => {
    const list = pool ?? [];
    if (!list.length) { coins(fallback[0], fallback[1]); return; }
    const rid = list[Math.floor(rng() * list.length)];
    lines.push({ kind: 'unlock', key: `recipe:${rid}`, name: `레시피 카드: ${recipeName(rid)}` });
  };
  const range = COINS[tier] ?? [100, 500];
  switch (outcome) {
    case 'coins': coins(range[0], range[1]); break;
    case 'mats': {
      // 재료 2~5개: 섬 특산 1~2 + 기본 재료로 채우기. 가끔 헌 타이어가 끼어 있다(쓰레기)
      const total = int(rng(), 2, 5);
      const sp = specialtyOf(env.island, 999);
      const spN = Math.min(total, int(rng(), 1, 2));
      if (sp.length) item(sp[Math.floor(rng() * sp.length)].id, spN);
      let left = total - (sp.length ? spN : 0);
      const picks: Record<string, number> = {};
      while (left > 0) {
        const id = rng() < 0.12 ? 'm_iron' : BASIC_MATS[Math.floor(rng() * BASIC_MATS.length)];
        picks[id] = (picks[id] ?? 0) + 1; left--;
      }
      for (const [id, n] of Object.entries(picks)) item(id, n);
      if (rng() < 0.15) item('t_tire', 1);
      break;
    }
    case 'bait': item(rng() < 0.65 ? 'bait_worm' : 'bait_dough', 3); break;
    case 'recipe':
      if (tier === 'space') card(env.unknownSpaceCards ?? SPACE_CARD_RECIPES, [3000, 8000]);
      else card(env.unknownCards ?? CARD_RECIPES, tier === 'silver' ? [1000, 3000] : [300, 600]);
      break;
    case 'keypiece': piece(PIECE_OF[tier] ?? 'silver'); break;
    case 'capsule': item('it_capsule', tier === 'silver' ? 2 : 1); break;
    case 'rare': {
      // 희귀 재료 5: 철광석 2 + 섬 특산 2 + 진주 1(20%, 아니면 철광석 하나 더)
      const sp = specialtyOf(env.island, 999);
      const pearl = rng() < 0.2;
      item('m_iron', pearl ? 2 : 3);
      if (sp.length) item(sp[Math.floor(rng() * sp.length)].id, 2); else item('m_iron', 2);
      if (pearl) item('m_pearl', 1);
      break;
    }
    // 가구(P1) — 지금은 코인 ×2
    case 'furniture': coins(range[0] * 2, range[1] * 2, '도파코인 (가구 대신 ×2)'); break;
    case 'stars': lines.push({ kind: 'stars', n: 50, name: '반짝별' }); break;
    case 'goldpack': item('m_gold', 3); item('m_pearl', 2); break;
    // 탈것 스킨(P1) — 지금은 반짝별 30
    case 'skin': lines.push({ kind: 'stars', n: 30, name: '반짝별 (탈것 스킨 대신)' }); break;
    case 'goldbait': item('bait_golden', 3); break;
    case 'jackpot': lines.push({ kind: 'coins', n: 30000, name: '도파코인' }, { kind: 'stars', n: 100, name: '반짝별' }); break;
    case 'moonrock': item('m_moonrock', int(rng(), 2, 4)); break;
    case 'stardust': item('m_stardust', int(rng(), 3, 8)); break;
    case 'helmet':
      if (env.hasHelmet) coins(3000, 8000);
      else lines.push({ kind: 'item', id: HELMET_SKIN, n: 1, name: GOODS[HELMET_SKIN]?.name ?? '우주 헬멧 스킨' });
      break;
  }
  return { tier, outcome, lines };
}

// ── 자리 고르기 ──

/** 상자 자리 하나 */
export interface ChestSpot {
  /** 저장 키 — 고정 'f:<섬>:<i>' · 높은 곳 'h:<섬>:<i>' · 매일 'd:<날>:<섬>:<i>' · 구역 'a:<id>:<날>:<i>' */
  key: string;
  x: number;
  z: number;
  tier: ChestTier;
  rot: number;
  island: string;
  /** 쪼꼬미섬(미믹 15%) */
  islet: boolean;
  /** 매일 다시 생기나 */
  daily: boolean;
}
/** 섬 모양(world IslandDef 의 부분) */
export interface IslandLike { id: string; x: number; z: number; r: number; theme: string }
/** (x, z) 가 상자 놓을 마른 땅이면 높이(아니면 null) */
export type SpotAccept = (x: number, z: number) => number | null;

/**
 * 섬 안에 n 개 자리 고르기(시드 고정). 원 안에서 고르고, 서로 minGap 이상 떨어지게.
 * avoid 에 있는 자리(고정 상자)와도 띄운다. 나무상자의 10% 는 은상자.
 */
export function planIslandSpots(
  isl: IslandLike, n: number, rng: () => number, accept: SpotAccept,
  o: { prefix: string; daily: boolean; avoid?: ReadonlyArray<{ x: number; z: number }>; tier?: ChestTier },
): ChestSpot[] {
  const islet = isl.theme === 'islet';
  const gap = islet ? 4.5 : 14;
  const out: ChestSpot[] = [];
  const near = (x: number, z: number) => {
    for (const p of out) if ((p.x - x) ** 2 + (p.z - z) ** 2 < gap * gap) return true;
    for (const p of o.avoid ?? []) if ((p.x - x) ** 2 + (p.z - z) ** 2 < gap * gap) return true;
    return false;
  };
  for (let tries = 0; out.length < n && tries < n * 40; tries++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * isl.r * 1.05;
    const up = rng(), rot = rng() * Math.PI * 2;
    const x = isl.x + Math.cos(a) * rr, z = isl.z + Math.sin(a) * rr;
    if (accept(x, z) === null || near(x, z)) continue;
    const tier = o.tier ?? (up < SILVER_UPGRADE ? 'silver' : 'wood');
    out.push({ key: `${o.prefix}:${out.length}`, x, z, tier, rot, island: isl.id, islet, daily: o.daily });
  }
  return out;
}

/** 높은 곳 은상자: 섬 안 마른 땅 샘플 중 가장 높은 곳들(서로 60m 이상) */
export function planHighSpots(isl: IslandLike, n: number, rng: () => number, accept: SpotAccept): ChestSpot[] {
  const cands: Array<{ x: number; z: number; y: number }> = [];
  for (let i = 0; i < 64; i++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * isl.r * 0.9;
    const x = isl.x + Math.cos(a) * rr, z = isl.z + Math.sin(a) * rr;
    const y = accept(x, z);
    if (y !== null) cands.push({ x, z, y });
  }
  cands.sort((p, q) => q.y - p.y);
  const out: ChestSpot[] = [];
  for (const c of cands) {
    if (out.length >= n) break;
    if (out.some((p) => (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < 60 * 60)) continue;
    out.push({ key: `h:${isl.id}:${out.length}`, x: c.x, z: c.z, tier: 'silver', rot: rng() * Math.PI * 2, island: isl.id, islet: false, daily: false });
  }
  return out;
}

/** 원 구역 안 n 개(islanddev 개발 구역) — 매일 다시 생긴다. avoid(섬 상자)와 2.5m 띄운다 */
export function planAreaSpots(
  a: { id: string; island: string; x: number; z: number; r: number; n: number; tier?: ChestTier },
  day: number, rng: () => number, accept: SpotAccept, islet: boolean, avoid: ReadonlyArray<{ x: number; z: number }> = [],
): ChestSpot[] {
  const out: ChestSpot[] = [];
  const crowded = (x: number, z: number) => avoid.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 2.5 * 2.5);
  const n = Math.max(0, Math.floor(a.n));
  const gap = Math.min(6, Math.max(1.5, a.r / Math.sqrt(Math.max(1, n)) * 0.6));
  for (let tries = 0; out.length < n && tries < n * 60; tries++) {
    const ang = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * a.r;
    const up = rng(), rot = rng() * Math.PI * 2;
    const x = a.x + Math.cos(ang) * rr, z = a.z + Math.sin(ang) * rr;
    if (accept(x, z) === null || crowded(x, z)) continue;
    if (out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < gap * gap)) continue;
    const tier = a.tier ?? (up < SILVER_UPGRADE ? 'silver' : 'wood');
    out.push({ key: `a:${a.id}:${day}:${out.length}`, x, z, tier, rot, island: a.island, islet, daily: true });
  }
  return out;
}

/** 키가 오늘 것인가(매일 상자 'd:<날>:…' · 구역 'a:<id>:<날>:…') — 어제 연 기록은 지운다 */
export function keyDay(key: string): number | null {
  const d = /^d:(-?\d+):/.exec(key);
  if (d) return Number(d[1]);
  const a = /^a:.+:(-?\d+):\d+$/.exec(key);
  if (a) return Number(a[1]);
  const rb = /^rb:(-?\d+)/.exec(key);
  if (rb) return Number(rb[1]);
  return null;
}
/** 지금 배치 규칙의 키인가(예전 청크 배치 '3,4:0' 같은 건 버린다) */
export const isPlanKey = (key: string) => /^(f|h|d|a|rb|x):/.test(key);
