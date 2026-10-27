// 꼬마 공룡 모델 — 한 줄기 척추를 따라 뽑은 매끈한 몸(목까지 한 덩어리) + 큰 둥근 머리(얼굴 그림 데칼)
// + 꼬리·다리(움직이는 부품). 색은 전부 정점 색(등 → 옆 → 배 그라디언트, 점·줄무늬)이라 재질은 공용 하나.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DinoSpec } from './data';
import { addEyes, addBlush, blobShadow, crownMesh, PALETTE, type EyeSet } from '../../core/art';

const sm = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const C = (s: string) => new THREE.Color(s);

// ───────────── 공용 재질 ─────────────
/** 카메라에 너무 가까울 때 디더 페이드 단계(1 = 불투명) */
export const FADE_LEVELS = [1, 0.66, 0.33] as const;
const skinMats: THREE.MeshPhysicalMaterial[] = [];
/** 공룡 피부: 정점 색 + 약한 보송 sheen(몸 색 톤) + 가장자리 살짝 어둡게(덩어리감). level>0 은 디더 페이드 판 */
export function dinoSkin(level = 0): THREE.MeshPhysicalMaterial {
  if (skinMats[level]) return skinMats[level];
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.64, sheen: 0.22, sheenRoughness: 0.75, sheenColor: C('#d9c3a6'),
    transparent: false, transmission: 0,
  });
  const fade = FADE_LEVELS[level];
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFade = { value: fade };
    sh.fragmentShader = 'uniform float uFade;\n' + sh.fragmentShader
      .replace('void main() {', `void main() {
  if (uFade < 0.999) {
    float ign = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
    if (ign >= uFade) discard;
  }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  {
    float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
    float rim = pow(1.0 - ndv, 2.4);
    gl_FragColor.rgb *= mix(1.0, 0.72, rim);
  }`);
  };
  m.customProgramCacheKey = () => 'dinoSkin';
  skinMats[level] = m;
  return m;
}

let faceMat: THREE.MeshStandardMaterial | null = null;
/** 얼굴 데칼(콧구멍·웃는 입) — 투명 배경, 머리 앞 반쪽에 정면 투영. 눈·볼터치는 art.addEyes(공용 얼굴) */
export function faceMaterial(): THREE.MeshStandardMaterial {
  if (faceMat) return faceMat;
  faceMat = new THREE.MeshStandardMaterial({
    map: faceTex(), transparent: true, depthWrite: false, roughness: 0.35,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  faceMat.userData.shared = true;
  return faceMat;
}

function faceTex(): THREE.Texture {
  const n = 512;
  if (typeof document === 'undefined') { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); t.needsUpdate = true; return t; }
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const X = (x: number) => (0.5 + x / 2) * n, Y = (y: number) => (0.5 - y / 2) * n, W = (w: number) => (w / 2) * n;
  const TAU = Math.PI * 2;
  // 콧구멍(주둥이 앞 위)
  g.fillStyle = 'rgba(70,58,74,0.7)';
  for (const m of [-1, 1]) { g.beginPath(); g.ellipse(X(m * 0.12), Y(-0.2), W(0.028), W(0.02), m * 0.3, 0, TAU); g.fill(); }
  // 웃는 입: ω 모양(먹색)
  g.strokeStyle = '#5a3a44'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = W(0.028);
  g.beginPath();
  const my = Y(-0.36), mw = W(0.1);
  g.moveTo(X(0) - mw * 2.0, my - mw * 0.3);
  g.quadraticCurveTo(X(0) - mw, my + mw * 1.1, X(0), my + mw * 0.05);
  g.quadraticCurveTo(X(0) + mw, my + mw * 1.1, X(0) + mw * 2.0, my - mw * 0.3);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ───────────── 지오메트리 도우미 ─────────────
type ColFn = (p: THREE.Vector3, k: number, n: THREE.Vector3) => THREE.Color;

/** 척추 곡선을 따라 타원 단면을 뽑는다. prof(t) = [rx, ry], 색은 col(위치, 등-배 값 k∈[-1,1]) */
export function loft(pts: THREE.Vector3[], prof: (t: number) => [number, number], col: ColFn, seg = 56, radial = 28): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const pos: number[] = [], cols: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3(), tg = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), v = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tg);
    side.crossVectors(tg, Y);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    up.crossVectors(side, tg).normalize();
    // 등 쪽이 위가 되도록
    if (up.y < 0 && Math.abs(tg.y) < 0.95) up.negate();
    const [rx, ry] = prof(t);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      v.copy(p).addScaledVector(side, ca * rx).addScaledVector(up, sa * ry);
      pos.push(v.x, v.y, v.z);
      const c = col(v, sa, side.clone().multiplyScalar(ca).addScaledVector(up, sa));
      cols.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c2 = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
    idx.push(a, b, c2, b, d, c2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 구(32×24 이상) 변형 + 정점 색 */
function blob(rx: number, ry: number, rz: number, col: ColFn, ws = 36, hs = 26, deform?: (v: THREE.Vector3) => void): THREE.BufferGeometry {
  const base = new THREE.SphereGeometry(1, ws, hs);
  base.deleteAttribute('uv'); base.deleteAttribute('normal');
  const g = mergeVertices(base, 1e-5);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    n.copy(v);
    const k = v.y;
    deform?.(v);
    v.set(v.x * rx, v.y * ry, v.z * rz);
    p.setXYZ(i, v.x, v.y, v.z);
    const c = col(v, k, n);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

const solid = (s: string): ColFn => { const c = C(s); return () => c; };

function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  g.applyMatrix4(m);
  return g;
}

/** 둥근 끝 뿔(회전체) — 높이 h, 밑 반지름 r, 끝은 동글게 */
function horn(r: number, h: number, color: string, bend = 0): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = r * Math.pow(1 - t, 0.85) + r * 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.02)) * (t > 0.85 ? 0 : 0);
    pts.push(new THREE.Vector2(Math.max(rr, t > 0.98 ? 0 : r * 0.18 * Math.sqrt(1 - t)), h * t));
  }
  pts.push(new THREE.Vector2(0, h * 1.02));
  const g = new THREE.LatheGeometry(pts, 24);
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-5);
  if (bend) {
    const p = m.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h; p.setZ(i, p.getZ(i) + bend * y * y * h); }
  }
  m.computeVertexNormals();
  const c = C(color), cols = new Float32Array((m.attributes.position.count) * 3);
  for (let i = 0; i < m.attributes.position.count; i++) cols.set([c.r, c.g, c.b], i * 3);
  m.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return m;
}

/** 두툼하고 둥근 판(등판·돛·볏): 윤곽선을 베벨 압출 */
function roundPlate(shape: THREE.Shape, thick: number, color: string, edge?: string): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.9, bevelSize: thick * 0.9, bevelSegments: 5, curveSegments: 24 });
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4);
  m.translate(0, 0, -thick / 2);
  m.computeVertexNormals();
  m.computeBoundingBox();
  const bb = m.boundingBox!;
  const c0 = C(color), c1 = C(edge ?? color), cc = new THREE.Color();
  const p = m.attributes.position as THREE.BufferAttribute, cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - bb.min.y) / Math.max(1e-4, bb.max.y - bb.min.y);
    cc.copy(c0).lerp(c1, sm(0.35, 1, t));
    cols.set([cc.r, cc.g, cc.b], i * 3);
  }
  m.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return m;
}

function strip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  // 병합용: position·normal·color 만 남긴다
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g.index ? g : g;
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const ok = list.map((g) => { strip(g); return g.index ? g.toNonIndexed() : g; });
  const m = mergeGeometries(ok, false)!;
  m.userData.shared = true;
  return m;
}

