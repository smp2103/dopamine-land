// 소품 공용 도구: 둥근 지오메트리·정점색 그라디언트·재질·정적 소품 합치기(draw call 절약).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise3D } from 'simplex-noise';

export type MatKey = 'matte' | 'wood' | 'paint' | 'gloss' | 'gold' | 'stone' | 'lampGlow' | 'window' | 'shell' | 'treasure';

// ───────── 지오메트리 ─────────

/** 둥근 상자(모서리 반지름 r) */
export function rbox(w: number, h: number, d: number, r: number, seg = 5): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) - 1e-4);
}

/** 법선을 매끈하게 다시 계산(같은 자리 정점 합치기) */
export function smoothNormals(geo: THREE.BufferGeometry, tol = 1e-4): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, tol);
  g.computeVertexNormals();
  return g;
}

/** 위치 기준 상자 투영 UV(나뭇결이 모든 조각에 같은 크기로) */
export function boxUV(geo: THREE.BufferGeometry, scale = 1): THREE.BufferGeometry {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** 단면(shape, xy 평면)을 z 로 두께 depth 만큼 밀고 모서리를 둥글린다. 결과 중심 = 원점 */
export function roundExtrude(shape: THREE.Shape, depth: number, bevel: number, curveSeg = 24): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-3, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9,
    bevelSegments: 6, curveSegments: curveSeg, steps: 1,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  return smoothNormals(g);
}

/** 둥근 사각 단면 */
export function roundRectShape(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = cx - w / 2, y0 = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

const noise3 = createNoise3D(() => 0.37);

/** 통통한 돌·덩어리: 구를 납작하게 + 낮은 주파수 노이즈 */
export function blob(r: number, sy: number, amp: number, seed: number, detail = 5): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
  g = smoothNormals(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const k = 1 + amp * noise3(n.x * 1.1 + seed, n.y * 1.1, n.z * 1.1 - seed) + amp * 0.4 * noise3(n.x * 2.3, n.y * 2.3 + seed, n.z * 2.3);
    v.multiplyScalar(k);
    v.y *= sy;
    if (v.y < -r * sy * 0.55) v.y = -r * sy * 0.55 + (v.y + r * sy * 0.55) * 0.25; // 바닥은 납작하게 앉게
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** 정점색: 한 색 */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** 정점색: 아래(c0) → 위(c1) 그라디언트. pow 로 곡선 */
export function grad(geo: THREE.BufferGeometry, c0: THREE.ColorRepresentation, c1: THREE.ColorRepresentation, pow = 1): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const a = new THREE.Color(c0), b = new THREE.Color(c1), c = new THREE.Color();
  const p = geo.attributes.position;
  const out = new Float32Array(p.count * 3);
  const span = Math.max(1e-5, bb.max.y - bb.min.y);
  for (let i = 0; i < p.count; i++) {
    const t = Math.pow((p.getY(i) - bb.min.y) / span, pow);
    c.copy(a).lerp(b, t);
    out.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

// ───────── 재질 ─────────

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** 은은한 나뭇결(흰 바탕 위 옅은 결 — 정점색에 곱해진다) */
function woodTex(rng: () => number): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      const y = rng() * 256, a = 0.04 + rng() * 0.07;
      g.strokeStyle = `rgba(120,70,30,${a})`;
      g.lineWidth = 1 + rng() * 3;
      g.beginPath();
      for (let x = -4; x <= 260; x += 8) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3 + Math.sin(x * 0.11 + i * 2) * 1.2);
      g.stroke();
    }
  });
}

export function makeMaterials(rng: () => number): Record<MatKey, THREE.MeshStandardMaterial> {
  const wood = woodTex(rng);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, ...o });
  return {
    matte: std({ roughness: 0.85 }),
    wood: std({ roughness: 0.82, map: wood }),
    paint: std({ roughness: 0.6 }),
    gloss: std({ roughness: 0.32 }),
    gold: new THREE.MeshPhysicalMaterial({
      color: '#ffcc45', metalness: 0.65, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2,
      emissive: '#7a4a00', emissiveIntensity: 0.25,
    }),
    stone: std({ roughness: 0.95 }),
    // 상자 속 금화 더미: 스스로 빛나서 블룸이 걸린다
    treasure: new THREE.MeshStandardMaterial({ color: '#ffc23a', metalness: 0.5, roughness: 0.3, emissive: '#ff9a10', emissiveIntensity: 1.25 }),
    shell: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, sheen: 0.6, sheenColor: '#ffe6f0', sheenRoughness: 0.5 }),
    lampGlow: std({ vertexColors: false, color: '#fff3d6', roughness: 0.4, emissive: '#ffbf6a', emissiveIntensity: 0 }),
    window: std({ vertexColors: false, color: '#bfe6ff', roughness: 0.15, metalness: 0.05, emissive: '#ffb85c', emissiveIntensity: 0 }),
  };
}

// ───────── 정적 소품 합치기 ─────────

/** 메시 하나 = 지오메트리 + 재질 키. 나중에 bake 가 재질별로 하나로 합친다. */
export function part(geo: THREE.BufferGeometry, mk: MatKey, color?: THREE.ColorRepresentation): THREE.Mesh {
  if (color !== undefined) paint(geo, color);
  const m = new THREE.Mesh(geo);
  m.userData.mk = mk;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) boxUV(g, 1.4);
  if (!g.attributes.color) paint(g, '#ffffff');
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  return g;
}

/**
 * root 아래 userData.mk 가 있는 메시를 월드 좌표로 구워 재질별 메시 하나로 합친다.
 * userData.live 인 하위 트리는 그대로 둔다(움직이는 것).
 */
export function bake(root: THREE.Object3D, mats: Record<MatKey, THREE.Material>): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<MatKey, THREE.BufferGeometry[]>();
  const live: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o.userData.live) { live.push(o); return; }
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.mk) {
      const g = prep(m.geometry.clone().applyMatrix4(m.matrixWorld));
      const list = buckets.get(m.userData.mk) ?? [];
      list.push(g);
      buckets.set(m.userData.mk, list);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  const out = new THREE.Group();
  for (const [k, list] of buckets) {
    const merged = mergeGeometries(list, false);
    if (!merged) throw new Error('merge failed: ' + k);
    const mesh = new THREE.Mesh(merged, mats[k]);
    mesh.name = 'props:' + k;
    mesh.castShadow = k !== 'window';
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  for (const l of live) {
    // 살아 있는 조각은 월드 변환을 유지한 채 옮긴다
    l.updateMatrixWorld(true);
    const wm = l.matrixWorld.clone();
    l.removeFromParent();
    wm.decompose(l.position, l.quaternion, l.scale);
    // 살아 있는 조각 안의 재질 키 메시에 실제 재질을 건다
    l.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.mk) m.material = mats[m.userData.mk as MatKey];
    });
    out.add(l);
  }
  return out;
}

/** 땅 위 놓기: 발자국 네 귀퉁이 중 가장 낮은 높이(떠 보이지 않게) */
export function groundY(heightAt: (x: number, z: number) => number, x: number, z: number, rx = 0.3, rz = 0.3): number {
  return Math.min(heightAt(x, z), heightAt(x - rx, z - rz), heightAt(x + rx, z - rz), heightAt(x - rx, z + rz), heightAt(x + rx, z + rz));
}

export { canvasTex };
