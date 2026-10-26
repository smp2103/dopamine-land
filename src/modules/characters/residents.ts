// 주민 런타임: 청크 스트리밍으로 가까운 섬 주민만 만들고(한 번 만든 모델은 재사용), 천천히 돌아다니고,
// 감정 말풍선을 띄우고, 플레이어가 다가오면 "!" + 손 흔들기, E 로 말 걸면 대사 말풍선.
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import { applyCurve } from '../../core/curve';
import { buildAnimal, type AnimalRig, type Outfit, type Accessory } from './animal';
import { blobShadow } from './kit';
import { bubbleTexture, speechTexture, type BubbleKind } from './tex';
import { RESIDENTS, ISLAND_LINES, TOD_LINES, type ResidentDef } from './data';

const bubbleTex = new Map<BubbleKind, THREE.Texture>();
function bubbleMat(kind: BubbleKind): THREE.MeshBasicMaterial {
  let t = bubbleTex.get(kind);
  if (!t) { t = bubbleTexture(kind); bubbleTex.set(kind, t); }
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, alphaTest: 0.02 });
}
const BUBBLE_GEO = new THREE.PlaneGeometry(0.5, 0.5);
BUBBLE_GEO.userData.shared = true;
const SPEECH_GEO = new THREE.PlaneGeometry(2.3, 1.15);
SPEECH_GEO.userData.shared = true;

/** 말 거는 대상(동물 주민 + 마을 곰) 공통 */
export interface Talker {
  name: string;
  accent: string;
  catchphrase: string;
  island: string;
  lines: string[];
  container: THREE.Group;
  /** 말풍선 높이(m) */
  top: number;
  pos: () => THREE.Vector3;
  speech: THREE.Mesh | null;
  speechUntil: number;
  talkUntil: number;
  lastLine: number;
  rnd: () => number;
}

export function speak(ctx: Ctx, who: Talker, now: number) {
  const tod = ctx.tod in TOD_LINES ? ctx.tod : 'day';
  const pool = [...who.lines, ...who.lines, ...(ISLAND_LINES[who.island] ?? ISLAND_LINES.home), ...TOD_LINES[tod]];
  let i = Math.floor(who.rnd() * pool.length);
  if (i === who.lastLine) i = (i + 1) % pool.length;
  who.lastLine = i;
  (who as { news?: boolean }).news = false;
  const line = pool[i].replaceAll('{c}', who.catchphrase);
  if (who.speech) {
    (who.speech.material as THREE.MeshBasicMaterial).map?.dispose();
    (who.speech.material as THREE.Material).dispose();
    who.speech.removeFromParent();
  }
  const m = new THREE.Mesh(SPEECH_GEO, new THREE.MeshBasicMaterial({ map: speechTexture(who.name, line, who.accent), transparent: true, depthWrite: false, alphaTest: 0.02 }));
  m.renderOrder = 6;
  m.position.set(0, who.top + 0.78, 0);
  who.container.add(m);
  applyCurve(m);
  who.speech = m;
  who.speechUntil = now + 5.5;
  who.talkUntil = now + 3.2;
  ctx.game?.ui.toast(`${who.name}: ${line}`, 3600);
}

/** 대사 말풍선: 카메라를 보고, 톡 튀어나와서, 시간이 지나면 사라진다 */
export function updateSpeech(who: Talker, now: number, camera: THREE.Camera, snap = false) {
  const s = who.speech;
  if (!s) return;
  const left = who.speechUntil - now;
  if (left <= 0) {
    (s.material as THREE.MeshBasicMaterial).map?.dispose();
    (s.material as THREE.Material).dispose();
    s.removeFromParent();
    who.speech = null;
    return;
  }
  const age = 5.5 - left;
  const pop = snap ? 1 : age < 0.25 ? THREE.MathUtils.smoothstep(age, 0, 0.25) * (1 + 0.15 * Math.sin(age * 25)) : 1;
  const fade = Math.min(1, left / 0.4);
  s.scale.setScalar(Math.max(0.01, pop * (0.6 + 0.4 * fade)));
  (s.material as THREE.MeshBasicMaterial).opacity = fade;
  s.quaternion.copy(camera.quaternion);
  // 카메라 쪽 부모 회전 보정(컨테이너는 회전하지 않는다)
}

