// 우주 생물 모델 — 둥글고 통통한 실루엣 + art.ts 공용 얼굴(큰 세로 타원 눈·하이라이트 2개·볼터치) + 블롭 그림자 + 숨쉬기.
// 지오메트리·재질은 모듈 전역 공유(userData.shared) — 청크가 버려도 dispose 하지 않는다.
import * as THREE from 'three';
import { addEyes, blobShadow, breathe, eyeMaterial } from '../../core/art';
import type { SpaceSpecies } from './data';

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function shared<T extends THREE.BufferGeometry>(g: T): T { g.userData.shared = true; return g; }

/** 위가 밝고 아래가 살짝 어두운 정점색 그라디언트 구 */
function gradSphere(w: number, h: number, lo = 0.8) {
  const g = new THREE.SphereGeometry(1, w, h);
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = lo + (1 - lo) * Math.pow((y + 1) / 2, 0.8);
    c[i * 3] = k; c[i * 3 + 1] = k; c[i * 3 + 2] = Math.min(1, k * 1.03);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return shared(g);
}
/** 정점색(흰색) 을 붙인다 — vertexColors 재질과 같이 쓰려고 */
function white<T extends THREE.BufferGeometry>(g: T): T {
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return shared(g);
}

export function starGeometry(ro: number, ri: number, depth: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? ri : ro;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.6, bevelSize: ri * 0.35, bevelSegments: 4, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

export const G = {
  body: gradSphere(40, 30),
  part: gradSphere(24, 18, 0.88),
  eye: white(new THREE.SphereGeometry(1, 20, 14)),
  ring: white(new THREE.TorusGeometry(1, 0.12, 12, 48)),
  fatRing: white(new THREE.TorusGeometry(1, 0.34, 20, 48)),
  smile: white(new THREE.TorusGeometry(1, 0.22, 8, 16, Math.PI)),
  cone: white(new THREE.ConeGeometry(1, 1, 24, 1)),
  tube: white(new THREE.CapsuleGeometry(1, 2, 6, 12)),
  star: white(starGeometry(1, 0.45, 0.35)),
  plane: shared(new THREE.PlaneGeometry(1, 1)),
};

const mats = new Map<string, THREE.Material>();
/** 털·피부 재질(색·광택·발광·투명 조합마다 하나 공유) */
export function fur(color: string, opts: { gloss?: boolean; glow?: number; alpha?: number } = {}) {
  const key = `${color}|${opts.gloss ? 1 : 0}|${opts.glow ?? 0}|${opts.alpha ?? 1}`;
  let m = mats.get(key);
  if (!m) {
    const c = new THREE.Color(color);
    m = new THREE.MeshPhysicalMaterial({
      color: c, vertexColors: true,
      roughness: opts.gloss ? 0.18 : 0.62,
      clearcoat: opts.gloss ? 1 : 0.15, clearcoatRoughness: 0.2,
      sheen: opts.gloss ? 0 : 1, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ffffff'),
      emissive: c, emissiveIntensity: opts.glow ?? 0.14,
      transparent: (opts.alpha ?? 1) < 1, opacity: opts.alpha ?? 1, depthWrite: (opts.alpha ?? 1) >= 1,
    });
    m.userData.shared = true;
    mats.set(key, m);
  }
  return m;
}
const MOUTH = fur('#6e4a5a', { glow: 0 });

function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, p: V3, s: V3 | number, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(p);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.copy(s);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}
/** 타원체 표면 위 점 */
function surf(c: V3, r: V3, dx: number, dy: number, dz: number) {
  const d = v(dx, dy, dz).normalize();
  return v(c.x + d.x * r.x, c.y + d.y * r.y, c.z + d.z * r.z);
}
/** 타원체 표면 법선 */
function surfN(c: V3, r: V3, p: V3) {
  return v((p.x - c.x) / (r.x * r.x), (p.y - c.y) / (r.y * r.y), (p.z - c.z) / (r.z * r.z)).normalize();
}

/**
 * 얼굴: art.ts 공용 눈(+볼터치)을 타원체 머리 앞면에 붙이고, 작은 웃는 입.
 * c·r = 머리 타원체 중심·반지름, y = 눈높이(방향 성분), spread = 눈 사이(방향 성분), eye = 눈 반지름 기준.
 */
function face(g: THREE.Object3D, c: V3, r: V3, o: { y?: number; spread?: number; eye?: number; cheek?: boolean; mouth?: boolean } = {}) {
  const y = o.y ?? 0.15, sp = o.spread ?? 0.42, e = o.eye ?? 0.16 * r.x;
  const pL = surf(c, r, -sp, y, 1), pR = surf(c, r, sp, y, 1);
  const nL = surfN(c, r, pL), nR = surfN(c, r, pR);
  const xAxis = pR.clone().sub(pL);
  const gap = xAxis.length();
  xAxis.normalize();
  const n = nL.clone().add(nR).normalize();
  const zAxis = n.clone().addScaledVector(xAxis, -n.dot(xAxis)).normalize();
  const yAxis = zAxis.clone().cross(xAxis).normalize();
  const fg = new THREE.Group();
  fg.name = 'face';
  fg.position.copy(pL).add(pR).multiplyScalar(0.5);
  fg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  g.add(fg);
  const splay = Math.acos(Math.min(1, Math.max(-1, nR.dot(zAxis))));
  const size = e * 2.5;
  addEyes(fg, { size, gap, y: 0, z: size * 0.04, splay, blush: o.cheek !== false });
  if (o.mouth !== false) {
    const m = surf(c, r.clone().multiplyScalar(1.01), 0, y - 0.24, 1);
    const mm = put(g, G.smile, MOUTH, m, e * 0.3, false);
    mm.lookAt(m.clone().add(surfN(c, r, m)));
    mm.rotateZ(Math.PI);
  }
  return fg;
}
/** 셋째 눈(삐리) — 공용 눈 재질 판 하나 */
function extraEye(parent: THREE.Object3D, p: V3, n: V3, size: number) {
  const m = new THREE.Mesh(G.plane, eyeMaterial('R'));
  m.position.copy(p);
  m.quaternion.setFromUnitVectors(v(0, 0, 1), n.clone().normalize());
  m.scale.setScalar(size);
  m.renderOrder = 2;
  parent.add(m);
  return m;
}

