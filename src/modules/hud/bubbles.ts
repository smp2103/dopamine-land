// 떠오르는 방울들(wave 7) — 화면에 늘 붙어 있지 않고, 일이 생길 때만 세상에서 퐁 떠오른다.
// 1) PeekView: 칩 살짝 보이기 — 플레이어 쪽에서 방울처럼 떠올라 왼쪽 위(시계 아래)로 둥실 가서 3초쯤 머물다 퐁. 최대 3개, 새 것이 위.
// 2) FloatPops: '+120 ₩' 같은 숫자가 플레이어 머리 위에서 몽글 떠올라 터진다(숫자는 대시보드가 아니라 세상에서 읽힌다).
// 3) HintView: 처음 안내 — 작은 별 친구 '반짝이'가 플레이어 어깨 옆에 둥실 떠서 말풍선(키 모자 포함)으로 알려 주고, 해내면 퐁, 시간이 다 되면 하품하며 사라진다.
// 움직임은 CSS 키프레임/Web Animations 가 맡고, 자바스크립트는 자리(px)만 정한다.
import type { HintOpts } from '../../core/api';
import { hintParts } from './present';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
type XY = { x: number; y: number };

// ───────────── 1. 칩 살짝 보이기 ─────────────
export class PeekView {
  readonly el: HTMLElement;
  private wraps = new Map<string, HTMLElement>();
  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'peeks';
    host.appendChild(this.el);
  }
  has(id: string) { return this.wraps.has(id); }
  ids() { return [...this.wraps.keys()]; }
  /** 칩 하나 띄우기 — from(플레이어 화면 자리)에서 떠올라 자리로 */
  show(id: string, chip: HTMLElement, from: XY | null) {
    if (this.wraps.has(id)) { this.bump(id); return; }
    // FLIP: 있던 방울 자리 기억 → 새 것을 맨 위에 꽂고 → 밀려난 만큼 되돌려 놓았다가 스르르
    const before = new Map<HTMLElement, number>();
    for (const w of this.wraps.values()) before.set(w, w.getBoundingClientRect().top);
    const w = document.createElement('div');
    w.className = 'pk';
    w.dataset.peek = id;
    w.appendChild(chip);
    this.el.prepend(w);
    this.wraps.set(id, w);
    for (const [o, top] of before) {
      const d = top - o.getBoundingClientRect().top;
      if (Math.abs(d) > 1) o.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    }
    const r = w.getBoundingClientRect();
    const dx = from ? from.x - (r.left + r.width / 2) : -40, dy = from ? from.y - (r.top + r.height / 2) : 0;
    // 몽글 떠오르기: 작은 방울 → 살짝 커졌다가 → 자리에서 말랑
    w.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(.25)`, opacity: 0, borderRadius: '50%' },
      { offset: 0.18, transform: `translate(${dx * 0.92}px, ${dy * 0.92 - 26}px) scale(.55)`, opacity: 1 },
      { offset: 0.72, transform: 'translate(0, -4px) scale(1.06, .95)', opacity: 1 },
      { offset: 0.86, transform: 'translate(0, 1px) scale(.97, 1.03)' },
      { transform: 'none', opacity: 1 },
    ], { duration: from ? 1050 : 520, easing: 'cubic-bezier(.35,.1,.3,1)' });
  }
  /** 떠 있는데 또 바뀜 — 통 하고 한 번 */
  bump(id: string) {
    const w = this.wraps.get(id);
    if (!w) return;
    w.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08, .94)' }, { transform: 'scale(.97, 1.03)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
  }
  /** 퐁 하고 내리기 — 칩 엘리먼트는 giveBack 으로 돌려준다 */
  hide(id: string, giveBack: (el: HTMLElement) => void, instant = false) {
    const w = this.wraps.get(id);
    if (!w) return;
    this.wraps.delete(id);
    const chip = w.firstElementChild as HTMLElement | null;
    const done = () => { if (chip) giveBack(chip); w.remove(); };
    if (instant) { done(); return; }
    w.classList.add('out');
    const a = w.animate([
      { transform: 'scale(1)', opacity: 1 },
      { offset: 0.4, transform: 'scale(1.12)', opacity: 1 },
      { transform: 'scale(1.3)', opacity: 0 },
    ], { duration: 300, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = done;
    // 혹시 애니메이션이 안 끝나면(탭 숨김 등) 그래도 돌려준다
    window.setTimeout(() => { if (w.isConnected) done(); }, 700);
  }
  /** 전부 바로 내리기(주머니가 열릴 때) */
  clear(giveBack: (el: HTMLElement) => void) { for (const id of [...this.wraps.keys()]) this.hide(id, giveBack, true); }
}

// ───────────── 2. 떠오르는 숫자 ─────────────
export class FloatPops {
  private live = 0;
  constructor(private host: HTMLElement) {}
  /** from(px)에서 몽글 떠올라 퐁. 한 번에 너무 많으면 건너뛴다 */
  pop(text: string, from: XY, color = '#ffcf4a', dark = '#c98a12') {
    if (this.live >= 6) return;
    const el = document.createElement('div');
    el.className = 'fpop';
    el.style.setProperty('--fc', color);
    el.style.setProperty('--fd', dark);
    el.textContent = text;
    el.style.left = `${Math.round(from.x)}px`;
    el.style.top = `${Math.round(from.y)}px`;
    this.host.appendChild(el);
    this.live++;
    const sway = (this.live % 2 ? 1 : -1) * (10 + this.live * 4);
    const a = el.animate([
      { transform: 'translate(-50%, 0) scale(.3)', opacity: 0 },
      { offset: 0.15, transform: 'translate(-50%, -18px) scale(1.15)', opacity: 1 },
      { offset: 0.75, transform: `translate(calc(-50% + ${sway}px), -78px) scale(1)`, opacity: 1 },
      { transform: `translate(calc(-50% + ${sway}px), -92px) scale(1.35)`, opacity: 0 },
    ], { duration: 1500, easing: 'cubic-bezier(.25,.8,.35,1)', fill: 'forwards' });
    const end = () => { if (el.isConnected) { el.remove(); this.live = Math.max(0, this.live - 1); } };
    a.onfinish = end;
    window.setTimeout(end, 2200);
  }
}

// ───────────── 3. 반짝이 안내 말풍선 ─────────────
/** 통통한 별(둥근 모서리) 경로 — 60×60 */
const STAR_PATH = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 11.5 : 23;
    pts.push(`${(30 + Math.cos(a) * r).toFixed(1)},${(31 + Math.sin(a) * r).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
})();
const STAR_SVG = `<svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true">
  <defs><radialGradient id="dlhs" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".55" stop-color="#ffe27a"/><stop offset="1" stop-color="#ffc54a"/></radialGradient></defs>
  <path d="${STAR_PATH}" fill="url(#dlhs)" stroke="#ffc54a" stroke-width="7" stroke-linejoin="round"/>
  <path d="${STAR_PATH}" fill="url(#dlhs)" stroke="#fff6c8" stroke-width="2" stroke-linejoin="round" opacity=".9"/>
  <g class="eyes"><ellipse cx="24" cy="31" rx="2.6" ry="3.5" fill="#3d3a4a"/><ellipse cx="36" cy="31" rx="2.6" ry="3.5" fill="#3d3a4a"/>
  <circle cx="24.9" cy="29.6" r="1" fill="#fff"/><circle cx="36.9" cy="29.6" r="1" fill="#fff"/></g>
  <g class="shut"><path d="M21.5 31.5q2.5 2 5 0M33.5 31.5q2.5 2 5 0" stroke="#3d3a4a" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>
  <ellipse cx="19.5" cy="36" rx="3.2" ry="2" fill="#ff9fb8" opacity=".7"/><ellipse cx="40.5" cy="36" rx="3.2" ry="2" fill="#ff9fb8" opacity=".7"/>
  <path class="smile" d="M27.5 36q2.5 2.4 5 0" stroke="#3d3a4a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <ellipse class="yawnm" cx="30" cy="37.5" rx="2.4" ry="3" fill="#c8566e"/>
</svg>`;

