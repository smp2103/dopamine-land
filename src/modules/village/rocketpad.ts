// 발사대 섬 랜드마크: 멀리서도 읽히는 거대 기념 로켓(빨강·흰 줄, 귀여운 얼굴) + 발사 단지 소품(연료 탱크·레이더 접시·안테나·활주 표지).
// 타는 로켓은 vehicles 담당(PLACES.launchPad). 이건 섬의 실루엣을 만드는 정적 랜드마크다.
import * as THREE from 'three';
import { add, rod, cap, cyl, sph, rbox, grad, stripesY, V, type Built } from './common';

const RED = '#ff6f6f', RED_D = '#e8504f', WHITE = '#fffaf6';

/** 거대 로켓(높이 ≈ 48 m) — 통통한 탄환 몸통, 빨강·흰 줄, 동그란 창, 큰 눈·볼터치, 지느러미 4장 */
export function giantRocket(): Built {
  const g = new THREE.Group();
  const R = 5.2, BODY = 40;
  // 받침 원판 + 노란 경고 고리
  add(g, cyl(17, 18, 1.4, 64), 'stone', ['#b9c1cb', '#dfe4ea'], 0, 0.7, 0);
  add(g, new THREE.TorusGeometry(14.5, 0.35, 12, 96), 'glow', null, 0, 1.45, 0, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    add(g, rbox(2.2, 0.12, 0.9, 0.1, 2), 'paint', i % 2 ? '#ffd34f' : '#3d4452', Math.cos(a) * 16, 1.42, Math.sin(a) * 16, [0, -a, 0]);
  }
  // 몸통(lathe): 아래가 살짝 좁고 위가 둥근 탄환
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const r = R * (t < 0.08 ? 0.86 + t * 1.75 : t < 0.62 ? 1 + Math.sin(((t - 0.08) / 0.54) * Math.PI) * 0.04 : Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.62) / 0.38, 2))));
    prof.push(new THREE.Vector2(Math.max(r, 0.001), t * BODY));
  }
  const body = new THREE.LatheGeometry(prof, 72);
  stripesY(body, [WHITE, RED], 5.0, 0);
  add(g, body, 'gloss', null, 0, 6, 0);
  // 코 끝 + 꼭대기 불빛
  add(g, sph(1.3, 32, 24), 'gloss', RED_D, 0, 6 + BODY - 0.4, 0, undefined, [1, 0.8, 1]);
  add(g, cap(0.16, 4), 'gloss', '#e6ecf3', 0, 6 + BODY + 2.4, 0);
  add(g, sph(0.6, 24, 16), 'glow', null, 0, 6 + BODY + 4.8, 0);
  // 띠(하늘색)
  for (const y of [11, 30]) add(g, new THREE.TorusGeometry(R * 1.01, 0.45, 16, 96), 'gloss', '#7cc8ff', 0, 6 + y, 0, [Math.PI / 2, 0, 0]);
  // 동그란 창 2개(금테 + 유리)
  for (const y of [24, 33]) {
    const rr = y === 24 ? 1.7 : 1.2;
    const zz = (y === 24 ? R : R * 0.86) + 0.05;
    add(g, new THREE.TorusGeometry(rr, 0.28, 16, 56), 'gold', null, 0, 6 + y, zz);
    add(g, sph(rr * 0.95, 32, 20), 'window', null, 0, 6 + y, zz - 0.3, undefined, [1, 1, 0.3]);
  }
  // 얼굴(창 아래): 큰 눈 + 하이라이트 + 볼터치 + 웃는 입
  const fy = 6 + 16.5;
  for (const sx of [-1, 1]) {
    add(g, sph(0.95, 32, 24), 'gloss', '#2b2b38', sx * 1.9, fy, R + 0.05, undefined, [0.85, 1.1, 0.4]);
    add(g, sph(0.32, 20, 14), 'matte', '#ffffff', sx * 1.9 + 0.3, fy + 0.4, R + 0.38);
    add(g, sph(0.15, 16, 12), 'matte', '#ffffff', sx * 1.9 - 0.25, fy - 0.3, R + 0.36);
    add(g, sph(0.9, 24, 16), 'matte', '#ffadb8', sx * 3.2, fy - 1.3, R - 0.25, [0, sx * 0.55, 0], [1, 0.6, 0.3]);
  }
  add(g, new THREE.TorusGeometry(0.7, 0.16, 12, 32, Math.PI), 'gloss', '#7a2f3a', 0, fy - 1.1, R + 0.12, [0, 0, Math.PI]);
  // 지느러미 4장(통통한 곡선)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.quadraticCurveTo(5.5, -0.5, 6.2, -6.5); s.quadraticCurveTo(3.4, -4.2, 0, -4.4); s.lineTo(0, 0);
    const fg = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 5, curveSegments: 24 });
    fg.translate(0, 0, -0.45);
    grad(fg, RED_D, '#ff9a9a');
    const m = add(g, fg, 'gloss', null, Math.sin(a) * (R - 0.6), 6 + 10.5, Math.cos(a) * (R - 0.6));
    m.rotation.y = a - Math.PI / 2;
  }
  // 분사구
  add(g, cyl(3.4, 4.4, 4.2, 56), 'gloss', ['#8f9bab', '#d4dce6'], 0, 4.0, 0);
  add(g, cyl(4.5, 4.5, 0.5, 56), 'gloss', '#3d4452', 0, 1.9, 0);
  return { g, cols: [{ kind: 'cyl', r: R, hh: 24, x: 0, y: 24, z: 0 }, { kind: 'cyl', r: 6.5, hh: 3, x: 0, y: 3, z: 0 }], foot: 16 };
}

