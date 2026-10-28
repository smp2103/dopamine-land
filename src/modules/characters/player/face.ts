// 플레이어 얼굴: 눈 상태 9 × 입 모양 7 을 따로 그려 아틀라스 두 장에 모아 두고, 얼굴 재질이 칸 번호만 바꿔 겹쳐 그린다.
// (표정을 처음 쓸 때 캔버스를 새로 만들지 않는다 — 로딩 때 한 번에, 같은 색 조합끼리는 모듈 전체가 나눠 쓴다.)
// 눈: 흰자 · 위가 진한 젤리 눈동자 · 홍채 테 · 아래 빛 고리 · 동공 · 반사광 2+1 · 눈꺼풀 그늘 · 윗속눈썹(살짝 삐침).
// 윤기 판(R)이 눈만 클리어코트 + 낮은 거칠기로 만들어 게임 조명에서도 반짝인다. 볼터치는 셰이더가 그린다(세기를 표정마다).
// 좌표: 얼굴 판 [-1, 1]² (x 오른쪽 +, y 위 +) = 머리 정면 투영 uv. 1 단위 = 512 px.
import * as THREE from 'three';

export const EYE_STATES = ['open', 'half', 'closed', 'smile', 'happy', 'wide', 'sad', 'sleepy', 'dizzy'] as const;
export type EyeState = (typeof EYE_STATES)[number];
export const MOUTHS = ['smile', 'grin', 'o', 'cat', 'wavy', 'chew', 'tiny'] as const;
export type Mouth = (typeof MOUTHS)[number];

export interface FacePal {
  skin: string;
  irisDark: string;
  irisLight: string;
  line: string;
  blush: string;
  freckles: boolean;
}

// 얼굴 배치
// 반짝 인형: 세로로 긴 큰 눈(높이 1.6배) · 얼굴 아래쪽 · 서로 가깝게, 입은 눈 바로 아래 작게
export const EX = 0.305, EY = -0.17, EW = 0.21, EH = 0.3;
export const MOUTH_Y = -0.555;
/** 볼터치 중심(눈 바로 아래 바깥) */
export const BLUSH_X = 0.53, BLUSH_Y = -0.55;
const PX = 512;
// 눈 띠·입 칸이 덮는 얼굴 판 범위
const EYE_R = { x0: -0.6, x1: 0.6, y0: -0.56, y1: 0.24 };
const MOUTH_R = { x0: -0.16, x1: 0.16, y0: -0.74, y1: -0.48 };
const ECW = Math.ceil((EYE_R.x1 - EYE_R.x0) * PX), ECH = Math.ceil((EYE_R.y1 - EYE_R.y0) * PX);
const MCW = Math.ceil((MOUTH_R.x1 - MOUTH_R.x0) * PX), MCH = Math.ceil((MOUTH_R.y1 - MOUTH_R.y0) * PX);
const E_COLS = 3, M_COLS = 4;
const EAW = 2048, EAH = 1280, MAW = 1024, MAH = 512;

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: G } {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}
function tex(c: HTMLCanvasElement, srgb: boolean, premul: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.premultiplyAlpha = premul;
  t.anisotropy = 8;
  t.userData.shared = true;
  return t;
}

/** 얼굴 판 좌표 → 칸 픽셀(칸 왼쪽 위 = (ox, oy)) */
function mapper(ox: number, oy: number, r: { x0: number; y1: number }, s = 1) {
  return {
    X: (x: number) => ox + (x - r.x0) * PX * s,
    Y: (y: number) => oy + (r.y1 - y) * PX * s,
    L: (d: number) => d * PX * s,
  };
}
type M = ReturnType<typeof mapper>;

