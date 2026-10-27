// secrets — 숨은 곳 12곳(GDD 2.2.2: 말랑섬·쿵쿵공룡섬·솜눈섬·반딧불버섯섬) + 동굴 실내 + 섬 동굴 입구(PLACES.caves).
// 자리는 core PLACES.hidden(결정적). 바깥 모델은 청크(secrets-spots · secrets-caves, 장식은 detail 레이어 secrets-dress)로만 짓고,
// 실내는 ext.interiors.register 로 먼 실내 자리(슬롯 20~26)에 둔다. 처음 찾으면 secret-found{id} 한 번 + 발견 카드.
//  ① 말랑섬: 폭포 뒤 동굴(실내 — 별조각 받침, 별조각은 story 가 준다 · 금상자) · 절벽 아래 비밀 해변(아침 05~09시에만 금상자, 하루 한 번)
//            · 그루터기 원형 광장(보름 밤에만 요정 버섯 링이 춤춘다 → 보름마다 선물)
//  ② 공룡섬: 분화구 용암석 정원(금상자 · 하루 화산유리) · 고대 벽화 동굴(실내 — "로켓 탄 공룡") · 해안 거품동굴(실내 → 해저 거품동굴 잠수)
//  ③ 솜눈섬: 빙하 속 아기 매머드(따뜻한 것 3개 또는 모닥불 → 녹으면 econ.unlock('dino:z_mammoth')) · 오로라 밤에만 열리는 얼음 동굴(실내)
//            · 눈사태 상자 무덤(삽으로 눈 더미 4개, 날마다 다시 묻힌다)
//  ④ 버섯섬: 버섯 탑 꼭대기 달 관측대(밤 — 망원경 · 금상자) · 늪 위 둥둥 오두막(연잎 징검다리 + 실내) · 잠든 거인 나무 속 방(실내)
//  섬 동굴 입구 14곳: 아치 + 꾸밈, E '동굴 탐험하기' → 하루 한 번 돌·섬 특산 재료.
//
// game.ext.secrets (주인: secrets) = {
//   ids → MySecret[] · found(id?) → boolean | string[] · list() → [{id, island, name, found, open, x, y, z}]
//   isOpen(id) → boolean(시간·날씨 문) · spot(id) → {x, y, z, rotY} · mammoth() → MammothState · discover(id) → boolean(디버그·다른 모듈)
// }
// 내보내는 이벤트: secret-found{id}(한 번) · chest 는 econ.openChest 가 chest-open 을 쏜다 · unlock 은 economy 가.
// flags.secrets = secrets/logic.ts SecretsFlags { v, found{id:day}, chest{key}, daily{key:day}, fairy, mammoth, aval{day, dug[]} }
// 디버그: window.__secrets = { list(), found(), state(), go(id), enter(id), discover(id), open(id), force(id, on|null), heat(), fire(), thaw(),
//   dig(i), fairy(), reset(), spots() }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import type { PhysBody } from '../core/physics';
import { START_HOUR, HOUR_SEC, DAY_SEC, type ChestTier } from '../core/api';
import {
  MY_SECRETS, SECRETS, GATES, gateOpen, shouldFind, moonCycle, usedToday, HOT_ITEMS, HOT_NAMES, THAW_NEED, CAMPFIRE_COST,
  mammothStep, ensureFlags, foundCard, avalancheTier, AVALANCHE_MOUNDS, DAILY, rollDaily, FAIRY_GIFT, ISLAND_KO,
  type MySecret, type SecretsFlags, type MammothEvent, type GateEnv,
} from './secrets/logic';
import { buildSpotModel, caveEntrance, ANCHORS, type SpotModel, type SpotState } from './secrets/outdoor';
import { buildRoom, roomFloor, ROOM_LOOK, type RoomId, type RoomModel } from './secrets/rooms';
import { disposeTree, G } from './secrets/kit';

export const order = 30;

type XZ = { x: number; z: number };
interface Pose { x: number; y: number; z: number; rotY: number; island: string; /** 바닥이 지형이 아님(탑 꼭대기·늪 위) */ raised: boolean }

