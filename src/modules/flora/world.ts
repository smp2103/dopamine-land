// 섬별 식생 — 청크 스트리밍(나무 3단 LOD 고리 + 작은 풀꽃 + 플레이어 주변 물결 풀 + 섬 랜드마크) · 흔들기/줍기.
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import type { Ctx } from '../../core/types';
import type { Game } from '../../core/game';
import type { PhysBody } from '../../core/physics';
import { applyCurve } from '../../core/curve';
import { mulberry32 } from '../../core/rng';
import { floraMat, glowLevel, footPos } from './mat';
import { broadleaf, cedar, palm, fruit, bush, flower, clover, weed, res, type Anchor, type FruitKind, type BushKind, type FlowerKind } from './shapes';
import { snowBush, fern, cycad, bigLeaf, giantMushroom, mushroomTuft, snowPine, iceFlower, cactus, hibiscus, hedge, topiary, grassTuft, cherry, beehive } from './wshapes';
import { FRUIT_ITEMS, type WFruit } from './data';

type Lod = 'hi' | 'mid' | 'lo';
type Theme = 'home' | 'dino' | 'ice' | 'mushroom' | 'coral' | 'desert' | 'launch' | 'islet';

interface Kind {
  make: (lod: Lod) => THREE.BufferGeometry;
  mat: THREE.Material;
  sink: number;
  shadow: boolean;
  /** 줄기 충돌 반경·반높이(로컬 m, 크기 배율 곱함) */
  col?: [number, number];
  /** 흔들 수 있는 나무 */
  shake?: boolean;
  /** 이 거리 이상 고리에선 그리지 않음(작은 것) */
  maxLod?: Lod;
  /** mid 고리에서 남길 비율(꽃 같은 자잘한 것) */
  midKeep?: number;
}

interface Item { k: string; x: number; y: number; z: number; rot: number; s: number; tilt: number; tint?: THREE.Color; fruit?: WFruit }

// ── 재질(모듈 공유) ──────────────────────────────────
const M = {
  broad: floraMat('w-broad', { sway: 0.05, swayBase: 1.6, swayH: 2.6, speed: 1.1, rustle: 0.012, rough: 0.82, sheen: 0.5, sheenColor: '#d9ff9a' }),
  cedar: floraMat('w-cedar', { sway: 0.04, swayBase: 1.0, swayH: 3.2, speed: 1.0, rustle: 0.006, rough: 0.85, sheen: 0.35, sheenColor: '#bff0b0' }),
  palm: floraMat('w-palm', { sway: 0.09, swayBase: 1.5, swayH: 2.2, speed: 1.3, rustle: 0.01, rough: 0.8, side: THREE.DoubleSide }),
  frond: floraMat('w-frond', { sway: 0.06, swayBase: 0.2, swayH: 1.2, speed: 1.4, rustle: 0.01, rough: 0.78, side: THREE.DoubleSide }),
  solid: floraMat('w-solid', { sway: 0.0, swayH: 1, rough: 0.6, sheen: 0.4, sheenColor: '#ffffff' }),
  shroom: floraMat('w-shroom', { sway: 0.006, swayBase: 1.0, swayH: 2, speed: 0.6, rough: 0.55, sheen: 0.6, sheenColor: '#ffffff', glow: 1.3 }),
  glowFl: floraMat('w-glowfl', { sway: 0.03, swayBase: 0.05, swayH: 0.32, speed: 1.7, rough: 0.6, side: THREE.DoubleSide, glow: 1.6 }),
  ice: floraMat('w-ice', { sway: 0.0, swayH: 1, rough: 0.18, glow: 0.5, emissive: '#bfefff' }),
  bush: floraMat('w-bush', { sway: 0.012, swayBase: 0.2, swayH: 0.8, speed: 1.2, rustle: 0.006, rough: 0.85, sheen: 0.45, sheenColor: '#d9ff9a', side: THREE.DoubleSide }),
  flower: floraMat('w-flower', { sway: 0.035, swayBase: 0.05, swayH: 0.32, speed: 1.9, rough: 0.7, side: THREE.DoubleSide }),
  weed: floraMat('w-weed', { sway: 0.02, swayBase: 0.0, swayH: 0.2, speed: 2.1, rough: 0.8, side: THREE.DoubleSide }),
  grass: floraMat('w-grass', { sway: 0.06, swayBase: 0.0, swayH: 0.3, speed: 1.6, rough: 0.95, side: THREE.DoubleSide, wave: [0.11, 0.06], gustTint: 0.14, fade: 30, upNormal: 0.92 }),
  fruit: floraMat('w-fruit', { sway: 0.05, swayBase: 1.6, swayH: 2.6, speed: 1.1, rough: 0.5 }),
  drop: floraMat('w-drop', { sway: 0, swayH: 1, rough: 0.5 }),
};

// ── 모양 캐시 ────────────────────────────────────────
const geoCache = new Map<string, THREE.BufferGeometry>();
const rngG = (k: string) => mulberry32(hash(k));
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function cached(key: string, lod: Lod, make: () => THREE.BufferGeometry) {
  const k = key + '|' + lod;
  let g = geoCache.get(k);
  if (!g) {
    res.hi = lod === 'hi'; res.lo = lod === 'lo';
    try { g = make(); } finally { res.hi = true; res.lo = false; }
    g.userData.shared = true;
    g.computeBoundingSphere();
    geoCache.set(k, g);
  }
  return g;
}
/** 초록 잎 정점만 인스턴스 색을 받게(섬별 색조 섞기용) */
function leafTint(g: THREE.BufferGeometry) {
  const col = g.attributes.color as THREE.BufferAttribute | undefined;
  if (!col) return g;
  let tn = g.attributes.aTint as THREE.BufferAttribute | undefined;
  if (!tn) { tn = new THREE.BufferAttribute(new Float32Array(col.count), 1); g.setAttribute('aTint', tn); }
  for (let i = 0; i < col.count; i++) {
    const r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
    if (gg > r * 1.12 && gg > b) tn.setX(i, Math.max(tn.getX(i), 1));
  }
  return g;
}
const BROAD_DET: Record<Lod, number> = { hi: 12, mid: 6, lo: 3 };
const broadAnchors: Anchor[][] = [];
function anchorsFor(v: number) {
  if (!broadAnchors[v]) { res.hi = false; broadAnchors[v] = broadleaf(rngG('w-broad-v' + v), 6, 400 + v, false).anchors; res.hi = true; }
  return broadAnchors[v];
}
const FL_KINDS: FlowerKind[] = ['cosmos', 'tulip', 'pansy'];

