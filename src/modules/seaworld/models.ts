// 바다 이벤트 모델(코드로만): 정점색 부품을 하나로 합쳐 메시 하나 = 그리기 한 번.
// 유령선 으스스호 · 꼬마 유령 · 별빛 탐사선(UFO) · 블랙박스 + 비상 풍선 · 보물상자(등급별) · 혹등고래 · 돌고래 · 갈매기 도둑 ·
// 날치 · 무지개 · 동전 · 탐사선 해안 잔해. 생물 얼굴은 core/art 의 눈·볼터치(GDD 7.2)를 쓴다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addEyes, eyeMaterial, blushMaterial, PALETTE } from '../../core/art';

export type Geo = THREE.BufferGeometry;
const tmpC = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

/** 부품 놓기 옵션: 자리 · 회전(라디안 XYZ) · 크기 */
export interface Put { p?: [number, number, number]; r?: [number, number, number]; s?: number | [number, number, number] }

/** 부품을 정점색으로 칠해 모았다가 하나로 합친다 */
export class Bake {
  private parts: Geo[] = [];
  /** color 가 함수면 부품 자기 공간 좌표로 색을 고른다(줄무늬·배 색) */
  add(geo: Geo, color: string | ((p: THREE.Vector3, out: THREE.Color) => void), o: Put = {}): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      if (typeof color === 'string') tmpC.set(color);
      else { v.fromBufferAttribute(pos, i); color(v, tmpC); }
      col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const s = o.s ?? 1;
    _s.set(...(typeof s === 'number' ? [s, s, s] as [number, number, number] : s));
    _e.set(...(o.r ?? [0, 0, 0]));
    _q.setFromEuler(_e);
    _p.set(...(o.p ?? [0, 0, 0]));
    g.applyMatrix4(_m.compose(_p, _q, _s));
    if (g === geo) g = g.clone();
    this.parts.push(g);
    return this;
  }
  get empty() { return this.parts.length === 0; }
  /** 합친 지오메트리(공유 표시 — 청크가 버릴 때 dispose 하지 않는다) */
  build(shared = true): Geo {
    const g = this.parts.length ? mergeGeometries(this.parts, false)! : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    g.userData.shared = shared;
    return g;
  }
}

// ───────────── 기본 도형 ─────────────
const sph = (r: number, w = 24, h = 16) => new THREE.SphereGeometry(r, w, h);
const ell = (rx: number, ry: number, rz: number, w = 28, h = 18) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
const cyl = (r0: number, r1: number, h: number, rs = 16) => new THREE.CylinderGeometry(r0, r1, h, rs);
const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 14);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d, 2, 2, 2);
/** 둥근 별(5갈래) 판 — 두께 t */
function starGeo(r: number, t: number): Geo {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.48 : r;
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelSize: t * 0.6, bevelThickness: t * 0.5, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -t / 2);
  return g;
}

// ───────────── 공유 재질 ─────────────
let matCache: Record<string, THREE.Material> | null = null;
/** 정점색 재질 묶음(모듈 하나가 함께 쓴다) */
export function seaMats() {
  if (matCache) return matCache as {
    body: THREE.MeshStandardMaterial; glossy: THREE.MeshStandardMaterial; ghost: THREE.MeshStandardMaterial; sunken: THREE.MeshStandardMaterial;
    glass: THREE.MeshStandardMaterial; glow: THREE.MeshStandardMaterial; chest: THREE.MeshStandardMaterial; spirit: THREE.MeshStandardMaterial;
    rainbow: THREE.MeshBasicMaterial; coin: THREE.MeshStandardMaterial; foam: THREE.MeshBasicMaterial; line: THREE.MeshBasicMaterial;
  };
  const sh = <T extends THREE.Material>(m: T) => { m.userData.shared = true; return m; };
  matCache = {
    body: sh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 })),
    glossy: sh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.25 })),
    // 유령선: 반투명 보라 + 은은한 빛(투명도는 모듈이 올렸다 내린다)
    ghost: sh(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.4, metalness: 0, transparent: true, opacity: 0, depthWrite: false,
      emissive: new THREE.Color(PALETTE.lavender), emissiveIntensity: 0.75,
    })),
    // 가라앉은 선체: 물빛에 바랜 남보라
    sunken: sh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, color: '#9fb0d6' })),
    glass: sh(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false,
      emissive: new THREE.Color(PALETTE.sky), emissiveIntensity: 0.25,
    })),
    glow: sh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.6 })),
    chest: sh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 })),
    spirit: sh(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.35, transparent: true, opacity: 0.82, depthWrite: false,
      emissive: new THREE.Color(PALETTE.lavender), emissiveIntensity: 0.5,
    })),
    rainbow: sh(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false })),
    coin: sh(new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.25, metalness: 0.7, emissive: new THREE.Color('#ffb02e'), emissiveIntensity: 0.35 })),
    foam: sh(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false })),
    line: sh(new THREE.MeshBasicMaterial({ color: PALETTE.cream })),
  };
  return seaMats();
}