// 무늬용 해시 노이즈(결정적)
function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
function spotField(v: THREE.Vector3, freq: number): number {
  // 셀 안 둥근 점: 가장 가까운 셀 중심까지 거리
  const fx = v.x * freq, fy = v.y * freq, fz = v.z * freq;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  let best = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const cx = ix + a, cy = iy + b, cz = iz + c;
    const h = hash3(cx, cy, cz);
    if (h < 0.45) continue;
    const px = cx + hash3(cy, cz, cx), py = cy + hash3(cz, cx, cy), pz = cz + hash3(cx + 7, cy, cz);
    const d = Math.hypot(fx - px, fy - py, fz - pz) / (0.22 + 0.16 * h);
    if (d < best) best = d;
  }
  return 1 - sm(0.75, 1.0, best);
}

/** 머리 구 변형: 아래 앞쪽으로 동글 주둥이, 아래 볼은 통통(단위 구 좌표에서) */
function headDeform(snout: number) {
  return (v: THREE.Vector3) => {
    const s = Math.exp(-(((v.y + 0.22) / 0.42) ** 2)) * Math.pow(Math.max(0, v.z), 1.6);
    v.z += snout * s * 1.1;
    v.y -= snout * 0.15 * s;
    const ch = Math.exp(-(((v.y + 0.3) / 0.4) ** 2));
    v.x *= 1 + 0.08 * ch;
  };
}

/** 공용 눈 자리: 타원 머리 앞 위쪽 표면(주둥이 변형까지 따라). 지름 = 머리 높이의 약 26% */
function eyePose(hrx: number, hry: number, hrz: number, snout: number): DinoTemplate['eyes'] {
  const def = headDeform(snout);
  const el = 0.26, gx = 0.37;
  const pos: THREE.Vector3[] = [], n: THREE.Vector3[] = [];
  for (const m of [-1, 1]) {
    const uy = Math.sin(el), ux = m * gx, uz = Math.sqrt(Math.max(0.05, 1 - ux * ux - uy * uy));
    const v = new THREE.Vector3(ux, uy, uz);
    def(v);
    const nn = new THREE.Vector3(ux / hrx, uy / hry, uz / hrz).normalize();
    // 정면 쪽으로 조금 돌린다(눈이 옆을 너무 보지 않게)
    nn.lerp(new THREE.Vector3(0, 0.1, 1), 0.35).normalize();
    pos.push(new THREE.Vector3(v.x * hrx, v.y * hry, v.z * hrz).addScaledVector(nn, 0.004));
    n.push(nn);
  }
  return { size: hry * 0.52, pos: [pos[0], pos[1]], n: [n[0], n[1]] };
}

// ───────────── 템플릿(종별 한 번) ─────────────
export interface DinoTemplate {
  spec: DinoSpec;
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
  tail: THREE.BufferGeometry | null;
  legF: THREE.BufferGeometry | null;
  legB: THREE.BufferGeometry | null;
  /** 다리 관절 위치(오른쪽 +x 기준, 왼쪽은 x 반전) */
  hipF: THREE.Vector3; hipB: THREE.Vector3;
  headPos: THREE.Vector3;
  tailPos: THREE.Vector3;
  seat: THREE.Vector3;
  /** 몸 높이(머리 꼭대기) — 하트·말풍선 위치 */
  height: number;
  /** 몸 반경(충돌·상호작용 거리) */
  radius: number;
  /** 공용 눈(art.addEyes) 자리: 머리 원점 기준 왼(-x)·오른 위치·법선, 지름 */
  eyes: { size: number; pos: [THREE.Vector3, THREE.Vector3]; n: [THREE.Vector3, THREE.Vector3] };
}

const templates = new Map<string, DinoTemplate>();

export function template(spec: DinoSpec): DinoTemplate {
  const hit = templates.get(spec.id);
  if (hit) return hit;
  const t = makeTemplate(spec);
  templates.set(spec.id, t);
  return t;
}

const CREAM = C('#fff1d6');
/** 몸 색 3톤: 옆구리는 등 색 쪽으로 진하게, 배는 크림(#fff1d6)까지만 밝게(흰 젤리처럼 안 날아가게) */
function tones(spec: DinoSpec) {
  const top = C(spec.col.top);
  const side = C(spec.col.side).lerp(top, 0.35);
  const b = C(spec.col.belly);
  const belly = side.clone().lerp(b.lerp(CREAM, 0.6), 0.5);
  // 크림보다 밝으면 크림 쪽으로 누른다
  const hsl = { h: 0, s: 0, l: 0 }, ch = { h: 0, s: 0, l: 0 };
  belly.getHSL(hsl); CREAM.getHSL(ch);
  if (hsl.l > ch.l) belly.setHSL(hsl.h, hsl.s, ch.l);
  return { top, side, belly };
}

function skinColor(spec: DinoSpec): ColFn {
  const { top, side, belly } = tones(spec);
  const mark = C(spec.col.mark ?? spec.col.top);
  const spots = spec.feat.includes('spots'), stripes = spec.feat.includes('stripes');
  const cc = new THREE.Color();
  return (v, k) => {
    cc.copy(belly).lerp(side, sm(-0.75, -0.2, k)).lerp(top, sm(0.15, 0.95, k));
    if (spots && k > -0.1) {
      const s = spotField(v, 7.5);
      cc.lerp(mark, s * 0.75 * sm(-0.1, 0.3, k));
    }
    if (stripes && k > 0.05) {
      const s = sm(0.55, 0.8, Math.abs(Math.sin(v.z * 22 + Math.sin(v.y * 9) * 0.6)));
      cc.lerp(mark, s * 0.8 * sm(0.05, 0.4, k));
    }
    return cc.clone();
  };
}

