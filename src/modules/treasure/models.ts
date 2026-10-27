// treasure 모델 — 전부 코드로 만든 통통한 소품. 지오메트리·재질은 모듈 전역에서 한 번만 만들고 공유한다(userData.shared = true).
// 한 종류 = 정점색 지오메트리 하나(여러 부품을 합쳐 InstancedMesh 한 번에 그린다).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ───────────── 도우미 ─────────────
/** 위치·법선·정점색만 남기고 비색인으로(합치기 쉽게) */
function paint(g: THREE.BufferGeometry, bottom: string, top = bottom, axis: 'y' | 'x' = 'y'): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) { const v = axis === 'y' ? pos.getY(i) : pos.getX(i); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const a = new THREE.Color(bottom), b = new THREE.Color(top), c = new THREE.Color();
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = axis === 'y' ? pos.getY(i) : pos.getX(i);
    c.copy(a).lerp(b, hi > lo ? (v - lo) / (hi - lo) : 0);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: number | [number, number, number] = 1) => {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s),
  );
  g.applyMatrix4(m);
  return g;
};
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}
/** 둥근 모서리 상자 */
function rbox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const x = -w / 2 + r, y = -h / 2 + r, ww = w - 2 * r, hh = h - 2 * r;
  s.moveTo(x, -h / 2);
  s.lineTo(x + ww, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, y);
  s.lineTo(w / 2, y + hh); s.quadraticCurveTo(w / 2, h / 2, x + ww, h / 2);
  s.lineTo(x, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y + hh);
  s.lineTo(-w / 2, y); s.quadraticCurveTo(-w / 2, -h / 2, x, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelSize: r * 0.9, bevelThickness: r, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}
/** 통통한 별(5갈래) */
function puffyStar(r: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2, rr = i % 2 ? r * 0.48 : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: r * 0.16, bevelThickness: r * 0.18, bevelSegments: 3 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ───────────── 재질(공유) ─────────────
const MATS = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = MATS.get(key);
  if (!m) { m = make(); MATS.set(key, m); }
  return m;
}
export const matte = () => mat('matte', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }));
export const gloss = () => mat('gloss', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0 }));
/** 반짝 빛나는 것(별가루·운석·반짝임) — 빛 세기는 glintPulse 가 흔든다 */
export const paintMat = () => mat('paint', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }));
export const glow = () => mat('glow', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: new THREE.Color('#fff3b0'), emissiveIntensity: 0.6 }));
export const glass = () => mat('glass', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, transparent: true, opacity: 0.72, depthWrite: false }));
export const bubbleMat = () => mat('bubble', () => new THREE.MeshStandardMaterial({ color: '#e8f8ff', roughness: 0.1, transparent: true, opacity: 0.55, emissive: new THREE.Color('#bfe9ff'), emissiveIntensity: 0.35, depthWrite: false }));
export const glintMat = () => mat('glint', () => new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.9, depthWrite: false }));
export const pillarMat = () => mat('pillar', () => new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));

/** 반짝임 숨쉬기(t 기반 — 모든 반짝이가 같이) */
export function glintPulse(t: number) {
  (glow() as THREE.MeshStandardMaterial).emissiveIntensity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.1));
  (glintMat() as THREE.MeshBasicMaterial).opacity = 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(t * 4.3));
  (pillarMat() as THREE.MeshBasicMaterial).opacity = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(t * 2.2));
}

// ───────────── 지오메트리(공유, 처음 쓸 때) ─────────────
const GEOS = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = GEOS.get(key);
  if (!g) { g = make(); g.userData.shared = true; GEOS.set(key, g); }
  return g;
}

