// 달 지형 청크: 가까운 땅(2 m 격자 + 청크마다 trimesh 충돌) · 먼 땅(8 m 격자, 고운 땅을 뚫지 않게 최솟값 높이) ·
// 장식(바위·자갈·결정 덤불·작은 구멍 데칼, detail) · 줍는 것(발광 달꽃·별가루 반짝이, 하루 한 번).
// 크림·회색 고운 흙 + 크레이터 안은 보랏빛 그늘, 도톰한 테는 하얗게. 달이 활성일 때만 짓는다(다른 행성 자리에선 null).
import * as THREE from 'three';
import type { Game } from '../../core/game';
import type { PhysBody } from '../../core/physics';
import { MOON_R, moonSample, moonHeight, moonHeightLow, moonCraters, moonPondsLocal, PAD_R, MOON_PLACES } from './logic';
import { starGeometry } from './model';

/** 줍는 것 하나(달꽃·별가루) — 청크가 지을 때 등록, 버릴 때 지운다 */
export interface Pickup {
  id: string;
  kind: 'flower' | 'stardust';
  /** 월드 좌표 */
  pos: THREE.Vector3;
  mesh: THREE.InstancedMesh;
  index: number;
  /** 원래 행렬(줍고 나면 0 으로, 다음 날 되돌린다) */
  matrix: THREE.Matrix4;
  taken: boolean;
}

export interface TerrainDeps {
  game: Game;
  origin: THREE.Vector3;
  rng: (key: string) => () => number;
  /** 달이 지금 활성 행성인가 */
  active: () => boolean;
  /** 오늘 이미 딴 것인가 */
  takenToday: (id: string) => boolean;
}

const shared = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => { x.userData.shared = true; return x; };

// ── 색: 크림·회색 고운 흙
const C = {
  base: new THREE.Color('#e3d8c6'), high: new THREE.Color('#f1e9da'), mare: new THREE.Color('#c6bfd6'),
  bowl: new THREE.Color('#a99fc2'), rim: new THREE.Color('#fbf6ee'), pink: new THREE.Color('#eccbd5'),
  mint: new THREE.Color('#c9e3db'), far: new THREE.Color('#b3abc9'), pad: new THREE.Color('#dcd6e8'),
};
const tmp = new THREE.Color();
function soilColor(x: number, z: number, out: THREE.Color) {
  const s = moonSample(x, z);
  out.copy(C.base).lerp(C.high, THREE.MathUtils.clamp((s.h - 13.2) * 0.25, 0, 1));
  const mare = Math.sin(x * 0.017 + 0.4) * Math.cos(z * 0.021 - 1.2) + 0.45 * Math.sin(x * 0.041 - z * 0.033);
  out.lerp(C.mare, THREE.MathUtils.smoothstep(mare, 0.15, 0.85) * 0.7);
  const pk = 0.5 + 0.5 * Math.sin(x * 0.011 + 1.3) * Math.sin(z * 0.013 - 0.4);
  const mt = 0.5 + 0.5 * Math.sin(x * 0.009 - 2.1) * Math.cos(z * 0.012 + 0.8);
  out.lerp(C.pink, Math.max(0, pk - 0.6) * 1.2).lerp(C.mint, Math.max(0, mt - 0.62) * 1.2);
  out.lerp(C.bowl, Math.min(1, Math.pow(s.bowl, 0.8) * 0.8)).lerp(C.rim, s.rim * 0.85);
  // 착륙장 둘레 다진 흙
  const dp = Math.hypot(x, z);
  if (dp < PAD_R + 4) out.lerp(C.pad, (1 - THREE.MathUtils.smoothstep(dp, PAD_R, PAD_R + 4)) * 0.6);
  out.lerp(C.far, s.edge * 0.7);
  const sp = Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.0) * Math.sin(z * 0.19 - Math.cos(x * 0.13) * 1.7);
  if (sp > 0.4) out.lerp(C.pink, (sp - 0.4) * 0.4); else if (sp < -0.5) out.lerp(C.mint, (-sp - 0.5) * 0.45);
  const n = Math.sin(x * 1.7 + z * 2.3) * Math.sin(x * 2.9 - z * 1.1) * 0.025 + Math.sin(x * 0.37 + z * 0.29) * 0.02;
  out.r += n; out.g += n; out.b += n;
  return out;
}