function makeTemplate(spec: DinoSpec): DinoTemplate {
  const S = spec;
  const col = skinColor(S);
  const legLen = S.leg.len;
  const B = S.body;
  // 엉덩이(몸 중심) 높이: 다리 길이 + 몸 아래 반지름 일부
  const hipY = legLen + B.ry * (S.biped ? 0.55 : 0.62);
  const tilt = B.tilt ?? 0;
  const L = B.len;
  // 몸 척추(뒤 → 앞), 기울기는 엉덩이 중심으로 들어 올린다
  const rot = (z: number, y: number) => new THREE.Vector3(0, hipY + y + Math.sin(tilt) * z, Math.cos(tilt) * z);
  const back = rot(-L * 0.55, 0), mid = rot(0, 0.02), front = rot(L * 0.45, 0.02);
  const neckEnd = new THREE.Vector3(0, front.y + S.neck.up, front.z + S.neck.fwd);
  const neckMid = new THREE.Vector3(0, front.y + S.neck.up * 0.55, front.z + S.neck.fwd * 0.75);
  const pts = [back, rot(-L * 0.3, 0.01), mid, front, neckMid, neckEnd];
  const bodyLen = L, neckLen = Math.hypot(S.neck.fwd, S.neck.up) + 0.001;
  const fb = bodyLen / (bodyLen + neckLen);
  const prof = (t: number): [number, number] => {
    if (t <= fb) {
      const u = t / fb;
      const back = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, 0.5 - u) / 0.5, 2)));
      const frontK = 1 - sm(0.55, 1.0, u) * (1 - S.neck.r / B.rx);
      const frontKy = 1 - sm(0.55, 1.0, u) * (1 - S.neck.r / B.ry);
      return [Math.max(0.02, B.rx * back * frontK), Math.max(0.02, B.ry * back * frontKy * (1 + 0.06 * Math.sin(u * Math.PI)))];
    }
    const v = (t - fb) / (1 - fb);
    const r = S.neck.r * (1 + 0.25 * (1 - sm(0, 0.6, v)));
    return [r, r];
  };
  const parts: THREE.BufferGeometry[] = [loft(pts, prof, col, 48, 28)];

  // 넓적다리(두 발 공룡): 통통한 허벅지
  // 다리는 몸통 실루엣 안쪽에서 시작(허벅지가 몸통에 녹아든다)
  const tn = tones(S);
  const limbC = tn.side.clone().lerp(tn.top, 0.45);
  const limbCol: ColFn = (_v, k) => limbC.clone().multiplyScalar(0.9 + 0.1 * sm(-1, 0.6, k));
  const hipF = new THREE.Vector3(B.rx * (S.biped ? 0.55 : 0.5), hipY - B.ry * (S.biped ? 0.1 : 0.2), S.biped ? -L * 0.05 : L * 0.28);
  const hipB = new THREE.Vector3(B.rx * (S.biped ? 0.55 : 0.44), hipY - B.ry * (S.biped ? 0.1 : 0.2), S.biped ? -L * 0.05 : -L * 0.24);
  if (S.biped) {
    for (const m of [-1, 1]) parts.push(blob(S.leg.r * 1.4, S.leg.r * 1.65, S.leg.r * 1.75, (v, k) => limbC.clone().lerp(tn.top, 0.25 * sm(0, 1, k)), 32, 24).translate(m * B.rx * 0.42, hipY - B.ry * 0.12, -L * 0.05));
    // 짧은 앞발(가슴에 붙은 동글 팔)
    if (S.arm) {
      const a = S.arm;
      const chest = rot(L * 0.35, -B.ry * 0.25);
      for (const m of [-1, 1]) {
        // 짧고 통통한 팔: 어깨에서 앞·아래로, 끝은 동글 손
        const ar = a.r * 1.7;
        const ex = m * B.rx * 0.62, ey = chest.y - a.len * 0.2, ez = chest.z + B.ry * 0.55;
        // 앞으로 쑥 내민 동글 팔(한 덩어리) + 동글 손
        const arm = blob(ar, a.len * 0.5, ar, () => limbC, 24, 18);
        place(arm, ex, ey, ez, 1.15, 0, -m * 0.25);
        parts.push(arm);
        parts.push(blob(ar * 1.2, ar * 1.1, ar * 1.2, () => tn.belly, 16, 12).translate(ex + m * 0.01, ey - a.len * 0.18, ez + a.len * 0.42));
        // 엄지 뿔(엄지척): 손 위로 동글 뿔 하나
        if (S.feat.includes('thumb')) parts.push(place(horn(ar * 0.55, a.len * 0.6, '#fff6e2', 0), ex + m * ar * 0.2, ey - a.len * 0.08, ez + a.len * 0.44, 0, 0, -m * 0.25));
        // 긴 손톱(손톱정원사): 앞·아래로 휜 크림 손톱 3개
        if (S.feat.includes('claws')) for (const k of [-1, 0, 1]) parts.push(place(horn(ar * 0.3, a.len * 1.05, '#fff6e2', -0.35), ex + m * 0.01 + k * ar * 0.55, ey - a.len * 0.22, ez + a.len * 0.5, 1.95, 0, k * 0.15));
      }
    }
  } else {
    // 네 발 공룡: 따로 혹을 붙이지 않는다(다리 윗부분이 몸통 속에서 시작)
  }
  // 안장(탈 수 있는 공룡): 색 천 + 금색 테두리, 등 곡면을 따라 휜다
  if (S.mount) {
    const cloth = C('#e2525c'), trim = C('#ffd36b');
    const sw = B.rx * 0.78, sl = L * 0.2;
    const seatZ = S.biped ? -L * 0.1 : -L * 0.05;
    const backY = hipY + Math.sin(tilt) * seatZ + B.ry * 0.97;
    const saddle = blob(sw, 0.07, sl, (v) => (Math.hypot(v.x / sw, v.z / sl) > 0.8 ? trim : cloth), 36, 16, (v) => { if (v.y < 0) v.y *= 0.3; });
    const sp = saddle.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i) / B.rx; sp.setY(i, sp.getY(i) - B.ry * 0.55 * x * x); }
    saddle.computeVertexNormals();
    saddle.translate(0, backY, seatZ);
    parts.push(saddle);
  }

  // 등 장식
  const spineAt = (u: number) => {
    // 몸 위 등선(곡선 근사): u 0 = 엉덩이 뒤, 1 = 어깨
    const z = -L * 0.45 + u * L * 0.9;
    const p = rot(z, 0);
    const k = Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.5) / 0.62, 2)));
    return new THREE.Vector3(0, p.y + B.ry * k * 0.92, p.z);
  };
  if (S.feat.includes('plates')) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const u = 0.08 + (i / (n - 1)) * 0.82;
      const p = spineAt(u);
      const h = 0.18 + 0.2 * Math.sin(Math.PI * (0.15 + u * 0.75));
      const sh = new THREE.Shape();
      sh.moveTo(-h * 0.45, 0); sh.quadraticCurveTo(-h * 0.55, h * 0.75, 0, h); sh.quadraticCurveTo(h * 0.55, h * 0.75, h * 0.45, 0); sh.lineTo(-h * 0.45, 0);
      const pl = roundPlate(sh, 0.02, S.col.accent, '#ffe0ea');
      place(pl, (i % 2 ? 1 : -1) * 0.07, p.y - 0.06, p.z, 0, Math.PI / 2, (i % 2 ? -1 : 1) * 0.18);
      parts.push(pl);
    }
  }
  if (S.feat.includes('sail')) {
    const sh = new THREE.Shape();
    const w = L * 0.85, h = 0.62;
    sh.moveTo(-w / 2, 0);
    sh.bezierCurveTo(-w * 0.45, h * 0.9, -w * 0.1, h * 1.15, w * 0.1, h * 1.05);
    sh.bezierCurveTo(w * 0.35, h * 0.95, w * 0.5, h * 0.4, w / 2, 0);
    sh.lineTo(-w / 2, 0);
    const sail = roundPlate(sh, 0.025, S.col.accent, '#ffd0b0');
    const p = spineAt(0.5);
    place(sail, 0, p.y - 0.12, p.z - 0.02, -tilt, Math.PI / 2, 0);
    sail.rotateX(0); parts.push(sail);
    // 돛 줄무늬(등뼈): 작은 띠 대신 몇 줄 진한 점
  }
  if (S.feat.includes('shell')) {
    const sc = C(S.col.accent), sc2 = C(S.col.mark ?? '#ffffff');
    const shell = blob(B.rx * 1.08, B.ry * 0.95, L * 0.58, (v, k) => k > 0.1 ? sc.clone().lerp(sc2, 0.15 * Math.sin(v.z * 30) ** 2) : sc, 40, 28, (v) => { if (v.y < 0) v.y *= 0.25; });
    shell.translate(0, hipY + 0.03, 0);
    parts.push(shell);
    // 동글 혹
    const knob = C(S.col.mark ?? '#fff');
    for (let i = 0; i < 4; i++) for (let j = -2; j <= 2; j++) {
      const u = 0.15 + i * 0.23, a = j * 0.5;
      const z = -L * 0.45 + u * L * 0.9;
      const y = hipY + 0.03 + B.ry * 0.95 * Math.cos(a) * Math.sqrt(Math.max(0, 1 - ((u - 0.5) / 0.6) ** 2));
      parts.push(blob(0.055, 0.045, 0.055, () => knob, 16, 12).translate(Math.sin(a) * B.rx * 1.02, y, z));
    }
  }

  if (S.feat.includes('fluffy')) {
    // 털 구 여러 개(GDD 파츠 fluffy): 등·옆구리에 동글동글 털뭉치 — 등 색과 옆 색 사이로 살짝씩 달리
    const f0 = tones(S).top, f1 = tones(S).side;
    const rnd = (i: number) => hash3(i * 1.7, i * 0.3, 4.1);
    let n = 0;
    for (let i = 0; i < 6; i++) for (let j = -3; j <= 3; j++) {
      const u = 0.08 + i * 0.17, a = j * 0.42 + (i % 2) * 0.2;
      const k = Math.sqrt(Math.max(0, 1 - ((u - 0.5) / 0.62) ** 2));
      if (k <= 0.05 || Math.abs(a) > 1.45) continue;
      const z = -L * 0.45 + u * L * 0.9;
      const p0 = rot(z, 0);
      const r = (0.085 + 0.05 * rnd(n)) * Math.max(0.8, B.rx / 0.45);
      const c = f0.clone().lerp(f1, 0.25 + 0.5 * rnd(n + 9));
      parts.push(blob(r, r * 0.85, r, () => c, 14, 10).translate(Math.sin(a) * B.rx * 0.93, p0.y + B.ry * 0.9 * Math.cos(a) * k, z));
      n++;
    }
  }

  const body = merge(parts);

  // ── 머리 ──
  const H = S.head;
  const hrx = H.r, hry = H.ry ?? H.r * 0.92, hrz = H.rz ?? H.r;
  const { top, side, belly } = tones(S);
  const headCol: ColFn = (v, k) => belly.clone().lerp(side, sm(-0.65, -0.3, k)).lerp(top, sm(0.3, 0.95, k));
  const snoutDeform = headDeform(H.snout);
  const headGeo = blob(hrx, hry, hrz, headCol, 48, 36, snoutDeform);
  // 얼굴 데칼: 앞쪽 삼각형만, 정면 투영 UV
  const face = faceGeo(headGeo, hrx, hry);
  const headParts: THREE.BufferGeometry[] = [headGeo];
  if (S.feat.includes('frill')) {
    const fr = C(S.col.mark ?? S.col.top), fr2 = C(S.col.side);
    const frill = blob(hrx * 1.55, hry * 1.35, 0.07, (v, k) => fr2.clone().lerp(fr, sm(0.3, 0.95, Math.hypot(v.x / (hrx * 1.55), v.y / (hry * 1.35)))), 40, 24);
    place(frill, 0, hry * 0.45, -hrz * 0.35, -0.45, 0, 0);
    headParts.push(frill);
    // 가장자리 동글 장식
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.05 + 0.9 * (i / (n - 1)));
      const x = Math.cos(a) * hrx * 1.5, y = Math.sin(a) * hry * 1.3;
      const b = blob(0.07, 0.07, 0.05, solid(S.col.accent), 16, 12);
      place(b, 0, 0, 0);
      b.translate(x, y, 0);
      const m = new THREE.Matrix4().makeRotationX(-0.45);
      b.applyMatrix4(m);
      b.translate(0, hry * 0.45, -hrz * 0.35);
      headParts.push(b);
    }
  }
  if (S.feat.includes('horns3')) {
    for (const m of [-1, 1]) headParts.push(place(horn(0.08, 0.38, '#fff6e2', 0.35), m * hrx * 0.42, hry * 0.62, hrz * 0.35, 0.75, 0, -m * 0.3));
    headParts.push(place(horn(0.065, 0.18, '#fff6e2', 0.2), 0, -hry * 0.02, hrz + H.snout * 0.72, 1.0, 0, 0));
  }
  if (S.feat.includes('noseHorn')) headParts.push(place(horn(0.055, 0.12, '#fff6e2'), 0, -hry * 0.02, hrz + H.snout * 0.7, 1.0, 0, 0));
  if (S.feat.includes('dome')) {
    const d1 = C(S.col.accent), d2 = C(S.col.top);
    headParts.push(blob(hrx * 0.92, hry * 0.62, hrz * 0.9, (v, k) => d2.clone().lerp(d1, sm(-0.2, 0.7, k)), 40, 28).translate(0, hry * 0.5, -hrz * 0.08));
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI;
      headParts.push(blob(0.045, 0.04, 0.045, solid(S.col.mark ?? S.col.top), 12, 10).translate(Math.cos(a) * hrx * 0.88, hry * 0.32, -Math.sin(a) * hrz * 0.6));
    }
  }
  if (S.feat.includes('crest')) {
    const pts2 = [new THREE.Vector3(0, hry * 0.5, -hrz * 0.1), new THREE.Vector3(0, hry * 1.0, -hrz * 0.7), new THREE.Vector3(0, hry * 1.2, -hrz * 1.7), new THREE.Vector3(0, hry * 1.05, -hrz * 2.3)];
    const ac = C(S.col.accent), ac2 = C('#ffe9c9');
    headParts.push(loft(pts2, (t) => { const r = 0.09 * (1 - 0.3 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.8) / 0.2, 2))); return [r * 0.8, r]; }, (v, k) => ac.clone().lerp(ac2, sm(0.3, 1, k) * 0.4), 32, 16));
  }
  if (S.feat.includes('crests2')) {
    for (const m of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(-0.22, 0); sh.quadraticCurveTo(-0.2, 0.22, 0.05, 0.24); sh.quadraticCurveTo(0.2, 0.2, 0.22, 0); sh.lineTo(-0.22, 0);
      headParts.push(place(roundPlate(sh, 0.018, S.col.accent, '#ffd0e0'), m * hrx * 0.28, hry * 0.62, 0.0, 0, Math.PI / 2 + m * 0.18, 0));
    }
  }
  if (S.feat.includes('feathers')) {
    const fc = C(S.col.accent);
    for (let i = 0; i < 4; i++) {
      const pts3 = [new THREE.Vector3(0, hry * 0.8, -hrz * 0.1 + i * 0.03), new THREE.Vector3((i - 1.5) * 0.06, hry * 1.15, -hrz * 0.35 - i * 0.04), new THREE.Vector3((i - 1.5) * 0.12, hry * 1.25, -hrz * 0.65 - i * 0.05)];
      headParts.push(loft(pts3, (t) => { const r = 0.045 * Math.sqrt(Math.max(0, 1 - t * t)) + 0.005; return [r, r]; }, () => fc, 16, 10));
    }
  }
  if (S.feat.includes('eggHat')) {
    const ec = C('#fffaf0'), es = C('#a8e3c0');
    const hat = blob(hrx * 0.98, hry * 0.75, hrz * 0.98, (v) => spotField(v, 9) > 0.5 ? es : ec, 40, 28, (v) => {
      if (v.y < 0.05) {
        // 지그재그 깨진 가장자리
        const a = Math.atan2(v.z, v.x);
        const zig = 0.12 * Math.abs(((a * 7 / Math.PI) % 2 + 2) % 2 - 1);
        v.y = Math.max(v.y, zig - 0.02);
      }
    });
    hat.translate(0, hry * 0.42, -hrz * 0.05);
    hat.rotateZ(0.18);
    headParts.push(hat);
  }
  if (S.feat.includes('beak')) {
    // 부리 끝을 살짝 밝은 색으로(동글 덮개)
    headParts.push(blob(hrx * 0.26, hry * 0.17, 0.1, () => belly.clone().lerp(side, 0.25), 28, 18).translate(0, -hry * 0.34, hrz + H.snout * 0.62));
  }
  if (S.feat.includes('tusks')) {
    // 작은 상아: 주둥이 아래에서 앞으로 나와 위로 동글 휜다
    for (const m of [-1, 1]) headParts.push(place(horn(0.05 * hrx / 0.45, 0.34 * hrx / 0.45, S.col.accent, -0.55), m * hrx * 0.34, -hry * 0.42, hrz * 0.62, 1.9, 0, -m * 0.18));
  }
  if (S.feat.includes('trunk')) {
    // 코: 주둥이 앞에서 아래로 내려와 끝이 살짝 앞으로 말린다
    const tc = side.clone().lerp(belly, 0.35);
    const tp = [new THREE.Vector3(0, -hry * 0.05, hrz * 0.84), new THREE.Vector3(0, -hry * 0.45, hrz * 1.04), new THREE.Vector3(0, -hry * 0.8, hrz * 1.02), new THREE.Vector3(0, -hry * 0.98, hrz * 1.18)];
    headParts.push(loft(tp, (t) => { const r = hrx * (0.22 - 0.08 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.8) / 0.2, 2))) + 0.004; return [r, r]; }, () => tc, 32, 18));
  }
  if (S.feat.includes('fangs')) {
    // 송곳니 두 개(귀엽게 짧고 동글): 주둥이 아래로
    for (const m of [-1, 1]) headParts.push(place(horn(0.035 * hrx / 0.42, 0.2 * hrx / 0.42, '#fffaf2', 0.12), m * hrx * 0.2, -hry * 0.4, hrz * 0.86 + H.snout * 0.3, Math.PI, 0, 0));
  }
  if (S.feat.includes('ears')) {
    // 동글 귀(안쪽 분홍): 고양이형은 위로 세우고, 털뭉치(코 달린 종)는 옆으로 넓게
    const flop = S.feat.includes('trunk');
    const ec = side.clone().lerp(top, 0.3), inner = C(PALETTE.lightPink);
    for (const m of [-1, 1]) {
      const er = hrx * (flop ? 0.46 : 0.3);
      const ear = blob(er, er * (flop ? 1.05 : 1.15), er * 0.32, () => ec, 24, 16);
      const inn = blob(er * 0.66, er * 0.72, er * 0.18, () => inner, 18, 12).translate(0, -er * 0.05, er * 0.2);
      const eg = merge([ear, inn]);
      eg.userData.shared = false;
      if (flop) place(eg, m * hrx * 0.95, hry * 0.12, -hrz * 0.1, 0, m * 0.9, -m * 0.25);
      else place(eg, m * hrx * 0.55, hry * 0.78, -hrz * 0.12, -0.2, m * 0.25, -m * 0.35);
      headParts.push(eg);
    }
  }
  if (S.feat.includes('fluffy')) {
    // 머리 위 털 한 줌
    const fc = side.clone().lerp(top, 0.6);
    for (let i = 0; i < 5; i++) { const a = (i / 4 - 0.5) * 1.6; headParts.push(blob(hrx * 0.2, hrx * 0.18, hrx * 0.2, () => fc, 14, 10).translate(Math.sin(a) * hrx * 0.45, hry * 0.88 - Math.abs(a) * 0.04, -hrz * 0.15 + Math.cos(a) * 0.02)); }
  }
  const head = merge(headParts);
  const headPos = new THREE.Vector3(0, neckEnd.y + hry * 0.35, neckEnd.z + hrz * 0.25);

  // ── 꼬리 ──
  let tail: THREE.BufferGeometry | null = null;
  const tailPos = rot(-L * 0.38, -0.02);
  if (S.tail.len > 0) {
    const tl = S.tail.len, up = S.tail.up ?? 0;
    const tp = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.06, -tl * 0.35 - L * 0.1), new THREE.Vector3(0, -0.05 + up * 0.4, -tl * 0.7 - L * 0.1), new THREE.Vector3(0, up, -tl - L * 0.12)];
    // 꼬리 기울기(몸 기울기만큼 아래로 이어진다)
    const tailParts = [loft(tp, (t) => {
      const r = S.tail.r * (1 - 0.82 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.88) / 0.12, 2)));
      return [Math.max(0.006, r), Math.max(0.006, r * 1.1)];
    }, col, 40, 24)];
    const tip = tp[3];
    if (S.feat.includes('club')) tailParts.push(blob(0.16, 0.12, 0.18, solid(S.col.accent), 32, 24).translate(tip.x, tip.y, tip.z + 0.06));
    if (S.feat.includes('tailSpikes')) for (const m of [-1, 1]) for (const k of [0, 1]) tailParts.push(place(horn(0.035, 0.18, '#fff3d6', 0), m * 0.05, tip.y + 0.04 - k * 0.02, tip.z + 0.12 + k * 0.12, -0.5, 0, m * 1.0));
    if (S.feat.includes('feathers')) {
      const fc = C(S.col.accent);
      tailParts.push(blob(0.09, 0.07, 0.16, () => fc, 24, 16).translate(tip.x, tip.y + 0.02, tip.z + 0.02));
    }
    tail = merge(tailParts);
    tail.rotateX(0);
  }

  // ── 다리 ──
  let legF: THREE.BufferGeometry | null = null, legB: THREE.BufferGeometry | null = null;
  if (legLen > 0) {
    const footC = limbC.clone().multiplyScalar(0.88);
    const mk = (len: number, r: number) => {
      // 캡슐 한 덩어리: 위(허벅지)는 굵고 아래로 살짝 가늘게, 위쪽은 몸통 속에 묻힌다
      const lg = blob(r * 1.12, len * 0.56 + r * 0.3, r * 1.15, limbCol, 28, 20, (v) => { const s2 = 0.84 + 0.3 * Math.pow(v.y * 0.5 + 0.5, 1.5); v.x *= s2; v.z *= s2; }).translate(0, -len * 0.46, 0);
      // 발: 같은 색 동글 발 + 크림 발톱 3
      const foot = blob(r * 1.12, r * 0.55, r * 1.25, () => footC, 28, 18, (v) => { if (v.y < 0) v.y *= 0.35; }).translate(0, -len + r * 0.3, r * 0.22);
      const toes = [-1, 0, 1].map((k) => blob(r * 0.24, r * 0.2, r * 0.26, () => CREAM, 12, 8).translate(k * r * 0.55, -len + r * 0.16, r * 1.3 - Math.abs(k) * r * 0.12));
      return merge([lg, foot, ...toes]);
    };
    // 다리 길이 = 엉덩이 높이(발이 바닥에 닿게)
    legF = mk(hipF.y, S.leg.r * (S.biped ? 1.1 : 1));
    legB = S.biped ? legF : mk(hipB.y, S.leg.r * 1.05);
  }

  const height = headPos.y + hry * 1.1;
  const t: DinoTemplate = {
    spec: S, body, head, face, tail, legF, legB, hipF, hipB, headPos, tailPos,
    seat: new THREE.Vector3(0, hipY + B.ry * 0.95, S.biped ? -L * 0.1 : -L * 0.05),
    height, radius: Math.max(B.rx, L * 0.6),
    eyes: eyePose(hrx, hry, hrz, H.snout),
  };
  return t;
}

