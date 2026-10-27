// 행성 땅 청크: 활성 행성(이 모듈 것)만 240 m 칸 · 3 m 격자로 짓고, 칸마다 같은 정점으로 trimesh 바닥 충돌을 깐다.
// 법선은 높이 함수에서 바로(청크 이음매 없음). 색은 행성마다: 슈가링 분홍·흰 사탕 줄 고리 / 젤리별 말랑 분홍·보라 + 젤리 바다 /
// 서리볼 흰 눈·하늘 얼음판 / 솜사탕 성운 분홍·하늘 구름 / 자갈띠 라벤더 별먼지 / 별다방 크림 갑판 + 둥근 타일 / 까만 도넛 초코 반죽.
import * as THREE from 'three';
import type { Game } from '../../core/game';
import type { PhysBody } from '../../core/physics';
import {
  HEIGHTS, PLANET_BY_ID, SUGAR_RING, JELLY_SEA, JELLY_SEA_Y, rinkAt, CLOUD_ISLES, CLOUD_SEA_Y, STATION, DONUT, BASE, type PlanetId,
} from './logic';

const shared = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => { x.userData.shared = true; return x; };
const smooth = THREE.MathUtils.smoothstep;
const C = (h: string) => new THREE.Color(h);

/** 땅 칸 크기 · 격자 · 그리는 반경(작은 행성이라 한 번에 다 보인다) */
export const GROUND_CHUNK = 240;
export const GROUND_RES = 3;
export const GROUND_RADIUS = 420;

// ── 행성마다 땅 색
const P = {
  sugar: { a: C('#ffd0e4'), b: C('#ffe9f2'), hill: C('#ffc2dc'), ring1: C('#ff8fbf'), ring2: C('#fffaf2'), far: C('#e9a8cc'), mint: C('#c8f5e6') },
  jelly: { a: C('#ffb7da'), b: C('#e8b8ff'), dome: C('#ff9fd0'), sea: C('#ff6fb5'), rim: C('#fff0f8'), far: C('#c58fd8') },
  frost: { a: C('#f4fbff'), b: C('#e3f1ff'), mound: C('#ffffff'), rink: C('#9fd6ff'), lav: C('#e2d8ff'), far: C('#b9cdea') },
  cloud: { sea: C('#ffe4f4'), sea2: C('#dff0ff'), isle: C('#fff6fb'), isle2: C('#ffd6ee'), top: C('#fffaf2'), far: C('#e3c8f0') },
  belt: { a: C('#cbbfe8'), b: C('#e2d8f6'), dust: C('#b9add8'), pink: C('#ecc8e0'), far: C('#9e94c0') },
  station: { deck: C('#fff1cf'), tile: C('#ffe3a8'), line: C('#c9b6f2'), cafe: C('#ffd0de'), far: C('#9e94c0') },
  blackhole: { dough: C('#e0ae84'), choco: C('#9a6a8c'), glaze: C('#b88aa8'), hole: C('#3d3a4a'), edge: C('#a77be0'), far: C('#4b3a5a') },
} as const;

