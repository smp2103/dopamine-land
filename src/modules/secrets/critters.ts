// secrets 친구들 — 얼음 속 아기 매머드 · 요정 · 늪 오두막 개구리 · 나무 방 부엉이 인형 · 달토끼 인형 · 거품동굴 꽃게.
// 모두 art.ts 눈(세로 타원 + 하이라이트 2) + 볼터치. 몸은 Builder 로 굽고 움직이는 부분만 따로 둔다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addEyes, blobShadow, breathe, type EyeSet } from '../../core/art';
import { Builder, G, col, glowMat, kitMats } from './kit';

export interface Critter {
  root: THREE.Group;
  /** t = 초, k = 연출 세기(0..1, 기본 1) */
  animate(t: number, k?: number): void;
}

/** 머리 묶음(눈을 붙일 자리) */
function head(parent: THREE.Object3D, at: [number, number, number], r: number, eye: number, o: { lift?: number; gap?: number } = {}) {
  const h = new THREE.Group();
  h.position.set(...at);
  parent.add(h);
  const set = addEyes(h, { size: eye, head: { r }, lift: o.lift ?? 0.12, gap: o.gap });
  mergeBlush(h, set);
  return h;
}
/** 볼터치 둘(같은 재질)을 메시 하나로 — 그리기 하나 덜기 */
function mergeBlush(h: THREE.Object3D, set: EyeSet) {
  if (set.blush.length < 2) return;
  const parts = set.blush.map((b) => { b.updateMatrix(); return b.geometry.clone().applyMatrix4(b.matrix); });
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) return;
  const first = set.blush[0];
  const m = new THREE.Mesh(geo, first.material);
  m.name = 'blush';
  m.renderOrder = first.renderOrder;
  for (const b of set.blush) h.remove(b);
  h.add(m);
  set.blush = [m];
}

// ───────────── 털뭉치 아기 매머드 ─────────────
/** 키 ≈ 1.5 m. 통통한 몸 + 털 뭉치 + 짧은 다리 + 말랑 코 + 작은 상아 */
export function babyMammoth(phase = 0): Critter & { trunk: THREE.Group; body: THREE.Group } {
  const root = new THREE.Group();
  root.name = 'secrets-mammoth';
  const body = new THREE.Group();
  root.add(body);
  const B = new Builder();
  const fur = '#b78560', furL = '#d3a27a', furD = '#9c6c4c', cream = '#fff3dc';
  B.add(G.sphere(), 'soft', fur, [0, 0.82, -0.05], [1.35, 1.15, 1.55]);
  // 털 뭉치(등·옆구리)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    B.add(G.sphere(), 'soft', i % 2 ? furL : fur, [Math.cos(a) * 0.55, 1.12 + Math.sin(i * 1.7) * 0.08, -0.1 + Math.sin(a) * 0.62], 0.42);
  }
  B.add(G.sphere(), 'soft', furL, [0, 1.42, -0.15], [0.7, 0.32, 0.8]);
  // 다리 4(짧고 통통) + 발톱 크림
  for (const [x, z] of [[-0.38, 0.42], [0.38, 0.42], [-0.38, -0.5], [0.38, -0.5]] as const) {
    B.add(G.cyl(14), 'soft', furD, [x, 0.24, z], [0.36, 0.5, 0.36]);
    B.add(G.sphere(), 'matte', cream, [x, 0.04, z + 0.1], [0.32, 0.12, 0.2]);
  }
  // 꼬리 털술
  B.add(G.sphere(), 'soft', furD, [0, 0.95, -0.85], 0.2);
  // 머리 + 귀
  B.add(G.sphere(), 'soft', fur, [0, 1.25, 0.62], [0.92, 0.86, 0.85]);
  B.add(G.sphere(), 'soft', furL, [0, 1.66, 0.52], [0.5, 0.3, 0.45]);
  for (const s of [-1, 1]) {
    B.add(G.sphere(), 'soft', furD, [s * 0.5, 1.28, 0.42], [0.18, 0.5, 0.42], [0, s * 0.4, 0]);
    B.add(G.sphere(), 'soft', '#e9b4a0', [s * 0.53, 1.28, 0.46], [0.08, 0.34, 0.28], [0, s * 0.4, 0]);
    // 작은 상아(크림, 둥근 끝)
    B.add(G.capsule(), 'gloss', cream, [s * 0.2, 0.95, 0.95], [0.08, 0.12, 0.08], [0.9, 0, s * -0.2]);
  }
  body.add(B.bake('mammoth-body'));
  const h = head(body, [0, 1.3, 0.7], 0.43, 0.15, { lift: 0.18, gap: 0.27 });
  void h;
  // 말랑 코(마디 넷 — 꼬리처럼 살랑)
  const trunk = new THREE.Group();
  trunk.position.set(0, 1.1, 1.02);
  body.add(trunk);
  const T = new Builder();
  for (let i = 0; i < 5; i++) T.add(G.sphere(), 'soft', i % 2 ? fur : furL, [0, -i * 0.13, i * 0.05 + (i > 2 ? (i - 2) * 0.07 : 0)], 0.24 - i * 0.025);
  T.add(G.sphere(), 'matte', '#e9b4a0', [0, -0.6, 0.32], [0.14, 0.1, 0.1]);
  trunk.add(T.bake('mammoth-trunk', { shadow: false }));
  const sh = blobShadow(0.95);
  sh.position.y = 0.02;
  root.add(sh);
  return {
    root, body, trunk,
    animate(t, k = 1) {
      breathe(body, t, phase);
      trunk.rotation.x = Math.sin(t * 2.1 + phase) * 0.25 * k - 0.15;
      trunk.rotation.z = Math.sin(t * 1.3 + phase) * 0.12 * k;
    },
  };
}

