// islanddev — 섬 개발 5단계(GDD 4.7): ① 등대 복구 → ② 부두·다리(지름길) → ③ 섬 특산 시설 → ④ 주민 이주 → ⑤ 섬 별 5개.
// 섬마다 기부함(E → 'dev' 창). 단계가 오르면 dev:<섬>:<n> 해금 + 새 생물 1종(DEV_SPECIES, where.dev) + 새 상자 구역(econ.addChestArea)
// + dev-stage 이벤트 + 세리머니 카드. ① 은 lighthouse:<섬> 해금·lighthouse 이벤트·비눗방울 정류장·섬 지도 공개, 등대 4곳이면 facility:launch.
// ② 부두 + 섬 안 다리 2(청크로 만들고 충돌체도). ③ facility:<id> → 시설 기능(꿀·할인·반딧불·화석 감정·얼음 미끼·스키 리프트·바자르·유성우 예보).
// ④ ext.npc.moveIn(wave 5, 없으면 기다렸다가) — 이 섬 주민 부탁 2번 또는 주민 초대권. ⑤ 섬 도감 80% + 별점 5 → 섬 깃발·음악 상자·섬 전용 가구.
// 빠른 이동(주인: islanddev 하나) — 비눗방울 정류장 = 고친 등대 + 집 + 다른 모듈이 addNode 로 넣은 것(부표 우체통 등).
// 마당 꾸미기(주인: islanddev 하나) — 섬마다 12 m 마당(말랑섬은 집 옆), 격자 0.5 m: 울타리·꽃밭·돌길·가로등·연못(물고기 놓아주기)·
// 공룡 울타리(아기 공룡)·반딧불 풀숲(반딧불 놓아주기)·가방 가구. 섬 별점 = 도감% × 0.6 + 꾸미기% × 0.4 → 별 1~5(칩으로 보인다).
//
// game.ext.travel (주인: islanddev) = {
//   addNode(id, x, z, kind, label)   정류장 넣기(같은 id 면 바꿈, flags.dev.travel 에 저장)   removeNode(id)
//   nodes(): TravelNode[]            go(id): boolean(비눗방울 타고 이동)   riding(): boolean
// }
// game.ext.dev (주인: islanddev) = {
//   stage(island) 0..5 · stages() · requirement(island) · invest(island) · rating(island) {dexPct, deco, stars …} · open(island)
//   bonus(name): 'honey'|'diving'|'firefly'(밤 반딧불 배율 2)|'fossil'|'icehole'|'skilift'|'potion'|'bazaar'|'meteor' → number(0 = 없음)
//   discount(shop): 0..1(단골 할인 비율 — 'buy' 뒤에 돌려준다)   appraise(fosId?): 화석 감정   facilityOn(id)
//   sites(): 기부함·마당·정류장 자리   yard(island): 조각 목록   piers(): ② 부두 끝 [{island, x, z, rotY}]   gated(): where.dev 를 단 종
// }
// flags.dev = { v, stage{섬:n}, rewarded, req{섬:부탁 수}, moveIn{섬:{npc, done}}, travel{nodes[]}, yard{섬:조각[]}, daily, appraised }
// 이벤트: dev-stage{island, stage} · lighthouse{island, lit} · place{item, where} · release{species, n, where}(econ.release 가 없을 때)
// 디버그: window.__islanddev = { state(), stage(island, n), fund(island), invest(island), req(island), rating(island), open(island),
//          goto(what), travel{nodes, go, add}, place(k, island?, cx, cz, r?, item?), release(island), lift(), forecast(), appraise(), sites(), refresh() }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Cost, EconApi, Landmark } from '../core/api';
import { PLACES, islandName as coreIslandName, worldRivers, islandProfiles, type IslandDef } from '../core/world';
import { applyCurve } from '../core/curve';
import { breathe } from '../core/art';
import { MAT, GOODS, SHOP_ITEMS } from './economy/data';
import {
  DEV_ISLANDS, STAGES, DEV_SPECIES, CHEST_AREAS, STAR5_FURNITURE, STAR5_STARS, ISLAND_FLAG, MUSIC_BOX_TUNES, FACILITY_BY_ID,
  SHOP_DISCOUNT, DAILY_HONEY, DAILY_BAIT, APPRAISE_COST, APPRAISE_LUCK, LAUNCH_LIGHTHOUSES, YARD_DEFS, YARD_FURNITURE, YARD_HALF, YARD_CELL,
  YARD_POND_MAX, YARD_FIREFLY_MAX, NODE_ICON, INVITE_ITEM, MOVEIN_REQUESTS, devKey, parseDevKey, chestAreaId, specialtyIds, facilitiesOf, isDevIsland,
  type DevIsland, type StageN, type YardKind, type FacilityId,
} from './islanddev/data';
import {
  normalizeFlags, stageOf, requirementFor, islandDexPct, decoScore, decoPct, islandRating, starText, TravelNet, riverSpan, gapSpans, pierSpan,
  pieceCenter, yardToWorld, worldToYard, nextPieceId, canPlace,
  type DevFlags, type Requirement, type Span, type TerrainProbe, type TravelNode, type YardPiece,
} from './islanddev/logic';
import { Builder, setNight, disposeTree } from './islanddev/kit';
import {
  addDevBox, devBoxLabel, addBubbleStop, addIslandFlag, addMusicBox, addSpan, addYardPiece, addYardSign, yardSignLabel, miniFish, babyDino, fireflyPoints, animateFireflies,
  type SpanCol,
} from './islanddev/models';
import { Rides } from './islanddev/travel';
import { YardEditor } from './islanddev/yard';
import { devPanel, travelPanel, yardPanel, type DevView, type RatingView } from './islanddev/panel';

export const order = 47;

type XZ = { x: number; z: number };
interface Site {
  island: DevIsland;
  /** 기부함 자리(앞 = rotY) */
  box: XZ & { rotY: number; y: number };
  /** 비눗방울 정류장(등대 옆) — 여기가 정류장 */
  station: XZ;
  /** 비눗방울 내릴 자리(정류장 옆 평지) */
  land: XZ;
  /** 마당 가운데·돌림 */
  yard: XZ & { rot: number; y: number };
}
interface VillageApi {
  setLighthouse?(id: string, lit: boolean): void;
  setFacility?(id: string, on: boolean): void;
  positions?: { bubbles?: Record<string, XZ>; lighthouses?: Record<string, XZ & { lit?: boolean }>; facilities?: Record<string, XZ & { rotY?: number }>; house?: XZ & { rotY?: number } };
}
interface NpcApi {
  list?(): Array<{ id: string; name?: string; island?: string; kind?: string }>;
  moveIn?(id: string, island: string): unknown;
  candidates?(island: string): string[];
  name?(id: string): string | null;
}

/** 청크 안 그릇(단계가 바뀌면 다시 채운다) */
interface Live { group: THREE.Group; x0: number; z0: number; size: number; bodies: Array<{ remove(): void }>; anims: Anim[] }
type Anim =
  | { kind: 'fish'; o: THREE.Object3D; c: XZ; y: number; r: number; ph: number; sp: number }
  | { kind: 'dino'; o: THREE.Object3D; c: XZ; y: (x: number, z: number) => number; r: number; ph: number; rot: number }
  | { kind: 'ff'; o: THREE.Points; mul: number };

