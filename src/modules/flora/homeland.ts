// 말랑섬 랜드마크 나무 — 큰 폭포 옆 소원나무(느티나무 25 m)와 하트 연못 언덕의 할미벚(40 m, 꽃잎이 계속 흩날린다).
// 자리는 지형 특징(world.ts worldFeatures)에서 결정적으로 고르고, geo.addLandmark 로 랜드마크·구역(sakura)을 알린다.
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import type { Game } from '../../core/game';
import type { Landmark } from '../../core/api';
import { applyCurve } from '../../core/curve';
import { rngFor } from '../../core/rng';
import { petalFlake } from './wshapes2';
import { floraTime } from './mat';
import { inCircles, inVillage, type Circle } from './logic';

export interface HomeTree { kind: 'halmi' | 'wishtree'; x: number; y: number; z: number; s: number; rot: number }

/** 할미벚 40 m · 소원나무 25 m(모양 높이 ≈ 4 m 기준 배율) */
export const HOME_TREE_SCALE = { halmi: 10, wishtree: 6.25 } as const;

type I = typeof import('../../core/island');

/** center 둘레 [r0, r1] 고리에서 가장 평평한 마른 땅 */
function ringSpot(I: I, c: { x: number; z: number }, r0: number, r1: number, blocked: (x: number, z: number) => boolean, prefer = 0) {
  let best: { x: number; z: number; score: number } | null = null;
  for (let ri = 0; ri <= 6; ri++) {
    const r = r0 + ((r1 - r0) * ri) / 6;
    for (let k = 0; k < 32; k++) {
      const a = prefer + (k / 32) * Math.PI * 2;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (blocked(x, z) || inVillage(I, x, z, 20)) continue;
      const s = I.worldSample(x, z);
      if (!s.island || s.island.id !== 'home' || s.coast < 20) continue;
      if (s.kind === 'cliff' || s.kind === 'river' || s.kind === 'sea') continue;
      let lo = s.h, hi = s.h, wet = false;
      for (let q = 0; q < 8; q++) {
        const b = (q / 8) * Math.PI * 2;
        const w = I.worldSample(x + Math.cos(b) * 4, z + Math.sin(b) * 4);
        if ((w.water ?? -Infinity) > w.h - 0.3 || w.kind === 'river') wet = true;
        lo = Math.min(lo, w.h); hi = Math.max(hi, w.h);
      }
      if (wet || (s.water ?? -Infinity) > s.h - 0.3) continue;
      // 평평할수록, 고른 방향에 가까울수록
      const da = Math.abs(Math.atan2(Math.sin(a - prefer), Math.cos(a - prefer)));
      const score = (hi - lo) + da * 0.15 + ri * 0.05;
      if (!best || score < best.score) best = { x, z, score };
    }
    if (best && best.score < 0.8) break;
  }
  return best;
}

/** 두 나무 자리(결정적). 못 찾으면 그 나무는 빠진다 */
export function homeTreeSpots(I: I, keepOut: readonly Circle[], avoid: readonly Circle[] = []): HomeTree[] {
  const F = I.worldFeatures();
  const out: HomeTree[] = [];
  const blocked = (x: number, z: number) => inCircles(keepOut, x, z) || inCircles(avoid, x, z) || out.some((t) => Math.hypot(t.x - x, t.z - z) < 60);
  const home = I.islandById('home')!;
  const pond = F.find((f) => f.kind === 'heartpond' && f.island === 'home');
  {
    const c = pond ?? { x: home.x + home.r * 0.35, z: home.z - home.r * 0.3, r: 20 };
    // 섬 가운데 쪽(언덕 위)을 먼저 본다
    const prefer = Math.atan2(home.z - c.z, home.x - c.x);
    const p = ringSpot(I, c, c.r + 16, c.r + 46, blocked, prefer);
    if (p) out.push({ kind: 'halmi', x: p.x, z: p.z, y: I.heightAt(p.x, p.z), s: HOME_TREE_SCALE.halmi, rot: 0.6 });
  }
  const fall = F.find((f) => f.kind === 'waterfall' && f.island === 'home');
  {
    const c = fall ?? { x: home.x - home.r * 0.3, z: home.z, r: 14 };
    const p = ringSpot(I, c, 20, 48, blocked, Math.atan2(c.z - home.z, c.x - home.x) + Math.PI * 0.5);
    if (p) out.push({ kind: 'wishtree', x: p.x, z: p.z, y: I.heightAt(p.x, p.z), s: HOME_TREE_SCALE.wishtree, rot: 2.1 });
  }
  return out;
}