let groundMat: THREE.MeshStandardMaterial | null = null;
const soilMat = () => groundMat ?? (groundMat = shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, emissive: '#3a2c58', emissiveIntensity: 0.04 })));

/** 국소 사각 칸이 달 원판과 겹치나 */
function touchesMoon(lx0: number, lz0: number, size: number, pad = 40) {
  const cx = Math.max(lx0, Math.min(0, lx0 + size)), cz = Math.max(lz0, Math.min(0, lz0 + size));
  return Math.hypot(cx, cz) < MOON_R + pad;
}

/** 높이 격자 메시(국소 높이 함수, 월드 좌표 정점). 법선은 높이 함수에서 바로 → 청크 경계에 이음매가 없다 */
function gridMesh(o: THREE.Vector3, lx0: number, lz0: number, size: number, res: number, h: (x: number, z: number) => number) {
  const n = Math.round(size / res);
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, nr = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const e = Math.max(0.5, res * 0.5), nv = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const lx = lx0 + size / 2 + p.getX(i), lz = lz0 + size / 2 + p.getZ(i);
    p.setXYZ(i, o.x + lx, o.y + h(lx, lz), o.z + lz);
    nv.set(moonHeight(lx - e, lz) - moonHeight(lx + e, lz), 2 * e, moonHeight(lx, lz - e) - moonHeight(lx, lz + e)).normalize();
    nr.setXYZ(i, nv.x, nv.y, nv.z);
    soilColor(lx, lz, tmp);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// ── 공유 장식 지오메트리
let rockGeoC: THREE.BufferGeometry | null = null;
function rockGeo() {
  if (rockGeoC) return rockGeoC;
  const g = new THREE.SphereGeometry(1, 18, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.12 * Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 2.7 - y);
    p.setXYZ(i, x * k, Math.max(y, -0.35) * k * 0.72, z * k);
  }
  g.computeVertexNormals();
  return (rockGeoC = shared(g));
}
let crystalGeoC: THREE.BufferGeometry | null = null;
function crystalGeo() {
  if (crystalGeoC) return crystalGeoC;
  // 끝이 둥근 결정 기둥(덤불처럼 모아 심는다)
  const g = new THREE.CapsuleGeometry(0.32, 1.1, 3, 6);
  g.translate(0, 0.85, 0);
  return (crystalGeoC = shared(g));
}
let craterletC: THREE.BufferGeometry | null = null;
function craterletGeo() {
  if (craterletC) return craterletC;
  const prof: THREE.Vector2[] = [];
  const NPF = 14;
  for (let i = 0; i <= NPF; i++) {
    const r = (i / NPF) * 1.45;
    const y = r < 1 ? -0.12 * (1 - r * r) + 0.015 : 0.06 * Math.exp(-((r - 1.02) ** 2) / 0.018) + 0.015 * (1 - (r - 1) / 0.45);
    prof.push(new THREE.Vector2(Math.max(r, 0.001), y));
  }
  prof.reverse();
  const lg = new THREE.LatheGeometry(prof, 28);
  const lp = lg.attributes.position;
  const lc = new Float32Array(lp.count * 3);
  const cIn = new THREE.Color('#c2bad2'), cRm = new THREE.Color('#fffaf2'), cOut = new THREE.Color('#ebe3d2');
  for (let i = 0; i < lp.count; i++) {
    const r = Math.hypot(lp.getX(i), lp.getZ(i));
    tmp.copy(cIn).lerp(cRm, THREE.MathUtils.smoothstep(r, 0.35, 1.0)).lerp(cOut, THREE.MathUtils.smoothstep(r, 1.05, 1.4));
    lc[i * 3] = tmp.r; lc[i * 3 + 1] = tmp.g; lc[i * 3 + 2] = tmp.b;
  }
  lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  lg.computeVertexNormals();
  return (craterletC = shared(lg));
}
let flowerGeoC: THREE.BufferGeometry | null = null;
/** 달꽃: 짧은 줄기 + 둥근 꽃잎 5장 + 노란 가운데(정점색, 하나로 합친 지오메트리) */
function flowerGeo() {
  if (flowerGeoC) return flowerGeoC;
  const parts: Array<{ g: THREE.BufferGeometry; c: string }> = [];
  const stem = new THREE.CylinderGeometry(0.025, 0.035, 0.42, 6); stem.translate(0, 0.21, 0);
  parts.push({ g: stem, c: '#c9e8d8' });
  for (let i = 0; i < 2; i++) {
    const leaf = new THREE.SphereGeometry(0.07, 8, 6); leaf.scale(1, 0.3, 0.5); leaf.translate(i ? 0.07 : -0.07, 0.12, 0);
    parts.push({ g: leaf, c: '#bfe6d2' });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const pe = new THREE.SphereGeometry(0.075, 10, 8); pe.scale(1, 0.35, 0.65); pe.rotateY(-a); pe.translate(Math.cos(a) * 0.08, 0.44, Math.sin(a) * 0.08);
    parts.push({ g: pe, c: '#fffaf2' });
  }
  const ctr = new THREE.SphereGeometry(0.045, 10, 8); ctr.translate(0, 0.46, 0);
  parts.push({ g: ctr, c: '#fff2a8' });
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  for (const { g, c } of parts) {
    const gi = g.index ? g : g;
    const base = pos.length / 3;
    const p = gi.attributes.position, n = gi.attributes.normal;
    const cc = new THREE.Color(c);
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(cc.r, cc.g, cc.b); }
    const ix = gi.index!;
    for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return (flowerGeoC = shared(out));
}
let sparkGeoC: THREE.BufferGeometry | null = null;
const sparkGeo = () => sparkGeoC ?? (sparkGeoC = shared(starGeometry(0.22, 0.1, 0.08)));

