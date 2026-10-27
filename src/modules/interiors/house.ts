// 내 집 안(GDD 4.12) — 집 단계(1~4)마다 넓어지는 방 · 꾸미기 모드(H): 0.5 m 격자에 가방 속 f_* 가구를 놓고(E) 집고(E) 돌린다(R) ·
// Z/X 로 놓을 가구 고르기 · F 로 수조·케이지·피규어 안의 친구 바꾸기 · 벽지·바닥 견본 · 붙박이 보관함(창 'storage' — econ.storage) ·
// 붙박이 진열장(econ.display 친구 6마리) · 집 점수(다양성 + 테마) → flags.interiors.score.
// 굳은 가구는 바뀔 때마다 하나로 굽고(재질 수만큼 draw call), 움직이는 조각·생물만 따로 그린다.
import * as THREE from 'three';
import type { Game } from '../../core/game';
import type { Species } from '../../core/state';
import { Builder, disposeTree } from './kit';
import { buildFurniture, type FurnitureModel, type Slot } from './furniture';
import { CritterSet, critterColors, critterColor, shapeOfSpecies } from './critters';
import { buildHouseShell, applySwatch, WALL_H, type HouseShell } from './rooms';
import {
  GRID, rotFoot, rotRad, nextRot, canPlace, placeItem, removeItem, pickAt, anchorAt, clampAnchor, localToCell, placedCenter,
  serializeLayout, restoreLayout, newUid, type Placed, type RoomGrid, type Rot,
} from './placement';
import {
  footOf, furnitureDef, isFurniture, roomForStage, blockedCells, houseScore, holderCandidates, cycleHolder, fillSlots,
  wallById, floorById, DEFAULT_WALL, DEFAULT_FLOOR, STAGE_NAME, type HouseScore, type DexSpecies,
} from './logic';
import type { InteriorBox } from './infra';
import { GOODS } from '../economy/data';
import { PLACES } from '../../core/island';
import { splitVariant } from '../../core/api';

/** flags.interiors 모양 */
export interface InteriorsFlags {
  v: number;
  layout: Placed[];
  wall: string;
  floor: string;
  score: number;
  stars: number;
  /** 진열장 친구(종 id, 최대 6) — econ.display 가 없을 때만 쓴다(생기면 econ 으로 옮기고 비운다) */
  display: string[];
  /** econ.storage 가 아직 없을 때 쓰는 보관함 */
  chest: Record<string, number>;
  /** 박물관 해설을 들은 종 */
  heard?: string[];
}
export const DISPLAY_MAX = 6;
/** 진열장에 세울 수 있는 친구 갈래 */
export const DISPLAY_CATS = ['fish', 'bug', 'insect', 'sea', 'space', 'dino'];
/** 집 단계마다 문까지 거리(집 가운데 → 문 바로 앞, m) */
const DOOR_DIST = [1.9, 1.95, 2.35, 2.45, 2.75];

export function readFlags(game: Game): InteriorsFlags {
  const fl = game.state.flags as Record<string, unknown>;
  let f = fl.interiors as InteriorsFlags | undefined;
  if (!f || typeof f !== 'object') fl.interiors = f = {} as InteriorsFlags;
  f.v = 1;
  if (!Array.isArray(f.layout)) f.layout = [];
  if (typeof f.wall !== 'string') f.wall = DEFAULT_WALL;
  if (typeof f.floor !== 'string') f.floor = DEFAULT_FLOOR;
  if (!Number.isFinite(f.score)) f.score = 0;
  if (!Number.isFinite(f.stars)) f.stars = 1;
  if (!Array.isArray(f.display)) f.display = [];
  if (!f.chest || typeof f.chest !== 'object') f.chest = {};
  return f;
}

/** 지금 집 단계(village → 없으면 econ 해금 house:1~4) */
export function houseStageOf(game: Game): number {
  const v = game.ext.village?.houseStage?.();
  if (typeof v === 'number' && v >= 0) return Math.min(4, v);
  let s = 0;
  for (let i = 1; i <= 4; i++) if (game.econ?.isUnlocked?.(`house:${i}`)) s = i;
  return s;
}

