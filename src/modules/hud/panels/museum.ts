// 박물관 창(open-museum) — GDD 3.11-5 · 5.6. 이 창은 hud 하나만 그린다(다른 모듈은 econ.museum() 데이터만 채운다).
// 탭: '기증하기'(가방 속 기증 가능한 것 전부) + 동마다 하나(econ.museum().wings — 수족관동·해저관·곤충관·화석관·천문관).
// 동 탭 = 진행 막대 + 마일스톤 10/25/50/75/100%(반짝별 10/25/50/80/150) + 그 동에 기증할 수 있는 것.
// 화석관은 골격마다 머리·몸통·꼬리 세 조각 진행. 안 열린 동은 '증축이 필요해요'(꽥꽥상회로 가는 버튼).
import type { PanelDef, PanelCtx, MuseumWing } from '../../../core/api';
import { splitVariant } from '../../../core/api';
import { BUILTIN_PANELS, pickTab, type HudTab } from '../logic';
import { econOf, call, bind, bagKeys, thumbHtml, type PanelEnv } from './common';

const WING_KO: Record<string, { name: string; icon: string; cats: string[] }> = {
  aquarium: { name: '수족관동', icon: '🐟', cats: ['fish'] }, sea: { name: '해저관', icon: '🐙', cats: ['sea'] },
  bug: { name: '곤충관', icon: '🦋', cats: ['bug', 'insect'] }, fossil: { name: '화석관', icon: '🦴', cats: ['fossil'] },
  astro: { name: '천문관', icon: '🔭', cats: ['space'] },
};
/** 마일스톤 % → 반짝별(GDD 5.6) */
const MS_STARS: Record<number, number> = { 10: 10, 25: 25, 50: 50, 75: 80, 100: 150 };
const PART_KO: Record<string, string> = { skull: '머리', head: '머리', body: '몸통', tail: '꼬리' };

/** econ.museum() 이 주는 동 한 줄(계약 MuseumWing + economy 가 덧붙이는 칸) */
type WingRow = MuseumWing & {
  name?: string; icon?: string; open?: boolean; key?: string; reached?: number[]; awarded?: number[]; next?: number | null;
  skeletons?: Array<{ dino: string; id: string; name: string; done: boolean; parts: Array<{ part: string; id: string; donated: boolean; have: boolean }> }>;
};