// ───────────── 유령선 으스스호 ─────────────
/** 통통한 해적 유령선(뱃머리 +z, 길이 약 28 m). 선체·돛대·돛·등불 = 지오메트리 하나 */
export function ghostShipGeo(): Geo {
  const b = new Bake();
  const hullCol = (p: THREE.Vector3, o: THREE.Color) => { o.set(Math.floor((p.y + 4) * 1.2) % 2 ? '#7d6c9e' : '#6a5a8a'); };
  // 선체: 아래 반구를 길쭉하게 + 뱃머리 둥글게 들린 모양
  b.add(new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), hullCol, { p: [0, 1.2, 0], s: [6.2, 4.4, 13.5] });
  b.add(cyl(1, 1, 0.5, 40), '#9a88b8', { p: [0, 1.2, 0], s: [6.0, 1, 13.2] }); // 갑판
  b.add(new THREE.TorusGeometry(1, 0.06, 6, 48), '#c9b6f2', { p: [0, 2.0, 0], r: [Math.PI / 2, 0, 0], s: [6.1, 13.4, 1] }); // 난간
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; b.add(cyl(0.07, 0.07, 0.8, 6), '#c9b6f2', { p: [Math.cos(a) * 6.1, 1.6, Math.sin(a) * 13.4] }); }
  // 뱃머리 들린 끝 + 뱃머리 장식 별
  b.add(ell(2.2, 1.8, 3.2), '#7d6c9e', { p: [0, 2.4, 11.2], r: [-0.35, 0, 0] });
  b.add(starGeo(0.9, 0.25), PALETTE.gold, { p: [0, 3.6, 13.6], r: [0, 0, 0] });
  // 선미 선실(둥근 지붕) + 동그란 초록 유령불 창
  b.add(box(6.4, 3.0, 5.0), '#6a5a8a', { p: [0, 3.0, -8.6] });
  b.add(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#8a78ae', { p: [0, 4.4, -8.6], s: [3.4, 1.6, 2.7] });
  for (const sx of [-1, 1]) for (const z of [-9.8, -7.4]) {
    b.add(new THREE.TorusGeometry(0.45, 0.1, 8, 20), PALETTE.gold, { p: [sx * 3.22, 3.1, z], r: [0, Math.PI / 2, 0] });
    b.add(new THREE.CircleGeometry(0.42, 18), PALETTE.neon, { p: [sx * 3.24, 3.1, z], r: [0, sx * Math.PI / 2, 0] });
  }
  // 옆구리 둥근 창 3쌍
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
    b.add(new THREE.TorusGeometry(0.5, 0.1, 8, 20), PALETTE.gold, { p: [sx * 5.55, 0.7, -2.5 + i * 4], r: [0, Math.PI / 2 + sx * 0.25, 0] });
    b.add(new THREE.CircleGeometry(0.46, 18), PALETTE.neon, { p: [sx * 5.6, 0.7, -2.5 + i * 4], r: [0, sx * (Math.PI / 2 - 0.25), 0] });
  }
  // 돛대 2 + 부푼 돛(원통 조각) + 꼭대기 깃발
  for (const [z, h] of [[2.5, 14], [-3.5, 11]] as const) {
    b.add(cyl(0.26, 0.34, h, 10), '#4e4366', { p: [0, 1.2 + h / 2, z] });
    for (const [y, w] of [[h * 0.78, 4.6], [h * 0.45, 5.6]] as const) {
      b.add(new THREE.CylinderGeometry(5, 5, w * 0.62, 18, 1, true, -0.55, 1.1), (p, o) => o.set(p.y > 0 ? '#e6dcff' : '#d9c8ff'),
        { p: [0, 1.2 + y, z - 4.6], s: [w / 5, 1, 1] });
      b.add(cyl(0.12, 0.12, w, 8), '#4e4366', { p: [0, 1.2 + y + w * 0.31, z + 0.35], r: [0, 0, Math.PI / 2] });
    }
    b.add(new THREE.ConeGeometry(0.7, 1.6, 4), PALETTE.magenta, { p: [0.55, 1.2 + h + 0.2, z], r: [0, 0, -Math.PI / 2] });
  }
  // 유령 등불(뱃머리·선미) — 초록빛 둥근 등
  for (const z of [10.5, -11.5]) {
    b.add(cyl(0.1, 0.1, 2.2, 6), '#4e4366', { p: [0, 3.2, z] });
    b.add(sph(0.55, 16, 10), PALETTE.neon, { p: [0, 4.5, z] });
  }
  return b.build();
}
/** 뱃머리 얼굴(눈·볼) — 유령선은 무섭지 않게 웃는 얼굴 */
export function ghostShipFace(): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, 2.3, 13.0);
  g.rotation.x = -0.2;
  addEyes(g, { size: 1.1, y: 0.25, z: 0.6, gap: 2.0, splay: 0.3 });
  return g;
}

