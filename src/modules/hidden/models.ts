// hidden 바깥 모델(코드로만, 둥글둥글 파스텔): 대왕조개 · 해적 동굴 입구 · 썰물 표지판 · 모래폭풍 신전 · 지하수 동굴 구멍 ·
// 완전한 티라노 골격 · 크레이터 운석 · 활공 출발대 · 피라미드 퍼즐 문 표시 · 보물상자 · 황금풍뎅이 · 조개 줍기.
// 모델마다 정점색 부품을 Bake 로 합쳐 메시 몇 개(그리기 몇 번)로 끝낸다. 생물 얼굴은 core/art(GDD 7.2).
import * as THREE from 'three';
import { addEyes, blobShadow } from '../../core/art';
import { Bake, sph, ell, cyl, cap, rbox, tor, cone, dome, lump, vgrad, stripes, matBase, matShiny, matGlow, matSoft, matFade, mesh, labelTexture, type Geo } from './kit';

const TAU = Math.PI * 2;
const C = {
  sand: '#f3d9a4', sandDeep: '#e3bf7f', wood: '#c98f5a', woodDark: '#9a6640', rope: '#e8cf9a',
  rock: '#b9a3c9', rockDark: '#8f7aa8', stone: '#ecd2a0', stoneDark: '#d3b07a', gold: '#ffd36b', goldDeep: '#f2b33d',
  bone: '#f6ead2', boneShade: '#e6d3b0', teal: '#6fd6e8', tealDeep: '#3fb4cf', pink: '#ffb3cf', lilac: '#c9a8f0', cream: '#fff6e4',
  navy: '#4a4370', red: '#ff8f8f', mint: '#9fe8c8',
};

/** 이 모델이 깔아 달라는 정적 충돌체(모델 로컬 좌표, 회전 없음 → 바깥에서 모델 회전을 곱한다) */
export interface ColBox { hx: number; hy: number; hz: number; x: number; y: number; z: number }

// ───────────── 대왕조개(석호 바닥) ─────────────
/** 부채꼴 골이 진 반구 껍데기(위가 볼록) */
function shellGeo(rx: number, ry: number, rz: number, ribs = 11): Geo {
  const g = new THREE.SphereGeometry(1, 44, 14, 0, TAU, 0, Math.PI / 2);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const k = 1 + 0.07 * Math.max(0, Math.cos(a * ribs)) * (1 - v.y);
    p.setXYZ(i, v.x * rx * k, v.y * ry, v.z * rz * k);
  }
  g.computeVertexNormals();
  return g;
}
export interface ClamModel { root: THREE.Group; lid: THREE.Group; pearl: THREE.Mesh }
export function buildClam(): ClamModel {
  const root = new THREE.Group();
  const shellCol = vgrad('#c9a8f0', '#ffc4dc', 0, 0.8);
  const b = new Bake()
    .add(shellGeo(1.6, 0.62, 1.3), shellCol, { r: [Math.PI, 0, 0] })
    .add(tor(1.42, 0.12, 10, 48), '#ffd9ea', { r: [Math.PI / 2, 0, 0], s: [1.12, 0.92, 1], p: [0, 0.02, 0] })
    .add(ell(1.25, 0.12, 1.0), '#ff9fc0', { p: [0, 0.05, 0] }) // 분홍 속살
    .add(ell(0.5, 0.3, 0.5), C.sandDeep, { p: [0, -0.62, 0], s: [2.2, 0.6, 2] });
  root.add(mesh(b.build(), matBase()));
  // 뚜껑: 뒤쪽(−z) 경첩을 축으로 열린다
  const lid = new THREE.Group();
  lid.position.set(0, 0.06, -1.2);
  const lb = new Bake().add(shellGeo(1.62, 0.7, 1.32), shellCol, { p: [0, 0, 1.2] })
    .add(tor(1.42, 0.1, 10, 48), '#ffd9ea', { r: [Math.PI / 2, 0, 0], s: [1.12, 0.92, 1], p: [0, 0, 1.2] });
  lid.add(mesh(lb.build(), matBase()));
  root.add(lid);
  const pearl = mesh(sph(0.32, 28, 20), matGlow(), { cast: false, name: 'hidden-pearl' });
  (pearl.geometry as Geo).setAttribute('color', new THREE.BufferAttribute(new Float32Array(pearl.geometry.attributes.position.count * 3).fill(0.98), 3));
  pearl.position.set(0, 0.36, 0.1);
  root.add(pearl);
  // 아랫껍데기 앞쪽 얼굴(눈 + 볼터치)
  const face = new THREE.Group();
  face.position.set(0, -0.2, 1.32);
  addEyes(face, { size: 0.24, y: 0, z: 0.02, gap: 0.62 });
  root.add(face);
  root.add(blobShadow(2.2));
  return { root, lid, pearl };
}

