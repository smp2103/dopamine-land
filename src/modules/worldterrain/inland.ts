// 섬 안 호수·강 물면 — world.ts 의 worldLakes/worldRivers 가 정한 물 높이에 판·띠를 깐다.
// 정점마다 물 깊이(물 높이 − 땅)를 구워 두고, 얕은 민트 → 깊은 청록, 물가 거품, 강 흐름 대시, 폭포는 흰 커튼.
// 호수 종류마다 물빛(aK): 온천 젖빛 청록·분홍, 늪 탁한 초록, 안개 호수 회보라, 하트 연못 분홍, 오아시스 진한 청록.
// 크레이터 은하수 물은 waterfx.ts 가 청크로 따로 그린다(여기선 건너뛴다).
import * as THREE from 'three';
import type * as Island from '../../core/island';
import { COMMON_GLSL } from '../terrain/glsl';
import { getField, sharedUniforms } from '../terrain/field';

function waterMat(island: typeof Island): THREE.MeshStandardMaterial {
  const field = getField(island);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0, transparent: true, side: THREE.DoubleSide });
  mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -2;
  const uniforms = { uField: { value: field.tex }, uFieldRect: { value: field.rect }, uTime: sharedUniforms.uTime };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aW;\nattribute float aK;\nvarying vec4 vW;\nvarying float vK;\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW;\nvK = aK;\nvWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vW;
        varying float vK;
        varying vec3 vWP;
        ${COMMON_GLSL}
        float dlRipple( vec2 q ) {
          return 0.6 * dlNoise( q * 1.1 + uTime * vec2( 0.22, 0.13 ) ) + 0.4 * dlNoise( q * 2.7 - uTime * vec2( 0.17, 0.31 ) );
        }`)
      .replace('#include <color_fragment>', `
        // vW = (깊이, 흐름 좌표(m), 가로 위치 -1..1, 경사)
        float depth = vW.x;
        float dlFall = 0.0;
        if ( depth < -0.3 ) discard;
        // 호수: 가장자리 밖(아래 계단으로 내려간 땅 위)은 물이 아니다
        if ( vW.z < -5.0 && vW.y < -2.0 ) discard;
        float slope = vW.w;
        float lace = smoothstep( -0.4, 0.35, dlNoise( vWP.xz * 1.6 + vec2( uTime * 0.25, -uTime * 0.18 ) ) )
                   * smoothstep( -0.6, 0.2, dlNoise( vWP.xz * 4.0 - uTime * 0.2 ) );
        float dk = smoothstep( 0.0, 1.2, depth );
        vec3 wc = mix( vec3( 0.62, 0.94, 0.86 ), vec3( 0.27, 0.78, 0.84 ), dk );
        wc = mix( wc, vec3( 0.18, 0.56, 0.8 ), smoothstep( 1.4, 3.5, depth ) );
        float alpha = mix( 0.3, 0.88, dk );
        float aw = fwidth( depth ) + 0.01;
        float foam = smoothstep( 0.12 + aw, 0.0, depth ) * mix( 0.55, 1.0, lace );
        // 강: 흐름 방향 흰 대시
        if ( vW.z > -5.0 ) {
          if ( abs( vW.z ) > 1.3 ) discard;
          vec2 fq = vec2( vW.y - uTime * ( 2.2 + slope * 8.0 ), vW.z * 6.0 ) / vec2( 2.4, 1.0 );
          vec2 ci = floor( fq ), cf = fract( fq );
          vec2 rp = dlHash2( ci );
          vec2 dd = ( cf - vec2( 0.5, 0.3 + rp.y * 0.4 ) ) * vec2( 2.4, 1.0 );
          float e = length( vec2( dd.x / ( 0.5 + rp.x * 0.5 ), dd.y / 0.06 ) );
          float streak = smoothstep( 1.0, 0.5, e ) * step( 0.4, rp.y ) * ( 0.6 + 0.4 * sin( uTime * 1.3 + rp.x * 12.0 ) );
          wc = mix( wc, vec3( 1.0 ), streak * 0.6 );
          alpha = max( alpha, streak * 0.6 );
          // 폭포·여울: 경사가 크면 하얗게 쏟아진다
          float fall = smoothstep( 0.12, 0.5, slope );
          vec2 fq2 = vec2( vW.z * 5.0, vW.y * 0.7 - uTime * 4.0 );
          float st = dlNoise( fq2 ) * 0.6 + dlNoise( fq2 * vec2( 2.3, 1.7 ) + 3.0 ) * 0.4;
          wc = mix( wc, mix( vec3( 0.7, 0.93, 0.95 ), vec3( 1.0 ), smoothstep( -0.2, 0.4, st ) ), fall );
          dlFall = fall;
          alpha = mix( alpha, 0.95, fall );
          foam = max( foam, smoothstep( 0.04, 0.0, slope ) * smoothstep( 0.5, 0.15, vW.w + 0.0 ) * 0.0 );
        }
        // 호수 종류별 물빛(LAKE_TINT 와 같은 번호)
        if ( vK > 0.5 ) {
          if ( vK < 1.5 ) {
            // 온천: 젖빛 청록에 분홍 기운이 몽글몽글 번진다
            vec3 hs = mix( vec3( 0.12, 0.6, 0.68 ), vec3( 0.95, 0.5, 0.7 ), 0.3 + 0.4 * dlNoise( vWP.xz * 0.35 + uTime * vec2( 0.05, -0.04 ) ) );
            wc = mix( wc, hs, 0.85 );
            alpha = max( alpha, 0.88 );
            foam *= 0.3;
          } else if ( vK < 2.5 ) {
            // 늪: 탁한 초록 + 개구리밥 얼룩(거의 불투명)
            float duck = smoothstep( 0.1, 0.7, dlNoise( vWP.xz * 0.21 + 5.0 ) );
            vec3 sw = mix( vec3( 0.24, 0.38, 0.2 ), vec3( 0.36, 0.48, 0.22 ), smoothstep( -0.5, 0.6, dlNoise( vWP.xz * 0.06 ) ) );
            sw = mix( sw, vec3( 0.5, 0.7, 0.26 ), duck * 0.7 );
            wc = mix( wc, sw, 0.92 );
            alpha = max( alpha, 0.95 );
            foam *= 0.5;
          } else if ( vK < 3.5 ) {
            // 안개 호수: 잔잔한 회보랏빛
            wc = mix( wc, vec3( 0.6, 0.64, 0.8 ), 0.58 );
            alpha = max( alpha, 0.8 );
          } else if ( vK < 4.5 ) {
            // 하트 연못: 분홍 물빛
            wc = mix( wc, vec3( 1.0, 0.72, 0.84 ), 0.38 );
          } else {
            // 오아시스: 진한 청록
            wc = mix( wc, vec3( 0.16, 0.8, 0.84 ), 0.32 );
          }
        }
        wc = mix( wc, vec3( 1.0 ), foam );
        alpha = max( alpha, foam * 0.95 );
        diffuseColor = vec4( wc, alpha );
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 q = vWP.xz * 0.5 + vec2( vW.y * 0.2, 0.0 );
          float e = 0.04, k = 0.07;
          float h0 = dlRipple( q ), hx = dlRipple( q + vec2( e, 0.0 ) ), hz = dlRipple( q + vec2( 0.0, e ) );
          vec3 nW = normalize( vec3( -( hx - h0 ) / e * k, 1.0, -( hz - h0 ) / e * k ) );
          // 늪은 잔물결이 거의 없다(걸쭉한 물)
          if ( vK > 1.5 && vK < 2.5 ) nW = normalize( mix( vec3( 0.0, 1.0, 0.0 ), nW, 0.25 ) );
          if ( vW.w < 0.12 ) normal = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );
        }`)
      .replace('#include <opaque_fragment>', `
        // 물빛이 하늘 반사에 하얗게 묻히지 않게(온천·늪은 절반, 안개 호수는 조금 — 제 색을 남긴다)
        if ( vK > 0.5 && vK < 2.5 ) outgoingLight = mix( min( outgoingLight, vec3( 1.1 ) ), diffuseColor.rgb * 1.15, 0.7 );
        else if ( vK > 2.5 && vK < 3.5 ) outgoingLight = mix( min( outgoingLight, vec3( 1.1 ) ), diffuseColor.rgb, 0.35 );
        #include <opaque_fragment>`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // 온천·늪은 하늘을 덜 비춘다(물빛이 하얗게 날아가지 않게)
        if ( vK > 0.5 && vK < 1.5 ) roughnessFactor = 0.8;
        if ( vK > 1.5 && vK < 2.5 ) roughnessFactor = 0.9;
        if ( vK > 2.5 && vK < 3.5 ) roughnessFactor = 0.55;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 V = normalize( vViewPosition );
          float fr = pow( 1.0 - clamp( dot( V, normal ), 0.0, 1.0 ), 5.0 );
          diffuseColor.a = mix( diffuseColor.a, 1.0, fr * 0.5 );
      #if NUM_DIR_LIGHTS > 0
          vec3 L = directionalLights[ 0 ].direction;
          vec3 R = reflect( -V, normal );
          float sunA = pow( max( dot( R, L ), 0.0 ), 14.0 );
          vec2 cq = vWP.xz * 1.9;
          vec2 ci = floor( cq ), cf = fract( cq );
          vec2 rp = dlHash2( ci );
          float tw = pow( 0.5 + 0.5 * sin( uTime * ( 2.0 + rp.x * 3.0 ) + rp.y * 6.2831 ), 10.0 ) * step( 0.45, dlHash( ci + 7.7 ) );
          vec2 dd = ( cf - ( 0.2 + rp * 0.6 ) ) * vec2( 1.0, 2.2 );
          float sp = smoothstep( 0.11, 0.0, length( dd ) ) * tw * sunA;
          totalEmissiveRadiance += directionalLights[ 0 ].color * sp * 1.3;
          totalEmissiveRadiance += diffuseColor.rgb * dlFall * 0.35;
          diffuseColor.a = max( diffuseColor.a, sp );
      #endif
        }`);
  };
  mat.customProgramCacheKey = () => 'wt2-inland';
  return mat;
}

/** 호수 종류 → 물빛 번호(셰이더 vK) */
const LAKE_TINT: Partial<Record<string, number>> = { hotspring: 1, swamp: 2, foglake: 3, heartpond: 4, oasis: 5 };

export function buildInlandWater(island: typeof Island): THREE.Group {
  const g = new THREE.Group();
  g.name = 'inland-water';
  const mat = waterMat(island);
  // 호수: 격자판(곡률이 휘도록 정점을 충분히)
  for (const L of island.worldLakes()) {
    // 언 호수: 판은 없고 얼음 구멍(L.holes)에만 작은 물 원판
    if (L.frozen) {
      for (let k = 0; k < (L.holes?.length ?? 0); k++) g.add(holeDisc(island, L.holes[k], L.level, mat, `lake-${L.id}-hole${k}`));
      continue;
    }
    // 은하수 크레이터 물은 waterfx.ts(청크) 몫
    if (L.galaxy) continue;
    const R = L.r * 1.45, N = 56;
    const pos: number[] = [], aw: number[] = [], idx: number[] = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = L.x - R + (2 * R * i) / N, z = L.z - R + (2 * R * j) / N;
      pos.push(x, L.level, z);
      aw.push(L.level - island.heightAt(x, z), island.lakeEdge(L, x, z), -9, 0);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      if (aw[a * 4] < -0.5 && aw[b * 4] < -0.5 && aw[c * 4] < -0.5 && aw[d * 4] < -0.5) continue;
      idx.push(a, c, d, a, d, b);
    }
    g.add(mesh(pos, aw, idx, mat, 'lake-' + L.id, LAKE_TINT[L.kind] ?? 0));
  }
  // 강: 중심선을 따라 띠(폭포 마디는 촘촘히)
  for (const Rv of island.worldRivers()) {
    const pts = Rv.pts;
    const cols = 12;
    const pos: number[] = [], aw: number[] = [], idx: number[] = [];
    let along = 0, rows = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const segL = Math.hypot(b.x - a.x, b.z - a.z);
      const tx = (b.x - a.x) / segL, tz = (b.z - a.z) / segL;
      const drop = a.level - b.level;
      const sub = drop > 1.2 ? 14 : 3;
      for (let s = 0; s < sub || (i === pts.length - 2 && s === sub); s++) {
        const t = s / sub;
        const tt = drop > 1.2 ? sm(0.62, 0.72, t) : t;
        const cx0 = a.x + (b.x - a.x) * t, cz0 = a.z + (b.z - a.z) * t;
        // 땅이 물 높이보다 먼저 내려가면 물도 땅을 따라 내려간다(허공에 뜬 물판 방지)
        const lv = Math.min(a.level + (b.level - a.level) * tt, island.heightAt(cx0, cz0) + 1.5);
        const dl = drop > 1.2 ? (drop * 6 * Math.max(0, 1 - Math.abs(t - 0.67) / 0.08)) / segL : drop / segL;
        const cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t;
        // 하구: 물이 바다 높이에 가까워질수록 world.ts 처럼 넓어진다(그만큼 띠도 넓힌다)
        const hw = Rv.halfW * (Rv.estuary > 0 ? 1 + Rv.estuary * sm(0.7, 0.05, lv) : 1);
        const half = hw + 5;
        for (let k = 0; k <= cols; k++) {
          const off = (k / cols) * 2 - 1;
          const x = cx - tz * off * half, z = cz + tx * off * half;
          pos.push(x, lv, z);
          aw.push(lv - island.heightAt(x, z), along + t * segL, (off * half) / hw, Math.min(1, dl));
        }
        rows++;
      }
      along += segL;
    }
    for (let r = 0; r < rows - 1; r++) for (let k = 0; k < cols; k++) {
      const a = r * (cols + 1) + k, b = a + 1, c = a + cols + 1, d = c + 1;
      idx.push(a, c, d, a, d, b);
    }
    g.add(mesh(pos, aw, idx, mat, 'river-' + Rv.island));
  }
  return g;
}

/** 얼음 구멍 물 원판 — 고리 몇 겹짜리 작은 부채꼴 판(호수 모드: aW.z = -9) */
function holeDisc(island: typeof Island, q: { x: number; z: number; r: number }, level: number, mat: THREE.Material, name: string): THREE.Mesh {
  const rings = 3, segs = 16, R = q.r * 1.15;
  const pos: number[] = [q.x, level, q.z], aw: number[] = [level - island.heightAt(q.x, q.z), 0, -9, 0], idx: number[] = [];
  for (let r = 1; r <= rings; r++) for (let s = 0; s < segs; s++) {
    const a = (s / segs) * Math.PI * 2, rr = (R * r) / rings;
    const x = q.x + Math.cos(a) * rr, z = q.z + Math.sin(a) * rr;
    pos.push(x, level, z);
    aw.push(level - island.heightAt(x, z), 0, -9, 0);
  }
  const at = (r: number, s: number) => (r === 0 ? 0 : 1 + (r - 1) * segs + (s % segs));
  for (let s = 0; s < segs; s++) idx.push(0, at(1, s + 1), at(1, s));
  for (let r = 1; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = at(r, s), b = at(r, s + 1), c = at(r + 1, s), d = at(r + 1, s + 1);
    idx.push(a, b, d, a, d, c);
  }
  return mesh(pos, aw, idx, mat, name);
}

const sm = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function mesh(pos: number[], aw: number[], idx: number[], mat: THREE.Material, name: string, tint = 0): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aW', new THREE.Float32BufferAttribute(aw, 4));
  geo.setAttribute('aK', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(tint), 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // 법선은 위로(폭포 커튼도 빛을 고르게)
  const n = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.renderOrder = 2;
  m.receiveShadow = true;
  m.userData.world = 'earth';
  return m;
}
