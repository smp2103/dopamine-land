// village: 시작 마을 건물(상점·박물관·작업대·게시판·부두·자전거 거치대·캡슐머신·우체통) + 통통 조선소 + 강 다리 3 + 내 집(텐트 → 2층 집)
//          + 섬 특산 시설(노점 → 시설) + 비눗방울 정류장 + 섬 주민 집 + 섬마다 랜드마크·도착 부두 + 물리 소품.
// 정적인 것은 묶음(마을·섬·건물)별로 재질마다 하나로 합친다(draw call 절약). 움직이는 조각(풍차·깃발·크레인 갈고리)만 따로.
//
// game.ext.village (주인: village) = {
//   lighthouses: Record<island, {x, z, lit}>      — 등대 자리·켜짐(village/landmarks)
//   setLighthouse(id, lit)                         — 등대 불 + 옆 비눗방울 정류장의 큰 방울
//   setTowerStage(n 0..6)                          — 별똥별섬 발사탑 단계(로켓 부품 수)
//   setHouseStage(n 0..4)                          — 내 집 외형(0 텐트 … 4 2층 집), 충돌체도 바꾼다
//   setFacility(id, on)                            — 섬 특산 시설 외형(id = PLACES.facilities 키 또는 별칭)
//   setMailFlag(up)                                — 집 앞 우체통 깃발(편지 왔어요)
//   houseStage(); towerStage(); facilities()       — 지금 상태
//   positions: { mailbox, house, shipyard{counter, pelican, boatSpawn, pierStart, pierEnd, warehouse, crane, walk},
//                bridges[], capsule, facilities{id:{x,z,rotY,on}}, bubbles{island:{x,z}}, residentHouses[], lighthouses, buoys,
//                pengLab, launchTower, moonDeck, volcanoVent }  (뒤 넷은 village/landmarks controls 그대로)
// }
// 상태 맞추기: 첫 onUpdate 에서 econ(order 9) 해금을 읽고, 그 뒤로 unlock(lighthouse:·rocket:part:·house:·facility:·dev:)·lighthouse·dev-stage 이벤트를 듣는다.
// 디버그: window.__village = { stage(n, what='house'|'tower'), house(n), tower(n), light(id, lit), facility(id, on), mail(up), state(), positions, goto(name) }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { PhysBody } from '../core/physics';
import type { Landmark } from '../core/api';
import { makeMaterials, bake, type MatKey } from './props/kit';
import { buildShop, buildMuseum, buildWorkshop, buildBoard, buildBikeRack, buildPier, buildCapsuleMachine } from './village/town';
import { buildLandmarks } from './village/landmarks';
import { setupPhysProps } from './village/physprops';
import { buildImpostors, type Imp } from './village/impostors';
import { planShipyard, buildShipCounter, buildWarehouse, buildCrane, buildRamp, buildSpawnMarker, buildRowboat, PIER_END } from './village/shipyard';
import { buildBridge } from './village/bridges';
import { buildHomeStage, buildHomeMailbox, buildResidentHouse, clampStage, HOUSE_STAGES } from './village/house';
import { FACILITY_IDS, FACILITY_INFO, facilityIdsFor, buildStall, buildFacility, buildSkiLift, buildBubbleStation, wireVillageSync, type FacilityId } from './village/facilities';
import type { Built } from './village/common';

export const order = 4;

export interface Placer {
  root: THREE.Group;
  anims: NonNullable<Built['anim']>;
  /** 건물을 (x, y, z) 에 rotY 로 놓고 충돌체를 등록(o.cols=false 면 충돌체는 나중에 — o.bodies 로 받는다) */
  place: (b: Built, x: number, y: number, z: number, rotY: number, o?: { cols?: boolean; bodies?: PhysBody[] }) => THREE.Group;
}

/** village-landmarks 가 돌려주는 모양(동시에 작업 중 — 옛 배열 모양도 받아 준다) */
interface LandmarkControls {
  lighthouses: Record<string, { x: number; z: number; lit: boolean }>;
  setLighthouse(id: string, lit: boolean): void;
  setTowerStage(n: number): void;
  landmarks: Landmark[];
  [k: string]: unknown;
}
interface LandmarksOut { groups: THREE.Group[]; controls: LandmarkControls }

type XZ = { x: number; z: number };

