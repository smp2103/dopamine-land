// 시작 마을 건물: 상점·박물관·작업대 오두막·게시판·부두·자전거 거치대. 원점 = 땅, 앞 = +z.
import * as THREE from 'three';
import { add, rod, cap, cyl, sph, dome, rbox, grad, paint, roundExtrude, roundRectShape, label, stripesY, V, WOOD, WOOD_DARK, type Built } from './common';

// ───────── 상점(차양·간판·진열대) ─────────
export function buildShop(): Built {
  const g = new THREE.Group();
  const W = 4.6, D = 3.4, H = 2.3, B = 0.22;
  add(g, rbox(W + 0.4, B, D + 0.4, 0.1, 4), 'stone', ['#b9ab98', '#dcd0bd'], 0, B / 2, 0);
  add(g, rbox(W, H, D, 0.2, 6), 'matte', ['#9fdcc4', '#d4f5e6'], 0, B + H / 2, 0);
  add(g, rbox(W + 0.06, 0.34, D + 0.06, 0.14, 5), 'wood', ['#a77650', '#c4915f'], 0, B + 0.17, 0);
  // 지붕: 집과 같은 통통한 박공 지붕(용마루 = x) + 처마 아래 물결 장식
  {
    const roof = new THREE.Group();
    const RH = 1.2, RW = D / 2 + 0.04, RL = W;
    const tri = new THREE.Shape();
    tri.moveTo(-RW, 0); tri.lineTo(RW, 0);
    tri.quadraticCurveTo(RW * 0.15, RH * 0.95, 0, RH); tri.quadraticCurveTo(-RW * 0.15, RH * 0.95, -RW, 0);
    const gable = roundExtrude(tri, RL - 0.06, 0.07, 20);
    gable.rotateY(Math.PI / 2);
    add(roof, gable, 'matte', ['#d4f5e6', '#eafff6'], 0, 0, 0);
    const slope = Math.atan2(RH, RW), T = 0.24, zA = -0.06, zB = RW + 0.32;
    const slabLen = (zB - zA) / Math.cos(slope), roofW = RL + 0.55;
    const rc = new THREE.Color('#4fb39c');
    for (const sg of [-1, 1]) {
      const slab = add(roof, rbox(roofW, T, slabLen, 0.11, 6), 'paint', [rc.clone().multiplyScalar(0.82), rc.clone().lerp(new THREE.Color('#ffffff'), 0.12)], 0, 0, 0);
      const zc = (zA + zB) / 2, ye = RH - zc * Math.tan(slope);
      slab.position.set(0, ye + (T / 2) * Math.cos(slope), sg * (zc + (T / 2) * Math.sin(slope)));
      slab.rotation.x = sg * slope;
      for (let i = 0; i < 3; i++) {
        const rib = add(slab, cap(0.05, roofW - 0.45).rotateZ(Math.PI / 2), 'paint', rc.clone().multiplyScalar(0.9), 0, T / 2 - 0.012, sg * (-0.25 + i * 0.36) * slabLen * 0.5);
        void rib;
      }
      // 처마 끝 물결(분홍·흰 공 줄)
      const yE = RH - zB * Math.tan(slope);
      const n = Math.round(roofW / 0.4);
      for (let i = 0; i < n; i++) {
        const x = -roofW / 2 + (roofW / n) * (i + 0.5);
        add(roof, sph(0.19, 20, 14), 'paint', i % 2 ? '#ffffff' : '#ffc4d2', x, yE - 0.06, sg * (zB + 0.02), undefined, [1, 0.62, 0.6]);
      }
    }
    add(roof, cap(0.16, roofW - 0.2).rotateZ(Math.PI / 2), 'paint', rc.clone().lerp(new THREE.Color('#ffffff'), 0.2), 0, RH + 0.18, 0);
    // 박공(옆) 둥근 창
    for (const sx of [-1, 1]) {
      add(roof, new THREE.TorusGeometry(0.2, 0.05, 12, 32), 'matte', '#ffffff', sx * (RL / 2 + 0.03), 0.45, 0, [0, Math.PI / 2, 0]);
      add(roof, cyl(0.19, 0.19, 0.05, 32).rotateZ(Math.PI / 2), 'window', null, sx * (RL / 2 + 0.0), 0.45, 0);
    }
    roof.position.y = B + H - 0.02;
    g.add(roof);
    add(g, rbox(0.42, 0.75, 0.42, 0.12, 4), 'stone', ['#c98f6a', '#e3a983'], 1.3, B + H + 1.15, -0.75);
    add(g, rbox(0.52, 0.12, 0.52, 0.05, 3), 'stone', '#a8735a', 1.3, B + H + 1.55, -0.75);
  }
  // 옆벽 창문 + 꽃상자
  for (const sx of [-1, 1]) {
    add(g, rbox(0.1, 0.8, 0.95, 0.12, 4), 'matte', '#ffffff', sx * (W / 2 + 0.02), B + 1.15, 0);
    add(g, rbox(0.08, 0.64, 0.78, 0.09, 4), 'window', null, sx * (W / 2 + 0.05), B + 1.15, 0);
    add(g, rbox(0.22, 0.14, 1.0, 0.05, 3), 'wood', WOOD, sx * (W / 2 + 0.13), B + 0.7, 0);
    for (let i = 0; i < 4; i++) add(g, sph(0.07, 16, 12), 'matte', ['#ff8fb1', '#ffd34f', '#ffffff', '#ff8fb1'][i], sx * (W / 2 + 0.15), B + 0.82, -0.34 + i * 0.23);
  }
  // 간판(지붕 앞 둥근 판 + 글씨)
  const by = B + H + 0.75, bz = D / 2 + 0.2;
  add(g, roundExtrude(roundRectShape(2.5, 0.8, 0.36), 0.14, 0.05), 'paint', ['#fff1cf', '#fff9ea'], 0, by, bz);
  add(g, roundExtrude(roundRectShape(2.7, 0.98, 0.45), 0.08, 0.03), 'wood', ['#b9834f', '#cf9a63'], 0, by, bz - 0.06);
  const lb = label('잡화점', 2.3, 0.72, { fg: '#2f8a76' });
  lb.position.set(0, by, bz + 0.085);
  g.add(lb);
  // 잎사귀 장식(간판 위)
  add(g, sph(0.2, 24, 16), 'matte', '#6cc46a', 1.15, by + 0.42, bz - 0.02, undefined, [1.4, 0.55, 0.8]);
  add(g, sph(0.13, 20, 14), 'matte', '#ff8fb1', 1.0, by + 0.5, bz + 0.06);
  // 차양: 줄무늬 천 판 + 동글동글 가장자리
  const AW = W + 0.3, AL = 1.05, ay = B + 2.12;
  const aw = new THREE.Group();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? '#ffffff' : '#ff8f8f';
    const sw = AW / n;
    add(aw, rbox(sw + 0.01, 0.07, AL, 0.03, 3), 'cloth', col, -AW / 2 + sw * (i + 0.5), 0, AL / 2);
    const sc = sph(sw / 2, 24, 12);
    add(aw, sc, 'cloth', col, -AW / 2 + sw * (i + 0.5), -0.02, AL, undefined, [1, 0.55, 0.35]);
  }
  aw.position.set(0, ay, D / 2 - 0.05);
  aw.rotation.x = 0.5;
  g.add(aw);
  // 문(유리 + 둥근 위) + 큰 진열창 두 개
  const ds = new THREE.Shape();
  ds.moveTo(-0.42, 0); ds.lineTo(0.42, 0); ds.lineTo(0.42, 0.95); ds.absarc(0, 0.95, 0.42, 0, Math.PI, false); ds.lineTo(-0.42, 0);
  add(g, roundExtrude(ds, 0.1, 0.035, 32), 'wood', ['#9a6440', '#b57a4f'], 0, B + 0.02, D / 2 + 0.03);
  add(g, rbox(0.5, 0.55, 0.06, 0.12, 4), 'window', null, 0, B + 0.95, D / 2 + 0.09);
  add(g, sph(0.05, 16, 12), 'gold', null, 0.27, B + 0.6, D / 2 + 0.12);
  for (const sx of [-1, 1]) {
    add(g, rbox(1.25, 0.95, 0.1, 0.14, 4), 'matte', '#ffffff', sx * 1.5, B + 1.05, D / 2 + 0.02);
    add(g, rbox(1.08, 0.8, 0.08, 0.1, 4), 'window', null, sx * 1.5, B + 1.05, D / 2 + 0.05);
    add(g, rbox(1.3, 0.12, 0.3, 0.05, 3), 'wood', WOOD, sx * 1.5, B + 0.54, D / 2 + 0.14);
  }
  // 진열대(가게 앞 왼쪽): 나무 탁자 + 과일 바구니
  const st = new THREE.Group();
  add(st, rbox(1.5, 0.12, 0.7, 0.05, 3), 'wood', ['#b9834f', '#d6a571'], 0, 0.62, 0);
  for (const [x, z] of [[-0.62, -0.26], [0.62, -0.26], [-0.62, 0.26], [0.62, 0.26]]) add(st, cap(0.045, 0.5), 'wood', WOOD_DARK, x, 0.3, z);
  const fruits: Array<[string, number]> = [['#ff6b5e', -0.45], ['#ffb347', 0], ['#a3d977', 0.45]];
  for (const [c, x] of fruits) {
    add(st, cyl(0.2, 0.16, 0.16, 24), 'wood', ['#c48a52', '#e0ab72'], x, 0.75, 0);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.26;
      add(st, sph(0.075, 20, 14), 'gloss', c, x + Math.cos(a) * 0.08 * (k ? 1 : 0), 0.86 + (k ? 0 : 0.05), Math.sin(a) * 0.08 * (k ? 1 : 0));
    }
  }
  // 작은 가격표
  add(st, rbox(0.3, 0.2, 0.03, 0.04, 2), 'matte', '#fff7e2', 0.55, 0.78, 0.36, [-0.3, 0, 0]);
  st.position.set(-1.9, B * 0, D / 2 + 1.3);
  st.rotation.y = 0.15;
  g.add(st);
  // 화분(오른쪽) 두 개
  for (const [x, z, c] of [[1.95, D / 2 + 0.75, '#ff8fb1'], [2.45, D / 2 + 0.4, '#ffd34f']] as const) {
    add(g, cyl(0.2, 0.26, 0.36, 24), 'paint', ['#d0704e', '#e98c63'], x, 0.18, z);
    add(g, sph(0.27, 24, 18), 'matte', '#6cc46a', x, 0.5, z, undefined, [1, 0.8, 1]);
    for (let k = 0; k < 4; k++) add(g, sph(0.07, 16, 12), 'matte', c, x + Math.cos(k * 1.7) * 0.17, 0.62 + (k % 2) * 0.06, z + Math.sin(k * 1.7) * 0.17);
  }
  // 나무 상자 더미(오른쪽 옆)
  add(g, rbox(0.55, 0.5, 0.55, 0.08, 3), 'wood', ['#b9834f', '#d6a571'], W / 2 + 0.45, 0.25, 0.6);
  add(g, rbox(0.45, 0.42, 0.45, 0.07, 3), 'wood', ['#b9834f', '#d6a571'], W / 2 + 0.42, 0.71, 0.55, [0, 0.4, 0]);
  return { g, cols: [{ kind: 'box', hx: W / 2 + 0.1, hy: (B + H + 1) / 2, hz: D / 2 + 0.1, x: 0, y: (B + H + 1) / 2, z: 0 }], foot: 3.6 };
}

