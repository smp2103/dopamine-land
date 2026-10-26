// 해변 소품: 가리비 조개·소라·불가사리·유목. 원점(모래) 기준.
import * as THREE from 'three';
import { grad, part, roundExtrude, smoothNormals, blob } from './kit';

/** 가리비: 부채꼴 돔 + 방사형 골(골은 둥글게) */
export function buildScallop(color0: string, color1: string, size = 0.3): THREE.Group {
  const g = new THREE.Group();
  const NA = 72, NR = 24;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const span = 1.05; // 반쪽 각도
  const c0 = new THREE.Color(color0), c1 = new THREE.Color(color1), c = new THREE.Color();
  for (let j = 0; j <= NR; j++) {
    const r = j / NR;
    for (let i = 0; i <= NA; i++) {
      const a = -span + (2 * span * i) / NA;
      const u = Math.abs(a) / span;
      const rib = (0.5 + 0.5 * Math.cos(a * 16)) * 0.045 * Math.pow(r, 0.8) * (1 - 0.6 * u * u);
      const dome = 0.32 * Math.sin(Math.PI * Math.min(1, r * 1.05) * 0.5 + 0.0) * (1 - r * r * 0.7) * (1 - 0.55 * u * u);
      const edge = 1 - Math.pow(u, 5) * 0.3; // 가장자리 둥글게
      const lip = r > 0.94 ? (r - 0.94) * -0.8 : 0; // 테두리가 모래로 살짝 말려 내려감
      const rr = r * edge;
      pos.push(Math.sin(a) * rr, Math.max(0, dome + rib + lip), -Math.cos(a) * rr + 0.45);
      c.copy(c0).lerp(c1, Math.min(1, r * 1.1 + 0.15 * (1 - (0.5 + 0.5 * Math.cos(a * 16)))));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
    const a = j * (NA + 1) + i, b = a + 1, cc = a + NA + 1, d = cc + 1;
    idx.push(a, b, cc, b, d, cc);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.scale(size, size, size);
  geo.computeVertexNormals();
  g.add(part(geo, 'shell'));
  // 경첩 귀(작은 둥근 날개 둘)
  for (const s of [-1, 1]) {
    const ear = part(blob(size * 0.12, 0.45, 0.04, 2 + s, 3), 'shell');
    grad(ear.geometry, color0, color0);
    ear.position.set(s * size * 0.1, size * 0.02, size * 0.45);
    ear.scale.set(1.3, 1, 0.9);
    g.add(ear);
  }
  return g;
}

/** 소라: 고리가 겹친 원뿔(회전체)을 옆으로 눕히고, 입구는 분홍 */
export function buildConch(): THREE.Group {
  const g = new THREE.Group();
  const Hc = 0.34, R0 = 0.11, whorls = 4.5;
  const pts: THREE.Vector2[] = [];
  const N = 90;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = t * Hc;
    const bump = Math.pow(Math.abs(Math.sin(Math.PI * t * whorls)), 0.5);
    let r = R0 * Math.pow(1 - t, 0.85) * (0.82 + 0.18 * bump);
    if (t < 0.06) r *= 0.75 + 4 * t; // 아래 둥글게 닫힘
    pts.push(new THREE.Vector2(Math.max(0.002, r), y));
  }
  pts.unshift(new THREE.Vector2(0.001, 0));
  const geo = smoothNormals(new THREE.LatheGeometry(pts, 40), 1e-5);
  grad(geo, '#f6c9a8', '#fff3e8', 0.6);
  const body = part(geo, 'shell');
  g.add(body);
  // 입구: 아래쪽 둥근 분홍 입술
  const lip = part(blob(0.085, 0.5, 0.05, 7, 4), 'shell');
  grad(lip.geometry, '#ff9fb4', '#ffc8d4');
  lip.position.set(0.0, 0.04, 0.04);
  lip.rotation.x = 0.9;
  lip.scale.set(0.85, 1, 1.25);
  g.add(lip);
  g.rotation.set(0, 0, Math.PI / 2 - 0.12); // 옆으로 눕힘(뾰족한 끝이 -x)
  g.position.set(0.12, 0.045, 0);
  const wrap = new THREE.Group();
  wrap.add(g);
  return wrap;
}

/** 불가사리: 둥근 별을 통통하게 + 오돌토돌 점 */
export function buildStarfish(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  const R = 0.24, r = 0.1, N = 5;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < N * 2; i++) {
    const a = (i / (N * 2)) * Math.PI * 2 + Math.PI / 2;
    const rad = i % 2 ? r : R;
    pts.push(new THREE.Vector2(Math.cos(a) * rad, Math.sin(a) * rad));
  }
  // 끝을 둥글게: 꼭짓점 사이를 이차 곡선으로
  const mid = (a: THREE.Vector2, b: THREE.Vector2) => a.clone().add(b).multiplyScalar(0.5);
  s.moveTo(mid(pts[pts.length - 1], pts[0]).x, mid(pts[pts.length - 1], pts[0]).y);
  for (let i = 0; i < pts.length; i++) {
    const m = mid(pts[i], pts[(i + 1) % pts.length]);
    s.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
  }
  const geo = roundExtrude(s, 0.08, 0.035, 12);
  geo.rotateX(-Math.PI / 2);
  // 가운데를 볼록하게
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i), p.getZ(i));
    if (p.getY(i) > 0) p.setY(i, p.getY(i) + 0.035 * Math.max(0, 1 - d / 0.16));
  }
  geo.computeVertexNormals();
  grad(geo, '#e9774f', '#ffa070');
  const body = part(geo, 'matte');
  body.position.y = 0.035;
  g.add(body);
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2, d = 0.03 + rng() * 0.15;
    const dot = part(new THREE.SphereGeometry(0.011, 10, 8), 'matte', '#ffd6a8');
    // 팔 위에만
    const arm = Math.round(((a - Math.PI / 2) / (Math.PI * 2)) * N) / N * Math.PI * 2 + Math.PI / 2;
    dot.position.set(Math.cos(arm) * d, 0.08 + 0.03 * Math.max(0, 1 - d / 0.16), -Math.sin(arm) * d);
    g.add(dot);
  }
  return g;
}

