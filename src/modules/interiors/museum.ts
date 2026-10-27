// 박물관 안(GDD 3.12 P1 · 5.6) — 로비(느릿 관장 데스크) 양옆으로 동 5개: 수족관동(기증한 물고기가 큰 수조에서 헤엄) ·
// 해저관(얕은 유리 웅덩이) · 곤충관(나뭇가지 유리 상자) · 화석관(골격이 단 위에 선다) · 천문관(유리 구슬 속 우주 친구 + 행성).
// 전시물은 기증 목록(econ.isDonated · skeletonsDone)으로 만든다. 생물은 모양별 InstancedMesh, 뼈는 InstancedMesh 둘.
// 안 연 동(wing:* 해금 전)은 통로에 밧줄 + '증축 준비 중' 팻말. 기증 5초 뒤 느릿 관장 해설 말풍선(밖이면 HUD 카드).
import * as THREE from 'three';
import type { Game } from '../../core/game';
import type { Species } from '../../core/state';
import { rngFor } from '../../core/rng';
import { buildAnimal, type AnimalRig } from '../characters/animal';
import { Builder, G, disposeTree, signTexture, makeCanvas } from './kit';
import { CritterSet, critterColors, critterColor, shapeOfSpecies, type Shape } from './critters';
import { buildMuseumShell, MUSEUM_RW, MUSEUM_D, MUSEUM_H, LOBBY_DESK_Z, type MuseumShell } from './rooms';
import { WINGS, WING_INFO, MUSEUM_ROOMS, museumExhibits, curatorLine, CURATOR_DELAY, CURATOR_SHOW, type WingId } from './logic';
import type { InteriorBox } from './infra';
import { PLACES } from '../../core/island';

const TANK = { z: -3.85, h: 2.0, d: 1.3, w: 8.4 };
const ROUND_TANKS: Array<[number, number]> = [[-2.9, -0.4], [2.9, -0.4]];
const POOL = { z: -1.1, w: 6.2, d: 4.4, h: 0.85 };
const TERRA = { z: -3.7, w: 2.6, d: 1.3, h: 1.6, y0: 0.55 };
const TERRA_X = [-3.1, 0, 3.1];
const FOSSIL_SLOTS: Array<[number, number]> = [];
for (const z of [-2.9, 0.9]) for (let k = 0; k < 5; k++) FOSSIL_SLOTS.push([-3.6 + k * 1.8, z]);
const ASTRO_SLOTS: Array<[number, number]> = [];
for (const z of [-3.4, -1.8, -0.2]) for (let k = 0; k < 6; k++) ASTRO_SLOTS.push([-3.5 + k * 1.4, z]);

