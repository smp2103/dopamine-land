// 일지 창(journal, J) — 탭 미션 · 업적 · 세트 · 마스터리. 그리기만 한다(판정·보상은 meta.ts).
// hud 공용 클래스(.req · .bar · .dl-card · .btn)를 쓰고, 일지만의 모양은 fest.ts 의 #dl .mj 스타일.
import type { PanelCtx, PanelDef, PanelTab } from '../../core/api';
import { ACH_GROUPS, ISLAND_DEX_STEPS, MISSION_STARS, MISSIONS_ALL_STARS, MASTERY_NAME, type AchDef, type SetDef } from './data';
import type { MissionRow, Progress, SetProgress, SpeciesLike } from './logic';
import { ensureMetaStyle } from './fest';

export interface JournalSource {
  day(): number;
  missions(): MissionRow[];
  bonus(): boolean;
  achievements(): Array<{ def: AchDef; done: boolean; p: Progress }>;
  sets(): Array<{ def: SetDef; done: boolean; p: SetProgress }>;
  /** 등록한 종과 숙련 단계 */
  masteryRows(): Array<{ s: SpeciesLike; level: number }>;
  islands(): Array<{ id: string; name: string; got: number; total: number; pct: number; steps: number }>;
  /** meta 가 준 반짝별 합 */
  starsEarned(): number;
  /** 세트 칸이 채워졌나(기증 세트는 기증, 나머지는 등록) */
  isGot(def: SetDef, id: string): boolean;
}

export const JOURNAL = { kind: 'journal', title: '모험 일지', icon: '📓', color: '#ff9cb8' } as const;

const CAT_NAME: Record<string, string> = { fish: '물고기', sea: '바다', bug: '곤충', dino: '공룡', fossil: '화석', space: '우주', item: '탈것' };
const CAT_ORDER = ['fish', 'sea', 'bug', 'dino', 'fossil', 'space', 'item'];
const FACE = ['🐰', '🐻', '🐱', '🐶', '🐸'];
const pct = (have: number, need: number) => Math.max(0, Math.min(100, (have / Math.max(1, need)) * 100));

export function journalPanel(src: JournalSource): PanelDef {
  const tabs = (): PanelTab[] => {
    const ms = src.missions();
    const ach = src.achievements();
    const sets = src.sets();
    return [
      { id: 'missions', label: '미션', icon: '📝', badge: `${ms.filter((m) => m.done).length}/${ms.length}` },
      { id: 'ach', label: '업적', icon: '🏆', badge: `${ach.filter((a) => a.done).length}` },
      { id: 'sets', label: '세트', icon: '🧩', badge: `${sets.filter((s) => s.done).length}` },
      { id: 'mastery', label: '마스터리', icon: '🌟' },
    ];
  };
  return {
    kind: JOURNAL.kind, title: JOURNAL.title, icon: JOURNAL.icon, color: JOURNAL.color, defaultTab: 'missions', wide: true,
    tabs,
    meta: () => {
      const a = src.achievements();
      return `업적 ${a.filter((x) => x.done).length}/${a.length} · ⭐${src.starsEarned()}`;
    },
    render(body: HTMLElement, pc: PanelCtx) {
      ensureMetaStyle();
      const tab = pc.tab ?? 'missions';
      const html = tab === 'ach' ? achHtml(src, pc) : tab === 'sets' ? setsHtml(src, pc) : tab === 'mastery' ? masteryHtml(src, pc) : missionsHtml(src, pc);
      body.innerHTML = `<div class="mj">${html}</div>`;
    },
  };
}

