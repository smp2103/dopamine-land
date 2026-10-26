// 지평선 뭉게구름 — 카메라를 따라다니는 고리. 겉보기 지평선(휘는 땅 너머) 바로 위에 앉아 천천히 흐른다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Ctx } from '../../core/types';
import type { TodPreset } from '../../core/presets';

const R = 300;

const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vWN;
varying float vLocalY;
varying vec3 vViewDir;
void main() {
  vN = normalize( normalMatrix * normal );
  vWN = normalize( mat3( modelMatrix ) * normal );
  vLocalY = position.y;
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vViewDir = normalize( cameraPosition - wp.xyz );
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform float uOpacity;
uniform float uBase;   // 구름 바닥(로컬 y)
uniform float uHeight; // 구름 높이(로컬)
varying vec3 vN;
varying vec3 vWN;
varying float vLocalY;
varying vec3 vViewDir;
void main() {
  vec3 n = normalize( vWN );
  // 위쪽·해 쪽은 밝게, 아래는 하늘색 그늘(동숲 구름처럼 단순한 두 톤 + 부드러운 경계)
  float up = n.y * 0.75 + dot( n, normalize( uSunDir ) ) * 0.35;
  float lit = smoothstep( -0.55, 0.45, up );
  vec3 c = mix( uShade, uLit, lit );
  // 가장자리 살짝 밝게(솜털 느낌)
  float fr = pow( 1.0 - max( dot( n, normalize( vViewDir ) ), 0.0 ), 3.0 );
  c = mix( c, uLit, fr * 0.35 );
  // 바닥은 지평선 안개에 녹인다
  float h = clamp( ( vLocalY - uBase ) / uHeight, 0.0, 1.0 );
  c = mix( uHaze, c, smoothstep( 0.0, 0.45, h ) * 0.75 + 0.25 );
  gl_FragColor = vec4( c, uOpacity );
  #include <colorspace_fragment>
}`;

function puff(rnd: () => number): THREE.BufferGeometry {
  // 큰 봉우리 몇 개 + 작은 봉우리, 바닥은 평평하게 잘라낸 듯 눌러서
  const parts: THREE.BufferGeometry[] = [];
  const n = 5 + Math.floor(rnd() * 4);
  const w = 1;
  for (let i = 0; i < n; i++) {
    const tx = (i / (n - 1) - 0.5) * 2 * w;
    const mid = 1 - Math.abs(tx) / w;
    const r = 0.32 + 0.38 * mid * (0.75 + 0.5 * rnd());
    const g = new THREE.IcosahedronGeometry(r, 5);
    g.translate(tx * (0.9 + 0.1 * rnd()), r * 0.55 + rnd() * 0.12 * mid, (rnd() - 0.5) * 0.25);
    parts.push(g);
  }
  // 위에 얹는 봉우리
  for (let i = 0; i < 2; i++) {
    const r = 0.3 + rnd() * 0.18;
    const g = new THREE.IcosahedronGeometry(r, 5);
    g.translate((rnd() - 0.5) * 0.8, 0.75 + rnd() * 0.25, (rnd() - 0.5) * 0.2);
    parts.push(g);
  }
  const geo = mergeGeometries(parts)!;
  // 바닥 평평하게
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.08) pos.setY(i, 0.08 + (y - 0.08) * 0.15);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildClouds(ctx: Ctx) {
  const rnd = ctx.rng('atmo:clouds');
  const group = new THREE.Group();
  group.name = 'clouds';
  group.userData.noCurve = true;
  const uniforms = {
    uLit: { value: new THREE.Color('#ffffff') },
    uShade: { value: new THREE.Color('#b9d6f2') },
    uHaze: { value: new THREE.Color('#cfeeff') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uOpacity: { value: 1 },
    uBase: { value: 0 },
    uHeight: { value: 1.2 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: false, transparent: false });
  mat.userData.noCurve = true;

  const ring = new THREE.Group();
  group.add(ring);
  const count = 26;
  const items: Array<{ mesh: THREE.Mesh; elev: number; az: number }> = [];
  for (let i = 0; i < count; i++) {
    const geo = puff(rnd);
    const m = new THREE.Mesh(geo, mat);
    m.userData.noCurve = true;
    m.frustumCulled = false;
    m.renderOrder = -0.5;
    const az = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
    const size = 9 + rnd() * 9;
    m.scale.set(size * (1.1 + rnd() * 0.5), size * (0.8 + rnd() * 0.3), size * 0.6);
    // 지평선 위로 살짝 다른 높이(도)
    const elev = THREE.MathUtils.degToRad(-0.3 + rnd() * 1.6);
    items.push({ mesh: m, elev, az });
    ring.add(m);
  }

  const sky = () => ctx.scene.getObjectByName('sky') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined;

  ctx.onUpdate((t) => {
    const cam = ctx.camera;
    group.position.copy(cam.position);
    const hs = sky()?.material.uniforms.uHorizon?.value ?? 0;
    const he = Math.asin(THREE.MathUtils.clamp(hs, -1, 1));
    const drift = t * 0.004;
    for (const it of items) {
      const a = it.az + drift;
      const e = he + it.elev;
      it.mesh.position.set(Math.cos(a) * R, Math.tan(e) * R, Math.sin(a) * R);
      // 앞면(+z)이 고리 중심(카메라)을 보게
      it.mesh.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
    }
  });

  ctx.onTod((_name: string, p: TodPreset) => {
    uniforms.uLit.value.set(p.cloudLit);
    uniforms.uShade.value.set(p.cloudShade);
    uniforms.uHaze.value.set(p.skyHorizon);
    uniforms.uOpacity.value = p.cloudOpacity;
    mat.transparent = p.cloudOpacity < 1;
    const az = THREE.MathUtils.degToRad(p.sunAzimuth), el = THREE.MathUtils.degToRad(p.sunElevation);
    uniforms.uSunDir.value.set(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az));
  });
  return group;
}