// ───────────── 눈 ─────────────
function drawEyes(g: G, m: M, p: FacePal, st: EyeState, gloss: boolean) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const side of [-1, 1]) {
    const cx = m.X(side * EX), cy = m.Y(EY), w = m.L(EW), h = m.L(EH);
    // 감은 눈·웃는 눈 선은 눈 높이가 아니라 너비에 맞춘다(세로로 긴 눈이라 선이 너무 깊게 휘지 않게)
    const lh = w * 1.15, ly = cy + h * 0.18;
    switch (st) {
      case 'open': eyeOpen(g, p, cx, cy, w, h, side, 0, 1, gloss); break;
      case 'half': eyeOpen(g, p, cx, cy, w, h, side, 0, 0.5, gloss); break;
      case 'wide': eyeOpen(g, p, cx, cy - h * 0.04, w * 1.06, h * 1.06, side, 1, 1, gloss); break;
      case 'sad': eyeOpen(g, p, cx, cy, w, h, side, 2, 1, gloss); break;
      case 'sleepy': eyeOpen(g, p, cx, cy, w, h, side, 0, 0.34, gloss); break;
      case 'closed': if (!gloss) eyeLine(g, p, cx, ly + lh * 0.1, w, lh, 'down', side); break;
      case 'smile': if (!gloss) eyeLine(g, p, cx, ly, w, lh, 'up', side); break;
      case 'happy': if (!gloss) eyeHappy(g, p, cx, ly - lh * 0.05, w, lh, side); break;
      case 'dizzy': if (!gloss) eyeSwirl(g, p, cx, ly - lh * 0.1, w, lh); break;
    }
  }
}

/** 네 갈래 반짝 별(작은 반사광) */
function sparkle(g: G, x: number, y: number, r: number) {
  const k = r * 0.28;
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x + k, y - k, x + r, y);
  g.quadraticCurveTo(x + k, y + k, x, y + r);
  g.quadraticCurveTo(x - k, y + k, x - r, y);
  g.quadraticCurveTo(x - k, y - k, x, y - r);
  g.fill();
}

const mixHex = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