/** 머리 지오메트리에서 앞쪽(정면을 보는) 삼각형만 떼어 데칼 지오메트리로 */
function faceGeo(head: THREE.BufferGeometry, rx: number, ry: number): THREE.BufferGeometry {
  const src = head.index ? head.toNonIndexed() : head.clone();
  const p = src.attributes.position as THREE.BufferAttribute, n = src.attributes.normal as THREE.BufferAttribute;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  for (let t = 0; t < p.count; t += 3) {
    let nz = 0;
    for (let k = 0; k < 3; k++) nz += n.getZ(t + k);
    if (nz / 3 < 0.18) continue;
    for (let k = 0; k < 3; k++) {
      const i = t + k;
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(0.5 + p.getX(i) / (2 * rx), 0.5 + p.getY(i) / (2 * ry));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.userData.shared = true;
  return g;
}

// ───────────── 개체 ─────────────
export interface DinoRig {
  root: THREE.Group;
  /** 크기 배율 그룹(다리·날개가 여기 붙는다) */
  sc: THREE.Group;
  /** 몸 전체(걷기 통통·숙이기·숨쉬기) */
  rig: THREE.Group;
  head: THREE.Group;
  /** 얼굴 한 묶음(데칼 입 + 공용 눈 + 볼터치) — 멀면 통째로 숨긴다 */
  faceGroup: THREE.Group;
  /** 입·콧구멍 데칼 */
  face: THREE.Mesh;
  /** 공용 눈(art.addEyes) */
  eyes: EyeSet;
  tail: THREE.Object3D | null;
  legs: THREE.Object3D[];
  /** 날개(WING 몸형) [왼, 오른] */
  wings: THREE.Object3D[];
  seat: THREE.Object3D;
  /** 발밑 블롭 그림자(art.blobShadow) */
  shadow: THREE.Mesh;
  tpl: DinoTemplate;
}

/** 머리에 공용 눈 + 볼터치 + 입 데칼을 붙인다 */
function attachFace(head: THREE.Group, tpl: DinoTemplate): { faceGroup: THREE.Group; face: THREE.Mesh; eyes: EyeSet } {
  const faceGroup = new THREE.Group();
  faceGroup.name = 'face';
  const face = new THREE.Mesh(tpl.face, faceMaterial());
  face.renderOrder = 3;
  faceGroup.add(face);
  const E = tpl.eyes;
  const eyes = addEyes(faceGroup, { size: E.size, y: 0, z: 0, blush: false });
  const Z = new THREE.Vector3(0, 0, 1);
  [eyes.left, eyes.right].forEach((m, i) => {
    m.position.copy(E.pos[i]);
    m.quaternion.setFromUnitVectors(Z, E.n[i]);
    m.userData.baseScale = E.size;
  });
  // 볼터치는 눈을 따라(무서운 종도 꼭)
  addBlush(faceGroup, E.size);
  head.add(faceGroup);
  return { faceGroup, face, eyes };
}

/** 눈 뜨기·감기(감으면 가는 선) */
export function setEyesOpen(eyes: EyeSet, open: number) {
  const k = Math.max(0.08, Math.min(1, open));
  for (const m of [eyes.left, eyes.right]) m.scale.set(eyes.size, eyes.size * k, eyes.size);
}

/** 날개(WING): 어깨에 붙는 판 두 장. 접으면 등 뒤로 눕는다 */
function attachWings(parent: THREE.Object3D, spec: DinoSpec, tpl: DinoTemplate, cast: boolean): THREE.Object3D[] {
  const wing = wingGeometry(spec);
  const skin = dinoSkin();
  return [-1, 1].map((m) => {
    const g = new THREE.Group();
    g.position.set(m * spec.body.rx * 0.6, tpl.hipF.y + 0.05, 0.05);
    const w = new THREE.Mesh(wing, skin);
    w.scale.x = m;
    w.castShadow = cast;
    g.add(w);
    parent.add(g);
    return g;
  });
}

/** 날개 펴기(0 = 접음, 1 = 활짝) + 퍼덕임(라디안) */
export function poseWings(wings: THREE.Object3D[], spread: number, flap = 0) {
  const s = Math.max(0, Math.min(1, spread));
  wings.forEach((g, i) => {
    const m = i === 0 ? -1 : 1;
    g.rotation.set(0, m * (1 - s) * 1.25, m * ((1 - s) * 0.5 + flap));
  });
}

export function makeDino(spec: DinoSpec, castShadow = true): DinoRig {
  const tpl = template(spec);
  const skin = dinoSkin();
  const root = new THREE.Group();
  root.name = spec.id;
  const sc = new THREE.Group();
  sc.scale.setScalar(spec.scale);
  root.add(sc);
  const rig = new THREE.Group();
  sc.add(rig);
  const body = new THREE.Mesh(tpl.body, skin);
  body.castShadow = castShadow; body.receiveShadow = true;
  rig.add(body);
  const head = new THREE.Group();
  head.position.copy(tpl.headPos);
  const hm = new THREE.Mesh(tpl.head, skin);
  hm.castShadow = castShadow; hm.receiveShadow = true;
  head.add(hm);
  const { faceGroup, face, eyes } = attachFace(head, tpl);
  if (spec.feat.includes('crown')) {
    // 작은 금관(art.crownMesh) — 머리 꼭대기에 살짝 기울여
    const hry = spec.head.ry ?? spec.head.r * 0.92;
    const cr = crownMesh(spec.head.r * 0.85);
    cr.position.set(0, hry * 0.9, -spec.head.r * 0.05);
    cr.rotation.z = 0.12;
    head.add(cr);
  }
  rig.add(head);
  let tail: THREE.Object3D | null = null;
  if (tpl.tail) {
    const tg = new THREE.Group();
    tg.position.copy(tpl.tailPos);
    const tm = new THREE.Mesh(tpl.tail, skin);
    tm.castShadow = castShadow;
    tg.add(tm);
    rig.add(tg);
    tail = tg;
  }
  const legs: THREE.Object3D[] = [];
  if (tpl.legF) {
    const hips = spec.biped ? [tpl.hipF] : [tpl.hipF, tpl.hipB];
    for (const hp of hips) for (const m of [-1, 1]) {
      const lg = new THREE.Group();
      lg.position.set(hp.x * m, hp.y, hp.z);
      const lm = new THREE.Mesh(hp === tpl.hipB && !spec.biped ? tpl.legB! : tpl.legF, skin);
      lm.castShadow = false;
      lg.add(lm);
      sc.add(lg);
      legs.push(lg);
    }
  }
  const wings = spec.form === 'WING' ? attachWings(rig, spec, tpl, castShadow) : [];
  if (wings.length) poseWings(wings, 0);
  const seat = new THREE.Object3D();
  seat.position.copy(tpl.seat).multiplyScalar(spec.scale);
  root.add(seat);
  // 발밑 블롭 그림자(공용 원판, 반지름 1 → 몸 크기만큼 타원으로)
  const r = tpl.radius * spec.scale * 1.5;
  const shadow = blobShadow(1);
  shadow.scale.set(r * 0.55, 1, r * 0.8);
  root.add(shadow);
  return { root, sc, rig, head, faceGroup, face, eyes, tail, legs, wings, seat, shadow, tpl };
}

// ───────────── 알 ─────────────
let eggGeo: THREE.BufferGeometry | null = null;
export function eggGeometry(): THREE.BufferGeometry {
  if (eggGeo) return eggGeo;
  const base = C('#fff6e6'), spot = C('#9fe0b8'), spot2 = C('#ffb8cf');
  eggGeo = blob(0.26, 0.34, 0.26, (v) => {
    const s = spotField(v, 9);
    return s > 0.5 ? (hash3(Math.floor(v.x * 9), Math.floor(v.y * 9), 1) > 0.5 ? spot : spot2) : base;
  }, 36, 28, (v) => { if (v.y > 0) v.x *= 1 - 0.18 * v.y, v.z *= 1 - 0.18 * v.y; });
  eggGeo.translate(0, 0.32, 0);
  eggGeo.userData.shared = true;
  return eggGeo;
}

let nestGeo: THREE.BufferGeometry | null = null;
/** 둥지: 통통한 짚 고리 + 바닥 깃털 */
export function nestGeometry(): THREE.BufferGeometry {
  if (nestGeo) return nestGeo;
  const straw = C('#e8c27a'), straw2 = C('#c99a55');
  const ring = new THREE.TorusGeometry(0.75, 0.22, 20, 48);
  ring.rotateX(Math.PI / 2);
  ring.deleteAttribute('uv');
  const r = mergeVertices(ring, 1e-5);
  const p = r.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = 0.5 + 0.5 * Math.sin(a * 23 + p.getY(i) * 40);
    p.setY(i, p.getY(i) * 0.75 + 0.03 * Math.sin(a * 11));
    const cc = straw.clone().lerp(straw2, k * 0.6);
    cols.set([cc.r, cc.g, cc.b], i * 3);
  }
  r.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  r.computeVertexNormals();
  r.translate(0, 0.12, 0);
  const floor = blob(0.7, 0.06, 0.7, solid('#d9b06a'), 32, 12).translate(0, 0.03, 0);
  nestGeo = merge([r, floor]);
  return nestGeo;
}

// ───────────── 프테라노돈(하늘을 도는 것) ─────────────
export interface PteraRig { root: THREE.Group; wingL: THREE.Object3D; wingR: THREE.Object3D; head: THREE.Group; eyes: EyeSet; faceGroup: THREE.Group }
export function makePtera(spec: DinoSpec): PteraRig {
  const tpl = template(spec);
  const skin = dinoSkin();
  const root = new THREE.Group();
  const body = new THREE.Mesh(tpl.body, skin);
  body.castShadow = true;
  root.add(body);
  const head = new THREE.Group();
  head.position.copy(tpl.headPos);
  head.add(new THREE.Mesh(tpl.head, skin));
  const { faceGroup, eyes } = attachFace(head, tpl);
  root.add(head);
  if (tpl.tail) { const tm = new THREE.Mesh(tpl.tail, skin); tm.position.copy(tpl.tailPos); root.add(tm); }
  const [wingL, wingR] = attachWings(root, spec, tpl, true);
  // 다리 대신 날개만(하늘에선 발을 접는다)
  root.scale.setScalar(spec.scale);
  return { root, wingL, wingR, head, eyes, faceGroup };
}

const wingGeos = new Map<string, THREE.BufferGeometry>();
function wingGeometry(spec: DinoSpec): THREE.BufferGeometry {
  const hit = wingGeos.get(spec.id);
  if (hit) return hit;
  const sh = new THREE.Shape();
  // +x 로 뻗는 날개(앞전은 통통, 뒷전은 둥근 물결)
  sh.moveTo(0, 0.22);
  sh.bezierCurveTo(0.5, 0.36, 1.1, 0.3, 1.6, 0.05);
  sh.bezierCurveTo(1.35, -0.06, 1.15, -0.02, 1.0, -0.12);
  sh.bezierCurveTo(0.8, -0.05, 0.62, -0.2, 0.45, -0.18);
  sh.bezierCurveTo(0.3, -0.3, 0.12, -0.25, 0, -0.2);
  sh.lineTo(0, 0.22);
  const g = roundPlate(sh, 0.025, spec.col.side, spec.col.accent);
  // 판을 수평으로 눕힌다: 모양 x→월드 x, 모양 y→월드 -z(앞)
  g.rotateX(-Math.PI / 2);
  // 아래로 살짝 휘게
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) - 0.08 * x * x); p.setZ(i, -p.getZ(i)); }
  g.computeVertexNormals();
  g.userData.shared = true;
  wingGeos.set(spec.id, g);
  return g;
}

