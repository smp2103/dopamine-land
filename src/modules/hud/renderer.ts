// HUD 렌더러(계약 v2 5장 HudRenderer) — game.hud 레지스트리가 부르는 실제 그리기.
// wave 7 "모든 게 게임 속에 녹아든다": 평소 화면은 거의 비어 있다 — 왼쪽 위 말랑한 해/달 시계 방울 하나, 물건 앞 행동 안내(E·F),
// 새 지역 이름, 그리고 필요할 때만 게이지(수영 힘·산소·콤보 — 다 차면 스르르 사라진다). 미니맵은 설정에서 켠다.
// 칩(가방·지갑·우편·루틴·섬 별…)은 늘 떠 있지 않고 내용이 바뀔 때만 플레이어 쪽에서 방울처럼 떠올라 왼쪽 위로(bubbles.ts PeekView),
// 전부 보려면 Tab — 말랑 주머니(pocket.ts): 플레이어 둘레 젤리 방울 고리 + 위쪽 상태 무지개(모든 칩).
// 큰 배너·지역 이름·가운데 카드는 하나씩(present.ts Stage, 사이 0.6초), 토스트는 한 줄(ToastLine), 놀기 전(game.started=false)·컷신 중엔 줄만 선다.
// 놀기 전엔 HUD 전체가 투명 — 'game:start' 뒤 0.6초 동안 스르르 나타난다. 처음 안내는 별 친구 반짝이 말풍선(HintView).
// 창(등록 패널 무엇이든) · 미니맵(+등록 지도 층) · 잡았다/상자/대화 도 여기서. 무엇을 열지·언제 닫을지는 레지스트리가 정한다.
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import type { Game } from '../../core/game';
import type { BannerOpts, CardOpts, ChipDef, GaugeOpts, HintOpts, HotkeyDef, HudHelpers, HudRenderer, MapLayerDef, PanelCtx, PanelDef, ToPx } from '../../core/api';
import type { CatchShow } from '../../core/ui';
import { VARIANT_LABEL } from '../../core/ui';
import { MAT, TIERS, CAT_ICON, RARITY_COLOR, ISLAND_LOOK } from '../economy/data';
import {
  TimedQueue, ToastDedupe, countStep, gaugeHot, gaugeValue, gaugeVisible, keyView, KEY_LOOK, pickTab, POCKET_KIND,
  comboText, type HudTab, type PromptChip, type CardItem,
} from './logic';
import type { Look } from './panels/common';
import { PLANET_NAME, fogSet } from './logic';
import type { Thumbs } from './thumbs';
import type { IslandShapes } from './map';
import { drawIsland, drawPin } from './map';
import { Stage, ToastLine, PeekTracker, HintQueue, chipSig, comboShown, startedOf, isCinematic, GAUGE_FADE_MS, type PeekResult } from './present';
import { PeekView, FloatPops, HintView } from './bubbles';
import { PocketView, type PocketApp } from './pocket';

const h = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—');
const hold = () => !!(window as unknown as { __hudHold?: boolean }).__hudHold;
const now = () => performance.now();

/** 넓게 여는 패널(도감) — 다른 모듈 패널은 def 에 wide:true 를 붙이면 된다 */
const WIDE = new Set(['dex']);
/** 지도 반지름(m) */
const MAP_R = 3000;
/** 늘 제자리에 있는 칩(시계) */
const CLOCK_CHIP = 'hud:clock';
/** 상황 게이지처럼 내용이 있는 동안 늘 보이는 칩(ChipDef.peek === 'live' 와 같다) */
const LIVE_CHIPS = new Set(['vehicles:wind']);
/** 섬 사이를 건너거나 집에 드나든 뒤(초점이 바뀐 뒤) 배너를 쉬는 시간(ms) */
const FOCUS_SETTLE_MS = 1200;

/** 상자 등급 → 이름·색(계약 등급 wood…space + 예전 등급 common…legend) */
const CHEST_LOOK: Record<string, { name: string; color: string; glow: string; n: number }> = {
  wood: { name: '나무', color: '#c98f55', glow: '#ffe2b8', n: 24 }, silver: { name: '은', color: '#b8c4d6', glow: '#ffffff', n: 34 },
  gold: { name: '금', color: '#ffcf4a', glow: '#fff3c4', n: 56 }, rainbow: { name: '무지개', color: '#ff9fb8', glow: '#c9f3ff', n: 80 },
  space: { name: '우주', color: '#a99bff', glow: '#e5e2ff', n: 48 },
};
// 경제 표의 등급 색·이름을 덮되, 꽃가루 수(n)는 위 기본값(없으면 예전 등급 규칙)을 지킨다
for (const [k, t] of Object.entries(TIERS)) CHEST_LOOK[k] = { name: t.name, color: t.color, glow: t.glow, n: CHEST_LOOK[k]?.n ?? (k === 'legend' ? 80 : k === 'epic' ? 56 : 30) };

/** 큰 연출 자리에 서는 것: 배너 · 지역 이름 */
type StageEntry = { kind: 'banner'; ms: number; b: BannerOpts } | { kind: 'region'; ms: number; r: { name: string; sub: string; color: string; dark: string } };

export class HudView implements HudRenderer {
  readonly root: HTMLElement;
  helpers: Partial<HudHelpers>;
  private $ = (s: string) => this.root.querySelector(s) as HTMLElement;
  // 창
  private win: HTMLElement; private wTtl: HTMLElement; private wMeta: HTMLElement; private wTabs: HTMLElement; private wBody: HTMLElement;
  private cur: { def: PanelDef; ctx: PanelCtx } | null = null;
  // 칩: 시계 자리 · 숨은 보관함 · 늘 보이는 상황 칩 줄 · 떠오르는 방울
  private clockSlot: HTMLElement; private store: HTMLElement; private livesEl: HTMLElement;
  private chipEls = new Map<string, { def: ChipDef; el: HTMLElement }>();
  readonly peeks = new PeekTracker();
  private peekView: PeekView;
  private bumpAt = new Map<string, number>();
  private floats: FloatPops;
  // 게이지
  private gaugesEl: HTMLElement; private gaugeEls = new Map<string, HTMLElement>(); private comboEl: HTMLElement;
  private comboN = 0; private comboAt = -1e9;
  private promptsEl: HTMLElement; private promptSig = '';
  // 배너·지역 이름(큰 연출 자리 하나) · 카드 · 토스트 한 줄
  private bannerEl: HTMLElement; private cardEl: HTMLElement;
  readonly stage = new Stage<StageEntry>();
  readonly cards = new TimedQueue<CardItem>(3200, 8);
  readonly toasts = new ToastLine(900, 4);
  private toastEl: HTMLElement | null = null;
  // 지갑(칩 'hud:wallet' 안)
  private coinV: HTMLElement | null = null; private starV: HTMLElement | null = null; private keyP: HTMLElement | null = null;
  private shownCoins: number; private shownStars = 0; private keySig = '';
  // 지도
  private cv: HTMLCanvasElement; private g2: CanvasRenderingContext2D; private mapEl: HTMLElement; private mapLbl: HTMLElement;
  private layerErr = new Set<string>();
  private minimapOn = false;
  // 지역 이름
  private region: HTMLElement; private curIsland: string | null | undefined;
  // 대화·잡았다·상자
  private talk: HTMLElement; private typeTimer = 0; private talkTimer = 0;
  /** 놀기 전·컷신 동안 들어온 대사(문이 열리면 차례로) */
  private talkQ: Array<{ who: string; line: string; ms: number }> = [];
  private talkUntil = 0;
  private catchEl: HTMLElement; private catchTimer = 0;
  private lootEl: HTMLElement; private lootTimer = 0;
  private dedupe = new ToastDedupe(1500);
  private coreToast: (text: string, ms?: number) => void;
  private rnd: () => number;
  private lastSlow = -1; private lastChip = -1;
  private readonly SHOT = new URLSearchParams(location.search).get('shot') === '1';
  // 놀기 시작 · 초점 바뀜
  private startedFlag = false;
  private forceStarted = false;
  private focusRef: THREE.Vector3 | null = null;
  private focusSettle = 0;
  // 말랑 주머니 · 안내 말풍선
  private pocket: PocketView;
  /** 주머니 방울 목록(hud.ts 가 붙인다) */
  pocketApps: () => PocketApp[] = () => [];
  private hintView: HintView;
  readonly hints: HintQueue;
  private hiddenFlag = false;
  private _v = new THREE.Vector3();
  /** 모델 썸네일(hud.ts 가 붙인다) · 섬 모양(미니맵·큰 지도 공용) */
  thumbs: Thumbs | null = null;
  shapes: IslandShapes | null = null;