/** 실내 자리 번호(interiors 0 집 · 1 박물관 · 2~ 다른 모듈 — 숨은 곳 A 는 20~26) */
const ROOM_SLOT: Record<RoomId, number> = { waterfall: 20, mural: 21, bubble: 22, dive: 23, aurora: 24, hut: 25, tree: 26 };
/** 실내 → 그 실내가 속한 숨은 곳 */
const ROOM_OF: Record<RoomId, MySecret> = {
  waterfall: 'home-waterfall-cave', mural: 'dino-mural-cave', bubble: 'dino-bubble-cave', dive: 'dino-bubble-cave',
  aurora: 'ice-aurora-cave', hut: 'mush-swamp-hut', tree: 'mush-tree-room',
};
const ROOM_IDS = Object.keys(ROOM_SLOT) as RoomId[];
const roomKey = (r: RoomId) => (r === 'dive' ? 'secrets:dino-bubble-dive' : `secrets:${ROOM_OF[r]}`);
/** 숨은 곳 → 문으로 들어가는 실내 */
const DOOR_ROOM: Partial<Record<MySecret, RoomId>> = {
  'home-waterfall-cave': 'waterfall', 'dino-mural-cave': 'mural', 'dino-bubble-cave': 'bubble', 'ice-aurora-cave': 'aurora',
  'mush-swamp-hut': 'hut', 'mush-tree-room': 'tree',
};
/** 실내 하루 줍기 */
const ROOM_DAILY: Partial<Record<RoomId, { anchor: string; gift: keyof typeof DAILY }>> = {
  mural: { anchor: 'pick', gift: 'mural' }, dive: { anchor: 'clam', gift: 'bubble' }, aurora: { anchor: 'crystal', gift: 'aurora' },
  hut: { anchor: 'cauldron', gift: 'cauldron' }, tree: { anchor: 'basket', gift: 'tree' },
};
/** 섬 동굴 탐험(하루 한 번) */
const CAVE_FIND: Record<string, Array<{ id: string; n: number }>> = {
  home: [{ id: 'm_stone', n: 2 }, { id: 'm_iron', n: 1 }], dino: [{ id: 'm_stone', n: 2 }, { id: 'm_volcanic', n: 1 }],
  ice: [{ id: 'm_stone', n: 2 }, { id: 'm_icecrystal', n: 1 }], mushroom: [{ id: 'm_spore', n: 2 }, { id: 'm_glowcap', n: 1 }],
  coral: [{ id: 'm_shell', n: 3 }, { id: 'm_coral', n: 1 }], desert: [{ id: 'm_clay', n: 2 }, { id: 'm_sandglass', n: 1 }],
  launch: [{ id: 'm_stone', n: 2 }, { id: 'm_meteor', n: 1 }],
};
const FROG_LINES = ['개굴! 손님이 다 오네? 솥은 마음껏 들여다봐 🐸', '늪 위에 떠 있으면 밤마다 반딧불이가 놀러 와 ✨', '개굴개굴~ 버섯 수프는 아직 비밀 레시피야!', '연잎은 미끄러우니 콩콩 천천히 건너 와 🍃'];

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const g: Game = game;
  const st = g.state;
  const I = ctx.island;

  // ───────────── 저장 ─────────────
  let flagsObj: SecretsFlags | null = null;
  const F = (): SecretsFlags => {
    if (!flagsObj || st.flags.secrets !== flagsObj) { flagsObj = ensureFlags(st.flags.secrets); st.flags.secrets = flagsObj; }
    return flagsObj;
  };
  const save = () => st.save();
  const toast = (s: string) => g.ui.toast(s);

  // ───────────── 시계·문 ─────────────
  const hourNow = () => g.env?.hour ?? (START_HOUR + g.time / HOUR_SEC) % 24;
  const dayNow = () => Math.floor(g.env?.day ?? g.econ?.day?.() ?? 0);
  const gameSecNow = () => g.env?.gameSec ?? dayNow() * DAY_SEC + hourNow() * HOUR_SEC;
  /** 디버그 강제(id → 열림/닫힘) */
  const forced = new Map<MySecret, boolean>();
  const gateEnv: GateEnv = {
    get hour() { return hourNow(); },
    get fullMoon() { return g.env?.fullMoon ?? false; },
    weatherOf: (r: string) => { try { return g.env?.weatherOf?.(r) ?? 'clear'; } catch { return 'clear'; } },
  };
  const isOpen = (id: MySecret) => forced.get(id) ?? gateOpen(id, gateEnv);
  /** 0(낮)..1(밤) — 등불·반딧불 세기 */
  const nightK = () => {
    const h = ((hourNow() % 24) + 24) % 24;
    if (h >= 20 || h < 5) return 1;
    if (h >= 18) return (h - 18) / 2;
    if (h < 6.5) return 1 - (h - 5) / 1.5;
    return 0;
  };

  // ───────────── 경제(없으면 state 로) ─────────────
  const give = (id: string, n: number) => {
    try { if (g.econ?.give) return g.econ.give(id, n, 'secret'); } catch (e) { console.error('[secrets] give', e); }
    st.addItem(id, n);
    return n;
  };
  const hasItem = (id: string, n = 1) => (st.bag[id] ?? 0) >= n;
  const takeItem = (id: string, n = 1) => { if (!hasItem(id, n)) return false; st.addItem(id, -n); return true; };
  const unlocked = (k: string) => { try { return g.econ?.isUnlocked?.(k) ?? true; } catch { return true; } };
  const openChest = (tier: ChestTier, where: string) => {
    try { if (g.econ?.openChest) return g.econ.openChest(tier, where); } catch (e) { console.error('[secrets] openChest', e); }
    const coins = tier === 'gold' ? 5000 : tier === 'silver' ? 1500 : 300;
    st.addCoins(coins, 'chest');
    toast(`상자에서 도파코인 ${coins.toLocaleString()}!`);
    return null;
  };
  const giftLine = (items: Array<{ id: string; n: number }>) => items.map((it) => `${itemName(it.id)} ×${it.n}`).join(' · ');
  const itemName = (id: string) => st.species.get(id)?.name ?? NAME_FALLBACK[id] ?? id;

  // ───────────── 자리(결정적, 처음 읽을 때 계산) ─────────────
  const H = (x: number, z: number) => I.heightAt(x, z);
  /** 내리막 방향(입구가 열린 쪽) */
  const downhill = (x: number, z: number) => {
    const e = 3, gx = (H(x + e, z) - H(x - e, z)) / (2 * e), gz = (H(x, z + e) - H(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz) > 1e-3 ? Math.atan2(-gx, -gz) : 0;
  };
  const facing = (p: XZ, to: XZ) => Math.atan2(to.x - p.x, to.z - p.z);
  const poses = new Map<MySecret, Pose>();
  const poseOf = (id: MySecret): Pose => {
    let p = poses.get(id);
    if (p) return p;
    const hid = (I.PLACES.hidden as Record<string, { x: number; z: number; island: string; water?: boolean }>)[id];
    const isl = I.islandById(hid.island);
    if (id === 'mush-moon-deck') {
      const md = g.ext.village?.moonDeck as { x: number; y: number; z: number } | undefined;
      const deckY = md && md.y > 1 ? md.y : H(hid.x, hid.z) + 56.2;
      p = { x: md?.x ?? hid.x, y: deckY + 0.25, z: md?.z ?? hid.z, rotY: 0, island: hid.island, raised: true };
    } else if (id === 'dino-lava-garden') {
      // 가파른 분화구 벽 — 평평한 돌 테라스(윗면 = 뿌리)에 정원을 앉힌다
      p = { x: hid.x, y: H(hid.x, hid.z) + 0.3, z: hid.z, rotY: downhill(hid.x, hid.z), island: hid.island, raised: true };
    } else if (id === 'mush-swamp-hut') {
      const wl = I.waterLevelAt(hid.x, hid.z);
      const toShore = isl ? facing(hid, isl) : 0;
      p = { x: hid.x, y: (Number.isFinite(wl) ? wl : H(hid.x, hid.z)) + 0.05, z: hid.z, rotY: toShore, island: hid.island, raised: true };
    } else {
      const rotY = id === 'mush-tree-room' && isl ? facing(hid, isl) : id === 'home-cliff-beach' && isl ? facing(isl, hid) : downhill(hid.x, hid.z);
      p = { x: hid.x, y: H(hid.x, hid.z), z: hid.z, rotY, island: hid.island, raised: false };
    }
    poses.set(id, p);
    return p;
  };
  /** 로컬(자리 기준) → 월드 */
  const toWorld = (p: Pose, l: readonly number[], onGround = true) => {
    const c = Math.cos(p.rotY), s = Math.sin(p.rotY);
    const x = p.x + c * l[0] + s * l[2], z = p.z - s * l[0] + c * l[2];
    const y = p.raised || !onGround ? p.y + l[1] : Math.max(H(x, z), p.y - 4) + l[1];
    return new THREE.Vector3(x, y, z);
  };
  const anchorOf = (id: MySecret, a: string) => toWorld(poseOf(id), ANCHORS[id][a] ?? [0, 0, 0]);
  /** 늪 연잎 징검다리 길이(물가까지) */
  const padLen = () => {
    const hid = (I.PLACES.hidden as Record<string, XZ>)['mush-swamp-hut'];
    const p = poseOf('mush-swamp-hut');
    const c = Math.cos(p.rotY), s = Math.sin(p.rotY);
    for (let d = 6; d < 80; d += 1) {
      const x = hid.x + s * d, z = hid.z + c * d;
      if (!Number.isFinite(I.waterLevelAt(x, z)) || I.waterLevelAt(x, z) < H(x, z)) return d + 1.5;
    }
    return 50;
  };

  // ───────────── 발견 ─────────────
  const discover = (id: MySecret): boolean => {
    const f = F();
    if (f.found[id] !== undefined) return false;
    f.found[id] = dayNow();
    save();
    st.emit({ type: 'secret-found', id });
    const c = foundCard(id, f.found);
    g.hud.card({ ...c, ms: 5200 });
    g.player.act('cheer', 1.2);
    return true;
  };
  const isFound = (id: MySecret) => F().found[id] !== undefined;

  // ───────────── 바깥 모델(청크) ─────────────
  const live = new Map<MySecret, { model: SpotModel; root: THREE.Object3D }>();
  const caveLive = new Map<string, THREE.Object3D>();
  const statics = new Map<THREE.Object3D, PhysBody[]>();
  const addCols = (obj: THREE.Object3D, p: Pose, cols: SpotModel['cols']) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
    const list: PhysBody[] = statics.get(obj) ?? [];
    for (const c of cols) {
      const w = toWorld(p, c.p, false);
      try { list.push(g.physics.addStatic(c.shape, { x: w.x, y: w.y, z: w.z }, q, 'secrets')); } catch (e) { console.error('[secrets] addStatic', e); }
    }
    statics.set(obj, list);
  };
  const dropCols = (obj: THREE.Object3D) => { for (const b of statics.get(obj) ?? []) { try { b.remove(); } catch { /* 이미 없음 */ } } statics.delete(obj); };
  const groundFn = (p: Pose) => (lx: number, lz: number) => {
    if (p.raised) return 0;
    const w = toWorld(p, [lx, 0, lz], false);
    // 너무 깊이 파묻히거나 높이 뜨지 않게
    return THREE.MathUtils.clamp(H(w.x, w.z) - p.y, -3, 3);
  };
  /** 물 위 뗏목·연잎 바닥(모델이 살아 있을 때만) — 순간이동·안전망이 물에 빠뜨리지 않게 */
  const deckAt = (x: number, z: number): number | null => {
    for (const [id, v] of live) {
      if (!v.model.deck) continue;
      const p = poseOf(id);
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz > 80 * 80) continue;
      const c = Math.cos(p.rotY), s = Math.sin(p.rotY);
      const h = v.model.deck(c * dx - s * dz, s * dx + c * dz);
      if (h !== null) return Math.max(p.y + h, H(x, z));
    }
    return null;
  };
  try { g.addGroundProvider?.((x, z) => (g.world === 'earth' ? deckAt(x, z) : null), 'secrets-deck'); } catch (e) { console.error('[secrets] ground', e); }
  const inCell = (x: number, z: number, c: { x0: number; z0: number; size: number }) => x >= c.x0 && x < c.x0 + c.size && z >= c.z0 && z < c.z0 + c.size;

  g.chunks.add({
    key: 'secrets-spots', size: 128, radius: 420, world: 'earth',
    build: (c) => {
      let grp: THREE.Group | null = null;
      for (const id of MY_SECRETS) {
        const hid = (I.PLACES.hidden as Record<string, XZ>)[id];
        if (!inCell(hid.x, hid.z, c)) continue;
        const p = poseOf(id);
        const model = buildSpotModel(id, ctx.rng(`secrets:${id}`), { padLen: id === 'mush-swamp-hut' ? padLen() : undefined, ground: groundFn(p) });
        model.root.position.set(p.x, p.y, p.z);
        model.root.rotation.y = p.rotY;
        grp ??= new THREE.Group();
        grp.name = 'secrets-chunk';
        grp.add(model.root);
        model.root.userData.secretId = id;
        addCols(model.root, p, model.cols);
        live.set(id, { model, root: model.root });
        // 처음 모습(멀어서 매 프레임 갱신을 안 돌려도 문·상자 상태는 맞게)
        try { model.update(0, spotState(id, nightK())); } catch (e) { console.error('[secrets] first update', e); }
      }
      return grp;
    },
    dispose: (obj) => {
      obj.traverse((o) => {
        const id = o.userData.secretId as MySecret | undefined;
        if (id && live.get(id)?.root === o) live.delete(id);
        if (statics.has(o)) dropCols(o);
      });
      if (mammothBody && !live.has('ice-mammoth')) { mammothBody.remove(); mammothBody = null; }
      disposeTree(obj);
    },
  });

  const CAVES = I.PLACES.caves;
  g.chunks.add({
    key: 'secrets-caves', size: 128, radius: 320, world: 'earth',
    build: (c) => {
      let grp: THREE.Group | null = null;
      CAVES.forEach((cv, i) => {
        if (!inCell(cv.x, cv.z, c)) return;
        const p: Pose = { x: cv.x, y: H(cv.x, cv.z), z: cv.z, rotY: cv.rotY, island: cv.island, raised: false };
        const o = caveEntrance(cv.island, i, ctx.rng(`secrets:cave:${cv.id}`), groundFn(p));
        o.position.set(p.x, p.y, p.z);
        o.rotation.y = p.rotY;
        o.name = `secrets-cave-${cv.id}`;
        grp ??= new THREE.Group();
        grp.add(o);
        addCols(o, p, [
          { shape: { kind: 'box', hx: 0.6, hy: 1.4, hz: 0.7 }, p: [-2.3, 1.4, 0] },
          { shape: { kind: 'box', hx: 0.6, hy: 1.4, hz: 0.7 }, p: [2.3, 1.4, 0] },
        ]);
        caveLive.set(cv.id, o);
      });
      return grp;
    },
    dispose: (obj) => {
      obj.traverse((o) => { if (statics.has(o)) dropCols(o); });
      for (const [k, o] of caveLive) if (o.parent === obj || o === obj) caveLive.delete(k);
      disposeTree(obj);
    },
  });

  // 장식(detail): 숨은 곳 둘레 작은 꽃·조약돌·눈뭉치·버섯 — 한 칸에 InstancedMesh 몇 개
  const DRESS: Record<string, string[]> = {
    home: ['#ffd1e8', '#fff3a8', '#c8d8ff', '#ffffff'], dino: ['#ff9a6a', '#ffcf6a', '#8fd07a', '#ffb0a0'],
    ice: ['#ffffff', '#e6f4ff', '#c8f0ff', '#e0d0ff'], mushroom: ['#ff8a9a', '#b48cf0', '#c8ffb0', '#ffb347'],
  };
  g.chunks.add({
    key: 'secrets-dress', size: 128, radius: 170, world: 'earth', detail: true,
    build: (c) => {
      let grp: THREE.Group | null = null;
      for (const id of MY_SECRETS) {
        const hid = (I.PLACES.hidden as Record<string, XZ>)[id];
        if (!inCell(hid.x, hid.z, c)) continue;
        const p = poseOf(id);
        if (p.raised) continue;
        const r = ctx.rng(`secrets:dress:${id}`);
        const cols = DRESS[p.island] ?? DRESS.home;
        const per = 14;
        // 색은 instanceColor — 한 곳에 그리기 하나
        const m = new THREE.InstancedMesh(G.sphereLo(), dressMat('#ffffff'), per * cols.length);
        m.castShadow = false;
        m.count = 0;
        const tint = cols.map((c) => new THREE.Color(c));
        const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
        for (let i = 0; i < per * cols.length; i++) {
          const a = r() * Math.PI * 2, rr = 9 + r() * 9;
          const x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
          const sf = I.surfaceAt(x, z);
          if (sf.kind === 'sea' || sf.kind === 'river' || sf.kind === 'lava' || Number.isFinite(I.waterLevelAt(x, z)) && I.waterLevelAt(x, z) > sf.h) continue;
          const sz = 0.18 + r() * 0.2;
          M.compose(v.set(x, H(x, z) + sz * 0.3, z), q.setFromAxisAngle(v.clone().set(0, 1, 0), r() * 6), s.set(sz, sz * 0.7, sz));
          m.setColorAt(m.count, tint[i % tint.length]);
          m.setMatrixAt(m.count++, M);
        }
        if (!m.count) { m.dispose(); continue; }
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
        grp ??= new THREE.Group();
        grp.name = 'secrets-dress';
        grp.add(m);
      }
      return grp;
    },
    // 공유 구(sphereLo)·재질은 두고 InstancedMesh 버퍼만 놓는다
    dispose: (obj) => disposeTree(obj),
  });

  // ───────────── 아기 매머드 ─────────────
  let mammothBody: PhysBody | null = null;
  let freeAge = F().mammoth.phase === 'free' ? 999 : 0;
  let thawSaveT = 0;
  const mammothDo = (ev: MammothEvent) => {
    const f = F();
    const { s, fx } = mammothStep(f.mammoth, ev);
    f.mammoth = s;
    if (fx.includes('heat')) { toast(`🔥 따끈따끈… (${s.heat}/${THAW_NEED})`); save(); }
    if (fx.includes('fire')) { toast('🔥 모닥불이 활활! 얼음이 녹기 시작해요'); save(); }
    if (fx.includes('thaw-start')) { g.hud.banner({ text: '얼음이 녹고 있어요! 💧', sub: '아기 매머드가 꼼지락꼼지락', icon: '🦣', color: '#bfe6ff' }); g.audio?.sfx('splash'); save(); }
    if (fx.includes('free')) {
      freeAge = 0;
      discover('ice-mammoth');
      try { g.econ?.unlock?.('dino:z_mammoth', 'secret'); } catch (e) { console.error('[secrets] unlock mammoth', e); }
      g.hud.card({ title: '아기 매머드가 친구가 됐어요!', body: '꽁꽁 언 몸이 다 녹았어요. 이제 눈사람 마을(간헐천 골짜기)에서 놀고 있을 거예요 🦣💕', icon: '🦣', color: '#ffc8a8', ms: 6000 });
      g.player.act('cheer', 1.6);
      g.audio?.sfx('achievement');
      mammothBody?.remove(); mammothBody = null;
      save();
    }
    return fx;
  };
  const hotInBag = () => HOT_ITEMS.find((id) => hasItem(id));
  const placeHot = () => {
    const id = hotInBag();
    if (!id) { toast('🧊 얼음이 너무 차가워요! 화산유리·생선구이 같은 따뜻한 것 3개, 또는 F 로 모닥불을 피워 봐요'); return; }
    if (!takeItem(id)) return;
    g.player.act('pick', 0.6);
    mammothDo({ type: 'heat' });
  };
  const lightFire = () => {
    const cost = { items: { ...CAMPFIRE_COST } };
    const ok = g.econ?.spend ? g.econ.spend(cost, 'secrets:campfire') : takeItem('m_wood', CAMPFIRE_COST.m_wood);
    if (!ok) { toast(`🪵 모닥불엔 나무 ${CAMPFIRE_COST.m_wood}개가 필요해요`); return; }
    g.player.act('pick', 0.8);
    mammothDo({ type: 'fire' });
  };

  // ───────────── 상호작용(바깥) ─────────────
  const onEarthOut = () => g.world === 'earth' && !curRoom();
  const ix = g.ext.interiors as undefined | {
    register(def: unknown): () => void; enter(id: string): boolean; exit(): boolean; current(): string | null; origin(i: number): { x: number; y: number; z: number };
  };
  const curRoom = (): RoomId | null => {
    const c = ix?.current?.() ?? null;
    if (!c) return null;
    for (const r of ROOM_IDS) if (roomKey(r) === c) return r;
    return null;
  };
  const enterRoom = (r: RoomId) => {
    if (ix?.enter?.(roomKey(r))) return true;
    // 실내 담당이 없으면(테스트·룩) 발견만
    discover(ROOM_OF[r]);
    return false;
  };
  const point = (id: string, pos: () => THREE.Vector3, radius: number, label: string | (() => string), onUse: () => void, enabled: () => boolean, key?: string) =>
    g.addInteractable({ id: `secrets:${id}`, position: pos, radius, label, onUse, enabled, ...(key ? { key } : {}) });

  // 문(실내로)
  const DOOR_LABEL: Partial<Record<MySecret, string>> = {
    'home-waterfall-cave': '폭포 뒤 동굴로 들어가기 💧', 'dino-mural-cave': '벽화 동굴로 들어가기 🎨', 'dino-bubble-cave': '거품동굴로 들어가기 🫧',
    'ice-aurora-cave': '오로라 얼음 동굴로 들어가기 🌌', 'mush-swamp-hut': '오두막에 들어가기 🛖', 'mush-tree-room': '거인 나무 속으로 들어가기 🌳',
  };
  for (const [sid, room] of Object.entries(DOOR_ROOM) as Array<[MySecret, RoomId]>) {
    const gated = !!GATES[sid];
    point(`door:${sid}`, () => anchorOf(sid, 'door'), 2.6,
      () => (gated && !isOpen(sid) ? '꽁꽁 언 얼음 문 🧊' : DOOR_LABEL[sid] ?? '들어가기'),
      () => { if (gated && !isOpen(sid)) { toast(GATES[sid]!.hint); return; } enterRoom(room); },
      onEarthOut);
  }
  // ② 비밀 해변 아침 금상자
  point('beach-chest', () => anchorOf('home-cliff-beach', 'chest'), 2.4, '아침 금상자 열기 🌅',
    () => {
      const f = F(), d = dayNow();
      if (usedToday(f.daily, 'beach', d) || !isOpen('home-cliff-beach')) return;
      f.daily.beach = d; save();
      discover('home-cliff-beach');
      g.player.act('cheer', 1.0);
      openChest('gold', `secret:home-cliff-beach:${d}`);
    },
    () => onEarthOut() && isOpen('home-cliff-beach') && !usedToday(F().daily, 'beach', dayNow()));
  // ③ 요정 버섯 링
  point('fairy', () => anchorOf('home-fairy-ring', 'center'), 3.2,
    () => (!isOpen('home-fairy-ring') ? '조용한 그루터기 광장 🌿' : F().fairy === moonCycle(gameSecNow()) ? '요정들이 춤추는 중… 💫' : '요정 춤에 끼기 🧚'),
    () => useFairy(),
    onEarthOut);
  /** 보름 밤 요정 춤에 끼기(보름마다 선물 한 번) */
  function useFairy() {
    if (!isOpen('home-fairy-ring')) { toast(GATES['home-fairy-ring']!.hint); return; }
    discover('home-fairy-ring');
    const f = F(), cyc = moonCycle(gameSecNow());
    if (f.fairy === cyc) { toast('요정들이 고맙다며 빙글빙글~ 다음 보름에 또 와요 🌕'); return; }
    f.fairy = cyc; save();
    g.player.act('cheer', 1.6);
    for (const it of FAIRY_GIFT.items) give(it.id, it.n);
    try { g.econ?.addStars?.(FAIRY_GIFT.stars, 'secret:fairy'); } catch { /* 없음 */ }
    g.hud.card({ title: '요정들과 춤을 췄어요!', body: `반짝반짝 요정 선물: ${giftLine([...FAIRY_GIFT.items])} · 반짝별 ${FAIRY_GIFT.stars} ✨`, icon: '🧚', color: '#ffb8e8', ms: 5200 });
  }
  // ④ 용암석 정원
  point('lava-pick', () => anchorOf('dino-lava-garden', 'pick'), 2.2, DAILY.lava.label, () => dailyGift('lava', 'dino-lava-garden'),
    () => onEarthOut() && !usedToday(F().daily, 'lava', dayNow()));
  // ⑦ 아기 매머드
  point('mammoth', () => anchorOf('ice-mammoth', 'block'), 2.8,
    () => {
      const m = F().mammoth;
      if (m.phase === 'thawing') return '얼음이 녹는 중… 💧';
      const id = hotInBag();
      return id ? `따뜻한 ${HOT_NAMES[id] ?? id} 놓기 🔥 (${m.heat}/${THAW_NEED})` : `얼음 속 아기 매머드 🦣 (${m.heat}/${THAW_NEED})`;
    },
    () => { if (F().mammoth.phase === 'frozen') placeHot(); },
    () => onEarthOut() && F().mammoth.phase !== 'free');
  point('campfire', () => anchorOf('ice-mammoth', 'fire'), 3.0, `모닥불 피우기 🔥 (나무 ${CAMPFIRE_COST.m_wood})`, lightFire,
    () => onEarthOut() && F().mammoth.phase === 'frozen' && !F().mammoth.fire, 'KeyF');
  // ⑨ 눈사태 상자 무덤
  const avalDug = (): boolean[] => {
    const f = F(), d = dayNow();
    if (f.aval.day !== d) return Array.from({ length: AVALANCHE_MOUNDS }, () => false);
    return Array.from({ length: AVALANCHE_MOUNDS }, (_, i) => f.aval.dug.includes(i));
  };
  let digging: { i: number; until: number } | null = null;
  const digMound = (i: number) => {
    if (digging) return;
    if (!unlocked('tool:shovel')) {
      const why = (() => { try { return g.econ?.requirement?.('tool:shovel')?.text; } catch { return ''; } })();
      toast(`🪏 ${why || '삽이 있어야 팔 수 있어요! 작업대에서 만들어 봐요'}`);
      return;
    }
    if (avalDug()[i]) return;
    digging = { i, until: g.time + 0.9 };
    g.player.lock('secrets');
    g.player.act('dig', 0.9);
    g.audio?.sfx('dig');
  };
  const finishDig = (i: number) => {
    const f = F(), d = dayNow();
    if (f.aval.day !== d) f.aval = { day: d, dug: [] };
    if (f.aval.dug.includes(i)) return;
    f.aval.dug.push(i);
    save();
    discover('ice-avalanche');
    const tier = avalancheTier(ctx.rng(`secrets:aval:${d}:${i}`));
    g.player.act('cheer', 0.9);
    openChest(tier, `secret:ice-avalanche:${d}:${i}`);
  };
  for (let i = 0; i < AVALANCHE_MOUNDS; i++) {
    point(`aval:${i}`, () => anchorOf('ice-avalanche', `m${i}`), 2.2, '눈 더미 파기 🪏', () => digMound(i), () => onEarthOut() && !avalDug()[i] && !digging);
  }
  // ⑩ 달 관측대
  point('moon-scope', () => anchorOf('mush-moon-deck', 'scope'), 2.2,
    () => (isOpen('mush-moon-deck') ? DAILY.moon.label : '망원경 🔭 (밤에 달이 보여요)'),
    () => { if (!isOpen('mush-moon-deck')) { toast(GATES['mush-moon-deck']!.hint); return; } discover('mush-moon-deck'); dailyGift('moon', 'mush-moon-deck'); },
    () => onEarthOut() && (!isOpen('mush-moon-deck') || !usedToday(F().daily, 'moon', dayNow())));
  // 한 번 상자(바깥)
  for (const sid of ['dino-lava-garden', 'mush-moon-deck'] as const) {
    point(`chest:${sid}`, () => anchorOf(sid, 'chest'), 2.2, '숨은 금상자 열기 ✨', () => onceChest(sid), () => onEarthOut() && !F().chest[sid]);
  }
  // 섬 동굴 탐험
  CAVES.forEach((cv) => {
    const p: Pose = { x: cv.x, y: H(cv.x, cv.z), z: cv.z, rotY: cv.rotY, island: cv.island, raised: false };
    const at = toWorld(p, [0, 0, 1.6]);
    point(`cave:${cv.id}`, () => at, 2.4, '동굴 탐험하기 🔦', () => {
      const f = F(), d = dayNow(), key = `cave:${cv.id}`;
      if (usedToday(f.daily, key, d)) { toast('오늘은 다 둘러봤어요. 내일 또 와요 🔦'); return; }
      f.daily[key] = d; save();
      g.player.act('pick', 0.8);
      const items = CAVE_FIND[cv.island] ?? CAVE_FIND.home;
      for (const it of items) give(it.id, it.n);
      toast(`🔦 동굴 안쪽에서 ${giftLine(items)} 발견!`);
    }, () => onEarthOut() && !usedToday(F().daily, `cave:${cv.id}`, dayNow()));
  });

  function dailyGift(key: keyof typeof DAILY, sid: MySecret) {
    const f = F(), d = dayNow(), gift = DAILY[key];
    if (usedToday(f.daily, gift.key, d)) { toast('오늘은 벌써 챙겼어요. 내일 또 와요 ✨'); return; }
    f.daily[gift.key] = d; save();
    discover(sid);
    const items = rollDaily(gift, ctx.rng(`secrets:daily:${gift.key}:${d}`));
    for (const it of items) give(it.id, it.n);
    g.player.act('pick', 0.8);
    toast(`${gift.line} (${giftLine(items)})`);
  }
  function onceChest(sid: MySecret) {
    const f = F();
    if (f.chest[sid]) return;
    const tier = SECRETS[sid].chest ?? 'silver';
    f.chest[sid] = true; save();
    discover(sid);
    g.player.act('cheer', 1.0);
    openChest(tier, `secret:${sid}`);
  }

  // ───────────── 실내 ─────────────
  const rooms = new Map<RoomId, RoomModel>();
  const roomOrigin = (r: RoomId) => {
    const o = ix?.origin?.(ROOM_SLOT[r]) ?? { x: -20000 + ROOM_SLOT[r] * 300, y: 600, z: 0 };
    return new THREE.Vector3(o.x, o.y, o.z);
  };
  const ROOM_R = (r: RoomId) => ROOM_LOOK[r].R;
  const roomAt = (r: RoomId, l: readonly number[]) => roomOrigin(r).add(new THREE.Vector3(l[0], l[1], l[2]));
  /** 바깥 문 앞(나오면 서는 자리) — 물 위 오두막은 뗏목 위(땅 공급자가 그 높이를 맡는다) */
  const outsideOf = (r: RoomId) => {
    const sid = ROOM_OF[r];
    const a = ANCHORS[sid].door ?? [0, 0, 1.6];
    const p = poseOf(sid);
    if (p.raised) {
      const w = toWorld(p, [a[0], 0, a[2] + 0.4]);
      w.y = deckAt(w.x, w.z) ?? w.y;
      return w;
    }
    return toWorld(p, [a[0], 0, a[2] + 1.6]);
  };
  const roomState = (r: RoomId) => {
    const sid = ROOM_OF[r];
    const f = F(), d = dayNow();
    const dk = ROOM_DAILY[r];
    const chestKey = r === 'dive' ? 'dino-bubble-dive' : sid;
    return {
      chest: !f.chest[chestKey],
      daily: dk ? !usedToday(f.daily, DAILY[dk.gift].key, d) : false,
      star: r === 'waterfall' ? !st.has('it_starpiece_1') : undefined,
    };
  };
  if (ix?.register) {
    for (const r of ROOM_IDS) {
      const sid = ROOM_OF[r], meta = SECRETS[sid];
      const origin = roomOrigin(r);
      const ensure = () => {
        let m = rooms.get(r);
        if (!m) { m = buildRoom(r, ctx.rng(`secrets:room:${r}`)); m.root.position.copy(origin); rooms.set(r, m); }
        return m;
      };
      ix.register({
        id: roomKey(r),
        name: r === 'dive' ? '🫧 해저 거품동굴' : meta.room ?? meta.name,
        sub: r === 'dive' ? '거품 길을 따라 퐁당!' : `${ISLAND_KO[meta.island]}의 숨은 곳`,
        color: meta.color,
        origin,
        build: () => ensure().root,
        floorAt: (x: number, z: number) => (roomFloor(rooms.get(r)?.R ?? ROOM_R(r), x - origin.x, z - origin.z) === null ? null : origin.y),
        spawn: () => roomAt(r, ensure().spawn),
        exitTo: () => outsideOf(r),
        door: () => outsideOf(r),
        colliders: () => ensure().cols.map((b) => ({ ...b, x: b.x + origin.x, y: b.y + origin.y, z: b.z + origin.z })),
        get cam() { const m = ensure(); return { dist: m.cam.dist, pitch: m.cam.pitch, yaw: 0 }; },
        lightAt: () => roomAt(r, ensure().light),
        backdrop: ROOM_LOOK[r].backdrop,
        onEnter: () => { discover(sid); },
        update: (t: number) => { const m = rooms.get(r); if (m) m.update(t, roomState(r)); },
      });
    }
  }
  const inRoom = (r: RoomId) => () => curRoom() === r;
  for (const r of ROOM_IDS) {
    const m = () => rooms.get(r) ?? null;
    const at = (a: string) => () => { const mm = m(); return roomAt(r, mm?.anchors[a] ?? mm?.exit ?? [0, 0, 0]); };
    // 나가기
    point(`room-exit:${r}`, () => { const mm = m(); return roomAt(r, mm?.exit ?? [0, 0, ROOM_R(r) - 0.8]); }, 1.8,
      r === 'dive' ? '위로 올라가기 🫧' : '밖으로 나가기 🚪',
      () => { if (r === 'dive') ix?.enter?.(roomKey('bubble')); else ix?.exit?.(); },
      inRoom(r));
    // 한 번 상자
    const chestKey = r === 'dive' ? 'dino-bubble-dive' : ROOM_OF[r];
    const tier: ChestTier = r === 'waterfall' ? 'gold' : 'silver';
    point(`room-chest:${r}`, at('chest'), 2.0, tier === 'gold' ? '숨은 금상자 열기 ✨' : '숨은 은상자 열기 ✨', () => {
      const f = F();
      if (f.chest[chestKey]) return;
      f.chest[chestKey] = true; save();
      g.player.act('cheer', 1.0);
      openChest(tier, `secret:${chestKey}`);
    }, () => inRoom(r)() && !F().chest[chestKey]);
    // 하루 줍기
    const dk = ROOM_DAILY[r];
    if (dk) point(`room-daily:${r}`, at(dk.anchor), 2.2, DAILY[dk.gift].label, () => dailyGift(dk.gift, ROOM_OF[r]),
      () => inRoom(r)() && !usedToday(F().daily, DAILY[dk.gift].key, dayNow()));
  }
  point('room-star', () => roomAt('waterfall', rooms.get('waterfall')?.anchors.star ?? [0, 0, -2.2]), 2.4,
    () => (st.has('it_starpiece_1') ? '별조각이 있던 자리 ✨' : '반짝이는 별조각 살펴보기 ⭐'),
    () => {
      if (st.has('it_starpiece_1')) { toast('받침이 아직도 따끈따끈 반짝여요 ✨'); return; }
      g.hud.card({ title: '반짝이는 별조각!', body: '하늘에서 떨어진 별조각 ①이 받침 위에서 반짝여요. 곰 몽실이에게 얼른 알려 주자 🐻⭐', icon: '⭐', color: '#fff0a8', ms: 5200 });
      g.player.act('cheer', 1.0);
    }, inRoom('waterfall'));
  point('room-pool', () => roomAt('bubble', rooms.get('bubble')?.anchors.pool ?? [0, 0, -0.8]), 2.4, '거품 웅덩이로 잠수하기 🫧',
    () => { g.audio?.sfx('dive'); ix?.enter?.(roomKey('dive')); }, inRoom('bubble'));
  let frogN = 0;
  point('room-frog', () => roomAt('hut', rooms.get('hut')?.anchors.frog ?? [2.4, 0, 1.4]), 2.0, '개구리 아줌마와 이야기 🐸',
    () => { toast(FROG_LINES[frogN++ % FROG_LINES.length]); g.audio?.sfx('talk-blip'); }, inRoom('hut'));

  // ───────────── 지도: 찾은 곳 별표 ─────────────
  g.hud.registerMapLayer({
    id: 'secrets', order: 45,
    draw(g2, toPx, scale, world) {
      if (world !== 'earth') return;
      const f = F();
      g2.save();
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      const fs = Math.max(12, Math.min(22, 16 * Math.sqrt(scale * 6)));
      g2.font = `${fs}px Jua, sans-serif`;
      for (const id of MY_SECRETS) {
        if (f.found[id] === undefined) continue;
        const hid = (I.PLACES.hidden as Record<string, XZ>)[id];
        const [x, y] = toPx(hid.x, hid.z);
        g2.fillStyle = '#fff8e8ee';
        g2.beginPath(); g2.arc(x, y, fs * 0.62, 0, Math.PI * 2); g2.fill();
        g2.fillText(SECRETS[id].icon, x, y + 1);
      }
      g2.restore();
    },
  });

  // ───────────── 매 프레임 ─────────────
  /** 곳마다 상태 그릇 하나(매 프레임 새로 만들지 않는다) */
  const spotStates = new Map<MySecret, SpotState>();
  const dugBuf = Array.from({ length: AVALANCHE_MOUNDS }, () => false);
  const spotState = (id: MySecret, night: number): SpotState => {
    const f = F(), d = dayNow();
    let s = spotStates.get(id);
    if (!s) { s = { open: false, night: 0, found: false, chest: true, daily: true }; spotStates.set(id, s); }
    s.open = isOpen(id); s.night = night; s.found = isFound(id); s.chest = !f.chest[id]; s.daily = true;
    if (id === 'home-cliff-beach') s.daily = !usedToday(f.daily, 'beach', d);
    else if (id === 'dino-lava-garden') s.daily = !usedToday(f.daily, 'lava', d);
    else if (id === 'mush-moon-deck') s.daily = !usedToday(f.daily, 'moon', d);
    else if (id === 'ice-mammoth') { s.mammoth = f.mammoth; s.freeAge = freeAge; }
    else if (id === 'ice-avalanche') {
      const today = f.aval.day === d;
      for (let i = 0; i < AVALANCHE_MOUNDS; i++) dugBuf[i] = today && f.aval.dug.includes(i);
      s.dug = dugBuf;
    }
    return s;
  };
  /** 이보다 먼 곳은 움직임을 안 돌린다(m) */
  const UPDATE_R = 120;
  const NEAR: MySecret[] = MY_SECRETS.filter((id) => SECRETS[id].find !== 'enter');
  let findT = 0;
  g.onUpdate((t, dt) => {
    if (g.world !== 'earth') return;
    // 눈사태 파기 마무리
    if (digging && g.time >= digging.until) { const i = digging.i; digging = null; g.player.unlock('secrets'); finishDig(i); }
    // 매머드 녹이기(실제 초)
    const mm = F().mammoth;
    if (mm.phase === 'thawing') {
      mammothDo({ type: 'tick', dt: dt > 0 ? dt : 0 });
      thawSaveT += dt;
      if (thawSaveT > 1) { thawSaveT = 0; save(); }
    } else if (mm.phase === 'free') freeAge += dt;
    // 매머드 얼음 충돌체(얼어 있는 동안만)
    if (live.has('ice-mammoth') && mm.phase !== 'free' && !mammothBody) {
      const p = poseOf('ice-mammoth');
      try {
        const c = toWorld(p, [0, 0, 0.1]);
        mammothBody = g.physics.addStatic({ kind: 'box', hx: 1.3, hy: 1.25, hz: 1.45 }, { x: c.x, y: c.y + 1.25, z: c.z }, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY), 'secrets');
      } catch (e) { console.error('[secrets] mammoth body', e); }
    }
    // 바깥 모델 움직임(가까운 곳만)
    const pp0 = g.player.pos, nk = nightK();
    for (const [id, v] of live) {
      if (!v.root.visible) continue;
      const p = poseOf(id);
      if (Math.hypot(pp0.x - p.x, pp0.z - p.z) > UPDATE_R) continue;
      v.model.update(t, spotState(id, nk));
    }
    // 가까이 가면 발견(0.2초마다)
    findT -= dt > 0 ? dt : 1 / 60;
    if (findT > 0 || curRoom()) return;
    findT = 0.2;
    const pp = g.player.pos;
    for (const id of NEAR) {
      if (isFound(id)) continue;
      const p = poseOf(id);
      const dy = Math.abs(pp.y - p.y);
      if (dy > (p.raised && id !== 'dino-lava-garden' ? 4 : 14)) continue;
      const d = Math.hypot(pp.x - p.x, pp.z - p.z);
      if (shouldFind(id, { dist: d, env: forcedEnv(id) })) discover(id);
    }
  });
  /** 디버그 강제가 있으면 그 값으로 보는 문 env */
  const forcedEnv = (id: MySecret): GateEnv => {
    const fv = forced.get(id);
    if (fv === undefined) return gateEnv;
    // 강제 열림: 모든 시험이 통과하는 env / 강제 닫힘: 아무것도 안 열리는 env
    return fv
      ? { hour: GATES[id] && id === 'home-cliff-beach' ? 6 : 23, fullMoon: true, weatherOf: () => 'aurora' }
      : { hour: 12, fullMoon: false, weatherOf: () => 'clear' };
  };

  // ───────────── game.ext.secrets ─────────────
  const list = () => MY_SECRETS.map((id) => { const p = poseOf(id); return { id, island: SECRETS[id].island, name: SECRETS[id].name, found: isFound(id), open: isOpen(id), x: p.x, y: p.y, z: p.z }; });
  const api = {
    ids: MY_SECRETS,
    found: (id?: string) => (id === undefined ? MY_SECRETS.filter(isFound) : isFound(id as MySecret)),
    list,
    isOpen: (id: MySecret) => isOpen(id),
    spot: (id: MySecret) => { const p = poseOf(id); return { x: p.x, y: p.y, z: p.z, rotY: p.rotY }; },
    mammoth: () => ({ ...F().mammoth }),
    discover: (id: MySecret) => (MY_SECRETS.includes(id) ? discover(id) : false),
  };
  g.ext.secrets = api;

  // ───────────── window.__secrets ─────────────
  if (typeof window !== 'undefined') {
    const roomFor = (id: string): RoomId | null => {
      if (id === 'dive' || id === 'dino-bubble-dive') return 'dive';
      if ((ROOM_IDS as string[]).includes(id)) return id as RoomId;
      return DOOR_ROOM[id as MySecret] ?? null;
    };
    (window as unknown as { __secrets?: unknown }).__secrets = {
      list,
      found: () => api.found(),
      state: () => JSON.parse(JSON.stringify(F())),
      spots: () => Object.fromEntries(MY_SECRETS.map((id) => [id, api.spot(id)])),
      /** 그 숨은 곳 앞으로(바깥) — 실내 곳은 문 앞 */
      go: (id: MySecret) => {
        if (curRoom()) ix?.exit?.();
        const p = poseOf(id);
        const a = DOOR_ROOM[id] ? outsideOf(DOOR_ROOM[id]!) : id === 'dino-lava-garden' ? toWorld(p, [-5.0, 0, 1.6]) : toWorld(p, [0, 0, id === 'home-fairy-ring' ? 7.5 : id === 'mush-tree-room' ? 9 : id === 'home-cliff-beach' ? 3 : 6]);
        g.player.teleport(a.x, a.z, p.raised ? a.y + 0.7 : undefined);
        g.player.yaw = p.rotY;
        g.cam.yaw = p.rotY;
        return { x: a.x, y: a.y, z: a.z };
      },
      enter: (id: string) => { const r = roomFor(id); return r ? (ix?.enter?.(roomKey(r)) ?? false) : false; },
      exit: () => ix?.exit?.(),
      discover: (id: MySecret) => api.discover(id),
      open: (id: MySecret) => isOpen(id),
      /** 문 열림 강제(true/false), null 이면 원래대로 */
      force: (id: MySecret, on: boolean | null) => { if (on === null) forced.delete(id); else forced.set(id, on); return isOpen(id); },
      heat: () => { const id = hotInBag() ?? 'm_volcanic'; if (!hasItem(id)) give(id, 1); placeHot(); return { ...F().mammoth }; },
      fire: () => { if (!hasItem('m_wood', CAMPFIRE_COST.m_wood)) give('m_wood', CAMPFIRE_COST.m_wood); lightFire(); return { ...F().mammoth }; },
      thaw: () => { if (F().mammoth.phase === 'frozen') mammothDo({ type: 'fire' }); mammothDo({ type: 'tick', dt: 999 }); return { ...F().mammoth }; },
      dig: (i = 0) => { finishDig(Math.max(0, Math.min(AVALANCHE_MOUNDS - 1, i))); return avalDug(); },
      fairy: () => { forced.set('home-fairy-ring', true); useFairy(); return F().fairy; },
      reset: () => { st.flags.secrets = ensureFlags({}); flagsObj = null; freeAge = 0; save(); return F(); },
      live: () => [...live.keys()],
    };
  }

}

/** 이름표(state 에 종이 없을 때) */
const NAME_FALLBACK: Record<string, string> = {
  m_volcanic: '화산유리', m_amber: '호박', m_shell: '조개껍데기', m_coral: '산호 조각', m_pearl: '진주', m_icecrystal: '얼음 결정',
  m_glowcap: '발광 버섯', m_spore: '버섯 포자', m_hardwood: '단단한 나무', m_stardust: '별가루', it_capsule: '캡슐 티켓',
  m_stone: '돌', m_iron: '철광석', m_clay: '점토', m_sandglass: '모래유리', m_meteor: '운석 조각', m_wood: '나무',
};

const dressMats = new Map<string, THREE.MeshStandardMaterial>();
/** 장식 알갱이 재질(색별 공유) */
function dressMat(c: string) {
  let m = dressMats.get(c);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }); m.userData.shared = true; dressMats.set(c, m); }
  return m;
}
