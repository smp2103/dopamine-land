// 친구 한 명과의 놀이 세션 — 통로(Link) 위에서 인사·자세·이모트·채팅·선물·교환·방명록·app 통로를 돌린다.
// 화면·three·게임을 모른다: 필요한 건 SessionHost 로 받고, 일어난 일은 onEvent 로 알린다(그래서 메모리 끈으로 시험된다).
// 시간은 host.now()(ms) 만 본다. tick() 을 100ms 쯤마다 불러 줘야 한다(자세 10Hz·핑·시간 초과).
import type { Link } from './link';
import {
  encodeMsg, decodeMsg, PROTO, CHAT_PRESETS, GUESTBOOK_MAX, cleanChat, emoteById,
  type Msg, type Role, type Profile, type SaveSummary, type GuestEntry, type Items, type PoseMsg,
} from './protocol';
import { InterpBuffer, type PoseSample } from './interp';
import { idleTrade, tradeStep, isReady, isActive, sameItems, canPay, canReceive, applyTrade, type TradeState, type TradeEvent, type BagOps } from './trade';

/** 자세 보내는 간격(ms) — 10Hz */
export const POSE_MS = 100;
/** 그대로여도 이만큼마다 한 번은 보낸다 */
export const POSE_KEEP_MS = 1000;
/** 핑 간격 */
export const PING_MS = 2000;
/** 이만큼 아무 소식이 없으면 끊긴 것으로 본다 */
export const SILENCE_MS = 15_000;
/** 인사(hello)를 기다리는 시간 */
export const HELLO_MS = 10_000;
/** 교환 commit 뒤 done 을 기다리는 시간(방장) */
export const COMMIT_MS = 15_000;
/** 한 세션에 손님이 쓸 수 있는 방명록 줄 수 */
export const GB_PER_SESSION = 3;
/** 채팅 기록 길이 */
export const CHAT_LOG = 30;

export type SessionStatus = 'handshake' | 'connected' | 'closed';
export interface PeerInfo extends Profile { summary: SaveSummary; role: Role; v: number }
export interface ChatLine { from: 'me' | 'peer'; name: string; text: string; at: number }

/** 세션이 바깥에서 받는 것 */
export interface SessionHost {
  /** 단조 시각(ms) */
  now(): number;
  profile(): Profile;
  summary(): SaveSummary;
  /** 지금 내 자세(없으면 안 보낸다) */
  pose(): Omit<PoseSample, 'ts'> | null;
  bag: BagOps;
  /** 내(방장) 방명록 — 손님 글을 여기 적는다 */
  guestbook: { list(): GuestEntry[]; add(e: GuestEntry): void };
  day(): number;
}

export type SessionEvent =
  | { k: 'status'; status: SessionStatus }
  | { k: 'hello'; peer: PeerInfo }
  | { k: 'chat'; line: ChatLine }
  | { k: 'emote'; from: 'me' | 'peer'; id: string }
  | { k: 'gift-in'; id: string; n: number; got: number }
  | { k: 'gift-ack'; id: string; n: number; got: number; refunded: number }
  | { k: 'trade'; state: TradeState }
  | { k: 'trade-result'; ok: boolean; gave: Items; got: Items; overflow: Items; reason?: string }
  | { k: 'guestbook'; entries: GuestEntry[]; signed?: GuestEntry }
  | { k: 'app'; kind: string; data: unknown }
  | { k: 'error'; text: string }
  | { k: 'closed'; reason: string };

/** 끊긴 까닭 → 안내 글 */
export function closeText(reason: string): string {
  switch (reason) {
    case 'bye': case 'peer-closed': return '친구가 집에 갔어요. 또 놀자! 👋';
    case 'leave': return '연결을 끊었어요';
    case 'timeout': case 'lost': return '친구 소식이 끊겼어요 😢 (와이파이를 확인해 봐요)';
    case 'hello-timeout': return '친구가 인사를 안 해요… 다시 연결해 봐요';
    case 'version': return '친구랑 게임 버전이 달라요. 둘 다 새로고침해 봐요!';
    case 'role': return '둘 다 같은 역할이에요(방장·손님) — 한 명만 방을 만들어요';
    case 'failed': return '연결이 끊어졌어요 😢';
    default: return '연결이 끝났어요';
  }
}