let M: { rock: THREE.Material; crystal: THREE.Material; craterlet: THREE.Material; flower: THREE.Material; spark: THREE.Material } | null = null;
function mats() {
  return M ?? (M = {
    rock: shared(new THREE.MeshStandardMaterial({ roughness: 0.86, emissive: '#2c2440', emissiveIntensity: 0.05 })),
    crystal: shared(new THREE.MeshPhysicalMaterial({ roughness: 0.12, clearcoat: 1, emissive: '#ffffff', emissiveIntensity: 0.32 })),
    craterlet: shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, emissive: '#3a2c58', emissiveIntensity: 0.07 })),
    flower: shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: '#fff6e0', emissiveIntensity: 0.75 })),
    spark: shared(new THREE.MeshStandardMaterial({ color: '#fff2a8', roughness: 0.25, emissive: '#ffe066', emissiveIntensity: 1.1 })),
  });
}
const ROCK_COLS = ['#ece4d4', '#ddd7e6', '#f4ecdc', '#e9dbe3', '#dbe8e6'].map((c) => new THREE.Color(c));
const CRY_COLS = ['#ffd0de', '#c8e8ff', '#d9ccff', '#c8f5e2', '#fff1a8'].map((c) => new THREE.Color(c));

/** 연못·장소 위엔 장식을 두지 않는다(국소) */
function clearSpot(x: number, z: number, ponds: Array<{ x: number; z: number; r: number }>) {
  if (Math.hypot(x, z) < PAD_R + 4) return false;
  if (Math.hypot(x, z) > MOON_R * 0.95) return false;
  for (const p of ponds) if (Math.hypot(x - p.x, z - p.z) < p.r + 1.5) return false;
  const V = MOON_PLACES.village;
  if (Math.hypot(x - V.x, z - V.z) < 22) return false;
  return true;
}

/** 지형 기울기 법선(국소) */
function slopeQ(x: number, z: number, q: THREE.Quaternion) {
  const e = 0.4, nx = moonHeight(x - e, z) - moonHeight(x + e, z), nz = moonHeight(x, z - e) - moonHeight(x, z + e);
  return q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 2 * e, nz).normalize());
}

export interface MoonTerrain {
  /** 지금 살아 있는 줍는 것 */
  pickups: Map<string, Pickup>;
  /** 줍기: 그 자리 인스턴스를 숨긴다 */
  take(p: Pickup): void;
  /** 날이 바뀌면 숨긴 걸 다시 보인다 */
  refresh(): void;
  /** 별가루 반짝이 빙글빙글(살아 있는 것만) */
  update(t: number): void;
}

