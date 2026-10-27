// garden 순수 규칙 — 심기·물주기·하루 지나 자라기·교배(황금장미 1%)·민들레 홀씨·네잎클로버·회전초 바람·과일 힘·큰 바위 자리.
// DOM·WebGL 없음(three 도 안 씀). 난수는 전부 rngFor(키) — 같은 날·같은 꽃이면 언제 다시 계산해도 같다.
// 지형은 probe(아래 TerrainProbe)로 묻는다 → 테스트는 진짜 섬(Island)으로, 게임도 같은 함수로.
import { rngFor } from '../../core/rng';
import * as Island from '../../core/island';
import {
  APPLE_DAYS, BASE_COLORS, BLOOM, BOULDER, BOULDER_ISLANDS, BREED, BREED_CHANCE, CATCHUP_MAX, CELL, CLOVER, DANDELION, GOLDEN_CHANCE,
  NEIGHBOR_R, PETALS, PLOT_MAX, POWER_MAX, ROSE_FROM, SEED_KIND, TREE_CLEAR, TUFTS, TUMBLE, WILD_MAX,
  type BoulderIsland, type FlowerKind, type PlantKind, type SeedId,
} from './data';

type XZ = { x: number; z: number };

// ───────────── 저장 모양(flags.garden) ─────────────
export interface Plot {
  id: string;
  kind: PlantKind;
  /** 꽃 색 id(사과나무는 '') */
  color: string;
  x: number;
  z: number;
  /** 꽃 0..2, 사과 0..5 */
  stage: number;
  /** 마지막으로 물 먹은 날(-1 = 없음) */
  water: number;
  /** 심은(또는 피어난) 날 */
  born: number;
  /** 꽃잎 딴 날 / 사과 흔든 날(-1) */
  picked: number;
  /** 교배로 난 변이 색 */
  hybrid?: boolean;
  /** 황금장미 */
  gold?: boolean;
  /** 어디서 왔나 */
  src: 'seed' | 'breed' | 'dandelion';
}
export interface BlownRec { d: number; x: number; z: number }
export interface GardenFlags {
  v: 1;
  /** 마지막으로 계산한 날(이 날의 물 주기를 기다리는 중) */
  day: number;
  seq: number;
  plots: Plot[];
  /** 민들레 key → 분 날·자리 */
  blown: Record<string, BlownRec>;
  /** 클로버 덤불 key → 살펴본 날 */
  clover: Record<string, number>;
  /** 과일 힘 0..POWER_MAX */
  power: number;
  /** 큰 바위 key → 부순 날 */
  boulders: Record<string, number>;
  /** 회전초: 그날 잡은 수 */
  tumble: { day: number; caught: number; spawned: number };
  /** 고른 씨앗 */
  sel: string | null;
  /** 비로 물 준 날(토스트 한 번) */
  rain: number;
  stats: { planted: number; bred: number; golden: number; clovers: number; boulders: number; tumbleweeds: number; petals: number; apples: number };
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const KINDS: readonly PlantKind[] = ['tulip', 'sunflower', 'rose', 'wild', 'apple'];

/** 저장값 고치기(모르는 칸·깨진 값은 버리고, 없는 칸은 기본값) — 같은 객체를 다시 넣어도 그대로 */
export function normalizeFlags(raw: unknown, today = 0): GardenFlags {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<GardenFlags> & Record<string, unknown>;
  const plots: Plot[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(r.plots) ? r.plots : []) {
    if (!p || typeof p !== 'object') continue;
    const q = p as Partial<Plot>;
    if (typeof q.id !== 'string' || seen.has(q.id) || !KINDS.includes(q.kind as PlantKind)) continue;
    if (!Number.isFinite(q.x) || !Number.isFinite(q.z)) continue;
    seen.add(q.id);
    const kind = q.kind as PlantKind;
    const max = kind === 'apple' ? APPLE_DAYS : BLOOM;
    plots.push({
      id: q.id, kind, color: typeof q.color === 'string' ? q.color : '', x: q.x!, z: q.z!,
      stage: Math.max(0, Math.min(max, Math.floor(num(q.stage, 0)))), water: num(q.water, -1), born: num(q.born, today), picked: num(q.picked, -1),
      ...(q.hybrid ? { hybrid: true } : {}), ...(q.gold ? { gold: true } : {}),
      src: q.src === 'breed' || q.src === 'dandelion' ? q.src : 'seed',
    });
  }
  const recs = <T>(o: unknown, ok: (v: unknown) => v is T): Record<string, T> => {
    const out: Record<string, T> = {};
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (ok(v)) out[k] = v;
    return out;
  };
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const isBlown = (v: unknown): v is BlownRec => !!v && typeof v === 'object' && isNum((v as BlownRec).d) && isNum((v as BlownRec).x) && isNum((v as BlownRec).z);
  const st = (r.stats ?? {}) as Partial<GardenFlags['stats']>;
  const tb = (r.tumble ?? {}) as Partial<GardenFlags['tumble']>;
  const maxSeq = plots.reduce((m, p) => Math.max(m, Number(p.id.replace(/^\D+/, '')) || 0), 0);
  return {
    v: 1,
    day: Math.floor(num(r.day, today)),
    seq: Math.max(maxSeq, Math.floor(num(r.seq, 0))),
    plots,
    blown: recs(r.blown, isBlown),
    clover: recs(r.clover, isNum),
    power: Math.max(0, Math.min(POWER_MAX, Math.floor(num(r.power, 0)))),
    boulders: recs(r.boulders, isNum),
    tumble: { day: num(tb.day, -1), caught: Math.max(0, num(tb.caught, 0)), spawned: Math.max(0, num(tb.spawned, 0)) },
    sel: typeof r.sel === 'string' ? r.sel : null,
    rain: num(r.rain, -1),
    stats: {
      planted: num(st.planted, 0), bred: num(st.bred, 0), golden: num(st.golden, 0), clovers: num(st.clovers, 0),
      boulders: num(st.boulders, 0), tumbleweeds: num(st.tumbleweeds, 0), petals: num(st.petals, 0), apples: num(st.apples, 0),
    },
  };
}

// ───────────── 격자 ─────────────
/** 1 m 칸 가운데로 맞춘다 */
export const snapCell = (x: number, z: number): XZ => ({ x: Math.round(x / CELL) * CELL, z: Math.round(z / CELL) * CELL });
const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);
export const isFlower = (p: Plot) => p.kind !== 'apple';
export const isGrown = (p: Plot) => (p.kind === 'apple' ? p.stage >= APPLE_DAYS : p.stage >= BLOOM);