const tmp = new THREE.Color();
/** 국소 (x, z) 땅 색 */
export function groundColor(id: PlanetId, x: number, z: number, out: THREE.Color): THREE.Color {
  const R = Math.hypot(x, z), rad = PLANET_BY_ID.get(id)!.radius;
  const n = 0.5 + 0.5 * Math.sin(x * 0.07 + Math.cos(z * 0.05) * 2) * Math.cos(z * 0.06 - 0.4);
  switch (id) {
    case 'sugar': {
      const c = P.sugar;
      out.copy(c.a).lerp(c.b, n * 0.7);
      const hh = HEIGHTS.sugar(x, z) - BASE;
      out.lerp(c.hill, smooth(hh, 1.5, 6) * 0.7);
      if (n > 0.8) out.lerp(c.mint, (n - 0.8) * 2);
      // 고리: 비스듬한 사탕 줄무늬
      const u = Math.abs(R - SUGAR_RING.r) / SUGAR_RING.half;
      if (u < 1.15) {
        const a = Math.atan2(z, x);
        const stripe = Math.sin(a * 60 + (R - SUGAR_RING.r) * 0.45) > 0 ? c.ring1 : c.ring2;
        out.lerp(stripe, (1 - smooth(u, 0.85, 1.15)) * 0.95);
      }
      return out.lerp(c.far, smooth(R, rad * 0.86, rad));
    }
    case 'jelly': {
      const c = P.jelly;
      out.copy(c.a).lerp(c.b, n);
      out.lerp(c.dome, smooth(HEIGHTS.jelly(x, z) - BASE, 2, 8) * 0.6);
      const ds = Math.hypot(x - JELLY_SEA.x, z - JELLY_SEA.z) / JELLY_SEA.r;
      out.lerp(c.rim, Math.exp(-((ds - 1.05) ** 2) / 0.006) * 0.8);
      out.lerp(c.sea, 1 - smooth(ds, 0.85, 1.0));
      return out.lerp(c.far, smooth(R, rad * 0.86, rad));
    }
    case 'frost': {
      const c = P.frost;
      out.copy(c.a).lerp(c.b, n * 0.8);
      out.lerp(c.mound, smooth(HEIGHTS.frost(x, z) - BASE, 2, 7));
      if (n < 0.2) out.lerp(c.lav, (0.2 - n) * 3);
      out.lerp(c.rink, rinkAt(x, z) * 0.85);
      return out.lerp(c.far, smooth(R, rad * 0.86, rad));
    }
    case 'cloud': {
      const c = P.cloud;
      out.copy(c.sea).lerp(c.sea2, n);
      const h = HEIGHTS.cloud(x, z);
      const up = smooth(h - CLOUD_SEA_Y, 0.6, 3);
      if (up > 0) {
        tmp.copy(c.isle).lerp(c.isle2, 0.5 + 0.5 * Math.sin(x * 0.2 + z * 0.15));
        let top = 0;
        for (const ci of CLOUD_ISLES) top = Math.max(top, 1 - smooth(Math.hypot(x - ci.x, z - ci.z) / ci.r, 0.4, 0.9));
        tmp.lerp(c.top, top * 0.6);
        out.lerp(tmp, up);
      }
      return out.lerp(c.far, smooth(R, rad * 0.86, rad));
    }
    case 'belt': {
      const c = P.belt;
      out.copy(c.a).lerp(c.b, n * 0.6);
      const sp = Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.0) * Math.sin(z * 0.19 - Math.cos(x * 0.13) * 1.7);
      if (sp > 0.45) out.lerp(c.pink, (sp - 0.45) * 1.2); else if (sp < -0.4) out.lerp(c.dust, (-sp - 0.4) * 1.2);
      return out.lerp(c.far, smooth(R, rad * 0.86, rad));
    }
    case 'station': {
      const c = P.station;
      // 부드러운 동심원 띠 + 옅은 방사선(격자 3 m 에서도 계단지지 않게 완만하게)
      const a = Math.atan2(z, x);
      out.copy(c.deck).lerp(c.tile, 0.5 + 0.5 * Math.sin(R * 0.45));
      const spoke = Math.pow(Math.max(0, Math.cos(a * 8)), 24) * smooth(R, STATION.cafe.r + 4, STATION.cafe.r + 10);
      out.lerp(c.line, spoke * 0.5);
      out.lerp(c.cafe, 1 - smooth(R, STATION.cafe.r - 1, STATION.cafe.r + 1));
      return out.lerp(c.far, smooth(R, STATION.deck, STATION.deck + 4));
    }
    case 'blackhole': {
      const c = P.blackhole;
      const u = (R - DONUT.rMid) / DONUT.half;
      out.copy(c.dough);
      // 위쪽은 반질반질 초코 글레이즈(물결 테두리)
      const glazeEdge = 0.62 + 0.08 * Math.sin(Math.atan2(z, x) * 7);
      if (Math.abs(u) < glazeEdge) out.copy(c.choco).lerp(c.glaze, n * 0.5);
      out.lerp(c.hole, 1 - smooth(R, DONUT.hole, DONUT.rIn + 4));
      out.lerp(c.edge, Math.exp(-((R - DONUT.rIn) ** 2) / 10) * 0.5);
      return out.lerp(c.far, smooth(R, rad * 0.86, rad));
    }
  }
}

