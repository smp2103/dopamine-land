// hudfx 화면 막(#dlfx) — 조각 풀(색종이·별·반짝·음표·코인), 링·빛살·글 팝, 비네트·금빛 하늘·번쩍, 상자 쏟아짐, 가운데 카드(발견·해금).
// 움직임은 전부 CSS 키프레임/Web Animations 이 맡고, 자바스크립트는 켜고 끄기만 한다(매 프레임 DOM 을 만지지 않는다).
// 조각은 풀에서 빌려 쓰고 돌려준다(최대 MAX_P 개, 모자라면 가장 오래된 것을 다시 쓴다).
import { FX_CSS } from './style';
import { Sequencer, type CascadeItem, type Ceremony, type DiscoverCard, type Ring } from './logic';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—');
const h = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };
/** 애니메이션 다시 걸기(같은 클래스를 다시 켤 때) */
const restart = (el: HTMLElement, cls = 'on') => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

const MAX_P = 160;
const MAX_FLY = 16;
export type PartKind = 'confetti' | 'star' | 'spark' | 'note' | 'coin';
/** 조각 하나가 사는 시간(ms) — CSS 키프레임 길이와 같다 */
const PART_MS: Record<PartKind, number> = { confetti: 1500, star: 1100, spark: 1100, note: 1400, coin: 1600 };

type CenterItem = { ms: number; kind: 'discover'; card: DiscoverCard; small?: boolean; world?: string } | { ms: number; kind: 'ceremony'; c: Ceremony };

export class FxView {
  readonly root: HTMLElement;
  private anchor: HTMLElement;
  private rings: HTMLElement[];
  private rays: HTMLElement;
  private word: HTMLElement; private combo: HTMLElement;
  private vig: HTMLElement; private tint: HTMLElement; private flash: HTMLElement;
  private center: HTMLElement; private pityEl: HTMLElement;
  private fallback: HTMLElement;
  // 풀
  private free: HTMLElement[] = [];
  private live: Array<{ el: HTMLElement; until: number }> = [];
  private flyFree: HTMLElement[] = [];
  private flyLive = new Set<HTMLElement>();
  private timers = new Map<string, number>();
  private holdOn = false;
  readonly centers = new Sequencer<CenterItem>(6);
  /** 큰 연출 자리(hud 와 하나를 같이 쓴다 — 배너·지역 이름·가운데 카드는 한 번에 하나). 없으면 늘 비어 있는 셈 */
  stage: { free(): boolean; claim(ms: number): void } | null = null;
  /** 마지막 기준점(px) */
  ax = 0; ay = 0;

  constructor(private rnd: () => number) {
    const css = document.createElement('style');
    css.id = 'dlfx-css';
    css.textContent = FX_CSS;
    document.head.appendChild(css);
    this.root = h(`<div id="dlfx">
      <div class="tint"></div><div class="vig"></div><div class="flash"></div>
      <div class="anchor"><div class="rays"></div><div class="ring"></div><div class="ring r2"></div><div class="word"></div><div class="word combo"></div></div>
      <div class="parts"></div>
      <div class="pityburst">상자가 한 단계 변신! ✨</div>
      <div class="center"></div>
      <div class="fallback dl-card"></div>
    </div>`);
    document.body.appendChild(this.root);
    const $ = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.anchor = $('.anchor');
    this.rings = [...this.root.querySelectorAll<HTMLElement>('.ring')];
    this.rays = $('.rays'); this.word = $('.word:not(.combo)'); this.combo = $('.word.combo');
    this.vig = $('.vig'); this.tint = $('.tint'); this.flash = $('.flash');
    this.center = $('.center'); this.pityEl = $('.pityburst'); this.fallback = $('.fallback');
    this.setAnchor(window.innerWidth / 2, window.innerHeight * 0.42);
  }

