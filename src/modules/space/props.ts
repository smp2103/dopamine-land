// 달 소품 모델(코드로만): 착륙 로켓(창 = 눈, 볼 스티커) · 착륙 패드 · 펭박사 깃발 · 찹쌀떡 지붕 떡집 · 절구와 공이 ·
// 떡 가게 매대 · 우주상자 · UFO 잔해 · 별공룡 둥지 · 월석 · 연못 물 · 전망대 표지판. 둥글고 통통하게, 파스텔로.
import * as THREE from 'three';
import { addBlush, addEyes } from '../../core/art';
import { G, fur, starGeometry } from './model';

const sh = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => { x.userData.shared = true; return x; };
const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, p?: [number, number, number], s?: number | [number, number, number], shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  if (p) m.position.set(p[0], p[1], p[2]);
  if (s !== undefined) { if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
const matCache = new Map<string, THREE.Material>();
/** 소품용 매끈 재질(공유) */
function plastic(color: string, o: { glow?: number; rough?: number; alpha?: number; metal?: number } = {}) {
  const k = `${color}|${o.glow ?? 0}|${o.rough ?? 0.4}|${o.alpha ?? 1}|${o.metal ?? 0}`;
  let m = matCache.get(k);
  if (!m) {
    m = sh(new THREE.MeshPhysicalMaterial({
      color, roughness: o.rough ?? 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3, metalness: o.metal ?? 0,
      emissive: color, emissiveIntensity: o.glow ?? 0.06, transparent: (o.alpha ?? 1) < 1, opacity: o.alpha ?? 1, depthWrite: (o.alpha ?? 1) >= 1,
    }));
    matCache.set(k, m);
  }
  return m;
}
export { plastic };

// ── 공유 지오메트리
const GEO = {
  sphere: sh(new THREE.SphereGeometry(1, 32, 22)),
  sphereLo: sh(new THREE.SphereGeometry(1, 16, 12)),
  cyl: sh(new THREE.CylinderGeometry(1, 1, 1, 32)),
  torus: sh(new THREE.TorusGeometry(1, 0.18, 14, 40)),
  half: sh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)),
  star: sh(starGeometry(1, 0.45, 0.35)),
  box: sh(new THREE.BoxGeometry(1, 1, 1)),
};
/** 둥근 모서리 상자 */
let rboxC: THREE.BufferGeometry | null = null;
function roundBox() {
  if (rboxC) return rboxC;
  const g = new THREE.BoxGeometry(1, 1, 1, 6, 6, 6);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = v.clone().clampScalar(-0.36, 0.36);
    const d = v.clone().sub(c);
    if (d.lengthSq() > 0) d.setLength(0.14);
    p.setXYZ(i, c.x + d.x, c.y + d.y, c.z + d.z);
  }
  g.computeVertexNormals();
  return (rboxC = sh(g));
}

/** 캔버스 텍스처(없으면 단색) */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, fallback: string) {
  if (hasDom()) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (g) { draw(g); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  }
  const col = new THREE.Color(fallback);
  const t = new THREE.DataTexture(new Uint8Array([col.r * 255, col.g * 255, col.b * 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}
/** 간판 판(글자) */
export function signBoard(text: string, sub: string, color: string, w = 2.6, h = 1.1) {
  const g = new THREE.Group();
  const tex = canvasTex(512, 220, (x) => {
    x.fillStyle = '#fff8e8';
    x.beginPath(); x.roundRect(6, 6, 500, 208, 46); x.fill();
    x.lineWidth = 10; x.strokeStyle = color; x.stroke();
    x.fillStyle = '#4a3b2a'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '64px Jua, sans-serif'; x.fillText(text, 256, sub ? 88 : 110);
    if (sub) { x.font = '40px Jua, sans-serif'; x.fillStyle = '#8a6f55'; x.fillText(sub, 256, 160); }
  }, '#fff8e8');
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0.12, emissiveMap: tex, side: THREE.DoubleSide }));
  board.position.y = 1.5;
  g.add(board);
  const back = mesh(roundBox(), plastic(color), [0, 1.5, -0.06], [w + 0.16, h + 0.16, 0.1]);
  g.add(back);
  for (const s of [-1, 1]) g.add(mesh(GEO.cyl, plastic('#e9d3a8', { rough: 0.7 }), [s * w * 0.38, 0.5, -0.06], [0.07, 1.0, 0.07]));
  return g;
}