// ───────────── 요정 ─────────────
/** 손바닥만 한 빛 요정(꽃잎 날개 4 + 동그란 얼굴 + 빛 무리) */
export function fairy(color: string, phase = 0): Critter {
  const root = new THREE.Group();
  root.name = 'secrets-fairy';
  // 몸은 재질 하나로(요정이 여럿 춤춰도 그리기가 적게)
  const B = new Builder();
  B.add(G.sphere(), 'gloss', '#fff4ea', [0, 0.22, 0], 0.22);
  B.add(G.cone(12), 'gloss', color, [0, 0.04, 0], [0.22, 0.24, 0.22]);
  B.add(G.sphere(), 'gloss', '#fff7c2', [0, 0.36, -0.02], [0.24, 0.08, 0.24]);
  root.add(B.bake('fairy-body', { shadow: false }));
  head(root, [0, 0.22, 0], 0.11, 0.05, { gap: 0.07 });
  const wings = new THREE.Group();
  const W = new Builder();
  for (const s of [-1, 1]) {
    W.add(G.sphere(), 'glass', color, [s * 0.13, 0.26, -0.06], [0.2, 0.02, 0.12], [0, 0, s * 0.5]);
    W.add(G.sphere(), 'glass', '#ffffff', [s * 0.1, 0.16, -0.06], [0.13, 0.02, 0.08], [0, 0, s * -0.4]);
  }
  wings.add(W.bake('fairy-wings', { shadow: false }));
  root.add(wings);
  const aura = new THREE.Mesh(G.sphereLo(), glowMat(color, 0.28));
  aura.scale.setScalar(0.5);
  aura.position.y = 0.2;
  root.add(aura);
  return {
    root,
    animate(t, k = 1) {
      wings.scale.x = 0.7 + Math.abs(Math.sin(t * 18 + phase)) * 0.45;
      aura.scale.setScalar((0.42 + Math.sin(t * 3 + phase) * 0.06) * Math.max(0.2, k));
    },
  };
}

/**
 * 요정 떼 — 여럿이 춤춰도 부분마다 InstancedMesh 하나(몸·치마·날개·빛 무리·눈 L/R·볼터치 = 7번 그리기).
 * set(i, x, y, z, rotY, scale, t) 로 한 마리씩 놓고 flush() 로 올린다. 색은 instanceColor.
 */