/** 뜬 눈. look: 0 보통 · 1 깜짝(동공 작게) · 2 시무룩 · open: 1 = 다 뜸, 작을수록 윗눈꺼풀이 내려온다 */
function eyeOpen(g: G, p: FacePal, cx: number, cy: number, w: number, h: number, out: number, look: 0 | 1 | 2, open: number, gloss: boolean) {
  const lid = cy - h + 2 * h * (1 - open);
  // 눈 테: 아래가 살짝 넓은 달걀(인형 눈) — 위는 조금 납작
  const eggPath = () => {
    g.beginPath();
    g.moveTo(cx, cy - h);
    g.bezierCurveTo(cx + w * 0.78, cy - h, cx + w * 1.02, cy - h * 0.42, cx + w, cy + h * 0.08);
    g.bezierCurveTo(cx + w * 0.98, cy + h * 0.66, cx + w * 0.6, cy + h, cx, cy + h);
    g.bezierCurveTo(cx - w * 0.6, cy + h, cx - w * 0.98, cy + h * 0.66, cx - w, cy + h * 0.08);
    g.bezierCurveTo(cx - w * 1.02, cy - h * 0.42, cx - w * 0.78, cy - h, cx, cy - h);
    g.closePath();
  };
  g.save();
  eggPath();
  g.clip();
  if (open < 1) { g.beginPath(); g.rect(cx - w * 1.3, lid, w * 2.6, h * 3); g.clip(); }
  if (look === 2) {
    g.beginPath();
    g.moveTo(cx - out * w * 1.3, cy - h * 0.7);
    g.lineTo(cx + out * w * 1.3, cy - h * 0.22);
    g.lineTo(cx + out * w * 1.3, cy + h * 1.3);
    g.lineTo(cx - out * w * 1.3, cy + h * 1.3);
    g.closePath();
    g.clip();
  }
  if (gloss) {
    g.fillStyle = '#ff0000';
    g.fillRect(cx - w * 1.2, cy - h * 1.2, w * 2.4, h * 2.4);
    g.restore();
    return;
  }
  g.fillStyle = '#fffaff';
  g.fillRect(cx - w * 1.2, cy - h * 1.2, w * 2.4, h * 2.4);
  // 홍채: 눈 거의 전부. 위는 진하게, 아래로 갈수록 밝은 색이 겹겹이(층진 그라데이션)
  const ix = cx - out * w * 0.03, iy = cy + h * (look === 2 ? 0.12 : 0.05);
  const iw = w * (look === 1 ? 0.74 : 0.9), ih = h * (look === 1 ? 0.8 : 0.95);
  const deep = mixHex(p.irisDark, '#0a0410', 0.35), mid = mixHex(p.irisDark, p.irisLight, 0.45), hi = mixHex(p.irisLight, '#ffffff', 0.35);
  const gr = g.createLinearGradient(0, iy - ih, 0, iy + ih);
  gr.addColorStop(0, deep);
  gr.addColorStop(0.32, p.irisDark);
  gr.addColorStop(0.62, mid);
  gr.addColorStop(0.86, p.irisLight);
  gr.addColorStop(1, hi);
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(ix, iy, iw, ih, 0, 0, TAU); g.fill();
  // 아래 젤리 빛(반달 모양으로 한 겹 더 밝게)
  const gl = g.createRadialGradient(ix, iy + ih * 0.78, 0, ix, iy + ih * 0.78, iw * 0.95);
  gl.addColorStop(0, 'rgba(255,255,255,0.5)');
  gl.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  g.beginPath(); g.ellipse(ix, iy + ih * 0.55, iw * 0.86, ih * 0.46, 0, 0, TAU); g.fill();
  // 동공(세로로 긴, 가장자리 부드럽게)
  const py = iy - ih * 0.1, pw = iw * (look === 1 ? 0.3 : 0.44), ph = ih * (look === 1 ? 0.34 : 0.52);
  const pg = g.createRadialGradient(ix, py, 0, ix, py, Math.max(pw, ph));
  pg.addColorStop(0, 'rgba(16,6,18,1)');
  pg.addColorStop(0.62, 'rgba(16,6,18,0.95)');
  pg.addColorStop(1, 'rgba(16,6,18,0)');
  g.fillStyle = pg;
  g.beginPath(); g.ellipse(ix, py, pw * 1.15, ph * 1.12, 0, 0, TAU); g.fill();
  // 홍채 테(얇게) + 안쪽 빛 고리(아래 반)
  g.strokeStyle = 'rgba(20,8,24,0.6)';
  g.lineWidth = w * 0.05;
  g.beginPath(); g.ellipse(ix, iy, iw, ih, 0, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = w * 0.035;
  g.beginPath(); g.ellipse(ix, iy, iw * 0.78, ih * 0.8, 0, Math.PI * 0.18, Math.PI * 0.82); g.stroke();
  // 윗눈꺼풀 그늘
  const lt = Math.max(lid, cy - h);
  const sg = g.createLinearGradient(0, lt, 0, lt + h * 0.5);
  sg.addColorStop(0, 'rgba(50,16,46,0.5)');
  sg.addColorStop(1, 'rgba(50,16,46,0)');
  g.fillStyle = sg;
  g.fillRect(cx - w * 1.2, cy - h * 1.2, w * 2.4, h * 2.4);
  // 반사광: 큰 흰 타원(바깥 위) · 반짝 별(안쪽 아래) · 작은 점(안쪽 위)
  g.fillStyle = '#ffffff';
  const hy = Math.max(iy - ih * 0.42, lid + h * 0.28);
  g.beginPath(); g.ellipse(ix + out * iw * 0.3, hy, iw * 0.36, ih * 0.25, out * 0.35, 0, TAU); g.fill();
  if (open > 0.6 || look === 1) sparkle(g, ix - out * iw * 0.34, iy + ih * 0.42, iw * 0.24);
  g.beginPath(); g.arc(ix - out * iw * 0.2, Math.max(iy - ih * 0.58, lid + h * 0.16), iw * 0.075, 0, TAU); g.fill();
  if (look === 2) {
    g.fillStyle = 'rgba(200,235,255,0.9)';
    g.beginPath(); g.ellipse(cx + out * w * 0.4, cy + h * 0.84, w * 0.22, h * 0.12, 0, 0, TAU); g.fill();
  }
  g.restore();

  // 윗눈선: 굵고 둥근 테(바깥 끝이 조금 더 굵게) + 바깥 삐침 하나
  g.strokeStyle = p.line;
  g.fillStyle = p.line;
  g.lineWidth = w * 0.26;
  g.beginPath();
  if (look === 2) {
    g.moveTo(cx - out * w * 0.98, cy - h * 0.66);
    g.quadraticCurveTo(cx, cy - h * 0.5, cx + out * w * 1.0, cy - h * 0.25);
  } else if (open < 1) {
    const yy = (lid - cy) / h;
    const half = Math.sqrt(Math.max(0, 1 - yy * yy)) * (yy > 0 ? 0.98 : 1);
    g.moveTo(cx - w * half * 1.02, lid + h * 0.03);
    g.quadraticCurveTo(cx, lid - h * 0.08, cx + w * half * 1.02, lid + h * 0.03);
  } else {
    g.moveTo(cx - out * w * 0.96, cy - h * 0.22);
    g.bezierCurveTo(cx - out * w * 0.9, cy - h * 1.06, cx + out * w * 0.74, cy - h * 1.1, cx + out * w * 1.0, cy - h * 0.3);
  }
  g.stroke();
  if (look !== 2) {
    // 바깥 끝 날개(눈선 끝이 살짝 굵어지며 위로 톡)
    const ox = cx + out * w * 0.98, oy = open < 1 ? lid + h * 0.04 : cy - h * 0.3;
    g.lineWidth = w * 0.16;
    g.beginPath(); g.moveTo(ox - out * w * 0.08, oy + h * 0.02); g.quadraticCurveTo(ox + out * w * 0.22, oy - h * 0.02, ox + out * w * 0.3, oy - h * 0.16); g.stroke();
  }
  // 아래 눈가: 아주 옅은 짧은 선(바깥쪽)
  g.strokeStyle = p.line + '55';
  g.lineWidth = w * 0.07;
  g.beginPath();
  g.ellipse(cx, cy, w * 0.94, h * 0.97, 0, Math.PI * (out > 0 ? 0.12 : 0.68), Math.PI * (out > 0 ? 0.32 : 0.88));
  g.stroke();
}

function eyeLine(g: G, p: FacePal, cx: number, cy: number, w: number, h: number, dir: 'up' | 'down', side: number) {
  g.strokeStyle = p.line;
  g.lineWidth = w * 0.24;
  g.beginPath();
  if (dir === 'down') {
    g.moveTo(cx - w * 0.95, cy - h * 0.08);
    g.quadraticCurveTo(cx, cy + h * 0.42, cx + w * 0.95, cy - h * 0.08);
    g.stroke();
    g.lineWidth = w * 0.13;
    const ox = cx + side * w * 0.82, oy = cy + h * 0.04;
    g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + side * w * 0.22, oy + h * 0.18); g.stroke();
  } else {
    g.moveTo(cx - w * 0.95, cy + h * 0.2);
    g.quadraticCurveTo(cx, cy - h * 0.6, cx + w * 0.95, cy + h * 0.2);
    g.stroke();
  }
}

