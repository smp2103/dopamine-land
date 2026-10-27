// 돛등이(스피노사우루스) — 늪가에 앉아 낚시하는 대결 상대 모델(GDD 3.7 P1 · 7장 귀여움 규칙, core/art.ts).
//   통통한 청록 몸 + 크림 배, 주황 부채꼴 돛(끝으로 갈수록 복숭아색), 둥근 악어 주둥이에 웃는 입,
//   큰 눈·볼터치(addEyes), 밀짚 낚시 모자, 짧은 팔로 꼭 쥔 분홍 손잡이 낚싯대. 바닥 y=0, 앞 +z.
//   animateSpino(m, t, o) — 숨쉬기(breathe)·꼬리 흔들기·찌 까딱·낚아챔(yank)·기쁜 눈.
import * as THREE from 'three';
import { addEyes, blobShadow, breathe, pastelize, type EyeSet } from '../../core/art';

const C = {
  body: pastelize('#3fc7b4'),
  side: pastelize('#7fdcd2'),
  belly: pastelize('#f2fff8'),
  sail: pastelize('#ffa24c'),
  sailTip: pastelize('#ffd8a8'),
  mark: pastelize('#35ae9e'),
  hat: pastelize('#ffe2a0'),
  ribbon: pastelize('#ff9fb8'),
  rod: pastelize('#d9a066'),
  grip: pastelize('#ff8fa8'),
  nose: pastelize('#2f8f84'),
};

export interface SpinoModel {
  root: THREE.Group;
  /** 몸(숨쉬기) · 꼬리 · 낚싯대(끝 = tip) · 찌 */
  body: THREE.Group;
  tail: THREE.Group;
  rod: THREE.Group;
  tip: THREE.Object3D;
  bobber: THREE.Group;
  line: THREE.Line;
  eyes: EyeSet;
  phase: number;
}

const soft = (color: string, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color('#ffffff'), clearcoat: 0.25, emissive: color, emissiveIntensity: 0.06, ...o });