// ───────────── 해적 동굴 입구(산호빛섬 해안) ─────────────
function jollyFlagTex(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d'); if (!g) return null;
  g.fillStyle = '#4a4370'; g.fillRect(0, 0, 256, 160);
  // 웃는 해골(동그란 얼굴 + 뼈 두 개)
  g.strokeStyle = '#fff6e4'; g.lineWidth = 14; g.lineCap = 'round';
  g.beginPath(); g.moveTo(70, 120); g.lineTo(186, 40); g.moveTo(70, 40); g.lineTo(186, 120); g.stroke();
  g.fillStyle = '#fff6e4'; g.beginPath(); g.arc(128, 78, 40, 0, TAU); g.fill();
  g.fillStyle = '#4a4370'; g.beginPath(); g.ellipse(112, 74, 7, 10, 0, 0, TAU); g.ellipse(144, 74, 7, 10, 0, 0, TAU); g.fill();
  g.fillStyle = '#ff9fb8'; g.beginPath(); g.arc(100, 92, 7, 0, TAU); g.arc(156, 92, 7, 0, TAU); g.fill();
  g.strokeStyle = '#4a4370'; g.lineWidth = 4; g.beginPath(); g.arc(128, 90, 12, 0.2, Math.PI - 0.2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.shared = true; return t;
}
let flagTex: THREE.Texture | null | undefined;
export function buildPirateMouth(rnd: () => number): { root: THREE.Group; cols: ColBox[]; flag: THREE.Mesh } {
  const root = new THREE.Group();
  const b = new Bake();
  // 바위 언덕(입구가 +z)
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.05 + (i / 8) * 0.9), r = 3.6 + rnd() * 0.8;
    b.add(lump(1.7 + rnd() * 0.8, rnd), vgrad(C.rockDark, C.rock, -1, 1.5), { p: [Math.cos(a) * r, 0.9 + rnd() * 0.6, -Math.sin(a) * 1.8 - 1.0], s: [1, 0.9, 1] });
  }
  b.add(lump(3.6, rnd, 0.15), vgrad(C.rockDark, C.rock, -2, 3), { p: [0, 1.4, -2.6], s: [1.3, 0.85, 1] });
  // 입구 아치 바위
  b.add(tor(2.2, 0.75, 12, 36, Math.PI), vgrad(C.rockDark, '#d4c0e0', 0, 3), { p: [0, 0.2, 0.4] });
  // 나무 문틀 + 걸린 등불 고리
  b.add(cap(0.13, 2.6), C.woodDark, { p: [-1.6, 1.3, 0.9] }).add(cap(0.13, 2.6), C.woodDark, { p: [1.6, 1.3, 0.9] })
    .add(cap(0.12, 3.0), C.wood, { p: [0, 2.75, 0.9], r: [0, 0, Math.PI / 2] });
  // 통 두 개
  for (const [x, z] of [[2.7, 1.6], [3.4, 0.7]] as const) {
    b.add(cyl(0.45, 0.45, 0.95, 20), stripes(C.wood, C.woodDark, 0.32), { p: [x, 0.47, z] })
      .add(ell(0.42, 0.25, 0.42), C.woodDark, { p: [x, 0.95, z], s: [1, 0.3, 1] });
  }
  // 모래 바닥 자국 + 깃대
  b.add(ell(3.2, 0.12, 2.2), C.sandDeep, { p: [0, 0.02, 1.8] })
    .add(cyl(0.08, 0.1, 4.6, 12), C.woodDark, { p: [-3.0, 2.3, 1.4] })
    .add(sph(0.16), C.gold, { p: [-3.0, 4.65, 1.4] });
  root.add(mesh(b.build(), matBase()));
  // 어두운 입구 속
  const hole = new Bake().add(new THREE.CircleGeometry(1.5, 32, 0, Math.PI), '#3f3560', { p: [0, 0.2, 0.55] })
    .add(new THREE.PlaneGeometry(3.0, 0.25), '#3f3560', { p: [0, 0.1, 0.55] });
  root.add(mesh(hole.build(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), { cast: false }));
  // 등불(빛)
  const lamp = new Bake().add(sph(0.22, 18, 12), '#ffe7a0', { p: [1.6, 2.2, 1.05] }).add(sph(0.22, 18, 12), '#ffe7a0', { p: [-1.6, 2.2, 1.05] });
  root.add(mesh(lamp.build(), matGlow(), { cast: false }));
  // 깃발
  if (flagTex === undefined) flagTex = jollyFlagTex();
  const fg = new THREE.PlaneGeometry(1.6, 1.0, 8, 2);
  const flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: flagTex ?? null, color: flagTex ? '#ffffff' : C.navy, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(-2.2, 4.1, 1.4);
  flag.castShadow = true;
  root.add(flag);
  return { root, cols: [{ hx: 4.2, hy: 1.6, hz: 2.0, x: 0, y: 1.6, z: -2.4 }, { hx: 0.8, hy: 1.4, hz: 0.8, x: -3.3, y: 1.4, z: 0.0 }, { hx: 0.8, hy: 1.4, hz: 0.8, x: 3.3, y: 1.4, z: 0.0 }], flag };
}

