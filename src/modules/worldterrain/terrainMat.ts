// 세계 지형 재질 — 마을 지형(terrain.ts)과 같은 문법을 섬 전체로.
// 색은 프래그먼트에서: 섬 테마(팔레트) × 해안 거리 × 계단 좌표(흙벽·잔디 테두리) × 경사(바위 지층) × 물 깊이.
// 정점 속성: aA = (해안 거리, 근처 물 높이, 섬 테마 번호, 계단 좌표), aB = (흙벽 세기, 바위, 특수(용암/얼음), 0)
import * as THREE from 'three';
import { COMMON_GLSL } from '../terrain/glsl';
import { getField, sharedUniforms } from '../terrain/field';
import type * as Island from '../../core/island';

export const THEMES = ['home', 'dino', 'ice', 'mushroom', 'coral', 'desert', 'launch', 'islet'] as const;

/** 테마별 팔레트: 잔디, 밝은 잔디, 어두운 얼룩, 모래, 흙벽, 밝은 흙벽, 바위, 특수 */
const PAL: Record<(typeof THEMES)[number], string[]> = {
  home: ['#86c058', '#a0d068', '#70ad4e', '#f3dca6', '#b0835a', '#d3a676', '#9c958c', '#ffffff'],
  dino: ['#4caf4f', '#78c95a', '#2d8c4a', '#ecd49a', '#a5764f', '#c99a68', '#5e4f5c', '#ff6a1f'],
  ice: ['#eef5ff', '#ffffff', '#cddff4', '#e9f1fa', '#86bfe6', '#c3e6f8', '#8a96ad', '#a6dcf2'],
  mushroom: ['#86d49a', '#b9e88e', '#6fbf96', '#f7e4c6', '#a8866f', '#c6a48a', '#a99bbd', '#ffffff'],
  coral: ['#5ccb98', '#8adeb0', '#42ad84', '#fbd9c6', '#e59a9e', '#f4bcb4', '#ee8f9c', '#ffffff'],
  desert: ['#f1c784', '#f9dcaa', '#e4a866', '#f6dcae', '#cf7448', '#eb9f63', '#c0633e', '#ffffff'],
  launch: ['#9aab64', '#b4c27e', '#7f9058', '#e6dbbc', '#8d929c', '#b6bbc4', '#9aa0aa', '#ffffff'],
  islet: ['#90cf5e', '#addd72', '#76b956', '#fbefcf', '#b08c6a', '#cfab84', '#a49d94', '#ffffff'],
};
/** 테마별 모래사장 폭(m) */
const BEACH_W: Record<(typeof THEMES)[number], number> = { home: 11, dino: 8, ice: 6, mushroom: 9, coral: 26, desert: 999, launch: 6, islet: 14 };

export function themeIndex(theme: string | undefined): number {
  const i = THEMES.indexOf((theme ?? 'home') as (typeof THEMES)[number]);
  return i < 0 ? 0 : i;
}

export interface WtUniforms {
  uNearC: { value: THREE.Vector2 };
  uNearR: { value: number };
  uVillage: { value: THREE.Vector4 };
}

