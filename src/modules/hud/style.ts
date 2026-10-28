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

/* 지갑(칩 'hud:wallet' 안 — 떠오르거나 주머니 무지개에서만 보인다) */
#dl .wallet { display: flex; gap: 8px; }
#dl .pill { display: flex; align-items: center; gap: 8px; padding: 6px 16px 6px 8px; font-size: 22px; }
#dl .pill .ic { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; color: #fff; }
#dl .pill .ic.coin { background: radial-gradient(circle at 35% 30%, #fff3a0, #ffcd3c 55%, #f0a020); box-shadow: inset 0 -3px 0 #d98a12, 0 0 0 3px #fff2c0; color: #b06a00; font-size: 16px; }
#dl .pill .ic.star { background: radial-gradient(circle at 35% 30%, #fff, #c9b8ff 60%, #9d86ff); box-shadow: inset 0 -3px 0 #7d66e0, 0 0 0 3px #ece6ff; }
#dl .pill.bump .ic { animation: dl-coin .5s ease; }

/* 우하단: 미니맵 */
#dl .map { position: absolute; right: 18px; bottom: 18px; width: 196px; height: 196px; border-radius: 50%; padding: 6px; }
#dl .map canvas { width: 100%; height: 100%; border-radius: 50%; display: block; }
#dl .map .n { position: absolute; left: 50%; top: -6px; transform: translateX(-50%); background: #ff8f8f; color: #fff; border-radius: 999px; padding: 0 9px; font-size: 15px; box-shadow: 0 3px 0 #db6a6a; border: 2px solid #fff; }
#dl .map .lbl { position: absolute; left: 50%; bottom: -12px; transform: translateX(-50%); white-space: nowrap; font-size: 14px; padding: 2px 12px; border-radius: 999px; background: #fff; box-shadow: 0 3px 0 #ead6ad; }

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
#dl .win.on { display: flex; animation: dl-win .4s cubic-bezier(.3,1.5,.5,1); }
/* 창은 가운데 정렬 transform 을 품은 채로 튀어나온다(dl-in 을 쓰면 여는 동안 오른쪽 아래로 밀려 보인다) */
@keyframes dl-win { 0% { transform: translate(-50%, -50%) translateY(18px) scale(.9); opacity: 0 } 100% { transform: translate(-50%, -50%); opacity: 1 } }
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
#dl .map.space { background: linear-gradient(180deg, #4a4fa8, #2d3175); border-color: #c9c2ff; }