export class Session {
  status: SessionStatus = 'handshake';
  peer: PeerInfo | null = null;
  readonly interp = new InterpBuffer();
  trade: TradeState = idleTrade();
  /** 방장의 방명록(손님일 때 받은 것) */
  remoteGuestbook: GuestEntry[] = [];
  chat: ChatLine[] = [];
  closeReason = '';

  private lastHeard: number;
  private lastPing: number;
  private lastPose = -Infinity;
  private lastPoseSig = '';
  private readonly started: number;
  private gid = 0;
  private tidN = 0;
  private pendingGifts = new Map<string, { id: string; n: number }>();
  /** 방장이 commit 하며 맡겨 둔 것 */
  private escrow: { tid: string; items: Items; get: Items; at: number } | null = null;
  private gbSigned = 0;
  private apps = new Map<string, Set<(data: unknown, kind: string) => void>>();

  constructor(
    public readonly link: Link,
    public readonly role: Role,
    private host: SessionHost,
    private onEvent: (e: SessionEvent) => void = () => {},
  ) {
    const now = host.now();
    this.started = now; this.lastHeard = now; this.lastPing = now;
    link.onmessage = (t) => this.receive(t);
    link.onclose = (r) => this.closed(r);
    this.sendHello();
  }

  get connected() { return this.status === 'connected'; }

  // ───────────── 보내기 ─────────────
  private send(m: Msg): boolean {
    if (this.status === 'closed') return false;
    return this.link.send(encodeMsg(m));
  }
  private sendHello() {
    const p = this.host.profile();
    this.send({ t: 'hello', v: PROTO, name: p.name, colors: p.colors, summary: this.host.summary(), role: this.role });
  }
  private emit(e: SessionEvent) {
    try { this.onEvent(e); } catch (err) { console.error('[netplay session]', err); }
  }

  /** 100ms 쯤마다 — 자세 보내기·핑·시간 초과 */
  tick() {
    if (this.status === 'closed') return;
    const now = this.host.now();
    if (this.status === 'handshake' && now - this.started > HELLO_MS) { this.close('hello-timeout'); return; }
    if (now - this.lastHeard > SILENCE_MS) { this.close('timeout'); return; }
    if (now - this.lastPing >= PING_MS) { this.lastPing = now; this.send({ t: 'ping', ts: now }); }
    if (this.escrow && now - this.escrow.at > COMMIT_MS) {
      // done 이 안 온다 — 맡긴 걸 돌려받고 교환을 접는다
      this.refundEscrow();
      this.send({ t: 'trade', op: 'cancel', tid: this.trade.tid });
      this.stepTrade({ k: 'cancel', reason: 'timeout' });
    }
    if (this.status === 'connected' && now - this.lastPose >= POSE_MS) this.sendPose(now);
  }
  private sendPose(now: number) {
    const p = this.host.pose();
    if (!p) return;
    const r = (v: number) => Math.round(v * 100) / 100;
    const m: PoseMsg = { t: 'pose', ts: Math.round(now), x: r(p.x), y: r(p.y), z: r(p.z), yaw: Math.round(p.yaw * 1000) / 1000, m: p.m as PoseMsg['m'], a: p.a, w: p.w, s: Math.round(p.s * 10) / 10 };
    const sig = `${m.x},${m.y},${m.z},${m.yaw},${m.m},${m.a},${m.w}`;
    if (sig === this.lastPoseSig && now - this.lastPose < POSE_KEEP_MS) return;
    this.lastPoseSig = sig;
    this.lastPose = now;
    this.send(m);
  }

