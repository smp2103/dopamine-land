// 공룡 P1 모델(코드로) — 화석 연구소 부화장(짚 둥지 + 따뜻한 등) · 화석 복원기(유리 돔 + 집게 팔) · 공룡 목장 울타리 · 깨진 알 껍데기 · 나무 팻말.
// 지오메트리·재질은 처음 한 번 만들어 같이 쓴다(userData.shared = true).
// 그리기 줄이기(계약: 모듈당 40 콜): 움직이지 않는 부품은 bakeStatic 으로 '물감' 한 메시에 굽고(재질 색 → 정점 색),
// 팻말 글씨는 한 장 캔버스(SignAtlas)에 줄마다 그려 세 팻말이 한 번에 그려진다. 반짝 단추는 InstancedMesh 하나.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { eggGeometry, nestGeometry, dinoSkin, fossilModel } from './build';

const shared = <T extends THREE.BufferGeometry>(g: T) => { g.userData.shared = true; return g; };
const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}, paint = false) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, ...o });
  m.userData.shared = true;
  // 물감 재질: 굽을 때 이 색을 정점 색으로 옮겨 PAINT 한 재질로 합친다
  if (paint) m.userData.paint = true;
  return m;
};
/** 구운 정적 부품 공용 재질(정점 색) */
let PAINT: THREE.MeshStandardMaterial | null = null;
const paintMat = () => (PAINT ??= mat('#ffffff', { vertexColors: true }));

let M: Record<string, THREE.MeshStandardMaterial> | null = null;
const mats = () => (M ??= {
  wood: mat('#e9bf86', {}, true), woodD: mat('#c99566', {}, true), cream: mat('#fff1d6', {}, true), mint: mat('#9fe3cf', { roughness: 0.45 }, true),
  pink: mat('#ff9fb8', { roughness: 0.45 }, true), gold: mat('#ffd36b', { metalness: 0.45, roughness: 0.35 }, true), sky: mat('#8fd3f4', { roughness: 0.45 }, true),
  lamp: mat('#ffc47a', { emissive: '#ffad5c', emissiveIntensity: 1.3, roughness: 0.3 }),
  glass: mat('#dff6ff', { transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.1, depthWrite: false }),
  shell: mat('#fff6e6', { roughness: 0.5, side: THREE.DoubleSide }),
});
/** 반짝 단추(빨·노·연두) — 인스턴스 색 + 불 켜진 느낌(빛 안 받는 재질) */
let BTN: THREE.MeshBasicMaterial | null = null;
const btnMat = () => {
  if (BTN) return BTN;
  BTN = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  BTN.userData.shared = true;
  return BTN;
};
const BTN_COLORS = ['#ff7a7a', '#ffe06a', '#a8f07a'];

let G: Record<string, THREE.BufferGeometry> | null = null;
const geos = () => (G ??= {
  plat: shared(new THREE.CylinderGeometry(1.9, 2.05, 0.34, 40)),
  arch: shared(new THREE.TorusGeometry(1.75, 0.11, 14, 48, Math.PI)),
  ball: shared(new THREE.SphereGeometry(1, 24, 16)),
  shade: shared(new THREE.ConeGeometry(0.42, 0.34, 28, 1, true)),
  post: shared(new THREE.CylinderGeometry(0.1, 0.12, 1.15, 12).translate(0, 0.575, 0)),
  cap: shared(new THREE.SphereGeometry(0.15, 14, 10).translate(0, 1.2, 0)),
  rail: shared(new THREE.BoxGeometry(0.09, 0.12, 1, 1, 1, 1)),
  board: shared(new THREE.BoxGeometry(1.6, 0.8, 0.08)),
  base: shared(new THREE.CylinderGeometry(0.85, 0.95, 0.9, 32).translate(0, 0.45, 0)),
  dome: shared(new THREE.SphereGeometry(0.78, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.9, 0)),
  ring: shared(new THREE.TorusGeometry(0.8, 0.06, 10, 40).rotateX(Math.PI / 2).translate(0, 0.9, 0)),
  arm: shared(new THREE.CylinderGeometry(0.06, 0.06, 1, 12)),
  shellHalf: shared(new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
});

// ───────────── 굽기(정적 부품 합치기) ─────────────

const KEEP = ['position', 'normal', 'uv', 'color'];
/** 메시 한 조각(그룹 범위)을 인덱스 없는 새 지오메트리로 잘라 m 행렬로 옮긴다 */
function piece(g: THREE.BufferGeometry, start: number, count: number, m: THREE.Matrix4): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  const end = Math.min(src.attributes.position.count, start + count);
  for (const k of KEEP) {
    const a = src.attributes[k] as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const arr = new Float32Array((end - start) * a.itemSize);
    for (let i = start; i < end; i++) for (let c = 0; c < a.itemSize; c++) arr[(i - start) * a.itemSize + c] = a.getComponent(i, c);
    out.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
  }
  if (src !== g) src.dispose();
  if (!out.attributes.normal) out.computeVertexNormals();
  out.applyMatrix4(m);
  return out;
}
const tint = (g: THREE.BufferGeometry, c: THREE.Color) => {
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
};

