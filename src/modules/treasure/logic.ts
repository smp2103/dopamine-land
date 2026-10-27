// treasure 순수 계산 — 화면·WebGL 없이 테스트한다(tests/treasure.test.ts).
// 하루 계획(화석 X·조개·깃털·병편지·쓰레기·크레이터 별가루·해저 거품), 풍선 시간표, 굴림(파기·병편지), 보물지도 목적지, flags 정리.
// 같은 날·같은 섬은 언제 물어도 같은 답(rngFor 키 고정) — 청크를 다시 만들어도 자리가 그대로다.
import * as Island from '../../core/island';
import { rngFor } from '../../core/rng';
import type { HarvestKind } from '../../core/events';

// ───────────── 섬 목록 ─────────────
/** 큰 섬 7곳(화석 X·풍선·해변 줍기) */
export const MAIN_ISLANDS = ['home', 'dino', 'ice', 'mushroom', 'coral', 'desert', 'launch'] as const;
export type MainIsland = typeof MAIN_ISLANDS[number];
/** 쪼꼬미섬(보물지도 목적지·조개 조금) */
export const ISLETS: string[] = Island.ISLANDS.filter((d) => d.theme === 'islet').map((d) => d.id);

/** 화석 X 하루 개수: 섬마다 4, 공룡섬 12(GDD 2.2 "화석 X 3배") */
export const xCount = (island: string) => (island === 'dino' ? 12 : 4);
/** 파면 화석 조각이 나올 확률 */
export const fossilChance = (island: string) => (island === 'dino' ? 0.7 : 0.35);

// ───────────── 자리 ─────────────
export type SpotKind =
  | 'x' | 'mapx' | 'shell' | 'feather' | 'stardust' | 'meteor' | 'bottle' | 'seabottle' | 'junk' | 'seaweed' | 'coral' | 'oyster' | 'gift';

export interface Spot {
  /** 하루 자리는 `${종류}:${날}:${섬}:${n}` — taken 목록의 키 */
  id: string;
  kind: SpotKind;
  island: string;
  x: number;
  z: number;
  /** 땅(해저) 높이 */
  y: number;
  rot: number;
  /** 줍는 아이템(파기·병편지·보물지도는 굴려서 정한다) */
  item?: string;
  n?: number;
  harvest?: HarvestKind;
  /** 보물지도 번호(mapx) */
  map?: number;
  /** 잠수해야 줍는다 */
  dive?: boolean;
  /** 물 위에 떠 있다(바다 병편지·떨어진 선물) */
  floats?: boolean;
}

/** 자리 고르기에 쓰는 땅 정보 */
export interface Ground { h: number; coast: number; island: string | null; kind: string; wet: boolean }
export type Sampler = (x: number, z: number) => Ground;

/** 기본 땅 정보: island.surfaceAt(마을 반도 포함) + 물 높이 */
export const islandSampler: Sampler = (x, z) => {
  const s = Island.surfaceAt(x, z);
  const w = Island.waterLevelAt(x, z);
  return { h: s.h, coast: s.coastDist, island: s.island, kind: s.kind, wet: w > s.h - 0.05 };
};

const VB = Island.ISLAND_BOUNDS;
/** 시작 마을(건물·광장) 안인가 — 화석 X·쓰레기는 마을 밖에만 */
export const inVillage = (x: number, z: number, pad = 8) => x > VB.minX - pad && x < VB.maxX + pad && z > VB.minZ - pad && z < VB.maxZ + pad;

const r2 = (v: number) => Math.round(v * 100) / 100;
const islandDef = (id: string) => Island.islandById(id);

/** 마른 땅(물·절벽·용암·강이 아닌 곳) */
export function dryLand(g: Ground, island: string, minCoast = 4): boolean {
  return g.island === island && g.coast > minCoast && !g.wet && g.kind !== 'cliff' && g.kind !== 'lava' && g.kind !== 'river' && g.kind !== 'sea' && g.h > 0.4;
}

/**
 * 섬 중심에서 ang 방향으로 해안 거리가 target 인 점(양수 = 육지 안쪽, 음수 = 바다 쪽).
 * 해안 부호 거리는 거의 1:1 로 줄어드니 몇 번 고쳐 가며 맞춘다. 못 찾으면 null.
 */
