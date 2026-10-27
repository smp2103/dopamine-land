// 마당 꾸미기 놓기 모드 — 플레이어 앞 2.2 m 칸에 반투명 미리보기, E 놓기(치우기 모드면 치우기) · R 돌리기 · Esc / 마당 밖 = 그만.
// 격자·겹침 판정은 logic.ts(순수), 돈·재료·저장은 islanddev.ts 가 넘겨준 함수로.
import * as THREE from 'three';
import type { Game } from '../../core/game';
import { rngFor } from '../../core/rng';
import { Builder } from './kit';
import { addYardPiece } from './models';
import { YARD_DEFS, YARD_HALF, YARD_CELL, type DevIsland, type YardKind } from './data';
import { canPlace, cellsOf, pieceAtCell, snapCell, worldToYard, yardToWorld, type YardPiece } from './logic';

export interface YardSite { x: number; z: number; rot: number; y: number }
export interface YardHost {
  site(island: DevIsland): YardSite | null;
  pieces(island: DevIsland): YardPiece[];
  /** 놓기(비용을 내고 저장) — 성공하면 true */
  place(island: DevIsland, p: Omit<YardPiece, 'id'>): boolean;
  /** 치우기(돌려받고 저장) */
  remove(island: DevIsland, id: number): boolean;
  canAfford(k: YardKind, item?: string): boolean;
  /** 이 칸들 땅이 고른가(물·비탈 아님) */
  groundOk(island: DevIsland, cells: Array<[number, number]>): boolean;
  heightAt(x: number, z: number): number;
  toast(t: string): void;
}

export class YardEditor {
  active: { island: DevIsland; k: YardKind | 'remove'; item?: string; r: number } | null = null;
  private ghost: THREE.Group | null = null;
  private ghostSig = '';
  private target: { cx: number; cz: number; ok: boolean; why: string; hit: YardPiece | null } | null = null;
  private okMat: THREE.MeshStandardMaterial;
  private badMat: THREE.MeshStandardMaterial;
  private rmMark: THREE.Mesh;