/** 그 칸이 비었나(꽃은 같은 칸, 사과나무는 둘레 TREE_CLEAR 까지 본다) */
export function cellFree(F: Pick<GardenFlags, 'plots'>, x: number, z: number, kind: PlantKind = 'tulip', ignore?: string): boolean {
  for (const p of F.plots) {
    if (p.id === ignore) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < CELL * 0.5) return false;
    if ((kind === 'apple' || p.kind === 'apple') && d < TREE_CLEAR) return false;
  }
  return true;
}

export interface PlantCheck { ok: boolean; why?: string }
/** 심을 수 있나 — terrainOk 는 '말랑섬 풀밭·평평·건물 자리 아님'을 garden.ts 가 판단 */
export function canPlant(F: GardenFlags, seed: string, x: number, z: number, terrainOk: (x: number, z: number) => boolean): PlantCheck {
  const kind = SEED_KIND[seed as SeedId];
  if (!kind) return { ok: false, why: '씨앗이 아니에요' };
  if (F.plots.filter((p) => p.src !== 'dandelion').length >= PLOT_MAX) return { ok: false, why: `꽃밭은 ${PLOT_MAX}칸까지예요` };
  if (!cellFree(F, x, z, kind)) return { ok: false, why: kind === 'apple' ? '나무는 둘레가 넉넉해야 해요' : '이미 무언가 자라고 있어요' };
  if (!terrainOk(x, z)) return { ok: false, why: '여기엔 심을 수 없어요' };
  return { ok: true };
}

const nextId = (F: GardenFlags) => `p${++F.seq}`;
/** 씨앗 심기(검사는 canPlant 로 먼저) — 새 칸 */
export function plant(F: GardenFlags, seed: SeedId, x: number, z: number, day: number): Plot {
  const kind = SEED_KIND[seed];
  const id = nextId(F);
  const pal = kind === 'apple' ? [] : BASE_COLORS[kind as FlowerKind];
  const color = pal.length ? pal[Math.floor(rngFor(`garden:color:${id}:${Math.round(x)},${Math.round(z)}`)() * pal.length)] : '';
  const p: Plot = { id, kind, color, x, z, stage: 0, water: -1, born: day, picked: -1, src: 'seed' };
  F.plots.push(p);
  F.stats.planted++;
  return p;
}