  constructor(private game: Game, private ctx: Ctx, private look: Look) {
    this.rnd = ctx.rng('hud:confetti');
    this.root = h(`<div id="dl" class="prestart">
      <div class="clockslot"></div>
      <div class="chipstore" aria-hidden="true"></div>
      <div class="card dl-card"><div class="ci"></div><div><div class="ct"></div><div class="cb"></div></div></div>
      <div class="gauges"><div class="lives"></div><div class="combo"></div></div>
      <div class="map dl-card off"><canvas width="380" height="380"></canvas><div class="n">N</div><div class="lbl">—</div></div>
      <div class="prompts"></div>
      <div class="banner"><div class="bt"></div><div><div class="bs"></div></div></div>
      <div class="region"><div class="nm"></div><div class="sub"><i></i><span></span><i></i></div></div>
      <div class="catch"><div class="burst"></div><div class="box dl-card"></div></div>
      <div class="talk dl-card"><div class="who"></div><div class="tx"></div><div class="nx">▼</div></div>
      <div class="loot"></div>
      <div class="win dl-card"><div class="hd"><div class="ttl"></div><div class="meta"></div><button class="x" title="닫기 (Esc)">✕</button></div><div class="tabs"></div><div class="body"></div></div>
    </div>`);
    document.body.appendChild(this.root);
    this.win = this.$('.win'); this.wTtl = this.$('.win .ttl'); this.wMeta = this.$('.win .meta'); this.wTabs = this.$('.win .tabs'); this.wBody = this.$('.win .body');
    this.$('.win .x').onclick = () => game.hud.close();
    this.clockSlot = this.$('.clockslot'); this.store = this.$('.chipstore');
    this.gaugesEl = this.$('.gauges'); this.comboEl = this.$('.combo'); this.livesEl = this.$('.gauges .lives');
    this.promptsEl = this.$('.prompts');
    this.bannerEl = this.$('.banner'); this.cardEl = this.$('.card');
    this.shownCoins = game.state.coins;
    this.cv = this.root.querySelector('.map canvas') as HTMLCanvasElement;
    this.g2 = this.cv.getContext('2d')!;
    this.mapEl = this.$('.map'); this.mapLbl = this.$('.map .lbl');
    this.region = this.$('.region');
    this.talk = this.$('.talk');
    this.catchEl = this.$('.catch'); this.lootEl = this.$('.loot');
    // 떠오르는 방울 · 숫자 · 반짝이 · 말랑 주머니(창보다 아래, 배너보다 위)
    this.peekView = new PeekView(this.root);
    this.root.insertBefore(this.peekView.el, this.store);
    this.floats = new FloatPops(this.root);
    this.hintView = new HintView(this.root);
    const uiF = (game.state.flags.ui ??= {}) as { hints?: string[] };
    this.hints = new HintQueue(new Set(Array.isArray(uiF.hints) ? uiF.hints : []), (id) => {
      const f = (game.state.flags.ui ??= {}) as { hints?: string[] };
      f.hints = [...new Set([...(Array.isArray(f.hints) ? f.hints : []), id])].slice(-200);
      game.state.save();
    });
    this.pocket = new PocketView(this.root, {
      project: () => this.project(0.95),
      sfx: (name, o) => { try { game.audio?.sfx(name, o); } catch { /* 소리 없음 */ } },
      dismiss: () => game.hud.close(),
    });
    this.coreToast = game.ui.toast.bind(game.ui);
    this.helpers = {
      confetti: (el, colors, n) => this.confetti(el, colors, n),
      ico: (id) => look.ico(id), name: (id) => look.name(id), color: (id) => look.color(id),
      esc, fmt,
      thumb: (id) => this.thumbs?.get(id) ?? null,
    };
  }

  /** 썸네일이 다 그려지면 기다리던 칸(data-th)을 그림으로 바꿔 끼운다 */
  attachThumbs(t: Thumbs) {
    this.thumbs = t;
    t.onReady((ids) => {
      for (const id of ids) {
        const url = t.get(id);
        if (!url) continue;
        this.root.querySelectorAll<HTMLElement>(`[data-th="${CSS.escape(id)}"]`).forEach((el) => {
          const img = document.createElement('img');
          img.className = 'th pop'; img.src = url; img.alt = ''; img.draggable = false;
          el.replaceWith(img);
        });
      }
    });
  }

