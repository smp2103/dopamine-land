// 채집 규칙(순수 함수) — 흔들기·베기·돌 두드리기 굴림, 하루 횟수(flags.flora), 콤보, 돌 자리. DOM·WebGL 없음 → 테스트가 바로 부른다.
import type * as IslandNS from '../../core/island';
import { mulberry32, hashString } from '../../core/rng';
import { SHAKE, CHOP, ROCK, ROCK_SPECIAL } from './data';

type Island = typeof IslandNS;
export type Rnd = () => number;

// ───────────── flags.flora ─────────────
/** 하루 단위 기록(키 → 그날 날짜·횟수). 지난 날 것은 prune 이 지운다 */
export interface FloraFlags {
  /** 나무 흔든 날 */
  shake: Record<string, number>;
  /** 나무 벤 [날, 횟수] */
  chop: Record<string, [number, number]>;
  /** 돌 두드린 [날, 횟수] */
  rock: Record<string, [number, number]>;
  /** 꽃·버섯·고사리 주운 날 */
  pick: Record<string, number>;
  /** 마지막으로 정리한 날 */
  day: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/** game.state.flags 에서 flora 칸을 꺼낸다(없거나 망가졌으면 고쳐 깐다) */
export function floraFlags(flags: Record<string, unknown>): FloraFlags {
  let f = flags.flora;
  if (!isObj(f)) { f = {}; flags.flora = f; }
  const o = f as Record<string, unknown>;
  for (const k of ['shake', 'chop', 'rock', 'pick'] as const) if (!isObj(o[k])) o[k] = {};
  // 값 모양이 틀린 줄은 버린다
  for (const k of ['shake', 'pick'] as const) {
    const m = o[k] as Record<string, unknown>;
    for (const key of Object.keys(m)) if (typeof m[key] !== 'number') delete m[key];
  }
  for (const k of ['chop', 'rock'] as const) {
    const m = o[k] as Record<string, unknown>;
    for (const key of Object.keys(m)) if (!isPair(m[key])) delete m[key];
  }
  if (typeof o.day !== 'number') o.day = -1;
  return o as unknown as FloraFlags;
}

/** 오늘이 아닌 기록을 지운다(저장이 끝없이 커지지 않게). 지운 줄 수를 돌려준다 */
export function pruneFlags(f: FloraFlags, day: number): number {
  let n = 0;
  for (const m of [f.shake, f.pick]) for (const k of Object.keys(m)) if (m[k] !== day) { delete m[k]; n++; }
  for (const m of [f.chop, f.rock]) for (const k of Object.keys(m)) if (m[k][0] !== day) { delete m[k]; n++; }
  f.day = day;
  return n;
}

export const shakenToday = (f: FloraFlags, key: string, day: number) => f.shake[key] === day;
export const markShake = (f: FloraFlags, key: string, day: number) => { f.shake[key] = day; };
export const pickedToday = (f: FloraFlags, key: string, day: number) => f.pick[key] === day;
export const markPick = (f: FloraFlags, key: string, day: number) => { f.pick[key] = day; };
const usedToday = (m: Record<string, [number, number]>, key: string, day: number) => (m[key] && m[key][0] === day ? m[key][1] : 0);
/** 오늘 이 나무를 더 벨 수 있는 횟수 */
export const chopsLeft = (f: FloraFlags, key: string, day: number) => Math.max(0, CHOP.perDay - usedToday(f.chop, key, day));
/** 한 번 베었다고 적고 오늘 몇 번째인지 돌려준다(1부터). 다 썼으면 0 */
export function markChop(f: FloraFlags, key: string, day: number): number {
  const n = usedToday(f.chop, key, day);
  if (n >= CHOP.perDay) return 0;
  f.chop[key] = [day, n + 1];
  return n + 1;
}
/** 오늘 이 돌을 더 두드릴 수 있는 횟수 */
export const hitsLeft = (f: FloraFlags, key: string, day: number) => Math.max(0, ROCK.hitsPerDay - usedToday(f.rock, key, day));
/** 한 번 두드렸다고 적고 오늘 몇 번째인지(1..8). 다 썼으면 0 */
export function markHit(f: FloraFlags, key: string, day: number): number {
  const n = usedToday(f.rock, key, day);
  if (n >= ROCK.hitsPerDay) return 0;
  f.rock[key] = [day, n + 1];
  return n + 1;
}
/** 오늘 남은 두드리기를 다 써 버린다(공룡 돌진으로 와르르). 이미 부서졌으면 false */
export function breakToday(f: FloraFlags, key: string, day: number): boolean {
  if (usedToday(f.rock, key, day) >= ROCK.hitsPerDay) return false;
  f.rock[key] = [day, ROCK.hitsPerDay];
  return true;
}

// ───────────── 흔들기 ─────────────
export type ShakeBonus = 'coins' | 'hive' | 'furniture' | null;
export interface ShakeResult {
  /** 떨어지는 열매 수(열매 나무만) */
  fruits: number;
  bonus: ShakeBonus;
  /** 코인 주머니·가구(코인) 금액 */
  coins: number;
}
/** 나무 하나가 하루에 다는 열매 수(1~3, 나무 키로 고정 — 보이는 만큼 떨어진다) */
export const fruitCountOf = (key: string) => SHAKE.fruitMin + (hashString('flora-fruit:' + key) % (SHAKE.fruitMax - SHAKE.fruitMin + 1));

/** 흔들기 한 번: 열매(있으면 전부) + 5% 코인 주머니 / 3% 벌집 / 2% 가구 */
export function rollShake(r: Rnd, fruitN: number): ShakeResult {
  const x = r();
  let bonus: ShakeBonus = null, coins = 0;
  if (x < SHAKE.coins) {
    bonus = 'coins';
    // 100, 200 … 1,000(작은 주머니가 더 흔하게)
    const steps = (SHAKE.coinMax - SHAKE.coinMin) / 100;
    coins = SHAKE.coinMin + Math.floor(Math.pow(r(), 1.6) * (steps + 1)) * 100;
    coins = Math.min(SHAKE.coinMax, coins);
  } else if (x < SHAKE.coins + SHAKE.hive) bonus = 'hive';
  else if (x < SHAKE.coins + SHAKE.hive + SHAKE.furniture) { bonus = 'furniture'; coins = SHAKE.furnitureCoins; }
  return { fruits: Math.max(0, Math.floor(fruitN)), bonus, coins };
}

// ───────────── 베기 ─────────────
export interface Drop { id: string; n: number }
/** 한 번 베기: 나무 1(20% 단단한 나무) + 덩굴 나무면 오늘 첫 베기에 덩굴 1 */
export function rollChop(r: Rnd, o: { vine?: boolean; nth: number }): Drop[] {
  if (o.nth < 1) return [];
  const out: Drop[] = [{ id: r() < CHOP.hardwood ? 'm_hardwood' : 'm_wood', n: 1 }];
  if (o.vine && o.nth === 1) out.push({ id: 'm_vine', n: 1 });
  return out;
}
/** 이 나무를 베면 덩굴도 나오나(야자·거대 버섯 × 산호빛섬·반딧불버섯섬) */
export const vineTree = (kind: string, island: string) => /^(palm|coco|gmush|banana|mangrove)/.test(kind) && CHOP.vineIslands.includes(island);

// ───────────── 돌 ─────────────
/** 콤보: 지난 두드림에서 window 초 안이면 +1, 아니면 0 부터 */
export function comboNext(lastT: number, t: number, combo: number, window: number = ROCK.comboWindow): number {
  return t - lastT <= window + 1e-6 && t >= lastT ? combo + 1 : 0;
}
/** 섬 특산 돌 재료(없으면 점토) */
export const rockSpecial = (island: string) => ROCK_SPECIAL[island] ?? 'm_clay';
/** 콤보에 따른 돌 결과 가중치(합이 100 이 아닐 수 있다) */
export function rockWeights(island: string, combo: number): Array<[string, number]> {
  const c = Math.max(0, Math.min(ROCK.comboMax, Math.floor(combo)));
  const W = ROCK.weights;
  const sp = rockSpecial(island);
  const list: Array<[string, number]> = [
    ['m_stone', W.m_stone], ['m_clay', W.m_clay],
    ['m_iron', W.m_iron * (1 + ROCK.comboIron * c)], ['m_gold', W.m_gold * (1 + ROCK.comboGold * c)],
    [sp, W.special],
  ];
  // 특산이 점토인 섬(말랑섬)은 한 줄로 합친다
  const merged = new Map<string, number>();
  for (const [id, w] of list) merged.set(id, (merged.get(id) ?? 0) + w);
  return [...merged];
}
/** 돌 한 번 두드리기 결과 아이템 */
export function rollRock(r: Rnd, island: string, combo: number): string {
  const ws = rockWeights(island, combo);
  const sum = ws.reduce((a, [, w]) => a + w, 0);
  let x = r() * sum;
  for (const [id, w] of ws) { x -= w; if (x < 0) return id; }
  return ws[0][0];
}

// ───────────── 자리 ─────────────
export interface Circle { x: number; z: number; r: number }
/** 식물·돌이 덮지 않는 자리(부두·발사대·스폰·약속한 건물 터·빙산·티노 언덕) */
export function floraKeepOut(I: Island, extra: Circle[] = []): Circle[] {
  const P = I.PLACES;
  return [
    ...Object.values(P.docks).map((d) => ({ x: d.x, z: d.z, r: 22 })),
    { x: P.launchPad.x, z: P.launchPad.z, r: 55 },
    // 섬 스폰 지점(배·순간이동 도착) 둘레는 비워 둔다
    ...I.ISLANDS.map((d) => { const p = I.islandSpawnPoints(d.id, 1, 0.08)[0]; return p ? { x: p.x, z: p.z, r: 14 } : { x: 1e9, z: 1e9, r: 0 }; }),
    { x: P.house.x, z: P.house.z, r: 12 },
    { x: P.mailbox.x, z: P.mailbox.z, r: 4 },
    { x: P.shipyard.x, z: P.shipyard.z, r: 14 },
    { x: P.pengLab.x, z: P.pengLab.z, r: 14 },
    ...Object.values(P.facilities).map((f) => ({ x: f.x, z: f.z, r: 12 })),
    ...Object.values(P.lighthouses).map((f) => ({ x: f.x, z: f.z, r: 9 })),
    ...P.caves.map((c) => ({ x: c.x, z: c.z, r: 6 })),
    { x: P.iceberg.x, z: P.iceberg.z, r: P.iceberg.r + 6 },
    { x: P.tinoHill.x, z: P.tinoHill.z, r: 14 },
    ...extra,
  ];
}
export const inCircles = (cs: readonly Circle[], x: number, z: number) => cs.some((k) => (x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r);
/** 마을(마을 전용 지형) 사각형 + 여유 */
export const inVillage = (I: Island, x: number, z: number, m = 4) => {
  const B = I.ISLAND_BOUNDS;
  return x > B.minX - m && x < B.maxX + m && z > B.minZ - m && z < B.maxZ + m;
};

export interface RockSpot { key: string; island: string; x: number; z: number; y: number; s: number; rot: number }

/** 돌을 놓아도 되는 마른 평지인가 */
function rockOK(I: Island, x: number, z: number, keepOut: readonly Circle[]) {
  if (inVillage(I, x, z, 8) || inCircles(keepOut, x, z)) return false;
  const s = I.worldSample(x, z);
  if (!s.island || s.coast < 10 || s.h < 0.8) return false;
  if ((s.water ?? -Infinity) > s.h - 0.3) return false;
  if (s.kind === 'cliff' || s.kind === 'lava' || s.kind === 'river' || s.kind === 'sea') return false;
  const e = 1.2;
  let lo = s.h, hi = s.h;
  for (const [dx, dz] of [[e, 0], [-e, 0], [0, e], [0, -e]]) {
    const w = I.worldSample(x + dx, z + dz);
    if ((w.water ?? -Infinity) > w.h - 0.2) return false;
    lo = Math.min(lo, w.h); hi = Math.max(hi, w.h);
  }
  return hi - lo < 0.9;
}

/**
 * 섬 하나의 두드릴 돌 5개(섬 시드로 고정). 서로 60 m 이상 떨어지고, keepOut·마을·물·절벽 밖.
 * 말랑섬은 첫 돌을 마을 북쪽 들판 가까이에 둔다(하루 루틴 3번 — 접속하자마자 닿게).
 */
export function rockSpots(I: Island, islandId: string, keepOut: readonly Circle[]): RockSpot[] {
  const d = I.islandById(islandId);
  if (!d) return [];
  const rnd = mulberry32((d.seed * 2654435761 + 0x51ed) >>> 0);
  const out: RockSpot[] = [];
  const push = (x: number, z: number) => {
    out.push({ key: `rock:${islandId}:${out.length}`, island: islandId, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, y: I.heightAt(x, z), s: 0.9 + rnd() * 0.35, rot: rnd() * Math.PI * 2 });
  };
  const far = (x: number, z: number, m: number) => out.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 >= m * m);
  if (islandId === 'home') {
    // 마을 북서쪽 들판 — 비행기(-10,-70)·열기구(34,-30) 세우는 자리는 피한다
    const B = I.ISLAND_BOUNDS;
    const cx = B.minX + 8, cz = B.minZ - 18;
    const parked: Circle[] = [{ x: -10, z: -70, r: 12 }, { x: 34, z: -30, r: 9 }];
    for (let k = 0; k < 400; k++) {
      const a = k * 2.399, rr = 2 + Math.sqrt(k) * 3.2;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (!inCircles(parked, x, z) && rockOK(I, x, z, keepOut)) { push(x, z); break; }
    }
  }
  for (const minD of [60, 35, 15]) {
    for (let tries = 0; tries < 900 && out.length < ROCK.perIsland; tries++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * d.r * 0.95;
      const x: number = d.x + Math.cos(a) * rr, z: number = d.z + Math.sin(a) * rr;
      if (I.worldSample(x, z).island !== d) continue;
      if (!far(x, z, minD) || !rockOK(I, x, z, keepOut)) continue;
      push(x, z);
    }
    if (out.length >= ROCK.perIsland) break;
  }
  return out;
}
/** 큰 섬 7개 전부의 돌(쪼꼬미섬은 없음) */
export function allRockSpots(I: Island, keepOut: readonly Circle[]): RockSpot[] {
  return I.ISLANDS.filter((d) => d.theme !== 'islet' && !d.id.startsWith('islet')).flatMap((d) => rockSpots(I, d.id, keepOut));
}