// ───────── 박물관(둥근 지붕 큰 건물) ─────────
export function buildMuseum(): Built {
  const g = new THREE.Group();
  const W = 11, D = 8, H = 4.2, B = 0.7;
  // 계단식 기단
  add(g, rbox(W + 2.2, 0.4, D + 2.2, 0.15, 4), 'stone', ['#bfb5a6', '#ddd5c6'], 0, 0.2, 0);
  add(g, rbox(W + 1.2, 0.35, D + 1.2, 0.15, 4), 'stone', ['#cfc6b8', '#ebe4d6'], 0, 0.55, 0);
  for (let i = 0; i < 4; i++) add(g, rbox(4.2, 0.18, 0.5, 0.07, 3), 'stone', ['#cfc6b8', '#efe9de'], 0, 0.09 + i * 0.18, D / 2 + 1.0 + (3 - i) * 0.42);
  // 벽(크림) + 띠
  add(g, rbox(W, H, D, 0.25, 6), 'matte', ['#f2e2c4', '#fff6e4'], 0, B + H / 2, 0);
  add(g, rbox(W + 0.3, 0.32, D + 0.3, 0.14, 4), 'matte', '#e4cfa9', 0, B + H, 0);
  add(g, rbox(W + 0.2, 0.3, D + 0.2, 0.14, 4), 'matte', '#e8d4b0', 0, B + 0.15, 0);
  // 앞 기둥 6개(포르티코) + 박공
  const PW = 7.2;
  add(g, rbox(PW + 0.8, 0.36, 2.2, 0.15, 4), 'matte', '#efe1c6', 0, B + H - 0.1, D / 2 + 0.9);
  for (let i = 0; i < 6; i++) {
    const x = -PW / 2 + (PW / 5) * i;
    add(g, cyl(0.26, 0.22, H - 0.5, 28), 'matte', ['#efe2c8', '#fffaf0'], x, B + (H - 0.5) / 2 + 0.05, D / 2 + 1.4);
    add(g, rbox(0.7, 0.18, 0.7, 0.08, 3), 'matte', '#e8d6b6', x, B + 0.09, D / 2 + 1.4);
    add(g, rbox(0.66, 0.2, 0.66, 0.08, 3), 'matte', '#e8d6b6', x, B + H - 0.38, D / 2 + 1.4);
  }
  const tri = new THREE.Shape();
  tri.moveTo(-PW / 2 - 0.5, 0); tri.lineTo(PW / 2 + 0.5, 0); tri.quadraticCurveTo(0.6, 1.5, 0, 1.55); tri.quadraticCurveTo(-0.6, 1.5, -PW / 2 - 0.5, 0);
  add(g, roundExtrude(tri, 0.7, 0.12, 24), 'matte', ['#f2e2c4', '#fff6e4'], 0, B + H + 0.08, D / 2 + 1.55);
  add(g, roundExtrude(tri, 0.4, 0.1, 24), 'paint', ['#4aa79a', '#6cc7b6'], 0, B + H + 0.2, D / 2 + 1.25, undefined, [1.04, 1.1, 1]);
  // 둥근 지붕(청록 구리) + 드럼 + 꼭대기 금 장식
  add(g, cyl(3.3, 3.3, 1.2, 48), 'matte', ['#ecdcbe', '#fff4e0'], 0, B + H + 0.75, -0.4);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    add(g, rbox(0.42, 0.65, 0.1, 0.1, 3), 'window', null, Math.sin(a) * 3.28, B + H + 0.78, -0.4 + Math.cos(a) * 3.28, [0, a, 0]);
  }
  const dm = dome(3.6, 48, 24);
  grad(dm, '#58b8a6', '#9ee3d0', 0.8);
  add(g, dm, 'gloss', null, 0, B + H + 1.3, -0.4, undefined, [1, 0.92, 1]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rib = new THREE.TorusGeometry(3.62, 0.07, 8, 48, Math.PI / 2);
    rib.rotateY(Math.PI / 2);
    add(g, rib, 'gloss', '#3e9787', 0, B + H + 1.3, -0.4, [0, a, 0], [1, 0.92, 1]);
  }
  add(g, cyl(0.35, 0.5, 0.5, 24), 'gold', null, 0, B + H + 4.65, -0.4);
  add(g, sph(0.38), 'gold', null, 0, B + H + 5.1, -0.4);
  add(g, cap(0.07, 0.6), 'gold', null, 0, B + H + 5.65, -0.4);
  // 문(큰 아치) + 창
  const ds = new THREE.Shape();
  ds.moveTo(-0.85, 0); ds.lineTo(0.85, 0); ds.lineTo(0.85, 1.5); ds.absarc(0, 1.5, 0.85, 0, Math.PI, false); ds.lineTo(-0.85, 0);
  add(g, roundExtrude(ds, 0.14, 0.05, 32), 'wood', ['#7d4f33', '#a06b45'], 0, B + 0.02, D / 2 + 0.04);
  for (const sx of [-1, 1]) for (const k of [1, 2]) {
    const x = sx * (1.0 + k * 1.15);
    const ws = new THREE.Shape();
    ws.moveTo(-0.38, 0); ws.lineTo(0.38, 0); ws.lineTo(0.38, 1.0); ws.absarc(0, 1.0, 0.38, 0, Math.PI, false); ws.lineTo(-0.38, 0);
    add(g, roundExtrude(ws, 0.08, 0.03, 24), 'window', null, x, B + 1.2, D / 2 + 0.03);
  }
  // 간판 + 깃발 두 개(바람에 흔들림)
  const lb = label('박물관', 3.2, 0.8, { fg: '#2f6f66' });
  lb.position.set(0, B + H + 0.62, D / 2 + 1.92);
  g.add(lb);
  const anim: Built['anim'] = [];
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.8), z = D / 2 + 2.4;
    add(g, cap(0.07, 5.2), 'gloss', '#5a6f6a', x, 2.6, z);
    add(g, sph(0.13), 'gold', null, x, 5.3, z);
    const fl = new THREE.Group();
    fl.position.set(x, 4.6, z);
    fl.userData.live = true;
    const banner = new THREE.Group();
    add(banner, rbox(0.06, 1.6, 0.85, 0.03, 3), 'cloth', ['#ff8f8f', '#ffb3a8'], 0, -0.6, 0.48);
    add(banner, sph(0.12, 16, 12), 'cloth', '#ffe28a', 0.04, -0.5, 0.5);
    fl.add(banner);
    g.add(fl);
    anim.push({ o: fl, fn: (o, base, t) => { o.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.sin(t * 1.7 + sx) * 0.25, Math.sin(t * 2.3 + sx) * 0.04))); } });
  }
  // 화단(앞 양쪽)
  for (const sx of [-1, 1]) {
    add(g, rbox(2.4, 0.4, 0.9, 0.15, 4), 'stone', ['#c6bcae', '#e6dfd2'], sx * 4.6, 0.2, D / 2 + 2.6);
    for (let k = 0; k < 6; k++) {
      add(g, sph(0.24, 20, 14), 'matte', '#6cc46a', sx * 4.6 - 0.95 + k * 0.38, 0.5, D / 2 + 2.6, undefined, [1, 0.7, 1]);
      add(g, sph(0.08, 14, 10), 'matte', ['#ff8fb1', '#ffd34f', '#ffffff'][k % 3], sx * 4.6 - 0.95 + k * 0.38, 0.68, D / 2 + 2.72);
    }
  }
  return {
    g, anim, foot: 8.5,
    cols: [
      { kind: 'box', hx: W / 2, hy: (B + H) / 2, hz: D / 2, x: 0, y: (B + H) / 2, z: 0 },
      { kind: 'cyl', r: 3.5, hh: 2.5, x: 0, y: B + H + 2.2, z: -0.4 },
      { kind: 'box', hx: (W + 1.2) / 2, hy: 0.35, hz: (D + 1.2) / 2, x: 0, y: 0.35, z: 0 },
    ],
  };
}