export function fairySwarm(colors: string[]): { root: THREE.Group; set(i: number, x: number, y: number, z: number, rotY: number, s: number, t: number): void; flush(): void } {
  const n = colors.length;
  const root = new THREE.Group();
  root.name = 'secrets-fairies-swarm';
  const M = kitMats();
  const geoOf = (f: (b: Builder) => void) => { const b = new Builder(); f(b); return b.bakeGeometry()!; };
  const body = geoOf((b) => {
    b.add(G.sphere(), 'gloss', '#fff4ea', [0, 0.22, 0], 0.22);
    b.add(G.sphere(), 'gloss', '#fff7c2', [0, 0.36, -0.02], [0.24, 0.08, 0.24]);
  });
  const dress = geoOf((b) => b.add(G.cone(12), 'gloss', '#ffffff', [0, 0.04, 0], [0.22, 0.24, 0.22]));
  const wing = geoOf((b) => {
    for (const s of [-1, 1]) {
      b.add(G.sphere(), 'glass', '#ffffff', [s * 0.13, 0.26, -0.06], [0.2, 0.02, 0.12], [0, 0, s * 0.5]);
      b.add(G.sphere(), 'glass', '#ffffff', [s * 0.1, 0.16, -0.06], [0.13, 0.02, 0.08], [0, 0, s * -0.4]);
    }
  });
  type Part = { mesh: THREE.InstancedMesh; local: THREE.Matrix4; kind: 'still' | 'wing' | 'aura' };
  const parts: Part[] = [];
  const sphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 5);
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, kind: Part['kind'], tint: boolean, local = new THREE.Matrix4(), order = 0) => {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.boundingSphere = sphere.clone();
    mesh.renderOrder = order;
    if (tint) colors.forEach((c, i) => mesh.setColorAt(i, col(c)));
    root.add(mesh);
    parts.push({ mesh, local, kind });
  };
  part(body, M.gloss, 'still', false);
  part(dress, M.gloss, 'still', true);
  part(wing, M.glass, 'wing', true, undefined, 3);
  part(G.sphereLo(), glowMat('#ffffff', 0.28), 'aura', true);
  // 눈·볼터치: art.ts 눈을 한 번 달아 보고 그 자리·재질을 떼 지어 쓴다
  const tpl = new THREE.Group();
  const h = head(tpl, [0, 0.22, 0], 0.11, 0.05, { gap: 0.07 });
  h.updateMatrix();
  for (const c of [...h.children]) {
    const m = c as THREE.Mesh;
    if (!m.isMesh) continue;
    m.updateMatrix();
    part(m.geometry, m.material as THREE.Material, 'still', false, h.matrix.clone().multiply(m.matrix), m.renderOrder);
  }
  const F = new THREE.Matrix4(), X = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  return {
    root,
    set(i, x, y, z, rotY, s, t) {
      const ph = i * 1.6;
      F.compose(v.set(x, y, z), q.setFromAxisAngle(up, rotY), sc.setScalar(s));
      for (const p of parts) {
        if (p.kind === 'wing') X.makeScale(0.7 + Math.abs(Math.sin(t * 18 + ph)) * 0.45, 1, 1).premultiply(F).multiply(p.local);
        else if (p.kind === 'aura') X.compose(v.set(0, 0.2, 0), q.identity(), sc.setScalar(0.42 + Math.sin(t * 3 + ph) * 0.06)).premultiply(F);
        else X.multiplyMatrices(F, p.local);
        p.mesh.setMatrixAt(i, X);
      }
    },
    flush() { for (const p of parts) p.mesh.instanceMatrix.needsUpdate = true; },
  };
}

// ───────────── 개구리 아줌마(늪 오두막 주인 인형) ─────────────
export function frogFriend(phase = 0): Critter {
  const root = new THREE.Group();
  root.name = 'secrets-frog';
  const body = new THREE.Group();
  root.add(body);
  const B = new Builder();
  const g1 = '#8fd88a', g2 = '#c6f0a8';
  B.add(G.sphere(), 'gloss', g1, [0, 0.38, 0], [0.8, 0.62, 0.7]);
  B.add(G.sphere(), 'gloss', g2, [0, 0.32, 0.18], [0.56, 0.44, 0.4]);
  for (const s of [-1, 1]) {
    B.add(G.sphere(), 'gloss', g1, [s * 0.2, 0.7, 0.12], 0.26);
    B.add(G.sphere(), 'gloss', g1, [s * 0.34, 0.08, 0.18], [0.3, 0.12, 0.34]);
  }
  // 꽃 모자(분홍)
  B.add(G.cyl(16), 'soft', '#ff9fc0', [0, 0.84, 0], [0.5, 0.06, 0.5]);
  B.add(G.sphere(), 'soft', '#ffc2d6', [0, 0.9, 0], [0.3, 0.2, 0.3]);
  B.add(G.sphere(), 'glow', '#fff0a8', [0.16, 0.93, 0.12], 0.08);
  body.add(B.bake('frog-body'));
  // 눈은 두 눈 혹 앞에(머리 구를 크게 잡아 혹 표면에 닿게)
  head(body, [0, 0.62, 0.02], 0.36, 0.13, { gap: 0.4, lift: 0.3 });
  const sh = blobShadow(0.45); sh.position.y = 0.01; root.add(sh);
  return { root, animate(t) { breathe(body, t, phase); } };
}

// ───────────── 부엉이 인형(나무 방) ─────────────
export function owlPlush(phase = 0): Critter {
  const root = new THREE.Group();
  root.name = 'secrets-owl';
  const body = new THREE.Group();
  root.add(body);
  const B = new Builder();
  const br = '#c99a6e', cr = '#fff0d8';
  B.add(G.sphere(), 'soft', br, [0, 0.42, 0], [0.7, 0.8, 0.62]);
  B.add(G.sphere(), 'soft', cr, [0, 0.36, 0.16], [0.46, 0.56, 0.34]);
  for (const s of [-1, 1]) {
    B.add(G.cone(10), 'soft', br, [s * 0.2, 0.86, 0], [0.12, 0.2, 0.12], [0, 0, s * -0.3]);
    B.add(G.sphere(), 'soft', '#b4865c', [s * 0.34, 0.4, -0.02], [0.14, 0.42, 0.34], [0, 0, s * 0.2]);
    B.add(G.sphere(), 'matte', '#ffc76a', [s * 0.1, 0.04, 0.14], [0.14, 0.06, 0.18]);
  }
  B.add(G.cone(8), 'gloss', '#ffb347', [0, 0.52, 0.32], [0.08, 0.12, 0.08], [Math.PI, 0, 0]);
  body.add(B.bake('owl-body'));
  head(body, [0, 0.6, 0.02], 0.3, 0.12, { gap: 0.2 });
  return { root, animate(t) { breathe(body, t, phase); } };
}