export interface Creature extends THREE.Group {
  userData: { anim: (t: number) => void; radius: number; kind: string; phase: number; species: string };
}

export function makeCreature(sp: SpaceSpecies, phase = 0): Creature {
  const g = new THREE.Group() as Creature;
  g.name = `space-${sp.id}`;
  const [a, b, cc] = sp.colors;
  const A = fur(a), B = fur(b), C = fur(cc);
  const parts: Record<string, THREE.Object3D> = {};
  let anim: (t: number) => void = () => {};
  // 숨쉬기 층(1.00↔1.05) 안에 몸
  const breath = new THREE.Group();
  g.add(breath);
  const body = new THREE.Group();
  breath.add(body);
  let shadowR = 0.5;
  switch (sp.kind) {
    case 'bunny': {
      const c = v(0, 0.5, 0), r = v(0.5, 0.46, 0.46);
      put(body, G.body, A, c, r);
      face(body, c, r, { y: 0.1, spread: 0.38 });
      for (const s of [-1, 1]) {
        // 길고 둥근 귀
        const ear = new THREE.Group(); ear.position.set(s * 0.2, 0.86, -0.04); ear.rotation.z = -s * 0.22; body.add(ear);
        put(ear, G.part, A, v(0, 0.38, 0), v(0.13, 0.42, 0.1));
        put(ear, G.part, B, v(0, 0.38, 0.05), v(0.075, 0.32, 0.05), false);
        parts['ear' + s] = ear;
        put(body, G.part, A, v(s * 0.22, 0.09, 0.18), v(0.14, 0.09, 0.2)); // 발
        put(body, G.part, A, v(s * 0.36, 0.38, 0.28), v(0.09, 0.08, 0.09)); // 손
      }
      put(body, G.part, B, v(0, 0.45, -0.46), 0.13); // 꼬리
      anim = (t) => {
        body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.35;
        parts['ear-1'].rotation.z = 0.22 + Math.sin(t * 3) * 0.12;
        parts['ear1'].rotation.z = -0.22 - Math.sin(t * 3 + 1) * 0.12;
      };
      break;
    }
    case 'jelly': {
      const c = v(0, 0.55, 0), r = v(0.55, 0.45, 0.55);
      const dome = put(body, G.body, fur(a, { gloss: true, glow: 0.35, alpha: 0.82 }), c, r);
      dome.castShadow = false;
      put(body, G.body, fur(b, { glow: 0.6 }), v(0, 0.52, 0), v(0.32, 0.26, 0.32), false);
      face(body, c, r, { y: -0.05, spread: 0.36 });
      const st = put(body, G.star, fur(cc, { gloss: true, glow: 0.8 }), v(0, 1.08, 0), 0.2);
      const tent: THREE.Object3D[] = [];
      for (let i = 0; i < 7; i++) {
        const an = (i / 7) * Math.PI * 2;
        const tt = new THREE.Group(); tt.position.set(Math.cos(an) * 0.34, 0.2, Math.sin(an) * 0.34); body.add(tt);
        put(tt, G.tube, fur(i % 2 ? cc : b, { glow: 0.4 }), v(0, -0.28, 0), v(0.05, 0.13, 0.05), false);
        put(tt, G.part, fur(cc, { glow: 0.6 }), v(0, -0.6, 0), 0.06, false);
        tent.push(tt);
      }
      anim = (t) => {
        body.position.y = Math.sin(t * 1.4) * 0.25;
        const s = 1 + Math.sin(t * 2.8) * 0.06;
        body.scale.set(s, 2 - s, s);
        tent.forEach((tt, i) => { tt.rotation.x = Math.sin(t * 2.8 + i) * 0.25; tt.rotation.z = Math.cos(t * 2.2 + i) * 0.2; });
        st.rotation.y = t * 1.5;
      };
      break;
    }
    case 'turtle': {
      const sc = v(0, 0.48, -0.05), sr = v(0.62, 0.42, 0.66);
      put(body, G.body, fur(b), sc, sr);
      // 월석 등: 크레이터 무늬(작은 오목 반점)
      for (let i = 0; i < 9; i++) {
        const an = i * 2.4, rr = i === 0 ? 0 : 0.3 + (i % 3) * 0.12;
        const p = surf(sc, v(0.6, 0.41, 0.64), Math.cos(an) * rr, 1, Math.sin(an) * rr);
        put(body, G.part, fur(i % 3 ? '#bfb6d2' : cc), p, v(0.11, 0.04, 0.11), false);
      }
      put(body, G.part, A, v(0, 0.2, 0), v(0.6, 0.14, 0.62));
      const hc = v(0, 0.52, 0.66), hr = v(0.3, 0.28, 0.28);
      const head = new THREE.Group(); body.add(head);
      put(head, G.body, A, hc, hr);
      face(head, hc, hr, { y: 0.15, spread: 0.45 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(body, G.part, A, v(sx * 0.46, 0.14, sz * 0.4), v(0.16, 0.13, 0.17));
      anim = (t) => { head.position.y = Math.sin(t * 1.5) * 0.04; head.rotation.y = Math.sin(t * 0.7) * 0.25; body.rotation.y = Math.sin(t * 0.3) * 0.2; };
      shadowR = 0.7;
      break;
    }
    case 'slime': {
      const c = v(0, 0.42, 0), r = v(0.56, 0.42, 0.52);
      put(body, G.body, fur(a, { gloss: true, glow: 0.12 }), c, r);
      put(body, G.part, fur('#ffffff', { gloss: true, glow: 0.4, alpha: 0.7 }), v(-0.22, 0.7, 0.18), v(0.12, 0.07, 0.08), false);
      face(body, c, r, { y: 0.15, spread: 0.36 });
      const ant = new THREE.Group(); ant.position.set(0, 0.8, 0); body.add(ant);
      put(ant, G.tube, B, v(0, 0.16, 0), v(0.03, 0.08, 0.03), false);
      put(ant, G.part, fur(cc, { glow: 0.7 }), v(0, 0.34, 0), 0.08);
      anim = (t) => {
        const s = 1 + Math.sin(t * 3) * 0.07;
        body.scale.set(s, 2 - s, s);
        ant.rotation.z = Math.sin(t * 4) * 0.3;
      };
      shadowR = 0.6;
      break;
    }
    case 'whale': {
      const c = v(0, 0, 0), r = v(1.1, 0.95, 1.7);
      put(body, G.body, A, c, r);
      put(body, G.body, B, v(0, -0.36, 0.25), v(0.92, 0.6, 1.4));
      face(body, c, r, { y: -0.05, spread: 0.55, eye: 0.17 });
      const tail = new THREE.Group(); tail.position.set(0, 0.1, -1.55); body.add(tail);
      put(tail, G.part, A, v(0, 0, -0.35), v(0.32, 0.22, 0.5));
      for (const s of [-1, 1]) {
        const f = put(tail, G.part, A, v(s * 0.38, 0.05, -0.75), v(0.45, 0.07, 0.22)); f.rotation.y = s * 0.4;
        const fin = put(body, G.part, fur(s < 0 ? '#ffd0de' : '#c8e8ff', { glow: 0.3 }), v(s * 1.0, -0.35, 0.25), v(0.38, 0.06, 0.2)); fin.rotation.z = s * 0.5;
      }
      for (let i = 0; i < 6; i++) put(body, G.star, fur(['#ff9fb8', '#ffd84a', '#9ef0d2', '#8fd3f4', '#c9b6f2', '#ffa24c'][i], { glow: 1 }), surf(c, r.clone().multiplyScalar(1.01), Math.sin(i * 2.1) * 0.5, 0.9, -0.4 + i * 0.2), 0.09, false);
      anim = (t) => { tail.rotation.x = Math.sin(t * 1.2) * 0.35; body.rotation.x = Math.sin(t * 1.2 + 1) * 0.06; };
      shadowR = 1.4;
      break;
    }
    case 'fish': {
      const c = v(0, 0, 0), r = v(0.32, 0.36, 0.48);
      put(body, G.body, A, c, r);
      put(body, G.part, B, v(0, -0.12, 0.08), v(0.26, 0.22, 0.36));
      face(body, c, r, { y: 0.1, spread: 0.55 });
      const tail = new THREE.Group(); tail.position.set(0, 0, -0.42); body.add(tail);
      const trail: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i++) {
        trail.push(put(tail, G.part, fur(i % 2 ? b : cc, { glow: 0.9, alpha: 0.9 - i * 0.12 }), v(0, 0.03 * i, -0.12 - i * 0.2), 0.2 - i * 0.03, false));
      }
      put(body, G.star, fur(b, { glow: 1 }), v(0, 0.42, 0), 0.12);
      anim = (t) => { tail.rotation.y = Math.sin(t * 6) * 0.35; body.rotation.z = Math.sin(t * 2) * 0.1; trail.forEach((m, i) => m.scale.setScalar((0.2 - i * 0.03) * (1 + 0.2 * Math.sin(t * 9 + i)))); };
      break;
    }
    case 'chick': {
      const c = v(0, 0.42, 0), r = v(0.42, 0.4, 0.4);
      put(body, G.body, A, c, r);
      face(body, c, r, { y: 0.18, spread: 0.4, mouth: false });
      const bk = put(body, G.cone, fur(cc), surf(c, r, 0, 0.0, 1), v(0.07, 0.12, 0.07));
      bk.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) { const w = put(body, G.part, B, v(s * 0.4, 0.42, 0), v(0.08, 0.17, 0.2)); w.rotation.z = s * 0.4; parts['w' + s] = w; }
      for (const s of [-1, 1]) put(body, G.part, fur(cc), v(s * 0.14, 0.04, 0.08), v(0.09, 0.04, 0.12));
      const tuft = put(body, G.star, fur('#fff2a8', { glow: 0.8 }), v(0, 0.86, 0), 0.12);
      for (let i = 0; i < 4; i++) put(body, G.part, fur(i % 2 ? '#ffd6a8' : '#fff2a8', { glow: 0.7, alpha: 0.85 }), v(0, 0.55 + i * 0.03, -0.42 - i * 0.16), 0.13 - i * 0.025, false);
      anim = (t) => { body.position.y = Math.abs(Math.sin(t * 3)) * 0.12; parts['w-1'].rotation.z = -0.4 - Math.abs(Math.sin(t * 8)) * 0.4; parts['w1'].rotation.z = 0.4 + Math.abs(Math.sin(t * 8)) * 0.4; tuft.rotation.y = t; };
      shadowR = 0.45;
      break;
    }
    case 'ufo': {
      put(body, G.body, fur(b, { gloss: true, glow: 0.1 }), v(0, 0, 0), v(0.75, 0.16, 0.75));
      put(body, G.ring, fur(cc, { glow: 0.5 }), v(0, 0, 0), v(0.72, 0.72, 0.9)).rotation.x = Math.PI / 2;
      const lights: THREE.Mesh[] = [];
      for (let i = 0; i < 8; i++) { const an = (i / 8) * Math.PI * 2; lights.push(put(body, G.part, fur(i % 2 ? cc : '#ff9fc8', { glow: 1.2 }), v(Math.cos(an) * 0.68, -0.04, Math.sin(an) * 0.68), 0.06, false)); }
      const c = v(0, 0.36, 0), r = v(0.4, 0.4, 0.38);
      put(body, G.body, A, c, r);
      face(body, c, r, { y: 0.15, spread: 0.4 });
      const legs: THREE.Object3D[] = [];
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * Math.PI * 2 + 0.3;
        const l = new THREE.Group(); l.position.set(Math.cos(an) * 0.35, -0.12, Math.sin(an) * 0.35); body.add(l);
        put(l, G.tube, A, v(0, -0.2, 0), v(0.06, 0.1, 0.06), false);
        legs.push(l);
      }
      anim = (t) => { body.position.y = Math.sin(t * 1.8) * 0.15; body.rotation.z = Math.sin(t * 1.3) * 0.08; lights.forEach((m, i) => m.scale.setScalar(0.05 + 0.03 * (0.5 + 0.5 * Math.sin(t * 6 + i)))); legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 3 + i) * 0.3; }); };
      break;
    }
    case 'mole': {
      const c = v(0, 0.45, 0), r = v(0.44, 0.45, 0.42);
      put(body, G.body, A, c, r);
      put(body, G.part, B, surf(c, r, 0, -0.15, 1), v(0.28, 0.22, 0.16));
      face(body, c, r, { y: 0.28, spread: 0.36, mouth: false });
      // 분홍 코
      put(body, G.part, fur(cc, { gloss: true }), surf(c, r.clone().multiplyScalar(1.05), 0, 0.06, 1), v(0.1, 0.08, 0.08));
      for (const s of [-1, 1]) { put(body, G.part, B, v(s * 0.38, 0.3, 0.25), v(0.14, 0.1, 0.12)); put(body, G.part, A, v(s * 0.3, 0.86, 0), v(0.1, 0.1, 0.05)); }
      // 공사 헬멧 + 반짝 등
      put(body, G.body, fur('#ffe27a', { gloss: true }), v(0, 0.78, 0), v(0.4, 0.2, 0.4));
      const lamp = put(body, G.part, fur('#fffbe0', { glow: 1.5 }), v(0, 0.86, 0.36), 0.07, false);
      anim = (t) => { body.rotation.y = Math.sin(t * 0.8) * 0.4; lamp.scale.setScalar(0.07 * (1 + 0.15 * Math.sin(t * 5))); };
      shadowR = 0;
      break;
    }
    case 'cat': {
      const c = v(0, 0.42, 0), r = v(0.46, 0.4, 0.42);
      put(body, G.body, A, c, r);
      face(body, c, r, { y: 0.1, spread: 0.4 });
      for (const s of [-1, 1]) {
        const ear = put(body, G.cone, A, v(s * 0.26, 0.82, 0), v(0.14, 0.24, 0.12)); ear.rotation.z = -s * 0.3;
        const ei = put(body, G.cone, B, v(s * 0.26, 0.8, 0.05), v(0.08, 0.15, 0.06), false); ei.rotation.z = -s * 0.3;
        put(body, G.part, B, v(s * 0.2, 0.07, 0.2), v(0.1, 0.08, 0.12));
      }
      for (let i = 0; i < 6; i++) put(body, G.star, fur(i % 2 ? cc : '#fff6b0', { glow: 1.1 }), surf(c, r.clone().multiplyScalar(1.01), Math.sin(i * 2.4) * 0.8, 0.4 + Math.cos(i * 1.7) * 0.4, -0.7), 0.05, false);
      const tail = new THREE.Group(); tail.position.set(0, 0.3, -0.38); body.add(tail);
      for (let i = 0; i < 6; i++) put(tail, G.part, i > 3 ? B : A, v(0, i * 0.09, -i * 0.05), 0.08 - i * 0.004);
      anim = (t) => { body.position.y = Math.sin(t * 1.2) * 0.12; body.rotation.z = Math.sin(t * 0.8) * 0.08; tail.rotation.x = -0.4 + Math.sin(t * 2) * 0.3; tail.rotation.z = Math.sin(t * 1.5) * 0.4; };
      break;
    }
    case 'snail': {
      const sc = v(0, 0.55, -0.1), sr = v(0.3, 0.42, 0.42);
      put(body, G.body, B, sc, sr);
      put(body, G.part, fur(a), v(0.0, 0.58, -0.1), v(0.31, 0.28, 0.28));
      const ring = put(body, G.ring, fur(cc, { gloss: true, glow: 0.3 }), sc, v(0.62, 0.62, 0.9));
      ring.rotation.set(Math.PI / 2 - 0.4, 0, 0.3);
      put(body, G.part, A, v(0, 0.14, 0.05), v(0.24, 0.13, 0.62));
      const hc = v(0, 0.42, 0.45), hr = v(0.22, 0.24, 0.22);
      put(body, G.body, A, hc, hr);
      face(body, hc, hr, { y: 0.0, spread: 0.45, eye: 0.05 });
      for (const s of [-1, 1]) { put(body, G.tube, A, v(s * 0.09, 0.72, 0.45), v(0.025, 0.07, 0.025), false); put(body, G.part, fur(cc, { glow: 0.5 }), v(s * 0.09, 0.86, 0.45), 0.045, false); }
      anim = (t) => { ring.rotation.z = t * 1.2; body.scale.z = 1 + Math.sin(t * 2) * 0.04; };
      shadowR = 0.45;
      break;
    }
    case 'sheep': {
      const c = v(0, 0.55, 0), r = v(0.5, 0.42, 0.55);
      for (let i = 0; i < 14; i++) {
        const an = i * 2.4, el = ((i % 5) / 4 - 0.4) * 1.2;
        put(body, G.part, i % 3 ? A : B, v(Math.cos(an) * 0.42 * Math.cos(el), 0.55 + Math.sin(el) * 0.35, Math.sin(an) * 0.45 * Math.cos(el)), 0.24);
      }
      put(body, G.body, A, c, r);
      const hc = v(0, 0.62, 0.5), hr = v(0.26, 0.25, 0.22);
      put(body, G.body, fur('#fffaf2'), hc, hr);
      face(body, hc, hr, { y: 0.05, spread: 0.45, eye: 0.06 });
      for (const s of [-1, 1]) { const e = put(body, G.part, fur('#fffaf2'), v(s * 0.3, 0.68, 0.45), v(0.12, 0.05, 0.07)); e.rotation.z = s * -0.4; }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(body, G.tube, fur('#fffaf2'), v(sx * 0.24, 0.12, sz * 0.24), v(0.07, 0.06, 0.07));
      const stars: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i++) stars.push(put(body, G.star, fur(cc, { glow: 1.2 }), v(Math.cos(i * 1.3) * 0.5, 0.95 + (i % 2) * 0.08, Math.sin(i * 1.3) * 0.4), 0.06, false));
      anim = (t) => { body.position.y = Math.abs(Math.sin(t * 1.6)) * 0.06; stars.forEach((s, i) => { s.rotation.y = t * 2 + i; s.scale.setScalar(0.06 * (1 + 0.3 * Math.sin(t * 4 + i))); }); };
      shadowR = 0.6;
      break;
    }
    case 'penguin': {
      const c = v(0, 0.55, 0), r = v(0.4, 0.52, 0.38);
      put(body, G.body, A, c, r);
      put(body, G.part, B, v(0, 0.48, 0.12), v(0.32, 0.42, 0.28));
      const fc = v(0, 0.66, 0.06), fr = v(0.33, 0.32, 0.33);
      face(body, fc, fr, { y: 0.1, spread: 0.38, mouth: false });
      const bk = put(body, G.cone, fur(cc), surf(fc, fr, 0, -0.05, 1), v(0.06, 0.12, 0.06)); bk.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) { const w = put(body, G.part, A, v(s * 0.4, 0.5, 0), v(0.07, 0.24, 0.14)); w.rotation.z = s * 0.3; parts['w' + s] = w; put(body, G.part, fur(cc), v(s * 0.14, 0.04, 0.12), v(0.1, 0.04, 0.14)); }
      put(body, G.body, fur('#e8f6ff', { gloss: true, alpha: 0.3, glow: 0.1 }), v(0, 0.66, 0.04), 0.5, false);
      put(body, G.ring, fur('#ffffff', { gloss: true }), v(0, 0.34, 0.02), v(0.42, 0.42, 1)).rotation.x = Math.PI / 2;
      put(body, G.part, fur('#ff8fb8', { glow: 1 }), v(0, 1.16, 0), 0.05, false);
      anim = (t) => { body.rotation.z = Math.sin(t * 3) * 0.1; parts['w-1'].rotation.z = -0.3 - Math.max(0, Math.sin(t * 3)) * 0.5; parts['w1'].rotation.z = 0.3 + Math.max(0, -Math.sin(t * 3)) * 0.5; };
      shadowR = 0.45;
      break;
    }
    case 'moth': {
      // 반짝가루나방: 큰 머리 + 둥근 몸 + 은빛 날개 4장(가루 반짝이) + 끝이 공인 큰 더듬이
      const hc = v(0, 0.12, 0.2), hr = v(0.22, 0.21, 0.2);
      put(body, G.body, A, hc, hr);
      face(body, hc, hr, { y: 0.12, spread: 0.42 });
      put(body, G.part, fur(b), v(0, 0.05, -0.12), v(0.14, 0.14, 0.24));
      // 털 목도리
      put(body, G.part, fur('#fffaf2'), v(0, 0.04, 0.06), v(0.18, 0.12, 0.12));
      const wings: THREE.Object3D[] = [];
      const wingM = fur(a, { gloss: true, glow: 0.35, alpha: 0.9 });
      const dustM = fur(cc, { glow: 1.2 });
      for (const s of [-1, 1]) for (const k of [0, 1]) {
        const w = new THREE.Group(); w.position.set(s * 0.08, 0.1, k ? -0.16 : -0.02); body.add(w);
        const wm = put(w, G.part, wingM, v(s * (k ? 0.2 : 0.3), 0.02, k ? -0.04 : 0.02), k ? v(0.2, 0.02, 0.15) : v(0.3, 0.02, 0.2), false);
        wm.rotation.y = s * (k ? -0.5 : 0.3);
        for (let i = 0; i < 4; i++) put(w, G.part, dustM, v(s * (0.1 + i * 0.07), 0.035, (k ? -0.06 : 0.04) + Math.sin(i * 2) * 0.05), 0.022, false);
        wings.push(w);
      }
      for (const s of [-1, 1]) {
        put(body, G.tube, B, v(s * 0.08, 0.38, 0.28), v(0.012, 0.06, 0.012), false).rotation.z = -s * 0.35;
        put(body, G.part, fur(cc, { glow: 0.9 }), v(s * 0.13, 0.48, 0.3), 0.04, false);
      }
      anim = (t) => {
        const f = Math.sin((t / 0.25) * Math.PI * 2) * 0.75;
        wings.forEach((w, i) => { w.rotation.z = (i < 2 ? -1 : 1) * f; });
        body.rotation.x = Math.sin(t * 3) * 0.08;
      };
      shadowR = 0;
      break;
    }
    case 'moonbug': {
      // 달빛벌레: 은빛으로 빛나는 둥근 등껍질 + 큰 머리 + 짧은 다리 6개
      const sc = v(0, 0.22, -0.05), sr = v(0.26, 0.18, 0.3);
      put(body, G.body, fur(a, { gloss: true, glow: 0.65 }), sc, sr);
      put(body, G.tube, fur(b, { glow: 1 }), v(0, 0.38, -0.05), v(0.012, 0.11, 0.012), false).rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) put(body, G.part, fur(i % 2 ? b : cc, { glow: 1.3 }), surf(sc, sr, (i < 2 ? -0.5 : 0.5), 1, i % 2 ? -0.4 : 0.3), 0.04, false);
      const hc = v(0, 0.2, 0.26), hr = v(0.17, 0.15, 0.14);
      put(body, G.body, fur('#c9b6f2'), hc, hr);
      face(body, hc, hr, { y: 0.15, spread: 0.45 });
      const legs: THREE.Object3D[] = [];
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
        const l = new THREE.Group(); l.position.set(s * 0.22, 0.1, 0.12 - k * 0.14); body.add(l);
        put(l, G.tube, fur('#c9b6f2'), v(s * 0.04, -0.04, 0), v(0.02, 0.03, 0.02), false).rotation.z = s * 0.9;
        legs.push(l);
      }
      for (const s of [-1, 1]) put(body, G.part, fur(cc, { glow: 0.9 }), v(s * 0.1, 0.42, 0.34), 0.03, false);
      anim = (t) => { legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 10 + i * 1.7) * 0.4; }); body.position.y = Math.abs(Math.sin(t * 10)) * 0.01; };
      shadowR = 0.32;
      break;
    }
    case 'starsaurus': {
      // 별공룡: 하늘색 4발 + 큰 머리(몸의 40% 넘게) + 둥근 뿔 3 + 금 별 무늬 + 투명 헬멧
      const bc = v(0, 0.95, -0.15), br = v(0.75, 0.62, 1.0);
      put(body, G.body, A, bc, br);
      put(body, G.part, fur('#fffaf2'), v(0, 0.75, 0.1), v(0.6, 0.45, 0.75));
      for (let i = 0; i < 7; i++) put(body, G.star, fur(b, { gloss: true, glow: 0.7 }), surf(bc, br.clone().multiplyScalar(1.01), Math.sin(i * 2.3) * 0.55, 0.85, -0.6 + i * 0.18), 0.09, false);
      const head = new THREE.Group(); head.position.set(0, 1.55, 0.95); body.add(head);
      const hc = v(0, 0, 0), hr = v(0.58, 0.54, 0.55);
      put(head, G.body, A, hc, hr);
      put(head, G.part, fur('#fffaf2'), v(0, -0.18, 0.34), v(0.4, 0.26, 0.26));
      face(head, hc, hr, { y: 0.12, spread: 0.42 });
      const hornM = fur(b, { gloss: true, glow: 0.3 });
      for (const [x, y, z, s] of [[0, 0.5, 0.3, 0.16], [-0.26, 0.42, 0.12, 0.12], [0.26, 0.42, 0.12, 0.12]] as const) {
        const hn = put(head, G.cone, hornM, v(x, y + s * 0.6, z), v(s * 0.55, s * 1.4, s * 0.55)); hn.rotation.x = 0.35; hn.rotation.z = -x * 0.8;
        put(head, G.part, hornM, v(x + (-x * 0.12), y + s * 1.3, z + 0.08), s * 0.32, false);
      }
      // 투명 헬멧 + 은빛 목둘레
      put(head, G.body, fur('#c8e8ff', { gloss: true, alpha: 0.28, glow: 0.15 }), v(0, 0.08, 0.04), 0.92, false);
      put(head, G.fatRing, fur('#dfe6ee', { gloss: true }), v(0, -0.58, -0.05), v(0.62, 0.62, 0.5)).rotation.x = Math.PI / 2;
      const legs: THREE.Object3D[] = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const l = new THREE.Group(); l.position.set(sx * 0.48, 0.6, -0.15 + sz * 0.55); body.add(l);
        put(l, G.tube, A, v(0, -0.25, 0), v(0.2, 0.15, 0.2));
        put(l, G.part, fur('#fffaf2'), v(0, -0.56, 0.05), v(0.24, 0.14, 0.27));
        legs.push(l);
      }
      const tail = new THREE.Group(); tail.position.set(0, 0.95, -1.05); body.add(tail);
      for (let i = 0; i < 5; i++) put(tail, G.part, A, v(0, -i * 0.08, -i * 0.22), 0.3 - i * 0.05);
      put(tail, G.star, fur(b, { glow: 0.8 }), v(0, -0.32, -1.08), 0.12, false);
      anim = (t) => {
        head.rotation.y = Math.sin(t * 0.6) * 0.3; head.rotation.x = Math.sin(t * 0.9) * 0.06;
        tail.rotation.y = Math.sin(t * 1.4) * 0.35;
        legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 1.2 + i * 1.6) * 0.06; });
      };
      shadowR = 1.2;
      break;
    }
    case 'alien': {
      // 삐리: 연두 구 머리 + 더듬이 2(끝 발광) + 큰 눈 3 + 라벤더 우주복
      const hc = v(0, 0.88, 0), hr = v(0.45, 0.42, 0.42);
      put(body, G.body, A, hc, hr);
      const fg = face(body, hc, hr, { y: 0.02, spread: 0.42, eye: 0.08 });
      // 셋째 눈: 이마 가운데
      const p3 = surf(hc, hr.clone().multiplyScalar(1.01), 0, 0.42, 1);
      extraEye(body, p3, surfN(hc, hr, p3), 0.17);
      void fg;
      const ants: THREE.Object3D[] = [];
      for (const s of [-1, 1]) {
        const an = new THREE.Group(); an.position.set(s * 0.2, 1.22, 0); an.rotation.z = -s * 0.35; body.add(an);
        put(an, G.tube, A, v(0, 0.14, 0), v(0.025, 0.08, 0.025), false);
        put(an, G.part, fur(b, { glow: 1.2 }), v(0, 0.32, 0), 0.07, false);
        ants.push(an);
      }
      put(body, G.body, fur(cc), v(0, 0.34, 0), v(0.28, 0.3, 0.26));
      put(body, G.part, fur('#fff2a8', { glow: 0.8 }), v(0, 0.4, 0.25), 0.06, false); // 가슴 단추
      for (const s of [-1, 1]) {
        const arm = put(body, G.part, fur(cc), v(s * 0.3, 0.38, 0.05), v(0.08, 0.14, 0.08)); arm.rotation.z = s * 0.6; parts['a' + s] = arm;
        put(body, G.part, A, v(s * 0.13, 0.05, 0.04), v(0.11, 0.06, 0.14));
      }
      anim = (t) => {
        body.position.y = Math.abs(Math.sin(t * 2.4)) * 0.08;
        ants.forEach((an, i) => { an.rotation.z = (i ? -0.35 : 0.35) + Math.sin(t * 4 + i) * 0.25; });
        parts['a1'].rotation.z = 0.6 + Math.max(0, Math.sin(t * 3)) * 1.2; // 손 흔들기
      };
      shadowR = 0.4;
      break;
    }
    case 'brachio': {
      // 달브라키오: 은빛 몸 + 금 별 무늬 + 아주 긴 목 + 작은 머리에 투명 헬멧
      const bc = v(0, 2.3, 0), br = v(1.35, 1.1, 1.9);
      put(body, G.body, A, bc, br);
      put(body, G.part, fur('#fffaf2'), v(0, 1.9, 0.2), v(1.1, 0.8, 1.5));
      for (let i = 0; i < 9; i++) put(body, G.star, fur(b, { gloss: true, glow: 0.8 }), surf(bc, br.clone().multiplyScalar(1.01), Math.sin(i * 2.1) * 0.6, 0.9, -0.7 + i * 0.17), 0.16, false);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        put(body, G.tube, A, v(sx * 0.8, 0.9, sz * 1.1), v(0.36, 0.42, 0.36));
        put(body, G.part, fur('#fffaf2'), v(sx * 0.8, 0.12, sz * 1.1 + 0.06), v(0.42, 0.2, 0.46));
      }
      const neck = new THREE.Group(); neck.position.set(0, 2.9, 1.5); body.add(neck);
      const N = 9;
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1);
        put(neck, G.part, A, v(0, k * 3.9, Math.sin(k * 1.4) * 1.2), 0.5 - k * 0.2);
      }
      const head = new THREE.Group(); head.position.set(0, 4.15, 1.3); neck.add(head);
      const hc = v(0, 0, 0.12), hr = v(0.42, 0.38, 0.5);
      put(head, G.body, A, hc, hr);
      face(head, hc, hr, { y: 0.1, spread: 0.4 });
      put(head, G.body, fur('#c8e8ff', { gloss: true, alpha: 0.28, glow: 0.15 }), v(0, 0.05, 0.12), 0.78, false);
      const tail = new THREE.Group(); tail.position.set(0, 2.4, -1.8); body.add(tail);
      for (let i = 0; i < 7; i++) put(tail, G.part, A, v(0, -i * 0.18, -i * 0.4), 0.5 - i * 0.06);
      anim = (t) => { neck.rotation.x = Math.sin(t * 0.35) * 0.08; neck.rotation.y = Math.sin(t * 0.22) * 0.25; head.rotation.x = Math.sin(t * 0.5) * 0.15; tail.rotation.y = Math.sin(t * 0.6) * 0.3; };
      shadowR = 2.6;
      break;
    }
    case 'jellybear': {
      // 젤리곰: 말캉한 투명 젤리 곰
      const J = fur(a, { gloss: true, glow: 0.35, alpha: 0.78 });
      const bc = v(0, 0.3, 0), br = v(0.26, 0.28, 0.22);
      put(body, G.body, J, bc, br, false);
      const hc = v(0, 0.68, 0.02), hr = v(0.24, 0.21, 0.2);
      put(body, G.body, J, hc, hr, false);
      face(body, hc, hr, { y: 0.05, spread: 0.42 });
      for (const s of [-1, 1]) {
        put(body, G.part, J, v(s * 0.17, 0.86, 0), 0.08, false);
        put(body, G.part, J, v(s * 0.24, 0.36, 0.08), v(0.08, 0.12, 0.08), false);
        put(body, G.part, J, v(s * 0.12, 0.06, 0.06), v(0.1, 0.08, 0.11), false);
      }
      anim = (t) => { const s = 1 + Math.sin(t * 5) * 0.06; body.scale.set(s, 2 - s, s); };
      shadowR = 0.3;
      break;
    }
    case 'ringsnake': {
      // 고리뱀: 민트 훌라후프 몸 + 흰 줄 + 위에 동그란 머리
      const ring = new THREE.Group(); ring.position.y = 0.42; body.add(ring);
      put(ring, G.fatRing, A, v(0, 0, 0), v(0.36, 0.36, 0.36));
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * Math.PI * 2;
        put(ring, G.part, fur(b), v(Math.cos(an) * 0.36, Math.sin(an) * 0.36, 0), v(0.05, 0.05, 0.13), false).rotation.z = an;
      }
      const hc = v(0, 0.86, 0.08), hr = v(0.18, 0.16, 0.17);
      put(body, G.body, A, hc, hr);
      face(body, hc, hr, { y: 0.1, spread: 0.42 });
      put(body, G.part, fur(cc), v(0, 0.78, 0.25), v(0.03, 0.012, 0.05), false);
      anim = (t) => { ring.rotation.z = t * 2.2; body.rotation.y = Math.sin(t * 0.8) * 0.3; };
      shadowR = 0.4;
      break;
    }
    case 'hedgehog': {
      // 수정가시 고슴도치: 하늘빛 투명 결정 가시
      const bc = v(0, 0.24, 0), br = v(0.27, 0.22, 0.3);
      put(body, G.body, fur(b), bc, br);
      const SPK = fur(a, { gloss: true, glow: 0.45, alpha: 0.7 });
      for (let i = 0; i < 16; i++) {
        const an = i * 2.39996, el = 0.25 + (i % 4) * 0.28;
        const d = v(Math.cos(an) * Math.cos(el), Math.sin(el), Math.sin(an) * Math.cos(el) - 0.35).normalize();
        const p = v(bc.x + d.x * br.x * 0.9, bc.y + d.y * br.y * 0.9, bc.z + d.z * br.z * 0.9);
        const sp2 = put(body, G.cone, SPK, p, v(0.05, 0.16, 0.05), false);
        sp2.quaternion.setFromUnitVectors(v(0, 1, 0), d);
      }
      const hc = v(0, 0.22, 0.26), hr = v(0.15, 0.14, 0.14);
      put(body, G.body, fur(b), hc, hr);
      face(body, hc, hr, { y: 0.12, spread: 0.45 });
      put(body, G.part, fur(cc, { gloss: true }), surf(hc, hr.clone().multiplyScalar(1.04), 0, -0.05, 1), 0.035, false);
      anim = (t) => { body.position.y = Math.abs(Math.sin(t * 4)) * 0.02; };
      shadowR = 0.3;
      break;
    }
    case 'ufojelly': {
      // UFO해파리: 은빛 접시 + 분홍 돔(얼굴) + 빛 촉수
      put(body, G.body, fur(a, { gloss: true }), v(0, 0, 0), v(0.6, 0.12, 0.6));
      const c = v(0, 0.18, 0), r = v(0.34, 0.3, 0.34);
      put(body, G.body, fur(b, { gloss: true, alpha: 0.75, glow: 0.4 }), c, r, false);
      face(body, c, r, { y: 0.1, spread: 0.42 });
      const tent: THREE.Object3D[] = [];
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * Math.PI * 2;
        const tt = new THREE.Group(); tt.position.set(Math.cos(an) * 0.4, -0.06, Math.sin(an) * 0.4); body.add(tt);
        put(tt, G.tube, fur(cc, { glow: 1 }), v(0, -0.22, 0), v(0.03, 0.1, 0.03), false);
        put(tt, G.part, fur('#ff9fb8', { glow: 1.3 }), v(0, -0.42, 0), 0.045, false);
        tent.push(tt);
      }
      anim = (t) => { body.rotation.y = t * 0.8; tent.forEach((tt, i) => { tt.rotation.x = Math.sin(t * 2 + i) * 0.3; }); };
      break;
    }
    case 'fox': {
      // 혜성여우: 주황 몸 + 뾰족 귀 + 흰 빛 꼬리
      const bc = v(0, 0.36, -0.05), br = v(0.24, 0.22, 0.36);
      put(body, G.body, A, bc, br);
      const hc = v(0, 0.58, 0.3), hr = v(0.24, 0.22, 0.22);
      put(body, G.body, A, hc, hr);
      put(body, G.part, fur(b), v(0, 0.52, 0.48), v(0.11, 0.08, 0.1));
      put(body, G.part, fur('#6e4a5a'), v(0, 0.55, 0.57), 0.03, false);
      face(body, hc, hr, { y: 0.18, spread: 0.45, mouth: false });
      for (const s of [-1, 1]) {
        const ear = put(body, G.cone, A, v(s * 0.13, 0.82, 0.26), v(0.08, 0.16, 0.06)); ear.rotation.z = -s * 0.25;
        put(body, G.tube, A, v(s * 0.13, 0.12, 0.1), v(0.06, 0.06, 0.06));
        put(body, G.tube, A, v(s * 0.13, 0.12, -0.22), v(0.06, 0.06, 0.06));
      }
      const tail = new THREE.Group(); tail.position.set(0, 0.42, -0.38); body.add(tail);
      for (let i = 0; i < 6; i++) put(tail, G.part, fur(i < 2 ? a : b, { glow: i < 2 ? 0.2 : 1.1, alpha: i < 2 ? 1 : 0.9 - i * 0.1 }), v(0, i * 0.04, -i * 0.13), 0.13 - i * 0.012, false);
      anim = (t) => { tail.rotation.y = Math.sin(t * 2.5) * 0.4; tail.rotation.x = -0.2 + Math.sin(t * 1.5) * 0.1; };
      shadowR = 0.4;
      break;
    }
    case 'littlestar': {
      // 꼬마별: 노란 작은 행성 + 얼굴 + 둘레를 도는 반짝이
      const c = v(0, 0, 0), r = v(0.32, 0.32, 0.32);
      put(body, G.body, fur(a, { gloss: true, glow: 0.7 }), c, r);
      face(body, c, r, { y: 0.1, spread: 0.4 });
      const orbit = new THREE.Group(); body.add(orbit);
      for (let i = 0; i < 5; i++) { const an = (i / 5) * Math.PI * 2; put(orbit, G.star, fur(i % 2 ? b : cc, { glow: 1.2 }), v(Math.cos(an) * 0.5, 0, Math.sin(an) * 0.5), 0.06, false); }
      orbit.rotation.x = 0.4;
      anim = (t) => { orbit.rotation.y = t * 1.6; body.rotation.z = Math.sin(t) * 0.1; };
      break;
    }
  }
  if (sp.id === 'gold-bunny') {
    for (let i = 0; i < 6; i++) put(g, G.star, fur('#fff2a8', { glow: 1.4 }), v(Math.cos(i) * 0.7, 0.9 + Math.sin(i * 3) * 0.3, Math.sin(i) * 0.7), 0.07, false);
  }
  // 땅 위 친구는 발밑 블롭 그림자(떠 있는 친구는 스포너가 땅에 따로 깐다)
  if (sp.hover === 0 && shadowR > 0) g.add(blobShadow(shadowR));
  g.scale.setScalar(sp.size * 1.2);
  g.userData.kind = sp.kind;
  g.userData.species = sp.id;
  g.userData.phase = phase;
  g.userData.anim = (t: number) => { anim(t); breathe(breath, t, phase); };
  g.userData.radius = 0.6 * sp.size;
  return g;
}

/** 블롭 그림자 하나(떠 있는 생물용 — 땅에 둔다) */
export const groundShadow = (r: number) => blobShadow(r);