// ───────── 작업대 오두막 ─────────
export function buildWorkshop(): Built {
  const g = new THREE.Group();
  const W = 3.4, D = 2.6, H = 2.0;
  add(g, rbox(W + 0.6, 0.25, D + 1.8, 0.1, 4), 'wood', ['#a77650', '#c08c5c'], 0, 0.12, 0.5);
  // 통나무 벽(뒤·옆) — 앞은 열려 있다
  for (let i = 0; i < 6; i++) {
    const y = 0.42 + i * 0.32;
    const lg = cap(0.17, W - 0.2, 16);
    lg.rotateZ(Math.PI / 2);
    add(g, lg, 'wood', i % 2 ? '#c48f5c' : '#b98352', 0, y, -D / 2);
    for (const sx of [-1, 1]) {
      const lz = cap(0.17, D - 0.3, 16);
      lz.rotateX(Math.PI / 2);
      add(g, lz, 'wood', i % 2 ? '#b98352' : '#c48f5c', sx * W / 2, y + 0.16, 0);
    }
  }
  // 앞 기둥 + 지붕(초록 판, 앞으로 내민 처마)
  for (const sx of [-1, 1]) add(g, cap(0.12, H + 0.1), 'wood', WOOD_DARK, sx * (W / 2), (H + 0.3) / 2 + 0.15, D / 2 + 0.2);
  const roof = new THREE.Group();
  for (const s of [-1, 1]) {
    const slab = add(roof, rbox(W + 1.0, 0.22, D * 0.72, 0.1, 5), 'paint', ['#d9784c', '#f09a6a'], 0, 0, s * D * 0.34, [s * 0.52, 0, 0]);
    for (let i = 0; i < 3; i++) add(slab, cap(0.045, W + 0.6).rotateZ(Math.PI / 2), 'paint', '#e2865a', 0, 0.1, (-0.6 + i * 0.6) * D * 0.3);
  }
  add(roof, cap(0.15, W + 0.8).rotateZ(Math.PI / 2), 'paint', '#f2a272', 0, 0.22, 0);
  roof.position.set(0, H + 0.62, 0.15);
  g.add(roof);
  // 박공 삼각(뒤)
  const tri = new THREE.Shape();
  tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, 0.85); tri.lineTo(-W / 2, 0);
  add(g, roundExtrude(tri, 0.18, 0.05), 'wood', '#c48f5c', 0, H + 0.2, -D / 2);
  // 작업대 + 연장
  add(g, rbox(2.0, 0.16, 0.85, 0.05, 3), 'wood', ['#c48f5c', '#ddb07c'], 0, 0.95, -0.35);
  for (const [x, z] of [[-0.85, -0.65], [0.85, -0.65], [-0.85, -0.05], [0.85, -0.05]]) add(g, rbox(0.12, 0.8, 0.12, 0.04, 2), 'wood', WOOD_DARK, x, 0.55, z);
  add(g, rbox(1.8, 0.08, 0.7, 0.03, 2), 'wood', '#b98352', 0, 0.42, -0.35);
  // 망치(머리 회색 + 손잡이)
  add(g, rbox(0.28, 0.12, 0.12, 0.04, 3), 'gloss', '#8c98a8', -0.45, 1.1, -0.3, [0, 0.4, 0]);
  add(g, cap(0.03, 0.4).rotateZ(Math.PI / 2), 'wood', '#d6a571', -0.33, 1.07, -0.18, [0, -1.1, 0]);
  // 톱
  add(g, rbox(0.55, 0.2, 0.02, 0.04, 2), 'gloss', '#c8d2dd', 0.4, 1.1, -0.5, [Math.PI / 2, 0, 0.3]);
  add(g, rbox(0.16, 0.16, 0.06, 0.04, 2), 'paint', '#e86f5e', 0.12, 1.07, -0.6, [Math.PI / 2, 0, 0.3]);
  // 벽 선반 + 페인트 통
  add(g, rbox(1.8, 0.08, 0.3, 0.03, 2), 'wood', '#ddb07c', 0, 1.65, -D / 2 + 0.3);
  for (let i = 0; i < 4; i++) add(g, cyl(0.1, 0.1, 0.2, 18), 'gloss', ['#ff8f8f', '#5aaef0', '#ffd34f', '#7ed38d'][i], -0.6 + i * 0.4, 1.8, -D / 2 + 0.3);
  // 장작 더미(오른쪽 옆)
  for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) {
    const lg = cyl(0.17, 0.17, 0.9, 20);
    lg.rotateX(Math.PI / 2);
    add(g, lg, 'wood', ['#a77650', '#c8955f'], W / 2 + 0.5 + (i - (2 - r) / 2) * 0.36, 0.42 + r * 0.31, 0.3);
    add(g, cyl(0.14, 0.14, 0.02, 20).rotateX(Math.PI / 2), 'matte', '#f0cf96', W / 2 + 0.5 + (i - (2 - r) / 2) * 0.36, 0.42 + r * 0.31, 0.76);
  }
  // 간판
  add(g, roundExtrude(roundRectShape(1.5, 0.5, 0.2), 0.08, 0.03), 'wood', ['#d6a571', '#e8be8c'], 0, H + 0.55, D / 2 + 0.55);
  const lb = label('작업대', 1.35, 0.42);
  lb.position.set(0, H + 0.55, D / 2 + 0.6);
  g.add(lb);
  return {
    g, foot: 2.8,
    cols: [
      { kind: 'box', hx: W / 2 + 0.2, hy: 1.2, hz: 0.25, x: 0, y: 1.2, z: -D / 2 },
      { kind: 'box', hx: 0.25, hy: 1.2, hz: D / 2, x: -W / 2, y: 1.2, z: 0 },
      { kind: 'box', hx: 0.25, hy: 1.2, hz: D / 2, x: W / 2, y: 1.2, z: 0 },
      { kind: 'box', hx: 1.0, hy: 0.5, hz: 0.45, x: 0, y: 0.5, z: -0.35 },
    ],
  };
}

