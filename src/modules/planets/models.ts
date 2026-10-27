// 행성 생물·장식 친구 모델 — 둥글고 통통한 실루엣 + art.ts 공용 얼굴(세로 타원 눈·하이라이트 2개·볼터치) + 블롭 그림자 + 숨쉬기.
// 부품(구·캡슐·원뿔·고리)을 정점색으로 칠해 '층'(보통·투명·발광)마다 한 메시로 합친다 → 한 마리 = 메시 2~3 + 눈 2 + 볼 2.
// 합친 지오메트리는 모델 종류마다 한 번 만들어 공유(userData.shared) — 행성을 나갈 때 dispose 하지 않는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addEyes, blobShadow, breathe } from '../../core/art';

type V3 = [number, number, number];
type Layer = 'toy' | 'clear' | 'glow' | 'fluff';
interface PartOpt { p?: V3; s?: number | V3; r?: V3; c: string }

const shared = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => { x.userData.shared = true; return x; };

// ── 기본 지오메트리(최소 24×16 구 · 16 radial 캡슐 — GDD 7.1)
const BASE = {
  sph: new THREE.SphereGeometry(1, 28, 18),
  cap: new THREE.CapsuleGeometry(1, 1, 6, 16),
  cone: new THREE.ConeGeometry(1, 1, 18, 1),
  tor: new THREE.TorusGeometry(1, 0.3, 14, 40),
  thin: new THREE.TorusGeometry(1, 0.08, 10, 48),
};

// ── 재질(모듈 전역 공유)
let MATS: Record<Layer, THREE.Material> | null = null;
export function mats(): Record<Layer, THREE.Material> {
  if (MATS) return MATS;
  const toy = shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, emissive: '#2a2040', emissiveIntensity: 0.08 }));
  const fluff = shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, emissive: '#ffffff', emissiveIntensity: 0.06 }));
  const clear = shared(new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0.66, depthWrite: false,
    emissive: '#ffffff', emissiveIntensity: 0.05,
  }));
  // 발광: 정점색 × 1.9 → 블룸 임계(우주 1.15)를 넘긴다
  const glow = shared(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.9, 1.9, 1.9) }));
  return (MATS = { toy, clear, glow, fluff });
}

/** 부품을 모아 층마다 하나로 합친다 */
class Kit {
  layers = new Map<Layer, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  add(layer: Layer, base: THREE.BufferGeometry, o: PartOpt) {
    const g = base.clone();
    const s = typeof o.s === 'number' ? [o.s, o.s, o.s] as V3 : o.s ?? [1, 1, 1];
    this.e.set(...(o.r ?? [0, 0, 0]));
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(...(o.p ?? [0, 0, 0])), this.q, new THREE.Vector3(...s));
    g.applyMatrix4(this.m);
    const c = new THREE.Color(o.c);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const list = this.layers.get(layer) ?? [];
    list.push(g);
    this.layers.set(layer, list);
    return g;
  }
  sph(layer: Layer, o: PartOpt) { return this.add(layer, BASE.sph, o); }
  cap(layer: Layer, o: PartOpt) { return this.add(layer, BASE.cap, o); }
  cone(layer: Layer, o: PartOpt) { return this.add(layer, BASE.cone, o); }
  tor(layer: Layer, o: PartOpt) { return this.add(layer, BASE.tor, o); }
  thin(layer: Layer, o: PartOpt) { return this.add(layer, BASE.thin, o); }
  /** 층별 합친 지오메트리(공유) */
  bake(): Map<Layer, THREE.BufferGeometry> {
    const out = new Map<Layer, THREE.BufferGeometry>();
    for (const [k, list] of this.layers) {
      const g = mergeGeometries(list, false);
      for (const x of list) x.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      out.set(k, shared(g));
    }
    return out;
  }
}

