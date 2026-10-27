// hidden — 숨은 곳 B(GDD 2.2.2): 산호빛섬 · 모래시계섬 · 별똥별섬의 숨은 곳 8곳 + 모래 피라미드 퍼즐(GDD 2.2 P1).
//  산호빛섬  ① coral-clam        석호 바닥 대왕조개 — 9초마다 입을 벌릴 때 E 로 진주(하루 한 알)
//            ② coral-pirate-cave 해안 바위 동굴 → 실내(꼬마 해적 꽃게 · 보물 더미 · 첫 금상자, 그다음 하루 한 번 은상자)
//            ③ coral-sandbar     쪼꼬미섬 C 까지 이어진 모래톱 — 아침 썰물(5~9시)에만 물 위로 올라온다(자체 메시 + 정적 충돌체 + 땅 공급자) · 조개 줍기
//  모래시계섬 ④ desert-temple     모래폭풍일 때만 보이는 고대 신전(수요일 sandtemple 은 calendar 가 모래폭풍을 건다) — 제단 E 로 상자
//            ⑤ desert-water-cave 협곡 바닥 구멍 → 실내 지하 샘(마시면 speed 버프 30분 · 하루 한 번 은상자)
//            ⑥ desert-trex       화석 절벽 꼭대기 완전한 티라노 골격 — E 로 도감에 골격 기록(collect keep:false)
//  별똥별섬  ⑦ launch-meteorite  크레이터 호수 가운데 운석 → 실내 무중력 방(중력 −6, 떠 있는 바위 · 별가루 구슬 6 · 운석 핵)
//            ⑧ launch-glide      메사 절벽 활공 출발대 + 상승 기류(활공·낙하 중 기둥 안이면 위로 밀어 올린다)
//  (launch-probe 는 seaworld 가 블랙박스를 주울 때 알린다 — 여기서는 다루지 않는다)
//  모래 피라미드: 정문(village 피라미드 앞) → 실내 방 3개(밀기 블록 + 발판, 풀면 문이 열린 채로 남는다 · 레버로 되돌리기) → 황금 보물방
//                 (황금풍뎅이 받침대: 처음엔 꼭, 그다음 날마다 35% · 금상자 처음 한 번, 그다음 하루 한 번 은상자).
// 숨은 곳마다 처음 한 번 secret-found {id} + 카드. 바깥 모델은 청크로(가까이 갈 때만), 실내는 ext.interiors 칸 12~15(들어갈 때 만든다).
//
// game.ext.hidden (주인: hidden) = {
//   ids: HiddenId[] · found(id) → boolean · list() → 찾은 id[] · spots() → {id, x, z, island}[]
//   tide() → {lift, walkable, top}       — 지금 모래톱(0..1, 걸을 수 있나, 꼭대기 높이)
//   templeVisible() → boolean · temple() → 0..1(보이는 정도)
//   pyramid: { states(), solved(k?), allSolved() } · enter(room:'pirate'|'water'|'meteor'|'pyramid') → boolean
// }
// flags.hidden = { v, found[], daily{key: day}, once{key: true}, pyramid{rooms[{blocks, solved, moves}]} } (hidden/logic.ts readHiddenFlags)
// 내보내는 이벤트: secret-found{id} · harvest{kind:'pearl'|'shell'|'stardust'|'meteor'} · (상자는 econ.openChest 가 chest-open 을 쏜다)
// 디버그: window.__hidden = { state(), found(), spots(), goto(id|'pyramid'), enter(room), exit(), tide(h?), storm(on?), discover(id),
//   pearl(), push(dir), solve(k?), reset(k?), pyramid(), glide(), temple(), shells() }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import type { HarvestKind, SecretId } from '../core/events';
import { worldFeatures } from '../core/world';
import {
  HIDDEN_IDS, SPOTS, TIDE, isHiddenId, tideLift, sandbarWalkable, sandbarTopY, tideFalling, hoursToLowTide, segProject, sandbarProfile, sandbarShells,
  templeVisible, fadeToward, templeSolid, clamOpen, clamReachable, CLAM, updraftLift,
  readHiddenFlags, markFound, dailyReady, takeDaily, takeOnce, chestTierFor, scarabToday, type HiddenId, type HiddenFlags,
} from './hidden/logic';
import {
  ROOMS, PUZZLE_ROOMS, CELL, DIRS, push as pushBlock, resetRoom, loadStates, saveStates, solvedState, allSolved, covered, cellToLocal, localToCell,
  type Dir, type RoomState,
} from './hidden/puzzle';
import {
  buildClam, buildPirateMouth, buildTideSign, buildTemple, buildWaterHole, buildTrexSkeleton, buildMeteorite, buildGlide, buildPyramidMark,
  buildScarab, buildSparkle, pickupShellGeos, DECK_Y, DECK_LEN, type ColBox, type ClamModel, type TempleModel, type GlideModel,
} from './hidden/models';
import { buildPirateRoom, buildWaterRoom, buildMeteorRoom, buildPyramidRoom, tintPlate, type PirateRoom, type WaterRoom, type MeteorRoom, type PyramidRoom } from './hidden/rooms';
import { matBase, disposeTree } from './hidden/kit';

export const order = 31;

/** 실내 칸(interiors/logic interiorOrigin) — 0 집 · 1 박물관 · 2~11 secrets 몫 · 12~15 여기 */
const SLOT = { pirate: 12, water: 13, meteor: 14, pyramid: 15 } as const;
type RoomKey = keyof typeof SLOT;
const ROOM_ID: Record<RoomKey, string> = { pirate: 'hidden-pirate', water: 'hidden-water', meteor: 'hidden-meteor', pyramid: 'hidden-pyramid' };
/** 무중력 방 중력 */
const METEOR_GRAVITY = -6;
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DIR_ARROW: Record<Dir, string> = { N: '⬆', S: '⬇', E: '➡', W: '⬅' };

