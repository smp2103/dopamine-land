// 곤충 모델 — 절차적이지만 귀엽게: 동그란 몸, 큰 눈 + 하이라이트, 볼터치, 짧은 다리, 반투명 날개.
// 몸은 부품을 정점색으로 칠해 하나의 지오메트리로 합친다(재질 5종 공유 → 종이 달라도 프로그램 하나).
// 날개는 종마다 캔버스로 그린 텍스처 한 장(좌우 대칭 메시 2개가 파닥인다).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BugSpecies } from './data';

// ───────── 공유 재질(정점색) ─────────
export const SLOT = { FUZZ: 0, GLOSS: 1, GLOW: 2, FLAT: 3, IRI: 4, METAL: 5 } as const;
let MATS: THREE.Material[] | null = null;
export function bugMats(): THREE.Material[] {
  if (MATS) return MATS;
  const fuzz = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.72, sheen: 0.9, sheenRoughness: 0.5, sheenColor: new THREE.Color('#fff4ea'),
    emissive: '#ffffff', emissiveIntensity: 0.0,
  });
  const gloss = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.2,
  });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  glow.color.setScalar(3.2);
  const flat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const iri = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.22, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08,
    iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 620],
  });
  // 딱정벌레 껍질: 메탈릭 파스텔 + 유리 같은 클리어코트(보는 각도마다 은은한 무지개)
  const metal = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.24, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03,
    iridescence: 0.45, iridescenceIOR: 1.45, iridescenceThicknessRange: [240, 520],
    specularIntensity: 1, specularColor: new THREE.Color('#ffffff'),
    emissive: '#ffffff', emissiveIntensity: 0.0,
  });
  MATS = [fuzz, gloss, glow, flat, iri, metal];
  return MATS;
}

const C = (c: string | THREE.Color) => (typeof c === 'string' ? new THREE.Color(c) : c.clone());
const mix = (a: string | THREE.Color, b: string | THREE.Color, t: number) => C(a).lerp(C(b), t);
const lum = (c: THREE.Color) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;

type V3 = [number, number, number];
type ColorFn = (p: THREE.Vector3, local: THREE.Vector3) => THREE.Color | null;

interface PartOpts {
  p?: V3; r?: V3; s?: V3 | number;
  /** 위·아래 그라디언트 세기(0 = 단색) */
  grad?: number;
  /** 정점마다 색(무늬) — null 이면 기본색 */
  fn?: ColorFn;
  q?: THREE.Quaternion;
}

/** 부품 모음: 변환 + 정점색 + 재질 칸 */
class Parts {
  list: Array<{ geo: THREE.BufferGeometry; slot: number }> = [];
  add(geo: THREE.BufferGeometry, slot: number, color: string | THREE.Color, o: PartOpts = {}) {
    const g = geo.index ? geo : geo;
    const m = new THREE.Matrix4();
    const s = o.s === undefined ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s;
    const q = o.q ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.r ?? [0, 0, 0])));
    m.compose(new THREE.Vector3(...(o.p ?? [0, 0, 0])), q, new THREE.Vector3(s[0], s[1], s[2]));
    // 지역 좌표(무늬 계산용)를 변환 전에 보관
    const pos0 = (g.attributes.position as THREE.BufferAttribute).clone();
    g.applyMatrix4(m);
    const pos = g.attributes.position as THREE.BufferAttribute;
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const base = C(color);
    const grad = o.grad ?? 0.22;
    const top = base.clone().lerp(new THREE.Color('#ffffff'), grad * 0.75);
    const bot = base.clone().multiplyScalar(1 - grad * 0.7);
    const col = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3(), lv = new THREE.Vector3();
    const span = Math.max(1e-5, bb.max.y - bb.min.y);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      lv.fromBufferAttribute(pos0, i);
      let c: THREE.Color = base;
      const fc = o.fn?.(v, lv);
      if (fc) c = fc;
      const t = (v.y - bb.min.y) / span;
      const k = grad > 0 ? (fc ? fc.clone().multiplyScalar(1 - grad * 0.7).lerp(fc.clone().lerp(new THREE.Color('#ffffff'), grad * 0.75), t) : bot.clone().lerp(top, t)) : c;
      col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list.push({ geo: g, slot });
    return g;
  }
}

// ───────── 기본 도형 ─────────
const sph = (seg = 32, rows = 24) => new THREE.SphereGeometry(1, seg, rows);
const halfSph = () => new THREE.SphereGeometry(1, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2);
const up = new THREE.Vector3(0, 1, 0);

/** 두 점을 잇는 캡슐(다리·더듬이 마디) */
function capsuleBetween(P: Parts, a: V3, b: V3, r: number, color: string | THREE.Color, slot: number = SLOT.FUZZ, grad = 0.15) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const len = Math.max(0.001, d.length());
  const geo = new THREE.CapsuleGeometry(r, len, 3, 8);
  const q = new THREE.Quaternion().setFromUnitVectors(up, d.normalize());
  const mid = va.add(vb).multiplyScalar(0.5);
  P.add(geo, slot, color, { p: [mid.x, mid.y, mid.z], q, grad });
}

/** 매끈한 곡선 관(뿔·턱·더듬이) + 둥근 끝 */
function tube(P: Parts, pts: V3[], r: number, color: string | THREE.Color, slot: number = SLOT.GLOSS, ball = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  P.add(new THREE.TubeGeometry(curve, 12, r, 6, false), slot, color, { grad: 0.1 });
  const e = pts[pts.length - 1], s0 = pts[0];
  P.add(sph(12, 8), slot, color, { p: e, s: ball || r, grad: 0.1 });
  P.add(sph(12, 8), slot, color, { p: s0, s: r, grad: 0.1 });
}

/** 귀여운 얼굴: 큰 눈(하이라이트 둘) + 볼터치 + 작은 미소. 머리 중심 c, 반지름(가로 R) */
function face(P: Parts, c: V3, R: number, o: { headColor: THREE.Color; eye?: number; spread?: number; lift?: number; cheek?: boolean; smile?: boolean; eyeColor?: string; rz?: number } ) {
  const eye = o.eye ?? 0.34, spread = o.spread ?? 0.48, lift = o.lift ?? 0.12;
  const rz = o.rz ?? R;
  const cv = new THREE.Vector3(...c);
  const dark = lum(o.headColor) < 0.28;
  const dirOf = (a: number, b: number) => new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b));
  const onHead = (d: THREE.Vector3, k: number) => cv.clone().add(new THREE.Vector3(d.x * R * k, d.y * R * k, d.z * rz * k));
  for (const sgn of [-1, 1]) {
    const d = dirOf(sgn * spread, lift);
    const er = R * eye;
    const ec = onHead(d, 0.82);
    const qd = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    if (dark) {
      // 어두운 머리: 흰자 테두리로 눈이 읽히게
      P.add(sph(24, 16), SLOT.GLOSS, '#fdfaf4', { p: [ec.x, ec.y, ec.z], q: qd, s: [er * 1.08, er * 1.12, er * 0.62], grad: 0.05 });
    }
    const pc = ec.clone().addScaledVector(d, er * (dark ? 0.22 : 0.05));
    P.add(sph(24, 16), SLOT.GLOSS, o.eyeColor ?? '#2b1d1e', { p: [pc.x, pc.y, pc.z], q: qd, s: [er * (dark ? 0.78 : 1), er * (dark ? 0.86 : 1.08), er * 0.62], grad: 0.25 });
    // 하이라이트(큰 것 하나 + 작은 것 하나)
    const side = new THREE.Vector3().crossVectors(up, d).normalize();
    const h1 = pc.clone().addScaledVector(d, er * 0.55).addScaledVector(up, er * 0.36).addScaledVector(side, -er * 0.26 * sgn);
    P.add(sph(10, 8), SLOT.FLAT, '#ffffff', { p: [h1.x, h1.y, h1.z], s: er * 0.3, grad: 0 });
    const h2 = pc.clone().addScaledVector(d, er * 0.58).addScaledVector(up, -er * 0.3).addScaledVector(side, er * 0.22 * sgn);
    P.add(sph(8, 6), SLOT.FLAT, '#ffffff', { p: [h2.x, h2.y, h2.z], s: er * 0.14, grad: 0 });
    if (o.cheek !== false) {
      const cd = dirOf(sgn * (spread + 0.42), lift - 0.42);
      const cc = onHead(cd, 0.98);
      const qc = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), cd);
      P.add(sph(12, 8), SLOT.FLAT, '#ff9fb4', { p: [cc.x, cc.y, cc.z], q: qc, s: [R * 0.2, R * 0.13, R * 0.05], grad: 0 });
    }
  }
  if (o.smile !== false) {
    const d = dirOf(0, lift - 0.5);
    const sc = onHead(d, 0.99);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
    P.add(new THREE.TorusGeometry(R * 0.13, R * 0.032, 6, 16, Math.PI), SLOT.GLOSS, dark ? '#ffe8e0' : '#5a2e2e', { p: [sc.x, sc.y, sc.z], q, grad: 0 });
  }
}

