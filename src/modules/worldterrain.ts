// 세계 지형(마을 밖 전부) — 청크 스트리밍 2단계 LOD + 끝없는 바다 + 섬 안 호수·강.
// 가까이: 64 m 청크·1 m 격자. 멀리: 512 m 청크·16 m 격자(가까운 영역은 픽셀 단위로 잘라 겹치지 않게).
// 색은 정점이 아니라 프래그먼트에서(worldterrain/terrainMat.ts) — 마을 지형과 같은 문법으로 경계가 매끈하다.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { worldTerrainMaterial, themeIndex } from './worldterrain/terrainMat';
import { buildSea } from './worldterrain/sea';
import { buildInlandWater } from './worldterrain/inland';
import { sharedUniforms } from './terrain/field';

export const order = 2;

const NEAR = { size: 64, res: 1, radius: 300 };
const MID = { size: 256, res: 4, radius: 800 };
const FAR = { size: 512, res: 16, radius: 4200 };
/** 중간 LOD 가 빈틈없이 덮는 반경(먼 LOD 를 여기 안에서 버린다) — 메사 벽·절벽이 16 m 격자 톱니로 보이지 않게 */
const MID_COVER = MID.radius - MID.size * 0.75;
/** 가까운 청크가 빈틈없이 덮는 반경(먼 LOD 를 여기 안에서 버린다) */
const NEAR_COVER = NEAR.radius - NEAR.size * 0.75;
/** 마을 바다(water.ts)가 그리는 사각형 여백 — 세계 바다는 그 안을 버린다 */
export const VILLAGE_SEA_PAD = 14;