// ───────────── 달토끼 인형(달 관측대) ─────────────
export function moonBunny(phase = 0): Critter {
  const root = new THREE.Group();
  root.name = 'secrets-bunny';
  const body = new THREE.Group();
  root.add(body);
  const B = new Builder();
  const w = '#fffaf2', p = '#ffd3e0';
  B.add(G.sphere(), 'soft', w, [0, 0.3, 0], [0.62, 0.56, 0.56]);
  B.add(G.sphere(), 'soft', w, [0, 0.74, 0.04], [0.56, 0.5, 0.5]);
  for (const s of [-1, 1]) {
    B.add(G.capsule(), 'soft', w, [s * 0.13, 1.18, -0.02], [0.13, 0.26, 0.1], [0, 0, s * -0.15]);
    B.add(G.capsule(), 'soft', p, [s * 0.13, 1.18, 0.03], [0.07, 0.2, 0.04], [0, 0, s * -0.15]);
    B.add(G.sphere(), 'soft', w, [s * 0.18, 0.06, 0.16], [0.2, 0.1, 0.26]);
  }
  B.add(G.sphere(), 'soft', w, [0, 0.24, -0.3], 0.16);
  B.add(G.crescent(), 'glow', '#fff3a8', [0.22, 0.96, 0.1], 0.16, [0, 0, 0.4]);
  B.add(G.sphere(), 'matte', '#ff9fb8', [0, 0.72, 0.29], [0.06, 0.04, 0.04]);
  body.add(B.bake('bunny-body', { shadow: false }));
  head(body, [0, 0.76, 0.06], 0.26, 0.09, { gap: 0.17 });
  return { root, animate(t) { breathe(body, t, phase); } };
}

// ───────────── 꽃게(거품동굴) ─────────────
export function crab(phase = 0): Critter {
  const root = new THREE.Group();
  root.name = 'secrets-crab';
  const body = new THREE.Group();
  root.add(body);
  const B = new Builder();
  const c = '#ff9a8a', cl = '#ffc0b0';
  B.add(G.sphere(), 'gloss', c, [0, 0.16, 0], [0.5, 0.26, 0.38]);
  B.add(G.sphere(), 'gloss', cl, [0, 0.14, 0.1], [0.36, 0.16, 0.2]);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) B.add(G.capsule(), 'gloss', c, [s * 0.26, 0.08, -0.1 + i * 0.1], [0.04, 0.08, 0.04], [0, 0, s * 1.1]);
    B.add(G.sphere(), 'gloss', c, [s * 0.32, 0.22, 0.2], [0.16, 0.14, 0.12]);
    B.add(G.cyl(8), 'gloss', c, [s * 0.09, 0.32, 0.12], [0.04, 0.14, 0.04]);
  }
  body.add(B.bake('crab-body'));
  head(body, [0, 0.42, 0.13], 0.07, 0.08, { gap: 0.18 });
  return {
    root,
    animate(t) {
      breathe(body, t, phase);
      root.position.x = Math.sin(t * 0.9 + phase) * 0.35;
    },
  };
}

// ───────────── 잠든 거인 나무 얼굴 ─────────────
/** 감은 눈(아래로 휜 초승 두 개) + 볼터치 + 쿨쿨 입 — 나무 줄기 앞면(+z) 에 붙인다 */
export function sleepyFace(scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = 'secrets-sleepy-face';
  const B = new Builder();
  for (const s of [-1, 1]) {
    B.add(G.torus(0.22, Math.PI), 'matte', '#5a4060', [s * 0.62, 0, 0], [0.42, 0.42, 0.42], [0, 0, Math.PI]);
    B.add(G.sphere(), 'glow', '#ffb8c8', [s * 0.95, -0.38, -0.02], [0.32, 0.2, 0.06]);
  }
  B.add(G.sphere(), 'matte', '#7a5068', [0, -0.55, 0], [0.18, 0.13, 0.08]);
  g.add(B.bake('face', { shadow: false }));
  g.scale.setScalar(scale);
  return g;
}
