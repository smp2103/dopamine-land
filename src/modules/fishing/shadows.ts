// 물그림자 — ① 던진 찌 둘레에 미리 굴린 그림자 1~3개(★4 이상 등지느러미, ★5·반짝이는 가장자리 금빛 반짝)
//            ② 플레이어 주변 물에 흘려 보내는 장식 그림자(청크, detail) — 그 자리 구역 후보에서 종을 골라 크기를 정한다.
//            ③ 달 연못(우주) 장식 그림자. 달리면(> 6.3 m/s) 가까운 그림자가 놀라서 달아났다가 몇 초 뒤 돌아온다.
// 그림 재료(캔버스 텍스처·지오메트리)는 모듈 전역 공유(userData.shared). 세상 물체는 전부 코드로 그린다.
import * as THREE from 'three';
import { SHADOW_M, type ShadowSize } from '../../core/api';
import type { ChunkLayer } from '../../core/chunks';
import { SPOOK_NEAR, SPOOK_SPEED, pickAmbient } from './logic';

// ───────────── 캔버스 텍스처 ─────────────
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 물고기 실루엣(머리 +x) — 흐릿한 남색 */
export const shadowTex = canvasTex(256, 128, (g) => {
  g.filter = 'blur(6px)';
  g.fillStyle = '#06263c';
  g.beginPath(); g.ellipse(132, 64, 70, 30, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(72, 64); g.quadraticCurveTo(50, 44, 28, 36); g.quadraticCurveTo(40, 64, 28, 92); g.quadraticCurveTo(50, 84, 72, 64); g.fill();
});
/** 쓰레기 그림자: 모난 덩어리(물고기 꼬리 없음) */
export const junkTex = canvasTex(256, 128, (g) => {
  g.filter = 'blur(5px)';
  g.fillStyle = '#1a2a33';
  g.beginPath();
  g.moveTo(70, 40); g.lineTo(150, 30); g.quadraticCurveTo(196, 44, 186, 74); g.lineTo(120, 98); g.quadraticCurveTo(66, 96, 70, 40);
  g.fill();
});
/** 물결 고리 */
export const ringTex = canvasTex(256, 256, (g) => {
  g.filter = 'blur(2px)';
  g.strokeStyle = '#ffffff'; g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
});
/** 반짝(금빛 십자 별) */
export const sparkTex = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 60);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,180,0.9)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(64, 4); g.quadraticCurveTo(70, 58, 124, 64); g.quadraticCurveTo(70, 70, 64, 124); g.quadraticCurveTo(58, 70, 4, 64); g.quadraticCurveTo(58, 58, 64, 4); g.fill();
});
/** 둥근 번짐(분홍 찌 후광) */
export const glowTex = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});

// ───────────── 공유 지오메트리 ─────────────
/** 1 × 0.5 바닥 판(머리 +x) */
export const planeGeo = new THREE.PlaneGeometry(1, 0.5).rotateX(-Math.PI / 2);
planeGeo.userData.shared = true;
export const ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
ringGeo.userData.shared = true;
/** 등지느러미: 둥근 삼각 돛(높이 1, 앞이 +x) */
const finGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0.35, 0);
  s.quadraticCurveTo(0.2, 0.55, -0.12, 1);
  s.quadraticCurveTo(-0.22, 0.45, -0.4, 0);
  s.lineTo(0.35, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -0.04);
  g.computeVertexNormals();
  g.userData.shared = true;
  return g;
})();
const finMat = new THREE.MeshStandardMaterial({ color: '#4d6f8a', roughness: 0.45, metalness: 0, transparent: true, opacity: 0.92, emissive: '#2b4a63', emissiveIntensity: 0.25 });

/** 텍스처 안 실루엣은 판 길이의 약 77% — 판을 이만큼 키워 보이는 길이를 GDD 0.8 지름에 맞춘다 */
export const TEX_PAD = 1.3;
/** 물 위 그리기 순서: 물(1~2)·물안개·반짝 덮개(4) 뒤에 그려야 그림자가 묻히지 않는다 */
export const SHADOW_ORDER = 6;
/** 수면 위로 살짝(물결 덮개와 깊이 다툼을 피한다) */
export const SHADOW_LIFT = 0.1;
/** 물 재질이 polygonOffset(-1,-2)으로 앞당겨 그리니, 그림자는 그보다 더 앞당긴다 */
export function overWater<M extends THREE.Material>(m: M): M {
  m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -8;
  return m;
}

