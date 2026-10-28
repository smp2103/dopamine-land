// hud — 화면 UI(계약 v2 5장의 렌더러). game.hud 레지스트리에 그리기(HudView)를 붙이고, 기본 패널 7개
// (도감 B · 가방 I · 상점 · 제작 · 박물관 · 게시판 · 큰 지도 M) + 말랑 주머니(Tab) · 설정 · 조작 안내, 칩(시계 · 지갑 · 가방 칸), 단축키,
// 행동 안내 칩, 게이지(두근·콤보)를 건다.
// wave 7(UX): 평소 화면은 거의 비어 있다 — 해/달 시계 방울 · 행동 안내 · 지역 이름 · 필요할 때만 게이지. 칩은 바뀔 때만 살짝 떠오르고(peek),
//   전부는 Tab 말랑 주머니(플레이어 둘레 젤리 방울 고리 + 상태 무지개)에서. 앱 방울을 고르면 그 창이 열리고, 닫으면 주머니로 돌아온다.
//   놀기 전(game.started === false)엔 HUD 가 투명하고 배너·토스트는 줄만 선다 — 'game:start' 뒤 스르르.
//   처음 안내 말풍선 game.hud.hint(...) 는 별 친구 반짝이가 말한다(본 id 는 flags.ui.hints).
// 종 모델 썸네일(hud/thumbs — 엔진 렌더러로 한 프레임에 하나) · 지도 섬 모양(hud/map — 쉬는 시간에 굽기)도 여기서 만든다.
// 가방을 상점·박물관 창에서 Tab 으로 열면 그 자리를 실어 연다(팔기·기증 버튼은 거기서만).
// 시계는 game.env 만 읽는다(없으면 '—'). 돈·별·열쇠·가방은 game.econ 만 읽는다. 섬 이름은 game.geo.
// 날씨 배너 글·잡기 특수 연출은 hudfx(wave 3) 몫 — 여기는 기본 잡았다/상자/대화/토스트만.
//
// flags.ui = { tutorial: (옛) 처음 안내를 봤나, hudHidden: HUD 숨김(\ 키), minimap: 미니맵 켬, hints: 본 안내 id[],
//              seen: {dex: 등록 수, map: 가 본 섬 수, journal: {day, n}} — 주머니 방울 뱃지(새로 생긴 만큼) }
// flags.hud = { dexFilter: 도감 섬 필터 }
// window.__hud = { open(kind, tab?, arg?), close(), current(), cards(), banners(), gauges(), hide(on?), view,
//                 thumbs() {drawn, pending, cached}, map() {baked, progress}, bakeMap(),
//                 pocket() 주머니 상태 · pocketKey(code) · peek(id, ms?) · peeks() · stage() · hint(opts) · hints() · minimap(on?) · started() }
import type { Ctx } from '../core/types';
import type { ChipDef, EconApi, GaugeOpts, HintOpts, HotkeyDef, PanelDef } from '../core/api';
import { isTypingTarget } from '../core/registry';
import { promptText } from '../core/interact';
import { QUALITY, QUALITY_ORDER, type QualityName } from '../core/quality';
import { CSS } from './hud/style';
import { HudView } from './hud/renderer';
import { registerBuiltinPanels, makeLook } from './hud/panels';
import { BAG } from './economy/data';
import { HUD_KEYS, POCKET_KIND, bagArgFrom, bagView, clockView, keyCap, pocketKeyAction, promptChips, selectHotkeys, unlockCard } from './hud/logic';
import { pocketApps, badgeText, controlRows, type AppIn } from './hud/present';
import type { PocketApp } from './hud/pocket';
import { Thumbs } from './hud/thumbs';
import { IslandShapes } from './hud/map';

export const order = 12;

