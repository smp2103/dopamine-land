// 지형·물 셰이더 공용 GLSL — 필드 텍스처 읽기, 노이즈, 해안 파도(지형 쪽 물결막과 바다 쪽 거품이 같은 시계).

export const COMMON_GLSL = /* glsl */ `
uniform sampler2D uField;
uniform vec4 uFieldRect;
uniform float uTime;

// R = 땅 높이, G = 해안 거리, B = 강 거리, A = 물 높이. 텍스처 밖은 깊은 바다.
vec4 dlField( vec2 xz ) {
  vec2 uv = ( xz - uFieldRect.xy ) * uFieldRect.zw;
  if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return vec4( -4.0, -40.0, 40.0, 0.0 );
  return texture2D( uField, uv );
}

float dlHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
vec2 dlHash2( vec2 p ) {
  return fract( sin( vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) ) ) * 43758.5453 );
}

// 심플렉스 2D (Ashima)
vec3 dlPermute( vec3 x ) { return mod( ( ( x * 34.0 ) + 1.0 ) * x, 289.0 ); }
float dlNoise( vec2 v ) {
  const vec4 C = vec4( 0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439 );
  vec2 i = floor( v + dot( v, C.yy ) );
  vec2 x0 = v - i + dot( i, C.xx );
  vec2 i1 = ( x0.x > x0.y ) ? vec2( 1.0, 0.0 ) : vec2( 0.0, 1.0 );
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod( i, 289.0 );
  vec3 p = dlPermute( dlPermute( i.y + vec3( 0.0, i1.y, 1.0 ) ) + i.x + vec3( 0.0, i1.x, 1.0 ) );
  vec3 m = max( 0.5 - vec3( dot( x0, x0 ), dot( x12.xy, x12.xy ), dot( x12.zw, x12.zw ) ), 0.0 );
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract( p * C.www ) - 1.0;
  vec3 h = abs( x ) - 0.5;
  vec3 ox = floor( x + 0.5 );
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0 * a0 + h * h );
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot( m, g );
}

// 해안 파도: 위상 0..1 — 해안을 따라 조금씩 어긋나게(7초 주기)
float dlWavePhase( vec2 xz ) {
  return fract( uTime * 0.14 + 0.45 * dlNoise( xz * 0.035 ) + 0.12 * dlNoise( xz * 0.12 + 3.0 ) );
}
// 모래 위로 올라온 정도 0..1: 빨리 밀려오고 천천히 빠진다
float dlSwashReach( float p ) {
  return p < 0.26 ? sin( p / 0.26 * 1.5708 ) : 1.0 - smoothstep( 0.26, 0.97, p );
}
const float DL_SWASH_H = 0.12;
`;
