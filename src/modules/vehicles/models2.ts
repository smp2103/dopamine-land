// P1 탈것 모델 — 수상바이크 · 펭귄 썰매 · 모래 버기 · 깡총카 달 로버 · 반짝 UFO(GDD 3.8 형태 힌트).
// models.ts 와 같은 방식(부품 → 재질별 한 메시로 굽기). 얼굴은 art.ts 의 눈·볼터치(공용 눈 텍스처)를 굽고 난 뒤 붙인다.
// 서치라이트(잠수정)·끌어올림 빔(UFO)은 정점색으로 끝이 흐려지는 더하기 원뿔 — 진짜 조명을 늘리지 않는다(셰이더 다시 짓기 없음).
import * as THREE from 'three';
import { part, live, bake, chubbyWheel, sphere, capsule, cyl, torus, cone, rbox, lathe, tube, bean, stripes } from './kit';
import { addEyes } from '../../core/art';
import type { Model } from './models';

function seatAt(root: THREE.Object3D, x: number, y: number, z: number, name = 'seat') {
  const s = new THREE.Object3D();
  s.position.set(x, y, z);
  s.name = name;
  root.add(s);
  return s;
}
const done = (m: Model): Model => { bake(m.root); return m; };

/** art.ts 눈 + 볼터치(굽지 않는 공용 메시) — 굽기 뒤에 붙인다 */
function artFace(parent: THREE.Object3D, size: number, y: number, z: number, gap?: number) {
  const g = new THREE.Group();
  g.name = 'face';
  parent.add(g);
  addEyes(g, { size, y, z, gap: gap ?? size * 1.5, splay: 0.18 });
  return g;
}

// ───────────── 빛 원뿔(서치라이트·빔) ─────────────

const coneCache = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material }>();
/**
 * 꼭짓점이 원점, +z(또는 -y)로 len 만큼 퍼지는 빛 원뿔. 정점색이 끝으로 갈수록 0 → 더하기 혼합이라 자연스럽게 흐려진다.
 * 지오메트리·재질은 모듈 전역 공유(userData.shared).
 */
export function lightCone(len: number, r: number, color: string, axis: 'z' | '-y', opacity = 0.32): THREE.Mesh {
  const key = `${len}:${r}:${color}:${axis}:${opacity}`;
  let c = coneCache.get(key);
  if (!c) {
    const g = new THREE.ConeGeometry(r, len, 28, 6, true);
    // 꼭짓점(+y) → 원점, 바닥은 -y 쪽 len
    g.translate(0, -len / 2, 0);
    if (axis === 'z') g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), base = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) {
      const d = axis === 'z' ? p.getZ(i) / len : -p.getY(i) / len;
      const k = Math.pow(Math.max(0, 1 - d), 1.6);
      col.set([base.r * k, base.g * k, base.b * k], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.userData.shared = true;
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    mat.userData.shared = true;
    c = { geo: g, mat };
    coneCache.set(key, c);
  }
  const m = new THREE.Mesh(c.geo, c.mat);
  m.name = 'light-cone';
  m.renderOrder = 23;
  m.frustumCulled = false;
  return m;
}