// ── 행성마다 땅 재질(젤리·얼음은 반질반질)
const groundMats = new Map<PlanetId, THREE.MeshStandardMaterial>();
export function groundMaterial(id: PlanetId) {
  let m = groundMats.get(id);
  if (m) return m;
  if (id === 'jelly' || id === 'frost') {
    m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: id === 'jelly' ? 0.45 : 0.4, clearcoat: 0.45, clearcoatRoughness: 0.45, metalness: 0, emissive: id === 'jelly' ? '#5a1a40' : '#203050', emissiveIntensity: 0.08 });
  } else {
    m = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: id === 'station' ? 0.5 : id === 'blackhole' ? 0.4 : 0.85, metalness: 0,
      emissive: id === 'blackhole' ? '#2a1a3a' : id === 'cloud' ? '#ffe8f6' : '#3a2c58', emissiveIntensity: id === 'cloud' ? 0.12 : 0.05,
    });
  }
  groundMats.set(id, shared(m));
  return m;
}

/** 국소 사각 칸이 행성 원판과 겹치나 */
export function touches(id: PlanetId, lx0: number, lz0: number, size: number, pad = 30) {
  const cx = Math.max(lx0, Math.min(0, lx0 + size)), cz = Math.max(lz0, Math.min(0, lz0 + size));
  return Math.hypot(cx, cz) < PLANET_BY_ID.get(id)!.radius + pad;
}

/** 높이 격자 지오메트리(월드 정점, 국소 높이 함수) */
export function gridGeometry(id: PlanetId, o: { x: number; y: number; z: number }, lx0: number, lz0: number, size: number, res: number) {
  const h = HEIGHTS[id];
  const n = Math.round(size / res);
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, nr = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const e = Math.max(0.5, res * 0.5), nv = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const lx = lx0 + size / 2 + p.getX(i), lz = lz0 + size / 2 + p.getZ(i);
    p.setXYZ(i, o.x + lx, o.y + h(lx, lz), o.z + lz);
    nv.set(h(lx - e, lz) - h(lx + e, lz), 2 * e, h(lx, lz - e) - h(lx, lz + e)).normalize();
    nr.setXYZ(i, nv.x, nv.y, nv.z);
    groundColor(id, lx, lz, tmp);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** 땅 청크 레이어 등록. current() = 지금 활성인 이 모듈 행성(없으면 null) */
export function addGroundLayer(game: Game, current: () => { id: PlanetId; origin: THREE.Vector3 } | null) {
  const bodies = new Map<string, PhysBody>();
  game.chunks.add({
    key: 'planets-ground', size: GROUND_CHUNK, radius: GROUND_RADIUS, world: 'space',
    build: ({ x0, z0, size, cx, cz }) => {
      const cur = current();
      if (!cur) return null;
      const O = cur.origin;
      const lx0 = x0 - O.x, lz0 = z0 - O.z;
      if (!touches(cur.id, lx0, lz0, size)) return null;
      const geo = gridGeometry(cur.id, O, lx0, lz0, size, GROUND_RES);
      const mesh = new THREE.Mesh(geo, groundMaterial(cur.id));
      mesh.receiveShadow = true;
      mesh.name = `planet-ground-${cur.id}`;
      const pos = geo.attributes.position.array as Float32Array;
      const ix = geo.index!;
      const is = new Uint32Array(ix.count);
      for (let i = 0; i < ix.count; i++) is[i] = ix.getX(i);
      const key = `${cur.id}:${cx},${cz}`;
      bodies.get(key)?.remove();
      bodies.set(key, game.physics.add({ shape: { kind: 'mesh', vertices: new Float32Array(pos), indices: is }, type: 'fixed', position: { x: 0, y: 0, z: 0 }, tag: 'ground' }));
      mesh.userData.planetKey = key;
      return mesh;
    },
    dispose: (o) => {
      const k = o.userData.planetKey as string;
      bodies.get(k)?.remove();
      bodies.delete(k);
      (o as THREE.Mesh).geometry.dispose();
    },
  });
  return { bodies };
}

/** 젤리 바다 표면 높이(월드) — 데칼·찌 자리 */
export const jellySeaWorldY = (O: THREE.Vector3) => O.y + JELLY_SEA_Y;