/**
 * root 아래 정적 메시를 재질별로 하나씩 합친다(InstancedMesh 는 인스턴스마다 펼친다).
 * 물감 재질(userData.paint)·정점 색 피부(dinoSkin)는 PAINT 한 재질로 모인다. skip 안의 부품(움직이는 것)은 그대로 둔다.
 * 원래 메시는 떼어 내고, 새로 만든 지오메트리 목록을 돌려준다(치울 때 dispose). disposeSrc 면 원본 지오메트리도 버린다(새로 만든 것일 때만).
 */
export function bakeStatic(root: THREE.Object3D, skip: THREE.Object3D[] = [], o: { disposeSrc?: boolean; shadow?: boolean } = {}): THREE.BufferGeometry[] {
  const skipSet = new Set(skip);
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  type Bin = { mat: THREE.Material; parts: THREE.BufferGeometry[]; cast: boolean; recv: boolean; order: number };
  const bins = new Map<string, Bin>();
  const victims: THREE.Mesh[] = [];
  const skin = dinoSkin();
  const im = new THREE.Matrix4(), mm = new THREE.Matrix4();
  const walk = (obj: THREE.Object3D) => {
    if (skipSet.has(obj)) return;
    const me = obj as THREE.Mesh;
    if (me.isMesh && obj !== root) {
      const list = Array.isArray(me.material) ? me.material : [me.material];
      const g = me.geometry;
      const nv = g.index ? g.index.count : g.attributes.position.count;
      const groups = Array.isArray(me.material) && g.groups.length ? g.groups : [{ start: 0, count: nv, materialIndex: 0 }];
      const inst = (me as THREE.InstancedMesh).isInstancedMesh ? (me as THREE.InstancedMesh) : null;
      const base = new THREE.Matrix4().multiplyMatrices(inv, me.matrixWorld);
      for (let k = 0; k < (inst ? inst.count : 1); k++) {
        if (inst) { inst.getMatrixAt(k, im); mm.multiplyMatrices(base, im); } else mm.copy(base);
        for (const gr of groups) {
          const m0 = list[gr.materialIndex ?? 0];
          if (!m0) continue;
          const paint = !!m0.userData.paint || (m0 === skin && !!g.attributes.color);
          const key = paint ? 'paint' : m0.uuid;
          const pg = piece(g, gr.start, gr.count, mm);
          if (paint && m0 !== skin) tint(pg, (m0 as THREE.MeshStandardMaterial).color);
          let b = bins.get(key);
          if (!b) { b = { mat: paint ? paintMat() : m0, parts: [], cast: false, recv: false, order: 0 }; bins.set(key, b); }
          b.parts.push(pg);
          b.cast ||= me.castShadow; b.recv ||= me.receiveShadow; b.order = Math.max(b.order, me.renderOrder);
        }
      }
      victims.push(me);
    }
    for (const c of [...obj.children]) walk(c);
  };
  walk(root);
  const made: THREE.BufferGeometry[] = [];
  for (const b of bins.values()) {
    // 합칠 속성은 모두 가진 것만
    const keys = KEEP.filter((k) => b.parts.every((p) => p.attributes[k]));
    for (const p of b.parts) for (const k of Object.keys(p.attributes)) if (!keys.includes(k)) p.deleteAttribute(k);
    const g = mergeGeometries(b.parts, false);
    for (const p of b.parts) p.dispose();
    if (!g) continue;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, b.mat);
    mesh.name = 'baked';
    mesh.castShadow = (o.shadow ?? true) && b.cast; mesh.receiveShadow = b.recv; mesh.renderOrder = b.order;
    root.add(mesh);
    made.push(g);
  }
  for (const v of victims) { v.removeFromParent(); if (o.disposeSrc && !v.geometry.userData.shared) v.geometry.dispose(); }
  return made;
}

