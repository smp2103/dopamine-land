// 바다·강·폭포. 지형 높이를 구운 필드 텍스처로 깊이를 알아서
// 얕은 곳 민트 → 깊은 곳 파랑, 해안 거품(지형 쪽 물막과 같은 시계), 해 반짝임, 강 흐름 무늬.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { getField, sharedUniforms } from './terrain/field';
import { COMMON_GLSL } from './terrain/glsl';
import { buildRiver, buildFallCurtain } from './terrain/river';

export const order = 1;

type Kind = 'sea' | 'river' | 'fall';

const col = (hex: string) => new THREE.Color(hex);

function waterMaterial(ctx: Ctx, kind: Kind): THREE.MeshStandardMaterial {
  const field = getField(ctx.island);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: kind === 'fall' ? 0.5 : 0.12, metalness: 0,
    transparent: true, side: kind === 'fall' ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (kind === 'river') { mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -4; }
  const uniforms = {
    uField: { value: field.tex },
    uFieldRect: { value: field.rect },
    uTime: sharedUniforms.uTime,
    uShallow: { value: col('#9df0dc') },
    uMid: { value: col('#46cbd6') },
    uDeep: { value: col('#2f95d6') },
    uRiverA: { value: col('#8be6da') },
    uRiverB: { value: col('#3db4d0') },
    uFoam: { value: col('#ffffff') },
    uFallY: { value: new THREE.Vector2(2.58, 0.58) },
  };
  mat.userData.fallY = uniforms.uFallY;
  const def = kind === 'sea' ? 'DL_SEA' : kind === 'river' ? 'DL_RIVER' : 'DL_FALL';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.defines = { ...(sh.defines ?? {}), [def]: '' };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aFlow;
        varying vec3 vFlow;
        varying vec3 vWP;
        varying float vRestY;
        ${COMMON_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 wp0 = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vRestY = wp0.y;
        #ifdef DL_SEA
        {
          // 살짝 일렁이는 바다(물가에선 잦아든다)
          float fd = max( 0.0, -dlField( wp0.xz ).r );
          float amp = 0.045 * smoothstep( 0.2, 2.5, fd );
          vec2 p = wp0.xz;
          float w = 0.55 * sin( dot( p, vec2( 0.23, 0.11 ) ) + uTime * 0.9 )
                  + 0.30 * sin( dot( p, vec2( -0.13, 0.29 ) ) + uTime * 1.25 )
                  + 0.15 * sin( dot( p, vec2( 0.41, -0.37 ) ) + uTime * 1.9 );
          transformed.y += amp * w;
        }
        #endif
        vWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vFlow = aFlow;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFlow;
        varying vec3 vWP;
        varying float vRestY;
        uniform vec3 uShallow, uMid, uDeep, uRiverA, uRiverB, uFoam;
        uniform vec2 uFallY;
        ${COMMON_GLSL}
        float dlRipple( vec2 q ) {
          return 0.6 * dlNoise( q * 1.1 + uTime * vec2( 0.22, 0.13 ) ) + 0.4 * dlNoise( q * 2.7 - uTime * vec2( 0.17, 0.31 ) );
        }`)
      .replace('#include <color_fragment>', WATER_COLOR_GLSL)
      .replace('#include <normal_fragment_maps>', WATER_NORMAL_GLSL)
      .replace('#include <emissivemap_fragment>', WATER_SPARKLE_GLSL);
  };
  mat.customProgramCacheKey = () => 'dl-water-' + kind + '-v2';
  return mat;
}

const WATER_COLOR_GLSL = /* glsl */ `
  vec4 F = dlField( vWP.xz );
  float depth = max( 0.0, vRestY - F.r );
  float coast = F.g, rd = F.b;
  vec3 wc; float alpha; float foam = 0.0; float dlVis = 1.0;
  float lace = smoothstep( -0.4, 0.35, dlNoise( vWP.xz * 4.0 + vec2( uTime * 0.25, -uTime * 0.18 ) ) )
             * smoothstep( -0.6, 0.2, dlNoise( vWP.xz * 9.0 - uTime * 0.2 ) );
#ifdef DL_SEA
  float dk = smoothstep( 0.0, 1.1, depth ), dk2 = smoothstep( 0.9, 4.0, depth );
  wc = mix( uShallow, uMid, dk );
  wc = mix( wc, uDeep, dk2 );
  alpha = mix( 0.22, 0.8, smoothstep( 0.0, 1.2, depth ) );
  alpha = mix( alpha, 0.97, dk2 );
  // 물가 테두리 거품
  float aw = fwidth( depth ) + 0.004;
  foam = smoothstep( 0.055 + aw, 0.0, depth ) * mix( 0.6, 1.0, lace );
  // 밀려오는 거품 줄: 다음 파도가 모래로 올라가기 직전에 물가로 다가온다
  float ph = dlWavePhase( vWP.xz );
  if ( ph > 0.66 ) {
    float q = ( ph - 0.66 ) / 0.34;
    float dl = 0.36 * ( 1.0 - q );
    float line = smoothstep( 0.03 + aw, 0.0, abs( depth - dl ) );
    foam = max( foam, line * smoothstep( 0.0, 0.25, q ) * mix( 0.45, 1.0, lace ) );
  } else if ( ph > 0.26 ) {
    // 빠진 뒤 남는 레이스 거품
    float rem = 1.0 - smoothstep( 0.26, 0.66, ph );
    foam = max( foam, smoothstep( 0.16, 0.02, depth ) * lace * lace * rem * 0.7 );
  }
#endif
#ifdef DL_RIVER
  float dk = smoothstep( 0.0, 0.42, depth );
  wc = mix( uRiverA, uRiverB, dk );
  alpha = mix( 0.3, 0.8, dk );
  // 흐르는 물결: 흐름 방향으로 길쭉한 흰 대시가 하류로 떠내려간다
  float streak = 0.0;
  for ( int L = 0; L < 2; L++ ) {
    float fl = float( L );
    vec2 cell = vec2( 1.3 + fl * 0.5, 0.42 );
    vec2 fq = vec2( vFlow.x - uTime * ( 0.9 + fl * 0.35 ) + fl * 7.3, vFlow.y + fl * 0.21 ) / cell;
    vec2 ci = floor( fq ), cf = fract( fq );
    vec2 rp = dlHash2( ci + fl * 17.0 );
    vec2 dd = ( cf - vec2( 0.5, 0.3 + rp.y * 0.4 ) ) * cell;
    dd.y += 0.035 * sin( dd.x * 7.0 + rp.x * 6.0 );
    float len = 0.32 + rp.x * 0.3;
    float e = length( vec2( dd.x / len, dd.y / 0.028 ) );
    float life = 0.5 + 0.5 * sin( uTime * 1.3 + rp.x * 12.0 );
    streak += smoothstep( 1.0, 0.55, e ) * step( 0.35, rp.y ) * life;
  }
  streak *= vFlow.z * ( 1.0 - smoothstep( 1.0, 1.35, abs( vFlow.y ) ) * 0.6 );
  wc = mix( wc, vec3( 1.0 ), clamp( streak, 0.0, 1.0 ) * 0.7 );
  alpha = max( alpha, streak * 0.6 );
  // 둑을 따라 얇은 거품 + 얕은 물가
  float bankFoam = smoothstep( 1.12, 1.28, rd ) * smoothstep( 2.6, 4.6, coast );
  float aw = fwidth( depth ) + 0.004;
  foam = max( bankFoam, smoothstep( 0.05 + aw, 0.0, depth ) ) * mix( 0.55, 1.0, lace );
  // 폭포 근처: 입술 앞은 빨라지고, 떨어진 아래는 하얗게 부글
  foam = max( foam, ( 1.0 - vFlow.z ) * lace * 0.85 );
  // 바다로 나가며 사라진다
  dlVis = smoothstep( -2.2, -0.4, coast );
#endif
#ifdef DL_FALL
  // 흰 줄무늬가 흘러내리는 커튼
  vec2 fq = vec2( vFlow.x * 5.5, vFlow.y * 0.9 - uTime * 2.6 );
  float st = dlNoise( fq ) * 0.6 + dlNoise( fq * vec2( 2.3, 1.7 ) + 3.0 ) * 0.4;
  float drop = smoothstep( uFallY.x - 0.05, uFallY.x - 0.45, vRestY );
  wc = mix( vec3( 0.62, 0.9, 0.92 ), vec3( 1.0 ), smoothstep( -0.15, 0.45, st ) * mix( 0.5, 1.0, drop ) );
  alpha = mix( 0.55, 0.95, drop );
  float edge = min( vFlow.z, 1.0 - vFlow.z );
  alpha *= smoothstep( 0.0, 0.06, edge );
  foam = smoothstep( uFallY.y + 0.5, uFallY.y + 0.05, vRestY ) * mix( 0.6, 1.0, lace );
#endif
  wc = mix( wc, uFoam, foam );
  alpha = max( alpha, foam * 0.95 );
  diffuseColor = vec4( wc, alpha );
`;

const WATER_NORMAL_GLSL = /* glsl */ `
  #include <normal_fragment_maps>
#ifndef DL_FALL
  {
  #ifdef DL_RIVER
    vec2 q = vec2( vFlow.x * 0.35 - uTime * 0.5, vFlow.y * 0.8 );
    float k = 0.09;
  #else
    vec2 q = vWP.xz * 0.45;
    float k = 0.07;
  #endif
    float e = 0.04;
    float h0 = dlRipple( q ), hx = dlRipple( q + vec2( e, 0.0 ) ), hz = dlRipple( q + vec2( 0.0, e ) );
    vec3 nW = normalize( vec3( -( hx - h0 ) / e * k, 1.0, -( hz - h0 ) / e * k ) );
    normal = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );
  }
#endif
`;

const WATER_SPARKLE_GLSL = /* glsl */ `
  #include <emissivemap_fragment>
  {
    vec3 V = normalize( vViewPosition );
    float fr = pow( 1.0 - clamp( dot( V, normal ), 0.0, 1.0 ), 5.0 );
    diffuseColor.a = mix( diffuseColor.a, 1.0, fr * 0.6 );
#if NUM_DIR_LIGHTS > 0 && !defined( DL_FALL )
    vec3 L = directionalLights[ 0 ].direction;
    vec3 R = reflect( -V, normal );
    float sunA = pow( max( dot( R, L ), 0.0 ), 14.0 );
    // 해에 반짝이는 점: 칸마다 하나(일부만), 시간에 따라 깜빡
    vec2 cq = vWP.xz * 1.9;
    vec2 ci = floor( cq ), cf = fract( cq );
    vec2 rp = dlHash2( ci );
    float tw = pow( 0.5 + 0.5 * sin( uTime * ( 2.0 + rp.x * 3.0 ) + rp.y * 6.2831 ), 10.0 ) * step( 0.45, dlHash( ci + 7.7 ) );
    vec2 dd = ( cf - ( 0.2 + rp * 0.6 ) ) * vec2( 1.0, 2.2 );
    float star = smoothstep( 0.11, 0.0, length( dd ) ) * tw;
    float sp = star * sunA;
    totalEmissiveRadiance += directionalLights[ 0 ].color * sp * 1.4;
    diffuseColor.a = max( diffuseColor.a, sp );
#endif
    diffuseColor.a *= dlVis;
  }
`;

/** 안쪽은 촘촘, 바깥은 성기게 */
function gradedAxis(min: number, max: number, step: number, reach: number): number[] {
  const out: number[] = [];
  const n = Math.ceil((max - min) / step);
  for (let i = 0; i <= n; i++) out.push(min + ((max - min) * i) / n);
  let s = step, x = max;
  while (x < max + reach) { s *= 1.25; x += s; out.push(x); }
  s = step; x = min;
  const left: number[] = [];
  while (x > min - reach) { s *= 1.25; x -= s; left.push(x); }
  return [...left.reverse(), ...out];
}

function seaGeometry(b: { minX: number; maxX: number; minZ: number; maxZ: number }): THREE.BufferGeometry {
  const xs = gradedAxis(b.minX - 4, b.maxX + 4, 0.5, 320), zs = gradedAxis(b.minZ - 4, b.maxZ + 4, 0.5, 320);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) pos.set([xs[i], 0, zs[j]], (j * nx + i) * 3);
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b2 = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, d, a, d, b2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export default function build(ctx: Ctx) {
  const { island } = ctx;
  const g = new THREE.Group();
  g.name = 'water';

  const sea = new THREE.Mesh(seaGeometry(island.ISLAND_BOUNDS), waterMaterial(ctx, 'sea'));
  sea.name = 'sea';
  sea.receiveShadow = true;
  sea.renderOrder = 1;
  sea.frustumCulled = false;
  g.add(sea);

  const rv = buildRiver(island);
  const river = new THREE.Mesh(rv.ribbon, waterMaterial(ctx, 'river'));
  river.name = 'river';
  river.receiveShadow = true;
  river.renderOrder = 2;
  g.add(river);

  if (rv.fall) {
    const f = rv.fall;
    const fallMat = waterMaterial(ctx, 'fall');
    (fallMat.userData.fallY as { value: THREE.Vector2 }).value.set(f.topY, f.botY);
    const curtain = new THREE.Mesh(buildFallCurtain(f), fallMat);
    curtain.name = 'waterfall';
    curtain.receiveShadow = true;
    curtain.renderOrder = 3;
    g.add(curtain);

    // 물보라: 둥근 거품 덩이가 폭포 발치에서 부풀었다 가라앉는다
    const rnd = ctx.rng('waterfall-splash');
    const N = 22;
    const puffs = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 3),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, emissive: 0xdff6ff, emissiveIntensity: 0.18 }),
      N,
    );
    puffs.name = 'splash';
    const seeds = Array.from({ length: N }, () => ({
      a: -f.halfL * 0.95 + rnd() * (f.halfL + f.halfR) * 0.95,
      u: 0.75 + rnd() * 0.55,
      r: 0.13 + rnd() * 0.16,
      ph: rnd(),
      sp: 0.7 + rnd() * 0.6,
    }));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const place = (t: number) => {
      for (let i = 0; i < N; i++) {
        const sd = seeds[i];
        const k = (t * sd.sp * 0.6 + sd.ph) % 1;
        const life = Math.sin(k * Math.PI);
        p.set(
          f.lip.x + f.out.x * (sd.u + k * 0.35) + f.across.x * sd.a,
          f.botY - 0.05 + life * 0.16 + k * 0.05,
          f.lip.z + f.out.z * (sd.u + k * 0.35) + f.across.z * sd.a,
        );
        const r = sd.r * (0.45 + 0.75 * life);
        sc.set(r, r * 0.8, r);
        m.compose(p, q, sc);
        puffs.setMatrixAt(i, m);
      }
      puffs.instanceMatrix.needsUpdate = true;
    };
    place(0);
    ctx.onUpdate((t) => place(t));
    g.add(puffs);
  }

  ctx.onUpdate((time) => { sharedUniforms.uTime.value = time; });
  return g;
}