  // ───────────── 기본 ─────────────
  setHidden(on: boolean) { this.root.classList.toggle('hidden', on); }
  /** __hudHold: 연출을 안 내리고 한 번 터지는 것도 되풀이 */
  setHold(on: boolean) {
    if (on === this.holdOn) return;
    this.holdOn = on;
    this.root.classList.toggle('hold', on);
    document.body.classList.toggle('dlfx-hold', on);
    if (!on) this.sweep(performance.now(), true);
  }
  get hold() { return this.holdOn; }
  /** 머리 위 기준점(px). 같은 자리면 건드리지 않는다 */
  setAnchor(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x = Math.round(x); y = Math.round(y);
    if (x === this.ax && y === this.ay) return;
    this.ax = x; this.ay = y;
    this.anchor.style.setProperty('--ax', `${x}px`);
    this.anchor.style.setProperty('--ay', `${y}px`);
  }
  /** 이름 붙은 타이머(같은 이름이면 앞의 것을 지운다). hold 중엔 끄는 타이머를 미룬다 */
  private later(name: string, ms: number, fn: () => void, offWhenHold = true) {
    const old = this.timers.get(name);
    if (old) clearTimeout(old);
    const run = () => {
      this.timers.delete(name);
      if (offWhenHold && this.holdOn) { this.timers.set(name, window.setTimeout(run, 400)); return; }
      fn();
    };
    this.timers.set(name, window.setTimeout(run, ms));
  }

