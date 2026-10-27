// islanddev 창 — 'dev'(섬 개발: 단계 · 조건 · 기부 · 별점 · 시설), 'travel'(비눗방울 정류장), 'yard'(마당 꾸미기 고르기).
// 그리기만 한다 — 규칙과 상태는 islanddev.ts 가 DevView 로 넘긴다.
import type { PanelDef, PanelCtx } from '../../core/api';
import { STAGES, STAGE_NS, YARD_DEFS, NODE_ICON, facilitiesOf, type DevIsland, type StageN, type YardKind } from './data';
import { reqProgress, starText, type Requirement, type TravelNode, type YardPiece } from './logic';

export interface RatingView { got: number; total: number; dexPct: number; deco: number; decoPct: number; score: number; stars: number }
export interface DevView {
  islands: readonly DevIsland[];
  name(island: string): string;
  color(island: string): string;
  stage(island: string): number;
  requirement(island: string): Requirement;
  /** 기부(다음 단계) — 성공하면 true */
  invest(island: string): boolean;
  rating(island: string): RatingView;
  /** 단계 새 생물(이름 · 이미 잡았나) */
  newSpecies(island: string, n: StageN): { name: string; known: boolean } | null;
  facilityOn(id: string): boolean;
  /** 지금 서 있는 섬(개발 섬이 아니면 null) */
  here(): DevIsland | null;
  // 빠른 이동
  nodes(): TravelNode[];
  nearNode(): TravelNode | null;
  go(id: string): boolean;
  dist(n: TravelNode): number;
  // 마당
  yardIsland(): DevIsland | null;
  pieces(island: string): YardPiece[];
  canAfford(k: YardKind, item?: string): boolean;
  costText(k: YardKind): string;
  furniture(): Array<{ id: string; n: number; name: string; icon: string }>;
  startPlace(k: YardKind | 'remove', item?: string): void;
  itemName(id: string): string;
  itemIcon(id: string): string;
  fmt(n: number): string;
  toast(text: string): void;
}

const CSS = `
.idv { font-size: 15px; color: #4a3b2a; }
.idv .i-hd { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.idv .i-hd .nm { font-size: 22px; }
.idv .i-hd .st { color: #ffb51e; font-size: 20px; letter-spacing: 1px; text-shadow: 0 1px 0 #fff; }
.idv .i-hd .sm { margin-left: auto; font-size: 13px; opacity: .8; text-align: right; line-height: 1.35; }
.idv .i-track { display: flex; gap: 6px; margin: 6px 0 10px; }
.idv .i-track .s { flex: 1; text-align: center; padding: 6px 2px; border-radius: 14px; background: #f3e6cc; font-size: 12px; position: relative; }
.idv .i-track .s b { display: block; font-size: 20px; }
.idv .i-track .s.done { background: linear-gradient(180deg, #c9f2c0, #8fdc9a); color: #2f6b3a; }
.idv .i-track .s.cur { background: linear-gradient(180deg, #fff2a8, #ffd36b); box-shadow: 0 0 0 3px #fff, 0 0 0 5px #ffd36b; }
.idv .i-card { background: #fffdf6; border-radius: 18px; padding: 10px 14px; box-shadow: 0 3px 0 #ecdcbc; margin-bottom: 8px; }
.idv .i-card h4 { margin: 0 0 4px; font-size: 18px; font-weight: normal; }
.idv .i-card .ds { font-size: 13px; opacity: .85; margin-bottom: 6px; }
.idv .i-rq { display: grid; grid-template-columns: 26px 1fr auto; gap: 2px 8px; align-items: center; margin: 4px 0; }
.idv .i-rq .ic { font-size: 18px; text-align: center; }
.idv .i-rq .v { font-size: 13px; }
.idv .i-rq .v.ok { color: #3f9a52; }
.idv .i-rq .bar { grid-column: 2 / 4; margin-top: 0; height: 9px; }
.idv .rq.or { opacity: .9; }
.idv .rq.or .lb::before { content: ''; }
.idv .i-go { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.idv .i-go .btn { font-size: 17px; padding: 6px 18px; }
.idv .i-sp { display: inline-flex; align-items: center; gap: 6px; background: #f6ecd8; border-radius: 12px; padding: 3px 10px; font-size: 13px; }
.idv .i-fac { display: flex; gap: 8px; flex-wrap: wrap; }
.idv .i-fac .f { background: #f6ecd8; border-radius: 12px; padding: 4px 10px; font-size: 13px; }
.idv .i-fac .f.on { background: #d8f5d0; }
.idv .i-nodes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.idv .i-node { display: flex; align-items: center; gap: 8px; background: #fffdf6; border-radius: 16px; padding: 8px 10px; box-shadow: 0 3px 0 #ecdcbc; }
.idv .i-node .i { font-size: 24px; }
.idv .i-node .t { flex: 1; line-height: 1.2; }
.idv .i-node .t small { display: block; opacity: .7; font-size: 12px; }
.idv .i-node.here { box-shadow: 0 0 0 3px #8fd3ff; }
.idv .i-yard { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.idv .i-yard .y { background: #fffdf6; border-radius: 16px; padding: 8px; text-align: center; box-shadow: 0 3px 0 #ecdcbc; cursor: pointer; }
.idv .i-yard .y .e { font-size: 28px; }
.idv .i-yard .y small { display: block; font-size: 11px; opacity: .75; line-height: 1.25; }
.idv .i-yard .y.off { opacity: .45; cursor: default; }
.idv .i-note { font-size: 13px; opacity: .8; margin: 6px 0; }
.idv .i-done5 { text-align: center; font-size: 20px; padding: 14px; }
`;
let cssIn = false;
function ensureCss() {
  if (cssIn || typeof document === 'undefined' || typeof document.createElement !== 'function' || !document.head) return;
  cssIn = true;
  const s = document.createElement('style');
  s.id = 'islanddev-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** data-x 버튼 묶기 */
function bindAll(body: HTMLElement, attr: string, fn: (v: string) => void) {
  body.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); fn(el.dataset[attr] ?? ''); }));
}