/**
 * 공룡 몸(정점 색 피부 메시)만 한 지오메트리로 굽는다 — 원본은 그대로 둔다. root 기준 좌표.
 * 대이동 무리의 먼 개체를 InstancedMesh 하나로 그릴 때 쓴다(얼굴·그림자 블롭은 skip).
 */
export function bakeSkin(root: THREE.Object3D, skip: THREE.Object3D[] = []): THREE.BufferGeometry | null {
  const skipSet = new Set(skip), skin = dinoSkin();
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const parts: THREE.BufferGeometry[] = [];
  const walk = (obj: THREE.Object3D) => {
    if (skipSet.has(obj)) return;
    const me = obj as THREE.Mesh;
    if (me.isMesh && me.material === skin && me.geometry.attributes.color) {
      const g = me.geometry;
      parts.push(piece(g, 0, g.index ? g.index.count : g.attributes.position.count, new THREE.Matrix4().multiplyMatrices(inv, me.matrixWorld)));
    }
    for (const c of obj.children) walk(c);
  };
  walk(root);
  if (!parts.length) return null;
  for (const p of parts) for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') p.deleteAttribute(k);
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) return null;
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

/** 팻말 글씨 한 장 캔버스 — 줄(칸)마다 팻말 하나. 같은 재질이라 구우면 한 번에 그려진다 */
export class SignAtlas {
  readonly mat: THREE.MeshStandardMaterial;
  private tex: THREE.CanvasTexture | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private used = 0;
  constructor(readonly rows = 3) {
    this.mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = 320; c.height = 160 * rows;
    this.ctx = c.getContext('2d');
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat.map = this.tex;
  }
  /** 다음 빈 칸 */
  take() { return Math.min(this.rows - 1, this.used++); }
  draw(row: number, t: string, color: string) {
    const g = this.ctx;
    if (!g || !this.tex) return;
    g.save();
    g.translate(0, row * 160);
    g.fillStyle = '#fff8e8'; g.fillRect(0, 0, 320, 160);
    g.strokeStyle = color; g.lineWidth = 14; g.strokeRect(7, 7, 306, 146);
    g.fillStyle = '#4a3b2a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = t.split('\n');
    g.font = `${lines.length > 1 ? 46 : 58}px Jua, sans-serif`;
    lines.forEach((ln, i) => g.fillText(ln, 160, 80 + (i - (lines.length - 1) / 2) * 56));
    g.restore();
    this.tex.needsUpdate = true;
  }
  dispose() { this.tex?.dispose(); this.mat.dispose(); }
}