let flipGeo: THREE.BufferGeometry | null = null;
/** 지느러미(플레시오): 납작한 노 모양, +x 로 뻗는다 */
export function flipperGeometry(spec: DinoSpec): THREE.BufferGeometry {
  if (flipGeo) return flipGeo;
  const c0 = C(spec.col.side), c1 = C(spec.col.accent);
  flipGeo = blob(0.42, 0.06, 0.16, (v) => c0.clone().lerp(c1, sm(0.1, 0.4, v.x)), 32, 16, (v) => { v.z *= 1 - 0.35 * Math.max(0, v.x); });
  flipGeo.translate(0.36, 0, 0);
  flipGeo.rotateY(0.35);
  flipGeo.userData.shared = true;
  return flipGeo;
}

// ───────────── 화석 모델 ─────────────
const boneMats = new Map<string, THREE.MeshPhysicalMaterial>();
/** 뼈 재질(색조별 공용): 상아색 + 그 공룡 색 살짝 */
function boneMat(tint: string, kind = 'bone') {
  const k = `${kind}:${tint}`;
  let m = boneMats.get(k);
  if (!m) {
    const c = C('#fbf1dc').lerp(C(tint), kind === 'bone' ? 0.22 : 0.0);
    m = new THREE.MeshPhysicalMaterial({
      color: kind === 'bone' ? c : C(tint), roughness: kind === 'amber' ? 0.15 : 0.62, transmission: kind === 'amber' ? 0.4 : 0,
      thickness: 0.3, clearcoat: kind === 'amber' ? 1 : 0.15, sheen: 0.3, sheenColor: C('#fff3dc'),
    });
    m.userData.shared = true;
    boneMats.set(k, m);
  }
  return m;
}
const darkHole = () => boneMats.get('hole') ?? (() => { const m = new THREE.MeshPhysicalMaterial({ color: '#8a6a58', roughness: 1 }); m.userData.shared = true; boneMats.set('hole', m); return m; })();

