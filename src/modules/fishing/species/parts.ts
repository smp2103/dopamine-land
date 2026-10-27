// 파츠(GDD 0.4 어휘 42종)와 종 하나짜리 장식(FishDeco)을 몸 위에 붙이는 확장 — 몸형 생성기가 준 앵커(코·이마·등·배·꼬리·표면)만 보고 붙인다.
// 그래서 어떤 몸형에 어떤 파츠를 달아도 그럴듯하게 선다(종마다 손으로 만들지 않고 파라미터로 — GDD 3.5 P0-6).
// 별자리(constellation) 별·선, 붕어빵 테두리, 우파루파 아가미, 떡붕어 볼, 무지개 꼬리 … 새 생김새도 전부 여기.
import * as THREE from 'three';
import { crownMesh, PALETTE } from '../../../core/art';
import type { FishLook, FishSpecies } from '../data';
import {
  V, sm, hash, strHash, MAT, solidMat, finMat, glowMat, bodyMat, finGeo, humpShape, tailShape, heartShape, starShape,
  ellipsoidMesh, tube, addFace, addSmile, placeDecal, surfOf, type Anchors, type Pose,
} from './kit';

const C = (c: string) => new THREE.Color(c);

/** 잎·깃털 한 장(원점에서 +x 로 길이 len, 폭 w) */
function leafShape(len: number, w: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.25, w, len * 0.75, w * 0.9, len, 0);
  s.bezierCurveTo(len * 0.75, -w * 0.9, len * 0.25, -w, 0, 0);
  return s;
}

/** 둥근 끝 뿔(원뿔 + 끝 공) — 끝이 dir 쪽 */
function hornMesh(base: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(r, len, 16, 4), mat);
  cone.position.y = len / 2;
  g.add(cone);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 12, 8), mat);
  tip.position.y = len * 0.97;
  g.add(tip);
  g.position.copy(base);
  g.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  return g;
}

/** 작은 꽃(꽃잎 5 + 노란 가운데) — 앞(+z)을 본다 */
function flowerMesh(r: number, petal: string, mid: string = PALETTE.yellow): THREE.Group {
  const g = new THREE.Group();
  const pm = solidMat(petal), cm = solidMat(mid);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = ellipsoidMesh(r * 0.55, r * 0.34, r * 0.16, pm, Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, 0, 16);
    p.rotation.z = a;
    g.add(p);
  }
  g.add(ellipsoidMesh(r * 0.36, r * 0.36, r * 0.24, cm, 0, 0, r * 0.08, 16));
  return g;
}

/** 표면 위 판(눈 무늬·별) 세우기 */
const decalAt = (m: THREE.Object3D, pose: Pose, off = 0.004) => placeDecal(m, pose, off);

/** 금 별 하나(작은 입체 별) */
let starGeo: THREE.BufferGeometry | null = null;
function starMesh(size: number, mat: THREE.Material = MAT.gold): THREE.Mesh {
  if (!starGeo) {
    starGeo = new THREE.ExtrudeGeometry(starShape(0.5, 0.22, 5), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 6 });
    starGeo.translate(0, 0, -0.06);
    starGeo.computeVertexNormals();
    starGeo.userData.shared = true;
  }
  const m = new THREE.Mesh(starGeo, mat);
  m.scale.setScalar(size);
  return m;
}

// ───────────────── 0.4 파츠 ─────────────────
type PartFn = (g: THREE.Group, look: FishLook, A: Anchors, sp: FishSpecies) => void;

const top = (l: FishLook) => C(l.colors[0]);
const belly = (l: FishLook) => C(l.colors[1]);
const acc = (l: FishLook) => C(l.colors[2]);