/* 지역명: 흰 글자 + 진한 외곽선 + 색 그림자 — 어떤 땅 위에서도 읽힌다 */
#dl .region .nm { font-size: 76px; color: #fff; -webkit-text-stroke: 11px var(--rs,#5a3f22); paint-order: stroke fill; letter-spacing: 6px;
  filter: drop-shadow(0 6px 0 var(--rc,#7fd18b)) drop-shadow(0 12px 18px #0005); }
#dl .region .sub { color: #fff; font-size: 26px; -webkit-text-stroke: 6px var(--rs,#5a3f22); paint-order: stroke fill; text-shadow: none; filter: drop-shadow(0 3px 0 var(--rc)); }
#dl .region .sub i { height: 4px; background: linear-gradient(90deg, transparent, var(--rc)); box-shadow: 0 0 0 1px #fff8; }

/* 잡았다: 화면 아래 1/3 — 머리 위 물고기를 가리지 않게 */
#dl .catch { top: auto; bottom: 7%; }
#dl .catch .burst { width: 440px; height: 440px; margin: -220px 0 0 -220px; opacity: .22; }
#dl .catch .box { padding: 18px 40px 14px; border-width: 4px; }
#dl .catch .nm { font-size: 44px; }

/* 토스트: 불투명 크림 + 진한 갈색 + 아이콘 */
#ui .toasts { top: 104px !important; }
#ui .toast.dl-toast { display: flex; align-items: center; gap: 10px; background: ${UI_BG} !important; color: ${UI_TEXT} !important; border: 3px solid #fff;
  padding: 7px 20px 7px 8px !important; font-size: 19px !important; border-radius: 999px !important; box-shadow: 0 4px 0 #e2c08a, 0 10px 22px #4a2f1733 !important;
  transition: opacity .3s, transform .3s; max-width: min(760px, calc(100vw - 32px)); box-sizing: border-box; }
/* 토스트는 한 줄 — 넘치면 … (전체 글은 title) */
#ui .toast.dl-toast .tt { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#ui .toast .ti { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: 19px; background: radial-gradient(circle at 35% 30%, #fff, #ffe2a8); box-shadow: inset 0 -3px 0 #f0c878; flex-shrink: 0; }

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
#dl .chip { padding: 6px 14px 6px 8px; font-size: 17px; display: flex; align-items: center; gap: 8px; border-radius: 18px; }
#dl .chip .ci { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; background: radial-gradient(circle at 35% 30%, #fff, #ffe2a8); box-shadow: inset 0 -3px 0 #f0c878; flex: none; }
#dl .chip.bagc .bar { width: 64px; height: 8px; border-radius: 8px; background: #f1e2c4; overflow: hidden; }
#dl .chip.bagc .bar i { display: block; height: 100%; border-radius: 8px; background: linear-gradient(90deg, #8fdc9a, #ffd36b); transition: width .4s; }
#dl .chip.bagc.full .bar i { background: linear-gradient(90deg, #ff9b9b, #ff7a9a); }
#dl .chip.bagc.full { color: #d9576f; }
#dl .chip.shake { animation: dl-shake .5s ease; }
@keyframes dl-shake { 0%,100% { transform: none } 20% { transform: translateX(-6px) rotate(-3deg) } 40% { transform: translateX(6px) rotate(3deg) } 60% { transform: translateX(-4px) } 80% { transform: translateX(3px) } }

/* 지갑: 열쇠 조각 알 */
#dl .pill.keyp { font-size: 18px; gap: 10px; padding: 6px 14px; }
#dl .pill.keyp .k { display: flex; align-items: center; gap: 3px; }
#dl .pill.keyp .k i { width: 9px; height: 9px; border-radius: 50%; background: #ead9b8; display: inline-block; }
#dl .pill.keyp .k i.on { background: var(--kc); box-shadow: 0 0 0 2px #fff; }
#dl .pill.keyp .k b { font-weight: normal; }
#dl .pill .v { min-width: 1ch; display: inline-block; }
#dl .pill.bump .v { animation: dl-coin .45s ease; }


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

/* ── wave 3B: 썸네일 · 도감 칸 상태 · 섬 칩 · 가방 머리 · 다 팔기 · 뚝딱 · 전시관 · 큰 지도 ── */
#dl .cell .ico img.th, #dl .detail .ico img.th, #dl .hint .ico img.th { width: 92%; height: 92%; object-fit: contain; filter: drop-shadow(0 3px 0 #0000001a); }
#dl img.th.pop { animation: dl-pop .3s cubic-bezier(.3,1.6,.5,1); }
#dl .th-wait { display: contents; }
#dl .cell.miss .ico img.sil-img { width: 100%; height: 100%; border-radius: 50%; }
#dl .cell .ms { font-size: 11px; color: #c59bff; letter-spacing: 1px; margin-top: 1px; -webkit-text-stroke: .5px #fff; }
#dl .cell .fp { font-size: 12px; color: #b5895a; margin-top: 2px; }
#dl .cell .star i { font-style: normal; font-size: 11px; position: absolute; top: -9px; right: -4px; }
#dl .cell.silver { box-shadow: 0 4px 0 #d9e0ea, inset 0 0 0 2px #e8edf4; }
#dl .cell.gold { background: linear-gradient(#fffdf2, #fff3c9); box-shadow: 0 4px 0 #f0d27a, inset 0 0 0 2px #ffe8a3; }
#dl .cell.rumor { background: #fbf6ec; border: 3px dashed #eedcbc; box-shadow: none; cursor: default; opacity: .7; }
#dl .cell.rumor:hover { transform: none; }
#dl .cell.rumor .ico { background: #f3e8d2; color: #d9c4a0; font-size: 26px; }
#dl .cell.rumor .nm { color: #cdb48c; font-size: 14px; }
#dl .badge.don { background: #c59bff; animation: none; }
#dl .badge.hotb { background: #ff6f8e; }
#dl .badge.keep { background: #8fb7d9; animation: none; }
#dl .cell.hot { box-shadow: 0 4px 0 #ffc0cf, 0 0 0 3px #ffd9e3; }
#dl .detail.miss .ico { background: #efe1c6; }
#dl .detail .ico.big img.sil-img { width: 100%; height: 100%; border-radius: 50%; }
#dl .detail .ico.big { width: 96px; height: 96px; }
#dl .filters .f small { font-size: 12px; opacity: .8; margin-left: 2px; }
#dl .filters .f { position: relative; }
#dl .filters .f.crowned { box-shadow: 0 2px 0 #e2c99c, 0 0 0 2px #ffe08a; }
#dl .filters .f .cw { font-style: normal; position: absolute; top: -11px; right: -6px; font-size: 14px; animation: dl-wob 1.4s ease-in-out infinite; }
#dl .prog .pl { min-width: 150px; }
#dl .prog b { font-weight: normal; min-width: 42px; text-align: right; }
#dl .bar.full i { background: linear-gradient(90deg, #ffd23f, #ffb36b, #ff9fb8); }
#dl { --isl-home: #7fd18b; --isl-dino: #9fcf5a; --isl-ice: #6cc3ef; --isl-mushroom: #ff9ccf; --isl-coral: #ff9f8a; --isl-desert: #f0b45a; --isl-launch: #a99bff; --isl-islet: #f0c040; }
#dl .baghead { display: flex; gap: 10px; align-items: stretch; margin: 0 0 12px; flex-wrap: wrap; }
#dl .baghead .belt { margin: 0; flex: 1 1 auto; }
#dl .baghead .cap { flex: 0 1 260px; padding: 8px 14px; border-radius: 18px; font-size: 16px; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
#dl .baghead .cap .bar { margin: 0; }
#dl .baghead .cap small { color: #a88a66; font-size: 13px; }
#dl .baghead .cap.full .bar i { background: linear-gradient(90deg, #ff9b9b, #ff7a9a); }
#dl .baghead .cap.full small { color: #e0667f; }
#dl .hint .acts, #dl .acts { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
#dl .btn.big { font-size: 18px; padding: 6px 16px; }
#dl .cell .pr { color: #b5761f; } #dl .cell .pr.no { color: #c9b08a; }
#dl .btn .cp { white-space: nowrap; } #dl .btn .cp + .cp::before { content: ' · '; opacity: .7; }
#dl .btn .cp.stars { color: #fff6b0; text-shadow: 0 0 6px #fff3; }
#dl .btn .cp.lack { color: #ffd3d3; text-decoration: line-through 1px; }
#dl .needs { display: flex; flex-direction: column; gap: 3px; margin: 6px 0; align-items: stretch; }
#dl .need { font-size: 13px; border-radius: 999px; padding: 1px 8px; display: flex; justify-content: space-between; gap: 6px; }
#dl .need b { font-weight: normal; }
#dl .need.ok { background: #e3f6da; color: #4f9a5a; } #dl .need.lack { background: #fde4e4; color: #d16b6b; }
#dl .ttak { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); z-index: 3; pointer-events: none; display: grid; place-items: center; }
#dl .ttak::before { content: ''; position: absolute; inset: -40px -70px; border-radius: 50%; background: radial-gradient(closest-side, #fffaf0f2, #fffaf0aa 60%, #fffaf000); z-index: -1; animation: dl-pop .3s cubic-bezier(.3,1.6,.5,1); }
#dl .ttak .hm { font-size: 76px; transform-origin: 80% 80%; animation: dl-bonk .5s ease-in-out 2; }
#dl .ttak b { font-weight: normal; font-size: 64px; color: #fff; -webkit-text-stroke: 10px #6fbf5a; paint-order: stroke fill; margin-top: -18px; animation: dl-stamp .4s cubic-bezier(.3,1.8,.5,1) .5s both; }
#dl .ttak .gv { font-size: 54px; animation: dl-pop .4s cubic-bezier(.3,1.6,.5,1) .75s both; filter: drop-shadow(0 4px 0 #0002); }
#dl .ttak.out { opacity: 0; transition: opacity .3s; }
@keyframes dl-bonk { 0% { transform: rotate(0) } 45% { transform: rotate(-50deg) } 70% { transform: rotate(12deg) } 100% { transform: rotate(0) } }
@keyframes dl-stamp { 0% { transform: scale(2.4) rotate(-10deg); opacity: 0 } 100% { transform: scale(1) rotate(-6deg); opacity: 1 } }
#dl .wingh .bar { margin-top: 6px; height: 14px; }
#dl .mst { position: relative; height: 40px; margin: 4px 16px 0 6px; }
#dl .mst .m { position: absolute; top: 0; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; font-size: 11px; color: #b49a78; line-height: 1.1; }
#dl .mst .m i { font-style: normal; font-size: 16px; filter: grayscale(1) opacity(.5); }
#dl .mst .m.on i { filter: none; } #dl .mst .m.on { color: #9d6bff; }
#dl .mst .m.next i { filter: none; animation: dl-wob 1.2s ease-in-out infinite; }
#dl .mst .m .st { color: #c9a34a; }
#dl .locked { padding: 16px 18px; border-radius: 18px; font-size: 18px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
#dl .skels { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin: 8px 0 14px; }
#dl .sk { padding: 10px 14px; border-radius: 18px; font-size: 15px; }
#dl .sk.done { background: linear-gradient(#fffdf2, #fff1c4); }
#dl .sk .skn { font-size: 17px; margin-bottom: 4px; }
#dl .sk .parts { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 2px; }
#dl .sk .pt { font-size: 13px; padding: 1px 8px; border-radius: 999px; background: #f3e8d2; color: #b49a78; }
#dl .sk .pt.have { background: #fff1c4; color: #b5761f; } #dl .sk .pt.on { background: #e9c48f; color: #fff; }
#dl .sk small { color: #a88a66; }
#dl .maplay { display: flex; gap: 14px; height: 100%; min-height: 470px; }
#dl .maplay .mwrap { flex: 1 1 auto; position: relative; border-radius: 22px; padding: 6px; display: flex; flex-direction: column; min-width: 0; }
#dl .maplay canvas.bigmap { flex: 1; width: 100%; min-height: 420px; border-radius: 18px; display: block; }
#dl .maplay .legend { display: flex; gap: 12px; justify-content: center; font-size: 13px; color: #8a6b48; padding: 6px 0 0; flex-wrap: wrap; }
#dl .mside { flex: 0 0 230px; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
#dl .mrow { font-family: inherit; display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-radius: 14px; border: 2px solid #fff; background: #fff; color: #4a3b2a; font-size: 16px; cursor: pointer; box-shadow: 0 2px 0 #ecd9b4; text-align: left; }
#dl .mrow i { width: 14px; height: 14px; border-radius: 50%; flex: none; box-shadow: inset 0 -2px 0 #0002; }
#dl .mrow .mn { flex: 1; } #dl .mrow small { font-size: 12px; color: #a88a66; }
#dl .mrow.fog { background: #f2f6f9; color: #8aa0b8; }
#dl .mrow.on { box-shadow: 0 2px 0 #ffb3c3, 0 0 0 3px #ff9fb8; }
#dl .msel { padding: 10px 12px; border-radius: 18px; }
#dl .msel .mt { font-size: 20px; } #dl .msel .ms2 { font-size: 13px; color: #a88a66; margin: 2px 0 4px; }
#dl .islets { display: flex; flex-wrap: wrap; gap: 4px; font-size: 20px; }
#dl .islets .ib { opacity: .45; } #dl .islets .ib.on { opacity: 1; }
#dl .mside .sec { margin: 6px 2px 0; font-size: 16px; }

/* HUD 숨기기(\ 키 · flags.ui.hudHidden): 창·대화·잡았다는 그대로 */
#dl.hidden .clockslot, #dl.hidden .peeks, #dl.hidden .map, #dl.hidden .gauges, #dl.hidden .card, #dl.hidden .hintb { opacity: 0 !important; pointer-events: none; }
#dl .clockslot, #dl .map, #dl .gauges { transition: opacity .3s; }

/* ════════════ wave 7 — 비어 있는 화면 · 말랑 주머니 · 떠오르는 방울 · 반짝이 ════════════ */
/* 놀기 전엔 투명 → 'game:start' 뒤 0.6초 스르르 */
#dl.prestart { opacity: 0 !important; visibility: hidden; }
#dl.wake { animation: dl-wake .6s ease-out both; }
#dl.wake .clockslot { animation: dl-wake-pop .7s .1s cubic-bezier(.3,1.7,.5,1) both; }
@keyframes dl-wake { 0% { opacity: 0 } 100% { opacity: 1 } }
@keyframes dl-wake-pop { 0% { transform: scale(.3) translateY(-10px); opacity: 0 } 100% { transform: none; opacity: 1 } }

/* 해/달 시계 방울(왼쪽 위 · 늘 있음 · 창이 열리면 숨는다) */
#dl .clockslot { position: absolute; left: 16px; top: 14px; transition: opacity .35s, transform .35s; }
#dl.panel .clockslot { opacity: 0; transform: translateY(-10px) scale(.9); }
#dl .clock { position: relative; display: flex; align-items: center; gap: 8px; padding: 4px 14px 4px 4px; border-radius: 999px; background: #fffaf0d0; border: 2.5px solid #fff;
  box-shadow: 0 3px 0 #ead6ad99, 0 6px 16px #6b4a2b1c; transform-origin: 24px 50%; animation: dl-jelly 6s ease-in-out infinite; }
@keyframes dl-jelly { 0%,100% { transform: scale(1) } 22% { transform: scale(1.025, .975) } 48% { transform: scale(.985, 1.02) } 74% { transform: scale(1.012, .99) } }
#dl .clock .orb { position: relative; width: 34px; height: 34px; border-radius: 50%; flex: none; transition: background .8s, box-shadow .8s;
  background: radial-gradient(circle at 35% 32%, #fffbe0, #ffd34a 58%, #ffa63a); box-shadow: 0 0 0 3px #fff3c8, 0 0 14px #ffcf5a; }
#dl .clock .orb .ray { position: absolute; inset: -7px; border-radius: 50%; z-index: -1; background: repeating-conic-gradient(#ffe27a 0 12deg, transparent 12deg 30deg);
  -webkit-mask: radial-gradient(circle, transparent 52%, #000 54%, #000 70%, transparent 72%); mask: radial-gradient(circle, transparent 52%, #000 54%, #000 70%, transparent 72%); animation: dl-spin 14s linear infinite; }
#dl .clock .orb.dawn { background: radial-gradient(circle at 40% 35%, #fffde6, #ffd6a8 55%, #ffb3c8); box-shadow: 0 0 0 3px #ffeef2, 0 0 12px #ffc7d6; }
#dl .clock .orb.dusk { background: radial-gradient(circle at 50% 30%, #fff1b8, #ffb05a 45%, #ff7a8a 85%); box-shadow: 0 0 0 3px #ffe1cf, 0 0 14px #ff9a6a; }
#dl .clock .orb.dusk .ray { opacity: .55; }
#dl .clock .orb.night { background: #fff0b8; box-shadow: 0 0 0 3px #e5e2ff, 0 0 14px #b9afff; overflow: visible; }
#dl .clock .orb.night .ray { display: none; }
#dl .clock .orb.night::after { content: ''; position: absolute; width: 27px; height: 27px; border-radius: 50%; right: -4px; top: -3px; background: #fffaf0; }
#dl .clock .orb.night::before { content: '✦'; position: absolute; left: -7px; top: -9px; font-size: 12px; color: #b9afff; animation: dl-wob 2.4s ease-in-out infinite; }
#dl .clock .orb.planet { background: radial-gradient(circle at 35% 30%, #fff, #c9b8ff 55%, #8b74f0); box-shadow: 0 0 0 3px #ece6ff, 0 0 14px #a99bff; }
#dl .clock .orb.planet .ray { display: none; }
#dl .clock .orb.planet::after { content: ''; position: absolute; left: -8px; right: -8px; top: 13px; height: 7px; border-radius: 50%; border: 2.5px solid #ffd23f; transform: rotate(-16deg); }
#dl .clock .t { font-size: 20px; line-height: 1; letter-spacing: .5px; }
#dl .clock .t .wi { font-size: 15px; margin-left: 5px; vertical-align: 1px; }
#dl .clock .d { font-size: 12px; color: #a88a66; margin-top: 2px; }
#dl .clock .d .wd { display: inline-block; background: #ffe7c2; color: #a8743a; border-radius: 7px; padding: 0 5px; margin-right: 4px; }
#dl .clock .o2 { display: none; }
#dl .clock.space { background: linear-gradient(180deg, #4a4fa8e6, #2d3175e6); border-color: #c9c2ff; box-shadow: 0 3px 0 #1d2257, 0 8px 18px #0005; padding-bottom: 12px; }
#dl .clock.space .t { color: #fff; } #dl .clock.space .d { color: #c9c2ff; }
#dl .clock.space .o2 { display: block; position: absolute; left: 44px; right: 14px; bottom: 5px; height: 5px; border-radius: 5px; background: #ffffff26; overflow: hidden; }
#dl .clock.space .o2 i { display: block; height: 100%; background: linear-gradient(90deg, #7ef0ff, #b7ffcf); border-radius: 5px; }

/* 숨은 칩 보관함(내용은 계속 갱신된다) */
#dl .chipstore { position: absolute; left: -10000px; top: 0; visibility: hidden; pointer-events: none; }
/* 떠오른 칩 방울(시계 아래, 새 것이 위) */
#dl .peeks { position: absolute; left: 16px; top: 62px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
#dl.panel .peeks { opacity: 0; }
#dl .pk { position: relative; pointer-events: auto; transform-origin: 18% 50%; filter: drop-shadow(0 6px 10px #6b4a2b26); }
#dl .pk::after { content: ''; position: absolute; left: 14px; top: 5px; width: 22px; height: 7px; border-radius: 50%; background: #ffffffb8; transform: rotate(-12deg); pointer-events: none; }
#dl .pk .chip, #dl .pk .pill { border-radius: 999px; }
#dl .pk.out { pointer-events: none; }
/* 떠오르는 숫자 방울(+120 ₩) */
#dl .fpop { position: absolute; z-index: 5; pointer-events: none; white-space: nowrap; font-size: 20px; color: var(--fd); padding: 2px 13px 3px; border-radius: 999px; border: 3px solid #fff;
  background: radial-gradient(circle at 30% 25%, #fff 0 18%, var(--fc) 70%); box-shadow: 0 4px 0 #0000001a, 0 8px 16px #4a2f1726; }

/* 게이지: 필요할 때만, 다 차면 스르르 · 상황 칩(바람) */
#dl .gauges { bottom: 238px; transition: bottom .4s; }
#dl.nomap .gauges { bottom: 22px; }
#dl .gauge { opacity: 0; transform: translateY(8px) scale(.94); transition: opacity .6s, transform .5s cubic-bezier(.3,1.5,.5,1); }
#dl .gauge.on { opacity: 1; transform: none; }
#dl .gauges .lives { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
#dl .gauges .lives:empty { display: none; }
#dl .combo { transition: opacity .5s; }
#dl .map.off { display: none; }
#dl .card { top: 16px; }

/* 토스트: 늘 한 줄 — 새 줄이 앞 줄을 바꿔 친다 */
#ui .toasts { top: 18px !important; }
#ui .toast.dl-toast.gone { position: absolute; left: 50%; top: 0; opacity: 0 !important; transform: translate(-50%, -12px) scale(.95) !important; white-space: nowrap; }

/* ─── 말랑 주머니(Tab) ─── */
#dl .pocket { position: absolute; inset: 0; z-index: 7; pointer-events: none; opacity: 0; visibility: hidden; transition: opacity .22s, visibility 0s .25s; --cx: 50vw; --cy: 55vh; --r: 200px; --s: 1; }
#dl .pocket.on { pointer-events: auto; opacity: 1; visibility: visible; transition: opacity .22s; }
#dl .pocket .veil { position: absolute; inset: 0; background: radial-gradient(circle at var(--cx) var(--cy), #fff0 0, #fff0 110px, #5a3a6a1f 240px, #3a2550 130%);
  -webkit-backdrop-filter: blur(4px) saturate(1.08); backdrop-filter: blur(4px) saturate(1.08);
  -webkit-mask: radial-gradient(circle at var(--cx) var(--cy), transparent 0 100px, #000 280px); mask: radial-gradient(circle at var(--cx) var(--cy), transparent 0 100px, #000 280px); }
#dl .pocket .ring::before { content: ''; position: absolute; left: var(--cx); top: var(--cy); width: calc(var(--r) * 2); height: calc(var(--r) * 2); transform: translate(-50%, -50%);
  border-radius: 50%; border: 3px dashed #ffffffa0; box-shadow: 0 0 0 10px #ffffff18, inset 0 0 40px #ffe7f366; animation: pk-spin 40s linear infinite; pointer-events: none; }
#dl .pocket.on .ring::before { animation: pk-ring .5s cubic-bezier(.3,1.5,.5,1) both, pk-spin 40s linear .5s infinite; }
@keyframes pk-ring { 0% { transform: translate(-50%, -50%) scale(.2); opacity: 0 } 100% { transform: translate(-50%, -50%) scale(1); opacity: 1 } }
/* 빙글 돌 때도 가운데 맞춤(translate)을 잃지 않게 — dl-spin 은 transform 을 통째로 바꾼다 */
@keyframes pk-spin { from { transform: translate(-50%, -50%) rotate(0deg) } to { transform: translate(-50%, -50%) rotate(360deg) } }
#dl .pb { position: absolute; width: calc(86px * var(--s)); height: calc(86px * var(--s)); margin: calc(-43px * var(--s)) 0 0 calc(-43px * var(--s)); padding: 0; border: 0; background: none;
  font-family: inherit; color: ${UI_TEXT}; cursor: pointer; outline: none; }
#dl .pocket.on .pb { animation: pk-out .6s var(--d) both cubic-bezier(.3,1.55,.45,1); }
@keyframes pk-out { 0% { transform: translate(var(--ox), var(--oy)) scale(.12); opacity: 0 } 45% { opacity: 1 } 100% { transform: none; opacity: 1 } }
#dl .pb .jelly { position: absolute; inset: 0; border-radius: 50%; display: grid; place-items: center; border: 3px solid #fff; transition: scale .3s cubic-bezier(.3,1.6,.5,1), box-shadow .3s;
  background: radial-gradient(circle at 34% 28%, #fff 0 10%, color-mix(in srgb, var(--c) 32%, #fff) 36%, var(--c) 80%, color-mix(in srgb, var(--c) 78%, #7a5a8a) 100%);
  box-shadow: inset 0 -7px 0 #0000001a, inset 0 5px 12px #ffffffaa, 0 6px 0 color-mix(in srgb, var(--c) 62%, #a07850), 0 12px 22px #3a25402e;
  animation: pk-idle 3.4s ease-in-out infinite; animation-delay: var(--ph); }
@keyframes pk-idle { 0%,100% { transform: none; border-radius: 50% } 30% { transform: scale(1.035, .965) translateY(1px); border-radius: 53% 47% 50% 50% / 47% 53% 47% 53% } 62% { transform: scale(.975, 1.03) translateY(-2px); border-radius: 48% 52% 51% 49% / 52% 48% 52% 48% } }
#dl .pb .ic { font-size: calc(36px * var(--s)); line-height: 1; filter: drop-shadow(0 2px 0 #0000001f); }
#dl .pb .shine { position: absolute; left: 17%; top: 11%; width: 30%; height: 19%; border-radius: 50%; background: #ffffffc0; transform: rotate(-28deg); pointer-events: none; }
#dl .pb .lb { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 5px); white-space: nowrap; font-size: 15px; padding: 1px 10px 2px; border-radius: 999px; background: #fffaf0; box-shadow: 0 2px 0 #ead6ad; transition: background .2s, color .2s; }
#dl .pb .lb kbd { font-family: inherit; font-size: 11px; margin-left: 5px; padding: 0 5px; border-radius: 6px; background: #f3e4c8; color: #a88a66; }
#dl .pb .num { position: absolute; left: 0; top: 0; width: 21px; height: 21px; display: grid; place-items: center; font-style: normal; font-size: 12px; border-radius: 50%; background: #fff; color: #b69a74; box-shadow: 0 2px 0 #ead6ad; }
#dl .pb .bd { position: absolute; right: -6px; top: -6px; min-width: 26px; height: 26px; padding: 0 6px; display: none; place-items: center; font-style: normal; font-size: 14px; color: #fff;
  border-radius: 999px; background: radial-gradient(circle at 35% 30%, #ffb3c6, #ff6f91); border: 2.5px solid #fff; box-shadow: 0 0 0 0 #ff9fb880; }
#dl .pb .bd.on { display: grid; animation: pk-spark 1.8s ease-in-out infinite; }
#dl .pb .bd.on::before { content: '✦'; position: absolute; left: -9px; top: -10px; font-size: 12px; color: #ffd23f; animation: dl-wob 1.2s ease-in-out infinite; }
@keyframes pk-spark { 0%,100% { transform: scale(1); box-shadow: 0 0 0 0 #ff9fb880 } 50% { transform: scale(1.12); box-shadow: 0 0 0 6px #ff9fb800 } }
#dl .pb:hover, #dl .pb.f { z-index: 2; }
#dl .pb:hover .jelly, #dl .pb.f .jelly { scale: 1.14; animation: pk-boing .7s cubic-bezier(.3,1.5,.5,1), pk-idle 3.4s ease-in-out .7s infinite;
  box-shadow: inset 0 -7px 0 #0000001a, inset 0 5px 12px #ffffffaa, 0 6px 0 color-mix(in srgb, var(--c) 62%, #a07850), 0 0 0 6px #ffffffcc, 0 0 30px var(--c); }
#dl .pb.f .lb, #dl .pb:hover .lb { background: var(--c); color: #fff; box-shadow: 0 2px 0 #0002; }
#dl .pb.f .lb kbd, #dl .pb:hover .lb kbd { background: #fff6; color: #fff; }
@keyframes pk-boing { 0% { transform: none } 25% { transform: scale(1.18, .84) } 50% { transform: scale(.9, 1.14) } 72% { transform: scale(1.06, .96) } 100% { transform: none } }
#dl .pb.pop .jelly { animation: pk-pick .4s ease-out both; }
@keyframes pk-pick { 0% { transform: none } 40% { transform: scale(1.3); filter: brightness(1.2) } 100% { transform: scale(.2); opacity: 0 } }
#dl .pocket .cap { position: absolute; transform: translate(-50%, 0); text-align: center; pointer-events: none; padding: 5px 16px 6px; border-radius: 18px; background: #fffaf0e8;
  border: 2.5px solid #fff; box-shadow: 0 3px 0 color-mix(in srgb, var(--c, #ead6ad) 70%, #e0c89c), 0 8px 18px #3a254030; white-space: nowrap; animation: pk-cap .35s .25s both cubic-bezier(.3,1.6,.5,1); }
@keyframes pk-cap { 0% { transform: translate(-50%, 0) scale(.4); opacity: 0 } 100% { transform: translate(-50%, 0); opacity: 1 } }
#dl .pocket .cap b { display: block; font-weight: normal; font-size: 19px; }
#dl .pocket .cap small { display: block; font-size: 13px; color: #a88a66; }
#dl .pocket .cap kbd, #dl .pocket .foot kbd { font-family: inherit; font-size: 12px; padding: 0 6px; border-radius: 7px; background: #fff; border: 2px solid #e6d3ae; box-shadow: 0 2px 0 #e6d3ae; color: #8a6b48; margin: 0 1px; }
#dl .pocket .foot { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; gap: 14px; font-size: 14px; color: #fff; text-shadow: 0 1px 2px #3a2550aa; white-space: nowrap; pointer-events: none; }
#dl .pocket .arc { position: absolute; inset: 0; pointer-events: none; }
/* 주머니가 열려 있는 동안 배너·지역 이름·카드는 숨는다(줄은 그대로, 시간은 흐른다) */
#dl.pocketing .banner, #dl.pocketing .region, #dl.pocketing .card, #dl.pocketing .prompts { opacity: 0 !important; }
#dl .pocket .aw { position: absolute; transform: rotate(var(--rot, 0deg)); transform-origin: 50% 100%; pointer-events: auto; filter: drop-shadow(0 6px 10px #3a254033); }
#dl .pocket.on .aw { animation: pk-float .5s var(--d) both cubic-bezier(.3,1.5,.5,1); }
@keyframes pk-float { 0% { transform: rotate(var(--rot, 0deg)) translateY(30px) scale(.6); opacity: 0 } 100% { transform: rotate(var(--rot, 0deg)); opacity: 1 } }
#dl .pocket .aw .chip, #dl .pocket .aw .pill { border-radius: 999px; }

/* ─── 처음 안내: 별 친구 반짝이 ─── */
#dl .hintb { position: absolute; left: 0; top: 0; z-index: 6; pointer-events: none; display: none; will-change: transform; }
#dl .hintb.on { display: block; }
#dl .hintb .star { position: absolute; left: -30px; top: -30px; width: 60px; height: 60px; filter: drop-shadow(0 0 10px #ffe27acc) drop-shadow(0 4px 0 #e0a83a55); animation: hs-bob 2.2s ease-in-out infinite; }
#dl .hintb.on .star svg { animation: hs-in .55s cubic-bezier(.3,1.7,.5,1) both; }
#dl .hintb .star .shut, #dl .hintb .star .yawnm { display: none; }
#dl .hintb .star .tw { position: absolute; font-style: normal; color: #ffd23f; font-size: 14px; opacity: 0; }
#dl .hintb .star .t1 { right: -6px; top: -4px; animation: hs-tw 1.8s ease-in-out infinite; }
#dl .hintb .star .t2 { left: -8px; bottom: 6px; animation: hs-tw 1.8s .9s ease-in-out infinite; }
@keyframes hs-bob { 0%,100% { transform: translateY(0) rotate(-6deg) } 50% { transform: translateY(-7px) rotate(6deg) } }
@keyframes hs-in { 0% { transform: scale(0) rotate(-120deg) } 100% { transform: none } }
@keyframes hs-tw { 0%,100% { opacity: 0; transform: scale(.5) } 50% { opacity: 1; transform: scale(1.2) } }
#dl .hintb .say { position: absolute; left: 36px; top: -50px; width: max-content; max-width: 330px; padding: 11px 18px 11px; font-size: 18px; line-height: 1.4; border-radius: 22px;
  word-break: keep-all; transform-origin: 0 70%; animation: hs-say .45s .12s both cubic-bezier(.3,1.6,.5,1); }
#dl .hintb .say::before { content: ''; position: absolute; left: -11px; top: 30px; border: 9px solid transparent; border-right: 12px solid #fff; border-left: 0; }
#dl .hintb .say .who { position: absolute; top: -13px; left: 14px; font-size: 12px; line-height: 1.5; color: #fff; background: #ffc54a; border-radius: 999px; padding: 0 9px; border: 2px solid #fff; box-shadow: 0 2px 0 #0001; }
#dl .hintb.left .say { left: auto; right: 36px; transform-origin: 100% 70%; }
#dl .hintb.left .say::before { left: auto; right: -11px; border-right: 0; border-left: 12px solid #fff; }
@keyframes hs-say { 0% { transform: scale(.3); opacity: 0 } 100% { transform: none; opacity: 1 } }
#dl .hintb kbd { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 7px; margin: 0 3px; border-radius: 9px; background: #fff; border: 2px solid #e6d3ae;
  box-shadow: 0 3px 0 #e6d3ae; font-family: inherit; font-size: 15px; color: #8a6b48; vertical-align: 1px; animation: hs-key 1.6s ease-in-out infinite; }
@keyframes hs-key { 0%,80%,100% { transform: none } 88% { transform: translateY(2px); box-shadow: 0 1px 0 #e6d3ae } }
#dl .hintb.done .say { animation: hs-gone .35s ease-in both; }
#dl .hintb.done .star { animation: hs-done .65s ease-out both; }
@keyframes hs-done { 0% { transform: scale(1) } 35% { transform: scale(1.45) rotate(30deg); filter: brightness(1.3) } 100% { transform: scale(0) rotate(160deg); opacity: 0 } }
@keyframes hs-gone { 100% { transform: scale(.4); opacity: 0 } }
#dl .hintb.yawn .say { animation: hs-gone .4s ease-in both; }
#dl .hintb.yawn .star { animation: hs-yawn 1.5s ease-in both; }
#dl .hintb.yawn .star .eyes, #dl .hintb.yawn .star .smile { display: none; }
#dl .hintb.yawn .star .shut, #dl .hintb.yawn .star .yawnm { display: inline; }
@keyframes hs-yawn { 0% { transform: none } 35% { transform: scale(1.08, .92) rotate(-8deg) } 55% { transform: scale(1) } 100% { transform: translate(18px, -60px) scale(.5); opacity: 0 } }
#dl .hintb.away { opacity: 0; transition: opacity .2s; }

/* ─── 설정 · 조작 안내 창 ─── */
#dl .setg { display: flex; flex-direction: column; gap: 10px; max-width: 700px; margin: 4px auto 0; }
#dl .srow { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-radius: 22px; }
#dl .srow .si { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; font-size: 24px; flex: none; background: radial-gradient(circle at 35% 30%, #fff, #d8ecff); box-shadow: inset 0 -3px 0 #0000000f; }
#dl .srow .sl { flex: 1; font-size: 19px; } #dl .srow .sl small { display: block; font-size: 13px; color: #a88a66; }
#dl .seg { display: flex; gap: 4px; padding: 4px; border-radius: 999px; background: #f3e4c8; box-shadow: inset 0 2px 0 #e2c99c; }
#dl .seg .sg { font-family: inherit; font-size: 16px; padding: 5px 14px; border: 0; border-radius: 999px; background: transparent; color: #8a6b48; cursor: pointer; transition: transform .15s, background .2s; }
#dl .seg .sg:hover { transform: translateY(-1px); }
#dl .seg .sg.on { background: #fff; color: #4a3b2a; box-shadow: 0 3px 0 #e2c99c; animation: dl-pop .3s cubic-bezier(.3,1.6,.5,1); }
#dl .ctls { display: flex; flex-direction: column; gap: 12px; }
#dl .ctls .cgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; margin-top: 8px; }
#dl .ctls .crow { display: flex; align-items: center; gap: 10px; padding: 7px 12px; border-radius: 16px; font-size: 16px; }
#dl .ctls .caps { display: flex; gap: 3px; flex: none; min-width: 64px; }
#dl .ctls kbd { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 7px; border-radius: 9px; background: #fff; border: 2px solid #e6d3ae; box-shadow: 0 3px 0 #e6d3ae; font-family: inherit; font-size: 14px; color: #8a6b48; }
`;
