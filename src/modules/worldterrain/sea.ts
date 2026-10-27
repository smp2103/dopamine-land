// 세계 바다 — 플레이어를 따라다니는 큰 판(가운데 촘촘, 멀수록 성김) + 셰이더.
// 깊이·해안 거리는 세계 전체를 16 m 칸으로 한 번 구운 텍스처에서(해안 거리는 거의 선형이라 보간이 정확하다).
// 해안 얕은 민트 → 깊은 파랑, 해안선 거품 줄이 밀려왔다 빠짐, 잔물결 법선, 해 반짝임, 수평선까지.
// 꼬르륵 해구(GDD 2.3)는 텍스처 B 칸에 세기를 구워 짙은 남색 + 발광 생물 점으로.
import * as THREE from 'three';
import type * as Island from '../../core/island';
import { COMMON_GLSL } from '../terrain/glsl';
import { getField, sharedUniforms } from '../terrain/field';

const SEA_TEX = { min: -4096, size: 8192, n: 512 };

const sm = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function bakeSeaField(island: typeof Island): THREE.DataTexture {
  const n = SEA_TEX.n, cell = SEA_TEX.size / n;
  const data = new Uint16Array(n * n * 4);
  const h16 = THREE.DataUtils.toHalfFloat;
  const isl = island.ISLANDS;
  for (let j = 0; j < n; j++) {
    const z = SEA_TEX.min + (j + 0.5) * cell;
    for (let i = 0; i < n; i++) {
      const x = SEA_TEX.min + (i + 0.5) * cell;
      let best = -1e9;
      let bestD: Island.IslandDef | null = null;
      for (const d of isl) {
        if (Math.abs(x - d.x) > d.r * 1.6 + 400 || Math.abs(z - d.z) > d.r * 1.6 + 400) continue;
        const c = island.islandCoast(d, x, z);
        if (c > best) { best = c; bestD = d; }
      }
      if (best < -1e8) best = -400;
      let h = 3;
      if (best < 0) h = island.worldSample(x, z).h;
      const k = (j * n + i) * 4;
      data[k] = h16(Math.max(-40, Math.min(10, h)));
      data[k + 1] = h16(Math.max(-400, Math.min(60, best)));
      // 해구 세기(world.ts seaFloor 와 같은 식: 타원 안쪽 × 해안 비탈 120 m 지킴)
      data[k + 2] = h16(best < 0 ? island.trenchAt(x, z) * sm(0, 120, -best) : 0);
      // A = 이 칸에 바다 물이 있나(바다 1 · 섬 안 석호·맹그로브 1 · 그냥 땅 0).
      // 섬 안 호수 바닥이 해수면(0) 아래로 파인 곳에서 바다 판이 비쳐 하얀 거품이 깔리지 않게 셰이더가 0 인 곳을 버린다.
      data[k + 3] = h16(best <= 0 || (bestD?.theme === 'coral' && seaWaterNear(island, x, z, cell)) ? 1 : 0);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 섬 안이지만 바다와 이어진 물(석호·맹그로브 수로)이 칸 안에 있나 — 좁은 수로도 놓치지 않게 칸을 3×3 으로 훑는다 */
function seaWaterNear(island: typeof Island, x: number, z: number, cell: number): boolean {
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const s = island.worldSample(x + i * cell * 0.4, z + j * cell * 0.4);
    if (s.coast <= 0 || (s.water === 0 && s.h < 0)) return true;
  }
  return false;
}

/** 가운데 1 m, 바깥으로 갈수록 성긴 판(반경 ~4.6 km) */
function seaGeometry(): THREE.BufferGeometry {
  const N = 160;
  const axis: number[] = [];
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1;
    const a = Math.abs(u);
    axis.push(Math.sign(u) * (a * 80 + a * a * a * 4120));
  }
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) pos.set([axis[i], 0, axis[j]], (j * (N + 1) + i) * 3);
  const idx: number[] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, d, a, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 7000);
  return g;
}