export function coastPoint(island: string, ang: number, target: number, S: Sampler = islandSampler): { x: number; z: number; g: Ground } | null {
  const d = islandDef(island);
  if (!d) return null;
  const cx = Math.cos(ang), cz = Math.sin(ang);
  let t = d.r - target;
  let g: Ground | null = null;
  for (let i = 0; i < 7; i++) {
    const x = d.x + cx * t, z = d.z + cz * t;
    g = S(x, z);
    const err = g.coast - target;
    if (Math.abs(err) < 1.2) return g.island === island || target < 0 ? { x, z, g } : null;
    t = Math.max(0, t + Math.max(-120, Math.min(120, err)));
  }
  return null;
}

/** 섬 안 무작위 점(반경 비율 0..maxR) */
function diskPoint(island: string, r: () => number, maxR = 1): { x: number; z: number } {
  const d = islandDef(island)!;
  const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * d.r * maxR;
  return { x: d.x + Math.cos(a) * rr, z: d.z + Math.sin(a) * rr };
}

const farFrom = (list: Array<{ x: number; z: number }>, x: number, z: number, min: number) => list.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 >= min * min);

// ───────────── 화석 X ─────────────
/** 오늘 이 섬의 화석 X(rng `treasure-x:${day}:${island}`) */
export function planDigs(day: number, island: string, S: Sampler = islandSampler): Spot[] {
  const d = islandDef(island);
  if (!d) return [];
  const r = rngFor(`treasure-x:${day}:${island}`);
  const want = xCount(island);
  const out: Spot[] = [];
  const minGap = Math.min(60, d.r * 0.12);
  for (let tries = 0; out.length < want && tries < want * 120; tries++) {
    const p = diskPoint(island, r, 0.92);
    const gap = tries > want * 60 ? minGap * 0.3 : minGap;
    if (inVillage(p.x, p.z) || !farFrom(out, p.x, p.z, gap)) continue;
    const g = S(p.x, p.z);
    if (!dryLand(g, island, 8)) continue;
    out.push({ id: `x:${day}:${island}:${out.length}`, kind: 'x', island, x: r2(p.x), z: r2(p.z), y: g.h, rot: r() * Math.PI * 2, harvest: 'dig' });
  }
  return out;
}

// ───────────── 해변(조개·병편지·쓰레기) ─────────────
/** 해변 모래 위 점(해안에서 lo~hi m 안쪽) */
function beachPoint(island: string, r: () => number, lo: number, hi: number, S: Sampler, avoidVillage: boolean): { x: number; z: number; g: Ground } | null {
  for (let k = 0; k < 14; k++) {
    const p = coastPoint(island, r() * Math.PI * 2, lo + r() * (hi - lo), S);
    if (!p) continue;
    if (avoidVillage && inVillage(p.x, p.z)) continue;
    // 바닷물 표면(0)보다 높은 모래만 — 낮으면 물결에 가려 안 보인다
    if (p.g.island !== island || p.g.wet || p.g.h < 0.3 || p.g.coast <= 0.8 || p.g.kind === 'cliff' || p.g.kind === 'river' || p.g.kind === 'lava') continue;
    return p;
  }
  return null;
}

/** 하루 해변 병편지 수(6~10, 온 세상 합) → 섬마다. 말랑섬엔 늘 2개 이상 */
export function bottleShare(day: number): Record<string, number> {
  const r = rngFor(`treasure-bottles:${day}`);
  const total = 6 + Math.floor(r() * 5);
  const out: Record<string, number> = Object.fromEntries(MAIN_ISLANDS.map((k) => [k, 0]));
  out.home = 2;
  for (let i = 2; i < total; i++) out[MAIN_ISLANDS[Math.floor(r() * MAIN_ISLANDS.length)]]++;
  return out;
}
export const bottleTotal = (day: number) => Object.values(bottleShare(day)).reduce((a, b) => a + b, 0);

