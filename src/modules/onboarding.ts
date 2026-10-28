// onboarding — 처음 노는 사람에게 '그때그때 하나씩' 알려 주는 안내. 말하는 건 아기 별 반짝이(플레이어 어깨 옆에 안내할 때만 뿅).
// 키 벽(환영 카드) 대신: 걷기 → 달리기 → 점프를 차례로, 그 밖엔 상황이 맞을 때(말 걸 것 옆 · 물가 · 깊은 물 · 첫 아이템/편지 ·
// 첫 잡기 · 첫 코인 · 첫 탈것 · 5분 뒤 카메라) 딱 한 번씩. 이미 해 본 건 건너뛰고, 안내 사이엔 6~10초 조용히 쉰다.
// 타이틀·창·연출·사진 모드·잠금 중엔 쉬고(떠 있던 건 잠깐 숨었다 다시), 해내면 "잘했어요!" 하고 하품하며 떠난다.
// 그리기: game.hud.hint 가 받아 주면(true) 말풍선(과 hud 의 반짝이)은 그쪽 몫 — 별이 둘 되지 않게 3D 반짝이는 숨긴다.
// 안 받으면(렌더러에 showHint 가 없음) 여기서 3D 반짝이 별 + 말풍선을 직접 그린다. ?onbview=own 이면 늘 직접 그린다.
// hud 가 3D 별을 쓰고 싶으면 game.ext.onboarding.buddy 를 보고 자기 별을 빼고, 말풍선을 anchor() 자리에 붙이면 된다.
// 촬영(shot=1)·onb=0 이면 아예 쉰다. onb=1 이면 촬영에서도 켠다.
//
// flags.onboarding = { v:1, done: {안내 id: 'done'|'ttl'|'skip'}, play: 논 시간(초) }
// 읽기만: flags.ui.tutorial · flags.ui.hints(hud) · flags.env.sec(atmosphere) — 예전부터 놀던 사람이면 움직이기 안내는 건너뛴다.
// game.ext.onboarding (주인: onboarding) = { buddy: 3D 반짝이를 지금 이쪽이 그리나, anchor(): 반짝이 화면 자리 {x,y}|null, active(): 떠 있는 안내 id|null }
// window.__onboarding = { state(), reset(), next(), signals(), view }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { EconApi } from '../core/api';
import {
  HINTS, blankSignals, gapOf, initialRec, isVeteran, makeState, parseText, readFlags, step, finishActive,
  type HintDef, type OnbFlags, type OnbState, type Signals,
} from './onboarding/logic';
import { BuddyView } from './onboarding/view';

// hud(12)가 이번 실행에서 flags.ui.tutorial 을 적기 전에 '예전 사람인가'를 본다
export const order = 11;

/** game.hud.hint(UX 웨이브 계약) — 받아 주면 true. anchor 는 덤(렌더러가 읽으면 말풍선이 반짝이 옆에 붙는다) */
type HintFn = (o: {
  id: string; text: string; keys?: string[]; until?: () => boolean; ttl?: number; priority?: number; again?: boolean;
  anchor?: () => { x: number; y: number } | null;
}) => unknown;
type HudExtra = { hint?: HintFn; hideHint?: (id: string) => void; stageBusy?: () => boolean; attached?: boolean };