/** 나무 팻말(캔버스 글씨) — set(text) 로 글씨만 바꾼다. atlas 를 주면 그 캔버스의 한 줄을 쓴다 */
export function makeSign(text: string, color = '#7cc96b', atlas?: SignAtlas): { root: THREE.Group; set(t: string): void } {
  const root = new THREE.Group();
  const m = mats();
  const post = new THREE.Mesh(geos().post, m.woodD);
  post.scale.set(1, 1.5, 1);
  post.castShadow = true;
  root.add(post);
  let cur = '';
  if (atlas) {
    // 앞·뒤 면(그룹 4·5) uv 를 내 줄로 옮긴 판
    const row = atlas.take();
    const bg = geos().board.clone();
    const uv = bg.attributes.uv as THREE.BufferAttribute, idx = bg.index!;
    const seen = new Set<number>();
    for (const gr of bg.groups) {
      if (gr.materialIndex !== 4 && gr.materialIndex !== 5) continue;
      for (let i = gr.start; i < gr.start + gr.count; i++) {
        const v = idx.getX(i);
        if (seen.has(v)) continue;
        seen.add(v);
        uv.setY(v, 1 - (row + 1) / atlas.rows + uv.getY(v) / atlas.rows);
      }
    }
    const board = new THREE.Mesh(bg, [m.wood, m.wood, m.wood, m.wood, atlas.mat, atlas.mat]);
    board.position.y = 1.85;
    board.castShadow = true;
    root.add(board);
    const set = (t: string) => { if (t === cur) return; cur = t; atlas.draw(row, t, color); };
    set(text);
    return { root, set };
  }
  let tex: THREE.CanvasTexture | null = null;
  const face = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
  const board = new THREE.Mesh(geos().board, [m.wood, m.wood, m.wood, m.wood, face, face]);
  board.position.y = 1.85;
  board.castShadow = true;
  root.add(board);
  const set = (t: string) => {
    if (t === cur) return;
    cur = t;
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = 320; c.height = 160;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff8e8'; g.fillRect(0, 0, 320, 160);
    g.strokeStyle = color; g.lineWidth = 14; g.strokeRect(7, 7, 306, 146);
    g.fillStyle = '#4a3b2a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = t.split('\n');
    g.font = `${lines.length > 1 ? 46 : 58}px Jua, sans-serif`;
    lines.forEach((ln, i) => g.fillText(ln, 160, 80 + (i - (lines.length - 1) / 2) * 56));
    tex?.dispose();
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    face.map = tex; face.needsUpdate = true;
  };
  set(text);
  return { root, set };
}

export interface HatcheryRig { root: THREE.Group; eggs: THREE.Mesh[]; slots: THREE.Vector3[]; lamp: THREE.Mesh; sign: ReturnType<typeof makeSign> }
/** 부화장: 나무 받침 + 큰 짚 둥지 + 무지개 아치 + 따뜻한 등 + 알 3칸 */
export function makeHatchery(atlas?: SignAtlas): HatcheryRig {
  const m = mats(), g = geos();
  const root = new THREE.Group();
  root.name = 'dinos-hatchery';
  const plat = new THREE.Mesh(g.plat, m.wood);
  plat.position.y = 0.17; plat.castShadow = true; plat.receiveShadow = true;
  root.add(plat);
  const nest = new THREE.Mesh(nestGeometry(), dinoSkin());
  nest.scale.setScalar(1.75); nest.position.y = 0.33; nest.castShadow = true; nest.receiveShadow = true;
  root.add(nest);
  const arch = new THREE.Mesh(g.arch, m.mint);
  arch.position.y = 0.34; arch.castShadow = true;
  root.add(arch);
  const arch2 = new THREE.Mesh(g.arch, m.pink);
  arch2.position.y = 0.34; arch2.scale.setScalar(0.9); arch2.castShadow = true;
  root.add(arch2);
  const shade = new THREE.Mesh(g.shade, m.gold);
  shade.position.y = 2.0;
  root.add(shade);
  const lamp = new THREE.Mesh(g.ball, m.lamp);
  lamp.scale.setScalar(0.24); lamp.position.y = 1.86;
  root.add(lamp);
  const slots: THREE.Vector3[] = [];
  const eggs: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const p = new THREE.Vector3(Math.cos(a) * 0.62, 0.42, Math.sin(a) * 0.62);
    slots.push(p);
    const e = new THREE.Mesh(eggGeometry(), dinoSkin());
    e.position.copy(p); e.scale.setScalar(1.25); e.visible = false;   // 둥지 속이라 그림자는 생략(그리기 아끼기)
    root.add(e);
    eggs.push(e);
  }
  const sign = makeSign('부화장 🥚', '#ffad5c', atlas);
  sign.root.position.set(2.6, 0, 0.6);
  sign.root.rotation.y = -0.4;
  root.add(sign.root);
  return { root, eggs, slots, lamp, sign };
}