/** 모델 설계: 부품 + 얼굴 자리 + 그림자 반경 */
interface Design {
  kit: Kit;
  eyes?: { size: number; head: { r: number; center: V3 } };
  shadow?: number;
}
const BAKED = new Map<string, { geos: Map<Layer, THREE.BufferGeometry>; d: Design }>();

/** 생물 모델 하나(그룹). userData.anim(t) = 숨쉬기·살랑. userData.layers = 층 메시 */
export interface Model extends THREE.Group { userData: { anim: (t: number) => void; layers: Map<Layer, THREE.Mesh>; phase: number; [k: string]: unknown } }

function instance(key: string, design: () => Design, phase: number, extra?: (m: Model, t: number) => void): Model {
  let b = BAKED.get(key);
  if (!b) { const d = design(); b = { geos: d.kit.bake(), d }; BAKED.set(key, b); }
  const g = new THREE.Group() as Model;
  g.name = `planets-${key}`;
  const body = new THREE.Group();
  body.name = 'body';
  g.add(body);
  const M = mats();
  const layers = new Map<Layer, THREE.Mesh>();
  // 투명층은 나중에 그린다
  for (const L of ['toy', 'fluff', 'glow', 'clear'] as Layer[]) {
    const geo = b.geos.get(L);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, M[L]);
    mesh.castShadow = L !== 'clear' && L !== 'glow';
    mesh.name = `layer-${L}`;
    if (L === 'clear') mesh.renderOrder = 3;
    body.add(mesh);
    layers.set(L, mesh);
  }
  if (b.d.eyes) {
    const hold = new THREE.Group();
    hold.name = 'face';
    body.add(hold);
    addEyes(hold, { size: b.d.eyes.size, head: { r: b.d.eyes.head.r, center: new THREE.Vector3(...b.d.eyes.head.center) } });
  }
  if (b.d.shadow) g.add(blobShadow(b.d.shadow));
  g.userData = { layers, phase, anim: (t: number) => { breathe(body, t, phase); extra?.(g, t); } };
  return g;
}
const bodyOf = (m: THREE.Object3D) => m.getObjectByName('body') ?? m;

// ───────────── 행성 생물 ─────────────
/** 말캉곰 젤리곰(투명 젤리, 6색 중 하나) */
export function jellyBear(color: string, phase = 0): Model {
  return instance(`jellybear:${color}`, () => {
    const k = new Kit(), c = color, lite = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4).getStyle();
    k.sph('clear', { p: [0, 0.2, 0], s: [0.17, 0.19, 0.15], c });
    k.sph('clear', { p: [0, 0.45, 0.01], s: 0.15, c });
    for (const sx of [-1, 1]) {
      k.sph('clear', { p: [sx * 0.1, 0.58, 0], s: 0.055, c });
      k.sph('clear', { p: [sx * 0.15, 0.25, 0.04], s: [0.055, 0.075, 0.055], c });
      k.sph('clear', { p: [sx * 0.08, 0.05, 0.03], s: [0.06, 0.05, 0.07], c });
    }
    // 배 속 하얀 빛(젤리 속 반짝)
    k.sph('toy', { p: [0, 0.2, 0.02], s: [0.07, 0.09, 0.06], c: lite });
    k.sph('clear', { p: [0, 0.42, 0.13], s: [0.06, 0.045, 0.04], c: lite });
    return { kit: k, eyes: { size: 0.055, head: { r: 0.15, center: [0, 0.47, 0.01] } }, shadow: 0.2 };
  }, phase, (m, t) => { bodyOf(m).position.y = Math.abs(Math.sin(t * 3 + phase * 6)) * 0.05; });
}

