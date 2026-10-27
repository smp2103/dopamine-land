// netplay-play 창 — '🎡 같이 놀기'(놀이·친구 섬 시장·도감 교환·칭호), 옆 칩, Y 단축키, 지도 표시(레이스 코스·방문객 상자).
// 겉모양은 netplay 의 .np 카드 스타일을 같이 쓴다(전역 CSS). 이 파일만 DOM 을 만진다.
import type { Game } from '../../core/game';
import type { PanelCtx, PanelDef, HudHelpers } from '../../core/api';
import { BOSSES, BOSS_KINDS, TITLES, COURSES, VISITOR_CHEST, DEX_PER_DAY, RACE_NAMES, fmtMs, type GameKind, type BossKind } from './logic';
import { gameLabel, type NetPlay } from './play';

const CSS = `
#dl .npp-games { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
#dl .npp-g { font-family: inherit; color: #4a3b2a; background: #fffdf6; border: 3px solid #f0dcb4; border-radius: 18px; padding: 10px 8px; cursor: pointer; display: grid; gap: 2px; text-align: center; font-size: 16px; }
#dl .npp-g small { font-size: 12px; color: #a88a66; }
#dl .npp-g:hover { transform: translateY(-2px); border-color: #ffb36b; }
#dl .npp-g.off { opacity: .55; }
#dl .npp-row { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-bottom: 2px dashed #f3e3c4; }
#dl .npp-row:last-child { border-bottom: 0; }
#dl .npp-row .ic { font-size: 24px; width: 30px; text-align: center; }
#dl .npp-row .nm { flex: 1; }
#dl .npp-row .pr { color: #b07a3a; min-width: 80px; text-align: right; }
#dl .npp-hot { background: #ff9fb8; color: #fff; border-radius: 999px; padding: 0 8px; font-size: 12px; margin-left: 4px; }
#dl .npp-title { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; background: #fff3d6; margin: 3px; }
#dl .npp-title.no { opacity: .4; filter: grayscale(1); }
#dl .npp-chip .v { white-space: nowrap; }
`;