interface Anchor { id: HiddenId | 'pyramid'; x: number; z: number; y: number; rotY: number }
interface LiveSpot { id: Anchor['id']; obj: THREE.Group; bodies: Array<{ remove(): void }>; update?: (t: number, dt: number) => void }

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const g: Game = game;
  const st = g.state;
  const I = ctx.island;
  const root = new THREE.Group();
  root.name = 'hidden';

  // ───────────── 저장·도우미 ─────────────
  // 정리된 flags.hidden 을 들고 있다가, 불러오기 등으로 객체가 바뀌었을 때만 다시 정리(매 프레임 할당 없음)
  let flagsC: HiddenFlags | null = null;
  const F = (): HiddenFlags => (flagsC && st.flags.hidden === flagsC ? flagsC : (flagsC = readHiddenFlags(st.flags)));
  F();
  const save = () => st.save();
  const day = () => { const d = g.env?.day; if (typeof d === 'number') return d; const e = g.econ?.day?.(); return typeof e === 'number' ? e : 0; };
  const hour = () => { const h = g.env?.hour; return typeof h === 'number' && Number.isFinite(h) ? h : 12; };
  const toast = (s: string) => g.ui.toast(s);
  const sfx = (name: string, at?: THREE.Vector3) => g.audio?.sfx(name, at ? { x: at.x, z: at.z } : undefined);
  const give = (id: string, n = 1): number => {
    const e = g.econ;
    if (e && typeof e.give === 'function') return e.give(id, n, 'hidden');
    st.addItem(id, n);
    return n;
  };
  const harvest = (kind: HarvestKind, item: string, n: number, island: string) => st.emit({ type: 'harvest', kind, item, n, island });
  const openChest = (tier: 'gold' | 'silver', where: string) => {
    const e = g.econ;
    if (e && typeof e.openChest === 'function') return e.openChest(tier, where);
    const coins = tier === 'gold' ? 5000 : 1500;
    st.addCoins(coins, 'chest');
    toast(`💰 ${coins.toLocaleString()} 코인!`);
    return null;
  };
  /** 처음 찾았을 때만: secret-found + 카드 + 소리 */
  const discover = (id: HiddenId) => {
    if (!markFound(F(), id)) return false;
    save();
    st.emit({ type: 'secret-found', id: id as SecretId });
    const s = SPOTS[id];
    g.hud.card({ title: `${s.icon} 숨은 곳 발견! · ${s.name}`, body: s.body, icon: s.icon, color: s.color, ms: 6500 });
    sfx('discover');
    return true;
  };
  const isFound = (id: string) => F().found.includes(id);
  const onEarth = () => g.world === 'earth';
  const interiors = () => g.ext.interiors as undefined | {
    register(def: unknown): () => void; enter(id: string): boolean; exit(): boolean; current(): string | null; origin(i: number): { x: number; y: number; z: number };
  };
  const insideRoom = (k: RoomKey) => interiors()?.current?.() === ROOM_ID[k];
  const insideAny = () => !!interiors()?.current?.();
  const P = I.PLACES.hidden;

  // ───────────── 자리 계산(결정적) ─────────────
  const H = (x: number, z: number) => I.heightAt(x, z);
  /** 그 자리에서 가장 낮아지는 쪽(해안·절벽 방향) */
  const downhill = (x: number, z: number, r: number) => {
    let best = 0, bh = Infinity;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, h = H(x + Math.cos(a) * r, z + Math.sin(a) * r); if (h < bh) { bh = h; best = a; } }
    return { x: Math.cos(best), z: Math.sin(best) };
  };
  const rotTo = (d: { x: number; z: number }) => Math.atan2(d.x, d.z);
  const lagoon = (() => { const p = P['coral-clam']; return { x: p.x, z: p.z, y: H(p.x, p.z) }; })();
  const pirate = (() => { const p = P['coral-pirate-cave']; const d = downhill(p.x, p.z, 10); return { x: p.x, z: p.z, y: H(p.x, p.z), dir: d }; })();
  const sandbarFeat = worldFeatures().find((f) => f.kind === 'sandbar');
  const SB = sandbarFeat?.pts ? { a: sandbarFeat.pts[0], b: sandbarFeat.pts[1] } : { a: { x: P['coral-sandbar'].x, z: P['coral-sandbar'].z }, b: { x: 1200, z: 300 } };
  const SBdir = (() => { const dx = SB.b.x - SB.a.x, dz = SB.b.z - SB.a.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l, len: l }; })();
  const temple = (() => { const p = P['desert-temple']; const dk = I.PLACES.docks.desert; const d = { x: dk.x - p.x, z: dk.z - p.z }; const l = Math.hypot(d.x, d.z) || 1; return { x: p.x, z: p.z, y: H(p.x, p.z), dir: { x: d.x / l, z: d.z / l } }; })();
  const waterCave = (() => { const p = P['desert-water-cave']; return { x: p.x, z: p.z, y: H(p.x, p.z) }; })();
  const trex = (() => { const p = P['desert-trex']; const d = downhill(p.x, p.z, 22); return { x: p.x, z: p.z, y: H(p.x, p.z), dir: d }; })();
  const crater = I.PLACES.crater;
  const meteor = { x: crater.x, z: crater.z, y: crater.level - 0.3 };
  const glide = (() => {
    const p = P['launch-glide'], top = H(p.x, p.z);
    // 절벽 쪽: 40 m 앞이 가장 낮은 방향
    const d = downhill(p.x, p.z, 40);
    let edge = 0;
    for (let r = 0; r < 60; r += 1) { if (H(p.x + d.x * r, p.z + d.z * r) < top - 1.2) { edge = r; break; } }
    const start = Math.max(0, edge - (DECK_LEN - 3));
    const x = p.x + d.x * start, z = p.z + d.z * start;
    const y = Math.max(...[0, 2, 4, 6].map((k) => H(x + d.x * k, z + d.z * k)));
    const colX = x + d.x * (DECK_LEN + 6), colZ = z + d.z * (DECK_LEN + 6);
    return { x, z, y, dir: d, col: { x: colX, z: colZ, base: Math.max(0, H(colX, colZ)) }, top };
  })();
  const pyramid = (() => {
    const lm = g.geo?.landmarks?.find?.((l) => l.id === 'lm:desert:pyramid');
    const d0 = I.islandById('desert')!, dk = I.PLACES.docks.desert;
    const a0 = Math.atan2(dk.z - d0.z, dk.x - d0.x);
    const c = lm ? { x: lm.x, z: lm.z } : I.coastSpot('desert', a0 + 0.22, 95);
    const dx = dk.x - c.x, dz = dk.z - c.z, l = Math.hypot(dx, dz) || 1;
    const front = { x: dx / l, z: dz / l };
    // village 와 같은 받침 높이(발자국 20.8 m 안 최저 − 0.8)
    let base = H(c.x, c.z);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; base = Math.min(base, H(c.x + Math.cos(a) * 20.8, c.z + Math.sin(a) * 20.8)); }
    base -= 0.8;
    // 네 면 가운데 바깥 땅이 받침 높이와 가장 비슷한(묻히지 않은) 면에 퍼즐 문을 단다
    let dir = front, bestErr = Infinity;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2, cs = Math.cos(a), sn = Math.sin(a);
      const f = { x: front.x * cs - front.z * sn, z: front.x * sn + front.z * cs };
      let err = 0;
      for (const r of [27, 29, 32]) err = Math.max(err, Math.abs(H(c.x + f.x * r, c.z + f.z * r) - base));
      if (err < bestErr - 0.5) { bestErr = err; dir = f; }
    }
    const face = { x: c.x + dir.x * 26.2, z: c.z + dir.z * 26.2 };
    const dp = { x: c.x + dir.x * 28.4, z: c.z + dir.z * 28.4 };
    return { c, dir, face, base, door: V3(dp.x, Math.max(base, H(dp.x, dp.z)), dp.z) };
  })();
  const anchors: Anchor[] = [
    { id: 'coral-clam', x: lagoon.x, z: lagoon.z, y: lagoon.y + 0.55, rotY: 0.3 },
    { id: 'coral-pirate-cave', x: pirate.x, z: pirate.z, y: pirate.y - 0.15, rotY: rotTo(pirate.dir) },
    { id: 'coral-sandbar', x: P['coral-sandbar'].x, z: P['coral-sandbar'].z, y: H(P['coral-sandbar'].x, P['coral-sandbar'].z), rotY: rotTo(SBdir) + Math.PI },
    { id: 'desert-temple', x: temple.x, z: temple.z, y: temple.y - 0.2, rotY: rotTo(temple.dir) },
    { id: 'desert-water-cave', x: waterCave.x, z: waterCave.z, y: waterCave.y, rotY: 0 },
    { id: 'desert-trex', x: trex.x, z: trex.z, y: trex.y - 0.1, rotY: rotTo(trex.dir) + Math.PI / 2 },
    { id: 'launch-meteorite', x: meteor.x, z: meteor.z, y: meteor.y, rotY: 0 },
    { id: 'launch-glide', x: glide.x, z: glide.z, y: glide.y, rotY: rotTo(glide.dir) },
    { id: 'pyramid', x: pyramid.face.x, z: pyramid.face.z, y: Math.max(pyramid.base, H(pyramid.face.x, pyramid.face.z) - 0.3), rotY: rotTo(pyramid.dir) },
  ];
  const anchorOf = (id: Anchor['id']) => anchors.find((a) => a.id === id)!;
  /** 모델 로컬 → 월드 */
  const toWorld = (a: Anchor, lx: number, ly: number, lz: number) => {
    const c = Math.cos(a.rotY), s = Math.sin(a.rotY);
    return V3(a.x + lx * c + lz * s, a.y + ly, a.z - lx * s + lz * c);
  };

  // ───────────── 바깥 모델(청크) ─────────────
  const live = new Map<Anchor['id'], LiveSpot>();
  let clamM: ClamModel | null = null, templeM: TempleModel | null = null, glideM: GlideModel | null = null;
  let templeBodies: Array<{ remove(): void }> = [], templeCols: ColBox[] = [];
  let templeK = 0;
  const addCols = (a: Anchor, cols: ColBox[]) => {
    const q = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), a.rotY);
    return cols.map((c) => { const w = toWorld(a, c.x, c.y, c.z); return g.physics.addStatic({ kind: 'box', hx: c.hx, hy: c.hy, hz: c.hz }, { x: w.x, y: w.y, z: w.z }, q, 'hidden'); });
  };
  const buildSpot = (a: Anchor): LiveSpot => {
    const obj = new THREE.Group();
    obj.name = `secret-${a.id}`;
    obj.position.set(a.x, a.y, a.z);
    obj.rotation.y = a.rotY;
    const rnd = ctx.rng(`hidden:model:${a.id}`);
    const spot: LiveSpot = { id: a.id, obj, bodies: [] };
    // 아직 못 찾았으면 은은한 빛 기둥(찾고 나면 꺼진다)
    let hint: THREE.Mesh | null = null;
    if (a.id !== 'pyramid' && !isFound(a.id)) { hint = buildSparkle(SPOTS[a.id].color); obj.add(hint); }
    const hintTick = () => { if (hint && a.id !== 'pyramid' && isFound(a.id)) { hint.removeFromParent(); hint.geometry.dispose(); hint = null; } };
    switch (a.id) {
      case 'coral-clam': {
        const m = buildClam();
        m.root.scale.setScalar(1.15);
        obj.add(m.root);
        clamM = m;
        spot.update = (t) => {
          m.lid.rotation.x = -clamOpen(t) * CLAM.maxAngle;
          m.pearl.visible = pearlReady();
          m.pearl.scale.setScalar(1 + 0.06 * Math.sin(t * 3));
          hintTick();
        };
        break;
      }
      case 'coral-pirate-cave': {
        const m = buildPirateMouth(rnd);
        obj.add(m.root);
        spot.bodies = addCols(a, m.cols);
        spot.update = (t) => { m.flag.rotation.y = 0.15 * Math.sin(t * 2.1); hintTick(); };
        break;
      }
      case 'coral-sandbar': {
        obj.add(buildTideSign());
        spot.update = hintTick;
        break;
      }
      case 'desert-temple': {
        const m = buildTemple();
        obj.add(m.root);
        templeM = m;
        templeCols = m.cols;
        spot.update = (t) => { m.orb.position.y = 1.75 + 0.12 * Math.sin(t * 2); hintTick(); };
        break;
      }
      case 'desert-water-cave': {
        obj.add(buildWaterHole(rnd));
        spot.update = hintTick;
        break;
      }
      case 'desert-trex': {
        const m = buildTrexSkeleton();
        obj.add(m.root);
        spot.bodies = addCols(a, m.cols);
        spot.update = hintTick;
        break;
      }
      case 'launch-meteorite': {
        const m = buildMeteorite(rnd);
        obj.add(m.root);
        spot.bodies = addCols(a, m.cols);
        spot.update = (t) => { m.cracks.scale.setScalar(1 + 0.015 * Math.sin(t * 2.4)); hintTick(); };
        break;
      }
      case 'launch-glide': {
        const m = buildGlide();
        obj.add(m.root);
        glideM = m;
        // 기류 띠는 기둥 자리(절벽 앞 공중)로
        const loc = new THREE.Vector3(glide.col.x - a.x, 0, glide.col.z - a.z).applyAxisAngle(V3(0, 1, 0), -a.rotY);
        m.swirl.position.set(loc.x, glide.col.base - a.y + 22, loc.z);
        spot.bodies = addCols(a, m.cols);
        spot.update = (t) => { m.swirl.rotation.y = t * 0.9; m.sock.rotation.y = 0.5 * Math.sin(t * 1.3) + 0.2; m.sock.rotation.x = 0.1 * Math.sin(t * 2.7); hintTick(); };
        break;
      }
      case 'pyramid': {
        const m = buildPyramidMark();
        obj.add(m.root);
        spot.bodies = addCols(a, m.cols);
        break;
      }
    }
    if (hint) hint.position.y = a.id === 'launch-meteorite' ? 5 : 0;
    return spot;
  };
  g.chunks.add({
    key: 'hidden-spots', size: 160, radius: 520, world: 'earth',
    build: ({ x0, z0, size }) => {
      const here = anchors.filter((a) => a.x >= x0 && a.x < x0 + size && a.z >= z0 && a.z < z0 + size);
      if (!here.length) return null;
      const grp = new THREE.Group();
      grp.name = 'hidden-spots';
      for (const a of here) { const s = buildSpot(a); grp.add(s.obj); live.set(a.id, s); }
      grp.userData.hiddenIds = here.map((a) => a.id);
      return grp;
    },
    dispose: (obj) => {
      for (const id of (obj.userData.hiddenIds ?? []) as Anchor['id'][]) {
        const s = live.get(id);
        if (!s) continue;
        for (const b of s.bodies) b.remove();
        live.delete(id);
        if (id === 'coral-clam') clamM = null;
        if (id === 'desert-temple') { templeM = null; for (const b of templeBodies) b.remove(); templeBodies = []; }
        if (id === 'launch-glide') glideM = null;
      }
      // 개체 전용 지오메트리·재질·글씨 텍스처(신전 사라짐 재질 포함)까지 — 공유 캐시는 남긴다
      disposeTree(obj);
    },
  });

  // ───────────── ③ 썰물 모래톱(청크 + 충돌체 + 땅 공급자) ─────────────
  interface BarPiece { obj: THREE.Group; shape: { vertices: Float32Array; indices: Uint32Array }; body: { remove(): void } | null; shells: Array<{ i: number; m: THREE.Mesh }>; t0: number; t1: number; day: number }
  const bars = new Set<BarPiece>();
  const BAR_W = TIDE.halfW + 2.4;
  const shellRng = (k: string) => ctx.rng(k);
  let shellDay = -1, shellList: ReturnType<typeof sandbarShells> = [];
  const shellsToday = () => { const d = day(); if (d !== shellDay) { shellDay = d; shellList = sandbarShells(d, shellRng); } return shellList; };
  const shellTaken = (i: number) => !dailyReady(F(), `shell:${i}`, day());
  const shellPos = (s: { t: number; s: number }) => {
    const px = SB.a.x + (SB.b.x - SB.a.x) * s.t, pz = SB.a.z + (SB.b.z - SB.a.z) * s.t;
    return V3(px - SBdir.z * s.s, TIDE.top + sandbarProfile(Math.abs(s.s)), pz + SBdir.x * s.s);
  };
  /** 오늘 조개 자리 중 이 조각 구간(t0..t1)만 놓는다 — 날이 바뀌면 다시(지오·재질은 공유라 버리지 않는다) */
  const placeShells = (piece: BarPiece) => {
    for (const s of piece.shells) s.m.removeFromParent();
    piece.shells = [];
    piece.day = day();
    const sg = pickupShellGeos();
    for (const s of shellsToday()) {
      if (s.t < piece.t0 || s.t > piece.t1) continue;
      const p = shellPos(s);
      const sm = new THREE.Mesh(sg[s.kind], matBase());
      sm.position.set(p.x, p.y, p.z);
      sm.rotation.y = s.t * 40;
      sm.name = 'hidden-shell';
      piece.obj.add(sm);
      piece.shells.push({ i: s.i, m: sm });
    }
  };
  g.chunks.add({
    key: 'hidden-sandbar', size: 128, radius: 300, world: 'earth',
    build: ({ x0, z0, size }) => {
      // 이 칸을 지나는 길 구간(t) — 2 m 간격으로 훑는다
      const steps = Math.ceil(SBdir.len / 2);
      let t0 = -1, t1 = -1;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = SB.a.x + (SB.b.x - SB.a.x) * t, z = SB.a.z + (SB.b.z - SB.a.z) * t;
        if (x >= x0 && x < x0 + size && z >= z0 && z < z0 + size) { if (t0 < 0) t0 = t; t1 = t; }
      }
      if (t0 < 0) return null;
      const dt0 = 2 / SBdir.len;
      t0 = Math.max(0, t0 - dt0); t1 = Math.min(1, t1 + dt0);
      const n = Math.max(2, Math.ceil(((t1 - t0) * SBdir.len) / 2)), m = 13;
      const pos = new Float32Array((n + 1) * m * 3), col = new Float32Array((n + 1) * m * 3);
      const top: number[] = [];
      const rnd = ctx.rng(`hidden:sandbar:${x0},${z0}`);
      const cTop = new THREE.Color('#f8e6b8'), cWet = new THREE.Color('#d6b483'), cSpk = new THREE.Color('#fff6dc'), tmp = new THREE.Color();
      for (let i = 0; i <= n; i++) {
        const t = t0 + ((t1 - t0) * i) / n;
        const cx = SB.a.x + (SB.b.x - SB.a.x) * t, cz = SB.a.z + (SB.b.z - SB.a.z) * t;
        for (let j = 0; j < m; j++) {
          const d = -BAR_W + (2 * BAR_W * j) / (m - 1);
          const k = (i * m + j) * 3;
          const y = TIDE.top + sandbarProfile(Math.abs(d)) + 0.04 * Math.sin(cx * 0.7 + cz * 0.4 + d);
          pos[k] = cx - SBdir.z * d; pos[k + 1] = y; pos[k + 2] = cz + SBdir.x * d;
          const w = Math.min(1, Math.abs(d) / TIDE.halfW);
          tmp.copy(cTop).lerp(cWet, w * w);
          if (Math.abs(d) < TIDE.halfW && rnd() < 0.05) tmp.lerp(cSpk, 0.7);
          col[k] = tmp.r; col[k + 1] = tmp.g; col[k + 2] = tmp.b;
        }
        top.push(i);
      }
      const idx: number[] = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) {
        const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const obj = new THREE.Group();
      obj.name = 'hidden-sandbar';
      const mesh = new THREE.Mesh(geo, matBase());
      mesh.receiveShadow = true;
      obj.add(mesh);
      // 충돌 판(걸을 수 있는 꼭대기 폭만, 다 드러났을 때 높이)
      const jw0 = Math.floor(((BAR_W - TIDE.halfW) / (2 * BAR_W)) * (m - 1)), jw1 = m - 1 - jw0;
      const cv: number[] = [], ci: number[] = [];
      const cw = jw1 - jw0 + 1;
      for (let i = 0; i <= n; i++) for (let j = jw0; j <= jw1; j++) { const k = (i * m + j) * 3; cv.push(pos[k], pos[k + 1] - 0.02, pos[k + 2]); }
      for (let i = 0; i < n; i++) for (let j = 0; j < cw - 1; j++) { const a = i * cw + j, b = a + 1, c = a + cw, d = c + 1; ci.push(a, c, b, b, c, d); }
      const piece: BarPiece = { obj, shape: { vertices: new Float32Array(cv), indices: new Uint32Array(ci) }, body: null, shells: [], t0, t1, day: -1 };
      placeShells(piece); // 조개(오늘 자리 중 이 칸 구간)
      obj.userData.barPiece = piece;
      bars.add(piece);
      return obj;
    },
    dispose: (obj) => {
      const piece = obj.userData.barPiece as BarPiece | undefined;
      if (piece) { piece.body?.remove(); piece.body = null; bars.delete(piece); }
      disposeTree(obj);
    },
  });
  /** 이만큼 다 올라왔을 때만 정적 충돌체(다 드러난 높이로 구웠다) — 오르내리는 동안은 땅 공급자만 그려진 모래를 따라간다 */
  const BAR_SOLID = 0.98;
  /** 모래톱 위 바닥(드러났을 때만) — 그려진 높이(sandbarTopY)를 그대로 따라간다 */
  const sandbarGround = (x: number, z: number): number | null => {
    if (!onEarth()) return null;
    const lift = tideLift(hour());
    if (lift < TIDE.walkAt) return null;
    const pr = segProject(x, z, SB.a, SB.b);
    if (pr.d > TIDE.halfW || pr.t <= 0.02 || pr.t >= 0.98) return null;
    const y = sandbarTopY(lift) + sandbarProfile(pr.d);
    return y > H(x, z) ? y : null;
  };
  g.addGroundProvider(sandbarGround, 'hidden:sandbar');
  const onSandbar = () => {
    const p = g.player.pos, pr = segProject(p.x, p.z, SB.a, SB.b);
    return pr.d <= TIDE.halfW + 0.5 && pr.t > 0.04 && pr.t < 0.96;
  };
  g.addProvider('hidden:shell', (pl) => {
    if (!onEarth() || insideAny() || !sandbarWalkable(hour())) return null;
    let best: { i: number; d: number } | null = null;
    for (const s of shellsToday()) {
      if (shellTaken(s.i)) continue;
      const d = shellPos(s).distanceTo(pl.pos);
      if (d < 1.9 && (!best || d < best.d)) best = { i: s.i, d };
    }
    if (!best) return null;
    const i = best.i;
    return { id: 'hidden:shell', label: '조개 줍기 🐚', dist: best.d, use: () => takeShell(i) };
  });
  const takeShell = (i: number) => {
    if (!takeDaily(F(), `shell:${i}`, day())) return false;
    save();
    g.player.act?.('pick', 0.6);
    give('m_shell', 1);
    harvest('shell', 'm_shell', 1, 'coral');
    sfx('pick');
    toast('🐚 썰물 조개를 주웠어요!');
    return true;
  };

  // ───────────── 상호작용(바깥) ─────────────
  const pearlReady = () => dailyReady(F(), 'pearl', day());
  const clamPearlPos = () => toWorld(anchorOf('coral-clam'), 0, 0.5, 0.1);
  const takePearl = () => {
    if (!takeDaily(F(), 'pearl', day())) { toast('진주는 내일 또 자라요 🦪'); return false; }
    const first = takeOnce(F(), 'pearl-first');
    save();
    give('m_pearl', first ? 3 : 1);
    harvest('pearl', 'm_pearl', first ? 3 : 1, 'coral');
    sfx('star', clamPearlPos());
    toast(first ? '🦪 대왕조개가 진주를 세 알이나 줬어요!' : '🦪 반짝 진주 한 알!');
    discover('coral-clam');
    return true;
  };
  g.addInteractable({
    id: 'hidden:clam', radius: 3.6, position: clamPearlPos,
    label: () => (clamReachable(g.time) ? '진주 살짝 꺼내기 🦪' : '조개가 입을 다물었어요…'),
    enabled: () => onEarth() && !insideAny() && !!clamM && pearlReady(),
    onUse: () => { if (clamReachable(g.time)) takePearl(); else toast('조개가 입을 벌릴 때까지 기다려요 🫧'); },
  });
  const mouthFront = (id: Anchor['id'], dist: number, y = 0) => () => toWorld(anchorOf(id), 0, y, dist);
  g.addInteractable({
    id: 'hidden:pirate-door', radius: 3.0, label: '해적 동굴에 들어가기 🏴‍☠️', position: mouthFront('coral-pirate-cave', 1.4, 0.4),
    enabled: () => onEarth() && !insideAny() && live.has('coral-pirate-cave'),
    onUse: () => enterRoom('pirate'),
  });
  g.addInteractable({
    id: 'hidden:water-door', radius: 2.8, label: '지하수 동굴로 내려가기 💧', position: () => toWorld(anchorOf('desert-water-cave'), 0, 0.4, 0),
    enabled: () => onEarth() && !insideAny() && live.has('desert-water-cave'),
    onUse: () => enterRoom('water'),
  });
  g.addInteractable({
    id: 'hidden:meteor-door', radius: 4.2, label: '운석 틈으로 들어가기 ☄️', position: mouthFront('launch-meteorite', 4.4, 0.3),
    enabled: () => onEarth() && !insideAny() && live.has('launch-meteorite'),
    onUse: () => enterRoom('meteor'),
  });
  g.addInteractable({
    id: 'hidden:trex', radius: 5.0, label: () => (isFound('desert-trex') ? '티라노 골격 구경하기 🦖' : '화석 살펴보기 🦴'), position: () => toWorld(anchorOf('desert-trex'), 0, 1.2, 1.8),
    enabled: () => onEarth() && !insideAny() && live.has('desert-trex'),
    onUse: () => inspectTrex(),
  });
  const inspectTrex = () => {
    const first = !isFound('desert-trex');
    const sp = st.species.get('fos_tino') ?? st.byGdd('fos_tino') ?? st.species.get('fos_baby_rex');
    g.player.act?.('cheer', 1.2);
    if (sp && first) {
      const model = (g.ext.fossils?.model?.(sp.id) as THREE.Object3D | undefined) ?? undefined;
      g.ui.showCatch({ species: sp, keep: false, model, line: '머리부터 꼬리까지 다 있어!', activity: 'fossil' });
    } else if (!first) toast('🦖 "짧은 팔이 매력 포인트!" — 완전한 티라노 골격');
    discover('desert-trex');
  };
  g.addInteractable({
    id: 'hidden:temple-altar', radius: 3.2, label: () => (dailyReady(F(), 'temple', day()) ? '제단에 손 얹기 🏛️' : '제단이 조용해요(내일 또)'),
    position: () => toWorld(anchorOf('desert-temple'), 0, 1.2, 8.2 + 1.0),
    enabled: () => onEarth() && !insideAny() && !!templeM && templeSolid(templeK),
    onUse: () => useAltar(),
  });
  const useAltar = () => {
    discover('desert-temple');
    if (!takeDaily(F(), 'temple', day())) { toast('신전이 고요해요. 다음 모래폭풍에 또 와요 🌪️'); return false; }
    const first = takeOnce(F(), 'temple-chest');
    save();
    sfx('chest-open-gold');
    openChest(chestTierFor(first), 'hidden:desert-temple');
    return true;
  };
  /** 출발 안내는 판 끝(앞쪽 난간 바로 앞) */
  const deckEnd = () => toWorld(anchorOf('launch-glide'), 0, DECK_Y, DECK_LEN - 1.4);
  g.addInteractable({
    id: 'hidden:glide-jump', radius: 2.4, label: '바람 타고 뛰어내리기 🪂', position: deckEnd,
    enabled: () => onEarth() && !insideAny() && live.has('launch-glide') && !g.player.mounted,
    onUse: () => glideJump(),
  });
  /** 뛰어내린 뒤 땅에 닿기 전까지(최대 sec 초) 바깥쪽으로 계속 밀어 준다(공중 조작이 수평 속도를 금방 줄이므로) */
  const GLIDE_PUSH = { sec: 1.4, speed: 10 } as const;
  let glidePushT = 0;
  const glideJump = () => {
    const pl = g.player, d = glide.dir;
    discover('launch-glide');
    pl.vel.set(d.x * GLIDE_PUSH.speed, 9, d.z * GLIDE_PUSH.speed);
    pl.mode = 'air';
    glidePushT = GLIDE_PUSH.sec;
    sfx('glide-wind');
    toast('Space 를 꾹 누르면 활공! 기류를 타고 올라가요 🪂');
  };
  g.addInteractable({
    id: 'hidden:pyramid-door', radius: 4.2, label: () => (allSolved(puzzle()) ? '피라미드 보물방 가기 🔺' : '피라미드 퍼즐 들어가기 🔺'), position: () => pyramid.door,
    enabled: () => onEarth() && !insideAny(),
    onUse: () => enterRoom('pyramid'),
  });

  // ───────────── 실내 ─────────────
  let pirateR: PirateRoom | null = null, waterR: WaterRoom | null = null, meteorR: MeteorRoom | null = null, pyrR: PyramidRoom | null = null;
  const origin = (k: RoomKey) => { const o = interiors()?.origin?.(SLOT[k]) ?? { x: -20000 + SLOT[k] * 300, y: 600, z: 0 }; return V3(o.x, o.y, o.z); };
  const O: Record<RoomKey, THREE.Vector3> = { pirate: origin('pirate'), water: origin('water'), meteor: origin('meteor'), pyramid: origin('pyramid') };
  const L = (k: RoomKey, v: THREE.Vector3) => v.clone().add(O[k]);
  const outside: Record<RoomKey, () => THREE.Vector3> = {
    pirate: () => toWorld(anchorOf('coral-pirate-cave'), 0, 0, 3.6),
    water: () => toWorld(anchorOf('desert-water-cave'), 0, 0, 3.4),
    meteor: () => toWorld(anchorOf('launch-meteorite'), 0, 0, 6.5),
    pyramid: () => V3(pyramid.door.x + pyramid.dir.x * 2.5, 0, pyramid.door.z + pyramid.dir.z * 2.5),
  };
  const roomDoor: Record<RoomKey, () => THREE.Vector3> = {
    pirate: () => toWorld(anchorOf('coral-pirate-cave'), 0, 0, 1.4), water: () => toWorld(anchorOf('desert-water-cave'), 0, 0, 0),
    meteor: () => V3(meteor.x, meteor.y, meteor.z), pyramid: () => pyramid.door.clone(),
  };
  let savedGravity: number | null = null;
  const registered = new Set<RoomKey>();
  const enterRoom = (k: RoomKey): boolean => {
    const api = interiors();
    if (!api) { toast('안으로 들어가는 길이 아직 막혀 있어요'); return false; }
    ensureRegistered();
    return api.enter(ROOM_ID[k]);
  };
  const boxesWorld = (k: RoomKey, cols: ColBox[]) => cols.map((c) => ({ ...c, x: c.x + O[k].x, y: c.y + O[k].y, z: c.z + O[k].z }));
  const ensureRegistered = () => {
    const api = interiors();
    if (!api) return;
    const reg = (k: RoomKey, def: Record<string, unknown>) => { if (registered.has(k)) return; registered.add(k); api.register(def); };
    reg('pirate', {
      id: ROOM_ID.pirate, name: '🏴‍☠️ 해적 동굴', sub: '꼬마 해적 꽃게의 보물 창고', color: '#ffb36b', origin: O.pirate,
      build: () => { pirateR ??= buildPirateRoom(ctx.rng('hidden:room:pirate')); pirateR.root.position.copy(O.pirate); return pirateR.root; },
      floorAt: (x: number, z: number) => { const f = (pirateR ?? null)?.floorAt(x - O.pirate.x, z - O.pirate.z); return f == null ? null : f + O.pirate.y; },
      spawn: () => L('pirate', V3(0, 0, 7.4)), exitTo: outside.pirate, door: roomDoor.pirate,
      colliders: () => (pirateR ? boxesWorld('pirate', pirateR.cols) : []),
      cam: { dist: 15, pitch: 0.9, yaw: 0 }, backdrop: '#e6d6f0',
      onEnter: () => { discover('coral-pirate-cave'); syncChestLids(); },
      update: (t: number) => { if (pirateR) { pirateR.crab.position.y = Math.abs(Math.sin(t * 3)) * 0.08; pirateR.crab.rotation.y = -0.6 + 0.25 * Math.sin(t * 1.3); } },
    });
    reg('water', {
      id: ROOM_ID.water, name: '💧 지하수 동굴', sub: '협곡 아래 비밀 샘', color: '#6fd6e8', origin: O.water,
      build: () => { waterR ??= buildWaterRoom(ctx.rng('hidden:room:water')); waterR.root.position.copy(O.water); return waterR.root; },
      floorAt: (x: number, z: number) => { const f = waterR?.floorAt(x - O.water.x, z - O.water.z); return f == null ? null : f + O.water.y; },
      spawn: () => L('water', V3(0, 0, 8.4)), exitTo: outside.water, door: roomDoor.water,
      colliders: () => (waterR ? boxesWorld('water', waterR.cols) : []),
      cam: { dist: 16, pitch: 0.92, yaw: 0 }, backdrop: '#d8eef2',
      onEnter: () => { discover('desert-water-cave'); syncChestLids(); },
      update: (t: number) => {
        if (!waterR) return;
        waterR.pool.rotation.y = t * 0.05;
        waterR.drips.position.y = -((t * 1.6) % 2.4);
      },
    });
    reg('meteor', {
      id: ROOM_ID.meteor, name: '☄️ 운석 속 무중력 방', sub: '몸이 둥실~ 별가루를 모아 봐요', color: '#b48cf0', origin: O.meteor,
      build: () => { meteorR ??= buildMeteorRoom(ctx.rng('hidden:room:meteor')); meteorR.root.position.copy(O.meteor); return meteorR.root; },
      floorAt: (x: number, z: number) => { const f = meteorR?.floorAt(x - O.meteor.x, z - O.meteor.z); return f == null ? null : f + O.meteor.y; },
      spawn: () => L('meteor', V3(0, 0, 6.0)), exitTo: outside.meteor, door: roomDoor.meteor,
      colliders: () => (meteorR ? boxesWorld('meteor', meteorR.cols) : []),
      cam: { dist: 15, pitch: 0.78, yaw: 0 }, backdrop: '#6a5aa8',
      lightAt: () => L('meteor', V3(0, 4.2, 0)),
      onEnter: () => {
        discover('launch-meteorite');
        savedGravity = g.physics.gravity;
        g.physics.setGravity(METEOR_GRAVITY);
        toast('몸이 둥실~ Space 로 높이 떠올라 별가루를 모아요 ✨');
      },
      onExit: () => { g.physics.setGravity(savedGravity ?? (g.world === 'space' ? -4.5 : -22)); savedGravity = null; },
      update: (t: number) => {
        if (!meteorR) return;
        meteorR.core.rotation.y = t * 0.8;
        meteorR.core.position.y = meteorR.coreAt.y + 0.2 * Math.sin(t * 1.4);
        meteorR.orbs.forEach((m, i) => {
          m.visible = !orbTaken(i);
          m.position.y = meteorR!.orbAt[i].y + 0.25 * Math.sin(t * 1.7 + i);
          m.rotation.z = t * (0.6 + i * 0.1);
        });
      },
    });
    reg('pyramid', {
      id: ROOM_ID.pyramid, name: '🔺 모래 피라미드', sub: '블록을 밀어 발판을 모두 눌러요', color: '#f6c56a', origin: O.pyramid,
      build: () => { pyrR ??= buildPyramidRoom(); pyrR.root.position.copy(O.pyramid); syncPyramid(true); return pyrR.root; },
      floorAt: (x: number, z: number) => { const f = pyrR?.floorAt(x - O.pyramid.x, z - O.pyramid.z); return f == null ? null : f + O.pyramid.y; },
      spawn: () => L('pyramid', pyrR?.spawn ?? V3(0, 0, 4)), exitTo: outside.pyramid, door: roomDoor.pyramid,
      colliders: () => (pyrR ? boxesWorld('pyramid', pyrR.cols) : []),
      cam: { dist: 17, pitch: 0.95, yaw: 0 }, backdrop: '#f2dcb4',
      lightAt: () => V3(g.player.pos.x, O.pyramid.y + 3.2, g.player.pos.z + 0.6),
      onEnter: () => { syncPyramid(true); addPyramidBodies(); if (!allSolved(puzzle())) toast('블록 옆에서 E — 미는 쪽으로 한 칸! 막히면 빨간 레버로 되돌려요'); },
      onExit: () => clearPyramidBodies(),
      update: (t: number, dt: number) => tickPyramid(t, dt),
    });
  };
  ensureRegistered();

  // ── 실내 상호작용: 상자(해적·지하수)
  const chestLid = (c: { lid: THREE.Group } | undefined, open: boolean) => { if (c) c.lid.rotation.x = open ? -1.15 : 0; };
  const syncChestLids = () => {
    chestLid(pirateR?.chest, !dailyReady(F(), 'chest:pirate', day()));
    chestLid(waterR?.chest, !dailyReady(F(), 'chest:water', day()));
    chestLid(pyrR?.chest, !dailyReady(F(), 'chest:pyramid', day()));
  };
  const roomChest = (k: 'pirate' | 'water' | 'pyramid') => {
    if (!takeDaily(F(), `chest:${k}`, day())) { toast('상자가 비었어요. 내일 또 채워져요 📦'); return false; }
    const first = k === 'water' ? false : takeOnce(F(), `chest-first:${k}`);
    save();
    syncChestLids();
    const tier = chestTierFor(first);
    sfx(tier === 'gold' ? 'chest-open-gold' : 'chest-open-silver');
    openChest(tier, `hidden:${k}`);
    return true;
  };
  g.addInteractable({
    id: 'hidden:pirate-chest', radius: 2.6, position: () => (pirateR ? L('pirate', pirateR.chestAt) : V3(0, -1e4, 0)),
    label: () => (dailyReady(F(), 'chest:pirate', day()) ? '해적 보물상자 열기 💰' : '빈 상자(내일 또)'),
    enabled: () => insideRoom('pirate'), onUse: () => roomChest('pirate'),
  });
  const CRAB_LINES = ['"어서 와, 꼬마 선장! 보물은 하루에 한 번만이야~ 🦀"', '"이 동굴은 비밀이야. 쉿!"', '"집게로 동전 세는 중… 하나, 둘, 많다!"', '"썰물 길 알아? 아침에만 열린대!"'];
  let crabN = 0;
  g.addInteractable({
    id: 'hidden:pirate-crab', radius: 2.4, label: '꼬마 해적 꽃게와 이야기하기 🦀', position: () => (pirateR ? L('pirate', pirateR.crabAt).add(V3(0, 0.5, 0)) : V3(0, -1e4, 0)),
    enabled: () => insideRoom('pirate'),
    onUse: () => { toast(CRAB_LINES[crabN++ % CRAB_LINES.length]); sfx('talk-blip'); },
  });
  g.addInteractable({
    id: 'hidden:water-chest', radius: 2.4, position: () => (waterR ? L('water', waterR.chestAt) : V3(0, -1e4, 0)),
    label: () => (dailyReady(F(), 'chest:water', day()) ? '샘가 은상자 열기 📦' : '빈 상자(내일 또)'),
    enabled: () => insideRoom('water'), onUse: () => roomChest('water'),
  });
  g.addInteractable({
    id: 'hidden:water-spring', radius: 2.4, label: '샘물 한 모금 마시기 💧', position: () => (waterR ? L('water', waterR.springAt) : V3(0, -1e4, 0)),
    enabled: () => insideRoom('water'),
    onUse: () => {
      g.player.act?.('eat', 1.0);
      sfx('splash');
      if (takeDaily(F(), 'spring', day())) {
        save();
        const e = g.econ;
        if (e && typeof e.addBuff === 'function') e.addBuff('speed', 30);
        toast('💧 시원해! 발이 가벼워졌어요(30분)');
      } else toast('💧 꿀꺽꿀꺽… 오늘은 배가 불러요');
    },
  });
  // ── 무중력 방: 별가루 구슬 · 운석 핵
  const orbTaken = (i: number) => !dailyReady(F(), `orb:${i}`, day());
  g.addProvider('hidden:orb', (pl) => {
    if (!insideRoom('meteor') || !meteorR) return null;
    const chest = pl.pos.clone().add(V3(0, 0.8, 0));
    let best = -1, bd = 1.7;
    meteorR.orbs.forEach((m, i) => { if (orbTaken(i)) return; const d = L('meteor', V3(meteorR!.orbAt[i].x, m.position.y, meteorR!.orbAt[i].z)).distanceTo(chest); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return null;
    const i = best;
    return { id: 'hidden:orb', label: '별가루 구슬 잡기 ✨', dist: bd, use: () => takeOrb(i) };
  });
  const takeOrb = (i: number) => {
    if (!takeDaily(F(), `orb:${i}`, day())) return false;
    save();
    give('m_stardust', 1);
    harvest('stardust', 'm_stardust', 1, 'launch');
    sfx('star');
    const left = (meteorR?.orbs.length ?? 6) - (meteorR?.orbs.filter((_, k) => orbTaken(k)).length ?? 0);
    toast(left > 0 ? `✨ 별가루! (남은 구슬 ${left})` : '✨ 별가루 구슬을 다 모았어요!');
    return true;
  };
  g.addInteractable({
    id: 'hidden:meteor-core', radius: 3.0, label: () => (dailyReady(F(), 'core', day()) ? '운석 핵 만지기 ☄️' : '운석 핵이 쉬는 중'),
    position: () => (meteorR ? L('meteor', meteorR.core.position) : V3(0, -1e4, 0)),
    enabled: () => insideRoom('meteor'),
    onUse: () => {
      if (!takeDaily(F(), 'core', day())) { toast('운석 핵이 쿨쿨… 내일 또 반짝여요'); return; }
      save();
      give('m_meteor', 1);
      harvest('meteor', 'm_meteor', 1, 'launch');
      sfx('star');
      toast('☄️ 운석 조각이 톡 떨어졌어요!');
    },
  });
  // ── 나가기(실내마다 입구 앞)
  const exitAt: Record<RoomKey, () => THREE.Vector3> = {
    pirate: () => L('pirate', V3(0, 0, 8.6)), water: () => L('water', V3(0, 0, 9.6)), meteor: () => L('meteor', V3(0, 0, 7.1)),
    pyramid: () => L('pyramid', pyrR?.exitAt ?? V3(0, 0, 6)),
  };
  for (const k of Object.keys(SLOT) as RoomKey[]) {
    g.addInteractable({ id: `hidden:${k}-exit`, radius: 1.9, label: '밖으로 나가기 🚪', position: exitAt[k], enabled: () => insideRoom(k), onUse: () => interiors()?.exit() });
  }

  // ───────────── 피라미드 퍼즐 ─────────────
  let states: RoomState[] = loadStates(F().pyramid.rooms);
  const puzzle = () => states;
  const persistPuzzle = () => { F().pyramid.rooms = saveStates(states); save(); };
  /** 블록 메시가 미끄러져 가는 목표(로컬) */
  const slide: Array<Array<{ from: THREE.Vector3; to: THREE.Vector3; k: number }>> = PUZZLE_ROOMS.map((r) => r.start.map(() => ({ from: V3(0, 0, 0), to: V3(0, 0, 0), k: 1 })));
  const doorK: number[] = PUZZLE_ROOMS.map(() => 0);
  let pyrBodies: { blocks: Array<Array<{ remove(): void } | null>>; doors: Array<{ remove(): void } | null> } | null = null;
  const blockWorld = (k: number, x: number, y: number) => { const c = cellToLocal(k, x, y); return V3(c.x + O.pyramid.x, O.pyramid.y, c.z + O.pyramid.z); };
  const addBlockBody = (k: number, i: number) => {
    const b = states[k].blocks[i], w = blockWorld(k, b[0], b[1]);
    return g.physics.addStatic({ kind: 'box', hx: CELL * 0.45, hy: 0.8, hz: CELL * 0.45 }, { x: w.x, y: w.y + 0.8, z: w.z }, undefined, 'hidden');
  };
  const addDoorBody = (k: number) => {
    const d = PUZZLE_ROOMS[k].door!, w = blockWorld(k, d[0], d[1]);
    return g.physics.addStatic({ kind: 'box', hx: CELL / 2, hy: 1.6, hz: CELL / 2 }, { x: w.x, y: w.y + 1.6, z: w.z }, undefined, 'hidden');
  };
  const addPyramidBodies = () => {
    clearPyramidBodies();
    pyrBodies = {
      blocks: states.map((s, k) => s.blocks.map((_, i) => addBlockBody(k, i))),
      doors: states.map((s, k) => (s.solved ? null : addDoorBody(k))),
    };
  };
  const clearPyramidBodies = () => {
    if (!pyrBodies) return;
    for (const row of pyrBodies.blocks) for (const b of row) b?.remove();
    for (const d of pyrBodies.doors) d?.remove();
    pyrBodies = null;
  };
  /** 메시를 상태에 맞춘다(snap = 미끄럼 없이 바로) */
  const syncPyramid = (snap = false) => {
    if (!pyrR) return;
    states.forEach((s, k) => {
      s.blocks.forEach((b, i) => {
        const c = cellToLocal(k, b[0], b[1]), sl = slide[k][i];
        if (snap) { sl.from.set(c.x, 0, c.z); sl.to.set(c.x, 0, c.z); sl.k = 1; pyrR!.blocks[k][i].position.set(c.x, 0, c.z); }
      });
      const room = PUZZLE_ROOMS[k];
      room.plates.forEach(([x, y], j) => tintPlate(pyrR!.plates[k][j], s.blocks.some((b) => b[0] === x && b[1] === y)));
      if (snap) doorK[k] = s.solved ? 1 : 0;
      const dm = pyrR!.doors[k];
      if (dm) dm.position.y = -doorK[k] * 2.7;
      pyrR!.leverMeshes[k].visible = !s.solved;
    });
    syncChestLids();
  };
  const tickPyramid = (t: number, dt: number) => {
    if (!pyrR) return;
    states.forEach((s, k) => {
      s.blocks.forEach((_, i) => {
        const sl = slide[k][i];
        if (sl.k < 1) { sl.k = dt > 0 ? Math.min(1, sl.k + dt / 0.22) : 1; pyrR!.blocks[k][i].position.lerpVectors(sl.from, sl.to, sl.k); }
      });
      const want = s.solved ? 1 : 0;
      if (doorK[k] !== want) { doorK[k] = dt > 0 ? Math.max(0, Math.min(1, doorK[k] + (want ? dt : -dt) / 1.2)) : want; const dm = pyrR!.doors[k]; if (dm) dm.position.y = -doorK[k] * 2.7; }
    });
    pyrR.scarab.visible = scarabHere();
    pyrR.scarab.position.y = pyrR.scarabAt.y + 0.08 * Math.sin(t * 2.2);
    pyrR.scarab.rotation.y = t * 0.6;
  };
  /** 플레이어 칸 기준 밀 수 있는 블록(방 k, 블록 i, 방향) */
  const pushTarget = (): { k: number; i: number; dir: Dir; px: number; py: number; dist: number } | null => {
    if (!insideRoom('pyramid')) return null;
    const p = g.player.pos, lx = p.x - O.pyramid.x, lz = p.z - O.pyramid.z;
    const cell = localToCell(lx, lz);
    if (!cell || cell.k >= PUZZLE_ROOMS.length) return null;
    const k = cell.k, s = states[k];
    if (s.solved) return null;
    let best: { k: number; i: number; dir: Dir; px: number; py: number; dist: number } | null = null;
    s.blocks.forEach((b, i) => {
      const c = cellToLocal(k, b[0], b[1]), dx = c.x - lx, dz = c.z - lz;
      const ax = Math.abs(dx) >= Math.abs(dz);
      const along = ax ? Math.abs(dx) : Math.abs(dz), perp = ax ? Math.abs(dz) : Math.abs(dx);
      if (along > CELL * 0.98 || along < 0.5 || perp > 0.8) return;
      const dir: Dir = ax ? (dx > 0 ? 'E' : 'W') : dz > 0 ? 'S' : 'N';
      const [ddx, ddy] = DIRS[dir];
      if (!best || along < best.dist) best = { k, i, dir, px: b[0] - ddx, py: b[1] - ddy, dist: along };
    });
    return best;
  };
  const doPush = (k: number, px: number, py: number, dir: Dir): boolean => {
    const room = PUZZLE_ROOMS[k];
    const res = pushBlock(room, states[k], px, py, dir);
    if (!res.ok) {
      if (res.why === 'blocked') { toast('블록이 꿈쩍도 안 해요 — 막혀 있어요'); sfx('rock-hit'); }
      return false;
    }
    states = states.map((s, j) => (j === k ? res.state : s));
    g.player.act?.('hit', 0.4);
    sfx('rock-hit');
    if (pyrR) {
      const sl = slide[k][res.block];
      const a = cellToLocal(k, res.from![0], res.from![1]), b = cellToLocal(k, res.to![0], res.to![1]);
      sl.from.set(a.x, 0, a.z); sl.to.set(b.x, 0, b.z); sl.k = 0;
    }
    if (pyrBodies) { pyrBodies.blocks[k][res.block]?.remove(); pyrBodies.blocks[k][res.block] = addBlockBody(k, res.block); }
    if (res.solvedNow) onRoomSolved(k);
    persistPuzzle();
    syncPyramid();
    return true;
  };
  const onRoomSolved = (k: number) => {
    if (pyrBodies) { pyrBodies.doors[k]?.remove(); pyrBodies.doors[k] = null; }
    sfx('unlock');
    const last = k === PUZZLE_ROOMS.length - 1;
    g.hud.banner({ text: last ? '황금 보물방이 열렸어요!' : '철컹! 다음 문이 열렸어요', sub: PUZZLE_ROOMS[k].name, icon: last ? '👑' : '🔓', color: '#f6c56a' });
    if (last && takeOnce(F(), 'pyramid-solved')) {
      g.hud.card({ title: '🔺 피라미드 퍼즐 완료!', body: '세 방을 모두 풀었어요. 보물방의 황금풍뎅이와 금상자를 만나러 가요!', icon: '🔺', color: '#f6c56a', ms: 6000 });
    }
  };
  g.addProvider('hidden:push', () => {
    const tg = pushTarget();
    if (!tg) return null;
    const room = PUZZLE_ROOMS[tg.k];
    const ok = pushBlock(room, states[tg.k], tg.px, tg.py, tg.dir).ok;
    return { id: 'hidden:push', label: ok ? `블록 밀기 ${DIR_ARROW[tg.dir]}` : '블록이 막혀 있어요', dist: tg.dist, use: () => doPush(tg.k, tg.px, tg.py, tg.dir) };
  });
  PUZZLE_ROOMS.forEach((_room, k) => {
    g.addInteractable({
      id: `hidden:lever-${k}`, radius: 1.8, label: '레버 당겨 되돌리기 🔄',
      position: () => (pyrR ? pyrR.levers[k].clone().add(O.pyramid) : V3(0, -1e4, 0)),
      enabled: () => insideRoom('pyramid') && !states[k].solved && states[k].moves > 0,
      onUse: () => resetPuzzleRoom(k),
    });
  });
  const resetPuzzleRoom = (k: number) => {
    const room = PUZZLE_ROOMS[k];
    if (states[k].solved) return false;
    states = states.map((s, j) => (j === k ? resetRoom(room, s) : s));
    persistPuzzle();
    syncPyramid(true);
    if (pyrBodies) { for (const b of pyrBodies.blocks[k]) b?.remove(); pyrBodies.blocks[k] = states[k].blocks.map((_, i) => addBlockBody(k, i)); }
    sfx('ui-click');
    toast('🔄 블록이 처음 자리로 돌아갔어요');
    return true;
  };
  // ── 보물방: 황금풍뎅이 · 금상자
  const scarabCaught = () => !!F().once['scarab'];
  /** 오늘의 풍뎅이 주사위(날마다 한 번만 굴린다) */
  let scarabRoll = { day: -1, v: 0 };
  const scarabDice = () => { const d = day(); if (scarabRoll.day !== d) scarabRoll = { day: d, v: ctx.rng(`hidden:scarab:${d}`)() }; return scarabRoll.v; };
  const scarabHere = () => allSolved(states) && dailyReady(F(), 'scarab', day()) && scarabToday(scarabCaught(), scarabDice());
  const inVault = () => { if (!insideRoom('pyramid')) return false; const p = g.player.pos; const c = localToCell(p.x - O.pyramid.x, p.z - O.pyramid.z); return !!c && c.k === ROOMS.length - 1; };
  g.addInteractable({
    id: 'hidden:scarab', radius: 3.2, label: '황금풍뎅이 살짝 잡기 🪲', position: () => (pyrR ? L('pyramid', pyrR.scarabAt) : V3(0, -1e4, 0)),
    enabled: () => inVault() && scarabHere(),
    onUse: () => catchScarab(),
  });
  const catchScarab = () => {
    if (!scarabHere() || !takeDaily(F(), 'scarab', day())) return false;
    F().once['scarab'] = true;
    save();
    const sp = st.species.get('b_golden_scarab') ?? st.byGdd('b_golden_scarab');
    g.player.act?.('net', 0.8);
    if (sp) g.ui.showCatch({ species: sp, model: buildScarab(), sizeText: '6.2cm', line: '유적의 진짜 보물이야!', activity: 'bug' });
    else { give('m_gold', 3); toast('🪲 황금풍뎅이가 금광석을 두고 날아갔어요!'); }
    sfx('catch-5');
    return true;
  };
  g.addInteractable({
    id: 'hidden:pyramid-chest', radius: 3.2, position: () => (pyrR ? L('pyramid', pyrR.chestAt) : V3(0, -1e4, 0)),
    label: () => (dailyReady(F(), 'chest:pyramid', day()) ? '황금 보물상자 열기 👑' : '빈 상자(내일 또)'),
    enabled: () => inVault() && allSolved(states), onUse: () => roomChest('pyramid'),
  });

  // ───────────── 매 프레임 ─────────────
  let lastTideWarn = -1;
  game.onUpdate((t, dt) => {
    if (!onEarth()) return;
    const h = hour(), lift = tideLift(h), walk = lift >= TIDE.walkAt, solidBar = lift >= BAR_SOLID;
    // 모래톱: 높이·충돌체·조개
    const yOff = sandbarTopY(lift) - TIDE.top, today = day();
    for (const b of bars) {
      b.obj.position.y = yOff;
      b.obj.visible = lift > 0.002;
      if (solidBar && !b.body) b.body = g.physics.addStatic({ kind: 'mesh', vertices: b.shape.vertices, indices: b.shape.indices }, { x: 0, y: 0, z: 0 }, undefined, 'hidden');
      else if (!solidBar && b.body) { b.body.remove(); b.body = null; }
      if (b.day !== today) placeShells(b);
      for (const s of b.shells) s.m.visible = !shellTaken(s.i);
    }
    const inside = insideAny();
    if (!inside) {
      const p = g.player.pos;
      // 모래톱 발견 · 물 차는 경고
      if (bars.size && onSandbar()) {
        const pr = segProject(p.x, p.z, SB.a, SB.b);
        if (walk && pr.t > 0.12 && pr.t < 0.88 && g.player.mode === 'ground') discover('coral-sandbar');
        if (tideFalling(h) && lastTideWarn !== day()) { lastTideWarn = day(); toast('🌊 물이 차오르고 있어요! 얼른 땅으로~'); }
      }
      // 신전: 모래폭풍일 때만
      if (templeM) {
        const w = g.env?.regionWeather?.(temple.x, temple.z) ?? g.env?.weatherOf?.('desert') ?? 'clear';
        templeK = fadeToward(templeK, templeVisible(w), dt);
        templeM.fade.opacity = templeK;
        templeM.fade.depthWrite = templeK > 0.95;
        templeM.root.visible = templeK > 0.01;
        const solid = templeSolid(templeK);
        if (solid && !templeBodies.length) templeBodies = addCols(anchorOf('desert-temple'), templeCols);
        else if (!solid && templeBodies.length) { for (const b of templeBodies) b.remove(); templeBodies = []; }
        if (solid && Math.hypot(p.x - temple.x, p.z - temple.z) < 16) discover('desert-temple');
      }
      // 활공대: 올라서면 발견 · 기류 기둥 안이면 위로
      if (glidePushT > 0) {
        // 출발대에서 뛴 직후: 땅에 다시 닿기 전까지 바깥쪽 수평 속도를 지켜 준다
        glidePushT -= dt;
        const pl = g.player, d = glide.dir;
        if (pl.mode === 'ground' && glidePushT < GLIDE_PUSH.sec - 0.15) glidePushT = 0;
        else if (!pl.mounted) {
          const along = pl.vel.x * d.x + pl.vel.z * d.z;
          if (along < GLIDE_PUSH.speed) { pl.vel.x += d.x * (GLIDE_PUSH.speed - along); pl.vel.z += d.z * (GLIDE_PUSH.speed - along); }
        }
      }
      if (glideM) {
        const a = anchorOf('launch-glide'), c = toWorld(a, 0, 0, DECK_LEN / 2 - 1);
        if (Math.hypot(p.x - c.x, p.z - c.z) < 4.5 && Math.abs(p.y - (a.y + DECK_Y)) < 1.5) discover('launch-glide');
        const pl = g.player;
        if (pl.mode === 'glide' || pl.mode === 'air') {
          const up = updraftLift(p.x - glide.col.x, p.z - glide.col.z, p.y, glide.col.base);
          if (up > 0) {
            pl.vel.y = Math.max(pl.vel.y, up * (pl.mode === 'glide' ? 1 : 0.45));
            pl.stamina = Math.min(1, pl.stamina + dt * 0.15);
          }
        }
      }
    }
    for (const s of live.values()) { try { s.update?.(t, dt); } catch (e) { console.error(`[hidden ${s.id}]`, e); } }
  });

  // ───────────── 지도·저장 이벤트 ─────────────
  game.hud.registerMapLayer?.({
    id: 'hidden', draw: (g2, toPx, _scale, world) => {
      if (world !== 'earth') return;
      for (const id of F().found) {
        if (!isHiddenId(id)) continue;
        const a = anchorOf(id), [x, y] = toPx(a.x, a.z);
        g2.font = '14px sans-serif';
        g2.textAlign = 'center'; g2.textBaseline = 'middle';
        g2.fillText(SPOTS[id].icon, x, y);
      }
    },
  });

  // ───────────── game.ext.hidden ─────────────
  const spots = () => anchors.filter((a) => a.id !== 'pyramid').map((a) => ({ id: a.id, x: a.x, z: a.z, island: SPOTS[a.id as HiddenId].island }));
  g.ext.hidden = {
    ids: [...HIDDEN_IDS],
    found: (id: string) => isFound(id),
    list: () => [...F().found],
    spots,
    tide: () => { const l = tideLift(hour()); return { lift: l, walkable: l >= TIDE.walkAt, top: sandbarTopY(l), nextIn: hoursToLowTide(hour()) }; },
    templeVisible: () => templeSolid(templeK),
    temple: () => templeK,
    pyramid: { states: () => saveStates(states), solved: (k?: number) => (k === undefined ? allSolved(states) : !!states[k]?.solved), allSolved: () => allSolved(states) },
    enter: (k: RoomKey) => (k in SLOT ? enterRoom(k) : false),
  };

  // ───────────── window.__hidden ─────────────
  if (typeof window !== 'undefined') {
    const goto = (id: string) => {
      if (insideAny()) interiors()?.exit();
      const tp = (v: THREE.Vector3, yaw?: number) => { g.player.teleport(v.x, v.z); if (yaw !== undefined) { g.player.yaw = yaw; g.cam.yaw = yaw; } return g.player.pos.clone(); };
      switch (id) {
        case 'coral-clam': { const a = anchorOf('coral-clam'); return tp(V3(a.x, 0, a.z + 3.2), 0); }
        case 'coral-pirate-cave': return tp(toWorld(anchorOf('coral-pirate-cave'), 0, 0, 6), anchorOf('coral-pirate-cave').rotY);
        case 'coral-sandbar': { const t = 0.3; return tp(V3(SB.a.x + (SB.b.x - SB.a.x) * t, 0, SB.a.z + (SB.b.z - SB.a.z) * t), rotTo(SBdir) + Math.PI); }
        case 'desert-temple': return tp(toWorld(anchorOf('desert-temple'), 0, 0, 14), anchorOf('desert-temple').rotY);
        case 'desert-water-cave': return tp(toWorld(anchorOf('desert-water-cave'), 0, 0, 4.5), 0);
        case 'desert-trex': return tp(toWorld(anchorOf('desert-trex'), 0, 0, 5.5), anchorOf('desert-trex').rotY);
        case 'launch-meteorite': return tp(toWorld(anchorOf('launch-meteorite'), 0, 0, 8), 0);
        case 'launch-glide': return tp(toWorld(anchorOf('launch-glide'), 0, 0, 1), anchorOf('launch-glide').rotY + Math.PI);
        case 'pyramid': return tp(V3(pyramid.door.x + pyramid.dir.x * 4, 0, pyramid.door.z + pyramid.dir.z * 4), rotTo(pyramid.dir));
      }
      return null;
    };
    (window as unknown as { __hidden?: unknown }).__hidden = {
      state: () => JSON.parse(JSON.stringify({ flags: F(), tide: g.ext.hidden.tide(), temple: templeK, puzzle: saveStates(states), live: [...live.keys()], bars: bars.size })),
      found: () => [...F().found],
      spots,
      goto,
      enter: (k: RoomKey) => enterRoom(k),
      exit: () => interiors()?.exit() ?? false,
      tide: (h?: number) => { if (typeof h === 'number') g.env?.setHour?.(h); const l = tideLift(hour()); return { hour: hour(), lift: l, walkable: sandbarWalkable(hour()) }; },
      storm: (on = true) => { g.env?.forceWeather?.('desert', on ? 'sandstorm' : null, 6); return on; },
      discover: (id: string) => (isHiddenId(id) ? discover(id) : false),
      pearl: () => takePearl(),
      shells: () => shellsToday().map((s) => ({ ...s, taken: shellTaken(s.i), pos: shellPos(s) })),
      push: (dir?: Dir) => {
        const tg = pushTarget();
        if (!tg) return false;
        return doPush(tg.k, tg.px, tg.py, dir && dir === tg.dir ? dir : tg.dir);
      },
      solve: (k?: number) => {
        const ks = k === undefined ? PUZZLE_ROOMS.map((_, i) => i) : [k];
        for (const j of ks) if (!states[j].solved) { states = states.map((s, i) => (i === j ? solvedState(PUZZLE_ROOMS[j], s.moves) : s)); onRoomSolved(j); }
        persistPuzzle();
        if (insideRoom('pyramid')) addPyramidBodies();
        syncPyramid(true);
        return saveStates(states);
      },
      reset: (k?: number) => {
        const ks = k === undefined ? PUZZLE_ROOMS.map((_, i) => i) : [k];
        states = states.map((s, i) => (ks.includes(i) ? { blocks: PUZZLE_ROOMS[i].start.map(([x, y]) => [x, y] as [number, number]), solved: false, moves: 0 } : s));
        persistPuzzle();
        if (insideRoom('pyramid')) addPyramidBodies();
        syncPyramid(true);
        return saveStates(states);
      },
      pyramid: () => ({ states: saveStates(states), covered: states.map((s, k) => covered(PUZZLE_ROOMS[k], s)), all: allSolved(states) }),
      /** 보물방으로 바로(다 풀린 상태로) */
      vault: () => {
        if (!insideRoom('pyramid')) enterRoom('pyramid');
        const V = ROOMS.length - 1, c = cellToLocal(V, Math.floor(ROOMS[V].w / 2), 3);
        g.player.teleport(c.x + O.pyramid.x, c.z + O.pyramid.z, O.pyramid.y);
        return true;
      },
      glide: () => { goto('launch-glide'); return { col: glide.col, deck: deckEnd() }; },
      temple: () => templeK,
    };
  }

  return root;
}
