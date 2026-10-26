// 물리 소품: 굴러가는 공(축구공·비치볼), 밀 수 있는 나무 상자·통, 물에 뜨는 부표·튜브.
// 마을·섬마다 몇 군데에 모아 두고, 플레이어 근처 청크만 만든다(지형 충돌 청크 반경 110 m 안쪽).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Ctx } from '../../core/types';
import type { Game } from '../../core/game';
import type { PhysBody, BodyShape } from '../../core/physics';
import { rbox, grad, paint } from './common';
import { stripesRing } from './town';
import type { MatKey } from '../props/kit';

type Kind = 'soccer' | 'beachball' | 'crate' | 'barrel' | 'buoy' | 'tube';
interface Spot { x: number; z: number; kind: Kind; rot: number }

const CHUNK = 32;

// ── 공유 지오메트리(청크가 버려도 dispose 안 함)
let GEO: Record<Kind, THREE.BufferGeometry> | null = null;
function shared(g: THREE.BufferGeometry) { g.userData.shared = true; return g; }

function geos(): Record<Kind, THREE.BufferGeometry> {
  if (GEO) return GEO;
  // 축구공: 정이십면체 꼭짓점 방향 근처를 검은 오각형으로
  const soccer = new THREE.SphereGeometry(0.34, 40, 30);
  {
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const dirs: THREE.Vector3[] = [];
    const ip = ico.attributes.position;
    for (let i = 0; i < ip.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(ip, i).normalize();
      if (!dirs.some((d) => d.distanceTo(v) < 1e-3)) dirs.push(v);
    }
    const p = soccer.attributes.position, a = new Float32Array(p.count * 3);
    const dark = new THREE.Color('#33364a'), white = new THREE.Color('#ffffff'), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const m = Math.max(...dirs.map((d) => d.dot(v)));
      const c = m > 0.93 ? dark : white;
      a.set([c.r, c.g, c.b], i * 3);
    }
    soccer.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  // 비치볼: 세로 6색 줄 + 극 흰 원
  const beach = new THREE.SphereGeometry(0.45, 48, 32);
  {
    const cols = ['#ff5e6c', '#ffffff', '#ffcf3a', '#ffffff', '#4aa8ff', '#ffffff'].map((c) => new THREE.Color(c));
    const p = beach.attributes.position, a = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const ang = Math.atan2(p.getZ(i), p.getX(i)) + Math.PI;
      let c = cols[Math.floor((ang / (Math.PI * 2)) * 6) % 6];
      if (Math.abs(p.getY(i)) > 0.41) c = new THREE.Color('#ffffff');
      a.set([c.r, c.g, c.b], i * 3);
    }
    beach.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  // 나무 상자: 둥근 몸통 + 테두리 판
  const crateParts: THREE.BufferGeometry[] = [];
  const body = rbox(0.86, 0.86, 0.86, 0.1, 4); grad(body, '#c48f5c', '#ddb07c'); crateParts.push(body);
  for (const [x, y, z, w, h, d] of [
    [0, 0.4, 0.42, 0.9, 0.12, 0.06], [0, -0.4, 0.42, 0.9, 0.12, 0.06], [0, 0.4, -0.42, 0.9, 0.12, 0.06], [0, -0.4, -0.42, 0.9, 0.12, 0.06],
    [0.42, 0.4, 0, 0.06, 0.12, 0.9], [0.42, -0.4, 0, 0.06, 0.12, 0.9], [-0.42, 0.4, 0, 0.06, 0.12, 0.9], [-0.42, -0.4, 0, 0.06, 0.12, 0.9],
    [0, 0, 0.43, 0.12, 0.9, 0.05], [0, 0, -0.43, 0.12, 0.9, 0.05], [0.43, 0, 0, 0.05, 0.9, 0.12], [-0.43, 0, 0, 0.05, 0.9, 0.12],
  ]) {
    const b = rbox(w, h, d, 0.025, 2); paint(b, '#9a6a42'); b.translate(x, y, z); crateParts.push(b);
  }
  const crate = mergeGeometries(crateParts.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) g.deleteAttribute(k); return g.index ? g : g; }), false)!;
  // 통: 배가 볼록한 회전체 + 진한 띠
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push(new THREE.Vector2(0.36 + 0.07 * Math.sin(t * Math.PI), -0.5 + t)); }
  prof.unshift(new THREE.Vector2(0, -0.5)); prof.push(new THREE.Vector2(0, 0.5));
  const barrel = new THREE.LatheGeometry(prof, 36);
  {
    const p = barrel.attributes.position, a = new Float32Array(p.count * 3);
    const wood = new THREE.Color('#c48f5c'), band = new THREE.Color('#6a6f7a'), top = new THREE.Color('#d9a874');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), r = Math.hypot(p.getX(i), p.getZ(i));
      const c = r < 0.3 ? top : Math.abs(Math.abs(y) - 0.3) < 0.05 ? band : wood;
      a.set([c.r, c.g, c.b], i * 3);
    }
    barrel.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  // 부표: 아래 공 + 위 원뿔(빨강·흰 줄) + 꼭대기 공
  const bParts: THREE.BufferGeometry[] = [];
  const bb = new THREE.SphereGeometry(0.42, 32, 20); paint(bb, '#ff5e57'); bParts.push(bb);
  const bc = new THREE.CylinderGeometry(0.12, 0.34, 0.8, 32, 6); bc.translate(0, 0.55, 0);
  {
    const p = bc.attributes.position, a = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const c = new THREE.Color(Math.floor((p.getY(i) - 0.15) / 0.2) % 2 ? '#ffffff' : '#ff5e57'); a.set([c.r, c.g, c.b], i * 3); }
    bc.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  bParts.push(bc);
  const bt = new THREE.SphereGeometry(0.13, 20, 14); bt.translate(0, 1.0, 0); paint(bt, '#ffd34f'); bParts.push(bt);
  const buoy = mergeGeometries(bParts.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; }), false)!;
  // 튜브
  const tube = new THREE.TorusGeometry(0.5, 0.2, 20, 40); stripesRing(tube); tube.rotateX(Math.PI / 2);
  {
    const p = tube.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getX(i) > 0.9 && p.getY(i) < 0.5) p.setXYZ(i, 1.0, 0.56, 0.72); // 빨강 → 분홍
  }
  GEO = { soccer: shared(soccer), beachball: shared(beach), crate: shared(crate), barrel: shared(barrel), buoy: shared(buoy), tube: shared(tube) };
  return GEO;
}