/** 상호작용 id 가 낚시(물가 E)인가 */
const isFishId = (id: string | undefined) => !!id && id.startsWith('fishing') && id !== 'fishing:norod' && id !== 'fishing:bait';
/** 일반 'E 로 하기' 안내에서 빼는 것(낚시·탈것은 따로 알려 준다) */
const isGenericId = (id: string | undefined) => !id || !(id.startsWith('fishing') || id.startsWith('vehicles'));
/** 말랑 주머니(또는 예전 가방)로 보이는 창 이름 */
const POUCH_RE = /pocket|pouch|malang|jelly|ring|bag|말랑/i;
const ROD_KEYS = ['tool:rod', 'tool:goodrod', 'tool:goldrod'];
/** 큰 배너 뒤에서 기다리는 최대 시간(초) */
const STAGE_WAIT_MAX = 8;

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const st = game.state;
  const q = new URLSearchParams(location.search);
  const forced = q.get('onb');
  const ownView = q.get('onbview') === 'own';
  if (forced === '0' || (q.get('shot') === '1' && forced !== '1')) return;

  const econ = () => (game.econ as EconApi | null) ?? null;
  const ext = game.ext as { story?: { playing?: () => unknown }; photo?: { active?: () => boolean } };
  const hud = game.hud as typeof game.hud & HudExtra;
  const g = game as typeof game & { started?: boolean };

  // ── 저장 · 시작 기록
  const uiF = (st.flags.ui ?? {}) as { tutorial?: boolean; hints?: unknown };
  const envF = (st.flags.env ?? {}) as { sec?: number };
  const saved = readFlags(st.flags.onboarding);
  const veteran = isVeteran({ hasOnbFlags: !!saved, tutorialSeen: !!uiF.tutorial, envSec: Number(envF.sec) || 0, dexIds: Object.keys(st.dex) });
  const flags = (): OnbFlags => {
    const f = readFlags(st.flags.onboarding) ?? { v: 1 as const, done: {}, play: 0 };
    st.flags.onboarding = f;
    return f;
  };
  let S: OnbState = makeState(initialRec(HINTS, saved, uiF.hints, veteran));
  let playSec = saved?.play ?? 0;
  const persist = () => { const f = flags(); f.done = { ...S.rec }; f.play = Math.round(playSec); st.save(); };
  if (!saved || Object.keys(S.rec).length !== Object.keys(saved.done).length) persist();

  // 틈(6~10초) — 고정 난수
  let gapN = 0;
  const gapRng = ctx.rng('onboarding:gap');
  const nextGap = () => { gapN++; return gapOf(gapRng()); };

  // ── 신호(처음부터 쭉 지켜본다)
  const sig: Signals = blankSignals({ hasRod: true });
  const openUi = new Map<string, number>();
  let started = g.started !== false;
  const isStarted = () => started || g.started !== false;

  st.on((e) => {
    const ev = e as { type: string; [k: string]: unknown };
    switch (ev.type) {
      case 'game:start': started = true; break;
      case 'bag': if (isStarted() && Number(ev.delta) > 0) sig.gotItem = true; break;
      case 'collect':
        if (isStarted() && ev.kept !== false) sig.gotItem = true;
        if (ev.activity) sig.caught = true;
        sig.interacted = true;
        break;
      case 'catch': sig.caught = true; if (ev.activity === 'fish') sig.fished = true; break;
      case 'catch-fail': if (ev.activity === 'fish') sig.fished = true; break;
      case 'harvest': case 'npc-talk': case 'gift': case 'chest-open': sig.interacted = true; break;
      case 'mail': if (isStarted()) sig.gotMail = true; break;
      case 'coins': if (isStarted() && Number(ev.delta) > 0) sig.gotCoins = true; break;
      case 'sell': case 'open-shop': sig.sold = true; break;
      case 'summon': case 'mount': sig.summoned = true; break;
      case 'ui-open': {
        const k = String(ev.kind ?? '');
        openUi.set(k, performance.now());
        if (POUCH_RE.test(k)) sig.pouchOpened = true;
        if (k === 'dex') sig.dexOpened = true;
        break;
      }
      case 'ui-close': openUi.delete(String(ev.kind ?? '')); break;
    }
  });
  hud.onChange((kind) => {
    if (!kind) return;
    if (POUCH_RE.test(kind)) sig.pouchOpened = true;
    if (kind === 'dex') sig.dexOpened = true;
    if (kind === 'shop') sig.sold = true;
  });

  // ── 반짝이
  const view = new BuddyView({ camera: game.engine.camera, anchor: () => game.player.pos, rng: ctx.rng('onboarding:spark') });
  /** hud.hint 에 맡긴 지금 말풍선 */
  let hintLive: { id: string; over: boolean } | null = null;
  /** done = 해내서 끝(hud 가 반짝 퐁) · 아니면 스르르 */
  const dropHint = (done = false) => {
    if (!hintLive) return;
    const live = hintLive;
    live.over = done;
    try { hud.hideHint?.(live.id); } catch { /* 없어도 until 로 사라진다 */ }
    live.over = true;
    hintLive = null;
  };
  /** 지금 안내를 hud.hint 가 그리나 */
  let delegated = false;
  game.ext.onboarding = { get buddy() { return !delegated; }, anchor: () => view.screen, active: () => S.active?.id ?? null };

  const busyNow = () => {
    if (hud.isOpen() || game.player.locked || game.focusOverride) return true;
    try { if (ext.story?.playing?.()) return true; } catch { /* 없으면 아님 */ }
    try { if (ext.photo?.active?.()) return true; } catch { /* 없으면 아님 */ }
    const now = performance.now();
    for (const [k, at] of openUi) { if (now - at > 90_000) openUi.delete(k); else return true; }
    return false;
  };

  const hasRod = () => {
    const e = econ();
    if (e && typeof e.isUnlocked === 'function') return ROD_KEYS.some((k) => e.isUnlocked(k));
    return st.has('tool_rod');
  };

  const showHint = (def: HintDef, resumed = false) => {
    const t = parseText(def.text);
    dropHint();
    let taken = false;
    if (!ownView && typeof hud.hint === 'function') {
      const live = { id: `onboarding:${def.id}`, over: false };
      try {
        // 한 번만은 여기서 지킨다(again) · ttl 은 넉넉히(끝내기는 이쪽이 until 로)
        taken = hud.hint({
          id: live.id, text: def.text, keys: t.keys, ttl: (def.ttl + 2) * 1000, priority: def.priority, again: true,
          until: () => live.over, anchor: () => view.screen,
        }) === true;
      } catch (e) { console.error('[onboarding] hud.hint', e); }
      if (taken) hintLive = live;
    }
    delegated = taken;
    view.show(t.parts, { bubble: !taken, star: !taken });
    // 잠깐 숨었다 돌아올 땐 또 삑 하지 않는다
    if (!resumed) { try { game.audio?.sfx('talk-blip', { pitch: 1.7, vol: 0.55 }); } catch { /* 소리 없어도 된다 */ } }
  };
  const endHint = (def: HintDef, why: 'done' | 'ttl') => {
    dropHint(why === 'done');
    // hud 가 그리던 안내면 퐁은 hud 몫 — 여기선 (숨은) 내 별 자리에 반짝이를 터뜨리지 않고 소리만
    if (delegated) {
      view.pause();
      if (why === 'done') { try { game.audio?.sfx('star', { pitch: 1.35, vol: sig.busy ? 0.5 : 0.6 }); } catch { /* 소리 없어도 된다 */ } }
      return;
    }
    // 창이 열려서 끝난 거면(주머니·도감·상점) 창 위에 말풍선을 남기지 않고 톡 사라진다
    if (why === 'done' && sig.busy) { view.pause(); try { game.audio?.sfx('star', { pitch: 1.35, vol: 0.5 }); } catch { /* 소리 없어도 된다 */ } return; }
    if (why === 'done') {
      view.yay(def.yay ?? '잘했어요!');
      try { game.audio?.sfx('star', { pitch: 1.35, vol: 0.6 }); } catch { /* 소리 없어도 된다 */ }
    } else view.away();
  };

  // ── 매 프레임(실제 시간 — 촬영 모드 dt=0 이어도 안내는 흐른다)
  const prev = new THREE.Vector3().copy(game.player.pos);
  let lastNow = performance.now();
  let vehT = 0, saveT = 0;
  let lastCurrent: string | null = null;
  let stageHeld = 0;

  game.onUpdate(() => {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    const p = game.player, inp = game.input;
    sig.started = isStarted();
    // 큰 배너·연출이 떠 있으면 새 안내는 기다린다(떠 있던 안내는 그대로)
    // (배너가 줄줄이 이어져도 8초 넘게는 안 기다린다 — 그 뒤엔 무시하고 띄운다)
    let stage = false;
    if (!S.active && hud.attached !== false) { try { stage = !!hud.stageBusy?.(); } catch { stage = false; } }
    // (안내가 떠 있는 동안엔 재지 않고 그대로 둔다 — 다음 안내가 또 8초를 처음부터 기다리지 않게)
    if (!S.active) stageHeld = stage ? stageHeld + dt : 0;
    sig.busy = busyNow() || (stage && stageHeld < STAGE_WAIT_MAX);
    sig.world = game.world;

    // 움직이기(순간이동은 빼고 — 한 프레임 3 m 넘으면 무시)
    const dx = p.pos.x - prev.x, dz = p.pos.z - prev.z;
    const d = Math.hypot(dx, dz);
    prev.copy(p.pos);
    const ax = inp.axis();
    const moving = !p.mounted && !p.locked && (ax.x !== 0 || ax.y !== 0);
    if (sig.started && moving && d < 3) sig.movedM += d;
    if (sig.started && moving && (inp.down('ShiftLeft') || inp.down('ShiftRight')) && p.mode === 'ground') sig.ranSec += dt;
    if (sig.started && !p.mounted && !p.locked && inp.hit('Space')) sig.jumped = true;

    // 상호작용 · 낚시
    const cur = game.current;
    const curId = cur ? (cur.id ?? cur.label) : null;
    sig.nearInteract = !!cur && !p.mounted && isGenericId(cur.id) && (!cur.key || cur.key === 'KeyE');
    sig.nearFishWater = !!cur && isFishId(cur.id);
    if (inp.hit('KeyE')) {
      const id = curId ?? lastCurrent;
      if (id) { sig.interacted = true; if (isFishId(id)) sig.fished = true; }
    }
    if (p.action === 'cast' || p.action === 'fish' || p.action === 'reel') sig.fished = true;
    lastCurrent = curId;

    // 바다: 수영 중 발밑이 깊으면(2.5 m+)
    if (p.mode === 'dive') sig.dived = true;
    if (p.mode === 'swim' && game.world === 'earth' && !p.mounted) {
      const wy = ctx.island.waterLevelAt(p.pos.x, p.pos.z);
      sig.deepWater = Number.isFinite(wy) && wy - game.groundAt(p.pos.x, p.pos.z) > 2.5;
    } else sig.deepWater = false;

    // 키로 해 본 것들
    if (inp.hit('Tab')) sig.pouchOpened = true;
    if (inp.hit('KeyB')) sig.dexOpened = true;
    if (inp.hit('KeyV')) sig.camToggled = true;
    if (inp.hit('KeyF') && !game.currentAlt) sig.summoned = true;
    if (p.mounted) sig.summoned = true;

    // 가끔만 보는 것(1초마다)
    vehT -= dt;
    if (vehT <= 0) {
      vehT = 1;
      sig.hasRod = hasRod();
      try { sig.ownsVehicle = (game.vehicles?.owned()?.length ?? 0) > 0; } catch { sig.ownsVehicle = false; }
    }
    if (sig.started && !sig.busy) playSec += dt;
    sig.playSec = playSec;

    const before = Object.keys(S.rec).length;
    const out = step(S, HINTS, sig, dt, nextGap);
    if (out.show) showHint(out.show);
    if (out.pause) { view.pause(); dropHint(); }
    if (out.resume) showHint(out.resume, true);
    if (out.end) endHint(out.end.def, out.end.why);
    if (Object.keys(S.rec).length !== before) persist();
    else if ((saveT += dt) > 15) { saveT = 0; persist(); }

    view.update(dt);
  });

  // ── 디버그 훅
  (window as unknown as { __onboarding: unknown }).__onboarding = {
    state: () => ({
      active: S.active ? { ...S.active } : null,
      quiet: +S.quiet.toFixed(2),
      rec: { ...S.rec },
      pending: HINTS.filter((d) => !(d.id in S.rec)).map((d) => d.id),
      veteran, started: isStarted(), busy: sig.busy, playSec: Math.round(playSec), gaps: gapN,
      delegated, buddy: view.state,
    }),
    signals: () => ({ ...sig }),
    /** 기록을 지우고 처음부터(움직이기 신호도 0 으로) */
    reset: () => {
      dropHint();
      view.clear();
      S = makeState({});
      Object.assign(sig, blankSignals({ hasRod: sig.hasRod, ownsVehicle: sig.ownsVehicle }));
      playSec = 0;
      persist();
      return S.rec;
    },
    /** 떠 있는 안내를 끝내고 틈 없이 다음으로 */
    next: () => {
      const def = finishActive(S, HINTS);
      if (def) endHint(def, 'ttl');
      S.quiet = 0;
      persist();
      return def?.id ?? null;
    },
    view,
  };

  return view.group;
}
