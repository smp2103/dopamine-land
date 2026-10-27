// 우편함 창(panel 'mail', K) — 받은 편지(주민 편지·첨부 선물·생일 초대·요일 공지·오늘의 소식) · 오늘의 소식(인기 생물 3 · 손님 생물 ·
// 섬 날씨 예보 4/8/12시간 · 요일 이벤트 주간표) · 하루 루틴 10 + 오늘의 미션(meta) · 부표 우체통(부표에서 열 때만: 선물·편지 넣기·정류장).
// 그리기는 hud 렌더러가 붙인 body 안에서만. 글자는 #4a3b2a, 바탕은 #fff8e8(계약 v2 Art).
import type { PanelDef, PanelCtx, HudHelpers, Weather } from '../../core/api';
import { islandName } from '../../core/world';
import { WEEKDAY_INFO, WEEKDAY_KO, WEEKDAY_EVENTS, WEATHER_ICON, WEATHER_KO, WEATHER_TIP, FORECAST_HOURS, ROUTINE_BONUS_STARS, type WeekdayEventId } from './data';
import { hasGift, type Mail, type MailAttach, type NewsData, type RoutineRow } from './logic';

export const MAIL_KIND = 'mail';

/** 부표에서 열었을 때 보여 줄 것 */
export interface BuoyView {
  id: string;
  name: string;
  links: [string, string];
  /** 오늘 선물(받았으면 claimed) */
  gift: { line: string; attach: MailAttach[]; claimed: boolean };
  /** 가방 속 편지 부탁 */
  letters: Array<{ rid: string; item: string; to: string; npc: string; ok: boolean }>;
  /** 비눗방울 정류장으로 등록됐나 */
  station: boolean;
}

export interface MailPanelEnv {
  day(): number;
  box(): Mail[];
  unread(): number;
  gifts(): number;
  markRead(id: string): void;
  readAll(): void;
  /** 첨부 받기 — 실제로 받은 것 */
  claim(id: string): MailAttach[];
  claimAll(): number;
  /** 지금 기준 소식(서비스가 없으면 null → 아침에 찍어 둔 것) */
  liveNews(): NewsData | null;
  today(): { id: WeekdayEventId; active: boolean };
  routine(): RoutineRow[];
  routineBonus(): boolean;
  missions(): Array<{ text: string; icon: string; have: number; goal: number; done: boolean }> | null;
  buoy(): BuoyView | null;
  buoyClaim(): MailAttach[];
  deliver(rid: string): boolean;
  openTravel(): boolean;
  /** 받은 편지 탭을 봤다(루틴 '우편함 열기') */
  viewed(): void;
}