function eyeHappy(g: G, p: FacePal, cx: number, cy: number, w: number, h: number, side: number) {
  g.strokeStyle = p.line;
  g.lineWidth = w * 0.28;
  const ox = w * 0.72, oy = h * 0.48;
  g.beginPath();
  g.moveTo(cx + side * ox, cy - oy);
  g.lineTo(cx - side * ox * 0.6, cy);
  g.lineTo(cx + side * ox, cy + oy);
  g.stroke();
}

function eyeSwirl(g: G, p: FacePal, cx: number, cy: number, w: number, h: number) {
  g.strokeStyle = p.line;
  g.lineWidth = w * 0.14;
  g.beginPath();
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * TAU * 2.4, r = i / 60;
    const x = cx + Math.cos(a) * w * r * 0.9, y = cy + Math.sin(a) * h * r * 0.75;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
}

// ───────────── 입 ─────────────
function drawMouth(g: G, m: M, p: FacePal, mo: Mouth) {
  // 반짝 인형: 입은 작게(옛 크기의 0.78)
  const mx = m.X(0), my = m.Y(MOUTH_Y), L = (d: number) => m.L(d);
  const dark = '#82304a', tongue = '#ff8c9e';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const open = (w: number, h: number) => {
    g.save();
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(mx - w, my);
    g.quadraticCurveTo(mx, my - h * 0.22, mx + w, my);
    g.bezierCurveTo(mx + w * 0.9, my + h * 0.9, mx + w * 0.4, my + h * 1.15, mx, my + h * 1.15);
    g.bezierCurveTo(mx - w * 0.4, my + h * 1.15, mx - w * 0.9, my + h * 0.9, mx - w, my);
    g.fill();
    g.clip();
    g.fillStyle = tongue;
    g.beginPath(); g.ellipse(mx, my + h * 1.15, w * 0.62, h * 0.55, 0, 0, TAU); g.fill();
    g.restore();
  };
  switch (mo) {
    case 'smile': open(L(0.095), L(0.075)); break;
    case 'grin': open(L(0.115), L(0.1)); break;
    case 'o':
      g.fillStyle = dark;
      g.beginPath(); g.ellipse(mx, my + L(0.03), L(0.048), L(0.062), 0, 0, TAU); g.fill();
      g.fillStyle = tongue;
      g.beginPath(); g.ellipse(mx, my + L(0.068), L(0.03), L(0.02), 0, 0, TAU); g.fill();
      break;
    case 'tiny':
      g.fillStyle = dark;
      g.beginPath(); g.ellipse(mx, my + L(0.02), L(0.026), L(0.028), 0, 0, TAU); g.fill();
      break;
    case 'wavy': {
      g.strokeStyle = dark;
      g.lineWidth = L(0.022);
      const w = L(0.085);
      g.beginPath();
      g.moveTo(mx - w, my + L(0.03));
      g.bezierCurveTo(mx - w * 0.5, my - L(0.02), mx - w * 0.2, my + L(0.05), mx, my + L(0.01));
      g.bezierCurveTo(mx + w * 0.2, my - L(0.03), mx + w * 0.5, my + L(0.05), mx + w, my + L(0.02));
      g.stroke();
      break;
    }
    case 'cat': case 'chew': {
      g.strokeStyle = dark;
      g.lineWidth = L(0.021);
      const w = L(mo === 'chew' ? 0.042 : 0.05);
      g.beginPath();
      g.moveTo(mx - w * 1.9, my - L(0.005));
      g.quadraticCurveTo(mx - w, my + w * 1.4, mx, my + L(0.005));
      g.quadraticCurveTo(mx + w, my + w * 1.4, mx + w * 1.9, my - L(0.005));
      g.stroke();
      if (mo === 'chew') {
        // 볼록한 볼 쪽 작은 음식 점
        g.fillStyle = '#ffffff';
        g.beginPath(); g.ellipse(mx + L(0.07), my - L(0.02), L(0.012), L(0.01), 0, 0, TAU); g.fill();
      }
      break;
    }
  }
  void p;
}