export interface RestorerRig {
  root: THREE.Group; arm: THREE.Group; bone: THREE.Group; lights: THREE.InstancedMesh; sign: ReturnType<typeof makeSign>;
  /** 단추 i 켜고 끄기 */
  blink(i: number, on: boolean): void;
  showBone(kind: 'skull' | 'skeleton', tint: string): void;
  /** 뼈 모형 지오메트리 버리기(치울 때) */
  dispose(): void;
}
/** 화석 복원기: 민트 받침 + 유리 돔 안 뼈 + 금빛 집게 팔 + 반짝 단추 */
export function makeRestorer(atlas?: SignAtlas): RestorerRig {
  const m = mats(), g = geos();
  const root = new THREE.Group();
  root.name = 'dinos-restorer';
  const base = new THREE.Mesh(g.base, m.mint);
  base.castShadow = true; base.receiveShadow = true;
  root.add(base);
  const band = new THREE.Mesh(g.ring, m.gold);
  root.add(band);
  const dome = new THREE.Mesh(g.dome, m.glass);
  dome.renderOrder = 2;
  root.add(dome);
  // 반짝 단추 셋 = 인스턴스 셋(그리기 한 번). 끄면 크기 0
  const lights = new THREE.InstancedMesh(g.ball, btnMat(), 3);
  const lm: THREE.Matrix4[] = [];
  const o = new THREE.Object3D();
  for (let i = 0; i < 3; i++) {
    const a = 0.9 + i * 0.32;
    o.position.set(Math.sin(a) * 0.9, 0.6, Math.cos(a) * 0.9); o.scale.setScalar(0.08); o.updateMatrix();
    lm.push(o.matrix.clone());
    lights.setMatrixAt(i, o.matrix);
    lights.setColorAt(i, new THREE.Color(BTN_COLORS[i]));
  }
  lights.computeBoundingSphere();
  root.add(lights);
  const off = new THREE.Matrix4().makeScale(0, 0, 0);
  const lit = [true, true, true];
  const blink = (i: number, on: boolean) => {
    if (lit[i] === on) return;
    lit[i] = on;
    lights.setMatrixAt(i, on ? lm[i] : off);
    lights.instanceMatrix.needsUpdate = true;
  };
  // 집게 팔(뒤쪽 기둥 → 돔 위로 굽는다)
  const arm = new THREE.Group();
  arm.position.set(0, 0.9, -0.95);
  const a1 = new THREE.Mesh(g.arm, m.gold); a1.scale.set(1, 1.3, 1); a1.position.y = 0.65; arm.add(a1);
  const j = new THREE.Mesh(g.ball, m.pink); j.scale.setScalar(0.12); j.position.y = 1.3; arm.add(j);
  const a2 = new THREE.Mesh(g.arm, m.gold); a2.scale.set(1, 0.9, 1); a2.rotation.x = 1.2; a2.position.set(0, 1.45, 0.4); arm.add(a2);
  const claw = new THREE.Mesh(g.ball, m.sky); claw.scale.set(0.16, 0.1, 0.16); claw.position.set(0, 1.6, 0.8); arm.add(claw);
  bakeStatic(arm, [], { shadow: false });   // 팔 네 조각 → 한 메시(공용 지오메트리만이라 버릴 것 없음… 구운 것은 아래 dispose)
  root.add(arm);
  const bone = new THREE.Group();
  bone.position.y = 1.15;
  root.add(bone);
  let boneGeo: THREE.BufferGeometry[] = [];
  const dropBone = () => { for (const gg of boneGeo) gg.dispose(); boneGeo = []; bone.clear(); };
  const showBone = (kind: 'skull' | 'skeleton', tint: string) => {
    dropBone();
    const f = fossilModel(kind, tint);
    f.scale.setScalar(kind === 'skeleton' ? 0.7 : 1.3);
    // 뼈 조각 여럿 → 재질별 한 메시(돔 안이라 그림자 생략)
    boneGeo = bakeStatic(f, [], { disposeSrc: true, shadow: false });
    bone.add(f);
  };
  showBone('skull', '#f3e6cc');
  const sign = makeSign('화석 복원기 🦴', '#7cc96b', atlas);
  sign.root.position.set(1.5, 0, 0.5);
  sign.root.rotation.y = -0.5;
  root.add(sign.root);
  const armGeo = arm.children.map((c) => (c as THREE.Mesh).geometry).filter(Boolean);
  return { root, arm, bone, lights, sign, blink, showBone, dispose: () => { dropBone(); for (const gg of armGeo) gg.dispose(); lights.dispose(); } };
}

