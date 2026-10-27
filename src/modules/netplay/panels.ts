// netplay 창 — '👫 친구'(연결·놀기·교환·방명록)와 '💾 세이브'(코드 내보내기·불러오기) 패널, 옆 칩, T 단축키.
// 패널을 다시 그려도 입력칸 글은 ctl.inputs 에 남고, 쓰던 칸엔 커서를 돌려준다.
import type { Game } from '../../core/game';
import type { PanelCtx, PanelDef, HudHelpers } from '../../core/api';
import { SAVE_KEY, migrateSave } from '../../core/state';
import type { NetController } from './controller';
import { EMOTES, CHAT_PRESETS, CHAT_MAX, NAME_MAX, TEE_COLORS, HAIR_COLORS, TRADE_SLOTS, type GuestEntry, type Items } from './protocol';
import { isActive, type TradeState } from './trade';
import { exportSave, importSave, BACKUP_KEY, type ImportResult } from './save';

const UI_TEXT = '#4a3b2a';

export const NET_CSS = `
#dl .np { color: ${UI_TEXT}; max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
#dl .np .np-card { background: #fff8e8; border: 3px solid #fff; border-radius: 22px; padding: 12px 16px; box-shadow: 0 4px 0 #f0dcb4; }
#dl .np h3 { margin: 0 0 6px; font-size: 20px; font-weight: normal; color: #b07a3a; }
#dl .np small, #dl .np .np-sub { color: #a88a66; font-size: 14px; }
#dl .np .np-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#dl .np .np-two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
#dl .np textarea, #dl .np input[type=text] { font-family: inherit; font-size: 15px; color: ${UI_TEXT}; background: #fffdf6; border: 3px solid #f0dcb4; border-radius: 14px; padding: 8px 10px; outline: none; box-sizing: border-box; width: 100%; }
#dl .np textarea { height: 76px; resize: none; font-size: 12px; word-break: break-all; font-family: ui-monospace, Menlo, monospace; }
#dl .np textarea:focus, #dl .np input[type=text]:focus { border-color: #ffb36b; }
#dl .np textarea[readonly] { background: #fff3d6; }
#dl .np .btn { font-size: 17px; padding: 6px 16px; }
#dl .np .btn.pink { background: #ff9fb8; box-shadow: 0 3px 0 #e07a96; }
#dl .np .btn.blue { background: #7cc8f0; box-shadow: 0 3px 0 #4f9fcc; }
#dl .np .btn.gray { background: #d9cbb4; box-shadow: 0 3px 0 #bba98c; }
#dl .np .btn.big { font-size: 20px; padding: 10px 22px; border-radius: 18px; }
#dl .np .np-sw { width: 30px; height: 30px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 0 #0002; cursor: pointer; padding: 0; }
#dl .np .np-sw.on { outline: 3px solid #ffb36b; outline-offset: 1px; }
#dl .np .np-note { background: #ffe6ea; color: #c0536b; border-radius: 14px; padding: 8px 12px; }
#dl .np .np-ok { background: #e2f7e2; color: #3f8f52; border-radius: 14px; padding: 8px 12px; }
#dl .np .np-step { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #ffb36b; color: #fff; margin-right: 6px; }
#dl .np .np-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 8px; }
#dl .np .np-it { position: relative; display: grid; place-items: center; gap: 2px; padding: 6px 2px; border-radius: 16px; background: #fffdf6; border: 3px solid #f0dcb4; cursor: pointer; font-family: inherit; color: ${UI_TEXT}; font-size: 12px; }
#dl .np .np-it .ic { font-size: 26px; line-height: 1; }
#dl .np .np-it .n { position: absolute; right: 4px; top: 2px; font-size: 12px; background: #ffb36b; color: #fff; border-radius: 999px; padding: 0 6px; }
#dl .np .np-it.on { border-color: #ff9fb8; background: #fff0f4; }
#dl .np .np-it:hover { transform: translateY(-2px); }
#dl .np .np-em { font-size: 30px; width: 56px; height: 56px; border-radius: 18px; border: 3px solid #fff; background: #fff3d6; cursor: pointer; box-shadow: 0 3px 0 #f0dcb4; display: grid; place-items: center; padding: 0; }
#dl .np .np-em small { font-size: 11px; display: block; margin-top: -4px; color: #a88a66; }
#dl .np .np-em:hover { transform: translateY(-2px) scale(1.04); }
#dl .np .np-ps { font-family: inherit; font-size: 15px; color: ${UI_TEXT}; background: #fff; border: 2px solid #ffd6e2; border-radius: 999px; padding: 4px 12px; cursor: pointer; }
#dl .np .np-log { max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
#dl .np .np-log .l { padding: 4px 10px; border-radius: 12px; background: #fff; align-self: flex-start; max-width: 80%; }
#dl .np .np-log .l.me { align-self: flex-end; background: #fff0f4; }
#dl .np .np-log .l b { font-weight: normal; color: #b07a3a; margin-right: 4px; }
#dl .np .np-peer { display: flex; align-items: center; gap: 12px; }
#dl .np .np-face { width: 52px; height: 52px; border-radius: 50%; border: 4px solid #fff; box-shadow: 0 3px 0 #0002; display: grid; place-items: center; font-size: 26px; }
#dl .np .np-tag { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #f6e7c8; font-size: 14px; }
#dl .np .np-tag.go { background: #8fdc9a; color: #fff; }
#dl .np .np-gb { display: flex; flex-direction: column; gap: 8px; }
#dl .np .np-gb .e { background: #fff; border-radius: 16px; padding: 8px 12px; border-left: 8px solid var(--c, #ff8e86); }
#dl .np .np-gb .e .w { font-size: 13px; color: #a88a66; }
#dl .np .np-side { min-height: 96px; }
#dl .np details summary { cursor: pointer; color: #a88a66; }
#dl .np .np-stepper { display: inline-flex; align-items: center; gap: 6px; }
#dl .np .np-stepper b { min-width: 30px; text-align: center; font-size: 20px; font-weight: normal; }
#dl .np-chip { pointer-events: auto; cursor: pointer; }
#dl .np-chip .dot { width: 10px; height: 10px; border-radius: 50%; background: #d9cbb4; display: inline-block; }
#dl .np-chip.on .dot { background: #7ccf8a; box-shadow: 0 0 6px #7ccf8a; }
#dl .np-chip.wait .dot { background: #ffbe3b; animation: np-blink 1s infinite; }
#dl .np-chips { display: flex; gap: 6px; }
#dl .np-sv { pointer-events: auto; cursor: pointer; padding: 6px 10px; }
@keyframes np-blink { 50% { opacity: .3 } }
`;

