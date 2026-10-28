// 스튜디오 무대: 파스텔 사이클로라마(바닥이 벽으로 둥글게 이어지는 사진관 배경) · 게임 풀밭 · 게임 컷용 소품 몇 개.
// 색은 core/palette 에서. 소품 배치는 시드 난수(rngFor) — 같은 URL 이면 같은 그림.
import * as THREE from 'three';
import { PALETTE } from '../core/palette';
import { rngFor } from '../core/rng';

const SHARED = (g: THREE.BufferGeometry) => { g.userData.shared = true; return g; };

/** 사이클로라마: 반지름 12 m 평평한 바닥 → 반지름 5 m 곡면 → 높이 22 m 벽(한 바퀴, 어느 각도에서도 배경 — 줄 세우기 16 m 도 바닥 위) */
export function cyclorama(): THREE.Mesh {
  const pts: THREE.Vector2[] = [];
  for (let r = 0; r <= 12; r += 0.5) pts.push(new THREE.Vector2(r, 0));
  for (let i = 1; i <= 18; i++) { const a = (i / 18) * Math.PI / 2; pts.push(new THREE.Vector2(12 + 5 * Math.sin(a), 5 - 5 * Math.cos(a))); }
  for (let y = 7; y <= 22; y += 3) pts.push(new THREE.Vector2(17, y));
  const g = new THREE.LatheGeometry(pts, 96);
  // 높이 따라 바닥(따뜻한 크림) → 벽(연보라 하늘빛)
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const floor = new THREE.Color('#f7efe6'), mid = new THREE.Color('#f3e6f2'), top = new THREE.Color('#dfe9fb'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = THREE.MathUtils.smoothstep(y, 0, 5);
    c.copy(floor).lerp(mid, k).lerp(top, THREE.MathUtils.smoothstep(y, 4, 16));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
  m.name = 'studio-cyclorama';
  m.receiveShadow = true;
  m.userData.noCull = true;
  return m;
}

/** 값 잡음(격자 해시 보간) — 풀밭 얼룩 */
function vnoise(x: number, z: number, seed: number): number {
  const h = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(i, j), h(i + 1, j), u), THREE.MathUtils.lerp(h(i, j + 1), h(i + 1, j + 1), u), v);
}

/** 게임 풀밭: 얼룩진 초록 원판(반지름 70 m) + 발 근처 풀잎 */
export function grass(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'studio-grass';
  const geo = new THREE.CircleGeometry(70, 160, 0, Math.PI * 2);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(PALETTE.grassDark), b = new THREE.Color(PALETTE.grass), l = new THREE.Color(PALETTE.grassLight), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = vnoise(x * 0.18, z * 0.18, 1) * 0.65 + vnoise(x * 0.6, z * 0.6, 2) * 0.35;
    c.copy(a).lerp(b, THREE.MathUtils.smoothstep(n, 0.2, 0.55)).lerp(l, THREE.MathUtils.smoothstep(n, 0.62, 0.9) * 0.6);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  ground.receiveShadow = true;
  ground.userData.noCull = true;
  g.add(ground);
  // 풀잎: 납작한 원뿔 InstancedMesh 하나
  const blade = new THREE.ConeGeometry(0.03, 0.13, 4, 1);
  blade.translate(0, 0.065, 0);
  const bladeMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.85 });
  const N = 1800;
  const inst = new THREE.InstancedMesh(blade, bladeMat, N);
  const rnd = rngFor('studio:blades');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const tint = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const r = 0.5 + Math.sqrt(rnd()) * 14, th = rnd() * Math.PI * 2;
    p.set(Math.cos(th) * r, 0, Math.sin(th) * r);
    e.set((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5);
    q.setFromEuler(e);
    const k = 0.6 + rnd() * 0.9;
    s.set(k, k * (0.7 + rnd() * 0.6), k);
    inst.setMatrixAt(i, m4.compose(p, q, s));
    inst.setColorAt(i, tint.copy(b).lerp(l, 0.2 + rnd() * 0.6));
  }
  inst.receiveShadow = true;
  g.add(inst);
  return g;
}

function propMats() {
  return {
    trunk: new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 0.8 }),
    leaf: new THREE.MeshPhysicalMaterial({ color: PALETTE.leaf, roughness: 0.7, sheen: 0.6, sheenColor: new THREE.Color(PALETTE.grassLight) }),
    leafDark: new THREE.MeshPhysicalMaterial({ color: PALETTE.leafDark, roughness: 0.75, sheen: 0.5 }),
    rock: new THREE.MeshStandardMaterial({ color: '#c9c2bb', roughness: 0.75 }),
    wood: new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.7 }),
    petals: [PALETTE.pink, '#fff3a8', '#ffffff', '#c9b2ff'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })),
    center: new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.5 }),
  };
}