export default function build(ctx: Ctx) {
  const { island, game } = ctx;
  // 룩 테스트(game=0)는 마을 섬 단독 구도(마을 지형·바다가 바깥까지 그린다)
  if (!game) return;
  const B = island.ISLAND_BOUNDS;
  const U = {
    uNearC: { value: new THREE.Vector2() },
    uNearR: { value: NEAR_COVER },
    uVillage: { value: new THREE.Vector4(B.minX, B.minZ, B.maxX, B.maxZ) },
  };
  const mat = worldTerrainMaterial(island, false, U);
  const midMat = worldTerrainMaterial(island, true, U, 'mid');
  const U2 = { uNearC: U.uNearC, uNearR: { value: MID_COVER }, uVillage: U.uVillage };
  const farMat = worldTerrainMaterial(island, true, U2, 'far');
  // 마을 영향(villageW)이 닿는 범위 — 여기만 island.heightAt 로(마을과 높이를 맞춘다)
  const VB = { minX: B.minX - 31, maxX: B.maxX + 31, minZ: B.minZ - 31, maxZ: B.maxZ + 31 };
  const inVB = (x: number, z: number) => x > VB.minX && x < VB.maxX && z > VB.minZ && z < VB.maxZ;

  const makeChunk = (x0: number, z0: number, size: number, res: number, far: boolean, lod = far ? 2 : 0) => {
    // 마을 사각형 안에 다 들어가면 버린다
    if (x0 >= B.minX && x0 + size <= B.maxX && z0 >= B.minZ && z0 + size <= B.maxZ) return null;
    const n = Math.round(size / res);
    // 테두리 한 칸 더 샘플해 법선을 이음매 없이
    const W = n + 3;
    const hs = new Float32Array(W * W);
    const ts = new Float32Array(W * W);
    let anyLand = false;
    const V = (n + 1) * (n + 1);
    const aA = new Float32Array(V * 4), aB = new Float32Array(V * 4);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = x0 + (i - 1) * res, z = z0 + (j - 1) * res;
      const ws = island.worldSample(x, z);
      const h = inVB(x, z) ? island.heightAt(x, z) : ws.h;
      hs[j * W + i] = h;
      ts[j * W + i] = ws.terr ?? 0;
      if (h > -2.5) anyLand = true;
      if (i >= 1 && j >= 1 && i <= n + 1 && j <= n + 1) {
        const k = ((j - 1) * (n + 1) + (i - 1)) * 4;
        const wref = ws.coast < 0 ? 0 : (ws.water !== undefined && ws.water > -1e6 ? ws.water : (ws.waterRef ?? 0));
        aA[k] = Math.max(-60, Math.min(80, ws.coast));
        aA[k + 1] = inVB(x, z) ? 0 : wref;
        aA[k + 2] = themeIndex(ws.island?.theme);
        aA[k + 3] = ws.terr ?? 0;
        aB[k] = ws.wallAmp ?? 0;
        aB[k + 1] = ws.rock ?? 0;
        aB[k + 2] = ws.special ?? 0;
      }
    }
    // 먼 바다(전부 깊음)는 바닥을 안 그린다 — 바다 면이 덮는다
    if (!anyLand && far) return null;
    const pos = new Float32Array(V * 3);
    const nor = new Float32Array(V * 3);
    let k = 0;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const c = (j + 1) * W + (i + 1);
      pos[k] = x0 + i * res; pos[k + 1] = hs[c]; pos[k + 2] = z0 + j * res;
      const nx = hs[c - 1] - hs[c + 1], nz = hs[c - W] - hs[c + W], ny = 2 * res;
      const l = Math.hypot(nx, ny, nz);
      nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
      // 계단 좌표의 기울기(벽이 실제로 가파른가 — 완만한 띠는 흙벽으로 칠하지 않는다)
      const q = (j * (n + 1) + i) * 4 + 3;
      aB[q] = Math.hypot(ts[c + 1] - ts[c - 1], ts[c + W] - ts[c - W]) / (2 * res);
      k += 3;
    }
    const idx = new Uint32Array(n * n * 6);
    let t = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      // 높이 차가 작은 대각선으로 나눠 경사면 톱니를 줄인다
      const d1 = Math.abs(pos[a * 3 + 1] - pos[d * 3 + 1]), d2 = Math.abs(pos[b * 3 + 1] - pos[c * 3 + 1]);
      if (d1 <= d2) { idx[t++] = a; idx[t++] = c; idx[t++] = d; idx[t++] = a; idx[t++] = d; idx[t++] = b; }
      else { idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aA', new THREE.BufferAttribute(aA, 4));
    g.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, lod === 2 ? farMat : lod === 1 ? midMat : mat);
    mesh.receiveShadow = !far;
    mesh.castShadow = false; // 그림자 맵엔 안 넣는다(삼각형 예산) — 큰 지형 음영은 법선 조명이 낸다
    if (far) mesh.position.y = lod === 2 ? -0.3 : -0.12;
    mesh.userData.world = 'earth';
    return mesh;
  };

  const root = new THREE.Group();
  root.name = 'worldterrain';
  root.userData.world = 'earth';
  if (game) {
    game.chunks.add({ key: 'terrain-near', size: NEAR.size, radius: NEAR.radius, build: (c) => makeChunk(c.x0, c.z0, c.size, NEAR.res, false) });
    game.chunks.add({ key: 'terrain-mid', size: MID.size, radius: MID.radius, build: (c) => makeChunk(c.x0, c.z0, c.size, MID.res, true, 1) });
    game.chunks.add({ key: 'terrain-far', size: FAR.size, radius: FAR.radius, build: (c) => makeChunk(c.x0, c.z0, c.size, FAR.res, true) });
  } else {
    // 룩 테스트(마을 고정 카메라): 원점 둘레만 한 번 만든다
    for (const [L, far] of [[NEAR, false], [FAR, true]] as const) {
      const r = L.radius, s = L.size;
      for (let cx = Math.floor(-r / s); cx <= Math.floor(r / s); cx++) for (let cz = Math.floor(-r / s); cz <= Math.floor(r / s); cz++) {
        if (Math.hypot((cx + 0.5) * s, (cz + 0.5) * s) > r) continue;
        const m = makeChunk(cx * s, cz * s, s, L.res, far);
        if (m) root.add(m);
      }
    }
  }
  // 끝없는 바다: 플레이어를 따라다니는 큰 판(마을 바다 사각형은 비운다)
  const P = VILLAGE_SEA_PAD;
  const sea = buildSea(island, new THREE.Vector4(B.minX - P, B.minZ - P, B.maxX + P, B.maxZ + P));
  sea.position.y = -0.01;
  root.add(sea);
  // 섬 안 호수·강
  const inland = buildInlandWater(island);
  root.add(inland);

  const origin = new THREE.Vector3();
  ctx.onUpdate((time) => {
    sharedUniforms.uTime.value = time;
    const p = game ? game.player.pos : origin;
    if (game) U.uNearC.value.set(game.chunks.focus.x, game.chunks.focus.z);
    sea.position.x = Math.round(p.x / 32) * 32;
    sea.position.z = Math.round(p.z / 32) * 32;
    const f = ctx.scene.fog as THREE.Fog | null;
    const sf = (sea.material as THREE.Material).userData.fog as { color: { value: THREE.Color }; range: { value: THREE.Vector2 } };
    if (f && (f as THREE.Fog).isFog) { sf.color.value.copy(f.color); sf.range.value.set(f.near, f.far); }
    else sf.range.value.set(1e6, 2e6);
    // 먼 호수·강은 숨긴다
    for (const m of inland.children) {
      const s = (m as THREE.Mesh).geometry.boundingSphere!;
      m.visible = Math.hypot(s.center.x - p.x, s.center.z - p.z) < 2600 + s.radius;
    }
  });
  return root;
}
