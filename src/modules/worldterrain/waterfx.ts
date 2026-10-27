// 특별한 물 — 크레이터 은하수 물(반짝이 별·성운 소용돌이), 온천 김, 늪 연잎·물안개, 안개 호수 물안개, 크레이터 위 반짝이.
// 둘 다 청크 레이어로 스트리밍한다:
//   worldterrain-galaxy  : 은하수 물판(물 그 자체라 장식 아님 — 멀리서도 보이게 넓게)
//   worldterrain-waterfx : 김·물안개·연잎·반짝이(detail:true — 저사양이면 반경이 줄거나 꺼진다)
// 움직임은 전부 셰이더(uTime)가 한다 — 매 프레임 JS 일 없음. 곡률은 청크 매니저가 applyCurve 로 건다.
import * as THREE from 'three';
import type * as Island from '../../core/island';
import type { LakeInfo } from '../../core/world';
import type { ChunkLayer } from '../../core/chunks';
import { COMMON_GLSL } from '../terrain/glsl';
import { getField, sharedUniforms } from '../terrain/field';

type IslandMod = typeof Island;
type Rng = (key: string) => () => number;

const shared = <T extends THREE.BufferGeometry>(g: T): T => { g.userData.shared = true; return g; };
/** 공유 원본을 이 청크 몫으로 복제(인스턴스 aPhase 를 붙이므로 — 버릴 때 dispose 된다) */
const own = (g: THREE.BufferGeometry): THREE.BufferGeometry => { const c = g.clone(); c.userData = {}; return c; };