/** 조개 수: 큰 섬 10, 쪼꼬미섬 2 */
export const shellCount = (island: string) => (ISLETS.includes(island) ? 2 : 10);
/** 쓰레기(타이어·깡통·장화) 수: 큰 섬 3, 쪼꼬미섬 0 */
export const junkCount = (island: string) => (ISLETS.includes(island) ? 0 : 3);
const JUNK: Array<[string, number]> = [['t_tire', 0.5], ['t_can', 0.25], ['t_boot', 0.25]];

export function planBeach(day: number, island: string, S: Sampler = islandSampler): Spot[] {
  if (!islandDef(island)) return [];
  const r = rngFor(`treasure-beach:${day}:${island}`);
  const out: Spot[] = [];
  const put = (kind: SpotKind, i: number, p: { x: number; z: number; g: Ground }, extra: Partial<Spot>) =>
    out.push({ id: `${kind}:${day}:${island}:${i}`, kind, island, x: r2(p.x), z: r2(p.z), y: p.g.h, rot: r() * Math.PI * 2, ...extra });
  const shells = shellCount(island);
  for (let i = 0, k = 0; i < shells && k < shells * 4; k++) {
    const p = beachPoint(island, r, 2.5, 14, S, false);
    if (!p || !farFrom(out, p.x, p.z, 6)) continue;
    put('shell', i++, p, { item: 'm_shell', n: 1, harvest: 'shell' });
  }
  const bottles = ISLETS.includes(island) ? 0 : bottleShare(day)[island] ?? 0;
  for (let i = 0, k = 0; i < bottles && k < bottles * 6; k++) {
    const p = beachPoint(island, r, 3, 8, S, false);
    if (!p || !farFrom(out, p.x, p.z, 8)) continue;
    put('bottle', i++, p, { item: 't_bottle', n: 1, harvest: 'bottle' });
  }
  const junk = junkCount(island);
  for (let i = 0, k = 0; i < junk && k < junk * 6; k++) {
    const p = beachPoint(island, r, 2, 16, S, true);
    if (!p || !farFrom(out, p.x, p.z, 8)) continue;
    const u = r();
    let acc = 0, item = JUNK[0][0];
    for (const [id, w] of JUNK) { acc += w; if (u < acc) { item = id; break; } }
    put('junk', i++, p, { item, n: 1, harvest: 'junk' });
  }
  return out;
}

// ───────────── 깃털(공룡섬 둥지 절벽 · 별똥별섬 절벽) ─────────────
/** 절벽 위 가장자리인가(옆 3.5 m 가 2.5 m 이상 낮다) */
function cliffTop(x: number, z: number, g: Ground, S: Sampler): boolean {
  let drop = 0;
  for (const [ox, oz] of [[3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5]]) drop = Math.max(drop, g.h - S(x + ox, z + oz).h);
  return drop > 2.5;
}
export const FEATHER_ISLANDS = ['dino', 'launch'] as const;
export const featherCount = (island: string) => (island === 'dino' ? 6 : island === 'launch' ? 5 : 0);

export function planFeathers(day: number, island: string, S: Sampler = islandSampler): Spot[] {
  const n = featherCount(island);
  const d = islandDef(island);
  if (!n || !d) return [];
  const r = rngFor(`treasure-feather:${day}:${island}`);
  const out: Spot[] = [];
  for (let tries = 0; out.length < n && tries < 500; tries++) {
    let x: number, z: number;
    if (island === 'dino') {
      // 둥지 절벽: 북서 해안(-z 가 북, -x 가 서) — 해안에서 6~70 m 안쪽
      const a = -0.75 * Math.PI + (r() - 0.5) * 0.9;
      const p = coastPoint(island, a, 6 + r() * 64, S);
      if (!p) continue;
      ({ x, z } = p);
    } else ({ x, z } = diskPoint(island, r, 0.85));
    const g = S(x, z);
    if (!dryLand(g, island, 3) || !farFrom(out, x, z, 10)) continue;
    // 절벽 끝을 먼저 찾고, 오래 못 찾으면 그 근처 마른 땅도 받는다
    if (tries < 380 && !cliffTop(x, z, g, S)) continue;
    out.push({ id: `feather:${day}:${island}:${out.length}`, kind: 'feather', island, x: r2(x), z: r2(z), y: g.h, rot: r() * Math.PI * 2, item: 'm_feather', n: 1, harvest: 'feather' });
  }
  return out;
}