/** 화석 X: 모래 둔덕 + 통통한 X 두 줄(바닥에 거의 붙어 있다) */
export const xGeo = (big = false) => geo(big ? 'mapx' : 'x', () => {
  const k = big ? 1.35 : 1;
  const cx = big ? ['#ff6b6b', '#ff8f8f'] : ['#a8764f', '#c99a6e'];
  const mound = paint(new THREE.SphereGeometry(0.62 * k, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#e9cf9c', '#f4e2b0');
  at(mound, 0, -0.02, 0, 0, 0, 0, [1, 0.16, 1]);
  const bar = (rot: number) => at(paint(rbox(1.05 * k, 0.12, 0.2 * k, 0.05), cx[0], cx[1]), 0, 0.1, 0, 0, rot, 0);
  // 둔덕 위 작은 돌 두 알
  const pebble = (x: number, z: number) => at(paint(new THREE.IcosahedronGeometry(0.07, 1), '#cfc3d9', '#e6dcef'), x, 0.08, z, 0, 0, 0, [1, 0.7, 1]);
  return merge([mound, bar(Math.PI / 4), bar(-Math.PI / 4), pebble(0.42 * k, 0.18), pebble(-0.3 * k, -0.4 * k)]);
});

/** 조개껍데기: 부채 모양 줄무늬 반구 */
export const shellGeo = () => geo('shell', () => {
  const g = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const ridge = 1 + 0.18 * Math.max(0, Math.cos(a * 9));
    // 부채꼴로 앞쪽이 넓게
    const fan = 0.75 + 0.25 * Math.cos(a - Math.PI / 2);
    p.setXYZ(i, x * fan * ridge, y * ridge, z * ridge);
  }
  g.computeVertexNormals();
  const body = at(paint(g, '#ffb3a7', '#ffe3d1'), 0, 0.01, 0, 0, 0, 0, [0.13, 0.06, 0.12]);
  const hinge = at(paint(new THREE.SphereGeometry(0.035, 12, 8), '#ffc59a'), 0, 0.02, -0.1, 0, 0, 0, [1.4, 0.7, 1]);
  return merge([body, hinge]);
});

/** 깃털: 라벤더→하늘 깃 + 깃대 */
export const featherGeo = () => geo('feather', () => {
  const vane = at(paint(new THREE.SphereGeometry(1, 20, 12), '#c9b6f2', '#8fd3f4', 'x'), 0.02, 0.03, 0, 0, 0.3, 0, [0.2, 0.018, 0.075]);
  const tip = at(paint(new THREE.SphereGeometry(1, 14, 10), '#ff9fb8'), 0.2, 0.03, 0.02, 0, 0.3, 0, [0.05, 0.016, 0.04]);
  const quill = at(paint(new THREE.CylinderGeometry(0.008, 0.012, 0.42, 6), '#fff1cf'), 0, 0.03, 0, 0, 0.3, Math.PI / 2);
  return merge([vane, tip, quill]);
});

/** 별가루: 통통한 노란 별(세워서) */
export const starGeo = () => geo('star', () => merge([at(paint(puffyStar(0.16, 0.06), '#ffd84a', '#fff2a8'), 0, 0.24, 0)]));

/** 운석 조각: 울퉁불퉁 보라 돌 */
export const meteorGeo = () => geo('meteor', () => {
  const g = new THREE.IcosahedronGeometry(0.17, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.12 * Math.sin(x * 37 + y * 23) * Math.cos(z * 31);
    p.setXYZ(i, x * k, y * k * 0.8, z * k);
  }
  g.computeVertexNormals();
  return merge([at(paint(g, '#a77be0', '#d8c8ff'), 0, 0.12, 0)]);
});

/** 병편지 크기 배율(해변에서 잘 보이게 통통하게) */
const BOTTLE_K = 1.5;
/** 병편지: 민트 유리병 + 코르크 + 안의 종이 두루마리(눕혀서) */
export const bottleGlassGeo = () => geo('bottle-glass', () => {
  const pts: THREE.Vector2[] = [];
  const prof: Array<[number, number]> = [[0.001, 0], [0.09, 0.005], [0.105, 0.04], [0.105, 0.2], [0.09, 0.25], [0.04, 0.3], [0.035, 0.36], [0.04, 0.37], [0.001, 0.37]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 20);
  return merge([at(at(paint(g, '#9ef0d2', '#cfeee6'), -0.18, 0.1, 0, 0, 0, -Math.PI / 2), 0, 0, 0, 0, 0, 0, BOTTLE_K)]);
});
export const bottleInnerGeo = () => geo('bottle-inner', () => {
  const cork = at(paint(new THREE.CylinderGeometry(0.038, 0.032, 0.07, 12), '#c99a6e', '#e9d3a8'), 0.2, 0.1, 0, 0, 0, Math.PI / 2);
  const scroll = at(paint(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 12), '#fff1cf', '#fffaf2'), -0.06, 0.1, 0, 0, 0, Math.PI / 2);
  const ribbon = at(paint(new THREE.TorusGeometry(0.047, 0.01, 6, 16), '#ff7aa2'), -0.06, 0.1, 0, 0, Math.PI / 2, 0);
  return merge([cork, scroll, ribbon].map((g) => at(g, 0, 0, 0, 0, 0, 0, BOTTLE_K)));
});

