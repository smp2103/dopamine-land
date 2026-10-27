// 도감 창(B) — GDD 3.11-3 · 5.5. 탭 7개(물고기·바다·곤충·공룡·화석·우주·탈것 — 탈것은 tag 'vehicle'),
// 섬 필터 칩(종 where 의 섬, 칩마다 %·100% 왕관), 지금 탭·섬 % 바(100% 면 섬 왕관).
// 칸 = 분류 모양 실루엣(?) → 컬러(모델 썸네일) → 은별(10회) → 금별(왕관 개체) + 반짝이 무지개 별 + 숙련 별(ext.meta.mastery).
// 칸을 누르면 자세히(큰 그림·서식·시간·날씨·최대 크기·잡은 수·변이·기증). 못 잡은 칸도 '어디서 볼 수 있을까?' 힌트만 보여 준다.
// 합계는 탭 칸 수 합 314(데이터가 덜 실린 탭은 '소문만 무성' 칸으로 채운다). 섬 필터는 flags.hud.dexFilter.
import type { PanelDef, PanelCtx } from '../../../core/api';
import type { Species } from '../../../core/state';
import { ISLANDS } from '../../../core/world';
import { DEX_TABS, CAT_ICON, RARITY_COLOR } from '../../economy/data';
import {
  BUILTIN_PANELS, dexCellView, dexIslandChips, dexTotals, fossilProgress, islandProgress, masteryOf, pickTab, speciesOnIsland,
  PLANET_NAME, WEATHER_LOOK, type HudTab,
} from '../logic';
import { econOf, call, bind, thumbHtml, silHtml, type PanelEnv } from './common';

const ISLAND_ORDER = [...ISLANDS.map((d) => d.id), 'moon'];
const TIME_KO: Record<string, string> = { morning: '아침', day: '낮', sunset: '저녁', night: '밤', noon: '정오', midnight: '자정', any: '언제나', all: '언제나', evening: '저녁' };
const ZONE_KO: Record<string, string> = {
  river: '강', pond: '연못', waterfall: '폭포', heartpond: '하트 연못', estuary: '강어귀', shore: '바닷가', stream: '시냇물', mangrove: '맹그로브',
  lagoon: '석호', reef: '산호초', offshore: '먼바다', deep: '심해', icehole: '얼음 구멍', icelake: '얼음 호수', icesea: '얼음 바다', swamp: '늪',
  foglake: '안개 호수', oasis: '오아시스', ruin: '유적', cave: '동굴', dune: '모래 언덕', crater: '크레이터', moonpond: '달 연못',
  flower: '꽃밭', tree: '나무', grass: '풀밭', rock: '바위', sakura: '벚꽃길', orchard: '과수원', beach: '해변', jungle: '정글', palm: '야자수',
  fern: '고사리 숲', ranch: '목장', volcano: '화산', lava: '용암', fossil: '화석 발굴지', snow: '눈밭', sky: '하늘', mushroom: '버섯 숲',
};

