// 섬별 식생 — 청크 스트리밍(나무 3단 LOD 고리 + 작은 풀꽃 + 플레이어 주변 물결 풀 + 섬 랜드마크).
// 섬마다 열매 나무(산호 코코넛·바나나, 사막 대추야자, 별똥별 별사과, 솜눈 서리 열매, 공룡 은행)와 새 식생(맹그로브·선인장 셋·유성초·바람개비).
// 흔들기·베기·줍기는 harvest.ts 가, 하루 기록은 flags.flora 가 맡는다 — 여기선 나무·풀꽃을 만들며 등록만 한다.
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import type { Ctx } from '../../core/types';
import type { Game } from '../../core/game';
import type { PhysBody } from '../../core/physics';
import { mulberry32 } from '../../core/rng';
import { floraMat, glowLevel, footPos } from './mat';
import { broadleaf, cedar, palm, bush, flower, clover, weed, res, type Anchor, type BushKind, type FlowerKind } from './shapes';
import { snowBush, fern, cycad, bigLeaf, giantMushroom, mushroomTuft, snowPine, iceFlower, cactus, hibiscus, hedge, topiary, grassTuft } from './wshapes';
import {
  broadFruitTree, fruitPalm, bananaPlant, mangrove, fanCactus, meteorFlower, pinwheel, PINWHEEL_HUB, wishTree, halmiTree,
} from './wshapes2';
import type { WFruit, GatherKind } from './data';
import { floraKeepOut, inCircles, type Circle } from './logic';
import { treeKey, type Harvest, type TreeRec, type PickRec } from './harvest';
import { homeTreeSpots, homeLandmarks, halmiPetals, type HomeTree } from './homeland';

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
  /** 벨 수 있는 나무(돌망치 F) */
  chop?: boolean;
  /** 열매 매다는 자리 */
  anchors?: () => Anchor[];
  /** 이 거리 이상 고리에선 그리지 않음(작은 것) */
  maxLod?: Lod;
  /** mid 고리에서 남길 비율(꽃 같은 자잘한 것) */
  midKeep?: number;
  /** 가까이(hi)에서 주울 수 있는 것 */
  gather?: GatherKind;
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
  meteor: floraMat('w-meteorfl', { sway: 0.04, swayBase: 0.05, swayH: 0.36, speed: 1.6, rough: 0.55, side: THREE.DoubleSide, glow: 1.8, emissive: '#cfe6ff' }),
  spin: floraMat('w-pinwheel', { sway: 0.01, swayBase: 0.2, swayH: 0.9, speed: 1.2, rough: 0.6, side: THREE.DoubleSide, spin: { hubY: PINWHEEL_HUB, speed: 4.5 } }),
  giant: floraMat('w-giant', { sway: 0.012, swayBase: 1.8, swayH: 2.4, speed: 0.7, rustle: 0.006, rough: 0.82, sheen: 0.45, sheenColor: '#ffe6f0', side: THREE.DoubleSide }),
};

