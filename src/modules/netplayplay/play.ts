// netplay-play 놀이 진행(GDD 4.15) — game.ext.net 의 app 통로('np') 위에서 둘이 같이 하는 것들을 돌린다.
// 화면(three)은 PlayView 로, 창(DOM)은 panel.ts 로 따로 — 이 파일은 node 테스트에서 가짜 친구 둘로 그대로 돈다.
//
// 누가 주인인가
//   방문객 상자·협동 보스 HP → 방장(host)이 정한다(손님은 결과만 받는다).
//   레이스·낚시 대회·숨바꼭질 → 둘이 같은 규칙으로 각자 재고, 서로 기록을 보낸다(초대한 쪽이 출발 신호).
//   도감 교환 → 보낸 쪽 제안 → 받은 쪽 수락(돌려줄 종 하나 골라도 되고 안 골라도 된다) → 양쪽이 각자 적는다.
import * as THREE from 'three';
import type { Game, Mountable, Input } from '../../core/game';
import type { Species } from '../../core/state';
import { DAY_SEC, type EconApi } from '../../core/api';
import * as Island from '../../core/island';
import { saturationMult } from '../economy/price';
import {
  APP_KIND, decodeMsg, ensurePlay, ensureDexFrom, takeDaily, chestReady, claimVisitorChest, guestMayOpen, VISITOR_CHEST, CHEST_REACH,
  marketRows, friendSale, QUOTE_TTL, COURSES, RACE_NAMES, START_R, COUNTDOWN, RACE_LIMIT, RaceTrack, raceWinner, fmtMs,
  CONTEST_SEC, FishContest, contestWinner, catchCm, peerNoiseRate, sharedGauge, DUO_SUMMIT_R,
  BOSSES, BossFight, bossPlaceOk, BOSS_REACH, BOSS_PAIR_R, DEX_PER_DAY, dexGiftable, markDexGift, dexGiftLabel,
  HIDE_SEC, SEEK_SEC, FIND_R, HIDE_VIS_R, warmth, waterKey, heartBoost, HEART_TAG, RIDE_REACH, TITLES, grantTitle,
  type Msg, type RaceKind, type BossKind, type GameKind, type PlayFlags, type DexFrom, type MarketRow, type Course, type BossState,
} from './logic';

// ───────────── 바깥과 잇는 모양 ─────────────
/** 친구 자세(netplay peerPose) */
export interface PeerPose { x: number; y: number; z: number; yaw: number; m: string; a: string | null; w: string; s: number }
/** game.ext.net 에서 이 모듈이 쓰는 부분(netplay.ts 머리글) */
export interface NetLike {
  readonly connected: boolean;
  readonly role: 'host' | 'guest' | null;
  readonly peer: { name: string; colors?: { tee: string } } | null;
  visiting: boolean;
  boostTags: Record<string, number>;
  coPedal?: boolean;
  send(kind: string, data?: unknown): boolean;
  on(kind: string, fn: (data: unknown, kind: string) => void): () => void;
  peerPose(): PeerPose | null;
}
/** 화면 쪽(three) — 테스트는 아무것도 안 그리는 걸 넣는다 */
export interface PlayView {
  chest(on: boolean, x: number, y: number, z: number): void;
  chestPop(): void;
  course(c: Course | null, next: number): void;
  boss(b: { kind: BossKind; x: number; y: number; z: number; hp: number; max: number; st: BossState } | null): void;
  bossHit(): void;
  firework(x: number, y: number, z: number, seed: number): void;
  update(t: number, dt: number): void;
}
export const NULL_VIEW: PlayView = { chest() {}, chestPop() {}, course() {}, boss() {}, bossHit() {}, firework() {}, update() {} };
/** 티노(dinos) — 낮잠 기계를 고칠 수 있으면 친구 소리를 얹는다 */
export interface TinoHandle { m: { state: string; gauge: number }; x: number; z: number }
export interface PlayDeps {
  view?: PlayView;
  /** 친구 아바타 뿌리(2인 탈것 뒷자리에 붙이기 · 숨바꼭질 숨기기) */
  avatar?: () => THREE.Object3D | null;
  tino?: () => TinoHandle | null;
}

/** 진행 중인 초대 */
interface Invite { id: string; g: GameKind; at: number; from: 'me' | 'peer' }
interface RaceRun {
  kind: 'race'; id: string; race: RaceKind; track: RaceTrack; leader: boolean;
  phase: 'gather' | 'count' | 'go' | 'done'; meReady: boolean; peerReady: boolean; t0: number; goAt: number;
  myMs: number | null; peerMs: number | null; peerPassed: number; doneAt: number; hinted: number;
}
interface ContestRun { kind: 'contest'; id: string; endAt: number; me: FishContest; peer: { total: number; n: number; best: number }; phase: 'on' | 'wait' | 'done'; doneAt: number }
interface HideRun { kind: 'hide'; id: string; role: 'seeker' | 'hider'; phase: 'hide' | 'seek' | 'done'; t0: number; doneAt: number }
type Run = RaceRun | ContestRun | HideRun;

const LOCK = 'netplayplay';
/** 친구 버프 길이(게임 분) · 이만큼(게임 초) 아래로 남으면 다시 건다 — 게임 1분 = 1.25초 */
const FRIEND_BUFF_MIN = 10;
const FRIEND_BUFF_REFRESH = 3 * (DAY_SEC / 24 / 60);
/** 티노 없을 때 둘 소음 게이지가 식는 빠르기(%/초) · 꼭대기 보너스 문턱 */
const QUIET_DECAY = 6;
const QUIET_MAX = 70;
const QUIET_HOLD = 2;
/** 보스가 둘 앞 이만큼(m)에서 나온다(BOSS_REACH 40 안) */
const BOSS_SPAWN_AHEAD = 22;
const QUIET = new Set<string>(['seat', 'tino', 'ride-pedal', 'boss', 'race-cp', 'fc-score', 'drive', 'hi', 'boss-hit']);
const GAME_LABEL: Record<GameKind, string> = {
  'race-bike': '🚲 자전거 레이스', 'race-boat': '🚤 배 레이스', 'race-run': '🏃 달리기 시합', contest: '🎣 낚시 대회(10분)', hide: '🙈 숨바꼭질',
};
export const gameLabel = (g: GameKind) => GAME_LABEL[g];

export class NetPlay {
  readonly view: PlayView;
  private hooked: NetLike | null = null;
  private unhook: (() => void) | null = null;
  private wasConnected = false;
  private seq = 0;
  /** 화면·창이 다시 그리도록 */
  private listeners = new Set<() => void>();

  // 친구 정보
  peerDex = new Set<string>();
  peerDay = 0;
  // 방문객 상자
  chestOn = false;
  hostDay = -1;
  private chestAsk: number | null = null;
  // 친구 섬 시세(손님)
  quote: { q: number; at: number; prices: Record<string, number>; hot: string[] } | null = null;
  private quoteAsk = -1;
  private quoteAt = -99;
  // 놀이
  invite: Invite | null = null;
  run: Run | null = null;
  // 협동 보스
  boss: BossFight | null = null;
  bossView: Extract<Msg, { t: 'boss' }> | null = null;
  private bossSentAt = -99;
  private myHits = 0;
  private hitSentAt = -99;
  private bossAnnounced = '';
  // 티노
  peerTino = { g: 0, near: false, at: -99 };
  /** 티노가 없을 때 쓰는 둘 소음(%) */
  private quietNoise = 0;
  private quietHold = 0;
  private tinoSentAt = -99;
  // 도감 교환
  dexIn: { xid: string; give: string; at: number } | null = null;
  dexOut: { xid: string; give: string; at: number } | null = null;
  // 2인 탈것
  peerDrive: { kind: string | null; seats: number } = { kind: null, seats: 1 };
  private myDrive = '';
  private driveSentAt = -99;
  /** 내가 운전 중이고 친구가 뒷자리 */
  passenger: { pedal: boolean; seat: THREE.Object3D | null; both: boolean } | null = null;
  private seatSentAt = -99;
  /** 내가 친구 뒷자리(유령 자리) */
  ride: { mount: Mountable; seat: THREE.Object3D; target: THREE.Vector3; vel: THREE.Vector3; yaw: number; at: number; pedal: boolean; kind: string; leaving: boolean } | null = null;
  private rideAsk = -99;
  // 불꽃놀이
  private fwAt = -99;
  private fwN = 0;
  // 하트 짝
  heart = false;
  private heartAt = -99;
  private heartToastAt = -999;
  // 친구 버프
  private buffAt = -99;
  // 친구 릴(fishing 협동 신호)
  reelFriend: { at: number; rarity: number } | null = null;
  private hiDirty = false;
  private hiSentAt = -99;

  constructor(readonly game: Game, readonly deps: PlayDeps = {}) {
    this.view = deps.view ?? NULL_VIEW;
    game.state.on((e) => this.onState(e as unknown as { type: string; [k: string]: unknown }));
  }

