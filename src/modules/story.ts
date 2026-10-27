// story — 이야기(GDD 1.2 · 4.6.2 · 4.14 · 6.4): 첫날 밤 별똥별 인트로 → 아기 별토끼 토토 → 챕터 1~6(정착 → 첫 항해 → 공룡과 눈 →
// 사막 → 발사 → 우주, 해금·발견 기록에서 고른다) → 섬 주인 별조각 체인 7개 → 토토의 별 되살리기 → 발사 뒤 엔딩(불꽃놀이 + 토토의 별 로켓).
// 수평선 목표: 지도 층(별 표시) + 세상 빛기둥(다음 랜드마크). 목표 칩 'Toto를 집에 보내 주자'(누르면 이야기 창).
//
// 체인 진행은 이벤트로만 센다: secret-found(숨은 곳) · release(반딧불 놓아주기) · gift/npc-talk(보들에게 망원경) · econ.skeletonsDone(화석 골격) ·
// catch(오로라 밤 오로라나비) · donate/econ.isDonated(별자리 물고기 set:zodiac). 주인 NPC 는 ext.npc(characters · npcs-p1)의 id 로 찾고,
// 주인에게 말 걸면(npc-talk) 부탁·진행·고마워 카드를 띄운다. 별조각(it_starpiece_1..7)은 econ.give 로 딱 한 번씩.
// 순수 규칙은 story/chains.ts(체인 상태 기계) · story/logic.ts(챕터·목표·엔딩 상태 기계), 모델은 story/toto.ts, 연출은 story/fx.ts.
//
// 저장: flags.story(logic.ts StoryFlags) — intro · crater · chapter · chains · pieces · released · secrets · given · shown · planets · helped ·
//   restored · launched · ending.
// 보내는 이벤트: ending{} (엔딩 연출이 끝날 때 한 번).
//
// game.ext.story (주인: story) = {
//   chapter(): 1..6 · pieces(): 0..7 · restored(): boolean · ended(): boolean · met(): boolean
//   chains(): Array<{no, owner, status:'idle'|'asked'|'ready'|'done', have, need}>
//   target(): {x, z, name, id} | null    지금 수평선 목표
//   totoPos(): {x, y, z} | null          토토 자리(만난 뒤, 지구)
//   playing(): 'intro'|'meet'|'restore'|'ending'|null
// }
// 디버그: window.__story = { state(), intro(), introAt(t), meet(), chapter(), chains(), target(), fire(e), grant(no), finish(no),
//   restore(), ending(), launch(), toto(), goToto(), goCrater(), check(), open(tab?), reset(), cut(), hold(on?), seek(t) }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import { applyCurve } from '../core/curve';
import { splitVariant } from '../core/api';
import { isEvent, type GameEvent } from '../core/events';
import {
  CHAINS, CHAIN_BY_NO, CHAIN_BY_OWNER, OBJECTIVE, PIECES_TOTAL, TOTO_ID, TOTO_LINES, TOTO_NAME, chapterDef,
  INTRO_T, MEET_T, RESTORE_T, ENDING_T, ENDING_FALLBACK_SEC, INTRO_NO_ENV_SEC, type ChainDef,
} from './story/data';
import { chainProgress, talkStep, tickStep, waitLine, asStatus, type ChainFacts, type ChainStatus } from './story/chains';
import {
  ensureStory, nextChapter, chapterGoals, pickTarget, introReady, endingStep, nextStepText, meteorPath, easeOut, clamp01,
  type StoryFlags, type ChapterFacts, type TargetSpot, type EndingInput,
} from './story/logic';
import { buildToto, buildStarRocket, starGeometry, starMaterial, type TotoModel } from './story/toto';
import { buildMeteor, buildImpact, buildCrater, buildBeacon, buildFireworks, buildBubble, glowSprite } from './story/fx';
import { storyPanel, STORY_PANEL } from './story/panel';

export const order = 48;

/** 판정 간격(초) */
const EVAL_EVERY = 0.3;
/** 토토가 보이는 거리(m) */
const TOTO_VIS = 220;
/** 별똥별 출발: 구덩이 너머 METEOR_FROM m · 옆 METEOR_SIDE m · 위 METEOR_UP m */
const METEOR_FROM = 400, METEOR_SIDE = 260, METEOR_UP = 200;
/** 같은 주인 '아직' 카드 다시 띄우는 간격(실제 초) */
const WAIT_CARD_GAP = 15;
const CIRCLED = '①②③④⑤⑥⑦';

