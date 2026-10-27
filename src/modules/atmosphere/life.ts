// 생기: 나비(날개 펄럭), 햇빛 속 꽃가루, 밤 반딧불이. 과하지 않게.
import * as THREE from 'three';
import { CURVE_GLSL_HEAD, curveUniforms, patchMaterial } from '../../core/curve';
import type { Ctx } from '../../core/types';
import type { TodPreset } from '../../core/presets';

// ── 나비 ─────────────────────────────────────────────
function wingTexture(main: string, edge: string, dot: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // 오른쪽 날개 한 장(왼쪽 가장자리 = 몸). 윗날개 크고 둥글게, 아랫날개 작게.
  const wing = () => {
    g.beginPath();
    g.ellipse(58, 44, 54, 40, -0.35, 0, Math.PI * 2);
    g.ellipse(46, 92, 36, 28, 0.45, 0, Math.PI * 2);
  };
  g.fillStyle = edge;
  wing();
  g.fill();
  g.save();
  g.translate(64, 64); g.scale(0.84, 0.84); g.translate(-64, -60);
  g.fillStyle = main;
  wing();
  g.fill();
  g.restore();
  g.fillStyle = dot;
  g.beginPath(); g.arc(78, 38, 9, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(48, 92, 6, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildButterflies(ctx: Ctx) {
  const group = new THREE.Group();
  group.name = 'butterflies';
  const rnd = ctx.rng('atmo:butterfly');
  const kinds = [
    ['#fff27a', '#f2b93a', '#ffffff'],
    ['#ffffff', '#c9d6ff', '#9fb4ff'],
    ['#9fd8ff', '#3c7fd0', '#ffffff'],
    ['#ffb0cc', '#e8668f', '#fff3f8'],
  ];
  const H = ctx.island.HERO;
  const homes = [
    { x: H.player.x - 3.6, z: H.player.z + 1.8 },
    { x: H.player.x + 4.2, z: H.player.z - 3.4 },
    { x: H.player.x - 1.0, z: H.player.z - 5.5 },
    { x: H.player.x + 5.8, z: H.player.z + 1.6 },
    { x: H.player.x - 7.5, z: H.player.z - 3.0 },
  ];
  const flies: Array<{ root: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; home: { x: number; z: number }; ph: number; sp: number; rad: number }> = [];
  homes.forEach((home, i) => {
    const k = kinds[i % kinds.length];
    const tex = wingTexture(k[0], k[1], k[2]);
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
    const depth = new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    patchMaterial(depth);
    const span = 0.27;
    const wg = new THREE.PlaneGeometry(span, span);
    wg.rotateX(Math.PI / 2); // 큰 윗날개가 앞(+z)으로
    wg.translate(span / 2, 0, 0);
    const r = new THREE.Mesh(wg, mat);
    const lgeo = wg.clone();
    lgeo.scale(-1, 1, 1);
    const l = new THREE.Mesh(lgeo, mat);
    for (const w of [l, r]) { w.castShadow = true; w.customDepthMaterial = depth; }
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.09, 4, 12), new THREE.MeshStandardMaterial({ color: '#4a3a33', roughness: 0.8 }));
    body.rotation.x = Math.PI / 2;
    const root = new THREE.Group();
    root.add(l, r, body);
    group.add(root);
    flies.push({ root, l, r, home, ph: rnd() * 10, sp: 0.5 + rnd() * 0.35, rad: 0.9 + rnd() * 0.8 });
  });
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  const pos = (f: (typeof flies)[number], t: number, out: THREE.Vector3) => {
    const a = t * f.sp + f.ph;
    const x = f.home.x + Math.sin(a) * f.rad + Math.sin(a * 2.3) * 0.35;
    const z = f.home.z + Math.sin(a * 0.7 + 1.3) * f.rad * 0.8;
    const y = ctx.island.heightAt(x, z) + 0.75 + Math.sin(a * 3.1) * 0.22 + Math.sin(a * 1.3) * 0.15;
    return out.set(x, y, z);
  };
  ctx.onUpdate((t) => {
    for (const f of flies) {
      pos(f, t, p);
      pos(f, t + 0.05, q);
      f.root.position.copy(p);
      f.root.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      // 펄럭임: 빠르게 위로 접었다 펴기
      const flap = Math.sin(t * 17 + f.ph * 3);
      const ang = 0.25 + 0.95 * (0.5 + 0.5 * flap);
      f.r.rotation.z = ang;
      f.l.rotation.z = -ang;
      f.root.position.y += flap * 0.03;
    }
  });
  return group;
}

// ── 떠다니는 점(꽃가루·반딧불이) 공용 셰이더 ───────────────
const DOTS_VERT = /* glsl */ `
${CURVE_GLSL_HEAD}
attribute float aSeed;
uniform float uTime;
uniform float uSize;
uniform float uDrift;
uniform float uBlink;
varying float vA;
void main() {
  vec3 p = position;
  float s = aSeed * 6.2831;
  // 천천히 떠돌기
  p.x += sin( uTime * 0.35 + s ) * uDrift + sin( uTime * 0.9 + s * 2.1 ) * uDrift * 0.3;
  p.y += sin( uTime * 0.5 + s * 1.7 ) * uDrift * 0.5;
  p.z += cos( uTime * 0.3 + s * 1.3 ) * uDrift;
  vec4 wp = dlCurve( modelMatrix * vec4( p, 1.0 ) );
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  // 깜빡임(반딧불이) — uBlink = 0 이면 그대로
  float b = 0.5 + 0.5 * sin( uTime * ( 1.2 + aSeed ) + s * 3.0 );
  vA = mix( 1.0, smoothstep( 0.25, 0.95, b ), uBlink );
  gl_PointSize = min( uSize * ( 0.6 + 0.8 * fract( aSeed * 13.7 ) ) * ( 300.0 / -mv.z ), 7.0 );
  // 카메라 4 m 안은 옅게(렌즈 먼지처럼 보이지 않게)
  vA *= smoothstep( 1.5, 4.0, -mv.z );
}`;

const DOTS_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAmount;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length( c ) * 2.0;
  float a = ( 1.0 - smoothstep( 0.0, 1.0, r ) );
  a = a * a;
  float core = 1.0 - smoothstep( 0.0, 0.35, r );
  gl_FragColor = vec4( uColor * ( a + core * 1.5 ), 1.0 ) * vA * uAmount;
}`;

function buildDots(ctx: Ctx, key: string, count: number, place: (rnd: () => number) => THREE.Vector3 | null, opts: { color: string; size: number; drift: number; blink: number }) {
  const rnd = ctx.rng('atmo:' + key);
  const pos: number[] = [], seed: number[] = [];
  let tries = 0;
  while (seed.length < count && tries++ < count * 50) {
    const v = place(rnd);
    if (!v) continue;
    pos.push(v.x, v.y, v.z);
    seed.push(rnd());
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const uniforms = {
    uTime: { value: 0 }, uSize: { value: opts.size }, uDrift: { value: opts.drift }, uBlink: { value: opts.blink },
    uColor: { value: new THREE.Color(opts.color) }, uAmount: { value: 1 },
    uCurveK: curveUniforms.uCurveK, uCurveOrigin: curveUniforms.uCurveOrigin,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: DOTS_VERT, fragmentShader: DOTS_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  mat.userData.noCurve = true; // 곡률은 셰이더에 직접 넣었다
  const pts = new THREE.Points(geo, mat);
  pts.name = key;
  pts.userData.noCurve = true;
  pts.frustumCulled = false;
  ctx.onUpdate((t) => { uniforms.uTime.value = t; });
  return { pts, uniforms };
}

export function buildLife(ctx: Ctx) {
  const group = new THREE.Group();
  group.name = 'life';
  const { island } = ctx;
  const H = island.HERO;
  const bf = buildButterflies(ctx);
  group.add(bf);

  // 꽃가루: 플레이어 주변 공중에 듬성듬성, 햇빛에 반짝
  const pollen = buildDots(ctx, 'pollen', 140, (rnd) => {
    const x = H.player.x + (rnd() - 0.5) * 30, z = H.player.z + (rnd() - 0.5) * 24;
    const s = island.surfaceAt(x, z);
    return new THREE.Vector3(x, Math.max(s.h, 0) + 0.4 + rnd() * 2.8, z);
  }, { color: '#fff3c8', size: 0.05, drift: 0.6, blink: 0 });
  group.add(pollen.pts);

  // 반딧불이: 강가·풀숲 낮게
  const ff = buildDots(ctx, 'fireflies', 70, (rnd) => {
    const x = H.player.x + (rnd() - 0.5) * 32, z = H.player.z + (rnd() - 0.5) * 26;
    const s = island.surfaceAt(x, z);
    if (s.kind === 'sea' || s.coastDist < 1) return null;
    // 강 근처에 더 많이
    if (s.riverDist > 3.5 && rnd() < 0.6) return null;
    return new THREE.Vector3(x, Math.max(s.h, 0) + 0.35 + rnd() * 1.3, z);
  }, { color: '#e4ff8a', size: 0.11, drift: 0.45, blink: 1 });
  group.add(ff.pts);

  ctx.onTod((_n: string, p: TodPreset) => {
    pollen.uniforms.uAmount.value = p.pollen * 0.5;
    pollen.pts.visible = p.pollen > 0;
    ff.uniforms.uAmount.value = p.fireflies * 1.3;
    ff.pts.visible = p.fireflies > 0;
    bf.visible = p.butterflies > 0;
    bf.children.forEach((c, i) => { c.visible = i < Math.round(p.butterflies * bf.children.length); });
  });
  return group;
}

// ── 하트 연기: 쿵쿵공룡섬 화산 분화구에서 하트 모양 연기가 몽글몽글 피어오른다 ─────────
// 하트 하나하나의 나이·자리·크기는 셰이더가 시간으로 굴린다(CPU 갱신 없음, 드로우콜 1).

const HEART_VERT = /* glsl */ `
${CURVE_GLSL_HEAD}
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uVent;
uniform vec3 uWind;
uniform float uLife;
varying vec3 vN;
varying float vA;
varying float vAge;
varying float vDist;
void main() {
  float age = fract( ( uTime + aSeed.x * uLife ) / uLife );
  float grow = sqrt( age );
  // 위로 70 m 쯤 오르며 바람에 밀리고, 살랑살랑 흔들린다
  vec3 c = uVent + vec3( 0.0, age * 95.0, 0.0 ) + uWind * age * age * 55.0;
  c.x += sin( uTime * 0.4 + aSeed.y * 30.0 ) * ( 2.0 + grow * 6.0 ) + ( aSeed.z - 0.5 ) * 10.0;
  c.z += cos( uTime * 0.35 + aSeed.w * 30.0 ) * ( 2.0 + grow * 6.0 ) + ( aSeed.w - 0.5 ) * 10.0;
  float size = mix( 9.0, 26.0, grow ) * ( 0.85 + 0.3 * aSeed.y );
  // 카메라 쪽으로 돌기(세로 축) + 살짝 기우뚱
  vec3 toCam = cameraPosition - c;
  float yaw = atan( toCam.x, toCam.z );
  float tilt = sin( uTime * 0.8 + aSeed.z * 20.0 ) * 0.18;
  vec3 p = position;
  p = vec3( p.x * cos( tilt ) - p.y * sin( tilt ), p.x * sin( tilt ) + p.y * cos( tilt ), p.z );
  vec3 n = vec3( normal.x * cos( tilt ) - normal.y * sin( tilt ), normal.x * sin( tilt ) + normal.y * cos( tilt ), normal.z );
  float cy = cos( yaw ), sy = sin( yaw );
  p = vec3( p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy );
  n = vec3( n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy );
  // 위로 오를수록 하트가 '퐁' 부풀었다 사르르
  float puff = 1.0 + 0.06 * sin( uTime * 2.0 + aSeed.x * 40.0 );
  vec4 wp = vec4( c + p * size * puff, 1.0 );
  vN = n;
  vAge = age;
  vA = smoothstep( 0.0, 0.08, age ) * ( 1.0 - smoothstep( 0.55, 1.0, age ) );
  vDist = length( wp.xz - cameraPosition.xz );
  gl_Position = projectionMatrix * viewMatrix * dlCurve( wp );
}`;

const HEART_FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform float uAmount;
varying vec3 vN;
varying float vA;
varying float vAge;
varying float vDist;
void main() {
  vec3 n = normalize( vN );
  float up = n.y * 0.6 + dot( n, normalize( uSunDir ) ) * 0.4 + n.z * 0.2;
  vec3 c = mix( uShade, uLit, smoothstep( -0.5, 0.6, up ) );
  // 갓 나온 하트는 분홍이 진하고, 오르면서 하얗게 바랜다
  c = mix( c, uLit, smoothstep( 0.2, 0.9, vAge ) * 0.5 );
  c = mix( c, uFogColor, smoothstep( uFogRange.x, uFogRange.y, vDist ) * 0.8 );
  float a = vA * uAmount * 0.85;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( c, a );
  #include <colorspace_fragment>
}`;