  // ───────────── 공통 ─────────────
  net(): NetLike | null { return (this.game.ext?.net as NetLike | undefined) ?? null; }
  get connected() { return !!this.net()?.connected; }
  get role() { return this.net()?.role ?? null; }
  get isHost() { return this.connected && this.role === 'host'; }
  get isGuest() { return this.connected && this.role === 'guest'; }
  peerName() { return this.net()?.peer?.name ?? '친구'; }
  econ(): EconApi | null { return (this.game.econ as EconApi | null) ?? null; }
  day(): number { return Math.round(this.game.env?.day ?? this.econ()?.day?.() ?? 0); }
  netFlags(): Record<string, unknown> { return (this.game.state.flags.net ??= {}) as Record<string, unknown>; }
  flags(): PlayFlags { return ensurePlay(this.netFlags()); }
  dexFrom(): DexFrom { return ensureDexFrom(this.netFlags()); }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  changed() { for (const fn of [...this.listeners]) { try { fn(); } catch (e) { console.error('[netplayplay]', e); } } }
  private save() { this.game.state.save(); }
  toast(t: string) { this.game.hud?.toast ? this.game.hud.toast(t) : this.game.ui.toast(t); }
  private sfx(name: string, pitch?: number) { try { this.game.audio?.sfx(name, pitch ? { pitch } : undefined); } catch { /* 소리 없음 */ } }
  private send(m: Msg): boolean { return !!this.net()?.send(APP_KIND, m); }
  private nid(p: string) { return `${p}${this.role === 'host' ? 'h' : 'g'}${++this.seq}x${this.game.frame ?? 0}`; }
  /** 친구 자세(같은 세계일 때만) */
  peerPose(): PeerPose | null {
    const p = this.net()?.peerPose();
    if (!p || p.w !== this.worldTag()) return null;
    return p;
  }
  worldTag(): string {
    if (this.game.world !== 'space') return 'earth';
    const pl = String(this.game.space?.planet ?? 'moon').toLowerCase().replace(/[^a-z0-9_:-]/g, '').slice(0, 24);
    return `space:${pl || 'moon'}`;
  }
  peerDist(): number {
    const p = this.peerPose();
    return p ? Math.hypot(p.x - this.game.player.pos.x, p.z - this.game.player.pos.z) : Infinity;
  }
  stars(n: number, why: string) { if (n > 0) this.econ()?.addStars?.(n, why); }
  coins(n: number, why: string) { if (n > 0) this.game.state.addCoins(n, why); }
  title(id: string) {
    const p = this.flags();
    if (!grantTitle(p, id)) return;
    const T = TITLES[id];
    this.save();
    this.stars(T.stars, `title:${id}`);
    this.game.hud.banner({ text: `칭호 「${T.name}」 받았어요!`, sub: `${T.desc} · 반짝별 +${T.stars}`, icon: T.icon, color: '#ffd36b', ms: 3600 });
    this.sfx('achievement', 1.1);
  }
  private win(key: string) { const p = this.flags(); p.wins[key] = (p.wins[key] ?? 0) + 1; this.save(); }

  // ───────────── 연결 붙이기 ─────────────
  private hook() {
    const n = this.net();
    if (!n || this.hooked === n || typeof n.on !== 'function') return;
    this.unhook?.();
    this.hooked = n;
    const off1 = n.on(APP_KIND, (d) => { const m = decodeMsg(d); if (m) this.receive(m); });
    const off2 = n.on('net-coop', (d) => this.onCoop(d));
    this.unhook = () => { off1(); off2(); };
  }
  /** 연결된 순간 */
  private onConnect() {
    this.wasConnected = true;
    this.peerDex.clear();
    this.sendHi();
    if (this.role === 'host') this.sendChest();
    this.myDrive = '';
    this.changed();
  }
  /** 끊긴 순간 — 하던 걸 다 접는다 */
  private onDisconnect() {
    this.wasConnected = false;
    this.chestAsk = null; // 답을 못 받고 끊겼으면 다음 연결에서 다시 열 수 있게
    this.endRun(true);
    this.invite = null;
    this.boss = null; this.bossView = null; this.view.boss(null);
    this.chestOn = false; this.view.chest(false, 0, 0, 0);
    this.quote = null; this.dexIn = null; this.dexOut = null;
    this.peerDrive = { kind: null, seats: 1 };
    this.stopPassenger(false);
    this.leaveRide(false);
    this.setHeart(false);
    this.reelFriend = null;
    this.game.hud.gauge('netplayplay-boss', { label: '', value: 0, color: '#fff', show: false });
    this.game.hud.gauge('netplayplay-tino', { label: '', value: 0, color: '#fff', show: false });
    this.game.hud.gauge('netplayplay-run', { label: '', value: 0, color: '#fff', show: false });
    this.changed();
  }
  private sendHi() {
    this.hiDirty = false;
    this.hiSentAt = this.game.time;
    this.send({ t: 'hi', dex: Object.keys(this.game.state.dex).slice(0, 2000), day: this.day() });
  }

  // ───────────── 받기 ─────────────
  receive(m: Msg) {
    const g = this.game;
    switch (m.t) {
      case 'hi': this.peerDex = new Set(m.dex); this.peerDay = m.day; break;
      // 방문객 상자
      case 'chest':
        if (this.role !== 'guest') break;
        this.chestOn = m.on; this.hostDay = m.day;
        this.showChest();
        if (m.on && guestMayOpen(this.flags().visited, this.peerName(), m.day)) this.toast(`🎈 ${this.peerName()}네 광장에 방문객 상자가 떴어요! (손님만 하루 1번)`);
        break;
      case 'chest-open': this.hostChestOpen(m.q); break;
      case 'chest-r': this.guestChestResult(m); break;
      // 시장
      case 'quote': this.hostQuote(m.q, m.ids); break;
      case 'quote-r':
        // 늦게 온 옛 대답도 지금 것보다 새것이면 받는다
        if (m.q > this.quoteAsk || (this.quote && m.q <= this.quote.q)) break;
        this.quoteAt = -99;
        this.quote = { q: m.q, at: g.time, prices: m.prices, hot: m.hot };
        break;
      case 'sold':
        if (this.role === 'host') this.toast(`🦆 ${this.peerName()}가 우리 섬 꽥사장에게 ${this.name(m.id)} ×${m.n}을(를) 팔았어요 (+${m.coins.toLocaleString()}코인)`);
        break;
      // 초대
      case 'inv':
        if (this.run || this.invite) { this.send({ t: 'inv-r', id: m.id, ok: false }); break; }
        this.invite = { id: m.id, g: m.g, at: g.time, from: 'peer' };
        this.toast(`💌 ${this.peerName()}가 ${GAME_LABEL[m.g]} 하재요! (Y 같이 놀기 창)`);
        this.sfx('ui-open', 1.2);
        break;
      case 'inv-r': {
        const iv = this.invite;
        if (!iv || iv.id !== m.id || iv.from !== 'me') break;
        this.invite = null;
        if (m.ok) this.startRun(iv.g, iv.id, true);
        else this.toast(`${this.peerName()}가 지금은 어렵대요 😢`);
        break;
      }
      case 'quit':
        if (this.invite?.id === m.id) { this.invite = null; this.toast('초대를 거뒀대요'); }
        if (this.run?.id === m.id) { this.toast(`${this.peerName()}가 그만뒀어요`); this.endRun(true); }
        break;
      case 'race-ready': if (this.run?.kind === 'race' && this.run.id === m.id) this.run.peerReady = true; break;
      case 'race-go': if (this.run?.kind === 'race' && this.run.id === m.id && this.run.phase === 'gather') this.countdown(this.run); break;
      case 'race-cp': if (this.run?.kind === 'race' && this.run.id === m.id) this.run.peerPassed = Math.max(this.run.peerPassed, m.i); break;
      case 'race-fin': if (this.run?.kind === 'race' && this.run.id === m.id) { this.run.peerMs = m.ms; if (this.run.myMs === null) this.toast(`🏁 ${this.peerName()}가 먼저 들어왔어요! ${fmtMs(m.ms)}`); } break;
      case 'fc-score': if (this.run?.kind === 'contest' && this.run.id === m.id) this.run.peer = { total: m.total, n: m.n, best: m.best }; break;
      case 'hs-found': if (this.run?.kind === 'hide' && this.run.id === m.id && this.run.phase === 'seek') this.hideEnd(this.run, 'seeker'); break;
      case 'hs-end': if (this.run?.kind === 'hide' && this.run.id === m.id && this.run.phase !== 'done') this.hideEnd(this.run, m.win); break;
      // 티노
      case 'tino': this.peerTino = { g: m.g, near: m.near, at: g.time }; break;
      // 협동 보스
      case 'boss-ask': this.hostBossAsk(m.kind); break;
      case 'boss-no': this.toast(m.why); break;
      case 'boss': this.onBossSnap(m); break;
      case 'boss-hit': {
        // 친구 연타도 보스 곁(BOSS_REACH)에서 친 것만 센다 — 멀리서 보낸 건 무시
        const b = this.boss, pp = this.peerPose();
        if (b && b.id === m.id && pp && Math.hypot(pp.x - b.x, pp.z - b.z) <= BOSS_REACH) b.hit('peer', m.n, g.time);
        break;
      }
      // 도감 교환
      case 'dex-offer': {
        if (this.dexIn || this.dexLeft() <= 0) { this.send({ t: 'dex-no', xid: m.xid }); break; } // 받는 쪽도 하루 3번
        if (g.state.dex[m.give]) { this.send({ t: 'dex-no', xid: m.xid }); break; } // 이미 있는 종
        if (!g.state.species.get(m.give)) { this.send({ t: 'dex-no', xid: m.xid }); break; }
        this.dexIn = { xid: m.xid, give: m.give, at: g.time };
        this.toast(`📒 ${this.peerName()}가 도감 교환하재요: ${this.name(m.give)} (Y → 도감 교환)`);
        this.sfx('ui-open', 1.25);
        break;
      }
      case 'dex-accept': {
        const o = this.dexOut;
        if (!o || o.xid !== m.xid) break;
        this.dexOut = null;
        this.peerDex.add(o.give);
        if (m.give && !this.game.state.dex[m.give]) this.receiveDex(m.give);
        this.dexDone();
        this.toast(m.give ? `📒 교환 완료! ${this.name(o.give)} ↔ ${this.name(m.give)}` : `📒 ${this.peerName()}에게 ${this.name(o.give)}를 보여 줬어요!`);
        break;
      }
      case 'dex-no': if (this.dexOut?.xid === m.xid) { this.dexOut = null; this.toast('도감 교환은 다음에 하재요'); } else if (this.dexIn?.xid === m.xid) this.dexIn = null; break;
      // 불꽃놀이 · ★5
      case 'fw': this.view.firework(m.x, m.y, m.z, m.seed); this.sfx('rocket-launch', 1.8); break;
      case 'star5': {
        const sp = g.state.species.get(m.id);
        const nm = sp?.name ?? m.id;
        g.hud.banner({ text: `${this.peerName()}가 ★5 ${nm}${m.variant === 'shiny' ? '(반짝이!)' : m.variant === 'crown' ? '(왕관!)' : ''}를 잡았어요!`, sub: m.size ? `${Math.round(m.size)}cm · 축하해 줘요 👏` : '축하해 줘요 👏', icon: '🌟', color: '#ffd36b', ms: 3600 });
        this.sfx('clap');
        break;
      }
      // 2인 탈것
      case 'drive': this.peerDrive = { kind: m.kind, seats: m.seats }; if (!m.kind && this.ride) this.leaveRide(false); break;
      case 'ride-ask': this.driverAsk(); break;
      case 'ride-ok': this.boardRide(m.kind); break;
      case 'ride-no': this.toast(m.why); break;
      case 'seat': if (this.ride) { const r = this.ride; const dtS = Math.max(0.05, g.time - r.at); r.vel.set(m.x - r.target.x, m.y - r.target.y, m.z - r.target.z).divideScalar(dtS); if (r.vel.length() > 80) r.vel.set(0, 0, 0); r.target.set(m.x, m.y, m.z); r.yaw = m.yaw; r.at = g.time; } break;
      case 'ride-pedal': if (this.passenger) this.passenger.pedal = m.on; break;
      case 'ride-off': this.stopPassenger(false); this.leaveRide(false); break;
      case 'launch': this.toast(`🚀 ${this.peerName()}가 로켓을 쐈어요! 같이 가요!`); break;
    }
    // 자주 오는 쪽지(자리·게이지·스냅숏)는 창을 다시 그리지 않는다
    if (!QUIET.has(m.t)) this.changed();
  }