// ───────────── 진열장(econ.display 가 주인 — 없으면 flags.interiors.display) ─────────────
type EconDisplay = {
  display?: (id: string, on: boolean) => unknown;
  displayed?: () => Array<{ id: string; n: number }>;
  displayMax?: () => number;
  storage?: { list(): Array<{ id: string; n: number }> };
};
const econDisplay = (game: Game): EconDisplay | null => {
  const e = game.econ as unknown as EconDisplay | null;
  return e && typeof e.display === 'function' && typeof e.displayed === 'function' ? e : null;
};
/** 예전(econ.display 이전) 진열 목록을 econ 으로 옮긴다 — 가방·보관함에 있는 친구만 올라가고, 나머지는 조용히 내린다 */
function migrateDisplay(game: Game, e: EconDisplay) {
  const f = readFlags(game);
  if (!f.display.length) return;
  const old = f.display;
  f.display = [];
  const have = new Set((e.displayed?.() ?? []).map((r) => splitVariant(r.id).id));
  const inStore = new Set((e.storage?.list?.() ?? []).filter((r) => r.n > 0).map((r) => r.id));
  for (const id of old) {
    if (have.has(id) || !(game.state.has(id) || inStore.has(id))) continue;
    try { if (e.display!(id, true) !== false) have.add(id); } catch (err) { console.error('[interiors display migrate]', err); }
  }
  game.state.save();
}
/** 진열장에 선 친구(가방 키, 칸마다 하나 — 같은 친구 둘이면 두 번) */
export function displayKeys(game: Game): string[] {
  const e = econDisplay(game);
  if (!e) return [...readFlags(game).display];
  migrateDisplay(game, e);
  const out: string[] = [];
  for (const r of e.displayed!() ?? []) for (let i = 0; i < Math.max(0, Math.floor(r.n)); i++) out.push(r.id);
  return out;
}
/** 진열장 칸 수(econ.displayMax — 집 단계마다 늘어난다) */
export function displayCap(game: Game): number {
  const m = econDisplay(game)?.displayMax?.();
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? Math.floor(m) : DISPLAY_MAX;
}
/** 진열장 후보: 가방·보관함에 있는 생물(가방 키) */
export function displayCandidates(game: Game): string[] {
  const st = game.state;
  const keys = new Set<string>();
  for (const [k, n] of Object.entries(st.bag)) if (n > 0) keys.add(k);
  const e = game.econ as unknown as EconDisplay | null;
  try { for (const r of e?.storage?.list?.() ?? []) if (r.n > 0) keys.add(r.id); } catch { /* 없음 */ }
  if (!econDisplay(game)) for (const [k, n] of Object.entries(readFlags(game).chest)) if (n > 0) keys.add(k);
  return [...keys].filter((k) => { const s = st.species.get(splitVariant(k).id); return !!s && DISPLAY_CATS.includes(s.category); });
}

interface DynLive { pivot: THREE.Object3D; anim: FurnitureModel['dyn'][number]['anim']; speed: number; ph: number; base: THREE.Vector3 }

export class HouseInterior {
  readonly root = new THREE.Group();
  stage = -1;
  room: RoomGrid = roomForStage(0);
  layout: Placed[] = [];
  placing = false;
  sel = 0;
  rot: Rot = 0;
  /** 지금 커서(칸) */
  cursor = { gx: 0, gz: 0 };
  private shell: HouseShell | null = null;
  private furnStatic: THREE.Group | null = null;
  private dynRoot = new THREE.Group();
  private dyn: DynLive[] = [];
  private critters = new CritterSet({ fish: 24, bug: 10, sea: 8, space: 8, dino: 6, blob: 6 }, 'interiors-house-critters');
  private ghost = new THREE.Group();
  private ghostCells: THREE.InstancedMesh;
  private ghostModel: THREE.Object3D | null = null;
  private ghostItem = '';
  private ghostMat = new THREE.MeshStandardMaterial({ color: '#bff5c8', transparent: true, opacity: 0.55, roughness: 0.4, depthWrite: false });
  private ghostBad = new THREE.MeshStandardMaterial({ color: '#ffb3b3', transparent: true, opacity: 0.55, roughness: 0.4, depthWrite: false });
  private bodies: Array<{ remove(): void }> = [];
  private models = new Map<string, FurnitureModel>();
  private dynCache = new Map<string, THREE.Group[]>();
  inside = false;
  private bar: HTMLDivElement | null = null;
  private barSig = '';
  score: HouseScore;

  constructor(private game: Game, readonly origin: THREE.Vector3) {
    this.root.name = 'interiors-house';
    this.root.position.copy(origin);
    this.dynRoot.name = 'interiors-house-dyn';
    const cellGeo = new THREE.PlaneGeometry(GRID * 0.92, GRID * 0.92).rotateX(-Math.PI / 2);
    this.ghostCells = new THREE.InstancedMesh(cellGeo, new THREE.MeshBasicMaterial({ color: '#7de39a', transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }), 64);
    this.ghostCells.count = 0;
    this.ghostCells.frustumCulled = false;
    this.ghostCells.renderOrder = 4;
    this.ghost.add(this.ghostCells);
    this.ghost.visible = false;
    this.root.add(this.dynRoot, this.critters.root, this.ghost);
    this.score = houseScore([], DEFAULT_WALL, DEFAULT_FLOOR);
  }

  get flags() { return readFlags(this.game); }
  get W() { return this.room.w * GRID; }
  get D() { return this.room.d * GRID; }