// ───────────── 착륙 로켓(타고 온 로켓 — 창이 눈, 볼 스티커) ─────────────
export function makeRocket() {
  const g = new THREE.Group();
  g.name = 'moon-rocket';
  const body = new THREE.LatheGeometry(
    Array.from({ length: 24 }, (_, i) => { const k = i / 23; const y = k * 8.4; const r = 1.55 * Math.sin(Math.PI * Math.min(1, 0.1 + k * 0.95)) ** 0.6 * (k > 0.86 ? 1 - (k - 0.86) * 4 : 1); return new THREE.Vector2(Math.max(0.05, r), y); }),
    48,
  );
  body.computeVertexNormals();
  const white = plastic('#fff8f2', { rough: 0.35 }), pink = plastic('#ff9fb8', { rough: 0.35 }), mint = plastic('#9ef0d2', { rough: 0.35 });
  const b = mesh(body, white, [0, 1.4, 0]); g.add(b);
  const nose = mesh(GEO.half, pink, [0, 8.4, 0], [1.05, 1.6, 1.05]); g.add(nose);
  const band = mesh(GEO.torus, pink, [0, 3.6, 0], [1.5, 1.5, 1.5]); band.rotation.x = Math.PI / 2; g.add(band);
  // 창 2개 = 눈(공용 눈 텍스처를 창 안에) + 볼 스티커
  const faceG = new THREE.Group(); faceG.position.set(0, 6.0, 1.42); g.add(faceG);
  for (const s of [-1, 1]) {
    const rim = mesh(GEO.torus, mint, [s * 0.55, 0, 0.02], [0.42, 0.42, 0.42]); faceG.add(rim);
    const glass = mesh(GEO.half, plastic('#c8e8ff', { glow: 0.3, rough: 0.05 }), [s * 0.55, 0, -0.04], [0.4, 0.07, 0.4]); glass.rotation.x = Math.PI / 2; faceG.add(glass);
  }
  addEyes(faceG, { size: 0.46, gap: 1.1, y: 0, z: 0.1, splay: 0.12, blush: false });
  addBlush(faceG, 0.46, { y: -0.48, z: 0.02, gap: 1.6 });
  const smile = mesh(G.smile, fur('#6e4a5a', { glow: 0 }), [0, -0.55, 0.04], 0.16, false); smile.rotation.z = Math.PI; faceG.add(smile);
  // 둥근 지느러미 3장 + 발
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = mesh(GEO.sphere, i === 0 ? pink : mint, [Math.sin(a) * 1.55, 2.0, Math.cos(a) * 1.55], [0.22, 1.5, 1.0]);
    fin.rotation.y = a; g.add(fin);
    const foot = mesh(GEO.sphere, white, [Math.sin(a) * 2.2, 0.25, Math.cos(a) * 2.2], [0.42, 0.21, 0.42]); g.add(foot);
  }
  const top = mesh(GEO.sphereLo, new THREE.MeshStandardMaterial({ color: '#fff2a8', emissive: '#ffe066', emissiveIntensity: 1.2 }), [0, 10.0, 0], 0.28, false);
  g.add(top);
  g.userData.beacon = top;
  const noz = mesh(GEO.cyl, plastic('#c9b6f2', { rough: 0.4, metal: 0.3 }), [0, 1.0, 0], [0.85, 0.8, 0.85]); g.add(noz);
  // 불꽃(귀환 때만 보인다)
  const flame = new THREE.Group(); flame.visible = false; g.add(flame);
  for (let i = 0; i < 5; i++) flame.add(mesh(GEO.sphereLo, new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffd84a' : '#ffa24c', transparent: true, opacity: 0.85 }), [Math.sin(i * 2.4) * 0.3, 0.3 - i * 0.55, Math.cos(i * 2.4) * 0.3], 0.7 - i * 0.1, false));
  g.userData.flame = flame;
  return g;
}

/** 착륙 패드: 둥근 원반 + 분홍 고리 줄 + 깜빡이는 착륙등 */
export function makePad(r: number) {
  const g = new THREE.Group();
  g.name = 'moon-pad';
  const prof = [new THREE.Vector2(0.001, 0.32), new THREE.Vector2(r - 0.6, 0.32), new THREE.Vector2(r - 0.1, 0.22), new THREE.Vector2(r, 0.05), new THREE.Vector2(r, -0.6)];
  const disc = mesh(new THREE.LatheGeometry(prof, 64), plastic('#ece6f6', { rough: 0.55 }), [0, 0, 0], 1, false);
  disc.receiveShadow = true;
  g.add(disc);
  for (const [rr, c] of [[r * 0.82, '#ff9fb8'], [r * 0.55, '#c9b6f2'], [r * 0.28, '#ff9fb8']] as const) {
    const ring = mesh(GEO.torus, plastic(c, { glow: 0.2 }), [0, 0.33, 0], [rr, rr, 0.35], false); ring.rotation.x = Math.PI / 2; g.add(ring);
  }
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const l = mesh(GEO.sphereLo, new THREE.MeshStandardMaterial({ color: '#fff2a8', emissive: i % 2 ? '#ffe066' : '#9ef0d2', emissiveIntensity: 1.4 }), [Math.cos(a) * (r - 0.35), 0.4, Math.sin(a) * (r - 0.35)], 0.16, false);
    g.add(l); lights.push(l);
  }
  g.userData.lights = lights;
  return g;
}

