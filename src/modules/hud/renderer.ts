// HUD 렌더러(계약 v2 5장 HudRenderer) — game.hud 레지스트리가 부르는 실제 그리기.
// 창(등록 패널 무엇이든) · 왼쪽 위 칩 칸 · 지갑 · 키 안내 · 행동 안내 칩 · 배너/카드 큐 · 게이지 · 지역 이름 · 미니맵(+등록 지도 층)
// · 잡았다/상자/대화/토스트. 무엇을 열지·언제 닫을지는 레지스트리가 정하고, 여기는 그리기만 한다.
// 미니맵은 큰 지도(M)와 같은 안개(fogSet)·같은 섬 모양(IslandShapes)을 쓴다. 잡았다 연출의 모델은 썸네일 큐로 복제해 보낸다.
import type { Ctx } from '../../core/types';
import type { Game } from '../../core/game';
import type { BannerOpts, CardOpts, ChipDef, GaugeOpts, HotkeyDef, HudHelpers, HudRenderer, MapLayerDef, PanelCtx, PanelDef, ToPx } from '../../core/api';
import type { CatchShow } from '../../core/ui';
import { VARIANT_LABEL } from '../../core/ui';
import { MAT, TIERS, CAT_ICON, RARITY_COLOR, ISLAND_LOOK } from '../economy/data';
import {
  TimedQueue, ToastDedupe, countStep, gaugeHot, gaugeValue, gaugeVisible, keyHints, keyView, KEY_LOOK, pickTab,
  comboText, comboVisible, type HudTab, type PromptChip, type BannerItem, type CardItem,
} from './logic';
import type { Look } from './panels/common';
import { PLANET_NAME, fogSet } from './logic';
import type { Thumbs } from './thumbs';
import type { IslandShapes } from './map';
import { drawIsland, drawPin } from './map';

const h = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—');
const hold = () => !!(window as unknown as { __hudHold?: boolean }).__hudHold;
const now = () => performance.now();

/** 넓게 여는 패널(도감) — 다른 모듈 패널은 def 에 wide:true 를 붙이면 된다 */
const WIDE = new Set(['dex']);
/** 지도 반지름(m) */
const MAP_R = 3000;

/** 상자 등급 → 이름·색(계약 등급 wood…space + 예전 등급 common…legend) */
const CHEST_LOOK: Record<string, { name: string; color: string; glow: string; n: number }> = {
  wood: { name: '나무', color: '#c98f55', glow: '#ffe2b8', n: 24 }, silver: { name: '은', color: '#b8c4d6', glow: '#ffffff', n: 34 },
  gold: { name: '금', color: '#ffcf4a', glow: '#fff3c4', n: 56 }, rainbow: { name: '무지개', color: '#ff9fb8', glow: '#c9f3ff', n: 80 },
  space: { name: '우주', color: '#a99bff', glow: '#e5e2ff', n: 48 },
};
// 경제 표의 등급 색·이름을 덮되, 꽃가루 수(n)는 위 기본값(없으면 예전 등급 규칙)을 지킨다
for (const [k, t] of Object.entries(TIERS)) CHEST_LOOK[k] = { name: t.name, color: t.color, glow: t.glow, n: CHEST_LOOK[k]?.n ?? (k === 'legend' ? 80 : k === 'epic' ? 56 : 30) };

