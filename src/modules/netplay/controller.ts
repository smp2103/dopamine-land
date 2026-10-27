// netplay 조종실 — 게임과 세션 사이를 잇는다(연결 단계·아바타·알림·flags.net·ext.net).
// 연결 단계(status): idle → hosting(초대 코드 만드는 중) → offer(코드 나옴, 답장 기다림) → connecting → connected
//                    idle → joining(초대 코드 읽는 중) → answer(답장 코드 나옴, 방장 기다림) → connected
//                    어디서든 → failed(안내 글) / connected → closed(끊김). reset() 으로 idle.
import type { Game } from '../../core/game';
import { splitVariant, type EconApi } from '../../core/api';
import { itemDef, GOODS } from '../economy/data';
import type { Link } from './link';
import { memoryLinkPair } from './link';
import { RtcSignal, rtcAvailable, cleanStun } from './rtc';
import { Session, closeText, type SessionHost, type SessionEvent, type PeerInfo, type ChatLine } from './session';
import {
  DEFAULT_COLORS, GUESTBOOK_MAX, cleanName, cleanColor, emoteById, EMOTES, CHAT_PRESETS,
  type GuestEntry, type Items, type Profile, type Role, type SaveSummary,
} from './protocol';
import type { BagOps } from './trade';
import type { PoseOut } from './interp';
import { RemoteAvatar } from './avatar';

export type NetStatus = 'idle' | 'hosting' | 'offer' | 'joining' | 'answer' | 'connecting' | 'connected' | 'closed' | 'failed';

/** flags.net */
export interface NetFlags {
  name?: string;
  tee?: string;
  hair?: string;
  stun?: string;
  /** 내 섬 방명록(손님들이 남긴 글, 뒤가 최신) */
  guestbook: GuestEntry[];
  /** 최근 친구(이름별) */
  friends: Array<{ name: string; tee: string; day: number; visits: number }>;
  /** 친구와 논 횟수 */
  sessions?: number;
}

/** 선물·교환이 안 되는 것(도구·탈것·이야기 물건) */
const UNTRADABLE = [/^tool_/, /^v_/, /^it_starpiece/, /^it_blackbox/, /^it_invite/, /^skin_/];

export class NetController {
  status: NetStatus = 'idle';
  role: Role | null = null;
  session: Session | null = null;
  signal: RtcSignal | null = null;
  offerCode = '';
  answerCode = '';
  /** 사용자에게 보여 줄 안내(실패·끊김) */
  note = '';
  /** 패널 입력칸 내용(다시 그려도 남게) */
  inputs: Record<string, string> = {};
  /** 친구 아바타(한 번 만들어 다시 쓴다) */
  avatar: RemoteAvatar | null = null;
  /** 받은 쪽 마지막 친구(끊겨도 패널에 이름을 보여 주려고) */
  lastPeer: PeerInfo | null = null;
  /** 바깥에서(ext.net.on) 건 app 듣기 — 세션이 바뀌어도 남는다 */
  private apps = new Map<string, Set<(data: unknown, kind: string) => void>>();
  private listeners = new Set<(e: SessionEvent | { k: 'net'; status: NetStatus }) => void>();
  private busy = false;
  /** 데모 봇(디버그) */
  bot: { session: Session; t0: number } | null = null;

  constructor(public game: Game) {
    const f = this.flags();
    this.inputs.stun = f.stun ?? '';
  }

  // ───────────── flags.net ─────────────
  flags(): NetFlags {
    const st = this.game.state;
    const f = (st.flags.net ??= {}) as Partial<NetFlags>;
    if (!Array.isArray(f.guestbook)) f.guestbook = [];
    if (!Array.isArray(f.friends)) f.friends = [];
    return f as NetFlags;
  }
  profile(): Profile {
    const f = this.flags();
    return { name: cleanName(f.name ?? '섬주민'), colors: { tee: cleanColor(f.tee, DEFAULT_COLORS.tee), hair: cleanColor(f.hair, DEFAULT_COLORS.hair) } };
  }
  setProfile(p: { name?: string; tee?: string; hair?: string }) {
    const f = this.flags();
    if (p.name !== undefined) f.name = cleanName(p.name);
    if (p.tee !== undefined) f.tee = cleanColor(p.tee, f.tee ?? DEFAULT_COLORS.tee);
    if (p.hair !== undefined) f.hair = cleanColor(p.hair, f.hair ?? DEFAULT_COLORS.hair);
    this.game.state.save();
    this.changed();
  }
  setStun(s: string) {
    this.inputs.stun = s;
    const c = cleanStun(s);
    this.flags().stun = c;
    this.game.state.save();
  }
  guestbook(): GuestEntry[] { return this.flags().guestbook; }

