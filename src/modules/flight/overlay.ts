// 별길 비행 화면(캔버스 2D 덮개) + 엔딩 불꽃놀이 덮개. 그리기만 한다 — 판정·점수는 logic.ts.
// 덮개는 필요할 때 만들고(처음 비행 때) 끝나면 숨긴다. DOM 이 없으면(테스트) 아무것도 안 한다.
// 글꼴은 index.html 의 'Jua' 하나. 색은 GDD 0.5 파스텔 + UI 글자 #4a3b2a / 바탕 #fff8e8.
import { projScale, type FlightState, type FlightItem, type FlightReward } from './logic';

const FONT = "'Jua', 'Apple SD Gothic Neo', sans-serif";
const INK = '#4a3b2a', CREAM = '#fff8e8', EYE = '#3d3a4a', BLUSH = '#ff9fb8';
const PASTEL = ['#ff9fb8', '#ffd23f', '#8ff0d2', '#8fd3ff', '#c9a2ff', '#ffb36b', '#fff2a8', '#ffc2dc'];

const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function' && typeof window !== 'undefined';

/** 캔버스 하나(화면 가득) — 크기는 그릴 때마다 맞춘다 */
function makeCanvas(z: number, id: string): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  if (!hasDom()) return null;
  const cv = document.createElement('canvas');
  cv.id = id;
  cv.style.cssText = `position:fixed;inset:0;width:100vw;height:100vh;z-index:${z};pointer-events:none;display:none`;
  const g = cv.getContext('2d');
  if (!g) return null;
  document.body.appendChild(cv);
  return { cv, g };
}
function fit(cv: HTMLCanvasElement): { W: number; H: number; dpr: number } {
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const w = Math.max(320, window.innerWidth || 1280), h = Math.max(240, window.innerHeight || 720);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  return { W, H, dpr };
}

