// 캔버스로 그리는 텍스처: 얼굴(눈·볼터치·입), 옷 무늬, 접지 그림자, 감정 말풍선.
import * as THREE from 'three';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export function canvasTex(size: number, draw: (g: G, n: number) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 얼굴 좌표: 머리 반지름 기준 비율(x 오른쪽 +, y 위 +) → 캔버스 픽셀. 텍스처는 [-1,1]² 를 덮는다. */
const fx = (n: number, x: number) => (0.5 + x / 2) * n;
const fy = (n: number, y: number) => (0.5 - y / 2) * n;

export interface FaceSpec {
  skin: string;
  /** 눈 중심(x 는 양쪽 대칭), 반폭·반높이 — 전부 머리 반지름 비율 */
  eyeX: number; eyeY: number; eyeW: number; eyeH: number;
  /** 눈동자 색(아래쪽 반사 색) */
  iris: string;
  lashes?: boolean;
  brow?: { color: string; y: number; w: number };
  /** 볼터치(없으면 안 그린다 — art.ts addBlush 를 따로 붙이는 얼굴) */
  blush?: { x: number; y: number; w: number; h: number; color: string };
  /** false 면 눈을 안 그린다(art.ts addEyes 로 따로 붙이는 얼굴) */
  eyes?: boolean;
  /** 입: 'smile'(작게 벌린 웃음) | 'none'(주둥이에 따로 그림) */
  mouth: 'smile' | 'none';
  mouthY?: number;
  /** 작은 코 점 */
  nose?: { y: number; color: string };
  /** 바탕 위 무늬(펭귄 얼굴 가면·여우 볼 등) — 볼터치·눈보다 먼저 그린다 */
  paint?: (g: CanvasRenderingContext2D, n: number) => void;
}

function drawEyeOpen(g: G, cx: number, cy: number, w: number, h: number, iris: string, mirror: number, lashes: boolean) {
  // 눈동자: 위는 거의 검정, 아래로 갈수록 갈색 반사
  const grad = g.createLinearGradient(0, cy - h, 0, cy + h);
  grad.addColorStop(0, '#160e0d');
  grad.addColorStop(0.55, '#241614');
  grad.addColorStop(1, iris);
  g.fillStyle = grad;
  g.beginPath(); g.ellipse(cx, cy, w, h, 0, 0, TAU); g.fill();
  // 아래쪽 반달 반사(맑은 눈)
  g.save();
  g.globalAlpha = 0.55;
  g.fillStyle = iris;
  g.beginPath(); g.ellipse(cx, cy + h * 0.55, w * 0.62, h * 0.3, 0, 0, TAU); g.fill();
  g.restore();
  // 큰 하이라이트 + 작은 하이라이트
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(cx - w * 0.3 * mirror, cy - h * 0.36, w * 0.34, h * 0.24, -0.35 * mirror, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(cx + w * 0.34 * mirror, cy + h * 0.38, w * 0.14, h * 0.1, 0, 0, TAU); g.fill();
  if (lashes) {
    // 바깥 위 속눈썹 한 가닥
    g.strokeStyle = '#160e0d';
    g.lineCap = 'round';
    g.lineWidth = w * 0.22;
    g.beginPath();
    g.moveTo(cx + w * 0.75 * mirror, cy - h * 0.62);
    g.quadraticCurveTo(cx + w * 1.15 * mirror, cy - h * 0.8, cx + w * 1.3 * mirror, cy - h * 1.02);
    g.stroke();
  }
}

/** 잡혔을 때 '> <' 눈(GDD 7.2) — mirror 는 바깥쪽 방향(-1 왼눈) */
function drawEyeHappy(g: G, cx: number, cy: number, w: number, h: number, mirror: number) {
  g.strokeStyle = '#3d3a4a';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = w * 0.42;
  const ox = w * 0.75, oy = h * 0.55;
  g.beginPath();
  g.moveTo(cx + mirror * ox, cy - oy);
  g.lineTo(cx - mirror * ox * 0.55, cy);
  g.lineTo(cx + mirror * ox, cy + oy);
  g.stroke();
}

function drawEyeClosed(g: G, cx: number, cy: number, w: number, h: number) {
  // 감은 눈: 아래로 휜 부드러운 곡선
  g.strokeStyle = '#2a1a16';
  g.lineCap = 'round';
  g.lineWidth = w * 0.32;
  g.beginPath();
  g.ellipse(cx, cy + h * 0.05, w * 0.95, h * 0.42, 0, 0.12 * Math.PI, 0.88 * Math.PI);
  g.stroke();
}

/** 얼굴 표정: 뜬 눈 · 감은 눈 · '> <'(볼 0.8 로 진하게) */
export type FaceMode = 'open' | 'closed' | 'happy';

/** 얼굴 텍스처(배경 = 피부색). closed = 눈 감은 판(true) 또는 표정 이름 */
export function faceTexture(s: FaceSpec, closed: boolean | FaceMode, size = 1024): THREE.CanvasTexture {
  const mode: FaceMode = closed === true ? 'closed' : closed === false ? 'open' : closed;
  return canvasTex(size, (g, n) => {
    g.fillStyle = s.skin;
    g.fillRect(0, 0, n, n);
    s.paint?.(g, n);
    const sx = (v: number) => (v / 2) * n; // 길이 변환
    // 볼터치: 부드러운 원형 그라디언트('> <' 표정이면 진하고 조금 크게)
    for (const m of s.blush ? [-1, 1] : []) {
      const B = s.blush!;
      const hot = mode === 'happy';
      const cx = fx(n, m * B.x), cy = fy(n, B.y);
      g.save();
      g.translate(cx, cy);
      g.scale(1, B.h / B.w);
      const r = sx(B.w) * (hot ? 1.12 : 1);
      const col = hot ? '#ff8fae' : B.color;
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, col);
      rg.addColorStop(0.55, col + (hot ? 'e0' : 'b0'));
      rg.addColorStop(1, col + '00');
      g.fillStyle = rg;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.restore();
    }
    // 눈썹
    if (s.brow) {
      g.strokeStyle = s.brow.color;
      g.lineCap = 'round';
      g.lineWidth = sx(0.028);
      for (const m of [-1, 1]) {
        const cx = fx(n, m * s.eyeX), cy = fy(n, s.brow.y);
        const w = sx(s.brow.w);
        // 위로 둥근 대칭 아치(밝은 인상)
        g.beginPath();
        g.moveTo(cx - w, cy + w * 0.22);
        g.quadraticCurveTo(cx, cy - w * 0.45, cx + w, cy + w * 0.22);
        g.stroke();
      }
    }
    // 눈
    for (const m of s.eyes === false ? [] : [-1, 1]) {
      const cx = fx(n, m * s.eyeX), cy = fy(n, s.eyeY);
      const w = sx(s.eyeW), h = sx(s.eyeH);
      if (mode === 'closed') drawEyeClosed(g, cx, cy, w, h);
      else if (mode === 'happy') drawEyeHappy(g, cx, cy, w, h, m);
      else drawEyeOpen(g, cx, cy, w, h, s.iris, -m, !!s.lashes);
    }
    // 코
    if (s.nose) {
      g.fillStyle = s.nose.color;
      g.beginPath(); g.ellipse(fx(n, 0), fy(n, s.nose.y), sx(0.03), sx(0.02), 0, 0, TAU); g.fill();
    }
    // 입: 작게 벌린 웃음(D 모양)
    if (s.mouth === 'smile') {
      const cx = fx(n, 0), cy = fy(n, s.mouthY ?? -0.42);
      const w = sx(0.12), h = sx(0.095);
      g.fillStyle = '#7a2f2c';
      g.beginPath();
      g.moveTo(cx - w, cy);
      g.quadraticCurveTo(cx, cy - h * 0.18, cx + w, cy);
      g.quadraticCurveTo(cx + w * 0.8, cy + h * 1.15, cx, cy + h * 1.15);
      g.quadraticCurveTo(cx - w * 0.8, cy + h * 1.15, cx - w, cy);
      g.fill();
      // 혀
      g.save();
      g.clip();
      g.fillStyle = '#ff8f8a';
      g.beginPath(); g.ellipse(cx, cy + h * 1.15, w * 0.62, h * 0.55, 0, 0, TAU); g.fill();
      g.restore();
    }
  });
}

/** 주둥이 텍스처: ω 입 */
export function muzzleTexture(color: string, line: string, size = 512): THREE.CanvasTexture {
  return canvasTex(size, (g, n) => {
    g.fillStyle = color;
    g.fillRect(0, 0, n, n);
    g.strokeStyle = line;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = n * 0.035;
    const cx = n * 0.5, cy = n * 0.56, w = n * 0.12;
    // 코 아래 세로선 + ω
    g.beginPath();
    g.moveTo(cx, n * 0.44);
    g.lineTo(cx, cy);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - w * 2, cy - w * 0.25);
    g.quadraticCurveTo(cx - w, cy + w * 1.3, cx, cy);
    g.quadraticCurveTo(cx + w, cy + w * 1.3, cx + w * 2, cy - w * 0.25);
    g.stroke();
  });
}