// ── 모양 캐시 ────────────────────────────────────────
const geoCache = new Map<string, THREE.BufferGeometry>();
const anchorCache = new Map<string, Anchor[]>();
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
/** 모양 + 열매 자리(자리는 처음 만든 해상도 것을 모든 LOD 가 같이 쓴다) */
function cachedTree(key: string, lod: Lod, make: () => { geo: THREE.BufferGeometry; anchors: Anchor[] }) {
  return cached(key, lod, () => { const r = make(); if (!anchorCache.has(key)) anchorCache.set(key, r.anchors); return r.geo; });
}
/** 자리만 필요할 때(아직 모양을 안 만들었으면 mid 로 한 번 만든다) */
function anchorsOf(key: string, build: (l: Lod) => THREE.BufferGeometry) {
  if (!anchorCache.has(key)) build('mid');
  return anchorCache.get(key) ?? [];
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
const FL_KINDS: FlowerKind[] = ['cosmos', 'tulip', 'pansy'];

const KINDS: Record<string, Kind> = {};
for (let v = 0; v < 2; v++) {
  // 활엽수: 열매 자리는 예전처럼 det 6 모양에서
  const bk = 'broad' + v;
  KINDS[bk] = {
    make: (l) => cached(bk, l, () => broadleaf(rngG('w-broad-v' + v), BROAD_DET[l], 400 + v, l !== 'lo').geo), mat: M.broad, sink: 0.04, shadow: true, col: [0.24, 1.1], shake: true, chop: true,
    anchors: () => {
      if (!anchorCache.has(bk)) { res.hi = false; anchorCache.set(bk, broadleaf(rngG('w-broad-v' + v), 6, 400 + v, false).anchors); res.hi = true; }
      return anchorCache.get(bk)!;
    },
  };
  KINDS['cedar' + v] = { make: (l) => cached('cedar' + v, l, () => cedar(rngG('w-cedar-v' + v), 500 + v).geo), mat: M.cedar, sink: 0.04, shadow: true, col: [0.2, 0.9], shake: true, chop: true };
  KINDS['palm' + v] = { make: (l) => cached('palm' + v, l, () => leafTint(palm(rngG('w-palm-v' + v)).geo)), mat: M.palm, sink: 0.04, shadow: true, col: [0.18, 1.2], shake: true, chop: true };
  KINDS['snow' + v] = { make: (l) => cached('snow' + v, l, () => snowPine(rngG('w-snow-v' + v), 600 + v)), mat: M.cedar, sink: 0.04, shadow: true, col: [0.2, 0.9], shake: true, chop: true };
  KINDS['gmush' + v] = { make: (l) => cached('gmush' + v, l, () => giantMushroom(rngG('w-gm-v' + v), 700 + v)), mat: M.shroom, sink: 0.05, shadow: true, col: [0.42, 1.0], chop: true };
  // 열매 야자(코코넛·대추)
  for (const [name, fr] of [['coco', 'coconut'], ['date', 'date']] as const) {
    const key = name + v;
    const make = (l: Lod) => cachedTree(key, l, () => { const r = fruitPalm(fr, rngG(`w-${name}-v${v}`)); leafTint(r.geo); return r; });
    KINDS[key] = { make, mat: M.palm, sink: 0.04, shadow: true, col: [0.18, 1.2], shake: true, chop: true, anchors: () => anchorsOf(key, make) };
  }
  // 섬 색 활엽수(별사과·서리 열매·은행)
  for (const kind of ['starapple', 'frostberry', 'ginkgo'] as const) {
    const key = kind + v;
    const make = (l: Lod) => cachedTree(key, l, () => broadFruitTree(kind, rngG(`w-${kind}-v${v}`), BROAD_DET[l], 900 + v * 7 + kind.length, l !== 'lo'));
    KINDS[key] = { make, mat: M.broad, sink: 0.04, shadow: true, col: [0.24, 1.1], shake: true, chop: true, anchors: () => anchorsOf(key, make) };
  }
}
{
  const make = (l: Lod) => cachedTree('banana', l, () => bananaPlant(rngG('w-banana')));
  KINDS.banana = { make, mat: M.frond, sink: 0.03, shadow: true, col: [0.17, 1.0], shake: true, chop: true, anchors: () => anchorsOf('banana', make) };
}
KINDS.mangrove = { make: (l) => cached('mangrove', l, () => mangrove(rngG('w-mangrove'), 951)), mat: M.broad, sink: 0.02, shadow: true, col: [0.16, 1.1], shake: true, chop: true };
KINDS.cycad = { make: (l) => cached('cycad', l, () => leafTint(cycad(rngG('w-cycad')))), mat: M.frond, sink: 0.04, shadow: true, col: [0.3, 0.6], shake: true, chop: true };
KINDS.fernG = { make: (l) => cached('fern', l, () => leafTint(fern(rngG('w-fern')))), mat: M.frond, sink: 0.02, shadow: true };
KINDS.saguaro = { make: (l) => cached('saguaro', l, () => cactus(rngG('w-sag'), 1)), mat: M.solid, sink: 0.05, shadow: true, col: [0.3, 1.0] };
KINDS.fancactus = { make: (l) => cached('fancactus', l, () => fanCactus(rngG('w-fan'))), mat: M.solid, sink: 0.04, shadow: true, col: [0.22, 0.5] };
KINDS.topiary = { make: (l) => cached('topiary', l, () => topiary(801)), mat: M.bush, sink: 0.0, shadow: true, col: [0.36, 0.5] };
KINDS.hedge = { make: (l) => cached('hedge', l, () => hedge(802)), mat: M.bush, sink: 0.05, shadow: true };
// 말랑섬 랜드마크 나무(먼 고리 하나로만 그린다)
KINDS.halmi = { make: (l) => cached('halmi', l, () => halmiTree(rngG('w-halmi'), 961)), mat: M.giant, sink: 0.02, shadow: true, col: [0.34, 1.0] };
KINDS.wishtree = { make: (l) => cached('wishtree', l, () => wishTree(rngG('w-wish'), 962)), mat: M.giant, sink: 0.02, shadow: true, col: [0.34, 1.0] };
// 작은 것들
KINDS.fern = { make: (l) => cached('fern', l, () => leafTint(fern(rngG('w-fern')))), mat: M.frond, sink: 0.02, shadow: false, midKeep: 0.45, gather: 'fern' };
KINDS.bigleaf = { make: (l) => cached('bigleaf', l, () => leafTint(bigLeaf(rngG('w-bigleaf')))), mat: M.frond, sink: 0.02, shadow: true, midKeep: 0.6 };
KINDS.mtuft = { make: (l) => cached('mtuft', l, () => mushroomTuft(rngG('w-mtuft'))), mat: M.shroom, sink: 0.0, shadow: false, gather: 'mushroom' };
KINDS.iceflower = { make: (l) => cached('iceflower', l, () => iceFlower(rngG('w-icefl'))), mat: M.ice, sink: 0.02, shadow: false };
KINDS.barrel = { make: (l) => cached('barrel', l, () => cactus(rngG('w-barrel'), 0)), mat: M.solid, sink: 0.05, shadow: true, gather: 'cactus' };
KINDS.hibiscus = { make: (l) => cached('hibiscus', l, () => hibiscus(rngG('w-hib'), 803)), mat: M.bush, sink: 0.06, shadow: true };
KINDS.snowbush = { make: (l) => cached('snowbush', l, () => snowBush(bush(rngG('w-bush-round'), 'round', 810))), mat: M.bush, sink: 0.08, shadow: true };
KINDS.clover = { make: (l) => cached('clover', l, () => clover(rngG('w-clover'))), mat: M.weed, sink: 0, shadow: false, maxLod: 'hi' };
KINDS.weed = { make: (l) => cached('weed', l, () => weed(rngG('w-weed'))), mat: M.weed, sink: 0, shadow: false, maxLod: 'hi' };
KINDS.meteorfl = { make: (l) => cached('meteorfl', l, () => meteorFlower(rngG('w-meteorfl'))), mat: M.meteor, sink: 0, shadow: false, midKeep: 0.4, gather: 'flower' };
KINDS.pinwheel = { make: (l) => cached('pinwheel', l, () => pinwheel(rngG('w-pinwheel'))), mat: M.spin, sink: 0.02, shadow: true, maxLod: 'mid' };
(['round', 'azalea', 'hydrangea'] as BushKind[]).forEach((b, i) => {
  KINDS['bush-' + b] = { make: (l) => cached('bush-' + b, l, () => bush(rngG('w-bush-' + b), b, 810 + i)), mat: M.bush, sink: 0.08, shadow: true };
});
FL_KINDS.forEach((f) => {
  for (let v = 0; v < 2; v++) KINDS['fl-' + f + v] = { make: (l) => cached('fl-' + f + v, l, () => flower(f, rngG('w-fl-' + f + v))), mat: M.flower, sink: 0, shadow: false, midKeep: 0.4, gather: 'flower' };
  KINDS['glow-' + f] = { make: (l) => cached('fl-' + f + '0', l, () => flower(f, rngG('w-fl-' + f + '0'))), mat: M.glowFl, sink: 0, shadow: false, midKeep: 0.4, gather: 'flower' };
});

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

type Island = typeof import('../../core/island');
type Sample = { h: number; kind: string; theme: Theme; coast: number; inland: number; slope: number; d: import('../../core/island').IslandDef };

/**
 * 나무·풀꽃 배치(순수 — 같은 칸은 언제 다시 불러도 같다). 테스트가 섬별 열매 나무 수를 센다.
 * rng: 칸 키 → 난수(ctx.rng 와 같은 것)
 */
export function makePlanner(island: Island, rng: (k: string) => () => number, keepOut: readonly Circle[]) {
  const B = island.ISLAND_BOUNDS;
  const inVillage = (x: number, z: number, m = 4) => x > B.minX - m && x < B.maxX + m && z > B.minZ - m && z < B.maxZ + m;
  const blocked = (x: number, z: number) => inCircles(keepOut, x, z);
  const nearIsland = (x0: number, z0: number, size: number) => island.ISLANDS.some((d) => {
    const cx = Math.max(x0, Math.min(d.x, x0 + size)), cz = Math.max(z0, Math.min(d.z, z0 + size));
    return Math.hypot(cx - d.x, cz - d.z) < d.r * 1.35;
  });
  const feats = island.worldFeatures();
  const mangroveF = feats.find((f) => f.kind === 'mangrove');
  const sample = (x: number, z: number): Sample | null => {
    const ws = island.worldSample(x, z);
    if (!ws.island || ws.coast <= 0) return null;
    const e = 0.9;
    const gx = island.worldSample(x + e, z).h - ws.h, gz = island.worldSample(x, z + e).h - ws.h;
    const slope = Math.hypot(gx, gz) / e;
    return { h: ws.h, kind: ws.kind, theme: ws.island.theme as Theme, coast: ws.coast, inland: ws.inland, slope, d: ws.island };
  };

  const tintHSL = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l);
  const leafVar = (a: number) => new THREE.Color(1, 1, 1).multiplyScalar(0.92 + a * 0.14);
  const FRUITS: WFruit[] = ['apple', 'peach', 'orange', 'pear', 'cherry'];
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

  function pickTree(s: Sample, forest: number, x: number, z: number, a: number, b: number, c: number, d: number): Item | null {
    const base = { x, z, y: s.h, rot: a * 6.283, tilt: (b - 0.5) * 0.08 };
    const v = c < 0.5 ? 0 : 1;
    const beach = s.kind === 'sand' || s.coast < 26;
    switch (s.theme) {
      case 'home': case 'islet': {
        if (beach) return d < 0.22 && s.coast > 6 ? { ...base, k: (s.theme === 'islet' && c < 0.5 ? 'coco' : 'palm') + v, s: 0.95 + b * 0.35, fruit: s.theme === 'islet' && c < 0.5 ? 'coconut' : undefined } : null;
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
        if (q < 0.34) return { ...base, k: 'fernG', s: 1.8 + b * 2.4, tint: tone };
        if (q < 0.58) return { ...base, k: 'cycad', s: 1.0 + b * 1.6, tint: tone };
        if (q < 0.8) return { ...base, k: 'palm' + v, s: 1.0 + b * 1.3, tint: tone };
        // 은행나무: 초원 가장자리(숲이 옅은 곳)에 노랗게
        if (q < 0.9 && !rocky) return { ...base, k: 'ginkgo' + v, s: 1.1 + b * 0.8, tint: new THREE.Color(1, 1, 1).multiplyScalar(0.94 + a * 0.1), fruit: 'ginkgo' };
        return { ...base, k: 'broad' + v, s: 1.2 + b * 1.4, tint: tone.clone().multiply(new THREE.Color(0.62, 0.78, 0.62)) };
      }
      case 'ice': {
        if (s.h > 90 || s.slope > 0.7) return null;
        const dens = forest > 0 ? 0.8 : 0.42;
        if (d > dens) return null;
        // 눈꽃나무(서리 열매): 숲 가장자리·낮은 곳
        if (c < 0.2 && s.h < 50) return { ...base, k: 'frostberry' + v, s: 0.95 + b * 0.5, tint: new THREE.Color(1, 1, 1).multiplyScalar(0.95 + a * 0.08), fruit: 'frostberry' };
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
        // 동쪽 맹그로브 수로: 물가에 뿌리 나무
        if (mangroveF && Math.hypot(x - mangroveF.x, z - mangroveF.z) < mangroveF.r && s.coast < 60) {
          return d < 0.4 ? { ...base, k: 'mangrove', s: 1.0 + b * 0.5, tilt: base.tilt * 0.5, tint: leafVar(a) } : null;
        }
        if (beach) {
          if (d >= 0.42) return null;
          // 코코넛이 열린 야자가 절반 넘게
          return c < 0.62 ? { ...base, k: 'coco' + v, s: 1.0 + b * 0.5, fruit: 'coconut' } : { ...base, k: 'palm' + v, s: 1.0 + b * 0.5 };
        }
        if (d >= 0.3) return null;
        // 안쪽 정글: 바나나 나무 무리 + 야자
        if (forest > -0.1 && c < 0.55) return { ...base, k: 'banana', s: 0.95 + b * 0.4, fruit: 'banana', tint: leafVar(a) };
        return c < 0.8 ? { ...base, k: 'coco' + v, s: 1.0 + b * 0.5, fruit: 'coconut' } : { ...base, k: 'palm' + v, s: 1.0 + b * 0.5 };
      }
      case 'desert': {
        if (s.kind === 'rock') return d < 0.04 ? { ...base, k: 'saguaro', s: 1.0 + b * 0.6 } : null;
        // 오아시스: 꽃 노이즈 높은 곳에 대추야자 무리
        const oasis = nFlower(x * 0.008 + 3, z * 0.008) > 0.55;
        if (oasis) {
          if (d >= 0.6) return null;
          return c < 0.72 ? { ...base, k: 'date' + v, s: 1.0 + b * 0.5, fruit: 'date' } : { ...base, k: 'palm' + v, s: 1.0 + b * 0.5 };
        }
        if (d < 0.11) return { ...base, k: 'saguaro', s: 0.8 + b * 0.7, tilt: base.tilt * 0.3, tint: new THREE.Color(['#ff7fb0', '#ffd84a', '#ff9a5a', '#ffffff'][Math.floor(a * 3.999)]) };
        if (d < 0.17) return { ...base, k: 'fancactus', s: 0.9 + b * 0.6, tilt: base.tilt * 0.3, tint: new THREE.Color(['#ff8fb8', '#ffd84a', '#ffffff'][Math.floor(a * 2.999)]) };
        return null;
      }
      case 'launch': {
        if (beach || s.kind !== 'grass') return null;
        if (d < 0.1) return { ...base, k: 'topiary', s: 1.0 + b * 0.3, tilt: 0 };
        // 생울타리: 격자 방향으로 다듬어 줄지어
        if (d < 0.3 && forest > -0.15) return { ...base, k: 'hedge', s: 1.0 + b * 0.2, rot: (Math.floor(a * 1.999)) * 1.5708, tilt: 0 };
        // 별사과나무(밤에 열매가 은은히 빛난다)
        if (d < 0.44) return c < 0.72 ? { ...base, k: 'starapple' + v, s: 0.95 + b * 0.4, tint: leafVar(a), fruit: 'starapple' } : { ...base, k: 'broad' + v, s: 1.0 + b * 0.3, tint: leafVar(a) };
        return null;
      }
    }
    return null;
  }

  // ── 나무 배치(청크 하나, 결정적) ───────────────────
  const TREE_CELL = 7;
  const treeCache = new Map<string, Item[]>();
  const treesIn = (cx: number, cz: number, x0: number, z0: number, size: number): Item[] => {
    const key = cx + ',' + cz + ':' + size;
    const hit = treeCache.get(key);
    if (hit) return hit;
    const out: Item[] = [];
    if (nearIsland(x0, z0, size)) {
      const r = rng(`flora-wt:${cx},${cz}`);
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

  // ── 작은 것 배치 ──────────────────────────────────
  function flowerItem(base: { x: number; z: number; y: number; rot: number; tilt: number }, hueN: number, a: number, b: number, glow = false): Item {
    const kind = FL_KINDS[Math.floor(hueN * 2.999)];
    const pal = FLOWER_PAL[Math.floor(hueN * 7.999)];
    return { ...base, k: glow ? 'glow-' + kind : 'fl-' + kind + (b < 0.5 ? 0 : 1), s: 1.4 + b * 0.5, tint: new THREE.Color(pal[a < 0.6 ? 0 : 1]) };
  }
  const METEOR_COL = ['#8fc4ff', '#b9a8ff', '#9fe8ff', '#cfd8ff'];
  const PIN_TINT = ['#ffffff', '#fff2f6', '#f2fbff'];

  function pickSmall(theme: Theme, d: import('../../core/island').IslandDef, kind: string, coast: number, fl: number, hueN: number,
    base: { x: number; z: number; y: number; rot: number; tilt: number }, a: number, b: number, c: number): Item | null {
    switch (theme) {
      case 'launch': {
        if (kind !== 'grass') return null;
        // 남쪽 바람개비 초원(말랑섬 쪽 = +z)
        const south = (base.z - d.z) / d.r;
        if (south > 0.12 && c < 0.016) return { ...base, k: 'pinwheel', s: 1.6 + b * 0.5, tilt: base.tilt * 0.3, tint: new THREE.Color(PIN_TINT[Math.floor(a * 2.999)]) };
        // 유성초(푸른 별꽃) 무리
        if (fl > 0.25 && c < 0.2) return { ...base, k: 'meteorfl', s: 1.3 + b * 0.5, tint: new THREE.Color(METEOR_COL[Math.floor(hueN * 3.999)]) };
        if (c < 0.06) return flowerItem(base, hueN, a, b);
        if (c < 0.1) return { ...base, k: b < 0.6 ? 'clover' : 'weed', s: 1.0 + a * 0.5 };
        return null;
      }
      case 'home': case 'islet': {
        if (kind !== 'grass') return null;
        if (fieldAt(base.x, base.z) > 0.04) {
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
        if (c < (rocky ? 0.03 : 0.11)) return { ...base, k: 'fern', s: 1.1 + b * 1.0, tint: dinoTone(base.x, base.z, a) };
        if (!rocky && c < 0.26) return { ...base, k: 'bigleaf', s: 0.9 + b * 0.6, tint: dinoTone(base.x, base.z, a) };
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

  const smallIn = (cx: number, cz: number, x0: number, z0: number, size: number): Item[] => {
    const out: Item[] = [];
    if (!nearIsland(x0, z0, size)) return out;
    const r = rng(`flora-ws:${cx},${cz}`);
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
      const it = pickSmall(theme, ws.island, ws.kind, ws.coast, flowerN, hueN, base, a, b, c);
      if (it) out.push(it);
    }
    return out;
  };

  return { treesIn, smallIn, sample, inVillage, nearIsland, blocked };
}

/** 이 섬 칸에 열매 나무가 몇 그루인가(테스트·디버그 — 섬 전체 96 m 칸을 다 훑는다) */
export function countFruitTrees(planner: ReturnType<typeof makePlanner>, d: { x: number; z: number; r: number; id: string }, island: Island): Record<string, number> {
  const out: Record<string, number> = {};
  const TS = 96;
  const R = d.r * 1.3;
  for (let cz = Math.floor((d.z - R) / TS); cz <= Math.floor((d.z + R) / TS); cz++) for (let cx = Math.floor((d.x - R) / TS); cx <= Math.floor((d.x + R) / TS); cx++) {
    for (const it of planner.treesIn(cx, cz, cx * TS, cz * TS, TS)) {
      if (!it.fruit) continue;
      if (island.worldSample(it.x, it.z).island?.id !== d.id) continue;
      out[it.fruit] = (out[it.fruit] ?? 0) + 1;
    }
  }
  return out;
}

export interface WorldFlora { landmarks: Item[]; homeTrees: HomeTree[]; keepOut: Circle[] }

export function setupWorldFlora(ctx: Ctx, game: Game, H: Harvest): WorldFlora {
  const { island } = ctx;
  // 다른 모듈(village, order 4)이 먼저 놓은 랜드마크 둘레도 비운다
  const lmAvoid: Circle[] = (game.geo?.landmarks ?? []).filter((l) => l.island !== 'sea').map((l) => ({ x: l.x, z: l.z, r: Math.max(8, l.r * 0.8) }));
  const keepOut = floraKeepOut(island);
  const homeTrees = homeTreeSpots(island, keepOut, lmAvoid);
  // 랜드마크 나무 둘레는 숲으로 덮지 않는다
  const treeKeep = [...keepOut, ...homeTrees.map((t) => ({ x: t.x, z: t.z, r: t.kind === 'halmi' ? 20 : 13 }))];
  const plan = makePlanner(island, ctx.rng, treeKeep);
  const { treesIn, smallIn } = plan;

  // ── 인스턴스 묶음 만들기 ─────────────────────────────
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0), _X = new THREE.Vector3(1, 0, 0);
  const itemMatrix = (it: Item, sink: number, out: THREE.Matrix4) => {
    _q.setFromAxisAngle(_Y, it.rot).multiply(_q2.setFromAxisAngle(_X, it.tilt));
    _p.set(it.x, it.y - sink * it.s, it.z);
    _s.setScalar(it.s);
    return out.compose(_p, _q, _s);
  };
  const lodRank: Record<Lod, number> = { hi: 0, mid: 1, lo: 2 };
  const WHITE = new THREE.Color(1, 1, 1);

  function buildGroup(items: Item[], lod: Lod, shadowOn: boolean) {
    const g = new THREE.Group();
    const byK = new Map<string, Item[]>();
    for (const it of items) {
      const K = KINDS[it.k];
      if (!K || (K.maxLod && lodRank[lod] > lodRank[K.maxLod])) continue;
      if (lod !== 'hi' && K.midKeep !== undefined && ((Math.abs(it.x * 12.9898 + it.z * 78.233) * 43.7585) % 1) > K.midKeep) continue;
      // 먼 고리는 변주를 하나로 합쳐 draw call 을 줄인다(멀면 구분 안 됨)
      let key = it.k;
      if (lod === 'lo' && /^(broad|cedar|palm|snow|gmush|coco|date|starapple|frostberry|ginkgo)1$/.test(key)) key = key.slice(0, -1) + '0';
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
          const fl: Parameters<Harvest['hangFruit']>[1] = [];
          for (const it of items) {
            const K = KINDS[it.k];
            const ref = refs.get(it);
            if (!ref) continue;
            const tm = itemMatrix(it, K.sink, m4).clone();
            let rec: TreeRec | undefined;
            const tk = treeKey(it.x, it.z);
            if (lod === 'hi' && (K.shake || K.chop)) {
              rec = {
                key: tk, kind: it.k, island: ctx.island.worldSample(it.x, it.z).island?.id ?? 'home', x: it.x, y: it.y, z: it.z, s: it.s,
                fruit: it.fruit, shake: !!K.shake, chop: !!K.chop, base: tm, ref, fruits: [], wobT: -1, wobA: 0,
              };
              recs.push(rec);
            }
            if (it.fruit && K.anchors) fl.push({ rec, tm, fruit: it.fruit, key: tk, anchors: K.anchors() });
          }
          H.hangFruit(g, fl);
          if (lod === 'hi') {
            H.addTrees(ck, recs, { x0, z0, size });
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
        H.removeTrees(o.userData.ck as string);
      },
    });
  };
  ring('flora-trees-hi', 'hi', -1, 70);
  ring('flora-trees-mid', 'mid', 70, 150);
  ring('flora-trees-lo', 'lo', 150, 390);

  // 작은 풀꽃: 가까이(hi — 주울 수 있음)·조금 멀리(mid)
  const SS = 32;
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const small = (key: string, lod: Lod, inner: number, outer: number) => game.chunks.add({
    key, size: SS, radius: outer, innerRadius: inner >= 0 ? inner : undefined, detail: true,
    build: ({ cx, cz, x0, z0, size }) => {
      const items = smallIn(cx, cz, x0, z0, size);
      if (!items.length) return null;
      const { g, refs } = buildGroup(items, lod, lod === 'hi');
      if (lod === 'hi') {
        const picks: PickRec[] = [];
        const m4 = new THREE.Matrix4();
        let isl: string | null = null;
        for (const it of items) {
          const K = KINDS[it.k];
          const ref = refs.get(it);
          if (!K?.gather || !ref) continue;
          const key = `p:${Math.round(it.x * 10)},${Math.round(it.z * 10)}`;
          isl ??= ctx.island.worldSample(it.x, it.z).island?.id ?? 'home';
          const base = itemMatrix(it, K.sink, m4).clone();
          picks.push({ key, kind: K.gather, island: isl, x: it.x, y: it.y, z: it.z, base, ref });
          if (H.pickHidden(key)) ref.mesh.setMatrixAt(ref.i, ZERO);
        }
        const ck = key + ':' + cx + ',' + cz;
        if (picks.length) H.addPicks(ck, picks, { x0, z0, size });
        g.userData.ck = ck;
      }
      return g;
    },
    dispose: (o) => { if (o.userData.ck) H.removePicks(o.userData.ck as string); },
  });
  small('flora-small-hi', 'hi', -1, 44);
  small('flora-small-mid', 'mid', 44, 100);

  // 물결 풀: 플레이어 주변만
  const grassGeo = [0, 1, 2].map((v) => { const g = grassTuft(rngG('w-grass2-' + v), 5, 0.24); g.userData.shared = true; return g; });
  const nClump = createNoise2D(mulberry32(5104));
  game.chunks.add({
    key: 'flora-grass', size: 16, radius: 36, detail: true,
    build: ({ cx, cz, x0, z0, size }) => {
      if (!plan.nearIsland(x0, z0, size)) return null;
      const r = ctx.rng(`flora-grass:${cx},${cz}`);
      const lists: Item[][] = [[], [], []];
      const CELL = 0.55;
      const n = Math.round(size / CELL);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = x0 + (i + r()) * CELL, z = z0 + (j + r()) * CELL;
        const a = r(), b = r(), v = Math.floor(r() * 2.999);
        if (plan.inVillage(x, z, 2)) continue;
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
  // 말랑섬은 할미벚·소원나무(homeland.ts), 다른 섬은 대표 식물을 크게
  const LM: Record<string, { k: string; s: number; tint?: string }> = {
    dino: { k: 'cycad', s: 9 }, ice: { k: 'snow1', s: 9, tint: '#bfe8dc' },
    mushroom: { k: 'gmush0', s: 9, tint: '#ff7fb0' }, coral: { k: 'palm0', s: 7 }, desert: { k: 'saguaro', s: 7, tint: '#ff7fb0' },
  };
  const landmarks: Item[] = [];
  for (const d of island.ISLANDS) {
    const L = LM[d.theme];
    if (!L) continue;
    const pts = island.islandSpawnPoints(d.id, 14, 0.28);
    let best: { x: number; z: number } | null = null, bh = -1e9;
    for (const p of pts) {
      const s = plan.sample(p.x, p.z);
      if (!s || s.slope > 0.5 || s.kind === 'lava' || inCircles(keepOut, p.x, p.z) || inCircles(lmAvoid, p.x, p.z)) continue;
      const score = s.h * (d.theme === 'ice' || d.theme === 'dino' ? -1 : 1);
      if (score > bh) { bh = score; best = p; }
    }
    if (!best) continue;
    landmarks.push({ k: L.k, x: best.x, z: best.z, y: island.heightAt(best.x, best.z), rot: 0.7, s: L.s, tilt: 0, tint: L.tint ? new THREE.Color(L.tint) : undefined });
  }
  for (const t of homeTrees) landmarks.push({ k: t.kind, x: t.x, z: t.z, y: t.y, rot: t.rot, s: t.s, tilt: 0 });
  for (const it of landmarks) {
    const c = KINDS[it.k].col;
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
  // 할미벚 꽃잎 비 + 랜드마크 등록(geo: worldterrain, order 2 → 지금 있다)
  const halmi = homeTrees.find((t) => t.kind === 'halmi');
  if (halmi) halmiPetals(ctx, game, halmi);
  for (const l of homeLandmarks(homeTrees)) game.geo?.addLandmark?.(l);

  game.onUpdate(() => { footPos.value.set(game.player.pos.x, game.player.pos.z); });
  return { landmarks, homeTrees, keepOut };
}

/** 시간대 → 발광 세기 */
export function floraTod(name: string) {
  glowLevel.value = name === 'night' ? 1 : name === 'sunset' ? 0.35 : name === 'morning' ? 0.08 : 0;
}
