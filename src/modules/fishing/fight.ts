// 릴 줄다리기 화면·입력·협동(★4 이상, GDD 3.5 P1). 규칙은 fishing/reel.ts(순수).
//   - 텐션은 game.hud.gauge('fishing-reel') + 머리 위 반원 미터(빨간 칸 = 놓아요!), 감기는 'fishing-reel-pull'.
//   - 협동 릴(GDD 4.15): game.ext.net?.peer 가 있으면 'net-coop' {kind:'reel'} 을 주고받는다.
//     보내기 = ext.net.send('net-coop', {kind, data}) (없으면 보내지 않는다),
//     받기 = ext.net.on('net-coop', fn) + state 이벤트 'net-coop'. data = {phase:'start'|'mash'|'end', from, seq, rarity?, n?}.
//     친구의 'mash' 신호가 COOP_WINDOW(1.5초) 안에 있으면 내 연타 한 번의 감기가 두 배.
import * as THREE from 'three';
import type { Game } from '../../core/game';
import * as R from './reel';

// ───────────── 협동 연결 ─────────────
export interface CoopMsg { phase: 'start' | 'mash' | 'end' | 'help'; from: string; seq: number; rarity?: number; n?: number }
type NetLike = { peer?: unknown; send?: (kind: string, data: unknown) => void; on?: (kind: string, fn: (data: unknown) => void) => unknown };

/** 탭마다 다른 id(두 탭이 같은 rng 씨앗이어도 내 신호를 친구 것으로 착각하지 않게) */
function sessionId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID().slice(0, 8);
  } catch { /* 아래로 */ }
  return `p${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36)}`;
}

export class CoopLink {
  readonly id = sessionId();
  private seq = 0;
  private seen = new Map<string, number>();
  /** 친구가 마지막으로 감은 시각(game.time) */
  lastPartner = -99;
  /** 친구가 줄다리기를 시작했다(내가 도와줄 수 있게) */
  partnerFight: { at: number; rarity: number } | null = null;
  private hooked: unknown = null;
  private pending = 0;
  private lastSend = -99;
  /** 받은 신호 수(디버그) */
  received = 0;

  constructor(private game: Game) {
    game.state.on((e) => {
      if (e.type !== 'net-coop') return;
      const ev = e as unknown as { kind?: string; data?: unknown };
      if (ev.kind === 'reel') this.receive(ev.data);
    });
  }
  private net(): NetLike | null { return (this.game.ext?.net as NetLike | undefined) ?? null; }
  /** 친구가 붙어 있나 */
  peer(): boolean { return !!this.net()?.peer; }
  /** ext.net.on 은 netplay 가 늦게 생기므로 매 프레임 한 번 확인해 붙인다 */
  poll() {
    const n = this.net();
    if (!n || typeof n.on !== 'function' || this.hooked === n) return;
    this.hooked = n;
    try { n.on('net-coop', (d: unknown) => { const m = d as { kind?: string; data?: unknown }; if (m && m.kind === 'reel') this.receive(m.data); }); } catch { /* 연결 쪽 오류는 무시 */ }
  }
  /** 받은 신호 처리(테스트·디버그도 이걸 부른다) */
  receive(data: unknown, t = this.game.time) {
    const m = data as Partial<CoopMsg> | null;
    if (!m || typeof m !== 'object' || !m.phase) return;
    if (m.from === this.id) return; // 내가 보낸 것
    const key = `${m.from ?? '?'}`;
    if (typeof m.seq === 'number') {
      if ((this.seen.get(key) ?? -1) >= m.seq) return; // 같은 신호 두 번(전송 + 이벤트)
      this.seen.set(key, m.seq);
    }
    this.received++;
    if (m.phase === 'mash' || m.phase === 'help') this.lastPartner = t;
    if (m.phase === 'start') this.partnerFight = { at: t, rarity: m.rarity ?? 4 };
    if (m.phase === 'end') this.partnerFight = null;
  }
  /** 보내기 */
  send(phase: CoopMsg['phase'], extra: Partial<CoopMsg> = {}) {
    if (!this.peer()) return;
    const data: CoopMsg = { phase, from: this.id, seq: ++this.seq, ...extra };
    const n = this.net();
    try {
      // 'net-coop' 상태 이벤트는 '친구가 보낸 것'(CONTRACT2) — 내 신호를 그 이름으로 흘리지 않는다. 연결이 없으면 안 보낸다
      if (n && typeof n.send === 'function') n.send('net-coop', { kind: 'reel', data });
    } catch { /* 연결이 끊겼으면 조용히 */ }
  }
  /** 연타를 모아 초당 5번까지만 보낸다 */
  mash(t: number) {
    this.pending++;
    if (t - this.lastSend >= 0.2) this.flush(t);
  }
  flush(t: number) {
    if (!this.pending) return;
    this.send('mash', { n: this.pending });
    this.pending = 0; this.lastSend = t;
  }
  /** 지금 협동 중인가 */
  active(t: number) { return R.coopActive(this.peer(), this.lastPartner, t); }
}