/** 6개 다리(짧고 통통) */
function legs6(P: Parts, color: string | THREE.Color, o: { x: number; y: number; zs: number[]; reach?: number; r?: number; lift?: number }) {
  const reach = o.reach ?? 0.16, r = o.r ?? 0.026, lift = o.lift ?? 0.06;
  o.zs.forEach((z, i) => {
    for (const s of [-1, 1]) {
      const a: V3 = [s * o.x, o.y, z];
      const k: V3 = [s * (o.x + reach * 0.7), o.y + lift, z + (i - 1) * 0.04];
      const f: V3 = [s * (o.x + reach), 0.0, z + (i - 1) * 0.09];
      capsuleBetween(P, a, k, r, color);
      capsuleBetween(P, k, f, r * 0.85, color);
    }
  });
}

/** 더듬이 한 쌍(끝에 동그란 공) */
function antennae(P: Parts, base: V3, tip: V3, color: string | THREE.Color, r = 0.014, ball = 0.03, bend = 0.06) {
  for (const s of [-1, 1]) {
    const a: V3 = [base[0] * s, base[1], base[2]];
    const t: V3 = [tip[0] * s, tip[1], tip[2]];
    const m: V3 = [(a[0] + t[0]) / 2 + s * bend * 0.3, (a[1] + t[1]) / 2 + bend, (a[2] + t[2]) / 2 - bend * 0.3];
    tube(P, [a, m, t], r, color, SLOT.GLOSS, ball);
  }
}

/** 타원체 표면 위 점(무늬 붙이기): 중심·반지름·방향 */
function onEllipsoid(c: V3, r: V3, d: THREE.Vector3): THREE.Vector3 {
  const n = d.clone().normalize();
  return new THREE.Vector3(c[0] + n.x * r[0], c[1] + n.y * r[1], c[2] + n.z * r[2]);
}
/** 껍질 위 점무늬(납작 구) */
function spotsOn(P: Parts, c: V3, r: V3, dirs: Array<[number, number]>, size: number, color: string, slot: number = SLOT.GLOSS) {
  for (const [az, el] of dirs) {
    const d = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const p = onEllipsoid(c, r, d);
    // 법선(타원체)
    const nrm = new THREE.Vector3((p.x - c[0]) / (r[0] * r[0]), (p.y - c[1]) / (r[1] * r[1]), (p.z - c[2]) / (r[2] * r[2])).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
    P.add(sph(16, 12), slot, color, { p: [p.x, p.y, p.z], q, s: [size, size, size * 0.3], grad: 0.1 });
  }
}

const hue = (h: number, s = 0.75, l = 0.68) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l);

/** 어둡거나 회색인 색 → 같은 계열의 맑은 파스텔(회색이면 종마다 청록·자주·금·장미 중 하나) */
const PASTEL_HUES = [0.47, 0.76, 0.12, 0.93, 0.56, 0.3];
function pastelize(c: string, id: string, l: number, minS = 0.5): string {
  const col = new THREE.Color(c);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  if (hsl.l >= l && hsl.s >= 0.22) return c;
  let h = hsl.h, s = hsl.s;
  if (s < 0.22) {
    let k = 0;
    for (let i = 0; i < id.length; i++) k = (k * 31 + id.charCodeAt(i)) >>> 0;
    h = PASTEL_HUES[k % PASTEL_HUES.length];
    s = minS + 0.1;
  }
  return new THREE.Color().setHSL(h, Math.max(s, minS), Math.max(hsl.l, l)).getStyle();
}
const SHELL_KINDS = new Set(['beetle', 'stag', 'rhino', 'dungbeetle']);

// ───────── 날개 텍스처 ─────────
type WingShape = 'butterfly' | 'moth' | 'luna' | 'dragon' | 'bee' | 'cicada';

