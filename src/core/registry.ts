// HUD 레지스트리(계약 v2 5장) — game.hud 의 정체. 코어가 늘 만들어 두고, hud 모듈이 attach(renderer) 로 실제 그리기를 붙인다.
// attach 전에는 전부 큐에 쌓아 둔다(패널 열기는 마지막 요청 하나만). 그리기 없는 순수 저장소라 테스트에서 바로 쓴다.
import type {
  BannerOpts, CardOpts, ChipDef, DexFacade, GaugeOpts, HintOpts, HotkeyDef, HudHelpers, HudRegistry, HudRenderer,
  MapLayerDef, PanelCtx, PanelDef, PanelState,
} from './api';

// ───────────── 기본 도우미(렌더러가 helpers 로 덮어쓴다) ─────────────
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const defaultHelpers: HudHelpers = {
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]),
  fmt: (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—'),
  ico: () => '•',
  name: (id) => id,
  color: () => '#ffcf4a',
  confetti: () => { /* 그리기 없음 */ },
  button: (html, onClick) => {
    const b = document.createElement('button');
    b.innerHTML = html;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  },
};

// ───────────── 단축키 디스패치(순수) ─────────────
export interface HotkeyCtx {
  /** 글 입력 칸에 포커스가 있나 */
  typing: boolean;
  /** player.locked */
  locked: boolean;
  /** 지금 열린 패널 kind(없으면 null) */
  openKind: string | null;
}

/**
 * 이번 프레임에 돌릴 단축키를 고른다(돌리지는 않는다).
 * - 입력 중이면 아무것도 안 한다.
 * - current/currentAlt 가 차지한 키(consumed)는 건너뛴다(F 소환은 F 상호작용이 없을 때만).
 * - 잠금 중엔 '열린 패널 자기 키'만(panel === openKind, 또는 panel '*' 이고 뭔가 열려 있을 때 — Esc 닫기).
 * - when() 이 false 면 건너뛴다. 순서는 등록 순서.
 */
export function dispatchHotkeys<T extends Pick<HotkeyDef, 'code' | 'when' | 'panel'>>(
  hotkeys: readonly T[], pressedCodes: Iterable<string>, consumed: ReadonlySet<string> | null | undefined, ctx: HotkeyCtx,
): T[] {
  if (ctx.typing) return [];
  const pressed = pressedCodes instanceof Set ? (pressedCodes as Set<string>) : new Set(pressedCodes);
  if (!pressed.size) return [];
  const out: T[] = [];
  for (const hk of hotkeys) {
    if (!pressed.has(hk.code)) continue;
    if (consumed?.has(hk.code)) continue;
    if (ctx.locked) {
      const own = hk.panel != null && ctx.openKind != null && (hk.panel === '*' || hk.panel === ctx.openKind);
      if (!own) continue;
    }
    try { if (hk.when && !hk.when()) continue; } catch (e) { console.error(`[hotkey ${hk.code}] when`, e); continue; }
    out.push(hk);
  }
  return out;
}

/** 지금 글을 치는 중인가(input·textarea·contenteditable) */
export function isTypingTarget(el: Element | null | undefined): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const t = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image'].includes(t);
  }
  return (el as HTMLElement).isContentEditable === true;
}

// ───────────── 저장소 ─────────────
type Region = [name: string, sub: string, color: string, dark?: string];
type OpenReq = { kind: string; tab?: string; arg?: unknown };
type ChangeFn = (kind: string | null, prev: string | null) => void;

export class HudRegistryStore implements HudRegistry {
  private impl: HudRenderer | null = null;
  private panelMap = new Map<string, PanelDef>();
  private chipMap = new Map<string, ChipDef>();
  private hotkeyList: HotkeyDef[] = [];
  private layerMap = new Map<string, MapLayerDef>();
  // attach 전 큐
  private qOpen: OpenReq | null = null;
  private qBanners: BannerOpts[] = [];
  private qCards: CardOpts[] = [];
  private qGauges = new Map<string, GaugeOpts>();
  private qToasts: string[] = [];
  private qRegion: Region | null = null;
  private qHints: HintOpts[] = [];
  private qPeeks = new Map<string, number | undefined>();
  // 열린 패널
  private state: PanelState | null = null;
  private changeFns: ChangeFn[] = [];
  /** 최근 게이지 값(렌더러가 다시 붙어도 복원) */
  readonly gauges = new Map<string, GaugeOpts>();

