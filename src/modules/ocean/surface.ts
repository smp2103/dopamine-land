// 수면 위 생기: 부표·갈매기·돌고래·고래 모델.
import * as THREE from 'three';
import { at, cap, cone, cyl, ell, ellZ, face, merge, paint, paintFn, sph, torus, type Geo } from './kit';

const PI = Math.PI;

export function buoyGeo(): Geo {
  const p: Geo[] = [];
  const stripe = (v: THREE.Vector3, o: THREE.Color) => { o.set(Math.floor((v.y + 1) * 3.2) % 2 ? '#ffffff' : '#ff6b7a'); };
  p.push(at(paintFn(ell(0.55, 0.75, 0.55), stripe), 0, 0.25, 0));
  p.push(at(paint(torus(0.56, 0.08, 10, 32).rotateX(PI / 2), '#ffd166'), 0, 0.1, 0));
  p.push(at(paint(cyl(0.05, 0.06, 0.8, 10), '#ffffff', '#dddddd'), 0, 1.3, 0));
  p.push(at(paint(sph(0.14, 20, 14), '#fff3a0'), 0, 1.75, 0));
  p.push(at(paint(cone(0.2, 0.25, 16), '#ff6b7a'), 0, 1.98, 0));
  // 작은 깃발
  p.push(at(paint(new THREE.PlaneGeometry(0.4, 0.26, 4, 2), '#ffd166', '#ffb03c'), 0.22, 1.5, 0));
  p.push(...face({ y: 0.42, z: 0.5, sep: 0.15, r: 0.07, zAt: ellZ(0.55, 0.75, 0.55, 0.25) }));
  return merge(p);
}

export function gullBody(): Geo {
  const p: Geo[] = [];
  p.push(at(paint(ell(0.17, 0.16, 0.3), '#ffffff', '#e8eef6'), 0, 0, 0));
  p.push(at(paint(sph(0.14), '#ffffff', '#f0f4fa'), 0, 0.1, 0.25));
  p.push(at(paint(cone(0.045, 0.14, 12), '#ffcf4a', '#ffb02e'), 0, 0.07, 0.42, PI / 2, 0, 0));
  p.push(at(paint(ell(0.1, 0.03, 0.12), '#c9d4e2'), 0, 0.02, -0.33, 0.2, 0, 0));
  p.push(...face({ y: 0.14, z: 0.36, sep: 0.06, r: 0.025, mouth: 'none', zAt: ellZ(0.14, 0.14, 0.14, 0.1, 0.25) }));
  return merge(p);
}

export function gullWing(): Geo {
  const g = ell(0.36, 0.035, 0.13, 24, 12);
  g.translate(0.34, 0, 0);
  return merge([paintFn(g, (v, o) => { o.set('#ffffff').lerp(new THREE.Color('#9fb0c6'), Math.min(1, Math.max(0, (v.x - 0.45) / 0.25))); })]);
}

export function dolphinGeo(): Geo {
  const p: Geo[] = [];
  const body = (v: THREE.Vector3, o: THREE.Color) => {
    o.set('#7fb6f0').lerp(new THREE.Color('#5b8fd8'), Math.min(1, Math.max(0, v.y / 0.25)));
    if (v.y < -0.05) o.lerp(new THREE.Color('#eef6ff'), Math.min(1, (-v.y - 0.05) / 0.1));
  };
  p.push(at(paintFn(ell(0.32, 0.3, 0.85), body), 0, 0, 0));
  p.push(at(paintFn(ell(0.12, 0.1, 0.22), body), 0, -0.07, 0.86));
  p.push(at(paint(cone(0.12, 0.3, 14), '#5b8fd8', '#7fb6f0'), 0, 0.33, -0.1, -0.45, 0, 0));
  for (const s of [-1, 1]) p.push(at(paint(ell(0.22, 0.03, 0.1), '#6aa2e6'), s * 0.3, -0.12, 0.25, 0, s * 0.3, s * -0.4));
  p.push(at(paint(ell(0.4, 0.035, 0.14), '#5b8fd8'), 0, 0, -0.95));
  p.push(...face({ y: 0.06, z: 0.62, sep: 0.15, r: 0.05, zAt: ellZ(0.32, 0.3, 0.85) }));
  return merge(p);
}