// ───────────── 바탕(피부 · 주근깨 · 볼 빗금) ─────────────
function drawBase(g: G, n: number, p: FacePal) {
  g.fillStyle = p.skin;
  g.fillRect(0, 0, n, n);
  const X = (x: number) => (0.5 + x / 2) * n, Y = (y: number) => (0.5 - y / 2) * n, L = (d: number) => (d / 2) * n;
  // 볼 빗금(흰 줄 세 개) — 볼터치 색은 셰이더가 깐다
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineCap = 'round';
  g.lineWidth = L(0.015);
  for (const m of [-1, 1]) {
    const cx = X(m * (BLUSH_X + 0.02)), cy = Y(BLUSH_Y + 0.01);
    for (let i = -1; i <= 1; i++) {
      const bx = cx + L(i * 0.05) + L(m * 0.01);
      g.beginPath(); g.moveTo(bx + L(0.017), cy - L(0.028)); g.lineTo(bx - L(0.011), cy + L(0.02)); g.stroke();
    }
    if (p.freckles) {
      g.fillStyle = 'rgba(190,110,84,0.55)';
      for (const [dx, dy, r] of [[-0.07, 0.07, 0.011], [-0.02, 0.09, 0.012], [0.03, 0.075, 0.01], [0.075, 0.095, 0.009]] as const) {
        g.beginPath(); g.arc(X(m * (BLUSH_X + dx)), Y(BLUSH_Y + 0.02 + dy * 0.8), L(r), 0, TAU); g.fill();
      }
    }
  }
  // 코는 그리지 않는다(반짝 인형: 눈·입·볼만)
}