/** 통통한 하트(폭 1, 가운데 원점, 앞 = +z) */
function puffyHeart(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.42);
  s.bezierCurveTo(0.12, -0.3, 0.5, -0.08, 0.5, 0.16);
  s.bezierCurveTo(0.5, 0.4, 0.28, 0.5, 0.15, 0.46);
  s.bezierCurveTo(0.06, 0.43, 0.02, 0.36, 0, 0.3);
  s.bezierCurveTo(-0.02, 0.36, -0.06, 0.43, -0.15, 0.46);
  s.bezierCurveTo(-0.28, 0.5, -0.5, 0.4, -0.5, 0.16);
  s.bezierCurveTo(-0.5, -0.08, -0.12, -0.3, 0, -0.42);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.12, bevelSegments: 5, curveSegments: 14 });
  g.center();
  g.computeVertexNormals();
  return g;
}

/** 화산 분화구 자리(지형 특징 'feat:dino:volcano') + 연기가 나오는 높이 */
export function volcanoVent(island: Ctx['island']): THREE.Vector3 | null {
  const f = island.worldFeatures().find((x) => x.id === 'feat:dino:volcano');
  if (!f) return null;
  // 분화구 둘레(테두리) 중 가장 높은 곳 — 연기는 테두리 높이에서 시작
  let rim = island.heightAt(f.x, f.z);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rim = Math.max(rim, island.heightAt(f.x + Math.cos(a) * 40, f.z + Math.sin(a) * 40));
  }
  return new THREE.Vector3(f.x, rim - 6, f.z);
}