// ───────────── 머리 위 미터(캔버스) ─────────────
const MW = 320, MH = 230;
function drawMeter(g: CanvasRenderingContext2D, s: R.ReelState, coop: boolean, blink: boolean) {
  g.clearRect(0, 0, MW, MH);
  // 판
  g.fillStyle = 'rgba(255,248,232,0.94)';
  g.strokeStyle = '#c9a77a'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(8, 8, MW - 16, MH - 16, 34); g.fill(); g.stroke();
  // 반원 눈금: 민트 → 노랑 → 빨강
  const cx = MW / 2, cy = 132, r = 80;
  const arc = (a: number, b: number, c: string) => {
    g.strokeStyle = c; g.lineWidth = 22; g.lineCap = 'butt';
    g.beginPath(); g.arc(cx, cy, r, Math.PI + a * Math.PI, Math.PI + b * Math.PI); g.stroke();
  };
  arc(0, 0.55, '#8fe3c4');
  arc(0.55, R.RED, '#ffe08a');
  arc(R.RED, 1, blink ? '#ff3d5a' : '#ff7a8a');
  // 바늘(텐션)
  const v = Math.min(1, s.tension);
  const a = Math.PI + v * Math.PI;
  g.strokeStyle = '#4a3b2a'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); g.stroke();
  g.fillStyle = '#ff9fb8';
  g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.fill();
  // 감기 막대
  g.fillStyle = '#f1dfc4';
  g.beginPath(); g.roundRect(40, 196, MW - 80, 16, 8); g.fill();
  g.fillStyle = coop ? '#ff7eb6' : '#ffb3cf';
  g.beginPath(); g.roundRect(40, 196, Math.max(16, (MW - 80) * Math.max(0, s.progress)), 16, 8); g.fill();
  // 글자
  g.font = 'bold 30px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const red = R.inRed(s);
  g.fillStyle = red ? '#ff3d5a' : '#4a3b2a';
  g.fillText(red ? (blink ? '놓아요!!' : '놓아요!') : 'E 연타!', cx, 170);
  g.font = 'bold 20px Jua, sans-serif';
  g.fillStyle = '#8a6a4a';
  const side = s.surge > 0 ? (s.dir < 0 ? '◀ 왼쪽으로 끈다! D 로 버텨요' : '오른쪽으로 끈다! A 로 버텨요 ▶') : coop ? '💞 협동 릴 ×2!' : '';
  if (side) g.fillText(side, cx, 34);
}

/** 한 번의 줄다리기 */
export interface FightStart { rarity: number; sizeRatio: number; rng: () => number; name?: string }

export class ReelFight {
  readonly meter: THREE.Sprite;
  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private tex: THREE.Texture;
  private drawnAt = -99;
  state: R.ReelState | null = null;
  private rng: () => number = () => 0.5;
  /** 마지막 사건(화면 흔들림·소리) */
  lastSurge = -99;
  /** 디버그: 협동 강제 */
  forceCoop = false;
  /** 촬영: 판정 멈춤 */
  frozen = false;
  readonly coop: CoopLink;