/** 훌라후프 고리뱀(민트 + 흰 줄, 동그랗게 말려 굴러다닌다) */
export function ringSnake(phase = 0): Model {
  return instance('ringsnake', () => {
    const k = new Kit();
    // 마디 구슬로 고리 — 민트·흰 줄무늬
    const N = 22, R = 0.26;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.3;
      if (a > Math.PI * 2 - 0.15) continue;
      const rr = 0.075 * (0.75 + 0.25 * Math.sin((i / N) * Math.PI));
      k.sph('toy', { p: [Math.cos(a) * R, 0.33 + Math.sin(a) * R, 0], s: rr, c: i % 3 === 0 ? '#fffaf2' : '#9ef0d2' });
    }
    // 머리(위쪽, 앞을 본다)
    k.sph('toy', { p: [0.02, 0.62, 0.03], s: [0.11, 0.1, 0.1], c: '#9ef0d2' });
    k.sph('toy', { p: [0.02, 0.6, 0.1], s: [0.05, 0.03, 0.03], c: '#ff9fb8' });
    return { kit: k, eyes: { size: 0.05, head: { r: 0.1, center: [0.02, 0.63, 0.03] } }, shadow: 0.25 };
  }, phase, (m, t) => { bodyOf(m).rotation.z = Math.sin(t * 1.2 + phase * 6) * 0.12; });
}

/** 구름뭉치 솜사탕양(분홍·하늘 솜털 — 털 깎으면 fluff 층이 작아진다) */
export function cottonSheep(phase = 0): Model {
  return instance('cottonsheep', () => {
    const k = new Kit();
    const fl: Array<[number, number, number, number, string]> = [
      [0, 0.42, 0, 0.2, '#ffd0de'], [0.14, 0.4, -0.06, 0.15, '#c8e8ff'], [-0.14, 0.4, -0.06, 0.15, '#ffd0de'], [0, 0.52, -0.1, 0.15, '#c8e8ff'],
      [0.1, 0.32, 0.08, 0.13, '#ffd0de'], [-0.1, 0.32, 0.08, 0.13, '#c8e8ff'], [0, 0.36, -0.18, 0.14, '#ffd0de'], [0, 0.58, 0.04, 0.12, '#fff2f8'],
    ];
    for (const [x, y, z, r, c] of fl) k.sph('fluff', { p: [x, y, z], s: r, c });
    // 몸(깎으면 보이는 분홍 몸) · 얼굴 · 다리
    k.sph('toy', { p: [0, 0.38, -0.04], s: [0.15, 0.13, 0.17], c: '#ffe4ec' });
    k.sph('toy', { p: [0, 0.4, 0.2], s: [0.11, 0.1, 0.09], c: '#fff6e3' });
    for (const sx of [-1, 1]) {
      k.sph('toy', { p: [sx * 0.11, 0.46, 0.17], s: [0.05, 0.025, 0.035], r: [0, 0, sx * 0.5], c: '#ffb7cc' });
      for (const sz of [-1, 1]) k.cap('toy', { p: [sx * 0.08, 0.12, sz * 0.08], s: [0.035, 0.08, 0.035], c: '#fff6e3' });
    }
    return { kit: k, eyes: { size: 0.045, head: { r: 0.095, center: [0, 0.41, 0.2] } }, shadow: 0.28 };
  }, phase);
}
/** 솜사탕양 털 깎기 표시(true = 깎음) */
export function setShorn(m: Model, shorn: boolean) {
  const f = m.userData.layers.get('fluff');
  if (f) f.scale.setScalar(shorn ? 0.55 : 1);
}

/** 수정가시 고슴도치(하늘 몸 + 투명 결정 가시) */
export function crystalHedgehog(phase = 0): Model {
  return instance('hedgehog', () => {
    const k = new Kit();
    k.sph('toy', { p: [0, 0.16, 0], s: [0.17, 0.14, 0.19], c: '#8fd3f4' });
    k.sph('toy', { p: [0, 0.15, 0.13], s: [0.11, 0.1, 0.09], c: '#fffaf2' });
    k.sph('toy', { p: [0, 0.14, 0.23], s: 0.025, c: '#ff9fb8' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.sph('toy', { p: [sx * 0.09, 0.03, sz * 0.08], s: [0.04, 0.03, 0.05], c: '#bfe9ff' });
    // 가시: 등 반구에 고르게
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 * 2.6, el = 0.25 + (i % 4) * 0.28;
      const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el) + 0.2, -0.55 - Math.abs(Math.sin(a)) * 0.3).normalize();
      const p = dir.clone().multiplyScalar(0.15).add(new THREE.Vector3(0, 0.17, -0.03));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const e = new THREE.Euler().setFromQuaternion(q);
      k.cone('clear', { p: [p.x, p.y, p.z], s: [0.035, 0.12, 0.035], r: [e.x, e.y, e.z], c: i % 2 ? '#c8e8ff' : '#e9e0ff' });
    }
    return { kit: k, eyes: { size: 0.045, head: { r: 0.1, center: [0, 0.18, 0.13] } }, shadow: 0.22 };
  }, phase);
}