  /** 이모트·스티커 */
  emote(id: string): boolean {
    if (!this.connected || !emoteById(id)) return false;
    this.send({ t: 'emote', id });
    this.emit({ k: 'emote', from: 'me', id });
    return true;
  }
  /** 채팅: 숫자면 정해진 말, 글이면 40자로 다듬어서 */
  say(text: string | number): boolean {
    if (!this.connected) return false;
    let m: Msg;
    let shown: string;
    if (typeof text === 'number') {
      if (!CHAT_PRESETS[text]) return false;
      m = { t: 'chat', text: CHAT_PRESETS[text], preset: text };
      shown = CHAT_PRESETS[text];
    } else {
      shown = cleanChat(text);
      if (!shown) return false;
      m = { t: 'chat', text: shown };
    }
    if (!this.send(m)) return false;
    this.pushChat({ from: 'me', name: this.host.profile().name, text: shown, at: Date.now() });
    return true;
  }
  private pushChat(line: ChatLine) {
    this.chat.push(line);
    if (this.chat.length > CHAT_LOG) this.chat.splice(0, this.chat.length - CHAT_LOG);
    this.emit({ k: 'chat', line });
  }

  /** 선물: 내 가방에서 빼서 보낸다. 못 보내면 까닭 글 */
  gift(id: string, n = 1): { ok: true } | { ok: false; text: string } {
    if (!this.connected) return { ok: false, text: '친구랑 연결돼 있지 않아요' };
    const bag = this.host.bag;
    n = Math.floor(n);
    if (n < 1) return { ok: false, text: '몇 개를 줄지 골라요' };
    if (!bag.tradable(id)) return { ok: false, text: '이건 선물할 수 없어요' };
    if (bag.count(id) < n) return { ok: false, text: '가방에 그만큼 없어요' };
    if (!bag.spend({ [id]: n })) return { ok: false, text: '가방에서 꺼내지 못했어요' };
    const gid = `g${this.role[0]}${++this.gid}`;
    if (!this.send({ t: 'gift', gid, id, n })) {
      bag.give(id, n);
      return { ok: false, text: '선물을 못 보냈어요 — 돌려받았어요' };
    }
    this.pendingGifts.set(gid, { id, n });
    return { ok: true };
  }

  /** 방명록에 쓰기(손님만, 세션당 GB_PER_SESSION 줄) */
  signGuestbook(text: string): { ok: true } | { ok: false; text: string } {
    if (!this.connected) return { ok: false, text: '친구랑 연결돼 있지 않아요' };
    if (this.role !== 'guest') return { ok: false, text: '방명록은 놀러 간 손님이 써요' };
    const t = cleanChat(text);
    if (!t) return { ok: false, text: '한 마디 적어 줘요!' };
    if (this.gbSigned >= GB_PER_SESSION) return { ok: false, text: `한 번 놀러 가면 ${GB_PER_SESSION}줄까지 쓸 수 있어요` };
    this.gbSigned++;
    this.send({ t: 'gb-sign', text: t });
    return { ok: true };
  }

  // ── app 통로(다른 모듈용)
  /** 보내기 — data 는 JSON 이 되는 값 */
  sendApp(kind: string, data?: unknown): boolean {
    if (!this.connected || !/^[A-Za-z0-9_:.-]{1,48}$/.test(kind)) return false;
    return this.send({ t: 'app', kind, data: data === undefined ? null : data });
  }
  /** 받기 — kind '*' 는 전부. 해제 함수를 돌려준다 */
  onApp(kind: string, fn: (data: unknown, kind: string) => void): () => void {
    let set = this.apps.get(kind);
    if (!set) { set = new Set(); this.apps.set(kind, set); }
    set.add(fn);
    return () => { set!.delete(fn); };
  }