/** 펭박사 깃발: 장대 + 펭귄 얼굴 깃발(캔버스) */
export function makePengFlag() {
  const g = new THREE.Group();
  g.name = 'moon-peng-flag';
  g.add(mesh(GEO.cyl, plastic('#fffaf2', { metal: 0.2 }), [0, 2.2, 0], [0.07, 4.4, 0.07]));
  g.add(mesh(GEO.sphereLo, plastic('#ffcf4a', { glow: 0.4, metal: 0.5 }), [0, 4.45, 0], 0.14));
  const tex = canvasTex(256, 160, (x) => {
    x.fillStyle = '#8fd3f4'; x.fillRect(0, 0, 256, 160);
    x.fillStyle = '#ffffff'; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(20 + i * 28, 16 + (i % 2) * 128, 4, 0, Math.PI * 2); x.fill(); }
    // 펭귄 얼굴
    x.fillStyle = '#3b5bb5'; x.beginPath(); x.ellipse(128, 84, 54, 50, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fffaf2'; x.beginPath(); x.ellipse(128, 94, 40, 36, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#3d3a4a'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(128 + s * 16, 82, 6, 8, 0, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#ffffff'; for (const s of [-1, 1]) { x.beginPath(); x.arc(128 + s * 16 + 2, 79, 2.4, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#ffa24c'; x.beginPath(); x.moveTo(118, 94); x.lineTo(138, 94); x.lineTo(128, 106); x.fill();
    x.fillStyle = 'rgba(255,159,184,0.7)'; for (const s of [-1, 1]) { x.beginPath(); x.arc(128 + s * 28, 100, 7, 0, Math.PI * 2); x.fill(); }
    // 보안경
    x.strokeStyle = '#ffcf4a'; x.lineWidth = 5; x.beginPath(); x.arc(112, 80, 13, 0, Math.PI * 2); x.arc(144, 80, 13, 0, Math.PI * 2); x.stroke();
  }, '#8fd3f4');
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.12, 12, 4), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0.15, emissiveMap: tex }));
  flag.position.set(0.95, 3.75, 0);
  g.add(flag);
  g.userData.flag = flag;
  return g;
}