// ───────────── 수상바이크 ─────────────
/** 분홍 + 흰 수상바이크. 원점 = 수면 */
export function jetski(c0 = '#ff8fb8', c1 = '#ffe3ee'): Model {
  const root = new THREE.Group();
  // 선체: 앞이 뾰족한 통통 콩(아래 분홍, 위 흰)
  const hull = bean(0.62, 0.42, 1.35, 0.3, 0.42);
  part(root, hull, 'paint', [c0, c1, 'y', 0.9], [0, 0.12, 0]);
  // 고무 범퍼 띠
  const rim: Array<[number, number, number]> = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2, k = 1 - 0.42 * Math.max(0, Math.cos(a));
    rim.push([Math.sin(a) * 0.6 * k, 0.2, Math.cos(a) * 1.3]);
  }
  part(root, tube(rim, 0.06, 72, true), 'soft', '#ffffff');
  // 위 덮개(앞 콧등) + 바람막이
  part(root, bean(0.42, 0.22, 0.6, 0.5, 0.3), 'paint', ['#ffffff', c1], [0, 0.42, 0.55]);
  part(root, bean(0.32, 0.18, 0.06), 'glass', null, [0, 0.66, 0.42], [-0.6, 0, 0]);
  // 안장(길쭉한 쿠션 — 두 사람도 앉을 만큼)
  part(root, capsule(0.2, 0.7), 'soft', ['#ff6f9a', '#ffa3c0'], [0, 0.52, -0.38], [Math.PI / 2, 0, 0], [1, 0.75, 1]);
  // 핸들 + 손잡이
  part(root, tube([[-0.38, 0.86, 0.24], [-0.2, 0.8, 0.3], [0.2, 0.8, 0.3], [0.38, 0.86, 0.24]], 0.025), 'metal', '#eef2f8');
  part(root, cyl(0.05, 0.06, 0.3, 16), 'paint', '#ffffff', [0, 0.66, 0.3], [-0.35, 0, 0]);
  for (const sx of [-1, 1]) part(root, capsule(0.035, 0.1), 'rubber', '#585a70', [sx * 0.42, 0.87, 0.22], [Math.PI / 2, 0, sx * 0.5]);
  // 옆구리 별 스티커 + 발판
  for (const sx of [-1, 1]) {
    part(root, cyl(0.12, 0.12, 0.02, 5), 'paint', '#ffd75e', [sx * 0.6, 0.22, -0.15], [0, 0, Math.PI / 2]);
    part(root, rbox(0.18, 0.05, 0.8, 0.02, 2), 'rubber', '#6a6c84', [sx * 0.45, 0.3, -0.35]);
  }
  // 뒤 물분사구
  part(root, cyl(0.12, 0.14, 0.18, 24), 'metal', '#dfe5ee', [0, 0.1, -1.32], [Math.PI / 2, 0, 0]);
  const seat = seatAt(root, 0, 0.42, -0.25);
  const seat2 = seatAt(root, 0, 0.42, -0.75, 'seat2');
  const m = done({ root, seat, seat2, wheels: [], spin: [], bits: {}, tail: new THREE.Vector3(0, 0, -1.45) });
  // 콧등 얼굴(art 눈)
  artFace(root, 0.16, 0.36, 1.12, 0.3);
  return m;
}

// ───────────── 펭귄 썰매 ─────────────
/** 앞이 말려 올라간 나무 썰매 + 앞머리에 펭귄 얼굴. 원점 = 바닥 */
export function sled(): Model {
  const root = new THREE.Group();
  // 바닥판(앞이 둥글게 말린 판 — 관을 납작하게)
  const board: Array<[number, number, number]> = [[0, 0.22, -0.85], [0, 0.2, -0.2], [0, 0.2, 0.45], [0, 0.32, 0.78], [0, 0.62, 0.92], [0, 0.82, 0.8]];
  const bg = tube(board, 0.32, 48);
  part(root, bg, 'wood', ['#e8b47e', '#f6d4a4', 'z'], [0, 0, 0], [0, 0, 0], [1.25, 0.18, 1]);
  // 눈 위를 미끄러지는 은색 날 두 개(앞이 말린 관)
  for (const sx of [-1, 1]) {
    part(root, tube([[sx * 0.34, 0.04, -0.85], [sx * 0.34, 0.03, 0.3], [sx * 0.34, 0.12, 0.75], [sx * 0.34, 0.36, 0.9]], 0.035, 32), 'metal', '#dfe8f2');
    for (const z of [-0.55, 0.15]) part(root, cyl(0.025, 0.025, 0.16, 10), 'metal', '#dfe8f2', [sx * 0.34, 0.12, z]);
  }
  // 방석(하늘 체크)
  part(root, bean(0.32, 0.07, 0.42, 0.5), 'soft', ['#8fd3f4', '#cfeeff'], [0, 0.28, -0.3]);
  // 펭귄 머리(앞) — 먹색이 아닌 남색 머리 + 흰 얼굴 + 주황 부리 + 작은 날개
  const head = new THREE.Group();
  head.position.set(0, 0.86, 0.72);
  root.add(head);
  part(head, sphere(0.32, 36, 26), 'paint', ['#4a5f9e', '#6b82c2'], [0, 0, 0], [0, 0, 0], [1, 0.95, 0.9]);
  part(head, sphere(0.27, 32, 24), 'paint', '#fffaf2', [0, -0.03, 0.08], [0, 0, 0], [0.92, 0.85, 0.85]);
  part(head, cone(0.07, 0.14, 24), 'paint', '#ffa24c', [0, -0.04, 0.34], [Math.PI / 2, 0, 0], [1.3, 1, 0.8]);
  for (const sx of [-1, 1]) part(head, bean(0.05, 0.16, 0.1), 'paint', '#4a5f9e', [sx * 0.33, -0.12, -0.02], [0, 0, sx * 0.5]);
  // 털모자(빨강 방울)
  part(head, sphere(0.2, 28, 20), 'soft', ['#ff8a9e', '#ffb3c0'], [0, 0.22, -0.02], [0, 0, 0], [1, 0.55, 1]);
  part(head, sphere(0.08, 20, 14), 'soft', '#ffffff', [0, 0.36, -0.04]);
  // 줄(앞 고리 → 손잡이)
  part(root, tube([[-0.3, 0.42, 0.75], [-0.4, 0.5, 0.2], [-0.38, 0.45, -0.1]], 0.018, 20), 'soft', '#ff8a9e');
  part(root, tube([[0.3, 0.42, 0.75], [0.4, 0.5, 0.2], [0.38, 0.45, -0.1]], 0.018, 20), 'soft', '#ff8a9e');
  const seat = seatAt(root, 0, 0.3, -0.3);
  const m = done({ root, seat, wheels: [], spin: [], bits: {}, tail: new THREE.Vector3(0, 0.05, -0.95) });
  artFace(head, 0.11, 0.06, 0.25, 0.2);
  return m;
}

