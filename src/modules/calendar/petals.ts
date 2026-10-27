// 월요일 꽃잎비(GDD 4.13 요일 이벤트) — 줍는 꽃잎 소용돌이(청크 스트리밍, 청크마다 InstancedMesh 2개)와
// 플레이어 둘레에 살랑살랑 내리는 꽃잎(InstancedMesh 1개, 장식). 지오메트리·재질은 모듈 전역에서 하나씩(shared).
import * as THREE from 'three';

/** 소용돌이 하나의 꽃잎 수 */
export const SWIRL_N = 6;
/** 내리는 꽃잎 수(품질 detail 배율을 곱한다) */
export const RAIN_N = 90;
const RAIN_BOX = 18;

let PETAL_GEO: THREE.BufferGeometry | null = null;
let CORE_GEO: THREE.BufferGeometry | null = null;
let PETAL_MAT: THREE.MeshStandardMaterial | null = null;
let CORE_MAT: THREE.MeshStandardMaterial | null = null;

/** 꽃잎 한 장: 끝이 살짝 파인 통통한 물방울 모양 + 가운데가 오목하게 휜 면 */
export function petalGeo(): THREE.BufferGeometry {
  if (PETAL_GEO) return PETAL_GEO;
  const s = new THREE.Shape();
  s.moveTo(0, -0.07);
  s.bezierCurveTo(0.075, -0.05, 0.085, 0.04, 0.03, 0.075);
  s.quadraticCurveTo(0, 0.058, -0.03, 0.075);
  s.bezierCurveTo(-0.085, 0.04, -0.075, -0.05, 0, -0.07);
  const g = new THREE.ShapeGeometry(s, 6);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, -(x * x) * 6 + y * 0.12); // 오목하게 + 살짝 젖힘
  }
  g.computeVertexNormals();
  g.userData.shared = true;
  return (PETAL_GEO = g);
}
function coreGeo(): THREE.BufferGeometry {
  if (CORE_GEO) return CORE_GEO;
  const g = new THREE.SphereGeometry(0.15, 16, 12);
  g.userData.shared = true;
  return (CORE_GEO = g);
}
export function petalMat(): THREE.MeshStandardMaterial {
  return (PETAL_MAT ??= new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ff9fbf', emissiveIntensity: 0.28, roughness: 0.55, side: THREE.DoubleSide }));
}
function coreMat(): THREE.MeshStandardMaterial {
  return (CORE_MAT ??= new THREE.MeshStandardMaterial({ color: '#fff3f8', emissive: '#ffc6da', emissiveIntensity: 1.2, roughness: 0.3, transparent: true, opacity: 0.85 }));
}

const PINKS = ['#ffc1d6', '#ffe3ee', '#ff9fbf', '#fff5f9', '#ffd0e0'].map((c) => new THREE.Color(c));

export interface PetalSpot { key: string; x: number; y: number; z: number; phase: number }
export interface PetalChunk { group: THREE.Group; spots: PetalSpot[]; petals: THREE.InstancedMesh; cores: THREE.InstancedMesh }

/** 청크 하나의 소용돌이들(처음엔 그 자리에 정지한 모양) */
export function buildPetalChunk(spots: PetalSpot[], rnd: () => number): PetalChunk {
  const group = new THREE.Group();
  group.name = 'calendar-petals';
  const petals = new THREE.InstancedMesh(petalGeo(), petalMat(), spots.length * SWIRL_N);
  const cores = new THREE.InstancedMesh(coreGeo(), coreMat(), spots.length);
  petals.castShadow = false; cores.castShadow = false;
  for (let i = 0; i < spots.length * SWIRL_N; i++) petals.setColorAt(i, PINKS[Math.floor(rnd() * PINKS.length) % PINKS.length]);
  if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
  group.add(petals, cores);
  const c: PetalChunk = { group, spots, petals, cores };
  posePetalChunk(c, 0, () => false);
  // 소용돌이는 청크 안에서만 움직인다 — 경계 구는 넉넉히
  petals.computeBoundingSphere();
  if (petals.boundingSphere) petals.boundingSphere.radius += 2;
  cores.computeBoundingSphere();
  if (cores.boundingSphere) cores.boundingSphere.radius += 2;
  return c;
}

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
const ZERO = new THREE.Vector3(0, 0, 0);

/** 소용돌이 돌리기(주운 자리는 크기 0) */
export function posePetalChunk(c: PetalChunk, t: number, picked: (key: string) => boolean) {
  c.spots.forEach((s, i) => {
    const gone = picked(s.key);
    for (let j = 0; j < SWIRL_N; j++) {
      const k = i * SWIRL_N + j;
      if (gone) { M.compose(P.set(s.x, s.y, s.z), Q.identity(), ZERO); c.petals.setMatrixAt(k, M); continue; }
      const a = t * 1.7 + s.phase + (j / SWIRL_N) * Math.PI * 2;
      const r = 0.62 + 0.14 * Math.sin(t * 2.1 + j * 1.3 + s.phase);
      const y = s.y + 0.6 + 0.4 * Math.sin(t * 1.9 + j * 0.9 + s.phase) + j * 0.09;
      P.set(s.x + Math.cos(a) * r, y, s.z + Math.sin(a) * r);
      Q.setFromEuler(E.set(Math.sin(t * 3 + j) * 0.9, -a, Math.cos(t * 2.4 + j) * 0.7));
      S.setScalar(2.3 + 0.25 * Math.sin(t * 4 + j));
      c.petals.setMatrixAt(k, M.compose(P, Q, S));
    }
    const bob = Math.sin(t * 2.3 + s.phase) * 0.06;
    M.compose(P.set(s.x, s.y + 0.85 + bob, s.z), Q.identity(), gone ? ZERO : S.setScalar(0.9 + 0.12 * Math.sin(t * 3.1 + s.phase)));
    c.cores.setMatrixAt(i, M);
  });
  c.petals.instanceMatrix.needsUpdate = true;
  c.cores.instanceMatrix.needsUpdate = true;
}

// ───────────── 내리는 꽃잎(플레이어 둘레) ─────────────
export class PetalRain {
  readonly mesh: THREE.InstancedMesh;
  private p: Float32Array;
  private v: Float32Array;
  private n: number;
  private seeded = false;
  constructor(private rnd: () => number, n = RAIN_N) {
    this.n = Math.max(8, Math.floor(n));
    this.mesh = new THREE.InstancedMesh(petalGeo(), petalMat(), this.n);
    this.mesh.name = 'calendar-petalrain';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.visible = false;
    this.p = new Float32Array(this.n * 4);
    this.v = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) this.mesh.setColorAt(i, PINKS[i % PINKS.length]);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  private respawn(i: number, cx: number, cy: number, cz: number, anywhere: boolean) {
    const r = this.rnd;
    const o = i * 4;
    this.p[o] = cx + (r() * 2 - 1) * RAIN_BOX;
    this.p[o + 2] = cz + (r() * 2 - 1) * RAIN_BOX;
    this.p[o + 1] = cy + (anywhere ? r() * 14 - 1 : 11 + r() * 4);
    this.p[o + 3] = r() * Math.PI * 2;
    this.v[i * 3] = 0.25 + r() * 0.35; // 바람(+x)
    this.v[i * 3 + 1] = 0.55 + r() * 0.5; // 떨어지는 속도
    this.v[i * 3 + 2] = (r() * 2 - 1) * 0.25;
  }
  /** on=false 면 숨긴다. (cx, cy, cz) = 플레이어 */
  update(on: boolean, t: number, dt: number, cx: number, cy: number, cz: number) {
    this.mesh.visible = on;
    if (!on) { this.seeded = false; return; }
    if (!this.seeded) { for (let i = 0; i < this.n; i++) this.respawn(i, cx, cy, cz, true); this.seeded = true; }
    const d = Math.min(0.1, Math.max(0, dt));
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      const sway = Math.sin(t * 1.3 + this.p[o + 3] * 3) * 0.6;
      this.p[o] += (this.v[i * 3] + sway * 0.4) * d;
      this.p[o + 1] -= this.v[i * 3 + 1] * d;
      this.p[o + 2] += (this.v[i * 3 + 2] + Math.cos(t * 0.9 + this.p[o + 3]) * 0.2) * d;
      const far = Math.abs(this.p[o] - cx) > RAIN_BOX + 2 || Math.abs(this.p[o + 2] - cz) > RAIN_BOX + 2;
      if (this.p[o + 1] < cy - 1.5 || far) this.respawn(i, cx, cy, cz, far);
      P.set(this.p[o], this.p[o + 1], this.p[o + 2]);
      Q.setFromEuler(E.set(t * 1.8 + this.p[o + 3], this.p[o + 3], Math.sin(t * 2.2 + this.p[o + 3]) * 1.2));
      this.mesh.setMatrixAt(i, M.compose(P, Q, S.setScalar(1.1)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