const UI = { text: '#4a3b2a', bg: '#fff8e8', line: '#f0dcb4' };
let cssDone = false;
function injectCss() {
  if (cssDone || typeof document === 'undefined' || !document.head) return;
  cssDone = true;
  const s = document.createElement('style');
  s.id = 'calendar-css';
  s.textContent = `
#dl .cal { color:${UI.text}; max-width:720px; margin:0 auto; font-size:17px; }
#dl .cal .c-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:0 0 10px; }
#dl .cal .c-bar .c-sp { flex:1; }
#dl .cal .c-card { background:${UI.bg}; border:3px dashed ${UI.line}; border-radius:22px; padding:14px 18px; margin:0 0 12px; line-height:1.55; }
#dl .cal .c-card.c-letter { background:#fff0f4; border-color:#ffd0dc; }
#dl .cal .c-card.c-news { background:#f2f8ff; border-color:#cfe3ff; }
#dl .cal .c-card.c-event { border-style:solid; }
#dl .cal .c-card.c-buoy { background:#eaf6ff; border-color:#bfe0ff; }
#dl .cal .c-card .c-hd { display:flex; align-items:center; gap:10px; font-size:21px; margin-bottom:6px; }
#dl .cal .c-card .c-hd .c-ic { width:44px; height:44px; border-radius:50%; display:grid; place-items:center; font-size:24px; background:radial-gradient(circle at 35% 30%, #fff, #ffd9e4); flex:none; box-shadow: inset 0 -3px 0 #f2b8c8; }
#dl .cal .c-card .c-hd small { display:block; font-size:14px; opacity:.7; }
#dl .cal .c-txt { white-space:pre-line; margin:6px 0 10px; }
#dl .cal .c-att { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 10px; border-radius:16px; background:#fffdf6; border:2px solid #f6e3bd; }
#dl .cal .c-att .c-it { display:inline-flex; align-items:center; gap:4px; padding:2px 10px 2px 4px; border-radius:999px; background:#fff3d6; }
#dl .cal .c-att .c-it .c-ii { font-size:20px; }
#dl .cal .c-att.c-done { opacity:.6; }
#dl .cal .c-rows { display:flex; flex-direction:column; gap:6px; }
#dl .cal .c-row { display:flex; align-items:center; gap:10px; padding:7px 12px; border-radius:16px; background:#fffaf0; border:2px solid #f3e2c2; cursor:pointer; pointer-events:auto; }
#dl .cal .c-row.c-on { background:#fff0d0; border-color:#ffcf7a; }
#dl .cal .c-row .c-dot { width:10px; height:10px; border-radius:50%; background:#ff7a9a; flex:none; }
#dl .cal .c-row .c-dot.c-off { background:transparent; }
#dl .cal .c-row .c-ri { font-size:20px; width:26px; text-align:center; }
#dl .cal .c-row .c-rt { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#dl .cal .c-row .c-rf { font-size:14px; opacity:.65; }
#dl .cal .c-hot { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
#dl .cal .c-hot .c-h { text-align:center; padding:8px 4px; border-radius:16px; background:#fff; border:2px solid #ffe0a8; }
#dl .cal .c-hot .c-h img { width:56px; height:56px; object-fit:contain; display:block; margin:0 auto; }
#dl .cal .c-hot .c-h .c-em { font-size:34px; line-height:56px; height:56px; }
#dl .cal .c-hot .c-h b { color:#ff8a3d; font-weight:normal; }
#dl .cal table.c-fc { width:100%; border-collapse:separate; border-spacing:0 4px; font-size:16px; }
#dl .cal table.c-fc th { font-weight:normal; opacity:.7; font-size:14px; }
#dl .cal table.c-fc td { text-align:center; background:#fff; padding:3px 4px; }
#dl .cal table.c-fc td:first-child { text-align:left; border-radius:12px 0 0 12px; padding-left:10px; }
#dl .cal table.c-fc td:last-child { border-radius:0 12px 12px 0; }
#dl .cal .c-wk { display:grid; grid-template-columns:repeat(7, 1fr); gap:6px; margin-top:8px; }
#dl .cal .c-wk .c-d { text-align:center; padding:6px 2px; border-radius:14px; background:#fff; border:2px solid #f1e2c4; font-size:14px; }
#dl .cal .c-wk .c-d .c-e { font-size:22px; display:block; }
#dl .cal .c-wk .c-d.c-on { border-color:#ff9fb8; background:#fff0f4; transform:translateY(-2px); box-shadow:0 3px 0 #ffc2d2; }
#dl .cal .c-rt-row { display:flex; align-items:center; gap:10px; padding:6px 10px; border-radius:14px; background:#fffaf0; }
#dl .cal .c-rt-row.c-done { background:#eefbe9; }
#dl .cal .c-rt-row .c-ck { width:28px; height:28px; border-radius:50%; display:grid; place-items:center; background:#f1e2c4; color:#fff; flex:none; }
#dl .cal .c-rt-row.c-done .c-ck { background:#7ccf8a; box-shadow:0 2px 0 #4ea562; }
#dl .cal .c-rt-row .c-pg { width:90px; height:8px; border-radius:8px; background:#f1e2c4; overflow:hidden; flex:none; }
#dl .cal .c-rt-row .c-pg i { display:block; height:100%; background:linear-gradient(90deg, #8fdc9a, #ffd36b); border-radius:8px; }
#dl .cal .c-rt-row .c-n { font-size:14px; opacity:.7; width:40px; text-align:right; }
#dl .cal h4 { margin:14px 0 6px; font-weight:normal; font-size:19px; }
#dl .cal .c-empty { text-align:center; opacity:.75; padding:24px 0; }
`;
  document.head.appendChild(s);
}

