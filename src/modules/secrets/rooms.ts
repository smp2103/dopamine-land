// secrets 실내 — 숨은 곳 동굴·방 7곳(먼 실내 자리 interiors.origin(i) 에 둔다, 로컬 바닥 y = 0, 카메라는 +z 쪽에서 본다).
//  폭포 뒤 동굴(별조각 받침 + 금상자) · 고대 벽화 동굴(로켓 탄 공룡) · 해안 거품동굴(웅덩이 → 잠수) · 해저 거품동굴 ·
//  오로라 얼음 동굴 · 늪 오두막 · 거인 나무 속 방.
// 방은 둥근 동굴(반지름 R) — 벽 충돌체는 축 정렬 상자를 둘레에 겹쳐 세운다(InteriorBox 에 회전이 없어서).
import * as THREE from 'three';
import { Builder, G, Motes, glowMat, picturePlane, plainMat, sparkGeometry } from './kit';
import { chestModel, torchFlames } from './outdoor';
import { crab, frogFriend, owlPlush } from './critters';

type V3 = [number, number, number];
export interface LocalBox { hx: number; hy: number; hz: number; x: number; y: number; z: number }
export interface RoomState {
  /** 한 번 상자(남았나) */
  chest: boolean;
  /** 하루 줍기(남았나) */
  daily: boolean;
  /** 별조각이 아직 받침 위에 있나(폭포 동굴) */
  star?: boolean;
}
export interface RoomModel {
  root: THREE.Group;
  /** 바닥 반지름 */
  R: number;
  spawn: V3;
  exit: V3;
  anchors: Record<string, V3>;
  cols: LocalBox[];
  backdrop: string;
  cam: { dist: number; pitch: number };
  /** 실내 점광원 자리 */
  light: V3;
  update(t: number, s: RoomState): void;
}

export type RoomId = 'waterfall' | 'mural' | 'bubble' | 'dive' | 'aurora' | 'hut' | 'tree';
/** 방 반지름·바깥 가리개 색(방을 짓기 전에도 읽는다) */
export const ROOM_LOOK: Record<RoomId, { R: number; backdrop: string }> = {
  waterfall: { R: 8, backdrop: '#a9c4e0' }, mural: { R: 8, backdrop: '#d8b890' }, bubble: { R: 7.5, backdrop: '#9fd0e0' },
  dive: { R: 9, backdrop: '#6fa8d8' }, aurora: { R: 8.5, backdrop: '#8fb8d8' }, hut: { R: 5.6, backdrop: '#a8c89a' }, tree: { R: 6.2, backdrop: '#c8b088' },
};

/** 둥근 방 바닥 판정(벽 바로 안쪽까지) */
export const roomFloor = (R: number, x: number, z: number) => (x * x + z * z <= (R + 0.6) * (R + 0.6) ? 0 : null);

/** 둥근 벽: 둘레 바위 덩이 + 겹친 상자 충돌체. 입구(+z) 는 빛 들어오는 굴 모양 */
function roundWalls(B: Builder, R: number, rock: string[], o: { h?: number; seed?: number; kind?: 'matte' | 'ice' | 'soft' } = {}): LocalBox[] {
  const n = Math.max(16, Math.round((2 * Math.PI * R) / 1.6));
  const h = o.h ?? 3.4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * (R + 0.9), z = Math.sin(a) * (R + 0.9);
    const s = 2.0 + ((i * 7 + (o.seed ?? 0)) % 4) * 0.35;
    // 카메라 쪽(+z) 벽은 낮게 — 방 안이 가려지지 않게(충돌체는 그대로 높다)
    const front = THREE.MathUtils.smoothstep(Math.sin(a), -0.1, 0.5);
    const hh = h * (0.95 + (i % 3) * 0.12) * (1 - front * 0.78);
    B.add(G.lump((i + (o.seed ?? 0)) % 8), o.kind ?? 'matte', rock[i % rock.length], [x, hh * 0.42, z], [s, hh, s], [0, -a, 0]);
  }
  const cols: LocalBox[] = [{ hx: R + 2, hy: 0.5, hz: R + 2, x: 0, y: -0.5, z: 0 }];
  const m = Math.max(24, Math.round((2 * Math.PI * R) / 1.2));
  for (let i = 0; i < m; i++) {
    const a = (i / m) * Math.PI * 2;
    cols.push({ hx: 0.8, hy: 2.5, hz: 0.8, x: Math.cos(a) * (R + 1.0), y: 2.5, z: Math.sin(a) * (R + 1.0) });
  }
  return cols;
}
/** 입구 굴(+z 벽 쪽 밝은 구멍) */
function entranceGlow(B: Builder, R: number, c: string) {
  B.add(G.hemi(), 'glow', c, [0, 0.02, R + 0.55], [2.6, 2.6, 0.6], [Math.PI / 2, 0, 0]);
}
const bake = (B: Builder, name: string) => B.bake(name);
const room = (name: string) => { const g = new THREE.Group(); g.name = `secrets-room-${name}`; return g; };
const circle = (n: number, r: number, f: (x: number, z: number, a: number, i: number) => void) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; f(Math.cos(a) * r, Math.sin(a) * r, a, i); } };

/** 돌 받침 + 반짝 기둥(별조각 자리) */
function starPedestal(B: Builder, p: V3) {
  B.add(G.taper(0.75, 16), 'matte', '#c9d4e2', [p[0], 0.5, p[2]], [1.4, 1.0, 1.4]);
  B.add(G.cyl(18), 'matte', '#dfe8f2', [p[0], 1.04, p[2]], [1.6, 0.1, 1.6]);
  B.add(G.torus(0.08), 'metal', '#ffd27a', [p[0], 1.1, p[2]], [1.5, 1.5, 1.5], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; B.add(G.crystal(), 'gloss', '#c8e8ff', [p[0] + Math.cos(a) * 1.1, 0, p[2] + Math.sin(a) * 1.1], 0.5, [0.2 * Math.cos(a), 0, 0.2 * Math.sin(a)]); }
}

