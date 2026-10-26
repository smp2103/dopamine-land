// 보물상자 — 섬마다 흩어진 통통한 상자(청크 InstancedMesh) + 열 때 등급색 빛기둥·반짝이·코인 분수.
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import type { Game } from '../../core/game';
import { rbox, grad } from '../props/kit';
import { TIERS, type ChestTier } from './data';

export interface LiveChest { key: string; x: number; y: number; z: number; rotY: number; opened: boolean; hide: () => void }

const S = 1.6; // 상자 크기 배율(멀리서도 보이게)
let shared: { parts: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material; shadow: boolean }> } | null = null;

function sharedParts() {
  if (shared) return shared;
  const W = 0.84 * S, H = 0.42 * S, D = 0.56 * S;
  const wood = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, sheen: 0.4, sheenColor: new THREE.Color('#ffe2c0'), sheenRoughness: 0.6 });
  const gold = new THREE.MeshPhysicalMaterial({ color: '#ffcf4a', metalness: 0.65, roughness: 0.28, clearcoat: 0.6, emissive: '#5a3a00', emissiveIntensity: 0.25 });
  const body = rbox(W, H, D, 0.07 * S, 5);
  body.translate(0, H / 2, 0);
  grad(body, '#a8693d', '#d99a63', 0.8);
  // 뚜껑: 둥근 반원통(통통)
  const lid = new THREE.CylinderGeometry(D / 2, D / 2, W * 0.985, 32, 1, false, 0, Math.PI);
  lid.rotateZ(Math.PI / 2);
  lid.scale(1, 0.72, 1);
  lid.translate(0, H, 0);
  grad(lid, '#c27a46', '#f0b47a', 0.7);
  const bandGeo = (x: number) => {
    const b = rbox(0.11 * S, H + 0.02, D + 0.03, 0.03, 3); b.translate(x, H / 2, 0);
    const a = new THREE.CylinderGeometry(D / 2 + 0.02, D / 2 + 0.02, 0.11 * S, 28, 1, true, 0, Math.PI);
    a.rotateZ(Math.PI / 2); a.scale(1, 0.74, 1); a.translate(x, H, 0);
    return [b, a];
  };
  const [b1, a1] = bandGeo(-W / 2 + 0.16 * S);
  const [b2, a2] = bandGeo(W / 2 - 0.16 * S);
  const lock = rbox(0.17 * S, 0.2 * S, 0.07 * S, 0.035 * S, 4); lock.translate(0, H * 0.95, D / 2 + 0.03);
  const gem = new THREE.SphereGeometry(0.045 * S, 24, 16); gem.translate(0, H * 0.98, D / 2 + 0.075);
  const gemMat = new THREE.MeshPhysicalMaterial({ color: '#ff7aa8', roughness: 0.15, clearcoat: 1, emissive: '#ff5d8f', emissiveIntensity: 0.35 });
  const parts = [
    { geo: body, mat: wood, shadow: true }, { geo: lid, mat: wood, shadow: true },
    { geo: b1, mat: gold, shadow: false }, { geo: a1, mat: gold, shadow: false },
    { geo: b2, mat: gold, shadow: false }, { geo: a2, mat: gold, shadow: false },
    { geo: lock, mat: gold, shadow: false }, { geo: gem, mat: gemMat, shadow: false },
  ];
  for (const p of parts) p.geo.userData.shared = true;
  shared = { parts };
  return shared;
}

const OK_KIND = new Set(['sand', 'grass', 'rock', 'snow', 'jungle', 'desert']);

export function buildChestLayer(ctx: Ctx, game: Game, live: Map<string, LiveChest>, openedTier: (key: string) => unknown) {
  const { parts } = sharedParts();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  game.chunks.add({
    key: 'econ-chests', size: 128, radius: 300,
    build: ({ cx, cz, x0, z0, size }) => {
      const r = ctx.rng(`chest:${cx},${cz}`);
      const tries = 3;
      const spots: Array<{ x: number; y: number; z: number; rot: number; key: string }> = [];
      for (let i = 0; i < tries; i++) {
        const x = x0 + r() * size, z = z0 + r() * size, rot = r() * Math.PI * 2, keep = r();
        const isl = ctx.island.islandAt(x, z);
        if (!isl) continue;
        // 보물 작은 섬은 빽빽하게, 큰 섬은 청크당 ~1개
        if (keep > (isl.theme === 'islet' ? 0.9 : 0.42)) continue;
        const s = ctx.island.surfaceAt(x, z);
        if (!OK_KIND.has(s.kind)) continue;
        const wl = ctx.island.waterLevelAt(x, z);
        const y = ctx.island.heightAt(x, z);
        if (wl > y - 0.1) continue;
        const key = `${cx},${cz}:${i}`;
        if (openedTier(key)) continue;
        spots.push({ x, y, z, rot, key });
      }
      if (!spots.length) return null;
      const g = new THREE.Group();
      g.name = 'chests';
      const meshes = parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geo, p.mat, spots.length);
        im.castShadow = p.shadow; im.receiveShadow = true;
        g.add(im);
        return im;
      });
      spots.forEach((s, i) => {
        q.setFromAxisAngle(v.set(0, 1, 0), s.rot);
        m4.compose(new THREE.Vector3(s.x, s.y - 0.03, s.z), q, one);
        for (const im of meshes) im.setMatrixAt(i, m4);
        const c: LiveChest = {
          key: s.key, x: s.x, y: s.y, z: s.z, rotY: s.rot, opened: false,
          hide: () => { m4.compose(new THREE.Vector3(s.x, -999, s.z), q, zero); for (const im of meshes) { im.setMatrixAt(i, m4); im.instanceMatrix.needsUpdate = true; } },
        };
        live.set(s.key, c);
      });
      for (const im of meshes) { im.computeBoundingSphere(); }
      g.userData.chestKeys = spots.map((s) => s.key);
      return g;
    },
    dispose: (o) => { for (const k of (o.userData.chestKeys as string[]) ?? []) live.delete(k); },
  });
}

