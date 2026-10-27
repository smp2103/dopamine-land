// WebRTC 통로 — 서버 없이 "코드 복사·붙여넣기"로 잇는다(CONTRACT 4: 외부 서비스 없음).
//   방장: host() → ICE 를 다 모은 제안(offer) 코드  ──(친구에게 보내기)──▶
//   손님: join(제안 코드) → 답장(answer) 코드      ◀──(방장에게 보내기)──
//   방장: finish(답장 코드) → 데이터 채널이 열리면 onlink(Link)
// iceServers 는 기본 [](같은 집·같은 컴퓨터 안에서만 확실). 사용자가 STUN 주소를 직접 적으면 그것만 쓴다.
// RTCPeerConnection 이 없는 환경에선 rtcAvailable() = false 이고, 무엇을 불러도 던지지 않고 실패 결과만 돌려준다.
import type { Link } from './link';
import { encodeCode, decodeCode, codeErrText } from './codec';
import { cleanSignal, PROTO } from './protocol';

/** ICE 모으기를 기다리는 최대 시간(ms) — 넘으면 모인 만큼으로 코드를 만든다 */
export const ICE_WAIT = 4000;
/** 방장 제안이 유효한 시간(ms) — 넘으면 새로 만들어야 한다 */
export const OFFER_TTL = 10 * 60_000;
/** 답장을 붙인 뒤 채널이 열리길 기다리는 시간(ms) */
export const CONNECT_WAIT = 25_000;
/** 손님이 답장을 만든 뒤 방장이 붙여 넣길 기다리는 시간(ms) */
export const ANSWER_TTL = 10 * 60_000;
/** 'disconnected' 가 이만큼 이어지면 끊긴 것으로 본다 */
export const DISCONNECT_GRACE = 7000;

type PC = RTCPeerConnection;
const PCCtor = (): (new (c?: RTCConfiguration) => PC) | null =>
  (globalThis as unknown as { RTCPeerConnection?: new (c?: RTCConfiguration) => PC }).RTCPeerConnection ?? null;
/** 이 브라우저에서 WebRTC 를 쓸 수 있나 */
export const rtcAvailable = () => !!PCCtor();

/** STUN 주소 다듬기(stun: 또는 stuns: 로 시작하는 것만, 아니면 빈 값) */
export function cleanStun(s: unknown): string {
  const t = typeof s === 'string' ? s.trim() : '';
  return /^stuns?:[A-Za-z0-9.\-[\]:]{3,120}$/.test(t) ? t : '';
}
export function rtcConfig(stun: string): RTCConfiguration {
  const s = cleanStun(stun);
  return { iceServers: s ? [{ urls: s }] : [] };
}

/** ICE 를 다 모을 때까지(또는 ICE_WAIT) */
function gathered(pc: PC, wait = ICE_WAIT): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((res) => {
    const done = () => { clearTimeout(tm); pc.removeEventListener('icegatheringstatechange', chk); pc.removeEventListener('icecandidate', cand); res(); };
    const chk = () => { if (pc.iceGatheringState === 'complete') done(); };
    const cand = (e: RTCPeerConnectionIceEvent) => { if (!e.candidate) done(); };
    const tm = setTimeout(done, wait);
    pc.addEventListener('icegatheringstatechange', chk);
    pc.addEventListener('icecandidate', cand);
  });
}

/** 데이터 채널 → Link */
class RtcLink implements Link {
  onmessage: ((text: string) => void) | null = null;
  onclose: ((reason: string) => void) | null = null;
  private closed = false;
  private discTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private pc: PC, private dc: RTCDataChannel) {
    dc.onmessage = (e) => { if (typeof e.data === 'string') this.onmessage?.(e.data); };
    dc.onclose = () => this.end('peer-closed');
    dc.onerror = () => this.end('error');
    pc.addEventListener('connectionstatechange', () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') this.end(s);
      else if (s === 'disconnected') {
        if (!this.discTimer) this.discTimer = setTimeout(() => { this.discTimer = null; if (pc.connectionState === 'disconnected') this.end('lost'); }, DISCONNECT_GRACE);
      } else if (this.discTimer) { clearTimeout(this.discTimer); this.discTimer = null; }
    });
  }
  get open() { return !this.closed && this.dc.readyState === 'open'; }
  send(text: string) {
    if (!this.open) return false;
    try { this.dc.send(text); return true; } catch { return false; }
  }
  close(reason = 'close') {
    if (this.closed) return;
    // 남은 쪽지(bye 등)가 나갈 틈을 조금 주고 닫는다
    const dc = this.dc, pc = this.pc;
    this.end(reason, false);
    setTimeout(() => { try { dc.close(); } catch { /* 이미 닫힘 */ } try { pc.close(); } catch { /* 이미 닫힘 */ } }, 120);
  }
  /** hard=false(내가 닫음)면 pc 는 위 120ms 타이머가 닫는다 — 바로 닫으면 bye 가 못 나간다 */
  private end(reason: string, hard = true) {
    if (this.closed) return;
    this.closed = true;
    if (this.discTimer) { clearTimeout(this.discTimer); this.discTimer = null; }
    try { this.onclose?.(reason); } catch (e) { console.error('[netplay rtc]', e); }
    if (hard) { try { this.pc.close(); } catch { /* 이미 닫힘 */ } }
  }
}

export type RtcResult = { ok: true; code: string } | { ok: false; err: string; text: string };

/** 한 번의 연결 시도(방장 또는 손님). 다 쓰면 close() */
export class RtcSignal {
  pc: PC | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private done = false;
  /** 채널이 열렸다 */
  onlink: ((l: Link) => void) | null = null;
  /** 시간 초과·실패(글은 사용자용) */
  onfail: ((err: string, text: string) => void) | null = null;