const KINDS: Record<string, Kind> = {};
for (let v = 0; v < 2; v++) {
  KINDS['broad' + v] = { make: (l) => cached('broad' + v, l, () => broadleaf(rngG('w-broad-v' + v), BROAD_DET[l], 400 + v, l !== 'lo').geo), mat: M.broad, sink: 0.04, shadow: true, col: [0.24, 1.1], shake: true };
  KINDS['cedar' + v] = { make: (l) => cached('cedar' + v, l, () => cedar(rngG('w-cedar-v' + v), 500 + v).geo), mat: M.cedar, sink: 0.04, shadow: true, col: [0.2, 0.9], shake: true };
  KINDS['palm' + v] = { make: (l) => cached('palm' + v, l, () => leafTint(palm(rngG('w-palm-v' + v)).geo)), mat: M.palm, sink: 0.04, shadow: true, col: [0.18, 1.2], shake: true };
  KINDS['snow' + v] = { make: (l) => cached('snow' + v, l, () => snowPine(rngG('w-snow-v' + v), 600 + v)), mat: M.cedar, sink: 0.04, shadow: true, col: [0.2, 0.9], shake: true };
  KINDS['gmush' + v] = { make: (l) => cached('gmush' + v, l, () => giantMushroom(rngG('w-gm-v' + v), 700 + v)), mat: M.shroom, sink: 0.05, shadow: true, col: [0.42, 1.0] };
}
KINDS.cycad = { make: (l) => cached('cycad', l, () => leafTint(cycad(rngG('w-cycad')))), mat: M.frond, sink: 0.04, shadow: true, col: [0.3, 0.6] };
KINDS.fernG = { make: (l) => cached('fern', l, () => leafTint(fern(rngG('w-fern')))), mat: M.frond, sink: 0.02, shadow: true };
KINDS.saguaro = { make: (l) => cached('saguaro', l, () => cactus(rngG('w-sag'), 1)), mat: M.solid, sink: 0.05, shadow: true, col: [0.3, 1.0] };
KINDS.topiary = { make: (l) => cached('topiary', l, () => topiary(801)), mat: M.bush, sink: 0.0, shadow: true, col: [0.36, 0.5] };
KINDS.hedge = { make: (l) => cached('hedge', l, () => hedge(802)), mat: M.bush, sink: 0.05, shadow: true };
// 작은 것들
KINDS.fern = { make: (l) => cached('fern', l, () => leafTint(fern(rngG('w-fern')))), mat: M.frond, sink: 0.02, shadow: false, midKeep: 0.45 };
KINDS.bigleaf = { make: (l) => cached('bigleaf', l, () => leafTint(bigLeaf(rngG('w-bigleaf')))), mat: M.frond, sink: 0.02, shadow: true, midKeep: 0.6 };
KINDS.mtuft = { make: (l) => cached('mtuft', l, () => mushroomTuft(rngG('w-mtuft'))), mat: M.shroom, sink: 0.0, shadow: false };
KINDS.iceflower = { make: (l) => cached('iceflower', l, () => iceFlower(rngG('w-icefl'))), mat: M.ice, sink: 0.02, shadow: false };
KINDS.barrel = { make: (l) => cached('barrel', l, () => cactus(rngG('w-barrel'), 0)), mat: M.solid, sink: 0.05, shadow: true };
KINDS.hibiscus = { make: (l) => cached('hibiscus', l, () => hibiscus(rngG('w-hib'), 803)), mat: M.bush, sink: 0.06, shadow: true };
KINDS.snowbush = { make: (l) => cached('snowbush', l, () => snowBush(bush(rngG('w-bush-round'), 'round', 810))), mat: M.bush, sink: 0.08, shadow: true };
KINDS.clover = { make: (l) => cached('clover', l, () => clover(rngG('w-clover'))), mat: M.weed, sink: 0, shadow: false, maxLod: 'hi' };
KINDS.weed = { make: (l) => cached('weed', l, () => weed(rngG('w-weed'))), mat: M.weed, sink: 0, shadow: false, maxLod: 'hi' };
(['round', 'azalea', 'hydrangea'] as BushKind[]).forEach((b, i) => {
  KINDS['bush-' + b] = { make: (l) => cached('bush-' + b, l, () => bush(rngG('w-bush-' + b), b, 810 + i)), mat: M.bush, sink: 0.08, shadow: true };
});
FL_KINDS.forEach((f) => {
  for (let v = 0; v < 2; v++) KINDS['fl-' + f + v] = { make: (l) => cached('fl-' + f + v, l, () => flower(f, rngG('w-fl-' + f + v))), mat: M.flower, sink: 0, shadow: false, midKeep: 0.4 };
  KINDS['glow-' + f] = { make: (l) => cached('fl-' + f + '0', l, () => flower(f, rngG('w-fl-' + f + '0'))), mat: M.glowFl, sink: 0, shadow: false, midKeep: 0.4 };
});

const FRUIT_GEO: Partial<Record<WFruit, THREE.BufferGeometry>> = {};
function fruitGeo(f: WFruit) {
  let g = FRUIT_GEO[f];
  if (!g) { g = f === 'cherry' ? cherry() : fruit(f as FruitKind); g.userData.shared = true; FRUIT_GEO[f] = g; }
  return g;
}

// ── 노이즈(숲 무리·꽃밭) ─────────────────────────────
const nForest = createNoise2D(mulberry32(5101));
const nFlower = createNoise2D(mulberry32(5102));
const nHue = createNoise2D(mulberry32(5103));

const GROUND: Record<string, string> = {
  grass: '#86d16f', jungle: '#5fbf5a', snow: '#f4f8ff', desert: '#f2cf8f', sand: '#f4e2b0', rock: '#a59a8f',
};

const FLOWER_PAL = [
  ['#ff8fb5', '#fff6f2'], ['#ffd84a', '#ffa64a'], ['#ff4f5e', '#ffd23f'], ['#9b7bff', '#fff4ec'],
  ['#6f8dff', '#d9a8ff'], ['#fff4ec', '#ff9cc2'], ['#ff5d73', '#ff8fb5'], ['#ffa64a', '#fff6f2'],
];

export interface WorldFloraApi { trees: number }