/** 꼬마 유령(시트 유령 — 물결 치맛단, 짧은 팔). 높이 약 1.3 m */
export function spiritGeo(): Geo {
  const b = new Bake();
  const body = new THREE.SphereGeometry(0.6, 28, 20);
  const p = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) { const a = Math.atan2(z, x); p.setY(i, y * 1.7 - 0.12 * Math.sin(a * 6) * (-y / 0.6)); p.setX(i, x * (1 + 0.15 * (-y / 0.6))); p.setZ(i, z * (1 + 0.15 * (-y / 0.6))); }
  }
  body.computeVertexNormals();
  b.add(body, (q, o) => o.set(q.y > -0.3 ? '#f3eefe' : '#e6dcff'));
  for (const sx of [-1, 1]) b.add(ell(0.16, 0.12, 0.14), '#f3eefe', { p: [sx * 0.6, -0.12, 0.15] });
  return b.build();
}
/** 꼬마 유령 하나(몸 + 눈 + 볼) */
export function spirit(geo: Geo, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  g.add(m);
  addEyes(g, { size: 0.22, head: { r: 0.6 }, lift: 0.18 });
  return g;
}

// ───────────── 별빛 탐사선(UFO 잔해) ─────────────
/** 접시 몸체(은 + 라벤더 띠 + 노랑·분홍 불빛 + 별 문장 + 다리 셋 중 하나 부러짐). 지름 약 13 m */
export function ufoGeo(): Geo {
  const b = new Bake();
  b.add(ell(6, 1.7, 6, 48, 20), (p, o) => o.set(p.y > 0.2 ? PALETTE.silver : p.y > -0.4 ? '#c9d4e6' : '#b9c3d6'));
  b.add(new THREE.TorusGeometry(6, 0.55, 10, 56), PALETTE.lavender, { r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add(sph(0.38, 12, 8), i % 2 ? PALETTE.yellow : PALETTE.pink, { p: [Math.cos(a) * 6.45, 0, Math.sin(a) * 6.45] });
  }
  b.add(cyl(2.2, 2.8, 0.8, 28), '#c9b6f2', { p: [0, -1.6, 0] }); // 아래 추진 고리
  b.add(starGeo(1.2, 0.3), PALETTE.gold, { p: [0, 0.75, 5.2], r: [-0.3, 0, 0] });
  // 다리 2개(멀쩡) + 부러진 1개(짧게)
  for (const [a, len] of [[0.5, 3.2], [2.6, 3.2], [4.7, 1.3]] as const) {
    const x = Math.cos(a) * 3.6, z = Math.sin(a) * 3.6;
    b.add(cyl(0.22, 0.18, len, 8), '#b9c3d6', { p: [x * (1 + len * 0.05), -1.6 - len * 0.42, z * (1 + len * 0.05)], r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] });
    if (len > 2) b.add(ell(0.6, 0.18, 0.6), '#b9c3d6', { p: [x * 1.17, -1.6 - len * 0.84, z * 1.17] });
  }
  // 안테나 + 별 끝
  b.add(cyl(0.08, 0.1, 3.4, 6), PALETTE.silver, { p: [-1.6, 3.6, -1.2], r: [0.2, 0, 0.35] });
  b.add(starGeo(0.5, 0.18), PALETTE.yellow, { p: [-2.2, 5.3, -0.9], r: [0, 0.6, 0] });
  return b.build();
}
/** 유리 돔(투명 재질용) */
export function ufoDomeGeo(): Geo {
  return new Bake().add(new THREE.SphereGeometry(2.9, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), (p, o) => o.set(p.y > 1.8 ? '#e8f8ff' : PALETTE.sky), { p: [0, 1.15, 0] }).build();
}
/** 탐사선 얼굴(돔 앞 — 졸린 눈) */
export function ufoFace(): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, 1.2, 0);
  addEyes(g, { size: 0.75, head: { r: 2.9 }, lift: 0.32 });
  return g;
}

