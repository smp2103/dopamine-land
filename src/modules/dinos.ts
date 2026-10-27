// 공룡: 잡지 않고 친해진다(GDD 3.7). 공룡섬·솜눈섬 구역별 무리(청크 스트리밍), 둥지 절벽 둥지, 하늘의 슝슝이,
// 고대 호수·앞바다 목욕룡, 먼바다 모사 그림자, 티노 낮잠 언덕(스텔스 + 꼭대기 금상자).
// - 하트(flags.dino.hearts): 먹이 +1(좋아하는 먹이 +2, 물고기는 ★마다 +1), 쓰다듬기 하루 1번 +0.5, 부탁 +1. 종마다 하루 최대 +2.
//   친구 하트(P0 2 / 정식 5)에 닿으면 econ.unlock('dino:<id>') + 카드, 탈것이면 'v:dino_<짧은 id>' 도. 하트가 오를 때마다 befriend{id, hearts, kind:'dino'}.
//   해금 키 표기(정본): 'dino:' + spec.id 그대로 — 예 dino:dino-trike · dino:z_mammoth(GDD 이름 dino:triceratops·짧은 dino:trike 가 아님).
//   읽을 때는 dino:<spec.gdd> 도 친구로 쳐 준다. 탈것 키는 v:dino_<짧은 id>(v:dino_trike) — 탑승 판정은 이 키를 보면 된다.
// - 털뭉치 매머드는 무리로 안 나온다: secrets 가 빙하를 녹여 dino:z_mammoth 를 풀면 눈사람 마을(간헐천 골짜기)에 한 마리가 산다.
// - 도감: 첫 먹이 또는 3 m 안 E 인사 → showCatch(keep:false, 하트 줄). 슝슝이·목욕룡·모사는 목격만으로(game.witnesses 에도 올린다).
// - 탈것: F(우선순위 30) — 뿔뿔이 돌진(바위 깨기 → 철광석) · 달리미 16 m/s · 슝슝이 활공 · 목욕룡 물 위.
// - 펫: 꼬마프로토·졸졸이(떼 5)·콩콩이·꼬마렉스·털뭉치 매머드·털복숭이 — 하나만 같이 다닌다(flags.dino.pet).
// - 하트 5 선물: 망치꼬리 하루 3번 광석·과일, 박치기 열매(+벌레), 손톱정원사 과일 5개, 슝슝이 깃털 2개, 가구(나팔이 음악 상자·접시등 등판 장식), 사진 포즈.
//
// game.ext.fossils (주인: dinos) = {
//   roll(rng, islandId) → {id, name, rarity}   화석 조각 하나(fos_<공룡>_<skull|body|tail>) — treasure 의 X 파기가 부른다
//   model(id) → THREE.Object3D                조각·골격 모델(잡았다 연출용)
//   pieces: string[]  skeletons: string[]     조각 60 · 골격 20 id
//   parse(id) → {dino, part} | null           partsOf(dino) → 조각 id 3개    skeletonOf(id) → 골격 id
// }
// 화석 X 파기는 treasure 담당(예전 flags['dinos.dug'] 는 건드리지 않고 남겨 둔다 — 아무도 안 읽는다).
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game, Mountable, Input } from '../core/game';
import { applyCurve } from '../core/curve';
import { breathe } from '../core/art';
import { ALT_PRIORITY } from '../core/api';
import { MAT } from './economy/data';
import {
  DINOS, DINO_BY_ID, LAND_DINOS, WITNESS_IDS, FOSSIL_PIECES, FOSSIL_SKELETONS, FOSSIL_BY_ID, allSpecies, rollFossil, parseFossil,
  dinoKey, mountKey, shortId, dinoByAny, type DinoSpec, type DinoZone, type Reward,
} from './dinos/data';
import {
  ensureFlags, applyGain, threshold, heartLine, pickFood, foodValue, remainingToday, awakeAt, habitatAt, speciesFor, pickWeighted,
  dropsLeft, useDrop, requestOfDay, favText, PET_GAIN, REQUEST_GAIN, HEART_MAX, type DinoFlags, type GainKind, type DinoRequest,
} from './dinos/logic';
import { newTino, tinoStep, forceTino, chestCheck, isNap, type TinoState, type TinoMachine } from './dinos/tino';
import {
  makeDino, makePtera, eggGeometry, nestGeometry, fossilModel, heartTexture, sparkleTexture, dinoSkin, flipperGeometry,
  setEyesOpen, poseWings, snotBubble, glyphTexture, goldChest, type DinoRig, type PteraRig,
} from './dinos/build';

export const order = 30;

type AState = 'idle' | 'walk' | 'graze' | 'yawn' | 'flee' | 'approach' | 'follow' | 'ride' | 'look' | 'sleep';

interface Agent {
  id: string;
  spec: DinoSpec;
  rig: DinoRig;
  /** 사는 섬(땅 판정) */
  isl: string;
  x: number; z: number; y: number; yaw: number;
  home: { x: number; z: number };
  state: AState;
  timer: number;
  tx: number; tz: number;
  speed: number;
  phase: number;
  blink: number;
  /** 숨쉬기 위상 0..1(개체마다) */
  bph: number;
  headPitch: number; headYaw: number; lean: number;
  hop: number;
  wag: number;
  /** 청크를 떠나 모듈 그룹에 붙었다(탑승·펫) */
  adopted: boolean;
  /** 같이 다니는 펫 */
  pet: boolean;
  chunk: string | null;
  lastPet: number;
  /** 포즈(엄지척·짜잔) 남은 시간 */
  pose: number;
  /** 부탁 '!' 표시 */
  mark?: THREE.Sprite;
  /** 높은 곳(화산 정상) 허용 */
  high: boolean;
}

interface Nest { key: string; x: number; z: number; y: number; eggs: THREE.Mesh[]; obj: THREE.Object3D }
interface Plesio { rig: DinoRig; flippers: THREE.Object3D[]; cx: number; cz: number; r: number; w: number; ph: number; base: number; x: number; z: number; yaw: number; ride: boolean; lastPet: number; hop: number }