/** 장식 그림자 재질(인스턴스 공유) */
const ambientMat = overWater(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.6, depthWrite: false }));

// ───────────── 크기 ─────────────
export interface ShadowSpecies { shadow?: ShadowSize; len?: number; size?: [number, number] }
/** 그림자 길이(m): GDD 0.8 shadow 표 → 없으면 len → 없으면 크기 범위(cm) */
export function shadowLenFor(sp: ShadowSpecies | null | undefined): number {
  if (sp?.shadow && SHADOW_M[sp.shadow]) return SHADOW_M[sp.shadow];
  const cm = sp?.len ?? (sp?.size ? (sp.size[0] + sp.size[1]) / 2 : 25);
  return THREE.MathUtils.clamp(0.35 + Math.log2(1 + cm / 20) * 0.38, 0.35, 2.8);
}

// ───────────── ① 미리 굴린 그림자 ─────────────
export interface ShadowSpawn {
  /** 그림자 길이(m) */
  len: number;
  rarity: number;
  junk: boolean;
  shiny: boolean;
  x: number;
  z: number;
  /** 수면 높이 */
  y: number;
}
type Mode = 'off' | 'roam' | 'approach' | 'hook' | 'flee';
const SPARK_N = 18;

interface Slot {
  g: THREE.Group;
  plane: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  fin: THREE.Mesh;
  sparks: THREE.Points;
  sparkMat: THREE.PointsMaterial;
  s: ShadowSpawn;
  mode: Mode;
  t0: number;
  /** 지금 위치·방향 */
  x: number; z: number; head: number;
  /** 배회 중심·위상 */
  hx: number; hz: number; ph: number; spin: number;
  /** 다가오기 출발점 */
  fx: number; fz: number; dur: number;
  /** 톡(앞으로 콕) 시각 */
  poke: number;
  /** 꾹(쑥 당김) */
  lunge: boolean;
  op: number;
}

/** 찌 둘레 그림자 1~3개 — 다가오기·톡톡·꾹·도망을 그린다 */
export class CastShadows {
  readonly root = new THREE.Group();
  private slots: Slot[] = [];
  /** 찌 자리(멈추는 곳) */
  private bx = 0; private bz = 0;

