// 바다(GDD 2.3 · 3.3 · 3.3.1): 파도(game.ocean.waveAt) · 헤엄 체력과 둥둥 튜브 구조 · 잠수 산소 ·
// 거품 그림자 잠수 채집(econ.rollCatch, 행동 도망·숨기·톡 튐·둥실) · 재료(조개껍데기·진주·해초·산호·별가루) ·
// 산호초·해초 숲(geo.zoneAt 구역) · 난파선 꿀꺽호(은상자·금화단지·망원경·곰치) + 섬마다 작은 난파선 ·
// 수면 위 부표·갈매기·돌고래·고래(목격 인사) · 물속 화면 효과(틴트·거품·빛줄기).
//
// game.ocean(이 모듈만 쓴다): { waveAt(x,z,t) — env.waveMul 포함, stamina, staminaMax:100, oxygen, oxygenMax, swimming }
// flags.ocean: { v, jars{id:날}, caught{day,keys}, picked{day,keys}, chest{id:날}, greet{종:날} } — 옛 'ocean.jar.*' 는 옮겨 온다.
// 디버그: window.__ocean { dive(x,z), oxygen(v?), stamina(v?), rescue(), wreck(), chest(), spots(), catchNear(), greet(), zoneAt(x,z) … }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { RollQuery, RollResult, Witness } from '../core/api';
import { SHADOW_M } from '../core/api';
import { blobShadowGeometry, blobShadowMaterial, breatheScale } from '../core/art';
import { SEA_SPECIES, SEA_BY_ID, isWitness, type DiveZone, type SeaSpecies } from './ocean/data';
import { seaModel, MODEL_KEYS } from './ocean/models';
import { cuteMat, mirrorX, withEyeMarkers } from './ocean/kit';
import { critterObject, eyeRig, EyeBatch } from './ocean/critter';
import { waveAt as waveFn } from './ocean/waves';
import {
  SwimStamina, OxygenTank, oxygenMaxFor, findBeach, seaDistance, diveZoneOf, divePool, localRoll, localSize, catchDrops, harvestDrop,
  isBonusRoll, plainRoll, needsReroll, catchShowFor,
  newBeh, stepBehaviour, catchable, readOceanFlags, rollOceanDay, timeOk, STAMINA, type BehState, type DropLine,
} from './ocean/logic';
import { HeadRing, FadeOverlay, tubeGeo } from './ocean/fx';
import { buildGgulkkeok, GG_SPOTS, deckHeightLocal, ggToWorld, worldToGg } from './ocean/wreck';
import {
  oceanTime, swayMat, brainCoral, branchCoral, tubeCoral, fanCoral, tableCoral, anemone, kelp, seagrass, rock, pebble,
  decoShell, decoStar, decoUrchin, causticsMat,
} from './ocean/reef';
import { buildRiverMouth } from './ocean/mouth';
import { buoyGeo, gullBody, gullWing, dolphinGeo, whaleGeo, bubbleTexture, rayTexture, wreckGeo, jarGeo, coinPileGeo, caveGeo } from './ocean/surface';

export const order = 12;

const CORAL_COLORS = ['#ff7f9f', '#ffa66e', '#c08cff', '#ffcf4a', '#ff8fd8', '#ff6f6f', '#ffb3c9', '#ff9a5a', '#a4f07a'];
const ROCK_COLORS = ['#cdbfb0', '#b9b0c6', '#c6b49e', '#aeb8bc'];
/** 잠수로 내려갈 수 있는 가장 깊은 곳(수면 아래 m) — 꿀꺽호(−14) 갑판·바닥까지 */
const DIVE_MAX = 15;
/** 이보다 깊은 바닥은 손이 안 닿는다 → 그 자리엔 떠다니는 아이만 */
const FLOOR_REACH = -(DIVE_MAX - 0.6);
/** 잡기 손 닿는 거리(m, GDD 3.3: 1.5m 안에서 E) */
const REACH = 1.5;
/** 목격 인사 거리(m) */
const GREET_R = 12;
const JELLY_KEYS = new Set(['jelly', 'moonjelly', 'ghostjelly', 'deepcuke', 'seaangel', 'plankton']);
const GLOW_KEYS = new Set(['ghostjelly', 'plankton']);

interface Spot {
  key: string;
  x: number; z: number;
  /** 해저 높이 */
  floor: number;
  depth: number;
  zone: DiveZone;
  island: string | null;
  /** 목격 생물 자리(바다거북) — 굴리지 않는다 */
  witness?: SeaSpecies;
  sp: SeaSpecies | null;
  res: RollResult | null;
  /** 굴린 때의 시간대|날씨 — 바뀌면 안 보일 때 다시 굴린다 */
  tag: string;
  rolled: boolean;
  beh: BehState;
  rnd: () => number;
  phase: number;
  /** 떠 있는 높이(바닥 위), 빙글 반경 */
  hover: number; swimR: number; yaw: number;
  s: number;
  mesh: THREE.Mesh | null;
  model: string;
  pos: THREE.Vector3;
  dist: number;
  greeted?: boolean;
}

interface HarvestPoint { key: string; kind: 'seaweed' | 'coral'; x: number; y: number; z: number; im: THREE.InstancedMesh | null; idx: number; list: string; orig?: THREE.Matrix4 }

