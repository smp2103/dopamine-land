// 말랑 주머니(Tab) 그리기 — 플레이어 둘레로 말랑한 젤리 방울이 퐁퐁 튀어나오는 고리 + 위쪽 상태 무지개(모든 칩).
// 폰·앱 화면이 아니다: 세상은 그대로 흐르고(시간 안 멈춤), 둘레만 살짝 흐려지고 어두워진다(가운데 플레이어는 또렷).
// 방울 = 창 하나(도감·가방·지도·우편·일지·사진·탈것·친구·설정·조작 안내 …). 마우스 올리면 말랑 흔들, 키보드는 화살표·숫자.
// 무엇을 넣을지·순서·뱃지는 hud.ts 가(present.ts pocketApps), 자리 계산은 present.ts(ringLayout·arcRows), 여기는 DOM 만.
import { arcRows, pocketNav, ringLayout, type RingOut } from './present';

export interface PocketApp {
  kind: string;
  title: string;
  icon: string;
  color: string;
  /** 단축키 글자(있으면 이름표 옆에 작게) */
  cap?: string;
  /** 뱃지 글('' = 없음) */
  badge: () => string;
  run: () => void;
}
export interface PocketHost {
  /** 플레이어 가슴 자리(화면 px) */
  project(): { x: number; y: number } | null;
  sfx(name: string, o?: { pitch?: number; vol?: number }): void;
  /** 빈 곳을 눌렀을 때(닫기) */
  dismiss(): void;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const BUBBLE = 86;

export class PocketView {
  readonly el: HTMLElement;
  private ringEl: HTMLElement; private arcEl: HTMLElement; private capEl: HTMLElement; private veil: HTMLElement;
  private apps: PocketApp[] = [];
  private bubbles: HTMLElement[] = [];
  private chips: HTMLElement[] = [];
  private wraps: HTMLElement[] = [];
  private focus = -1;
  private lay: RingOut | null = null;
  private lastPx = { x: NaN, y: NaN };
  private badgeAt = 0;
  private openFlag = false;
  private returnChip: ((el: HTMLElement) => void) | null = null;

  constructor(host: HTMLElement, private h: PocketHost) {
    const t = document.createElement('template');
    t.innerHTML = `<div class="pocket" aria-hidden="true">
      <div class="veil"></div>
      <div class="arc"></div>
      <div class="ring"></div>
      <div class="cap"><b>말랑 주머니</b><small>무엇을 꺼내 볼까요?</small></div>
      <div class="foot"><span><kbd>←</kbd><kbd>→</kbd> 고르기</span><span><kbd>1</kbd>~<kbd>9</kbd> 바로</span><span><kbd>Enter</kbd> 열기</span><span><kbd>Tab</kbd> 닫기</span></div>
    </div>`;
    this.el = t.content.firstElementChild as HTMLElement;
    host.appendChild(this.el);
    this.ringEl = this.el.querySelector('.ring') as HTMLElement;
    this.arcEl = this.el.querySelector('.arc') as HTMLElement;
    this.capEl = this.el.querySelector('.cap') as HTMLElement;
    this.veil = this.el.querySelector('.veil') as HTMLElement;
    this.veil.addEventListener('click', () => this.h.dismiss());
  }

  get isOpen() { return this.openFlag; }
  get focused() { return this.focus; }
  appList(): readonly PocketApp[] { return this.apps; }

  /** 열기: 방울을 새로 만들고(목록이 바뀌었을 수 있다) 칩을 무지개에 빌려 온다 */
  open(apps: PocketApp[], chips: HTMLElement[], giveBack: (el: HTMLElement) => void) {
    if (this.openFlag) this.close();
    this.openFlag = true;
    this.apps = apps;
    this.returnChip = giveBack;
    this.focus = -1;
    this.ringEl.innerHTML = '';
    this.bubbles = apps.map((a, i) => {
      const b = document.createElement('button');
      b.className = 'pb';
      b.type = 'button';
      b.style.setProperty('--c', a.color || '#ffb36b');
      b.style.setProperty('--d', `${Math.round(i * 32)}ms`);
      b.style.setProperty('--ph', `${(-i * 0.37).toFixed(2)}s`);
      b.innerHTML = `<span class="jelly"><span class="ic">${a.icon || '✨'}</span><i class="shine"></i></span>`
        + `<span class="lb">${esc(a.title)}${a.cap ? `<kbd>${esc(a.cap)}</kbd>` : ''}</span><i class="bd"></i>${i < 10 ? `<em class="num">${i === 9 ? 0 : i + 1}</em>` : ''}`;
      b.addEventListener('pointerenter', () => this.setFocus(i, true));
      b.addEventListener('click', (e) => { e.stopPropagation(); this.pick(i); });
      this.ringEl.appendChild(b);
      return b;
    });
    // 칩을 빌려 무지개에 꽂는다
    this.arcEl.innerHTML = '';
    this.chips = chips;
    this.wraps = chips.map((c, i) => {
      const w = document.createElement('div');
      w.className = 'aw';
      w.style.setProperty('--d', `${120 + i * 40}ms`);
      w.appendChild(c);
      this.arcEl.appendChild(w);
      return w;
    });
    this.lastPx = { x: NaN, y: NaN };
    this.refreshBadges();
    this.layout(true);
    this.setFocus(-1, false);
    this.el.classList.remove('on'); void this.el.offsetWidth; this.el.classList.add('on');
    this.el.setAttribute('aria-hidden', 'false');
  }

