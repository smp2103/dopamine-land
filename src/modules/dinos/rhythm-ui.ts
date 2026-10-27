// 나팔이 리듬 놀이 화면(DOM) — 음악 상자 음표 ♪ 가 세 줄로 내려오고, 아래 건반 줄에 닿을 때 A·S·D(←↓→)를 누른다.
// 채점·악보는 p1logic(순수). 여기는 그리기만: 음표 풀(재사용 div) · 판정 글씨 팡 · 점수·콤보.
import type { Note, Judge, RhythmScore } from './p1logic';
import { LANES } from './p1logic';

const CSS = `
.dl-rhy { position:fixed; left:50%; bottom:86px; transform:translateX(-50%) scale(var(--k,1)); transform-origin:50% 100%; width:312px; height:400px; z-index:40;
  background:#fff8e8; border-radius:28px; box-shadow:0 10px 0 #f1e2c4, 0 18px 40px #0003; font-family:Jua, sans-serif; color:#4a3b2a; user-select:none; pointer-events:none; overflow:hidden; }
.dl-rhy .hd { position:absolute; left:0; right:0; top:10px; text-align:center; font-size:22px; }
.dl-rhy .sc { position:absolute; right:16px; top:40px; font-size:16px; opacity:.85; }
.dl-rhy .cb { position:absolute; left:16px; top:40px; font-size:16px; color:#ff8aa8; }
.dl-rhy .field { position:absolute; left:16px; right:16px; top:66px; bottom:16px; border-radius:20px; overflow:hidden; background:#fffdf6; box-shadow: inset 0 3px 0 #f1e2c4; }
.dl-rhy .lane { position:absolute; top:0; bottom:0; width:33.333%; }
.dl-rhy .lane.l0 { left:0; background:linear-gradient(#e9fbf3, #c9f2e2); }
.dl-rhy .lane.l1 { left:33.333%; background:linear-gradient(#fffbe6, #ffefb0); }
.dl-rhy .lane.l2 { left:66.666%; background:linear-gradient(#fff0f5, #ffd3e1); }
.dl-rhy .lane.hit { filter:brightness(1.08) saturate(1.3); }
.dl-rhy .line { position:absolute; left:6px; right:6px; bottom:58px; height:6px; border-radius:6px; background:#ffd36b; box-shadow:0 0 12px #ffd36b; }
.dl-rhy .key { position:absolute; bottom:12px; width:33.333%; text-align:center; font-size:18px; }
.dl-rhy .key b { display:inline-block; min-width:54px; padding:4px 0 6px; border-radius:14px; background:#fff; box-shadow:0 4px 0 #e6d4b4; }
.dl-rhy .key.on b { transform:translateY(3px); box-shadow:0 1px 0 #e6d4b4; background:#fff3c4; }
.dl-rhy .note { position:absolute; width:52px; height:52px; margin-left:-26px; margin-top:-26px; border-radius:50%; display:grid; place-items:center; font-size:30px; color:#fff;
  box-shadow:0 4px 0 #0001, inset 0 -5px 0 #0002; text-shadow:0 2px 0 #0002; }
.dl-rhy .note.n0 { background:#7fd8b9; } .dl-rhy .note.n1 { background:#ffc94a; } .dl-rhy .note.n2 { background:#ff9fb8; }
.dl-rhy .jd { position:absolute; left:0; right:0; bottom:120px; text-align:center; font-size:34px; opacity:0; transition:none; text-shadow:0 3px 0 #fff; }
.dl-rhy .jd.go { animation: dlrhy-pop .55s ease-out; }
@keyframes dlrhy-pop { 0% { opacity:0; transform:scale(.6); } 25% { opacity:1; transform:scale(1.15); } 100% { opacity:0; transform:translateY(-26px) scale(1); } }
.dl-rhy .tip { position:absolute; left:0; right:0; top:50%; text-align:center; font-size:20px; opacity:.8; }
`;

/** 음표가 떨어지는 빠르기(px/초) */
const SPEED = 150;
const JUDGE_TEXT: Record<Judge, [string, string]> = { perfect: ['완벽! ✨', '#ff8a3d'], good: ['좋아! ♪', '#45b07a'], miss: ['앗…', '#9a8a78'] };