export function buildSea(island: typeof Island, villageRect: THREE.Vector4): THREE.Mesh {
  const field = getField(island);
  const tex = bakeSeaField(island);
  // 엔진 안개(fog_fragment)를 이 큰 판에 쓰면 화면 전체가 안개색으로 덮이는 문제가 있어 안개는 직접 섞는다
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0, transparent: true, fog: false });
  const c = (h: string) => new THREE.Color(h);
  const uniforms = {
    uField: { value: field.tex },
    uFieldRect: { value: field.rect },
    uTime: sharedUniforms.uTime,
    uSea: { value: tex },
    uSeaRect: { value: new THREE.Vector3(SEA_TEX.min, SEA_TEX.min, 1 / SEA_TEX.size) },
    uVillageSea: { value: villageRect },
    uShallow: { value: c('#9df0dc') },
    uMid: { value: c('#46cbd6') },
    uDeep: { value: c('#2f95d6') },
    uAbyss: { value: c('#2277c4') },
    uTrench: { value: c('#1a3a86') },
    uFogC: { value: new THREE.Color('#bfe3f0') },
    uFogR: { value: new THREE.Vector2(300, 1200) },
  };
  mat.userData.fog = { color: uniforms.uFogC, range: uniforms.uFogR };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP;
        uniform sampler2D uSea;
        uniform vec3 uSeaRect;
        uniform vec4 uVillageSea;
        uniform vec3 uShallow, uMid, uDeep, uAbyss, uTrench, uFogC;
        uniform vec2 uFogR;
        ${COMMON_GLSL}
        // R = 바닥 높이, G = 해안 거리, B = 해구 세기
        vec3 seaField( vec2 xz ) {
          vec2 uv = ( xz - uSeaRect.xy ) * uSeaRect.z;
          if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return vec3( -40.0, -400.0, 0.0 );
          return texture2D( uSea, uv ).rgb;
        }
        // 바다 물이 있는 칸인가(A) — 해안 12 m 안쪽 땅은 늘 그린다(해변 물결막)
        bool seaWet( vec2 xz ) {
          vec2 uv = ( xz - uSeaRect.xy ) * uSeaRect.z;
          if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return true;
          vec4 t = texture2D( uSea, uv );
          return t.g < 12.0 || t.a > 0.5;
        }
        float dlGlow = 0.0;
        float dlRipple( vec2 q ) {
          return 0.6 * dlNoise( q * 1.1 + uTime * vec2( 0.22, 0.13 ) ) + 0.4 * dlNoise( q * 2.7 - uTime * vec2( 0.17, 0.31 ) );
        }`)
      .replace('void main() {', `void main() {
        if ( !seaWet( vWP.xz ) ) discard;
        if ( vWP.x > uVillageSea.x && vWP.x < uVillageSea.z && vWP.z > uVillageSea.y && vWP.z < uVillageSea.w ) discard;`)
      .replace('#include <color_fragment>', SEA_COLOR)
      .replace('#include <normal_fragment_maps>', SEA_NORMAL)
      .replace('#include <emissivemap_fragment>', SEA_SPARKLE)
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix( gl_FragColor.rgb, uFogC, smoothstep( uFogR.x, uFogR.y, vViewPosition.z ) );');
  };
  mat.customProgramCacheKey = () => 'wt2-sea';
  const mesh = new THREE.Mesh(seaGeometry(), mat);
  mesh.name = 'world-sea';
  mesh.renderOrder = 1;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.world = 'earth';
  return mesh;
}

const SEA_COLOR = /* glsl */ `
  vec3 SF = seaField( vWP.xz );
  float depth = max( 0.0, -SF.x );
  float coastD = SF.y;
  float dist = length( vWP.xz - cameraPosition.xz );
  float lace = smoothstep( -0.4, 0.35, dlNoise( vWP.xz * 0.9 + vec2( uTime * 0.12, -uTime * 0.09 ) ) )
             * smoothstep( -0.6, 0.2, dlNoise( vWP.xz * 2.3 - uTime * 0.1 ) );
  // 마을 바다(water.ts)와 같은 깊이 곡선 — 경계에서 색이 이어진다
  float dk = smoothstep( 0.0, 1.1, depth ), dk2 = smoothstep( 0.9, 4.0, depth ), dk3 = smoothstep( 14.0, 36.0, depth );
  vec3 wc = mix( uShallow, uMid, dk );
  wc = mix( wc, uDeep, dk2 );
  wc = mix( wc, uAbyss, dk3 );
  // 꼬르륵 해구: 짙은 남색으로 가라앉고, 가까우면 발광 생물 점이 깜빡
  float trench = SF.z;
  if ( trench > 0.001 ) {
    wc = mix( wc, uTrench, trench * 0.85 );
    vec2 gq = vWP.xz * 0.22 + vec2( uTime * 0.05, -uTime * 0.03 );
    vec2 gi = floor( gq ), gf = fract( gq );
    vec2 gp = dlHash2( gi );
    float on = step( 0.82, dlHash( gi + 1.7 ) );
    float blink = pow( 0.5 + 0.5 * sin( uTime * ( 0.8 + gp.x * 1.6 ) + gp.y * 6.2831 ), 4.0 );
    dlGlow = smoothstep( 0.1, 0.0, length( gf - ( 0.2 + gp * 0.6 ) ) ) * on * blink * trench * ( 1.0 - smoothstep( 40.0, 180.0, dist ) );
  }
  // 넓은 색 얼룩(바다가 단색판이 아니게)
  wc *= 1.0 + 0.04 * dlNoise( vWP.xz * 0.006 + uTime * 0.004 ) * smoothstep( 60.0, 200.0, dist );
  float alpha = mix( 0.22, 0.8, smoothstep( 0.0, 1.2, depth ) );
  alpha = mix( alpha, 0.97, dk2 );
  alpha = mix( alpha, 1.0, dk3 );
  alpha = mix( alpha, 1.0, trench );
  // 해안선을 따라 밀려오는 거품 줄(해안 거리 -14..0 m 사이를 바깥에서 안쪽으로)
  float foam = 0.0;
  if ( coastD > -40.0 ) {
    float ph = dlWavePhase( vWP.xz );
    for ( int k = 0; k < 2; k++ ) {
      float q = fract( ph + float( k ) * 0.5 );
      float lineD = -16.0 * ( 1.0 - q ) - 0.4;
      float lw = 0.55 + 0.9 * ( 1.0 - q );
      float line = smoothstep( lw, 0.0, abs( coastD - lineD + 0.8 * dlNoise( vWP.xz * 0.15 ) ) );
      foam = max( foam, line * smoothstep( 0.0, 0.3, q ) * ( 1.0 - smoothstep( 0.85, 1.0, q ) ) * mix( 0.35, 1.0, lace ) );
    }
    // 물가에 늘 붙은 얇은 거품
    foam = max( foam, smoothstep( -2.2, -0.2, coastD ) * mix( 0.5, 1.0, lace ) );
    foam *= 1.0 - smoothstep( 300.0, 900.0, dist );
  }
  wc = mix( wc, vec3( 1.0 ), foam * 0.9 );
  alpha = max( alpha, foam * 0.9 );
  diffuseColor = vec4( wc, alpha );
`;

const SEA_NORMAL = /* glsl */ `
  #include <normal_fragment_maps>
  {
    float fadeN = 1.0 - smoothstep( 40.0, 260.0, length( vWP.xz - cameraPosition.xz ) );
    vec2 q = vWP.xz * 0.35;
    float k = 0.07 * fadeN + 0.004;
    float e = 0.05;
    float h0 = 0.0, hx = 0.0, hz = 0.0;
    if ( fadeN > 0.0 ) { h0 = dlRipple( q ); hx = dlRipple( q + vec2( e, 0.0 ) ); hz = dlRipple( q + vec2( 0.0, e ) ); }
    // 큰 너울
    vec2 q2 = vWP.xz * 0.025;
    float g0 = dlNoise( q2 + uTime * 0.03 ), gx = dlNoise( q2 + vec2( e, 0.0 ) + uTime * 0.03 ), gz = dlNoise( q2 + vec2( 0.0, e ) + uTime * 0.03 );
    vec3 nW = normalize( vec3( -( hx - h0 ) / e * k - ( gx - g0 ) / e * 0.03, 1.0, -( hz - h0 ) / e * k - ( gz - g0 ) / e * 0.03 ) );
    normal = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );
  }
