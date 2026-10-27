// 가방 창(Tab) — GDD 3.11-4 · 4.2. 칸 = 아이템 종류 하나, 칸 수는 econ.bag.size(20→30→40→50), 위에 쓴 칸/전체 막대.
// 생물 칸은 종 모델 썸네일(thumbs, 화질 낮음이면 이모지). 도구(tool_*)는 가방 칸을 안 쓰고 5칸 도구 벨트에.
// 팔기·기증 버튼은 상점·박물관에서 연 가방에서만(arg {from:'shop', shop} / {from:'museum'}) — 들판에서 연 가방은 보기만.
import type { PanelDef, PanelCtx } from '../../../core/api';
import { splitVariant } from '../../../core/api';
import { BAG } from '../../economy/data';
import { BAG_TABS, BUILTIN_PANELS, bagModeOf, bagTabMatch, bagView, pickTab, shopInfo, VARIANT_TAIL, type BagMode } from '../logic';
import { econOf, call, bind, bagKeys, bagKind, emptyBag, slots, safe, thumbHtml, type PanelEnv } from './common';

export function bagPanel(env: PanelEnv): PanelDef {
  const { game, look } = env;
  const st = game.state;
  const D = BUILTIN_PANELS.bag;
  const view = () => bagView(econOf(game)?.bag ?? null, st.bag, BAG.base);
  let mode: BagMode = { from: null };
  /** 팔 수 있나(econ 가격이 0 보다 크고, 가게가 사는 곳) */
  const price = (id: string) => call<number>(econOf(game), 'priceOf', id) ?? 0;
  const canDonate = (id: string) => !!call<boolean>(econOf(game), 'canDonate', splitVariant(id).id);

  const actHtml = (id: string, pc: PanelCtx) => {
    const { esc, fmt } = pc.h;
    const n = st.bag[id] ?? 0;
    if (mode.from === 'shop') {
      const pr = price(id);
      if (pr <= 0) return '<div class="why">이건 팔 수 없어요</div>';
      return `<div class="acts"><button class="btn gold" data-sell="${esc(id)}">팔기 🪙 ${fmt(pr)}</button>${n > 1 ? `<button class="btn" data-sell-n="${esc(id)}">${fmt(n)}개 다 팔기</button>` : ''}</div>`;
    }
    if (mode.from === 'museum') {
      return canDonate(id) ? `<div class="acts"><button class="btn" data-don="${esc(id)}">🦉 기증하기</button></div>` : '<div class="why">기증할 수 없거나 이미 기증했어요</div>';
    }
    return '';
  };

  return {
    kind: D.kind, title: D.title, icon: D.icon, color: D.color, defaultTab: D.defaultTab,
    tabs: () => BAG_TABS,
    meta: () => (mode.from === 'shop' ? `${shopInfo(mode.shop).icon} ${shopInfo(mode.shop).name} 앞 · ${view().text}` : mode.from === 'museum' ? `🏛️ 박물관 앞 · ${view().text}` : view().text),
    onOpen(arg) { mode = bagModeOf(arg); },
    onClose() { mode = { from: null }; },
    render(body, pc) {
      const { esc, fmt } = pc.h;
      const E = econOf(game);
      const tab = pickTab(pc.tab, BAG_TABS, D.defaultTab);
      const v = view();
      const keys = bagKeys(game);
      const ids = keys.filter((k) => bagTabMatch(tab, bagKind(game, k)))
        .sort((a, b) => (look.species(a)?.rarity ?? 0) - (look.species(b)?.rarity ?? 0) || look.name(a).localeCompare(look.name(b), 'ko'));
      // 쓴 칸 / 전체 + 도구 벨트(5칸)
      const belt = (E?.bag?.belt ? safe(() => E.bag.belt(), [] as string[]) : Object.keys(st.bag).filter((k) => k.startsWith('tool_') && st.bag[k] > 0)).slice(0, BAG.belt);
      const head = `<div class="baghead"><div class="belt dl-card"><span>🧰 도구 벨트</span>${belt.map((id) => `<div class="bi" title="${esc(look.name(id))}">${look.ico(id)}</div>`).join('')}${'<div class="bi e"></div>'.repeat(Math.max(0, BAG.belt - belt.length))}</div>
        <div class="cap dl-card${v.full ? ' full' : ''}"><span>🎒 ${fmt(v.used)} / ${fmt(v.size)}칸</span><div class="bar"><i style="width:${v.ratio * 100}%"></i></div>${v.full ? '<small>꽉 찼어요!</small>' : `<small>${fmt(v.free)}칸 남음</small>`}</div></div>`;
      const sel = pc.sel && st.bag[pc.sel] ? pc.sel : null;
      let selHtml = '';
      if (sel) {
        const s = look.species(sel);
        const pr = price(sel);
        const vt = splitVariant(sel).variant;
        const where = mode.from ? '' : ' · 팔기는 꽥꽥상회, 기증은 박물관에서!';
        selHtml = `<div class="hint dl-card"><div class="ico" style="--cc:${look.color(sel)}">${thumbHtml(env, sel, look.ico(sel))}</div><div class="grow">
          <div style="font-size:22px">${esc(look.name(sel))} ×${fmt(st.bag[sel])}</div>
          <small>${s ? `${'★'.repeat(s.rarity)} · ` : ''}${pr ? `팔면 🪙 ${fmt(pr)}` : '팔 수 없는 물건'}${vt ? ` · ${VARIANT_TAIL[vt]}` : ''}${where}</small></div>${actHtml(sel, pc)}</div>`;
      }
      const tag = mode.from === 'shop' ? (id: string) => { const p = price(id); return p > 0 ? `<div class="sm pr">🪙 ${fmt(p)}</div>` : '<div class="sm pr no">못 팔아요</div>'; }
        : mode.from === 'museum' ? (id: string) => (canDonate(id) ? '<div class="badge don">기증 가능</div>' : '') : () => '';
      const cells = ids.map((id) => {
        const s = look.species(id);
        const vt = splitVariant(id).variant;
        return `<div class="cell${sel === id ? ' sel' : ''}" data-it="${esc(id)}" style="--cc:${look.color(id)}"><div class="cnt">×${fmt(st.bag[id])}</div>${vt ? `<div class="vt">${Array.from(VARIANT_TAIL[vt])[0]}</div>` : ''}
          <div class="ico">${thumbHtml(env, id, look.ico(id))}</div><div class="nm">${esc(look.name(id))}</div>${s ? `<div class="sm">${'★'.repeat(s.rarity)}</div>` : ''}${tag(id)}</div>`;
      }).join('');
      const empty = !keys.length;
      body.innerHTML = head + selHtml + `<div class="grid">${empty ? emptyBag('가방이 텅 비었어요!', '물고기·곤충·과일을 모아서 꽥꽥상회에 팔아 봐요', pc) : cells}${
        tab === 'all' || empty ? slots(empty ? v.size : v.free) : ''}</div>${!empty && !ids.length ? '<div class="note">이 탭엔 아직 아무것도 없어요</div>' : ''}`;
      bind(body, 'it', (id) => pc.setSel(pc.sel === id ? null : id));
      // 상점·박물관 앞에서만 붙는 버튼
      const shop = mode.from === 'shop' ? mode.shop : 'quack';
      const sold = (got: number | undefined, what: string) => {
        if (got && got > 0) { game.ui.toast(`${what} 팔았다! +${fmt(got)}코인`); pc.h.confetti(body, ['#ffcf4a', '#fff3a0', '#fff'], 18); }
        pc.rerender();
      };
      bind(body, 'sell', (id) => sold(call<number>(econOf(game), 'sell', id, 1, shop), look.name(id)));
      bind(body, 'sell-n', (id) => sold(call<number>(econOf(game), 'sell', id, st.bag[id] ?? 0, shop), `${look.name(id)} 몽땅`));
      bind(body, 'don', (id) => {
        const base = splitVariant(id).id;
        if (call<boolean>(econOf(game), 'donate', base)) {
          game.ui.toast(`${look.name(base)} 기증 완료! 스탬프 쾅!`);
          pc.h.confetti(body, ['#c59bff', '#ffe58a', '#fff'], 30);
        } else game.ui.toast('앗, 지금은 기증할 수 없어요 💦');
        pc.rerender();
      });
    },
  };
}