// ───────────── 모래 버기 ─────────────
/** 살구색 몸통 + 큰 풍선 바퀴 4 + 둥근 안전틀. 원점 = 바닥 */
export function buggy(body = '#ffa86e', accent = '#ff8a7a'): Model {
  const root = new THREE.Group();
  const R = 0.5;
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.78, -0.75], [0.78, -0.75], [-0.74, 0.8], [0.74, 0.8]] as const) wheels.push(chubbyWheel(root, R, 0.42, '#fff1cf', [x, R, z]));
  // 바퀴 사이를 들어 올리는 서스펜션 몸(서스 그룹이 통통 튄다)
  const susp = live(root, [0, 0, 0], 'susp');
  part(susp, bean(0.62, 0.32, 1.05, 0.4, 0.12), 'paint', [body, '#ffcfa6'], [0, 0.78, 0]);
  // 앞 범퍼(통통 관) + 뒤 엔진 상자
  part(susp, capsule(0.1, 0.9), 'paint', accent, [0, 0.62, 1.05], [0, 0, Math.PI / 2]);
  part(susp, rbox(0.7, 0.36, 0.42, 0.14), 'paint', ['#ffffff', '#fff3e6'], [0, 0.88, -0.95]);
  for (const sx of [-1, 1]) part(susp, cyl(0.06, 0.07, 0.2, 20), 'metal', '#f1f4f8', [sx * 0.22, 0.92, -1.2], [Math.PI / 2, 0, 0]);
  // 좌석 + 등받이
  part(susp, bean(0.34, 0.1, 0.34, 0.5), 'soft', '#7a6cb0', [0, 1.04, -0.2]);
  part(susp, bean(0.34, 0.32, 0.12), 'soft', ['#8d78b5', '#b7a3dc'], [0, 1.25, -0.5], [-0.2, 0, 0]);
  // 둥근 안전틀(아치 두 개 + 지붕대)
  part(susp, tube([[-0.55, 1.0, -0.55], [-0.5, 1.7, -0.4], [0, 1.85, -0.35], [0.5, 1.7, -0.4], [0.55, 1.0, -0.55]], 0.045, 40), 'metal', '#ffd75e');
  part(susp, tube([[-0.5, 1.0, 0.35], [-0.45, 1.55, 0.25], [0, 1.66, 0.22], [0.45, 1.55, 0.25], [0.5, 1.0, 0.35]], 0.04, 40), 'metal', '#ffd75e');
  for (const sx of [-1, 1]) part(susp, tube([[sx * 0.5, 1.7, -0.4], [sx * 0.45, 1.6, 0.25]], 0.035), 'metal', '#ffd75e');
  // 핸들
  part(susp, cyl(0.03, 0.03, 0.34, 16), 'metal', '#e8edf5', [0, 1.1, 0.3], [0.9, 0, 0]);
  const steer = live(susp, [0, 1.22, 0.22], 'steer');
  steer.rotation.x = -0.7;
  part(steer, torus(0.15, 0.03, 14, 44), 'rubber', '#585a70', [0, 0, 0], [Math.PI / 2, 0, 0]);
  // 깃발 안테나(모래 언덕에서도 보이게)
  part(susp, tube([[0.5, 1.0, -0.9], [0.52, 1.9, -1.0], [0.53, 2.4, -1.05]], 0.014), 'metal', '#eef2f8');
  part(susp, rbox(0.02, 0.24, 0.36, 0.01, 2), 'soft', accent, [0.53, 2.28, -1.25]);
  // 앞등 두 개
  for (const sx of [-1, 1]) part(susp, sphere(0.08, 20, 14), 'glow', '#fff6cf', [sx * 0.34, 0.92, 0.98], [0, 0, 0], [1, 1, 0.5]);
  const seat = seatAt(susp, 0, 0.98, -0.2);
  const m = done({ root, seat, wheels, spin: [], bits: { susp, steer }, tail: new THREE.Vector3(0, 0.1, -1.3) });
  artFace(susp, 0.21, 0.8, 1.03, 0.36);
  return m;
}