const ago = (d: number, today: number) => (d === today ? '오늘' : d === today - 1 ? '어제' : `${today - d}일 전`);
const thumbOr = (h: HudHelpers, id: string) => {
  const t = h.thumb?.(id);
  return t ? `<img src="${t}" alt="">` : `<div class="c-em">${h.ico(id)}</div>`;
};
const attHtml = (h: HudHelpers, list: MailAttach[]) =>
  list.map((a) => `<span class="c-it"><span class="c-ii">${h.ico(a.id)}</span>${h.esc(h.name(a.id))} ×${a.n}</span>`).join('');

function btn(h: HudHelpers, html: string, onClick: () => void, cls = '', off = false): HTMLElement {
  const b = h.button(html, () => { if (!off) onClick(); });
  b.className = `btn${cls ? ` ${cls}` : ''}${off ? ' off' : ''}`;
  (b.style as CSSStyleDeclaration).pointerEvents = 'auto';
  return b;
}

/** 소식 묶음(인기 생물 · 손님 · 예보) HTML */
function newsHtml(h: HudHelpers, n: NewsData, o: { compact?: boolean } = {}): string {
  const hot = n.hot.length
    ? `<div class="c-hot">${n.hot.map((id) => `<div class="c-h">${thumbOr(h, id)}${h.esc(h.name(id))}${n.mult?.[id] ? `<br><b>×${(+n.mult[id]).toFixed(1).replace(/\.0$/, '')}</b>` : ''}</div>`).join('')}</div>`
    : '<div class="c-empty">아직 시세가 안 나왔어요</div>';
  const guest = n.guest
    ? `<div class="c-att" style="margin-top:8px"><span class="c-ii" style="font-size:24px">${h.ico(n.guest)}</span> 오늘의 손님 생물: <b>${h.esc(h.name(n.guest))}</b> <small>— 오늘 출현 ×5, 기증하면 반짝별 보너스!</small></div>`
    : '';
  const rows = o.compact ? n.forecast.slice(0, 4) : n.forecast;
  const tips = new Set<string>();
  for (const r of n.forecast) for (const w of r.w) { const t = WEATHER_TIP[w as Weather]; if (t) tips.add(t); }
  const fc = rows.length
    ? `<table class="c-fc"><tr><th></th>${FORECAST_HOURS.map((x) => `<th>${x}시간 뒤</th>`).join('')}</tr>${rows.map((r) => `<tr><td>${h.esc(islandName(r.region))}</td>${r.w.map((w) => `<td title="${h.esc(WEATHER_KO[w as Weather] ?? w)}">${WEATHER_ICON[w as Weather] ?? '❔'} <small>${h.esc(WEATHER_KO[w as Weather] ?? w)}</small></td>`).join('')}</tr>`).join('')}</table>
      ${!o.compact && tips.size ? `<div style="font-size:15px;margin-top:4px">${[...tips].slice(0, 3).map((t) => h.esc(t)).join('<br>')}</div>` : ''}`
    : '<div class="c-empty">날씨 요정이 아직 자고 있어요 💤</div>';
  return `<h4>🔥 오늘의 인기 생물</h4>${hot}${guest}<h4>🌤️ 섬 날씨 예보</h4>${fc}`;
}

function weekHtml(h: HudHelpers, today: WeekdayEventId) {
  return `<div class="c-wk">${WEEKDAY_EVENTS.map((id) => {
    const w = WEEKDAY_INFO[id];
    return `<div class="c-d${id === today ? ' c-on' : ''}" title="${h.esc(w.name)}"><span class="c-e">${w.icon}</span>${WEEKDAY_KO[w.wd]}</div>`;
  }).join('')}</div>`;
}