/** 가로 줄무늬(회전체 v 방향) */
export function stripeTexture(a: string, b: string, count: number, size = 256): THREE.CanvasTexture {
  const t = canvasTex(size, (g, n) => {
    g.fillStyle = a;
    g.fillRect(0, 0, n, n);
    g.fillStyle = b;
    const h = n / count;
    for (let i = 0; i < count; i++) g.fillRect(0, i * h, n, h * 0.45);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 티셔츠: 바탕색 + 가슴에 작은 그림(앞 = u 0.5) */
export function teeTexture(base: string, mark: string, size = 512): THREE.CanvasTexture {
  return canvasTex(size, (g, n) => {
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    // 가슴 하트(회전체라 가로로 늘어나니 폭을 좁게)
    const cx = n * 0.5, cy = n * 0.42, s = n * 0.05;
    g.fillStyle = mark;
    g.beginPath();
    g.moveTo(cx, cy + s * 1.1);
    g.bezierCurveTo(cx - s * 1.6, cy, cx - s * 0.9, cy - s * 1.2, cx, cy - s * 0.4);
    g.bezierCurveTo(cx + s * 0.9, cy - s * 1.2, cx + s * 1.6, cy, cx, cy + s * 1.1);
    g.fill();
  });
}

/** 발밑 둥근 그림자(알파) */
export function blobTexture(size = 256): THREE.CanvasTexture {
  return canvasTex(size, (g, n) => {
    const r = n / 2;
    const rg = g.createRadialGradient(r, r, 0, r, r, r);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    rg.addColorStop(0.7, 'rgba(255,255,255,0.25)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, n, n);
  }, false);
}

/** 감정 말풍선: 흰 구름 + 꼬리 + 기호(♪ 또는 !) */
export type BubbleKind = 'note' | 'bang' | 'heart' | 'zzz' | 'question' | 'sweat' | 'sparkle';

export function bubbleTexture(kind: BubbleKind, size = 512): THREE.CanvasTexture {
  return canvasTex(size, (g, n) => {
    const cx = n * 0.5, cy = n * 0.44, r = n * 0.33;
    const path = () => {
      g.beginPath();
      // 몽글몽글한 원 여러 개를 합친 구름
      const bumps = 9;
      for (let i = 0; i < bumps; i++) {
        const a = (i / bumps) * TAU;
        g.moveTo(cx + Math.cos(a) * r * 0.78 + r * 0.24, cy + Math.sin(a) * r * 0.7);
        g.arc(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.7, r * 0.24, 0, TAU);
      }
      g.moveTo(cx + r * 0.8, cy);
      g.ellipse(cx, cy, r * 0.8, r * 0.72, 0, 0, TAU);
      // 꼬리 방울
      g.moveTo(cx - r * 0.25 + r * 0.13, cy + r * 1.08);
      g.arc(cx - r * 0.25, cy + r * 1.08, r * 0.13, 0, TAU);
      g.moveTo(cx - r * 0.45 + r * 0.07, cy + r * 1.32);
      g.arc(cx - r * 0.45, cy + r * 1.32, r * 0.07, 0, TAU);
    };
    // 그림자 + 테두리 느낌
    g.save();
    g.shadowColor = 'rgba(60,80,120,0.35)';
    g.shadowBlur = n * 0.03;
    g.shadowOffsetY = n * 0.012;
    g.fillStyle = '#ffffff';
    path(); g.fill('nonzero');
    g.restore();
    g.fillStyle = '#ffffff';
    path(); g.fill('nonzero');
    // 기호
    g.save();
    g.translate(cx, cy);
    if (kind === 'note') {
      g.fillStyle = '#ff7f9e';
      g.rotate(0.12);
      const s = r * 1.05;
      // 8분음표 두 개 이음(♫), 굵고 통통하게
      g.beginPath(); g.ellipse(-s * 0.3, s * 0.3, s * 0.2, s * 0.155, -0.45, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(s * 0.32, s * 0.2, s * 0.2, s * 0.155, -0.45, 0, TAU); g.fill();
      g.fillRect(-s * 0.15, -s * 0.4, s * 0.1, s * 0.7);
      g.fillRect(s * 0.47, -s * 0.5, s * 0.1, s * 0.7);
      g.beginPath();
      g.moveTo(-s * 0.15, -s * 0.4);
      g.lineTo(s * 0.57, -s * 0.52);
      g.lineTo(s * 0.57, -s * 0.3);
      g.lineTo(-s * 0.15, -s * 0.18);
      g.closePath(); g.fill();
    } else if (kind === 'heart') {
      g.fillStyle = '#ff6f91';
      const s = r * 0.42;
      g.beginPath();
      g.moveTo(0, s * 1.15);
      g.bezierCurveTo(-s * 1.7, 0, -s * 0.95, -s * 1.3, 0, -s * 0.45);
      g.bezierCurveTo(s * 0.95, -s * 1.3, s * 1.7, 0, 0, s * 1.15);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.ellipse(-s * 0.55, -s * 0.45, s * 0.22, s * 0.14, -0.6, 0, TAU); g.fill();
    } else if (kind === 'zzz' || kind === 'question' || kind === 'sparkle' || kind === 'sweat') {
      if (kind === 'sweat') {
        g.fillStyle = '#6fc3ff';
        const s = r * 0.5;
        g.beginPath();
        g.moveTo(0, -s);
        g.bezierCurveTo(s * 0.7, -s * 0.1, s * 0.75, s * 0.75, 0, s * 0.75);
        g.bezierCurveTo(-s * 0.75, s * 0.75, -s * 0.7, -s * 0.1, 0, -s);
        g.fill();
      } else if (kind === 'sparkle') {
        g.fillStyle = '#ffc93c';
        const star = (x: number, y: number, s: number) => {
          g.beginPath();
          g.moveTo(x, y - s);
          g.quadraticCurveTo(x, y, x + s, y);
          g.quadraticCurveTo(x, y, x, y + s);
          g.quadraticCurveTo(x, y, x - s, y);
          g.quadraticCurveTo(x, y, x, y - s);
          g.fill();
        };
        star(-r * 0.12, -r * 0.05, r * 0.42);
        star(r * 0.38, r * 0.28, r * 0.2);
      } else {
        g.fillStyle = kind === 'zzz' ? '#8a9cff' : '#ff9f43';
        g.font = `${Math.round(r * (kind === 'zzz' ? 0.62 : 1.0))}px Jua, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        if (kind === 'zzz') { g.fillText('Z', -r * 0.25, r * 0.12); g.font = `${Math.round(r * 0.45)}px Jua, sans-serif`; g.fillText('z', r * 0.22, -r * 0.12); g.fillText('z', r * 0.5, -r * 0.36); }
        else g.fillText('?', 0, r * 0.06);
      }
    } else {
      g.fillStyle = '#ff6b5e';
      const s = r * 0.8;
      g.beginPath();
      g.moveTo(-s * 0.13, -s * 0.5);
      g.lineTo(s * 0.13, -s * 0.5);
      g.lineTo(s * 0.06, s * 0.15);
      g.lineTo(-s * 0.06, s * 0.15);
      g.closePath(); g.fill();
      g.beginPath(); g.arc(0, s * 0.35, s * 0.1, 0, TAU); g.fill();
    }
    g.restore();
  });
}

/** 대화 말풍선: 둥근 흰 풍선 + 이름표 + 대사(줄바꿈) */
export function speechTexture(name: string, text: string, accent: string): THREE.CanvasTexture {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const font = (px: number) => `${px}px Jua, system-ui, sans-serif`;
  // 줄바꿈(글자 단위)
  g.font = font(64);
  const maxW = W * 0.84;
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    const t = cur + ch;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = ch.trimStart(); }
    else cur = t;
  }
  if (cur) lines.push(cur);
  const bx = 30, by = 70, bw = W - 60, bh = Math.min(H - 130, 64 + lines.length * 76);
  const rr = 70;
  g.save();
  g.shadowColor = 'rgba(80,60,40,0.3)';
  g.shadowBlur = 18;
  g.shadowOffsetY = 8;
  g.fillStyle = '#fffaf0';
  g.beginPath();
  g.roundRect(bx, by, bw, bh, rr);
  // 꼬리
  g.moveTo(W * 0.46, by + bh - 2);
  g.quadraticCurveTo(W * 0.5, by + bh + 50, W * 0.47, by + bh + 64);
  g.quadraticCurveTo(W * 0.56, by + bh + 30, W * 0.56, by + bh - 2);
  g.fill();
  g.restore();
  // 이름표
  g.font = font(48);
  const nw = g.measureText(name).width + 56;
  g.fillStyle = accent;
  g.beginPath(); g.roundRect(bx + 50, by - 42, nw, 70, 35); g.fill();
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  g.fillText(name, bx + 78, by - 6);
  // 대사
  g.font = font(64);
  g.fillStyle = '#4a3624';
  g.textAlign = 'center';
  lines.forEach((l, i) => g.fillText(l, W / 2, by + 70 + i * 76));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
