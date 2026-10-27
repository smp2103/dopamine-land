// 공룡 P1(GDD 3.7 P1) — dinos.ts 가 installP1(host) 로 붙인다.
//  · 알 부화: 알도둑을 잡으면 공룡 알(it_dino_egg). 집 부화기(f_incubator 가구) 또는 화석 연구소 부화장(3칸)에 넣고 게임 3일 → E 로 깨우기.
//    종은 넣을 때 정해지고(비밀) 깨어나면 공개 + 도감. flags.dino.eggs = [{uid, sp, where, slot, start}]
//  · 성장 3단계(아기 → 꼬마 → 어른, 1.5일·3일): 목장 공룡은 하루 한 번 밥을 주면 0.25일 더 자란다. 어른이 되면 F 로 탄다.
//    flags.dino.ranch = [{uid, sp, born, boost, stage, fedDay}] — 화석 연구소 옆 공룡 목장(울타리)에 산다. 칸: 4, ext.meta.perk('ranch') 면 +4.
//  · 나팔이 리듬 놀이(친구 나팔이 E): 음악 상자 음표 ♪ 세 줄 — A·S·D(←↓→). 등급 S~C 보상(코인·하트·반짝별, 하루 3번).
//  · 알도둑: 아침 둥지 절벽에서 가방 과일을 훔쳐 도망 → 22초 안에 닿으면 잡는다(과일 돌려받고 알 하루 1개, 그다음엔 깃털).
//  · 목길어 목 엘리베이터(친구 E): 목을 타고 올라가 근처 절벽 위에 내려 주거나, 없으면 높은 열매(하루 1번)를 따 준다.
//  · 미끄럼틀 꼬리 미끄럼(친구 E): 등에 올라 꼬리를 타고 슝~ 가까운 호수에 풍덩.
//  · 화요일 대이동(weekday-event 'migration' 또는 env.weekday 1, 7~19시): 초원 계곡을 가로지르는 길을 무리가 왕복. 32 m 안 목격 → 하루 한 번 ⭐3 + 🪙500 + 화석 조각.
//  · 화석 복원기(화석 연구소 옆): 가방의 머리·몸·꼬리 세 조각 → 골격(fos_<공룡>) → econ.display 로 집 진열장에.
//  · 티노 전설 탈것(물고기 30번)은 dinos.ts 의 티노가 쓰고, 땅 탑승 조종(landDrive)은 여기 것을 쓴다.
// 내보내는 이벤트: hatch{species, where} · grow{species, stage} · migration{witness} · restore{dino, id} · rhythm{grade, score} · harvest(높은 열매)
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import type { Game, Mountable, Input } from '../../core/game';
import { applyCurve } from '../../core/curve';
import { DINO_BY_ID, FOSSIL_SKELETONS, type DinoSpec } from './data';
import type { DinoFlags, GainKind, GainResult } from './logic';
import { FRUIT_IDS } from './logic';
import type { Agent, RideBody } from './types';
import { dinoSkin, type DinoRig } from './build';
import {
  nowDays, leftText, HATCH_DAYS, HATCHERY_SLOTS, EGG_ITEM, eggLeft, eggReady, eggProgress, rollEggSpecies, type EggRec, type EggWhere,
  STAGE_NAME, STAGE_SCALE, ADULT, ageOf, stageOf, growLeft, canRideStage, feedRanch, rideOf, ranchCap, type RanchRec,
  migrationActive, migrationAt, migrationHerd, witnessReady, WITNESS_R, MIG_BONUS, MIG_LAP_H,
  makeChart, chartLength, pressLane, sweepMisses, applyJudge, newScore, gradeOf, RHYTHM_REWARD, RHYTHM_PER_DAY, LANES, LANE_KEYS, LANE_PITCH,
  type Note, type RhythmScore, THIEF_SEC, thiefSpeed, STEAL_R, STEAL_COOLDOWN, restorable, bestPartial, missingPieces,
} from './p1logic';
import { makeHatchery, makeRestorer, makePen, makeShell, bakeStatic, bakeSkin, SignAtlas, type HatcheryRig, type RestorerRig, type PenRig } from './p1build';
import { RhythmUI } from './rhythm-ui';

export type LandRide = { walk: number; run: number; cam: number; mode: 'land' | 'glide' | 'water'; charge?: boolean };

/** dinos.ts 가 넘겨주는 손잡이 */
export interface DinoHost {
  ctx: Ctx;
  game: Game;
  group: THREE.Group;
  agents: Set<Agent>;
  F(): DinoFlags;
  save(): void;
  day(): number;
  hour(): number;
  toast(t: string): void;
  give(id: string, n: number): number;
  nm(id: string): string;
  emit(type: string, o?: Record<string, unknown>): void;
  register(spec: DinoSpec, line?: string): boolean;
  gain(spec: DinoSpec, amount: number, kind: GainKind): GainResult;
  isFriend(spec: DinoSpec): boolean;
  spawn(spec: DinoSpec, x: number, z: number, yaw: number, key: string, parent: THREE.Object3D, chunk: string | null, islandId?: string): Agent;
  dropAgent(a: Agent): void;
  burstHearts(at: THREE.Vector3, n?: number): void;
  burstSparkles(at: THREE.Vector3, n?: number): void;
  headWorld(rig: { head: THREE.Object3D }, spec: DinoSpec): THREE.Vector3;
  faceTo(x: number, z: number): void;
  mountAgent(a: Agent, cfg: LandRide): void;
  feed(a: Agent, item: string): void;
  pet(a: Agent): void;
  pickFood(spec: DinoSpec): string | null;
  okGround(x: number, z: number, islandId: string, high?: boolean): boolean;
}

export interface P1Api {
  /** E: 친구 목길어·미끄럼틀·나팔이 놀이, 목장 아기 밥 */
  actionE(a: Agent, d: number): { label: string; use: () => void } | null;
  /** F: 다 자란 목장 공룡 타기 · (E 를 P1 놀이에 내준 친구는) 먹이·쓰다듬기 */
  altF(a: Agent, d: number, normal: () => { label: string; use: () => void }): { label: string; use: () => void } | null;
  update(t: number, dt: number, px: number, pz: number): void;
  /** 놀이 중(엘리베이터·미끄럼·리듬) */
  busy(): boolean;
  debug: Record<string, unknown>;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const easeIO = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/**
 * 땅 위 탑승 조종(티노·목장 공룡 공용) — 방향키 이동(카메라 기준), Shift 달리기, Space 점프(onJump 가 있으면 그걸 부른다).
 * body 를 직접 움직인다. ok(x, z) 가 false 면 그쪽으로 못 간다.
 */
export function landDrive(game: Game, b: RideBody, cfg: { walk: number; run: number }, ok: (x: number, z: number) => boolean, onJump?: () => void) {
  let vx = 0, vz = 0, vy = 0;
  return (input: Input, dt: number, g: Game) => {
    const ax = input.axis();
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const cy = g.cam.yaw, fx = -Math.sin(cy), fz = -Math.cos(cy);
    let wx = fx * ax.y + -fz * ax.x, wz = fz * ax.y + fx * ax.x;
    const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
    const sp = run ? cfg.run : cfg.walk, k = Math.min(1, dt * 5);
    vx += (wx * sp - vx) * k; vz += (wz * sp - vz) * k;
    const nx = b.x + vx * dt, nz = b.z + vz * dt;
    const ny = game.groundAt(nx, nz);
    if (ok(nx, nz) && Math.abs(ny - b.y) < 1.6 + Math.hypot(vx, vz) * dt * 2) { b.x = nx; b.z = nz; } else { vx *= 0.3; vz *= 0.3; }
    const gy = game.groundAt(b.x, b.z);
    if (input.hit('Space') && b.y <= gy + 0.05) { if (onJump) onJump(); vy = 6; }
    vy -= 22 * dt;
    b.y = Math.max(gy, b.y + vy * dt);
    if (b.y <= gy) vy = 0;
    const v = Math.hypot(vx, vz);
    if (v > 0.3) { let d = Math.atan2(vx, vz) - b.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); b.yaw += d * Math.min(1, dt * 7); }
    b.speed = v;
  };
}