/** 빵빠레 풍선문어(부푼 노랑 머리 + 다리 6) */
export function balloonOcto(phase = 0): Model {
  return instance('balloonocto', () => {
    const k = new Kit();
    k.sph('toy', { p: [0, 0.62, 0], s: [0.28, 0.3, 0.27], c: '#ffd84a' });
    k.sph('toy', { p: [0.08, 0.8, 0.12], s: 0.06, c: '#fff2a8' });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.cap('toy', { p: [Math.cos(a) * 0.15, 0.3, Math.sin(a) * 0.15], s: [0.045, 0.12, 0.045], r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], c: '#ffc23a' });
      k.sph('toy', { p: [Math.cos(a) * 0.21, 0.17, Math.sin(a) * 0.21], s: 0.04, c: '#ff9fb8' });
    }
    // 풍선 끈 매듭
    k.sph('toy', { p: [0, 0.32, 0], s: [0.08, 0.05, 0.08], c: '#ffb35a' });
    return { kit: k, eyes: { size: 0.075, head: { r: 0.28, center: [0, 0.56, 0] } }, shadow: 0.25 };
  }, phase, (m, t) => { bodyOf(m).rotation.z = Math.sin(t * 1.4 + phase * 5) * 0.08; });
}

/** UFO해파리(은 접시 + 분홍 돔 + 빛 촉수) */
export function ufoJelly(phase = 0): Model {
  return instance('ufojelly', () => {
    const k = new Kit();
    k.sph('toy', { p: [0, 0.5, 0], s: [0.34, 0.1, 0.34], c: '#dfe6ee' });
    k.sph('clear', { p: [0, 0.58, 0], s: [0.19, 0.17, 0.19], c: '#ffb7d2' });
    k.sph('toy', { p: [0, 0.6, 0], s: [0.1, 0.1, 0.1], c: '#ffd0de' });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.sph('glow', { p: [Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3], s: 0.03, c: i % 2 ? '#c8e8ff' : '#ffd0de' });
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      k.cap('glow', { p: [Math.cos(a) * 0.12, 0.28, Math.sin(a) * 0.12], s: [0.022, 0.13, 0.022], c: '#c8e8ff' });
    }
    return { kit: k, eyes: { size: 0.06, head: { r: 0.1, center: [0, 0.6, 0] } }, shadow: 0.3 };
  }, phase, (m, t) => { bodyOf(m).rotation.y = t * 0.6 + phase; });
}

