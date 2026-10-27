// 사진 꾸미기 그리기 — 액자·스티커·필름 알갱이를 2D 캔버스에 그린다.
// 미리보기(게임 화면 위 겹친 캔버스)와 저장 PNG 가 같은 함수를 써서, 보이는 그대로 저장된다.
// 색은 GDD 0.5 파스텔(새까만 색·회색 덩어리 금지). 글씨는 index.html 의 'Jua'.
import { applyMatrix, cssToMatrix, filterById, type FilterId, type FrameId, type PlacedSticker } from './logic';

type C2D = CanvasRenderingContext2D;
const FONT = "'Jua', system-ui, sans-serif";

/** 둥근 사각형 경로(fresh=false 면 지금 경로에 덧붙인다 — 구멍 뚫기용) */
function rrect(g: C2D, x: number, y: number, w: number, h: number, r: number, fresh = true) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  if (fresh) g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}
/** 바깥 사각형에서 안쪽 둥근 구멍을 뺀 테두리 채우기 */
function ring(g: C2D, w: number, h: number, inset: { l: number; t: number; r: number; b: number }, rad: number, fill: string | CanvasGradient) {
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  rrect(g, inset.l, inset.t, w - inset.l - inset.r, h - inset.t - inset.b, rad, false);
  g.fillStyle = fill;
  g.fill('evenodd');
  g.restore();
}
/** 하트 경로(가운데 cx, cy, 크기 s) */
function heart(g: C2D, cx: number, cy: number, s: number) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.35);
  g.bezierCurveTo(cx - s * 0.9, cy - s * 0.25, cx - s * 0.45, cy - s * 0.85, cx, cy - s * 0.4);
  g.bezierCurveTo(cx + s * 0.45, cy - s * 0.85, cx + s * 0.9, cy - s * 0.25, cx, cy + s * 0.35);
  g.closePath();
}
/** 별 경로 */
function star(g: C2D, cx: number, cy: number, r: number, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.48 : r, a = rot + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath();
}

/**
 * 액자 그리기. caption 은 폴라로이드·필름 아래 글씨(장소 · 시각).
 * 크기는 짧은 변 기준 비율이라 미리보기·원본 해상도 어디서나 같은 모양.
 */