// ───────────── 썰물 표지판(모래톱 시작) ─────────────
export function buildTideSign(): THREE.Group {
  const root = new THREE.Group();
  const b = new Bake()
    .add(cyl(0.09, 0.11, 2.0, 12), C.woodDark, { p: [0, 1.0, 0] })
    .add(rbox(1.9, 0.95, 0.12, 0.1), C.wood, { p: [0, 1.75, 0] })
    // 물높이 장대(파랑·흰 줄)
    .add(cyl(0.07, 0.07, 2.6, 12), stripes('#7fc8f0', '#ffffff', 0.25), { p: [1.4, 1.3, 0.2] })
    .add(sph(0.14), C.red, { p: [1.4, 2.65, 0.2] })
    // 조개·불가사리 장식
    .add(ell(0.22, 0.08, 0.2), C.pink, { p: [-0.6, 0.06, 0.5] })
    .add(cone(0.16, 0.08, 5), '#ffb38a', { p: [0.5, 0.05, 0.6] });
  root.add(mesh(b.build(), matBase()));
  const tex = labelTexture(['🏝️ 썰물 길', '아침 5~9시만!'], { w: 512, h: 256, size: 60 });
  if (tex) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    board.position.set(0, 1.75, 0.065);
    root.add(board);
  }
  return root;
}

// ───────────── 모래폭풍 신전 ─────────────
export interface TempleModel { root: THREE.Group; fade: THREE.MeshStandardMaterial; orb: THREE.Mesh; cols: ColBox[] }
export function buildTemple(): TempleModel {
  const root = new THREE.Group();
  const b = new Bake();
  // 3단 기단
  for (let i = 0; i < 3; i++) b.add(rbox(16 - i * 2, 0.7, 12 - i * 2, 0.25), i % 2 ? C.stone : C.stoneDark, { p: [0, 0.35 + i * 0.7, 0] });
  // 기둥 6개(둥근 기둥 + 머리)
  for (let i = 0; i < 6; i++) {
    const x = -5 + (i % 3) * 5, z = i < 3 ? 3.2 : -3.2;
    b.add(cyl(0.62, 0.7, 6.2, 24), vgrad('#e7c58c', '#fbe6bd', 0, 6), { p: [x, 2.1 + 3.1, z] })
      .add(rbox(1.7, 0.45, 1.7, 0.15), C.stoneDark, { p: [x, 8.45, z] })
      .add(rbox(1.6, 0.35, 1.6, 0.12), C.stoneDark, { p: [x, 2.25, z] });
  }
  // 지붕(둥근 판 + 삼각 박공)
  b.add(rbox(13.5, 0.8, 9.4, 0.3), C.stone, { p: [0, 9.05, 0] });
  const ped = new THREE.Shape(); ped.moveTo(-6.6, 0); ped.lineTo(6.6, 0); ped.lineTo(0, 2.6); ped.lineTo(-6.6, 0);
  b.add(new THREE.ExtrudeGeometry(ped, { depth: 8.6, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 3 }), C.stoneDark, { p: [0, 9.4, -4.3] });
  // 해님 원판(웃는 얼굴은 빛 메시로)
  b.add(cyl(1.25, 1.25, 0.25, 32), C.gold, { p: [0, 10.55, 4.55], r: [Math.PI / 2, 0, 0] });
  // 제단(앞 계단 아래)
  b.add(rbox(1.8, 1.0, 1.2, 0.2), C.stoneDark, { p: [0, 0.5, 8.2] })
    .add(cyl(0.5, 0.65, 0.3, 24), C.gold, { p: [0, 1.15, 8.2] });
  // 반쯤 묻힌 모래 둔덕
  b.add(ell(9.5, 1.0, 7.5), C.sand, { p: [0, -0.4, 0] });
  const fade = matFade();
  root.add(mesh(b.build(), fade, { name: 'hidden-temple-body' }));
  const glow = new Bake()
    .add(sph(0.16, 12, 10), C.navy, { p: [-0.42, 10.7, 4.72] }).add(sph(0.16, 12, 10), C.navy, { p: [0.42, 10.7, 4.72] })
    .add(tor(0.36, 0.06, 8, 20, Math.PI), C.navy, { p: [0, 10.42, 4.72], r: [0, 0, Math.PI] })
    .add(sph(0.14, 10, 8), '#ff9fb8', { p: [-0.75, 10.4, 4.7] }).add(sph(0.14, 10, 8), '#ff9fb8', { p: [0.75, 10.4, 4.7] });
  const face = mesh(glow.build(), matGlow(), { cast: false });
  face.name = 'hidden-temple-face';
  root.add(face);
  const og = sph(0.42, 24, 16);
  og.setAttribute('color', new THREE.BufferAttribute(new Float32Array(og.attributes.position.count * 3).map((_, i) => [1, 0.86, 0.5][i % 3]), 3));
  const orb = mesh(og, matGlow(), { cast: false, name: 'hidden-temple-orb' });
  orb.position.set(0, 1.75, 8.2);
  root.add(orb);
  const cols: ColBox[] = [{ hx: 7.5, hy: 1.05, hz: 5.5, x: 0, y: 1.05, z: 0 }, { hx: 0.9, hy: 0.5, hz: 0.6, x: 0, y: 0.5, z: 8.2 }];
  for (let i = 0; i < 6; i++) cols.push({ hx: 0.7, hy: 3.1, hz: 0.7, x: -5 + (i % 3) * 5, y: 5.2, z: i < 3 ? 3.2 : -3.2 });
  return { root, fade, orb, cols };
}