// ───────────── 깡총카 달 로버 ─────────────
/** 바퀴 6 + 접시 안테나 + 토끼 귀 안테나. 원점 = 바닥 */
export function rover(body = '#c9b6f2'): Model {
  const root = new THREE.Group();
  const R = 0.34;
  const wheels: THREE.Object3D[] = [];
  for (const z of [-0.85, 0, 0.85]) for (const sx of [-1, 1]) wheels.push(chubbyWheel(root, R, 0.3, '#ffd0de', [sx * 0.82, R, z]));
  const susp = live(root, [0, 0, 0], 'susp');
  // 바퀴 팔(관)
  for (const z of [-0.85, 0, 0.85]) for (const sx of [-1, 1]) part(susp, tube([[sx * 0.45, 0.72, z * 0.8], [sx * 0.7, 0.5, z], [sx * 0.8, R, z]], 0.035, 12), 'metal', '#dfe6ee');
  // 몸통(통통 상자) + 은빛 배
  part(susp, rbox(1.2, 0.5, 2.0, 0.22), 'paint', [body, '#ffffff'], [0, 0.88, 0]);
  part(susp, rbox(1.0, 0.12, 1.8, 0.06), 'metal', '#dfe6ee', [0, 0.6, 0]);
  // 좌석 + 둥근 유리 앞가리개
  part(susp, bean(0.34, 0.1, 0.34, 0.5), 'soft', '#ff9fb8', [0, 1.18, -0.2]);
  part(susp, bean(0.34, 0.3, 0.12), 'soft', ['#ff9fb8', '#ffd0de'], [0, 1.38, -0.5], [-0.2, 0, 0]);
  part(susp, bean(0.48, 0.24, 0.08), 'glass', null, [0, 1.36, 0.42], [-0.5, 0, 0]);
  // 접시 안테나(뒤, 빙글)
  part(susp, cyl(0.04, 0.05, 0.6, 12), 'metal', '#dfe6ee', [0.35, 1.4, -0.8]);
  const dish = live(susp, [0.35, 1.72, -0.8], 'dish');
  part(dish, lathe([[0.05, 0], [0.3, 0.06], [0.45, 0.16], [0.47, 0.19]], 36), 'metal', '#fffaf2', [0, 0, 0], [-0.6, 0, 0]);
  part(dish, sphere(0.05, 16, 12), 'paint', '#ffd84a', [0, 0.2, 0.12]);
  // 토끼 귀 안테나(앞)
  for (const sx of [-1, 1]) {
    part(susp, capsule(0.06, 0.32), 'paint', ['#ffffff', '#fffaf2'], [sx * 0.22, 1.42, 0.78], [0.25, 0, sx * 0.25]);
    part(susp, capsule(0.03, 0.22), 'soft', '#ffd0de', [sx * 0.22, 1.43, 0.81], [0.25, 0, sx * 0.25]);
  }
  // 옆구리 별 + 앞등
  for (const sx of [-1, 1]) part(susp, cyl(0.15, 0.15, 0.02, 5), 'paint', '#ffd84a', [sx * 0.61, 0.9, 0.1], [0, 0, Math.PI / 2]);
  for (const sx of [-1, 1]) part(susp, sphere(0.07, 20, 14), 'glow', '#fff6cf', [sx * 0.4, 0.95, 1.0], [0, 0, 0], [1, 1, 0.5]);
  const seat = seatAt(susp, 0, 1.12, -0.2);
  const m = done({ root, seat, wheels, spin: [dish], bits: { susp, dish }, tail: new THREE.Vector3(0, 0.15, -1.2) });
  artFace(susp, 0.15, 0.84, 1.01, 0.36);
  return m;
}

