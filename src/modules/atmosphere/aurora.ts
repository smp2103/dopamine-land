// 오로라 — 솜눈섬 밤하늘에 일렁이는 리본 커튼(민트 → 청록 → 분홍). 리본 세 장을 지오메트리 하나에(드로우콜 1).
// 카메라를 따라 북쪽 하늘(-z) 둘레에 걸리고, 셰이더가 주름·빛줄기·흔들림을 만든다. 휘는 땅 곡률(dlCurve)을 직접 건다.
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import { CURVE_GLSL_HEAD, curveUniforms } from '../../core/curve';

const VERT = /* glsl */ `
${CURVE_GLSL_HEAD}
attribute vec3 aRib; // x: 리본 번호, y: 시작 각, z: 각 폭
uniform float uTime;
uniform vec3 uCenter;
varying vec2 vUv;
varying float vRib;
void main() {
  float u = position.x, v = position.y;
  float i = aRib.x;
  float ang = aRib.y + ( u - 0.5 ) * aRib.z + sin( uTime * 0.05 + i ) * 0.08;
  // 반지름: 큰 물결 + 잔주름(커튼 주름이 천천히 흐른다)
  float R = 430.0 + i * 70.0 + sin( u * 6.0 + uTime * 0.07 + i * 2.0 ) * 40.0
          + sin( u * 23.0 - uTime * 0.32 + i ) * 11.0 + sin( u * 51.0 + uTime * 0.6 ) * 3.0;
  float base = 120.0 + i * 22.0 + sin( u * 4.0 + i * 1.7 + uTime * 0.04 ) * 14.0;
  float span = 150.0 * ( 0.75 + 0.25 * sin( u * 5.0 + i * 2.3 + uTime * 0.09 ) );
  vec3 wp = uCenter + vec3( cos( ang ) * R, base + v * span, sin( ang ) * R );
  // 위로 갈수록 바람에 살짝 밀린다
  wp.xz += vec2( cos( ang ), sin( ang ) ) * v * v * 25.0;
  vec4 w = dlCurve( vec4( wp, 1.0 ) );
  gl_Position = projectionMatrix * viewMatrix * w;
  vUv = vec2( u, v );
  vRib = i;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uAmount;
varying vec2 vUv;
varying float vRib;
float h11( float x ) { return fract( sin( x * 91.345 ) * 47453.5453 ); }
float n11( float x ) { float i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f ); return mix( h11( i ), h11( i + 1.0 ), f ); }
void main() {
  float u = vUv.x, v = vUv.y;
  // 세로 빛줄기(커튼 실)가 옆으로 천천히 흐른다
  float rays = 0.55 + 0.45 * n11( u * 140.0 + uTime * 0.6 + vRib * 13.0 );
  rays *= 0.7 + 0.3 * n11( u * 37.0 - uTime * 0.25 + vRib * 5.0 );
  // 아래 끝은 또렷한 띠, 위로 갈수록 옅게
  float bottom = smoothstep( 0.0, 0.07, v ) * ( 1.0 - smoothstep( 0.07, 0.35, v ) * 0.45 );
  float top = 1.0 - smoothstep( 0.45, 1.0, v );
  float ends = smoothstep( 0.0, 0.12, u ) * ( 1.0 - smoothstep( 0.88, 1.0, u ) );
  // 귀여운 파스텔: 민트 → 청록 → 라벤더 → 분홍
  vec3 mint = vec3( 0.55, 1.0, 0.78 ), teal = vec3( 0.42, 0.9, 0.95 ), lav = vec3( 0.72, 0.6, 1.0 ), pink = vec3( 1.0, 0.62, 0.86 );
  vec3 c = mix( mint, teal, smoothstep( 0.05, 0.35, v ) );
  c = mix( c, mix( lav, pink, step( 1.5, vRib ) ), smoothstep( 0.4, 0.9, v ) );
  // 밝게 일렁임(숨쉬듯)
  float pulse = 0.8 + 0.2 * sin( uTime * 0.7 + u * 9.0 + vRib );
  float a = rays * bottom * top * ends * pulse * uAmount;
  gl_FragColor = vec4( c * a * 0.9, 1.0 );
  #include <colorspace_fragment>
}`;

export function buildAurora(ctx: Ctx) {
  const SEG = 120, ROWS = 6;
  // 리본: [번호, 가운데 각, 각 폭] — 북쪽(-z = 각 -π/2) 하늘을 넓게 덮는다
  const ribs: Array<[number, number, number]> = [[0, -Math.PI / 2, 2.0], [1, -Math.PI / 2 + 0.95, 1.5], [2, -Math.PI / 2 - 1.05, 1.4]];
  const pos: number[] = [], rib: number[] = [], idx: number[] = [];
  let off = 0;
  for (const [i, a0, w] of ribs) {
    for (let r = 0; r <= ROWS; r++) {
      for (let s = 0; s <= SEG; s++) {
        pos.push(s / SEG, r / ROWS, 0);
        rib.push(i, a0, w);
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let s = 0; s < SEG; s++) {
        const a = off + r * (SEG + 1) + s, b = a + SEG + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    off += (ROWS + 1) * (SEG + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aRib', new THREE.Float32BufferAttribute(rib, 3));
  geo.setIndex(idx);
  const uniforms = {
    uTime: { value: 0 }, uAmount: { value: 0 }, uCenter: { value: new THREE.Vector3() },
    uCurveK: curveUniforms.uCurveK, uCurveOrigin: curveUniforms.uCurveOrigin,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  mat.userData.noCurve = true; // 곡률은 셰이더에 직접 넣었다
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'atmo-aurora';
  mesh.frustumCulled = false;
  mesh.userData.noCurve = true;
  mesh.renderOrder = -0.5;
  mesh.visible = false;
  const rnd = ctx.rng('atmo:aurora');
  const t0 = rnd() * 100;
  /** at: 기준점(카메라), amount 0..1 */
  const update = (t: number, at: THREE.Vector3, amount: number) => {
    mesh.visible = amount > 0.01;
    if (!mesh.visible) return;
    uniforms.uTime.value = t + t0;
    uniforms.uAmount.value = amount;
    // 높이는 바다 기준(산 위에 올라가도 오로라는 하늘에 그대로)
    uniforms.uCenter.value.set(at.x, 0, at.z);
  };
  return { mesh, update };
}
