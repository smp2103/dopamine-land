// 캐릭터: 플레이어(HERO.player, 게임 상태에 맞춰 포즈) + 마을 곰 '곰 몽실'(HERO.villager) + 섬마다 테마 동물 주민 +
// 시설 NPC(꽥사장·느릿 관장·펭박사 ×2·펠리 선장, 청크 스트리밍), 접지 그림자, 감정 말풍선('!' = 부탁),
// E 말 걸기 → 타자기 말풍선(첫 만남 → 평소, 시간대는 env 에서) → 상점·박물관 또는 주민 메뉴(대화·선물·부탁).
// NPC 서비스(대화·우정·선물·반응)는 characters/npc.ts, 대사 고르기·우정 계산은 characters/dialog.ts(순수).
//
// game.ext.npc — characters/npc.ts 머리말 참고(list · talk · friendship · birthdayOf · spawnAt · addDialog · gift · name · homes).
// 디버그: window.__chars = { talk(id), force{mode,action,speed}, goto(id), conv(), friendship(id), gift(id,item), clap(x?,z?), wave(),
//   lineup(x,z), zoo(x,z), homes, npcs(), speak(id) }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { buildPlayer } from './characters/player';
import { buildVillager } from './characters/villager';
import { buildAnimal, ANIMAL_KINDS, type AnimalSpec, type AnimalKind } from './characters/animal';
import { blobShadow } from './characters/kit';
import { bubbleTexture } from './characters/tex';
import { setupResidents, sayOn, updateSpeech, type Talker, type PlacedDef } from './characters/residents';
import { RESIDENTS, ISLAND_LINES, TOD_LINES, FACILITY_NPCS, MONGSIL, type FacilityNpcDef, type NpcSpot } from './characters/data';
import { createNpcService, type NpcInfo, type NpcReaction } from './characters/npc';
import { josa } from './characters/dialog';

export const order = 20;

/** 도감 줄 세우기용 기본 색(새 종 포함) */
const ZOO: Partial<Record<AnimalKind, Partial<AnimalSpec>>> = {
  bear: { fur: '#f3b77e', light: '#fff1dc' }, cat: { fur: '#ffc98f', light: '#fff4e2' }, rabbit: { fur: '#fff6f0', light: '#ffffff' },
  penguin: { fur: '#3d4a6b', light: '#ffffff' }, polar: { fur: '#fbfcff', light: '#ffffff' }, squirrel: { fur: '#d9935a', light: '#fff1dc' },
  otter: { fur: '#a8774f', light: '#f4dcc0' }, camel: { fur: '#e8c08a', light: '#fbe6c4' }, fox: { fur: '#ffcf8a', light: '#fffaf0' }, dog: { fur: '#f4d6a8', light: '#c98b55' },
  duck: { fur: '#fff3c4', light: '#fffaf0' }, turtle: { fur: '#a8dc8c', light: '#fff1c8' }, beaver: { fur: '#c08a5e', light: '#f6dcc0' },
  pelican: { fur: '#fffaf2', light: '#ffffff' }, sheep: { fur: '#fff8ec', light: '#ffe2d2' }, raccoon: { fur: '#c9b4a2', light: '#fff4ea' },
  owl: { fur: '#c9a07a', light: '#fff0dc' }, panda: { fur: '#fffaf2', light: '#ffffff' }, frog: { fur: '#9fe07a', light: '#f4ffd8' },
  koala: { fur: '#b8c4d6', light: '#fffaf2' }, hamster: { fur: '#ffc98a', light: '#fffaf0' }, alpaca: { fur: '#fff1dc', light: '#fff8ee' },
  hedgehog: { fur: '#e9c9a0', light: '#fff1e0' },
};

