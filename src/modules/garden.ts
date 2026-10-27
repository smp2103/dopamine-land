// garden — 꽃밭 P1(GDD 3.4 P1 · 4.12): 말랑섬 풀밭에 씨앗 심기(E) → 물뿌리개·비로 물 준 날마다 자란다(꽃 3단계, 사과 묘목 5일이면 열매 나무 — 흔들기 E).
// 이웃한 활짝 핀 꽃 둘이 같은 날 물을 먹으면 다음 날 변이 색 꽃(황금장미 1%). 민들레 홀씨 불기(E) → 다음 날 근처에 들꽃.
// 클로버 덤불 살펴보기(E): 덤불마다 하루 0.5% 네잎(줄기 하나) → econ.addBuff('clover', 120)(economy 가 rollCatch 반짝이 배율로 넘긴다).
// 모래시계섬 회전초는 바람 따라 굴러가고, 잡으면(E) 나무상자. 과일을 먹으면(바위 앞·사과나무 흔든 뒤 E 먹고 힘내기, 또는 어디서든 econ.use → 'use' 이벤트) 힘 게이지 한 칸 —
// 가득(3)이면 섬마다 숨은 곳 옆 샛길의 큰 바위 3개를 부숴(E) 재료를 얻는다(다음 날 다시 선다).
// 꽃밭 칸만 garden 몫이고, 마당 가구(울타리·꽃밭 조각 …)는 islanddev 몫이다(그 마당 자리엔 심지 않는다).
// 그리기: 꽃밭·민들레·클로버·바위는 청크 스트리밍 + InstancedMesh, 장식 풀 숲은 detail 레이어.
//
// game.ext.garden (주인: garden) = {
//   plots(): Plot[](복사)   plant(seed, x, z): Plot | null   water(x?, z?): number(적신 칸 수)   power(): {value, max}
//   boulders(): [{key, island, secret, x, z, up}]   breakBoulder(key): {ok, why?, loot?}   soilOk(x, z): boolean
//   stats(): flags.garden.stats   gardenSpot(): 꽃밭 하기 좋은 자리(말랑섬 집 근처)
// }
// flags.garden = { v, day, seq, plots[], blown{key:{d,x,z}}, clover{key:day}, power, boulders{key:day}, tumble{day,caught,spawned}, sel, rain, stats }
// 이벤트: harvest{kind:'flower'|'shake'|'rock'} · tree-shake · rock-hit · place{item: seed, where: 'garden'} · (econ.openChest 가 chest-open)
// 디버그: window.__garden = { state(), plant(seed?, x?, z?), water(), nextDay(n?), pick(id?), shake(id?), dig(id?), eat(id?), feed(n?), seed(n?),
//          boulders(), gotoBoulder(island?, i?), breakNearest(), clovers(), searchClover(key?), dandelions(), blow(key?),
//          tumbles(), spawnTumble(near?), catchTumble(), gardenSpot(), gotoGarden(), rain(), refresh(), hour() }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { DAY_SEC, HOUR_SEC, START_HOUR } from '../core/api';
import { applyCurve } from '../core/curve';
import { rngFor } from '../core/rng';
import * as Island from '../core/island';
import {
  APPLE_DROP, BLOOM, BOULDER, BOULDER_SPECIAL, CLOVER, DANDELION, EAT_AFTER_SHAKE, EAT_FRUITS, GOLDEN_STARS, KIND_ICON, KIND_NAME, POWER_MAX, SEEDS, SEED_KIND, SEED_NAME,
  STAGE_NAME, TUFTS, TUMBLE, APPLE_DAYS, colorHex, colorName, isSeed, type SeedId,
} from './garden/data';
import {
  normalizeFlags, canPlant, plant as plantPlot, waterAt, rainWater, advanceDays, pickPetals, shakeTree, hasApples, dig as digPlot,
  needsWater, isFlower, snapCell, gardenSoil, islandProbe, wildChunk, tuftChunk, fourLeafSprigs, boulderSpots, boulderUp, boulderLoot,
  addPower, spendPower, windAt, spawnTumble, stepTumble, dryAt,
  type GardenFlags, type Plot, type WildChunk, type BoulderSpot, type Tumble, type DayReport,
} from './garden/logic';
import { geo, materials, instanced, mat4, points, STEM_H, STEM_SCALE, HEAD_SCALE, type Inst } from './garden/models';

export const order = 32;

type XZ = { x: number; z: number };
interface Box { group: THREE.Group; cx: number; cz: number; x0: number; z0: number; size: number }
/** 바람에 살랑이는 인스턴스 — pivot 이 있으면 꽃송이(줄기 바닥 y 에서 pivot 만큼 위) */
interface Sway { mesh: THREE.InstancedMesh; i: number; x: number; y: number; z: number; rot: number; s: number | [number, number, number]; ph: number; amp: number; plot?: string; pivot?: number }
interface Fx { update(t: number, dt: number): boolean; dispose(): void }

const WET = new THREE.Color(0.66, 0.58, 0.56);
const DRY = new THREE.Color(1, 1, 1);
const RAINY = new Set(['rain', 'storm']);