export function whaleGeo(): Geo {
  const p: Geo[] = [];
  const body = (v: THREE.Vector3, o: THREE.Color) => {
    o.set('#6f9fe8').lerp(new THREE.Color('#4a72c8'), Math.min(1, Math.max(0, v.y / 2)));
    if (v.y < -0.6) {
      const stripe = 0.5 + 0.5 * Math.sin(v.x * 9);
      o.lerp(new THREE.Color('#f2f6ff'), Math.min(1, (-v.y - 0.6) / 0.6) * (0.6 + 0.4 * stripe));
    }
  };
  p.push(at(paintFn(ell(2.6, 2.3, 5.4, 40, 28), body), 0, 0, 0));
  p.push(at(paint(ell(3.2, 0.25, 1.1), '#4a72c8', '#6f9fe8'), 0, 0.2, -6.4));
  for (const s of [-1, 1]) p.push(at(paint(ell(1.6, 0.18, 0.6), '#5a84d8'), s * 2.6, -1.0, 1.4, 0, s * 0.4, s * -0.5));
  p.push(...face({ y: 0.2, z: 4.6, sep: 1.0, r: 0.32, zAt: ellZ(2.6, 2.3, 5.4) }));
  return merge(p);
}

export function bubbleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 10, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,0.05)');
  gr.addColorStop(0.75, 'rgba(220,250,255,0.35)');
  gr.addColorStop(0.92, 'rgba(255,255,255,0.95)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(32, 32, 30, 0, PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.ellipse(23, 21, 6, 4, -0.6, 0, PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function rayTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  const gx = g.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)');
  gx.addColorStop(0.5, 'rgba(255,255,255,1)');
  gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, 256);
  gy.addColorStop(0, 'rgba(0,0,0,1)');
  gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy;
  g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 난파선(부품 몇 개 — 장소가 적어서 일반 메시) */
export function wreckGeo(): { hull: Geo; trim: Geo; sail: Geo } {
  const hullParts: Geo[] = [];
  const plank = (v: THREE.Vector3, o: THREE.Color) => {
    o.set('#d39a62').lerp(new THREE.Color('#a56c42'), 0.5 + 0.5 * Math.sin(v.y * 22));
    if (v.y < -0.8) o.lerp(new THREE.Color('#7fc9a8'), 0.35);
  };
  const shell = new THREE.SphereGeometry(1, 40, 24, 0, PI * 2, PI / 2, PI / 2).scale(2.3, 2.0, 6.2);
  hullParts.push(at(paintFn(shell, plank), 0, 1.6, 0));
  hullParts.push(at(paintFn(ell(2.2, 0.12, 6.0, 32, 10), (v, o) => { o.set('#f0b070').lerp(new THREE.Color('#b8743e'), (Math.sin(v.x * 9) > 0.85 ? 0.8 : 0) + 0.2 * Math.sin(v.z * 0.7 + v.x * 3)); }), 0, 1.55, 0));
  // 선실
  hullParts.push(at(paint(new THREE.BoxGeometry(2.6, 1.3, 2.2, 1, 1, 1), '#e8b880', '#c98f55'), 0, 2.2, -3.2));
  const trim: Geo[] = [];
  trim.push(at(paint(torus(2.25, 0.12, 10, 48).scale(1, 2.7, 1).rotateX(PI / 2), '#ff9f43', '#e07a2a'), 0, 1.62, 0));
  for (let i = 0; i < 3; i++) trim.push(at(paint(new THREE.BoxGeometry(0.8, 0.7, 0.8), '#e8a860', '#b8743e'), -1.0 + i * 0.9, 1.95, 1.5 + (i % 2) * 0.9, 0, i * 0.5, 0));
  for (let i = 0; i < 4; i++) {
    trim.push(at(paint(torus(0.22, 0.06, 8, 20), '#ffd166'), 2.05, 1.0, -2.2 + i * 1.5, 0, PI / 2, 0));
    trim.push(at(paint(cyl(0.18, 0.18, 0.05, 18), '#2b4a6a'), 2.07, 1.0, -2.2 + i * 1.5, 0, 0, PI / 2));
  }
  trim.push(at(paint(cyl(0.16, 0.2, 7.5, 16), '#c98f55', '#9a6a46'), 0, 4.5, 0.8, 0.0, 0, 0.42));
  trim.push(at(paint(cyl(0.08, 0.08, 3.6, 10), '#b07a4c'), -1.1, 5.4, 0.8, 0, 0, 0.42 + PI / 2));
  trim.push(at(paint(cyl(0.45, 0.35, 0.45, 18), '#d39a62', '#a56c42'), -1.6, 7.6, 0.8, 0, 0, 0.42));
  const sail = paintFn(new THREE.PlaneGeometry(3.0, 2.6, 12, 8), (v, o) => { o.set(Math.floor((v.x + 1.5) / 0.5) % 2 ? '#fff3dc' : '#ff8a8a'); });
  const sp = sail.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setZ(i, Math.sin(sp.getX(i) * 1.6) * 0.25 + Math.sin(sp.getY(i) * 2) * 0.1);
  sail.computeVertexNormals();
  return { hull: merge(hullParts), trim: merge(trim), sail: merge([at(sail, -0.7, 4.0, 0.8, 0, 0, 0.42)]) };
}