  constructor() {
    this.root.name = 'fishing-cast-shadows';
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const mat = overWater(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0, depthWrite: false }));
      const plane = new THREE.Mesh(planeGeo, mat);
      plane.renderOrder = SHADOW_ORDER;
      g.add(plane);
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.castShadow = false;
      fin.visible = false;
      g.add(fin);
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARK_N * 3), 3));
      const sparkMat = new THREE.PointsMaterial({ map: sparkTex, size: 0.32, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe28a' });
      const sparks = new THREE.Points(sg, sparkMat);
      sparks.frustumCulled = false;
      sparks.visible = false;
      g.add(sparks);
      g.visible = false;
      this.root.add(g);
      this.slots.push({
        g, plane, mat, fin, sparks, sparkMat, s: { len: 1, rarity: 1, junk: false, shiny: false, x: 0, z: 0, y: 0 },
        mode: 'off', t0: 0, x: 0, z: 0, head: 0, hx: 0, hz: 0, ph: 0, spin: 1, fx: 0, fz: 0, dur: 3, poke: -99, lunge: false, op: 0,
      });
    }
  }

  get count() { return this.slots.filter((s) => s.mode !== 'off').length; }

  /** 새로 던질 때: 그림자를 놓는다(처음엔 배회) */
  spawn(list: ShadowSpawn[], bob: { x: number; z: number }, t: number, rng: () => number) {
    this.clear();
    this.bx = bob.x; this.bz = bob.z;
    list.slice(0, this.slots.length).forEach((s, i) => {
      const sl = this.slots[i];
      sl.s = s; sl.mode = 'roam'; sl.t0 = t; sl.op = 0;
      sl.x = sl.hx = s.x; sl.z = sl.hz = s.z;
      sl.ph = rng() * Math.PI * 2; sl.spin = rng() < 0.5 ? -1 : 1;
      sl.head = Math.atan2(-(bob.z - s.z), bob.x - s.x);
      sl.poke = -99; sl.lunge = false;
      sl.mat.map = s.junk ? junkTex : shadowTex;
      sl.mat.needsUpdate = true;
      sl.plane.scale.set(s.len * TEX_PAD, 1, s.len * TEX_PAD);
      // ★4 이상은 등지느러미가 물 위로
      sl.fin.visible = !s.junk && s.rarity >= 4;
      const fh = 0.1 + s.len * 0.12;
      sl.fin.scale.set(fh * 0.9, fh, 1);
      sl.fin.position.set(-s.len * 0.04, 0, 0);
      // ★5·반짝이는 가장자리 금빛 반짝
      sl.sparks.visible = !s.junk && (s.rarity >= 5 || s.shiny);
      sl.sparkMat.color.set(s.shiny && s.rarity < 5 ? '#d6f3ff' : '#ffe28a');
      sl.g.visible = true;
    });
  }

  /** i 번 그림자가 찌로 다가오기 시작(dur 초) */
  approach(i: number, t: number, dur: number) {
    const sl = this.slots[i];
    if (!sl || sl.mode === 'off') return;
    sl.mode = 'approach'; sl.t0 = t; sl.fx = sl.x; sl.fz = sl.z; sl.dur = Math.max(0.2, dur);
  }
  /** 톡! — 앞으로 콕 */
  poke(i: number, t: number) { const sl = this.slots[i]; if (sl) sl.poke = t; }
  /** 꾹! — 쑥 당긴다 */
  bite(i: number) { const sl = this.slots[i]; if (sl) sl.lunge = true; }
  /** 그 그림자(없으면 전부) 도망 */
  flee(t: number, i?: number) {
    this.slots.forEach((sl, k) => {
      if (sl.mode === 'off' || (i !== undefined && k !== i)) return;
      sl.mode = 'flee'; sl.t0 = t; sl.fx = sl.x; sl.fz = sl.z;
    });
  }
  /** 잡힌 그림자는 그 자리에서 사라진다(물보라는 fishing.ts) */
  hide(i: number) { const sl = this.slots[i]; if (sl) { sl.mode = 'off'; sl.g.visible = false; } }
  clear() { for (const sl of this.slots) { sl.mode = 'off'; sl.g.visible = false; } }
  /** i 번 그림자의 지금 자리 */
  pos(i: number): { x: number; z: number; y: number } | null {
    const sl = this.slots[i];
    return sl && sl.mode !== 'off' ? { x: sl.x, z: sl.z, y: sl.s.y } : null;
  }

  update(t: number, dt: number) {
    for (const sl of this.slots) {
      if (sl.mode === 'off') continue;
      const s = sl.s, age = t - sl.t0;
      const L = s.len;
      let opTarget = 0.72;
      let vx = 0, vz = 0;
      if (sl.mode === 'roam') {
        // 제자리 맴돌기(큰 고기일수록 느긋하게)
        const sp = 0.35 / Math.max(0.6, L);
        const a = sl.ph + age * sp * sl.spin;
        const nx = sl.hx + Math.cos(a) * 1.1, nz = sl.hz + Math.sin(a * 1.3) * 0.8;
        vx = nx - sl.x; vz = nz - sl.z;
        sl.x = nx; sl.z = nz;
      } else if (sl.mode === 'approach' || sl.mode === 'hook') {
        const dx = this.bx - sl.fx, dz = this.bz - sl.fz;
        const d = Math.hypot(dx, dz) || 1;
        const ux = dx / d, uz = dz / d;
        // 머리가 찌 바로 뒤에 멈춘다
        const sx = this.bx - ux * L * 0.5, sz = this.bz - uz * L * 0.5;
        let nx: number, nz: number;
        if (sl.mode === 'approach') {
          const k = Math.min(1, age / sl.dur);
          const e = 1 - Math.pow(1 - k, 2);
          const wig = Math.sin(t * 3 + sl.ph) * 0.3 * (1 - e);
          nx = sl.fx + (sx - sl.fx) * e - uz * wig;
          nz = sl.fz + (sz - sl.fz) * e + ux * wig;
          if (k >= 1) { sl.mode = 'hook'; sl.t0 = t; }
        } else {
          const pk = t - sl.poke;
          const fwd = sl.lunge ? L * 0.22 : pk >= 0 && pk < 0.22 ? Math.sin((pk / 0.22) * Math.PI) * 0.14 : 0.03 * Math.max(0, Math.sin(t * 9));
          nx = sx + ux * fwd; nz = sz + uz * fwd;
        }
        vx = ux; vz = uz;
        sl.x = nx; sl.z = nz;
        opTarget = 0.86;
      } else if (sl.mode === 'flee') {
        const dx = sl.fx - this.bx, dz = sl.fz - this.bz;
        const d = Math.hypot(dx, dz) || 1;
        vx = dx / d; vz = dz / d;
        const run = Math.min(age, 1.2) * 6;
        sl.x = sl.fx + vx * run; sl.z = sl.fz + vz * run;
        opTarget = 0;
        if (age > 1.1) { sl.mode = 'off'; sl.g.visible = false; continue; }
      }
      if (Math.hypot(vx, vz) > 1e-5) {
        const want = Math.atan2(-vz, vx);
        let dh = want - sl.head;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        sl.head += dh * Math.min(1, dt * 8 + (sl.mode === 'flee' ? 0.5 : 0));
      }
      // 나타날 땐 천천히, 도망칠 땐 빨리
      sl.op += (opTarget - sl.op) * Math.min(1, dt * (sl.mode === 'flee' ? 6 : 2.2));
      sl.mat.opacity = sl.op;
      sl.g.position.set(sl.x, s.y + SHADOW_LIFT, sl.z);
      sl.g.rotation.y = sl.head;
      const wob = 1 + 0.05 * Math.sin(t * 6 + sl.ph);
      sl.plane.scale.set(L * TEX_PAD * wob, 1, L * TEX_PAD);
      if (sl.fin.visible) {
        sl.fin.rotation.set(0, 0, 0.12 * Math.sin(t * 5 + sl.ph));
        (sl.fin.material as THREE.MeshStandardMaterial).opacity = Math.min(0.92, sl.op * 1.4);
      }
      if (sl.sparks.visible) {
        const pa = sl.sparks.geometry.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < SPARK_N; k++) {
          const a = (k / SPARK_N) * Math.PI * 2 + t * 0.35;
          const tw = (Math.sin(t * 5 + k * 2.1) + 1) * 0.5;
          const rr = 1.04 + 0.08 * tw;
          pa.setXYZ(k, (0.02 + Math.cos(a) * 0.32 * rr) * L * TEX_PAD, 0.05 + 0.12 * tw, Math.sin(a) * 0.14 * rr * L * TEX_PAD);
        }
        pa.needsUpdate = true;
        sl.sparkMat.opacity = Math.min(1, sl.op * 1.5);
        sl.sparkMat.size = 0.18 + L * 0.08;
      }
    }
  }
}