export function museumPanel(env: PanelEnv): PanelDef {
  const { game, look } = env;
  const st = game.state;
  const D = BUILTIN_PANELS.museum;
  const data = () => call<{ wings: WingRow[]; navChip?: { got: number; need: number; done: boolean } }>(econOf(game), 'museum') ?? null;
  const wings = (): WingRow[] => data()?.wings ?? [];
  const wingName = (w: WingRow) => w.name ?? WING_KO[w.id]?.name ?? w.id;
  const wingIcon = (w: WingRow) => w.icon ?? WING_KO[w.id]?.icon ?? '🏛️';
  const isOpen = (w: WingRow) => w.open ?? (call<boolean>(econOf(game), 'isUnlocked', `wing:${w.id}`) ?? true);
  const tabs = (): HudTab[] => {
    const t: HudTab[] = [{ id: 'donate', label: '기증하기', icon: '🦉' }];
    for (const w of wings()) t.push({ id: `wing:${w.id}`, label: wingName(w), icon: isOpen(w) ? wingIcon(w) : '🔒', badge: `${w.got}/${w.total}` });
    return t;
  };
  /** 기증할 수 있는 종(변이 가방 키는 기본 종으로 묶는다). cats 를 주면 그 동 것만 */
  const donatable = (cats?: string[]): string[] => {
    const E = econOf(game);
    const out = new Set<string>();
    for (const k of bagKeys(game)) {
      const id = splitVariant(k).id;
      if (out.has(id)) continue;
      const s = st.species.get(id);
      if (cats && (!s || !cats.includes(s.category))) continue;
      const can = call<boolean>(E, 'canDonate', id);
      if (can === undefined) {
        if (s && s.category !== 'item' && s.category !== 'dino' && !call<boolean>(E, 'isDonated', id)) out.add(id);
      } else if (can) out.add(id);
    }
    return [...out];
  };
  const donGrid = (ids: string[], pc: PanelCtx, empty: string) => {
    const { esc } = pc.h;
    return `<div class="grid">${ids.map((id) => `<div class="cell" style="--cc:${look.color(id)}"><div class="ico">${thumbHtml(env, id, look.ico(id))}</div><div class="nm">${esc(look.name(id))}</div>
      <div class="sm">${'★'.repeat(look.species(id)?.rarity ?? 1)}</div><button class="btn" data-don="${esc(id)}">기증하기</button></div>`).join('') || `<div class="note">${esc(empty)}</div>`}</div>`;
  };
  const milestones = (w: WingRow, pc: PanelCtx) => {
    const pct = w.total ? Math.floor((w.got / w.total) * 100) : 0;
    const reached = new Set(w.reached ?? w.milestones.filter((m) => pct >= m));
    return `<div class="mst">${w.milestones.map((m) => `<div class="m${reached.has(m) ? ' on' : ''}${w.next === m ? ' next' : ''}" style="left:${m}%"><i>${reached.has(m) ? '🏅' : '⭐'}</i><small>${m}%</small><small class="st">+${pc.h.fmt(MS_STARS[m] ?? 0)}</small></div>`).join('')}</div>`;
  };
  const skeletons = (w: WingRow, pc: PanelCtx) => {
    const { esc } = pc.h;
    const list = w.skeletons ?? [];
    if (!list.length) return '<div class="note">아직 발견한 화석 조각이 없어요. 공룡섬 땅을 파 봐요!</div>';
    return `<div class="sec">🦴 골격 맞추기</div><div class="skels">${list.map((k) => `<div class="sk dl-card${k.done ? ' done' : ''}">
      <div class="skn">${k.done ? '✨ ' : ''}${esc(k.name)}</div><div class="parts">${k.parts.map((p) => `<span class="pt${p.donated ? ' on' : p.have ? ' have' : ''}" title="${p.donated ? '기증 완료' : p.have ? '가방에 있어요' : '아직 못 찾았어요'}">${p.donated ? '🦴' : p.have ? '🎒' : '·'} ${esc(PART_KO[p.part] ?? p.part)}</span>`).join('')}</div>
      <small>${k.done ? '화석관에 우뚝 섰어요!' : `${k.parts.filter((p) => p.donated).length}/${Math.max(3, k.parts.length)} 조각`}</small></div>`).join('')}</div>`;
  };

  return {
    kind: D.kind, title: D.title, icon: D.icon, color: D.color, defaultTab: D.defaultTab,
    tabs,
    meta: () => `스탬프 ${econOf(game)?.stamps ?? 0}개`,
    render(body: HTMLElement, pc: PanelCtx) {
      const { esc, fmt } = pc.h;
      const tab = pickTab(pc.tab, tabs(), D.defaultTab);
      if (tab && tab.startsWith('wing:')) {
        const w = wings().find((x) => `wing:${x.id}` === tab);
        if (!w) { body.innerHTML = '<div class="note">이 전시관은 아직 준비 중이에요</div>'; return; }
        const pct = w.total ? Math.floor((w.got / w.total) * 100) : 0;
        const head = `<div class="hint dl-card wingh"><div class="ico" style="--cc:#e8dcff">${wingIcon(w)}</div><div class="grow">
          <div style="font-size:22px">${esc(wingName(w))} <b>${fmt(w.got)}/${fmt(w.total)}</b> <small>${pct}%</small></div>
          <div class="bar${pct >= 100 ? ' full' : ''}"><i style="width:${pct}%"></i></div>${milestones(w, pc)}</div></div>`;
        if (!isOpen(w)) {
          body.innerHTML = head + `<div class="locked dl-card">🔒 아직 문을 안 연 전시관이에요. 꽥꽥상회에서 <b>${esc(wingName(w))} 증축</b>을 해 주면 기증할 수 있어요!
            <button class="btn gold" data-go="shop">🦆 꽥꽥상회 가기</button></div>`;
          bind(body, 'go', () => game.hud.open('shop', 'buy', { shop: 'quack' }));
          return;
        }
        const nav = w.id === 'aquarium' ? data()?.navChip : undefined;
        body.innerHTML = head + (nav ? `<div class="hint dl-card"><div class="ico" style="--cc:#d9f0ff">📡</div><div class="grow">별자리 물고기 ${fmt(nav.got)}/${fmt(nav.need)} 기증하면 로켓 <b>항법 칩</b>!<small>${nav.done ? '항법 칩 완성! 🚀' : '별똥별섬 크레이터 호수에서 낚을 수 있어요'}</small></div></div>` : '')
          + (w.id === 'fossil' ? skeletons(w, pc) : '')
          + `<div class="sec">${wingIcon(w)} 지금 기증할 수 있어요</div>` + donGrid(donatable(WING_KO[w.id]?.cats), pc, '이 동에 기증할 친구가 가방에 없어요');
      } else {
        body.innerHTML = `<div class="hint dl-card"><div class="ico" style="--cc:#e8dcff">🦉</div><div class="grow">후후~ 처음 보는 친구를 기증하면 <span style="color:#9d6bff">스탬프와 반짝별</span>을 줄게!
          <small>공룡은 친구라서 기증하지 않아요 · 동 탭에서 전시관 진행을 볼 수 있어요</small></div>
          <div class="acts"><button class="btn" data-bag="1">🎒 가방 열기</button></div></div>` + donGrid(donatable(), pc, '지금은 기증할 게 없어요. 새 친구를 잡아 와요!');
      }
      bind(body, 'bag', () => game.hud.open('bag', undefined, { from: 'museum' }));
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
