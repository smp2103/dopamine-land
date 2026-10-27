// hud — 화면 UI: 코인·별, 시계, 미니맵, 지역명 연출, 잡았다 연출, 도감(Tab)·가방(I)·상점·제작·박물관·게시판 창.
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import type { Species } from '../core/state';
import { CSS } from './hud/style';
import { MAT, SHOP_ITEMS, RECIPES, GOODS, TIERS, DEX_TABS, CAT_ICON, RARITY_COLOR, ISLAND_LOOK, type ChestTier } from './economy/data';

export const order = 12;

const h = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmt = (n: number) => Math.round(n).toLocaleString();

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const st = game.state;
  const econ = () => game.econ as any;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = h(`<div id="dl">
    <div class="clock dl-card"><div class="sun"></div><div><div class="t">12:00</div><div class="d">1일째 · 맑음</div></div><div class="place">시작 섬</div><div class="o2"><i></i></div></div>
    <div class="wallet"><div class="pill dl-card coinp"><div class="ic coin">₩</div><span class="v">0</span></div><div class="pill dl-card starp"><div class="ic star">★</div><span class="v">0</span></div></div>
    <div class="map dl-card"><canvas width="380" height="380"></canvas><div class="n">N</div><div class="lbl">시작 섬</div></div>
    <div class="keys"><div class="key dl-card"><b>Tab</b>도감</div><div class="key dl-card"><b>I</b>가방</div><div class="key dl-card"><b>E</b>하기</div><div class="key dl-card"><b>G</b>화질</div></div>
    <div class="region"><div class="nm"></div><div class="sub"><i></i><span></span><i></i></div></div>
    <div class="catch"><div class="burst"></div><div class="box dl-card"></div></div>
    <div class="talk dl-card"><div class="who"></div><div class="tx"></div><div class="nx">▼</div></div>
    <div class="loot"></div>
    <div class="win dl-card"><div class="hd"><div class="ttl"></div><div class="meta"></div><button class="x">✕</button></div><div class="tabs"></div><div class="body"></div></div>
  </div>`);
  document.body.appendChild(root);
  const $ = (s: string) => root.querySelector(s) as HTMLElement;

  // ── 지갑
  const coinV = $('.coinp .v'), starV = $('.starp .v');
  let shownCoins = st.coins;
  const refreshWallet = () => { starV.textContent = fmt(econ()?.stars ?? 0); };
  const bump = (sel: string) => { const el = $(sel); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); };
  st.on((e) => {
    if (e.type === 'coins') {
      shownCoins = st.coins; coinV.textContent = fmt(st.coins);
      bump('.coinp');
      const d = e.delta as number;
      if (d) {
        const el = h(`<div class="delta">${d > 0 ? '+' : ''}${fmt(d)}</div>`);
        if (d < 0) el.style.webkitTextStroke = '5px #c56b6b';
        root.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-20px)'; }, 900);
        setTimeout(() => el.remove(), 1600);
      }
    }
    if (e.type === 'stars') { bump('.starp'); refreshWallet(); }
  });
  refreshWallet();

  // ── 조작 안내(처음에만)
  const uiF = (st.flags.ui ??= {}) as Record<string, unknown>;
  if (!uiF.helped && new URLSearchParams(location.search).get('shot') !== '1') {
    const help = h(`<div class="help dl-card"><div class="title">♪ 도파민랜드에 온 걸 환영해요!</div>
      <div class="k"><span class="key"><b>WASD</b></span>걷기</div><div class="k"><span class="key"><b>Shift</b></span>달리기</div>
      <div class="k"><span class="key"><b>Space</b></span>점프·활공</div><div class="k"><span class="key"><b>E</b></span>상호작용</div>
      <div class="k"><span class="key"><b>Tab</b></span>도감</div><div class="k"><span class="key"><b>I</b></span>가방</div>
      <div class="k"><span class="key"><b>V</b></span>카메라</div><div class="k"><span class="key"><b>C</b></span>잠수</div></div>`);
    root.appendChild(help);
    setTimeout(() => { help.style.opacity = '0'; }, 9000);
    setTimeout(() => help.remove(), 10000);
    uiF.helped = true;
  }

  // ── 미니맵
  const cv = root.querySelector('.map canvas') as HTMLCanvasElement;
  const g2 = cv.getContext('2d')!;
  const mapLbl = $('.map .lbl');
  const mapEl = $('.map');
  const isl = ctx.island.ISLANDS;
  const MAP_R = 3000; // 반지름 m
  const arrow = (c: number, yaw: number, fill: string) => {
    g2.save();
    g2.translate(c, c);
    g2.rotate(-yaw + Math.PI);
    g2.fillStyle = fill; g2.strokeStyle = '#fff'; g2.lineWidth = 6; g2.lineJoin = 'round';
    g2.shadowColor = '#0004'; g2.shadowBlur = 6; g2.shadowOffsetY = 2;
    g2.beginPath(); g2.moveTo(0, -18); g2.lineTo(13, 13); g2.lineTo(0, 6); g2.lineTo(-13, 13); g2.closePath(); g2.stroke(); g2.shadowColor = 'transparent'; g2.fill();
    g2.restore();
  };
  const drawSpaceMap = () => {
    const W = cv.width, c = W / 2;
    const p = game.player.pos;
    const sky = g2.createRadialGradient(c, c * 0.8, 10, c, c, c);
    sky.addColorStop(0, '#3a3f8f'); sky.addColorStop(1, '#161a44');
    g2.fillStyle = sky; g2.fillRect(0, 0, W, W);
    for (let i = 0; i < 60; i++) {
      const x = (i * 97) % W, y = (i * 61 + 13) % W;
      g2.fillStyle = i % 5 ? '#ffffff66' : '#fff3a8';
      g2.beginPath(); g2.arc(x, y, i % 7 ? 1.6 : 3, 0, Math.PI * 2); g2.fill();
    }
    // 달 지형 원(우주 원점 = 발사대 기준)
    const s = (c - 10) / 260;
    const ox = c + (0 - p.x) * s, oy = c + (30000 - p.z) * s;
    const moon = g2.createRadialGradient(ox - 30, oy - 30, 10, ox, oy, 120);
    moon.addColorStop(0, '#f4f0ff'); moon.addColorStop(1, '#b9b0e8');
    g2.fillStyle = '#ffffff30'; g2.beginPath(); g2.arc(ox, oy, 128, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = moon; g2.beginPath(); g2.arc(ox, oy, 118, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#a49bd955';
    for (const [dx, dy, r] of [[-40, 20, 22], [35, -30, 14], [20, 50, 10], [-20, -55, 12], [60, 30, 9]]) { g2.beginPath(); g2.arc(ox + dx, oy + dy, r, 0, Math.PI * 2); g2.fill(); }
    g2.font = '30px system-ui'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText('🚀', ox, oy);
    arrow(c, game.player.yaw, '#ffd23f');
  };
  const drawMap = () => {
    const W = cv.width, c = W / 2, s = (c - 6) / MAP_R;
    const p = game.player.pos;
    g2.clearRect(0, 0, W, W);
    mapEl.classList.toggle('space', game.world === 'space');
    if (game.world === 'space') { drawSpaceMap(); return; }
    const sea = g2.createRadialGradient(c, c, 10, c, c, c);
    sea.addColorStop(0, '#c9f3ff'); sea.addColorStop(1, '#78c9ee');
    g2.fillStyle = sea; g2.fillRect(0, 0, W, W);
    g2.fillStyle = '#ffffff55';
    for (let i = 0; i < 40; i++) { const a = i * 2.4, r = (i * 37) % (c - 10); g2.beginPath(); g2.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, 7, 2.5, 0, 0, Math.PI * 2); g2.fill(); }
    // 시야 부채꼴
    g2.save(); g2.translate(c, c); g2.rotate(-game.player.yaw + Math.PI);
    const fan = g2.createRadialGradient(0, 0, 0, 0, 0, 120);
    fan.addColorStop(0, '#ffffffaa'); fan.addColorStop(1, '#ffffff00');
    g2.fillStyle = fan; g2.beginPath(); g2.moveTo(0, 0); g2.arc(0, 0, 120, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g2.closePath(); g2.fill();
    g2.restore();
    for (const d of isl) {
      const x = c + (d.x - p.x) * s, y = c + (d.z - p.z) * s, r = Math.max(6, d.r * s);
      const look = ISLAND_LOOK[d.theme] ?? ISLAND_LOOK.islet;
      g2.fillStyle = '#fff6d8';
      g2.beginPath(); g2.arc(x, y, r + 5, 0, Math.PI * 2); g2.fill();
      const gr = g2.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
      gr.addColorStop(0, '#ffffffaa'); gr.addColorStop(0.35, look.color); gr.addColorStop(1, look.color);
      g2.fillStyle = gr;
      g2.beginPath(); g2.arc(x, y, r, 0, Math.PI * 2); g2.fill();
      if (d.theme === 'islet') { g2.fillStyle = '#c98a2b'; g2.font = '20px Jua'; g2.textAlign = 'center'; g2.textBaseline = 'alphabetic'; g2.fillText('✦', x, y + 7); }
    }
    arrow(c, game.player.yaw, '#ff7a9a');
  };

  // ── 시계(분위기 시각과 같게) + 지역명
  const clockT = $('.clock .t'), clockD = $('.clock .d'), sun = $('.clock .sun'), place = $('.clock .place');
  const clockEl = $('.clock'), o2 = $('.clock .o2 i');
  const region = $('.region');
  let curIsland: string | null | undefined;
  let regionTimer = 0;
  const showRegion = (name: string, sub: string, color: string, dark = '#5a3f22') => {
    (region.querySelector('.nm') as HTMLElement).textContent = name;
    (region.querySelector('.sub span') as HTMLElement).textContent = sub;
    region.style.setProperty('--rc', color);
    region.style.setProperty('--rs', dark);
    region.classList.remove('on'); void region.offsetWidth;
    region.classList.add('on');
    clearTimeout(regionTimer);
    if (!(window as any).__hudHold) regionTimer = window.setTimeout(() => region.classList.remove('on'), 3800);
  };
  const W_KO: Record<string, string> = { clear: '맑음', rain: '비', rainbow: '무지개', snow: '눈', cloudy: '흐림', storm: '폭풍', fog: '안개' };
  // atmosphere 와 같은 규칙: tod 없거나 auto → hour(기본 9.5) + t/60, 고정 프리셋이면 그 대표 시각
  const TOD_HOUR: Record<string, number> = { morning: 7.5, day: 12, sunset: 18.25, night: 22 };
  const qs = new URLSearchParams(location.search);
  let todName = qs.get('tod') ?? 'auto';
  const hour0 = Number(qs.get('hour') ?? 9.5);
  (ctx as any).onTod?.((n: string) => { if (n === 'auto' || TOD_HOUR[n] !== undefined) todName = n; });
  const nowHour = (t: number) => {
    const env = game.env;
    if (env && typeof env.hour === 'number' && env.tod) return env.hour;
    if (TOD_HOUR[todName] !== undefined) return TOD_HOUR[todName];
    return (((hour0 + t / 60) % 24) + 24) % 24;
  };
  const skyClass = (hr: number) => (hr < 5 || hr >= 19.5 ? 'night' : hr >= 17 ? 'dusk' : hr < 7 ? 'dawn' : 'day');
  let lastReal = -1;
  game.onUpdate((t) => {
    const now = performance.now();
    if (now - lastReal < 200 && lastReal >= 0) return;
    lastReal = now;
    if (shownCoins !== st.coins) { shownCoins += (st.coins - shownCoins) * 0.5; if (Math.abs(st.coins - shownCoins) < 1) shownCoins = st.coins; }
    coinV.textContent = fmt(shownCoins);
    const space = game.world === 'space';
    clockEl.classList.toggle('space', space);
    if (space) {
      clockT.textContent = '무중력 ☆';
      clockD.textContent = '산소 충분 · 둥실둥실';
      sun.className = 'sun planet';
      o2.style.width = `${80 + 18 * Math.sin(t * 0.3)}%`;
    } else {
      const hour = nowHour(t);
      const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
      clockT.textContent = `${hh < 12 ? '오전' : '오후'} ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}`;
      const wq = qs.get('weather');
      const w = game.env?.weather ?? (wq && wq !== 'clear' ? wq : 'clear');
      clockD.textContent = `${(game.env?.day ?? Math.floor(t / 1440)) + 1}일째 · ${W_KO[w] ?? w}`;
      sun.className = `sun ${skyClass(hour)}`;
    }
    const p = game.player.pos;
    const d = space ? null : ctx.island.islandAt(p.x, p.z);
    const name = space ? '우주' : d ? d.name : '먼바다';
    place.textContent = name; mapLbl.textContent = name;
    const look = d ? ISLAND_LOOK[d.theme] ?? ISLAND_LOOK.islet : { sub: '파도가 반짝반짝', color: '#6cc3ef' };
    place.style.background = space ? '#4a4fa8' : look.color;
    const id = space ? 'space' : d?.id ?? null;
    if (id !== curIsland) {
      showRegion(name, space ? '둥실둥실 별의 바다' : look.sub, space ? '#8f86ff' : look.color, space ? '#1d2257' : '#5a3f22');
      curIsland = id;
    }
    drawMap();
  });

  // ── 대화창(동숲식) + 토스트 묶기 — core ui.toast 를 인스턴스에서 감싼다
  const talk = $('.talk'), talkWho = $('.talk .who'), talkTx = $('.talk .tx');
  const SHOT = qs.get('shot') === '1';
  let typeTimer = 0, talkTimer = 0;
  const NAME_COL = ['#ff9cb8', '#7cc8ff', '#9bd77a', '#ffbe3b', '#c59bff', '#ff9f8a'];
  const say = (who: string, line: string, ms = 3600) => {
    let hsh = 0; for (const ch of who) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    talk.style.setProperty('--nc', NAME_COL[hsh % NAME_COL.length]);
    talkWho.textContent = who;
    talkTx.textContent = '';
    talk.classList.remove('on'); void talk.offsetWidth; talk.classList.add('on');
    clearInterval(typeTimer); clearTimeout(talkTimer);
    const chars = [...line];
    if (SHOT) talkTx.textContent = line;
    else {
      let i = 0;
      typeTimer = window.setInterval(() => { talkTx.textContent = chars.slice(0, ++i).join(''); if (i >= chars.length) clearInterval(typeTimer); }, 38);
    }
    if (!(window as any).__hudHold) talkTimer = window.setTimeout(() => talk.classList.remove('on'), Math.max(ms, chars.length * 38 + 1800));
  };
  const toastIcon = (s: string) =>
    /코인|팔았|🪙/.test(s) ? '🪙' : /공룡|알/.test(s) ? '🦕' : /도감|기록/.test(s) ? '📖' : /샀다|구매/.test(s) ? '🛍️' : /완성|뚝딱/.test(s) ? '🔨' : /기증|스탬프/.test(s) ? '🏛️' : /모자라|못/.test(s) ? '💦' : /상자/.test(s) ? '🎁' : '✨';
  const coreToast = game.ui.toast.bind(game.ui);
  let pend: Array<{ text: string; ms: number }> = [];
  let flushQ = false;
  const pushToast = (text: string, ms: number) => {
    const host = game.ui.toasts;
    if (!host) return coreToast(text, ms);
    while (host.children.length >= 3) host.firstElementChild!.remove();
    const d = document.createElement('div');
    d.className = 'toast dl-toast';
    const ic = document.createElement('span'); ic.className = 'ti'; ic.textContent = toastIcon(text);
    const tx = document.createElement('span'); tx.textContent = text;
    d.append(ic, tx);
    host.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; d.style.transform = 'translateY(-8px) scale(.96)'; }, ms - 300);
    setTimeout(() => d.remove(), ms);
  };
  const flush = () => {
    flushQ = false;
    const list = pend; pend = [];
    // 같은 틀(「…」 만 다른 것)은 하나로: '공룡 도감에 「A」 기록!' ×3 → '공룡 3종 기록! A·B·C'
    const groups = new Map<string, { names: string[]; text: string; ms: number }>();
    for (const it of list) {
      const m = it.text.match(/^(.*)「(.+?)」(.*)$/);
      const key = m ? m[1] + '「」' + m[3] : it.text;
      const g = groups.get(key);
      if (g) { if (m) g.names.push(m[2]); g.ms = Math.max(g.ms, it.ms); }
      else groups.set(key, { names: m ? [m[2]] : [], text: it.text, ms: it.ms });
    }
    for (const g of groups.values()) {
      if (g.names.length > 1) {
        const cat = (g.text.match(/^(\S+?)\s*도감/) ?? [])[1];
        pushToast(`${cat ? cat + ' ' : ''}${g.names.length}종 기록! ${g.names.join(' · ')}`, g.ms + 600);
      } else pushToast(g.text, g.ms);
    }
  };
  game.ui.toast = (text: string, ms = 2200) => {
    const m = text.match(/^([^:：\s][^:：]{0,11})\s*[:：]\s+(.+)$/s);
    if (m && !/^E\s/.test(text)) { say(m[1].trim(), m[2].trim(), ms); return; }
    pend.push({ text, ms });
    if (!flushQ) { flushQ = true; requestAnimationFrame(flush); setTimeout(() => flushQ && flush(), 60); }
  };

  // ── 탑승 중 프롬프트: E 는 내리기라서 다른 상호작용 대신 'E 내리기' 고정(코어 선택 로직 수정은 needs)
  const coreSetPrompt = game.ui.setPrompt.bind(game.ui);
  game.ui.setPrompt = (text: string | null) => coreSetPrompt(game.player.mounted ? 'E 내리기' : text);

  // ── 잡았다 연출
  const catchEl = $('.catch'), catchBox = $('.catch .box');
  let catchTimer = 0;
  const rnd = ctx.rng('hud:confetti');
  const confetti = (host: HTMLElement, colors: string[], n = 36) => {
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3, r = 180 + rnd() * 220;
      c.style.setProperty('--x', `${Math.cos(a) * r}px`); c.style.setProperty('--y', `${Math.sin(a) * r + 120}px`); c.style.setProperty('--r', `${rnd() * 720 - 360}deg`);
      c.style.background = colors[i % colors.length];
      if (i % 3 === 0) c.style.borderRadius = '50%';
      host.appendChild(c);
      setTimeout(() => c.remove(), 1700);
    }
  };
  game.ui.renderCatch = (c, isNew) => {
    const s = c.species;
    const col = RARITY_COLOR[Math.min(5, Math.max(1, s.rarity))];
    const { got, total } = st.dexCount(s.category);
    catchEl.style.setProperty('--rc', col);
    catchBox.innerHTML = `<div class="got">${s.rarity >= 4 ? '대박! ' : ''}잡았다!</div>
      <div class="nm">${esc(s.name)}</div>
      <div class="stars">${'★'.repeat(s.rarity)}<span style="opacity:.3">${'★'.repeat(Math.max(0, 5 - s.rarity))}</span></div>
      <div class="info">${CAT_ICON[s.category] ?? '📦'} ${c.sizeText ? esc(c.sizeText) + ' · ' : ''}도감 ${got}/${total}${econ() ? ` · ${fmt(econ().priceOf(s.id))}코인` : ''}</div>
      ${c.line ? `<div class="line">${esc(c.line)}</div>` : ''}
      ${isNew ? '<div class="stamp">NEW</div>' : ''}`;
    catchEl.classList.remove('on'); void catchEl.offsetWidth; catchEl.classList.add('on');
    confetti(catchEl, [col, '#ffffff', '#ffe58a', '#ffb3c8', '#a8e6ff'], 18 + s.rarity * 8);
    clearTimeout(catchTimer);
    if (!(window as any).__hudHold) catchTimer = window.setTimeout(() => catchEl.classList.remove('on'), 3000);
  };

  // ── 상자 결과
  const lootEl = $('.loot');
  let lootTimer = 0;
  st.on((e) => {
    if (e.type !== 'chest-open') return;
    const tier = e.tier as ChestTier;
    const T = TIERS[tier];
    const loot = (e.loot as Array<{ id: string; n: number; name: string }>) ?? [];
    lootEl.style.setProperty('--rc', T.color);
    lootEl.innerHTML = `<div class="tier">${T.name} 상자!</div><div class="row">${loot.map((l, i) => {
      const ic = l.id === 'coins' ? '🪙' : l.id === 'stars' ? '⭐' : MAT.get(l.id)?.icon ?? '🎁';
      return `<div class="it dl-card" style="animation-delay:${0.25 + i * 0.12}s">${ic} ${esc(l.name)} ×${fmt(l.n)}</div>`;
    }).join('')}</div>`;
    lootEl.classList.remove('on'); void lootEl.offsetWidth; lootEl.classList.add('on');
    confetti(lootEl, [T.color, T.glow, '#ffe58a', '#fff'], tier === 'legend' ? 80 : tier === 'epic' ? 56 : 30);
    clearTimeout(lootTimer);
    if (!(window as any).__hudHold) lootTimer = window.setTimeout(() => lootEl.classList.remove('on'), 3400);
  });

  // ── 창
  const win = $('.win'), wTtl = $('.win .ttl'), wMeta = $('.win .meta'), wTabs = $('.win .tabs'), wBody = $('.win .body');
  let cur: { kind: string; tab: string; sel?: string } | null = null;
  const close = () => { win.classList.remove('on'); cur = null; game.player.locked = false; };
  ($('.win .x')).onclick = close;
  const open = (kind: string, tab?: string) => { cur = { kind, tab: tab ?? defaultTab(kind) }; game.player.locked = true; render(); win.classList.add('on'); };
  const defaultTab = (k: string) => (k === 'dex' ? 'fish' : k === 'shop' ? 'sell' : k === 'craft' ? '전체' : 'all');
  const WC: Record<string, string> = { dex: '#7cc8ff', bag: '#ffb36b', shop: '#ffbe3b', craft: '#9bd77a', museum: '#c59bff', board: '#ff9cb8' };
  const icoOf = (id: string) => MAT.get(id)?.icon ?? GOODS[id]?.icon ?? CAT_ICON[st.species.get(id)?.category ?? ''] ?? '🎁';
  const nameOf = (id: string) => st.species.get(id)?.name ?? MAT.get(id)?.name ?? GOODS[id]?.name ?? id;
  const ccOf = (id: string) => MAT.get(id)?.color ?? (st.species.get(id) ? RARITY_COLOR[st.species.get(id)!.rarity] + '88' : '#ffe7c2');
  const tabs = (list: Array<[string, string]>) => {
    wTabs.innerHTML = list.map(([id, nm]) => `<button class="tab${cur!.tab === id ? ' on' : ''}" data-t="${id}">${nm}</button>`).join('');
    wTabs.querySelectorAll('button').forEach((b) => (b.onclick = () => { cur!.tab = (b as HTMLElement).dataset.t!; cur!.sel = undefined; render(); }));
  };
  const render = () => {
    if (!cur) return;
    wTabs.classList.remove('dex');
    win.classList.toggle('wide', cur.kind === 'dex');
    win.style.setProperty('--wc', WC[cur.kind] ?? '#ffb36b');
    const E = econ();
    const bagIds = Object.keys(st.bag).filter((k) => st.bag[k] > 0);
    if (cur.kind === 'dex') {
      wTtl.textContent = '📖 도감';
      const all = st.dexCount();
      wMeta.textContent = `모은 종 ${all.got} / ${all.total}`;
      tabs(DEX_TABS.map((t) => { const n = [...st.species.values()].filter((s) => t.cats.includes(s.category)); return [t.id, `<span class="ti">${t.icon}</span>${t.name}<small>${n.filter((s) => st.dex[s.id]).length}/${n.length}</small>`] as [string, string]; }));
      wTabs.classList.add('dex');
      const tab = DEX_TABS.find((t) => t.id === cur!.tab)!;
      const list = [...st.species.values()].filter((s) => tab.cats.includes(s.category)).sort((a, b) => a.rarity - b.rarity);
      const sel = cur.sel ? st.species.get(cur.sel) : undefined;
      wBody.innerHTML = (sel && st.dex[sel.id] ? detail(sel) : '') + `<div class="grid dexg" style="margin-top:12px">${list.map((s) => {
        const rec = st.dex[s.id];
        return `<div class="cell${rec ? '' : ' miss'}" data-id="${s.id}" style="--cc:${RARITY_COLOR[s.rarity]}99"><div class="ico">${rec ? CAT_ICON[s.category] ?? '❔' : `<span class="sil">${CAT_ICON[s.category] ?? '❔'}</span><b>?</b>`}</div>
          <div class="nm">${rec ? esc(s.name) : '???'}</div><div class="sm">${'★'.repeat(s.rarity)}</div>${rec && E?.isDonated(s.id) ? '<div class="badge">기증</div>' : ''}</div>`;
      }).join('') || '<div style="font-size:18px;color:#a88a66">아직 이 섬 친구들이 등록되지 않았어요</div>'}</div>`;
      wBody.querySelectorAll('.cell').forEach((c) => ((c as HTMLElement).onclick = () => { cur!.sel = (c as HTMLElement).dataset.id; render(); }));
    } else if (cur.kind === 'bag' || (cur.kind === 'shop' && cur.tab === 'sell')) {
      if (cur.kind === 'bag') { wTtl.textContent = '🎒 가방'; tabs([['all', '전부'], ['catch', '생물'], ['mat', '재료'], ['goods', '물건']]); }
      else { wTtl.textContent = '🦆 꽥꽥상회'; tabs([['sell', '💰 팔기'], ['buy', '🛒 사기']]); }
      wMeta.textContent = `${bagIds.length} / 20칸`;
      const hot = E?.market().hot ?? [];
      const ids = bagIds.filter((id) => {
        if (cur!.kind === 'shop') return !GOODS[id] || MAT.has(id);
        if (cur!.tab === 'catch') return st.species.has(id) && !MAT.has(id);
        if (cur!.tab === 'mat') return MAT.has(id);
        if (cur!.tab === 'goods') return !!GOODS[id] && !MAT.has(id);
        return true;
      });
      const hotLine = hot.length ? `<div class="detail dl-card" style="margin:0 0 12px"><div class="ico" style="--cc:#ffd9e6">📣</div><div style="font-size:19px">오늘의 인기! <span style="color:#ff6f8e">${hot.map((x: string) => esc(nameOf(x))).join(' · ')}</span> 는 ×2 로 사요!<br><small style="color:#a88a66">같은 걸 하루 10개 넘게 팔면 조금씩 싸져요</small></div></div>` : '';
      wBody.innerHTML = (cur.kind === 'shop' ? hotLine : '') + `<div class="grid">${ids.map((id) => {
        const sellable = st.species.has(id);
        const pr = sellable && E ? E.priceOf(id) : 0;
        return `<div class="cell" style="--cc:${ccOf(id)}"><div class="cnt">×${st.bag[id]}</div>${hot.includes(id) ? '<div class="badge">인기!</div>' : ''}<div class="ico">${icoOf(id)}</div>
          <div class="nm">${esc(nameOf(id))}</div>${sellable ? `<div class="sm">🪙 ${fmt(pr)}</div>` : ''}${cur!.kind === 'shop' && sellable ? `<button class="btn gold" data-sell="${id}">팔기</button>` : ''}</div>`;
      }).join('')}${ids.length ? Array.from({ length: Math.max(0, 20 - ids.length) }, () => '<div class="cell slot"></div>').join('') : emptyBag(cur!.kind === 'shop')}</div>`;
      wBody.querySelectorAll('[data-sell]').forEach((b) => ((b as HTMLElement).onclick = (ev) => { ev.stopPropagation(); const id = (b as HTMLElement).dataset.sell!; const got = E.sell(id, 1); if (got) game.ui.toast(`${nameOf(id)} 팔았다! +${fmt(got)}코인`); render(); }));
    } else if (cur.kind === 'shop') {
      wTtl.textContent = '🦆 꽥꽥상회'; tabs([['sell', '💰 팔기'], ['buy', '🛒 사기']]);
      wMeta.textContent = `🪙 ${fmt(st.coins)}`;
      wBody.innerHTML = `<div class="grid">${SHOP_ITEMS.map((it) => {
        const pr = E?.shopPrice(it.id) ?? it.price; const ok = st.coins >= pr;
        return `<div class="cell${ok ? '' : ' dim'}" style="--cc:${it.kind === 'tool' ? '#cfe8ff' : it.kind === 'seed' ? '#d8f5c8' : it.kind === 'bait' ? '#ffe2c4' : '#f1dcff'}"><div class="ico">${it.icon}</div><div class="nm">${esc(it.name)}</div><div class="sm">${esc(it.desc)}</div><button class="btn${ok ? ' gold' : ' off'}" data-buy="${it.id}">🪙 ${fmt(pr)}</button></div>`;
      }).join('')}</div>`;
      wBody.querySelectorAll('[data-buy]').forEach((b) => ((b as HTMLElement).onclick = () => { const id = (b as HTMLElement).dataset.buy!; if (E?.buy(id)) game.ui.toast(`${SHOP_ITEMS.find((s) => s.id === id)!.name} 샀다! 고마워꽥!`); render(); }));
    } else if (cur.kind === 'craft') {
      wTtl.textContent = '🔨 작업대'; tabs([['전체', '전부'], ['가구', '🛋️ 가구'], ['도구', '🎣 도구'], ['탈것 부품', '⛵ 탈것 부품']]);
      wMeta.textContent = `레시피 ${RECIPES.length}개`;
      const list = RECIPES.filter((r) => cur!.tab === '전체' || r.kind === cur!.tab);
      wBody.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">${list.map((r) => {
        const ok = E?.canCraft(r.id);
        const needs = Object.entries(r.needs).map(([k, v]) => `<span style="color:${st.has(k, v) ? '#5aa864' : '#d77a7a'}">${MAT.get(k)?.icon ?? ''}${esc(nameOf(k))} ${st.bag[k] ?? 0}/${v}</span>`).join('<br>');
        return `<div class="cell${ok ? '' : ' dim'}" style="--cc:${ok ? '#d8f5c8' : '#f3e6cf'}"><div class="ico">${r.icon}</div><div class="nm">${esc(r.name)}</div><div class="sm" style="line-height:1.35;margin:4px 0">${needs}</div><button class="btn${ok ? '' : ' off'}" data-craft="${r.id}">만들기</button></div>`;
      }).join('')}</div>`;
      wBody.querySelectorAll('[data-craft]').forEach((b) => ((b as HTMLElement).onclick = () => { const id = (b as HTMLElement).dataset.craft!; if (E?.craft(id)) { game.ui.toast(`뚝딱뚝딱… ${RECIPES.find((r) => r.id === id)!.name} 완성!`); confetti(win, ['#9bd77a', '#ffe58a', '#fff'], 30); } render(); }));
    } else if (cur.kind === 'museum') {
      wTtl.textContent = '🏛️ 박물관'; tabs([['all', '기증할 수 있는 것']]);
      wMeta.textContent = `스탬프 ${E?.stamps ?? 0}개`;
      const ids = bagIds.filter((id) => { const s = st.species.get(id); return s && s.category !== 'item' && !E?.isDonated(id); });
      wBody.innerHTML = `<div class="detail dl-card" style="margin:0 0 12px"><div class="ico" style="--cc:#e8dcff">🦉</div><div style="font-size:19px">후후~ 처음 보는 친구를 기증하면 <span style="color:#9d6bff">스탬프와 반짝별</span>을 줄게!</div></div>
        <div class="grid">${ids.map((id) => `<div class="cell" style="--cc:${ccOf(id)}"><div class="ico">${icoOf(id)}</div><div class="nm">${esc(nameOf(id))}</div><button class="btn" data-don="${id}">기증하기</button></div>`).join('') || '<div style="font-size:18px;color:#a88a66">지금은 기증할 게 없어요. 새 친구를 잡아 와요!</div>'}</div>`;
      wBody.querySelectorAll('[data-don]').forEach((b) => ((b as HTMLElement).onclick = () => { const id = (b as HTMLElement).dataset.don!; if (E?.donate(id)) { game.ui.toast(`${nameOf(id)} 기증 완료! 스탬프 쾅!`); confetti(win, ['#c59bff', '#ffe58a', '#fff'], 36); } render(); }));
    } else if (cur.kind === 'board') {
      wTtl.textContent = '📌 마을 게시판'; tabs([['all', '오늘의 부탁']]);
      const reqs = E?.requests() ?? [];
      wMeta.textContent = `${reqs.filter((r: any) => r.done).length} / ${reqs.length} 완료`;
      const faces = ['🐰', '🐻', '🐱', '🐶', '🐸'];
      wBody.innerHTML = reqs.map((r: any, i: number) => {
        const have = st.bag[r.species.id] ?? 0;
        return `<div class="req dl-card${r.done ? ' done' : ''}"><div class="who">${faces[i % faces.length]}</div><div class="tx">"${esc(r.species.name)} ${r.n}마리 잡아다 줄래?"<small>보상 🪙 ${fmt(r.reward)} · ⭐ ${r.stars} · 가진 것 ${have}/${r.n}</small><div class="bar"><i style="width:${Math.min(100, (have / r.n) * 100)}%"></i></div></div>
          ${r.done ? '<button class="btn off">완료!</button>' : `<button class="btn${have >= r.n ? ' gold' : ' off'}" data-req="${r.id}">건네주기</button>`}</div>`;
      }).join('') || '<div style="font-size:18px;color:#a88a66">오늘은 부탁이 없어요</div>';
      wBody.querySelectorAll('[data-req]').forEach((b) => ((b as HTMLElement).onclick = () => { if (E?.fulfill((b as HTMLElement).dataset.req!)) { game.ui.toast('고마워! 보상을 받았다!'); confetti(win, ['#ff9cb8', '#ffe58a', '#fff'], 36); } render(); }));
    }
  };
  const BAG_SVG = `<svg viewBox="0 0 120 120" width="132" height="132"><ellipse cx="60" cy="110" rx="40" ry="6" fill="#e9d3a8"/>
    <path d="M40 36 Q40 14 60 14 Q80 14 80 36" fill="none" stroke="#c98a52" stroke-width="8" stroke-linecap="round"/>
    <path d="M22 50 Q22 34 40 34 H80 Q98 34 98 50 L100 92 Q100 106 84 106 H36 Q20 106 20 92 Z" fill="#ffb36b" stroke="#fff" stroke-width="5"/>
    <path d="M24 54 Q60 70 96 54" fill="none" stroke="#e8914a" stroke-width="5" stroke-linecap="round"/>
    <rect x="50" y="58" width="20" height="14" rx="5" fill="#ffe08a" stroke="#fff" stroke-width="3"/>
    <circle cx="46" cy="84" r="3.4" fill="#6b4a2b"/><circle cx="74" cy="84" r="3.4" fill="#6b4a2b"/>
    <ellipse cx="38" cy="92" rx="6" ry="3.5" fill="#ff8fa8" opacity=".7"/><ellipse cx="82" cy="92" rx="6" ry="3.5" fill="#ff8fa8" opacity=".7"/>
    <path d="M55 90 Q60 95 65 90" fill="none" stroke="#6b4a2b" stroke-width="3" stroke-linecap="round"/>
    <path d="M100 24 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#ffd23f"/></svg>`;
  const emptyBag = (shop: boolean) => `<div class="empty">${BAG_SVG}<div><div class="e1">${shop ? '팔 수 있는 게 아직 없어요' : '가방이 텅 비었어요!'}</div><div class="e2">물고기·곤충·과일을 모아서 꽥꽥상회에 팔아 봐요</div></div></div>${Array.from({ length: 20 }, () => '<div class="cell slot"></div>').join('')}`;
  const detail = (s: Species) => {
    const rec = st.dex[s.id];
    return `<div class="detail dl-card"><div class="ico" style="--cc:${RARITY_COLOR[s.rarity]}">${CAT_ICON[s.category] ?? '❔'}</div><div>
      <div style="font-size:26px">${esc(s.name)} <span style="color:${RARITY_COLOR[s.rarity]};-webkit-text-stroke:1px #fff">${'★'.repeat(s.rarity)}</span></div>
      <div style="color:#a88a66;font-size:16px">${rec ? `잡은 수 ${rec.count} · 최고 ${rec.best ? rec.best.toFixed(1) + 'cm' : '-'}` : ''}${s.habitat ? ' · ' + esc(s.habitat) : ''}</div>
      <div style="font-size:17px;margin-top:4px">${esc(s.desc ?? '아직 수수께끼가 많은 친구.')}</div></div></div>`;
  };

  st.on((e) => {
    if (e.type === 'open-shop') open('shop');
    else if (e.type === 'open-craft') open('craft');
    else if (e.type === 'open-museum') open('museum');
    else if (e.type === 'open-board') open('board');
    if (cur && (e.type === 'coins' || e.type === 'bag')) render();
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && cur) { close(); return; }
    if (e.code === 'Tab') { e.preventDefault(); if (cur?.kind === 'dex') close(); else open('dex'); }
    if (e.code === 'KeyI') { if (cur?.kind === 'bag') close(); else open('bag'); }
  });

  (game as Game & { dex?: unknown }).dex = { open: (k = 'dex', tab?: string) => open(k, tab), close, toast: (t: string) => game.ui.toast(t), showRegion };
}