/** 돛 모양(바탕 = 등뼈 줄 x=0, 바깥 +x, 위 +y) — 둥근 물결 4개 */
function sailGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const y0 = -0.55, y1 = 0.62;
  s.moveTo(0, y0);
  const bumps = 4;
  s.lineTo(0.12, y0);
  for (let i = 0; i < bumps; i++) {
    const k0 = i / bumps, k1 = (i + 1) / bumps;
    const ya = y0 + (y1 - y0) * k0, yb = y0 + (y1 - y0) * k1;
    // 가운데가 가장 높은 부채꼴
    const hx = 0.32 + 0.38 * Math.sin(Math.PI * (k0 + k1) / 2);
    const xb = i === bumps - 1 ? 0.1 : 0.26 + 0.3 * Math.sin(Math.PI * k1);
    s.quadraticCurveTo(hx + 0.1, (ya + yb) / 2, xb, yb);
  }
  s.lineTo(0, y1);
  s.lineTo(0, y0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 4, curveSegments: 14 });
  g.translate(0, 0, -0.035);
  // 바탕 주황 → 끝 복숭아(정점 색)
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(C.sail), b = new THREE.Color(C.sailTip), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.clamp(pos.getX(i) / 0.72, 0, 1);
    c.copy(a).lerp(b, k * k);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function buildSpino(rng: () => number = () => 0.5): SpinoModel {
  const root = new THREE.Group();
  root.name = 'fishing-spino';
  const body = new THREE.Group();
  body.name = 'spino-body';
  root.add(body);
  const mBody = soft(C.body), mSide = soft(C.side), mBelly = soft(C.belly), mMark = soft(C.mark);
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const ball = (r: number, w = 32, h = 24) => new THREE.SphereGeometry(r, w, h);

  // ── 몸통(앉아서 살짝 뒤로 기댄 통통 배) ──
  const torso = new THREE.Group();
  torso.position.set(0, 0.86, 0);
  torso.rotation.x = -0.14;
  body.add(torso);
  add(torso, ball(0.62, 44, 32), mBody, 0, 0, 0, 1, 1.12, 1.02);
  add(torso, ball(0.5, 36, 28), mBelly, 0, -0.04, 0.3, 0.86, 1.02, 0.6);
  // 옆구리 점박이
  for (const [x, y, z, r] of [[0.5, 0.18, -0.05, 0.09], [0.46, -0.12, -0.18, 0.07], [-0.52, 0.1, -0.1, 0.085], [-0.44, -0.2, 0.02, 0.06]] as const) {
    const sp = add(torso, ball(r, 16, 12), mMark, x, y, z, 0.45, 1, 1);
    sp.lookAt(new THREE.Vector3(x * 3, y, z * 3).add(torso.position));
  }

  // ── 돛(등) ──
  const sail = new THREE.Mesh(sailGeometry(), soft('#ffffff', { vertexColors: true, emissive: C.sail, emissiveIntensity: 0.08, sheen: 0.3 }));
  sail.rotation.y = Math.PI / 2; // 바깥(+x) → 뒤(-z)
  sail.position.set(0, 0.12, -0.5);
  sail.castShadow = true;
  torso.add(sail);

  // ── 머리 + 둥근 악어 주둥이 ──
  const head = new THREE.Group();
  head.position.set(0, 1.78, 0.2);
  body.add(head);
  const headR = 0.42;
  add(head, ball(headR, 40, 30), mBody, 0, 0, 0, 1.05, 0.95, 1);
  const snout = add(head, new THREE.CapsuleGeometry(0.19, 0.4, 10, 24), mSide, 0, -0.12, 0.42, 1.2, 1, 0.78);
  snout.rotation.x = Math.PI / 2;
  // 콧구멍 · 웃는 입
  const mNose = soft(C.nose);
  for (const s of [-1, 1]) add(head, ball(0.028, 12, 10), mNose, s * 0.07, -0.02, 0.83, 1, 0.7, 1);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 8, 24, Math.PI), mNose);
  smile.position.set(0, -0.2, 0.72);
  smile.rotation.set(0.35, 0, Math.PI);
  head.add(smile);
  // 머리 볏(작은 돛)
  for (let i = 0; i < 3; i++) add(head, ball(0.07 - i * 0.012, 16, 12), soft(C.sail), 0, 0.36 - i * 0.05, -0.08 - i * 0.12, 0.5, 1, 1);
  const eyes = addEyes(head, { size: 0.17, gap: 0.36, head: { r: headR }, lift: 0.22 });

  // ── 밀짚 낚시 모자 ──
  const hat = new THREE.Group();
  hat.position.set(0, headR * 0.82, -0.04);
  hat.rotation.x = -0.12;
  head.add(hat);
  const mHat = soft(C.hat, { roughness: 0.8 });
  add(hat, new THREE.CylinderGeometry(0.46, 0.5, 0.05, 36), mHat, 0, 0, 0);
  add(hat, new THREE.SphereGeometry(0.27, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), mHat, 0, 0.01, 0, 1, 0.9, 1);
  const band = add(hat, new THREE.TorusGeometry(0.265, 0.035, 10, 32), soft(C.ribbon), 0, 0.06, 0);
  band.rotation.x = Math.PI / 2;
  add(hat, ball(0.06, 14, 10), soft(C.ribbon), 0.2, 0.08, 0.17, 1, 0.8, 0.6);

  // ── 다리(앉음) · 발가락 ──
  for (const s of [-1, 1]) {
    add(body, ball(0.3, 28, 20), mBody, s * 0.4, 0.36, 0.18, 1, 0.9, 1.15);
    const foot = add(body, new THREE.CapsuleGeometry(0.13, 0.22, 8, 16), mSide, s * 0.44, 0.12, 0.5);
    foot.rotation.x = Math.PI / 2;
    for (let k = -1; k <= 1; k++) add(body, ball(0.055, 12, 10), mBelly, s * 0.44 + k * 0.08, 0.1, 0.7);
  }

  // ── 꼬리(뒤로 휘어 바닥에) ──
  const tail = new THREE.Group();
  tail.position.set(0, 0.42, -0.5);
  body.add(tail);
  const tailPts = 7;
  for (let i = 0; i < tailPts; i++) {
    const k = i / (tailPts - 1);
    const r = 0.3 * (1 - k) + 0.07;
    add(tail, ball(r, 24, 18), mBody, Math.sin(k * 1.6) * 0.45 * k, -0.28 * k, -k * 1.3, 1, 0.85, 1.15);
    if (i > 0 && i < tailPts - 1) add(tail, ball(r * 0.45, 12, 10), soft(C.sail), Math.sin(k * 1.6) * 0.45 * k, -0.28 * k + r * 0.82, -k * 1.3, 0.45, 1, 1);
  }

  // ── 팔 + 낚싯대 ──
  const rod = new THREE.Group();
  rod.position.set(0, 1.02, 0.62);
  rod.rotation.x = 0.95; // 앞으로 기울여 든다(+y 가 늪 쪽 앞 위로)
  body.add(rod);
  const mRod = soft(C.rod, { roughness: 0.5 });
  add(rod, new THREE.CylinderGeometry(0.018, 0.035, 2.1, 12), mRod, 0, 1.05, 0);
  add(rod, new THREE.CapsuleGeometry(0.05, 0.32, 8, 14), soft(C.grip), 0, 0.05, 0);
  const reel = add(rod, new THREE.CylinderGeometry(0.08, 0.08, 0.06, 20), soft('#fff2c8', { metalness: 0.5, roughness: 0.3 }), 0.07, 0.3, 0);
  reel.rotation.z = Math.PI / 2;
  const tip = new THREE.Object3D();
  tip.position.set(0, 2.1, 0);
  rod.add(tip);
  for (const s of [-1, 1]) {
    const arm = add(body, new THREE.CapsuleGeometry(0.075, 0.26, 8, 14), mBody, s * 0.32, 1.2, 0.48);
    arm.rotation.set(1.1, 0, -s * 0.35);
    add(body, ball(0.085, 16, 12), mSide, s * 0.1, 1.04, 0.66);
  }

  // ── 찌 · 줄(늪 쪽으로) ──
  const bobber = new THREE.Group();
  const mRed = soft('#ff5a6a', { clearcoat: 1, roughness: 0.3 }), mWhite = soft('#ffffff', { clearcoat: 1, roughness: 0.3 });
  bobber.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mRed));
  bobber.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mWhite));
  bobber.position.set(0, 0.05, 3.6);
  root.add(bobber);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }));
  line.frustumCulled = false;
  root.add(line);

  root.add(blobShadow(1.05));
  return { root, body, tail, rod, tip, bobber, line, eyes, phase: rng() };
}

