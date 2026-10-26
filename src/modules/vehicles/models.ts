// 탈것 모델 — 전부 코드로 만든 통통한 장난감 같은 탈것. 앞 = +z, 원점 = 바닥(배는 수면) 가운데.
import * as THREE from 'three';
import { part, live, bake, face, chubbyWheel, sphere, capsule, cyl, torus, cone, rbox, lathe, tube, bean, stripes, colorize } from './kit';

export interface Model {
  root: THREE.Group;
  /** 아바타 발 위치(앉는 자리) */
  seat: THREE.Object3D;
  wheels: THREE.Object3D[];
  /** 프로펠러·페달처럼 도는 것 */
  spin: THREE.Object3D[];
  /** 기타 움직이는 부품 */
  bits: Record<string, THREE.Object3D>;
  /** 뒤쪽(물보라·먼지·불꽃 나오는 곳, 로컬) */
  tail: THREE.Vector3;
}

function seatAt(root: THREE.Object3D, x: number, y: number, z: number) {
  const s = new THREE.Object3D();
  s.position.set(x, y, z);
  s.name = 'seat';
  root.add(s);
  return s;
}

const done = (m: Model): Model => { bake(m.root); return m; };

// ───────────── 자전거 ─────────────
export function bike(frame = '#7fdcc8'): Model {
  const root = new THREE.Group();
  const R = 0.33, WB = 0.54;
  const wheels: THREE.Object3D[] = [];
  for (const z of [-WB, WB]) {
    const w = live(root, [0, R, z], 'wheel');
    part(w, torus(R - 0.045, 0.05, 18, 64), 'rubber', '#5d6074', [0, 0, 0], [0, Math.PI / 2, 0]);
    part(w, torus(R - 0.1, 0.018, 12, 56), 'metal', '#e9eef5', [0, 0, 0], [0, Math.PI / 2, 0]);
    part(w, sphere(0.05, 20, 14), 'paint', frame, [0, 0, 0], [0, 0, 0], [1.6, 1, 1]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      part(w, cyl(0.007, 0.007, (R - 0.1) * 2, 8), 'metal', '#f4f6fa', [0, 0, 0], [a, 0, 0]);
    }
    wheels.push(w);
  }
  // 앞 흙받이(반원 관)
  for (const z of [-WB, WB]) {
    part(root, torus(R + 0.03, 0.035, 12, 40, Math.PI * 0.75), 'paint', frame, [0, R, z], [0, Math.PI / 2, z > 0 ? Math.PI * 0.15 : Math.PI * 0.1], [1, 1, 1.8]);
  }
  const BB: [number, number, number] = [0, 0.3, -0.04], ST: [number, number, number] = [0, 0.72, -0.2], HT: [number, number, number] = [0, 0.8, 0.36];
  const RH: [number, number, number] = [0, R, -WB], FH: [number, number, number] = [0, R, WB];
  const T = 0.034;
  part(root, tube([BB, [0, 0.5, -0.12], ST], T), 'paint', frame);
  part(root, tube([ST, [0, 0.55, -0.4], RH], T * 0.8), 'paint', frame);
  part(root, tube([BB, [0, 0.31, -0.3], RH], T * 0.8), 'paint', frame);
  part(root, tube([BB, [0, 0.45, 0.16], [0, 0.66, 0.3], HT], T), 'paint', frame); // 내려앉은 탑튜브(미믹스)
  part(root, tube([HT, [0, 0.62, 0.44], [0, 0.45, 0.52], FH], T * 0.85), 'paint', frame);
  part(root, cyl(0.045, 0.045, 0.14, 24), 'paint', frame, [0, 0.82, 0.37], [0.25, 0, 0]);
  // 핸들(둥근 곡선) + 분홍 손잡이 + 종
  part(root, tube([[-0.3, 0.98, 0.22], [-0.14, 0.92, 0.36], [0, 0.9, 0.38], [0.14, 0.92, 0.36], [0.3, 0.98, 0.22]], 0.02), 'metal', '#eef2f8');
  part(root, tube([[0, 0.88, 0.37], [0, 0.92, 0.38]], 0.025), 'metal', '#eef2f8');
  for (const sx of [-1, 1]) part(root, capsule(0.032, 0.09), 'soft', '#ff9fbf', [sx * 0.3, 0.98, 0.21], [Math.PI / 2, 0, sx * 0.5]);
  part(root, lathe([[0.05, 0], [0.048, 0.02], [0.035, 0.04], [0, 0.05]], 24), 'metal', '#ffd75e', [0.16, 0.93, 0.36]);
  // 안장(통통한 쿠션)
  part(root, bean(0.11, 0.055, 0.17, 0.4), 'soft', ['#a8705a', '#d6977c'], [0, 0.79, -0.22]);
  // 앞 바구니 + 꽃
  const bk = rbox(0.34, 0.22, 0.26, 0.06, 5);
  part(root, bk, 'wood', ['#d9a46b', '#f3cf96'], [0, 0.88, 0.58]);
  part(root, torus(0.15, 0.02, 10, 40), 'wood', '#c88d55', [0, 0.995, 0.58], [Math.PI / 2, 0, 0], [1.1, 0.85, 1]);
  const fl = ['#ff8fb2', '#ffd36b', '#ffffff', '#b99cff'];
  for (let i = 0; i < 5; i++) {
    const a = i * 2.3;
    part(root, sphere(0.055, 20, 14), 'soft', fl[i % 4], [Math.cos(a) * 0.08, 1.02 + (i % 2) * 0.02, 0.58 + Math.sin(a) * 0.06]);
  }
  part(root, sphere(0.06, 20, 14), 'soft', '#9be27a', [0.09, 1.0, 0.52]);
  // 앞등
  part(root, cyl(0.05, 0.045, 0.06, 24), 'paint', '#ffffff', [0, 0.78, 0.46], [Math.PI / 2, 0, 0]);
  part(root, sphere(0.04, 20, 14), 'glow', '#fff6cf', [0, 0.78, 0.49], [0, 0, 0], [1, 1, 0.5]);
  // 페달(크랭크)
  const crank = live(root, BB, 'crank');
  part(crank, cyl(0.06, 0.06, 0.06, 28), 'metal', '#e9eef5', [0, 0, 0], [0, 0, Math.PI / 2]);
  for (const sx of [-1, 1]) {
    part(crank, rbox(0.02, 0.16, 0.03, 0.01, 2), 'metal', '#dfe5ee', [sx * 0.06, sx * 0.07, 0]);
    part(crank, rbox(0.1, 0.025, 0.06, 0.012, 2), 'rubber', '#585a70', [sx * 0.11, sx * 0.15, 0]);
  }
  // 받침대 + 뒤 짐받이
  part(root, tube([[0, 0.66, -0.3], [0, 0.66, -0.55]], 0.016), 'metal', '#eef2f8');
  part(root, rbox(0.22, 0.03, 0.26, 0.01, 2), 'paint', frame, [0, 0.69, -0.45]);
  const seat = seatAt(root, 0, 0.5, -0.12);
  return done({ root, seat, wheels, spin: [crank], bits: {}, tail: new THREE.Vector3(0, 0.05, -0.85) });
}