// ───────────── ① 폭포 뒤 동굴 ─────────────
function waterfallRoom(rnd: () => number): RoomModel {
  const R = ROOM_LOOK.waterfall.R;
  const root = room('waterfall');
  const B = new Builder();
  B.add(G.cyl(40), 'matte', '#a8d8c8', [0, -0.05, 0], [R * 2 + 1, 0.1, R * 2 + 1]);
  const cols = roundWalls(B, R, ['#9fb4cc', '#b0c4d8', '#8fa6c2'], { seed: 2 });
  entranceGlow(B, R, '#cfefff');
  // 입구 쪽 물 커튼(안에서 본 뒷면 — 빛이 일렁)
  for (let i = 0; i < 7; i++) B.add(G.capsule(), 'water', '#bfefff', [-1.5 + i * 0.5, 1.6, R + 0.2], [0.34, 1.6, 0.12]);
  // 지하 웅덩이 + 연잎 + 수정 무리
  B.add(G.disc(), 'water', '#7fd0f0', [-4.2, 0.03, -1.0], [4.4, 1, 3.4]);
  circle(10, 1, (x, z, a, i) => B.add(G.lump(i), 'matte', '#c9d4e2', [-4.2 + x * 2.25, 0.08, -1.0 + z * 1.75], 0.6));
  B.add(G.cyl(16), 'soft', '#9fdc8a', [-4.6, 0.06, -0.6], [1.0, 0.04, 1.0]);
  for (const [x, z] of [[5.2, -3.6], [4.6, 2.4], [-3.0, -5.4]] as const) for (let k = 0; k < 4; k++) B.add(G.crystal(), 'gloss', ['#9fe2ff', '#c8b4ff', '#bff6e8'][k % 3], [x + Math.cos(k * 1.7) * 0.5, 0, z + Math.sin(k * 1.7) * 0.5], 0.6 + (k % 2) * 0.35, [0.25 * Math.cos(k), 0, 0.25 * Math.sin(k)]);
  // 이끼 덩이·작은 파란 꽃
  for (let i = 0; i < 12; i++) { const a = rnd() * Math.PI * 2, r = R * (0.6 + rnd() * 0.3); B.add(G.sphere(), 'soft', i % 2 ? '#9fd88a' : '#b8e6a0', [Math.cos(a) * r, 0.05, Math.sin(a) * r], [1.0 + rnd(), 0.3, 0.9 + rnd()]); }
  // 별조각 받침(가운데 뒤)
  const P: V3 = [0, 0, -3.6];
  starPedestal(B, P);
  root.add(bake(B, 'waterfall-room'));
  const star = new THREE.Group();
  star.name = 'secrets-starpiece';
  const sm = new THREE.Mesh(G.star(), glowMat('#fff3a0', 1));
  sm.scale.setScalar(0.9);
  star.add(sm);
  const halo = new THREE.Mesh(G.sphereLo(), glowMat('#fff8c8', 0.25));
  halo.scale.setScalar(1.6);
  star.add(halo);
  star.position.set(P[0], 2.0, P[2]);
  root.add(star);
  const beam = new THREE.Mesh(G.taper(0.6, 20), glowMat('#fff8d8', 0.18));
  beam.scale.set(1.6, 6, 1.6);
  beam.position.set(P[0], 4.0, P[2]);
  root.add(beam);
  const motes = new Motes(sparkGeometry(), glowMat('#fff6c0', 0.9), Array.from({ length: 22 }, () => ({ x: P[0] - 1 + rnd() * 2, y: 0.8, z: P[2] - 1 + rnd() * 2, s: 0.06 + rnd() * 0.05 })), rnd, 'rise', 3.2);
  root.add(motes.mesh);
  const chest = chestModel('gold');
  chest.position.set(4.4, 0, -1.2);
  chest.rotation.y = -0.8;
  root.add(chest);
  cols.push({ hx: 0.8, hy: 0.6, hz: 0.8, x: P[0], y: 0.6, z: P[2] }, { hx: 2.0, hy: 0.4, hz: 1.6, x: -4.2, y: -0.2, z: -1.0 });
  return {
    root, R, cols, spawn: [0, 0, R - 2.0], exit: [0, 0, R - 0.8], anchors: { star: [P[0], 0, P[2] + 1.4], chest: [4.4, 0, -1.2] },
    backdrop: ROOM_LOOK.waterfall.backdrop, cam: { dist: 13, pitch: 0.72 }, light: [0, 3.2, 0],
    update(t, s) {
      star.visible = !!s.star; beam.visible = !!s.star;
      if (s.star) { star.rotation.y = t * 1.2; star.position.y = 2.0 + Math.sin(t * 2) * 0.12; motes.update(t); }
      motes.mesh.visible = !!s.star;
      chest.visible = s.chest;
    },
  };
}

