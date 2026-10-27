// garden 모델 — 꽃(새싹·봉오리·튤립·해바라기·장미·들꽃)·사과나무·민들레·클로버·풀 숲·큰 바위·회전초를 코드로.
// 지오메트리·재질은 모듈 전역에서 한 번만 만들어 공유(userData.shared = true → 청크가 버릴 때 dispose 안 함).
// 색은 정점색으로 칠하고, 꽃잎처럼 송이마다 다른 색은 InstancedMesh 의 instanceColor 로 곱한다(꽃잎은 흰 정점색).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rngFor } from '../../core/rng';

// ───────────── 칠하기·합치기 ─────────────
const tmp = new THREE.Color();
/** 지오메트리 전체에 한 색(배열이면 아래→위 그라디언트) */
function paint(g: THREE.BufferGeometry, c: string | [string, string]): THREE.BufferGeometry {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  g.computeBoundingBox();
  const bb = g.boundingBox!, h = Math.max(1e-4, bb.max.y - bb.min.y);
  const a = new THREE.Color(Array.isArray(c) ? c[0] : c), b = new THREE.Color(Array.isArray(c) ? c[1] : c);
  for (let i = 0; i < p.count; i++) {
    tmp.copy(a).lerp(b, (p.getY(i) - bb.min.y) / h);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const _o = new THREE.Object3D();
/** 조각 놓기: 위치·회전(오일러)·크기 */
function place(g: THREE.BufferGeometry, p: [number, number, number], r: [number, number, number] = [0, 0, 0], s: number | [number, number, number] = 1): THREE.BufferGeometry {
  _o.position.set(...p);
  _o.rotation.set(...r);
  if (typeof s === 'number') _o.scale.setScalar(s); else _o.scale.set(...s);
  _o.updateMatrix();
  return g.applyMatrix4(_o.matrix);
}
/** 색칠한 조각들을 하나로(인덱스 없는 것으로 맞춘다) */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => {
    const q = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') q.deleteAttribute(k);
    return q;
  });
  const m = mergeGeometries(flat, false)!;
  m.computeBoundingSphere();
  m.userData.shared = true;
  return m;
}
const sph = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

// ───────────── 재질(공유) ─────────────
let mats: { plant: THREE.MeshStandardMaterial; rock: THREE.MeshStandardMaterial; glint: THREE.MeshStandardMaterial; fluff: THREE.MeshStandardMaterial } | null = null;
export function materials() {
  if (mats) return mats;
  mats = {
    plant: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, side: THREE.DoubleSide }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
    glint: new THREE.MeshStandardMaterial({ color: '#fff3b0', emissive: new THREE.Color('#ffd34d'), emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.2 }),
    fluff: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.08 }),
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}

// ───────────── 꽃밭 ─────────────
/** 줄기 높이(단위 지오메트리는 0.42 m — 종류별로 y 를 늘린다) */
export const STEM_H = 0.42;
export const STEM_SCALE: Readonly<Record<'tulip' | 'sunflower' | 'rose' | 'wild', number>> = { tulip: 1.2, sunflower: 1.9, rose: 1.25, wild: 0.75 };
/** 꽃송이 크기(통통하게 — 플레이어 무릎께) */
export const HEAD_SCALE: Readonly<Record<'tulip' | 'sunflower' | 'rose' | 'wild' | 'bud', number>> = { tulip: 1.55, sunflower: 1.3, rose: 1.5, wild: 1.5, bud: 1.4 };

export type GeoKey =
  | 'soil' | 'sprout' | 'stem' | 'bud' | 'tulip' | 'sunflower' | 'rose' | 'wild' | 'sapling' | 'tree' | 'apple' | 'glint'
  | 'dandelion' | 'dandelionBlown' | 'clover3' | 'clover4' | 'tuft' | 'boulder' | 'tumble' | 'shard';
const cache = new Map<GeoKey, THREE.BufferGeometry>();
export function geo(k: GeoKey): THREE.BufferGeometry {
  let g = cache.get(k);
  if (!g) { g = MAKERS[k](); g.userData.shared = true; cache.set(k, g); }
  return g;
}

