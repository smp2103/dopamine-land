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
  /** 젤다식 물결: 바람이 이 방향(xz, 1/m)으로 지나가며 풀이 눕고 밝아진다 */
  wave?: [number, number];
  /** 물결 마루에서 밝아지는 정도 */
  gustTint?: number;
  /** 발광(aTint 가 마스크) — 시간대별 세기는 glowLevel.value */
  glow?: number;
  emissive?: string;
  /** 카메라에서 이 거리(m)쯤에서 줄어들어 사라진다(풀) */
  fade?: number;
  /** 얇은 잎(풀)의 뒷면도 위를 보는 법선으로(어둡게 뒤집히지 않게) */
  upNormal?: number;
  /** 바람개비: aSpin=1 인 정점을 축(로컬 xy 의 hub, z 축) 둘레로 돌린다(초당 라디안) */
  spin?: { hubY: number; speed: number };
}

/** 밤에 버섯·요정 꽃이 빛나는 세기(0..1) */
export const glowLevel = { value: 0 };
/** 플레이어 발 위치(풀이 발을 가리지 않게 낮춘다) */
export const footPos = { value: new THREE.Vector2(1e6, 1e6) };

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
  float fPh = uTime * uSpeed + dot( fIp, vec2( 0.37, 0.61 ) ) * uJit - dot( fIp, uWave );
  float fW = ( sin( fPh ) * 0.65 + sin( fPh * 2.3 + 1.7 ) * 0.35 ) * uSway * fH * fH;
  float fGust = pow( max( 0.0, sin( fPh * 0.5 ) ), 4.0 );
  fW += fGust * uGust * uSway * 2.2 * fH * fH;
  transformed.x += fW;
  transformed.z += fW * 0.45;
  #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
    vColor.rgb *= 1.0 + uGust * fGust * min( fH, 1.0 );
  #endif
  vGlowM = aTint;
  if ( uFade > 0.0 ) {
    float fD = distance( fIp, cameraPosition.xz );
    transformed.y *= smoothstep( uFade, uFade * 0.55, fD ) * mix( 0.35, 1.0, smoothstep( 1.0, 2.6, fD ) )
      * mix( 0.3, 1.0, smoothstep( 0.45, 1.9, distance( fIp, uFoot ) ) );
  }
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
    uWave: { value: new THREE.Vector2(...(o.wave ?? [0, 0])) },
    uJit: { value: o.wave ? 0.15 : 1 },
    uGust: { value: o.gustTint ?? 0 },
    uGlow: { value: o.glow ?? 0 },
    uFade: { value: o.fade ?? 0 },
  };
  if (o.glow) { m.emissive = new THREE.Color(o.emissive ?? '#ffffff'); m.emissiveIntensity = 1; }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = floraTime;
    sh.uniforms.uGlowLevel = glowLevel;
    sh.uniforms.uFoot = footPos;
    Object.assign(sh.uniforms, u);
    if (o.upNormal) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n  normal = normalize( mix( normal * faceDirection, ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz, ' + o.upNormal.toFixed(2) + ' ) );');
    }
    if (o.glow) {
      sh.fragmentShader = 'varying float vGlowM;\nuniform float uGlow, uGlowLevel;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb * vGlowM * uGlow * (0.06 + uGlowLevel);');
    }
    const spin = o.spin
      ? `\n{\n  vec2 sIp = vec2( 0.0 );\n  #ifdef USE_INSTANCING\n    sIp = instanceMatrix[3].xz;\n  #endif\n  float sA = uTime * ${o.spin.speed.toFixed(3)} * ( 0.8 + 0.4 * fract( dot( sIp, vec2( 0.13, 0.29 ) ) ) ) + dot( sIp, vec2( 1.7, 2.3 ) );\n  vec2 sD = vec2( transformed.x, transformed.y - ${o.spin.hubY.toFixed(3)} );\n  float sc = cos( sA ), ss = sin( sA );\n  vec2 sR = vec2( sc * sD.x - ss * sD.y, ss * sD.x + sc * sD.y );\n  transformed.xy = mix( transformed.xy, vec2( sR.x, sR.y + ${o.spin.hubY.toFixed(3)} ), aSpin );\n}\n`
      : '';
    sh.vertexShader =
      (o.spin ? 'attribute float aSpin;\n' : '') +
      'attribute float aTint;\nvarying float vGlowM;\nuniform vec2 uFoot;\nuniform float uTime, uSway, uSwayBase, uSwayH, uSpeed, uRustle, uJit, uGust, uFade;\nuniform vec2 uWave;\n' +
      sh.vertexShader
        .replace('#include <color_vertex>', COLOR_VERTEX)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + spin + WIND);
  };
  m.customProgramCacheKey = () => 'flora:' + key;
  return m;
}
