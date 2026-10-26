// village: 시작 마을 건물(상점·박물관·작업대·게시판·부두·자전거 거치대) + 섬마다 랜드마크·도착 부두 + 물리 소품.
// 정적인 것은 묶음(마을·섬)별로 재질마다 하나로 합친다(draw call 절약). 움직이는 조각(풍차·깃발)만 따로.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { makeMaterials, bake, type MatKey } from './props/kit';
import { buildShop, buildMuseum, buildWorkshop, buildBoard, buildBikeRack, buildPier } from './village/town';
import { buildLandmarks } from './village/landmarks';
import { setupPhysProps } from './village/physprops';
import { buildImpostors, type Imp } from './village/impostors';
import type { Built } from './village/common';

export const order = 4;

export interface Placer {
  root: THREE.Group;
  anims: NonNullable<Built['anim']>;
  /** 건물을 (x, y, z) 에 rotY 로 놓고 충돌체를 등록 */
  place: (b: Built, x: number, y: number, z: number, rotY: number) => THREE.Group;
}

export default function build(ctx: Ctx) {
  const { island, game } = ctx;
  const H = island.heightAt;
  const mats = makeMaterials(ctx.rng('village:mat'));
  const out = new THREE.Group();
  out.name = 'village';
  out.userData.world = 'earth';
  const anims: NonNullable<Built['anim']> = [];

  const mkPlacer = (): Placer => {
    const root = new THREE.Group();
    const p: Placer = {
      root, anims,
      place: (b, x, y, z, rotY) => {
        const k = b.scale ?? 1;
        b.g.position.set(x, y, z);
        b.g.rotation.y = rotY;
        b.g.scale.setScalar(k);
        root.add(b.g);
        if (b.anim) anims.push(...b.anim);
        if (game) {
          const c = Math.cos(rotY), s = Math.sin(rotY);
          for (const col of b.cols) {
            const wx = x + (col.x * c + col.z * s) * k, wz = z + (-col.x * s + col.z * c) * k, wy = y + col.y * k;
            if (col.kind === 'box') {
              const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY + (col.ry ?? 0));
              game.physics.addStatic({ kind: 'box', hx: col.hx * k, hy: col.hy * k, hz: col.hz * k }, { x: wx, y: wy, z: wz }, q, 'building');
            } else {
              game.physics.addStatic({ kind: 'cylinder', halfH: col.hh * k, r: col.r * k }, { x: wx, y: wy, z: wz }, undefined, 'building');
            }
          }
        }
        return b.g;
      },
    };
    return p;
  };
  /** 발자국 안 최저 높이 */
  const footY = (x: number, z: number, r: number) => {
    let m = H(x, z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      m = Math.min(m, H(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return m;
  };

  // ── 시작 마을
  const P = island.PLACES;
  const town = mkPlacer();
  /** 다른 모듈(나무·꽃)의 scatter 가 이 자리를 피하도록 등록 */
  const reserve = (x: number, z: number, r: number) => ctx.scatter({
    key: `village:reserve:${x.toFixed(2)},${z.toFixed(2)}`, count: 1, minDist: 0.01,
    bounds: { minX: x - 1e-3, maxX: x + 1e-3, minZ: z - 1e-3, maxZ: z + 1e-3 },
    accept: () => true, avoidOccupied: false, occupy: r,
  });
  const putT = (b: Built, p: { x: number; z: number; rotY?: number }) => {
    const r = p.rotY ?? 0;
    if ((b.foot ?? 1) >= 2.5) {
      // 큰 건물만(룩 테스트 연출의 꽃밭은 건드리지 않게): 몸통 + 앞(+z) 마당
      reserve(p.x, p.z, (b.foot ?? 1) + 1.6);
      const f = (b.foot ?? 1) + 1.5;
      reserve(p.x + Math.sin(r) * f, p.z + Math.cos(r) * f, Math.max(2, (b.foot ?? 1) * 0.7));
    }
    return town.place(b, p.x, footY(p.x, p.z, b.foot ?? 1) - 0.03, p.z, r);
  };
  putT(buildShop(), P.shop);
  putT(buildMuseum(), P.museum);
  putT(buildWorkshop(), P.workbench);
  putT(buildBoard(), P.townBoard);
  putT(buildBikeRack(), P.bikeRack);
  // 부두: 해안(물가)에서 boatDock 까지
  {
    const a = new THREE.Vector2(P.pier.x, P.pier.z), b = new THREE.Vector2(P.boatDock.x, P.boatDock.z);
    const dir = b.clone().sub(a).normalize();
    let s = a.clone();
    for (let i = 0; i < 80; i++) {
      const t = s.clone().addScaledVector(dir, -0.5);
      s = t;
      if (island.surfaceAt(t.x, t.y).coastDist > 1.0) break;
    }
    const len = b.distanceTo(s);
    const rotY = Math.atan2(dir.x, dir.y);
    const y0 = H(s.x, s.y);
    const pier = buildPier(len, 2.2, Math.max(1.05 - y0, 0.25), 5.2, ctx.rng('village:pier'));
    town.place(pier, s.x, y0, s.y, rotY);
  }
  out.add(bake(town.root, mats as Record<MatKey, THREE.Material>));

  // ── 섬 랜드마크·도착 부두(섬 묶음마다 거리로 켜고 끈다 — 멀리 있는 섬은 안개 속이라 그리지 않는다)
  const lods: Array<{ o: THREE.Object3D; c: THREE.Vector3; far: number }> = [];
  const imps: Imp[] = [];
  const groups = buildLandmarks(ctx, mkPlacer, footY, imps);
  // 먼 거리 임포스터(실루엣 + 대표색, 4.6 km 까지) — bake 전에 배치 변환을 읽는다
  const far = buildImpostors(imps);
  out.add(far.root);
  ctx.onUpdate(() => {
    const fog = ctx.scene.fog as THREE.Fog | null;
    far.update(ctx.camera.position, fog ? fog.color : null);
  });
  for (const grp of groups) {
    const box = new THREE.Box3().setFromObject(grp);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const b = bake(grp, mats as Record<MatKey, THREE.Material>);
    out.add(b);
    lods.push({ o: b, c, far: 950 + r }); // 그 밖은 곡률에 가라앉아 안 보인다 → 임포스터가 맡는다
  }
  ctx.onUpdate(() => {
    const cp = ctx.camera.position;
    for (const l of lods) l.o.visible = Math.hypot(cp.x - l.c.x, cp.z - l.c.z) < l.far;
  });

  // ── 움직이는 조각: bake 뒤 자세를 기준으로
  const bases = new Map<THREE.Object3D, THREE.Quaternion>();
  ctx.onUpdate((t) => {
    for (const a of anims) {
      let b = bases.get(a.o);
      if (!b) { b = a.o.quaternion.clone(); bases.set(a.o, b); }
      a.fn(a.o, b, t);
    }
  });

  // ── 밤: 창문·등 켜기
  ctx.onTod((name) => {
    const k = name === 'night' ? 1 : name === 'sunset' ? 0.45 : 0;
    mats.lampGlow.emissiveIntensity = 3.2 * k;
    mats.window.emissiveIntensity = 1.6 * k;
    mats.window.color.set(k > 0 ? '#ffe7b8' : '#bfe6ff');
    mats.glow.emissiveIntensity = 1.3 + 2 * k;
  });

  // ── 물리 소품(굴러가는 공·상자·통·부표) — 게임에서만, 청크 스트리밍
  if (game) setupPhysProps(ctx, game, mats);

  return out;
}