/** 물 주기: (x, z) 둘레 r 안의 아직 물 안 먹은 것 — 물 먹은 칸 id */
export function waterAt(F: GardenFlags, x: number, z: number, day: number, r = NEIGHBOR_R): string[] {
  const out: string[] = [];
  for (const p of F.plots) {
    if (p.water === day || !needsWater(p)) continue;
    if (Math.hypot(p.x - x, p.z - z) <= r) { p.water = day; out.push(p.id); }
  }
  return out;
}
/** 물이 쓸모 있나(다 자란 사과나무·들꽃은 안 마셔도 된다 — 들꽃도 교배엔 물이 필요해서 마신다) */
export const needsWater = (p: Plot) => !(p.kind === 'apple' && p.stage >= APPLE_DAYS);
/** 비: 그날 전부 물 먹음 — 새로 적신 수 */
export function rainWater(F: GardenFlags, day: number): number {
  let n = 0;
  for (const p of F.plots) if (needsWater(p) && p.water !== day) { p.water = day; n++; }
  return n;
}

// ───────────── 교배 ─────────────
export interface BreedResult { kind: FlowerKind; color: string; hybrid: boolean; gold: boolean }
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const RANK: Record<FlowerKind, number> = { rose: 0, tulip: 1, sunflower: 2, wild: 3 };

/** 두 송이 → (그날 확률을 넘으면) 새 꽃. 결정적: 키 = 날 + 두 id(정렬) */
export function breedPair(a: Pick<Plot, 'id' | 'kind' | 'color'>, b: Pick<Plot, 'id' | 'kind' | 'color'>, day: number): BreedResult | null {
  if (a.kind === 'apple' || b.kind === 'apple') return null;
  const r = rngFor(`garden:breed:${day}:${pairKey(a.id, b.id)}`);
  if (r() >= BREED_CHANCE) return null;
  if (r() < GOLDEN_CHANCE) return { kind: 'rose', color: 'gold', hybrid: true, gold: true };
  const ka = a.kind as FlowerKind, kb = b.kind as FlowerKind;
  let kind: FlowerKind;
  let ca = a.color, cb = b.color;
  if ((ka === 'tulip' && kb === 'sunflower') || (ka === 'sunflower' && kb === 'tulip')) {
    // 튤립 × 해바라기 = 장미(튤립 색을 닮는다)
    const tulip = ka === 'tulip' ? a : b;
    return { kind: 'rose', color: ROSE_FROM[tulip.color] ?? 'red', hybrid: true, gold: false };
  }
  if (ka === kb) kind = ka;
  else {
    kind = RANK[ka] <= RANK[kb] ? ka : kb;
    // 다른 종류의 색은 그 종류 말로 옮긴다
    const tr = (c: string, k: FlowerKind) => (k === kind ? c : kind === 'rose' ? ROSE_FROM[c] ?? 'red' : BASE_COLORS[kind].includes(c) ? c : BASE_COLORS[kind][0]);
    ca = tr(ca, ka); cb = tr(cb, kb);
  }
  // 황금 색은 교배로 물려주지 않는다(황금은 1% 로만)
  if (ca === 'gold') ca = cb === 'gold' ? BASE_COLORS[kind][0] : cb;
  if (cb === 'gold') cb = ca;
  const table = BREED[kind];
  const mut = table[pairKey(ca, cb)];
  if (mut) return { kind, color: mut, hybrid: true, gold: false };
  return { kind, color: r() < 0.5 ? ca : cb, hybrid: false, gold: false };
}

const RING8: ReadonlyArray<[number, number]> = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export interface DayReport {
  days: number[];
  grown: string[];
  bred: Plot[];
  wild: Plot[];
  golden: Plot[];
}

/**
 * 하루(들) 지나기: F.day 부터 today-1 까지 하루씩.
 *  ① 그날 물 먹은 것은 한 단계 자란다(꽃 3단계, 사과 5일이면 열매 나무)
 *  ② 그날 활짝 핀 채로 물 먹은 이웃 두 송이 → 다음 날 빈 이웃 칸에 새 꽃(BREED_CHANCE, 황금장미 GOLDEN_CHANCE)
 *  ③ 그날 분 민들레 → 다음 날 근처에 들꽃
 * cellOk 는 지형 검사(풀밭·평평), 못 놓으면 그 꽃은 안 난다.
 */