// ───────────── 스쿠터 ─────────────
export function scooter(body = '#ffb3a7'): Model {
  const root = new THREE.Group();
  const R = 0.23;
  const wheels = [chubbyWheel(root, R, 0.16, '#fff3e6', [0, R, -0.55]), chubbyWheel(root, R, 0.16, '#fff3e6', [0, R, 0.55])];
  // 뒤 몸통(둥근 엉덩이)
  part(root, bean(0.3, 0.26, 0.4, 0.2), 'paint', [body, '#ffd9cf'], [0, 0.5, -0.42]);
  // 발판
  part(root, rbox(0.34, 0.07, 0.62, 0.035), 'paint', '#fff3e6', [0, 0.28, 0.02]);
  // 앞 방패(곡면)
  const shield = bean(0.27, 0.42, 0.12, 0, 0);
  part(root, shield, 'paint', [body, '#ffd9cf'], [0, 0.62, 0.42], [-0.18, 0, 0]);
  // 앞 흙받이
  part(root, bean(0.17, 0.12, 0.27), 'paint', body, [0, 0.42, 0.56]);
  // 핸들 기둥 + 머리(헤드램프 얼굴)
  part(root, cyl(0.045, 0.05, 0.4, 24), 'paint', '#fff3e6', [0, 0.95, 0.44], [-0.25, 0, 0]);
  part(root, bean(0.22, 0.12, 0.13), 'paint', [body, '#ffe6df'], [0, 1.15, 0.5]);
  part(root, cyl(0.075, 0.075, 0.05, 32), 'metal', '#f2f4f8', [0, 1.16, 0.62], [Math.PI / 2, 0, 0]);
  part(root, sphere(0.065, 24, 16), 'glow', '#fff4c8', [0, 1.16, 0.64], [0, 0, 0], [1, 1, 0.45]);
  part(root, tube([[-0.34, 1.2, 0.42], [-0.15, 1.18, 0.5], [0.15, 1.18, 0.5], [0.34, 1.2, 0.42]], 0.02), 'metal', '#eef2f8');
  for (const sx of [-1, 1]) {
    part(root, capsule(0.035, 0.09), 'soft', '#8fd0ff', [sx * 0.36, 1.2, 0.4], [Math.PI / 2, 0, sx * 0.4]);
    // 둥근 백미러
    part(root, tube([[sx * 0.2, 1.2, 0.48], [sx * 0.24, 1.36, 0.45]], 0.01), 'metal', '#eef2f8');
    part(root, cyl(0.05, 0.05, 0.02, 24), 'metal', '#dfe8f2', [sx * 0.25, 1.4, 0.45], [Math.PI / 2, 0, 0]);
  }
  // 앞 방패에 얼굴
  face(root, [0, 0.66, 0.535], 0.5, { gap: 0.3 });
  // 안장 + 뒤 짐칸(하트 상자)
  part(root, bean(0.2, 0.08, 0.32, 0.4), 'soft', ['#7a5a62', '#9a7480'], [0, 0.78, -0.36]);
  part(root, rbox(0.32, 0.22, 0.28, 0.08), 'paint', ['#fff3e6', '#ffffff'], [0, 0.9, -0.82]);
  part(root, sphere(0.06, 20, 14), 'paint', '#ff8fb2', [-0.03, 0.92, -0.67], [0, 0, 0.7], [1, 1, 0.4]);
  part(root, sphere(0.06, 20, 14), 'paint', '#ff8fb2', [0.03, 0.92, -0.67], [0, 0, -0.7], [1, 1, 0.4]);
  part(root, cone(0.045, 0.06, 20), 'paint', '#ff8fb2', [0, 0.875, -0.665], [Math.PI, 0, 0], [1, 1, 0.45]);
  // 미등
  part(root, sphere(0.05, 20, 14), 'glow', '#ff8a8a', [0, 0.6, -0.8], [0, 0, 0], [1.4, 0.8, 0.5]);
  const seat = seatAt(root, 0, 0.52, -0.3);
  return done({ root, seat, wheels, spin: [], bits: {}, tail: new THREE.Vector3(0, 0.08, -0.9) });
}