  close() {
    if (!this.openFlag) return;
    this.openFlag = false;
    this.el.classList.remove('on');
    this.el.setAttribute('aria-hidden', 'true');
    // 칩은 원래 자리로
    for (const c of this.chips) this.returnChip?.(c);
    this.chips = []; this.wraps = [];
    this.arcEl.innerHTML = '';
    this.ringEl.innerHTML = '';
    this.bubbles = [];
    this.apps = [];
    this.lay = null;
  }

  /** 키 하나(열려 있을 때만). 다룬 키면 true */
  key(code: string): boolean {
    if (!this.openFlag) return false;
    const r = pocketNav(this.focus, this.apps.length, code);
    if (!r) return false;
    this.setFocus(r.focus, true);
    if (r.pick) this.pick(r.focus);
    return true;
  }

  private setFocus(i: number, sound: boolean) {
    if (i === this.focus && i >= 0) return;
    this.focus = i;
    this.bubbles.forEach((b, k) => b.classList.toggle('f', k === i));
    const a = this.apps[i];
    if (a) {
      this.capEl.innerHTML = `<b>${a.icon} ${esc(a.title)}</b><small>${a.cap ? `<kbd>${esc(a.cap)}</kbd> 로도 바로 열려요` : 'Enter 로 열기'}</small>`;
      this.capEl.style.setProperty('--c', a.color);
      if (sound) this.h.sfx('ui-click', { pitch: 1.15 + (i % 5) * 0.06, vol: 0.45 });
    } else {
      this.capEl.innerHTML = '<b>말랑 주머니</b><small>무엇을 꺼내 볼까요?</small>';
      this.capEl.style.removeProperty('--c');
    }
  }

  private pick(i: number) {
    const a = this.apps[i];
    if (!a) return;
    const b = this.bubbles[i];
    if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    this.h.sfx('balloon-pop', { pitch: 1.4, vol: 0.35 });
    a.run();
  }

  private refreshBadges() {
    this.apps.forEach((a, i) => {
      let t = '';
      try { t = a.badge(); } catch { t = ''; }
      const el = this.bubbles[i]?.querySelector('.bd') as HTMLElement | null;
      if (!el) return;
      if (el.textContent !== t) el.textContent = t;
      el.classList.toggle('on', !!t);
    });
  }

  /** 매 프레임(열려 있을 때) — 플레이어가 화면에서 움직였을 때만 자리를 다시 잡는다 */
  tick(now: number) {
    if (!this.openFlag) return;
    if (now - this.badgeAt > 500) { this.badgeAt = now; this.refreshBadges(); }
    this.layout(false);
  }

  private layout(force: boolean) {
    const W = window.innerWidth, H = window.innerHeight;
    const p = this.h.project() ?? { x: W / 2, y: H * 0.55 };
    if (!force && Math.abs(p.x - this.lastPx.x) < 3 && Math.abs(p.y - this.lastPx.y) < 3) return;
    this.lastPx = { x: p.x, y: p.y };
    // 무지개 먼저(높이가 고리 자리를 정한다)
    const maxW = Math.min(W - 40, 1040);
    for (const w of this.wraps) w.style.display = '';
    const widths = this.wraps.map((w) => w.offsetWidth);
    const arc = arcRows(widths, maxW, { gap: 10, rowH: 50, bend: 24, tilt: 6 });
    const lay = ringLayout({ n: this.apps.length, px: p.x, py: p.y, W, H, bubble: BUBBLE, arcH: arc.height ? arc.height + 18 : 0 });
    this.lay = lay;
    this.el.style.setProperty('--cx', `${Math.round(lay.cx)}px`);
    this.el.style.setProperty('--cy', `${Math.round(lay.cy)}px`);
    this.el.style.setProperty('--s', lay.scale.toFixed(3));
    this.el.style.setProperty('--r', `${Math.round(lay.r)}px`);
    this.bubbles.forEach((b, i) => {
      const pt = lay.pts[i];
      b.style.left = `${Math.round(pt.x)}px`;
      b.style.top = `${Math.round(pt.y)}px`;
      b.style.setProperty('--ox', `${Math.round(lay.cx - pt.x)}px`);
      b.style.setProperty('--oy', `${Math.round(lay.cy - pt.y)}px`);
    });
    // 이름표: 고리 아래(자리가 없으면 머리 위 — 맨 위 방울 이름표 밑)
    this.capEl.style.left = `${Math.round(lay.cx)}px`;
    const below = lay.bottom + 4;
    this.capEl.style.top = `${Math.round(below + 56 < H - 44 ? below : lay.cy - lay.r + BUBBLE * lay.scale / 2 + 30)}px`;
    // 무지개: 줄마다 고리 가운데에 맞추되 화면 밖으로는 안 나가게
    const top = lay.top;
    for (const it of arc.items) {
      const w = this.wraps[it.i];
      const rw = arc.rowW[it.row];
      const rc = Math.min(W - 20 - rw / 2, Math.max(20 + rw / 2, lay.cx));
      w.style.left = `${Math.round(rc + it.x - widths[it.i] / 2)}px`;
      w.style.top = `${Math.round(top + it.y)}px`;
      w.style.setProperty('--rot', `${it.rot.toFixed(2)}deg`);
    }
    // 폭 0(지금 안 보이는 칩)은 숨김
    this.wraps.forEach((w, i) => { if (!(widths[i] > 0)) w.style.display = 'none'; });
  }

  /** 디버그 */
  info() {
    return {
      open: this.openFlag, focus: this.focus, apps: this.apps.map((a) => a.kind),
      center: this.lay ? { x: Math.round(this.lay.cx), y: Math.round(this.lay.cy), r: Math.round(this.lay.r), scale: this.lay.scale } : null,
      chips: this.chips.map((c) => c.dataset.chip),
    };
  }
}