export function advanceDays(F: GardenFlags, today: number, cellOk: (x: number, z: number) => boolean): DayReport {
  const rep: DayReport = { days: [], grown: [], bred: [], wild: [], golden: [] };
  today = Math.floor(today);
  if (!(today > F.day)) { if (today < F.day) F.day = today; return rep; }
  for (let d = F.day; d < today; d++) {
    // 오래 쉬다 왔으면: 마지막으로 논 날은 제대로 계산하고, 그 뒤 빈 날들은 건너뛴다(물 줄 사람이 없었으니)
    if (d > F.day && today - d > CATCHUP_MAX) d = today - CATCHUP_MAX;
    rep.days.push(d);
    // 그날 활짝 피어 물 먹은 꽃(자라기 전 모습)
    const blooms = F.plots.filter((p) => isFlower(p) && p.stage >= BLOOM && p.water === d).sort((a, b) => (a.id < b.id ? -1 : 1));
    // ① 자라기
    for (const p of F.plots) {
      if (p.water !== d) continue;
      const max = p.kind === 'apple' ? APPLE_DAYS : BLOOM;
      if (p.stage < max) { p.stage++; rep.grown.push(p.id); }
    }
    // ② 교배 — 한 송이는 하루 한 번만 짝이 된다
    const used = new Set<string>();
    for (let i = 0; i < blooms.length; i++) {
      const a = blooms[i];
      if (used.has(a.id)) continue;
      for (let j = i + 1; j < blooms.length; j++) {
        const b = blooms[j];
        if (used.has(b.id) || dist(a, b) > NEIGHBOR_R) continue;
        const res = breedPair(a, b, d);
        if (!res) continue;
        const spot = freeNeighbor(F, [a, b], `garden:breedcell:${d}:${pairKey(a.id, b.id)}`, cellOk);
        if (!spot) continue;
        used.add(a.id); used.add(b.id);
        const child: Plot = {
          id: nextId(F), kind: res.kind, color: res.color, x: spot.x, z: spot.z, stage: BLOOM, water: -1, born: d + 1, picked: -1,
          ...(res.hybrid ? { hybrid: true } : {}), ...(res.gold ? { gold: true } : {}), src: 'breed',
        };
        F.plots.push(child);
        F.stats.bred++;
        rep.bred.push(child);
        if (res.gold) { F.stats.golden++; rep.golden.push(child); }
        break;
      }
    }
    // ③ 민들레 홀씨 → 들꽃
    for (const [key, b] of Object.entries(F.blown)) {
      if (b.d !== d) continue;
      const w = sproutWild(F, key, b, cellOk);
      if (w) rep.wild.push(w);
    }
    // 하루 넘게 지난 민들레 기록은 지운다(다시 홀씨가 맺힌다)
    for (const [key, b] of Object.entries(F.blown)) if (b.d < d) delete F.blown[key];
  }
  F.day = today;
  return rep;
}

/** 부모 둘레 8칸 중 빈 칸(결정적으로 섞은 순서) */
function freeNeighbor(F: GardenFlags, parents: Plot[], key: string, cellOk: (x: number, z: number) => boolean): XZ | null {
  const r = rngFor(key);
  const rot = Math.floor(r() * 8);
  for (const par of r() < 0.5 ? parents : [...parents].reverse()) {
    for (let k = 0; k < 8; k++) {
      const [dx, dz] = RING8[(k + rot) % 8];
      const x = par.x + dx * CELL, z = par.z + dz * CELL;
      if (cellFree(F, x, z, 'tulip') && cellOk(x, z)) return { x, z };
    }
  }
  return null;
}

/** 민들레 자리 근처(1.4~3.2 m)에 들꽃 하나 — WILD_MAX 를 넘으면 오래된 들꽃부터 진다 */
function sproutWild(F: GardenFlags, key: string, b: BlownRec, cellOk: (x: number, z: number) => boolean): Plot | null {
  const r = rngFor(`garden:wild:${b.d}:${key}`);
  const pal = BASE_COLORS.wild;
  const color = pal[Math.floor(r() * pal.length)];
  for (let k = 0; k < 10; k++) {
    const a = r() * Math.PI * 2, d = DANDELION.sprout[0] + r() * (DANDELION.sprout[1] - DANDELION.sprout[0]);
    const s = snapCell(b.x + Math.cos(a) * d, b.z + Math.sin(a) * d);
    if (!cellFree(F, s.x, s.z) || !cellOk(s.x, s.z)) continue;
    const wilds = F.plots.filter((p) => p.src === 'dandelion');
    if (wilds.length >= WILD_MAX) {
      const old = wilds.sort((p, q) => p.born - q.born || (p.id < q.id ? -1 : 1))[0];
      F.plots.splice(F.plots.indexOf(old), 1);
    }
    const p: Plot = { id: nextId(F), kind: 'wild', color, x: s.x, z: s.z, stage: BLOOM, water: -1, born: b.d + 1, picked: -1, src: 'dandelion' };
    F.plots.push(p);
    return p;
  }
  return null;
}