/** 두근 게이지(GDD 5.3) — 같은 id 로 다른 모듈(hudfx 등)이 덮어써도 된다 */
const PITY_GAUGES: Array<{ id: string; label: string; act: 'fish' | 'bug' | 'dive' }> = [
  { id: 'pity:fish', label: '🎣 두근 낚시', act: 'fish' },
  { id: 'pity:bug', label: '🦋 두근 곤충', act: 'bug' },
  { id: 'pity:dive', label: '🤿 두근 잠수', act: 'dive' },
];
/** 주머니 방울 이름(짧게) — 없으면 창 제목 */
const SHORT: Record<string, string> = {
  journal: '일지', mail: '우편', garage: '탈것', friends: '친구', netplayplay: '같이 놀기', story: '토토', letter: '병편지',
  settings: '설정', controls: '조작 안내', '@photo': '사진',
};
/** 주머니가 다루는 키(열려 있을 때) */
const POCKET_NAV = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Enter', 'NumpadEnter', 'Space', 'KeyE',
  'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']);

type UiFlags = {
  tutorial?: boolean; hudHidden?: boolean; helped?: boolean; minimap?: boolean; hints?: string[];
  seen?: { dex?: number; map?: number; journal?: { day: number; n: number } };
};

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const st = game.state;
  const econ = () => (game.econ as EconApi | null) ?? null;
  const ext = game.ext as Record<string, unknown>;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const look = makeLook(game);
  const view = new HudView(game, ctx, look);
  view.installToast();
  game.ui.renderCatch = (c, isNew) => view.renderCatch(c, isNew);

  // ── 설정(flags.ui): HUD 숨김 · 미니맵 · 본 것
  const uiF = (st.flags.ui ??= {}) as UiFlags;
  if (uiF.helped) { uiF.tutorial = true; delete uiF.helped; st.save(); }
  uiF.seen ??= {};
  view.setHidden(!!uiF.hudHidden);
  view.setMinimap(uiF.minimap === true || new URLSearchParams(location.search).get('minimap') === '1');
  const setHidden = (on: boolean) => { uiF.hudHidden = on; view.setHidden(on); st.save(); game.ui.toast(on ? 'HUD 를 숨겼어요 ( \\ 로 다시 보기)' : 'HUD 가 돌아왔어요!'); };

  // ── 썸네일(엔진 렌더러 공유) · 지도 섬 모양
  const thumbs = new Thumbs(game.engine);
  view.attachThumbs(thumbs);
  const shapes = new IslandShapes(ctx.island.ISLANDS, (x, z) => ctx.island.heightAt(x, z));
  view.shapes = shapes;

  // ── 패널(그리기는 각 패널의 render)
  const { map: mapPanel } = registerBuiltinPanels(game, look, { thumbs, shapes });

  // ── 칩: 해/달 시계 방울(env 만 · 늘 제자리) · 지갑 · 가방 칸
  const clockChip: ChipDef = {
    id: 'hud:clock', order: 0, peek: false,
    render(el) {
      el.innerHTML = '<div class="clock" title="말랑 시계"><div class="orb sun"><i class="ray"></i></div><div class="tt"><div class="t">—</div><div class="d"></div></div><div class="o2"><i></i></div></div>';
    },
    update(el) {
      const v = clockView(game.env);
      const pl = view.place();
      const box = el.firstElementChild as HTMLElement;
      const t = el.querySelector('.t') as HTMLElement, d = el.querySelector('.d') as HTMLElement;
      const orb = el.querySelector('.orb') as HTMLElement;
      const tt = v.ready ? `${v.time}<span class="wi">${v.weatherIcon}</span>` : '—';
      if (t.innerHTML !== tt) t.innerHTML = tt;
      const dd = v.ready ? `<span class="wd">${v.weekday}</span>${v.day}` : '시계를 맞추는 중…';
      if (d.innerHTML !== dd) d.innerHTML = dd;
      const sc = `orb ${pl.space ? 'planet' : v.sky === 'none' ? 'day' : v.sky}`;
      if (orb.className !== sc) orb.className = sc;
      if (box.title !== pl.name) box.title = `${pl.name} · ${v.weatherName}`;
      box.classList.toggle('space', pl.space);
      if (pl.space) {
        const o = game.space?.oxygen;
        (el.querySelector('.o2 i') as HTMLElement).style.width = `${o && o.max > 0 ? Math.max(0, Math.min(1, o.value / o.max)) * 100 : 100}%`;
      }
    },
  };
  const bagChip: ChipDef = {
    id: 'hud:bag', order: 20,
    render(el) {
      el.innerHTML = '<div class="chip bagc dl-card" title="가방 (I)"><div class="ci">🎒</div><span class="v">—</span><div class="bar"><i></i></div></div>';
      (el.firstElementChild as HTMLElement).onclick = () => game.hud.open('bag');
    },
    update(el) {
      const v = bagView(econ()?.bag ?? null, st.bag, BAG.base);
      const box = el.firstElementChild as HTMLElement;
      const tx = el.querySelector('.v') as HTMLElement;
      const text = `가방 ${v.text}`;
      if (tx.textContent !== text) tx.textContent = text;
      (el.querySelector('.bar i') as HTMLElement).style.width = `${v.ratio * 100}%`;
      box.classList.toggle('full', v.full);
    },
  };
  game.hud.registerChip(clockChip);
  game.hud.registerChip(view.walletChip());
  game.hud.registerChip(bagChip);

  // ───────────── 말랑 주머니 · 설정 · 조작 안내 ─────────────
  let fromPocket = false; // 주머니에서 연 창 — 닫히면 주머니로 돌아간다
  const hasPanel = (k: string) => !!game.hud.panel(k);
  /** 이 창을 여는 단축키 글자 */
  const capOf = (kind: string): string | undefined => {
    if (kind === 'dex') return 'B';
    if (kind === 'bag') return 'I';
    if (kind === 'map') return 'M';
    if (kind === '@photo') return game.hud.hotkeys().some((h) => h.code === 'KeyP') ? 'P' : undefined;
    const hk = game.hud.hotkeys().find((h) => h.panel === kind);
    return hk ? keyCap(hk.code) : undefined;
  };
  /** 지금 보일까(상황이 안 맞으면 방울을 숨긴다) */
  const whenOf = (kind: string): boolean => {
    const hk = game.hud.hotkeys().find((h) => h.panel === kind && h.when);
    if (hk) { try { if (!hk.when!()) return false; } catch { return false; } }
    if (kind === 'story') { try { return !!(ext.story as { met?(): boolean } | undefined)?.met?.(); } catch { return false; } }
    if (kind === 'netplayplay') return !!(ext.net as { connected?: boolean } | undefined)?.connected;
    return true;
  };
  const countDisc = () => {
    const geo = game.geo;
    if (!geo?.discovered) return 0;
    let n = 0;
    for (const d of ctx.island.ISLANDS) { try { if (geo.discovered(d.id)) n++; } catch { /* 없음 */ } }
    return n;
  };
  const missionsDone = () => {
    try {
      const m = (ext.meta as { missions?(): Array<{ done: boolean }> } | undefined)?.missions?.();
      return Array.isArray(m) ? m.filter((x) => x.done).length : 0;
    } catch { return 0; }
  };
  const today = () => Math.floor(game.env?.day ?? 0);
  /** 방울 뱃지 — 창이 badge() 를 주면 그것, 아니면 공개 API 로 '새로 생긴 만큼' */
  const badgeOf = (kind: string, def: PanelDef | null): string => {
    if (def?.badge) { try { return badgeText(def.badge()); } catch { return ''; } }
    const seen = uiF.seen!;
    switch (kind) {
      case 'dex': return badgeText(Object.keys(st.dex).length - (seen.dex ?? Object.keys(st.dex).length));
      case 'bag': { const v = bagView(econ()?.bag ?? null, st.bag, BAG.base); return v.full ? '!' : ''; }
      case 'map': return badgeText(countDisc() - (seen.map ?? countDisc()));
      case 'mail': { try { return badgeText((ext.calendar as { unread?(): number } | undefined)?.unread?.()); } catch { return ''; } }
      case 'journal': { const j = seen.journal; const n = missionsDone(); return badgeText(j && j.day === today() ? n - j.n : n); }
      case 'story': {
        try { return badgeText((ext.story as { chains?(): Array<{ status: string }> } | undefined)?.chains?.().filter((c) => c.status === 'ready').length); } catch { return ''; }
      }
      default: return '';
    }
  };
  /** 창을 열었으면 '본 것' 을 적는다(뱃지가 사라진다) */
  const markSeen = (kind: string) => {
    const seen = uiF.seen!;
    if (kind === 'dex') seen.dex = Object.keys(st.dex).length;
    else if (kind === 'map') seen.map = countDisc();
    else if (kind === 'journal') seen.journal = { day: today(), n: missionsDone() };
    else return;
    st.save();
  };
  // 처음 보는 저장이면 지금을 기준으로(옛 저장의 모든 칸이 '새것' 뱃지가 되지 않게)
  if (uiF.seen.dex === undefined) uiF.seen.dex = Object.keys(st.dex).length;
  // 지도도 같은 식 — 다만 섬 정보(geo)는 조금 늦게 오니 놀기 시작한 뒤 첫 틱에 기준을 잡는다
  let mapBase = uiF.seen.map !== undefined;
  const baseMap = () => {
    if (mapBase || !view.started || !game.geo?.discovered) return;
    mapBase = true;
    if (uiF.seen!.map === undefined) uiF.seen!.map = countDisc();
  };

  const enterPhoto = () => {
    const ph = ext.photo as { enter?(): void } | undefined;
    if (ph?.enter) { ph.enter(); return; }
    game.hud.hotkeys().find((h) => h.code === 'KeyP')?.run();
  };
  const buildPocket = (): PocketApp[] => {
    const list: Array<AppIn & { def: PanelDef | null }> = [];
    for (const def of game.hud.panels()) {
      list.push({ kind: def.kind, title: SHORT[def.kind] ?? def.title, icon: def.icon ?? '✨', color: def.color, app: def.app, when: whenOf(def.kind), def });
    }
    if (game.hud.hotkeys().some((h) => h.code === 'KeyP') || ext.photo) list.push({ kind: '@photo', title: '사진', icon: '📷', color: '#9fd4ff', def: null });
    return pocketApps(list).map((a) => ({
      kind: a.kind, title: a.title, icon: a.icon ?? '✨', color: a.color ?? '#ffb36b', cap: capOf(a.kind),
      badge: () => badgeOf(a.kind, a.def),
      run: () => {
        if (a.kind === '@photo') { fromPocket = false; game.hud.close(); enterPhoto(); return; }
        fromPocket = true;
        game.hud.open(a.kind);
      },
    }));
  };
  view.pocketApps = buildPocket;
  game.hud.registerPanel({ kind: POCKET_KIND, title: '말랑 주머니', icon: '🫧', color: '#ffb3c6', app: false, render() { /* 렌더러가 창 대신 고리로 그린다 */ } });

  // 설정: 그래픽 · 소리 · 카메라 · 미니맵 · 저장
  const muted = () => {
    const a = game.audio as (NonNullable<typeof game.audio> & { settings?: { muted?: boolean } }) | null;
    return !!(a?.muted ?? a?.settings?.muted);
  };
  const seg = (ctl: string, opts: Array<[string, string]>, cur: string) =>
    `<div class="seg" data-ctl="${ctl}">${opts.map(([v, l]) => `<button class="sg${v === cur ? ' on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  game.hud.registerPanel({
    kind: 'settings', title: '설정', icon: '⚙️', color: '#a8d8ff', app: { order: 900 },
    render(body, pc) {
      const eng = game.engine;
      const q = eng.quality as QualityName;
      body.innerHTML = `<div class="setg">
        <div class="srow dl-card"><div class="si">🎨</div><div class="sl">그래픽 품질<small>버벅이면 낮춰 봐요 · G 로도 바꿔요</small></div>${seg('q', QUALITY_ORDER.map((k) => [k, QUALITY[k].label]), q)}</div>
        <div class="srow dl-card"><div class="si">🎵</div><div class="sl">소리<small>N 으로도 켜고 꺼요</small></div>${seg('snd', [['on', '켜기'], ['off', '끄기']], muted() ? 'off' : 'on')}</div>
        <div class="srow dl-card"><div class="si">🎥</div><div class="sl">카메라<small>모험은 멀리, 아늑은 동글동글 · V</small></div>${seg('cam', [['adventure', '모험'], ['cozy', '아늑']], game.cam.style)}</div>
        <div class="srow dl-card"><div class="si">🗺️</div><div class="sl">미니맵<small>오른쪽 아래 둥근 지도</small></div>${seg('map', [['on', '보이기'], ['off', '숨기기']], view.minimap ? 'on' : 'off')}</div>
        <div class="srow dl-card"><div class="si">💾</div><div class="sl">저장<small>저절로도 저장돼요 — 마음 놓고 놀아요</small></div><div class="acts"><button class="btn big" data-act="save">지금 저장하기</button>${hasPanel('save') ? '<button class="btn big gold" data-act="code">세이브 코드</button>' : ''}</div></div>
      </div>`;
      body.querySelectorAll<HTMLElement>('.seg').forEach((sg) => {
        sg.querySelectorAll<HTMLButtonElement>('.sg').forEach((b) => (b.onclick = () => {
          const v = b.dataset.v!;
          switch (sg.dataset.ctl) {
            case 'q': eng.setQuality(v as QualityName); eng.onQualityChange?.(v as QualityName); game.hud.toast(`그래픽 품질 '${QUALITY[v as QualityName].label}'`); break;
            case 'snd': game.audio?.mute(v === 'off'); game.hud.toast(v === 'off' ? '쉿, 소리를 껐어요' : '소리를 켰어요! 🎵'); break;
            case 'cam': game.cam.setStyle(v as 'adventure' | 'cozy'); break;
            case 'map': uiF.minimap = v === 'on'; view.setMinimap(uiF.minimap); st.save(); break;
          }
          pc.rerender();
        }));
      });
      (body.querySelector('[data-act="save"]') as HTMLElement | null)?.addEventListener('click', () => {
        try { (st as { saveNow?(): void }).saveNow?.() ?? st.save(); } catch { st.save(); }
        game.hud.toast('저장했어요! 💾');
      });
      (body.querySelector('[data-act="code"]') as HTMLElement | null)?.addEventListener('click', () => game.hud.open('save'));
    },
  });
  // 조작 안내: 움직임 키 + 이름 있는 단축키 전부
  game.hud.registerPanel({
    kind: 'controls', title: '조작 안내', icon: '🎮', color: '#c8b6ff', app: { order: 910 },
    render(body) {
      const groups = controlRows(game.hud.hotkeys());
      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
      body.innerHTML = `<div class="ctls">${groups.map((g) => `<div class="cg"><div class="sec">${g.icon} ${esc(g.title)}</div><div class="cgrid">${g.rows.map((r) =>
        `<div class="crow dl-card"><span class="caps">${r.caps.map((c) => `<kbd>${esc(c)}</kbd>`).join('')}</span><span class="cl">${esc(r.label)}</span></div>`).join('')}</div></div>`).join('')}</div>`;
    },
  });
  // 주머니에서 연 창을 닫으면 주머니로 돌아간다(Esc 한 번 더 = 완전히 닫기)
  game.hud.onChange((kind, prev) => {
    if (kind) markSeen(kind);
    if (kind === POCKET_KIND) { fromPocket = false; return; }
    if (kind === null && prev === POCKET_KIND) { fromPocket = false; return; }
    if (kind === null && prev && fromPocket) {
      fromPocket = false;
      queueMicrotask(() => { if (!game.hud.isOpen() && !game.player.locked) game.hud.open(POCKET_KIND); });
    }
  });

  // ── 단축키(GDD 3.11): Tab 말랑 주머니 · B 도감 · I 가방 · M 지도 · Esc 닫기 · \ HUD 숨기기
  for (const k of HUD_KEYS) {
    const def: HotkeyDef = {
      id: k.id, code: k.code, label: k.label, hint: k.hint, panel: k.panel,
      when: k.action === 'close' ? () => game.hud.isOpen() : undefined,
      run: () => {
        if (k.action === 'pocket') {
          const cur = game.hud.current();
          const a = pocketKeyAction(cur ? { kind: cur.kind, arg: cur.arg } : null);
          if (a.do === 'close') game.hud.close();
          else if (a.do === 'bag') game.hud.open('bag', undefined, a.arg);
          else { fromPocket = false; game.hud.open(POCKET_KIND); }
        } else if (k.action === 'toggle' && k.kind === 'bag' && !game.hud.isOpen('bag')) {
          // 가방은 상점·박물관 창에서 열면 그 자리를 싣는다(팔기·기증 버튼)
          const cur = game.hud.current();
          game.hud.open('bag', k.tab, bagArgFrom(cur ? { kind: cur.kind, arg: cur.arg } : null));
        } else if (k.action === 'toggle') game.hud.toggle(k.kind!, k.tab);
        else if (k.action === 'close') game.hud.close();
        else setHidden(!uiF.hudHidden);
      },
    };
    game.hud.registerHotkey(def);
  }

  // ── 그리기 붙이기(쌓인 등록·열기·배너·카드·게이지가 여기서 풀린다)
  game.hud.attach(view);

  // 창이 바뀌면 ui-open / ui-close
  game.hud.onChange((kind, prev) => {
    if (prev) st.emit({ type: 'ui-close', kind: prev });
    if (kind) st.emit({ type: 'ui-open', kind });
  });

  // ── 행동 안내: 코어 프롬프트는 숨기고(CSS) 같은 내용을 E·F 칩으로
  const coreSetPrompt = game.ui.setPrompt.bind(game.ui);
  game.ui.setPrompt = (primary: string | null, alt?: string | null) => {
    coreSetPrompt(primary, alt);
    const cur = game.current && promptText(game.current) === primary ? game.current : null;
    const curAlt = game.currentAlt && promptText(game.currentAlt) === (alt ?? null) ? game.currentAlt : null;
    view.setPrompts(promptChips(primary, alt ?? null, cur, curAlt));
  };
  view.setPrompts(promptChips(game.ui.promptState.primary, game.ui.promptState.alt));

  // ── 게이지: 두근(천장) · 상자 · 콤보 — 값이 바뀔 때만 레지스트리로
  const lastG = new Map<string, string>();
  const gauge = (id: string, g: GaugeOpts) => {
    const sig = `${g.label}|${g.value.toFixed(3)}|${g.show}|${g.color}`;
    if (lastG.get(id) === sig) return;
    lastG.set(id, sig);
    game.hud.gauge(id, g);
  };
  const feedGauges = () => {
    const E = econ();
    if (!E) { view.setCombo(0); return; }
    // hudfx 가 있으면 두근 게이지(상황별로 보였다 숨김)는 hudfx 몫 — 여기선 콤보만
    const fx = !!(window as unknown as { __hudfx?: unknown }).__hudfx;
    if (!fx && typeof E.pity === 'function') {
      for (const p of PITY_GAUGES) {
        let v = 0;
        try { v = Number(E.pity(p.act)?.gauge) || 0; } catch { v = 0; }
        gauge(p.id, { label: p.label, value: v, color: '#ff9fb8', show: v > 0 });
      }
    }
    if (!fx && typeof E.chestPity === 'function') {
      let v = 0;
      try { v = Number(E.chestPity()?.gauge) || 0; } catch { v = 0; }
      gauge('pity:chest', { label: '🎁 두근 상자', value: v, color: '#ffcf4a', show: v > 0 });
    }
    view.setCombo(typeof E.combo === 'number' ? E.combo : 0);
  };

  // ── 이벤트
  let rr = false;
  const rerender = () => {
    if (rr || !game.hud.isOpen()) return;
    rr = true;
    queueMicrotask(() => { rr = false; game.hud.rerender(); });
  };
  const REDRAW = new Set(['coins', 'stars', 'bag', 'unlock', 'sell', 'buy', 'craft', 'donate', 'request-done', 'register', 'collect']);
  st.on((e) => {
    switch (e.type) {
      case 'game:start': view.markStarted(); break;
      case 'open-panel': game.hud.open(String(e.kind ?? 'dex'), e.tab as string | undefined, e.arg); break;
      case 'open-shop': game.hud.open('shop', undefined, { shop: (e.shop as string) || 'quack' }); break;
      case 'open-craft': game.hud.open('craft'); break;
      case 'open-museum': game.hud.open('museum'); break;
      case 'open-board': game.hud.open('board'); break;
      case 'open-shipyard':
        if (game.hud.panel('shipyard')) game.hud.open('shipyard');
        else game.hud.open('shop', 'buy', { shop: 'shipyard' });
        break;
      case 'coins': view.bump('.coinp'); view.coinDelta(Number(e.delta) || 0); break;
      case 'stars': view.bump('.starp'); view.starDelta(Number(e.delta) || 0); break;
      case 'bag-full': game.ui.toast('가방이 꽉 찼어요!'); view.shakeChip('hud:bag'); break;
      case 'unlock': {
        const c = unlockCard(String(e.key ?? ''), e.why as string | undefined, look.unlockName);
        if (c) game.hud.card(c);
        break;
      }
      // hudfx 가 흔들림 뒤에 전리품을 쏟아 주니 그때는 바로 뜨는 카드를 생략(미믹·빈 상자는 hud 카드 그대로)
      case 'chest-open':
        if ((window as unknown as { __hudfx?: unknown }).__hudfx && e.mimic !== true && e.source !== 'mimic' && Array.isArray(e.loot) && e.loot.length) break;
        view.showLoot(String(e.tier ?? 'wood'), (e.loot as Array<{ id: string; n: number; name?: string }>) ?? [], e.mimic === true || e.source === 'mimic'); break;
      case 'catch': case 'catch-fail': feedGauges(); break;
    }
    if (REDRAW.has(e.type)) rerender();
  });
  // 시작 신호가 창(window) 이벤트로 올 수도 있다
  window.addEventListener('game:start', () => view.markStarted());

  // ── 매 프레임: 주머니 키 → 단축키 디스패치(코어가 E/F 를 먼저 고른 뒤) → 그리기
  let gaugeAt = -1;
  let bakeAt = -1;
  game.onUpdate((_t, dt) => {
    const pressed = game.input.pressed;
    if (pressed.size) {
      const typing = isTypingTarget(document.activeElement);
      let navUsed = false;
      if (!typing && view.openKind() === POCKET_KIND) {
        for (const code of pressed) if (POCKET_NAV.has(code) && view.pocketKey(code)) { navUsed = true; break; }
      }
      if (!navUsed) {
        const picked = selectHotkeys(game.hud.hotkeys(), pressed, game.consumedKeys, {
          typing,
          locked: game.player.locked,
          openKind: game.hud.current()?.kind ?? null,
        });
        for (const hk of picked) { try { hk.run(); } catch (err) { console.error(`[hotkey ${hk.code}]`, err); } }
      }
    }
    view.tick(dt);
    baseMap();
    thumbs.pump();
    if (game.hud.isOpen('map')) mapPanel.tick();
    const n = performance.now();
    // 놀기 시작하고 20초 뒤 미니맵용 섬 모양을 쉬는 시간에 굽는다(큰 지도를 먼저 열면 그때)
    if (bakeAt < 0) bakeAt = n + 20000;
    else if (n > bakeAt && bakeAt > 0) { bakeAt = 0; shapes.start(game.player.pos); }
    if (gaugeAt < 0 || n - gaugeAt > 1000) { gaugeAt = n; feedGauges(); }
  });

  // ── 디버그 훅
  (window as unknown as { __hud: unknown }).__hud = {
    open: (kind: string, tab?: string, arg?: unknown) => { game.hud.open(kind, tab, arg); return game.hud.current(); },
    close: () => game.hud.close(),
    current: () => game.hud.current(),
    cards: () => view.cardList(),
    banners: () => ({ current: view.banners.cur, pending: [...view.banners.pending()] }),
    gauges: () => Object.fromEntries(game.hud.gauges),
    hide: (on?: boolean) => { setHidden(on ?? !uiF.hudHidden); return !!uiF.hudHidden; },
    view,
    thumbs: () => ({ drawn: thumbs.q.drawn, pending: thumbs.pending(), enabled: thumbs.enabled() }),
    thumb: (id: string) => thumbs.get(id),
    map: () => ({ baked: shapes.done(), progress: shapes.progress() }),
    bakeMap: () => { shapes.start(game.player.pos); return shapes.progress(); },
    pocket: () => view.pocketInfo(),
    pocketKey: (code: string) => view.pocketKey(code),
    peek: (id: string, ms?: number) => { game.hud.peek(id, ms); return view.peekList(); },
    peeks: () => view.peekList(),
    stage: () => view.stageInfo(),
    hint: (h: HintOpts) => game.hud.hint(h),
    hints: () => view.hintInfo(),
    minimap: (on?: boolean) => { if (on !== undefined) { uiF.minimap = on; view.setMinimap(on); st.save(); } return view.minimap; },
    started: () => view.started,
  };
}