// ───────────── 카트(초로Q풍) ─────────────
export function kart(body = '#ff9cc0', accent = '#ffe27a'): Model {
  const root = new THREE.Group();
  const R = 0.28;
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.62, -0.55], [0.62, -0.55], [-0.6, 0.62], [0.6, 0.62]] as const) wheels.push(chubbyWheel(root, z < 0 ? R * 1.08 : R, 0.24, accent, [x, z < 0 ? R * 1.08 : R, z]));
  // 몸통: 통통한 콩
  part(root, bean(0.68, 0.36, 1.0, 0.35, 0.08), 'paint', [body, '#ffd6e6'], [0, 0.52, 0.02]);
  // 범퍼
  part(root, capsule(0.09, 0.85), 'paint', '#ffffff', [0, 0.3, 0.98], [0, 0, Math.PI / 2]);
  part(root, capsule(0.09, 0.85), 'paint', '#ffffff', [0, 0.32, -0.95], [0, 0, Math.PI / 2]);
  // 운전석 파인 자리(어두운 색 쿠션) + 등받이
  part(root, bean(0.36, 0.1, 0.42, 0.5), 'soft', '#6e5b8f', [0, 0.82, -0.18]);
  part(root, bean(0.36, 0.36, 0.14), 'soft', ['#8d78b5', '#b7a3dc'], [0, 1.0, -0.52], [-0.2, 0, 0]);
  // 핸들
  part(root, cyl(0.03, 0.03, 0.34, 16), 'metal', '#e8edf5', [0, 0.95, 0.3], [0.9, 0, 0]);
  const wheel = live(root, [0, 1.08, 0.2], 'steer');
  wheel.rotation.x = -0.7;
  part(wheel, torus(0.15, 0.03, 14, 44), 'rubber', '#585a70', [0, 0, 0], [Math.PI / 2, 0, 0]);
  part(wheel, sphere(0.05, 20, 14), 'paint', accent, [0, 0, 0], [0, 0, 0], [1, 0.5, 1]);
  // 앞 헤드라이트 눈 얼굴
  face(root, [0, 0.64, 1.0], 0.9, { gap: 0.22 });
  // 별 달린 안테나
  part(root, tube([[0.42, 0.8, -0.6], [0.45, 1.3, -0.7], [0.47, 1.55, -0.78]], 0.012), 'metal', '#eef2f8');
  part(root, sphere(0.07, 24, 16), 'paint', accent, [0.47, 1.6, -0.79]);
  // 뒤 배기구(둥근)
  for (const sx of [-1, 1]) part(root, cyl(0.06, 0.07, 0.16, 24), 'metal', '#f1f4f8', [sx * 0.32, 0.32, -1.0], [Math.PI / 2, 0, 0]);
  // 옆구리 숫자 동그라미
  for (const sx of [-1, 1]) part(root, cyl(0.17, 0.17, 0.02, 40), 'paint', '#ffffff', [sx * 0.66, 0.55, -0.05], [0, 0, Math.PI / 2], [1, 1, 1]);
  for (const sx of [-1, 1]) part(root, sphere(0.07, 24, 16), 'paint', accent, [sx * 0.675, 0.55, -0.05], [0, 0, 0], [0.3, 1, 1]);
  const seat = seatAt(root, 0, 0.62, -0.2);
  return done({ root, seat, wheels, spin: [], bits: { steer: wheel }, tail: new THREE.Vector3(0, 0.1, -1.2) });
}