// ───────────── 따기·흔들기·뽑기 ─────────────
/** 꽃잎 수(그 꽃 한 번 딸 때) */
export function petalsOf(p: Plot): number {
  if (p.gold) return PETALS.gold;
  if (p.kind === 'wild') return PETALS.wild;
  if (p.kind === 'rose') return PETALS.rose;
  return p.hybrid ? PETALS.hybrid : PETALS.plain;
}
/** 꽃잎 따기(활짝 · 오늘 처음) → 꽃잎 수, 못 따면 0. 들꽃은 따면 사라진다 */
export function pickPetals(F: GardenFlags, id: string, day: number): number {
  const p = F.plots.find((q) => q.id === id);
  if (!p || !isFlower(p) || p.stage < BLOOM || p.picked === day) return 0;
  const n = petalsOf(p);
  if (p.kind === 'wild') F.plots.splice(F.plots.indexOf(p), 1);
  else p.picked = day;
  F.stats.petals += n;
  return n;
}
/** 열매 나무 흔들기(하루 한 번) → 떨어진 사과 수 */
export function shakeTree(F: GardenFlags, id: string, day: number, n: number): number {
  const p = F.plots.find((q) => q.id === id);
  if (!p || p.kind !== 'apple' || p.stage < APPLE_DAYS || p.picked === day) return 0;
  p.picked = day;
  F.stats.apples += n;
  return n;
}
/** 오늘 사과가 달려 있나 */
export const hasApples = (p: Plot, day: number) => p.kind === 'apple' && p.stage >= APPLE_DAYS && p.picked !== day;
/** 뽑기 → 뽑은 칸 */
export function dig(F: GardenFlags, id: string): Plot | null {
  const i = F.plots.findIndex((q) => q.id === id);
  if (i < 0) return null;
  return F.plots.splice(i, 1)[0];
}

// ───────────── 과일 힘 ─────────────
export function addPower(F: GardenFlags, n = 1): number { F.power = Math.max(0, Math.min(POWER_MAX, F.power + n)); return F.power; }
export const powerFull = (F: GardenFlags) => F.power >= POWER_MAX;
/** 바위 부수기: 힘이 가득이면 비우고 true */
export function spendPower(F: GardenFlags): boolean { if (!powerFull(F)) return false; F.power = 0; return true; }