// ───────────── 모아 굽기(색 조합마다 한 번 · 참조 세기로 해제) ─────────────
export interface FaceSet {
  base: THREE.CanvasTexture;
  eyes: THREE.CanvasTexture;
  mouths: THREE.CanvasTexture;
  gloss: THREE.CanvasTexture;
  /** 이 세트를 다 썼을 때 한 번 부른다(두 번 불러도 안전). 아무도 안 쓰면 GPU·캔버스를 비운다 */
  release: () => void;
}

/** 굽는 조각마다 따로 공유 — 피부만 바꾸면 2048 눈 판은 다시 굽지 않는다 */
interface Slot { texs: THREE.CanvasTexture[]; refs: number }
const pool = new Map<string, Slot>();
function acquire(key: string, make: () => THREE.CanvasTexture[]): THREE.CanvasTexture[] {
  let s = pool.get(key);
  if (!s) { s = { texs: make(), refs: 0 }; pool.set(key, s); }
  s.refs++;
  return s.texs;
}
function release(key: string) {
  const s = pool.get(key);
  if (!s || --s.refs > 0) return;
  pool.delete(key);
  for (const t of s.texs) {
    t.dispose();
    const c = t.image as HTMLCanvasElement | undefined;
    if (c && 'width' in c) { c.width = 0; c.height = 0; }
  }
}
/** 테스트·디버그용: 지금 살아 있는 굽기 조각 수 */
export function faceCacheSize(): number { return pool.size; }

export function faceSet(p: FacePal): FaceSet {
  const kb = `b|${p.skin}|${p.freckles}`, ke = `e|${p.irisDark}|${p.irisLight}|${p.line}`, km = 'm';
  const [base] = acquire(kb, () => {
    const b = canvas(512, 512);
    drawBase(b.g, 512, p);
    return [tex(b.c, true, false)];
  });
  const [eyes, gloss] = acquire(ke, () => {
    const e = canvas(EAW, EAH), gl = canvas(EAW / 2, EAH / 2);
    EYE_STATES.forEach((st, i) => {
      const col = i % E_COLS, row = Math.floor(i / E_COLS);
      drawEyes(e.g, mapper(col * ECW, row * ECH, EYE_R), p, st, false);
      drawEyes(gl.g, mapper((col * ECW) / 2, (row * ECH) / 2, EYE_R, 0.5), p, st, true);
    });
    return [tex(e.c, true, true), tex(gl.c, false, true)];
  });
  // 입은 색과 상관없어서 모두가 한 장을 같이 쓴다
  const [mouths] = acquire(km, () => {
    const mo = canvas(MAW, MAH);
    MOUTHS.forEach((m, i) => drawMouth(mo.g, mapper((i % M_COLS) * MCW, Math.floor(i / M_COLS) * MCH, MOUTH_R), p, m));
    return [tex(mo.c, true, true)];
  });
  let live = true;
  return {
    base, eyes, mouths, gloss,
    release() {
      if (!live) return;
      live = false;
      release(kb); release(ke); release(km);
    },
  };
}

// ───────────── 얼굴 재질 ─────────────
export interface FaceMat {
  mat: THREE.MeshPhysicalMaterial;
  set: (eyes: EyeState, mouth: Mouth) => void;
  /** 볼터치 세기(0.6 보통 ~ 1.3 진하게) */
  blush: (k: number) => void;
}