  get attached() { return this.impl !== null; }
  get renderer() { return this.impl; }

  // ── 등록
  registerPanel(def: PanelDef, opts?: { replace?: boolean }): boolean {
    if (this.panelMap.has(def.kind) && !opts?.replace) {
      console.warn(`[hud] 패널 '${def.kind}' 이(가) 이미 있어요 — 무시합니다({replace:true} 로 바꿔 끼우기)`);
      return false;
    }
    const was = this.panelMap.get(def.kind);
    this.panelMap.set(def.kind, def);
    this.impl?.addPanel?.(def);
    // 열린 패널을 바꿔 끼웠으면 새 정의로 다시 그린다
    if (was && this.state?.kind === def.kind) this.rerender();
    // attach 뒤에 늦게 등록된 패널 — 쌓아 둔 열기 요청이 이 패널이면 이제 연다
    else if (this.impl && this.qOpen?.kind === def.kind) { const q = this.qOpen; this.qOpen = null; this.open(q.kind, q.tab, q.arg); }
    return true;
  }
  panel(kind: string) { return this.panelMap.get(kind) ?? null; }
  panels() { return [...this.panelMap.values()]; }

  registerChip(def: ChipDef): () => void {
    this.chipMap.set(def.id, def);
    if (this.impl) { this.impl.addChip?.(def); this.impl.refreshChips(); }
    return () => {
      if (this.chipMap.get(def.id) !== def) return;
      this.chipMap.delete(def.id);
      this.impl?.removeChip?.(def.id);
      this.impl?.refreshChips();
    };
  }
  /** order 순(같으면 등록 순) */
  chips(): ChipDef[] { return [...this.chipMap.values()].sort((a, b) => a.order - b.order); }

  registerHotkey(def: HotkeyDef): () => void {
    if (def.id) {
      const i = this.hotkeyList.findIndex((h) => h.id === def.id);
      if (i >= 0) this.hotkeyList.splice(i, 1, def);
      else this.hotkeyList.push(def);
    } else this.hotkeyList.push(def);
    this.impl?.addHotkey?.(def);
    return () => {
      const i = this.hotkeyList.indexOf(def);
      if (i < 0) return;
      this.hotkeyList.splice(i, 1);
      this.impl?.removeHotkey?.(def);
      this.impl?.refreshChips();
    };
  }
  hotkeys(): readonly HotkeyDef[] { return this.hotkeyList; }