// ───────────── 지형 탐침 ─────────────
export interface TerrainProbe {
  /** 섬 id·표면 종류·높이·해안 거리·물 높이 */
  sample(x: number, z: number): { island: string | null; kind: string; h: number; coast: number; water: number };
  height(x: number, z: number): number;
}
/** 진짜 섬(core/island)으로 묻는 탐침 */
export const islandProbe: TerrainProbe = {
  sample(x, z) {
    const s = Island.surfaceAt(x, z);
    return { island: s.island, kind: s.kind, h: s.h, coast: s.coastDist, water: Island.waterLevelAt(x, z) };
  },
  height: (x, z) => Island.heightAt(x, z),
};
/** 기울기(높이 차 / 거리) */
export function slopeAt(probe: TerrainProbe, x: number, z: number, e = 0.8): number {
  const gx = (probe.height(x + e, z) - probe.height(x - e, z)) / (2 * e);
  const gz = (probe.height(x, z + e) - probe.height(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}
/** 마른 땅(물·절벽·용암·강 아님) */
export function dryAt(probe: TerrainProbe, x: number, z: number, minCoast = 1): boolean {
  const s = probe.sample(x, z);
  return s.kind !== 'sea' && s.kind !== 'cliff' && s.kind !== 'lava' && s.kind !== 'river' && s.coast > minCoast && !(s.water > s.h - 0.05);
}
/** 꽃밭 땅: 말랑섬 풀밭·마른·평평 */
export function gardenSoil(probe: TerrainProbe, x: number, z: number): boolean {
  const s = probe.sample(x, z);
  if (s.island !== 'home' || s.kind !== 'grass') return false;
  if (!dryAt(probe, x, z, 1.5)) return false;
  return slopeAt(probe, x, z, 0.5) < 0.35;
}

// ───────────── 민들레·클로버·풀 숲(청크 배치) ─────────────
export interface WildItem { key: string; x: number; z: number; rot: number; s: number }
export interface CloverPatch { key: string; x: number; z: number; sprigs: Array<{ x: number; z: number; rot: number; s: number }> }
export interface WildChunk { dandelions: WildItem[]; patches: CloverPatch[] }

/** 청크 하나의 민들레·클로버 덤불(결정적: 키 garden-wild:cx,cz) — ok 는 그 자리가 말랑섬 풀밭인가 */
export function wildChunk(cx: number, cz: number, size: number, ok: (x: number, z: number) => boolean): WildChunk {
  const r = rngFor(`garden-wild:${cx},${cz}`);
  const x0 = cx * size, z0 = cz * size;
  const out: WildChunk = { dandelions: [], patches: [] };
  const taken: XZ[] = [];
  const free = (x: number, z: number, m: number) => !taken.some((t) => Math.hypot(t.x - x, t.z - z) < m);
  const nd = DANDELION.perChunk[0] + Math.floor(r() * (DANDELION.perChunk[1] - DANDELION.perChunk[0] + 1));
  for (let i = 0, tries = 0; out.dandelions.length < nd && tries < nd * 8; tries++) {
    const x = x0 + r() * size, z = z0 + r() * size, rot = r() * Math.PI * 2, s = 0.85 + r() * 0.35;
    if (!free(x, z, 6) || !ok(x, z)) continue;
    taken.push({ x, z });
    out.dandelions.push({ key: `d:${cx},${cz}:${i++}`, x, z, rot, s });
  }
  const np = CLOVER.patches[0] + Math.floor(r() * (CLOVER.patches[1] - CLOVER.patches[0] + 1));
  for (let i = 0, tries = 0; out.patches.length < np && tries < np * 8; tries++) {
    const x = x0 + 4 + r() * (size - 8), z = z0 + 4 + r() * (size - 8);
    if (!free(x, z, 8) || !ok(x, z)) continue;
    taken.push({ x, z });
    const n = CLOVER.sprigs[0] + Math.floor(r() * (CLOVER.sprigs[1] - CLOVER.sprigs[0] + 1));
    const sprigs: CloverPatch['sprigs'] = [];
    for (let k = 0; k < n; k++) {
      // 해바라기 씨 배열(골고루 둥근 덤불)
      const a = k * 2.39996 + r() * 0.3, d = 0.13 * Math.sqrt(k + 0.5) + r() * 0.04;
      sprigs.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, rot: r() * Math.PI * 2, s: 0.8 + r() * 0.4 });
    }
    out.patches.push({ key: `c:${cx},${cz}:${i++}`, x, z, sprigs });
  }
  return out;
}

/** 장식 풀 숲(detail 레이어) — 결정적 */
export function tuftChunk(cx: number, cz: number, size: number, ok: (x: number, z: number) => boolean): Array<{ x: number; z: number; rot: number; s: number }> {
  const r = rngFor(`garden-tufts:${cx},${cz}`);
  const out: Array<{ x: number; z: number; rot: number; s: number }> = [];
  for (let i = 0; i < TUFTS.perChunk * 2 && out.length < TUFTS.perChunk; i++) {
    const x = cx * size + r() * size, z = cz * size + r() * size, rot = r() * Math.PI * 2, s = 0.7 + r() * 0.6;
    if (ok(x, z)) out.push({ x, z, rot, s });
  }
  return out;
}

/** 그날 그 덤불에서 네잎인 줄기 번호들 — 덤불 하나당 하루 한 번 CLOVER.fourLeaf 로 굴리고, 붙으면 줄기 하나만 네잎 */
export function fourLeafSprigs(day: number, patchKey: string, n: number): number[] {
  if (n <= 0) return [];
  const r = rngFor(`garden:clover:${day}:${patchKey}`);
  if (r() >= CLOVER.fourLeaf) return [];
  return [Math.floor(r() * n)];
}

// ───────────── 큰 바위 자리(섬마다 3, 숨은 곳 옆 샛길) ─────────────
export interface BoulderSpot { key: string; island: BoulderIsland; secret: string; x: number; z: number; y: number }

