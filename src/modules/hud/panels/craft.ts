// 제작 창(open-craft) — GDD 3.11-5 · 4.6. 레시피 목록, 재료는 econ.needsOf(rid)(P0 이면 1/5), 있음/없음 색,
// 아직 못 배운 레시피(카드·조건)는 자물쇠 + 힌트. 만들기 → 뚝딱 연출(색종이).
import type { PanelDef, PanelCtx, Recipe as ApiRecipe } from '../../../core/api';
import { RECIPES, needsOf as tableNeeds, recipeGateOf, parseGate, anyMatches, ANY_NEEDS, GATE_COUNTERS } from '../../economy/data';
import { BUILTIN_PANELS, pickTab, type HudTab } from '../logic';
import { econOf, call, bind, type PanelEnv } from './common';

const KIND_ICON: Record<string, string> = { 도구: '🎣', 미끼: '🪱', 요리: '🍳', '탈것 부품': '⛵', '로켓 부품': '🚀', '섬 개발': '🏝️', 가구: '🛋️' };
const KIND_ORDER = ['도구', '미끼', '요리', '가구', '탈것 부품', '로켓 부품', '섬 개발'];

type RecipeRow = ApiRecipe & { gate?: string; p0Gate?: string | null; hint?: string; pri?: string; extra?: boolean };

export function craftPanel(env: PanelEnv): PanelDef {
  const { game, look } = env;
  const st = game.state;
  const D = BUILTIN_PANELS.craft;
  const recipes = (): RecipeRow[] => {
    const list = call<RecipeRow[]>(econOf(game), 'recipes');
    return (Array.isArray(list) ? list : (RECIPES as unknown as RecipeRow[])).filter((r) => !r.extra);
  };
  const tabs = (): HudTab[] => {
    const kinds = new Set(recipes().map((r) => r.kind));
    return [{ id: 'all', label: '전부' }, ...KIND_ORDER.filter((k) => kinds.has(k)).map((k) => ({ id: k, label: k, icon: KIND_ICON[k] }))];
  };
  const p0 = () => econOf(game)?.p0 ?? true;
  const needs = (r: RecipeRow): Record<string, number> => {
    const n = call<Record<string, number>>(econOf(game), 'needsOf', r.id);
    return n && typeof n === 'object' ? n : tableNeeds(r as never, p0());
  };
  /** 가진 수 — 'any:*' 는 맞는 칸을 모두 더한다(같은 종 조건은 가장 많은 한 종) */
  const have = (k: string): number => {
    if (!ANY_NEEDS[k]) return st.bag[k] ?? 0;
    const a = ANY_NEEDS[k];
    let sum = 0, best = 0;
    for (const [id, n] of Object.entries(st.bag)) {
      if (n <= 0) continue;
      const s = st.species.get(id.split('@')[0]);
      if (!anyMatches(k, { id, category: s?.category, rarity: s?.rarity, tags: s?.tags })) continue;
      const c = a.dupOnly ? Math.max(0, n - 1) : n;
      sum += c; best = Math.max(best, c);
    }
    return a.same ? best : sum;
  };
  /** 못 배운 이유(배웠으면 null) */
  const lockOf = (r: RecipeRow): string | null => {
    const E = econOf(game);
    const g = parseGate(recipeGateOf(r as never, p0()), r.id);
    if (g.type === 'base') return null;
    if (g.type === 'card') return call<boolean>(E, 'isUnlocked', g.key) ? null : `📇 레시피 카드 필요(⭐ ${g.stars})`;
    if (g.type === 'key') return call<boolean>(E, 'isUnlocked', g.key) ? null : r.hint ?? '아직 비밀이에요';
    // 조건 카운터는 economy 만 센다 — 만들 수 없으면 힌트를 보여 준다
    return call<boolean>(E, 'canCraft', r.id) ? null : r.hint ?? `${GATE_COUNTERS[g.counter] ?? g.counter} ${g.n} 이상`;
  };

  return {
    kind: D.kind, title: D.title, icon: D.icon, color: D.color, defaultTab: D.defaultTab,
    tabs,
    meta: () => `레시피 ${recipes().length}개`,
    render(body: HTMLElement, pc: PanelCtx) {
      const { esc, fmt } = pc.h;
      const tab = pickTab(pc.tab, tabs(), D.defaultTab);
      const E = econOf(game);
      const list = recipes().filter((r) => tab === 'all' || r.kind === tab)
        .map((r) => ({ r, lock: lockOf(r), ok: !!call<boolean>(E, 'canCraft', r.id) }))
        .sort((a, b) => Number(b.ok) - Number(a.ok) || Number(!!a.lock) - Number(!!b.lock));
      body.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">${list.map(({ r, lock, ok }) => {
        const ns = Object.entries(needs(r)).map(([k, v]) => {
          const h = have(k);
          return `<span style="color:${h >= v ? '#5aa864' : '#d77a7a'}">${look.ico(k)} ${esc(look.name(k))} ${fmt(Math.min(h, 999))}/${fmt(v)}</span>`;
        }).join('<br>');
        // 재료는 다 있는데 못 만들 때(한 번만 만드는 도구 등)는 까닭을 적는다
        const enough = Object.entries(needs(r)).every(([k, v]) => have(k) >= v);
        const gv = (r as { gives?: unknown }).gives;
        const gives = typeof gv === 'string' ? [gv] : gv && typeof gv === 'object' ? Object.keys(gv) : [];
        const why = lock ?? (!ok && enough ? (gives.some((g) => g.startsWith('tool_') && (st.bag[g] ?? 0) > 0) || (r.unlock && call<boolean>(E, 'isUnlocked', r.unlock)) ? '이미 가지고 있어요' : '지금은 만들 수 없어요') : null);
        return `<div class="cell${ok ? '' : ' dim'}" style="--cc:${ok ? '#d8f5c8' : '#f3e6cf'}"><div class="ico">${lock ? '🔒' : r.icon}</div>
          <div class="nm">${esc(r.name)}</div>${r.desc ? `<div class="sm">${esc(r.desc)}</div>` : ''}
          <div class="sm" style="line-height:1.35;margin:4px 0">${ns}</div>
          ${lock ? `<div class="why">${esc(lock)}</div>` : `<button class="btn${ok ? '' : ' off'}" data-craft="${esc(r.id)}">만들기</button>${why ? `<div class="why">${esc(why)}</div>` : ''}`}</div>`;
      }).join('') || '<div class="note">아직 아는 레시피가 없어요</div>'}</div>`;
      bind(body, 'craft', (id) => {
        const r = recipes().find((x) => x.id === id);
        if (!r) return;
        if (!call<boolean>(econOf(game), 'canCraft', id)) { game.ui.toast('재료가 모자라요 💦'); return; }
        if (call<boolean>(econOf(game), 'craft', id)) {
          game.ui.toast(`뚝딱뚝딱… ${r.name} 완성!`);
          pc.h.confetti(body, ['#9bd77a', '#ffe58a', '#fff'], 30);
        }
        pc.rerender();
      });
    },
  };
}