/** 크레이터 은하수 물 재질(호수마다 중심이 달라 하나씩) */
function galaxyMat(island: IslandMod, L: LakeInfo): THREE.MeshBasicMaterial {
  const field = getField(island);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -2;
  const uniforms = {
    uField: { value: field.tex }, uFieldRect: { value: field.rect }, uTime: sharedUniforms.uTime,
    uLake: { value: new THREE.Vector3(L.x, L.z, L.r) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aW;\nvarying vec2 vW;\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW;\nvWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vW;
        varying vec3 vWP;
        uniform vec3 uLake;
        ${COMMON_GLSL}
        // 별 한 겹: 칸마다 하나, 일부만 켜지고 저마다 다른 박자로 반짝
        float dlStars( vec2 q, float k, float on ) {
          vec2 c = floor( q * k ), f = fract( q * k );
          vec2 rp = dlHash2( c );
          float lit = step( on, dlHash( c + 3.7 ) );
          float tw = 0.55 + 0.45 * sin( uTime * ( 1.5 + rp.x * 3.0 ) + rp.y * 6.2831 );
          vec2 d = f - ( 0.2 + rp * 0.6 );
          // 십자 빛살이 살짝 있는 둥근 별
          float core = smoothstep( 0.09, 0.0, length( d ) );
          float rays = smoothstep( 0.02, 0.0, abs( d.x ) ) * smoothstep( 0.22, 0.0, abs( d.y ) ) + smoothstep( 0.02, 0.0, abs( d.y ) ) * smoothstep( 0.22, 0.0, abs( d.x ) );
          return ( core + rays * 0.45 ) * lit * tw;
        }`)
      .replace('#include <color_fragment>', `
        // vW = (깊이, 호수 가장자리 부호 거리)
        float depth = vW.x;
        if ( depth < -0.3 ) discard;
        if ( vW.y < -3.0 ) discard;
        vec2 q = vWP.xz - uLake.xy;
        float rr = length( q ) / uLake.z;
        // 천천히 도는 성운(가운데를 축으로 회전)
        float ang = uTime * 0.02;
        mat2 rot = mat2( cos( ang ), -sin( ang ), sin( ang ), cos( ang ) );
        vec2 qr = rot * q;
        float n1 = dlNoise( qr * 0.05 + 11.0 );
        float n2 = dlNoise( qr * 0.12 + n1 * 1.4 - 4.0 );
        vec3 col = mix( vec3( 0.2, 0.14, 0.5 ), vec3( 0.07, 0.08, 0.3 ), smoothstep( 0.0, 4.0, depth ) );
        col = mix( col, vec3( 0.98, 0.5, 0.86 ), smoothstep( 0.15, 0.85, n2 ) * 0.5 );
        col = mix( col, vec3( 0.42, 0.78, 1.0 ), smoothstep( 0.25, 0.95, -n1 ) * 0.45 );
        // 은하수 띠: 호수를 비스듬히 가로지르는 밝은 강
        float bandD = dot( qr, normalize( vec2( 0.8, 0.6 ) ) ) / uLake.z;
        float band = exp( -bandD * bandD * 9.0 ) * ( 0.6 + 0.4 * dlNoise( qr * 0.2 ) );
        col += vec3( 0.55, 0.45, 0.8 ) * band * 0.45;
        // 별 세 겹(작은 별은 촘촘, 큰 별은 드문드문)
        float st = dlStars( qr, 0.9, 0.55 ) + dlStars( qr + 17.0, 0.45, 0.72 ) * 1.3 + dlStars( qr - 5.0, 2.2, 0.5 ) * 0.6 * ( 0.4 + band );
        col += vec3( 1.0, 0.96, 0.86 ) * st * 1.5;
        // 물가: 라벤더 빛 고리 + 하얀 거품
        float rim = smoothstep( 0.55, 0.0, depth );
        float lace = smoothstep( -0.3, 0.5, dlNoise( vWP.xz * 1.4 + uTime * vec2( 0.2, -0.15 ) ) );
        col = mix( col, vec3( 0.86, 0.8, 1.0 ), rim * 0.55 );
        float foam = smoothstep( 0.12, 0.0, depth ) * mix( 0.5, 1.0, lace );
        col = mix( col, vec3( 1.0 ), foam );
        float alpha = mix( 0.7, 0.97, smoothstep( 0.0, 1.0, depth ) );
        alpha = max( alpha, foam );
        diffuseColor = vec4( col * ( 1.0 - 0.15 * smoothstep( 0.7, 1.2, rr ) ), alpha );
      `);
  };
  mat.customProgramCacheKey = () => 'wt2-galaxy';
  return mat;
}

/** 은하수 물판 — 호수 둘레 격자(inland.ts 호수판과 같은 짜임), 정점에 깊이·가장자리 거리 */
function galaxyMesh(island: IslandMod, L: LakeInfo, mat: THREE.Material): THREE.Mesh {
  const R = L.r * 1.45, N = 64;
  const pos: number[] = [], aw: number[] = [], idx: number[] = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = L.x - R + (2 * R * i) / N, z = L.z - R + (2 * R * j) / N;
    pos.push(x, L.level, z);
    aw.push(L.level - island.heightAt(x, z), island.lakeEdge(L, x, z));
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    if (aw[a * 2] < -0.5 && aw[b * 2] < -0.5 && aw[c * 2] < -0.5 && aw[d * 2] < -0.5) continue;
    idx.push(a, c, d, a, d, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aW', new THREE.Float32BufferAttribute(aw, 2));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat);
  m.name = 'galaxy-' + L.id;
  m.renderOrder = 2;
  m.userData.world = 'earth';
  return m;
}

// ── 장식(김·물안개·연잎·반짝이) ─────────────────────────────────
/** 위로 피어오르는 김 — 인스턴스마다 aPhase(0..1) 로 박자를 엇갈린다 */
function steamMat(): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color: '#fff6fa', transparent: true, depthWrite: false });
  const uniforms = { uTime: sharedUniforms.uTime };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aPhase;\nvarying float vLife;\nvarying float vSoft;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float life = fract( uTime * ( 0.16 + aPhase * 0.08 ) + aPhase );
        vLife = life;
        transformed *= 0.45 + life * 1.7;
        transformed.y += life * 4.2;
        transformed.x += sin( uTime * 0.7 + aPhase * 12.0 ) * life * 0.9;
        transformed.z += cos( uTime * 0.5 + aPhase * 9.0 ) * life * 0.6;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        // 가장자리로 갈수록 옅게(공 모양이 아니라 몽글한 김으로)
        vSoft = pow( clamp( abs( dot( normalize( normalMatrix * normal ), normalize( -mvPosition.xyz ) ) ), 0.0, 1.0 ), 1.6 );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLife;\nvarying float vSoft;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.a *= 0.5 * vSoft * smoothstep( 0.0, 0.18, vLife ) * ( 1.0 - smoothstep( 0.55, 1.0, vLife ) );`);
  };
  mat.customProgramCacheKey = () => 'wt2-steam';
  return mat;
}