/** 블랙박스(주황 상자 + 손잡이 + 흰 띠) — 약 0.9 m */
export function blackBoxGeo(): Geo {
  const b = new Bake();
  b.add(box(0.9, 0.62, 0.6), (p, o) => o.set(Math.abs(p.y) < 0.08 ? PALETTE.white : PALETTE.orange));
  b.add(new THREE.TorusGeometry(0.2, 0.05, 8, 16, Math.PI), '#6e4a33', { p: [0, 0.31, 0] });
  b.add(starGeo(0.12, 0.04), PALETTE.yellow, { p: [0, 0, 0.31] });
  return b.build();
}
/** 비상 풍선(분홍) + 매듭 */
export function floatBalloonGeo(): Geo {
  const b = new Bake();
  b.add(ell(0.7, 0.85, 0.7), (p, o) => o.set(p.y > 0.4 ? '#ffd0de' : PALETTE.pink));
  b.add(new THREE.ConeGeometry(0.14, 0.22, 8), PALETTE.pink, { p: [0, -0.9, 0], r: [Math.PI, 0, 0] });
  return b.build();
}

// ───────────── 보물상자 ─────────────
const CHEST_COL: Record<string, [string, string, string]> = {
  wood: ['#c8955f', '#8a5a3a', PALETTE.gold],
  silver: ['#e6edf6', '#a9b8d0', '#8fd3f4'],
  gold: [PALETTE.gold, '#e8a93a', PALETTE.pink],
};
const chestCache = new Map<string, Geo>();
/** 둥근 뚜껑 보물상자(등급 색) + 물에 뜨는 작은 구명 고리. 폭 약 1.1 m */
export function chestGeo(tier: string): Geo {
  const k = CHEST_COL[tier] ? tier : 'wood';
  const hit = chestCache.get(k);
  if (hit) return hit;
  const [main, band, gem] = CHEST_COL[k];
  const b = new Bake();
  b.add(box(1.1, 0.62, 0.74), main, { p: [0, 0.31, 0] });
  b.add(new THREE.CylinderGeometry(0.37, 0.37, 1.1, 20, 1, false, 0, Math.PI), main, { p: [0, 0.62, 0], r: [0, 0, Math.PI / 2] });
  for (const x of [-0.38, 0.38]) {
    b.add(box(0.12, 0.66, 0.78), band, { p: [x, 0.31, 0] });
    b.add(new THREE.TorusGeometry(0.38, 0.05, 6, 20, Math.PI), band, { p: [x, 0.62, 0], r: [0, Math.PI / 2, 0] });
  }
  b.add(box(0.2, 0.24, 0.08), band, { p: [0, 0.6, 0.4] });
  b.add(sph(0.07, 10, 8), gem, { p: [0, 0.6, 0.45] });
  b.add(new THREE.TorusGeometry(0.85, 0.12, 8, 28), (p, o) => o.set(Math.floor((Math.atan2(p.y, p.x) / Math.PI + 1) * 4) % 2 ? PALETTE.white : PALETTE.red),
    { p: [0, 0.08, 0], r: [Math.PI / 2, 0, 0] });
  const g = b.build();
  chestCache.set(k, g);
  return g;
}

