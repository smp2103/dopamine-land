// 동물 얼굴: 머리(주둥이) 곡면에서 눈·입 자리만 오려 낸 얇은 '얼굴 조각'에 그림을 붙인다.
// - 눈: 말랑(플레이어)과 같은 그림체 — 흰자 · 위 진하고 아래 밝은 눈동자 · 동공 · 반사광 2+1 · 굵은 윗속눈썹(바깥 삐침) ·
//   옅은 눈썹 · 볼터치(빗금 셋). 표정마다 텍스처 한 장(처음 쓸 때 만들고 모든 주민이 같이 쓴다).
// - 입: ω · ◡ · 벌린 입(말할 때 뻐끔) · 'o' · 물결 — 역시 공용.
// 텍스처는 털색과 무관(투명 바탕)이라 같은 눈동자 색이면 주민 수십이 한 장을 같이 쓴다 → 메모리·업로드 절약.
// DOM 이 없으면(노드 테스트) 1px 투명 텍스처로 대신한다.
import * as THREE from 'three';

export type EyeMode = 'open' | 'blink' | 'smile' | 'happy' | 'surprised' | 'sad';
export type MouthMode = 'w' | 'smile' | 'open' | 'grin' | 'o' | 'wavy' | 'none';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

/** 캔버스 그림 텍스처(DOM 이 없으면 1px 투명) */
export function paintTex(w: number, h: number, draw: (g: G) => void): THREE.Texture {
  return tex(w, h, draw);
}
function tex(w: number, h: number, draw: (g: G) => void): THREE.Texture {
  let t: THREE.Texture | null = null;
  if (hasDom()) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (g) { draw(g); t = new THREE.CanvasTexture(c); }
  }
  if (!t) { t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); t.needsUpdate = true; }
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.userData.shared = true;
  return t;
}

// ── 눈 칸 배치: 눈 반폭(ew)·반높이(eh) 단위로 눈 중심에서 안쪽 L · 바깥 R · 위 T · 아래 B 까지 ──
export const EYE_BOX = { L: 1.5, R: 2.55, T: 1.75, B: 1.85 };
const EYE_PX = 384;

export interface EyeStyle {
  /** 눈동자 색(아래쪽 밝은 반사 쪽으로 쓴다) */
  iris: string;
  /** 긴 속눈썹(세 가닥) */
  lashes?: boolean;
  /** 볼터치 색(없으면 기본 분홍) */
  blush?: string;
  /** 볼터치 끄기(부엉이 얼굴판처럼 그림이 따로 있을 때) */
  noBlush?: boolean;
  /** 졸린 윗눈꺼풀 색(털색 — 낙타처럼 눈 위를 반쯤 덮는다) */
  lid?: string;
}

const LINE = '#3a1f2c';
const eyeCache = new Map<string, THREE.Texture>();

function irisPair(iris: string): { dark: string; light: string } {
  const c = new THREE.Color(iris);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // 어두운 갈색 눈도 아래 반사는 맑은 호박색으로(젤리처럼 비치게)
  const light = new THREE.Color().setHSL(hsl.h, Math.min(1, 0.45 + hsl.s * 0.6), Math.max(0.5, Math.min(0.68, hsl.l + 0.42)));
  const dark = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.8 + 0.1), Math.min(0.16, hsl.l * 0.6 + 0.05));
  return { dark: '#' + dark.getHexString(), light: '#' + light.getHexString() };
}

