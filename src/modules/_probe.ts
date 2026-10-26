// 밑줄로 시작하는 모듈은 자동 로드되지 않는다(solo=_probe 로도 불러지지 않음). 참고용 형식.
import * as THREE from 'three';
import type { Ctx } from '../core/types';

export default function build(ctx: Ctx) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 24), new THREE.MeshStandardMaterial({ color: ctx.palette.pink, roughness: 0.6 }));
  m.position.set(0, ctx.island.heightAt(0, 0) + 0.6, 0);
  m.castShadow = true;
  return m;
}
