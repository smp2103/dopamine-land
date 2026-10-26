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
  gl_PointSize = uSize * ( 0.6 + 0.8 * fract( aSeed * 13.7 ) ) * ( 300.0 / -mv.z );
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
    ff.uniforms.uAmount.value = p.fireflies * 2.2;
    ff.pts.visible = p.fireflies > 0;
    bf.visible = p.butterflies > 0;
    bf.children.forEach((c, i) => { c.visible = i < Math.round(p.butterflies * bf.children.length); });
  });
  return group;
}