  // ───────────── state 이벤트(내 쪽) ─────────────
  private onState(e: { type: string; [k: string]: unknown }) {
    if (!this.connected) return;
    switch (e.type) {
      case 'catch': {
        const sp = e.species as Species | undefined;
        const rarity = Number(e.rarity ?? sp?.rarity ?? 0);
        if (sp && rarity >= 5) this.send({ t: 'star5', id: sp.id, size: Number(e.size) || 0, variant: typeof e.variant === 'string' ? e.variant : null });
        const r = this.run;
        if (r?.kind === 'contest' && r.phase === 'on' && (e.activity === 'fish' || e.activity === 'moonfish') && sp) {
          const cm = catchCm(e.size, sp.len);
          r.me.add(cm);
          this.send({ t: 'fc-score', id: r.id, total: r.me.total, n: r.me.n, best: r.me.best });
          this.toast(`🎣 대회 기록 +${Math.round(cm)}cm → 합계 ${Math.round(r.me.total)}cm`);
        }
        break;
      }
      case 'collect': if (e.isNew) this.hiDirty = true; break;
      case 'launch': {
        const p = this.flags();
        if (!p.launched) { p.launched = true; this.save(); this.title('space-buddy'); }
        this.send({ t: 'launch' });
        break;
      }
    }
  }
  /** fishing 협동 릴 신호(net-coop {kind:'reel'}) — 친구가 큰 물고기와 싸우면 알려 준다 */
  private onCoop(d: unknown) {
    const m = d as { kind?: string; data?: { phase?: string; rarity?: number } } | null;
    if (!m || m.kind !== 'reel' || !m.data) return;
    const ph = m.data.phase;
    if (ph === 'start') {
      this.reelFriend = { at: this.game.time, rarity: Number(m.data.rarity) || 4 };
      const d2 = this.peerDist();
      this.toast(d2 <= 40 ? `💞 ${this.peerName()}가 ★${this.reelFriend.rarity} 큰 물고기랑 줄다리기 중! 곁에서 E 연타로 같이 감아요` : `💞 ${this.peerName()}가 큰 물고기랑 씨름 중! (Y → 친구 곁으로)`);
      this.sfx('bite', 1.2);
    } else if (ph === 'end') this.reelFriend = null;
    else if (this.reelFriend) this.reelFriend.at = this.game.time;
    this.changed();
  }

  // ───────────── 매 프레임 ─────────────
  update(t: number, dt: number) {
    this.hook();
    const n = this.net();
    const con = !!n?.connected;
    if (con && !this.wasConnected) this.onConnect();
    else if (!con && this.wasConnected) this.onDisconnect();
    if (con) {
      // 손님 표시 + 친구 버프(둘 다 ★3+ ×1.1 — economy 가 rollCatch 에 싣는다)
      if (n!.role === 'guest' && !n!.visiting) n!.visiting = true;
      if (t - this.buffAt >= 1) { this.buffAt = t; this.friendBuffTick(); }
      if (this.hiDirty && t - this.hiSentAt > 3) this.sendHi();
      if (this.isHost) this.hostChestTick();
      this.inviteTick(t);
      this.runTick(t, dt);
      this.bossTick(t, dt);
      this.tinoTick(t, dt);
      this.heartTick(t);
      this.driveTick(t);
      if (this.reelFriend && t - this.reelFriend.at > 45) this.reelFriend = null;
    }
    this.avatarTick();
    this.view.update(t, dt);
  }

  /**
   * 친구 버프 잇기 — 남은 시간이 3 게임분 아래일 때만 10분으로 다시 건다(매번 걸면 economy 가 저장·'buff' 를 쏟아낸다).
   * 끊기면 더 안 잇는다: 남은 건 길어야 10 게임분(≈12초) 뒤 저절로 꺼진다.
   */
  private friendBuffTick() {
    const E = this.econ();
    // 시계(env)가 붙기 전엔 economy 가 버프를 쌓아 두기만 한다 → 붙은 뒤에만 건다
    if (!E?.addBuff || !this.game.env) return;
    try {
      const now = this.game.env.gameSec ?? 0;
      const cur = E.buffs?.().find((b) => b.name === 'friend');
      if (cur && cur.until - now > FRIEND_BUFF_REFRESH) return;
      E.addBuff('friend', FRIEND_BUFF_MIN);
    } catch { /* 경제 없음 */ }
  }

  // ───────────── 방문객 상자 ─────────────
  chestPos() { const { x, z } = VISITOR_CHEST; return { x, y: this.game.groundAt ? this.game.groundAt(x, z) : Island.heightAt(x, z), z }; }
  private showChest() {
    const p = this.chestPos();
    this.view.chest(this.chestOn && this.game.world === 'earth', p.x, p.y, p.z);
  }
  private sendChest() {
    this.chestOn = chestReady(this.flags().chest, this.day());
    this.hostDay = this.day();
    this.send({ t: 'chest', on: this.chestOn, day: this.hostDay });
    this.showChest();
  }
  private hostChestTick() {
    // 날이 바뀌면 다시 띄운다
    const on = chestReady(this.flags().chest, this.day());
    if (on !== this.chestOn || this.hostDay !== this.day()) this.sendChest();
  }
  /** 손님: 열어 주세요 */
  openVisitorChest(): boolean {
    if (!this.isGuest) { this.toast('🎈 방문객 상자는 친구 섬에 놀러 간 손님만 열 수 있어요'); return false; }
    if (!this.chestOn) { this.toast('오늘 방문객 상자는 벌써 열었어요. 내일 또 놀러 와요!'); return false; }
    if (!guestMayOpen(this.flags().visited, this.peerName(), this.hostDay)) { this.toast('이 섬 방문객 상자는 오늘 이미 열었어요 🎈'); return false; }
    if (this.chestAsk !== null) return false;
    this.chestAsk = ++this.seq;
    this.send({ t: 'chest-open', q: this.chestAsk });
    this.game.player.act('pick', 0.6);
    return true;
  }
  private hostChestOpen(q: number) {
    if (!this.isHost) return;
    const pp = this.net()?.peerPose();
    const c = this.chestPos();
    const near = !pp || pp.w !== 'earth' ? false : Math.hypot(pp.x - c.x, pp.z - c.z) <= CHEST_REACH + 2.5;
    if (!near) { this.send({ t: 'chest-r', q, ok: false, why: '상자 바로 앞에서 열어 줘요!' }); return; }
    const ok = claimVisitorChest(this.flags().chest, this.day(), this.peerName());
    if (ok) this.save();
    this.send({ t: 'chest-r', q, ok, ...(ok ? {} : { why: '오늘 방문객 상자는 벌써 열었어요' }) });
    if (ok) {
      this.toast(`🎈 ${this.peerName()}가 방문객 상자를 열었어요!`);
      this.view.chestPop();
      this.sendChest();
    }
  }
  private guestChestResult(m: Extract<Msg, { t: 'chest-r' }>) {
    if (this.chestAsk !== m.q) return;
    this.chestAsk = null;
    if (!m.ok) { this.toast(m.why ?? '상자가 안 열려요'); return; }
    const f = this.flags();
    f.visited[this.peerName()] = this.hostDay;
    this.save();
    this.chestOn = false;
    this.view.chestPop();
    this.showChest();
    this.sfx('balloon-pop', 1.1);
    try { this.econ()?.openChest('wood', 'visitor'); } catch (e) { console.error('[netplayplay chest]', e); }
  }

