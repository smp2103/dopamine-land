// 플레이어 재질: '몸 재질' 하나가 피부·천·젤리·밑창을 정점마다 다르게 그린다.
// 정점 속성 color(색) + surf(x 거칠기 · y 클리어코트 · z 보송함(sheen) · w 자기 색 채움) → 관절마다 메시 하나로 합쳐도 재질 느낌이 남는다.
// 모든 몸 재질엔 젤리 가장자리 빛(프레넬 림)과 '그늘이 회색으로 죽지 않는' 자기 색 채움이 들어간다.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** 정점 표면: [거칠기, 클리어코트, 보송함, 채움] */
export type Surf = readonly [number, number, number, number];
export const SURF = {
  skin: [0.62, 0, 0.45, 0.2],
  cloth: [0.88, 0, 1, 0.1],
  knit: [0.95, 0, 1, 0.08],
  jelly: [0.24, 1, 0, 0.14],
  candy: [0.3, 0.7, 0, 0.18],
  matte: [0.55, 0, 0.3, 0.1],
  hair: [0.38, 0.45, 0, 0.13],
  brow: [0.6, 0, 0, 0.12],
  eye: [0.2, 1, 0, 0.05],
} as const satisfies Record<string, Surf>;

/** 물속 등에서 채움을 함께 올리는 공유 값 */
export interface FillBoost { value: number }

interface BodyOpts { rimK?: number; rimPow?: number; ccRough?: number; boost?: FillBoost; transparent?: boolean; opacity?: number; key?: string }

/** 몸 재질(정점 색 + 정점 표면) */
export function bodyMat(o: BodyOpts = {}): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, emissive: '#ffffff', emissiveIntensity: 1,
    roughness: 1, clearcoat: 1, clearcoatRoughness: o.ccRough ?? 0.16, sheen: 1, sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#ffffff'), transparent: !!o.transparent, opacity: o.opacity ?? 1,
  });
  const rimK = o.rimK ?? 0.32, rimPow = o.rimPow ?? 2.4;
  const boost = o.boost ?? { value: 1 };
  m.userData.boost = boost;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBoost = boost;
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute vec4 surf;\nvarying vec4 vSurf;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSurf = surf;');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'varying vec4 vSurf;\nuniform float uBoost;\nvoid main() {')
      // 비스듬한 가장자리: 법선이 눈과 거의 직각이면 프레넬(바탕·클리어코트)이 1 로 치솟아 바탕색이 빠지고 회청빛 반사만 남는다
      // → 실루엣·덩어리 테두리에 가는 검은 줄. 빛 계산용 법선만 눈 쪽으로 조금 당기고, 림 빛은 원래 법선(nRaw)으로.
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  vec3 nRaw = normal;
  normal = normalize(normal + normalize(vViewPosition) * max(0.0, 0.35 - dot(normal, normalize(vViewPosition))));`)
      .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
  clearcoatNormal = normal;`)
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb * vSurf.w * uBoost;')
      .replace('float roughnessFactor = roughness;', 'float roughnessFactor = roughness * vSurf.x;')
      .replace('material.clearcoat = clearcoat;', 'material.clearcoat = clearcoat * vSurf.y;')
      .replace('material.sheenColor = sheenColor;', 'material.sheenColor = sheenColor * mix(vec3(1.0), vColor.rgb, 0.55) * vSurf.z;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float ndv = clamp(dot(nRaw, normalize(vViewPosition)), 0.0, 1.0);
          totalEmissiveRadiance += mix(vec3(1.0), vColor.rgb, 0.4) * ${rimK.toFixed(3)} * pow(1.0 - ndv, ${rimPow.toFixed(2)});
        }`,
      );
  };
  const key = `pl-body4-${rimK.toFixed(3)}-${rimPow.toFixed(2)}`;
  m.customProgramCacheKey = () => key;
  return m;
}

// ───────────── 정점 색·표면 칠하기 + 묶기 ─────────────
export type Paint = THREE.ColorRepresentation | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.ColorRepresentation);

/** 위치·법선·색·표면(+uv) 만 남긴 인덱스 지오메트리로 */
export function painted(g0: THREE.BufferGeometry, color: Paint, surf: Surf | ((p: THREE.Vector3) => Surf), keepUV = false): THREE.BufferGeometry {
  let g = g0;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUV && k === 'uv')) g.deleteAttribute(k);
  if (!g.index) g = mergeVertices(g, 1e-6);
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3), sf = new Float32Array(p.count * 4);
  const c = new THREE.Color(), v = new THREE.Vector3(), nv = new THREE.Vector3();
  const fixed = typeof color === 'function' ? null : new THREE.Color(color);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (fixed) c.copy(fixed); else c.set((color as (p: THREE.Vector3, n: THREE.Vector3) => THREE.ColorRepresentation)(v, nv.fromBufferAttribute(n, i)));
    col.set([c.r, c.g, c.b], i * 3);
    sf.set(typeof surf === 'function' ? surf(v) : surf, i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('surf', new THREE.BufferAttribute(sf, 4));
  if (keepUV && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  return g;
}

/** 이미 색칠된 지오메트리에 uv(0) 를 채워 얼굴 메시와 합칠 수 있게 */
export function withUV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

/** 부품 모아 메시 하나로 */
export class Batch {
  readonly parts: THREE.BufferGeometry[] = [];
  private o = new THREE.Object3D();
  add(geo: THREE.BufferGeometry, color: Paint, surf: Surf | ((p: THREE.Vector3) => Surf), x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s: number | readonly [number, number, number] = 1): this {
    const g = painted(geo, color, surf);
    this.o.position.set(x, y, z);
    this.o.rotation.set(rx, ry, rz);
    if (typeof s === 'number') this.o.scale.setScalar(s); else this.o.scale.set(s[0], s[1], s[2]);
    this.o.updateMatrix();
    g.applyMatrix4(this.o.matrix);
    if (this.o.matrix.determinant() < 0) flipFaces(g);
    this.parts.push(g);
    return this;
  }
  /** 이미 칠해 자리 잡은 지오메트리 */
  raw(g: THREE.BufferGeometry): this { this.parts.push(g); return this; }
  get empty(): boolean { return this.parts.length === 0; }
  geometry(): THREE.BufferGeometry { return mergeGeometries(this.parts, false)!; }
  build(mat: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(this.geometry(), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    return m;
  }
}

/** 거울 변환 뒤 면 방향 되돌리기 */
export function flipFaces(g: THREE.BufferGeometry): void {
  const idx = g.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  idx.needsUpdate = true;
}

/** 간단한 결정적 난수(Math.random 금지) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