export function faceMaterial(fs: FaceSet, p: { rim: string; blush: string }, boost: { value: number }): FaceMat {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', map: fs.base, roughness: 0.62, sheen: 0.45, sheenRoughness: 0.6, sheenColor: new THREE.Color('#fff0e8'),
    clearcoat: 1, clearcoatRoughness: 0.06, emissive: '#ffffff', emissiveIntensity: 1,
  });
  const u = {
    uEyes: { value: fs.eyes }, uMouths: { value: fs.mouths }, uGloss: { value: fs.gloss },
    uEyeCell: { value: new THREE.Vector2(0, 0) }, uMouthCell: { value: new THREE.Vector2(0, 0) },
    uBlush: { value: 0.75 }, uBlushCol: { value: new THREE.Color(p.blush) }, uRim: { value: new THREE.Color(p.rim) }, uBoost: boost,
  };
  const f = (v: number) => v.toFixed(5);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `uniform sampler2D uEyes; uniform sampler2D uMouths; uniform sampler2D uGloss;
uniform vec2 uEyeCell; uniform vec2 uMouthCell; uniform float uBlush; uniform vec3 uBlushCol; uniform vec3 uRim; uniform float uBoost;
vec4 cellTex(sampler2D t, vec2 F, vec4 r, vec2 cell, vec2 csz, vec2 asz, out float inside) {
  vec2 e = (F - r.xy) / (r.zw - r.xy);
  inside = step(0.0, e.x) * step(e.x, 1.0) * step(0.0, e.y) * step(e.y, 1.0);
  vec2 px = cell * csz + vec2(e.x, 1.0 - e.y) * csz;
  return texture2D(t, vec2(px.x / asz.x, 1.0 - px.y / asz.y)) * inside;
}
void main() {
  float faceGloss = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec2 F = vMapUv * 2.0 - 1.0;
    // 볼터치: 부드러운 타원 두 개
    for (int i = 0; i < 2; i++) {
      vec2 c = vec2(i == 0 ? -${f(BLUSH_X)} : ${f(BLUSH_X)}, ${f(BLUSH_Y)});
      vec2 d = (F - c) / vec2(0.17, 0.1);
      float b = exp(-dot(d, d) * 1.5) * uBlush * 1.25;
      diffuseColor.rgb = mix(diffuseColor.rgb, uBlushCol, clamp(b, 0.0, 0.85));
    }
    float ie, im, ig;
    vec4 ec = cellTex(uEyes, F, vec4(${f(EYE_R.x0)}, ${f(EYE_R.y0)}, ${f(EYE_R.x1)}, ${f(EYE_R.y1)}), uEyeCell, vec2(${ECW}.0, ${ECH}.0), vec2(${EAW}.0, ${EAH}.0), ie);
    diffuseColor.rgb = diffuseColor.rgb * (1.0 - ec.a) + ec.rgb;
    vec4 mc = cellTex(uMouths, F, vec4(${f(MOUTH_R.x0)}, ${f(MOUTH_R.y0)}, ${f(MOUTH_R.x1)}, ${f(MOUTH_R.y1)}), uMouthCell, vec2(${MCW}.0, ${MCH}.0), vec2(${MAW}.0, ${MAH}.0), im);
    diffuseColor.rgb = diffuseColor.rgb * (1.0 - mc.a) + mc.rgb;
    vec4 gc = cellTex(uGloss, F, vec4(${f(EYE_R.x0)}, ${f(EYE_R.y0)}, ${f(EYE_R.x1)}, ${f(EYE_R.y1)}), uEyeCell, vec2(${f(ECW / 2)}, ${f(ECH / 2)}), vec2(${f(EAW / 2)}, ${f(EAH / 2)}), ig);
    faceGloss = clamp(gc.r, 0.0, 1.0);
  }`)
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vec3(0.0);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance = diffuseColor.rgb * mix(0.2, 0.06, faceGloss) * uBoost;
  {
    float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
    totalEmissiveRadiance += uRim * 0.3 * pow(1.0 - ndv, 2.4);
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.1, faceGloss);')
      .replace('material.clearcoat = clearcoat;', 'material.clearcoat = clearcoat * faceGloss;')
      .replace('material.sheenColor = sheenColor;', 'material.sheenColor = sheenColor * (1.0 - faceGloss);');
  };
  m.customProgramCacheKey = () => 'pl-face-v3';
  const cellOf = (i: number, cols: number, v: THREE.Vector2) => v.set(i % cols, Math.floor(i / cols));
  return {
    mat: m,
    set(eyes, mouth) {
      cellOf(EYE_STATES.indexOf(eyes), E_COLS, u.uEyeCell.value);
      cellOf(MOUTHS.indexOf(mouth), M_COLS, u.uMouthCell.value);
    },
    blush(k) { u.uBlush.value = k; },
  };
}