function missionsHtml(src: JournalSource, pc: PanelCtx): string {
  const { esc, fmt } = pc.h;
  const rows = src.missions();
  if (!rows.length) return '<div class="note">오늘의 미션을 고르는 중이에요… 잠깐만요!</div>';
  const done = rows.filter((r) => r.done).length;
  const head = `<div class="mj-day">📅 <b>${fmt(src.day() + 1)}일째</b> 오늘의 미션 · 하나에 ⭐${MISSION_STARS} + 🗝️ · 날이 바뀌면 새 미션!</div>`;
  const list = rows.map((r, i) => `<div class="req dl-card${r.done ? ' done' : ''}">
      <div class="who${r.done ? ' ok' : ''}">${r.done ? '✅' : esc(r.tpl.icon) || FACE[i % FACE.length]}</div>
      <div class="tx">${esc(r.tpl.text)}
        <small>${fmt(r.have)} / ${fmt(r.goal)}${esc(r.tpl.unit ?? '')} · 보상 ⭐${MISSION_STARS} · 🗝️ 은열쇠 조각</small>
        <div class="bar"><i style="width:${pct(r.have, r.goal)}%"></i></div></div>
      <div class="chk">${r.done ? '🎉' : '⏳'}</div></div>`).join('');
  const bonus = src.bonus();
  const all = `<div class="mj-all dl-card${bonus ? ' got' : ''}"><div class="chk" style="font-size:34px">${bonus ? '🏅' : '🎁'}</div>
      <div class="tx">다섯 개 모두 끝내기 보너스 <small>${bonus ? '받았어요! 내일 또 만나요 ✨' : `${done} / ${rows.length} 완료 · 보상 ⭐${MISSIONS_ALL_STARS} + 🔑 금열쇠 조각`}</small>
      <div class="bar"><i style="width:${pct(done, rows.length)}%"></i></div></div></div>`;
  return head + list + all;
}

function achHtml(src: JournalSource, pc: PanelCtx): string {
  const { esc, fmt } = pc.h;
  const all = src.achievements();
  const got = all.filter((a) => a.done).length;
  const stars = all.filter((a) => a.done).reduce((s, a) => s + a.def.stars, 0);
  let out = `<div class="mj-sum"><span class="pill">🏆 ${got} / ${all.length}</span><span class="pill">⭐ ${fmt(stars)} 받음</span></div>`;
  for (const g of ACH_GROUPS) {
    const list = all.filter((a) => a.def.group === g.id);
    if (!list.length) continue;
    out += `<h4>${g.icon} ${esc(g.name)} <small>${list.filter((a) => a.done).length}/${list.length}</small></h4><div class="mj-ach">`;
    out += list.map(({ def, done, p }) => {
      const prog = done ? '' : `<div class="bar"><i style="width:${pct(p.have, p.need)}%"></i></div>`;
      const num = done ? '' : ` · ${fmt(Math.floor(p.have))}/${fmt(p.need)}`;
      return `<div class="mj-a ${done ? 'on' : 'off'}" title="${esc(def.desc)}"><div class="ai">${esc(def.icon)}</div>
        <div class="at">${esc(def.name)}<small>${esc(def.desc)}${num}</small>${prog}</div><div class="st">${done ? '달성!' : `⭐${def.stars}`}</div></div>`;
    }).join('');
    out += '</div>';
  }
  return out;
}

function memberChip(pc: PanelCtx, s: SpeciesLike, got: boolean): string {
  const { esc, ico } = pc.h;
  if (!got) return `<span class="miss" title="???">?</span>`;
  const url = pc.h.thumb?.(s.id) ?? null;
  return `<span class="got" title="${esc(s.name ?? s.id)}">${url ? `<img src="${url}" alt="" draggable="false">` : ico(s.id)}</span>`;
}