export class HudView implements HudRenderer {
  readonly root: HTMLElement;
  helpers: Partial<HudHelpers>;
  private $ = (s: string) => this.root.querySelector(s) as HTMLElement;
  // 창
  private win: HTMLElement; private wTtl: HTMLElement; private wMeta: HTMLElement; private wTabs: HTMLElement; private wBody: HTMLElement;
  private cur: { def: PanelDef; ctx: PanelCtx } | null = null;
  // 칩·키·게이지
  private chipsEl: HTMLElement; private chipEls = new Map<string, { def: ChipDef; el: HTMLElement }>();
  private keysEl: HTMLElement; private keysDirty = true;
  private gaugesEl: HTMLElement; private gaugeEls = new Map<string, HTMLElement>(); private comboEl: HTMLElement;
  private promptsEl: HTMLElement; private promptSig = '';
  // 배너·카드
  private bannerEl: HTMLElement; private cardEl: HTMLElement;
  readonly banners = new TimedQueue<BannerItem>(2600, 6);
  readonly cards = new TimedQueue<CardItem>(3200, 8);
  // 지갑
  private coinV: HTMLElement; private starV: HTMLElement; private keyP: HTMLElement;
  private shownCoins: number; private shownStars = 0; private keySig = '';
  // 지도
  private cv: HTMLCanvasElement; private g2: CanvasRenderingContext2D; private mapEl: HTMLElement; private mapLbl: HTMLElement;
  private layerErr = new Set<string>();
  // 지역 이름
  private region: HTMLElement; private regionTimer = 0; private curIsland: string | null | undefined;
  // 대화·토스트·잡았다·상자
  private talk: HTMLElement; private typeTimer = 0; private talkTimer = 0;
  private catchEl: HTMLElement; private catchTimer = 0;
  private lootEl: HTMLElement; private lootTimer = 0;
  private dedupe = new ToastDedupe(1500);
  private coreToast: (text: string, ms?: number) => void;
  private rnd: () => number;
  private lastSlow = -1; private lastChip = -1;
  private readonly SHOT = new URLSearchParams(location.search).get('shot') === '1';
  /** 모델 썸네일(hud.ts 가 붙인다) · 섬 모양(미니맵·큰 지도 공용) */
  thumbs: Thumbs | null = null;
  shapes: IslandShapes | null = null;