/** 헌 타이어(누워 있음, 파스텔 회보라 — 순수 검정 금지) */
export const tireGeo = () => geo('tire', () => merge([at(paint(new THREE.TorusGeometry(0.25, 0.1, 12, 24), '#6f6a80', '#8f8aa3'), 0, 0.1, 0, Math.PI / 2, 0, 0, [1, 1, 0.9])]));
/** 찌그러진 깡통 */
export const canGeo = () => geo('can', () => {
  const g = new THREE.CylinderGeometry(0.07, 0.07, 0.2, 14, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getX(i) > 0.02) p.setX(i, p.getX(i) * 0.75);
  g.computeVertexNormals();
  const band = at(paint(new THREE.CylinderGeometry(0.072, 0.072, 0.08, 14), '#ff8a7a'), 0, 0.07, 0, 0, 0, Math.PI / 2);
  return merge([at(paint(g, '#dfe6ee', '#c8d0dc'), 0, 0.07, 0, 0, 0, Math.PI / 2), band]);
});
/** 헌 장화(옆으로 누움) */
export const bootGeo = () => geo('boot', () => {
  const leg = at(paint(new THREE.CylinderGeometry(0.075, 0.085, 0.3, 14), '#a8764f', '#c99a6e'), 0, 0.09, 0, 0, 0, Math.PI / 2);
  const foot = at(paint(new THREE.SphereGeometry(1, 14, 10), '#a8764f', '#b8865f'), -0.16, 0.08, 0.06, 0, 0, 0, [0.09, 0.08, 0.14]);
  return merge([leg, foot]);
});

