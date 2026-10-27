// meta 큰 축하 — 세트 완성 때 화면 가운데 '세트 완성!' 카드 + 색종이 비 + 빙글 빛살(약 4초, 클릭을 막지 않는다).
// 일지 창 스타일(.mj …)도 여기서 한 번만 head 에 넣는다. DOM 이 없으면(시험·node) 조용히 아무것도 안 한다.

const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function' && !!document.body;

const CSS = `
.mj-fest { position: fixed; inset: 0; z-index: 80; pointer-events: none; overflow: hidden; font-family: 'Jua', system-ui, sans-serif; }
.mj-fest .rays { position: absolute; left: 50%; top: 46%; width: 1400px; height: 1400px; margin: -700px 0 0 -700px; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, var(--fc, #ffd36b) 0 9deg, transparent 9deg 24deg); opacity: 0;
  mask: radial-gradient(circle, #000 0 18%, transparent 62%); -webkit-mask: radial-gradient(circle, #000 0 18%, transparent 62%);
  animation: mj-rays 4.2s ease-out forwards; }
@keyframes mj-rays { 0% { opacity: 0; transform: rotate(0) scale(.4) } 12% { opacity: .55 } 80% { opacity: .4 } 100% { opacity: 0; transform: rotate(80deg) scale(1.1) } }
.mj-fest .card { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); min-width: 340px; max-width: 86vw; text-align: center;
  padding: 22px 36px 20px; border-radius: 36px; border: 6px solid #fff; color: #4a3b2a;
  background: radial-gradient(circle at 14px 14px, #fff3d6 4px, transparent 4.5px) 0 0/28px 28px, linear-gradient(#fffdf6, #fff1d8);
  box-shadow: 0 10px 0 #0000001a, 0 0 0 8px var(--fc, #ffd36b); animation: mj-pop 4.2s cubic-bezier(.3,1.6,.5,1) forwards; }
@keyframes mj-pop { 0% { transform: translate(-50%, -50%) scale(.2) rotate(-8deg); opacity: 0 } 10% { transform: translate(-50%, -50%) scale(1.08) rotate(2deg); opacity: 1 }
  16% { transform: translate(-50%, -50%) scale(1) rotate(0) } 86% { transform: translate(-50%, -50%) scale(1); opacity: 1 } 100% { transform: translate(-50%, -50%) scale(.85) translateY(-30px); opacity: 0 } }
.mj-fest .card .ic { font-size: 84px; line-height: 1; display: inline-block; animation: mj-bob 1s ease-in-out infinite; filter: drop-shadow(0 6px 0 #0000001a); }
@keyframes mj-bob { 0%, 100% { transform: translateY(0) rotate(-6deg) } 50% { transform: translateY(-12px) rotate(6deg) } }
.mj-fest .card .hd { display: inline-block; margin-top: 6px; font-size: 22px; color: #fff; background: var(--fc, #ffd36b); padding: 2px 18px; border-radius: 999px; border: 3px solid #fff; box-shadow: 0 3px 0 #0002; }
.mj-fest .card .tt { font-size: 40px; margin-top: 6px; }
.mj-fest .card .rw { font-size: 18px; color: #a0784c; margin-top: 4px; }
.mj-fest i.cf { position: absolute; top: -24px; width: 12px; height: 18px; border-radius: 4px; opacity: .95; animation: mj-fall linear forwards; }
.mj-fest i.cf.r { border-radius: 50%; width: 13px; height: 13px; }
.mj-fest i.cf.s { width: 0; height: 0; background: none !important; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 15px solid var(--cc); border-radius: 0; }
@keyframes mj-fall { 0% { transform: translate3d(0, 0, 0) rotate(0) } 100% { transform: translate3d(var(--dx), 112vh, 0) rotate(var(--rot)) } }

/* ── 일지 창(journal) ── */
#dl .mj .mj-day { display: flex; align-items: center; gap: 10px; font-size: 18px; color: #a88a66; margin: 2px 0 10px; }
#dl .mj .mj-day b { color: #e38b57; }
#dl .mj .mj-all { display: flex; align-items: center; gap: 14px; padding: 12px 18px; margin-top: 4px; }
#dl .mj .mj-all .tx { flex: 1; font-size: 19px; } #dl .mj .mj-all small { display: block; color: #a88a66; font-size: 14px; }
#dl .mj .mj-all.got { background: linear-gradient(90deg, #fff5c8, #ffe3f0); }
#dl .mj .req .who.ok { background: radial-gradient(circle at 35% 30%, #fff, #c8f2cf); }
#dl .mj .req .chk { font-size: 30px; }
#dl .mj h4 { margin: 14px 2px 8px; font-size: 20px; color: #8a6b48; font-weight: normal; display: flex; gap: 8px; align-items: center; }
#dl .mj h4 small { color: #b89a74; font-size: 14px; }
#dl .mj .mj-ach { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 10px; }
#dl .mj .mj-a { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 20px; background: #fff; border: 3px solid #fff; box-shadow: 0 4px 0 #ecd9b4; }
#dl .mj .mj-a .ai { width: 46px; height: 46px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: 25px; background: radial-gradient(circle at 35% 30%, #fff, #f1e2c4); }
#dl .mj .mj-a.on .ai { background: radial-gradient(circle at 35% 30%, #fff, #ffd36b); box-shadow: 0 0 0 3px #fff3c4; }
#dl .mj .mj-a.off .ai { filter: grayscale(1) opacity(.5); }
#dl .mj .mj-a .at { flex: 1; min-width: 0; font-size: 16px; line-height: 1.15; }
#dl .mj .mj-a .at small { display: block; color: #a88a66; font-size: 12.5px; }
#dl .mj .mj-a .at .bar { height: 8px; margin-top: 4px; }
#dl .mj .mj-a .st { font-size: 13px; color: #d98f12; white-space: nowrap; }
#dl .mj .mj-a.on .st { color: #4ea562; }
#dl .mj .mj-set { padding: 12px 16px; margin-bottom: 12px; border-radius: 22px; }
#dl .mj .mj-set.on { box-shadow: 0 0 0 4px var(--sc, #ffd36b), 0 4px 0 #ecd9b4; }
#dl .mj .mj-set .top { display: flex; align-items: center; gap: 12px; }
#dl .mj .mj-set .top .si { width: 54px; height: 54px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: 30px; background: radial-gradient(circle at 35% 30%, #fff, var(--sc, #ffe7c2)); }
#dl .mj .mj-set .top .tx { flex: 1; font-size: 19px; } #dl .mj .mj-set .top small { display: block; color: #a88a66; font-size: 14px; }
#dl .mj .mj-set .top .n { font-size: 20px; color: #8a6b48; }
#dl .mj .mj-mem { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
#dl .mj .mj-mem span { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-size: 20px; background: #f6ecd8; overflow: hidden; }
#dl .mj .mj-mem span.got { background: radial-gradient(circle at 35% 30%, #fff, var(--sc, #ffe7c2)); }
#dl .mj .mj-mem span img { width: 100%; height: 100%; object-fit: contain; }
#dl .mj .mj-mem span.miss { color: #c9b08a; font-size: 16px; }
#dl .mj .mj-sum { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
#dl .mj .mj-sum .pill { font-size: 17px; padding: 6px 14px; border-radius: 999px; background: #fff; border: 3px solid #fff; box-shadow: 0 3px 0 #ecd9b4; }
#dl .mj .mj-isl { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
#dl .mj .mj-isl .dl-card { padding: 10px 14px; font-size: 17px; }
#dl .mj .mj-isl .stp { display: flex; gap: 6px; margin-top: 4px; font-size: 12px; color: #b89a74; } #dl .mj .mj-isl .stp span { white-space: nowrap; }
#dl .mj .mj-isl .stp span.on { color: #4ea562; }
#dl .mj .mj-mgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; }
#dl .mj .mj-m { text-align: center; padding: 6px 4px; border-radius: 18px; background: #fff; box-shadow: 0 3px 0 #ecd9b4; font-size: 13px; }
#dl .mj .mj-m .mi { width: 44px; height: 44px; margin: 0 auto 2px; border-radius: 50%; display: grid; place-items: center; font-size: 24px; background: radial-gradient(circle at 35% 30%, #fff, #f1e2c4); overflow: hidden; }
#dl .mj .mj-m .mi img { width: 100%; height: 100%; object-fit: contain; }
#dl .mj .mj-m .ms { font-size: 14px; letter-spacing: 1px; } #dl .mj .mj-m .ms .g { color: #ffbe3b; } #dl .mj .mj-m .ms .s { color: #a9b8c8; } #dl .mj .mj-m .ms .o { color: #e8dcc6; }
#dl .mj .mj-m.l3 { box-shadow: 0 0 0 3px #ffe58a, 0 3px 0 #ecd9b4; }
`;

