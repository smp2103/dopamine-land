// 대기: 지평선 뭉게구름, 나비·꽃가루·반딧불이. (하늘 그라디언트·별·조명·후처리 값은 core/engine·presets)
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { buildClouds } from './atmosphere/clouds';
import { buildLife } from './atmosphere/life';

// 다른 모듈이 자리를 잡은 뒤에 나비·반딧불이 위치를 정한다
export const order = 50;

export default function build(ctx: Ctx) {
  const g = new THREE.Group();
  g.name = 'atmosphere';
  g.add(buildClouds(ctx));
  g.add(buildLife(ctx));
  return g;
}
