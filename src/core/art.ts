// 공용 아트 도우미(계약 v2 0장 Art · GDD 0.4 · 0.5 · 7.1~7.4) — 얼굴(눈·볼터치)·블롭 그림자·숨쉬기·왕관·색 이름표·파츠 어휘.
// 새로 만들거나 고치는 생물·NPC 모델은 전부 여기 걸 쓴다 → 얼굴이 하나로 통일된다.
// 의존은 three 하나. 캔버스는 처음 쓸 때 만든다(테스트처럼 document 가 없으면 1px 텍스처로 대신).
// 지오메트리·재질·텍스처는 모듈 전역 공유 — userData.shared = true 라 청크가 버릴 때 dispose 하지 않는다.
import * as THREE from 'three';

// ───────────── 0.4 파츠 이름 ─────────────
export const PARTS = [
  'fan-fin', 'ribbon-fin', 'big-pec', 'whiskers2', 'whiskers4', 'crown', 'lantern', 'lantern-heart',
  'hump', 'hump2', 'crest', 'horn', 'horn3', 'spiral-horn', 'leaf-tubes', 'flower', 'spikes',
  'claws-big', 'legs-long', 'tentacles6', 'tentacles8', 'ear-fins', 'dome-head', 'snout-long', 'spear',
  't-head', 'fluffy', 'frill', 'frill-heart', 'plates', 'club-tail', 'sail', 'feathers', 'dome-skull',
  'long-claws', 'helmet', 'light-tail', 'ring', 'antenna-big', 'carrot-nose', 'wings-clear', 'ball',
] as const;
export type Part = typeof PARTS[number];
export const isPart = (p: unknown): p is Part => typeof p === 'string' && (PARTS as readonly string[]).includes(p);

// ───────────── 0.5 색 이름표 ─────────────
/** GDD 0.5 이름 → hex. 순수 검정·순수 회색은 없다(가장 어두운 색 = 먹색 ink) */
export const PALETTE = {
  red: '#ff6b6b', orange: '#ffa24c', yellow: '#ffd84a',
  lime: '#a8e06a', green: '#5cc16a', teal: '#3fc7b4',
  sky: '#8fd3f4', blue: '#4a9cf0', navy: '#3b5bb5',
  purple: '#a77be0', lavender: '#c9b6f2', pink: '#ff9fb8',
  lightPink: '#ffd0de', coral: '#ff8a7a', apricot: '#ffc59a',
  white: '#fffaf2', cream: '#fff1cf', beige: '#e9d3a8',
  sand: '#f4e2b0', brown: '#a8764f', darkBrown: '#6e4a33',
  olive: '#9bb35a', slate: '#8aa0b8', grey: '#b8b8c4',
  ink: '#3d3a4a', silver: '#dfe6ee', gold: '#ffcf4a',
  mint: '#9ef0d2', magenta: '#c25b8f', neon: '#c8ff5a',
} as const;
export type PaletteName = keyof typeof PALETTE;

/** 표에 한글 이름으로 적힌 색 → 영문 키(데이터 표를 그대로 옮길 때) */
export const PALETTE_KO: Record<string, PaletteName> = {
  빨강: 'red', 주황: 'orange', 노랑: 'yellow', 연두: 'lime', 초록: 'green', 청록: 'teal',
  하늘: 'sky', 파랑: 'blue', 남색: 'navy', 보라: 'purple', 라벤더: 'lavender', 분홍: 'pink',
  연분홍: 'lightPink', 산호: 'coral', 살구: 'apricot', 흰: 'white', 크림: 'cream', 베이지: 'beige',
  모래: 'sand', 갈색: 'brown', 진갈: 'darkBrown', 올리브: 'olive', 회청: 'slate', 회색: 'grey',
  먹색: 'ink', 은: 'silver', 금: 'gold', 민트: 'mint', 자주: 'magenta', 형광연두: 'neon',
};
/** 금속 무늬만 metalness 를 준다(나머지는 0) */
export const METALNESS: Partial<Record<PaletteName, number>> = { silver: 0.6, gold: 0.7 };
/** 투명(clear) 재질: 하늘 tint + opacity 0.45 */
export const CLEAR = { color: PALETTE.sky, opacity: 0.45 } as const;