// ───────────── 떡방아 토끼 마을 ─────────────
/** 찹쌀떡 지붕 떡집: 둥근 크림 벽 + 말랑하게 늘어진 흰 떡 지붕 + 분홍 콩 장식 + 아치 문 + 둥근 창 */
export function makeMochiHouse(tint: string) {
  const g = new THREE.Group();
  g.name = 'moon-mochi-house';
  const wall = new THREE.LatheGeometry([
    new THREE.Vector2(0.001, 0), new THREE.Vector2(2.6, 0), new THREE.Vector2(2.75, 0.3), new THREE.Vector2(2.7, 2.2), new THREE.Vector2(2.5, 2.6), new THREE.Vector2(0.001, 2.6),
  ], 40);
  wall.computeVertexNormals();
  g.add(mesh(wall, plastic('#fff1cf', { rough: 0.8 }), [0, 0, 0]));
  // 떡 지붕: 납작 구를 아래로 처지게(가장자리가 도톰)
  const roofG = new THREE.SphereGeometry(1, 40, 24);
  const p = roofG.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const yy = y < 0 ? y * 0.25 : y * (0.9 - 0.15 * (x * x + z * z));
    const bulge = 1 + 0.05 * Math.sin(Math.atan2(z, x) * 5) * (1 - Math.abs(y));
    p.setXYZ(i, x * bulge, yy, z * bulge);
  }
  roofG.computeVertexNormals();
  g.add(mesh(roofG, plastic('#fffaf2', { rough: 0.55, glow: 0.08 }), [0, 2.55, 0], [3.25, 2.1, 3.25]));
  g.add(mesh(GEO.sphere, plastic(tint, { glow: 0.12 }), [0, 4.45, 0], [0.42, 0.3, 0.42]));
  g.add(mesh(GEO.sphere, plastic('#bfe6d2'), [0.18, 4.68, 0.05], [0.22, 0.08, 0.12]));
  // 아치 문
  const door = new THREE.Group(); door.position.set(0, 0, 2.66); g.add(door);
  door.add(mesh(roundBox(), plastic(tint, { rough: 0.6 }), [0, 0.8, 0], [1.1, 1.6, 0.14]));
  const arch = mesh(GEO.cyl, plastic(tint, { rough: 0.6 }), [0, 1.6, 0], [0.55, 0.14, 0.55]); arch.rotation.x = Math.PI / 2; door.add(arch);
  door.add(mesh(GEO.sphereLo, plastic('#ffcf4a', { metal: 0.5 }), [0.32, 0.85, 0.1], 0.07, false));
  // 둥근 창 2(불빛)
  for (const s of [-1, 1]) {
    const a = s * 0.75;
    const w = new THREE.Group(); w.position.set(Math.sin(a) * 2.68, 1.55, Math.cos(a) * 2.68); w.rotation.y = a; g.add(w);
    w.add(mesh(GEO.torus, plastic('#e9d3a8'), [0, 0, 0], [0.42, 0.42, 0.42], false));
    const pane = mesh(GEO.cyl, plastic('#fff2a8', { glow: 0.9 }), [0, 0, -0.02], [0.4, 0.05, 0.4], false); pane.rotation.x = Math.PI / 2; w.add(pane);
  }
  return g;
}

/** 절구 + 공이(방아 찧기) — userData.mallet 을 흔든다 */
export function makeMortar() {
  const g = new THREE.Group();
  g.name = 'moon-mortar';
  const bowl = new THREE.LatheGeometry([
    new THREE.Vector2(0.001, 0), new THREE.Vector2(0.42, 0), new THREE.Vector2(0.48, 0.1), new THREE.Vector2(0.4, 0.38), new THREE.Vector2(0.5, 0.62),
    new THREE.Vector2(0.46, 0.66), new THREE.Vector2(0.34, 0.5), new THREE.Vector2(0.001, 0.46),
  ], 32);
  bowl.computeVertexNormals();
  g.add(mesh(bowl, plastic('#c9a27a', { rough: 0.75 }), [0, 0, 0]));
  g.add(mesh(GEO.sphere, plastic('#fffaf2', { glow: 0.1 }), [0, 0.5, 0], [0.32, 0.12, 0.32], false)); // 떡
  const mallet = new THREE.Group(); mallet.position.set(0.55, 0.15, 0); g.add(mallet);
  mallet.add(mesh(GEO.cyl, plastic('#e9d3a8', { rough: 0.7 }), [-0.28, 0.55, 0], [0.05, 1.1, 0.05]));
  const head = mesh(GEO.cyl, plastic('#c9a27a', { rough: 0.7 }), [-0.28, 1.1, 0], [0.16, 0.5, 0.16]);
  head.rotation.z = Math.PI / 2;
  mallet.add(head);
  g.userData.mallet = mallet;
  return g;
}

