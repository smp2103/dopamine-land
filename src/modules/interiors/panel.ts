// 집 보관함 창(kind 'storage') — 탭: 보관함(econ.storage 넣기·꺼내기) · 진열장(econ.display — 가방·보관함 속 친구) · 꾸미기(벽지·바닥 견본) · 집 점수.
// econ.storage 가 아직 없으면(econ-p1 이전) flags.interiors.chest 로 대신 보관하고, 생기면 거기로 옮긴다.
import type { PanelDef, PanelCtx, StorageApi } from '../../core/api';
import { splitVariant } from '../../core/api';
import type { Game } from '../../core/game';
import { WALLPAPERS, FLOORS, THEME_KO, SCORE_STARS, STAGE_NAME, type Theme } from './logic';
import { readFlags, displayKeys, displayCap, displayCandidates, type HouseInterior } from './house';

/** 집 보관함 칸 수(GDD 4.2 — 200칸) */
export const CHEST_SIZE = 200;

/** econ.storage 또는 대신 쓰는 보관함 */
export function storageOf(game: Game): StorageApi & { fallback: boolean } {
  const econ = game.econ;
  const S = econ?.storage;
  if (S && typeof S.put === 'function' && typeof S.take === 'function') {
    migrateChest(game, S);
    // 못 옮긴 임시 보관분(econ 보관함이 꽉 찼을 때)도 같이 보이고, 꺼내면 가방으로
    const left = () => readFlags(game).chest;
    return {
      size: S.size, fallback: false,
      list: () => {
        const m = new Map<string, number>();
        for (const r of S.list()) m.set(r.id, (m.get(r.id) ?? 0) + r.n);
        for (const [id, n] of Object.entries(left())) if (n > 0) m.set(id, (m.get(id) ?? 0) + n);
        return [...m].map(([id, n]) => ({ id, n })).sort((a, b) => (a.id < b.id ? -1 : 1));
      },
      put: (id, n) => S.put(id, n),
      take: (id, n) => {
        const c = left();
        const fromLeft = Math.min(Math.floor(n), c[id] ?? 0);
        let ok = false;
        if (fromLeft > 0) {
          const got = econ?.give ? econ.give(id, fromLeft, 'storage') : (game.state.addItem(id, fromLeft), fromLeft);
          if (got > 0) { c[id] -= got; if (c[id] <= 0) delete c[id]; game.state.save(); ok = true; }
          if (got < fromLeft) return ok;
        }
        const rest = Math.floor(n) - fromLeft;
        return rest > 0 ? S.take(id, rest) || ok : ok;
      },
    };
  }
  const st = game.state;
  const chest = () => readFlags(game).chest;
  return {
    fallback: true,
    size: CHEST_SIZE,
    list: () => Object.entries(chest()).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n })).sort((a, b) => (a.id < b.id ? -1 : 1)),
    put: (id, n) => {
      const have = st.bag[id] ?? 0, c = chest();
      n = Math.min(Math.floor(n), have);
      if (n <= 0) return false;
      if (!(id in c) && Object.keys(c).filter((k) => c[k] > 0).length >= CHEST_SIZE) { game.ui.toast('보관함이 꽉 찼어요 🧰'); return false; }
      st.addItem(id, -n);
      c[id] = (c[id] ?? 0) + n;
      st.save();
      return true;
    },
    take: (id, n) => {
      const c = chest();
      n = Math.min(Math.floor(n), c[id] ?? 0);
      if (n <= 0) return false;
      const got = econ?.give ? econ.give(id, n, 'storage') : (st.addItem(id, n), n);
      if (got <= 0) return false;
      c[id] -= got;
      if (c[id] <= 0) delete c[id];
      st.save();
      return true;
    },
  };
}
/** 대신 보관하던 것 → econ.storage 로(가방을 거쳐 넣는다 — 못 넣으면 가방에서 도로 빼서 임시 보관함에 남긴다) */
function migrateChest(game: Game, S: StorageApi) {
  const f = readFlags(game);
  const ids = Object.keys(f.chest);
  if (!ids.length) return;
  const room = (S as StorageApi & { room?: (id: string, n?: number) => number }).room;
  for (const id of ids) {
    const n = f.chest[id];
    if (!(n > 0)) { delete f.chest[id]; continue; }
    // 들어갈 자리가 없으면 손대지 않는다(econ 이 '꽉 찼어요' 를 매번 외치지 않게)
    if (typeof room === 'function' && !(room(id, n) >= n)) continue;
    game.state.addItem(id, n);
    let ok = false;
    try { ok = S.put(id, n) !== false; } catch (e) { console.error('[interiors storage migrate]', e); }
    if (ok) delete f.chest[id];
    else game.state.addItem(id, -n);
  }
  game.state.save();
}