/** 편지 한 통 */
function mailCard(h: HudHelpers, m: Mail, today: number, onClaim: () => void): HTMLElement {
  const el = document.createElement('div');
  const tone = m.kind === 'news' ? 'c-news' : m.kind === 'event' ? 'c-event' : 'c-letter';
  el.className = `c-card ${tone}`;
  const ev = m.event ? WEEKDAY_INFO[m.event] : null;
  if (ev) el.style.borderColor = ev.color;
  el.innerHTML = `<div class="c-hd"><div class="c-ic">${h.esc(m.icon)}</div><div>${h.esc(m.title)}<small>${h.esc(m.from)} · ${ago(m.day, today)}</small></div></div>
    <div class="c-txt">${h.esc(m.text)}</div>${m.news ? newsHtml(h, m.news, { compact: true }) : ''}`;
  if (m.attach?.length) {
    const a = document.createElement('div');
    a.className = `c-att${m.claimed ? ' c-done' : ''}`;
    a.innerHTML = `🎁 ${attHtml(h, m.attach)}<span style="flex:1"></span>`;
    a.appendChild(m.claimed ? Object.assign(document.createElement('span'), { textContent: '받았어요 ✓' }) : btn(h, '🎁 받기', onClaim, 'gold'));
    el.appendChild(a);
  }
  return el;
}

