// NPC 서비스: 말 걸기 흐름(첫 만남 → 평소 · 시간대는 game.env 에서 매번) · 타자기 말풍선 진행 + talk-blip ·
// 대화가 끝나면 상점/박물관 열기(또는 주민 메뉴 'npc' 창: 대화·선물·부탁) · 우정(flags.npc) · 선물 · 생일 ·
// 부탁 '!' 다시 켜기(econ.requestsFor) · 반응(launch-wave 손 흔들기, clap/★4 잡기 박수).
// 모델·말풍선 그리기는 모른다 — characters.ts 가 NpcActor(위치·말풍선·몸짓)를 등록한다. 그래서 DOM 없이 테스트된다.
//
// game.ext.npc (주인: characters) = {
//   list(): Array<{id, name, island, kind:'facility'|'resident', birthday}>   — economy 부탁·게시판이 읽는다
//   talk(id): string[]            — 그 NPC 와 대화 시작(말풍선 쪽들을 돌려준다, 없으면 [])
//   friendship(id): number        — 우정 0..100(하트 = 20 마다 한 칸) · hearts(id): 0..5
//   birthdayOf(id): number|null   — 생일(게임 날 % 28)
//   spawnAt(id, x, z): boolean    — 그 NPC 를 옮긴다(이벤트·이야기용)
//   addDialog(id, lines): void    — 평소 대사 더하기({c} = 말버릇)
//   gift(id, bagKey): {delta, line}|null · name(id) · talking(): id|null · homes(주민 집 자리, characters.ts 가 채움)
//   ── P1(wave 5) ──
//   addDialog(id, lines, o?: {key?, pin?})  — key 가 같으면 바꿔 끼운다, pin = 말 걸 때마다 먼저(이야기 체인). clearDialog(id, key?)
//   owners(): Array<{island, id, name}>      — 섬 주인 7(GDD 4.6.2)
//   moveIn(id|undefined, island): id|false    — 주민 이사(islanddev ④ · 초대권). id 가 없으면 nextResident(island)
//   nextResident(island): id|null · candidates(island): id[] · capacity(island): {used, cap, left}
//   residents(): Array<{id, name, island|null, movable}> — 이주민 후보 16 + 원래 주민
//   proposal(id): {state:'none'|'pending'|'moved'|'done', island?} · acceptMove(id) · declineMove(id)
//   appraise(fosId?): 프로 박사 화석 감정(300 코인, P0 1/5) → {id, dino, part, missing[]}|null · appraisable(): id[]
// 이벤트(이 모듈이 낸다): npc-talk, befriend, gift, open-shop, open-museum, open-craft, open-panel(npc 창),
//   npc-movein {npc, island, from}, npc-propose {npc, island|null}, appraise {id, dino, part, cost}
// }
import type { Game } from '../../core/game';
import { onEvent } from '../../core/events';
import { PLACES } from '../../core/island';
import { ISLAND_CAP, ISLAND_OWNERS, ROSTER16, type NpcAfter, type NpcSocial } from './data';
import {
  selectDialog, migrateNpcFlags, emptyFlag, addFriend, talkGain, requestGain, giftDelta, giftsToday, recordGift,
  giftCategory, giftable, giftReaction, heartsOf, isBirthdayToday, birthdayText, GIFT_CAT_NAME, GIFTS_PER_DAY,
  typedCount, pageDuration, glyphs, isBlipChar, blipPitch, paginate, josa, TYPE_CPS, F_MAX, MEMO_MAX,
  PROP_PENDING, PROP_MOVED, PROP_DONE,
  type NpcFlag, type TalkDef,
} from './dialog';
import {
  checkMoveIn, nextResident as pickNext, candidates as pickCandidates, capacityLeft, population, proposalIsland, islandOf,
  MOVE_WHY_TEXT, type ResidentRow,
} from './migration';

/** NPC 한 명(대사·성격) */
export interface NpcInfo {
  id: string;
  name: string;
  island: string;
  accent: string;
  kind: 'facility' | 'resident';
  social: NpcSocial;
  talk: TalkDef;
  after: NpcAfter;
  /** 새 이주민(moveIn 전엔 어느 섬에도 없다) */
  migrant?: boolean;
  /** 섬 주인이면 그 섬 */
  owner?: string;
}

/** 섬 이름(geo 가 없을 때) */
const ISLAND_KO: Record<string, string> = {
  home: '말랑섬', dino: '쿵쿵공룡섬', ice: '솜눈섬', mushroom: '반딧불버섯섬', coral: '산호빛섬', desert: '모래시계섬', launch: '별똥별섬',
};
/** 프로 박사 감정료(GDD 3.10.1 P1) */
export const APPRAISE_COST = 300;
const PART_KO: Record<string, string> = { skull: '머리뼈', head: '머리뼈', body: '몸뼈', tail: '꼬리뼈', leg: '다리뼈', claw: '발톱' };
/** 사진 선물 아이템 id(우정 100) */
export const photoItem = (id: string) => `f_photo_${id}`;

/** 몸짓 */
export interface NpcReaction { kind: 'wave' | 'clap' | 'happy'; until: number; x?: number; z?: number }

/** 세계에 서 있는 NPC 한 자리(같은 NPC 가 여러 자리에 설 수 있다 — 펭박사) */
export interface NpcActor {
  /** 자리마다 고유('npc_peng@pier') */
  key: string;
  /** NPC id */
  id: string;
  pos(): { x: number; y: number; z: number };
  /** 지금 세계에 있나(청크가 만들었나) */
  present(): boolean;
  /** 말풍선: page 앞 shown 글자. page=null 이면 지운다 */
  say(page: string | null, shown: number): void;
  setTalking?(on: boolean): void;
  setNews?(on: boolean): void;
  react?(r: NpcReaction): void;
  moveTo?(x: number, z: number): void;
}