// ───────────── 혹등고래 ─────────────
/** 혹등고래(남색 등 + 크림 줄무늬 배 + 흰 혹 + 긴 가슴지느러미). 앞 +z, 길이 약 13 m. 머리가 큰 아기 비율 */
export function humpbackGeo(): Geo {
  const b = new Bake();
  const bodyCol = (p: THREE.Vector3, o: THREE.Color) => {
    if (p.y < -0.25) o.set(Math.floor(p.x * 3 + 10) % 2 ? PALETTE.cream : '#f6e4c0'); else o.set(PALETTE.navy);
  };
  b.add(ell(2.8, 2.4, 4.2, 36, 22), bodyCol, { p: [0, 0, 1.4] });          // 큰 머리 쪽 몸
  b.add(ell(2.0, 1.7, 3.6, 30, 18), bodyCol, { p: [0, -0.1, -2.6] });      // 꼬리 쪽
  b.add(ell(1.0, 0.8, 2.0), PALETTE.navy, { p: [0, 0.1, -5.6] });
  for (const sx of [-1, 1]) {
    b.add(ell(0.55, 2.2, 3.6), '#e8eefc', { p: [sx * 4.0, -0.6, 1.4], r: [0.3, sx * 0.4, sx * 1.15] }); // 가슴지느러미
    b.add(ell(2.0, 0.28, 0.9), PALETTE.navy, { p: [sx * 1.5, 0.1, -6.6], r: [0, sx * -0.35, 0] });    // 꼬리
  }
  b.add(new THREE.ConeGeometry(0.5, 1.0, 10), PALETTE.navy, { p: [0, 1.75, -2.8], r: [-0.5, 0, 0] }); // 등지느러미
  // 머리 위 흰 혹(점)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI - Math.PI / 2;
    b.add(sph(0.22, 10, 8), PALETTE.white, { p: [Math.sin(a) * 1.2, 2.25 - Math.abs(Math.sin(a)) * 0.4, 3.2 + (i % 3) * 0.5] });
  }
  b.add(cyl(0.2, 0.28, 0.2, 10), '#2a3f80', { p: [0, 2.42, 2.4] }); // 숨구멍
  return b.build();
}
/** 고래 얼굴(앞 양옆) */
export function whaleFace(): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, 0.2, 1.4);
  addEyes(g, { size: 0.72, head: { r: 2.75, center: { x: 0, y: 0, z: 0 } }, lift: 0.05, gap: 3.4 });
  return g;
}

// ───────────── 돌고래(인스턴스용 — 눈·볼도 같은 몸 좌표에 구워 둔다) ─────────────
/** 하늘색 돌고래(흰 배 · 짧은 주둥이 · 등지느러미). 앞 +z, 길이 약 2.4 m */
export function dolphinGeo(): Geo {
  const b = new Bake();
  b.add(ell(0.5, 0.5, 1.15), (p, o) => o.set(p.y < -0.15 ? PALETTE.white : PALETTE.sky));
  b.add(cap(0.16, 0.36), PALETTE.white, { p: [0, -0.08, 1.2], r: [Math.PI / 2, 0, 0] });
  b.add(new THREE.ConeGeometry(0.16, 0.48, 10), PALETTE.sky, { p: [0, 0.55, -0.15], r: [-0.55, 0, 0] });
  for (const sx of [-1, 1]) {
    b.add(ell(0.36, 0.06, 0.18), PALETTE.sky, { p: [sx * 0.5, -0.2, 0.3], r: [0, sx * 0.6, sx * -0.5] });
    b.add(ell(0.36, 0.06, 0.17), PALETTE.sky, { p: [sx * 0.24, 0, -1.25], r: [0, sx * -0.5, 0] });
  }
  return b.build();
}
/** 몸 좌표에 구운 눈 판(L·R 따로 — 같은 eyeMaterial 을 쓰는 인스턴스용) */
export function bakedEyes(o: { size: number; y: number; z: number; gap: number; splay?: number }): { L: Geo; R: Geo; blush: Geo } {
  const mk = (side: -1 | 1, size: number, dy: number, dx: number, disc = false) => {
    const g = disc ? new THREE.CircleGeometry(0.5, 16) : new THREE.PlaneGeometry(1, 1);
    g.scale(size, size, 1);
    const splay = o.splay ?? 0.5;
    g.applyMatrix4(_m.compose(_p.set(side * (o.gap / 2 + dx), o.y + dy, o.z), _q.setFromEuler(_e.set(0, side * splay, 0)), _s.set(1, 1, 1)));
    g.userData.shared = true;
    return g;
  };
  const L = mk(-1, o.size, 0, 0), R = mk(1, o.size, 0, 0);
  const bl = mergeGeometries([mk(-1, o.size * 0.8, -o.size * 0.75, o.size * 0.25, true), mk(1, o.size * 0.8, -o.size * 0.75, o.size * 0.25, true)])!;
  bl.scale(1, 0.85, 1);
  bl.userData.shared = true;
  return { L, R, blush: bl };
}
/** 눈·볼 인스턴스 세 개(왼눈·오른눈·볼) — 몸 인스턴스와 같은 행렬을 넣는다 */
export function eyeInstances(e: { L: Geo; R: Geo; blush: Geo }, n: number): THREE.InstancedMesh[] {
  return [
    new THREE.InstancedMesh(e.L, eyeMaterial('L'), n),
    new THREE.InstancedMesh(e.R, eyeMaterial('R'), n),
    new THREE.InstancedMesh(e.blush, blushMaterial(), n),
  ].map((im) => { im.frustumCulled = false; im.renderOrder = 2; return im; });
}