`;

const SEA_SPARKLE = /* glsl */ `
  #include <emissivemap_fragment>
  {
    vec3 V = normalize( vViewPosition );
    float fr = pow( 1.0 - clamp( dot( V, normal ), 0.0, 1.0 ), 5.0 );
    diffuseColor.a = mix( diffuseColor.a, 1.0, fr * 0.6 );
    // 해구 발광 점(빛과 상관없이 스스로 빛난다 — 밤에 더 또렷)
    totalEmissiveRadiance += vec3( 0.45, 0.95, 1.0 ) * dlGlow * 1.4;
#if NUM_DIR_LIGHTS > 0
    vec3 L = directionalLights[ 0 ].direction;
    vec3 R = reflect( -V, normal );
    float sunA = pow( max( dot( R, L ), 0.0 ), 12.0 );
    vec2 cq = vWP.xz * 1.2;
    vec2 ci = floor( cq ), cf = fract( cq );
    vec2 rp = dlHash2( ci );
    float tw = pow( 0.5 + 0.5 * sin( uTime * ( 2.0 + rp.x * 3.0 ) + rp.y * 6.2831 ), 10.0 ) * step( 0.45, dlHash( ci + 7.7 ) );
    vec2 dd = ( cf - ( 0.2 + rp * 0.6 ) ) * vec2( 1.0, 2.2 );
    float star = smoothstep( 0.12, 0.0, length( dd ) ) * tw * ( 1.0 - smoothstep( 30.0, 110.0, length( vWP.xz - cameraPosition.xz ) ) );
    float glint = sunA * 0.18 * smoothstep( 0.3, 0.95, sunA );
    float sp = star * sunA + glint;
    totalEmissiveRadiance += directionalLights[ 0 ].color * sp * 1.3;
    diffuseColor.a = max( diffuseColor.a, min( 1.0, sp ) );
#endif
  }
`;