export function setupWorldFlora(ctx: Ctx, game: Game): THREE.Group {
  const { island } = ctx;
  const B = island.ISLAND_BOUNDS;
  const inVillage = (x: number, z: number, m = 4) => x > B.minX - m && x < B.maxX + m && z > B.minZ - m && z < B.maxZ + m;
  const P = island.PLACES;
  const keepOut: Array<{ x: number; z: number; r: number }> = [
    ...Object.values(P.docks).map((d) => ({ x: d.x, z: d.z, r: 22 })),
    { x: P.launchPad.x, z: P.launchPad.z, r: 55 },
    // 섬 스폰 지점(배·순간이동 도착) 둘레는 비워 둔다
    ...island.ISLANDS.map((d) => { const p = island.islandSpawnPoints(d.id, 1, 0.08)[0]; return p ? { x: p.x, z: p.z, r: 14 } : { x: 1e9, z: 1e9, r: 0 }; }),
    // 약속한 건물 터(집·우체통·조선소·연구소·시설·등대·동굴 입구)는 나무로 덮지 않는다
    { x: P.house.x, z: P.house.z, r: 12 },
    { x: P.mailbox.x, z: P.mailbox.z, r: 4 },
    { x: P.shipyard.x, z: P.shipyard.z, r: 14 },
    { x: P.pengLab.x, z: P.pengLab.z, r: 14 },
    ...Object.values(P.facilities).map((f) => ({ x: f.x, z: f.z, r: 12 })),
    ...Object.values(P.lighthouses).map((f) => ({ x: f.x, z: f.z, r: 9 })),
    ...P.caves.map((c) => ({ x: c.x, z: c.z, r: 6 })),
    // 얼음 성 빙산은 맨 얼음으로 둔다
    { x: P.iceberg.x, z: P.iceberg.z, r: P.iceberg.r + 6 },
    // 티노 언덕 꼭대기(낮잠 자리·금 상자)
    { x: P.tinoHill.x, z: P.tinoHill.z, r: 14 },
  ];
  const blocked = (x: number, z: number) => keepOut.some((k) => (x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r);

  const nearIsland = (x0: number, z0: number, size: number) => island.ISLANDS.some((d) => {
    const cx = Math.max(x0, Math.min(d.x, x0 + size)), cz = Math.max(z0, Math.min(d.z, z0 + size));
    return Math.hypot(cx - d.x, cz - d.z) < d.r * 1.35;
  });

  /** 한 점의 땅 정보(섬 테마·종류·경사) */
  const sample = (x: number, z: number) => {
    const ws = island.worldSample(x, z);
    if (!ws.island || ws.coast <= 0) return null;
    const e = 0.9;
    const gx = island.worldSample(x + e, z).h - ws.h, gz = island.worldSample(x, z + e).h - ws.h;
    const slope = Math.hypot(gx, gz) / e;
    return { h: ws.h, kind: ws.kind, theme: ws.island.theme as Theme, coast: ws.coast, inland: ws.inland, slope, d: ws.island };
  };

  // ── 나무 배치(청크 하나, 결정적) ───────────────────
  const TREE_CELL = 7;
  const treeCache = new Map<string, Item[]>();
  const treesIn = (cx: number, cz: number, x0: number, z0: number, size: number): Item[] => {
    const key = cx + ',' + cz;
    const hit = treeCache.get(key);
    if (hit) return hit;
    const out: Item[] = [];
    if (nearIsland(x0, z0, size)) {
      const r = ctx.rng(`flora-wt:${cx},${cz}`);
      const n = Math.round(size / TREE_CELL);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = x0 + (i + 0.15 + r() * 0.7) * TREE_CELL, z = z0 + (j + 0.15 + r() * 0.7) * TREE_CELL;
        const a = r(), b = r(), c = r(), d = r();
        if (inVillage(x, z, 6) || blocked(x, z)) continue;
        const s = sample(x, z);
        if (!s || s.slope > 0.9) continue;
        const forest = nForest(x * 0.012, z * 0.012) * 0.7 + nForest(x * 0.04 + 9, z * 0.04) * 0.3;
        const it = pickTree(s, forest, x, z, a, b, c, d);
        if (it) out.push(it);
      }
    }
    if (treeCache.size > 600) treeCache.clear();
    treeCache.set(key, out);
    return out;
  };

  const tintHSL = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l);
  const leafVar = (a: number) => new THREE.Color(1, 1, 1).multiplyScalar(0.92 + a * 0.14);
  const FRUITS: WFruit[] = ['apple', 'peach', 'orange', 'pear', 'cherry'];

  const dinoToneS = (x: number, z: number, a: number) => dinoTone(x, z, a);
  const nField = createNoise2D(mulberry32(5105));
  /** 단색 꽃 들판(> 0 이면 들판 안) */
  const fieldAt = (x: number, z: number) => nField(x * 0.0065, z * 0.0065) * 0.8 + nField(x * 0.03, z * 0.03) * 0.2 - 0.26;
  const FIELD_COL = ['#ffd84a', '#ff9cc2', '#fff4ec', '#b9a0ff', '#ffa64a'];
  const fieldColor = (x: number, z: number) => FIELD_COL[Math.floor(((nField(x * 0.002 + 50, z * 0.002) + 1) * 0.5) * 4.999)];
  const DINO_TONES = [new THREE.Color(0.42, 0.66, 0.5), new THREE.Color(0.38, 0.86, 1.0), new THREE.Color(1.25, 1.18, 0.55)];
  const dinoTone = (x: number, z: number, a: number) => {
    const n = (nHue(x * 0.018 + 20, z * 0.018) + 1) * 0.5 + (a - 0.5) * 0.45;
    return DINO_TONES[Math.max(0, Math.min(2, Math.floor(n * 3)))].clone().multiplyScalar(0.94 + a * 0.12);
  };

  function pickTree(s: NonNullable<ReturnType<typeof sample>>, forest: number, x: number, z: number, a: number, b: number, c: number, d: number): Item | null {
    const base = { x, z, y: s.h, rot: a * 6.283, tilt: (b - 0.5) * 0.08 };
    const v = c < 0.5 ? 0 : 1;
    const beach = s.kind === 'sand' || s.coast < 26;
    switch (s.theme) {
      case 'home': case 'islet': {
        if (beach) return d < 0.22 && s.coast > 6 ? { ...base, k: 'palm' + v, s: 0.95 + b * 0.35 } : null;
        if (s.kind !== 'grass') return null;
        if (forest > 0.32) {
          // 삼나무 숲(가운데일수록 크고 빽빽)
          const core = Math.min(1, (forest - 0.32) / 0.35);
          if (d < 0.6 + core * 0.3) return { ...base, k: 'cedar' + v, s: 0.75 + core * 0.55 + b * 0.5, tint: leafVar(a) };
          return null;
        }
        // 들판(꽃밭) 자리는 비운다
        if (fieldAt(x, z) > 0) return d < 0.02 ? { ...base, k: 'broad' + v, s: 1.3 + b * 0.3, tint: leafVar(a) } : null;
        if (forest > 0.02) {
          const k = (forest - 0.02) / 0.3;
          if (d > 0.18 + k * 0.4) return null;
          const fr = FRUITS[Math.floor(((nHue(x * 0.01, z * 0.01) + 1) * 0.5) * 4.999)];
          const isFruit = c < 0.5;
          const blossom = fr === 'cherry';
          const tint = blossom ? tintHSL(0.94, 0.55, 0.86 + a * 0.05) : leafVar(a);
          return { ...base, k: 'broad' + v, s: 0.65 + b * 0.75 + k * 0.25, tint, fruit: isFruit || blossom ? fr : undefined };
        }
        if (d < 0.03) return { ...base, k: 'broad' + v, s: 0.9 + b * 0.7, tint: leafVar(a), fruit: c < 0.5 ? FRUITS[Math.floor(a * 4.999)] : undefined };
        return null;
      }
      case 'dino': {
        if (s.kind === 'lava') return null;
        const rocky = s.kind === 'rock';
        const dens = rocky ? 0.06 : forest > 0 ? 0.72 : 0.45;
        if (d > dens) return null;
        if (beach) return d < 0.4 ? { ...base, k: 'palm' + v, s: 1.1 + b * 0.5 } : null;
        const q = (c * 7.3) % 1;
        const tone = dinoTone(x, z, a);
        if (q < 0.38) return { ...base, k: 'fernG', s: 1.8 + b * 2.4, tint: tone };
        if (q < 0.66) return { ...base, k: 'cycad', s: 1.0 + b * 1.6, tint: tone };
        if (q < 0.9) return { ...base, k: 'palm' + v, s: 1.0 + b * 1.3, tint: tone };
        return { ...base, k: 'broad' + v, s: 1.2 + b * 1.4, tint: tone.clone().multiply(new THREE.Color(0.62, 0.78, 0.62)) };
      }
      case 'ice': {
        if (s.h > 90 || s.slope > 0.7) return null;
        const dens = forest > 0 ? 0.8 : 0.42;
        if (d > dens) return null;
        return { ...base, k: 'snow' + v, s: 1.0 + b * 0.9, tint: tintHSL(0.45 + a * 0.05, 0.35, 0.72) };
      }
      case 'mushroom': {
        if (beach) return null;
        const cap = new THREE.Color(['#ff6f91', '#b98cff', '#ff9f5a', '#5ad1c9', '#ffd35a', '#ff5d6a'][Math.floor(a * 5.999)]);
        // 대·중·소 버섯으로 원근 리듬
        if (d < 0.05) return { ...base, k: 'gmush' + v, s: 3.0 + b * 1.8, tilt: base.tilt * 2, tint: cap };
        if (d < 0.14) return { ...base, k: 'gmush' + v, s: 1.4 + b * 1.0, tilt: base.tilt * 3, tint: cap };
        if (d < 0.36 && forest > -0.15) return { ...base, k: 'gmush' + (1 - v), s: 0.55 + b * 0.5, tilt: base.tilt * 4, tint: cap.lerp(new THREE.Color('#ffffff'), 0.15) };
        return null;
      }
      case 'coral': {
        if (s.h < 0.2) return null;
        if (d < (beach ? 0.42 : 0.28)) return { ...base, k: 'palm' + v, s: 1.0 + b * 0.5 };
        return null;
      }
      case 'desert': {
        if (s.kind === 'rock') return d < 0.04 ? { ...base, k: 'saguaro', s: 1.0 + b * 0.6 } : null;
        // 오아시스: 꽃 노이즈 높은 곳에 야자 무리
        const oasis = nFlower(x * 0.008 + 3, z * 0.008) > 0.55;
        if (oasis) return d < 0.6 ? { ...base, k: 'palm' + v, s: 1.0 + b * 0.5 } : null;
        if (d < 0.16) return { ...base, k: 'saguaro', s: 0.8 + b * 0.7, tilt: base.tilt * 0.3, tint: new THREE.Color(['#ff7fb0', '#ffd84a', '#ff9a5a', '#ffffff'][Math.floor(a * 3.999)]) };
        return null;
      }
      case 'launch': {
        if (beach || s.kind !== 'grass') return null;
        if (d < 0.12) return { ...base, k: 'topiary', s: 1.0 + b * 0.3, tilt: 0 };
        // 생울타리: 격자 방향으로 다듬어 줄지어
        if (d < 0.34 && forest > -0.15) return { ...base, k: 'hedge', s: 1.0 + b * 0.2, rot: (Math.floor(a * 1.999)) * 1.5708, tilt: 0 };
        if (d < 0.42) return { ...base, k: 'broad' + v, s: 1.0 + b * 0.3, tint: leafVar(a) };
        return null;
      }
    }
    return null;
  }

  // ── 작은 것 배치 ──────────────────────────────────
  const smallIn = (cx: number, cz: number, x0: number, z0: number, size: number): Item[] => {
    const out: Item[] = [];
    if (!nearIsland(x0, z0, size)) return out;
    const r = ctx.rng(`flora-ws:${cx},${cz}`);
    const CELL = 1.6;
    const n = Math.round(size / CELL);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 + (i + r()) * CELL, z = z0 + (j + r()) * CELL;
      const a = r(), b = r(), c = r();
      if (inVillage(x, z, 3) || blocked(x, z)) continue;
      const ws = island.worldSample(x, z);
      if (!ws.island || ws.coast <= 1.5) continue;
      if (Math.abs(island.worldSample(x + 0.8, z).h - ws.h) + Math.abs(island.worldSample(x, z + 0.8).h - ws.h) > 0.8) continue;
      const theme = ws.island.theme as Theme;
      const flowerN = nFlower(x * 0.03, z * 0.03) * 0.75 + nFlower(x * 0.11, z * 0.11) * 0.25;
      const hueN = (nHue(x * 0.02, z * 0.02) + 1) * 0.5;
      const base = { x, z, y: ws.h, rot: a * 6.283, tilt: (b - 0.5) * 0.12 };
      const it = pickSmall(theme, ws.kind, ws.coast, flowerN, hueN, base, a, b, c);
      if (it) out.push(it);
    }
    return out;
  };

  function flowerItem(base: { x: number; z: number; y: number; rot: number; tilt: number }, hueN: number, a: number, b: number, glow = false): Item {
    const kind = FL_KINDS[Math.floor(hueN * 2.999)];
    const pal = FLOWER_PAL[Math.floor(hueN * 7.999)];
    return { ...base, k: glow ? 'glow-' + kind : 'fl-' + kind + (b < 0.5 ? 0 : 1), s: 1.4 + b * 0.5, tint: new THREE.Color(pal[a < 0.6 ? 0 : 1]) };
  }

  function pickSmall(theme: Theme, kind: string, coast: number, fl: number, hueN: number,
    base: { x: number; z: number; y: number; rot: number; tilt: number }, a: number, b: number, c: number): Item | null {
    switch (theme) {
      case 'home': case 'islet': case 'launch': {
        if (kind !== 'grass') return null;
        if (theme === 'launch' && c > 0.25) return null;
        if (theme !== 'launch' && fieldAt(base.x, base.z) > 0.04) {
          if (c < 0.75) return { ...flowerItem(base, hueN, a, b), tint: new THREE.Color(fieldColor(base.x, base.z)).multiplyScalar(0.95 + a * 0.1) };
          return null;
        }
        if (fl > 0.35 && c < 0.6) return flowerItem(base, hueN, a, b);
        if (c < 0.045) {
          const bk = (['bush-round', 'bush-azalea', 'bush-hydrangea'] as const)[Math.floor(a * 2.999)];
          const tint = bk === 'bush-azalea' ? new THREE.Color(['#ff8fb8', '#ffffff', '#ff6f9a'][Math.floor(b * 2.999)])
            : bk === 'bush-hydrangea' ? new THREE.Color(['#8fb2ff', '#c79cff', '#ff9fd0'][Math.floor(b * 2.999)]) : undefined;
          return { ...base, k: bk, s: 1.0 + b * 0.5, tint };
        }
        if (c < 0.07) return flowerItem(base, hueN, a, b);
        if (c < 0.16) return { ...base, k: b < 0.6 ? 'clover' : 'weed', s: 1.0 + a * 0.5 };
        return null;
      }
      case 'dino': {
        if (kind === 'lava' || kind === 'sand') return null;
        const rocky = kind === 'rock';
        if (c < (rocky ? 0.03 : 0.11)) return { ...base, k: 'fern', s: 1.1 + b * 1.0, tint: dinoToneS(base.x, base.z, a) };
        if (!rocky && c < 0.26) return { ...base, k: 'bigleaf', s: 0.9 + b * 0.6, tint: dinoToneS(base.x, base.z, a) };
        if (!rocky && fl > 0.45 && c < 0.33) return { ...base, k: 'hibiscus', s: 0.9 + b * 0.4, tint: new THREE.Color(['#ff5d6a', '#ff9a4a', '#ffd84a'][Math.floor(a * 2.999)]) };
        return null;
      }
      case 'ice': {
        if (c < 0.07) return { ...base, k: 'iceflower', s: 1.2 + b * 0.9, tint: new THREE.Color(['#bfefff', '#d9c8ff', '#c8fff0'][Math.floor(a * 2.999)]) };
        if (c < 0.12) return { ...base, k: 'snowbush', s: 0.8 + b * 0.8 };
        return null;
      }
      case 'mushroom': {
        if (kind === 'sand') return null;
        if (c < 0.07) return { ...base, k: 'mtuft', s: 1.3 + b * 1.2, tint: new THREE.Color(['#ff6f91', '#b98cff', '#ff9f5a', '#5ad1c9'][Math.floor(a * 3.999)]) };
        if (fl > 0.2 && c < 0.45) return flowerItem(base, (hueN + 0.37) % 1, a, b, true);
        if (c < 0.12) return { ...base, k: 'bush-round', s: 0.6 + b * 0.9, tint: new THREE.Color(['#ffd6ec', '#e3d4ff', '#c9f5e4', '#fff1c9'][Math.floor(a * 3.999)]) };

        return null;
      }
      case 'coral': {
        if (base.y < 0.25) return null;
        if (c < 0.06) return { ...base, k: 'hibiscus', s: 0.9 + b * 0.5, tint: new THREE.Color(['#ff4f6a', '#ff8fb8', '#ffa64a', '#ffd84a'][Math.floor(a * 3.999)]) };
        if (kind !== 'sand' && fl > 0.3 && c < 0.5) return flowerItem(base, hueN, a, b);
        if (kind !== 'sand' && c < 0.1) return { ...base, k: 'fern', s: 0.7 + b * 0.4 };
        return null;
      }
      case 'desert': {
        if (coast < 3) return null;
        if (c < 0.03 || (fl > 0.3 && c < 0.06)) return { ...base, k: 'barrel', s: 0.8 + b * 0.7, tint: new THREE.Color(['#ff6fa8', '#ffd84a', '#ff8a4a', '#ffffff'][Math.floor(a * 3.999)]) };
        if (fl > 0.35 && c < 0.3) return { ...base, k: 'fl-pansy' + (b < 0.5 ? 0 : 1), s: 1.4 + b * 0.4, tint: new THREE.Color(['#ffd84a', '#ffa64a', '#ff5d6a'][Math.floor(a * 2.999)]) };
        return null;
      }
    }
    return null;
  }

  // ── 인스턴스 묶음 만들기 ─────────────────────────────
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0), _X = new THREE.Vector3(1, 0, 0);
  const itemMatrix = (it: Item, sink: number, out: THREE.Matrix4) => {
    _q.setFromAxisAngle(_Y, it.rot).multiply(_q2.setFromAxisAngle(_X, it.tilt));
    _p.set(it.x, it.y - sink * it.s, it.z);
    _s.setScalar(it.s);
    return out.compose(_p, _q, _s);
  };
  const lodRank: Record<Lod, number> = { hi: 0, mid: 1, lo: 2 };

  function buildGroup(items: Item[], lod: Lod, shadowOn: boolean) {
    const g = new THREE.Group();
    const byK = new Map<string, Item[]>();
    for (const it of items) {
      const K = KINDS[it.k];
      if (!K || (K.maxLod && lodRank[lod] > lodRank[K.maxLod])) continue;
      if (lod !== 'hi' && K.midKeep !== undefined && ((Math.abs(it.x * 12.9898 + it.z * 78.233) * 43.7585) % 1) > K.midKeep) continue;
      // 먼 고리는 변주를 하나로 합쳐 draw call 을 줄인다(멀면 구분 안 됨)
      let key = it.k;
      if (lod === 'lo' && /^(broad|cedar|palm|snow|gmush)1$/.test(key)) key = key.slice(0, -1) + '0';
      if (lod !== 'hi' && /^fl-[a-z]+1$/.test(key)) key = key.slice(0, -1) + '0';
      let l = byK.get(key);
      if (!l) byK.set(key, (l = []));
      l.push(it);
    }
    const refs = new Map<Item, { mesh: THREE.InstancedMesh; i: number }>();
    const m4 = new THREE.Matrix4();
    for (const [k, list] of byK) {
      const K = KINDS[k];
      const mesh = new THREE.InstancedMesh(K.make(lod), K.mat, list.length);
      const anyTint = list.some((i) => i.tint);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, itemMatrix(it, K.sink, m4));
        if (anyTint) mesh.setColorAt(i, it.tint ?? WHITE);
        refs.set(it, { mesh, i });
      });
      mesh.castShadow = shadowOn && K.shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      g.add(mesh);
    }
    return { g, refs };
  }
  const WHITE = new THREE.Color(1, 1, 1);

  // ── 흔들 나무 등록부 ────────────────────────────────
  interface TreeRec {
    key: string; it: Item; base: THREE.Matrix4; ref: { mesh: THREE.InstancedMesh; i: number };
    fruits: Array<{ mesh: THREE.InstancedMesh; i: number; local: THREE.Matrix4 }>;
    shakeT: number;
  }
  const liveTrees = new Map<string, TreeRec[]>();
  /** 과일을 딴 나무 → 다시 열리는 시각 */
  const picked = new Map<string, number>();
  let shaking: TreeRec[] = [];

  function addFruit(g: THREE.Group, recs: TreeRec[] | null, list: Array<{ it: Item; tm: THREE.Matrix4; rec?: TreeRec }>) {
    const byF = new Map<WFruit, Array<{ m: THREE.Matrix4; rec?: TreeRec; local: THREE.Matrix4 }>>();
    for (const { it, tm, rec } of list) {
      if (!it.fruit || !it.k.startsWith('broad')) continue;
      const tk = treeKey(it);
      if ((picked.get(tk) ?? -1) > game.time) continue;
      const anchors = anchorsFor(Number(it.k.slice(5)));
      let arr = byF.get(it.fruit);
      if (!arr) byF.set(it.fruit, (arr = []));
      for (const an of anchors.slice(0, it.fruit === 'cherry' ? 5 : 4)) {
        const local = new THREE.Matrix4().compose(
          an.p.clone().addScaledVector(an.n, 0.06).add(new THREE.Vector3(0, it.fruit === 'cherry' ? -0.2 : -0.04, 0)),
          new THREE.Quaternion().setFromAxisAngle(_Y, Math.atan2(an.n.x, an.n.z)), new THREE.Vector3(1, 1, 1));
        arr.push({ m: tm.clone().multiply(local), rec, local });
      }
    }
    for (const [f, arr] of byF) {
      const mesh = new THREE.InstancedMesh(fruitGeo(f), M.fruit, arr.length);
      arr.forEach((e, i) => { mesh.setMatrixAt(i, e.m); e.rec?.fruits.push({ mesh, i, local: e.local }); });
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      g.add(mesh);
    }
    void recs;
  }
  const treeKey = (it: Item) => `${Math.round(it.x * 10)},${Math.round(it.z * 10)}`;

  // 나무 3단 고리(같은 청크 크기 → 서로 겹치거나 비지 않는다)
  const TS = 96;
  const ring = (key: string, lod: Lod, inner: number, outer: number) => {
    game.chunks.add({
      key, size: TS, radius: outer, innerRadius: inner >= 0 ? inner : undefined, detail: true,
      build: ({ cx, cz, x0, z0, size }) => {
        const items = treesIn(cx, cz, x0, z0, size);
        if (!items.length) return null;
        const { g, refs } = buildGroup(items, lod, lod !== 'lo');
        const ck = key + ':' + cx + ',' + cz;
        if (lod !== 'lo') {
          const m4 = new THREE.Matrix4();
          const recs: TreeRec[] = [];
          const fl: Array<{ it: Item; tm: THREE.Matrix4; rec?: TreeRec }> = [];
          for (const it of items) {
            const K = KINDS[it.k];
            const ref = refs.get(it);
            if (!ref) continue;
            const tm = itemMatrix(it, K.sink, m4).clone();
            let rec: TreeRec | undefined;
            if (lod === 'hi' && K.shake) {
              rec = { key: treeKey(it), it, base: tm, ref, fruits: [], shakeT: -1 };
              recs.push(rec);
            }
            if (it.fruit) fl.push({ it, tm, rec });
          }
          addFruit(g, recs, fl);
          if (lod === 'hi') {
            liveTrees.set(ck, recs);
            const bodies: PhysBody[] = [];
            for (const it of items) {
              const c = KINDS[it.k].col;
              if (!c) continue;
              bodies.push(game.physics.addStatic({ kind: 'cylinder', halfH: c[1] * it.s, r: c[0] * it.s }, { x: it.x, y: it.y + c[1] * it.s - 0.1, z: it.z }, undefined, 'tree'));
            }
            g.userData.bodies = bodies;
          }
        }
        g.userData.ck = ck;
        return g;
      },
      dispose: (o) => {
        for (const b of (o.userData.bodies as PhysBody[] | undefined) ?? []) b.remove();
        liveTrees.delete(o.userData.ck as string);
        shaking = shaking.filter((r) => r.ref.mesh.parent !== o);
      },
    });
  };
  ring('flora-trees-hi', 'hi', -1, 70);
  ring('flora-trees-mid', 'mid', 70, 150);
  ring('flora-trees-lo', 'lo', 150, 390);

  // 작은 풀꽃: 가까이(hi)·조금 멀리(mid)
  const SS = 32;
  const small = (key: string, lod: Lod, inner: number, outer: number) => game.chunks.add({
    key, size: SS, radius: outer, innerRadius: inner >= 0 ? inner : undefined, detail: true,
    build: ({ cx, cz, x0, z0, size }) => {
      const items = smallIn(cx, cz, x0, z0, size);
      if (!items.length) return null;
      return buildGroup(items, lod, lod === 'hi').g;
    },
    dispose: () => {},
  });
  small('flora-small-hi', 'hi', -1, 44);
  small('flora-small-mid', 'mid', 44, 100);

  // 물결 풀: 플레이어 주변만
  const grassGeo = [0, 1, 2].map((v) => { const g = grassTuft(rngG('w-grass2-' + v), 5, 0.24); g.userData.shared = true; return g; });
  const nClump = createNoise2D(mulberry32(5104));
  game.chunks.add({
    key: 'flora-grass', size: 16, radius: 36, detail: true,
    build: ({ cx, cz, x0, z0, size }) => {
      if (!nearIsland(x0, z0, size)) return null;
      const r = ctx.rng(`flora-grass:${cx},${cz}`);
      const lists: Item[][] = [[], [], []];
      const CELL = 0.55;
      const n = Math.round(size / CELL);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = x0 + (i + r()) * CELL, z = z0 + (j + r()) * CELL;
        const a = r(), b = r(), v = Math.floor(r() * 2.999);
        if (inVillage(x, z, 2)) continue;
        // 군락: 덩어리(풀 무더기) + 맨 잔디(동숲처럼 매끈한 바닥)가 번갈아
        const cl = nClump(x * 0.16, z * 0.16) * 0.7 + nClump(x * 0.5 + 7, z * 0.5) * 0.3;
        if (cl < 0.12) continue;
        const k0 = Math.min(1, (cl - 0.12) / 0.4);
        if (a > 0.25 + 0.7 * k0) continue;
        const ws = island.worldSample(x, z);
        if (!ws.island || ws.coast <= 3) continue;
        const k = ws.kind;
        const th = ws.island.theme;
        let dens = k === 'grass' ? 1 : k === 'jungle' ? 1 : k === 'desert' ? 0.08 : k === 'rock' ? 0.1 : 0;
        if (th === 'launch') dens *= 0.35;
        if (b > dens) continue;
        if (Math.abs(island.worldSample(x + 0.7, z).h - ws.h) + Math.abs(island.worldSample(x, z + 0.7).h - ws.h) > 0.75) continue;
        const gc = new THREE.Color(GROUND[k] ?? GROUND.grass);
        if (th === 'mushroom') gc.lerp(new THREE.Color('#8fdcb0'), 0.4);
        if (th === 'dino') gc.lerp(new THREE.Color('#4fb06a'), 0.25);
        if (k === 'desert') gc.set('#c9c06a');
        gc.multiplyScalar(0.98 + b * 0.06);
        lists[v].push({ k: '', x, z, y: ws.h, rot: b * 6.283, s: (th === 'launch' ? 0.55 : 0.7) + k0 * 0.55 + a * 0.35, tilt: 0, tint: gc });
      }
      const g = new THREE.Group();
      const m4 = new THREE.Matrix4();
      lists.forEach((l, v) => {
        if (!l.length) return;
        const mesh = new THREE.InstancedMesh(grassGeo[v], M.grass, l.length);
        l.forEach((it, i) => { mesh.setMatrixAt(i, itemMatrix(it, 0, m4)); mesh.setColorAt(i, it.tint!); });
        mesh.castShadow = false; mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        g.add(mesh);
      });
      return g.children.length ? g : null;
    },
    dispose: () => {},
  });

  // ── 랜드마크(섬마다 하나, 아주 멀리서도 보임) ─────────────
  const LM: Record<string, { k: string; s: number; tint?: string }> = {
    home: { k: 'broad0', s: 8.5, tint: '#ffd0e4' }, dino: { k: 'cycad', s: 9 }, ice: { k: 'snow1', s: 9, tint: '#bfe8dc' },
    mushroom: { k: 'gmush0', s: 9, tint: '#ff7fb0' }, coral: { k: 'palm0', s: 7 }, desert: { k: 'saguaro', s: 7, tint: '#ff7fb0' },
  };
  const landmarks: Item[] = [];
  for (const d of island.ISLANDS) {
    const L = LM[d.theme];
    if (!L) continue;
    const pts = island.islandSpawnPoints(d.id, 14, 0.28);
    let best: { x: number; z: number } | null = null, bh = -1e9;
    for (const p of pts) {
      const s = sample(p.x, p.z);
      if (!s || s.slope > 0.5 || s.kind === 'lava' || blocked(p.x, p.z)) continue;
      const score = s.h * (d.theme === 'ice' || d.theme === 'dino' ? -1 : 1);
      if (score > bh) { bh = score; best = p; }
    }
    if (!best) continue;
    const it: Item = { k: L.k, x: best.x, z: best.z, y: island.heightAt(best.x, best.z), rot: 0.7, s: L.s, tilt: 0, tint: L.tint ? new THREE.Color(L.tint) : undefined };
    landmarks.push(it);
    const c = KINDS[L.k].col;
    if (c) game.physics.addStatic({ kind: 'cylinder', halfH: c[1] * it.s, r: c[0] * it.s * 0.9 }, { x: it.x, y: it.y + c[1] * it.s - 0.1, z: it.z }, undefined, 'landmark');
  }
  game.chunks.add({
    key: 'flora-landmark', size: 1000, radius: 3600,
    build: ({ x0, z0, size }) => {
      const its = landmarks.filter((l) => l.x >= x0 && l.x < x0 + size && l.z >= z0 && l.z < z0 + size);
      if (!its.length) return null;
      return buildGroup(its, 'mid', true).g;
    },
    dispose: () => {},
  });

  // ── 흔들기 · 줍기 ───────────────────────────────────
  interface Drop { body: PhysBody; mesh: THREE.Mesh; item: string; name: string; born: number }
  let drops: Drop[] = [];
  const dropRoot = new THREE.Group();
  dropRoot.name = 'flora-drops';
  game.root.add(dropRoot);
  const hiveGeo = beehive(); hiveGeo.userData.shared = true;

  const spawnDrop = (geo: THREE.BufferGeometry, at: THREE.Vector3, item: string, name: string, r: number, k: number) => {
    const mesh = new THREE.Mesh(geo, M.drop);
    mesh.castShadow = true;
    mesh.position.copy(at);
    applyCurve(mesh);
    dropRoot.add(mesh);
    const body = game.physics.add({ shape: { kind: 'ball', r }, position: at, mesh, restitution: 0.35, friction: 0.8, linearDamping: 0.3, angularDamping: 0.6, density: 0.8, buoyancy: 1.6, tag: 'fruit' });
    const rr = ctx.rng(`drop:${item}:${k}:${Math.round(game.time * 1000)}`);
    body.body.setLinvel({ x: (rr() - 0.5) * 2.4, y: 1 + rr(), z: (rr() - 0.5) * 2.4 }, true);
    drops.push({ body, mesh, item, name, born: game.time });
    if (drops.length > 40) { const o = drops.shift()!; o.body.remove(); o.mesh.removeFromParent(); }
  };

  let shakeCount = 0;
  const shake = (rec: TreeRec) => {
    rec.shakeT = game.time;
    if (!shaking.includes(rec)) shaking.push(rec);
    game.player.action = 'shake';
    actionUntil = game.time + 0.7;
    const r = ctx.rng(`flora-shake:${rec.key}:${shakeCount++}`);
    const top = new THREE.Vector3(rec.it.x, rec.it.y + 2.4 * rec.it.s, rec.it.z);
    const toward = game.player.pos.clone().sub(top).setY(0).normalize().multiplyScalar(0.9);
    const roll = r();
    if (rec.fruits.length && rec.it.fruit) {
      const f = rec.it.fruit;
      const info = FRUIT_ITEMS[f];
      rec.fruits.forEach((fr, i) => {
        const m = new THREE.Matrix4();
        fr.mesh.getMatrixAt(fr.i, m);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        fr.mesh.setMatrixAt(fr.i, ZERO);
        fr.mesh.instanceMatrix.needsUpdate = true;
        spawnDrop(fruitGeo(f), p.add(toward.clone().multiplyScalar(0.3)), info.id, info.name, f === 'cherry' ? 0.14 : 0.19, i);
      });
      rec.fruits = [];
      picked.set(rec.key, game.time + 180);
      game.ui.toast(`${info.name}${info.josa} 떨어졌다!`);
      return;
    }
    if (roll < 0.14) {
      const n = 50 + Math.floor(r() * 9) * 25;
      game.state.addCoins(n, 'tree');
      game.ui.toast(`나무에서 ${n} 코인이 떨어졌다!`);
    } else if (roll < 0.24) {
      spawnDrop(hiveGeo, top.clone().add(toward), 'beehive', '벌집', 0.25, 0);
      game.ui.toast('벌집이 떨어졌다! 앗, 따끔! 벌들이 화났다!');
    } else if (roll < 0.38) {
      game.ui.toast('후드득… 벌레가 떨어져 도망갔다!');
    } else if (roll < 0.5) {
      spawnDrop(fruitGeo('apple'), top.clone().add(toward), FRUIT_ITEMS.apple.id, FRUIT_ITEMS.apple.name, 0.19, 0);
      game.ui.toast('과일 하나가 숨어 있었다!');
    } else {
      game.ui.toast('사락사락… 나뭇잎만 흔들렸다');
    }
  };
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let actionUntil = -1;

  game.addProvider('flora-shake', (p) => {
    let best: TreeRec | null = null, bd = 1e9;
    for (const recs of liveTrees.values()) for (const rec of recs) {
      const dx = rec.it.x - p.pos.x, dz = rec.it.z - p.pos.z;
      if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const d = Math.hypot(dx, dz) - 0.3 * rec.it.s;
      if (d < 1.6 && d < bd) { bd = d; best = rec; }
    }
    if (!best) return null;
    const rec = best;
    return { label: rec.it.fruit && rec.fruits.length ? '나무 흔들기 (열매)' : '나무 흔들기', dist: bd + 0.5, use: () => shake(rec) };
  });
  game.addProvider('flora-pick', (p) => {
    let best: Drop | null = null, bd = 1e9;
    for (const d of drops) {
      const t = d.body.body.translation();
      const dd = Math.hypot(t.x - p.pos.x, t.z - p.pos.z);
      if (dd < 1.6 && Math.abs(t.y - p.pos.y) < 2 && dd < bd) { bd = dd; best = d; }
    }
    if (!best) return null;
    const d = best;
    return {
      label: `${d.name} 줍기`, dist: bd, use: () => {
        game.state.addItem(d.item, 1);
        game.ui.toast(`${d.name}${d.item === 'beehive' ? '을' : '를'} 주웠다!`);
        d.body.remove(); d.mesh.removeFromParent();
        drops = drops.filter((x) => x !== d);
        game.player.action = 'pick';
        actionUntil = game.time + 0.4;
      },
    };
  });

  const m4 = new THREE.Matrix4(), rot = new THREE.Matrix4();
  game.onUpdate((t) => {
    footPos.value.set(game.player.pos.x, game.player.pos.z);
    if (actionUntil > 0 && t > actionUntil) { if (game.player.action === 'shake' || game.player.action === 'pick') game.player.action = null; actionUntil = -1; }
    if (!shaking.length) return;
    shaking = shaking.filter((rec) => {
      const e = t - rec.shakeT;
      const done = e > 1.1;
      const ang = done ? 0 : Math.sin(e * 28) * 0.07 * Math.exp(-e * 3.2);
      rot.makeRotationAxis(_X, ang).premultiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), ang * 0.6));
      m4.copy(rec.base).multiply(rot);
      rec.ref.mesh.setMatrixAt(rec.ref.i, m4);
      rec.ref.mesh.instanceMatrix.needsUpdate = true;
      for (const fr of rec.fruits) { fr.mesh.setMatrixAt(fr.i, m4.clone().multiply(fr.local)); fr.mesh.instanceMatrix.needsUpdate = true; }
      return !done;
    });
  });

  game.onWorld((w) => { dropRoot.visible = w === 'earth'; });
  const api = { trees: () => [...liveTrees.values()].reduce((a, r) => a + r.length, 0), drops: () => drops.length, shakeNearest: () => {
    const p = game.player.pos;
    let best: TreeRec | null = null, bd = 1e9;
    for (const recs of liveTrees.values()) for (const rec of recs) { const d = Math.hypot(rec.it.x - p.x, rec.it.z - p.z); if (d < bd && rec.it.fruit) { bd = d; best = rec; } }
    if (best) shake(best);
    return best ? { x: best.it.x, z: best.it.z, d: bd } : null;
  }, landmarks };
  (window as unknown as { __floraWorld?: unknown }).__floraWorld = api;
  return dropRoot;
}

/** 시간대 → 발광 세기 */
export function floraTod(name: string) {
  glowLevel.value = name === 'night' ? 1 : name === 'sunset' ? 0.35 : name === 'morning' ? 0.08 : 0;
}