type CutKind = 'intro' | 'meet' | 'restore' | 'ending';
interface Cut { kind: CutKind; t: number; /** 연출 기준 자리 */ at: THREE.Vector3; /** 연출 시작 때 고른 값 */ data: Record<string, number> }

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const g: Game = game;
  const st = g.state;
  const I = ctx.island;

  // ───────────── 저장 ─────────────
  let fl: StoryFlags | null = null;
  const F = (): StoryFlags => {
    if (!fl || st.flags.story !== fl) fl = ensureStory(st.flags);
    return fl;
  };
  const save = () => st.save();
  const day = () => Math.max(0, Math.floor(g.env?.day ?? g.econ?.day?.() ?? 0));
  const sfx = (name: string, o?: { vol?: number; pitch?: number }) => { try { g.audio?.sfx(name, o); } catch { /* 소리 없음 */ } };

  // ───────────── 구덩이 자리(집 옆 평평한 풀밭, 결정적) ─────────────
  const craterSpot = (): { x: number; z: number } => {
    const saved = F().crater;
    if (saved) return saved;
    const h = I.PLACES.house;
    const rnd = ctx.rng('story:crater');
    const flat = (x: number, z: number) => {
      const s = I.surfaceAt(x, z);
      if (s.kind !== 'grass' && s.kind !== 'sand' && s.kind !== 'jungle') return false;
      if (s.coastDist < 10) return false;
      const y = s.h;
      for (const [dx, dz] of [[3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5]]) if (Math.abs(I.heightAt(x + dx, z + dz) - y) > 0.7) return false;
      return true;
    };
    const mb = I.PLACES.mailbox;
    const a0 = rnd() * Math.PI * 2;
    for (let ring = 0; ring < 5; ring++) {
      const r = 16 + ring * 5;
      for (let k = 0; k < 16; k++) {
        const a = a0 + (k / 16) * Math.PI * 2;
        const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
        if (Math.hypot(x - mb.x, z - mb.z) < 8) continue;
        if (flat(x, z)) return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
      }
    }
    return { x: h.x + 14, z: h.z + 6 };
  };
  const CR = craterSpot();
  const craterY = () => I.heightAt(CR.x, CR.z);

  // ───────────── 세상 조각 ─────────────
  const group = new THREE.Group();
  group.name = 'story';
  group.userData.world = 'earth';
  const spaceGroup = new THREE.Group();
  spaceGroup.name = 'story-space';
  g.spaceRoot.add(spaceGroup);

  const meteor = buildMeteor();
  group.add(meteor.root);
  const impact = buildImpact(ctx.rng('story:impact'));
  group.add(impact.root);
  const crater = buildCrater(ctx.rng('story:crater-look'));
  crater.root.position.set(CR.x, craterY() - 0.05, CR.z);
  const beacon = buildBeacon();
  group.add(beacon.root);

  // 구덩이는 청크로(그 칸이 가까울 때만 세상에 둔다)
  const CHUNK = 64;
  const ccx = Math.floor(CR.x / CHUNK), ccz = Math.floor(CR.z / CHUNK);
  g.chunks.add({
    key: 'story-crater', size: CHUNK, radius: 320, world: 'earth',
    build: ({ cx, cz }) => {
      if (cx !== ccx || cz !== ccz) return null;
      const holder = new THREE.Group();
      holder.name = 'story-crater-chunk';
      holder.add(crater.root);
      return holder;
    },
    // 구덩이 모형은 하나를 계속 쓴다 — 내릴 때 떼어 내기만(기하 버리지 않는다)
    dispose: (o) => { o.remove(crater.root); },
  });

  // 토토(만난 뒤 집 옆에서 산다)
  const toto: TotoModel = buildToto(ctx.rng('story:toto-phase')());
  const totoBox = new THREE.Group();
  totoBox.name = 'story-toto';
  totoBox.add(toto.root);
  totoBox.visible = false;
  group.add(totoBox);
  const bubble = buildBubble();
  bubble.sprite.position.y = 1.05;
  totoBox.add(bubble.sprite);
  // 별 되살리기 연출용 별 7개(토토 둘레를 돌다가 머리 위에서 하나로)
  const orbit = new THREE.Group();
  orbit.name = 'story-restore';
  const orbitStars: THREE.Mesh[] = [];
  for (let i = 0; i < PIECES_TOTAL; i++) {
    const s = new THREE.Mesh(starGeometry(), starMaterial());
    s.scale.setScalar(0.16);
    orbit.add(s);
    orbitStars.push(s);
  }
  const bigStar = new THREE.Mesh(starGeometry(), starMaterial());
  bigStar.scale.setScalar(0.01);
  orbit.add(bigStar);
  const bigGlow = glowSprite('#ffe9a8', 0.1);
  orbit.add(bigGlow);
  orbit.visible = false;
  totoBox.add(orbit);
  applyCurve(group);

  // 토토 자리·움직임(만난 뒤)
  const home = new THREE.Vector3(CR.x + 3.4, 0, CR.z + 1.5);
  const totoPos = new THREE.Vector3(home.x, I.heightAt(home.x, home.z), home.z);
  let totoYaw = 0;
  const hopFrom = new THREE.Vector3(), hopTo = new THREE.Vector3();
  let hopT = -1, hopDur = 0.45, nextWander = 2;
  let wanderN = 0;
  let sayUntil = 0;
  let sayText: string | null = null;
  const say = (text: string, sec = 4.5) => { sayText = text; sayUntil = clock + sec; sfx('talk-blip', { pitch: 1.6 }); };

  // ───────────── 연출 상태 ─────────────
  let clock = 0;
  let cut: Cut | null = null;
  let locked = false;
  const lock = () => { if (!locked) { g.player.lock('story'); locked = true; } };
  const unlock = () => { if (locked) { g.player.unlock('story', true); locked = false; } };
  let restorePending = false;
  /** 디버그: 연출 시간 멈추기(촬영) */
  let holdCut = false;
  let sinceLaunch = -1;
  /** 'ending' 이벤트를 이미 봤나(다른 모듈 것 포함) · 지금 내가 내는 중인가 */
  let endingSeen = false, selfEnding = false;
  let noEnvWait = 0;
  // 연출 카메라: 카메라 리그가 자리를 잡은 뒤(엔진 훅) 덮어쓴다. 끝나면 리그가 다시 맡는다
  let shot: { pos: THREE.Vector3; look: THREE.Vector3; k: number } | null = null;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const setShot = (pos: THREE.Vector3, look: THREE.Vector3) => {
    if (!shot) {
      shot = { pos: pos.clone(), look: look.clone(), k: 0 };
      camPos.copy(ctx.camera.position);
      // 지금 보고 있는 쪽에서 출발(원점에서 휙 돌지 않게)
      camLook.set(0, 0, -1).applyQuaternion(ctx.camera.quaternion).multiplyScalar(10).add(ctx.camera.position);
    }
    shot.pos.copy(pos);
    shot.look.copy(look);
  };
  /** 플레이어 뒤(look 반대편) dist m, 높이 up m */
  const behind = (from: { x: number; y: number; z: number }, look: { x: number; z: number }, dist: number, up: number, side = 0) => {
    const dx = from.x - look.x, dz = from.z - look.z, d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    const x = from.x + ux * dist - uz * side, z = from.z + uz * dist + ux * side;
    return new THREE.Vector3(x, Math.max(from.y, I.heightAt(x, z)) + up, z);
  };

  // 엔딩 무대(우주면 spaceRoot, 지구면 group 아래)
  let stage: {
    root: THREE.Group; toto: TotoModel; rocket: ReturnType<typeof buildStarRocket>; fw: ReturnType<typeof buildFireworks>;
    bubble: ReturnType<typeof buildBubble>; flash: THREE.Sprite; base: THREE.Vector3; from: THREE.Vector3;
  } | null = null;

  // ───────────── 체인 사실 ─────────────
  let zodiacCache: { at: number; donated: number; total: number } | null = null;
  const zodiac = () => {
    if (zodiacCache && clock - zodiacCache.at < 1) return zodiacCache;
    let total = 0, donated = 0;
    for (const s of st.species.values()) {
      if (!s.tags?.includes('set:zodiac')) continue;
      total++;
      try { if (g.econ?.isDonated?.(s.id)) donated++; } catch { /* 박물관 없음 */ }
    }
    return (zodiacCache = { at: clock, donated, total });
  };
  const facts = (): ChainFacts => {
    const f = F();
    const secrets = new Set(f.secrets);
    // 숨은 곳 서비스가 따로 기억하는 것도(이야기가 늦게 붙은 저장)
    const sec = g.ext.secrets as { found?: (id: string) => boolean } | undefined;
    for (const c of CHAINS) {
      const id = c.goal.kind === 'secret' || c.goal.kind === 'secret+skeletons' ? c.goal.secret : null;
      if (id && !secrets.has(id)) { try { if (sec?.found?.(id)) secrets.add(id); } catch { /* 없음 */ } }
    }
    const given = new Set(f.given);
    try { if (g.econ?.isDonated?.('d_spyglass') && asStatus(f.chains['2']?.s) !== 'idle') given.add('d_spyglass'); } catch { /* 없음 */ }
    let skeletons = 0;
    try { skeletons = g.econ?.skeletonsDone?.()?.length ?? 0; } catch { skeletons = 0; }
    const z = zodiac();
    return { secrets, released: f.released, given, skeletons, shown: new Set(f.shown), zodiacDonated: z.donated, zodiacTotal: z.total };
  };
  const statusOf = (no: number): ChainStatus => asStatus(F().chains[String(no)]?.s);
  const setStatus = (no: number, s: ChainStatus) => { F().chains[String(no)] = { s, day: day() }; };
  const ownerPresent = (id: string) => {
    const npc = g.ext.npc as { name?: (id: string) => string | null } | undefined;
    try { return !!npc?.name?.(id); } catch { return false; }
  };
  const pieces = () => F().pieces.length;

  // ───────────── 챕터 사실 ─────────────
  const unlocked = (k: string) => { try { return !!g.econ?.isUnlocked?.(k); } catch { return false; } };
  const chapterFacts = (): ChapterFacts => {
    const f = F();
    let rocket = { blueprint: false, parts: 0, pad: false };
    try {
      const r = g.econ?.rocket?.();
      if (r) rocket = { blueprint: r.blueprint, parts: Object.values(r.parts).filter(Boolean).length, pad: r.pad };
    } catch { /* 경제 없음 */ }
    const planetIds = ['sugar', 'jelly', 'frost', 'cloud', 'belt', 'station', 'blackhole'];
    const planets = new Set(f.planets.filter((p) => p !== 'moon' && p !== 'earth'));
    for (const p of planetIds) if (unlocked(`space:planet:${p}`)) planets.add(p);
    return {
      isUnlocked: unlocked,
      discovered: (id) => { try { return !!g.geo?.discovered?.(id); } catch { return false; } },
      parts: rocket.parts, pad: rocket.pad || unlocked('rocket:pad'), blueprint: rocket.blueprint || unlocked('rocket:blueprint'),
      moon: f.launched || unlocked('space:moon'),
      planets: planets.size,
      lighthouses: I.LIGHTHOUSE_ISLANDS.filter((id) => unlocked(`lighthouse:${id}`)).length,
      pieces: f.pieces.length,
      mongsilDone: f.helped.includes('npc_mongsil') || statusOf(1) === 'done',
      ended: f.ending === 'done',
    };
  };

  // ───────────── 별조각 주기 ─────────────
  const card = (title: string, body: string, icon: string, color: string, ms = 4200) => g.hud.card({ title, body, icon, color, ms });
  const grant = (def: ChainDef) => {
    const f = F();
    setStatus(def.no, 'done');
    if (f.pieces.includes(def.no)) return false;
    f.pieces.push(def.no);
    f.pieces.sort((a, b) => a - b);
    let got = 0;
    try { got = g.econ?.give?.(def.piece, 1, 'story', { silent: true }) ?? 0; } catch { got = 0; }
    if (got < 1) st.addItem(def.piece, 1); // 가방이 꽉 차도 별조각은 잃지 않게
    sfx('star');
    sfx('chest-open-rainbow', { vol: 0.6 });
    g.hud.banner({ text: `별조각 ${CIRCLED[def.no - 1]} 획득!`, sub: `${def.ownerName} · ${def.islandName} — ${f.pieces.length}/${PIECES_TOTAL}`, icon: '⭐', color: '#ffd36b', ms: 3600 });
    if (f.pieces.length >= PIECES_TOTAL && !f.restored) {
      f.restored = true;
      restorePending = true;
      card('🌟 토토의 별이 되살아났어요!', '별조각 일곱 개가 모였어요. 로켓을 타고 우주로 가면 토토가 집에 갈 수 있어요!', '🌟', '#ffd36b', 6000);
    }
    save();
    return true;
  };

  // ───────────── 판정 ─────────────
  let dirty = true;
  let evalAcc = 0;
  const lastWaitCard = new Map<number, number>();
  const evaluate = () => {
    const f = F();
    dirty = false;
    let changed = false;
    const fx = facts();
    for (const def of CHAINS) {
      const p = chainProgress(def, fx);
      const before = statusOf(def.no);
      const step = tickStep(def, before, p.met, ownerPresent(def.owner));
      if (step.status !== before) { setStatus(def.no, step.status); changed = true; }
      if (step.grant) {
        if (def.claim === 'spot') card(`${def.icon} ${def.text}!`, `반짝이는 받침대 위에 별조각이 있었어요! ${def.thanks}`, '⭐', '#ffd36b');
        else if (!ownerPresent(def.owner)) card(`${def.icon} ${def.ownerName}`, def.thanks, '⭐', '#ffd36b');
        if (grant(def)) changed = true;
      } else if (step.say === 'ready') {
        card(`❗ ${def.ownerName}에게 가 보자`, def.ready, def.icon, '#ff9cb8');
      }
    }
    const ch = nextChapter(f.chapter, chapterFacts());
    if (ch !== f.chapter) {
      const prev = f.chapter;
      f.chapter = ch;
      changed = true;
      if (f.intro === 'met' && ch > prev) {
        const d = chapterDef(ch);
        g.hud.banner({ text: `${ch}장 · ${d.name}`, sub: `수평선의 다음 것: ${d.horizon}`, icon: d.icon, color: d.color, ms: 4200 });
        sfx('achievement', { vol: 0.7 });
      }
    }
    if (changed) { save(); if (g.hud.isOpen(STORY_PANEL.kind)) g.hud.rerender(); }
  };
  const check = () => { evalAcc = 0; evaluate(); };

  /** 주인에게 말을 걸었다 */
  const onOwnerTalk = (def: ChainDef) => {
    const f = F();
    // 체인 2: 가방의 선장 망원경을 건넨다(주인에게 말 걸면)
    if (def.goal.kind === 'give' && statusOf(def.no) !== 'done' && !f.given.includes(def.goal.item)) {
      const key = Object.keys(st.bag).find((k) => (st.bag[k] ?? 0) > 0 && splitVariant(k).id === (def.goal as { item: string }).item);
      if (key) { st.addItem(key, -1); f.given.push(def.goal.item); }
    }
    const fx = facts();
    const p = chainProgress(def, fx);
    const step = talkStep(statusOf(def.no), p.met);
    setStatus(def.no, step.status);
    const head = `${def.icon} ${def.ownerName}`;
    if (step.say === 'ask') card(`${head} · 별조각 부탁`, def.ask, '📝', '#c9b6f2', 6500);
    else if (step.say === 'wait') {
      const last = lastWaitCard.get(def.no) ?? -1e9;
      if (clock - last >= WAIT_CARD_GAP) { lastWaitCard.set(def.no, clock); card(head, waitLine(def, p, fx), '⏳', '#c9b6f2', 4500); }
    } else if (step.say === 'thanks') card(head, def.thanks, '⭐', '#ffd36b', 6000);
    if (step.grant) grant(def);
    save();
    if (g.hud.isOpen(STORY_PANEL.kind)) g.hud.rerender();
  };

  // ───────────── 이벤트 ─────────────
  const AURORA_BUG = 'b_aurora_butterfly';
  const isAuroraBug = (s: { id?: string; gdd?: string } | undefined) => !!s && (s.id === AURORA_BUG || s.gdd === AURORA_BUG);
  const auroraNow = () => {
    const env = g.env;
    if (!env) return true;
    try { return env.weather === 'aurora' || env.weatherOf('ice') === 'aurora'; } catch { return env.weather === 'aurora'; }
  };
  const isFirefly = (id: string) => {
    const s = st.species.get(id) ?? st.byGdd(id);
    return /firefly/.test(id) || !!s?.tags?.includes('firefly') || /firefly/.test(s?.gdd ?? '');
  };
  let ending: EndingInput | null = null;
  /** 엔딩 연출 중(저장엔 'armed' 로 남겨 둔다 — 도중에 끄면 다음 발사 뒤 다시) */
  let endingPlaying = false;
  const runEnding = (inp: EndingInput) => {
    const f = F();
    const cur = endingPlaying ? 'playing' : f.ending;
    const out = endingStep(cur, inp, { restored: f.restored, fallbackSec: ENDING_FALLBACK_SEC });
    if (out.state === 'playing') endingPlaying = true;
    else if (out.state !== f.ending) { f.ending = out.state; save(); }
    if (out.play) startEnding();
    if (out.emit) {
      endingPlaying = false;
      f.ending = 'done';
      f.endedDay = day();
      save();
      // 다른 엔딩(도감 100%)이 이미 'ending' 을 냈으면 다시 내지 않는다 — 토토 장면만 본다
      if (!endingAlready()) { selfEnding = true; st.emit({ type: 'ending' }); selfEnding = false; }
    }
  };
  const onEvent = (e: GameEvent) => {
    const f = F();
    switch (e.type) {
      case 'secret-found': if (isEvent(e, 'secret-found')) {
        if (!f.secrets.includes(e.id)) { f.secrets.push(e.id); dirty = true; save(); }
      } break;
      case 'release': if (isEvent(e, 'release')) {
        if (isFirefly(String(e.species))) { f.released.firefly = (f.released.firefly ?? 0) + Math.max(1, Math.floor(Number(e.n) || 1)); dirty = true; save(); }
      } break;
      case 'gift': if (isEvent(e, 'gift')) {
        const def = CHAIN_BY_OWNER.get(e.npc);
        if (def?.goal.kind === 'give' && splitVariant(String(e.item)).id === def.goal.item && !f.given.includes(def.goal.item)) {
          f.given.push(def.goal.item);
          dirty = true; save();
        }
      } break;
      case 'catch': case 'collect': {
        const sp = (e as { species?: { id?: string; gdd?: string } }).species;
        if (isAuroraBug(sp) && auroraNow() && !f.shown.includes(AURORA_BUG)) { f.shown.push(AURORA_BUG); dirty = true; save(); }
      } break;
      case 'npc-talk': if (isEvent(e, 'npc-talk')) {
        const def = CHAIN_BY_OWNER.get(e.npc);
        if (def && f.intro === 'met') onOwnerTalk(def);
        else if (def && def.claim === 'owner') {
          // 토토를 만나기 전에도 다 모은 걸 주인에게 가져가면 준다
          const p = chainProgress(def, facts());
          if (p.met && statusOf(def.no) !== 'done') onOwnerTalk(def);
        }
      } break;
      case 'request-done': if (isEvent(e, 'request-done')) {
        if (e.npc && !f.helped.includes(e.npc)) { f.helped.push(e.npc); dirty = true; save(); }
      } break;
      case 'launch': {
        if (!f.launched) { f.launched = true; save(); }
        sinceLaunch = 0;
        dirty = true;
        runEnding({ kind: 'launch' });
      } break;
      case 'arrive': if (isEvent(e, 'arrive')) {
        const to = String(e.to ?? '');
        if (to && to !== 'earth' && to !== 'moon' && !f.planets.includes(to)) { f.planets.push(to); save(); }
        dirty = true;
        ending = { kind: 'arrive', to };
      } break;
      case 'donate': zodiacCache = null; dirty = true; break;
      case 'unlock': case 'discover': case 'craft': case 'buy': case 'register': case 'lighthouse': dirty = true; break;
      default: break;
    }
  };
  st.on(onEvent);
  st.on((e) => { if (e.type === 'ending' && !selfEnding) endingSeen = true; });
  /** 엔딩이 이미 났나 — 이번 판에 들었거나, 저장된 도감 100% 엔딩(flight: flags.space.flight.ending) */
  const endingAlready = (): boolean => {
    if (endingSeen) return true;
    const sp = (st.flags as Record<string, unknown>).space as { flight?: { ending?: { ended?: number; by?: string } } } | undefined;
    const en = sp?.flight?.ending;
    return !!en?.ended && en.by !== 'story';
  };

  // ───────────── 인트로: 별똥별 ─────────────
  const meteorFrom = new THREE.Vector3();
  const startIntro = () => {
    const f = F();
    if (cut) return false;
    f.crater = { x: CR.x, z: CR.z };
    const p = g.player.pos;
    const near = g.world === 'earth' && Math.hypot(p.x - CR.x, p.z - CR.z) < 260;
    // 별똥별은 플레이어가 보는 쪽(구덩이 너머)에서 온다
    const rnd = ctx.rng(`story:meteor:${day()}`);
    const base = near ? Math.atan2(CR.z - p.z, CR.x - p.x) : rnd() * Math.PI * 2;
    // 구덩이 너머(깊이) + 옆(가로)에서 비스듬히 — 화면을 가로질러 긋는 줄이 보이게(정면에서 오면 점으로만 보인다)
    const side = (rnd() < 0.5 ? -1 : 1) * METEOR_SIDE * (0.85 + rnd() * 0.3);
    const dx = Math.cos(base), dz = Math.sin(base);
    meteorFrom.set(dx * METEOR_FROM - dz * side, METEOR_UP, dz * METEOR_FROM + dx * side);
    cut = { kind: 'intro', t: 0, at: new THREE.Vector3(CR.x, craterY(), CR.z), data: { near: near ? 1 : 0 } };
    // 멀리 있으면(하늘만 보이면) 잠그지 않는다
    if (near) lock();
    sfx('glide-wind', { vol: 0.9, pitch: 1.3 });
    save();
    return true;
  };
  const trailBuf: THREE.Vector3[] = Array.from({ length: 26 }, () => new THREE.Vector3());
  const tmpV = new THREE.Vector3();
  /** 인트로 t 초 모습(시간만으로 정해진다) */
  const poseIntro = (t: number, at: THREE.Vector3) => {
    const u = t / INTRO_T.fall;
    if (u < 1) {
      const m = meteorPath(u, meteorFrom);
      tmpV.set(at.x + m.x, at.y + m.y, at.z + m.z);
      for (let i = 0; i < trailBuf.length; i++) {
        const q = meteorPath(Math.max(0, u - (i + 1) * 0.018), meteorFrom);
        trailBuf[i].set(at.x + q.x, at.y + q.y, at.z + q.z);
      }
      meteor.set(true, tmpV, trailBuf, t, tmpV.distanceTo(ctx.camera.position));
    } else meteor.set(false, tmpV, trailBuf, t);
    const age = t - INTRO_T.fall;
    impact.root.position.copy(at);
    impact.set(age);
    crater.set(age < 0 ? 0 : clamp01(age / 0.6), 0, clock);
  };

  // ───────────── 토토 만나기(구덩이에서 E) ─────────────
  const startMeet = () => {
    if (cut || F().intro !== 'fell') return false;
    const p = g.player.pos;
    const at = new THREE.Vector3(CR.x, craterY(), CR.z);
    // 토토가 내려앉을 자리: 구덩이 가장자리, 플레이어 쪽
    const dx = p.x - CR.x, dz = p.z - CR.z, d = Math.hypot(dx, dz) || 1;
    const land = { x: CR.x + (dx / d) * 3.6, z: CR.z + (dz / d) * 3.6 };
    cut = { kind: 'meet', t: 0, at, data: { lx: land.x, lz: land.z } };
    lock();
    g.player.yaw = Math.atan2(CR.x - p.x, CR.z - p.z);
    sfx('chest-shake');
    return true;
  };
  const poseMeet = (t: number, c: Cut) => {
    const crack = clamp01((t - MEET_T.crack) / (MEET_T.pop - MEET_T.crack));
    crater.set(1, crack, clock + (t < MEET_T.crack ? t * 4 : 0));
    // 갈라지기 전 더 세게 흔들림
    if (t < MEET_T.crack) crater.rock.rotation.z = Math.sin(t * 40) * 0.12;
    totoBox.visible = t >= MEET_T.pop;
    const land = { x: c.data.lx, z: c.data.lz };
    const sy = c.at.y + 0.5, ly = I.heightAt(land.x, land.z);
    const u = clamp01((t - MEET_T.pop) / (MEET_T.land - MEET_T.pop));
    totoPos.set(CR.x + (land.x - CR.x) * u, sy + (ly - sy) * u + Math.sin(Math.PI * u) * 1.6, CR.z + (land.z - CR.z) * u);
    const p = g.player.pos;
    totoYaw = Math.atan2(p.x - totoPos.x, p.z - totoPos.z) + (u < 1 ? (1 - u) * Math.PI * 2 : 0);
    const after = t - MEET_T.land;
    const hop = after > 0 ? Math.abs(Math.sin(after * 7)) * Math.max(0, 1 - after / 1.2) * 0.5 : 0;
    toto.animate(clock, { hop, happy: t > MEET_T.pop, wave: after > 0.6 });
    impact.root.position.set(CR.x, c.at.y + 0.6, CR.z);
    impact.root.scale.setScalar(0.35);
    impact.set(t - MEET_T.pop + 0.05);
  };

  // ───────────── 별 되살리기 ─────────────
  const poseRestore = (t: number) => {
    orbit.visible = t < RESTORE_T.end;
    const merge = clamp01((t - 2.4) / 1.2);
    for (let i = 0; i < orbitStars.length; i++) {
      const a = (i / orbitStars.length) * Math.PI * 2 + t * 2.4;
      const r = 1.1 * (1 - merge) * clamp01(t / 0.6);
      orbitStars[i].position.set(Math.cos(a) * r, 0.6 + 0.5 * clamp01(t / 0.8) + merge * 0.6 + Math.sin(t * 3 + i) * 0.08 * (1 - merge), Math.sin(a) * r);
      orbitStars[i].scale.setScalar(0.16 * (1 - merge * 0.9));
      orbitStars[i].rotation.y = t * 4;
    }
    const big = easeOut(clamp01((t - 3.2) / 0.6));
    bigStar.position.set(0, 1.7, 0);
    bigStar.scale.setScalar(0.01 + big * 0.42 * (1 + 0.08 * Math.sin(t * 6)));
    bigStar.rotation.y = t * 2;
    bigGlow.position.set(0, 1.7, 0);
    bigGlow.scale.setScalar(0.1 + big * 3.2);
    toto.animate(clock, { hop: Math.abs(Math.sin(t * 5)) * 0.3, happy: true, wave: t > 3, glow: 1 + big });
  };

  // ───────────── 엔딩 ─────────────
  const startEnding = () => {
    if (cut?.kind === 'ending') return;
    if (cut) endCut(true);
    endingPlaying = true;
    if (F().ending === 'none') { F().ending = 'armed'; save(); }
    const space = g.world === 'space';
    const parent = space ? spaceGroup : group;
    const p = g.player.pos;
    const fwd = new THREE.Vector3(Math.sin(g.player.yaw), 0, Math.cos(g.player.yaw));
    const base = new THREE.Vector3(p.x + fwd.x * 5 + fwd.z * 1.5, 0, p.z + fwd.z * 5 - fwd.x * 1.5);
    base.y = g.groundAt(base.x, base.z);
    const root = new THREE.Group();
    root.name = 'story-ending';
    const rocket = buildStarRocket();
    rocket.root.position.copy(base);
    rocket.root.rotation.y = Math.atan2(p.x - base.x, p.z - base.z);
    const tm = buildToto(0.37);
    const fw = buildFireworks(ctx.rng('story:fireworks'), 26, 14);
    // 불꽃은 로켓 너머 하늘에(카메라 한 화면에 로켓과 같이 들어오게)
    fw.root.position.set(base.x + fwd.x * 22, base.y, base.z + fwd.z * 22);
    const bb = buildBubble();
    bb.sprite.position.y = 1.05;
    tm.root.add(bb.sprite);
    const flash = glowSprite('#fff6c8', 1);
    flash.visible = false;
    root.add(rocket.root, tm.root, fw.root, flash);
    parent.add(root);
    applyCurve(root);
    const from = new THREE.Vector3(p.x + fwd.z * 1.2, g.groundAt(p.x + fwd.z * 1.2, p.z - fwd.x * 1.2), p.z - fwd.x * 1.2);
    stage = { root, toto: tm, rocket, fw, bubble: bb, flash, base, from };
    cut = { kind: 'ending', t: 0, at: base.clone(), data: { space: space ? 1 : 0 } };
    lock();
    totoBox.visible = false;
    card('🌟 마지막 장 · 토토의 집', '토토가 별 로켓을 타고 집으로 돌아가요!', '🐰', '#c9b6f2', 5000);
  };
  let fwPops = 0;
  const poseEnding = (t: number) => {
    const s = stage;
    if (!s) return;
    const T = ENDING_T;
    // 토토: 플레이어 옆에서 톡 튀어나와 → 로켓으로 깡총 → 창 안
    const tm = s.toto;
    const seat = new THREE.Vector3();
    s.rocket.root.updateMatrixWorld(true);
    s.rocket.seat.getWorldPosition(seat);
    tm.root.visible = t >= T.appear && t < T.star;
    if (t < T.board) {
      const k = easeOut(clamp01((t - T.appear) / 0.5));
      tm.root.position.set(s.from.x, s.from.y + Math.sin(Math.PI * k) * 0.8, s.from.z);
      tm.root.scale.setScalar(0.2 + 0.8 * k);
      tm.root.rotation.y = Math.atan2(s.base.x - s.from.x, s.base.z - s.from.z) + (t < 3.2 ? Math.PI : 0);
      tm.animate(clock, { hop: t > 1.5 ? Math.abs(Math.sin(t * 6)) * 0.25 : 0, happy: true, wave: t > 2 && t < 4.6, glow: 2 });
      s.bubble.say(t > 1.6 && t < 4.8 ? TOTO_LINES.bye : null);
    } else {
      s.bubble.say(null);
      const u = clamp01((t - T.board) / 0.9);
      if (u < 1) {
        tm.root.position.set(s.from.x + (seat.x - s.from.x) * u, s.from.y + (seat.y - s.from.y) * u + Math.sin(Math.PI * u) * 2.2, s.from.z + (seat.z - s.from.z) * u);
        tm.root.scale.setScalar(1 - u * 0.25);
      } else {
        tm.root.position.copy(seat);
        tm.root.scale.setScalar(0.75);
      }
      tm.root.rotation.y = s.rocket.root.rotation.y;
      tm.animate(clock, { happy: true, wave: true, glow: 2 });
    }
    // 로켓: 떨다가 → 슝(가속) → 별이 되어 반짝
    const lt = t - T.lift;
    const shake = t > T.lift - 0.8 && lt < 0 ? Math.sin(t * 60) * 0.03 : 0;
    const rise = lt > 0 ? 0.5 * 11 * lt * lt : 0;
    s.rocket.root.position.set(s.base.x + shake + (lt > 0 ? lt * lt * 0.6 : 0), s.base.y + rise, s.base.z);
    s.rocket.root.rotation.z = lt > 0 ? Math.min(0.12, lt * 0.03) : 0;
    s.rocket.setFlame(lt > -0.8 ? clamp01((lt + 0.8) / 0.6) * (lt > 0 ? 1.6 : 0.7) : 0, clock);
    s.rocket.root.visible = t < T.star;
    if (lt > 0 && lt < 0.1) sfx('rocket-launch', { vol: 0.8 });
    // 반짝(로켓이 하늘 별이 된다)
    const fa = t - T.star;
    s.flash.visible = fa > -0.1;
    if (s.flash.visible) {
      s.flash.position.set(s.rocket.root.position.x, s.rocket.root.position.y + 1, s.rocket.root.position.z);
      const k = fa < 0.25 ? fa / 0.25 : Math.max(0.35, 1 - (fa - 0.25) * 0.3);
      s.flash.scale.setScalar(14 + 50 * Math.max(0, k) * (1 + 0.15 * Math.sin(clock * 9)));
    }
    // 불꽃놀이(1.2초부터 끝까지)
    const pops = s.fw.set(t - T.fireworks);
    if (pops > 0 && fwPops < 40) { fwPops += pops; sfx('balloon-pop', { vol: 0.7, pitch: 0.7 + (fwPops % 4) * 0.12 }); }
  };
  const clearStage = () => {
    if (!stage) return;
    stage.root.removeFromParent();
    stage.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      const mats = (m as { material?: THREE.Material | THREE.Material[] }).material;
      for (const mt of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        if (mt.userData.shared) continue;
        const map = (mt as THREE.SpriteMaterial).map;
        if (map && !map.userData.shared) map.dispose();
        mt.dispose();
      }
    });
    stage = null;
  };

  // ───────────── 연출 마무리 ─────────────
  const endCut = (aborted = false) => {
    const c = cut;
    if (!c) return;
    cut = null;
    const f = F();
    if (c.kind === 'intro') {
      meteor.set(false, tmpV, trailBuf, 0);
      impact.set(-1);
      crater.set(1, 0, clock);
      if (f.intro === 'none') f.intro = 'fell';
      save();
      if (!aborted) {
        g.hud.banner({ text: '별똥별이 떨어졌어요!', sub: '집 근처에서 무언가 반짝여요…', icon: '🌠', color: '#c9b6f2', ms: 4200 });
        card('🌠 반짝이는 별똥별', '집 옆 구덩이에서 무언가 꼼지락거려요. 가서 살펴볼까요?', '✨', '#c9b6f2', 5200);
      }
    } else if (c.kind === 'meet') {
      crater.set(1, 1, clock);
      impact.set(-1);
      impact.root.scale.setScalar(1);
      f.intro = 'met';
      totoBox.visible = true;
      totoPos.set(c.data.lx, I.heightAt(c.data.lx, c.data.lz), c.data.lz);
      home.set(totoPos.x, 0, totoPos.z);
      save();
      say(TOTO_LINES.hello, 6);
      g.hud.banner({ text: OBJECTIVE, sub: `아기 별토끼 ${TOTO_NAME}를 만났어요! 별조각 0/${PIECES_TOTAL}`, icon: '🐰', color: '#c9b6f2', ms: 5000 });
      card(`🐰 ${TOTO_NAME}`, '별나라에서 떨어진 아기 별토끼. 부서진 별의 조각 일곱 개가 섬마다 흩어졌대요. 섬 주인들에게 물어보자!', '⭐', '#c9b6f2', 6500);
      sfx('unlock');
      dirty = true;
    } else if (c.kind === 'restore') {
      orbit.visible = false;
      say(TOTO_LINES.restored, 6);
    } else if (c.kind === 'ending') {
      clearStage();
      // 도중에 끊기면(세계가 바뀜) 끝난 걸로 치지 않는다 — 다음에 우주에 닿으면 다시
      if (aborted) { endingPlaying = false; sinceLaunch = -1; } // 지구 대체 엔딩이 바로 터지지 않게 — 다음 발사부터 다시 센다
      else runEnding({ kind: 'finish' });
      if (!aborted) {
        g.hud.banner({ text: '토토가 집으로 돌아갔어요!', sub: '별나라에서 반짝반짝 손을 흔들어요 — 고마워!', icon: '🌟', color: '#ffd36b', ms: 6000 });
        card('🎆 엔딩', '도파민랜드의 이야기 하나가 끝났어요. 도감 100%와 블랙홀이 기다려요!', '🌟', '#ffd36b', 7000);
      }
      if (g.hud.isOpen(STORY_PANEL.kind)) g.hud.rerender();
    }
    shot = null;
    unlock();
  };

  // ───────────── 상호작용 ─────────────
  const tmpCr = new THREE.Vector3();
  g.addInteractable({
    id: 'story:crater', radius: 5, label: '반짝이는 별똥별 살펴보기 ✨',
    position: () => tmpCr.set(CR.x, craterY() + 0.5, CR.z),
    enabled: () => g.world === 'earth' && F().intro === 'fell' && !cut,
    onUse: () => { startMeet(); },
  });
  const tmpToto = new THREE.Vector3();
  const totoLine = () => {
    const f = F();
    if (f.restored) return f.launched ? TOTO_LINES.launchHint : TOTO_LINES.restored;
    if (f.pieces.length > 0 || clock % 2 < 1) return TOTO_LINES.pieces(f.pieces.length);
    return chapterDef(f.chapter).toto;
  };
  let talkN = 0;
  g.addInteractable({
    id: 'story:toto', radius: 2.6, label: `${TOTO_NAME}와 이야기하기 🐰`,
    position: () => tmpToto.copy(totoPos).setY(totoPos.y + 0.4),
    enabled: () => g.world === 'earth' && F().intro === 'met' && F().ending !== 'done' && !cut,
    onUse: () => {
      talkN++;
      const f = F();
      const line = talkN % 3 === 0 ? chapterDef(f.chapter).toto : totoLine();
      say(line, 5.5);
      hopT = 0; hopFrom.copy(totoPos); hopTo.copy(totoPos); hopDur = 0.4;
      st.emit({ type: 'npc-talk', npc: TOTO_ID });
    },
  });
  g.addInteractable({
    id: 'story:toto-book', radius: 2.6, label: '이야기 수첩 보기 📖', key: 'KeyF',
    position: () => tmpToto.copy(totoPos).setY(totoPos.y + 0.4),
    enabled: () => g.world === 'earth' && F().intro === 'met' && !cut,
    onUse: () => g.hud.open(STORY_PANEL.kind, 'story'),
  });

  // ───────────── 이야기 창 · 목표 칩 · 지도 ─────────────
  const target = (): TargetSpot | null => {
    const f = F();
    if (f.intro === 'none') return null;
    return pickTarget({
      chapter: f.chapter, intro: f.intro, crater: { x: CR.x, z: CR.z }, restored: f.restored, ended: f.ending === 'done',
      landmarks: g.geo?.landmarks ?? [],
      islandCenter: (id) => { const d = I.islandById(id); return d ? { x: d.x, z: d.z } : null; },
      islandName: (id) => { try { return g.geo?.islandName?.(id) ?? I.islandName(id); } catch { return id; } },
    });
  };
  const chainRows = () => {
    const fx = facts();
    return CHAINS.map((def) => ({ def, status: statusOf(def.no), p: chainProgress(def, fx) }));
  };
  const nextStep = () => { const f = F(); return nextStepText({ intro: f.intro, pieces: f.pieces.length, restored: f.restored, ending: f.ending, chapter: f.chapter }); };
  g.hud.registerPanel(storyPanel({
    chapter: () => F().chapter,
    goals: () => chapterGoals(F().chapter, chapterFacts()),
    horizon: () => { const t = target(); return t?.name ?? chapterDef(F().chapter).horizon; },
    nextStep,
    pieces,
    met: () => F().intro === 'met',
    restored: () => F().restored,
    ended: () => F().ending === 'done',
    chains: chainRows,
  }));

  let chipSig = '';
  g.hud.registerChip({
    id: 'story:goal', order: 22,
    render(el) {
      el.innerHTML = `<div class="chip dl-card" title="이야기 수첩 열기" style="display:none;cursor:pointer;pointer-events:auto;max-width:300px">
        <div class="ci">🐰</div><div style="line-height:1.15"><div class="t" style="font-size:16px"></div><small class="s" style="display:block;font-size:13px;opacity:.75"></small></div></div>`;
      const box = el.firstElementChild as HTMLElement | null;
      box?.addEventListener('click', (ev) => { ev.stopPropagation(); g.hud.toggle(STORY_PANEL.kind, 'story'); });
    },
    update(el) {
      const box = el.firstElementChild as HTMLElement | null;
      if (!box) return;
      const f = F();
      const on = f.intro !== 'none';
      const title = f.ending === 'done' ? '토토는 별나라에서 반짝반짝 🌟' : f.intro === 'fell' ? '별똥별이 떨어졌어요!' : `⭐ ${OBJECTIVE}`;
      const sub = f.intro === 'met' && f.ending !== 'done' ? `${f.chapter}장 ${chapterDef(f.chapter).name} · ${nextStep()}` : nextStep();
      const sig = `${on}|${title}|${sub}`;
      if (sig === chipSig) return;
      chipSig = sig;
      box.style.display = on ? '' : 'none';
      (box.querySelector('.t') as HTMLElement).textContent = title;
      (box.querySelector('.s') as HTMLElement).textContent = sub;
    },
  });

  g.hud.registerMapLayer({
    id: 'story', order: 60,
    draw(g2, toPx, scale, world) {
      if (world !== 'earth') return;
      const f = F();
      const tg = target();
      const now = clock;
      g2.save();
      g2.textAlign = 'center';
      g2.textBaseline = 'middle';
      if (f.intro === 'met' && f.ending !== 'done') {
        const [tx, ty] = toPx(totoPos.x, totoPos.z);
        g2.font = `${Math.max(13, Math.min(20, 16 * Math.sqrt(scale * 6)))}px sans-serif`;
        g2.fillStyle = '#fffaf2ee';
        g2.beginPath(); g2.arc(tx, ty, 11, 0, Math.PI * 2); g2.fill();
        g2.fillText('🐰', tx, ty + 1);
      }
      if (tg) {
        const [x, y] = toPx(tg.x, tg.z);
        const pulse = 1 + 0.18 * Math.sin(now * 4);
        const r = 13 * pulse;
        g2.fillStyle = '#ffe58a55';
        g2.beginPath(); g2.arc(x, y, r * 1.9, 0, Math.PI * 2); g2.fill();
        g2.fillStyle = '#ffd34a';
        g2.strokeStyle = '#ffffff';
        g2.lineWidth = 3;
        g2.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
          const rr = i % 2 === 0 ? r : r * 0.45;
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          if (i === 0) g2.moveTo(px, py); else g2.lineTo(px, py);
        }
        g2.closePath(); g2.fill(); g2.stroke();
        g2.font = '14px Jua, system-ui, sans-serif';
        g2.lineWidth = 4;
        g2.strokeStyle = '#4a3b2acc';
        g2.fillStyle = '#fff8e8';
        const label = `다음: ${tg.name}`;
        g2.strokeText(label, x, y + r + 14);
        g2.fillText(label, x, y + r + 14);
      }
      g2.restore();
    },
  });

  // 주인 평소 대사에 체인 힌트 섞기(npc 서비스가 생기면 한 번)
  let hinted = false;
  const addHints = () => {
    const npc = g.ext.npc as { addDialog?: (id: string, lines: string[]) => void } | undefined;
    if (hinted || !npc?.addDialog) return;
    hinted = true;
    for (const c of CHAINS) { try { npc.addDialog(c.owner, [c.hint]); } catch { /* 없음 */ } }
  };

  // ───────────── 매 프레임 ─────────────
  let introAcc = 0;
  /** 이번 프레임 연출 카메라 자리 */
  const computeShot = () => {
    const c = cut;
    if (!c) { shot = null; return; }
    const p = g.player.pos;
    const pf = { x: p.x, y: p.y, z: p.z };
    if (c.kind === 'intro') {
      if (!c.data.near) { shot = null; return; }
      // 구덩이 위 하늘을 조금 올려다본다 — 별똥별이 화면 위쪽에서 비스듬히 들어와 구덩이에 꽂힌다
      const pos = behind(pf, c.at, 6.5, 2.0, 1.4);
      const dh = Math.hypot(pos.x - c.at.x, pos.z - c.at.z);
      const up = c.t < INTRO_T.fall ? dh * 0.2 : dh * 0.2 * Math.max(0, 1 - (c.t - INTRO_T.fall) / 1.2) + 0.8;
      const look = c.at.clone().setY(c.at.y + up);
      const age = c.t - INTRO_T.fall;
      if (age > 0 && age < 0.6) pos.y += Math.sin(age * 70) * 0.12 * (1 - age / 0.6);
      setShot(pos, look);
    } else if (c.kind === 'meet') {
      const look = totoBox.visible ? totoPos.clone().setY(totoPos.y + 0.45) : c.at.clone().setY(c.at.y + 0.6);
      setShot(behind(pf, c.at, 2.6, 1.5, 3.2), look);
    } else if (c.kind === 'restore') {
      const dx = p.x - totoPos.x, dz = p.z - totoPos.z, d = Math.hypot(dx, dz) || 1;
      const x = totoPos.x + (dx / d) * 4.2, z = totoPos.z + (dz / d) * 4.2;
      setShot(new THREE.Vector3(x, Math.max(totoPos.y, g.groundAt(x, z)) + 1.5, z), totoPos.clone().setY(totoPos.y + 1.1));
    } else if (c.kind === 'ending' && stage) {
      const s = stage;
      const ry = s.rocket.root.position.y;
      const look = new THREE.Vector3(s.base.x, Math.max(s.base.y + 3.2, ry + 1.2), s.base.z);
      if (c.t >= ENDING_T.star) look.y = Math.max(look.y, s.flash.position.y);
      setShot(behind(pf, s.base, 9, 1.6, 2.4), look);
    }
  };
  // 카메라 리그 뒤(엔진 훅)에서 연출 카메라를 덮어쓴다 — 부드럽게 들어가고 나온다
  ctx.onUpdate((_t, dt) => {
    if (!shot) return;
    const cam = ctx.camera;
    shot.k = Math.min(1, shot.k + (dt > 0 ? dt * 2.5 : 1));
    const k = easeOut(shot.k);
    camPos.lerp(shot.pos, dt > 0 ? Math.min(1, dt * 4) : 1);
    camLook.lerp(shot.look, dt > 0 ? Math.min(1, dt * 5) : 1);
    if (shot.k < 1) { cam.position.lerp(camPos, k); } else cam.position.copy(camPos);
    cam.lookAt(camLook);
  });

  const update = (_t: number, dt: number) => {
    clock += dt;
    addHints();
    const f = F();
    const p = g.player.pos;

    // 연출 진행
    if (cut) {
      if (!holdCut) cut.t += dt;
      const c = cut;
      if (c.kind === 'intro') {
        poseIntro(c.t, c.at);
        if (c.t >= INTRO_T.fall && c.t - dt < INTRO_T.fall) { sfx('rock-break', { vol: 1 }); sfx('shiny'); }
        if (c.t >= INTRO_T.end) endCut();
      } else if (c.kind === 'meet') {
        poseMeet(c.t, c);
        if (c.t >= MEET_T.pop && c.t - dt < MEET_T.pop) { sfx('balloon-pop'); sfx('shiny'); }
        if (c.t >= MEET_T.land && c.t - dt < MEET_T.land) { sfx('jump'); bubble.say('삐융!'); }
        if (c.t >= MEET_T.end) endCut();
      } else if (c.kind === 'restore') {
        poseRestore(c.t);
        if (c.t >= 3.2 && c.t - dt < 3.2) { sfx('achievement'); sfx('shiny'); }
        if (c.t >= RESTORE_T.end) endCut();
      } else if (c.kind === 'ending') {
        poseEnding(c.t);
        if (c.t >= ENDING_T.end) endCut();
      }
      computeShot();
    }

    // 인트로 시작 조건(0.5초마다)
    introAcc += dt;
    if (introAcc >= 0.5) {
      introAcc = 0;
      if (f.intro === 'none') {
        if (!g.env) noEnvWait += 0.5;
        const nearHome = Math.hypot(p.x - CR.x, p.z - CR.z) < 900;
        const busy = !!cut || g.player.locked || !!g.player.mounted || !!g.hud.current() || !nearHome;
        if (introReady({ intro: f.intro, earth: g.world === 'earth' && !g.focusOverride, night: g.env ? g.env.tod === 'night' : null, waited: noEnvWait, busy }, INTRO_NO_ENV_SEC)) startIntro();
      }
    }

    // 엔딩 대기(발사 뒤)
    if (sinceLaunch >= 0) sinceLaunch += dt;
    if (ending) { const e = ending; ending = null; runEnding(e); }
    if (f.ending === 'armed' && !endingPlaying && !cut) runEnding({ kind: 'tick', world: g.world, sinceLaunch: Math.max(0, sinceLaunch) });

    // 구덩이(인트로 뒤엔 늘 있음) — 연출 밖에서
    if (!cut || (cut.kind !== 'intro' && cut.kind !== 'meet')) {
      if (f.intro === 'none') crater.set(0, 0, clock);
      else crater.set(1, f.intro === 'met' ? 1 : 0, clock);
    }

    // 토토
    const totoOn = g.world === 'earth' && f.intro === 'met' && f.ending !== 'done' && cut?.kind !== 'ending';
    const dist = Math.hypot(p.x - totoPos.x, p.z - totoPos.z);
    if (!cut || cut.kind === 'restore') {
      totoBox.visible = totoOn && dist < TOTO_VIS;
      if (totoBox.visible) {
        // 되살린 별 연출(가까이 오면 한 번)
        if (restorePending && dist < 25 && !cut) { restorePending = false; cut = { kind: 'restore', t: 0, at: totoPos.clone(), data: {} }; }
        if (!cut) updateToto(dt, dist);
      }
    }
    totoBox.position.copy(totoPos);
    totoBox.rotation.y = totoYaw;
    toto.root.rotation.y = 0;
    if (!cut || cut.kind !== 'meet') bubble.say(clock < sayUntil ? sayText : null);

    // 수평선 빛기둥
    const tg = g.world === 'earth' && !g.focusOverride ? target() : null;
    if (tg) {
      const d = Math.hypot(p.x - tg.x, p.z - tg.z);
      const color = f.restored ? '#ffd36b' : f.intro === 'fell' ? '#ffd0f0' : chapterDef(f.chapter).color;
      beacon.set(!cut || cut.kind === 'restore', tg.x, I.heightAt(tg.x, tg.z), tg.z, d, clock, color);
    } else beacon.set(false, 0, 0, 0, 0, clock, '#fff');

    // 판정
    evalAcc += dt;
    if (dirty && evalAcc >= EVAL_EVERY) check();
    else if (evalAcc >= 2) check(); // 박물관 골격·기증처럼 이벤트 없이 바뀌는 것도 가끔
  };
  const updateToto = (dt: number, dist: number) => {
    const p = g.player.pos;
    // 깡총깡총 산책: 집 둘레 6 m 안에서, 플레이어가 가까우면 쳐다본다
    nextWander -= dt;
    if (hopT < 0 && nextWander <= 0) {
      const r = ctx.rng(`story:wander:${wanderN++}`);
      const a = r() * Math.PI * 2, rr = 1 + r() * 5;
      hopFrom.copy(totoPos);
      hopTo.set(home.x + Math.cos(a) * rr, 0, home.z + Math.sin(a) * rr);
      if (Math.hypot(hopTo.x - CR.x, hopTo.z - CR.z) < 3.4) hopTo.set(home.x, 0, home.z); // 구덩이 안으로는 안 들어간다
      hopTo.y = I.heightAt(hopTo.x, hopTo.z);
      hopDur = 0.45;
      hopT = 0;
      nextWander = 3 + r() * 4;
    }
    let hop = 0;
    if (hopT >= 0) {
      // 몇 번 깡총거리며 간다(한 번에 0.8 m)
      const len = hopFrom.distanceTo(hopTo);
      const n = Math.max(1, Math.ceil(len / 0.8));
      const total = n * hopDur;
      hopT += dt;
      const u = clamp01(hopT / total);
      totoPos.lerpVectors(hopFrom, hopTo, u);
      totoPos.y = I.heightAt(totoPos.x, totoPos.z);
      hop = Math.abs(Math.sin(Math.PI * u * n));
      if (len > 0.05) totoYaw = Math.atan2(hopTo.x - hopFrom.x, hopTo.z - hopFrom.z);
      if (u >= 1) hopT = -1;
    }
    if (dist < 7 && hopT < 0) {
      const want = Math.atan2(p.x - totoPos.x, p.z - totoPos.z);
      let d = want - totoYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      totoYaw += d * Math.min(1, dt * 5);
    }
    const f = F();
    if (dist < 7 && clock > sayUntil + 6 && hopT < 0) {
      const r = ctx.rng(`story:idle:${Math.floor(clock / 7)}`);
      if (r() < 0.5) say(TOTO_LINES.idle[Math.floor(r() * TOTO_LINES.idle.length)], 2.2);
      else sayUntil = clock; // 다음 기회는 6초 뒤
    }
    toto.animate(clock, { hop, happy: clock < sayUntil, wave: dist < 4 && clock < sayUntil, glow: f.restored ? 1.8 : 1 });
  };
  g.onUpdate(update);

  // 발사 중 다른 세계로 넘어갔다 돌아와도 무대가 남지 않게
  g.onWorld((w) => {
    if (cut?.kind === 'ending' && stage) {
      const want = cut.data.space ? 'space' : 'earth';
      if (w !== want) endCut(true);
    }
    if (cut && cut.kind !== 'ending' && w !== 'earth') endCut(true);
  });

  // ───────────── 공개 API ─────────────
  const api = {
    chapter: () => F().chapter,
    pieces,
    restored: () => F().restored,
    ended: () => F().ending === 'done',
    met: () => F().intro === 'met',
    chains: () => chainRows().map((r) => ({ no: r.def.no, owner: r.def.owner, status: r.status, have: r.p.have, need: r.p.need })),
    target,
    totoPos: () => (F().intro === 'met' ? { x: totoPos.x, y: totoPos.y, z: totoPos.z } : null),
    playing: () => cut?.kind ?? null,
  };
  g.ext.story = api;

  // ───────────── 디버그 ─────────────
  let introDbg = false;
  if (typeof window !== 'undefined') {
    (window as unknown as { __story?: unknown }).__story = {
      ...api,
      state: () => JSON.parse(JSON.stringify(F())) as StoryFlags,
      /** 별똥별 인트로를 지금 시작(아직이면) */
      intro: () => { if (F().intro !== 'none') F().intro = 'none'; return startIntro(); },
      /** 인트로 t 초 모습으로 멈춰 두기(촬영용 — dt 0 에서도) */
      introAt: (t: number) => {
        // 처음 부르면 지금 자리에서 새로 시작(별똥별 방향이 지금 시점에 맞게), 이어서 부르면 시간만 옮긴다
        if (!cut || cut.kind !== 'intro' || !introDbg) { if (cut) endCut(true); F().intro = 'none'; startIntro(); introDbg = true; }
        if (cut) { cut.t = t; poseIntro(t, cut.at); }
        return cut?.t ?? null;
      },
      /** 토토 만나기 연출(구덩이 옆으로 옮겨서) */
      meet: (t?: number) => {
        const f = F();
        if (f.intro === 'none') { f.intro = 'fell'; f.crater = { x: CR.x, z: CR.z }; }
        if (f.intro === 'met') return false;
        if (cut) endCut(true);
        g.player.teleport(CR.x + 6, CR.z + 3);
        const ok = startMeet();
        if (ok && cut && typeof t === 'number') { cut.t = t; poseMeet(t, cut); }
        return ok;
      },
      fire: (e: GameEvent) => { st.emit(e as never); check(); return api.chains(); },
      /** 체인 no 별조각 바로 주기 */
      grant: (no: number) => { const d = CHAIN_BY_NO.get(no); if (!d) return false; const ok = grant(d); check(); return ok; },
      /** 체인 no 조건을 채운다(이벤트를 흉내 내서) */
      finish: (no: number) => {
        const d = CHAIN_BY_NO.get(no);
        if (!d) return null;
        const f = F();
        const gl = d.goal;
        if (gl.kind === 'secret') st.emit({ type: 'secret-found', id: gl.secret });
        else if (gl.kind === 'give') { if (!f.given.includes(gl.item)) f.given.push(gl.item); }
        else if (gl.kind === 'release') st.emit({ type: 'release', species: 'bug-firefly', n: gl.n, where: 'debug' });
        else if (gl.kind === 'secret+skeletons') { st.emit({ type: 'secret-found', id: gl.secret }); }
        else if (gl.kind === 'show-aurora') { if (!f.shown.includes(gl.species)) f.shown.push(gl.species); }
        dirty = true;
        check();
        return statusOf(no);
      },
      /** 별 되살리기 연출(별조각 수와 상관없이 보기) */
      restore: () => { F().restored = true; restorePending = false; if (cut) endCut(true); cut = { kind: 'restore', t: 0, at: totoPos.clone(), data: {} }; return true; },
      /** 엔딩을 지금 이 자리에서 */
      ending: () => { const f = F(); f.restored = true; f.ending = 'armed'; endingPlaying = false; save(); startEnding(); return true; },
      /** 발사 흉내(launch 이벤트) */
      launch: () => { st.emit({ type: 'launch', to: 'moon' }); return F().ending; },
      toto: () => ({ pos: { x: totoPos.x, y: totoPos.y, z: totoPos.z }, visible: totoBox.visible, crater: { ...CR } }),
      goToto: () => { g.player.teleport(totoPos.x + 2.5, totoPos.z + 2.5); g.player.yaw = Math.atan2(totoPos.x - g.player.pos.x, totoPos.z - g.player.pos.z); g.cam.yaw = g.player.yaw; return true; },
      goCrater: () => { g.player.teleport(CR.x + 3, CR.z + 2); g.player.yaw = Math.atan2(CR.x - g.player.pos.x, CR.z - g.player.pos.z); g.cam.yaw = g.player.yaw; return { ...CR }; },
      check: () => { check(); return api.chains(); },
      open: (tab?: string) => g.hud.open(STORY_PANEL.kind, tab ?? 'story'),
      /** 이야기 저장 지우기(처음부터) */
      reset: () => { if (cut) endCut(true); clearStage(); st.flags.story = undefined; fl = null; F(); save(); totoBox.visible = false; return true; },
      cut: () => (cut ? { kind: cut.kind, t: cut.t } : null),
      /** 연출 시간을 멈춘다(true) / 다시 흐르게(false) — introAt·meet(t) 와 같이 촬영용 */
      hold: (on = true) => { holdCut = !!on; return holdCut; },
      /** 지금 연출을 t 초로(멈춤과 같이) */
      seek: (t: number) => { if (cut) cut.t = Math.max(0, t); return cut?.t ?? null; },
    };
  }

  return group;
}
