// 뭉게구름 — 카메라를 따라다니는 아주 먼 고리 두 겹(지평선 줄 + 하늘 높이 뜬 큰 적운).
// 한 겹 = 지오메트리 하나(드로우콜 1). 겉보기 지평선(휘는 땅 너머) 위에 앉아 아주 천천히 흐른다.
// 아주 멀리(2.4~3.4 km) 두어 가까운 섬·산이 구름을 가리고, 구름은 먼 섬 실루엣 뒤에 선다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Ctx } from '../../core/types';
import type { TodPreset } from '../../core/presets';
import { CURVE_GLSL_HEAD, curveUniforms } from '../../core/curve';

const VERT = /* glsl */ `
attribute float aH;
attribute float aFar;
varying vec3 vWN;
varying float vH;
varying float vFar;
varying vec3 vViewDir;
void main() {
  vWN = normalize( mat3( modelMatrix ) * normal );
  vH = aH;
  vFar = aFar;
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vViewDir = normalize( cameraPosition - wp.xyz );
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uOpacity;
varying vec3 vWN;
varying float vH;
varying float vFar;
varying vec3 vViewDir;
void main() {
  vec3 n = normalize( vWN );
  vec3 sd = normalize( uSunDir );
  // 동숲 구름처럼 두 톤 + 부드러운 경계: 위·해 쪽 밝게, 아래는 하늘빛 그늘
  float up = n.y * 0.7 + dot( n, sd ) * 0.4;
  float lit = smoothstep( -0.6, 0.5, up );
  vec3 c = mix( uShade, uLit, lit );
  // 해를 등진 가장자리(역광 은빛 테)·솜털 테
  vec3 v = normalize( vViewDir );
  float fr = pow( 1.0 - max( dot( n, v ), 0.0 ), 2.5 );
  float back = pow( max( dot( -v, sd ), 0.0 ), 3.0 );
  c = mix( c, uLit, fr * 0.4 );
  c += uSunColor * fr * back * 0.5;
  // 바닥은 평평하고 조금 더 그늘, 아래쪽은 지평선 공기에 녹인다
  c = mix( c, uShade * 0.92, ( 1.0 - smoothstep( 0.0, 0.25, vH ) ) * 0.35 );
  float haze = ( 1.0 - smoothstep( 0.0, 0.55, vH ) ) * 0.55 + vFar * 0.35;
  c = mix( c, uHaze, clamp( haze, 0.0, 0.85 ) );
  gl_FragColor = vec4( c, uOpacity );
  #include <colorspace_fragment>
}`;

/** 적운 한 덩이(로컬: 폭 ~2, 높이 ~1.2, 바닥 y=0). aH = 0(바닥)..1(꼭대기) */
function cumulus(rnd: () => number, tall: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (x: number, y: number, z: number, r: number) => {
    // 구 법선(부드러운 면) — Icosahedron 은 면마다 꼭짓점이 따로라 computeVertexNormals 를 쓰면 각져 보인다
    const g = new THREE.IcosahedronGeometry(r, 3);
    const gp = g.attributes.position as THREE.BufferAttribute;
    const nn = new Float32Array(gp.count * 3);
    for (let i = 0; i < gp.count; i++) {
      const l = Math.hypot(gp.getX(i), gp.getY(i), gp.getZ(i)) || 1;
      nn[i * 3] = gp.getX(i) / l; nn[i * 3 + 1] = gp.getY(i) / l; nn[i * 3 + 2] = gp.getZ(i) / l;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    g.translate(x, y, z);
    parts.push(g);
  };
  // 바닥 줄: 가운데가 큰 둥근 봉우리들
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const tx = (i / (n - 1) - 0.5) * 2;
    const mid = 1 - Math.abs(tx);
    const r = 0.26 + 0.3 * mid * (0.8 + 0.4 * rnd());
    add(tx * 0.95, r * 0.6, (rnd() - 0.5) * 0.3, r);
  }
  // 둘째 줄(콜리플라워)
  const m = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < m; i++) {
    const tx = (i / Math.max(1, m - 1) - 0.5) * 1.1 + (rnd() - 0.5) * 0.15;
    const r = (0.3 + rnd() * 0.16) * (0.8 + tall * 0.4);
    add(tx, 0.55 + r * 0.55 * tall, (rnd() - 0.5) * 0.25, r);
  }
  // 윗면에 작은 몽글몽글(실루엣이 공 몇 개로 보이지 않게)
  const bumps = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < bumps; i++) {
    const tx = (rnd() - 0.5) * 1.6;
    const mid = 1 - Math.abs(tx) / 0.9;
    add(tx, 0.35 + Math.max(mid, 0) * (0.45 + tall * 0.35) + rnd() * 0.1, 0.12 + rnd() * 0.18, 0.16 + rnd() * 0.12);
  }
  // 꼭대기 봉우리
  const k = 1 + Math.floor(rnd() * 2 + tall);
  for (let i = 0; i < k; i++) {
    const r = (0.26 + rnd() * 0.14) * (0.8 + tall * 0.5);
    add((rnd() - 0.5) * 0.6, 0.9 + tall * 0.55 + rnd() * 0.15, (rnd() - 0.5) * 0.2, r);
  }
  const geo = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // 바닥 평평하게 눌러 앉힌다
  let top = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.1) pos.setY(i, 0.1 + (y - 0.1) * 0.12);
    top = Math.max(top, pos.getY(i));
  }
  const h = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) h[i] = THREE.MathUtils.clamp((pos.getY(i) - 0.08) / (top - 0.08), 0, 1);
  geo.setAttribute('aH', new THREE.BufferAttribute(h, 1));
  return geo;
}