export default function build(ctx: Ctx) {
  const root = new THREE.Group();
  root.name = 'garden';
  const game = ctx.game;
  if (!game) return root;
  const g = game;
  const st = g.state;
  const M = materials();

  // ───────────── 저장 ─────────────
  const dayNow = () => Math.floor(g.env?.day ?? g.econ?.day?.() ?? 0);
  const hourNow = () => g.env?.hour ?? (START_HOUR + g.time / HOUR_SEC) % 24;
  let flagsObj: GardenFlags | null = null;
  const F = (): GardenFlags => {
    if (!flagsObj || st.flags.garden !== flagsObj) { flagsObj = normalizeFlags(st.flags.garden, dayNow()); st.flags.garden = flagsObj; }
    return flagsObj;
  };
  const save = () => st.save();
  const toast = (s: string) => g.ui.toast(s);
  const sfx = (name: string, o?: { x?: number; z?: number; vol?: number; pitch?: number }) => { try { g.audio?.sfx(name, o); } catch { /* 소리 없음 */ } };
  const emit = (e: Parameters<typeof st.emit>[0]) => st.emit(e);

  // ───────────── 경제(없으면 state 로) ─────────────
  const unlocked = (k: string) => { try { return g.econ?.isUnlocked?.(k) ?? true; } catch { return true; } };
  const give = (id: string, n: number, why: string): number => {
    if (n <= 0) return 0;
    if (id === 'coins') { st.addCoins(n, why); return n; }
    const e = g.econ;
    if (e && typeof e.give === 'function') return e.give(id, n, why);
    st.addItem(id, n);
    return n;
  };
  const hasCan = () => unlocked('tool:wateringcan') || st.has('tool_wateringcan');

  // ───────────── 땅 검사 ─────────────
  /** 꽃밭으로 못 쓰는 자리(건물·부두·다리·동굴·시설 …) — 한 번 계산 */
  let reservedCache: Array<XZ & { r: number }> | null = null;
  const reserved = () => {
    if (reservedCache) return reservedCache;
    const P = Island.PLACES;
    const out: Array<XZ & { r: number }> = [];
    const add = (p: XZ | null | undefined, r: number) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) out.push({ x: p.x, z: p.z, r }); };
    add(P.shop, 6.5); add(P.museum, 8.5); add(P.workbench, 2.6); add(P.townBoard, 2.6); add(P.pier, 5); add(P.boatDock, 6); add(P.bikeRack, 2.6);
    const safe = (f: () => void) => { try { f(); } catch { /* 계산 실패한 자리는 건너뛴다 */ } };
    safe(() => add(P.house, 10)); safe(() => add(P.mailbox, 2.2)); safe(() => add(P.shipyard, 14));
    safe(() => add(P.lighthouses.home, 7)); safe(() => add(P.facilities.apiary, 8));
    safe(() => { for (const b of P.bridges) add(b, b.len / 2 + 2); });
    safe(() => { for (const c of P.caves) if (c.island === 'home') add(c, 6); });
    reservedCache = out;
    return out;
  };
  /** islanddev 마당·기부함 자리(늦게 생기니 그때그때) */
  const devBlocked = (x: number, z: number) => {
    try {
      const s = (g.ext.dev as { sites?: () => Record<string, { yard?: XZ; box?: XZ } | null> } | undefined)?.sites?.().home;
      if (!s) return false;
      if (s.yard && Math.hypot(s.yard.x - x, s.yard.z - z) < 9) return true;
      if (s.box && Math.hypot(s.box.x - x, s.box.z - z) < 2.6) return true;
    } catch { /* 없음 */ }
    return false;
  };
  const freeOfBuildings = (x: number, z: number) => !reserved().some((q) => Math.hypot(q.x - x, q.z - z) < q.r);
  /** flora 나무 줄기 자리(가까이 살아 있는 나무만 — 1초마다 새로 읽는다) */
  let floraTrees: XZ[] = [], floraT = -Infinity;
  const underTree = (x: number, z: number) => {
    if (g.time - floraT > 1 || g.time < floraT) {
      floraT = g.time;
      try { floraTrees = ((g.ext.flora as { trees?: () => XZ[] } | undefined)?.trees?.() ?? []).map((t) => ({ x: t.x, z: t.z })); } catch { floraTrees = []; }
    }
    return floraTrees.some((t) => Math.abs(t.x - x) < 1.4 && Math.abs(t.z - z) < 1.4);
  };
  /** 꽃밭 칸으로 쓸 수 있는 땅 */
  const soilOk = (x: number, z: number) => gardenSoil(islandProbe, x, z) && freeOfBuildings(x, z) && !devBlocked(x, z) && !underTree(x, z);
  /**
   * 하루 넘길 때(교배 자리·민들레 들꽃) 쓰는 칸 검사 — 지금 로드된 flora 나무는 안 본다.
   * 플레이어가 어디 서 있었든 결과가 늘 같게(flora 가 순수 나무 자리 조회를 주면 그걸로 바꾼다).
   * 마당 자리(devBlocked)는 진행도 기록에서 나오니 그대로 본다.
   */
  const dayCellOk = (x: number, z: number) => gardenSoil(islandProbe, x, z) && freeOfBuildings(x, z) && !devBlocked(x, z);
  /** 민들레·클로버가 나는 들판(말랑섬 풀밭) */
  const meadowOk = (x: number, z: number) => {
    const s = Island.surfaceAt(x, z);
    return s.island === 'home' && s.kind === 'grass' && dryAt(islandProbe, x, z, 3) && freeOfBuildings(x, z);
  };
  const onEarth = () => (g.world ?? 'earth') === 'earth';

  // ───────────── 꽃밭 그리기(청크 그릇) ─────────────
  const PLOT_CHUNK = 64;
  const plotBoxes = new Map<string, Box>();
  const sways = new Map<string, Sway[]>();
  const glints = new Set<THREE.InstancedMesh>();
  const clearBox = (b: Box) => {
    for (const c of [...b.group.children]) {
      b.group.remove(c);
      if ((c as THREE.InstancedMesh).isInstancedMesh) { glints.delete(c as THREE.InstancedMesh); (c as THREE.InstancedMesh).dispose(); }
    }
  };
  const fillPlots = (b: Box) => {
    clearBox(b);
    const day = dayNow();
    const list = F().plots.filter((p) => p.x >= b.x0 && p.x < b.x0 + b.size && p.z >= b.z0 && p.z < b.z0 + b.size);
    const k = `${b.cx},${b.cz}`;
    sways.set(k, []);
    if (!list.length) return;
    const parts: Record<string, Inst[]> = {};
    const meta: Record<string, Array<Omit<Sway, 'mesh' | 'i'>>> = {};
    const push = (key: string, inst: Inst, sw?: Omit<Sway, 'mesh' | 'i'>) => {
      (parts[key] ??= []).push(inst);
      (meta[key] ??= []).push(sw ?? { x: 0, y: 0, z: 0, rot: 0, s: 1, ph: 0, amp: 0 });
    };
    for (const p of list) {
      const y = Island.heightAt(p.x, p.z);
      const r = rngFor(`garden:look:${p.id}`);
      const rot = r() * Math.PI * 2, ph = r() * 6.28;
      const wet = p.water === day;
      if (p.kind === 'apple') {
        if (p.stage < APPLE_DAYS) {
          push('soil', { m: mat4(p.x, y, p.z, rot, 1.15), color: wet ? WET : DRY });
          const s = 0.55 + p.stage * 0.32;
          push('sapling', { m: mat4(p.x, y, p.z, rot, s) }, { x: p.x, y, z: p.z, rot, s, ph, amp: 0.03, plot: p.id });
        } else {
          const s = 1.05 + (r() - 0.5) * 0.1;
          push('tree', { m: mat4(p.x, y - 0.05, p.z, rot, s) }, { x: p.x, y: y - 0.05, z: p.z, rot, s, ph, amp: 0.012, plot: p.id });
          if (hasApples(p, day)) for (const a of APPLE_SPOTS) {
            const c = Math.cos(rot), sn = Math.sin(rot);
            const ax = p.x + (a.x * c + a.z * sn) * s, az = p.z + (-a.x * sn + a.z * c) * s;
            push('apple', { m: mat4(ax, y + a.y * s, az, rot, 1.35) });
          }
        }
        continue;
      }
      push('soil', { m: mat4(p.x, y, p.z, rot, 1), color: wet ? WET : DRY });
      if (p.stage <= 0) { push('sprout', { m: mat4(p.x, y + 0.05, p.z, rot, 1) }, { x: p.x, y: y + 0.05, z: p.z, rot, s: 1, ph, amp: 0.05 }); continue; }
      const kind = p.kind as keyof typeof STEM_SCALE;
      const sy = STEM_SCALE[kind] * (p.stage >= BLOOM ? 1 : 0.72);
      const stemS: [number, number, number] = [1, sy, 1];
      const sw = { x: p.x, y: y + 0.04, z: p.z, rot, ph, amp: kind === 'sunflower' ? 0.05 : 0.08 };
      push('stem', { m: mat4(p.x, y + 0.04, p.z, rot, stemS) }, { ...sw, s: stemS });
      const tint = new THREE.Color(colorHex(p.color));
      const top = y + 0.04 + STEM_H * sy;
      const pivot = STEM_H * sy;
      if (p.stage < BLOOM) push('bud', { m: mat4(p.x, top, p.z, rot, HEAD_SCALE.bud), color: tint }, { ...sw, s: HEAD_SCALE.bud, pivot });
      else {
        const hs = HEAD_SCALE[kind];
        push(kind, { m: mat4(p.x, top, p.z, rot, hs), color: tint }, { ...sw, s: hs, pivot });
        if (p.gold) push('glint', { m: mat4(p.x, top + 0.3, p.z, 0, 1) });
      }
    }
    const sw: Sway[] = [];
    for (const [key, insts] of Object.entries(parts)) {
      const mat = key === 'glint' ? M.glint : M.plant;
      const mesh = instanced(key as Parameters<typeof instanced>[0], mat, insts, { shadow: key === 'tree' || key === 'sapling', receive: key !== 'glint' });
      if (!mesh) continue;
      mesh.frustumCulled = true;
      b.group.add(mesh);
      meta[key].forEach((q, i) => { if (q.amp > 0) sw.push({ ...q, mesh, i }); });
      if (key === 'glint') glints.add(mesh);
    }
    sways.set(k, sw);
    applyCurve(b.group);
  };
  g.chunks.add({
    key: 'garden-plots', size: PLOT_CHUNK, radius: 150, world: 'earth',
    build: (c) => {
      // 말랑섬 근처만(멀면 빈 칸)
      if (!nearHome(c.x0 + c.size / 2, c.z0 + c.size / 2, c.size)) return null;
      const b: Box = { group: new THREE.Group(), cx: c.cx, cz: c.cz, x0: c.x0, z0: c.z0, size: c.size };
      b.group.name = `garden-plots:${c.cx},${c.cz}`;
      b.group.userData.gardenBox = b;
      plotBoxes.set(`${c.cx},${c.cz}`, b);
      fillPlots(b);
      return b.group;
    },
    dispose: (obj) => {
      const b = obj.userData.gardenBox as Box | undefined;
      if (b) { clearBox(b); plotBoxes.delete(`${b.cx},${b.cz}`); sways.delete(`${b.cx},${b.cz}`); }
    },
  });
  const homeDef = Island.islandById('home')!;
  function nearHome(x: number, z: number, pad: number) { return Math.hypot(x - homeDef.x, z - homeDef.z) < homeDef.r * 1.15 + pad; }
  /** 칸이 바뀐 곳만 다시 그린다(xz 를 안 주면 전부) */
  const refreshPlots = (at?: XZ) => {
    if (!at) { for (const b of plotBoxes.values()) fillPlots(b); return; }
    const b = plotBoxes.get(`${Math.floor(at.x / PLOT_CHUNK)},${Math.floor(at.z / PLOT_CHUNK)}`);
    if (b) fillPlots(b);
  };

  // ───────────── 민들레·클로버(청크 그릇) · 풀 숲(detail) ─────────────
  const WILD = DANDELION.chunk;
  const wildCache = new Map<string, WildChunk>();
  const wildAt = (cx: number, cz: number): WildChunk => {
    const k = `${cx},${cz}`;
    let w = wildCache.get(k);
    if (!w) {
      const mid = { x: (cx + 0.5) * WILD, z: (cz + 0.5) * WILD };
      w = nearHome(mid.x, mid.z, WILD) ? wildChunk(cx, cz, WILD, meadowOk) : { dandelions: [], patches: [] };
      if (wildCache.size > 160) wildCache.delete(wildCache.keys().next().value as string);
      wildCache.set(k, w);
    }
    return w;
  };
  /** 그날 덤불의 네잎 줄기(이미 찾았으면 없음) */
  const fourOf = (key: string, n: number, day = dayNow()) => (F().clover[key] === day ? [] : fourLeafSprigs(day, key, n));
  const wildBoxes = new Map<string, Box>();
  const fillWild = (b: Box) => {
    clearBox(b);
    const w = wildAt(b.cx, b.cz);
    const day = dayNow(), f = F();
    const full: Inst[] = [], blown: Inst[] = [], c3: Inst[] = [], c4: Inst[] = [];
    for (const d of w.dandelions) {
      const y = Island.heightAt(d.x, d.z);
      const b2 = f.blown[d.key];
      (b2 && b2.d === day ? blown : full).push({ m: mat4(d.x, y, d.z, d.rot, d.s * 1.5) });
    }
    for (const p of w.patches) {
      const four = new Set(fourOf(p.key, p.sprigs.length, day));
      p.sprigs.forEach((s, i) => {
        const y = Island.heightAt(s.x, s.z);
        (four.has(i) ? c4 : c3).push({ m: mat4(s.x, y, s.z, s.rot, s.s * 2.1) });
      });
    }
    for (const [k, list, mat] of [['dandelion', full, M.fluff], ['dandelionBlown', blown, M.plant], ['clover3', c3, M.plant], ['clover4', c4, M.plant]] as const) {
      const mesh = instanced(k, mat, list);
      if (mesh) b.group.add(mesh);
    }
    applyCurve(b.group);
  };
  g.chunks.add({
    key: 'garden-wild', size: WILD, radius: DANDELION.radius, world: 'earth',
    build: (c) => {
      const w = wildAt(c.cx, c.cz);
      if (!w.dandelions.length && !w.patches.length) return null;
      const b: Box = { group: new THREE.Group(), cx: c.cx, cz: c.cz, x0: c.x0, z0: c.z0, size: c.size };
      b.group.name = `garden-wild:${c.cx},${c.cz}`;
      b.group.userData.gardenBox = b;
      wildBoxes.set(`${c.cx},${c.cz}`, b);
      fillWild(b);
      return b.group;
    },
    dispose: (obj) => { const b = obj.userData.gardenBox as Box | undefined; if (b) { clearBox(b); wildBoxes.delete(`${b.cx},${b.cz}`); } },
  });
  const refreshWild = (at?: XZ) => {
    if (!at) { for (const b of wildBoxes.values()) fillWild(b); return; }
    const b = wildBoxes.get(`${Math.floor(at.x / WILD)},${Math.floor(at.z / WILD)}`);
    if (b) fillWild(b);
  };
  // 장식: 민들레·클로버 들판 풀 숲(낮은 품질에선 빠진다)
  g.chunks.add({
    key: 'garden-tufts', size: TUFTS.chunk, radius: TUFTS.radius, world: 'earth', detail: true,
    build: (c) => {
      if (!nearHome(c.x0 + c.size / 2, c.z0 + c.size / 2, c.size)) return null;
      const w = wildAt(c.cx, c.cz);
      if (!w.dandelions.length && !w.patches.length) return null;
      // 민들레·클로버 둘레에 모아서(빈 들판엔 안 뿌린다)
      const near = (x: number, z: number) => w.dandelions.some((d) => Math.hypot(d.x - x, d.z - z) < 4) || w.patches.some((p) => Math.hypot(p.x - x, p.z - z) < 5);
      const list = tuftChunk(c.cx, c.cz, c.size, (x, z) => near(x, z) && meadowOk(x, z));
      const mesh = instanced('tuft', M.plant, list.map((q) => ({ m: mat4(q.x, Island.heightAt(q.x, q.z), q.z, q.rot, q.s) })), { name: 'garden-tufts' });
      return mesh;
    },
  });

  // ───────────── 큰 바위(청크 그릇 + 충돌체) ─────────────
  let spotsCache: BoulderSpot[] | null = null;
  const spots = () => (spotsCache ??= boulderSpots(islandProbe));
  interface BBox extends Box { bodies: Array<{ remove(): void }> }
  const boulderBoxes = new Map<string, BBox>();
  const fillBoulders = (b: BBox) => {
    clearBox(b);
    for (const body of b.bodies) { try { body.remove(); } catch { /* 이미 없음 */ } }
    b.bodies = [];
    const day = dayNow();
    const list = spots().filter((s) => s.x >= b.x0 && s.x < b.x0 + b.size && s.z >= b.z0 && s.z < b.z0 + b.size && boulderUp(F(), s.key, day));
    const insts: Inst[] = [];
    for (const s of list) {
      const r = rngFor(`garden:boulderlook:${s.key}`);
      insts.push({ m: mat4(s.x, s.y - 0.12, s.z, r() * Math.PI * 2, BOULDER.r * (0.95 + r() * 0.1)) });
      try { b.bodies.push(g.physics.addStatic({ kind: 'ball', r: BOULDER.r * 1.02 }, { x: s.x, y: s.y + 0.55, z: s.z }, undefined, 'garden-boulder')); } catch { /* 물리 없음 */ }
    }
    const mesh = instanced('boulder', M.rock, insts, { shadow: true });
    if (mesh) b.group.add(mesh);
    applyCurve(b.group);
  };
  g.chunks.add({
    key: 'garden-boulders', size: BOULDER.chunk, radius: BOULDER.radius, world: 'earth',
    build: (c) => {
      const any = spots().some((s) => s.x >= c.x0 && s.x < c.x0 + c.size && s.z >= c.z0 && s.z < c.z0 + c.size);
      if (!any) return null;
      const b: BBox = { group: new THREE.Group(), cx: c.cx, cz: c.cz, x0: c.x0, z0: c.z0, size: c.size, bodies: [] };
      b.group.name = `garden-boulders:${c.cx},${c.cz}`;
      b.group.userData.gardenBox = b;
      boulderBoxes.set(`${c.cx},${c.cz}`, b);
      fillBoulders(b);
      return b.group;
    },
    dispose: (obj) => {
      const b = obj.userData.gardenBox as BBox | undefined;
      if (!b) return;
      clearBox(b);
      for (const body of b.bodies) { try { body.remove(); } catch { /* 이미 없음 */ } }
      boulderBoxes.delete(`${b.cx},${b.cz}`);
    },
  });
  const refreshBoulders = () => { for (const b of boulderBoxes.values()) fillBoulders(b); };

  // ───────────── 효과(홀씨·물방울·사과 떨어짐·바위 조각) ─────────────
  const fxRoot = new THREE.Group();
  fxRoot.name = 'garden-fx';
  fxRoot.userData.world = 'earth';
  root.add(fxRoot);
  const fxs: Fx[] = [];
  const addFx = (f: Fx) => { fxs.push(f); if (fxs.length > 24) { fxs.shift()!.dispose(); } };
  /** 점 입자 한 무리(위치 함수로 움직인다) */
  const burst = (n: number, color: string, size: number, life: number, at: XZ & { y: number }, key: string, vel: (r: () => number) => [number, number, number], grav: number) => {
    const p = points(n, color, size);
    const r = rngFor(key);
    const v = Array.from({ length: n }, () => vel(r));
    const pos = p.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) pos.setXYZ(i, at.x + (r() - 0.5) * 0.1, at.y + (r() - 0.5) * 0.1, at.z + (r() - 0.5) * 0.1);
    applyCurve(p);
    fxRoot.add(p);
    let age = 0;
    addFx({
      update: (_t, dt) => {
        age += dt;
        for (let i = 0; i < n; i++) {
          v[i][1] -= grav * dt;
          pos.setXYZ(i, pos.getX(i) + v[i][0] * dt, pos.getY(i) + v[i][1] * dt, pos.getZ(i) + v[i][2] * dt);
        }
        pos.needsUpdate = true;
        (p.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - age / life);
        return age < life;
      },
      dispose: () => { fxRoot.remove(p); p.geometry.dispose(); (p.material as THREE.Material).dispose(); },
    });
  };
  /** 떨어지는 조각들(사과·바위 조각) */
  const drops = (k: 'apple' | 'shard', mat: THREE.Material, from: Array<XZ & { y: number }>, groundY: number, key: string, spread: number) => {
    const mesh = instanced(k, mat, from.map((q) => ({ m: mat4(q.x, q.y, q.z, 0, 1) })), { shadow: false });
    if (!mesh) return;
    applyCurve(mesh);
    fxRoot.add(mesh);
    const r = rngFor(key);
    const st0 = from.map((q) => ({ ...q, vx: (r() - 0.5) * spread, vy: spread * 0.6 + r() * spread * 0.5, vz: (r() - 0.5) * spread, rot: r() * 6 }));
    let age = 0;
    const m = new THREE.Matrix4();
    addFx({
      update: (_t, dt) => {
        age += dt;
        st0.forEach((q, i) => {
          q.vy -= 18 * dt;
          q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.rot += dt * 6;
          if (q.y < groundY + 0.1) { q.y = groundY + 0.1; q.vy = Math.abs(q.vy) * 0.3; q.vx *= 0.6; q.vz *= 0.6; }
          const s = age > 0.7 ? Math.max(0.001, 1 - (age - 0.7) / 0.35) : 1;
          mesh.setMatrixAt(i, mat4(q.x, q.y, q.z, q.rot, s, 0, 0, m));
        });
        mesh.instanceMatrix.needsUpdate = true;
        return age < 1.05;
      },
      dispose: () => { fxRoot.remove(mesh); mesh.dispose(); },
    });
  };
  /** 흔들린 나무가 잠깐 좌우로 */
  const wobble = new Map<string, number>();

  // ───────────── 하루 지나기 · 비 ─────────────
  const report = (rep: DayReport) => {
    if (!rep.days.length) return;
    const here = (() => { const s = Island.surfaceAt(g.player.pos.x, g.player.pos.z); return s.island === 'home'; })();
    if (rep.golden.length) {
      g.hud.banner({ text: '황금장미가 피었어요!', sub: '100송이 중 한 송이의 기적 ✨', icon: '🌹', color: '#ffcf3a', ms: 4200 });
      try { g.econ?.addStars?.(GOLDEN_STARS * rep.golden.length, 'garden:golden'); } catch { /* 없음 */ }
    } else if (rep.bred.length && here) {
      const c = rep.bred[0];
      toast(`🌸 꽃밭에 새 ${colorName(c.color)} ${josa(KIND_NAME[c.kind], '이', '가')} 피었어요!${rep.bred.length > 1 ? ` (+${rep.bred.length - 1})` : ''}`);
    }
    const grownTrees = rep.grown.map((id) => F().plots.find((p) => p.id === id)).filter((p): p is Plot => !!p && p.kind === 'apple' && p.stage >= APPLE_DAYS);
    if (grownTrees.length && here) toast('🍎 사과나무가 다 자랐어요! 흔들어 봐요');
  };
  const processDay = () => {
    const d = dayNow(), f = F();
    if (d === f.day) return;
    const rep = advanceDays(f, d, dayCellOk);
    report(rep);
    save();
    refreshPlots(); refreshWild(); refreshBoulders();
  };
  const checkRain = () => {
    const env = g.env;
    if (!env) return;
    let w: string | undefined;
    try { w = env.weatherOf?.('home'); } catch { w = undefined; }
    if (!w || !RAINY.has(w)) return;
    const f = F(), d = dayNow();
    if (rainWater(f, d) > 0) {
      if (f.rain !== d) {
        f.rain = d;
        if (Island.surfaceAt(g.player.pos.x, g.player.pos.z).island === 'home' && f.plots.length) toast('🌧️ 비가 꽃밭에 물을 줬어요');
      }
      save();
      refreshPlots();
    }
  };

  // ───────────── 심기·물주기·따기·흔들기·뽑기 ─────────────
  const seedsHave = () => SEEDS.filter((s) => (st.bag[s] ?? 0) > 0);
  const selSeed = (): SeedId | null => {
    const have = seedsHave();
    if (!have.length) return null;
    const s = F().sel;
    return s && isSeed(s) && have.includes(s) ? s : have[0];
  };
  /** 플레이어 앞 칸 */
  const frontCell = () => { const f = g.player.facing(); return snapCell(g.player.pos.x + f.x * 1.0, g.player.pos.z + f.z * 1.0); };
  const plantAt = (seed: SeedId, x: number, z: number, quiet = false): Plot | null => {
    const f = F();
    if ((st.bag[seed] ?? 0) <= 0) { if (!quiet) toast(`${josa(SEED_NAME[seed], '이', '가')} 없어요 🌱`); return null; }
    const chk = canPlant(f, seed, x, z, soilOk);
    if (!chk.ok) { if (!quiet) toast(chk.why ?? '여기엔 심을 수 없어요'); return null; }
    st.addItem(seed, -1);
    const p = plantPlot(f, seed, x, z, dayNow());
    if (!quiet) {
      g.player.act('plant', 0.8);
      sfx('dig', { x, z, vol: 0.6, pitch: 1.2 });
      toast(`${KIND_ICON[p.kind]} ${josa(SEED_NAME[seed], '을', '를')} 심었어요! 물을 주면 쑥쑥 자라요 💧`);
    }
    emit({ type: 'place', item: seed, where: 'garden' });
    save();
    refreshPlots(p);
    return p;
  };
  const waterHere = (x: number, z: number, quiet = false): number => {
    if (!hasCan()) { if (!quiet) toast('🚿 물뿌리개가 있어야 물을 줄 수 있어요 — 꽥꽥상점·작업대에서!'); return 0; }
    const ids = waterAt(F(), x, z, dayNow());
    if (!quiet) {
      g.player.act('water', 0.9);
      sfx('splash', { x, z, vol: 0.35, pitch: 1.7 });
      burst(26, '#8fd3ff', 0.07, 0.8, { x, z, y: Island.heightAt(x, z) + 0.9 }, `garden:splash:${g.time}`, (r) => [(r() - 0.5) * 1.4, 0.4 + r() * 0.8, (r() - 0.5) * 1.4], 6);
      if (ids.length) toast(`💧 촉촉! ${ids.length}칸에 물을 줬어요`);
    }
    if (ids.length) { save(); refreshPlots({ x, z }); }
    return ids.length;
  };
  const pickPlot = (p: Plot, quiet = false): number => {
    const day = dayNow();
    const n = pickPetals(F(), p.id, day);
    if (!n) return 0;
    const got = give('m_petal', n, 'garden');
    if (!quiet) {
      g.player.act('pick', 0.5);
      sfx('pick', { x: p.x, z: p.z });
      toast(`🌸 ${p.gold ? '황금장미' : `${colorName(p.color)} ${KIND_NAME[p.kind]}`} 꽃잎 +${got}`);
    }
    emit({ type: 'harvest', kind: 'flower', item: 'm_petal', n: got, island: 'home' });
    save();
    refreshPlots(p);
    return got;
  };
  /** 마지막으로 흔든 꽃밭 사과나무(그 둘레에서 잠깐 '먹고 힘내기') */
  let lastShake: { x: number; z: number; t: number } | null = null;
  const shakePlot = (p: Plot, quiet = false): number => {
    const day = dayNow();
    const n = shakeTree(F(), p.id, day, APPLE_DROP);
    if (!n) return 0;
    const got = give('m_apple', n, 'garden:shake');
    const y = Island.heightAt(p.x, p.z);
    emit({ type: 'tree-shake', x: p.x, z: p.z, tree: `garden:${p.id}`, island: 'home' });
    lastShake = { x: p.x, z: p.z, t: g.time };
    emit({ type: 'harvest', kind: 'shake', item: 'm_apple', n: got, island: 'home' });
    if (!quiet) {
      g.player.act('shake', 0.9);
      sfx('fruit-drop', { x: p.x, z: p.z });
      toast(`🍎 사과 +${got}! 먹으면 힘이 불끈 💪`);
      wobble.set(p.id, g.time);
      const r = rngFor(`garden:look:${p.id}`), rot = r() * Math.PI * 2, c = Math.cos(rot), sn = Math.sin(rot);
      drops('apple', M.plant, APPLE_SPOTS.map((a) => ({ x: p.x + a.x * c + a.z * sn, y: y + a.y, z: p.z - a.x * sn + a.z * c })), y, `garden:appledrop:${p.id}:${day}`, 2.2);
    }
    save();
    refreshPlots(p);
    return got;
  };
  const digUp = (p: Plot, quiet = false) => {
    const was = digPlot(F(), p.id);
    if (!was) return null;
    if (was.kind === 'apple' && was.stage >= APPLE_DAYS) give('m_wood', 2, 'garden:dig');
    if (!quiet) {
      g.player.act('dig', 0.7);
      sfx('dig', { x: p.x, z: p.z });
      toast(`🪴 ${josa(KIND_NAME[was.kind], '을', '를')} 뽑았어요${was.kind === 'apple' && was.stage >= APPLE_DAYS ? ' — 나무 +2' : ''}`);
    }
    save();
    refreshPlots(was);
    return was;
  };
  const statusText = (p: Plot) => {
    if (p.kind === 'apple') return p.stage >= APPLE_DAYS ? '🌳 사과나무 — 내일 또 사과가 열려요' : `🌱 사과 묘목 ${p.stage}/${APPLE_DAYS}일 — ${p.water === dayNow() ? '오늘 물 먹었어요' : '물이 필요해요'}`;
    const nm = p.gold ? '황금장미' : `${colorName(p.color)} ${KIND_NAME[p.kind]}`;
    return `${KIND_ICON[p.kind]} ${nm} · ${STAGE_NAME[Math.min(BLOOM, p.stage)]}${p.water === dayNow() ? ' 💧' : ''}`;
  };

  /** 플레이어가 보고 있는 칸(앞 0.9 m 에서 0.8 m 안, 없으면 발밑 1.3 m 안) */
  const targetPlot = (): { p: Plot; d: number } | null => {
    const pp = g.player.pos, fc = g.player.facing();
    const fx = pp.x + fc.x * 0.9, fz = pp.z + fc.z * 0.9;
    let best: Plot | null = null, bd = Infinity, bp = Infinity;
    for (const p of F().plots) {
      const reach = p.kind === 'apple' && p.stage >= APPLE_DAYS ? 1.8 : 0.8;
      const df = Math.hypot(p.x - fx, p.z - fz), dp = Math.hypot(p.x - pp.x, p.z - pp.z);
      if (df < reach && df < bd) { best = p; bd = df; bp = dp; }
    }
    if (!best) {
      for (const p of F().plots) {
        const reach = p.kind === 'apple' && p.stage >= APPLE_DAYS ? 2.2 : 1.3;
        const dp = Math.hypot(p.x - pp.x, p.z - pp.z);
        if (dp < reach && dp < bp) { best = p; bp = dp; }
      }
    }
    return best ? { p: best, d: Math.min(bp, 0.8) } : null;
  };
  const groundOk = () => onEarth() && g.player.mode === 'ground' && !g.player.mounted;

  g.addProvider('garden-plot', () => {
    if (!groundOk() || !F().plots.length) return null;
    const t = targetPlot();
    if (!t) return null;
    const p = t.p, day = dayNow();
    const bloomPick = isFlower(p) && p.stage >= BLOOM && p.picked !== day;
    if (needsWater(p) && p.water !== day && (hasCan() || !bloomPick)) {
      return { id: 'garden-plot', label: hasCan() ? `물 주기 💧 (${KIND_NAME[p.kind]})` : '물 주기 (물뿌리개가 필요해요)', dist: t.d, use: () => waterHere(p.x, p.z) };
    }
    if (hasApples(p, day)) return { id: 'garden-plot', label: '사과나무 흔들기 🍎', dist: t.d, use: () => shakePlot(p) };
    if (bloomPick) return { id: 'garden-plot', label: p.kind === 'wild' ? '들꽃 따기 🌼' : `${p.gold ? '황금장미' : KIND_NAME[p.kind]} 꽃잎 따기 🌸`, dist: t.d, use: () => pickPlot(p) };
    return { id: 'garden-plot', label: statusText(p), dist: t.d, use: () => toast(statusText(p) + (p.kind !== 'apple' && p.stage < BLOOM ? ' — 내일 쑥!' : '')) };
  });
  g.addProvider('garden-dig', () => {
    if (!groundOk() || !F().plots.length) return null;
    const t = targetPlot();
    if (!t) return null;
    return { id: 'garden-dig', key: 'KeyF', label: '뽑기 🪴', dist: t.d, priority: 0, use: () => digUp(t.p) };
  });
  g.addProvider('garden-plant', () => {
    if (!groundOk()) return null;
    const seed = selSeed();
    if (!seed) return null;
    const c = frontCell();
    if (!canPlant(F(), seed, c.x, c.z, soilOk).ok) return null;
    return { id: 'garden-plant', label: `${KIND_ICON[SEED_KIND[seed]]} ${SEED_NAME[seed]} 심기 (${st.bag[seed] ?? 0})`, dist: 0.85, use: () => plantAt(seed, c.x, c.z) };
  });
  g.addProvider('garden-seed', () => {
    if (!groundOk()) return null;
    const have = seedsHave();
    if (have.length < 2) return null;
    const c = frontCell();
    if (targetPlot() || !soilOk(c.x, c.z)) return null;
    const cur = selSeed()!;
    const next = have[(have.indexOf(cur) + 1) % have.length];
    return { id: 'garden-seed', key: 'KeyF', label: `씨앗 바꾸기 → ${SEED_NAME[next]}`, dist: 0.9, priority: 0, use: () => { F().sel = next; save(); toast(`${KIND_ICON[SEED_KIND[next]]} ${josa(SEED_NAME[next], '을', '를')} 골랐어요`); } };
  });

  // ───────────── 민들레·클로버 상호작용 ─────────────
  /** 플레이어 둘레 청크의 들판 데이터(빌드 여부와 상관없이 계산 — 시험·헤드리스도 같다) */
  const wildNear = (x: number, z: number, r: number) => {
    const out: WildChunk[] = [];
    for (let cx = Math.floor((x - r) / WILD); cx <= Math.floor((x + r) / WILD); cx++)
      for (let cz = Math.floor((z - r) / WILD); cz <= Math.floor((z + r) / WILD); cz++) out.push(wildAt(cx, cz));
    return out;
  };
  const nearestDandelion = (maxD: number) => {
    const pp = g.player.pos;
    let best: { key: string; x: number; z: number } | null = null, bd = maxD;
    for (const w of wildNear(pp.x, pp.z, maxD)) for (const d of w.dandelions) {
      const dd = Math.hypot(d.x - pp.x, d.z - pp.z);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best ? { d: best, dist: bd } : null;
  };
  const blow = (key: string, quiet = false): boolean => {
    const f = F(), day = dayNow();
    if (f.blown[key]?.d === day) return false;
    const [cx, cz] = key.slice(2).split(':')[0].split(',').map(Number);
    const d = wildAt(cx, cz).dandelions.find((q) => q.key === key);
    if (!d) return false;
    f.blown[key] = { d: day, x: d.x, z: d.z };
    save();
    refreshWild(d);
    if (!quiet) {
      g.player.act('peace', 0.9);
      sfx('glide-wind', { x: d.x, z: d.z, vol: 0.35, pitch: 1.9 });
      const w = windAt(day, g.time);
      burst(30, '#ffffff', 0.06, 3.2, { x: d.x, z: d.z, y: Island.heightAt(d.x, d.z) + 0.34 }, `garden:blow:${key}:${day}`,
        (r) => [w.x * (0.8 + r() * 0.9) + (r() - 0.5) * 0.6, 0.35 + r() * 0.5, w.z * (0.8 + r() * 0.9) + (r() - 0.5) * 0.6], -0.06);
      toast('🌬️ 후~ 홀씨가 날아가요! 내일 근처에 꽃이 필 거예요');
    }
    return true;
  };
  const nearestPatch = (maxD: number) => {
    const pp = g.player.pos;
    let best: WildChunk['patches'][number] | null = null, bd = maxD;
    for (const w of wildNear(pp.x, pp.z, maxD)) for (const p of w.patches) {
      const dd = Math.hypot(p.x - pp.x, p.z - pp.z);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best ? { p: best, dist: bd } : null;
  };
  const patchByKey = (key: string) => {
    const [cx, cz] = key.slice(2).split(':')[0].split(',').map(Number);
    return wildAt(cx, cz).patches.find((q) => q.key === key) ?? null;
  };
  const searchClover = (key: string, quiet = false): { found: boolean; why?: string } => {
    const p = patchByKey(key);
    if (!p) return { found: false, why: 'none' };
    const f = F(), day = dayNow();
    if (f.clover[key] === day) { if (!quiet) toast('🍀 여긴 오늘 벌써 살펴봤어요'); return { found: false, why: 'searched' }; }
    const four = fourLeafSprigs(day, key, p.sprigs.length);
    f.clover[key] = day;
    if (four.length) f.stats.clovers++;
    // 오래된 기록 정리
    for (const [k, d] of Object.entries(f.clover)) if (d < day - 1) delete f.clover[k];
    save();
    refreshWild(p);
    if (!quiet) g.player.act('pick', 0.6);
    if (four.length) {
      try { g.econ?.addBuff?.('clover', CLOVER.buffMin); } catch { /* 없음 */ }
      if (!quiet) {
        sfx('shiny', { x: p.x, z: p.z });
        g.hud.banner({ text: '네잎클로버를 찾았어요!', sub: `행운 버프 🍀 게임 ${CLOVER.buffMin / 60}시간 — 반짝이가 잘 나와요`, icon: '🍀', color: '#9fe08a', ms: 3200 });
      }
      return { found: true };
    }
    if (!quiet) { sfx('pick', { x: p.x, z: p.z, pitch: 0.8 }); toast('🍀 세잎클로버뿐이에요… 다른 덤불도 찾아봐요'); }
    return { found: false };
  };
  g.addProvider('garden-dandelion', () => {
    if (!groundOk()) return null;
    const n = nearestDandelion(1.6);
    if (!n || F().blown[n.d.key]?.d === dayNow()) return null;
    return { id: 'garden-dandelion', label: '민들레 홀씨 불기 🌬️', dist: n.dist + 0.1, use: () => blow(n.d.key) };
  });
  g.addProvider('garden-clover', () => {
    if (!groundOk()) return null;
    const n = nearestPatch(1.9);
    if (!n || F().clover[n.p.key] === dayNow()) return null;
    return { id: 'garden-clover', label: '클로버 살펴보기 🍀', dist: n.dist + 0.15, use: () => searchClover(n.p.key) };
  });

  // ───────────── 과일 힘 · 큰 바위 ─────────────
  const showPower = () => {
    const p = F().power;
    try { g.hud.gauge('garden-power', { label: `💪 과일 힘 ${p}/${POWER_MAX}`, value: p / POWER_MAX, color: p >= POWER_MAX ? '#ff9a5a' : '#ffc78a', show: p > 0 }); } catch { /* hud 없음 */ }
  };
  const feed = (n = 1) => {
    const before = F().power;
    const v = addPower(F(), n);
    save();
    showPower();
    if (v >= POWER_MAX && before < POWER_MAX) toast('💪 힘이 가득! 큰 바위도 번쩍 부술 수 있어요');
    return v;
  };
  st.on((e) => {
    const ev = e as { type: string; kind?: string; id?: string };
    // 얼음딸기는 매머드 밥이라 힘이 안 난다
    if (ev.type === 'use' && ev.kind === 'fruit' && ev.id !== 'm_frostberry') feed(1);
  });
  showPower();
  const nearestBoulder = (maxD: number) => {
    const pp = g.player.pos, day = dayNow();
    let best: BoulderSpot | null = null, bd = maxD;
    for (const s of spots()) {
      if (Math.abs(s.x - pp.x) > maxD + 4 || Math.abs(s.z - pp.z) > maxD + 4) continue;
      const d = Math.hypot(s.x - pp.x, s.z - pp.z) - BOULDER.r;
      if (d < bd && boulderUp(F(), s.key, day)) { bd = d; best = s; }
    }
    return best ? { s: best, dist: Math.max(0.05, bd) } : null;
  };
  const breakBoulder = (key: string, quiet = false): { ok: boolean; why?: string; loot?: Array<{ id: string; n: number }> } => {
    const s = spots().find((q) => q.key === key);
    if (!s) return { ok: false, why: 'none' };
    const f = F(), day = dayNow();
    if (!boulderUp(f, key, day)) return { ok: false, why: 'broken' };
    if (!spendPower(f)) {
      if (!quiet) toast(`🪨 끙… 꿈쩍도 안 해요. 과일을 먹고 힘을 모아 봐요 (${f.power}/${POWER_MAX})`);
      return { ok: false, why: 'power' };
    }
    f.boulders[key] = day;
    f.stats.boulders++;
    const loot = boulderLoot(s.island, key, day, BOULDER_SPECIAL[s.island]);
    const got: Array<{ id: string; n: number }> = [];
    for (const l of loot) { const n = give(l.id, l.n, 'garden:boulder'); if (n > 0) got.push({ id: l.id, n }); }
    save();
    showPower();
    emit({ type: 'rock-hit', x: s.x, z: s.z, rock: key, combo: 0, island: s.island });
    for (const l of got) if (l.id !== 'coins') emit({ type: 'harvest', kind: 'rock', item: l.id, n: l.n, island: s.island });
    refreshBoulders();
    if (!quiet) {
      g.player.act('hit', 0.8);
      sfx('rock-break', { x: s.x, z: s.z });
      const r = rngFor(`garden:shards:${key}:${day}`);
      drops('shard', M.rock, Array.from({ length: 10 }, () => ({ x: s.x + (r() - 0.5) * 1.6, y: s.y + 0.5 + r() * 1.4, z: s.z + (r() - 0.5) * 1.6 })), s.y, `garden:shardv:${key}:${day}`, 5);
      const txt = got.map((l) => (l.id === 'coins' ? `🪙${l.n}` : `${l.id === 'm_stone' ? '돌' : l.id === 'm_iron' ? '철광석' : l.id === 'm_gold' ? '금광석' : l.id === 'm_clay' ? '점토' : '특산 돌'} ×${l.n}`)).join(' · ');
      g.hud.card({ title: '쾅! 큰 바위를 부쉈어요 💪', body: txt, icon: '🪨', color: '#cdc5dc', ms: 3400 });
    }
    return { ok: true, loot: got };
  };
  g.addProvider('garden-boulder', () => {
    if (!onEarth() || g.player.mode !== 'ground' || g.player.mounted) return null;
    const n = nearestBoulder(1.9);
    if (!n) return null;
    const p = F().power;
    const label = p >= POWER_MAX ? '큰 바위 부수기 💪' : `커다란 바위 (과일 힘 ${p}/${POWER_MAX})`;
    return { id: 'garden-boulder', label, dist: n.dist, use: () => breakBoulder(n.s.key) };
  });
  /** 가방에 있는 먹을 과일(꽃밭 사과부터) */
  const fruitHave = () => EAT_FRUITS.find((f) => (st.bag[f.id] ?? 0) > 0) ?? null;
  /** 과일 하나 먹기 — econ.use 가 'use' {kind:'fruit'} 를 내면 위 st.on 이 힘을 채운다 */
  const eatFruit = (id: string): boolean => {
    if (F().power >= POWER_MAX) { toast('💪 힘은 이미 가득이에요!'); return false; }
    if ((st.bag[id] ?? 0) <= 0) return false;
    if (g.econ?.use) return g.econ.use(id);
    // econ 이 없을 때(헤드리스 등)만 직접
    st.addItem(id, -1);
    feed(1);
    return true;
  };
  // 큰 바위 앞(힘이 모자랄 때)이나 사과나무를 막 흔든 뒤 — E 로 과일 먹고 힘내기
  g.addProvider('garden-eat', () => {
    if (!groundOk()) return null;
    const p = F().power;
    if (p >= POWER_MAX) return null;
    const fr = fruitHave();
    if (!fr) return null;
    const pp = g.player.pos;
    const b = nearestBoulder(3.2);
    const shook = lastShake && g.time - lastShake.t >= 0 && g.time - lastShake.t < EAT_AFTER_SHAKE && Math.hypot(lastShake.x - pp.x, lastShake.z - pp.z) < 3;
    if (!b && !shook) return null;
    // 바위 앞에선 '부수기' 보다 먼저(힘이 차면 이건 숨고 부수기가 뜬다)
    const dist = b ? Math.max(0.01, b.dist - 0.05) : 0.05;
    return { id: 'garden-eat', label: `${fr.icon} ${fr.name} 먹고 힘내기 (${p}/${POWER_MAX})`, dist, use: () => eatFruit(fr.id) };
  });

  // ───────────── 회전초(모래시계섬) ─────────────
  const tumbles: Tumble[] = [];
  let tumbleMesh: THREE.InstancedMesh | null = null;
  const desertDef = Island.islandById('desert')!;
  const sandOk = (x: number, z: number) => {
    const s = Island.surfaceAt(x, z);
    return s.island === 'desert' && s.kind !== 'sea' && s.kind !== 'cliff' && s.coastDist > 4 && !(Island.waterLevelAt(x, z) > s.h - 0.05);
  };
  const tumbleDay = () => { const f = F(), d = dayNow(); if (f.tumble.day !== d) f.tumble = { day: d, caught: 0, spawned: 0 }; return f.tumble; };
  const ensureTumbleMesh = () => {
    if (tumbleMesh) return tumbleMesh;
    tumbleMesh = new THREE.InstancedMesh(geo('tumble'), M.plant, TUMBLE.max);
    tumbleMesh.name = 'garden-tumbleweeds';
    tumbleMesh.count = 0;
    tumbleMesh.castShadow = true;
    tumbleMesh.frustumCulled = false;
    tumbleMesh.userData.world = 'earth';
    applyCurve(tumbleMesh);
    root.add(tumbleMesh);
    return tumbleMesh;
  };
  const spawnOne = (force = false): Tumble | null => {
    const T = tumbleDay();
    if (!force && T.caught >= TUMBLE.perDay) return null;
    const pp = g.player.pos, day = dayNow();
    const storm = (g.env?.weatherOf?.('desert') ?? '') === 'sandstorm';
    const w = windAt(day, g.time, storm);
    T.spawned++;
    const tw = spawnTumble(T.spawned, pp.x, pp.z, w, rngFor(`garden:tumble:${day}:${T.spawned}`), sandOk);
    if (tw) { tw.y = Island.heightAt(tw.x, tw.z) + tw.r; tumbles.push(tw); }
    return tw;
  };
  let tumbleSpawnT = 0;
  const _tm = new THREE.Matrix4(), _tq = new THREE.Quaternion(), _ta = new THREE.Vector3(), _tp = new THREE.Vector3(), _ts = new THREE.Vector3();
  const updateTumbles = (t: number, dt: number) => {
    const pp = g.player.pos;
    const inDesert = onEarth() && Math.hypot(pp.x - desertDef.x, pp.z - desertDef.z) < desertDef.r * 1.05;
    if (!inDesert) {
      if (tumbles.length) tumbles.length = 0;
      if (tumbleMesh) tumbleMesh.count = 0;
      return;
    }
    const day = dayNow();
    const storm = (g.env?.weatherOf?.('desert') ?? '') === 'sandstorm';
    const w = windAt(day, t, storm);
    for (let i = tumbles.length - 1; i >= 0; i--) {
      const tw = tumbles[i];
      const alive = stepTumble(tw, w, Math.min(dt, 0.1), Island.heightAt, sandOk) && Math.hypot(tw.x - pp.x, tw.z - pp.z) < TUMBLE.despawn;
      if (!alive) tumbles.splice(i, 1);
    }
    tumbleSpawnT -= dt;
    if (tumbles.length < TUMBLE.max && tumbleSpawnT <= 0 && tumbleDay().caught < TUMBLE.perDay) { spawnOne(); tumbleSpawnT = 4; }
    if (!tumbles.length && !tumbleMesh) return;
    const m = ensureTumbleMesh();
    m.count = tumbles.length;
    tumbles.forEach((tw, i) => {
      // 굴러가는 방향에 수직인 축으로 돈다
      const v = Math.hypot(tw.vx, tw.vz) || 1;
      _ta.set(tw.vz / v, 0, -tw.vx / v);
      _tq.setFromAxisAngle(_ta, tw.spin);
      _tp.set(tw.x, tw.y, tw.z);
      _ts.setScalar(tw.r / 0.5);
      m.setMatrixAt(i, _tm.compose(_tp, _tq, _ts));
    });
    m.instanceMatrix.needsUpdate = true;
  };
  const catchTumble = (id: number, quiet = false) => {
    const i = tumbles.findIndex((q) => q.id === id);
    if (i < 0) return null;
    const T = tumbleDay();
    // 하루 몫을 다 잡았으면 남은 회전초는 바람에 날려 보낸다(상자 더 안 줌)
    if (T.caught >= TUMBLE.perDay) { tumbles.splice(i, 1); if (!quiet) toast('🌾 회전초가 바람에 휙 날아갔어요 — 오늘은 여기까지!'); return null; }
    const tw = tumbles.splice(i, 1)[0];
    T.caught++;
    F().stats.tumbleweeds++;
    save();
    if (!quiet) { g.player.act('net', 0.6); sfx('pick', { x: tw.x, z: tw.z, pitch: 0.9 }); toast('🌾 회전초를 잡았어요! 안에 상자가?!'); }
    burst(18, '#e8cf9c', 0.08, 0.9, { x: tw.x, z: tw.z, y: tw.y }, `garden:tumblepop:${T.day}:${tw.id}`, (r) => [(r() - 0.5) * 3, 1 + r() * 2, (r() - 0.5) * 3], 7);
    try {
      const e = g.econ;
      if (e && typeof e.openChest === 'function') return e.openChest('wood', 'tumbleweed:desert');
    } catch (err) { console.error('[garden tumbleweed chest]', err); }
    const coins = 200;
    st.addCoins(coins, 'tumbleweed');
    return { tier: 'wood', loot: [{ id: 'coins', n: coins }] };
  };
  g.addProvider('garden-tumble', () => {
    if (!tumbles.length || !onEarth() || g.player.mounted) return null;
    const pp = g.player.pos;
    let best: Tumble | null = null, bd: number = TUMBLE.catchR;
    for (const tw of tumbles) { const d = Math.hypot(tw.x - pp.x, tw.z - pp.z); if (d < bd) { bd = d; best = tw; } }
    if (!best) return null;
    const id = best.id;
    return { id: 'garden-tumble', label: '회전초 잡기! 🌾', dist: bd * 0.5, use: () => catchTumble(id) };
  });

  // ───────────── 지도: 큰 바위 ─────────────
  try {
    g.hud.registerMapLayer({
      id: 'garden-boulders', order: 40,
      draw: (g2, toPx, scale, world) => {
        if (world !== 'earth') return;
        const day = dayNow();
        for (const s of spots()) {
          if (!boulderUp(F(), s.key, day)) continue;
          const [px, py] = toPx(s.x, s.z);
          const r = Math.max(2.5, Math.min(5, 3 * scale));
          g2.fillStyle = '#cdc5dc'; g2.strokeStyle = '#6f6788'; g2.lineWidth = 1;
          g2.beginPath(); g2.arc(px, py, r, 0, Math.PI * 2); g2.fill(); g2.stroke();
        }
      },
    });
  } catch { /* hud 없음 */ }

  // ───────────── 매 프레임 ─────────────
  let slow = 0, rainT = 1;
  const swayM = new THREE.Matrix4(), swayE = new THREE.Euler(), swayQ = new THREE.Quaternion(), swayV = new THREE.Vector3();
  // 황금장미 반짝이 임시값(매 프레임 새로 만들지 않게)
  const glintM = new THREE.Matrix4(), glintQ = new THREE.Quaternion(), glintP = new THREE.Vector3(), glintS = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  ctx.onUpdate((t, dt) => {
    slow -= dt; rainT -= dt;
    if (slow <= 0) { slow = 0.5; processDay(); }
    if (rainT <= 0) { rainT = 2.5; checkRain(); }
    // 바람에 살랑(가까운 꽃밭 청크만)
    const pp = g.player.pos;
    for (const [k, list] of sways) {
      if (!list.length) continue;
      const b = plotBoxes.get(k);
      if (!b || Math.hypot(b.x0 + b.size / 2 - pp.x, b.z0 + b.size / 2 - pp.z) > 70) continue;
      const touched = new Set<THREE.InstancedMesh>();
      for (const s of list) {
        let a = Math.sin(t * 1.7 + s.ph) * s.amp, c = Math.cos(t * 1.3 + s.ph * 1.3) * s.amp * 0.6;
        if (s.plot) {
          const w0 = wobble.get(s.plot);
          if (w0 !== undefined) {
            const age = t - w0;
            if (age > 1.2 || age < 0) wobble.delete(s.plot);
            else { const k2 = Math.exp(-age * 3.2) * 0.09; a += Math.sin(age * 22) * k2; c += Math.cos(age * 17) * k2 * 0.6; }
          }
        }
        if (s.pivot) {
          // 꽃송이: 줄기와 같은 기울기로, 줄기 끝(바닥 + 기운 (0, pivot, 0))에
          swayE.set(a, s.rot, -c, 'XYZ');
          swayQ.setFromEuler(swayE);
          swayV.set(0, s.pivot, 0).applyQuaternion(swayQ);
          mat4(s.x + swayV.x, s.y + swayV.y, s.z + swayV.z, s.rot, s.s, a, -c, swayM);
        } else mat4(s.x, s.y, s.z, s.rot, s.s, a, -c, swayM);
        s.mesh.setMatrixAt(s.i, swayM);
        touched.add(s.mesh);
      }
      for (const m of touched) m.instanceMatrix.needsUpdate = true;
    }
    // 황금장미 반짝이
    if (glints.size) {
      glintQ.setFromAxisAngle(UP, t * 2.2);
      for (const m of glints) {
        if (!m.parent) { glints.delete(m); continue; }
        for (let i = 0; i < m.count; i++) {
          m.getMatrixAt(i, glintM);
          glintP.setFromMatrixPosition(glintM);
          glintS.setScalar(0.85 + 0.25 * Math.sin(t * 3 + i));
          glintM.compose(glintP, glintQ, glintS);
          m.setMatrixAt(i, glintM);
        }
        m.instanceMatrix.needsUpdate = true;
      }
    }
    updateTumbles(t, dt);
    for (let i = fxs.length - 1; i >= 0; i--) {
      let alive = false;
      try { alive = fxs[i].update(t, dt); } catch (e) { console.error('[garden fx]', e); }
      if (!alive) { fxs[i].dispose(); fxs.splice(i, 1); }
    }
  });

  // ───────────── 꽃밭 자리(디버그·벤치) ─────────────
  let spotCache: XZ | null = null;
  /** 지금 보이는 flora 나무가 근처에 있나(꽃밭 자리를 나무 옆에서 비키려고 — 덤불은 flora 조회가 없어 못 본다) */
  const nearFlora = (x: number, z: number, r: number) => {
    underTree(x, z); // floraTrees 새로 읽기
    return floraTrees.some((t) => Math.hypot(t.x - x, t.z - z) < r);
  };
  const gardenSpot = (): XZ => {
    if (spotCache) return spotCache;
    const P = Island.PLACES;
    let h: XZ = { x: 30, z: -60 };
    try { h = P.house; } catch { /* 기본 */ }
    // 집 둘레에서 6×6 칸이 거의 다 꽃밭 땅인 곳
    // 먼저 보이는 flora 나무에서 떨어진 곳, 없으면 그냥 땅만 보고
    const good = (x: number, z: number, avoid: boolean) => {
      let n = 0;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (soilOk(x + i, z + j)) n++;
      return n >= 32 && !(avoid && nearFlora(x + 2.5, z + 2.5, 6.5));
    };
    for (const avoid of [true, false]) {
      for (let r = 14; r < 200 && !spotCache; r += 4) {
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const c = snapCell(h.x + Math.cos(a) * r, h.z + Math.sin(a) * r);
          if (good(c.x, c.z, avoid)) { spotCache = c; break; }
        }
      }
      if (spotCache) break;
    }
    return (spotCache ??= snapCell(h.x + 16, h.z));
  };

  // ───────────── ext · 디버그 ─────────────
  const ext = {
    plots: () => F().plots.map((p) => ({ ...p })),
    plant: (seed: string, x: number, z: number) => (isSeed(seed) ? plantAt(seed, snapCell(x, z).x, snapCell(x, z).z, true) : null),
    water: (x = g.player.pos.x, z = g.player.pos.z) => waterHere(x, z, true),
    power: () => ({ value: F().power, max: POWER_MAX }),
    boulders: () => { const day = dayNow(); return spots().map((s) => ({ key: s.key, island: s.island, secret: s.secret, x: s.x, z: s.z, up: boulderUp(F(), s.key, day) })); },
    breakBoulder: (key: string) => breakBoulder(key, true),
    soilOk,
    stats: () => ({ ...F().stats }),
    gardenSpot,
  };
  g.ext.garden = ext;
  const plotOf = (id?: string) => (id ? F().plots.find((p) => p.id === id) : targetPlot()?.p) ?? null;
  (globalThis as unknown as { __garden?: unknown }).__garden = {
    ...ext,
    state: () => ({ ...F(), plots: F().plots.map((p) => ({ ...p })) }),
    plant: (seed = 'seed_tulip', x?: number, z?: number) => {
      if (!isSeed(seed)) return null;
      const c = x !== undefined && z !== undefined ? snapCell(x, z) : frontCell();
      if ((st.bag[seed] ?? 0) <= 0) st.addItem(seed, 1);
      return plantAt(seed, c.x, c.z, true);
    },
    /** 물뿌리개 없이도 전부 적신다 */
    water: () => { const n = waterAt(F(), 0, 0, dayNow(), Infinity).length; if (n) { save(); refreshPlots(); } return n; },
    /** 게임 시계를 하루씩 넘긴다(env 가 없으면 꽃밭 날짜만) */
    nextDay: (n = 1) => {
      for (let i = 0; i < n; i++) {
        if (g.env) g.env.advance(DAY_SEC);
        else { const f = F(); advanceDays(f, f.day + 1, dayCellOk); }
        processDay();
      }
      return { day: F().day };
    },
    pick: (id?: string) => { const p = plotOf(id); return p ? pickPlot(p, true) : 0; },
    shake: (id?: string) => { const p = plotOf(id); return p ? shakePlot(p, true) : 0; },
    dig: (id?: string) => { const p = plotOf(id); return p ? digUp(p, true) : null; },
    /** 과일 하나 먹기(진짜 econ.use 길 — garden-eat 과 같다) */
    eat: (id?: string) => { const f = id ?? fruitHave()?.id; return f ? eatFruit(f) : false; },
    feed: (n = 1) => {
      let v = F().power;
      for (let i = 0; i < n; i++) {
        const fruit = fruitHave();
        if (fruit) { eatFruit(fruit.id); v = F().power; } else v = feed(1);
      }
      return v;
    },
    /** 벤치: 꽃밭 자리에 n 칸(꽃·사과 섞어서, 몇은 다 자란 채로) */
    seed: (n = 30) => {
      const s = gardenSpot();
      let made = 0;
      const day = dayNow();
      for (let i = 0; i < 14 && made < n; i++) for (let j = 0; j < 14 && made < n; j++) {
        const seed: SeedId = made % 10 === 9 ? 'seed_apple' : made % 3 === 0 ? 'seed_sunflower' : 'seed_tulip';
        const x = s.x + i * (seed === 'seed_apple' ? 1 : 1), z = s.z + j;
        if (!canPlant(F(), seed, x, z, soilOk).ok) continue;
        const p = plantPlot(F(), seed, x, z, day);
        p.stage = p.kind === 'apple' ? (made % 20 === 9 ? APPLE_DAYS : 2) : made % 4;
        if (p.kind !== 'apple') p.stage = Math.min(BLOOM, p.stage);
        if (made % 2 === 0) p.water = day;
        made++;
      }
      save(); refreshPlots();
      return made;
    },
    boulders: ext.boulders,
    gotoBoulder: (island = 'home', i = 0) => {
      const s = spots().filter((q) => q.island === island)[i];
      if (!s) return null;
      g.player.teleport(s.x + BOULDER.r + 1.2, s.z);
      return s;
    },
    breakNearest: () => { const n = nearestBoulder(6); return n ? breakBoulder(n.s.key, true) : { ok: false, why: 'far' }; },
    clovers: () => {
      const pp = g.player.pos, day = dayNow();
      return wildNear(pp.x, pp.z, CLOVER.radius).flatMap((w) => w.patches).map((p) => ({ key: p.key, x: p.x, z: p.z, n: p.sprigs.length, four: fourOf(p.key, p.sprigs.length, day) }));
    },
    searchClover: (key?: string) => { const k = key ?? nearestPatch(6)?.p.key; return k ? searchClover(k, true) : { found: false, why: 'far' }; },
    dandelions: () => {
      const pp = g.player.pos, day = dayNow();
      return wildNear(pp.x, pp.z, DANDELION.radius).flatMap((w) => w.dandelions).map((d) => ({ key: d.key, x: d.x, z: d.z, blown: F().blown[d.key]?.d === day }));
    },
    blow: (key?: string) => { const k = key ?? nearestDandelion(6)?.d.key; return k ? blow(k, true) : false; },
    tumbles: () => tumbles.map((q) => ({ id: q.id, x: q.x, z: q.z, y: q.y })),
    /** near=true 면 플레이어 바람 위쪽 7 m 에(촬영·시험용) */
    spawnTumble: (near = false) => {
      const tw = spawnOne(true);
      if (tw && near) {
        const w = windAt(dayNow(), g.time);
        tw.x = g.player.pos.x - w.x * 7; tw.z = g.player.pos.z - w.z * 7; tw.y = Island.heightAt(tw.x, tw.z) + tw.r;
      }
      return tw ? { id: tw.id, x: tw.x, z: tw.z } : null;
    },
    catchTumble: () => { const pp = g.player.pos; const n = [...tumbles].sort((a, b) => Math.hypot(a.x - pp.x, a.z - pp.z) - Math.hypot(b.x - pp.x, b.z - pp.z))[0]; return n ? catchTumble(n.id, true) : null; },
    gardenSpot,
    gotoGarden: () => { const s = gardenSpot(); g.player.teleport(s.x - 1.5, s.z - 1.5); g.player.yaw = Math.PI * 0.75; return s; },
    rain: () => { const n = rainWater(F(), dayNow()); save(); refreshPlots(); return n; },
    refresh: () => { refreshPlots(); refreshWild(); refreshBoulders(); },
    hour: hourNow,
  };
  return root;
}

/** 받침 있는 말이면 a, 없으면 b 를 붙인다('튤립을' · '해바라기를') */
function josa(word: string, a: string, b: string): string {
  const c = word.charCodeAt(word.length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false;
  return word + (has ? a : b);
}

/** 열매 나무 사과 자리(나무 로컬, 크기 1 기준) */
const APPLE_SPOTS: ReadonlyArray<{ x: number; y: number; z: number }> = [
  { x: 0.8, y: 1.66, z: 0.86 }, { x: -0.92, y: 1.92, z: 0.66 }, { x: 0.22, y: 2.5, z: 0.92 },
];