const PART: Record<string, PartFn> = {
  // 부채 지느러미(쏠배감펭): 등에 줄무늬 지느러미살 부채 + 가슴 부채 둘
  'fan-fin': (g, l, A) => {
    if (A.dorsal) A.dorsal.visible = false;
    const mA = finMat(acc(l).lerp(C('#ffffff'), 0.2), l), mB = finMat(top(l), l);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const ray = new THREE.Mesh(finGeo(leafShape(0.3 - 0.08 * Math.abs(k - 0.4), 0.045), 0.004), i % 2 ? mA : mB);
      const at = surfOf(A)(0.72 - 0.5 * k, 0, -0.02).p;
      ray.position.copy(at);
      ray.rotation.z = THREE.MathUtils.lerp(1.15, 2.5, k);
      g.add(ray);
    }
    for (const side of [-1, 1]) {
      const base = surfOf(A)(0.66, side * 1.75, -0.01).p;
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Mesh(finGeo(leafShape(0.24, 0.04), 0.004), i % 2 ? mA : mB);
        f.position.copy(base);
        f.rotation.set(side * 1.25, side * (0.2 + i * 0.22), -0.6 - i * 0.15);
        g.add(f);
      }
    }
  },
  // 리본 지느러미: 등·뒷지느러미를 길게 흘러내리게(꼬리는 몸형이 'ribbon' 으로)
  'ribbon-fin': (g, l, A) => {
    if (A.dorsal) A.dorsal.visible = false;
    if (A.anal) A.anal.visible = false;
    // 높은 몸(베타·천사)은 몸이 이미 커서 리본을 낮게 — 대신 뒤로 길게 흘린다
    const fm = finMat(acc(l).lerp(top(l), 0.25).lerp(C('#ffffff'), 0.25), l);
    const hk = Math.min(1, 0.2 / Math.max(0.12, A.h));
    const d = new THREE.Mesh(finGeo(humpShape(-0.6, 0.1, 0.3 * hk, 0.1)), fm);
    d.position.copy(A.back).setX(0).add(V(0, -0.04, 0));
    d.rotation.z = -0.12;
    g.add(d);
    const a = new THREE.Mesh(finGeo(humpShape(-0.58, 0.0, 0.26 * hk, 0.1)), fm);
    a.scale.y = -1;
    a.position.copy(A.belly).setX(0).add(V(0, 0.04, 0));
    a.rotation.z = 0.12;
    g.add(a);
  },
  // 큰 가슴지느러미(날치 날개) — 스윕 몸은 몸형이 이미 크게 붙였다
  'big-pec': (g, l, A) => {
    if (A.surf) return;
    const fm = finMat(acc(l), l);
    for (const side of [-1, 1]) {
      const w = ellipsoidMesh(0.26, 0.09, 0.012, fm, A.center.x, A.center.y, side * A.w);
      w.rotation.set(side * -0.7, side * -0.4, -0.2);
      g.add(w);
    }
  },
  whiskers2: (g, l, A) => whiskers(g, l, A, 1),
  whiskers4: (g, l, A) => whiskers(g, l, A, 2),
  crown: (g, _l, A) => {
    const c = crownMesh(Math.max(0.1, A.eye * 1.5));
    c.position.copy(A.brow).add(V(-0.02, -0.01, 0));
    c.rotation.z = -0.15;
    g.add(c);
  },
  lantern: (g, l, A) => lantern(g, l, A, false),
  'lantern-heart': (g, l, A) => lantern(g, l, A, true),
  hump: (g, l, A) => {
    const r = Math.max(0.07, A.h * 0.42);
    const p = A.brow.clone().lerp(A.back, 0.25).add(V(0, -r * 0.35, 0));
    g.add(ellipsoidMesh(r * 1.15, r, Math.min(r * 0.9, A.w * 0.8), solidMat(top(l).lerp(C('#ffffff'), 0.15), l), p.x, p.y, 0));
  },
  hump2: (g, l, A) => {
    const S = surfOf(A), r = Math.max(0.06, A.h * 0.36), m = solidMat(top(l).lerp(C('#ffffff'), 0.12), l);
    for (const t of [0.62, 0.38]) { const p = S(t, 0, -r * 0.4).p; g.add(ellipsoidMesh(r, r * 0.95, Math.min(r * 0.85, A.w * 0.8), m, p.x, p.y, 0)); }
  },
  // 볏·갈기: 머리 위 깃털 다섯 장(우파루파는 등 능선으로)
  crest: (g, l, A) => {
    const fm = solidMat(acc(l).lerp(top(l), 0.2), l);
    if (l.deco?.includes('axolotl')) {
      const d = new THREE.Mesh(finGeo(humpShape(-0.42, 0.12, 0.07, 0.4)), finMat(acc(l).lerp(C('#ffffff'), 0.3), l));
      d.position.y = A.back.y - 0.02;
      g.add(d);
      return;
    }
    if (l.deco?.includes('mane')) return;
    const n = l.shape === 'eel' ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const base = A.brow.clone().add(V(-k * (l.shape === 'eel' ? 0.3 : 0.14), -0.01, 0));
      const f = ellipsoidMesh(0.025, 0.09 - 0.03 * Math.abs(k - 0.3), 0.012, fm);
      f.position.copy(base).add(V(-0.02, 0.07, 0));
      f.rotation.z = 0.35 + k * 0.4;
      g.add(f);
    }
  },
  horn: (g, l, A) => { g.add(hornMesh(A.brow.clone().add(V(0.02, -0.01, 0)), V(0.3, 1, 0), 0.14, 0.028, solidMat(PALETTE.cream, l))); },
  horn3: (g, l, A) => {
    const m = solidMat(PALETTE.cream, l);
    g.add(hornMesh(A.nose.clone().add(V(-0.04, 0.06, 0)), V(1, 0.6, 0), 0.12, 0.025, m));
    for (const s of [-1, 1]) g.add(hornMesh(A.brow.clone().add(V(-0.02, -0.01, s * 0.06)), V(0.6, 1, s * 0.3), 0.16, 0.026, m));
  },
  // 나선 뿔(일각돌고래): 코에서 앞으로 길게, 홈이 빙글빙글
  'spiral-horn': (g, l, A) => {
    const len = 0.55 * A.L;
    const geo = new THREE.ConeGeometry(0.032 * A.L, len, 18, 30);
    const pa = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const ang = Math.atan2(z, x), k = 1 + 0.18 * Math.sin(ang * 2 + (y / len) * 40);
      pa.setX(i, x * k); pa.setZ(i, z * k);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, solidMat(PALETTE.cream, l));
    m.rotation.z = -Math.PI / 2 + 0.12;
    m.position.copy(A.nose).add(V(len / 2 - 0.02, 0.03, 0));
    g.add(m);
  },
  'leaf-tubes': (g, l, A) => {
    const S = surfOf(A), fm = finMat(acc(l).lerp(C(PALETTE.lime), 0.4), l);
    for (let i = 0; i < 8; i++) {
      const at = S(0.2 + 0.6 * hash(i, 4), (hash(i, 7) - 0.5) * 4, 0);
      const f = new THREE.Mesh(finGeo(leafShape(0.16, 0.05), 0.004), fm);
      f.position.copy(at.p);
      f.quaternion.setFromUnitVectors(V(1, 0, 0), at.n.clone().add(V(-0.3, 0.2, 0)).normalize());
      g.add(f);
    }
  },
  flower: (g, _l, A) => {
    const f = flowerMesh(Math.max(0.05, A.eye * 0.8), PALETTE.pink);
    f.position.copy(A.brow).add(V(-0.03, 0.02, 0));
    f.lookAt(f.position.clone().add(V(0.5, 1, 0.15)));
    g.add(f);
  },
  // 가시(둥근 끝) — 눈 자리는 비운다
  spikes: (g, l, A) => {
    const d = new Set(l.deco ?? []);
    const urchin = d.has('urchin'), long = d.has('long-spikes');
    const S = surfOf(A);
    const len = (urchin ? 0.2 : long ? 0.12 : 0.07) * A.L, r = (urchin ? 0.018 : 0.022) * A.L;
    const geo = new THREE.ConeGeometry(r, len, 10);
    geo.translate(0, len / 2, 0);
    const tipGeo = new THREE.SphereGeometry(r * 0.75, 10, 8);
    const sm1 = solidMat(urchin ? top(l).multiplyScalar(0.85) : belly(l).lerp(top(l), 0.4), l);
    const candy = d.has('candy-tips') ? [PALETTE.pink, PALETTE.sky, PALETTE.yellow, PALETTE.mint, PALETTE.lavender].map((c) => solidMat(c)) : null;
    const n = urchin ? 90 : 46;
    for (let i = 0; i < n; i++) {
      const t = 0.18 + 0.64 * hash(i, 3), a = hash(i, 9) * Math.PI * 2;
      const at = S(t, a, -0.005);
      if (!urchin && A.eyes && A.eyes.some((e) => e.p.distanceTo(at.p) < A.eye * 1.3)) continue;
      const m = new THREE.Mesh(geo, sm1);
      m.position.copy(at.p);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), at.n);
      g.add(m);
      const tip = new THREE.Mesh(tipGeo, candy ? candy[i % candy.length] : sm1);
      tip.position.copy(at.p).addScaledVector(at.n, len);
      g.add(tip);
    }
  },
  // 큰 집게(게·새우 몸은 몸형이 직접 단다)
  'claws-big': (g, l, A) => {
    if (l.shape === 'crab' || l.shape === 'shrimp') return;
    const m = solidMat(acc(l).lerp(top(l), 0.4), l);
    for (const s of [-1, 1]) {
      const b = A.nose.clone().add(V(-0.08, -0.05, s * A.w * 0.8));
      g.add(tube([b, b.clone().add(V(0.12, -0.02, s * 0.08)), b.clone().add(V(0.2, 0.03, s * 0.05))], 0.025, 0.02, m));
      const palm = ellipsoidMesh(0.07, 0.05, 0.045, m, b.x + 0.25, b.y + 0.04, b.z + s * 0.05); g.add(palm);
      const f = ellipsoidMesh(0.06, 0.02, 0.025, m, b.x + 0.32, b.y + 0.08, b.z + s * 0.04); f.rotation.z = 0.4; g.add(f);
    }
  },
  'legs-long': () => { /* 게 몸형이 다리 길이로 읽는다 */ },
  tentacles6: () => { /* 문어·암모나이트 몸형이 읽는다 */ },
  tentacles8: () => { /* 문어 몸형이 읽는다 */ },
  // 귀 지느러미(덤보) — 문어 몸형은 wings 로 직접
  'ear-fins': (g, l, A) => {
    if (l.shape === 'octopus' || l.shape === 'squid') return;
    const fm = finMat(acc(l), l);
    for (const s of [-1, 1]) {
      const e = ellipsoidMesh(0.1, 0.07, 0.016, fm, A.brow.x - 0.04, A.brow.y, s * (A.w + 0.03));
      e.rotation.x = s * 0.7;
      g.add(e);
    }
  },
  // 투명 돔 머리(배럴아이): 머리 위 유리 돔 + 안쪽 초록 눈
  'dome-head': (g, l, A) => {
    const r = Math.max(A.h, A.w) * 1.05;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: PALETTE.sky, transparent: true, opacity: 0.32, roughness: 0.05, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
    dome.position.copy(A.brow).add(V(-0.04, -r * 0.55, 0));
    dome.scale.set(1.25, 0.9, 1);
    dome.renderOrder = 4;
    g.add(dome);
    const em = glowMat(acc(l), 0.9);
    for (const s of [-1, 1]) g.add(ellipsoidMesh(r * 0.22, r * 0.3, r * 0.22, em, dome.position.x + 0.02, dome.position.y + r * 0.2, s * r * 0.28, 16));
  },
  'snout-long': (g, l, A) => {
    const s = ellipsoidMesh(0.2 * A.L, 0.03 * A.L, 0.06 * A.L, solidMat(top(l).lerp(C('#ffffff'), 0.1), l), A.nose.x + 0.12 * A.L, A.nose.y + 0.04, 0);
    s.rotation.z = 0.08;
    g.add(s);
  },
  spear: (g, l, A) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.025 * A.L, 0.36 * A.L, 16), solidMat(top(l), l));
    c.rotation.z = -Math.PI / 2;
    c.position.copy(A.nose).add(V(0.17 * A.L, 0.01, 0));
    g.add(c);
    g.add(ellipsoidMesh(0.012, 0.012, 0.012, solidMat(top(l), l), A.nose.x + 0.35 * A.L, A.nose.y + 0.01, 0, 12));
  },
  // 귀상어 T자 머리: 가로 막대 + 양 끝 눈
  't-head': (g, l, A) => {
    const hm = ellipsoidMesh(0.075, 0.05, 0.22, bodyMat(l), A.nose.x - 0.06, 0.02, 0);
    const geo = hm.geometry as THREE.BufferGeometry, pa = geo.attributes.position as THREE.BufferAttribute;
    const cc: number[] = [], t0 = top(l), b0 = belly(l);
    for (let i = 0; i < pa.count; i++) { const c = b0.clone().lerp(t0, sm(-0.03, 0.02, pa.getY(i))); cc.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    g.add(hm);
    const ex = A.nose.x - 0.04;
    const L: Pose = { p: V(ex, 0.045, -0.215), n: V(0.45, 0.15, -1).normalize() };
    const R: Pose = { p: V(ex, 0.045, 0.215), n: V(0.45, 0.15, 1).normalize() };
    addFace(g, L, R, 0.075, { blush: [{ p: V(ex + 0.04, 0.0, -0.17), n: V(0.6, -0.1, -0.8).normalize() }, { p: V(ex + 0.04, 0.0, 0.17), n: V(0.6, -0.1, 0.8).normalize() }] });
  },
  // 털 구 여러 개(털게·구름고래)
  fluffy: (g, l, A) => {
    const m = solidMat(l.shape === 'whale' ? PALETTE.white : belly(l).lerp(C('#ffffff'), 0.35), l, { roughness: 0.85, sheen: 1 });
    const S = surfOf(A);
    const n = l.shape === 'crab' ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const t = l.shape === 'crab' ? 0.2 + 0.6 * hash(i, 2) : 0.3 + 0.4 * hash(i, 2);
      const a = (hash(i, 5) - 0.5) * (l.shape === 'crab' ? 2.6 : 1.4);
      const at = S(t, a, 0);
      const r = (0.035 + 0.03 * hash(i, 8)) * (l.shape === 'whale' ? 1.6 : 1);
      g.add(ellipsoidMesh(r, r * 0.85, r, m, at.p.x, at.p.y, at.p.z, 14));
    }
  },
  frill: (g, l, A) => frill(g, l, A, false),
  'frill-heart': (g, l, A) => frill(g, l, A, true),
  // 등판(작게): 등 한 줄 + 옆 두 줄
  plates: (g, l, A) => {
    const S = surfOf(A), m = solidMat(top(l).lerp(C('#ffffff'), 0.3), l);
    const geo = new THREE.SphereGeometry(1, 12, 8);
    for (const a of [0, 1.25, -1.25]) for (let i = 0; i < 9; i++) {
      const t = 0.18 + i * 0.075;
      const at = S(t, a, -0.004);
      const p = new THREE.Mesh(geo, m);
      p.position.copy(at.p);
      p.quaternion.setFromUnitVectors(V(0, 1, 0), at.n);
      p.scale.set(0.022, a === 0 ? 0.03 : 0.018, 0.016);
      g.add(p);
    }
  },
  'club-tail': (g, l, A) => { g.add(ellipsoidMesh(0.07, 0.06, 0.06, solidMat(top(l).lerp(C('#ffffff'), 0.2), l), A.tail.x - 0.02, A.tail.y, A.tail.z)); },
  sail: (g, l, A) => {
    if (A.dorsal) A.dorsal.visible = false;
    const s = new THREE.Mesh(finGeo(humpShape(-0.32, 0.22, 0.3, 0.5)), finMat(acc(l), l));
    s.position.y = A.back.y - 0.03;
    g.add(s);
  },
  feathers: (g, l, A) => {
    const m = solidMat(acc(l), l);
    for (let i = 0; i < 6; i++) {
      const f = ellipsoidMesh(0.018, 0.08, 0.01, m);
      f.position.copy(A.brow).add(V(-0.02 * i, 0.05, (i % 2 - 0.5) * 0.03));
      f.rotation.z = 0.3 + i * 0.12;
      g.add(f);
    }
  },
  'dome-skull': (g, l, A) => { g.add(ellipsoidMesh(A.h * 0.7, A.h * 0.55, A.w * 0.8, solidMat(top(l).lerp(C('#ffffff'), 0.2), l), A.brow.x, A.brow.y - 0.02, 0)); },
  'long-claws': (g, l, A) => {
    const m = solidMat(PALETTE.cream, l);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const b = A.belly.clone().add(V(0.12, 0, s * A.w * 0.7));
      g.add(tube([b, b.clone().add(V(0.06, -0.04, s * 0.02 * i)), b.clone().add(V(0.1, -0.02 - 0.01 * i, s * (0.03 + 0.02 * i)))], 0.012, 0.005, m));
    }
  },
  // 우주 헬멧: 머리를 감싸는 투명 구
  helmet: (g, _l, A) => {
    const r = Math.max(A.h, A.w) * 1.6;
    const h = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), new THREE.MeshPhysicalMaterial({ color: PALETTE.sky, transparent: true, opacity: 0.25, roughness: 0.05, clearcoat: 1, depthWrite: false }));
    h.position.copy(A.brow).lerp(A.nose, 0.4).add(V(0, -A.h * 0.3, 0));
    h.renderOrder = 4;
    g.add(h);
    g.add(ellipsoidMesh(r * 0.25, r * 0.12, r * 0.12, MAT.white, h.position.x + r * 0.45, h.position.y + r * 0.55, r * 0.25, 12));
  },
  // 빛 꼬리(혜성): 꼬리 뒤로 가늘어지는 빛 + 반짝 별
  'light-tail': (g, l, A) => {
    const c = C(l.colors[2]).lerp(C('#ffffff'), 0.45);
    const start = A.tail.clone().add(V(-0.06 * A.L, 0, 0));
    const pts = [start, start.clone().add(V(-0.25, 0.04, 0)), start.clone().add(V(-0.55, 0.12, 0.02)), start.clone().add(V(-0.8, 0.2, 0))].map((p) => p.multiplyScalar(1));
    const tm = glowMat(c, 1.1, 0.55);
    g.add(tube(pts, 0.07 * A.L, 0.008, tm));
    for (let i = 0; i < 4; i++) {
      const s = starMesh(0.03, MAT.star);
      s.position.copy(pts[1]).lerp(pts[3], i / 3).add(V(0, 0.05 * (i % 2 ? 1 : -1), 0.03));
      s.rotation.y = 1.2;
      g.add(s);
    }
  },
  // 행성 고리
  ring: (g, l, A) => {
    const r = Math.max(A.L * 0.55, A.w * 1.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 10, 64), MAT.gold);
    ring.position.copy(A.center).add(V(0, 0.02, 0));
    ring.rotation.set(Math.PI / 2 - 0.35, 0, 0.2);
    ring.scale.set(1, 1, 0.5);
    g.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(r * 0.88, 0.012, 8, 64), solidMat(acc(l).lerp(C(PALETTE.lavender), 0.3), l));
    inner.rotation.copy(ring.rotation); inner.position.copy(ring.position); inner.scale.copy(ring.scale);
    g.add(inner);
  },
  'antenna-big': (g, l, A) => {
    const m = solidMat(acc(l), l);
    for (const s of [-1, 1]) {
      const b = A.brow.clone().add(V(0.03, 0, s * 0.04));
      g.add(tube([b, b.clone().add(V(0.12, 0.16, s * 0.08)), b.clone().add(V(0.24, 0.22, s * 0.14))], 0.012, 0.007, m));
      g.add(ellipsoidMesh(0.022, 0.022, 0.022, m, b.x + 0.24, b.y + 0.22, b.z + s * 0.14, 12));
    }
  },
  'carrot-nose': (g, _l, A) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.035 * A.L, 0.14 * A.L, 14), solidMat(PALETTE.orange));
    c.rotation.z = -Math.PI / 2;
    c.position.copy(A.nose).add(V(0.055 * A.L, 0.02, 0));
    g.add(c);
  },
  'wings-clear': (g, _l, A) => {
    const m = new THREE.MeshPhysicalMaterial({ color: PALETTE.sky, transparent: true, opacity: 0.4, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    for (const s of [-1, 1]) { const w = ellipsoidMesh(0.2, 0.012, 0.09, m, A.back.x - 0.06, A.back.y + 0.03, s * 0.12); w.rotation.set(s * 0.3, s * 0.5, 0.15); g.add(w); }
  },
  ball: (g, _l, A) => { g.add(ellipsoidMesh(0.14, 0.14, 0.14, solidMat(PALETTE.brown), A.nose.x + 0.18, A.belly.y + 0.08, 0)); },
};

function whiskers(g: THREE.Group, l: FishLook, A: Anchors, pairs: 1 | 2) {
  const S = surfOf(A);
  const wm = solidMat(top(l).multiplyScalar(0.8).lerp(C(PALETTE.beige), 0.2), l);
  const flower = l.deco?.includes('whisker-flower');
  const tip = (p: THREE.Vector3) => {
    if (flower) {
      const f = flowerMesh(0.028, PALETTE.pink);
      f.position.copy(p);
      f.lookAt(p.clone().add(V(0.6, -0.2, Math.sign(p.z) * 0.8)));
      g.add(f);
    } else g.add(ellipsoidMesh(0.012, 0.012, 0.012, wm, p.x, p.y, p.z, 10));
  };
  for (let k = 0; k < pairs; k++) for (const side of [1, -1]) {
    const m0 = S(0.965, side * Math.PI * (k ? 0.55 : 0.72), -0.005).p;
    const L = k ? 0.65 : 1;
    const p1 = m0.clone().add(V(0.06 * L, -0.04 * L, side * 0.05 * L)), p2 = m0.clone().add(V(0.09 * L, -0.13 * L, side * 0.1 * L));
    g.add(tube([m0, p1, p2], 0.009, 0.005, wm));
    tip(p2);
  }
}

function lantern(g: THREE.Group, l: FishLook, A: Anchors, heart: boolean) {
  const base = A.brow.clone().add(V(0.01, -0.01, 0));
  const k = Math.max(0.6, A.L);
  const end = base.clone().add(V(0.3 * k, 0.2 * k, 0));
  g.add(tube([base, base.clone().add(V(0.05 * k, 0.17 * k, 0)), base.clone().add(V(0.2 * k, 0.26 * k, 0)), end], 0.012, 0.008, solidMat(top(l).lerp(C('#ffffff'), 0.2), l)));
  const lc = heart ? PALETTE.pink : l.colors[2] && l.shape !== 'long' ? l.colors[2] : PALETTE.yellow;
  const em = glowMat(heart ? PALETTE.pink : l.shape === 'long' ? PALETTE.yellow : lc, 1.3);
  if (heart) {
    const h = new THREE.Mesh(new THREE.ExtrudeGeometry(heartShape(0.05 * k), { depth: 0.03 * k, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 3, curveSegments: 16 }), em);
    h.geometry.translate(0, 0, -0.015 * k);
    h.position.copy(end).add(V(0, -0.045 * k, 0));
    g.add(h);
  } else {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05 * k, 24, 16), em);
    bulb.position.copy(end).add(V(0.01, -0.03 * k, 0));
    g.add(bulb);
  }
  // 은은한 빛무리(투명 구)
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.09 * k, 20, 14), glowMat(heart ? PALETTE.pink : PALETTE.yellow, 0.6, 0.22));
  halo.position.copy(end).add(V(0.01, -0.035 * k, 0));
  g.add(halo);
}