/** 받침 글자(이/가 · 을/를 · 와/과 · 은/는) */
const batchim = (s: string) => { const c = s.charCodeAt(s.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
const jo = (s: string, a: string, b: string) => s + (batchim(s) ? a : b);

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const { island } = ctx;
  const isl = island.islandById('dino')!;
  const iceIsl = island.islandById('ice')!;
  const group = new THREE.Group();
  group.name = 'dinos';
  group.userData.world = 'earth';

  game.state.register(allSpecies());

  // ── 저장(flags.dino) ──
  let fl: DinoFlags = ensureFlags(game.state.flags.dino);
  game.state.flags.dino = fl;
  const F = (): DinoFlags => {
    if (game.state.flags.dino !== fl) { fl = ensureFlags(game.state.flags.dino); game.state.flags.dino = fl; }
    return fl;
  };
  const save = () => game.state.save();
  const day = () => Math.floor(game.env?.day ?? game.econ?.day?.() ?? 0);
  const hour = () => game.env?.hour ?? 12;
  const p0 = () => game.econ?.p0 ?? (typeof location === 'undefined' || new URLSearchParams(location.search).get('p0') !== '0');
  const emit = (type: string, o: Record<string, unknown> = {}) => game.state.emit({ type, ...o });
  const toast = (t: string) => game.ui.toast(t);
  const nm = (id: string) => game.state.species.get(id)?.name ?? MAT.get(id)?.name ?? id;
  const give = (id: string, n: number) => {
    const e = game.econ;
    if (e && typeof e.give === 'function') return e.give(id, n, 'dino');
    game.state.addItem(id, n);
    return n;
  };
  const lookup = (id: string) => { const s = game.state.species.get(id); return s ? { category: s.category, rarity: s.rarity } : undefined; };
  const hearts = (id: string) => F().hearts[id] ?? 0;
  const unlocked = (key: string) => { try { return !!game.econ?.isUnlocked?.(key); } catch { return false; } };
  const isFriend = (s: DinoSpec) => unlocked(dinoKey(s.id)) || unlocked(dinoKey(s.gdd)) || !!F().unlocked[s.id] || hearts(s.id) >= threshold(p0());
  const registered = (id: string) => !!game.state.dex[id];

  const agents = new Set<Agent>();
  const nests = new Map<string, Nest>();

  // ── 공용 리소스 ──
  const heartMat = new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false });
  const sparkMat = new THREE.SpriteMaterial({ map: sparkleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const markMat = new THREE.SpriteMaterial({ map: glyphTexture('!', '#ff7a59'), transparent: true, depthWrite: false });
  const zzzMat = new THREE.SpriteMaterial({ map: glyphTexture('Z', '#6b7dff'), transparent: true, depthWrite: false });
  const nestMat = dinoSkin();
  const eggMat = dinoSkin();

  // ── 땅·구역 판정 ──
  const lakes = island.worldLakes().filter((L) => L.island === 'dino' || L.island === 'ice');
  const features = island.worldFeatures();
  const near = (kind: string, x: number, z: number, k = 1) => features.some((f) => f.island === 'dino' && f.kind === kind && Math.hypot(f.x - x, f.z - z) < f.r * k);
  const lakeNear = (x: number, z: number): string | null => {
    for (const L of lakes) { const d = Math.hypot(L.x - x, L.z - z); if (d < L.r + 32 && d > L.r * 0.8) return L.kind; }
    return null;
  };
  const zoneHere = (x: number, z: number, islandId: string | null): string => {
    try { const zi = game.geo?.zoneAt(x, z); if (zi?.zone) return zi.zone; } catch { /* geo 가 아직 없으면 아래로 */ }
    if (islandId === 'ice') return 'snow';
    if (near('volcano', x, z, 0.9)) return 'volcano';
    if (near('meadow', x, z) || near('tinoHill', x, z, 1.3)) return 'ranch';
    return 'fern';
  };
  const habitatHere = (x: number, z: number): DinoZone | null => {
    const s = island.worldSample(x, z);
    const id = s.island?.id ?? null;
    if (id !== 'dino' && id !== 'ice') return null;
    const h0 = island.heightAt(x, z);
    const steep = Math.abs(island.heightAt(x + 2, z) - island.heightAt(x - 2, z)) + Math.abs(island.heightAt(x, z + 2) - island.heightAt(x, z - 2)) > 3.2;
    return habitatAt({ island: id, zone: zoneHere(x, z, id), coast: s.coast, h: h0, lake: lakeNear(x, z), steep, kind: s.kind });
  };
  const okGround = (x: number, z: number, islandId: string, high = false) => {
    const s = island.worldSample(x, z);
    if (s.island?.id !== islandId || s.coast < 6) return false;
    if (s.kind === 'lava' || (!high && s.h > 40)) return false;
    return island.waterLevelAt(x, z) < s.h + 0.25;
  };
  const slopeOk = (x: number, z: number, y0: number, step: number) => Math.abs(island.heightAt(x, z) - y0) < Math.max(0.5, step * 1.3);

  // ── 개체 만들기 ──
  /** fishing 의 낚시 대결 돛등이 둘레 14 m 안인가 */
  function nearContestSpino(x: number, z: number): boolean {
    try {
      const s = (game?.ext as { spinoContest?: { spot?(): { x: number; z: number } | null } } | undefined)?.spinoContest?.spot?.();
      return !!s && Math.hypot(x - s.x, z - s.z) < 14;
    } catch { return false; }
  }
  function spawn(spec: DinoSpec, x: number, z: number, yaw: number, key: string, parent: THREE.Object3D, chunk: string | null, islandId = spec.home === 'ice' ? 'ice' : 'dino'): Agent {
    const rig = makeDino(spec);
    const y = island.heightAt(x, z);
    rig.root.position.set(x, y, z);
    rig.root.rotation.y = yaw;
    parent.add(rig.root);
    const a: Agent = {
      id: key, spec, rig, isl: islandId, x, z, y, yaw, home: { x, z }, state: 'idle', timer: 0, tx: x, tz: z, speed: 0,
      phase: 0, blink: hashf(key) * 5, bph: hashf(key + ':b'), headPitch: 0, headYaw: 0, lean: 0, hop: 0, wag: 0,
      adopted: false, pet: false, chunk, lastPet: -99, pose: 0, high: spec.zones.includes('summit'),
    };
    agents.add(a);
    return a;
  }

  // 도착 지점(스폰·부두) — 둘레는 비워 두고, 가까이에 여러 종이 섞인 환영 무리
  const WELCOME: Array<{ x: number; z: number }> = [];
  {
    const sp = island.islandSpawnPoints('dino', 1, 0.08)[0];
    if (sp) WELCOME.push(sp);
    const dock = island.PLACES.docks.dino;
    if (dock) {
      const dx = isl.x - dock.x, dz = isl.z - dock.z, l = Math.hypot(dx, dz);
      WELCOME.push({ x: dock.x + (dx / l) * 45, z: dock.z + (dz / l) * 45 });
    }
  }
  const CLEAR = 8;
  const nearWelcome = (x: number, z: number, r: number) => WELCOME.some((w) => Math.hypot(x - w.x, z - w.z) < r);
  const TINO = island.PLACES.tinoHill;
  const nearTino = (x: number, z: number) => Math.hypot(x - TINO.x, z - TINO.z) < 26;
  const WELCOME_MIX = ['dino-trike', 'dino-trike', 'dino-proto', 'dino-proto', 'z_iguanodon', 'z_iguanodon', 'dino-stego', 'dino-pachy', 'dino-brachio', 'dino-galli', 'dino-parasaur'];

  // ── 청크: 구역별 무리·둥지 ──
  const CH = 96;
  game.chunks.add({
    key: 'dinos', size: CH, radius: 200,
    build: ({ cx, cz, x0, z0 }) => {
      const mx = x0 + CH / 2, mz = z0 + CH / 2;
      const onDino = Math.hypot(mx - isl.x, mz - isl.z) < isl.r * 1.25;
      const onIce = Math.hypot(mx - iceIsl.x, mz - iceIsl.z) < iceIsl.r * 1.25;
      if (!onDino && !onIce) return null;
      const islandId = onDino ? 'dino' : 'ice';
      const rnd = ctx.rng(`dinos:${cx},${cz}`);
      const g = new THREE.Group();
      g.userData.dinoChunk = `${cx},${cz}`;
      const ck = `${cx},${cz}`;
      const pool = LAND_DINOS.filter((d) => d.home === islandId);
      // 이 청크 출신인데 지금 모듈 그룹에서 같이 다니는(탄 뒤 남은) 개체는 다시 만들지 않는다(쌍둥이 방지)
      const taken = new Set<string>();
      for (const a of agents) if (a.adopted) taken.add(a.id);
      const herds = islandId === 'dino' ? (rnd() < 0.55 ? 2 : 1) : (rnd() < 0.5 ? 1 : 0);
      let nestZone: { x: number; z: number } | null = null;
      for (let h = 0; h < herds; h++) {
        let hx = 0, hz = 0, zone: DinoZone | null = null;
        for (let k = 0; k < 8 && !zone; k++) {
          hx = x0 + 8 + rnd() * (CH - 16); hz = z0 + 8 + rnd() * (CH - 16);
          zone = nearTino(hx, hz) ? null : habitatHere(hx, hz);
        }
        if (!zone) continue;
        if (zone === 'nest') nestZone = { x: hx, z: hz };
        const spec = pickWeighted(speciesFor(zone, pool), rnd);
        if (!spec) continue;
        const n = spec.herd[0] + Math.floor(rnd() * (spec.herd[1] - spec.herd[0] + 1));
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2, rr = 1.5 + rnd() * 4 * Math.sqrt(spec.scale);
          const x = hx + Math.cos(a) * rr, z = hz + Math.sin(a) * rr;
          if (!okGround(x, z, islandId, spec.zones.includes('summit')) || nearWelcome(x, z, CLEAR + 2)) continue;
          const yaw0 = rnd() * Math.PI * 2, t0 = rnd() * 3;
          if (taken.has(`d:${ck}:${h}:${i}`)) continue;   // 굴림 순서는 그대로(다른 개체 자리가 안 바뀌게)
          if (spec.id === 'dino-spino' && nearContestSpino(x, z)) continue;   // 낚시 대결 돛등이(fishing) 자리와 겹치지 않게
          const ag = spawn(spec, x, z, yaw0, `d:${ck}:${h}:${i}`, g, ck, islandId);
          ag.home = { x: hx, z: hz };
          ag.timer = t0;
        }
      }
      // 둥지 절벽: 알 둥지(쓰다듬으면 톡톡 — 부화는 P1)
      if (nestZone && rnd() < 0.8) {
        const nx = nestZone.x + 5 + rnd() * 3, nz = nestZone.z - 3 + rnd() * 6;
        if (okGround(nx, nz, 'dino')) makeNest(`n:${ck}`, nx, nz, 2 + Math.floor(rnd() * 2), g, rnd);
      }
      // 환영 무리
      for (const w of WELCOME) {
        if (w.x < x0 || w.x >= x0 + CH || w.z < z0 || w.z >= z0 + CH) continue;
        WELCOME_MIX.forEach((id, i) => {
          const sp = DINO_BY_ID.get(id)!;
          const a = (i / WELCOME_MIX.length) * Math.PI * 2 + 0.4, rr = id === 'dino-brachio' ? 24 : 12 + (i % 3) * 4;
          const x = w.x + Math.cos(a) * rr, z = w.z + Math.sin(a) * rr;
          if (!okGround(x, z, 'dino') || taken.has(`w:${ck}:${i}`)) return;
          const ag = spawn(sp, x, z, a + Math.PI, `w:${ck}:${i}`, g, ck);
          ag.home = { x, z };
          ag.timer = 1 + i * 0.7;
        });
      }
      return g;
    },
    dispose: (o) => {
      const ck = o.userData.dinoChunk as string;
      for (const a of [...agents]) if (a.chunk === ck && !a.adopted) { a.mark?.removeFromParent(); agents.delete(a); }
      for (const [k, n] of nests) if (isChild(o, n.obj)) nests.delete(k);
    },
  });

  function makeNest(key: string, x: number, z: number, n: number, parent: THREE.Object3D, rnd: () => number) {
    const y = island.heightAt(x, z);
    const o = new THREE.Group();
    o.position.set(x, y, z);
    const nm0 = new THREE.Mesh(nestGeometry(), nestMat);
    nm0.receiveShadow = true; nm0.castShadow = true;
    o.add(nm0);
    const eggs: THREE.Mesh[] = [];
    for (let i = 0; i < n; i++) {
      const e = new THREE.Mesh(eggGeometry(), eggMat);
      const a = (i / n) * Math.PI * 2 + rnd();
      e.position.set(Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3);
      e.rotation.set((rnd() - 0.5) * 0.3, rnd() * 6, (rnd() - 0.5) * 0.3);
      e.scale.setScalar(0.8 + rnd() * 0.2);
      e.castShadow = true;
      o.add(e);
      eggs.push(e);
    }
    parent.add(o);
    nests.set(key, { key, x, z, y, eggs, obj: o });
  }

  // ── 하트 연출 ──
  const hearts3d: Array<{ s: THREE.Sprite; t0: number; base: THREE.Vector3; vx: number }> = [];
  function burstHearts(at: THREE.Vector3, n = 4) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(heartMat.clone());
      s.scale.setScalar(0.5);
      group.add(s);
      hearts3d.push({ s, t0: game!.time + i * 0.12, base: at.clone().add(new THREE.Vector3((i - n / 2) * 0.25, 0, 0)), vx: (i - n / 2) * 0.15 });
    }
  }
  const sparkles: Array<{ s: THREE.Sprite; t0: number; base: THREE.Vector3; v: THREE.Vector3 }> = [];
  function burstSparkles(at: THREE.Vector3, n = 8) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(sparkMat);
      group.add(s);
      const a = (i / n) * Math.PI * 2;
      sparkles.push({ s, t0: game!.time, base: at.clone(), v: new THREE.Vector3(Math.cos(a) * 1.6, 1.8 + (i % 3) * 0.5, Math.sin(a) * 1.6) });
    }
  }

  // ── 하트·친구·도감 ──
  /** 도감 첫 등록(목격형 기록) — 들어 올리지 않고 공룡 옆에 하트 팡 */
  function register(spec: DinoSpec, line?: string) {
    if (registered(spec.id)) return false;
    game!.ui.showCatch({ species: spec, keep: false, activity: 'dino', line: line ?? `♥ ${heartLine(hearts(spec.id))}` });
    return true;
  }

  function gain(spec: DinoSpec, amount: number, kind: GainKind) {
    const f = F();
    const res = applyGain(f, spec.id, amount, day(), p0());
    if (res.added > 0) emit('befriend', { id: spec.id, hearts: res.hearts, kind: 'dino', why: kind });
    if (res.crossed || (res.hearts >= threshold(p0()) && !unlocked(dinoKey(spec.id)) && !f.unlocked[spec.id])) befriendNow(spec);
    save();
    return res;
  }

  /** 친구가 됐다: 해금 키 + 카드 + 보상 */
  function befriendNow(spec: DinoSpec) {
    const f = F();
    const econ = game!.econ;
    if (econ?.unlock) econ.unlock(dinoKey(spec.id), 'befriend');
    f.unlocked[spec.id] = true;
    const R = spec.reward;
    if (R.kind === 'mount' && econ?.unlock) econ.unlock(mountKey(spec.id), 'befriend');
    if (R.kind === 'item' && !f.gifts[spec.id]) {
      f.gifts[spec.id] = true;
      give(R.item, 1);
    }
    if (R.kind === 'pet' && !f.pet) setPet(spec.id);
    game!.hud.card({
      title: `${jo(spec.name, '과', '와')} 친구가 됐어요!`,
      body: `${R.text}${R.kind === 'mount' ? ' (가까이에서 F)' : R.kind === 'pet' ? ' (F 로 같이 다니기)' : ''}`,
      icon: '💕', color: '#ff9fb8', ms: 4200,
    });
    save();
  }

  /** 하트 5 보상의 하루 선물(망치꼬리·박치기·손톱정원사 + 슝슝이 깃털) */
  type Gift = Extract<Reward, { kind: 'gift' }>;
  const PTERA_FEATHER: Gift = { kind: 'gift', perDay: 2, verb: '깃털 받기', fx: 'feather', items: [{ id: 'm_feather', w: 1 }], text: '하루 깃털 2개' };
  const giftOf = (s: DinoSpec): Gift | null => (s.reward.kind === 'gift' ? s.reward : s.id === 'dino-ptera' ? PTERA_FEATHER : null);

  // ── 오늘의 공룡 부탁 ──
  let reqCache: { day: number; req: DinoRequest | null } = { day: -999, req: null };
  const todayReq = (): DinoRequest | null => {
    const d = day();
    if (reqCache.day !== d) reqCache = { day: d, req: requestOfDay(LAND_DINOS, ctx.rng(`dinos:req:${d}`)) };
    return F().reqDay === d ? null : reqCache.req;
  };
  /** 부탁 물건을 가방에서 고른다(물고기는 조건에 맞는 덜 귀한 것부터) */
  function reqItems(r: DinoRequest): string[] | null {
    const bag = game!.state.bag;
    if (r.item !== 'fish') return (bag[r.item] ?? 0) >= r.n ? Array(r.n).fill(r.item) : null;
    const fish = Object.keys(bag).filter((k) => !k.includes('@') && lookup(k)?.category === 'fish' && (lookup(k)?.rarity ?? 0) >= (r.fish ?? 1))
      .sort((a, b) => (lookup(a)!.rarity - lookup(b)!.rarity) || a.localeCompare(b));
    const out: string[] = [];
    for (const k of fish) for (let i = 0; i < (bag[k] ?? 0) && out.length < r.n; i++) out.push(k);
    return out.length >= r.n ? out : null;
  }
  const reqText = (r: DinoRequest) => (r.item === 'fish' ? `${r.fish && r.fish > 1 ? `★${r.fish}+ ` : ''}물고기 ${r.n}마리` : `${nm(r.item)} ${r.n}개`);
  function fulfillReq(a: { spec: DinoSpec }, r: DinoRequest, items: string[], at: THREE.Vector3) {
    for (const it of items) game!.state.addItem(it, -1);
    F().reqDay = day();
    register(a.spec);
    const res = gain(a.spec, REQUEST_GAIN, 'request');
    give('m_amber', 1);
    burstHearts(at, 5);
    toast(`${a.spec.name}: 고마워! 반짝이는 호박을 줬다 ${heartLine(res.hearts)}`);
  }
  // 다른 담당(주민 부탁 등)이 공룡 부탁을 끝냈다고 알리면 하트 +1
  game.state.on((e) => {
    if (e.type !== 'request-done' || typeof e.dino !== 'string') return;
    const s = dinoByAny(e.dino);
    if (s) gain(s, REQUEST_GAIN, 'request');
  });

  // ── 상호작용(E) ──
  const reachOf = (a: Agent) => a.rig.tpl.radius * a.spec.scale + 1.6;
  const headWorld = (rig: { head: THREE.Object3D }, spec: DinoSpec) => {
    const v = new THREE.Vector3();
    rig.head.getWorldPosition(v);
    v.y += (spec.head.ry ?? spec.head.r) * spec.scale + 0.3;
    return v;
  };
  const faceTo = (x: number, z: number) => { const p = game!.player; p.yaw = Math.atan2(-(x - p.pos.x), -(z - p.pos.z)); };

  /** 이 공룡에게 지금 E 로 할 일 */
  function actionFor(a: Agent, d: number): { label: string; use: () => void } {
    const s = a.spec;
    const reg = registered(s.id);
    const sleeping = a.state === 'sleep';
    if (sleeping) return { label: `쿨쿨 자는 ${s.name} 쓰다듬기`, use: () => pet(a) };
    const r = todayReq();
    if (r && r.id === s.id) {
      const items = reqItems(r);
      if (items) return { label: `${s.name} 부탁 들어주기 (${reqText(r)})`, use: () => fulfillReq(a, r, items, headWorld(a.rig, s)) };
    }
    const room = remainingToday(F(), s.id, day());
    const food = s.fav ? pickFood(s, game!.state.bag, lookup, Math.max(room, 0.5)) : null;
    if (food && (room > 0 || !reg)) return { label: `${s.name}에게 ${nm(food.id)} 주기${food.fav ? ' 💕' : ''}`, use: () => feed(a, food.id) };
    if (!reg && d <= 3 + a.rig.tpl.radius * s.scale) return { label: `${s.name}에게 인사하기`, use: () => greet(a) };
    if (isFriend(s)) {
      const gft = giftOf(s);
      if (gft && dropsLeft(F(), s.id, day(), gft.perDay) > 0) return { label: `${s.name} ${gft.verb}`, use: () => doGift(a, gft) };
      if (s.reward.kind === 'pose') return { label: `${s.name}랑 사진 포즈!`, use: () => doPose(a) };
    }
    return { label: `${s.name} 쓰다듬기`, use: () => pet(a) };
  }

  game.addProvider('dinos', (p) => {
    if (p.mounted || game.world !== 'earth') return null;
    let best: { d: number; label: string; use: () => void } | null = null;
    for (const a of agents) {
      if (a.state === 'ride' || !a.rig.root.visible) continue;
      const reach = reachOf(a);
      const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
      if (d > reach || Math.abs(a.y - p.pos.y) > 4 + a.spec.scale) continue;
      const dd = d - reach + 2;
      if (best && dd >= best.d) continue;
      best = { d: dd, ...actionFor(a, d) };
    }
    for (const pl of plesios) {
      if (pl.ride || !pl.rig.root.visible) continue;
      const d = Math.hypot(pl.x - p.pos.x, pl.z - p.pos.z);
      const reach = 5;
      if (d > reach || (best && d - reach + 2 >= best.d)) continue;
      best = { d: d - reach + 2, ...plesioAction(pl) };
    }
    for (const n of nests.values()) {
      const d = Math.hypot(n.x - p.pos.x, n.z - p.pos.z);
      if (d > 2.3 || (best && d >= best.d) || !n.eggs.length) continue;
      best = { d, label: '공룡 알 쓰다듬기', use: () => petEgg(n) };
    }
    return best ? { id: 'dinos', label: best.label, dist: best.d, use: best.use } : null;
  });

  function react(a: { hop: number; wag?: number }, hop = 1) { a.hop = hop; if ('wag' in a) a.wag = 3; }

  function feed(a: Agent, item: string) {
    const s = a.spec;
    if ((game!.state.bag[item] ?? 0) <= 0) return;
    const v = foodValue(s, item, lookup);
    if (!v.ok) { toast(`${s.name}: 킁킁… 이건 안 먹어요`); return; }
    // 오늘 몫을 다 먹었으면(이미 도감에 있을 때) 먹이를 아낀다
    if (remainingToday(F(), s.id, day()) <= 0 && registered(s.id)) { toast(`${s.name}: 오늘은 배불러요~ 💤`); return; }
    game!.state.addItem(item, -1);
    const f = F();
    f.fed[s.id] = (f.fed[s.id] ?? 0) + 1;
    a.hop = 1.4; a.wag = 5;
    if (!a.pet) { a.state = 'follow'; a.timer = 20; }
    faceTo(a.x, a.z);
    game!.player.act('pet', 1.0);
    const res = gain(s, v.gain, 'feed');
    burstHearts(headWorld(a.rig, s), 3 + Math.round(res.added * 2));
    const line = `${heartLine(res.hearts)}${res.capped ? ' (오늘은 배불러요)' : ''}`;
    if (!register(s, `냠냠! ${line}`)) toast(`${s.name}: 냠냠${v.fav ? ' 제일 좋아!' : '!'} ${line}`);
    game!.audio?.sfx('pick', { x: a.x, z: a.z, pitch: 0.9 });
  }

  function greet(a: Agent) {
    faceTo(a.x, a.z);
    game!.player.act('wave', 1.0);
    a.hop = 1; a.wag = 3; a.state = 'look'; a.timer = 3;
    burstHearts(headWorld(a.rig, a.spec), 2);
    register(a.spec, `안녕! ${heartLine(hearts(a.spec.id))} · 좋아하는 먹이: ${favText(a.spec.fav, nm)}`);
  }

  function pet(a: Agent) {
    if (game!.time - a.lastPet < 0.6) return;
    a.lastPet = game!.time;
    a.hop = 1; a.wag = 3;
    if (a.state !== 'sleep' && !a.pet) { a.state = 'look'; a.timer = 2.5; }
    faceTo(a.x, a.z);
    game!.player.act('pet', 0.9);
    const s = a.spec;
    const f = F();
    let note = '';
    if (f.petDay[s.id] !== day()) {
      f.petDay[s.id] = day();
      const res = gain(s, PET_GAIN, 'pet');
      note = res.added > 0 ? ` ${heartLine(res.hearts)}` : '';
    }
    burstHearts(headWorld(a.rig, s), 3);
    // 도감은 첫 먹이·3 m 인사로만(쓰다듬기는 멀리서도 닿으니 등록하지 않는다) — 목격형 종만 예외
    if (WITNESS_IDS.includes(s.id) && register(s, `쓰담쓰담 ${heartLine(hearts(s.id))}`)) return;
    const lines = a.state === 'sleep' ? ['쿨… 쿨… 잠꼬대를 한다', '자면서도 꼬리를 살랑'] : ['꾸우~ 기분 좋아 보인다!', '꼬리를 살랑살랑 흔든다!', '눈을 꼭 감고 좋아한다!', '몸을 비비며 애교를 부린다!'];
    toast(`${s.name}: ${lines[(f.fed[s.id] ?? 0) % lines.length]}${note}`);
  }

  function doGift(a: Agent, gft: Gift) {
    const s = a.spec, d = day();
    if (!useDrop(F(), s.id, d, gft.perDay)) return;
    const rnd = ctx.rng(`dinos:gift:${s.id}:${d}:${dropsLeft(F(), s.id, d, gft.perDay)}`);
    const it = pickWeighted(gft.items.map((x) => ({ ...x, weight: x.w })), rnd)!;
    const n = it.n ? it.n[0] + Math.floor(rnd() * (it.n[1] - it.n[0] + 1)) : 1;
    const got = give(it.id, n);
    faceTo(a.x, a.z);
    a.hop = 1.6; a.wag = 4;
    a.state = 'look'; a.timer = 2;
    burstSparkles(new THREE.Vector3(a.x, a.y + 1, a.z), 8);
    const kind = it.id === 'm_iron' || it.id === 'm_stone' ? 'rock' : it.id === 'm_feather' ? 'feather' : 'fruit';
    if (got > 0) emit('harvest', { kind, item: it.id, n: got, island: a.isl });
    if (gft.fx === 'headbutt') {
      // 나무 박치기 → 곤충 담당이 벌레를 띄울 수 있게 나무 흔들기도 알린다
      emit('tree-shake', { x: a.x + Math.sin(a.yaw) * 2, z: a.z + Math.cos(a.yaw) * 2, tree: 'dino-pachy', island: a.isl });
      game!.audio?.sfx('shake-leaves', { x: a.x, z: a.z });
    } else if (gft.fx === 'thump') game!.audio?.sfx('rock-hit', { x: a.x, z: a.z, pitch: 0.7 });
    else game!.audio?.sfx('pick', { x: a.x, z: a.z });
    const left = dropsLeft(F(), s.id, d, gft.perDay);
    toast(`${s.name}: ${gft.verb} ${nm(it.id)} +${got}${left ? ` (오늘 ${left}번 더)` : ' (오늘은 끝!)'}`);
    save();
  }

  function doPose(a: Agent) {
    const s = a.spec;
    if (s.reward.kind !== 'pose') return;
    faceTo(a.x, a.z);
    game!.player.act(s.reward.pose, 2.4);
    a.pose = 2.4; a.hop = 1.2; a.state = 'look'; a.timer = 3;
    burstSparkles(headWorld(a.rig, s), 10);
    toast(`${s.name}: ${s.reward.line}`);
    emit('photo', { spot: `dino-pose:${s.id}`, species: [s.id] });
  }

  function petEgg(n: Nest) {
    game!.player.act('pet', 0.8);
    const e = n.eggs[n.eggs.length - 1];
    e.userData.wob = game!.time;
    toast(ctx.rng(`egg:${n.key}:${Math.floor(game!.time)}`)() < 0.5 ? '톡톡… 알 속에서 대답했다!' : '따뜻하다… 언젠가 깨어날까?');
  }

  // ── 탈것(F, 우선순위 30) ──
  const rocksHit = new Map<string, number>();
  function charge(a: Agent) {
    const flora = game!.ext.flora as { rocks?: () => Array<{ key?: string; id?: string; x: number; z: number; broken?: boolean }>; breakRock?: (key: string) => unknown } | undefined;
    const list = flora?.rocks?.();
    if (!list?.length || !flora?.breakRock) return;
    const ax = a.x + Math.sin(a.yaw) * a.rig.tpl.radius * a.spec.scale, az = a.z + Math.cos(a.yaw) * a.rig.tpl.radius * a.spec.scale;
    for (const r of list) {
      const key = r.key ?? r.id;
      if (!key || r.broken || Math.hypot(r.x - ax, r.z - az) > 2.6) continue;
      if ((rocksHit.get(key) ?? -9) > game!.time - 3) continue;
      rocksHit.set(key, game!.time);
      if (flora.breakRock(key) === false) continue;
      const n = 1 + Math.floor(ctx.rng(`dinos:charge:${key}:${day()}`)() * 2);
      const got = give('m_iron', n);
      if (got > 0) emit('harvest', { kind: 'rock', item: 'm_iron', n: got, island: a.isl });
      a.hop = 1.2;
      burstSparkles(new THREE.Vector3(r.x, island.heightAt(r.x, r.z) + 0.8, r.z), 10);
      game!.audio?.sfx('rock-break', { x: r.x, z: r.z });
      toast(`쿵! 뿔뿔이 돌진에 바위가 와르르 — 철광석 +${got}`);
    }
  }

  function mount(a: Agent) {
    const R = a.spec.reward;
    if (R.kind !== 'mount') return;
    const cfg = R.ride;
    // 청크가 사라져도 남게: 모듈 그룹으로 옮긴다(예전에 데려온 다른 탈것 공룡은 보낸다)
    if (!a.adopted) {
      for (const o of [...agents]) if (o.adopted && !o.pet && o !== a && o.state !== 'ride') dropAgent(o);
      group.add(a.rig.root);
      a.adopted = true;
      a.chunk = null;
    }
    let vx = 0, vz = 0, vy = 0;
    let air = false, flaps = 4;
    const glide = cfg.mode === 'glide';
    if (glide) { air = true; vy = 8.5; toast('슝~! Space 로 날갯짓(4번), 방향키로 방향을 바꿔요'); }
    const m: Mountable = {
      name: a.spec.name,
      seat: a.rig.seat,
      object: a.rig.root,
      camDistance: cfg.cam * 0.7,
      drive: (input: Input, dt: number, g: Game) => {
        const ax = input.axis();
        const run = input.down('ShiftLeft') || input.down('ShiftRight');
        const cy = g.cam.yaw;
        const fx = -Math.sin(cy), fz = -Math.cos(cy);
        let wx = fx * ax.y + -fz * ax.x, wz = fz * ax.y + fx * ax.x;
        const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
        if (glide && air) {
          // 활공: 앞으로 계속 미끄러지며 천천히 내려간다. Space = 날갯짓(위로)
          if (l > 0.1) {
            let d = Math.atan2(wx, wz) - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
            a.yaw += Math.sign(d) * Math.min(Math.abs(d), dt * 1.8);
          }
          const sp = run ? 16 : 12;
          vx += (Math.sin(a.yaw) * sp - vx) * Math.min(1, dt * 2); vz += (Math.cos(a.yaw) * sp - vz) * Math.min(1, dt * 2);
          if (input.hit('Space') && flaps > 0) { vy = 6; flaps--; a.wag = 0.6; }
          vy = Math.max(-1.8, vy - 9 * dt);
          const b = island.WORLD_BOUNDS;
          a.x = Math.min(b.maxX, Math.max(b.minX, a.x + vx * dt));
          a.z = Math.min(b.maxZ, Math.max(b.minZ, a.z + vz * dt));
          a.y += vy * dt;
          const floor = Math.max(island.heightAt(a.x, a.z), island.waterLevelAt(a.x, a.z) - 0.2);
          if (a.y <= floor) { a.y = floor; air = false; vy = 0; vx *= 0.3; vz *= 0.3; }
          a.speed = Math.hypot(vx, vz);
          poseWings(a.rig.wings, 1, a.wag > 0 ? Math.sin(g.time * 18) * 0.5 : Math.sin(g.time * 2) * 0.05);
          a.state = 'ride';
          return;
        }
        if (glide && input.hit('Space')) { air = true; vy = 8.5; flaps = 4; return; }
        if (glide) poseWings(a.rig.wings, 0);
        const sp = run ? cfg.run : cfg.walk;
        const k = Math.min(1, dt * 5);
        vx += (wx * sp - vx) * k; vz += (wz * sp - vz) * k;
        const nx = a.x + vx * dt, nz = a.z + vz * dt;
        const ny = island.heightAt(nx, nz);
        const wet = island.waterLevelAt(nx, nz) > ny + 0.6;
        if ((!wet || glide) && Math.abs(ny - a.y) < 1.6 + Math.hypot(vx, vz) * dt * 2) { a.x = nx; a.z = nz; }
        else { vx *= 0.3; vz *= 0.3; }
        const gy2 = glide ? Math.max(island.heightAt(a.x, a.z), island.waterLevelAt(a.x, a.z) - 0.2) : island.heightAt(a.x, a.z);
        if (input.hit('Space') && a.y <= gy2 + 0.05) vy = a.spec.id === 'dino-galli' ? 8 : 6;
        vy -= 22 * dt;
        a.y = Math.max(gy2, a.y + vy * dt);
        if (a.y <= gy2) vy = 0;
        const v = Math.hypot(vx, vz);
        if (v > 0.3) {
          let d = Math.atan2(vx, vz) - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
          a.yaw += d * Math.min(1, dt * 8);
        }
        a.speed = v;
        a.state = 'ride';
        if (cfg.charge && run && v > 9) charge(a);
      },
      onExit: () => {
        a.state = 'follow'; a.timer = 8;
        a.speed = 0;
        if (a.rig.wings.length) poseWings(a.rig.wings, 0);
        a.y = Math.max(island.heightAt(a.x, a.z), a.y);
        emit('dismount', { vehicle: `dino_${shortId(a.spec.id)}` });
        const side = new THREE.Vector3(Math.cos(a.yaw), 0, -Math.sin(a.yaw)).multiplyScalar(a.rig.tpl.radius * a.spec.scale + 1.2);
        return new THREE.Vector3(a.x + side.x, island.heightAt(a.x + side.x, a.z + side.z), a.z + side.z);
      },
    };
    a.state = 'ride';
    game!.player.mount(m);
    emit('mount', { vehicle: `dino_${shortId(a.spec.id)}` });
  }

  /** 개체 하나 치우기(모듈 그룹 소속: 탑승 뒤 남은 공룡·녹은 매머드) */
  function dropAgent(a: Agent) {
    a.rig.root.removeFromParent();
    a.mark?.removeFromParent();
    agents.delete(a);
  }

  // ── 녹은 매머드(GDD 3.7 "솜눈섬 빙하 → 녹이면 마을") ──
  // 무리로는 안 나온다(weight 0). secrets 가 dino:z_mammoth 를 풀면 눈사람 마을(간헐천 골짜기) 둘레에 한 마리.
  // 펫으로 데려가면 그동안 마을 자리는 비우고, "집에 가서 쉬어" 하면 다시 마을에 나타난다.
  const mammothSpec = DINO_BY_ID.get('z_mammoth')!;
  let mammothHome: { x: number; z: number } | null = null;
  const homeOfMammoth = () => {
    if (mammothHome) return mammothHome;
    const gv = features.find((f) => f.island === 'ice' && f.kind === 'geyserValley');
    if (gv) for (let i = 0; i < 32 && !mammothHome; i++) {
      // 간헐천 한가운데는 피하고 마을 둘레 마른 눈밭(황금각으로 고르게 훑기, 결정적)
      const a = i * 2.39996, rr = gv.r * (0.3 + (i % 4) * 0.12);
      const x = gv.x + Math.cos(a) * rr, z = gv.z + Math.sin(a) * rr;
      if (okGround(x, z, 'ice') && !lakeNear(x, z)) mammothHome = { x, z };
    }
    if (!mammothHome) { const hut = island.PLACES.facilities.iceHut; mammothHome = { x: hut.x + 6, z: hut.z + 3 }; }
    return mammothHome;
  };
  let mammoth: Agent | null = null;
  function tickMammoth(px: number, pz: number) {
    if (mammoth && !agents.has(mammoth)) mammoth = null;
    const thawed = unlocked(dinoKey(mammothSpec.id)) || unlocked(dinoKey(mammothSpec.gdd));
    if (!thawed) { if (mammoth) { dropAgent(mammoth); mammoth = null; } return; }
    const home = homeOfMammoth();
    const want = F().pet !== mammothSpec.id && Math.hypot(px - home.x, pz - home.z) < 200;
    if (want && !mammoth) {
      mammoth = spawn(mammothSpec, home.x, home.z, hashf('mammoth') * Math.PI * 2, 'village:z_mammoth', group, null, 'ice');
      mammoth.timer = 1;
      applyCurve(mammoth.rig.root);
    } else if (!want && mammoth) { dropAgent(mammoth); mammoth = null; }
  }
  /** 탄 뒤 내려 둔 공룡: 멀어지면(150 m) 보낸다 — 청크가 다시 생기면 무리 속에 돌아와 있다 */
  function tickStrays(px: number, pz: number) {
    for (const a of [...agents]) {
      if (!a.adopted || a.pet || a.state === 'ride' || a === mammoth || a.id.startsWith('show:')) continue;
      if (Math.hypot(a.x - px, a.z - pz) > 150) dropAgent(a);
    }
  }
  let slowTick = 0;

  // ── 펫(같이 다니기) ──
  function despawnPets() {
    for (const a of [...agents]) if (a.pet) dropAgent(a);
  }
  function spawnPets(id: string) {
    const s = DINO_BY_ID.get(id);
    if (!s || s.reward.kind !== 'pet') return;
    const n = s.reward.flock ?? 1;
    const p = game!.player.pos;
    for (let i = 0; i < n; i++) {
      const ang = game!.player.yaw + Math.PI + (i - (n - 1) / 2) * 0.5;
      const rr = 2.5 + s.scale + i * 0.4;
      const a = spawn(s, p.x + Math.sin(ang) * -rr, p.z + Math.cos(ang) * -rr, game!.player.yaw, `pet:${id}:${i}`, group, null);
      a.adopted = true; a.pet = true; a.state = 'follow'; a.timer = 1e9; a.hop = 1.2;
      applyCurve(a.rig.root);
    }
  }
  function setPet(id: string | null) {
    const f = F();
    f.pet = id;
    despawnPets();
    // 마을 매머드를 데려가면 마을 쪽은 바로 보낸다(1초 틱을 기다리면 둘이 나란히 선다)
    if (id === mammothSpec.id && mammoth) { dropAgent(mammoth); mammoth = null; }
    if (id) spawnPets(id);
    save();
  }

  game.addProvider('dinos-ride', (p) => {
    if (p.mounted || game.world !== 'earth') return null;
    let best: { d: number; label: string; use: () => void } | null = null;
    for (const a of agents) {
      if (a.state === 'ride' || a.state === 'sleep' || !a.rig.root.visible) continue;
      const R = a.spec.reward;
      if (R.kind !== 'mount' && R.kind !== 'pet') continue;
      if (!isFriend(a.spec)) continue;
      const reach = reachOf(a) + 0.6;
      const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
      if (d > reach || (best && d >= best.d)) continue;
      if (R.kind === 'mount') best = { d, label: `${a.spec.name} 타기`, use: () => mount(a) };
      else if (F().pet === a.spec.id && a.pet) best = { d, label: `${a.spec.name}, 집에 가서 쉬어`, use: () => { setPet(null); toast(`${a.spec.name}: 또 놀자! (꾸벅)`); } };
      else best = { d, label: `${a.spec.name}랑 같이 다니기`, use: () => { setPet(a.spec.id); toast(`${jo(`${a.spec.name}${a.spec.reward.kind === 'pet' && a.spec.reward.flock ? ' 떼' : ''}`, '이', '가')} 졸졸 따라와요!`); } };
    }
    for (const pl of plesios) {
      if (pl.ride || !isFriend(plesioSpec) || !pl.rig.root.visible) continue;
      const d = Math.hypot(pl.x - p.pos.x, pl.z - p.pos.z);
      if (d > 6 || (best && d >= best.d)) continue;
      best = { d, label: `${plesioSpec.name} 타기`, use: () => mountPlesio(pl) };
    }
    return best ? { id: 'dinos-ride', key: 'KeyF', priority: ALT_PRIORITY.dinoMount, label: best.label, dist: best.d, use: best.use } : null;
  });

  // ── 하늘: 슝슝이(도는 무리) ──
  const pteraSpec = DINO_BY_ID.get('dino-ptera')!;
  const pteras: Array<{ rig: PteraRig; cx: number; cz: number; r: number; h: number; w: number; ph: number }> = [];
  {
    const rnd = ctx.rng('dinos:ptera');
    for (let i = 0; i < 8; i++) {
      const rig = makePtera(pteraSpec);
      const a = rnd() * Math.PI * 2, rr = i < 2 ? 0 : isl.r * (0.25 + rnd() * 0.45);
      const cx = isl.x + Math.cos(a) * rr, cz = isl.z + Math.sin(a) * rr;
      rig.root.scale.multiplyScalar(1.5);
      pteras.push({ rig, cx, cz, r: 25 + rnd() * 40, h: (i < 2 ? 175 : 22) + rnd() * 18, w: (0.12 + rnd() * 0.08) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6 });
      group.add(rig.root);
    }
  }

  // ── 물: 목욕룡(앞바다 + 고대 호수) ──
  const plesioSpec = DINO_BY_ID.get('dino-plesio')!;
  const plesios: Plesio[] = [];
  const mosas: Array<{ m: THREE.Mesh; cx: number; cz: number; r: number; w: number; ph: number }> = [];
  {
    const rnd = ctx.rng('dinos:sea');
    const seaPoint = (minC: number, maxC: number, a0: number) => {
      for (let k = 0; k < 24; k++) {
        const a = a0 + k * 0.26;
        for (let rr = isl.r * 0.85; rr < isl.r * 1.6; rr += 8) {
          const x = isl.x + Math.cos(a) * rr, z = isl.z + Math.sin(a) * rr;
          const c = island.worldSample(x, z).coast;
          if (c < minC && c > maxC) return { x, z };
        }
      }
      return null;
    };
    const addPlesio = (x: number, z: number, r: number, base: number) => {
      const rig = makeDino(plesioSpec);
      rig.shadow.visible = false;
      const fl: THREE.Object3D[] = [];
      for (const zz of [0.3, -0.3]) for (const m of [-1, 1]) {
        const f = new THREE.Group();
        f.position.set(m * plesioSpec.body.rx * 0.8, rig.tpl.hipF.y - 0.1, zz);
        const fm = new THREE.Mesh(flipperGeometry(plesioSpec), dinoSkin());
        fm.scale.x = m;
        f.add(fm);
        rig.rig.add(f);
        fl.push(f);
      }
      plesios.push({ rig, flippers: fl, cx: x, cz: z, r, w: 0.1 + rnd() * 0.06, ph: rnd() * 6, base, x, z, yaw: 0, ride: false, lastPet: -99, hop: 0 });
      group.add(rig.root);
    };
    for (let i = 0; i < 4; i++) {
      const p = seaPoint(-22, -70, i * 1.57 + 0.4);
      if (p) addPlesio(p.x, p.z, 10 + rnd() * 14, 0);
    }
    const lake = lakes.find((L) => L.kind === 'ancientlake');
    if (lake) addPlesio(lake.x, lake.z, lake.r * 0.4, lake.level);
    const mtex = mosaTexture();
    const mgeo = new THREE.PlaneGeometry(1, 1); mgeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const p = seaPoint(-140, -320, i * 3.1 + 1.0);
      if (!p) continue;
      const m = new THREE.Mesh(mgeo, new THREE.MeshBasicMaterial({ map: mtex, transparent: true, depthWrite: false, opacity: 0.55, color: '#1d3566' }));
      m.scale.set(7, 1, 20);
      m.renderOrder = 1;
      group.add(m);
      mosas.push({ m, cx: p.x, cz: p.z, r: 30 + rnd() * 20, w: 0.05 + rnd() * 0.03, ph: rnd() * 6 });
    }
  }

  function plesioAction(pl: Plesio): { label: string; use: () => void } {
    const s = plesioSpec;
    const room = remainingToday(F(), s.id, day());
    const food = pickFood(s, game!.state.bag, lookup, Math.max(room, 0.5));
    if (food && (room > 0 || !registered(s.id))) return { label: `${s.name}에게 ${nm(food.id)} 주기`, use: () => feedPlesio(pl, food.id) };
    return { label: `${s.name} 쓰다듬기`, use: () => petPlesio(pl) };
  }
  function feedPlesio(pl: Plesio, item: string) {
    const s = plesioSpec;
    const v = foodValue(s, item, lookup);
    if (!v.ok || (game!.state.bag[item] ?? 0) <= 0) return;
    if (remainingToday(F(), s.id, day()) <= 0 && registered(s.id)) { toast(`${s.name}: 오늘은 배불러요~ 💤`); return; }
    game!.state.addItem(item, -1);
    F().fed[s.id] = (F().fed[s.id] ?? 0) + 1;
    pl.hop = 1.4;
    const res = gain(s, v.gain, 'feed');
    burstHearts(headWorld(pl.rig, s), 3 + Math.round(res.added * 2));
    if (!register(s, `첨벙! ${heartLine(res.hearts)}`)) toast(`${s.name}: 첨벙첨벙 냠! ${heartLine(res.hearts)}${res.capped ? ' (오늘은 배불러요)' : ''}`);
  }
  function petPlesio(pl: Plesio) {
    if (game!.time - pl.lastPet < 0.6) return;
    pl.lastPet = game!.time;
    pl.hop = 1;
    const s = plesioSpec, f = F();
    if (f.petDay[s.id] !== day()) { f.petDay[s.id] = day(); gain(s, PET_GAIN, 'pet'); }
    burstHearts(headWorld(pl.rig, s), 3);
    if (!register(s)) toast(`${s.name}: 목을 쭉 빼고 볼을 비빈다! ${heartLine(hearts(s.id))}`);
  }
  function mountPlesio(pl: Plesio) {
    const R = plesioSpec.reward;
    if (R.kind !== 'mount') return;
    const cfg = R.ride;
    pl.ride = true;
    let vx = 0, vz = 0;
    const m: Mountable = {
      name: plesioSpec.name,
      seat: pl.rig.seat,
      object: pl.rig.root,
      camDistance: cfg.cam * 0.7,
      drive: (input: Input, dt: number, g: Game) => {
        const ax = input.axis();
        const run = input.down('ShiftLeft') || input.down('ShiftRight');
        const cy = g.cam.yaw, fx = -Math.sin(cy), fz = -Math.cos(cy);
        let wx = fx * ax.y + -fz * ax.x, wz = fz * ax.y + fx * ax.x;
        const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
        const sp = run ? cfg.run : cfg.walk, k = Math.min(1, dt * 3);
        vx += (wx * sp - vx) * k; vz += (wz * sp - vz) * k;
        const nx = pl.x + vx * dt, nz = pl.z + vz * dt;
        // 물이 1.2 m 보다 얕으면 못 간다(땅으로 못 올라온다)
        if (island.waterLevelAt(nx, nz) - island.heightAt(nx, nz) > 1.2) { pl.x = nx; pl.z = nz; }
        else { vx *= -0.2; vz *= -0.2; }
        const v = Math.hypot(vx, vz);
        if (v > 0.3) { let d = Math.atan2(vx, vz) - pl.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); pl.yaw += d * Math.min(1, dt * 4); }
        pl.base = island.waterLevelAt(pl.x, pl.z);
      },
      onExit: () => {
        pl.ride = false;
        // 지금 자리에서 다시 빙글빙글 돈다
        const a = pl.ph + game!.time * pl.w;
        pl.cx = pl.x - Math.cos(a) * pl.r; pl.cz = pl.z - Math.sin(a) * pl.r;
        emit('dismount', { vehicle: 'dino_plesio' });
        const side = new THREE.Vector3(Math.cos(pl.yaw), 0, -Math.sin(pl.yaw)).multiplyScalar(2.2);
        return new THREE.Vector3(pl.x + side.x, pl.base - 0.6, pl.z + side.z);
      },
    };
    game!.player.mount(m);
    emit('mount', { vehicle: 'dino_plesio' });
    toast('목욕룡 등에 첨벙! 수영보다 3배 빨라요 (Shift 쭉쭉)');
  }

  // ── 티노 낮잠 언덕 ──
  const tinoSpec = DINO_BY_ID.get('z_tino')!;
  const tinoRig = makeDino(tinoSpec);
  const summit = { x: TINO.x, z: TINO.z, y: island.heightAt(TINO.x, TINO.z) };
  // 낮잠 자리: 꼭대기에서 섬 중심 반대쪽으로 6 m(상자가 들리는 거리 안)
  const bed = (() => {
    const dx = TINO.x - isl.x, dz = TINO.z - isl.z, l = Math.hypot(dx, dz) || 1;
    for (const k of [6, 5, 7, 4.5]) for (const s of [0, 0.6, -0.6, 1.2, -1.2]) {
      const a = Math.atan2(dz, dx) + s;
      const x = TINO.x + Math.cos(a) * k, z = TINO.z + Math.sin(a) * k;
      if (Math.abs(island.heightAt(x, z) - summit.y) < 2.2) return { x, z, yaw: Math.atan2(TINO.x - x, TINO.z - z) + 0.9 };
    }
    return { x: TINO.x + (dx / l) * 6, z: TINO.z + (dz / l) * 6, yaw: 0 };
  })();
  const tino = {
    m: newTino(hour()) as TinoMachine,
    x: bed.x, z: bed.z, y: island.heightAt(bed.x, bed.z), yaw: bed.yaw, speed: 0, phase: 0, hop: 0,
    lastPet: -99, prev: '' as TinoState | '', hintShown: false, gaugeShown: -1, wakeT: 0,
  };
  tino.prev = tino.m.state;
  tinoRig.root.position.set(tino.x, tino.y, tino.z);
  group.add(tinoRig.root);
  const bubble = snotBubble();
  tinoRig.head.add(bubble);
  const zzz: THREE.Sprite[] = [0, 1, 2].map(() => { const s = new THREE.Sprite(zzzMat); s.renderOrder = 6; group.add(s); return s; });
  const chest = goldChest();
  chest.root.position.set(summit.x, summit.y, summit.z);
  chest.root.rotation.y = Math.atan2(isl.x - summit.x, isl.z - summit.z);
  group.add(chest.root);
  let chestAnim = -1;

  const sneaking = () => {
    const i = game!.input;
    return i.down('KeyC') || i.down('ControlLeft') || i.down('ControlRight');
  };

  function tinoFeed(item: string) {
    const v = foodValue(tinoSpec, item, lookup);
    if (!v.ok || (game!.state.bag[item] ?? 0) <= 0) return;
    game!.state.addItem(item, -1);
    const f = F();
    f.fed[tinoSpec.id] = (f.fed[tinoSpec.id] ?? 0) + 1;
    f.tinoFish += 1;
    tino.hop = 1.4;
    faceTo(tino.x, tino.z);
    game!.player.act('pet', 1);
    const res = gain(tinoSpec, v.gain, 'feed');
    burstHearts(headWorld(tinoRig, tinoSpec), 4 + Math.round(res.added * 2));
    const line = `${heartLine(res.hearts)} · 물고기 선물 ${f.tinoFish}/30`;
    if (!register(tinoSpec, `꺄오~ 냠! ${line}`)) toast(`티노: 꺄오~ 냠냠! ${line}`);
  }

  game.addProvider('dinos-tino', (p) => {
    if (p.mounted || game.world !== 'earth') return null;
    const d = Math.hypot(tino.x - p.pos.x, tino.z - p.pos.z);
    const reach = tinoRig.tpl.radius * tinoSpec.scale + 1.8;
    if (d > reach) return null;
    const st = tino.m.state;
    if (st === 'sleep' || st === 'stir') {
      if (registered(tinoSpec.id) || d > 3 + tinoRig.tpl.radius * tinoSpec.scale) return null;
      return {
        id: 'dinos-tino', label: '쉿… 살금살금 인사하기', dist: d - reach + 2,
        use: () => { register(tinoSpec, '쿨… 쿨… (깨우지 않게 조심!)'); tino.m.gauge = Math.min(99, tino.m.gauge + 20); },
      };
    }
    if (st !== 'awake') return null;
    const food = pickFood(tinoSpec, game.state.bag, lookup, 2);
    if (food) return { id: 'dinos-tino', label: `티노에게 ${nm(food.id)} 주기 (${F().tinoFish}/30)`, dist: d - reach + 2, use: () => tinoFeed(food.id) };
    return {
      id: 'dinos-tino', label: registered(tinoSpec.id) ? '티노 쓰다듬기' : '티노에게 인사하기', dist: d - reach + 2,
      use: () => {
        if (game.time - tino.lastPet < 0.6) return;
        tino.lastPet = game.time; tino.hop = 1;
        faceTo(tino.x, tino.z);
        game.player.act('pet', 0.9);
        const f = F();
        if (f.petDay[tinoSpec.id] !== day()) { f.petDay[tinoSpec.id] = day(); gain(tinoSpec, PET_GAIN, 'pet'); }
        burstHearts(headWorld(tinoRig, tinoSpec), 3);
        if (!register(tinoSpec, `꺄오! ${heartLine(hearts(tinoSpec.id))} · 물고기를 좋아해요`)) toast(`티노: 꺄오~ (짧은 팔을 파닥파닥) ${heartLine(hearts(tinoSpec.id))}`);
      },
    };
  });

  game.addProvider('dinos-chest', (p) => {
    if (p.mounted || game.world !== 'earth') return null;
    const d = Math.hypot(summit.x - p.pos.x, summit.z - p.pos.z);
    if (d > 2.6) return null;
    const ok = chestCheck(tino.m, hour(), F().tinoChest, day());
    if (F().tinoChest === day()) return null;
    return { id: 'dinos-chest', label: ok.ok ? '금상자 열기' : '금상자 (티노가 지켜요)', dist: d, use: () => openTinoChest() };
  });

  function openTinoChest() {
    const ok = chestCheck(tino.m, hour(), F().tinoChest, day());
    if (!ok.ok) { toast(ok.why ?? '아직 못 열어요'); return; }
    F().tinoChest = day();
    save();
    chestAnim = game!.time;
    const econ = game!.econ;
    // economy 가 상자 굴림 + chest-open 연출 이벤트까지 맡는다(열쇠 없이 여는 무료 상자 — 스텔스가 열쇠)
    const res = econ?.openChest ? econ.openChest('gold', 'tino') : null;
    if (!res) { game!.state.addCoins(5000, 'chest'); toast('금상자에서 도파코인 5,000!'); }
    burstSparkles(new THREE.Vector3(summit.x, summit.y + 1, summit.z), 14);
    game!.player.act('cheer', 1.4);
  }

  // ── 목격 등록소(사진 모드·인사) ──
  const _wp = new THREE.Vector3();
  game.witnesses.add(() => {
    if (game.world !== 'earth') return [];
    const p = game.player.pos;
    const out: Array<{ speciesId: string; pos: THREE.Vector3 }> = [];
    for (const pt of pteras) if (pt.rig.root.visible && pt.rig.root.position.distanceTo(p) < 120) out.push({ speciesId: pteraSpec.id, pos: pt.rig.root.position.clone() });
    for (const pl of plesios) if (pl.rig.root.visible && Math.hypot(pl.x - p.x, pl.z - p.z) < 80) out.push({ speciesId: plesioSpec.id, pos: pl.rig.root.position.clone() });
    for (const m of mosas) if (m.m.visible && m.m.position.distanceTo(p) < 90) out.push({ speciesId: 'dino-mosa', pos: m.m.position.clone() });
    for (const a of agents) if (WITNESS_IDS.includes(a.spec.id) && a.rig.root.visible && Math.hypot(a.x - p.x, a.z - p.z) < 60) out.push({ speciesId: a.spec.id, pos: a.rig.root.getWorldPosition(_wp).clone() });
    return out;
  });
  const SIGHT_LINE: Record<string, string> = { 'dino-ptera': '슝— 하늘을 날고 있다!', 'dino-plesio': '목을 쭉 빼고 인사했다!', 'dino-mosa': '커다란 그림자가 지나갔다…' };
  const sighted = (id: string) => { if (!registered(id)) register(DINO_BY_ID.get(id)!, SIGHT_LINE[id]); };

  // ── 화석(ext.fossils) ──
  const PIECE_IDS = FOSSIL_PIECES.map((f) => f.id);
  game.ext.fossils = {
    roll: (rng: () => number, islandId?: string | null) => { const f = rollFossil(rng, islandId); return { id: f.id, name: f.name, rarity: f.rarity }; },
    model: (id: string) => { const f = FOSSIL_BY_ID.get(id); return fossilModel(f?.model ?? 'bone', f?.tint ?? '#f3e6cc'); },
    pieces: PIECE_IDS,
    skeletons: FOSSIL_SKELETONS.map((f) => f.id),
    parse: parseFossil,
    partsOf: (dino: string) => PIECE_IDS.filter((id) => parseFossil(id)?.dino === dino),
    skeletonOf: (id: string) => { const p = parseFossil(id); return p ? `fos_${p.dino}` : null; },
  };

  // ── 디버그 훅(window.__dinos) ──
  const nearest = (id?: string) => {
    let best: Agent | null = null, bd = Infinity;
    const p = game.player.pos;
    for (const a of agents) {
      if (id && a.spec.id !== id && a.spec.gdd !== id) continue;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  };
  const spawnNear = (id: string, dist = 5) => {
    const s = dinoByAny(id);
    if (!s) return null;
    const p = game.player.pos, fw = new THREE.Vector3();
    ctx.camera.getWorldDirection(fw); fw.y = 0; if (fw.lengthSq() < 1e-6) fw.set(0, 0, -1); fw.normalize();
    const d = dist + s.scale;
    const a = spawn(s, p.x + fw.x * d, p.z + fw.z * d, Math.atan2(-fw.x, -fw.z), `show:${s.id}:${Math.floor(game.time * 100)}`, group, null, island.worldSample(p.x, p.z).island?.id ?? 'dino');
    a.adopted = true; a.state = 'look'; a.timer = 1e9;
    applyCurve(a.rig.root);
    return a;
  };
  (window as unknown as { __dinos?: unknown }).__dinos = {
    agents, nests, pteras, plesios, tinoNpc: tino,
    /** 가장 가까운(또는 그 종) 공룡에게 먹이 — 먹이가 없으면 하나 넣어 준다. 없으면 앞에 하나 불러 온다 */
    feed(id?: string, item?: string) {
      let a = nearest(id);
      if (!a || Math.hypot(a.x - game.player.pos.x, a.z - game.player.pos.z) > 40) a = id ? spawnNear(id) : a;
      if (!a) return null;
      let it = item ?? pickFood(a.spec, game.state.bag, lookup, 2)?.id;
      if (!it) { it = a.spec.diet === 'herb' ? (a.spec.fav?.items?.[0] ?? 'm_apple') : [...game.state.species.values()].find((s) => s.category === 'fish' && s.rarity >= (a!.spec.fav?.fish ?? 1))?.id; if (it) game.state.addItem(it, 1); }
      if (!it) return null;
      if (!game.state.has(it)) game.state.addItem(it, 1);
      feed(a, it);
      return { id: a.spec.id, hearts: hearts(a.spec.id), friend: isFriend(a.spec) };
    },
    /** 티노 상태 보기·바꾸기 */
    tino(state?: TinoState) {
      if (state) for (const e of forceTino(tino.m, state)) emit('tino', { state: e });
      return { state: tino.m.state, gauge: tino.m.gauge, approaching: tino.m.approaching, clean: tino.m.clean, x: tino.x, z: tino.z, summit, bed, chest: chestCheck(tino.m, hour(), F().tinoChest, day()) };
    },
    goTino(offset = 14) { game.player.teleport(summit.x + offset, summit.z + offset * 0.3); return summit; },
    openChest: () => openTinoChest(),
    hearts(id: string, n?: number) {
      const s = dinoByAny(id);
      if (!s) return null;
      if (typeof n === 'number') { F().hearts[s.id] = Math.max(0, Math.min(HEART_MAX, n)); if (n >= threshold(p0())) befriendNow(s); save(); }
      return hearts(s.id);
    },
    befriend(id: string) { const s = dinoByAny(id); if (!s) return false; F().hearts[s.id] = Math.max(hearts(s.id), threshold(p0())); befriendNow(s); return true; },
    spawn: (id: string, dist?: number) => spawnNear(id, dist),
    lineup(x: number, z: number, faceYaw = 0, gap = 3.2, ids?: string[]) {
      const list = ids ? ids.map((i) => dinoByAny(i)!).filter(Boolean) : DINOS.filter((d) => d.home !== 'sea');
      return list.map((s, i) => {
        const a = spawn(s, x + (i - list.length / 2) * gap, z, faceYaw, `show:${i}`, group, null);
        a.adopted = true; a.state = 'look'; a.timer = 1e9;
        applyCurve(a.rig.root);
        return a;
      });
    },
    ride(a?: Agent | string) {
      const ag = typeof a === 'string' || !a ? nearest(typeof a === 'string' ? a : undefined) : a;
      if (!ag) return false;
      if (!isFriend(ag.spec)) { F().hearts[ag.spec.id] = threshold(p0()); befriendNow(ag.spec); }
      mount(ag);
      return true;
    },
    pet: (id: string | null) => setPet(id),
    near: (id: string) => nearest(id),
    request: () => todayReq(),
    flags: () => F(),
  };

  // ── 매 프레임 ──
  let pending = true;
  let sightT = 0;
  const camPos = new THREE.Vector3();
  game.onUpdate((t, dt) => {
    const p = game.player;
    const px = p.pos.x, pz = p.pos.z;
    const earth = game.world === 'earth';
    group.visible = earth;
    if (!earth) { if (tino.gaugeShown !== 0) { game.hud.gauge('tino', { label: '티노 소음', value: 0, color: '#ffa24c', show: false }); tino.gaugeShown = 0; } return; }
    // 저장된 펫은 첫 프레임에 곁으로
    if (pending) {
      pending = false;
      const pid = F().pet;
      const ps = pid ? DINO_BY_ID.get(pid) : null;
      if (ps && isFriend(ps)) spawnPets(ps.id); else if (pid) F().pet = null;
    }
    const nearIsland = Math.hypot(px - isl.x, pz - isl.z) < isl.r + 900;
    const h = hour();
    const req = todayReq();

    // 1초마다: 녹은 매머드 있고 없고 · 멀리 두고 온 탈것 공룡 보내기
    if (t >= slowTick) { slowTick = t + 1; tickMammoth(px, pz); tickStrays(px, pz); }
    for (const a of agents) updateAgent(a, t, dt, px, pz, h, req);
    // 펫: 멀리 떨어지면 곁으로 순간이동(땅 위에 있을 때만)
    for (const a of agents) {
      if (!a.pet) continue;
      const d = Math.hypot(a.x - px, a.z - pz);
      if (d > 45 && p.mode === 'ground' && !p.mounted) {
        const ang = p.yaw + Math.PI + (hashf(a.id) - 0.5);
        a.x = px - Math.sin(ang) * (3 + a.spec.scale); a.z = pz - Math.cos(ang) * (3 + a.spec.scale);
        a.y = island.heightAt(a.x, a.z); a.hop = 1.2;
      }
    }
    // 서로 겹치지 않게 살짝 밀어낸다(플레이어 근처만)
    if (dt > 0) {
      const nearA: Agent[] = [];
      for (const a of agents) if (a.state !== 'ride' && Math.abs(a.x - px) < 45 && Math.abs(a.z - pz) < 45) nearA.push(a);
      for (let i = 0; i < nearA.length; i++) for (let j = i + 1; j < nearA.length; j++) {
        const a = nearA[i], b = nearA[j];
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        const min = (a.rig.tpl.radius * a.spec.scale + b.rig.tpl.radius * b.spec.scale) * 0.75;
        if (d >= min || d < 1e-4) continue;
        const push = Math.min(0.5, (min - d) * 0.5 * Math.min(1, dt * 6)) / d;
        const wa = a.spec.scale > b.spec.scale * 1.8 ? 0.15 : 0.5;
        a.x -= dx * push * wa * 2; a.z -= dz * push * wa * 2;
        b.x += dx * push * (1 - wa) * 2; b.z += dz * push * (1 - wa) * 2;
      }
    }

    // 하트·반짝이
    for (let i = hearts3d.length - 1; i >= 0; i--) {
      const hh = hearts3d[i];
      const k = (t - hh.t0) / 1.4;
      if (k < 0) { hh.s.visible = false; continue; }
      hh.s.visible = true;
      hh.s.position.set(hh.base.x + hh.vx * k + Math.sin(k * 9 + i) * 0.08, hh.base.y + k * 1.3, hh.base.z);
      hh.s.scale.setScalar(0.32 + 0.25 * Math.min(1, k * 5) - 0.1 * k);
      (hh.s.material as THREE.SpriteMaterial).opacity = 1 - sm(0.6, 1, k);
      if (k >= 1) { hh.s.removeFromParent(); (hh.s.material as THREE.Material).dispose(); hearts3d.splice(i, 1); }
    }
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const sp = sparkles[i];
      const k = (t - sp.t0) / 0.9;
      sp.s.position.copy(sp.base).addScaledVector(sp.v, k).add(new THREE.Vector3(0, -1.5 * k * k, 0));
      sp.s.scale.setScalar(0.35 * (1 - k) + 0.05);
      if (k >= 1) { sp.s.removeFromParent(); sparkles.splice(i, 1); }
    }
    // 알 들썩
    for (const n of nests.values()) {
      for (let i = 0; i < n.eggs.length; i++) {
        const e = n.eggs[i];
        const w0 = e.userData.wob as number | undefined;
        const kick = w0 !== undefined ? Math.max(0, 1 - (t - w0) / 1.2) : 0;
        const idle = Math.max(0, Math.sin(t * 0.9 + i * 2.1 + n.x) - 0.85) * 4;
        e.rotation.z = Math.sin(t * 22 + i) * 0.12 * (idle + kick * 1.5);
      }
    }
    updateTino(t, dt, px, pz, h);
    if (!nearIsland) {
      for (const pt of pteras) pt.rig.root.visible = false;
      for (const pl of plesios) pl.rig.root.visible = pl.ride;
      for (const m of mosas) m.m.visible = false;
      return;
    }
    // 슝슝이 선회
    for (const pt of pteras) {
      pt.rig.root.visible = true;
      const a = pt.ph + t * pt.w;
      const x = pt.cx + Math.cos(a) * pt.r, z = pt.cz + Math.sin(a) * pt.r;
      const y = Math.max(island.heightAt(x, z) + 16, (pt.h > 100 ? pt.h : island.heightAt(pt.cx, pt.cz) + pt.h) + Math.sin(t * 0.4 + pt.ph) * 5);
      pt.rig.root.position.set(x, y, z);
      const dx = -Math.sin(a) * Math.sign(pt.w), dz = Math.cos(a) * Math.sign(pt.w);
      pt.rig.root.rotation.set(0, Math.atan2(dx, dz), 0);
      pt.rig.root.rotateZ(-Math.sign(pt.w) * 0.35);
      const flap = Math.sin(t * 3.2 + pt.ph);
      const glide = sm(-0.2, 0.6, Math.sin(t * 0.35 + pt.ph));
      const wing = (1 - glide) * flap * 0.55 + glide * 0.05;
      pt.rig.wingL.rotation.z = -wing;
      pt.rig.wingR.rotation.z = wing;
      pt.rig.head.rotation.x = 0.1 + 0.05 * Math.sin(t * 2 + pt.ph);
      setEyesOpen(pt.rig.eyes, blinkAt(t, pt.ph) ? 0.1 : 1);
    }
    // 목욕룡
    for (const pl of plesios) {
      const vis = pl.ride || Math.hypot(pl.cx - px, pl.cz - pz) < 700;
      pl.rig.root.visible = vis;
      if (!vis) continue;
      if (!pl.ride) {
        const a = pl.ph + t * pl.w;
        pl.x = pl.cx + Math.cos(a) * pl.r; pl.z = pl.cz + Math.sin(a) * pl.r;
        pl.yaw = Math.atan2(-Math.sin(a), Math.cos(a));
      }
      pl.hop = Math.max(0, pl.hop - dt * 2);
      const hop = pl.hop > 0 ? Math.abs(Math.sin(pl.hop * Math.PI * 2)) * 0.35 : 0;
      pl.rig.root.position.set(pl.x, pl.base - 0.55 * plesioSpec.scale + Math.sin(t * 1.3 + pl.ph) * 0.08 + hop, pl.z);
      pl.rig.root.rotation.y = pl.yaw;
      const dd = Math.hypot(pl.x - px, pl.z - pz);
      const look = dd < 12 && !pl.ride;
      let rel = Math.atan2(px - pl.x, pz - pl.z) - pl.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      pl.rig.head.rotation.y = look ? THREE.MathUtils.clamp(rel, -0.8, 0.8) : Math.sin(t * 0.7 + pl.ph) * 0.35;
      pl.rig.head.rotation.x = Math.sin(t * 0.9 + pl.ph) * 0.12;
      if (pl.rig.tail) pl.rig.tail.rotation.y = Math.sin(t * 2.2 + pl.ph) * 0.3;
      pl.flippers.forEach((f, i) => { f.rotation.z = (i % 2 ? 1 : -1) * Math.sin(t * (pl.ride ? 4.5 : 2.4) + (i < 2 ? 0 : 1.5)) * 0.35; });
      setEyesOpen(pl.rig.eyes, blinkAt(t, pl.ph) ? 0.1 : 1);
      breathe(pl.rig.rig, t, hashf(pl.ph));
    }
    // 모사 그림자(밤에만)
    const night = h >= 19 || h < 6;
    for (const m of mosas) {
      m.m.visible = night;
      if (!night) continue;
      const a = m.ph + t * m.w;
      const x = m.cx + Math.cos(a) * m.r, z = m.cz + Math.sin(a) * m.r;
      m.m.position.set(x, -1.2, z);
      m.m.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.sin(t * 1.4 + m.ph) * 0.08;
    }
    // 목격 등록(가끔)
    sightT -= dt;
    if (sightT <= 0 || dt === 0) {
      sightT = 0.5;
      if (!registered(pteraSpec.id)) {
        for (const pt of pteras) if (pt.rig.root.position.distanceTo(p.pos) < 60) { sighted(pteraSpec.id); break; }
        for (const a of agents) if (a.spec.id === pteraSpec.id && Math.hypot(a.x - px, a.z - pz) < 25) { sighted(pteraSpec.id); break; }
      }
      if (!registered(plesioSpec.id)) for (const pl of plesios) if (Math.hypot(pl.x - px, pl.z - pz) < 30) { sighted(plesioSpec.id); break; }
      if (!registered('dino-mosa')) for (const m of mosas) if (m.m.visible && Math.hypot(m.m.position.x - px, m.m.position.z - pz) < 45) { sighted('dino-mosa'); break; }
    }
  });

  // ── 티노 매 프레임 ──
  const TINO_SC = tinoSpec.scale;
  function updateTino(t: number, dt: number, px: number, pz: number, h: number) {
    const p = game!.player;
    const d = Math.hypot(tino.x - px, tino.z - pz);
    const sd = Math.hypot(summit.x - px, summit.z - pz);
    const R = tinoRig;
    const far = d > 260;
    R.root.visible = d < 420;
    // 살금살금: C(또는 Ctrl)를 누르고 있으면 언덕 근처에서 걸음이 느려진다
    const sneak = sneaking() && p.mode === 'ground' && !p.mounted && d < 30;
    if (sneak && dt > 0) { const k = Math.pow(0.6, dt * 60); p.vel.x *= k; p.vel.z *= k; }
    const m = tino.m;
    const home = Math.hypot(tino.x - bed.x, tino.z - bed.z) < 1.5;
    const caught = m.state === 'chase' && d < tinoRig.tpl.radius * TINO_SC + 1.2;
    const evs = far && m.state !== 'chase' ? tinoStep(m, { dt, hour: h, dist: Infinity, summitDist: sd, speed: 0, home: true }) : tinoStep(m, { dt, hour: h, dist: d, summitDist: sd, speed: p.mounted ? 12 : p.speed, sneaking: sneak, home, caught });
    for (const e of evs) emit('tino', { state: e });
    if (m.state !== tino.prev) {
      const prev = tino.prev;
      tino.prev = m.state;
      if (m.state === 'wake' && prev !== 'awake') {
        tino.wakeT = t; tino.hop = 1.6;
        game!.hud.banner({ text: '꺄오!', sub: '티노가 깼다! 도망쳐~', icon: '🦖', color: '#ffa24c', ms: 1600 });
      } else if (m.state === 'chase') toast('티노가 쿵쿵 쫓아온다! (안 아파요, 안아 주고 싶을 뿐)');
      else if (m.state === 'sulk') toast('티노: …짧은 팔로는 안을 수가 없어… (시무룩)');
      else if (m.state === 'sleep' && prev === 'return') toast('티노가 다시 쿨쿨 잠들었다. 이번엔 살금살금…');
    }
    if (m.approaching && !tino.hintShown && (m.state === 'sleep' || m.state === 'stir')) {
      tino.hintShown = true;
      toast('쉿… 티노가 낮잠 중! 달리면 깨요. C 를 꾹 누르면 살금살금~');
    }
    // 게이지 HUD(언덕 근처 낮잠 중일 때만)
    const show = (m.state === 'sleep' || m.state === 'stir') && d < 18;
    const gv = show ? Math.round(m.gauge) : -1;
    if (gv !== tino.gaugeShown) {
      tino.gaugeShown = gv;
      game!.hud.gauge('tino', { label: m.state === 'stir' ? '티노가 뒤척여요…' : '티노 소음', value: Math.max(0, m.gauge) / 100, color: m.gauge > 66 ? '#ff7a59' : m.gauge > 33 ? '#ffc04a' : '#9be7a6', show });
    }
    if (!R.root.visible) return;
    // 움직임
    let want = 0, tx = tino.x, tz = tino.z;
    if (m.state === 'chase') { want = 6.5; tx = px; tz = pz; }
    else if (m.state === 'return') { want = 3; tx = bed.x; tz = bed.z; }
    else if (m.state === 'awake') {
      // 저녁·밤: 낮잠 자리 둘레를 어슬렁
      const a = t * 0.08;
      tx = bed.x + Math.cos(a) * 7; tz = bed.z + Math.sin(a) * 7; want = 1.2;
    }
    const dx = tx - tino.x, dz = tz - tino.z, dl = Math.hypot(dx, dz);
    const stop = m.state === 'chase' ? tinoRig.tpl.radius * TINO_SC + 0.8 : 0.4;
    if (want > 0 && dl > stop) {
      let dy = Math.atan2(dx, dz) - tino.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      tino.yaw += dy * Math.min(1, dt * 4);
      tino.speed += (want - tino.speed) * Math.min(1, dt * 4);
    } else tino.speed *= Math.max(0, 1 - dt * 6);
    if (tino.speed > 0.02) {
      const nx = tino.x + Math.sin(tino.yaw) * tino.speed * dt, nz = tino.z + Math.cos(tino.yaw) * tino.speed * dt;
      if (okGround(nx, nz, 'dino', true) && Math.hypot(nx - bed.x, nz - bed.z) < 40) { tino.x = nx; tino.z = nz; }
    }
    if ((m.state === 'sleep' || m.state === 'stir') && !home) { tino.x += (bed.x - tino.x) * Math.min(1, dt); tino.z += (bed.z - tino.z) * Math.min(1, dt); }
    if (m.state === 'sleep' || m.state === 'stir') { let dy = bed.yaw - tino.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); tino.yaw += dy * Math.min(1, dt * 2); }
    tino.y = island.heightAt(tino.x, tino.z);
    // 몸짓
    const asleep = m.state === 'sleep' || m.state === 'stir';
    tino.phase += dt * tino.speed * 2.2;
    const sw = Math.sin(tino.phase), amp = Math.min(0.7, tino.speed * 0.12);
    if (R.legs[0]) R.legs[0].rotation.x = asleep ? -1.2 : sw * amp;
    if (R.legs[1]) R.legs[1].rotation.x = asleep ? -1.2 : -sw * amp;
    tino.hop = Math.max(0, tino.hop - dt * 2);
    const hopY = tino.hop > 0 ? Math.abs(Math.sin(tino.hop * Math.PI * 2)) * 0.25 : 0;
    const lie = asleep ? -tinoSpec.leg.len * 0.75 : 0;
    R.rig.position.y = lie + hopY / TINO_SC + Math.abs(Math.cos(tino.phase)) * 0.04 * Math.min(1, tino.speed);
    R.rig.rotation.x = asleep ? 0.14 : m.state === 'sulk' ? 0.12 : 0;
    breathe(R.rig, t * (asleep ? 0.6 : 1), 0.3);
    let hp = 0, hy = 0;
    if (asleep) { hp = 0.42 + Math.sin(t * 1.7) * 0.03 + (m.state === 'stir' ? Math.sin(t * 9) * 0.06 : 0); hy = 0.5; }
    else if (m.state === 'wake') hp = -0.55;
    else if (m.state === 'sulk') hp = 0.5;
    else if (m.state === 'chase' || d < 10) { let rel = Math.atan2(px - tino.x, pz - tino.z) - tino.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel)); hy = THREE.MathUtils.clamp(rel, -0.8, 0.8); hp = -0.1; }
    R.head.rotation.x += (hp - R.head.rotation.x) * Math.min(1, dt * 5);
    R.head.rotation.y += (hy - R.head.rotation.y) * Math.min(1, dt * 4);
    R.head.rotation.z = m.state === 'sulk' ? 0.15 : 0;
    if (R.tail) { R.tail.rotation.y = Math.sin(t * (asleep ? 0.8 : 3)) * (asleep ? 0.06 : 0.2); R.tail.rotation.x = m.state === 'sulk' ? 0.25 : -0.04; }
    const open = asleep ? (m.state === 'stir' && Math.sin(t * 2.3) > 0.7 ? 0.45 : 0.08) : m.state === 'sulk' ? 0.4 : blinkAt(t, 1.3) ? 0.1 : 1;
    setEyesOpen(R.eyes, open);
    R.root.position.set(tino.x, tino.y, tino.z);
    R.root.rotation.y = tino.yaw;
    // 콧방울: 3.2초마다 부풀었다 톡
    if (asleep) {
      const cyc = (t % 3.2) / 3.2;
      const s = cyc < 0.88 ? sm(0, 0.88, cyc) : 1.25 * (1 - (cyc - 0.88) / 0.12);
      const hs = tinoSpec.head;
      bubble.visible = s > 0.04;
      bubble.position.set(hs.r * 0.18, -(hs.ry ?? hs.r) * 0.25, (hs.rz ?? hs.r) + hs.snout * 0.85);
      bubble.scale.setScalar(Math.max(0.01, s * 0.6 * (m.state === 'stir' ? 1 + Math.sin(t * 20) * 0.08 : 1)));
    } else bubble.visible = false;
    // Zzz
    const hw = headWorld(R, tinoSpec);
    zzz.forEach((z, i) => {
      z.visible = asleep;
      if (!asleep) return;
      const k = ((t * 0.45 + i / 3) % 1);
      z.position.set(hw.x + Math.sin(k * 5 + i) * 0.5 + k * 1.2, hw.y + 0.6 + k * 3.2, hw.z);
      z.scale.setScalar(0.9 + k * 1.1);
      z.material.opacity = 1 - sm(0.65, 1, k);
    });
    // 금상자: 오늘 열었으면 뚜껑 열고 빛기둥 끄기
    const opened = F().tinoChest === day();
    const ka = chestAnim > 0 ? Math.min(1, (t - chestAnim) / 0.6) : opened ? 1 : 0;
    chest.lid.rotation.x = -1.6 * sm(0, 1, ka);
    chest.glow.visible = !opened;
    if (!opened) { (chest.glow.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.08 * Math.sin(t * 2); chest.root.position.y = summit.y + (ka === 0 && isNap(h) ? Math.max(0, Math.sin(t * 6) - 0.95) * 0.4 : 0); }
  }

  function blinkAt(t: number, ph: number) {
    const per = 3.7 + (ph % 1.3);
    const k = (t + ph) % per;
    return k < 0.13 || (Math.floor((t + ph) / per) % 3 === 1 && k > 0.26 && k < 0.36);
  }

  function updateAgent(a: Agent, t: number, dt: number, px: number, pz: number, h: number, req: DinoRequest | null) {
    const R = a.rig;
    const dxp = px - a.x, dzp = pz - a.z;
    const dp = Math.hypot(dxp, dzp);
    const far = dp > 90;
    // 멀면 다리·얼굴·꼬리·그림자 숨기고 AI 쉬기(큰 목길이 종은 멀리서도 보이는 랜드마크)
    const nearP = dp < 55;
    R.faceGroup.visible = nearP;
    R.shadow.visible = nearP;
    for (const l of R.legs) l.visible = dp < 75;
    if (R.tail) R.tail.visible = dp < 75;
    const shadow = dp < 32;
    if (shadow !== R.root.userData.shadow) {
      R.root.userData.shadow = shadow;
      R.rig.children[0].castShadow = shadow;
      (R.head.children[0] as THREE.Mesh).castShadow = shadow;
      R.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== R.rig.children[0] && o !== R.head.children[0]) o.castShadow = false; });
    }
    if (far && a.state !== 'ride' && !a.pet) { R.root.visible = dp < (a.spec.scale > 3 ? 320 : 150); if (a.mark) a.mark.visible = false; return; }
    R.root.visible = true;
    const sc = a.spec.scale;
    const baseSpeed = a.spec.speed * Math.sqrt(sc);
    const awake = a.pet || a.adopted || awakeAt(a.spec.time, h);

    if (a.state !== 'ride') {
      a.timer -= dt;
      if (!awake) { if (a.state !== 'sleep') { a.state = 'sleep'; a.speed = 0; } }
      else if (a.state === 'sleep') { a.state = 'yawn'; a.timer = 2.2; }
      const friendly = isFriend(a.spec) || hearts(a.spec.id) >= 2;
      const pers = a.spec.personality === 'shy' && friendly ? 'curious' : a.spec.personality;
      const pClose = dp < (a.rig.tpl.radius * sc + 2.0);
      if (a.state === 'sleep') { /* 그 자리에서 쿨쿨 */ }
      else if (a.state === 'follow' || a.pet || (a.spec.personality === 'follow' && a.adopted)) {
        if (a.timer <= 0 && !a.adopted) a.state = 'idle';
        else if (dp > 3.5 + sc) { a.state = 'follow'; const k = a.pet ? (2.2 + sc + (hashf(a.id) - 0.5) * 2) : (2.5 + sc); a.tx = px - (dxp / dp) * k; a.tz = pz - (dzp / dp) * k; }
        else if (a.pet) { a.tx = a.x; a.tz = a.z; }
      } else if (pers === 'shy' && dp < 9 + sc * 2 && !friendly && !pClose) {
        if (a.state !== 'flee') { a.state = 'flee'; a.timer = 2.5; }
        a.tx = a.x - (dxp / dp) * 14; a.tz = a.z - (dzp / dp) * 14;
      } else if (pers === 'curious' && dp < 14 && dp > 3.4 + sc && a.state !== 'look' && a.timer < 6) {
        a.state = 'approach';
        a.tx = px - (dxp / dp) * (2.6 + sc); a.tz = pz - (dzp / dp) * (2.6 + sc);
      } else if (a.timer <= 0) {
        const r = hashf(a.id + Math.floor(t * 10));
        if (a.state === 'walk' || a.state === 'approach' || a.state === 'flee' || a.state === 'look') {
          a.state = r < 0.45 ? 'graze' : r < 0.6 ? 'yawn' : 'idle';
          a.timer = a.state === 'yawn' ? 2.2 : 2 + r * 4;
        } else {
          a.state = 'walk';
          const ang = r * 40, rr = 4 + ((r * 97) % 1) * 10 * Math.sqrt(sc);
          a.tx = a.home.x + Math.cos(ang) * rr; a.tz = a.home.z + Math.sin(ang) * rr;
          // 플레이어 정면 시야를 가로막는 목표는 옆으로 민다
          {
            const cy = game!.cam.yaw, fx = -Math.sin(cy), fz = -Math.cos(cy);
            const rx = a.tx - px, rz = a.tz - pz, along = rx * fx + rz * fz, lat = rx * -fz + rz * fx;
            if (along > 0 && along < 12 && Math.abs(lat) < along * 0.7 + 1.5) {
              const sgn = lat >= 0 ? 1 : -1, push = along * 0.7 + 3 - Math.abs(lat);
              a.tx += -fz * sgn * push; a.tz += fx * sgn * push;
            }
          }
          for (const w of WELCOME) {
            const wx = a.tx - w.x, wz = a.tz - w.z, wd = Math.hypot(wx, wz);
            if (wd < CLEAR) { const s2 = (CLEAR + 1) / Math.max(0.01, wd); a.tx = w.x + wx * s2; a.tz = w.z + wz * s2; }
          }
          a.timer = 9;
        }
      }
      if (a.state === 'approach' && dp <= 3.6 + sc) { a.state = 'look'; a.timer = 4; }

      // 이동
      let want = 0;
      if (a.state === 'walk' || a.state === 'approach' || a.state === 'flee' || a.state === 'follow') {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.6) { if (a.state !== 'follow') { a.state = 'idle'; a.timer = 1 + hashf(a.id + t) * 2; } }
        else {
          want = baseSpeed * (a.state === 'flee' ? 2.4 : a.state === 'follow' ? (dp > 9 ? 2.8 : 1.4) : a.state === 'approach' ? 1.3 : 1);
          let dyaw = Math.atan2(dx, dz) - a.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
          a.yaw += dyaw * Math.min(1, dt * 3.5);
        }
      }
      a.speed += (want - a.speed) * Math.min(1, dt * 4);
      if (a.speed > 0.02) {
        const step = a.speed * dt;
        const nx = a.x + Math.sin(a.yaw) * step, nz = a.z + Math.cos(a.yaw) * step;
        const okLand = a.adopted ? island.waterLevelAt(nx, nz) < island.heightAt(nx, nz) + 0.3 : okGround(nx, nz, a.isl, a.high);
        if (okLand && (a.adopted || slopeOk(nx, nz, a.y, step))) { a.x = nx; a.z = nz; }
        else { a.yaw += 1.6; a.state = a.state === 'follow' ? 'follow' : 'idle'; a.timer = 0.5; a.speed *= 0.3; }
      }
      a.y = game!.groundAt(a.x, a.z);
    }

    // ── 몸짓 ──
    const moving = a.speed / Math.max(0.3, baseSpeed);
    a.phase += dt * (a.speed / Math.max(0.15, sc * 0.55)) * 3.2;
    const sw = Math.sin(a.phase);
    const amp = Math.min(0.75, moving * 0.55);
    const sleeping = a.state === 'sleep';
    if (sleeping) R.legs.forEach((l, i) => { l.rotation.x = a.spec.biped ? -1.1 : (i < 2 ? -1.2 : 1.2); });
    else if (a.spec.biped) {
      R.legs[0] && (R.legs[0].rotation.x = sw * amp);
      R.legs[1] && (R.legs[1].rotation.x = -sw * amp);
    } else {
      R.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? sw : -sw) * amp; });
    }
    const bob = Math.abs(Math.cos(a.phase)) * 0.05 * Math.min(1, moving);
    a.hop = Math.max(0, a.hop - dt * 2.2);
    const hopY = a.hop > 0 ? Math.abs(Math.sin(a.hop * Math.PI * 2)) * 0.25 * Math.min(1, a.hop) : 0;
    const lie = sleeping ? -a.spec.leg.len * 0.7 : 0;
    R.rig.position.y = lie + bob + hopY / sc;
    R.rig.rotation.z = Math.sin(a.phase) * 0.06 * Math.min(1, moving);
    breathe(R.rig, sleeping ? t * 0.6 : t, a.bph);
    // 날개 종(슝슝이·꼬마케찰): 평소 접고, 기분 좋으면 퍼덕
    if (R.wings.length && a.state !== 'ride') poseWings(R.wings, a.wag > 0 || a.pose > 0 ? 0.7 : 0, a.wag > 0 ? Math.sin(t * 14) * 0.35 : 0);
    // 머리: 풀 뜯기·하품·바라보기·잠
    let tp = 0, ty = 0, lean = 0;
    if (sleeping) { tp = 0.4; }
    else if (a.state === 'graze') { tp = 0.55 + Math.sin(t * 7 + a.blink) * 0.06; lean = a.spec.biped ? 0.25 : 0.1; }
    else if (a.state === 'yawn') { tp = -0.45; }
    if (a.pose > 0) { a.pose = Math.max(0, a.pose - dt); tp = -0.35; ty = 0; R.head.rotation.z = Math.sin(t * 5) * 0.15; }
    const lookP = !sleeping && a.pose <= 0 && (a.state === 'look' || a.state === 'approach' || a.state === 'follow' || dp < 8) && a.state !== 'graze' && a.state !== 'flee';
    if (lookP) {
      let rel = Math.atan2(dxp, dzp) - a.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      ty = THREE.MathUtils.clamp(rel, -0.9, 0.9);
      tp = -0.12;
      if (a.state === 'look') R.head.rotation.z = Math.sin(t * 2.4 + a.blink) * 0.12; // 갸웃
    } else if (a.pose <= 0) R.head.rotation.z *= 0.9;
    const k = Math.min(1, dt * 4);
    a.headPitch += (tp - a.headPitch) * k;
    a.headYaw += (ty - a.headYaw) * k;
    a.lean += (lean - a.lean) * k;
    R.head.rotation.x = a.headPitch;
    R.head.rotation.y = a.headYaw;
    R.rig.rotation.x = a.lean;
    a.wag = Math.max(0, a.wag - dt);
    if (R.tail) {
      const wagF = a.wag > 0 ? 9 : 2.2 + moving * 3;
      R.tail.rotation.y = Math.sin(t * wagF + a.blink) * (a.wag > 0 ? 0.35 : sleeping ? 0.04 : 0.14);
      R.tail.rotation.x = -0.05 + Math.sin(t * 1.3 + a.blink) * 0.04;
    }
    // 눈(자면 감고, 하품·쓰다듬기 땐 꼭 감기)
    const shut = sleeping || a.state === 'yawn' || (t - a.lastPet < 0.9) || blinkAt(t, a.blink);
    setEyesOpen(R.eyes, shut ? 0.08 : 1);
    // 오늘의 부탁 '!'
    const wantMark = !!req && req.id === a.spec.id && dp < 60 && !sleeping;
    if (wantMark && !a.mark) { a.mark = new THREE.Sprite(markMat); a.mark.renderOrder = 6; group.add(a.mark); }
    if (a.mark) {
      a.mark.visible = wantMark;
      if (wantMark) { const hw = headWorld(R, a.spec); a.mark.position.set(hw.x, hw.y + 0.5 + Math.abs(Math.sin(t * 3)) * 0.2, hw.z); a.mark.scale.setScalar(0.7); }
    }

    R.root.position.set(a.x, a.y, a.z);
    R.root.rotation.y = a.yaw;
    // 카메라 근평면 1.5 m 안: 디더 페이드(타고 있는 공룡 제외)
    {
      let lv = 0;
      if (a.state !== 'ride' && dp < 30) {
        game!.engine.camera.getWorldPosition(camPos);
        const cdist = Math.hypot(camPos.x - a.x, camPos.y - (a.y + R.tpl.height * sc * 0.45), camPos.z - a.z) - R.tpl.radius * sc * 0.85;
        const f = Math.min(1, Math.max(0, (cdist - 0.2) / 1.5));
        lv = f > 0.85 ? 0 : f > 0.5 ? 1 : f > 0.15 ? 2 : -1;
      }
      if (lv !== (R.root.userData.fadeLv ?? 0)) {
        R.root.userData.fadeLv = lv;
        const mat = lv >= 0 ? dinoSkin(lv) : null;
        R.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          if (m.userData.skin === undefined) m.userData.skin = m.material === dinoSkin();
          if (!m.userData.skin) return;
          if (mat) { m.material = mat; m.visible = true; } else m.visible = false;
        });
      }
      if (lv !== 0) R.faceGroup.visible = false;
    }
    // 좌석: 몸 움직임을 따라(스케일 없는 좌표)
    R.seat.position.set(0, R.tpl.seat.y * sc + (bob + hopY / sc) * sc, R.tpl.seat.z * sc);
  }

  return group;
}

function isChild(parent: THREE.Object3D, o: THREE.Object3D) {
  let p: THREE.Object3D | null = o;
  while (p) { if (p === parent) return true; p = p.parent; }
  return false;
}

function hashf(s: string | number) {
  const str = String(s);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

const sm = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function mosaTexture(): THREE.CanvasTexture {
  const n = 256, c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d')!;
  g.filter = 'blur(10px)';
  g.fillStyle = '#ffffff';
  // 위에서 본 길쭉한 몸 + 머리 + 지느러미 4 + 꼬리
  g.beginPath(); g.ellipse(128, 120, 34, 92, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(128, 34, 24, 30, 0, 0, Math.PI * 2); g.fill();
  for (const [x, y, r] of [[84, 90, -0.6], [172, 90, 0.6], [94, 170, -0.5], [162, 170, 0.5]] as const) { g.beginPath(); g.ellipse(x, y, 12, 30, r, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.moveTo(128, 200); g.lineTo(100, 250); g.lineTo(156, 250); g.fill();
  return new THREE.CanvasTexture(c);
}