/**
 * 화석 모델(잡았다 연출·박물관). kind:
 * - 조각: 'skull'(동글 머리뼈 + 눈구멍) · 'body'(등뼈 + 갈비 고리) · 'tail'(꼬리뼈 사슬)
 * - 'skeleton'(세 조각을 이은 작은 골격)
 * - 예전 것: 'bone' · 'ammonite' · 'amber' · 'tooth' · 'egg' · 'footprint'
 */
export function fossilModel(kind: string, tint: string): THREE.Object3D {
  const g = new THREE.Group();
  g.name = `fossil:${kind}`;
  const mat = boneMat(tint, kind === 'amber' ? 'amber' : 'bone');
  const add = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, to: THREE.Object3D = g, m: THREE.Material = mat) => {
    const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; to.add(me); return me;
  };
  const skull = (to: THREE.Object3D) => {
    const cr = add(new THREE.SphereGeometry(0.2, 32, 24), 0, 0, 0, 0, 0, 0, to); cr.scale.set(1, 0.9, 1.05);
    const sn = add(new THREE.SphereGeometry(0.13, 28, 20), 0, -0.05, 0.17, 0, 0, 0, to); sn.scale.set(0.95, 0.75, 1.1);
    const jaw = add(new THREE.CapsuleGeometry(0.05, 0.18, 8, 16), 0, -0.13, 0.12, Math.PI / 2, 0, 0, to); jaw.scale.set(1.6, 1, 0.7);
    for (const m of [-1, 1]) {
      const e = add(new THREE.SphereGeometry(0.06, 18, 14), m * 0.09, 0.05, 0.15, 0, 0, 0, to, darkHole()); e.scale.set(1, 1.15, 0.5);
      add(new THREE.SphereGeometry(0.018, 10, 8), m * 0.04, -0.03, 0.29, 0, 0, 0, to, darkHole());
    }
  };
  const vertebra = (to: THREE.Object3D, x: number, y: number, z: number, r: number) => {
    add(new THREE.CylinderGeometry(r, r, r * 1.2, 20), x, y, z, Math.PI / 2, 0, 0, to);
    add(new THREE.SphereGeometry(r * 0.55, 14, 10), x, y + r * 1.05, z, 0, 0, 0, to);
  };
  const ribcage = (to: THREE.Object3D) => {
    for (let i = 0; i < 5; i++) vertebra(to, 0, 0.12, -0.22 + i * 0.11, 0.045);
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.TorusGeometry(0.15 - Math.abs(i - 1.5) * 0.015, 0.022, 10, 28, Math.PI * 1.15);
      add(rib, 0, 0.0, -0.16 + i * 0.11, 0, Math.PI / 2, -Math.PI * 0.075 + Math.PI / 2, to);
    }
  };
  const tailChain = (to: THREE.Object3D) => {
    for (let i = 0; i < 7; i++) { const t = i / 6; vertebra(to, Math.sin(t * 2.2) * 0.08, 0.02 - t * 0.04, -0.3 + t * 0.6, 0.055 * (1 - t * 0.55)); }
  };
  if (kind === 'skull') skull(g);
  else if (kind === 'body') ribcage(g);
  else if (kind === 'tail') tailChain(g);
  else if (kind === 'skeleton') {
    // 세 조각을 이은 작은 골격(받침대 위)
    const st = add(new THREE.CylinderGeometry(0.42, 0.46, 0.06, 36), 0, -0.24, 0, 0, 0, 0, g, boneMat('#e9d3a8', 'stand'));
    st.receiveShadow = true;
    const sk = new THREE.Group(); skull(sk); sk.scale.setScalar(0.6); sk.position.set(0, 0.12, 0.3); g.add(sk);
    const bd = new THREE.Group(); ribcage(bd); bd.scale.setScalar(0.85); bd.position.set(0, 0.02, 0); g.add(bd);
    const tl = new THREE.Group(); tailChain(tl); tl.scale.setScalar(0.7); tl.position.set(0, -0.02, -0.42); g.add(tl);
    for (const m of [-1, 1]) for (const z of [-0.1, 0.12]) add(new THREE.CapsuleGeometry(0.03, 0.16, 6, 12), m * 0.1, -0.12, z, 0, 0, m * 0.15);
  } else if (kind === 'bone') {
    add(new THREE.CapsuleGeometry(0.06, 0.4, 8, 20), 0, 0, 0, 0, 0, Math.PI / 2);
    for (const x of [-0.26, 0.26]) for (const y of [-0.06, 0.06]) add(new THREE.SphereGeometry(0.085, 24, 18), x, y, 0);
  } else if (kind === 'ammonite') {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) { const a = i * 0.21, r = 0.04 + i * 0.0045; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tg = new THREE.TubeGeometry(curve, 120, 1, 16, false);
    const p = tg.attributes.position as THREE.BufferAttribute;
    const c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i <= 120; i++) {
      curve.getPointAt(i / 120, c);
      const r = 0.02 + 0.07 * (i / 120);
      for (let j = 0; j <= 16; j++) { const k = i * 17 + j; v.fromBufferAttribute(p, k).sub(c).normalize().multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); }
    }
    tg.computeVertexNormals();
    add(tg);
  } else if (kind === 'amber') {
    const geo = new THREE.SphereGeometry(0.2, 32, 24); geo.scale(1, 0.8, 0.7);
    add(geo);
    add(new THREE.SphereGeometry(0.035, 16, 12), 0, 0, 0, 0, 0, 0, g, darkHole());
  } else if (kind === 'tooth') {
    add(horn(0.09, 0.32, tint, 0.25).translate(0, -0.15, 0));
  } else if (kind === 'egg') {
    const geo = eggGeometry().clone(); geo.translate(0, -0.32, 0);
    add(geo, 0, 0, 0, 0, 0, 0, g, dinoSkin());
  } else {
    // 발자국
    add(new THREE.CylinderGeometry(0.28, 0.3, 0.08, 40), 0, 0, 0, Math.PI / 2, 0, 0);
    for (const a of [-0.5, 0, 0.5]) { const m = add(new THREE.SphereGeometry(0.06, 16, 12), Math.sin(a) * 0.14, Math.cos(a) * 0.14, 0.04, 0, 0, -a, g, darkHole()); m.scale.set(0.8, 1.6, 0.4); }
    const pad = add(new THREE.SphereGeometry(0.08, 16, 12), 0, -0.06, 0.04, 0, 0, 0, g, darkHole()); pad.scale.set(1, 0.8, 0.4);
  }
  g.scale.setScalar(1.6);
  return g;
}