  // ───────────── 친구 섬 시세 ─────────────
  /** 손님: 가방 속 팔 것들 → 방장 시세 묻기 */
  askQuote(force = false): boolean {
    if (!this.isGuest) return false;
    if (!force && this.quote && this.game.time - this.quote.at < QUOTE_TTL) return false;
    // 대답 기다리는 중이면 다시 묻지 않는다(창이 자주 다시 그려져도)
    if (!force && this.game.time - this.quoteAt < 3) return false;
    this.quoteAt = this.game.time;
    const E = this.econ();
    const ids = Object.keys(this.game.state.bag).filter((k) => (this.game.state.bag[k] ?? 0) > 0 && (E ? E.priceOf(k) > 0 : true)).slice(0, 120);
    this.quoteAsk = ++this.seq;
    return this.send({ t: 'quote', q: this.quoteAsk, ids });
  }
  private hostQuote(q: number, ids: string[]) {
    if (!this.isHost) return;
    const E = this.econ();
    const prices: Record<string, number> = {};
    // 방장 priceOf 에는 방장이 오늘 판 수의 포화가 들어 있다 → 덜어 내고 '포화 전 한 개 값'을 보낸다(포화는 손님 몫)
    if (E) for (const id of ids) { try { const p = E.priceOf(id, { where: 'friend' }); if (p > 0) prices[id] = Math.round(p / saturationMult(this.soldToday(id))); } catch { /* 못 파는 것 */ } }
    const fm = (E as unknown as { friendMarket?: () => { hot?: string[] } } | null)?.friendMarket?.();
    this.send({ t: 'quote-r', q, prices, hot: Array.isArray(fm?.hot) ? fm!.hot!.slice(0, 8) : [] });
  }
  marketRows(): MarketRow[] {
    if (!this.quote) return [];
    // 창에는 '다음 한 개' 값(내 판매 포화까지)을 보여 준다
    return marketRows(this.game.state.bag, this.quote.prices, this.quote.hot).map((r) => ({ ...r, unit: friendSale(r.unit, 1, this.soldToday(r.id)) }));
  }
  /** economy 판매 포화 칸(flags.econ.sold — 종 id 기준, 변이 꼬리 없이) */
  private econSold(): Record<string, number> | null {
    const f = this.game.state.flags.econ as { sold?: Record<string, number> } | undefined;
    return f && typeof f === 'object' && f.sold && typeof f.sold === 'object' ? f.sold : null;
  }
  /** 오늘 이 종을 판 수(집 꽥사장·친구 섬 합쳐서) */
  soldToday(id: string): number {
    const n = this.econSold()?.[id.split('@')[0]];
    return typeof n === 'number' && n > 0 ? n : 0;
  }
  /** 친구 섬에서 판 것도 내 판매 포화에 센다 — economy 훅(recordSold)이 있으면 그걸로 */
  private recordSold(id: string, n: number) {
    const E = this.econ() as (EconApi & { recordSold?: (id: string, n: number) => void }) | null;
    if (E?.recordSold) { try { E.recordSold(id, n); return; } catch { /* 아래로 */ } }
    const sold = this.econSold();
    if (!sold) return;
    const k = id.split('@')[0];
    sold[k] = (sold[k] ?? 0) + n;
  }
  /** 친구 섬 꽥사장 근처인가 */
  nearShop(): boolean { const s = Island.PLACES.shop; return this.game.world === 'earth' && Math.hypot(this.game.player.pos.x - s.x, this.game.player.pos.z - s.z) <= 9; }
  /** 손님: 방장 시세로 팔기 → 받은 코인 */
  sellFriend(id: string, n: number): number {
    if (!this.isGuest || !this.quote) { this.toast('친구 섬 시세를 먼저 받아야 해요'); return 0; }
    const unit = this.quote.prices[id] ?? 0;
    n = Math.min(Math.floor(n), this.game.state.bag[id] ?? 0);
    if (!(unit > 0) || n <= 0) return 0;
    const E = this.econ();
    // 판매 포화(GDD 4.4)는 손님 쪽 오늘 판 수로 — 날 바뀜 정리는 economy 가 priceOf 안에서 한다
    try { E?.priceOf(id); } catch { /* 없음 */ }
    const total = friendSale(unit, n, this.soldToday(id));
    const ok = E ? E.spend({ items: { [id]: n } }, 'sell-friend') : ((this.game.state.addItem(id, -n)), true);
    if (!ok) return 0;
    this.recordSold(id, n);
    this.game.state.addCoins(total, 'sell');
    this.game.state.emit({ type: 'sell', id, n, coins: total, shop: 'friend' } as never);
    this.send({ t: 'sold', id, n, coins: total });
    this.sfx('sell', 1.1);
    this.toast(`🦆 ${this.peerName()}네 꽥사장: ${this.name(id)} ×${n} → ${total.toLocaleString()}코인!`);
    this.changed();
    return total;
  }

  // ───────────── 초대 · 놀이 ─────────────
  /** 초대 보내기 */
  inviteTo(g: GameKind): boolean {
    if (!this.connected) { this.toast('친구랑 연결되면 같이 놀 수 있어요'); return false; }
    if (this.run) { this.toast('지금 하는 놀이부터 끝내요!'); return false; }
    if (this.invite) { this.toast('대답을 기다리는 중이에요'); return false; }
    if (g.startsWith('race-') && this.game.world !== 'earth') { this.toast('레이스는 지구에서만 해요 🌏'); return false; }
    const id = this.nid('i');
    this.invite = { id, g, at: this.game.time, from: 'me' };
    this.send({ t: 'inv', g, id });
    this.toast(`💌 ${this.peerName()}에게 ${GAME_LABEL[g]} 초대를 보냈어요`);
    this.changed();
    return true;
  }
  /** 받은 초대에 대답 */
  answer(ok: boolean) {
    const iv = this.invite;
    if (!iv || iv.from !== 'peer') return;
    this.invite = null;
    this.send({ t: 'inv-r', id: iv.id, ok });
    if (ok) this.startRun(iv.g, iv.id, false);
    this.changed();
  }
  cancelInvite() {
    const iv = this.invite;
    if (!iv) return;
    this.invite = null;
    this.send(iv.from === 'me' ? { t: 'quit', id: iv.id } : { t: 'inv-r', id: iv.id, ok: false });
    this.changed();
  }
  private inviteTick(t: number) {
    if (this.invite && t - this.invite.at > 40) {
      if (this.invite.from === 'me') this.toast('초대 대답이 없어요. 다음에 또 해요!');
      this.invite = null;
      this.changed();
    }
  }
  private startRun(g: GameKind, id: string, leader: boolean) {
    const t = this.game.time;
    if (g.startsWith('race-')) {
      const race = g.slice(5) as RaceKind;
      this.run = { kind: 'race', id, race, track: new RaceTrack(COURSES[race]), leader, phase: 'gather', meReady: false, peerReady: false, t0: t, goAt: 0, myMs: null, peerMs: null, peerPassed: 0, doneAt: 0, hinted: -99 };
      this.view.course(COURSES[race], 0);
      this.game.hud.banner({ text: `${RACE_NAMES[race]}!`, sub: `${COURSES[race].name} — ${this.needText(race)} 출발선(🏁)으로 모여요`, icon: race === 'boat' ? '🚤' : race === 'bike' ? '🚲' : '🏃', color: '#7cc8f0', ms: 3600 });
    } else if (g === 'contest') {
      this.run = { kind: 'contest', id, endAt: t + CONTEST_SEC, me: new FishContest(), peer: { total: 0, n: 0, best: 0 }, phase: 'on', doneAt: 0 };
      this.game.hud.banner({ text: '낚시 대회 시작!', sub: '10분 동안 잡은 물고기 길이(cm)를 모두 더해요 🎣', icon: '🎣', color: '#8fdc9a', ms: 3400 });
    } else {
      const role = leader ? 'seeker' : 'hider';
      this.run = { kind: 'hide', id, role, phase: 'hide', t0: t, doneAt: 0 };
      if (role === 'seeker') this.game.player.lock(LOCK);
      this.game.hud.banner({ text: role === 'seeker' ? '내가 술래! 눈 가리고 30초…' : '숨어요! 30초 안에 꼭꼭 숨기', sub: role === 'seeker' ? `${this.peerName()}가 숨는 동안 기다려요 🙈` : '술래가 다가오면 들킬지도… 🤫', icon: '🙈', color: '#a99cf0', ms: 3400 });
    }
    this.sfx('mission', 1.1);
    this.changed();
  }
  /** 그만하기 */
  quitRun() {
    const r = this.run;
    if (!r) return;
    this.send({ t: 'quit', id: r.id });
    this.endRun(true);
    this.toast('놀이를 그만뒀어요');
  }
  private endRun(silent: boolean) {
    const r = this.run;
    if (!r) return;
    this.run = null;
    this.game.player.unlock(LOCK, true);
    if (r.kind === 'race') this.view.course(null, 0);
    this.game.hud.gauge('netplayplay-run', { label: '', value: 0, color: '#fff', show: false });
    if (!silent) this.sfx('ui-close');
    this.changed();
  }
  private runTick(t: number, dt: number) {
    const r = this.run;
    if (!r) return;
    if (r.kind === 'race') this.raceTick(r, t);
    else if (r.kind === 'contest') this.contestTick(r, t);
    else this.hideTick(r, t);
    void dt;
  }