/** 하늘고래(흰 솜털 고래 + 무지개 지느러미) */
export function skyWhale(phase = 0): Model {
  return instance('skywhale', () => {
    const k = new Kit();
    k.sph('toy', { p: [0, 0.75, 0], s: [0.7, 0.62, 1.0], c: '#fffaf2' });
    k.sph('toy', { p: [0, 0.6, 0.15], s: [0.55, 0.42, 0.8], c: '#e6f2ff' });
    k.sph('toy', { p: [0, 0.8, -1.05], s: [0.3, 0.26, 0.4], c: '#fffaf2' });
    // 꼬리
    for (const sx of [-1, 1]) k.sph('toy', { p: [sx * 0.32, 0.86, -1.42], s: [0.34, 0.06, 0.18], r: [0, sx * 0.4, 0], c: '#ffd0de' });
    // 무지개 지느러미
    const rb = ['#ff9fb8', '#ffc59a', '#ffd84a', '#9ef0d2', '#8fd3f4', '#c9b6f2'];
    for (const sx of [-1, 1]) rb.forEach((c, i) => k.sph('toy', { p: [sx * (0.68 + i * 0.05), 0.5 - i * 0.025, 0.25 - i * 0.07], s: [0.12, 0.035, 0.2], r: [0, 0, sx * -0.5], c }));
    // 등 솜털
    for (let i = 0; i < 7; i++) k.sph('fluff', { p: [Math.sin(i * 2.1) * 0.25, 1.28 + Math.cos(i) * 0.04, 0.4 - i * 0.22], s: 0.17 + (i % 2) * 0.05, c: i % 2 ? '#fff6fb' : '#eef7ff' });
    return { kit: k, eyes: { size: 0.16, head: { r: 0.66, center: [0, 0.78, 0.38] } }, shadow: 0.9 };
  }, phase, (m, t) => { bodyOf(m).rotation.x = Math.sin(t * 0.7 + phase * 4) * 0.06; });
}

/** 꼬리별 혜성여우(주황 여우 + 빛나는 꼬리) */
export function cometFox(phase = 0): Model {
  return instance('cometfox', () => {
    const k = new Kit();
    k.cap('toy', { p: [0, 0.22, -0.02], s: [0.1, 0.1, 0.1], r: [Math.PI / 2, 0, 0], c: '#ffa24c' });
    k.sph('toy', { p: [0, 0.2, 0.02], s: [0.08, 0.07, 0.1], c: '#fffaf2' });
    k.sph('toy', { p: [0, 0.36, 0.14], s: [0.13, 0.12, 0.12], c: '#ffa24c' });
    k.sph('toy', { p: [0, 0.32, 0.24], s: [0.06, 0.045, 0.06], c: '#fffaf2' });
    k.sph('toy', { p: [0, 0.34, 0.3], s: 0.022, c: '#6e4a5a' });
    for (const sx of [-1, 1]) {
      k.cone('toy', { p: [sx * 0.08, 0.5, 0.12], s: [0.05, 0.11, 0.04], r: [0, 0, sx * -0.25], c: '#ffa24c' });
      k.cone('toy', { p: [sx * 0.08, 0.49, 0.13], s: [0.028, 0.07, 0.02], r: [0, 0, sx * -0.25], c: '#fff2e0' });
      for (const sz of [-1, 1]) k.cap('toy', { p: [sx * 0.06, 0.07, sz * 0.07], s: [0.03, 0.05, 0.03], c: '#ff8a3a' });
    }
    // 빛 꼬리(뒤로 흘러가는 구슬)
    for (let i = 0; i < 6; i++) k.sph('glow', { p: [0, 0.3 + i * 0.03, -0.18 - i * 0.09], s: 0.09 - i * 0.008, c: i < 2 ? '#fff2a8' : '#fffaf2' });
    return { kit: k, eyes: { size: 0.05, head: { r: 0.12, center: [0, 0.37, 0.14] } }, shadow: 0.22 };
  }, phase);
}

/** 꼬마별(노란 작은 별 구 + 둥근 뿔 5 + 금 고리) */
export function littleStar(phase = 0): Model {
  return instance('littlestar', () => {
    const k = new Kit();
    k.sph('glow', { p: [0, 0.3, 0], s: 0.17, c: '#ffe27a' });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      k.sph('glow', { p: [Math.cos(a) * 0.17, 0.3 + Math.sin(a) * 0.17, -0.01], s: 0.06, c: '#fff2a8' });
    }
    k.thin('toy', { p: [0, 0.3, 0], s: 0.26, r: [Math.PI / 2 - 0.35, 0, 0.2], c: '#ffcf4a' });
    return { kit: k, eyes: { size: 0.06, head: { r: 0.17, center: [0, 0.3, 0] } } };
  }, phase, (m, t) => { bodyOf(m).rotation.z = Math.sin(t * 2 + phase * 6) * 0.15; });
}

