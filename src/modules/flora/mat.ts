// 식물 재질 — 정점색 × (aTint 만큼) 인스턴스색, 정점 셰이더 바람 흔들림.
// 흔들림은 begin_vertex 바로 뒤에서 transformed 만 바꾼다(project_vertex 는 엔진 곡률 패치 몫).
import * as THREE from 'three';

/** 모든 식물 재질이 공유하는 시간 */
export const floraTime = { value: 0 };

export interface FloraMatOpts {
  /** 꼭대기 흔들림 폭(m) */
  sway: number;
  /** 흔들림이 시작되는 높이·전체 높이(로컬) */
  swayBase?: number;
  swayH: number;
  speed?: number;
  /** 잎 표면 살랑임(법선 방향, m) */
  rustle?: number;
  rough?: number;
  sheen?: number;
  sheenColor?: string;
  side?: THREE.Side;
}

const COLOR_VERTEX = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR )
  vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
  vColor *= color;
#elif defined( USE_COLOR )
  vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, aTint );
#endif
`;

const WIND = /* glsl */ `
{
  float fH = clamp( ( transformed.y - uSwayBase ) / uSwayH, 0.0, 1.6 );
  vec2 fIp = vec2( 0.0 );
  #ifdef USE_INSTANCING
    fIp = instanceMatrix[3].xz;
  #endif
  float fPh = uTime * uSpeed + dot( fIp, vec2( 0.37, 0.61 ) );
  float fW = ( sin( fPh ) * 0.65 + sin( fPh * 2.3 + 1.7 ) * 0.35 ) * uSway * fH * fH;
  transformed.x += fW;
  transformed.z += fW * 0.45;
  transformed += objectNormal * sin( uTime * 2.4 + dot( position, vec3( 5.1, 4.3, 6.7 ) ) + fIp.x ) * uRustle * fH;
}
`;

export function floraMat(key: string, o: FloraMatOpts): THREE.MeshStandardMaterial {
  const base = { vertexColors: true, roughness: o.rough ?? 0.85, metalness: 0, side: o.side ?? THREE.FrontSide };
  const m = o.sheen
    ? new THREE.MeshPhysicalMaterial({ ...base, sheen: o.sheen, sheenColor: new THREE.Color(o.sheenColor ?? '#ffffff'), sheenRoughness: 0.55 })
    : new THREE.MeshStandardMaterial(base);
  const u = {
    uSway: { value: o.sway },
    uSwayBase: { value: o.swayBase ?? 0 },
    uSwayH: { value: o.swayH },
    uSpeed: { value: o.speed ?? 1.4 },
    uRustle: { value: o.rustle ?? 0 },
  };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = floraTime;
    Object.assign(sh.uniforms, u);
    sh.vertexShader =
      'attribute float aTint;\nuniform float uTime, uSway, uSwayBase, uSwayH, uSpeed, uRustle;\n' +
      sh.vertexShader
        .replace('#include <color_vertex>', COLOR_VERTEX)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND);
  };
  m.customProgramCacheKey = () => 'flora:' + key;
  return m;
}
