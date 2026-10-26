// 섬 높이장을 텍스처로 한 번 굽는다 — 지형 색(해안·강둑 경계)과 물(깊이·거품)이 같은 값을 본다.
// R = 땅 높이, G = 해안 거리(+ 육지), B = 강 중심 거리, A = 그 자리 물 높이(강/바다)
import * as THREE from 'three';
import type * as Island from '../../core/island';

export const FIELD_RECT = { minX: -64, minZ: -60, size: 100 };
const RES = 0.125;

export interface Field {
  tex: THREE.DataTexture;
  /** minX, minZ, 1/size, 1/size */
  rect: THREE.Vector4;
}

let cached: Field | null = null;

export function getField(island: typeof Island): Field {
  if (cached) return cached;
  const n = Math.round(FIELD_RECT.size / RES);
  const data = new Uint16Array(n * n * 4);
  const h16 = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < n; j++) {
    const z = FIELD_RECT.minZ + (j + 0.5) * RES;
    for (let i = 0; i < n; i++) {
      const x = FIELD_RECT.minX + (i + 0.5) * RES;
      const f = island.fieldAt(x, z);
      const k = (j * n + i) * 4;
      data[k] = h16(f.h);
      data[k + 1] = h16(Math.max(-40, Math.min(60, f.coast)));
      data[k + 2] = h16(Math.min(40, f.river));
      data[k + 3] = h16(f.level);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cached = { tex, rect: new THREE.Vector4(FIELD_RECT.minX, FIELD_RECT.minZ, 1 / FIELD_RECT.size, 1 / FIELD_RECT.size) };
  return cached;
}

/** 지형·물 셰이더가 함께 쓰는 유니폼(시간은 같은 객체를 공유) */
export const sharedUniforms = {
  uTime: { value: 0 },
};