function wingTexture(sp: BugSpecies, shape: WingShape): THREE.CanvasTexture {
  const W = shape === 'dragon' || shape === 'cicada' ? 512 : 256, H = shape === 'dragon' || shape === 'cicada' ? 256 : 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const [ca, cb, cc] = sp.colors;
  const sx = W / 256, sy = H / 256;
  const path = () => {
    g.beginPath();
    if (shape === 'butterfly') {
      g.ellipse(120 * sx, 90 * sy, 114 * sx, 72 * sy, -0.42, 0, Math.PI * 2);
      g.ellipse(86 * sx, 178 * sy, 80 * sx, 64 * sy, 0.55, 0, Math.PI * 2);
    } else if (shape === 'moth' || shape === 'luna') {
      g.ellipse(124 * sx, 98 * sy, 120 * sx, 70 * sy, -0.22, 0, Math.PI * 2);
      g.ellipse(80 * sx, 168 * sy, 74 * sx, 56 * sy, 0.42, 0, Math.PI * 2);
      if (shape === 'luna') {
        g.moveTo(40 * sx, 190 * sy);
        g.bezierCurveTo(70 * sx, 236 * sy, 84 * sx, 252 * sy, 104 * sx, 250 * sy);
        g.bezierCurveTo(118 * sx, 240 * sy, 96 * sx, 214 * sy, 90 * sx, 196 * sy);
        g.closePath();
      }
    } else if (shape === 'dragon') {
      g.ellipse(250, 70, 244, 50, -0.05, 0, Math.PI * 2);
      g.ellipse(236, 182, 230, 58, 0.1, 0, Math.PI * 2);
    } else if (shape === 'cicada') {
      g.ellipse(258, 120, 250, 92, 0.0, 0, Math.PI * 2);
    } else {
      g.ellipse(132, 86, 120, 70, -0.3, 0, Math.PI * 2);
      g.ellipse(92, 184, 78, 50, 0.35, 0, Math.PI * 2);
    }
  };
  const clear = shape === 'dragon' || shape === 'bee' || shape === 'cicada';
  if (clear) {
    // 반투명 날개: 연한 색 + 테두리 + 날개맥 + 끝 점
    const tint = new THREE.Color(cc).lerp(new THREE.Color('#ffffff'), 0.55);
    const grd = g.createLinearGradient(0, 0, W, 0);
    const tc = `rgba(${(tint.r * 255) | 0},${(tint.g * 255) | 0},${(tint.b * 255) | 0},`;
    grd.addColorStop(0, tc + '0.75)');
    grd.addColorStop(1, tc + '0.38)');
    if (sp.pattern === 'rainbow' || sp.pattern === 'iri') {
      for (let i = 0; i <= 6; i++) {
        const h = hue(i / 6 + 0.55, 0.8, 0.8);
        grd.addColorStop(Math.min(1, i / 6), `rgba(${(h.r * 255) | 0},${(h.g * 255) | 0},${(h.b * 255) | 0},${0.6 - i * 0.04})`);
      }
    }
    g.fillStyle = grd;
    path(); g.fill();
    g.save(); path(); g.clip();
    g.strokeStyle = 'rgba(90,80,110,0.22)';
    g.lineWidth = 2 * sx;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(0, H * (0.2 + i * 0.15));
      g.bezierCurveTo(W * 0.3, H * (0.16 + i * 0.15), W * 0.6, H * (0.24 + i * 0.13), W, H * (0.14 + i * 0.17));
      g.stroke();
    }
    g.lineWidth = 1.2 * sx;
    g.strokeStyle = 'rgba(90,80,110,0.12)';
    for (let i = 1; i < 7; i++) {
      g.beginPath(); g.moveTo(W * i / 7, 0); g.quadraticCurveTo(W * i / 7 + 30 * sx, H * 0.5, W * i / 7 + 10 * sx, H); g.stroke();
    }
    // 반짝 하이라이트
    const hl = g.createLinearGradient(0, 0, W, H);
    hl.addColorStop(0.3, 'rgba(255,255,255,0)'); hl.addColorStop(0.45, 'rgba(255,255,255,0.35)'); hl.addColorStop(0.6, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.fillRect(0, 0, W, H);
    g.restore();
    g.lineWidth = 3.5 * sx;
    g.strokeStyle = 'rgba(80,70,100,0.5)';
    path(); g.stroke();
    if (shape === 'dragon') {
      g.fillStyle = new THREE.Color(ca).multiplyScalar(0.7).getStyle();
      g.beginPath(); g.ellipse(438, 62, 16, 8, -0.05, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(416, 186, 16, 9, 0.1, 0, Math.PI * 2); g.fill();
    }
  } else {
    // 비늘 날개: 테두리색 → 안쪽 그라디언트 → 무늬 → 테두리 흰 점
    const edge = new THREE.Color(cb).multiplyScalar(sp.kind === 'moth' ? 0.85 : 0.75);
    g.fillStyle = edge.getStyle();
    path(); g.fill();
    g.save();
    g.translate(6 * sx, 128 * sy); g.scale(0.86, 0.86); g.translate(-6 * sx, -128 * sy);
    path(); g.clip();
    const rg = g.createRadialGradient(0, 128 * sy, 10 * sx, 0, 128 * sy, 240 * sx);
    if (sp.pattern === 'rainbow') {
      for (let i = 0; i <= 6; i++) rg.addColorStop(i / 6, hue(0.95 - i / 7, 0.85, 0.72).getStyle());
    } else if (sp.pattern === 'iri') {
      rg.addColorStop(0, new THREE.Color(cb).getStyle());
      rg.addColorStop(0.5, new THREE.Color(ca).getStyle());
      rg.addColorStop(1, new THREE.Color(cc).getStyle());
    } else {
      rg.addColorStop(0, mix(ca, cb, 0.45).getStyle());
      rg.addColorStop(0.35, new THREE.Color(ca).getStyle());
      rg.addColorStop(1, mix(ca, '#ffffff', 0.35).getStyle());
    }
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    // 무늬
    if (sp.pattern === 'tiger') {
      g.strokeStyle = edge.getStyle();
      g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        g.lineWidth = (16 - i * 2) * sx;
        g.beginPath(); g.moveTo((40 + i * 42) * sx, 8 * sy); g.lineTo((20 + i * 30) * sx, 150 * sy); g.stroke();
      }
    }
    if (sp.pattern === 'eyes') {
      for (const [x, y, r] of [[150, 82, 26], [86, 182, 22]] as const) {
        g.fillStyle = edge.getStyle(); g.beginPath(); g.arc(x * sx, y * sy, r * sx, 0, 7); g.fill();
        g.fillStyle = new THREE.Color(cc).getStyle(); g.beginPath(); g.arc(x * sx, y * sy, r * 0.72 * sx, 0, 7); g.fill();
        g.fillStyle = '#2a1e22'; g.beginPath(); g.arc(x * sx, y * sy, r * 0.4 * sx, 0, 7); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc((x + r * 0.15) * sx, (y - r * 0.18) * sy, r * 0.16 * sx, 0, 7); g.fill();
      }
    }
    if (sp.pattern === 'spots' || sp.pattern === 'plain' || sp.pattern === 'stripes') {
      g.fillStyle = new THREE.Color(sp.pattern === 'spots' ? cb : cc).getStyle();
      g.globalAlpha = sp.pattern === 'spots' ? 0.95 : 0.35;
      for (const [x, y, r] of [[176, 52, 14], [132, 108, 10], [90, 190, 12]] as const) { g.beginPath(); g.arc(x * sx, y * sy, r * sx, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
    // 은은한 비늘 결(가는 방사선)
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 2 * sx;
    for (let i = 0; i < 10; i++) {
      const a = -1.1 + i * 0.24;
      g.beginPath(); g.moveTo(0, 128 * sy); g.lineTo(Math.cos(a) * 300 * sx, 128 * sy + Math.sin(a) * 300 * sy); g.stroke();
    }
    // 몸 쪽 보송한 털
    const fz = g.createRadialGradient(0, 128 * sy, 0, 0, 128 * sy, 70 * sx);
    fz.addColorStop(0, mix(cb, '#ffffff', 0.2).getStyle());
    fz.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = fz; g.fillRect(0, 0, W, H);
    g.restore();
    // 테두리 흰 점(가장자리 따라)
    g.fillStyle = mix(cc, '#ffffff', 0.5).getStyle();
    const dots: Array<[number, number, number]> = shape === 'butterfly'
      ? [[214, 30, 6], [226, 64, 6], [222, 100, 5], [200, 132, 5], [150, 222, 5], [118, 236, 5], [82, 240, 4]]
      : [[230, 60, 5], [238, 96, 5], [228, 130, 4], [130, 212, 4], [100, 222, 4]];
    for (const [x, y, r] of dots) { g.beginPath(); g.arc(x * sx, y * sy, r * sx, 0, 7); g.fill(); }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface WingSpec {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  pivot: THREE.Vector3;
  /** 쉴 때 각도(라디안, + = 위로) */
  rest: number;
  /** 날 때 펄럭 폭·속도(Hz) */
  amp: number;
  hz: number;
  /** 쉬는 동안도 천천히 접었다 폈다(나비) */
  idleAmp: number;
}

export interface BugModel {
  geo: THREE.BufferGeometry;
  mats: THREE.Material[];
  wing: WingSpec | null;
  /** 꼬리 불빛 위치(반딧불이) — 모델 좌표 */
  glow: THREE.Vector3 | null;
  glowColor: THREE.Color | null;
  /** 모델 높이(배율 1 기준) */
  height: number;
}

function wingSpec(sp: BugSpecies, shape: WingShape, w: number, h: number, pivot: V3, rest: number, amp: number, hz: number, idleAmp: number, sweep = 0): WingSpec {
  const geo = new THREE.PlaneGeometry(w, h, 4, 2);
  geo.rotateX(Math.PI / 2);
  geo.translate(w / 2, 0, 0);
  if (sweep) geo.rotateY(sweep);
  geo.userData.shared = true;
  const tex = wingTexture(sp, shape);
  const clear = shape === 'dragon' || shape === 'bee' || shape === 'cicada';
  const mat = clear
    ? new THREE.MeshPhysicalMaterial({
      map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.15,
      iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [200, 500], alphaTest: 0.02,
    })
    : new THREE.MeshPhysicalMaterial({
      map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.62, sheen: 0.8, sheenRoughness: 0.45,
      sheenColor: new THREE.Color('#ffffff'), emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12,
      iridescence: sp.pattern === 'iri' ? 0.8 : 0, iridescenceIOR: 1.5,
    });
  return { geo, mat, pivot: new THREE.Vector3(...pivot), rest, amp, hz, idleAmp };
}

// ───────── 종류별 몸 ─────────
function buildBody(sp: BugSpecies, P: Parts): { wing: WingSpec | null; glow: V3 | null } {
  let [ca, cb, cc] = sp.colors;
  // 땅 곤충이 풀밭에 묻히지 않게: 어두운·회색 몸색은 맑은 파스텔로(나비·벌·반딧불이 등불은 그대로)
  if (!['butterfly', 'moth', 'bee', 'ladybug'].includes(sp.kind)) {
    const shell = SHELL_KINDS.has(sp.kind);
    if (shell) {
      // 갈색·검정 껍질 → 메탈릭 파스텔(청록·자주·금·장미·하늘) — 종마다 하나
      const dk = new THREE.Color(ca), hsl = { h: 0, s: 0, l: 0 };
      dk.getHSL(hsl);
      if (hsl.l < 0.45 || hsl.s < 0.22) {
        let k = 0;
        for (let i = 0; i < sp.id.length; i++) k = (k * 31 + sp.id.charCodeAt(i)) >>> 0;
        const h = [0.47, 0.75, 0.11, 0.94, 0.55][k % 5];
        ca = new THREE.Color().setHSL(h, 0.78, 0.56).getStyle();
        cb = new THREE.Color().setHSL(h + 0.04, 0.6, 0.34).getStyle();
      } else if (sp.pattern !== 'iri' && sp.pattern !== 'rainbow') {
        // 밝은 껍질도 크림색으로 바래지 않게 채도를 올린다
        ca = new THREE.Color().setHSL(hsl.h, Math.max(hsl.s, 0.72), Math.min(hsl.l, 0.6)).getStyle();
      }
    } else {
      ca = pastelize(ca, sp.id, 0.6, 0.42);
      cb = pastelize(cb, sp.id + '-b', 0.44, 0.38);
    }
  }
  const A = C(ca), B = C(cb), Cc = C(cc);
  const pat = sp.pattern ?? 'plain';
  const rainbowFn: ColorFn = (_p, l) => hue(0.5 + Math.atan2(l.x, l.z) / (Math.PI * 2) + l.y * 0.3, 0.8, 0.66);
  switch (sp.kind) {
    case 'butterfly':
    case 'moth': {
      const moth = sp.kind === 'moth';
      const bodyC = moth ? mix(cb, ca, 0.35) : mix(cb, '#fff4ea', 0.25);
      const headC = moth ? mix(ca, '#ffffff', 0.3) : mix(ca, '#fff6e8', pat === 'rainbow' ? 0.5 : 0.3);
      if (moth) {
        P.add(sph(), SLOT.FUZZ, bodyC, { p: [0, 0.15, -0.1], s: [0.12, 0.11, 0.19] });
        P.add(sph(), SLOT.FUZZ, mix(cc, '#ffffff', 0.4), { p: [0, 0.17, 0.04], s: 0.12 });
      } else {
        P.add(new THREE.CapsuleGeometry(0.075, 0.16, 8, 18), SLOT.FUZZ, bodyC, { p: [0, 0.14, -0.08], r: [Math.PI / 2, 0, 0], fn: (_p, l) => (Math.floor((l.y + 0.2) * 22) % 2 ? mix(bodyC, '#ffffff', 0.25) : null) });
      }
      P.add(sph(), SLOT.FUZZ, headC, { p: [0, 0.2, 0.15], s: 0.155 });
      face(P, [0, 0.2, 0.15], 0.155, { headColor: headC, eye: 0.36, spread: 0.52 });
      if (moth) {
        for (const s of [-1, 1]) P.add(sph(), SLOT.FUZZ, mix(cb, '#ffffff', 0.2), { p: [s * 0.08, 0.38, 0.18], r: [0.3, 0, s * -0.45], s: [0.03, 0.12, 0.07] });
      } else {
        antennae(P, [0.05, 0.33, 0.18], [0.15, 0.52, 0.3], mix(cb, '#2a2020', 0.5), 0.012, 0.035);
      }
      const shape: WingShape = moth ? (pat === 'eyes' ? 'luna' : 'moth') : 'butterfly';
      return { wing: wingSpec(sp, shape, 0.58, 0.58, [0.05, 0.19, -0.04], moth ? 0.35 : 1.15, 1.05, moth ? 7 : 9, moth ? 0.15 : 0.32), glow: null };
    }
    case 'dragonfly':
    case 'damselfly': {
      const thin = sp.kind === 'damselfly' ? 0.62 : 1;
      const headC = mix(ca, '#ffffff', 0.15);
      P.add(sph(), SLOT.GLOSS, B, { p: [0, 0.2, 0.22], s: [0.1 * thin, 0.11, 0.15] });
      // 꼬리 마디
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        const r = (0.062 - t * 0.022) * thin;
        const z = 0.06 - t * 0.78;
        const y = 0.2 + Math.sin(t * Math.PI * 0.8) * 0.03 + t * t * 0.04;
        const band = pat === 'rainbow' ? hue(t * 0.85) : pat === 'stripes' && i % 2 ? B : A;
        P.add(sph(18, 14), pat === 'iri' ? SLOT.IRI : SLOT.GLOSS, band, { p: [0, y, z], s: [r, r, r * 1.25], grad: 0.25 });
      }
      P.add(sph(), SLOT.GLOSS, headC, { p: [0, 0.22, 0.4], s: [0.13, 0.12, 0.12] });
      face(P, [0, 0.22, 0.4], 0.13, { headColor: headC, eye: 0.42, spread: 0.68, lift: 0.18, eyeColor: mix(ca, '#1a1020', 0.75).getStyle(), rz: 0.12 });
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) capsuleBetween(P, [s * 0.04, 0.14, 0.28 - i * 0.05], [s * 0.1, 0.05, 0.32 - i * 0.07], 0.012, mix(cb, '#222', 0.5));
      return { wing: wingSpec(sp, 'dragon', 0.8 * (sp.kind === 'damselfly' ? 0.82 : 1), 0.4 * (sp.kind === 'damselfly' ? 0.8 : 1), [0.04, 0.29, 0.2], 0.05, 0.42, 16, 0.03, 0.08), glow: null };
    }
    case 'bee': {
      const r: V3 = [0.2, 0.19, 0.25];
      const stripeFn: ColorFn = (p) => (Math.floor((p.z + 0.45) / 0.085) % 2 === 0 ? A : B);
      P.add(sph(), SLOT.FUZZ, A, { p: [0, 0.22, -0.08], s: r, fn: stripeFn });
      P.add(sph(), SLOT.FUZZ, mix(cc, '#fff8e8', 0.4), { p: [0, 0.25, 0.08], s: 0.14 });
      const headC = mix(A, '#fff4d8', 0.35);
      P.add(sph(), SLOT.FUZZ, headC, { p: [0, 0.25, 0.22], s: 0.13 });
      face(P, [0, 0.25, 0.22], 0.13, { headColor: headC, eye: 0.36, spread: 0.55 });
      antennae(P, [0.04, 0.35, 0.27], [0.1, 0.48, 0.4], '#3a2a26', 0.012, 0.028);
      P.add(new THREE.ConeGeometry(0.03, 0.08, 10), SLOT.GLOSS, '#3a2a26', { p: [0, 0.21, -0.36], r: [-Math.PI / 2, 0, 0] });
      legs6(P, mix(B, '#000', 0.2), { x: 0.08, y: 0.12, zs: [0.12, 0.0, -0.12], reach: 0.1, r: 0.02 });
      return { wing: wingSpec(sp, 'bee', 0.34, 0.34, [0.06, 0.37, 0.04], 0.55, 0.65, 26, 0.0, 0.35), glow: null };
    }
    case 'beetle':
    case 'ladybug':
    case 'stag':
    case 'rhino':
    case 'dungbeetle':
    case 'firefly': {
      const lady = sp.kind === 'ladybug', fire = sp.kind === 'firefly';
      if (lum(A) < 0.2) A.lerp(new THREE.Color('#d8a070'), 0.28);
      if (lum(B) < 0.12) B.lerp(new THREE.Color('#ffffff'), 0.1);
      const hornSlot = SHELL_KINDS.has(sp.kind) ? SLOT.METAL : SLOT.GLOSS;
      const shell: V3 = lady ? [0.27, 0.24, 0.3] : fire ? [0.15, 0.1, 0.27] : sp.kind === 'beetle' ? [0.24, 0.2, 0.36] : [0.27, 0.22, 0.38];
      const sc: V3 = [0, 0.1, -0.04];
      const shellKind = SHELL_KINDS.has(sp.kind);
      const slot = shellKind ? SLOT.METAL : pat === 'iri' || pat === 'rainbow' ? SLOT.IRI : SLOT.GLOSS;
      const shellFn: ColorFn | undefined = pat === 'rainbow' ? (_p, l) => hue(0.9 + l.z * 0.35 + Math.abs(l.x) * 0.15, 0.85, 0.6)
        : pat === 'iri' ? (_p, l) => mix(ca, cb, 0.5 + 0.5 * l.z) : pat === 'stripes' && !lady ? (_p, l) => (Math.floor((l.z + 1) * 4) % 2 ? A : mix(A, B, 0.5)) : undefined;
      P.add(halfSph(), slot, A, { p: sc, s: shell, fn: shellFn, grad: 0.3 });
      // 날개 덮개 가운데 선
      P.add(new THREE.TorusGeometry(1, 0.045, 6, 40, Math.PI), SLOT.GLOSS, mix(A, '#1a1010', 0.45), { p: sc, r: [0, Math.PI / 2, 0], s: [shell[2] * 1.005, shell[1] * 1.005, 0.35], grad: 0 });
      P.add(sph(), SLOT.GLOSS, mix(B, '#000000', 0.1), { p: [0, 0.1, -0.04], s: [shell[0] * 0.92, 0.07, shell[2] * 0.95] });
      if (lady) {
        const n = sp.id.includes('seven') ? 7 : sp.id.includes('heart') ? 6 : 6;
        const dirs: Array<[number, number]> = [[0.5, 0.9], [-0.5, 0.9], [0.9, 0.45], [-0.9, 0.45], [2.3, 0.6], [-2.3, 0.6], [Math.PI, 1.2]];
        if (pat === 'spots') spotsOn(P, sc, shell, dirs.slice(0, n), 0.06, cb);
      }
      if (sp.id.includes('hercules')) spotsOn(P, sc, shell, [[0.6, 0.7], [-0.6, 0.7], [1.6, 0.6], [-1.6, 0.6], [2.6, 0.7], [-2.6, 0.7]], 0.04, cb);
      // 앞가슴 + 머리
      const pron: V3 = fire ? [0.13, 0.07, 0.1] : [shell[0] * 0.66, shell[1] * 0.55, 0.12];
      P.add(sph(), hornSlot, fire ? B : mix(A, B, 0.55), { p: [0, 0.14, shell[2] - 0.02], s: pron, grad: 0.3 });
      const hr = fire ? 0.13 : lady ? 0.15 : 0.17;
      const headC = lady ? C('#2a2424') : fire ? mix(B, A, 0.2) : mix(A, '#fff6ea', 0.28);
      const hz = shell[2] + pron[2] * 0.5 + hr * 0.62;
      P.add(sph(), SLOT.GLOSS, headC, { p: [0, 0.14, hz], s: [hr * 1.1, hr, hr] });
      face(P, [0, 0.14, hz], hr * 1.1, { headColor: headC, eye: 0.36, spread: 0.55, rz: hr });
      if (lady) for (const s of [-1, 1]) P.add(sph(14, 10), SLOT.FLAT, '#ffffff', { p: [s * 0.1, 0.19, shell[2] + 0.02], s: [0.04, 0.025, 0.03], grad: 0 });
      antennae(P, [0.05, 0.2, hz + 0.05], [0.13, 0.32, hz + 0.18], mix(B, '#000', 0.3), 0.011, 0.024);
      legs6(P, mix(B, A, 0.35), { x: shell[0] * 0.62, y: 0.07, zs: [0.12, 0.0, -0.13].map((z) => z * (shell[2] / 0.3)), reach: 0.08, r: 0.03, lift: 0.04 });
      if (sp.kind === 'rhino') {
        tube(P, [[0, 0.24, hz + 0.1], [0, 0.32, hz + 0.22], [0, 0.48, hz + 0.26]], 0.045, mix(A, B, 0.35), SLOT.METAL, 0.055);
        for (const s of [-1, 1]) P.add(sph(14, 10), SLOT.METAL, mix(A, B, 0.35), { p: [s * 0.04, 0.5, hz + 0.28], s: 0.035 });
        tube(P, [[0, 0.22, shell[2] - 0.04], [0, 0.32, shell[2] + 0.06], [0, 0.36, shell[2] + 0.18]], 0.035, mix(A, B, 0.35), SLOT.METAL, 0.04);
      }
      if (sp.kind === 'stag') {
        for (const s of [-1, 1]) {
          tube(P, [[s * 0.09, 0.13, hz + 0.1], [s * 0.2, 0.15, hz + 0.24], [s * 0.08, 0.16, hz + 0.36]], 0.032, mix(A, B, 0.3), SLOT.METAL, 0.036);
          P.add(sph(12, 8), SLOT.METAL, mix(A, B, 0.3), { p: [s * 0.17, 0.18, hz + 0.26], s: 0.03 });
        }
      }
      if (sp.kind === 'dungbeetle') {
        P.add(sph(), SLOT.FUZZ, '#9a7a5a', { p: [0, 0.24, -0.62], s: 0.24, fn: (_p, l) => (Math.sin(l.x * 9) * Math.sin(l.y * 8) * Math.sin(l.z * 7) > 0.2 ? C('#8a6a4a') : null), grad: 0.3 });
      }
      if (fire) {
        // 꼬리 등불
        P.add(sph(), SLOT.GLOW, Cc, { p: [0, 0.1, -0.3], s: [0.12, 0.1, 0.12], grad: 0 });
        return { wing: wingSpec(sp, 'bee', 0.3, 0.3, [0.05, 0.19, 0.1], 0.5, 0.6, 18, 0.0, 0.5), glow: [0, 0.1, -0.32] };
      }
      return { wing: null, glow: null };
    }
    case 'cicada': {
      P.add(sph(), SLOT.FUZZ, A, { p: [0, 0.15, -0.06], s: [0.17, 0.14, 0.32] });
      const headC = mix(B, A, 0.3);
      P.add(sph(), SLOT.GLOSS, headC, { p: [0, 0.18, 0.26], s: [0.19, 0.13, 0.13] });
      P.add(sph(), SLOT.FUZZ, mix(cc, A, 0.4), { p: [0, 0.24, 0.12], s: [0.15, 0.08, 0.12] });
      face(P, [0, 0.18, 0.26], 0.19, { headColor: headC, eye: 0.3, spread: 0.85, lift: 0.12, rz: 0.13 });
      legs6(P, mix(B, '#000', 0.2), { x: 0.1, y: 0.1, zs: [0.18, 0.04, -0.1], reach: 0.1, r: 0.02 });
      return { wing: wingSpec(sp, 'cicada', 0.62, 0.3, [0.04, 0.27, 0.16], -0.45, 0.6, 22, 0.0, 1.38), glow: null };
    }
    case 'grasshopper': {
      // 풀색에 묻히지 않게 몸은 연두빛 레몬 쪽으로, 얼굴은 크림빛으로
      A.lerp(C('#fff3a8'), 0.18);
      const headC = mix(A, '#fffbe8', 0.32);
      P.add(new THREE.CapsuleGeometry(0.1, 0.42, 8, 18), SLOT.FUZZ, A, { p: [0, 0.18, -0.05], r: [Math.PI / 2 - 0.12, 0, 0], fn: pat === 'stripes' ? (_p, l) => (Math.abs(l.x) > 0.06 && l.y > 0 ? C(cc) : null) : pat === 'spots' ? (_p, l) => (Math.sin(l.y * 30) * Math.sin(l.x * 40) > 0.6 ? B : null) : undefined });
      P.add(sph(), SLOT.FUZZ, mix(B, A, 0.4), { p: [0, 0.26, -0.12], s: [0.085, 0.05, 0.28] });
      P.add(sph(), SLOT.FUZZ, headC, { p: [0, 0.26, 0.27], s: [0.12, 0.14, 0.12] });
      face(P, [0, 0.26, 0.27], 0.12, { headColor: headC, eye: 0.4, spread: 0.7, lift: 0.18 });
      antennae(P, [0.04, 0.38, 0.32], [0.12, 0.58, 0.18], mix(B, '#222', 0.3), 0.009, 0.018, 0.12);
      for (const s of [-1, 1]) {
        capsuleBetween(P, [s * 0.09, 0.18, -0.02], [s * 0.15, 0.36, -0.24], 0.05, A, SLOT.FUZZ);
        capsuleBetween(P, [s * 0.15, 0.36, -0.24], [s * 0.17, 0.02, -0.3], 0.022, mix(B, A, 0.3), SLOT.FUZZ);
        capsuleBetween(P, [s * 0.06, 0.12, 0.12], [s * 0.12, 0.0, 0.2], 0.018, mix(B, A, 0.3), SLOT.FUZZ);
        capsuleBetween(P, [s * 0.06, 0.12, 0.02], [s * 0.13, 0.0, 0.05], 0.018, mix(B, A, 0.3), SLOT.FUZZ);
      }
      return { wing: null, glow: null };
    }
    case 'mantis': {
      const orchid = sp.id.includes('orchid');
      P.add(sph(), SLOT.FUZZ, A, { p: [0, 0.16, -0.24], r: [-0.25, 0, 0], s: [0.11, 0.09, 0.26] });
      P.add(sph(), SLOT.FUZZ, B, { p: [0, 0.22, -0.22], r: [-0.25, 0, 0], s: [0.09, 0.05, 0.24] });
      capsuleBetween(P, [0, 0.2, -0.04], [0, 0.42, 0.14], 0.05, A, SLOT.FUZZ);
      const headC = mix(A, '#ffffff', 0.15);
      P.add(sph(), SLOT.FUZZ, headC, { p: [0, 0.5, 0.19], s: [0.15, 0.11, 0.09] });
      face(P, [0, 0.5, 0.19], 0.15, { headColor: headC, eye: 0.33, spread: 0.95, lift: 0.25, rz: 0.09 });
      antennae(P, [0.03, 0.58, 0.22], [0.09, 0.72, 0.14], B, 0.008, 0.016);
      for (const s of [-1, 1]) {
        capsuleBetween(P, [s * 0.05, 0.36, 0.12], [s * 0.08, 0.26, 0.3], 0.035, A, SLOT.FUZZ);
        capsuleBetween(P, [s * 0.08, 0.26, 0.3], [s * 0.06, 0.42, 0.34], 0.03, A, SLOT.FUZZ);
        capsuleBetween(P, [s * 0.05, 0.16, -0.06], [s * 0.18, 0.18, -0.02], 0.016, B, SLOT.FUZZ);
        capsuleBetween(P, [s * 0.18, 0.18, -0.02], [s * 0.22, 0.0, 0.02], 0.014, B, SLOT.FUZZ);
        capsuleBetween(P, [s * 0.05, 0.14, -0.18], [s * 0.2, 0.16, -0.26], 0.016, B, SLOT.FUZZ);
        capsuleBetween(P, [s * 0.2, 0.16, -0.26], [s * 0.24, 0.0, -0.32], 0.014, B, SLOT.FUZZ);
        if (orchid) {
          P.add(sph(), SLOT.FUZZ, mix(A, '#ffffff', 0.4), { p: [s * 0.16, 0.16, -0.03], s: [0.07, 0.02, 0.05] });
          P.add(sph(), SLOT.FUZZ, mix(A, '#ffffff', 0.4), { p: [s * 0.18, 0.14, -0.27], s: [0.08, 0.02, 0.06] });
        }
      }
      return { wing: null, glow: null };
    }
    case 'ant': {
      const honey = sp.id.includes('honeypot');
      P.add(sph(), honey ? SLOT.GLOW : SLOT.GLOSS, honey ? Cc : A, { p: [0, 0.2, -0.22], s: honey ? [0.2, 0.18, 0.22] : [0.15, 0.13, 0.19] });
      P.add(sph(), SLOT.GLOSS, A, { p: [0, 0.17, 0.02], s: [0.07, 0.07, 0.11] });
      const headC = mix(A, '#ffffff', 0.08);
      P.add(sph(), SLOT.GLOSS, headC, { p: [0, 0.2, 0.2], s: [0.13, 0.12, 0.12] });
      face(P, [0, 0.2, 0.2], 0.13, { headColor: headC, eye: 0.34, spread: 0.55, rz: 0.12 });
      for (const s of [-1, 1]) {
        capsuleBetween(P, [s * 0.05, 0.3, 0.24], [s * 0.1, 0.4, 0.26], 0.012, B, SLOT.GLOSS);
        capsuleBetween(P, [s * 0.1, 0.4, 0.26], [s * 0.16, 0.42, 0.38], 0.012, B, SLOT.GLOSS);
        P.add(sph(12, 8), SLOT.GLOSS, B, { p: [s * 0.16, 0.42, 0.38], s: 0.022 });
      }
      legs6(P, B, { x: 0.05, y: 0.14, zs: [0.08, 0.0, -0.08], reach: 0.18, r: 0.016, lift: 0.08 });
      return { wing: null, glow: null };
    }
    case 'spider': {
      const pea = sp.id.includes('peacock');
      const absFn: ColorFn = pat === 'stripes' ? (_p, l) => (Math.floor((l.z + 1) * 3.5) % 2 ? A : B)
        : pat === 'spots' ? (_p, l) => (l.y > 0.4 && Math.abs(l.x) < 0.35 ? C(cc) : null) : pat === 'rainbow' ? rainbowFn : (_p, _l) => null;
      P.add(sph(), SLOT.FUZZ, A, { p: [0, 0.24, -0.2], s: [0.21, 0.19, 0.23], fn: absFn });
      if (pea) P.add(sph(), SLOT.GLOSS, A, { p: [0, 0.42, -0.24], r: [-0.5, 0, 0], s: [0.3, 0.22, 0.04], fn: (_p, l) => hue(0.55 + Math.hypot(l.x, l.y) * 0.5, 0.85, 0.6) });
      const headC = mix(B, A, pat === 'stripes' ? 0.7 : 0.2);
      P.add(sph(), SLOT.FUZZ, headC, { p: [0, 0.2, 0.06], s: [0.16, 0.14, 0.15] });
      face(P, [0, 0.2, 0.06], 0.16, { headColor: headC, eye: 0.36, spread: 0.42, lift: 0.1, rz: 0.15 });
      for (const s of [-1, 1]) P.add(sph(12, 8), SLOT.GLOSS, '#2b1d1e', { p: [s * 0.05, 0.31, 0.15], s: 0.022 });
      const legC = mix(B, '#000', 0.15);
      [0.14, 0.07, 0.0, -0.07].forEach((z, i) => {
        for (const s of [-1, 1]) {
          const fz = z * 2.4 + (i < 2 ? 0.05 : -0.05);
          capsuleBetween(P, [s * 0.1, 0.2, z], [s * 0.26, 0.36, z * 1.7], 0.022, legC);
          capsuleBetween(P, [s * 0.26, 0.36, z * 1.7], [s * 0.38, 0.0, fz], 0.019, legC);
        }
      });
      return { wing: null, glow: null };
    }
    case 'snail': {
      const bodyC = C(cb);
      P.add(new THREE.CapsuleGeometry(0.08, 0.5, 8, 18), SLOT.GLOSS, bodyC, { p: [0, 0.075, 0.0], r: [Math.PI / 2, 0, 0], s: [1.25, 1, 1] });
      P.add(sph(), SLOT.GLOSS, bodyC, { p: [0, 0.17, 0.3], s: [0.11, 0.12, 0.11] });
      face(P, [0, 0.17, 0.3], 0.11, { headColor: bodyC, eye: 0.0001, spread: 0.5, lift: -0.1 });
      for (const s of [-1, 1]) {
        capsuleBetween(P, [s * 0.04, 0.24, 0.33], [s * 0.08, 0.42, 0.38], 0.018, bodyC, SLOT.GLOSS);
        P.add(sph(), SLOT.GLOSS, bodyC, { p: [s * 0.08, 0.45, 0.38], s: 0.05 });
        P.add(sph(), SLOT.GLOSS, '#2b1d1e', { p: [s * 0.08, 0.455, 0.42], s: [0.036, 0.04, 0.025] });
        P.add(sph(10, 8), SLOT.FLAT, '#ffffff', { p: [s * 0.08 + 0.01, 0.47, 0.443], s: 0.012, grad: 0 });
      }
      const spiralFn: ColorFn = (_p, l) => {
        const a = Math.atan2(l.y, l.z) / (Math.PI * 2);
        const r = Math.hypot(l.y, l.z);
        const k = ((r * 3.2 - a) % 1 + 1) % 1;
        if (pat === 'rainbow') return hue(r * 0.9 + a * 0.2 + 0.85, 0.8, 0.72);
        return k < 0.42 ? mix(ca, cc, 0.55) : null;
      };
      P.add(sph(), SLOT.GLOSS, A, { p: [0, 0.3, -0.08], s: [0.15, 0.22, 0.22], fn: spiralFn, grad: 0.25 });
      return { wing: null, glow: null };
    }
    case 'strider': {
      P.add(new THREE.CapsuleGeometry(0.05, 0.3, 6, 14), SLOT.GLOSS, A, { p: [0, 0.12, -0.05], r: [Math.PI / 2, 0, 0], fn: pat === 'iri' ? (_p, l) => mix(ca, cc, 0.5 + l.y * 2) : undefined });
      const headC = mix(A, '#ffffff', 0.2);
      P.add(sph(), SLOT.GLOSS, headC, { p: [0, 0.14, 0.16], s: 0.085 });
      face(P, [0, 0.14, 0.16], 0.085, { headColor: headC, eye: 0.42, spread: 0.6 });
      const legC = mix(B, '#000', 0.1);
      for (const s of [-1, 1]) {
        capsuleBetween(P, [s * 0.03, 0.1, 0.1], [s * 0.1, 0.03, 0.22], 0.012, legC, SLOT.GLOSS);
        capsuleBetween(P, [s * 0.04, 0.11, 0.0], [s * 0.26, 0.2, 0.04], 0.012, legC, SLOT.GLOSS);
        capsuleBetween(P, [s * 0.26, 0.2, 0.04], [s * 0.5, 0.0, 0.18], 0.011, legC, SLOT.GLOSS);
        capsuleBetween(P, [s * 0.04, 0.11, -0.08], [s * 0.22, 0.18, -0.2], 0.012, legC, SLOT.GLOSS);
        capsuleBetween(P, [s * 0.22, 0.18, -0.2], [s * 0.42, 0.0, -0.44], 0.011, legC, SLOT.GLOSS);
        for (const [fx, fz] of [[0.5, 0.18], [0.42, -0.44]]) {
          P.add(new THREE.TorusGeometry(0.06, 0.007, 6, 28), SLOT.FLAT, '#e8f8ff', { p: [s * fx, 0.0, fz], r: [Math.PI / 2, 0, 0], grad: 0 });
          P.add(new THREE.TorusGeometry(0.11, 0.005, 6, 28), SLOT.FLAT, '#d0eeff', { p: [s * fx, 0.0, fz], r: [Math.PI / 2, 0, 0], grad: 0 });
        }
      }
      return { wing: null, glow: null };
    }
    case 'snowbug': {
      const glow = pat === 'glow';
      P.add(sph(), SLOT.GLOSS, A, { p: [0, 0.17, 0], s: [0.2, 0.16, 0.22], fn: (_p, l) => mix(ca, cb, Math.max(0, -l.y) * 0.6 + Math.max(0, l.z) * 0.15), grad: 0.3 });
      const headC = mix(A, '#ffffff', 0.4);
      P.add(sph(), SLOT.FUZZ, headC, { p: [0, 0.18, 0.2], s: 0.12 });
      face(P, [0, 0.18, 0.2], 0.12, { headColor: headC, eye: 0.36, spread: 0.55 });
      // 등 위 눈 결정
      const cz = -0.03, cy = 0.36;
      const crystal = glow ? SLOT.GLOW : SLOT.IRI;
      const cCol = glow ? mix(cc, '#ffffff', 0.2) : C(cc);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const dx = Math.cos(a), dz = Math.sin(a);
        capsuleBetween(P, [0, cy, cz], [dx * 0.17, cy + 0.02, cz + dz * 0.17], 0.016, cCol, crystal, 0);
        for (const sg of [-1, 1]) {
          const bx = dx * 0.1, bz = dz * 0.1;
          const ox = Math.cos(a + sg * 0.6) * 0.06, oz = Math.sin(a + sg * 0.6) * 0.06;
          capsuleBetween(P, [bx, cy + 0.012, cz + bz], [bx + ox, cy + 0.015, cz + bz + oz], 0.011, cCol, crystal, 0);
        }
        P.add(new THREE.ConeGeometry(0.025, 0.06, 8), crystal, cCol, { p: [dx * 0.19, cy + 0.02, cz + dz * 0.19], q: new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(dx, 0, dz)), grad: 0 });
      }
      P.add(sph(16, 12), crystal, cCol, { p: [0, cy + 0.01, cz], s: [0.045, 0.03, 0.045], grad: 0 });
      capsuleBetween(P, [0, 0.27, cz], [0, cy, cz], 0.02, cCol, crystal, 0);
      legs6(P, mix(B, '#ffffff', 0.2), { x: 0.1, y: 0.08, zs: [0.1, 0, -0.1], reach: 0.08, r: 0.02 });
      return { wing: null, glow: glow ? [0, cy, cz] : null };
    }
    case 'sporebug': {
      const glow = pat === 'glow';
      P.add(sph(), SLOT.FUZZ, A, { p: [0, 0.16, 0], s: [0.19, 0.15, 0.21] });
      const headC = mix(A, '#ffffff', 0.2);
      P.add(sph(), SLOT.FUZZ, headC, { p: [0, 0.17, 0.18], s: 0.115 });
      face(P, [0, 0.17, 0.18], 0.115, { headColor: headC, eye: 0.36, spread: 0.55 });
      // 버섯 모자
      P.add(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 16), SLOT.FUZZ, mix(A, '#ffffff', 0.3), { p: [0, 0.32, -0.04] });
      P.add(halfSph(), SLOT.GLOSS, B, { p: [0, 0.34, -0.04], s: [0.25, 0.18, 0.25], grad: 0.35 });
      P.add(new THREE.CylinderGeometry(0.25, 0.22, 0.02, 32), SLOT.FUZZ, mix(A, '#ffe8d8', 0.2), { p: [0, 0.335, -0.04] });
      spotsOn(P, [0, 0.34, -0.04], [0.25, 0.18, 0.25], [[0, 1.2], [0.8, 0.6], [-0.8, 0.6], [2.2, 0.55], [-2.2, 0.55], [Math.PI, 0.9], [1.5, 0.25], [-1.5, 0.25]], 0.045, cc, glow ? SLOT.GLOW : SLOT.FLAT);
      antennae(P, [0.04, 0.26, 0.24], [0.1, 0.38, 0.34], mix(B, '#3a2020', 0.5), 0.01, 0.022);
      legs6(P, mix(A, '#5a4a3a', 0.5), { x: 0.1, y: 0.08, zs: [0.1, 0, -0.1], reach: 0.07, r: 0.02 });
      return { wing: null, glow: glow ? [0, 0.42, -0.04] : null };
    }
    case 'scorpion': {
      const glow = pat === 'glow';
      P.add(sph(), SLOT.GLOSS, A, { p: [0, 0.12, -0.04], s: [0.16, 0.09, 0.24], fn: (_p, l) => (Math.floor((l.z + 1) * 3) % 2 ? null : mix(ca, cb, 0.35)) });
      const headC = mix(A, '#ffffff', glow ? 0.0 : 0.15);
      P.add(sph(), SLOT.GLOSS, headC, { p: [0, 0.15, 0.2], s: [0.13, 0.11, 0.11] });
      face(P, [0, 0.15, 0.2], 0.13, { headColor: headC, eye: 0.36, spread: 0.5, rz: 0.11 });
      for (const s of [-1, 1]) {
        capsuleBetween(P, [s * 0.1, 0.12, 0.18], [s * 0.22, 0.14, 0.34], 0.035, A, SLOT.GLOSS);
        P.add(sph(), SLOT.GLOSS, mix(A, cc, 0.2), { p: [s * 0.25, 0.15, 0.44], s: [0.09, 0.07, 0.11] });
        P.add(new THREE.ConeGeometry(0.035, 0.12, 10), SLOT.GLOSS, mix(A, cc, 0.2), { p: [s * 0.22, 0.16, 0.56], r: [Math.PI / 2, 0, s * 0.2] });
        P.add(new THREE.ConeGeometry(0.03, 0.1, 10), SLOT.GLOSS, mix(A, cc, 0.2), { p: [s * 0.29, 0.15, 0.54], r: [Math.PI / 2, 0, -s * 0.2] });
      }
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        const z = 0.1 - i * 0.08;
        capsuleBetween(P, [s * 0.12, 0.1, z], [s * 0.22, 0.14, z - 0.03], 0.016, B);
        capsuleBetween(P, [s * 0.22, 0.14, z - 0.03], [s * 0.28, 0.0, z - 0.06], 0.014, B);
      }
      const N = 7;
      for (let i = 0; i < N; i++) {
        const a = (i / (N - 1)) * Math.PI * 0.95;
        const p: V3 = [0, 0.14 + Math.sin(a) * 0.28, -0.28 - Math.sin(a * 0.5) * 0.18 + (1 - Math.cos(a)) * 0.12];
        const r = 0.065 - i * 0.004;
        P.add(sph(18, 14), glow && i === N - 1 ? SLOT.GLOW : SLOT.GLOSS, i % 2 ? A : mix(A, cb, 0.25), { p, s: r });
      }
      const tip: V3 = [0, 0.38, 0.0];
      P.add(sph(), glow ? SLOT.GLOW : SLOT.GLOSS, Cc, { p: tip, s: [0.05, 0.06, 0.07] });
      return { wing: null, glow: glow ? tip : null };
    }
    case 'pillbug': {
      for (let i = 0; i < 7; i++) {
        const z = 0.22 - i * 0.075;
        const w = 0.2 - Math.abs(i - 3) * 0.018;
        P.add(sph(), SLOT.GLOSS, i % 2 ? A : mix(A, B, 0.45), { p: [0, 0.1, z], s: [w, 0.13 - Math.abs(i - 3) * 0.01, 0.07], grad: 0.35 });
      }
      const headC = mix(A, '#ffffff', 0.25);
      P.add(sph(), SLOT.GLOSS, headC, { p: [0, 0.1, 0.29], s: [0.13, 0.09, 0.08] });
      face(P, [0, 0.1, 0.29], 0.13, { headColor: headC, eye: 0.3, spread: 0.5, lift: 0.15, rz: 0.08 });
      antennae(P, [0.05, 0.14, 0.33], [0.14, 0.2, 0.44], B, 0.01, 0.02);
      return { wing: null, glow: null };
    }
    case 'caterpillar': {
      for (let i = 0; i < 6; i++) {
        const z = -0.32 + i * 0.1;
        const y = 0.1 + Math.sin(i * 1.3) * 0.025;
        const col = pat === 'stripes' ? (i % 2 ? A : B) : A;
        P.add(sph(), SLOT.FUZZ, col, { p: [0, y, z], s: [0.1, 0.1 - Math.abs(i - 3) * 0.004, 0.08] });
        if (pat === 'spots') for (const s of [-1, 1]) P.add(sph(12, 10), SLOT.FLAT, cc, { p: [s * 0.085, y + 0.03, z], s: [0.012, 0.024, 0.024], grad: 0 });
        for (const s of [-1, 1]) P.add(sph(10, 8), SLOT.FUZZ, mix(B, A, 0.5), { p: [s * 0.06, 0.012, z], s: 0.022 });
      }
      const headC = mix(A, '#fff8d8', 0.25);
      P.add(sph(), SLOT.FUZZ, headC, { p: [0, 0.17, 0.3], s: 0.13 });
      face(P, [0, 0.17, 0.3], 0.13, { headColor: headC, eye: 0.34, spread: 0.55 });
      antennae(P, [0.05, 0.27, 0.32], [0.09, 0.38, 0.36], cc, 0.012, 0.03);
      return { wing: null, glow: null };
    }
  }
  return { wing: null, glow: null };
}