/** 해초 한 무더기(키 큰 곡선 잎 4장) */
export const seaweedGeo = () => geo('seaweed', () => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08),
      new THREE.Vector3(Math.cos(a) * 0.2, 0.45 + i * 0.08, Math.sin(a) * 0.15),
      new THREE.Vector3(Math.cos(a + 0.6) * 0.1, 0.95 + i * 0.12, Math.sin(a + 0.6) * 0.12),
    ]);
    parts.push(paint(new THREE.TubeGeometry(curve, 10, 0.045, 6, false), '#5cc16a', '#a8e06a'));
  }
  return merge(parts);
});
/** 산호(분홍 가지) */
export const coralGeo = () => geo('coral', () => {
  const parts: THREE.BufferGeometry[] = [paint(at(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.5, 1]), '#ff8a7a')];
  const br = [[0, 0.5, 0, 0], [0.18, 0.38, 0.05, -0.5], [-0.15, 0.42, -0.06, 0.55], [0.05, 0.34, -0.16, 0.2]];
  for (const [x, h, z, tilt] of br) {
    parts.push(at(paint(new THREE.CylinderGeometry(0.035, 0.06, h, 8), '#ff8a7a', '#ffb3a7'), x * 0.6, h / 2, z * 0.6, tilt * 0.6, 0, -tilt));
    parts.push(at(paint(new THREE.SphereGeometry(0.055, 10, 8), '#ffd0de'), x * 0.6 + Math.sin(-tilt) * h * 0.5, h, z * 0.6 + Math.sin(tilt * 0.6) * h * 0.5));
  }
  return merge(parts);
});
/** 진주굴: 살짝 벌어진 조개 두 장 + 진주 */
export const oysterGeo = () => geo('oyster', () => {
  const half = () => new THREE.SphereGeometry(0.22, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const low = at(paint(half(), '#e6dcef', '#c9b6f2'), 0, 0.02, 0, Math.PI, 0, 0, [1, 0.35, 1]);
  const top = at(paint(half(), '#c9b6f2', '#e6dcef'), 0, 0.05, -0.06, -0.5, 0, 0, [1, 0.35, 1]);
  const pearl = at(paint(new THREE.SphereGeometry(0.06, 14, 10), '#fffaf2', '#f3eefe'), 0, 0.06, 0.04);
  return merge([low, top, pearl]);
});

/** 반짝임(작은 마름모 별) */
export const glintGeo = () => geo('glint', () => {
  const g = new THREE.OctahedronGeometry(0.09, 0);
  g.scale(0.5, 1.4, 0.5);
  g.userData.shared = true;
  return g;
});
/** 거품 하나 */
export const bubbleGeo = () => geo('bubble', () => { const g = new THREE.SphereGeometry(0.07, 10, 8); g.userData.shared = true; return g; });
/** 보물지도 X 빛기둥 */
export const pillarGeo = () => geo('pillar', () => { const g = new THREE.CylinderGeometry(0.5, 0.75, 9, 20, 1, true); g.translate(0, 4.5, 0); g.userData.shared = true; return g; });

/** 시각 종류 → [지오메트리, 재질] 묶음(한 종류가 여러 겹이면 여러 개) */
export function visualOf(kind: string, item?: string): Array<[THREE.BufferGeometry, THREE.Material]> {
  switch (kind) {
    case 'x': return [[xGeo(), matte()]];
    case 'mapx': return [[xGeo(true), matte()], [pillarGeo(), pillarMat()]];
    case 'shell': return [[shellGeo(), gloss()]];
    case 'feather': return [[featherGeo(), matte()]];
    case 'stardust': return [[starGeo(), glow()]];
    case 'meteor': return [[meteorGeo(), glow()]];
    case 'bottle': case 'seabottle': return [[bottleInnerGeo(), matte()], [bottleGlassGeo(), glass()]];
    case 'junk': return item === 't_can' ? [[canGeo(), gloss()]] : item === 't_boot' ? [[bootGeo(), matte()]] : [[tireGeo(), matte()]];
    case 'seaweed': return [[seaweedGeo(), matte()]];
    case 'coral': return [[coralGeo(), matte()]];
    case 'oyster': return [[oysterGeo(), gloss()]];
    default: return [];
  }
}

// ───────────── 낱개 모델(살아 있는 것: 금상자·선물·돌멩이·팡 조각) ─────────────
/** 금상자(뚜껑이 열린다) — root.userData.lid 를 돌린다 */
export function goldChestModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'treasure-goldchest';
  const body = new THREE.Mesh(merge([
    at(paint(rbox(0.9, 0.5, 0.6, 0.08), '#e0a84a', '#ffcf4a'), 0, 0.25, 0),
    at(paint(rbox(0.94, 0.1, 0.64, 0.04), '#fff1cf'), 0, 0.42, 0),
    at(paint(rbox(0.12, 0.52, 0.64, 0.04), '#fff1cf'), -0.28, 0.26, 0),
    at(paint(rbox(0.12, 0.52, 0.64, 0.04), '#fff1cf'), 0.28, 0.26, 0),
  ]), gloss());
  body.castShadow = true;
  const lid = new THREE.Group();
  lid.position.set(0, 0.5, -0.3);
  const lidMesh = new THREE.Mesh(merge([
    at(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20, 1, false, 0, Math.PI), '#ffcf4a', '#ffe58a'), 0, 0, 0.3, 0, 0, Math.PI / 2, [1, 1, 1]),
    at(paint(new THREE.SphereGeometry(0.07, 14, 10), '#ff9fb8'), 0, 0.1, 0.62),
  ]), gloss());
  lidMesh.scale.set(1, 0.55, 1);
  lidMesh.castShadow = true;
  lid.add(lidMesh);
  root.add(body, lid);
  root.userData.lid = lid;
  return root;
}