// ───────────── ②③ 장식 그림자(청크) ─────────────
interface AmbientFish { x: number; z: number; y: number; rx: number; rz: number; ph: number; sp: number; s: number; flee: number; fdx: number; fdz: number }
interface AmbientSet { mesh: THREE.InstancedMesh; fish: AmbientFish[] }

export interface AmbientOpts {
  rng: (key: string) => () => number;
  /** 낚시되는 물 높이(없으면 null) — 지구 */
  waterAt(x: number, z: number): number | null;
  /** 그 자리 구역 후보에서 종 하나(그림자 크기용) — 없으면 null */
  speciesAt(x: number, z: number, u: number): ShadowSpecies & { rarity: number } | null;
  /** 큰 강·바다 구분(맴도는 폭) */
  isRiver(x: number, z: number): boolean;
  /** 달 연못들(우주, 늦게 읽기) */
  moonPonds(): Array<{ x: number; z: number; r: number; y: number }>;
}

/** 장식 그림자: 지구·달 청크 레이어 두 개와 매 프레임 움직임(놀람 포함) */
export function makeAmbient(o: AmbientOpts) {
  const sets = new Set<AmbientSet>();
  const make = (fish: AmbientFish[]) => {
    if (!fish.length) return null;
    const mesh = new THREE.InstancedMesh(planeGeo, ambientMat, fish.length);
    mesh.frustumCulled = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.renderOrder = SHADOW_ORDER;
    const set: AmbientSet = { mesh, fish };
    mesh.userData.fishSet = set;
    sets.add(set);
    animate(set, 0);
    return mesh;
  };
  const dispose = (obj: THREE.Object3D) => { sets.delete(obj.userData.fishSet as AmbientSet); (obj as THREE.InstancedMesh).dispose(); };

  const earth: ChunkLayer = {
    key: 'fishing-shadows', size: 96, radius: 140, detail: true, world: 'earth',
    build: ({ cx, cz, x0, z0, size }) => {
      const r = o.rng(`fishing-shadows:${cx},${cz}`);
      const fish: AmbientFish[] = [];
      for (let i = 0; i < 40 && fish.length < 12; i++) {
        const x = x0 + r() * size, z = z0 + r() * size;
        const u1 = r(), u2 = r(), u3 = r(), u4 = r();
        const wl = o.waterAt(x, z);
        if (wl === null) continue;
        const river = o.isRiver(x, z);
        const sp = o.speciesAt(x, z, u1);
        const len = sp ? shadowLenFor(sp) : 0.5 + u2 * 0.6;
        fish.push({ x, z, y: wl + SHADOW_LIFT, rx: river ? 0.8 : 2 + u2 * 3, rz: river ? 0.4 : 1.5 + u3 * 2, ph: u4 * 6.28, sp: (0.15 + u3 * 0.2) / Math.max(0.7, len * 0.6), s: len, flee: -99, fdx: 0, fdz: 0 });
        if (river && fish.length >= 5) break;
      }
      return make(fish);
    },
    dispose,
  };

  const moon: ChunkLayer = {
    key: 'fishing-moonshadows', size: 64, radius: 160, detail: true, world: 'space',
    build: ({ cx, cz, x0, z0, size }) => {
      const r = o.rng(`fishing-moonshadows:${cx},${cz}`);
      const fish: AmbientFish[] = [];
      for (const p of o.moonPonds()) {
        // 연못 중심이 이 청크에 있을 때만(같은 연못을 두 번 채우지 않게)
        if (p.x < x0 || p.x >= x0 + size || p.z < z0 || p.z >= z0 + size) continue;
        const n = 4 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const a = r() * Math.PI * 2, d = Math.sqrt(r()) * p.r * 0.6;
          const u = r();
          const sp = o.speciesAt(p.x, p.z, u);
          const len = sp ? shadowLenFor(sp) : 0.55;
          fish.push({ x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, y: p.y + SHADOW_LIFT, rx: 1 + r() * 1.5, rz: 0.8 + r(), ph: r() * 6.28, sp: 0.2 + r() * 0.15, s: len, flee: -99, fdx: 0, fdz: 0 });
        }
      }
      return make(fish);
    },
    dispose,
  };

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function animate(set: AmbientSet, t: number) {
    set.fish.forEach((f, i) => {
      const a = f.ph + t * f.sp;
      let x = f.x + Math.cos(a) * f.rx, z = f.z + Math.sin(a * 1.3) * f.rz;
      let vx = -Math.sin(a) * f.rx, vz = Math.cos(a * 1.3) * 1.3 * f.rz;
      let k = 1;
      const fa = t - f.flee;
      if (fa >= 0 && fa < 7.5) {
        // 놀람: 1.2초 쏜살같이 달아나며 가라앉고, 6초 뒤 제자리로 천천히 돌아온다
        if (fa < 1.2) { const run = fa * 6; x += f.fdx * run; z += f.fdz * run; vx = f.fdx; vz = f.fdz; k = 1 - fa / 1.2; }
        else if (fa < 6) k = 0;
        else k = (fa - 6) / 1.5;
      }
      tmpQ.setFromAxisAngle(UP, Math.atan2(-vz, vx));
      const s = f.s * TEX_PAD * Math.max(0.001, k);
      tmpS.set(s * (1 + 0.04 * Math.sin(t * 6 + f.ph)), 1, s);
      tmpP.set(x, f.y, z);
      set.mesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
    });
    set.mesh.instanceMatrix.needsUpdate = true;
  }

  /** 매 프레임: 움직이고, 달리는 플레이어 근처 그림자는 놀란다. 놀라게 한 수를 돌려준다 */
  function update(t: number, player: { x: number; z: number; speed: number }): number {
    let spooked = 0;
    const run = player.speed > SPOOK_SPEED;
    for (const set of sets) {
      if (run) {
        for (const f of set.fish) {
          const dx = f.x - player.x, dz = f.z - player.z;
          const d = Math.hypot(dx, dz);
          if (d < SPOOK_NEAR && t - f.flee > 7.5) { f.flee = t; f.fdx = dx / (d || 1); f.fdz = dz / (d || 1); spooked++; }
        }
      }
      animate(set, t);
    }
    return spooked;
  }

  /** 디버그: 살아 있는 장식 그림자 수 */
  const live = () => { let n = 0; for (const s of sets) n += s.fish.length; return n; };
  return { layers: [earth, moon], update, live, pickAmbient };
}