/** 뼈 하나(점 두 개 사이 캡슐) */
interface Bone { a: THREE.Vector3; b: THREE.Vector3; r: number }
/** 공룡 골격(종 id 로 늘 같은 모양) — 길이 약 1.6 m, 받침 위 */
export function skeletonBones(id: string): { bones: Bone[]; joints: Array<{ p: THREE.Vector3; r: number }>; skull: { p: THREE.Vector3; r: number; yaw: number } } {
  const r = rngFor(`interiors:skel:${id}`);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const neck = 0.25 + r() * 0.45, tail = 0.5 + r() * 0.35, body = 0.55 + r() * 0.25, legH = 0.45 + r() * 0.25, biped = r() < 0.4;
  const plates = r() < 0.35, horn = r() < 0.3;
  const bones: Bone[] = [], joints: Array<{ p: THREE.Vector3; r: number }> = [];
  const hip = V(0, legH + 0.1, -body / 2), sh = V(0, legH + 0.14 + (biped ? 0.12 : 0), body / 2);
  // 등뼈(엉덩이 → 어깨) + 목 + 꼬리(아래로 휘며 가늘게)
  const spine = [hip.clone().add(V(0, 0, -tail * 0.0)), hip.clone().lerp(sh, 0.5).add(V(0, 0.08, 0)), sh];
  const neckEnd = sh.clone().add(V(0, neck * 0.85, neck * 0.55));
  spine.push(neckEnd);
  for (let i = 0; i < spine.length - 1; i++) bones.push({ a: spine[i], b: spine[i + 1], r: i === spine.length - 2 ? 0.045 : 0.06 });
  let prev = hip.clone();
  const tn = 4;
  for (let i = 1; i <= tn; i++) {
    const k = i / tn;
    const p = hip.clone().add(V(Math.sin(k * 2.2) * 0.08, -k * k * (legH * 0.55), -k * tail));
    bones.push({ a: prev, b: p, r: 0.055 * (1 - k * 0.6) });
    joints.push({ p: p.clone(), r: 0.05 * (1 - k * 0.5) });
    prev = p;
  }
  // 갈비뼈
  const ribs = 4;
  for (let i = 0; i < ribs; i++) {
    const c = hip.clone().lerp(sh, (i + 0.8) / (ribs + 0.6)).add(V(0, 0.06, 0));
    for (const sx of [-1, 1]) {
      const m = c.clone().add(V(sx * 0.15, -0.12, 0));
      const e = c.clone().add(V(sx * 0.1, -0.26 + (i === 0 || i === ribs - 1 ? 0.06 : 0), 0));
      bones.push({ a: c, b: m, r: 0.028 }, { a: m, b: e, r: 0.025 });
    }
  }
  // 다리(뒤 둘 + 앞 둘 — 두 발 공룡은 앞다리가 짧다)
  for (const sx of [-1, 1]) {
    const hk = hip.clone().add(V(sx * 0.13, -legH * 0.5, 0.06)), hf = V(sx * 0.14, 0.04, -body / 2 + 0.12);
    bones.push({ a: hip.clone().add(V(sx * 0.1, 0, 0)), b: hk, r: 0.05 }, { a: hk, b: hf, r: 0.045 });
    joints.push({ p: hk.clone(), r: 0.055 }, { p: hf.clone(), r: 0.06 });
    if (biped) {
      const ak = sh.clone().add(V(sx * 0.14, -0.14, 0.1)), af = sh.clone().add(V(sx * 0.12, -0.22, 0.2));
      bones.push({ a: sh.clone().add(V(sx * 0.08, 0, 0)), b: ak, r: 0.03 }, { a: ak, b: af, r: 0.025 });
    } else {
      const ak = sh.clone().add(V(sx * 0.13, -legH * 0.5, -0.04)), af = V(sx * 0.14, 0.04, body / 2 - 0.05);
      bones.push({ a: sh.clone().add(V(sx * 0.1, 0, 0)), b: ak, r: 0.048 }, { a: ak, b: af, r: 0.042 });
      joints.push({ p: ak.clone(), r: 0.05 }, { p: af.clone(), r: 0.055 });
    }
  }
  // 등판·뿔
  if (plates) for (let i = 0; i < 4; i++) { const c = hip.clone().lerp(sh, i / 3).add(V(0, 0.08, 0)); bones.push({ a: c, b: c.clone().add(V(0, 0.16 + Math.sin((i / 3) * Math.PI) * 0.1, 0)), r: 0.05 }); }
  const skullR = 0.14 + r() * 0.06;
  const skull = { p: neckEnd.clone().add(V(0, skullR * 0.5, skullR * 0.7)), r: skullR, yaw: 0 };
  if (horn) bones.push({ a: skull.p.clone().add(V(0, skullR * 0.6, skullR * 0.4)), b: skull.p.clone().add(V(0, skullR * 1.3, skullR * 0.9)), r: 0.03 });
  joints.push({ p: hip.clone(), r: 0.08 }, { p: sh.clone(), r: 0.075 }, { p: neckEnd.clone(), r: 0.06 });
  return { bones, joints, skull };
}

interface Say { id: string; at: number }

export class MuseumInterior {
  readonly root = new THREE.Group();
  inside = false;
  private shell: MuseumShell;
  private exhibitsStatic: THREE.Group | null = null;
  private locks = new THREE.Group();
  private lockKey = '';
  private critters = new CritterSet({ fish: 140, sea: 32, bug: 76, space: 24, blob: 12 }, 'interiors-museum-critters');
  private bones: THREE.InstancedMesh;
  private joints: THREE.InstancedMesh;
  private sockets: THREE.InstancedMesh;
  private curator: AnimalRig | null = null;
  private bubble: THREE.Sprite | null = null;
  private bubbleUntil = -1;
  private queue: Say[] = [];
  private now = 0;
  private dirty = true;
  private signSig = '';
  /** 동 → 전시 종 id */
  exhibits: Record<WingId, string[]> = { aquarium: [], sea: [], bug: [], fossil: [], astro: [] };
  lastLine = '';
  readonly x0: number;
  readonly W: number;

