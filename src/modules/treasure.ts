// treasure — 반짝 땅·보물(GDD 1.3 "10초 발견", 2.2.1, 3.7 화석, 4.3, 5.4 풍선·병편지, 4.13 하루 루틴).
// ① 화석 X: 큰 섬마다 하루 4개(공룡섬 12), rng `treasure-x:${day}:${island}`. 삽(tool:shovel)으로 E 파기 →
//    화석 조각(ext.fossils.roll — 공룡섬 70% · 다른 섬 35%, 없으면 호박/돌) 또는 호박·돌·쓰레기(타이어 등)·지렁이 미끼·은열쇠 조각.
//    보물지도 X(쪼꼬미섬)를 파면 금상자 — 쪼꼬미섬 금상자 자리는 이 모듈만 둔다.
// ② 풍선 선물: 큰 섬마다 게임 1시간에 1개, 땅 위 8~20 m 를 천천히 떠간다. F(우선순위 20) '새총으로 맞추기'(25 m 원뿔·시야) →
//    돌멩이가 포물선으로 날아가 팡! → 선물이 물리로 떨어진다 → E 로 열면 나무상자 + 풍선 조각.
// ③ 병편지: 해변에 하루 6~10개 + 앞바다에 떠다니는 3개. 열면 보물지도 60% · 레시피 카드 25% · 주민 사연 15%(+3★),
//    별똥별섬 근처면 5% '우주에서 온 편지'(mail 이벤트). 창 'letter'(L 키 — 가방 속 병편지 열기·보물지도 보기).
// ④ 하루 줍기: 해변 조개(m_shell), 공룡섬 둥지 절벽·별똥별섬 절벽 깃털(m_feather), 크레이터 별가루 3 · 운석 2(일요일 ×2), 해변 쓰레기.
// ⑤ 해저 거품 기둥: 잠수(C) 중에만 줍는다 — 해초·산호(산호초)·진주굴(진주 20%, 아니면 조개).
// 모든 자리는 청크(treasure-items, 반짝임·거품은 detail 레이어 treasure-fx)로 그린다. 풍선·떨어진 선물·금상자는 가까울 때만 산다.
// 저장: flags.treasure(treasure/logic.ts TreasureFlags — popped·crater 포함).
//
// game.ext.treasure (주인: treasure) = {
//   digs(island?) → Array<Spot & {taken}>   오늘 화석 X(섬을 안 주면 큰 섬 전부)
//   balloons() → Array<{key, island, x, y, z, popped, live}>   지금 시간의 풍선 선물
//   bottles() → Array<Spot & {taken}>        오늘 해변·바다 병편지(계산된 섬만)
//   spots(kind?) → Array<Spot & {taken}>     오늘 계산된 자리(크레이터·해저·바다 병편지 포함)
//   maps() → Array<{n, islet, x, z}>         가진 보물지도
//   stats() → {popped, dug, picked, bottles, maps, mapsDone, letters, recipes}
//   debugSpawn(kind) → 만든 것               'x'|'mapx'|'map'|'balloon'|'gift'|'bottle'|'seabottle'|'shell'|'feather'|'stardust'|'meteor'|'tire'|'seaweed'|'coral'|'oyster'
//   openBottle(at?) → LetterView             병편지 하나 열기(디버그·다른 모듈용)
// }
// 디버그: window.__treasure { spawn(kind), digs(island?), state(), balloons(), popNearest(), digNearest(), pickNearest(), openBottle(), plan(island) }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import type { PhysBody } from '../core/physics';
import { applyCurve } from '../core/curve';
import { ALT_PRIORITY, HOUR_SEC, START_HOUR, weekdayOf } from '../core/api';
import type { HarvestKind } from '../core/events';
import { buildBalloonGift } from './props/balloon';
import { itemDef, RECIPE_TABLE } from './economy/data';
import {
  MAIN_ISLANDS, CELL, cellOf, ensureFlags, rollDay, planIsland, planCrater, planSeabed, planSeaBottles, rollDig, rollBottle, nearLaunch,
  pickMapTarget, balloonPlan, balloonXZ, inSlingCone, PEARL_CHANCE, ISLETS,
  type Spot, type SpotKind, type TreasureFlags, type BalloonPlan, type DigOutcome,
} from './treasure/logic';
import {
  visualOf, glintPulse, gloss, matte, paintMat, glintGeo, glintMat, bubbleGeo, bubbleMat, goldChestModel, giftModel, pebbleModel, confettiBurst, popItemModel,
} from './treasure/models';
import { letterPanel, RESIDENT_LETTERS, SPACE_LETTERS, type LetterView } from './treasure/letters';

export const order = 25;

/** 줍기 거리(m) */
const PICK_R = 1.9;
const DIG_R = 2.2;
const SEA_PICK_R = 2.6;
const DIVE_R = 3.2;
const GIFT_R = 2.2;
/** 풍선을 만들어 두는 거리 */
const BALLOON_SHOW = 380;
/** 파기 연출 시간(초) */
const DIG_SEC = 0.9;

const NAMES: Record<string, string> = {
  m_shell: '조개껍데기', m_feather: '깃털', m_stardust: '별가루', m_meteor: '운석 조각', t_bottle: '병편지', t_tire: '헌 타이어', t_can: '찌그러진 깡통',
  t_boot: '헌 장화', m_seaweed: '해초', m_coral: '산호 조각', m_pearl: '진주', m_amber: '호박', m_stone: '돌', bait_worm: '지렁이 미끼', m_balloon_scrap: '풍선 조각',
};
const nameOf = (id: string) => NAMES[id] ?? itemDef(id)?.name ?? id;
const iconOf = (id: string) => itemDef(id)?.icon ?? '✨';
const colorOf = (id: string) => itemDef(id)?.color ?? '#ffe58a';

/** 레시피 카드가 될 수 있는 것(상자 카드와 같은 기준) */
const CARD_RIDS = RECIPE_TABLE.filter((r) => !r.extra && (r.gate.startsWith('card:') || r.gate.startsWith('recipe:'))).map((r) => r.id);

