// 가방 창(Tab) — GDD 3.11-4 · 4.2. 칸 = 아이템 종류 하나, 칸 수는 econ.bag.size(20→30→40→50).
// 도구(tool_*)는 가방 칸을 안 쓰고 5칸 도구 벨트에. 팔기·기증 버튼은 상점·박물관 창에서만.
import type { PanelDef } from '../../../core/api';
import { splitVariant } from '../../../core/api';
import { BAG } from '../../economy/data';
import { BAG_TABS, BUILTIN_PANELS, bagTabMatch, bagView, pickTab, VARIANT_TAIL } from '../logic';
import { econOf, call, bind, bagKeys, bagKind, emptyBag, slots, safe, type PanelEnv } from './common';

export function bagPanel(env: PanelEnv): PanelDef {
  const { game, look } = env;
  const st = game.state;
  const D = BUILTIN_PANELS.bag;
  const view = () => bagView(econOf(game)?.bag ?? null, st.bag, BAG.base);
  return {
    kind: D.kind, title: D.title, icon: D.icon, color: D.color, defaultTab: D.defaultTab,
    tabs: () => BAG_TABS,
    meta: () => view().text,
    render(body, pc) {
      const { esc, fmt } = pc.h;
      const E = econOf(game);
      const tab = pickTab(pc.tab, BAG_TABS, D.defaultTab);
      const v = view();
      const keys = bagKeys(game);
      const ids = keys.filter((k) => bagTabMatch(tab, bagKind(game, k)))
        .sort((a, b) => (look.species(a)?.rarity ?? 0) - (look.species(b)?.rarity ?? 0) || look.name(a).localeCompare(look.name(b), 'ko'));
      // 도구 벨트(5칸)
      const belt = (E?.bag?.belt ? safe(() => E.bag.belt(), [] as string[]) : Object.keys(st.bag).filter((k) => k.startsWith('tool_') && st.bag[k] > 0)).slice(0, BAG.belt);
      const beltHtml = `<div class="belt dl-card"><span>🧰 도구 벨트</span>${belt.map((id) => `<div class="bi" title="${esc(look.name(id))}">${look.ico(id)}</div>`).join('')}${'<div class="bi e"></div>'.repeat(Math.max(0, BAG.belt - belt.length))}</div>`;
      const sel = pc.sel && st.bag[pc.sel] ? pc.sel : null;
      let selHtml = '';
      if (sel) {
        const s = look.species(sel);
        const pr = s ? call<number>(E, 'priceOf', sel) ?? 0 : 0;
        const vt = splitVariant(sel).variant;
        selHtml = `<div class="hint dl-card"><div class="ico" style="--cc:${look.color(sel)}">${look.ico(sel)}</div><div class="grow">
          <div style="font-size:22px">${esc(look.name(sel))} ×${fmt(st.bag[sel])}</div>
          <small>${s ? `${'★'.repeat(s.rarity)} · ` : ''}${pr ? `팔면 🪙 ${fmt(pr)}` : '팔 수 없는 물건'}${vt ? ` · ${VARIANT_TAIL[vt]}` : ''} · 팔기는 꽥꽥상회, 기증은 박물관에서!</small></div></div>`;
      }
      const cells = ids.map((id) => {
        const s = look.species(id);
        const vt = splitVariant(id).variant;
        return `<div class="cell${sel === id ? ' sel' : ''}" data-it="${esc(id)}" style="--cc:${look.color(id)}"><div class="cnt">×${fmt(st.bag[id])}</div>${vt ? `<div class="vt">${Array.from(VARIANT_TAIL[vt])[0]}</div>` : ''}
          <div class="ico">${look.ico(id)}</div><div class="nm">${esc(look.name(id))}</div>${s ? `<div class="sm">${'★'.repeat(s.rarity)}</div>` : ''}</div>`;
      }).join('');
      const empty = !keys.length;
      body.innerHTML = beltHtml + selHtml + `<div class="grid">${empty ? emptyBag('가방이 텅 비었어요!', '물고기·곤충·과일을 모아서 꽥꽥상회에 팔아 봐요', pc) : cells}${
        tab === 'all' || empty ? slots(empty ? v.size : v.free) : ''}</div>${!empty && !ids.length ? '<div class="note">이 탭엔 아직 아무것도 없어요</div>' : ''}`;
      bind(body, 'it', (id) => pc.setSel(pc.sel === id ? null : id));
    },
  };
}