  constructor(private stun = '') {}

  private fail(err: string, text: string) {
    if (this.done) return;
    this.done = true;
    this.clearTimer();
    try { this.pc?.close(); } catch { /* 이미 닫힘 */ }
    this.pc = null;
    this.onfail?.(err, text);
  }
  private clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  private deadline(ms: number, err: string, text: string) {
    this.clearTimer();
    this.timer = setTimeout(() => this.fail(err, text), ms);
  }
  private make(): PC | null {
    const C = PCCtor();
    if (!C) return null;
    try { return new C(rtcConfig(this.stun)); } catch { return null; }
  }
  private ready(dc: RTCDataChannel) {
    const pc = this.pc!;
    const fire = () => {
      if (this.done) return;
      this.done = true;
      this.clearTimer();
      this.onlink?.(new RtcLink(pc, dc));
    };
    if (dc.readyState === 'open') fire(); else dc.addEventListener('open', fire, { once: true });
  }

  /** 방장: 제안 코드 만들기 */
  async host(name: string): Promise<RtcResult> {
    const pc = this.make();
    if (!pc) return { ok: false, err: 'nortc', text: '이 브라우저는 친구 연결(WebRTC)을 못 해요 😢' };
    this.pc = pc;
    try {
      const dc = pc.createDataChannel('dopamine', { ordered: true });
      this.ready(dc);
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      if (this.done || !pc.localDescription) return { ok: false, err: 'closed', text: '연결을 멈췄어요' };
      const code = await encodeCode({ k: 'offer', v: PROTO, sdp: pc.localDescription.sdp, name, at: Date.now() });
      this.deadline(OFFER_TTL, 'expired', '초대 코드가 오래됐어요. 새로 만들어 봐요!');
      return { ok: true, code };
    } catch (e) {
      this.fail('error', '초대 코드를 못 만들었어요');
      return { ok: false, err: 'error', text: `초대 코드를 못 만들었어요 (${e instanceof Error ? e.message : e})` };
    }
  }

  /** 손님: 제안 코드 → 답장 코드 */
  async join(offerText: string, name: string): Promise<RtcResult> {
    const r = await decodeCode(offerText);
    if (!r.ok) return { ok: false, err: r.err, text: codeErrText(r.err) };
    const sig = cleanSignal(r.value, 'offer');
    if (!sig) {
      const k = (r.value as { k?: string } | null)?.k;
      return { ok: false, err: 'kind', text: k === 'answer' ? '이건 답장 코드예요! 방장의 초대 코드를 붙여넣어요' : k === 'save' ? '이건 세이브 코드예요! 💾 세이브 창에 넣어요' : '초대 코드가 아니에요' };
    }
    if (sig.v !== PROTO) return { ok: false, err: 'version', text: '친구랑 게임 버전이 달라요. 둘 다 새로고침해 봐요!' };
    if (sig.at && Date.now() - sig.at > OFFER_TTL) return { ok: false, err: 'expired', text: '초대 코드가 오래됐어요. 방장에게 새 코드를 받아요!' };
    const pc = this.make();
    if (!pc) return { ok: false, err: 'nortc', text: '이 브라우저는 친구 연결(WebRTC)을 못 해요 😢' };
    this.pc = pc;
    try {
      pc.addEventListener('datachannel', (e) => this.ready(e.channel), { once: true });
      await pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      if (this.done || !pc.localDescription) return { ok: false, err: 'closed', text: '연결을 멈췄어요' };
      const code = await encodeCode({ k: 'answer', v: PROTO, sdp: pc.localDescription.sdp, name, at: Date.now() });
      this.deadline(ANSWER_TTL, 'timeout', '방장이 답장 코드를 안 넣었나 봐요. 다시 해 봐요!');
      return { ok: true, code };
    } catch (e) {
      this.fail('error', '초대 코드를 못 읽었어요');
      return { ok: false, err: 'error', text: `초대 코드를 못 읽었어요 (${e instanceof Error ? e.message : e})` };
    }
  }

  /** 방장: 답장 코드 붙이기 → 채널이 열리길 기다린다 */
  async finish(answerText: string): Promise<{ ok: true } | { ok: false; err: string; text: string }> {
    const pc = this.pc;
    if (!pc || this.done) return { ok: false, err: 'closed', text: '초대 코드부터 다시 만들어요' };
    const r = await decodeCode(answerText);
    if (!r.ok) return { ok: false, err: r.err, text: codeErrText(r.err) };
    const sig = cleanSignal(r.value, 'answer');
    if (!sig) {
      const k = (r.value as { k?: string } | null)?.k;
      return { ok: false, err: 'kind', text: k === 'offer' ? '이건 초대 코드예요! 친구가 만든 답장 코드를 넣어요' : '답장 코드가 아니에요' };
    }
    if (sig.v !== PROTO) return { ok: false, err: 'version', text: '친구랑 게임 버전이 달라요. 둘 다 새로고침해 봐요!' };
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
    } catch (e) {
      return { ok: false, err: 'sdp', text: `답장 코드가 이 초대와 안 맞아요 (${e instanceof Error ? e.message : e})` };
    }
    this.deadline(CONNECT_WAIT, 'connect', '연결이 안 됐어요 😢 같은 와이파이인지 보고, 안 되면 STUN 주소를 넣어 봐요');
    return { ok: true };
  }

  /** 그만두기(열린 통로는 Link 쪽이 맡는다) */
  close() {
    if (this.done) { this.clearTimer(); return; }
    this.done = true;
    this.clearTimer();
    try { this.pc?.close(); } catch { /* 이미 닫힘 */ }
    this.pc = null;
  }
}