/** 떡순이네 떡 가게 매대: 분홍 줄무늬 차양 + 떡 접시 */
export function makeMochiStall() {
  const g = new THREE.Group();
  g.name = 'moon-mochi-stall';
  g.add(mesh(roundBox(), plastic('#fff1cf', { rough: 0.7 }), [0, 0.5, 0], [2.6, 1.0, 1.0]));
  g.add(mesh(roundBox(), plastic('#ffd0de', { rough: 0.6 }), [0, 1.04, 0], [2.8, 0.14, 1.2]));
  for (let i = 0; i < 5; i++) {
    const c = ['#fffaf2', '#ffd0de', '#bfe6d2', '#fff2a8', '#c9b6f2'][i];
    g.add(mesh(GEO.sphere, plastic(c, { glow: 0.1 }), [-0.9 + i * 0.45, 1.2, 0.05], [0.17, 0.12, 0.17]));
  }
  for (const s of [-1, 1]) g.add(mesh(GEO.cyl, plastic('#fffaf2'), [s * 1.3, 1.6, -0.45], [0.06, 2.2, 0.06]));
  // 줄무늬 차양(분홍·흰 줄이 번갈아 비스듬히) + 둥근 술 장식
  for (let i = 0; i < 6; i++) {
    const seg = mesh(roundBox(), plastic(i % 2 ? '#fffaf2' : '#ff9fb8', { rough: 0.6 }), [-1.25 + i * 0.5, 2.55, 0.05], [0.52, 0.1, 1.5]);
    seg.rotation.x = 0.32;
    g.add(seg);
    g.add(mesh(GEO.sphereLo, plastic(i % 2 ? '#ff9fb8' : '#fffaf2'), [-1.25 + i * 0.5, 2.28, 0.78], 0.09, false));
  }
  const sign = signBoard('떡순이네 떡집', '갓 찧은 달떡', '#ff9fb8', 2.2, 0.9);
  sign.position.set(0, 1.4, -0.55);
  g.add(sign);
  return g;
}

// ───────────── 우주상자 ─────────────
/** 우주상자: 라벤더 둥근 상자 + 금 테 + 별 문장 + 둥근 뚜껑(userData.lid) + 작은 안테나 */
export function makeSpaceChest() {
  const g = new THREE.Group();
  g.name = 'moon-space-chest';
  g.add(mesh(roundBox(), plastic('#c9b6f2', { glow: 0.15 }), [0, 0.32, 0], [1.0, 0.62, 0.72]));
  const gold = plastic('#ffcf4a', { metal: 0.6, rough: 0.3, glow: 0.2 });
  for (const x of [-0.42, 0.42]) g.add(mesh(roundBox(), gold, [x, 0.32, 0], [0.12, 0.66, 0.76]));
  const lid = new THREE.Group(); lid.position.set(0, 0.62, -0.36); g.add(lid);
  const dome = mesh(GEO.half, plastic('#a77be0', { glow: 0.15 }), [0, 0, 0.36], [0.5, 0.28, 0.37]); dome.scale.x = 0.52; lid.add(dome);
  lid.add(mesh(GEO.star, gold, [0, 0.05, 0.74], 0.12));
  lid.add(mesh(GEO.cyl, gold, [0, 0.36, 0.36], [0.02, 0.22, 0.02], false));
  lid.add(mesh(GEO.sphereLo, plastic('#ff9fb8', { glow: 1.2 }), [0, 0.5, 0.36], 0.06, false));
  g.add(mesh(GEO.star, gold, [0, 0.36, 0.37], 0.14));
  g.userData.lid = lid;
  return g;
}