// ───────────── 협곡 지하수 동굴 구멍 ─────────────
export function buildWaterHole(rnd: () => number): THREE.Group {
  const root = new THREE.Group();
  const b = new Bake();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    b.add(lump(0.55 + rnd() * 0.25, rnd, 0.2, 12, 8), vgrad('#d99a6a', '#f2c08a', -0.4, 0.5), { p: [Math.cos(a) * 2.1, 0.2, Math.sin(a) * 2.1] });
  }
  // 밧줄 사다리(구멍 안으로)
  for (let i = 0; i < 5; i++) b.add(cap(0.05, 0.9), C.rope, { p: [0, 0.2 - i * 0.45, -1.35], r: [0, 0, Math.PI / 2] });
  b.add(cyl(0.04, 0.04, 2.6, 8), C.rope, { p: [-0.45, -0.6, -1.4] }).add(cyl(0.04, 0.04, 2.6, 8), C.rope, { p: [0.45, -0.6, -1.4] })
    .add(cyl(0.08, 0.08, 1.6, 10), C.woodDark, { p: [0, 0.35, -1.85], r: [0, 0, Math.PI / 2] });
  // 물방울 표지
  b.add(cyl(0.06, 0.07, 1.5, 10), C.woodDark, { p: [2.8, 0.75, 0.6] }).add(rbox(0.8, 0.6, 0.1, 0.08), C.wood, { p: [2.8, 1.55, 0.6] });
  root.add(mesh(b.build(), matBase()));
  const hole = new Bake().add(new THREE.CircleGeometry(1.75, 36), '#2f6f8a', { r: [-Math.PI / 2, 0, 0], p: [0, 0.05, 0] });
  root.add(mesh(hole.build(), new THREE.MeshBasicMaterial({ vertexColors: true }), { cast: false }));
  const g = new Bake().add(sph(0.16, 12, 10), C.teal, { p: [2.8, 1.58, 0.68], s: [1, 1.3, 0.5] });
  for (let i = 0; i < 5; i++) g.add(sph(0.08, 8, 6), '#bff4ff', { p: [Math.cos(i * 1.3) * 0.9, 0.12, Math.sin(i * 1.3) * 0.9] });
  root.add(mesh(g.build(), matGlow(), { cast: false }));
  return root;
}

