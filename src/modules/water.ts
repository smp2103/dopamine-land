// (임시) 바다·강물 — 반투명 평면. 지형 담당 에이전트가 교체한다.
import * as THREE from 'three';
import type { Ctx } from '../core/types';

export const order = 1;

export default function build(ctx: Ctx) {
  const g = new THREE.Group();
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400, 80, 80).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: ctx.palette.waterDeep, transparent: true, opacity: 0.85, roughness: 0.2 }),
  );
  sea.position.y = 0;
  g.add(sea);
  return g;
}