export class RhythmUI {
  private el: HTMLDivElement | null = null;
  private field!: HTMLDivElement;
  private lanes: HTMLDivElement[] = [];
  private keys: HTMLDivElement[] = [];
  private pool: HTMLDivElement[] = [];
  private jd!: HTMLDivElement;
  private sc!: HTMLDivElement;
  private cb!: HTMLDivElement;
  private tip!: HTMLDivElement;
  private flash = [0, 0, 0];

  open(title: string) {
    if (typeof document === 'undefined') return;
    this.close();
    if (!document.getElementById('dl-rhy-css')) {
      const st = document.createElement('style');
      st.id = 'dl-rhy-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'dl-rhy';
    // 작은 화면에서도 다 보이게
    const k = Math.min(1, (window.innerHeight - 120) / 400);
    el.style.setProperty('--k', String(Math.max(0.6, k)));
    el.innerHTML = `<div class="hd">${title}</div><div class="cb"></div><div class="sc">0점</div><div class="field"></div>`;
    this.field = el.querySelector('.field') as HTMLDivElement;
    this.sc = el.querySelector('.sc') as HTMLDivElement;
    this.cb = el.querySelector('.cb') as HTMLDivElement;
    this.lanes = []; this.keys = []; this.pool = [];
    const caps = ['A ←', 'S ↓', 'D →'];
    for (let i = 0; i < LANES; i++) {
      const l = document.createElement('div'); l.className = `lane l${i}`; this.field.appendChild(l); this.lanes.push(l);
    }
    const line = document.createElement('div'); line.className = 'line'; this.field.appendChild(line);
    for (let i = 0; i < LANES; i++) {
      const k2 = document.createElement('div'); k2.className = 'key'; k2.style.left = `${(i * 100) / LANES}%`; k2.innerHTML = `<b>${caps[i]}</b>`;
      this.field.appendChild(k2); this.keys.push(k2);
    }
    this.jd = document.createElement('div'); this.jd.className = 'jd'; this.field.appendChild(this.jd);
    this.tip = document.createElement('div'); this.tip.className = 'tip'; this.tip.textContent = '♪ 가 노란 줄에 닿으면 꾹!'; this.field.appendChild(this.tip);
    document.body.appendChild(el);
    this.el = el;
  }

  get isOpen() { return !!this.el; }

  /** 매 프레임: time = 시작 뒤 지난 초 */
  draw(notes: readonly Note[], time: number, s: RhythmScore, dt: number) {
    if (!this.el) return;
    const H = this.field.clientHeight || 318, W = this.field.clientWidth || 280;
    const hitY = H - 61;
    let used = 0;
    for (const n of notes) {
      const ahead = n.t - time;
      if (n.hit || ahead > hitY / SPEED + 0.2 || ahead < -0.25) continue;
      let d = this.pool[used];
      if (!d) { d = document.createElement('div'); d.textContent = '♪'; this.field.appendChild(d); this.pool.push(d); }
      d.className = `note n${n.lane}`;
      d.style.display = '';
      d.style.left = `${((n.lane + 0.5) * W) / LANES}px`;
      d.style.top = `${hitY - ahead * SPEED}px`;
      used++;
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].style.display = 'none';
    this.sc.textContent = `${s.score.toLocaleString()}점`;
    this.cb.textContent = s.combo >= 3 ? `${s.combo} 콤보!` : '';
    this.tip.style.display = time < 1.6 ? '' : 'none';
    for (let i = 0; i < LANES; i++) {
      this.flash[i] = Math.max(0, this.flash[i] - dt);
      const on = this.flash[i] > 0;
      this.lanes[i].classList.toggle('hit', on);
      this.keys[i].classList.toggle('on', on);
    }
  }

  press(lane: number) { this.flash[lane] = 0.12; }

  showJudge(j: Judge) {
    if (!this.el) return;
    const [t, c] = JUDGE_TEXT[j];
    this.jd.textContent = t;
    this.jd.style.color = c;
    this.jd.classList.remove('go');
    void this.jd.offsetWidth;   // 애니메이션 다시 시작
    this.jd.classList.add('go');
  }

  close() {
    this.el?.remove();
    this.el = null;
  }
}