// ───────────── 티노 언덕 소품 ─────────────
let bubbleGeo: THREE.BufferGeometry | null = null;
let bubbleMat: THREE.MeshPhysicalMaterial | null = null;
/** 콧방울: 하늘색 투명 구(부풀었다 톡) */
export function snotBubble(): THREE.Mesh {
  bubbleGeo ??= (() => { const g = new THREE.SphereGeometry(0.5, 28, 20); g.userData.shared = true; return g; })();
  bubbleMat ??= (() => {
    const m = new THREE.MeshPhysicalMaterial({ color: '#d8f3ff', emissive: '#bfe9ff', emissiveIntensity: 0.45, transparent: true, opacity: 0.5, roughness: 0.05, clearcoat: 1, sheen: 0.6, sheenColor: C('#ffffff'), depthWrite: false });
    m.userData.shared = true; return m;
  })();
  const b = new THREE.Mesh(bubbleGeo, bubbleMat);
  b.renderOrder = 4;
  b.name = 'snot-bubble';
  return b;
}

/** 글자 스프라이트 텍스처(Zzz·!·♥ 등) — 흰 테두리 통통 글씨 */
const glyphTex = new Map<string, THREE.Texture>();
export function glyphTexture(text: string, color = '#7c9cff'): THREE.Texture {
  const k = `${text}|${color}`;
  const hit = glyphTex.get(k);
  if (hit) return hit;
  let t: THREE.Texture;
  if (typeof document === 'undefined') { t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); t.needsUpdate = true; }
  else {
    const n = 128, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d')!;
    g.font = `bold ${text.length > 1 ? 72 : 96}px Jua, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#ffffff';
    g.strokeText(text, n / 2, n / 2 + 4);
    g.fillStyle = color;
    g.fillText(text, n / 2, n / 2 + 4);
    t = new THREE.CanvasTexture(c);
  }
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  glyphTex.set(k, t);
  return t;
}

/** 금상자(언덕 꼭대기): 통통한 금빛 상자 + 분홍 보석 + 뚜껑(열리면 돌린다) */
export function goldChest(): { root: THREE.Group; lid: THREE.Object3D; glow: THREE.Mesh } {
  const root = new THREE.Group();
  root.name = 'tino-gold-chest';
  const gold = new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.55, roughness: 0.35, emissive: '#b8861c', emissiveIntensity: 0.35 });
  const band = new THREE.MeshStandardMaterial({ color: '#ff9fb8', roughness: 0.4, emissive: '#ff9fb8', emissiveIntensity: 0.2 });
  const boxG = new THREE.BoxGeometry(1.0, 0.6, 0.7, 4, 4, 4);
  roundBox(boxG, 0.12);
  const box = new THREE.Mesh(boxG, gold); box.position.y = 0.3; box.castShadow = true; box.receiveShadow = true;
  root.add(box);
  const lid = new THREE.Group(); lid.position.set(0, 0.6, -0.35);
  const lidG = new THREE.CylinderGeometry(0.35, 0.35, 1.0, 24, 1, false, 0, Math.PI); lidG.rotateZ(Math.PI / 2); lidG.rotateX(Math.PI / 2);
  const lm = new THREE.Mesh(lidG, gold); lm.position.set(0, 0, 0.35); lm.scale.set(1, 0.7, 1); lm.castShadow = true;
  lid.add(lm);
  const gem = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), band); gem.position.set(0, 0.05, 0.72); gem.scale.set(1, 1.2, 0.6);
  lid.add(gem);
  root.add(lid);
  for (const x of [-0.32, 0.32]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.74), band); b.position.set(x, 0.31, 0); root.add(b); }
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  glow.position.y = 3;
  glow.renderOrder = 5;
  root.add(glow);
  return { root, lid, glow };
}
/** 상자 모서리를 동글게(정점을 안쪽 상자에서 반지름 r 만큼) */
function roundBox(g: THREE.BufferGeometry, r: number) {
  g.computeBoundingBox();
  const bb = g.boundingBox!, p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(), c = new THREE.Vector3();
  const inner = bb.clone().expandByScalar(-r);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.clampPoint(v, c);
    const d = v.clone().sub(c);
    if (d.lengthSq() > 1e-8) v.copy(c).addScaledVector(d.normalize(), r);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
}

// ───────────── 하트·반짝이 스프라이트 ─────────────
export function heartTexture(): THREE.CanvasTexture {
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.translate(n / 2, n / 2 + 6);
  g.beginPath();
  g.moveTo(0, 34);
  g.bezierCurveTo(-60, -6, -30, -52, 0, -22);
  g.bezierCurveTo(30, -52, 60, -6, 0, 34);
  g.fillStyle = '#ff6f96';
  g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = 8;
  g.fill();
  g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.ellipse(-18, -14, 9, 6, -0.6, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function sparkleTexture(): THREE.CanvasTexture {
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.2, 'rgba(255,240,160,0.8)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  g.fillStyle = '#fffbe8';
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 10 : 60; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 땅의 반짝이는 금(화석 발굴 지점) */
export function crackTexture(): THREE.CanvasTexture {
  const n = 256, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, 'rgba(150,105,60,0.85)'); gr.addColorStop(0.55, 'rgba(160,115,70,0.55)'); gr.addColorStop(1, 'rgba(160,115,70,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const crack = (w: number, color: string) => {
    g.strokeStyle = color; g.lineWidth = w;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      g.beginPath(); g.moveTo(128, 128);
      let x = 128, y = 128;
      for (let k = 1; k <= 4; k++) { x += Math.cos(a + (k % 2 ? 0.35 : -0.3)) * 22; y += Math.sin(a + (k % 2 ? 0.35 : -0.3)) * 22; g.lineTo(x, y); }
      g.stroke();
    }
  };
  crack(14, 'rgba(255,220,110,0.55)');
  crack(6, '#fff2b0');
  crack(2.5, '#7a5530');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