export function dexPanel(env: PanelEnv): PanelDef {
  const { game } = env;
  const st = game.state;
  const D = BUILTIN_PANELS.dex;
  const hudF = () => (st.flags.hud ??= {}) as { dexFilter?: string | null; seen?: Record<string, number> };
  const islandName = (id: string) => {
    if (PLANET_NAME[id]) return PLANET_NAME[id];
    try { return game.geo?.islandName?.(id) || ISLANDS.find((d) => d.id === id)?.name || id; } catch { return id; }
  };
  /** 안 가 본 섬은 이름 대신 ??? (geo 가 없으면 다 보인다) */
  const known = (id: string) => {
    if (id === 'moon' || !ISLANDS.some((d) => d.id === id)) return true;
    const g = game.geo;
    if (!g?.discovered) return true;
    try { return g.discovered(id); } catch { return true; }
  };
  const all = () => [...st.species.values()];
  const has = (id: string) => !!st.dex[id];
  const tabDef = (tabId: string | undefined) => DEX_TABS.find((x) => x.id === tabId) ?? DEX_TABS[0];
  const totals = () => dexTotals(DEX_TABS, all(), has);
  const tabs = (): HudTab[] => {
    const t = totals();
    return DEX_TABS.map((d) => ({ id: d.id, label: d.name, icon: d.icon, badge: `${t.tabs[d.id].got}/${t.tabs[d.id].slots}` }));
  };
  const mastery = (id: string) => masteryOf(game.ext?.meta, id);
  const donated = (id: string) => !!call<boolean>(econOf(game), 'isDonated', id);
  const rcol = (s: Species) => RARITY_COLOR[Math.min(5, Math.max(1, s.rarity))];
  const masteryHtml = (n: number) => (n > 0 ? `<div class="ms" title="숙련 ${n}">${'✦'.repeat(n)}</div>` : '');

  const whereFacts = (s: Species, pc: PanelCtx, hint: boolean) => {
    const { esc } = pc.h;
    const out: string[] = [];
    const isl = [...new Set((s.where ?? []).map((w) => w.island).filter(Boolean) as string[])];
    if (isl.length) out.push(`🏝️ ${isl.map((i) => (known(i) ? esc(islandName(i)) : '???')).join('·')}`);
    const zones = [...new Set((s.where ?? []).map((w) => w.zone).filter(Boolean) as string[])];
    if (zones.length && !hint) out.push(`📍 ${zones.map((z) => esc(ZONE_KO[z] ?? z)).join('·')}`);
    const times = [...new Set((s.where ?? []).flatMap((w) => (w.time == null ? [] : Array.isArray(w.time) ? w.time : [w.time])))];
    const allDay = times.includes('all') || times.includes('any') || ['morning', 'day', 'sunset', 'night'].every((t) => times.includes(t));
    if (times.length) out.push(`🕒 ${allDay ? '언제나' : times.map((t) => TIME_KO[t] ?? esc(t)).join('·')}`);
    const only = [...new Set((s.where ?? []).flatMap((w) => w.weather?.only ?? []))];
    const boost = [...new Set((s.where ?? []).flatMap((w) => w.weather?.boost ?? []))];
    const wx = (w: string) => `${WEATHER_LOOK[w as keyof typeof WEATHER_LOOK]?.icon ?? ''}${esc(WEATHER_LOOK[w as keyof typeof WEATHER_LOOK]?.name ?? w)}`;
    if (only.length) out.push(`${only.map(wx).join('·')} 에만`);
    if (boost.length) out.push(`${boost.map(wx).join('·')} 에 자주`);
    return out;
  };

  const detail = (s: Species, pc: PanelCtx) => {
    const { esc, fmt } = pc.h;
    const rec = st.dex[s.id];
    const col = rcol(s);
    const pic = rec ? thumbHtml(env, s.id, CAT_ICON[s.category] ?? '❔') : silHtml(s);
    if (!rec) {
      // 못 잡은 칸 — 이름은 숨기고 힌트만
      const hints = whereFacts(s, pc, true);
      return `<div class="detail dl-card miss"><div class="ico big" style="--cc:#efe1c6">${pic}</div><div>
        <div style="font-size:26px">??? <span style="color:${col};-webkit-text-stroke:1px #fff">${'★'.repeat(s.rarity)}</span></div>
        <div style="font-size:17px;margin-top:4px">아직 만나지 못한 친구예요. 어디서 볼 수 있을까?</div>
        <div class="facts">${hints.map((f) => `<span>${f}</span>`).join('') || '<span>힌트가 아직 없어요</span>'}</div></div></div>`;
    }
    const facts: string[] = [`잡은 수 ${fmt(rec.count)}`];
    if (rec.best) facts.push(`최대 ${rec.best >= 100 ? `${(rec.best / 100).toFixed(2)}m` : `${rec.best.toFixed(1)}cm`}`);
    if (s.habitat) facts.push(esc(s.habitat));
    facts.push(...whereFacts(s, pc, false));
    const v = rec.variants ?? {};
    if (v.shiny) facts.push(`✨ 반짝이 ${v.shiny}`);
    if (v.crown) facts.push(`👑 왕관 ${v.crown}`);
    if (v.tiny) facts.push(`🐣 꼬마 ${v.tiny}`);
    const m = mastery(s.id);
    if (m) facts.push(`✦ 숙련 ${m}`);
    if (s.category !== 'dino' && !s.tags?.includes('vehicle')) facts.push(donated(s.id) ? '🏛️ 기증 완료' : '🏛️ 아직 기증 안 했어요');
    if (rec.first) facts.push(`📅 처음 ${new Date(rec.first).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}`);
    const fp = s.category === 'fossil' ? fossilProgress(s, all(), has) : null;
    if (fp) facts.push(`🦴 조각 ${fp.have}/${fp.total}`);
    return `<div class="detail dl-card"><div class="ico big" style="--cc:${col}">${pic}</div><div>
      <div style="font-size:26px">${esc(s.name)} <span style="color:${col};-webkit-text-stroke:1px #fff">${'★'.repeat(s.rarity)}</span></div>
      <div style="font-size:17px;margin-top:4px">${esc(s.desc ?? '아직 수수께끼가 많은 친구.')}</div>
      <div class="facts">${facts.map((f) => `<span>${f}</span>`).join('')}</div></div></div>`;
  };

  return {
    kind: D.kind, title: D.title, icon: D.icon, color: D.color, defaultTab: D.defaultTab, wide: true,
    tabs,
    meta: () => { const t = totals(); return `모은 칸 ${t.got} / ${t.total} (${t.total ? Math.floor((t.got / t.total) * 100) : 0}%)`; },
    render(body, pc) {
      const { esc } = pc.h;
      const tab = pickTab(pc.tab, tabs(), D.defaultTab);
      const td = tabDef(tab);
      const inTab = all().filter((s) => td.match(s));
      // 칩은 실제 섬(+ 달)만 — 데이터의 'any'·P1 행성 구역 같은 값은 섬이 아니다
      const chips = dexIslandChips(inTab, has, ISLAND_ORDER).filter((c) => ISLAND_ORDER.includes(c.island));
      let filter = hudF().dexFilter ?? null;
      // 이 탭에 없는 섬이 걸려 있으면 '전부'로 보여 준다(필터 값은 그대로 — 다른 탭으로 가면 다시 걸린다)
      if (filter && !chips.some((c) => c.island === filter)) filter = null;
      const here = (() => { try { return game.geo?.zoneAt(game.player.pos.x, game.player.pos.z)?.island ?? null; } catch { return null; } })();
      const list = inTab.filter((s) => speciesOnIsland(s, filter)).sort((a, b) => a.rarity - b.rarity || a.name.localeCompare(b.name, 'ko'));
      const prog = islandProgress(inTab, has, filter);
      const slotsLeft = filter ? 0 : Math.max(0, td.slots - inTab.length);
      const sel = pc.sel ? st.species.get(pc.sel) : undefined;
      const chipHtml = [`<button class="f${filter ? '' : ' on'}" data-isl="">전부 <small>${prog.total && !filter ? `${prog.pct}%` : ''}</small></button>`,
        ...chips.map((c) => {
          const look = ISLANDS.find((d) => d.id === c.island);
          const nm = known(c.island) ? islandName(c.island) : '???';
          return `<button class="f${filter === c.island ? ' on' : ''}${c.crown ? ' crowned' : ''}" data-isl="${esc(c.island)}" style="--fc:${look ? `var(--isl-${look.theme}, #7cc8ff)` : '#8f86ff'}">${here === c.island ? '📍' : ''}${esc(nm)} <small>${c.pct}%</small>${c.crown ? '<i class="cw">👑</i>' : ''}</button>`;
        })].join('');
      const t = totals().tabs[td.id];
      body.innerHTML = `<div class="filters">${chipHtml}</div>
        <div class="prog"><span class="pl">${td.icon} ${filter ? esc(known(filter) ? islandName(filter) : '???') : '전체'} ${prog.got}/${filter ? prog.total : t.slots}</span>
          <div class="bar${prog.crown ? ' full' : ''}"><i style="width:${filter ? prog.pct : t.slots ? Math.floor((t.got / t.slots) * 100) : 0}%"></i></div>
          <b>${filter ? prog.pct : t.slots ? Math.floor((t.got / t.slots) * 100) : 0}%</b>${prog.crown && prog.total ? '<span class="crown" title="섬 도감 완성!">👑</span>' : ''}</div>
        ${sel ? detail(sel, pc) : ''}
        <div class="grid dexg" style="margin-top:12px">${list.map((s) => {
          const rec = st.dex[s.id];
          const c = dexCellView(rec, mastery(s.id));
          const ic = CAT_ICON[s.category] ?? '❔';
          const star = c.star ? `<div class="star ${c.star}" title="${c.star === 'gold' ? '왕관 개체를 잡았어요' : '10번 잡았어요'}">★${c.crown ? '<i>👑</i>' : ''}</div>` : '';
          const fp = !rec && s.category === 'fossil' ? fossilProgress(s, all(), has) : null;
          return `<div class="cell ${c.state}${rec ? '' : ' miss'}${pc.sel === s.id ? ' sel' : ''}" data-sp="${esc(s.id)}" style="--cc:${rcol(s)}99">${star}${c.shiny ? '<div class="rb" title="반짝이">★</div>' : ''}
            <div class="ico">${rec ? thumbHtml(env, s.id, ic) : `${silHtml(s) || `<span class="sil">${ic}</span>`}<b>?</b>`}</div>
            <div class="nm">${rec ? esc(s.name) : '???'}</div><div class="sm">${'★'.repeat(s.rarity)}</div>${masteryHtml(c.mastery)}
            ${fp ? `<div class="fp">🦴 ${fp.have}/${fp.total}</div>` : ''}${rec && donated(s.id) ? '<div class="badge don">기증</div>' : ''}</div>`;
        }).join('')}${Array.from({ length: slotsLeft }, () => '<div class="cell rumor" title="소문만 무성한 친구"><div class="ico">❔</div><div class="nm">소문만 무성</div><div class="sm">언젠가 만나요</div></div>').join('')}${
          !list.length && !slotsLeft ? `<div class="note">${filter ? '이 섬엔 아직 이 탭 친구가 없어요' : '아직 이 탭 친구들이 등록되지 않았어요'}</div>` : ''}</div>`;
      bind(body, 'isl', (v) => { hudF().dexFilter = v || null; st.save(); pc.setSel(null); });
      bind(body, 'sp', (v) => pc.setSel(pc.sel === v ? null : v));
    },
  };
}