/** UI 글자 · 패널 바탕 */
export const UI_TEXT = '#4a3b2a';
export const UI_BG = '#fff8e8';
/** 얼굴 색 */
export const EYE_COLOR = PALETTE.ink;
export const BLUSH_COLOR = PALETTE.pink;
export const BLUSH_OPACITY = 0.55;
/** 잡혔을 때 볼(더 진하게) */
export const BLUSH_OPACITY_HAPPY = 0.8;

// ───────────── 색 다루기(순수) ─────────────
type RGB = [number, number, number];

/** '#abc' · '#aabbcc' · 0xaabbcc · 이름표 키 → [r,g,b] 0..255. 못 읽으면 null */
export function parseHex(c: string | number): RGB | null {
  if (typeof c === 'number') {
    if (!Number.isFinite(c)) return null;
    const n = Math.max(0, Math.min(0xffffff, Math.floor(c)));
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const named = (PALETTE as Record<string, string>)[c] ?? (PALETTE_KO[c] ? PALETTE[PALETTE_KO[c]] : undefined);
  let s = (named ?? c).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((ch) => ch + ch).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const toHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** 눈으로 보는 밝기 0..255 */
const luma = ([r, g, b]: RGB) => 0.299 * r + 0.587 * g + 0.114 * b;
/** 채널 차이가 이보다 작으면 '회색'으로 본다 */
const GREY_SPREAD = 12;
const INK_LUMA = luma(parseHex(PALETTE.ink)!);
const PALETTE_RGB: Array<[PaletteName, RGB]> = (Object.keys(PALETTE) as PaletteName[]).map((k) => [k, parseHex(PALETTE[k])!]);

/** 이름표에서 가장 가까운 색(가중 RGB 거리) */
export function nearestPalette(c: string | number | readonly [number, number, number]): PaletteName {
  const v = (Array.isArray(c) ? c : parseHex(c as string | number)) ?? [255, 250, 242];
  let best: PaletteName = 'white', bd = Infinity;
  for (const [k, p] of PALETTE_RGB) {
    const dr = v[0] - p[0], dg = v[1] - p[1], db = v[2] - p[2];
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/** 회색 계열이 갈 곳 — 무채색 쪽 이름표만, 밝기(luma)로 고른다 */
const NEUTRALS: readonly PaletteName[] = ['ink', 'slate', 'grey', 'silver', 'white', 'cream'];
function nearestNeutral(v: RGB): PaletteName {
  const l = luma(v);
  let best: PaletteName = 'grey', bd = Infinity;
  for (const k of NEUTRALS) {
    const d = Math.abs(luma(parseHex(PALETTE[k])!) - l);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === R ? (G - B) / d + (G < B ? 6 : 0) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h: number, s: number, l: number): RGB {
  const f = (n: number) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

/**
 * 순수 검정·순수 회색 금지 규칙(GDD 0.5 · 7.4)을 지키는 색으로 바꾼다. 결과는 늘 '#rrggbb'.
 * - 회색 계열(채널 차이 < 12) → 무채색 쪽 이름표(먹색·회청·회색·은·흰·크림) 중 밝기가 가장 가까운 색 — 색상이 갈색 등으로 튀지 않는다.
 * - 먹색보다 어두운 색 → 먹색 #3d3a4a.
 * - 그 밖의 색은 그대로. strong:true 면 파스텔 띠(채도 50~80% · 명도 65~90%)로 끌어온다.
 */
export function pastelize(c: string | number, o?: { strong?: boolean }): string {
  const v = parseHex(c);
  if (!v) return PALETTE.white;
  const spread = Math.max(...v) - Math.min(...v);
  if (spread < GREY_SPREAD) {
    if (luma(v) <= INK_LUMA) return PALETTE.ink;
    return PALETTE[nearestNeutral(v)];
  }
  if (luma(v) < INK_LUMA) return PALETTE.ink;
  if (!o?.strong) return toHex(v);
  const [h, s, l] = rgbToHsl(v);
  const out = hslToRgb(h, Math.min(0.8, Math.max(0.5, s)), Math.min(0.9, Math.max(0.65, l)));
  // 반올림으로 회색이 될 일은 없지만(채도 ≥ 50%) 혹시 몰라 한 번 더 막는다
  return Math.max(...out) - Math.min(...out) < GREY_SPREAD ? PALETTE[nearestNeutral(out)] : toHex(out);
}

/** 이름표 색 → THREE.Color(sRGB) */
export const paletteColor = (name: PaletteName | string) => new THREE.Color(pastelize(name));

// ───────────── 7.1 스쿼시 대기 동작 ─────────────
/** 숨쉬기 주기(초) */
export const BREATHE_PERIOD = 2;
/** 1.00 ↔ 1.05, 2초 주기. phase 0..1 은 개체마다 rng 로 */
export const breatheScale = (t: number, phase = 0) =>
  1 + 0.025 * (1 - Math.cos(2 * Math.PI * (t / BREATHE_PERIOD + phase)));

/**
 * 매 프레임 부른다. 처음 부를 때의 scale 을 기준으로 세로 1.00↔1.05, 가로는 절반만(통통하게 숨쉬기).
 * 기준 scale 을 바꿨으면 obj.userData.breatheBase 를 지우거나 새로 넣는다. 지금 배율을 돌려준다.
 */
export function breathe(obj: THREE.Object3D, t: number, phase = 0): number {
  let base = obj.userData.breatheBase as THREE.Vector3 | undefined;
  if (!base) obj.userData.breatheBase = base = obj.scale.clone();
  const s = breatheScale(t, phase), side = 1 + (s - 1) * 0.5;
  obj.scale.set(base.x * side, base.y * s, base.z * side);
  return s;
}

// ───────────── 캔버스 텍스처(공용) ─────────────
const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

/** size×size 캔버스에 그려 텍스처로. DOM 이 없으면 fallback 색 1px */
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, fallback: RGB, fallbackA = 255): THREE.Texture {
  let t: THREE.Texture | null = null;
  if (hasDom()) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (g) { draw(g, size); t = new THREE.CanvasTexture(c); }
  }
  if (!t) {
    t = new THREE.DataTexture(new Uint8Array([fallback[0], fallback[1], fallback[2], fallbackA]), 1, 1);
    t.needsUpdate = true;
  }
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  return t;
}

const INK_RGB = parseHex(PALETTE.ink)!;

/**
 * 눈 텍스처: 먹색 세로 타원(가로:세로 = 0.75:1) + 흰 하이라이트 2개
 * (큰 것 지름 = 눈의 35% 위 바깥쪽 / 작은 것 15% 아래 안쪽). side 는 바깥쪽 방향.
 */
function drawEye(g: CanvasRenderingContext2D, s: number, side: 'L' | 'R') {
  const cx = s / 2, cy = s / 2, ry = s * 0.48, rx = ry * 0.75, d = ry * 2;
  const out = side === 'L' ? -1 : 1;
  g.clearRect(0, 0, s, s);
  g.fillStyle = PALETTE.ink;
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(cx + out * rx * 0.36, cy - ry * 0.4, d * 0.35 / 2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx - out * rx * 0.34, cy + ry * 0.42, d * 0.15 / 2, 0, Math.PI * 2); g.fill();
}
/** 잡혔을 때 '> <' 눈 */
function drawHappyEye(g: CanvasRenderingContext2D, s: number, side: 'L' | 'R') {
  const out = side === 'L' ? -1 : 1, w = s * 0.3, hgt = s * 0.3, cx = s / 2, cy = s / 2;
  g.clearRect(0, 0, s, s);
  g.strokeStyle = PALETTE.ink; g.lineWidth = s * 0.12; g.lineCap = 'round'; g.lineJoin = 'round';
  // 바깥쪽 눈이 '>' / '<' 로 안쪽을 가리킨다
  g.beginPath();
  g.moveTo(cx + out * w, cy - hgt); g.lineTo(cx - out * w * 0.6, cy); g.lineTo(cx + out * w, cy + hgt);
  g.stroke();
}

const texCache = new Map<string, THREE.Texture>();
function eyeTex(side: 'L' | 'R', happy: boolean) {
  const k = `${side}${happy ? 'h' : ''}`;
  let t = texCache.get(k);
  if (!t) {
    t = canvasTex(128, (g, s) => (happy ? drawHappyEye : drawEye)(g, s, side), INK_RGB);
    texCache.set(k, t);
  }
  return t;
}

// ───────────── 7.2 눈 ─────────────
const matCache = new Map<string, THREE.Material>();
const shared = <T extends THREE.Material | THREE.BufferGeometry>(x: T): T => { x.userData.shared = true; return x; };

/** 눈 재질(공용). side 'L'/'R' 은 하이라이트가 바깥쪽에 오도록 좌우 거울. happy = '> <' */
export function eyeMaterial(side: 'L' | 'R' = 'R', happy = false): THREE.MeshBasicMaterial {
  const k = `eye${side}${happy ? 'h' : ''}`;
  let m = matCache.get(k) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = shared(new THREE.MeshBasicMaterial({
      map: eyeTex(side, happy), transparent: true, alphaTest: 0.35, depthWrite: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    // DOM 없는 1px 대체 텍스처일 땐 모양 없이 먹색 판
    if (!hasDom()) { m.map = null; m.color.set(PALETTE.ink); m.transparent = false; m.alphaTest = 0; }
    matCache.set(k, m);
  }
  return m;
}

let eyeGeo: THREE.BufferGeometry | null = null;
/** 1×1 판을 살짝 휘게(가운데가 앞으로) — 둥근 머리에 붙여도 들뜨지 않게 */
function eyeGeometry() {
  if (eyeGeo) return eyeGeo;
  const g = new THREE.PlaneGeometry(1, 1, 6, 6);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, -0.12 * (x * x + y * y));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return (eyeGeo = shared(g));
}

export interface EyeOpts {
  /** 눈 지름(세로, m). 머리 높이의 28~35% 를 권장 */
  size: number;
  /** 두 눈 가운데 높이(부모 좌표) */
  y?: number;
  /** 앞쪽 위치(+z 가 앞). head 를 주면 무시 */
  z?: number;
  /** 두 눈 중심 사이 거리(기본 size × 1.4) */
  gap?: number;
  /** 눈을 바깥으로 살짝 돌리는 각(라디안, 기본 0.22). head 를 주면 표면 법선을 따른다 */
  splay?: number;
  /** 구 머리 위에 붙이기: 머리 중심·반지름. 눈은 표면 바로 위에 법선 방향으로 선다 */
  head?: { r: number; center?: THREE.Vector3 | { x: number; y: number; z: number } };
  /** 눈높이를 머리 중심 위로 몇 도(라디안) 올릴지(head 일 때, 기본 0.12) */
  lift?: number;
  /** 볼터치 같이 붙이기(기본 true). 무서운 종은 꼭 켜 둔다 */
  blush?: boolean;
  /** 바닥에서 위로 보이는 이름(디버그) */
  name?: string;
}
export interface EyeSet {
  left: THREE.Mesh;
  right: THREE.Mesh;
  blush: THREE.Mesh[];
  size: number;
  /** 잡혔을 때 표정 켜고 끄기(눈 '> <' + 볼 0.8) */
  setHappy(on: boolean): void;
}

/** 표면 배치 계산: 왼쪽(-x) 눈 기준 위치·법선 */
function eyePose(o: EyeOpts, side: -1 | 1) {
  const size = o.size, gap = o.gap ?? size * 1.4;
  if (o.head) {
    const R = Math.max(o.head.r, gap * 0.51);
    const c = o.head.center ?? { x: 0, y: 0, z: 0 };
    const az = Math.asin(Math.min(0.95, gap / 2 / R)), el = o.lift ?? 0.12;
    const n = new THREE.Vector3(side * Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const pos = new THREE.Vector3(c.x, c.y, c.z).addScaledVector(n, R + size * 0.02);
    if (o.y != null) pos.y = o.y;
    return { pos, n };
  }
  const splay = o.splay ?? 0.22;
  const n = new THREE.Vector3(side * Math.sin(splay), 0, Math.cos(splay));
  return { pos: new THREE.Vector3(side * gap / 2, o.y ?? 0, o.z ?? 0), n };
}

function orient(m: THREE.Object3D, pos: THREE.Vector3, n: THREE.Vector3) {
  m.position.copy(pos);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.clone().normalize());
}

/**
 * 눈 두 개를 붙인다(GDD 7.2). 부모 좌표에서 +z 가 앞, +y 가 위.
 * 예) addEyes(head, { size: 0.09, head: { r: 0.16 } }) — 구 머리 표면에 붙이고 볼터치까지.
 */
export function addEyes(parent: THREE.Object3D, opts: EyeOpts): EyeSet {
  const geo = eyeGeometry();
  const mk = (side: -1 | 1) => {
    const m = new THREE.Mesh(geo, eyeMaterial(side < 0 ? 'L' : 'R'));
    const { pos, n } = eyePose(opts, side);
    orient(m, pos, n);
    m.scale.setScalar(opts.size);
    m.name = `${opts.name ?? 'eye'}-${side < 0 ? 'L' : 'R'}`;
    m.userData.eye = side < 0 ? 'L' : 'R';
    m.renderOrder = 2;
    parent.add(m);
    return m;
  };
  const left = mk(-1), right = mk(1);
  const set: EyeSet = {
    left, right, blush: [], size: opts.size,
    setHappy(on) {
      left.material = eyeMaterial('L', on);
      right.material = eyeMaterial('R', on);
      for (const b of set.blush) b.material = blushMaterial(on);
    },
  };
  parent.userData.eyes = set;
  if (opts.blush !== false) set.blush = addBlush(parent, opts.size);
  return set;
}

// ───────────── 7.2 볼터치 ─────────────
/** 볼 재질(공용) — 분홍 #ff9fb8, 평소 0.55 / 잡혔을 때 0.8 */
export function blushMaterial(happy = false): THREE.MeshBasicMaterial {
  const k = happy ? 'blushH' : 'blush';
  let m = matCache.get(k) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = shared(new THREE.MeshBasicMaterial({
      color: BLUSH_COLOR, transparent: true, opacity: happy ? BLUSH_OPACITY_HAPPY : BLUSH_OPACITY, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    matCache.set(k, m);
  }
  return m;
}
let discGeo: THREE.BufferGeometry | null = null;
/** 지름 1 원판(+z 를 본다) */
function discGeometry() {
  return discGeo ?? (discGeo = shared(new THREE.CircleGeometry(0.5, 24)));
}

/**
 * 눈 아래 바깥쪽에 분홍 반투명 원판 2개(지름 = 눈 지름 × 0.8).
 * eyeSize 는 addEyes 의 size(눈 지름). 부모에 addEyes 로 단 눈이 있으면 그 눈을 따라가고,
 * 없으면 기본 배치(y = -eyeSize, 간격 = eyeSize × 2.2, z = 0)로 앞을 보게 둔다.
 */
export function addBlush(parent: THREE.Object3D, eyeSize: number, o?: { y?: number; z?: number; gap?: number }): THREE.Mesh[] {
  const geo = discGeometry(), mat = blushMaterial(false), d = eyeSize * 0.8;
  const eyes = parent.userData.eyes as EyeSet | undefined;
  const out: THREE.Mesh[] = [];
  for (const side of [-1, 1] as const) {
    const m = new THREE.Mesh(geo, mat);
    const eye = eyes ? (side < 0 ? eyes.left : eyes.right) : null;
    if (eye && eye.parent === parent && !o) {
      // 눈 기준: 바깥쪽 0.55 · 아래 0.7 (눈 좌표계) → 같은 방향을 본다
      const off = new THREE.Vector3(side * 0.55, -0.7, -0.03).multiplyScalar(eyeSize).applyQuaternion(eye.quaternion);
      m.position.copy(eye.position).add(off);
      m.quaternion.copy(eye.quaternion);
    } else {
      const gap = o?.gap ?? eyeSize * 2.2;
      m.position.set(side * gap / 2, o?.y ?? -eyeSize, o?.z ?? 0);
      m.rotation.y = side * 0.3;
    }
    m.scale.set(d, d * 0.8, 1);
    m.name = `blush-${side < 0 ? 'L' : 'R'}`;
    m.renderOrder = 1;
    parent.add(m);
    out.push(m);
  }
  if (eyes) eyes.blush = out;
  return out;
}

// ───────────── 7.3 블롭 그림자 ─────────────
let shadowGeo: THREE.BufferGeometry | null = null;
let shadowMat: THREE.MeshBasicMaterial | null = null;
/** 가운데 진하고 가장자리 흐린 둥근 그림자 */
function drawShadow(g: CanvasRenderingContext2D, s: number) {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(46,40,60,1)');
  gr.addColorStop(0.55, 'rgba(46,40,60,0.75)');
  gr.addColorStop(1, 'rgba(46,40,60,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
}
/** 공용 그림자 재질(투명 0.28, 깊이 안 씀) */
export function blobShadowMaterial(): THREE.MeshBasicMaterial {
  return shadowMat ?? (shadowMat = shared(new THREE.MeshBasicMaterial({
    map: canvasTex(64, drawShadow, [46, 40, 60], 160), color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  })));
}
/** 공용 그림자 지오메트리(땅에 누운 지름 2 원판) */
export function blobShadowGeometry(): THREE.BufferGeometry {
  if (shadowGeo) return shadowGeo;
  const g = new THREE.CircleGeometry(1, 28);
  g.rotateX(-Math.PI / 2);
  return (shadowGeo = shared(g));
}
/** 발밑 블롭 그림자(반지름 r m). 부모 바닥(y=0) 바로 위에 눕힌다 */
export function blobShadow(r: number): THREE.Mesh {
  const m = new THREE.Mesh(blobShadowGeometry(), blobShadowMaterial());
  m.scale.set(r, 1, r);
  m.position.y = 0.02;
  m.renderOrder = 1;
  m.castShadow = false;
  m.receiveShadow = false;
  m.name = 'blob-shadow';
  m.userData.blobShadow = true;
  return m;
}

// ───────────── 왕관(crown 변이·파츠) ─────────────
let crownParts: { band: THREE.BufferGeometry; ball: THREE.BufferGeometry; spike: THREE.BufferGeometry; gem: THREE.BufferGeometry } | null = null;
function crownGeos() {
  if (crownParts) return crownParts;
  // 둥근 띠(회전체) — 지름 1, 높이 0.32
  const prof = [
    new THREE.Vector2(0.44, 0), new THREE.Vector2(0.5, 0.02), new THREE.Vector2(0.52, 0.08),
    new THREE.Vector2(0.5, 0.3), new THREE.Vector2(0.46, 0.32), new THREE.Vector2(0.42, 0.3),
    new THREE.Vector2(0.44, 0.04),
  ];
  const band = new THREE.LatheGeometry(prof, 32);
  band.computeVertexNormals();
  const spike = new THREE.ConeGeometry(0.1, 0.26, 12);
  spike.translate(0, 0.13, 0);
  crownParts = {
    band: shared(band),
    spike: shared(spike),
    ball: shared(new THREE.SphereGeometry(0.06, 16, 12)),
    gem: shared(new THREE.SphereGeometry(0.065, 16, 12)),
  };
  return crownParts;
}
function crownMats() {
  let gold = matCache.get('crownGold') as THREE.MeshStandardMaterial | undefined;
  if (!gold) {
    gold = shared(new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: METALNESS.gold, roughness: 0.38, emissive: '#b8861c', emissiveIntensity: 0.4 }));
    // 환경맵 없는 곳에서도 탁한 갈색이 되지 않게 자체 발광을 조금 섞는다
    matCache.set('crownGold', gold);
  }
  let gem = matCache.get('crownGem') as THREE.MeshStandardMaterial | undefined;
  if (!gem) {
    gem = shared(new THREE.MeshStandardMaterial({ color: PALETTE.pink, roughness: 0.25, emissive: PALETTE.pink, emissiveIntensity: 0.35 }));
    matCache.set('crownGem', gem);
  }
  return { gold, gem };
}

/**
 * 작은 금관. size = 지름(m, 기본 0.16). 바닥이 y=0 이라 머리 꼭대기에 그대로 올린다.
 * 뾰족 5개 끝은 둥근 공, 앞쪽(+z)에 분홍 보석 하나.
 */
export function crownMesh(size = 0.16): THREE.Group {
  const G = crownGeos(), M = crownMats();
  const g = new THREE.Group();
  g.name = 'crown';
  g.userData.part = 'crown';
  g.add(new THREE.Mesh(G.band, M.gold));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.sin(a) * 0.46, z = Math.cos(a) * 0.46;
    const sp = new THREE.Mesh(G.spike, M.gold);
    sp.position.set(x, 0.28, z);
    sp.rotation.set(Math.cos(a) * 0.18, 0, -Math.sin(a) * 0.18);
    const ball = new THREE.Mesh(G.ball, M.gold);
    ball.position.set(x * 1.08, 0.56, z * 1.08);
    g.add(sp, ball);
  }
  const gem = new THREE.Mesh(G.gem, M.gem);
  gem.position.set(0, 0.16, 0.5);
  gem.scale.set(1, 1.2, 0.6);
  g.add(gem);
  g.scale.setScalar(size);
  return g;
}