  // ── 레이스
  needText(k: RaceKind) { return k === 'bike' ? '자전거를 타고' : k === 'boat' ? '배를 타고' : '두 발로'; }
  /** 이 레이스에 맞는 탈것인가 */
  rightRide(k: RaceKind): boolean {
    const v = this.game.vehicles?.current?.() ?? null;
    if (this.ride) return false; // 뒷자리 손님은 못 달린다
    if (k === 'bike') return v?.kind === 'bike';
    if (k === 'boat') return !!v?.boat;
    return !v;
  }
  private raceTick(r: RaceRun, t: number) {
    const p = this.game.player.pos;
    const cps = r.track.course.cps;
    if (r.phase === 'gather') {
      const atStart = Math.hypot(p.x - cps[0].x, p.z - cps[0].z) <= START_R;
      if (atStart && this.rightRide(r.race) && !r.meReady) { r.meReady = true; this.send({ t: 'race-ready', id: r.id }); this.toast('출발선 준비 완료! 친구를 기다려요'); this.changed(); }
      if (atStart && !this.rightRide(r.race) && t - r.hinted > 6) { r.hinted = t; this.toast(`${this.needText(r.race)} 와야 해요!${r.race !== 'run' ? ' (F 부르기)' : ''}`); }
      if (r.leader && r.meReady && r.peerReady) { this.send({ t: 'race-go', id: r.id }); this.countdown(r); }
      if (t - r.t0 > 180) { this.toast('출발선에 못 모였어요. 레이스는 다음에!'); this.send({ t: 'quit', id: r.id }); this.endRun(false); return; }
      this.raceGauge(r, t);
      return;
    }
    if (r.phase === 'count') {
      const left = r.goAt - t;
      if (left <= 0) {
        r.phase = 'go';
        this.game.player.unlock(LOCK, true);
        this.game.hud.banner({ text: '출발!', icon: '🏁', color: '#ff9fb8', ms: 1200 });
        this.sfx('bike-bell', 1.2);
      }
      this.raceGauge(r, t);
      return;
    }
    if (r.phase === 'go') {
      const el = t - r.goAt;
      if (this.rightRide(r.race)) {
        const ev = r.track.pass(p.x, p.z, el);
        if (ev === 'cp') { this.send({ t: 'race-cp', id: r.id, i: r.track.passed }); this.view.course(r.track.course, r.track.next); this.sfx('coin', 1 + r.track.passed * 0.05); }
        else if (ev === 'finish') {
          r.myMs = Math.round(el * 1000);
          this.send({ t: 'race-fin', id: r.id, ms: r.myMs });
          this.toast(`🏁 골인! ${fmtMs(r.myMs)}`);
          this.sfx('mission');
          this.view.course(null, 0);
        }
      } else if (t - r.hinted > 5) { r.hinted = t; this.toast(`${this.needText(r.race)} 달려야 체크포인트가 켜져요!`); }
      const both = r.myMs !== null && r.peerMs !== null;
      if (both || el > RACE_LIMIT || (r.myMs !== null && el > (r.myMs / 1000) + 60) || (r.peerMs !== null && el > (r.peerMs / 1000) + 60)) this.raceResult(r);
      this.raceGauge(r, t);
      return;
    }
    if (r.phase === 'done' && t - r.doneAt > 4) this.endRun(true);
  }
  private countdown(r: RaceRun) {
    r.phase = 'count';
    r.goAt = this.game.time + COUNTDOWN;
    this.game.player.lock(LOCK);
    this.game.hud.banner({ text: '3… 2… 1…', sub: RACE_NAMES[r.race], icon: '⏱️', color: '#ffd36b', ms: COUNTDOWN * 1000 });
    this.sfx('rocket-countdown', 1.3);
    this.changed();
  }
  private raceGauge(r: RaceRun, t: number) {
    const total = r.track.total;
    const label = r.phase === 'gather'
      ? `${RACE_NAMES[r.race]} · 출발선 ${r.meReady ? '✅' : '…'} 나 / ${r.peerReady ? '✅' : '…'} ${this.peerName()}`
      : r.phase === 'count' ? `${Math.ceil(r.goAt - t)}…`
        : `🏁 ${r.track.passed}/${total} · ${this.peerName()} ${Math.min(r.peerPassed, total)}/${total} · ${fmtMs((t - r.goAt) * 1000)}`;
    this.game.hud.gauge('netplayplay-run', { label, value: r.phase === 'go' ? r.track.passed / total : r.phase === 'count' ? 1 - (r.goAt - t) / COUNTDOWN : 0, color: '#7cc8f0', show: true });
  }
  private raceResult(r: RaceRun) {
    r.phase = 'done';
    r.doneAt = this.game.time;
    this.view.course(null, 0);
    const w = raceWinner(r.myMs, r.peerMs);
    const me = r.myMs !== null ? fmtMs(r.myMs) : '못 들어옴', pe = r.peerMs !== null ? fmtMs(r.peerMs) : '못 들어옴';
    const day = this.day();
    const paid = takeDaily(this.flags(), `race-${r.race}`, day);
    if (w === 'me') {
      this.win('race');
      if (paid) { this.coins(800, 'net-race'); this.stars(1, 'net-race'); }
      this.game.hud.banner({ text: '이겼다! 🏆', sub: `나 ${me} · ${this.peerName()} ${pe}${paid ? ' · 800코인 + 반짝별 1' : ''}`, icon: '🏁', color: '#ffd36b', ms: 4000 });
      this.title('race-star');
      this.sfx('achievement');
    } else {
      if (paid && r.myMs !== null) this.coins(300, 'net-race');
      this.game.hud.banner({ text: w === 'tie' ? '동시 골인! 🤝' : w === 'none' ? '둘 다 못 들어왔어요' : `${this.peerName()} 승리!`, sub: `나 ${me} · ${this.peerName()} ${pe}${paid && r.myMs !== null ? ' · 완주 300코인' : ''}`, icon: '🏁', color: '#7cc8f0', ms: 4000 });
      this.sfx('clap');
    }
    this.save();
    this.changed();
  }

  // ── 낚시 대회
  private contestTick(r: ContestRun, t: number) {
    if (r.phase === 'on') {
      const left = r.endAt - t;
      const mm = Math.max(0, Math.floor(left / 60)), ss = Math.max(0, Math.floor(left % 60));
      this.game.hud.gauge('netplayplay-run', { label: `🎣 ${mm}:${String(ss).padStart(2, '0')} · 나 ${Math.round(r.me.total)}cm / ${this.peerName()} ${Math.round(r.peer.total)}cm`, value: Math.max(0, left / CONTEST_SEC), color: '#8fdc9a', show: true });
      if (left <= 0) { r.phase = 'wait'; r.doneAt = t; this.send({ t: 'fc-score', id: r.id, total: r.me.total, n: r.me.n, best: r.me.best }); this.toast('삐익! 대회 끝 — 결과를 모으는 중…'); }
      return;
    }
    if (r.phase === 'wait' && t - r.doneAt > 3) {
      r.phase = 'done'; r.doneAt = t;
      const w = contestWinner(r.me.total, r.peer.total);
      const paid = takeDaily(this.flags(), 'contest', this.day(), 2);
      const sub = `나 ${Math.round(r.me.total)}cm(${r.me.n}마리) · ${this.peerName()} ${Math.round(r.peer.total)}cm(${r.peer.n}마리)`;
      if (w === 'me') {
        this.win('contest');
        this.game.hud.banner({ text: '낚시 대회 우승! 🏆', sub, icon: '🎣', color: '#ffd36b', ms: 4200 });
        this.title('angler-king');
        if (paid) try { this.econ()?.openChest('silver', 'contest'); } catch { /* 경제 없음 */ }
        this.sfx('achievement');
      } else {
        this.game.hud.banner({ text: w === 'tie' ? '무승부! 사이좋게 🤝' : `${this.peerName()} 우승!`, sub, icon: '🎣', color: '#8fdc9a', ms: 4200 });
        if (paid && r.me.n > 0) try { this.econ()?.openChest('wood', 'contest'); } catch { /* 경제 없음 */ }
        this.sfx('clap');
      }
      this.save();
      this.changed();
      return;
    }
    if (r.phase === 'done' && t - r.doneAt > 3) this.endRun(true);
  }

  // ── 숨바꼭질
  private hideTick(r: HideRun, t: number) {
    const el = t - r.t0;
    if (r.phase === 'hide') {
      const left = HIDE_SEC - el;
      this.game.hud.gauge('netplayplay-run', { label: r.role === 'seeker' ? `🙈 눈 가리는 중… ${Math.ceil(left)}` : `🤫 숨을 시간 ${Math.ceil(left)}초`, value: Math.max(0, left / HIDE_SEC), color: '#a99cf0', show: true });
      if (left <= 0) {
        r.phase = 'seek';
        this.game.player.unlock(LOCK, true);
        this.game.hud.banner({ text: r.role === 'seeker' ? '찾으러 간다!' : '술래가 찾으러 와요!', sub: r.role === 'seeker' ? `${Math.round(SEEK_SEC / 60 * 10) / 10}분 안에 ${this.peerName()}를 찾아 E!` : '들키지 않게 숨죽여요', icon: '👀', color: '#a99cf0', ms: 2600 });
      }
      return;
    }
    if (r.phase === 'seek') {
      const left = HIDE_SEC + SEEK_SEC - el;
      const d = this.peerDist();
      const w = warmth(d);
      this.game.hud.gauge('netplayplay-run', { label: r.role === 'seeker' ? `👀 ${w.text} · ${Math.ceil(left)}초` : `🤫 숨는 중 · ${Math.ceil(left)}초`, value: r.role === 'seeker' ? w.v : Math.max(0, left / SEEK_SEC), color: '#a99cf0', show: true });
      if (r.role === 'seeker' && left <= 0) { this.send({ t: 'hs-end', id: r.id, win: 'hider' }); this.hideEnd(r, 'hider'); }
      return;
    }
    if (r.phase === 'done' && t - r.doneAt > 3) this.endRun(true);
  }
  /** 술래: 찾았다! */
  found(): boolean {
    const r = this.run;
    if (r?.kind !== 'hide' || r.role !== 'seeker' || r.phase !== 'seek') return false;
    if (this.peerDist() > FIND_R) { this.toast('아직 멀어요!'); return false; }
    this.send({ t: 'hs-found', id: r.id });
    this.hideEnd(r, 'seeker');
    return true;
  }
  private hideEnd(r: HideRun, win: 'hider' | 'seeker') {
    r.phase = 'done';
    r.doneAt = this.game.time;
    this.game.player.unlock(LOCK, true);
    const iWon = win === r.role;
    const paid = takeDaily(this.flags(), 'hide', this.day());
    if (iWon) {
      this.win('hide');
      if (paid) this.coins(500, 'net-hide');
      this.title('hide-master');
    }
    this.game.hud.banner({
      text: win === 'seeker' ? (r.role === 'seeker' ? '찾았다! 🎉' : '들켰다! 😆') : (r.role === 'hider' ? '끝까지 안 들켰어요! 🎉' : '못 찾았어요… 😵'),
      sub: iWon && paid ? '숨바꼭질 승리 · 500코인' : '한 판 더 할까요?', icon: '🙈', color: '#a99cf0', ms: 3200,
    });
    this.sfx(iWon ? 'achievement' : 'clap');
    this.save();
    this.changed();
  }