  constructor(private game: Game, root: THREE.Object3D) {
    this.coop = new CoopLink(game);
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = MW; this.canvas.height = MH;
      this.ctx2d = this.canvas.getContext('2d');
    }
    this.tex = this.canvas ? new THREE.CanvasTexture(this.canvas) : new THREE.Texture();
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.meter = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true }));
    this.meter.scale.set(1.6, 1.15, 1);
    this.meter.renderOrder = 11;
    this.meter.visible = false;
    root.add(this.meter);
  }

  get active() { return !!this.state && !this.state.done; }

  start(o: FightStart) {
    this.rng = o.rng;
    this.state = R.newReel(o.rarity, o.sizeRatio, o.rng);
    this.frozen = false;
    this.meter.visible = true;
    this.drawnAt = -99;
    this.coop.send('start', { rarity: o.rarity });
    this.game.audio?.sfx('bite', { vol: 0.9 });
    this.game.ui.toast(this.coop.peer() ? `${o.name ?? '큰 물고기'}! 친구랑 같이 E 연타! 💞` : `${o.name ?? '큰 물고기'}가 걸렸다! E 연타 · 빨간 칸에선 놓아요!`);
  }

  /** 한 프레임 — 끝나면 결과 */
  update(t: number, dt: number, mash: boolean, steer: number, anchor: THREE.Vector3): R.ReelEnd | null {
    const s = this.state;
    if (!s) return null;
    this.coop.poll();
    const coop = this.forceCoop || this.coop.active(t);
    if (!this.frozen && !s.done) {
      const evs = R.stepReel(s, dt, { mash, steer, coop }, this.rng);
      if (mash) { this.coop.mash(t); this.game.audio?.sfx('reel', { vol: 0.35, pitch: 1 + s.progress * 0.5 }); }
      for (const e of evs) {
        if (e.type === 'surge') { this.lastSurge = t; this.game.audio?.sfx('splash', { vol: 0.5, pitch: 0.8 }); }
        if (e.type === 'red') this.game.audio?.sfx('nibble', { vol: 0.6, pitch: 0.7 });
      }
    }
    this.meter.position.copy(anchor);
    this.meter.position.y += 2.75;
    // 미터 다시 그리기(초당 20번까지)
    if (this.ctx2d && t - this.drawnAt > 0.05) {
      this.drawnAt = t;
      drawMeter(this.ctx2d, s, coop, Math.sin(t * 18) > 0);
      this.tex.needsUpdate = true;
    }
    const red = R.inRed(s);
    this.game.hud?.gauge?.('fishing-reel', { label: red ? '텐션 ⚠️ 놓아요!' : '텐션 (E 연타)', value: Math.min(1, s.tension), color: red ? '#ff5a6a' : '#7fd6ff', show: true });
    this.game.hud?.gauge?.('fishing-reel-pull', { label: coop ? '감기 💞 협동 ×2' : '감기', value: Math.max(0, s.progress), color: '#ff9fb8', show: true });
    this.game.ui.setPrompt(red ? '빨간 칸! E 를 놓아요!' : s.surge > 0 ? `${s.dir < 0 ? '◀ 끈다! D' : 'A 끈다! ▶'} 로 버티며 E 연타` : 'E 연타로 감기!', null);
    if (s.done && !this.frozen) { const d = s.done; this.stop(); return d; }
    return null;
  }

  stop() {
    if (this.state) this.coop.flush(this.game.time);
    if (this.state) this.coop.send('end');
    this.state = null;
    this.meter.visible = false;
    this.game.hud?.gauge?.('fishing-reel', { label: '텐션', value: 0, color: '#7fd6ff', show: false });
    this.game.hud?.gauge?.('fishing-reel-pull', { label: '감기', value: 0, color: '#ff9fb8', show: false });
  }
}