// ───────────── 배 공용 선체 ─────────────
function hull(root: THREE.Object3D, L: number, W: number, H: number, c0: string, c1: string, deck: string) {
  // 선체: 아래가 둥근 콩, 앞이 살짝 좁다(뱃머리)
  const g = bean(W, H, L, 0, 0.32);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > H * 0.25) p.setY(i, H * 0.25 + (y - H * 0.25) * 0.12); // 윗면은 납작한 갑판
  }
  g.computeVertexNormals();
  part(root, g, 'paint', [c0, c1, 'y', 0.8], [0, 0, 0]);
  // 갑판 테두리(도톰한 고무 범퍼)
  const rim: Array<[number, number, number]> = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const z = Math.cos(a) * L * 0.97;
    const k = 1 - 0.32 * Math.max(0, Math.cos(a));
    rim.push([Math.sin(a) * W * 0.97 * k, H * 0.27, z]);
  }
  part(root, tube(rim, H * 0.09, 80, true), 'soft', deck);
}

// ───────────── 돛단배 ─────────────
export function sailboat(): Model {
  const root = new THREE.Group();
  hull(root, 1.9, 0.95, 0.62, '#4f9fe8', '#bfe4ff', '#ffffff');
  part(root, rbox(1.4, 0.08, 2.4, 0.04, 3), 'wood', ['#e0b07a', '#f1cd98', 'z'], [0, 0.17, -0.1]);
  // 돛대
  part(root, cyl(0.05, 0.06, 4.0, 20), 'wood', ['#c98e57', '#e8b27c'], [0, 2.15, 0.35]);
  part(root, sphere(0.09, 20, 14), 'paint', '#ffd75e', [0, 4.18, 0.35]);
  part(root, cyl(0.035, 0.035, 2.1, 16), 'wood', '#d9a26b', [0, 0.85, -0.6], [Math.PI / 2, 0, 0]);
  // 돛: 볼록하게 바람을 머금은 삼각형(줄무늬)
  const sailG = (() => {
    const N = 14, M = 18;
    const pos: number[] = [], idx: number[] = [];
    for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
      const v = j / M, u = i / N;
      const zz = -u * 1.85 * (1 - v * 0.95);
      const yy = 0.95 + v * 3.0;
      const belly = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.1 + 0.05)) * 0.38;
      pos.push(belly, yy, zz);
    }
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const sail = live(root, [0, 0, 0.3], 'sail');
  const sg = sailG.clone();
  // 가로 줄무늬(흰·분홍)
  {
    const p = sg.attributes.position, out = new Float32Array(p.count * 3), a = new THREE.Color('#ffffff'), b = new THREE.Color('#ff9fbf'), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const band = Math.floor((p.getY(i) - 0.95) / 0.6); c.copy(band % 2 ? b : a); out.set([c.r, c.g, c.b], i * 3); }
    sg.setAttribute('color', new THREE.BufferAttribute(out, 3));
  }
  part(sail, sg, 'soft', null);
  // 앞쪽 작은 돛(지브)
  const jib = sailG.clone().scale(0.8, 0.75, -0.5).translate(0, -0.1, 0);
  colorize(jib, '#fff7d6');
  part(sail, jib, 'soft', null, [-0.02, 0, 0.1]);
  // 뒷면도 보이게: 반대 방향 복제
  const back = sg.clone();
  { const ix = back.index!.array as Uint32Array | Uint16Array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } back.computeVertexNormals(); }
  part(sail, back.translate(-0.01, 0, 0), 'soft', null);
  // 깃발
  part(root, rbox(0.02, 0.22, 0.4, 0.01, 2), 'soft', '#ff6f91', [0, 4.05, 0.12]);
  // 구명 튜브(빨강·흰)
  const ring = torus(0.22, 0.07, 16, 48);
  stripes(ring, ['#ff6f7f', '#ffffff'], 8, 0);
  part(root, ring, 'soft', null, [0.97, 0.15, -0.6], [0, Math.PI / 2, 0], [1, 1, 1]);
  // 뱃머리 얼굴
  face(root, [0, -0.02, 1.52], 0.95, { gap: 0.28, rotY: 0 });
  const seat = seatAt(root, 0, 0.2, -0.85);
  return done({ root, seat, wheels: [], spin: [], bits: { sail }, tail: new THREE.Vector3(0, 0, -1.9) });
}