/** 토성 달팽이(운석 위를 기어 다니는 달팽이 — 껍데기에 고리) */
export function ringSnail(phase = 0): Model {
  return instance('ringsnail', () => {
    const k = new Kit();
    k.cap('toy', { p: [0, 0.07, 0.03], s: [0.08, 0.13, 0.07], r: [Math.PI / 2, 0, 0], c: '#ffd9a8' });
    k.sph('toy', { p: [0, 0.2, -0.04], s: [0.13, 0.13, 0.11], c: '#ffb07a' });
    k.thin('toy', { p: [0, 0.2, -0.04], s: 0.2, r: [Math.PI / 2 - 0.3, 0, 0.3], c: '#c9b6ff' });
    k.sph('toy', { p: [0, 0.12, 0.14], s: 0.07, c: '#ffd9a8' });
    for (const sx of [-1, 1]) {
      k.cap('toy', { p: [sx * 0.03, 0.2, 0.16], s: [0.012, 0.04, 0.012], r: [0.3, 0, sx * 0.25], c: '#ffd9a8' });
      k.sph('toy', { p: [sx * 0.045, 0.25, 0.17], s: 0.02, c: '#ff9fb8' });
    }
    return { kit: k, eyes: { size: 0.035, head: { r: 0.07, center: [0, 0.13, 0.14] } }, shadow: 0.16 };
  }, phase);
}

// ───────────── 장식 친구(도감 밖) ─────────────
/** 서리펭귄(목도리 두른 아기 펭귄) */
export function frostPenguin(phase = 0): Model {
  return instance('frostpenguin', () => {
    const k = new Kit();
    k.sph('toy', { p: [0, 0.3, 0], s: [0.2, 0.26, 0.19], c: '#5b6fb0' });
    k.sph('toy', { p: [0, 0.27, 0.07], s: [0.15, 0.2, 0.13], c: '#fffaf2' });
    k.sph('toy', { p: [0, 0.4, 0.18], s: [0.04, 0.025, 0.05], c: '#ffb35a' });
    k.tor('toy', { p: [0, 0.48, 0], s: [0.16, 0.16, 0.12], r: [Math.PI / 2, 0, 0], c: '#ff9fb8' });
    for (const sx of [-1, 1]) {
      k.sph('toy', { p: [sx * 0.19, 0.3, 0], s: [0.04, 0.12, 0.06], r: [0, 0, sx * 0.3], c: '#4a5d9a' });
      k.sph('toy', { p: [sx * 0.07, 0.04, 0.06], s: [0.06, 0.03, 0.08], c: '#ffb35a' });
    }
    return { kit: k, eyes: { size: 0.06, head: { r: 0.19, center: [0, 0.45, 0.02] } }, shadow: 0.22 };
  }, phase, (m, t) => { bodyOf(m).rotation.z = Math.sin(t * 4 + phase * 6) * 0.1; });
}