// ───────── 게시판 ─────────
export function buildBoard(): Built {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) add(g, rbox(0.16, 2.0, 0.16, 0.07, 3), 'wood', [WOOD_DARK, WOOD], sx * 1.05, 1.0, 0);
  add(g, roundExtrude(roundRectShape(2.2, 1.25, 0.18), 0.12, 0.04), 'wood', ['#b9834f', '#cf9a63'], 0, 1.3, 0);
  add(g, roundExtrude(roundRectShape(1.95, 1.02, 0.12), 0.06, 0.02), 'matte', ['#d9a066', '#e8b57c'], 0, 1.3, 0.05);
  // 작은 지붕
  for (const s of [-1, 1]) add(g, rbox(2.6, 0.12, 0.56, 0.05, 3), 'paint', ['#e8685a', '#ff8e7c'], 0, 2.08, s * 0.22, [s * 0.5, 0, 0]);
  add(g, cap(0.08, 2.4).rotateZ(Math.PI / 2), 'paint', '#ff8e7c', 0, 2.2, 0);
  // 쪽지들
  const notes: Array<[number, number, string, number]> = [[-0.6, 1.55, '#fff7d6', 0.1], [0.05, 1.5, '#ffd6e3', -0.08], [0.62, 1.58, '#d6f0ff', 0.12], [-0.35, 1.05, '#e3ffd6', -0.1], [0.4, 1.02, '#fff7d6', 0.05]];
  for (const [x, y, c, r] of notes) {
    add(g, rbox(0.42, 0.36, 0.02, 0.03, 2), 'matte', c, x, y, 0.11, [0, 0, r]);
    add(g, sph(0.035, 12, 10), 'gloss', '#ff5e5e', x, y + 0.13, 0.13);
  }
  const lb = label('마을 소식', 1.3, 0.3, { fg: '#ffffff', stroke: '#8a5a33' });
  lb.position.set(0, 1.86, 0.13);
  g.add(lb);
  return { g, cols: [{ kind: 'box', hx: 1.2, hy: 1.1, hz: 0.15, x: 0, y: 1.1, z: 0 }], foot: 1.3 };
}