  // ── 교환
  private stepTrade(e: TradeEvent) {
    const next = tradeStep(this.trade, e);
    if (next === this.trade) return false;
    this.trade = next;
    this.emit({ k: 'trade', state: next });
    return true;
  }
  /** 교환하자고 하기 */
  tradeInvite(): boolean {
    if (!this.connected || isActive(this.trade)) return false;
    const tid = `t${this.role[0]}${++this.tidN}_${Math.round(this.host.now()) % 1e6}`;
    this.stepTrade({ k: 'invite', tid });
    return this.send({ t: 'trade', op: 'invite', tid });
  }
  tradeAccept(): boolean {
    if (this.trade.phase !== 'invited') return false;
    this.stepTrade({ k: 'accept' });
    return this.send({ t: 'trade', op: 'accept', tid: this.trade.tid });
  }
  /** 거절·그만두기(어느 단계든) */
  tradeCancel(reason = 'cancel'): boolean {
    if (!isActive(this.trade)) return false;
    if (this.trade.phase === 'committing' && this.role === 'guest') return false; // 손님은 처리 중엔 못 끊는다(곧 끝난다)
    if (this.escrow) this.refundEscrow();
    this.send({ t: 'trade', op: this.trade.phase === 'invited' ? 'decline' : 'cancel', tid: this.trade.tid });
    return this.stepTrade({ k: 'cancel', reason });
  }
  /** 내 쪽 물건 정하기(바꾸면 두 사람 좋아요가 풀린다) */
  tradeOffer(items: Items): { ok: true } | { ok: false; text: string } {
    if (this.trade.phase !== 'open') return { ok: false, text: '교환 창이 열려 있지 않아요' };
    const bad = Object.keys(items).find((id) => items[id] > 0 && !this.host.bag.tradable(id));
    if (bad) return { ok: false, text: '이건 교환할 수 없어요' };
    if (!canPay(this.host.bag, Object.fromEntries(Object.entries(items).filter(([, n]) => n > 0)))) return { ok: false, text: '가방에 그만큼 없어요' };
    if (this.stepTrade({ k: 'offer', items })) this.send({ t: 'trade', op: 'offer', tid: this.trade.tid, items: this.trade.mine.items, rev: this.trade.mine.rev });
    return { ok: true };
  }
  /** 좋아요 */
  tradeConfirm(): { ok: true } | { ok: false; text: string } {
    const s = this.trade;
    if (s.phase !== 'open') return { ok: false, text: '교환 창이 열려 있지 않아요' };
    if (!canPay(this.host.bag, s.mine.items)) return { ok: false, text: '가방에 그만큼 없어요' };
    if (!canReceive(this.host.bag, s.theirs.items, s.mine.items)) return { ok: false, text: '가방이 꽉 차서 받을 수 없어요!' };
    if (!this.stepTrade({ k: 'confirm' })) return { ok: true };
    this.send({ t: 'trade', op: 'confirm', tid: s.tid, rev: this.trade.mine.rev, theirRev: this.trade.theirs.rev });
    this.maybeCommit();
    return { ok: true };
  }
  tradeUnconfirm(): boolean {
    if (!this.stepTrade({ k: 'unconfirm' })) return false;
    return this.send({ t: 'trade', op: 'unconfirm', tid: this.trade.tid });
  }
  /** 방장: 둘 다 좋아요면 내 것을 맡기고 commit */
  private maybeCommit() {
    if (this.role !== 'host' || !isReady(this.trade)) return;
    const s = this.trade;
    const bag = this.host.bag;
    if (!canPay(bag, s.mine.items) || !canReceive(bag, s.theirs.items, s.mine.items) || (Object.keys(s.mine.items).length && !bag.spend(s.mine.items))) {
      this.tradeUnconfirm();
      this.emit({ k: 'error', text: '가방 사정이 바뀌어서 교환을 다시 확인해야 해요' });
      return;
    }
    this.escrow = { tid: s.tid, items: { ...s.mine.items }, get: { ...s.theirs.items }, at: this.host.now() };
    this.stepTrade({ k: 'commit' });
    this.send({ t: 'trade', op: 'commit', tid: s.tid, host: s.mine.items, guest: s.theirs.items });
  }
  private refundEscrow() {
    const e = this.escrow;
    if (!e) return;
    this.escrow = null;
    for (const [id, n] of Object.entries(e.items)) this.host.bag.give(id, n);
  }