interface Conv {
  actor: NpcActor;
  info: NpcInfo;
  pages: string[];
  /** 쪽마다 머무는 시간(없으면 pageDuration) */
  holds?: number[];
  i: number;
  t0: number;
  shown: number;
  /** 끝나면 after 를 실행하나 */
  follow: boolean;
}

export interface NpcServiceOpts {
  infos: NpcInfo[];
  rng: (key: string) => () => number;
  /** env 가 없을 때 시간대 */
  todFallback?: () => string;
  /** 말 걸 수 있는 거리(m) */
  talkDist?: number;
  /** 이사: 그 섬의 빈 집 자리(characters.ts 가 지형에서 찾는다) */
  place?(id: string, island: string): { x: number; z: number } | null;
  /** 이사: 세계에 세우기(새 주민 addHome · 옛 주민 relocate) */
  onMove?(id: string, island: string, x: number, z: number, from: string | null): void;
  /** 플레이어가 지금 선 섬(제안 섬 고르기) */
  here?(): string | null;
}

const TALK_DIST = 2.6;
const CANCEL_DIST = 9;
const CLAP_R = 15;

export function createNpcService(game: Game, o: NpcServiceOpts) {
  const st = game.state;
  const infos = new Map(o.infos.map((i) => [i.id, i]));
  const actors = new Map<string, NpcActor>();
  /** addDialog 로 더한 대사 묶음(key 로 바꿔 끼운다, pin = 늘 먼저) */
  const extra = new Map<string, Array<{ key: string | null; lines: string[]; pin: boolean }>>();
  const extraOf = (id: string, pin: boolean) => (extra.get(id) ?? []).filter((e) => e.pin === pin).flatMap((e) => e.lines);
  const lastLine = new Map<string, string | null>();
  let conv: Conv | null = null;
  let now = 0;

  // ── 저장: flags.npc {id: {f, met, last, gifts}} — 옛 id 옮기기 ──
  {
    const m = migrateNpcFlags(st.flags.npc);
    st.flags.npc = m.flags;
    if (m.changed) st.save();
  }
  const F = () => (st.flags.npc ??= {}) as Record<string, NpcFlag>;
  const flagOf = (id: string): NpcFlag => F()[id] ?? emptyFlag();
  const putFlag = (id: string, f: NpcFlag) => { F()[id] = f; st.save(); };

  const day = (): number => {
    try { const d = game.econ?.day?.(); if (typeof d === 'number' && Number.isFinite(d)) return d; } catch { /* 경제 없음 */ }
    return Math.floor(game.env?.day ?? 0);
  };
  // 시간대는 매번 env 에서(ctx.tod 는 시작 값에 멈춰 있을 수 있다)
  const tod = (): string => game.env?.tod ?? o.todFallback?.() ?? 'day';
  const emit = (e: { type: string; [k: string]: unknown }) => st.emit(e as Parameters<typeof st.emit>[0]);
  const toast = (s: string) => { try { game.hud.toast(s); } catch { game.ui.toast(s); } };

  /** 우정 더하기 + 하트가 늘면 befriend · 100 이 되면(한 번만) 이사 제안 + 사진 선물 */
  function gain(id: string, delta: number) {
    const step = addFriend(flagOf(id), delta);
    putFlag(id, step.flag);
    if (step.heartsAfter > step.heartsBefore) {
      emit({ type: 'befriend', id, hearts: step.heartsAfter, kind: 'npc' });
      const nm = infos.get(id)?.name ?? id;
      toast(`💕 ${nm}와(과) 더 친해졌어요! ${'♥'.repeat(step.heartsAfter)}${'♡'.repeat(5 - step.heartsAfter)}`);
    }
    if (step.after >= F_MAX && !flagOf(id).prop) propose(id);
    return step;
  }

  // ── 이주(GDD 3.10.1 이주민 16 · 4.7 ④) ──
  const rosterIdx = new Map(ROSTER16.map((r, i) => [r.id, r]));
  /** 인구에 세는 사람: 주민 + 이주민 + 몽실(말랑섬 주인이자 첫 주민) */
  const rows: ResidentRow[] = [...infos.values()]
    .filter((i) => i.kind === 'resident' || rosterIdx.has(i.id))
    .map((i) => ({ id: i.id, base: i.migrant ? null : i.island, movable: rosterIdx.has(i.id), fixed: !!rosterIdx.get(i.id)?.fixed }))
    // 후보 16 순서가 먼저(다음 주민 고르기가 GDD 순서를 따른다)
    .sort((a, b) => (a.movable && b.movable ? ROSTER16.findIndex((r) => r.id === a.id) - ROSTER16.findIndex((r) => r.id === b.id) : Number(b.movable) - Number(a.movable)));
  const flOf = (id: string) => F()[id];
  const islandName = (isl: string) => { try { return game.geo?.islandName?.(isl) || ISLAND_KO[isl] || isl; } catch { return ISLAND_KO[isl] ?? isl; } };
  /** 지금 사는 섬(이주민은 오기 전 null, 시설 NPC 는 자기 섬) */
  const livesOn = (id: string): string | null => {
    const r = rows.find((x) => x.id === id);
    if (r) return islandOf(r, flOf);
    return infos.get(id)?.island ?? null;
  };
  const hereIsland = (): string | null => {
    try { return o.here?.() ?? game.geo?.zoneAt?.(game.player.pos.x, game.player.pos.z)?.island ?? null; } catch { return null; }
  };

  /** 주민 이사. 성공하면 그 주민 id, 안 되면 false */
  function moveIn(id: string | null | undefined, island: string): string | false {
    const who = id || pickNext(rows, flOf, island, ISLAND_CAP);
    if (!who) return false;
    const chk = checkMoveIn(rows, flOf, who, island, ISLAND_CAP);
    if (!chk.ok) return false;
    if (chk.already) return who;
    const at = o.place?.(who, island) ?? null;
    if (o.place && !at) return false;
    const fl = flagOf(who);
    const next: NpcFlag = { ...fl, home: island };
    if (at) { next.hx = +at.x.toFixed(2); next.hz = +at.z.toFixed(2); }
    // 제안으로 온 이사면 끝난 걸로
    if (fl.prop === PROP_PENDING) next.prop = PROP_MOVED;
    putFlag(who, next);
    if (at) {
      try { o.onMove?.(who, island, at.x, at.z, chk.from); } catch (e) { console.error('[characters] moveIn', e); }
    }
    emit({ type: 'npc-movein', npc: who, island, from: chk.from });
    // 새집 인사(말풍선 한 줄)
    const a = actorFor(who), info = infos.get(who);
    if (a && info) {
      a.react?.({ kind: 'happy', until: now + 3 });
      if (a.present()) startConv(a, info, paginate(`${islandName(island)}에 이사 왔어! 잘 부탁해, ${info.talk.catchphrase}!`), false);
    }
    return who;
  }

  /** 기념 사진 선물(가방 → 꽉 차면 보관함 → 그래도 안 되면 바로) */
  function givePhoto(id: string) {
    const item = photoItem(id);
    let n = 0;
    try { n = game.econ?.give?.(item, 1, 'npc-photo', { silent: true }) ?? -1; } catch { n = -1; }
    if (n > 0) return true;
    try { if (n === 0 && game.econ?.storage?.put) { game.econ.storage.put(item, 1); return true; } } catch { /* 보관함 없음 */ }
    st.addItem(item, 1);
    return true;
  }

  /** 우정 100: 사진 선물 + (옮길 수 있는 주민이면) 이사 제안 — 한 번만 */
  function propose(id: string): boolean {
    const info = infos.get(id);
    const fl = flagOf(id);
    if (!info || fl.prop) return false;
    const r = rows.find((x) => x.id === id);
    const target = r && livesOn(id) ? proposalIsland(r, flOf, hereIsland(), ISLAND_CAP, rows) : null;
    givePhoto(id);
    putFlag(id, { ...flagOf(id), photo: true, prop: target ? PROP_PENDING : PROP_DONE, ...(target ? { pto: target } : {}) });
    emit({ type: 'npc-propose', npc: id, island: target });
    const nm = info.name;
    try {
      game.hud.card({
        title: target ? `💌 ${nm}의 이사 제안!` : `📸 ${nm}의 선물!`,
        body: target
          ? `"우리 더 가까이 살래? ${islandName(target)}로 이사 가고 싶어!"<br>📸 ${nm}${josa(nm, '이', '가')} 기념 사진을 줬어요 — ${nm}에게 말 걸어 대답해 줘요`
          : `"제일 친한 친구야! 이 사진 꼭 간직해 줘, ${info.talk.catchphrase}!"<br>📸 기념 사진을 받았어요`,
        icon: target ? '💌' : '📸', color: '#ff9fb8', ms: 6500,
      });
    } catch { toast(`📸 ${nm}에게서 기념 사진을 받았어요!`); }
    actorFor(id)?.react?.({ kind: 'happy', until: now + 3 });
    return true;
  }
  function proposalOf(id: string): { state: 'none' | 'pending' | 'moved' | 'done'; island?: string } {
    const f = flagOf(id);
    const state = f.prop === PROP_PENDING ? 'pending' : f.prop === PROP_MOVED ? 'moved' : f.prop === PROP_DONE ? 'done' : 'none';
    return f.pto ? { state, island: f.pto } : { state };
  }
  function acceptMove(id: string): string | false {
    const f = flagOf(id);
    if (f.prop !== PROP_PENDING || !f.pto) return false;
    const chk = checkMoveIn(rows, flOf, id, f.pto, ISLAND_CAP);
    if (!chk.ok) { toast(MOVE_WHY_TEXT[chk.why]); return false; }
    const r = moveIn(id, f.pto);
    if (r) {
      putFlag(id, { ...flagOf(id), prop: PROP_MOVED });
      toast(`🏡 ${infos.get(id)?.name ?? id}${josa(infos.get(id)?.name ?? id, '이', '가')} ${islandName(f.pto)}로 이사 와요!`);
    }
    return r;
  }
  function declineMove(id: string): boolean {
    const f = flagOf(id);
    if (f.prop !== PROP_PENDING) return false;
    putFlag(id, { ...f, prop: PROP_DONE });
    return true;
  }

  // ── 프로 박사 화석 감정 ──
  type FossilApi = { parse?: (id: string) => { dino: string; part: string } | null; partsOf?: (dino: string) => string[]; skeletonOf?: (id: string) => string | null };
  const fossils = () => (game.ext as Record<string, unknown>).fossils as FossilApi | undefined;
  const parseFos = (id: string): { dino: string; part: string } | null => {
    try { const p = fossils()?.parse?.(id); if (p) return p; } catch { /* 공룡 모듈 없음 */ }
    const m = /^fos_([a-z0-9]+)_([a-z]+)$/.exec(id);
    return m ? { dino: m[1], part: m[2] } : null;
  };
  const appraised = (): string[] => flagOf('npc_pro').memo ?? [];
  /** 가방에서 감정할 수 있는 화석 조각(아직 감정 안 한 것) */
  const appraisable = () => Object.keys(st.bag).filter((k) => k.startsWith('fos_') && (st.bag[k] ?? 0) > 0 && !!parseFos(k) && !appraised().includes(k));
  const appraiseCost = () => ((game.econ?.p0 ?? false) ? Math.ceil(APPRAISE_COST / 5) : APPRAISE_COST);
  function appraise(fosId?: string): { id: string; dino: string; part: string; missing: string[]; cost: number } | null {
    const target = fosId ?? appraisable()[0];
    const info = infos.get('npc_pro');
    const say = (line: string) => { const a = actorFor('npc_pro'); if (a && info && a.present()) startConv(a, info, paginate(line), false); };
    if (!target || !st.has(target) || !parseFos(target)) { say('흠흠, 감정할 뼈 조각이 없구먼. 공룡섬 X 자리를 파 보게!'); return null; }
    if (appraised().includes(target)) { say('흠흠, 그건 이미 감정서를 붙였다네.'); return null; }
    const cost = appraiseCost();
    let paid = false;
    try { paid = game.econ ? !!game.econ.spend({ coins: cost }, 'appraise') : st.coins >= cost && (st.addCoins(-cost), true); } catch { paid = false; }
    if (!paid) { toast(`🪙 감정료 ${cost.toLocaleString('ko-KR')}코인이 필요해요`); say('흠흠, 학문엔 감정료가 든다네…'); return null; }
    const p = parseFos(target)!;
    const memo = [...appraised(), target].slice(-MEMO_MAX);
    putFlag('npc_pro', { ...flagOf('npc_pro'), memo });
    let parts: string[] = [];
    try { parts = fossils()?.partsOf?.(p.dino) ?? []; } catch { parts = []; }
    const missing = parts.filter((q) => q !== target && !st.has(q));
    const skel = fossils()?.skeletonOf?.(target) ?? `fos_${p.dino}`;
    const dinoName = (st.species.get(skel)?.name ?? st.byGdd?.(skel)?.name ?? p.dino).replace(/\s*(화석|골격)$/, '');
    const partName = PART_KO[p.part] ?? p.part;
    emit({ type: 'appraise', id: target, dino: p.dino, part: p.part, cost });
    try {
      game.hud.card({
        title: `🔍 감정 결과 — ${dinoName}의 ${partName}!`,
        body: [
          `🦴 이 조각은 <b>${dinoName}</b>의 <b>${partName}</b>이었어요`,
          missing.length ? `🧩 아직 못 찾은 조각: ${missing.map((q) => PART_KO[parseFos(q)?.part ?? ''] ?? q).join(' · ')}` : parts.length ? '🏛️ 세 조각이 다 모였어요! 박물관에 골격을 기증해 봐요' : '',
          `🪙 감정료 ${cost.toLocaleString('ko-KR')}`,
        ].filter(Boolean).join('<br>'),
        icon: '🦴', color: '#7cc96b', ms: 5600,
      });
    } catch { toast(`🔍 ${dinoName}의 ${partName}!`); }
    say(`흠흠! 이건 ${dinoName}의 ${partName}일세! 귀한 걸 가져왔구먼.`);
    return { id: target, dino: p.dino, part: p.part, missing, cost };
  }

  // ── 자리 ──
  function register(a: NpcActor) {
    actors.set(a.key, a);
    return () => { if (actors.get(a.key) === a) actors.delete(a.key); };
  }
  const actorsOf = (id: string) => [...actors.values()].filter((a) => a.id === id);
  const dist2 = (a: NpcActor) => { const p = a.pos(), q = game.player.pos; return (p.x - q.x) ** 2 + (p.z - q.z) ** 2; };
  /** 그 NPC 의 자리 중 플레이어와 가장 가까운 것(있는 것 먼저) */
  function actorFor(id: string): NpcActor | null {
    const list = actorsOf(id).sort((a, b) => Number(b.present()) - Number(a.present()) || dist2(a) - dist2(b));
    return list[0] ?? null;
  }
  function nearest(maxD: number): NpcActor | null {
    let best: NpcActor | null = null, bd = maxD * maxD;
    const py = game.player.pos.y;
    for (const a of actors.values()) {
      if (!a.present()) continue;
      const d = dist2(a);
      if (d < bd && Math.abs(a.pos().y - py) < 2) { bd = d; best = a; }
    }
    return best;
  }

  // ── 대화 ──
  function rocket(): { count: number; blueprint: boolean } | null {
    try { const r = game.econ?.rocket?.(); return r ? { count: r.count ?? 0, blueprint: !!r.blueprint } : null; } catch { return null; }
  }
  function hotNames(): string[] {
    try {
      const hot = game.econ?.market?.()?.hot ?? [];
      return hot.map((h) => st.species.get(h)?.name ?? st.byGdd?.(h)?.name ?? '').filter(Boolean);
    } catch { return []; }
  }
  const hasRaft = () => { try { return !!game.econ?.isUnlocked?.('v:raft'); } catch { return false; } };
  /** 집 증축 단계(house:1..4 해금) */
  const houseStage = () => { let n = 0; try { for (let k = 1; k <= 4; k++) if (game.econ?.isUnlocked?.(`house:${k}`)) n = k; } catch { n = 0; } return n; };

  function stopConv(follow: boolean) {
    const c = conv;
    if (!c) return;
    conv = null;
    c.actor.say(null, 0);
    c.actor.setTalking?.(false);
    if (follow && c.follow) runAfter(c.info);
  }
  function openRequests(id: string): Array<{ id: string; text?: string; done: boolean }> {
    try { return ((game.econ?.requestsFor?.(id) ?? []) as Array<{ id: string; text?: string; done: boolean }>).filter((r) => !r.done); } catch { return []; }
  }
  function runAfter(info: NpcInfo) {
    const a = info.after;
    if (a.type === 'open-shop') emit({ type: 'open-shop', shop: a.shop });
    else if (a.type === 'open-museum') emit({ type: 'open-museum' });
    else if (a.type === 'open-craft') emit({ type: 'open-craft' });
    else if (a.type === 'appraise') emit({ type: 'open-panel', kind: 'npc', tab: 'appraise', arg: { id: info.id } });
    else {
      // 이사 제안이 기다리면 이사 탭, 부탁이 있으면 부탁 탭부터
      const tab = flagOf(info.id).prop === PROP_PENDING ? 'move' : openRequests(info.id).length ? 'req' : 'talk';
      game.hud.open('npc', tab, { id: info.id });
    }
  }
  function startConv(actor: NpcActor, info: NpcInfo, pages: string[], follow: boolean, holds?: number[]) {
    if (conv) stopConv(false);
    if (!pages.length) return;
    conv = { actor, info, pages, holds, i: 0, t0: now, shown: -1, follow };
    actor.setTalking?.(true);
    actor.say(pages[0], 0);
  }

  /** 말 걸기(E 또는 __chars.talk). 대화 쪽들을 돌려준다 */
  function talk(id: string, at?: NpcActor): string[] {
    const info = infos.get(id);
    const actor = at ?? actorFor(id);
    if (!info || !actor) return [];
    const d = day();
    const fl = flagOf(id);
    const firstToday = fl.last !== d;
    const pick = selectDialog(info.talk, {
      met: fl.met, firstToday, tod: tod(), rnd: o.rng(`npc:talk:${id}:${d}:${fl.f}:${Math.floor(now * 10)}`),
      last: lastLine.get(id) ?? null, hot: info.talk.role === 'quack' ? hotNames() : undefined,
      rocket: info.talk.role === 'peng' ? rocket() : undefined, hasRaft: info.talk.role === 'mongsil' ? hasRaft() : undefined,
      birthday: isBirthdayToday(info.social.birthday, d), extra: extraOf(id, false), pinned: extraOf(id, true),
      house: info.talk.role === 'tongtong' ? houseStage() : undefined,
    });
    // 부탁 말풍선(econ.requestsFor) · 이사 제안 한 줄
    if (pick.first === false) {
      // 부탁은 부탁 탭이 있는 주민(메뉴)만 — 상점·제작대로 바로 가는 NPC 는 부탁을 들어줄 길이 없다
      const req = info.after.type === 'menu' ? openRequests(id).find((r) => r.text) : undefined;
      if (req?.text) for (const pg of paginate(`부탁이 있어! "${req.text}"`)) pick.pages.push(pg);
      const pr = flagOf(id);
      if (pr.prop === PROP_PENDING && pr.pto) for (const pg of paginate(`저기… ${islandName(pr.pto)}로 이사 가도 될까? 💌`)) pick.pages.push(pg);
    }
    if (pick.line) lastLine.set(id, pick.line);
    // 꽥사장 오늘 첫 대화: HUD 토스트로도 인기 생물(GDD 4.4)
    if (info.talk.role === 'quack' && firstToday) { const h = hotNames()[0]; if (h) toast(`🔥 오늘은 ${h}${josa(h, '이', '가')} 인기래!`); }
    putFlag(id, { ...fl, met: true, last: d });
    const tg = talkGain(fl, d);
    if (tg) gain(id, tg);
    emit({ type: 'npc-talk', npc: id });
    startConv(actor, info, pick.pages, true);
    return pick.pages;
  }

  /** E: 치는 중이면 다 보이게, 다 쳤으면 다음 쪽 */
  function advance() {
    const c = conv;
    if (!c) return;
    const page = c.pages[c.i];
    if (typedCount(page, now - c.t0) < glyphs(page).length) c.t0 = now - glyphs(page).length / TYPE_CPS - 0.01;
    else nextPage(c);
  }
  function nextPage(c: Conv) {
    c.i++;
    c.t0 = now;
    c.shown = -1;
    if (c.i >= c.pages.length) stopConv(true);
  }

  // ── 선물 ──
  function gift(id: string, bagKey: string): { delta: number; line: string } | null {
    const info = infos.get(id);
    if (!info || !giftable(bagKey) || !st.has(bagKey)) return null;
    const d = day();
    const fl = flagOf(id);
    const today = giftsToday(fl, d);
    const bday = isBirthdayToday(info.social.birthday, d);
    const sp = st.species.get(bagKey.split('@')[0]);
    const cat = giftCategory(bagKey, sp);
    const delta = giftDelta(cat, info.social, { birthday: bday, giftsToday: today });
    st.addItem(bagKey, -1);
    putFlag(id, recordGift(fl, d));
    if (delta) gain(id, delta);
    emit({ type: 'gift', npc: id, item: bagKey, delta });
    const line = giftReaction(delta, { birthday: bday, full: today >= GIFTS_PER_DAY, c: info.talk.catchphrase });
    const a = actorFor(id);
    if (a) {
      if (delta > 0) a.react?.({ kind: 'happy', until: now + 2.5 });
      startConv(a, info, paginate(line), false);
    }
    return { delta, line };
  }

  // ── 반응 ──
  let lastClap = -9;
  function clapAt(x: number, z: number) {
    if (now - lastClap < 1.2) return;
    lastClap = now;
    for (const a of actors.values()) {
      if (!a.present()) continue;
      const p = a.pos();
      if ((p.x - x) ** 2 + (p.z - z) ** 2 <= CLAP_R * CLAP_R) a.react?.({ kind: 'clap', until: now + 2.6, x, z });
    }
  }
  function launchWave() {
    const pad = PLACES.launchPad;
    const pp = game.player.pos;
    for (const a of actors.values()) {
      if (!a.present()) continue;
      const p = a.pos();
      const nearPad = (p.x - pad.x) ** 2 + (p.z - pad.z) ** 2 < 600 * 600;
      const nearMe = (p.x - pp.x) ** 2 + (p.z - pp.z) ** 2 < 80 * 80;
      if (nearPad || nearMe) a.react?.({ kind: 'wave', until: now + 7, x: pad.x, z: pad.z });
    }
  }
  const offs: Array<() => void> = [];
  offs.push(onEvent(st, 'clap', (e) => clapAt(Number(e.x) || 0, Number(e.z) || 0)));
  offs.push(onEvent(st, 'catch', (e) => { if ((Number(e.rarity) || 0) >= 4) clapAt(game.player.pos.x, game.player.pos.z); }));
  offs.push(onEvent(st, 'launch-wave', () => launchWave()));
  offs.push(onEvent(st, 'request-done', (e) => {
    const id = e.npc ? String(e.npc) : '';
    if (!infos.has(id)) return;
    gain(id, requestGain(o.rng(`npc:req:${e.id}`)));
    const a = actorFor(id);
    a?.react?.({ kind: 'happy', until: now + 2.5 });
    a?.setNews?.(false);
    newsAt = -9;
  }));
  offs.push(onEvent(st, 'donate', () => {
    // 느릿 관장: "오오…… 이건…… 정말…… 귀한…… (5초 뒤) ……친구로군요……"
    const info = [...infos.values()].find((i) => i.talk.role === 'museum');
    const a = info ? actorFor(info.id) : null;
    if (!info || !a || !a.present() || dist2(a) > 40 * 40) return;
    startConv(a, info, ['오오…… 이건…… 정말…… 귀한……', '……친구로군요……'], false, [5, 2.6]);
  }));

  // ── '!' 부탁 말풍선 ──
  let newsAt = -9;
  function refreshNews() {
    const E = game.econ;
    if (!E?.requestsFor) return;
    const seen = new Set<string>();
    for (const a of actors.values()) {
      if (!a.present() || seen.has(a.id)) continue;
      let on = false;
      try { on = E.requestsFor(a.id).some((r) => !r.done); } catch { on = false; }
      for (const b of actorsOf(a.id)) b.setNews?.(on);
      seen.add(a.id);
    }
  }

  // ── 매 프레임 ──
  function update(t: number, dt: number) {
    now = t;
    if (t - newsAt > 1.5 || t < newsAt) { newsAt = t; refreshNews(); }
    const c = conv;
    if (!c) return;
    // 멀리 가 버리면 대화 끝(창은 안 연다)
    if (!c.actor.present() || dist2(c.actor) > CANCEL_DIST * CANCEL_DIST) { stopConv(false); return; }
    const page = c.pages[c.i];
    const g = glyphs(page);
    // 촬영 모드(dt = 0)는 시간이 안 가니 다 보이게
    const n = dt <= 0 ? g.length : typedCount(page, t - c.t0);
    if (n !== c.shown) {
      const prev = Math.max(0, c.shown);
      c.shown = n;
      c.actor.say(page, n);
      // 새로 나온 글자마다(두 글자에 한 번) 톡톡 소리
      const p = c.actor.pos();
      for (let i = prev; i < n; i++) {
        if (i % 2 || !isBlipChar(g[i])) continue;
        game.audio?.sfx('talk-blip', { pitch: blipPitch(c.info.social.voice, g[i]), x: p.x, z: p.z, vol: 0.45 });
      }
    }
    const hold = c.holds?.[c.i];
    const dur = hold != null ? g.length / TYPE_CPS + hold : pageDuration(page);
    if (dt > 0 && t - c.t0 >= dur) nextPage(c);
  }
  game.onUpdate(update);

  // ── E: 가장 가까운 NPC 에게 말 걸기 / 대화 중이면 다음 ──
  game.addProvider('characters-talk', (p) => {
    if (p.mounted || p.mode === 'swim' || p.mode === 'dive') return null;
    const a = nearest(o.talkDist ?? TALK_DIST);
    if (!a) return null;
    const info = infos.get(a.id);
    if (!info) return null;
    // 말 걸 거리 안이면 낚시(물가 1.6m)·카운터 같은 고정 거리 프롬프트보다 앞서게 살짝 당겨 보고한다
    const d = Math.min(Math.sqrt(dist2(a)), 0.4);
    if (conv && conv.actor === a) return { id: 'characters-talk', label: '다음 ▶', dist: d, use: advance };
    return { id: 'characters-talk', label: `${info.name}에게 말 걸기`, dist: d, use: () => talk(a.id, a) };
  });

  // ── 주민 메뉴 창(대화·선물·부탁) ──
  let lastGiftMsg: { id: string; text: string } | null = null;
  game.hud.registerPanel({
    kind: 'npc', title: '주민', color: '#ff9fb8', icon: '💬', defaultTab: 'talk',
    tabs: () => {
      const id = panelId();
      const t = [{ id: 'talk', label: '대화', icon: '💬' }, { id: 'gift', label: '선물', icon: '🎁' }, { id: 'req', label: '부탁', icon: '📝' }];
      if (id && infos.get(id)?.after.type === 'appraise') t.push({ id: 'appraise', label: '감정', icon: '🔍' });
      if (id && flagOf(id).prop === PROP_PENDING) t.push({ id: 'move', label: '이사', icon: '🏡' });
      return t;
    },
    meta: () => {
      const id = panelId();
      return id ? `${infos.get(id)?.name ?? ''} ${'♥'.repeat(heartsOf(flagOf(id).f))}${'♡'.repeat(5 - heartsOf(flagOf(id).f))}` : '';
    },
    render(body, pc) {
      const id = argId(pc.arg) ?? panelId();
      const info = id ? infos.get(id) : undefined;
      const { esc, fmt } = pc.h;
      if (!id || !info) { body.innerHTML = '<div class="note">누구랑 이야기할까요?</div>'; return; }
      const fl = flagOf(id);
      const hearts = heartsOf(fl.f);
      const d = day();
      const bday = isBirthdayToday(info.social.birthday, d);
      const tab = pc.tab === 'gift' || pc.tab === 'req' || pc.tab === 'appraise' || pc.tab === 'move' ? pc.tab : 'talk';
      const head = `<div class="hint dl-card"><div class="ico" style="--cc:${esc(info.accent)}">💬</div><div class="grow">
        <div style="font-size:22px">${esc(info.name)} <span style="color:#ff7a9a">${'♥'.repeat(hearts)}${'♡'.repeat(5 - hearts)}</span></div>
        <small>우정 ${fmt(fl.f)}/100 · 생일 ${esc(birthdayText(info.social.birthday))}${bday ? ' 🎂 오늘이에요!' : ''}${fl.gifts ? ` · 받은 선물 ${fmt(fl.gifts)}개` : ''}</small></div></div>`;
      let html = head;
      if (tab === 'talk') {
        const likes = hearts >= 2 ? `좋아하는 것: ${info.social.likes.map((c) => GIFT_CAT_NAME[c]).join('·')}` : '더 친해지면 좋아하는 걸 알려 줄지도 몰라요!';
        html += `<div class="note">${esc(likes)}</div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:10px">
            <button class="btn gold" data-npc-act="again">💬 또 이야기하기</button>
            <button class="btn" data-npc-act="bye">👋 안녕!</button></div>`;
      } else if (tab === 'gift') {
        const keys = Object.keys(st.bag).filter((k) => (st.bag[k] ?? 0) > 0 && giftable(k));
        const msg = lastGiftMsg && lastGiftMsg.id === id ? `<div class="note">${esc(info.name)}: ${esc(lastGiftMsg.text)}</div>` : '';
        const left = Math.max(0, GIFTS_PER_DAY - giftsToday(fl, d));
        html += msg + `<div class="note">오늘 마음이 전해지는 선물 ${left}번 남았어요${bday ? ' · 생일 선물은 세 배!' : ''}</div>`
          + (keys.length ? `<div class="grid">${keys.map((k) => `<div class="cell" data-npc-gift="${esc(k)}" style="--cc:${pc.h.color(k)}"><div class="cnt">×${fmt(st.bag[k])}</div>
            <div class="ico">${pc.h.ico(k)}</div><div class="nm">${esc(pc.h.name(k))}</div></div>`).join('')}</div>` : '<div class="note">가방에 줄 만한 게 없어요 💦</div>');
      } else if (tab === 'appraise') {
        // 프로 박사 화석 감정(GDD 3.10.1 — 300 코인, 조각의 주인과 빠진 조각을 알려 준다)
        const can = appraisable();
        const done = appraised().filter((k) => st.has(k));
        const cost = appraiseCost();
        html += `<div class="note">감정료 🪙 ${fmt(cost)} · 가진 코인 🪙 ${fmt(st.coins)}</div>`
          + (can.length ? `<div class="grid">${can.map((k) => `<div class="cell" data-npc-appraise="${esc(k)}" style="--cc:${pc.h.color(k)}"><div class="cnt">🔍</div>
            <div class="ico">${pc.h.ico(k)}</div><div class="nm">${esc(pc.h.name(k))}</div></div>`).join('')}</div>`
            : '<div class="note">감정할 화석 조각이 없어요. 공룡섬 X 자리를 파 봐요 🦴</div>')
          + (done.length ? `<div class="note">감정서 붙인 조각: ${done.map((k) => esc(pc.h.name(k))).join(' · ')}</div>` : '');
      } else if (tab === 'move') {
        const pr = proposalOf(id);
        const at = livesOn(id);
        html += pr.state === 'pending' && pr.island
          ? `<div class="note">💌 "우리 더 가까이 살래? ${esc(islandName(pr.island))}로 이사 가고 싶어!"</div>
            <div class="note">지금 사는 곳: ${esc(at ? islandName(at) : '아직 없어요')} · ${esc(islandName(pr.island))} 빈 집 ${fmt(capacityLeft(rows, flOf, pr.island, ISLAND_CAP))}채</div>
            <div style="display:flex;gap:10px;justify-content:center;margin-top:10px">
              <button class="btn gold" data-npc-move="yes">🏡 좋아, 이사 와!</button>
              <button class="btn" data-npc-move="no">🙂 지금 그대로가 좋아</button></div>`
          : '<div class="note">이사 이야기는 끝났어요 🏡</div>';
      } else {
        let reqs: Array<{ id: string; text?: string; n: number; reward: number; stars?: number; done: boolean; have?: number }> = [];
        try { reqs = (game.econ?.requestsFor?.(id) ?? []) as typeof reqs; } catch { reqs = []; }
        html += reqs.length ? reqs.map((r) => `<div class="req dl-card${r.done ? ' done' : ''}"><div class="who">📝</div>
            <div class="tx">"${esc(r.text ?? '부탁이 있어!')}"<small>보상 🪙 ${fmt(r.reward)}${r.stars ? ` · ⭐ ${fmt(r.stars)}` : ''}${r.have != null ? ` · 가진 것 ${fmt(Math.min(r.have, r.n))}/${fmt(r.n)}` : ''}</small></div>
            ${r.done ? '<button class="btn off">완료!</button>' : `<button class="btn gold" data-npc-req="${esc(r.id)}">건네주기</button>`}</div>`).join('')
          : '<div class="note">오늘은 부탁이 없대요. 내일 또 와요!</div>';
      }
      body.innerHTML = html;
      body.querySelectorAll<HTMLElement>('[data-npc-act]').forEach((el) => el.addEventListener('click', () => {
        pc.close();
        if (el.dataset.npcAct === 'again') talkAgain(id);
      }));
      body.querySelectorAll<HTMLElement>('[data-npc-gift]').forEach((el) => el.addEventListener('click', () => {
        const r = gift(id, el.dataset.npcGift ?? '');
        if (r) {
          lastGiftMsg = { id, text: r.line };
          if (r.delta > 0) pc.h.confetti(body, ['#ff9cb8', '#ffe58a', '#fff'], 28);
        }
        pc.rerender();
      }));
      body.querySelectorAll<HTMLElement>('[data-npc-appraise]').forEach((el) => el.addEventListener('click', () => {
        if (appraise(el.dataset.npcAppraise ?? '')) pc.h.confetti(body, ['#b6e86a', '#ffe58a', '#fff'], 24);
        pc.rerender();
      }));
      body.querySelectorAll<HTMLElement>('[data-npc-move]').forEach((el) => el.addEventListener('click', () => {
        if (el.dataset.npcMove === 'yes') { if (acceptMove(id)) { pc.h.confetti(body, ['#ff9cb8', '#ffe58a', '#fff'], 40); } }
        else if (declineMove(id)) toast(`${info.name}: 응! 지금처럼 자주 놀러 와 줘 💕`);
        pc.rerender();
      }));
      body.querySelectorAll<HTMLElement>('[data-npc-req]').forEach((el) => el.addEventListener('click', () => {
        let ok = false;
        try { ok = !!game.econ?.fulfill?.(el.dataset.npcReq ?? ''); } catch { ok = false; }
        if (ok) { toast('고마워! 보상을 받았다!'); pc.h.confetti(body, ['#ff9cb8', '#ffe58a', '#fff'], 36); }
        else toast('아직 다 못 모았어요 💦');
        pc.rerender();
      }));
    },
  });
  const argId = (arg: unknown): string | null => (typeof arg === 'string' ? arg : arg && typeof arg === 'object' && typeof (arg as { id?: unknown }).id === 'string' ? (arg as { id: string }).id : null);
  const panelId = () => argId(game.hud.current()?.arg);
  /** 메뉴의 '또 이야기하기' — 메뉴가 다시 열리지 않게 이번 대화는 follow 없이 */
  function talkAgain(id: string) {
    const pages = talk(id);
    if (conv && pages.length) conv.follow = false;
  }

  const api = {
    // 아직 이사 안 온 이주민은 빼고, 섬은 지금 사는 섬으로(economy 부탁·islanddev 가 읽는다)
    list: () => [...infos.values()].filter((i) => livesOn(i.id) !== null)
      .map((i) => ({ id: i.id, name: i.name, island: livesOn(i.id) ?? i.island, kind: i.kind, birthday: i.social.birthday, ...(i.owner ? { owner: i.owner } : {}) })),
    talk: (id: string) => talk(id),
    friendship: (id: string) => flagOf(id).f,
    hearts: (id: string) => heartsOf(flagOf(id).f),
    birthdayOf: (id: string) => infos.get(id)?.social.birthday ?? null,
    spawnAt: (id: string, x: number, z: number) => { const a = actorFor(id); if (!a?.moveTo) return false; a.moveTo(x, z); return true; },
    addDialog: (id: string, lines: string[] | string, opt?: { key?: string; pin?: boolean }) => {
      const ls = (Array.isArray(lines) ? lines : [lines]).filter((l) => typeof l === 'string' && l.trim());
      const key = opt?.key ?? null;
      const list = (extra.get(id) ?? []).filter((e) => key === null || e.key !== key);
      if (ls.length) list.push({ key, lines: ls, pin: !!opt?.pin });
      extra.set(id, list);
    },
    clearDialog: (id: string, key?: string) => { if (key === undefined) extra.delete(id); else extra.set(id, (extra.get(id) ?? []).filter((e) => e.key !== key)); },
    owners: () => Object.entries(ISLAND_OWNERS).map(([island, id]) => ({ island, id, name: infos.get(id)?.name ?? id })),
    moveIn: (id: string | null | undefined, island: string) => moveIn(id, island),
    nextResident: (island: string) => pickNext(rows, flOf, island, ISLAND_CAP),
    candidates: (island: string) => pickCandidates(rows, flOf, island),
    capacity: (island: string) => { const used = population(rows, flOf, island).length, cap = ISLAND_CAP[island] ?? 0; return { used, cap, left: Math.max(0, cap - used) }; },
    residents: () => rows.map((r) => ({ id: r.id, name: infos.get(r.id)?.name ?? r.id, island: islandOf(r, flOf), movable: r.movable && !r.fixed })),
    island: (id: string) => livesOn(id),
    proposal: (id: string) => proposalOf(id),
    acceptMove, declineMove,
    appraise: (fosId?: string) => appraise(fosId),
    appraisable: () => appraisable(),
    gift,
    name: (id: string) => infos.get(id)?.name ?? null,
    talking: () => conv?.info.id ?? null,
  };

  return {
    api, register, update, advance, talk, gift, flagOf, actorFor, moveIn, propose, gain, appraise,
    /** 지금 대화(디버그) */
    conv: () => (conv ? { id: conv.info.id, page: conv.pages[conv.i], i: conv.i, n: conv.pages.length, shown: conv.shown } : null),
    dispose() { for (const f of offs) f(); stopConv(false); },
  };
}

export type NpcService = ReturnType<typeof createNpcService>;