/** 길목(꼭 지나야 하는 곳)에서 비켜야 할 자리 — 부두·시설·동굴·등대·다리·집·발사대 */
function keepOut(): Array<XZ & { r: number }> {
  const P = Island.PLACES;
  const out: Array<XZ & { r: number }> = [];
  const add = (p: XZ | null | undefined, r: number) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) out.push({ x: p.x, z: p.z, r }); };
  for (const d of Object.values(P.docks)) add(d, 55);
  add(P.launchPad, 70);
  add({ x: 0, z: 0 }, 70); // 시작 마을
  const tryAdd = (f: () => void) => { try { f(); } catch { /* 계산 실패한 자리는 건너뛴다 */ } };
  tryAdd(() => add(P.house, 22));
  tryAdd(() => add(P.shipyard, 22));
  tryAdd(() => add(P.pengLab, 20));
  tryAdd(() => { for (const f of Object.values(P.facilities)) add(f, 18); });
  tryAdd(() => { for (const l of Object.values(P.lighthouses)) add(l, 14); });
  tryAdd(() => { for (const b of P.bridges) add(b, 14); });
  tryAdd(() => { for (const c of P.caves) add(c, 9); });
  tryAdd(() => { for (const h of Object.values(P.hidden)) add(h, 9); });
  return out;
}

/**
 * 섬마다 숨은 곳 셋 각각 옆(14~50 m) 샛길에 큰 바위 하나 — 마른 평지, 길목·건물·숨은 곳 입구에서 비켜서.
 * 물속 숨은 곳(대왕조개·블랙박스 …)은 섬 쪽으로 걸어 나온 첫 마른 땅이 기준. 결정적.
 */
export function boulderSpots(probe: TerrainProbe = islandProbe): BoulderSpot[] {
  const P = Island.PLACES;
  const hidden = P.hidden as Record<string, { x: number; z: number; island: string; water?: boolean }>;
  const avoid = keepOut();
  const out: BoulderSpot[] = [];
  for (const isl of BOULDER_ISLANDS) {
    const def = Island.islandById(isl);
    if (!def) continue;
    const secrets = Object.entries(hidden).filter(([, h]) => h.island === isl).sort(([a], [b]) => (a < b ? -1 : 1));
    for (const [sid, h] of secrets.slice(0, BOULDER.perIsland)) {
      const anchor = landAnchor(probe, isl, h, def);
      const r = rngFor(`garden:boulder:${sid}`);
      const a0 = r() * Math.PI * 2;
      const good = (x: number, z: number, strict: boolean) => {
        const s = probe.sample(x, z);
        if (s.island !== isl || !dryAt(probe, x, z, 6)) return false;
        if (strict && slopeAt(probe, x, z, 1.6) > 0.45) return false;
        if (avoid.some((q) => Math.hypot(q.x - x, q.z - z) < q.r)) return false;
        return !out.some((b) => Math.hypot(b.x - x, b.z - z) < 14);
      };
      let spot: XZ | null = null;
      for (const strict of [true, false]) {
        for (const rad of [14, 18, 22, 27, 33, 40, 50, 64, 80]) {
          for (let k = 0; k < 16 && !spot; k++) {
            const a = a0 + (k / 16) * Math.PI * 2;
            const x = anchor.x + Math.cos(a) * rad, z = anchor.z + Math.sin(a) * rad;
            if (good(x, z, strict)) spot = { x, z };
          }
          if (spot) break;
        }
        if (spot) break;
      }
      const s = spot ?? anchor;
      const x = Math.round(s.x * 100) / 100, z = Math.round(s.z * 100) / 100;
      out.push({ key: `b:${sid}`, island: isl, secret: sid, x, z, y: probe.height(x, z) });
    }
  }
  return out;
}

/** 숨은 곳이 물이면 섬 가운데 쪽으로 걸어 나와 첫 마른 땅 */
function landAnchor(probe: TerrainProbe, isl: string, h: XZ, c: XZ): XZ {
  const land = (x: number, z: number) => probe.sample(x, z).island === isl && dryAt(probe, x, z, 6);
  const L = Math.hypot(c.x - h.x, c.z - h.z);
  if (L > 1) {
    for (let t = 0; t <= L; t += 4) {
      const x = h.x + ((c.x - h.x) / L) * t, z = h.z + ((c.z - h.z) / L) * t;
      if (land(x, z)) return { x, z };
    }
  }
  // 섬 가운데가 물(석호)이면 나선으로 넓혀 간다
  for (let rad = 6; rad <= 420; rad += 6) {
    const n = Math.max(8, Math.round((2 * Math.PI * rad) / 10));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = h.x + Math.cos(a) * rad, z = h.z + Math.sin(a) * rad;
      if (land(x, z)) return { x, z };
    }
  }
  return { x: h.x, z: h.z };
}

