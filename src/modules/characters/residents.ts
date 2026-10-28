// 주민 런타임: 청크 스트리밍으로 가까운 섬 주민(+ 시설 NPC)만 만들고(한 번 만든 모델은 재사용), 천천히 돌아다니고,
// 감정 말풍선을 띄우고, 플레이어가 다가오면 손 흔들기, 부탁이 있으면 '!'(NPC 서비스가 켠다).
// 대화 말풍선은 타자기(SpeechBubble) — 글자는 NPC 서비스가 한 글자씩 밀어 넣는다.
// 반응: 박수(clap)·손 흔들기(launch-wave)는 그쪽(x,z)을 보고 한다.
// P1: 특별 모델(model — 브라키오·로봇·문어…), 늦게 오는 주민(addHome — 이주), 섬 옮기기(relocate — 청크 사이),
// 마주 보기(face — 주민끼리 수다). 시설 NPC 그릇 이름은 'npc-<id>'(촬영·검수가 찾는다).
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import { applyCurve } from '../../core/curve';
import { buildAnimal, type AnimalRig, type Outfit, type Accessory } from './animal';
import { buildSpecial } from './special';
import { blobShadow } from './kit';
import { trimSmallShadows } from '../../core/chunks';
import { bubbleTexture, type BubbleKind } from './tex';
import { SpeechBubble } from './bubble';
import type { ResidentDef } from './data';
import type { NpcActor, NpcReaction } from './npc';

const bubbleTex = new Map<BubbleKind, THREE.Texture>();
function bubbleMap(kind: BubbleKind): THREE.Texture {
  let t = bubbleTex.get(kind);
  if (!t) { t = bubbleTexture(kind); t.userData.shared = true; bubbleTex.set(kind, t); }
  return t;
}
const BUBBLE_GEO = new THREE.PlaneGeometry(0.5, 0.5);
BUBBLE_GEO.userData.shared = true;

/** 말 거는 대상(동물 주민 · 시설 NPC · 마을 곰) 공통: 타자기 말풍선 자리 */
export interface Talker {
  name: string;
  accent: string;
  container: THREE.Group;
  /** 말풍선 높이(m) */
  top: number;
  speech: SpeechBubble | null;
  /** 말풍선이 사라지기 시작한 시각(-1 = 보이는 중) */
  speechGone: number;
  talking: boolean;
}

/** 타자기 말풍선 갱신(page=null 이면 사라지게) */
export function sayOn(who: Talker, page: string | null, shown: number, now: number) {
  if (page === null) {
    if (who.speech && who.speechGone < 0) who.speechGone = now;
    return;
  }
  if (!who.speech) {
    who.speech = new SpeechBubble();
    who.speech.mesh.position.set(0, who.top + 0.78, 0);
    who.container.add(who.speech.mesh);
  }
  if (who.speech.pageText !== page) who.speech.bornAt = now;
  who.speechGone = -1;
  who.speech.set(who.name, who.accent, page, shown);
}

