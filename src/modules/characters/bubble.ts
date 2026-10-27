// 대화 말풍선(GDD 3.10-3: 동숲식 흰 둥근 말풍선 + 글자가 한 글자씩).
// 쪽(page)마다 줄바꿈·풍선 모양을 한 번 계산해 바탕을 따로 그려 두고, 글자가 늘 때는 바탕 복사 + 글자만 다시 쓴다.
// 줄바꿈은 다 친 문장 기준이라 치는 도중에 글자가 다음 줄로 튀지 않는다.
import * as THREE from 'three';
import { applyCurve } from '../../core/curve';
import { glyphs } from './dialog';

const W = 1024, H = 512;
const FONT = (px: number) => `${px}px Jua, system-ui, sans-serif`;
const TEXT_PX = 62, LINE_H = 74, NAME_PX = 46;
const GEO = new THREE.PlaneGeometry(2.3, 1.15);
GEO.userData.shared = true;

export class SpeechBubble {
  readonly mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private lines: string[][] = [];
  private page = '';
  private shown = -1;
  private textTop = 0;
  /** 이 쪽이 처음 보인 시각(톡 튀어나오기) */
  bornAt = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.bg = document.createElement('canvas');
    this.bg.width = W; this.bg.height = H;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(GEO, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, alphaTest: 0.02 }));
    this.mesh.renderOrder = 6;
    this.mesh.name = 'speech';
    applyCurve(this.mesh);
  }

  /** 쪽 바꾸기 + 앞 shown 글자만 보이게(같은 쪽이면 글자만 다시 쓴다) */
  set(name: string, accent: string, page: string, shown: number) {
    if (page !== this.page) { this.layout(name, accent, page); this.page = page; this.shown = -1; }
    const n = Math.max(0, Math.min(shown, this.lines.reduce((a, l) => a + l.length, 0)));
    if (n === this.shown) return;
    this.shown = n;
    const g = this.g;
    g.clearRect(0, 0, W, H);
    g.drawImage(this.bg, 0, 0);
    g.font = FONT(TEXT_PX);
    g.fillStyle = '#4a3624';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let left = n;
    this.lines.forEach((l, i) => {
      if (left <= 0) return;
      const full = l.join('');
      const part = l.slice(0, left).join('');
      left -= l.length;
      // 가운데 정렬은 다 친 줄 너비 기준(치는 동안 글자가 옆으로 밀리지 않게)
      const fw = g.measureText(full).width;
      g.textAlign = 'left';
      g.fillText(part, W / 2 - fw / 2, this.textTop + i * LINE_H);
    });
    this.tex.needsUpdate = true;
  }

  get pageText() { return this.page; }

  private layout(name: string, accent: string, page: string) {
    const g = this.g;
    g.font = FONT(TEXT_PX);
    const maxW = W * 0.84;
    const lines: string[][] = [];
    let cur: string[] = [];
    for (const ch of glyphs(page)) {
      const t = cur.join('') + ch;
      if (g.measureText(t).width > maxW && cur.length) {
        // 띄어쓰기에서 끊을 수 있으면 거기서
        const sp = cur.lastIndexOf(' ');
        if (sp > 0 && sp > cur.length - 7) { lines.push(cur.slice(0, sp)); cur = [...cur.slice(sp + 1), ch]; }
        else { lines.push(cur); cur = ch === ' ' ? [] : [ch]; }
      } else cur.push(ch);
    }
    if (cur.length) lines.push(cur);
    this.lines = lines.slice(0, 4);
    const b = this.bg.getContext('2d')!;
    b.clearRect(0, 0, W, H);
    const bx = 30, by = 70, bw = W - 60, bh = Math.min(H - 130, 70 + this.lines.length * LINE_H);
    b.save();
    b.shadowColor = 'rgba(80,60,40,0.3)';
    b.shadowBlur = 18;
    b.shadowOffsetY = 8;
    b.fillStyle = '#fffaf0';
    b.beginPath();
    b.roundRect(bx, by, bw, bh, 70);
    // 꼬리
    b.moveTo(W * 0.46, by + bh - 2);
    b.quadraticCurveTo(W * 0.5, by + bh + 50, W * 0.47, by + bh + 64);
    b.quadraticCurveTo(W * 0.56, by + bh + 30, W * 0.56, by + bh - 2);
    b.fill();
    b.restore();
    // 이름표
    b.font = FONT(NAME_PX);
    const nw = b.measureText(name).width + 56;
    b.fillStyle = accent;
    b.beginPath(); b.roundRect(bx + 50, by - 42, nw, 70, 35); b.fill();
    b.fillStyle = '#ffffff';
    b.textBaseline = 'middle';
    b.fillText(name, bx + 78, by - 6);
    this.textTop = by + 40 + LINE_H / 2 - 6;
  }

  dispose() {
    this.tex.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