const MAT: Record<Kind, MatKey> = { soccer: 'gloss', beachball: 'gloss', crate: 'wood', barrel: 'wood', buoy: 'gloss', tube: 'gloss' };
const SHAPE: Record<Kind, BodyShape> = {
  soccer: { kind: 'ball', r: 0.34 }, beachball: { kind: 'ball', r: 0.45 },
  crate: { kind: 'box', hx: 0.44, hy: 0.44, hz: 0.44 }, barrel: { kind: 'cylinder', halfH: 0.5, r: 0.42 },
  buoy: { kind: 'ball', r: 0.42 }, tube: { kind: 'cylinder', halfH: 0.2, r: 0.68 },
};
/** 물에 뜨는 정도(1 = 물과 같음) */
const FLOAT: Record<Kind, number> = { soccer: 2.2, beachball: 4, crate: 1.6, barrel: 1.8, buoy: 2.4, tube: 4 };
const DENS: Record<Kind, number> = { soccer: 0.35, beachball: 0.06, crate: 0.6, barrel: 0.7, buoy: 0.5, tube: 0.15 };
const BASE_Y: Record<Kind, number> = { soccer: 0.34, beachball: 0.45, crate: 0.44, barrel: 0.5, buoy: 0, tube: 0.05 };

export function setupPhysProps(ctx: Ctx, game: Game, mats: Record<MatKey, THREE.Material>) {
  const I = ctx.island;
  const spots: Spot[] = [];
  const rng = ctx.rng('village:phys');
  const land = (x: number, z: number) => !Number.isFinite(I.waterLevelAt(x, z)) && I.surfaceAt(x, z).kind !== 'cliff' && I.coastDistAt(x, z) > 1.5;
  const sea = (x: number, z: number) => I.surfaceAt(x, z).coastDist < -4 && I.heightAt(x, z) < -1.2;
  /** 중심 주변 반경 r 안에 kinds 를 흩뿌린다(땅 또는 바다) */
  const cluster = (cx: number, cz: number, r: number, kinds: Kind[], water: boolean) => {
    for (const kind of kinds) {
      for (let t = 0; t < 40; t++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (water ? !sea(x, z) : !land(x, z)) continue;
        if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 1.6)) continue;
        spots.push({ x, z, kind, rot: rng() * Math.PI * 2 });
        break;
      }
    }
  };
  // 시작 마을: 해변·광장
  const P = I.PLACES;
  cluster(10.5, 5.5, 3.5, ['beachball', 'soccer'], false);
  cluster(3.5, 10, 3, ['soccer'], false);
  cluster(P.workbench.x - 1, P.workbench.z + 3.5, 2.5, ['crate', 'crate', 'barrel'], false);
  cluster(P.shop.x + 4, P.shop.z + 1, 1.8, ['barrel'], false);
  cluster(P.boatDock.x, P.boatDock.z, 9, ['buoy', 'buoy', 'tube', 'buoy'], true);
  // 섬 도착 부두마다
  for (const [id, k] of Object.entries(P.docks)) {
    const d = I.islandById(id);
    if (!d) continue;
    const dir = new THREE.Vector2(k.x - d.x, k.z - d.z).normalize();
    cluster(k.x - dir.x * 9, k.z - dir.y * 9, 7, ['crate', 'crate', 'barrel', 'soccer', 'beachball'], false);
    // 잔교 끝 근처 바다
    let s = new THREE.Vector2(k.x, k.z);
    for (let i = 0; i < 300 && I.surfaceAt(s.x, s.y).coastDist > 1.5; i++) s.addScaledVector(dir, 1);
    s.addScaledVector(dir, 22);
    cluster(s.x, s.y, 12, ['buoy', 'buoy', 'tube', 'barrel'], true);
  }
  // 청크별 목록
  const byChunk = new Map<string, Spot[]>();
  for (const s of spots) {
    const k = `${Math.floor(s.x / CHUNK)},${Math.floor(s.z / CHUNK)}`;
    const l = byChunk.get(k) ?? [];
    l.push(s);
    byChunk.set(k, l);
  }

  const G = geos();
  const pending = new Set<{ s: Spot; mesh: THREE.Mesh; y: number; obj: THREE.Object3D }>();
  const spawn = (it: { s: Spot; mesh: THREE.Mesh; y: number; obj: THREE.Object3D }) => {
    const { s, mesh } = it;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
    const pb = game.physics.add({
      shape: SHAPE[s.kind], type: 'dynamic', position: { x: s.x, y: it.y, z: s.z }, rotation: q, mesh,
      density: DENS[s.kind], restitution: s.kind === 'beachball' ? 0.75 : s.kind === 'soccer' ? 0.6 : 0.15,
      friction: s.kind === 'beachball' || s.kind === 'soccer' ? 0.5 : 0.8,
      linearDamping: s.kind === 'beachball' ? 0.4 : 0.15, angularDamping: 0.3,
      buoyancy: FLOAT[s.kind], tag: 'village:' + s.kind, ccd: s.kind === 'soccer' || s.kind === 'beachball',
    });
    (it.obj.userData.bodies as PhysBody[]).push(pb);
  };

  game.chunks.add({
    key: 'village-phys', size: CHUNK, radius: 90,
    build: ({ cx, cz }) => {
      const list = byChunk.get(`${cx},${cz}`);
      if (!list) return null;
      const obj = new THREE.Group();
      obj.name = 'village-phys';
      obj.userData.bodies = [] as PhysBody[];
      obj.userData.pend = [] as unknown[];
      for (const s of list) {
        const mesh = new THREE.Mesh(G[s.kind], mats[MAT[s.kind]]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const water = s.kind === 'buoy' || s.kind === 'tube' || sea(s.x, s.z);
        const y = water ? (s.kind === 'buoy' ? 0.15 : 0.05) : I.heightAt(s.x, s.z) + BASE_Y[s.kind] + 0.04;
        mesh.position.set(s.x, y, s.z);
        mesh.rotation.y = s.rot;
        obj.add(mesh);
        const it = { s, mesh, y, obj };
        // 지형 충돌이 아직 없으면 생길 때까지 기다린다(땅 아래로 빠지지 않게)
        if (water || Number.isFinite(game.physics.groundY(s.x, s.z, y + 3))) spawn(it);
        else { pending.add(it); (obj.userData.pend as unknown[]).push(it); }
      }
      return obj;
    },
    dispose: (obj) => {
      for (const b of obj.userData.bodies as PhysBody[]) b.remove();
      for (const it of obj.userData.pend as Array<{ s: Spot; mesh: THREE.Mesh; y: number; obj: THREE.Object3D }>) pending.delete(it);
    },
  });
  game.onUpdate(() => {
    if (!pending.size) return;
    for (const it of pending) {
      if (Number.isFinite(game.physics.groundY(it.s.x, it.s.z, it.y + 3))) { pending.delete(it); spawn(it); }
    }
  });
}