export default function build(ctx: Ctx) {
  const { island, camera } = ctx;
  const { HERO, PLACES } = island;
  const game = ctx.game;
  const group = new THREE.Group();
  group.name = 'characters';
  try { void document.fonts?.load('52px Jua'); } catch { /* 글꼴 없으면 시스템 글꼴 */ }

  const player = buildPlayer();
  const dbg: Record<string, unknown> & { force: null | Partial<Parameters<typeof player.animate>[0]> } = { force: null };
  (window as unknown as { __chars: typeof dbg }).__chars = dbg;
  const py = island.heightAt(HERO.player.x, HERO.player.z);
  player.root.position.set(HERO.player.x, py, HERO.player.z);
  group.add(player.root);

  // 마을 곰 '곰 몽실'(npc_mongsil — 옛 이름 보리, 룩 테스트 장면 그대로)
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
  if (game) {
    // 이동·회전은 게임이, 몸 포즈는 여기서
    // 촬영·검수용: window.__chars.force = { mode, action, speed } 로 포즈를 강제할 수 있다
    game.player.setAvatar({
      root: player.root,
      animate: (s) => player.animate(dbg.force ? { ...s, ...dbg.force } : s),
      holdSlot: player.holdSlot,
    });
  }
  const vs = blobShadow(0.34, 0.38);
  vs.position.set(0, 0.012, 0);
  villBox.add(vs);

  // 곰의 감정 말풍선(♪, 부탁이 있으면 !)
  const noteTex = bubbleTexture('note'), bangTex = bubbleTexture('bang');
  const bubble = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.46),
    new THREE.MeshBasicMaterial({ map: noteTex, transparent: true, depthWrite: false, alphaTest: 0.02 }),
  );
  bubble.renderOrder = 5;
  const bubbleBase = new THREE.Vector3(0.18, 1.48, 0.05);
  bubble.position.copy(bubbleBase);
  villBox.add(bubble);

  const mongsil: Talker & { news: boolean; react: NpcReaction | null } = {
    name: MONGSIL.name, accent: MONGSIL.accent, container: villBox, top: 1.3,
    speech: null, speechGone: -1, talking: false, news: false, react: null,
  };

  // ── 시설 NPC 자리(GDD 3.10.1) ──
  const toWorld = (p: { x: number; z: number; rotY?: number }, lx: number, lz: number) => {
    const r = p.rotY ?? 0, c = Math.cos(r), s = Math.sin(r);
    return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c, yaw: r };
  };
  const dry = (x: number, z: number) => island.heightAt(x, z) > 0.35 && !Number.isFinite(island.waterLevelAt(x, z));
  /** 근처 마른 땅(나선형으로 찾기) */
  const dryNear = (x: number, z: number, maxR = 10) => {
    if (dry(x, z)) return { x, z };
    for (let r = 1; r <= maxR; r += 1) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (dry(px, pz)) return { x: px, z: pz };
    }
    return { x, z };
  };
  const spotOf = (spot: NpcSpot): { x: number; z: number; yaw: number } | null => {
    try {
      switch (spot) {
        // 꽥꽥상회: 가게 문 왼쪽 앞(차양 밖), 손님 쪽(+z)을 본다
        case 'shop': return toWorld(PLACES.shop, -1.7, 3.05);
        // 박물관: 계단 오른쪽 옆 마당
        case 'museum': return toWorld(PLACES.museum, 3.1, 6.3);
        // 펭박사 연구소 앞(돔 반지름 9 + 마당)
        case 'pengLab': { const L = PLACES.pengLab; const w = toWorld(L, 2.8, 11.6); const d = dryNear(w.x, w.z, 8); return { ...d, yaw: L.rotY }; }
        // 말랑섬 부두 앞(P0: 첫 대화에서 로켓 꿈) — 마을 쪽을 본다
        case 'pier': {
          // village 와 같은 식으로 부두가 뭍에 닿는 곳을 찾고(부두 → 뭍 방향으로 걷기), 그 옆 마른 땅에 선다
          const P = PLACES.pier, B = PLACES.boatDock;
          const L = Math.hypot(B.x - P.x, B.z - P.z) || 1, dx = (B.x - P.x) / L, dz = (B.z - P.z) / L;
          let sx = P.x, sz = P.z;
          for (let i = 0; i < 80; i++) {
            sx -= dx * 0.5; sz -= dz * 0.5;
            if (island.surfaceAt(sx, sz).coastDist > 1.0) break;
          }
          const d = dryNear(sx - dx * 3.4 + dz * 2.6, sz - dz * 3.4 - dx * 2.6, 8);
          return { ...d, yaw: Math.atan2(-dx, -dz) };
        }
        // 조선소 계산대 뒤(village 가 잡은 펠리 선장 자리)
        case 'shipyard': {
          const sy = (game?.ext.village as { positions?: { shipyard?: { pelican?: { x: number; z: number }; counter?: { x: number; z: number; rotY: number } } } } | undefined)?.positions?.shipyard;
          if (sy?.pelican && sy.counter) return { x: sy.pelican.x, z: sy.pelican.z, yaw: sy.counter.rotY };
          const S = PLACES.shipyard;
          return toWorld(S, 0, -0.95);
        }
        case 'plaza': return { x: vx, z: vz, yaw: villYaw0 };
      }
    } catch { return null; }
    return null;
  };
  const facilityDefs: PlacedDef[] = [];
  for (const n of FACILITY_NPCS) {
    if (!n.spec) continue; // 몽실은 villager 모델
    for (const sp of n.spots) {
      const at = spotOf(sp);
      if (!at) continue;
      facilityDefs.push({
        id: n.spots.length > 1 ? `${n.id}@${sp}` : n.id, npc: n.id, name: n.name, island: sp === 'pier' ? 'home' : n.island,
        catchphrase: n.catchphrase, spec: n.spec, accent: n.accent, moods: n.moods,
        at: { x: at.x, z: at.z }, yaw: at.yaw, wander: 0, keepSpec: true,
      });
    }
  }

  // 섬 주민 + 시설 NPC(같은 청크 층)
  const res = setupResidents(ctx, camera, [...RESIDENTS, ...facilityDefs]);
  if (!game) {
    // 룩 테스트: 마을 주민만 고정 배치
    for (const h of res.homes) {
      if (!h.def.at || h.def.npc) continue;
      const L = res.make(h);
      res.lives.set(h.def.id, L);
      res.active.add(L);
      group.add(L.container);
    }
  }

  // 주민 집 자리 — village 가 주민 오두막을 짓는다(시설 NPC 는 빼고)
  const homes = res.homes.filter((h) => !h.def.npc).map((h) => ({ id: h.def.id, island: h.def.island, x: +h.x.toFixed(1), z: +h.z.toFixed(1) }));
  dbg.homes = homes;

  // ── NPC 서비스 ──
  const infoOfResident = (r: (typeof RESIDENTS)[number]): NpcInfo => ({
    id: r.id, name: r.name, island: r.island, accent: r.accent, kind: 'resident',
    social: { birthday: r.birthday, likes: r.likes, dislikes: r.dislikes, voice: r.voice },
    talk: {
      id: r.id, catchphrase: r.catchphrase,
      first: [`처음 보는 얼굴이네! 난 ${r.name}${josa(r.name, '이야', '야')}, {c}!`, ...(r.lines?.slice(0, 1) ?? [])],
      usual: [...(r.lines ?? []), ...(r.lines ?? []), ...(ISLAND_LINES[r.island] ?? ISLAND_LINES.home)],
      tod: TOD_LINES,
    },
    after: { type: 'menu' },
  });
  const infoOfFacility = (n: FacilityNpcDef): NpcInfo => ({
    id: n.id, name: n.name, island: n.island, accent: n.accent, kind: 'facility',
    social: { birthday: n.birthday, likes: n.likes, dislikes: n.dislikes, voice: n.voice },
    talk: { id: n.id, catchphrase: n.catchphrase, first: n.first, usual: n.usual, tod: n.tod, role: n.role },
    after: n.after,
  });
  let curTod = ctx.tod;
  ctx.onTod((name) => { curTod = name; });
  const tod = () => game?.env?.tod ?? curTod;

  const svc = game ? createNpcService(game, {
    infos: [...FACILITY_NPCS.map(infoOfFacility), ...RESIDENTS.map(infoOfResident)],
    rng: (k) => ctx.rng(k),
    todFallback: () => curTod,
  }) : null;
  if (svc && game) {
    for (const h of res.homes) svc.register(res.actorOf(h));
    // 몽실(마을 광장, 늘 있다)
    let now = 0;
    game.onUpdate((t) => { now = t; });
    svc.register({
      key: MONGSIL.id, id: MONGSIL.id,
      pos: () => villBox.position,
      present: () => game.world === 'earth',
      say: (page, shown) => sayOn(mongsil, page, shown, now),
      setTalking: (on) => { mongsil.talking = on; },
      setNews: (on) => { mongsil.news = on; },
      react: (r) => { mongsil.react = r; },
      moveTo: (x, z) => { villBox.position.set(x, island.heightAt(x, z), z); },
    });
    // game.ext.npc(주인: characters) — 다른 모듈이 미리 붙인 키(moveIn 등)는 남긴다
    const ext = game.ext as Record<string, unknown>;
    ext.npc = Object.assign((ext.npc ?? {}) as Record<string, unknown>, svc.api, { homes });
  }

  // ── 디버그 훅 ──
  dbg.talk = (id: string) => svc?.talk(id) ?? [];
  dbg.speak = dbg.talk;
  dbg.conv = () => svc?.conv() ?? null;
  dbg.friendship = (id: string) => (svc ? { ...svc.flagOf(id) } : null);
  dbg.gift = (id: string, item: string) => svc?.gift(id, item) ?? null;
  dbg.npcs = () => res.homes.map((h) => ({ key: h.def.id, id: h.def.npc ?? h.def.id, name: h.def.name, x: +h.x.toFixed(1), z: +h.z.toFixed(1), live: res.active.has(res.lives.get(h.def.id)!) }))
    .concat([{ key: MONGSIL.id, id: MONGSIL.id, name: MONGSIL.name, x: vx, z: vz, live: true }]);
  dbg.clap = (x?: number, z?: number) => game?.state.emit({ type: 'clap', x: x ?? game.player.pos.x, z: z ?? game.player.pos.z });
  dbg.wave = () => game?.state.emit({ type: 'launch-wave' });
  /** NPC 앞으로 순간이동(촬영용): 그 NPC 가 보는 쪽 dist m 앞 */
  dbg.goto = (id: string, dist = 2.2) => {
    if (!game) return null;
    const h = res.homes.find((x) => x.def.id === id || x.def.npc === id);
    const at = h ? { x: h.x, z: h.z, yaw: h.def.yaw ?? 0 } : id === MONGSIL.id ? { x: vx, z: vz, yaw: villYaw0 } : null;
    if (!at) return null;
    const x = at.x + Math.sin(at.yaw) * dist, z = at.z + Math.cos(at.yaw) * dist;
    game.player.teleport(x, z);
    game.player.yaw = Math.atan2(x - at.x, z - at.z);
    game.cam.yaw = game.player.yaw;
    return { x, z, npc: at };
  };
  // 검수용: 모든 주민을 한 줄로 세워 본다
  dbg.lineup = (x: number, z: number, gap = 1.15, cols = 5, from = 0) => {
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
  // 검수용: 동물 종 전부(새 종 13 포함)를 기본 색으로 줄 세우기
  dbg.zoo = (x: number, z: number, gap = 1.1, cols = 6, kinds: AnimalKind[] = [...ANIMAL_KINDS]) => {
    const row = new THREE.Group();
    row.name = 'characters-zoo';
    const rigs: Array<ReturnType<typeof buildAnimal>> = [];
    kinds.forEach((k, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const rig = buildAnimal({ kind: k, fur: '#f3b77e', light: '#fff1dc', ...ZOO[k] } as AnimalSpec);
      const px = x + (c - (cols - 1) / 2) * gap, pz = z - r * 1.6;
      rig.root.position.set(px, island.heightAt(px, pz), pz);
      row.add(rig.root);
      rigs.push(rig);
    });
    group.add(row);
    if (game) game.onUpdate((t, dt) => { for (const g of rigs) g.update(t, dt, { walk: 0, talk: false, wave: false, happy: false }); });
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

  ctx.onUpdate((t, dt) => {
    if (!game) player.update(t);
    // 곰: 대화 중이면 플레이어를 보고 몸짓, 아니면 손 흔들기
    vill.update(t);
    const pp = game?.player.pos;
    const R = mongsil.react && t < mongsil.react.until ? mongsil.react : null;
    const look = R && R.x != null && R.z != null ? { x: R.x, z: R.z } : pp && Math.hypot(pp.x - villBox.position.x, pp.z - villBox.position.z) < 5 ? pp : null;
    if (look) {
      const want = Math.atan2(look.x - villBox.position.x, look.z - villBox.position.z);
      let d = want - vill.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      vill.root.rotation.y += dt > 0 ? d * Math.min(1, dt * 5) : d;
    }
    // 박수·대화엔 통통
    vill.root.position.y = R?.kind === 'clap' ? 0.04 * Math.abs(Math.sin(t * 7)) : mongsil.talking ? 0.02 * Math.abs(Math.sin(t * 6)) : 0;
    const k = Math.sin(t * 2.6);
    // 카메라가 곰 몸 안으로 파고들면 디더로 비치게, 말풍선은 숨긴다
    camera.getWorldPosition(camW);
    const bx = villBox.position.x, by = villBox.position.y, bz = villBox.position.z;
    const camD = Math.hypot(camW.x - bx, camW.y - (by + 0.7), camW.z - bz);
    const fade = camD < 1.2 ? THREE.MathUtils.lerp(0.35, 1, THREE.MathUtils.smoothstep(camD, 0.5, 1.2)) : 1;
    if (Math.abs(fade - villFade) > 0.01) { villFade = fade; for (const m of villMats) m.opacity = fade; }
    const bm = bubble.material as THREE.MeshBasicMaterial;
    const want = mongsil.news ? bangTex : noteTex;
    if (bm.map !== want) bm.map = want;
    bubble.visible = !mongsil.speech && Math.hypot(camW.x - bx, camW.y - (by + 1.48), camW.z - bz) > 0.8;
    bubble.position.set(bubbleBase.x, bubbleBase.y + 0.035 * k, bubbleBase.z);
    bubble.quaternion.copy(camera.quaternion);
    bubble.scale.setScalar(1 + 0.04 * Math.max(0, Math.sin(t * 5.2)));
    updateSpeech(mongsil, t, camera, dt <= 0);
    res.update(t, dt, pp ?? null, tod());
  });

  return group;
}