export class HintView {
  readonly el: HTMLElement;
  private sayEl: HTMLElement;
  private pos: XY | null = null;
  private id: string | null = null;
  private hideTimer = 0;
  constructor(host: HTMLElement) {
    const t = document.createElement('template');
    t.innerHTML = `<div class="hintb"><div class="star">${STAR_SVG}<i class="tw t1">✦</i><i class="tw t2">✧</i></div><div class="say dl-card"><span class="who">반짝이</span><div class="tx"></div></div></div>`;
    this.el = t.content.firstElementChild as HTMLElement;
    host.appendChild(this.el);
    this.sayEl = this.el.querySelector('.say .tx') as HTMLElement;
  }
  get current() { return this.id; }
  show(h: HintOpts) {
    clearTimeout(this.hideTimer);
    this.id = h.id;
    this.sayEl.innerHTML = hintParts(h.text, h.keys ?? []).map((p) => (p.t === 'key' ? `<kbd>${esc(p.v)}</kbd>` : esc(p.v))).join('');
    this.el.classList.remove('done', 'yawn', 'on'); void this.el.offsetWidth;
    this.el.classList.add('on');
  }
  /** why: done(해냈다 → 반짝 퐁) · timeout(하품하며 둥실) · suspend(잠깐 숨기) */
  hide(why: 'done' | 'timeout' | 'suspend' | 'remove' = 'remove') {
    if (!this.id) return;
    if (why !== 'suspend') this.id = null;
    this.el.classList.add(why === 'done' ? 'done' : why === 'timeout' ? 'yawn' : 'away');
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => { this.el.classList.remove('on', 'done', 'yawn', 'away'); }, why === 'timeout' ? 1500 : why === 'done' ? 700 : 250);
  }
  /** 매 프레임 — 어깨 자리(px)로 말랑 따라간다. 오른쪽 끝이면 말풍선을 왼쪽으로 */
  tick(anchor: XY | null, dt: number) {
    if (!this.el.classList.contains('on') || !anchor) return;
    if (!this.pos) this.pos = { ...anchor };
    const k = 1 - Math.exp(-Math.min(0.1, Math.max(0, dt)) * 9);
    this.pos.x += (anchor.x - this.pos.x) * k;
    this.pos.y += (anchor.y - this.pos.y) * k;
    const W = window.innerWidth;
    const x = Math.round(Math.min(W - 40, Math.max(40, this.pos.x))), y = Math.round(Math.max(70, this.pos.y));
    this.el.style.transform = `translate(${x}px, ${y}px)`;
    this.el.classList.toggle('left', x > W - 380);
  }
}