// ───────────── 크레이터(별가루·운석) ─────────────
/** 크레이터 하루치: 별가루 3 · 운석 반짝이 2, 일요일(weekday 6)엔 ×2 */
export function craterCounts(weekday: number): { stardust: number; meteor: number } {
  const k = weekday === 6 ? 2 : 1;
  return { stardust: 3 * k, meteor: 2 * k };
}

export function planCrater(day: number, weekday: number, S: Sampler = islandSampler): Spot[] {
  const C = Island.PLACES.crater;
  const r = rngFor(`treasure-crater:${day}`);
  const want = craterCounts(weekday);
  const out: Spot[] = [];
  const kinds: Array<['stardust' | 'meteor', number]> = [['stardust', want.stardust], ['meteor', want.meteor]];
  for (const [kind, n] of kinds) {
    for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
      const a = r() * Math.PI * 2, rr = C.r * (1.12 + r() * (tries > 200 ? 1.2 : 0.6));
      const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
      const g = S(x, z);
      if (g.wet || g.coast < 1 || g.kind === 'sea' || g.kind === 'river' || !farFrom(out, x, z, 4)) continue;
      out.push({
        id: `${kind}:${day}:launch:${i}`, kind, island: 'launch', x: r2(x), z: r2(z), y: g.h, rot: r() * Math.PI * 2,
        item: kind === 'stardust' ? 'm_stardust' : 'm_meteor', n: 1, harvest: kind,
      });
      i++;
    }
  }
  return out;
}

// ───────────── 해저 거품(잠수 줍기) ─────────────
/** 산호초에서: 산호 45 · 해초 30 · 진주굴 25. 다른 얕은 바다: 해초 70 · 진주굴 30 */
function seabedKind(u: number, reef: boolean): 'coral' | 'seaweed' | 'oyster' {
  if (reef) return u < 0.45 ? 'coral' : u < 0.75 ? 'seaweed' : 'oyster';
  return u < 0.7 ? 'seaweed' : 'oyster';
}
const SEABED_ITEM = { coral: 'm_coral', seaweed: 'm_seaweed', oyster: 'm_pearl' } as const;
/** 진주굴에서 진주가 나올 확률(아니면 조개껍데기) */
export const PEARL_CHANCE = 0.2;
/** 잠수해서 닿는 해저 깊이(너무 깊으면 거품만 보인다) */
const SEABED_MIN = -16, SEABED_MAX = -1.6;

export function planSeabed(day: number, S: Sampler = islandSampler): Spot[] {
  const r = rngFor(`treasure-seabed:${day}`);
  const out: Spot[] = [];
  const add = (x: number, z: number, g: Ground, island: string, reef: boolean) => {
    const kind = seabedKind(r(), reef);
    const i = out.length;
    out.push({
      id: `${kind}:${day}:${island}:${i}`, kind, island, x: r2(x), z: r2(z), y: g.h, rot: r() * Math.PI * 2,
      item: SEABED_ITEM[kind], n: 1, harvest: kind === 'oyster' ? 'pearl' : kind, dive: true,
    });
  };
  const okSea = (g: Ground) => g.coast < 0 && g.h > SEABED_MIN && g.h < SEABED_MAX;
  // 말랑섬 남쪽 만 산호초(원점 남쪽 40~200 m)
  for (let n = 0, tries = 0; n < 7 && tries < 200; tries++) {
    const x = -160 + r() * 320, z = 55 + r() * 135;
    const g = S(x, z);
    if (!okSea(g) || !farFrom(out, x, z, 18)) continue;
    add(x, z, g, 'home', true); n++;
  }
  // 산호빛섬 산호초 고리(해안 바깥 80~250 m) — 얕은 곳 위주
  for (let n = 0, tries = 0; n < 12 && tries < 300; tries++) {
    const p = coastPoint('coral', r() * Math.PI * 2, -(80 + r() * 170), S);
    if (!p || !okSea(p.g) || !farFrom(out, p.x, p.z, 25)) continue;
    add(p.x, p.z, p.g, 'coral', true); n++;
  }
  // 다른 섬 얕은 바다에 해초·진주굴 조금
  for (const isl of MAIN_ISLANDS) {
    if (isl === 'coral') continue;
    for (let n = 0, tries = 0; n < 2 && tries < 60; tries++) {
      const p = coastPoint(isl, r() * Math.PI * 2, -(12 + r() * 50), S);
      if (!p || !okSea(p.g) || !farFrom(out, p.x, p.z, 25)) continue;
      add(p.x, p.z, p.g, isl, false); n++;
    }
  }
  return out;
}

