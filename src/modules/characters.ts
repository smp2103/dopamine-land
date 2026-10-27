// 캐릭터: 플레이어(HERO.player, 게임 상태에 맞춰 포즈) + 마을 곰 '곰 몽실'(HERO.villager) + 섬마다 테마 동물 주민 +
// 시설 NPC(꽥사장·느릿 관장·펭박사 ×2·펠리 선장, 청크 스트리밍), 접지 그림자, 감정 말풍선('!' = 부탁),
// E 말 걸기 → 타자기 말풍선(첫 만남 → 평소, 시간대는 env 에서) → 상점·박물관 또는 주민 메뉴(대화·선물·부탁).
// P1: 역할 NPC(통통 작업대 · 보들 다이빙 센터 · 프로 박사 화석 감정 · 낙타 상인 바자르 · 너구리 고물상 해변 · 양 자매 옷가게 ·
//   꾸물이 별다방 정거장 — game.space.addSpawn('station')), 섬 주인 7(부엉 교수·목길이 할머니·흰눈 영감·소금별·삐뽀 + 몽실·보들),
//   이주민 9(moveIn 으로 섬에 온다 — 집 자리는 여기서 지형으로 찾는다), 주민끼리 수다(characters/chatter.ts), 우정 100 이사 제안 + 사진.
// NPC 서비스(대화·우정·선물·반응·이사·감정)는 characters/npc.ts, 대사 고르기·우정 계산은 characters/dialog.ts(순수),
// 이주 규칙은 characters/migration.ts(순수), 특별 모델은 characters/special.ts.
//
// game.ext.npc — characters/npc.ts 머리말 참고(list · talk · friendship · birthdayOf · spawnAt · addDialog · gift · name · homes ·
//   owners · moveIn · nextResident · candidates · capacity · residents · proposal · appraise …).
// 디버그: window.__chars = { talk(id), force{mode,action,speed}, goto(id), conv(), friendship(id), gift(id,item), clap(x?,z?), wave(),
//   lineup(x,z), zoo(x,z), specials(x,z), homes, npcs(), speak(id), owners(), moveIn(id?,island), residents(), capacity(island),
//   befriend(id, n), proposal(id), accept(id), appraise(id?), chatter(), chat(), station() }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { buildPlayer } from './characters/player';
import { buildVillager } from './characters/villager';
import { buildAnimal, ANIMAL_KINDS, type AnimalSpec, type AnimalKind } from './characters/animal';
import { buildSpecial, SPECIAL_KINDS, SPECIAL_ZOO, type SpecialKind } from './characters/special';
import { blobShadow } from './characters/kit';
import { bubbleTexture } from './characters/tex';
import { setupResidents, placeOnIsland, sayOn, updateSpeech, type Talker, type PlacedDef } from './characters/residents';
import {
  RESIDENTS, MIGRANTS, ISLAND_LINES, TOD_LINES, FACILITY_NPCS, MONGSIL, type FacilityNpcDef, type NpcSpot, type ResidentDef,
} from './characters/data';
import { createNpcService, type NpcInfo, type NpcReaction } from './characters/npc';
import { createChatter, type ChatActor } from './characters/chatter';
import { josa } from './characters/dialog';
import { applyCurve } from '../core/curve';

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
  villBox.name = `npc-${MONGSIL.id}`;
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
  const faceYaw = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
  /** 섬 시설(노점·건물) 옆: 계산대 앞 자리에서 옆으로 side × 2.1 m, 시설 앞쪽을 본다(노점이 건물로 바뀌어도 안 묻힌다) */
  const besideFacility = (id: string, side: number): { x: number; z: number; yaw: number } | null => {
    const F = (PLACES.facilities as Record<string, { x: number; z: number; rotY: number } | undefined>)[id];
    if (!F) return null;
    const w = toWorld(F, side * 2.1, 0.3);
    const d = dryNear(w.x, w.z, 6);
    return { ...d, yaw: F.rotY };
  };
  /** 말랑섬 해변 모래(부두·조선소에서 조금 떨어진 곳) — 너구리 고물상 */
  const junkBeach = () => {
    const P = PLACES.pier, B = PLACES.boatDock;
    let sy: { x: number; z: number } | null = null;
    try { sy = PLACES.shipyard; } catch { sy = null; }
    for (let r = 14; r <= 90; r += 4) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + 0.13, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      const sf = island.surfaceAt(x, z);
      if (sf.kind !== 'sand' || sf.coastDist < 3 || sf.coastDist > 14 || !dry(x, z) || !island.isBuildable(x, z, 0.8)) continue;
      if (Math.hypot(x - B.x, z - B.z) < 10 || (sy && Math.hypot(x - sy.x, z - sy.z) < 14)) continue;
      return { x, z, yaw: faceYaw({ x, z }, { x: 0, z: 0 }) };
    }
    return { ...dryNear(P.x - 10, P.z + 6, 10), yaw: 0 };
  };
  /**
   * 공룡섬 거목 숲 — 목길이 할머니. 숲은 빽빽해서(나무가 가린다) 섬 도착 자리 둘레 빈 터(flora 가 14 m 비운다)의
   * 숲 쪽 가장자리에 선다: 배·순간이동으로 오면 바로 보이고, 뒤로는 거목 숲이 이어진다.
   */
  const giantForest = () => {
    const I = island.islandById('dino');
    if (!I) return null;
    const sp = island.islandSpawnPoints('dino', 1, 0.08)[0];
    if (sp) {
      let best: { x: number; z: number; score: number } | null = null;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        for (const r of [9, 10.5, 7.5, 12]) {
          const x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
          const sf = island.surfaceAt(x, z);
          if (!dry(x, z) || sf.kind === 'cliff' || sf.kind === 'river' || sf.kind === 'lava') continue;
          // 기울기(1.2 m 둘레 높이 차) — 평평할수록, 바깥(숲 쪽)이 정글일수록 좋다
          const hs = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => island.heightAt(x + dx * 1.2, z + dz * 1.2));
          const slope = Math.max(...hs) - Math.min(...hs);
          if (slope > 0.9) continue;
          const out = island.surfaceAt(sp.x + Math.cos(a) * (r + 8), sp.z + Math.sin(a) * (r + 8)).kind === 'jungle' ? 0 : 1;
          const score = out + slope + (sf.kind === 'jungle' ? 0 : 0.5) + k * 0.001;
          if (!best || score < best.score) best = { x, z, score };
          break;
        }
      }
      if (best) return { x: best.x, z: best.z, yaw: faceYaw(best, sp) };
    }
    const dock = PLACES.docks.dino;
    for (let r = 90; r <= I.r * 0.85; r += 22) for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + 0.4, x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
      if (island.surfaceAt(x, z).kind !== 'jungle' || !dry(x, z) || !island.isBuildable(x, z, 1.6)) continue;
      return { x, z, yaw: faceYaw({ x, z }, dock) };
    }
    return null;
  };
  /** 모래시계섬 오아시스 곁(별 읽는 사막여우) — 소금별 */
  const oasisSpot = () => {
    const lm = game?.geo?.landmarks.find((l) => l.id === 'lm:desert:oasis');
    const dock = PLACES.docks.desert;
    if (lm) {
      const L = Math.hypot(dock.x - lm.x, dock.z - lm.z) || 1;
      const x = lm.x + ((dock.x - lm.x) / L) * (lm.r + 6), z = lm.z + ((dock.z - lm.z) / L) * (lm.r + 6);
      const d = dryNear(x, z, 12);
      return { ...d, yaw: faceYaw(d, dock) };
    }
    const p = placeOnIsland(ctx, { id: 'npc_saltstar', name: '', island: 'desert', catchphrase: '', spec: { kind: 'fox', fur: '#fff', light: '#fff' }, accent: '', moods: [], inward: 60, side: -10 });
    return p ? { ...p, yaw: faceYaw(p, dock) } : null;
  };
  /** 별똥별섬 관제탑 발치(발사대 쪽 7 m) — 삐뽀 */
  const controlTower = () => {
    const L = PLACES.launchPad;
    const ct = { x: L.x + 55, z: L.z + 48 };
    const len = Math.hypot(L.x - ct.x, L.z - ct.z) || 1;
    const d = dryNear(ct.x + ((L.x - ct.x) / len) * 7, ct.z + ((L.z - ct.z) / len) * 7, 8);
    return { ...d, yaw: faceYaw(d, L) };
  };
  const spotOf = (spot: NpcSpot, nth = 0): { x: number; z: number; yaw: number } | null => {
    try {
      switch (spot) {
        // ── P1 역할 NPC ──
        // 작업대 옆(광장 게시판 쪽을 본다)
        case 'workbench': { const W = PLACES.workbench; const w = toWorld(W, 1.9, 1.3); const d = dryNear(w.x, w.z, 6); return { ...d, yaw: faceYaw(d, PLACES.townBoard) }; }
        case 'diving': return besideFacility('divingCenter', 1);
        case 'fossilLab': return besideFacility('fossilLab', 1);
        case 'bazaar': return besideFacility('bazaar', 1);
        case 'junkBeach': return junkBeach();
        // 꽥꽥상회 문 왼쪽(꽥사장 너머) 옷가게 자리 — 자매 둘이 나란히
        case 'sheepShop': {
          const w = toWorld(PLACES.shop, -4.3 - nth * 1.15, 3.5 + nth * 0.25);
          const d = dryNear(w.x, w.z, 6);
          return { ...d, yaw: faceYaw(d, PLACES.townBoard) + (nth ? -0.35 : 0.2) };
        }
        // 정거장(우주)은 space.addSpawn 으로 따로 선다
        case 'station': return null;
        // ── P1 섬 주인 ──
        case 'fireflyGarden': return besideFacility('fireflyGarden', -1);
        case 'iceHut': return besideFacility('iceHut', -1);
        case 'giantForest': return giantForest();
        case 'oasis': return oasisSpot();
        case 'controlTower': return controlTower();
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
    n.spots.forEach((sp, i) => {
      // 같은 자리 이름이 두 번(양 자매)이면 몇 번째인지로 나눈다
      const nth = n.spots.slice(0, i).filter((q) => q === sp).length;
      const at0 = spotOf(sp, nth);
      if (!at0) return;
      // 다른 NPC 와 겹치면(자매는 빼고) 옆 마른 땅으로 비켜 선다
      const at = { ...at0 };
      const clash = (x: number, z: number) => facilityDefs.some((d) => d.npc !== n.id && d.at && Math.hypot(d.at.x - x, d.at.z - z) < 2.4);
      if (clash(at.x, at.z)) {
        search: for (let r = 1.5; r <= 6; r += 1.5) for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2, x = at0.x + Math.cos(a) * r, z = at0.z + Math.sin(a) * r;
          if (dry(x, z) && !clash(x, z)) { at.x = x; at.z = z; break search; }
        }
      }
      facilityDefs.push({
        id: n.spots.length > 1 ? `${n.id}@${sp}${nth ? nth + 1 : ''}` : n.id, npc: n.id, name: n.name, island: sp === 'pier' ? 'home' : n.island,
        catchphrase: n.catchphrase, spec: (i > 0 && n.alt) || n.spec!, accent: n.accent, moods: n.moods, model: n.model,
        at: { x: at.x, z: at.z }, yaw: at.yaw, wander: 0, keepSpec: true,
      });
    });
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
  const infoOfResident = (r: ResidentDef, migrant = false): NpcInfo => ({
    id: r.id, name: r.name, island: r.island, accent: r.accent, kind: 'resident', migrant,
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
    after: n.after, owner: n.owner,
  });
  let curTod = ctx.tod;
  ctx.onTod((name) => { curTod = name; });
  const tod = () => game?.env?.tod ?? curTod;

  // ── 이주: 섬마다 빈 집 자리 찾기(주민 집과 4.5 m 넘게 떨어진 평지) ──
  const homeTaken = (x: number, z: number) => res.homes.some((h) => Math.hypot(h.x - x, h.z - z) < 4.5)
    || Math.hypot(vx - x, vz - z) < 4.5;
  /** 말랑마을 건물들(가게·박물관·작업대·게시판·집)과 겹치지 않게 */
  const villageBusy = (x: number, z: number) => {
    const spots: Array<{ x: number; z: number; r: number }> = [
      { ...PLACES.shop, r: 9 }, { ...PLACES.museum, r: 12 }, { ...PLACES.workbench, r: 5 }, { ...PLACES.townBoard, r: 4 }, { ...PLACES.bikeRack, r: 3 },
    ];
    try { spots.push({ ...PLACES.house, r: 11 }, { ...PLACES.mailbox, r: 3 }); } catch { /* 집터 없음 */ }
    return spots.some((q) => Math.hypot(q.x - x, q.z - z) < q.r);
  };
  const findSlot = (id: string, isl: string): { x: number; z: number } | null => {
    if (isl === 'home') {
      // 마을 광장 둘레(9~26 m) 평지, 건물·다른 집과 떨어져서
      for (let r = 9; r <= 26; r += 3.5) for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + r * 0.17;
        const x = vx + Math.cos(a) * r, z = vz + Math.sin(a) * r;
        if (!dry(x, z) || !island.isBuildable(x, z, 1.0) || villageBusy(x, z) || homeTaken(x, z)) continue;
        return { x: +x.toFixed(2), z: +z.toFixed(2) };
      }
      return null;
    }
    const base = MIGRANTS.find((m) => m.id === id) ?? RESIDENTS.find((r) => r.id === id);
    if (!base) return null;
    const sides = [-12, 12, 0, -18, 18, -6, 6, -24, 24];
    for (let k = 0; k < sides.length * 3; k++) {
      const def: PlacedDef = { ...base, island: isl, at: undefined, side: sides[k % sides.length], inward: 38 + Math.floor(k / sides.length) * 8 };
      const p = placeOnIsland(ctx, def);
      if (p && !homeTaken(p.x, p.z)) return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
    }
    return null;
  };
  /** ext.npc.homes(village 가 주민 오두막을 짓는다) — 이사 오면 늘어난다 */
  const syncHome = (id: string, isl: string, x: number, z: number) => {
    const row = homes.find((q) => q.id === id);
    if (row) { row.island = isl; row.x = +x.toFixed(1); row.z = +z.toFixed(1); }
    else homes.push({ id, island: isl, x: +x.toFixed(1), z: +z.toFixed(1) });
  };
  const migrantDef = (id: string, isl: string, x: number, z: number): PlacedDef | null => {
    const m = MIGRANTS.find((q) => q.id === id);
    return m ? { ...m, island: isl, at: { x, z } } : null;
  };
  /** 세계에 세우기: 새 이주민은 집 자리를 더하고 NPC 서비스에 자리 등록, 옛 주민은 옮긴다 */
  const settle = (id: string, isl: string, x: number, z: number) => {
    const known = res.homes.find((h) => h.def.id === id);
    if (known) {
      res.relocate(id, x, z);
    } else {
      const def = migrantDef(id, isl, x, z);
      if (!def) return;
      const h = res.addHome(def, x, z);
      if (h && svc) svc.register(res.actorOf(h));
    }
    syncHome(id, isl, x, z);
  };

  const svc = game ? createNpcService(game, {
    infos: [...FACILITY_NPCS.map(infoOfFacility), ...RESIDENTS.map((r) => infoOfResident(r)), ...MIGRANTS.map((r) => infoOfResident(r, true))],
    rng: (k) => ctx.rng(k),
    todFallback: () => curTod,
    place: (id, isl) => findSlot(id, isl),
    onMove: (id, isl, x, z) => settle(id, isl, x, z),
    here: () => game.geo?.zoneAt(game.player.pos.x, game.player.pos.z)?.island ?? null,
  }) : null;
  if (svc && game) {
    for (const h of res.homes) svc.register(res.actorOf(h));
    // 저장에서 이사 기록 되살리기(집 자리는 저장된 좌표 — 지형 탐색 다시 안 함)
    for (const r of svc.api.residents()) {
      const fl = svc.flagOf(r.id);
      if (!fl.home) continue;
      let at = fl.hx != null && fl.hz != null ? { x: fl.hx, z: fl.hz } : null;
      at ??= findSlot(r.id, fl.home);
      if (at) settle(r.id, fl.home, at.x, at.z);
    }
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

  // ── 꾸물이(별다방 정거장 — space 가 order 40 이라 생기면 그때 addSpawn) ──
  const kk = FACILITY_NPCS.find((n) => n.id === 'npc_kkumul')!;
  const kTalk: Talker & { react: NpcReaction | null; news: boolean } = {
    name: kk.name, accent: kk.accent, container: new THREE.Group(), top: 1.3, speech: null, speechGone: -1, talking: false, react: null, news: false,
  };
  let kRig: ReturnType<typeof buildSpecial> | null = null;
  let kNow = 0;
  const kPos = new THREE.Vector3();
  const kLive = () => !!kRig && !!kTalk.container.parent && game?.world === 'space' && game.space?.planet === 'station';
  if (svc && game) {
    svc.register({
      key: kk.id, id: kk.id,
      pos: () => kTalk.container.getWorldPosition(kPos),
      present: kLive,
      say: (page, shown) => sayOn(kTalk, page, shown, kNow),
      setTalking: (on) => { kTalk.talking = on; },
      setNews: (on) => { kTalk.news = on; },
      react: (r) => { kTalk.react = r; },
    });
    let spawned = false;
    const offK = game.onUpdate(() => {
      if (spawned || !game.space?.addSpawn) return;
      spawned = true;
      offK();
      game.space.addSpawn('station', {
        id: 'characters-kkumul',
        build: (root) => {
          const shop = (game.ext.planets as { stationShop?: { pos: THREE.Vector3 | null; claimed: boolean } } | undefined)?.stationShop;
          // 가판대(앞 = +z, 폭 ±1.9 m) 오른쪽 끝 앞에 선다(뒤에 서면 가판대에 가린다). 자리를 모르면 별다방 국소 (−26, −14)
          const at = shop?.pos?.clone() ?? root.position.clone().add(new THREE.Vector3(-26, 0, -14));
          if (shop) shop.claimed = true;
          kRig = buildSpecial('octopus', kk.spec!);
          const c = new THREE.Group();
          c.name = `npc-${kk.id}`;
          c.position.set(at.x + 2.75, at.y, at.z + 0.45);
          c.add(kRig.root);
          const sh = blobShadow(0.42, 0.38);
          sh.position.y = 0.012;
          c.add(sh);
          kTalk.container = c;
          kTalk.top = kRig.top;
          kTalk.speech = null;
          kTalk.speechGone = -1;
          root.add(c);
          applyCurve(c);
        },
        update: (t, dt) => {
          if (!kRig || !kTalk.container.parent) return;
          kNow = t;
          const pp = game.player.pos, c = kTalk.container;
          const R = kTalk.react && t < kTalk.react.until ? kTalk.react : null;
          const near = Math.hypot(pp.x - c.position.x, pp.z - c.position.z) < 6;
          const want = near ? Math.atan2(pp.x - c.position.x, pp.z - c.position.z) : 0;
          let d = want - kRig.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
          kRig.root.rotation.y += dt > 0 ? d * Math.min(1, dt * 4) : d;
          kRig.update(t, dt, { walk: 0, talk: kTalk.talking, wave: near && !kTalk.talking, happy: R?.kind === 'happy' || kTalk.talking, clap: R?.kind === 'clap' });
          updateSpeech(kTalk, t, camera, dt <= 0);
        },
      });
    });
  }

  // ── 주민끼리 수다(플레이어 근처의 두 주민) ──
  const chatter = createChatter({
    rng: (k) => ctx.rng(k),
    say: (key, page, shown) => res.sayKey(key, page, shown),
    face: (key, x, z, until) => res.face(key, x, z, until),
  });
  const chatList: ChatActor[] = [];
  const chatActors = (): ChatActor[] => {
    chatList.length = 0;
    const busyId = svc?.api.talking() ?? null;
    for (const L of res.active) {
      if (L.def.npc) continue;
      chatList.push({
        key: L.def.id, name: L.def.name, catchphrase: L.def.catchphrase, island: L.def.island, x: L.p.x, z: L.p.z,
        busy: L.talking || busyId === L.npcId,
      });
    }
    return chatList;
  };

  // ── 디버그 훅 ──
  dbg.talk = (id: string) => svc?.talk(id) ?? [];
  dbg.speak = dbg.talk;
  dbg.conv = () => svc?.conv() ?? null;
  dbg.friendship = (id: string) => (svc ? { ...svc.flagOf(id) } : null);
  dbg.gift = (id: string, item: string) => svc?.gift(id, item) ?? null;
  dbg.npcs = () => res.homes.map((h) => ({ key: h.def.id, id: h.def.npc ?? h.def.id, name: h.def.name, x: +h.x.toFixed(1), z: +h.z.toFixed(1), live: res.active.has(res.lives.get(h.def.id)!) }))
    .concat([{ key: MONGSIL.id, id: MONGSIL.id, name: MONGSIL.name, x: vx, z: vz, live: true }]);
  // ── P1 디버그 ──
  dbg.owners = () => svc?.api.owners() ?? [];
  dbg.moveIn = (id: string | undefined, isl: string) => svc?.api.moveIn(id, isl) ?? false;
  dbg.residents = () => svc?.api.residents() ?? [];
  dbg.capacity = (isl: string) => svc?.api.capacity(isl) ?? null;
  /** 우정 n 더하기(100 이 되면 이사 제안·사진) */
  dbg.befriend = (id: string, n = 100) => { if (!svc) return null; svc.gain(id, n); return { ...svc.flagOf(id) }; };
  dbg.proposal = (id: string) => svc?.api.proposal(id) ?? null;
  dbg.accept = (id: string) => svc?.api.acceptMove(id) ?? false;
  dbg.appraise = (id?: string) => svc?.api.appraise(id) ?? null;
  dbg.chatter = () => chatter.current();
  dbg.chat = () => (game ? chatter.force(game.time, chatActors(), game.player.pos) : false);
  /** 별다방 정거장으로(꾸물이 보기) */
  dbg.station = () => { const pl = game?.ext.planets as { travel?: (id: string) => boolean } | undefined; if (game?.space) { game.space.goPlanet('station'); return true; } return pl?.travel?.('station') ?? false; };
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
  // 검수용: 특별 모델 여섯(브라키오·프로토·문어·로봇·외계인·아기공룡)
  dbg.specials = (x: number, z: number, gap = 1.6, kinds: SpecialKind[] = [...SPECIAL_KINDS]) => {
    const row = new THREE.Group();
    row.name = 'characters-specials';
    const rigs = kinds.map((k, i) => {
      const rig = buildSpecial(k, SPECIAL_ZOO[k]);
      const px = x + (i - (kinds.length - 1) / 2) * gap;
      rig.root.position.set(px, island.heightAt(px, z), z);
      row.add(rig.root);
      return rig;
    });
    group.add(row);
    if (game) game.onUpdate((t, dt) => { for (const g of rigs) g.update(t, dt, { walk: 0, talk: false, wave: false, happy: false }); });
    return row;
  };
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
    if (game && game.world === 'earth') chatter.update(t, dt, chatActors(), pp ?? null);
  });

  return group;
}