export function addMoonTerrain(d: TerrainDeps): MoonTerrain {
  const { game, origin: O } = d;
  const ponds = moonPondsLocal();
  const craters = moonCraters();
  const bodies = new Map<string, PhysBody>();
  const pickups = new Map<string, Pickup>();
  const sparkMeshes = new Set<THREE.InstancedMesh>();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();

  // ── 가까운 땅: 96 m 청크, 2 m 격자, trimesh 충돌
  game.chunks.add({
    key: 'space-moon-near', size: 96, radius: 200, world: 'space',
    build: ({ x0, z0, size, cx, cz }) => {
      if (!d.active()) return null;
      const lx0 = x0 - O.x, lz0 = z0 - O.z;
      if (!touchesMoon(lx0, lz0, size)) return null;
      const geo = gridMesh(O, lx0, lz0, size, 2, moonHeight);
      const mesh = new THREE.Mesh(geo, soilMat());
      mesh.receiveShadow = true;
      mesh.name = 'moon-ground';
      // 충돌: 같은 정점을 그대로
      const pos = geo.attributes.position.array as Float32Array;
      const vs = new Float32Array(pos);
      const ix = geo.index!;
      const is = new Uint32Array(ix.count);
      for (let i = 0; i < ix.count; i++) is[i] = ix.getX(i);
      const key = `${cx},${cz}`;
      bodies.get(key)?.remove();
      bodies.set(key, game.physics.add({ shape: { kind: 'mesh', vertices: vs, indices: is }, type: 'fixed', position: { x: 0, y: 0, z: 0 }, tag: 'ground' }));
      mesh.userData.moonKey = key;
      return mesh;
    },
    dispose: (o) => {
      const k = o.userData.moonKey as string;
      bodies.get(k)?.remove();
      bodies.delete(k);
      (o as THREE.Mesh).geometry.dispose();
    },
  });

  // ── 먼 땅: 200 m 청크, 8 m 격자(최솟값 높이 → 고운 땅을 뚫고 나오지 않는다)
  game.chunks.add({
    key: 'space-moon-far', size: 200, radius: 900, world: 'space',
    build: ({ x0, z0, size }) => {
      if (!d.active()) return null;
      const lx0 = x0 - O.x, lz0 = z0 - O.z;
      if (!touchesMoon(lx0, lz0, size, 60)) return null;
      const geo = gridMesh(O, lx0, lz0, size, 8, (x, z) => moonHeightLow(x, z, 8));
      const mesh = new THREE.Mesh(geo, soilMat());
      mesh.receiveShadow = true;
      mesh.name = 'moon-ground-far';
      return mesh;
    },
    dispose: (o) => (o as THREE.Mesh).geometry.dispose(),
  });

  // ── 장식(detail): 바위·자갈·결정 덤불·작은 구멍
  game.chunks.add({
    key: 'space-moon-deco', size: 96, radius: 150, world: 'space', detail: true,
    build: ({ x0, z0, size, cx, cz }) => {
      if (!d.active()) return null;
      const lx0 = x0 - O.x, lz0 = z0 - O.z;
      if (!touchesMoon(lx0, lz0, size, 0)) return null;
      const r = d.rng(`space:deco:${cx},${cz}`);
      const grp = new THREE.Group();
      grp.name = 'moon-deco';
      const inChunk = (x: number, z: number) => x >= lx0 && x < lx0 + size && z >= lz0 && z < lz0 + size;
      // 바위·자갈: 크레이터 테에 모여 있고(분출물 띠) 들판엔 듬성듬성
      const rockList: Array<[number, number, number]> = [];
      for (const c of craters) {
        if (c.pond) continue;
        if (c.x + c.r * 1.8 < lx0 || c.x - c.r * 1.8 > lx0 + size || c.z + c.r * 1.8 < lz0 || c.z - c.r * 1.8 > lz0 + size) continue;
        const n = Math.round(c.r * 3);
        for (let i = 0; i < n; i++) {
          const a = r() * Math.PI * 2, rr = c.r * (0.95 + Math.pow(r(), 2) * 0.8);
          const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
          if (inChunk(x, z) && clearSpot(x, z, ponds)) rockList.push([x, z, i % 4 === 0 ? 0.35 + Math.pow(r(), 2.2) * 1.4 : 0.07 + r() * r() * 0.3]);
        }
      }
      for (let i = 0; i < 70; i++) {
        const x = lx0 + r() * size, z = lz0 + r() * size;
        if (clearSpot(x, z, ponds)) rockList.push([x, z, i % 7 === 0 ? 0.3 + r() * 0.9 : 0.06 + r() * r() * 0.25]);
      }
      if (rockList.length) {
        const im = new THREE.InstancedMesh(rockGeo(), mats().rock, rockList.length);
        rockList.forEach(([x, z, sz], i) => {
          p.set(O.x + x, O.y + moonHeight(x, z) + sz * 0.05, O.z + z);
          q.setFromEuler(new THREE.Euler(0, r() * 6.28, 0));
          s.set(sz * (0.8 + r() * 0.5), sz, sz * (0.8 + r() * 0.5));
          im.setMatrixAt(i, m4.compose(p, q, s));
          im.setColorAt(i, ROCK_COLS[i % ROCK_COLS.length]);
        });
        im.castShadow = true; im.receiveShadow = true;
        grp.add(im);
      }
      // 반짝 결정 덤불(3~5개씩)
      const cry: Array<[number, number, number, number]> = [];
      const bushes = 3 + Math.floor(r() * 4);
      for (let b = 0; b < bushes; b++) {
        let x = lx0 + r() * size, z = lz0 + r() * size;
        // 절반은 크레이터 테 위에
        const near = craters.find((c) => !c.pond && Math.hypot(c.x - x, c.z - z) < c.r * 2.2);
        if (near && r() < 0.6) { const a = r() * 6.28; x = near.x + Math.cos(a) * near.r * 1.05; z = near.z + Math.sin(a) * near.r * 1.05; }
        if (!inChunk(x, z) || !clearSpot(x, z, ponds)) continue;
        const n = 3 + Math.floor(r() * 3), ci = Math.floor(r() * CRY_COLS.length);
        for (let j = 0; j < n; j++) cry.push([x + (r() - 0.5) * 1.1, z + (r() - 0.5) * 1.1, 0.3 + r() * 0.5, ci]);
      }
      if (cry.length) {
        const im = new THREE.InstancedMesh(crystalGeo(), mats().crystal, cry.length);
        cry.forEach(([x, z, sz, ci], i) => {
          p.set(O.x + x, O.y + moonHeight(x, z) - 0.1, O.z + z);
          q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.8, r() * 6, (r() - 0.5) * 0.8));
          im.setMatrixAt(i, m4.compose(p, q, s.set(sz, sz * (0.8 + r() * 0.6), sz)));
          im.setColorAt(i, CRY_COLS[ci]);
        });
        im.castShadow = true;
        grp.add(im);
      }
      // 작은 구멍 데칼(평평한 곳에만)
      const cl: Array<[number, number, number]> = [];
      for (let i = 0; i < 26; i++) {
        const x = lx0 + r() * size, z = lz0 + r() * size;
        const ss = moonSample(x, z);
        if (ss.bowl > 0.3 || ss.rim > 0.4 || ss.edge > 0.2 || !clearSpot(x, z, ponds)) continue;
        const sz = 0.25 + Math.pow(r(), 2.4) * 1.0;
        if (cl.some((c) => Math.hypot(c[0] - x, c[1] - z) < (c[2] + sz) * 1.6)) continue;
        cl.push([x, z, sz]);
      }
      if (cl.length) {
        const im = new THREE.InstancedMesh(craterletGeo(), mats().craterlet, cl.length);
        cl.forEach(([x, z, sz], i) => {
          const y = Math.min(moonHeight(x + sz, z), moonHeight(x - sz, z), moonHeight(x, z + sz), moonHeight(x, z - sz), moonHeight(x, z)) + 0.03;
          im.setMatrixAt(i, m4.compose(p.set(O.x + x, O.y + y, O.z + z), slopeQ(x, z, q), s.set(sz, sz * 0.9, sz)));
        });
        im.receiveShadow = true;
        grp.add(im);
      }
      return grp.children.length ? grp : null;
    },
  });

  // ── 줍는 것: 발광 달꽃(E → m_moonflower, 하루 한 번) · 별가루 반짝이(E → m_stardust)
  game.chunks.add({
    key: 'space-moon-pick', size: 96, radius: 130, world: 'space',
    build: ({ x0, z0, size, cx, cz }) => {
      if (!d.active()) return null;
      const lx0 = x0 - O.x, lz0 = z0 - O.z;
      if (!touchesMoon(lx0, lz0, size, 0)) return null;
      const r = d.rng(`space:pick:${cx},${cz}`);
      const grp = new THREE.Group();
      grp.name = 'moon-pick';
      const ids: string[] = [];
      // 달꽃: 무리(4~7송이) 1~3개
      const fl: Array<[number, number, number]> = [];
      const groups = 1 + Math.floor(r() * 3);
      for (let gI = 0; gI < groups; gI++) {
        const gx = lx0 + 8 + r() * (size - 16), gz = lz0 + 8 + r() * (size - 16);
        if (!clearSpot(gx, gz, ponds) || moonSample(gx, gz).bowl > 0.5) continue;
        const n = 4 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) fl.push([gx + (r() - 0.5) * 3.2, gz + (r() - 0.5) * 3.2, 0.9 + r() * 0.5]);
      }
      if (fl.length) {
        const im = new THREE.InstancedMesh(flowerGeo(), mats().flower, fl.length);
        im.name = 'moon-flowers';
        fl.forEach(([x, z, sz], i) => {
          p.set(O.x + x, O.y + moonHeight(x, z) - 0.02, O.z + z);
          q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3));
          const mm = m4.compose(p, q, s.setScalar(sz)).clone();
          const id = `flower:${cx},${cz}:${i}`;
          const pk: Pickup = { id, kind: 'flower', pos: p.clone().add(new THREE.Vector3(0, 0.3, 0)), mesh: im, index: i, matrix: mm, taken: d.takenToday(id) };
          im.setMatrixAt(i, pk.taken ? new THREE.Matrix4().makeScale(0, 0, 0) : mm);
          pickups.set(id, pk); ids.push(id);
        });
        grp.add(im);
      }
      // 별가루 반짝이 0~2
      const sd: Array<[number, number]> = [];
      const ns = Math.floor(r() * 3);
      for (let i = 0; i < ns; i++) {
        const x = lx0 + r() * size, z = lz0 + r() * size;
        if (clearSpot(x, z, ponds)) sd.push([x, z]);
      }
      if (sd.length) {
        const im = new THREE.InstancedMesh(sparkGeo(), mats().spark, sd.length);
        im.name = 'moon-stardust';
        sd.forEach(([x, z], i) => {
          p.set(O.x + x, O.y + moonHeight(x, z) + 0.8, O.z + z);
          const mm = m4.compose(p, q.identity(), s.setScalar(1)).clone();
          const id = `stardust:${cx},${cz}:${i}`;
          const pk: Pickup = { id, kind: 'stardust', pos: p.clone(), mesh: im, index: i, matrix: mm, taken: d.takenToday(id) };
          im.setMatrixAt(i, pk.taken ? new THREE.Matrix4().makeScale(0, 0, 0) : mm);
          pickups.set(id, pk); ids.push(id);
        });
        im.castShadow = true;
        sparkMeshes.add(im);
        grp.add(im);
      }
      grp.userData.pickIds = ids;
      return grp.children.length ? grp : null;
    },
    dispose: (o) => {
      for (const id of (o.userData.pickIds as string[] | undefined) ?? []) pickups.delete(id);
      o.traverse((x) => { if ((x as THREE.InstancedMesh).isInstancedMesh) sparkMeshes.delete(x as THREE.InstancedMesh); });
    },
  });

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    pickups,
    take(pk) {
      pk.taken = true;
      pk.mesh.setMatrixAt(pk.index, zero);
      pk.mesh.instanceMatrix.needsUpdate = true;
    },
    refresh() {
      for (const pk of pickups.values()) {
        const t = d.takenToday(pk.id);
        if (t === pk.taken) continue;
        pk.taken = t;
        pk.mesh.setMatrixAt(pk.index, t ? zero : pk.matrix);
        pk.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    update(t) {
      for (const pk of pickups.values()) {
        if (pk.kind !== 'stardust' || pk.taken) continue;
        p.set(pk.pos.x, pk.pos.y + Math.sin(t * 2 + pk.index) * 0.15, pk.pos.z);
        q.setFromEuler(new THREE.Euler(0, t * 1.8 + pk.index, 0.2));
        pk.mesh.setMatrixAt(pk.index, m4.compose(p, q, s.setScalar(0.85 + 0.15 * Math.sin(t * 5 + pk.index))));
      }
      for (const im of sparkMeshes) im.instanceMatrix.needsUpdate = true;
    },
  };
}