/** 로켓 옆 정비탑(격자 + 연결 팔). 로켓 축에서 +x 로 dx 떨어진 곳에 놓는다. */
export function gantry(H = 50, armTo = 6.5): Built {
  const g = new THREE.Group();
  add(g, rbox(9, 1, 9, 0.3, 3), 'stone', ['#9aa2ac', '#c6ccd4'], 0, 0.5, 0);
  const P = [[-3, -3], [3, -3], [-3, 3], [3, 3]];
  for (const [x, z] of P) add(g, rbox(0.7, H, 0.7, 0.2, 3), 'paint', RED, x, H / 2, z);
  for (let y = 4; y < H; y += 5) {
    const c = Math.floor(y / 5) % 2 ? WHITE : RED;
    for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
      rod(g, V(P[a][0], y, P[a][1]), V(P[b][0], y, P[b][1]), 0.2, 'paint', c, 8);
      if (y + 5 < H) rod(g, V(P[a][0], y, P[a][1]), V(P[b][0], y + 5, P[b][1]), 0.13, 'paint', WHITE, 6);
    }
  }
  // 연결 팔(로켓 쪽 = -x)
  for (const y of [18, 34]) {
    add(g, rbox(armTo + 3, 1.0, 2.0, 0.35, 3), 'paint', '#ffcc45', -(armTo + 3) / 2 - 1, y, 0);
    add(g, sph(0.5), 'glow', null, -armTo - 2.5, y + 0.9, 0);
  }
  add(g, rbox(9.5, 1.2, 9.5, 0.4, 3), 'paint', '#ffcc45', 0, H + 0.6, 0);
  add(g, cyl(0.2, 0.2, 7, 10), 'gloss', '#c6ccd4', 0, H + 4.5, 0);
  add(g, sph(0.7), 'glow', null, 0, H + 8.2, 0);
  return { g, cols: [{ kind: 'box', hx: 3.4, hy: H / 2, hz: 3.4, x: 0, y: H / 2, z: 0 }], foot: 5 };
}