// ───────────── UFO 잔해 ─────────────
export function makeUfoWreck() {
  const g = new THREE.Group();
  g.name = 'moon-ufo-wreck';
  const tilt = new THREE.Group(); tilt.rotation.set(0.32, 0.4, -0.22); tilt.position.y = 0.9; g.add(tilt);
  tilt.add(mesh(GEO.sphere, plastic('#dfe6ee', { metal: 0.45, rough: 0.3 }), [0, 0, 0], [4.2, 0.9, 4.2]));
  const ring = mesh(GEO.torus, plastic('#ff9fb8', { glow: 0.3 }), [0, 0, 0], [4.0, 4.0, 2.2]); ring.rotation.x = Math.PI / 2; tilt.add(ring);
  // 깨진 돔(반투명, 한쪽이 없다)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.8, 32, 16, 0.6, Math.PI * 1.5, 0, Math.PI / 2), plastic('#c8e8ff', { alpha: 0.4, glow: 0.2, rough: 0.05 }));
  dome.position.y = 0.6; tilt.add(dome);
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const l = mesh(GEO.sphereLo, new THREE.MeshStandardMaterial({ color: '#fff2a8', emissive: i % 3 ? '#ff9fb8' : '#9ef0d2', emissiveIntensity: 1.3 }), [Math.cos(a) * 3.9, -0.1, Math.sin(a) * 3.9], 0.2, false);
    tilt.add(l); lights.push(l);
  }
  // 떨어져 나온 조각과 안테나
  g.add(mesh(GEO.sphere, plastic('#dfe6ee', { metal: 0.45 }), [5.2, 0.2, 2.4], [0.9, 0.2, 0.7]));
  const ant = mesh(GEO.cyl, plastic('#c9b6f2'), [-3.6, 1.2, -2.8], [0.06, 2.2, 0.06]); ant.rotation.z = 0.6; g.add(ant);
  g.add(mesh(GEO.sphereLo, plastic('#c8ff5a', { glow: 1 }), [-4.5, 1.9, -2.8], 0.18, false));
  // 동글동글 연기
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) { const pf = mesh(GEO.sphereLo, plastic('#f2eef8', { alpha: 0.75, rough: 1 }), [1.2, 1.8 + i * 0.6, 0.6], 0.5, false); g.add(pf); puffs.push(pf); }
  g.userData.lights = lights;
  g.userData.puffs = puffs;
  return g;
}

// ───────────── 별공룡 둥지 ─────────────
export function makeNest() {
  const g = new THREE.Group();
  g.name = 'moon-starsaurus-nest';
  const ring = mesh(GEO.torus, plastic('#d9c3a5', { rough: 0.9 }), [0, 0.4, 0], [3.4, 3.4, 4.2]); ring.rotation.x = Math.PI / 2; g.add(ring);
  // 결정 조각 + 반짝 알 3(P1 — 지금은 구경만)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const c = mesh(GEO.sphereLo, plastic(['#c8e8ff', '#ffd0de', '#fff2a8'][i % 3], { glow: 0.5, rough: 0.1 }), [Math.cos(a) * 3.6, 0.9, Math.sin(a) * 3.6], [0.18, 0.4, 0.18], false);
    c.rotation.z = Math.cos(a) * 0.5; g.add(c);
  }
  const eggs: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.4;
    const e = mesh(GEO.sphere, plastic(['#c8e8ff', '#fff2a8', '#ffd0de'][i], { glow: 0.25 }), [Math.cos(a) * 0.9, 0.55, Math.sin(a) * 0.9], [0.42, 0.55, 0.42]);
    g.add(e);
    for (let k = 0; k < 4; k++) g.add(mesh(GEO.star, plastic('#ffcf4a', { glow: 0.5, metal: 0.4 }), [Math.cos(a) * 0.9 + Math.cos(k * 1.6) * 0.3, 0.6 + Math.sin(k * 2.1) * 0.25, Math.sin(a) * 0.9 + Math.sin(k * 1.6) * 0.3], 0.07, false));
    eggs.push(e);
  }
  g.userData.eggs = eggs;
  return g;
}