const MAKERS: Record<GeoKey, () => THREE.BufferGeometry> = {
  // 흙 둔덕(물 먹으면 instanceColor 로 짙게)
  soil: () => {
    const dome = paint(place(new THREE.SphereGeometry(0.31, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, -0.01, 0], [0, 0, 0], [1, 0.3, 1]), ['#b07a58', '#c99572']);
    const r = rngFor('garden:soil');
    const pebbles = [0, 1, 2].map((i) => paint(place(sph(0.035, 8, 6), [Math.cos(i * 2.1 + r()) * 0.23, 0.035, Math.sin(i * 2.1 + r()) * 0.23], [0, 0, 0], [1, 0.6, 1]), '#e7d8c8'));
    return merge([dome, ...pebbles]);
  },
  // 새싹: 동그란 떡잎 두 장
  sprout: () => merge([
    paint(place(cyl(0.012, 0.016, 0.13, 6), [0, 0.065, 0]), '#79c95f'),
    paint(place(sph(0.05, 10, 8), [0.045, 0.13, 0], [0, 0, -0.5], [1, 0.32, 0.72]), ['#7fd36b', '#b4ee93']),
    paint(place(sph(0.05, 10, 8), [-0.045, 0.13, 0], [0, 0, 0.5], [1, 0.32, 0.72]), ['#7fd36b', '#b4ee93']),
  ]),
  // 줄기 + 잎 두 장(높이 STEM_H, 종류별로 y 를 늘린다)
  stem: () => merge([
    paint(place(cyl(0.016, 0.021, STEM_H, 8), [0, STEM_H / 2, 0]), ['#5fb553', '#7fd06a']),
    paint(place(sph(0.07, 10, 8), [0.055, 0.1, 0], [0, 0, -0.75], [1, 0.26, 0.42]), ['#6cc35a', '#9ee283']),
    paint(place(sph(0.065, 10, 8), [-0.05, 0.17, 0.01], [0, 0.3, 0.8], [1, 0.26, 0.42]), ['#6cc35a', '#9ee283']),
  ]),
  // 꽃봉오리(흰 정점색 → 꽃 색으로 곱한다)
  bud: () => merge([paint(place(sph(0.05, 12, 10), [0, 0.035, 0], [0, 0, 0], [1, 1.45, 1]), ['#e6e6e6', '#ffffff'])]),
  // 튤립: 잔 모양 꽃잎 6장(안 3 · 밖 3)
  tulip: () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + (i % 2) * 0.3, inner = i % 2 === 0;
      const rr = inner ? 0.03 : 0.042, lean = inner ? 0.12 : 0.24;
      const g = paint(sph(0.062, 12, 10), ['#e9e9e9', '#ffffff']);
      place(g, [0, 0, 0], [0, 0, 0], [0.62, 1.18, 0.4]);
      // 바깥으로 살짝 기울여 둥근 잔
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(-lean));
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.06, rr));
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
      parts.push(g);
    }
    return merge(parts);
  },
  // 해바라기: 갈색 씨판 + 꽃잎 14장, 옆을 보게 기울임
  sunflower: () => {
    const parts: THREE.BufferGeometry[] = [paint(place(cyl(0.085, 0.09, 0.035, 18), [0, 0, 0]), '#8a5a34'),
      paint(place(sph(0.07, 14, 8), [0, 0.016, 0], [0, 0, 0], [1, 0.25, 1]), '#6e4527')];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const g = paint(sph(0.05, 10, 8), ['#f2f2f2', '#ffffff']);
      place(g, [0, 0, 0], [0, 0, 0], [1.75, 0.24, 0.62]);
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(0.13, -0.004 * (i % 2), 0));
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
      parts.push(g);
    }
    const m = merge(parts);
    m.applyMatrix4(new THREE.Matrix4().makeRotationX(1.05));
    m.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.05, 0.02));
    m.computeBoundingSphere();
    return m;
  },
  // 장미: 가운데 봉오리 + 두 겹 꽃잎
  rose: () => {
    const parts: THREE.BufferGeometry[] = [paint(place(sph(0.038, 12, 10), [0, 0.06, 0], [0, 0, 0], [1, 1.15, 1]), ['#e4e4e4', '#ffffff'])];
    const ring = (n: number, r: number, rr: number, lean: number, y: number, sc: [number, number, number], off: number) => {
      for (let i = 0; i < n; i++) {
        const g = paint(sph(r, 12, 9), ['#dcdcdc', '#ffffff']);
        place(g, [0, 0, 0], [0, 0, 0], sc);
        g.applyMatrix4(new THREE.Matrix4().makeRotationX(-lean));
        g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, y, rr));
        g.applyMatrix4(new THREE.Matrix4().makeRotationY((i / n) * Math.PI * 2 + off));
        parts.push(g);
      }
    };
    ring(5, 0.046, 0.032, 0.35, 0.052, [0.95, 0.85, 0.42], 0);
    ring(7, 0.056, 0.058, 0.85, 0.042, [1, 0.7, 0.38], 0.4);
    return merge(parts);
  },
  // 들꽃(데이지): 노란 가운데 + 꽃잎 9장
  wild: () => {
    const parts: THREE.BufferGeometry[] = [paint(place(sph(0.026, 10, 8), [0, 0.012, 0], [0, 0, 0], [1, 0.55, 1]), '#ffd84a')];
    for (let i = 0; i < 9; i++) {
      const g = paint(sph(0.03, 8, 6), '#ffffff');
      place(g, [0, 0, 0], [0, 0, 0], [1.6, 0.22, 0.55]);
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(0.046, 0.01, 0));
      g.applyMatrix4(new THREE.Matrix4().makeRotationY((i / 9) * Math.PI * 2));
      parts.push(g);
    }
    const m = merge(parts);
    m.applyMatrix4(new THREE.Matrix4().makeRotationX(0.35));
    return m;
  },
  // 사과 묘목(단계마다 크기를 키운다)
  sapling: () => merge([
    paint(place(cyl(0.024, 0.034, 0.5, 8), [0, 0.25, 0]), ['#9a6b47', '#b88560']),
    paint(place(sph(0.19, 14, 10), [0, 0.58, 0]), ['#77cf66', '#b7ef98']),
    paint(place(sph(0.12, 12, 8), [0.14, 0.5, 0.05]), ['#77cf66', '#a9e88c']),
    paint(place(sph(0.11, 12, 8), [-0.13, 0.52, -0.04]), ['#77cf66', '#a9e88c']),
  ]),
  // 열매 나무: 통통한 줄기 + 몽실몽실 잎 구름
  tree: () => merge([
    paint(place(cyl(0.13, 0.2, 1.55, 12), [0, 0.775, 0]), ['#94643f', '#b98660']),
    paint(place(cyl(0.05, 0.07, 0.5, 8), [0.25, 1.35, 0], [0, 0, -0.9]), '#a8774f'),
    paint(place(sph(0.95, 20, 14), [0, 2.1, 0]), ['#62bd5e', '#a6e78c']),
    paint(place(sph(0.62, 16, 12), [0.62, 1.86, 0.22]), ['#62bd5e', '#9ee286']),
    paint(place(sph(0.66, 16, 12), [-0.58, 1.92, -0.18]), ['#62bd5e', '#9ee286']),
    paint(place(sph(0.55, 16, 12), [0.08, 2.62, -0.1]), ['#7ccc68', '#b9ef9e']),
    paint(place(sph(0.5, 14, 10), [-0.1, 1.95, 0.62]), ['#62bd5e', '#9ee286']),
  ]),
  // 사과: 빨간 공 + 꼭지 + 잎
  apple: () => merge([
    paint(place(sph(0.1, 14, 12), [0, 0, 0], [0, 0, 0], [1, 0.92, 1]), ['#ff4f55', '#ff7a6e']),
    paint(place(cyl(0.008, 0.01, 0.06, 5), [0, 0.11, 0], [0, 0, 0.2]), '#7a5233'),
    paint(place(sph(0.03, 8, 6), [0.035, 0.12, 0], [0, 0, -0.7], [1.4, 0.3, 0.7]), '#6cc35a'),
  ]),
  // 황금장미 위 반짝이(팔면체)
  glint: () => { const g = new THREE.OctahedronGeometry(0.05, 0); g.scale(1, 1.6, 1); return g; },

  // ── 들판 ──
  // 민들레: 잎 로제트 + 줄기 + 솜털 공
  dandelion: () => {
    const parts = rosette();
    parts.push(paint(place(cyl(0.009, 0.012, 0.3, 6), [0, 0.15, 0]), ['#6fbf58', '#9bd67f']));
    parts.push(paint(place(new THREE.IcosahedronGeometry(0.078, 2), [0, 0.34, 0]), ['#f4f4ef', '#ffffff']));
    parts.push(paint(place(sph(0.022, 8, 6), [0, 0.3, 0]), '#d9e8c0'));
    return merge(parts);
  },
  dandelionBlown: () => {
    const parts = rosette();
    parts.push(paint(place(cyl(0.009, 0.012, 0.3, 6), [0, 0.15, 0]), ['#6fbf58', '#9bd67f']));
    parts.push(paint(place(sph(0.02, 8, 6), [0, 0.305, 0]), '#a9d98a'));
    return merge(parts);
  },
  clover3: () => cloverGeo(3),
  clover4: () => cloverGeo(4),
  // 풀 숲(장식): 가는 잎 5장
  tuft: () => {
    const r = rngFor('garden:tuft');
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const h = 0.14 + r() * 0.08, a = (i / 5) * Math.PI * 2 + r();
      const g = paint(new THREE.ConeGeometry(0.018, h, 4), ['#79c95f', '#b8ee98']);
      g.translate(0, h / 2, 0);
      g.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.25 + r() * 0.25));
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
      parts.push(g);
    }
    return merge(parts);
  },
  // 큰 바위: 울퉁불퉁 둥근 바위 + 꼭대기 이끼 + 조약돌(지름 ≈ 3 m)
  boulder: () => {
    // 정점을 합쳐야 둥글게(부드러운 법선) 보인다
    const ico = new THREE.IcosahedronGeometry(1, 4);
    ico.deleteAttribute('uv'); ico.deleteAttribute('normal');
    const g = mergeVertices(ico, 1e-4);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 1 + 0.07 * Math.sin(v.x * 4.1 + v.z * 2.3) + 0.05 * Math.sin(v.y * 5.7 + v.x * 1.9) + 0.035 * Math.sin((v.x + v.y + v.z) * 9.1);
      v.multiplyScalar(n);
      v.set(v.x * 1.18, v.y * 0.86, v.z * 1.05);
      if (v.y < -0.45) v.y = -0.45 + (v.y + 0.45) * 0.25; // 바닥은 평평하게
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    const col = new Float32Array(p.count * 3);
    const rock = new THREE.Color('#cdc5dc'), rockDark = new THREE.Color('#aea6c4'), moss = new THREE.Color('#98d482'), speck = new THREE.Color('#e6e0f0');
    for (let i = 0; i < p.count; i++) {
      const ny = nrm.getY(i), y = p.getY(i);
      tmp.copy(rockDark).lerp(rock, Math.min(1, Math.max(0, (y + 0.45) / 1.1)));
      if (Math.sin(p.getX(i) * 13.3 + p.getZ(i) * 7.7) > 0.93) tmp.copy(speck);
      const m = Math.min(1, Math.max(0, (ny - 0.62) * 3.2)) * (0.75 + 0.25 * Math.sin(p.getX(i) * 6 + p.getZ(i) * 5));
      tmp.lerp(moss, m);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.translate(0, 0.45, 0);
    const peb = [[1.25, 0.1, 0.4, 0.22], [-0.9, 0.08, 0.95, 0.16], [0.3, 0.07, -1.2, 0.14]].map(([x, y, z, r]) => paint(place(new THREE.IcosahedronGeometry(r, 1), [x, y, z], [0, 0, 0], [1, 0.7, 1]), '#c3bcd3'));
    return merge([g, ...peb]);
  },
  // 회전초: 마른 가지 고리 여러 겹 + 안쪽 잔가지
  tumble: () => {
    const r = rngFor('garden:tumble-geo');
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 10; i++) {
      const g = paint(new THREE.TorusGeometry(0.42 + r() * 0.12, 0.022, 4, 20), i % 2 ? '#d8b98a' : '#c9a473');
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI)));
      parts.push(g);
    }
    for (let i = 0; i < 8; i++) {
      const g = paint(cyl(0.012, 0.016, 0.62, 4), '#b8915f');
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI)));
      parts.push(g);
    }
    return merge(parts);
  },
  // 바위 부서진 조각
  shard: () => merge([paint(new THREE.IcosahedronGeometry(0.22, 0), ['#b7afcb', '#d8d1e6'])]),
};

