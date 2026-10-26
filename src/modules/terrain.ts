// 지형 — 촘촘한 높이장 + 등고선 절벽 벽. 색은 정점이 아니라 프래그먼트에서
// 월드 좌표·필드 텍스처(해안·강 거리)·경사로 섞어서 경계가 계단 없이 매끈하다.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { getField, sharedUniforms } from './terrain/field';
import { COMMON_GLSL } from './terrain/glsl';
import { buildCliff } from './terrain/cliff';
import { buildBanks } from './terrain/banks';

export const order = 0;

/** 안쪽은 고른 간격, 바깥은 점점 성기게(바다 바닥 멀리까지) */
function gradedAxis(min: number, max: number, step: number, reach: number): number[] {
  const out: number[] = [];
  const n = Math.ceil((max - min) / step);
  for (let i = 0; i <= n; i++) out.push(min + ((max - min) * i) / n);
  let s = step, x = max;
  while (x < max + reach) { s *= 1.3; x += s; out.push(x); }
  s = step; x = min;
  const left: number[] = [];
  while (x > min - reach) { s *= 1.3; x -= s; left.push(x); }
  return [...left.reverse(), ...out];
}

const col = (hex: string) => new THREE.Color(hex);

export function terrainMaterial(ctx: Ctx): THREE.MeshStandardMaterial {
  const field = getField(ctx.island);
  const P = ctx.palette;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  const uniforms = {
    uField: { value: field.tex },
    uFieldRect: { value: field.rect },
    uTime: sharedUniforms.uTime,
    uGrass: { value: col('#86c058') },
    uGrassLight: { value: col('#a0d068') },
    uGrassDark: { value: col('#70ad4e') },
    uSand: { value: col('#f3dca6') },
    uSandWet: { value: col('#d3bd8a') },
    uCliff: { value: col('#a07e62') },
    uCliffLight: { value: col('#c4a17c') },
    uDirt: { value: col('#b08a64') },
    uSeaFloor: { value: col('#bfe6c9') },
    uSeaDeep: { value: col('#5fb0b8') },
    uRiverBed: { value: col('#9cc6a8') },
    uFoam: { value: col('#ffffff') },
    uSheet: { value: col('#bff0e6') },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aWall;\nvarying vec4 vWall;\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWall = aWall;
        vWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vWN = normalize( mat3( modelMatrix ) * objectNormal );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP;
        varying vec3 vWN;
        varying vec4 vWall;
        uniform vec3 uGrass, uGrassLight, uGrassDark, uSand, uSandWet, uCliff, uCliffLight, uDirt;
        uniform vec3 uSeaFloor, uSeaDeep, uRiverBed, uFoam, uSheet;
        ${COMMON_GLSL}`)
      .replace('#include <color_fragment>', TERRAIN_COLOR_GLSL)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = tRough;');
  };
  mat.customProgramCacheKey = () => 'dl-terrain-v2';
  return mat;
}

const TERRAIN_COLOR_GLSL = /* glsl */ `
  vec3 P = vWP;
  vec3 N = normalize( vWN );
  vec4 F = dlField( P.xz );
  float coast = F.g, rd = F.b, level = F.a;
  float tRough = 0.95;

  // ── 잔디: 큰 얼룩(밝고 어두운 패치) + 아주 은은한 잎 자국 ──
  float n1 = dlNoise( P.xz * 0.065 ) * 0.62 + dlNoise( P.xz * 0.17 + 5.3 ) * 0.38;
  vec3 grass = uGrass;
  grass = mix( grass, uGrassLight, smoothstep( 0.2, 0.6, n1 ) * 0.5 );
  grass = mix( grass, uGrassDark, smoothstep( -0.25, -0.65, n1 ) * 0.4 );
  vec2 gq = P.xz * 2.6;
  float fine = 1.0 - smoothstep( 0.06, 0.22, length( fwidth( gq ) ) );
  vec2 gi = floor( gq ), gf = fract( gq );
  float leaf = 0.0;
  for ( int yy = -1; yy <= 1; yy++ ) for ( int xx = -1; xx <= 1; xx++ ) {
    vec2 o = vec2( float( xx ), float( yy ) );
    vec2 r = dlHash2( gi + o );
    vec2 d = o + 0.15 + r * 0.7 - gf;
    float a = r.x * 6.2831;
    d = mat2( cos( a ), -sin( a ), sin( a ), cos( a ) ) * d;
    float e = length( d * vec2( 1.0, 2.4 ) );
    leaf += smoothstep( 0.2, 0.13, e ) * ( r.y > 0.5 ? 1.0 : -0.8 );
  }
  grass *= 1.0 + 0.055 * leaf * fine;

  // ── 모래: 따뜻한 크림 + 잔물결 얼룩 ──
  float sn = dlNoise( P.xz * 0.45 ) * 0.6 + dlNoise( P.xz * 1.9 ) * 0.4;
  vec3 sand = uSand * ( 1.0 + 0.035 * sn );
  float grain = dlHash( floor( P.xz * 34.0 ) );
  sand *= 1.0 + ( grain - 0.5 ) * 0.05 * ( 1.0 - smoothstep( 0.02, 0.05, length( fwidth( P.xz ) ) ) );

  // 모래 ↔ 잔디 경계: 물결치는 매끈한 곡선
  float be = coast - 3.25 + 0.3 * dlNoise( P.xz * 0.32 ) + 0.09 * dlNoise( P.xz * 1.4 );
  float bw = fwidth( be ) * 0.7 + 0.012;
  float gm = smoothstep( -bw, bw, be );
  vec3 c = mix( sand, grass, gm );
  c *= 1.0 - 0.06 * ( 1.0 - gm ) * smoothstep( -0.3, 0.0, be );

  // ── 경사면: 강둑 흙, 절벽 지층 ──
  float steep, under;
  if ( vWall.w > 0.5 ) {
    // 벽: 잔디가 둥근 모서리를 덮고 둥근 자락(스캘럽)으로 끝난다
    float lw = 0.55;
    float li = floor( vWall.x / lw );
    float lx = fract( vWall.x / lw ) * 2.0 - 1.0;
    float lobe = sqrt( max( 0.0, 1.0 - lx * lx ) );
    float H = vWall.y + vWall.z;
    float lipD = min( 0.3, H * 0.16 ) * ( 0.62 + 0.38 * lobe * ( 0.7 + 0.6 * dlHash( vec2( li, 1.3 ) ) ) );
    float le = vWall.y - lipD;
    float aw = fwidth( le ) * 0.75 + 0.002;
    steep = smoothstep( -aw, aw, le );
    // 발치: 땅과 만나는 곳은 다시 잔디
    float fe = vWall.z - 0.04;
    float fw = fwidth( fe ) * 0.75 + 0.002;
    steep *= smoothstep( -fw, fw, fe );
    under = smoothstep( 0.0, 0.14, le );
    // 잔디 자락 끝은 살짝 밝게(두께감)
    grass *= 1.0 + 0.07 * ( 1.0 - smoothstep( 0.0, 0.05, -le ) ) * step( le, 0.0 );
    c = mix( c, grass, gm * ( 1.0 - steep ) );
  } else {
    // 높이장은 벽이 덮지 않는 아주 가파른 곳만 흙
    float lipN = 0.4;
    float nw = fwidth( N.y ) * 0.8 + 0.01;
    steep = smoothstep( lipN + nw, lipN - nw, N.y );
    under = smoothstep( 0.0, 0.2, lipN - N.y );
  }
  float yy2 = P.y + 0.05 * dlNoise( P.xz * 0.9 );
  float band = yy2 / 0.36;
  float bf = fract( band );
  float tone = dlHash( vec2( floor( band ), 3.7 ) );
  vec3 cliff = mix( uCliff, uCliffLight, 0.25 + tone * 0.5 );
  cliff *= 1.0 - 0.17 * smoothstep( 0.72, 0.96, bf );
  cliff *= 1.0 + 0.09 * smoothstep( 0.14, 0.0, bf );
  cliff *= 1.0 + 0.05 * dlNoise( vec2( ( P.x + P.z ) * 2.2, yy2 * 5.0 ) );
  vec3 dirt = uDirt * ( 1.0 + 0.05 * dlNoise( P.xz * 3.0 + P.y ) );
  vec3 wall = mix( dirt, cliff, smoothstep( 1.1, 1.4, P.y ) );
  // 잔디 끝 바로 아래 그늘 띠(덮인 느낌)
  wall *= 1.0 - 0.26 * ( 1.0 - under );
  c = mix( c, wall, steep );

  // ── 물속 바닥 / 젖은 띠 / 파도 ──
  bool inRiver = rd < 2.2 && coast > -0.6;
  float wl = inRiver ? level : 0.0;
  float depth = wl - P.y;
  if ( depth > 0.0 ) {
    vec3 floorC = inRiver ? uRiverBed : mix( uSeaFloor, uSeaDeep, smoothstep( 0.6, 3.5, depth ) );
    floorC *= 1.0 + 0.05 * sn;
    c = mix( c, floorC, smoothstep( 0.0, inRiver ? 0.12 : 0.25, depth ) );
    tRough = 0.9;
  } else {
    float above = -depth;
    float wetH = inRiver ? 0.05 : DL_SWASH_H * 1.05;
    float wet = 1.0 - smoothstep( wetH * 0.55, wetH, above );
    c = mix( c, c * vec3( 0.86, 0.85, 0.83 ), wet * gm );
    c = mix( c, uSandWet, wet * ( 1.0 - gm ) * 0.9 );
    tRough = mix( tRough, 0.6, wet );
    if ( !inRiver ) {
      float ph = dlWavePhase( P.xz );
      float reach = dlSwashReach( ph ) * DL_SWASH_H;
      float aw = fwidth( above ) + 0.002;
      float cover = smoothstep( reach + aw, reach - aw, above );
      c = mix( c, mix( c, uSheet, 0.22 ) * 1.03, cover );
      // 밀려오는 물막 앞 거품(빠질 때는 흐려진다)
      float front = smoothstep( 0.03, 0.006, reach - above ) * cover;
      float lace = smoothstep( -0.35, 0.25, dlNoise( P.xz * 5.5 + uTime * 0.3 ) );
      float fade = ph < 0.26 ? 1.0 : 1.0 - smoothstep( 0.26, 0.6, ph );
      c = mix( c, uFoam, front * mix( 0.55, 1.0, lace ) * fade * 0.95 );
      tRough = mix( tRough, 0.25, cover );
    }
  }
  diffuseColor.rgb *= c;
`;

export default function build(ctx: Ctx) {
  const { island } = ctx;
  const g = new THREE.Group();
  g.name = 'terrain';
  const mat = terrainMaterial(ctx);

  const b = island.ISLAND_BOUNDS;
  // 게임: 마을 사각형 밖은 세계 지형(worldterrain)이 그린다. 룩 테스트(game=0): 예전처럼 마을 지형이 바깥 110 m 까지
  const reach = ctx.game ? 0 : 110;
  const xs = gradedAxis(b.minX, b.maxX, 0.18, reach);
  const zs = gradedAxis(b.minZ, b.maxZ, 0.18, reach);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = (j * nx + i) * 3;
    pos[k] = xs[i];
    pos[k + 1] = island.heightAt(xs[i], zs[j]);
    pos[k + 2] = zs[j];
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let t = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b2 = a + 1, c = a + nx, d = c + 1;
    // 높이 차가 작은 대각선으로 나눠 경사면 톱니를 줄인다
    const d1 = Math.abs(pos[a * 3 + 1] - pos[d * 3 + 1]), d2 = Math.abs(pos[b2 * 3 + 1] - pos[c * 3 + 1]);
    if (d1 <= d2) { idx.set([a, c, d, a, d, b2], t); } else { idx.set([a, c, b2, b2, c, d], t); }
    t += 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const ground = new THREE.Mesh(geo, mat);
  ground.name = 'ground';
  ground.receiveShadow = true;
  ground.castShadow = false; // 높이장은 그림자 맵에 안 넣는다(절벽 벽이 대신 드리운다)
  g.add(ground);

  const cliff = buildCliff(island, mat);
  if (cliff) g.add(cliff);
  g.add(buildBanks(island, mat));

  ctx.onUpdate((time) => { sharedUniforms.uTime.value = time; });
  return g;
}
