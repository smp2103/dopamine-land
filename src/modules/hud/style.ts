// HUD 스타일 — Jua, 둥근 말풍선 카드, 파스텔, 통통 튀는 애니메이션.
// UI 강조색(GDD 7.4 · art.ts): 따뜻한 갈색 글자 UI_TEXT(#4a3b2a) + 크림 패널 UI_BG(#fff8e8).
// z-index: #dl 10(코어 #ui 위) · 안쪽 잡았다/상자 5 · 대화 6 · 창 8 · 카드 7.
import { UI_TEXT, UI_BG } from '../../core/art';

export const CSS = `
#dl { position: fixed; inset: 0; pointer-events: none; font-family: 'Jua', system-ui, sans-serif; color: ${UI_TEXT}; z-index: 10; -webkit-font-smoothing: antialiased; }
#dl * { box-sizing: border-box; }
#hud { display: none !important; }
#ui .coins { display: none !important; }
#ui .prompt { background: linear-gradient(#fffdf5, #fff3d6) !important; border: 3px solid #fff; border-radius: 999px !important;
  padding: 8px 20px 8px 10px !important; font-size: 20px !important; box-shadow: 0 5px 0 #e8cf9e, 0 10px 24px #6b4a2b33 !important; color: ${UI_TEXT};
  animation: dl-bob 1.6s ease-in-out infinite; }
#ui .prompt::first-letter { display: inline-block; background: #7ccf8a; color: #fff; border-radius: 10px; padding: 0 8px; margin-right: 6px; box-shadow: 0 3px 0 #4ea562; }
#ui .toast { background: linear-gradient(#fffef9, #fff4dc) !important; border: 3px solid #fff; border-radius: 18px !important; padding: 8px 18px !important;
  font-size: 18px !important; box-shadow: 0 4px 0 #ead6ad, 0 8px 18px #6b4a2b26 !important; animation: dl-pop .35s cubic-bezier(.3,1.6,.5,1); }
@keyframes dl-bob { 0%,100% { transform: translateX(-50%) translateY(0) } 50% { transform: translateX(-50%) translateY(-4px) } }
@keyframes dl-pop { 0% { transform: scale(.4); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
@keyframes dl-in { 0% { transform: translateY(18px) scale(.9); opacity: 0 } 100% { transform: none; opacity: 1 } }
@keyframes dl-spin { to { transform: rotate(360deg) } }
@keyframes dl-wob { 0%,100% { transform: rotate(-4deg) } 50% { transform: rotate(4deg) } }
@keyframes dl-coin { 0% { transform: scale(1) } 30% { transform: scale(1.25) rotate(-8deg) } 100% { transform: scale(1) } }

.dl-card { background: linear-gradient(180deg, #fffdf6 0%, ${UI_BG} 100%); border: 3px solid #fff; border-radius: 22px;
  box-shadow: 0 5px 0 #ead6ad, 0 12px 26px #6b4a2b2e; }

/* 좌상단: 시계 */
#dl .clock { position: absolute; left: 18px; top: 16px; padding: 8px 16px 8px 12px; display: flex; align-items: center; gap: 10px; }
#dl .clock .sun { width: 38px; height: 38px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff6b0, #ffc94a 60%, #ffa23a); box-shadow: 0 0 0 4px #fff3c8, 0 0 18px #ffcf5a; }
#dl .clock .sun.night { background: radial-gradient(circle at 35% 35%, #fffbe8, #e8e3ff 60%, #b9afff); box-shadow: 0 0 0 4px #ece8ff, 0 0 18px #b9afff; }
#dl .clock .t { font-size: 28px; line-height: 1; color: ${UI_TEXT}; letter-spacing: 1px; }
#dl .clock .d { font-size: 14px; color: #a88a66; margin-top: 2px; }
#dl .clock .place { font-size: 14px; color: #fff; background: #8ccf7e; border-radius: 999px; padding: 2px 10px; margin-left: 4px; box-shadow: 0 2px 0 #64a85a; }

/* 우상단: 코인·별 */
#dl .wallet { position: absolute; right: 18px; top: 16px; display: flex; gap: 10px; }
#dl .pill { display: flex; align-items: center; gap: 8px; padding: 6px 16px 6px 8px; font-size: 22px; }
#dl .pill .ic { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; color: #fff; }
#dl .pill .ic.coin { background: radial-gradient(circle at 35% 30%, #fff3a0, #ffcd3c 55%, #f0a020); box-shadow: inset 0 -3px 0 #d98a12, 0 0 0 3px #fff2c0; color: #b06a00; font-size: 16px; }
#dl .pill .ic.star { background: radial-gradient(circle at 35% 30%, #fff, #c9b8ff 60%, #9d86ff); box-shadow: inset 0 -3px 0 #7d66e0, 0 0 0 3px #ece6ff; }
#dl .pill.bump .ic { animation: dl-coin .5s ease; }
#dl .delta { position: absolute; right: 24px; top: 70px; font-size: 24px; color: #fff; -webkit-text-stroke: 5px #d98a12; paint-order: stroke fill; animation: dl-pop .3s; transition: opacity .6s, transform .6s; }

/* 우하단: 미니맵 */
#dl .map { position: absolute; right: 18px; bottom: 18px; width: 196px; height: 196px; border-radius: 50%; padding: 6px; }
#dl .map canvas { width: 100%; height: 100%; border-radius: 50%; display: block; }
#dl .map .n { position: absolute; left: 50%; top: -6px; transform: translateX(-50%); background: #ff8f8f; color: #fff; border-radius: 999px; padding: 0 9px; font-size: 15px; box-shadow: 0 3px 0 #db6a6a; border: 2px solid #fff; }
#dl .map .lbl { position: absolute; left: 50%; bottom: -12px; transform: translateX(-50%); white-space: nowrap; font-size: 14px; padding: 2px 12px; border-radius: 999px; background: #fff; box-shadow: 0 3px 0 #ead6ad; }

/* 좌하단: 단축키 */
#dl .keys { position: absolute; left: 18px; bottom: 18px; display: flex; gap: 8px; }
#dl .key { display: flex; align-items: center; gap: 6px; padding: 6px 12px 6px 6px; font-size: 16px; border-radius: 16px; }
#dl .key b { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 9px; background: #fff; border: 2px solid #e6d3ae; box-shadow: 0 3px 0 #e6d3ae; font-weight: normal; font-size: 14px; color: #8a6b48; }
#dl .help { position: absolute; left: 50%; bottom: 24%; transform: translateX(-50%); padding: 14px 22px; font-size: 17px; display: grid; grid-template-columns: repeat(4, auto); gap: 8px 18px; align-items: center; animation: dl-in .5s cubic-bezier(.3,1.5,.5,1); transition: opacity .8s; }
#dl .help .k { display: flex; gap: 6px; align-items: center; }
#dl .help .title { grid-column: 1 / -1; text-align: center; font-size: 20px; color: #e38b57; }

/* 지역명 (젤다식) */
#dl .region { position: absolute; left: 50%; top: 24%; transform: translateX(-50%); text-align: center; opacity: 0; transition: opacity 1s; }
#dl .region.on { opacity: 1; }
#dl .region .nm { font-size: 64px; color: #fff; -webkit-text-stroke: 10px var(--rc, #7fd18b); paint-order: stroke fill; letter-spacing: 4px; text-shadow: 0 6px 0 #00000014;
  transform: scale(.85); transition: transform 1.2s cubic-bezier(.2,1.4,.4,1); }
#dl .region.on .nm { transform: scale(1); }
#dl .region .sub { display: inline-flex; align-items: center; gap: 14px; margin-top: 4px; font-size: 22px; color: #fff; text-shadow: 0 2px 0 #0003; }
#dl .region .sub i { display: block; width: 90px; height: 3px; border-radius: 3px; background: linear-gradient(90deg, transparent, #fff); }
#dl .region .sub i:last-child { transform: scaleX(-1); }

/* 잡았다! */
#dl .catch { position: absolute; z-index: 5; left: 50%; top: 13%; transform: translateX(-50%); display: none; text-align: center; }
#dl .catch.on { display: block; }
#dl .catch .burst { position: absolute; left: 50%; top: 50%; width: 520px; height: 520px; margin: -260px 0 0 -260px; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, var(--rc) 0 10deg, transparent 10deg 20deg); opacity: .32; animation: dl-spin 9s linear infinite;
  -webkit-mask: radial-gradient(circle, #000 20%, transparent 68%); mask: radial-gradient(circle, #000 20%, transparent 68%); }
#dl .catch .box { position: relative; padding: 16px 36px 16px; animation: dl-pop .45s cubic-bezier(.3,1.7,.5,1); }
#dl .catch .got { font-size: 22px; color: #fff; background: var(--rc); display: inline-block; padding: 2px 16px; border-radius: 999px; margin-top: -32px; box-shadow: 0 3px 0 #0002; border: 3px solid #fff; }
#dl .catch .nm { font-size: 48px; color: #fff; -webkit-text-stroke: 7px #6b4a2b; paint-order: stroke fill; margin-top: 4px; }
#dl .catch .stars { font-size: 24px; color: var(--rc); letter-spacing: 2px; -webkit-text-stroke: 2px #fff; paint-order: stroke fill; }
#dl .catch .info { font-size: 18px; color: #8a6b48; margin-top: 2px; }
#dl .catch .line { font-size: 17px; margin-top: 6px; background: #fff; border-radius: 14px; padding: 4px 14px; display: inline-block; }
#dl .catch .stamp { position: absolute; right: -26px; top: -26px; width: 84px; height: 84px; border-radius: 50%; border: 5px solid #ff6f8e; color: #ff6f8e; display: grid; place-items: center;
  font-size: 26px; background: #fff8; transform: rotate(16deg); animation: dl-stamp .5s .25s both cubic-bezier(.3,1.8,.5,1); box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 5px #ff6f8e; }
@keyframes dl-stamp { 0% { transform: scale(2.4) rotate(40deg); opacity: 0 } 100% { transform: scale(1) rotate(16deg); opacity: 1 } }
#dl .confetti { position: absolute; left: 50%; top: 50%; width: 12px; height: 18px; border-radius: 4px; animation: dl-fly 1.6s cubic-bezier(.2,.7,.4,1) forwards; }
@keyframes dl-fly { 0% { transform: translate(0,0) rotate(0); opacity: 1 } 100% { transform: translate(var(--x), var(--y)) rotate(var(--r)); opacity: 0 } }

/* 상자 결과 */
#dl .loot { position: absolute; z-index: 5; left: 50%; top: 30%; white-space: nowrap; transform: translateX(-50%); text-align: center; display: none; }
#dl .loot.on { display: block; }
#dl .loot .tier { font-size: 54px; color: var(--rc); -webkit-text-stroke: 12px #5a3a1a; paint-order: stroke fill; text-shadow: 0 0 30px var(--rc); animation: dl-pop .5s cubic-bezier(.3,1.8,.5,1); }
#dl .loot .row { display: flex; gap: 10px; justify-content: center; margin-top: 8px; }
#dl .loot .it { padding: 8px 14px; font-size: 18px; display: flex; gap: 6px; align-items: center; animation: dl-in .4s both cubic-bezier(.3,1.6,.5,1); }

/* 창 */
#dl .win { position: absolute; left: 50%; top: 50%; width: min(860px, 92vw); height: min(600px, 84vh); transform: translate(-50%, -50%); pointer-events: auto;
  display: none; flex-direction: column; padding: 0; overflow: hidden; border-radius: 34px; border: 5px solid #fff;
  background: radial-gradient(circle at 12px 12px, #ffeccc 3px, transparent 3.5px) 0 0/26px 26px, linear-gradient(#fffaf0, #fff1d8); }
#dl .win.on { display: flex; animation: dl-in .4s cubic-bezier(.3,1.5,.5,1); }
#dl .win .hd { display: flex; align-items: center; gap: 12px; padding: 16px 22px 10px; }
#dl .win .hd .ttl { font-size: 32px; color: #fff; background: var(--wc, #ffb36b); padding: 4px 22px; border-radius: 999px; box-shadow: 0 4px 0 #0002; border: 3px solid #fff; }
#dl .win .hd .meta { margin-left: auto; font-size: 18px; color: #a88a66; }
#dl .win .x { width: 40px; height: 40px; border-radius: 50%; border: 3px solid #fff; background: #ff9b9b; color: #fff; font-family: inherit; font-size: 20px; cursor: pointer; box-shadow: 0 3px 0 #d97373; }
#dl .tabs { display: flex; gap: 8px; padding: 0 22px 8px; flex-wrap: wrap; }
#dl .tab { font-family: inherit; font-size: 18px; color: #8a6b48; padding: 6px 16px; border-radius: 999px; border: 3px solid #fff; background: #f6e7c8; cursor: pointer; box-shadow: 0 3px 0 #e2c99c; transition: transform .15s; }
#dl .tab:hover { transform: translateY(-2px); }
#dl .tab.on { background: var(--wc, #ffb36b); color: #fff; box-shadow: 0 3px 0 #0002; }
#dl .body { flex: 1; overflow-y: auto; padding: 6px 22px 22px; }
#dl .body::-webkit-scrollbar { width: 10px } #dl .body::-webkit-scrollbar-thumb { background: #ecd6ae; border-radius: 10px }
#dl .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 12px; }
#dl .cell { position: relative; border-radius: 22px; background: #fff; padding: 10px 6px 8px; text-align: center; box-shadow: 0 4px 0 #ecd9b4; border: 3px solid #fff; cursor: pointer; transition: transform .15s; }
#dl .cell:hover { transform: translateY(-3px) rotate(-1deg); }
#dl .cell .ico { width: 64px; height: 64px; margin: 0 auto 4px; border-radius: 50%; display: grid; place-items: center; font-size: 34px; background: radial-gradient(circle at 35% 30%, #fff, var(--cc, #ffe7c2)); box-shadow: inset 0 -4px 0 #0000000f; }
#dl .cell.miss .ico { filter: brightness(0) opacity(.22); }
#dl .cell .nm { font-size: 16px; }
#dl .cell .sm { font-size: 13px; color: #a88a66; }
#dl .cell .badge { position: absolute; top: -8px; right: -6px; background: #ff7a9a; color: #fff; font-size: 13px; padding: 1px 8px; border-radius: 999px; border: 2px solid #fff; animation: dl-wob 1.4s ease-in-out infinite; }
#dl .cell .cnt { position: absolute; top: 6px; left: 8px; font-size: 13px; color: #fff; background: #c9a37a; border-radius: 999px; padding: 0 7px; }
#dl .cell.dim { opacity: .55; }
#dl .btn { font-family: inherit; font-size: 15px; padding: 4px 12px; border-radius: 999px; border: 2px solid #fff; background: #7ccf8a; color: #fff; cursor: pointer; box-shadow: 0 3px 0 #4ea562; margin-top: 4px; }
#dl .btn.off { background: #d9cbb4; box-shadow: 0 3px 0 #bba98c; cursor: default; }
#dl .btn.gold { background: #ffbe3b; box-shadow: 0 3px 0 #d98f12; }
#dl .detail { margin-top: 14px; padding: 14px 18px; display: flex; gap: 16px; align-items: center; }
#dl .detail .ico { width: 84px; height: 84px; font-size: 46px; border-radius: 50%; display: grid; place-items: center; background: radial-gradient(circle at 35% 30%, #fff, var(--cc, #ffe7c2)); flex: none; }
#dl .req { display: flex; align-items: center; gap: 16px; padding: 14px 18px; margin-bottom: 12px; }
#dl .req .who { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; font-size: 34px; background: radial-gradient(circle at 35% 30%, #fff, #ffd9e6); flex: none; }
#dl .req .tx { flex: 1; font-size: 19px; } #dl .req .tx small { display: block; color: #a88a66; font-size: 14px; }
#dl .req.done { opacity: .6; }
#dl .bar { height: 12px; border-radius: 12px; background: #f1e2c4; overflow: hidden; margin-top: 4px; } #dl .bar i { display: block; height: 100%; background: linear-gradient(90deg, #8fdc9a, #ffd36b); border-radius: 12px; }

/* ─── 폴리시 v2 ─── */
/* 시계 아이콘: 낮 해 · 노을 · 새벽 · 밤 달 · 우주 행성 */
#dl .clock .sun { position: relative; transition: background .6s, box-shadow .6s; }
#dl .clock .sun.dusk { background: radial-gradient(circle at 50% 30%, #fff1b8, #ffb05a 45%, #ff7a8a 80%); box-shadow: 0 0 0 4px #ffe1cf, 0 0 18px #ff9a6a; }
#dl .clock .sun.dusk::after { content: ''; position: absolute; left: -4px; right: -4px; bottom: -4px; height: 45%; background: #fff6e2; border-radius: 0 0 22px 22px; border-top: 3px solid #ffb27a; }
#dl .clock .sun.dawn { background: radial-gradient(circle at 40% 35%, #fffde6, #ffd6a8 55%, #ffb3c8); box-shadow: 0 0 0 4px #ffeef2, 0 0 16px #ffc7d6; }
#dl .clock .sun.night { background: #ffeeb0; box-shadow: 0 0 0 4px #e5e2ff, 0 0 18px #b9afff; }
#dl .clock .sun.night::after { content: ''; position: absolute; width: 30px; height: 30px; border-radius: 50%; right: -5px; top: -4px; background: linear-gradient(180deg, #fffefa, #fff6e2); }
#dl .clock .sun.night::before { content: '✦'; position: absolute; left: -6px; top: -8px; font-size: 13px; color: #b9afff; }
#dl .clock .sun.planet { background: radial-gradient(circle at 35% 30%, #fff, #c9b8ff 55%, #8b74f0); box-shadow: 0 0 0 4px #ece6ff, 0 0 18px #a99bff; }
#dl .clock .sun.planet::after { content: ''; position: absolute; left: -9px; right: -9px; top: 15px; height: 8px; border-radius: 50%; border: 3px solid #ffd23f; transform: rotate(-16deg); }
#dl .clock .o2 { display: none; }
#dl .clock.space { background: linear-gradient(180deg, #4a4fa8, #2d3175); border-color: #c9c2ff; box-shadow: 0 5px 0 #1d2257, 0 12px 26px #0006; }
#dl .clock.space { padding-bottom: 20px; }
#dl .clock.space .t { color: #fff; font-size: 26px; }
#dl .clock.space .d { color: #c9c2ff; }
#dl .clock.space .o2 { display: block; position: absolute; left: 62px; right: 16px; bottom: 8px; height: 6px; border-radius: 6px; background: #ffffff26; overflow: hidden; }
#dl .clock.space .o2 i { display: block; height: 100%; background: linear-gradient(90deg, #7ef0ff, #b7ffcf); border-radius: 6px; }
#dl .map.space { background: linear-gradient(180deg, #4a4fa8, #2d3175); border-color: #c9c2ff; }

/* 지역명: 흰 글자 + 진한 외곽선 + 색 그림자 — 어떤 땅 위에서도 읽힌다 */
#dl .region .nm { font-size: 76px; color: #fff; -webkit-text-stroke: 11px var(--rs,#5a3f22); paint-order: stroke fill; letter-spacing: 6px;
  filter: drop-shadow(0 6px 0 var(--rc,#7fd18b)) drop-shadow(0 12px 18px #0005); }
#dl .region .sub { color: #fff; font-size: 26px; -webkit-text-stroke: 6px var(--rs,#5a3f22); paint-order: stroke fill; text-shadow: none; filter: drop-shadow(0 3px 0 var(--rc)); }
#dl .region .sub i { height: 4px; background: linear-gradient(90deg, transparent, var(--rc)); box-shadow: 0 0 0 1px #fff8; }

/* 잡았다: 화면 아래 1/3 — 머리 위 물고기를 가리지 않게 */
#dl .catch { top: auto; bottom: 7%; }
#dl:has(.catch.on) .keys, #dl:has(.loot.on) .keys { opacity: 0; }
#dl .keys { transition: opacity .3s; }
#dl .catch .burst { width: 440px; height: 440px; margin: -220px 0 0 -220px; opacity: .22; }
#dl .catch .box { padding: 18px 40px 14px; border-width: 4px; }
#dl .catch .nm { font-size: 44px; }

/* 토스트: 불투명 크림 + 진한 갈색 + 아이콘 */
#ui .toasts { top: 104px !important; }
#ui .toast.dl-toast { display: flex; align-items: center; gap: 10px; background: ${UI_BG} !important; color: ${UI_TEXT} !important; border: 3px solid #fff;
  padding: 7px 20px 7px 8px !important; font-size: 19px !important; border-radius: 999px !important; box-shadow: 0 4px 0 #e2c08a, 0 10px 22px #4a2f1733 !important;
  transition: opacity .3s, transform .3s; }
#ui .toast .ti { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: 19px; background: radial-gradient(circle at 35% 30%, #fff, #ffe2a8); box-shadow: inset 0 -3px 0 #f0c878; }

/* 대화창(동숲식) */
#dl .talk { position: absolute; left: 50%; bottom: 40px; width: min(820px, 88vw); min-height: 132px; transform: translateX(-50%) translateY(30px) scale(.94);
  padding: 30px 40px 26px; border-radius: 48px / 40px; border: 5px solid #fff; opacity: 0; pointer-events: none;
  background: radial-gradient(circle at 14px 14px, #ffefd4 3px, transparent 3.5px) 0 0/28px 28px, linear-gradient(#fffbef, #fff2d6);
  box-shadow: 0 7px 0 #e2c08a, 0 18px 40px #4a2f1744; transition: opacity .25s, transform .35s cubic-bezier(.3,1.6,.5,1); z-index: 6; }
#dl .talk.on { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
#dl .talk .who { position: absolute; left: 34px; top: -24px; font-size: 24px; color: #fff; background: var(--nc, #ff9cb8); padding: 4px 22px 5px; border-radius: 999px;
  border: 4px solid #fff; box-shadow: 0 4px 0 #0002; transform: rotate(-3deg); }
#dl .talk .tx { font-size: 28px; line-height: 1.45; color: ${UI_TEXT}; min-height: 42px; word-break: keep-all; }
#dl .talk .nx { position: absolute; right: 34px; bottom: 12px; font-size: 20px; color: #f0a040; animation: dl-nx .8s ease-in-out infinite; }
@keyframes dl-nx { 0%,100% { transform: translateY(0) } 50% { transform: translateY(5px) } }
#dl:has(.talk.on) .keys { opacity: 0; }

/* 창: 도감은 넓게, 탭 한 줄 고정 */
#dl .win.wide { width: min(980px, 94vw); height: min(640px, 86vh); }
#dl .tabs.dex { flex-wrap: nowrap; gap: 6px; }
#dl .tabs.dex .tab { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 5px 8px; font-size: 17px; white-space: nowrap; }
#dl .tabs.dex .tab .ti { font-size: 20px; }
#dl .tabs.dex .tab small { font-size: 13px; background: #fff9; color: #8a6b48; border-radius: 999px; padding: 0 6px; margin-left: 2px; }
#dl .tabs.dex .tab.on small { background: #fff; color: var(--wc); }
/* 스크롤: 아래 페이드 + 보이는 스크롤바 */
#dl .body { -webkit-mask: linear-gradient(#000 calc(100% - 46px), transparent); mask: linear-gradient(#000 calc(100% - 46px), transparent); padding-bottom: 46px; scrollbar-width: auto; scrollbar-color: #e9c48c #f6e7c8; }
#dl .body::-webkit-scrollbar { width: 12px } #dl .body::-webkit-scrollbar-track { background: #f6e7c8; border-radius: 10px } #dl .body::-webkit-scrollbar-thumb { background: #e9c48c; border-radius: 10px; border: 2px solid #f6e7c8 }
/* 못 잡은 칸: 종 카테고리 실루엣 + 물음표 */
#dl .cell.miss { background: #fbf2e0; box-shadow: 0 4px 0 #ecd9b4, inset 0 0 0 2px #f1e2c4; }
#dl .cell.miss .ico { filter: none; background: radial-gradient(circle at 35% 30%, #fff, #efe1c6); position: relative; }
#dl .cell.miss .ico .sil { filter: brightness(0) opacity(.28); }
#dl .cell.miss .ico b { position: absolute; right: -2px; bottom: -2px; width: 24px; height: 24px; border-radius: 50%; background: #d6c19c; color: #fff; font-weight: normal; font-size: 16px; display: grid; place-items: center; border: 2px solid #fff; }
#dl .cell.miss .nm { color: #c4ab84; }
/* 가방 빈 칸·빈 상태 */
#dl .cell.slot { min-height: 128px; background: #fff7e800; border: 3px dashed #ecd4a8; box-shadow: none; cursor: default; }
#dl .cell.slot:hover { transform: none; }
#dl .empty { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 22px; padding: 10px 0 6px; }
#dl .empty svg { animation: dl-wob 2.4s ease-in-out infinite; filter: drop-shadow(0 6px 0 #ead6ad); }
#dl .empty .e1 { font-size: 30px; color: #e38b57; }
#dl .empty .e2 { font-size: 18px; color: #a88a66; margin-top: 4px; }

/* ─── HUD v2: 칩 칸·지갑·키 안내·행동 안내·배너·카드·게이지 ─── */
/* 왼쪽 위 칩 칸(시계·가방 + 다른 모듈 칩, order 순) */
#dl .chips { position: absolute; left: 18px; top: 16px; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; max-height: calc(100vh - 260px); }
#dl .chips .clock { position: relative; left: auto; top: auto; }
#dl .chip { padding: 6px 14px 6px 8px; font-size: 17px; display: flex; align-items: center; gap: 8px; border-radius: 18px; }
#dl .chip .ci { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; background: radial-gradient(circle at 35% 30%, #fff, #ffe2a8); box-shadow: inset 0 -3px 0 #f0c878; flex: none; }
#dl .chip.bagc .bar { width: 64px; height: 8px; border-radius: 8px; background: #f1e2c4; overflow: hidden; }
#dl .chip.bagc .bar i { display: block; height: 100%; border-radius: 8px; background: linear-gradient(90deg, #8fdc9a, #ffd36b); transition: width .4s; }
#dl .chip.bagc.full .bar i { background: linear-gradient(90deg, #ff9b9b, #ff7a9a); }
#dl .chip.bagc.full { color: #d9576f; }
#dl .chip.shake { animation: dl-shake .5s ease; }
@keyframes dl-shake { 0%,100% { transform: none } 20% { transform: translateX(-6px) rotate(-3deg) } 40% { transform: translateX(6px) rotate(3deg) } 60% { transform: translateX(-4px) } 80% { transform: translateX(3px) } }
#dl .clock .d .wd { display: inline-block; background: #ffe7c2; color: #a8743a; border-radius: 8px; padding: 0 6px; margin-right: 4px; }
#dl .clock .t .wi { font-size: 22px; margin-left: 6px; vertical-align: 2px; }

/* 지갑: 열쇠 조각 알 */
#dl .pill.keyp { font-size: 18px; gap: 10px; padding: 6px 14px; }
#dl .pill.keyp .k { display: flex; align-items: center; gap: 3px; }
#dl .pill.keyp .k i { width: 9px; height: 9px; border-radius: 50%; background: #ead9b8; display: inline-block; }
#dl .pill.keyp .k i.on { background: var(--kc); box-shadow: 0 0 0 2px #fff; }
#dl .pill.keyp .k b { font-weight: normal; }
#dl .pill .v { min-width: 1ch; display: inline-block; }
#dl .pill.bump .v { animation: dl-coin .45s ease; }

/* 키 안내(hint 단축키) */
#dl .keys .key.cap-only { padding-right: 6px; }

/* 행동 안내 칩(E·F) — 코어 프롬프트 대신 */
#ui .prompt { display: none !important; }
#dl .prompts { position: absolute; left: 50%; bottom: 14%; transform: translateX(-50%); display: flex; gap: 12px; align-items: center; }
#dl .pchip { display: flex; align-items: center; gap: 8px; padding: 6px 20px 6px 8px; font-size: 20px; border-radius: 999px; white-space: nowrap; animation: dl-bob2 1.6s ease-in-out infinite; }
#dl .pchip b { display: inline-grid; place-items: center; min-width: 34px; height: 34px; padding: 0 8px; border-radius: 12px; background: #7ccf8a; color: #fff; font-weight: normal; box-shadow: 0 3px 0 #4ea562; border: 2px solid #fff; }
#dl .pchip.alt { font-size: 17px; opacity: .95; }
#dl .pchip.alt b { background: #ffbe3b; box-shadow: 0 3px 0 #d98f12; min-width: 30px; height: 30px; }
@keyframes dl-bob2 { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }

/* 배너(가운데 위 리본) */
#dl .banner { position: absolute; left: 50%; top: 15%; transform: translateX(-50%) scale(.8); opacity: 0; transition: opacity .3s, transform .4s cubic-bezier(.3,1.6,.5,1); text-align: center; white-space: nowrap; z-index: 4; }
#dl .banner.on { opacity: 1; transform: translateX(-50%) scale(1); }
#dl .banner .bt { display: inline-flex; align-items: center; gap: 10px; font-size: 34px; color: #fff; background: var(--bc, #ffb36b); padding: 8px 30px; border-radius: 999px; border: 4px solid #fff; box-shadow: 0 5px 0 #0002, 0 12px 26px #4a3b2a33; }
#dl .banner .bs { margin-top: 8px; font-size: 19px; display: inline-block; padding: 4px 16px; border-radius: 999px; background: ${UI_BG}; color: ${UI_TEXT}; box-shadow: 0 3px 0 #ead6ad; }

/* 카드(오른쪽, 지갑 아래 — 해금·업적 알림) */
#dl .card { position: absolute; right: 18px; top: 84px; width: 300px; padding: 14px 16px 14px 14px; display: flex; gap: 12px; align-items: center; z-index: 7;
  transform: translateX(120%); opacity: 0; transition: transform .45s cubic-bezier(.3,1.5,.5,1), opacity .3s; }
#dl .card.on { transform: none; opacity: 1; }
#dl .card .ci { width: 56px; height: 56px; border-radius: 50%; flex: none; display: grid; place-items: center; font-size: 30px; background: radial-gradient(circle at 35% 30%, #fff, var(--cc, #ffe2a8)); box-shadow: inset 0 -4px 0 #0000001a, 0 0 0 3px #fff; animation: dl-stamp2 .5s .15s both cubic-bezier(.3,1.8,.5,1); }
#dl .card .ct { font-size: 15px; color: #fff; background: var(--cc, #ffb36b); display: inline-block; padding: 1px 12px; border-radius: 999px; border: 2px solid #fff; }
#dl .card .cb { font-size: 20px; margin-top: 3px; line-height: 1.25; word-break: keep-all; }
@keyframes dl-stamp2 { 0% { transform: scale(2) rotate(-30deg); opacity: 0 } 100% { transform: none; opacity: 1 } }

/* 게이지(오른쪽 아래, 지도 위) + 콤보 */
#dl .gauges { position: absolute; right: 18px; bottom: 238px; width: 196px; display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
#dl .gauge { padding: 5px 12px 7px; border-radius: 16px; font-size: 14px; }
#dl .gauge .gl { display: flex; justify-content: space-between; }
#dl .gauge .gl small { color: #a88a66; font-size: 13px; }
#dl .gauge .gb { height: 9px; border-radius: 9px; background: #f1e2c4; overflow: hidden; margin-top: 3px; }
#dl .gauge .gb i { display: block; height: 100%; border-radius: 9px; background: var(--gc, #ff9fb8); transition: width .5s; }
#dl .gauge.hot .gb i { animation: dl-hot .9s ease-in-out infinite; }
@keyframes dl-hot { 0%,100% { filter: none } 50% { filter: brightness(1.25) saturate(1.3); box-shadow: 0 0 10px #ff9fb8 } }
#dl .combo { align-self: flex-end; font-size: 26px; color: #fff; -webkit-text-stroke: 6px #ff7a9a; paint-order: stroke fill; display: none; animation: dl-pop .3s cubic-bezier(.3,1.8,.5,1); }
#dl .combo.on { display: block; }

/* 창: 탭 많을 땐 촘촘 + 꼬리표 */
#dl .win { z-index: 8; }
#dl .tabs.compact { flex-wrap: nowrap; gap: 6px; }
#dl .tabs.compact .tab { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 5px 8px; font-size: 16px; white-space: nowrap; }
#dl .tab .ti { margin-right: 3px; }
#dl .tab small { font-size: 13px; background: #fff9; color: #8a6b48; border-radius: 999px; padding: 0 6px; margin-left: 4px; }
#dl .tab.on small { background: #fff; color: var(--wc); }
#dl .sec { grid-column: 1 / -1; font-size: 18px; color: #a8743a; margin: 6px 2px -2px; display: flex; align-items: center; gap: 8px; }
#dl .sec::after { content: ''; flex: 1; height: 3px; border-radius: 3px; background: repeating-linear-gradient(90deg, #ecd4a8 0 8px, transparent 8px 14px); }
#dl .note { font-size: 18px; color: #a88a66; padding: 8px 2px; }
#dl .hint { margin: 0 0 12px; padding: 12px 16px; display: flex; gap: 14px; align-items: center; font-size: 18px; }
#dl .hint .ico { width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center; font-size: 30px; background: radial-gradient(circle at 35% 30%, #fff, var(--cc, #ffd9e6)); flex: none; }
#dl .hint .grow { flex: 1; }
#dl .hint small { display: block; color: #a88a66; font-size: 14px; }
#dl .cell .own { position: absolute; top: -8px; left: -6px; background: #7ccf8a; color: #fff; font-size: 13px; padding: 1px 8px; border-radius: 999px; border: 2px solid #fff; }
#dl .cell .why { font-size: 12px; color: #d77a7a; margin-top: 2px; line-height: 1.2; }
#dl .cell .vt { position: absolute; bottom: 52px; right: 10px; font-size: 16px; }
#dl .belt { display: flex; gap: 8px; align-items: center; margin: 0 0 12px; padding: 8px 14px; border-radius: 18px; font-size: 16px; }
#dl .belt .bi { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; font-size: 24px; background: radial-gradient(circle at 35% 30%, #fff, #cfe8ff); box-shadow: inset 0 -3px 0 #0000000f; }
#dl .belt .bi.e { background: none; border: 3px dashed #ecd4a8; box-shadow: none; }
/* 도감: 섬 필터·% 바·칸 별 */
#dl .filters { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }
#dl .filters .f { font-family: inherit; font-size: 14px; padding: 3px 12px; border-radius: 999px; border: 2px solid #fff; background: #f6e7c8; color: #8a6b48; cursor: pointer; box-shadow: 0 2px 0 #e2c99c; }
#dl .filters .f.on { background: var(--fc, var(--wc)); color: #fff; }
#dl .prog { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; font-size: 16px; color: #8a6b48; }
#dl .prog .bar { flex: 1; margin: 0; height: 14px; }
#dl .prog .crown { font-size: 22px; animation: dl-wob 1.4s ease-in-out infinite; }
#dl .cell .star { position: absolute; top: 4px; right: 8px; font-size: 16px; -webkit-text-stroke: 1px #fff; paint-order: stroke fill; }
#dl .cell .star.silver { color: #b8c4d6; } #dl .cell .star.gold { color: #ffcf4a; }
#dl .cell .rb { position: absolute; top: 4px; left: 8px; font-size: 14px; background: linear-gradient(90deg, #ff9fb8, #ffd23f, #8fdc9a, #7cc8ff, #c59bff); -webkit-background-clip: text; background-clip: text; color: transparent; }
#dl .detail .facts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
#dl .detail .facts span { font-size: 14px; background: #fff; border-radius: 999px; padding: 1px 10px; box-shadow: 0 2px 0 #ecd9b4; }
#dl .wings { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin: 0 0 12px; }
#dl .wings .wg { padding: 8px 12px; border-radius: 16px; font-size: 15px; }

/* HUD 숨기기(백틱 키 · flags.ui.hudHidden): 창·대화·잡았다는 그대로 */
#dl.hidden .chips, #dl.hidden .wallet, #dl.hidden .map, #dl.hidden .keys, #dl.hidden .gauges, #dl.hidden .card { opacity: 0 !important; pointer-events: none; }
#dl .chips, #dl .wallet, #dl .map, #dl .gauges { transition: opacity .3s; }
`;