/** 유목: 하얗게 바랜 굽은 통나무 + 잔가지 */
export function buildDriftwood(): THREE.Group {
  const g = new THREE.Group();
  const branch = (pts: THREE.Vector3[], r0: number, r1: number) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const segs = 48, rad = 16;
    const tube = new THREE.TubeGeometry(curve, segs, 1, rad, false);
    const p = tube.attributes.position;
    const v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / (rad + 1)) / segs;
      curve.getPointAt(t, c);
      v.fromBufferAttribute(p, i).sub(c);
      const ang = Math.atan2(v.y, v.x);
      const rr = (r0 + (r1 - r0) * t) * (1 + 0.06 * Math.sin(ang * 3 + t * 9)) * (t < 0.04 ? 0.6 + t * 10 : t > 0.96 ? 0.6 + (1 - t) * 10 : 1);
      v.setLength(rr);
      p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
    }
    const geo = smoothNormals(tube, 1e-5);
    grad(geo, '#a89580', '#e3d6c3', 0.6);
    return part(geo, 'matte');
  };
  g.add(branch([new THREE.Vector3(-0.75, 0.08, 0.05), new THREE.Vector3(-0.25, 0.1, -0.06), new THREE.Vector3(0.25, 0.09, 0.04), new THREE.Vector3(0.75, 0.06, -0.08)], 0.09, 0.05));
  g.add(branch([new THREE.Vector3(0.05, 0.1, 0.0), new THREE.Vector3(0.2, 0.14, 0.18), new THREE.Vector3(0.36, 0.12, 0.34)], 0.04, 0.022));
  g.add(branch([new THREE.Vector3(-0.4, 0.1, -0.02), new THREE.Vector3(-0.5, 0.13, -0.2), new THREE.Vector3(-0.58, 0.1, -0.32)], 0.035, 0.02));
  return g;
}