  // ───────────── 협동 보스 ─────────────
  /** 지금 자리에서 그 보스를 부를 수 있나(내 쪽 판정) */
  bossHere(kind: BossKind, at?: { x: number; z: number }, world?: string): { ok: boolean; why: string } {
    const p = at ?? this.game.player.pos;
    const sea = this.seaAt(p.x, p.z);
    return bossPlaceOk(kind, { world: world ?? this.game.world, sea, tod: this.game.env?.tod ?? 'day', weather: this.game.env?.weather ?? 'clear' });
  }
  private seaAt(x: number, z: number): string | null {
    try { const zi = this.game.geo?.zoneAt?.(x, z); if (zi && 'sea' in zi) return (zi.sea as string | null) ?? null; } catch { /* 아래로 */ }
    return Island.seaZoneAt(x, z);
  }
  /** 보스 부르기(창 버튼) */
  callBoss(kind: BossKind): boolean {
    if (!this.connected) { this.toast('협동 보스는 둘 이상이어야 나와요! 친구를 불러요 👫'); return false; }
    if (this.boss || this.bossView?.st === 'on') { this.toast('이미 보스와 싸우는 중!'); return false; }
    const here = this.bossHere(kind);
    if (!here.ok) { this.toast(here.why); return false; }
    if (this.isHost) return this.hostBossAsk(kind, true);
    this.send({ t: 'boss-ask', kind });
    this.toast(`${BOSSES[kind].icon} ${this.peerName()}에게 같이 부르자고 했어요…`);
    return true;
  }
  private hostBossAsk(kind: BossKind, mine = false): boolean {
    if (!this.isHost) return false;
    const no = (why: string) => { if (mine) this.toast(why); else this.send({ t: 'boss-no', kind, why }); return false; };
    if (this.boss && this.boss.st === 'on') return no('이미 보스와 싸우는 중!');
    const pp = this.peerPose();
    if (!pp) return no(kind === 'whale' ? '둘 다 우주에 있어야 해요 🚀' : '둘이 같은 세계에 있어야 해요');
    const me = this.game.player.pos;
    if (Math.hypot(pp.x - me.x, pp.z - me.z) > BOSS_PAIR_R) return no('둘이 더 가까이 모여야 해요 (60m 안)');
    const a = this.bossHere(kind), b = this.bossHere(kind, pp);
    if (!a.ok) return no(a.why);
    if (!b.ok) return no(b.why);
    const day = this.day();
    if (this.flags().boss[kind] === day) return no(`${BOSSES[kind].name}는 오늘 이미 만났어요. 내일 또!`);
    // 둘 사이 가운데에서 둘이 같이 보는 쪽으로 22m — 카메라는 각자 등 뒤라 둘 다 앞에 보스가 보인다
    const mx = (pp.x + me.x) / 2, mz = (pp.z + me.z) / 2;
    const f = this.game.player.facing?.() ?? new THREE.Vector3(0, 0, -1);
    const dir = new THREE.Vector3(f.x - Math.sin(pp.yaw), 0, f.z - Math.cos(pp.yaw));
    if (dir.lengthSq() < 0.25) {
      // 서로 마주 보면 옆으로(둘을 잇는 줄에 직각, 방장 앞쪽 편)
      const lx = pp.x - me.x, lz = pp.z - me.z;
      dir.set(-lz, 0, lx);
      if (dir.lengthSq() < 1e-6) dir.set(f.x, 0, f.z);
      else if (dir.x * f.x + dir.z * f.z < 0) dir.negate();
    }
    dir.normalize();
    const x = mx + dir.x * BOSS_SPAWN_AHEAD, z = mz + dir.z * BOSS_SPAWN_AHEAD;
    const y = kind === 'whale' ? Math.max(me.y, pp.y) + 6 : 0;
    this.boss = new BossFight(this.nid('b'), kind, x, y, z);
    this.bossSentAt = -99;
    this.bossTick(this.game.time, 0);
    return true;
  }
  private bossTick(t: number, dt: number) {
    const b = this.boss;
    if (b && this.isHost) {
      b.step(dt, t);
      if (this.myHits > 0) { b.hit('me', this.myHits, t); this.myHits = 0; }
      if (t - this.bossSentAt >= 0.2 || b.st !== 'on') {
        this.bossSentAt = t;
        const s = b.snapshot();
        this.send(s);
        this.onBossSnap(s);
      }
      if (b.st !== 'on') this.boss = null;
    } else if (!this.isHost && this.myHits > 0 && this.bossView?.st === 'on' && t - this.hitSentAt >= 0.2) {
      this.hitSentAt = t;
      this.send({ t: 'boss-hit', id: this.bossView.id, n: Math.min(60, this.myHits) });
      this.myHits = 0;
    }
  }
  /** 스냅숏(방장은 자기 것도 여기로) */
  private onBossSnap(s: Extract<Msg, { t: 'boss' }>) {
    const prev = this.bossView;
    const D = BOSSES[s.kind];
    if (s.st === 'on') {
      if (!prev || prev.id !== s.id) {
        this.game.hud.banner({ text: `${D.name} 나타났다!`, sub: '둘이 같이 E 연타! 혼자 치면 힘을 되찾아요 💞', icon: D.icon, color: D.color, ms: 3200 });
        this.sfx('dino-roar-cute', 0.8);
      } else if (prev.hp > s.hp + 0.5) this.view.bossHit();
      this.bossView = s;
      this.view.boss({ kind: s.kind, x: s.x, y: s.y, z: s.z, hp: s.hp, max: s.max, st: s.st });
      this.game.hud.gauge('netplayplay-boss', { label: `${D.icon} ${D.name} ${Math.ceil(s.hp)}/${s.max} · ${Math.ceil(s.left)}초`, value: s.hp / s.max, color: D.color, show: true });
      return;
    }
    // 끝
    this.bossView = null;
    this.view.boss({ kind: s.kind, x: s.x, y: s.y, z: s.z, hp: s.hp, max: s.max, st: s.st });
    this.game.hud.gauge('netplayplay-boss', { label: '', value: 0, color: D.color, show: false });
    if (this.bossAnnounced === s.id) return;
    this.bossAnnounced = s.id;
    if (s.st === 'won') this.bossWon(s.kind);
    else { this.toast(`아깝다! ${D.name}가 도망갔어요… 다음엔 더 빨리 같이 쳐요!`); this.sfx('fail-splash'); }
    this.changed();
  }
  private bossWon(kind: BossKind) {
    const D = BOSSES[kind];
    const f = this.flags();
    f.boss[kind] = this.day();
    this.win('boss');
    this.save();
    const sp = this.game.state.byGdd(D.species);
    if (sp) {
      try { this.game.ui.showCatch({ species: sp, sizeText: '협동 보스!', line: `${this.peerName()}랑 같이 잡았다! 💞`, activity: 'coop', keep: D.keep } as never); }
      catch { this.game.state.collect({ species: sp, keep: D.keep, activity: 'coop' } as never); }
    }
    try { this.econ()?.openChest('gold', 'coop-boss'); } catch { /* 경제 없음 */ }
    this.title('boss-duo');
    this.sfx('achievement', 0.9);
  }
  /** E 연타 한 번 */
  bossMash(): boolean {
    const v = this.bossView;
    if (!v || v.st !== 'on' || !this.bossNear()) return false;
    this.myHits++;
    this.game.player.act('reel', 0.35);
    return true;
  }
  /** 보스 곁인가(E 연타 자리) */
  bossNear(): boolean {
    const v = this.bossView;
    if (!v || v.st !== 'on') return false;
    const p = this.game.player.pos;
    return Math.hypot(p.x - v.x, p.z - v.z) <= BOSS_REACH;
  }