// ───────── 자전거 거치대 ─────────
export function buildBikeRack(): Built {
  const g = new THREE.Group();
  add(g, rbox(3.0, 0.12, 0.8, 0.06, 3), 'stone', ['#c6bcae', '#e6dfd2'], 0, 0.06, 0);
  for (let i = 0; i < 5; i++) {
    const t = new THREE.TorusGeometry(0.32, 0.045, 12, 32, Math.PI);
    add(g, t, 'gloss', '#5ac3b0', -1.2 + i * 0.6, 0.12, 0);
  }
  add(g, cap(0.04, 2.8).rotateZ(Math.PI / 2), 'gloss', '#4aa99a', 0, 0.2, 0);
  // 작은 표지(자전거 그림 대신 원 두 개)
  add(g, cap(0.04, 1.0), 'gloss', '#5a6f6a', 1.75, 0.55, 0);
  add(g, cyl(0.28, 0.28, 0.06, 32).rotateX(Math.PI / 2), 'paint', '#5aaef0', 1.75, 1.15, 0);
  add(g, new THREE.TorusGeometry(0.08, 0.025, 8, 20), 'matte', '#ffffff', 1.65, 1.1, 0.04);
  add(g, new THREE.TorusGeometry(0.08, 0.025, 8, 20), 'matte', '#ffffff', 1.86, 1.1, 0.04);
  return { g, cols: [], foot: 1.6 };
}