function shade<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
}

/** 게임 컷 소품: 둥근 나무 · 덤불 · 꽃 · 바위 · 울타리 — 캐릭터 둘레 3~14 m */
export function props(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'studio-props';
  const M = propMats();
  const rnd = rngFor('studio:props');
  const sphere = SHARED(new THREE.SphereGeometry(1, 28, 18));
  const tree = (x: number, z: number, s: number) => {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(SHARED(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 14)), M.trunk);
    trunk.position.y = 0.8;
    t.add(trunk);
    for (const [dx, dy, dz, r, mat] of [[0, 2.1, 0, 1.05, M.leaf], [0.55, 1.75, 0.2, 0.7, M.leafDark], [-0.5, 1.8, -0.15, 0.75, M.leaf], [0.1, 2.7, -0.1, 0.65, M.leaf]] as const) {
      const b = new THREE.Mesh(sphere, mat);
      b.position.set(dx, dy, dz);
      b.scale.setScalar(r);
      t.add(b);
    }
    t.position.set(x, 0, z);
    t.scale.setScalar(s);
    g.add(shade(t));
  };
  const bush = (x: number, z: number, s: number) => {
    const b = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(sphere, i === 1 ? M.leafDark : M.leaf);
      m.position.set((i - 1) * 0.35, 0.3 + (i === 1 ? 0.08 : 0), (rnd() - 0.5) * 0.2);
      m.scale.set(0.42, 0.36, 0.4);
      b.add(m);
    }
    b.position.set(x, 0, z);
    b.scale.setScalar(s);
    b.rotation.y = rnd() * Math.PI;
    g.add(shade(b));
  };
  const flower = (x: number, z: number) => {
    const f = new THREE.Group();
    const stem = new THREE.Mesh(SHARED(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6)), M.leafDark);
    stem.position.y = 0.11;
    f.add(stem);
    const pm = M.petals[Math.floor(rnd() * M.petals.length)];
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(sphere, pm);
      const a = (i / 5) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.045, 0.23, Math.sin(a) * 0.045);
      p.scale.set(0.04, 0.015, 0.04);
      f.add(p);
    }
    const c = new THREE.Mesh(sphere, M.center);
    c.position.y = 0.235;
    c.scale.setScalar(0.025);
    f.add(c);
    f.position.set(x, 0, z);
    g.add(f);
  };
  // 캐릭터 앞(카메라 반대쪽 -z) 과 옆에 — 게임 카메라가 등 뒤에서 보면 앞쪽 풍경이 보인다
  tree(-4.2, -6.5, 1.1); tree(5.5, -9, 1.3); tree(-9, -12, 1.5); tree(9.5, 3, 1.2); tree(-7, 5.5, 1);
  bush(2.4, -3.2, 1); bush(-2.6, -2.2, 0.85); bush(4.2, 1.5, 0.9);
  for (let i = 0; i < 26; i++) {
    const r = 1.6 + rnd() * 5, a = rnd() * Math.PI * 2;
    flower(Math.cos(a) * r, Math.sin(a) * r);
  }
  const rock = new THREE.Mesh(sphere, M.rock);
  rock.scale.set(0.55, 0.34, 0.45);
  rock.position.set(-1.6, 0.12, -4.4);
  g.add(shade(rock));
  // 울타리 한 토막
  const fence = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const post = new THREE.Mesh(SHARED(new THREE.BoxGeometry(0.1, 0.62, 0.1)), M.wood);
    post.position.set(i * 0.7, 0.31, 0);
    fence.add(post);
  }
  for (const y of [0.22, 0.46]) {
    const rail = new THREE.Mesh(SHARED(new THREE.BoxGeometry(2.9, 0.07, 0.05)), M.wood);
    rail.position.set(1.4, y, 0);
    fence.add(rail);
  }
  fence.position.set(-5.5, 0, -1.5);
  fence.rotation.y = 0.5;
  g.add(shade(fence));
  // 위 좌표는 '앞 = -z' 로 적었다 — 캐릭터 정면은 +z, 게임 카메라는 등 뒤(-z)라서 반 바퀴 돌려 캐릭터 너머에 둔다
  g.rotation.y = Math.PI;
  return g;
}

/** 실루엣 재질(검정, 그림자·빛 무시) — 줄 세우기 실루엣 시트 */
export const SIL_MAT = new THREE.MeshBasicMaterial({ color: '#1d1a24' });