  // ───────────── 티노 둘이 살금살금 ─────────────
  private tinoTick(t: number, dt: number) {
    if (this.game.world !== 'earth') return;
    const th = this.deps.tino?.() ?? null;
    const hill = Island.PLACES.tinoHill;
    const tx = th?.x ?? hill.x, tz = th?.z ?? hill.z;
    const me = this.game.player.pos;
    const myD = Math.hypot(me.x - tx, me.z - tz);
    const pp = this.peerPose();
    const pd = pp ? Math.hypot(pp.x - tx, pp.z - tz) : Infinity;
    const near = myD < 45;
    // 친구 발소리를 내 티노에 얹는다(낮잠·뒤척일 때만)
    if (th && pp && (th.m.state === 'sleep' || th.m.state === 'stir')) {
      const rate = peerNoiseRate(pp.s, pd, pp.m);
      if (rate > 0) th.m.gauge = Math.min(100, th.m.gauge + rate * dt);
    }
    // 티노 손잡이가 없으면 둘 발소리를 여기서 센다(언덕 기준) — 꼭대기 보너스가 그냥 서 있기만으로 나오지 않게
    if (!th) {
      const pl = this.game.player;
      const rate = peerNoiseRate(pl.speed ?? 0, myD, pl.mode) + (pp ? peerNoiseRate(pp.s, pd, pp.m) : 0);
      this.quietNoise = Math.max(0, Math.min(100, this.quietNoise + (rate > 0 ? rate : -QUIET_DECAY) * dt));
    }
    const mine = th?.m.gauge ?? this.quietNoise;
    if (near && t - this.tinoSentAt > 0.5) { this.tinoSentAt = t; this.send({ t: 'tino', g: Math.round(mine), near }); }
    const peerNear = this.peerTino.near && t - this.peerTino.at < 3;
    const show = near || (peerNear && pd < 45);
    const g = sharedGauge(mine, peerNear ? this.peerTino.g : 0);
    this.game.hud.gauge('netplayplay-tino', { label: `🦖 같이 살금살금 · 소음 ${Math.round(g)}%`, value: g / 100, color: g >= 70 ? '#ff7a8a' : '#a5dba8', show: show && (!th || th.m.state === 'sleep' || th.m.state === 'stir') });
    // 둘이 꼭대기에 같이(티노가 아직 자는 중)
    // 티노가 없으면 둘이 꼭대기에서 2초 동안 조용히 버텨야 한다(뛰어 올라오면 그새 게이지가 찬다)
    const atTop = !!pp && myD <= DUO_SUMMIT_R && pd <= DUO_SUMMIT_R && (th ? th.m.state === 'sleep' || th.m.state === 'stir' : g < QUIET_MAX);
    this.quietHold = atTop && !th ? this.quietHold + dt : 0;
    if (atTop && (th || this.quietHold >= QUIET_HOLD)) {
      const f = this.flags();
      if (f.duo !== this.day()) {
        f.duo = this.day();
        this.save();
        this.stars(3, 'net-tino-duo');
        this.game.hud.banner({ text: '티노 몰래 둘이 꼭대기까지!', sub: '쉿… 반짝별 +3 (하루 한 번)', icon: '🦖', color: '#a5dba8', ms: 3600 });
        this.title('tino-ninja');
      }
    }
  }

  // ───────────── 도감 교환 ─────────────
  name(id: string) { const b = id.split('@')[0]; return this.game.state.species.get(b)?.name ?? id; }
  /** 내가 줄 수 있는 종(친구에게 없는 것) */
  dexGiftList(): Species[] {
    const st = this.game.state;
    return Object.keys(st.dex)
      .filter((id) => dexGiftable(id, st.dex, this.peerDex, (x) => st.species.get(x)?.category))
      .map((id) => st.species.get(id)!)
      .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
  }
  dexLeft(): number {
    const p = this.flags();
    const k = `dex:${this.peerName()}`;
    return p.daily.day !== this.day() ? DEX_PER_DAY : DEX_PER_DAY - (p.daily.n[k] ?? 0);
  }
  /** 도감 교환 제안 */
  offerDex(id: string): boolean {
    const st = this.game.state;
    if (!this.connected) return false;
    if (this.dexOut) { this.toast('친구 대답을 기다리는 중이에요'); return false; }
    if (this.dexLeft() <= 0) { this.toast(`오늘 ${this.peerName()}와는 도감을 ${DEX_PER_DAY}번 바꿨어요. 내일 또!`); return false; }
    if (!dexGiftable(id, st.dex, this.peerDex, (x) => st.species.get(x)?.category)) { this.toast('친구가 이미 가진 종이에요'); return false; }
    const xid = this.nid('d');
    this.dexOut = { xid, give: id, at: this.game.time };
    this.send({ t: 'dex-offer', xid, give: id });
    this.toast(`📒 ${this.name(id)} 도감 교환을 제안했어요`);
    this.changed();
    return true;
  }
  /** 받은 제안 수락(돌려줄 종 · 없으면 그냥 받기) */
  acceptDex(back: string | null): boolean {
    const i = this.dexIn;
    if (!i) return false;
    if (this.dexLeft() <= 0) { this.declineDex(); this.toast(`오늘 ${this.peerName()}와는 도감을 ${DEX_PER_DAY}번 바꿨어요. 내일 또!`); return false; }
    const st = this.game.state;
    if (back && !dexGiftable(back, st.dex, this.peerDex, (x) => st.species.get(x)?.category)) back = null;
    this.dexIn = null;
    this.send({ t: 'dex-accept', xid: i.xid, give: back });
    this.receiveDex(i.give);
    if (back) this.peerDex.add(back);
    this.dexDone();
    this.changed();
    return true;
  }
  declineDex() { const i = this.dexIn; if (!i) return; this.dexIn = null; this.send({ t: 'dex-no', xid: i.xid }); this.changed(); }
  private dexDone() {
    takeDaily(this.flags(), `dex:${this.peerName()}`, this.day(), DEX_PER_DAY);
    this.save();
    this.title('dex-pal');
  }
  /** 받은 종을 도감에("○○가 준 친구") */
  private receiveDex(id: string) {
    const st = this.game.state;
    const sp = st.species.get(id);
    if (!sp || st.dex[id]) return;
    markDexGift(this.dexFrom(), st.dex, id, this.peerName(), this.day());
    st.collect({ species: sp, keep: false, activity: 'gift' } as never);
    this.save();
    this.game.hud.card({ title: `📒 ${dexGiftLabel(this.peerName())}`, body: `${sp.name} 도감 칸이 채워졌어요! (박물관 기증은 직접 잡아야 해요)`, icon: '📒', color: '#ffd6e2', ms: 3800 });
    this.sfx('new-dex', 1.1);
  }

  // ───────────── 불꽃놀이 ─────────────
  firework(): boolean {
    const t = this.game.time;
    if (t - this.fwAt < 2.5) return false;
    this.fwAt = t;
    const p = this.game.player.pos, f = this.game.player.facing?.() ?? new THREE.Vector3(0, 0, -1);
    // 앞쪽 멀리(35m)에서 터뜨려야 카메라에 하늘 불꽃이 다 들어온다
    const x = p.x + f.x * 35, z = p.z + f.z * 35, y = p.y;
    const seed = (++this.fwN * 7919 + (this.game.frame ?? 0) * 31) % 1e9;
    this.view.firework(x, y, z, seed);
    this.sfx('rocket-launch', 1.8);
    this.game.player.act('cheer', 1.2);
    if (this.connected) this.send({ t: 'fw', x, y, z, seed });
    return true;
  }

  // ───────────── 하트 짝(같은 물가) ─────────────
  private probe = {
    lakeAt: (x: number, z: number) => Island.lakeAt(x, z),
    waterLevelAt: (x: number, z: number) => Island.waterLevelAt(x, z),
    isSea: (x: number, z: number) => Island.surfaceAt(x, z).kind === 'sea',
    island: (x: number, z: number) => Island.islandAt(x, z)?.id ?? null,
  };
  private heartTick(t: number) {
    if (t - this.heartAt < 0.5) return;
    this.heartAt = t;
    const pp = this.game.world === 'earth' ? this.peerPose() : null;
    const me = this.game.player.pos;
    const boost = pp ? heartBoost({ x: me.x, z: me.z, key: waterKey(me.x, me.z, this.probe) }, { x: pp.x, z: pp.z, key: waterKey(pp.x, pp.z, this.probe) }) : {};
    this.setHeart(!!boost[HEART_TAG]);
  }
  private setHeart(on: boolean) {
    const n = this.net();
    if (n) {
      const bt = (n.boostTags ??= {});
      if (on) bt[HEART_TAG] = 2; else delete bt[HEART_TAG];
    }
    if (on !== this.heart) {
      this.heart = on;
      if (on && this.game.time - this.heartToastAt > 90) { this.heartToastAt = this.game.time; this.toast('💞 둘이 같은 물가! 하트잉어·하트무당벌레가 두 배로 나와요'); }
      this.changed();
    }
  }