// ───────────── 완전한 티라노 골격(화석 절벽 꼭대기) ─────────────
export function buildTrexSkeleton(): { root: THREE.Group; cols: ColBox[] } {
  const root = new THREE.Group();
  const b = new Bake();
  const bone = vgrad(C.boneShade, C.bone, -0.3, 0.3);
  // 받침대
  b.add(rbox(9.5, 0.6, 3.4, 0.25), C.stoneDark, { p: [0, 0.3, 0] }).add(rbox(9.0, 0.2, 3.0, 0.1), C.stone, { p: [0, 0.68, 0] });
  // 등뼈(머리 +x 쪽 → 꼬리 −x)
  const spine = (u: number) => ({ x: 2.6 - u * 7.2, y: 3.0 + Math.sin(u * Math.PI * 0.9) * 0.4 - u * u * 1.6 });
  for (let i = 0; i <= 22; i++) {
    const u = i / 22, p = spine(u), r = 0.26 * (1 - u * 0.75);
    b.add(sph(r, 14, 10), bone, { p: [p.x, p.y, 0] });
    if (i % 2 === 0 && u < 0.7) b.add(cone(r * 0.6, r * 1.6, 8), bone, { p: [p.x, p.y + r * 1.4, 0] });
  }
  // 갈비뼈
  for (let i = 0; i < 6; i++) {
    const p = spine(0.08 + i * 0.06), R = 0.95 - i * 0.08;
    b.add(tor(R, 0.07, 8, 24, Math.PI * 1.25), bone, { p: [p.x, p.y - R * 0.4, 0], r: [0, Math.PI / 2, -1.125 * Math.PI] });
  }
  // 골반·다리(통통한 뼈)
  const hip = spine(0.32);
  b.add(ell(0.6, 0.4, 0.5), bone, { p: [hip.x, hip.y - 0.1, 0] });
  for (const s of [-1, 1]) {
    b.add(cap(0.16, 1.1), bone, { p: [hip.x + 0.2, hip.y - 0.95, s * 0.45], r: [0, 0, -0.35] })
      .add(sph(0.18, 12, 10), bone, { p: [hip.x + 0.42, hip.y - 1.6, s * 0.45] })
      .add(cap(0.13, 1.0), bone, { p: [hip.x + 0.1, hip.y - 2.15, s * 0.45], r: [0, 0, 0.45] })
      .add(ell(0.36, 0.12, 0.22), bone, { p: [hip.x + 0.05, 0.82, s * 0.45] });
    // 짧은 팔(귀여움 포인트)
    b.add(cap(0.06, 0.35), bone, { p: [2.2, 2.35, s * 0.42], r: [0, 0, 0.8] }).add(sph(0.08, 10, 8), bone, { p: [2.42, 2.12, s * 0.42] });
  }
  // 머리뼈(동글 큰 머리) + 아래턱(웃는 입)
  b.add(ell(0.95, 0.75, 0.72), bone, { p: [3.55, 3.55, 0] })
    .add(ell(0.75, 0.42, 0.6), bone, { p: [4.25, 3.3, 0] })
    .add(ell(0.7, 0.2, 0.5), bone, { p: [4.0, 2.78, 0], r: [0, 0, -0.12] });
  for (let i = 0; i < 5; i++) b.add(cone(0.06, 0.16, 6), '#fffaf0', { p: [3.7 + i * 0.22, 2.98, 0.38], r: [Math.PI, 0, 0] });
  // 작은 이름표
  b.add(cyl(0.05, 0.06, 0.9, 8), C.woodDark, { p: [-1.5, 1.1, 1.6] }).add(rbox(1.1, 0.55, 0.08, 0.06), C.wood, { p: [-1.5, 1.6, 1.62] });
  root.add(mesh(b.build(), matBase()));
  // 얼굴(동그란 눈구멍 대신 귀여운 눈 + 볼터치)
  const face = new THREE.Group();
  face.position.set(3.7, 3.7, 0);
  face.rotation.y = Math.PI / 2;
  addEyes(face, { size: 0.36, head: { r: 0.78 }, lift: 0.18 });
  root.add(face);
  root.add(blobShadow(4.5));
  return { root, cols: [{ hx: 4.75, hy: 0.35, hz: 1.7, x: 0, y: 0.35, z: 0 }] };
}

