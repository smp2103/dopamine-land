// 마을 게시판(open-board) — 오늘의 부탁(econ.requests). 가진 수 바, 다 모았으면 건네주기(econ.fulfill).
import type { PanelDef, PanelCtx, EconRequest } from '../../../core/api';
import { BUILTIN_PANELS } from '../logic';
import { econOf, call, bind, type PanelEnv } from './common';

const FACES = ['🐰', '🐻', '🐱', '🐶', '🐸', '🦊', '🐼'];

export function boardPanel(env: PanelEnv): PanelDef {
  const { game, look } = env;
  const st = game.state;
  const D = BUILTIN_PANELS.board;
  const reqs = (): EconRequest[] => { const r = call<EconRequest[]>(econOf(game), 'requests'); return Array.isArray(r) ? r : []; };
  const target = (r: EconRequest) => r.species?.id ?? r.item ?? '';
  const npcName = (id?: string) => (id ? (game.ext.npc?.name?.(id) as string | undefined) ?? null : null);

  return {
    kind: D.kind, title: D.title, icon: D.icon, color: D.color, defaultTab: D.defaultTab,
    tabs: () => [{ id: 'today', label: '오늘의 부탁', icon: '📝' }],
    meta: () => { const r = reqs(); return `${r.filter((x) => x.done).length} / ${r.length} 완료`; },
    render(body: HTMLElement, pc: PanelCtx) {
      const { esc, fmt } = pc.h;
      const list = reqs();
      body.innerHTML = list.map((r, i) => {
        const id = target(r);
        const have = st.bag[id] ?? 0;
        const nm = r.species?.name ?? look.name(id);
        const who = npcName(r.npc);
        const unit = r.species ? '마리' : '개';
        return `<div class="req dl-card${r.done ? ' done' : ''}"><div class="who">${FACES[i % FACES.length]}</div>
          <div class="tx">${who ? `<b style="color:#e38b57">${esc(who)}</b> ` : ''}"${esc(nm)} ${fmt(r.n)}${unit} 가져다 줄래?"
            <small>보상 🪙 ${fmt(r.reward)}${r.stars ? ` · ⭐ ${fmt(r.stars)}` : ''} · 가진 것 ${fmt(Math.min(have, r.n))}/${fmt(r.n)}</small>
            <div class="bar"><i style="width:${Math.min(100, (have / Math.max(1, r.n)) * 100)}%"></i></div></div>
          ${r.done ? '<button class="btn off">완료!</button>' : `<button class="btn${have >= r.n ? ' gold' : ' off'}" data-req="${esc(r.id)}">건네주기</button>`}</div>`;
      }).join('') || '<div class="note">오늘은 부탁이 없어요. 내일 또 와요!</div>';
      bind(body, 'req', (rid) => {
        const r = list.find((x) => x.id === rid);
        if (r && (st.bag[target(r)] ?? 0) < r.n) { game.ui.toast('아직 다 못 모았어요 💦'); return; }
        if (call<boolean>(econOf(game), 'fulfill', rid)) {
          game.ui.toast('고마워! 보상을 받았다!');
          pc.h.confetti(body, ['#ff9cb8', '#ffe58a', '#fff'], 36);
        }
        pc.rerender();
      });
    },
  };
}