export function jarGeo(): Geo {
  const pts: THREE.Vector2[] = [];
  const prof = [[0.0, 0], [0.18, 0.02], [0.32, 0.18], [0.36, 0.38], [0.3, 0.6], [0.14, 0.72], [0.12, 0.82], [0.17, 0.88], [0.15, 0.92]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const lathe = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(30), 32);
  const p: Geo[] = [];
  p.push(paintFn(lathe, (v, o) => {
    o.set('#ffb48a').lerp(new THREE.Color('#e88a5e'), 0.5 - 0.5 * Math.cos(v.y * 10));
    if (Math.abs(v.y - 0.42) < 0.035) o.set('#fff0d8');
  }));
  for (const s of [-1, 1]) p.push(at(paint(torus(0.09, 0.025, 8, 16, PI), '#e88a5e'), s * 0.2, 0.7, 0, 0, 0, s * -PI / 2));
  return merge(p);
}

export function coinPileGeo(): Geo {
  const p: Geo[] = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.2, r = (i % 4) * 0.08;
    p.push(at(paint(cyl(0.07, 0.07, 0.02, 20), '#ffe27a', '#f0b52e'), Math.cos(a) * r, 0.01 + Math.floor(i / 4) * 0.02, Math.sin(a) * r, 0.2 * Math.sin(i), 0, 0.2 * Math.cos(i)));
  }
  p.push(at(paint(sph(0.07, 20, 14), '#ffffff', '#ffe0f0'), 0.05, 0.08, 0.0));
  return merge(p);
}

export function caveGeo(): Geo {
  const p: Geo[] = [];
  const rockC = (v: THREE.Vector3, o: THREE.Color) => { o.set('#9f93c4').lerp(new THREE.Color('#6f6496'), 0.5 + 0.5 * Math.sin(v.x * 2.1 + v.y * 1.7)); };
  // 아치: 큰 바위 구들을 고리로
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * PI;
    const r = 1.6 + Math.sin(i * 1.9) * 0.3;
    p.push(at(paintFn(sph(r, 28, 20), rockC), Math.cos(a) * 3.6, Math.sin(a) * 3.4, Math.sin(i * 2.7) * 0.4));
  }
  for (let i = 0; i < 6; i++) p.push(at(paintFn(sph(2.2 + (i % 3) * 0.5, 28, 20), rockC), -4 + i * 1.6, 3.6 + Math.sin(i) * 0.6, -2.6));
  // 입구 안쪽 어둠
  p.push(at(paint(new THREE.CircleGeometry(3.4, 40, 0, PI), '#14204a', '#203a70'), 0, 0, -0.6));
  // 빛나는 수정
  const crystal = ['#a8f0ff', '#ffb8ec', '#d8c4ff'];
  for (let i = 0; i < 7; i++) {
    const x = -3.8 + i * 1.25, s = 0.35 + (i % 3) * 0.15;
    p.push(at(paint(new THREE.OctahedronGeometry(s, 0).scale(0.6, 1.6, 0.6), '#ffffff', crystal[i % 3]), x, 0.3 + s * 0.8, 1.1 + Math.sin(i * 2.3) * 0.5, 0, i, (i % 2 ? 0.3 : -0.25)));
  }
  return merge(p);
}

export { cap, cone };