// ───────────── 모터보트 ─────────────
export function motorboat(c0 = '#ff8a9e', c1 = '#ffe1e8'): Model {
  const root = new THREE.Group();
  hull(root, 1.75, 0.82, 0.55, c0, c1, '#ffffff');
  part(root, rbox(1.2, 0.07, 2.0, 0.035, 3), 'wood', ['#e0b07a', '#f1cd98', 'z'], [0, 0.15, -0.15]);
  // 앞 덮개 + 유리 바람막이
  part(root, bean(0.72, 0.22, 0.75, 0.6, 0.2), 'paint', [c1, '#ffffff'], [0, 0.18, 0.75]);
  const ws = bean(0.62, 0.32, 0.12);
  part(root, ws, 'glass', null, [0, 0.45, 0.25], [-0.45, 0, 0]);
  part(root, torus(0.5, 0.03, 10, 48, Math.PI), 'metal', '#eef2f8', [0, 0.3, 0.27], [-0.45, 0, 0], [1.25, 0.95, 1]);
  // 좌석(통통한 쿠션 두 개)
  part(root, bean(0.3, 0.12, 0.26, 0.5), 'soft', '#7cc8ff', [0, 0.3, -0.35]);
  part(root, bean(0.3, 0.26, 0.1), 'soft', ['#5fb4f0', '#a6dcff'], [0, 0.48, -0.6], [-0.15, 0, 0]);
  // 핸들
  part(root, torus(0.12, 0.025, 12, 36), 'rubber', '#585a70', [0, 0.55, 0.12], [-0.9, 0, 0]);
  // 뒤 선외기
  part(root, rbox(0.36, 0.5, 0.36, 0.12), 'paint', ['#ffffff', '#f6f6ff'], [0, 0.42, -1.72]);
  part(root, cyl(0.06, 0.06, 0.6, 16), 'metal', '#e9eef5', [0, 0.0, -1.78]);
  const prop = live(root, [0, -0.32, -1.8], 'prop');
  for (let i = 0; i < 3; i++) part(prop, bean(0.03, 0.13, 0.05), 'metal', '#ffd75e', [0, 0, 0], [0, 0, (i / 3) * Math.PI * 2], 1).geometry.translate(0, 0.12, 0);
  // 뱃머리 얼굴(양옆을 보는 대신 앞으로)
  face(root, [0, 0.0, 1.4], 0.9, { gap: 0.27 });
  // 옆구리 하트 무늬
  for (const sx of [-1, 1]) part(root, sphere(0.09, 20, 14), 'paint', '#ffffff', [sx * 0.8, 0.0, 0.3], [0, 0, 0], [0.25, 1, 1]);
  const seat = seatAt(root, 0, 0.3, -0.35);
  return done({ root, seat, wheels: [], spin: [prop], bits: {}, tail: new THREE.Vector3(0, 0, -1.9) });
}

// ───────────── 잠수정 ─────────────
export function submarine(): Model {
  const root = new THREE.Group();
  const yc = 0.7;
  part(root, bean(0.95, 0.9, 1.45, 0, 0.05), 'paint', ['#ffb820', '#ffe866'], [0, yc, 0]);
  // 앞 큰 유리창(돔)
  part(root, sphere(0.55, 36, 24), 'glass', null, [0, yc + 0.18, 1.05], [0, 0, 0], [1, 0.9, 0.6]);
  part(root, torus(0.55, 0.06, 14, 56), 'metal', '#ffe9a6', [0, yc + 0.18, 1.05], [0, 0, 0], [1, 0.9, 1]);
  // 옆 둥근 창
  for (const sx of [-1, 1]) for (const z of [-0.35, 0.25]) {
    part(root, torus(0.15, 0.04, 12, 40), 'metal', '#f4f6fa', [sx * 0.9, yc + 0.08, z], [0, Math.PI / 2, 0]);
    part(root, cyl(0.15, 0.15, 0.03, 32), 'glass', null, [sx * 0.9, yc + 0.08, z], [0, 0, Math.PI / 2]);
  }
  // 위 탑 + 잠망경
  part(root, rbox(0.55, 0.45, 0.8, 0.22), 'paint', ['#ffb43a', '#ffd86e'], [0, yc + 0.95, -0.1]);
  part(root, tube([[0.12, yc + 1.15, 0.05], [0.12, yc + 1.6, 0.05], [0.12, yc + 1.68, 0.12], [0.12, yc + 1.68, 0.28]], 0.045), 'metal', '#9fb3c8');
  part(root, cyl(0.07, 0.07, 0.08, 20), 'glass', null, [0.12, yc + 1.68, 0.32], [Math.PI / 2, 0, 0]);
  // 꼬리 지느러미 + 프로펠러
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const fin = rbox(0.06, 0.42, 0.4, 0.03, 3);
    const m = part(root, fin, 'paint', '#ff8a5c', [0, yc, -1.3], [0, 0, a]);
    m.geometry.translate(0, 0.42, 0);
  }
  part(root, cone(0.22, 0.4, 32), 'paint', '#ffb43a', [0, yc, -1.55], [-Math.PI / 2, 0, 0]);
  const prop = live(root, [0, yc, -1.78], 'prop');
  for (let i = 0; i < 4; i++) part(prop, bean(0.04, 0.2, 0.07), 'metal', '#c9d6e6', [0, 0, 0], [0, 0, (i / 4) * Math.PI * 2]).geometry.translate(0, 0.19, 0);
  part(prop, sphere(0.07, 20, 14), 'paint', '#ff8a5c');
  // 얼굴(유리창 아래)
  face(root, [0, yc - 0.3, 1.3], 0.95, { gap: 0.32 });
  // 앞 조명(더듬이처럼)
  for (const sx of [-1, 1]) {
    part(root, tube([[sx * 0.3, yc + 0.75, 0.8], [sx * 0.4, yc + 1.05, 1.0], [sx * 0.42, yc + 1.12, 1.1]], 0.025), 'metal', '#c9d6e6');
    part(root, sphere(0.08, 20, 14), 'glow', '#fff3b0', [sx * 0.42, yc + 1.15, 1.13]);
  }
  // 바닥 스키
  for (const sx of [-1, 1]) part(root, capsule(0.05, 1.4), 'metal', '#c9d6e6', [sx * 0.45, 0.05, 0], [Math.PI / 2, 0, 0]);
  const seat = seatAt(root, 0, yc + 0.95, -0.2);
  return done({ root, seat, wheels: [], spin: [prop], bits: {}, tail: new THREE.Vector3(0, yc, -1.9) });
}

