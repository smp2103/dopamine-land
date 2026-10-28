// 반짝이 말풍선 스타일 — hud 와 같은 Jua · 크림 말풍선 · 갈색 글자(art.ts UI_TEXT/UI_BG). 별빛 노랑 테두리로 반짝이 몫임을 알린다.
// z-index 11: hud(#dl 10) 위, 창(패널)이 열리면 안내는 아예 쉬니까 겹칠 일 없다.
import { UI_TEXT, UI_BG } from '../../core/art';

export const CSS = `
#dl-onb { position: fixed; inset: 0; pointer-events: none; z-index: 11; font-family: 'Jua', system-ui, sans-serif; color: ${UI_TEXT}; -webkit-font-smoothing: antialiased; }
#dl-onb * { box-sizing: border-box; }
#dl-onb .onb-pos { position: absolute; left: 0; top: 0; display: none; will-change: transform; }
#dl-onb.bubble .onb-pos { display: block; }
#dl-onb .onb-bub { position: relative; max-width: min(360px, 78vw); padding: 10px 18px 12px; border-radius: 22px 22px 22px 8px;
  background: linear-gradient(180deg, #fffdf6 0%, ${UI_BG} 100%); border: 3px solid #fff;
  box-shadow: 0 0 0 3px #ffe27a, 0 6px 0 #f2cf6a, 0 14px 26px #6b4a2b33;
  font-size: 19px; line-height: 1.45; transform-origin: 0% 100%;
  animation: onb-in .42s cubic-bezier(.3,1.7,.5,1) both, onb-float 2.8s .42s ease-in-out infinite; }
#dl-onb .onb-bub.flip { border-radius: 22px 22px 8px 22px; transform-origin: 100% 100%; }
/* 꼬리: 반짝이 쪽으로 동글 점 두 개(생각풍선처럼) */
#dl-onb .onb-bub::before, #dl-onb .onb-bub::after { content: ''; position: absolute; border-radius: 50%; background: ${UI_BG};
  box-shadow: 0 0 0 3px #ffe27a; }
#dl-onb .onb-bub::before { width: 13px; height: 13px; left: -9px; bottom: -11px; }
#dl-onb .onb-bub::after { width: 7px; height: 7px; left: -20px; bottom: -19px; }
#dl-onb .onb-bub.flip::before { left: auto; right: -9px; }
#dl-onb .onb-bub.flip::after { left: auto; right: -20px; }
#dl-onb .onb-who { position: absolute; top: -13px; left: 14px; font-size: 13px; line-height: 1; padding: 4px 10px 4px; border-radius: 999px;
  color: #fff; background: linear-gradient(180deg, #ffd65a, #ffb83a); box-shadow: 0 2px 0 #e59a1f, 0 0 0 2px #fff; letter-spacing: 1px; }
#dl-onb .onb-bub.flip .onb-who { left: auto; right: 14px; }
#dl-onb .onb-who::before { content: '★ '; }
#dl-onb .onb-txt { white-space: normal; word-break: keep-all; }
#dl-onb .onb-key { display: inline-grid; place-items: center; min-width: 30px; height: 30px; padding: 0 9px; margin: 0 2px; vertical-align: 1px;
  font-family: inherit; font-size: 16px; line-height: 1; color: #8a6b48; background: #fff; border: 2px solid #ecd9b4; border-radius: 10px;
  box-shadow: 0 3px 0 #e6d3ae; animation: onb-press 1.6s .5s ease-in-out infinite; }
#dl-onb .onb-bub.yay { box-shadow: 0 0 0 3px #a8e6a0, 0 6px 0 #7fcf7a, 0 14px 26px #6b4a2b33; animation: onb-yay .5s cubic-bezier(.3,1.8,.5,1) both; color: #3f8a4a; }
#dl-onb.leave .onb-bub { animation: onb-out .32s ease-in both; }
#dl-onb.leave.nap .onb-bub { animation: onb-out .5s .35s ease-in both; }
#dl-onb .onb-zz { position: absolute; left: 0; top: 0; display: none; font-size: 15px; color: #8a7bd8; opacity: 0;
  text-shadow: 0 0 0 #fff, 0 2px 0 #fff, 2px 0 0 #fff, -2px 0 0 #fff, 0 -2px 0 #fff; }
#dl-onb.nap .onb-zz { display: block; animation: onb-zz 1.1s ease-out both; }
#dl-onb .onb-spark { position: absolute; font-style: normal; font-size: 18px; margin: -10px 0 0 -8px; text-shadow: 0 0 6px #fff;
  animation: onb-spark .75s cubic-bezier(.2,.8,.4,1) both; }
@keyframes onb-in { 0% { transform: scale(.2) translateY(14px); opacity: 0 } 100% { transform: none; opacity: 1 } }
@keyframes onb-float { 0%,100% { translate: 0 0 } 50% { translate: 0 -4px } }
@keyframes onb-press { 0%,70%,100% { transform: translateY(0); box-shadow: 0 3px 0 #e6d3ae } 80% { transform: translateY(2px); box-shadow: 0 1px 0 #e6d3ae } }
@keyframes onb-yay { 0% { transform: scale(.85) } 60% { transform: scale(1.12) } 100% { transform: scale(1) } }
@keyframes onb-out { 0% { transform: scale(1); opacity: 1 } 40% { transform: scale(1.08) } 100% { transform: scale(0); opacity: 0 } }
@keyframes onb-zz { 0% { opacity: 0; translate: 0 0 } 30% { opacity: 1 } 100% { opacity: 0; translate: 10px -26px } }
@keyframes onb-spark { 0% { transform: translate(0,0) scale(.4); opacity: 1 } 100% { transform: translate(var(--x), var(--y)) scale(1.1) rotate(40deg); opacity: 0 } }
@media (prefers-reduced-motion: reduce) { #dl-onb .onb-bub, #dl-onb .onb-key { animation: none !important; } }
`;
