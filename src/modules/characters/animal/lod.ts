// 먼 LOD 굽기: 리그 한 벌(보통 낮은 세밀도로 다시 만든 것)을 그 자리 그대로 굳혀
// 무늬 없는 부품은 정점 색 한 메시로, 무늬 텍스처가 있는 머리·얼굴 조각은 따로(재질 그대로) 둔다 → 3~5 드로콜.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakedMat } from './mats';

const _c = new THREE.Color();

/** 재질 대표 색(텍스처를 쓰면 userData.base 에 적어 둔 색) */
function baseColor(m: THREE.Material): THREE.Color {
  const u = m.userData.base as string | undefined;
  if (u) return _c.set(u);
  const c = (m as THREE.MeshStandardMaterial).color;
  return c ? _c.copy(c) : _c.set('#ffffff');
}

/**
 * src 아래 메시를 src 기준 좌표로 굳힌다.
 * keep(mesh) 가 true 인 메시는 재질을 그대로 둔 채 따로 남긴다(머리 무늬 · 눈 · 입).
 */
export function bakeLod(src: THREE.Object3D, keep: (m: THREE.Mesh) => boolean): THREE.Group {
  const out = new THREE.Group();
  out.name = 'lod-far';
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const parts: THREE.BufferGeometry[] = [];
  const kept: THREE.Mesh[] = [];
  const mm = new THREE.Matrix4();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    if (!mat) return;
    mm.multiplyMatrices(inv, m.matrixWorld);
    if (keep(m) || mat.transparent) { kept.push(m); return; }
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    // 이미 정점 색(팔레트)이면 그대로 쓴다
    const hasCol = !!(mat as THREE.MeshStandardMaterial).vertexColors && !!g.attributes.color && g.attributes.color.itemSize === 3;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(hasCol && k === 'color')) g.deleteAttribute(k);
    g.applyMatrix4(mm);
    if (!hasCol) {
      const c = baseColor(mat);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    g.clearGroups();
    parts.push(g);
    if (g !== m.geometry) { /* 복사본 */ }
  });
  if (parts.length) {
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (merged) {
      const body = new THREE.Mesh(merged, bakedMat());
      body.name = 'lod-body';
      body.castShadow = true;
      body.receiveShadow = true;
      out.add(body);
    }
  }
  // 따로 남기는 메시: 같은 재질끼리 합친다
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const m of kept) {
    mm.multiplyMatrices(inv, m.matrixWorld);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(mm);
    g.clearGroups();
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    const l = byMat.get(mat) ?? [];
    l.push(g);
    byMat.set(mat, l);
  }
  for (const [mat, list] of byMat) {
    // 속성이 다르면 못 합친다 — 그땐 하나씩
    const merged = list.length > 1 ? mergeGeometries(list, false) : list[0];
    const geos = merged ? [merged] : list;
    for (const g of geos) {
      const k = new THREE.Mesh(g, mat);
      k.castShadow = !mat.transparent;
      k.receiveShadow = true;
      k.renderOrder = mat.transparent ? 1 : 0;
      out.add(k);
    }
  }
  return out;
}

/**
 * 팔레트 합치기: group 직속 자식 중 무늬 없는 털·천(family 'soft') 메시를 정점 색으로 칠해 한 메시로(재질 하나).
 * 움직이지 않는 부품 묶음에만 쓴다. 합친 개수를 돌려준다.
 */
export function mergePalette(group: THREE.Object3D, mat: THREE.Material): number {
  const list: THREE.Mesh[] = [];
  for (const c of group.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || c.children.length) continue;
    const mt = m.material as THREE.MeshStandardMaterial;
    if (mt.userData.family !== 'soft' || mt.map || mt.transparent || mt.side === THREE.DoubleSide) continue;
    list.push(m);
  }
  if (list.length < 2) return 0;
  const geos: THREE.BufferGeometry[] = [];
  for (const m of list) {
    m.updateMatrix();
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(m.matrix);
    const c = baseColor(m.material as THREE.Material);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.clearGroups();
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return 0;
  for (const m of list) group.remove(m);
  const out = new THREE.Mesh(merged, mat);
  out.castShadow = true;
  out.receiveShadow = true;
  out.name = 'palette';
  group.add(out);
  return list.length;
}