const CONFETTI = ['#ff9fb8', '#ffe58a', '#8fd3ff', '#b6e86a', '#c9b8ff', '#fff'];

// ───────────── 섬 개발 ─────────────
export function devPanel(v: DevView): PanelDef {
  let cur: string = 'home';
  return {
    kind: 'dev', title: '섬 개발', color: '#7fd18b', icon: '🏗️', defaultTab: 'home', wide: true,
    tabs: () => v.islands.map((id) => ({ id, label: v.name(id), icon: v.stage(id) > 0 ? STAGES[Math.min(5, v.stage(id)) as StageN].icon : '🏝️', badge: `${v.stage(id)}/5` })),
    meta: () => { const r = v.rating(cur); return `${starText(r.stars)}`; },
    onOpen(arg) { const a = arg as { island?: string } | null; if (a?.island) cur = a.island; },
    render(body: HTMLElement, pc: PanelCtx) {
      ensureCss();
      const { esc, fmt } = pc.h;
      const isl = (pc.tab && v.islands.includes(pc.tab as DevIsland) ? pc.tab : (pc.arg as { island?: string } | null)?.island ?? cur) as DevIsland;
      cur = isl;
      const done = v.stage(isl);
      const rt = v.rating(isl);
      const rq = v.requirement(isl);
      const track = STAGE_NS.map((n) => {
        const S = STAGES[n];
        const cls = n <= done ? 'done' : n === done + 1 ? 'cur' : '';
        return `<div class="s ${cls}"><b>${n <= done ? '✅' : S.icon}</b>${esc(S.name)}</div>`;
      }).join('');
      let main = '';
      if (rq.n) {
        const S = STAGES[rq.n];
        const lines = rq.lines.map((l) => {
          const p = Math.min(100, (l.have / Math.max(1, l.need)) * 100);
          return `<div class="i-rq${l.alt && l.id !== rq.lines.find((q) => q.alt === l.alt)?.id ? ' or' : ''}"><div class="ic">${l.icon}</div><div class="lb">${esc(l.label)}</div>
            <div class="v${l.ok ? ' ok' : ''}">${fmt(Math.min(l.have, l.need))} / ${fmt(l.need)}${l.ok ? ' ✔' : ''}</div><div class="bar"><i style="width:${p}%"></i></div></div>`;
        }).join('');
        const sp = v.newSpecies(isl, rq.n);
        const spHtml = sp ? `<span class="i-sp">🔓 새 친구: ${sp.known ? esc(sp.name) : '??? (실루엣)'}</span>` : '';
        const pct = Math.round(reqProgress(rq) * 100);
        main = `<div class="i-card"><h4>${S.icon} ${rq.n}단계 · ${esc(S.name)}</h4><div class="ds">${esc(S.desc)} — <b>${esc(S.effect)}</b></div>
          ${lines}
          <div class="i-go"><button class="btn${rq.ok ? ' gold' : ' off'}" data-invest="${esc(isl)}">${rq.n <= 3 ? '기부하기 💝' : rq.n === 4 ? '이사 오세요! 🏡' : '별 다섯 개! 🌟'}</button>
          <span class="i-note">${rq.ok ? '준비 완료! 눌러 봐요 ✨' : `진행 ${pct}%`}</span><span style="margin-left:auto">${spHtml}</span></div></div>`;
      } else {
        main = `<div class="i-card i-done5">🎉 ${esc(v.name(isl))} 개발 완료! 섬 별 다섯 개 ${starText(5)}</div>`;
      }
      const facs = facilitiesOf(isl).map((f) => `<span class="f${v.facilityOn(f.id) ? ' on' : ''}">${f.icon} ${esc(f.name)} — ${esc(f.bonus)}${v.facilityOn(f.id) ? ' ✔' : ''}</span>`).join('');
      body.innerHTML = `<div class="idv">
        <div class="i-hd"><span class="nm">🏝️ ${esc(v.name(isl))}</span><span class="st">${starText(rt.stars)}</span>
          <span class="sm">섬 도감 ${fmt(rt.got)}/${fmt(rt.total)} (${Math.floor(rt.dexPct)}%)<br>꾸미기 점수 ${fmt(rt.deco)} (${Math.floor(rt.decoPct)}%)</span></div>
        <div class="i-track">${track}</div>
        ${main}
        <div class="i-card"><h4>🏪 섬 특산 시설</h4><div class="i-fac">${facs || '<span class="f">—</span>'}</div>
          <div class="i-note">③ 단계를 마치면 시설이 문을 열어요. 별점 = 도감 60% + 꾸미기 40% · 마당 팻말에서 꾸며요 🌷</div></div>
      </div>`;
      bindAll(body, 'invest', (id) => {
        if (v.invest(id)) pc.h.confetti(body, CONFETTI, 90);
        pc.rerender();
      });
    },
  };
}