interface LayerOpts { stretch: number; key: string; count: number; R: [number, number]; elev: [number, number]; size: [number, number]; tall: [number, number]; far: number }

function buildLayer(ctx: Ctx, o: LayerOpts) {
  const rnd = ctx.rng('atmo:clouds:' + o.key);
  const geos: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), mtx = new THREE.Matrix4();
  for (let i = 0; i < o.count; i++) {
    const tall = o.tall[0] + rnd() * (o.tall[1] - o.tall[0]);
    const g = cumulus(rnd, tall);
    const az = (i / o.count) * Math.PI * 2 + (rnd() - 0.5) * (Math.PI * 2 / o.count) * 0.8;
    const R = o.R[0] + rnd() * (o.R[1] - o.R[0]);
    const el = THREE.MathUtils.degToRad(o.elev[0] + rnd() * (o.elev[1] - o.elev[0]));
    const size = (o.size[0] + rnd() * (o.size[1] - o.size[0])) * (R / 300);
    const sx = size * (o.stretch + rnd() * 0.4), sy = size * (0.75 + rnd() * 0.35), sz = size * 0.65;
    // 앞면(+z)이 카메라(원점)를 보게
    e.set(0, Math.atan2(-Math.cos(az), -Math.sin(az)), 0);
    q.setFromEuler(e);
    mtx.compose(new THREE.Vector3(Math.cos(az) * R, Math.tan(el) * R, Math.sin(az) * R), q, new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(mtx);
    const far = new Float32Array((g.attributes.position as THREE.BufferAttribute).count).fill(o.far * (0.6 + 0.4 * rnd()));
    g.setAttribute('aFar', new THREE.BufferAttribute(far, 1));
    geos.push(g);
  }
  const geo = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  return geo;
}

/** 구름 빛(먼 고리·세계 구름이 같이 쓴다) — buildClouds 의 onTod 가 채운다 */
const TONE = {
  uLit: { value: new THREE.Color('#ffffff') },
  uShade: { value: new THREE.Color('#b9d6f2') },
  uHaze: { value: new THREE.Color('#cfeeff') },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color('#ffffff') },
  uOpacity: { value: 1 },
};