/** 클립보드에 복사(안 되면 칸을 골라 둔다) */
async function copyText(text: string, ta?: HTMLTextAreaElement | null): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래로 */ }
  if (ta) {
    ta.focus(); ta.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }
  return false;
}

const statusLabel: Record<string, string> = {
  idle: '친구', hosting: '코드 만드는 중…', offer: '답장 기다리는 중', joining: '코드 읽는 중…', answer: '방장 기다리는 중',
  connecting: '연결하는 중…', connected: '같이 노는 중', closed: '친구', failed: '친구',
};

export function registerNetUi(game: Game, ctl: NetController) {
  const style = document.createElement('style');
  style.textContent = NET_CSS;
  document.head.appendChild(style);

  // 패널 안 고른 것(선물 물건·불러올 세이브)
  let pendingImport: ImportResult | null = null;
  let saveOut = '';
  let saveBusy = false;
  let lastTradeNote = '';

  // ── 다시 그리기(같은 틱의 여러 알림은 하나로)
  let rr = false;
  const rerender = () => {
    if (rr) return;
    rr = true;
    queueMicrotask(() => { rr = false; if (game.hud.isOpen('friends') || game.hud.isOpen('save')) game.hud.rerender(); });
  };
  ctl.subscribe((e) => {
    if (e.k === 'trade-result') lastTradeNote = e.ok ? '🤝 교환 완료!' : '교환이 안 됐어요 — 물건은 그대로예요';
    if (e.k === 'trade' && e.state.phase === 'cancelled') lastTradeNote = '교환 창을 닫았어요';
    rerender();
  });

  /** 칸 글 지키기: 그리기 전 커서 자리 기억 → 그린 뒤 되돌리기 */
  const withFocus = (body: HTMLElement, draw: () => void) => {
    const a = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    const key = a && body.contains(a) ? a.dataset.in : undefined;
    const sel = key ? [a!.selectionStart, a!.selectionEnd] : null;
    draw();
    if (key) {
      const el = body.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-in="${key}"]`);
      if (el) { el.focus(); if (sel && sel[0] !== null) try { el.setSelectionRange(sel[0], sel[1]); } catch { /* 읽기 전용 */ } }
    }
  };
  /** 입력칸 공통: 쓰는 대로 ctl.inputs 에 */
  const wireInputs = (body: HTMLElement) => {
    body.oninput = (ev) => {
      const el = ev.target as HTMLInputElement;
      const k = el.dataset?.in;
      if (k) ctl.inputs[k] = el.value;
    };
  };
  const val = (k: string) => ctl.inputs[k] ?? '';
  const peerName = () => ctl.peerName();

  // ───────────── 친구 창 ─────────────
  const itemCell = (h: HudHelpers, id: string, n: number, act: string, on = false) =>
    `<button class="np-it${on ? ' on' : ''}" data-act="${act}" data-arg="${h.esc(id)}" title="${h.esc(ctl.itemName(id))}"><span class="ic">${ctl.itemIcon(id)}</span><span>${h.esc(ctl.itemName(id)).slice(0, 6)}</span>${n > 1 || act !== 'trade-del' ? `<span class="n">${n}</span>` : ''}</button>`;

  const linkTab = (h: HudHelpers): string => {
    const p = ctl.profile();
    const out: string[] = [];
    if (!ctl.rtcOk) out.push('<div class="np-note">이 브라우저는 친구 연결(WebRTC)을 못 해요 😢 크롬·엣지·사파리 최신판으로 와 줘요. 💾 세이브 코드는 쓸 수 있어요!</div>');
    if (ctl.note) out.push(`<div class="np-note">${h.esc(ctl.note)}</div>`);
    const st = ctl.status;
    if (st === 'connected') {
      const peer = ctl.session?.peer;
      if (peer) {
        out.push(`<div class="np-card"><div class="np-peer"><div class="np-face" style="background:${peer.colors.tee}">🙂</div><div style="flex:1"><div style="font-size:22px">${h.esc(peer.name)} <span class="np-tag go">${ctl.role === 'guest' ? '놀러 왔어요' : '손님'}</span></div>
          <div class="np-sub">도감 ${peer.summary.dex}/${peer.summary.total}칸 · 별 ${h.fmt(peer.summary.stars)}개 · 코인 ${h.fmt(peer.summary.coins)} · ${peer.summary.day + 1}일째</div></div></div>
          <div class="np-row" style="margin-top:10px"><button class="btn blue" data-act="goto">🏃 친구 곁으로 가기</button><button class="btn pink" data-act="tab" data-arg="play">💬 놀기</button><button class="btn" data-act="tab" data-arg="trade">🤝 교환</button><button class="btn gray" data-act="leave">👋 연결 끊기</button></div></div>`);
      }
    } else if (st === 'idle' || st === 'closed' || st === 'failed') {
      if (st !== 'idle') out.push('<div class="np-row"><button class="btn" data-act="reset">처음으로</button></div>');
      else {
        out.push(`<div class="np-two">
          <div class="np-card"><h3>🏠 방 만들기 <small>(방장)</small></h3><div class="np-sub">초대 코드를 만들어 친구에게 보내요. 친구가 내 섬에 놀러 와요!</div>
            <div class="np-row" style="margin-top:10px"><button class="btn big" data-act="host"${ctl.rtcOk ? '' : ' disabled'}>초대 코드 만들기</button></div></div>
          <div class="np-card"><h3>✉️ 놀러 가기 <small>(손님)</small></h3><div class="np-sub">방장이 준 초대 코드를 붙여넣어요</div>
            <textarea data-in="offerIn" placeholder="DL1… 초대 코드">${h.esc(val('offerIn'))}</textarea>
            <div class="np-row" style="margin-top:6px"><button class="btn big pink" data-act="join"${ctl.rtcOk ? '' : ' disabled'}>답장 코드 만들기</button></div></div></div>`);
      }
    } else if (st === 'hosting' || st === 'joining') {
      out.push(`<div class="np-card" style="text-align:center;font-size:20px">${st === 'hosting' ? '🏠 초대 코드를 만드는 중…' : '✉️ 초대 코드를 읽는 중…'}<br><small>몇 초 걸려요, 두근두근!</small></div>`);
    } else if (st === 'offer') {
      out.push(`<div class="np-card"><h3><span class="np-step">1</span>이 초대 코드를 친구에게 보내요</h3>
        <textarea readonly data-code="offer">${h.esc(ctl.offerCode)}</textarea>
        <div class="np-row" style="margin-top:6px"><button class="btn" data-act="copy" data-arg="offer">📋 복사하기</button><small>${ctl.offerCode.length}자 · 메신저로 보내도 돼요</small></div></div>
        <div class="np-card"><h3><span class="np-step">2</span>친구가 준 답장 코드를 붙여넣어요</h3>
        <textarea data-in="answerIn" placeholder="DL1… 답장 코드">${h.esc(val('answerIn'))}</textarea>
        <div class="np-row" style="margin-top:6px"><button class="btn big pink" data-act="finish">연결하기!</button><button class="btn gray" data-act="reset">그만두기</button></div></div>`);
    } else if (st === 'answer') {
      out.push(`<div class="np-card"><h3><span class="np-step">✓</span>이 답장 코드를 방장에게 보내요</h3>
        <textarea readonly data-code="answer">${h.esc(ctl.answerCode)}</textarea>
        <div class="np-row" style="margin-top:6px"><button class="btn" data-act="copy" data-arg="answer">📋 복사하기</button><small>방장이 붙여넣으면 저절로 연결돼요! 창은 닫아도 돼요</small></div>
        <div class="np-row" style="margin-top:6px"><button class="btn gray" data-act="reset">그만두기</button></div></div>`);
    } else if (st === 'connecting') {
      out.push('<div class="np-card" style="text-align:center;font-size:20px">💞 연결하는 중…<br><small>조금만 기다려요</small><div class="np-row" style="justify-content:center;margin-top:8px"><button class="btn gray" data-act="reset">그만두기</button></div></div>');
    }
    // 내 모습
    out.push(`<div class="np-card"><h3>🙋 내 모습 <small>친구 화면에 이렇게 보여요</small></h3>
      <div class="np-row"><input type="text" data-in="name" maxlength="${NAME_MAX}" value="${h.esc(ctl.inputs.name ?? p.name)}" style="max-width:180px" placeholder="이름"><button class="btn" data-act="name">이름 바꾸기</button></div>
      <div class="np-row" style="margin-top:8px">옷 ${TEE_COLORS.map((c) => `<button class="np-sw${c === p.colors.tee ? ' on' : ''}" style="background:${c}" data-act="tee" data-arg="${c}" title="옷 색"></button>`).join('')}</div>
      <div class="np-row" style="margin-top:6px">머리 ${HAIR_COLORS.map((c) => `<button class="np-sw${c === p.colors.hair ? ' on' : ''}" style="background:${c}" data-act="hair" data-arg="${c}" title="머리 색"></button>`).join('')}</div></div>`);
    const fr = ctl.flags().friends;
    if (fr.length) out.push(`<div class="np-card"><h3>💕 최근 친구</h3><div class="np-row">${fr.map((f) => `<span class="np-tag" style="border-left:6px solid ${f.tee}">${h.esc(f.name)} · ${f.visits}번</span>`).join('')}</div></div>`);
    out.push(`<div class="np-card"><details${val('stun') ? ' open' : ''}><summary>⚙️ 멀리 있는 친구와 하기 (STUN)</summary>
      <div class="np-sub" style="margin:6px 0">비워 두면 같은 와이파이·같은 컴퓨터 안에서만 이어져요. 멀리 있는 친구라면 둘 다 같은 STUN 주소(stun:…)를 적어요. 도파민랜드는 서버를 쓰지 않아요.</div>
      <div class="np-row"><input type="text" data-in="stun" value="${h.esc(val('stun'))}" placeholder="stun:주소:포트" style="max-width:320px"><button class="btn" data-act="stun">저장</button></div></details>
      <div class="np-row" style="margin-top:8px"><button class="btn blue" data-act="save-panel">💾 세이브 코드 (옮기기·백업)</button></div></div>`);
    return out.join('');
  };

  const playTab = (h: HudHelpers, pc: PanelCtx): string => {
    if (ctl.status !== 'connected') return '<div class="np"><div class="np-card" style="text-align:center">친구랑 연결되면 이모트·채팅·선물을 할 수 있어요!<br><button class="btn" data-act="tab" data-arg="link">👫 연결하러 가기</button></div></div>';
    const log = ctl.chatLog().slice(-12);
    const items = ctl.giftable();
    const sel = pc.sel && items.find((x) => x.id === pc.sel) ? pc.sel : null;
    const have = sel ? items.find((x) => x.id === sel)!.n : 0;
    const gn = Math.max(1, Math.min(have || 1, Number(val('giftN')) || 1));
    return `<div class="np-card"><h3>😊 이모트 <small>내 아바타도 따라 해요</small></h3><div class="np-row">${EMOTES.map((e) => `<button class="np-em" data-act="emote" data-arg="${e.id}" title="${h.esc(e.label)}"><div>${e.icon}<small>${h.esc(e.label)}</small></div></button>`).join('')}</div></div>
      <div class="np-card"><h3>💬 채팅 <small>${h.esc(peerName())}에게</small></h3>
        <div class="np-log">${log.length ? log.map((l) => `<div class="l${l.from === 'me' ? ' me' : ''}"><b>${h.esc(l.name)}</b>${h.esc(l.text)}</div>`).join('') : '<small>아직 조용해요. 먼저 인사해 봐요!</small>'}</div>
        <div class="np-row" style="margin-top:8px">${CHAT_PRESETS.map((t, i) => `<button class="np-ps" data-act="preset" data-arg="${i}">${h.esc(t)}</button>`).join('')}</div>
        <div class="np-row" style="margin-top:8px"><input type="text" data-in="chat" maxlength="${CHAT_MAX}" value="${h.esc(val('chat'))}" placeholder="하고 싶은 말 (${CHAT_MAX}자)" style="flex:1"><button class="btn pink" data-act="chat">보내기</button></div></div>
      <div class="np-card"><h3>🎁 선물하기 <small>가방에서 골라요 (도구·탈것은 안 돼요)</small></h3>
        ${items.length ? `<div class="np-grid">${items.map((x) => itemCell(h, x.id, x.n, 'gift-sel', x.id === sel)).join('')}</div>` : '<small>가방에 줄 만한 게 없어요</small>'}
        ${sel ? `<div class="np-row" style="margin-top:10px">${ctl.itemIcon(sel)} <b style="font-weight:normal">${h.esc(ctl.itemName(sel))}</b>
          <span class="np-stepper"><button class="btn gray" data-act="gift-n" data-arg="-1">−</button><b>${gn}</b><button class="btn gray" data-act="gift-n" data-arg="1">+</button></span>
          <button class="btn big pink" data-act="gift">🎁 ${h.esc(peerName())}에게 주기</button></div>` : ''}</div>`;
  };

  const tradeTab = (h: HudHelpers): string => {
    if (ctl.status !== 'connected' || !ctl.session) return '<div class="np-card" style="text-align:center">친구랑 연결되면 물건을 바꿀 수 있어요!<br><button class="btn" data-act="tab" data-arg="link">👫 연결하러 가기</button></div>';
    const s: TradeState = ctl.session.trade;
    const name = h.esc(peerName());
    if (!isActive(s)) {
      return `<div class="np-card" style="text-align:center"><div style="font-size:20px">🤝 ${name}랑 물건 바꾸기</div><div class="np-sub">서로 내놓을 걸 고르고, 둘 다 "좋아요"를 누르면 한 번에 바뀌어요</div>
        ${lastTradeNote ? `<div class="np-ok" style="margin:8px 0">${h.esc(lastTradeNote)}</div>` : ''}
        <button class="btn big pink" data-act="trade-invite">교환하자고 하기</button></div>`;
    }
    if (s.phase === 'inviting') return `<div class="np-card" style="text-align:center;font-size:20px">💌 ${name}가 받아 주길 기다려요…<div class="np-row" style="justify-content:center;margin-top:8px"><button class="btn gray" data-act="trade-cancel">그만두기</button></div></div>`;
    if (s.phase === 'invited') return `<div class="np-card" style="text-align:center;font-size:20px">🤝 ${name}가 교환하자고 해요!<div class="np-row" style="justify-content:center;margin-top:8px"><button class="btn big pink" data-act="trade-accept">좋아!</button><button class="btn gray" data-act="trade-cancel">다음에</button></div></div>`;
    const list = (it: Items, act: string | null) => {
      const e = Object.entries(it);
      return e.length ? `<div class="np-grid">${e.map(([id, n]) => act ? itemCell(h, id, n, act) : `<div class="np-it"><span class="ic">${ctl.itemIcon(id)}</span><span>${h.esc(ctl.itemName(id)).slice(0, 6)}</span><span class="n">${n}</span></div>`).join('')}</div>` : '<small>아직 아무것도 없어요</small>';
    };
    const bag = ctl.giftable().map((x) => ({ ...x, n: x.n - (s.mine.items[x.id] ?? 0) })).filter((x) => x.n > 0);
    const committing = s.phase === 'committing';
    return `<div class="np-two">
        <div class="np-card np-side"><h3>내가 줄 것 ${s.mine.ok ? '<span class="np-tag go">좋아요!</span>' : ''}</h3>${list(s.mine.items, committing ? null : 'trade-del')}</div>
        <div class="np-card np-side"><h3>${name}가 줄 것 ${s.theirs.ok ? '<span class="np-tag go">좋아요!</span>' : ''}</h3>${list(s.theirs.items, null)}</div></div>
      <div class="np-row" style="justify-content:center">${committing ? '<span class="np-tag">💫 바꾸는 중…</span>' : `${s.mine.ok ? '<button class="btn big gray" data-act="trade-unok">좋아요 취소</button>' : '<button class="btn big pink" data-act="trade-ok">좋아요!</button>'}<button class="btn gray" data-act="trade-cancel">그만두기</button>`}</div>
      <div class="np-sub" style="text-align:center">물건을 바꾸면 두 사람 "좋아요"가 풀려요 · 한 번에 ${TRADE_SLOTS}종류까지</div>
      ${committing ? '' : `<div class="np-card"><h3>🎒 내 가방 <small>눌러서 하나씩 올려요</small></h3>${bag.length ? `<div class="np-grid">${bag.map((x) => itemCell(h, x.id, x.n, 'trade-add')).join('')}</div>` : '<small>줄 만한 게 없어요</small>'}</div>`}`;
  };

  const bookTab = (h: HudHelpers): string => {
    const guest = ctl.status === 'connected' && ctl.role === 'guest';
    const entries: GuestEntry[] = guest ? ctl.session?.remoteGuestbook ?? [] : ctl.guestbook();
    const title = guest ? `📖 ${h.esc(peerName())}네 섬 방명록` : '📖 우리 섬 방명록';
    const rows = entries.slice().reverse().map((e) => `<div class="e" style="--c:${e.tee}"><div>${h.esc(e.text)}</div><div class="w">— ${h.esc(e.name)} · ${e.day + 1}일째</div></div>`).join('');
    return `${guest ? `<div class="np-card"><h3>✍️ 한 마디 남기기 <small>${CHAT_MAX}자</small></h3><div class="np-row"><input type="text" data-in="gb" maxlength="${CHAT_MAX}" value="${h.esc(val('gb'))}" placeholder="놀러 왔다 가요! 🌸" style="flex:1"><button class="btn pink" data-act="gb">남기기</button></div></div>` : ''}
      <div class="np-card"><h3>${title} <small>${entries.length}줄</small></h3><div class="np-gb">${rows || '<small>아직 아무도 안 남겼어요. 친구를 초대해 봐요!</small>'}</div></div>`;
  };

  const friends: PanelDef = {
    kind: 'friends', title: '친구', color: '#ff9fb8', icon: '👫', defaultTab: 'link',
    tabs: () => [
      { id: 'link', label: '연결', icon: '💞' },
      { id: 'play', label: '놀기', icon: '😊' },
      { id: 'trade', label: '교환', icon: '🤝', badge: ctl.session?.trade.phase === 'invited' ? '!' : undefined },
      { id: 'book', label: '방명록', icon: '📖', badge: ctl.guestbook().length ? String(ctl.guestbook().length) : undefined },
    ],
    meta: () => (ctl.status === 'connected' ? `${peerName()}와 노는 중` : statusLabel[ctl.status] === '친구' ? '' : statusLabel[ctl.status]),
    render(body, pc) {
      const h = pc.h;
      const tab = pc.tab ?? 'link';
      withFocus(body, () => {
        body.innerHTML = `<div class="np">${tab === 'play' ? playTab(h, pc) : tab === 'trade' ? tradeTab(h) : tab === 'book' ? bookTab(h) : linkTab(h)}</div>`;
      });
      wireInputs(body);
      body.onkeydown = (ev) => {
        const el = ev.target as HTMLInputElement;
        if (ev.key !== 'Enter' || !el.dataset?.in) return;
        ev.preventDefault();
        if (el.dataset.in === 'chat') act('chat', '', pc);
        else if (el.dataset.in === 'gb') act('gb', '', pc);
        else if (el.dataset.in === 'name') act('name', '', pc);
      };
      body.onclick = (ev) => {
        const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
        if (!b || !body.contains(b) || (b as HTMLButtonElement).disabled) return;
        act(b.dataset.act!, b.dataset.arg ?? '', pc, body);
      };
    },
  };

  const act = (a: string, arg: string, pc: PanelCtx, body?: HTMLElement) => {
    const s = ctl.session;
    switch (a) {
      case 'tab': pc.setTab(arg); return;
      case 'host': void ctl.host(); break;
      case 'join': void ctl.join(val('offerIn')); break;
      case 'finish': void ctl.finish(val('answerIn')); break;
      case 'reset': ctl.reset(); break;
      case 'leave': ctl.leave(); break;
      case 'goto': if (ctl.goToFriend()) game.hud.close(); return;
      case 'copy': {
        const text = arg === 'offer' ? ctl.offerCode : ctl.answerCode;
        const ta = body?.querySelector<HTMLTextAreaElement>(`[data-code="${arg}"]`) ?? null;
        void copyText(text, ta).then((ok) => game.hud.toast(ok ? '📋 복사했어요! 친구에게 보내요' : '칸을 눌러 직접 복사해 줘요(Ctrl+C)'));
        return;
      }
      case 'name': ctl.setProfile({ name: val('name') || ctl.profile().name }); delete ctl.inputs.name; game.hud.toast(`이름을 "${ctl.profile().name}"(으)로 바꿨어요`); break;
      case 'tee': ctl.setProfile({ tee: arg }); break;
      case 'hair': ctl.setProfile({ hair: arg }); break;
      case 'stun': ctl.setStun(val('stun')); game.hud.toast(val('stun') && !ctl.flags().stun ? 'STUN 주소는 stun: 으로 시작해요' : 'STUN 설정을 저장했어요'); break;
      case 'save-panel': game.hud.open('save'); return;
      case 'emote': ctl.emote(arg); return;
      case 'preset': ctl.say(Number(arg)); break;
      case 'chat': if (ctl.say(val('chat'))) ctl.inputs.chat = ''; break;
      case 'gift-sel': pc.setSel(pc.sel === arg ? null : arg); ctl.inputs.giftN = '1'; return;
      case 'gift-n': {
        const have = ctl.giftable().find((x) => x.id === pc.sel)?.n ?? 1;
        ctl.inputs.giftN = String(Math.max(1, Math.min(have, Math.min(99, (Number(val('giftN')) || 1) + Number(arg)))));
        break;
      }
      case 'gift': if (pc.sel && ctl.gift(pc.sel, Math.max(1, Number(val('giftN')) || 1))) { pc.setSel(null); ctl.inputs.giftN = '1'; } break;
      case 'trade-invite': lastTradeNote = ''; s?.tradeClear(); s?.tradeInvite(); break;
      case 'trade-accept': s?.tradeAccept(); break;
      case 'trade-cancel': s?.tradeCancel(); break;
      case 'trade-add': case 'trade-del': {
        if (!s) break;
        const cur = { ...s.trade.mine.items };
        if (a === 'trade-add') {
          if (!cur[arg] && Object.keys(cur).length >= TRADE_SLOTS) { game.hud.toast(`한 번에 ${TRADE_SLOTS}종류까지예요`); break; }
          cur[arg] = (cur[arg] ?? 0) + 1;
        } else if (cur[arg]) { cur[arg]--; if (!cur[arg]) delete cur[arg]; }
        const r = s.tradeOffer(cur);
        if (!r.ok) game.hud.toast(r.text);
        break;
      }
      case 'trade-ok': { const r = s?.tradeConfirm(); if (r && !r.ok) game.hud.toast(r.text); break; }
      case 'trade-unok': s?.tradeUnconfirm(); break;
      case 'gb': {
        const r = s?.signGuestbook(val('gb')) ?? { ok: false as const, text: '친구랑 연결돼 있지 않아요' };
        if (r.ok) ctl.inputs.gb = ''; else game.hud.toast(r.text);
        break;
      }
    }
    pc.rerender();
  };

  // ───────────── 세이브 창 ─────────────
  const hasBackup = () => { try { return !!localStorage.getItem(BACKUP_KEY); } catch { return false; } };
  const applySave = (data: ReturnType<typeof migrateSave>) => {
    const st = game.state;
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(st.snapshot())); } catch { /* 백업 못 함 */ }
    st.coins = data.coins; st.bag = data.bag; st.dex = data.dex; st.flags = data.flags;
    st.saveNow();
    try { if (localStorage.getItem(SAVE_KEY) === null) throw new Error('save'); } catch {
      game.hud.toast('저장소에 쓰지 못했어요 😢 (사생활 보호 모드인가요?)');
      return;
    }
    // 떠나는 길에 다른 모듈(atmosphere 의 pagehide → env.persist + saveNow)이 돌고 있던 시계를 새 flags.env 에 덮어 써서
    // 불러온 날짜·시각이 옛 세이브 것으로 바뀐다. 방금 쓴 그대로의 글을 들고 있다가 떠나는 순간 맨 마지막에 한 번 더 쓴다
    // (이 듣개는 지금 붙으니 build 때 붙은 다른 듣개보다 늦게 돈다).
    let raw: string | null = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch { /* 위에서 확인함 */ }
    if (raw) {
      const keep = raw;
      const reassert = () => { try { localStorage.setItem(SAVE_KEY, keep); } catch { /* 못 씀 */ } };
      addEventListener('pagehide', reassert);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') reassert(); });
    }
    ctl.leave();
    game.hud.banner({ text: '세이브를 불러왔어요!', sub: '잠깐 뒤에 다시 시작해요', icon: '💾', color: '#7cc8f0', ms: 1400 });
    setTimeout(() => {
      // ?fresh=1 이면 저장을 안 읽으니 떼고 다시 연다
      const u = new URL(location.href);
      u.searchParams.delete('fresh');
      location.replace(u.toString());
    }, 900);
  };
  const save: PanelDef = {
    kind: 'save', title: '세이브', color: '#7cc8f0', icon: '💾', defaultTab: 'out',
    tabs: () => [{ id: 'out', label: '내보내기', icon: '📤' }, { id: 'in', label: '불러오기', icon: '📥' }],
    render(body, pc) {
      const h = pc.h;
      const tab = pc.tab === 'in' ? 'in' : 'out';
      withFocus(body, () => {
        if (tab === 'out') {
          body.innerHTML = `<div class="np"><div class="np-card"><h3>📤 내 섬을 코드 한 줄로</h3>
            <div class="np-sub">다른 브라우저·컴퓨터로 옮기거나 백업할 때 써요. 코드엔 코인·가방·도감·진행이 다 들어가요 (사진은 빼고요).</div>
            <div class="np-row" style="margin-top:10px"><button class="btn big blue" data-act="make"${saveBusy ? ' disabled' : ''}>${saveBusy ? '만드는 중…' : saveOut ? '다시 만들기' : '세이브 코드 만들기'}</button></div>
            ${saveOut ? `<textarea readonly data-code="save" style="margin-top:10px;height:110px">${h.esc(saveOut)}</textarea>
            <div class="np-row" style="margin-top:6px"><button class="btn" data-act="copy">📋 복사하기</button><small>${h.fmt(saveOut.length)}자 · 메모장에 붙여 두면 든든해요</small></div>` : ''}</div></div>`;
        } else {
          const r = pendingImport;
          body.innerHTML = `<div class="np"><div class="np-card"><h3>📥 세이브 코드 붙여넣기</h3>
            <textarea data-in="saveIn" placeholder="DL1… 세이브 코드" style="height:110px">${h.esc(val('saveIn'))}</textarea>
            <div class="np-row" style="margin-top:6px"><button class="btn big" data-act="check">코드 확인하기</button></div></div>
            ${r && !r.ok ? `<div class="np-note">${h.esc(r.text)}</div>` : ''}
            ${r && r.ok ? `<div class="np-card"><h3>이 세이브로 바꿀까요?</h3>
              <div style="font-size:18px">🪙 ${h.fmt(r.summary.coins)} · 📖 도감 ${r.summary.dex}칸 · 🎒 물건 ${h.fmt(r.summary.items)}개${r.at ? ` · ${new Date(r.at).toLocaleString('ko-KR')}` : ''}</div>
              <div class="np-note" style="margin-top:8px">지금 내 섬은 이 세이브로 덮여요! (지금 것은 백업해 둬요)</div>
              <div class="np-row" style="margin-top:8px"><button class="btn big gold" data-act="apply">덮어쓰고 다시 시작</button><button class="btn gray" data-act="uncheck">그만두기</button></div></div>` : ''}
            ${hasBackup() ? '<div class="np-card"><h3>↩️ 백업</h3><div class="np-sub">마지막으로 덮어쓰기 전 세이브가 남아 있어요</div><div class="np-row" style="margin-top:6px"><button class="btn gray" data-act="restore">백업으로 되돌리기</button></div></div>' : ''}</div>`;
        }
      });
      wireInputs(body);
      body.onkeydown = null;
      body.onclick = (ev) => {
        const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
        if (!b || !body.contains(b) || (b as HTMLButtonElement).disabled) return;
        switch (b.dataset.act) {
          case 'make':
            saveBusy = true; pc.rerender();
            exportSave(game.state.snapshot()).then((code) => { saveOut = code; }).catch(() => { game.hud.toast('코드를 못 만들었어요 😢'); }).finally(() => { saveBusy = false; pc.rerender(); });
            break;
          case 'copy': {
            const ta = body.querySelector<HTMLTextAreaElement>('[data-code="save"]');
            void copyText(saveOut, ta).then((ok) => game.hud.toast(ok ? '📋 세이브 코드를 복사했어요!' : '칸을 눌러 직접 복사해 줘요(Ctrl+C)'));
            break;
          }
          case 'check':
            void importSave(val('saveIn')).then((r) => { pendingImport = r; pc.rerender(); });
            break;
          case 'uncheck': pendingImport = null; pc.rerender(); break;
          case 'apply': if (pendingImport?.ok) applySave(pendingImport.data); break;
          case 'restore': {
            let raw: string | null = null;
            try { raw = localStorage.getItem(BACKUP_KEY); } catch { /* 없음 */ }
            if (!raw) break;
            try { applySave(migrateSave(JSON.parse(raw))); } catch { game.hud.toast('백업이 깨졌어요 😢'); }
            break;
          }
        }
      };
    },
    onClose() { pendingImport = null; },
  };

  game.hud.registerPanel(friends);
  game.hud.registerPanel(save);

  // ── 칩: 친구 상태 + 세이브
  game.hud.registerChip({
    id: 'netplay:friends', order: 60,
    render(el) {
      el.innerHTML = '<div class="np-chips"><div class="chip dl-card np-chip" title="친구 (T)"><div class="ci">👫</div><span class="v">친구</span><i class="dot"></i></div><div class="chip dl-card np-sv" title="세이브 코드">💾</div></div>';
      (el.querySelector('.np-chip') as HTMLElement).onclick = () => game.hud.toggle('friends', ctl.status === 'connected' ? 'play' : 'link');
      (el.querySelector('.np-sv') as HTMLElement).onclick = () => game.hud.toggle('save');
    },
    update(el) {
      const box = el.querySelector('.np-chip') as HTMLElement | null;
      if (!box) return;
      const v = box.querySelector('.v') as HTMLElement;
      const t = ctl.status === 'connected' ? peerName() : statusLabel[ctl.status] ?? '친구';
      if (v.textContent !== t) v.textContent = t;
      box.classList.toggle('on', ctl.status === 'connected');
      box.classList.toggle('wait', ['hosting', 'offer', 'joining', 'answer', 'connecting'].includes(ctl.status));
    },
  });

  // ── T: 친구 창(연결돼 있으면 놀기 탭)
  game.hud.registerHotkey({
    id: 'netplay:friends', code: 'KeyT', label: '친구', hint: false, panel: 'friends',
    run: () => game.hud.toggle('friends', ctl.status === 'connected' ? 'play' : 'link'),
  });
}