  constructor(private game: Game, private ctx: Ctx, private look: Look) {
    this.rnd = ctx.rng('hud:confetti');
    this.root = h(`<div id="dl">
      <div class="chips"></div>
      <div class="wallet"><div class="pill dl-card coinp"><div class="ic coin">₩</div><span class="v">0</span></div><div class="pill dl-card starp"><div class="ic star">★</div><span class="v">0</span></div><div class="pill dl-card keyp" style="display:none"></div></div>
      <div class="card dl-card"><div class="ci"></div><div><div class="ct"></div><div class="cb"></div></div></div>
      <div class="gauges"><div class="combo"></div></div>
      <div class="map dl-card"><canvas width="380" height="380"></canvas><div class="n">N</div><div class="lbl">—</div></div>
      <div class="keys"></div>
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
    this.chipsEl = this.$('.chips'); this.keysEl = this.$('.keys');
    this.gaugesEl = this.$('.gauges'); this.comboEl = this.$('.combo');
    this.promptsEl = this.$('.prompts');
    this.bannerEl = this.$('.banner'); this.cardEl = this.$('.card');
    this.coinV = this.$('.coinp .v'); this.starV = this.$('.starp .v'); this.keyP = this.$('.keyp');
    this.shownCoins = game.state.coins;
    this.cv = this.root.querySelector('.map canvas') as HTMLCanvasElement;
    this.g2 = this.cv.getContext('2d')!;
    this.mapEl = this.$('.map'); this.mapLbl = this.$('.map .lbl');
    this.region = this.$('.region');
    this.talk = this.$('.talk');
    this.catchEl = this.$('.catch'); this.lootEl = this.$('.loot');
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

  // ───────────── 창(패널) ─────────────
  openPanel(def: PanelDef, pc: PanelCtx): void {
    if (!this.cur) this.game.player.lock('hud');
    this.cur = { def, ctx: pc };
    this.draw();
    this.win.classList.remove('on'); void this.win.offsetWidth;
    this.win.classList.add('on');
  }
  renderPanel(def: PanelDef, pc: PanelCtx): void {
    if (!this.cur || this.cur.def.kind !== def.kind) { this.openPanel(def, pc); return; }
    this.cur = { def, ctx: pc };
    this.draw();
  }
  closePanel(): void {
    if (!this.cur) return;
    this.cur = null;
    this.win.classList.remove('on');
    this.wBody.innerHTML = '';
    this.game.player.unlock('hud', true);
  }
  /** 열린 패널 kind(디버그) */
  openKind() { return this.cur?.def.kind ?? null; }

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

  // ───────────── 칩 칸 ─────────────
  addChip(def: ChipDef): void { this.removeChip(def.id); this.chipEls.set(def.id, { def, el: this.makeChip(def) }); }
  removeChip(id: string): void { const c = this.chipEls.get(id); if (c) { c.el.remove(); this.chipEls.delete(id); } }
  private makeChip(def: ChipDef) {
    const el = document.createElement('div');
    el.className = 'chip-slot';
    el.dataset.chip = def.id;
    try { def.render(el); } catch (e) { console.error(`[hud] chip ${def.id}.render`, e); }
    return el;
  }
  refreshChips(): void {
    // 레지스트리 순서(order)대로 다시 꽂는다. 모르는 칩은 새로 만든다
    const defs = this.game.hud.chips();
    const want = new Set(defs.map((d) => d.id));
    for (const id of [...this.chipEls.keys()]) if (!want.has(id)) this.removeChip(id);
    for (const d of defs) {
      let c = this.chipEls.get(d.id);
      if (!c || c.def !== d) { this.addChip(d); c = this.chipEls.get(d.id)!; }
      this.chipsEl.appendChild(c.el);
    }
  }
  private updateChips(dt: number) {
    for (const { def, el } of this.chipEls.values()) {
      if (!def.update) continue;
      try { def.update(el, dt); } catch (e) { console.error(`[hud] chip ${def.id}.update`, e); }
    }
  }

  // ───────────── 키 안내 ─────────────
  addHotkey(_def: HotkeyDef): void { this.keysDirty = true; }
  removeHotkey(_def: HotkeyDef): void { this.keysDirty = true; }
  private drawKeys() {
    this.keysDirty = false;
    const list = keyHints(this.game.hud.hotkeys());
    const sig = list.map((k) => k.cap + k.label).join('|');
    if (this.keysEl.dataset.sig === sig) return;
    this.keysEl.dataset.sig = sig;
    this.keysEl.innerHTML = list.map((k) => `<div class="key dl-card"><b>${esc(k.cap)}</b>${esc(k.label)}</div>`).join('');
  }

  // ───────────── 행동 안내 칩(E·F) ─────────────
  setPrompts(chips: PromptChip[]) {
    const sig = chips.map((c) => `${c.cap}\u0001${c.label}\u0001${c.main}`).join('\u0002');
    if (sig === this.promptSig) return;
    this.promptSig = sig;
    this.promptsEl.innerHTML = chips.map((c) => `<div class="pchip dl-card${c.main ? '' : ' alt'}"><b>${esc(c.cap)}</b>${esc(c.label)}</div>`).join('');
  }

  // ───────────── 배너·카드 ─────────────
  showBanner(b: BannerOpts): void { this.banners.push(b); this.pumpQueues(); }
  showCard(c: CardOpts): void { this.cards.push(c); this.pumpQueues(); }
  private pumpQueues() {
    const t = now(), hd = hold();
    const b = this.banners.update(t, hd);
    if (b?.show) {
      const x = b.show;
      this.bannerEl.style.setProperty('--bc', x.color ?? '#ffb36b');
      (this.bannerEl.querySelector('.bt') as HTMLElement).innerHTML = `${x.icon ? `<span>${esc(x.icon)}</span>` : ''}${esc(x.text)}`;
      const sub = this.bannerEl.querySelector('.bs') as HTMLElement;
      sub.textContent = x.sub ?? '';
      sub.style.display = x.sub ? '' : 'none';
      this.bannerEl.classList.remove('on'); void this.bannerEl.offsetWidth; this.bannerEl.classList.add('on');
    } else if (b?.hide) this.bannerEl.classList.remove('on');
    const c = this.cards.update(t, hd);
    if (c?.show) {
      const x = c.show;
      this.cardEl.style.setProperty('--cc', x.color ?? '#ffb36b');
      (this.cardEl.querySelector('.ci') as HTMLElement).textContent = x.icon ?? '✨';
      (this.cardEl.querySelector('.ct') as HTMLElement).textContent = x.title;
      (this.cardEl.querySelector('.cb') as HTMLElement).textContent = x.body;
      this.cardEl.classList.remove('on'); void this.cardEl.offsetWidth; this.cardEl.classList.add('on');
    } else if (c?.hide) this.cardEl.classList.remove('on');
  }
  /** 디버그: 지금 카드 + 기다리는 카드 */
  cardList() { return { current: this.cards.cur, pending: [...this.cards.pending()], dropped: this.cards.dropped }; }

  // ───────────── 게이지 ─────────────
  setGauge(id: string, g: GaugeOpts): void {
    let el = this.gaugeEls.get(id);
    if (!el) {
      el = h(`<div class="gauge dl-card" data-g="${esc(id)}"><div class="gl"><span></span><small></small></div><div class="gb"><i></i></div></div>`);
      this.gaugesEl.insertBefore(el, this.comboEl);
      this.gaugeEls.set(id, el);
    }
    const vis = gaugeVisible(g);
    el.style.display = vis ? '' : 'none';
    if (!vis) return;
    const v = gaugeValue(g);
    (el.querySelector('.gl span') as HTMLElement).textContent = g.label;
    (el.querySelector('.gl small') as HTMLElement).textContent = `${Math.floor(v * 100)}%`;
    const bar = el.querySelector('.gb i') as HTMLElement;
    bar.style.width = `${v * 100}%`;
    el.style.setProperty('--gc', g.color || '#ff9fb8');
    el.classList.toggle('hot', gaugeHot(g));
  }
  setCombo(n: number) {
    const on = comboVisible(n);
    const txt = on ? comboText(n) : '';
    if (this.comboEl.textContent === txt && this.comboEl.classList.contains('on') === on) return;
    this.comboEl.textContent = txt;
    this.comboEl.classList.toggle('on', on);
    if (on) { this.comboEl.style.animation = 'none'; void this.comboEl.offsetWidth; this.comboEl.style.animation = ''; }
  }

  // ───────────── 지역 이름 ─────────────
  showRegion(name: string, sub: string, color: string, dark = '#5a3f22'): void {
    (this.region.querySelector('.nm') as HTMLElement).textContent = name;
    (this.region.querySelector('.sub span') as HTMLElement).textContent = sub;
    this.region.style.setProperty('--rc', color);
    this.region.style.setProperty('--rs', dark);
    this.region.classList.remove('on'); void this.region.offsetWidth;
    this.region.classList.add('on');
    clearTimeout(this.regionTimer);
    if (!hold()) this.regionTimer = window.setTimeout(() => this.region.classList.remove('on'), 3800);
  }

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
  place() {
    const game = this.game;
    const space = game.world === 'space';
    const p = game.player.pos;
    const d = space ? null : this.ctx.island.islandAt(p.x, p.z);
    const look = d ? ISLAND_LOOK[d.theme] ?? ISLAND_LOOK.islet : { sub: '파도가 반짝반짝', color: '#6cc3ef' };
    return {
      id: space ? 'space' : d?.id ?? null,
      name: space ? PLANET_NAME[game.space?.planet ?? ''] ?? '우주' : d ? this.islandName(d.id, d.name) : '먼바다',
      sub: space ? '둥실둥실 별의 바다' : look.sub,
      color: space ? '#4a4fa8' : look.color,
      space,
    };
  }
  private updatePlace() {
    const pl = this.place();
    if (this.mapLbl.textContent !== pl.name) this.mapLbl.textContent = pl.name;
    // 섬을 옮기면 젤다식 지역 이름
    if (pl.id !== this.curIsland) {
      // 행성 도착 배너는 space 모듈이 직접 띄운다(산소·캡슐 안내) — 겹치지 않게 건너뛴다
      if (!(pl.space && this.game.space?.planet && PLANET_NAME[this.game.space.planet])) this.showRegion(pl.name, pl.sub, pl.space ? '#8f86ff' : pl.color, pl.space ? '#1d2257' : '#5a3f22');
      this.curIsland = pl.id;
    }
  }

  // ───────────── 지갑 ─────────────
  bump(sel: '.coinp' | '.starp' | '.keyp') { const el = this.$(`.wallet ${sel}`); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  coinDelta(d: number) {
    if (!d) return;
    const el = h(`<div class="delta">${d > 0 ? '+' : ''}${fmt(d)}</div>`);
    if (d < 0) el.style.webkitTextStroke = '5px #c56b6b';
    this.root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-20px)'; }, 900);
    setTimeout(() => el.remove(), 1600);
  }
  private updateWallet() {
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

  // ───────────── 매 프레임 ─────────────
  tick(dt: number) {
    const n = now();
    this.updateWallet();
    this.pumpQueues();
    if (this.keysDirty) this.drawKeys();
    if (this.lastChip < 0 || n - this.lastChip >= 100) {
      this.updateChips(this.lastChip < 0 ? dt : (n - this.lastChip) / 1000);
      this.lastChip = n;
    }
    if (this.lastSlow >= 0 && n - this.lastSlow < 200) return;
    this.lastSlow = n;
    this.updatePlace();
    this.drawMap();
  }
  setHidden(on: boolean) { this.root.classList.toggle('hidden', on); }

  // ───────────── 토스트·대화 ─────────────
  toast(text: string): void { this.game.ui.toast(text); }

  /** core ui.toast 를 감싼다: '이름: 대사' 는 대화창, 나머지는 아이콘 토스트(같은 틀은 묶고, 같은 글은 1.5초 안에 한 번) */
  installToast() {
    const game = this.game;
    let pend: Array<{ text: string; ms: number }> = [];
    let flushQ = false;
    const toastIcon = (s: string) =>
      /코인|팔았|🪙/.test(s) ? '🪙' : /공룡|알/.test(s) ? '🦕' : /도감|기록/.test(s) ? '📖' : /샀다|구매/.test(s) ? '🛍️' : /열쇠/.test(s) ? '🗝️' : /완성|뚝딱/.test(s) ? '🔨' : /기증|스탬프/.test(s) ? '🏛️' : /가방/.test(s) ? '🎒' : /모자라|못|💦/.test(s) ? '💦' : /상자/.test(s) ? '🎁' : '✨';
    const pushToast = (text: string, ms: number) => {
      const host = game.ui.toasts;
      if (!host) return this.coreToast(text, ms);
      if (!this.dedupe.allow(text, now())) return;
      while (host.children.length >= 3) host.firstElementChild!.remove();
      const d = document.createElement('div');
      d.className = 'toast dl-toast';
      const ic = document.createElement('span'); ic.className = 'ti'; ic.textContent = toastIcon(text);
      const tx = document.createElement('span'); tx.textContent = text;
      d.append(ic, tx);
      host.appendChild(d);
      setTimeout(() => { d.style.opacity = '0'; d.style.transform = 'translateY(-8px) scale(.96)'; }, ms - 300);
      setTimeout(() => d.remove(), ms);
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
      if (m && !/^E\s/.test(text)) { this.say(m[1].trim(), m[2].trim(), ms); return; }
      pend.push({ text, ms });
      if (!flushQ) { flushQ = true; requestAnimationFrame(flush); setTimeout(() => flushQ && flush(), 60); }
    };
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
    if (!hold()) this.talkTimer = window.setTimeout(() => talk.classList.remove('on'), Math.max(ms, chars.length * 38 + 1800));
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
    this.lootEl.classList.remove('on'); void this.lootEl.offsetWidth; this.lootEl.classList.add('on');
    this.confetti(this.lootEl, [T.color, T.glow, '#ffe58a', '#fff'], T.n);
    clearTimeout(this.lootTimer);
    if (!hold()) this.lootTimer = window.setTimeout(() => this.lootEl.classList.remove('on'), 3400);
  }

  /** 칩 하나 흔들기(가방 꽉 참 등) */
  shakeChip(id: string) {
    const el = this.chipEls.get(id)?.el.firstElementChild as HTMLElement | null;
    if (!el) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }
}