export function buildClouds(ctx: Ctx) {
  const group = new THREE.Group();
  group.name = 'clouds';
  group.userData.noCurve = true;
  const uniforms = TONE;
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: false, transparent: false });
  mat.userData.noCurve = true;

  // 지평선 줄: 낮게 깔린 뭉게구름 띠(먼 섬 뒤)
  const low = new THREE.Mesh(buildLayer(ctx, { stretch: 1.2, key: 'low', count: 30, R: [2900, 3300], elev: [-0.4, 1.4], size: [9, 17], tall: [0.2, 0.7], far: 0.5 }), mat);
  // 하늘 높이 큰 적운: 몇 덩이만 크게(젤다 하늘처럼 시선이 머무는 곳)
  const high = new THREE.Mesh(buildLayer(ctx, { stretch: 0.85, key: 'high', count: 11, R: [2300, 2800], elev: [4, 13], size: [16, 26], tall: [0.7, 1.0], far: 0.1 }), mat);
  for (const m of [low, high]) {
    m.userData.noCurve = true;
    m.frustumCulled = false;
    m.renderOrder = -0.5;
    group.add(m);
  }

  const sky = () => ctx.scene.getObjectByName('sky') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined;

  ctx.onUpdate((t) => {
    const cam = ctx.camera;
    group.position.copy(cam.position);
    // 겉보기 지평선이 내려가면(높이 올라가면) 구름도 따라 내려간다
    const hs = sky()?.material.uniforms.uHorizon?.value ?? 0;
    const he = Math.asin(THREE.MathUtils.clamp(hs, -1, 1));
    low.position.y = Math.tan(he) * 3100;
    high.position.y = Math.tan(he) * 2550;
    low.rotation.y = t * 0.0025;
    high.rotation.y = t * 0.004 + 1.3;
  });

  ctx.onTod((_name: string, p: TodPreset) => {
    uniforms.uLit.value.set(p.cloudLit);
    uniforms.uShade.value.set(p.cloudShade);
    uniforms.uHaze.value.set(p.skyHorizon);
    uniforms.uSunColor.value.set(p.sunColor);
    uniforms.uOpacity.value = p.cloudOpacity;
    group.visible = p.cloudOpacity > 0.01;
    mat.transparent = p.cloudOpacity < 1;
    worldMat.transparent = p.cloudOpacity < 1;
    worldMat.depthWrite = p.cloudOpacity >= 1;
    worldMat.visible = p.cloudOpacity > 0.01;
    const az = THREE.MathUtils.degToRad(p.sunAzimuth), el = THREE.MathUtils.degToRad(p.sunElevation);
    uniforms.uSunDir.value.set(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az));
  });
  return group;
}

// ───────── 세계 구름: 바다 위 120~200 m 에 둥실 뜬 몽실 뭉게구름(청크 스트리밍) ─────────
// 청크 하나 = InstancedMesh 하나(공유 덩이 지오메트리 3벌 중 하나 + 인스턴스마다 크기·방향). 장식 레이어(detail:true).

const WORLD_VERT = /* glsl */ `
${CURVE_GLSL_HEAD}
attribute float aH;
uniform vec3 uCamPos;
varying vec3 vWN;
varying float vH;
varying float vDist;
varying vec3 vViewDir;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = modelMatrix * instanceMatrix;
  #endif
  vWN = normalize( mat3( m ) * normal );
  vH = aH;
  vec4 wp = m * vec4( position, 1.0 );
  vDist = length( wp.xz - uCamPos.xz );
  vViewDir = normalize( cameraPosition - wp.xyz );
  gl_Position = projectionMatrix * viewMatrix * dlCurve( wp );
}`;