/** 말풍선: 카메라를 보고, 톡 튀어나오고, 끝나면 0.35 초에 걸쳐 사라진다 */
export function updateSpeech(who: Talker, now: number, camera: THREE.Camera, snap = false) {
  const s = who.speech;
  if (!s) return;
  if (who.speechGone >= 0) {
    const k = snap ? 1 : (now - who.speechGone) / 0.35;
    if (k >= 1) { s.dispose(); who.speech = null; who.speechGone = -1; return; }
    s.mesh.scale.setScalar(Math.max(0.01, 1 - 0.4 * k));
    (s.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
  } else {
    const age = now - s.bornAt;
    const pop = snap ? 1 : age < 0.22 ? THREE.MathUtils.smoothstep(age, 0, 0.22) * (1 + 0.12 * Math.sin(age * 28)) : 1;
    s.mesh.scale.setScalar(Math.max(0.01, pop));
    (s.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
  }
  // 컨테이너는 회전하지 않으니 카메라 방향 그대로
  s.mesh.quaternion.copy(camera.quaternion);
}

// 옷·두 번째 소품을 주민마다 돌린다(같은 몸이라도 실루엣·색이 달라 보이게)
const OUTFITS: Outfit[] = ['overalls', 'pocket', 'stripe', 'dress', 'hoodie'];
const ACC2: Accessory[] = ['glasses', 'none', 'bow', 'none', 'none', 'bow', 'none'];

const _cv = new THREE.Vector3();
const _look = new THREE.Vector3();
/** 이 거리(m)부터 먼 LOD */
export const FAR_LOD_M = 25;

/** 주민 자리 정의(시설 NPC 는 npc·yaw·wander 0 으로 고정 자리) */
export interface PlacedDef extends Omit<ResidentDef, 'birthday' | 'likes' | 'dislikes' | 'voice'> {
  /** NPC id(없으면 id) — 같은 NPC 가 여러 자리에 설 때 id 는 자리마다 다르다 */
  npc?: string;
  /** 고정 자리의 바라보는 방향 */
  yaw?: number;
  /** 돌아다니는 반경(m, 0 = 제자리) */
  wander?: number;
  /** 옷·소품 자동 돌리기 끄기 */
  keepSpec?: boolean;
}

export interface Live extends Talker {
  def: PlacedDef;
  npcId: string;
  rig: AnimalRig;
  home: THREE.Vector2;
  p: THREE.Vector3;
  yaw: number;
  yaw0: number;
  target: THREE.Vector2 | null;
  idleUntil: number;
  bubble: THREE.Mesh;
  mood: BubbleKind;
  greetUntil: number;
  near: boolean;
  moodPhase: number;
  /** 새로 말 걸 거리가 있음('!' — 부탁) */
  news: boolean;
  moodEvery: number;
  react: NpcReaction | null;
  rnd: () => number;
  /** 이 시각까지 (x,z) 를 마주 본다(수다) */
  look: { x: number; z: number; until: number } | null;
  /** 거리 숨김으로 멀어져 쉬는 중(움직임·표정 갱신을 건너뛴다) */
  sleeping?: boolean;
}

/** 부두에서 섬 안쪽으로 걸어가며 평평한 땅을 찾는다 */
export function placeOnIsland(ctx: Ctx, def: PlacedDef): { x: number; z: number } | null {
  const { island } = ctx;
  if (def.at) return def.at;
  const d = island.islandById(def.island);
  const dock = island.PLACES.docks[def.island];
  if (!d || !dock) return null;
  const dx = d.x - dock.x, dz = d.z - dock.z;
  const L = Math.hypot(dx, dz) || 1;
  const fx = dx / L, fz = dz / L;
  const sx = -fz, sz = fx;
  const side = def.side ?? 0;
  const ok = (x: number, z: number) => island.isBuildable(x, z, 1.0) && !Number.isFinite(island.waterLevelAt(x, z)) && island.heightAt(x, z) > 0.6;
  // 1순위: 배에서 내리면 바로 보이는 해변 띠(숲에 가리지 않게)
  // 부두 선을 따라 바다 쪽으로 걸어 나가며 해안 띠(해안에서 5~16 m)를 찾는다
  for (const lat of [side, side + 3, side - 3, side + 6, side - 6, side + 10, side - 10]) {
    for (let k = 30; k > -160; k -= 2) {
      const x = dock.x + fx * k + sx * lat, z = dock.z + fz * k + sz * lat;
      const sf = island.surfaceAt(x, z);
      if (sf.coastDist < 5) break;
      if (sf.coastDist < 16 && ok(x, z)) return { x, z };
    }
  }
  for (let step = 0; step < 60; step++) {
    const inward = (def.inward ?? 40) + step * 3;
    for (const lat of [side, side + 3, side - 3, side + 6, side - 6]) {
      const x = dock.x + fx * inward + sx * lat, z = dock.z + fz * inward + sz * lat;
      if (island.isBuildable(x, z, 1.0) && !Number.isFinite(island.waterLevelAt(x, z)) && island.heightAt(x, z) > 0.6) return { x, z };
    }
  }
  return null;
}

const CELL = 96;
const cellOf = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

export function setupResidents(ctx: Ctx, camera: THREE.Camera, defs: PlacedDef[]) {
  const game = ctx.game;
  const { island } = ctx;
  const lives = new Map<string, Live>();
  const active = new Set<Live>();
  const homes: Array<{ def: PlacedDef; x: number; z: number }> = [];
  for (const def of defs) {
    const at = placeOnIsland(ctx, def);
    if (at) homes.push({ def, ...at });
  }
  /** 지금 살아 있는 청크 그릇(칸 → 그룹) — 늦게 온 주민을 바로 넣는다 */
  const cells = new Map<string, THREE.Group>();
  /** 먼 LOD 를 아직 안 구운 리그(한가한 프레임에 하나씩) */
  const lodQueue: AnimalRig[] = [];
  /** 지금 시각(onUpdate t) — 말풍선 시각 기준 */
  let now = 0;

  function make(h: { def: PlacedDef; x: number; z: number }): Live {
    const def = h.def;
    const idx = Math.max(0, defs.indexOf(def));
    const spec = { ...def.spec };
    // 시설 NPC 만 시그니처 소품(생김새가 같은 일반 주민은 안 단다)
    if (def.npc) spec.npc = def.npc;
    // 우주복(헬멧)은 흰 옷 그대로, 나머지는 이름표 색으로 옷 모양을 돌린다
    if (!def.keepSpec && spec.acc !== 'helmet') {
      spec.outfit = spec.outfit ?? OUTFITS[idx % OUTFITS.length];
      spec.outfitColor = spec.outfitColor ?? def.accent;
    }
    if (!def.keepSpec && !spec.acc2) spec.acc2 = spec.acc === 'none' ? 'glasses' : ACC2[idx % ACC2.length];
    const rig = def.model ? buildSpecial(def.model, def.spec) : buildAnimal(spec);
    const container = new THREE.Group();
    container.name = def.npc ? `npc-${def.npc}` : `resident:${def.id}`;
    container.userData.npc = def.npc ?? def.id;
    const y = island.heightAt(h.x, h.z);
    container.position.set(h.x, y, h.z);
    container.add(rig.root);
    // 눈·볼·귀·손·장식은 그림자 패스에서 뺀다(발밑 동그란 그림자가 따로 있다 — 몸통·머리만 그림자)
    trimSmallShadows(rig.root, 0.16 * (def.spec.scale ?? 1));
    const sh = blobShadow(0.34 * (def.spec.scale ?? 1), 0.38);
    sh.position.y = 0.012;
    container.add(sh);
    const rnd = ctx.rng(`resident:${def.id}`);
    const mood = def.moods[0];
    const bubble = new THREE.Mesh(BUBBLE_GEO, new THREE.MeshBasicMaterial({ map: bubbleMap(mood), transparent: true, depthWrite: false, alphaTest: 0.02 }));
    bubble.renderOrder = 5;
    bubble.position.set(0.2, rig.top + 0.2, 0);
    container.add(bubble);
    const yaw0 = def.yaw ?? 0.3 * (rnd() - 0.5);
    const live: Live = {
      def, npcId: def.npc ?? def.id, rig, container, top: rig.top,
      name: def.name, accent: def.accent,
      home: new THREE.Vector2(h.x, h.z), p: new THREE.Vector3(h.x, y, h.z),
      yaw: yaw0, yaw0, target: null, idleUntil: rnd() * 3,
      bubble, mood, greetUntil: -1, near: false, moodPhase: rnd() * 30,
      news: false, moodEvery: 11 + rnd() * 10, react: null,
      speech: null, speechGone: -1, talking: false, rnd, look: null,
    };
    // 멀리(90m 넘게) 가면 숨기고 쉬게 한다 — 청크 반경(260m)보다 훨씬 안쪽이라 그리기 비용을 크게 던다
    game?.chunks.lod?.register(container, 90, { at: live.p, onChange: (near) => { live.sleeping = !near; } });
    // 25 m 넘으면 먼 모습(굳힌 한 덩이 + 얼굴 — 드로콜 ≤ 6). 빈 그릇을 맡겨 거리만 잰다(숨김은 그릇이 받는다)
    if (rig.setLod) game?.chunks.lod?.register(new THREE.Object3D(), FAR_LOD_M, { at: live.p, onChange: (near) => rig.setLod?.(near ? 'near' : 'far') });
    if (rig.prepareLod) lodQueue.push(rig);
    return live;
  }

  /** 그 칸 청크가 살아 있으면 주민을 넣는다(곡률도 건다) */
  function attach(L: Live) {
    const g = cells.get(cellOf(L.p.x, L.p.z));
    if (!g || !game || game.world !== 'earth') return;
    g.add(L.container);
    applyCurve(L.container);
    active.add(L);
  }
  /** 늦게 오는 주민(이주) — 집 자리를 더하고 청크가 살아 있으면 바로 세운다 */
  function addHome(def: PlacedDef, x: number, z: number) {
    if (homes.some((h) => h.def.id === def.id)) return relocate(def.id, x, z);
    if (!defs.includes(def)) defs.push(def);
    const h = { def, x, z };
    homes.push(h);
    if (!game) return h;
    const L = make(h);
    lives.set(def.id, L);
    attach(L);
    return h;
  }
  /** 다른 자리(다른 섬)로 옮기기 — 지금 그릇에서 빼고 새 칸 그릇에 넣는다 */
  function relocate(key: string, x: number, z: number) {
    const h = homes.find((q) => q.def.id === key);
    if (!h) return null;
    h.x = x; h.z = z;
    const L = lives.get(key);
    if (L) {
      L.container.parent?.remove(L.container);
      active.delete(L);
      L.home.set(x, z);
      L.p.set(x, island.heightAt(x, z), z);
      L.target = null;
      L.look = null;
      L.container.position.copy(L.p);
      attach(L);
    }
    return h;
  }

  /** 주민 하나 → NPC 서비스 자리 */
  function actorOf(h: { def: PlacedDef; x: number; z: number }): NpcActor {
    const key = h.def.id;
    const live = () => lives.get(key);
    return {
      key, id: h.def.npc ?? h.def.id,
      pos: () => live()?.p ?? new THREE.Vector3(h.x, island.heightAt(h.x, h.z), h.z),
      present: () => { const L = live(); return !!L && active.has(L) && game?.world !== 'space'; },
      say: (page, shown) => { const L = live(); if (L) sayOn(L, page, shown, now); },
      setTalking: (on) => { const L = live(); if (L) L.talking = on; },
      setNews: (on) => { const L = live(); if (L) L.news = on; },
      react: (r) => { const L = live(); if (L) L.react = r; },
      // 청크 칸이 바뀌어도 맞는 그릇으로(멀리 옮기면 그 칸이 살아날 때 선다)
      moveTo: (x, z) => { relocate(key, x, z); },
    };
  }

  if (game) {
    game.chunks.add({
      key: 'characters-residents', size: 96, radius: 260, world: 'earth',
      build: ({ x0, z0, size }) => {
        const mine = homes.filter((h) => h.x >= x0 && h.x < x0 + size && h.z >= z0 && h.z < z0 + size);
        // 빈 칸도 빈 그릇을 둔다(나중에 이사 오는 주민을 바로 넣게 — 그릇만이라 그리기 비용 0)
        const g = new THREE.Group();
        g.name = 'residents-chunk';
        cells.set(cellOf(x0 + 1, z0 + 1), g);
        for (const h of mine) {
          let L = lives.get(h.def.id);
          if (!L) { L = make(h); lives.set(h.def.id, L); }
          // 옮겨 간 주민의 자리가 바뀌었으면 맞춘다
          L.p.set(h.x, island.heightAt(h.x, h.z), h.z);
          L.home.set(h.x, h.z);
          L.container.position.copy(L.p);
          g.add(L.container);
          active.add(L);
        }
        return g;
      },
      // 모델은 다시 쓰니 지오메트리를 버리지 않는다
      dispose: (o) => {
        for (const [k, g] of cells) if (g === o) cells.delete(k);
        for (const L of lives.values()) if (L.container.parent === o) { active.delete(L); o.remove(L.container); }
      },
    });
  }

  const tmp = new THREE.Vector2();
  const turnTo = (L: Live, x: number, z: number, dt: number, rate = 5) => {
    const want = Math.atan2(x - L.p.x, z - L.p.z);
    let dd = want - L.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    L.yaw += dt > 0 ? dd * Math.min(1, dt * rate) : dd;
  };
  function update(t: number, dt: number, player: THREE.Vector3 | null, tod: string) {
    now = t;
    // 먼 LOD 미리 굽기: 여유 있는 프레임(< 22 ms)에 하나씩
    if (lodQueue.length && dt > 0 && dt < 0.022) lodQueue.shift()!.prepareLod?.();
    for (const L of active) {
      if (L.sleeping && !L.talking) continue;
      const toP = player ? Math.hypot(player.x - L.p.x, player.z - L.p.z) : 99;
      const talking = L.talking;
      const R = L.react && t < L.react.until ? L.react : null;
      if (L.react && !R) L.react = null;
      // 다가오면 손 흔들기
      if (toP < 6 && !L.near) { L.near = true; L.greetUntil = t + 1.6; }
      if (toP > 8) L.near = false;
      let walk = 0;
      const wanderR = L.def.wander ?? (L.def.at ? 2.5 : 5);
      const look = L.look && t < L.look.until ? L.look : null;
      if (L.look && !look) L.look = null;
      if (talking || toP < 3.2 || R || look || wanderR <= 0) {
        L.target = null;
        L.idleUntil = t + 1.5;
      } else if (dt > 0) {
        if (!L.target && t > L.idleUntil) {
          const a = L.rnd() * Math.PI * 2, r = 1 + L.rnd() * wanderR;
          const tx = L.home.x + Math.cos(a) * r, tz = L.home.y + Math.sin(a) * r;
          if (island.isBuildable(tx, tz, 0.5) && !Number.isFinite(island.waterLevelAt(tx, tz))) L.target = new THREE.Vector2(tx, tz);
          else L.idleUntil = t + 1;
        }
        if (L.target) {
          tmp.set(L.target.x - L.p.x, L.target.y - L.p.z);
          const d = tmp.length();
          if (d < 0.15) { L.target = null; L.idleUntil = t + 2.5 + L.rnd() * 4; }
          else {
            const sp = 0.85;
            const stepLen = Math.min(d, sp * dt);
            L.p.x += (tmp.x / d) * stepLen;
            L.p.z += (tmp.y / d) * stepLen;
            L.p.y = island.heightAt(L.p.x, L.p.z);
            walk = sp;
            turnTo(L, L.target.x, L.target.y, dt, 6);
          }
        }
      }
      // 반응 쪽(로켓·박수 자리)을 보거나, 가까우면 플레이어를 본다. 고정 자리는 멀어지면 제 방향으로
      if (R && R.x != null && R.z != null) turnTo(L, R.x, R.z, dt, 6);
      else if (look && !talking) turnTo(L, look.x, look.z, dt, 5);
      else if (player && toP < 4.5) turnTo(L, player.x, player.z, dt);
      else if (wanderR <= 0) { let dd = L.yaw0 - L.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); L.yaw += dt > 0 ? dd * Math.min(1, dt * 2) : dd; }
      L.container.position.copy(L.p);
      L.rig.root.rotation.y = L.yaw;
      const greeting = t < L.greetUntil;
      // 눈은 기본으로 뜨고, 말하는 중에만 웃는 눈
      // 쳐다보기: 말하는 중이거나 가까운(5 m) 플레이어 얼굴 쪽 — 반응 자리가 있으면 그쪽
      const lookAt = R && R.x != null && R.z != null ? _look.set(R.x, L.p.y + 1.2, R.z)
        : look ? _look.set(look.x, L.p.y + 0.9, look.z)
          : player && (toP < 5 || talking) ? _look.set(player.x, player.y + 0.95, player.z) : null;
      L.rig.update(t, dt, {
        walk, talk: talking, clap: R?.kind === 'clap', look: lookAt,
        wave: R?.kind === 'wave' || greeting || (!player && L.moodPhase > 14),
        happy: R?.kind === 'happy' || (talking && Math.sin(t * 2.3) > 0.2),
      });
      // 카메라가 1.2 m 안으로 파고들면 디더로 비친다
      camera.getWorldPosition(_cv);
      const camD = Math.hypot(_cv.x - L.p.x, _cv.y - (L.p.y + L.top * 0.55), _cv.z - L.p.z);
      L.rig.setFade(camD < 1.2 ? THREE.MathUtils.lerp(0.35, 1, THREE.MathUtils.smoothstep(camD, 0.5, 1.2)) : 1);

      // 감정 말풍선: 부탁 '!', 반응(♥·반짝), 밤엔 'zzz', 평소엔 주기적으로
      let kind: BubbleKind | null = null;
      if (L.speech) kind = null;
      else if (R) kind = R.kind === 'happy' ? 'heart' : 'sparkle';
      else if (L.news && toP < 14) kind = 'bang';
      else {
        // 평소엔 주민마다 다른 긴 간격으로 잠깐만
        const cyc = (t + L.moodPhase) % L.moodEvery;
        if (cyc < 2.6) {
          const mk = L.def.moods[Math.floor((t + L.moodPhase) / L.moodEvery) % L.def.moods.length];
          kind = tod === 'night' && L.def.island !== 'mushroom' && (L.def.wander ?? 1) > 0 ? 'zzz' : mk === 'bang' ? 'note' : mk;
        }
      }
      const bubD = Math.hypot(_cv.x - L.p.x, _cv.y - (L.p.y + L.top + 0.2), _cv.z - L.p.z);
      L.bubble.visible = !!kind && bubD > 0.8;
      if (kind) {
        if (kind !== L.mood) {
          L.mood = kind;
          (L.bubble.material as THREE.MeshBasicMaterial).map = bubbleMap(kind);
        }
        const age = greeting ? 1.6 - (L.greetUntil - t) : (t + L.moodPhase) % L.moodEvery;
        const pop = dt <= 0 || kind === 'bang' || R ? 1 : Math.min(1, age / 0.2);
        L.bubble.scale.setScalar(Math.max(0.01, pop * (1 + 0.05 * Math.sin(t * 5))));
        L.bubble.position.y = L.top + 0.2 + 0.035 * Math.sin(t * 2.6) + (kind === 'bang' ? 0.04 * Math.abs(Math.sin(t * 4)) : 0);
        L.bubble.quaternion.copy(camera.quaternion);
      }
      updateSpeech(L, t, camera, dt <= 0);
    }
  }

  /** 수다용: 마주 보기 */
  function face(key: string, x: number, z: number, until: number) {
    const L = lives.get(key);
    if (L) L.look = { x, z, until };
  }
  /** 말풍선(수다): key 로 */
  function sayKey(key: string, page: string | null, shown: number) {
    const L = lives.get(key);
    if (L) sayOn(L, page, shown, now);
  }

  return { update, homes, lives, active, make, actorOf, addHome, relocate, face, sayKey };
}