const isTool = (game: Game, id: string) => game.econ?.bag?.isTool?.(id) ?? id.startsWith('tool_');

export function storagePanel(game: Game, house: () => HouseInterior | null): PanelDef {
  const tabs = () => [
    { id: 'chest', label: '보관함', icon: '🧰' },
    { id: 'display', label: '진열장', icon: '🏺', badge: `${displayKeys(game).length}/${displayCap(game)}` },
    { id: 'deco', label: '벽지·바닥', icon: '🎨' },
    { id: 'score', label: '집 점수', icon: '🏠' },
  ];
  return {
    kind: 'storage', title: '우리 집', icon: '🏠', color: '#ffb37a', defaultTab: 'chest', wide: true,
    tabs,
    meta: () => { const f = readFlags(game); return `집 점수 ${f.score}점 ${'★'.repeat(f.stars)}`; },
    render(body: HTMLElement, pc: PanelCtx) {
      const { esc } = pc.h;
      const tab = pc.tab ?? 'chest';
      const cell = (id: string, sub: string, btn: string, act: string, o: { on?: boolean; n?: number } = {}) =>
        `<div class="cell${o.on ? '' : ''}" style="--cc:${esc(pc.h.color(id))}">${o.n ? `<span class="cnt">${o.n}</span>` : ''}<div class="ico">${pc.h.thumb?.(id) ? `<img class="th" src="${pc.h.thumb(id)}" alt="">` : pc.h.ico(id)}</div>`
        + `<div class="nm">${esc(pc.h.name(id))}</div><div class="sm">${esc(sub)}</div><button class="btn${o.on ? ' gold' : ''}" data-act="${act}" data-id="${esc(id)}">${btn}</button></div>`;
      let html = '';
      if (tab === 'chest') {
        const S = storageOf(game);
        const inChest = S.list();
        const bag = Object.entries(game.state.bag).filter(([k, n]) => n > 0 && !isTool(game, k)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
        html += `<div class="hint dl-card"><div class="ico" style="--cc:#ffe2c0">🧰</div><div class="grow">가방이 꽉 차면 여기에 맡겨 둬요! <b>${inChest.length}/${S.size}칸</b>`
          + `<small>가구·재료·친구 모두 들어가요 · 꺼내면 가방으로 돌아와요</small></div><div class="acts"><button class="btn" data-act="putall">🎒 재료 몽땅 넣기</button></div></div>`;
        html += `<div class="grid"><div class="sec">🧰 보관함 속</div>${inChest.map((r) => cell(r.id, `${r.n}개`, '꺼내기', 'take', { n: r.n })).join('') || '<div class="note" style="grid-column:1/-1">아직 비어 있어요</div>'}`;
        html += `<div class="sec">🎒 가방 속</div>${bag.map(([id, n]) => cell(id, `${n}개`, '넣기', 'put', { n })).join('') || '<div class="note" style="grid-column:1/-1">가방이 비었어요</div>'}</div>`;
      } else if (tab === 'display') {
        const st = game.state;
        const shown = displayKeys(game), cap = displayCap(game);
        const base = (k: string) => splitVariant(k).id;
        const rar = (k: string) => st.species.get(base(k))?.rarity ?? 0;
        const sorter = (a: string, b: string) => rar(b) - rar(a) || (a < b ? -1 : 1);
        const onCase = [...new Set(shown)].sort(sorter);
        const owned = displayCandidates(game).filter((k) => !onCase.includes(k)).sort(sorter);
        const stars = (k: string) => '★'.repeat(rar(k));
        html += `<div class="hint dl-card"><div class="ico" style="--cc:#e8dcff">🏺</div><div class="grow">진열장에 친구 <b>${shown.length}/${cap}</b>마리
          <small>가방·보관함 속 친구를 집 진열장에 세워 둬요 · 서로 다른 친구마다 집 점수 +6 · 빼면 가방으로 돌아와요</small></div></div><div class="grid">`;
        if (onCase.length) html += `<div class="sec">🏺 진열 중</div>${onCase.map((k) => cell(k, stars(k), '빼기', 'undisp', { on: true, n: shown.filter((x) => x === k).length })).join('')}`;
        html += `<div class="sec">🎒 가방·보관함 속 친구</div>${owned.map((k) => cell(k, stars(k), '진열하기', 'disp')).join('')
          || '<div class="note" style="grid-column:1/-1">진열할 친구가 없어요. 낚시·채집으로 친구를 데려와요!</div>'}`;
        html += '</div>';
      } else if (tab === 'deco') {
        const f = readFlags(game);
        const sw = (s: { id: string; name: string; a: string; b: string; theme: Theme }, on: boolean, act: string) =>
          `<div class="cell" data-act="${act}" data-id="${s.id}" style="--cc:${s.a};${on ? 'border-color:#ffb37a;box-shadow:0 4px 0 #ff9f5a' : ''}"><div class="ico" style="background:repeating-linear-gradient(45deg,${s.a} 0 10px,${s.b} 10px 20px)">${on ? '✔️' : ''}</div>`
          + `<div class="nm">${esc(s.name)}</div><div class="sm">${THEME_KO[s.theme].icon} ${THEME_KO[s.theme].name}</div></div>`;
        html += `<div class="hint dl-card"><div class="ico" style="--cc:#ffd9e6">🎨</div><div class="grow">벽지와 바닥을 골라요!<small>가구가 가장 많은 테마와 맞추면 집 점수가 25점씩 올라요</small></div></div>`;
        html += `<div class="grid"><div class="sec">🧱 벽지</div>${WALLPAPERS.map((s) => sw(s, s.id === f.wall, 'wall')).join('')}<div class="sec">🪵 바닥</div>${FLOORS.map((s) => sw(s, s.id === f.floor, 'floor')).join('')}</div>`;
      } else {
        const h = house();
        const sc = h?.score;
        const f = readFlags(game);
        const next = SCORE_STARS.find((v) => v > f.score);
        html += `<div class="hint dl-card"><div class="ico" style="--cc:#fff0b8">🏠</div><div class="grow"><div style="font-size:24px">집 점수 <b>${f.score}점</b> <span style="color:#ffb000">${'★'.repeat(f.stars)}</span>${'☆'.repeat(5 - f.stars)}</div>`
          + `<small>${h ? `${STAGE_NAME[Math.max(0, h.stage)] ?? ''} · ` : ''}${next ? `다음 별까지 ${next - f.score}점` : '최고 별 달성! 정말 멋진 집이에요 ✨'}</small>`
          + `<div class="bar${!next ? ' full' : ''}"><i style="width:${Math.min(100, (f.score / SCORE_STARS[SCORE_STARS.length - 1]) * 100)}%"></i></div></div></div>`;
        html += `<div class="grid"><div class="sec">📋 점수 내역</div>${(sc?.parts ?? []).map((p) => `<div class="cell" style="cursor:default"><div class="nm">${esc(p.label)}</div><div class="sm">+${p.pts}점</div></div>`).join('') || '<div class="note" style="grid-column:1/-1">가구를 놓으면 점수가 생겨요! 집 안에서 H 를 눌러 꾸며 봐요</div>'}`;
        const th = Object.entries(sc?.themes ?? {}) as Array<[Theme, number]>;
        if (th.length) html += `<div class="sec">🎀 테마</div>${th.sort((a, b) => b[1] - a[1]).map(([t, n]) => `<div class="cell" style="cursor:default"><div class="ico">${THEME_KO[t].icon}</div><div class="nm">${THEME_KO[t].name}</div><div class="sm">${n}개${n >= 3 ? ' · 보너스!' : ` · ${3 - n}개 더`}</div></div>`).join('')}`;
        html += '</div>';
      }
      body.innerHTML = html;
      body.onclick = (e) => {
        const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
        if (!el) return;
        const act = el.dataset.act!, id = el.dataset.id ?? '';
        const S = storageOf(game);
        const h = house();
        switch (act) {
          case 'put': if (S.put(id, game.state.bag[id] ?? 0)) game.audio?.sfx('pick'); break;
          case 'take': {
            const have = S.list().find((r) => r.id === id)?.n ?? 0;
            // econ.storage 는 실패하면 스스로 알려 준다 — 임시 보관함일 때만 말한다
            if (!S.take(id, have)) { if (S.fallback) game.ui.toast('가방에 자리가 없어요 🎒'); }
            else game.audio?.sfx('pick');
            break;
          }
          case 'putall': {
            let k = 0;
            for (const [bid, n] of Object.entries(game.state.bag)) {
              const base = splitVariant(bid).id;
              const sp = game.state.species.get(base);
              if (n > 0 && !isTool(game, bid) && (bid.startsWith('m_') || bid.startsWith('t_') || sp?.category === 'item' && !bid.startsWith('f_'))) { if (S.put(bid, n)) k++; }
            }
            game.ui.toast(k ? `재료 ${k}종을 보관함에 넣었어요 🧰` : '넣을 재료가 없어요');
            break;
          }
          case 'disp': if (h) h.setDisplay(id, true); else game.ui.toast('집 안에서 진열해요'); break;
          case 'undisp': h?.setDisplay(id, false); break;
          case 'wall': h?.setWall(id); game.audio?.sfx('ui-click'); break;
          case 'floor': h?.setFloor(id); game.audio?.sfx('ui-click'); break;
        }
        pc.rerender();
      };
    },
  };
}
