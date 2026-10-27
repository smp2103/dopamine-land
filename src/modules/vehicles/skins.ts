// 탈것 스킨 입히기: 구운 모델(bake)의 도장(paint)·천(soft) 메시 정점색을 스킨 색상으로 돌린다.
// 원래 색은 처음 한 번 geometry.userData.base 에 떠 두고, 스킨 0 이면 그대로 되돌린다(모델을 다시 만들지 않는다).
import * as THREE from 'three';
import { dominantHue, tintColors } from './p1logic';

const TINTED = new Set(['veh:paint', 'veh:soft']);

/** 모델 하나에 스킨 n(0 = 기본)을 입힌다 */
export function applySkin(root: THREE.Object3D, n: number): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && TINTED.has(m.name) && m.geometry?.attributes?.color) meshes.push(m);
  });
  if (!meshes.length) return;
  // 대표 색상은 모델 전체(도장 위주)에서 한 번
  let dom = root.userData.skinDom as number | null | undefined;
  if (dom === undefined) {
    const paint = meshes.filter((m) => m.name === 'veh:paint');
    const src = (paint.length ? paint : meshes).map((m) => baseOf(m));
    const all = new Float32Array(src.reduce((s, a) => s + a.length, 0));
    let o = 0;
    for (const a of src) { all.set(a, o); o += a.length; }
    dom = dominantHue(all);
    root.userData.skinDom = dom;
  }
  if ((root.userData.skin ?? 0) === n) return;
  for (const m of meshes) {
    const attr = m.geometry.attributes.color as THREE.BufferAttribute;
    tintColors(baseOf(m), attr.array as Float32Array, n, dom);
    attr.needsUpdate = true;
  }
  root.userData.skin = n;
}

/** 원래 정점색(처음 부를 때 복사해 둔다) */
function baseOf(m: THREE.Mesh): Float32Array {
  const g = m.geometry;
  let b = g.userData.skinBase as Float32Array | undefined;
  if (!b) {
    b = Float32Array.from((g.attributes.color as THREE.BufferAttribute).array as ArrayLike<number>);
    g.userData.skinBase = b;
  }
  return b;
}
