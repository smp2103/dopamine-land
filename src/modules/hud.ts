// hud — 화면 UI(계약 v2 5장의 렌더러). game.hud 레지스트리에 그리기(HudView)를 붙이고, 기본 패널 6개
// (도감 B · 가방 Tab/I · 상점 · 제작 · 박물관 · 게시판)와 칩(시계 · 가방 칸), 단축키, 행동 안내 칩, 게이지(두근·콤보)를 건다.
// 시계는 game.env 만 읽는다(없으면 '—'). 돈·별·열쇠·가방은 game.econ 만 읽는다. 섬 이름은 game.geo.
// 날씨 배너 글·잡기 특수 연출은 hudfx(wave 3) 몫 — 여기는 기본 잡았다/상자/대화/토스트만.
//
// flags.ui = { tutorial: 처음 안내를 봤나, hudHidden: HUD 숨김(` 키) }   flags.hud = { dexFilter: 도감 섬 필터 }
// window.__hud = { open(kind, tab?, arg?), close(), current(), cards(), banners(), gauges(), hide(on?), view }
import type { Ctx } from '../core/types';
import type { ChipDef, EconApi, GaugeOpts, HotkeyDef } from '../core/api';
import { isTypingTarget } from '../core/registry';
import { promptText } from '../core/interact';
import { CSS } from './hud/style';
import { HudView } from './hud/renderer';
import { registerBuiltinPanels, makeLook } from './hud/panels';
import { BAG } from './economy/data';
import { HUD_KEYS, bagView, clockView, promptChips, selectHotkeys, unlockCard } from './hud/logic';

export const order = 12;