/** 둥근 네모 */
function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}
/** 귀여운 눈 한 쌍(세로 타원 + 하이라이트 둘) + 볼터치 */
function face(g: CanvasRenderingContext2D, x: number, y: number, s: number, o: { blush?: boolean; happy?: boolean; mouth?: boolean } = {}) {
  const ex = s * 0.36, ew = s * 0.13, eh = ew / 0.75;
  for (const sx of [-1, 1]) {
    if (o.happy) {
      g.strokeStyle = EYE; g.lineWidth = s * 0.07; g.lineCap = 'round';
      g.beginPath(); g.arc(x + sx * ex, y + eh * 0.2, ew, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      continue;
    }
    g.fillStyle = EYE;
    g.beginPath(); g.ellipse(x + sx * ex, y, ew, eh, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(x + sx * ex - ew * 0.3, y - eh * 0.38, ew * 0.38, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + sx * ex + ew * 0.32, y + eh * 0.3, ew * 0.18, 0, Math.PI * 2); g.fill();
  }
  if (o.blush !== false) {
    g.fillStyle = BLUSH; g.globalAlpha *= 0.55;
    for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(x + sx * ex * 1.45, y + eh * 0.95, ew * 0.9, ew * 0.55, 0, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha /= 0.55;
  }
  if (o.mouth !== false) {
    g.strokeStyle = '#6e4a5a'; g.lineWidth = s * 0.055; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y + eh * 0.75, s * 0.1, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  }
}
/** 별 모양 경로 */
function starPath(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0, n = 5, inner = 0.48) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r * inner : r;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}
/** 하트 모양 경로 */
function heartPath(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.2, x, y - r * 0.45);
  g.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  g.closePath();
}

export interface FlightView {
  /** 목적지 */
  dest: { name: string; icon: string; color: string };
  /** 지금까지 별가루(미리 보기) */
  dust: number;
  /** 실제 흐른 시간(반짝임 애니메이션) */
  time: number;
  /** 결과(끝났을 때) */
  reward?: FlightReward & { grade: string; line: string; mult: number };
  /** 하얀 덮기 0..1 */
  white: number;
  /** 전체 투명도 0..1(끝나고 걷힐 때) */
  alpha: number;
}

interface Pop { x: number; y: number; text: string; color: string; age: number }
interface Streak { a: number; r: number; z: number; c: string }
interface Blob { x: number; y: number; r: number; c: string; sp: number }

/** 별길 비행 덮개 */
export class FlightOverlay {
  private c: { cv: HTMLCanvasElement; g: CanvasRenderingContext2D } | null = null;
  private streaks: Streak[] = [];
  private blobs: Blob[] = [];
  private pops: Pop[] = [];
  private shake = 0;
  private lastTime = 0;
  constructor(private rng: () => number) {
    for (let i = 0; i < 150; i++) this.streaks.push({ a: rng() * Math.PI * 2, r: 0.05 + rng() * 0.95, z: rng(), c: rng() < 0.2 ? PASTEL[Math.floor(rng() * PASTEL.length)] : '#ffffff' });
    for (let i = 0; i < 7; i++) this.blobs.push({ x: rng() * 1.6 - 0.8, y: rng() * 1.2 - 0.6, r: 0.35 + rng() * 0.5, c: ['#ff9fd0', '#8ff0d2', '#c9a2ff', '#8fd3ff'][i % 4], sp: (rng() - 0.5) * 0.05 });
  }
  get visible() { return !!this.c && this.c.cv.style.display !== 'none'; }
  show() {
    this.c ??= makeCanvas(58, 'flight-overlay');
    if (this.c) this.c.cv.style.display = 'block';
    this.pops.length = 0;
    this.shake = 0;
  }
  hide() { if (this.c) this.c.cv.style.display = 'none'; }

  /** 판정 결과 → 떠오르는 글자·흔들림 */
  feed(s: FlightState) {
    for (const e of s.events) {
      if (e.kind === 'comet') { this.shake = 0.45; this.pops.push({ x: s.x, y: s.y + 0.12, text: '앗! 💫', color: '#ffb36b', age: 0 }); }
      else if (e.kind === 'miss') this.pops.push({ x: e.x, y: e.y, text: '아깝다~', color: '#c9b6f2', age: 0 });
      else this.pops.push({ x: e.x, y: e.y, text: e.kind === 'gold' ? `+${e.pts} ✨✨✨` : `+${e.pts} ✨`, color: e.kind === 'gold' ? '#ffd23f' : '#fff2a8', age: 0 });
    }
  }

  draw(s: FlightState, v: FlightView) {
    const c = this.c;
    if (!c) return;
    const { g, cv } = c;
    const { W, H } = fit(cv);
    const dt = Math.max(0, Math.min(0.1, v.time - this.lastTime));
    this.lastTime = v.time;
    const u = Math.min(W, H * 1.6) * 0.42;
    let cx = W / 2, cy = H * 0.5;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const k = this.shake * u * 0.06; cx += Math.sin(v.time * 90) * k; cy += Math.cos(v.time * 77) * k; }
    g.save();
    g.globalAlpha = Math.max(0, Math.min(1, v.alpha));
    // ── 하늘
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2b2160'); bg.addColorStop(0.55, '#46307a'); bg.addColorStop(1, '#6b3d7e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, u * 1.3);
    glow.addColorStop(0, 'rgba(255,190,230,0.28)'); glow.addColorStop(1, 'rgba(255,190,230,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // 성운(몽글)
    for (const b of this.blobs) {
      const x = cx + (b.x + Math.sin(v.time * b.sp * 6 + b.r * 9) * 0.08) * u * 1.4, y = cy + b.y * u * 1.2, r = b.r * u;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, hexA(b.c, 0.16)); gr.addColorStop(1, hexA(b.c, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // 별 줄기(앞으로 쏟아진다)
    const speed = s.phase === 'intro' ? 0.12 : 0.55;
    g.lineCap = 'round';
    for (const st of this.streaks) {
      st.z -= dt * speed;
      if (st.z <= 0.02) st.z += 1;
      const k0 = 1 / (st.z * 6 + 0.15), k1 = 1 / ((st.z + 0.05) * 6 + 0.15);
      const R = st.r * u * 0.5;
      const x0 = cx + Math.cos(st.a) * R * k0, y0 = cy + Math.sin(st.a) * R * k0;
      const x1 = cx + Math.cos(st.a) * R * k1, y1 = cy + Math.sin(st.a) * R * k1;
      g.strokeStyle = st.c; g.globalAlpha = Math.max(0, Math.min(1, v.alpha)) * Math.min(1, (1 - st.z) * 1.4);
      g.lineWidth = Math.max(1, u * 0.006 * (1.2 - st.z));
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x0, y0); g.stroke();
    }
    g.globalAlpha = Math.max(0, Math.min(1, v.alpha));
    // ── 목적지 행성(점점 커진다)
    const prog = Math.max(0, Math.min(1, s.t / s.course.dur));
    const pr = u * (0.05 + 0.42 * prog * prog);
    const px = cx, py = cy - u * 0.05;
    const pg = g.createRadialGradient(px - pr * 0.35, py - pr * 0.35, pr * 0.1, px, py, pr);
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.35, v.dest.color); pg.addColorStop(1, shade(v.dest.color, -0.25));
    g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    if (pr > u * 0.08) face(g, px, py + pr * 0.1, pr * 0.9, { happy: s.phase === 'done' });
    // ── 고리·혜성(먼 것부터)
    const items = s.course.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const ahead = it.t - s.t;
      if (ahead > 3.4 || ahead < -0.35) continue;
      this.drawItem(g, it, ahead, s.result[it.id], cx, cy, u, v.time);
    }
    // ── 우주선
    this.drawShip(g, cx + s.x * u, cy - s.y * u, u * 0.13, s, v.time);
    // ── 떠오르는 글자
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.age += dt;
      if (p.age > 0.9) { this.pops.splice(i, 1); continue; }
      const a = 1 - p.age / 0.9;
      g.globalAlpha = Math.max(0, Math.min(1, v.alpha)) * a;
      g.font = `${Math.round(u * 0.075 * (1 + (1 - a) * 0.3))}px ${FONT}`;
      g.lineWidth = u * 0.014; g.strokeStyle = '#4a2f5a'; g.fillStyle = p.color;
      const x = cx + p.x * u, y = cy - p.y * u - p.age * u * 0.25;
      g.strokeText(p.text, x, y); g.fillText(p.text, x, y);
    }
    g.globalAlpha = Math.max(0, Math.min(1, v.alpha));
    this.drawHud(g, s, v, W, H, u);
    // ── 하얀 덮기
    if (v.white > 0) { g.globalAlpha = Math.min(1, v.white); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); }
    g.restore();
  }

  private drawItem(g: CanvasRenderingContext2D, it: FlightItem, ahead: number, res: string | undefined, cx: number, cy: number, u: number, time: number) {
    const s = projScale(ahead);
    let x = cx + it.x * u * s, y = cy - it.y * u * s, r = it.r * u * s;
    const base = g.globalAlpha;
    const far = Math.min(1, (3.4 - ahead) / 0.8);
    let a = far;
    if (ahead < 0) {
      // 지나간 것: 통과한 고리는 퐁 커지며 사라지고, 나머지는 금방 흐려진다
      const k = -ahead / 0.35;
      a = (1 - k) * (1 - k);
      if (res === 'pass') r *= 1 + k * 0.5;
    }
    g.globalAlpha = base * Math.max(0, a);
    if (it.kind === 'comet') {
      // 꼬리(소실점 쪽으로) — 주황·노랑 구 꼬리
      const dx = x - cx, dy = y - cy, dl = Math.hypot(dx, dy) || 1;
      for (let k = 5; k >= 1; k--) {
        const tx = x - (dx / dl) * r * k * 0.75, ty = y - (dy / dl) * r * k * 0.75;
        g.fillStyle = k % 2 ? 'rgba(255,210,63,0.5)' : 'rgba(255,179,107,0.5)';
        g.beginPath(); g.arc(tx, ty, r * (1 - k * 0.14), 0, Math.PI * 2); g.fill();
      }
      const wob = Math.sin(time * 6 + it.ph) * 0.06;
      const cg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      cg.addColorStop(0, '#fff2c4'); cg.addColorStop(0.5, '#ffb36b'); cg.addColorStop(1, '#ff8f6b');
      g.fillStyle = cg; g.beginPath(); g.ellipse(x, y, r * (1 + wob), r * (1 - wob), 0, 0, Math.PI * 2); g.fill();
      if (r > 6) face(g, x, y + r * 0.08, r * 0.95, { happy: res === 'hit' });
    } else {
      const gold = it.kind === 'gold';
      const lw = Math.max(2, r * 0.24);
      const spin = time * 1.6 + it.ph;
      // 바깥 빛
      g.strokeStyle = gold ? 'rgba(255,230,120,0.35)' : 'rgba(255,200,235,0.3)';
      g.lineWidth = lw * 2.2;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      // 고리(두 색 번갈아 — 사탕처럼)
      const segs = 12;
      for (let k = 0; k < segs; k++) {
        g.strokeStyle = gold ? (k % 2 ? '#ffd23f' : '#fff2a8') : (k % 2 ? '#ff9fd0' : '#8ff0d2');
        g.lineWidth = lw;
        g.beginPath(); g.arc(x, y, r, spin + (k / segs) * Math.PI * 2, spin + ((k + 1) / segs) * Math.PI * 2 + 0.02); g.stroke();
      }
      // 반짝이 점
      g.fillStyle = '#ffffff';
      for (let k = 0; k < 4; k++) {
        const aa = -spin * 1.3 + (k / 4) * Math.PI * 2;
        g.beginPath(); g.arc(x + Math.cos(aa) * r, y + Math.sin(aa) * r, lw * 0.3, 0, Math.PI * 2); g.fill();
      }
      if (gold) { g.fillStyle = 'rgba(255,210,63,0.85)'; starPath(g, x, y, r * 0.42, spin * 0.5); g.fill(); }
    }
    g.globalAlpha = base;
  }

  private drawShip(g: CanvasRenderingContext2D, x: number, y: number, s: number, st: FlightState, time: number) {
    g.save();
    g.translate(x, y);
    const tilt = Math.max(-0.5, Math.min(0.5, st.vx * 0.35)) + (st.stun > 0 ? Math.sin(st.stun * 18) * 0.5 : 0);
    g.rotate(tilt);
    // 불꽃(아래로 몽글몽글)
    for (let k = 0; k < 4; k++) {
      const fl = 0.75 + 0.25 * Math.sin(time * 30 + k * 2);
      g.fillStyle = k % 2 ? 'rgba(255,210,63,0.9)' : 'rgba(255,143,107,0.85)';
      g.beginPath(); g.arc(Math.sin(time * 20 + k) * s * 0.04, s * (0.78 + k * 0.22), s * (0.26 - k * 0.045) * fl, 0, Math.PI * 2); g.fill();
    }
    // 지느러미
    g.fillStyle = '#ff9fb8';
    for (const sx of [-1, 1]) {
      g.beginPath(); g.ellipse(sx * s * 0.5, s * 0.35, s * 0.22, s * 0.38, sx * 0.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#9ef0d2';
    g.beginPath(); g.ellipse(0, s * 0.5, s * 0.12, s * 0.3, 0, 0, Math.PI * 2); g.fill();
    // 몸통(통통한 알)
    const bg = g.createLinearGradient(-s * 0.5, 0, s * 0.5, 0);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#f1e6ff');
    g.fillStyle = bg;
    g.beginPath(); g.ellipse(0, 0, s * 0.46, s * 0.72, 0, 0, Math.PI * 2); g.fill();
    // 코(분홍 모자)
    g.fillStyle = '#ff9fb8';
    g.beginPath(); g.ellipse(0, -s * 0.5, s * 0.3, s * 0.24, 0, Math.PI, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(0, -s * 0.5, s * 0.3, s * 0.06, 0, 0, Math.PI); g.fill();
    // 창 + 안에 플레이어 얼굴
    g.fillStyle = '#9ef0d2';
    g.beginPath(); g.arc(0, -s * 0.06, s * 0.27, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c8e8ff';
    g.beginPath(); g.arc(0, -s * 0.06, s * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe2cc';
    g.beginPath(); g.arc(0, -s * 0.02, s * 0.16, 0, Math.PI * 2); g.fill();
    face(g, 0, -s * 0.03, s * 0.2, { happy: st.combo >= 5 });
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.ellipse(-s * 0.09, -s * 0.16, s * 0.05, s * 0.03, -0.6, 0, Math.PI * 2); g.fill();
    // 띠
    g.strokeStyle = '#ff9fb8'; g.lineWidth = s * 0.07;
    g.beginPath(); g.ellipse(0, s * 0.3, s * 0.4, s * 0.08, 0, 0, Math.PI); g.stroke();
    // 비틀: 머리 위 별 빙글
    if (st.stun > 0) {
      for (let k = 0; k < 3; k++) {
        const a = time * 6 + (k / 3) * Math.PI * 2;
        g.fillStyle = '#ffd23f';
        starPath(g, Math.cos(a) * s * 0.5, -s * 0.85 + Math.sin(a) * s * 0.12, s * 0.12, a);
        g.fill();
      }
    }
    g.restore();
  }

  private drawHud(g: CanvasRenderingContext2D, s: FlightState, v: FlightView, W: number, H: number, u: number) {
    const fs = Math.round(Math.max(14, u * 0.06));
    g.textBaseline = 'middle';
    // 시간 막대
    const bw = Math.min(W * 0.46, u * 1.4), bh = fs * 0.9, bx = (W - bw) / 2, by = fs * 0.9;
    g.fillStyle = 'rgba(255,248,232,0.92)'; rrect(g, bx - 6, by - 6, bw + 12, bh + 12, (bh + 12) / 2); g.fill();
    g.fillStyle = '#e9e0ff'; rrect(g, bx, by, bw, bh, bh / 2); g.fill();
    const k = Math.max(0, Math.min(1, s.t / s.course.dur));
    const tg = g.createLinearGradient(bx, 0, bx + bw, 0);
    tg.addColorStop(0, '#ff9fd0'); tg.addColorStop(1, '#c9a2ff');
    g.fillStyle = tg; rrect(g, bx, by, Math.max(bh, bw * k), bh, bh / 2); g.fill();
    g.font = `${Math.round(fs * 0.7)}px ${FONT}`; g.textAlign = 'center'; g.fillStyle = INK;
    g.fillText(`${v.dest.icon} ${v.dest.name}까지 ${Math.max(0, Math.ceil(s.course.dur - s.t))}초`, W / 2, by + bh / 2 + 1);
    // 별가루 · 콤보
    const pill = (x: number, text: string, align: 'left' | 'right') => {
      g.font = `${fs}px ${FONT}`;
      const tw = g.measureText(text).width + fs * 1.2;
      const px = align === 'left' ? x : x - tw;
      g.fillStyle = 'rgba(255,248,232,0.94)'; rrect(g, px, by - 8, tw, fs * 1.6, fs * 0.8); g.fill();
      g.fillStyle = INK; g.textAlign = 'center'; g.fillText(text, px + tw / 2, by - 8 + fs * 0.8 + 1);
    };
    pill(fs, `✨ 별가루 ${v.dust}`, 'left');
    pill(W - fs, s.combo >= 2 ? `콤보 ×${s.combo}` : `고리 ${s.rings + s.golds}/${s.course.rings + s.course.golds}`, 'right');
    // 도움말(처음 몇 초)
    if (s.phase === 'intro' || s.t < 4) {
      g.font = `${Math.round(fs * 0.75)}px ${FONT}`;
      const text = 'WASD·방향키로 조종 · 고리를 통과해요! · 혜성은 피해요 · Esc 건너뛰기';
      const tw = g.measureText(text).width + fs * 1.4;
      g.fillStyle = 'rgba(255,248,232,0.9)'; rrect(g, (W - tw) / 2, H - fs * 2.6, tw, fs * 1.5, fs * 0.75); g.fill();
      g.fillStyle = INK; g.textAlign = 'center'; g.fillText(text, W / 2, H - fs * 2.6 + fs * 0.75 + 1);
    }
    // 카운트다운 3, 2, 1, 출발!
    if (s.phase === 'intro' || (s.clock >= 0 && s.clock < 0.6)) {
      const left = -s.clock;
      const label = left > 0 ? String(Math.min(3, Math.ceil(left / 0.8))) : '출발!';
      const ph = left > 0 ? 1 - ((left / 0.8) % 1) : s.clock / 0.6;
      const bounce = 1 + 0.35 * Math.max(0, Math.sin(Math.min(1, ph * 2.2) * Math.PI)) - 0.1 * ph;
      g.font = `${Math.round(u * 0.32 * bounce)}px ${FONT}`;
      g.textAlign = 'center';
      g.lineWidth = u * 0.03; g.strokeStyle = '#4a2f5a'; g.fillStyle = left > 0 ? '#fff2a8' : '#ff9fd0';
      g.strokeText(label, W / 2, H * 0.44); g.fillText(label, W / 2, H * 0.44);
    }
    // 결과 카드
    if (v.reward) {
      const r = v.reward;
      const cw = Math.min(W * 0.8, u * 1.5), ch = u * 0.78, x = (W - cw) / 2, y = H * 0.5 - ch / 2;
      g.fillStyle = 'rgba(74,47,90,0.25)'; rrect(g, x + 6, y + 10, cw, ch, u * 0.08); g.fill();
      g.fillStyle = CREAM; rrect(g, x, y, cw, ch, u * 0.08); g.fill();
      g.strokeStyle = v.dest.color; g.lineWidth = u * 0.018; rrect(g, x, y, cw, ch, u * 0.08); g.stroke();
      g.textAlign = 'center'; g.fillStyle = INK;
      g.font = `${Math.round(u * 0.1)}px ${FONT}`;
      g.fillText(`${v.dest.icon} ${v.dest.name} 도착!`, W / 2, y + ch * 0.17);
      g.font = `${Math.round(u * 0.2)}px ${FONT}`;
      g.fillStyle = r.grade === 'S' ? '#ffb300' : r.grade === 'A' ? '#ff6fa0' : r.grade === 'B' ? '#7a9cff' : '#9a86c8';
      g.fillText(r.grade, W / 2, y + ch * 0.42);
      g.fillStyle = INK;
      g.font = `${Math.round(u * 0.06)}px ${FONT}`;
      g.fillText(r.line, W / 2, y + ch * 0.62);
      g.font = `${Math.round(u * 0.052)}px ${FONT}`;
      g.fillText(`고리 ${r.rings + r.golds}/${r.total} · 최고 콤보 ${r.bestCombo} · 혜성 ${r.hits}번 꽝 · ${r.score}점`, W / 2, y + ch * 0.76);
      g.font = `${Math.round(u * 0.07)}px ${FONT}`;
      g.fillStyle = '#b07a00';
      g.fillText(`✨ 별가루 +${r.dust}${r.mult > 1 ? ` (유성의 밤 ×${r.mult})` : ''}`, W / 2, y + ch * 0.9);
    }
  }
}

// ───────────── 엔딩 불꽃놀이 ─────────────
interface Spark { x: number; y: number; vx: number; vy: number; c: string; life: number; age: number; r: number; heart?: boolean }
interface Shell { x: number; y: number; vy: number; apex: number; c: string; shape: 'round' | 'heart' | 'star'; trail: number }

/** 불꽃놀이 덮개(투명 — 뒤의 세상이 보인다). 길이 FIREWORKS_SEC, 끝나면 done */
export const FIREWORKS_SEC = 12;
export class FireworksOverlay {
  private c: { cv: HTMLCanvasElement; g: CanvasRenderingContext2D } | null = null;
  private sparks: Spark[] = [];
  private shells: Shell[] = [];
  private nextShell = 0;
  private finale = false;
  t = 0;
  title = '';
  sub = '';
  running = false;
  /** 터질 때마다(소리) */
  onBurst: ((i: number) => void) | null = null;
  private bursts = 0;
  constructor(private rng: () => number) {}

  start(title: string, sub: string) {
    this.c ??= makeCanvas(57, 'flight-fireworks');
    if (this.c) this.c.cv.style.display = 'block';
    this.title = title; this.sub = sub;
    this.t = 0; this.nextShell = 0.3; this.finale = false; this.bursts = 0;
    this.sparks.length = 0; this.shells.length = 0;
    this.running = true;
  }
  stop() { this.running = false; if (this.c) this.c.cv.style.display = 'none'; this.sparks.length = 0; this.shells.length = 0; }
  get done() { return !this.running; }

  /** dt 진행 + 그리기. 끝나면 false */
  update(dt: number): boolean {
    if (!this.running) return false;
    const d = Math.max(0, Math.min(0.1, dt));
    this.t += d;
    const rng = this.rng;
    // 쏘기: 0.35~0.7초마다, 9초에 피날레 6발
    if (this.t < FIREWORKS_SEC - 2.5) {
      this.nextShell -= d;
      if (this.nextShell <= 0) { this.launch(); this.nextShell = 0.35 + rng() * 0.35; }
    }
    if (!this.finale && this.t >= FIREWORKS_SEC - 3) { this.finale = true; for (let i = 0; i < 6; i++) this.launch(0.12 + (i / 5) * 0.76, i % 2 ? 'heart' : 'star'); }
    // 껍질 올라가기 → 꼭대기에서 펑
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.y += s.vy * d;
      s.vy += 0.55 * d;
      s.trail += d;
      if (s.y <= s.apex || s.vy >= 0) { this.burst(s); this.shells.splice(i, 1); }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.age += d;
      if (p.age >= p.life) { this.sparks.splice(i, 1); continue; }
      p.vx *= 1 - 1.4 * d; p.vy *= 1 - 1.4 * d;
      p.vy += 0.18 * d;
      p.x += p.vx * d; p.y += p.vy * d;
    }
    this.draw();
    if (this.t >= FIREWORKS_SEC) { this.stop(); return false; }
    return true;
  }

  private launch(x?: number, shape?: Shell['shape']) {
    const rng = this.rng;
    const sh: Shell['shape'] = shape ?? (rng() < 0.25 ? 'heart' : rng() < 0.4 ? 'star' : 'round');
    this.shells.push({ x: x ?? 0.12 + rng() * 0.76, y: 1.05, vy: -(0.95 + rng() * 0.25), apex: 0.18 + rng() * 0.3, c: PASTEL[Math.floor(rng() * PASTEL.length)], shape: sh, trail: 0 });
  }
  private burst(s: Shell) {
    const rng = this.rng;
    const n = s.shape === 'round' ? 64 : 52;
    const c2 = PASTEL[Math.floor(rng() * PASTEL.length)];
    for (let i = 0; i < n && this.sparks.length < 1200; i++) {
      const a = (i / n) * Math.PI * 2;
      let vx: number, vy: number;
      if (s.shape === 'heart') {
        // 하트 곡선(16 sin³ …)
        const hx = 16 * Math.sin(a) ** 3, hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
        vx = hx * 0.022; vy = hy * 0.022;
      } else if (s.shape === 'star') {
        const k = i % 2 ? 0.45 : 1;
        vx = Math.cos(a) * 0.32 * k; vy = Math.sin(a) * 0.32 * k;
      } else {
        const sp = 0.22 + rng() * 0.14;
        vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
      }
      this.sparks.push({ x: s.x, y: s.y, vx, vy, c: i % 3 ? s.c : c2, life: 1.4 + rng() * 0.7, age: 0, r: 0.008 + rng() * 0.005, heart: s.shape === 'heart' && i % 4 === 0 });
    }
    this.onBurst?.(this.bursts++);
  }

  private draw() {
    const c = this.c;
    if (!c) return;
    const { g, cv } = c;
    const { W, H } = fit(cv);
    const S = Math.min(W, H * 1.4);
    g.clearRect(0, 0, W, H);
    // 밤하늘처럼 살짝 어둡게(시작·끝에 부드럽게)
    const fade = Math.min(1, this.t / 1.2, (FIREWORKS_SEC - this.t) / 1.2);
    g.fillStyle = `rgba(36,24,72,${0.42 * Math.max(0, fade)})`;
    g.fillRect(0, 0, W, H);
    const ox = (W - S) / 2;
    const P = (x: number, y: number): [number, number] => [ox + x * S, y * H];
    // 올라가는 껍질
    for (const s of this.shells) {
      const [x, y] = P(s.x, s.y);
      for (let k = 0; k < 5; k++) {
        g.fillStyle = hexA(s.c, 0.6 - k * 0.1);
        g.beginPath(); g.arc(x, y + k * S * 0.012, S * (0.007 - k * 0.001), 0, Math.PI * 2); g.fill();
      }
    }
    // 불꽃 알갱이
    g.globalCompositeOperation = 'lighter';
    for (const p of this.sparks) {
      const a = 1 - p.age / p.life;
      const [x, y] = P(p.x, p.y);
      g.globalAlpha = Math.max(0, a);
      g.fillStyle = p.c;
      if (p.heart) { heartPath(g, x, y, S * p.r * 1.6); g.fill(); }
      else { g.beginPath(); g.arc(x, y, S * p.r * (0.6 + a * 0.6), 0, Math.PI * 2); g.fill(); }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = Math.max(0, Math.min(1, this.t / 0.8, (FIREWORKS_SEC - this.t) / 0.8));
    // 제목(통통)
    const bounce = 1 + 0.06 * Math.sin(this.t * 4);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.round(S * 0.07 * bounce)}px ${FONT}`;
    g.lineWidth = S * 0.012; g.strokeStyle = '#4a2f5a'; g.fillStyle = '#fff2a8';
    g.strokeText(this.title, W / 2, H * 0.2); g.fillText(this.title, W / 2, H * 0.2);
    g.font = `${Math.round(S * 0.032)}px ${FONT}`;
    g.lineWidth = S * 0.008; g.fillStyle = '#ffffff';
    g.strokeText(this.sub, W / 2, H * 0.2 + S * 0.07); g.fillText(this.sub, W / 2, H * 0.2 + S * 0.07);
    if (this.t > 2) {
      g.font = `${Math.round(S * 0.022)}px ${FONT}`; g.fillStyle = 'rgba(255,248,232,0.85)';
      g.fillText('Esc 로 건너뛰기', W / 2, H * 0.94);
    }
    g.globalAlpha = 1;
  }
}

// ───────────── 색 도우미 ─────────────
function hexRgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexA(h: string, a: number) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`; }
function shade(h: string, k: number) {
  const [r, g, b] = hexRgb(h);
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