interface Cell { cx: number; cz: number; items: THREE.Group | null; fx: THREE.Group | null }
interface LiveBalloon { plan: BalloonPlan; obj: THREE.Group | null; tick: ((t: number) => void) | null; pos: THREE.Vector3; debug?: boolean; aimed?: boolean }
interface LiveGift { key: string; obj: THREE.Group; body: PhysBody | null; age: number; island: string }

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const g: Game = game;
  const st = g.state;
  const I = ctx.island;

  // ───────────── 저장 ─────────────
  let flagsObj: TreasureFlags | null = null;
  /** flags.treasure(불러오기로 바뀌었으면 다시 맞춘다) */
  const F = (): TreasureFlags => {
    if (!flagsObj || st.flags.treasure !== flagsObj) { flagsObj = ensureFlags(st.flags.treasure); st.flags.treasure = flagsObj; }
    return flagsObj;
  };
  const save = () => st.save();
  let internalBag = 0;
  const emit = (e: Parameters<typeof st.emit>[0]) => st.emit(e);
  const harvest = (kind: HarvestKind, item: string, n: number, island: string) => emit({ type: 'harvest', kind, item, n, island });
  const toast = (s: string) => g.ui.toast(s);

  // ───────────── 시계 ─────────────
  const dayNow = () => Math.floor(g.env?.day ?? g.econ?.day?.() ?? 0);
  const hourNow = () => g.env?.hour ?? (START_HOUR + g.time / HOUR_SEC) % 24;
  const weekdayNow = () => g.env?.weekday ?? weekdayOf(dayNow());

  // ───────────── 경제(없으면 state 로) ─────────────
  const unlocked = (k: string) => { try { return g.econ?.isUnlocked?.(k) ?? true; } catch { return true; } };
  const needText = (k: string, fallback: string) => { try { return g.econ?.requirement?.(k)?.text || fallback; } catch { return fallback; } };
  const canAdd = (id: string, n: number) => { try { return g.econ?.bag?.canAdd?.(id, n) ?? true; } catch { return true; } };
  const give = (id: string, n: number, why: string): number => {
    internalBag++;
    try {
      const e = g.econ;
      if (e && typeof e.give === 'function') return e.give(id, n, why);
      st.addItem(id, n);
      return n;
    } finally { internalBag--; }
  };
  const takeBag = (id: string, n = 1) => { if ((st.bag[id] ?? 0) <= 0) return false; internalBag++; try { st.addItem(id, -n); } finally { internalBag--; } return true; };
  const openChest = (tier: 'wood' | 'gold', where: string) => {
    const e = g.econ;
    if (e && typeof e.openChest === 'function') return e.openChest(tier, where);
    const coins = tier === 'gold' ? 5000 : 200;
    st.addCoins(coins, 'chest');
    return { tier, loot: [{ id: 'coins', n: coins }] };
  };

  // ───────────── 하루 계획 · 공간 색인 ─────────────
  let planDay = -1;
  const islandPlans = new Map<string, Spot[]>();
  let worldPlan: Spot[] | null = null;
  /** 칸 → 자리(오늘 것 + 보물지도 X + 디버그) */
  const index = new Map<string, Spot[]>();
  const byId = new Map<string, Spot>();
  let taken = new Set<string>();
  const extras: Spot[] = [];
  let dbgSeq = 0;

  const addSpot = (s: Spot) => {
    if (byId.has(s.id)) return;
    byId.set(s.id, s);
    const k = cellOf(s.x, s.z);
    let a = index.get(k);
    if (!a) index.set(k, (a = []));
    a.push(s);
  };
  const dropSpot = (id: string) => {
    const s = byId.get(id);
    if (!s) return;
    byId.delete(id);
    const k = cellOf(s.x, s.z);
    const a = index.get(k);
    if (a) { const i = a.indexOf(s); if (i >= 0) a.splice(i, 1); }
    refreshAt(s.x, s.z);
  };
  const mapSpot = (n: string, m: TreasureFlags['maps'][string]): Spot =>
    ({ id: `mapx:${n}`, kind: 'mapx', island: m.islet, x: m.x, z: m.z, y: I.heightAt(m.x, m.z), rot: 0.4, map: Number(n), harvest: 'dig' });

  /** 날이 바뀌었으면 계획·색인을 비우고 다시(지도 X 는 남는다) */
  const ensureDay = () => {
    const d = dayNow();
    if (d === planDay) return false;
    const f = F();
    if (rollDay(f, d)) save();
    planDay = d;
    islandPlans.clear();
    worldPlan = null;
    index.clear();
    byId.clear();
    extras.length = 0;
    taken = new Set(f.taken);
    for (const [n, m] of Object.entries(f.maps)) addSpot(mapSpot(n, m));
    refreshAll();
    return true;
  };
  const ensureIsland = (id: string) => {
    if (islandPlans.has(id)) return;
    const plan = planIsland(planDay, id);
    islandPlans.set(id, plan);
    for (const s of plan) addSpot(s);
  };
  const ensureWorld = () => {
    if (worldPlan) return;
    worldPlan = [...planCrater(planDay, weekdayNow()), ...planSeabed(planDay), ...planSeaBottles(planDay)];
    for (const s of worldPlan) addSpot(s);
  };
  /** (x, z) 주변 섬 계획을 만든다(섬 반경 + 260 m 안) */
  const ensureAround = (x: number, z: number, pad = 260) => {
    ensureDay();
    ensureWorld();
    for (const d of I.ISLANDS) {
      if (d.theme !== 'islet' && !(MAIN_ISLANDS as readonly string[]).includes(d.id)) continue;
      if (Math.hypot(x - d.x, z - d.z) < d.r + pad) ensureIsland(d.id);
    }
  };
  const visible = (s: Spot) => !taken.has(s.id) && (s.kind !== 'mapx' || !!F().maps[String(s.map)]);
  const markTaken = (s: Spot) => {
    taken.add(s.id);
    const f = F();
    if (!s.id.startsWith('mapx:') && !f.taken.includes(s.id)) f.taken.push(s.id);
    save();
    refreshAt(s.x, s.z);
  };

  // ───────────── 청크(그리기) ─────────────
  const cells = new Map<string, Cell>();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _Y = new THREE.Vector3(0, 1, 0);
  const visKey = (s: Spot) => (s.kind === 'junk' ? `junk:${s.item}` : s.kind);
  const spotMatrix = (s: Spot, t: number, out = _m) => {
    let y = s.y;
    if (s.floats) y = (g.ocean?.waveAt?.(s.x, s.z, t) ?? 0) + Math.sin(t * 1.4 + s.rot * 3) * 0.1 - 0.05;
    _q.setFromAxisAngle(_Y, s.rot + (s.floats ? Math.sin(t * 0.7 + s.rot) * 0.4 : 0));
    _p.set(s.x, y, s.z);
    return out.compose(_p, _q, _s);
  };
  const clearGroup = (grp: THREE.Group) => {
    for (const c of [...grp.children]) { grp.remove(c); (c as THREE.InstancedMesh).dispose?.(); }
    grp.userData.anim = [];
  };
  /** 버블: 자리마다 8알 */
  const BUB = 8;
  const fillItems = (grp: THREE.Group, cell: Cell) => {
    clearGroup(grp);
    const list = (index.get(`${cell.cx},${cell.cz}`) ?? []).filter(visible);
    const groups = new Map<string, Spot[]>();
    for (const s of list) { const k = visKey(s); let a = groups.get(k); if (!a) groups.set(k, (a = [])); a.push(s); }
    const t = g.time;
    for (const [k, spots] of groups) {
      for (const [geo, mat] of visualOf(spots[0].kind, spots[0].item)) {
        const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
        spots.forEach((s, i) => mesh.setMatrixAt(i, spotMatrix(s, t)));
        mesh.castShadow = !mat.transparent;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        mesh.name = `treasure:${k}`;
        grp.add(mesh);
        if (spots.some((s) => s.floats)) (grp.userData.anim as unknown[]).push({ mesh, spots, kind: 'float' });
      }
    }
    applyCurve(grp);
  };
  const GLINT_KINDS = new Set<SpotKind>(['x', 'mapx', 'stardust', 'meteor', 'bottle', 'seabottle', 'shell']);
  const fillFx = (grp: THREE.Group, cell: Cell) => {
    clearGroup(grp);
    const list = (index.get(`${cell.cx},${cell.cz}`) ?? []).filter(visible);
    const glints = list.filter((s) => GLINT_KINDS.has(s.kind));
    const dives = list.filter((s) => s.dive);
    const t = g.time;
    if (glints.length) {
      const mesh = new THREE.InstancedMesh(glintGeo(), glintMat(), glints.length);
      glints.forEach((s, i) => mesh.setMatrixAt(i, glintMatrix(s, t)));
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      grp.add(mesh);
      (grp.userData.anim as unknown[]).push({ mesh, spots: glints, kind: 'glint' });
    }
    if (dives.length) {
      const mesh = new THREE.InstancedMesh(bubbleGeo(), bubbleMat(), dives.length * BUB);
      dives.forEach((s, i) => { for (let b = 0; b < BUB; b++) mesh.setMatrixAt(i * BUB + b, bubbleMatrix(s, b, t)); });
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      grp.add(mesh);
      (grp.userData.anim as unknown[]).push({ mesh, spots: dives, kind: 'bubble' });
    }
    applyCurve(grp);
  };
  const glintMatrix = (s: Spot, t: number) => {
    const big = s.kind === 'mapx' || s.kind === 'x';
    const y = (s.floats ? 0.35 : s.y + (big ? 0.75 : 0.55)) + Math.sin(t * 2.3 + s.rot * 5) * 0.08;
    _q.setFromAxisAngle(_Y, t * 1.7 + s.rot);
    _p.set(s.x + Math.cos(s.rot) * 0.15, y, s.z + Math.sin(s.rot) * 0.15);
    const k = big ? 1.4 : 1;
    return _m.compose(_p, _q, _s.set(k, k, k));
  };
  /** 해저 → 수면까지 퐁퐁 올라가는 거품 */
  const bubbleMatrix = (s: Spot, b: number, t: number) => {
    const H = Math.max(1.5, -s.y);
    const ph = (b / BUB + s.rot * 0.37) % 1;
    const u = (t * (0.9 / H) * 2.2 + ph) % 1;
    const y = s.y + 0.3 + u * H;
    const k = 0.6 + u * 0.9;
    _q.identity();
    _p.set(s.x + Math.sin(t * 2 + b * 1.7) * 0.18, y, s.z + Math.cos(t * 1.6 + b * 2.3) * 0.18);
    return _m.compose(_p, _q, _s.set(k, k, k));
  };
  const cellKeyOf = (o: THREE.Object3D) => o.userData.treasureCell as string;
  const buildCell = (cx: number, cz: number, layer: 'items' | 'fx'): THREE.Object3D => {
    const x = (cx + 0.5) * CELL, z = (cz + 0.5) * CELL;
    ensureAround(x, z, 120);
    const k = `${cx},${cz}`;
    let cell = cells.get(k);
    if (!cell) cells.set(k, (cell = { cx, cz, items: null, fx: null }));
    const grp = new THREE.Group();
    grp.name = `treasure-${layer}:${k}`;
    grp.userData.treasureCell = k;
    grp.userData.anim = [];
    if (layer === 'items') { cell.items = grp; fillItems(grp, cell); } else { cell.fx = grp; fillFx(grp, cell); }
    return grp;
  };
  const disposeCell = (o: THREE.Object3D, layer: 'items' | 'fx') => {
    const k = cellKeyOf(o);
    const cell = cells.get(k);
    clearGroup(o as THREE.Group);
    if (!cell) return;
    if (layer === 'items' && cell.items === o) cell.items = null;
    if (layer === 'fx' && cell.fx === o) cell.fx = null;
    if (!cell.items && !cell.fx) cells.delete(k);
  };
  function refreshCell(cell: Cell) {
    if (cell.items) fillItems(cell.items, cell);
    if (cell.fx) fillFx(cell.fx, cell);
  }
  function refreshAt(x: number, z: number) { const c = cells.get(cellOf(x, z)); if (c) refreshCell(c); }
  function refreshAll() { for (const c of cells.values()) refreshCell(c); }

  g.chunks.add({ key: 'treasure-items', size: CELL, radius: 200, build: ({ cx, cz }) => buildCell(cx, cz, 'items'), dispose: (o) => disposeCell(o, 'items') });
  g.chunks.add({ key: 'treasure-fx', size: CELL, radius: 120, detail: true, build: ({ cx, cz }) => buildCell(cx, cz, 'fx'), dispose: (o) => disposeCell(o, 'fx') });

  // ───────────── 가까운 자리 찾기 ─────────────
  const nearest = (pred: (s: Spot) => boolean, maxD: number): { s: Spot; d: number } | null => {
    const p = g.player.pos;
    ensureAround(p.x, p.z, 60);
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    let best: Spot | null = null, bd = maxD;
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      for (const s of index.get(`${ix},${iz}`) ?? []) {
        if (!visible(s) || !pred(s)) continue;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bd) { bd = d; best = s; }
      }
    }
    return best ? { s: best, d: bd } : null;
  };
  const onEarth = () => g.world === 'earth' && !g.focusOverride;

  // ───────────── 짧은 연출(dt 로 흐른다) ─────────────
  const anims: Array<(dt: number) => boolean> = [];
  /** 낱개 모델(금상자·선물·돌멩이)의 자기 지오메트리만 버린다(공유 지오메트리는 그대로) */
  const disposeOwn = (root: THREE.Object3D) => {
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose(); });
  };
  const live = (o: THREE.Object3D) => { applyCurve(o); g.root.add(o); return o; };
  const popOut = (id: string, x: number, y: number, z: number) => {
    const o = popItemModel(colorOf(id));
    o.position.set(x, y + 0.2, z);
    live(o);
    let a = 0;
    anims.push((dt) => {
      a += dt;
      const u = Math.min(1, a / 1.1);
      o.position.y = y + 0.2 + Math.sin(u * Math.PI * 0.5) * 1.3;
      o.rotation.y += dt * 5;
      o.scale.setScalar(u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2);
      if (u < 1) return true;
      o.removeFromParent();
      for (const r of (o.userData.own as Array<{ dispose(): void }>) ?? []) r.dispose();
      return false;
    });
  };

  // ───────────── ① 화석 X 파기 ─────────────
  let digging: { s: Spot; left: number } | null = null;
  const fossilRoll = (island: string) => {
    const fx = g.ext.fossils;
    if (!fx || typeof fx.roll !== 'function') return null;
    return (r: () => number) => { try { return (fx.roll(r, island) as { id?: string } | null)?.id ?? null; } catch (e) { console.error('[treasure] fossils.roll', e); return null; } };
  };
  /** 이 자리에서 나올 것(자리 id 로 고정) */
  const digOutcome = (s: Spot): DigOutcome => rollDig(ctx.rng(`treasure-dig:${s.id}`), s.island, fossilRoll(s.island));
  const startDig = (s: Spot) => {
    if (digging) return;
    if (!unlocked('tool:shovel')) { toast(`🪏 ${needText('tool:shovel', '삽이 있어야 팔 수 있어요! 작업대에서 만들어 봐요')}`); return; }
    if (s.kind === 'x') {
      const o = digOutcome(s);
      if (o.kind !== 'keypiece' && !canAdd(o.id, o.n)) { toast('가방이 꽉 찼어요! 🎒 조금 비우고 다시 파요'); return; }
    }
    digging = { s, left: DIG_SEC };
    g.player.lock('treasure');
    g.player.act('dig', DIG_SEC);
    g.audio?.sfx?.('dig', { x: s.x, z: s.z });
  };
  const finishDig = (s: Spot) => {
    const f = F();
    markTaken(s);
    f.dug++;
    if (s.kind === 'mapx') return finishMap(s);
    const o = digOutcome(s);
    if (o.kind === 'keypiece') {
      if (g.econ?.addKeyPiece) g.econ.addKeyPiece('silver', 1); else give('t_rustykey', 1, 'dig');
      toast('🗝️ 은열쇠 조각을 파냈어요! (세 개 모으면 열쇠)');
      popOut('t_rustykey', s.x, s.y, s.z);
      harvest('dig', 'key:silver', 1, s.island);
    } else if (o.kind === 'fossil') {
      const sp = st.species.get(o.id);
      const model = (() => { try { return g.ext.fossils?.model?.(o.id) as THREE.Object3D | undefined; } catch { return undefined; } })();
      internalBag++;
      try {
        if (sp) g.ui.showCatch({ species: sp, model, line: '두근두근… 화석 조각이다!', activity: 'dig' });
        else give(o.id, 1, 'dig');
      } finally { internalBag--; }
      harvest('dig', o.id, 1, s.island);
    } else {
      const got = give(o.id, o.n, 'dig');
      if (got > 0) {
        toast(`${iconOf(o.id)} ${nameOf(o.id)} ${got > 1 ? `×${got} ` : ''}파냈어요!`);
        popOut(o.id, s.x, s.y, s.z);
        harvest('dig', o.id, got, s.island);
      }
    }
    save();
  };

  // ───────────── 보물지도 X → 금상자 ─────────────
  const finishMap = (s: Spot) => {
    const f = F();
    const n = String(s.map);
    delete f.maps[n];
    f.mapsDone++;
    takeBag(`it_map_${n}`);
    save();
    dropSpot(s.id);
    // 금상자가 쏙 올라와 뚜껑이 열린다
    const chest = goldChestModel();
    chest.position.set(s.x, s.y - 0.6, s.z);
    chest.rotation.y = Math.atan2(g.player.pos.x - s.x, g.player.pos.z - s.z);
    live(chest);
    let a = 0, opened = false;
    anims.push((dt) => {
      a += dt;
      chest.position.y = s.y - 0.6 + Math.min(1, a / 0.6) * 0.6;
      const lid = chest.userData.lid as THREE.Group;
      if (a > 0.7) lid.rotation.x = -Math.min(1, (a - 0.7) / 0.5) * 1.9;
      if (!opened && a > 0.9) {
        opened = true;
        openChest('gold', `treasure-map:${n}`);
        harvest('dig', `it_map_${n}`, 1, s.island);
      }
      if (a < 5) return true;
      chest.removeFromParent();
      disposeOwn(chest);
      return false;
    });
    toast(`🗺️ 보물지도 #${n} 의 금상자를 찾았어요!`);
  };

  // ───────────── ③ 병편지 ─────────────
  const unknownCards = () => CARD_RIDS.filter((rid) => !unlocked(`recipe:${rid}`));
  /** 병편지 하나 열기(굴림 키 = 연 순서) → 창으로 보여 준다 */
  const openBottle = (at: { x: number; z: number } = g.player.pos, force?: ReturnType<typeof rollBottle>): LetterView => {
    const f = F();
    const seq = ++f.bottles;
    const r = ctx.rng(`treasure-bottle:${seq}`);
    let kind = force ?? rollBottle(r, nearLaunch(at.x, at.z));
    const cards = unknownCards();
    if (kind === 'recipe' && !cards.length) kind = 'letter';
    let view: LetterView;
    if (kind === 'map') {
      const n = ++f.mapSeq;
      const tgt = pickMapTarget(ctx.rng(`treasure-map:${n}`));
      const m = { ...tgt, got: dayNow() };
      f.maps[String(n)] = m;
      if (give(`it_map_${n}`, 1, 'bottle') <= 0) toast('가방이 꽉 차서 보물지도는 수첩(L)에 적어 뒀어요 📒');
      if (planDay >= 0) { addSpot(mapSpot(String(n), m)); refreshAt(m.x, m.z); }
      view = { kind: 'map', n, map: m };
    } else if (kind === 'recipe') {
      const rid = cards[Math.floor(r() * cards.length)];
      const rec = RECIPE_TABLE.find((x) => x.id === rid)!;
      try { g.econ?.unlock?.(`recipe:${rid}`, 'bottle'); } catch (e) { console.error('[treasure] unlock', e); }
      f.recipes++;
      view = { kind: 'recipe', rid, name: rec.name, icon: rec.icon };
    } else if (kind === 'space') {
      const text = SPACE_LETTERS[f.spaceLetters % SPACE_LETTERS.length];
      f.spaceLetters++;
      emit({ type: 'mail', id: `treasure:space-letter:${f.spaceLetters}` });
      view = { kind: 'space', text };
    } else {
      const L = RESIDENT_LETTERS[Math.floor(r() * RESIDENT_LETTERS.length)];
      f.letters++;
      if (g.econ?.addStars) g.econ.addStars(3, 'letter');
      view = { kind: 'letter', from: L.from, icon: L.icon, text: L.text, stars: 3 };
    }
    save();
    const isl = I.worldSample(at.x, at.z).island?.id ?? 'sea';
    harvest('bottle', 't_bottle', 1, isl);
    g.audio?.sfx?.('bottle');
    g.hud.open('letter', 'read', view);
    return view;
  };
  const openBagBottle = (): LetterView | null => {
    if (!takeBag('t_bottle')) { toast('가방에 병편지가 없어요'); return null; }
    return openBottle(g.player.pos);
  };
  const mapList = () => Object.entries(F().maps).map(([n, map]) => ({ n: Number(n), map })).sort((a, b) => a.n - b.n);
  g.hud.registerPanel(letterPanel({ maps: mapList, bottles: () => st.bag.t_bottle ?? 0, openBagBottle }));
  g.hud.registerHotkey({
    id: 'treasure:letter', code: 'KeyL', label: '병편지', hint: true, panel: 'letter',
    when: () => (st.bag.t_bottle ?? 0) > 0 || Object.keys(F().maps).length > 0 || g.hud.isOpen('letter'),
    run: () => {
      if (g.hud.isOpen('letter')) { g.hud.close(); return; }
      if ((st.bag.t_bottle ?? 0) > 0) openBagBottle(); else g.hud.open('letter', 'maps');
    },
  });
  // 낚시 등으로 가방에 병편지가 들어오면 알려 준다
  st.on((e) => {
    if (e.type === 'bag' && e.id === 't_bottle' && Number(e.delta) > 0 && internalBag === 0) toast('🍾 병편지를 건졌어요! L 키로 열어 봐요');
  });

  // ───────────── ②·④·⑤ 줍기 ─────────────
  const pickLabel: Partial<Record<SpotKind, string>> = {
    shell: '조개껍데기 줍기', feather: '깃털 줍기', stardust: '별가루 줍기 ✨', meteor: '운석 조각 줍기', bottle: '병편지 줍기 🍾', seabottle: '병편지 건지기 🍾',
    seaweed: '해초 따기', coral: '산호 조각 줍기', oyster: '진주굴 열기',
  };
  const pickSpot = (s: Spot) => {
    const f = F();
    if (s.kind === 'bottle' || s.kind === 'seabottle') {
      markTaken(s);
      f.picked++;
      g.player.act('pick', 0.5);
      openBottle(s);
      return;
    }
    let item = s.item ?? 'm_shell';
    if (s.kind === 'oyster') item = ctx.rng(`treasure-pearl:${s.id}`)() < PEARL_CHANCE ? 'm_pearl' : 'm_shell';
    const n = s.n ?? 1;
    const got = give(item, n, 'pick');
    if (got <= 0) return; // 가방이 꽉 참(경제가 알려 준다)
    markTaken(s);
    f.picked++;
    if (s.kind === 'stardust' || s.kind === 'meteor') { if (f.crater.day !== planDay) f.crater = { day: planDay, got: 0 }; f.crater.got += got; }
    save();
    g.player.act('pick', 0.5);
    const kind: HarvestKind = s.kind === 'oyster' ? (item === 'm_pearl' ? 'pearl' : 'shell') : (s.harvest ?? 'junk');
    harvest(kind, item, got, s.island);
    toast(`${iconOf(item)} ${nameOf(item)} +${got}${item === 'm_pearl' ? ' — 반짝반짝 진주다!' : ''}`);
  };

  g.addProvider('treasure-dig', (p) => {
    if (!onEarth() || p.mode !== 'ground' || digging) return null;
    const n = nearest((s) => s.kind === 'x' || s.kind === 'mapx', DIG_R);
    if (!n) return null;
    const shovel = unlocked('tool:shovel');
    const label = !shovel ? '파기 (삽이 필요해요)' : n.s.kind === 'mapx' ? '보물지도 X 파기! 🗺️' : '반짝 땅 파기 ✨';
    return { id: 'treasure-dig', label, dist: n.d, use: () => startDig(n.s) };
  });
  g.addProvider('treasure-pick', (p) => {
    if (!onEarth() || digging) return null;
    const ground = p.mode === 'ground';
    const swim = p.mode === 'swim';
    if (!ground && !swim) return null;
    const n = nearest((s) => !s.dive && s.kind !== 'x' && s.kind !== 'mapx' && (s.kind === 'seabottle' ? true : ground), swim ? SEA_PICK_R : PICK_R);
    const gft = nearestGift(GIFT_R);
    if (gft && (!n || gft.d < n.d)) return { id: 'treasure-gift', label: '풍선 선물 열기 🎁', dist: gft.d, use: () => openGift(gft.g) };
    if (!n) return null;
    const label = n.s.kind === 'junk' ? `${nameOf(n.s.item ?? 't_tire')} 줍기` : pickLabel[n.s.kind] ?? '줍기';
    return { id: 'treasure-pick', label, dist: n.d, use: () => pickSpot(n.s) };
  });
  g.addProvider('treasure-dive', (p) => {
    if (!onEarth() || p.mode !== 'dive') return null;
    const n = nearest((s) => !!s.dive, DIVE_R);
    if (!n) return null;
    return { id: 'treasure-dive', label: pickLabel[n.s.kind] ?? '줍기', dist: n.d, use: () => pickSpot(n.s) };
  });

  // ───────────── ② 풍선 선물 ─────────────
  const balloons = new Map<string, LiveBalloon>();
  const planCache = new Map<string, BalloonPlan>();
  const planFor = (day: number, hour: number, island: string) => {
    const k = `${day}:${Math.floor(hour)}:${island}`;
    let b = planCache.get(k);
    if (!b) {
      b = balloonPlan(day, hour, island)!;
      if (planCache.size > 64) planCache.clear();
      planCache.set(k, b);
    }
    return b;
  };
  /** 풍선 자리(지금 시각) */
  const balloonPos = (b: BalloonPlan, t: number, out: THREE.Vector3) => {
    const sec = b.key.includes(':dbg:') ? t * 0.2 : (hourNow() % 1) * HOUR_SEC;
    const p = balloonXZ(b, b.key.includes(':dbg:') ? 0 : sec);
    const base = Math.max(I.heightAt(p.x, p.z), I.heightAt(b.x0, b.z0), 0);
    return out.set(p.x + Math.sin(t * 0.35 + b.phase) * 0.6, base + b.alt + Math.sin(t * 0.9 + b.phase) * 0.25, p.z + Math.cos(t * 0.3 + b.phase) * 0.6);
  };
  const dropBalloon = (lb: LiveBalloon) => {
    if (lb.obj) {
      lb.obj.removeFromParent();
      lb.obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      lb.obj = null;
      lb.tick = null;
    }
  };
  const showBalloon = (lb: LiveBalloon) => {
    if (lb.obj) return;
    let tick: ((t: number) => void) | null = null;
    const obj = buildBalloonGift({ onUpdate: (fn) => { tick = fn; }, heightAt: (x, z) => I.heightAt(x, z) });
    obj.name = `treasure-balloon:${lb.plan.key}`;
    obj.scale.setScalar(1.6);
    // 소품 키트 메시는 재질 키(userData.mk)만 들고 온다 — 공유 정점색 재질을 건다
    obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.material = m.userData.mk === 'gloss' ? gloss() : m.userData.mk === 'paint' ? paintMat() : matte(); } });
    lb.obj = live(obj) as THREE.Group;
    lb.tick = tick;
  };
  const isPopped = (key: string) => F().poppedKeys.includes(key);
  let balloonClock = 0;
  const syncBalloons = () => {
    const day = dayNow(), hour = hourNow();
    const p = g.player.pos;
    const want = new Set<string>();
    if (onEarth()) {
      for (const isl of MAIN_ISLANDS) {
        const d = I.islandById(isl)!;
        if (Math.hypot(p.x - d.x, p.z - d.z) > d.r + BALLOON_SHOW) continue;
        const b = planFor(day, hour, isl);
        if (isPopped(b.key)) continue;
        want.add(b.key);
        if (!balloons.has(b.key)) balloons.set(b.key, { plan: b, obj: null, tick: null, pos: new THREE.Vector3() });
      }
    }
    for (const [k, lb] of balloons) {
      if (lb.debug && !isPopped(k) && onEarth()) continue;
      if (!want.has(k)) { dropBalloon(lb); balloons.delete(k); }
    }
  };
  const updateBalloons = (t: number) => {
    const p = g.player.pos;
    for (const lb of balloons.values()) {
      balloonPos(lb.plan, t, lb.pos);
      const near = Math.hypot(lb.pos.x - p.x, lb.pos.z - p.z) < BALLOON_SHOW;
      if (near) showBalloon(lb); else dropBalloon(lb);
      if (lb.obj) {
        lb.tick?.(t);
        // 풍선 매듭 = 위치, 선물 상자는 1.05 m 아래(1.6배)
        lb.obj.position.copy(lb.pos);
      }
    }
  };
  /** 카메라 앞 방향(수평) */
  const camFwd = () => ({ x: -Math.sin(g.cam?.yaw ?? 0), z: -Math.cos(g.cam?.yaw ?? 0) });
  const eye = () => new THREE.Vector3(g.player.pos.x, g.player.pos.y + 1.3, g.player.pos.z);
  /** 땅이 가리지 않나(6점 표본) */
  const clearLine = (a: THREE.Vector3, b: THREE.Vector3) => {
    for (let i = 1; i < 6; i++) {
      const u = i / 6;
      const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, z = a.z + (b.z - a.z) * u;
      if (g.groundAt(x, z) > y + 0.2) return false;
    }
    return true;
  };
  const aimTarget = (): LiveBalloon | null => {
    const e = eye(), fwd = camFwd();
    let best: LiveBalloon | null = null, bd = Infinity;
    for (const lb of balloons.values()) {
      if (isPopped(lb.plan.key) || lb.aimed) continue;
      const tgt = lb.pos.clone().add(new THREE.Vector3(0, 0.4, 0));
      if (!inSlingCone(e, tgt, fwd) || !clearLine(e, tgt)) continue;
      const d = e.distanceTo(tgt);
      if (d < bd) { bd = d; best = lb; }
    }
    return best;
  };
  const hinted = new Set<string>();
  g.addProvider('treasure-balloon', (p) => {
    if (!onEarth() || p.mode !== 'ground' && p.mode !== 'swim') return null;
    const lb = aimTarget();
    if (!lb) return null;
    if (!unlocked('tool:slingshot')) {
      if (!hinted.has(lb.plan.key)) { hinted.add(lb.plan.key); toast('🎈 풍선 선물이다! 새총이 있으면 맞출 수 있어요 (작업대에서 뚝딱)'); }
      return null;
    }
    return { id: 'treasure-balloon', label: '새총으로 맞추기', key: 'KeyF', priority: ALT_PRIORITY.slingshot, dist: lb.pos.distanceTo(p.pos), use: () => shoot(lb) };
  });

  const shoot = (lb: LiveBalloon) => {
    if (lb.aimed || isPopped(lb.plan.key)) return;
    lb.aimed = true;
    g.player.act('cast', 0.6);
    g.audio?.sfx?.('cast', { pitch: 1.6 });
    const peb = pebbleModel();
    const from = eye();
    peb.position.copy(from);
    live(peb);
    const T = Math.max(0.25, Math.min(0.6, from.distanceTo(lb.pos) / 40));
    let a = 0;
    anims.push((dt) => {
      a += dt;
      const u = Math.min(1, a / T);
      const to = lb.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
      peb.position.lerpVectors(from, to, u);
      peb.position.y += Math.sin(u * Math.PI) * 1.5;
      if (u < 1) return true;
      peb.removeFromParent();
      disposeOwn(peb);
      pop(lb);
      return false;
    });
  };
  const pop = (lb: LiveBalloon) => {
    const f = F();
    if (isPopped(lb.plan.key)) return;
    f.popped++;
    f.poppedKeys.push(lb.plan.key);
    save();
    const at = lb.pos.clone();
    dropBalloon(lb);
    balloons.delete(lb.plan.key);
    g.audio?.sfx?.('balloon-pop', { x: at.x, z: at.z });
    toast('팡! 🎈 선물이 떨어져요!');
    // 색종이
    const burst = confettiBurst(36, ctx.rng(`treasure-confetti:${lb.plan.key}`));
    burst.position.copy(at).add(new THREE.Vector3(0, 0.8, 0));
    live(burst);
    const parts = burst.userData.parts as Array<{ v: THREE.Vector3; p: THREE.Vector3; spin: THREE.Vector3 }>;
    let a = 0;
    const e = new THREE.Euler();
    anims.push((dt) => {
      a += dt;
      parts.forEach((q, i) => {
        q.v.y -= 6 * dt; q.v.multiplyScalar(1 - dt * 1.5);
        q.p.addScaledVector(q.v, dt);
        e.set(q.spin.x * a, q.spin.y * a, q.spin.z * a);
        _q.setFromEuler(e);
        burst.setMatrixAt(i, _m.compose(q.p, _q, _s.set(1, 1, 1)));
      });
      burst.instanceMatrix.needsUpdate = true;
      (burst.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - a / 1.6);
      if (a < 1.6) return true;
      burst.removeFromParent();
      burst.dispose();
      return false;
    });
    spawnGift(lb.plan.key, at.x, at.y - 1.6, at.z, lb.plan.island);
  };

  // 떨어지는 선물
  const gifts = new Map<string, LiveGift>();
  const spawnGift = (key: string, x: number, y: number, z: number, island: string, settled = false) => {
    if (gifts.has(key)) return;
    const obj = giftModel();
    obj.position.set(x, y, z);
    live(obj);
    let body: PhysBody | null = null;
    if (!settled) {
      try {
        body = g.physics.add({
          shape: { kind: 'box', hx: 0.21, hy: 0.18, hz: 0.21 }, type: 'dynamic', position: { x, y, z }, mesh: obj,
          restitution: 0.35, friction: 0.8, linearDamping: 0.2, angularDamping: 0.6, buoyancy: 1.6, tag: `treasure-gift:${key}`,
        });
      } catch (e) { console.error('[treasure] gift body', e); }
    }
    gifts.set(key, { key, obj, body, age: settled ? 99 : 0, island });
  };
  const settleGift = (lg: LiveGift) => {
    if (lg.body) { try { lg.body.remove(); } catch { /* 이미 사라짐 */ } lg.body = null; }
    const p = lg.obj.position;
    const gy = g.groundAt(p.x, p.z);
    const wy = I.waterLevelAt(p.x, p.z);
    // 땅 아래로 빠졌거나(물리 바닥이 늦게 생김) 공중에 걸려 있으면 땅·물 위에 내려놓는다
    const floor = Math.max(gy, Number.isFinite(wy) ? wy - 0.1 : gy) + 0.18;
    if (!Number.isFinite(p.y) || p.y < gy - 0.2 || p.y > floor + 1.5) p.y = floor;
    // 물 위로 떨어졌으면 바닥에 가라앉지 않고 수면에 동동 띄워 둔다(열 수 있게)
    if (Number.isFinite(wy) && wy > gy && p.y < wy) p.y = wy + 0.08;
    lg.obj.quaternion.identity();
    F().gifts[lg.key] = { x: p.x, y: p.y, z: p.z, island: lg.island };
    save();
  };
  const updateGifts = (dt: number) => {
    const p = g.player.pos;
    for (const lg of gifts.values()) {
      if (!lg.body) continue;
      lg.age += dt;
      const o = lg.obj.position;
      // 지면 아래로 빠지면 다시 올려 놓는다(물리 바닥이 아직 없을 때)
      if (o.y < g.groundAt(o.x, o.z) - 0.6) { lg.body.body.setTranslation({ x: o.x, y: g.groundAt(o.x, o.z) + 0.4, z: o.z }, true); }
      if (lg.age > 5 || Math.hypot(o.x - p.x, o.z - p.z) > 150) settleGift(lg);
    }
    // 저장된(안 연) 선물: 가까우면 놓아 두고, 멀면 치운다
    for (const [k, s] of Object.entries(F().gifts)) {
      const near = Math.hypot(s.x - p.x, s.z - p.z) < 220;
      const lg = gifts.get(k);
      if (near && !lg) spawnGift(k, s.x, s.y, s.z, s.island, true);
      else if (!near && lg && !lg.body) { lg.obj.removeFromParent(); gifts.delete(k); }
    }
  };
  const nearestGift = (maxD: number): { g: LiveGift; d: number } | null => {
    const p = g.player.pos;
    let best: LiveGift | null = null, bd = maxD;
    for (const lg of gifts.values()) {
      const o = lg.obj.position;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd && Math.abs(o.y - p.y) < 3) { bd = d; best = lg; }
    }
    return best ? { g: best, d: bd } : null;
  };
  const openGift = (lg: LiveGift) => {
    if (lg.body) settleGift(lg);
    const f = F();
    delete f.gifts[lg.key];
    gifts.delete(lg.key);
    lg.obj.removeFromParent();
    disposeOwn(lg.obj);
    save();
    g.player.act('pick', 0.5);
    openChest('wood', `treasure-gift:${lg.key}`);
    const got = give('m_balloon_scrap', 1, 'balloon');
    harvest('balloon', 'm_balloon_scrap', Math.max(1, got), lg.island);
  };

  // ───────────── 매 프레임 ─────────────
  let fxClock = 0;
  g.onUpdate((t, dt) => {
    glintPulse(t);
    ensureDay();
    // 파기 끝
    if (digging) {
      digging.left -= dt;
      if (digging.left <= 0) {
        const s = digging.s;
        digging = null;
        g.player.unlock('treasure');
        try { finishDig(s); } catch (e) { console.error('[treasure] dig', e); }
      }
    }
    // 풍선(0.25초마다 자리 정리, 위치는 매 프레임)
    balloonClock -= dt;
    if (balloonClock <= 0 || dt === 0) { balloonClock = 0.25; syncBalloons(); }
    updateBalloons(t);
    updateGifts(dt);
    for (let i = anims.length - 1; i >= 0; i--) {
      let keep = false;
      try { keep = anims[i](dt); } catch (e) { console.error('[treasure] anim', e); }
      if (!keep) anims.splice(i, 1);
    }
    // 가까운 칸만 반짝임·거품·떠 있는 병 흔들기
    fxClock += dt;
    const p = g.player.pos;
    for (const c of cells.values()) {
      const mx = (c.cx + 0.5) * CELL, mz = (c.cz + 0.5) * CELL;
      const d = Math.hypot(mx - p.x, mz - p.z);
      if (d > 140) continue;
      for (const grp of [c.items, c.fx]) {
        if (!grp) continue;
        for (const a of grp.userData.anim as Array<{ mesh: THREE.InstancedMesh; spots: Spot[]; kind: string }>) {
          if (a.kind === 'float') a.spots.forEach((s, i) => a.mesh.setMatrixAt(i, spotMatrix(s, t)));
          else if (a.kind === 'glint') a.spots.forEach((s, i) => a.mesh.setMatrixAt(i, glintMatrix(s, t)));
          else if (a.kind === 'bubble' && d < 110) a.spots.forEach((s, i) => { for (let b = 0; b < BUB; b++) a.mesh.setMatrixAt(i * BUB + b, bubbleMatrix(s, b, t)); });
          a.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  });
  g.onWorld(() => { for (const lb of balloons.values()) dropBalloon(lb); balloons.clear(); });

  // ───────────── 디버그 · ext ─────────────
  const ahead = (d: number) => {
    const f = camFwd(), p = g.player.pos;
    return { x: p.x + f.x * d, z: p.z + f.z * d };
  };
  const debugSpawn = (kind: string): unknown => {
    ensureAround(g.player.pos.x, g.player.pos.z, 60);
    if (kind === 'map') return openBottle(g.player.pos, 'map');
    if (kind === 'balloon') {
      const a = ahead(16);
      const key = `balloon:dbg:${++dbgSeq}`;
      const b: BalloonPlan = { key, island: I.worldSample(a.x, a.z).island?.id ?? 'home', day: planDay, hour: 0, x0: a.x, z0: a.z, dx: 1, dz: 0, speed: 0, alt: 8, phase: 0 };
      const lb: LiveBalloon = { plan: b, obj: null, tick: null, pos: new THREE.Vector3(), debug: true };
      balloons.set(key, lb);
      balloonPos(b, g.time, lb.pos);
      showBalloon(lb);
      return { key, x: lb.pos.x, y: lb.pos.y, z: lb.pos.z };
    }
    if (kind === 'gift') {
      const a = ahead(2.5);
      const key = `gift:dbg:${++dbgSeq}`;
      spawnGift(key, a.x, g.groundAt(a.x, a.z) + 4, a.z, I.worldSample(a.x, a.z).island?.id ?? 'home');
      return { key };
    }
    if (kind === 'mapx') {
      const view = openBottle(g.player.pos, 'map') as Extract<LetterView, { kind: 'map' }>;
      const a = ahead(2.2);
      const m = F().maps[String(view.n)];
      dropSpot(`mapx:${view.n}`);
      Object.assign(m, { x: a.x, z: a.z, y: g.groundAt(a.x, a.z), islet: I.worldSample(a.x, a.z).island?.id ?? m.islet });
      addSpot(mapSpot(String(view.n), m));
      refreshAt(m.x, m.z);
      save();
      return { n: view.n, ...m };
    }
    const K: Record<string, [SpotKind, string | undefined, HarvestKind | undefined]> = {
      x: ['x', undefined, 'dig'], bottle: ['bottle', 't_bottle', 'bottle'], seabottle: ['seabottle', 't_bottle', 'bottle'], shell: ['shell', 'm_shell', 'shell'],
      feather: ['feather', 'm_feather', 'feather'], stardust: ['stardust', 'm_stardust', 'stardust'], meteor: ['meteor', 'm_meteor', 'meteor'],
      tire: ['junk', 't_tire', 'junk'], junk: ['junk', 't_tire', 'junk'], seaweed: ['seaweed', 'm_seaweed', 'seaweed'], coral: ['coral', 'm_coral', 'coral'], oyster: ['oyster', 'm_pearl', 'pearl'],
    };
    const k = K[kind];
    if (!k) { console.warn(`[treasure] 모르는 종류 '${kind}'`); return null; }
    const a = ahead(kind === 'seabottle' ? 0 : 2);
    const y = g.groundAt(a.x, a.z);
    const s: Spot = {
      id: `${k[0]}:dbg:${planDay}:${++dbgSeq}`, kind: k[0], island: I.worldSample(a.x, a.z).island?.id ?? 'home', x: a.x, z: a.z, y,
      rot: dbgSeq * 1.3, item: k[1], n: 1, harvest: k[2], dive: ['seaweed', 'coral', 'oyster'].includes(k[0]), floats: k[0] === 'seabottle',
    };
    extras.push(s);
    addSpot(s);
    refreshAt(s.x, s.z);
    return s;
  };
  const digsOf = (island?: string) => {
    ensureDay();
    const list = island ? [island] : [...MAIN_ISLANDS];
    const out: Array<Spot & { taken: boolean }> = [];
    for (const id of list) { ensureIsland(id); for (const s of islandPlans.get(id) ?? []) if (s.kind === 'x') out.push({ ...s, taken: taken.has(s.id) }); }
    return out;
  };
  const stats = () => {
    const f = F();
    return { popped: f.popped, dug: f.dug, picked: f.picked, bottles: f.bottles, maps: Object.keys(f.maps).length, mapsDone: f.mapsDone, letters: f.letters, recipes: f.recipes, crater: { ...f.crater } };
  };
  const balloonList = () => [...balloons.values()].map((lb) => ({ key: lb.plan.key, island: lb.plan.island, x: lb.pos.x, y: lb.pos.y, z: lb.pos.z, popped: isPopped(lb.plan.key), live: !!lb.obj }));
  const api = {
    digs: digsOf,
    balloons: balloonList,
    bottles: () => [...byId.values()].filter((s) => s.kind === 'bottle' || s.kind === 'seabottle').map((s) => ({ ...s, taken: taken.has(s.id) })),
    /** 오늘 계산된 자리(종류로 거르기) — 크레이터·해저·바다 병편지는 늘, 섬 자리는 계산된 섬만 */
    spots: (kind?: SpotKind) => { ensureDay(); ensureWorld(); return [...byId.values()].filter((s) => !kind || s.kind === kind).map((s) => ({ ...s, taken: taken.has(s.id) })); },
    maps: () => mapList().map(({ n, map }) => ({ n, islet: map.islet, x: map.x, z: map.z })),
    stats,
    debugSpawn,
    openBottle: (at?: { x: number; z: number }) => openBottle(at ?? g.player.pos),
  };
  g.ext.treasure = api;
  if (typeof window !== 'undefined') {
    (window as unknown as { __treasure?: unknown }).__treasure = {
      ...api,
      spawn: debugSpawn,
      state: () => ({ ...stats(), day: planDay, taken: [...taken], gifts: Object.keys(F().gifts), islets: ISLETS }),
      /** 가장 가까운 풍선을 바로 터뜨린다(조준·새총 무시) */
      popNearest: () => {
        syncBalloons();
        updateBalloons(g.time);
        let best: LiveBalloon | null = null, bd = Infinity;
        for (const lb of balloons.values()) { const d = lb.pos.distanceTo(g.player.pos); if (d < bd && !isPopped(lb.plan.key)) { bd = d; best = lb; } }
        if (best) pop(best);
        return best?.plan.key ?? null;
      },
      /** 가장 가까운 X 를 바로 판다(거리·삽 무시) */
      digNearest: () => {
        const n = nearest((s) => s.kind === 'x' || s.kind === 'mapx', 1e9);
        if (n) finishDig(n.s);
        return n?.s.id ?? null;
      },
      pickNearest: () => {
        const n = nearest((s) => s.kind !== 'x' && s.kind !== 'mapx', 1e9);
        if (n) pickSpot(n.s);
        return n?.s.id ?? null;
      },
      plan: (island: string) => { ensureDay(); ensureIsland(island); return islandPlans.get(island); },
    };
  }
}