export default function build(ctx: Ctx) {
  const { island, game } = ctx;
  const q = new URLSearchParams(location.search);
  const root = new THREE.Group();
  root.name = 'ocean';
  root.userData.world = 'earth';

  // ───────── 재질(공유) ─────────
  const critterMat = cuteMat({ rough: 0.45, sheen: 0.7, clearcoat: 0.4, fill: 0.32 });
  const jellyMat = cuteMat({ rough: 0.3, sheen: 0.4, clearcoat: 0.6, fill: 0.4, transparent: true, opacity: 0.82 });
  const glowMat = cuteMat({ rough: 0.25, sheen: 0.2, clearcoat: 0.8, fill: 0.55 });
  const ghostMat = cuteMat({ rough: 0.25, sheen: 0.3, clearcoat: 0.7, fill: 0.75, transparent: true, opacity: 0.78 });
  const reefMat = cuteMat({ rough: 0.6, sheen: 0.6, clearcoat: 0.15, fill: 0.48 });
  const swayReef = swayMat(cuteMat({ rough: 0.6, sheen: 0.6, clearcoat: 0.1, fill: 0.25 }), 0.35, 1.5);
  const kelpMat = swayMat(cuteMat({ rough: 0.55, sheen: 0.3, clearcoat: 0.2, fill: 0.22, side: THREE.DoubleSide }), 0.05, 0.9);
  const grassMat = swayMat(cuteMat({ rough: 0.6, sheen: 0.3, clearcoat: 0.0, fill: 0.25, side: THREE.DoubleSide }), 0.35, 1.7);
  const woodMat = cuteMat({ rough: 0.75, sheen: 0.3, clearcoat: 0.0, fill: 0.18 });
  const sailMat = cuteMat({ rough: 0.9, sheen: 0.6, clearcoat: 0, fill: 0.25, side: THREE.DoubleSide });
  const metalMat = cuteMat({ rough: 0.28, sheen: 0.3, clearcoat: 0.9, fill: 0.3 });
  const caveMat = cuteMat({ rough: 0.8, sheen: 0.4, clearcoat: 0, fill: 0.28 });
  const rockMat = cuteMat({ rough: 0.85, sheen: 0.3, clearcoat: 0, fill: 0.16 });
  const caust = causticsMat();
  const matFor = (k: string) => (GLOW_KEYS.has(k) ? ghostMat : JELLY_KEYS.has(k) ? jellyMat : critterMat);

  // 공유 지오메트리
  const G = {
    brain: brainCoral(), branch: branchCoral(), tube: tubeCoral(), fan: fanCoral(), table: tableCoral(), anem: anemone(),
    kelpA: kelp(4.2), kelpB: kelp(6.5), grass: seagrass(), rock: rock(), pebble: pebble(), shell: decoShell(), star: decoStar(), urchin: decoUrchin(),
  };
  for (const g of Object.values(G)) g.userData.shared = true;

  // ───────── 강 하구 합류부(물색 블렌드 + 거품 띠) ─────────
  const mouth = buildRiverMouth(island, ctx.rng('ocean:mouth'));
  if (mouth) { root.add(mouth.group); mouth.update(0); }

  // ───────── 룩 테스트: 생물 줄 세우기(?oceanlineup=1) ─────────
  if (!game) {
    if (q.get('oceanlineup') !== '1') return mouth ? root : undefined;
    const keys = MODEL_KEYS;
    const cols = 8;
    keys.forEach((k, i) => {
      const o = critterObject(seaModel(k), matFor(k));
      const sp = SEA_SPECIES.find((s) => s.model === k);
      const big = k === 'turtle' ? 0.45 : k === 'giantclam' ? 0.75 : 1;
      o.scale.setScalar(1.6 * big * (sp?.scale ?? 1));
      const row = Math.floor(i / cols), col = i % cols;
      o.position.set(-3.8 + col * 1.1, island.heightAt(0, 0) + 0.05, -1.6 + row * 1.0);
      o.rotation.y = 0.25;
      root.add(o);
    });
    return root;
  }

  game.state.register(SEA_SPECIES);
  const st = game.state;
  let of = readOceanFlags(st.flags);
  /** flags.ocean(다른 곳에서 통째로 바뀌었으면 다시 읽는다 — 평소엔 같은 객체) */
  const OF = () => (st.flags.ocean === of ? of : (of = readOceanFlags(st.flags)));
  const dayNow = () => { try { return game.econ?.day?.() ?? game.env?.day ?? 0; } catch { return game.env?.day ?? 0; } };
  rollOceanDay(of, dayNow());
  st.save();
  const caughtToday = new Set(of.caught.keys);
  const pickedToday = new Set(of.picked.keys);
  const markCaught = (key: string) => { of = OF(); rollOceanDay(of, dayNow()); if (!of.caught.keys.includes(key)) of.caught.keys.push(key); caughtToday.add(key); st.save(); };
  const markPicked = (key: string) => { of = OF(); rollOceanDay(of, dayNow()); if (!of.picked.keys.includes(key)) of.picked.keys.push(key); pickedToday.add(key); st.save(); };

  // ───────── game.ocean ─────────
  const stamina = new SwimStamina();
  const tank = new OxygenTank();
  const isSwim = () => !game.player.mounted && (game.player.mode === 'swim' || game.player.mode === 'dive');
  const ocean = {
    /** 바다 수면 높이(env.waveMul — 폭풍 ×2 — 포함) */
    waveAt: (x: number, z: number, t: number) => waveFn(x, z, t, game.env?.waveMul ?? 1),
    get stamina() { return stamina.value; },
    staminaMax: STAMINA.max,
    get oxygen() { return tank.value; },
    get oxygenMax() { return tank.max; },
    get swimming() { return isSwim(); },
    /** 덤: 지금 잠수 중 · 구조 페이드 중 */
    get diving() { return !game.player.mounted && game.player.mode === 'dive'; },
    get rescuing() { return stamina.fading; },
  };
  game.ocean = ocean;

  // ───────── 구역 ─────────
  const VB = island.ISLAND_BOUNDS;
  const seaAt = (x: number, z: number) => {
    if (x > VB.minX - 4 && x < VB.maxX + 4 && z > VB.minZ - 4 && z < VB.maxZ + 4) return Number.isFinite(island.waterLevelAt(x, z)) && island.surfaceAt(x, z).kind !== 'river';
    return island.worldSample(x, z).coast < 0;
  };
  /** 바다 구역(geo 가 있으면 geo, 없으면 코어 표) + 섬 */
  const seaInfo = (x: number, z: number): { sea: ReturnType<typeof island.seaZoneAt>; island: string | null } => {
    try {
      const g = game.geo;
      if (g) { const zi = g.zoneAt(x, z); return { sea: zi.sea, island: zi.island }; }
    } catch { /* geo 없음 */ }
    return { sea: island.seaZoneAt(x, z), island: island.worldSample(x, z).island?.id ?? null };
  };

  // ───────── 고정 장소: 꿀꺽호 + 섬마다 작은 난파선·해저 동굴 ─────────
  const PW = island.PLACES.wreck;
  const ggBase = { x: PW.x, z: PW.z, y: Math.max(island.heightAt(PW.x, PW.z), PW.depth - 1), yaw: 0.6 };
  type Site = { kind: 'wreck' | 'cave'; x: number; z: number; y: number; rot: number; id: string };
  const sites: Site[] = [];
  const march = (x: number, z: number, dx: number, dz: number, depth: number, maxD = 700): { x: number; z: number } | null => {
    const l = Math.hypot(dx, dz);
    dx /= l; dz /= l;
    for (let d = 0; d < maxD; d += 4) {
      const px = x + dx * d, pz = z + dz * d;
      if (seaAt(px, pz) && island.heightAt(px, pz) < -depth) return { x: px, z: pz };
    }
    return null;
  };
  {
    const w0 = march(14, 30, 0.45, 1, 7.5);
    if (w0) sites.push({ kind: 'wreck', ...w0, y: island.heightAt(w0.x, w0.z), rot: 0.6, id: 'home' });
    const c0 = march(-20, 26, -0.7, 1, 9);
    if (c0) sites.push({ kind: 'cave', ...c0, y: island.heightAt(c0.x, c0.z), rot: -0.4, id: 'home' });
    const srnd = ctx.rng('ocean-sites');
    for (const d of island.ISLANDS) {
      if (d.theme === 'islet' || d.id === 'home') continue;
      const a = srnd() * Math.PI * 2;
      const w = march(d.x + Math.cos(a) * d.r * 0.8, d.z + Math.sin(a) * d.r * 0.8, Math.cos(a), Math.sin(a), 9);
      if (w) sites.push({ kind: 'wreck', ...w, y: island.heightAt(w.x, w.z), rot: srnd() * 6, id: d.id });
      const b = a + 2 + srnd() * 2;
      const c = march(d.x + Math.cos(b) * d.r * 0.8, d.z + Math.sin(b) * d.r * 0.8, Math.cos(b), Math.sin(b), 10);
      if (c) sites.push({ kind: 'cave', ...c, y: island.heightAt(c.x, c.z), rot: b + Math.PI, id: d.id });
    }
  }
  const smallWrecks = sites.filter((s) => s.kind === 'wreck');
  /** 난파선 둘레(잠수 구역 'wreck') */
  const nearWreck = (x: number, z: number) => Math.hypot(x - ggBase.x, z - ggBase.z) < 36 || smallWrecks.some((s) => Math.hypot(x - s.x, z - s.z) < 14);
  const diveZoneAt = (x: number, z: number) => diveZoneOf(seaInfo(x, z).sea, nearWreck(x, z));

  // ───────── 산호초·해초 숲 청크(구역은 geo.zoneAt) ─────────
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const tmpCol = new THREE.Color();
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  const harvest = new Map<string, HarvestPoint>();
  const CORAL_KINDS = new Set(['brain', 'branch', 'tube', 'table', 'fan']);

  game.chunks.add({
    key: 'ocean-reef', size: 40, radius: 92, detail: true,
    build: ({ cx, cz, x0, z0, size }) => {
      // 바다가 아닌 청크는 건너뛴다
      let wet = 0;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const x = x0 + (i + 0.5) * size / 5, z = z0 + (j + 0.5) * size / 5;
        if (seaAt(x, z) && island.heightAt(x, z) < -0.6) wet++;
      }
      if (wet === 0) return null;
      const rnd = ctx.rng(`ocean-reef:${cx},${cz}`);
      // 구역 격자 4×4(geo.zoneAt) — 산호 정원은 reef 구역에만
      const ZG = 4, zg: Array<DiveZone | null> = [];
      for (let i = 0; i < ZG; i++) for (let j = 0; j < ZG; j++) zg.push(diveZoneAt(x0 + (i + 0.5) * size / ZG, z0 + (j + 0.5) * size / ZG));
      const zoneHere = (x: number, z: number) => zg[Math.min(ZG - 1, Math.max(0, Math.floor((x - x0) / size * ZG))) * ZG + Math.min(ZG - 1, Math.max(0, Math.floor((z - z0) / size * ZG)))];
      // 해초 숲은 청크마다 조각조각(이 청크 고유 난수)
      const kelpPatch = { on: rnd() < 0.45, x: x0 + rnd() * size, z: z0 + rnd() * size, r: 8 + rnd() * 14 };
      const lists: Record<string, Array<{ m: THREE.Matrix4; c: THREE.Color }>> = {};
      const hp: HarvestPoint[] = [];
      const put = (kind: string, x: number, y: number, z: number, s: number, ry: number, col: string, tilt = 0.12) => {
        tmpE.set((rnd() - 0.5) * tilt, ry, (rnd() - 0.5) * tilt);
        tmpQ.setFromEuler(tmpE);
        tmpS.set(s, s * (0.85 + rnd() * 0.3), s);
        tmpP.set(x, y, z);
        (lists[kind] ??= []).push({ m: new THREE.Matrix4().compose(tmpP, tmpQ, tmpS), c: tmpCol.set(col).clone() });
        return lists[kind].length - 1;
      };
      const tries = 24 + wet * 8;
      let nWeed = 0, nCoral = 0;
      for (let i = 0; i < tries; i++) {
        const x = x0 + rnd() * size, z = z0 + rnd() * size;
        if (!seaAt(x, z)) continue;
        const h = island.heightAt(x, z);
        const depth = -h;
        if (depth < 0.6) continue;
        const zone = zoneHere(x, z);
        const pick = rnd();
        const pc = CORAL_COLORS[Math.floor(rnd() * CORAL_COLORS.length)];
        const ry = rnd() * Math.PI * 2;
        const y = h - 0.06;
        const weed = (kind: string, idx: number) => { if (nWeed < 5 && depth < DIVE_MAX) hp.push({ key: `${cx},${cz}:w${i}`, kind: 'seaweed', x, y: h, z, im: null, idx, list: kind }); nWeed++; };
        if (depth < 1.6) {
          // 얕은 물: 해초 잔디·조개·불가사리
          if (pick < 0.5) put('grass', x, y, z, 0.8 + rnd() * 0.6, ry, rnd() < 0.5 ? '#ffffff' : '#e4ffd0');
          else if (pick < 0.7) put('shell', x, y + 0.04, z, 0.9 + rnd() * 0.8, ry, ['#ffd0dc', '#fff0d0', '#e0d4ff'][Math.floor(rnd() * 3)]);
          else if (pick < 0.85) put('star', x, y + 0.04, z, 1 + rnd() * 0.8, ry, ['#ff9f6a', '#ff7f9a', '#ffcf5a'][Math.floor(rnd() * 3)], 0.02);
          else put('pebble', x, y + 0.02, z, 0.7 + rnd() * 1.2, ry, ROCK_COLORS[Math.floor(rnd() * 4)]);
          continue;
        }
        if (zone === 'reef') {
          // 산호 정원(geo reef 구역)
          let kind = '';
          if (pick < 0.2) kind = 'brain';
          else if (pick < 0.37) kind = 'branch';
          else if (pick < 0.5) kind = 'tube';
          else if (pick < 0.55) kind = 'fan';
          else if (pick < 0.62) kind = 'table';
          if (kind) {
            const s = kind === 'brain' ? 1.0 + rnd() * 1.3 : kind === 'branch' ? 1.3 + rnd() * 1.4 : kind === 'tube' ? 1.1 + rnd() * 1.2 : kind === 'fan' ? 0.8 + rnd() * 0.8 : 1.2 + rnd() * 1.5;
            const idx = put(kind, x, y, z, s, ry, pc);
            if (nCoral < 5 && CORAL_KINDS.has(kind) && depth < DIVE_MAX) hp.push({ key: `${cx},${cz}:c${i}`, kind: 'coral', x, y: h, z, im: null, idx, list: kind });
            nCoral++;
          } else if (pick < 0.7) put('anem', x, y, z, 0.8 + rnd() * 0.7, ry, ['#ff9ad0', '#c4a8ff', '#ffcf7a', '#8ff0d8'][Math.floor(rnd() * 4)]);
          else if (pick < 0.8) put('rock', x, y, z, 1.0 + rnd() * 1.8, ry, ROCK_COLORS[Math.floor(rnd() * 4)], 0.4);
          else if (pick < 0.9) weed('grass', put('grass', x, y, z, 0.8 + rnd() * 0.7, ry, '#ffffff'));
          else if (pick < 0.95) put('urchin', x, y + 0.02, z, 0.8 + rnd() * 0.6, ry, ['#9b7bf0', '#6a5ad8', '#ff8ac0'][Math.floor(rnd() * 3)]);
          else put('shell', x, y + 0.04, z, 1 + rnd(), ry, '#ffe0ea');
        } else if (depth > 3.5 && (zone === 'wreck' || (kelpPatch.on && Math.hypot(x - kelpPatch.x, z - kelpPatch.z) < kelpPatch.r))) {
          // 해초 숲(난파선 둘레 · 청크마다 조각)
          if (pick < 0.55) { const k = rnd() < 0.5 ? 'kelpA' : 'kelpB'; weed(k, put(k, x, y, z, 0.8 + rnd() * 0.5 * Math.min(1, depth / 8), ry, rnd() < 0.5 ? '#ffffff' : '#e0ffd8', 0.05)); }
          else if (pick < 0.75) put('grass', x, y, z, 1 + rnd() * 0.6, ry, '#ffffff');
          else if (pick < 0.88) put('rock', x, y, z, 0.8 + rnd() * 1.6, ry, ROCK_COLORS[Math.floor(rnd() * 4)], 0.4);
          else put('pebble', x, y + 0.02, z, 1 + rnd(), ry, ROCK_COLORS[Math.floor(rnd() * 4)]);
        } else {
          // 모래밭: 드문드문(가끔 작은 산호)
          if (pick < 0.25) put('grass', x, y, z, 0.8 + rnd() * 0.5, ry, '#ffffff');
          else if (pick < 0.4) put('pebble', x, y + 0.02, z, 0.8 + rnd() * 1.2, ry, ROCK_COLORS[Math.floor(rnd() * 4)]);
          else if (pick < 0.5) put('shell', x, y + 0.04, z, 1 + rnd() * 0.8, ry, ['#ffd0dc', '#fff0d0', '#e0d4ff'][Math.floor(rnd() * 3)]);
          else if (pick < 0.58) put('star', x, y + 0.04, z, 1 + rnd() * 0.8, ry, ['#ff9f6a', '#ff7f9a', '#ffcf5a'][Math.floor(rnd() * 3)], 0.02);
          else if (pick < 0.66) put('brain', x, y, z, 0.6 + rnd() * 0.6, ry, pc);
          else if (pick < 0.7) put('fan', x, y, z, 0.7 + rnd() * 0.7, ry, pc);
          else if (pick < 0.78) put('rock', x, y, z, 0.8 + rnd() * 1.4, ry, ROCK_COLORS[Math.floor(rnd() * 4)], 0.4);
          else if (pick < 0.84) put('urchin', x, y + 0.02, z, 0.8 + rnd() * 0.6, ry, '#8a6ae0');
        }
      }
      const grp = new THREE.Group();
      const ims: Record<string, THREE.InstancedMesh> = {};
      for (const [kind, arr] of Object.entries(lists)) {
        const geo = G[kind as keyof typeof G];
        const mat = kind === 'anem' ? swayReef : kind.startsWith('kelp') ? kelpMat : kind === 'grass' ? grassMat : kind === 'rock' || kind === 'pebble' ? rockMat : reefMat;
        const im = new THREE.InstancedMesh(geo, mat, arr.length);
        arr.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = kind === 'rock';
        im.receiveShadow = true;
        ims[kind] = im;
        grp.add(im);
      }
      // 뜯을 수 있는 해초·산호(오늘 이미 뜯었으면 숨긴다)
      for (const p of hp) {
        p.im = ims[p.list] ?? null;
        if (p.im) { p.orig = new THREE.Matrix4(); p.im.getMatrixAt(p.idx, p.orig); }
        if (pickedToday.has(p.key) && p.im) { p.im.setMatrixAt(p.idx, ZERO_M); p.im.instanceMatrix.needsUpdate = true; }
        harvest.set(p.key, p);
      }
      grp.userData.harvest = hp.map((p) => p.key);
      // 바닥 빛 무늬
      const res = 1, n = Math.round(size / res);
      const pg = new THREE.PlaneGeometry(size, size, n, n).rotateX(-Math.PI / 2);
      const pp = pg.attributes.position;
      let any = false;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i) + x0 + size / 2, z = pp.getZ(i) + z0 + size / 2;
        const h = island.heightAt(x, z);
        if (h < -0.4) any = true;
        pp.setY(i, Math.min(h, 0.3) + 0.06);
      }
      if (any) {
        pg.computeVertexNormals();
        const cm = new THREE.Mesh(pg, caust);
        cm.position.set(x0 + size / 2, 0, z0 + size / 2);
        cm.receiveShadow = true;
        grp.add(cm);
      } else pg.dispose();
      return grp;
    },
    dispose: (o) => {
      for (const k of (o.userData.harvest as string[]) ?? []) harvest.delete(k);
      o.traverse((m) => {
        const im = m as THREE.InstancedMesh;
        if (im.isInstancedMesh) im.dispose();
        else if ((m as THREE.Mesh).isMesh && !(m as THREE.Mesh).geometry.userData.shared) (m as THREE.Mesh).geometry.dispose();
      });
    },
  });

  // ───────── 잠수 생물 자리(거품 그림자) ─────────
  // 청크는 자리만 정한다(결정적). 종은 다가오면 econ.rollCatch({activity:'dive', commit:false})로 미리 굴리고, 잡으면 reportCatch.
  const spots = new Set<Spot>();
  const lifeRoot = new THREE.Group();
  lifeRoot.name = 'ocean-life';
  root.add(lifeRoot);
  const TURTLE = SEA_BY_ID.get('sea-turtle')!;

  game.chunks.add({
    key: 'ocean-life', size: 40, radius: 66, detail: true,
    build: ({ cx, cz, x0, z0, size }) => {
      const rnd = ctx.rng(`ocean-life:${cx},${cz}`);
      const mine: Spot[] = [];
      const want = 4 + Math.floor(rnd() * 4);
      for (let i = 0; i < want * 3 && mine.length < want; i++) {
        const x = x0 + rnd() * size, z = z0 + rnd() * size;
        if (!seaAt(x, z)) continue;
        const h = island.heightAt(x, z);
        const depth = -h;
        if (depth < 0.8) continue;
        const info = seaInfo(x, z);
        const zone = diveZoneOf(info.sea, nearWreck(x, z));
        if (!zone) continue;
        const key = `${cx},${cz}:${i}`;
        const srnd = ctx.rng(`ocean-spot:${key}`);
        const deep = h < FLOOR_REACH;
        // 떠다니는 높이: 손 닿는 깊이 안에서(해구는 깊은 곳에서 떠오른 아이들)
        const hover = deep ? Math.max(0.6, (-DIVE_MAX + 2 + srnd() * 7) - h) : 0.5 + srnd() * Math.max(0.3, Math.min(3, depth - 1.2));
        const spot: Spot = {
          key, x, z, floor: h, depth, zone, island: info.island, sp: null, res: null, tag: '', rolled: false,
          beh: newBeh(srnd), rnd: srnd, phase: srnd() * 100, hover, swimR: 0.6 + srnd() * 1.2, yaw: srnd() * Math.PI * 2,
          s: 2 * (0.85 + srnd() * 0.35), mesh: null, model: '', pos: new THREE.Vector3(x, h, z), dist: Infinity,
        };
        // 산호초 바다거북(목격) — 청크 몇 군데에만
        if (zone === 'reef' && depth > TURTLE.minDepth && mine.every((m) => !m.witness) && srnd() < 0.18) {
          spot.witness = TURTLE; spot.sp = TURTLE; spot.rolled = true; spot.hover = 1.2 + srnd() * Math.max(0.2, Math.min(2, depth - 3)); spot.swimR = 5; spot.s = 2;
        }
        mine.push(spot);
      }
      if (!mine.length) return null;
      for (const s of mine) spots.add(s);
      const grp = new THREE.Group();
      grp.userData.spots = mine;
      return grp;
    },
    dispose: (o) => {
      for (const s of (o.userData.spots as Spot[]) ?? []) {
        if (s.mesh) { lifeRoot.remove(s.mesh); s.mesh = null; }
        spots.delete(s);
      }
    },
  });

  const envNow = (x?: number, z?: number) => {
    const env = game.env;
    let weather: string = env?.weather ?? 'clear';
    try { if (env && x !== undefined && z !== undefined) weather = env.regionWeather(x, z) ?? weather; } catch { /* 날씨 구역 없음 */ }
    return { tod: env?.tod ?? 'day', hour: env?.hour ?? 12, weather };
  };
  /** 다른(아직 안 잡은) 자리가 보상 굴림을 들고 있나 */
  const bonusHeld = (self: Spot) => {
    for (const o of spots) if (o !== self && !caughtToday.has(o.key) && isBonusRoll(o.res)) return true;
    return false;
  };
  const spotTag = (s: Spot) => { const e = envNow(s.x, s.z); return `${e.tod}|${e.weather}`; };
  /** 자리 하나 미리 굴리기(시간대·날씨가 바뀌면 안 보일 때 다시) */
  const rollSpot = (s: Spot) => {
    const e = envNow(s.x, s.z);
    s.tag = `${e.tod}|${e.weather}`;
    s.rolled = true;
    s.sp = null; s.res = null;
    if (caughtToday.has(s.key)) return;
    let pool = divePool(SEA_SPECIES, { zone: s.zone, depth: s.depth, tod: e.tod, hour: e.hour, weather: e.weather });
    if (s.floor < FLOOR_REACH) pool = pool.filter((sp) => sp.habitat === 'swim' || sp.habitat === 'drift');
    if (!pool.length) return;
    const econ = game.econ;
    if (econ && typeof econ.rollCatch === 'function') {
      try {
        const res = econ.rollCatch({ activity: 'dive', pool, commit: false, place: { zone: s.zone } } as RollQuery);
        const sp = res?.species ? SEA_BY_ID.get(res.species.id) : undefined;
        if (!sp) return;
        // 미리 굴림(commit:false)도 '오늘 첫 잡기 ★3+'·천장을 다 받아 온다 — 보상은 한 자리만 들고,
        // 다른 자리가 이미 들고 있으면 보통 굴림(로컬 종·종 희귀도)으로 바꾼다
        if (isBonusRoll(res) && bonusHeld(s)) {
          const rnd = ctx.rng(`ocean-roll:${s.key}:${dayNow()}:${s.tag}`);
          const lp = localRoll(pool, rnd, e.weather);
          if (lp) { s.sp = lp; s.res = plainRoll(res, lp, localSize(lp, rnd)); }
          return;
        }
        s.sp = sp; s.res = res;
        return;
      } catch (err) { console.error('[ocean rollCatch]', err); }
    }
    s.sp = localRoll(pool, ctx.rng(`ocean-roll:${s.key}:${dayNow()}:${s.tag}`), e.weather);
  };
  const witnessShown = (s: Spot) => {
    const e = envNow(s.x, s.z);
    // 오늘 이미 쓰다듬었으면(다시 불러와도·청크가 다시 지어져도) 안 나온다
    return !!s.witness && !s.greeted && OF().greet[s.witness.id] !== today() && (s.witness.where ?? []).some((w) => timeOk(w.time, e.tod, e.hour) && (!w.weather?.only || (w.weather.only as string[]).includes(e.weather)));
  };
  const spotMesh = (s: Spot) => {
    if (!s.sp) return null;
    if (s.mesh && s.model === s.sp.model) return s.mesh;
    if (s.mesh) lifeRoot.remove(s.mesh);
    const m = new THREE.Mesh(seaModel(s.sp.model), matFor(s.sp.model));
    // 바닥 그림자는 거품 그림자(shadowIm)가 맡는다 — 그림자 패스 그리기를 아낀다
    m.castShadow = false;
    m.scale.setScalar(s.s * s.sp.scale);
    m.rotation.y = s.yaw;
    m.visible = false;
    lifeRoot.add(m);
    s.mesh = m;
    s.model = s.sp.model;
    return m;
  };
  /** 몸 반지름(손 닿기 계산) */
  const bodyR = (s: Spot) => {
    if (!s.sp) return 0.2;
    const g = seaModel(s.sp.model);
    if (!g.boundingSphere) g.computeBoundingSphere();
    return (g.boundingSphere?.radius ?? 0.2) * s.s * s.sp.scale * 0.7;
  };

  // 거품 그림자(블롭 그림자 인스턴스) + 뽀글 거품(점)
  const NSH = 48, NBUB = 5;
  const shadowIm = new THREE.InstancedMesh(blobShadowGeometry(), blobShadowMaterial(), NSH);
  shadowIm.count = 0;
  shadowIm.frustumCulled = false;
  shadowIm.renderOrder = 1;
  shadowIm.name = 'ocean-bubble-shadows';
  root.add(shadowIm);
  const hintGeo = new THREE.BufferGeometry();
  const hintPos = new Float32Array(NSH * NBUB * 3);
  hintGeo.setAttribute('position', new THREE.BufferAttribute(hintPos, 3));
  hintGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const hintPts = new THREE.Points(hintGeo, new THREE.PointsMaterial({ map: bubbleTexture(), size: 0.2, sizeAttenuation: true, transparent: true, depthWrite: false, color: '#ffffff' }));
  hintPts.frustumCulled = false;
  hintPts.name = 'ocean-bubble-hints';
  root.add(hintPts);
  const eyes = new EyeBatch(10);
  root.add(eyes.group);

  // ───────── 꿀꺽호 ─────────
  const sparkTexCanvas = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,250,200,0.8)');
    gr.addColorStop(1, 'rgba(255,240,180,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.moveTo(32, 2); g.lineTo(36, 28); g.lineTo(62, 32); g.lineTo(36, 36); g.lineTo(32, 62); g.lineTo(28, 36); g.lineTo(2, 32); g.lineTo(28, 28); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const sparkMat = new THREE.SpriteMaterial({ map: sparkTexCanvas, color: '#fff2a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const today = () => dayNow();
  const chestOpenToday = () => OF().chest.ggulkkeok === today();
  const spyglassTaken = () => OF().chest.spyglass === today() || st.has('d_spyglass') || !!game.econ?.isDonated?.('d_spyglass');
  let gg: ReturnType<typeof buildGgulkkeok> | null = null;
  const W = wreckGeo();
  for (const g of [W.hull, W.trim, W.sail]) g.userData.shared = true;
  const JAR = jarGeo(), COINS = coinPileGeo(), CAVE = caveGeo();
  const ggW = (v: THREE.Vector3) => ggToWorld(v, ggBase);

  game.chunks.add({
    key: 'ocean-ggulkkeok', size: 128, radius: 340,
    build: ({ x0, z0, size }) => {
      if (ggBase.x < x0 || ggBase.x >= x0 + size || ggBase.z < z0 || ggBase.z >= z0 + size) return null;
      const spy = critterObject(seaModel('spyglass'), metalMat);
      const moray = critterObject(seaModel('moray'), critterMat);
      moray.scale.setScalar(2.2);
      const sparkle = new THREE.Sprite(sparkMat);
      sparkle.scale.setScalar(0.7);
      gg = buildGgulkkeok({ wood: woodMat, sail: sailMat, metal: metalMat, glow: glowMat }, { spyglass: spy, moray, sparkle });
      gg.group.position.set(ggBase.x, ggBase.y, ggBase.z);
      gg.group.rotation.y = ggBase.yaw;
      const open = chestOpenToday();
      gg.lid.rotation.x = open ? -1.9 : 0;
      gg.sparkle.visible = !open;
      gg.spyglass.visible = !spyglassTaken();
      // 갑판·둘레 해초
      const kelpIm = new THREE.InstancedMesh(G.kelpA, kelpMat, 10);
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63, r = 4.2 + (i % 3) * 1.2;
        tmpM.compose(tmpP.set(Math.sin(a) * r, 0, Math.cos(a) * r * 1.9), tmpQ.setFromEuler(tmpE.set(0, i, 0)), tmpS.set(0.9, 0.7 + (i % 3) * 0.25, 0.9));
        kelpIm.setMatrixAt(i, tmpM);
        kelpIm.setColorAt(i, tmpCol.set(i % 2 ? '#ffffff' : '#e0ffd8'));
      }
      gg.group.add(kelpIm);
      // 금화단지 3
      for (let i = 0; i < GG_SPOTS.jars.length; i++) gg.group.add(jarObject(`ggulkkeok-${i}`, GG_SPOTS.jars[i], i === 2 ? 0 : 0.16));
      return gg.group;
    },
    dispose: () => { gg = null; },
  });

  // 작은 난파선·동굴(섬마다) + 금화단지
  const jars: Array<{ id: string; pos: THREE.Vector3; spark: THREE.Object3D | null }> = [];
  const jarOpened = (id: string) => OF().jars[id] !== undefined;
  function jarObject(id: string, local: THREE.Vector3, tilt: number) {
    const jg = new THREE.Group();
    jg.position.copy(local);
    jg.rotation.z = tilt;
    const jm = new THREE.Mesh(JAR, woodMat);
    jm.scale.setScalar(1.3);
    jm.castShadow = true;
    jg.add(jm);
    const coins = new THREE.Mesh(COINS, glowMat);
    coins.position.set(0.45, 0, 0.2);
    coins.scale.setScalar(1.6);
    jg.add(coins);
    const spark = new THREE.Sprite(sparkMat);
    spark.position.set(0, 1.5, 0);
    spark.scale.setScalar(0.5);
    jg.add(spark);
    spark.visible = !jarOpened(id);
    const j = jars.find((x) => x.id === id);
    if (j) j.spark = spark;
    return jg;
  }
  for (let i = 0; i < GG_SPOTS.jars.length; i++) jars.push({ id: `ggulkkeok-${i}`, pos: ggW(GG_SPOTS.jars[i]).clone(), spark: null });
  for (const s of smallWrecks) {
    for (let i = 0; i < 3; i++) {
      const a = s.rot + i * 1.9 + 0.8, r = 3.2 + i * 1.1;
      const x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
      jars.push({ id: `${s.id}-${i}`, pos: new THREE.Vector3(x, island.heightAt(x, z), z), spark: null });
    }
  }

  game.chunks.add({
    key: 'ocean-sites', size: 128, radius: 300,
    build: ({ x0, z0, size }) => {
      const inside = sites.filter((s) => s.x >= x0 && s.x < x0 + size && s.z >= z0 && s.z < z0 + size);
      const myJars = jars.filter((j) => !j.id.startsWith('ggulkkeok') && j.pos.x >= x0 && j.pos.x < x0 + size && j.pos.z >= z0 && j.pos.z < z0 + size);
      if (!inside.length && !myJars.length) return null;
      const grp = new THREE.Group();
      for (const s of inside) {
        const g = new THREE.Group();
        g.position.set(s.x, s.y - 0.5, s.z);
        g.rotation.set(0.12, s.rot, s.kind === 'wreck' ? 0.32 : 0);
        if (s.kind === 'wreck') {
          for (const [geo, mat] of [[W.hull, woodMat], [W.trim, woodMat], [W.sail, sailMat]] as const) {
            const m = new THREE.Mesh(geo, mat);
            m.castShadow = true; m.receiveShadow = true;
            g.add(m);
          }
          // 해초가 감긴 난파선
          const kelpIm = new THREE.InstancedMesh(G.kelpA, kelpMat, 8);
          for (let i = 0; i < 8; i++) {
            tmpM.compose(tmpP.set(Math.sin(i * 2.1) * 2.4, 0.2, -5 + i * 1.4), tmpQ.setFromEuler(tmpE.set(0, i, 0)), tmpS.set(0.8, 0.7 + (i % 3) * 0.2, 0.8));
            kelpIm.setMatrixAt(i, tmpM);
            kelpIm.setColorAt(i, tmpCol.set('#ffffff'));
          }
          g.add(kelpIm);
        } else {
          const m = new THREE.Mesh(CAVE, caveMat);
          m.castShadow = true; m.receiveShadow = true;
          g.rotation.set(0, s.rot, 0);
          g.position.y = s.y - 0.3;
          g.add(m);
        }
        grp.add(g);
      }
      for (const j of myJars) grp.add(jarObject(j.id, j.pos.clone().add(new THREE.Vector3(0, -0.05, 0)), 0.15));
      return grp;
    },
  });
  const inWater = () => game.player.mode === 'dive' || game.player.mode === 'swim';
  for (const j of jars) {
    game.addInteractable({
      id: `ocean-jar-${j.id}`,
      position: () => j.pos,
      radius: 2.6,
      label: '금화단지 열기 💰',
      enabled: () => inWater() && !jarOpened(j.id),
      onUse: () => {
        // GDD 3.3.1 d_gold_jar: 코인 1,000~5,000(낮은 쪽이 흔하게)
        const r = ctx.rng(`ocean-jar:${j.id}`)();
        const n = Math.round((1000 + r * r * 4000) / 10) * 10;
        of = OF();
        of.jars[j.id] = today();
        st.addCoins(n, '금화단지');
        st.save();
        game.ui.toast(`금화단지에서 코인 ${n.toLocaleString()}개가 와르르! 💰`);
        if (j.spark) j.spark.visible = false;
        game.player.act('pick', 0.8);
      },
    });
  }
  // 꿀꺽호 선실 은상자(하루 한 번) · 선장의 망원경
  const chestPos = ggW(GG_SPOTS.chest).clone().add(new THREE.Vector3(0, 0.4, 0));
  const openGgChest = () => {
    if (chestOpenToday()) return false;
    of = OF();
    of.chest.ggulkkeok = today();
    st.save();
    const econ = game.econ;
    if (econ && typeof econ.openChest === 'function') econ.openChest('silver', 'wreck');
    else { const n = 1000 + Math.floor(ctx.rng(`ocean-chest:${today()}`)() * 2000); st.addCoins(n, '꿀꺽호 은상자'); game.ui.toast(`꿀꺽호 은상자! 코인 ${n.toLocaleString()}개 ✨`); }
    if (gg) { gg.lid.rotation.x = -1.9; gg.sparkle.visible = false; }
    game.player.act('pick', 1);
    return true;
  };
  game.addInteractable({
    id: 'ocean-ggulkkeok-chest',
    position: () => chestPos,
    radius: 3.2,
    label: '꿀꺽호 은상자 열기 ✨',
    enabled: () => inWater() && !chestOpenToday(),
    onUse: () => { openGgChest(); },
  });
  const spyPos = ggW(GG_SPOTS.spyglass).clone().add(new THREE.Vector3(0, 0.2, 0));
  const SPYGLASS = SEA_BY_ID.get('d_spyglass')!;
  game.addInteractable({
    id: 'ocean-ggulkkeok-spyglass',
    position: () => spyPos,
    radius: 3.0,
    label: '선장의 망원경 줍기 🔭',
    enabled: () => inWater() && !spyglassTaken(),
    onUse: () => {
      of = OF();
      of.chest.spyglass = today();
      st.save();
      const size = localSize(SPYGLASS, ctx.rng(`ocean-spy:${today()}`));
      game.ui.showCatch({ species: SPYGLASS, size, sizeText: `${size.toFixed(1)}cm`, model: critterObject(seaModel('spyglass'), metalMat), line: SPYGLASS.line, activity: 'dive', keep: true });
      if (gg) gg.spyglass.visible = false;
      game.player.act('hold', 1.2);
    },
  });
  /** 갑판·선실 바닥(잠수 바닥으로 쓴다) — 세상 높이 또는 -Infinity */
  const wreckFloorAt = (x: number, z: number) => {
    if (Math.abs(x - ggBase.x) > 9 || Math.abs(z - ggBase.z) > 9) return -Infinity;
    const l = worldToGg(x, z, ggBase);
    const d = deckHeightLocal(l.lx, l.lz);
    return d === null ? -Infinity : ggBase.y + d;
  };

  // ───────── 잡기·인사·뜯기(잠수 중 E) ─────────
  const tv = new THREE.Vector3();
  const chest = new THREE.Vector3();
  const give = (d: DropLine, island0: string | null) => {
    const econ = game.econ;
    let n = d.n;
    if (econ && typeof econ.give === 'function') n = econ.give(d.id, d.n, 'dive');
    else st.addItem(d.id, d.n);
    if (n > 0) st.emit({ type: 'harvest', kind: d.kind, item: d.id, n, island: island0 ?? 'sea' });
    return n;
  };
  const failCatch = (s: Spot) => {
    const econ = game.econ;
    if (econ && typeof econ.catchFail === 'function') econ.catchFail('dive');
    else st.emit({ type: 'catch-fail', activity: 'dive' });
    const nm = s.sp?.name ?? '';
    const b = s.sp?.behavior;
    game.ui.toast(
      b === 'flee' ? `휙! ${nm}가 도망쳤다… 살금살금 다가가 봐요` :
      b === 'hide' ? `쏙! ${nm}가 바위 틈에 숨어 버렸다…` :
      b === 'hop' ? `톡! 뛰어오르는 중이라 놓쳤다…` : '앗, 놓쳤다…',
    );
  };
  const catchSpot = (s: Spot) => {
    const sp = s.sp;
    if (!sp) return;
    if (s.witness) {
      // 목격(바다거북): 도감만 — 가방엔 안 넣는다(keep:false)
      s.greeted = true;
      of = OF(); of.greet[sp.id] = today(); st.save();
      game.ui.showCatch({ species: sp, line: sp.line, ...catchShowFor(sp) });
      game.player.act('pet', 1.4);
      return;
    }
    if (!catchable(s.beh)) { failCatch(s); return; }
    const econ = game.econ;
    let res = s.res;
    if (res && econ && typeof econ.reportCatch === 'function') {
      try { res = ((econ.reportCatch as unknown as (r: RollResult, a?: string) => RollResult | void)(res, 'dive')) ?? res; } catch (err) { console.error('[ocean reportCatch]', err); }
    }
    const size = res?.size ?? localSize(sp, s.rnd);
    if (!res || !econ) st.emit({ type: 'catch', activity: 'dive', species: sp, rarity: sp.rarity, size, combo: 0 });
    const model = critterObject(seaModel(sp.model), matFor(sp.model));
    game.ui.showCatch({ species: sp, size, sizeText: `${size.toFixed(1)}cm`, model, line: sp.line, variant: res?.variant, activity: 'dive', ...catchShowFor(sp) });
    const e = envNow(s.x, s.z);
    for (const d of catchDrops(sp, e.weather, ctx.rng(`ocean-drop:${s.key}:${today()}`))) {
      const n = give(d, s.island);
      if (n > 0 && d.kind === 'pearl') game.ui.toast('반짝! 진주가 나왔다 🦪✨');
      if (n > 0 && d.kind === 'stardust') game.ui.toast(`별가루 ${n}개가 반짝반짝 ✨`);
    }
    markCaught(s.key);
    s.sp = null; s.res = null;
    // 잡을 때마다 보상 굴림을 들고 있던 자리는 다시 굴린다(보상을 썼거나 천장 카운터가 바뀌었다) — 보이는 자리여도
    for (const o of spots) if (o !== s && isBonusRoll(o.res)) o.rolled = false;
    if (s.mesh) s.mesh.visible = false;
    game.player.act('pick', 0.8);
  };
  /** 손 닿는 가장 가까운 자리 */
  const reachable = (p: { pos: THREE.Vector3 }): { s: Spot; d: number } | null => {
    chest.set(p.pos.x, p.pos.y + 0.45, p.pos.z);
    let best: Spot | null = null, bd = Infinity;
    for (const s of spots) {
      if (!s.sp || s.dist > 6) continue;
      if (s.witness && !witnessShown(s)) continue;
      const d = chest.distanceTo(s.pos) - bodyR(s);
      if (d > REACH + (s.witness ? 1.2 : 0) || d >= bd) continue;
      best = s; bd = d;
    }
    return best ? { s: best, d: Math.max(0, bd) } : null;
  };
  // 집·박물관 안(먼바다 위 y=600)에서는 바다 상호작용을 띄우지 않는다
  const indoors = () => !!(game.ext as { interiors?: { current?(): string | null } }).interiors?.current?.();
  game.addProvider('ocean-catch', (p) => {
    if (indoors()) return null;
    if (p.mode !== 'dive' && p.mode !== 'swim') return null;
    const r = reachable(p);
    if (!r) return null;
    const s = r.s, sp = s.sp!;
    const hidden = s.beh.mode === 'hidden';
    return {
      id: 'ocean-catch',
      label: s.witness ? `${sp.name} 쓰다듬기 🐢` : hidden ? '뽀글뽀글… 뭔가 있다! 잡기' : `${sp.name} 잡기`,
      dist: r.d,
      use: () => catchSpot(s),
    };
  });
  // 해초 뜯기 · 산호 조각 줍기
  const nearestHarvest = (p: { pos: THREE.Vector3 }) => {
    let best: HarvestPoint | null = null, bd = Infinity;
    for (const h of harvest.values()) {
      if (pickedToday.has(h.key)) continue;
      const dh = Math.hypot(h.x - p.pos.x, h.z - p.pos.z);
      if (dh > 1.8 || dh >= bd) continue;
      if (p.pos.y - h.y > 2.6) continue;
      best = h; bd = dh;
    }
    return best ? { h: best, d: bd } : null;
  };
  game.addProvider('ocean-harvest', (p) => {
    if (indoors()) return null;
    if (p.mode !== 'dive') return null;
    const r = nearestHarvest(p);
    if (!r) return null;
    const h = r.h;
    return {
      id: 'ocean-harvest',
      label: h.kind === 'seaweed' ? '해초 뜯기 🌿' : '산호 조각 줍기 🪸',
      dist: r.d + 0.3,
      use: () => {
        const d = harvestDrop(h.kind, ctx.rng(`ocean-pick:${h.key}:${today()}`));
        const n = give(d, seaInfo(h.x, h.z).island);
        if (n <= 0) return;
        markPicked(h.key);
        if (h.im) { h.im.setMatrixAt(h.idx, ZERO_M); h.im.instanceMatrix.needsUpdate = true; }
        game.ui.toast(h.kind === 'seaweed' ? `해초 ${n}개 뜯었다! 🌿` : '산호 조각을 주웠다! 🪸');
        game.player.act('pick', 0.7);
      },
    };
  });

  // ───────── 수면 위: 부표 ─────────
  const BUOY = buoyGeo();
  const buoyMat = cuteMat({ rough: 0.45, sheen: 0.4, clearcoat: 0.5, fill: 0.2 });
  const buoys = new Set<THREE.Object3D>();
  game.chunks.add({
    key: 'ocean-buoys', size: 110, radius: 600, detail: true,
    build: ({ cx, cz, x0, z0, size }) => {
      const rnd = ctx.rng(`ocean-buoys:${cx},${cz}`);
      if (rnd() > 0.85) return null;
      const x = x0 + size * (0.2 + rnd() * 0.6), z = z0 + size * (0.2 + rnd() * 0.6);
      if (!seaAt(x, z) || island.heightAt(x, z) > -1.5) return null;
      const m = new THREE.Mesh(BUOY, buoyMat);
      m.position.set(x, -0.25, z);
      m.scale.setScalar(1.1);
      m.rotation.y = rnd() * 6;
      m.castShadow = true;
      m.userData.phase = rnd() * 10;
      buoys.add(m);
      return m;
    },
    dispose: (o) => { buoys.delete(o); },
  });

  // ───────── 갈매기 ─────────
  // 몸·왼날개·오른날개 = 인스턴스 셋(그리기 3번)
  const NGULL = 7;
  const gullG = gullBody(), wingG = gullWing(), wingRG = mirrorX(wingG);
  const gullRoot = new THREE.Group();
  root.add(gullRoot);
  const gullIm = [gullG, wingG, wingRG].map((g) => {
    const im = new THREE.InstancedMesh(g, critterMat, NGULL);
    im.frustumCulled = false;
    gullRoot.add(im);
    return im;
  });
  const gulls = Array.from({ length: NGULL }, (_, i) => ({ r: 7 + i * 2.4, h: 7 + (i % 3) * 3, ph: i * 1.7, sp: 0.22 + (i % 4) * 0.05 }));
  const gullCenter = new THREE.Vector3();
  const gullM = new THREE.Matrix4(), wingM = new THREE.Matrix4();

  // ───────── 돌고래 떼(목격 d_dolphins) — 얼굴은 EyeBatch 하나로 ─────────
  const DOL = withEyeMarkers(dolphinGeo);
  const dolRig = eyeRig(DOL);
  const dolEyes = new EyeBatch(5);
  const dolphins: THREE.Mesh[] = [];
  const dolRoot = new THREE.Group();
  root.add(dolRoot);
  dolRoot.add(dolEyes.group);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(DOL, critterMat);
    m.castShadow = true;
    m.scale.setScalar(i === 4 ? 0.9 : 1.4);
    dolRoot.add(m);
    dolphins.push(m);
  }
  // 물보라 고리 = 인스턴스 하나 — 더하기 섞기라 인스턴스 색(검정 쪽)으로 옅어진다
  const splashMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const splashG = new THREE.TorusGeometry(1, 0.08, 6, 28).rotateX(Math.PI / 2);
  const splashes = new THREE.InstancedMesh(splashG, splashMat, dolphins.length);
  splashes.frustumCulled = false;
  splashes.setColorAt(0, new THREE.Color(0, 0, 0));
  dolRoot.add(splashes);
  const splashC = new THREE.Color();
  const pod = { x: 0, z: 0, yaw: 0, active: 0 };

  // ───────── 고래(목격 d_humpback) ─────────
  const whale = new THREE.Group();
  const whaleM = critterObject(withEyeMarkers(whaleGeo), critterMat);
  whale.add(whaleM);
  root.add(whale);
  const spoutTex = bubbleTexture();
  const spoutMat = new THREE.SpriteMaterial({ map: spoutTex, color: '#ffffff', transparent: true, depthWrite: false, opacity: 0.9 });
  const spout: THREE.Sprite[] = [];
  for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(spoutMat); whale.add(s); spout.push(s); }
  const whaleState = { x: 0, z: 0, yaw: 0, on: 0 };

  // 목격 등록(사진 모드·인사): 보이는 돌고래·고래·바다거북
  const witnessList = (): Witness[] => {
    const out: Witness[] = [];
    if (game.world !== 'earth') return out;
    if (dolRoot.visible) out.push({ speciesId: 'd_dolphins', pos: dolphins[0].position.clone() });
    if (whale.visible) out.push({ speciesId: 'd_humpback', pos: whale.position.clone() });
    for (const s of spots) if (s.witness && s.mesh?.visible) out.push({ speciesId: s.witness.id, pos: s.pos.clone() });
    return out;
  };
  game.witnesses?.add?.(witnessList);
  /** 지금 인사할 수 있는 목격(12m) */
  const greetable = (p: { pos: THREE.Vector3 }): { id: string; d: number } | null => {
    let best: { id: string; d: number } | null = null;
    const t0 = today();
    const consider = (id: string, pos: THREE.Vector3, body: number) => {
      if (OF().greet[id] === t0) return;
      const d = Math.max(0, Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) - body);
      if (d <= GREET_R && (!best || d < best.d)) best = { id, d };
    };
    if (dolRoot.visible && pod.active > 0.5) for (const d of dolphins) consider('d_dolphins', d.position, 1);
    if (whale.visible && whaleState.on > 0.5) consider('d_humpback', whale.position, 5);
    return best;
  };
  const greet = (id: string) => {
    const sp = SEA_BY_ID.get(id);
    if (!sp) return false;
    of = OF(); of.greet[id] = today(); st.save();
    game.ui.showCatch({ species: sp, line: sp.line, ...catchShowFor(sp) });
    game.player.act('wave', 1.6);
    return true;
  };
  game.addProvider('ocean-greet', (p) => {
    if (indoors()) return null;
    const g = greetable(p);
    if (!g) return null;
    const sp = SEA_BY_ID.get(g.id)!;
    return { id: 'ocean-greet', label: `${sp.name}에게 인사하기 👋`, dist: g.d + 2, whileMounted: true, use: () => { greet(g.id); } };
  });

  // ───────── 물속 효과: 틴트·거품·부유물·빛줄기 ─────────
  const tint = document.createElement('div');
  tint.style.cssText = `position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .35s;
    background: radial-gradient(ellipse 85% 75% at 50% 45%, rgba(120,230,255,0) 55%, rgba(30,110,200,0.22) 85%, rgba(20,70,160,0.42) 100%);
    mix-blend-mode: normal;`;
  const tintTop = document.createElement('div');
  tintTop.style.cssText = `position:absolute;left:0;right:0;top:0;height:22%;background:linear-gradient(rgba(210,255,255,0.12),rgba(210,255,255,0));`;
  tint.appendChild(tintTop);
  // 게임 UI(#ui) 아래, 캔버스 위
  const uiEl = document.getElementById('ui');
  if (uiEl) document.body.insertBefore(tint, uiEl); else document.body.appendChild(tint);

  const NB = 260;
  const bubbleGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(NB * 3), bSeed = new Float32Array(NB * 3);
  const brnd = ctx.rng('ocean-bubbles');
  for (let i = 0; i < NB; i++) { bSeed[i * 3] = brnd(); bSeed[i * 3 + 1] = brnd(); bSeed[i * 3 + 2] = brnd(); }
  bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bubbleGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const bubbleMat = new THREE.PointsMaterial({ map: bubbleTexture(), size: 0.22, sizeAttenuation: true, transparent: true, depthWrite: false, color: '#ffffff' });
  const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
  bubbles.frustumCulled = false;
  root.add(bubbles);

  const NS = 500;
  const snowGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(NS * 3), sSeed = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) { sSeed[i * 3] = brnd(); sSeed[i * 3 + 1] = brnd(); sSeed[i * 3 + 2] = brnd(); }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  snowGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: bubbleTexture(), size: 0.07, transparent: true, depthWrite: false, color: '#e8fbff', opacity: 0.8 }));
  snow.frustumCulled = false;
  root.add(snow);

  const rayMat = new THREE.MeshBasicMaterial({ map: rayTexture(), color: '#bff4ff', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, forceSinglePass: true });
  // 빛줄기 12장 = 인스턴스 하나(그리기 1번)
  const NRAY = 12;
  const rayG = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  const rays = new THREE.InstancedMesh(rayG, rayMat, NRAY);
  rays.frustumCulled = false;
  rays.visible = false;
  root.add(rays);

  // ───────── 머리 위 게이지 · 튜브 구조 ─────────
  const staminaRing = new HeadRing('drop', '#3fc7b4');
  const oxygenRing = new HeadRing('bubble', '#8fd3f4');
  root.add(staminaRing.group, oxygenRing.group);
  const tube = new THREE.Mesh(tubeGeo(), critterMat);
  tube.visible = false;
  tube.castShadow = true;
  root.add(tube);
  const fade = new FadeOverlay();
  let rescueOut = 0;
  /** 가장 가까운 해변으로(못 찾으면 시작 마을) */
  const beachTerrain = { height: (x: number, z: number) => island.heightAt(x, z), water: (x: number, z: number) => island.waterLevelAt(x, z) };
  const rescueTargets = [{ x: island.HERO.player.x, z: island.HERO.player.z }, ...island.ISLANDS.map((d) => ({ x: d.x, z: d.z }))];
  const doRescue = () => {
    const p = game.player;
    const b = findBeach(beachTerrain, p.pos.x, p.pos.z, rescueTargets) ?? { x: island.HERO.player.x, z: island.HERO.player.z, d: 0 };
    p.mode = 'ground';
    p.teleport(b.x, b.z);
    p.unlock('ocean-rescue', true);
    tank.set(tank.max);
    st.emit({ type: 'swim-rescue' });
    game.ui.toast('둥둥 튜브가 해변까지 데려다줬어요! 🛟 (헤엄 체력 가득)');
    rescueOut = 0.8;
    return b;
  };
  const startRescue = () => {
    game.player.lock('ocean-rescue');
    game.ui.toast('헉헉… 힘들어요! 둥둥 튜브 출동 🛟');
    fade.set(0, '둥둥 튜브 출동! 🛟');
  };

  // 잠수 깊이(코어는 수면 −6m 까지만 내려간다 → 바닥·꿀꺽호 갑판까지 이어서 내려 준다)
  let diveY: number | null = null;
  let o2Warned = false, diveHinted = false;
  const applyDeepDive = (dt: number) => {
    const p = game.player;
    if (p.mode !== 'dive' || p.mounted || dt <= 0) { if (dt > 0 || p.mode !== 'dive') diveY = null; return; }
    const wl = island.waterLevelAt(p.pos.x, p.pos.z);
    if (wl !== 0) { diveY = null; return; }
    const floor = game.groundAt(p.pos.x, p.pos.z);
    const want = Math.max(floor + 0.55, wreckFloorAt(p.pos.x, p.pos.z) + 0.7, wl - DIVE_MAX);
    const coreT = Math.max(floor + 0.5, wl - 6);
    // 코어 목표로 충분한 얕은 곳은 손대지 않는다
    if (diveY === null && want >= coreT - 0.05) return;
    if (diveY === null) diveY = p.pos.y;
    // 창이 열려 잠긴 동안은 그 깊이에 가만히(코어 용수철이 −6m 로 끌어올리지 않게)
    if (!p.locked) diveY += Math.max(-2.6 * dt, Math.min(2.2 * dt, want - diveY));
    // 다시 얕아져 코어 목표까지 올라왔으면 코어에 넘긴다
    if (want >= coreT - 0.05 && diveY >= coreT - 0.1) { diveY = null; return; }
    const cur = p.body.translation();
    p.body.setTranslation({ x: cur.x, y: diveY + p.footOff, z: cur.z }, true);
    p.pos.y = diveY;
    p.vel.y = 0;
    const av = p.avatar?.root;
    if (av) av.position.y = diveY;
  };

  // ───────── 매 프레임 ─────────
  const cam = ctx.camera;
  const camRight = new THREE.Vector3();
  let unlockCheck = 0;
  let tagCheck = 0;
  // 해안 거리: 세계 샘플(coastDistAt)이 먼바다에서 크게 틀릴 때가 있다 — 멀다고 나오면 2초마다 실제 해변을 찾아
  // 그 해변까지 거리로 깎는다(해변은 마른 땅이니 진짜 해안 거리의 위쪽 경계 — 사이 프레임에도 그대로 써도 된다)
  let beachAt: { x: number; z: number } | null = null, beachCheck = 0;
  const coastDistNow = (x: number, z: number, dt: number) => {
    const raw = seaDistance(island.coastDistAt(x, z), x, z, island.ISLANDS);
    if (raw <= STAMINA.recoverDist) { beachCheck = 0; return raw; }
    beachCheck -= dt;
    if (beachCheck <= 0) {
      beachCheck = 2;
      const b = findBeach(beachTerrain, x, z, rescueTargets, { step: 6, radial: Math.min(420, raw + 20) });
      if (b) beachAt = b;
    }
    return beachAt ? Math.min(raw, Math.hypot(x - beachAt.x, z - beachAt.z)) : raw;
  };
  ctx.onUpdate((t, dt) => {
    mouth?.update(t);
    oceanTime.value = t;
    if (game.world !== 'earth') {
      root.visible = false; tint.style.opacity = '0';
      staminaRing.group.visible = oxygenRing.group.visible = false;
      return;
    }
    root.visible = true;
    const pl = game.player;
    const p = pl.pos;

    // ── 헤엄 체력 · 산소 ──
    unlockCheck -= dt;
    if (unlockCheck <= 0) { unlockCheck = 1; tank.setMax(oxygenMaxFor(game.econ ? (k) => game.econ!.isUnlocked(k) : null)); }
    const swimming = isSwim();
    const coastDist = coastDistNow(p.x, p.z, dt);
    // 물결에 살짝 떠올라 'air' 가 된 순간은 헤엄으로 친다(그 틈에 회복하지 않게) — 땅·배 위에서만 쉰다
    const wlP = island.waterLevelAt(p.x, p.z);
    const bobbing = !swimming && !pl.mounted && pl.mode !== 'ground' && Number.isFinite(wlP) && p.y < wlP - 0.3;
    if (dt > 0 && (stamina.fading || !pl.locked)) {
      const ev = stamina.tick(dt, { swimming: swimming || bobbing, coastDist, resting: pl.mode === 'ground' || !!pl.mounted });
      if (ev === 'rescue-start') startRescue();
      else if (ev === 'rescue') doRescue();
      if (stamina.fading) fade.set(stamina.fadeK);
    }
    if (rescueOut > 0) { rescueOut = Math.max(0, rescueOut - Math.max(dt, 1 / 60)); fade.set(rescueOut / 0.8); }
    tube.visible = stamina.fading;
    if (tube.visible) { tube.position.set(p.x, Math.max(p.y + 0.55, -0.1 + Math.sin(t * 2.2) * 0.06), p.z); tube.rotation.set(Math.sin(t * 1.7) * 0.08, t * 0.3, Math.cos(t * 1.3) * 0.08); }
    const diving = pl.mode === 'dive' && !pl.mounted;
    if (dt > 0 && !(pl.locked && !diving)) {
      if (tank.tick(dt, diving) === 'out') {
        pl.mode = 'swim';
        diveY = null;
        st.emit({ type: 'oxygen-out', where: 'sea' });
        game.ui.toast('숨 참기 끝! 뽀글뽀글 위로~ 🫧');
      }
      if (diving && tank.ratio < 0.3 && !o2Warned) { o2Warned = true; game.ui.toast('산소가 얼마 안 남았어요! 🫧 (C 로 떠오르기)'); }
      if (!diving) o2Warned = false;
    }
    if (diving && !diveHinted) { diveHinted = true; game.ui.toast('보글보글 거품 그림자에 다가가 E 로 잡아요! 🫧'); }
    if (diving && game.input.hit('Space')) pl.mode = 'swim';
    applyDeepDive(dt);

    // ── 머리 위 링 ──
    const showO2 = diving;
    const showSt = swimming && !stamina.fading && (stamina.value < stamina.max - 0.5 || coastDist > STAMINA.recoverDist);
    camRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
    // 머리 오른쪽 위(머리 위는 잡은 생물을 들어 올리는 자리라 비워 둔다)
    const headY = p.y + 1.45;
    oxygenRing.group.visible = showO2;
    staminaRing.group.visible = showSt;
    if (showO2) { oxygenRing.set(tank.ratio); tv.set(p.x, headY, p.z).addScaledVector(camRight, 0.5); oxygenRing.place(tv, cam, t); }
    if (showSt) { staminaRing.set(stamina.ratio); tv.set(p.x, headY + (showO2 ? 0.46 : 0), p.z).addScaledVector(camRight, 0.5); staminaRing.place(tv, cam, t); }

    // ── 잠수 생물 ──
    // 시간대·날씨가 바뀐 자리: 안 보이거나 20m 밖이면 다시 굴린다(1초마다, 자리마다 구역 날씨로 — rollSpot 과 같은 태그)
    tagCheck -= dt;
    if (tagCheck <= 0) {
      tagCheck = 1;
      for (const s of spots) if (!s.witness && s.rolled && needsReroll(s.tag, spotTag(s), s.dist, !!s.mesh?.visible)) s.rolled = false;
    }
    const near: Spot[] = [];
    const pspeed = Math.hypot(pl.vel.x, pl.vel.z);
    for (const s of spots) {
      s.dist = Math.hypot(s.x - p.x, s.z - p.z);
      if (s.dist > 42) { if (s.mesh) s.mesh.visible = false; continue; }
      if (!s.witness && !s.rolled) rollSpot(s);
      if (!s.sp) { if (s.mesh) s.mesh.visible = false; continue; }
      if (s.witness && !witnessShown(s)) { if (s.mesh) s.mesh.visible = false; continue; }
      // 자리·행동
      const b = s.sp.behavior;
      if (s.dist < 24 && dt > 0) {
        tv.set(s.pos.x - p.x, 0, s.pos.z - p.z);
        const L = Math.hypot(tv.x, tv.z) || 1;
        stepBehaviour(b, s.beh, dt, { dist: Math.hypot(s.pos.x - p.x, s.pos.y - p.y - 0.4, s.pos.z - p.z), speed: pspeed, dx: tv.x / L, dz: tv.z / L }, s.rnd);
      }
      const ph = s.phase + t;
      const hx = s.x + s.beh.ox, hz = s.z + s.beh.oz;
      if (s.sp.habitat === 'swim') {
        const spd = s.witness ? 0.12 : 0.35, a = ph * spd;
        s.pos.set(hx + Math.cos(a) * s.swimR, s.floor + s.hover + Math.sin(ph * 1.3) * 0.15, hz + Math.sin(a) * s.swimR);
      } else if (s.sp.habitat === 'drift') {
        const a = ph * 0.12;
        s.pos.set(hx + Math.cos(a) * 0.9, s.floor + s.hover + Math.sin(ph * 0.8) * 0.4, hz + Math.sin(a * 1.3) * 0.9);
      } else if (s.sp.habitat === 'anemone') {
        s.pos.set(hx + Math.cos(ph) * 0.35, s.floor + 0.35 + Math.sin(ph * 2) * 0.06, hz + Math.sin(ph) * 0.35);
      } else {
        const slow = b === 'slow' ? Math.sin(ph * 0.25) * 0.5 : 0;
        s.pos.set(hx + slow, s.floor - 0.02 + s.beh.y, hz + (b === 'slow' ? Math.cos(ph * 0.21) * 0.4 : 0));
      }
      s.pos.y = Math.min(s.pos.y, -0.45);
      near.push(s);
    }
    near.sort((a, b) => a.dist - b.dist);
    // 모델은 가장 가까운 8마리만(18m 안) — 나머지는 거품 그림자로만
    let shown = 0, nsh = 0, nh = 0;
    eyes.begin();
    const showLife = pl.mode === 'dive' || pl.mode === 'swim' || cam.position.y < 2;
    for (const s of near) {
      const sp = s.sp!;
      const hidden = s.beh.mode === 'hidden';
      const visible = showLife && shown < 8 && s.dist < 18 && !hidden;
      const m = visible ? spotMesh(s) : s.mesh;
      if (m) {
        m.visible = visible;
        if (visible) {
          shown++;
          m.position.copy(s.pos);
          const k = s.s * sp.scale;
          if (JELLY_KEYS.has(sp.model) && sp.habitat === 'drift') {
            const pulse = Math.sin((s.phase + t) * 2.4);
            m.scale.set(k * (1 + pulse * 0.08), k * (1 - pulse * 0.08), k * (1 + pulse * 0.08));
          } else {
            const br = breatheScale(t, s.phase % 1), side = 1 + (br - 1) * 0.5;
            m.scale.set(k * side, k * br, k * side);
          }
          if (sp.habitat === 'swim') {
            const a = (s.phase + t) * (s.witness ? 0.12 : 0.35);
            m.rotation.set(0, -a, sp.model === 'ray' || s.witness ? Math.sin((s.phase + t) * 1.6) * 0.12 : 0);
          } else if (s.beh.mode === 'dash' || s.beh.mode === 'hop') {
            m.rotation.set(0, Math.atan2(s.beh.tx - s.beh.fx, s.beh.tz - s.beh.fz), 0);
          } else {
            m.rotation.set(0, s.yaw + Math.sin((s.phase + t) * 0.7) * 0.35, 0);
          }
          m.updateMatrixWorld();
          eyes.add(m.matrixWorld, eyeRig(m.geometry));
        }
      }
      // 거품 그림자: 바닥에 그림자 + 뽀글뽀글(숨어도 거품은 오른다)
      if (showLife && nsh < NSH && s.dist < 40 && !s.witness) {
        const sy = s.floor < FLOOR_REACH ? s.pos.y - 0.6 : s.floor + 0.05;
        const r = Math.max(0.3, (SHADOW_M[sp.shadow ?? 'S'] ?? 0.55) * 0.5) * (hidden ? 1.15 : 1);
        tmpM.compose(tmpP.set(s.pos.x, sy, s.pos.z), tmpQ.identity(), tmpS.set(r, 1, r * 0.8));
        shadowIm.setMatrixAt(nsh++, tmpM);
        for (let i = 0; i < NBUB && nh < NSH * NBUB; i++) {
          const life = (t * (0.45 + i * 0.07) + i * 0.23 + s.phase) % 1;
          hintPos[nh * 3] = s.pos.x + Math.sin(t * 3 + i * 2 + s.phase) * 0.08 + (i - 2) * 0.05;
          hintPos[nh * 3 + 1] = Math.min(-0.1, sy + 0.1 + life * 1.9);
          hintPos[nh * 3 + 2] = s.pos.z + Math.cos(t * 2.6 + i * 1.7) * 0.08;
          nh++;
        }
      }
    }
    eyes.end();
    shadowIm.count = nsh;
    shadowIm.instanceMatrix.needsUpdate = true;
    hintGeo.setDrawRange(0, nh);
    hintGeo.attributes.position.needsUpdate = true;
    hintPts.visible = nh > 0;

    // 꿀꺽호 곰치·깃발
    if (gg) {
      gg.moray.position.x = GG_SPOTS.moray.x + 0.15 + Math.sin(t * 0.9) * 0.18;
      gg.moray.rotation.y = Math.PI / 2 + Math.sin(t * 0.7) * 0.25;
      gg.flag.rotation.y = Math.sin(t * 0.8) * 0.15;
      if (gg.sparkle.visible) gg.sparkle.scale.setScalar(0.6 + 0.15 * Math.sin(t * 3));
    }

    // 부표 출렁(파도와 같은 식)
    for (const b of buoys) {
      const ph = (b.userData.phase as number) + t;
      b.position.y = -0.28 + ocean.waveAt(b.position.x, b.position.z, t) * 1.2;
      b.rotation.x = Math.sin(ph * 1.1) * 0.08 * (game.env?.waveMul ?? 1);
      b.rotation.z = Math.cos(ph * 0.9) * 0.08 * (game.env?.waveMul ?? 1);
    }

    // 바다 근처인가(수면 위 생기는 물가·바다에서만)
    const nearSea = seaAt(p.x, p.z) || seaAt(p.x + 25, p.z) || seaAt(p.x - 25, p.z) || seaAt(p.x, p.z + 25) || seaAt(p.x, p.z - 25);
    const onSea = seaAt(p.x, p.z) && island.heightAt(p.x, p.z) < -2;

    // 갈매기: 플레이어 위를 크게 돈다(물속에선 안 보이니 끈다)
    const wlCam = island.waterLevelAt(cam.position.x, cam.position.z);
    gullRoot.visible = nearSea && !(Number.isFinite(wlCam) && cam.position.y < wlCam - 0.05);
    if (nearSea) {
      const gx = p.x - Math.sin(game.cam.yaw) * 12, gz = p.z - Math.cos(game.cam.yaw) * 12;
      if (dt === 0 || gullCenter.lengthSq() === 0) gullCenter.set(gx, 0, gz);
      else gullCenter.lerp(tv.set(gx, 0, gz), Math.min(1, dt * 0.4));
      gulls.forEach((g, i) => {
        const a = g.ph + t * g.sp;
        tmpE.set(0, -a + Math.PI, 0.35);
        gullM.compose(tmpP.set(gullCenter.x + Math.cos(a) * g.r, g.h + Math.sin(t * 0.7 + g.ph) * 1.5, gullCenter.z + Math.sin(a) * g.r), tmpQ.setFromEuler(tmpE), tmpS.setScalar(2.4));
        gullIm[0].setMatrixAt(i, gullM);
        const f = Math.sin(t * 7 + g.ph * 3) * 0.55;
        for (const side of [1, -1]) {
          tmpE.set(0, 0, f * side);
          wingM.compose(tmpP.set(0.08 * side, 0.06, 0), tmpQ.setFromEuler(tmpE), tmpS.setScalar(1));
          gullIm[side > 0 ? 1 : 2].setMatrixAt(i, tmpM.multiplyMatrices(gullM, wingM));
        }
      });
      for (const im of gullIm) im.instanceMatrix.needsUpdate = true;
    }

    // 돌고래: 바다 위에 있을 때 옆에서 뛰어오른다
    // 바다 세계(seaworld)의 고래길·돌고래 경주가 떠 있으면 내 것은 숨긴다(두 마리가 겹치지 않게)
    const swCur = (game.ext as { currents?: { whale?(): { visible: boolean }; dolphins?(): { active: boolean } } }).currents;
    let swWhale = false, swPod = false;
    try { swWhale = !!swCur?.whale?.().visible; swPod = !!swCur?.dolphins?.().active; } catch { /* 없으면 그대로 */ }
    pod.active += ((onSea && pl.mode !== 'dive' && !swPod ? 1 : 0) - pod.active) * Math.min(1, dt * 0.5 + (dt === 0 ? 1 : 0));
    dolRoot.visible = pod.active > 0.05;
    dolEyes.begin();
    if (dolRoot.visible) {
      const yaw = pl.mounted ? pl.yaw : game.cam.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const wantX = p.x + fx * 14 - fz * 7, wantZ = p.z + fz * 14 + fx * 7;
      if (dt === 0 || pod.x === 0) { pod.x = wantX; pod.z = wantZ; }
      else { pod.x += (wantX - pod.x) * Math.min(1, dt * 0.6); pod.z += (wantZ - pod.z) * Math.min(1, dt * 0.6); }
      dolphins.forEach((d, i) => {
        const cyc = 3.2, tt = (t + i * 0.55) % cyc, jump = 1.25;
        const lx = (i - 2) * 2.2 + Math.sin(i * 1.7) * 1.2, lz = Math.cos(i * 2.1) * 2.5;
        const ox = pod.x + fz * lx + fx * lz, oz = pod.z - fx * lx + fz * lz;
        let y = -1.4, pitch = 0;
        if (tt < jump) {
          const u = tt / jump;
          y = -0.6 + Math.sin(u * Math.PI) * (i === 4 ? 2.2 : 3.2);
          pitch = (0.5 - u) * 1.6;
        }
        const adv = (tt / cyc) * 6 - 3;
        d.position.set(ox + fx * adv, y, oz + fz * adv);
        d.rotation.set(-pitch, Math.atan2(fx, fz), 0, 'YXZ');
        d.updateMatrixWorld();
        dolEyes.add(d.matrixWorld, dolRig);
        const since = tt - jump;
        if (since > 0 && since < 0.8) {
          const k = since / 0.8;
          tmpM.compose(tmpP.set(ox + fx * (adv), 0.05, oz + fz * (adv)), tmpQ.identity(), tmpS.setScalar(0.4 + k * 1.6));
          splashes.setColorAt(i, splashC.setScalar(0.8 * (1 - k)));
        } else tmpM.copy(ZERO_M);
        splashes.setMatrixAt(i, tmpM);
      });
      splashes.instanceMatrix.needsUpdate = true;
      if (splashes.instanceColor) splashes.instanceColor.needsUpdate = true;
    }
    dolEyes.end();

    // 고래: 먼바다에서 가끔 숨 쉬러 올라온다
    // 먼바다 판정은 체력 링과 같은 보정 해안 거리(coastDist)로 — 세계 샘플은 먼바다에서 틀릴 때가 있다
    const far = coastDist > 120 && onSea && !swWhale;
    whaleState.on += ((far ? 1 : 0) - whaleState.on) * Math.min(1, dt * 0.3 + (dt === 0 ? 1 : 0));
    whale.visible = whaleState.on > 0.05;
    if (whale.visible) {
      const yaw = game.cam.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      if (whaleState.x === 0 || dt === 0) { whaleState.x = p.x + fx * 55 + fz * 22; whaleState.z = p.z + fz * 55 - fx * 22; whaleState.yaw = Math.atan2(-fz, fx); }
      whaleState.x += Math.sin(whaleState.yaw) * dt * 1.5;
      whaleState.z += Math.cos(whaleState.yaw) * dt * 1.5;
      if (Math.hypot(whaleState.x - p.x, whaleState.z - p.z) > 180) whaleState.x = 0;
      const cyc = 14, tt = t % cyc;
      const surf = Math.sin(Math.min(1, tt / 7) * Math.PI);
      whale.position.set(whaleState.x, -3.2 + surf * 2.4, whaleState.z);
      whale.rotation.set(0, whaleState.yaw, 0);
      whaleM.rotation.x = Math.sin(t * 0.4) * 0.05;
      // 분수: 수면에 올라왔을 때
      const st2 = tt - 2;
      spout.forEach((s, i) => {
        const k = ((i / spout.length) + st2 * 0.9) % 1;
        const on = st2 > 0 && st2 < 4.5;
        s.visible = on;
        if (!on) return;
        const ang = i * 2.39996, spread = k * 1.6;
        s.position.set(Math.cos(ang) * spread * 1.4, 2.4 + k * 7 - k * k * 3, 3.2 + Math.sin(ang) * spread * 1.4);
        s.scale.setScalar(1.0 + k * 2.2);
      });
      spoutMat.opacity = 0.85;
    }

    // 물속인가(카메라 기준)
    const wl = island.waterLevelAt(cam.position.x, cam.position.z);
    const under = Number.isFinite(wl) && cam.position.y < wl - 0.05;
    tint.style.opacity = under ? '1' : '0';
    bubbles.visible = under || pl.mode === 'dive';
    snow.visible = under;
    rays.visible = under;
    if (under || pl.mode === 'dive') {
      // 거품: 플레이어 입가에서 보글보글 + 주변에서 떠오르는 것
      const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      for (let i = 0; i < NB; i++) {
        const a = bSeed[i * 3], b = bSeed[i * 3 + 1], c = bSeed[i * 3 + 2];
        if (i < 60) {
          const life = (t * 0.6 + a) % 1;
          bPos[i * 3] = p.x + Math.sin(t * 3 + i) * 0.12 * life + (b - 0.5) * 0.2;
          bPos[i * 3 + 1] = Math.min(-0.05, p.y + 1.1 + life * 4);
          bPos[i * 3 + 2] = p.z + Math.cos(t * 2.6 + i) * 0.12 * life + (c - 0.5) * 0.2;
        } else {
          const rise = (t * (0.4 + c * 0.5) + a * 30) % 30;
          bPos[i * 3] = cx + (a - 0.5) * 30 + Math.sin(t * 2 + i) * 0.1;
          bPos[i * 3 + 1] = Math.min(-0.05, cy - 12 + rise);
          bPos[i * 3 + 2] = cz + (b - 0.5) * 30;
        }
      }
      bubbleGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < NS; i++) {
        const a = sSeed[i * 3], b = sSeed[i * 3 + 1], c = sSeed[i * 3 + 2];
        const S = 24;
        const wrap = (v: number, c0: number) => c0 + ((((v - c0) % S) + S * 1.5) % S) - S / 2;
        sPos[i * 3] = wrap(a * 400 + Math.sin(t * 0.3 + i) * 0.5, cx);
        sPos[i * 3 + 1] = Math.min(-0.1, wrap(b * 400 - t * 0.08, cy));
        sPos[i * 3 + 2] = wrap(c * 400 + Math.cos(t * 0.25 + i) * 0.5, cz);
      }
      snowGeo.attributes.position.needsUpdate = true;
      // 빛줄기: 수면에서 아래로, 카메라를 향해
      const floor = island.heightAt(p.x, p.z);
      for (let i = 0; i < NRAY; i++) {
        const a = i * 2.39996, rr = 4 + (i % 4) * 4.5;
        const x = p.x + Math.cos(a + t * 0.02) * rr, z = p.z + Math.sin(a + t * 0.02) * rr;
        const len = Math.max(4, -floor + 1);
        tmpE.set(0, Math.atan2(cam.position.x - x, cam.position.z - z), 0.18);
        tmpM.compose(tmpP.set(x, 0, z), tmpQ.setFromEuler(tmpE), tmpS.set(1.2 + (i % 3) * 0.9, len, 1));
        rays.setMatrixAt(i, tmpM);
      }
      rays.instanceMatrix.needsUpdate = true;
      rayMat.opacity = 0.12 + 0.05 * Math.sin(t * 0.8);
    }
  });

  // 새 날: 오늘 잡은 자리·뜯은 해초를 비운다
  st.on((e) => {
    if (e.type === 'day') {
      of = OF();
      if (rollOceanDay(of, dayNow())) {
        caughtToday.clear(); pickedToday.clear();
        for (const s of spots) { s.rolled = false; s.greeted = false; }
        for (const h of harvest.values()) if (h.im && h.orig) { h.im.setMatrixAt(h.idx, h.orig); h.im.instanceMatrix.needsUpdate = true; }
        st.save();
      }
      if (gg) { gg.lid.rotation.x = chestOpenToday() ? -1.9 : 0; gg.sparkle.visible = !chestOpenToday(); gg.spyglass.visible = !spyglassTaken(); }
    } else if (e.type === 'unlock') {
      unlockCheck = 0;
    }
  });
  game.onWorld((w) => { if (w !== 'earth') { tint.style.opacity = '0'; fade.set(0); } });

  // ───────── 디버그 훅 ─────────
  const dive = (x: number, z: number, above = 1.2) => {
    const pl = game.player;
    const y = Math.max(island.heightAt(x, z), wreckFloorAt(x, z)) + above;
    pl.teleport(x, z);
    pl.mode = 'dive';
    pl.body.setTranslation({ x, y: y + pl.footOff, z }, true);
    pl.body.setNextKinematicTranslation({ x, y: y + pl.footOff, z });
    pl.pos.set(x, y, z);
    diveY = y;
    return pl.pos.clone();
  };
  (window as unknown as { __ocean?: unknown }).__ocean = {
    sites, jars, spots, harvest, seaAt, mats: { caust, reefMat },
    ggulkkeok: () => ({ base: { ...ggBase }, chest: chestPos.clone(), spyglass: spyPos.clone(), built: !!gg, open: chestOpenToday() }),
    /** 잠수 순간이동: (x, z) 바닥 위 above m */
    dive,
    /** 꿀꺽호 선실 앞 갑판으로 잠수 */
    wreck: () => { const at = ggW(new THREE.Vector3(GG_SPOTS.chest.x - 0.4, GG_SPOTS.chest.y, GG_SPOTS.chest.z + 2.2)); return dive(at.x, at.z, 0.8); },
    chest: () => openGgChest(),
    oxygen: (v?: number) => { if (typeof v === 'number') tank.set(v); return { value: tank.value, max: tank.max }; },
    stamina: (v?: number) => {
      if (typeof v === 'number') stamina.set(v);
      const p = game.player.pos;
      return { value: stamina.value, max: stamina.max, fading: stamina.fading, swimming: isSwim(), coast: +coastDistNow(p.x, p.z, 0).toFixed(1) };
    },
    /** 바로 튜브 구조(페이드 건너뜀) */
    rescue: () => { stamina.set(stamina.max); return doRescue(); },
    zoneAt: (x: number, z: number) => ({ dive: diveZoneAt(x, z), ...seaInfo(x, z) }),
    /** 가까운 잠수 자리(종·행동·거리) */
    list: () => [...spots].filter((s) => s.dist < 42).sort((a, b) => a.dist - b.dist).map((s) => ({ key: s.key, zone: s.zone, id: s.sp?.id ?? null, beh: s.beh.mode, dist: +s.dist.toFixed(1), floor: +s.floor.toFixed(2), shown: !!s.mesh?.visible, x: +s.pos.x.toFixed(2), y: +s.pos.y.toFixed(2), z: +s.pos.z.toFixed(2) })),
    /** 가장 가까운 생물 앞으로 붙어서 잡기(행동 상태 무시하고 잡을 수 있을 때까지 기다리지 않는다) */
    catchNear: () => {
      const s = [...spots].filter((x) => x.sp && !x.witness).sort((a, b) => a.dist - b.dist)[0];
      if (!s) return null;
      s.beh.mode = 'idle';
      const id = s.sp!.id;
      catchSpot(s);
      return id;
    },
    greet: () => { const g = greetable(game.player); return g ? greet(g.id) : false; },
    witnesses: witnessList,
  };
  return root;
}