// ───────────── 열기구 ─────────────
export function balloon(): Model {
  const root = new THREE.Group();
  // 바구니
  part(root, lathe([[0.62, 0], [0.7, 0.05], [0.74, 0.5], [0.78, 0.86], [0, 0.86]], 40), 'wood', ['#c98e57', '#f0c890'], [0, 0, 0]);
  // 바구니 결(가로 띠)
  for (const y of [0.25, 0.5]) part(root, torus(0.73 + y * 0.06, 0.025, 8, 48), 'wood', '#b57c48', [0, y, 0], [Math.PI / 2, 0, 0]);
  part(root, torus(0.79, 0.07, 14, 56), 'soft', '#a86f45', [0, 0.88, 0], [Math.PI / 2, 0, 0]);
  // 줄 4가닥
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    part(root, tube([[Math.cos(a) * 0.7, 0.9, Math.sin(a) * 0.7], [Math.cos(a) * 0.95, 2.4, Math.sin(a) * 0.95], [Math.cos(a) * 1.3, 3.5, Math.sin(a) * 1.3]], 0.018, 12), 'matte', '#f3e7d3');
  }
  // 버너
  part(root, cyl(0.22, 0.18, 0.25, 24), 'metal', '#c9d6e6', [0, 2.5, 0]);
  const flame = live(root, [0, 2.75, 0], 'flame');
  part(flame, lathe([[0.12, 0], [0.14, 0.12], [0.08, 0.35], [0, 0.5]], 24), 'flame', ['#ff9d2e', '#fff3a0']);
  // 풍선: 아래가 좁은 물방울(줄무늬 파스텔)
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = -Math.PI / 2 + t * Math.PI;
    const s = Math.sin(a), c = Math.cos(a);
    const pinch = s < 0 ? 1 - 0.55 * Math.pow(-s, 1.3) : 1;
    pts.push([c * 3.2 * pinch + (s < -0.9 ? 0.4 : 0), 6.6 + s * 3.6]);
  }
  pts[0] = [0.0, 3.05];
  pts[1] = [0.85, 3.12];
  const env = lathe(pts, 64);
  // 아래 치마(진한 천 띠)
  part(root, lathe([[0.62, 2.95], [0.72, 3.0], [0.95, 3.35], [1.0, 3.45]], 48), 'soft', ['#d98aa8', '#ffb3cc'], [0, 0, 0]);
  stripes(env, ['#ff9fbf', '#fff1a8', '#9fe0d0', '#b9a8ff', '#ffc59a', '#a8d8ff'], 12, 0.18);
  part(root, env, 'soft', null);
  // 꼭대기 단추
  part(root, sphere(0.7, 32, 20), 'soft', '#ffffff', [0, 10.15, 0], [0, 0, 0], [1, 0.35, 1]);
  // 풍선 얼굴(앞)
  face(root, [0, 6.4, 3.02], 2.8, { gap: 0.3 });
  // 모래주머니
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    part(root, bean(0.13, 0.17, 0.13), 'soft', '#e8d3ae', [Math.cos(a) * 0.82, 0.55, Math.sin(a) * 0.82]);
  }
  const seat = seatAt(root, 0, 0.22, 0);
  return done({ root, seat, wheels: [], spin: [], bits: { flame }, tail: new THREE.Vector3(0, 0, -1) });
}