const CHUNK = 128;
const FAR = new THREE.Vector3(0, -9999, 0);

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const st = game.state;
  const I = ctx.island;
  const H = (x: number, z: number) => I.heightAt(x, z);
  const econ = () => (game.econ as EconApi | null) ?? null;
  const p0 = () => econ()?.p0 ?? true;
  const village = () => (game.ext.village as VillageApi | undefined) ?? null;
  const npc = () => (game.ext.npc as NpcApi | undefined) ?? null;
  const toast = (t: string) => { try { game.ui.toast(t); } catch { /* UI 없는 환경 */ } };
  const emit = (type: string, extra: Record<string, unknown> = {}) => st.emit({ type, ...extra });
  const save = () => st.save();
  const day = () => Math.floor(econ()?.day() ?? game.env?.day ?? 0);

  // ── 저장 ──
  let fl: DevFlags = normalizeFlags(st.flags);
  const F = (): DevFlags => (st.flags.dev === (fl as unknown) ? fl : (fl = normalizeFlags(st.flags)));
  const stage = (isl: string) => stageOf(F(), isl);
  const net = () => new TravelNet(F().travel.nodes);

  const root = new THREE.Group();
  root.name = 'islanddev';
  root.userData.world = 'earth';

  // ── 이름·아이콘 ──
  const islandName = (id: string) => { try { return game.geo?.islandName(id) ?? coreIslandName(id); } catch { return coreIslandName(id); } };
  const itemName = (id: string) => MAT.get(id)?.name ?? GOODS[id]?.name ?? st.species.get(id)?.name ?? id;
  const itemIcon = (id: string) => MAT.get(id)?.icon ?? GOODS[id]?.icon ?? '🎁';
  const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—');
  const islandColor = (id: string) => ISLAND_FLAG[id as DevIsland]?.[0] ?? '#7fd18b';
  const def = (id: string) => I.islandById(id) as IslandDef | undefined;

  // ───────────── 땅 판정 · 자리 찾기 ─────────────
  const dryAt = (x: number, z: number) => H(x, z) > 0.3 && !Number.isFinite(I.waterLevelAt(x, z));
  const onIsland = (isl: string, x: number, z: number) => I.islandAt(x, z)?.id === isl;
  const flatAt = (x: number, z: number, r: number, maxD: number) => {
    const h0 = H(x, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      for (const rr of [r * 0.5, r]) {
        const xx = x + Math.cos(a) * rr, zz = z + Math.sin(a) * rr;
        if (!dryAt(xx, zz) || Math.abs(H(xx, zz) - h0) > maxD) return false;
      }
    }
    return dryAt(x, z);
  };
  /** 피할 자리(마을 건물·시설·등대·부두) */
  const reserved: Array<XZ & { r: number }> = [];
  const addReserved = (p: XZ | undefined | null, r: number) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) reserved.push({ x: p.x, z: p.z, r }); };
  {
    for (const k of ['shop', 'museum', 'workbench', 'townBoard', 'pier', 'boatDock', 'bikeRack'] as const) addReserved(PLACES[k], 7);
    try { addReserved(PLACES.house, 11); addReserved(PLACES.mailbox, 3); addReserved(PLACES.shipyard, 16); addReserved(PLACES.pengLab, 10); } catch { /* 지형 자리 계산 실패 */ }
    for (const d of Object.values(PLACES.docks)) addReserved(d, 12);
    try { for (const f of Object.values(PLACES.facilities)) addReserved(f, 11); } catch { /* 없음 */ }
    try { for (const l of Object.values(PLACES.lighthouses)) addReserved(l, 7); } catch { /* 없음 */ }
    try { for (const b of PLACES.bridges) addReserved(b, 9); } catch { /* 없음 */ }
    addReserved(PLACES.launchPad, 22);
    // 룩 테스트 장면 주인공·상자·주민·낚시 자리(첫 화면을 가리지 않게)
    for (const p of [I.HERO.player, I.HERO.chest, I.HERO.villager, I.HERO.fishing, I.HERO.seaFishing]) addReserved(p, 4.5);
  }
  // 다른 모듈이 차지한 자리(엔진 scatter 등록 — 룩 테스트 마을 집·나무·소품)
  const occupied = ((game.engine as unknown as { occupied?: Array<XZ & { r: number }> }).occupied) ?? [];
  const free = (x: number, z: number, r: number, extra: Array<XZ & { r: number }> = []) =>
    !reserved.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r) && !extra.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r)
    && !occupied.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < (q.r + r * 0.6) ** 2);
  /** near 둘레 rMin..rMax 에서 평평한 빈 땅(가까운 순) */
  const findFlat = (isl: string, near: XZ, rMin: number, rMax: number, r: number, maxD: number, extra: Array<XZ & { r: number }> = [], ok?: (x: number, z: number) => boolean): XZ | null => {
    for (let rr = rMin; rr <= rMax; rr += 1.5) {
      const n = Math.max(8, Math.round((rr * Math.PI * 2) / 2.5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rr * 0.37;
        const x = near.x + Math.cos(a) * rr, z = near.z + Math.sin(a) * rr;
        if (!onIsland(isl, x, z) || !free(x, z, r, extra) || !flatAt(x, z, r, maxD) || (ok && !ok(x, z))) continue;
        return { x: +x.toFixed(2), z: +z.toFixed(2) };
      }
    }
    return null;
  };

  // ───────────── 섬마다 자리(처음 필요할 때 한 번) ─────────────
  const sites = new Map<DevIsland, Site | null>();
  const site = (isl: DevIsland): Site | null => {
    if (sites.has(isl)) return sites.get(isl)!;
    let s: Site | null = null;
    try { s = computeSite(isl); } catch (e) { console.error('[islanddev] 자리 계산', isl, e); }
    sites.set(isl, s);
    if (s) for (const p of [s.box, s.yard]) reserved.push({ x: p.x, z: p.z, r: p === s.yard ? YARD_HALF * YARD_CELL * 1.45 : 3 });
    return s;
  };
  const computeSite = (isl: DevIsland): Site | null => {
    const d = def(isl);
    if (!d) return null;
    const V = village()?.positions;
    const lh = V?.lighthouses?.[isl] ?? (PLACES.lighthouses as Record<string, XZ>)[isl];
    const station: XZ = V?.bubbles?.[isl] ?? (lh ? { x: lh.x + 10, z: lh.z } : { x: d.x, z: d.z });
    const extra = [{ ...station, r: 3 }];
    // 기부함: 말랑섬은 마을 게시판 근처(처음부터 보이게), 다른 섬은 정류장 옆
    const boxNear = isl === 'home' ? PLACES.townBoard : station;
    // 기준점에서 물을 건너지 않고 걸어갈 수 있는 자리(곧은 줄이 다 마른 땅)
    const h0 = H(boxNear.x, boxNear.z);
    const walk = (x: number, z: number) => {
      if (Math.abs(H(x, z) - h0) > 0.7) return false;
      for (let t = 0.1; t < 1; t += 0.1) { const xx = boxNear.x + (x - boxNear.x) * t, zz = boxNear.z + (z - boxNear.z) * t; if (!dryAt(xx, zz) || Math.abs(H(xx, zz) - h0) > 0.9) return false; }
      return true;
    };
    const boxP = findFlat(isl, boxNear, isl === 'home' ? 6 : 4, 30, 1.1, 0.35, extra, walk) ?? findFlat(isl, boxNear, 4, 30, 1.1, 0.35, extra) ?? { x: boxNear.x + 4, z: boxNear.z };
    const toC = Math.atan2(d.x - boxP.x, d.z - boxP.z);
    // 앞이 정류장(말랑섬은 섬 가운데 반대쪽 = 바다 쪽 광장)을 보게
    const look = isl === 'home' ? Math.atan2(PLACES.townBoard.x - boxP.x, PLACES.townBoard.z - boxP.z) : Math.atan2(station.x - boxP.x, station.z - boxP.z);
    const box = { ...boxP, rotY: Number.isFinite(look) ? look : toC, y: H(boxP.x, boxP.z) };
    extra.push({ ...boxP, r: 2.5 });
    const land = findFlat(isl, station, 2.6, 9, 0.8, 0.6, extra) ?? { x: station.x + 3, z: station.z };
    // 마당: 말랑섬은 집 옆, 다른 섬은 기부함 근처
    const yardNear = isl === 'home' ? (V?.house ?? PLACES.house) : boxP;
    const half = YARD_HALF * YARD_CELL;
    const yp = findFlat(isl, yardNear, isl === 'home' ? 14 : 10, 70, half * 1.2, 1.1, extra) ?? findFlat(isl, yardNear, 8, 120, half, 1.6, extra) ?? { x: yardNear.x + 14, z: yardNear.z };
    const yRot = Math.round(Math.atan2(boxP.x - yp.x, boxP.z - yp.z) / (Math.PI / 2)) * (Math.PI / 2);
    return { island: isl, box, station, land, yard: { ...yp, rot: Number.isFinite(yRot) ? yRot : 0, y: H(yp.x, yp.z) } };
  };
  /** 플레이어가 그 섬 가까이(섬 반경 + 300 m) 있을 때만 자리를 계산한다 */
  const siteIfNear = (isl: DevIsland): Site | null => {
    if (sites.has(isl)) return sites.get(isl)!;
    const d = def(isl);
    if (!d || game.world !== 'earth') return null;
    const p = game.player.pos;
    return Math.hypot(p.x - d.x, p.z - d.z) < d.r + 300 ? site(isl) : null;
  };

  // ───────────── 지름길(부두 + 다리 2) ─────────────
  const spanCache = new Map<DevIsland, Span[]>();
  const probe = (isl: string): TerrainProbe => ({ h: H, water: (x, z) => I.waterLevelAt(x, z), dry: (x, z) => dryAt(x, z) && onIsland(isl, x, z) });
  const spans = (isl: DevIsland): Span[] => {
    const hit = spanCache.get(isl);
    if (hit) return hit;
    const out: Span[] = [];
    const s = site(isl), d = def(isl);
    if (!s || !d) { spanCache.set(isl, out); return out; }
    const T = probe(isl);
    try {
      // 부두: 정류장 근처 해안에서 바다로
      const lh = village()?.positions?.lighthouses?.[isl] ?? (PLACES.lighthouses as Record<string, XZ>)[isl];
      const pier = pierSpan(s.station, d, T, 16, [...(lh ? [{ ...lh, r: 9 }] : []), { ...s.station, r: 4 }, { ...s.box, r: 3 }, { ...s.yard, r: YARD_HALF * YARD_CELL * 1.5 }]);
      if (pier) out.push(pier);
      // 다리: 섬의 강 위 → 모자라면 골짜기·물웅덩이 지름길
      const avoid: Array<XZ & { r: number }> = [...reserved.map((q) => ({ ...q, r: q.r + 8 }))];
      const bridges: Span[] = [];
      const rivers = worldRivers().filter((r) => r.island === isl).sort((a, b) => b.pts.length - a.pts.length);
      for (const rv of rivers) for (const frac of [0.38, 0.66]) {
        if (bridges.length >= 2) break;
        const sp = riverSpan(rv.pts, rv.halfW, frac, T);
        if (!sp) continue;
        const m = { x: (sp.ax + sp.bx) / 2, z: (sp.az + sp.bz) / 2 };
        if (avoid.some((q) => Math.hypot(q.x - m.x, q.z - m.z) < q.r) || bridges.some((b) => Math.hypot((b.ax + b.bx) / 2 - m.x, (b.az + b.bz) / 2 - m.z) < 60)) continue;
        bridges.push(sp);
      }
      if (bridges.length < 2) {
        const more = gapSpans({ x: d.x, z: d.z, r: d.r }, T, ctx.rng(`islanddev:gap:${isl}`), {
          count: 2 - bridges.length,
          avoid: [...avoid, ...bridges.map((b) => ({ x: (b.ax + b.bx) / 2, z: (b.az + b.bz) / 2, r: 60 }))],
        });
        bridges.push(...more);
      }
      out.push(...bridges);
    } catch (e) { console.error('[islanddev] 지름길 찾기', isl, e); }
    spanCache.set(isl, out);
    return out;
  };

  // ───────────── 시설 ─────────────
  const facilityPos = (id: FacilityId): (XZ & { rotY: number }) | null => {
    const V = village()?.positions?.facilities?.[id];
    if (V) return { x: V.x, z: V.z, rotY: V.rotY ?? 0 };
    try { const p = (PLACES.facilities as Record<string, XZ & { rotY: number }>)[id]; return p ? { x: p.x, z: p.z, rotY: p.rotY } : null; } catch { return null; }
  };
  const facilityOn = (id: string) => {
    const f = FACILITY_BY_ID.get(id as FacilityId);
    if (!f) return false;
    return stage(f.island) >= 3 || !!econ()?.isUnlocked(`facility:${id}`);
  };
  const bonus = (name: string): number => {
    switch (name) {
      case 'honey': return facilityOn('apiary') ? DAILY_HONEY.n : 0;
      case 'diving': return facilityOn('divingCenter') ? SHOP_DISCOUNT.diving.rate : 0;
      case 'firefly': return facilityOn('fireflyGarden') ? 2 : 0;
      case 'fossil': return facilityOn('fossilLab') ? 1 : 0;
      case 'icehole': return facilityOn('iceHut') ? 1 : 0;
      case 'skilift': return facilityOn('skiLift') ? 1 : 0;
      case 'potion': return facilityOn('potionShop') ? SHOP_DISCOUNT.potion.rate : 0;
      case 'bazaar': return facilityOn('bazaar') ? SHOP_DISCOUNT.bazaar.rate : 0;
      case 'meteor': return facilityOn('observatory') ? 1 : 0;
      default: return 0;
    }
  };
  const discount = (shop: string) => { const d = SHOP_DISCOUNT[shop]; return d && facilityOn(d.facility) ? d.rate : 0; };

  // ───────────── 섬 도감 · 꾸미기 · 별점 ─────────────
  let ratingDirty = true;
  const ratingCache = new Map<string, RatingView>();
  const dinoFriend = () => {
    const h = (st.flags.dino as { hearts?: Record<string, number> } | undefined)?.hearts;
    if (h && Object.values(h).some((v) => typeof v === 'number' && v > 0)) return true;
    const keys = (econ()?.flags() as { unlocks?: string[] } | undefined)?.unlocks;
    return Array.isArray(keys) && keys.some((k) => k.startsWith('dino:'));
  };
  /** 말랑섬 꾸미기에 집 점수(interiors, 0~500+)를 조금 얹는다: 50점마다 +1, 최대 +10 */
  const houseBonus = () => {
    const ext = game.ext.interiors as { house?: { score?: () => { score?: number } | number } } | undefined;
    let raw: unknown;
    try { const v = ext?.house?.score?.(); raw = typeof v === 'number' ? v : v?.score; } catch { raw = undefined; }
    raw ??= (st.flags.interiors as { score?: number } | undefined)?.score;
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(10, Math.floor(raw / 50)) : 0;
  };
  const rating = (isl: string): RatingView => {
    if (ratingDirty) { ratingCache.clear(); ratingDirty = false; }
    const hit = ratingCache.get(isl);
    if (hit) return hit;
    const dx = islandDexPct(isl, st.species.values(), (id) => !!st.dex[id]);
    const deco = decoScore(F().yard[isl] ?? [], { dinoFriend: dinoFriend(), bonus: isl === 'home' ? houseBonus() : 0 });
    const r = islandRating(dx.pct, deco);
    const v: RatingView = { got: dx.got, total: dx.total, dexPct: dx.pct, deco, decoPct: decoPct(deco), score: r.score, stars: r.stars };
    ratingCache.set(isl, v);
    return v;
  };
  st.on((e) => { if (e.type === 'collect' || e.type === 'register' || e.type === 'place' || e.type === 'release' || e.type === 'befriend' || e.type === 'house-score') ratingDirty = true; });

  // ───────────── 단계 조건 ─────────────
  const count = (id: string) => Math.max(0, st.bag[id] ?? 0);
  const requirement = (isl: string): Requirement => {
    const rt = rating(isl);
    return requirementFor(isl, stage(isl), {
      p0: p0(), coins: st.coins, count, specialty: specialtyIds(isl), dexPct: rt.dexPct, stars: rt.stars, reqDone: F().req[isl] ?? 0, name: itemName,
    }, (id) => MAT.get(id)?.price ?? 0);
  };

  // ───────────── 단계 효과 ─────────────
  const hasKey = (key: string) => { const u = (econ()?.flags() as { unlocks?: string[] } | undefined)?.unlocks; return Array.isArray(u) ? u.includes(key) : !!econ()?.isUnlocked(key); };
  const unlockKey = (key: string) => { const E = econ(); if (E && !hasKey(key)) E.unlock(key, 'islanddev'); };

  const lighthouseNode = (isl: DevIsland) => {
    const s = site(isl);
    if (!s) return;
    net().add({ id: `lh:${isl}`, x: s.station.x, z: s.station.z, kind: 'lighthouse', label: `${islandName(isl)} 등대` });
    landing.set(`lh:${isl}`, s.land);
    save();
  };
  const checkLaunch = () => {
    const lit = DEV_ISLANDS.filter((i) => stage(i) >= 1).length;
    if (lit >= LAUNCH_LIGHTHOUSES) unlockKey('facility:launch');
  };
  /** 단계마다 새 상자 구역 */
  const chestArea = (isl: DevIsland, n: StageN) => {
    const E = econ();
    if (!E?.addChestArea) return;
    const s = site(isl);
    if (!s) return;
    let at: XZ = s.box;
    if (n === 2) { const b = spans(isl).find((q) => q.kind !== 'pier'); if (b) at = { x: (b.ax + b.bx) / 2, z: (b.az + b.bz) / 2 }; }
    else if (n === 3) { const f = facilitiesOf(isl)[0]; const p = f ? facilityPos(f.id) : null; if (p) at = p; }
    else if (n === 4) at = s.yard;
    else if (n === 5) {
      const d = def(isl)!;
      at = findFlat(isl, { x: d.x, z: d.z }, 0, d.r * 0.6, 4, 2.5) ?? s.yard;
    }
    const a = CHEST_AREAS[n];
    try { E.addChestArea({ id: chestAreaId(isl, n), island: isl, x: at.x, z: at.z, r: a.r, n: a.n, tier: a.tier }); } catch (e) { console.error('[islanddev] 상자 구역', e); }
  };

  /** 단계 적용 — fresh = 지금 막 끝냄(이벤트·보상·세리머니), 아니면 다시 불러오기(조용히, 멱등) */
  const applyStage = (isl: DevIsland, n: StageN, fresh: boolean) => {
    unlockKey(devKey(isl, n));
    if (n === 1) {
      unlockKey(`lighthouse:${isl}`);
      village()?.setLighthouse?.(isl, true);
      if (!net().has(`lh:${isl}`)) lighthouseNode(isl);
      else { const s = site(isl); if (s) landing.set(`lh:${isl}`, s.land); }
      if (fresh) emit('lighthouse', { island: isl, lit: true });
      checkLaunch();
    } else if (n === 3) {
      for (const f of facilitiesOf(isl)) { unlockKey(`facility:${f.id}`); village()?.setFacility?.(f.id, true); }
    } else if (n === 4) {
      F().moveIn[isl] ??= { npc: null, done: false };
    } else if (n === 5 && !F().rewarded[`${isl}:5`] && (fresh || econ())) {
      // 여러 단계를 한 번에 건너뛰었거나(reconcile) 다시 불러올 때도 ⑤ 보상은 한 번은 준다(rewarded 로 멱등)
      F().rewarded[`${isl}:5`] = day() + 1;
      const E = econ();
      const fur = STAR5_FURNITURE[isl];
      if (E) { E.give(fur, 1, 'islanddev'); E.addStars(STAR5_STARS, 'islanddev'); } else st.addItem(fur, 1);
    }
    chestArea(isl, n);
    if (fresh) {
      emit('dev-stage', { island: isl, stage: n });
      ceremony(isl, n);
    }
    ratingDirty = true;
    refreshIsland(isl);
    save();
  };
  const complete = (isl: DevIsland, n: StageN, fresh: boolean) => {
    const f = F();
    const before = stageOf(f, isl);
    if (n <= before) return;
    for (let k = (before + 1) as StageN; k <= n; k = (k + 1) as StageN) {
      f.stage[isl] = k;
      applyStage(isl, k, fresh && k === n);
      // 한 번에 여러 단계를 넘어도 등대 불 켜기는 알린다(메타·마을이 듣는다)
      if (fresh && k === 1 && n > 1) emit('lighthouse', { island: isl, lit: true });
    }
    save();
  };

  /** 세리머니 카드 + 소리 */
  const ceremony = (isl: DevIsland, n: StageN) => {
    const S = STAGES[n];
    const sp = st.byGdd(DEV_SPECIES[isl][n]);
    const extra: string[] = [];
    if (n === 1) extra.push('🫧 비눗방울 정류장이 생겼어요', '🗺️ 섬 지도가 밝아졌어요');
    if (n === 2) extra.push('⚓ 부두에 배를 댈 수 있어요', '🌉 지름길 다리 2개!');
    if (n === 3) for (const f of facilitiesOf(isl)) extra.push(`${f.icon} ${f.name} — ${f.bonus}`);
    if (n === 4) extra.push('🏡 새 주민이 이사 와요');
    if (n === 5) extra.push(`🚩 섬 깃발 · 🎵 음악 상자 · ${itemIcon(STAR5_FURNITURE[isl])} ${itemName(STAR5_FURNITURE[isl])} · ⭐ ${STAR5_STARS}`);
    if (sp) extra.push(`🔓 새 친구가 나타나요: ${st.dex[sp.id] ? sp.name : '???'}`);
    try {
      game.hud.card({ title: `${S.icon} ${islandName(isl)} — ${S.name} 완료!`, body: extra.join('<br>'), icon: S.icon, color: S.color, ms: 5200 });
      game.hud.banner({ text: `${islandName(isl)} 개발 ${n}단계!`, sub: starText(rating(isl).stars), icon: '🏝️', color: S.color, ms: 2600 });
    } catch { /* HUD 없음 */ }
    game.audio?.sfx('achievement');
    game.player.act('cheer', 1.6);
  };

  /** 기부(다음 단계) */
  const invest = (isl: string): boolean => {
    if (!isDevIsland(isl)) return false;
    const r = requirement(isl);
    if (!r.n) { toast('이 섬은 개발을 다 마쳤어요! 🌟'); return false; }
    if (!r.ok) { toast('아직 조금 모자라요 💦'); return false; }
    const cost: Cost = { ...(r.cost.coins ? { coins: r.cost.coins } : {}), ...(r.cost.items ? { items: r.cost.items } : {}) };
    if (cost.coins || cost.items) {
      const E = econ();
      let ok = false;
      if (E) ok = E.invest ? E.invest(isl, cost) : E.spend(cost, devKey(isl, r.n));
      else if (st.coins >= (cost.coins ?? 0)) {
        if (cost.coins) st.addCoins(-cost.coins, devKey(isl, r.n));
        for (const [k, v] of Object.entries(cost.items ?? {})) st.addItem(k, -v);
        ok = true;
      }
      if (!ok) { toast('앗, 모자라요 💦'); return false; }
    }
    complete(isl, r.n, true);
    return true;
  };

  // ───────────── 새 생물 잠그기(where.dev) ─────────────
  // 데이터 주인이 where.dev 를 아직 안 달았으면 그 섬 줄에 단다 → econ.rollCatch 가 해금 전엔 빼 준다
  const gated: string[] = [];
  for (const isl of DEV_ISLANDS) for (const n of [1, 2, 3, 4, 5] as StageN[]) {
    const sp = st.byGdd(DEV_SPECIES[isl][n]);
    if (!sp?.where?.length) continue;
    const key = devKey(isl, n);
    if (sp.where.some((w) => w.dev === key)) { gated.push(sp.id); continue; }
    let any = false;
    for (const w of sp.where) if (w.island === isl && !w.dev) { w.dev = key; any = true; }
    if (any) gated.push(sp.id);
  }

  // ───────────── 빠른 이동 ─────────────
  /** 내릴 자리(정류장마다 옆 평지 — 내가 만든 것만) */
  const landing = new Map<string, XZ>();
  const rides = new Rides(game, root, ctx.rng('islanddev:pop'));
  /** 집 앞 정류장(기부함 옆 평지 — 작은 방울 발판을 islanddev 가 세운다) */
  let homeStop: XZ | null = null;
  const homeNode = () => {
    const s = site('home');
    if (!s) return;
    homeStop ??= findFlat('home', s.box, 5, 18, 1.3, 0.35, [{ ...s.box, r: 2 }]) ?? { x: s.box.x + 6, z: s.box.z };
    net().add({ id: 'home', x: homeStop.x, z: homeStop.z, kind: 'home', label: '말랑마을 (집)' });
    landing.set('home', findFlat('home', homeStop, 2.2, 8, 0.7, 0.5, [{ ...s.box, r: 1.5 }]) ?? { x: homeStop.x + 2.2, z: homeStop.z });
    reserved.push({ ...homeStop, r: 2 });
  };
  const travel = {
    addNode: (id: string, x: number, z: number, kind = 'station', label = id) => {
      if (!id || !Number.isFinite(x) || !Number.isFinite(z)) return null;
      const n = net().add({ id: String(id), x, z, kind, label });
      save();
      return n;
    },
    removeNode: (id: string) => { const ok = net().remove(id); if (ok) save(); return ok; },
    nodes: (): TravelNode[] => net().all(),
    go: (id: string): boolean => {
      const n = net().get(id);
      if (!n) { toast('그런 정류장이 없어요'); return false; }
      const why = rides.why();
      if (why) { toast(why); return false; }
      const L = landing.get(id) ?? { x: n.x, z: n.z };
      try { game.hud.close(); } catch { /* 없음 */ }
      return rides.bubble({ x: L.x, z: L.z, label: n.label });
    },
    riding: () => rides.riding,
  };
  // 다른 모듈이 먼저 만들어 둔 임시 travel(큐)이 있으면 옮겨 담는다
  {
    const prev = game.ext.travel as { nodes?: () => TravelNode[]; queue?: TravelNode[] } | undefined;
    const pending = [...(Array.isArray(prev?.queue) ? prev!.queue : []), ...(typeof prev?.nodes === 'function' ? prev.nodes() : [])];
    for (const n of pending) if (n && typeof n.id === 'string') travel.addNode(n.id, n.x, n.z, n.kind, n.label);
  }
  game.ext.travel = travel;
  const nearNode = (): TravelNode | null => net().nearest(game.player.pos.x, game.player.pos.z, 6);

  // ───────────── 마당 ─────────────
  const yardSite = (isl: DevIsland) => { const s = site(isl); return s ? s.yard : null; };
  const pieces = (isl: string): YardPiece[] => (F().yard[isl] ??= []);
  const yardHere = (): DevIsland | null => {
    const p = game.player.pos;
    for (const isl of DEV_ISLANDS) {
      const s = sites.get(isl);
      if (!s) continue;
      const l = worldToYard(s.yard, p.x, p.z);
      if (Math.abs(l.x) < YARD_HALF * YARD_CELL + 4 && Math.abs(l.z) < YARD_HALF * YARD_CELL + 4) return isl;
    }
    return null;
  };
  const yardCost = (k: YardKind, item?: string): Record<string, number> => (k === 'furn' ? (item ? { [item]: 1 } : {}) : { ...YARD_DEFS[k].cost });
  const canAffordYard = (k: YardKind, item?: string) => {
    const c = yardCost(k, item);
    if (k === 'furn' && !item) return false;
    return Object.entries(c).every(([id, n]) => count(id) >= n);
  };
  const cellOk = new Map<string, boolean>();
  const yardEditor = new YardEditor(game, root, {
    site: (isl) => yardSite(isl),
    pieces: (isl) => pieces(isl),
    canAfford: canAffordYard,
    heightAt: H,
    toast,
    groundOk: (isl, cells) => {
      const s = yardSite(isl);
      if (!s) return false;
      for (const [cx, cz] of cells) {
        const key = `${isl}:${cx},${cz}`;
        let ok = cellOk.get(key);
        if (ok === undefined) {
          const w = yardToWorld(s, (cx + 0.5) * YARD_CELL, (cz + 0.5) * YARD_CELL);
          ok = dryAt(w.x, w.z) && Math.abs(H(w.x, w.z) - s.y) < 1.4;
          cellOk.set(key, ok);
        }
        if (!ok) return false;
      }
      return true;
    },
    place: (isl, p) => {
      const list = pieces(isl);
      if (!canPlace(list, p).ok) return false;
      const c = yardCost(p.k, p.item);
      if (Object.keys(c).length) {
        const E = econ();
        const ok = E ? E.spend({ items: c }, `yard:${isl}`) : Object.entries(c).every(([id, n]) => count(id) >= n) && (Object.entries(c).forEach(([id, n]) => st.addItem(id, -n)), true);
        if (!ok) { toast('재료가 모자라요 💦'); return false; }
      }
      const piece: YardPiece = { id: nextPieceId(list), k: p.k, cx: p.cx, cz: p.cz, r: p.r, ...(p.item ? { item: p.item } : {}) };
      list.push(piece);
      save();
      ratingDirty = true;
      emit('place', { item: p.item ?? `yard:${p.k}`, where: `yard:${isl}` });
      refreshIsland(isl);
      return true;
    },
    remove: (isl, id) => {
      const list = pieces(isl);
      const i = list.findIndex((q) => q.id === id);
      if (i < 0) return false;
      const [p] = list.splice(i, 1);
      // 재료·가구는 돌려받는다(놓아준 물고기·반딧불은 자연으로)
      const back = yardCost(p.k, p.item);
      for (const [k, n] of Object.entries(back)) { const E = econ(); if (E) E.give(k, n, 'yard', { silent: true }); else st.addItem(k, n); }
      save();
      ratingDirty = true;
      toast(`🧹 ${p.item ? itemName(p.item) : YARD_DEFS[p.k].name} 치웠어요`);
      refreshIsland(isl);
      return true;
    },
  });

  /** 물고기·반딧불 놓아주기 후보 */
  const bagFish = (): string | null => {
    let best: string | null = null, bn = 0;
    for (const [id, n] of Object.entries(st.bag)) {
      if (id.includes('@') || n <= 0) continue;
      const s = st.species.get(id);
      if (s?.category !== 'fish') continue;
      if (n > bn) { bn = n; best = id; }
    }
    return best;
  };
  const isGlowBug = (id: string) => {
    const s = st.species.get(id);
    if (!s || s.category !== 'bug') return false;
    return !!s.tags?.includes('set:glow') || /firefly/.test(id) || /firefly/.test(s.gdd ?? '');
  };
  const bagGlowBug = (): string | null => {
    for (const [id, n] of Object.entries(st.bag)) if (n > 0 && !id.includes('@') && isGlowBug(id)) return id;
    return null;
  };
  const releaseInto = (isl: DevIsland, piece: YardPiece, id: string): boolean => {
    const E = econ();
    let ok: boolean;
    if (E?.release) ok = E.release(id);
    else {
      ok = count(id) > 0;
      if (ok) { st.addItem(id, -1); emit('release', { species: id, n: 1, where: `yard:${isl}` }); }
    }
    if (!ok) { toast('놓아줄 수 없어요 💦'); return false; }
    if (piece.k === 'pond') (piece.fish ??= []).push(id);
    else piece.bugs = (piece.bugs ?? 0) + 1;
    save();
    ratingDirty = true;
    // econ.release 는 제 토스트를 띄운다 — 없을 때만 우리 말로
    if (!E?.release) toast(piece.k === 'pond' ? `🐟 ${itemName(id)}를 연못에 놓아줬어요` : `✨ ${itemName(id)}가 풀숲에서 반짝여요`);
    game.audio?.sfx(piece.k === 'pond' ? 'splash' : 'shiny', { vol: 0.6 });
    refreshIsland(isl);
    return true;
  };
  game.addProvider('islanddev-release', (p) => {
    if (yardEditor.active || game.world !== 'earth') return null;
    const isl = yardHere();
    if (!isl) return null;
    const s = yardSite(isl)!;
    let best: { piece: YardPiece; d: number } | null = null;
    for (const q of pieces(isl)) {
      if (q.k !== 'pond' && q.k !== 'fireflyspot') continue;
      if (q.k === 'pond' && (q.fish?.length ?? 0) >= YARD_POND_MAX) continue;
      if (q.k === 'fireflyspot' && (q.bugs ?? 0) >= YARD_FIREFLY_MAX) continue;
      const c = pieceCenter(q), w = yardToWorld(s, c.x, c.z);
      const d = Math.hypot(w.x - p.pos.x, w.z - p.pos.z);
      if (d < 2.4 && (!best || d < best.d)) best = { piece: q, d };
    }
    if (!best) return null;
    const pc = best.piece;
    const id = pc.k === 'pond' ? bagFish() : bagGlowBug();
    if (!id) return null;
    return { id: 'islanddev-release', label: pc.k === 'pond' ? `🐟 ${itemName(id)} 놓아주기` : `✨ ${itemName(id)} 놓아주기`, dist: best.d, use: () => releaseInto(isl, pc, id) };
  });

  // ───────────── 청크: 기부함·부두·다리·깃발·음악 상자·마당·반딧불 정원 ─────────────
  const live = new Map<string, Live>();
  const near = (isl: DevIsland, x0: number, z0: number, size: number) => {
    const d = def(isl)!;
    const cx = Math.max(x0, Math.min(x0 + size, d.x)), cz = Math.max(z0, Math.min(z0 + size, d.z));
    return Math.hypot(cx - d.x, cz - d.z) < d.r + 140;
  };
  const inChunk = (L: Live, x: number, z: number) => x >= L.x0 && x < L.x0 + L.size && z >= L.z0 && z < L.z0 + L.size;
  const addCols = (L: Live, cols: SpanCol[]) => {
    for (const c of cols) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rotY);
      if (c.tiltX) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), c.tiltX));
      L.bodies.push(game.physics.addStatic({ kind: 'box', hx: c.hx, hy: c.hy, hz: c.hz }, { x: c.x, y: c.y, z: c.z }, q, 'islanddev'));
    }
  };
  const clearLive = (L: Live) => {
    for (const b of L.bodies) { try { b.remove(); } catch { /* 이미 없음 */ } }
    L.bodies = [];
    L.anims = [];
    for (const ch of [...L.group.children]) { L.group.remove(ch); disposeTree(ch); }
  };
  const fill = (L: Live) => {
    const b = new Builder();
    const extra: THREE.Object3D[] = [];
    for (const isl of DEV_ISLANDS) {
      if (!near(isl, L.x0, L.z0, L.size)) continue;
      const s = site(isl);
      if (!s) continue;
      const stg = stage(isl);
      const color = islandColor(isl);
      // 기부함(+ 간판 글씨, ⑤ 깃발·음악 상자)
      if (inChunk(L, s.box.x, s.box.z)) {
        b.setBase(s.box.x, s.box.y - 0.04, s.box.z, s.box.rotY);
        addDevBox(b, color, stg);
        if (stg >= 5) {
          const fx = s.box.x + Math.cos(s.box.rotY) * -2.0, fz = s.box.z - Math.sin(s.box.rotY) * -2.0;
          b.setBase(fx, H(fx, fz) - 0.05, fz, s.box.rotY);
          addIslandFlag(b, isl);
          const mx = s.box.x + Math.cos(s.box.rotY) * 2.4 + Math.sin(s.box.rotY) * 0.6, mz = s.box.z - Math.sin(s.box.rotY) * 2.4 + Math.cos(s.box.rotY) * 0.6;
          b.setBase(mx, H(mx, mz) - 0.02, mz, s.box.rotY);
          addMusicBox(b, color);
        }
        b.resetBase();
        const lab = devBoxLabel(islandName(isl));
        const holder = new THREE.Group();
        holder.position.set(s.box.x, s.box.y - 0.04, s.box.z);
        holder.rotation.y = s.box.rotY;
        holder.add(lab);
        extra.push(holder);
        addCols(L, [{ hx: 0.56, hy: 0.6, hz: 0.45, x: s.box.x, y: s.box.y + 0.6, z: s.box.z, rotY: s.box.rotY, tiltX: 0 }]);
      }
      // 집 앞 비눗방울 정류장
      if (isl === 'home' && homeStop && inChunk(L, homeStop.x, homeStop.z)) {
        b.setBase(homeStop.x, H(homeStop.x, homeStop.z) - 0.06, homeStop.z, 0);
        addBubbleStop(b);
        b.resetBase();
      }
      // ② 부두 + 다리
      if (stg >= 2) {
        for (const sp of spans(isl)) {
          const mx = (sp.ax + sp.bx) / 2, mz = (sp.az + sp.bz) / 2;
          if (!inChunk(L, mx, mz)) continue;
          addCols(L, addSpan(b, sp, H, color));
        }
      }
      // 마당(팻말 + 조각)
      if (inChunk(L, s.yard.x, s.yard.z)) {
        const half = YARD_HALF * YARD_CELL;
        const sg = yardToWorld(s.yard, 0, half + 0.6);
        b.setBase(sg.x, H(sg.x, sg.z) - 0.03, sg.z, s.yard.rot);
        addYardSign(b);
        b.resetBase();
        const lab = yardSignLabel();
        const holder = new THREE.Group();
        holder.position.set(sg.x, H(sg.x, sg.z) - 0.03, sg.z);
        holder.rotation.y = s.yard.rot;
        holder.add(lab);
        extra.push(holder);
        const rnd = ctx.rng(`islanddev:yard:${isl}`);
        b.setBase(s.yard.x, 0, s.yard.z, s.yard.rot);
        const hy = (lx: number, lz: number) => { const w = yardToWorld(s.yard, lx, lz); return H(w.x, w.z) - 0.02; };
        for (const p of pieces(isl)) {
          addYardPiece(b, p, hy, rnd);
          const c = pieceCenter(p), w = yardToWorld(s.yard, c.x, c.z);
          if (p.k === 'pond') {
            (p.fish ?? []).slice(0, YARD_POND_MAX).forEach((fid, i) => {
              const fsh = miniFish(st.species.get(fid)?.look?.colors?.[0] ?? ['#ffb36e', '#ff9fb8', '#8fd3ff', '#ffe58a', '#c9b8ff', '#7fe0d6'][i % 6]);
              extra.push(fsh);
              L.anims.push({ kind: 'fish', o: fsh, c: w, y: H(w.x, w.z) + 0.04, r: 0.35 + (i % 3) * 0.17, ph: i * 1.9, sp: 0.6 + (i % 2) * 0.35 });
            });
          } else if (p.k === 'dinofence' && dinoFriend()) {
            const dn = babyDino(['#9fcf5a', '#ffb36e', '#8fd3ff', '#ff9fb8'][p.id % 4]);
            extra.push(dn);
            L.anims.push({ kind: 'dino', o: dn, c: w, y: (x, z) => H(x, z) - 0.02, r: 0.7, ph: p.id * 2.3, rot: s.yard.rot });
          } else if (p.k === 'fireflyspot') {
            const pts = fireflyPoints(4 + (p.bugs ?? 0) * 4, ctx.rng(`islanddev:ff:${isl}:${p.id}`), 2.4, 1.4);
            pts.position.set(w.x, H(w.x, w.z), w.z);
            extra.push(pts);
            L.anims.push({ kind: 'ff', o: pts, mul: 1 });
          }
        }
        b.resetBase();
      }
      // ③ 반딧불 정원: 밤에 반딧불 무리(배율 2)
      if (isl === 'mushroom' && facilityOn('fireflyGarden')) {
        const fp = facilityPos('fireflyGarden');
        if (fp && inChunk(L, fp.x, fp.z)) {
          const pts = fireflyPoints(60, ctx.rng('islanddev:ffgarden'), 22, 3);
          pts.position.set(fp.x, H(fp.x, fp.z), fp.z);
          extra.push(pts);
          L.anims.push({ kind: 'ff', o: pts, mul: 2 });
        }
      }
    }
    if (b.parts.length) L.group.add(b.bake('islanddev-chunk', { shadow: true }));
    for (const o of extra) L.group.add(o);
  };
  game.chunks.add({
    key: 'islanddev-build', size: CHUNK, radius: 460, world: 'earth',
    build: ({ cx, cz, x0, z0, size }) => {
      if (!DEV_ISLANDS.some((isl) => near(isl, x0, z0, size))) return null;
      const g = new THREE.Group();
      g.name = `islanddev:${cx},${cz}`;
      const L: Live = { group: g, x0, z0, size, bodies: [], anims: [] };
      live.set(`${cx},${cz}`, L);
      g.userData.islanddevKey = `${cx},${cz}`;
      fill(L);
      return g;
    },
    dispose: (obj) => {
      const k = obj.userData.islanddevKey as string | undefined;
      const L = k ? live.get(k) : undefined;
      if (L && L.group === obj) { clearLive(L); live.delete(k!); }
      else disposeTree(obj);
    },
  });
  /** 그 섬 근처 살아 있는 청크를 다시 채운다 */
  function refreshIsland(isl: string) {
    if (!isDevIsland(isl)) return;
    for (const L of live.values()) {
      if (!near(isl, L.x0, L.z0, L.size)) continue;
      clearLive(L);
      fill(L);
      applyCurve(L.group);
    }
  }

  // ───────────── 상호작용 ─────────────
  for (const isl of DEV_ISLANDS) {
    let pos: THREE.Vector3 | null = null;
    game.addInteractable({
      id: `islanddev-box:${isl}`, radius: 2.8,
      position: () => {
        if (pos) return pos;
        const s = siteIfNear(isl);
        if (!s) return FAR;
        pos = new THREE.Vector3(s.box.x, s.box.y + 0.5, s.box.z);
        return pos;
      },
      label: () => `🏗️ ${islandName(isl)} 개발 기부함 (${stage(isl)}/5)`,
      enabled: () => game.world === 'earth',
      onUse: () => game.hud.open('dev', isl, { island: isl }),
    });
    let ypos: THREE.Vector3 | null = null;
    game.addInteractable({
      id: `islanddev-yard:${isl}`, radius: 2.6,
      position: () => {
        if (ypos) return ypos;
        const s = siteIfNear(isl);
        if (!s) return FAR;
        const sg = yardToWorld(s.yard, 0, YARD_HALF * YARD_CELL + 0.6);
        ypos = new THREE.Vector3(sg.x, H(sg.x, sg.z) + 0.6, sg.z);
        return ypos;
      },
      label: '🌷 마당 꾸미기',
      enabled: () => game.world === 'earth' && !yardEditor.active,
      onUse: () => { yardIsland = isl; game.hud.open('yard', undefined, { island: isl }); },
    });
    // ⑤ 음악 상자: 섬 가락 연주
    game.addInteractable({
      id: `islanddev-musicbox:${isl}`, radius: 2.2,
      position: () => {
        const s = sites.get(isl);
        if (!s || stage(isl) < 5) return FAR;
        return new THREE.Vector3(s.box.x + Math.cos(s.box.rotY) * 2.4 + Math.sin(s.box.rotY) * 0.6, s.box.y + 0.4, s.box.z - Math.sin(s.box.rotY) * 2.4 + Math.cos(s.box.rotY) * 0.6);
      },
      label: '🎵 음악 상자 듣기',
      enabled: () => stage(isl) >= 5,
      onUse: () => playTune(isl),
    });
  }
  let tune: { notes: number[]; i: number; t: number } | null = null;
  const playTune = (isl: DevIsland) => { tune = { notes: MUSIC_BOX_TUNES[isl], i: 0, t: 0 }; toast(`🎵 ${islandName(isl)}의 노래`); };

  // 비눗방울 정류장(등대 옆·집·부표 등 모든 정류장)
  game.addProvider('islanddev-station', (p) => {
    if (rides.riding || yardEditor.active || game.world !== 'earth') return null;
    const n = net().nearest(p.pos.x, p.pos.z, 7);
    if (!n) return null;
    const d = Math.hypot(n.x - p.pos.x, n.z - p.pos.z);
    const r = n.kind === 'buoy' ? 7 : 3.4;
    if (d > r) return null;
    return { id: 'islanddev-station', label: `🫧 비눗방울 정류장 (${n.label})`, dist: d, whileMounted: n.kind === 'buoy', use: () => game.hud.open('travel') };
  });

  // 시설 기능
  const facPoint = (fid: FacilityId, label: () => string, use: () => void, o: { radius?: number; key?: string; at?: () => XZ | null } = {}) => {
    let pos: THREE.Vector3 | null = null;
    game.addInteractable({
      id: `islanddev-fac:${fid}${o.at ? ':top' : ''}`, radius: o.radius ?? 4.6, key: o.key,
      position: () => {
        if (pos) return pos;
        const f = FACILITY_BY_ID.get(fid)!;
        const dI = def(f.island)!;
        const pp = game.player.pos;
        if (Math.hypot(pp.x - dI.x, pp.z - dI.z) > dI.r + 300) return FAR;
        const at = o.at ? o.at() : facilityPos(fid);
        if (!at) return FAR;
        pos = new THREE.Vector3(at.x, H(at.x, at.z) + 0.6, at.z);
        return pos;
      },
      label, enabled: () => game.world === 'earth' && facilityOn(fid) && !rides.riding, onUse: use,
    });
  };
  const dailyDone = (k: string) => F().daily[k] === day();
  const markDaily = (k: string) => { F().daily[k] = day(); save(); };
  facPoint('apiary', () => (dailyDone('honey') ? '🐝 오늘 꿀은 받았어요 (내일 또!)' : `🍯 오늘의 꿀 ${DAILY_HONEY.n}개 받기`), () => {
    if (dailyDone('honey')) { toast('🐝 꿀벌들이 내일 또 모아 둘게요!'); return; }
    const E = econ();
    const got = E ? E.give(DAILY_HONEY.item, DAILY_HONEY.n, 'apiary') : (st.addItem(DAILY_HONEY.item, DAILY_HONEY.n), DAILY_HONEY.n);
    if (got > 0) { markDaily('honey'); toast(`🍯 꿀 ${got}개! 달콤해요`); game.audio?.sfx('pick'); }
  }, { key: 'KeyF' });
  facPoint('iceHut', () => (dailyDone('bait') ? '🎣 오늘 미끼는 받았어요' : `🎣 얼음낚시 미끼 ${DAILY_BAIT.n}개 받기`), () => {
    if (dailyDone('bait')) { toast('🐧 내일 또 줄게요!'); return; }
    const E = econ();
    const got = E ? E.give(DAILY_BAIT.item, DAILY_BAIT.n, 'icehut') : (st.addItem(DAILY_BAIT.item, DAILY_BAIT.n), DAILY_BAIT.n);
    if (got > 0) { markDaily('bait'); toast(`🎣 ${itemName(DAILY_BAIT.item)} ${got}개 — 얼음 구멍에서 써 봐요!`); game.audio?.sfx('pick'); }
  }, { key: 'KeyF' });
  facPoint('fossilLab', () => `🔍 화석 감정하기 (🪙 ${fmt(p0() ? Math.ceil(APPRAISE_COST / 5) : APPRAISE_COST)})`, () => appraise(), { key: 'KeyF' });
  facPoint('observatory', () => '🔭 유성우 예보 보기', () => forecast(), { key: 'KeyF' });
  // 스키 리프트: 아래 타는 곳 ↔ 설산 꼭대기
  let liftTop: XZ | null = null;
  const summit = (): XZ | null => {
    if (liftTop) return liftTop;
    const pk = islandProfiles().find((q) => q.id === 'ice')?.peak;
    if (!pk) return null;
    liftTop = findFlat('ice', pk, 4, 60, 1.2, 1.2) ?? { x: pk.x, z: pk.z };
    return liftTop;
  };
  const liftPath = (up: boolean): THREE.Vector3[] | null => {
    const base = facilityPos('skiLift'), top = summit();
    if (!base || !top) return null;
    const a = up ? base : top, b = up ? top : base;
    const pts: THREE.Vector3[] = [];
    const ya = H(a.x, a.z) + 2.8, yb = H(b.x, b.z) + 2.8;
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      pts.push(new THREE.Vector3(x, Math.max(ya + (yb - ya) * t, H(x, z) + 3.6), z));
    }
    return pts;
  };
  const rideLift = (up: boolean) => {
    const pts = liftPath(up);
    if (!pts) { toast('리프트가 아직 준비 중이에요'); return false; }
    const end = pts[pts.length - 1];
    const ex = new THREE.Vector3(end.x + 1.5, H(end.x + 1.5, end.z), end.z);
    return rides.lift(pts, ex);
  };
  facPoint('skiLift', () => '🚡 스키 리프트 타고 꼭대기로', () => { rideLift(true); });
  facPoint('skiLift', () => '🚡 리프트 타고 내려가기', () => { rideLift(false); }, { radius: 4, at: () => summit() });

  // 단골 할인(다이빙 · 물약 · 바자르) — 산 뒤에 돌려준다
  const SHOP_OF = new Map(SHOP_ITEMS.map((s) => [s.id, s.shop as string]));
  st.on((e) => {
    if (e.type !== 'buy') return;
    const shop = SHOP_OF.get(String(e.id));
    if (!shop) return;
    const d = SHOP_DISCOUNT[shop];
    if (!d || !facilityOn(d.facility)) return;
    if (d.daily && dailyDone(`shop:${shop}`)) return;
    const paid = Math.abs(Number((e.cost as Cost | undefined)?.coins ?? -(Number(e.coins) || 0)) || 0);
    const back = Math.floor(paid * d.rate);
    if (back <= 0) return;
    if (d.daily) markDaily(`shop:${shop}`);
    st.addCoins(back, `islanddev:${shop}`);
    toast(`${FACILITY_BY_ID.get(d.facility)?.icon ?? '🏪'} 단골 할인! 🪙 ${fmt(back)} 돌려받았어요`);
  });

  // 화석 감정
  const appraise = (id?: string): { id: string; piece: string; dino: string; lucky: boolean } | null => {
    const fos = game.ext.fossils as { parse?: (id: string) => { dino: string; part: string } | null; skeletonOf?: (id: string) => string | null } | undefined;
    const ids = Object.keys(st.bag).filter((k) => k.startsWith('fos_') && (st.bag[k] ?? 0) > 0);
    const target = id ?? ids.find((k) => !F().appraised[k]) ?? ids[0];
    if (!target) { toast('🦴 감정할 화석 조각이 없어요. 공룡섬 X 자리를 파 봐요!'); return null; }
    const cost = p0() ? Math.ceil(APPRAISE_COST / 5) : APPRAISE_COST;
    const E = econ();
    const paid = E ? E.spend({ coins: cost }, 'appraise') : st.coins >= cost && (st.addCoins(-cost, 'appraise'), true);
    if (!paid) { toast(`🪙 ${fmt(cost)} 이 필요해요`); return null; }
    const first = !F().appraised[target];
    F().appraised[target] = day() + 1;
    save();
    const info = fos?.parse?.(target) ?? null;
    const lucky = first && ctx.rng(`islanddev:appraise:${target}`)() < APPRAISE_LUCK;
    if (lucky) E?.addKeyPiece('silver', 1);
    const sk = fos?.skeletonOf?.(target);
    const donated = sk ? !!E?.isDonated(sk) : false;
    const price = E?.priceOf(target) ?? 0;
    const PART: Record<string, string> = { skull: '머리뼈', body: '몸뼈', tail: '꼬리뼈' };
    try {
      game.hud.card({
        title: `🔍 감정 결과 — ${itemName(target)}`,
        body: [
          info ? `🦕 ${itemName(`fos_${info.dino}`) !== `fos_${info.dino}` ? itemName(`fos_${info.dino}`) : info.dino} · ${PART[info.part] ?? info.part}` : '🦴 아주 오래된 뼈 조각',
          `🪙 팔면 ${fmt(price)} 코인쯤`,
          sk ? (donated ? '🏛️ 박물관에 이미 골격이 있어요' : '🏛️ 세 조각을 모으면 박물관 골격 완성!') : '',
          lucky ? '✨ 진품 보너스! 은열쇠 조각 +1' : first ? '📜 감정서를 붙였어요' : '📜 다시 봐도 멋진 조각이에요',
        ].filter(Boolean).join('<br>'),
        icon: '🦴', color: '#7cc96b', ms: 5200,
      });
    } catch { /* HUD 없음 */ }
    return { id: target, piece: info?.part ?? '', dino: info?.dino ?? '', lucky };
  };
  // 유성우 예보(천문대)
  const forecast = () => {
    const env = game.env;
    if (!env) { toast('🔭 하늘이 흐려서 안 보여요'); return []; }
    const rows: Array<{ h: number; w: string }> = [];
    for (let h = 1; h <= 24; h++) rows.push({ h, w: env.forecast('launch', h) });
    const meteor = rows.filter((r) => r.w === 'meteor');
    const now = env.hour;
    const at = (h: number) => `${Math.floor((now + h) % 24)}시`;
    try {
      game.hud.card({
        title: '🔭 별빛 천문대 예보',
        body: meteor.length ? `☄️ 유성우가 와요! ${meteor.slice(0, 4).map((r) => at(r.h)).join(' · ')}<br>별똥별섬 크레이터에 가 봐요 ✨` : `오늘은 유성우가 없어요.<br>다음 여섯 시간: ${rows.slice(0, 6).map((r) => `${at(r.h)} ${WEATHER_ICON[r.w] ?? '☀️'}`).join(' ')}`,
        icon: '🔭', color: '#7f8cff', ms: 6000,
      });
    } catch { /* HUD 없음 */ }
    return rows;
  };
  const WEATHER_ICON: Record<string, string> = { clear: '☀️', rain: '🌧️', storm: '⛈️', fog: '🌫️', meteor: '☄️', snow: '❄️', blizzard: '🌨️', rainbow: '🌈', aurora: '🌌', sandstorm: '🏜️' };

  // ④ 주민 이주(부탁 세기 + moveIn 기다리기)
  st.on((e) => {
    if (e.type !== 'request-done' || typeof e.npc !== 'string') return;
    const row = npc()?.list?.().find((q) => q.id === e.npc);
    const isl = row?.island;
    if (!isl || !isDevIsland(isl)) return;
    F().req[isl] = (F().req[isl] ?? 0) + 1;
    save();
  });
  // 가방에서 쓴 주민 초대권(economy.useInvite → 'invite') — 이미 이사가 끝났으니 ④ 조건을 채우고 같은 섬 이주를 끝난 걸로 친다
  st.on((e) => {
    if (e.type !== 'invite') return;
    const isl = (e as { island?: unknown }).island;
    if (typeof isl !== 'string' || !isDevIsland(isl)) return;
    F().req[isl] = Math.max(F().req[isl] ?? 0, MOVEIN_REQUESTS);
    const m = F().moveIn[isl];
    if (m && !m.done) { m.done = true; const who = (e as { npc?: unknown }).npc; if (typeof who === 'string') m.npc = who; }
    save();
  });
  const pickResident = (isl: DevIsland): string | null => {
    const N = npc();
    if (!N) return null;
    const c = N.candidates?.(isl);
    if (Array.isArray(c) && c.length) return c[0];
    const taken = new Set(Object.values(F().moveIn).map((m) => m.npc).filter(Boolean));
    const list = (N.list?.() ?? []).filter((q) => q.island !== isl && !taken.has(q.id) && (!q.kind || q.kind === 'resident')).sort((a, b) => a.id.localeCompare(b.id));
    if (!list.length) return null;
    return list[Math.floor(ctx.rng(`islanddev:movein:${isl}`)() * list.length)].id;
  };
  let moveTimer = 0;
  const tryMoveIns = () => {
    const N = npc();
    if (typeof N?.moveIn !== 'function') return;
    for (const [isl, m] of Object.entries(F().moveIn)) {
      if (m.done || !isDevIsland(isl)) continue;
      m.npc ??= pickResident(isl);
      if (!m.npc) continue;
      let ok: unknown = false;
      try { ok = N.moveIn(m.npc, isl); } catch (e) { console.error('[islanddev] moveIn', e); }
      if (ok === false) continue;
      m.done = true;
      save();
      toast(`🏡 ${N.name?.(m.npc) ?? m.npc}이(가) ${islandName(isl)}로 이사 왔어요!`);
    }
  };

  // ───────────── 창 ─────────────
  let yardIsland: DevIsland | null = null;
  const view: DevView = {
    islands: DEV_ISLANDS,
    name: islandName,
    color: islandColor,
    stage,
    requirement,
    invest,
    rating,
    newSpecies: (isl, n) => {
      const sp = st.byGdd(DEV_SPECIES[isl as DevIsland]?.[n] ?? '');
      return sp ? { name: sp.name, known: !!st.dex[sp.id] } : null;
    },
    facilityOn,
    here: () => { const d = I.islandAt(game.player.pos.x, game.player.pos.z); return d && isDevIsland(d.id) ? d.id : null; },
    nodes: () => net().all(),
    nearNode,
    go: (id) => travel.go(id),
    dist: (n) => Math.hypot(n.x - game.player.pos.x, n.z - game.player.pos.z),
    yardIsland: () => yardIsland ?? yardHere(),
    pieces: (isl) => pieces(isl),
    canAfford: canAffordYard,
    costText: (k) => Object.entries(YARD_DEFS[k].cost).map(([id, n]) => `${itemIcon(id)}${n}`).join(' '),
    furniture: () => YARD_FURNITURE.filter((id) => count(id) > 0).map((id) => ({ id, n: count(id), name: itemName(id), icon: itemIcon(id) })),
    startPlace: (k, item) => { const isl = yardIsland ?? yardHere(); if (isl) yardEditor.start(isl, k, item); },
    itemName, itemIcon, fmt, toast,
  };
  game.hud.registerPanel(devPanel(view));
  game.hud.registerPanel(travelPanel(view));
  game.hud.registerPanel(yardPanel(view));
  game.hud.onChange((kind) => { if (kind !== 'yard' && !yardEditor.active) yardIsland = null; });

  // 섬 별점 칩(개발 섬 위에 있을 때)
  let chipSig = '';
  game.hud.registerChip({
    id: 'islanddev:stars', order: 34,
    render(el) { el.innerHTML = '<div class="chip dl-card" title="섬 별점 (개발 기부함 · 마당)" style="display:none"><div class="ci">🏝️</div><span class="v"></span></div>'; },
    update(el) {
      const box = el.firstElementChild as HTMLElement | null;
      if (!box) return;
      const d = game.world === 'earth' ? I.islandAt(game.player.pos.x, game.player.pos.z) : null;
      const isl = d && isDevIsland(d.id) ? d.id : null;
      const sig = isl ? `${isl}|${stage(isl)}|${rating(isl).stars}` : '';
      if (sig === chipSig) return;
      chipSig = sig;
      box.style.display = isl ? '' : 'none';
      if (isl) (box.querySelector('.v') as HTMLElement).innerHTML = `${islandName(isl)} <b style="color:#ffb51e">${starText(rating(isl).stars)}</b> <small style="opacity:.7">개발 ${stage(isl)}/5</small>`;
    },
  });

  // 지도: 정류장 · 등대를 고친 섬의 숨은 랜드마크 공개
  game.hud.registerMapLayer({
    id: 'islanddev', order: 40,
    draw(g2, toPx, scale, world) {
      if (world !== 'earth') return;
      g2.save();
      g2.textAlign = 'center';
      g2.textBaseline = 'middle';
      // 등대를 고친 섬: 아직 못 가 본 랜드마크까지 점으로
      const lms: Landmark[] = game.geo?.landmarks ?? [];
      for (const l of lms) {
        if (!isDevIsland(l.island) || stage(l.island) < 1) continue;
        let seen = true;
        try { seen = game.geo?.discovered(l.id) ?? true; } catch { seen = true; }
        if (seen) continue;
        const [x, y] = toPx(l.x, l.z);
        g2.fillStyle = '#ffffffcc';
        g2.beginPath(); g2.arc(x, y, 4, 0, Math.PI * 2); g2.fill();
        g2.fillStyle = '#a58a5e';
        g2.beginPath(); g2.arc(x, y, 2, 0, Math.PI * 2); g2.fill();
      }
      const fs = Math.max(11, Math.min(22, 18 * Math.sqrt(scale * 6)));
      g2.font = `${fs}px sans-serif`;
      for (const n of net().all()) {
        const [x, y] = toPx(n.x, n.z);
        g2.fillStyle = '#dff4ffdd';
        g2.beginPath(); g2.arc(x, y, fs * 0.62, 0, Math.PI * 2); g2.fill();
        g2.strokeStyle = '#8fd3ff'; g2.lineWidth = 2; g2.stroke();
        g2.fillText(NODE_ICON[n.kind] === '🗼' ? '🫧' : NODE_ICON[n.kind] ?? '🫧', x, y + 1);
      }
      // 섬 별점(개발을 시작한 섬)
      g2.font = `${Math.round(fs * 0.8)}px sans-serif`;
      for (const isl of DEV_ISLANDS) {
        if (stage(isl) < 1) continue;
        const d = def(isl)!;
        const [x, y] = toPx(d.x, d.z + d.r * 0.92);
        g2.fillStyle = '#ffb51e';
        g2.fillText(starText(rating(isl).stars), x, y);
      }
      g2.restore();
    },
  });

  // ───────────── 다시 불러오기 · 맞추기 ─────────────
  // 저장된 단계는 조용히 다시 적용(해금 키·정류장·상자 구역 — 멱등)
  for (const isl of DEV_ISLANDS) for (let n = 1; n <= stage(isl); n++) applyStage(isl, n as StageN, false);
  homeNode();
  /** econ 해금 목록에 dev:<섬>:<n> 이 있는데 저장 단계가 낮으면 올린다(다른 데서 열었을 때) */
  const reconcile = () => {
    const keys = (econ()?.flags() as { unlocks?: string[] } | undefined)?.unlocks;
    if (!Array.isArray(keys)) return;
    for (const k of keys) { const d = parseDevKey(k); if (d && stage(d.island) < d.n) complete(d.island, d.n, false); }
  };
  reconcile();
  st.on((e) => {
    if (e.type !== 'unlock' || e.why === 'islanddev' || typeof e.key !== 'string') return;
    const d = parseDevKey(e.key);
    if (d && stage(d.island) < d.n) complete(d.island, d.n, false);
  });

  // ───────────── 매 프레임 ─────────────
  let night = -1;
  game.onWorld((w) => { if (w !== 'earth') { rides.abort(); yardEditor.stop(); } });
  ctx.onUpdate((t, dt) => {
    rides.update(dt);
    yardEditor.update();
    // 밤 정도 → 등불·반딧불
    const tod = game.env?.tod ?? ctx.tod;
    const k = tod === 'night' ? 1 : tod === 'sunset' ? 0.55 : tod === 'morning' ? 0.15 : 0;
    if (k !== night) { night = k; setNight(k); }
    // 움직이는 마당 친구들(가까운 청크만)
    const pp = game.player.pos;
    for (const L of live.values()) {
      if (!L.anims.length) continue;
      const mx = L.x0 + L.size / 2, mz = L.z0 + L.size / 2;
      if (Math.hypot(mx - pp.x, mz - pp.z) > 180) continue;
      for (const a of L.anims) {
        if (a.kind === 'fish') {
          const ang = t * a.sp + a.ph;
          a.o.position.set(a.c.x + Math.cos(ang) * a.r, a.y + Math.sin(t * 3 + a.ph) * 0.02, a.c.z + Math.sin(ang) * a.r);
          a.o.rotation.y = -ang;
        } else if (a.kind === 'dino') {
          const ang = t * 0.35 + a.ph;
          const x = a.c.x + Math.cos(ang) * a.r, z = a.c.z + Math.sin(ang) * a.r * 0.8;
          a.o.position.set(x, a.y(x, z) + Math.abs(Math.sin(t * 4 + a.ph)) * 0.05, z);
          a.o.rotation.y = -ang + Math.PI;
          breathe(a.o, t, a.ph);
        } else {
          animateFireflies(a.o, t, Math.min(1, k * a.mul));
        }
      }
    }
    // 음악 상자 가락
    if (tune) {
      tune.t -= dt;
      if (tune.t <= 0) {
        if (tune.i >= tune.notes.length) tune = null;
        else { game.audio?.sfx('ui-click', { pitch: Math.pow(2, tune.notes[tune.i] / 12), vol: 0.8 }); tune.i++; tune.t = 0.28; }
      }
    }
    // 주민 이주 기다리기(2초마다)
    moveTimer -= dt;
    if (moveTimer <= 0) { moveTimer = 2; tryMoveIns(); }
  });
  // 등대 4곳 → 발사장(이미 고친 저장 포함)
  checkLaunch();

  // ───────────── ext.dev · 디버그 ─────────────
  game.ext.dev = {
    stage, stages: () => Object.fromEntries(DEV_ISLANDS.map((i) => [i, stage(i)])), requirement, invest, rating,
    open: (isl: string) => game.hud.open('dev', isl, { island: isl }),
    bonus, discount, appraise, facilityOn, forecast,
    sites: () => Object.fromEntries(DEV_ISLANDS.map((i) => [i, sites.get(i) ?? null])),
    yard: (isl: string) => pieces(isl).map((p) => ({ ...p })),
    species: (isl: string, n: number) => DEV_SPECIES[isl as DevIsland]?.[n as StageN] ?? null,
    gated: () => [...gated],
    /** ② 부두(배 대는 곳) — 바다 쪽 끝 자리와 방향(rotY). 단계 2 이상인 섬만 */
    piers: () => DEV_ISLANDS.filter((i) => stage(i) >= 2).flatMap((i) => spans(i).filter((q) => q.kind === 'pier').map((q) => ({ island: i, x: q.bx, z: q.bz, rotY: Math.atan2(q.bx - q.ax, q.bz - q.az) }))),
  };
  const goto = (what: string) => {
    const [kind, a, b] = what.split(':');
    const isl = (isDevIsland(a) ? a : 'home') as DevIsland;
    const s = site(isl);
    let at: XZ | null = null, look: XZ | null = null;
    if (kind === 'box' && s) { at = { x: s.box.x + Math.sin(s.box.rotY) * 3.4, z: s.box.z + Math.cos(s.box.rotY) * 3.4 }; look = s.box; }
    else if (kind === 'yard' && s) { at = yardToWorld(s.yard, 0, YARD_HALF * YARD_CELL + 2.6); look = s.yard; }
    else if (kind === 'station' && s) { at = s.land; look = s.station; }
    else if (kind === 'pier' || kind === 'bridge') {
      const list = spans(isl).filter((q) => (kind === 'pier' ? q.kind === 'pier' : q.kind !== 'pier'));
      const sp = list[Number(b) || 0];
      if (sp) { const ox = sp.az - sp.bz, oz = sp.bx - sp.ax, L = Math.hypot(ox, oz) || 1; at = { x: sp.ax + (ox / L) * 7 - (sp.bx - sp.ax) * 0.1, z: sp.az + (oz / L) * 7 - (sp.bz - sp.az) * 0.1 }; look = { x: (sp.ax + sp.bx) / 2, z: (sp.az + sp.bz) / 2 }; }
    } else if (kind === 'lift') { const f = facilityPos('skiLift'); if (f) { at = { x: f.x + 3, z: f.z + 3 }; look = f; } }
    else if (kind === 'summit') { at = summit(); }
    else if (kind === 'fac') { const f = facilityPos(a as FacilityId); if (f) { at = { x: f.x + Math.sin(f.rotY) * 4, z: f.z + Math.cos(f.rotY) * 4 }; look = f; } }
    if (!at) return null;
    game.player.teleport(at.x, at.z);
    if (look) { game.player.yaw = Math.atan2(at.x - look.x, at.z - look.z); game.cam.yaw = game.player.yaw; }
    return at;
  };
  (globalThis as unknown as { __islanddev: unknown }).__islanddev = {
    state: () => ({
      stage: Object.fromEntries(DEV_ISLANDS.map((i) => [i, stage(i)])),
      rating: Object.fromEntries(DEV_ISLANDS.map((i) => [i, rating(i)])),
      nodes: net().all(), yard: Object.fromEntries(DEV_ISLANDS.map((i) => [i, pieces(i).length])),
      moveIn: { ...F().moveIn }, req: { ...F().req }, riding: rides.riding, placing: yardEditor.active, gated: gated.length, live: live.size,
    }),
    stage: (isl: string, n: number) => { if (isDevIsland(isl)) complete(isl, Math.max(1, Math.min(5, n)) as StageN, true); return stage(isl); },
    /** 다음 단계 비용을 가방·지갑에 넣어 준다(점검용) */
    fund: (isl: string) => {
      const r = requirement(isl);
      if (!r.n) return null;
      const E = econ();
      if (r.cost.coins) st.addCoins(r.cost.coins, 'debug');
      for (const l of r.lines) {
        if (l.id === 'coins' || l.ok) continue;
        if (l.id === 'specialty') { const id = specialtyIds(isl)[0]; if (id) E ? E.give(id, l.need, 'debug', { silent: true }) : st.addItem(id, l.need); }
        else if (l.id.startsWith('it_') && !(l.alt && r.lines.some((q) => q.alt === l.alt && q.ok))) E ? E.give(l.id, l.need - l.have, 'debug', { silent: true }) : st.addItem(l.id, l.need - l.have);
      }
      return requirement(isl);
    },
    invest, req: requirement, rating, open: (isl: string) => game.hud.open('dev', isl, { island: isl }),
    goto,
    travel: { nodes: () => net().all(), go: travel.go, add: travel.addNode },
    place: (k: YardKind, isl: string = yardHere() ?? 'home', cx = 0, cz = 0, r = 0, item?: string) => {
      if (!isDevIsland(isl)) return false;
      const list = pieces(isl);
      const p = { k, cx, cz, r, ...(item ? { item } : {}) };
      if (!canPlace(list, p).ok) return false;
      list.push({ id: nextPieceId(list), ...p });
      save(); ratingDirty = true; refreshIsland(isl);
      return true;
    },
    release: (isl: string = yardHere() ?? 'home', fish = true) => {
      if (!isDevIsland(isl)) return false;
      const pc = pieces(isl).find((q) => q.k === (fish ? 'pond' : 'fireflyspot'));
      const id = fish ? bagFish() : bagGlowBug();
      return pc && id ? releaseInto(isl, pc, id) : false;
    },
    lift: (up = true) => rideLift(up),
    forecast, appraise, sites: () => Object.fromEntries(DEV_ISLANDS.map((i) => [i, site(i)])), spans: (isl: string) => (isDevIsland(isl) ? spans(isl) : []),
    refresh: () => { for (const i of DEV_ISLANDS) refreshIsland(i); },
    edit: (k: YardKind | 'remove', item?: string) => { const isl = yardHere(); if (isl) yardEditor.start(isl, k, item); return isl; },
    invite: INVITE_ITEM,
  };

  return root;
}