function frill(g: THREE.Group, l: FishLook, A: Anchors, heart: boolean) {
  const r = Math.max(A.h, A.w) * 1.2;
  const f = new THREE.Mesh(new THREE.CircleGeometry(r, 32, 0, Math.PI), finMat(acc(l), l));
  f.position.copy(A.brow).add(V(-0.08, -A.h * 0.4, 0));
  f.rotation.y = Math.PI / 2;
  g.add(f);
  if (heart) {
    const h = new THREE.Mesh(new THREE.ShapeGeometry(heartShape(r * 0.25)), solidMat(PALETTE.pink));
    h.position.copy(f.position).add(V(-0.004, r * 0.45, 0));
    h.rotation.y = -Math.PI / 2;
    g.add(h);
  }
}

// ───────────────── 종 장식 ─────────────────
type DecoFn = PartFn;

const DECO: Partial<Record<string, DecoFn>> = {
  'cloud-fin': (g, _l, A) => {
    const m = solidMat(PALETTE.white, undefined, { roughness: 0.8 });
    const S = surfOf(A);
    for (const [t, a, r] of [[0.55, 0, 0.05], [0.42, 0.1, 0.04], [0.3, 0.2, 0.035], [0.62, 1.9, 0.035], [0.62, -1.9, 0.035]] as const) {
      const p = S(t, a, 0.02).p;
      g.add(ellipsoidMesh(r, r * 0.8, r, m, p.x, p.y, p.z, 14));
    }
  },
  'galaxy-tail': (g, _l, A) => {
    for (let i = 0; i < 7; i++) {
      const s = starMesh(0.018 + 0.012 * hash(i, 1), MAT.star);
      s.position.copy(A.tail).add(V(-0.08 - 0.25 * hash(i, 2), (hash(i, 3) - 0.5) * 0.4, 0.02 * (i % 2 ? 1 : -1)));
      g.add(s);
    }
  },
  // 전갈 꼬리: 꼬리 끝이 등 위로 말려 올라와 하트로
  'heart-tail': (g, l, A) => {
    const m = solidMat(top(l), l);
    const b = A.tail.clone();
    const pts = [b, b.clone().add(V(-0.08, 0.12, 0)), b.clone().add(V(-0.02, 0.3, 0)), b.clone().add(V(0.12, 0.36, 0))];
    g.add(tube(pts, 0.035, 0.022, m));
    const h = new THREE.Mesh(new THREE.ExtrudeGeometry(heartShape(0.05), { depth: 0.025, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 16 }), glowMat(PALETTE.pink, 0.6));
    h.position.copy(pts[3]).add(V(0.04, 0.02, -0.012));
    h.rotation.z = -0.6;
    g.add(h);
  },
  // 화살 지느러미: 등에 금 화살촉 + 꼬리 위 깃 두 장
  'arrow-fin': (g, l, A) => {
    if (A.dorsal) A.dorsal.visible = false;
    const tri = new THREE.Shape();
    tri.moveTo(0.14, 0); tri.quadraticCurveTo(0.02, 0.06, -0.02, 0.15); tri.quadraticCurveTo(-0.03, 0.06, -0.1, 0); tri.lineTo(0.14, 0);
    const a = new THREE.Mesh(finGeo(tri, 0.01), MAT.gold);
    a.position.copy(A.back).add(V(0, -0.03, 0));
    g.add(a);
    const fm = finMat(acc(l), l);
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(finGeo(leafShape(0.14, 0.035), 0.004), fm);
      f.position.copy(A.tail).add(V(0.12, 0.05, 0));
      f.rotation.set(s * 0.5, 0, 2.5);
      g.add(f);
    }
  },
  // 실러캔스 다리 지느러미 넷(줄기 + 부채)
  'lobe-fins': (g, l, A) => {
    const S = surfOf(A), m = solidMat(top(l), l), fm = finMat(acc(l).lerp(top(l), 0.5), l);
    for (const t of [0.66, 0.38]) for (const s of [-1, 1]) {
      const at = S(t, s * 2.4, -0.01);
      const end = at.p.clone().addScaledVector(at.n, 0.07).add(V(-0.03, -0.03, 0));
      g.add(tube([at.p, end], 0.022, 0.018, m));
      const f = ellipsoidMesh(0.05, 0.016, 0.04, fm, end.x - 0.03, end.y - 0.01, end.z);
      f.rotation.set(s * 0.4, 0, -0.3);
      g.add(f);
    }
  },
  // 팔짝망둥이 지느러미 발
  'fin-feet': (g, l, A) => {
    const m = solidMat(top(l).lerp(C(PALETTE.beige), 0.3), l);
    for (const s of [-1, 1]) {
      const b = A.belly.clone().lerp(A.nose, 0.35).add(V(0, 0.02, s * A.w * 0.7));
      g.add(tube([b, b.clone().add(V(0.04, -0.06, s * 0.04))], 0.02, 0.016, m));
      g.add(ellipsoidMesh(0.04, 0.014, 0.03, m, b.x + 0.06, b.y - 0.07, b.z + s * 0.045));
    }
  },
  // 아노말로카리스 옆 날개 일곱 장씩
  flaps: (g, l, A) => {
    const S = surfOf(A), fm = finMat(acc(l).lerp(C('#ffffff'), 0.3), l);
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
      const at = S(0.2 + i * 0.09, s * Math.PI / 2, -0.01);
      const f = ellipsoidMesh(0.05, 0.008, 0.06, fm, at.p.x, at.p.y, at.p.z + s * 0.04);
      f.rotation.set(s * 0.25, s * 0.3, 0);
      g.add(f);
    }
  },
  'front-claws': (g, l, A) => {
    const m = solidMat(acc(l), l);
    for (const s of [-1, 1]) {
      const b = A.nose.clone().add(V(-0.02, -0.02, s * 0.05));
      const pts = [b, b.clone().add(V(0.1, -0.02, s * 0.03)), b.clone().add(V(0.16, -0.09, s * 0.04)), b.clone().add(V(0.12, -0.15, s * 0.03))];
      g.add(tube(pts, 0.026, 0.012, m));
      for (let i = 0; i < 4; i++) { const p = pts[1].clone().lerp(pts[3], i / 3); g.add(ellipsoidMesh(0.009, 0.02, 0.009, m, p.x - 0.015, p.y, p.z, 8)); }
    }
  },
  // 뾰로통 눈썹(살짝 안쪽으로 내려간 짧은 먹색 줄)
  pout: (g, _l, A) => {
    if (!A.eyes) return;
    const m = new THREE.MeshStandardMaterial({ color: PALETTE.ink, roughness: 0.6 });
    A.eyes.forEach((e, i) => {
      const b = tube([V(-0.5, 0, 0), V(0.5, 0, 0)].map((v) => v.multiplyScalar(A.eye)), A.eye * 0.09, A.eye * 0.09, m);
      placeDecal(b, e, A.eye * 0.12);
      b.translateY(A.eye * 0.66);
      b.rotateZ(i ? -0.35 : 0.35);
      g.add(b);
    });
  },
  // 앵무고기 부리
  beak: (g, _l, A) => {
    const m = solidMat(PALETTE.cream);
    g.add(ellipsoidMesh(0.05, 0.026, 0.05, m, A.nose.x - 0.005, A.nose.y + 0.018, 0, 16));
    g.add(ellipsoidMesh(0.045, 0.022, 0.045, m, A.nose.x - 0.01, A.nose.y - 0.018, 0, 16));
  },
  // 장님동굴고기: 눈 자리에 반짝이 점
  blind: (g, _l, A) => {
    if (!A.eyes) return;
    for (const e of A.eyes) {
      const s = starMesh(A.eye * 0.32, MAT.star);
      placeDecal(s, e, A.eye * 0.05);
      g.add(s);
    }
  },
  // 나비고기 가짜 눈(꼬리 쪽 먹색 동그라미 + 흰 테)
  eyespot: (g, _l, A) => {
    const S = surfOf(A);
    const ring = new THREE.MeshStandardMaterial({ color: PALETTE.white, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 });
    const dot = new THREE.MeshStandardMaterial({ color: PALETTE.ink, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const s of [-1, 1]) {
      const at = S(0.28, s * Math.PI / 2 * 0.8, 0);
      const r1 = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), ring); decalAt(r1, at, 0.003); g.add(r1);
      const r2 = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), dot); decalAt(r2, at, 0.005); g.add(r2);
    }
  },
  // 웃는가오리: 배 쪽 큰 웃는 입
  'smile-belly': (g, _l, A) => {
    addSmile(g, V(A.nose.x - 0.12, A.belly.y - 0.005, 0), V(0, -1, 0.0001), 0.07);
    for (const s of [-1, 1]) g.add(ellipsoidMesh(0.016, 0.006, 0.016, MAT.mouth, A.nose.x - 0.04, A.belly.y - 0.004, s * 0.07, 10));
  },
  // 대구 빨간 목도리
  scarf: (g, l, A) => {
    const S = surfOf(A), t = 0.72;
    const hy = S(t, 0).p.y, hz = S(t, Math.PI / 2).p.z;
    const m = solidMat(l.colors[2], undefined, { roughness: 0.8 });
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.11, 12, 40), m);
    const x = A.tail.x + (A.nose.x - A.tail.x) * t;
    r.position.set(x, 0, 0);
    r.rotation.y = Math.PI / 2;
    r.scale.set(hz * 1.06, hy * 1.06, 0.32);
    g.add(r);
    const knot = ellipsoidMesh(0.035, 0.03, 0.03, m, x, -hy * 0.5, hz * 0.95); g.add(knot);
    for (const k of [0, 1]) { const tail = ellipsoidMesh(0.025, 0.07, 0.012, m, x - 0.02 - k * 0.03, -hy * 0.5 - 0.07, hz * 0.98); tail.rotation.z = 0.3 + k * 0.3; g.add(tail); }
  },
  // 온천거북 머리 수건
  towel: (g, _l, A) => { g.add(ellipsoidMesh(0.08, 0.025, 0.07, solidMat(PALETTE.white), A.brow.x, A.brow.y + 0.01, 0)); },
  // 둔클레오 철갑: 머리 뒤·위를 덮는 은빛 판 + 턱판 (눈은 판 밖으로 순하게)
  armor: (g, l, A) => {
    const m = new THREE.MeshPhysicalMaterial({ color: PALETTE.silver, metalness: 0.6, roughness: 0.25, clearcoat: 1, emissive: PALETTE.slate, emissiveIntensity: 0.2 });
    const S = surfOf(A);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.45), m);
    const t = 0.7, hy = S(t, 0).p.y, hz = S(t, Math.PI / 2).p.z;
    const x = A.tail.x + (A.nose.x - A.tail.x) * t;
    cap.position.set(x, 0, 0);
    cap.scale.set(0.2, hy * 1.12, hz * 1.12);
    g.add(cap);
    const jaw = ellipsoidMesh(0.16, 0.05, hz * 0.75, m, A.nose.x - 0.12, -hy * 0.7, 0);
    g.add(jaw);
    // 판 이음 리벳
    for (let i = 0; i < 5; i++) { const p = S(0.6 + i * 0.04, 0, 0.012).p; g.add(ellipsoidMesh(0.012, 0.012, 0.012, MAT.gold, p.x, p.y, p.z, 8)); }
    void l;
  },
  // 스카라브 보석
  gem: (g, _l, A) => {
    const m = new THREE.MeshPhysicalMaterial({ color: PALETTE.teal, roughness: 0.1, clearcoat: 1, emissive: PALETTE.teal, emissiveIntensity: 0.35, flatShading: true });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), m);
    gem.position.copy(A.brow).add(V(-0.01, 0.01, 0));
    gem.scale.set(1, 1.2, 0.8);
    g.add(gem);
    const S = surfOf(A);
    for (const s of [-1, 1]) for (const t of [0.5, 0.35]) {
      const at = S(t, s * 1.0, 0);
      const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), m);
      d.position.copy(at.p).addScaledVector(at.n, 0.008);
      g.add(d);
    }
  },
  // 투명한 몸 속 생선뼈(척추 + 갈비 여섯 쌍)
  bones: (g, l, A) => {
    const m = new THREE.MeshStandardMaterial({ color: PALETTE.white, roughness: 0.5, emissive: PALETTE.white, emissiveIntensity: 0.25 });
    const x0 = A.tail.x + 0.1 * A.L, x1 = A.nose.x - 0.18 * A.L;
    g.add(tube([V(x0, 0, 0), V((x0 + x1) / 2, 0.01, 0), V(x1, 0, 0)], 0.012, 0.012, m));
    const S = surfOf(A);
    for (let i = 0; i < 6; i++) {
      const t = 0.3 + i * 0.08, x = A.tail.x + (A.nose.x - A.tail.x) * t;
      const h = S(t, 0).p.y * 0.62;
      for (const s of [1, -1]) g.add(tube([V(x, 0, 0), V(x - 0.02, s * h * 0.6, 0.004), V(x - 0.05, s * h, 0)], 0.006, 0.004, m));
    }
    void l;
  },
  // 이끼메기 등 이끼
  moss: (g, _l, A) => {
    const S = surfOf(A), ms = [solidMat(PALETTE.green, undefined, { roughness: 0.9 }), solidMat(PALETTE.lime, undefined, { roughness: 0.9 })];
    for (let i = 0; i < 14; i++) {
      const at = S(0.3 + 0.45 * hash(i, 1), (hash(i, 2) - 0.5) * 1.4, -0.005);
      const r = 0.02 + 0.02 * hash(i, 3);
      g.add(ellipsoidMesh(r, r * 0.6, r, ms[i % 2], at.p.x, at.p.y, at.p.z, 10));
    }
  },
  // 이끼거북 등 위 작은 숲: 이끼 이불 + 버섯 둘 + 나무 하나 + 풀
  forest: (g, _l, A) => {
    const y = A.back.y;
    g.add(ellipsoidMesh(0.3, 0.05, 0.26, solidMat(PALETTE.green, undefined, { roughness: 0.9 }), 0, y - 0.03, 0));
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.16, 10), solidMat(PALETTE.brown));
    trunk.position.set(-0.05, y + 0.08, -0.04); g.add(trunk);
    const crown = solidMat(PALETTE.lime);
    for (const [x, yy, z, r] of [[-0.05, 0.2, -0.04, 0.08], [-0.1, 0.17, -0.02, 0.055], [0.0, 0.18, -0.07, 0.055]] as const) g.add(ellipsoidMesh(r, r * 0.9, r, crown, x, y + yy, z, 16));
    for (const [x, z, s] of [[0.12, 0.08, 1], [0.05, 0.14, 0.75]] as const) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.016 * s, 0.06 * s, 8), solidMat(PALETTE.cream));
      st.position.set(x, y + 0.03 * s, z); g.add(st);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.04 * s, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), solidMat(PALETTE.red));
      cap.position.set(x, y + 0.055 * s, z); g.add(cap);
      for (let k = 0; k < 3; k++) { const a = k * 2.1; g.add(ellipsoidMesh(0.008 * s, 0.004 * s, 0.008 * s, MAT.white, x + Math.cos(a) * 0.024 * s, y + 0.085 * s, z + Math.sin(a) * 0.024 * s, 8)); }
    }
    const gm = solidMat(PALETTE.lime);
    for (let i = 0; i < 7; i++) { const b = ellipsoidMesh(0.006, 0.04, 0.006, gm, -0.2 + i * 0.05, y + 0.01, 0.15 - (i % 3) * 0.12, 8); b.rotation.z = (i % 2 - 0.5) * 0.5; g.add(b); }
  },
  // 버섯해파리: 갓 위 흰 점 + 짧은 기둥
  cap: (g, _l, A) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3, ph = 0.45 + 0.35 * (i % 2);
      const p = V(Math.sin(ph) * Math.cos(a) * 0.3, Math.cos(ph) * 0.26, Math.sin(ph) * Math.sin(a) * 0.3);
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.032, 16), MAT.white);
      decalAt(d, { p, n: p.clone().normalize() }, 0.004);
      g.add(d);
    }
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 16), solidMat(PALETTE.cream));
    st.position.set(A.center.x, -0.02, 0);
    g.add(st);
  },
  // 물병자리: 항아리 주둥이 + 쏟아지는 빛 물방울
  jar: (g, l, A) => {
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 12, 32), MAT.gold);
    lip.position.set(0, A.back.y + 0.06, 0);
    lip.rotation.x = Math.PI / 2;
    g.add(lip);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.08, 24, 1, true), bodyMat(l, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    neck.position.set(0, A.back.y + 0.02, 0);
    const ng = neck.geometry as THREE.BufferGeometry;
    const cc: number[] = []; for (let i = 0; i < ng.attributes.position.count; i++) { const c = C(l.colors[0]); cc.push(c.r, c.g, c.b); }
    ng.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    g.add(neck);
    const dm = glowMat(l.colors[2], 1.0, 0.8);
    for (let i = 0; i < 3; i++) g.add(ellipsoidMesh(0.022, 0.03, 0.022, dm, 0.12 + i * 0.03, A.back.y + 0.08 - i * 0.07, 0.02, 12));
  },
  // 떡붕어: 밀가루 묻은 듯한 하얀 점 몇 개
  mochi: (g, _l, A) => {
    const S = surfOf(A), m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.3 });
    for (let i = 0; i < 6; i++) { const at = S(0.3 + 0.4 * hash(i, 1), (hash(i, 2) - 0.5) * 1.6, 0); g.add(ellipsoidMesh(0.012, 0.006, 0.012, m, at.p.x, at.p.y + 0.002, at.p.z, 8)); }
  },
  // 떡방아물고기 토끼 귀(흰 + 분홍 안쪽)
  'rabbit-ears': (g, l, A) => {
    const outer = solidMat(l.colors[0]), inner = solidMat(PALETTE.lightPink);
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      e.add(ellipsoidMesh(0.05, 0.17, 0.03, outer, 0, 0.15, 0, 20));
      // 분홍 안쪽은 바깥(±z) 쪽 면에 얇게
      e.add(ellipsoidMesh(0.03, 0.12, 0.008, inner, 0.004, 0.15, s * 0.025, 16));
      e.position.copy(A.brow).add(V(-0.04, -0.01, s * 0.06));
      e.rotation.set(s * 0.25, s * -0.9, 0.35);
      g.add(e);
    }
  },
  // 눈뭉치복어: 위에 작은 눈뭉치 + 나뭇가지 팔
  snowman: (g, l, A) => {
    const r = A.h * 0.42;
    g.add(ellipsoidMesh(r, r, r, solidMat(l.colors[0]), A.back.x - 0.04, A.back.y + r * 0.6, 0, 24));
    const tw = solidMat(PALETTE.brown);
    for (const s of [-1, 1]) { const b = V(A.center.x - 0.05, A.center.y + 0.02, s * A.w * 0.95); g.add(tube([b, b.clone().add(V(-0.04, 0.08, s * 0.08)), b.clone().add(V(-0.03, 0.13, s * 0.1))], 0.01, 0.006, tw)); }
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.62, r * 0.45, 16), solidMat(PALETTE.sky));
    hat.position.set(A.back.x - 0.04, A.back.y + r * 1.62, 0);
    hat.rotation.z = -0.2;
    g.add(hat);
  },
  // 붕어빵: 틀 이음새(진하게 구운 테두리) 한 바퀴
  taiyaki: (g, l, A) => {
    const S = surfOf(A);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) pts.push(S(0.05 + 0.92 * (i / 16), 0, 0.004).p);
    for (let i = 16; i >= 0; i--) pts.push(S(0.05 + 0.92 * (i / 16), Math.PI, 0.004).p);
    const m = solidMat(C(l.colors[2]).lerp(C(l.colors[0]), 0.25), undefined, { roughness: 0.75 });
    const curve = new THREE.CatmullRomCurve3(pts, true);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.026, 10, true), m));
  },
  // 우파루파: 양쪽 깃털 아가미 셋씩 + 짧은 다리 넷
  axolotl: (g, l, A) => {
    const gm = solidMat(l.colors[2]), leg = solidMat(C(l.colors[0]).lerp(C(l.colors[1]), 0.3));
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const b = A.brow.clone().add(V(-0.06, -0.06 + i * 0.05, s * 0.15));
      const end = b.clone().add(V(-0.12, 0.03 + i * 0.04, s * (0.07 + 0.02 * i)));
      g.add(tube([b, b.clone().lerp(end, 0.5).add(V(0, 0.02, 0)), end], 0.012, 0.008, gm));
      for (let k = 0; k < 4; k++) { const p = b.clone().lerp(end, 0.3 + k * 0.2); const f = ellipsoidMesh(0.012, 0.024, 0.008, gm, p.x, p.y + 0.012, p.z, 8); f.rotation.z = 0.5; g.add(f); }
    }
    for (const [x, s] of [[0.12, 1], [0.12, -1], [-0.12, 1], [-0.12, -1]] as const) {
      const b = V(x, -0.12, s * 0.12);
      g.add(tube([b, b.clone().add(V(0.02, -0.06, s * 0.04))], 0.028, 0.022, leg));
      g.add(ellipsoidMesh(0.03, 0.014, 0.026, leg, b.x + 0.025, b.y - 0.07, b.z + s * 0.045, 12));
    }
  },
  // 별자리: 양 옆구리에 금 별 6개 + 이어 주는 금 선(종마다 모양이 다르다)
  stars: (g, _l, A, sp) => {
    const S = surfOf(A);
    const seed = strHash(sp.gdd ?? sp.id) * 100;
    const lineM = glowMat(PALETTE.gold, 0.9);
    for (const side of [-1, 1]) {
      const pts: Pose[] = [];
      for (let i = 0; i < 6; i++) {
        const t = 0.22 + 0.56 * (i / 5) + (hash(seed + i, 1) - 0.5) * 0.08;
        const a = side * (Math.PI / 2 + (hash(seed + i, 2) - 0.5) * 1.4);
        pts.push(S(t, a, 0.006));
      }
      pts.forEach((pp, i) => {
        const s = starMesh((i % 3 === 0 ? 0.03 : 0.022) * Math.max(0.6, A.L), MAT.gold);
        decalAt(s, pp, 0.006);
        g.add(s);
        if (i > 0) {
          // 표면을 따라 휘는 선(가운데를 살짝 띄운다)
          const p0 = pts[i - 1].p, p1 = pp.p;
          const mid = p0.clone().lerp(p1, 0.5).addScaledVector(pts[i - 1].n.clone().add(pp.n).normalize(), 0.012);
          g.add(tube([p0, mid, p1], 0.0045, 0.0045, lineM, V(0, 1, 0), 6));
        }
      });
    }
  },
  // 양자리 말린 뿔
  'curl-horn': (g, _l, A) => {
    const m = MAT.gold;
    for (const s of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const k = i / 10, th = k * Math.PI * 1.6, r = 0.08 * (1 - k * 0.55);
        pts.push(A.brow.clone().add(V(-0.04 - Math.sin(th) * r, -Math.cos(th) * r + 0.06, s * (A.w * 0.65 + k * 0.05))));
      }
      g.add(tube(pts, 0.028, 0.012, m, V(0, 0, 1)));
    }
  },
  horns2: (g, _l, A) => {
    const m = MAT.gold;
    for (const s of [-1, 1]) g.add(hornMesh(A.brow.clone().add(V(-0.01, -0.01, s * Math.max(0.04, A.w * 0.4))), V(0.15, 1, s * 0.55), 0.11, 0.022, m));
  },
  // 사자자리 갈기: 머리 뒤를 빙 둘러싼 금빛 꽃잎
  mane: (g, _l, A) => {
    const S = surfOf(A), t = 0.66, x = A.tail.x + (A.nose.x - A.tail.x) * t;
    const hy = S(t, 0).p.y, hz = S(t, Math.PI / 2).p.z;
    const m = solidMat(PALETTE.gold, undefined, { roughness: 0.6 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const p = V(x - 0.02, Math.cos(a) * hy * 1.05, Math.sin(a) * hz * 1.05);
      const f = ellipsoidMesh(0.03, 0.06, 0.03, m, p.x, p.y, p.z, 12);
      f.quaternion.setFromUnitVectors(V(0, 1, 0), V(-0.4, Math.cos(a), Math.sin(a)).normalize());
      g.add(f);
    }
  },
  // 천칭자리: 등 위 금 저울
  'scale-mark': (g, _l, A) => {
    const y = A.back.y + 0.005, m = MAT.gold;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 8), m);
    bar.rotation.x = Math.PI / 2; bar.position.set(0, y + 0.01, 0); g.add(bar);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), m);
    post.rotation.z = Math.PI / 2; post.position.set(-0.04, y + 0.01, 0); g.add(post);
    for (const s of [-1, 1]) { const pan = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 24), m); pan.rotation.x = Math.PI / 2; pan.position.set(0.02, y + 0.012, s * 0.13); g.add(pan); }
  },
  'heart-core': (g, l, A) => {
    const h = new THREE.Mesh(new THREE.ExtrudeGeometry(heartShape(0.04), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 16 }), glowMat(l.colors[2], 0.9));
    h.position.copy(A.center).add(V(0.0, -0.01, -0.015));
    h.rotation.y = Math.PI / 2;
    g.add(h);
  },
  cerata: (g, l, A) => {
    const m = solidMat(l.colors[2]);
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 10), m);
      c.position.set(A.brow.x - 0.08 - i * 0.06, A.back.y + 0.03, (i % 2 - 0.5) * 0.06);
      g.add(c);
      g.add(ellipsoidMesh(0.016, 0.016, 0.016, m, c.position.x, c.position.y + 0.05, c.position.z, 8));
    }
  },
  cephalic: (g, l, A) => {
    for (const k of [1, -1]) { const c = ellipsoidMesh(0.08, 0.02, 0.03, solidMat(l.colors[0]), A.nose.x + 0.01, A.nose.y, 0.1 * k); c.rotation.y = 0.5 * k; g.add(c); }
  },
  // 블랙홀개복치: 빛나는 보라 고리 + 어두운 원반
  'glow-ring': (g, l, A) => {
    const r = Math.max(A.h, A.L * 0.5) * 1.1;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 12, 64), glowMat(l.colors[2], 1.4));
    ring.position.copy(A.center);
    ring.rotation.y = Math.PI / 2 - 0.2;
    g.add(ring);
    const disc = new THREE.Mesh(new THREE.RingGeometry(r * 1.05, r * 1.4, 64), glowMat(PALETTE.lavender, 0.8, 0.35));
    (disc.material as THREE.Material).side = THREE.DoubleSide;
    disc.position.copy(A.center);
    disc.rotation.set(Math.PI / 2 - 0.45, 0, 0.25);
    g.add(disc);
  },
};