export const homeLandmarks = (trees: readonly HomeTree[]): Landmark[] => trees.map((t) => t.kind === 'halmi'
  ? { id: 'lm:home:halmi', kind: 'halmi', name: '할미벚', island: 'home', x: Math.round(t.x * 100) / 100, z: Math.round(t.z * 100) / 100, r: 22 }
  : { id: 'lm:home:wishtree', kind: 'wishtree', name: '소원나무', island: 'home', x: Math.round(t.x * 100) / 100, z: Math.round(t.z * 100) / 100, r: 16 });

/** 할미벚 꽃잎 비: 수관 둘레에서 떨어져 바람에 흘러가는 꽃잎(셰이더가 움직인다 — 매 프레임 JS 일 없음) */
export function halmiPetals(ctx: Ctx, game: Game, t: HomeTree): THREE.InstancedMesh {
  const N = 260;
  const geo = petalFlake();
  geo.userData.shared = true;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  const seed = new Float32Array(N);
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const r = rngFor('flora-halmi-petals');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const R = 2.0 * t.s, top = t.y + 3.4 * t.s, bot = t.y + 1.8 * t.s;
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
    p.set(t.x + Math.cos(a) * d, bot + r() * (top - bot), t.z + Math.sin(a) * d);
    q.setFromAxisAngle(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), r() * 6.28);
    sc.setScalar(1.5 + r() * 0.9);
    mesh.setMatrixAt(i, m4.compose(p, q, sc));
    seed[i] = r();
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  const uGround = { value: t.y };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = floraTime;
    sh.uniforms.uGround = uGround;
    sh.vertexShader = 'attribute float aSeed;\nuniform float uTime, uGround;\n' + sh.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
#include <begin_vertex>
{
  // 떨어지는 정도 0..1(꽃잎마다 다른 박자, 약 24초에 한 바퀴)
  float ph = fract( uTime * 0.042 * ( 0.8 + 0.4 * aSeed ) + aSeed * 7.31 );
  float sp = uTime * ( 1.4 + aSeed * 2.2 ) + aSeed * 40.0;
  float c = cos( sp ), s = sin( sp );
  transformed = vec3( transformed.x * c - transformed.y * s, transformed.x * s + transformed.y * c, transformed.z );
  float h = 0.0;
  #ifdef USE_INSTANCING
    h = instanceMatrix[3].y - uGround;
  #endif
  // 땅에 닿기 조금 전에 작아져 사라진다
  transformed *= 1.0 - smoothstep( 0.86, 1.0, ph );
  transformed.y -= ph * ( h - 0.2 );
  transformed.x += sin( uTime * 0.6 + aSeed * 31.0 ) * 1.4 + ph * 6.0;
  transformed.z += cos( uTime * 0.45 + aSeed * 17.0 ) * 1.4 + ph * 2.0;
}
`);
  };
  mat.customProgramCacheKey = () => 'flora:halmi-petals';
  mesh.name = 'flora-halmi-petals';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  applyCurve(mesh);
  game.root.add(mesh);
  // 가까울 때만 그린다(먼 섬에선 draw call 0)
  const near2 = 260 * 260;
  ctx.onUpdate(() => {
    const pp = game.player.pos;
    mesh.visible = game.world === 'earth' && (pp.x - t.x) ** 2 + (pp.z - t.z) ** 2 < near2;
  });
  return mesh;
}