// 옷·두 번째 소품을 주민마다 돌린다(같은 몸이라도 실루엣·색이 달라 보이게)
const OUTFITS: Outfit[] = ['overalls', 'pocket', 'stripe', 'dress', 'hoodie'];
const ACC2: Accessory[] = ['glasses', 'none', 'bow', 'none', 'none', 'bow', 'none'];

const _cv = new THREE.Vector3();

interface Live extends Talker {
  def: ResidentDef;
  rig: AnimalRig;
  home: THREE.Vector2;
  p: THREE.Vector3;
  yaw: number;
  target: THREE.Vector2 | null;
  idleUntil: number;
  bubble: THREE.Mesh;
  mood: BubbleKind;
  greetUntil: number;
  near: boolean;
  moodPhase: number;
  /** 새로 말 걸 거리가 있음('!') */
  news: boolean;
  moodEvery: number;
}

/** 부두에서 섬 안쪽으로 걸어가며 평평한 땅을 찾는다 */
function placeOnIsland(ctx: Ctx, def: ResidentDef): { x: number; z: number } | null {
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

export function setupResidents(ctx: Ctx, camera: THREE.Camera) {
  const game = ctx.game;
  const { island } = ctx;
  const lives = new Map<string, Live>();
  const active = new Set<Live>();
  const homes: Array<{ def: ResidentDef; x: number; z: number }> = [];
  for (const def of RESIDENTS) {
    const at = placeOnIsland(ctx, def);
    if (at) homes.push({ def, ...at });
  }

  function make(h: { def: ResidentDef; x: number; z: number }): Live {
    const def = h.def;
    const idx = Math.max(0, RESIDENTS.indexOf(def));
    const spec = { ...def.spec };
    // 우주복(헬멧)은 흰 옷 그대로, 나머지는 이름표 색으로 옷 모양을 돌린다
    if (spec.acc !== 'helmet') {
      spec.outfit = spec.outfit ?? OUTFITS[idx % OUTFITS.length];
      spec.outfitColor = spec.outfitColor ?? def.accent;
    }
    if (!spec.acc2) spec.acc2 = spec.acc === 'none' ? 'glasses' : ACC2[idx % ACC2.length];
    const rig = buildAnimal(spec);
    const container = new THREE.Group();
    container.name = `resident:${def.id}`;
    const y = island.heightAt(h.x, h.z);
    container.position.set(h.x, y, h.z);
    container.add(rig.root);
    const sh = blobShadow(0.34 * (def.spec.scale ?? 1), 0.38);
    sh.position.y = 0.012;
    container.add(sh);
    const rnd = ctx.rng(`resident:${def.id}`);
    const mood = def.moods[0];
    const bubble = new THREE.Mesh(BUBBLE_GEO, bubbleMat(mood));
    bubble.renderOrder = 5;
    bubble.position.set(0.2, rig.top + 0.2, 0);
    container.add(bubble);
    const live: Live = {
      def, rig, container, top: rig.top,
      name: def.name, accent: def.accent, catchphrase: def.catchphrase, island: def.island, lines: def.lines ?? [],
      home: new THREE.Vector2(h.x, h.z), p: new THREE.Vector3(h.x, y, h.z),
      yaw: rnd() * Math.PI * 2, target: null, idleUntil: rnd() * 3,
      bubble, mood, greetUntil: -1, near: false, moodPhase: rnd() * 30,
      news: idx % 7 === 1, moodEvery: 11 + rnd() * 10,
      speech: null, speechUntil: 0, talkUntil: 0, lastLine: -1, rnd,
      pos: () => live.p,
    };
    // 시작은 카메라(남쪽) 쪽을 조금 보게
    live.yaw = 0.3 * (rnd() - 0.5);
    return live;
  }

  if (game) {
    game.chunks.add({
      key: 'characters-residents', size: 96, radius: 260, world: 'earth',
      build: ({ x0, z0, size }) => {
        const mine = homes.filter((h) => h.x >= x0 && h.x < x0 + size && h.z >= z0 && h.z < z0 + size);
        if (!mine.length) return null;
        const g = new THREE.Group();
        g.name = 'residents-chunk';
        for (const h of mine) {
          let L = lives.get(h.def.id);
          if (!L) { L = make(h); lives.set(h.def.id, L); }
          g.add(L.container);
          active.add(L);
        }
        g.userData.residents = mine.map((h) => h.def.id);
        return g;
      },
      // 모델은 다시 쓰니 지오메트리를 버리지 않는다
      dispose: (o) => {
        for (const id of (o.userData.residents as string[]) ?? []) {
          const L = lives.get(id);
          if (L) active.delete(L);
        }
      },
    });
  }

  const tmp = new THREE.Vector2();
  function update(t: number, dt: number, player: THREE.Vector3 | null, tod: string) {
    for (const L of active) {
      const toP = player ? Math.hypot(player.x - L.p.x, player.z - L.p.z) : 99;
      const talking = t < L.talkUntil;
      // 다가오면 "!" + 손 흔들기
      if (toP < 6 && !L.near) { L.near = true; L.greetUntil = t + 1.6; }
      if (toP > 8) L.near = false;
      let walk = 0;
      if (talking || toP < 3.2) {
        L.target = null;
        L.idleUntil = t + 1.5;
      } else if (dt > 0) {
        if (!L.target && t > L.idleUntil) {
          const a = L.rnd() * Math.PI * 2, r = 1 + L.rnd() * (L.def.at ? 2.5 : 5);
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
            const want = Math.atan2(tmp.x, tmp.y);
            let dd = want - L.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
            L.yaw += dd * Math.min(1, dt * 6);
          }
        }
      }
      // 가까우면 플레이어를 본다
      if (player && toP < 4.5) {
        const want = Math.atan2(player.x - L.p.x, player.z - L.p.z);
        let dd = want - L.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        L.yaw += dt > 0 ? dd * Math.min(1, dt * 5) : dd;
      }
      L.container.position.copy(L.p);
      L.rig.root.rotation.y = L.yaw;
      const greeting = t < L.greetUntil;
      // 눈은 기본으로 뜨고, 말하는 중에만 웃는 눈
      L.rig.update(t, dt, { walk, talk: talking, wave: greeting || (!player && L.moodPhase > 14), happy: talking && Math.sin(t * 2.3) > 0.2 });
      // 카메라가 1.2 m 안으로 파고들면 디더로 비친다
      camera.getWorldPosition(_cv);
      const camD = Math.hypot(_cv.x - L.p.x, _cv.y - (L.p.y + L.top * 0.55), _cv.z - L.p.z);
      L.rig.setFade(camD < 1.2 ? THREE.MathUtils.lerp(0.35, 1, THREE.MathUtils.smoothstep(camD, 0.5, 1.2)) : 1);

      // 감정 말풍선: 인사 중 '!', 밤엔 'zzz', 평소엔 주기적으로
      let kind: BubbleKind | null = null;
      if (L.speech) kind = null;
      else if (L.news && (greeting || toP < 8)) kind = 'bang';
      else {
        // 평소엔 주민마다 다른 긴 간격으로 잠깐만
        const cyc = (t + L.moodPhase) % L.moodEvery;
        if (cyc < 2.6) {
          const mk = L.def.moods[Math.floor((t + L.moodPhase) / L.moodEvery) % L.def.moods.length];
          kind = tod === 'night' && L.def.island !== 'mushroom' ? 'zzz' : mk === 'bang' ? 'note' : mk;
        }
      }
      const bubD = Math.hypot(_cv.x - L.p.x, _cv.y - (L.p.y + L.top + 0.2), _cv.z - L.p.z);
      L.bubble.visible = !!kind && bubD > 0.8;
      if (kind) {
        if (kind !== L.mood) {
          L.mood = kind;
          (L.bubble.material as THREE.MeshBasicMaterial).map = bubbleTex.get(kind) ?? (bubbleMat(kind).map);
        }
        const age = greeting ? 1.6 - (L.greetUntil - t) : (t + L.moodPhase) % L.moodEvery;
        const pop = dt <= 0 ? 1 : Math.min(1, age / 0.2);
        L.bubble.scale.setScalar(Math.max(0.01, pop * (1 + 0.05 * Math.sin(t * 5))));
        L.bubble.position.y = L.top + 0.2 + 0.035 * Math.sin(t * 2.6);
        L.bubble.quaternion.copy(camera.quaternion);
      }
      updateSpeech(L, t, camera, dt <= 0);
    }
  }

  function nearest(p: THREE.Vector3, maxD: number): Live | null {
    let best: Live | null = null, bd = maxD;
    for (const L of active) {
      const d = Math.hypot(p.x - L.p.x, p.z - L.p.z);
      if (d < bd && Math.abs(p.y - L.p.y) < 2) { bd = d; best = L; }
    }
    return best;
  }

  return { update, nearest, homes, lives, active, make };
}