/** 파츠(GDD 0.4) → 장식(FishDeco) 순서로 붙인다. 몸형이 직접 처리하는 건 여기서 건너뛴다 */
export function applyParts(g: THREE.Group, look: FishLook, A: Anchors, sp: FishSpecies) {
  for (const p of look.parts ?? []) PART[p]?.(g, look, A, sp);
  for (const d of look.deco ?? []) DECO[d]?.(g, look, A, sp);
}

/** 몸형(또는 파츠)이 직접 그리는 장식(여기 DECO 에 없는 것) — 테스트가 '안 그려지는 장식이 없나' 확인용 */
export const BODY_DECO = new Set([
  'whisker-flower', 'clear-tail', 'petal-tail', 'color-tail', 'sleepy', 'brows', 'teeth', 'big-smile', 'top-eyes', 'meteor-shell', 'crater-shell', 'flat-shell',
  'bumpy', 'curl-wings', 'trilobe', 'melty', 'long-body', 'long-ball', 'long-spikes', 'urchin', 'candy-tips', 'twin', 'twin-ribbon', 'upside-down',
]);
/** 이 장식을 그리는 곳이 있나 */
export const hasDeco = (d: string) => d in DECO || BODY_DECO.has(d);
export const hasPart = (p: string) => p in PART;