// ───────────── 반짝 UFO ─────────────
/** 은 접시 + 분홍 유리 돔 + 둘레 반짝 등. 원점 = 접시 바닥(땅 위에 둥실) */
export function ufo(): Model {
  const root = new THREE.Group();
  const body = live(root, [0, 0, 0], 'body');
  // 접시(위아래 볼록한 회전체)
  const plate = lathe([[0.2, 0.0], [0.9, 0.12], [1.55, 0.3], [1.85, 0.48], [1.8, 0.58], [1.4, 0.72], [0.9, 0.8], [0, 0.82]], 64);
  part(body, plate, 'metal', ['#c9d6e6', '#f4f7fb'], [0, 0, 0]);
  // 테두리 띠(분홍) + 둘레 등 12
  part(body, torus(1.82, 0.07, 14, 96), 'paint', '#ff9fd0', [0, 0.52, 0], [Math.PI / 2, 0, 0]);
  const lights = live(body, [0, 0, 0], 'lights');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    part(lights, sphere(0.09, 16, 12), 'glow', i % 2 ? '#fff3a0' : '#ffc6ef', [Math.cos(a) * 1.62, 0.42, Math.sin(a) * 1.62]);
  }
  // 아래 둥근 받침 3 + 빔 구멍
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    part(body, tube([[Math.cos(a) * 0.7, 0.15, Math.sin(a) * 0.7], [Math.cos(a) * 1.0, -0.15, Math.sin(a) * 1.0]], 0.04, 10), 'metal', '#dfe6ee');
    part(body, sphere(0.1, 16, 12), 'rubber', '#8a8fb0', [Math.cos(a) * 1.02, -0.18, Math.sin(a) * 1.02], [0, 0, 0], [1, 0.6, 1]);
  }
  part(body, cyl(0.32, 0.38, 0.06, 32), 'glow', '#ffd0f0', [0, 0.02, 0]);
  // 분홍 유리 돔 + 꼭대기 안테나 방울
  part(body, sphere(0.95, 40, 24), 'glass', null, [0, 0.8, 0], [0, 0, 0], [1, 0.82, 1]);
  part(body, tube([[0, 1.55, 0], [0.05, 1.85, 0], [0.12, 2.0, 0]], 0.02, 12), 'metal', '#dfe6ee');
  part(body, sphere(0.08, 16, 12), 'glow', '#ff9fd0', [0.13, 2.04, 0]);
  // 돔 안 좌석
  part(body, bean(0.4, 0.1, 0.36, 0.5), 'soft', ['#ff9fd0', '#ffd0ec'], [0, 0.88, -0.1]);
  // 줄무늬 조종판(앞)
  const panel = rbox(0.7, 0.16, 0.18, 0.06);
  stripes(panel, ['#ffd84a', '#9ef0d2', '#ff9fd0'], 6, 0);
  part(body, panel, 'paint', null, [0, 0.95, 0.55], [-0.4, 0, 0]);
  const seat = seatAt(body, 0, 0.88, -0.15);
  const m = done({ root, seat, wheels: [], spin: [lights], bits: { body, lights }, tail: new THREE.Vector3(0, 0.1, -1.6) });
  // 접시 앞 테두리 얼굴
  artFace(body, 0.2, 0.42, 1.72, 0.5);
  // 끌어올림 빔(아래로) — 쓸 때만 보인다
  const beam = lightCone(14, 2.4, '#ffc8f0', '-y', 0.4);
  beam.visible = false;
  body.add(beam);
  m.bits.beam = beam;
  return m;
}