// ───────────── 월석(두드리면 m_moonrock) ─────────────
let moonrockGeoC: THREE.BufferGeometry | null = null;
function moonrockGeo() {
  if (moonrockGeoC) return moonrockGeoC;
  const g = new THREE.SphereGeometry(1, 28, 18);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let k = 1 + 0.08 * Math.sin(x * 4 + z * 3) + 0.05 * Math.cos(y * 6);
    // 작은 오목 구멍(월석 무늬)
    for (const [cx, cy, cz] of [[0.5, 0.6, 0.6], [-0.6, 0.5, 0.3], [0.1, 0.7, -0.7]]) { const d = Math.hypot(x - cx, y - cy, z - cz); if (d < 0.35) k -= 0.12 * (1 - d / 0.35); }
    p.setXYZ(i, x * k, Math.max(y, -0.3) * k * 0.8, z * k);
  }
  g.computeVertexNormals();
  return (moonrockGeoC = sh(g));
}
export function makeMoonrock() {
  const g = new THREE.Group();
  g.name = 'moon-moonrock';
  const r = mesh(moonrockGeo(), plastic('#ddd6e6', { rough: 0.8, glow: 0.05 }), [0, 0.15, 0], [1.1, 1.0, 1.0]);
  g.add(r);
  // 반짝 결 3
  for (let i = 0; i < 3; i++) g.add(mesh(GEO.sphereLo, plastic(['#fff2a8', '#c8e8ff', '#ffd0de'][i], { glow: 1.1 }), [Math.cos(i * 2.1) * 0.75, 0.55 + i * 0.1, Math.sin(i * 2.1) * 0.75], 0.09, false));
  g.userData.rock = r;
  return g;
}

/** 우유빛 연못 물(원판 + 하얀 물가 테) */
export function makePondWater(r: number) {
  const g = new THREE.Group();
  g.name = 'moon-pond';
  const water = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshPhysicalMaterial({
    color: '#fbf6ff', roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.93, emissive: '#efe4ff', emissiveIntensity: 0.35, depthWrite: true,
  }));
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = true;
  g.add(water);
  const shine = new THREE.Mesh(new THREE.RingGeometry(r * 0.35, r * 0.42, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
  shine.rotation.x = -Math.PI / 2; shine.position.y = 0.02;
  g.add(shine);
  g.userData.shine = shine;
  return g;
}

/** 지구 전망대: 둥근 벤치 + 사진 액자 + 표지판 */
export function makeViewSpot() {
  const g = new THREE.Group();
  g.name = 'moon-earth-view';
  const bench = new THREE.Group(); g.add(bench);
  bench.add(mesh(roundBox(), plastic('#ffd0de', { rough: 0.6 }), [0, 0.5, 0], [2.0, 0.18, 0.6]));
  bench.add(mesh(roundBox(), plastic('#ffd0de', { rough: 0.6 }), [0, 0.95, -0.28], [2.0, 0.6, 0.14]));
  for (const s of [-1, 1]) bench.add(mesh(GEO.cyl, plastic('#fffaf2'), [s * 0.8, 0.22, 0], [0.08, 0.44, 0.08]));
  // 액자(가운데가 뚫린 둥근 틀) — 그 너머로 지구가 보인다
  const frame = mesh(GEO.torus, plastic('#ffcf4a', { metal: 0.4, glow: 0.2 }), [0, 2.4, 2.4], [0.9, 0.9, 1.4]);
  g.add(frame);
  g.add(mesh(GEO.cyl, plastic('#fffaf2'), [0, 0.8, 2.4], [0.07, 1.6, 0.07]));
  // 표지판은 올라오는 사람 쪽(지구 반대편)을 본다
  const sign = signBoard('지구 전망대', '📷 사진 명소', '#8fd3f4', 2.2, 0.9);
  sign.position.set(-2.4, 0, -0.8); sign.rotation.y = Math.PI - 0.5;
  g.add(sign);
  return g;
}