const CACHE = new Map<string, BugModel>();

/** 종 모델(지오메트리·날개 재질은 공유, 종마다 한 번만 만든다) */
export function bugModel(sp: BugSpecies): BugModel {
  const hit = CACHE.get(sp.id);
  if (hit) return hit;
  const P = new Parts();
  const { wing, glow } = buildBody(sp, P);
  // 재질 칸별로 묶어 한 지오메트리(그룹) — 바닥을 y = 0 에
  const bySlot = new Map<number, THREE.BufferGeometry[]>();
  for (const { geo, slot } of P.list) {
    const g = geo.index ? geo : geo;
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot)!.push(g);
  }
  const all = bugMats();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  for (const [slot, list] of [...bySlot.entries()].sort((a, b) => a[0] - b[0])) {
    const m = mergeGeometries(list.map((g) => (g.index ? g : g)), false);
    if (!m) continue;
    geos.push(m);
    mats.push(all[slot]);
  }
  const geo = mergeGeometries(geos, true)!;
  geo.computeBoundingBox();
  const minY = geo.boundingBox!.min.y;
  geo.translate(0, -minY, 0);
  geo.computeBoundingSphere();
  geo.userData.shared = true;
  if (wing) wing.pivot.y -= minY;
  const model: BugModel = {
    geo, mats, wing,
    glow: glow ? new THREE.Vector3(glow[0], glow[1] - minY, glow[2]) : null,
    glowColor: glow ? C(sp.colors[2]) : null,
    height: geo.boundingBox!.max.y - minY,
  };
  CACHE.set(sp.id, model);
  return model;
}