/** 민들레 잎 로제트(바닥에 납작) */
function rosette(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const g = paint(sph(0.07, 6, 4), '#7ccc63');
    place(g, [0, 0, 0], [0, 0, 0], [1.25, 0.12, 0.36]);
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(0.07, 0.012, 0));
    g.applyMatrix4(new THREE.Matrix4().makeRotationY((i / 5) * Math.PI * 2 + 0.3));
    out.push(g);
  }
  return out;
}
/** 클로버 한 줄기: 하트 잎 n 장(네잎은 더 맑은 초록) */
function cloverGeo(n: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [paint(place(cyl(0.006, 0.008, 0.09, 4), [0, 0.045, 0]), '#5fae55')];
  const c: [string, string] = n === 4 ? ['#58c95e', '#9cf08c'] : ['#4faf55', '#86d67c'];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // 하트 = 작은 공 둘
    for (const s of [-1, 1]) {
      const g = paint(sph(0.026, 6, 4), c);
      place(g, [0, 0, 0], [0, 0, 0], [1, 0.22, 1]);
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(0.034, 0.092, s * 0.014));
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
      parts.push(g);
    }
  }
  return merge(parts);
}

// ───────────── 인스턴스 묶음 ─────────────
export interface Inst { m: THREE.Matrix4; color?: THREE.Color }
/** 같은 지오메트리 여러 개 → InstancedMesh 하나(빈 목록이면 null) */
export function instanced(k: GeoKey, mat: THREE.Material, list: Inst[], o: { shadow?: boolean; receive?: boolean; name?: string } = {}): THREE.InstancedMesh | null {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(geo(k), mat, list.length);
  mesh.name = o.name ?? `garden-${k}`;
  const tinted = list.some((q) => q.color);
  list.forEach((q, i) => {
    mesh.setMatrixAt(i, q.m);
    if (tinted) mesh.setColorAt(i, q.color ?? WHITE);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = o.shadow ?? false;
  mesh.receiveShadow = o.receive ?? true;
  mesh.computeBoundingSphere();
  return mesh;
}
const WHITE = new THREE.Color(1, 1, 1);

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
/** 자리·돌림·크기 → 행렬(sway 가 있으면 바닥을 축으로 살짝 기울임) */
export function mat4(x: number, y: number, z: number, rotY: number, s: number | [number, number, number], swayX = 0, swayZ = 0, out = new THREE.Matrix4()): THREE.Matrix4 {
  _e.set(swayX, rotY, swayZ, 'XYZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  if (typeof s === 'number') _s.setScalar(s); else _s.set(s[0], s[1], s[2]);
  return out.compose(_p, _q, _s);
}

/** 작은 점 입자(홀씨·물방울) — 만든 쪽이 매 프레임 위치를 바꾼다 */
export function points(n: number, color: string, size: number): THREE.Points {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 1, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}