// ───────────── 크레이터 운석(호수 한가운데) ─────────────
export function buildMeteorite(rnd: () => number): { root: THREE.Group; cracks: THREE.Mesh; cols: ColBox[] } {
  const root = new THREE.Group();
  const b = new Bake();
  b.add(lump(4.6, rnd, 0.16, 28, 20), vgrad('#6f5f9e', '#a596d0', -3, 4), { p: [0, 1.4, 0], s: [1, 0.85, 1] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rnd() * 0.5;
    b.add(lump(1.6 + rnd() * 0.6, rnd, 0.25, 12, 8), vgrad('#5f5190', '#9a8bc8', -1, 1.5), { p: [Math.cos(a) * 4.2, -0.4, Math.sin(a) * 4.2] });
  }
  // 입구 테(남쪽 +z)
  b.add(tor(1.35, 0.42, 10, 28, Math.PI), '#8f80c0', { p: [0, 0.6, 4.0] });
  root.add(mesh(b.build(), matBase()));
  const hole = new Bake().add(new THREE.CircleGeometry(1.2, 28, 0, Math.PI), '#2e2552', { p: [0, 0.6, 4.05] }).add(new THREE.PlaneGeometry(2.4, 0.6), '#2e2552', { p: [0, 0.3, 4.05] });
  root.add(mesh(hole.build(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), { cast: false }));
  // 빛나는 금 + 수정
  const g = new Bake();
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, el = 0.2 + rnd() * 0.9;
    const n = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el) * 0.85, Math.sin(a) * Math.cos(el)).normalize();
    g.add(cap(0.07, 1.2 + rnd()), rnd() < 0.5 ? '#e7c8ff' : '#9ff0ff', { p: [n.x * 4.55, 1.4 + n.y * 3.9, n.z * 4.55], r: [rnd() * 3, rnd() * 3, rnd() * 3] });
  }
  for (let i = 0; i < 5; i++) g.add(cone(0.32, 1.3, 6), i % 2 ? '#e6c8ff' : '#b8f6ff', { p: [(rnd() - 0.5) * 3, 4.9 + rnd() * 0.4, (rnd() - 0.5) * 3], r: [(rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6] });
  const cracks = mesh(g.build(), matGlow(), { cast: false, name: 'hidden-meteor-glow' });
  root.add(cracks);
  return { root, cracks, cols: [{ hx: 3.6, hy: 3.2, hz: 3.4, x: 0, y: 1.4, z: -0.4 }] };
}

// ───────────── 활공 출발대(메사 절벽) ─────────────
export interface GlideModel { root: THREE.Group; swirl: THREE.Mesh; sock: THREE.Group; cols: ColBox[] }
/** 앞(+z)이 절벽 쪽. 바닥 판 꼭대기 = DECK_Y */
export const DECK_Y = 0.4, DECK_LEN = 9;
export function buildGlide(): GlideModel {
  const root = new THREE.Group();
  const b = new Bake();
  // 나무 판(널빤지 줄무늬) + 받침 기둥
  for (let i = 0; i < 9; i++) b.add(rbox(3.6, 0.16, 0.95, 0.05), i % 2 ? C.wood : '#d9a06a', { p: [0, DECK_Y - 0.08, i - 0.5] });
  for (const x of [-1.6, 1.6]) for (const z of [0, 3.5, 7.5]) b.add(cyl(0.12, 0.14, 6, 10), C.woodDark, { p: [x, DECK_Y - 3.1, z] });
  // 난간(양옆) + 앞 끝 분홍 화살표 깃발
  for (const x of [-1.75, 1.75]) {
    b.add(cyl(0.05, 0.05, DECK_LEN - 1, 8), C.woodDark, { p: [x, DECK_Y + 0.9, 3.5], r: [Math.PI / 2, 0, 0] });
    for (let z = -0.5; z <= 7.5; z += 2) b.add(cyl(0.06, 0.06, 0.9, 8), C.woodDark, { p: [x, DECK_Y + 0.45, z] });
  }
  b.add(cone(0.5, 0.9, 3), C.pink, { p: [0, DECK_Y + 0.05, 6.6], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.2] });
  // 바람개비 깃대
  b.add(cyl(0.07, 0.08, 4.2, 10), '#ffffff', { p: [-1.75, DECK_Y + 2.1, -0.4] });
  root.add(mesh(b.build(), matBase()));
  // 바람자루(바람에 흔들린다)
  const sock = new THREE.Group();
  sock.position.set(-1.75, DECK_Y + 4.0, -0.4);
  const sk = new Bake().add(cyl(0.32, 0.14, 1.6, 16, true), stripes('#ff8f8f', '#ffffff', 0.4), { r: [Math.PI / 2, 0, 0], p: [0, 0, 0.8] });
  sock.add(mesh(sk.build(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 })));
  root.add(sock);
  // 상승 기류 띠(절벽 앞 공중의 나선 리본 — 빙글빙글 돈다)
  const sw = new Bake();
  for (let k = 0; k < 3; k++) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 80; i++) { const u = i / 80, a = u * TAU * 2.2 + (k * TAU) / 3; pts.push(new THREE.Vector3(Math.cos(a) * (3.2 + u * 2), -22 + u * 40, Math.sin(a) * (3.2 + u * 2))); }
    sw.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.12, 6), k % 2 ? '#d8f4ff' : '#ffffff');
  }
  const swirl = mesh(sw.build(), matSoft(0.45), { cast: false, name: 'hidden-updraft' });
  root.add(swirl);
  return { root, swirl, sock, cols: [{ hx: 1.8, hy: 0.12, hz: DECK_LEN / 2, x: 0, y: DECK_Y - 0.12, z: DECK_LEN / 2 - 1 }] };
}