  registerMapLayer(def: MapLayerDef): () => void {
    this.layerMap.set(def.id, def);
    if (this.impl) { this.impl.addLayer?.(def); this.impl.drawLayersHint?.(); }
    return () => {
      if (this.layerMap.get(def.id) !== def) return;
      this.layerMap.delete(def.id);
      this.impl?.removeLayer?.(def.id);
      this.impl?.drawLayersHint?.();
    };
  }
  /** order 순(같으면 등록 순) */
  layers(): MapLayerDef[] { return [...this.layerMap.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }

  // ── 패널 열고 닫기
  open(kind: string, tab?: string, arg?: unknown): void {
    if (!this.impl) { this.qOpen = { kind, tab, arg }; return; }
    const def = this.panelMap.get(kind);
    // 아직 등록 안 된 패널 — 요청을 들고 있다가 registerPanel 때 연다
    if (!def) { console.warn(`[hud] 모르는 패널 '${kind}' — 등록되면 열게요`); this.qOpen = { kind, tab, arg }; return; }
    this.qOpen = null;
    const prev = this.state?.kind ?? null;
    // 다른 패널이 열려 있으면 onClose 만 부르고 그리기는 openPanel 이 바꿔 친다(잠금이 풀렸다 걸리는 깜빡임 없이)
    if (this.state) this.closeInner(false);
    this.state = { kind, tab, arg, sel: null };
    try { def.onOpen?.(arg); } catch (e) { console.error(`[hud] ${kind}.onOpen`, e); }
    // onOpen 안에서 닫았을 수도 있다
    if (this.state?.kind !== kind) { if (prev) this.fire(null, prev); return; }
    // 탭은 onOpen 다음에 고른다(가게처럼 arg 에 따라 탭이 바뀌는 패널). 기본 탭이 목록에 없으면 첫 탭
    if (tab == null) {
      const list = safeTabs(def);
      const d = def.defaultTab;
      this.state.tab = d != null && (!list.length || list.some((t) => t.id === d)) ? d : list[0]?.id ?? d;
    }
    this.impl.openPanel(def, this.ctx());
    this.fire(kind, prev);
  }

  close(): void {
    this.qOpen = null;
    if (!this.impl) return;
    if (!this.state) return;
    const prev = this.state.kind;
    this.closeInner(true);
    this.fire(null, prev);
  }

  /** 열려 있으면 닫고, 아니면 연다(단축키용) */
  toggle(kind: string, tab?: string, arg?: unknown): void {
    if (this.isOpen(kind)) this.close(); else this.open(kind, tab, arg);
  }

  isOpen(kind?: string): boolean { return kind == null ? this.state !== null : this.state?.kind === kind; }
  current(): PanelState | null { return this.state ? { ...this.state } : null; }
  /** attach 전에 쌓인 열기 요청(테스트·디버그) */
  pendingOpen(): Readonly<OpenReq> | null { return this.qOpen; }

  /** 열린 패널이 바뀔 때(플레이어 잠금·ui-open 이벤트용). 해제 함수를 돌려준다 */
  onChange(fn: ChangeFn): () => void {
    this.changeFns.push(fn);
    return () => { const i = this.changeFns.indexOf(fn); if (i >= 0) this.changeFns.splice(i, 1); };
  }

  /** 열린 패널 다시 그리기 */
  rerender(): void {
    if (!this.impl || !this.state) return;
    const def = this.panelMap.get(this.state.kind);
    if (!def) return;
    const c = this.ctx();
    if (this.impl.renderPanel) this.impl.renderPanel(def, c);
    else this.impl.openPanel(def, c);
  }

  // ── 보여 주기
  banner(b: BannerOpts): void { if (this.impl) this.impl.showBanner(b); else this.qBanners.push(b); }
  card(c: CardOpts): void { if (this.impl) this.impl.showCard(c); else this.qCards.push(c); }
  gauge(id: string, g: GaugeOpts): void {
    this.gauges.set(id, g);
    if (this.impl) this.impl.setGauge(id, g);
    else { this.qGauges.delete(id); this.qGauges.set(id, g); }
  }
  toast(text: string): void { if (this.impl) this.impl.toast(text); else this.qToasts.push(text); }
  showRegion(name: string, sub: string, color: string, dark?: string): void {
    if (this.impl) this.impl.showRegion(name, sub, color, dark);
    else this.qRegion = [name, sub, color, dark];
  }

  // ── wave 7: 칩 살짝 보이기 · 안내 말풍선 · 큰 연출 자리
  peek(chipId: string, ms?: number): void {
    if (this.impl?.peekChip) this.impl.peekChip(chipId, ms);
    else if (!this.impl) this.qPeeks.set(chipId, ms);
  }
  hint(h: HintOpts): boolean {
    if (!h || !h.id) return false;
    if (this.impl) return this.impl.showHint ? this.impl.showHint(h) : false;
    // 같은 id 는 마지막 것만 쌓는다
    const i = this.qHints.findIndex((x) => x.id === h.id);
    if (i >= 0) this.qHints.splice(i, 1, h); else this.qHints.push(h);
    return true;
  }
  hideHint(id: string): void {
    const i = this.qHints.findIndex((x) => x.id === id);
    if (i >= 0) this.qHints.splice(i, 1);
    this.impl?.hideHint?.(id);
  }
  stageBusy(): boolean { return this.impl ? !!this.impl.stageBusy?.() : true; }
  stageClaim(ms: number, tag?: string): void { this.impl?.stageClaim?.(ms, tag); }
  /** attach 전에 쌓인 안내 말풍선(테스트·디버그) */
  pendingHints(): readonly HintOpts[] { return this.qHints; }

  /**
   * 렌더러 붙이기. 큐를 이 순서로 비운다:
   * 패널 → 칩 → 단축키 → 지도 층 → (쌓인) 패널 열기 → 배너 → 카드 → 게이지 → 토스트 → 지역 이름 → 안내 말풍선 → 칩 살짝 보이기.
   * 다른 렌더러로 갈아 끼우면 열린 패널은 새 렌더러에서 다시 연다.
   */
  attach(impl: HudRenderer): void {
    const reopen: OpenReq | null = this.state ? { kind: this.state.kind, tab: this.state.tab, arg: this.state.arg } : null;
    if (this.impl && this.state) { try { this.impl.closePanel(); } catch (e) { console.error('[hud] closePanel', e); } }
    this.state = null;
    this.impl = impl;
    for (const p of this.panelMap.values()) impl.addPanel?.(p);
    for (const c of this.chips()) impl.addChip?.(c);
    impl.refreshChips();
    for (const h of this.hotkeyList) impl.addHotkey?.(h);
    for (const l of this.layers()) impl.addLayer?.(l);
    impl.drawLayersHint?.();
    const q = this.qOpen ?? reopen;
    this.qOpen = null;
    if (q) this.open(q.kind, q.tab, q.arg);
    for (const b of this.qBanners.splice(0)) impl.showBanner(b);
    for (const c of this.qCards.splice(0)) impl.showCard(c);
    for (const [id, g] of this.qGauges) impl.setGauge(id, g);
    this.qGauges.clear();
    for (const t of this.qToasts.splice(0)) impl.toast(t);
    if (this.qRegion) { const r = this.qRegion; this.qRegion = null; impl.showRegion(r[0], r[1], r[2], r[3]); }
    // wave 7: 안내 말풍선 · 칩 살짝 보이기(렌더러가 받을 때만)
    const hints = this.qHints.splice(0);
    if (impl.showHint) for (const h of hints) impl.showHint(h);
    if (impl.peekChip) for (const [id, ms] of this.qPeeks) impl.peekChip(id, ms);
    this.qPeeks.clear();
  }

  // ── 안쪽
  private closeInner(callImpl: boolean) {
    const s = this.state;
    if (!s) return;
    this.state = null;
    const def = this.panelMap.get(s.kind);
    try { def?.onClose?.(); } catch (e) { console.error(`[hud] ${s.kind}.onClose`, e); }
    if (callImpl) this.impl?.closePanel();
  }

  private fire(kind: string | null, prev: string | null) {
    for (const fn of [...this.changeFns]) { try { fn(kind, prev); } catch (e) { console.error('[hud] onChange', e); } }
  }

  private ctx(): PanelCtx {
    const s = this.state!;
    const kind = s.kind;
    const live = () => this.state?.kind === kind;
    return {
      tab: s.tab,
      sel: s.sel,
      arg: s.arg,
      setSel: (sel) => { if (!live()) return; this.state!.sel = sel; this.rerender(); },
      setTab: (tab) => { if (!live()) return; this.state!.tab = tab; this.state!.sel = null; this.rerender(); },
      rerender: () => { if (live()) this.rerender(); },
      close: () => { if (live()) this.close(); },
      h: { ...defaultHelpers, ...(this.impl?.helpers ?? {}) },
    };
  }
}

const safeTabs = (def: PanelDef) => { try { return def.tabs?.() ?? []; } catch { return []; } };

/** game.dex(예전 이름) 외관 — hud 저장소 위에 얹는다 */
export function makeDexFacade(store: HudRegistry): DexFacade {
  return {
    open: (kind = 'dex', tab, arg) => store.open(kind, tab, arg),
    close: () => store.close(),
    toast: (text) => store.toast(text),
    showRegion: (name, sub, color, dark) => store.showRegion(name, sub, color, dark),
    register: (def, opts) => store.registerPanel(def, opts),
  };
}