const _tip = new THREE.Vector3();
const _bob = new THREE.Vector3();
const _p = new THREE.Vector3();
/**
 * 매 프레임. waterY = 찌가 뜰 수면 높이(root 기준 y), yank 0..1 = 낚아채는 중, happy = 기쁜 눈.
 */
export function animateSpino(m: SpinoModel, t: number, o: { waterY?: number; yank?: number; happy?: boolean } = {}) {
  breathe(m.body, t, m.phase);
  const yank = THREE.MathUtils.clamp(o.yank ?? 0, 0, 1);
  m.tail.rotation.y = 0.18 * Math.sin(t * 1.3 + m.phase * 6);
  m.rod.rotation.x = 0.95 - 0.75 * Math.sin(yank * Math.PI) + 0.03 * Math.sin(t * 2.1);
  m.eyes.setHappy(!!o.happy);
  // 찌: 수면에서 까딱, 낚아채면 줄이 당겨 올라온다
  const wy = o.waterY ?? 0.05;
  m.bobber.position.set(0.05 * Math.sin(t * 0.7), wy + 0.03 * Math.sin(t * 2.4 + 1) + yank * 1.2, 3.6 - yank * 1.6);
  m.root.updateMatrixWorld(true);
  m.tip.getWorldPosition(_tip);
  m.root.worldToLocal(_tip);
  _bob.copy(m.bobber.position); _bob.y += 0.12;
  const pa = m.line.geometry.attributes.position as THREE.BufferAttribute;
  const n = pa.count;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    _p.copy(_tip).lerp(_bob, k);
    _p.y -= Math.sin(k * Math.PI) * 0.35 * (1 - yank);
    pa.setXYZ(i, _p.x, _p.y, _p.z);
  }
  pa.needsUpdate = true;
}

/** 다 쓴 모델 정리(공유 재질·지오메트리는 남긴다) */
export function disposeSpino(m: SpinoModel) {
  m.root.removeFromParent();
  m.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh && !(o as THREE.Line).isLine) return;
    if (!mesh.geometry?.userData?.shared) mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mt of mats) if (mt && !mt.userData?.shared) mt.dispose();
  });
}

/** 팔레트(테스트 — 순한 파스텔인지) */
export const SPINO_COLORS = C;
