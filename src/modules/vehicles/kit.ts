// 탈것 공용 도구: 통통한 지오메트리·정점색 그라디언트·재질·부품 합치기(재질별 한 메시 → draw call 절약).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export type MK = 'paint' | 'soft' | 'matte' | 'rubber' | 'metal' | 'glass' | 'wood' | 'glow' | 'eye' | 'shine' | 'flame';

let MATS: Record<MK, THREE.Material> | null = null;

/** 공유 재질(모듈 전역, 한 번만 만든다) */
export function mats(): Record<MK, THREE.Material> {
  if (MATS) return MATS;
  const phys = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0, ...o });
  MATS = {
    // 장난감 같은 반질한 도장(클리어코트)
    paint: phys({ roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.28, sheen: 0.25, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.6 }),
    // 보송한 천(풍선·돛·방석)
    soft: phys({ roughness: 0.78, sheen: 1.0, sheenColor: new THREE.Color('#fff4fa'), sheenRoughness: 0.45 }),
    matte: phys({ roughness: 0.7, sheen: 0.4, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.6 }),
    rubber: phys({ roughness: 0.82 }),
    metal: phys({ roughness: 0.26, metalness: 0.55, clearcoat: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#bfeaff', roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.55, emissive: '#5fb8e8', emissiveIntensity: 0.12 }),
    wood: phys({ roughness: 0.8 }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: '#fff1c4', emissiveIntensity: 0.9 }),
    eye: new THREE.MeshPhysicalMaterial({ color: '#3d3a4a', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    shine: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, emissive: '#ffffff', emissiveIntensity: 0.85 }),
    flame: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: 1.6, transparent: true, opacity: 0.92, depthWrite: false }),
  };
  return MATS;
}

// ───────── 지오메트리 ─────────

const shared = <T extends THREE.BufferGeometry>(g: T) => g;

export const sphere = (r: number, ws = 36, hs = 26) => shared(new THREE.SphereGeometry(r, ws, hs));
export const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 14, 36);
export const cyl = (rt: number, rb: number, h: number, seg = 36) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
export const torus = (R: number, r: number, rs = 20, ts = 56, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, rs, ts, arc);
export const cone = (r: number, h: number, seg = 36) => new THREE.ConeGeometry(r, h, seg, 1);

/** 둥근 상자(모서리 반지름 r) */
export function rbox(w: number, h: number, d: number, r: number, seg = 6): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-3, Math.min(r, w / 2, h / 2, d / 2) - 1e-4));
}

/** 회전체: [반지름, 높이] 목록(아래 → 위) */
export function lathe(pts: Array<[number, number]>, seg = 48): THREE.BufferGeometry {
  return smoothNormals(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), seg));
}

/** 관(곡선을 따라) */
export function tube(points: Array<[number, number, number]>, r: number, seg = 32, closed = false): THREE.BufferGeometry {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', 0.2);
  return new THREE.TubeGeometry(c, seg, r, 12, closed);
}

/** 매끈한 법선(같은 자리 정점 합치기) */
export function smoothNormals(geo: THREE.BufferGeometry, tol = 1e-4): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, tol);
  g.computeVertexNormals();
  return g;
}

/** 통통한 몸통: 구를 축별로 늘리고 아래를 살짝 납작하게 */
export function bean(rx: number, ry: number, rz: number, flatBottom = 0.0, taper = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 48, 32);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // 앞(+z)으로 갈수록 살짝 가늘게(물방울)
    const k = 1 - taper * Math.max(0, z);
    x *= k; y *= 1 - taper * 0.5 * Math.max(0, z);
    if (flatBottom > 0 && y < -1 + flatBottom) y = -1 + flatBottom + (y + 1 - flatBottom) * 0.35;
    p.setXYZ(i, x * rx, y * ry, z * rz);
  }
  g.computeVertexNormals();
  return g;
}

// ───────── 정점색 ─────────

