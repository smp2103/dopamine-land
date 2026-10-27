// economy wave 4 모델 — 두근두근 캡슐머신 · 찰랑 해변 가게(파라솔 노점 + 소라게 점원) · 땅에 내려놓은 꾸러미.
// 모두 코드로 만든 둥근 덩어리(GDD 7.1). 지오메트리는 모듈 전역에서 공유(userData.shared = true) — 청크를 버려도 dispose 안 함.
// 얼굴은 core/art 의 addEyes(볼터치 포함) 하나로(GDD 7.2).
import * as THREE from 'three';
import { addEyes, blobShadow, breathe } from '../../core/art';

const shared = <G extends THREE.BufferGeometry>(g: G): G => { g.userData.shared = true; return g; };
const G = {
  sphere: shared(new THREE.SphereGeometry(1, 28, 18)),
  half: shared(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)),
  cyl: shared(new THREE.CylinderGeometry(1, 1, 1, 24)),
  cone: shared(new THREE.ConeGeometry(1, 1, 24)),
  torus: shared(new THREE.TorusGeometry(1, 0.28, 12, 28)),
  capsule: shared(new THREE.CapsuleGeometry(0.5, 1, 8, 16)),
  smile: shared(new THREE.TorusGeometry(0.035, 0.011, 8, 16, Math.PI)),
  /** 파라솔 갓 조각 8장 */
  shade: Array.from({ length: 8 }, (_, k) => shared(new THREE.ConeGeometry(1.6, 0.6, 6, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4))),
};
/** 파라솔 천(양면) */
const shadeMats = ['#ff9fb8', '#fff8e8'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide }));
const mats = new Map<string, THREE.MeshStandardMaterial>();
/** 색마다 하나(공유) */
const mat = (c: string, o: { rough?: number; metal?: number; opacity?: number; emissive?: string } = {}) => {
  const k = `${c}|${o.rough ?? 0.55}|${o.metal ?? 0}|${o.opacity ?? 1}|${o.emissive ?? ''}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: c, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0 });
    if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = 0.35; }
    mats.set(k, m);
  }
  return m;
};
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, shadow = true) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
};

/** 캡슐 공 색(유리 돔 안) */
const BALL = ['#ff9fb8', '#8fd3ff', '#ffe08a', '#b9f0a8', '#d9c8ff', '#ffc88a'];

/**
 * 두근두근 캡슐머신 — 통통한 분홍 몸통 + 유리 돔(캡슐 공 가득) + 노란 손잡이 + 배출구, 몸통에 눈·볼.
 * 높이 약 1.9 m. root.userData.animate(t) 로 숨쉬기·손잡이 까딱.
 */
export function buildCapsuleMachine(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'econ-capsule-machine';
  const body = new THREE.Group();
  root.add(body);
  // 받침(둥근 발 4)
  for (const [x, z] of [[-0.32, -0.26], [0.32, -0.26], [-0.32, 0.26], [0.32, 0.26]]) body.add(mesh(G.sphere, mat('#ffd36b'), x, 0.08, z, 0.12, 0.09, 0.12));
  // 몸통: 둥근 통(캡슐)
  body.add(mesh(G.capsule, mat('#ff9fb8'), 0, 0.62, 0, 0.92, 0.5, 0.78));
  // 배 띠
  body.add(mesh(G.torus, mat('#fff3c4'), 0, 0.46, 0, 0.47, 0.41, 0.3).rotateX(Math.PI / 2));
  // 얼굴 판(앞)
  const face = new THREE.Group();
  face.position.set(0, 0.74, 0.38);
  body.add(face);
  addEyes(face, { size: 0.1, y: 0.04, z: 0.02, gap: 0.2 });
  // 입(작은 미소 — 반원 튜브)
  const smile = mesh(G.smile, mat('#7a4a5a'), 0, -0.05, 0.025, 1, 1, 1, false);
  smile.rotation.z = Math.PI;
  face.add(smile);
  // 배출구(아래 앞)
  body.add(mesh(G.sphere, mat('#7a5a8a', { rough: 0.8 }), 0, 0.27, 0.36, 0.12, 0.08, 0.06, false));
  body.add(mesh(G.torus, mat('#ffd36b'), 0, 0.27, 0.36, 0.13, 0.09, 0.14, false));
  // 손잡이(오른쪽 옆, 동그란 노란 손잡이)
  const crank = new THREE.Group();
  crank.position.set(0.47, 0.6, 0.05);
  crank.add(mesh(G.cyl, mat('#fff3c4'), 0.04, 0, 0, 0.06, 0.08, 0.06).rotateZ(Math.PI / 2));
  crank.add(mesh(G.capsule, mat('#ffcf4a'), 0.09, 0.1, 0, 0.05, 0.16, 0.05));
  crank.add(mesh(G.sphere, mat('#ff7a9a'), 0.09, 0.22, 0, 0.07));
  body.add(crank);
  // 머리: 유리 돔 + 안의 캡슐 공 + 꼭대기 별
  const dome = new THREE.Group();
  dome.position.set(0, 1.08, 0);
  body.add(dome);
  dome.add(mesh(G.cyl, mat('#ffd36b'), 0, 0, 0, 0.42, 0.08, 0.42));
  const balls = new THREE.Group();
  let i = 0;
  for (let ly = 0; ly < 3; ly++) {
    const rr = 0.27 - ly * 0.08, cnt = 7 - ly * 2;
    for (let k = 0; k < cnt; k++) {
      const a = (k / cnt) * Math.PI * 2 + ly * 0.5;
      const c = BALL[i++ % BALL.length];
      const b = new THREE.Group();
      b.position.set(Math.cos(a) * rr, 0.1 + ly * 0.12, Math.sin(a) * rr);
      b.add(mesh(G.half, mat(c), 0, 0, 0, 0.085, 0.085, 0.085, false));
      b.add(mesh(G.half, mat('#ffffff', { rough: 0.3 }), 0, 0, 0, 0.085, 0.085, 0.085, false).rotateX(Math.PI));
      b.rotation.set(a, a * 0.7, 0);
      balls.add(b);
    }
  }
  dome.add(balls);
  const glass = mesh(G.sphere, mat('#e9fbff', { opacity: 0.32, rough: 0.08 }), 0, 0.2, 0, 0.4, 0.38, 0.4, false);
  glass.renderOrder = 3;
  dome.add(glass);
  dome.add(mesh(G.sphere, mat('#ffffff', { opacity: 0.7, rough: 0.1 }), -0.17, 0.38, 0.22, 0.05, 0.08, 0.03, false));
  const star = mesh(G.sphere, mat('#ffe08a', { emissive: '#ffcf4a' }), 0, 0.62, 0, 0.09);
  dome.add(star);
  dome.add(mesh(G.cyl, mat('#ffd36b'), 0, 0.55, 0, 0.03, 0.08, 0.03));
  // 앞 간판(작은 둥근 판, '캡슐' 느낌의 반반 색)
  const sign = new THREE.Group();
  sign.position.set(0, 1.0, 0.44);
  sign.add(mesh(G.cyl, mat('#fff8e8'), 0, 0, 0, 0.16, 0.03, 0.16, false).rotateX(Math.PI / 2));
  sign.add(mesh(G.half, mat('#ff7a9a'), 0, 0, 0.02, 0.07, 0.07, 0.04, false).rotateZ(Math.PI / 2));
  sign.add(mesh(G.half, mat('#8fd3ff'), 0, 0, 0.02, 0.07, 0.07, 0.04, false).rotateZ(-Math.PI / 2));
  body.add(sign);
  root.add(blobShadow(0.7));
  const phase = 0.37;
  root.userData.animate = (t: number) => {
    breathe(body, t, phase);
    crank.rotation.x = Math.sin(t * 1.4) * 0.25;
    balls.rotation.y = t * 0.15;
    star.position.y = 0.62 + Math.sin(t * 2.2) * 0.02;
  };
  return root;
}

/**
 * 찰랑 해변 가게 — 줄무늬 파라솔 + 둥근 나무 계산대 + 소라게 점원(분홍 소라 껍데기 + 눈·볼 + 집게 둘).
 * root.userData.animate(t) 로 점원이 숨쉬고 집게를 흔든다.
 */
export function buildBeachStall(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'econ-beach-stall';
  // 계산대: 둥근 통 2 + 상판
  const counter = new THREE.Group();
  counter.position.set(0, 0, 0.6);
  // 가로로 누운 통통한 알약 모양 몸통(길이 2.2 m · 높이 0.8 m) + 크림색 상판
  counter.add(mesh(G.capsule, mat('#e9b48f'), 0, 0.42, 0, 0.8, 1.1, 0.6).rotateZ(Math.PI / 2));
  counter.add(mesh(G.cyl, mat('#fff3c4'), 0, 0.84, 0, 1.15, 0.08, 0.42));
  // 상판 위 상품: 튜브·조개·선글라스 공
  counter.add(mesh(G.torus, mat('#ffe08a'), -0.55, 0.92, 0, 0.16, 0.16, 0.16).rotateX(Math.PI / 2));
  counter.add(mesh(G.sphere, mat('#ffc9dc'), 0.05, 0.92, 0.05, 0.1, 0.07, 0.1));
  counter.add(mesh(G.sphere, mat('#8fd3ff'), 0.5, 0.92, -0.02, 0.12, 0.09, 0.12));
  root.add(counter);
  // 파라솔: 기둥 + 줄무늬 갓(원뿔 조각 8장)
  const pole = mesh(G.cyl, mat('#fff8e8'), 1.25, 1.3, -0.2, 0.05, 2.6, 0.05);
  root.add(pole);
  const shade = new THREE.Group();
  shade.position.set(1.25, 2.55, -0.2);
  shade.rotation.z = 0.12;
  for (let k = 0; k < 8; k++) {
    const seg = new THREE.Mesh(G.shade[k], shadeMats[k % 2]);
    seg.castShadow = true;
    shade.add(seg);
  }
  shade.add(mesh(G.sphere, mat('#ffd36b'), 0, 0.34, 0, 0.09));
  root.add(shade);
  // 소라게 점원(계산대 뒤)
  const crab = new THREE.Group();
  // 계산대 뒤 둥근 받침에 올라서 있다(머리가 상판 위로 보이게)
  crab.position.set(0.15, 0.42, -0.25);
  root.add(mesh(G.cyl, mat('#c99a6b'), 0.15, 0.21, -0.3, 0.32, 0.42, 0.32));
  const shell = new THREE.Group();
  shell.position.set(0, 0.62, -0.12);
  shell.add(mesh(G.sphere, mat('#ffb3c8'), 0, 0, 0, 0.36, 0.34, 0.32));
  shell.add(mesh(G.torus, mat('#ffd9e6'), 0, 0.02, 0, 0.26, 0.26, 0.3).rotateY(Math.PI / 2));
  shell.add(mesh(G.cone, mat('#ffc9dc'), 0, 0.38, -0.04, 0.16, 0.32, 0.16));
  crab.add(shell);
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.2);
  head.add(mesh(G.sphere, mat('#ff9f8a'), 0, 0, 0, 0.22, 0.2, 0.18));
  // 눈자루 끝에 눈
  for (const sx of [-1, 1]) head.add(mesh(G.capsule, mat('#ff9f8a'), sx * 0.08, 0.17, 0.02, 0.05, 0.1, 0.05));
  const face = new THREE.Group();
  face.position.set(0, 0.03, 0.16);
  head.add(face);
  addEyes(face, { size: 0.08, gap: 0.15 });
  crab.add(head);
  const claws: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const c = new THREE.Group();
    c.position.set(sx * 0.26, 0.58, 0.28);
    c.add(mesh(G.sphere, mat('#ff8f7a'), 0, 0, 0, 0.09, 0.11, 0.08));
    c.add(mesh(G.sphere, mat('#ff8f7a'), sx * 0.03, 0.1, 0.02, 0.05, 0.07, 0.05));
    crab.add(c);
    claws.push(c);
  }
  root.add(crab);
  root.add(blobShadow(1.4));
  root.userData.animate = (t: number) => {
    breathe(crab, t, 0.71);
    claws.forEach((c, k) => { c.rotation.z = Math.sin(t * 3 + k * Math.PI) * 0.35; });
  };
  return root;
}

/** 땅에 내려놓은 꾸러미 — 통통한 보따리(아이템 색) + 리본 매듭 */
export function buildDropBundle(color: string): THREE.Group {
  const root = new THREE.Group();
  root.add(mesh(G.sphere, mat(color), 0, 0.17, 0, 0.22, 0.17, 0.22));
  root.add(mesh(G.sphere, mat(color), 0, 0.34, 0, 0.09, 0.07, 0.09));
  root.add(mesh(G.torus, mat('#ff9fb8'), 0, 0.3, 0, 0.09, 0.09, 0.09).rotateX(Math.PI / 2));
  root.add(mesh(G.sphere, mat('#ff9fb8'), 0.08, 0.33, 0.05, 0.05, 0.035, 0.04));
  root.add(mesh(G.sphere, mat('#ff9fb8'), -0.08, 0.33, 0.05, 0.05, 0.035, 0.04));
  root.add(blobShadow(0.28));
  return root;
}
