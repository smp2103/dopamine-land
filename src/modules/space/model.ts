// 우주 생물 모델 — 둥글고 통통한 실루엣 + 큰 눈(하이라이트) + 볼터치. 지오메트리·재질은 공유.
import * as THREE from 'three';
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

export const G = {
  body: gradSphere(40, 30),
  part: gradSphere(24, 18, 0.88),
  eye: shared(new THREE.SphereGeometry(1, 20, 14)),
  ring: shared(new THREE.TorusGeometry(1, 0.12, 12, 48)),
  smile: shared(new THREE.TorusGeometry(1, 0.22, 8, 16, Math.PI)),
  cone: shared(new THREE.ConeGeometry(1, 1, 24, 1)),
  tube: shared(new THREE.CapsuleGeometry(1, 2, 6, 12)),
  star: shared(starGeometry(1, 0.45, 0.35)),
};

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

const mats = new Map<string, THREE.Material>();
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
    mats.set(key, m);
  }
  return m;
}
const EYE = new THREE.MeshPhysicalMaterial({ color: '#2a1f3d', roughness: 0.15, clearcoat: 1 });
const HI = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const CHEEK = new THREE.MeshBasicMaterial({ color: '#ff9cbc', transparent: true, opacity: 0.75, depthWrite: false });
const MOUTH = new THREE.MeshBasicMaterial({ color: '#5a2f45' });

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
/** 큰 눈 2개 + 하이라이트 + 볼터치 + 작은 입 */
function face(g: THREE.Object3D, c: V3, r: V3, o: { y?: number; spread?: number; eye?: number; cheek?: boolean; mouth?: boolean } = {}) {
  const y = o.y ?? 0.15, sp = o.spread ?? 0.42, e = o.eye ?? 0.16 * r.x;
  for (const s of [-1, 1]) {
    const p = surf(c, r, s * sp, y, 1);
    const eye = put(g, G.eye, EYE, p, v(e * 0.82, e, e * 0.5), false);
    eye.lookAt(p.clone().add(p.clone().sub(c)));
    const h = surf(c, r.clone().multiplyScalar(1.02), s * sp - 0.06, y + 0.09, 1);
    put(g, G.eye, HI, h, e * 0.32, false);
    const h2 = surf(c, r.clone().multiplyScalar(1.02), s * sp + 0.05, y - 0.06, 1);
    put(g, G.eye, HI, h2, e * 0.14, false);
    if (o.cheek !== false) {
      const q = surf(c, r.clone().multiplyScalar(1.005), s * (sp + 0.22), y - 0.32, 1);
      const ck = put(g, G.eye, CHEEK, q, v(e * 0.75, e * 0.45, e * 0.2), false);
      ck.lookAt(q.clone().add(q.clone().sub(c)));
    }
  }
  if (o.mouth !== false) {
    const m = surf(c, r.clone().multiplyScalar(1.01), 0, y - 0.22, 1);
    const mm = put(g, G.smile, MOUTH, m, e * 0.32, false);
    mm.rotation.z = Math.PI;
  }
}

export interface Creature extends THREE.Group { userData: { anim: (t: number) => void; radius: number } }

