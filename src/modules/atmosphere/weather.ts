// 날씨·섬 분위기 파티클 — 카메라를 따라다니는 상자 안에서 감싸 돌며(wrap) 끊김 없이 흐른다.
// 눈송이(얼음 섬)·포자/반딧불(버섯 섬)·모래바람(사막)·화산재/불씨(공룡 섬)·반짝이는 공기(산호 섬)·비(가끔).
// 한 종류 = Points 하나(드로우콜 1), 세기 0 이면 숨긴다.
import * as THREE from 'three';
import type { Ctx } from '../../core/types';

const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uBox;
uniform vec3 uCam;
uniform vec3 uVel;
uniform float uSway;
uniform float uSize;
uniform float uPx;
uniform vec2 uYRange;
uniform float uMaxPx;
uniform float uNear;
varying float vSeed;
varying float vFade;
varying vec2 vStretch;
void main() {
  vec3 p = position;
  float s = aSeed.x;
  // 각자 속도가 조금씩 다르게
  vec3 vel = uVel * ( 0.7 + 0.6 * aSeed.y );
  p += vel * uTime;
  p.x += sin( uTime * ( 0.6 + aSeed.z ) + s * 40.0 ) * uSway;
  p.z += cos( uTime * ( 0.5 + aSeed.w ) + s * 31.0 ) * uSway;
  p.y += sin( uTime * ( 0.8 + aSeed.w ) + s * 17.0 ) * uSway * 0.4;
  // 중심(카메라 xz · 플레이어 높이) 둘레 상자로 감싸기 — 높이는 uYRange 안에서만
  vec3 rel;
  rel.xz = mod( p.xz - uCam.xz + uBox * 0.5, uBox ) - uBox * 0.5;
  float hh = uYRange.y - uYRange.x;
  rel.y = mod( p.y - uCam.y - uYRange.x, hh ) + uYRange.x;
  vec3 wp = uCam + rel;
  vec4 mv = viewMatrix * vec4( wp, 1.0 );
  gl_Position = projectionMatrix * mv;
  // 상자 가장자리·위아래 끝·카메라 바로 앞은 옅게(튀어나오는 것 방지)
  vFade = ( 1.0 - smoothstep( uBox * 0.32, uBox * 0.5, length( rel.xz ) ) )
        * smoothstep( uYRange.x, uYRange.x + 1.5, rel.y ) * ( 1.0 - smoothstep( uYRange.y - 1.5, uYRange.y, rel.y ) )
        * smoothstep( uNear * 0.35, uNear, -mv.z );
  vSeed = s;
  gl_PointSize = min( uSize * uPx * ( 0.6 + 0.8 * aSeed.y ) / max( -mv.z, 0.5 ), uMaxPx );
  // 화면에서 늘어나는 방향(비·모래바람 줄)
  vec4 v2 = projectionMatrix * viewMatrix * vec4( wp + normalize( uVel + vec3( 1e-4 ) ) , 1.0 );
  vec2 a = gl_Position.xy / gl_Position.w, b = v2.xy / v2.w;
  vStretch = normalize( b - a + vec2( 1e-5 ) );
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uAmount;
uniform float uTime;
uniform float uTwinkle;
varying float vSeed;
varying float vFade;
varying vec2 vStretch;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  q.y = -q.y;
  float a;
  #ifdef STREAK
    // 움직이는 방향으로 길쭉한 줄
    vec2 dir = vStretch;
    float along = dot( q, dir );
    float across = dot( q, vec2( -dir.y, dir.x ) );
    a = ( 1.0 - smoothstep( 0.0, 0.16, abs( across ) ) ) * ( 1.0 - smoothstep( 0.55, 1.0, abs( along ) ) );
  #else
    float r = length( q );
    #ifdef STAR
      // 반짝: 네 갈래 별빛 + 가운데 점
      float arms = ( 1.0 - smoothstep( 0.0, 0.07, abs( q.x ) ) ) * ( 1.0 - smoothstep( 0.1, 1.0, abs( q.y ) ) )
                 + ( 1.0 - smoothstep( 0.0, 0.07, abs( q.y ) ) ) * ( 1.0 - smoothstep( 0.1, 1.0, abs( q.x ) ) );
      a = arms * 0.9 + ( 1.0 - smoothstep( 0.0, 0.28, r ) ) + pow( max( 1.0 - r, 0.0 ), 3.0 ) * 0.4;
    #elif defined( GLOW )
      a = pow( max( 1.0 - r, 0.0 ), 2.2 ) + ( 1.0 - smoothstep( 0.0, 0.22, r ) ) * 0.8;
    #else
      // 보송한 눈송이·재: 가운데 진하고 가장자리 부드럽게
      a = 1.0 - smoothstep( 0.45, 1.0, r );
    #endif
  #endif
  float tw = mix( 1.0, 0.25 + 0.75 * pow( 0.5 + 0.5 * sin( uTime * ( 2.0 + vSeed * 5.0 ) + vSeed * 60.0 ), 3.0 ), uTwinkle );
  vec3 col = mix( uColor, uColor2, step( 0.5, fract( vSeed * 7.3 ) ) );
  float alpha = a * vFade * uAmount * tw;
  if ( alpha < 0.004 ) discard;
  gl_FragColor = vec4( col, alpha );
  #include <colorspace_fragment>
}`;

export interface WeatherKind {
  key: string;
  count: number;
  box: number;
  vel: [number, number, number];
  sway: number;
  size: number;
  color: string;
  color2?: string;
  additive?: boolean;
  streak?: boolean;
  glow?: boolean;
  twinkle?: number;
  star?: boolean;
  /** 높이 범위(플레이어 발 + 4 m 기준, m). 없으면 상자 높이 전체 */
  yRange?: [number, number];
  opacity: number;
  /** 화면 최대 크기(px, 기본 6 — 줄무늬는 더 길게) / 이 거리(m) 안은 페이드 */
  maxPx?: number;
  near?: number;
}

/** 날씨 상자 높이 기준(플레이어 발 높이). NaN 이면 카메라 높이 */
export const weatherCenter = { y: NaN };

export interface WeatherLayer { pts: THREE.Points; set: (amount: number) => void; kind: WeatherKind }

export function makeLayer(ctx: Ctx, k: WeatherKind): WeatherLayer {
  const rnd = ctx.rng('atmo:weather:' + k.key);
  const pos = new Float32Array(k.count * 3), seed = new Float32Array(k.count * 4);
  for (let i = 0; i < k.count; i++) {
    pos[i * 3] = (rnd() - 0.5) * k.box;
    pos[i * 3 + 1] = (rnd() - 0.5) * k.box;
    pos[i * 3 + 2] = (rnd() - 0.5) * k.box;
    seed.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const uniforms = {
    uTime: { value: 0 }, uBox: { value: k.box }, uCam: { value: new THREE.Vector3() },
    uVel: { value: new THREE.Vector3(...k.vel) }, uSway: { value: k.sway }, uSize: { value: k.size },
    uPx: { value: 900 }, uYRange: { value: new THREE.Vector2(...(k.yRange ?? [-k.box / 2, k.box / 2])) },
    uColor: { value: new THREE.Color(k.color) }, uColor2: { value: new THREE.Color(k.color2 ?? k.color) },
    uAmount: { value: 0 }, uTwinkle: { value: k.twinkle ?? 0 },
    uMaxPx: { value: k.maxPx ?? 6 }, uNear: { value: k.near ?? 4 },
  };
  const defines: Record<string, string> = {};
  if (k.streak) defines.STREAK = '';
  if (k.glow) defines.GLOW = '';
  if (k.star) defines.STAR = '';
  const mat = new THREE.ShaderMaterial({
    uniforms, defines, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, fog: false,
    blending: k.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  mat.userData.noCurve = true;
  const pts = new THREE.Points(geo, mat);
  pts.name = 'weather-' + k.key;
  pts.frustumCulled = false;
  pts.userData.noCurve = true;
  pts.renderOrder = 5;
  pts.visible = false;
  ctx.onUpdate((t) => {
    if (!pts.visible) return;
    uniforms.uTime.value = t;
    uniforms.uCam.value.copy(ctx.camera.position);
    if (Number.isFinite(weatherCenter.y)) uniforms.uCam.value.y = weatherCenter.y + 4;
    uniforms.uPx.value = ctx.renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov * 0.5));
  });
  return {
    pts, kind: k,
    set: (amount: number) => {
      uniforms.uAmount.value = amount * k.opacity;
      pts.visible = amount > 0.01;
    },
  };
}

export const KINDS: Record<string, WeatherKind> = {
  snow: { key: 'snow', count: 5200, box: 50, vel: [0.6, -1.4, 0.2], sway: 0.7, size: 0.13, color: '#ffffff', color2: '#eaf4ff', yRange: [-10, 22], opacity: 1 },
  rain: { key: 'rain', count: 5200, box: 44, vel: [1.2, -24, 0.6], sway: 0, size: 0.9, color: '#d6e6ff', streak: true, yRange: [-6, 26], opacity: 0.45, maxPx: 28, near: 3 },
  spores: { key: 'spores', count: 1200, box: 46, vel: [0.1, 0.35, 0.05], sway: 0.9, size: 0.1, color: '#ffb6e8', color2: '#b8ffd8', additive: true, glow: true, twinkle: 0.8, yRange: [-3, 10], opacity: 0.95 },
  // 모래바람: 듬성듬성 짧고 옅게(장면 빛을 받은 모래색은 atmosphere 가 매 프레임 넣는다)
  sand: { key: 'sand', count: 960, box: 50, vel: [10, 0.3, 3.5], sway: 0.4, size: 0.3, color: '#d8b884', color2: '#e8d2a8', streak: true, yRange: [-4, 5], opacity: 0.14, maxPx: 12, near: 3 },
  ash: { key: 'ash', count: 1800, box: 52, vel: [0.8, -0.8, 0.3], sway: 0.9, size: 0.14, color: '#b3a7a2', color2: '#d2c6bd', yRange: [-4, 24], opacity: 0.8 },
  embers: { key: 'embers', count: 300, box: 46, vel: [0.3, 1.4, 0.2], sway: 0.6, size: 0.12, color: '#ff9a4a', color2: '#ffd36a', additive: true, glow: true, twinkle: 0.9, yRange: [-3, 16], opacity: 1 },
  sparkle: { key: 'sparkle', count: 800, box: 40, vel: [0.2, 0.15, 0.1], sway: 0.5, size: 0.24, color: '#ffffff', color2: '#a6fff2', additive: true, star: true, twinkle: 1, yRange: [-3, 8], opacity: 1, maxPx: 9 },
  // 밤 반딧불·등불 같은 따뜻한 빛 점(모든 섬) — 풀숲 높이에 듬성듬성
  glow: { key: 'glow', count: 520, box: 60, vel: [0.05, 0.08, 0.04], sway: 1.2, size: 0.22, color: '#ffe48a', color2: '#d8ff8a', additive: true, glow: true, twinkle: 1, yRange: [-3.4, 1.5], opacity: 1.8, maxPx: 10, near: 5 },
};

// ───────── 새 떼(공룡 섬): 작은 둥근 새가 하늘을 빙빙 ─────────
export function makeBirds(ctx: Ctx) {
  const n = 16;
  const body = new THREE.SphereGeometry(0.32, 16, 12);
  body.scale(1, 0.85, 1.35);
  const wingL = new THREE.SphereGeometry(0.5, 14, 8);
  wingL.scale(1, 0.12, 0.5);
  wingL.translate(0.5, 0.04, 0);
  const wingR = wingL.clone();
  wingR.translate(-1.0, 0, 0);
  const geo = new THREE.BufferGeometry();
  {
    const parts = [body, wingL, wingR];
    const pos: number[] = [], nor: number[] = [], wing: number[] = [], idx: number[] = [];
    let off = 0;
    parts.forEach((g, gi) => {
      const p = g.attributes.position as THREE.BufferAttribute, nn = g.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(nn.getX(i), nn.getY(i), nn.getZ(i));
        wing.push(gi === 0 ? 0 : gi === 1 ? 1 : -1);
      }
      const ix = g.index!;
      for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
      off += p.count;
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
    geo.setIndex(idx);
  }
  const mat = new THREE.MeshStandardMaterial({ color: '#fff4ec', roughness: 0.8 });
  const uT = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBirdT = uT;
    sh.vertexShader = 'attribute float aWing;\nuniform float uBirdT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      if ( aWing != 0.0 ) {
        float ph = uBirdT * 9.0 + float( gl_InstanceID ) * 1.7;
        float flap = sin( ph ) * 0.75;
        float ax = abs( transformed.x );
        transformed.y += flap * ax;
      }`);
  };
  mat.customProgramCacheKey = () => 'atmo-birds';
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'birds';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const rnd = ctx.rng('atmo:birds');
  const seeds = Array.from({ length: n }, () => ({ r: 6 + rnd() * 14, h: rnd() * 6, ph: rnd() * Math.PI * 2, sp: 0.9 + rnd() * 0.25, s: 0.9 + rnd() * 0.5 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const center = new THREE.Vector3();
  const update = (t: number, at: THREE.Vector3) => {
    uT.value = t;
    // 무리 중심(앞쪽 하늘)이 천천히 원을 그린다
    const ca = t * 0.12;
    center.set(at.x + Math.cos(ca) * 14, at.y + Math.sin(t * 0.3) * 2, at.z + Math.sin(ca) * 14);
    for (let i = 0; i < n; i++) {
      const sd = seeds[i];
      const a = t * 0.32 * sd.sp + sd.ph;
      v.set(center.x + Math.cos(a) * sd.r, center.y + sd.h + Math.sin(t * 0.7 + sd.ph) * 1.2, center.z + Math.sin(a) * sd.r);
      e.set(Math.sin(t + sd.ph) * 0.1, -a, -0.35);
      q.setFromEuler(e);
      sc.setScalar(sd.s * 1.6);
      m4.compose(v, q, sc);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  return { mesh, update };
}

// ───────── 무지개(비 갠 뒤): 해 반대편 하늘에 큰 활 ─────────
export function makeRainbow() {
  const D = 1900;
  const R = D * Math.tan(THREE.MathUtils.degToRad(42));
  const W = D * Math.tan(THREE.MathUtils.degToRad(3.2));
  const geo = new THREE.RingGeometry(R - W, R + W, 160, 1, 0, Math.PI);
  const uniforms = { uIn: { value: R - W }, uOut: { value: R + W }, uAmount: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uIn; uniform float uOut; uniform float uAmount;
      varying vec2 vP;
      vec3 hue( float h ) { return clamp( abs( mod( h * 6.0 + vec3( 0.0, 4.0, 2.0 ), 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 ); }
      void main() {
        float r = ( length( vP ) - uIn ) / ( uOut - uIn );
        // 바깥 빨강 → 안쪽 보라
        vec3 c = hue( ( 1.0 - r ) * 0.78 );
        float edge = smoothstep( 0.0, 0.18, r ) * ( 1.0 - smoothstep( 0.82, 1.0, r ) );
        // 활 양끝(지평선 쪽)은 옅게
        float ang = atan( vP.y, vP.x );
        float ends = smoothstep( 0.0, 0.5, sin( ang ) );
        gl_FragColor = vec4( c * edge * ends * uAmount * 0.55, 1.0 );
        #include <colorspace_fragment>
      }`,
  });
  mat.userData.noCurve = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.noCurve = true;
  mesh.renderOrder = -0.4;
  const holder = new THREE.Group();
  holder.name = 'rainbow';
  holder.userData.noCurve = true;
  holder.add(mesh);
  holder.visible = false;
  const tmp = new THREE.Vector3();
  /** sunDir: 해 방향(정규화), horizonY: 겉보기 지평선 기울기(sin) */
  const update = (cam: THREE.Vector3, sunDir: THREE.Vector3, amount: number) => {
    uniforms.uAmount.value = amount;
    holder.visible = amount > 0.01;
    if (!holder.visible) return;
    holder.position.copy(cam);
    // 해 반대 방향(반태양점) — 해가 낮을수록 무지개가 높이 선다
    tmp.copy(sunDir).multiplyScalar(-1);
    const flat = new THREE.Vector3(tmp.x, 0, tmp.z).normalize();
    mesh.position.copy(flat).multiplyScalar(D);
    mesh.position.y = Math.max(tmp.y, -0.26) * D; // 해가 높아도 활 윗부분은 보이게(귀여움 우선)
    mesh.lookAt(0, mesh.position.y, 0);
  };
  return { holder, update };
}

// ───────── 물속 빛줄기: 수면에서 비스듬히 내려오는 부드러운 빛 기둥 ─────────
export function makeGodRays(ctx: Ctx) {
  const g = new THREE.Group();
  g.name = 'godrays';
  g.userData.noCurve = true;
  const uniforms = { uTime: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new THREE.Color('#bff3ff') } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uAmount; uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float x = vUv.x;
        float beams = 0.0;
        beams += pow( max( sin( x * 18.0 + uTime * 0.35 ), 0.0 ), 6.0 );
        beams += pow( max( sin( x * 31.0 - uTime * 0.25 + 1.3 ), 0.0 ), 8.0 ) * 0.7;
        beams += pow( max( sin( x * 7.0 + uTime * 0.15 + 2.1 ), 0.0 ), 4.0 ) * 0.5;
        float fade = smoothstep( 0.0, 0.25, vUv.y ) * smoothstep( 0.0, 0.08, 1.0 - vUv.y ) * smoothstep( 0.0, 0.15, x ) * smoothstep( 0.0, 0.15, 1.0 - x );
        gl_FragColor = vec4( uColor * beams * fade * uAmount * 0.22, 1.0 );
        #include <colorspace_fragment>
      }`,
  });
  mat.userData.noCurve = true;
  const rnd = ctx.rng('atmo:rays');
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(26, 34, 1, 1), mat);
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.5;
    p.position.set(Math.cos(a) * (8 + rnd() * 10), -14, Math.sin(a) * (8 + rnd() * 10));
    p.rotation.set(0.25, a + Math.PI / 2, 0.18);
    p.frustumCulled = false;
    p.userData.noCurve = true;
    g.add(p);
  }
  g.visible = false;
  const update = (t: number, cam: THREE.Vector3, waterY: number, amount: number) => {
    uniforms.uTime.value = t;
    uniforms.uAmount.value = amount;
    g.visible = amount > 0.01;
    if (!g.visible) return;
    g.position.set(cam.x, waterY, cam.z);
  };
  return { group: g, update };
}