export function installP1(h: DinoHost): P1Api {
  const { game, ctx, group } = h;
  const island = ctx.island;
  const isl = island.islandById('dino')!;
  const st = game.state;
  const now = () => nowDays(h.day(), h.hour());
  const perk = () => { try { return !!(game.ext.meta as { perk?: (n: string) => boolean } | undefined)?.perk?.('ranch'); } catch { return false; } };
  const cap = () => ranchCap(perk());
  const spec = (id: string) => DINO_BY_ID.get(id)!;
  const sfx = (name: string, o?: { x?: number; z?: number; vol?: number; pitch?: number }) => { try { game.audio?.sfx(name, o); } catch { /* 소리 없음 */ } };
  const bagN = (id: string) => st.bag[id] ?? 0;
  const take = (id: string, n = 1) => { if (bagN(id) < n) return false; st.addItem(id, -n); return true; };
  const jo = (s: string, a: string, b: string) => { const c = s.charCodeAt(s.length - 1); return s + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? a : b); };

  // ═══════════════ 화석 연구소 옆 자리: 부화장 · 복원기 · 목장 ═══════════════
  const LAB = island.PLACES.facilities.fossilLab;
  const toC = (() => { const dx = isl.x - LAB.x, dz = isl.z - LAB.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; })();
  const side = { x: -toC.z, z: toC.x };
  const flatAt = (x: number, z: number, r: number) => {
    const h0 = island.heightAt(x, z);
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      for (const k of [0.5, 1]) {
        const xx = x + Math.cos(a) * r * k, zz = z + Math.sin(a) * r * k;
        if (!h.okGround(xx, zz, 'dino')) return Infinity;
        worst = Math.max(worst, Math.abs(island.heightAt(xx, zz) - h0));
      }
    }
    return worst;
  };
  const pick = (cands: Array<{ x: number; z: number }>, r: number, maxBump: number) => {
    let best: { x: number; z: number } | null = null, bw = Infinity;
    for (const c of cands) { const w = flatAt(c.x, c.z, r); if (w < bw) { bw = w; best = c; } if (w < maxBump) return c; }
    return best ?? cands[0];
  };
  const along = (k: number, s: number) => ({ x: LAB.x + toC.x * k + side.x * s, z: LAB.z + toC.z * k + side.z * s });
  // 연구소 뒤뜰(섬 안쪽) — flora 가 시설 둘레 12 m 는 나무를 비워 두니 그 안에 둔다
  const HATCH_AT = pick([along(7.5, 4.5), along(8, 3.5), along(7, 5.5), along(8.5, 2.5)], 2.2, 0.6);
  const REST_AT = pick([along(7.5, -4.5), along(8, -3.5), along(7, -5.5), along(8.5, -2.5)], 1.2, 0.6);
  const PEN_R = 11;
  const PEN = (() => {
    const c: Array<{ x: number; z: number }> = [];
    for (const k of [32, 36, 28, 40, 44, 50, 56]) for (const s of [0, 8, -8, 16, -16]) c.push(along(k, s));
    return pick(c, PEN_R, 2.4);
  })();
  const GATE = Math.atan2(LAB.z - PEN.z, LAB.x - PEN.x);

  let site: { root: THREE.Group; hatch: HatcheryRig; rest: RestorerRig; pen: PenRig; bodies: Array<{ remove(): void }>; baked: THREE.BufferGeometry[]; atlas: SignAtlas } | null = null;
  const SITE_IN = 280, SITE_OUT = 340;
  function buildSite() {
    const root = new THREE.Group();
    root.name = 'dinos-p1-site';
    const atlas = new SignAtlas(3);   // 팻말 셋 = 캔버스 한 장
    const hatch = makeHatchery(atlas);
    hatch.root.position.set(HATCH_AT.x, island.heightAt(HATCH_AT.x, HATCH_AT.z) - 0.05, HATCH_AT.z);
    hatch.root.rotation.y = Math.atan2(LAB.x - HATCH_AT.x, LAB.z - HATCH_AT.z) + Math.PI;
    const rest = makeRestorer(atlas);
    rest.root.position.set(REST_AT.x, island.heightAt(REST_AT.x, REST_AT.z) - 0.05, REST_AT.z);
    rest.root.rotation.y = Math.atan2(isl.x - REST_AT.x, isl.z - REST_AT.z);
    const pen = makePen(PEN.x, PEN.z, PEN_R, GATE, (x, z) => island.heightAt(x, z), atlas);
    root.add(hatch.root, rest.root, pen.root);
    // 움직이지 않는 것(받침·둥지·아치·갓·울타리·복원기 몸·팻말)은 물감 한 메시 + 팻말 글씨 한 메시로 굽는다.
    // 그대로 두는 것: 알(들썩)·등(깜빡)·집게 팔(끄덕)·뼈(빙글)·단추(반짝)
    const baked = bakeStatic(root, [...hatch.eggs, hatch.lamp, rest.arm, rest.bone, rest.lights], { disposeSrc: true });
    applyCurve(root);
    group.add(root);
    // 부딪히는 몸(받침·복원기) — 울타리는 공룡이 알아서 안 나가게 하니 플레이어만 넘어가지 않게 낮은 원통을 두지 않는다(문으로 드나든다)
    const bodies: Array<{ remove(): void }> = [];
    try {
      bodies.push(game.physics.addStatic({ kind: 'cylinder', halfH: 0.25, r: 1.9 }, { x: hatch.root.position.x, y: hatch.root.position.y + 0.2, z: hatch.root.position.z }, undefined, 'dinos'));
      bodies.push(game.physics.addStatic({ kind: 'cylinder', halfH: 0.7, r: 0.9 }, { x: rest.root.position.x, y: rest.root.position.y + 0.7, z: rest.root.position.z }, undefined, 'dinos'));
    } catch { /* 물리가 없으면(테스트) 그냥 */ }
    site = { root, hatch, rest, pen, bodies, baked, atlas };
    syncHatchery();
    syncPenSign();
  }
  function dropSite() {
    if (!site) return;
    for (const b of site.bodies) b.remove();
    site.root.removeFromParent();
    for (const g of site.baked) g.dispose();
    site.rest.dispose();
    site.atlas.dispose();
    site = null;
  }

  // ═══════════════ 알 ═══════════════
  const eggs = () => h.F().eggs;
  const newUid = (p: string) => { const f = h.F(); f.eggN = (f.eggN ?? 0) + 1; return `${p}${f.eggN}`; };
  function placeEgg(where: EggWhere, slot: string): boolean {
    // 부화장은 정해진 칸(0..HATCHERY_SLOTS-1)에만, 빈 칸에만
    if (where === 'hatchery') {
      const i = Number(slot);
      if (!Number.isInteger(i) || i < 0 || i >= HATCHERY_SLOTS || String(i) !== slot) return false;
    }
    if (eggs().some((e) => e.where === where && e.slot === slot)) { h.toast('거기엔 벌써 알이 있어요 🥚'); return false; }
    if (!take(EGG_ITEM, 1)) { h.toast('가방에 공룡 알이 없어요 🥚 (알도둑을 잡아 봐요!)'); return false; }
    const uid = newUid('egg');
    const sp = rollEggSpecies(ctx.rng(`dinos:egg:${uid}`));
    eggs().push({ uid, sp, where, slot, start: now() });
    h.save();
    sfx('pick', { pitch: 1.2 });
    game.player.act('plant', 0.9);
    h.toast(`🥚 알을 ${where === 'incubator' ? '부화기' : '부화장'}에 살포시 넣었어요 — 게임 ${HATCH_DAYS}일이면 깨어나요!`);
    if (where === 'hatchery') syncHatchery();
    return true;
  }
  const eggAt = (where: EggWhere, slot: string) => eggs().find((e) => e.where === where && e.slot === slot) ?? null;
  const eggLabel = (e: EggRec) => (eggReady(e, now()) ? '🐣 알 깨우기!' : `🥚 알 톡톡 (부화까지 ${leftText(eggLeft(e, now()))})`);

  /** 깨우기: 목장 칸이 있으면 아기 공룡 탄생 */
  function hatch(e: EggRec, at: THREE.Vector3) {
    if (!eggReady(e, now())) {
      const left = eggLeft(e, now());
      h.toast(left < 0.5 ? '톡톡… 안에서 대답한다! 거의 다 됐어요' : `따뜻하게 품는 중… 부화까지 ${leftText(left)} 🥚`);
      sfx('pick', { pitch: 0.8 });
      return;
    }
    const f = h.F();
    if (f.ranch.length >= cap()) {
      h.toast(`목장이 꽉 찼어요 (${f.ranch.length}/${cap()}) — 알은 조금 더 따뜻하게 둘게요${perk() ? '' : ' · 고대 세트 특전이면 +4칸!'}`);
      return;
    }
    f.eggs = f.eggs.filter((x) => x !== e);
    const s = spec(e.sp);
    const rec: RanchRec = { uid: e.uid.replace(/^egg/, 'r'), sp: s.id, born: now(), boost: 0, stage: 0, fedDay: -1 };
    f.ranch.push(rec);
    h.save();
    shellFx(at);
    const baby = h.spawn({ ...s, scale: s.scale * STAGE_SCALE[0] }, at.x, at.z, Math.atan2(game.player.pos.x - at.x, game.player.pos.z - at.z), `hatch:${rec.uid}:0`, group, null, 'dino');
    // 태어나자마자 목장 아기(E = 맘마·쓰다듬기) — 목장으로 걸어가는 건 두리번이 끝난 뒤
    baby.adopted = true; baby.keep = true; baby.ranch = rec.uid; baby.home = { x: PEN.x, z: PEN.z }; baby.state = 'look'; baby.timer = 1e9; baby.hop = 1.8; baby.wag = 4;
    applyCurve(baby.rig.root);
    bakeRanch(baby);
    const inHouse = e.where === 'incubator';
    hatchlings.push({ a: baby, until: game.time + (inHouse ? 7 : 4.5), rec, inHouse });
    h.burstHearts(V(at.x, at.y + 1.2, at.z), 6);
    h.burstSparkles(V(at.x, at.y + 0.8, at.z), 14);
    sfx('new-dex');
    sfx('dino-roar-cute', { pitch: 1.6 });
    game.player.act('cheer', 1.6);
    if (!h.register(s, `🐣 알에서 깨어났어요! ${STAGE_NAME[0]} ${s.name}`)) {
      game.hud.card({ title: `🐣 ${STAGE_NAME[0]} ${jo(s.name, '이', '가')} 태어났어요!`, body: `${inHouse ? '공룡섬 목장으로 이사 갈 거예요. ' : ''}하루 한 번 밥을 주면 쑥쑥! 다 자라면 F 로 탈 수 있어요 (목장 ${f.ranch.length}/${cap()})`, icon: '🥚', color: '#ffc47a', ms: 4600 });
    } else {
      h.toast(`${inHouse ? '공룡섬 목장으로 이사 갈 거예요 · ' : ''}목장 ${f.ranch.length}/${cap()}`);
    }
    h.gain(s, 1, 'pet');
    h.emit('hatch', { species: s.id, where: e.where });
    if (e.where === 'hatchery') syncHatchery();
    syncPenSign();
  }

  // 깨진 껍데기 연출
  const shells: Array<{ o: ReturnType<typeof makeShell>; t0: number; vx: number; vz: number }> = [];
  function shellFx(at: THREE.Vector3) {
    const o = makeShell();
    o.root.position.copy(at);
    applyCurve(o.root);
    group.add(o.root);
    const a = (shells.length * 2.3) % (Math.PI * 2);
    shells.push({ o, t0: game.time, vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2 });
  }
  const hatchlings: Array<{ a: Agent; until: number; rec: RanchRec; inHouse: boolean }> = [];

  // ── 부화장(화석 연구소) ──
  const hatchSlotWorld = (i: number) => {
    const sl = site?.hatch.slots[i];
    if (!site || !sl) return V(HATCH_AT.x, island.heightAt(HATCH_AT.x, HATCH_AT.z) + 0.4, HATCH_AT.z);
    const p = sl.clone();
    site.hatch.root.localToWorld(p);
    return p;
  };
  function syncHatchery() {
    if (!site) return;
    for (let i = 0; i < HATCHERY_SLOTS; i++) site.hatch.eggs[i].visible = !!eggAt('hatchery', String(i));
    const n = eggs().filter((e) => e.where === 'hatchery').length;
    site.hatch.sign.set(n ? `부화장 🥚\n${n}/${HATCHERY_SLOTS}` : '부화장 🥚');
  }
  game.addProvider('dinos-hatchery', (p) => {
    if (p.mounted || game.world !== 'earth' || !site) return null;
    const c = site.hatch.root.position;
    const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
    if (d > 3.6) return null;
    // 다 된 알 → 그다음 아무 알 → 빈 칸에 넣기
    const list = [0, 1, 2].map((i) => eggAt('hatchery', String(i)));
    const ready = list.findIndex((e) => e && eggReady(e, now()));
    if (ready >= 0) return { id: 'dinos-hatchery', label: '🐣 부화장 알 깨우기!', dist: d, use: () => hatch(list[ready]!, hatchSlotWorld(ready)) };
    const free = list.findIndex((e) => !e);
    if (free >= 0 && bagN(EGG_ITEM) > 0) return { id: 'dinos-hatchery', label: `🥚 부화장에 알 넣기 (${HATCHERY_SLOTS - list.filter(Boolean).length}칸 남음)`, dist: d, use: () => placeEgg('hatchery', String(free)) };
    const any = list.find(Boolean);
    if (any) {
      const soon = list.filter(Boolean).sort((a, b) => eggLeft(a!, now()) - eggLeft(b!, now()))[0]!;
      return { id: 'dinos-hatchery', label: eggLabel(soon), dist: d, use: () => hatch(soon, hatchSlotWorld(list.indexOf(soon))) };
    }
    return { id: 'dinos-hatchery', label: '🥚 부화장 (알도둑을 잡으면 알이 생겨요)', dist: d, use: () => h.toast('공룡 알이 생기면 여기 넣어요! 아침에 둥지 절벽의 알도둑을 잡아 봐요 🥚') };
  });

  // ── 집 부화기(interiors f_incubator) ──
  type IntApi = {
    current?(): string | null; origin?(i: number): { x: number; y: number; z: number };
    house?: { layout?(): Array<{ uid: string; item: string; gx: number; gz: number; rot: number }>; room?(): { w: number; d: number }; placing?(): boolean };
  };
  const ints = () => game.ext.interiors as IntApi | undefined;
  /** 집 안 부화기 자리(세계 좌표) */
  function incubators(): Array<{ uid: string; pos: THREE.Vector3 }> {
    const I = ints();
    const lay = I?.house?.layout?.(), room = I?.house?.room?.(), o = I?.origin?.(0);
    if (!lay || !room || !o) return [];
    const out: Array<{ uid: string; pos: THREE.Vector3 }> = [];
    for (const it of lay) {
      if (it.item !== 'f_incubator') continue;
      // 2×2 칸(돌려도 같다): 왼쪽 위 칸 + 1칸 = 가운데
      const x = o.x + (it.gx + 1) * 0.5 - (room.w * 0.5) / 2, z = o.z + (it.gz + 1) * 0.5 - (room.d * 0.5) / 2;
      out.push({ uid: it.uid, pos: V(x, game.groundAt(x, z) + 0.75, z) });
    }
    return out;
  }
  game.addProvider('dinos-incubator', (p) => {
    const I = ints();
    if (p.mounted || I?.current?.() !== 'house' || I.house?.placing?.()) return null;
    let best: { d: number; uid: string; pos: THREE.Vector3 } | null = null;
    for (const inc of incubators()) {
      const d = Math.hypot(inc.pos.x - p.pos.x, inc.pos.z - p.pos.z);
      if (d < 2.0 && (!best || d < best.d)) best = { d, ...inc };
    }
    if (!best) return null;
    const b = best;
    const e = eggAt('incubator', b.uid);
    if (e) return { id: 'dinos-incubator', label: eggLabel(e), dist: b.d, use: () => hatch(e, b.pos.clone().setY(b.pos.y - 0.3)) };
    if (bagN(EGG_ITEM) > 0) return { id: 'dinos-incubator', label: '🥚 부화기에 알 넣기', dist: b.d, use: () => placeEgg('incubator', b.uid) };
    return { id: 'dinos-incubator', label: '🥚 공룡 부화기 (비어 있어요)', dist: b.d, use: () => h.toast('공룡 알을 넣으면 게임 3일 뒤 깨어나요! 🥚') };
  });
  /** 부화기 가구를 치웠으면 그 안 알은 가방으로 */
  function checkIncubators() {
    const lay = ints()?.house?.layout?.();
    if (!lay) return;
    const have = new Set(lay.filter((it) => it.item === 'f_incubator').map((it) => it.uid));
    const f = h.F();
    const lost = f.eggs.filter((e) => e.where === 'incubator' && !have.has(e.slot));
    if (!lost.length) return;
    f.eggs = f.eggs.filter((e) => !lost.includes(e));
    for (const _ of lost) h.give(EGG_ITEM, 1);
    h.save();
    h.toast(`부화기를 치워서 알 ${lost.length}개를 가방에 넣었어요 🥚 (다시 넣으면 처음부터 품어요)`);
  }

  // ═══════════════ 목장 ═══════════════
  const ranchAgents = new Map<string, Agent>();
  const stageNow = (r: RanchRec) => stageOf(ageOf(r, now()));
  const ranchName = (r: RanchRec) => `${STAGE_NAME[stageNow(r)]} ${spec(r.sp).name}`;
  const recOf = (a: Agent) => (a.ranch ? h.F().ranch.find((r) => r.uid === a.ranch) ?? null : null);
  function syncPenSign() { site?.pen.sign.set(`🦕 공룡 목장\n${h.F().ranch.length}/${cap()}`); }
  function spawnRanch(r: RanchRec, at?: { x: number; z: number }, i = 0) {
    const base = spec(r.sp);
    const s = { ...base, scale: base.scale * STAGE_SCALE[stageNow(r)] };
    let x = at?.x ?? 0, z = at?.z ?? 0;
    if (!at) {
      const a = (i * 2.39996) % (Math.PI * 2), rr = 2 + (i % 3) * 2.5;
      x = PEN.x + Math.cos(a) * rr; z = PEN.z + Math.sin(a) * rr;
    }
    const ag = h.spawn(s, x, z, (i * 1.7) % (Math.PI * 2), `ranch:${r.uid}:${stageNow(r)}`, group, null, 'dino');
    ag.adopted = true; ag.keep = true; ag.ranch = r.uid; ag.home = { x: PEN.x, z: PEN.z }; ag.timer = 1 + i * 0.6;
    applyCurve(ag.rig.root);
    bakeRanch(ag);
    ranchAgents.set(r.uid, ag);
    return ag;
  }
  function dropRanch(uid: string) { const a = ranchAgents.get(uid); if (a) h.dropAgent(a); ranchAgents.delete(uid); }
  /** 1초마다: 자라기 · 목장 가까우면 만들고 멀면 치우기 */
  function tickRanch(px: number, pz: number) {
    const f = h.F();
    const dPen = Math.hypot(px - PEN.x, pz - PEN.z);
    for (const [uid, a] of ranchAgents) if (!agentsHas(a) || !f.ranch.some((r) => r.uid === uid)) { if (agentsHas(a)) h.dropAgent(a); ranchAgents.delete(uid); }
    f.ranch.forEach((r, i) => {
      const s = stageNow(r);
      if (s > r.stage) {
        r.stage = s;
        h.save();
        const sp = spec(r.sp);
        game.hud.card({
          title: s >= ADULT ? `🦕 ${jo(sp.name, '이', '가')} 다 자랐어요!` : `🌱 ${jo(sp.name, '이', '가')} ${STAGE_NAME[s]}가 됐어요!`,
          body: s >= ADULT ? '이제 목장에서 F 로 탈 수 있어요! 등에 올라 달려 봐요 🏃' : `조금 더 크면 탈 수 있어요 (어른까지 ${leftText(growLeft(ageOf(r, now())))})`,
          icon: s >= ADULT ? '🏇' : '🌱', color: '#9fd36b', ms: 4200,
        });
        h.emit('grow', { species: r.sp, stage: s });
      }
      // 몸 크기가 지금 단계와 다르면 새로 만든다(타고 있거나 놀이 중이 아닐 때 — 개체 key 끝이 만든 단계).
      // 목장으로 걸어가는 중이어도 바꾼다: 새 몸은 같은 자리에서 keepInPen 이 다시 문으로 데려간다
      const cur = ranchAgents.get(r.uid);
      if (cur && cur.state !== 'ride' && carry?.a !== cur && rhy?.a !== cur && !cur.id.endsWith(`:${s}`)) { const at = { x: cur.x, z: cur.z }; dropRanch(r.uid); if (dPen < SITE_OUT) spawnRanch(r, at, i); }
      const a = ranchAgents.get(r.uid);
      if (!a && dPen < SITE_IN - 40 && !hatchlings.some((hl) => hl.rec === r && !hl.inHouse)) spawnRanch(r, undefined, i);
      else if (a && a.state !== 'ride') {
        const away = Math.hypot(a.x - PEN.x, a.z - PEN.z);
        if (dPen > SITE_OUT) dropRanch(r.uid);
        else if (away > 60) { dropRanch(r.uid); h.toast(`${ranchName(r)}: 목장으로 먼저 갈게요! 🦕`); }
      }
    });
  }
  const agentsHas = (a: Agent) => h.agents.has(a);
  // 그리기 줄이기(계약: 모듈당 40 콜) — 대이동 무리와 같은 방식: 진짜 몸은 가까운 RANCH_FULL 마리(+손 닿는 거리)만,
  // 나머지는 종·단계마다 구운 몸 InstancedMesh 하나(몸 크기는 단계별로 구울 때 이미 들어 있다)
  const RANCH_FULL = 2, RANCH_FULL_R = 20, RANCH_TOUCH_R = 5;
  const ranchGeo = new Map<string, THREE.BufferGeometry | null>();
  const ranchProxy = new Map<string, THREE.InstancedMesh>();
  let ranchFull = new Set<Agent>();
  /** 몸 key 끝이 만든 단계(`ranch:uid:단계`·`hatch:uid:0`) */
  const ranchKey = (a: Agent) => `${a.spec.id}:${a.id.slice(a.id.lastIndexOf(':') + 1)}`;
  /** 갓 만든 몸(가만히 선 자세)에서 굽는다 — 종·단계마다 한 번 */
  function bakeRanch(a: Agent) {
    const k = ranchKey(a);
    if (!ranchGeo.has(k)) ranchGeo.set(k, bakeSkin(a.rig.root, [a.rig.faceGroup, a.rig.shadow]));
  }
  function ranchIm(k: string) {
    let im = ranchProxy.get(k);
    if (im) return im;
    const g = ranchGeo.get(k);
    if (!g) return null;
    im = new THREE.InstancedMesh(g, dinoSkin(), Math.max(8, cap()));
    im.name = `dinos-ranch:${k}`;
    im.count = 0; im.castShadow = true; im.receiveShadow = true;
    applyCurve(im);
    group.add(im);
    ranchProxy.set(k, im);
    return im;
  }
  /** 매 프레임(개체 갱신 뒤): 목장 공룡 LOD */
  function tickRanchLod(t: number, px: number, pz: number) {
    const ranked = [...ranchAgents.values()].filter(agentsHas).map((a) => ({ a, d: Math.hypot(a.x - px, a.z - pz) - (ranchFull.has(a) ? 3 : 0) })).sort((x, y) => x.d - y.d);
    ranchFull = new Set(ranked.filter((r, i) => (i < RANCH_FULL && r.d < RANCH_FULL_R) || r.d < Math.max(RANCH_TOUCH_R, r.a.rig.tpl.radius * r.a.spec.scale + 2.2) || r.a.state === 'ride' || carry?.a === r.a || rhy?.a === r.a).map((r) => r.a));
    const n = new Map<string, number>();
    const near = new Map<string, number>();
    for (const { a, d } of ranked) {
      if (ranchFull.has(a)) continue;
      const k = ranchKey(a);
      if (!ranchGeo.has(k)) bakeRanch(a);
      const im = ranchIm(k);
      if (!im) continue;
      const vis = a.rig.root.visible;   // updateAgent 가 이번 프레임 정한 보임
      const c = n.get(k) ?? 0;
      if (c >= im.instanceMatrix.count) continue;
      a.rig.root.visible = false;
      if (!vis) continue;
      n.set(k, c + 1);
      near.set(k, Math.min(near.get(k) ?? Infinity, d));
      const sc = a.spec.scale, walk = a.speed > 0.3 ? 1 : 0, ph = t * 5.5 + a.bph * 6.283;
      hp.set(a.x, a.y + Math.abs(Math.sin(ph)) * 0.05 * sc * walk, a.z);
      hq.setFromEuler(he.set(0, a.yaw, Math.sin(ph) * 0.035 * walk));
      im.setMatrixAt(c, hm.compose(hp, hq, hs));
    }
    for (const [k, im] of ranchProxy) {
      im.count = n.get(k) ?? 0;
      im.visible = im.count > 0;
      if (!im.count) continue;
      // 그림자는 가까운(32 m) 대리 몸만 — 그림자 패스 콜을 아낀다(대이동 몸과 같은 규칙)
      im.castShadow = (near.get(k) ?? Infinity) < 32;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
  /** 울타리 안에 머물기 · 밖이면 문으로 걸어 돌아오기 */
  function keepInPen(a: Agent, dt: number) {
    if (a.state === 'ride' || a.ctl) return;
    const dx = a.x - PEN.x, dz = a.z - PEN.z, d = Math.hypot(dx, dz);
    const lim = PEN_R - 1.2 - a.rig.tpl.radius * a.spec.scale * 0.6;
    if (d <= lim) return;
    if (d < PEN_R + 2.5) { const k = lim / d; a.x = PEN.x + dx * k; a.z = PEN.z + dz * k; if (a.state === 'walk' || a.state === 'follow' || a.state === 'approach') { a.state = 'idle'; a.timer = 1.5; } return; }
    // 밖(탄 뒤 내려 둔 곳): 문 앞 → 안으로
    const gate = { x: PEN.x + Math.cos(GATE) * (PEN_R + 2), z: PEN.z + Math.sin(GATE) * (PEN_R + 2) };
    let stage = 0;
    a.ctl = (ag, _t, ddt) => {
      const tgt = stage === 0 ? gate : { x: PEN.x, z: PEN.z };
      const ex = tgt.x - ag.x, ez = tgt.z - ag.z, el = Math.hypot(ex, ez);
      if (el < 1.2) { if (stage === 0) stage = 1; else { ag.ctl = null; ag.state = 'idle'; ag.timer = 2; return false; } }
      const sp = ag.spec.speed * Math.sqrt(ag.spec.scale) * 2;
      let dy = Math.atan2(ex, ez) - ag.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      ag.yaw += dy * Math.min(1, ddt * 4);
      ag.speed = sp; ag.state = 'walk';
      ag.x += Math.sin(ag.yaw) * sp * ddt; ag.z += Math.cos(ag.yaw) * sp * ddt;
      if (stage === 1 && Math.hypot(ag.x - PEN.x, ag.z - PEN.z) < PEN_R - 3) { ag.ctl = null; ag.state = 'idle'; ag.timer = 2; return false; }
      return true;
    };
    void dt;
  }

  // ═══════════════ 알도둑 ═══════════════
  let thief: { a: Agent; item: string; t0: number } | null = null;
  let lastSteal = -1e9, stealN = 0;
  const seenOvi = new Set<string>();
  const fruitInBag = () => FRUIT_IDS.filter((id) => bagN(id) > 0).sort((a, b) => bagN(b) - bagN(a) || a.localeCompare(b))[0] ?? null;
  function adopt(a: Agent) {
    if (a.adopted) return;
    group.add(a.rig.root);
    a.adopted = true;
    a.chunk = null;
  }
  function tryThief(t: number, px: number, pz: number) {
    if (thief || game.player.locked || busy()) return;
    for (const a of h.agents) {
      if (a.spec.id !== 'z_oviraptor' || a.ranch || a.keep || a.state === 'sleep' || a.state === 'ride' || !a.rig.root.visible) continue;
      const d = Math.hypot(a.x - px, a.z - pz);
      if (d > STEAL_R + 4) { seenOvi.delete(a.id); continue; }
      if (d > STEAL_R || seenOvi.has(a.id)) continue;
      seenOvi.add(a.id);
      if (t - lastSteal < STEAL_COOLDOWN) continue;
      const item = fruitInBag();
      if (!item) continue;
      if (ctx.rng(`dinos:ovi:${h.day()}:${stealN++}`)() > 0.7) continue;
      steal(a, item, t);
      return;
    }
  }
  function steal(a: Agent, item: string, t: number) {
    if (!take(item, 1)) return;
    lastSteal = t;
    adopt(a);
    a.keep = true;
    thief = { a, item, t0: t };
    a.hop = 1.4; a.wag = 3;
    a.ctl = thiefCtl;
    game.hud.banner({ text: '앗! 알도둑!', sub: `${jo(h.nm(item), '을', '를')} 훔쳐 갔어요 — 쫓아가 잡아요! (Shift 달리기)`, icon: '🥚', color: '#ffa24c', ms: 1800 });
    sfx('dino-roar-cute', { x: a.x, z: a.z, pitch: 1.4 });
    h.emit('dino-thief', { state: 'steal', item });
  }
  const thiefCtl = (a: Agent, t: number, dt: number) => {
    if (!thief || thief.a !== a) return false;
    const el = t - thief.t0;
    const p = game.player.pos;
    const sp = thiefSpeed(el);
    let ang = Math.atan2(a.x - p.x, a.z - p.z) + Math.sin(el * 2.3) * 0.55;
    // 막히면(바다·용암·절벽) 옆으로 꺾는다
    for (let k = 0; k < 6; k++) {
      const tx = a.x + Math.sin(ang) * sp * Math.max(dt, 0.05) * 3, tz = a.z + Math.cos(ang) * sp * Math.max(dt, 0.05) * 3;
      if (h.okGround(tx, tz, 'dino') && Math.abs(island.heightAt(tx, tz) - a.y) < 1.4) break;
      ang += (k % 2 ? -1 : 1) * (0.7 + k * 0.35);
    }
    let dy = ang - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    a.yaw += dy * Math.min(1, dt * 8);
    const nx = a.x + Math.sin(a.yaw) * sp * dt, nz = a.z + Math.cos(a.yaw) * sp * dt;
    if (h.okGround(nx, nz, 'dino')) { a.x = nx; a.z = nz; a.speed = sp; } else a.speed = 0;
    a.state = 'flee';
    return true;
  };
  function tickThief(t: number) {
    if (!thief) return;
    const { a } = thief;
    if (!agentsHas(a)) { endThief(); return; }
    const p = game.player.pos;
    const left = THIEF_SEC - (t - thief.t0);
    const reach = a.rig.tpl.radius * a.spec.scale + 1.5;
    game.hud.gauge('dino-thief', { label: `🥚 알도둑 잡기! ${Math.max(0, Math.ceil(left))}초`, value: Math.max(0, left / THIEF_SEC), color: '#ffa24c', show: true });
    if (Math.hypot(a.x - p.x, a.z - p.z) < reach && Math.abs(a.y - p.y) < 3) { caught(); return; }
    if (left <= 0) {
      h.toast(`알도둑이 둥지로 쏙… ${jo(h.nm(thief.item), '은', '는')} 맛있게 먹었대요 (다음엔 꼭 잡아요!)`);
      a.state = 'idle'; a.timer = 2;
      endThief();
    }
  }
  function caught() {
    if (!thief) return;
    const { a, item } = thief;
    const f = h.F(), d = h.day();
    h.give(item, 1);
    let line: string;
    if (f.oviDay !== d) {
      f.oviDay = d;
      h.give(EGG_ITEM, 1);
      line = `잡았다! ${jo(h.nm(item), '을', '를')} 돌려받고 공룡 알 🥚 을 받았어요!`;
      game.hud.card({ title: '🥚 알도둑을 잡았어요!', body: '미안하다며 소중한 공룡 알을 줬어요. 집 부화기나 화석 연구소 부화장에 넣고 3일 기다려요!', icon: '🥚', color: '#ffa24c', ms: 4400 });
    } else {
      h.give('m_feather', 1);
      line = `잡았다! ${jo(h.nm(item), '을', '를')} 돌려받고 깃털을 받았어요 (알은 하루 한 개!)`;
    }
    h.save();
    h.faceTo(a.x, a.z);
    game.player.act('cheer', 1.2);
    a.state = 'look'; a.timer = 3; a.hop = 1.6; a.wag = 4;
    h.burstHearts(h.headWorld(a.rig, a.spec), 4);
    h.burstSparkles(V(a.x, a.y + 1, a.z), 10);
    sfx('star');
    if (!h.register(a.spec, line)) h.toast(line);
    h.gain(a.spec, 0.5, 'pet');
    h.emit('dino-thief', { state: 'caught', item });
    endThief();
  }
  function endThief() {
    if (thief) { thief.a.ctl = null; thief.a.keep = false; }
    thief = null;
    game.hud.gauge('dino-thief', { label: '', value: 0, color: '#ffa24c', show: false });
  }

  // ═══════════════ 태워 주기(목 엘리베이터 · 꼬리 미끄럼) ═══════════════
  interface Seg { dur: number; at: (k: number) => THREE.Vector3; ease?: (k: number) => number; face?: 'path' | number; start?: () => void }
  let carry: { segs: Seg[]; i: number; t0: number; seat: THREE.Object3D; end: THREE.Vector3; a: Agent; done?: () => void } | null = null;
  const hold = (a: Agent) => { a.ctl = (ag) => { ag.speed = 0; ag.state = 'look'; return true; }; };
  /** 태워 주는 동안: 탄 공룡처럼(카메라 페이드·밀어내기·AI 없이 그 자리에) */
  const carrying = (a: Agent) => { hold(a); a.state = 'ride'; a.speed = 0; };
  function startCarry(a: Agent, segs: Seg[], end: THREE.Vector3, cam: number, done?: () => void) {
    const seat = new THREE.Object3D();
    seat.position.copy(game.player.pos);
    group.add(seat);
    seat.updateMatrixWorld(true);
    const m: Mountable = { name: a.spec.name, seat, object: seat, camDistance: cam, drive: () => { /* 연출이 움직인다 */ }, onExit: () => end.clone() };
    game.player.mount(m, { silent: true });
    game.player.lock('dinos-carry');
    carry = { segs, i: 0, t0: game.time, seat, end, a, done };
    segs[0].start?.();
  }
  function tickCarry(t: number) {
    if (!carry) return;
    let seg = carry.segs[carry.i];
    let k = (t - carry.t0) / seg.dur;
    while (k >= 1 && carry.i < carry.segs.length - 1) {
      carry.t0 += seg.dur; carry.i++;
      seg = carry.segs[carry.i];
      seg.start?.();
      k = (t - carry.t0) / seg.dur;
    }
    const kk = Math.max(0, Math.min(1, k));
    const e = (seg.ease ?? easeIO)(kk);
    const p = seg.at(e);
    const prev = carry.seat.position.clone();
    carry.seat.position.copy(p);
    if (typeof seg.face === 'number') carry.seat.rotation.set(0, seg.face, 0);
    else { const dx = p.x - prev.x, dz = p.z - prev.z; if (Math.hypot(dx, dz) > 1e-3) carry.seat.rotation.set(0, Math.atan2(-dx, -dz), 0); }
    carry.seat.updateMatrixWorld(true);
    if (k >= 1 && carry.i >= carry.segs.length - 1) finishCarry();
  }
  function finishCarry() {
    if (!carry) return;
    const c = carry;
    carry = null;
    game.player.unlock('dinos-carry', true);
    if (game.player.mounted?.seat === c.seat) game.player.dismount();
    c.seat.removeFromParent();
    c.a.ctl = null; c.a.state = 'look'; c.a.timer = 2; c.a.hop = 1;
    c.done?.();
  }
  const curve = (pts: THREE.Vector3[]) => { const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); return (k: number) => c.getPoint(k); };
  const arc = (a: THREE.Vector3, b: THREE.Vector3, lift: number) => {
    const ctrl = a.clone().lerp(b, 0.5); ctrl.y = Math.max(a.y, b.y) + lift;
    const c = new THREE.QuadraticBezierCurve3(a.clone(), ctrl, b.clone());
    return (k: number) => c.getPoint(k);
  };
  const stay = (p: THREE.Vector3) => () => p.clone();

  /** 목 엘리베이터 둘레 절벽 위(높고 평평한 마른 땅) */
  function cliffNear(a: Agent, topY: number): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    for (let ri = 0; ri < 6; ri++) {
      const r = 8 + ri * 3.6;
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
        const y = island.heightAt(x, z);
        if (y < a.y + 4.5 || y > topY + 1.5 || !h.okGround(x, z, 'dino', true)) continue;
        const bump = Math.max(...[[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].map(([ox, oz]) => Math.abs(island.heightAt(x + ox, z + oz) - y)));
        if (bump > 1.1) continue;
        if (!best || y > best.y) best = V(x, y, z);
      }
    }
    return best;
  }
  function elevator(a: Agent) {
    if (busy() || game.player.mounted) return;
    carrying(a);
    const R = a.rig, s = a.spec;
    const fwd = V(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    R.root.updateMatrixWorld(true);
    const start = game.player.pos.clone();
    const foot = V(a.x, a.y, a.z).addScaledVector(fwd, R.tpl.radius * s.scale * 1.05); foot.y = island.heightAt(foot.x, foot.z) + 0.3;
    const back = V(); R.seat.getWorldPosition(back);
    const top = h.headWorld(R, s).add(V(0, -0.22, 0));   // 머리 꼭대기에 폭
    const neck = back.clone().lerp(top, 0.5).addScaledVector(fwd, 0.6);
    const up = curve([start, foot, back, neck, top]);
    const dest = cliffNear(a, top.y);
    const f = h.F(), d = h.day();
    const faceOut = Math.atan2(-fwd.x, -fwd.z);
    const segs: Seg[] = [
      { dur: 3.4, at: up, start: () => { sfx('jump', { pitch: 0.8 }); a.hop = 1; } },
      {
        dur: 1.6, at: stay(top), face: faceOut,
        start: () => {
          h.burstSparkles(top.clone(), 10);
          if (dest) h.toast('영차영차~ 와, 섬이 한눈에 보여요! 저기 절벽 위로 데려다줄게요 ⛰️');
          else if (f.fruitDay !== d) {
            f.fruitDay = d;
            const rnd = ctx.rng(`dinos:highfruit:${d}`);
            const pool = ['m_apple', 'm_peach', 'm_cherry', 'm_orange'];
            const it = pool[Math.floor(rnd() * pool.length) % pool.length];
            const got = h.give(it, 2);
            if (got > 0) st.emit({ type: 'harvest', kind: 'fruit', item: it, n: got, island: 'dino' } as never);
            sfx('fruit-drop');
            h.save();
            h.toast(`목길어가 제일 높은 가지에서 ${jo(h.nm(it), '을', '를')} 따 줬어요! +${got} 🍎`);
          } else h.toast('와~ 구름 냄새! 높은 열매는 내일 또 따 줄게요 ☁️');
        },
      },
    ];
    let end: THREE.Vector3;
    if (dest) {
      end = dest.clone().add(V(0, 0.2, 0));
      segs.push({ dur: 2.4, at: arc(top, end, 2.5) });
    } else {
      const down = curve([top, neck, back, foot, start]);
      segs.push({ dur: 3.0, at: (k) => down(k) });
      end = start.clone();
    }
    h.faceTo(a.x, a.z);
    startCarry(a, segs, end, 1.5, () => {
      if (dest) { h.toast('도착! 목길어야 고마워 💕'); h.burstHearts(h.headWorld(a.rig, a.spec), 3); }
      h.emit('dino-elevator', { cliff: !!dest });
    });
    a.hop = 1.2;
  }

  /** 미끄럼틀 둘레 가까운 물(깊이 1 m 넘는 곳) */
  function waterNear(a: Agent): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null, bd = Infinity;
    for (let ri = 0; ri < 10; ri++) {
      const r = 6 + ri * 4;
      for (let i = 0; i < 28; i++) {
        const ang = (i / 28) * Math.PI * 2;
        const x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
        const w = island.waterLevelAt(x, z);
        if (!Number.isFinite(w) || w - island.heightAt(x, z) < 1.1) continue;
        if (r < bd) { bd = r; best = V(x, w, z); }
      }
      if (best) break;
    }
    return best;
  }
  function slide(a: Agent): boolean {
    if (busy() || game.player.mounted) return false;
    const water = waterNear(a);
    if (!water) { h.toast(`${a.spec.name}: 근처에 풍덩할 호수가 없어요… 호숫가에서 다시 불러 줘요 💧`); return false; }
    carrying(a);
    // 꼬리가 물을 향하게 돌아선다
    a.yaw = Math.atan2(a.x - water.x, a.z - water.z);
    a.rig.root.rotation.y = a.yaw;
    a.rig.root.updateMatrixWorld(true);
    const s = a.spec, R = a.rig;
    const fwd = V(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    const start = game.player.pos.clone();
    const back = V(); R.seat.getWorldPosition(back); back.y += 0.2;
    const tailLen = (s.body.len * 0.5 + s.tail.len) * s.scale * 0.92;
    const tip = V(a.x, 0, a.z).addScaledVector(fwd, -tailLen); tip.y = Math.max(island.heightAt(tip.x, tip.z), island.waterLevelAt(tip.x, tip.z)) + 0.7;
    const mid = back.clone().lerp(tip, 0.45); mid.y = back.y * 0.55 + tip.y * 0.45 + 0.4;
    const land = water.clone().addScaledVector(fwd, -2.5); land.y = water.y - 0.2;
    if (Math.hypot(land.x - tip.x, land.z - tip.z) < 3) land.addScaledVector(fwd, -3);
    const faceBack = Math.atan2(fwd.x, fwd.z);
    const segs: Seg[] = [
      { dur: 1.0, at: curve([start, start.clone().lerp(back, 0.5).add(V(0, 1.6, 0)), back]), start: () => sfx('jump') },
      { dur: 0.5, at: stay(back), face: faceBack, start: () => h.toast(`${s.name}: 꼭 잡아요~ 하나, 둘, 셋!`) },
      { dur: 1.35, at: curve([back, mid, tip]), ease: (k) => k * k * (1.6 - 0.6 * k), face: faceBack, start: () => sfx('glide-wind', { pitch: 1.3 }) },
      { dur: 0.9, at: arc(tip, land, 2.8), ease: (k) => k, face: faceBack },
    ];
    h.faceTo(a.x, a.z);
    startCarry(a, segs, land, 1.35, () => {
      sfx('splash', { x: land.x, z: land.z, vol: 1.2 });
      h.burstSparkles(land.clone().add(V(0, 0.4, 0)), 16);
      const f = h.F(); f.slides = (f.slides ?? 0) + 1; h.save();
      h.toast(`풍덩~! 💦 꼬리 미끄럼틀 ${f.slides}번째!`);
      h.emit('dino-slide', { n: f.slides });
    });
    return true;
  }

  // ═══════════════ 나팔이 리듬 놀이 ═══════════════
  const ui = new RhythmUI();
  let rhy: { a: Agent; notes: Note[]; t0: number; s: RhythmScore; len: number } | null = null;
  function startRhythm(a: Agent) {
    if (busy() || game.player.mounted) return;
    hold(a);
    const d = h.day();
    const notes = makeChart(ctx.rng(`dinos:rhythm:${d}`));
    rhy = { a, notes, t0: game.time, s: newScore(), len: chartLength(notes) };
    game.player.lock('dinos-rhythm');
    h.faceTo(a.x, a.z);
    ui.open('🎺 나팔이 합창 · 뿌우~');
    sfx('dino-roar-cute', { x: a.x, z: a.z, pitch: 0.75 });
  }
  function tickRhythm(t: number, dt: number) {
    if (!rhy) return;
    const time = t - rhy.t0;
    const inp = game.input;
    if (inp.hit('Escape')) { endRhythm(true); return; }
    for (let lane = 0; lane < LANES; lane++) {
      if (!LANE_KEYS[lane].some((k) => inp.hit(k))) continue;
      ui.press(lane);
      const r = pressLane(rhy.notes, lane, time);
      if (!r) continue;
      applyJudge(rhy.s, r.judge);
      ui.showJudge(r.judge);
      sfx('talk-blip', { pitch: LANE_PITCH[lane] * 2, vol: 0.9 });
      if (r.judge === 'perfect') { rhy.a.pose = 0.3; rhy.a.hop = 0.5; }
    }
    const missed = sweepMisses(rhy.notes, time);
    if (missed.length) { for (const _ of missed) applyJudge(rhy.s, 'miss'); ui.showJudge('miss'); }
    ui.draw(rhy.notes, time, rhy.s, dt);
    if (time > rhy.len) endRhythm(false);
  }
  function endRhythm(cancel: boolean) {
    if (!rhy) return;
    const r = rhy;
    rhy = null;
    ui.close();
    game.player.unlock('dinos-rhythm', true);
    r.a.ctl = null; r.a.state = 'look'; r.a.timer = 3;
    if (cancel) { h.toast('나팔이: 뿌… 다음에 또 같이 불자~'); return; }
    const { grade, acc } = gradeOf(r.s, r.notes.length);
    const rw = RHYTHM_REWARD[grade];
    const f = h.F(), d = h.day();
    const best = r.s.score > f.rhythmBest;
    if (best) f.rhythmBest = r.s.score;
    const used = f.rhythmDay[d] ?? 0;
    for (const k of Object.keys(f.rhythmDay)) if (Number(k) < d - 1) delete f.rhythmDay[k];
    let gift = '';
    if (used < RHYTHM_PER_DAY) {
      f.rhythmDay[d] = used + 1;
      if (rw.coins) st.addCoins(rw.coins, 'rhythm');
      if (rw.stars) { try { game.econ?.addStars?.(rw.stars, 'rhythm'); } catch { /* 없으면 넘어감 */ } }
      if (rw.hearts) h.gain(r.a.spec, rw.hearts, 'request');
      gift = `🪙 +${rw.coins.toLocaleString()}${rw.stars ? ` · ⭐ +${rw.stars}` : ''}${rw.hearts ? ' · 💕' : ''}`;
    } else gift = '오늘 보상은 다 받았어요 (연습은 언제든!)';
    h.save();
    h.burstHearts(h.headWorld(r.a.rig, r.a.spec), grade === 'S' ? 7 : 3);
    sfx(grade === 'S' ? 'achievement' : grade === 'C' ? 'toast' : 'star');
    game.hud.card({
      title: `🎺 합창 ${grade} 등급!${best ? ' (최고 기록!)' : ''}`,
      body: `${r.s.score.toLocaleString()}점 · 정확도 ${Math.round(acc * 100)}% · 최대 ${r.s.maxCombo}콤보\n${rw.line}\n${gift}`,
      icon: '🎺', color: '#ffc94a', ms: 5200,
    });
    h.emit('rhythm', { grade, score: r.s.score });
  }

  // ═══════════════ 화요일 대이동 ═══════════════
  let migOverride: { day: number; on: boolean } | null = null;
  st.on((e) => {
    if (e.type === 'weekday-event' && (e as { id?: string }).id === 'migration') migOverride = { day: h.day(), on: !!(e as { active?: boolean }).active };
  });
  const migOn = () => {
    const ov = migOverride && migOverride.day === h.day() ? migOverride.on : null;
    const wd = game.env?.weekday ?? (((h.day() % 7) + 7) % 7);
    return migrationActive(wd, h.hour(), ov);
  };
  let migPath: { pts: Array<{ x: number; z: number }>; cum: number[]; len: number; cx: number; cz: number } | null = null;
  function buildMigPath() {
    if (migPath) return migPath;
    const meadow = island.worldFeatures().find((f) => f.island === 'dino' && f.kind === 'meadow') ?? { x: isl.x, z: isl.z + 100, r: 200 };
    const tino = island.PLACES.tinoHill;
    const lakes = island.worldLakes().filter((L) => L.island === 'dino');
    const bad = (x: number, z: number) => !h.okGround(x, z, 'dino') || Math.hypot(x - tino.x, z - tino.z) < 62
      || lakes.some((L) => Math.hypot(L.x - x, L.z - z) < L.r + 7) || Math.hypot(x - PEN.x, z - PEN.z) < PEN_R + 8;
    const ang = 0.18;
    const dx = Math.cos(ang), dz = Math.sin(ang), nx = -dz, nz = dx;
    const R = meadow.r * 0.85;
    const raw: Array<{ x: number; z: number }> = [];
    const N = 32;
    for (let i = 0; i <= N; i++) {
      const u = -1 + (2 * i) / N;
      // 계곡을 S 자로(너무 곧으면 심심하다)
      const bx = meadow.x + dx * R * u + nx * Math.sin(u * 2.4) * R * 0.12, bz = meadow.z + 40 + dz * R * u + nz * Math.sin(u * 2.4) * R * 0.12;
      let p: { x: number; z: number } | null = null;
      for (let k = 0; k <= 12 && !p; k++) for (const sgn of k ? [1, -1] : [1]) {
        const x = bx + nx * k * 5 * sgn, z = bz + nz * k * 5 * sgn;
        if (!bad(x, z)) { p = { x, z }; break; }
      }
      if (p) raw.push(p);
    }
    // 부드럽게(두 번 평균)
    let pts = raw;
    for (let pass = 0; pass < 2; pass++) pts = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : { x: (pts[i - 1].x + p.x * 2 + pts[i + 1].x) / 4, z: (pts[i - 1].z + p.z * 2 + pts[i + 1].z) / 4 }));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const len = cum[cum.length - 1] || 1;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p.x; cz += p.z; }
    migPath = { pts, cum, len, cx: cx / Math.max(1, pts.length), cz: cz / Math.max(1, pts.length) };
    return migPath;
  }
  function pathAt(s: number): { x: number; z: number; tx: number; tz: number } {
    const P = buildMigPath();
    const dist = Math.max(0, Math.min(1, s)) * P.len;
    let i = 1;
    while (i < P.cum.length - 1 && P.cum[i] < dist) i++;
    const a = P.pts[i - 1], b = P.pts[i] ?? a;
    const seg = Math.max(1e-6, P.cum[i] - P.cum[i - 1]);
    const k = Math.max(0, Math.min(1, (dist - P.cum[i - 1]) / seg));
    const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, tx: (b.x - a.x) / tl, tz: (b.z - a.z) / tl };
  }
  // 그리기 줄이기(계약: 모듈당 40 콜): 진짜 몸(다리 흔들기·얼굴·그림자)은 가장 가까운 HERD_FULL 마리만.
  // 나머지는 종마다 구운 몸 InstancedMesh 하나(종당 그리기 한 번) — 통통 걸음만 흉내 낸다
  const HERD_FULL = 1, HERD_FULL_R = 22;
  const herdGeo = new Map<string, THREE.BufferGeometry | null>();
  let mig: { day: number; agents: Agent[]; full: Set<Agent>; proxies: Map<string, THREE.InstancedMesh> } | null = null;
  let migAnnounced = -1, migWitT = 0;
  const migHour = () => h.hour();
  function migCtl(i: number) {
    return (a: Agent, _t: number, dt: number) => {
      const P = buildMigPath();
      const { s, dir } = migrationAt(migHour(), i, P.len);
      const p = pathAt(s);
      const lat = (i % 2 ? 1 : -1) * (1.2 + (i % 3) * 1.1) * (i === 0 ? 0 : 1);
      const x = p.x - p.tz * lat, z = p.z + p.tx * lat;
      const mv = Math.hypot(x - a.x, z - a.z);
      a.speed = dt > 0 ? Math.min(6, mv / dt) : P.len / (MIG_LAP_H * 75);
      if (mv > 25) a.speed = 0;   // 시계를 건너뛰었으면 순간이동(걷는 척하지 않는다)
      a.x = x; a.z = z;
      const want = Math.atan2(p.tx * dir, p.tz * dir);
      let dy = want - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      a.yaw += dt > 0 ? dy * Math.min(1, dt * 3) : dy;
      a.state = 'walk';
      return true;
    };
  }
  function spawnMig() {
    const d = h.day();
    const herd = migrationHerd(ctx.rng(`dinos:mig:${d}`));
    const agents = herd.map((id, i) => {
      const s = spec(id);
      const { s: u } = migrationAt(migHour(), i, buildMigPath().len);
      const p = pathAt(u);
      const a = h.spawn(s, p.x, p.z, 0, `mig:${d}:${i}`, group, null, 'dino');
      a.adopted = true; a.keep = true; a.ctl = migCtl(i);
      applyCurve(a.rig.root);
      return a;
    });
    const proxies = new Map<string, THREE.InstancedMesh>();
    for (const a of agents) {
      const id = a.spec.id;
      if (!herdGeo.has(id)) herdGeo.set(id, bakeSkin(a.rig.root, [a.rig.faceGroup, a.rig.shadow]));
      const g = herdGeo.get(id);
      if (!g) continue;
      let im = proxies.get(id);
      if (!im) {
        im = new THREE.InstancedMesh(g, dinoSkin(), herd.length);
        im.name = `dinos-herd:${id}`;
        im.count = 0; im.castShadow = true; im.receiveShadow = true;
        applyCurve(im);
        group.add(im);
        proxies.set(id, im);
      }
    }
    mig = { day: d, agents, full: new Set(), proxies };
  }
  /** 매 프레임(개체 갱신 뒤): 가까운 몇 마리만 진짜 몸, 나머지는 종별 인스턴스로 */
  const hm = new THREE.Matrix4(), hq = new THREE.Quaternion(), hp = new THREE.Vector3(), hs = new THREE.Vector3(1, 1, 1), he = new THREE.Euler();
  function tickHerdLod(t: number, px: number, pz: number) {
    if (!mig) return;
    // 가까운 순(지금 진짜 몸인 것은 3 m 덤 — 경계에서 깜빡이지 않게)
    const ranked = mig.agents.filter(agentsHas).map((a) => ({ a, d: Math.hypot(a.x - px, a.z - pz) - (mig!.full.has(a) ? 3 : 0) })).sort((x, y) => x.d - y.d);
    mig.full = new Set(ranked.filter((r, i) => i < HERD_FULL && r.d < HERD_FULL_R).map((r) => r.a));
    const n = new Map<string, number>();
    for (const { a } of ranked) {
      if (mig.full.has(a) || a.state === 'ride') continue;
      const im = mig.proxies.get(a.spec.id);
      if (!im) continue;
      const vis = a.rig.root.visible;   // updateAgent 가 이번 프레임 정한 보임(멀면 숨김)
      a.rig.root.visible = false;
      if (!vis) continue;
      const k = n.get(a.spec.id) ?? 0;
      n.set(a.spec.id, k + 1);
      const sc = a.spec.scale, walk = a.speed > 0.3 ? 1 : 0, ph = t * 5.5 + a.bph * 6.283;
      hp.set(a.x, a.y + Math.abs(Math.sin(ph)) * 0.05 * sc * walk, a.z);
      hq.setFromEuler(he.set(0, a.yaw, Math.sin(ph) * 0.035 * walk));
      im.setMatrixAt(k, hm.compose(hp, hq, hs));
    }
    for (const [id, im] of mig.proxies) {
      im.count = n.get(id) ?? 0;
      im.visible = im.count > 0;
      if (!im.count) continue;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
  function dropMig() {
    if (!mig) return;
    // 타고 있는 무리 공룡은 두고(내리면 보통 공룡처럼 놀다가 멀어지면 정리된다) 행진·수명 표시만 뗀다
    for (const a of mig.agents) { if (a.state !== 'ride') h.dropAgent(a); else { a.keep = false; a.ctl = null; a.rig.root.visible = true; } }
    for (const im of mig.proxies.values()) { im.removeFromParent(); im.dispose(); }
    mig = null;
  }
  function tickMigration(t: number, dt: number, px: number, pz: number) {
    const on = migOn();
    const P = on ? buildMigPath() : null;
    const near = !!P && Math.hypot(px - P.cx, pz - P.cz) < P.len / 2 + 260 && game.world === 'earth';
    if (on && Math.hypot(px - isl.x, pz - isl.z) < isl.r + 500 && migAnnounced !== h.day()) {
      migAnnounced = h.day();
      game.hud.banner({ text: '🦕 공룡 대이동!', sub: '화요일엔 무리가 초원 계곡을 건너요 — 가까이에서 지켜보면 보너스!', icon: '🦕', color: '#9fd36b', ms: 3200 });
    }
    if (!on || !near) { if (mig) dropMig(); return; }
    if (!mig || mig.day !== h.day()) { dropMig(); spawnMig(); }
    tickHerdLod(t, px, pz);
    migWitT -= dt;
    if (migWitT > 0 && dt > 0) return;
    migWitT = 0.5;
    const f = h.F();
    if (!witnessReady(f.migDay, h.day())) return;
    const seen = mig!.agents.some((a) => Math.hypot(a.x - px, a.z - pz) < WITNESS_R);
    if (!seen) return;
    f.migDay = h.day();
    st.addCoins(MIG_BONUS.coins, 'migration');
    try { game.econ?.addStars?.(MIG_BONUS.stars, 'migration'); } catch { /* 없으면 넘어감 */ }
    let fossil = '';
    const fos = game.ext.fossils as { roll?: (r: () => number, isl?: string) => { id: string; name: string } } | undefined;
    const fr = fos?.roll?.(ctx.rng(`dinos:migfos:${h.day()}`), 'dino');
    if (fr && h.give(fr.id, 1) > 0) fossil = ` · 🦴 ${fr.name}`;
    h.save();
    game.hud.card({ title: '🦕 대이동을 목격했어요!', body: `쿵쿵쿵… 무리가 인사하며 지나가요!\n⭐ +${MIG_BONUS.stars} · 🪙 +${MIG_BONUS.coins}${fossil}`, icon: '🦕', color: '#9fd36b', ms: 4600 });
    sfx('discover');
    h.emit('migration', { witness: true, day: h.day() });
    void t;
  }
  game.hud.registerMapLayer({
    id: 'dinos-migration', order: 45,
    draw(g2, toPx, scale, world) {
      if (world !== 'earth' || !migOn()) return;
      const P = buildMigPath();
      if (P.pts.length < 2) return;
      g2.save();
      g2.strokeStyle = '#7cc96b'; g2.lineWidth = Math.max(2, 3 * Math.sqrt(scale * 6)); g2.setLineDash([6, 5]); g2.lineCap = 'round';
      g2.beginPath();
      P.pts.forEach((p, i) => { const [x, y] = toPx(p.x, p.z); if (i) g2.lineTo(x, y); else g2.moveTo(x, y); });
      g2.stroke();
      const lead = pathAt(migrationAt(migHour(), 0, P.len).s);
      const [lx, ly] = toPx(lead.x, lead.z);
      g2.setLineDash([]);
      g2.font = `${Math.max(14, Math.min(26, 20 * Math.sqrt(scale * 6)))}px Jua, sans-serif`;
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText('🦕', lx, ly);
      g2.restore();
    },
  });

  // ═══════════════ 화석 복원기 ═══════════════
  let restoreAnim = -1;
  function restore(dino: string) {
    const pieces = FOSSIL_SKELETONS.find((f) => f.dino === dino);
    if (!pieces) return;
    const ids = (game.ext.fossils as { partsOf?: (d: string) => string[] } | undefined)?.partsOf?.(dino) ?? [];
    const parts = ids.length === 3 ? ids : [`fos_${dino}_skull`, `fos_${dino}_body`, `fos_${dino}_tail`];
    if (!parts.every((p) => bagN(p) > 0)) { h.toast('조각이 모자라요 🦴'); return; }
    for (const p of parts) st.addItem(p, -1);
    const sk = pieces.id;
    st.addItem(sk, 1);
    const f = h.F();
    if (!f.restored.includes(dino)) f.restored.push(dino);
    h.save();
    restoreAnim = game.time;
    site?.rest.showBone('skeleton', pieces.tint);
    const sp = st.species.get(sk);
    if (sp && !st.dex[sk]) game.ui.showCatch({ species: sp, keep: false, activity: 'museum', line: '화석 복원기로 맞췄어요!' });
    sfx('craft');
    game.player.act('cheer', 1.2);
    const at = site ? site.rest.root.position.clone().add(V(0, 1.4, 0)) : game.player.pos.clone();
    h.burstSparkles(at, 14);
    // 집 진열장으로(econ.display — 진열장이 꽉 찼으면 가방에 남는다)
    let shown = false;
    try { shown = !!game.econ?.display?.(sk, true); } catch { shown = false; }
    game.hud.card({
      title: `🦴 ${sp?.name ?? '골격'} 복원 완료!`,
      body: shown ? '집 진열장에 멋지게 세워 뒀어요 🏠✨' : '가방에 넣어 뒀어요 — 집 진열장에 자리가 나면 올려 봐요 🏠',
      icon: '🦴', color: '#e9c48f', ms: 4400,
    });
    h.emit('restore', { dino, id: sk, displayed: shown });
  }
  game.addProvider('dinos-restorer', (p) => {
    if (p.mounted || game.world !== 'earth' || !site) return null;
    const c = site.rest.root.position;
    const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
    if (d > 2.8) return null;
    const ready = restorable(st.bag);
    if (ready.length) {
      const dino = ready[0];
      const name = st.species.get(`fos_${dino}`)?.name ?? dino;
      return { id: 'dinos-restorer', label: `🦴 화석 복원기: ${name} 맞추기${ready.length > 1 ? ` (+${ready.length - 1})` : ''}`, dist: d, use: () => restore(dino) };
    }
    const bp = bestPartial(st.bag);
    return {
      id: 'dinos-restorer', label: bp ? `🦴 화석 복원기 (${h.nm(`fos_${bp.dino}`)} 조각 ${bp.have}/3)` : '🦴 화석 복원기 (화석 조각 3개 필요)', dist: d,
      use: () => {
        if (!bp) { h.toast('머리·몸·꼬리 화석 조각 세 개를 모아 오면 골격을 맞춰 줘요 🦴 (X 표시를 삽으로!)'); return; }
        const miss = missingPieces(st.bag, bp.dino).map((id) => h.nm(id));
        h.toast(`${miss.join('·')}만 더 있으면 완성이에요! 🦴`);
      },
    };
  });

  // ═══════════════ E·F 놀이 ═══════════════
  function actionE(a: Agent): { label: string; use: () => void } | null {
    if (a.state === 'sleep' || a.ctl) return null;
    const r = recOf(a);
    if (r) {
      const stg = stageNow(r);
      if (stg < ADULT && r.fedDay !== h.day()) {
        const food = h.pickFood(a.spec);
        if (food) return { label: `${ranchName(r)} 맘마 주기 (${h.nm(food)} · 쑥쑥!)`, use: () => { h.feed(a, food); if (feedRanch(r, h.day())) { h.save(); h.toast(`${ranchName(r)}: 냠냠! 쑥쑥 자라요 🌱 (어른까지 ${leftText(growLeft(ageOf(r, now())))})`); } } };
      }
      if (stg < ADULT) return { label: `${ranchName(r)} 쓰다듬기 (어른까지 ${leftText(growLeft(ageOf(r, now())))})`, use: () => h.pet(a) };
    }
    // 내가 키운 어른 공룡은 처음부터 친구
    if (r ? stageNow(r) < ADULT : !h.isFriend(a.spec)) return null;
    if (a.spec.id === 'dino-brachio') return { label: `${a.spec.name} 목 엘리베이터 타기 ⬆️`, use: () => elevator(a) };
    if (a.spec.id === 'z_apatosaurus') return { label: `${a.spec.name} 꼬리 미끄럼틀 타기 🛝`, use: () => { slide(a); } };
    if (a.spec.id === 'dino-parasaur') return { label: `${a.spec.name}랑 합창 놀이 🎺`, use: () => startRhythm(a) };
    return null;
  }
  function altF(a: Agent, _d: number, normal: () => { label: string; use: () => void }) {
    if (a.state === 'sleep' || a.ctl) return null;
    const r = recOf(a);
    if (r && canRideStage(stageNow(r))) {
      const base = spec(r.sp);
      return { label: `${ranchName(r).replace(/^어른 /, '')} 타기 🏇`, use: () => h.mountAgent(a, rideOf(base)) };
    }
    // E 를 놀이에 내준 친구: 먹이·쓰다듬기는 F 로
    if (!r && h.isFriend(a.spec) && (a.spec.id === 'dino-brachio' || a.spec.id === 'z_apatosaurus' || a.spec.id === 'dino-parasaur')) return normal();
    return null;
  }

  const busy = () => !!carry || !!rhy;

  // ═══════════════ 매 프레임 ═══════════════
  let slow = 0;
  let tellT = 0;
  function update(t: number, dt: number, px: number, pz: number) {
    // 자리(부화장·복원기·목장)
    const dLab = Math.hypot(px - LAB.x, pz - LAB.z);
    if (!site && dLab < SITE_IN && game.world === 'earth') buildSite();
    else if (site && dLab > SITE_OUT) dropSite();
    if (t >= slow) {
      slow = t + 1;
      tickRanch(px, pz);
      syncPenSign();
      if (Math.floor(t) % 5 === 0) checkIncubators();
      // 다 된 알 알림(한 번)
      const n = now();
      let told = false;
      for (const e of eggs()) if (!e.told && eggReady(e, n)) { e.told = true; told = true; }
      if (told && t > tellT) {
        tellT = t + 8; h.save();
        const wh = new Set(eggs().filter((e) => eggReady(e, n)).map((e) => e.where));
        const at = wh.size > 1 ? '부화기·부화장' : wh.has('hatchery') ? '부화장' : '부화기';
        h.toast(`🥚 톡톡! ${at} 속 알이 깨어나고 싶대요 (E 로 깨우기)`);
      }
    }
    for (const a of ranchAgents.values()) keepInPen(a, dt);
    tickThief(t);
    tryThief(t, px, pz);
    tickCarry(t);
    tickRhythm(t, dt);
    tickMigration(t, dt, px, pz);
    tickRanchLod(t, px, pz);
    // 갓 태어난 아기: 잠깐 두리번 → 목장으로(집이면 이사)
    for (let i = hatchlings.length - 1; i >= 0; i--) {
      const hl = hatchlings[i];
      hl.a.hop = Math.max(hl.a.hop, Math.max(0, Math.sin(t * 5)) * 0.4);
      if (game.time < hl.until && agentsHas(hl.a)) continue;
      hatchlings.splice(i, 1);
      if (!agentsHas(hl.a)) continue;
      if (hl.inHouse || !site) { h.dropAgent(hl.a); continue; }
      // 부화장 → 목장 문으로 걸어간다(목장 개체로 넘긴다)
      hl.a.keep = true; hl.a.ranch = hl.rec.uid; hl.a.home = { x: PEN.x, z: PEN.z }; hl.a.state = 'idle'; hl.a.timer = 0.5;
      ranchAgents.set(hl.rec.uid, hl.a);
      keepInPen(hl.a, dt);
    }
    // 껍데기
    for (let i = shells.length - 1; i >= 0; i--) {
      const sh = shells[i], k = (t - sh.t0);
      sh.o.top.position.set(sh.vx * Math.min(k, 0.7), 0.32 + Math.max(0, 2.4 * k - 3 * k * k), sh.vz * Math.min(k, 0.7));
      sh.o.top.rotation.set(k * 5, 0, k * 3);
      if (k > 6) { sh.o.root.removeFromParent(); shells.splice(i, 1); }
    }
    // 부화장 알: 다 될수록 크게 들썩 · 다 되면 통통
    if (site) {
      const n = now();
      for (let i = 0; i < HATCHERY_SLOTS; i++) {
        const e = eggAt('hatchery', String(i));
        const m = site.hatch.eggs[i];
        m.visible = !!e;
        if (!e) continue;
        const pr = eggProgress(e, n), ready = eggReady(e, n);
        const wob = ready ? 0.22 : Math.max(0, Math.sin(t * 1.3 + i * 2) - (1 - pr * 0.4)) * 2.2 * pr;
        m.rotation.z = Math.sin(t * 20 + i) * 0.12 * wob;
        m.position.y = site.hatch.slots[i].y + (ready ? Math.abs(Math.sin(t * 4 + i)) * 0.12 : 0);
      }
      (site.hatch.lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + 0.25 * Math.sin(t * 2);
      // 복원기: 팔 끄덕 · 불빛 깜빡 · 복원 직후 뼈 빙글
      site.rest.arm.rotation.y = Math.sin(t * 0.8) * 0.35;
      for (let i = 0; i < 3; i++) site.rest.blink(i, Math.sin(t * 3 + i * 2.1) > -0.4);
      const ka = restoreAnim > 0 ? t - restoreAnim : 99;
      site.rest.bone.rotation.y = t * (ka < 3 ? 3 : 0.4);
      if (ka > 8 && restoreAnim > 0) { restoreAnim = -1; site.rest.showBone('skull', '#f3e6cc'); }
    }
  }

  // ═══════════════ 디버그(window.__dinos 에 섞인다) ═══════════════
  const debug = {
    /** 알 n개 받기 */
    egg: (n = 1) => h.give(EGG_ITEM, n),
    eggs: () => eggs().map((e) => ({ ...e, left: eggLeft(e, now()), ready: eggReady(e, now()) })),
    /** 부화장 i 칸에 알 넣기(가방에 없으면 하나 준다) */
    putEgg(slot = 0, where: EggWhere = 'hatchery') { if (!bagN(EGG_ITEM)) h.give(EGG_ITEM, 1); return placeEgg(where, String(slot)); },
    /** 알을 다 된 상태로(시간 건너뛰기 대신) */
    ripen() { for (const e of eggs()) e.start = Math.min(e.start, now() - HATCH_DAYS); h.save(); return eggs().length; },
    /** 다 된 알 하나 깨우기 */
    hatch() {
      const e = eggs().find((x) => eggReady(x, now()));
      if (!e) return null;
      const at = e.where === 'hatchery' ? hatchSlotWorld(Number(e.slot)) : game.player.pos.clone().add(V(1, 0, 0));
      hatch(e, at);
      return e.sp;
    },
    ranch: () => h.F().ranch.map((r) => ({ ...r, age: ageOf(r, now()), stage: stageNow(r), name: ranchName(r) })),
    /** 목장 공룡 나이 더하기(날) */
    grow(days = 1.5) { for (const r of h.F().ranch) r.born -= days; h.save(); return debug.ranch(); },
    cap: () => ({ cap: cap(), perk: perk(), n: h.F().ranch.length }),
    site: () => ({ lab: LAB, hatchery: HATCH_AT, restorer: REST_AT, pen: { ...PEN, r: PEN_R }, built: !!site }),
    goLab(where: 'hatchery' | 'restorer' | 'pen' = 'hatchery') {
      const p = where === 'pen' ? { x: PEN.x + Math.cos(GATE) * (PEN_R + 5), z: PEN.z + Math.sin(GATE) * (PEN_R + 5) } : where === 'restorer' ? { x: REST_AT.x + toC.x * 3.5, z: REST_AT.z + toC.z * 3.5 } : { x: HATCH_AT.x + toC.x * 4, z: HATCH_AT.z + toC.z * 4 };
      game.player.teleport(p.x, p.z);
      return p;
    },
    /** 대이동: on = 강제로 켜기(null 해제) */
    migration(on?: boolean | null) {
      if (on !== undefined) migOverride = on === null ? null : { day: h.day(), on };
      const P = buildMigPath();
      return { active: migOn(), len: P.len, center: { x: P.cx, z: P.cz }, herd: mig?.agents.map((a) => a.spec.id) ?? [], lead: pathAt(migrationAt(migHour(), 0, P.len).s) };
    },
    goMigration() { const P = buildMigPath(); const l = pathAt(migrationAt(migHour(), 0, P.len).s); game.player.teleport(l.x - l.tz * 14, l.z + l.tx * 14); return l; },
    /** 가장 가까운 알도둑이 과일을 훔치게 */
    steal() {
      let best: Agent | null = null, bd = Infinity;
      for (const a of h.agents) if (a.spec.id === 'z_oviraptor' && !a.ranch) { const d = Math.hypot(a.x - game.player.pos.x, a.z - game.player.pos.z); if (d < bd) { bd = d; best = a; } }
      if (!best) return false;
      if (!fruitInBag()) h.give('m_apple', 1);
      steal(best, fruitInBag()!, game.time);
      return true;
    },
    catchThief: () => { if (!thief) return false; caught(); return true; },
    thief: () => (thief ? { id: thief.a.id, item: thief.item, left: THIEF_SEC - (game.time - thief.t0) } : null),
    elevator(a?: Agent) { const ag = a ?? nearestOf('dino-brachio'); if (!ag) return false; elevator(ag); return true; },
    slide(a?: Agent) { const ag = a ?? nearestOf('z_apatosaurus'); return ag ? slide(ag) : false; },
    rhythm(a?: Agent) { const ag = a ?? nearestOf('dino-parasaur'); if (!ag) return false; startRhythm(ag); return true; },
    rhythmState: () => (rhy ? { time: game.time - rhy.t0, len: rhy.len, ...rhy.s, notes: rhy.notes.length } : null),
    /** 리듬: 지금 칠 음표를 자동으로 친다(시험용) */
    autoplay() { if (!rhy) return 0; const time = game.time - rhy.t0; let n = 0; for (const nt of rhy.notes) if (!nt.hit && Math.abs(nt.t - time) < 0.05) { nt.hit = 'perfect'; applyJudge(rhy.s, 'perfect'); n++; } return n; },
    restore: (dino?: string) => { const d = dino ?? restorable(st.bag)[0]; if (!d) return false; restore(d); return true; },
    busy,
  };
  function nearestOf(id: string): Agent | null {
    let best: Agent | null = null, bd = Infinity;
    for (const a of h.agents) if (a.spec.id === id && !a.ctl) { const d = Math.hypot(a.x - game.player.pos.x, a.z - game.player.pos.z); if (d < bd) { bd = d; best = a; } }
    return best;
  }

  return { actionE: (a) => actionE(a), altF, update, busy, debug };
}

export type { DinoRig };