// ───────────── 피라미드 퍼즐 문 표시 ─────────────
/** 피라미드 옆면에 붙이는 퍼즐 문(돌 문틀 + 닫힌 돌문 + 빛 상형문자 + 표지판). 뒤(−z)가 피라미드 */
export function buildPyramidMark(): { root: THREE.Group; cols: ColBox[] } {
  const root = new THREE.Group();
  const b = new Bake()
    // 문틀(두 기둥 + 상인방 + 계단 턱)
    .add(rbox(1.0, 4.6, 1.4, 0.2), vgrad('#d3a663', '#f6d79a', 0, 4.6), { p: [-2.1, 2.3, 0.1] })
    .add(rbox(1.0, 4.6, 1.4, 0.2), vgrad('#d3a663', '#f6d79a', 0, 4.6), { p: [2.1, 2.3, 0.1] })
    .add(rbox(5.6, 1.0, 1.6, 0.25), '#e0b56e', { p: [0, 5.0, 0.1] })
    .add(rbox(5.0, 0.3, 2.4, 0.1), '#ecca8a', { p: [0, 0.15, 0.7] })
    // 닫힌 돌문(안쪽으로 살짝 들어감) + 풍뎅이 문장
    .add(rbox(3.2, 4.2, 0.4, 0.15), vgrad('#c99a5a', '#f2c97e', 0, 4.2), { p: [0, 2.2, -0.35] })
    .add(ell(0.6, 0.45, 0.1), '#5aaef0', { p: [0, 2.7, -0.12] })
    .add(ell(0.26, 0.2, 0.08), '#ffd36b', { p: [0, 3.3, -0.1] })
    // 표지판
    .add(cyl(0.07, 0.08, 1.6, 10), C.woodDark, { p: [3.4, 0.8, 1.6] })
    .add(rbox(1.4, 0.8, 0.1, 0.08), C.wood, { p: [3.4, 1.7, 1.6] });
  root.add(mesh(b.build(), matBase()));
  const g = new Bake();
  for (let i = 0; i < 9; i++) { const a = Math.PI * (i / 8); g.add(sph(0.12, 10, 8), i % 2 ? '#ffe7a0' : '#9ff0ff', { p: [Math.cos(a) * 2.6, 3.4 + Math.sin(a) * 2.4, 0.9] }); }
  for (const x of [-2.1, 2.1]) g.add(cone(0.18, 0.45, 12), '#ffcf6a', { p: [x, 4.75, 0.95] });
  root.add(mesh(g.build(), matGlow(), { cast: false }));
  const tex = labelTexture(['🔺 피라미드', '퍼즐 도전!'], { w: 512, h: 256, size: 64 });
  if (tex) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.66), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    board.position.set(3.4, 1.7, 1.66);
    root.add(board);
  }
  return { root, cols: [{ hx: 0.5, hy: 2.3, hz: 0.7, x: -2.1, y: 2.3, z: 0.1 }, { hx: 0.5, hy: 2.3, hz: 0.7, x: 2.1, y: 2.3, z: 0.1 }, { hx: 1.6, hy: 2.1, hz: 0.2, x: 0, y: 2.2, z: -0.35 }] };
}