/** UFO 소(유리 방울 속 젖소 — 별다방 손님) */
export function ufoCow(phase = 0): Model {
  return instance('ufocow', () => {
    const k = new Kit();
    k.sph('toy', { p: [0, 0.55, 0], s: [0.26, 0.22, 0.32], c: '#fffaf2' });
    k.sph('toy', { p: [0.12, 0.64, -0.06], s: [0.1, 0.08, 0.12], c: '#6e5a7a' });
    k.sph('toy', { p: [-0.14, 0.52, 0.1], s: [0.08, 0.07, 0.09], c: '#6e5a7a' });
    k.sph('toy', { p: [0, 0.66, 0.3], s: [0.16, 0.15, 0.14], c: '#fffaf2' });
    k.sph('toy', { p: [0, 0.6, 0.42], s: [0.1, 0.07, 0.06], c: '#ffc4d6' });
    for (const sx of [-1, 1]) {
      k.cone('toy', { p: [sx * 0.11, 0.82, 0.28], s: [0.03, 0.08, 0.03], r: [0, 0, sx * -0.4], c: '#ffe9a8' });
      k.sph('toy', { p: [sx * 0.17, 0.72, 0.27], s: [0.06, 0.025, 0.035], c: '#fffaf2' });
      for (const sz of [-1, 1]) k.cap('toy', { p: [sx * 0.13, 0.3, sz * 0.16], s: [0.045, 0.1, 0.045], c: '#fffaf2' });
    }
    // 유리 방울 + 아래 UFO 받침
    k.sph('clear', { p: [0, 0.55, 0.05], s: 0.62, c: '#c8e8ff' });
    k.sph('toy', { p: [0, 0.02, 0.05], s: [0.6, 0.1, 0.6], c: '#dfe6ee' });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.sph('glow', { p: [Math.cos(a) * 0.52, 0.02, 0.05 + Math.sin(a) * 0.52], s: 0.04, c: i % 2 ? '#ff9fb8' : '#9ef0d2' }); }
    return { kit: k, eyes: { size: 0.06, head: { r: 0.15, center: [0, 0.67, 0.3] } } };
  }, phase);
}

/** 고리 익룡(슈가링 하늘을 빙빙 — 장식) */
export function ringPtero(phase = 0): Model {
  return instance('ringptero', () => {
    const k = new Kit();
    k.sph('toy', { p: [0, 0.4, 0], s: [0.16, 0.14, 0.3], c: '#ffb0d0' });
    k.sph('toy', { p: [0, 0.48, 0.32], s: [0.14, 0.13, 0.14], c: '#ffb0d0' });
    k.cone('toy', { p: [0, 0.6, 0.24], s: [0.05, 0.16, 0.05], r: [-0.9, 0, 0], c: '#ffd84a' });
    k.cone('toy', { p: [0, 0.44, 0.48], s: [0.04, 0.12, 0.04], r: [Math.PI / 2, 0, 0], c: '#ffe9a8' });
    for (const sx of [-1, 1]) k.sph('toy', { p: [sx * 0.42, 0.42, 0], s: [0.38, 0.03, 0.18], r: [0, sx * 0.15, sx * 0.08], c: '#ffd0de' });
    return { kit: k, eyes: { size: 0.06, head: { r: 0.13, center: [0, 0.49, 0.33] } } };
  }, phase);
}

/** 젤리 수장룡(젤리 바다에서 목을 쭉 — 장식) */
export function jellyPlesio(phase = 0): Model {
  return instance('jellyplesio', () => {
    const k = new Kit();
    k.sph('clear', { p: [0, 0.3, -0.2], s: [0.5, 0.3, 0.7], c: '#ff9fd8' });
    for (let i = 0; i < 6; i++) k.sph('clear', { p: [0, 0.5 + i * 0.17, 0.35 + Math.sin(i * 0.4) * 0.12], s: 0.15 - i * 0.008, c: '#ff9fd8' });
    k.sph('clear', { p: [0, 1.55, 0.5], s: [0.2, 0.18, 0.22], c: '#ff9fd8' });
    k.sph('toy', { p: [0, 0.3, -0.2], s: [0.25, 0.14, 0.35], c: '#ffe0f0' });
    return { kit: k, eyes: { size: 0.075, head: { r: 0.19, center: [0, 1.56, 0.52] } } };
  }, phase, (m, t) => { bodyOf(m).rotation.y = Math.sin(t * 0.5 + phase * 3) * 0.3; });
}

