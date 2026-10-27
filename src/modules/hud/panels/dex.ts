// 도감 창(B) — GDD 3.11-3 · 5.5. 탭 7개(물고기·바다·곤충·공룡·화석·우주·탈것), 섬별 필터와 % 바(100% 면 섬 왕관),
// 칸 = 실루엣(?) → 컬러 → 은별(10회) → 금별(왕관 개체) + 반짝이 무지개 별. 칸을 누르면 자세히(서식·시간·날씨·최대 크기·잡은 수·기증).
// 섬 필터는 flags.hud.dexFilter 에 남긴다(계약 7장 hud 이름칸).
import type { PanelDef, PanelCtx } from '../../../core/api';
import type { Species } from '../../../core/state';
import { ISLANDS } from '../../../core/world';
import { DEX_TABS, CAT_ICON, RARITY_COLOR } from '../../economy/data';
import { BUILTIN_PANELS, dexCell, islandProgress, pickTab, speciesOnIsland, WEATHER_LOOK, type HudTab } from '../logic';
import { econOf, call, bind, type PanelEnv } from './common';

const MAIN_ISLANDS = ISLANDS.filter((d) => d.theme !== 'islet');
const TIME_KO: Record<string, string> = { morning: '아침', day: '낮', sunset: '저녁', night: '밤', noon: '정오', midnight: '자정', any: '언제나' };

export function dexPanel(env: PanelEnv): PanelDef {
  const { game } = env;
  const st = game.state;
  const D = BUILTIN_PANELS.dex;
  const hudF = () => (st.flags.hud ??= {}) as { dexFilter?: string | null; seen?: Record<string, number> };
  const islandName = (id: string) => game.geo?.islandName?.(id) ?? ISLANDS.find((d) => d.id === id)?.name ?? id;
  const all = () => [...st.species.values()];
  const tabSpecies = (tabId: string | undefined) => {
    const t = DEX_TABS.find((x) => x.id === tabId) ?? DEX_TABS[0];
    return all().filter((s) => t.match(s));
  };
  const tabs = (): HudTab[] => DEX_TABS.map((t) => {
    const n = all().filter((s) => t.match(s));
    return { id: t.id, label: t.name, icon: t.icon, badge: `${n.filter((s) => st.dex[s.id]).length}/${n.length}` };
  });

  const detail = (s: Species, pc: PanelCtx) => {
    const { esc, fmt } = pc.h;
    const rec = st.dex[s.id];
    const col = RARITY_COLOR[Math.min(5, Math.max(1, s.rarity))];
    const facts: string[] = [];
    if (rec) facts.push(`잡은 수 ${fmt(rec.count)}`);
    if (rec?.best) facts.push(`최대 ${rec.best.toFixed(1)}cm`);
    if (s.habitat) facts.push(esc(s.habitat));
    const isl = [...new Set((s.where ?? []).map((w) => w.island).filter(Boolean) as string[])];
    if (isl.length) facts.push(`🏝️ ${isl.map((i) => esc(islandName(i))).join('·')}`);
    const times = [...new Set((s.where ?? []).flatMap((w) => (w.time == null ? [] : Array.isArray(w.time) ? w.time : [w.time])))];
    if (times.length) facts.push(`🕒 ${times.map((t) => TIME_KO[t] ?? esc(t)).join('·')}`);
    const wx = [...new Set((s.where ?? []).flatMap((w) => [...(w.weather?.only ?? []), ...(w.weather?.boost ?? [])]))];
    if (wx.length) facts.push(`${wx.map((w) => `${WEATHER_LOOK[w]?.icon ?? ''}${WEATHER_LOOK[w]?.name ?? esc(w)}`).join('·')}`);
    const v = rec?.variants ?? {};
    if (v.shiny) facts.push(`✨ 반짝이 ${v.shiny}`);
    if (v.crown) facts.push(`👑 왕관 ${v.crown}`);
    if (v.tiny) facts.push(`🐣 꼬마 ${v.tiny}`);
    const E = econOf(game);
    if (call<boolean>(E, 'isDonated', s.id)) facts.push('🏛️ 기증 완료');
    return `<div class="detail dl-card"><div class="ico" style="--cc:${col}">${CAT_ICON[s.category] ?? '❔'}</div><div>
      <div style="font-size:26px">${esc(s.name)} <span style="color:${col};-webkit-text-stroke:1px #fff">${'★'.repeat(s.rarity)}</span></div>
      <div style="font-size:17px;margin-top:4px">${esc(s.desc ?? '아직 수수께끼가 많은 친구.')}</div>
      <div class="facts">${facts.map((f) => `<span>${f}</span>`).join('')}</div></div></div>`;
  };

  return {
    kind: D.kind, title: D.title, icon: D.icon, color: D.color, defaultTab: D.defaultTab,
    tabs,
    meta: () => { const a = st.dexCount(); return `모은 종 ${a.got} / ${a.total}`; },
    render(body, pc) {
      const { esc } = pc.h;
      const tab = pickTab(pc.tab, tabs(), D.defaultTab);
      const filter = hudF().dexFilter ?? null;
      const inTab = tabSpecies(tab);
      const list = inTab.filter((s) => speciesOnIsland(s, filter)).sort((a, b) => a.rarity - b.rarity || a.name.localeCompare(b.name, 'ko'));
      const prog = islandProgress(inTab, (id) => !!st.dex[id], filter);
      const sel = pc.sel ? st.species.get(pc.sel) : undefined;
      const filters = [`<button class="f${filter ? '' : ' on'}" data-isl="">전부</button>`, ...MAIN_ISLANDS.map((d) =>
        `<button class="f${filter === d.id ? ' on' : ''}" data-isl="${d.id}">${esc(islandName(d.id))}</button>`)].join('');
      body.innerHTML = `<div class="filters">${filters}</div>
        <div class="prog">${filter ? esc(islandName(filter)) : '전체'} ${prog.got}/${prog.total}<div class="bar"><i style="width:${prog.pct}%"></i></div>${prog.pct}%${prog.crown ? '<span class="crown">👑</span>' : ''}</div>
        ${sel && st.dex[sel.id] ? detail(sel, pc) : ''}
        <div class="grid dexg" style="margin-top:12px">${list.map((s) => {
          const rec = st.dex[s.id];
          const c = dexCell(rec);
          const ic = CAT_ICON[s.category] ?? '❔';
          const star = c.state === 'gold' ? '<div class="star gold">★</div>' : c.state === 'silver' ? '<div class="star silver">★</div>' : '';
          return `<div class="cell${rec ? '' : ' miss'}${pc.sel === s.id ? ' sel' : ''}" data-sp="${esc(s.id)}" style="--cc:${RARITY_COLOR[Math.min(5, Math.max(1, s.rarity))]}99">${star}${c.shiny ? '<div class="rb">★</div>' : ''}
            <div class="ico">${rec ? ic : `<span class="sil">${ic}</span><b>?</b>`}</div>
            <div class="nm">${rec ? esc(s.name) : '???'}</div><div class="sm">${'★'.repeat(s.rarity)}</div>${rec && call<boolean>(econOf(game), 'isDonated', s.id) ? '<div class="badge">기증</div>' : ''}</div>`;
        }).join('') || `<div class="note">${filter ? '이 섬엔 아직 이 탭 친구가 없어요' : '아직 이 탭 친구들이 등록되지 않았어요'}</div>`}</div>`;
      bind(body, 'isl', (v) => { hudF().dexFilter = v || null; st.save(); pc.rerender(); });
      bind(body, 'sp', (v) => pc.setSel(pc.sel === v ? null : v));
    },
  };
}
