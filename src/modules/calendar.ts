// calendar — 집 앞 우체통(아침 우편: 주민 편지·첨부 선물·오늘의 소식·요일 공지) · 부표 우체통 6(선물·편지 배달·빠른 이동 정류장) ·
// 요일 이벤트 진행(GDD 4.13: weekday-event 보내기 + 배너 + 출현 배율 + 강제 날씨 + 월요일 꽃잎비) · 하루 루틴 10 칩(+ meta 오늘의 미션).
//
// 아침 우편: 게임 날마다 05시(첫 우편은 바로) — 주민 편지는 ext.npc 우정에 비례(첨부는 econ.give 로 받는다), 소식은 econ.market() 인기 3 ·
//   env.forecast(섬, 4/8/12) · econ.guest?.() · 오늘/내일 요일 이벤트. 같은 날이면 늘 같은 편지(rng 'calendar:mail:<day>'). flags.calendar 에 쌓는다.
// 부표 우체통: 배 위에서 E → 'mail' 창의 부표 탭(오늘 선물 · 가방 속 편지 넣기 → econ.deliverLetter(없으면 econ.fulfill) · 정류장 보기).
//   지나가며 들른 부표는 ext.travel.addNode(id, x, z, 'buoy', 이름)로 비눗방울 정류장이 된다(islanddev 가 travel 주인).
// 요일 이벤트(계약 v2 4장 id 고정): petalrain(월, 꽃잎 소용돌이 → m_petal, boosts {petal:2}) · migration(화, dinos-p1) ·
//   sandtemple(수, env.forceWeather('desert','sandstorm',6)) · firefly(목) · whaleroad(금, seaworld) · pirate(토, seaworld) ·
//   meteor(일, 밤 21~05시 env.forceWeather('*','meteor') — 별가루 ×2 는 treasure·atmosphere 가 weekday 로 읽는다).
//   env 강제 날씨는 저장되지 않으니 flags.calendar.force 에 기한을 적어 두고 다시 불러오면 남은 만큼 다시 건다.
//
// game.ext.calendar (주인: calendar) = {
//   boosts() → Record<tag, 배율>             오늘 요일 이벤트 출현 배율(월 {petal: 2}, 나머지 {}) — econ RollEnv.boostTags 가 읽는다
//   today() → {day, weekday, id, name, icon, color, sub, desc, where, active}
//   unread() → number · mail() → Mail[](복사본) · read(id?) · claimAll() · open(tab?) · routine() → [{id, icon, text, have, goal, done}]
//   letters(buoyId?) → 가방 속 편지 부탁 [{rid, item, to, npc, ok}] · deliver(rid, buoyId?) → boolean
//   buoys() → [{id, n, name, x, z, links, seen}]
// }
// flags.calendar — calendar/logic.ts CalFlags(우편함·요일 이벤트·강제 날씨·꽃잎·부표·루틴).
// 이벤트: weekday-event{id, active} · mail{id} · harvest{kind:'petal'} (꽃잎 줍기)
// 디버그: window.__calendar = { (ext.calendar 전부) + state(), deliverMorning(force?), claim(id),
//   buoys(), gotoBuoy(n), gotoMailbox(), openBuoy(id), visit(id), letters(buoyId?), deliver(rid, buoyId?), petals(), pickPetal(), routine(), bump(key, n?), tick() }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import { DAY_SEC, HOUR_SEC, type EconRequest, type Weather } from '../core/api';
import { isEvent, type GameEvent, type WeekdayEventId } from '../core/events';
import {
  WEEKDAY_INFO, BUOY_LINKS, BUOY_REACH, MAILBOX_REACH, FORECAST_REGIONS, FORECAST_HOURS, MAIL_HOUR, RC, ROUTINE_BONUS_STARS,
  buoyName,
} from './calendar/data';
import {
  ensureCalFlags, morningMail, addMails, claimMail, unreadCount, giftCount, mailDue, eventOf, boostsFor, forcePlans,
  rollRoutine, bumpRoutine, routineRows, newlyDone, petalSpots, petalAmount, buoyAccepts, buoyGift,
  type CalFlags, type Mail, type MailAttach, type NpcLite, type ForecastRow, type NewsData,
} from './calendar/logic';
import { mailPanel, MAIL_KIND, type BuoyView } from './calendar/panel';
import { buildPetalChunk, posePetalChunk, PetalRain, RAIN_N, type PetalChunk, type PetalSpot } from './calendar/petals';

export const order = 45;

/** 살피기 간격(초) */
const TICK = 0.5;
/** 꽃잎 줍는 거리(m) */
const PETAL_PICK = 1.5;
/** 지나가며 '들렀다'로 치는 부표 거리(m) */
const BUOY_VISIT = 16;
/** 첫 실행 배너를 조금 늦게(시작 화면과 겹치지 않게) */
const FIRST_BANNER_DELAY = 3;