  // ───────────── 2인 탈것 ─────────────
  private driveTick(t: number) {
    const V = this.game.vehicles;
    const cur = this.ride ? null : V?.current?.() ?? null;
    const key = cur ? `${cur.kind}:${cur.seats ?? 1}` : '';
    if (key !== this.myDrive || t - this.driveSentAt > 5) {
      if (key !== this.myDrive && !cur && this.passenger) { this.send({ t: 'ride-off' }); this.stopPassenger(false); }
      this.myDrive = key;
      this.driveSentAt = t;
      this.send({ t: 'drive', kind: cur?.kind ?? null, seats: cur?.seats ?? 1 });
    }
    // 운전석: 뒷자리 자리를 10Hz 로 + 둘 다 밟기
    const P = this.passenger;
    if (P && cur) {
      const seat = P.seat ?? V?.seat?.(1) ?? null;
      if (seat && t - this.seatSentAt >= 0.1) {
        this.seatSentAt = t;
        seat.updateWorldMatrix(true, false);
        const w = new THREE.Vector3().setFromMatrixPosition(seat.matrixWorld);
        const q = new THREE.Quaternion().setFromRotationMatrix(seat.matrixWorld);
        const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
        this.send({ t: 'seat', x: w.x, y: w.y, z: w.z, yaw });
      }
      const both = cur.kind === 'bike' && P.pedal && this.game.input.axis().y > 0;
      if (both !== P.both) {
        P.both = both;
        V?.setPassenger?.({ on: true, pedal: both });
        const n = this.net(); if (n) n.coPedal = both;
        if (both) this.toast('🚲 둘이 같이 밟아요! 속도 ×1.3');
      }
    }
  }
  /** 친구 탈것 뒷자리에 탈 수 있나 */
  canBoard(): boolean {
    if (!this.connected || this.ride || this.game.player.mounted) return false;
    if (!this.peerDrive.kind || this.peerDrive.seats < 2) return false;
    return this.peerDist() <= RIDE_REACH;
  }
  /** 손님: 태워 줘! */
  askRide(): boolean {
    if (!this.canBoard()) return false;
    if (this.game.time - this.rideAsk < 1) return false;
    this.rideAsk = this.game.time;
    this.send({ t: 'ride-ask' });
    return true;
  }
  private driverAsk() {
    const V = this.game.vehicles;
    const cur = V?.current?.() ?? null;
    if (!cur || (cur.seats ?? 1) < 2) { this.send({ t: 'ride-no', why: '이 탈것은 혼자 타는 거래요' }); return; }
    if (this.passenger) { this.send({ t: 'ride-no', why: '뒷자리가 벌써 찼어요' }); return; }
    const seat = V?.setPassenger?.({ on: true, pedal: false }) ?? null;
    if (!seat && V?.setPassenger) { this.send({ t: 'ride-no', why: '뒷자리가 없는 탈것이에요' }); return; }
    this.passenger = { pedal: false, seat, both: false };
    this.seatSentAt = -99;
    this.send({ t: 'ride-ok', kind: cur.kind });
    this.toast(`🫂 ${this.peerName()}가 뒷자리에 탔어요!${cur.kind === 'bike' ? ' 같이 밟으면 ×1.3' : ''}`);
    this.sfx('bike-bell', 1.3);
  }
  private stopPassenger(notify: boolean) {
    if (!this.passenger) return;
    this.passenger = null;
    try { this.game.vehicles?.setPassenger?.(null as never); } catch { /* 탈것 없음 */ }
    const n = this.net(); if (n) n.coPedal = false;
    if (notify) this.send({ t: 'ride-off' });
    this.changed();
  }
  /** 손님: 친구 뒷자리(유령 자리)에 앉기 */
  private boardRide(kind: string) {
    if (this.ride || this.game.player.mounted) { this.send({ t: 'ride-off' }); return; }
    const g = this.game;
    const pp = this.net()?.peerPose();
    const seat = new THREE.Object3D();
    seat.name = 'netplayplay-seat';
    const start = pp ? new THREE.Vector3(pp.x, pp.y + 0.2, pp.z) : g.player.pos.clone();
    seat.position.copy(start);
    (g.engine?.scene as THREE.Scene | undefined)?.add(seat);
    seat.updateMatrixWorld(true);
    const self = this;
    const mount: Mountable = {
      name: `${this.peerName()} 뒷자리`,
      seat, object: seat, camDistance: 1.25,
      drive(input: Input, dt: number) {
        const r = self.ride;
        if (!r) return;
        // 10Hz 자리를 부드럽게 따라간다(조금 앞을 내다본다)
        const age = Math.min(0.25, g.time - r.at);
        const aim = r.target.clone().addScaledVector(r.vel, age);
        const k = 1 - Math.exp(-dt * 14);
        seat.position.lerp(aim, k);
        let dy = r.yaw - seat.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        seat.rotation.y += dy * k;
        seat.updateMatrixWorld(true);
        const pedal = input.axis().y > 0;
        if (pedal !== r.pedal) { r.pedal = pedal; self.send({ t: 'ride-pedal', on: pedal }); }
      },
      onExit: () => {
        const r = self.ride;
        if (r && !r.leaving) self.send({ t: 'ride-off' });
        const at = seat.position.clone().add(new THREE.Vector3(Math.cos(seat.rotation.y) * 1.4, 0, -Math.sin(seat.rotation.y) * 1.4));
        self.ride = null;
        seat.removeFromParent();
        self.changed();
        return at;
      },
    };
    this.ride = { mount, seat, target: start.clone(), vel: new THREE.Vector3(), yaw: pp?.yaw ?? 0, at: g.time, pedal: false, kind, leaving: false };
    g.player.mount(mount);
    this.toast(`🫂 ${this.peerName()} 뒷자리에 탔어요! (E 내리기${kind === 'bike' ? ' · W 같이 밟기' : ''})`);
  }
  /** 뒷자리에서 내리기(notify=false 면 친구가 먼저 내린 것) */
  leaveRide(notify = true) {
    const r = this.ride;
    if (!r) return;
    r.leaving = !notify;
    if (this.game.player.mounted === r.mount) this.game.player.dismount();
    else { this.ride = null; r.seat.removeFromParent(); }
    if (notify) this.send({ t: 'ride-off' });
  }
  /** 친구 아바타 위치 고치기(netplay 가 그린 다음) — 뒷자리·숨바꼭질 */
  private avatarTick() {
    const root = this.deps.avatar?.() ?? null;
    if (!root) return;
    const P = this.passenger;
    if (P?.seat) {
      P.seat.updateWorldMatrix(true, false);
      root.position.setFromMatrixPosition(P.seat.matrixWorld);
      const q = new THREE.Quaternion().setFromRotationMatrix(P.seat.matrixWorld);
      root.rotation.set(0, new THREE.Euler().setFromQuaternion(q, 'YXZ').y, 0);
    }
    const r = this.run;
    if (r?.kind === 'hide' && r.role === 'seeker' && r.phase !== 'done' && root.visible) {
      if (r.phase === 'hide' || this.peerDist() > HIDE_VIS_R) root.visible = false;
    }
  }

  // ───────────── 상호작용(E) ─────────────
  /** 게임에 상호작용을 단다(build 에서 한 번) */
  wire() {
    const g = this.game;
    g.addProvider('netplayplay-chest', (pl) => {
      if (!this.connected || !this.chestOn || g.world !== 'earth') return null;
      const c = this.chestPos();
      const d = Math.hypot(pl.pos.x - c.x, pl.pos.z - c.z);
      if (d > CHEST_REACH) return null;
      if (this.isHost) return { id: 'netplayplay-chest', label: '🎈 방문객 상자 — 놀러 온 친구만 열 수 있어요', dist: d, use: () => this.toast(`🎈 ${this.peerName()}에게 열어 보라고 해요! (하루 1번)`) };
      return { id: 'netplayplay-chest', label: guestMayOpen(this.flags().visited, this.peerName(), this.hostDay) ? '🎈 방문객 상자 열기' : '🎈 오늘은 벌써 열었어요', dist: d, use: () => { this.openVisitorChest(); } };
    });
    g.addProvider('netplayplay-market', (pl) => {
      if (!this.isGuest || g.world !== 'earth' || pl.mounted) return null;
      const s = Island.PLACES.shop;
      const d = Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z);
      if (d > 6) return null;
      return { id: 'netplayplay-market', label: `🦆 ${this.peerName()}네 꽥사장 시세로 팔기`, key: 'KeyF', dist: d, use: () => { this.askQuote(true); g.hud.open('netplayplay', 'market'); } };
    });
    g.addProvider('netplayplay-boss', () => {
      if (!this.bossNear()) return null;
      const v = this.bossView!;
      const D = BOSSES[v.kind];
      return { id: 'netplayplay-boss', label: `${D.icon} E 연타! ${D.name} 같이 끌어올리기 (${Math.ceil(v.hp)}/${v.max})`, dist: 0.5, whileMounted: true, priority: 40, use: () => { this.bossMash(); } };
    });
    g.addProvider('netplayplay-ride', (pl) => {
      if (pl.mounted || !this.canBoard()) return null;
      return { id: 'netplayplay-ride', label: `🫂 ${this.peerName()} 뒷자리에 타기`, dist: this.peerDist(), use: () => { this.askRide(); } };
    });
    g.addProvider('netplayplay-seek', () => {
      const r = this.run;
      if (r?.kind !== 'hide' || r.role !== 'seeker' || r.phase !== 'seek') return null;
      const d = this.peerDist();
      if (d > FIND_R) return null;
      return { id: 'netplayplay-seek', label: `👀 ${this.peerName()} 찾았다!`, dist: d, whileMounted: true, use: () => { this.found(); } };
    });
  }

  // ───────────── 창이 읽는 요약 ─────────────
  status(): string {
    const r = this.run;
    if (this.bossView?.st === 'on') return `${BOSSES[this.bossView.kind].icon} 보스전!`;
    if (r?.kind === 'race') return r.phase === 'gather' ? '🏁 출발선으로!' : r.phase === 'count' ? '⏱️ 곧 출발' : r.phase === 'go' ? `🏁 ${r.track.passed}/${r.track.total}` : '🏁 결과';
    if (r?.kind === 'contest') return `🎣 ${Math.round(r.me.total)}cm`;
    if (r?.kind === 'hide') return r.role === 'seeker' ? '👀 술래' : '🤫 숨는 중';
    if (this.invite?.from === 'peer') return '💌 초대 왔어요!';
    if (this.dexIn) return '📒 교환 제안!';
    if (this.passenger) return '🫂 둘이 타는 중';
    if (this.ride) return '🫂 뒷자리';
    if (this.heart) return '💞 하트 짝 ×2';
    if (this.reelFriend) return '💞 친구 릴!';
    return '같이 놀기';
  }
}