  // ───────────── 받기 ─────────────
  private receive(text: string) {
    if (this.status === 'closed') return;
    const r = decodeMsg(text);
    if (!r.ok) {
      if (r.err === 'version') { this.emit({ k: 'error', text: closeText('version') }); this.close('version'); }
      return; // 모양이 이상한 쪽지는 조용히 버린다
    }
    this.lastHeard = this.host.now();
    const m = r.msg;
    if (this.status === 'handshake' && m.t !== 'hello' && m.t !== 'ping' && m.t !== 'pong' && m.t !== 'bye') return;
    switch (m.t) {
      case 'hello': {
        if (m.role === this.role) { this.emit({ k: 'error', text: closeText('role') }); this.close('role'); return; }
        const first = !this.peer;
        this.peer = { name: m.name, colors: m.colors, summary: m.summary, role: m.role, v: m.v };
        if (first) {
          this.status = 'connected';
          this.emit({ k: 'status', status: 'connected' });
          // 방장은 손님에게 방명록을 보여 준다
          if (this.role === 'host') this.send({ t: 'gb', entries: this.host.guestbook.list().slice(-GUESTBOOK_MAX) });
        }
        this.emit({ k: 'hello', peer: this.peer });
        break;
      }
      case 'bye': this.close('bye', false); break;
      case 'ping': this.send({ t: 'pong', ts: m.ts }); break;
      case 'pong': break;
      case 'pose': this.interp.push({ ts: m.ts, x: m.x, y: m.y, z: m.z, yaw: m.yaw, m: m.m, a: m.a, w: m.w, s: m.s }, this.host.now()); break;
      case 'emote': this.emit({ k: 'emote', from: 'peer', id: m.id }); break;
      case 'chat': this.pushChat({ from: 'peer', name: this.peer?.name ?? '친구', text: m.text, at: Date.now() }); break;
      case 'gift': {
        const bag = this.host.bag;
        const got = bag.tradable(m.id) ? bag.give(m.id, m.n) : 0;
        this.send({ t: 'gift-ack', gid: m.gid, got });
        this.emit({ k: 'gift-in', id: m.id, n: m.n, got });
        break;
      }
      case 'gift-ack': {
        const g = this.pendingGifts.get(m.gid);
        if (!g) break;
        this.pendingGifts.delete(m.gid);
        const back = Math.max(0, g.n - Math.min(g.n, m.got));
        // 친구 가방이 꽉 차서 못 받은 만큼 돌려받는다
        const refunded = back > 0 ? this.host.bag.give(g.id, back) : 0;
        this.emit({ k: 'gift-ack', id: g.id, n: g.n, got: Math.min(g.n, m.got), refunded });
        break;
      }
      case 'trade': this.onTrade(m); break;
      case 'gb-sign': {
        if (this.role !== 'host' || !this.peer) break;
        const e: GuestEntry = { name: this.peer.name, text: m.text, day: this.host.day(), at: Date.now(), tee: this.peer.colors.tee };
        this.host.guestbook.add(e);
        const entries = this.host.guestbook.list().slice(-GUESTBOOK_MAX);
        this.send({ t: 'gb', entries });
        this.emit({ k: 'guestbook', entries, signed: e });
        break;
      }
      case 'gb': {
        if (this.role !== 'guest') break;
        const prev = this.remoteGuestbook.length;
        this.remoteGuestbook = m.entries;
        this.emit({ k: 'guestbook', entries: m.entries, signed: m.entries.length > prev && prev > 0 ? m.entries[m.entries.length - 1] : undefined });
        break;
      }
      case 'app': {
        for (const key of [m.kind, '*']) {
          for (const fn of [...(this.apps.get(key) ?? [])]) {
            try { fn(m.data, m.kind); } catch (e) { console.error(`[netplay app ${m.kind}]`, e); }
          }
        }
        this.emit({ k: 'app', kind: m.kind, data: m.data });
        break;
      }
    }
  }