// ───────── 나무 잔교(부두) ─────────
/** 길이 len(+z 방향으로 뻗음), 폭 w. 갑판 높이 deckY(로컬, 원점 = 해안 시작점 땅). 끝에 넓은 선착장(endW) */
export function buildPier(len: number, w: number, deckY: number, endW = 0, rng: () => number = Math.random): Built {
  const g = new THREE.Group();
  const cols: Built['cols'] = [];
  const boardW = 0.42;
  const n = Math.floor(len / (boardW + 0.04));
  for (let i = 0; i < n; i++) {
    const z = 0.3 + i * (boardW + 0.04);
    const tone = 0.92 + rng() * 0.12;
    const c = new THREE.Color('#c8955f').multiplyScalar(tone);
    add(g, rbox(w + (rng() - 0.5) * 0.12, 0.12, boardW, 0.05, 3), 'wood', [c.clone().multiplyScalar(0.85), c], (rng() - 0.5) * 0.06, deckY, z, [0, (rng() - 0.5) * 0.03, 0]);
  }
  // 받침 들보
  for (const sx of [-1, 1]) add(g, rbox(0.18, 0.2, len, 0.06, 3), 'wood', WOOD_DARK, sx * (w / 2 - 0.25), deckY - 0.15, len / 2);
  // 기둥(물 아래까지)
  const postH = deckY + 4.5;
  for (let z = 0.4; z < len + 0.1; z += 2.4) {
    for (const sx of [-1, 1]) {
      add(g, cyl(0.17, 0.15, postH, 20), 'wood', ['#7d5236', '#a8754b'], sx * (w / 2 + 0.05), deckY + 0.35 - postH / 2, z);
      add(g, sph(0.16, 20, 12), 'wood', '#b8855a', sx * (w / 2 + 0.05), deckY + 0.38, z, undefined, [1, 0.6, 1]);
    }
  }
  // 밧줄 난간(기둥 사이, 처짐)
  for (const sx of [-1, 1]) {
    for (let z = 0.4; z + 2.4 < len + 0.1; z += 2.4) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(V(sx * (w / 2 + 0.05), deckY + 0.32 - Math.sin(t * Math.PI) * 0.18, z + t * 2.4));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.03, 6);
      add(g, tube, 'matte', '#f0dcb4', 0, 0, 0);
    }
  }
  cols.push({ kind: 'box', hx: w / 2, hy: 0.1, hz: len / 2, x: 0, y: deckY - 0.04, z: len / 2 });
  if (endW > 0) {
    const ez = len + endW / 2 - 0.2;
    for (let i = 0; i < Math.floor(endW / (boardW + 0.04)); i++) {
      const c = new THREE.Color('#c8955f').multiplyScalar(0.92 + rng() * 0.12);
      add(g, rbox(endW, 0.12, boardW, 0.05, 3), 'wood', [c.clone().multiplyScalar(0.85), c], 0, deckY, len + i * (boardW + 0.04));
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      add(g, cyl(0.2, 0.18, postH, 20), 'wood', ['#7d5236', '#a8754b'], sx * (endW / 2 - 0.1), deckY + 0.35 - postH / 2, ez + sz * (endW / 2 - 0.3));
    }
    // 계선주(빨간 말뚝) + 구명 튜브
    for (const sx of [-1, 1]) {
      add(g, cyl(0.16, 0.2, 0.4, 20), 'gloss', '#e8685a', sx * (endW / 2 - 0.5), deckY + 0.25, ez + endW / 2 - 0.6);
      add(g, sph(0.2, 20, 12), 'gloss', '#ff8070', sx * (endW / 2 - 0.5), deckY + 0.46, ez + endW / 2 - 0.6, undefined, [1, 0.5, 1]);
    }
    const ring = new THREE.TorusGeometry(0.34, 0.11, 16, 36);
    stripesRing(ring);
    add(g, ring, 'gloss', null, endW / 2 - 0.02, deckY + 0.55, ez - 0.6, [0, Math.PI / 2, 0]);
    // 작은 나무 표지
    add(g, cap(0.06, 1.3), 'wood', WOOD_DARK, -endW / 2 + 0.4, deckY + 0.7, ez - endW / 2 + 0.6);
    add(g, roundExtrude(roundRectShape(0.9, 0.42, 0.14), 0.07, 0.025), 'wood', ['#d6a571', '#e8be8c'], -endW / 2 + 0.4, deckY + 1.3, ez - endW / 2 + 0.66);
    const lb = label('선착장', 0.8, 0.34);
    lb.position.set(-endW / 2 + 0.4, deckY + 1.3, ez - endW / 2 + 0.71);
    g.add(lb);
    cols.push({ kind: 'box', hx: endW / 2, hy: 0.1, hz: endW / 2, x: 0, y: deckY - 0.04, z: ez });
  }
  // 랜턴 기둥(입구 두 개)
  for (const sx of [-1, 1]) {
    add(g, cap(0.06, 1.5), 'gloss', '#3f5a52', sx * (w / 2 + 0.05), deckY + 0.95, 0.4);
    add(g, cap(0.13, 0.12), 'lampGlow', null, sx * (w / 2 + 0.05), deckY + 1.8, 0.4);
    add(g, dome(0.17, 20, 10), 'gloss', '#3f5a52', sx * (w / 2 + 0.05), deckY + 1.95, 0.4, undefined, [1, 0.6, 1]);
  }
  return { g, cols, foot: 0 };
}

/** 구명 튜브 빨강·흰 4등분 */
export function stripesRing(geo: THREE.BufferGeometry) {
  const p = geo.attributes.position;
  const a = new Float32Array(p.count * 3);
  const r = new THREE.Color('#ff5e57'), w = new THREE.Color('#ffffff');
  for (let i = 0; i < p.count; i++) {
    const ang = Math.atan2(p.getY(i), p.getX(i)) + Math.PI;
    const c = Math.floor(ang / (Math.PI / 2)) % 2 ? w : r;
    a.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

export { stripesY, paint, rod };
