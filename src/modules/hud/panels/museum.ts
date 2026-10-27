// 박물관 창(open-museum) — GDD 3.11-5 · 5.6. 기증할 수 있는 것만(econ.canDonate), 첫 기증마다 반짝별·스탬프.
// 동별 진행(econ.museum, wave 3A)이 있으면 '전시관' 탭에 마일스톤 바를 보여 준다.
import type { PanelDef, PanelCtx, MuseumWing } from '../../../core/api';
import { splitVariant } from '../../../core/api';
import { BUILTIN_PANELS, pickTab, type HudTab } from '../logic';
import { econOf, call, bind, bagKeys, type PanelEnv } from './common';

const WING_KO: Record<string, { name: string; icon: string }> = {
  aquarium: { name: '수족관동', icon: '🐟' }, sea: { name: '해저관', icon: '🐙' }, bug: { name: '곤충관', icon: '🦋' },
  fossil: { name: '화석관', icon: '🦴' }, astro: { name: '천문관', icon: '🔭' },
};

export function museumPanel(env: PanelEnv): PanelDef {
  const { game, look } = env;
  const st = game.state;
  const D = BUILTIN_PANELS.museum;
  const wings = (): MuseumWing[] => call<{ wings: MuseumWing[] }>(econOf(game), 'museum')?.wings ?? [];
  const tabs = (): HudTab[] => {
    const t: HudTab[] = [{ id: 'donate', label: '기증하기', icon: '🦉' }];
    if (typeof econOf(game)?.museum === 'function') t.push({ id: 'wings', label: '전시관', icon: '🏛️' });
    return t;
  };
  /** 기증할 수 있는 종(변이 가방 키는 기본 종으로 묶는다) */
  const donatable = (): string[] => {
    const E = econOf(game);
    const out = new Set<string>();
    for (const k of bagKeys(game)) {
      const id = splitVariant(k).id;
      if (out.has(id)) continue;
      const can = call<boolean>(E, 'canDonate', id);
      if (can === undefined) {
        const s = st.species.get(id);
        if (s && s.category !== 'item' && s.category !== 'dino' && !call<boolean>(E, 'isDonated', id)) out.add(id);
      } else if (can) out.add(id);
    }
    return [...out];
  };

  return {
    kind: D.kind, title: D.title, icon: D.icon, color: D.color, defaultTab: D.defaultTab,
    tabs,
    meta: () => `스탬프 ${econOf(game)?.stamps ?? 0}개`,
    render(body: HTMLElement, pc: PanelCtx) {
      const { esc, fmt } = pc.h;
      const tab = pickTab(pc.tab, tabs(), D.defaultTab);
      if (tab === 'wings') {
        body.innerHTML = `<div class="wings">${wings().map((w) => {
          const k = WING_KO[w.id] ?? { name: w.id, icon: '🏛️' };
          const pct = w.total ? Math.floor((w.got / w.total) * 100) : 0;
          return `<div class="wg dl-card">${k.icon} ${esc(k.name)} <b>${fmt(w.got)}/${fmt(w.total)}</b><div class="bar"><i style="width:${pct}%"></i></div>
            <small style="color:#a88a66">${w.milestones.map((m) => `${pct >= m ? '🏅' : '·'}${m}%`).join(' ')}</small></div>`;
        }).join('') || '<div class="note">아직 문을 연 전시관이 없어요</div>'}</div>`;
        return;
      }
      const ids = donatable();
      body.innerHTML = `<div class="hint dl-card"><div class="ico" style="--cc:#e8dcff">🦉</div><div class="grow">후후~ 처음 보는 친구를 기증하면 <span style="color:#9d6bff">스탬프와 반짝별</span>을 줄게!
        <small>공룡은 친구라서 기증하지 않아요</small></div></div>
        <div class="grid">${ids.map((id) => `<div class="cell" style="--cc:${look.color(id)}"><div class="ico">${look.ico(id)}</div><div class="nm">${esc(look.name(id))}</div>
          <button class="btn" data-don="${esc(id)}">기증하기</button></div>`).join('') || '<div class="note">지금은 기증할 게 없어요. 새 친구를 잡아 와요!</div>'}</div>`;
      bind(body, 'don', (id) => {
        if (call<boolean>(econOf(game), 'donate', id)) {
          game.ui.toast(`${look.name(id)} 기증 완료! 스탬프 쾅!`);
          pc.h.confetti(body, ['#c59bff', '#ffe58a', '#fff'], 36);
        } else game.ui.toast('앗, 지금은 기증할 수 없어요 💦');
        pc.rerender();
      });
    },
  };
}
