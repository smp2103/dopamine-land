// 상점 창(open-shop{shop}) — GDD 3.11-5 · 4.4 · 4.5. 가게마다 같은 창: 팔기 탭(가방 + 오늘 시세 + '오늘의 인기!' + 다 팔기) /
// 사기 탭(econ.shopItems(shop), 값은 코인·반짝별·재료 전부 보여 준다). 팔 수 없는 가게(조선소·연구소·캡슐)는 사기만.
import type { PanelDef, PanelCtx, ShopItem as ApiShopItem, Cost } from '../../../core/api';
import { shopItemsOf, costOf, MAT } from '../../economy/data';
import { BUILTIN_PANELS, costParts, pickTab, shopInfo, shopOfArg, shopTabs, type ShopInfo } from '../logic';
import { econOf, call, bind, bagKeys, emptyBag, type PanelEnv } from './common';

const KIND_KO: Record<string, string> = {
  bait: '🪱 미끼', tool: '🧰 도구', seed: '🌱 씨앗', furniture: '🛋️ 가구', vehicle: '🚲 탈것', bag: '🎒 가방', recipe: '📇 레시피 카드',
  capsule: '🎫 캡슐', house: '🏠 집', licence: '🪪 면허', invite: '💌 초대', wing: '🏛️ 박물관', rocket: '🚀 로켓',
};