export interface BugMesh {
  root: THREE.Group;
  body: THREE.Mesh;
  wl: THREE.Mesh | null;
  wr: THREE.Mesh | null;
  model: BugModel;
}

/** 곤충 하나(몸 + 좌우 날개). root 의 scale = 종 크기 */
/** 세계 배율: 동숲처럼 실제보다 크게(멀리서도 읽히게) */
export const WORLD_SCALE = 1.85;
/** 세계에서의 배율 — 아주 작은 종(무당벌레·꿀벌·반딧불이)도 신발보다 커 보이게 바닥값을 둔다 */
export const bugScale = (sp: BugSpecies) => (sp.size < 0.28 ? 0.28 - (0.28 - sp.size) * 0.35 : sp.size) * WORLD_SCALE;

export function makeBug(sp: BugSpecies, scale = bugScale(sp)): BugMesh {
  const model = bugModel(sp);
  const root = new THREE.Group();
  const body = new THREE.Mesh(model.geo, model.mats);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);
  let wl: THREE.Mesh | null = null, wr: THREE.Mesh | null = null;
  if (model.wing) {
    const w = model.wing;
    wr = new THREE.Mesh(w.geo, w.mat);
    wr.position.copy(w.pivot);
    wl = new THREE.Mesh(w.geo, w.mat);
    wl.position.set(-w.pivot.x, w.pivot.y, w.pivot.z);
    wl.scale.x = -1;
    wr.rotation.z = w.rest; wl.rotation.z = -w.rest;
    for (const m of [wl, wr]) { m.castShadow = false; m.renderOrder = 3; }
    root.add(wl, wr);
  }
  root.scale.setScalar(scale);
  return { root, body, wl, wr, model };
}

/** 날개 각도(위 + ) */
export function setWings(b: BugMesh, angle: number) {
  if (!b.wr || !b.wl) return;
  b.wr.rotation.z = angle;
  b.wl.rotation.z = -angle;
}