// ───────────── 바다에 떠다니는 병편지 ─────────────
/** 하루 3개: 별똥별섬 앞바다 1(우주에서 온 편지 복선) + 다른 섬 앞바다 2 */
export function planSeaBottles(day: number, S: Sampler = islandSampler): Spot[] {
  const r = rngFor(`treasure-seabottle:${day}`);
  const isl = ['launch', MAIN_ISLANDS[Math.floor(r() * 6)], MAIN_ISLANDS[Math.floor(r() * 6)]];
  const out: Spot[] = [];
  isl.forEach((island, i) => {
    for (let k = 0; k < 12; k++) {
      const p = coastPoint(island, r() * Math.PI * 2, -(25 + r() * 70), S);
      if (!p || p.g.coast >= 0 || !farFrom(out, p.x, p.z, 30)) continue;
      out.push({ id: `seabottle:${day}:${island}:${i}`, kind: 'seabottle', island, x: r2(p.x), z: r2(p.z), y: 0, rot: r() * Math.PI * 2, item: 't_bottle', n: 1, harvest: 'bottle', floats: true });
      return;
    }
  });
  return out;
}

// ───────────── 보물지도 ─────────────
/** 보물지도 목적지: 쪼꼬미섬 하나의 마른 땅 */
export function pickMapTarget(r: () => number, S: Sampler = islandSampler): { islet: string; x: number; z: number; y: number } {
  const start = Math.floor(r() * ISLETS.length);
  for (let j = 0; j < ISLETS.length; j++) {
    const islet = ISLETS[(start + j) % ISLETS.length];
    const d = islandDef(islet)!;
    for (let k = 0; k < 80; k++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * d.r * 0.7;
      const x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
      const g = S(x, z);
      if (g.island !== islet || g.coast < 4 || g.wet || g.kind === 'sea' || g.kind === 'cliff') continue;
      return { islet, x: r2(x), z: r2(z), y: g.h };
    }
    // 고리를 훑어 가장 안쪽 땅
    let best: { x: number; z: number; g: Ground } | null = null;
    for (let a = 0; a < 32; a++) for (const f of [0, 0.2, 0.4]) {
      const x = d.x + Math.cos(a / 32 * Math.PI * 2) * d.r * f, z = d.z + Math.sin(a / 32 * Math.PI * 2) * d.r * f;
      const g = S(x, z);
      if (g.island === islet && !g.wet && (!best || g.coast > best.g.coast)) best = { x, z, g };
    }
    if (best && best.g.coast > 1) return { islet, x: r2(best.x), z: r2(best.z), y: best.g.h };
  }
  const d = islandDef(ISLETS[start])!;
  return { islet: d.id, x: d.x, z: d.z, y: S(d.x, d.z).h };
}

// ───────────── 굴림 ─────────────
export type BottleKind = 'map' | 'recipe' | 'letter' | 'space';
/** 병편지: 보물지도 60 · 레시피 25 · 주민 사연 15. 별똥별섬 근처면 먼저 5% '우주에서 온 편지' */
export function rollBottle(r: () => number, nearLaunch: boolean): BottleKind {
  if (nearLaunch && r() < 0.05) return 'space';
  const u = r();
  return u < 0.6 ? 'map' : u < 0.85 ? 'recipe' : 'letter';
}
/** 별똥별섬(앞바다 포함) 근처인가 */
export function nearLaunch(x: number, z: number): boolean {
  const d = islandDef('launch')!;
  return Math.hypot(x - d.x, z - d.z) < d.r + 400;
}

export type DigOutcome =
  | { kind: 'fossil'; id: string; n: 1 }
  | { kind: 'item'; id: string; n: number }
  | { kind: 'keypiece'; id: 'key:silver'; n: 1 };