function setsHtml(src: JournalSource, pc: PanelCtx): string {
  const { esc, fmt } = pc.h;
  const list = src.sets();
  const card = ({ def, done, p }: { def: SetDef; done: boolean; p: SetProgress }) => {
    const need = Math.max(1, p.need);
    const extra = p.extra ? ` · ${esc(p.extra.label)} ${fmt(Math.min(p.extra.have, p.extra.need))}/${fmt(p.extra.need)}` : '';
    const mem = p.members.length && def.mode !== 'variant'
      ? `<div class="mj-mem">${p.members.slice(0, 24).map((s) => memberChip(pc, s, src.isGot(def, s.id))).join('')}${p.members.length > 24 ? `<span class="miss">+${p.members.length - 24}</span>` : ''}</div>`
      : '';
    return `<div class="mj-set dl-card${done ? ' on' : ''}" style="--sc:${esc(def.color)}"><div class="top"><div class="si">${esc(def.icon)}</div>
      <div class="tx">${esc(def.name)}<small>${esc(def.desc)}${extra} · 🎁 ${esc(def.rewardText)}</small>
      <div class="bar"><i style="width:${done ? 100 : pct(p.have, need)}%"></i></div></div>
      <div class="n">${done ? '🎉 완성!' : `${fmt(Math.min(p.have, need))}/${fmt(p.need || 0)}`}</div></div>${mem}</div>`;
  };
  const main = list.filter((x) => !x.def.group);
  const masters = list.filter((x) => x.def.group === 'set-island-master');
  let out = main.map(card).join('');
  if (masters.length) {
    out += `<h4>🚩 섬 마스터 <small>${masters.filter((m) => m.done).length}/${masters.length} · 섬 고유종을 전부 모으면 깃발 + 음악 상자</small></h4>`;
    out += masters.map(card).join('');
  }
  return out;
}

function masteryHtml(src: JournalSource, pc: PanelCtx): string {
  const { esc, fmt, ico } = pc.h;
  const rows = src.masteryRows();
  const n = (lv: number) => rows.filter((r) => r.level >= lv).length;
  let out = `<div class="mj-sum"><span class="pill">📖 등록 ${fmt(n(1))}</span><span class="pill">🥈 은별 ${fmt(n(2))}</span><span class="pill">🥇 금별 ${fmt(n(3))}</span></div>
    <div class="note" style="font-size:15px;padding:0 2px 6px">같은 친구를 10번 잡으면 은별(⭐1), 왕관 개체를 잡으면 금별(⭐3)!</div>`;
  const isl = src.islands();
  if (isl.length) {
    out += `<h4>🗺️ 섬 도감 <small>50% · 80% · 100% 마다 반짝별</small></h4><div class="mj-isl">`;
    out += isl.map((i) => `<div class="dl-card">${i.pct >= 100 ? '👑 ' : ''}${esc(i.name)} <b style="float:right;color:#e38b57">${Math.floor(i.pct)}%</b>
      <div class="bar"><i style="width:${i.pct}%"></i></div>
      <div class="stp">${ISLAND_DEX_STEPS.map((s, k) => `<span class="${i.steps > k ? 'on' : ''}">${i.steps > k ? '✔' : '○'} ${s.pct}% ⭐${s.stars}</span>`).join('')}<span style="margin-left:auto">${fmt(i.got)}/${fmt(i.total)}</span></div></div>`).join('');
    out += '</div>';
  }
  if (!rows.length) return out + '<div class="note">아직 등록한 친구가 없어요. 낚싯대를 던져 볼까요? 🎣</div>';
  for (const cat of [...CAT_ORDER, ...new Set(rows.map((r) => r.s.category).filter((c) => !CAT_ORDER.includes(c)))]) {
    const list = rows.filter((r) => r.s.category === cat);
    if (!list.length) continue;
    out += `<h4>${esc(CAT_NAME[cat] ?? cat)} <small>은별 ${list.filter((r) => r.level >= 2).length} · 금별 ${list.filter((r) => r.level >= 3).length}</small></h4><div class="mj-mgrid">`;
    out += list.map(({ s, level }) => {
      const url = pc.h.thumb?.(s.id) ?? null;
      const stars = [1, 2, 3].map((k) => `<span class="${level >= k ? (k === 3 ? 'g' : k === 2 ? 's' : 'g') : 'o'}">★</span>`).join('');
      return `<div class="mj-m l${level}" title="${esc(`${s.name ?? s.id} · ${MASTERY_NAME[level]}`)}"><div class="mi">${url ? `<img src="${url}" alt="" draggable="false">` : ico(s.id)}</div>
        <div>${esc(s.name ?? s.id)}</div><div class="ms">${stars}</div></div>`;
    }).join('');
    out += '</div>';
  }
  return out;
}