/** 일지·축하 스타일을 한 번만 */
export function ensureMetaStyle() {
  if (!hasDom() || document.getElementById('meta-style')) return;
  const el = document.createElement('style');
  el.id = 'meta-style';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export interface FestOpts {
  /** 큰 제목(세트 이름) */
  title: string;
  /** 머리띠 글(기본 '세트 완성!') */
  head?: string;
  icon: string;
  color: string;
  /** 보상 한 줄 */
  reward: string;
  /** 색종이 자리·색 고르기 */
  rng: () => number;
  ms?: number;
}

const CONFETTI = ['#ff9cb8', '#ffd36b', '#8fdc9a', '#7cc8ff', '#c59bff', '#ffb36b', '#fff'];
const queue: FestOpts[] = [];
let showing = false;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** 축하를 띄운다(이미 하나 떠 있으면 줄을 선다). DOM 이 없으면 false */
export function showFest(o: FestOpts): boolean {
  if (!hasDom()) return false;
  ensureMetaStyle();
  queue.push(o);
  if (!showing) next();
  return true;
}
function next() {
  const o = queue.shift();
  if (!o) { showing = false; return; }
  showing = true;
  const ms = o.ms ?? 4200;
  const root = document.createElement('div');
  root.className = 'mj-fest';
  root.style.setProperty('--fc', o.color);
  const pieces: string[] = [];
  for (let i = 0; i < 96; i++) {
    const r = o.rng;
    const c = [o.color, ...CONFETTI][Math.floor(r() * (CONFETTI.length + 1))];
    const shape = r() < 0.2 ? ' r' : r() < 0.25 ? ' s' : '';
    const left = (r() * 104 - 2).toFixed(1);
    const delay = (r() * 1.6).toFixed(2);
    const dur = (2.2 + r() * 1.8).toFixed(2);
    const dx = `${Math.round((r() - 0.5) * 220)}px`;
    const rot = `${Math.round((r() - 0.5) * 1440)}deg`;
    pieces.push(`<i class="cf${shape}" style="left:${left}%;background:${c};--cc:${c};--dx:${dx};--rot:${rot};animation-delay:${delay}s;animation-duration:${dur}s"></i>`);
  }
  root.innerHTML = `<div class="rays"></div>${pieces.join('')}
    <div class="card"><div class="ic">${esc(o.icon)}</div><div><span class="hd">${esc(o.head ?? '세트 완성!')}</span></div>
    <div class="tt">${esc(o.title)}</div><div class="rw">${esc(o.reward)}</div></div>`;
  document.body.appendChild(root);
  setTimeout(() => { root.remove(); next(); }, ms);
}
/** 지금 떠 있는·기다리는 축하 수(디버그) */
export const festPending = () => queue.length + (showing ? 1 : 0);