/** 낮게 깔린 물안개 판(3겹) — 노이즈로 구멍 송송, 겹마다 다른 속도로 흐른다 */
function mistMat(color: string, dens: number, key: string): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const uniforms = { uTime: sharedUniforms.uTime, uDens: { value: dens } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aM;\nvarying vec2 vM;\nvarying vec3 vMP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvM = aM;\nvMP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uDens;
        varying vec2 vM;
        varying vec3 vMP;
        float mHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        float mNoise( vec2 p ) {
          vec2 i = floor( p ), f = fract( p );
          vec2 u = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( mHash( i ), mHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( mHash( i + vec2( 0.0, 1.0 ) ), mHash( i + 1.0 ), u.x ), u.y );
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // vM = (가운데에서 0..1, 겹 번호)
        float layer = vM.y;
        vec2 flow = vec2( 0.6, 0.35 ) * uTime * ( 0.25 + layer * 0.18 );
        float n = mNoise( vMP.xz * 0.06 + flow + layer * 7.3 ) * 0.65 + mNoise( vMP.xz * 0.17 - flow * 1.3 + layer * 3.1 ) * 0.35;
        float edge = 1.0 - smoothstep( 0.5, 1.0, vM.x );
        diffuseColor.a *= uDens * edge * smoothstep( 0.32, 0.78, n ) * ( 1.0 - layer * 0.22 );`);
  };
  mat.customProgramCacheKey = () => 'wt2-mist-' + key;
  return mat;
}

/** 반짝이 별(크레이터 위를 둥실둥실, 깜빡깜빡) */
function sparkleMat(): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const uniforms = { uTime: sharedUniforms.uTime };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aPhase;\nvarying float vTw;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float tw = pow( 0.5 + 0.5 * sin( uTime * ( 1.6 + aPhase * 2.4 ) + aPhase * 40.0 ), 3.0 );
        vTw = tw;
        float c = cos( uTime * 1.2 + aPhase * 9.0 ), s = sin( uTime * 1.2 + aPhase * 9.0 );
        transformed.xz = mat2( c, -s, s, c ) * transformed.xz;
        transformed *= 0.35 + tw * 0.9;
        transformed.y += sin( uTime * 0.6 + aPhase * 30.0 ) * 0.45;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTw;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= 0.25 + vTw * 0.75;');
  };
  mat.customProgramCacheKey = () => 'wt2-sparkle';
  return mat;
}

const MIST_LAYERS = [0.35, 1.1, 2.0];
/** 물안개 판 3겹(한 메시) */
function mistMesh(L: LakeInfo, mat: THREE.Material): THREE.Mesh {
  const seg = 40, R = L.r * 1.18;
  const pos: number[] = [], am: number[] = [], idx: number[] = [];
  MIST_LAYERS.forEach((h, layer) => {
    const base = pos.length / 3;
    pos.push(L.x, L.level + h, L.z); am.push(0, layer);
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2, rr = R * (1 + layer * 0.06);
      pos.push(L.x + Math.cos(a) * rr * 0.5, L.level + h, L.z + Math.sin(a) * rr * 0.5); am.push(0.5, layer);
      pos.push(L.x + Math.cos(a) * rr, L.level + h, L.z + Math.sin(a) * rr); am.push(1, layer);
    }
    for (let s = 0; s < seg; s++) {
      const i0 = base + 1 + s * 2, i1 = base + 1 + ((s + 1) % seg) * 2;
      idx.push(base, i1, i0, i0, i1, i1 + 1, i0, i1 + 1, i0 + 1);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aM', new THREE.Float32BufferAttribute(am, 2));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat);
  m.name = 'mist-' + L.id;
  m.renderOrder = 4;
  return m;
}

/** 호수 안쪽(가장자리에서 margin m 이상) 임의 점 */
function insidePoints(island: IslandMod, L: LakeInfo, n: number, margin: number, rnd: () => number, minGap = 0): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  for (let t = 0; t < n * 30 && out.length < n; t++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * L.r * 1.1;
    const x = L.x + Math.cos(a) * rr, z = L.z + Math.sin(a) * rr;
    if (island.lakeEdge(L, x, z) < margin) continue;
    if (minGap > 0 && out.some((q) => Math.hypot(q.x - x, q.z - z) < minGap)) continue;
    out.push({ x, z });
  }
  return out;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, pts: Array<{ x: number; y: number; z: number; s?: number; ry?: number }>, rnd: () => number, name: string, colors?: THREE.Color[]): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, pts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const phase = new Float32Array(pts.length);
  pts.forEach((pt, i) => {
    e.set(0, pt.ry ?? 0, 0); q.setFromEuler(e);
    const k = pt.s ?? 1; s.set(k, k, k);
    m.compose(p.set(pt.x, pt.y, pt.z), q, s);
    im.setMatrixAt(i, m);
    phase[i] = rnd();
    if (colors) im.setColorAt(i, colors[i % colors.length]);
  });
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.name = name;
  im.frustumCulled = true;
  return im;
}

/** 청크를 버릴 때: 공유 아닌 지오메트리 + 인스턴스 버퍼 */
function disposeChunk(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}

/** 특별한 물 청크 레이어 두 개(은하수 물판 · 장식)를 만든다. 은하수 호수는 inland.ts 가 그리지 않는다 */
export function waterFxLayers(island: IslandMod, rng: Rng): ChunkLayer[] {
  const lakes = island.worldLakes();
  const galaxy = lakes.filter((L) => L.galaxy);
  const fx = lakes.filter((L) => L.galaxy || L.kind === 'hotspring' || L.kind === 'swamp' || L.kind === 'foglake');
  const gMats = new Map<string, THREE.MeshBasicMaterial>();
  const steam = steamMat();
  const sparkle = sparkleMat();
  const fogMist = mistMat('#d9d1f3', 0.58, 'fog');
  const swampMist = mistMat('#d6ebc4', 0.34, 'swamp');
  // 공유 원본 지오메트리(청크마다 own() 으로 복제해 aPhase 를 붙인다)
  const puffGeo = shared(new THREE.IcosahedronGeometry(0.55, 1));
  const starGeo = shared(new THREE.OctahedronGeometry(0.16, 0));
  starGeo.scale(1, 1.7, 1);
  const padGeo = shared(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 14));
  const budGeo = shared(new THREE.SphereGeometry(0.16, 10, 8));
  const padMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
  const budMat = new THREE.MeshStandardMaterial({ color: '#ffb3cf', roughness: 0.5, emissive: '#ff8fb8', emissiveIntensity: 0.15 });
  const padCols = ['#6fb552', '#82c45e', '#5ea54a'].map((c) => new THREE.Color(c));
  const inChunk = (L: LakeInfo, c: { x0: number; z0: number; size: number }) => L.x >= c.x0 && L.x < c.x0 + c.size && L.z >= c.z0 && L.z < c.z0 + c.size;

  const galaxyLayer: ChunkLayer = {
    key: 'worldterrain-galaxy', size: 512, radius: 2600, world: 'earth',
    build: (c) => {
      const mine = galaxy.filter((L) => inChunk(L, c));
      if (!mine.length) return null;
      const g = new THREE.Group();
      g.name = 'galaxy-water';
      for (const L of mine) {
        let mat = gMats.get(L.id);
        if (!mat) { mat = galaxyMat(island, L); gMats.set(L.id, mat); }
        g.add(galaxyMesh(island, L, mat));
      }
      return g;
    },
    dispose: disposeChunk,
  };

  const fxLayer: ChunkLayer = {
    key: 'worldterrain-waterfx', size: 128, radius: 420, world: 'earth', detail: true,
    build: (c) => {
      const mine = fx.filter((L) => inChunk(L, c));
      if (!mine.length) return null;
      const g = new THREE.Group();
      g.name = 'water-fx';
      for (const L of mine) {
        const rnd = rng(`worldterrain-waterfx:${L.id}`);
        if (L.kind === 'hotspring') {
          // 김: 물 위에서 몽글몽글 — 호수가 클수록 많이
          const pts = insidePoints(island, L, Math.round(8 + L.r * 1.2), 0.8, rnd).map((p) => ({ ...p, y: L.level + 0.2, s: 0.8 + rnd() * 0.6 }));
          if (pts.length) g.add(instanced(own(puffGeo), steam, pts, rnd, 'steam-' + L.id));
        } else if (L.kind === 'swamp') {
          // 연잎 + 분홍 꽃봉오리 + 옅은 초록 물안개
          const pads = insidePoints(island, L, Math.round(L.r * 1.6), 1.5, rnd, 2.2).map((p) => ({ ...p, y: L.level + 0.03, s: 1.3 + rnd() * 1.2, ry: rnd() * Math.PI * 2 }));
          if (pads.length) {
            const pm = instanced(own(padGeo), padMat, pads, rnd, 'lilypad-' + L.id, padCols);
            pm.receiveShadow = true;
            g.add(pm);
            const buds = pads.filter(() => rnd() < 0.25).map((p) => ({ x: p.x + 0.15 * p.s, y: p.y + 0.16 * p.s, z: p.z - 0.12 * p.s, s: p.s * (0.9 + rnd() * 0.4) }));
            if (buds.length) g.add(instanced(own(budGeo), budMat, buds, rnd, 'lotus-' + L.id));
          }
          g.add(mistMesh(L, swampMist));
        } else if (L.kind === 'foglake') {
          g.add(mistMesh(L, fogMist));
        }
        if (L.galaxy) {
          // 반짝이: 물 위 0.4~2.6 m 에 둥실
          const pts = insidePoints(island, L, Math.round(L.r * 1.4), 2, rnd).map((p) => ({ ...p, y: L.level + 0.4 + rnd() * 2.2, s: 0.7 + rnd() * 0.8 }));
          if (pts.length) g.add(instanced(own(starGeo), sparkle, pts, rnd, 'sparkle-' + L.id));
        }
      }
      g.traverse((o) => { o.userData.world = 'earth'; });
      return g.children.length ? g : null;
    },
    dispose: disposeChunk,
  };
  return [galaxyLayer, fxLayer];
}