/** 그 바위가 오늘 서 있나(부순 다음 날 다시 생긴다) */
export const boulderUp = (F: GardenFlags, key: string, day: number) => {
  const b = F.boulders[key];
  return b === undefined || day - b >= BOULDER.regrowDays;
};

/** 바위 부수면 나오는 것(결정적 키 = 날 + 바위) */
export function boulderLoot(island: BoulderIsland, key: string, day: number, special: string | null): Array<{ id: string; n: number }> {
  const r = rngFor(`garden:boulderloot:${day}:${key}`);
  const out: Array<{ id: string; n: number }> = [];
  out.push({ id: 'm_stone', n: 3 + Math.floor(r() * 3) });
  if (r() < 0.5) out.push({ id: 'm_clay', n: 1 + Math.floor(r() * 2) });
  if (r() < 0.45) out.push({ id: 'm_iron', n: 1 + Math.floor(r() * 2) });
  if (r() < 0.12) out.push({ id: 'm_gold', n: 1 });
  if (special && special !== 'm_clay') out.push({ id: special, n: 1 });
  out.push({ id: 'coins', n: 200 + Math.floor(r() * 9) * 50 });
  void island;
  return out;
}

// ───────────── 바람·회전초 ─────────────
/** 그날 바람(방향 단위 벡터 + 세기 배율). 하루 한 방향에 천천히 흔들리고, 모래폭풍이면 세다 */
export function windAt(day: number, t: number, storm = false): { x: number; z: number; k: number } {
  const r = rngFor(`garden:wind:${day}`);
  const a = r() * Math.PI * 2 + 0.35 * Math.sin(t * 0.05 + r() * 6);
  const k = (1 + 0.28 * Math.sin(t * 0.37) + 0.12 * Math.sin(t * 1.3 + 1.7)) * (storm ? 1.8 : 1);
  return { x: Math.cos(a), z: Math.sin(a), k };
}

export interface Tumble { id: number; x: number; z: number; y: number; vx: number; vz: number; speed: number; spin: number; hop: number; r: number }
/** 플레이어 바람 위쪽(38~55 m)에 하나 — ok 가 마른 모래 땅이면 */
export function spawnTumble(id: number, px: number, pz: number, wind: XZ, rng: () => number, ok: (x: number, z: number) => boolean): Tumble | null {
  for (let k = 0; k < 8; k++) {
    const d = TUMBLE.spawnMin + rng() * (TUMBLE.spawnMax - TUMBLE.spawnMin);
    const side = (rng() - 0.5) * 2 * 26;
    const x = px - wind.x * d - wind.z * side, z = pz - wind.z * d + wind.x * side;
    if (!ok(x, z)) continue;
    const speed = TUMBLE.speed[0] + rng() * (TUMBLE.speed[1] - TUMBLE.speed[0]);
    return { id, x, z, y: 0, vx: wind.x * speed, vz: wind.z * speed, speed, spin: rng() * Math.PI * 2, hop: rng() * Math.PI * 2, r: TUMBLE.r * (0.85 + rng() * 0.35) };
  }
  return null;
}
/** 한 걸음: 바람 쪽으로 속도를 맞춰 가고, 땅에서 통통 튄다. 굴러갈 수 없는 곳(물·절벽)이면 false */
export function stepTumble(tw: Tumble, wind: { x: number; z: number; k: number }, dt: number, height: (x: number, z: number) => number, ok: (x: number, z: number) => boolean): boolean {
  const tx = wind.x * tw.speed * wind.k, tz = wind.z * tw.speed * wind.k;
  const a = Math.min(1, dt * 1.5);
  tw.vx += (tx - tw.vx) * a; tw.vz += (tz - tw.vz) * a;
  const nx = tw.x + tw.vx * dt, nz = tw.z + tw.vz * dt;
  if (!ok(nx, nz)) return false;
  tw.x = nx; tw.z = nz;
  const v = Math.hypot(tw.vx, tw.vz);
  tw.spin += (v / tw.r) * dt;
  tw.hop += dt * (2.2 + v * 0.6);
  tw.y = height(nx, nz) + tw.r + Math.abs(Math.sin(tw.hop)) * 0.45;
  return true;
}