  constructor(private game: Game, readonly origin: THREE.Vector3) {
    this.root.name = 'interiors-museum';
    this.root.position.copy(origin);
    this.shell = buildMuseumShell(MUSEUM_ROOMS, (id) => WING_INFO.get(id as WingId) ?? null);
    this.root.add(this.shell.group, this.locks, this.critters.root);
    this.W = this.shell.W;
    this.x0 = (this.shell.centers[MUSEUM_ROOMS[0]] ?? 0) - MUSEUM_RW / 2;
    const boneMat = new THREE.MeshStandardMaterial({ color: '#fff3dc', roughness: 0.6 });
    this.bones = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.5, 1, 4, 10), boneMat, 20 * 48);
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 14, 10), boneMat, 20 * 20);
    this.sockets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshStandardMaterial({ color: '#6e4a33', roughness: 0.8 }), 40);
    for (const im of [this.bones, this.joints, this.sockets]) { im.count = 0; im.frustumCulled = false; im.castShadow = true; this.root.add(im); }
    this.buildStatic();
    this.buildCurator();
  }

  cx(room: string) { return this.shell.centers[room] ?? 0; }
  floorAt(x: number, z: number): number | null {
    const lx = x - this.origin.x, lz = z - this.origin.z;
    return lx >= this.x0 - 0.3 && lx <= this.x0 + this.W + 0.3 && Math.abs(lz) <= MUSEUM_D / 2 + 0.3 ? this.origin.y : null;
  }
  spawn() { return new THREE.Vector3(this.origin.x + this.cx('lobby'), this.origin.y, this.origin.z + MUSEUM_D / 2 - 1.0); }
  /** 바깥 박물관 문 앞(월드) — local z 4.9 가 문 바로 앞 계단 */
  static doorOf(game: Game, lz = 5.0): THREE.Vector3 {
    const P = (game.ext.village?.positions?.museum as { x: number; z: number; rotY?: number } | undefined) ?? MUSEUM_PLACE();
    const r = P.rotY ?? 0, c = Math.cos(r), s = Math.sin(r);
    const x = P.x + lz * s, z = P.z + lz * c;
    return new THREE.Vector3(x, game.groundAt(x, z), z);
  }
  /** 벽·칸막이·전시대 충돌 상자 */
  colliders(): InteriorBox[] {
    const O = this.origin, D = MUSEUM_D, H = MUSEUM_H, x0 = this.x0, W = this.W;
    const out: InteriorBox[] = [
      { hx: W / 2 + 1, hy: 0.5, hz: D / 2 + 1, x: O.x + x0 + W / 2, y: O.y - 0.5, z: O.z },
      { hx: W / 2 + 0.5, hy: H / 2 + 1, hz: 0.25, x: O.x + x0 + W / 2, y: O.y + H / 2, z: O.z - D / 2 - 0.25 },
      { hx: W / 2 + 0.5, hy: H / 2 + 1, hz: 0.25, x: O.x + x0 + W / 2, y: O.y + H / 2, z: O.z + D / 2 + 0.25 },
      { hx: 0.25, hy: H / 2 + 1, hz: D / 2 + 0.5, x: O.x + x0 - 0.25, y: O.y + H / 2, z: O.z },
      { hx: 0.25, hy: H / 2 + 1, hz: D / 2 + 0.5, x: O.x + x0 + W + 0.25, y: O.y + H / 2, z: O.z },
    ];
    const n = MUSEUM_ROOMS.length, seg = (D - 3) / 2;
    for (let i = 1; i < n; i++) for (const sz of [-1, 1]) out.push({ hx: 0.18, hy: H / 2, hz: seg / 2, x: O.x + x0 + i * MUSEUM_RW, y: O.y + H / 2, z: O.z + sz * (1.5 + seg / 2) });
    const box = (x: number, z: number, hx: number, hz: number, hy = 0.6) => out.push({ hx, hy, hz, x: O.x + x, y: O.y + hy, z: O.z + z });
    const L = this.cx('lobby');
    box(L, LOBBY_DESK_Z, 1.6, 0.5, 0.35);
    box(L + 2.1, LOBBY_DESK_Z + 0.15, 0.4, 0.4);
    box(this.cx('aquarium'), TANK.z, TANK.w / 2, TANK.d / 2, 1.1);
    for (const [x, z] of ROUND_TANKS) box(this.cx('aquarium') + x, z, 0.85, 0.85, 1.0);
    box(this.cx('sea'), POOL.z, POOL.w / 2, POOL.d / 2, 0.45);
    for (const x of TERRA_X) box(this.cx('bug') + x, TERRA.z, TERRA.w / 2, TERRA.d / 2, 1.1);
    // 안 연 동: 통로 막기
    MUSEUM_ROOMS.forEach((r, i) => {
      if (r === 'lobby' || this.isOpen(r as WingId)) return;
      const li = MUSEUM_ROOMS.indexOf('lobby');
      const edge = i < li ? i + 1 : i;
      out.push({ hx: 0.2, hy: H / 2, hz: 1.6, x: O.x + x0 + edge * MUSEUM_RW, y: O.y + H / 2, z: O.z });
    });
    return out;
  }
  isOpen(w: WingId) { return this.game.econ?.isUnlocked?.(WING_INFO.get(w)!.key) ?? true; }

  // ───────────── 굳은 전시대 ─────────────
  private buildStatic() {
    const b = new Builder();
    // 수족관동: 뒤 벽 큰 수조 + 둥근 수조 둘
    const A = this.cx('aquarium');
    b.add(G.boxLo(0.1), 'gloss', '#4a9cf0', [A, 0.12, TANK.z], [TANK.w + 0.3, 0.24, TANK.d + 0.2]);
    b.add(G.boxLo(0.04), 'glass', '#d4f2ff', [A, 0.24 + TANK.h / 2, TANK.z], [TANK.w, TANK.h, TANK.d]);
    b.add(G.boxLo(0.04), 'glass', '#8fd3f4', [A, 0.2 + TANK.h / 2, TANK.z], [TANK.w - 0.1, TANK.h - 0.2, TANK.d - 0.1]);
    b.add(G.boxLo(0.05), 'matte', '#f4e2b0', [A, 0.3, TANK.z], [TANK.w - 0.12, 0.1, TANK.d - 0.12]);
    b.add(G.boxLo(0.06), 'gloss', '#ffffff', [A, 0.28 + TANK.h, TANK.z], [TANK.w + 0.2, 0.1, TANK.d + 0.12]);
    const rr = rngFor('interiors:museum:aq');
    for (let i = 0; i < 16; i++) {
      const x = A - TANK.w / 2 + 0.3 + rr() * (TANK.w - 0.6), z = TANK.z - 0.35 + rr() * 0.3, h = 0.4 + rr() * 0.9;
      b.add(G.capsuleLo(), 'gloss', rr() < 0.5 ? '#5cc16a' : '#a8e06a', [x, 0.35 + h / 2, z], [0.09, h * 0.5, 0.09], [0, 0, (rr() - 0.5) * 0.4]);
    }
    for (let i = 0; i < 10; i++) b.add(G.sphereLo(), 'gloss', ['#ff8a7a', '#ffd0de', '#c9b6f2', '#fffaf2'][i % 4], [A - 3.8 + i * 0.85, 0.38, TANK.z + 0.3 - (i % 3) * 0.2], [0.24, 0.12, 0.2]);
    for (const [x, z] of ROUND_TANKS) {
      b.add(G.cyl(), 'gloss', '#4a9cf0', [A + x, 0.15, z], [1.8, 0.3, 1.8]);
      b.add(G.cyl(20), 'glass', '#d4f2ff', [A + x, 1.1, z], [1.7, 1.6, 1.7]);
      b.add(G.cyl(20), 'glass', '#8fd3f4', [A + x, 1.05, z], [1.6, 1.4, 1.6]);
      b.add(G.torus(0.08), 'gloss', '#ffffff', [A + x, 1.92, z], [1.72, 1.72, 1.4], [Math.PI / 2, 0, 0]);
      b.add(G.sphereLo(), 'gloss', '#ff9fb8', [A + x + 0.3, 0.38, z + 0.2], [0.3, 0.16, 0.26]);
    }
    // 해저관: 얕은 유리 웅덩이 + 산호
    const S = this.cx('sea');
    b.add(G.boxLo(0.12), 'gloss', '#3fc7b4', [S, 0.2, POOL.z], [POOL.w + 0.3, 0.4, POOL.d + 0.3]);
    b.add(G.boxLo(0.05), 'matte', '#f4e2b0', [S, 0.42, POOL.z], [POOL.w - 0.1, 0.06, POOL.d - 0.1]);
    b.add(G.boxLo(0.04), 'glass', '#8fd3f4', [S, 0.42 + POOL.h / 2, POOL.z], [POOL.w, POOL.h, POOL.d]);
    const rs = rngFor('interiors:museum:sea');
    for (let i = 0; i < 14; i++) {
      const x = S + (rs() - 0.5) * (POOL.w - 0.6), z = POOL.z + (rs() - 0.5) * (POOL.d - 0.6);
      const c = ['#ff8a7a', '#ff9fb8', '#ffc59a', '#c9b6f2'][i % 4];
      for (let k = 0; k < 3; k++) b.add(G.capsuleLo(), 'gloss', c, [x + (k - 1) * 0.08, 0.56 + k * 0.03, z], [0.07, 0.14 + k * 0.04, 0.07], [0, 0, (k - 1) * 0.5]);
    }
    for (const sx of [-1, 1]) b.add(G.sphereLo(), 'matte', '#e9d3a8', [S + sx * 3.9, 0.4, -3.9], [1.1, 0.8, 0.9]);
    // 곤충관: 유리 상자 셋 + 나뭇가지
    const Bg = this.cx('bug');
    for (const tx of TERRA_X) {
      const x = Bg + tx;
      b.add(G.boxLo(0.08), 'matte', '#d9a06b', [x, TERRA.y0 / 2, TERRA.z], [TERRA.w + 0.1, TERRA.y0, TERRA.d + 0.1]);
      b.add(G.boxLo(0.04), 'glass', '#e8ffe0', [x, TERRA.y0 + TERRA.h / 2, TERRA.z], [TERRA.w, TERRA.h, TERRA.d]);
      b.add(G.boxLo(0.06), 'gloss', '#5cc16a', [x, TERRA.y0 + TERRA.h + 0.05, TERRA.z], [TERRA.w + 0.12, 0.1, TERRA.d + 0.12]);
      b.add(G.boxLo(0.05), 'matte', '#a8e06a', [x, TERRA.y0 + 0.05, TERRA.z], [TERRA.w - 0.1, 0.08, TERRA.d - 0.1]);
      for (const y of [0.45, 1.05]) b.add(G.cyl(), 'matte', '#a8764f', [x, TERRA.y0 + y, TERRA.z], [0.06, TERRA.w * 0.85, 0.06], [0, 0, Math.PI / 2 + (y > 0.6 ? 0.1 : -0.1)]);
      for (let k = 0; k < 6; k++) b.add(G.sphereLo(), 'matte', '#5cc16a', [x - 1 + k * 0.4, TERRA.y0 + 0.55 + (k % 2) * 0.55, TERRA.z + 0.1], [0.22, 0.08, 0.14], [0, 0, k]);
    }
    for (const sx of [-1, 1]) {
      b.add(G.taper(1.3), 'gloss', '#ffd0de', [Bg + sx * 3.6, 0.3, 1.8], [0.7, 0.6, 0.7]);
      b.add(G.sphereLo(), 'matte', '#ff9fb8', [Bg + sx * 3.6, 0.8, 1.8], [0.8, 0.6, 0.8]);
    }
    // 화석관: 받침 10개
    const F = this.cx('fossil');
    for (const [x, z] of FOSSIL_SLOTS) {
      b.add(G.boxLo(0.1), 'matte', '#c9a77a', [F + x, 0.1, z], [1.55, 0.2, 1.9]);
      b.add(G.boxLo(0.06), 'matte', '#e9d3a8', [F + x, 0.22, z], [1.4, 0.06, 1.75]);
      b.add(G.boxLo(0.04), 'metal', '#ffcf4a', [F + x, 0.12, z + 0.96], [0.5, 0.12, 0.03]);
    }
    for (let i = 0; i < 3; i++) b.add(G.sphereLo(), 'matte', '#fff3dc', [F - 4 + i * 4, 0.12, 4.2], [0.6, 0.18, 0.5]);
    // 천문관: 받침 + 유리 구슬 18 · 행성 셋 · 별 조명
    const T = this.cx('astro');
    for (const [x, z] of ASTRO_SLOTS) {
      b.add(G.cyl(), 'gloss', '#5a5fa8', [T + x, 0.35, z], [0.42, 0.7, 0.42]);
      b.add(G.cyl(), 'metal', '#ffcf4a', [T + x, 0.72, z], [0.48, 0.05, 0.48]);
      b.add(G.sphere(), 'glass', '#e8dcff', [T + x, 1.08, z], 0.66);
    }
    for (const [x, y, z, r, c] of [[-3, 2.6, -2.5, 0.55, '#ff8a7a'], [2.4, 2.8, -1.2, 0.4, '#8fd3f4'], [0, 2.95, 0.6, 0.32, '#ffd84a']] as const) {
      b.add(G.sphere(), 'gloss', c, [T + x, y, z], r * 2);
      b.add(G.torus(0.05), 'glow', '#fff1cf', [T + x, y, z], r * 3.2, [Math.PI / 2 - 0.4, 0, 0.2]);
      b.add(G.cyl(), 'matte', '#fffaf2', [T + x, (y + MUSEUM_H) / 2 + r * 0.5, z], [0.015, MUSEUM_H - y - r, 0.015]);
    }
    const ra = rngFor('interiors:museum:astro');
    for (let i = 0; i < 26; i++) b.add(G.star(), 'glow', i % 3 ? '#fff6c8' : '#c9b6f2', [T - 4.6 + ra() * 9.2, 0.6 + ra() * 2.4, -4.85], [0.12 + ra() * 0.1, 0.12 + ra() * 0.1, 0.05]);
    for (let i = 0; i < 14; i++) b.add(G.star(), 'glow', '#ffe58a', [T - 4.4 + ra() * 8.8, 0.01, -4.4 + ra() * 8.8], [0.18, 0.18, 0.04], [-Math.PI / 2, 0, ra() * 3]);
    this.exhibitsStatic = b.bake('interiors-museum-exhibits');
    this.root.add(this.exhibitsStatic);
  }

  /** 안 연 동: 밧줄 + 팻말(해금 상태가 바뀌면 다시) */
  private syncLocks() {
    const key = WINGS.map((w) => (this.isOpen(w.id) ? '1' : '0')).join('');
    if (key === this.lockKey) return false;
    this.lockKey = key;
    for (const c of [...this.locks.children]) { this.locks.remove(c); disposeTree(c); }
    const b = new Builder();
    const li = MUSEUM_ROOMS.indexOf('lobby');
    MUSEUM_ROOMS.forEach((r, i) => {
      if (r === 'lobby' || this.isOpen(r as WingId)) return;
      const x = this.x0 + (i < li ? i + 1 : i) * MUSEUM_RW;
      for (const z of [-1.3, 1.3]) {
        b.add(G.cyl(), 'metal', '#ffcf4a', [x, 0.5, z], [0.12, 1.0, 0.12]);
        b.add(G.sphereLo(), 'metal', '#ffcf4a', [x, 1.05, z], 0.18);
        b.add(G.cyl(), 'metal', '#ffcf4a', [x, 0.03, z], [0.4, 0.06, 0.4]);
      }
      b.add(G.torus(0.04, Math.PI), 'cloth', '#ff6b6b', [x, 0.98, 0], [2.6, 0.9, 1.4], [0, Math.PI / 2, Math.PI]);
      // 공사 팻말
      const sx = i < li ? -0.6 : 0.6;
      b.add(G.boxLo(0.06), 'matte', '#d9a06b', [x + sx, 0.45, 2.0], [0.08, 0.9, 0.08]);
      b.add(G.boxLo(0.08), 'gloss', '#ffd84a', [x + sx, 1.0, 2.0], [0.9, 0.55, 0.06]);
      for (let k = 0; k < 3; k++) b.add(G.boxLo(0.02), 'matte', '#3d3a4a', [x + sx - 0.28 + k * 0.28, 1.0, 2.035], [0.1, 0.5, 0.01], [0, 0, 0.6]);
    });
    if (!b.empty) this.locks.add(b.bake('interiors-museum-locks'));
    return true;
  }

  // ───────────── 느릿 관장 ─────────────
  private buildCurator() {
    // 화면 없는 시험 환경(캔버스 없음)에선 관장 모델을 건너뛴다 — 해설은 HUD 카드로 나간다
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    try {
      const rig = buildAnimal({ kind: 'turtle', fur: '#a8dc8c', light: '#fff1c8', mark: '#c99a5e', iris: '#3a2a20', acc: 'glasses', accColor: '#b08850', outfit: 'pocket', outfitColor: '#c9a6ff', scale: 1.0 });
      rig.root.position.set(this.cx('lobby') + 2.1, 0, LOBBY_DESK_Z + 0.15);
      rig.root.name = 'interiors-curator';
      this.root.add(rig.root);
      this.curator = rig;
    } catch (e) { console.error('[interiors curator]', e); }
  }
  curatorPos(): THREE.Vector3 { return this.origin.clone().add(new THREE.Vector3(this.cx('lobby') + 2.1, 0, LOBBY_DESK_Z + 1.0)); }

  /** 기증하면 부른다 — CURATOR_DELAY 초 뒤 해설 */
  queueComment(id: string) { this.queue.push({ id, at: this.now + CURATOR_DELAY }); this.dirty = true; }
  /** 해설 바로 하기 */
  speak(id: string): string {
    const sp = this.game.state.species.get(id);
    const r = rngFor(`interiors:curator:${id}:${this.game.econ?.day?.() ?? 0}`);
    const line = sp ? curatorLine(sp, r(), r()) : '오오…… 고마워요…… 소중히…… 전시할게요……';
    this.lastLine = line;
    if (this.inside) this.showBubble(line);
    else this.game.hud.card({ title: '🐢 느릿 관장', body: line, icon: '🐢', color: '#8fd18a', ms: 6500 });
    this.game.audio?.sfx('talk-blip');
    this.game.state.emit({ type: 'curator', id, line });
    return line;
  }
  private showBubble(text: string) {
    const c = makeCanvas(512, 256);
    if (!c) { this.bubbleUntil = this.now + CURATOR_SHOW; return; }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = '#fff8e8'; g.strokeStyle = '#8fd18a'; g.lineWidth = 10;
    g.beginPath(); g.roundRect(10, 10, 492, 190, 46); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(230, 196); g.lineTo(256, 246); g.lineTo(282, 196); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(228, 200); g.lineTo(256, 246); g.lineTo(284, 200); g.stroke();
    g.fillStyle = '#fff8e8'; g.fillRect(232, 186, 48, 16);
    g.fillStyle = '#4a3b2a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '34px Jua, sans-serif';
    // 줄 나누기(넓이 기준)
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > 450 && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    const shown = lines.slice(0, 4);
    shown.forEach((l, i) => g.fillText(l, 256, 105 + (i - (shown.length - 1) / 2) * 42));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (!this.bubble) {
      this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
      this.bubble.renderOrder = 20;
      this.bubble.scale.set(3.6, 1.8, 1);
      this.root.add(this.bubble);
    } else {
      const m = this.bubble.material as THREE.SpriteMaterial;
      m.map?.dispose();
      m.map = tex;
      m.needsUpdate = true;
    }
    const top = (this.curator?.top ?? 1.4) + 1.0;
    this.bubble.position.set(this.cx('lobby') + 2.1, top, LOBBY_DESK_Z);
    this.bubble.visible = true;
    this.bubbleUntil = this.now + CURATOR_SHOW;
  }

  // ───────────── 전시물 ─────────────
  /** 기증 목록 다시 읽기 */
  refresh() {
    const econ = this.game.econ;
    const isDon = (id: string) => !!econ?.isDonated?.(id);
    const skel = econ?.skeletonsDone?.() ?? [];
    const sp = [...this.game.state.species.values()];
    for (const w of WINGS) this.exhibits[w.id] = museumExhibits(w.id, sp, isDon, skel);
    this.rebuildSkeletons();
    this.updateSigns();
    this.dirty = false;
  }
  private updateSigns() {
    const totals = new Map<string, number>((this.game.econ?.museum?.()?.wings ?? []).map((w) => [w.id, w.total]));
    const sig = WINGS.map((w) => `${this.exhibits[w.id].length}/${totals.get(w.id) ?? ''}/${this.isOpen(w.id)}`).join('|');
    if (sig === this.signSig) return;
    this.signSig = sig;
    for (const [room, mesh] of this.shell.signs) {
      let lines: string[];
      let bg = '#fff8e8';
      if (room === 'lobby') lines = ['🏛️ 말랑 박물관', '느릿 관장에게 기증해요'];
      else {
        const w = WING_INFO.get(room as WingId)!;
        const n = this.exhibits[w.id].length, tot = totals.get(w.id);
        lines = [`${w.icon} ${w.name}`, this.isOpen(w.id) ? (tot ? `전시 ${n} / ${tot}` : `전시 ${n}`) : '🚧 증축 준비 중'];
        if (w.id === 'astro') bg = '#efe8ff';
      }
      const t = signTexture(lines, { bg, border: room === 'lobby' ? '#c9a6ff' : WING_INFO.get(room as WingId)?.accent ?? '#e2b97a' });
      const m = mesh.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.map = t;
      if (!t) m.color.set(bg);
      m.needsUpdate = true;
    }
  }
  private rebuildSkeletons() {
    const ids = this.exhibits.fossil.slice(0, FOSSIL_SLOTS.length);
    const F = this.cx('fossil');
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let nb = 0, nj = 0, ns = 0;
    ids.forEach((id, i) => {
      const [sx, sz] = FOSSIL_SLOTS[i];
      const base = new THREE.Vector3(F + sx, 0.25, sz);
      const sk = skeletonBones(id);
      const rot = new THREE.Quaternion().setFromAxisAngle(up, sz < 0 ? 0.5 : -0.5);
      const tw = (p: THREE.Vector3) => p.clone().applyQuaternion(rot).add(base);
      for (const bn of sk.bones) {
        if (nb >= this.bones.instanceMatrix.count) break;
        const a = tw(bn.a), b = tw(bn.b), d = b.clone().sub(a), L = d.length();
        q.setFromUnitVectors(up, d.normalize());
        s.set(bn.r * 2, Math.max(0.01, L / 2 - bn.r * 0.5), bn.r * 2);
        M.compose(a.clone().add(b).multiplyScalar(0.5), q, s);
        this.bones.setMatrixAt(nb++, M);
      }
      for (const j of sk.joints) {
        if (nj >= this.joints.instanceMatrix.count) break;
        M.compose(tw(j.p), q.identity(), s.setScalar(j.r * 2));
        this.joints.setMatrixAt(nj++, M);
      }
      // 머리뼈 + 눈구멍 둘
      const hp = tw(sk.skull.p);
      M.compose(hp, rot, s.set(sk.skull.r * 2.2, sk.skull.r * 1.8, sk.skull.r * 2.6));
      if (nj < this.joints.instanceMatrix.count) this.joints.setMatrixAt(nj++, M);
      for (const e of [-1, 1]) {
        if (ns >= this.sockets.instanceMatrix.count) break;
        const ep = tw(sk.skull.p.clone().add(new THREE.Vector3(e * sk.skull.r * 0.45, sk.skull.r * 0.25, sk.skull.r * 0.95)));
        M.compose(ep, rot, s.set(sk.skull.r * 0.55, sk.skull.r * 0.65, sk.skull.r * 0.3));
        this.sockets.setMatrixAt(ns++, M);
      }
    });
    this.bones.count = nb; this.joints.count = nj; this.sockets.count = ns;
    for (const im of [this.bones, this.joints, this.sockets]) { im.instanceMatrix.needsUpdate = true; im.visible = im.count > 0; }
  }

  private drawCritters(t: number) {
    const st = this.game.state;
    const cs = this.critters;
    cs.begin();
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const put = (sp: Species, x: number, y: number, z: number, yaw: number, sc: number, ph: number) => {
      const [a, b] = critterColors(sp);
      const shape: Shape = shapeOfSpecies(sp);
      const br = 1 + 0.025 * (1 - Math.cos(2 * Math.PI * (t / 2 + ph)));
      p.set(x, y, z); q.setFromAxisAngle(up, yaw); s.set(sc * (1 + (br - 1) * 0.5), sc * br, sc * (1 + (br - 1) * 0.5));
      M.compose(p, q, s);
      cs.push(shape, M, critterColor(a), critterColor(b));
    };
    const ph = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997; return h / 997; };
    // 수족관동: 셋 중 둘은 큰 수조, 나머지는 둥근 수조
    const A = this.cx('aquarium');
    this.exhibits.aquarium.forEach((id, i) => {
      const sp = st.species.get(id);
      if (!sp) return;
      const k = ph(id), w = t * (0.25 + k * 0.25) + k * 40;
      const sc = 0.2 + Math.min(0.14, (sp.rarity ?? 1) * 0.025);
      if (i % 3 !== 2) {
        const x = A + Math.sin(w) * (TANK.w / 2 - 0.4), z = TANK.z + Math.sin(w * 1.7 + k * 9) * (TANK.d / 2 - 0.3), y = 0.6 + ((i * 0.37) % 1) * (TANK.h - 0.75) + Math.sin(t * 0.8 + k * 6) * 0.06;
        put(sp, x, y, z, Math.atan2(Math.cos(w) * (TANK.w / 2 - 0.4), Math.cos(w * 1.7 + k * 9) * 1.7 * (TANK.d / 2 - 0.3)), sc, k);
      } else {
        const [tx, tz] = ROUND_TANKS[Math.floor(i / 3) % 2];
        const r = 0.35 + k * 0.3, x = A + tx + Math.cos(w * 1.6) * r, z = tz + Math.sin(w * 1.6) * r, y = 0.55 + ((i * 0.53) % 1) * 1.1;
        put(sp, x, y, z, -w * 1.6, sc, k);
      }
    });
    // 해저관: 웅덩이 안에서 둥실
    const S = this.cx('sea');
    this.exhibits.sea.forEach((id, i) => {
      const sp = st.species.get(id);
      if (!sp) return;
      const k = ph(id), cols = 6, gx = i % cols, gz = Math.floor(i / cols) % 5;
      const x = S - POOL.w / 2 + 0.55 + gx * ((POOL.w - 1.1) / (cols - 1)) + Math.sin(t * 0.4 + k * 7) * 0.12;
      const z = POOL.z - POOL.d / 2 + 0.55 + gz * ((POOL.d - 1.1) / 4) + Math.cos(t * 0.35 + k * 5) * 0.12;
      put(sp, x, 0.72 + Math.sin(t * 0.9 + k * 8) * 0.07, z, Math.sin(t * 0.3 + k) * 0.8, 0.34, k);
    });
    // 곤충관: 상자마다 나뭇가지 두 줄에 앉기, 넘치면 앞 꽃화분
    const Bg = this.cx('bug');
    this.exhibits.bug.forEach((id, i) => {
      const sp = st.species.get(id);
      if (!sp) return;
      const k = ph(id), box = i % 3, n = Math.floor(i / 3), row = n % 2, col = Math.floor(n / 2) % 12;
      const x = Bg + TERRA_X[box] - TERRA.w / 2 + 0.2 + col * ((TERRA.w - 0.4) / 11);
      const hop = Math.max(0, Math.sin(t * 0.7 + k * 20)) ** 10 * 0.12;
      put(sp, x, TERRA.y0 + (row ? 1.15 : 0.55) + hop, TERRA.z + 0.05, Math.sin(t * 0.2 + k * 4) * 0.9, 0.22, k);
    });
    // 천문관: 유리 구슬 속에서 빙글
    const T = this.cx('astro');
    this.exhibits.astro.forEach((id, i) => {
      const sp = st.species.get(id);
      if (!sp || i >= ASTRO_SLOTS.length) return;
      const k = ph(id), [x, z] = ASTRO_SLOTS[i];
      put(sp, T + x, 1.06 + Math.sin(t * 1.1 + k * 6) * 0.06, z, t * 0.5 + k * 6, 0.36, k);
    });
    cs.end();
  }

  // ───────────── 매 프레임 ─────────────
  /** 모듈 onUpdate — 해설 줄은 밖에서도 돈다 */
  tick(t: number, dt: number) {
    this.now = t;
    if (this.queue.length) {
      const due = this.queue.filter((q) => q.at <= t);
      if (due.length) {
        this.queue = this.queue.filter((q) => q.at > t);
        // 한꺼번에 여러 개면 마지막 것 하나만(말풍선이 겹치지 않게)
        this.speak(due[due.length - 1].id);
      }
    }
    if (!this.inside) return;
    if (this.dirty) this.refresh();
    if (this.syncLocks()) this.updateSigns();
    this.drawCritters(t);
    const talking = this.bubble?.visible === true && t < this.bubbleUntil;
    if (this.bubble && this.bubble.visible && t >= this.bubbleUntil) this.bubble.visible = false;
    if (this.curator) {
      // 플레이어 쪽을 천천히 본다
      const pl = this.game.player.pos;
      const cp = this.curatorPos();
      const want = Math.atan2(pl.x - cp.x, pl.z - cp.z);
      const r = this.curator.root;
      r.rotation.y += Math.atan2(Math.sin(want - r.rotation.y), Math.cos(want - r.rotation.y)) * Math.min(1, dt * 2);
      this.curator.update(t, dt, { walk: 0, talk: talking, wave: false, happy: talking });
    }
  }
  markDirty() { this.dirty = true; }
  onEnter() { this.inside = true; this.syncLocks(); this.refresh(); }
  onExit() { this.inside = false; if (this.bubble) this.bubble.visible = false; }
}

/** village 가 museum 자리를 안 줄 때 — 섬 데이터 */
const MUSEUM_PLACE = () => ({ x: PLACES.museum.x, z: PLACES.museum.z, rotY: PLACES.museum.rotY ?? 0 });