export function mailPanel(env: MailPanelEnv): PanelDef {
  injectCss();
  let lastSel: string | null = null;
  return {
    kind: MAIL_KIND, title: '우편함', color: '#ffb3c6', icon: '📬', defaultTab: 'inbox',
    tabs: () => {
      const u = env.unread();
      const out = [
        { id: 'inbox', label: '받은 편지', icon: '💌', badge: u ? String(u) : undefined },
        { id: 'news', label: '오늘의 소식', icon: '📰' },
        { id: 'routine', label: '하루 루틴', icon: '📋', badge: (() => { const r = env.routine(); const d = r.filter((x) => x.done).length; return d < r.length ? `${d}/${r.length}` : undefined; })() },
      ];
      return env.buoy() ? [{ id: 'buoy', label: '부표 우체통', icon: '📮' }, ...out] : out;
    },
    meta: () => {
      const t = env.today(), w = WEEKDAY_INFO[t.id];
      return `${env.day() + 1}일째 · ${WEEKDAY_KO[w.wd]} ${w.icon} ${w.name}`;
    },
    render(body: HTMLElement, pc: PanelCtx) {
      injectCss();
      const h = pc.h;
      body.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'cal';
      body.appendChild(wrap);
      const tab = pc.tab === 'news' || pc.tab === 'routine' || (pc.tab === 'buoy' && env.buoy()) ? pc.tab : 'inbox';
      if (tab === 'inbox') renderInbox(wrap, pc);
      else if (tab === 'news') renderNews(wrap, h);
      else if (tab === 'routine') renderRoutine(wrap, h);
      else renderBuoy(wrap, pc);
    },
    onClose: () => { lastSel = null; },
  };

  function renderInbox(wrap: HTMLElement, pc: PanelCtx) {
    const h = pc.h;
    env.viewed();
    const box = env.box();
    const today = env.day();
    if (!box.length) {
      wrap.innerHTML = '<div class="c-card"><div class="c-empty">📭 아직 편지가 없어요.<br><small>매일 아침 5시에 새 편지가 와요!</small></div></div>';
      return;
    }
    const sel = (pc.sel && box.find((m) => m.id === pc.sel)) || (lastSel && box.find((m) => m.id === lastSel)) || box.find((m) => !m.read) || box[0];
    lastSel = sel.id;
    if (!sel.read) {
      env.markRead(sel.id);
      // 탭 뱃지(안 읽음 수)는 body 보다 먼저 그려졌다 — 한 번만 다시 그린다(이번엔 읽음이라 되풀이되지 않는다)
      queueMicrotask(() => pc.rerender());
    }
    const bar = document.createElement('div');
    bar.className = 'c-bar';
    bar.innerHTML = `<span>받은 편지 ${box.length}통 · 안 읽음 ${env.unread()}</span><span class="c-sp"></span>`;
    const g = env.gifts();
    bar.appendChild(btn(h, '모두 읽음', () => { env.readAll(); pc.rerender(); }, '', env.unread() === 0));
    bar.appendChild(btn(h, `🎁 선물 모두 받기${g ? ` (${g})` : ''}`, () => { if (env.claimAll() > 0) h.confetti(wrap, ['#ffb3c6', '#ffd36b', '#fff'], 22); pc.rerender(); }, 'gold', g === 0));
    wrap.appendChild(bar);
    wrap.appendChild(mailCard(h, sel, today, () => {
      if (env.claim(sel.id).length) h.confetti(wrap, ['#ffb3c6', '#ffd36b', '#fff'], 18);
      pc.rerender();
    }));
    const rows = document.createElement('div');
    rows.className = 'c-rows';
    for (const m of box) {
      const r = document.createElement('div');
      r.className = `c-row${m.id === sel.id ? ' c-on' : ''}`;
      r.innerHTML = `<span class="c-dot${m.read ? ' c-off' : ''}"></span><span class="c-ri">${h.esc(m.icon)}</span><span class="c-rt">${h.esc(m.title)}</span>${hasGift(m) ? '<span>🎁</span>' : ''}<span class="c-rf">${h.esc(m.from)} · ${ago(m.day, today)}</span>`;
      r.onclick = () => { lastSel = m.id; pc.setSel(m.id); };
      rows.appendChild(r);
    }
    wrap.appendChild(rows);
  }

  function renderNews(wrap: HTMLElement, h: HudHelpers) {
    const t = env.today(), w = WEEKDAY_INFO[t.id];
    const ev = document.createElement('div');
    ev.className = 'c-card c-event';
    ev.style.borderColor = w.color;
    ev.innerHTML = `<div class="c-hd"><div class="c-ic" style="background:radial-gradient(circle at 35% 30%, #fff, ${w.color})">${w.icon}</div><div>${WEEKDAY_KO[w.wd]}요일 — ${h.esc(w.name)}<small>📍 ${h.esc(w.where)}${t.active ? ' · 진행 중!' : ''}</small></div></div>
      <div class="c-txt">${h.esc(w.desc)}</div>${weekHtml(h, t.id)}`;
    wrap.appendChild(ev);
    const n = env.liveNews() ?? env.box().find((m) => m.kind === 'news')?.news ?? null;
    const c = document.createElement('div');
    c.className = 'c-card c-news';
    c.innerHTML = n ? newsHtml(h, n) : '<div class="c-empty">아직 오늘 신문이 안 왔어요 📰</div>';
    wrap.appendChild(c);
  }

  function renderRoutine(wrap: HTMLElement, h: HudHelpers) {
    const rows = env.routine();
    const done = rows.filter((r) => r.done).length;
    const c = document.createElement('div');
    c.className = 'c-card';
    c.innerHTML = `<div class="c-hd"><div class="c-ic">📋</div><div>하루 루틴 ${done}/${rows.length}<small>게임 하루(30분) 동안 하면 좋은 일 열 가지 · 다 하면 ⭐${ROUTINE_BONUS_STARS}${env.routineBonus() ? ' — 받았어요 ✓' : ''}</small></div></div>
      <div class="c-rows">${rows.map((r) => `<div class="c-rt-row${r.done ? ' c-done' : ''}"><span class="c-ck">${r.done ? '✓' : ''}</span><span class="c-ri">${r.def.icon}</span><span class="c-rt" style="flex:1">${h.esc(r.def.text)}</span>
        <span class="c-pg"><i style="width:${Math.round((r.have / Math.max(1, r.goal)) * 100)}%"></i></span><span class="c-n">${r.have}/${r.goal}</span></div>`).join('')}</div>`;
    wrap.appendChild(c);
    const ms = env.missions();
    if (ms) {
      const m = document.createElement('div');
      m.className = 'c-card c-news';
      const md = ms.filter((x) => x.done).length;
      m.innerHTML = `<div class="c-hd"><div class="c-ic">📝</div><div>오늘의 미션 ${md}/${ms.length}<small>하나에 ⭐3 · 다섯 개 모두 보너스 (일지 J)</small></div></div>
        <div class="c-rows">${ms.map((x) => `<div class="c-rt-row${x.done ? ' c-done' : ''}"><span class="c-ck">${x.done ? '✓' : ''}</span><span class="c-ri">${x.icon}</span><span class="c-rt" style="flex:1">${h.esc(x.text)}</span>
          <span class="c-pg"><i style="width:${Math.round((Math.min(x.have, x.goal) / Math.max(1, x.goal)) * 100)}%"></i></span><span class="c-n">${Math.min(x.have, x.goal)}/${x.goal}</span></div>`).join('')}</div>`;
      wrap.appendChild(m);
    }
  }

  function renderBuoy(wrap: HTMLElement, pc: PanelCtx) {
    const h = pc.h;
    const b = env.buoy();
    if (!b) return;
    const g = document.createElement('div');
    g.className = 'c-card c-buoy';
    g.innerHTML = `<div class="c-hd"><div class="c-ic" style="background:radial-gradient(circle at 35% 30%, #fff, #9fd4ff)">📮</div><div>${h.esc(b.name)}<small>${h.esc(islandName(b.links[0]))} ↔ ${h.esc(islandName(b.links[1]))} 바닷길 · 바다 우체부 갈매기 끼룩</small></div></div>
      <div class="c-txt">🐦 ${h.esc(b.gift.line)}</div>`;
    const a = document.createElement('div');
    a.className = `c-att${b.gift.claimed ? ' c-done' : ''}`;
    a.innerHTML = `🎁 ${attHtml(h, b.gift.attach)}<span style="flex:1"></span>`;
    a.appendChild(b.gift.claimed ? Object.assign(document.createElement('span'), { textContent: '오늘 선물 받았어요 ✓' }) : btn(h, '🎁 받기', () => {
      if (env.buoyClaim().length) h.confetti(wrap, ['#9fd4ff', '#ffd36b', '#fff'], 18);
      pc.rerender();
    }, 'gold'));
    g.appendChild(a);
    wrap.appendChild(g);

    const l = document.createElement('div');
    l.className = 'c-card c-letter';
    l.innerHTML = '<div class="c-hd"><div class="c-ic">💌</div><div>편지 넣기<small>주민 부탁 ⑦ — 이 바닷길 섬으로 가는 편지를 넣으면 배달 완료!</small></div></div>';
    if (!b.letters.length) l.insertAdjacentHTML('beforeend', '<div class="c-empty" style="padding:8px 0">가방에 배달할 편지가 없어요.<br><small>주민에게 "편지 전해 줘" 부탁을 받으면 여기 넣을 수 있어요</small></div>');
    for (const x of b.letters) {
      const r = document.createElement('div');
      r.className = 'c-att';
      r.style.marginTop = '6px';
      r.innerHTML = `<span class="c-ii" style="font-size:22px">💌</span> ${h.esc(x.npc)} → <b>${h.esc(islandName(x.to))}</b><span style="flex:1"></span>`;
      r.appendChild(x.ok
        ? btn(h, '📮 넣기', () => { if (env.deliver(x.rid)) h.confetti(wrap, ['#ffb3c6', '#9fd4ff', '#fff'], 26); pc.rerender(); }, 'gold')
        : Object.assign(document.createElement('small'), { textContent: `${islandName(x.to)} 쪽 부표에 넣어요` }));
      l.appendChild(r);
    }
    wrap.appendChild(l);

    const s = document.createElement('div');
    s.className = 'c-bar';
    s.innerHTML = `<span>${b.station ? '🫧 비눗방울 정류장이 열렸어요 — 다른 정류장으로 순간 이동!' : '🫧 정류장 준비 중…'}</span><span class="c-sp"></span>`;
    s.appendChild(btn(h, '🫧 정류장 보기', () => { env.openTravel(); }, '', !b.station));
    wrap.appendChild(s);
  }
}