// ───────────── 프로펠러 비행기 ─────────────
export function plane(c = '#8fd3ff'): Model {
  const root = new THREE.Group();
  // 기체 전체 1.25배(좌석은 root 에 — 플레이어 크기는 그대로, 기체가 커 보이게)
  const K = 1.25;
  const b = new THREE.Group();
  b.scale.setScalar(K);
  root.add(b);
  const yc = 1.05;
  // 통통한 동체
  part(b, bean(0.68, 0.66, 1.9, 0, 0.12), 'paint', [c, '#e6f6ff'], [0, yc, 0]);
  // 꼬리 쪽으로 가늘어지는 몸
  part(b, lathe([[0.56, 0], [0.5, 0.25], [0.3, 0.85], [0.13, 1.3], [0, 1.34]], 40), 'paint', [c, '#d6f0ff'], [0, yc + 0.05, -1.2], [-Math.PI / 2 - 0.08, 0, 0]);
  // 날개(둥근 끝 캡 + 분홍 줄무늬)
  for (const sx of [-1, 1]) {
    part(b, rbox(2.3, 0.16, 0.95, 0.08), 'paint', sx > 0 ? ['#fff6e0', '#ffffff', 'x'] : ['#ffffff', '#fff6e0', 'x'], [sx * 1.35, yc - 0.15, 0.2], [0, 0, sx * 0.06]);
    part(b, sphere(0.5, 32, 24), 'paint', ['#ff9fbf', '#ffd0e0'], [sx * 2.5, yc - 0.08, 0.2], [0, 0, 0], [0.26, 0.2, 1]);
    for (const off of [1.9, 2.18]) part(b, rbox(0.13, 0.19, 0.98, 0.05), 'paint', '#ff8fb5', [sx * off, yc - 0.15 + (off - 1.35) * 0.06, 0.2], [0, 0, sx * 0.06]);
    // 바퀴(착륙)
    part(b, tube([[sx * 0.45, yc - 0.45, 0.6], [sx * 0.55, 0.32, 0.65]], 0.04), 'metal', '#e9eef5');
  }
  const wheels = [chubbyWheel(b, 0.26, 0.18, '#ffd75e', [-0.6, 0.26, 0.65]), chubbyWheel(b, 0.26, 0.18, '#ffd75e', [0.6, 0.26, 0.65])];
  part(b, sphere(0.12, 20, 14), 'rubber', '#585a70', [0, 0.38, -2.25]);
  // 꼬리 날개
  part(b, rbox(1.5, 0.1, 0.55, 0.05), 'paint', '#ffffff', [0, yc + 0.32, -2.35]);
  const vt = rbox(0.1, 0.8, 0.6, 0.05);
  part(b, vt, 'paint', ['#ff9fbf', '#ffc6d8'], [0, yc + 0.75, -2.4], [0.25, 0, 0]);
  // 조종석 테두리 + 투명 바람막이(앞쪽으로 둥글게 휜 유리)
  part(b, torus(0.42, 0.05, 12, 48), 'paint', '#ffffff', [0, yc + 0.5, 0.05], [Math.PI / 2 + 0.25, 0, 0], [0.92, 0.98, 1]);
  const ws = new THREE.SphereGeometry(0.5, 32, 12, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.22, Math.PI * 0.28);
  part(b, ws, 'glass', null, [0, yc + 0.42, 0.12], [0, 0, 0], [1, 1.1, 1]);
  part(b, tube(Array.from({ length: 13 }, (_, i) => { const a = Math.PI * (0.18 + 0.64 * i / 12); return [Math.cos(a) * -0.5 * Math.sin(Math.PI * 0.5), 0.36, Math.sin(a) * 0.5 * Math.sin(Math.PI * 0.5)] as [number, number, number]; }), 0.025, 24), 'paint', '#ffd75e', [0, yc + 0.42, 0.12]);
  // 기수: 둥근 카울(앞면에 얼굴) + 프로펠러
  part(b, cyl(0.7, 0.68, 0.3, 48), 'paint', '#ffffff', [0, yc, 1.75], [Math.PI / 2, 0, 0]);
  part(b, cone(0.2, 0.3, 32), 'paint', '#ffd75e', [0, yc + 0.1, 2.05], [Math.PI / 2, 0, 0]);
  const prop = live(b, [0, yc + 0.1, 1.98], 'prop');
  for (let i = 0; i < 3; i++) part(prop, bean(0.06, 0.5, 0.03), 'paint', ['#ffffff', '#ff9fbf'], [0, 0, 0], [0, 0, (i / 3) * Math.PI * 2]).geometry.translate(0, 0.45, 0);
  // 얼굴: 카울 앞면 아래쪽 — 카트와 같은 큰 눈·하이라이트 2개·볼터치
  face(b, [0, yc - 0.2, 1.92], 1.3, { gap: 0.26 });
  // 별 무늬
  for (const sx of [-1, 1]) part(b, cyl(0.2, 0.2, 0.02, 5), 'paint', '#ffd75e', [sx * 1.6, yc - 0.06, 0.2], [0, 0, 0], [1, 1, 1]);
  // 머플러 리본(조종석 뒤로 물결치며 휘날림 — live 그룹)
  const scarf = live(b, [0.12, yc + 0.58, -0.32], 'scarf');
  const sp: Array<[number, number, number]> = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; sp.push([0.18 * t + Math.sin(t * 9) * 0.06 * t, Math.sin(t * 7) * 0.07 * t + 0.1 * t, -t * 1.15]); }
  part(scarf, tube(sp, 0.06, 32), 'soft', ['#ff6f8b', '#ffa3b8']).scale.set(1.6, 0.45, 1);
  part(scarf, sphere(0.1, 24, 16), 'soft', '#ff6f8b', [0, 0, 0]);
  const seat = seatAt(root, 0, (yc + 0.05) * K, -0.2 * K);
  return done({ root, seat, wheels, spin: [prop], bits: { scarf }, tail: new THREE.Vector3(0, yc * K, -2.6 * K) });
}

