// 발사 연출 화면 덮개(GDD 6.2) — DOM 한 장: 가운데 통통 튀는 큰 숫자 3·2·1·발사!, 하늘이 남색 → 별 + 둥근 지구 실루엣, 흰 페이드.
// 렌더 패스를 늘리지 않는다(그냥 HTML 층). DOM 이 없으면(테스트) 아무것도 안 한다.
const STYLE_ID = 'dl-launchfx-style';

const CSS = `
.dl-launch { position: fixed; inset: 0; pointer-events: none; z-index: 60; font-family: 'Jua', sans-serif; }
.dl-launch .sky { position: absolute; inset: 0; opacity: 0; background:
  radial-gradient(ellipse 120% 80% at 50% 120%, rgba(143,211,244,0.55) 0%, rgba(84,96,190,0.25) 38%, rgba(0,0,0,0) 62%),
  linear-gradient(180deg, #131a46 0%, #222a6e 55%, #3b3f93 100%); }
.dl-launch .stars { position: absolute; inset: 0; }
.dl-launch .star { position: absolute; border-radius: 50%; background: #fff8e8; box-shadow: 0 0 6px 2px rgba(255,248,232,0.55); }
.dl-launch .earth { position: absolute; left: 50%; bottom: -78vh; width: 118vh; height: 118vh; margin-left: -59vh; border-radius: 50%;
  background: radial-gradient(circle at 38% 28%, #a8e6ff 0%, #6cc6ee 26%, #3aa3cf 52%, #2f6fb8 78%, #2a4d93 100%);
  box-shadow: 0 0 60px 22px rgba(143,211,244,0.55), inset -40px -50px 90px rgba(19,26,70,0.55); overflow: hidden; }
.dl-launch .earth i { position: absolute; border-radius: 50%; background: #86d16f; opacity: 0.92; box-shadow: inset -8px -10px 18px rgba(46,90,40,0.25); }
.dl-launch .earth b { position: absolute; border-radius: 50%; background: #ffffff; opacity: 0.7; }
.dl-launch .white { position: absolute; inset: 0; background: #fffdf6; opacity: 0; }
.dl-launch .num { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%) scale(0); color: #fff8e8; font-size: 230px; line-height: 1;
  -webkit-text-stroke: 10px #ff6f8b; paint-order: stroke fill; text-shadow: 0 12px 0 #d94f6e, 0 22px 30px rgba(74,59,42,0.35); white-space: nowrap; }
.dl-launch .num.go { font-size: 170px; -webkit-text-stroke-color: #ff9d2e; text-shadow: 0 12px 0 #e07a1a, 0 22px 30px rgba(74,59,42,0.35); }
.dl-launch .num.pop { animation: dl-launch-pop 0.9s cubic-bezier(.2,1.6,.4,1) forwards; }
@keyframes dl-launch-pop {
  0% { transform: translate(-50%, -50%) scale(0.2) rotate(-12deg); opacity: 0; }
  30% { transform: translate(-50%, -58%) scale(1.25) rotate(4deg); opacity: 1; }
  50% { transform: translate(-50%, -46%) scale(0.92) rotate(-2deg); }
  68% { transform: translate(-50%, -52%) scale(1.06) rotate(1deg); }
  84% { transform: translate(-50%, -50%) scale(1) rotate(0); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.1); opacity: 0; }
}
`;

const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function' && !!document.body;

/** 발사 덮개 — show() 로 붙이고 hide() 로 뗀다. rnd 는 별 자리(결정적) */
export class LaunchFx {
  private el: HTMLDivElement | null = null;
  private sky: HTMLDivElement | null = null;
  private white: HTMLDivElement | null = null;
  private num: HTMLDivElement | null = null;
  /** 지금 보이는 숫자(디버그·테스트) */
  shown: string | null = null;
  skyK = 0;
  whiteK = 0;
  constructor(private rnd: () => number) {}

  get active() { return !!this.el; }

  show() {
    if (this.el || !hasDom()) return;
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'dl-launch';
    el.innerHTML = '<div class="sky"><div class="stars"></div><div class="earth"></div></div><div class="num"></div><div class="white"></div>';
    document.body.appendChild(el);
    this.el = el;
    this.sky = el.querySelector('.sky');
    this.white = el.querySelector('.white');
    this.num = el.querySelector('.num');
    // 별(작은 동그라미) — 위쪽에 많이
    const stars = el.querySelector('.stars') as HTMLDivElement;
    for (let i = 0; i < 90; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      const r = 1.5 + this.rnd() * 3.2;
      s.style.cssText = `left:${(this.rnd() * 100).toFixed(2)}%;top:${(Math.pow(this.rnd(), 1.5) * 70).toFixed(2)}%;width:${r.toFixed(1)}px;height:${r.toFixed(1)}px;opacity:${(0.5 + this.rnd() * 0.5).toFixed(2)}`;
      stars.appendChild(s);
    }
    // 지구: 둥근 대륙(연두)과 구름(흰)
    const earth = el.querySelector('.earth') as HTMLDivElement;
    for (let i = 0; i < 9; i++) {
      const c = document.createElement(i < 6 ? 'i' : 'b');
      const w = i < 6 ? 8 + this.rnd() * 16 : 10 + this.rnd() * 14;
      c.style.cssText = `left:${(10 + this.rnd() * 70).toFixed(1)}%;top:${(4 + this.rnd() * 30).toFixed(1)}%;width:${w.toFixed(1)}%;height:${(w * (i < 6 ? 0.7 : 0.32)).toFixed(1)}%`;
      earth.appendChild(c);
    }
  }

  /** 큰 숫자 하나 통통(문자열 그대로: '3' '2' '1' '발사!') */
  count(text: string) {
    this.shown = text;
    const n = this.num;
    if (!n) return;
    n.textContent = text;
    n.classList.toggle('go', !/^\d$/.test(text));
    n.classList.remove('pop');
    void n.offsetWidth; // 애니메이션 다시 시작
    n.classList.add('pop');
  }

  /** 하늘(남색 → 별 + 지구) 0..1 */
  setSky(k: number) {
    this.skyK = Math.max(0, Math.min(1, k));
    const sky = this.sky;
    if (!sky) return;
    // 남색이 위에서부터 내려와 덮고(아래는 아직 섬이 보인다), 지구는 아래에서 떠오른다
    const p = -40 + this.skyK * 150;
    const mask = this.skyK >= 1 ? 'none' : `linear-gradient(to bottom, #000 ${p.toFixed(1)}%, transparent ${(p + 40).toFixed(1)}%)`;
    sky.style.opacity = Math.min(1, this.skyK * 1.8).toFixed(3);
    sky.style.setProperty('-webkit-mask-image', mask);
    sky.style.setProperty('mask-image', mask);
    const earth = sky.querySelector('.earth') as HTMLElement | null;
    if (earth) earth.style.transform = `translateY(${((1 - this.skyK) * 45).toFixed(2)}vh)`;
  }
  /** 흰 페이드 0..1 */
  setWhite(k: number) {
    this.whiteK = Math.max(0, Math.min(1, k));
    if (this.white) this.white.style.opacity = this.whiteK.toFixed(3);
  }

  hide() {
    this.el?.remove();
    this.el = this.sky = this.white = this.num = null;
    this.shown = null;
    this.skyK = this.whiteK = 0;
  }
}