// ───────────── 물고기(잡았을 때 들어 올리는 모델) ─────────────
const FISH_LOOK: Record<string, { a: string; b: string; fin: string; glow?: boolean; clear?: boolean; ring?: string; spikes?: boolean; whale?: boolean; flat?: boolean }> = {
  f_galaxy_tail: { a: '#3b5bb5', b: '#a77be0', fin: '#ff9fd8' },
  f_candy_puffer: { a: '#ffd0de', b: '#fffaf2', fin: '#8fd3f4', spikes: true },
  f_cloud_whale_baby: { a: '#fffaf2', b: '#e6f2ff', fin: '#c8e8ff', whale: true },
  f_jelly_salmon: { a: '#ff9fb8', b: '#ffd0de', fin: '#ff9fb8', clear: true },
  f_ring_ray: { a: '#c9b6f2', b: '#fffaf2', fin: '#c9b6f2', ring: '#ffcf4a', flat: true },
  f_blackhole_sunfish: { a: '#4b4566', b: '#a77be0', fin: '#c9a2ff', ring: '#c9a2ff', glow: true },
};
/** 우주 물고기(구름·젤리·블랙홀) — 종 id 로 색을 고른다 */
export function spaceFish(id: string, phase = 0): Model {
  const L = FISH_LOOK[id] ?? { a: '#8fd3f4', b: '#fffaf2', fin: '#ff9fb8' };
  return instance(`fish:${id}`, () => {
    const k = new Kit();
    const body: Layer = L.clear ? 'clear' : 'toy';
    if (L.flat) {
      k.sph(body, { p: [0, 0.12, 0], s: [0.3, 0.05, 0.22], c: L.a });
      k.cone(body, { p: [0, 0.12, -0.3], s: [0.02, 0.24, 0.02], r: [-Math.PI / 2, 0, 0], c: L.a });
    } else {
      k.sph(body, { p: [0, 0.16, 0], s: L.whale ? [0.17, 0.15, 0.24] : [0.12, 0.13, 0.17], c: L.a });
      k.sph('toy', { p: [0, 0.12, 0.03], s: L.whale ? [0.13, 0.08, 0.18] : [0.09, 0.07, 0.12], c: L.b });
      k.sph('toy', { p: [0, 0.17, -0.21], s: [0.02, 0.09, 0.08], c: L.fin });
      k.sph('toy', { p: [0, 0.27, 0], s: [0.015, 0.05, 0.07], c: L.fin });
    }
    if (L.spikes) for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      k.cone('toy', { p: [Math.cos(a) * 0.12, 0.16 + Math.sin(a) * 0.12, 0], s: [0.02, 0.05, 0.02], r: [0, 0, a - Math.PI / 2], c: i % 2 ? '#ff9fb8' : '#ffd84a' });
    }
    if (L.ring) k.thin(L.glow ? 'glow' : 'toy', { p: [0, 0.16, 0], s: L.flat ? 0.28 : 0.2, r: [Math.PI / 2, 0, 0], c: L.ring });
    return { kit: k, eyes: { size: L.flat ? 0.035 : 0.045, head: { r: L.flat ? 0.08 : 0.12, center: [0, 0.17, L.flat ? 0.12 : 0.06] } } };
  }, phase);
}

// ───────────── 종 id → 모델 ─────────────
/** 행성 생물 모델(종 id·GDD id 둘 다). 젤리곰은 color 로 6색 */
export function modelFor(id: string, phase = 0, color?: string): Model {
  switch (id) {
    case 's_jelly_bear': return jellyBear(color ?? '#ff7a8a', phase);
    case 's_ring_snake': return ringSnake(phase);
    case 'star-sheep': case 's_cotton_sheep': return cottonSheep(phase);
    case 's_crystal_hedgehog': return crystalHedgehog(phase);
    case 'ufo-octo': case 's_balloon_octo': return balloonOcto(phase);
    case 's_ufo_jelly': return ufoJelly(phase);
    case 'space-whale': case 's_sky_whale': return skyWhale(phase);
    case 's_comet_fox': return cometFox(phase);
    case 's_little_star': return littleStar(phase);
    case 'ring-snail': return ringSnail(phase);
    default: return spaceFish(id, phase);
  }
}