function colorAttr(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, c: THREE.Color) => void) {
  const p = geo.attributes.position;
  const out = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), c);
    out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

export type Col = THREE.ColorRepresentation | [THREE.ColorRepresentation, THREE.ColorRepresentation] | [THREE.ColorRepresentation, THREE.ColorRepresentation, 'x' | 'y' | 'z', number?];

/** 한 색 또는 축 방향 그라디언트(기본 y: 아래 c0 → 위 c1) */
export function colorize(geo: THREE.BufferGeometry, col: Col): THREE.BufferGeometry {
  if (!Array.isArray(col)) { const c0 = new THREE.Color(col); return colorAttr(geo, (_x, _y, _z, c) => c.copy(c0)); }
  const a = new THREE.Color(col[0]), b = new THREE.Color(col[1]);
  const axis = (col[2] as 'x' | 'y' | 'z' | undefined) ?? 'y';
  const pw = (col[3] as number | undefined) ?? 1;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const lo = bb.min[axis], span = Math.max(1e-5, bb.max[axis] - lo);
  return colorAttr(geo, (x, y, z, c) => {
    const v = axis === 'x' ? x : axis === 'y' ? y : z;
    c.copy(a).lerp(b, Math.pow((v - lo) / span, pw));
  });
}

/** 가로 줄무늬(열기구·돛) — 각도 기준 */
export function stripes(geo: THREE.BufferGeometry, cols: THREE.ColorRepresentation[], n: number, shadeBottom = 0.12): THREE.BufferGeometry {
  const cs = cols.map((c) => new THREE.Color(c));
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  return colorAttr(geo, (x, y, z, c) => {
    const a = (Math.atan2(z, x) / (Math.PI * 2) + 1) % 1;
    const idx = Math.floor(a * n) % cs.length;
    c.copy(cs[idx]);
    const t = (y - bb.min.y) / Math.max(1e-5, bb.max.y - bb.min.y);
    c.multiplyScalar(1 - shadeBottom * (1 - t));
  });
}

// ───────── 부품 → 합치기 ─────────

/** 부품 하나(아직 합치기 전). parent 에 붙이고 돌려준다 */
export function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mk: MK, col: Col | null,
  pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scl: [number, number, number] | number = 1): THREE.Mesh {
  if (col !== null) colorize(geo, col);
  const m = new THREE.Mesh(geo);
  m.userData.mk = mk;
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (typeof scl === 'number') m.scale.setScalar(scl); else m.scale.set(...scl);
  parent.add(m);
  return m;
}

/** 움직이는 하위 그룹(바퀴·프로펠러) */
export function live(parent: THREE.Object3D, pos: [number, number, number] = [0, 0, 0], name = ''): THREE.Group {
  const g = new THREE.Group();
  g.userData.live = true;
  g.name = name;
  g.position.set(...pos);
  parent.add(g);
  return g;
}

function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  } else if (!(g.index.array instanceof Uint32Array)) {
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array as ArrayLike<number>), 1));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) colorize(g, '#ffffff');
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  return g;
}

/**
 * node 아래 부품(userData.mk)을 node 좌표로 구워 재질별 메시 하나로 합친다.
 * userData.live 하위 그룹은 따로 같은 방식으로 합친다(그 그룹은 계속 움직일 수 있다).
 */
export function bake(node: THREE.Object3D, shadow = true): void {
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  const buckets = new Map<MK, THREE.BufferGeometry[]>();
  const lives: THREE.Object3D[] = [];
  const parts: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    for (const c of [...o.children]) {
      if (c.userData.live) { lives.push(c); continue; }
      const m = c as THREE.Mesh;
      if (m.isMesh && m.userData.mk) {
        const mtx = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
        const g = prep(m.geometry.clone().applyMatrix4(mtx));
        const list = buckets.get(m.userData.mk) ?? [];
        list.push(g);
        buckets.set(m.userData.mk, list);
        parts.push(m);
        m.geometry.dispose();
      }
      visit(c);
    }
  };
  visit(node);
  for (const p of parts) p.removeFromParent();
  const M = mats();
  for (const [k, list] of buckets) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, M[k]);
    mesh.name = 'veh:' + k;
    mesh.castShadow = shadow && k !== 'glass' && k !== 'flame' && k !== 'shine';
    mesh.receiveShadow = k !== 'flame';
    node.add(mesh);
  }
  for (const l of lives) bake(l, shadow);
}