// ───────────── ② 고대 벽화 동굴 ─────────────
/** 벽화: 로켓 탄 공룡(동굴 그림 붓질 — 황토·주홍·하늘) */
function drawMural(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = '#e8cfa8'; g.fillRect(0, 0, W, H);
  // 돌결 얼룩
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(190,150,110,${0.08 + (i % 5) * 0.02})`; g.beginPath(); g.arc((i * 97) % W, (i * 53) % H, 10 + (i % 7) * 6, 0, Math.PI * 2); g.fill(); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  // 별·초승달
  g.fillStyle = '#f0b040';
  for (const [x, y, r] of [[80, 60, 10], [180, 40, 7], [860, 70, 12], [940, 160, 7], [720, 40, 8]] as const) {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  g.strokeStyle = '#f0b040'; g.lineWidth = 10;
  g.beginPath(); g.arc(120, 150, 34, -1.2, 1.9); g.stroke();
  // 로켓(비스듬히 위로)
  g.save(); g.translate(560, 270); g.rotate(-0.5);
  g.fillStyle = '#e8805a'; g.strokeStyle = '#8a4a3a'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(-150, -46); g.lineTo(110, -46); g.quadraticCurveTo(200, 0, 110, 46); g.lineTo(-150, 46); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#7fb8e0'; g.beginPath(); g.arc(70, 0, 22, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#e8805a';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-150, s * 46); g.lineTo(-200, s * 100); g.lineTo(-110, s * 46); g.closePath(); g.fill(); g.stroke(); }
  // 불꽃
  g.fillStyle = '#f0b040'; g.beginPath(); g.moveTo(-150, -30); g.lineTo(-260, 0); g.lineTo(-150, 30); g.closePath(); g.fill();
  g.fillStyle = '#f6d070'; g.beginPath(); g.moveTo(-150, -16); g.lineTo(-210, 0); g.lineTo(-150, 16); g.closePath(); g.fill();
  // 위에 탄 공룡(동그란 몸 + 긴 목 + 웃는 얼굴 + 등 뾰족)
  g.fillStyle = '#7cb86a'; g.strokeStyle = '#4a6a3a';
  g.beginPath(); g.ellipse(-30, -80, 70, 42, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(10, -100); g.quadraticCurveTo(50, -180, 90, -170); g.lineWidth = 26; g.strokeStyle = '#7cb86a'; g.stroke();
  g.lineWidth = 8; g.strokeStyle = '#4a6a3a';
  g.beginPath(); g.arc(100, -172, 30, 0, Math.PI * 2); g.fillStyle = '#7cb86a'; g.fill(); g.stroke();
  g.fillStyle = '#3d3a4a'; g.beginPath(); g.ellipse(108, -180, 5, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff9fb8'; g.beginPath(); g.arc(116, -164, 7, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#4a6a3a'; g.lineWidth = 5; g.beginPath(); g.arc(104, -166, 12, 0.3, 1.4); g.stroke();
  g.fillStyle = '#e8805a';
  for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-90 + k * 32, -112); g.lineTo(-74 + k * 32, -140); g.lineTo(-58 + k * 32, -112); g.closePath(); g.fill(); }
  g.restore();
  // 아래 작은 공룡들이 손 흔들기 + 손바닥 자국
  g.fillStyle = '#c9805a';
  for (const [x, y] of [[140, 440], [240, 460], [880, 450]] as const) {
    g.beginPath(); g.ellipse(x, y, 34, 22, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + 30, y - 26, 14, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c9805a'; g.lineWidth = 7; g.beginPath(); g.moveTo(x + 10, y - 10); g.lineTo(x + 6, y - 46); g.stroke();
  }
  for (const [x, y, c] of [[60, 300, '#e8805a'], [960, 330, '#7fb8e0'], [420, 470, '#ff9fb8']] as const) {
    g.fillStyle = c; g.beginPath(); g.ellipse(x, y, 18, 22, 0, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(x - 16 + k * 8, y - 28 - (k === 2 ? 4 : 0), 4, 9, 0, 0, Math.PI * 2); g.fill(); }
  }
}
function muralRoom(rnd: () => number): RoomModel {
  const R = ROOM_LOOK.mural.R;
  const root = room('mural');
  const B = new Builder();
  B.add(G.cyl(40), 'matte', '#e8cca4', [0, -0.05, 0], [R * 2 + 1, 0.1, R * 2 + 1]);
  const cols = roundWalls(B, R, ['#d9b48a', '#cfa57c', '#e2c29a'], { seed: 4, h: 4.2 });
  entranceGlow(B, R, '#ffe8c0');
  // 벽화 받침 벽(평평한 큰 바위)
  B.add(G.box(0.3), 'matte', '#dcbc94', [0, 2.2, -R + 0.3], [8.4, 4.4, 0.8]);
  // 화석 뼈 · 공룡 발자국 · 돌 의자
  for (let k = 0; k < 5; k++) B.add(G.capsule(), 'matte', '#fff3dc', [-4 + k * 0.5, 0.12, 3.2 - k * 0.2], [0.14, 0.5, 0.14], [Math.PI / 2, 0.5 * k, 0]);
  B.add(G.sphere(), 'matte', '#fff3dc', [-4.4, 0.3, 3.6], [0.7, 0.5, 0.5]);
  for (let i = 0; i < 5; i++) {
    const x = (i % 2 ? 0.5 : -0.5), z = R - 2 - i * 1.1;
    B.add(G.sphere(), 'matte', '#c49a72', [x, 0.02, z], [0.42, 0.03, 0.4]);
    for (const dx of [-0.16, 0, 0.16]) B.add(G.sphere(), 'matte', '#c49a72', [x + dx, 0.02, z - 0.3], [0.12, 0.03, 0.2]);
  }
  for (const [x, z] of [[-2.4, -2.2], [2.4, -2.2]] as const) B.add(G.lump(3), 'matte', '#cfa57c', [x, 0.3, z], [1.1, 0.6, 1.0]);
  // 횃불 넷
  const torches: V3[] = [[-5.2, 2.3, -4.6], [5.2, 2.3, -4.6], [-6.4, 2.3, 1.4], [6.4, 2.3, 1.4]];
  for (const [x, , z] of torches) {
    B.add(G.cyl(8), 'matte', '#a67a52', [x, 1.1, z], [0.12, 2.2, 0.12]);
    B.add(G.taper(1.4, 10), 'matte', '#8a6a4a', [x, 2.15, z], [0.3, 0.2, 0.3]);
  }
  // 호박 조각 무더기(하루 줍기)
  const A: V3 = [3.6, 0, -5.2];
  for (let k = 0; k < 5; k++) B.add(G.lump(k), 'gloss', '#ffcf8a', [A[0] + Math.cos(k * 1.3) * 0.4, 0.15, A[2] + Math.sin(k * 1.3) * 0.3], 0.32);
  root.add(bake(B, 'mural-room'));
  const mural = picturePlane('mural', 7.6, 3.8, 1024, 512, drawMural, { color: '#ffffff' });
  mural.position.set(0, 2.3, -R + 0.72);
  root.add(mural);
  const flames = torchFlames(torches.map(([x, y, z]) => [x, y + 0.25, z] as V3));
  root.add(flames.group);
  const glint = new Motes(sparkGeometry(), glowMat('#ffe8a8', 0.95), Array.from({ length: 8 }, () => ({ x: A[0] - 0.6 + rnd() * 1.2, y: 0.4 + rnd() * 0.5, z: A[2] - 0.5 + rnd(), s: 0.08 })), rnd);
  root.add(glint.mesh);
  const chest = chestModel('silver');
  chest.position.set(-4.2, 0, -4.2);
  chest.rotation.y = 0.7;
  root.add(chest);
  cols.push({ hx: 4.3, hy: 2.2, hz: 0.5, x: 0, y: 2.2, z: -R + 0.3 });
  return {
    root, R, cols, spawn: [0, 0, R - 2.0], exit: [0, 0, R - 0.8], anchors: { mural: [0, 0, -R + 2.6], chest: [-4.2, 0, -4.2], pick: A },
    backdrop: ROOM_LOOK.mural.backdrop, cam: { dist: 13, pitch: 0.68 }, light: [0, 3.4, -1],
    update(t, s) { flames.update(t, 1.1); chest.visible = s.chest; glint.mesh.visible = s.daily; if (s.daily) glint.update(t); },
  };
}

// ───────────── ③ 해안 거품동굴 ─────────────
function bubbleRoom(rnd: () => number): RoomModel {
  const R = ROOM_LOOK.bubble.R;
  const root = room('bubble');
  const B = new Builder();
  B.add(G.cyl(40), 'matte', '#f2e2c4', [0, -0.05, 0], [R * 2 + 1, 0.1, R * 2 + 1]);
  const cols = roundWalls(B, R, ['#9ec4cf', '#b2d2da', '#8fb8c6'], { seed: 6 });
  entranceGlow(B, R, '#e0faff');
  // 거품 웅덩이(가운데 뒤) — 여기로 잠수
  const P: V3 = [0, 0, -3.0];
  B.add(G.disc(), 'water', '#6fd0e8', [P[0], 0.04, P[2]], [5.0, 1, 4.0]);
  B.add(G.disc(), 'glow', '#bff4ff', [P[0], 0.02, P[2]], [2.6, 1, 2.0]);
  circle(12, 1, (x, z, a, i) => B.add(G.lump(i), 'matte', '#c4dce4', [P[0] + x * 2.6, 0.1, P[2] + z * 2.1], 0.55));
  // 조개·불가사리·따개비·해초
  for (let i = 0; i < 8; i++) { const a = rnd() * Math.PI * 2, r = R * (0.45 + rnd() * 0.4); B.add(G.star(), 'gloss', ['#ff9a8a', '#ffb86a', '#ff9fc0', '#c8a8ff'][i % 4], [Math.cos(a) * r, 0.04, Math.sin(a) * r], [0.4, 0.4, 0.26], [-Math.PI / 2, 0, rnd() * 6]); }
  for (let i = 0; i < 10; i++) { const a = rnd() * Math.PI * 2, r = R * (0.5 + rnd() * 0.4); B.add(G.hemi(), 'gloss', ['#fff0e6', '#ffd9e6', '#e6f2ff'][i % 3], [Math.cos(a) * r, 0.02, Math.sin(a) * r], [0.36, 0.2, 0.32], [0, rnd() * 6, 0]); }
  for (let i = 0; i < 6; i++) { const x = -5 + i * 2, z = -5 + (i % 2); for (let k = 0; k < 3; k++) B.add(G.capsule(), 'soft', '#7fcf9a', [x + k * 0.2, 0.6, z], [0.12, 1.0 + k * 0.3, 0.08], [0.1 * k, 0, 0.2 * (k - 1)]); }
  root.add(bake(B, 'bubble-room'));
  const bubbles = new Motes(G.sphere(), plainMat('glass'), Array.from({ length: 20 }, () => ({ x: P[0] - 1.6 + rnd() * 3.2, y: 0.1, z: P[2] - 1.2 + rnd() * 2.4, s: 0.16 + rnd() * 0.22 })), rnd, 'rise', 4.0);
  root.add(bubbles.mesh);
  const crabs = [crab(0.3), crab(2.1)];
  crabs[0].root.position.set(-3.6, 0, 1.8); crabs[1].root.position.set(3.4, 0, 0.6); crabs[1].root.rotation.y = -0.6;
  for (const c of crabs) root.add(c.root);
  const chest = chestModel('silver');
  chest.position.set(4.6, 0, -2.8);
  chest.rotation.y = -0.9;
  root.add(chest);
  return {
    root, R, cols, spawn: [0, 0, R - 2.0], exit: [0, 0, R - 0.8], anchors: { pool: [P[0], 0, P[2] + 2.2], chest: [4.6, 0, -2.8] },
    backdrop: ROOM_LOOK.bubble.backdrop, cam: { dist: 12, pitch: 0.74 }, light: [0, 3.0, 0],
    update(t, s) {
      bubbles.update(t);
      crabs.forEach((c, i) => { const bx = i ? 3.4 : -3.6; c.animate(t); c.root.position.x += bx; });
      chest.visible = s.chest;
    },
  };
}

// ───────────── ④ 해저 거품동굴(잠수) ─────────────
function diveRoom(rnd: () => number): RoomModel {
  const R = ROOM_LOOK.dive.R;
  const root = room('dive');
  const B = new Builder();
  B.add(G.cyl(40), 'matte', '#e6dcc0', [0, -0.05, 0], [R * 2 + 1, 0.1, R * 2 + 1]);
  const cols = roundWalls(B, R, ['#7fb0c8', '#8fbcd2', '#6fa4be'], { seed: 1, h: 4.6 });
  // 산호 무리(분홍·주황·보라 가지 + 뇌산호)
  const corals: V3[] = [[-5.4, 0, -3.6], [5.2, 0, -3.0], [-3.0, 0, 4.0], [4.2, 0, 3.6], [0.4, 0, -6.4]];
  corals.forEach(([x, , z], i) => {
    const c = ['#ff9fc0', '#ffb86a', '#c8a8ff', '#ff9a8a', '#8fe3c8'][i];
    for (let k = 0; k < 5; k++) B.add(G.capsule(), 'gloss', c, [x + Math.cos(k * 1.3) * 0.4, 0.7 + (k % 2) * 0.3, z + Math.sin(k * 1.3) * 0.4], [0.18, 0.9 + (k % 3) * 0.3, 0.18], [Math.cos(k) * 0.4, 0, Math.sin(k) * 0.4]);
    B.add(G.sphere(), 'soft', '#ffe0c8', [x + 0.9, 0.3, z + 0.5], [0.9, 0.6, 0.8]);
  });
  // 하늘하늘 해초
  for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI * 2, r = R * (0.55 + rnd() * 0.35); B.add(G.capsule(), 'soft', i % 2 ? '#7fcf9a' : '#9fe0a8', [Math.cos(a) * r, 1.0, Math.sin(a) * r], [0.14, 1.8 + rnd(), 0.08], [0, a, 0.15]); }
  // 대왕 거품 조개(하루 줍기)
  const C: V3 = [0, 0, -3.0];
  B.add(G.hemi(), 'gloss', '#d8c8ff', [C[0], 0.1, C[2]], [2.4, 1.0, 1.8]);
  B.add(G.hemi(), 'gloss', '#e6dcff', [C[0], 0.4, C[2] - 0.6], [2.4, 1.0, 1.8], [-1.0, 0, 0]);
  B.add(G.sphere(), 'gloss', '#fffaf2', [C[0], 0.5, C[2]], 0.5);
  // 위로 올라가는 빛 기둥(나가는 곳)
  B.add(G.disc(), 'glow', '#d8f6ff', [0, 0.02, R - 1.2], [2.4, 1, 2.4]);
  root.add(bake(B, 'dive-room'));
  const rays = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(G.taper(0.4, 12), glowMat('#e8fbff', 0.12));
    m.scale.set(2.2, 9, 2.2);
    m.position.set(-4 + i * 2, 4.5, -2 + (i % 2) * 2);
    m.rotation.z = 0.15;
    rays.add(m);
  }
  root.add(rays);
  const big = new Motes(G.sphere(), plainMat('glass'), Array.from({ length: 18 }, () => ({ x: -R * 0.7 + rnd() * R * 1.4, y: 1 + rnd() * 3, z: -R * 0.7 + rnd() * R * 1.4, s: 0.4 + rnd() * 0.6 })), rnd, 'float');
  root.add(big.mesh);
  const small = new Motes(G.sphereLo(), plainMat('glass'), Array.from({ length: 30 }, () => ({ x: -R * 0.8 + rnd() * R * 1.6, y: 0.1, z: -R * 0.8 + rnd() * R * 1.6, s: 0.1 + rnd() * 0.12 })), rnd, 'rise', 5);
  root.add(small.mesh);
  const pearl = new THREE.Mesh(G.sphere(), glowMat('#fff6fb', 1));
  pearl.position.set(C[0], 0.9, C[2]);
  pearl.scale.setScalar(0.55);
  root.add(pearl);
  const chest = chestModel('silver');
  chest.position.set(-5.6, 0, 0.6);
  chest.rotation.y = 1.0;
  root.add(chest);
  cols.push({ hx: 1.2, hy: 0.6, hz: 0.9, x: C[0], y: 0.6, z: C[2] });
  return {
    root, R, cols, spawn: [0, 0, R - 2.2], exit: [0, 0, R - 1.2], anchors: { clam: [C[0], 0, C[2] + 1.8], chest: [-5.6, 0, 0.6], up: [0, 0, R - 1.2] },
    backdrop: ROOM_LOOK.dive.backdrop, cam: { dist: 13, pitch: 0.68 }, light: [0, 3.6, 0],
    update(t, s) {
      big.update(t * 0.6); small.update(t);
      rays.children.forEach((m, i) => { (m as THREE.Mesh).rotation.z = 0.15 + Math.sin(t * 0.4 + i) * 0.05; });
      pearl.visible = s.daily;
      pearl.scale.setScalar(0.55 + Math.sin(t * 2.4) * 0.03);
      chest.visible = s.chest;
    },
  };
}

// ───────────── ⑤ 오로라 얼음 동굴 ─────────────
function auroraRoom(rnd: () => number): RoomModel {
  const R = ROOM_LOOK.aurora.R;
  const root = room('aurora');
  const B = new Builder();
  B.add(G.cyl(40), 'soft', '#f2f8ff', [0, -0.05, 0], [R * 2 + 1, 0.1, R * 2 + 1]);
  const cols = roundWalls(B, R, ['#cfe6f6', '#bcdcf2', '#e0f0fa'], { seed: 3, h: 4.4 });
  entranceGlow(B, R, '#d8f6ff');
  // 얼음 기둥 + 수정 무리(가운데가 빛난다)
  const clusters: V3[] = [[-4.6, 0, -3.8], [4.8, 0, -3.4], [0, 0, -5.6], [-5.6, 0, 2.6], [5.4, 0, 2.2]];
  clusters.forEach(([x, , z], i) => {
    for (let k = 0; k < 5; k++) B.add(G.crystal(), 'ice', ['#c8f0ff', '#e0d0ff', '#c8ffe8'][(i + k) % 3], [x + Math.cos(k * 1.4) * 0.6, 0, z + Math.sin(k * 1.4) * 0.6], 0.8 + (k % 3) * 0.45, [0.3 * Math.cos(k), 0, 0.3 * Math.sin(k)]);
    B.add(G.sphere(), 'glow', ['#9ff0d6', '#c8a8ff', '#ff9fd0'][i % 3], [x, 0.6, z], 0.35);
  });
  // 고드름(천장 대신 벽 위)
  circle(22, R + 0.2, (x, z, a, i) => B.add(G.cone(8), 'ice', '#eaf8ff', [x, 3.4, z], [0.3, 1.0 + (i % 3) * 0.4, 0.3], [Math.PI, 0, 0]));
  // 눈 둔덕 · 작은 눈사람
  for (let i = 0; i < 8; i++) { const a = rnd() * Math.PI * 2, r = R * (0.5 + rnd() * 0.35); B.add(G.sphere(), 'soft', '#ffffff', [Math.cos(a) * r, 0.05, Math.sin(a) * r], [1.4 + rnd(), 0.4, 1.2 + rnd()]); }
  B.add(G.sphere(), 'soft', '#ffffff', [2.6, 0.5, 3.6], 1.0);
  B.add(G.sphere(), 'soft', '#ffffff', [2.6, 1.2, 3.6], 0.7);
  B.add(G.cone(8), 'matte', '#ffb36a', [2.6, 1.2, 3.98], [0.1, 0.3, 0.1], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) B.add(G.sphere(), 'matte', '#5a4a6a', [2.6 + s * 0.14, 1.32, 3.9], 0.06);
  root.add(bake(B, 'aurora-room'));
  // 하늘 오로라 띠(벽 위를 감는 빛 리본, 물결)
  const ribbons = ['#9ff0d6', '#b8f8c8', '#c8a8ff', '#ff9fd0'].map((c, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R * (0.5 + i * 0.12), 0.35, 6, 48, Math.PI * 1.3), glowMat(c, 0.42));
    m.rotation.x = Math.PI / 2;
    m.position.y = 4.6 + i * 0.5;
    m.rotation.z = i * 0.8;
    root.add(m);
    return m;
  });
  const sp = new Motes(sparkGeometry(), glowMat('#eafff6', 0.9), Array.from({ length: 34 }, () => ({ x: -R + rnd() * R * 2, y: 1 + rnd() * 4, z: -R + rnd() * R * 2, s: 0.07 + rnd() * 0.06 })), rnd);
  root.add(sp.mesh);
  const chest = chestModel('silver');
  chest.position.set(-3.0, 0, 4.4);
  chest.rotation.y = 2.6;
  root.add(chest);
  const pickGlow = new THREE.Mesh(G.sphereLo(), glowMat('#c8fff0', 0.35));
  pickGlow.position.set(0, 1.0, -5.6);
  pickGlow.scale.setScalar(2.4);
  root.add(pickGlow);
  for (const [x, , z] of clusters) cols.push({ hx: 0.9, hy: 1, hz: 0.9, x, y: 1, z });
  return {
    root, R, cols, spawn: [0, 0, R - 2.0], exit: [0, 0, R - 0.8], anchors: { crystal: [0, 0, -4.0], chest: [-3.0, 0, 4.4] },
    backdrop: ROOM_LOOK.aurora.backdrop, cam: { dist: 13, pitch: 0.66 }, light: [0, 3.6, 0],
    update(t, s) {
      ribbons.forEach((m, i) => { m.rotation.z = i * 0.8 + t * 0.08 * (i % 2 ? -1 : 1); m.position.y = 4.6 + i * 0.5 + Math.sin(t * 0.7 + i) * 0.25; });
      sp.update(t);
      chest.visible = s.chest;
      pickGlow.visible = s.daily;
    },
  };
}

// ───────────── ⑥ 늪 위 둥둥 오두막(안) ─────────────
function hutRoom(rnd: () => number): RoomModel {
  const R = ROOM_LOOK.hut.R;
  const root = room('hut');
  const B = new Builder();
  // 판자 바닥(번갈아 색) + 둥근 통나무 벽
  for (let i = -6; i <= 6; i++) B.add(G.box(0.05), 'matte', i % 2 ? '#d8a878' : '#c99a6a', [i * 0.95, -0.05, 0], [0.92, 0.1, R * 2 + 1]);
  const cols = roundWalls(B, R, ['#c49766', '#b8895a', '#d0a070'], { seed: 5, h: 3.0, kind: 'matte' });
  entranceGlow(B, R, '#fff0c8');
  // 보글보글 솥(가운데 뒤)
  const P: V3 = [0, 0, -2.4];
  B.add(G.sphere(), 'metal', '#8a7aa0', [P[0], 0.7, P[2]], [1.8, 1.4, 1.8]);
  B.add(G.torus(0.1), 'metal', '#a898c0', [P[0], 1.25, P[2]], [1.5, 1.5, 1.5], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; B.add(G.cyl(8), 'metal', '#8a7aa0', [P[0] + Math.cos(a) * 0.6, 0.15, P[2] + Math.sin(a) * 0.6], [0.12, 0.3, 0.12]); }
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; B.add(G.lump(k), 'matte', '#c9c4d6', [P[0] + Math.cos(a) * 1.0, 0.1, P[2] + Math.sin(a) * 1.0], 0.36); }
  B.add(G.cone(10), 'glow', '#ffb36a', [P[0], 0.15, P[2]], [0.6, 0.4, 0.6]);
  // 약병 선반(유리병 줄) · 해먹 · 버섯 등 · 말린 풀
  for (const sx of [-1, 1]) {
    const x = sx * 3.6;
    B.add(G.box(0.05), 'matte', '#a87a4e', [x, 1.3, -3.4], [2.0, 0.12, 0.5], [0, sx * -0.5, 0]);
    B.add(G.box(0.05), 'matte', '#a87a4e', [x, 2.1, -3.4], [2.0, 0.12, 0.5], [0, sx * -0.5, 0]);
    for (let k = 0; k < 4; k++) {
      const c = ['#ff9fc0', '#9ff0d6', '#c8a8ff', '#fff0a8'][k];
      const ox = (k - 1.5) * 0.42;
      B.add(G.sphere(), 'glass', c, [x + ox * Math.cos(0.5), 1.55, -3.4 + ox * sx * 0.48], [0.3, 0.38, 0.3]);
      B.add(G.sphere(), 'glow', c, [x + ox * Math.cos(0.5), 1.5, -3.4 + ox * sx * 0.48], 0.16);
      B.add(G.taper(0.8, 8), 'gloss', ['#ffd27a', '#c8a8ff'][k % 2], [x - ox * 0.5, 2.35, -3.4 - ox * sx * 0.3], [0.22, 0.36, 0.22]);
    }
  }
  B.add(G.sphere(), 'soft', '#ffc2d6', [-3.2, 0.9, 1.8], [2.4, 0.5, 1.2], [0, 0.6, 0]);
  B.rod([-4.4, 0, 0.9], [-4.4, 1.4, 0.9], 0.08, 'matte', '#a87a4e');
  B.rod([-2.0, 0, 2.7], [-2.0, 1.4, 2.7], 0.08, 'matte', '#a87a4e');
  for (let k = 0; k < 5; k++) B.add(G.capsule(), 'soft', ['#8fd07a', '#c8e89a'][k % 2], [1.6 + k * 0.4, 2.6, 2.0], [0.1, 0.5, 0.1]);
  B.add(G.cyl(16), 'soft', '#d8a8e8', [2.6, 0.02, 1.6], [2.4, 0.04, 2.0]);
  root.add(bake(B, 'hut-room'));
  const brew = new THREE.Mesh(G.cyl(24), glowMat('#b8ff9a', 0.95));
  brew.position.set(P[0], 1.26, P[2]); brew.scale.set(1.36, 0.04, 1.36);
  root.add(brew);
  const bub = new Motes(G.sphereLo(), glowMat('#d8ffb8', 0.85), Array.from({ length: 14 }, () => ({ x: P[0] - 0.5 + rnd(), y: 1.3, z: P[2] - 0.5 + rnd(), s: 0.12 + rnd() * 0.1 })), rnd, 'rise', 1.6);
  root.add(bub.mesh);
  const lamp = new THREE.Mesh(G.hemi(), glowMat('#ffd8f0', 0.95));
  lamp.position.set(3.8, 2.6, 0.6); lamp.scale.set(0.7, 0.5, 0.7);
  root.add(lamp);
  const frog = frogFriend(0.9);
  frog.root.position.set(2.4, 0, 1.4);
  frog.root.rotation.y = -0.5;
  root.add(frog.root);
  const chest = chestModel('silver');
  chest.position.set(-3.6, 0, -1.0);
  chest.rotation.y = 1.0;
  root.add(chest);
  cols.push({ hx: 1.0, hy: 0.8, hz: 1.0, x: P[0], y: 0.8, z: P[2] });
  return {
    root, R, cols, spawn: [0, 0, R - 1.8], exit: [0, 0, R - 0.8], anchors: { cauldron: [P[0], 0, P[2] + 1.6], chest: [-3.6, 0, -1.0], frog: [2.4, 0, 1.4] },
    backdrop: ROOM_LOOK.hut.backdrop, cam: { dist: 10, pitch: 0.78 }, light: [0, 2.8, 0],
    update(t, s) {
      bub.update(t * 1.4);
      brew.position.y = 1.26 + Math.sin(t * 3) * 0.02;
      frog.animate(t);
      chest.visible = s.chest;
      bub.mesh.visible = true;
      (brew.material as THREE.MeshBasicMaterial).color.set(s.daily ? '#b8ff9a' : '#d8f0c8');
    },
  };
}

// ───────────── ⑦ 거인 나무 속 방 ─────────────
function treeRoom(rnd: () => number): RoomModel {
  const R = ROOM_LOOK.tree.R;
  const root = room('tree');
  const B = new Builder();
  B.add(G.cyl(40), 'matte', '#e3c094', [0, -0.05, 0], [R * 2 + 1, 0.1, R * 2 + 1]);
  for (let k = 1; k <= 4; k++) B.add(G.torus(0.04), 'matte', '#d2ac80', [0, 0.01, 0], [k * 2.8, k * 2.8, k * 2.8], [Math.PI / 2, 0, 0]);
  const cols = roundWalls(B, R, ['#b28a66', '#a8805e', '#bc946e'], { seed: 7, h: 3.6 });
  entranceGlow(B, R, '#fff0c8');
  // 잎 침대 · 도토리 등 · 책장 · 작은 둥근 탁자 + 찻잔 · 창(초록 빛)
  B.add(G.box(0.3), 'matte', '#c49766', [-3.6, 0.3, -2.6], [2.6, 0.6, 1.6], [0, 0.5, 0]);
  B.add(G.sphere(), 'soft', '#a8dc8a', [-3.6, 0.7, -2.6], [2.6, 0.4, 1.6], [0, 0.5, 0]);
  B.add(G.sphere(), 'soft', '#fff3dc', [-4.3, 0.85, -3.1], [0.8, 0.3, 0.5], [0, 0.5, 0]);
  B.add(G.box(0.1), 'matte', '#a8805e', [3.6, 1.2, -3.0], [2.2, 2.4, 0.6], [0, -0.6, 0]);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) B.add(G.box(0.05), 'matte', ['#ff9fc0', '#7fd3ff', '#fff0a8', '#a8dc8a', '#c8a8ff'][(k + r) % 5], [3.6 - 0.8 + k * 0.38 * Math.cos(0.6), 0.55 + r * 0.72, -3.0 + (0.8 - k * 0.38) * Math.sin(0.6) + 0.12], [0.16, 0.5, 0.36], [0, -0.6, 0]);
  B.add(G.cyl(20), 'matte', '#c8955f', [1.2, 0.5, 1.4], [1.6, 0.12, 1.6]);
  B.add(G.cyl(10), 'matte', '#a77650', [1.2, 0.25, 1.4], [0.25, 0.5, 0.25]);
  for (let k = 0; k < 2; k++) B.add(G.taper(1.3, 12), 'gloss', '#fff8ee', [1.0 + k * 0.4, 0.64, 1.4 + k * 0.2], 0.18);
  // 감긴 뿌리 계단(장식)
  for (let k = 0; k < 8; k++) { const a = -2.2 + k * 0.35; B.add(G.box(0.1), 'matte', '#9a7454', [Math.cos(a) * (R - 0.6), 0.2 + k * 0.32, Math.sin(a) * (R - 0.6)], [1.2, 0.18, 0.6], [0, -a, 0]); }
  for (let i = 0; i < 6; i++) { const a = rnd() * Math.PI * 2, r = R * 0.8; B.add(G.sphere(), 'soft', '#9fd88a', [Math.cos(a) * r, 0.05, Math.sin(a) * r], [1.0, 0.25, 0.8]); }
  // 도토리 하루 줍기 바구니
  const A: V3 = [-1.6, 0, -4.2];
  B.add(G.cyl(16), 'soft', '#d9b27c', [A[0], 0.25, A[2]], [1.0, 0.5, 1.0]);
  for (let k = 0; k < 5; k++) { B.add(G.sphere(), 'gloss', '#c88a52', [A[0] + Math.cos(k * 1.3) * 0.25, 0.55, A[2] + Math.sin(k * 1.3) * 0.25], [0.24, 0.28, 0.24]); B.add(G.hemi(), 'matte', '#8a5e40', [A[0] + Math.cos(k * 1.3) * 0.25, 0.62, A[2] + Math.sin(k * 1.3) * 0.25], [0.26, 0.14, 0.26]); }
  root.add(bake(B, 'tree-room'));
  const win = new THREE.Mesh(G.sphere(), glowMat('#d8ffb0', 0.9));
  win.position.set(0, 2.4, -R - 0.2); win.scale.set(1.6, 1.6, 0.2);
  root.add(win);
  const lamps = [[-2.0, 2.6, 0.2], [2.4, 2.4, -1.0]].map(([x, y, z]) => {
    const m = new THREE.Mesh(G.sphere(), glowMat('#ffe0a0', 0.95));
    m.position.set(x, y, z); m.scale.set(0.42, 0.5, 0.42);
    root.add(m);
    return m;
  });
  const owl = owlPlush(0.4);
  owl.root.position.set(-3.0, 0.75, -2.2);
  owl.root.rotation.y = 0.7;
  root.add(owl.root);
  const chest = chestModel('silver');
  chest.position.set(4.0, 0, 1.2);
  chest.rotation.y = -1.5;
  root.add(chest);
  cols.push({ hx: 1.4, hy: 0.6, hz: 1.0, x: -3.6, y: 0.4, z: -2.6 }, { hx: 1.2, hy: 1.2, hz: 0.6, x: 3.6, y: 1.2, z: -3.0 }, { hx: 0.8, hy: 0.5, hz: 0.8, x: 1.2, y: 0.5, z: 1.4 });
  return {
    root, R, cols, spawn: [0, 0, R - 1.8], exit: [0, 0, R - 0.8], anchors: { basket: [A[0], 0, A[2] + 1.2], chest: [4.0, 0, 1.2] },
    backdrop: ROOM_LOOK.tree.backdrop, cam: { dist: 10.5, pitch: 0.76 }, light: [0, 2.8, 0],
    update(t, s) {
      owl.animate(t);
      lamps.forEach((m, i) => { m.position.y = (i ? 2.4 : 2.6) + Math.sin(t * 1.4 + i) * 0.05; });
      chest.visible = s.chest;
    },
  };
}

export function buildRoom(id: RoomId, rnd: () => number): RoomModel {
  switch (id) {
    case 'waterfall': return waterfallRoom(rnd);
    case 'mural': return muralRoom(rnd);
    case 'bubble': return bubbleRoom(rnd);
    case 'dive': return diveRoom(rnd);
    case 'aurora': return auroraRoom(rnd);
    case 'hut': return hutRoom(rnd);
    case 'tree': return treeRoom(rnd);
  }
}