/** 눈 한쪽 칸 텍스처(바깥쪽 = 오른쪽 +u). 왼눈은 UV 를 뒤집어 쓴다. */
export function eyeTexture(st: EyeStyle, mode: EyeMode): THREE.Texture {
  const key = `${st.iris}|${st.lashes ? 1 : 0}|${st.blush ?? ''}|${st.noBlush ? 1 : 0}|${st.lid ?? ''}|${mode}`;
  let t = eyeCache.get(key);
  if (t) return t;
  const { L, R, T, B } = EYE_BOX;
  const n = EYE_PX;
  const w = n / (L + R), h = n / (T + B);
  const cx = L * w, cy = T * h;
  const ip = irisPair(st.iris);
  t = tex(n, n, (g) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    // 볼터치(바깥 아래): 부드러운 타원 + 하얀 빗금 셋
    if (!st.noBlush) {
      const bc = new THREE.Color(st.blush ?? '#ff8fa8');
      const rgba = (a: number) => `rgba(${Math.round(bc.r * 255)},${Math.round(bc.g * 255)},${Math.round(bc.b * 255)},${a})`;
      const hot = mode === 'happy' || mode === 'smile';
      const bx = cx + w * 1.02, by = cy + h * 1.28;
      g.save(); g.translate(bx, by); g.scale(1, 0.56);
      const r = w * (hot ? 1.05 : 0.95);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, rgba(hot ? 0.95 : 0.78)); rg.addColorStop(0.55, rgba(hot ? 0.6 : 0.42)); rg.addColorStop(1, rgba(0));
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = w * 0.09;
      for (let i = -1; i <= 1; i++) {
        const x = bx + i * w * 0.3;
        g.beginPath(); g.moveTo(x + w * 0.1, by - h * 0.16); g.lineTo(x - w * 0.07, by + h * 0.12); g.stroke();
      }
    }
    // 눈썹: 짧고 통통한 둥근 획(털 위에 반투명 — 어떤 털색이든 한 톤 진하게 보인다)
    g.strokeStyle = 'rgba(70,34,40,0.5)';
    g.lineWidth = w * 0.2;
    {
      const by = cy - h * (mode === 'surprised' ? 1.5 : 1.32);
      const bw = w * 0.52;
      const tilt = mode === 'sad' ? -1 : mode === 'smile' || mode === 'happy' ? 0.35 : 0.15;
      g.beginPath();
      g.moveTo(cx - bw, by + (mode === 'sad' ? -h * 0.18 : h * 0.06));
      g.quadraticCurveTo(cx, by - h * 0.17, cx + bw, by + h * (0.1 + 0.12 * tilt) + (mode === 'sad' ? h * 0.2 : 0));
      g.stroke();
    }
    switch (mode) {
      case 'open': eyeOpen(g, ip, cx, cy, w, h, 0, !!st.lashes, st.lid); break;
      case 'surprised': eyeOpen(g, ip, cx, cy - h * 0.04, w * 1.04, h * 1.08, 1, !!st.lashes); break;
      case 'sad': eyeOpen(g, ip, cx, cy, w, h, 2, !!st.lashes, st.lid); break;
      case 'blink': eyeLine(g, cx, cy + h * 0.22, w, h, 'down', !!st.lashes); break;
      case 'smile': eyeLine(g, cx, cy + h * 0.12, w, h, 'up', !!st.lashes); break;
      case 'happy': eyeHappy(g, cx, cy, w, h); break;
    }
  });
  eyeCache.set(key, t);
  return t;
}