export function buildHeartSmoke(ctx: Ctx, count = 14) {
  const geo = new THREE.InstancedBufferGeometry();
  const base = puffyHeart();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('normal', base.attributes.normal);
  const rnd = ctx.rng('atmo:heartsmoke');
  const seed = new Float32Array(count * 4);
  // 나이 차례를 엇갈리게(앞 절반만 그려도 고르게 피어오르게 — 낮음 품질)
  for (let i = 0; i < count; i++) {
    const slot = (i * 2) % count + (i * 2 >= count ? 1 : 0);
    seed.set([slot / count + rnd() * 0.03, rnd(), rnd(), rnd()], i * 4);
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = count;
  const vent = volcanoVent(ctx.island) ?? new THREE.Vector3();
  const uniforms = {
    uTime: { value: 0 }, uVent: { value: vent.clone() }, uWind: { value: new THREE.Vector3(0.8, 0, 0.35) }, uLife: { value: 14 },
    uLit: { value: new THREE.Color('#fff4f8') }, uShade: { value: new THREE.Color('#ffb3cc') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uFogColor: { value: new THREE.Color('#dfcbb8') },
    uFogRange: { value: new THREE.Vector2(900, 3200) }, uAmount: { value: 0 },
    uCurveK: curveUniforms.uCurveK, uCurveOrigin: curveUniforms.uCurveOrigin,
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: HEART_VERT, fragmentShader: HEART_FRAG, transparent: true, depthWrite: false, fog: false });
  mat.userData.noCurve = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'atmo-heart-smoke';
  mesh.frustumCulled = false;
  mesh.userData.noCurve = true;
  mesh.visible = false;
  const lit = new THREE.Color(), shade = new THREE.Color();
  /** 카메라가 화산에서 이 거리 안이면 보인다 */
  const SHOW = 3200;
  const update = (t: number, cam: THREE.Vector3, amount: number, p: TodPreset, sunDir: THREE.Vector3, half: boolean) => {
    const d = Math.hypot(cam.x - vent.x, cam.z - vent.z);
    const a = amount * (1 - smoothstep01(SHOW * 0.8, SHOW, d));
    mesh.visible = a > 0.01;
    if (!mesh.visible) return;
    uniforms.uTime.value = t;
    uniforms.uAmount.value = a;
    // 장면 빛을 따라(밤엔 은은한 라벤더 분홍, 낮엔 솜사탕 분홍)
    lit.set('#fff4f8').lerp(shade.set(p.cloudLit), 0.35);
    uniforms.uLit.value.copy(lit);
    uniforms.uShade.value.set('#ffb3cc').lerp(shade.set(p.cloudShade), 0.4);
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uFogColor.value.set(p.fogColor);
    const far = p.worldFog?.far ?? 1100;
    uniforms.uFogRange.value.set(far * 0.8, far * 2.8);
    geo.instanceCount = half ? Math.ceil(count / 2) : count;
  };
  return { mesh, update, vent };
}

const smoothstep01 = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
