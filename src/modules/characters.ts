// 캐릭터: 플레이어(HERO.player, 게임 상태에 맞춰 포즈) + 마을 곰(HERO.villager) + 섬마다 테마 동물 주민(청크 스트리밍),
// 접지 그림자, 감정 말풍선, E 말 걸기 → 섬별·시간대별 대사 말풍선.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { buildPlayer } from './characters/player';
import { buildVillager } from './characters/villager';
import { blobShadow } from './characters/kit';
import { bubbleTexture } from './characters/tex';
import { setupResidents, speak, updateSpeech, type Talker } from './characters/residents';
import { BORI } from './characters/data';

export const order = 20;

export default function build(ctx: Ctx) {
  const { island, camera } = ctx;
  const { HERO } = island;
  const group = new THREE.Group();
  group.name = 'characters';
  try { void document.fonts?.load('52px Jua'); } catch { /* 글꼴 없으면 시스템 글꼴 */ }

  const player = buildPlayer();
  const dbg: { force: null | Partial<Parameters<typeof player.animate>[0]>; homes?: unknown; speak?: (id: string) => void } = { force: null };
  (window as unknown as { __chars: typeof dbg }).__chars = dbg;
  const py = island.heightAt(HERO.player.x, HERO.player.z);
  player.root.position.set(HERO.player.x, py, HERO.player.z);
  group.add(player.root);

  // 마을 곰 '보리'(룩 테스트 장면 그대로)
  const vill = buildVillager();
  const vx = HERO.villager.x, vz = HERO.villager.z;
  const vy = island.heightAt(vx, vz);
  const villBox = new THREE.Group();
  villBox.position.set(vx, vy, vz);
  group.add(villBox);
  villBox.add(vill.root);
  const villYaw0 = Math.atan2(HERO.player.x - vx, HERO.player.z - vz) - 0.12;
  vill.root.rotation.y = villYaw0;

  const ps = blobShadow(0.32, 0.38);
  ps.position.set(0, 0.012, 0);
  ps.scale.z = 0.85;
  player.root.add(ps);
  if (ctx.game) {
    // 이동·회전은 게임이, 몸 포즈는 여기서
    // 촬영·검수용: window.__chars.force = { mode, action, speed } 로 포즈를 강제할 수 있다
    ctx.game.player.setAvatar({
      root: player.root,
      animate: (s) => player.animate(dbg.force ? { ...s, ...dbg.force } : s),
      holdSlot: player.holdSlot,
    });
  }
  const vs = blobShadow(0.34, 0.38);
  vs.position.set(0, 0.012, 0);
  villBox.add(vs);

  // 곰의 감정 말풍선(♪)
  const bubble = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.46),
    new THREE.MeshBasicMaterial({ map: bubbleTexture('note'), transparent: true, depthWrite: false, alphaTest: 0.02 }),
  );
  bubble.renderOrder = 5;
  const bubbleBase = new THREE.Vector3(0.18, 1.48, 0.05);
  bubble.position.copy(bubbleBase);
  villBox.add(bubble);

  const bori: Talker = {
    name: BORI.name, accent: BORI.accent, catchphrase: BORI.catchphrase, island: 'home', lines: BORI.lines,
    container: villBox, top: 1.3, pos: () => villBox.position,
    speech: null, speechUntil: 0, talkUntil: 0, lastLine: -1, rnd: ctx.rng('resident:bori'),
  };

  // 섬 주민
  const res = setupResidents(ctx, camera);
  if (!ctx.game) {
    // 룩 테스트: 마을 주민만 고정 배치
    for (const h of res.homes) {
      if (!h.def.at) continue;
      const L = res.make(h);
      res.lives.set(h.def.id, L);
      res.active.add(L);
      group.add(L.container);
    }
  }

  dbg.homes = res.homes.map((h) => ({ id: h.def.id, island: h.def.island, x: +h.x.toFixed(1), z: +h.z.toFixed(1) }));
  // 주민 집 자리 — village 가 주민 오두막을 짓는다(game.ext.npc.homes). 다른 모듈이 붙여 둔 ext.npc 는 덮지 않는다
  if (ctx.game) {
    const homes = dbg.homes as Array<{ id: string; island: string; x: number; z: number }>;
    const ext = ctx.game.ext as Record<string, unknown>;
    const npc = (ext.npc ?? {}) as Record<string, unknown>;
    if (!('homes' in npc)) npc.homes = homes;
    if (typeof npc.list !== 'function') npc.list = () => homes.map((h) => ({ id: h.id, island: h.island }));
    ext.npc = npc;
  }
  dbg.speak = (id: string) => {
    const L = id === 'bori' ? bori : res.lives.get(id);
    if (L) speak(ctx, L, ctx.game?.time ?? 1.5);
  };
  // 검수용: 모든 주민을 한 줄로 세워 본다
  (dbg as Record<string, unknown>).lineup = (x: number, z: number, gap = 1.15, cols = 5, from = 0) => {
    const row = new THREE.Group();
    res.homes.slice(from, from + cols * 3).forEach((h, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const L = res.make({ def: h.def, x: x + (c - (cols - 1) / 2) * gap + (r % 2) * gap * 0.5, z: z - r * 1.5 });
      L.yaw = 0;
      res.lives.set(h.def.id + ':lineup', L);
      res.active.add(L);
      row.add(L.container);
    });
    group.add(row);
    return row;
  };
  const villMats = new Set<THREE.Material>();
  vill.root.traverse((o) => {
    const mm = (o as THREE.Mesh).material;
    if (!mm) return;
    for (const m of Array.isArray(mm) ? mm : [mm]) if (!m.transparent) { m.alphaHash = true; villMats.add(m); }
  });
  let villFade = 1;
  const camW = new THREE.Vector3();
  let tod = ctx.tod;
  ctx.onTod((name) => { tod = name; });

  if (ctx.game) {
    const game = ctx.game;
    game.addProvider('characters-talk', (p) => {
      if (p.mounted || p.mode === 'swim' || p.mode === 'dive') return null;
      const L = res.nearest(p.pos, 2.6);
      const db = Math.hypot(p.pos.x - vx, p.pos.z - vz);
      if (db < 2.6 && (!L || db < Math.hypot(p.pos.x - L.p.x, p.pos.z - L.p.z))) {
        return { label: `${bori.name}에게 말 걸기`, dist: db, use: () => speak(ctx, bori, game.time) };
      }
      if (!L) return null;
      return { label: `${L.name}에게 말 걸기`, dist: Math.hypot(p.pos.x - L.p.x, p.pos.z - L.p.z), use: () => speak(ctx, L, game.time) };
    });
  }

  ctx.onUpdate((t, dt) => {
    const game = ctx.game;
    if (!game) player.update(t);
    // 곰: 대화 중이면 플레이어를 보고 몸짓, 아니면 손 흔들기
    vill.update(t);
    const pp = game?.player.pos;
    if (pp && Math.hypot(pp.x - vx, pp.z - vz) < 5) {
      const want = Math.atan2(pp.x - vx, pp.z - vz);
      let d = want - vill.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      vill.root.rotation.y += dt > 0 ? d * Math.min(1, dt * 5) : d;
    }
    const k = Math.sin(t * 2.6);
    // 카메라가 곰 몸 안으로 파고들면 디더로 비치게, 말풍선은 숨긴다
    camera.getWorldPosition(camW);
    const camD = Math.hypot(camW.x - vx, camW.y - (vy + 0.7), camW.z - vz);
    const fade = camD < 1.2 ? THREE.MathUtils.lerp(0.35, 1, THREE.MathUtils.smoothstep(camD, 0.5, 1.2)) : 1;
    if (Math.abs(fade - villFade) > 0.01) { villFade = fade; for (const m of villMats) m.opacity = fade; }
    bubble.visible = !bori.speech && Math.hypot(camW.x - vx, camW.y - (vy + 1.48), camW.z - vz) > 0.8;
    bubble.position.set(bubbleBase.x, bubbleBase.y + 0.035 * k, bubbleBase.z);
    bubble.quaternion.copy(camera.quaternion);
    bubble.scale.setScalar(1 + 0.04 * Math.max(0, Math.sin(t * 5.2)));
    updateSpeech(bori, t, camera, dt <= 0);
    res.update(t, dt, pp ?? null, tod);
  });

  return group;
}
