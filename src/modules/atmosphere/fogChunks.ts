// 공기 원근 안개: three 의 fog 청크를 교체한다(모든 표준 재질·fog:true ShaderMaterial 에 적용).
// - 거리 안개: 기존 선형(near..far) 그대로 → 마을 룩 테스트(짧은 안개)는 그대로.
// - 넓은 세계(fogFar > 1000, 게임 모드): 먼 섬이 하늘색으로 옅어지는 부드러운 곡선 + 낮은 곳에 고이는 높이 안개.
//   먼 실루엣이 겹겹이 보이도록 완전히 덮지 않고(최대 ~0.93) 높은 봉우리는 덜 덮는다.
import * as THREE from 'three';

const C = THREE.ShaderChunk as unknown as Record<string, string>;

C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;

C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
#endif`;

C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;

C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor;
    if ( fogFar > 600.0 ) {
      // 넓은 세계: 거리(시선 방향 거리) 기반 부드러운 공기 원근 + 높이 안개
      float d = length( vFogWorld - cameraPosition );
      float t = max( d - fogNear, 0.0 ) / max( fogFar - fogNear, 1.0 );
      // 가까운 곳(수백 m)은 맑게, 멀수록 빠르게 하늘색으로(젤다식 공기 원근)
      float aerial = 1.0 - exp( - ( 0.35 * t + 2.8 * t * t ) );
      // 낮은 곳(바다·해안)에 고이는 안개: 높은 봉우리는 덜 덮는다
      float hy = max( vFogWorld.y, 0.0 );
      float hfall = exp( - hy / 70.0 );
      float hgt = hfall * ( 1.0 - exp( - max( d - fogNear * 0.5, 0.0 ) / ( fogFar * 0.55 ) ) );
      fogFactor = 1.0 - ( 1.0 - aerial * ( 0.8 + 0.2 * hfall ) ) * ( 1.0 - hgt * 0.3 );
      fogFactor = min( fogFactor, 0.965 );
    } else {
      fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    }
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

export {};