  constructor(private game: Game, private root: THREE.Object3D, private host: YardHost) {
    this.okMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.6, emissive: new THREE.Color('#7fd18b'), emissiveIntensity: 0.35, depthWrite: false });
    this.badMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.5, emissive: new THREE.Color('#ff6b8a'), emissiveIntensity: 0.6, depthWrite: false });
    this.rmMark = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 28), new THREE.MeshBasicMaterial({ color: '#ff9fb8', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.rmMark.rotation.x = -Math.PI / 2;
    this.rmMark.visible = false;
    root.add(this.rmMark);
    // E(놓기·치우기) · R(돌리기) — 놓기 모드일 때만 나온다
    game.addProvider('islanddev-place', () => {
      if (!this.active || !this.target) return null;
      const t = this.target;
      const rm = this.active.k === 'remove';
      const label = rm ? (t.hit ? `치우기 🧹 (${YARD_DEFS[t.hit.k].name})` : '치울 게 없어요') : t.ok ? `여기에 놓기 ${YARD_DEFS[this.active.k as YardKind].icon}` : t.why;
      return { id: 'islanddev-place', label, dist: 0, priority: 100, use: () => this.commit() };
    });
    game.addProvider('islanddev-rotate', () => {
      if (!this.active || this.active.k === 'remove') return null;
      return { id: 'islanddev-rotate', label: '돌리기 🔄', dist: 0, key: 'KeyR', priority: 100, use: () => { if (this.active) this.active.r = (this.active.r + 1) % 4; } };
    });
  }

  start(island: DevIsland, k: YardKind | 'remove', item?: string) {
    if (!this.host.site(island)) { this.host.toast('마당 팻말 가까이에서 해요 🌷'); return; }
    this.active = { island, k, item, r: 0 };
    this.ghostSig = '';
    this.host.toast(k === 'remove' ? '🧹 치울 조각 앞에서 E · Esc 그만' : 'E 놓기 · R 돌리기 · Esc 그만');
  }
  stop() {
    this.active = null;
    this.target = null;
    this.rmMark.visible = false;
    if (this.ghost) { this.root.remove(this.ghost); disposeGeo(this.ghost); this.ghost = null; }
  }

  private commit() {
    const a = this.active, t = this.target;
    if (!a || !t) return;
    if (a.k === 'remove') {
      if (t.hit && this.host.remove(a.island, t.hit.id)) this.game.audio?.sfx('pick', { pitch: 0.9 });
      return;
    }
    if (!t.ok) { this.host.toast(t.why); return; }
    const k = a.k as YardKind;
    if (!this.host.place(a.island, { k, cx: t.cx, cz: t.cz, r: a.r, ...(a.item ? { item: a.item } : {}) })) return;
    this.game.audio?.sfx('craft', { pitch: 1.15 });
    // 재료가 남으면 계속 놓는다(가구는 한 번에 하나)
    if (k === 'furn' || !this.host.canAfford(k, a.item)) this.stop();
  }

  update() {
    const a = this.active;
    if (!a) return;
    const g = this.game, site = this.host.site(a.island);
    if (!site || g.world !== 'earth' || g.player.mounted || g.input.hit('Escape')) { this.stop(); return; }
    const p = g.player.pos;
    const me = worldToYard(site, p.x, p.z);
    if (Math.abs(me.x) > YARD_HALF * YARD_CELL + 5 || Math.abs(me.z) > YARD_HALF * YARD_CELL + 5) { this.host.toast('마당을 벗어났어요 🌷'); this.stop(); return; }
    const f = g.player.facing();
    const ax = p.x + f.x * 2.2, az = p.z + f.z * 2.2;
    const loc = worldToYard(site, ax, az);
    const pieces = this.host.pieces(a.island);
    if (a.k === 'remove') {
      const c = { cx: Math.floor(loc.x / YARD_CELL), cz: Math.floor(loc.z / YARD_CELL) };
      const hit = pieceAtCell(pieces, c.cx, c.cz);
      this.target = { ...c, ok: !!hit, why: '', hit };
      const w = yardToWorld(site, (c.cx + 0.5) * YARD_CELL, (c.cz + 0.5) * YARD_CELL);
      this.rmMark.position.set(w.x, this.host.heightAt(w.x, w.z) + 0.06, w.z);
      this.rmMark.visible = true;
      (this.rmMark.material as THREE.MeshBasicMaterial).color.set(hit ? '#ff6b8a' : '#d9cbb4');
      return;
    }
    const k = a.k as YardKind;
    const c = snapCell(loc.x, loc.z, k, a.r);
    const chk = canPlace(pieces, { k, cx: c.cx, cz: c.cz, r: a.r }, (cells) => this.host.groundOk(a.island, cells));
    const afford = this.host.canAfford(k, a.item);
    const why = !afford ? '재료가 모자라요 💦' : chk.ok ? '' : chk.why === 'bounds' ? '마당 밖이에요' : chk.why === 'overlap' ? '다른 조각이 있어요' : '땅이 고르지 않아요';
    this.target = { ...c, ok: chk.ok && afford, why, hit: chk.ok ? null : chk.why === 'overlap' ? chk.hit ?? null : null };
    // 미리보기 다시 만들기(종류·돌림이 바뀔 때만)
    const sig = `${k}|${a.item ?? ''}|${a.r}`;
    if (sig !== this.ghostSig) {
      this.ghostSig = sig;
      if (this.ghost) { this.root.remove(this.ghost); disposeGeo(this.ghost); }
      const b = new Builder();
      addYardPiece(b, { id: 0, k, cx: 0, cz: 0, r: a.r, item: a.item }, () => 0, rngFor('islanddev:ghost'));
      this.ghost = b.bake('islanddev-ghost');
      this.root.add(this.ghost);
    }
    if (this.ghost) {
      // 칸 (cx, cz) 원점 → 월드(마당 돌림 포함), 높이는 조각 가운데 땅
      const o = yardToWorld(site, c.cx * YARD_CELL, c.cz * YARD_CELL);
      const cells = cellsOf({ k, cx: c.cx, cz: c.cz, r: a.r });
      const mid = cells[Math.floor(cells.length / 2)];
      const mw = yardToWorld(site, (mid[0] + 0.5) * YARD_CELL, (mid[1] + 0.5) * YARD_CELL);
      this.ghost.position.set(o.x, this.host.heightAt(mw.x, mw.z) + 0.02, o.z);
      this.ghost.rotation.set(0, site.rot, 0);
      const mat = this.target.ok ? this.okMat : this.badMat;
      this.ghost.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.material = mat; m.castShadow = false; } });
      const s = 1 + Math.sin(g.time * 6) * 0.02;
      this.ghost.scale.set(s, s, s);
    }
  }
}

function disposeGeo(o: THREE.Object3D) {
  o.traverse((x) => { const m = x as THREE.Mesh; if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); });
}
