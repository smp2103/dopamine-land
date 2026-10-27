// 열매 모양·재질 공유 — 나무에 매달린 열매와 떨어진 열매가 같은 지오메트리를 쓴다(청크가 버려도 dispose 안 함).
import * as THREE from 'three';
import { floraMat } from './mat';
import { fruit, type FruitKind } from './shapes';
import { cherry } from './wshapes';
import { coconut, bananaBunch, dateCluster, starApple, frostBerry, ginkgoNuts } from './wshapes2';
import type { WFruit } from './data';

const CACHE: Partial<Record<WFruit, THREE.BufferGeometry>> = {};
/** 열매 지오메트리(공유) */
export function fruitGeo(f: WFruit): THREE.BufferGeometry {
  let g = CACHE[f];
  if (!g) {
    g = f === 'cherry' ? cherry()
      : f === 'coconut' ? coconut()
      : f === 'banana' ? bananaBunch()
      : f === 'date' ? dateCluster()
      : f === 'starapple' ? starApple()
      : f === 'frostberry' ? frostBerry()
      : f === 'ginkgo' ? ginkgoNuts()
      : fruit(f as FruitKind);
    g.userData.shared = true;
    g.computeBoundingSphere();
    CACHE[f] = g;
  }
  return g;
}

/** 매달 때 자리에서 아래로 내리는 높이(m) — 꼭지가 잎에 닿게 */
export const FRUIT_HANG: Record<WFruit, number> = {
  apple: -0.04, peach: -0.04, orange: -0.04, pear: -0.04, cherry: -0.2,
  coconut: -0.04, banana: -0.18, date: -0.12, starapple: -0.2, frostberry: -0.16, ginkgo: -0.12,
};
/** 떨어진 열매의 물리 공 반지름 */
export const FRUIT_R: Record<WFruit, number> = {
  apple: 0.19, peach: 0.19, orange: 0.19, pear: 0.19, cherry: 0.14,
  coconut: 0.17, banana: 0.18, date: 0.12, starapple: 0.17, frostberry: 0.12, ginkgo: 0.1,
};
/** 밤에 빛나는 열매 */
export const GLOW_FRUIT: ReadonlySet<WFruit> = new Set(['starapple']);

/** 나무에 달린 열매(수관과 같이 흔들린다) */
export const fruitMat = floraMat('w-fruit', { sway: 0.05, swayBase: 1.6, swayH: 2.6, speed: 1.1, rough: 0.5 });
/** 밤에 은은히 빛나는 열매(별사과) */
export const fruitGlowMat = floraMat('w-fruitglow', { sway: 0.05, swayBase: 1.6, swayH: 2.6, speed: 1.1, rough: 0.4, glow: 1.6, emissive: '#fff1a8' });
/** 떨어진 열매(흔들림 없음) */
export const dropMat = floraMat('w-drop', { sway: 0, swayH: 1, rough: 0.5 });
export const dropGlowMat = floraMat('w-dropglow', { sway: 0, swayH: 1, rough: 0.4, glow: 1.6, emissive: '#fff1a8' });
export const fruitMatOf = (f: WFruit) => (GLOW_FRUIT.has(f) ? fruitGlowMat : fruitMat);
export const dropMatOf = (f: WFruit) => (GLOW_FRUIT.has(f) ? dropGlowMat : dropMat);