  // ───────────── 세션이 쓰는 게임 대역 ─────────────
  private econ(): EconApi | null { return (this.game.econ as EconApi | null) ?? null; }
  tradable(id: string): boolean {
    const base = splitVariant(id).id;
    if (UNTRADABLE.some((r) => r.test(base))) return false;
    if (this.econ()?.bag?.isTool?.(base)) return false;
    return this.game.state.species.has(base) || !!itemDef(base) || !!GOODS[base];
  }
  readonly bag: BagOps = {
    count: (id) => this.game.state.bag[id] ?? 0,
    canAdd: (id, n) => { const E = this.econ(); return E?.bag ? E.bag.canAdd(id, n) : true; },
    tradable: (id) => this.tradable(id),
    spend: (items: Items) => {
      const E = this.econ();
      if (Object.entries(items).some(([id, n]) => (this.game.state.bag[id] ?? 0) < n)) return false;
      if (E) return E.spend({ items }, 'netplay');
      for (const [id, n] of Object.entries(items)) this.game.state.addItem(id, -n);
      return true;
    },
    give: (id, n) => {
      const E = this.econ();
      if (E) return E.give(id, n, 'netplay', { silent: true });
      this.game.state.addItem(id, n);
      return n;
    },
  };
  summary(): SaveSummary {
    const st = this.game.state;
    const E = this.econ();
    return { dex: Object.keys(st.dex).length, total: st.species.size, stars: Math.round(E?.stars ?? 0), coins: Math.round(st.coins), day: this.day() };
  }
  day(): number { return Math.round(this.game.env?.day ?? this.econ()?.day?.() ?? 0); }
  worldTag(): string {
    if (this.game.world !== 'space') return 'earth';
    const pl = String(this.game.space?.planet ?? 'moon').toLowerCase().replace(/[^a-z0-9_:-]/g, '').slice(0, 24);
    return `space:${pl || 'moon'}`;
  }
  private sessionHost(): SessionHost {
    const g = this.game;
    return {
      now: () => performance.now(),
      profile: () => this.profile(),
      summary: () => this.summary(),
      pose: () => {
        const p = g.player;
        return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, m: p.mode, a: typeof p.action === 'string' && /^[a-z]{1,12}$/.test(p.action) ? p.action : null, w: this.worldTag(), s: Math.min(200, Math.max(0, p.speed || 0)) };
      },
      bag: this.bag,
      guestbook: {
        list: () => this.flags().guestbook,
        add: (e) => {
          const f = this.flags();
          f.guestbook.push(e);
          if (f.guestbook.length > GUESTBOOK_MAX) f.guestbook.splice(0, f.guestbook.length - GUESTBOOK_MAX);
          g.state.save();
        },
      },
      day: () => this.day(),
    };
  }

  // ───────────── 알림 ─────────────
  /** 패널·칩이 다시 그리도록 */
  subscribe(fn: (e: SessionEvent | { k: 'net'; status: NetStatus }) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed(e: SessionEvent | { k: 'net'; status: NetStatus } = { k: 'net', status: this.status }) {
    for (const fn of [...this.listeners]) { try { fn(e); } catch (err) { console.error('[netplay]', err); } }
  }
  private setStatus(s: NetStatus) {
    if (this.status === s) return;
    this.status = s;
    this.game.state.emit({ type: 'net-peer', state: s });
    this.changed({ k: 'net', status: s });
  }
  private toast(t: string) { this.game.hud?.toast ? this.game.hud.toast(t) : this.game.ui.toast(t); }
  private sfx(name: string, pitch?: number) { try { this.game.audio?.sfx(name, pitch ? { pitch } : undefined); } catch { /* 소리 없음 */ } }

  // ───────────── 연결 ─────────────
  get rtcOk() { return rtcAvailable(); }
  /** 방장: 초대 코드 만들기 */
  async host(): Promise<void> {
    if (this.busy || this.session) return;
    this.reset();
    this.role = 'host';
    this.setStatus('hosting');
    this.busy = true;
    const sig = this.signal = new RtcSignal(this.flags().stun ?? '');
    sig.onlink = (l) => this.attach(l, 'host');
    sig.onfail = (_e, text) => this.fail(text);
    const r = await sig.host(this.profile().name);
    this.busy = false;
    if (this.signal !== sig) return; // 그사이 그만둠
    if (!r.ok) { this.fail(r.text); return; }
    this.offerCode = r.code;
    this.setStatus('offer');
  }
  /** 손님: 초대 코드 → 답장 코드 */
  async join(text: string): Promise<void> {
    if (this.busy || this.session) return;
    this.reset();
    this.role = 'guest';
    this.setStatus('joining');
    this.busy = true;
    const sig = this.signal = new RtcSignal(this.flags().stun ?? '');
    sig.onlink = (l) => this.attach(l, 'guest');
    sig.onfail = (_e, t) => this.fail(t);
    const r = await sig.join(text, this.profile().name);
    this.busy = false;
    if (this.signal !== sig) return;
    if (!r.ok) {
      // 코드가 틀린 건 처음 화면에서 다시 붙여넣게
      sig.close(); this.signal = null; this.role = null;
      this.note = r.text;
      this.setStatus('idle');
      this.changed();
      return;
    }
    this.answerCode = r.code;
    this.setStatus('answer');
  }
  /** 방장: 답장 코드 붙이기 */
  async finish(text: string): Promise<void> {
    const sig = this.signal;
    if (!sig || this.status !== 'offer' || this.busy) return;
    this.busy = true;
    const r = await sig.finish(text);
    this.busy = false;
    if (!r.ok) { this.note = r.text; this.changed(); return; }
    this.note = '';
    if (this.status === 'offer') this.setStatus('connecting');
  }

  /** 열린 통로를 세션으로(RTC·메모리 끈 둘 다) */
  attach(link: Link, role: Role): Session {
    this.signal?.close();
    this.signal = null;
    if (this.session) this.session.close('replaced');
    this.role = role;
    this.note = '';
    this.countedThis = false;
    const s = new Session(link, role, this.sessionHost(), (e) => this.onSession(s, e));
    this.session = s;
    if (this.status !== 'connected') this.setStatus('connecting');
    return s;
  }

  private onSession(s: Session, e: SessionEvent) {
    if (this.session !== s) return;
    const g = this.game;
    switch (e.k) {
      case 'status':
        if (e.status === 'connected') {
          this.setStatus('connected');
          this.ext.visiting = this.role === 'guest';
          this.sfx('discover', 1.1);
        }
        break;
      case 'hello': {
        const first = this.lastPeer?.name !== e.peer.name || this.status !== 'connected' || !this.avatarShown;
        this.lastPeer = e.peer;
        this.ensureAvatar(e.peer);
        this.noteFriend(e.peer);
        if (first) {
          this.avatarShown = true;
          g.hud.banner({
            text: this.role === 'guest' ? `${e.peer.name}네 섬에 놀러 왔어요!` : `${e.peer.name}가 놀러 왔어요!`,
            sub: `도감 ${e.peer.summary.dex}칸 · 별 ${e.peer.summary.stars}개 · ${e.peer.summary.day + 1}일째`, icon: '👫', color: e.peer.colors.tee, ms: 3200,
          });
        }
        break;
      }
      case 'chat': {
        if (e.line.from === 'peer') { this.avatar?.say(e.line.text, g.time); this.toast(`💬 ${e.line.name}: ${e.line.text}`); this.sfx('talk-blip', 1.15); }
        break;
      }
      case 'emote': {
        const em = emoteById(e.id);
        if (!em) break;
        if (e.from === 'peer') {
          this.avatar?.say(em.icon, g.time, 2.6, true);
          if (em.pose) this.avatar?.pose(em.pose, g.time, em.sec ?? 1.5);
          this.sfx('ui-click', 1.3);
        } else if (em.pose && !g.player.mounted) g.player.act(em.pose, em.sec ?? 1.5);
        break;
      }
      case 'gift-in': {
        const name = this.itemName(e.id);
        if (e.got > 0) {
          g.hud.card({ title: `${this.peerName()}의 선물!`, body: `${this.itemIcon(e.id)} ${name} ×${e.got}${e.got < e.n ? ` (가방이 꽉 차서 ${e.n - e.got}개는 돌려보냈어요)` : ''}`, icon: '🎁', color: '#ff9fb8', ms: 3600 });
          this.sfx('unlock', 1.2);
        } else this.toast(`🎁 ${this.peerName()}가 ${name}을(를) 주려 했지만 가방이 꽉 찼어요!`);
        break;
      }
      case 'gift-ack': {
        const name = this.itemName(e.id);
        if (e.got >= e.n) this.toast(`🎁 ${this.peerName()}에게 ${name} ×${e.n} 선물했어요!`);
        else this.toast(`🎁 ${this.peerName()} 가방이 꽉 차서 ${e.n - e.got}개는 돌아왔어요`);
        break;
      }
      case 'trade':
        if (e.state.phase === 'invited') {
          this.toast(`🤝 ${this.peerName()}가 교환하자고 해요! (👫 친구 창 → 교환)`);
          this.sfx('ui-open', 1.2);
        } else if (e.state.phase === 'cancelled' && e.state.reason !== 'cancel' && e.state.reason !== 'closed') {
          this.toast(e.state.reason === 'declined' ? '교환을 거절했대요' : e.state.reason === 'timeout' ? '교환이 늦어져서 접었어요 — 물건은 그대로예요' : '친구가 교환을 그만뒀어요');
        }
        break;
      case 'trade-result':
        if (e.ok) {
          const got = Object.entries(e.got).map(([id, n]) => `${this.itemIcon(id)}×${n}`).join(' ');
          g.hud.card({ title: '교환 완료!', body: got ? `받은 것: ${got}` : '선물처럼 건넸어요', icon: '🤝', color: '#8fdc9a', ms: 3200 });
          this.sfx('achievement', 1.2);
          const lost = Object.entries(e.overflow);
          if (lost.length) this.toast(`가방이 꽉 차서 ${lost.map(([id, n]) => `${this.itemName(id)} ${n}개`).join(', ')}는 못 받았어요`);
        } else this.toast('교환이 안 됐어요 — 물건은 그대로예요');
        break;
      case 'guestbook':
        if (e.signed) this.toast(this.role === 'host' ? `📖 ${e.signed.name}가 방명록을 남겼어요: "${e.signed.text}"` : '📖 방명록에 남겼어요!');
        break;
      case 'app': {
        for (const key of [e.kind, '*']) {
          for (const fn of [...(this.apps.get(key) ?? [])]) {
            try { fn(e.data, e.kind); } catch (err) { console.error(`[netplay app ${e.kind}]`, err); }
          }
        }
        g.state.emit({ type: 'net-coop', kind: e.kind, data: e.data });
        break;
      }
      case 'error': this.note = e.text; break;
      case 'closed': {
        const was = this.status;
        this.session = null;
        this.ext.visiting = false;
        this.note = closeText(e.reason);
        this.avatarShown = false;
        if (this.avatar) this.avatar.root.visible = false;
        this.setStatus(was === 'connected' ? 'closed' : 'failed');
        if (was === 'connected') { this.toast(this.note); this.sfx('ui-close'); }
        break;
      }
    }
    this.changed(e);
  }
  private avatarShown = false;

  private fail(text: string) {
    this.signal?.close();
    this.signal = null;
    this.busy = false;
    this.note = text;
    this.setStatus('failed');
    this.changed();
  }
  /** 연결 끊기 */
  leave() {
    if (this.session) this.session.close('leave');
    else this.reset();
  }
  /** 처음 화면으로(keepRole=true 면 note 만 지운다) */
  reset(quiet = false) {
    this.signal?.close();
    this.signal = null;
    if (this.session) { this.session.close('leave'); this.session = null; }
    this.offerCode = ''; this.answerCode = '';
    this.inputs.offerIn = ''; this.inputs.answerIn = '';
    if (!quiet) this.note = '';
    this.role = null;
    this.busy = false;
    this.ext.visiting = false;
    this.setStatus('idle');
    this.changed();
  }

  // ───────────── 친구 기록·아바타 ─────────────
  private noteFriend(p: PeerInfo) {
    const f = this.flags();
    const day = this.day();
    let row = f.friends.find((r) => r.name === p.name);
    if (!row) { row = { name: p.name, tee: p.colors.tee, day, visits: 0 }; f.friends.push(row); }
    // 한 세션에 한 번만 센다(다시 온 hello 는 색만 고친다)
    if (this.countedThis) { row.tee = p.colors.tee; this.game.state.save(); return; }
    row.visits++; row.day = day; row.tee = p.colors.tee;
    this.countedThis = true;
    f.sessions = (f.sessions ?? 0) + 1;
    f.friends.sort((a, b) => b.day - a.day);
    if (f.friends.length > 8) f.friends.length = 8;
    this.game.state.save();
  }
  private countedThis = false;
  private ensureAvatar(p: PeerInfo) {
    if (!this.avatar) {
      this.avatar = new RemoteAvatar(p.name, p.colors);
      this.game.engine.scene.add(this.avatar.root);
    } else this.avatar.setProfile(p.name, p.colors);
  }
  /** 매 프레임 — 친구 아바타 자리 */
  frame(t: number, dt: number) {
    const s = this.session;
    if (!this.avatar) return;
    if (!s || !s.connected) { this.avatar.update(null, t, dt, false); return; }
    const out = s.interp.sample(performance.now());
    this.avatar.update(out, t, dt, !!out && out.w === this.worldTag());
  }
  /** 100ms 마다 */
  tick() {
    this.session?.tick();
    if (this.bot) this.botTick();
  }
  peerPose(): PoseOut | null {
    const s = this.session;
    if (!s?.connected) return null;
    const L = s.interp.latest();
    return L ? { ...L, speed: 0, extrapolating: false } : null;
  }
  /** 친구 곁으로 순간이동 */
  goToFriend(): boolean {
    const p = this.peerPose();
    if (!p) { this.toast('친구 위치를 아직 몰라요'); return false; }
    if (p.w !== this.worldTag()) { this.toast(p.w.startsWith('space') ? '친구는 우주에 있어요! 🚀' : '친구는 지구에 있어요! 🌏'); return false; }
    if (this.game.player.mounted) { this.toast('탈것에서 내려서 가요!'); return false; }
    const a = p.yaw + Math.PI / 2;
    this.game.player.teleport(p.x - Math.sin(a) * 1.6, p.z - Math.cos(a) * 1.6);
    this.toast(`${this.peerName()} 곁으로 왔어요! 👋`);
    return true;
  }

  // ───────────── 놀이 ─────────────
  peerName() { return this.session?.peer?.name ?? this.lastPeer?.name ?? '친구'; }
  itemName(id: string) {
    const base = splitVariant(id).id;
    return this.game.state.species.get(base)?.name ?? itemDef(base)?.name ?? GOODS[base]?.name ?? id;
  }
  itemIcon(id: string) {
    const base = splitVariant(id).id;
    const s = this.game.state.species.get(base);
    return itemDef(base)?.icon ?? GOODS[base]?.icon ?? (s ? (s.category === 'insect' ? '🦋' : s.category === 'fish' ? '🐟' : '✨') : '📦');
  }
  emote(id: string) {
    if (!this.session?.emote(id)) this.toast('친구랑 연결되면 쓸 수 있어요');
  }
  say(text: string | number): boolean {
    const ok = !!this.session?.say(text);
    if (!ok) this.toast(this.session?.connected ? '한 마디 적어 줘요!' : '친구랑 연결되면 쓸 수 있어요');
    else {
      // 내 머리 위에도 잠깐(친구 화면과 같은 말)
      const line = this.session!.chat[this.session!.chat.length - 1];
      if (line) this.toast(`💬 나: ${line.text}`);
    }
    return ok;
  }
  gift(id: string, n: number): boolean {
    const r = this.session?.gift(id, n) ?? { ok: false as const, text: '친구랑 연결돼 있지 않아요' };
    if (!r.ok) this.toast(r.text);
    else { this.game.player.act('hold', 0.8); this.sfx('pick', 1.2); }
    this.changed();
    return r.ok;
  }
  chatLog(): ChatLine[] { return this.session?.chat ?? []; }
  /** 가방 속 보낼 수 있는 것 */
  giftable(): Array<{ id: string; n: number }> {
    return Object.entries(this.game.state.bag).filter(([id, n]) => n > 0 && this.tradable(id)).map(([id, n]) => ({ id, n })).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** app 통로 듣기(세션이 바뀌어도 남는다). 해제 함수를 돌려준다 */
  onApp(kind: string, fn: (data: unknown, kind: string) => void): () => void {
    let set = this.apps.get(kind);
    if (!set) { set = new Set(); this.apps.set(kind, set); }
    set.add(fn);
    return () => { set!.delete(fn); };
  }

  // ───────────── ext.net(다른 모듈용) ─────────────
  /** game.ext.net — 모양은 netplay.ts 머리글 참고 */
  readonly ext: NetExt = makeExt(this);

  // ───────────── 데모 봇(디버그: 혼자서 친구 놀이 확인) ─────────────
  /** 메모리 끈으로 가짜 친구를 붙인다 — 내 주위를 빙글 돌며 가끔 인사 */
  demo(): Session {
    this.reset(true);
    const { a, b } = memoryLinkPair();
    const g = this.game;
    const botBag: Record<string, number> = { m_apple: 3, m_shell: 5 };
    const t0 = performance.now();
    const c = { x: g.player.pos.x, z: g.player.pos.z };
    const botHost: SessionHost = {
      now: () => performance.now(),
      profile: () => ({ name: '꼬마친구', colors: { tee: '#7cc8f0', hair: '#f2d27a' } }),
      summary: () => ({ dex: 42, total: this.game.state.species.size, stars: 12, coins: 3400, day: this.day() }),
      pose: () => {
        const k = (performance.now() - t0) / 1000 * 0.35;
        const x = c.x + Math.cos(k) * 4, z = c.z + Math.sin(k) * 4;
        const y = g.groundAt(x, z);
        return { x, y, z, yaw: Math.atan2(Math.sin(k), -Math.cos(k)) + Math.PI, m: 'ground', a: null, w: this.worldTag(), s: 1.4 };
      },
      bag: {
        count: (id) => botBag[id] ?? 0, canAdd: () => true, tradable: () => true,
        spend: (items) => { if (Object.entries(items).some(([id, n]) => (botBag[id] ?? 0) < n)) return false; for (const [id, n] of Object.entries(items)) botBag[id] -= n; return true; },
        give: (id, n) => { botBag[id] = (botBag[id] ?? 0) + n; return n; },
      },
      guestbook: { list: () => [], add: () => {} },
      day: () => this.day(),
    };
    const bs = new Session(b, 'guest', botHost);
    this.bot = { session: bs, t0 };
    this.attach(a, 'host');
    return bs;
  }
  private botStep = 0;
  private botTick() {
    const b = this.bot!;
    b.session.tick();
    if (b.session.status === 'closed') { this.bot = null; return; }
    const sec = (performance.now() - b.t0) / 1000;
    const step = Math.floor(sec / 6);
    if (step > this.botStep && b.session.connected) {
      this.botStep = step;
      if (step % 2) b.session.emote(['wave', 'heart', 'cheer', 'laugh'][(step >> 1) % 4]);
      else b.session.say(step % 4 === 0 ? 1 : 10);
      // 교환 창이 열렸으면 봇도 사과 하나 내고 좋아요
      const tr = b.session.trade;
      if (tr.phase === 'invited') b.session.tradeAccept();
      else if (tr.phase === 'open') { if (!Object.keys(tr.mine.items).length) b.session.tradeOffer({ m_apple: 1 }); else if (!tr.mine.ok) b.session.tradeConfirm(); }
      else if (tr.phase === 'done' || tr.phase === 'cancelled') b.session.tradeClear();
    }
  }
}

/** game.ext.net 모양 */
export interface NetExt {
  /** 친구 섬에 놀러 와 있나(손님으로 연결되면 true — netplay-play 도 쓸 수 있다) */
  visiting: boolean;
  /** netplay-play 가 채우는 잡기 태그 배수(하트 짝 보너스 등) */
  boostTags: Record<string, number>;
  readonly status: NetStatus;
  readonly role: Role | null;
  readonly peer: PeerInfo | null;
  readonly connected: boolean;
  send(kind: string, data?: unknown): boolean;
  on(kind: string, fn: (data: unknown, kind: string) => void): () => void;
  peerPose(): PoseOut | null;
  profile(): Profile;
  guestbook(): GuestEntry[];
  emote(id: string): void;
  say(text: string | number): boolean;
  gift(id: string, n?: number): boolean;
  open(tab?: string): void;
  leave(): void;
  readonly emotes: typeof EMOTES;
  readonly presets: typeof CHAT_PRESETS;
}

function makeExt(c: NetController): NetExt {
  return {
    visiting: false,
    boostTags: {},
    get status() { return c.status; },
    get role() { return c.status === 'connected' ? c.role : null; },
    get peer() { return c.session?.connected ? c.session.peer : null; },
    get connected() { return !!c.session?.connected; },
    send: (kind, data) => !!c.session?.sendApp(kind, data),
    on: (kind, fn) => c.onApp(kind, fn),
    peerPose: () => c.peerPose(),
    profile: () => c.profile(),
    guestbook: () => (c.role === 'guest' && c.session?.connected ? c.session.remoteGuestbook : c.guestbook()),
    emote: (id) => c.emote(id),
    say: (text) => c.say(text),
    gift: (id, n = 1) => c.gift(id, n),
    open: (tab) => c.game.hud.open('friends', tab),
    leave: () => c.leave(),
    emotes: EMOTES,
    presets: CHAT_PRESETS,
  };
}