/** 두근 게이지(GDD 5.3) — 같은 id 로 다른 모듈(hudfx 등)이 덮어써도 된다 */
const PITY_GAUGES: Array<{ id: string; label: string; act: 'fish' | 'bug' | 'dive' }> = [
  { id: 'pity:fish', label: '🎣 두근 낚시', act: 'fish' },
  { id: 'pity:bug', label: '🦋 두근 곤충', act: 'bug' },
  { id: 'pity:dive', label: '🤿 두근 잠수', act: 'dive' },
];

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const st = game.state;
  const econ = () => (game.econ as EconApi | null) ?? null;
  const SHOT = new URLSearchParams(location.search).get('shot') === '1';

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const look = makeLook(game);
  const view = new HudView(game, ctx, look);
  view.installToast();
  game.ui.renderCatch = (c, isNew) => view.renderCatch(c, isNew);

  // ── 설정(flags.ui): 처음 안내 · HUD 숨김
  const uiF = (st.flags.ui ??= {}) as { tutorial?: boolean; hudHidden?: boolean; helped?: boolean };
  if (uiF.helped) { uiF.tutorial = true; delete uiF.helped; st.save(); }
  view.setHidden(!!uiF.hudHidden);
  const setHidden = (on: boolean) => { uiF.hudHidden = on; view.setHidden(on); st.save(); game.ui.toast(on ? 'HUD 를 숨겼어요 ( ` 로 다시 보기)' : 'HUD 가 돌아왔어요!'); };

  // ── 패널(그리기는 각 패널의 render)
  registerBuiltinPanels(game, look);

  // ── 칩: 시계(env 만) · 가방 칸
  const clockChip: ChipDef = {
    id: 'hud:clock', order: 0,
    render(el) {
      el.innerHTML = '<div class="clock dl-card"><div class="sun"></div><div><div class="t">—</div><div class="d"></div></div><div class="place">—</div><div class="o2"><i></i></div></div>';
    },
    update(el) {
      const v = clockView(game.env);
      const pl = view.place();
      const box = el.firstElementChild as HTMLElement;
      const t = el.querySelector('.t') as HTMLElement, d = el.querySelector('.d') as HTMLElement;
      const sun = el.querySelector('.sun') as HTMLElement, place = el.querySelector('.place') as HTMLElement;
      const tt = v.ready ? `${v.time}<span class="wi">${v.weatherIcon}</span>` : '—';
      if (t.innerHTML !== tt) t.innerHTML = tt;
      const dd = v.ready ? `<span class="wd">${v.weekday}</span>${v.day} · ${v.weatherName}` : '시계를 맞추는 중…';
      if (d.innerHTML !== dd) d.innerHTML = dd;
      const sc = `sun ${pl.space ? 'planet' : v.sky === 'none' ? 'day' : v.sky}`;
      if (sun.className !== sc) sun.className = sc;
      if (place.textContent !== pl.name) place.textContent = pl.name;
      place.style.background = pl.color;
      box.classList.toggle('space', pl.space);
      if (pl.space) {
        const o = game.space?.oxygen;
        (el.querySelector('.o2 i') as HTMLElement).style.width = `${o && o.max > 0 ? Math.max(0, Math.min(1, o.value / o.max)) * 100 : 100}%`;
      }
    },
  };
  const bagChip: ChipDef = {
    id: 'hud:bag', order: 20,
    render(el) { el.innerHTML = '<div class="chip bagc dl-card" title="가방 (Tab)"><div class="ci">🎒</div><span class="v">—</span><div class="bar"><i></i></div></div>'; },
    update(el) {
      const v = bagView(econ()?.bag ?? null, st.bag, BAG.base);
      const box = el.firstElementChild as HTMLElement;
      const tx = el.querySelector('.v') as HTMLElement;
      if (tx.textContent !== v.text) tx.textContent = v.text;
      (el.querySelector('.bar i') as HTMLElement).style.width = `${v.ratio * 100}%`;
      box.classList.toggle('full', v.full);
    },
  };
  game.hud.registerChip(clockChip);
  game.hud.registerChip(bagChip);

  // ── 단축키(GDD 3.11): B 도감 · Tab 가방 · I 가방(옛 키) · Esc 닫기 · ` HUD 숨기기
  for (const k of HUD_KEYS) {
    const def: HotkeyDef = {
      id: k.id, code: k.code, label: k.label, hint: k.hint, panel: k.panel,
      when: k.action === 'close' ? () => game.hud.isOpen() : undefined,
      run: () => {
        if (k.action === 'toggle') game.hud.toggle(k.kind!, k.tab);
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
    if (typeof E.pity === 'function') {
      for (const p of PITY_GAUGES) {
        let v = 0;
        try { v = Number(E.pity(p.act)?.gauge) || 0; } catch { v = 0; }
        gauge(p.id, { label: p.label, value: v, color: '#ff9fb8', show: v > 0 });
      }
    }
    if (typeof E.chestPity === 'function') {
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
      case 'stars': view.bump('.starp'); break;
      case 'bag-full': game.ui.toast('가방이 꽉 찼어요!'); view.shakeChip('hud:bag'); break;
      case 'unlock': {
        const c = unlockCard(String(e.key ?? ''), e.why as string | undefined, look.unlockName);
        if (c) game.hud.card(c);
        break;
      }
      case 'chest-open': view.showLoot(String(e.tier ?? 'wood'), (e.loot as Array<{ id: string; n: number; name?: string }>) ?? [], e.mimic === true || e.source === 'mimic'); break;
      case 'catch': case 'catch-fail': feedGauges(); break;
    }
    if (REDRAW.has(e.type)) rerender();
  });

  // ── 매 프레임: 단축키 디스패치(코어가 E/F 를 먼저 고른 뒤) + 그리기
  let gaugeAt = -1;
  game.onUpdate((_t, dt) => {
    const pressed = game.input.pressed;
    if (pressed.size) {
      const picked = selectHotkeys(game.hud.hotkeys(), pressed, game.consumedKeys, {
        typing: isTypingTarget(document.activeElement),
        locked: game.player.locked,
        openKind: game.hud.current()?.kind ?? null,
      });
      for (const hk of picked) { try { hk.run(); } catch (err) { console.error(`[hotkey ${hk.code}]`, err); } }
    }
    view.tick(dt);
    const n = performance.now();
    if (gaugeAt < 0 || n - gaugeAt > 1000) { gaugeAt = n; feedGauges(); }
  });

  // ── 처음 안내(촬영 모드에선 안 띄움)
  if (!uiF.tutorial && !SHOT) {
    const help = document.createElement('div');
    help.className = 'help dl-card';
    help.innerHTML = `<div class="title">♪ 도파민랜드에 온 걸 환영해요!</div>
      <div class="k"><span class="key"><b>WASD</b></span>걷기</div><div class="k"><span class="key"><b>Shift</b></span>달리기</div>
      <div class="k"><span class="key"><b>Space</b></span>점프·활공</div><div class="k"><span class="key"><b>E</b></span>상호작용</div>
      <div class="k"><span class="key"><b>B</b></span>도감</div><div class="k"><span class="key"><b>Tab</b></span>가방</div>
      <div class="k"><span class="key"><b>V</b></span>카메라</div><div class="k"><span class="key"><b>C</b></span>잠수</div>`;
    view.root.appendChild(help);
    setTimeout(() => { help.style.opacity = '0'; }, 9000);
    setTimeout(() => help.remove(), 10000);
    uiF.tutorial = true;
    st.save();
  }

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
  };
}