// ───────────── 로켓 ─────────────
export function rocket(): Model {
  const root = new THREE.Group();
  // 발사대(둥근 받침)
  part(root, lathe([[3.6, 0], [3.7, 0.3], [3.5, 0.55], [0, 0.6]], 64), 'paint', ['#d6dbe8', '#f3f5fb'], [0, 0, 0]);
  part(root, torus(3.0, 0.08, 10, 80), 'glow', '#ffd36b', [0, 0.62, 0], [Math.PI / 2, 0, 0]);
  const body = live(root, [0, 0.6, 0], 'rocket');
  // 몸통: 통통한 탄환(흰 → 분홍)
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const y = t * 9.5;
    const r = 1.35 * (t < 0.12 ? 0.82 + t * 1.5 : t < 0.6 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.6) / 0.4, 2))));
    prof.push([r, y + 0.9]);
  }
  prof.push([0, 10.4]);
  part(body, lathe(prof, 56), 'paint', ['#ffc2d4', '#fffafc', 'y', 0.7], [0, 0, 0]);
  // 물방울 무늬
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4, y = 3.6 + (i % 5) * 0.62;
    part(body, sphere(0.2, 24, 16), 'paint', ['#ffe27a', '#b9e6ff', '#c9b6ff'][i % 3] as string, [Math.sin(a) * 1.33, y, Math.cos(a) * 1.33], [0, a, 0], [1, 1, 0.25]);
  }
  // 코(빨강)
  part(body, sphere(0.55, 32, 20), 'paint', '#ff6f8b', [0, 10.2, 0], [0, 0, 0], [1, 0.7, 1]);
  // 띠
  part(body, torus(1.36, 0.16, 14, 72), 'paint', '#7cc8ff', [0, 3.0, 0], [Math.PI / 2, 0, 0]);
  part(body, torus(1.3, 0.16, 14, 72), 'paint', '#7cc8ff', [0, 7.4, 0], [Math.PI / 2, 0, 0], [1, 1, 1]);
  // 창문(동그란)
  part(body, torus(0.55, 0.12, 16, 56), 'metal', '#ffd75e', [0, 6.0, 1.3], [0, 0, 0]);
  part(body, sphere(0.52, 32, 20), 'glass', null, [0, 6.0, 1.22], [0, 0, 0], [1, 1, 0.35]);
  // 얼굴(창 아래)
  face(body, [0, 4.35, 1.38], 2.0, { gap: 0.32 });
  // 지느러미 3장(통통한 곡선)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.quadraticCurveTo(1.6, -0.2, 1.7, -1.4); s.quadraticCurveTo(1.0, -0.9, 0, -0.9); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 5, curveSegments: 24 });
    g.translate(0, 0, -0.09);
    const m = part(body, g, 'paint', ['#ff6f8b', '#ffa3b8'], [Math.sin(a) * 1.2, 3.1, Math.cos(a) * 1.2], [0, a - Math.PI / 2, 0]);
    m.rotation.y = a - Math.PI / 2;
  }
  // 분사구
  part(body, lathe([[0.75, 0.0], [0.95, 0.3], [1.0, 0.95], [0.6, 1.0]], 48), 'metal', '#c9d6e6', [0, 0, 0]);
  const flame = live(body, [0, 0.05, 0], 'flame');
  part(flame, lathe([[0.8, 0], [0.95, -0.6], [0.7, -2.2], [0.25, -3.6], [0, -4.2]], 32), 'flame', ['#ff7b2e', '#fff3a0', 'y', 0.6]);
  part(flame, lathe([[0.45, 0], [0.5, -0.5], [0.25, -1.8], [0, -2.4]], 24), 'flame', '#ffffff');
  flame.visible = false;
  const seat = seatAt(body, 0, 5.4, 0.3);
  // 철탑(옆 발판)
  for (const [x, z] of [[-2.4, -1.6], [-2.4, -2.8], [-3.4, -1.6], [-3.4, -2.8]] as const) part(root, cyl(0.09, 0.09, 9, 12), 'paint', '#ff9a8a', [x, 4.5, z]);
  for (let y = 1; y < 9; y += 1.6) part(root, rbox(1.25, 0.1, 1.45, 0.04, 2), 'paint', '#ffd9d2', [-2.9, y, -2.2]);
  return done({ root, seat, wheels: [], spin: [], bits: { body, flame }, tail: new THREE.Vector3(0, -0.5, 0) });
}