  // ───────────── 단계·방 ─────────────
  /** 단계에 맞춰 방을 (다시) 만들고 저장된 배치를 되살린다. 방이 작아져 못 놓는 가구는 가방으로 돌려준다 */
  syncStage(force = false) {
    const s = houseStageOf(this.game);
    if (s === this.stage && !force) return;
    this.stage = s;
    this.room = roomForStage(s);
    const f = this.flags;
    const { layout, dropped } = restoreLayout(f.layout, this.room, footOf, { known: isFurniture, blocked: blockedCells(this.room) });
    this.layout = layout;
    // 가방이 꽉 차 못 돌려준 건 보관함으로(절대 그냥 사라지지 않게)
    for (const d of dropped) if (!this.giveBack(d.item, true)) this.stash(d.item);
    if (dropped.length) this.game.ui.toast(`방이 바뀌어 가구 ${dropped.length}개를 가방에 돌려놨어요 🎒`);
    if (this.shell) { this.root.remove(this.shell.group); disposeTree(this.shell.group); }
    this.shell = buildHouseShell(this.room, wallById(f.wall), floorById(f.floor));
    this.root.add(this.shell.group);
    this.rebuildFurniture();
    this.save();
  }
  /** 방 상자(월드) 안이면 바닥 높이 */
  floorAt(x: number, z: number): number | null {
    const lx = x - this.origin.x, lz = z - this.origin.z;
    return Math.abs(lx) <= this.W / 2 + 0.3 && Math.abs(lz) <= this.D / 2 + 0.3 ? this.origin.y : null;
  }
  spawn() { return new THREE.Vector3(this.origin.x, this.origin.y, this.origin.z + this.D / 2 - 0.9); }
  /** 집 문 앞(바깥) */
  doorOutside(): THREE.Vector3 {
    const pos = this.game.ext.village?.positions?.house as { x: number; z: number; rotY: number } | undefined;
    const hp = pos ?? this.fallbackHouse();
    const d = DOOR_DIST[Math.max(0, Math.min(4, houseStageOf(this.game)))];
    const x = hp.x + Math.sin(hp.rotY) * d, z = hp.z + Math.cos(hp.rotY) * d;
    return new THREE.Vector3(x, this.game.groundAt(x, z), z);
  }
  exitSpot(): THREE.Vector3 {
    const hp = (this.game.ext.village?.positions?.house as { x: number; z: number; rotY: number } | undefined) ?? this.fallbackHouse();
    const d = this.doorOutside();
    const x = d.x + Math.sin(hp.rotY) * 1.4, z = d.z + Math.cos(hp.rotY) * 1.4;
    return new THREE.Vector3(x, this.game.groundAt(x, z), z);
  }
  /** village 가 없을 때(룩 테스트·단독 실행) — 섬 데이터의 집 터 */
  private fallbackHouse(): { x: number; z: number; rotY: number } {
    const h = PLACES.house;
    return { x: h.x, z: h.z, rotY: h.rotY ?? 0 };
  }
  /** 벽·바닥 충돌 상자(월드) */
  colliders(): InteriorBox[] {
    const O = this.origin, W = this.W, D = this.D, h = WALL_H;
    return [
      { hx: W / 2 + 1, hy: 0.5, hz: D / 2 + 1, x: O.x, y: O.y - 0.5, z: O.z },
      { hx: W / 2 + 0.5, hy: h / 2 + 1, hz: 0.2, x: O.x, y: O.y + h / 2, z: O.z - D / 2 - 0.2 },
      { hx: W / 2 + 0.5, hy: h / 2 + 1, hz: 0.2, x: O.x, y: O.y + h / 2, z: O.z + D / 2 + 0.2 },
      { hx: 0.2, hy: h / 2 + 1, hz: D / 2 + 0.5, x: O.x - W / 2 - 0.2, y: O.y + h / 2, z: O.z },
      { hx: 0.2, hy: h / 2 + 1, hz: D / 2 + 0.5, x: O.x + W / 2 + 0.2, y: O.y + h / 2, z: O.z },
    ];
  }

