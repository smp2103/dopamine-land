// 이야기 창('story') — 탭 '이야기'(지금 챕터·목표·수평선 다음 것·챕터 길) · '별조각'(섬 주인 체인 7개).
// 그리기만 한다(판정은 story.ts). hud 공용 클래스(.req · .bar · .dl-card · .note)를 쓴다.
import type { PanelCtx, PanelDef } from '../../core/api';
import { CHAPTERS, PIECES_TOTAL, chapterDef, type ChainDef } from './data';
import type { ChainProgress, ChainStatus } from './chains';
import type { GoalRow } from './logic';

export const STORY_PANEL = { kind: 'story', title: '토토의 별 이야기', icon: '🐰', color: '#c9b6f2' } as const;

export interface StoryPanelSource {
  chapter(): number;
  goals(): GoalRow[];
  horizon(): string;
  nextStep(): string;
  pieces(): number;
  met(): boolean;
  restored(): boolean;
  ended(): boolean;
  chains(): Array<{ def: ChainDef; status: ChainStatus; p: ChainProgress }>;
}

const STATUS_TXT: Record<ChainStatus, string> = { idle: '아직 못 만났어요', asked: '부탁 듣는 중', ready: '주인에게 가 보자!', done: '별조각 받음' };
const pct = (a: number, b: number) => Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100));

let styled = false;
function ensureStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
#dl .stx .st-head { display:flex; align-items:center; gap:12px; padding:12px 14px; margin-bottom:10px; border-radius:18px;
  background: linear-gradient(135deg, #f3ecff, #fff4df); box-shadow: inset 0 -3px 0 #e6d8f6; }
#dl .stx .st-head .big { font-size:40px; filter: drop-shadow(0 2px 0 #fff); }
#dl .stx .st-head b { font-size:20px; }
#dl .stx .st-head small { display:block; opacity:.75; font-size:14px; margin-top:2px; }
#dl .stx .st-stars { display:flex; gap:4px; margin:6px 0 10px; justify-content:center; font-size:26px; }
#dl .stx .st-stars i { font-style:normal; filter: grayscale(1) opacity(.35); transition: filter .3s; }
#dl .stx .st-stars i.on { filter: drop-shadow(0 0 6px #ffe58a); }
#dl .stx .st-road { display:flex; gap:6px; margin-top:12px; flex-wrap:wrap; }
#dl .stx .st-road div { flex:1 1 30%; min-width:110px; padding:8px 10px; border-radius:14px; background:#fffaf0; font-size:14px; box-shadow: inset 0 -2px 0 #f0e2c4; }
#dl .stx .st-road div.now { background:#fff0c8; box-shadow: inset 0 -3px 0 #f2c96a; }
#dl .stx .st-road div.done { opacity:.6; }
#dl .stx .st-hz { margin-top:10px; padding:10px 12px; border-radius:14px; background:#eef8ff; box-shadow: inset 0 -2px 0 #cfe6f7; }
`;
  document.head.appendChild(s);
}

export function storyPanel(src: StoryPanelSource): PanelDef {
  return {
    kind: STORY_PANEL.kind, title: STORY_PANEL.title, icon: STORY_PANEL.icon, color: STORY_PANEL.color, defaultTab: 'story',
    tabs: () => [
      { id: 'story', label: '이야기', icon: '📖', badge: `${src.chapter()}장` },
      { id: 'chains', label: '별조각', icon: '⭐', badge: `${src.pieces()}/${PIECES_TOTAL}` },
    ],
    meta: () => `별조각 ${src.pieces()}/${PIECES_TOTAL}`,
    render(body: HTMLElement, pc: PanelCtx) {
      ensureStyle();
      body.innerHTML = `<div class="stx">${pc.tab === 'chains' ? chainsHtml(src, pc) : storyHtml(src, pc)}</div>`;
    },
  };
}

function starsRow(n: number) {
  return `<div class="st-stars">${Array.from({ length: PIECES_TOTAL }, (_, i) => `<i class="${i < n ? 'on' : ''}">⭐</i>`).join('')}</div>`;
}

function storyHtml(src: StoryPanelSource, pc: PanelCtx): string {
  const { esc } = pc.h;
  if (!src.met()) {
    return `<div class="st-head dl-card"><div class="big">🌠</div><div><b>첫날 밤…</b><small>${esc(src.nextStep())}</small></div></div>
      <div class="note">밤하늘에서 무언가 반짝이며 떨어질 것 같아요. 두근두근!</div>`;
  }
  const cur = src.chapter();
  const def = chapterDef(cur);
  const goals = src.goals();
  const head = src.ended()
    ? `<div class="st-head dl-card"><div class="big">🌟</div><div><b>토토는 별나라로 돌아갔어요</b><small>고마워! 이제 도감 100%와 블랙홀이 기다려요</small></div></div>`
    : `<div class="st-head dl-card"><div class="big">${def.icon}</div><div><b>${cur}장 · ${esc(def.name)}</b><small>${esc(src.nextStep())}</small></div></div>`;
  const list = goals.map((g) => `<div class="req dl-card${g.done ? ' done' : ''}"><div class="who${g.done ? ' ok' : ''}">${g.done ? '✅' : esc(g.icon)}</div>
      <div class="tx">${esc(g.text)}</div><div class="chk">${g.done ? '🎉' : '⏳'}</div></div>`).join('');
  const hz = src.ended() ? '' : `<div class="st-hz">🔭 수평선의 다음 것: <b>${esc(src.horizon())}</b> <small style="opacity:.7">(지도에 별 표시 · 하늘에 빛기둥)</small></div>`;
  const road = `<div class="st-road">${CHAPTERS.map((c) => `<div class="${c.no < cur ? 'done' : c.no === cur ? 'now' : ''}">${c.icon} ${c.no}장 ${esc(c.name)}<br><small style="opacity:.7">${esc(c.hours)}</small></div>`).join('')}</div>`;
  return head + starsRow(src.pieces()) + list + hz + road;
}

function chainsHtml(src: StoryPanelSource, pc: PanelCtx): string {
  const { esc } = pc.h;
  const rows = src.chains();
  const top = src.restored()
    ? `<div class="st-head dl-card"><div class="big">🌟</div><div><b>토토의 별이 다시 빛나요!</b><small>${src.ended() ? '토토는 집으로 돌아갔어요' : '로켓을 타고 우주로 가면 토토가 집에 갈 수 있어요'}</small></div></div>`
    : `<div class="st-head dl-card"><div class="big">⭐</div><div><b>섬 주인 부탁 7가지</b><small>섬마다 주인에게 말을 걸어 부탁을 들어 보세요</small></div></div>`;
  const list = rows.map(({ def, status, p }) => `<div class="req dl-card${status === 'done' ? ' done' : ''}">
      <div class="who${status === 'done' ? ' ok' : ''}">${status === 'done' ? '⭐' : esc(def.icon)}</div>
      <div class="tx">${'①②③④⑤⑥⑦'[def.no - 1]} ${esc(def.ownerName)} <small style="opacity:.7">${esc(def.islandName)}</small><br>${esc(def.text)}
        <small>${esc(STATUS_TXT[status])}${status === 'done' ? '' : ` · ${esc(p.text)}`}</small>
        <div class="bar"><i style="width:${status === 'done' ? 100 : pct(p.have, p.need)}%"></i></div></div>
      <div class="chk">${status === 'done' ? '🎉' : status === 'ready' ? '❗' : '⏳'}</div></div>`).join('');
  return top + starsRow(src.pieces()) + list;
}