export interface PenRig { root: THREE.Group; sign: ReturnType<typeof makeSign> }
/**
 * 공룡 목장 울타리: 땅 높이를 따라 말뚝(InstancedMesh 하나) + 가로대 두 줄(InstancedMesh 하나). gate 방향은 비워 둔다(들어가는 문).
 * heightAt 은 세계 좌표. root 는 (cx, 0, cz) 에 둔다.
 */
export function makePen(cx: number, cz: number, r: number, gateYaw: number, heightAt: (x: number, z: number) => number, atlas?: SignAtlas): PenRig {
  const m = mats(), g = geos();
  const root = new THREE.Group();
  root.name = 'dinos-pen';
  root.position.set(cx, 0, cz);
  const N = Math.max(16, Math.round((Math.PI * 2 * r) / 2.2));
  const gate = (a: number) => { let d = a - gateYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d) < (2.6 / r); };
  const pts: Array<{ a: number; x: number; z: number; y: number }> = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    pts.push({ a, x, z, y: heightAt(cx + x, cz + z) });
  }
  const posts = pts.filter((p) => !gate(p.a));
  const pm = new THREE.InstancedMesh(g.post, m.wood, posts.length);
  const cm = new THREE.InstancedMesh(g.cap, m.cream, posts.length);
  const o = new THREE.Object3D();
  posts.forEach((p, i) => {
    o.position.set(p.x, p.y - 0.05, p.z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix();
    pm.setMatrixAt(i, o.matrix); cm.setMatrixAt(i, o.matrix);
  });
  pm.castShadow = true; pm.receiveShadow = true;
  root.add(pm, cm);
  const rails: THREE.Matrix4[] = [];
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 1) % N];
    if (gate(a.a) || gate(b.a)) continue;
    for (const hgt of [0.45, 0.9]) {
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2 + hgt;
      const len = Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y);
      o.position.set(mx, my, mz);
      o.rotation.set(0, 0, 0);
      o.lookAt(b.x, b.y + hgt, b.z);
      o.scale.set(1, 1, len + 0.05);
      o.updateMatrix();
      rails.push(o.matrix.clone());
    }
  }
  const rm = new THREE.InstancedMesh(g.rail, m.woodD, rails.length);
  rails.forEach((mt, i) => rm.setMatrixAt(i, mt));
  rm.castShadow = true;
  root.add(rm);
  const sign = makeSign('🦕 공룡 목장', '#9fd36b', atlas);
  const sx = Math.cos(gateYaw) * (r + 1.2), sz = Math.sin(gateYaw) * (r + 1.2);
  const ox = Math.cos(gateYaw + 0.5) * (r + 1.4), oz = Math.sin(gateYaw + 0.5) * (r + 1.4);
  sign.root.position.set(ox, heightAt(cx + ox, cz + oz), oz);
  sign.root.lookAt(sx * 3, sign.root.position.y, sz * 3);
  root.add(sign.root);
  return { root, sign };
}

/** 깨진 알 껍데기 반쪽 두 개(위 반쪽은 날아오른다) */
export function makeShell(): { root: THREE.Group; top: THREE.Mesh; bottom: THREE.Mesh } {
  const m = mats(), g = geos();
  const root = new THREE.Group();
  const bottom = new THREE.Mesh(g.shellHalf, m.shell);
  bottom.rotation.x = Math.PI; bottom.position.y = 0.3; bottom.scale.set(1, 1.1, 1);
  const top = new THREE.Mesh(g.shellHalf, m.shell);
  top.position.y = 0.32; top.scale.set(0.95, 1.2, 0.95);
  root.add(bottom, top);
  return { root, top, bottom };
}