  private onTrade(m: Extract<Msg, { t: 'trade' }>) {
    const s = this.trade;
    if (m.op === 'invite') {
      if (isActive(s)) {
        // 동시에 서로 초대 — 방장 초대가 이긴다
        if (s.phase === 'inviting' && this.role === 'guest') {
          this.trade = idleTrade();
          this.stepTrade({ k: 'remote-invite', tid: m.tid });
          this.tradeAccept();
        } else if (s.tid !== m.tid && this.role === 'host' && s.phase !== 'inviting') {
          this.send({ t: 'trade', op: 'decline', tid: m.tid });
        }
        return;
      }
      this.stepTrade({ k: 'remote-invite', tid: m.tid });
      return;
    }
    if (m.tid !== s.tid) return; // 다른(옛) 교환 이야기
    const bag = this.host.bag;
    switch (m.op) {
      case 'accept': this.stepTrade({ k: 'remote-accept' }); break;
      case 'decline': case 'cancel':
        if (this.escrow) this.refundEscrow();
        this.stepTrade({ k: 'cancel', reason: m.op === 'decline' ? 'declined' : 'peer-cancel' });
        break;
      case 'offer': this.stepTrade({ k: 'remote-offer', items: m.items ?? {}, rev: m.rev ?? 0 }); break;
      case 'confirm':
        this.stepTrade({ k: 'remote-confirm', rev: m.rev ?? -1, theirRev: m.theirRev ?? -1 });
        this.maybeCommit();
        break;
      case 'unconfirm': this.stepTrade({ k: 'remote-unconfirm' }); break;
      case 'commit': {
        // 손님: 방장이 낸 묶음이 내가 본 것과 같은지 보고 한 번에 처리
        if (this.role !== 'guest') break;
        const hostItems = m.host ?? {}, guestItems = m.guest ?? {};
        if (!isReady(s) || !sameItems(hostItems, s.theirs.items) || !sameItems(guestItems, s.mine.items)) {
          this.send({ t: 'trade', op: 'done', tid: s.tid, ok: false });
          if (isReady(s)) { this.stepTrade({ k: 'commit' }); this.stepTrade({ k: 'done', ok: false, reason: 'mismatch' }); }
          break;
        }
        this.stepTrade({ k: 'commit' });
        const r = applyTrade(bag, s.mine.items, s.theirs.items);
        this.send({ t: 'trade', op: 'done', tid: s.tid, ok: r.ok });
        this.stepTrade({ k: 'done', ok: r.ok, reason: r.ok ? 'ok' : 'bag' });
        this.emit({ k: 'trade-result', ok: r.ok, gave: r.ok ? s.mine.items : {}, got: r.ok ? s.theirs.items : {}, overflow: r.overflow, reason: r.ok ? undefined : 'bag' });
        break;
      }
      case 'done': {
        // 방장: 손님이 처리했으면 손님 물건을 받고, 못 했으면 맡긴 걸 돌려받는다
        if (this.role !== 'host' || !this.escrow || this.escrow.tid !== s.tid) break;
        const e = this.escrow;
        this.escrow = null;
        if (m.ok) {
          const overflow: Items = {};
          for (const [id, n] of Object.entries(e.get)) { const got = bag.give(id, n); if (got < n) overflow[id] = n - got; }
          this.stepTrade({ k: 'done', ok: true });
          this.emit({ k: 'trade-result', ok: true, gave: e.items, got: e.get, overflow });
        } else {
          for (const [id, n] of Object.entries(e.items)) bag.give(id, n);
          this.stepTrade({ k: 'done', ok: false, reason: 'peer-fail' });
          this.emit({ k: 'trade-result', ok: false, gave: {}, got: {}, overflow: {}, reason: 'peer-fail' });
        }
        break;
      }
    }
  }

  /** 끝난 교환 창 치우기(done·cancelled → idle) */
  tradeClear() { if (!isActive(this.trade)) { this.trade = idleTrade(); this.emit({ k: 'trade', state: this.trade }); } }

  // ───────────── 끝 ─────────────
  /** 끊기(sayBye = 상대에게 인사 쪽지) */
  close(reason = 'leave', sayBye = true) {
    if (this.status === 'closed') return;
    if (sayBye) this.send({ t: 'bye', reason });
    this.finish(reason);
    this.link.close(reason);
  }
  private closed(reason: string) { this.finish(reason); }
  private finish(reason: string) {
    if (this.status === 'closed') return;
    // 처리 중이던 교환: 방장은 맡긴 걸 돌려받는다
    if (this.escrow) this.refundEscrow();
    if (isActive(this.trade)) { this.trade = tradeStep(this.trade, { k: 'cancel', reason: 'closed' }); this.emit({ k: 'trade', state: this.trade }); }
    this.status = 'closed';
    this.closeReason = reason;
    this.interp.clear();
    this.apps.clear();
    this.emit({ k: 'status', status: 'closed' });
    this.emit({ k: 'closed', reason });
  }
}