// ───────────── 비눗방울 정류장 ─────────────
export function travelPanel(v: DevView): PanelDef {
  return {
    kind: 'travel', title: '비눗방울 정류장', color: '#8fd3ff', icon: '🫧',
    meta: () => `${v.nodes().length}곳`,
    render(body: HTMLElement, pc: PanelCtx) {
      ensureCss();
      const { esc, fmt } = pc.h;
      const here = v.nearNode();
      const list = v.nodes();
      body.innerHTML = `<div class="idv"><div class="i-note">비눗방울을 타고 둥실~ 정류장으로 날아가요. 등대를 고치면 정류장이 늘어나요 🗼</div>
        <div class="i-nodes">${list.map((n) => {
          const me = here?.id === n.id;
          return `<div class="i-node${me ? ' here' : ''}"><span class="i">${NODE_ICON[n.kind] ?? '🫧'}</span><span class="t">${esc(n.label)}<small>${me ? '지금 여기' : `${fmt(v.dist(n))} m`}</small></span>
            ${me ? '<button class="btn off">여기!</button>' : `<button class="btn" data-go="${esc(n.id)}">가기</button>`}</div>`;
        }).join('')}</div></div>`;
      bindAll(body, 'go', (id) => { pc.close(); v.go(id); });
    },
  };
}

// ───────────── 마당 꾸미기 ─────────────
export function yardPanel(v: DevView): PanelDef {
  return {
    kind: 'yard', title: '마당 꾸미기', color: '#ff9fb8', icon: '🌷', wide: true,
    meta: () => { const i = v.yardIsland(); return i ? `${v.name(i)} · ${starText(v.rating(i).stars)}` : ''; },
    render(body: HTMLElement, pc: PanelCtx) {
      ensureCss();
      const { esc, fmt } = pc.h;
      const isl = v.yardIsland();
      if (!isl) { body.innerHTML = '<div class="idv"><div class="i-note">마당 팻말 가까이에서 열어요 🌷</div></div>'; return; }
      const rt = v.rating(isl);
      const kinds = (Object.keys(YARD_DEFS) as YardKind[]).filter((k) => k !== 'furn');
      const tiles = kinds.map((k) => {
        const d = YARD_DEFS[k], ok = v.canAfford(k);
        return `<div class="y${ok ? '' : ' off'}" data-pk="${k}"><div class="e">${d.icon}</div>${esc(d.name)}<small>${esc(v.costText(k))} · +${d.pts}점</small><small>${esc(d.desc)}</small></div>`;
      }).join('');
      const furn = v.furniture();
      const ftiles = furn.map((f) => `<div class="y" data-pf="${esc(f.id)}"><div class="e">${f.icon}</div>${esc(f.name)}<small>가방에 ${fmt(f.n)}개 · +${YARD_DEFS.furn.pts}점</small></div>`).join('');
      body.innerHTML = `<div class="idv">
        <div class="i-hd"><span class="nm">🌷 ${esc(v.name(isl))} 마당</span><span class="st">${starText(rt.stars)}</span>
          <span class="sm">꾸미기 점수 ${fmt(rt.deco)} · 조각 ${fmt(v.pieces(isl).length)}개<br>섬 도감 ${Math.floor(rt.dexPct)}%</span></div>
        <div class="i-card"><h4>🔨 만들어 놓기</h4><div class="i-yard">${tiles}</div></div>
        <div class="i-card"><h4>🪑 가방 가구 놓기</h4>${ftiles ? `<div class="i-yard">${ftiles}</div>` : '<div class="i-note">마당에 놓을 가구가 가방에 없어요. 꽥꽥상회·작업대에서 구해 와요!</div>'}</div>
        <div class="i-go"><button class="btn" data-rm="1">🧹 치우기</button><span class="i-note">E 놓기 · R 돌리기 · Esc 그만 · 연못엔 물고기, 반딧불 풀숲엔 반딧불을 놓아줄 수 있어요</span></div>
      </div>`;
      bindAll(body, 'pk', (k) => { if (!v.canAfford(k as YardKind)) { v.toast('재료가 모자라요 💦'); return; } pc.close(); v.startPlace(k as YardKind); });
      bindAll(body, 'pf', (id) => { pc.close(); v.startPlace('furn', id); });
      bindAll(body, 'rm', () => { pc.close(); v.startPlace('remove'); });
    },
  };
}