export function worldTerrainMaterial(island: typeof Island, far: boolean, u: WtUniforms, key = far ? 'far' : 'near'): THREE.MeshStandardMaterial {
  const field = getField(island);
  const pal: THREE.Vector3[] = [];
  const beach: number[] = [];
  for (const t of THEMES) {
    for (const hex of PAL[t]) { const c = new THREE.Color(hex); pal.push(new THREE.Vector3(c.r, c.g, c.b)); }
    beach.push(BEACH_W[t]);
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  const uniforms = {
    uField: { value: field.tex },
    uFieldRect: { value: field.rect },
    uTime: sharedUniforms.uTime,
    uPal: { value: pal },
    uBeach: { value: beach },
    uStep: { value: [4.5, 3, 7, 1, 1, 11.5, 13, 1] },
    uNearC: u.uNearC, uNearR: u.uNearR, uVillage: u.uVillage,
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aA;\nattribute vec4 aB;\nvarying vec4 vA;\nvarying vec4 vB;\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vA = aA; vB = aB;
        vWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vWN = normalize( mat3( modelMatrix ) * objectNormal );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vA;
        varying vec4 vB;
        varying vec3 vWP;
        varying vec3 vWN;
        uniform vec3 uPal[ 64 ];
        uniform float uBeach[ 8 ];
        uniform float uStep[ 8 ];
        uniform vec2 uNearC;
        uniform float uNearR;
        uniform vec4 uVillage;
        ${COMMON_GLSL}`)
      .replace('void main() {', `void main() {
        if ( vWP.x > uVillage.x && vWP.x < uVillage.z && vWP.z > uVillage.y && vWP.z < uVillage.w ) discard;
        ${far ? 'if ( distance( vWP.xz, uNearC ) < uNearR ) discard;' : ''}`)
      .replace('#include <color_fragment>', COLOR_GLSL)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = tRough;')
      .replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace('gl_FragColor.rgb = mix(', 'fogFactor *= tFogK;\n\tgl_FragColor.rgb = mix('));
  };
  mat.customProgramCacheKey = () => 'wt3-' + key;
  return mat;
}

const COLOR_GLSL = /* glsl */ `
  vec3 P = vWP;
  vec3 N = normalize( vWN );
  float coast = vA.x, wl = vA.y, terr = vA.w;
  // 마을 둘레(필드 텍스처 범위)는 마을 반도까지 아는 해안 거리를 쓴다 → 마을 지형과 이음매 없이
  vec2 fuv = ( P.xz - uFieldRect.xy ) * uFieldRect.zw;
  bool inField = fuv.x > 0.0 && fuv.y > 0.0 && fuv.x < 1.0 && fuv.y < 1.0;
  if ( inField ) coast = texture2D( uField, fuv ).g;
  int bi = int( vA.z + 0.5 );
  int o = bi * 8;
  vec3 cG = uPal[ o ], cGL = uPal[ o + 1 ], cGD = uPal[ o + 2 ], cS = uPal[ o + 3 ];
  vec3 cC = uPal[ o + 4 ], cCL = uPal[ o + 5 ], cR = uPal[ o + 6 ], cX = uPal[ o + 7 ];
  float wallAmp = vB.x, rockW = vB.y, special = vB.z;
  float tRough = 0.95;
  float tFogK = 1.0;
  float pxw = length( fwidth( P.xz ) );

  // ── 바탕(잔디/눈/모래언덕): 큰 얼룩 두 겹 + 은은한 잎 자국 ──
  float n1 = dlNoise( P.xz * 0.045 ) * 0.6 + dlNoise( P.xz * 0.13 + 5.3 ) * 0.4;
  float nBig = dlNoise( P.xz * 0.011 + 17.0 );
  vec3 grass = cG;
  grass = mix( grass, cGL, smoothstep( 0.15, 0.6, n1 ) * 0.55 );
  grass = mix( grass, cGD, smoothstep( -0.2, -0.65, n1 ) * 0.45 );
  grass = mix( grass, cGL, smoothstep( 0.3, 0.8, nBig ) * 0.25 );
  grass = mix( grass, cGD, smoothstep( -0.35, -0.85, nBig ) * 0.3 );
  if ( bi == 5 ) {
    // 사막: 바람 물결 무늬
    float rip = sin( ( P.x * 0.9 + P.z * 0.35 ) + 1.5 * dlNoise( P.xz * 0.08 ) );
    grass *= 1.0 + 0.045 * rip * ( 1.0 - smoothstep( 0.05, 0.4, pxw ) );
  } else if ( bi == 2 ) {
    // 눈: 반짝이 + 바람 결
    float sp = step( 0.985, dlHash( floor( P.xz * 9.0 ) ) ) * ( 1.0 - smoothstep( 0.02, 0.08, pxw ) );
    grass += sp * 0.25;
    tRough = 0.7;
  } else {
    vec2 gq = P.xz * 2.6;
    float fine = 1.0 - smoothstep( 0.06, 0.22, length( fwidth( gq ) ) );
    if ( fine > 0.0 ) {
      vec2 gi = floor( gq ), gf = fract( gq );
      float leaf = 0.0;
      for ( int yy = -1; yy <= 1; yy++ ) for ( int xx = -1; xx <= 1; xx++ ) {
        vec2 oo = vec2( float( xx ), float( yy ) );
        vec2 r = dlHash2( gi + oo );
        vec2 d = oo + 0.15 + r * 0.7 - gf;
        float a = r.x * 6.2831;
        d = mat2( cos( a ), -sin( a ), sin( a ), cos( a ) ) * d;
        float e = length( d * vec2( 1.0, 2.4 ) );
        leaf += smoothstep( 0.2, 0.13, e ) * ( r.y > 0.5 ? 1.0 : -0.8 );
      }
      grass *= 1.0 + 0.055 * leaf * fine;
    }
  }
  // 버섯 섬: 라벤더 이끼 얼룩이 둥글게
  if ( bi == 3 ) {
    float lav = smoothstep( -0.35, 0.55, dlNoise( P.xz * 0.0045 + 9.0 ) );
    grass = mix( grass, vec3( 0.72, 0.70, 0.92 ), lav * 0.55 );
    // 요정 고리: 22 m 칸마다 일부에 동그란 이끼 고리(또렷한 가장자리)
    vec2 rcl = floor( P.xz / 22.0 );
    vec2 rh = dlHash2( rcl );
    if ( rh.x > 0.62 ) {
      vec2 ctr = ( rcl + 0.3 + rh * 0.4 ) * 22.0;
      float rr = 3.0 + rh.y * 3.5;
      float dd = abs( length( P.xz - ctr ) - rr );
      float rw = 0.38;
      float ring = 1.0 - smoothstep( rw - max( pxw, 0.05 ), rw + max( pxw, 0.05 ), dd );
      grass = mix( grass, rh.y > 0.5 ? vec3( 0.86, 0.55, 0.85 ) : vec3( 0.42, 0.78, 0.55 ), ring * 0.85 );
    }
  }

  // ── 모래 ──
  float sn = dlNoise( P.xz * 0.45 ) * 0.6 + dlNoise( P.xz * 1.9 ) * 0.4;
  vec3 sand = cS * ( 1.0 + 0.035 * sn );
  float grain = dlHash( floor( P.xz * 34.0 ) );
  sand *= 1.0 + ( grain - 0.5 ) * 0.05 * ( 1.0 - smoothstep( 0.02, 0.05, pxw ) );

  float bw0 = uBeach[ bi ];
  float be = inField ? coast - 3.25 + 0.3 * dlNoise( P.xz * 0.32 ) + 0.09 * dlNoise( P.xz * 1.4 )
                     : coast - bw0 + 1.2 * dlNoise( P.xz * 0.05 ) + 0.4 * dlNoise( P.xz * 0.3 );
  float bw = fwidth( be ) * 0.7 + 0.02;
  float gm = smoothstep( -bw, bw, be );
  // 석호 섬: 낮은 땅은 모래
  if ( bi == 4 ) gm *= smoothstep( 1.9, 2.4, P.y + 0.3 * dlNoise( P.xz * 0.1 ) );
  if ( bi == 4 ) {
    // 산호 조각이 박힌 살구 모래
    float cs = step( 0.93, dlHash( floor( P.xz * 3.0 ) ) ) * ( 1.0 - smoothstep( 0.02, 0.06, pxw ) );
    sand = mix( sand, vec3( 0.98, 0.62, 0.66 ), cs * 0.6 );
  }
  if ( bi == 6 && P.y > 18.0 ) {
    // 발사대 고원: 콘크리트 판 + 주황 경고 띠
    vec2 sc = floor( P.xz / 30.0 );
    float sh = dlHash( sc + 7.1 );
    if ( sh > 0.55 ) {
      vec2 lp = fract( P.xz / 30.0 ) * 30.0;
      vec2 e2 = min( lp, 30.0 - lp );
      float edge = min( e2.x, e2.y );
      float inPad = smoothstep( 2.0, 2.0 + max( pxw, 0.03 ) * 1.5, edge );
      vec2 tq = fract( lp / 5.0 ) * 5.0;
      float seam = 1.0 - smoothstep( 0.05, 0.05 + max( pxw, 0.03 ), min( tq.x, tq.y ) );
      vec3 conc = vec3( 0.74, 0.75, 0.77 ) * ( 1.0 + 0.04 * sn ) * ( 1.0 - 0.18 * seam );
      float stripeZone = smoothstep( 2.0, 2.05, edge ) * smoothstep( 3.6, 3.55, edge );
      float diag = step( 0.5, fract( ( lp.x + lp.y ) / 2.4 ) );
      conc = mix( conc, mix( vec3( 1.0, 0.55, 0.15 ), vec3( 0.2, 0.2, 0.22 ), diag ), stripeZone );
      grass = mix( grass, conc, inPad );
    }
  }
  vec3 c = mix( sand, grass, gm );
  // 해안 젖은 모래 띠(1.5 m)
  if ( !inField ) c = mix( c, c * vec3( 0.88, 0.86, 0.84 ), ( 1.0 - gm ) * ( 1.0 - smoothstep( 0.0, 1.5, coast ) ) * step( -0.5, coast ) );
  c *= 1.0 - 0.06 * ( 1.0 - gm ) * smoothstep( -0.6, 0.0, be );

  // ── 계단 흙벽: 계단 좌표의 층 사이(0.36..0.64)가 벽, 위 모서리는 잔디가 둥글게 덮는다 ──
  float fT = fract( terr );
  float tw = fwidth( terr ) * 0.8 + 0.002;
  float lipE = 0.6 + 0.012 * dlNoise( P.xz * 0.35 );
  float wallM = smoothstep( 0.375 - tw, 0.375 + tw, fT ) * smoothstep( lipE + tw, lipE - tw, fT );
  // 벽 한가운데 실제 경사 ≈ |∇계단좌표| × 층 높이 × 5.4 — 완만하면 흙벽 대신 잔디 비탈
  float wallSlope = vB.w * uStep[ bi ] * 5.4;
  float steepGate = smoothstep( 0.86, 0.92, wallSlope );
  wallM *= smoothstep( 0.12, 0.2, wallAmp ) * step( 0.01, terr ) * steepGate;
  if ( bi == 5 ) {
    // 메사: 계단 좌표(정점 보간 = 매끈한 등고선)로만 벽을 정한다 — 법선 판정의 톱니 없음
    float tw5 = tw + 0.035;
    wallM = smoothstep( 0.3 - tw5, 0.3 + tw5, fT ) * smoothstep( 0.7 + tw5, 0.7 - tw5, fT ) * smoothstep( 0.02, 0.15, wallAmp ) * step( 0.01, terr );
  }
  // 잔디 끝 바로 아래 그늘(덮인 느낌), 잔디 자락은 살짝 밝게
  float underLip = smoothstep( lipE - 0.05, lipE, fT ) * wallM;
  float lipGlow = smoothstep( lipE + 0.04, lipE, fT ) * step( lipE, fT ) * smoothstep( 0.05, 0.3, wallAmp ) * steepGate;
  c *= 1.0 + 0.12 * lipGlow * ( bi == 5 ? 0.0 : 1.0 );
  // 벽 발치 그늘(AO)
  float foot = smoothstep( 0.30, 0.375, fT ) * ( 1.0 - smoothstep( 0.375, 0.39, fT ) ) * smoothstep( 0.05, 0.3, wallAmp ) * steepGate;
  c *= 1.0 - 0.12 * foot;

  // 흙벽 / 바위 지층
  float yy2 = P.y + 0.25 * dlNoise( P.xz * 0.2 );
  float bandH = bi == 5 ? 1.4 : ( bi == 2 ? 1.1 : 0.55 );
  float band = yy2 / bandH;
  float bf = fract( band );
  float tone = dlHash( vec2( floor( band ), 3.7 + float( bi ) ) );
  vec3 cliff = mix( cC, cCL, 0.2 + tone * 0.6 );
  cliff *= 1.0 - 0.16 * smoothstep( 0.72, 0.96, bf );
  cliff *= 1.0 + 0.08 * smoothstep( 0.14, 0.0, bf );
  cliff *= 1.0 + 0.05 * dlNoise( vec2( ( P.x + P.z ) * 0.08, yy2 * 1.6 ) );
  // 벽 아래쪽 AO(발치로 갈수록 어둡게)
  cliff *= 0.86 + 0.14 * smoothstep( 0.36, 0.5, fT );
  vec3 wallC = cliff * ( 1.0 - 0.24 * underLip );

  // 경사·바위(화산 사면, 설산 바위, 메사 위): 법선과 생성기 바위 비율로
  float nw = fwidth( N.y ) * 0.8 + 0.01;
  float steepN = smoothstep( 0.56 + nw, 0.5 - nw, N.y + 0.03 * dlNoise( P.xz * 0.4 ) );
  if ( bi == 5 ) steepN = 0.0;
  else if ( bi != 1 && bi != 2 ) steepN *= 1.0 - smoothstep( 0.05, 0.3, wallAmp );
  vec3 rockC = mix( cR, cR * 1.18, smoothstep( -0.4, 0.6, dlNoise( P.xz * 0.09 + P.y * 0.05 ) ) );
  rockC *= 1.0 - 0.1 * smoothstep( 0.7, 0.95, bf );
  float rockM = smoothstep( 0.3, 0.75, rockW + 0.25 * dlNoise( P.xz * 0.03 ) );
  if ( bi == 2 ) {
    // 설산: 평평한 곳엔 눈, 가파른 곳만 바위 — 빙하 절벽은 파란 얼음
    rockM *= smoothstep( 0.82, 0.62, N.y );
  }
  if ( bi == 5 ) {
    // 메사 윗면은 붉은 모래, 벽면만 지층
    rockC = mix( cCL, cS, 0.18 ) * ( 1.0 + 0.04 * sn );
    rockM = smoothstep( 0.05, 0.4, rockW );
  }
  c = mix( c, rockC, rockM * gm );
  float steepW = max( wallM, steepN * ( bi == 2 ? 0.85 : 1.0 ) );
  c = mix( c, mix( wallC, rockC * vec3( 0.95, 0.93, 0.95 ) * ( 0.9 + 0.2 * tone ), rockM * ( 1.0 - wallM ) ), steepW );

  // ── 특수: 용암(공룡 섬 분화구) / 언 호수(얼음 섬) ──
  vec3 tEmit = vec3( 0.0 );
  if ( bi == 1 && special > 0.01 ) {
    float flow = dlNoise( P.xz * 0.12 + vec2( uTime * 0.05, -uTime * 0.03 ) ) * 0.6 + dlNoise( P.xz * 0.4 - uTime * 0.04 ) * 0.4;
    float crust = smoothstep( 0.15, 0.45, flow );
    vec3 lava = mix( vec3( 1.0, 0.52, 0.12 ), vec3( 0.32, 0.18, 0.2 ), crust * 0.85 );
    c = mix( c, lava, special );
    tEmit = mix( vec3( 1.0, 0.4, 0.08 ) * 2.4, vec3( 0.25, 0.05, 0.0 ), crust ) * special;
  }
  if ( bi == 1 ) {
    // 화산: 정글이 사면을 타고 올라가고, 위는 짙은 화산암 지층 + 꼭대기에서 흘러내리는 용암 줄기
    vec2 dv = P.xz - vec2( 1750.0, -1114.5 );
    float ang = atan( dv.y, dv.x );
    float creep = smoothstep( 22.0, 70.0, P.y + 25.0 * dlNoise( vec2( ang * 3.0, 1.7 ) ) + 8.0 * dlNoise( P.xz * 0.05 ) );
    vec3 volc = mix( vec3( 0.56, 0.36, 0.24 ), vec3( 0.38, 0.24, 0.22 ), smoothstep( 40.0, 90.0, P.y ) );
    volc = mix( volc, vec3( 0.27, 0.16, 0.32 ), smoothstep( 85.0, 140.0, P.y ) );
    // 둥근 능선 굴곡(부드러운 큰 결만 — 격자·등고선 무늬 없음)
    float rib = dlNoise( vec2( ang * 5.0, P.y * 0.008 ) );
    volc *= 1.0 + 0.09 * rib + 0.05 * dlNoise( P.xz * 0.025 );
    float onCone = smoothstep( 0.2, 0.45, rockW );
    c = mix( c, mix( grass * 0.92, volc, creep ), onCone );
    float ch = abs( sin( ang * 3.5 + 1.3 * dlNoise( vec2( P.y * 0.012, ang ) ) ) );
    float lavaRiver = smoothstep( 0.09, 0.0, ch - 0.035 ) * smoothstep( 45.0, 100.0, P.y ) * onCone * ( 1.0 - special );
    tFogK = mix( 1.0, 0.5, onCone * smoothstep( 20.0, 60.0, P.y ) );
    float pulse = 0.75 + 0.25 * sin( uTime * 1.5 - P.y * 0.08 );
    c = mix( c, vec3( 1.0, 0.45, 0.12 ), lavaRiver );
    tEmit += vec3( 1.0, 0.36, 0.06 ) * lavaRiver * 2.2 * pulse;
    // 분화구 둘레가 아래에서 붉게 달아오름
    tEmit += vec3( 1.0, 0.3, 0.05 ) * 0.5 * smoothstep( 118.0, 134.0, P.y ) * onCone * ( 0.7 + 0.3 * pulse );
    c = mix( c, c * vec3( 1.15, 0.9, 0.85 ), smoothstep( 100.0, 135.0, P.y ) * 0.5 );
  }
  if ( bi == 2 && special > 0.01 ) {
    float cr = abs( dlNoise( P.xz * 0.18 ) );
    float crack = smoothstep( 0.04, 0.0, cr ) * ( 1.0 - smoothstep( 0.05, 0.3, pxw ) );
    vec3 ice = mix( cX, vec3( 0.86, 0.96, 1.0 ), smoothstep( -0.3, 0.5, dlNoise( P.xz * 0.05 ) ) );
    ice = mix( ice, vec3( 1.0 ), crack * 0.7 );
    c = mix( c, ice, special );
    tRough = mix( tRough, 0.18, special );
  }

  // ── 물속 바닥 / 젖은 띠 / 파도 ──
  bool isSea = wl < 0.05;
  float depth = wl - P.y;
  if ( depth > 0.0 ) {
    float cau = 0.0;
    vec2 cq = P.xz * 0.35 + vec2( uTime * 0.05, uTime * 0.03 );
    cau = smoothstep( 0.55, 0.0, abs( dlNoise( cq ) ) ) * smoothstep( 0.55, 0.0, abs( dlNoise( cq * 1.3 + 4.0 ) ) );
    vec3 floorC = mix( vec3( 0.75, 0.92, 0.80 ), vec3( 0.36, 0.69, 0.72 ), smoothstep( 0.6, 4.5, depth ) );
    floorC = mix( floorC, vec3( 0.18, 0.47, 0.66 ), smoothstep( 5.0, 18.0, depth ) );
    if ( bi == 4 ) floorC = mix( vec3( 0.86, 0.97, 0.88 ), floorC, smoothstep( 1.0, 6.0, depth ) );
    floorC *= 1.0 + 0.05 * sn + 0.22 * cau * ( 1.0 - smoothstep( 1.0, 6.0, depth ) );
    c = mix( c, floorC, smoothstep( 0.0, 0.3, depth ) );
    tRough = 0.9;
  } else {
    float above = -depth;
    float wetH = isSea ? DL_SWASH_H * 1.05 : 0.08;
    float wet = 1.0 - smoothstep( wetH * 0.55, wetH, above );
    c = mix( c, c * vec3( 0.86, 0.85, 0.83 ), wet );
    tRough = mix( tRough, 0.6, wet );
    if ( isSea && coast > -6.0 && coast < 30.0 ) {
      float ph = dlWavePhase( P.xz );
      float reach = dlSwashReach( ph ) * DL_SWASH_H;
      float aw = fwidth( above ) + 0.002;
      float cover = smoothstep( reach + aw, reach - aw, above );
      c = mix( c, mix( c, vec3( 0.75, 0.94, 0.9 ), 0.22 ) * 1.03, cover );
      float front = smoothstep( 0.03, 0.006, reach - above ) * cover;
      float lace = smoothstep( -0.35, 0.25, dlNoise( P.xz * 5.5 + uTime * 0.3 ) );
      float fade = ph < 0.26 ? 1.0 : 1.0 - smoothstep( 0.26, 0.6, ph );
      c = mix( c, vec3( 1.0 ), front * mix( 0.55, 1.0, lace ) * fade * 0.95 );
      tRough = mix( tRough, 0.25, cover );
    }
  }
  // 흘러가는 구름 그림자(땅이 살아 있게)
  float cloud = smoothstep( 0.25, 0.65, dlNoise( P.xz * 0.0035 + vec2( uTime * 0.006, uTime * 0.004 ) ) );
  c *= 1.0 - 0.13 * cloud;
  totalEmissiveRadiance += tEmit;
  diffuseColor.rgb *= c;
`;

/** 그 밖 공유값 */
export function seaTint() {
  return { shallow: '#9df0dc', mid: '#46cbd6', deep: '#2f95d6' };
}