/** 연료 탱크(공 모양, 다리 4개) */
export function fuelTank(c: string): Built {
  const g = new THREE.Group();
  const r = 4.2, y = 6.2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    add(g, cyl(0.35, 0.45, y, 16), 'paint', '#c6ccd4', Math.cos(a) * r * 0.75, y / 2, Math.sin(a) * r * 0.75);
  }
  const s = sph(r, 48, 32);
  grad(s, new THREE.Color(c).multiplyScalar(0.85), '#ffffff', 0.6);
  add(g, s, 'gloss', null, 0, y + r * 0.7, 0);
  add(g, new THREE.TorusGeometry(r * 1.0, 0.25, 12, 64), 'paint', '#ffcc45', 0, y + r * 0.7, 0, [Math.PI / 2, 0, 0]);
  rod(g, V(r * 0.6, y + r * 0.2, 0), V(r * 1.8, 1.0, 0), 0.35, 'gloss', '#9aa6b4', 12);
  return { g, cols: [{ kind: 'cyl', r: r * 0.8, hh: (y + r) / 2, x: 0, y: (y + r) / 2, z: 0 }], foot: r };
}

/** 레이더 접시(받침 + 기울어진 접시 + 가운데 안테나) */
export function radarDish(): Built {
  const g = new THREE.Group();
  add(g, cyl(2.4, 3.0, 1.2, 40), 'stone', ['#b9c1cb', '#dfe4ea'], 0, 0.6, 0);
  add(g, cyl(0.8, 1.1, 6, 32), 'paint', ['#d6dde6', '#ffffff'], 0, 4, 0);
  const head = new THREE.Group();
  head.position.set(0, 7.4, 0);
  head.rotation.x = -0.75;
  const dish = new THREE.SphereGeometry(6, 56, 16, 0, Math.PI * 2, 0, Math.PI * 0.3);
  dish.scale(1, 0.55, 1);
  grad(dish, '#ffffff', '#d9e6f5');
  add(head, dish, 'gloss', null, 0, -3.0, 0);
  add(head, dish.clone().scale(0.97, 0.97, 0.97).rotateX(Math.PI), 'paint', '#c6d2e0', 0, -1.1, 0);
  add(head, new THREE.TorusGeometry(4.75, 0.25, 12, 64), 'paint', '#5aaef0', 0, -1.95, 0, [Math.PI / 2, 0, 0]);
  add(head, cap(0.12, 3.2), 'gloss', '#9aa6b4', 0, -0.9, 0);
  add(head, sph(0.45), 'paint', RED, 0, 1.0, 0);
  g.add(head);
  return { g, cols: [{ kind: 'cyl', r: 1.1, hh: 4, x: 0, y: 4, z: 0 }], foot: 3 };
}

/** 안테나 마스트(흰·빨강 줄 + 빨간 불) */
export function antenna(h: number): Built {
  const g = new THREE.Group();
  const m = cyl(0.28, 0.42, h, 16);
  stripesY(m, [WHITE, RED], h / 6, -h / 2);
  add(g, m, 'gloss', null, 0, h / 2, 0);
  add(g, sph(0.55, 20, 14), 'glow', null, 0, h + 0.3, 0);
  for (const y of [h * 0.55, h * 0.8]) add(g, new THREE.TorusGeometry(0.9, 0.08, 8, 32), 'gloss', '#c6ccd4', 0, y, 0, [Math.PI / 2, 0, 0]);
  return { g, cols: [{ kind: 'cyl', r: 0.4, hh: h / 2, x: 0, y: h / 2, z: 0 }], foot: 1 };
}

/** 활주 표지: 바닥 띠 + 흰 점선 + 양옆 불빛 */
export function runway(len: number): Built {
  const g = new THREE.Group();
  add(g, rbox(10, 0.2, len, 0.08, 2), 'stone', ['#8b939e', '#a7aeb8'], 0, 0.1, 0);
  for (let z = -len / 2 + 4; z < len / 2 - 3; z += 8) add(g, rbox(0.8, 0.06, 4, 0.03, 2), 'paint', '#ffffff', 0, 0.22, z);
  for (const sx of [-1, 1]) for (let z = -len / 2 + 2; z < len / 2; z += 6) {
    add(g, cyl(0.18, 0.22, 0.5, 12), 'gloss', '#c6ccd4', sx * 5.4, 0.3, z);
    add(g, sph(0.24, 14, 10), 'glow', null, sx * 5.4, 0.65, z);
  }
  return { g, cols: [], foot: 0 };
}

export const ROCKET_HEIGHT = 6 + 40 + 5;
