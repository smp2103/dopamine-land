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
//   moveIn?: wave 5(이사)에서 붙는다
// }
import type { Game } from '../../core/game';
import { onEvent } from '../../core/events';
import { PLACES } from '../../core/island';
import type { NpcAfter, NpcSocial } from './data';
import {
  selectDialog, migrateNpcFlags, emptyFlag, addFriend, talkGain, requestGain, giftDelta, giftsToday, recordGift,
  giftCategory, giftable, giftReaction, heartsOf, isBirthdayToday, birthdayText, GIFT_CAT_NAME, GIFTS_PER_DAY,
  typedCount, pageDuration, glyphs, isBlipChar, blipPitch, paginate, josa, TYPE_CPS,
  type NpcFlag, type TalkDef,
} from './dialog';

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
}

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
}

const TALK_DIST = 2.6;
const CANCEL_DIST = 9;
const CLAP_R = 15;

export function createNpcService(game: Game, o: NpcServiceOpts) {
  const st = game.state;
  const infos = new Map(o.infos.map((i) => [i.id, i]));
  const actors = new Map<string, NpcActor>();
  const extra = new Map<string, string[]>();
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

  /** 우정 더하기 + 하트가 늘면 befriend */
  function gain(id: string, delta: number) {
    const step = addFriend(flagOf(id), delta);
    putFlag(id, step.flag);
    if (step.heartsAfter > step.heartsBefore) {
      emit({ type: 'befriend', id, hearts: step.heartsAfter, kind: 'npc' });
      const nm = infos.get(id)?.name ?? id;
      toast(`💕 ${nm}와(과) 더 친해졌어요! ${'♥'.repeat(step.heartsAfter)}${'♡'.repeat(5 - step.heartsAfter)}`);
    }
    return step;
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

  function stopConv(follow: boolean) {
    const c = conv;
    if (!c) return;
    conv = null;
    c.actor.say(null, 0);
    c.actor.setTalking?.(false);
    if (follow && c.follow) runAfter(c.info);
  }
  function runAfter(info: NpcInfo) {
    const a = info.after;
    if (a.type === 'open-shop') emit({ type: 'open-shop', shop: a.shop });
    else if (a.type === 'open-museum') emit({ type: 'open-museum' });
    else game.hud.open('npc', 'talk', { id: info.id });
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
      birthday: isBirthdayToday(info.social.birthday, d), extra: extra.get(id),
    });
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
    tabs: () => [{ id: 'talk', label: '대화', icon: '💬' }, { id: 'gift', label: '선물', icon: '🎁' }, { id: 'req', label: '부탁', icon: '📝' }],
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
      const tab = pc.tab === 'gift' || pc.tab === 'req' ? pc.tab : 'talk';
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
    list: () => [...infos.values()].map((i) => ({ id: i.id, name: i.name, island: i.island, kind: i.kind, birthday: i.social.birthday })),
    talk: (id: string) => talk(id),
    friendship: (id: string) => flagOf(id).f,
    hearts: (id: string) => heartsOf(flagOf(id).f),
    birthdayOf: (id: string) => infos.get(id)?.social.birthday ?? null,
    spawnAt: (id: string, x: number, z: number) => { const a = actorFor(id); if (!a?.moveTo) return false; a.moveTo(x, z); return true; },
    addDialog: (id: string, lines: string[]) => { extra.set(id, [...(extra.get(id) ?? []), ...lines.filter((l) => typeof l === 'string' && l.trim())]); },
    gift,
    name: (id: string) => infos.get(id)?.name ?? null,
    talking: () => conv?.info.id ?? null,
  };

  return {
    api, register, update, advance, talk, gift, flagOf, actorFor,
    /** 지금 대화(디버그) */
    conv: () => (conv ? { id: conv.info.id, page: conv.pages[conv.i], i: conv.i, n: conv.pages.length, shown: conv.shown } : null),
    dispose() { for (const f of offs) f(); stopConv(false); },
  };
}

export type NpcService = ReturnType<typeof createNpcService>;