// ───────────── 보물상자(뚜껑이 열린다) ─────────────
export interface ChestModel { root: THREE.Group; lid: THREE.Group }
export function buildChest(tier: 'wood' | 'silver' | 'gold'): ChestModel {
  const root = new THREE.Group();
  const band = tier === 'gold' ? C.gold : tier === 'silver' ? '#dfe6f2' : C.woodDark;
  const body = tier === 'gold' ? '#d98a5a' : tier === 'silver' ? '#8fb0e0' : C.wood;
  const b = new Bake().add(rbox(1.2, 0.7, 0.8, 0.12), body, { p: [0, 0.35, 0] })
    .add(rbox(1.24, 0.12, 0.84, 0.05), band, { p: [0, 0.12, 0] })
    .add(rbox(0.14, 0.72, 0.84, 0.05), band, { p: [-0.42, 0.36, 0] }).add(rbox(0.14, 0.72, 0.84, 0.05), band, { p: [0.42, 0.36, 0] });
  root.add(mesh(b.build(), tier === 'wood' ? matBase() : matShiny()));
  const lid = new THREE.Group();
  lid.position.set(0, 0.7, -0.4);
  const lg = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 20, 1, false, 0, Math.PI);
  const l = new Bake().add(lg, body, { r: [0, 0, Math.PI / 2], p: [0, 0, 0.4] })
    .add(rbox(0.2, 0.26, 0.1, 0.04), C.gold, { p: [0, 0.02, 0.82] });
  lid.add(mesh(l.build(), tier === 'wood' ? matBase() : matShiny()));
  root.add(lid);
  root.add(blobShadow(0.9));
  return { root, lid };
}

// ───────────── 황금풍뎅이(보물방 받침대) ─────────────
export function buildScarab(): THREE.Group {
  const root = new THREE.Group();
  const b = new Bake()
    .add(ell(0.36, 0.22, 0.44), vgrad(C.goldDeep, '#fff0a8', -0.1, 0.25), { p: [0, 0.22, 0] })
    .add(new THREE.BoxGeometry(0.02, 0.05, 0.8), '#e0a12a', { p: [0, 0.43, 0] })
    .add(ell(0.22, 0.16, 0.18), C.goldDeep, { p: [0, 0.2, 0.42] });
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.add(cap(0.03, 0.22), '#e0a12a', { p: [s * 0.34, 0.08, -0.18 + i * 0.18], r: [0, 0, s * 1.1] });
  root.add(mesh(b.build(), matShiny()));
  const face = new THREE.Group();
  face.position.set(0, 0.22, 0.42);
  addEyes(face, { size: 0.1, head: { r: 0.17 } });
  root.add(face);
  return root;
}

// ───────────── 조개 줍기(모래톱) · 별가루 구슬 ─────────────
let shellGeos: Geo[] | null = null;
/** 종류 3(분홍 가리비 · 하늘 고둥 · 불가사리) — 공유 */
export function pickupShellGeos(): Geo[] {
  if (shellGeos) return shellGeos;
  const a = new Bake().add(shellGeo(0.22, 0.09, 0.2, 7), C.pink).build(true);
  const b = new Bake().add(cone(0.1, 0.3, 14), '#a8d8ff', { r: [Math.PI / 2, 0, 0], p: [0, 0.08, 0] }).add(sph(0.11, 12, 10), '#d8eeff', { p: [0, 0.08, -0.12] }).build(true);
  const sh = new THREE.Shape();
  for (let i = 0; i <= 10; i++) { const a2 = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? 0.09 : 0.22; if (i === 0) sh.moveTo(Math.cos(a2) * r, Math.sin(a2) * r); else sh.lineTo(Math.cos(a2) * r, Math.sin(a2) * r); }
  const c = new Bake().add(new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }), '#ffb38a', { r: [-Math.PI / 2, 0, 0], p: [0, 0.05, 0] }).build(true);
  return (shellGeos = [a, b, c]);
}
let orbGeo: Geo | null = null;
export function stardustOrbGeo(): Geo {
  if (orbGeo) return orbGeo;
  const b = new Bake().add(sph(0.26, 20, 14), '#fff3b0');
  for (let i = 0; i < 4; i++) b.add(cone(0.08, 0.3, 6), '#ffe08a', { r: [0, 0, (i / 4) * TAU], p: [Math.cos((i / 4) * TAU + Math.PI / 2) * 0.3, Math.sin((i / 4) * TAU + Math.PI / 2) * 0.3, 0] });
  return (orbGeo = b.build(true));
}

/** 은은한 빛 기둥(발견 전 표시) */
export function buildSparkle(color = '#fff0a8'): THREE.Mesh {
  const b = new Bake().add(cyl(0.5, 0.5, 6, 16, true), color, { p: [0, 3, 0] });
  const m = mesh(b.build(), matSoft(0.18), { cast: false, name: 'hidden-sparkle' });
  return m;
}

export { dome };