  // ───────────── 조각 풀 ─────────────
  private take(): HTMLElement {
    let el = this.free.pop();
    if (!el) {
      if (this.live.length >= MAX_P) {
        // 가장 오래된 것 다시 쓰기
        el = this.live.shift()!.el;
      } else {
        el = document.createElement('i');
        el.appendChild(document.createElement('b'));
        (this.root.querySelector('.parts') as HTMLElement).appendChild(el);
      }
    }
    return el;
  }
  /** 조각 n 개를 (x, y) 에서 터뜨린다 */
  burst(kind: PartKind, n: number, o: { x?: number; y?: number; colors?: string[]; spread?: number; up?: number; delay?: number } = {}) {
    const x = o.x ?? this.ax, y = o.y ?? this.ay;
    const colors = o.colors ?? ['#ffd23f', '#ff9fb8', '#7cc8ff', '#9be7a6', '#c59bff', '#fff'];
    const spread = o.spread ?? 260, up = o.up ?? 0;
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const el = this.take();
      const r = this.rnd;
      el.className = `p ${kind}`;
      const s = el.style;
      s.left = `${x}px`; s.top = `${y}px`;
      s.animationDelay = o.delay ? `${o.delay}ms` : '';
      const b = el.firstElementChild as HTMLElement;
      b.style.animationDelay = s.animationDelay;
      if (kind === 'coin') {
        // 위로 솟았다가 옆으로 흩어져 떨어진다
        s.setProperty('--x', `${(r() - 0.5) * spread * 1.6}px`);
        s.setProperty('--h', `${-(140 + r() * 170)}px`);
        s.setProperty('--y', `${120 + r() * 160}px`);
      } else if (kind === 'note') {
        s.setProperty('--x', `${(r() - 0.5) * 160}px`);
        s.setProperty('--y', `${-(90 + r() * 90)}px`);
      } else {
        const a = (i / n) * Math.PI * 2 + r() * 0.5, d = spread * (0.55 + r() * 0.6);
        s.setProperty('--x', `${Math.cos(a) * d}px`);
        s.setProperty('--y', `${Math.sin(a) * d * 0.8 + up + (kind === 'confetti' ? 90 : 0)}px`);
        s.setProperty('--r', `${(r() - 0.5) * 900}deg`);
      }
      const col = colors[i % colors.length];
      if (kind === 'confetti') { s.background = col; s.borderRadius = i % 3 === 0 ? '50%' : ''; }
      else { s.background = ''; s.setProperty('--pc', col); }
      // 애니메이션 다시 걸기
      s.animation = 'none'; b.style.animation = 'none'; void el.offsetWidth; s.animation = ''; b.style.animation = '';
      this.live.push({ el, until: now + PART_MS[kind] + (o.delay ?? 0) + 60 });
    }
  }
  /** 다 쓴 조각 돌려주기(hold 중엔 안 돌려준다, force 면 전부) */
  sweep(now: number, force = false) {
    if (this.holdOn && !force) return;
    let w = 0;
    for (const it of this.live) {
      if (force || now >= it.until) { it.el.className = 'p'; it.el.style.animation = 'none'; this.free.push(it.el); }
      else this.live[w++] = it;
    }
    this.live.length = w;
  }
  /** 디버그: 쓰는 중/쉬는 조각 수 */
  poolStats() { return { live: this.live.length, free: this.free.length, fly: this.flyLive.size, flyFree: this.flyFree.length }; }

  // ───────────── 링·빛살·글·막 ─────────────
  ring(kind: Ring, twice = false) {
    if (kind === 'none') return;
    this.rings.forEach((r, i) => {
      r.className = `ring${i ? ' r2' : ''} ${kind}`;
      if (i === 0 || twice) restart(r);
    });
    this.later('ring', 1400, () => this.rings.forEach((r) => r.classList.remove('on')));
  }
  rays_(color: string, ms = 1000) {
    this.rays.style.setProperty('--tc', color);
    restart(this.rays);
    this.later('rays', ms + 100, () => this.rays.classList.remove('on'));
  }
  pop(text: string, color = '#6b4a2b') {
    this.word.textContent = text;
    this.word.style.setProperty('--wc', color);
    restart(this.word);
    this.later('word', 1000, () => this.word.classList.remove('on'));
  }
  comboPop(text: string, big: boolean) {
    this.combo.textContent = big ? `🔥 ${text}` : text;
    this.combo.classList.toggle('big', big);
    restart(this.combo);
    this.later('combo', 1000, () => this.combo.classList.remove('on'));
  }
  vignette(kind: 'purple' | 'tino', ms: number) {
    this.vig.classList.toggle('tino', kind === 'tino');
    this.vig.classList.add('on');
    this.later('vig', ms, () => this.vig.classList.remove('on'));
  }
  skyTint(ms: number) {
    this.tint.classList.add('on');
    this.later('tint', ms, () => this.tint.classList.remove('on'));
  }
  flashOnce() { restart(this.flash); this.later('flash', 600, () => this.flash.classList.remove('on'), false); }
  pityBurst() { restart(this.pityEl); this.later('pity', 1700, () => this.pityEl.classList.remove('on')); }

  /** hud 잡았다 상자가 없을 때 쓰는 작은 상자 */
  fallbackCatch(html: string, ms: number) {
    this.fallback.innerHTML = html;
    restart(this.fallback);
    this.later('fallback', ms, () => this.fallback.classList.remove('on'));
    return this.fallback;
  }

  // ───────────── 상자 쏟아짐 ─────────────
  /** 아이템이 (from) 에서 하나씩 튀어 올라 target(kind) 쪽으로 날아간다 */
  cascade(items: CascadeItem[], from: { x: number; y: number }, target: (to: CascadeItem['to']) => { x: number; y: number }, look: (id: string) => { icon: string; color: string }) {
    items.forEach((it, i) => {
      let el = this.flyFree.pop();
      if (!el) {
        if (this.flyLive.size >= MAX_FLY) return;
        el = h('<div class="fly"><span class="fi"></span><span class="ft"></span></div>');
        this.root.appendChild(el);
      }
      const L = look(it.id);
      (el.querySelector('.fi') as HTMLElement).textContent = L.icon;
      el.style.setProperty('--fc', L.color);
      (el.querySelector('.ft') as HTMLElement).innerHTML = `${esc(it.name)} <b>×${fmt(it.n)}</b>`;
      this.flyLive.add(el);
      // 옆으로 부채꼴처럼 펼친 뒤 날아간다
      const k = items.length > 1 ? i / (items.length - 1) - 0.5 : 0;
      const hx = from.x + k * Math.min(680, 190 * (items.length - 1)), hy = from.y - 120 - (i % 2) * 52 + Math.abs(k) * 30;
      const tg = target(it.to);
      const w = el.offsetWidth || 120;
      const tr = (x: number, y: number, s: number) => `translate(${Math.round(x - w / 2)}px, ${Math.round(y - 20)}px) scale(${s})`;
      const frames: Keyframe[] = [
        { transform: tr(from.x, from.y, 0.3), opacity: 0 },
        { offset: 0.22, transform: tr(hx, hy - 30, 1.18), opacity: 1, easing: 'cubic-bezier(.3,1.6,.5,1)' },
        { offset: 0.34, transform: tr(hx, hy, 1), opacity: 1 },
        { offset: 0.62, transform: tr(hx, hy - 8, 1), opacity: 1, easing: 'cubic-bezier(.6,0,.8,.6)' },
        { transform: tr(tg.x, tg.y, 0.35), opacity: 0.15 },
      ];
      // 촬영(hold)이면 떠 있는 자리에서 멈춘다
      const anim = el.animate(this.holdOn ? frames.slice(0, 4) : frames, { duration: this.holdOn ? 1300 : 2100, delay: it.delay, fill: 'both' });
      const done = () => {
        if (this.holdOn) { window.setTimeout(done, 400); return; }
        anim.cancel(); el!.style.opacity = '0';
        this.flyLive.delete(el!); this.flyFree.push(el!);
      };
      anim.onfinish = done;
    });
  }

  // ───────────── 가운데 카드 ─────────────
  discover(card: DiscoverCard, ms = 3200, small = false, world?: string) { this.centers.push({ kind: 'discover', card, ms, small, world }); this.pump(performance.now()); }
  /** 다른 세계로 건너가면 이전 세계의 밀린 발견 카드는 버린다(달에 내려서 지구 명소 카드가 뜨지 않게) */
  dropDiscovers(world: string) { return this.centers.drop((it) => it.kind === 'discover' && !!it.world && it.world !== world); }
  ceremony(c: Ceremony) { this.centers.push({ kind: 'ceremony', c, ms: c.ms }); this.pump(performance.now()); }
  /** 가운데 카드 차례 — 자주 불러도 된다(바뀔 때만 DOM) */
  pump(now: number) {
    // 큰 연출 자리가 비었을 때만 다음 카드(내 카드가 내려간 뒤에도 0.6초 숨 고르기 — 내가 잡아 둔 자리가 그만큼 남는다)
    const free = this.stage?.free() ?? true;
    const u = this.centers.update(now, this.holdOn, free);
    if (u?.show) {
      const it = u.show;
      this.stage?.claim(it.ms);
      const el = this.center;
      if (it.kind === 'discover') {
        const c = it.card;
        // 섬은 hud 가 지역 이름을 크게 띄우니(위쪽) 여기선 리본 + 도장만, 명소는 이름까지 크게
        const small = it.small === true;
        el.className = `center disc${small ? ' small' : ''}`;
        el.style.setProperty('--cc', c.color);
        el.innerHTML = `<div class="kick">${esc(c.icon)} ${esc(c.kicker)}</div>${small ? '' : `<div class="big">${esc(c.name)}</div>`}<div><div class="sub">${esc(small ? `지도에 도장 쾅! · ${c.name}` : c.sub)}</div></div>`
          + `<div class="dlfx-stamp cst" style="--sd:.55s">${esc(c.stamp)}<small>✓</small></div>`
          + `<div class="dlfx-bang" style="--sd:.6s;right:-110px;top:-6px;--sc:#ff6f8e">쾅!</div>`;
        this.burst('confetti', 40, { x: window.innerWidth / 2, y: window.innerHeight * 0.45, colors: [c.color, '#fff', '#ffe58a', '#ffb3c8', '#a8e6ff'], spread: 380 });
      } else {
        const c = it.c;
        el.className = 'center cer';
        el.style.setProperty('--cc', c.color);
        el.innerHTML = `<div class="cico"><div class="rays on" style="--tc:${esc(c.color)}"></div><div class="disc">${esc(c.icon)}</div></div>`
          + `<div class="kick">${esc(c.title)}</div><div class="big">${esc(c.name)}</div>`;
        this.burst('star', 14, { x: window.innerWidth / 2, y: window.innerHeight * 0.4, colors: [c.color, '#ffd23f', '#fff'], spread: 220 });
      }
      restart(el);
    } else if (u?.hide) this.center.classList.remove('on');
  }
}