// ───────── 귀여운 얼굴(헤드라이트 눈) ─────────

/** 큰 눈 + 하이라이트 두 개 + 볼터치. (0,0,0) = 얼굴 중심, +z 를 바라본다 */
export function face(parent: THREE.Object3D, pos: [number, number, number], s: number, opts: { gap?: number; blush?: boolean; smile?: boolean; rotY?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  g.position.set(...pos);
  g.rotation.y = opts.rotY ?? 0;
  g.scale.setScalar(s);
  parent.add(g);
  const gap = opts.gap ?? 0.34;
  for (const sx of [-1, 1]) {
    // 눈: 세로로 긴 반질한 타원
    part(g, sphere(0.13, 32, 24), 'eye', null, [sx * gap, 0.04, 0], [0, 0, 0], [0.82, 1.08, 0.42]);
    part(g, sphere(0.045, 20, 14), 'shine', null, [sx * gap + 0.035, 0.1, 0.05], [0, 0, 0], [1, 1, 0.5]);
    part(g, sphere(0.022, 16, 12), 'shine', null, [sx * gap - 0.04, -0.03, 0.05], [0, 0, 0], [1, 1, 0.5]);
    if (opts.blush !== false) part(g, sphere(0.1, 28, 20), 'soft', '#ff9fb4', [sx * (gap + 0.13), -0.13, -0.02], [0, 0, 0], [1, 0.55, 0.3]);
  }
  if (opts.smile !== false) {
    // 작은 웃는 입(반원 관)
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 8; i++) { const a = Math.PI * (1.15 + 0.7 * (i / 8)); pts.push([Math.cos(a) * 0.09, -0.1 + Math.sin(a) * 0.06 + 0.03, 0]); }
    part(g, tube(pts, 0.016, 16), 'eye', null);
  }
  return g;
}

/** 통통한 바퀴: 둥근 타이어 + 휠캡(+ 하트 같은 점) — 바퀴 중심 = 원점, x 축으로 굴러간다 */
export function chubbyWheel(parent: THREE.Object3D, r: number, w: number, cap: THREE.ColorRepresentation, pos: [number, number, number]): THREE.Group {
  const g = live(parent, pos, 'wheel');
  const tire = lathe([[r * 0.55, -w / 2], [r * 0.86, -w / 2], [r * 0.97, -w * 0.38], [r, 0], [r * 0.97, w * 0.38], [r * 0.86, w / 2], [r * 0.55, w / 2]], 48);
  part(g, tire, 'rubber', '#585a70', [0, 0, 0], [0, 0, Math.PI / 2]);
  // 휠캡(돔)
  for (const sx of [-1, 1]) {
    const capG = lathe([[r * 0.62, 0], [r * 0.6, 0.02], [r * 0.45, 0.06], [r * 0.2, 0.085], [0, 0.09]], 40);
    part(g, capG, 'paint', [cap, '#ffffff', 'y', 2.2], [sx * w * 0.42, 0, 0], [0, 0, -sx * Math.PI / 2]);
    // 굴러가는 게 보이게 점 하나
    part(g, sphere(r * 0.12, 20, 14), 'paint', '#ffffff', [sx * (w * 0.42 + 0.06 * r / 0.3), r * 0.32, 0], [0, 0, 0], [0.5, 1, 1]);
  }
  return g;
}