export function shopPanel(env: PanelEnv): PanelDef {
  const { game, look } = env;
  const st = game.state;
  const D = BUILTIN_PANELS.shop;
  let shop = 'quack';
  const info = (): ShopInfo => shopInfo(shop);

  const items = (): ApiShopItem[] => {
    const E = econOf(game);
    const list = call<ApiShopItem[]>(E, 'shopItems', shop);
    return Array.isArray(list) ? list : (shopItemsOf(shop) as unknown as ApiShopItem[]);
  };
  const priceOf = (it: ApiShopItem): Cost => {
    const E = econOf(game);
    const c = call<Cost>(E, 'shopPrice', it.id);
    if (c && typeof c === 'object') return c;
    return costOf(it as never, E?.p0 ?? true);
  };
  const owned = (it: ApiShopItem) => !!(it.once && it.unlock && call<boolean>(econOf(game), 'isUnlocked', it.unlock));
  const canBuy = (it: ApiShopItem, c: Cost): { ok: boolean; why?: string } => {
    const E = econOf(game);
    const r = call<{ ok: boolean; why?: string }>(E, 'canBuy', it.id);
    if (r && typeof r === 'object') return r;
    const afford = call<boolean>(E, 'canAfford', c);
    if (afford !== undefined) return { ok: afford, why: afford ? undefined : '모자라요' };
    return { ok: st.coins >= (c.coins ?? 0), why: '코인이 모자라요' };
  };
  const sellable = (id: string) => {
    const b = id.split('@')[0];
    const m = MAT.get(b);
    if (m) return !m.noSell && m.price > 0;
    return st.species.has(b);
  };

  const sellTab = (body: HTMLElement, pc: PanelCtx) => {
    const { esc, fmt } = pc.h;
    const E = econOf(game);
    const hot = call<{ hot: string[] }>(E, 'market')?.hot ?? [];
    const ids = bagKeys(game).filter(sellable).sort((a, b) => look.name(a).localeCompare(look.name(b), 'ko'));
    const price = (id: string) => call<number>(E, 'priceOf', id) ?? 0;
    const total = ids.reduce((s, id) => s + price(id) * (st.bag[id] ?? 0), 0);
    const hotLine = `<div class="hint dl-card"><div class="ico" style="--cc:#ffd9e6">📣</div><div class="grow">${hot.length
      ? `오늘의 인기! <span style="color:#ff6f8e">${hot.map((x) => esc(look.name(x))).join(' · ')}</span> 는 ×2 로 사요!`
      : `${esc(info().npc)}: 오늘도 반가워요!`}<small>같은 걸 하루에 많이 팔면 조금씩 싸져요</small></div>
      ${ids.length ? `<button class="btn gold" data-all="1">몽땅 팔기 🪙 ${fmt(total)}</button>` : ''}</div>`;
    body.innerHTML = hotLine + `<div class="grid">${ids.map((id) => {
      const pr = price(id);
      const n = st.bag[id] ?? 0;
      return `<div class="cell" style="--cc:${look.color(id)}"><div class="cnt">×${fmt(n)}</div>${hot.includes(id.split('@')[0]) ? '<div class="badge">인기!</div>' : ''}
        <div class="ico">${look.ico(id)}</div><div class="nm">${esc(look.name(id))}</div><div class="sm">🪙 ${fmt(pr)}</div>
        <button class="btn gold" data-sell="${esc(id)}">팔기</button>${n > 1 ? ` <button class="btn" data-sell-all="${esc(id)}">다 팔기</button>` : ''}</div>`;
    }).join('') || emptyBag('팔 수 있는 게 아직 없어요', '물고기·곤충·과일을 모아 와요', pc)}</div>`;
    const sold = (got: number | undefined, what: string) => {
      if (got && got > 0) { game.ui.toast(`${what} 팔았다! +${fmt(got)}코인`); pc.h.confetti(body, ['#ffcf4a', '#fff3a0', '#fff'], 18); }
      pc.rerender();
    };
    bind(body, 'sell', (id) => sold(call<number>(E, 'sell', id, 1, shop), look.name(id)));
    bind(body, 'sell-all', (id) => sold(call<number>(E, 'sell', id, st.bag[id] ?? 0, shop), `${look.name(id)} 몽땅`));
    bind(body, 'all', () => sold(call<number>(E, 'sellAll', ids, shop), '가방 속 물건을 몽땅'));
  };

  const buyTab = (body: HTMLElement, pc: PanelCtx) => {
    const { esc, fmt } = pc.h;
    const list = items();
    let lastKind = '';
    const cells: string[] = [];
    for (const it of list) {
      if (it.kind !== lastKind) { lastKind = it.kind; cells.push(`<div class="sec">${KIND_KO[it.kind] ?? esc(it.kind)}</div>`); }
      const c = priceOf(it);
      const own = owned(it);
      const can = own ? { ok: false } : canBuy(it, c);
      const parts = costParts(c, look.name, fmt).map((p) => esc(p.text)).join(' · ');
      const tint = it.kind === 'tool' ? '#cfe8ff' : it.kind === 'seed' ? '#d8f5c8' : it.kind === 'bait' ? '#ffe2c4' : it.kind === 'vehicle' ? '#ffe7c2' : '#f1dcff';
      cells.push(`<div class="cell${can.ok ? '' : ' dim'}" style="--cc:${tint}">${own ? '<div class="own">가졌어요</div>' : ''}<div class="ico">${it.icon}</div>
        <div class="nm">${esc(it.name)}</div><div class="sm">${esc(it.desc ?? '')}</div>
        ${own ? '' : `<button class="btn${can.ok ? ' gold' : ' off'}" data-buy="${esc(it.id)}">${parts}</button>${!can.ok && can.why ? `<div class="why">${esc(can.why)}</div>` : ''}`}</div>`);
    }
    body.innerHTML = `<div class="hint dl-card"><div class="ico" style="--cc:${info().color}">${info().icon}</div><div class="grow">${esc(info().npc)}: 천천히 골라 봐요!
      <small>🪙 ${fmt(st.coins)} · ⭐ ${fmt(econOf(game)?.stars ?? 0)}</small></div></div>
      <div class="grid">${cells.join('') || '<div class="note">아직 진열된 물건이 없어요</div>'}</div>`;
    bind(body, 'buy', (id) => {
      const it = list.find((x) => x.id === id);
      if (!it) return;
      const E = econOf(game);
      const c = priceOf(it);
      const can = canBuy(it, c);
      if (!can.ok) { game.ui.toast(`${can.why ?? '아직 살 수 없어요'} 💦`); return; }
      if (call<boolean>(E, 'buy', id)) {
        game.ui.toast(`${it.name} 샀다! 고마워요~`);
        pc.h.confetti(body, [info().color, '#ffe58a', '#fff'], 24);
      }
      pc.rerender();
    });
  };

  return {
    kind: D.kind, defaultTab: D.defaultTab,
    get title() { return info().name; },
    get icon() { return info().icon; },
    get color() { return info().color; },
    tabs: () => shopTabs(shop),
    meta: () => `🪙 ${Math.round(st.coins).toLocaleString('ko-KR')} · ⭐ ${Math.round(econOf(game)?.stars ?? 0).toLocaleString('ko-KR')}`,
    onOpen(arg) { shop = shopOfArg(arg); },
    render(body, pc) {
      const tab = pickTab(pc.tab, shopTabs(shop), D.defaultTab);
      if (tab === 'sell') sellTab(body, pc); else buyTab(body, pc);
    },
  };
}
