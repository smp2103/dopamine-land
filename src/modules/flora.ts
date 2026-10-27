// 식물: 활엽수(과일)·삼나무·야자수·덤불·꽃·클로버/잡초. 모두 InstancedMesh, 바람은 정점 셰이더.
// 마을(룩 테스트 장면) 식물은 여기서, 섬 식생은 flora/world.ts 청크가 만든다. 채집(흔들기 E·베기 F·돌 두드리기 E·꽃/버섯 줍기)은 flora/harvest.ts·rocks.ts.
//
// game.ext.flora = {
//   trees(): Array<{key, kind, island, x, z, fruit?, shaken, chopsLeft}>   — 지금 가까이 살아 있는(흔들·벨 수 있는) 나무
//   rocks(): Array<{key, id, island, x, z, hits, left, broken}>            — 섬마다 두드릴 돌 5개(전부)
//   nearestTree(x?, z?, maxD?): 위 한 줄 | null
//   shakeNearest(), chopNearest(): {key, kind, x, z} | null                — 가장 가까운 나무(4 m 안)를 흔들기/베기
//   hitNearest(maxD = 6): {ok, key, item, n, combo, left, broken, why?} | null
//   breakRock(key): boolean                                                — 공룡 돌진 등으로 그날 돌을 부순다(이미 부서졌으면 false)
//   gatherNearest(): {key, kind, ok} | null
// }
// window.__flora = 위 + 마을 통계(trees·broad·cedar·palm·bushes·flowers·weeds·badVerts·tris)
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { floraMat, floraTime } from './flora/mat';
import { setupWorldFlora, floraTod } from './flora/world';
import { floraBad } from './flora/geo';
import { broadleaf, cedar, palm, bush, flower, clover, weed, res, type Anchor, type BushKind, type FlowerKind } from './flora/shapes';
import { makeServices, setupHarvest, treeKey, type Harvest, type TreeRec, type PickRec } from './flora/harvest';
import { setupRocks, type Rocks } from './flora/rocks';
import { makeFx } from './flora/fx';
import { chopsLeft, shakenToday } from './flora/logic';
import type { WFruit } from './flora/data';

export const order = 6;

interface Item { x: number; z: number; y: number; rot: number; s: number; variant: number; tint?: THREE.Color; extra?: number }
type Refs = Map<Item, { mesh: THREE.InstancedMesh; i: number }>;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
function itemMatrix(it: Item, sink: number, out = _m) {
  _q.setFromAxisAngle(_Y, it.rot);
  _p.set(it.x, it.y - sink * it.s, it.z);
  _s.setScalar(it.s);
  return out.compose(_p, _q, _s);
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], sink: number, opts: { shadow?: boolean; receive?: boolean } = {}, refs?: Refs) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, itemMatrix(it, sink));
    if (it.tint) mesh.setColorAt(i, it.tint);
    refs?.set(it, { mesh, i });
  });
  if (items.some((i) => i.tint)) for (let i = 0; i < items.length; i++) if (!items[i].tint) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
  mesh.castShadow = opts.shadow ?? true;
  mesh.receiveShadow = opts.receive ?? true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** 카메라들이 가까이 보는 곳(여기서 가까우면 고해상도) */
const FOCUS = [{ x: 0, z: -0.6 }, { x: -4.6, z: 2 }, { x: 12.5, z: 3.5 }, { x: -3, z: -8 }];
const isNear = (it: { x: number; z: number }) => FOCUS.some((f) => (it.x - f.x) ** 2 + (it.z - f.z) ** 2 < 12 * 12);