/** 화석이 아닐 때: 호박 · 돌 · 쓰레기 · 지렁이 미끼 · 은열쇠 조각 */
export function digTable(island: string): Array<[DigOutcome, number]> {
  return [
    [{ kind: 'item', id: 'm_amber', n: 1 }, island === 'dino' ? 10 : 4],
    [{ kind: 'item', id: 'm_stone', n: 2 }, island === 'dino' ? 32 : 38],
    [{ kind: 'item', id: 't_tire', n: 1 }, 9],
    [{ kind: 'item', id: 't_can', n: 1 }, 8],
    [{ kind: 'item', id: 't_boot', n: 1 }, 7],
    [{ kind: 'item', id: 'bait_worm', n: 2 }, 22],
    [{ kind: 'keypiece', id: 'key:silver', n: 1 }, 6],
  ];
}

/**
 * 화석 X 파기 굴림. fossil 이 있으면(dinos 의 ext.fossils.roll) 공룡섬 70% · 다른 섬 35% 로 화석 조각,
 * 없으면 그 몫은 호박(25%) 또는 돌.
 */
export function rollDig(r: () => number, island: string, fossil?: ((r: () => number) => string | null) | null): DigOutcome {
  if (r() < fossilChance(island)) {
    const id = fossil ? fossil(r) : null;
    if (id) return { kind: 'fossil', id, n: 1 };
    return r() < 0.25 ? { kind: 'item', id: 'm_amber', n: 1 } : { kind: 'item', id: 'm_stone', n: 2 };
  }
  const T = digTable(island);
  const tot = T.reduce((s, [, w]) => s + w, 0);
  let u = r() * tot;
  for (const [o, w] of T) { u -= w; if (u <= 0) return o; }
  return T[T.length - 1][0];
}

// ───────────── 풍선 선물 ─────────────
export interface BalloonPlan {
  key: string;
  island: string;
  day: number;
  hour: number;
  /** 시작 자리(섬 땅 위) */
  x0: number;
  z0: number;
  /** 떠가는 방향(단위) · 속도 m/s */
  dx: number;
  dz: number;
  speed: number;
  /** 땅 위 높이 8~20 m */
  alt: number;
  /** 흔들림 위상 */
  phase: number;
}
export const BALLOON_ALT = { min: 8, max: 20 } as const;

/** 섬마다 게임 1시간에 1개(rng `treasure-balloon:${day}:${hour}:${island}`) */
export function balloonPlan(day: number, hour: number, island: string, S: Sampler = islandSampler): BalloonPlan | null {
  const d = islandDef(island);
  if (!d) return null;
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const r = rngFor(`treasure-balloon:${day}:${h}:${island}`);
  let x0 = d.x, z0 = d.z;
  for (let k = 0; k < 40; k++) {
    const p = diskPoint(island, r, 0.75);
    const g = S(p.x, p.z);
    if (g.island === island && g.coast > 10 && !g.wet && !inVillage(p.x, p.z, 4)) { x0 = p.x; z0 = p.z; break; }
  }
  const a = r() * Math.PI * 2;
  return {
    key: `balloon:${day}:${h}:${island}`, island, day, hour: h, x0: r2(x0), z0: r2(z0), dx: Math.cos(a), dz: Math.sin(a),
    speed: 0.25 + r() * 0.3, alt: BALLOON_ALT.min + r() * (BALLOON_ALT.max - BALLOON_ALT.min), phase: r() * Math.PI * 2,
  };
}
/** sec = 그 시간 안에서 지난 게임 초(0..75) */
export function balloonXZ(b: BalloonPlan, sec: number): { x: number; z: number } {
  return { x: b.x0 + b.dx * b.speed * sec, z: b.z0 + b.dz * b.speed * sec };
}

// ───────────── 새총 조준 ─────────────
export const SLING_RANGE = 25;
/** 화면 앞(카메라 방향)에서 이 각도 안이면 조준된다(라디안) */
export const SLING_CONE = 0.62;
/**
 * 새총 원뿔: 눈 → 풍선 거리 ≤ 25 m, 수평 각도가 카메라 앞 방향과 SLING_CONE 안(바로 머리 위 4 m 안쪽은 늘 OK).
 * fwd = 카메라 앞(수평 단위 벡터)
 */