/** 뜬 눈. look: 0 보통 · 1 깜짝(동공 작게) · 2 시무룩(윗눈꺼풀 처짐) */
function eyeOpen(g: G, ip: { dark: string; light: string }, cx: number, cy: number, w: number, h: number, look: 0 | 1 | 2, lashes: boolean, lid?: string) {
  g.save();
  // 시무룩: 윗꺼풀 선 아래만 그린다(안쪽 높고 바깥 낮게)
  if (look === 2) {
    g.beginPath();
    g.moveTo(cx - w * 1.3, cy - h * 0.15); g.lineTo(cx + w * 1.3, cy - h * 0.55);
    g.lineTo(cx + w * 1.3, cy + h * 1.3); g.lineTo(cx - w * 1.3, cy + h * 1.3); g.closePath();
    g.clip();
  }
  // 흰자
  g.fillStyle = '#fffaff';
  g.beginPath(); g.ellipse(cx, cy, w, h, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(cx, cy, w, h, 0, 0, TAU); g.clip();
  // 눈동자(살짝 안쪽 — 귀엽게 몰린 시선)
  const ix = cx - w * 0.07, iy = cy + h * (look === 2 ? 0.14 : 0.05);
  const iw = w * (look === 1 ? 0.7 : 0.9), ih = h * (look === 1 ? 0.78 : 0.95);
  const gr = g.createLinearGradient(0, iy - ih, 0, iy + ih);
  gr.addColorStop(0, ip.dark); gr.addColorStop(0.5, ip.dark); gr.addColorStop(1, ip.light);
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(ix, iy, iw, ih, 0, 0, TAU); g.fill();
  // 아래쪽 반달 반사(젤리처럼 비치는 빛)
  const gl = g.createRadialGradient(ix, iy + ih * 0.7, 0, ix, iy + ih * 0.7, iw * 0.95);
  gl.addColorStop(0, 'rgba(255,236,214,0.75)'); gl.addColorStop(1, 'rgba(255,236,214,0)');
  g.fillStyle = gl;
  g.beginPath(); g.ellipse(ix, iy + ih * 0.55, iw * 0.8, ih * 0.42, 0, 0, TAU); g.fill();
  // 동공
  g.fillStyle = '#140a12';
  g.beginPath(); g.ellipse(ix, iy - ih * 0.06, iw * (look === 1 ? 0.3 : 0.44), ih * (look === 1 ? 0.34 : 0.5), 0, 0, TAU); g.fill();
  // 눈동자 테
  g.strokeStyle = 'rgba(20,10,18,0.45)'; g.lineWidth = w * 0.07;
  g.beginPath(); g.ellipse(ix, iy, iw, ih, 0, 0, TAU); g.stroke();
  // 반사광: 큰 것(바깥 위) + 작은 것(안쪽 아래) + 점
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(ix + iw * 0.34, iy - ih * 0.4, iw * 0.36, ih * 0.29, 0.5, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(ix - iw * 0.36, iy + ih * 0.42, iw * 0.16, ih * 0.13, 0, 0, TAU); g.fill();
  g.beginPath(); g.arc(ix - iw * 0.06, iy - ih * 0.64, iw * 0.08, 0, TAU); g.fill();
  // 졸린 윗눈꺼풀(털색): 눈 위 1/3 을 덮고, 꺼풀 끝선이 속눈썹 자리
  const lidY = (x: number) => cy - h * 0.3 + h * 0.12 * ((x - cx) / w) ** 2;
  if (lid && look !== 2) {
    g.fillStyle = lid;
    g.beginPath(); g.moveTo(cx - w * 1.2, cy - h * 1.2);
    for (let i = 0; i <= 12; i++) { const x = cx - w * 1.1 + (i / 12) * w * 2.2; g.lineTo(x, lidY(x)); }
    g.lineTo(cx + w * 1.2, cy - h * 1.2); g.closePath(); g.fill();
  }
  g.restore();
  // 윗속눈썹: 굵은 선 + 바깥 끝 삐침
  g.strokeStyle = LINE; g.fillStyle = LINE;
  g.lineWidth = w * 0.26;
  g.beginPath();
  if (lid && look !== 2) {
    // 꺼풀 끝선(가운데 아래로 살짝 처진 곡선) + 바깥 긴 속눈썹 둘
    g.moveTo(cx - w * 0.98, lidY(cx - w * 0.98) - h * 0.05);
    g.quadraticCurveTo(cx, cy - h * 0.18, cx + w * 1.0, lidY(cx + w * 1.0) - h * 0.02);
    g.stroke();
    g.lineWidth = w * 0.15;
    const ox = cx + w * 0.75, oy = lidY(cx + w * 0.75);
    for (const [dx, dy, ex, ey] of [[0, 0, 0.5, 0.12], [-0.35, 0.02, 0.0, 0.32]] as const) {
      g.beginPath(); g.moveTo(ox + dx * w, oy + dy * h); g.quadraticCurveTo(ox + (dx + ex * 0.6) * w, oy + (dy + ey * 0.4) * h, ox + (dx + ex) * w, oy + (dy + ey) * h); g.stroke();
    }
  } else if (look === 2) { g.moveTo(cx - w * 1.0, cy - h * 0.12); g.lineTo(cx + w * 1.02, cy - h * 0.52); }
  else g.ellipse(cx, cy + h * 0.02, w * 1.02, h * 1.0, 0, Math.PI * 1.08, Math.PI * 1.92);
  g.stroke();
  if (look !== 2 && !lid) {
    const ox = cx + w * 0.9, oy = cy - h * 0.46;
    g.lineWidth = w * 0.2;
    g.beginPath(); g.moveTo(ox, oy); g.quadraticCurveTo(ox + w * 0.3, oy - h * 0.1, ox + w * 0.44, oy - h * 0.32); g.stroke();
    if (lashes) {
      g.lineWidth = w * 0.15;
      g.beginPath(); g.moveTo(ox - w * 0.3, oy - h * 0.32); g.quadraticCurveTo(ox - w * 0.1, oy - h * 0.55, ox + w * 0.05, oy - h * 0.66); g.stroke();
      g.beginPath(); g.moveTo(ox + w * 0.05, oy + h * 0.16); g.quadraticCurveTo(ox + w * 0.35, oy + h * 0.1, ox + w * 0.55, oy - h * 0.05); g.stroke();
    }
  }
  // 아래 속눈썹(옅게, 바깥쪽 짧게)
  g.strokeStyle = 'rgba(58,31,44,0.5)';
  g.lineWidth = w * 0.08;
  g.beginPath(); g.ellipse(cx, cy, w * 0.98, h * 1.0, 0, Math.PI * 0.08, Math.PI * 0.3); g.stroke();
}

/** 감은 눈 선: down = 깜빡임(아래로 휜 곡선), up = '^' 웃는 눈 */
function eyeLine(g: G, cx: number, cy: number, w: number, h: number, dir: 'up' | 'down', lashes: boolean) {
  g.strokeStyle = LINE;
  g.lineWidth = w * 0.26;
  g.beginPath();
  if (dir === 'down') {
    g.moveTo(cx - w * 0.95, cy - h * 0.08);
    g.quadraticCurveTo(cx, cy + h * 0.42, cx + w * 0.95, cy - h * 0.08);
    g.stroke();
    g.lineWidth = w * 0.14;
    const ox = cx + w * 0.8, oy = cy + h * 0.06;
    g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + w * 0.25, oy + h * 0.2); g.stroke();
    if (lashes) { g.beginPath(); g.moveTo(ox - w * 0.35, oy + h * 0.18); g.lineTo(ox - w * 0.25, oy + h * 0.38); g.stroke(); }
  } else {
    g.moveTo(cx - w * 0.95, cy + h * 0.2);
    g.quadraticCurveTo(cx, cy - h * 0.62, cx + w * 0.95, cy + h * 0.2);
    g.stroke();
  }
}

function eyeHappy(g: G, cx: number, cy: number, w: number, h: number) {
  // '> <' — 바깥쪽으로 벌어진 꺾쇠
  g.strokeStyle = LINE;
  g.lineWidth = w * 0.3;
  const ox = w * 0.72, oy = h * 0.5;
  g.beginPath();
  g.moveTo(cx + ox, cy - oy); g.lineTo(cx - ox * 0.6, cy); g.lineTo(cx + ox, cy + oy);
  g.stroke();
}

// ── 입 칸: [-1, 1]² (위 +). philtrum = 코에서 내려오는 인중 선(주둥이 동물) ──
const mouthCache = new Map<string, THREE.Texture>();
const MOUTH_PX = 256;
const MOUTH_DARK = '#7a2c44', TONGUE = '#ff8c9e', MLINE = '#4a2230';

export function mouthTexture(mode: MouthMode, philtrum: boolean): THREE.Texture {
  const key = `${mode}|${philtrum ? 1 : 0}`;
  let t = mouthCache.get(key);
  if (t) return t;
  const n = MOUTH_PX;
  const X = (x: number) => (0.5 + x / 2) * n, Y = (y: number) => (0.5 - y / 2) * n, L = (v: number) => (v / 2) * n;
  t = tex(n, n, (g) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = MLINE; g.lineWidth = L(0.085);
    const top = 0.28;
    if (philtrum && mode !== 'none') {
      g.beginPath(); g.moveTo(X(0), Y(0.72)); g.lineTo(X(0), Y(top)); g.stroke();
    }
    const open = (w: number, hh: number, y0 = top) => {
      g.fillStyle = MOUTH_DARK;
      g.beginPath();
      g.moveTo(X(-w), Y(y0));
      g.quadraticCurveTo(X(0), Y(y0 - 0.06), X(w), Y(y0));
      g.bezierCurveTo(X(w * 0.92), Y(y0 - hh * 0.9), X(w * 0.42), Y(y0 - hh * 1.12), X(0), Y(y0 - hh * 1.12));
      g.bezierCurveTo(X(-w * 0.42), Y(y0 - hh * 1.12), X(-w * 0.92), Y(y0 - hh * 0.9), X(-w), Y(y0));
      g.fill();
      g.save(); g.clip();
      g.fillStyle = TONGUE;
      g.beginPath(); g.ellipse(X(0), Y(y0 - hh * 1.12), L(w * 0.62), L(hh * 0.58), 0, 0, TAU); g.fill();
      g.restore();
      g.lineWidth = L(0.06); g.strokeStyle = MLINE;
      g.beginPath(); g.moveTo(X(-w), Y(y0)); g.quadraticCurveTo(X(0), Y(y0 - 0.06), X(w), Y(y0)); g.stroke();
    };
    switch (mode) {
      case 'w': {
        const w = 0.3;
        g.beginPath();
        g.moveTo(X(-w * 1.9), Y(top + 0.02));
        g.quadraticCurveTo(X(-w), Y(top - w * 1.5), X(0), Y(top));
        g.quadraticCurveTo(X(w), Y(top - w * 1.5), X(w * 1.9), Y(top + 0.02));
        g.stroke();
        break;
      }
      case 'smile':
        g.beginPath(); g.moveTo(X(-0.45), Y(top)); g.quadraticCurveTo(X(0), Y(top - 0.42), X(0.45), Y(top)); g.stroke();
        break;
      case 'open': open(0.36, 0.42); break;
      case 'grin': open(0.52, 0.55); break;
      case 'o':
        g.fillStyle = MOUTH_DARK;
        g.beginPath(); g.ellipse(X(0), Y(top - 0.22), L(0.2), L(0.25), 0, 0, TAU); g.fill();
        g.fillStyle = TONGUE;
        g.beginPath(); g.ellipse(X(0), Y(top - 0.36), L(0.12), L(0.08), 0, 0, TAU); g.fill();
        break;
      case 'wavy': {
        const w = 0.42;
        g.beginPath();
        g.moveTo(X(-w), Y(top - 0.12));
        g.bezierCurveTo(X(-w * 0.5), Y(top + 0.02), X(-w * 0.2), Y(top - 0.22), X(0), Y(top - 0.08));
        g.bezierCurveTo(X(w * 0.2), Y(top + 0.04), X(w * 0.5), Y(top - 0.22), X(w), Y(top - 0.1));
        g.stroke();
        break;
      }
      case 'none': break;
    }
  });
  mouthCache.set(key, t);
  return t;
}