/** 떨어지는 선물 상자(라일락 상자 + 분홍 리본) */
export function giftModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'treasure-gift';
  const m = new THREE.Mesh(merge([
    paint(rbox(0.42, 0.36, 0.42, 0.07), '#e9e3ff', '#ffffff'),
    paint(rbox(0.44, 0.38, 0.1, 0.03), '#ff7aa2'),
    paint(rbox(0.1, 0.38, 0.44, 0.03), '#ff7aa2'),
    at(paint(new THREE.TorusGeometry(0.07, 0.03, 10, 22), '#ff7aa2'), -0.075, 0.23, 0, 0, 0, -0.5, [1, 0.75, 0.7]),
    at(paint(new THREE.TorusGeometry(0.07, 0.03, 10, 22), '#ff7aa2'), 0.075, 0.23, 0, 0, 0, 0.5, [1, 0.75, 0.7]),
    at(paint(new THREE.SphereGeometry(0.04, 12, 10), '#ff6a96'), 0, 0.21, 0),
  ]), gloss());
  m.castShadow = true;
  root.add(m);
  return root;
}

/** 새총 돌멩이 */
export function pebbleModel(): THREE.Mesh {
  const m = new THREE.Mesh(geo('pebble', () => merge([paint(new THREE.IcosahedronGeometry(0.07, 1), '#cfc3d9', '#e6dcef')])), matte());
  m.name = 'treasure-pebble';
  return m;
}

/** 팡! 색종이 조각 n개(InstancedMesh, userData.parts 에 속도) */
export function confettiBurst(n: number, r: () => number): THREE.InstancedMesh {
  const g = geo('confetti', () => { const b = new THREE.PlaneGeometry(0.09, 0.06); b.userData.shared = true; return b; });
  const m = new THREE.InstancedMesh(g, mat('confetti', () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true })), n);
  const cols = ['#ff5f6d', '#ffd34a', '#62c6ff', '#ff9fb8', '#a8e06a', '#c9b6f2'];
  const parts: Array<{ v: THREE.Vector3; p: THREE.Vector3; spin: THREE.Vector3 }> = [];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, e = r() * Math.PI - Math.PI / 2, s = 2.5 + r() * 3.5;
    parts.push({ v: new THREE.Vector3(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s), p: new THREE.Vector3(), spin: new THREE.Vector3(r() * 9, r() * 9, r() * 9) });
    m.setColorAt(i, c.set(cols[i % cols.length]));
  }
  m.userData.parts = parts;
  m.frustumCulled = false;
  return m;
}

/** 파낸 물건이 구멍에서 쏙(색 공 + 반짝 별) */
export function popItemModel(color: string): THREE.Group {
  const root = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: new THREE.Color(color), emissiveIntensity: 0.25 }));
  const star = new THREE.Mesh(starGeo(), glow());
  star.position.y = 0.1;
  star.scale.setScalar(0.8);
  root.add(ball, star);
  root.userData.own = [ball.geometry, ball.material];
  return root;
}
