// economy wave 4 창 — 두근두근 캡슐머신('capsule') · 가방이 꽉 찼어요('bagfull') · 피규어 공방('figure') · 버프 칩.
// game.hud.registerPanel / registerChip 으로 붙인다(그리기는 hud 렌더러, 글씨·버튼 모양은 hud 공용 클래스를 쓴다).
// 캡슐머신 연출: 돌리기 → 머신이 덜컹(0.9초) → 캡슐이 반으로 톡 열리며 상품 + 색종이. 확률은 창 아래에 공개한다.
import type { Game } from '../../core/game';
import type { PanelCtx, PanelDef, ChipDef, Cost } from '../../core/api';
import { splitVariant } from '../../core/api';
import { GOODS, itemDef } from './data';
import { capsuleOddsTable, CAPSULE_POOL, GRADE_NAME, GRADE_COLOR, KIND_NAME, CAPSULE_PITY, type CapsuleGrade } from './capsule';
import { buffDef, leftText } from './buffs';
import { FIGURE_NEED } from './keep';
import type { P1Api, CapsuleLoot } from './p1';

export interface PanelDeps {
  game: Game;
  p1: P1Api;
  stars(): number;
  buy(id: string): boolean;
  canBuy(id: string): { ok: boolean; why?: string };
  shopPrice(id: string): Cost;
  nameOf(id: string): string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

/** 창 안에서만 쓰는 꾸밈(한 번만 넣는다) */
const CSS = `
.ecap { display:flex; gap:18px; align-items:stretch; flex-wrap:wrap; }
.ecap-mach { position:relative; width:210px; height:250px; flex:none; margin:0 auto; }
.ecap-dome { position:absolute; left:25px; top:0; width:160px; height:150px; border-radius:50% 50% 44% 44%; background:radial-gradient(circle at 35% 30%, #ffffffee, #e9fbffaa 45%, #bfe9ffaa); box-shadow: inset 0 -8px 0 #9fd6f0aa, 0 4px 0 #f0c878; overflow:hidden; }
.ecap-dome i { position:absolute; width:34px; height:34px; border-radius:50%; box-shadow: inset 0 -5px 0 #0001; }
.ecap-dome i::after { content:''; position:absolute; left:0; right:0; bottom:0; height:50%; border-radius:0 0 34px 34px; background:#fff; opacity:.9; }
.ecap-body { position:absolute; left:15px; top:132px; width:180px; height:110px; border-radius:36px; background:linear-gradient(#ffb3c8,#ff9fb8); box-shadow: inset 0 -8px 0 #f08aa6; }
.ecap-face { position:absolute; left:58px; top:22px; width:64px; height:30px; }
.ecap-face b { position:absolute; top:0; width:12px; height:16px; border-radius:50%; background:#3d3a4a; }
.ecap-face b::after { content:''; position:absolute; left:3px; top:3px; width:4px; height:4px; border-radius:50%; background:#fff; }
.ecap-face b:nth-child(1){ left:8px } .ecap-face b:nth-child(2){ right:8px }
.ecap-face u { position:absolute; top:16px; width:14px; height:8px; border-radius:50%; background:#ff9fb8; filter:brightness(1.12); opacity:.9 }
.ecap-face u:nth-of-type(1){ left:-6px } .ecap-face u:nth-of-type(2){ right:-6px }
.ecap-slot { position:absolute; left:70px; top:66px; width:40px; height:26px; border-radius:14px; background:#7a5a8a; box-shadow: inset 0 4px 0 #0003, 0 0 0 4px #ffd36b; }
.ecap-crank { position:absolute; right:-8px; top:30px; width:26px; height:26px; border-radius:50%; background:#ffcf4a; box-shadow: inset 0 -4px 0 #e0a72a; transform-origin:-10px 13px; }
.ecap-mach.spin .ecap-body, .ecap-mach.spin .ecap-dome { animation: ecap-shake .18s ease-in-out 5; }
.ecap-mach.spin .ecap-crank { animation: ecap-crank .9s ease-in-out; }
@keyframes ecap-shake { 0%,100%{ transform:translate(0,0) rotate(0) } 25%{ transform:translate(-3px,1px) rotate(-2deg) } 75%{ transform:translate(3px,-1px) rotate(2deg) } }
@keyframes ecap-crank { to { transform: rotate(720deg) } }
.ecap-side { flex:1; min-width:240px; display:flex; flex-direction:column; gap:10px; }
.ecap-res { display:flex; align-items:center; gap:14px; padding:12px 14px; border-radius:18px; background:#fff8e8; box-shadow: inset 0 -4px 0 #f1e2c4; min-height:86px; }
.ecap-ball { position:relative; width:72px; height:72px; flex:none; }
.ecap-ball .t, .ecap-ball .b { position:absolute; left:0; width:72px; height:36px; }
.ecap-ball .t { top:0; border-radius:36px 36px 0 0; background:var(--gc); box-shadow: inset 0 6px 0 #fff6; }
.ecap-ball .b { bottom:0; border-radius:0 0 36px 36px; background:#fff; box-shadow: inset 0 -5px 0 #0001; }
.ecap-ball .p { position:absolute; inset:0; display:grid; place-items:center; font-size:34px; opacity:0; transform:scale(.4); }
.ecap-ball.open .t { animation: ecap-top .5s ease-out forwards; } .ecap-ball.open .b { animation: ecap-bot .5s ease-out forwards; }
.ecap-ball.open .p { animation: ecap-pop .45s .2s cubic-bezier(.3,1.6,.5,1) forwards; }
@keyframes ecap-top { to { transform: translate(-14px,-18px) rotate(-28deg); opacity:.0 } }
@keyframes ecap-bot { to { transform: translate(12px,16px) rotate(22deg); opacity:.0 } }
@keyframes ecap-pop { to { opacity:1; transform:scale(1) } }
.ecap-res .g { display:inline-block; padding:1px 10px; border-radius:999px; color:#fff; font-size:14px; background:var(--gc); box-shadow: 0 2px 0 #0002; }
.ecap-odds { display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; font-size:14px; }
.ecap-odds div { padding:6px 8px; border-radius:12px; background:#fff8e8; box-shadow: inset 0 -3px 0 #f1e2c4; }
.ecap-got { display:flex; flex-wrap:wrap; gap:4px; font-size:20px; }
.ecap-got span { width:30px; height:30px; display:grid; place-items:center; border-radius:10px; background:#fff8e8; }
.ecap-got span.no { filter:grayscale(1) opacity(.35); }
.ebuffs { display:flex; flex-direction:column; gap:6px; }
.ebuffs .chip { padding:4px 12px 4px 6px; font-size:15px; }
.ebuffs .chip .ci { width:26px; height:26px; font-size:15px; }
.ebuffs .chip small { opacity:.75; }
`;
let cssDone = false;
const injectCss = () => {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.id = 'econ-p1-style';
  s.textContent = CSS;
  document.head.appendChild(s);
};

/** 돔 속 캡슐 공(정해진 자리 — 매번 같다) */
const DOME_BALLS = [[14, 92], [50, 104], [88, 98], [118, 86], [30, 60], [68, 66], [104, 54], [52, 30], [86, 22], [20, 26]]
  .map(([x, y], i) => `<i style="left:${x}px;top:${y}px;background:${['#ff9fb8', '#8fd3ff', '#ffe08a', '#b9f0a8', '#d9c8ff'][i % 5]}"></i>`).join('');

export function registerP1Panels(d: PanelDeps) {
  const { game, p1 } = d;
  const hud = game.hud;
  if (!hud) return;

  // ── 캡슐머신 ──
  let last: CapsuleLoot | null = null;
  let spinning = false;
  const capsulePanel: PanelDef = {
    kind: 'capsule', title: '두근두근 캡슐머신', color: '#ff7a9a', icon: '🎰', wide: true,
    meta: () => `🎫 ${fmt(p1.capsule.tickets)} · ⭐ ${fmt(d.stars())}`,
    onOpen() { injectCss(); last = null; spinning = false; },
    render(body: HTMLElement, pc: PanelCtx) {
      injectCss();
      const tickets = p1.capsule.tickets;
      const canTicket = d.canBuy('capsule_ticket');
      const got = p1.capsule.got();
      const res = last
        ? `<div class="ecap-ball open" style="--gc:${GRADE_COLOR[last.grade]}"><div class="t"></div><div class="b"></div><div class="p">${last.icon}</div></div>
           <div class="grow"><span class="g" style="--gc:${GRADE_COLOR[last.grade]}">${GRADE_NAME[last.grade]}${last.pity ? ' · 천장!' : ''}</span>
           <div class="nm" style="font-size:20px;margin-top:4px">${esc(last.name)}</div>
           <div class="sm">${last.dup ? `이미 있어서 반짝별 ${last.stars}개로 바꿨어요 ⭐` : `${KIND_NAME[last.kind]} — 가방에 넣었어요!`}</div></div>`
        : `<div class="ecap-ball" style="--gc:#ffd36b"><div class="t"></div><div class="b"></div></div>
           <div class="grow"><div class="nm">무엇이 나올까?</div><div class="sm">의상 · 탈것 스킨 · 한정 가구가 들어 있어요</div></div>`;
      const odds = capsuleOddsTable();
      const byGrade = ([1, 2, 3] as CapsuleGrade[]).map((g) => {
        const rows = odds.filter((o) => o.grade === g);
        const pct = rows.reduce((a, o) => a + o.pct, 0);
        return `<div><b style="color:${GRADE_COLOR[g]}">${GRADE_NAME[g]} ${pct.toFixed(0)}%</b><br>${rows.map((o) => `${KIND_NAME[o.kind]} ${o.pct.toFixed(1)}%`).join('<br>')}</div>`;
      }).join('');
      const gotCells = CAPSULE_POOL.map((p) => `<span class="${got[p.id] ? '' : 'no'}" title="${esc(p.name)} (${GRADE_NAME[p.grade]})">${p.icon}</span>`).join('');
      const nGot = CAPSULE_POOL.filter((p) => got[p.id]).length;
      body.innerHTML = `<div class="ecap">
        <div class="ecap-mach${spinning ? ' spin' : ''}"><div class="ecap-dome">${DOME_BALLS}</div>
          <div class="ecap-body"><div class="ecap-face"><b></b><b></b><u></u><u></u></div><div class="ecap-slot"></div><div class="ecap-crank"></div></div></div>
        <div class="ecap-side">
          <div class="ecap-res">${res}</div>
          <div class="acts">
            <button class="btn gold big${tickets > 0 && !spinning ? '' : ' off'}" data-spin="1">🎫 돌리기! (티켓 ${fmt(tickets)})</button>
            <button class="btn${canTicket.ok ? '' : ' off'}" data-ticket="1">⭐ 20 → 🎫 1</button>
          </div>
          ${!canTicket.ok && canTicket.why && tickets <= 0 ? `<div class="why">${esc(canTicket.why)}</div>` : ''}
          <div class="sm">특별까지 앞으로 ${p1.capsule.pityLeft}번 (${CAPSULE_PITY + 1}번째엔 꼭 특별!) · 모은 상품 ${nGot}/${CAPSULE_POOL.length}</div>
          <div class="ecap-odds">${byGrade}</div>
          <div class="ecap-got">${gotCells}</div>
        </div></div>`;
      body.querySelector('[data-ticket]')?.addEventListener('click', () => {
        if (d.buy('capsule_ticket')) game.ui?.toast?.('캡슐 티켓 1장! 🎫');
        pc.rerender();
      });
      body.querySelector('[data-spin]')?.addEventListener('click', () => {
        if (spinning) return;
        if (p1.capsule.tickets <= 0) { game.ui?.toast?.('캡슐 티켓이 없어요 🎫'); return; }
        const r = p1.capsule.roll();
        if (!r) { pc.rerender(); return; }
        spinning = true;
        last = null;
        try { game.audio?.sfx?.('chest-shake'); } catch { /* 소리 없음 */ }
        pc.rerender();
        setTimeout(() => {
          spinning = false;
          last = r;
          if (!hud.isOpen('capsule')) return;
          pc.rerender();
          try { game.audio?.sfx?.(r.grade === 3 ? 'achievement' : 'unlock'); } catch { /* 소리 없음 */ }
          const box = body.querySelector('.ecap-res') as HTMLElement | null;
          if (box) pc.h.confetti(box, r.grade === 3 ? ['#ffcf4a', '#fff3a0', '#ff9fb8', '#8fd3ff'] : [GRADE_COLOR[r.grade], '#fff'], r.grade === 3 ? 40 : 18);
        }, 950);
      });
    },
  };
  hud.registerPanel(capsulePanel);

  // ── 가방이 꽉 찼어요(놓아주기 · 버리기 · 보관함) ──
  const kindOf = (id: string) => {
    const s = game.state.species.get(splitVariant(id).id);
    return s && s.category !== 'item' ? 'creature' : id.startsWith('tool_') ? 'tool' : 'item';
  };
  const ico = (id: string) => {
    const b = splitVariant(id).id;
    return itemDef(b)?.icon ?? GOODS[b]?.icon ?? ({ fish: '🐟', bug: '🦋', insect: '🦋', sea: '🐙', dino: '🦕', fossil: '🦴', space: '🪐' } as Record<string, string>)[game.state.species.get(b)?.category ?? ''] ?? '🎁';
  };
  const label = (id: string) => {
    const v = splitVariant(id).variant;
    return `${d.nameOf(id)}${v === 'shiny' ? ' ✨' : v === 'crown' ? ' 👑' : v === 'tiny' ? ' (꼬마)' : ''}`;
  };
  const bagFull: PanelDef = {
    kind: 'bagfull', title: '가방이 꽉 찼어요!', color: '#ff9b9b', icon: '🎒',
    meta: () => { const b = game.econ?.bag; return b ? `${b.used}/${b.size}칸` : ''; },
    render(body: HTMLElement, pc: PanelCtx) {
      const arg = (pc.arg ?? {}) as { id?: string; rescue?: boolean };
      const want = p1.rescuePending();
      const bag = game.state.bag;
      const keys = Object.keys(bag).filter((k) => (bag[k] ?? 0) > 0 && kindOf(k) !== 'tool' && !k.startsWith('cos_') && !k.startsWith('skin_'))
        .sort((a, b) => (kindOf(a) === kindOf(b) ? 0 : kindOf(a) === 'creature' ? -1 : 1) || d.nameOf(a).localeCompare(d.nameOf(b), 'ko'));
      const head = want
        ? `<div class="hint dl-card"><div class="ico" style="--cc:#ffd9e6">${ico(want)}</div><div class="grow">방금 잡은 <b>${esc(label(want))}</b>이(가) 들어갈 자리가 없어요!
             <br><small>하나를 놓아주거나 버리면 바로 쏙 넣어 줄게요</small></div>
             <div class="acts"><button class="btn" data-letgo="1">🌿 ${esc(d.nameOf(want))} 놓아주기</button></div></div>`
        : `<div class="hint dl-card"><div class="ico" style="--cc:#ffd9e6">🎒</div><div class="grow">${arg.id ? `<b>${esc(label(arg.id))}</b>을(를) 못 넣었어요. ` : ''}가방을 조금 비워 볼까요?
             <br><small>생물은 놓아주고, 재료는 땅에 내려놓을 수 있어요(E 로 다시 주워요)</small></div></div>`;
      const cells = keys.map((k) => {
        const n = bag[k] ?? 0, cr = kindOf(k) === 'creature';
        const canStore = p1.storage.room(k, 1) > 0;
        return `<div class="cell" style="--cc:#fff3c4"><div class="cnt">×${fmt(n)}</div><div class="ico">${ico(k)}</div><div class="nm">${esc(label(k))}</div>
          ${cr ? `<button class="btn" data-release="${esc(k)}">🌿 놓아주기</button>` : `<button class="btn" data-drop="${esc(k)}">🧺 버리기</button>`}
          ${n > 1 && !cr ? ` <button class="btn" data-dropall="${esc(k)}">몽땅</button>` : ''}
          ${canStore ? `<button class="btn" data-store="${esc(k)}" title="집 보관함으로">📦 보관</button>` : ''}</div>`;
      }).join('');
      body.innerHTML = head + `<div class="grid">${cells || '<div class="note" style="grid-column:1/-1">비울 게 없어요</div>'}</div>`;
      const on = (attr: string, fn: (id: string) => void) => body.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((el) => el.addEventListener('click', () => { fn(el.dataset[attr.replace(/-./g, (m) => m[1].toUpperCase())] ?? ''); if (hud.isOpen('bagfull')) pc.rerender(); }));
      on('release', (id) => p1.release(id));
      on('drop', (id) => p1.drop(id, 1));
      on('dropall', (id) => p1.drop(id));
      on('store', (id) => p1.storage.put(id, 1));
      body.querySelector('[data-letgo]')?.addEventListener('click', () => { p1.dismissRescue(); pc.close(); });
    },
  };
  hud.registerPanel(bagFull);

  // ── 피규어 공방 ──
  const figure: PanelDef = {
    kind: 'figure', title: '피규어 공방', color: '#ffb3c6', icon: '🧸',
    meta: () => `같은 친구 ${FIGURE_NEED}마리 = 피규어 1`,
    render(body: HTMLElement, pc: PanelCtx) {
      const list = p1.figureList();
      const cells = list.map((c) => {
        const ok = c.points >= FIGURE_NEED;
        const pct = Math.min(100, (c.points / FIGURE_NEED) * 100);
        return `<div class="cell${ok ? '' : ' dim'}" style="--cc:#ffd9e6"><div class="ico">${ico(c.id)}</div><div class="nm">${esc(d.nameOf(c.id))}</div>
          <div class="sm">${Math.min(c.points, FIGURE_NEED)}/${FIGURE_NEED} <span style="display:inline-block;width:56px;height:7px;border-radius:7px;background:#f1e2c4;vertical-align:middle;overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:linear-gradient(90deg,#ffb3c6,#ffd36b)"></i></span></div>
          <button class="btn${ok ? ' gold' : ' off'}" data-fig="${esc(c.id)}">🧸 만들기</button></div>`;
      }).join('');
      body.innerHTML = `<div class="hint dl-card"><div class="ico" style="--cc:#ffd9e6">🧸</div><div class="grow">통통 공방장: 같은 친구 ${FIGURE_NEED}마리를 데려오면 반들반들 피규어로 만들어 줄게!
        <br><small>꼬마 개체는 2마리로 쳐요 · 반짝이·왕관은 소중하니까 안 써요</small></div></div>
        <div class="grid">${cells || '<div class="note" style="grid-column:1/-1">아직 데려온 친구가 없어요 — 같은 종을 모아 와요!</div>'}</div>`;
      body.querySelectorAll<HTMLElement>('[data-fig]').forEach((el) => el.addEventListener('click', () => {
        if (p1.figurine(el.dataset.fig ?? '')) pc.h.confetti(body, ['#ffb3c6', '#ffd36b', '#fff'], 24);
        pc.rerender();
      }));
    },
  };
  hud.registerPanel(figure);

  // ── 버프 칩(켜진 버프 + 남은 게임 시간) ──
  let acc = 1;
  const chip: ChipDef = {
    id: 'econ:buffs', order: 25,
    render(el) { el.innerHTML = '<div class="ebuffs"></div>'; injectCss(); },
    update(el, dt) {
      acc += dt;
      if (acc < 0.5) return;
      acc = 0;
      const box = el.firstElementChild as HTMLElement | null;
      if (!box) return;
      const list = p1.buffs();
      const now = game.env?.gameSec ?? game.time ?? 0;
      const html = list.map((b) => {
        const def = buffDef(b.name);
        return `<div class="chip dl-card" title="${esc(def.label)}: ${esc(def.desc)}"><div class="ci" style="background:radial-gradient(circle at 35% 30%, #fff, ${def.color})">${def.icon}</div>${esc(def.label)} <small>${leftText(b.until, now)}</small></div>`;
      }).join('');
      if (box.innerHTML !== html) box.innerHTML = html;
      el.style.display = list.length ? '' : 'none';
    },
  };
  hud.registerChip(chip);
}