export default function build(ctx: Ctx) {
  const { island, game } = ctx;
  const H = island.heightAt;
  const mats = makeMaterials(ctx.rng('village:mat'));
  const M = mats as Record<MatKey, THREE.Material>;
  const out = new THREE.Group();
  out.name = 'village';
  out.userData.world = 'earth';
  const anims: NonNullable<Built['anim']> = [];

  /** 건물 로컬 충돌체 → 월드 정적 몸체 */
  const addCols = (b: Built, x: number, y: number, z: number, rotY: number): PhysBody[] => {
    if (!game) return [];
    const k = b.scale ?? 1;
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const bodies: PhysBody[] = [];
    for (const col of b.cols) {
      const wx = x + (col.x * c + col.z * s) * k, wz = z + (-col.x * s + col.z * c) * k, wy = y + col.y * k;
      if (col.kind === 'box') {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY + (col.ry ?? 0));
        if (col.rx) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), col.rx));
        bodies.push(game.physics.addStatic({ kind: 'box', hx: col.hx * k, hy: col.hy * k, hz: col.hz * k }, { x: wx, y: wy, z: wz }, q, 'building'));
      } else {
        bodies.push(game.physics.addStatic({ kind: 'cylinder', halfH: col.hh * k, r: col.r * k }, { x: wx, y: wy, z: wz }, undefined, 'building'));
      }
    }
    return bodies;
  };
  const mkPlacer = (): Placer => {
    const root = new THREE.Group();
    return {
      root, anims,
      place: (b, x, y, z, rotY, o) => {
        const k = b.scale ?? 1;
        b.g.position.set(x, y, z);
        b.g.rotation.y = rotY;
        b.g.scale.setScalar(k);
        root.add(b.g);
        if (b.anim) anims.push(...b.anim);
        if (o?.cols !== false) { const bs = addCols(b, x, y, z, rotY); o?.bodies?.push(...bs); }
        return b.g;
      },
    };
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
  /** 로컬(건물 기준) → 월드 */
  const toWorld = (p: { x: number; z: number; rotY?: number }, lx: number, lz: number): XZ => {
    const r = p.rotY ?? 0, c = Math.cos(r), s = Math.sin(r);
    return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
  };
  const fwdOf = (r: number) => ({ x: Math.sin(r), z: Math.cos(r) });
  const dryLand = (x: number, z: number) => H(x, z) > 0.45 && !Number.isFinite(island.waterLevelAt(x, z)) && island.surfaceAt(x, z).kind !== 'cliff';
  const flatAt = (x: number, z: number, r: number, maxD: number) => {
    const h0 = H(x, z);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; if (Math.abs(H(x + Math.cos(a) * r, z + Math.sin(a) * r) - h0) > maxD) return false; }
    return true;
  };
  /** 거리로 켜고 끄는 묶음(멀리 있는 건 안개·곡률에 가라앉는다) */
  const lods: Array<{ o: THREE.Object3D; c: THREE.Vector3; far: number }> = [];
  const addLod = (o: THREE.Object3D, far: number) => {
    const box = new THREE.Box3().setFromObject(o);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    lods.push({ o, c, far: far + box.getSize(new THREE.Vector3()).length() / 2 });
  };
  /** 다른 모듈(나무·꽃)의 scatter 가 이 자리를 피하도록 등록 */
  const reserve = (x: number, z: number, r: number) => ctx.scatter({
    key: `village:reserve:${x.toFixed(2)},${z.toFixed(2)}`, count: 1, minDist: 0.01,
    bounds: { minX: x - 1e-3, maxX: x + 1e-3, minZ: z - 1e-3, maxZ: z + 1e-3 },
    accept: () => true, avoidOccupied: false, occupy: r,
  });
  /** 묶음 하나(placer → bake → 이름 붙인 그룹) */
  const bakeNamed = (p: Placer, name: string) => {
    const b = bake(p.root, M);
    b.name = name;
    return b;
  };

  // ───────── 시작 마을 ─────────
  const P = island.PLACES;
  const town = mkPlacer();
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
  // 캡슐머신: 상점 왼쪽 벽 옆(앞을 본다)
  const capsuleAt = { ...toWorld(P.shop, -3.25, 0.35), rotY: P.shop.rotY };
  putT(buildCapsuleMachine(ctx.rng('village:capsule')), capsuleAt);
  // 집 앞 우체통(아침 우편 — calendar 가 상호작용을 붙인다)
  const mailbox = buildHomeMailbox();
  putT(mailbox, P.mailbox);
  reserve(P.mailbox.x, P.mailbox.z, 0.8);
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
  out.add(bake(town.root, M));

  // ───────── 통통 조선소(말랑섬 남동 해변) ─────────
  const sy = planShipyard(island);
  const shipPos: Record<string, unknown> = {};
  {
    const p = mkPlacer();
    const C = sy.counter;
    p.place(buildShipCounter(), C.x, footY(C.x, C.z, 1.2) - 0.03, C.z, C.rotY);
    const W = sy.warehouse;
    p.place(buildWarehouse(), W.x, footY(W.x, W.z, 2.4) - 0.05, W.z, W.rotY);
    // 잔교 + 땅에서 오르는 경사로
    const deck = (d: typeof sy.pier, w: number, endW: number, key: string) => {
      p.place(buildPier(d.len, w, d.deckY, endW, ctx.rng(key)), d.x, d.y0, d.z, d.rotY);
      const top = d.y0 + d.deckY + 0.06;
      const f = fwdOf(d.rotY);
      // 시작 쪽: 0.3 m 넘게 올라야 하면 경사로(뒤로 1.6 m)
      const gS = H(d.x - f.x * 1.6, d.z - f.z * 1.6);
      if (top - gS > 0.3) p.place(buildRamp(top - gS, 1.6, w), d.x, gS, d.z, d.rotY);
      if (endW === 0) {
        // 끝 쪽(보도): 반대로 내려오는 경사로
        const ex = d.x + f.x * (d.len + 0.3), ez = d.z + f.z * (d.len + 0.3);
        const gE = H(ex + f.x * 1.6, ez + f.z * 1.6);
        if (top - gE > 0.3) p.place(buildRamp(top - gE, 1.6, w), ex, gE, ez, d.rotY + Math.PI);
      }
      return top;
    };
    const deckTop = deck(sy.pier, 2.4, PIER_END, 'village:shipyard:pier');
    if (sy.walk) deck(sy.walk, 1.8, 0, 'village:shipyard:walk');
    // 크레인(잔교 끝 선착장 모서리, 팔은 바다 쪽)
    p.place(buildCrane(), sy.crane.x, deckTop, sy.crane.z, sy.pier.rotY);
    // 매어 둔 나룻배 + 배 소환 부표(물 위에서 출렁)
    const pf = fwdOf(sy.pier.rotY), side = { x: pf.z, z: -pf.x };
    const rb = buildRowboat();
    // 배 소환 자리 반대편(크레인 쪽)에 매어 둔다
    const bs = Math.sign((sy.boatSpawn.x - sy.pier.x) * side.x + (sy.boatSpawn.z - sy.pier.z) * side.z) || 1;
    const rbAt = { x: sy.pier.x + pf.x * 15 - side.x * 2.9 * bs, z: sy.pier.z + pf.z * 15 - side.z * 2.9 * bs };
    rb.position.set(rbAt.x, 0.12, rbAt.z);
    rb.rotation.y = sy.pier.rotY + 0.12;
    p.root.add(rb);
    const mk = buildSpawnMarker();
    mk.position.set(sy.boatSpawn.x, 0.02, sy.boatSpawn.z);
    mk.rotation.y = sy.boatSpawn.rotY;
    p.root.add(mk);
    const bob = (o: THREE.Object3D, ph: number, y0: number) => anims.push({ o, fn: (q, base, t) => {
      q.position.y = y0 + Math.sin(t * 1.1 + ph) * 0.06;
      q.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 0.9 + ph) * 0.04, 0, Math.sin(t * 1.3 + ph) * 0.05)));
    } });
    bob(rb, 0.4, 0.12);
    bob(mk, 2.1, 0.02);
    const g = bakeNamed(p, 'village-shipyard');
    out.add(g);
    addLod(g, 700);
    Object.assign(shipPos, {
      counter: { ...C }, pelican: { ...sy.pelican }, boatSpawn: { ...sy.boatSpawn },
      pierStart: { x: sy.pier.x, z: sy.pier.z }, pierEnd: { x: sy.pier.endX, z: sy.pier.endZ }, deckY: deckTop,
      warehouse: { x: W.x, z: W.z }, crane: { ...sy.crane }, rowboat: rbAt,
      walk: sy.walk ? { a: { x: sy.walk.x, z: sy.walk.z }, b: { x: sy.walk.endX, z: sy.walk.endZ } } : null,
    });
  }

  // ───────── 말랑섬 큰 강 아치 다리 3 ─────────
  const bridgePos: Array<{ x: number; z: number; rot: number; len: number; y: number; a: XZ; b: XZ }> = [];
  P.bridges.forEach((br, i) => {
    const f = fwdOf(br.rot);
    const a = { x: br.x - f.x * br.len / 2, z: br.z - f.z * br.len / 2 }, b = { x: br.x + f.x * br.len / 2, z: br.z + f.z * br.len / 2 };
    const wl = island.waterLevelAt(br.x, br.z);
    const water = Number.isFinite(wl) ? wl : island.riverWaterY(br.x, br.z);
    const yA = H(a.x, a.z), yB = H(b.x, b.z);
    const p = mkPlacer();
    const tints = ['#ff9f8f', '#7cc8f5', '#ffd34f'];
    p.place(buildBridge(br.len, yA, yB, Number.isFinite(water) ? water : Math.max(yA, yB) - 0.6, ctx.rng(`village:bridge:${i}`), tints[i % 3]), br.x, 0, br.z, br.rot);
    const g = bakeNamed(p, `village-bridge-${i}`);
    out.add(g);
    addLod(g, 480);
    for (const e of [a, b]) reserve(e.x, e.z, 2.2);
    bridgePos.push({ x: br.x, z: br.z, rot: br.rot, len: br.len, y: Math.max(yA, yB), a, b });
  });

  // ───────── 내 집(0 텐트 … 4 2층 집) ─────────
  const HP = P.house;
  const houseRoot = new THREE.Group();
  houseRoot.name = 'village-house';
  const houseY = footY(HP.x, HP.z, 3.2) - 0.03;
  const stages: Array<{ g: THREE.Object3D; b: Built; bodies: PhysBody[] | null }> = [];
  for (let n = 0; n <= HOUSE_STAGES; n++) {
    const p = mkPlacer();
    const b = buildHomeStage(n);
    p.place(b, HP.x, houseY, HP.z, HP.rotY, { cols: false });
    const g = bakeNamed(p, `village-house-${n}`);
    g.visible = false;
    houseRoot.add(g);
    stages.push({ g, b, bodies: null });
  }
  out.add(houseRoot);
  addLod(houseRoot, 650);
  reserve(HP.x, HP.z, 7.5);
  { const f = fwdOf(HP.rotY); reserve(HP.x + f.x * 6, HP.z + f.z * 6, 3); }
  let houseStage = -1;
  const setHouseStage = (n: number) => {
    const s = clampStage(n);
    if (s === houseStage) return;
    if (houseStage >= 0) { const o = stages[houseStage]; o.g.visible = false; o.bodies?.forEach((q) => q.remove()); o.bodies = null; }
    houseStage = s;
    const o = stages[s];
    o.g.visible = true;
    o.bodies = addCols(o.b, HP.x, houseY, HP.z, HP.rotY);
  };
  setHouseStage(0);
  const houseFront = (() => { const f = fwdOf(HP.rotY), d = (stages[0].b.front ?? 2); return { x: HP.x + f.x * d, z: HP.z + f.z * d }; })();

  // ───────── 섬 특산 시설(짓기 전엔 노점) ─────────
  const facs = new Map<FacilityId, { stall: THREE.Object3D; ext: THREE.Object3D; s: { b: Built; at: [number, number, number, number]; bodies: PhysBody[] | null }; e: { b: Built; at: [number, number, number, number]; bodies: PhysBody[] | null }; on: boolean }>();
  const facPos: Record<string, { x: number; z: number; rotY: number; island: string; on: boolean }> = {};
  for (const id of FACILITY_IDS) {
    const sp = P.facilities[id];
    if (!sp) continue;
    const info = FACILITY_INFO[id];
    const f = fwdOf(sp.rotY);
    const parent = new THREE.Group();
    parent.name = `village-fac-${id}`;
    // 노점: 계산대 앞(front) = 시설 자리
    const sb = buildStall(info.stall, info.color);
    const sAt = (b: Built) => { const d = b.front ?? 1; const x = sp.x - f.x * d, z = sp.z - f.z * d; return [x, footY(x, z, Math.max(1, (b.foot ?? 1) * 0.7)) - 0.04, z, sp.rotY] as [number, number, number, number]; };
    const sPos = sAt(sb);
    const ps = mkPlacer();
    ps.place(sb, ...sPos, { cols: false });
    const stall = bakeNamed(ps, `village-stall-${id}`);
    // 시설 외형
    let eb: Built;
    let ePos: [number, number, number, number];
    if (id === 'skiLift') {
      // 오르막 방향(30 m 앞이 가장 높아지는 쪽)으로 철탑을 세운다
      let best = sp.rotY, bh = -Infinity;
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; const h = H(sp.x + Math.sin(a) * 30, sp.z + Math.cos(a) * 30); if (h > bh) { bh = h; best = a; } }
      const fu = fwdOf(best);
      const ox = sp.x - fu.x * 1.0, oz = sp.z - fu.z * 1.0;
      const y0 = footY(ox, oz, 1.4) - 0.04;
      const c = Math.cos(best), s = Math.sin(best);
      eb = buildSkiLift((lx, lz) => H(ox + lx * c + lz * s, oz - lx * s + lz * c) - y0);
      ePos = [ox, y0, oz, best];
    } else {
      eb = buildFacility(id, ctx.rng(`village:fac:${id}`));
      ePos = sAt(eb);
    }
    const pe = mkPlacer();
    pe.place(eb, ...ePos, { cols: false });
    const ext = bakeNamed(pe, `village-facility-${id}`);
    ext.visible = false;
    parent.add(stall, ext);
    out.add(parent);
    addLod(parent, 650);
    reserve(sp.x - f.x * 2, sp.z - f.z * 2, (eb.foot ?? 3) + 1.5);
    const rec = { stall, ext, s: { b: sb, at: sPos, bodies: addCols(sb, ...sPos) as PhysBody[] | null }, e: { b: eb, at: ePos, bodies: null as PhysBody[] | null }, on: false };
    facs.set(id, rec);
    facPos[id] = { x: sp.x, z: sp.z, rotY: sp.rotY, island: info.island, on: false };
  }
  const setFacilityId = (id: FacilityId, on: boolean) => {
    const r = facs.get(id);
    if (!r || r.on === on) return;
    r.on = on;
    facPos[id].on = on;
    r.stall.visible = !on;
    r.ext.visible = on;
    const [hide, show] = on ? [r.s, r.e] : [r.e, r.s];
    hide.bodies?.forEach((q) => q.remove());
    hide.bodies = null;
    show.bodies = addCols(show.b, ...show.at);
  };
  const setFacility = (id: string, on: boolean) => {
    const ids = (FACILITY_IDS as readonly string[]).includes(id) ? [id as FacilityId] : facilityIdsFor(id);
    for (const f of ids) setFacilityId(f, on);
  };

  // ───────── 섬 랜드마크·도착 부두·등대(village/landmarks) ─────────
  const imps: Imp[] = [];
  const lmRaw = buildLandmarks(ctx, mkPlacer, footY, imps) as unknown as LandmarksOut | THREE.Group[];
  const lm: LandmarksOut = Array.isArray(lmRaw)
    ? {
      groups: lmRaw,
      controls: {
        lighthouses: Object.fromEntries(Object.entries(P.lighthouses).map(([id, s]) => [id, { x: s.x, z: s.z, lit: false }])),
        setLighthouse: () => {}, setTowerStage: () => {}, landmarks: [],
      },
    }
    : lmRaw;
  const controls = lm.controls;
  // 먼 거리 임포스터(실루엣 + 대표색, 4.6 km 까지) — bake 전에 배치 변환을 읽는다
  const far = buildImpostors(imps);
  out.add(far.root);
  ctx.onUpdate(() => {
    const fog = ctx.scene.fog as THREE.Fog | null;
    far.update(ctx.camera.position, fog ? fog.color : null);
  });
  for (const grp of lm.groups) {
    const box = new THREE.Box3().setFromObject(grp);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const b = grp.userData.baked ? grp : bake(grp, M);
    out.add(b);
    lods.push({ o: b, c, far: 950 + r }); // 그 밖은 곡률에 가라앉아 안 보인다 → 임포스터가 맡는다
  }

  // ───────── 비눗방울 정류장(등대마다 옆 평지) ─────────
  const bubbles: Record<string, THREE.Object3D> = {};
  const bubblePos: Record<string, XZ> = {};
  {
    const byIsland = new Map<string, Placer>();
    for (const [id, L] of Object.entries(P.lighthouses)) {
      const fl = fwdOf(L.rotY), sd = { x: fl.z, z: -fl.x };
      let at: XZ | null = null;
      for (const lat of [12, -12, 14, -14, 16, -16, 10, -10, 18, -18]) for (const fw of [0, 3, -3, 6]) {
        if (at) break;
        const x = L.x + sd.x * lat + fl.x * fw, z = L.z + sd.z * lat + fl.z * fw;
        if (dryLand(x, z) && flatAt(x, z, 1.9, 0.45)) at = { x, z };
      }
      at ??= { x: L.x + sd.x * 12, z: L.z + sd.z * 12 };
      const p = byIsland.get(id) ?? mkPlacer();
      byIsland.set(id, p);
      const st = buildBubbleStation();
      p.place(st, at.x, footY(at.x, at.z, 1.8) - 0.05, at.z, L.rotY);
      bubbles[id] = st.bubble;
      bubblePos[id] = at;
      reserve(at.x, at.z, 2.6);
    }
    for (const [id, p] of byIsland) {
      const g = bakeNamed(p, `village-bubble-${id}`);
      out.add(g);
      addLod(g, 600);
    }
  }
  const setLighthouse = (id: string, lit: boolean) => {
    controls.setLighthouse(id, lit);
    if (controls.lighthouses[id]) controls.lighthouses[id].lit = lit;
    if (bubbles[id]) bubbles[id].visible = lit;
  };

  // 지도·구역이 읽는 랜드마크(등대·탑은 landmarks, 마을 건물은 여기)
  const myLandmarks: Landmark[] = [
    { id: 'lm:home:shipyard', kind: 'shipyard', name: '통통 조선소', island: 'home', x: sy.counter.x, z: sy.counter.z, r: 18 },
    { id: 'lm:home:house', kind: 'house', name: '내 집', island: 'home', x: HP.x, z: HP.z, r: 8 },
    ...bridgePos.map((b, i) => ({ id: `lm:home:bridge:${i + 1}`, kind: 'bridge', name: `강 다리 ${i + 1}`, island: 'home', x: b.x, z: b.z, r: 6 })),
    ...Object.entries(facPos).map(([id, f]) => ({ id: `lm:${f.island}:${FACILITY_INFO[id as FacilityId].kind}`, kind: FACILITY_INFO[id as FacilityId].kind, name: FACILITY_INFO[id as FacilityId].name, island: f.island, x: f.x, z: f.z, r: 10 })),
  ];
  if (game?.geo) for (const l of [...(controls.landmarks ?? []), ...myLandmarks]) game.geo.addLandmark(l);

  ctx.onUpdate(() => {
    const cp = ctx.camera.position;
    for (const l of lods) l.o.visible = Math.hypot(cp.x - l.c.x, cp.z - l.c.z) < l.far;
  });

  // ───────── 움직이는 조각: bake 뒤 자세를 기준으로 ─────────
  const bases = new Map<THREE.Object3D, THREE.Quaternion>();
  /** 조상까지 다 보일 때만 움직인다(멀리 꺼진 섬·숨은 시설은 건너뛴다) */
  const shown = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  ctx.onUpdate((t) => {
    for (const a of anims) {
      let b = bases.get(a.o);
      if (!b) { b = a.o.quaternion.clone(); bases.set(a.o, b); }
      else if (!shown(a.o)) continue;
      a.fn(a.o, b, t);
    }
  });

  // ───────── 밤: 창문·등 켜기 ─────────
  ctx.onTod((name) => {
    const k = name === 'night' ? 1 : name === 'sunset' ? 0.45 : 0;
    mats.lampGlow.emissiveIntensity = 3.2 * k;
    mats.window.emissiveIntensity = 1.6 * k;
    mats.window.color.set(k > 0 ? '#ffe7b8' : '#bfe6ff');
    mats.glow.emissiveIntensity = 1.3 + 2 * k;
  });

  // ───────── 우체통 깃발(편지 왔어요) ─────────
  let mailUp = false;
  const flagBase = mailbox.flag.quaternion.clone();
  const setMailFlag = (up: boolean) => {
    mailUp = up;
    mailbox.flag.quaternion.copy(flagBase).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), up ? Math.PI / 2 : 0));
  };

  // ───────── 섬 주민 집(characters 가 정한 주민 자리 옆) ─────────
  const residentPos: Array<{ id: string; island: string; x: number; z: number; rotY: number }> = [];
  let houseTaken: Array<XZ & { r: number }> | null = null;
  let houseBatch = 0;
  const placeResidentHouses = (homes: Array<{ id: string; island: string; x: number; z: number }>) => {
    const B = island.ISLAND_BOUNDS;
    const byIsland = new Map<string, Placer>();
    // 비켜야 할 자리 — 나중에 이사 온 주민 집도 앞서 지은 집을 피하도록 계속 쌓아 둔다
    const taken: Array<XZ & { r: number }> = houseTaken ??= [
      ...Object.values(P.docks).map((d) => ({ x: d.x, z: d.z, r: 10 })),
      ...Object.values(bubblePos).map((d) => ({ ...d, r: 6 })),
      ...Object.values(controls.lighthouses).map((d) => ({ x: d.x, z: d.z, r: 12 })),
      ...Object.values(facPos).map((d) => ({ x: d.x, z: d.z, r: 12 })),
    ];
    const batch = houseBatch++;
    for (const h of homes) {
      if (residentPos.some((r) => r.id === h.id && r.island === h.island)) continue; // 이미 이 섬에 집이 있다
      if (h.island === 'home' && h.x >= B.minX && h.x <= B.maxX && h.z >= B.minZ && h.z <= B.maxZ) continue; // 룩 테스트 마을(이미 집이 있다)
      const d = island.islandById(h.island);
      if (!d) continue;
      // 주민 자리에서 섬 안쪽으로 6~14 m, 좌우로 비켜 가며 평지
      const inx = d.x - h.x, inz = d.z - h.z, L = Math.hypot(inx, inz) || 1;
      const fi = { x: inx / L, z: inz / L }, sd = { x: fi.z, z: -fi.x };
      let at: XZ | null = null;
      for (const back of [7, 9, 11, 14, 17, 20, 24]) for (const lat of [0, 4, -4, 8, -8, 12, -12]) {
        if (at) break;
        const x = h.x + fi.x * back + sd.x * lat, z = h.z + fi.z * back + sd.z * lat;
        if (!dryLand(x, z) || !flatAt(x, z, 2.2, 0.8)) continue;
        if (taken.some((q) => Math.hypot(q.x - x, q.z - z) < q.r)) continue;
        at = { x, z };
      }
      if (!at) continue;
      taken.push({ ...at, r: 7 });
      const rotY = Math.atan2(h.x - at.x, h.z - at.z); // 앞이 주민 쪽(바다 쪽)
      const p = byIsland.get(h.island) ?? mkPlacer();
      byIsland.set(h.island, p);
      const b = buildResidentHouse(h.island);
      p.place(b, at.x, footY(at.x, at.z, 2.2) - 0.04, at.z, rotY);
      residentPos.push({ id: h.id, island: h.island, x: +at.x.toFixed(2), z: +at.z.toFixed(2), rotY: +rotY.toFixed(3) });
    }
    for (const [id, p] of byIsland) {
      const g = bakeNamed(p, batch ? `village-residents-${id}-${batch}` : `village-residents-${id}`);
      out.add(g);
      addLod(g, 600);
    }
  };
  const readHomes = (): Array<{ id: string; island: string; x: number; z: number }> | null => {
    const npc = game?.ext.npc as { homes?: unknown } | undefined;
    const h = typeof npc?.homes === 'function' ? (npc.homes as () => unknown)() : npc?.homes;
    // 정본은 characters 가 여는 game.ext.npc.homes(디버그 훅 window.__chars 는 더 안 읽는다)
    return Array.isArray(h) ? (h as Array<{ id: string; island: string; x: number; z: number }>) : null;
  };
  if (game) {
    let tries = 0, done = false;
    ctx.onUpdate(() => {
      if (done) return;
      const homes = readHomes();
      if (homes || ++tries > 240) { done = true; if (homes) placeResidentHouses(homes); }
    });
    // 나중에 이사 온 주민(npc-movein)도 그 자리에 집을 지어 준다
    game.state.on((e) => {
      if ((e as { type: string }).type !== 'npc-movein' || !done) return;
      const id = (e as unknown as { npc?: string }).npc;
      const h = readHomes()?.find((x) => x.id === id);
      if (h) placeResidentHouses([h]);
    });
  }

  // ───────── game.ext.village + 상태 맞추기 ─────────
  const positions = {
    mailbox: { x: P.mailbox.x, z: P.mailbox.z, rotY: P.mailbox.rotY },
    house: { x: HP.x, z: HP.z, rotY: HP.rotY, y: houseY, door: houseFront, get stage() { return houseStage; } },
    shipyard: shipPos,
    bridges: bridgePos,
    capsule: capsuleAt,
    facilities: facPos,
    bubbles: bubblePos,
    residentHouses: residentPos,
    lighthouses: controls.lighthouses,
    buoys: (controls.buoys as unknown) ?? P.buoyMail,
    // 랜드마크 쪽 자리(있으면): 펭박사 연구소·발사탑·버섯 탑 달 관측대·화산 분기공
    pengLab: controls.pengLab, launchTower: controls.launchTower, moonDeck: controls.moonDeck, volcanoVent: controls.volcanoVent,
  };
  const api = {
    lighthouses: controls.lighthouses,
    setLighthouse,
    setTowerStage: (n: number) => controls.setTowerStage(Math.max(0, Math.min(6, Math.round(n)))),
    setHouseStage,
    setFacility,
    setMailFlag,
    mailFlag: () => mailUp,
    houseStage: () => houseStage,
    towerStage: () => (typeof controls.towerStage === 'function' ? (controls.towerStage as () => number)() : 0),
    facilities: () => [...facs].filter(([, r]) => r.on).map(([id]) => id),
    positions,
  };
  const cheat = () => !!(game?.econ?.cheat ?? /[?&]cheat=1\b/.test(typeof location !== 'undefined' ? location.search : ''));
  let sync: ReturnType<typeof wireVillageSync> | null = null;
  if (game) {
    game.ext.village = api;
    sync = wireVillageSync(game as unknown as Parameters<typeof wireVillageSync>[0], {
      lighthouseIds: Object.keys(controls.lighthouses),
      setLighthouse, setTowerStage: api.setTowerStage, setHouseStage, setFacility,
    }, { cheat });
  } else if (cheat()) {
    for (const id of FACILITY_IDS) setFacilityId(id, true);
  }
  (window as unknown as { __village: unknown }).__village = {
    /** 집 단계(기본) 또는 발사탑 단계 */
    stage: (n: number, what: 'house' | 'tower' = 'house') => (what === 'tower' ? api.setTowerStage(n) : setHouseStage(n)),
    house: (n: number) => setHouseStage(n),
    tower: (n: number) => api.setTowerStage(n),
    light: (id: string, lit = true) => setLighthouse(id, lit),
    facility: (id: string, on = true) => setFacility(id, on),
    mail: (up = true) => setMailFlag(up),
    resync: () => sync?.resync(),
    state: () => ({ house: houseStage, facilities: api.facilities(), lights: Object.fromEntries(Object.entries(controls.lighthouses).map(([k, v]) => [k, v.lit])), mail: mailUp, sync: sync?.snapshot() ?? null }),
    positions,
    /** 장소 앞으로 순간이동(점검용): 'shipyard' | 'house' | 'bridge0' | 시설 id | 'bubble:<island>' */
    goto: (name: string) => {
      if (!game) return null;
      const f = (r: number, d: number, p: XZ) => ({ x: p.x + Math.sin(r) * d, z: p.z + Math.cos(r) * d });
      let at: (XZ & { y?: number }) | null = null, look: XZ | null = null;
      if (name === 'shipyard') {
        const w = sy.walk;
        at = w ? { ...f(w.rotY, 1.6, w), y: w.y0 + w.deckY + 0.1 } : f(sy.counter.rotY, 3, sy.counter);
        look = sy.counter;
      } else if (name === 'house') { at = f(HP.rotY, 11, HP); look = HP; }
      else if (name.startsWith('bridge')) { const b = bridgePos[Number(name.slice(6)) || 0]; if (b) { at = { x: b.a.x - Math.sin(b.rot) * 3 + Math.cos(b.rot) * 5, z: b.a.z - Math.cos(b.rot) * 3 - Math.sin(b.rot) * 5 }; look = b; } }
      else if (name.startsWith('bubble:')) { const b = bubblePos[name.slice(7)]; if (b) { at = { x: b.x + 4, z: b.z + 4 }; look = b; } }
      else { const fp = facPos[name]; if (fp) { at = f(fp.rotY, 6, fp); look = fp; } }
      if (!at) return null;
      game.player.teleport(at.x, at.z, at.y);
      // 카메라가 그 장소를 보게(앞 = (-sin yaw, -cos yaw))
      if (look) game.cam.yaw = Math.atan2(-(look.x - at.x), -(look.z - at.z));
      return at;
    },
  };

  // ───────── 물리 소품(굴러가는 공·상자·통·부표) — 게임에서만, 청크 스트리밍 ─────────
  if (game) {
    const W = sy.warehouse, C = sy.counter;
    setupPhysProps(ctx, game, mats, [
      { x: (W.x + C.x) / 2, z: (W.z + C.z) / 2, r: 3.5, kinds: ['crate', 'barrel', 'crate'], water: false, avoid: [{ x: W.x, z: W.z, r: 3.4 }, { x: C.x, z: C.z, r: 2.2 }] },
      { x: sy.boatSpawn.x, z: sy.boatSpawn.z, r: 9, kinds: ['buoy', 'tube', 'buoy'], water: true, avoid: [{ x: sy.boatSpawn.x, z: sy.boatSpawn.z, r: 3 }] },
    ]);
  }
  return out;
}