interface BuoyPos { id: string; n: number; x: number; z: number; y?: () => number }
type LetterReq = EconRequest & { kind?: string; to?: string; item?: string };

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const g: Game = game;
  const st = g.state;
  const I = ctx.island;
  const out = new THREE.Group();
  out.name = 'calendar';

  // ───────────── 저장 ─────────────
  let fl: CalFlags | null = null;
  const F = (): CalFlags => {
    if (!fl || st.flags.calendar !== fl) fl = ensureCalFlags(st.flags);
    return fl;
  };
  const save = () => st.save();
  const day = () => Math.max(0, Math.floor(g.env?.day ?? g.econ?.day?.() ?? 0));
  const hour = () => g.env?.hour ?? 12;
  const gameSec = () => g.env?.gameSec ?? day() * DAY_SEC + hour() * HOUR_SEC;
  const emit = (e: GameEvent) => st.emit(e as never);
  const toast = (t: string) => g.hud.toast(t);
  const giveItem = (id: string, n: number, why: string): number => {
    const econ = g.econ;
    if (econ) { try { return econ.give(id, n, why, { silent: true }); } catch { return 0; } }
    st.addItem(id, n);
    return n;
  };
  const nameOf = (id: string) => st.species.get(id)?.name ?? id;
  const npcApi = () => g.ext.npc as {
    list?: () => Array<{ id: string; name?: string; island?: string; kind?: string; birthday?: number | null }>;
    friendship?: (id: string) => number; name?: (id: string) => string | null;
  } | undefined;
  const village = () => g.ext.village as { setMailFlag?: (up: boolean) => void; positions?: { mailbox?: { x: number; z: number }; buoys?: BuoyPos[] } } | undefined;

  // ───────────── 아침 우편 ─────────────
  const npcs = (): NpcLite[] => {
    const api = npcApi();
    let raw: ReturnType<NonNullable<NonNullable<typeof api>['list']>> = [];
    try { raw = api?.list?.() ?? []; } catch { raw = []; }
    return raw.filter((n) => n && typeof n.id === 'string').map((n) => {
      let f = 0;
      try { f = Number(api?.friendship?.(n.id)) || 0; } catch { f = 0; }
      return { id: n.id, name: n.name ?? n.id, island: n.island ?? 'home', kind: n.kind, f, birthday: n.birthday ?? null };
    });
  };
  const forecast = (): ForecastRow[] => {
    const env = g.env;
    if (!env) return [];
    return FORECAST_REGIONS.map((region) => ({
      region,
      w: FORECAST_HOURS.map((h): Weather => { try { return env.forecast(region, h); } catch { return env.weatherOf?.(region) ?? 'clear'; } }),
    }));
  };
  const market = (): { hot: string[]; mult?: Record<string, number> } => {
    try { const m = g.econ?.market?.(); return { hot: [...(m?.hot ?? [])].slice(0, 3), mult: m?.mult }; } catch { return { hot: [] }; }
  };
  const guestId = (): string | null => { try { return g.econ?.guest?.()?.id ?? null; } catch { return null; } };
  const liveNews = (): NewsData | null => {
    if (!g.econ && !g.env) return null;
    const m = market();
    const d = day();
    return { hot: m.hot, mult: m.mult, guest: guestId(), forecast: forecast(), event: eventOf(d), tomorrow: eventOf(d + 1) };
  };

  let mailUp: boolean | null = null;
  const syncFlag = () => {
    const up = unreadCount(F().box) > 0 || giftCount(F().box) > 0;
    if (up === mailUp) return;
    try { village()?.setMailFlag?.(up); mailUp = up; } catch { /* 마을 없음 */ }
  };
  /** 오늘 아침 우편 넣기(이미 왔으면 force 일 때만 다시 — 같은 id 는 건너뛴다). 넣은 수 */
  const deliverMorning = (force = false): number => {
    const f = F();
    const d = day();
    if (!force && !mailDue(f, d, hour(), MAIL_HOUR)) return 0;
    const m = market();
    const mails = morningMail(d, { npcs: npcs(), hot: m.hot, mult: m.mult, guest: guestId(), forecast: forecast(), welcome: !f.welcomed }, ctx.rng);
    const n = addMails(f, mails);
    f.lastMail = Math.max(f.lastMail, d);
    f.welcomed = true;
    save();
    if (n > 0) {
      emit({ type: 'mail', id: mails[0].id });
      const letters = mails.filter((x) => x.kind === 'letter' || x.kind === 'birthday' || x.kind === 'welcome').length;
      toast(letters ? `📬 우편함에 편지 ${letters}통이 왔어요! (K)` : '📬 오늘의 소식이 왔어요! (K)');
    }
    syncFlag();
    return n;
  };

  // ───────────── 우편함 조작 ─────────────
  const findMail = (id: string) => F().box.find((m) => m.id === id);
  const markRead = (id: string) => { const m = findMail(id); if (m && !m.read) { m.read = true; save(); syncFlag(); } };
  const readAll = () => { let ch = false; for (const m of F().box) if (!m.read) { m.read = true; ch = true; } if (ch) { save(); syncFlag(); } };
  const claimToast = (got: MailAttach[]) => {
    if (!got.length) return;
    toast(`🎁 ${got.map((a) => `${nameOf(a.id)} ×${a.n}`).join(' · ')} 받았어요!`);
  };
  const claim = (id: string): MailAttach[] => {
    const m = findMail(id);
    if (!m) return [];
    m.read = true;
    const got = claimMail(m, (iid, n) => giveItem(iid, n, 'mail'));
    if (m.attach?.length && !m.claimed && !got.length) toast('가방이 꽉 찼어요! 조금 비우고 받아요 🎒');
    claimToast(got);
    save();
    syncFlag();
    return got;
  };
  const claimAll = (): number => {
    const got: MailAttach[] = [];
    for (const m of F().box) {
      if (!m.attach?.length || m.claimed) continue;
      m.read = true;
      got.push(...claimMail(m, (iid, n) => giveItem(iid, n, 'mail')));
    }
    if (!got.length && giftCount(F().box) > 0) toast('가방이 꽉 찼어요! 조금 비우고 받아요 🎒');
    claimToast(got);
    save();
    syncFlag();
    return got.length;
  };

  // ───────────── 요일 이벤트 ─────────────
  const today = () => {
    const d = day();
    const id = eventOf(d);
    const w = WEEKDAY_INFO[id];
    return { day: d, weekday: w.wd, id, name: w.name, icon: w.icon, color: w.color, sub: w.sub, desc: w.desc, where: w.where, active: true };
  };
  const boosts = () => boostsFor(eventOf(day()), true);
  let announced = false;
  let bannerAt = -1;
  let pendingBanner: WeekdayEventId | null = null;
  const showBanner = (id: WeekdayEventId) => {
    const w = WEEKDAY_INFO[id];
    g.hud.banner({ text: `${w.icon} ${['월', '화', '수', '목', '금', '토', '일'][w.wd]}요일 — ${w.name}!`, sub: w.sub, icon: w.icon, color: w.color, ms: 4200 });
  };
  const stepWeekday = (t: number) => {
    const f = F();
    const d = day();
    const id = eventOf(d);
    if (!f.ev || f.ev.day !== d) {
      if (f.ev && f.ev.id !== id) emit({ type: 'weekday-event', id: f.ev.id, active: false });
      f.ev = { day: d, id };
      emit({ type: 'weekday-event', id, active: true });
      announced = true;
      save();
    } else if (!announced) {
      // 다시 불러왔을 때 — 듣는 쪽(seaworld·dinos …)이 오늘 이벤트를 알게 한 번 더
      emit({ type: 'weekday-event', id, active: true });
      announced = true;
    }
    if (f.banner !== d) {
      f.banner = d;
      save();
      pendingBanner = id;
      bannerAt = t < FIRST_BANNER_DELAY ? FIRST_BANNER_DELAY : t;
    }
    if (pendingBanner && t >= bannerAt) { showBanner(pendingBanner); pendingBanner = null; }
  };

  // 강제 날씨: 다시 불러오면 남은 것 다시 걸기 + 요일 계획
  let reapplied = false;
  const stepForce = () => {
    const env = g.env;
    if (!env) return;
    const f = F();
    const now = gameSec();
    let changed = false;
    if (!reapplied) {
      reapplied = true;
      for (const r of f.force) if (r.until > now) env.forceWeather(r.region, r.w, (r.until - now) / HOUR_SEC);
    }
    const alive = f.force.filter((r) => r.until > now);
    if (alive.length !== f.force.length) { f.force = alive; changed = true; }
    for (const p of forcePlans(now)) {
      if (f.forceDone.includes(p.key)) continue;
      env.forceWeather(p.region, p.w, p.hours);
      f.force.push({ key: p.key, region: p.region, w: p.w, until: p.until });
      f.forceDone.push(p.key);
      if (f.forceDone.length > 12) f.forceDone.splice(0, f.forceDone.length - 12);
      changed = true;
      if (p.w === 'meteor') g.hud.card({ title: '🌠 유성우가 내려요!', body: '별똥별섬에 가면 별가루가 두 배! 소원도 빌어 봐요 ✨', icon: '🌠', color: '#d8c8ff', ms: 4200 });
      else if (p.w === 'sandstorm') g.hud.card({ title: '🌪️ 모래시계섬 모래폭풍!', body: '6시간 동안 모래가 휘몰아쳐요. 걷히면 신전이 보일지도…', icon: '🏜️', color: '#ffd29a', ms: 4200 });
    }
    if (changed) save();
  };

  // ───────────── 하루 루틴 ─────────────
  const routineTick = (key?: string, n = 1, max?: number) => {
    const f = F();
    if (rollRoutine(f, day())) save();
    if (key) {
      if (max !== undefined) f.routine.c[key] = Math.max(f.routine.c[key] ?? 0, Math.min(max, (f.routine.c[key] ?? 0) + n));
      else bumpRoutine(f, key, n);
    }
    const fresh = newlyDone(f);
    for (const r of fresh) toast(`📋 하루 루틴 완료! ${r.icon} ${r.text}`);
    const rows = routineRows(f.routine.c);
    if (!f.routine.bonus && rows.every((r) => r.done)) {
      f.routine.bonus = true;
      try { g.econ?.addStars?.(ROUTINE_BONUS_STARS, 'routine'); } catch { /* econ 없음 */ }
      g.hud.card({ title: '📋 오늘의 루틴 올클리어!', body: `열 가지를 다 했어요! 반짝별 +${ROUTINE_BONUS_STARS} ✨`, icon: '🏅', color: '#8fdc9a', ms: 3600 });
    }
    if (key || fresh.length) save();
  };
  const isNight = () => (g.env?.tod ?? 'day') === 'night';
  const onEvent = (e: GameEvent) => {
    switch (e.type) {
      case 'rock-hit': routineTick(RC.rock); break;
      case 'tree-shake': routineTick(RC.shake); break;
      case 'harvest': if (isEvent(e, 'harvest')) {
        if (e.kind === 'dig') routineTick(RC.dig);
        if (isNight()) routineTick(RC.night, 1, 1);
      } break;
      case 'catch': if (isEvent(e, 'catch')) {
        const a = String(e.activity ?? '');
        if (a === 'fish' || a === 'moonfish') routineTick(RC.firstFish, 1, 1);
        else if (a === 'bug') routineTick(RC.firstBug, 1, 1);
        if (isNight()) routineTick(RC.night, 1, 1);
      } break;
      case 'sell': routineTick(RC.sell); break;
      case 'donate': routineTick(RC.donate); break;
      case 'craft': routineTick(RC.craft); break;
      case 'request-done': routineTick(RC.board, 1, 1); break;
      case 'open-board': routineTick(RC.board, 1, 1); break;
      case 'day': routineTick(); break;
      default: break;
    }
  };
  st.on(onEvent);
  g.hud.onChange((kind) => {
    if (kind === 'board') routineTick(RC.board, 1, 1);
    if (kind !== MAIL_KIND) curBuoy = null;
  });

  // ───────────── 부표 우체통 ─────────────
  const buoyList = (): BuoyPos[] => {
    const vb = village()?.positions?.buoys;
    if (Array.isArray(vb) && vb.length) return vb.map((b, i) => ({ id: b.id, n: b.n ?? i + 1, x: b.x, z: b.z, y: b.y }));
    return I.PLACES.buoyMail.map((b, i) => ({ id: b.id, n: i + 1, x: b.x, z: b.z }));
  };
  const buoyById = (id: string) => buoyList().find((b) => b.id === id) ?? null;
  const travel = () => g.ext.travel as { addNode?: (id: string, x: number, z: number, kind?: string, label?: string) => unknown; nodes?: () => Array<{ id: string }> } | undefined;
  let travelSynced = false;
  const syncTravel = () => {
    const t = travel();
    if (!t?.addNode) return false;
    const have = new Set((() => { try { return (t.nodes?.() ?? []).map((n) => n.id); } catch { return [] as string[]; } })());
    for (const id of F().buoys.seen) {
      const b = buoyById(id);
      if (b && !have.has(b.id)) t.addNode(b.id, b.x, b.z, 'buoy', buoyName(b.n));
    }
    return true;
  };
  const visit = (b: BuoyPos) => {
    const f = F();
    if (f.buoys.seen.includes(b.id)) return false;
    f.buoys.seen.push(b.id);
    save();
    try { travel()?.addNode?.(b.id, b.x, b.z, 'buoy', buoyName(b.n)); } catch { /* islanddev 없음 */ }
    g.hud.card({ title: `📮 ${buoyName(b.n)} 발견!`, body: '바다 우체국이에요. 편지·선물을 주고받고, 비눗방울 정류장도 열렸어요! (E)', icon: '📮', color: '#9fd4ff', ms: 3600 });
    return true;
  };
  /** 가방 속 편지 부탁(⑦) */
  const letterReqs = (): LetterReq[] => {
    const econ = g.econ;
    if (!econ) return [];
    const all: LetterReq[] = [];
    const seen = new Set<string>();
    const push = (list: unknown) => {
      if (!Array.isArray(list)) return;
      for (const r of list as LetterReq[]) if (r && typeof r.id === 'string' && !seen.has(r.id)) { seen.add(r.id); all.push(r); }
    };
    try { push(econ.requests?.()); } catch { /* 없음 */ }
    let list: Array<{ id: string }> = [];
    try { list = npcApi()?.list?.() ?? []; } catch { list = []; }
    for (const n of list) { try { push(econ.requestsFor?.(n.id)); } catch { /* 없음 */ } }
    return all.filter((r) => (r.kind === 'letter' || /^it_letter/.test(r.item ?? '')) && !r.done && !!r.item && st.has(r.item));
  };
  const lettersAt = (buoyId?: string | null) => letterReqs().map((r) => ({
    rid: r.id, item: r.item ?? '', to: r.to ?? '',
    npc: (r.npc && (() => { try { return npcApi()?.name?.(r.npc!) ?? null; } catch { return null; } })()) || r.npc || '주민',
    ok: buoyId ? buoyAccepts(buoyId, r.to) : true,
  }));
  /** 편지 넣기 — 부표가 그 섬 쪽이어야 한다(buoyId 를 주면) */
  const deliver = (rid: string, buoyId?: string | null): boolean => {
    const econ = g.econ as (Game['econ'] & { deliverLetter?: (idOrItem: string) => boolean }) | null;
    if (!econ) return false;
    const rq = letterReqs().find((r) => r.id === rid || r.item === rid);
    if (!rq) { toast('넣을 편지가 없어요 💌'); return false; }
    const b = buoyId ?? curBuoy;
    if (b && !buoyAccepts(b, rq.to)) { toast(`이 우체통은 ${BUOY_LINKS[b]?.map((x) => I.islandName(x)).join('·') ?? ''} 행이에요 📮`); return false; }
    let ok = false;
    try { ok = typeof econ.deliverLetter === 'function' ? !!econ.deliverLetter(rq.id) : !!econ.fulfill(rq.id); } catch { ok = false; }
    if (!ok) return false;
    const d = day();
    const who = lettersAt(null).find((x) => x.rid === rq.id)?.npc ?? ((rq.npc && npcApi()?.name?.(rq.npc)) || '주민');
    addMails(F(), [{
      id: `d${d}:thanks:${rq.id}`, day: d, kind: 'letter', from: String(who), icon: '💐', npc: rq.npc,
      title: `${who}의 고마워 편지`, text: `편지 잘 전해 줘서 정말 고마워! ${I.islandName(rq.to ?? 'home')} 친구가 엄청 기뻐했대. 넌 최고의 우체부야! 💌`,
    }]);
    save();
    syncFlag();
    g.hud.card({ title: '💌 편지 배달 완료!', body: `${I.islandName(rq.to ?? 'home')}로 가는 편지를 부표 우체통에 넣었어요. 보상 +${rq.reward ?? 0}코인`, icon: '📮', color: '#ffb3c6', ms: 3200 });
    return true;
  };
  let curBuoy: string | null = null;
  const buoyView = (): BuoyView | null => {
    if (!curBuoy) return null;
    const b = buoyById(curBuoy);
    if (!b) return null;
    const d = day();
    const gift = buoyGift(b.id, d, ctx.rng);
    let station = false;
    try { station = !!travel()?.nodes?.().some((n) => n.id === b.id); } catch { station = false; }
    return {
      id: b.id, name: buoyName(b.n), links: BUOY_LINKS[b.id] ?? ['home', 'home'],
      gift: { line: gift.line, attach: gift.attach, claimed: F().buoys.gift[b.id] === d },
      letters: lettersAt(b.id), station,
    };
  };
  const buoyClaim = (): MailAttach[] => {
    if (!curBuoy) return [];
    const f = F();
    const d = day();
    if (f.buoys.gift[curBuoy] === d) return [];
    const gift = buoyGift(curBuoy, d, ctx.rng);
    const m: Mail = { id: 'buoy', day: d, kind: 'buoy', from: '끼룩', icon: '🐦', title: '', text: '', attach: gift.attach.map((a) => ({ ...a })) };
    const got = claimMail(m, (iid, n) => giveItem(iid, n, 'buoy-mail'));
    if (!m.claimed) { if (!got.length) toast('가방이 꽉 찼어요! 조금 비우고 받아요 🎒'); }
    if (got.length) { f.buoys.gift[curBuoy] = d; save(); claimToast(got); }
    return got;
  };
  const openBuoy = (id: string) => {
    const b = buoyById(id);
    if (!b) return false;
    visit(b);
    curBuoy = b.id;
    try { g.player.act?.('pick', 0.6); } catch { /* 포즈 없음 */ }
    g.hud.open(MAIL_KIND, 'buoy', { buoy: b.id });
    curBuoy = b.id; // onChange 가 지웠어도 다시
    if (g.hud.isOpen(MAIL_KIND)) g.hud.rerender();
    return true;
  };
  const nearBuoy = (x: number, z: number, r: number) => {
    let best: BuoyPos | null = null, bd = r;
    for (const b of buoyList()) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    return best ? { b: best, d: bd } : null;
  };
  game.addProvider('calendar-buoy', (p) => {
    if (g.world !== 'earth' || g.focusOverride) return null;
    const n = nearBuoy(p.pos.x, p.pos.z, BUOY_REACH);
    if (!n) return null;
    const gift = F().buoys.gift[n.b.id] !== day();
    // 같은 자리 비눗방울 정류장보다 먼저(창 안에 정류장 단추가 있다)
    return { id: 'calendar-buoy', label: `📮 ${buoyName(n.b.n)}${gift ? ' 🎁' : ''}`, dist: n.d * 0.5, whileMounted: true, use: () => { openBuoy(n.b.id); } };
  });

  // ───────────── 집 앞 우체통 ─────────────
  const mailboxPos = new THREE.Vector3();
  const mailboxXZ = () => village()?.positions?.mailbox ?? I.PLACES.mailbox;
  g.addInteractable({
    id: 'calendar-mailbox', radius: MAILBOX_REACH,
    position: () => { const m = mailboxXZ(); return mailboxPos.set(m.x, I.heightAt(m.x, m.z) + 0.8, m.z); },
    label: () => {
      const u = unreadCount(F().box), gi = giftCount(F().box);
      return u || gi ? `📬 우편함 열기 (새 편지 ${u}${gi ? ` · 🎁${gi}` : ''})` : '📭 우편함 보기';
    },
    onUse: () => {
      deliverMorning();
      try { g.player.act?.('pick', 0.6); } catch { /* 포즈 없음 */ }
      curBuoy = null;
      g.hud.open(MAIL_KIND, 'inbox');
      routineTick(RC.mail, 1, 1);
    },
  });

  // ───────────── 창 · 단축키 · 칩 ─────────────
  const missions = () => {
    try {
      const m = (g.ext.meta as { missions?: () => Array<{ text: string; icon: string; have: number; goal: number; done: boolean }> } | undefined)?.missions?.();
      return Array.isArray(m) ? m : null;
    } catch { return null; }
  };
  g.hud.registerPanel(mailPanel({
    day,
    box: () => F().box,
    unread: () => unreadCount(F().box),
    gifts: () => giftCount(F().box),
    markRead, readAll, claim, claimAll,
    liveNews,
    today: () => ({ id: eventOf(day()), active: true }),
    routine: () => { rollRoutine(F(), day()); return routineRows(F().routine.c); },
    routineBonus: () => F().routine.bonus,
    missions,
    buoy: buoyView,
    buoyClaim,
    deliver: (rid) => deliver(rid, curBuoy),
    openTravel: () => { if (!g.hud.panel('travel')) { toast('정류장이 아직 없어요 🫧'); return false; } g.hud.open('travel'); return true; },
    viewed: () => routineTick(RC.mail, 1, 1),
  }));
  g.hud.registerHotkey({
    id: 'calendar:mail', code: 'KeyK', label: '우편', hint: true, panel: MAIL_KIND,
    run: () => {
      const opening = !g.hud.isOpen(MAIL_KIND);
      if (opening) { curBuoy = null; deliverMorning(); }
      g.hud.toggle(MAIL_KIND, 'inbox');
      if (opening) routineTick(RC.mail, 1, 1);
    },
  });
  let mailSig = '';
  g.hud.registerChip({
    id: 'calendar:mail', order: 26,
    render(el) { el.innerHTML = '<div class="chip dl-card" title="우편함 (K)" style="display:none"><div class="ci" style="background:radial-gradient(circle at 35% 30%, #fff, #ffc6d6)">📬</div><span class="v"></span></div>'; },
    update(el) {
      const box = el.firstElementChild as HTMLElement | null;
      if (!box) return;
      const u = unreadCount(F().box), gi = giftCount(F().box);
      const sig = `${u}|${gi}`;
      if (sig === mailSig) return;
      const grew = !!mailSig && (u + gi) > mailSig.split('|').reduce((s, x) => s + Number(x), 0);
      mailSig = sig;
      box.style.display = u || gi ? '' : 'none';
      (box.querySelector('.v') as HTMLElement).innerHTML = `새 편지 <b style="color:#ff6f91">${u}</b>${gi ? ` <small>🎁${gi}</small>` : ''} <small style="opacity:.6">K</small>`;
      if (grew) { box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); }
    },
  });
  let routineSig = '';
  let routineAcc = 1;
  g.hud.registerChip({
    id: 'calendar:routine', order: 27,
    render(el) { el.innerHTML = '<div class="chip dl-card" title="하루 루틴 · 오늘의 미션 (K → 하루 루틴)"><div class="ci" style="background:radial-gradient(circle at 35% 30%, #fff, #c8f0c0)">📋</div><span class="v"></span></div>'; },
    update(el, dt) {
      routineAcc += dt;
      if (routineAcc < 0.5) return;
      routineAcc = 0;
      const box = el.firstElementChild as HTMLElement | null;
      if (!box) return;
      const f = F();
      const rows = f.routine.day === day() ? routineRows(f.routine.c) : routineRows({});
      const done = rows.filter((r) => r.done).length;
      const ms = missions();
      const md = ms ? ms.filter((m) => m.done).length : -1;
      const w = WEEKDAY_INFO[eventOf(day())];
      const sig = `${done}|${md}|${ms?.length ?? 0}|${w.id}`;
      if (sig === routineSig) return;
      routineSig = sig;
      (box.querySelector('.v') as HTMLElement).innerHTML = `루틴 <b style="color:${done >= rows.length ? '#4ea562' : '#ff9b3d'}">${done}/${rows.length}</b>${ms ? ` <small>📝${md}/${ms.length}</small>` : ''} <small title="${w.name}">${w.icon}</small>`;
    },
  });

  // ───────────── 월요일 꽃잎비 ─────────────
  const petalOn = () => eventOf(day()) === 'petalrain' && g.world === 'earth' && !g.focusOverride;
  const picked = () => { const f = F(); if (f.petals.day !== day()) { f.petals = { day: day(), got: [] }; } return f.petals; };
  const isPicked = (key: string) => F().petals.day === day() && F().petals.got.includes(key);
  const petalZone = (x: number, z: number) => {
    const s = I.worldSample(x, z);
    if (s.island?.id !== 'home' || s.coast <= 6 || (s.water ?? -Infinity) > s.h) return false;
    if (s.kind === 'cliff' || s.kind === 'rock' || s.kind === 'sand' || s.kind === 'river') return false;
    const zone = (() => { try { return g.geo?.zoneAt?.(x, z)?.zone ?? null; } catch { return null; } })();
    return zone ? zone === 'flower' || zone === 'sakura' : s.kind === 'grass';
  };
  const liveChunks = new Set<PetalChunk>();
  g.chunks.add({
    key: 'calendar-petals', size: 64, radius: 130,
    build: ({ cx, cz, size }) => {
      const spots = petalSpots(cx, cz, size, ctx.rng, petalZone, 5);
      if (!spots.length) return null;
      const r = ctx.rng(`calendar-petals:look:${cx},${cz}`);
      const full: PetalSpot[] = spots.map((s) => ({ ...s, y: I.heightAt(s.x, s.z), phase: r() * Math.PI * 2 }));
      const pc = buildPetalChunk(full, r);
      pc.group.userData.calendarPetals = pc;
      pc.group.visible = petalOn();
      liveChunks.add(pc);
      return pc.group;
    },
    dispose: (o) => { const pc = o.userData.calendarPetals as PetalChunk | undefined; if (pc) liveChunks.delete(pc); },
  });
  const rain = new PetalRain(ctx.rng('calendar-petalrain'), Math.round(RAIN_N * Math.max(0.35, Math.min(1, g.chunks.detail ?? 1))));
  out.add(rain.mesh);
  let lastPick = 0;
  const pickPetal = (pc: PetalChunk, s: PetalSpot, t: number) => {
    const n = petalAmount(s.key, day(), ctx.rng);
    const got = giveItem('m_petal', n, 'petalrain');
    if (got <= 0) { if (t - lastPick > 2) { lastPick = t; toast('가방이 꽉 찼어요! 🎒'); } return false; }
    lastPick = t;
    picked().got.push(s.key);
    save();
    emit({ type: 'harvest', kind: 'petal', item: 'm_petal', n: got, island: 'home' });
    toast(`🌸 꽃잎 +${got}`);
    posePetalChunk(pc, t, isPicked);
    return true;
  };
  let poseAcc = 0;
  const stepPetals = (t: number, dt: number) => {
    const on = petalOn();
    const p = g.player.pos;
    for (const pc of liveChunks) pc.group.visible = on;
    const onHome = on && (() => { const d = I.islandAt(p.x, p.z); return d?.id === 'home'; })();
    rain.update(onHome, t, dt, p.x, p.y, p.z);
    if (!on) return;
    poseAcc += dt;
    const pose = poseAcc >= 1 / 30;
    if (pose) poseAcc = 0;
    for (const pc of liveChunks) {
      const s0 = pc.spots[0];
      if (!s0 || Math.abs(s0.x - p.x) > 140 || Math.abs(s0.z - p.z) > 140) continue;
      for (const s of pc.spots) {
        if (isPicked(s.key)) continue;
        if (Math.hypot(s.x - p.x, s.z - p.z) < PETAL_PICK && Math.abs(s.y - p.y) < 3) pickPetal(pc, s, t);
      }
      if (pose) posePetalChunk(pc, t, isPicked);
    }
  };

  // ───────────── 갱신 ─────────────
  let acc = TICK;
  let sailAcc = 0;
  const tick = (t: number) => {
    deliverMorning();
    stepWeekday(t);
    stepForce();
    routineTick();
    if (!travelSynced) travelSynced = syncTravel();
    syncFlag();
    // 지나가며 들른 부표
    if (g.world === 'earth' && !g.focusOverride) {
      const n = nearBuoy(g.player.pos.x, g.player.pos.z, BUOY_VISIT);
      if (n) visit(n.b);
    }
  };
  g.onUpdate((t, dt) => {
    acc += dt;
    if (acc >= TICK) { acc = 0; tick(t); }
    stepPetals(t, dt);
    // 다른 섬에 발을 디뎠나(루틴 '항해')
    sailAcc += dt;
    if (sailAcc >= 1) {
      sailAcc = 0;
      if (g.world === 'earth' && !g.focusOverride && !(F().routine.day === day() && (F().routine.c[RC.sail] ?? 0) > 0)) {
        const s = I.worldSample(g.player.pos.x, g.player.pos.z);
        if (s.island && s.island.id !== 'home' && s.coast > 0) routineTick(RC.sail, 1, 1);
      }
    }
  });

  // ───────────── 공개 API ─────────────
  const api = {
    boosts,
    today,
    unread: () => unreadCount(F().box),
    mail: (): Mail[] => JSON.parse(JSON.stringify(F().box)) as Mail[],
    /** id 하나(없으면 전부) 읽음 — 남은 안 읽은 수 */
    read: (id?: string) => { if (id) markRead(id); else readAll(); return unreadCount(F().box); },
    /** 첨부 선물 다 받기 — 받은 묶음 수 */
    claimAll,
    open: (tab = 'inbox') => { curBuoy = null; deliverMorning(); g.hud.open(MAIL_KIND, tab); if (tab === 'inbox') routineTick(RC.mail, 1, 1); },
    routine: () => { rollRoutine(F(), day()); return routineRows(F().routine.c).map((r) => ({ id: r.def.id, icon: r.def.icon, text: r.def.text, have: r.have, goal: r.goal, done: r.done })); },
    letters: (buoyId?: string) => lettersAt(buoyId ?? null),
    deliver: (rid: string, buoyId?: string) => deliver(rid, buoyId ?? null),
    buoys: () => buoyList().map((b) => ({ id: b.id, n: b.n, name: buoyName(b.n), x: b.x, z: b.z, links: BUOY_LINKS[b.id] ?? null, seen: F().buoys.seen.includes(b.id) })),
  };
  g.ext.calendar = api;

  // ───────────── 디버그 ─────────────
  if (typeof window !== 'undefined') {
    (window as unknown as { __calendar?: unknown }).__calendar = {
      ...api,
      state: () => JSON.parse(JSON.stringify(F())) as CalFlags,
      deliverMorning: (force = true) => deliverMorning(force),
      claim,
      gotoMailbox: () => { const m = mailboxXZ(); g.player.teleport(m.x + 1.6, m.z + 1.2); return m; },
      gotoBuoy: (n = 1) => { const b = buoyList().find((x) => x.n === n) ?? buoyList()[0]; if (!b) return null; g.player.teleport(b.x + 3, b.z + 3); return b; },
      openBuoy,
      visit: (id: string) => { const b = buoyById(id); return b ? visit(b) : false; },
      petals: () => [...liveChunks].flatMap((pc) => pc.spots.map((s) => ({ key: s.key, x: +s.x.toFixed(1), z: +s.z.toFixed(1), picked: isPicked(s.key) }))),
      /** 가장 가까운 꽃잎 소용돌이 줍기(월요일만) */
      pickPetal: () => {
        if (!petalOn()) return null;
        const p = g.player.pos;
        let best: { pc: PetalChunk; s: PetalSpot; d: number } | null = null;
        for (const pc of liveChunks) for (const s of pc.spots) {
          if (isPicked(s.key)) continue;
          const d = Math.hypot(s.x - p.x, s.z - p.z);
          if (!best || d < best.d) best = { pc, s, d };
        }
        return best && pickPetal(best.pc, best.s, g.time) ? best.s.key : null;
      },
      bump: (key: string, n = 1) => { routineTick(key, n); return api.routine(); },
      tick: () => { tick(g.time); return JSON.parse(JSON.stringify(F())) as CalFlags; },
    };
  }
  return out;
}