// ───────────── 갈매기 도둑 ─────────────
/** 통통한 흰 갈매기(노랑 부리 · 라벤더 날개 끝) — 날개는 따로 */
export function gullBodyGeo(): Geo {
  const b = new Bake();
  b.add(ell(0.34, 0.32, 0.5), (p, o) => o.set(p.y < -0.1 ? '#fffaf2' : PALETTE.white));
  b.add(sph(0.26), PALETTE.white, { p: [0, 0.28, 0.36] });
  b.add(new THREE.ConeGeometry(0.08, 0.26, 10), PALETTE.yellow, { p: [0, 0.24, 0.66], r: [Math.PI / 2, 0, 0] });
  b.add(new THREE.ConeGeometry(0.16, 0.3, 4), '#c9b6f2', { p: [0, 0.02, -0.52], r: [-Math.PI / 2, 0, 0], s: [1, 1, 0.35] });
  for (const sx of [-1, 1]) b.add(cyl(0.03, 0.03, 0.22, 6), PALETTE.orange, { p: [sx * 0.12, -0.38, 0] });
  return b.build();
}
export function gullWingGeo(): Geo {
  const b = new Bake();
  b.add(ell(0.55, 0.06, 0.24), (p, o) => o.set(p.x > 0.32 ? '#c9b6f2' : PALETTE.white), { p: [0.5, 0, 0] });
  return b.build();
}
/** 물고 가는 생선(하늘 + 주황 꼬리) */
export function carriedFishGeo(): Geo {
  const b = new Bake();
  b.add(ell(0.09, 0.12, 0.26), PALETTE.sky);
  b.add(new THREE.ConeGeometry(0.1, 0.16, 6), PALETTE.orange, { p: [0, 0, -0.3], r: [-Math.PI / 2, 0, 0], s: [1, 1, 0.4] });
  return b.build();
}
/** 갈매기 하나(몸 + 날개 두 장 + 얼굴 + 생선) */
export function gull(): { root: THREE.Group; wingL: THREE.Object3D; wingR: THREE.Object3D; fish: THREE.Object3D } {
  const M = seaMats();
  const root = new THREE.Group();
  const body = new THREE.Mesh(gullBodyGeo(), M.body);
  body.castShadow = true;
  root.add(body);
  const wg = gullWingGeo();
  const wingR = new THREE.Mesh(wg, M.body); wingR.position.set(0.25, 0.08, 0);
  const wingL = new THREE.Mesh(wg, M.body); wingL.position.set(-0.25, 0.08, 0); wingL.scale.x = -1;
  root.add(wingL, wingR);
  const head = new THREE.Group(); head.position.set(0, 0.28, 0.36); root.add(head);
  addEyes(head, { size: 0.11, head: { r: 0.26 }, lift: 0.25 });
  const fish = new THREE.Mesh(carriedFishGeo(), M.body);
  fish.position.set(0, 0.12, 0.8); fish.rotation.set(0, Math.PI / 2, 0.2);
  root.add(fish);
  return { root, wingL, wingR, fish };
}