  // ───────────── 가구 굽기 ─────────────
  private model(item: string) {
    let m = this.models.get(item);
    if (!m) { m = buildFurniture(item); this.models.set(item, m); }
    return m;
  }
  /** 움직이는 조각(아이템마다 한 번 굽고, 놓인 수만큼 복제 — 지오메트리는 공유) */
  private dynGroups(item: string): THREE.Group[] {
    let gs = this.dynCache.get(item);
    if (!gs) {
      gs = this.model(item).dyn.map((d, i) => {
        const g = d.b.bake(`dyn:${item}:${i}`);
        g.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.userData.shared = true; });
        return g;
      });
      this.dynCache.set(item, gs);
    }
    return gs;
  }
  rebuildFurniture() {
    if (this.furnStatic) { this.root.remove(this.furnStatic); disposeTree(this.furnStatic); this.furnStatic = null; }
    this.dynRoot.clear();
    this.dyn = [];
    const b = new Builder();
    for (const p of this.layout) {
      const c = placedCenter(p, this.room, footOf);
      const m = this.model(p.item);
      b.push([c.x, 0, c.z], [0, rotRad(p.rot), 0]).absorb(m.b).pop();
      const holders = this.dynGroups(p.item);
      m.dyn.forEach((d, i) => {
        const holder = new THREE.Group();
        holder.position.set(c.x, 0, c.z);
        holder.rotation.y = rotRad(p.rot);
        const pivot = new THREE.Group();
        pivot.position.set(...d.at);
        pivot.add(holders[i].clone());
        holder.add(pivot);
        this.dynRoot.add(holder);
        this.dyn.push({ pivot, anim: d.anim, speed: d.speed ?? 1, ph: (p.gx * 7 + p.gz * 13) % 10, base: pivot.position.clone() });
      });
    }
    this.furnStatic = b.empty ? new THREE.Group() : b.bake('interiors-furniture');
    this.root.add(this.furnStatic);
    if (this.inside) this.rebuildBodies();
    this.rescore();
  }
  /** 가구·붙박이 충돌(서는 가구만) */
  rebuildBodies() {
    this.clearBodies();
    const ph = this.game.physics;
    const O = this.origin;
    const add = (hx: number, hy: number, hz: number, x: number, z: number) => {
      this.bodies.push(ph.addStatic({ kind: 'box', hx, hy, hz }, { x: O.x + x, y: O.y + hy, z: O.z + z }, undefined, 'interior'));
    };
    for (const p of this.layout) {
      const d = furnitureDef(p.item);
      if ((d.layer ?? 'solid') !== 'solid') continue;
      const f = rotFoot(footOf(p.item), p.rot), c = placedCenter(p, this.room, footOf);
      add(Math.max(0.12, f.w * GRID / 2 - 0.06), Math.max(0.2, (d.h ?? 0.8) / 2), Math.max(0.12, f.d * GRID / 2 - 0.06), c.x, c.z);
    }
    const sh = this.shell;
    if (sh) {
      add(0.68, 0.4, 0.42, sh.chest.x, sh.chest.z);
      add(0.98, 1.0, 0.34, sh.display.x, sh.display.z);
    }
  }
  clearBodies() { for (const b of this.bodies) b.remove(); this.bodies = []; }

  /** 아직 방을 안 맞췄으면(불러온 직후 밖에서 API 를 부를 때) 먼저 맞춘다 — 저장된 배치를 []로 덮지 않게 */
  ensure() { if (this.stage < 0) this.syncStage(); }

  // ───────────── 점수 ─────────────
  rescore() {
    this.ensure();
    const f = this.flags;
    const prevStars = f.stars;
    this.score = houseScore(this.layout, f.wall, f.floor, displayKeys(this.game).map((k) => splitVariant(k).id));
    f.score = this.score.score;
    f.stars = this.score.stars;
    this.save();
    if (this.inside && this.score.stars > prevStars) {
      this.game.hud.banner({ text: `🏠 집 점수 ${'★'.repeat(this.score.stars)}`, sub: `${this.score.score}점! 정말 아늑해졌어요`, icon: '🏠', color: '#ffb37a', ms: 2600 });
      this.game.audio?.sfx('achievement');
    }
    this.game.state.emit({ type: 'house-score', score: this.score.score, stars: this.score.stars });
  }
  save() {
    const f = this.flags;
    // 방을 맞추기 전엔 this.layout 이 비어 있다 — 저장된 배치를 지우지 않는다
    if (this.stage >= 0) f.layout = serializeLayout(this.layout);
    this.game.state.save();
  }

  // ───────────── 벽지·바닥 ─────────────
  setWall(id: string) {
    this.ensure();
    const f = this.flags;
    f.wall = wallById(id).id;
    if (this.shell) applySwatch(this.shell.wallMat, wallById(f.wall), 'wall');
    this.rescore();
  }
  setFloor(id: string) {
    this.ensure();
    const f = this.flags;
    f.floor = floorById(id).id;
    if (this.shell) applySwatch(this.shell.floorMat, floorById(f.floor), 'floor');
    this.rescore();
  }

  // ───────────── 가방 ─────────────
  /** 가방 속 가구(놓을 수 있는 것) */
  bagFurniture(): string[] {
    const bag = this.game.state.bag;
    return Object.keys(bag).filter((k) => isFurniture(k) && (bag[k] ?? 0) > 0).sort();
  }
  selected(): string | null {
    const list = this.bagFurniture();
    if (!list.length) return null;
    this.sel = ((this.sel % list.length) + list.length) % list.length;
    return list[this.sel];
  }
  private giveBack(item: string, silent = false): boolean {
    const econ = this.game.econ;
    const n = econ?.give ? econ.give(item, 1, 'interiors', { silent }) : (this.game.state.addItem(item, 1), 1);
    return n > 0;
  }
  /** 가방이 꽉 찼을 때 — 보관함(없으면 flags.interiors.chest)에 맡긴다 */
  private stash(item: string) {
    const S = this.game.econ?.storage;
    if (S && typeof S.put === 'function') {
      // econ.storage.put 은 가방에서 옮기는 길뿐 — 잠깐 가방에 넣고 옮긴다(실패하면 임시 보관함으로)
      this.game.state.addItem(item, 1);
      let ok = false;
      try { ok = S.put(item, 1) !== false; } catch (e) { console.error('[interiors stash]', e); }
      if (ok) return;
      this.game.state.addItem(item, -1);
    }
    const c = this.flags.chest;
    c[item] = (c[item] ?? 0) + 1;
    this.game.ui.toast(`가방이 꽉 차서 ${nameOf(this.game, item)}은(는) 집 보관함에 넣어 뒀어요 🧰`);
  }

  // ───────────── 놓기·집기 ─────────────
  private caught(): DexSpecies[] {
    const st = this.game.state;
    const out: DexSpecies[] = [];
    for (const id of Object.keys(st.dex)) { const s = st.species.get(id); if (s) out.push(s); }
    return out;
  }
  /** 수조·케이지·피규어 기본 친구 */
  defaultArg(item: string): string | undefined {
    const d = furnitureDef(item);
    if (!d.holds) return undefined;
    const list = holderCandidates(d.holds, this.caught());
    const first = cycleHolder(list, undefined);
    return (d.slots ?? 1) > 1 ? fillSlots(list, first, d.slots ?? 1) || undefined : first ?? undefined;
  }
  /** 그 자리에 놓기(디버그·테스트도 이걸 쓴다). 가방에서 하나 빠진다 */
  place(item: string, gx: number, gz: number, rot: Rot = 0, arg?: string): { ok: boolean; why?: string; uid?: string } {
    if (!isFurniture(item)) return { ok: false, why: 'not-furniture' };
    if (!this.game.state.has(item)) return { ok: false, why: 'no-item' };
    const cand: Placed = { uid: newUid(this.layout, item), item, gx, gz, rot, arg: arg ?? this.defaultArg(item) };
    if (!cand.arg) delete cand.arg;
    const r = canPlace(this.layout, cand, this.room, footOf, blockedCells(this.room));
    if (!r.ok) return { ok: false, why: r.why };
    this.game.state.addItem(item, -1);
    this.layout = placeItem(this.layout, cand);
    this.rebuildFurniture();
    this.game.audio?.sfx('build');
    this.game.state.emit({ type: 'place', item, where: 'house' });
    return { ok: true, uid: cand.uid };
  }
  /** 집어서 가방으로 */
  pickUp(uid: string): boolean {
    this.ensure();
    const p = this.layout.find((o) => o.uid === uid);
    if (!p) return false;
    if (!this.giveBack(p.item)) { this.game.ui.toast('가방이 꽉 차서 집을 수 없어요 🎒'); return false; }
    this.layout = removeItem(this.layout, uid);
    this.rebuildFurniture();
    this.game.audio?.sfx('pick');
    return true;
  }
  /** 안에 든 친구 바꾸기(F) */
  cycleArg(uid: string, step = 1): string | null {
    this.ensure();
    const p = this.layout.find((o) => o.uid === uid);
    if (!p) return null;
    const d = furnitureDef(p.item);
    if (!d.holds) return null;
    const list = holderCandidates(d.holds, this.caught());
    if (!list.length) { this.game.ui.toast(d.holds === 'fish' ? '먼저 물고기를 잡아 와요 🎣' : d.holds === 'bug' ? '먼저 곤충을 잡아 와요 🦋' : '먼저 친구를 잡아 와요!'); return null; }
    const cur = p.arg?.split('|')[0];
    const next = cycleHolder(list, cur, step);
    p.arg = ((d.slots ?? 1) > 1 ? fillSlots(list, next, d.slots ?? 1) : next) || undefined;
    if (!p.arg) delete p.arg;
    this.save();
    this.rescore();
    const nm = next ? this.game.state.species.get(next)?.name ?? next : '';
    if (nm) this.game.ui.toast(`${nm} 전시 중 ✨`);
    return p.arg ?? null;
  }

  // ───────────── 진열장 ─────────────
  /** 진열하기·빼기. econ.display 가 있으면 econ 이 정한다(가방·보관함에서 꺼내고 칸 수도 econ 이 센다) */
  setDisplay(id: string, on: boolean): boolean {
    this.ensure();
    const e = econDisplay(this.game);
    if (e) {
      migrateDisplay(this.game, e);
      let ok = false;
      try { ok = e.display!(id, on) !== false; } catch (err) { console.error('[interiors display]', err); }
      if (ok) this.rescore();
      return ok;
    }
    // econ.display 이전: 가방·임시 보관함에 있는 친구만, 꺼내지 않고 세워 둔다
    const f = this.flags;
    const has = f.display.includes(id);
    if (on && !has) {
      if (!displayCandidates(this.game).includes(id)) { this.game.ui.toast('가방에도 보관함에도 없어요 🎒'); return false; }
      if (f.display.length >= DISPLAY_MAX) { this.game.ui.toast(`진열장은 ${DISPLAY_MAX}칸이에요. 하나를 빼고 넣어 줘요`); return false; }
      f.display.push(id);
    } else if (!on && has) f.display = f.display.filter((x) => x !== id);
    else return true;
    this.rescore();
    return true;
  }

  // ───────────── 꾸미기 모드 ─────────────
  setPlacing(on: boolean) {
    if (on === this.placing) return;
    this.placing = on;
    this.ghost.visible = on;
    if (on) {
      this.game.hud.toast('🛠️ 꾸미기 모드 — E 놓기·집기 · R 돌리기 · Z/X 가구 고르기 · F 안의 친구 바꾸기 · H 끝내기');
      this.game.audio?.sfx('ui-open');
    } else this.game.audio?.sfx('ui-close');
    this.renderBar(true);
  }
  /** 커서 칸(플레이어 앞 0.9 m) */
  private updateCursor() {
    const p = this.game.player;
    const f = p.facing();
    const lx = p.pos.x - this.origin.x + f.x * 0.95, lz = p.pos.z - this.origin.z + f.z * 0.95;
    const c = localToCell(lx, lz, this.room);
    this.cursor = { gx: Math.max(0, Math.min(this.room.w - 1, c.gx)), gz: Math.max(0, Math.min(this.room.d - 1, c.gz)) };
  }
  /** 지금 커서가 가리키는 것: 놓인 가구(집기) 또는 놓을 후보 */
  target(): { kind: 'pick'; p: Placed } | { kind: 'place'; cand: Placed; ok: boolean; why?: string } | { kind: 'none' } {
    const hit = pickAt(this.layout, this.cursor.gx, this.cursor.gz, footOf);
    const item = this.selected();
    if (hit && (!item || (furnitureDef(hit.item).layer ?? 'solid') === 'solid' || (furnitureDef(item).layer ?? 'solid') !== 'solid')) return { kind: 'pick', p: hit };
    if (!item) return hit ? { kind: 'pick', p: hit } : { kind: 'none' };
    const foot = footOf(item);
    const a = clampAnchor(anchorAt(this.cursor.gx, this.cursor.gz, foot, this.rot), foot, this.rot, this.room);
    const cand: Placed = { uid: '(ghost)', item, gx: a.gx, gz: a.gz, rot: this.rot };
    const r = canPlace(this.layout, cand, this.room, footOf, blockedCells(this.room));
    return r.ok ? { kind: 'place', cand, ok: true } : { kind: 'place', cand, ok: false, why: r.why };
  }
  /** E */
  useTarget() {
    const t = this.target();
    if (t.kind === 'pick') { this.pickUp(t.p.uid); return; }
    if (t.kind === 'place') {
      if (!t.ok) { this.game.ui.toast(t.why === 'blocked' ? '여긴 붙박이 자리예요 🙅' : t.why === 'bounds' ? '방 밖으로 나가요!' : '다른 가구랑 겹쳐요 💦'); this.game.audio?.sfx('fail-splash'); return; }
      const r = this.place(t.cand.item, t.cand.gx, t.cand.gz, t.cand.rot);
      if (r.ok) this.game.ui.toast(`${nameOf(this.game, t.cand.item)} 놓았어요! 🏠`);
      return;
    }
    this.game.ui.toast('가방에 가구가 없어요 — 상점·작업대에서 가구를 구해 와요 🪑');
  }
  /** F(안의 친구) — 커서 아래 가구 */
  holderUnderCursor(): Placed | null {
    const hit = pickAt(this.layout, this.cursor.gx, this.cursor.gz, footOf);
    return hit && furnitureDef(hit.item).holds ? hit : null;
  }

  private updateGhost() {
    const t = this.target();
    const cells: Array<[number, number]> = [];
    let ok = true;
    let model: string | null = null;
    let at: { x: number; z: number; rot: number } | null = null;
    if (t.kind === 'pick') {
      const f = rotFoot(footOf(t.p.item), t.p.rot);
      for (let x = 0; x < f.w; x++) for (let z = 0; z < f.d; z++) cells.push([t.p.gx + x, t.p.gz + z]);
      (this.ghostCells.material as THREE.MeshBasicMaterial).color.set('#ffd84a');
    } else if (t.kind === 'place') {
      const f = rotFoot(footOf(t.cand.item), t.cand.rot);
      for (let x = 0; x < f.w; x++) for (let z = 0; z < f.d; z++) cells.push([t.cand.gx + x, t.cand.gz + z]);
      ok = t.ok;
      (this.ghostCells.material as THREE.MeshBasicMaterial).color.set(ok ? '#7de39a' : '#ff8a8a');
      model = t.cand.item;
      const c = placedCenter(t.cand, this.room, footOf);
      at = { x: c.x, z: c.z, rot: rotRad(t.cand.rot) };
    } else {
      cells.push([this.cursor.gx, this.cursor.gz]);
      (this.ghostCells.material as THREE.MeshBasicMaterial).color.set('#c9b6f2');
    }
    const m = new THREE.Matrix4();
    this.ghostCells.count = Math.min(64, cells.length);
    cells.slice(0, 64).forEach(([gx, gz], i) => {
      m.makeTranslation((gx + 0.5) * GRID - this.W / 2, 0.03, (gz + 0.5) * GRID - this.D / 2);
      this.ghostCells.setMatrixAt(i, m);
    });
    this.ghostCells.instanceMatrix.needsUpdate = true;
    if (model !== this.ghostItem) {
      if (this.ghostModel) { this.ghost.remove(this.ghostModel); disposeTree(this.ghostModel); this.ghostModel = null; }
      this.ghostItem = model ?? '';
      if (model) {
        const g = new Builder().absorb(this.model(model).b);
        for (const d of this.model(model).dyn) g.push(d.at).absorb(d.b).pop();
        this.ghostModel = g.bake('ghost', { shadow: false });
        this.ghost.add(this.ghostModel);
      }
    }
    if (this.ghostModel && at) {
      this.ghostModel.position.set(at.x, 0.02, at.z);
      this.ghostModel.rotation.y = at.rot;
      const mat = ok ? this.ghostMat : this.ghostBad;
      this.ghostModel.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) mm.material = mat; });
    }
  }

  /** 꾸미기 모드 키(모듈 onUpdate 에서) */
  handleKeys(dt: number) {
    const inp = this.game.input;
    if (this.game.player.locked) return;
    if (inp.hit('KeyR')) { this.rot = nextRot(this.rot); this.game.audio?.sfx('ui-click'); }
    // R 은 카메라 돌리기 키이기도 — 꾸미기 중엔 카메라를 붙잡아 둔다(카메라 갱신이 이 뒤에 돈다)
    if (inp.down('KeyR')) this.game.cam.yaw += dt * 2;
    const n = this.bagFurniture().length;
    if (n && inp.hit('KeyX')) { this.sel = (this.sel + 1) % n; this.game.audio?.sfx('ui-click'); }
    if (n && inp.hit('KeyZ')) { this.sel = (this.sel - 1 + n) % n; this.game.audio?.sfx('ui-click'); }
  }

  // ───────────── 매 프레임 ─────────────
  update(t: number, dt: number) {
    if (!this.inside) return;
    if (this.placing) { this.handleKeys(dt); this.updateCursor(); this.updateGhost(); }
    this.animateDyn(t);
    this.drawCritters(t);
    this.tintWindow();
    this.renderBar(false);
  }
  private animateDyn(t: number) {
    for (const d of this.dyn) {
      const p = d.pivot, k = t * d.speed + d.ph;
      switch (d.anim) {
        case 'spin': p.rotation.y = k * Math.PI * 0.8; break;
        case 'tick': p.rotation.z = -Math.floor(k * 1) * (Math.PI / 30); break;
        case 'bob': p.position.y = d.base.y + Math.sin(k * 2) * 0.03; break;
        case 'sway': p.rotation.z = Math.sin(k * 1.3) * 0.06; p.rotation.x = Math.sin(k * 0.9) * 0.04; break;
        case 'wobble': p.rotation.z = Math.sin(k * 7) * (Math.sin(k * 0.6) > 0.55 ? 0.12 : 0.02); break;
        case 'creak': p.rotation.y = Math.sin(k * 0.9) * 0.55; p.rotation.z = Math.sin(k * 3.1) * 0.05; break;
      }
    }
  }
  private drawCritters(t: number) {
    const st = this.game.state;
    const cs = this.critters;
    cs.begin();
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const pushSp = (sp: Species, slot: Slot, base: { x: number; z: number; rot: number }, ph: number) => {
      const [a, b] = critterColors(sp);
      const shape = shapeOfSpecies(sp);
      let lx = slot.c[0], ly = slot.c[1], lz = slot.c[2], yaw = 0, sc = slot.scale;
      if (slot.mode === 'swim') {
        const w = t * 0.55 + ph * 2.1;
        lx += Math.sin(w) * slot.s[0] * 0.5; lz += Math.sin(w * 2) * slot.s[2] * 0.25; ly += Math.sin(t * 0.9 + ph) * slot.s[1] * 0.3;
        yaw = Math.atan2(Math.cos(w) * slot.s[0] * 0.5, Math.cos(w * 2) * slot.s[2] * 0.5);
      } else if (slot.mode === 'perch') {
        const hop = Math.max(0, Math.sin(t * 0.8 + ph)) ** 8;
        ly += hop * 0.12; yaw = Math.sin(t * 0.3 + ph) * 0.8;
      } else yaw = t * 0.4 + ph;
      const br = 1 + 0.025 * (1 - Math.cos(2 * Math.PI * (t / 2 + ph * 0.13)));
      const c = Math.cos(base.rot), sn = Math.sin(base.rot);
      pos.set(base.x + lx * c + lz * sn, ly, base.z - lx * sn + lz * c);
      q.setFromAxisAngle(up, yaw + base.rot);
      s.set(sc * (1 + (br - 1) * 0.5), sc * br, sc * (1 + (br - 1) * 0.5));
      M.compose(pos, q, s);
      cs.push(shape, M, critterColor(a), critterColor(b));
    };
    for (const p of this.layout) {
      if (!p.arg) continue;
      const m = this.model(p.item);
      if (!m.slots.length) continue;
      const c = placedCenter(p, this.room, footOf);
      const ids = p.arg.split('|');
      m.slots.forEach((slot, i) => {
        const sp = st.species.get(ids[i % ids.length]);
        if (sp && i < ids.length) pushSp(sp, slot, { x: c.x, z: c.z, rot: rotRad(p.rot) }, i * 1.7 + p.gx * 0.3);
      });
    }
    const sh = this.shell;
    if (sh) {
      displayKeys(this.game).slice(0, sh.display.slots.length).forEach((key, i) => {
        const sp = st.species.get(splitVariant(key).id);
        const sl = sh.display.slots[i];
        if (!sp || !sl) return;
        pushSp(sp, { mode: 'pedestal', c: [0, sl[1] + 0.17, 0], s: [0, 0, 0], scale: 0.3 }, { x: sl[0], z: sl[2], rot: 0 }, i * 0.9);
      });
    }
    cs.end();
  }
  private tintWindow() {
    const sh = this.shell;
    if (!sh) return;
    const h = this.game.env?.hour ?? 12;
    const c = h >= 21 || h < 5 ? '#4a5aa8' : h >= 17 ? '#ffc9a0' : h < 9 ? '#ffe2c8' : '#bfe6ff';
    sh.windowMat.color.set(c);
  }

  // ───────────── 꾸미기 막대(DOM) ─────────────
  private renderBar(force: boolean) {
    if (typeof document === 'undefined' || !document.body) return;
    const show = this.inside && this.placing;
    if (!show) { if (this.bar) this.bar.style.display = 'none'; this.barSig = ''; return; }
    if (!this.bar) {
      const el = document.createElement('div');
      el.id = 'interiors-deco-bar';
      el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:40;max-width:min(92vw,900px);padding:10px 14px;border-radius:22px;'
        + 'background:#fff8e8;color:#4a3b2a;font-family:Jua,sans-serif;box-shadow:0 6px 0 #e9cfa6,0 10px 24px rgba(74,59,42,.18);border:3px solid #ffd9a8;pointer-events:auto;';
      el.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('[data-sel]') as HTMLElement | null;
        if (b) { this.sel = Number(b.dataset.sel) || 0; this.renderBar(true); }
      });
      document.body.appendChild(el);
      this.bar = el;
    }
    const list = this.bagFurniture();
    const item = this.selected();
    const sig = `${list.join(',')}|${item}|${this.rot}|${this.score.score}|${list.map((i) => this.game.state.bag[i]).join(',')}`;
    if (!force && sig === this.barSig) return;
    this.barSig = sig;
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const chips = list.length
      ? list.map((id, i) => `<button data-sel="${i}" style="all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px;margin:3px;padding:4px 10px;border-radius:14px;font-size:15px;`
        + `background:${id === item ? '#ffd9a8' : '#fff1dc'};border:2px solid ${id === item ? '#ff9f5a' : '#f2dcc0'}">${esc(iconOf(this.game, id))} ${esc(nameOf(this.game, id))} <small>×${this.game.state.bag[id]}</small></button>`).join('')
      : '<span style="opacity:.7">가방에 가구가 없어요 · 꽥꽥상회·작업대에서 구해 와요</span>';
    this.bar.style.display = 'block';
    this.bar.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;font-size:17px">🛠️ 꾸미기 모드 <span style="font-size:14px;opacity:.75">E 놓기·집기 · R 돌리기(${this.rot * 90}°) · Z/X 고르기 · F 안의 친구 · H 끝</span>`
      + `<span style="margin-left:auto">🏠 ${esc(this.score.score)}점 <b style="color:#ffb000">${'★'.repeat(this.score.stars)}</b>${'☆'.repeat(5 - this.score.stars)}</span></div><div>${chips}</div>`;
  }
  hideBar() { if (this.bar) this.bar.style.display = 'none'; }

  /** 디버그 요약 */
  snapshot() {
    return {
      stage: this.stage, stageName: STAGE_NAME[Math.max(0, this.stage)] ?? '', room: this.room, placing: this.placing, rot: this.rot, cursor: this.cursor,
      selected: this.selected(), layout: serializeLayout(this.layout), score: this.score, wall: this.flags.wall, floor: this.flags.floor, display: displayKeys(this.game),
      critters: this.critters.total(),
    };
  }
}

export const nameOf = (game: Game, id: string) => game.state.species.get(id)?.name ?? GOODS_NAME(id);
export const iconOf = (_game: Game, id: string) => GOODS_ICON(id);
const GOODS_NAME = (id: string) => GOODS[id]?.name ?? id;
const GOODS_ICON = (id: string) => GOODS[id]?.icon ?? '🪑';