const WORLD_FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uOpacity;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
varying vec3 vWN;
varying float vH;
varying float vDist;
varying vec3 vViewDir;
void main() {
  vec3 n = normalize( vWN );
  vec3 sd = normalize( uSunDir );
  float up = n.y * 0.7 + dot( n, sd ) * 0.4;
  vec3 c = mix( uShade, uLit, smoothstep( -0.6, 0.5, up ) );
  vec3 v = normalize( vViewDir );
  float fr = pow( 1.0 - max( dot( n, v ), 0.0 ), 2.5 );
  float back = pow( max( dot( -v, sd ), 0.0 ), 3.0 );
  c = mix( c, uLit, fr * 0.4 );
  c += uSunColor * fr * back * 0.5;
  // 납작한 바닥은 조금 더 그늘
  c = mix( c, uShade * 0.94, ( 1.0 - smoothstep( 0.0, 0.25, vH ) ) * 0.3 );
  // 멀수록 하늘 공기에 녹는다(땅 안개보다 느슨하게 — 구름은 하늘에 있으니까)
  float f = smoothstep( uFogRange.x, uFogRange.y, vDist );
  c = mix( c, mix( uHaze, uFogColor, 0.5 ), f * 0.92 );
  float a = uOpacity * ( 1.0 - smoothstep( 0.85, 1.0, f ) );
  gl_FragColor = vec4( c, a );
  #include <colorspace_fragment>
}`;

const worldUniforms = {
  ...TONE,
  uCamPos: { value: new THREE.Vector3() },
  uFogColor: { value: new THREE.Color('#cfeeff') },
  uFogRange: { value: new THREE.Vector2(600, 2400) },
  uCurveK: curveUniforms.uCurveK, uCurveOrigin: curveUniforms.uCurveOrigin,
};
const worldMat = new THREE.ShaderMaterial({ uniforms: worldUniforms, vertexShader: WORLD_VERT, fragmentShader: WORLD_FRAG, fog: false });
worldMat.userData.noCurve = true; // 곡률은 셰이더에 직접

/** 세계 구름 청크 한 변(크게 잡아 청크 수 = 드로우콜 수를 줄인다)·반경 / 높이 / 덩이 폭(m) */
export const WORLD_CLOUD = { size: 960, radius: 1500, minY: 120, maxY: 200, width: [55, 110] as [number, number] };

/** 청크 안 구름 자리(결정적) — 바다 위는 넉넉히, 땅 위는 높은 산을 피해 듬성듬성 */
export function worldCloudSpots(rng: (k: string) => () => number, heightAt: (x: number, z: number) => number, cx: number, cz: number) {
  const S = WORLD_CLOUD.size;
  const rnd = rng(`atmosphere-clouds:${cx},${cz}`);
  const out: Array<{ x: number; y: number; z: number; w: number; yaw: number; sy: number; v: number }> = [];
  const variant = Math.floor(rnd() * 3);
  // 청크가 크니(960 m) 덩이를 몇 개씩 — 드로우콜은 청크당 1
  const n = Math.floor(rnd() * 6.5);
  for (let i = 0; i < n; i++) {
    const x = (cx + 0.1 + rnd() * 0.8) * S, z = (cz + 0.1 + rnd() * 0.8) * S;
    const y = WORLD_CLOUD.minY + rnd() * (WORLD_CLOUD.maxY - WORLD_CLOUD.minY);
    const w = WORLD_CLOUD.width[0] + rnd() * (WORLD_CLOUD.width[1] - WORLD_CLOUD.width[0]);
    const yaw = rnd() * Math.PI * 2, sy = 0.8 + rnd() * 0.35, keep = rnd();
    const h = heightAt(x, z);
    // 땅 위: 40% 만 남기고, 산꼭대기와는 60 m 이상 띄운다
    if (h > 0 && (keep > 0.4 || y - h < 60)) continue;
    out.push({ x, y, z, w, yaw, sy, v: variant });
  }
  return out;
}

let worldGeos: THREE.BufferGeometry[] | null = null;
function worldCloudGeos(ctx: Ctx) {
  if (worldGeos) return worldGeos;
  const rnd = ctx.rng('atmo:clouds:world');
  worldGeos = [0.45, 0.7, 0.95].map((tall) => {
    const g = cumulus(rnd, tall);
    // 폭 ~2 → 1 로(인스턴스 크기 = 폭 m)
    g.scale(0.5, 0.5, 0.62);
    g.userData.shared = true;
    return g;
  });
  return worldGeos;
}

export function buildWorldClouds(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return null;
  const geos = worldCloudGeos(ctx);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  game.chunks.add({
    key: 'atmosphere-clouds', size: WORLD_CLOUD.size, radius: WORLD_CLOUD.radius, world: 'earth', detail: true,
    build: ({ cx, cz }) => {
      const spots = worldCloudSpots(ctx.rng, ctx.island.heightAt, cx, cz);
      if (!spots.length) return null;
      const mesh = new THREE.InstancedMesh(geos[spots[0].v], worldMat, spots.length);
      mesh.name = 'atmo-world-clouds';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.noCurve = true;
      spots.forEach((s, i) => {
        e.set(0, s.yaw, 0);
        q.setFromEuler(e);
        v.set(s.x, s.y, s.z);
        sc.set(s.w, s.w * s.sy, s.w);
        m4.compose(v, q, sc);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      return mesh;
    },
    dispose: (obj) => { (obj as THREE.InstancedMesh).dispose?.(); },
  });
  const fog = () => ctx.scene.fog as THREE.Fog | null;
  ctx.onUpdate(() => {
    worldUniforms.uCamPos.value.copy(ctx.camera.position);
    const f = fog();
    if (f) {
      worldUniforms.uFogColor.value.copy(f.color);
      // 땅 안개 거리의 0.6 ~ 2.1 배(안개 날씨면 구름도 금방 숨는다)
      worldUniforms.uFogRange.value.set(f.far * 0.6, Math.max(f.far * 2.1, f.far * 0.6 + 50));
    }
  });
  return worldMat;
}