export function makeCreature(sp: SpaceSpecies): Creature {
  const g = new THREE.Group() as Creature;
  const [a, b, cc] = sp.colors;
  const A = fur(a), B = fur(b), C = fur(cc);
  const parts: Record<string, THREE.Object3D> = {};
  let anim: (t: number) => void = () => {};
  const body = new THREE.Group();
  g.add(body);
  switch (sp.kind) {
    case 'bunny': {
      const c = v(0, 0.5, 0), r = v(0.5, 0.46, 0.46);
      put(body, G.body, A, c, r);
      face(body, c, r, { y: 0.1, spread: 0.38 });
      for (const s of [-1, 1]) {
        const ear = new THREE.Group(); ear.position.set(s * 0.2, 0.86, -0.04); ear.rotation.z = -s * 0.22; body.add(ear);
        put(ear, G.part, A, v(0, 0.32, 0), v(0.12, 0.36, 0.09));
        put(ear, G.part, B, v(0, 0.32, 0.05), v(0.07, 0.27, 0.05), false);
        parts['ear' + s] = ear;
        put(body, G.part, A, v(s * 0.22, 0.09, 0.18), v(0.14, 0.09, 0.2)); // 발
        put(body, G.part, A, v(s * 0.36, 0.38, 0.28), v(0.09, 0.08, 0.09)); // 손
      }
      put(body, G.part, B, v(0, 0.45, -0.46), 0.13); // 꼬리
      anim = (t) => {
        body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.35;
        body.scale.set(1, 1 + Math.sin(t * 4.4) * 0.03, 1);
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
      const st = put(body, G.star, fur(b, { gloss: true, glow: 0.8 }), v(0, 1.08, 0), 0.2);
      parts.star = st;
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
      const shell = put(body, G.body, fur(b), v(0, 0.48, -0.05), v(0.62, 0.42, 0.66));
      for (let i = 0; i < 7; i++) {
        const an = i * 2.4, rr = i === 0 ? 0 : 0.42;
        const p = surf(v(0, 0.48, -0.05), v(0.6, 0.41, 0.64), Math.cos(an) * rr, 1, Math.sin(an) * rr);
        put(body, G.part, fur(i % 2 ? cc : '#a493c8'), p, v(0.13, 0.05, 0.13), false);
      }
      void shell;
      put(body, G.part, A, v(0, 0.2, 0), v(0.6, 0.14, 0.62));
      const hc = v(0, 0.52, 0.66), hr = v(0.3, 0.28, 0.28);
      const head = new THREE.Group(); body.add(head);
      put(head, G.body, A, hc, hr);
      face(head, hc, hr, { y: 0.15, spread: 0.45 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(body, G.part, A, v(sx * 0.46, 0.14, sz * 0.4), v(0.16, 0.13, 0.17));
      anim = (t) => { head.position.y = Math.sin(t * 1.5) * 0.04; head.rotation.y = Math.sin(t * 0.7) * 0.25; body.rotation.y = Math.sin(t * 0.3) * 0.2; };
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
        const fin = put(body, G.part, A, v(s * 1.0, -0.35, 0.25), v(0.38, 0.06, 0.2)); fin.rotation.z = s * 0.5;
      }
      for (let i = 0; i < 6; i++) put(body, G.star, fur(cc, { glow: 1 }), surf(c, r.clone().multiplyScalar(1.01), Math.sin(i * 2.1) * 0.5, 0.9, -0.4 + i * 0.2), 0.09, false);
      anim = (t) => { tail.rotation.x = Math.sin(t * 1.2) * 0.35; body.rotation.x = Math.sin(t * 1.2 + 1) * 0.06; };
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
      break;
    }
    case 'ufo': {
      put(body, G.body, fur(b, { gloss: true, glow: 0.1 }), v(0, 0, 0), v(0.75, 0.16, 0.75));
      put(body, G.ring, fur(cc, { glow: 0.5 }), v(0, 0, 0), v(0.72, 0.72, 0.9)).rotation.x = Math.PI / 2;
      const lights: THREE.Mesh[] = [];
      for (let i = 0; i < 8; i++) { const an = (i / 8) * Math.PI * 2; lights.push(put(body, G.part, fur(i % 2 ? cc : '#ff9fc8', { glow: 1.2 }), v(Math.cos(an) * 0.68, -0.04, Math.sin(an) * 0.68), 0.06, false)); }
      const c = v(0, 0.32, 0), r = v(0.36, 0.34, 0.34);
      put(body, G.body, A, c, r);
      face(body, c, r, { y: 0.15, spread: 0.4 });
      put(body, G.body, fur('#dff4ff', { gloss: true, alpha: 0.35, glow: 0.2 }), v(0, 0.22, 0), v(0.5, 0.48, 0.5), false);
      const legs: THREE.Object3D[] = [];
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * Math.PI * 2 + 0.3;
        const l = new THREE.Group(); l.position.set(Math.cos(an) * 0.35, -0.12, Math.sin(an) * 0.35); body.add(l);
        put(l, G.tube, A, v(0, -0.2, 0), v(0.06, 0.1, 0.06), false);
        legs.push(l);
      }
      anim = (t) => { body.position.y = Math.sin(t * 1.8) * 0.15; body.rotation.y = t * 0.6; body.rotation.z = Math.sin(t * 1.3) * 0.08; lights.forEach((m, i) => m.scale.setScalar(0.05 + 0.03 * (0.5 + 0.5 * Math.sin(t * 6 + i)))); legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 3 + i) * 0.3; }); };
      break;
    }
    case 'mole': {
      const c = v(0, 0.45, 0), r = v(0.44, 0.45, 0.42);
      put(body, G.body, A, c, r);
      put(body, G.part, B, surf(c, r, 0, -0.15, 1), v(0.28, 0.22, 0.16));
      face(body, c, r, { y: 0.28, spread: 0.36, mouth: false });
      put(body, G.part, fur(cc, { gloss: true }), surf(c, r.clone().multiplyScalar(1.05), 0, 0.02, 1), v(0.1, 0.08, 0.08));
      for (const s of [-1, 1]) { put(body, G.part, B, v(s * 0.38, 0.3, 0.25), v(0.14, 0.1, 0.12)); put(body, G.part, A, v(s * 0.3, 0.86, 0), v(0.1, 0.1, 0.05)); }
      // 공사 헬멧
      put(body, G.body, fur('#ffe27a', { gloss: true }), v(0, 0.78, 0), v(0.4, 0.2, 0.4));
      const lamp = put(body, G.part, fur('#fffbe0', { glow: 1.5 }), v(0, 0.86, 0.36), 0.07, false);
      // 흙더미
      put(g, G.body, fur('#c9bcd8'), v(0, 0.02, 0), v(0.75, 0.16, 0.75));
      anim = (t) => { body.position.y = -0.1 + Math.max(0, Math.sin(t * 0.9)) * 0.12; body.rotation.y = Math.sin(t * 0.8) * 0.4; lamp.scale.setScalar(0.07 * (1 + 0.15 * Math.sin(t * 5))); };
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
      break;
    }
    case 'sheep': {
      const c = v(0, 0.55, 0), r = v(0.5, 0.42, 0.55);
      for (let i = 0; i < 14; i++) {
        const an = i * 2.4, el = ((i % 5) / 4 - 0.4) * 1.2;
        put(body, G.part, A, v(Math.cos(an) * 0.42 * Math.cos(el), 0.55 + Math.sin(el) * 0.35, Math.sin(an) * 0.45 * Math.cos(el)), 0.24);
      }
      put(body, G.body, A, c, r);
      const hc = v(0, 0.62, 0.5), hr = v(0.26, 0.25, 0.22);
      put(body, G.body, fur(cc), hc, hr);
      face(body, hc, hr, { y: 0.05, spread: 0.45, eye: 0.06 });
      for (const s of [-1, 1]) { const e = put(body, G.part, fur(cc), v(s * 0.3, 0.68, 0.45), v(0.12, 0.05, 0.07)); e.rotation.z = s * -0.4; }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(body, G.tube, fur(cc), v(sx * 0.24, 0.12, sz * 0.24), v(0.07, 0.06, 0.07));
      const stars: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i++) stars.push(put(body, G.star, fur(b, { glow: 1.2 }), v(Math.cos(i * 1.3) * 0.5, 0.95 + (i % 2) * 0.08, Math.sin(i * 1.3) * 0.4), 0.06, false));
      anim = (t) => { body.position.y = Math.abs(Math.sin(t * 1.6)) * 0.06; stars.forEach((s, i) => { s.rotation.y = t * 2 + i; s.scale.setScalar(0.06 * (1 + 0.3 * Math.sin(t * 4 + i))); }); };
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
      break;
    }
  }
  if (sp.id === 'gold-bunny') {
    for (let i = 0; i < 6; i++) put(g, G.star, fur('#fff2a8', { glow: 1.4 }), v(Math.cos(i) * 0.7, 0.9 + Math.sin(i * 3) * 0.3, Math.sin(i) * 0.7), 0.07, false);
  }
  g.scale.setScalar(sp.size * 1.2);
  g.userData.anim = anim;
  g.userData.radius = 0.6 * sp.size;
  return g;
}