/** 가까운 것·먼 것을 다른 해상도로(refs 를 주면 항목 → 인스턴스 자리를 적는다) */
function addLod(root: THREE.Group, make: () => THREE.BufferGeometry, mat: THREE.Material, items: Item[], sink: number, opts: { shadow?: boolean; farShadow?: boolean } = {}, refs?: Refs) {
  const nearIts = items.filter(isNear), farIts = items.filter((i) => !isNear(i));
  for (const [hi, its] of [[true, nearIts], [false, farIts]] as const) {
    if (!its.length) continue;
    res.hi = hi;
    root.add(instanced(make(), mat, its, sink, { ...opts, shadow: hi ? opts.shadow : (opts.farShadow ?? opts.shadow) }, refs));
  }
  res.hi = true;
}

export default function build(ctx: Ctx) {
  const { island, rng } = ctx;
  const root = new THREE.Group();
  root.name = 'flora';
  const H = island.HERO;
  const rnd = rng('flora');

  const near = (x: number, z: number, p: { x: number; z: number }, r: number) => (x - p.x) ** 2 + (z - p.z) ** 2 < r * r;
  const heroFree = (x: number, z: number, r: number) =>
    !near(x, z, H.player, H.clearRadius) && !near(x, z, H.chest, r) && !near(x, z, H.villager, r) && !near(x, z, H.fishing, r + 0.6);
  const grassOK = (x: number, z: number, m: number) => island.isBuildable(x, z, m) && island.surfaceAt(x, z).kind === 'grass';

  /** 지정 좌표를 점유 등록(다른 모듈이 피하도록) */
  const pin = (key: string, x: number, z: number, r: number, ok: (x: number, z: number) => boolean) => {
    // 다른 모듈이 먼저 잡은 자리면 가까운 빈 곳으로 비킨다
    for (let k = 0; k < 24; k++) {
      const a = k * 2.4, d = k === 0 ? 0 : 0.35 * Math.sqrt(k);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!ok(px, pz)) continue;
      const got = ctx.scatter({ key: key + ':' + k, count: 1, minDist: 0.01, bounds: { minX: px - 1e-3, maxX: px + 1e-3, minZ: pz - 1e-3, maxZ: pz + 1e-3 }, accept: () => true, occupy: r });
      if (got.length) return got[0];
    }
    return null;
  };
  /** 'ac' 화면 한가운데 — 무작위 배치는 피하고 지정 배치만 */
  const inFrame = (x: number, z: number, pad = 0) => x > -8 - pad && x < 9 + pad && z > -8.5 - pad && z < 5 + pad;

  // ── 나무 자리 ─────────────────────────────────────
  const trees: Array<Item & { kind: 'broad' | 'cedar' | 'palm'; fruit?: WFruit }> = [];
  // 'ac' 화면 안 주인공 나무들(플레이어 뒤·옆)
  const HERO_TREES: Array<{ x: number; z: number; fruit?: WFruit; s: number }> = [
    { x: -4.0, z: -4.0, s: 1.0 },
    { x: 3.8, z: -5.2, fruit: 'peach', s: 0.95 },
    { x: 7.0, z: 1.4, fruit: 'apple', s: 0.92 },
    { x: -0.8, z: -8.6, s: 1.05 },
  ];
  for (const [i, t] of HERO_TREES.entries()) {
    const p = pin('flora-hero-tree-' + i, t.x, t.z, 1.6, (x, z) => grassOK(x, z, 0.6) && heroFree(x, z, 1.8));
    if (p) trees.push({ kind: 'broad', x: p.x, z: p.z, y: p.y, rot: rnd() * 6.28, s: t.s, variant: i % 4, fruit: t.fruit });
  }
  const FRUITS: WFruit[] = ['apple', 'peach', 'orange', 'pear'];
  // 숲: 무리(그로브) 중심을 뿌리고 둘레에 3~5그루씩 — 사이사이 빈 들판이 남는다
  const broadOK = (x: number, z: number) => {
    const s = island.surfaceAt(x, z);
    return s.tier === 1 && s.coastDist > 5.2 && grassOK(x, z, 0.8) && heroFree(x, z, 2.2) && !inFrame(x, z, 1.5)
      && !trees.some((t) => near(x, z, t, 2.7));
  };
  const groves = ctx.scatter({
    key: 'flora-groves', count: 11, minDist: 7.5, occupy: 0,
    accept: (x, z) => { const s = island.surfaceAt(x, z); return s.tier === 1 && s.coastDist > 6 && !inFrame(x, z, 2.5); },
  });
  const rb = rng('flora-broad-attr');
  for (const [gi, g] of groves.entries()) {
    const want = 3 + Math.floor(rb() * 3);
    const groveFruit = rb() < 0.35 ? FRUITS[Math.floor(rb() * FRUITS.length)] : undefined;
    let got = 0;
    for (let k = 0; k < 40 && got < want; k++) {
      const a = rb() * 6.28, d = 1.2 + rb() * 3.2;
      const x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d;
      if (!broadOK(x, z)) continue;
      const p = pin('flora-grove-' + gi + '-' + k, x, z, 1.5, broadOK);
      if (!p) continue;
      got++;
      const fr = groveFruit && rb() < 0.7 ? groveFruit : undefined;
      trees.push({ kind: 'broad', ...p, rot: rb() * 6.28, s: 0.84 + rb() * 0.26, variant: Math.floor(rb() * 4), fruit: fr });
    }
  }
  const cedarPts = ctx.scatter({
    key: 'flora-cedar', count: 12, minDist: 2.8, occupy: 1.3,
    accept: (x, z) => island.surfaceAt(x, z).tier === 2 && grassOK(x, z, 0.8),
  });
  const rc = rng('flora-cedar-attr');
  for (const p of cedarPts) trees.push({ kind: 'cedar', ...p, rot: rc() * 6.28, s: 0.85 + rc() * 0.3, variant: Math.floor(rc() * 3) });
  const palmOK = (x: number, z: number) => {
    const s = island.surfaceAt(x, z);
    return s.kind === 'sand' && s.coastDist > 0.9 && s.coastDist < 3.4 && island.isBuildable(x, z, 0.4) && heroFree(x, z, 1.5);
  };
  // 'beach' 화면 안 야자수
  const palmPts: Array<{ x: number; y: number; z: number }> = [];
  for (const [i, hp] of [{ x: 10, z: 1.6 }, { x: 8.2, z: 5.2 }, { x: 12.2, z: -4.3 }].entries()) {
    const p = pin('flora-hero-palm-' + i, hp.x, hp.z, 1.2, palmOK);
    if (p) palmPts.push(p);
  }
  palmPts.push(...ctx.scatter({
    key: 'flora-palm', count: 9, minDist: 3.8, occupy: 1.2,
    accept: (x, z) => palmOK(x, z) && !palmPts.some((p) => near(x, z, p, 3.8)),
  }));
  const rp = rng('flora-palm-attr');
  for (const p of palmPts) {
    // 바다 쪽으로 기울게: 해안 바깥 방향을 찾는다
    const e = 0.5;
    const gx = island.coastDistAt(p.x + e, p.z) - island.coastDistAt(p.x - e, p.z);
    const gz = island.coastDistAt(p.x, p.z + e) - island.coastDistAt(p.x, p.z - e);
    const outA = Math.atan2(-gz, -gx); // 바다 방향(xz 각)
    // 줄기는 로컬 +x 로 휜다 → +x 를 바다 방향으로
    trees.push({ kind: 'palm', ...p, rot: -outA + (rp() - 0.5) * 1.2, s: 0.9 + rp() * 0.2, variant: Math.floor(rp() * 3) });
  }

  // ── 나무 메시 ─────────────────────────────────────
  const broadMat = floraMat('broad', { sway: 0.05, swayBase: 1.6, swayH: 2.6, speed: 1.1, rustle: 0.012, rough: 0.82, sheen: 0.5, sheenColor: '#d9ff9a' });
  const cedarMat = floraMat('cedar', { sway: 0.04, swayBase: 1.0, swayH: 3.2, speed: 1.0, rustle: 0.006, rough: 0.85, sheen: 0.35, sheenColor: '#bff0b0' });
  const palmMat = floraMat('palm', { sway: 0.09, swayBase: 1.5, swayH: 2.2, speed: 1.3, rustle: 0.01, rough: 0.8, side: THREE.DoubleSide });
  const rv = rng('flora-variants');
  const leafTint = (r: () => number) => new THREE.Color().setHSL(0.0 + (r() - 0.5) * 0.03, 0, 1).multiplyScalar(0.94 + r() * 0.12)
    .lerp(new THREE.Color(r() < 0.5 ? '#f4ffd8' : '#e2fff0'), 0.25);

  const broadAnchors: Anchor[][] = [];
  // 나무 → 인스턴스 자리(흔들기·베기 등록용)
  const treeRefs: Refs = new Map();
  const tinted = new Map<Item, Item>();
  const withTint = (t: Item) => { const c = { ...t, tint: leafTint(rv) }; tinted.set(c, t); return c; };
  for (let v = 0; v < 4; v++) {
    broadAnchors.push(broadleaf(rng('flora-broad-v' + v), 18, 100 + v, true).anchors);
    const its = trees.filter((t) => t.kind === 'broad' && t.variant === v).map(withTint);
    addLod(root, () => broadleaf(rng('flora-broad-v' + v), res.hi ? 18 : 9, 100 + v, res.hi).geo, broadMat, its, 0.04, {}, treeRefs);
  }
  for (let v = 0; v < 3; v++) {
    const its = trees.filter((t) => t.kind === 'cedar' && t.variant === v).map(withTint);
    addLod(root, () => cedar(rng('flora-cedar-v' + v), 200 + v).geo, cedarMat, its, 0.04, {}, treeRefs);
  }
  for (let v = 0; v < 3; v++) {
    const its = trees.filter((t) => t.kind === 'palm' && t.variant === v).map(withTint);
    addLod(root, () => palm(rng('flora-palm-v' + v)).geo, palmMat, its, 0.04, {}, treeRefs);
  }
  /** 원래 나무 항목 → 인스턴스 자리 */
  const refOf = new Map<Item, { mesh: THREE.InstancedMesh; i: number }>();
  for (const [c, r] of treeRefs) refOf.set(tinted.get(c) ?? c, r);

  // ── 덤불 ──────────────────────────────────────────
  const BUSH_TINT: Record<BushKind, string[]> = {
    round: ['#ffffff'],
    azalea: ['#ff8fb8', '#ffffff', '#ff6f9a', '#ffb3cf'],
    hydrangea: ['#8fb2ff', '#c79cff', '#ff9fd0', '#a6c8ff'],
  };
  const bushes: Item[] = [];
  const HERO_BUSH = [
    { x: -2.3, z: 3.6, v: 1, c: '#ff8fb8' }, { x: 5.2, z: -3.2, v: 2, c: '#9bb8ff' }, { x: 6.0, z: -2.2, v: 0, c: '#ffffff' },
    { x: -5.4, z: -6.6, v: 0, c: '#ffffff' }, { x: 1.4, z: -6.6, v: 1, c: '#ffffff' },
  ];
  for (const [i, b] of HERO_BUSH.entries()) {
    const p = pin('flora-hero-bush-' + i, b.x, b.z, 0.8, (x, z) => grassOK(x, z, 0.4) && heroFree(x, z, 1.0) && !trees.some((t) => near(x, z, t, 1.3)));
    if (p) bushes.push({ ...p, rot: rnd() * 6.28, s: 1.0, variant: b.v, tint: new THREE.Color(b.c) });
  }
  const bushPts = ctx.scatter({
    key: 'flora-bush', count: 22, minDist: 2.6, occupy: 0.8,
    accept: (x, z) => grassOK(x, z, 0.5) && heroFree(x, z, 1.4) && island.surfaceAt(x, z).coastDist > 4.6 && !inFrame(x, z),
  });
  const rbu = rng('flora-bush-attr');
  for (const p of bushPts) {
    const v = Math.floor(rbu() * 3);
    const kind: BushKind = (['round', 'azalea', 'hydrangea'] as const)[v];
    const tl = BUSH_TINT[kind];
    bushes.push({ ...p, rot: rbu() * 6.28, s: 0.85 + rbu() * 0.3, variant: v, tint: new THREE.Color(tl[Math.floor(rbu() * tl.length)]) });
  }
  const bushMat = floraMat('bush', { sway: 0.012, swayBase: 0.2, swayH: 0.8, speed: 1.2, rustle: 0.006, rough: 0.85, sheen: 0.45, sheenColor: '#d9ff9a', side: THREE.DoubleSide });
  (['round', 'azalea', 'hydrangea'] as const).forEach((kind, v) => {
    const its = bushes.filter((b) => b.variant === v);
    addLod(root, () => bush(rng('flora-bushgeo-' + v), kind, 300 + v), bushMat, its, 0.08);
  });

  // ── 꽃 무리 ───────────────────────────────────────
  const FLOWER_COLORS: Record<FlowerKind, string[]> = {
    cosmos: ['#ff8fb5', '#fff6f2', '#ff5d73', '#ffd84a', '#ffa64a', '#d9a8ff'],
    tulip: ['#ff4f5e', '#ffd23f', '#fff4ec', '#ff9cc2', '#ff8a3a', '#b07cff'],
    pansy: ['#9b7bff', '#6f8dff', '#ffd84a', '#ff5d6a', '#fff4ec', '#ff9a4a'],
  };
  const KINDS: FlowerKind[] = ['cosmos', 'tulip', 'pansy'];
  const flowers: Item[] = [];
  const rf = rng('flora-flowers');
  const plantCluster = (cx: number, cz: number, kind: number, n: number, cols: string[], radius: number) => {
    const pts: Array<{ x: number; z: number }> = [];
    for (let tries = 0; tries < n * 30 && pts.length < n; tries++) {
      const a = rf() * 6.28, d = Math.sqrt(rf()) * radius;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (pts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 0.34 * 0.34)) continue;
      if (bushes.some((b) => near(x, z, b, 0.75))) continue;
      if (!island.isBuildable(x, z, 0.25) || near(x, z, H.player, H.clearRadius) || near(x, z, H.chest, 0.9) || near(x, z, H.villager, 0.9)) continue;
      if (trees.some((t) => near(x, z, t, t.kind === 'palm' ? 0.4 : 0.55))) continue;
      pts.push({ x, z });
      flowers.push({ x, z, y: island.heightAt(x, z), rot: rf() * 6.28, s: 1.25 + rf() * 0.25, variant: kind * 4 + Math.floor(rf() * 4),
        tint: new THREE.Color(cols[Math.floor(rf() * cols.length)]) });
    }
  };
  // 'ac' 화면 안 꽃밭
  const HERO_FLOWERS = [
    { x: -0.9, z: 3.6, k: 0, c: ['#ff8fb5', '#fff6f2'] },
    { x: 3.3, z: 2.0, k: 1, c: ['#ff4f5e', '#ffd23f'] },
    { x: 1.2, z: -3.9, k: 2, c: ['#9b7bff', '#ffd84a'] },
    { x: -2.0, z: -5.4, k: 1, c: ['#fff4ec', '#ff9cc2'] },
    { x: 5.0, z: 0.0, k: 0, c: ['#ffd84a', '#ffa64a'] },
    { x: -3.4, z: -1.0, k: 2, c: ['#6f8dff', '#fff4ec'] },
  ];
  for (const [i, f] of HERO_FLOWERS.entries()) {
    const p = pin('flora-hero-flowers-' + i, f.x, f.z, 0.9, (x, z) => island.isBuildable(x, z, 0.3));
    if (p) plantCluster(p.x, p.z, f.k, 11, f.c, 0.85);
  }
  const clusterPts = ctx.scatter({
    key: 'flora-flower-clusters', count: 34, minDist: 3.2, occupy: 0.9,
    accept: (x, z) => island.isBuildable(x, z, 0.5) && heroFree(x, z, 1.2) && island.surfaceAt(x, z).kind === 'grass' && !inFrame(x, z, -1),
  });
  for (const c of clusterPts) {
    const k = Math.floor(rf() * 3);
    const pal = FLOWER_COLORS[KINDS[k]];
    const c1 = pal[Math.floor(rf() * pal.length)], c2 = pal[Math.floor(rf() * pal.length)];
    plantCluster(c.x, c.z, k, 6 + Math.floor(rf() * 7), rf() < 0.6 ? [c1] : [c1, c2], 0.7);
  }
  const flowerMat = floraMat('flower', { sway: 0.035, swayBase: 0.05, swayH: 0.32, speed: 1.9, rough: 0.7, side: THREE.DoubleSide });
  const flowerRefs: Refs = new Map();
  for (let v = 0; v < 12; v++) {
    const its = flowers.filter((f) => f.variant === v);
    if (!its.length) continue;
    addLod(root, () => flower(KINDS[Math.floor(v / 4)], rng('flora-flowergeo-' + v)), flowerMat, its, 0.0, { farShadow: false }, flowerRefs);
  }

  // ── 클로버·잡초 ───────────────────────────────────
  const weedPts = ctx.scatter({
    key: 'flora-weeds', count: 90, minDist: 1.4, occupy: 0,
    accept: (x, z) => island.isBuildable(x, z, 0.2) && island.surfaceAt(x, z).kind === 'grass' && !near(x, z, H.player, 1.8),
  });
  const rw = rng('flora-weed-attr');
  const weeds: Item[] = weedPts.filter((p) => !trees.some((t) => near(p.x, p.z, t, 0.6)))
    .map((p) => ({ ...p, rot: rw() * 6.28, s: 0.9 + rw() * 0.5, variant: Math.floor(rw() * 4) }));
  const weedMat = floraMat('weed', { sway: 0.02, swayBase: 0.0, swayH: 0.2, speed: 2.1, rough: 0.8, side: THREE.DoubleSide });
  for (let v = 0; v < 4; v++) {
    const its = weeds.filter((w) => w.variant === v);
    if (!its.length) continue;
    const g = v < 2 ? clover(rng('flora-clover-' + v)) : weed(rng('flora-weed-' + v));
    root.add(instanced(g, weedMat, its, 0.0, { shadow: false }));
  }

  ctx.onUpdate((t) => { floraTime.value = t; });
  floraTod(ctx.tod);
  ctx.onTod((name) => floraTod(name));
  // 게임 모드: 채집 + 모든 섬의 식생을 청크 스트리밍으로(마을 밖)
  let api: Record<string, unknown> = {};
  if (ctx.game) {
    const game = ctx.game;
    const S = makeServices(ctx, game);
    const fx = makeFx(game, (k) => ctx.rng(k));
    const H = setupHarvest(S, fx);
    // 마을 나무(주인공 나무 포함)도 흔들고 벨 수 있게 등록
    const recs: TreeRec[] = [];
    const fl: Parameters<Harvest['hangFruit']>[1] = [];
    const fruitRoot = new THREE.Group();
    fruitRoot.name = 'flora-village-fruit';
    for (const t of trees) {
      const ref = refOf.get(t);
      if (!ref) continue;
      const tm = itemMatrix(t, 0.04, new THREE.Matrix4());
      const key = treeKey(t.x, t.z);
      const rec: TreeRec = {
        key, kind: t.kind + t.variant, island: 'home', x: t.x, y: t.y, z: t.z, s: t.s, fruit: t.fruit,
        shake: true, chop: true, base: tm, ref, fruits: [], wobT: -1, wobA: 0,
      };
      recs.push(rec);
      if (t.fruit && t.kind === 'broad') fl.push({ rec, tm, fruit: t.fruit, key, anchors: broadAnchors[t.variant] });
    }
    H.hangFruit(fruitRoot, fl);
    root.add(fruitRoot);
    const B = island.ISLAND_BOUNDS;
    H.addTrees('flora-village', recs, { x0: B.minX, z0: B.minZ, size: Math.max(B.maxX - B.minX, B.maxZ - B.minZ) });
    // 마을 꽃도 줍기(오늘 주운 꽃은 숨김)
    const picks: PickRec[] = [];
    const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [f, ref] of flowerRefs) {
      const key = `p:${Math.round(f.x * 10)},${Math.round(f.z * 10)}`;
      picks.push({ key, kind: 'flower', island: 'home', x: f.x, y: f.y, z: f.z, base: itemMatrix(f, 0, new THREE.Matrix4()), ref });
      if (H.pickHidden(key)) ref.mesh.setMatrixAt(ref.i, ZERO);
    }
    H.addPicks('flora-village-flowers', picks, { x0: B.minX, z0: B.minZ, size: Math.max(B.maxX - B.minX, B.maxZ - B.minZ) });
    const W = setupWorldFlora(ctx, game, H);
    const R: Rocks = setupRocks(S, fx, W.keepOut);
    const treeInfo = (r: TreeRec) => ({
      key: r.key, kind: r.kind, island: r.island, x: r.x, z: r.z, fruit: r.fruit,
      shaken: shakenToday(S.flags(), r.key, S.day()), chopsLeft: chopsLeft(S.flags(), r.key, S.day()),
    });
    const near = (want: (r: TreeRec) => boolean) => H.nearestTree(game.player.pos.x, game.player.pos.z, 4, want)?.rec ?? null;
    const ext = {
      trees: () => H.trees().map(treeInfo),
      rocks: () => R.rocks(),
      nearestTree: (x = game.player.pos.x, z = game.player.pos.z, maxD = 4) => { const h = H.nearestTree(x, z, maxD); return h ? { ...treeInfo(h.rec), d: h.d } : null; },
      shakeNearest: () => { const r = near((t) => t.shake); if (r) H.shake(r); return r ? treeInfo(r) : null; },
      chopNearest: () => { const r = near((t) => t.chop); if (r) H.chop(r); return r ? treeInfo(r) : null; },
      hitNearest: (maxD?: number) => R.hitNearest(maxD),
      hitRock: (key: string) => R.hit(key),
      breakRock: (key: string) => R.breakRock(key),
      gatherNearest: () => (H as Harvest & { gatherNearest?: () => unknown }).gatherNearest?.() ?? null,
      drops: () => H.drops(),
      fx: () => fx.live(),
      homeTrees: () => W.homeTrees.map((t) => ({ kind: t.kind, x: t.x, z: t.z, s: t.s })),
      flags: () => S.flags(),
      day: () => S.day(),
    };
    game.ext.flora = ext;
    api = ext;
  }
  (window as unknown as { __flora?: unknown }).__flora = {
    ...api,
    village: {
      trees: trees.length, broad: trees.filter((t) => t.kind === 'broad').length, cedar: cedarPts.length, palm: palmPts.length,
      bushes: bushes.length, flowers: flowers.length, weeds: weeds.length, badVerts: floraBad.n,
      tris: root.children.filter((m) => (m as THREE.InstancedMesh).isInstancedMesh).map((m) => {
        const im = m as THREE.InstancedMesh;
        return (im.material as THREE.Material).customProgramCacheKey().split('|')[0] + ':' + (im.geometry.index!.count / 3) + 'x' + im.count;
      }),
    },
  };
  return root;
}
