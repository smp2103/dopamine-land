// 세계 지형(마을 밖 전부) — 청크 스트리밍 2단계 LOD + 끝없는 바다. world 담당이 다듬는다.
// 가까이: 64 m 청크·1 m 격자. 멀리: 512 m 청크·16 m 격자(가까운 영역은 픽셀 단위로 잘라 겹치지 않게).
import * as THREE from 'three';
import type { Ctx } from '../core/types';

export const order = 2;

const NEAR = { size: 64, res: 1, radius: 300 };
const FAR = { size: 512, res: 16, radius: 4200 };
/** 가까운 청크가 빈틈없이 덮는 반경(먼 LOD 를 여기 안에서 버린다) */
const NEAR_COVER = NEAR.radius - NEAR.size * 0.75;

const KIND_COLOR: Record<string, string> = {
  grass: '#86d16f', sand: '#f4e2b0', cliff: '#b08d6c', rock: '#a59a8f', snow: '#f4f8ff',
  jungle: '#5fbf5a', desert: '#f2cf8f', lava: '#c8553d', sea: '#d9c48f', river: '#b98b62',
};

export default function build(ctx: Ctx) {
  const { island, game } = ctx;
  if (!game) return;
  const B = island.ISLAND_BOUNDS;
  const nearC = { value: new THREE.Vector2() };
  const nearR = { value: NEAR_COVER };
  const village = { value: new THREE.Vector4(B.minX, B.minZ, B.maxX, B.maxZ) };

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  // 마을 범위는 마을 지형 모듈이 그린다 → 여기선 버린다. 먼 LOD 는 가까운 범위도 버린다.
  const clip = (m: THREE.MeshStandardMaterial, far: boolean) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNearC = nearC; sh.uniforms.uNearR = nearR; sh.uniforms.uVillage = village;
      sh.vertexShader = 'varying vec2 vDlXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDlXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
      sh.fragmentShader = 'varying vec2 vDlXZ;\nuniform vec2 uNearC;\nuniform float uNearR;\nuniform vec4 uVillage;\n' + sh.fragmentShader.replace('void main() {', `void main() {
        if ( vDlXZ.x > uVillage.x && vDlXZ.x < uVillage.z && vDlXZ.y > uVillage.y && vDlXZ.y < uVillage.w ) discard;
        ${far ? 'if ( distance( vDlXZ, uNearC ) < uNearR ) discard;' : ''}`);
    };
    m.customProgramCacheKey = () => (far ? 'wt-far' : 'wt-near');
  };
  clip(mat, false);
  clip(farMat, true);

  const col = new THREE.Color(), tmp = new THREE.Color();
  const makeChunk = (x0: number, z0: number, size: number, res: number, far: boolean) => {
    const n = Math.round(size / res);
    // 테두리 한 칸 더 샘플해 법선을 이음매 없이
    const W = n + 3;
    const hs = new Float32Array(W * W);
    let anyLand = false, allVillage = true;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = x0 + (i - 1) * res, z = z0 + (j - 1) * res;
      const h = island.heightAt(x, z);
      hs[j * W + i] = h;
      if (h > -1.5) anyLand = true;
    }
    for (const [x, z] of [[x0, z0], [x0 + size, z0], [x0, z0 + size], [x0 + size, z0 + size]]) {
      if (!(x > B.minX && x < B.maxX && z > B.minZ && z < B.maxZ)) allVillage = false;
    }
    if (allVillage) return null;
    // 먼 바다(전부 깊음)는 바닥을 안 그린다 — 바다 면이 덮는다
    if (!anyLand && far) return null;
    const pos = new Float32Array((n + 1) * (n + 1) * 3);
    const nor = new Float32Array((n + 1) * (n + 1) * 3);
    const cols = new Float32Array((n + 1) * (n + 1) * 3);
    let k = 0;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = x0 + i * res, z = z0 + j * res;
      const c = (j + 1) * W + (i + 1);
      const h = hs[c];
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      const nx = hs[c - 1] - hs[c + 1], nz = hs[c - W] - hs[c + W], ny = 2 * res;
      const l = Math.hypot(nx, ny, nz);
      nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
      const s = island.surfaceAt(x, z);
      col.set(KIND_COLOR[s.kind] ?? KIND_COLOR.grass);
      // 경사가 급하면 바위색, 높을수록 살짝 밝게, 큰 얼룩
      const slope = 1 - ny / l;
      if (slope > 0.45 && s.kind !== 'snow') col.lerp(tmp.set(KIND_COLOR.cliff), Math.min(1, (slope - 0.45) * 3));
      const blot = Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) * Math.sin(z * 0.05 + Math.sin(x * 0.02)) * 0.06;
      col.offsetHSL(0, 0, blot + Math.min(0.06, Math.max(0, h) * 0.0008));
      cols[k] = col.r; cols[k + 1] = col.g; cols[k + 2] = col.b;
      k += 3;
    }
    const idx: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, far ? farMat : mat);
    mesh.receiveShadow = !far;
    mesh.castShadow = !far;
    if (far) mesh.position.y = -0.15;
    mesh.userData.world = 'earth';
    return mesh;
  };

  game.chunks.add({ key: 'terrain-near', size: NEAR.size, radius: NEAR.radius, build: (c) => makeChunk(c.x0, c.z0, c.size, NEAR.res, false) });
  game.chunks.add({ key: 'terrain-far', size: FAR.size, radius: FAR.radius, build: (c) => makeChunk(c.x0, c.z0, c.size, FAR.res, true) });

  // 끝없는 바다: 플레이어를 따라다니는 큰 판(마을 바다보다 살짝 아래)
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#3fb0d8', roughness: 0.25, metalness: 0, transparent: true, opacity: 0.82 }),
  );
  sea.position.y = -0.03;
  sea.renderOrder = 1;
  sea.receiveShadow = true;
  sea.userData.world = 'earth';
  sea.frustumCulled = false;
  const root = new THREE.Group();
  root.name = 'worldterrain';
  root.userData.world = 'earth';
  root.add(sea);
  ctx.onUpdate(() => {
    const p = game.player.pos;
    nearC.value.set(game.chunks.focus.x, game.chunks.focus.z);
    sea.position.x = Math.round(p.x / 50) * 50;
    sea.position.z = Math.round(p.z / 50) * 50;
  });
  return root;
}
