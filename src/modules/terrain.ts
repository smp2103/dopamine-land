// (임시) 지형 — 높이장을 격자 메시로. 지형 담당 에이전트가 교체한다.
import * as THREE from 'three';
import type { Ctx } from '../core/types';

export const order = 0;

export default function build(ctx: Ctx) {
  const { island, palette } = ctx;
  const b = island.ISLAND_BOUNDS;
  const step = 0.35;
  const nx = Math.ceil((b.maxX - b.minX) / step), nz = Math.ceil((b.maxZ - b.minZ) / step);
  const geo = new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const s = island.surfaceAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, s.h);
    c.set(s.kind === 'sand' || s.kind === 'sea' ? palette.sand : s.kind === 'cliff' ? palette.cliff : s.kind === 'river' ? palette.dirt : palette.grass);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}