export function drawFrame(g: C2D, w: number, h: number, frame: FrameId, caption = '') {
  const u = Math.min(w, h);
  if (frame === 'none') return;
  if (frame === 'polaroid') {
    const s = u * 0.045, b = u * 0.16;
    ring(g, w, h, { l: s, t: s, r: s, b }, u * 0.012, '#fffdf6');
    // 사진 둘레 얇은 그림자 선
    g.save();
    rrect(g, s, s, w - 2 * s, h - s - b, u * 0.012);
    g.strokeStyle = '#ead6ad'; g.lineWidth = Math.max(1, u * 0.004); g.stroke();
    g.restore();
    if (caption) {
      g.save();
      g.fillStyle = '#4a3b2a';
      g.font = `${Math.round(b * 0.34)}px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(caption, w / 2, h - b / 2, w - 4 * s);
      g.restore();
    }
    return;
  }
  if (frame === 'film') {
    const band = u * 0.11;
    ring(g, w, h, { l: u * 0.02, t: band, r: u * 0.02, b: band }, u * 0.006, '#5a4632');
    // 구멍(크림색 둥근 네모)
    const hw = band * 0.34, hh = band * 0.42, gap = hw * 1.9;
    g.save();
    g.fillStyle = '#fff3d6';
    for (let x = gap * 0.5; x < w - hw; x += gap) {
      rrect(g, x, band * 0.29, hw, hh, hw * 0.3); g.fill();
      rrect(g, x, h - band * 0.29 - hh, hw, hh, hw * 0.3); g.fill();
    }
    if (caption) {
      g.fillStyle = '#ffcf4a';
      g.font = `${Math.round(band * 0.22)}px ${FONT}`;
      g.textAlign = 'right'; g.textBaseline = 'bottom';
      g.fillText(caption, w - u * 0.03, h - band - u * 0.012, w * 0.7);
    }
    g.restore();
    return;
  }
  if (frame === 'heart') {
    const s = u * 0.05;
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#ffc2d4'); grd.addColorStop(1, '#ff9fb8');
    ring(g, w, h, { l: s, t: s, r: s, b: s }, u * 0.05, grd);
    g.save();
    // 테두리 위 작은 하트들 + 귀퉁이 큰 하트
    g.fillStyle = '#fff6f9';
    const n = Math.max(6, Math.round((w + h) / (u * 0.12)));
    const per = 2 * (w + h) / n;
    for (let i = 0; i < n; i++) {
      let d = i * per + per / 2, x: number, y: number;
      if (d < w) { x = d; y = s / 2; } else if ((d -= w) < h) { x = w - s / 2; y = d; } else if ((d -= h) < w) { x = w - d; y = h - s / 2; } else { d -= w; x = s / 2; y = h - d; }
      heart(g, x, y + s * 0.05, s * 0.42); g.fill();
    }
    g.fillStyle = '#ff7fa3';
    for (const [x, y] of [[s * 1.3, s * 1.4], [w - s * 1.3, s * 1.4], [s * 1.3, h - s * 1.0], [w - s * 1.3, h - s * 1.0]] as const) { heart(g, x, y, s * 1.3); g.fill(); }
    g.restore();
    return;
  }
  if (frame === 'cloud') {
    // 하늘색 테두리 + 안쪽으로 몽글몽글 구름 가장자리
    const s = u * 0.04;
    ring(g, w, h, { l: s, t: s, r: s, b: s }, 0, '#8fd3f4');
    g.save();
    g.fillStyle = '#fffdf6';
    const rr = u * 0.045, step = rr * 1.45;
    const bump = (x: number, y: number) => { g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); };
    for (let x = 0; x <= w + step; x += step) { bump(x, s); bump(x, h - s); }
    for (let y = 0; y <= h + step; y += step) { bump(s, y); bump(w - s, y); }
    g.fillStyle = '#8fd3f4';
    // 바깥 가장자리는 하늘색으로 다시 덮어 구름이 액자 안쪽에만 보이게
    g.fillRect(0, 0, w, s * 0.55); g.fillRect(0, h - s * 0.55, w, s * 0.55); g.fillRect(0, 0, s * 0.55, h); g.fillRect(w - s * 0.55, 0, s * 0.55, h);
    g.restore();
    return;
  }
  if (frame === 'star') {
    const s = u * 0.035;
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffe28a'); grd.addColorStop(1, '#ffcf4a');
    ring(g, w, h, { l: s, t: s, r: s, b: s }, u * 0.03, grd);
    g.save();
    g.fillStyle = '#fff8d6';
    const n = Math.max(8, Math.round((w + h) / (u * 0.09)));
    const per = 2 * (w + h) / n;
    for (let i = 0; i < n; i++) {
      let d = i * per + per / 2, x: number, y: number;
      if (d < w) { x = d; y = s / 2; } else if ((d -= w) < h) { x = w - s / 2; y = d; } else if ((d -= h) < w) { x = w - d; y = h - s / 2; } else { d -= w; x = s / 2; y = h - d; }
      star(g, x, y, s * (i % 2 ? 0.32 : 0.42), i * 0.4); g.fill();
    }
    g.restore();
  }
}

/** 스티커(이모지 글자) 그리기 — 흰 테두리를 둘러 붙인 느낌 */
export function drawStickers(g: C2D, w: number, h: number, list: readonly PlacedSticker[]) {
  const u = Math.min(w, h);
  for (const s of list) {
    const px = Math.round(s.s * u);
    g.save();
    g.translate(s.x * w, s.y * h);
    g.rotate(s.rot);
    g.font = `${px}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ffffff'; g.shadowBlur = Math.max(2, px * 0.12);
    g.fillText(s.e, 0, 0);
    g.shadowColor = '#6b4a2b55'; g.shadowBlur = px * 0.08; g.shadowOffsetY = px * 0.04;
    g.fillText(s.e, 0, 0);
    g.restore();
  }
}

/** 필름 알갱이 타일(결정적 — rng 로). 한 번 만들어 무늬로 깔아 쓴다 */
export function makeGrainTile(rng: () => number, size = 128): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rng() - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
/** 알갱이 겹치기(overlay 섞기 — 빈 캔버스에 그리면 그냥 무늬가 깔린다) */
export function drawGrain(g: C2D, w: number, h: number, tile: HTMLCanvasElement | null, strength: number) {
  if (!tile || strength <= 0) return;
  const pat = g.createPattern(tile, 'repeat');
  if (!pat) return;
  g.save();
  g.globalAlpha = Math.min(1, strength);
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  g.restore();
}

export interface ComposeOpts {
  filter: FilterId;
  frame: FrameId;
  stickers: readonly PlacedSticker[];
  caption: string;
  grainTile: HTMLCanvasElement | null;
  /** 결과 최대 긴 변(px) — 너무 큰 화면이면 줄인다 */
  maxSide?: number;
}

/** 방금 그린 게임 캔버스 → 필터·알갱이·액자·스티커를 입힌 새 캔버스(같은 작업 안에서 불러야 그림이 남아 있다) */
export function composePhoto(src: HTMLCanvasElement, o: ComposeOpts): HTMLCanvasElement {
  const max = o.maxSide ?? 2560;
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const g = out.getContext('2d')!;
  const f = filterById(o.filter);
  const native = f.css && 'filter' in g;
  if (native) g.filter = f.css;
  g.drawImage(src, 0, 0, w, h);
  if (native) g.filter = 'none';
  else if (f.css) {
    // ctx.filter 가 없는 브라우저: 같은 CSS 를 색 행렬로 바꿔 픽셀에 건다
    const img = g.getImageData(0, 0, w, h);
    applyMatrix(img.data, cssToMatrix(f.css));
    g.putImageData(img, 0, 0);
  }
  drawGrain(g, w, h, o.grainTile, f.grain);
  drawFrame(g, w, h, o.frame, o.caption);
  drawStickers(g, w, h, o.stickers);
  return out;
}

/** 작은 앨범 그림(data URL) */
export function thumbOf(c: HTMLCanvasElement, side = 220): string {
  const k = side / Math.max(c.width, c.height);
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(c.width * k)); t.height = Math.max(1, Math.round(c.height * k));
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
  try { return t.toDataURL('image/jpeg', 0.82); } catch { return t.toDataURL(); }
}

/** 캔버스 → PNG Blob */
export function toPng(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((res) => {
    try { c.toBlob((b) => res(b), 'image/png'); } catch (e) { console.error('[photo] toBlob', e); res(null); }
  });
}

/** 파일로 내려받기 */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