// ── 열기 연출
let beamTex: THREE.CanvasTexture | null = null;
let sparkTex: THREE.CanvasTexture | null = null;
function tex() {
  if (!beamTex) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
    beamTex = new THREE.CanvasTexture(c);
    const s = document.createElement('canvas'); s.width = s.height = 64;
    const h = s.getContext('2d')!;
    const rg = h.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,0.6)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    h.fillStyle = rg; h.fillRect(0, 0, 64, 64);
    h.fillStyle = 'rgba(255,255,255,0.9)';
    h.fillRect(30, 4, 4, 56); h.fillRect(4, 30, 56, 4);
    sparkTex = new THREE.CanvasTexture(s);
  }
  return { beam: beamTex!, spark: sparkTex! };
}

const coinGeo = (() => { const g = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 28); g.rotateX(Math.PI / 2); return g; })();
const coinMat = new THREE.MeshPhysicalMaterial({ color: '#ffd23f', metalness: 0.7, roughness: 0.25, emissive: '#8a5a00', emissiveIntensity: 0.35, clearcoat: 0.8 });

export function spawnChestFx(game: Game, parent: THREE.Object3D, at: THREE.Vector3, tier: ChestTier, rotY: number) {
  const T = TIERS[tier];
  const col = new THREE.Color(T.color);
  const { beam, spark } = tex();
  const g = new THREE.Group();
  g.position.copy(at);
  game.root.add(g);
  void parent;
  const tall = tier === 'legend' ? 46 : tier === 'epic' ? 32 : tier === 'rare' ? 22 : 14;
  const beams: THREE.Mesh[] = [];
  for (const [rad, op] of [[0.38, 0.6], [0.95, 0.22]] as const) {
    const geo = new THREE.CylinderGeometry(rad, rad * 1.25, tall, 32, 1, true);
    geo.translate(0, tall / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, map: beam, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.renderOrder = 5;
    g.add(m); beams.push(m);
  }
  // 바닥 빛 고리
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 1.6, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  g.add(ring);
  // 반짝이
  const N = tier === 'legend' ? 90 : tier === 'epic' ? 60 : 36;
  const pos = new Float32Array(N * 3), seeds: number[] = [];
  for (let i = 0; i < N; i++) seeds.push(Math.sin(i * 12.9898 + at.x) * 43758.5453 % 1);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: new THREE.Color(T.glow), map: spark, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pts.frustumCulled = false;
  g.add(pts);
  // 코인 분수
  const C = tier === 'legend' ? 40 : tier === 'epic' ? 28 : tier === 'rare' ? 18 : 10;
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, C);
  coins.castShadow = true; coins.frustumCulled = false;
  g.add(coins);
  const vel = Array.from({ length: C }, (_, i) => {
    const a = i * 2.39996 + rotY, sp = 1.6 + ((i * 7) % 5) * 0.45;
    return new THREE.Vector3(Math.cos(a) * sp, 7 + ((i * 3) % 4) * 1.3, Math.sin(a) * sp);
  });
  // 광원 추가는 전체 셰이더 재컴파일(멈춤)을 부르므로 빛 대신 바닥 글로우 원판
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshBasicMaterial({ color: col, map: spark, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.08;
  g.add(glow);
  const t0 = game.time;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const life = 3.6;
  const step = (t: number) => {
    const k = t - t0;
    const fade = Math.max(0, 1 - Math.max(0, k - life + 1.2) / 1.2);
    const pop = Math.min(1, k * 4);
    beams.forEach((b, i) => { b.scale.set(pop * (1 + Math.sin(t * 8 + i) * 0.06), Math.min(1, k * 2.2), pop); (b.material as THREE.MeshBasicMaterial).opacity = (i ? 0.22 : 0.6) * fade; });
    ring.scale.setScalar(1 + k * 1.6);
    (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - k * 0.5);
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.6 * fade * (1 + Math.sin(t * 10) * 0.15);
    for (let i = 0; i < N; i++) {
      const s = Math.abs(seeds[i]);
      const a = s * 40 + k * (0.8 + s), rr = 0.4 + s * 1.8 + k * 0.4;
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = ((s * 13 + k * (2 + s * 3)) % (tall * 0.5)); pos[i * 3 + 2] = Math.sin(a) * rr;
    }
    pg.attributes.position.needsUpdate = true;
    (pts.material as THREE.PointsMaterial).opacity = fade;
    for (let i = 0; i < C; i++) {
      const kk = Math.max(0, k - i * 0.025);
      const v = vel[i];
      const y = Math.max(0.08, 0.5 + v.y * kk - 11 * kk * kk);
      const ground = y <= 0.08;
      p.set(v.x * Math.min(kk, ground ? (v.y + Math.sqrt(v.y * v.y + 22 * 0.42)) / 22 : kk), y, v.z * Math.min(kk, ground ? (v.y + Math.sqrt(v.y * v.y + 22 * 0.42)) / 22 : kk));
      e.set(kk * 9 + i, kk * 6, 0); q.setFromEuler(e);
      sc.setScalar(Math.min(1, kk * 6) * fade + 0.0001);
      m4.compose(p, q, sc); coins.setMatrixAt(i, m4);
    }
    coins.instanceMatrix.needsUpdate = true;
    if (k > life) { g.removeFromParent(); g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== coins) (o as THREE.Mesh).geometry.dispose(); }); pg.dispose(); done = true; }
  };
  let done = false;
  step(t0 + 0.0001);
  game.onUpdate((t) => { if (!done) step(t); });
  return g;
}