export function registerPlayUi(game: Game, np: NetPlay) {
  if (typeof document !== 'undefined') {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  let rr = false;
  const rerender = () => {
    if (rr) return;
    rr = true;
    queueMicrotask(() => { rr = false; if (game.hud.isOpen('netplayplay')) game.hud.rerender(); });
  };
  np.subscribe(rerender);
  /** 받은 도감 제안에 돌려줄 종(고른 것) */
  let backSel: string | null = null;

  const notConnected = (h: HudHelpers) => `<div class="np"><div class="np-card"><h3>👫 친구가 필요해요</h3><div>같이 놀기는 친구랑 연결됐을 때 열려요. <b>T</b>(친구 창) → 연결에서 초대 코드를 주고받아요!</div><div class="np-row" style="margin-top:8px"><button class="btn pink" data-act="friends">친구 창 열기</button></div><small>${h.esc('방문객 상자 · 친구 섬 시세 · 레이스 · 낚시 대회 · 협동 보스 · 도감 교환 · 숨바꼭질 · 불꽃놀이')}</small></div></div>`;

  const runCard = (): string => {
    const r = np.run;
    if (r) {
      const what = r.kind === 'race' ? RACE_NAMES[r.race] : r.kind === 'contest' ? '🎣 낚시 대회' : r.role === 'seeker' ? '🙈 숨바꼭질(술래)' : '🤫 숨바꼭질(숨는 쪽)';
      const sub = r.kind === 'race'
        ? (r.phase === 'gather' ? `${np.needText(r.race)} 🏁 출발선으로! (${COURSES[r.race].name})` : r.phase === 'go' ? `체크포인트 ${r.track.passed}/${r.track.total}${r.myMs !== null ? ` · 골인 ${fmtMs(r.myMs)}` : ''}` : '곧 출발!')
        : r.kind === 'contest' ? `지금까지 ${Math.round(r.me.total)}cm(${r.me.n}마리) · ${np.peerName()} ${Math.round(r.peer.total)}cm` : r.phase === 'hide' ? '숨는 시간이에요' : '찾는 시간이에요';
      return `<div class="np-card"><h3>지금 하는 놀이</h3><div class="np-row"><b style="font-weight:normal;font-size:18px">${what}</b><span class="np-sub">${sub}</span></div><div class="np-row" style="margin-top:6px"><button class="btn gray" data-act="quit">그만하기</button></div></div>`;
    }
    const iv = np.invite;
    if (iv) {
      return iv.from === 'peer'
        ? `<div class="np-card"><h3>💌 초대가 왔어요!</h3><div>${np.peerName()}가 <b style="font-weight:normal">${gameLabel(iv.g)}</b> 하재요</div><div class="np-row" style="margin-top:8px"><button class="btn pink" data-act="yes">좋아!</button><button class="btn gray" data-act="no">다음에</button></div></div>`
        : `<div class="np-card"><h3>💌 대답 기다리는 중…</h3><div>${gameLabel(iv.g)}</div><div class="np-row" style="margin-top:8px"><button class="btn gray" data-act="cancel">초대 거두기</button></div></div>`;
    }
    return '';
  };

  const playTab = (h: HudHelpers): string => {
    const games: GameKind[] = ['race-bike', 'race-boat', 'race-run', 'contest', 'hide'];
    const hints: Record<GameKind, string> = { 'race-bike': '말랑 언덕 한 바퀴', 'race-boat': '부두 앞바다', 'race-run': '들판 달리기', contest: '10분 · 총 길이', hide: '내가 술래!' };
    const busy = !!np.run || !!np.invite;
    const bossBtns = BOSS_KINDS.map((k: BossKind) => {
      const D = BOSSES[k];
      const here = np.bossHere(k);
      return `<button class="npp-g${here.ok ? '' : ' off'}" data-act="boss" data-arg="${k}" title="${h.esc(here.why)}"><span style="font-size:26px">${D.icon}</span>${h.esc(D.name)}<small>${here.ok ? '지금 부를 수 있어요!' : h.esc(here.why)}</small></button>`;
    }).join('');
    const chestLine = np.isHost
      ? (np.chestOn ? '🎈 광장에 방문객 상자를 띄웠어요 — 친구가 하루 1번 열 수 있어요' : '🎈 오늘 방문객 상자는 열렸어요. 내일 다시 떠요')
      : np.chestOn ? '🎈 광장(꽥사장 가게 옆)에 방문객 상자가 있어요! 손님만 하루 1번' : '🎈 오늘 방문객 상자는 열었어요';
    const extra = [
      chestLine,
      np.heart ? '💞 둘이 같은 물가 — 하트잉어·하트무당벌레 ×2' : '💞 같은 물가에 둘이 서면 하트잉어·하트무당벌레 ×2',
      '🤝 친구 방문 보너스: 둘 다 ★3 이상 ×1.1',
      np.reelFriend ? `🎣 ${np.peerName()}가 ★${np.reelFriend.rarity} 큰 물고기랑 줄다리기 중! 곁에서 E 연타` : '🎣 친구가 줄다리기할 때 곁에서 E 연타 → 협동 릴',
      np.peerDrive.kind && np.peerDrive.seats >= 2 ? `🫂 ${np.peerName()}의 2인승에 가까이 가서 E 로 뒷자리에!` : '🫂 2인승(자전거·카트·요트·열기구) 뒷자리에 같이 타요 · 자전거는 둘 다 밟으면 ×1.3',
    ].map((t) => `<div>${h.esc(t)}</div>`).join('');
    return `<div class="np">${runCard()}
      <div class="np-card"><h3>같이 하는 놀이 ${busy ? '<small>(하나씩!)</small>' : ''}</h3><div class="npp-games">${games.map((g) => `<button class="npp-g${busy ? ' off' : ''}" data-act="inv" data-arg="${g}">${gameLabel(g)}<small>${hints[g]}</small></button>`).join('')}
        <button class="npp-g" data-act="fw">🎆 불꽃놀이<small>펑! 친구 화면에도</small></button></div></div>
      <div class="np-card"><h3>협동 보스 <small>둘이 같이 E 연타해야 깎여요</small></h3><div class="npp-games">${bossBtns}</div></div>
      <div class="np-card"><h3>친구 섬 소식</h3>${extra}</div></div>`;
  };

  const marketTab = (h: HudHelpers): string => {
    if (!np.isGuest) {
      return `<div class="np"><div class="np-card"><h3>🦆 우리 섬 꽥사장</h3><div>놀러 온 ${h.esc(np.peerName())}는 우리 섬 시세(친구 섬 인기 생물 ×2)로 팔 수 있어요.<br>친구 섬에 놀러 가면 거기 시세로 팔 수 있어요 — 인기 생물이 섬마다 달라요!</div></div></div>`;
    }
    const near = np.nearShop();
    const rows = np.marketRows();
    const q = np.quote;
    const list = rows.map((r) => `<div class="npp-row"><span class="ic">${h.ico(r.id)}</span><span class="nm">${h.esc(np.name(r.id))}${r.hot ? '<span class="npp-hot">인기 ×2</span>' : ''} <small>×${r.have}</small></span><span class="pr">${h.fmt(r.unit)}코인</span>
      <button class="btn${near ? ' pink' : ' gray'}" data-act="sell" data-arg="${h.esc(r.id)}" data-n="1" ${near ? '' : 'disabled'}>1개</button>
      <button class="btn${near ? ' pink' : ' gray'}" data-act="sell" data-arg="${h.esc(r.id)}" data-n="${r.have}" ${near ? '' : 'disabled'}>전부</button></div>`).join('');
    return `<div class="np"><div class="np-card"><h3>🦆 ${h.esc(np.peerName())}네 꽥사장 시세 ${q && q.hot.length ? `<small>오늘 인기: ${q.hot.map((id) => h.esc(np.name(id))).join(' · ')}</small>` : ''}</h3>
      ${near ? '' : `<div class="np-note">팔려면 ${h.esc(np.peerName())}네 섬 꽥사장 가게 앞으로 가요! (지금은 값만 볼 수 있어요)</div>`}
      ${q ? (list || '<small>팔 수 있는 게 없어요. 잡아 와요!</small>') : '<small>시세를 물어보는 중…</small>'}
      <div class="np-row" style="margin-top:8px"><button class="btn blue" data-act="quote">🔄 시세 다시 보기</button></div></div></div>`;
  };

  const dexTab = (h: HudHelpers, pc: PanelCtx): string => {
    const left = np.dexLeft();
    const mine = np.dexGiftList();
    const inc = np.dexIn;
    const incCard = inc ? `<div class="np-card"><h3>📒 ${h.esc(np.peerName())}가 도감 교환하재요!</h3><div>받을 종: <b style="font-weight:normal">${h.ico(inc.give)} ${h.esc(np.name(inc.give))}</b></div>
      <div class="np-sub" style="margin:6px 0">돌려줄 종을 하나 골라도 되고, 그냥 받아도 돼요</div>
      <div class="np-grid">${mine.slice(0, 40).map((s) => `<button class="np-it${backSel === s.id ? ' on' : ''}" data-act="back" data-arg="${h.esc(s.id)}"><span class="ic">${h.ico(s.id)}</span>${h.esc(s.name)}</button>`).join('')}</div>
      <div class="np-row" style="margin-top:8px"><button class="btn pink" data-act="dex-yes">${backSel ? `${h.esc(np.name(backSel))} 주고 받기` : '그냥 받기'}</button><button class="btn gray" data-act="dex-no">다음에</button></div></div>` : '';
    const out = np.dexOut ? `<div class="np-ok">📒 ${h.esc(np.name(np.dexOut.give))} 교환 제안을 보냈어요 — 대답 기다리는 중</div>` : '';
    const from = Object.entries(np.dexFrom());
    void pc;
    return `<div class="np">${incCard}
      <div class="np-card"><h3>📒 ${h.esc(np.peerName())}에게 없는 내 친구들 <small>오늘 ${left}/${DEX_PER_DAY}번 남음</small></h3>${out}
        <div class="np-sub" style="margin-bottom:6px">받은 종은 도감에 "○○가 준 친구"로 표시돼요. 박물관 기증은 직접 잡아야 해요!</div>
        <div class="np-grid">${mine.length ? mine.slice(0, 60).map((s) => `<button class="np-it" data-act="offer" data-arg="${h.esc(s.id)}" ${left <= 0 || np.dexOut ? 'disabled' : ''}><span class="ic">${h.ico(s.id)}</span>${h.esc(s.name)}<small>${'★'.repeat(Math.max(1, Math.min(5, s.rarity)))}</small></button>`).join('') : '<small style="grid-column:1/-1">친구가 내 도감 친구를 다 가지고 있어요!</small>'}</div></div>
      <div class="np-card"><h3>💝 친구가 준 친구 <small>${from.length}종</small></h3>${from.length ? from.slice(-30).reverse().map(([id, f]) => `<span class="npp-title">${h.ico(id)} ${h.esc(np.name(id))} <small>${h.esc(f.name)}가 준 친구</small></span>`).join('') : '<small>아직 없어요</small>'}</div></div>`;
  };

  const meTab = (h: HudHelpers): string => {
    const p = np.flags();
    const titles = Object.values(TITLES).map((T) => `<span class="npp-title${p.titles.includes(T.id) ? '' : ' no'}" title="${h.esc(T.desc)}">${T.icon} ${h.esc(T.name)}</span>`).join('');
    const w = p.wins;
    return `<div class="np"><div class="np-card"><h3>🏅 칭호 <small>${p.titles.length}/${Object.keys(TITLES).length}</small></h3>${titles}</div>
      <div class="np-card"><h3>📊 친구랑 놀은 기록</h3><div>🏁 레이스 승리 ${w.race ?? 0} · 🎣 대회 우승 ${w.contest ?? 0} · 🙈 숨바꼭질 승리 ${w.hide ?? 0} · 💞 보스 ${w.boss ?? 0}</div></div></div>`;
  };

  const panel: PanelDef = {
    kind: 'netplayplay', title: '같이 놀기', color: '#ffb36b', icon: '🎡', defaultTab: 'play',
    tabs: () => [
      { id: 'play', label: '놀이', icon: '🎡', badge: np.invite?.from === 'peer' ? '!' : undefined },
      { id: 'market', label: '친구 섬 시장', icon: '🦆' },
      { id: 'dex', label: '도감 교환', icon: '📒', badge: np.dexIn ? '!' : undefined },
      { id: 'me', label: '칭호', icon: '🏅' },
    ],
    meta: () => (np.connected ? `${np.peerName()}와 노는 중 · ${np.status()}` : ''),
    onOpen() { if (np.isGuest) np.askQuote(); },
    render(body, pc) {
      const h = pc.h;
      const tab = pc.tab ?? 'play';
      if (tab === 'market') np.askQuote();
      body.innerHTML = !np.connected ? notConnected(h) : tab === 'market' ? marketTab(h) : tab === 'dex' ? dexTab(h, pc) : tab === 'me' ? meTab(h) : playTab(h);
      body.onclick = (ev) => {
        const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
        if (!b || !body.contains(b) || (b as HTMLButtonElement).disabled) return;
        const arg = b.dataset.arg ?? '';
        switch (b.dataset.act) {
          case 'friends': game.hud.open('friends', 'link'); return;
          case 'inv': np.inviteTo(arg as GameKind); break;
          case 'yes': np.answer(true); break;
          case 'no': np.answer(false); break;
          case 'cancel': np.cancelInvite(); break;
          case 'quit': np.quitRun(); break;
          case 'fw': if (np.firework()) game.hud.close(); return;
          case 'boss': if (np.callBoss(arg as BossKind)) game.hud.close(); return;
          case 'quote': np.askQuote(true); break;
          case 'sell': np.sellFriend(arg, Number(b.dataset.n) || 1); np.askQuote(true); break;
          case 'offer': np.offerDex(arg); break;
          case 'back': backSel = backSel === arg ? null : arg; break;
          case 'dex-yes': np.acceptDex(backSel); backSel = null; break;
          case 'dex-no': np.declineDex(); backSel = null; break;
        }
        pc.rerender();
      };
    },
    onClose() { backSel = null; },
  };
  game.hud.registerPanel(panel);

  // ── 칩: 연결됐을 때만 보인다
  game.hud.registerChip({
    id: 'netplayplay:chip', order: 61,
    render(el) {
      el.innerHTML = '<div class="chip dl-card np-chip npp-chip" title="같이 놀기 (Y)" style="display:none"><div class="ci">🎡</div><span class="v">같이 놀기</span></div>';
      (el.querySelector('.npp-chip') as HTMLElement).onclick = () => game.hud.toggle('netplayplay');
    },
    update(el) {
      const box = el.querySelector('.npp-chip') as HTMLElement | null;
      if (!box) return;
      const show = np.connected;
      if ((box.style.display !== 'none') !== show) box.style.display = show ? '' : 'none';
      if (!show) return;
      const v = box.querySelector('.v') as HTMLElement;
      const t = np.status();
      if (v.textContent !== t) v.textContent = t;
    },
  });
  game.hud.registerHotkey({
    id: 'netplayplay:open', code: 'KeyY', label: '같이 놀기', hint: false, panel: 'netplayplay',
    run: () => game.hud.toggle('netplayplay', np.invite?.from === 'peer' ? 'play' : np.dexIn ? 'dex' : undefined),
  });

  // ── 지도: 방문객 상자 · 레이스 코스 · 보스
  game.hud.registerMapLayer({
    id: 'netplayplay', order: 60,
    draw(g2, toPx, scale, world) {
      if (!np.connected) return;
      if (world === 'earth' && np.chestOn) {
        const [x, y] = toPx(VISITOR_CHEST.x, VISITOR_CHEST.z);
        g2.font = `${Math.max(14, 18 * Math.min(2, scale))}px sans-serif`; g2.textAlign = 'center'; g2.textBaseline = 'middle';
        g2.fillText('🎈', x, y);
      }
      const r = np.run;
      if (world === 'earth' && r?.kind === 'race') {
        const cps = r.track.course.cps;
        g2.strokeStyle = '#ff8fb1'; g2.lineWidth = 3; g2.setLineDash([6, 5]);
        g2.beginPath();
        cps.forEach((c, i) => { const [x, y] = toPx(c.x, c.z); if (i) g2.lineTo(x, y); else g2.moveTo(x, y); });
        g2.stroke(); g2.setLineDash([]);
        cps.forEach((c, i) => {
          const [x, y] = toPx(c.x, c.z);
          g2.fillStyle = i === r.track.next ? '#ff5f8f' : i < r.track.next ? '#d9cbb4' : '#ffd36b';
          g2.beginPath(); g2.arc(x, y, i === r.track.next ? 6 : 4, 0, Math.PI * 2); g2.fill();
        });
      }
      const b = np.bossView;
      if (b && (b.kind === 'whale') === (world === 'space')) {
        const [x, y] = toPx(b.x, b.z);
        g2.font = '20px sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
        g2.fillText(BOSSES[b.kind].icon, x, y);
      }
    },
  });
}