export interface PatchBox { x0: number; x1: number; y0: number; y1: number }

/**
 * 곡면 조각 오리기: src(위치·법선) 에서 정점이 전부 box 안 + 앞쪽(+z 법선)인 삼각형만 골라
 * 법선 방향으로 lift 만큼 띄우고 box 를 [0,1]² UV 로 편다(mirror 면 u 를 뒤집는다).
 */
export function cutPatch(src: THREE.BufferGeometry, box: PatchBox, mirror = false, lift = 0.0016, minNz = 0.05): THREE.BufferGeometry {
  const p = src.attributes.position as THREE.BufferAttribute;
  const nm = src.attributes.normal as THREE.BufferAttribute;
  const idx = src.index ? src.index.array : null;
  const triCount = idx ? idx.length / 3 : p.count / 3;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const W = box.x1 - box.x0, H = box.y1 - box.y0;
  const inside = (i: number) => {
    const x = p.getX(i), y = p.getY(i);
    return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1 && p.getZ(i) > 0 && nm.getZ(i) > minNz;
  };
  for (let t = 0; t < triCount; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
    if (!inside(a) || !inside(b) || !inside(c)) continue;
    for (const i of [a, b, c]) {
      const nx = nm.getX(i), ny = nm.getY(i), nz = nm.getZ(i);
      pos.push(p.getX(i) + nx * lift, p.getY(i) + ny * lift, p.getZ(i) + nz * lift);
      nor.push(nx, ny, nz);
      const u = (p.getX(i) - box.x0) / W;
      uv.push(mirror ? 1 - u : u, (p.getY(i) - box.y0) / H);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** 얼굴 조각 재질(투명 그림, 살짝 스스로 빛나 그늘에서도 또렷, 촉촉한 반사) */
export function decalMat(map: THREE.Texture, gloss = 0.28, glow = 0.32): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: glow, roughness: gloss,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  m.userData.decal = true;
  return m;
}