export function inSlingCone(eye: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, fwd: { x: number; z: number }): boolean {
  const dx = target.x - eye.x, dy = target.y - eye.y, dz = target.z - eye.z;
  if (dx * dx + dy * dy + dz * dz > SLING_RANGE * SLING_RANGE) return false;
  const hd = Math.hypot(dx, dz);
  if (hd < 4) return true;
  const cos = (dx * fwd.x + dz * fwd.z) / (hd * (Math.hypot(fwd.x, fwd.z) || 1));
  return cos >= Math.cos(SLING_CONE);
}

// ───────────── 저장(flags.treasure) ─────────────
export interface MapEntry { islet: string; x: number; z: number; y: number; got: number }
export interface GiftEntry { x: number; y: number; z: number; island: string }
export interface TreasureFlags {
  v: 1;
  /** taken 이 가리키는 날 */
  day: number;
  /** 오늘 주운·판 자리 id */
  taken: string[];
  /** 지금까지 새총으로 터뜨린 풍선 수 */
  popped: number;
  /** 오늘 터뜨린 풍선 키(같은 풍선이 다시 뜨지 않게) */
  poppedKeys: string[];
  /** 떨어졌지만 아직 안 연 선물 */
  gifts: Record<string, GiftEntry>;
  /** 가진 보물지도(번호 → 목적지) */
  maps: Record<string, MapEntry>;
  mapSeq: number;
  mapsDone: number;
  /** 연 병편지 수(굴림 키) */
  bottles: number;
  letters: number;
  recipes: number;
  spaceLetters: number;
  dug: number;
  picked: number;
  /** 크레이터 오늘 주운 수 */
  crater: { day: number; got: number };
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** 저장된 값을 모양에 맞춘다(모르는 값·깨진 값은 기본값) */
export function ensureFlags(raw: unknown): TreasureFlags {
  const o = isObj(raw) ? raw : {};
  const maps: Record<string, MapEntry> = {};
  if (isObj(o.maps)) for (const [k, m] of Object.entries(o.maps)) {
    if (isObj(m) && typeof m.islet === 'string') maps[k] = { islet: m.islet, x: num(m.x), z: num(m.z), y: num(m.y), got: num(m.got) };
  }
  const gifts: Record<string, GiftEntry> = {};
  if (isObj(o.gifts)) for (const [k, g] of Object.entries(o.gifts)) {
    if (isObj(g)) gifts[k] = { x: num(g.x), y: num(g.y), z: num(g.z), island: typeof g.island === 'string' ? g.island : '' };
  }
  const cr = isObj(o.crater) ? o.crater : {};
  return {
    v: 1, day: num(o.day, -1), taken: strs(o.taken), popped: Math.max(0, num(o.popped)), poppedKeys: strs(o.poppedKeys), gifts, maps,
    mapSeq: num(o.mapSeq), mapsDone: num(o.mapsDone), bottles: num(o.bottles), letters: num(o.letters), recipes: num(o.recipes),
    spaceLetters: num(o.spaceLetters), dug: num(o.dug), picked: num(o.picked), crater: { day: num(cr.day, -1), got: num(cr.got) },
  };
}

/** 날이 바뀌면 그날 목록을 비운다(지도·선물·누적 수는 남긴다). 바뀌었으면 true */
export function rollDay(f: TreasureFlags, day: number): boolean {
  if (f.day === day) return false;
  f.day = day;
  f.taken = [];
  f.poppedKeys = [];
  if (f.crater.day !== day) f.crater = { day, got: 0 };
  return true;
}

// ───────────── 공간 색인 ─────────────
/** 칸(m) — 청크 크기와 같게 둔다 */
export const CELL = 64;
export const cellOf = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

/** 섬 하루 계획 전부(해저·바다 병편지·크레이터는 따로) */
export function planIsland(day: number, island: string, S: Sampler = islandSampler): Spot[] {
  const out: Spot[] = [];
  if ((MAIN_ISLANDS as readonly string[]).includes(island)) out.push(...planDigs(day, island, S));
  out.push(...planBeach(day, island, S));
  out.push(...planFeathers(day, island, S));
  return out;
}
