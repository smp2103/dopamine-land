// 동물 주민 공용 재질: 플레이어(말랑)와 한 가족처럼 — 그늘을 자기 색으로 채우고(가짜 표면하산란),
// 윤곽엔 따뜻한 빛이 번지는 프레넬 림을 얹는다 → 초록 풀밭 위에서도 실루엣이 톡 튄다.
// 시그니처는 kit.skinMat/clothMat/glossMat 과 같다(갈아 끼우기만 하면 된다).
import * as THREE from 'three';

export interface RimOpts {
  map?: THREE.Texture | null;
  /** 자기 색 채움(그늘 밝히기) */
  fill?: number;
  rim?: string;
  rimK?: number;
  rimPow?: number;
  roughness?: number;
  sheen?: number;
  sheenColor?: string;
  sheenRoughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  vertexColors?: boolean;
}

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** 림 빛 물리 재질(털·천·광택 공용) */
export function rimMat(color: string, o: RimOpts = {}): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  const tex = o.map ?? null;
  const m = new THREE.MeshPhysicalMaterial({
    color: tex || o.vertexColors ? '#ffffff' : c,
    map: tex,
    emissive: tex || o.vertexColors ? '#ffffff' : c,
    emissiveMap: tex,
    emissiveIntensity: o.fill ?? 0.18,
    roughness: o.roughness ?? 0.66,
    sheen: o.sheen ?? 0.55,
    sheenRoughness: o.sheenRoughness ?? 0.5,
    sheenColor: new THREE.Color(o.sheenColor ?? '#fff1e4'),
    clearcoat: o.clearcoat ?? 0,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.4,
    vertexColors: !!o.vertexColors,
  });
  const rim = new THREE.Color(o.rim ?? '#fff3e6');
  const rimK = o.rimK ?? 0.3, rimPow = o.rimPow ?? 2.4;
  const vc = !!o.vertexColors;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: rim };
    sh.uniforms.uRimK = { value: rimK };
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uRim;\nuniform float uRimK;\nvoid main() {')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${vc ? 'totalEmissiveRadiance *= vColor.rgb;' : ''}
        {
          float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          totalEmissiveRadiance += uRim * uRimK * pow(1.0 - ndv, ${rimPow.toFixed(2)});
        }`,
      );
  };
  const key = `animal-rim-${rimPow.toFixed(2)}-${vc ? 1 : 0}`;
  m.customProgramCacheKey = () => key;
  m.userData.rim = true;
  m.userData.base = color;
  return m;
}

/** 털·피부: 보송한 sheen + 따뜻한 채움(흰 털이 그늘에서 파랗게 죽지 않게 밝을수록 더 채운다) */
export function skinMat(color: string, map?: THREE.Texture, fill?: number): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  const l = lum(c);
  const m = rimMat(color, {
    map, fill: fill ?? 0.16 + 0.2 * THREE.MathUtils.smoothstep(l, 0.5, 0.95),
    roughness: 0.7, sheen: 0.6, sheenRoughness: 0.45,
    sheenColor: '#' + c.clone().lerp(new THREE.Color('#fff4ea'), 0.7).getHexString(),
    rimK: 0.32,
  });
  m.userData.family = 'soft';
  return m;
}

/** 천: sheen 으로 보송하게(림은 약하게) */
export function clothMat(color: string, map?: THREE.Texture): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  const m = rimMat(color, {
    map, fill: 0.1, roughness: 0.88, sheen: 1, sheenRoughness: 0.65,
    sheenColor: '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.4).getHexString(), rimK: 0.22,
  });
  m.userData.family = 'soft';
  return m;
}

/** 매끈한 소재(코·부리·발굽·단추) */
export function glossMat(color: string, roughness = 0.38): THREE.MeshPhysicalMaterial {
  return rimMat(color, { fill: 0.08, roughness, sheen: 0, clearcoat: 0.55, clearcoatRoughness: 0.25, rimK: 0.18 });
}

/** 정점 색 털·천 한 장(움직이는 부위마다 무늬 없는 부품을 통째로 — 드로콜 절약) */
export function paletteMat(): THREE.MeshPhysicalMaterial {
  const m = rimMat('#ffffff', { vertexColors: true, fill: 0.24, roughness: 0.74, sheen: 0.7, sheenRoughness: 0.5, sheenColor: '#fff4ea', rimK: 0.3 });
  m.userData.family = 'palette';
  return m;
}

/** 정점 색 한 장(먼 LOD 몸 통째로) */
export function bakedMat(): THREE.MeshPhysicalMaterial {
  return rimMat('#ffffff', { vertexColors: true, fill: 0.18, roughness: 0.72, sheen: 0.4, rimK: 0.3 });
}
