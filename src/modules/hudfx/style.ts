// hudfx 스타일 — 잡았다 단계 연출 · 도장(쾅 회전 + 스케일 펀치) · 상자 쏟아짐 · 가운데 카드(발견·해금) · 게이지 꾸미기.
// #dlfx 는 z-index 9(hud #dl 10 아래) — 비네트·금빛 하늘이 HUD 글자를 덮지 않는다. 도장·왕관·무지개 테두리는 hud 잡았다 상자 안에 붙는다.
// #dlfx.hold(window.__hudHold) 이면 한 번 터지는 애니메이션도 되풀이해서 촬영에 남는다.
import { UI_TEXT, UI_BG } from '../../core/art';

export const FX_CSS = `
#dlfx { position: fixed; inset: 0; pointer-events: none; z-index: 9; overflow: hidden; font-family: 'Jua', system-ui, sans-serif; color: ${UI_TEXT}; -webkit-font-smoothing: antialiased; }
#dlfx * { box-sizing: border-box; }
#dlfx.hidden { display: none; }

/* ── 화면 전체 막(★4 보라 비네트 · ★5 금빛 하늘 · 티노 주황) */
#dlfx .vig { position: absolute; inset: 0; opacity: 0; transition: opacity .35s; box-shadow: inset 0 0 180px 70px #9b6bffb0, inset 0 0 40px 10px #c59bff88; }
#dlfx .vig.on { opacity: 1; animation: dlfx-breath 1.1s ease-in-out infinite; }
#dlfx .vig.tino { box-shadow: inset 0 0 160px 50px #ffa24ca0, inset 0 0 30px 8px #ffc04a88; }
#dlfx .tint { position: absolute; left: 0; right: 0; top: 0; height: 70%; opacity: 0; transition: opacity .45s;
  background: linear-gradient(180deg, #ffd23fd8 0%, #ffcf4a80 35%, #ffe58a33 70%, transparent 100%); mix-blend-mode: screen; }
#dlfx .tint::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 0%, #fff6c8aa, transparent 60%); animation: dlfx-breath 1.6s ease-in-out infinite; }
#dlfx .tint.on { opacity: 1; }
#dlfx .flash { position: absolute; inset: 0; background: #fff8d8; opacity: 0; }
#dlfx .flash.on { animation: dlfx-flash .5s ease-out forwards; }
@keyframes dlfx-flash { 0% { opacity: .75 } 100% { opacity: 0 } }
@keyframes dlfx-breath { 0%,100% { filter: brightness(1) } 50% { filter: brightness(1.18) } }

/* ── 머리 위 기준점(플레이어 머리를 화면에 비춘 자리) */
#dlfx .anchor { position: absolute; left: var(--ax, 50%); top: var(--ay, 42%); width: 0; height: 0; }
#dlfx .ring { position: absolute; left: -70px; top: -70px; width: 140px; height: 140px; border-radius: 50%; opacity: 0; }
#dlfx .ring.blue { border: 9px solid #7cc8ff; box-shadow: 0 0 22px #7cc8ff, inset 0 0 18px #c9ecff; }
#dlfx .ring.rainbow, #dlfx .ring.gold { background: conic-gradient(#ff8fb1, #ffd36b, #9be7a6, #7cc8ff, #c59bff, #ff8fb1);
  -webkit-mask: radial-gradient(circle, transparent 56%, #000 58%, #000 70%, transparent 72%); mask: radial-gradient(circle, transparent 56%, #000 58%, #000 70%, transparent 72%); filter: drop-shadow(0 0 10px #fff); }
#dlfx .ring.gold { background: conic-gradient(#fff3a0, #ffcd3c, #f0a020, #fff6d0, #ffcd3c, #fff3a0); }
#dlfx .ring.on { animation: dlfx-ring 1.05s cubic-bezier(.2,.8,.3,1) forwards; }
#dlfx .ring.r2.on { animation-delay: .18s; }
@keyframes dlfx-ring { 0% { transform: scale(.25); opacity: 1 } 70% { opacity: .9 } 100% { transform: scale(3.1); opacity: 0 } }
/* 회전 쇼케이스 빛살(★4 이상 1초) */
#dlfx .rays { position: absolute; left: -170px; top: -170px; width: 340px; height: 340px; border-radius: 50%; opacity: 0;
  background: repeating-conic-gradient(from 0deg, var(--tc, #c59bff) 0 9deg, transparent 9deg 22deg);
  -webkit-mask: radial-gradient(circle, #000 14%, transparent 66%); mask: radial-gradient(circle, #000 14%, transparent 66%); }
#dlfx .rays.on { animation: dlfx-rays 1s linear forwards; }
@keyframes dlfx-rays { 0% { transform: rotate(0) scale(.6); opacity: 0 } 15% { opacity: .75 } 80% { opacity: .6 } 100% { transform: rotate(240deg) scale(1.15); opacity: 0 } }
/* '퐁!'(★1) · 음표(★2) · 콤보 팝 */
#dlfx .word { position: absolute; left: 0; top: -30px; transform: translate(-50%, -50%); white-space: nowrap; font-size: 46px; color: #fff; opacity: 0;
  -webkit-text-stroke: 9px var(--wc, #6b4a2b); paint-order: stroke fill; filter: drop-shadow(0 4px 0 #0002); }
#dlfx .word.on { animation: dlfx-word .9s cubic-bezier(.3,1.8,.5,1) forwards; }
#dlfx .word.combo { left: 110px; top: 10px; font-size: 34px; --wc: #ff7a9a; }
#dlfx .word.combo.big { font-size: 50px; --wc: #ff5a7a; }
@keyframes dlfx-word { 0% { transform: translate(-50%, -50%) scale(.3) rotate(-14deg); opacity: 0 } 30% { transform: translate(-50%, -60%) scale(1.25) rotate(6deg); opacity: 1 }
  55% { transform: translate(-50%, -62%) scale(.95) rotate(-3deg) } 80% { opacity: 1 } 100% { transform: translate(-50%, -95%) scale(1); opacity: 0 } }

/* ── 조각(풀) — 색종이·별·반짝·음표·코인 */
#dlfx .p { position: absolute; left: 0; top: 0; display: block; will-change: transform, opacity; }
#dlfx .p.confetti { width: 14px; height: 20px; box-shadow: 0 0 0 1.5px #fff8; border-radius: 4px; animation: dlfx-fly 1.5s cubic-bezier(.2,.7,.4,1) forwards; }
#dlfx .p.star, #dlfx .p.spark, #dlfx .p.note { width: 0; height: 0; font-size: 26px; line-height: 0; color: var(--pc, #ffd23f); -webkit-text-stroke: 3px #fff; paint-order: stroke fill; animation: dlfx-fly 1.1s cubic-bezier(.2,.8,.4,1) forwards; }
#dlfx .p.star::before { content: '★'; } #dlfx .p.spark::before { content: '✦'; } #dlfx .p.note::before { content: '♪'; }
#dlfx .p.star::before, #dlfx .p.spark::before, #dlfx .p.note::before { display: block; transform: translate(-50%, 0); }
#dlfx .p.note { animation: dlfx-float 1.4s ease-out forwards; font-size: 30px; }
@keyframes dlfx-fly { 0% { transform: translate(0,0) rotate(0) scale(.6); opacity: 1 } 15% { opacity: 1 } 100% { transform: translate(var(--x), var(--y)) rotate(var(--r)) scale(1); opacity: 0 } }
@keyframes dlfx-float { 0% { transform: translate(0, 0) scale(.4); opacity: 0 } 20% { opacity: 1; transform: translate(calc(var(--x) * .3), -20px) scale(1.1) } 100% { transform: translate(var(--x), var(--y)) scale(1); opacity: 0 } }
/* 코인 분수: 바깥은 옆으로(일정), 안쪽은 위로 솟았다 떨어진다 */
#dlfx .p.coin { animation: dlfx-cx 1.6s linear forwards; }
#dlfx .p.coin b { display: block; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; color: #b06a00; font-size: 14px; display: grid; place-items: center;
  background: radial-gradient(circle at 35% 30%, #fff3a0, #ffcd3c 55%, #f0a020); box-shadow: inset 0 -3px 0 #d98a12, 0 0 0 2px #fff2c0; animation: dlfx-cy 1.6s forwards; }
#dlfx .p.coin b::before { content: '₩'; }
@keyframes dlfx-cx { 0% { transform: translateX(0) } 100% { transform: translateX(var(--x)) } }
@keyframes dlfx-cy { 0% { transform: translateY(0) scale(.5) rotateY(0); opacity: 1; animation-timing-function: cubic-bezier(.2,.7,.4,1) }
  42% { transform: translateY(var(--h)) scale(1.05) rotateY(360deg); animation-timing-function: cubic-bezier(.6,0,.8,.5) }
  88% { opacity: 1 } 100% { transform: translateY(var(--y)) scale(.9) rotateY(720deg); opacity: 0 } }
#dlfx.hold .p, #dlfx.hold .p b, #dlfx.hold .ring.on, #dlfx.hold .rays.on, #dlfx.hold .word.on { animation-iteration-count: infinite !important; }

/* ── 잡았다 상자 안: 도장(쾅 회전 + 스케일 펀치) · 왕관 · 기록 줄 · 무지개 테두리 */
#dl .catch .box > .stamp { display: none; }
.dlfx-stamp { position: absolute; z-index: 3; width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center; text-align: center; line-height: 1;
  font-family: 'Jua', system-ui, sans-serif; font-size: 25px; color: var(--sc); background: #fffdf6e8; border: 5px solid var(--sc);
  box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 6px var(--sc), 0 6px 14px #4a3b2a33; opacity: 0; transform: rotate(var(--rot, 14deg));
  animation: dlfx-stamp .52s var(--sd, .25s) both cubic-bezier(.2,1.6,.45,1); pointer-events: none; }
.dlfx-stamp.new { right: -34px; top: -38px; --rot: 14deg; }
.dlfx-stamp.legend { left: -40px; top: -40px; --rot: -16deg; width: 108px; height: 108px; font-size: 30px; background: radial-gradient(circle at 40% 35%, #fffbe0, #fff1b0); }
.dlfx-stamp.shiny { right: -40px; bottom: -34px; --rot: -10deg; font-size: 21px;
  background: radial-gradient(circle at 40% 35%, #fff, #f2e6ff); }
.dlfx-stamp.crown { left: -36px; bottom: -30px; --rot: 12deg; }
.dlfx-stamp small { display: block; font-size: 13px; margin-top: 3px; }
@keyframes dlfx-stamp { 0% { transform: scale(2.9) rotate(calc(var(--rot) - 48deg)); opacity: 0 } 40% { transform: scale(.8) rotate(calc(var(--rot) + 6deg)); opacity: 1 }
  62% { transform: scale(1.14) rotate(calc(var(--rot) - 3deg)) } 82% { transform: scale(.97) rotate(var(--rot)) } 100% { transform: scale(1) rotate(var(--rot)); opacity: 1 } }
/* 도장 '쾅!' 충격 글 + 먼지 고리 */
.dlfx-bang { position: absolute; z-index: 4; font-family: 'Jua', system-ui, sans-serif; font-size: 30px; color: #fff; -webkit-text-stroke: 7px var(--sc, #ff6f8e); paint-order: stroke fill;
  opacity: 0; pointer-events: none; white-space: nowrap; animation: dlfx-bang .7s var(--sd, .25s) both cubic-bezier(.3,1.8,.5,1); }
@keyframes dlfx-bang { 0% { transform: scale(.2) rotate(-20deg); opacity: 0 } 25% { transform: scale(1.3) rotate(8deg); opacity: 1 } 70% { opacity: 1 } 100% { transform: translateY(-26px) scale(1) rotate(0); opacity: 0 } }
.dlfx-dust { position: absolute; z-index: 2; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%; border: 4px dashed var(--sc, #ff6f8e); opacity: 0; pointer-events: none;
  animation: dlfx-dust .55s var(--sd, .25s) both ease-out; }
@keyframes dlfx-dust { 0% { transform: scale(.4); opacity: .9 } 100% { transform: scale(1.7); opacity: 0 } }
body.dlfx-hold .dlfx-bang, body.dlfx-hold .dlfx-dust { animation-iteration-count: infinite; animation-duration: 1.4s; }
.dlfx-crown { position: absolute; left: 18px; top: -34px; transform: rotate(-18deg); font-size: 42px; line-height: 1; filter: drop-shadow(0 3px 0 #c98a12) drop-shadow(0 0 12px #ffd23f);
  animation: dlfx-crown .7s .2s both cubic-bezier(.3,1.8,.5,1); pointer-events: none; }
@keyframes dlfx-crown { 0% { transform: translateY(-60px) scale(.4) rotate(-50deg); opacity: 0 } 100% { transform: rotate(-18deg); opacity: 1 } }
.dlfx-rec { display: inline-block; margin-top: 6px; padding: 3px 14px; border-radius: 999px; font-size: 17px; color: #fff; background: linear-gradient(#ffd23f, #f0a020);
  border: 3px solid #fff; box-shadow: 0 3px 0 #c98a12; animation: dl-in .4s .45s both cubic-bezier(.3,1.6,.5,1); }
.dlfx-rb { position: absolute; inset: -9px; border-radius: 30px; padding: 7px; pointer-events: none; z-index: 1;
  background: conic-gradient(from var(--a, 0deg), #ff8fb1, #ffd36b, #9be7a6, #7cc8ff, #c59bff, #ff8fb1);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
  animation: dlfx-hue 2.2s linear infinite; filter: drop-shadow(0 0 8px #fff) drop-shadow(0 0 14px #c59bff); }
@keyframes dlfx-hue { to { filter: hue-rotate(360deg) drop-shadow(0 0 8px #fff) drop-shadow(0 0 14px #c59bff); } }
/* hud 상자가 없을 때 내 상자(예비) */
#dlfx .fallback { position: absolute; left: 50%; bottom: 7%; transform: translateX(-50%); padding: 14px 34px; text-align: center; display: none; }
#dlfx .fallback.on { display: block; animation: dl-pop .45s cubic-bezier(.3,1.7,.5,1); }
#dlfx .fallback .nm { font-size: 40px; color: #fff; -webkit-text-stroke: 7px #6b4a2b; paint-order: stroke fill; }
#dlfx .dl-card { background: linear-gradient(180deg, #fffdf6 0%, ${UI_BG} 100%); border: 3px solid #fff; border-radius: 22px; box-shadow: 0 5px 0 #ead6ad, 0 12px 26px #6b4a2b2e; }

/* ── 상자 쏟아짐: 하나씩 튀어나와 지갑·가방으로 날아간다 */
#dlfx .fly { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 6px; padding: 6px 14px 6px 8px; font-size: 19px; white-space: nowrap; border-radius: 999px;
  background: linear-gradient(#fffef9, #fff1d6); border: 3px solid #fff; box-shadow: 0 4px 0 #e2c08a, 0 8px 18px #4a2f1733; opacity: 0; will-change: transform, opacity; }
#dlfx .fly .fi { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 18px; background: radial-gradient(circle at 35% 30%, #fff, var(--fc, #ffe2a8)); }
#dlfx .fly b { font-weight: normal; color: #b06a00; }
#dlfx .pityburst { position: absolute; left: 50%; top: 34%; transform: translate(-50%, -50%); font-size: 34px; color: #fff; -webkit-text-stroke: 8px #ff7a9a; paint-order: stroke fill; opacity: 0; white-space: nowrap; }
#dlfx .pityburst.on { animation: dlfx-word 1.6s cubic-bezier(.3,1.8,.5,1) forwards; }

/* ── 가운데 카드: 섬 발견 · 해금 세리머니 */
#dlfx .center { position: absolute; left: 50%; top: 47%; transform: translate(-50%, -50%) scale(.6); opacity: 0; text-align: center; white-space: nowrap; transition: opacity .3s, transform .45s cubic-bezier(.3,1.6,.5,1); }
#dlfx .center.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
#dlfx .center .kick { display: inline-block; font-size: 22px; color: #fff; background: var(--cc, #7fd18b); padding: 4px 22px; border-radius: 999px; border: 4px solid #fff; box-shadow: 0 4px 0 #0002, 0 10px 22px #4a3b2a33; }
#dlfx .center .big { font-size: 70px; color: #fff; -webkit-text-stroke: 12px #5a3f22; paint-order: stroke fill; letter-spacing: 4px; margin-top: 6px;
  filter: drop-shadow(0 6px 0 var(--cc, #7fd18b)) drop-shadow(0 12px 20px #0004); }
#dlfx .center .sub { display: inline-block; margin-top: 6px; font-size: 20px; padding: 4px 18px; border-radius: 999px; background: ${UI_BG}; color: ${UI_TEXT}; box-shadow: 0 3px 0 #ead6ad; }
#dlfx .center .cst { position: absolute; right: -64px; top: 16px; --sc: #ff6f8e; }
#dlfx .center .cico { position: relative; width: 130px; height: 130px; margin: 0 auto 8px; }
#dlfx .center .cico .rays { left: -45px; top: -45px; width: 220px; height: 220px; opacity: .8; animation: dl-spin 6s linear infinite; }
#dlfx .center .cico .disc { position: absolute; inset: 0; border-radius: 50%; display: grid; place-items: center; font-size: 66px;
  background: radial-gradient(circle at 35% 30%, #fff, var(--cc, #ffe2a8)); border: 5px solid #fff; box-shadow: 0 6px 0 #0002, 0 0 30px var(--cc, #ffe2a8);
  animation: dlfx-pop2 .6s .1s both cubic-bezier(.3,1.8,.5,1); }
#dlfx .center.cer .big { font-size: 52px; }
#dlfx .center.disc.small { top: 39%; }
#dlfx .center.disc.small .kick { font-size: 28px; padding: 6px 30px; }
#dlfx .center.disc.small .cst { right: -78px; top: -30px; }
@keyframes dlfx-pop2 { 0% { transform: scale(.2) rotate(-40deg); opacity: 0 } 100% { transform: none; opacity: 1 } }

/* ── hud 게이지 꾸미기: 두근 80%↑ 분홍 반짝 · 산소 모자람 깜빡 · 티노 쿨쿨 */
#dl .gauge[data-g^="pity:"].hot { background: linear-gradient(180deg, #fff4f8, #ffe3ee); box-shadow: 0 0 0 3px #ffd0de, 0 0 18px #ff9fb8, 0 5px 0 #f0b6c8; animation: dlfx-pink 1s ease-in-out infinite; }
#dl .gauge[data-g^="pity:"].hot .gl span::after { content: ' 곧 뭔가 온다!'; color: #ff6f8e; font-size: 12px; }
@keyframes dlfx-pink { 0%,100% { transform: scale(1) } 50% { transform: scale(1.04); box-shadow: 0 0 0 3px #ffc0d4, 0 0 26px #ff8fb1, 0 5px 0 #f0b6c8 } }
#dl .gauge.dlfx-low { animation: dlfx-low .7s ease-in-out infinite; }
@keyframes dlfx-low { 0%,100% { background: inherit } 50% { box-shadow: 0 0 0 3px #ffb3b3, 0 0 16px #ff8f8f } }
#dl .gauge[data-g="tino"] .gl span::before { content: '💤 '; display: inline-block; animation: dl-wob 1.6s ease-in-out infinite; }
#dl .gauge[data-g="tino"].hot { animation: dlfx-shake .35s ease-in-out infinite; }
#dl .gauge[data-g="tino"].dlfx-stir { animation: dlfx-shake .4s ease-in-out 3; }
@keyframes dlfx-shake { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-3px) rotate(-1deg) } 75% { transform: translateX(3px) rotate(1deg) } }

/* ── 코인 카운트업 통통(hud 지갑 숫자에 붙이는 클래스) */
.dl-countup { display: inline-block; animation: dlfx-count .55s cubic-bezier(.3,1.8,.5,1); }
@keyframes dlfx-count { 0% { transform: scale(1) } 30% { transform: scale(1.38) translateY(-3px); color: #f0a020 } 100% { transform: scale(1) } }
`;