  // ───────────── 화면 자리 ─────────────
  /** 플레이어 몸 위 dy(m) 자리 → 화면 px(뒤·화면 밖이면 null) */
  project(dy = 1.2): { x: number; y: number } | null {
    const p = this.game.player.pos;
    this._v.set(p.x, p.y + dy, p.z).project(this.game.engine.camera);
    if (!Number.isFinite(this._v.x) || this._v.z > 1 || this._v.z < -1) return null;
    const x = (this._v.x * 0.5 + 0.5) * window.innerWidth, y = (-this._v.y * 0.5 + 0.5) * window.innerHeight;
    if (x < -60 || y < -60 || x > window.innerWidth + 60 || y > window.innerHeight + 60) return null;
    return { x, y };
  }
  private head() { return this.project(1.75) ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.45 }; }

  // ───────────── 놀기 시작 · 막 ─────────────
  /** 놀기 시작했나(game.started 가 false 일 때만 아직) */
  get started() { return this.forceStarted || startedOf((this.game as unknown as { started?: unknown }).started); }
  /** 'game:start' 를 들었다 */
  markStarted() { this.forceStarted = true; }
  /** 큰 연출·토스트를 지금 띄워도 되나: 놀기 시작 · 컷신 아님 · 초점이 막 바뀌지 않음 */
  presentGate(t = now()): boolean {
    if (!this.started) return false;
    let owners: string[] = [];
    try { owners = this.game.player.lockedBy?.() ?? []; } catch { owners = []; }
    if (isCinematic(owners)) return false;
    return t >= this.focusSettle;
  }
  private syncStarted(t: number) {
    const s = this.started;
    if (s === this.startedFlag) return;
    this.startedFlag = s;
    if (s) {
      // 스르르(0.6초) — 처음 화면은 거의 비어 있다
      this.root.classList.remove('prestart');
      this.root.classList.add('wake');
      window.setTimeout(() => this.root.classList.remove('wake'), 900);
      // 시작하자마자 뜰 큰 연출은 숨 한 번 고르고
      this.stage.claim(450, t);
    } else this.root.classList.add('prestart');
  }
  private watchFocus(t: number) {
    const f = this.game.focusOverride;
    if (f === this.focusRef) return;
    this.focusRef = f;
    this.focusSettle = t + FOCUS_SETTLE_MS;
  }

  // ───────────── 창(패널) ─────────────
  openPanel(def: PanelDef, pc: PanelCtx): void {
    if (!this.cur) this.game.player.lock('hud');
    const wasPocket = this.cur?.def.kind === POCKET_KIND;
    this.cur = { def, ctx: pc };
    if (def.kind === POCKET_KIND) {
      // 창 대신 말랑 주머니 — 떠 있던 칩 방울은 무지개로 옮긴다
      this.win.classList.remove('on');
      this.wBody.innerHTML = '';
      this.root.classList.remove('panel');
      this.root.classList.add('pocketing');
      this.peeks.clear(now());
      this.peekView.clear((el) => this.giveBack(el));
      const chips = this.game.hud.chips().filter((d) => d.id !== CLOCK_CHIP).map((d) => this.chipEls.get(d.id)?.el).filter((e): e is HTMLElement => !!e);
      this.pocket.open(this.pocketApps(), chips, (el) => this.giveBack(el));
      return;
    }
    if (wasPocket || this.pocket.isOpen) { this.pocket.close(); this.root.classList.remove('pocketing'); }
    this.root.classList.add('panel');
    this.draw();
    this.win.classList.remove('on'); void this.win.offsetWidth;
    this.win.classList.add('on');
  }
  renderPanel(def: PanelDef, pc: PanelCtx): void {
    if (!this.cur || this.cur.def.kind !== def.kind) { this.openPanel(def, pc); return; }
    this.cur = { def, ctx: pc };
    if (def.kind === POCKET_KIND) return;
    this.draw();
  }
  closePanel(): void {
    if (!this.cur) return;
    const was = this.cur.def.kind;
    this.cur = null;
    if (was === POCKET_KIND || this.pocket.isOpen) { this.pocket.close(); this.root.classList.remove('pocketing'); }
    this.root.classList.remove('panel');
    this.win.classList.remove('on');
    this.wBody.innerHTML = '';
    this.game.player.unlock('hud', true);
  }
  /** 열린 패널 kind(디버그) */
  openKind() { return this.cur?.def.kind ?? null; }
  /** 주머니 키(열려 있을 때만) — 다룬 키면 true */
  pocketKey(code: string) { return this.pocket.key(code); }
  pocketInfo() { return this.pocket.info(); }

  private draw() {
    const c = this.cur;
    if (!c) return;
    const { def, ctx: pc } = c;
    this.win.classList.toggle('wide', WIDE.has(def.kind) || !!def.wide);
    this.win.style.setProperty('--wc', def.color || '#ffb36b');
    this.wTtl.textContent = `${def.icon ? def.icon + ' ' : ''}${def.title}`;
    try { this.wMeta.textContent = def.meta?.() ?? ''; } catch (e) { console.error(`[hud] ${def.kind}.meta`, e); this.wMeta.textContent = ''; }
    let list: HudTab[] = [];
    try { list = (def.tabs?.() ?? []) as HudTab[]; } catch (e) { console.error(`[hud] ${def.kind}.tabs`, e); }
    const active = pickTab(pc.tab, list, def.defaultTab);
    this.wTabs.classList.toggle('compact', list.length > 5);
    this.wTabs.style.display = list.length > 1 ? '' : 'none';
    this.wTabs.innerHTML = list.map((t) => `<button class="tab${active === t.id ? ' on' : ''}" data-t="${esc(t.id)}">${t.icon ? `<span class="ti">${t.icon}</span>` : ''}${esc(t.label)}${t.badge ? `<small>${esc(t.badge)}</small>` : ''}</button>`).join('');
    this.wTabs.querySelectorAll<HTMLElement>('button').forEach((b) => (b.onclick = () => pc.setTab(b.dataset.t!)));
    // 다시 그려도 스크롤 자리는 그대로(같은 탭일 때)
    const keep = this.wBody.dataset.k === `${def.kind}:${active}` ? this.wBody.scrollTop : 0;
    this.wBody.dataset.k = `${def.kind}:${active}`;
    this.wBody.innerHTML = '';
    try { def.render(this.wBody, { ...pc, tab: active }); } catch (e) {
      console.error(`[hud] ${def.kind}.render`, e);
      this.wBody.innerHTML = '<div class="note">앗, 이 창을 그리다 넘어졌어요…</div>';
    }
    this.wBody.scrollTop = keep;
  }

  // ───────────── 칩 ─────────────
  addChip(def: ChipDef): void {
    this.removeChip(def.id);
    const el = this.makeChip(def);
    this.chipEls.set(def.id, { def, el });
    this.giveBack(el);
  }
  removeChip(id: string): void {
    const c = this.chipEls.get(id);
    if (!c) return;
    if (this.peekView.has(id)) this.peekView.hide(id, () => {}, true);
    this.peeks.forget(id);
    c.el.remove();
    this.chipEls.delete(id);
  }
  private makeChip(def: ChipDef) {
    const el = document.createElement('div');
    el.className = 'chip-slot';
    el.dataset.chip = def.id;
    try { def.render(el); } catch (e) { console.error(`[hud] chip ${def.id}.render`, e); }
    return el;
  }
  private isLive(def: ChipDef) { return def.peek === 'live' || LIVE_CHIPS.has(def.id); }
  /** 칩 제자리: 시계는 왼쪽 위, 상황 칩은 게이지 줄, 나머지는 숨은 보관함(떠오르거나 주머니가 빌려 간다) */
  private giveBack(el: HTMLElement) {
    const id = el.dataset.chip ?? '';
    const c = this.chipEls.get(id);
    if (!c || c.el !== el) return;
    const home = id === CLOCK_CHIP ? this.clockSlot : this.isLive(c.def) ? this.livesEl : this.store;
    // 주머니 무지개에 빌려 가 있는 동안엔 그대로 둔다(닫힐 때 돌려받는다)
    if (this.pocket.isOpen && el.closest('.pocket') && id !== CLOCK_CHIP) return;
    if (el.parentElement !== home) home.appendChild(el);
  }
  refreshChips(): void {
    // 레지스트리 순서(order)대로 제자리에 다시 꽂는다. 모르는 칩은 새로 만든다
    const defs = this.game.hud.chips();
    const want = new Set(defs.map((d) => d.id));
    for (const id of [...this.chipEls.keys()]) if (!want.has(id)) this.removeChip(id);
    for (const d of defs) {
      const c = this.chipEls.get(d.id);
      if (!c || c.def !== d) { this.addChip(d); continue; }
      if (!this.peekView.has(d.id) && !c.el.closest('.pocket')) this.giveBack(c.el);
    }
  }
  /** 칩이 지금 보이는 모양인가(칩들은 style.display 로 스스로 숨는다) */
  private chipVisible(el: HTMLElement) {
    if (el.style.display === 'none') return false;
    const f = el.firstElementChild as HTMLElement | null;
    return !f || f.style.display !== 'none';
  }
  private updateChips(dt: number, t: number) {
    const canPeek = this.startedFlag && !this.cur && !this.hiddenFlag && this.presentGate(t);
    for (const { def, el } of this.chipEls.values()) {
      if (def.update) { try { def.update(el, dt); } catch (e) { console.error(`[hud] chip ${def.id}.update`, e); } }
      if (def.id === CLOCK_CHIP || this.isLive(def)) continue;
      const sig = chipSig(el.textContent, this.chipVisible(el));
      this.applyPeek(this.peeks.observe(def.id, sig, t, { auto: def.peek !== false, canPeek }), t);
    }
    for (const id of this.peeks.update(t, hold())) this.peekView.hide(id, (el) => this.giveBack(el));
  }
  private applyPeek(r: PeekResult, t: number) {
    if (!r) return;
    for (const id of r.evicted ?? []) this.peekView.hide(id, (el) => this.giveBack(el));
    if (r.start) {
      const c = this.chipEls.get(r.start);
      if (!c) { this.peeks.forget(r.start); return; }
      this.peekView.show(r.start, c.el, this.project(1.4));
      this.bumpAt.set(r.start, t);
    } else if (r.extend) {
      // 숫자가 촤르르 올라가는 동안 매번 흔들지 않게
      if (t - (this.bumpAt.get(r.extend) ?? 0) > 900) { this.bumpAt.set(r.extend, t); this.peekView.bump(r.extend); }
    }
  }
  /** game.hud.peek(id, ms) — 칩을 일부러 잠깐 띄운다(놀기 전·창/주머니가 열려 있으면 무시) */
  peekChip(id: string, ms?: number): void {
    const t = now();
    const c = this.chipEls.get(id);
    if (!c || id === CLOCK_CHIP || this.isLive(c.def)) return;
    if (!this.startedFlag || this.cur || this.hiddenFlag || !this.chipVisible(c.el)) return;
    this.applyPeek(this.peeks.request(id, ms, t), t);
  }
  /** 디버그: 떠 있는 칩 */
  peekList() { return [...this.peeks.stack]; }

  // ───────────── 단축키(안내 줄은 없다 — 주머니 '조작 안내'가 읽는다) ─────────────
  addHotkey(_def: HotkeyDef): void { /* 늘 떠 있는 키 줄은 없앴다(wave 7) */ }
  removeHotkey(_def: HotkeyDef): void { /* 위와 같음 */ }

  // ───────────── 행동 안내 칩(E·F) ─────────────
  setPrompts(chips: PromptChip[]) {
    const sig = chips.map((c) => `${c.cap}\u0001${c.label}\u0001${c.main}`).join('\u0002');
    if (sig === this.promptSig) return;
    this.promptSig = sig;
    this.promptsEl.innerHTML = chips.map((c) => `<div class="pchip dl-card${c.main ? '' : ' alt'}"><b>${esc(c.cap)}</b>${esc(c.label)}</div>`).join('');
  }

  // ───────────── 큰 연출 자리(배너·지역 이름) · 카드 ─────────────
  showBanner(b: BannerOpts): void { this.stage.push({ kind: 'banner', ms: b.ms ?? 2600, b }); this.pumpQueues(); }
  showCard(c: CardOpts): void { this.cards.push(c); this.pumpQueues(); }
  /** 하위 호환(__hud.banners): 지금 배너 + 기다리는 배너 */
  get banners() {
    const st = this.stage;
    return {
      get cur() { const c = st.cur; return c?.kind === 'banner' ? c.b : null; },
      pending: () => st.pending().filter((x): x is Extract<StageEntry, { kind: 'banner' }> => x.kind === 'banner').map((x) => x.b),
    };
  }
  stageBusy(): boolean { const t = now(); return this.stage.busy(t) || !this.presentGate(t); }
  stageClaim(ms: number): void { this.stage.claim(ms, now()); }
  private pumpQueues() {
    const t = now(), hd = hold();
    const gate = this.presentGate(t);
    const u = this.stage.update(t, gate, hd);
    if (u?.hide) this.offStage(u.hide);
    if (u?.show) {
      const x = u.show;
      if (x.kind === 'banner') {
        const b = x.b;
        this.bannerEl.style.setProperty('--bc', b.color ?? '#ffb36b');
        (this.bannerEl.querySelector('.bt') as HTMLElement).innerHTML = `${b.icon ? `<span>${esc(b.icon)}</span>` : ''}${esc(b.text)}`;
        const sub = this.bannerEl.querySelector('.bs') as HTMLElement;
        sub.textContent = b.sub ?? '';
        sub.style.display = b.sub ? '' : 'none';
        this.bannerEl.classList.remove('on'); void this.bannerEl.offsetWidth; this.bannerEl.classList.add('on');
      } else {
        const r = x.r;
        (this.region.querySelector('.nm') as HTMLElement).textContent = r.name;
        (this.region.querySelector('.sub span') as HTMLElement).textContent = r.sub;
        this.region.style.setProperty('--rc', r.color);
        this.region.style.setProperty('--rs', r.dark);
        this.region.classList.remove('on'); void this.region.offsetWidth;
        this.region.classList.add('on');
      }
    }
    // 카드는 큰 배너가 떠 있거나 숨 고르는 동안 기다린다
    const c = this.cards.update(t, hd, gate && !this.stage.busy(t));
    if (c?.show) {
      const x = c.show;
      this.cardEl.style.setProperty('--cc', x.color ?? '#ffb36b');
      (this.cardEl.querySelector('.ci') as HTMLElement).textContent = x.icon ?? '✨';
      (this.cardEl.querySelector('.ct') as HTMLElement).textContent = x.title;
      (this.cardEl.querySelector('.cb') as HTMLElement).textContent = x.body;
      this.cardEl.classList.remove('on'); void this.cardEl.offsetWidth; this.cardEl.classList.add('on');
      // 큰 연출은 한 번에 하나 — 카드가 떠 있는 동안 배너·지역 이름은 기다린다
      this.stage.claim(Math.max(400, x.ms ?? 3200), t);
    } else if (c?.hide) this.cardEl.classList.remove('on');
    this.pumpToasts(t, gate, hd);
    this.pumpTalk(t, gate);
  }
  private offStage(x: StageEntry) {
    if (x.kind === 'banner') this.bannerEl.classList.remove('on');
    else this.region.classList.remove('on');
  }
  /** 잡았다!·상자처럼 도파민 연출이 가운데를 쓸 때 — 떠 있는 배너는 비켜 주고, 끝날 때까지 기다린다 */
  private spotlight(ms: number) {
    const was = this.stage.interrupt(ms, now());
    if (was) this.offStage(was);
    this.cardEl.classList.remove('on');
  }
  /** 디버그: 지금 카드 + 기다리는 카드 */
  cardList() { return { current: this.cards.cur, pending: [...this.cards.pending()], dropped: this.cards.dropped }; }
  /** 디버그: 큰 연출 자리 */
  stageInfo() { const t = now(); return { cur: this.stage.cur, pending: [...this.stage.pending()], busy: this.stage.busy(t), gate: this.presentGate(t), toast: this.toasts.cur, toastQ: [...this.toasts.pending()] }; }

  // ───────────── 게이지 ─────────────
  setGauge(id: string, g: GaugeOpts): void {
    let el = this.gaugeEls.get(id);
    const vis = gaugeVisible(g);
    if (!el) {
      if (!vis) return; // 숨긴 게이지는 굳이 만들지 않는다
      el = h(`<div class="gauge dl-card" data-g="${esc(id)}"><div class="gl"><span></span><small></small></div><div class="gb"><i></i></div></div>`);
      el.style.display = 'none';
      this.gaugesEl.insertBefore(el, this.livesEl);
      this.gaugeEls.set(id, el);
    }
    if (!vis) {
      // 다 차거나 상황이 끝나면 스르르
      if (el.classList.contains('on')) {
        el.classList.remove('on');
        const e = el;
        window.setTimeout(() => { if (!e.classList.contains('on')) e.style.display = 'none'; }, GAUGE_FADE_MS);
      }
      return;
    }
    if (el.style.display === 'none') { el.style.display = ''; void el.offsetWidth; }
    el.classList.add('on');
    const v = gaugeValue(g);
    (el.querySelector('.gl span') as HTMLElement).textContent = g.label;
    (el.querySelector('.gl small') as HTMLElement).textContent = `${Math.floor(v * 100)}%`;
    const bar = el.querySelector('.gb i') as HTMLElement;
    bar.style.width = `${v * 100}%`;
    el.style.setProperty('--gc', g.color || '#ff9fb8');
    el.classList.toggle('hot', gaugeHot(g));
  }
  /** 콤보: 5 이상이고 막 늘었을 때만(조금 지나면 스르르) */
  setCombo(n: number) {
    const t = now();
    const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
    if (v !== this.comboN) { if (v > this.comboN) this.comboAt = t; this.comboN = v; }
    const on = comboShown(v, this.comboAt, t);
    const txt = on ? comboText(v) : this.comboEl.textContent ?? '';
    if (this.comboEl.textContent === txt && this.comboEl.classList.contains('on') === on) return;
    this.comboEl.textContent = txt;
    this.comboEl.classList.toggle('on', on);
    if (on) { this.comboEl.style.animation = 'none'; void this.comboEl.offsetWidth; this.comboEl.style.animation = ''; }
  }

  // ───────────── 지역 이름 ─────────────
  showRegion(name: string, sub: string, color: string, dark = '#5a3f22'): void {
    this.stage.push({ kind: 'region', ms: 3800, r: { name, sub, color, dark } });
    this.pumpQueues();
  }

  // ───────────── 미니맵(설정에서 켜기) ─────────────
  setMinimap(on: boolean) {
    this.minimapOn = on;
    this.mapEl.classList.toggle('off', !on);
    this.root.classList.toggle('nomap', !on);
    if (on) this.lastSlow = -1;
  }
  get minimap() { return this.minimapOn; }

  // ───────────── 지도(+ 등록 층) ─────────────
  drawLayersHint(): void { this.lastSlow = -1; }
  private drawLayers(toPx: ToPx, scale: number, world: 'earth' | 'space') {
    const g2 = this.g2;
    for (const l of this.game.hud.layers() as MapLayerDef[]) {
      g2.save();
      try { l.draw(g2, toPx, scale, world); } catch (e) {
        if (!this.layerErr.has(l.id)) { this.layerErr.add(l.id); console.error(`[hud] 지도 층 ${l.id}`, e); }
      }
      g2.restore();
    }
  }
  private arrow(c: number, yaw: number, fill: string) {
    const g2 = this.g2;
    g2.save();
    g2.translate(c, c);
    g2.rotate(-yaw + Math.PI);
    g2.fillStyle = fill; g2.strokeStyle = '#fff'; g2.lineWidth = 6; g2.lineJoin = 'round';
    g2.shadowColor = '#0004'; g2.shadowBlur = 6; g2.shadowOffsetY = 2;
    g2.beginPath(); g2.moveTo(0, -18); g2.lineTo(13, 13); g2.lineTo(0, 6); g2.lineTo(-13, 13); g2.closePath(); g2.stroke(); g2.shadowColor = 'transparent'; g2.fill();
    g2.restore();
  }
  private drawSpaceMap() {
    const g2 = this.g2, W = this.cv.width, c = W / 2;
    const p = this.game.player.pos;
    const sky = g2.createRadialGradient(c, c * 0.8, 10, c, c, c);
    sky.addColorStop(0, '#3a3f8f'); sky.addColorStop(1, '#161a44');
    g2.fillStyle = sky; g2.fillRect(0, 0, W, W);
    for (let i = 0; i < 60; i++) {
      const x = (i * 97) % W, y = (i * 61 + 13) % W;
      g2.fillStyle = i % 5 ? '#ffffff66' : '#fff3a8';
      g2.beginPath(); g2.arc(x, y, i % 7 ? 1.6 : 3, 0, Math.PI * 2); g2.fill();
    }
    // 달 지형 원(우주 원점 = 발사대 기준)
    const s = (c - 10) / 260;
    const toPx: ToPx = (x, z) => [c + (x - p.x) * s, c + (z - p.z) * s];
    const [ox, oy] = toPx(0, 30000);
    const moon = g2.createRadialGradient(ox - 30, oy - 30, 10, ox, oy, 120);
    moon.addColorStop(0, '#f4f0ff'); moon.addColorStop(1, '#b9b0e8');
    g2.fillStyle = '#ffffff30'; g2.beginPath(); g2.arc(ox, oy, 128, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = moon; g2.beginPath(); g2.arc(ox, oy, 118, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#a49bd955';
    for (const [dx, dy, r] of [[-40, 20, 22], [35, -30, 14], [20, 50, 10], [-20, -55, 12], [60, 30, 9]]) { g2.beginPath(); g2.arc(ox + dx, oy + dy, r, 0, Math.PI * 2); g2.fill(); }
    g2.font = '30px system-ui'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText('🚀', ox, oy);
    this.drawLayers(toPx, s, 'space');
    this.arrow(c, this.game.player.yaw, '#ffd23f');
  }
  private drawMap() {
    const g2 = this.g2, W = this.cv.width, c = W / 2, s = (c - 6) / MAP_R;
    const game = this.game, p = game.player.pos;
    g2.clearRect(0, 0, W, W);
    this.mapEl.classList.toggle('space', game.world === 'space');
    if (game.world === 'space') { this.drawSpaceMap(); return; }
    const toPx: ToPx = (x, z) => [c + (x - p.x) * s, c + (z - p.z) * s];
    const sea = g2.createRadialGradient(c, c, 10, c, c, c);
    sea.addColorStop(0, '#c9f3ff'); sea.addColorStop(1, '#78c9ee');
    g2.fillStyle = sea; g2.fillRect(0, 0, W, W);
    g2.fillStyle = '#ffffff55';
    for (let i = 0; i < 40; i++) { const a = i * 2.4, r = (i * 37) % (c - 10); g2.beginPath(); g2.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, 7, 2.5, 0, 0, Math.PI * 2); g2.fill(); }
    // 시야 부채꼴
    g2.save(); g2.translate(c, c); g2.rotate(-game.player.yaw + Math.PI);
    const fan = g2.createRadialGradient(0, 0, 0, 0, 0, 120);
    fan.addColorStop(0, '#ffffffaa'); fan.addColorStop(1, '#ffffff00');
    g2.fillStyle = fan; g2.beginPath(); g2.moveTo(0, 0); g2.arc(0, 0, 120, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g2.closePath(); g2.fill();
    g2.restore();
    // 섬: 가 본 곳은 제 색, 안 가 본 곳은 안개 실루엣(큰 지도와 같은 집합)
    const here = this.curIsland ?? null;
    const lit = fogSet(this.ctx.island.ISLANDS.map((d) => d.id), game.geo?.discovered ? (id) => game.geo!.discovered(id) : null, here);
    for (const d of this.ctx.island.ISLANDS) {
      drawIsland(g2, d, toPx, s, lit.has(d.id), this.shapes, { minR: d.theme === 'islet' ? 4 : 6 });
      if (d.theme === 'islet' && lit.has(d.id)) {
        const [x, y] = toPx(d.x, d.z);
        if (x > -10 && y > -10 && x < W + 10 && y < W + 10) { g2.fillStyle = '#c98a2b'; g2.font = '20px Jua'; g2.textAlign = 'center'; g2.textBaseline = 'alphabetic'; g2.fillText('✦', x, y + 7); }
      }
    }
    // 등대(켜졌으면 노란 빛) — 가 본 섬만
    const V = game.ext?.village as { lighthouses?: Record<string, { x: number; z: number; lit: boolean }> } | undefined;
    for (const [isl, lh] of Object.entries(V?.lighthouses ?? {})) {
      if (!lit.has(isl)) continue;
      const [x, y] = toPx(lh.x, lh.z);
      if (x < -20 || y < -20 || x > W + 20 || y > W + 20) continue;
      drawPin(g2, '🗼', x, y, 22, lh.lit ? { glow: '#ffe58acc' } : { dim: true });
    }
    this.drawLayers(toPx, s, 'earth');
    this.arrow(c, game.player.yaw, '#ff7a9a');
  }

  /** 지금 있는 곳 이름 — 섬 이름은 game.geo 가 정본(없으면 표) */
  islandName(id: string, fallback: string) {
    try { return this.game.geo?.islandName?.(id) || fallback; } catch { return fallback; }
  }
  /** 지금 있는 곳(이름·색) — 시계 칩도 읽는다 */
  private lastPlace: { id: string | null; name: string; sub: string; color: string; space: boolean; planet?: boolean } | null = null;
  place() {
    const game = this.game;
    // 집·박물관 안(먼바다 위 먼 좌표)이면 마지막으로 있던 곳을 그대로 보여 준다
    if (this.lastPlace && (game.ext as { interiors?: { current?(): string | null } }).interiors?.current?.()) return this.lastPlace;
    const space = game.world === 'space';
    const p = game.player.pos;
    const d = space ? null : this.ctx.island.islandAt(p.x, p.z);
    // 다른 행성(planets)에 있으면 그 행성 이름으로 — 도착 배너는 planets 가 띄운다
    if (space) {
      const PL = (game.ext as { planets?: { current?(): string | null; list?(): Array<{ id: string; name: string }> } }).planets;
      let pid: string | null = null;
      try { pid = PL?.current?.() ?? null; } catch { pid = null; }
      if (pid) {
        if (this.lastPlace?.id === `planet:${pid}`) return this.lastPlace;
        const nm = PL?.list?.().find((r) => r.id === pid)?.name ?? '우주';
        return (this.lastPlace = { id: `planet:${pid}`, name: nm, sub: '둥실둥실 별의 바다', color: '#4a4fa8', space, planet: true });
      }
    }
    const look = d ? ISLAND_LOOK[d.theme] ?? ISLAND_LOOK.islet : { sub: '파도가 반짝반짝', color: '#6cc3ef' };
    return (this.lastPlace = {
      id: space ? 'space' : d?.id ?? null,
      name: space ? PLANET_NAME[game.space?.planet ?? ''] ?? '우주' : d ? this.islandName(d.id, d.name) : '먼바다',
      sub: space ? '둥실둥실 별의 바다' : look.sub,
      color: space ? '#4a4fa8' : look.color,
      space,
    });
  }
  private updatePlace() {
    const pl = this.place();
    if (this.mapLbl.textContent !== pl.name) this.mapLbl.textContent = pl.name;
    // 섬을 옮기면 젤다식 지역 이름
    if (pl.id !== this.curIsland) {
      // 행성 도착 배너는 space 모듈이 직접 띄운다(산소·캡슐 안내) — 겹치지 않게 건너뛴다
      if (!(pl.space && (('planet' in pl && pl.planet) || (this.game.space?.planet && PLANET_NAME[this.game.space.planet])))) this.showRegion(pl.name, pl.sub, pl.space ? '#8f86ff' : pl.color, pl.space ? '#1d2257' : '#5a3f22');
      this.curIsland = pl.id;
    }
  }

  // ───────────── 지갑(칩 'hud:wallet' — 코인·반짝별·열쇠 조각) ─────────────
  /** 지갑 칩 — hud.ts 가 등록한다. 숫자는 tick 이 통통 세어 올린다 */
  walletChip(): ChipDef {
    return {
      id: 'hud:wallet', order: 10,
      render: (el) => {
        el.innerHTML = '<div class="wallet"><div class="pill dl-card coinp"><div class="ic coin">₩</div><span class="v">0</span></div><div class="pill dl-card starp"><div class="ic star">★</div><span class="v">0</span></div><div class="pill dl-card keyp" style="display:none"></div></div>';
        this.coinV = el.querySelector('.coinp .v'); this.starV = el.querySelector('.starp .v'); this.keyP = el.querySelector('.keyp');
        this.keySig = '';
        this.updateWallet();
      },
    };
  }
  bump(sel: '.coinp' | '.starp' | '.keyp') {
    const el = this.root.querySelector(`[data-chip="hud:wallet"] ${sel}`) as HTMLElement | null;
    if (!el) return;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  /** 돈이 바뀌면 플레이어 머리 위에서 '+120 ₩' 이 몽글 떠오른다 */
  coinDelta(d: number) {
    if (!d || !this.startedFlag || this.hiddenFlag) return;
    const up = d > 0;
    this.floats.pop(`${up ? '+' : '−'}${fmt(Math.abs(d))} ₩`, this.head(), up ? '#ffe27a' : '#ffc2c2', up ? '#c98a12' : '#c56b6b');
  }
  starDelta(d: number) {
    if (!d || !this.startedFlag || this.hiddenFlag) return;
    this.floats.pop(`${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} ★`, this.head(), '#e6dcff', '#7d66e0');
  }
  private updateWallet() {
    if (!this.coinV || !this.starV || !this.keyP) return;
    const st = this.game.state;
    const E = this.game.econ;
    this.shownCoins = countStep(this.shownCoins, st.coins);
    const ct = fmt(this.shownCoins);
    if (this.coinV.textContent !== ct) this.coinV.textContent = ct;
    const stars = Number(E?.stars ?? 0) || 0;
    this.shownStars = countStep(this.shownStars, stars);
    const stt = fmt(this.shownStars);
    if (this.starV.textContent !== stt) this.starV.textContent = stt;
    const kv = keyView(E?.keys as Record<'silver' | 'gold' | 'rainbow', number> | undefined);
    const sig = kv.map((k) => `${k.color}${k.keys}.${k.pieces}`).join(',');
    if (sig !== this.keySig) {
      this.keySig = sig;
      this.keyP.style.display = kv.length ? '' : 'none';
      this.keyP.innerHTML = kv.map((k) => `<span class="k" style="--kc:${KEY_LOOK[k.color].color}" title="${KEY_LOOK[k.color].name}">🗝️<b>${k.keys}</b>${[0, 1].map((i) => `<i class="${i < k.pieces ? 'on' : ''}"></i>`).join('')}</span>`).join('');
    }
  }

  // ───────────── 안내 말풍선(반짝이) ─────────────
  showHint(hn: HintOpts): boolean { return this.hints.push(hn); }
  hideHint(id: string): void {
    const cur = this.hints.cur?.h.id === id ? this.hints.cur.h : null;
    this.hints.remove(id);
    if (!cur || this.hintView.current !== id) return;
    // 해냈으면(until 참) 반짝 퐁, 아니면 스르르
    let done = false;
    try { done = !!cur.until?.(); } catch { done = false; }
    this.hintView.hide(done ? 'done' : 'remove');
  }
  private pumpHints(t: number, dt: number) {
    // 창·주머니·컷신·놀기 전·HUD 숨김이면 반짝이는 잠깐 숨는다
    const gate = this.startedFlag && !this.cur && !this.hiddenFlag && this.presentGate(t);
    const u = this.hints.update(t, gate);
    if (u?.hide) this.hintView.hide(u.why ?? 'remove');
    if (u?.show) { this.hintView.show(u.show); try { this.game.audio?.sfx('ui-click', { pitch: 1.6, vol: 0.4 }); } catch { /* 소리 없음 */ } }
    if (this.hintView.current) {
      // 부른 쪽이 자리를 주면(onboarding 반짝이 자리) 거기, 아니면 플레이어 어깨 옆
      let a: { x: number; y: number } | null = null;
      const fn = this.hints.cur?.h.anchor;
      if (fn) { try { a = fn(); } catch { a = null; } }
      if (!a) { const p = this.project(1.55); a = p ? { x: p.x + 54, y: p.y - 18 } : null; }
      this.hintView.tick(a, dt);
    }
  }
  hintInfo() { return { cur: this.hints.cur?.h.id ?? null, pending: this.hints.pending().map((x) => x.h.id), seen: [...this.hints.seen] }; }

  // ───────────── 토스트 한 줄 ─────────────
  private pumpToasts(t: number, gate: boolean, hd: boolean) {
    const u = this.toasts.update(t, gate, hd);
    const host = this.game.ui.toasts;
    if (!host || !u) return;
    if (u.show) {
      // 앞 줄은 위로 스르르 비켜 가고, 새 줄이 그 자리에 퐁
      if (this.toastEl) { const old = this.toastEl; old.classList.add('gone'); window.setTimeout(() => old.remove(), 260); }
      const d = this.makeToast(u.show.text);
      host.appendChild(d);
      this.toastEl = d;
    } else if (u.hide && this.toastEl) {
      const old = this.toastEl;
      this.toastEl = null;
      old.classList.add('gone');
      window.setTimeout(() => old.remove(), 300);
    }
  }
  private makeToast(text: string) {
    const toastIcon = (s: string) =>
      /코인|팔았|🪙/.test(s) ? '🪙' : /공룡|알/.test(s) ? '🦕' : /도감|기록/.test(s) ? '📖' : /샀다|구매/.test(s) ? '🛍️' : /열쇠/.test(s) ? '🗝️' : /완성|뚝딱/.test(s) ? '🔨' : /기증|스탬프/.test(s) ? '🏛️' : /가방/.test(s) ? '🎒' : /모자라|못|💦/.test(s) ? '💦' : /상자/.test(s) ? '🎁' : '✨';
    const d = document.createElement('div');
    d.className = 'toast dl-toast';
    const ic = document.createElement('span'); ic.className = 'ti'; ic.textContent = toastIcon(text);
    const tx = document.createElement('span'); tx.className = 'tt'; tx.textContent = text;
    d.title = text;
    d.append(ic, tx);
    return d;
  }

  // ───────────── 매 프레임 ─────────────
  tick(dt: number) {
    const n = now();
    this.syncStarted(n);
    this.watchFocus(n);
    this.updateWallet();
    this.pumpQueues();
    this.pumpHints(n, dt);
    this.pocket.tick(n);
    if (this.lastChip < 0 || n - this.lastChip >= 100) {
      this.updateChips(this.lastChip < 0 ? dt : (n - this.lastChip) / 1000, n);
      this.lastChip = n;
    }
    if (this.lastSlow >= 0 && n - this.lastSlow < 200) return;
    this.lastSlow = n;
    // 집·박물관 안(먼바다 위 먼 좌표)에서는 지역 배너·지도를 그대로 둔다 — 실내 이름 카드는 interiors 가 띄운다
    if ((this.game.ext as { interiors?: { current?(): string | null } }).interiors?.current?.()) return;
    // 놀기 전(타이틀 위 하늘 구경)엔 지역 이름을 아껴 둔다 — 시작하고 나서 지금 있는 섬 이름이 뜬다
    if (this.startedFlag) this.updatePlace();
    if (this.minimapOn) this.drawMap();
  }
  setHidden(on: boolean) {
    this.hiddenFlag = on;
    this.root.classList.toggle('hidden', on);
    if (on) { this.peeks.clear(now()); this.peekView.clear((el) => this.giveBack(el)); }
  }

  // ───────────── 토스트·대화 ─────────────
  toast(text: string): void { this.game.ui.toast(text); }

  /** core ui.toast 를 감싼다: '이름: 대사' 는 대화창, 나머지는 한 줄 토스트(같은 틀은 묶고, 같은 글은 1.5초 안에 한 번) */
  installToast() {
    const game = this.game;
    let pend: Array<{ text: string; ms: number }> = [];
    let flushQ = false;
    const pushToast = (text: string, ms: number) => {
      if (!game.ui.toasts) return this.coreToast(text, ms);
      if (!this.dedupe.allow(text, now())) return;
      this.toasts.push({ text, ms });
      this.pumpQueues();
    };
    const flush = () => {
      flushQ = false;
      const list = pend; pend = [];
      // 같은 틀(「…」 만 다른 것)은 하나로: '공룡 도감에 「A」 기록!' ×3 → '공룡 3종 기록! A·B·C'
      const groups = new Map<string, { names: string[]; text: string; ms: number }>();
      for (const it of list) {
        const m = it.text.match(/^(.*)「(.+?)」(.*)$/);
        const key = m ? m[1] + '「」' + m[3] : it.text;
        const g = groups.get(key);
        if (g) { if (m) g.names.push(m[2]); g.ms = Math.max(g.ms, it.ms); }
        else groups.set(key, { names: m ? [m[2]] : [], text: it.text, ms: it.ms });
      }
      for (const g of groups.values()) {
        if (g.names.length > 1) {
          const cat = (g.text.match(/^(\S+?)\s*도감/) ?? [])[1];
          pushToast(`${cat ? cat + ' ' : ''}${g.names.length}종 기록! ${g.names.join(' · ')}`, g.ms + 600);
        } else pushToast(g.text, g.ms);
      }
    };
    game.ui.toast = (text: string, ms = 2200) => {
      const m = text.match(/^([^:：\s][^:：]{0,11})\s*[:：]\s+(.+)$/s);
      if (m && !/^E\s/.test(text)) {
        // 아직 못 보여 줄 때(놀기 전·컷신)·앞 대사가 아직 떠 있을 때는 줄 세워 뒀다가 차례로 — 아무도 못 본 채 사라지지 않게
        if (!this.presentGate() || this.talkQ.length || now() < this.talkUntil) {
          this.talkQ.push({ who: m[1].trim(), line: m[2].trim(), ms });
          while (this.talkQ.length > 4) this.talkQ.shift();
        } else this.say(m[1].trim(), m[2].trim(), ms);
        return;
      }
      pend.push({ text, ms });
      if (!flushQ) { flushQ = true; requestAnimationFrame(flush); setTimeout(() => flushQ && flush(), 60); }
    };
  }

  /** 기다리던 대사 — 문이 열려 있고 앞 대사가 끝났으면 하나 */
  private pumpTalk(t: number, gate: boolean) {
    if (!gate || !this.talkQ.length || t < this.talkUntil) return;
    const x = this.talkQ.shift()!;
    this.say(x.who, x.line, x.ms);
  }
  /** 대화창(동숲식): 이름표 색은 이름 해시, 한 글자씩 타자(촬영 모드면 한 번에) */
  say(who: string, line: string, ms = 3600) {
    const NAME_COL = ['#ff9cb8', '#7cc8ff', '#9bd77a', '#ffbe3b', '#c59bff', '#ff9f8a'];
    let hsh = 0; for (const ch of who) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    const talk = this.talk, tx = talk.querySelector('.tx') as HTMLElement;
    talk.style.setProperty('--nc', NAME_COL[hsh % NAME_COL.length]);
    (talk.querySelector('.who') as HTMLElement).textContent = who;
    tx.textContent = '';
    talk.classList.remove('on'); void talk.offsetWidth; talk.classList.add('on');
    clearInterval(this.typeTimer); clearTimeout(this.talkTimer);
    const chars = [...line];
    if (this.SHOT) tx.textContent = line;
    else {
      let i = 0;
      this.typeTimer = window.setInterval(() => { tx.textContent = chars.slice(0, ++i).join(''); if (i >= chars.length) clearInterval(this.typeTimer); }, 38);
    }
    const dur = Math.max(ms, chars.length * 38 + 1800);
    this.talkUntil = now() + dur;
    if (!hold()) this.talkTimer = window.setTimeout(() => talk.classList.remove('on'), dur);
  }

  // ───────────── 색종이·잡았다·상자 ─────────────
  confetti(host: HTMLElement, colors: string[], n = 36) {
    const rnd = this.rnd;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3, r = 180 + rnd() * 220;
      c.style.setProperty('--x', `${Math.cos(a) * r}px`); c.style.setProperty('--y', `${Math.sin(a) * r + 120}px`); c.style.setProperty('--r', `${rnd() * 720 - 360}deg`);
      c.style.background = colors[i % colors.length];
      if (i % 3 === 0) c.style.borderRadius = '50%';
      // 창 본문 안에선 스크롤과 무관하게 창 가운데서 터진다
      (host.closest('.win') ?? host).appendChild(c);
      setTimeout(() => c.remove(), 1700);
    }
  }

  /** 잡았다 기본 연출(hudfx 가 나중에 renderCatch 를 덮어쓸 수 있다) */
  renderCatch(c: CatchShow, isNew: boolean) {
    const st = this.game.state;
    const s = c.species;
    const col = RARITY_COLOR[Math.min(5, Math.max(1, s.rarity))];
    const { got, total } = st.dexCount(s.category);
    const E = this.game.econ;
    let price = 0;
    try { price = typeof E?.priceOf === 'function' ? E.priceOf(s.id, { variant: c.variant, size: c.size }) : 0; } catch { price = 0; }
    const witness = c.keep === false;
    // 실제 모델로 썸네일(한 프레임 뒤 큐에서 그린다 — 복제본이라 들어 올린 모델엔 손대지 않는다)
    // 반짝이·왕관·작은 개체는 색·모양이 달라 도감 대표 그림으로 굳히지 않는다(보통 개체만)
    try { if (!c.variant) this.thumbs?.capture(s.id, c.model); } catch (e) { console.error('[hud] 썸네일 복제', e); }
    this.catchEl.style.setProperty('--rc', col);
    (this.catchEl.querySelector('.box') as HTMLElement).innerHTML = `<div class="got">${s.rarity >= 4 ? '대박! ' : ''}${witness ? '만났다!' : '잡았다!'}</div>
      <div class="nm">${esc(s.name)}</div>
      <div class="stars">${'★'.repeat(s.rarity)}<span style="opacity:.3">${'★'.repeat(Math.max(0, 5 - s.rarity))}</span></div>
      ${c.variant ? `<div class="info" style="color:#b5761f">${VARIANT_LABEL[c.variant]}</div>` : ''}
      <div class="info">${CAT_ICON[s.category] ?? '📦'} ${c.sizeText ? esc(c.sizeText) + ' · ' : ''}도감 ${got}/${total}${!witness && price ? ` · ${fmt(price)}코인` : ''}${witness ? ' · 도감에 적었어요' : ''}</div>
      ${c.line ? `<div class="line">${esc(c.line)}</div>` : ''}
      ${isNew ? '<div class="stamp">NEW</div>' : ''}`;
    // 잡았다!는 가운데 혼자 — 떠 있던 배너는 비켜 주고 끝날 때까지 기다린다
    this.spotlight(3000);
    this.catchEl.classList.remove('on'); void this.catchEl.offsetWidth; this.catchEl.classList.add('on');
    this.confetti(this.catchEl, [col, '#ffffff', '#ffe58a', '#ffb3c8', '#a8e6ff'], 18 + s.rarity * 8);
    clearTimeout(this.catchTimer);
    if (!hold()) this.catchTimer = window.setTimeout(() => this.catchEl.classList.remove('on'), 3000);
  }

  /** 상자 결과: 등급 이름 + 아이템이 하나씩 튀어나온다 */
  showLoot(tier: string, loot: Array<{ id: string; n: number; name?: string }>, mimic = false) {
    const T = CHEST_LOOK[tier] ?? CHEST_LOOK.wood;
    if (mimic) {
      // 미믹 상자 — 빈 카드 대신 깜짝 문구
      this.lootEl.style.setProperty('--rc', '#ff8fb1');
      this.lootEl.innerHTML = `<div class="tier">미믹 상자게다! 🦀</div><div class="row"><div class="it dl-card" style="animation-delay:0.25s">상자가 꿈틀꿈틀 도망쳤어요!</div></div>`;
      this.spotlight(2600);
      this.lootEl.classList.remove('on'); void this.lootEl.offsetWidth; this.lootEl.classList.add('on');
      this.confetti(this.lootEl, ['#ff8fb1', '#ffffff', '#ffe58a'], 20);
      clearTimeout(this.lootTimer);
      if (!hold()) this.lootTimer = window.setTimeout(() => this.lootEl.classList.remove('on'), 2600);
      return;
    }
    const ico = (id: string) => (id === 'coins' ? '🪙' : id === 'stars' ? '⭐' : MAT.get(id)?.icon ?? this.look.ico(id));
    this.lootEl.style.setProperty('--rc', T.color);
    this.lootEl.innerHTML = `<div class="tier">${esc(T.name)} 상자!</div><div class="row">${loot.map((l, i) =>
      `<div class="it dl-card" style="animation-delay:${0.25 + i * 0.12}s">${ico(l.id)} ${esc(l.name ?? (l.id === 'coins' ? '코인' : l.id === 'stars' ? '반짝별' : this.look.name(l.id)))} ×${fmt(l.n)}</div>`).join('')}</div>`;
    this.spotlight(3400);
    this.lootEl.classList.remove('on'); void this.lootEl.offsetWidth; this.lootEl.classList.add('on');
    this.confetti(this.lootEl, [T.color, T.glow, '#ffe58a', '#fff'], T.n);
    clearTimeout(this.lootTimer);
    if (!hold()) this.lootTimer = window.setTimeout(() => this.lootEl.classList.remove('on'), 3400);
  }

  /** 칩 하나 흔들기(가방 꽉 참 등) — 숨어 있으면 먼저 살짝 띄운다 */
  shakeChip(id: string) {
    this.peekChip(id, 2600);
    const el = this.chipEls.get(id)?.el.firstElementChild as HTMLElement | null;
    if (!el) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }
}