// ───────────── 날치(띠 장식, 인스턴스) ─────────────
export function flyingFishGeo(): Geo {
  const b = new Bake();
  b.add(ell(0.1, 0.1, 0.26), (p, o) => o.set(p.y < -0.02 ? PALETTE.silver : PALETTE.blue));
  for (const sx of [-1, 1]) b.add(ell(0.26, 0.015, 0.11), '#bfe3ff', { p: [sx * 0.2, 0.03, 0.06], r: [0, sx * -0.35, sx * -0.15] });
  b.add(new THREE.ConeGeometry(0.08, 0.14, 6), PALETTE.blue, { p: [0, 0, -0.3], r: [-Math.PI / 2, 0, 0], s: [1, 1, 0.35] });
  return b.build();
}

// ───────────── 무지개 · 동전 · 물보라 ─────────────
/** 반원 무지개(일곱 색 띠, 반지름 약 10 m) — 바닥이 y=0 */
export function rainbowGeo(): Geo {
  const cols = [PALETTE.red, PALETTE.orange, PALETTE.yellow, PALETTE.lime, PALETTE.sky, PALETTE.blue, PALETTE.purple];
  const b = new Bake();
  cols.forEach((c, i) => b.add(new THREE.TorusGeometry(10 - i * 0.55, 0.3, 6, 56, Math.PI), c));
  return b.build();
}
export function coinGeo(): Geo {
  const g = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16);
  g.rotateX(Math.PI / 2);
  g.userData.shared = true;
  return g;
}
export function foamRingGeo(): Geo {
  const g = new THREE.TorusGeometry(1, 0.12, 6, 28);
  g.rotateX(Math.PI / 2);
  g.userData.shared = true;
  return g;
}
export function puffGeo(): Geo { const g = sph(0.5, 10, 8); g.userData.shared = true; return g; }

// ───────────── 탐사선 해안 잔해(은하나비 자리) ─────────────
/** 바닷가에 밀려온 은빛 판·별 수정·부러진 안테나(+z 가 바다 쪽) */
export function wreckshoreGeo(rnd: () => number): { body: Geo; glow: Geo } {
  const b = new Bake(), g = new Bake();
  for (let i = 0; i < 5; i++) {
    const x = (rnd() - 0.5) * 22, z = (rnd() - 0.5) * 14;
    b.add(box(1.6 + rnd() * 1.8, 0.16, 1.0 + rnd() * 1.4), i % 2 ? PALETTE.silver : '#c9d4e6', { p: [x, 0.12, z], r: [rnd() * 0.5, rnd() * 3, rnd() * 0.4] });
  }
  b.add(cyl(0.1, 0.12, 3.6, 8), PALETTE.silver, { p: [4, 0.9, -3], r: [0, 0, 1.1] });
  b.add(starGeo(0.45, 0.16), PALETTE.yellow, { p: [5.6, 0.25, -3.6], r: [-Math.PI / 2, 0, 0.4] });
  b.add(new THREE.TorusGeometry(1.4, 0.25, 8, 28, Math.PI * 1.3), PALETTE.lavender, { p: [-5, 0.25, 2], r: [Math.PI / 2, 0, 0.5] });
  // 은하빛 수정(밤에 은하나비가 모이는 곳)
  for (let i = 0; i < 9; i++) {
    const x = (rnd() - 0.5) * 18, z = (rnd() - 0.5) * 12, s = 0.35 + rnd() * 0.5;
    const c = [PALETTE.lavender, PALETTE.sky, PALETTE.pink][i % 3];
    g.add(new THREE.OctahedronGeometry(s, 0), c, { p: [x, s * 0.9, z], r: [rnd() * 0.4, rnd() * 3, rnd() * 0.4], s: [0.7, 1.4, 0.7] });
  }
  return { body: b.build(), glow: g.build() };
}
