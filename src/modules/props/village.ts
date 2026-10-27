// 동숲 마을 소품: 집·표지판·울타리·벤치·가로등·바위(우체통은 내 집 앞 — village/house.ts). 모두 원점(땅) 기준, 앞 = +z.
import * as THREE from 'three';
import { rbox, grad, paint, part, roundExtrude, roundRectShape, blob, canvasTex, smoothNormals } from './kit';

const WOOD = '#c89766';
const WOOD_DARK = '#a8754b';

/** 둥근 캡슐 막대(세로) */
function capsule(r: number, len: number): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(r, len, 8, 20);
}

// ───────── 집 ─────────
export function buildHouse(roofColor = '#ee6f62'): THREE.Group {
  const g = new THREE.Group();
  g.name = 'house';
  const WW = 2.5, WD = 2.2, WH = 1.55, BASE = 0.2;

  // 주춧돌
  const base = part(rbox(WW + 0.25, BASE, WD + 0.25, 0.09, 4), 'stone');
  grad(base.geometry, '#b9ab98', '#d8ccb8');
  base.position.y = BASE / 2;
  g.add(base);

  // 벽(크림색, 아래가 살짝 진하게)
  const wall = part(rbox(WW, WH, WD, 0.16, 6), 'matte');
  grad(wall.geometry, '#efdcbc', '#fff4df', 0.7);
  wall.position.y = BASE + WH / 2;
  g.add(wall);
  // 아랫단 나무 판(벽 아래 띠)
  const skirt = part(rbox(WW + 0.05, 0.3, WD + 0.05, 0.12, 5), 'wood');
  grad(skirt.geometry, '#a77650', '#bf8c60');
  skirt.position.y = BASE + 0.15;
  g.add(skirt);

  // 지붕 묶음: 용마루가 앞뒤(z)로 달리고 박공(삼각 벽)이 앞을 본다.
  // 아래는 용마루를 x 로 두고 만든 뒤 묶음째 90° 돌린다.
  const roof = new THREE.Group();
  const RH = 1.05; // 지붕 높이
  const RW = WW / 2 + 0.04; // 반폭(돌린 뒤 x)
  const RL = WD; // 용마루 길이(돌린 뒤 z)
  const tri = new THREE.Shape();
  tri.moveTo(-RW, 0);
  tri.lineTo(RW, 0);
  tri.quadraticCurveTo(RW * 0.15, RH * 0.95, 0, RH);
  tri.quadraticCurveTo(-RW * 0.15, RH * 0.95, -RW, 0);
  const gable = part(roundExtrude(tri, RL - 0.06, 0.07, 20), 'matte');
  gable.geometry.rotateY(Math.PI / 2);
  grad(gable.geometry, '#fff0d6', '#fff7e8');
  roof.add(gable);

  // 경사판 두 장(통통한 둥근 판) — 박공 빗변 바로 위에 얹는다
  const slope = Math.atan2(RH, RW);
  const T = 0.22; // 판 두께
  const zA = -0.06, zB = RW + 0.3; // 용마루 → 처마(내밀기)
  const slabLen = (zB - zA) / Math.cos(slope);
  const roofW = RL + 0.5;
  const roofCol = new THREE.Color(roofColor);
  for (const s of [-1, 1]) {
    const slab = part(rbox(roofW, T, slabLen, 0.1, 6), 'paint');
    grad(slab.geometry, roofCol.clone().multiplyScalar(0.8), roofCol);
    const zc = (zA + zB) / 2;
    const ye = RH - zc * Math.tan(slope);
    slab.position.set(0, ye + (T / 2) * Math.cos(slope), s * (zc + (T / 2) * Math.sin(slope)));
    slab.rotation.x = s * slope;
    roof.add(slab);
    // 지붕 결(둥근 줄) — 판의 자식으로 판 표면 위에
    for (let i = 0; i < 3; i++) {
      const rib = part(capsule(0.045, roofW - 0.42).rotateZ(Math.PI / 2), 'paint');
      paint(rib.geometry, roofCol.clone().multiplyScalar(0.9));
      rib.position.set(0, T / 2 - 0.012, s * (-0.25 + i * 0.36) * slabLen * 0.5);
      slab.add(rib);
    }
  }
  const ridge = part(capsule(0.15, roofW - 0.2).rotateZ(Math.PI / 2), 'paint', roofCol.clone().multiplyScalar(1.04));
  ridge.position.set(0, RH + 0.17, 0);
  roof.add(ridge);
  roof.rotation.y = Math.PI / 2;
  roof.position.y = BASE + WH - 0.02;
  g.add(roof);
  const y0 = BASE + WH - 0.02;

  // 굴뚝
  const chim = part(rbox(0.36, 0.75, 0.36, 0.08, 4), 'stone');
  grad(chim.geometry, '#a98f7c', '#c9b3a0');
  chim.position.set(0.72, y0 + RH * 0.62, -0.5);
  g.add(chim);
  const cap = part(rbox(0.46, 0.12, 0.46, 0.05, 3), 'stone', '#8b7768');
  cap.position.set(0.72, y0 + RH * 0.62 + 0.4, -0.5);
  g.add(cap);

  // 문(둥근 윗변) + 문틀 + 손잡이 + 계단
  const doorShape = new THREE.Shape();
  doorShape.moveTo(-0.3, 0);
  doorShape.lineTo(0.3, 0);
  doorShape.lineTo(0.3, 0.72);
  doorShape.absarc(0, 0.72, 0.3, 0, Math.PI, false);
  doorShape.lineTo(-0.3, 0);
  const frame = part(roundExtrude(doorShape, 0.08, 0.03, 32), 'matte', '#f7f1e6');
  frame.scale.set(1.18, 1.1, 1);
  frame.position.set(0, BASE + 0.01, WD / 2 + 0.01);
  g.add(frame);
  const door = part(roundExtrude(doorShape, 0.1, 0.035, 32), 'wood');
  grad(door.geometry, '#9a6440', '#b57a4f');
  door.position.set(0, BASE + 0.02, WD / 2 + 0.05);
  g.add(door);
  const knob = part(new THREE.SphereGeometry(0.045, 20, 14), 'gold');
  knob.position.set(0.18, BASE + 0.5, WD / 2 + 0.12);
  g.add(knob);
  const step = part(rbox(0.95, 0.12, 0.45, 0.06, 4), 'stone');
  grad(step.geometry, '#bdb0a0', '#ddd2c2');
  step.position.set(0, 0.06, WD / 2 + 0.35);
  g.add(step);

  // 창문 두 개(틀 + 유리 + 십자 살 + 꽃상자)
  for (const sx of [-1, 1]) {
    const wx = sx * 0.8, wy = BASE + 0.9;
    const fr = part(rbox(0.58, 0.58, 0.08, 0.1, 4), 'matte', '#ffffff');
    fr.position.set(wx, wy, WD / 2 + 0.02);
    g.add(fr);
    const glass = part(rbox(0.44, 0.44, 0.06, 0.07, 3), 'window');
    glass.position.set(wx, wy, WD / 2 + 0.04);
    g.add(glass);
    const mv = part(rbox(0.05, 0.46, 0.05, 0.02, 2), 'matte', '#ffffff');
    mv.position.set(wx, wy, WD / 2 + 0.08);
    g.add(mv);
    const mh = part(rbox(0.46, 0.05, 0.05, 0.02, 2), 'matte', '#ffffff');
    mh.position.set(wx, wy, WD / 2 + 0.08);
    g.add(mh);
    const box = part(rbox(0.62, 0.14, 0.18, 0.05, 3), 'wood', WOOD);
    box.position.set(wx, wy - 0.36, WD / 2 + 0.11);
    g.add(box);
    const fcols = ['#ff8fb1', '#ffd34f', '#ff8fb1', '#ffffff', '#ffd34f'];
    for (let i = 0; i < 5; i++) {
      const fl = part(new THREE.SphereGeometry(0.06, 16, 12), 'matte', fcols[(i + (sx > 0 ? 2 : 0)) % 5]);
      fl.position.set(wx - 0.24 + i * 0.12, wy - 0.26 + (i % 2) * 0.03, WD / 2 + 0.12);
      g.add(fl);
      const lf = part(new THREE.SphereGeometry(0.05, 12, 10), 'matte', '#6cc46a');
      lf.scale.set(1.2, 0.6, 1);
      lf.position.set(wx - 0.18 + i * 0.1, wy - 0.3, WD / 2 + 0.15);
      if (i < 4) g.add(lf);
    }
  }
  // 박공의 둥근 다락 창
  const attF = part(new THREE.TorusGeometry(0.17, 0.045, 12, 32), 'matte', '#ffffff');
  attF.position.set(0, y0 + 0.42, WD / 2 + 0.06);
  g.add(attF);
  const attG = part(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 32).rotateX(Math.PI / 2), 'window');
  attG.position.set(0, y0 + 0.42, WD / 2 + 0.03);
  g.add(attG);
  return g;
}

// ───────── 표지판 ─────────
export function buildSign(text: string): THREE.Group {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const p = part(rbox(0.1, 0.9, 0.1, 0.045, 3), 'wood');
    grad(p.geometry, WOOD_DARK, WOOD);
    p.position.set(sx * 0.42, 0.45, -0.02);
    g.add(p);
  }
  const board = part(roundExtrude(roundRectShape(1.15, 0.52, 0.16), 0.09, 0.035), 'wood');
  grad(board.geometry, '#cf9f6c', '#e0b583');
  board.position.set(0, 0.72, 0.03);
  g.add(board);
  // 글씨: 캔버스 텍스처를 판 앞에(따로 그리는 조각)
  const tex = canvasTex(512, 224, (c) => {
    c.clearRect(0, 0, 512, 224);
    c.fillStyle = '#7a4b2a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '800 92px "Jua", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    c.fillText(text, 256, 104);
    // 작은 별 장식
    c.fillStyle = '#e8a33c';
    for (const [x, y] of [[40, 40], [472, 184]]) {
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 9 : 20, a = -Math.PI / 2 + (i * Math.PI) / 5;
        c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      c.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.02, 0.45),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  label.position.set(0, 0.72, 0.083);
  label.userData.live = true;
  label.receiveShadow = true;
  g.add(label);
  return g;
}

// ───────── 울타리 ─────────
/** n 칸짜리 나무 울타리(x 방향으로 이어짐, 칸 길이 1) */
export function buildFence(n: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i <= n; i++) {
    const p = part(rbox(0.16, 0.78, 0.16, 0.075, 4), 'wood');
    grad(p.geometry, WOOD_DARK, '#d9a874');
    p.position.set(i - n / 2, 0.39, 0);
    g.add(p);
  }
  for (let i = 0; i < n; i++) {
    for (const y of [0.3, 0.58]) {
      const r = part(rbox(1.0, 0.11, 0.07, 0.04, 3), 'wood', WOOD);
      r.position.set(i + 0.5 - n / 2, y, 0.06);
      g.add(r);
    }
  }
  return g;
}

// ───────── 벤치 ─────────
export function buildBench(): THREE.Group {
  const g = new THREE.Group();
  const L = 1.35;
  for (let i = 0; i < 3; i++) {
    const s = part(rbox(L, 0.065, 0.14, 0.03, 3), 'wood');
    grad(s.geometry, WOOD_DARK, '#d5a06a');
    s.position.set(0, 0.42, 0.13 - i * 0.155);
    g.add(s);
  }
  for (let i = 0; i < 2; i++) {
    const b = part(rbox(L, 0.13, 0.06, 0.03, 3), 'wood');
    grad(b.geometry, WOOD_DARK, '#d5a06a');
    b.position.set(0, 0.6 + i * 0.19, -0.27 - i * 0.025);
    b.rotation.x = -0.18;
    g.add(b);
  }
  // 둥근 쇠 틀(짙은 초록): 앞다리는 팔걸이까지, 뒷다리는 등받이 위까지
  const IRON = '#4b6b5c';
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 - 0.12);
    const legF = part(capsule(0.035, 0.58), 'gloss', IRON);
    legF.position.set(x, 0.32, 0.15);
    g.add(legF);
    const legB = part(capsule(0.035, 0.94), 'gloss', IRON);
    legB.position.set(x, 0.5, -0.33);
    legB.rotation.x = -0.12;
    g.add(legB);
    const arm = part(capsule(0.04, 0.5).rotateX(Math.PI / 2), 'gloss', IRON);
    arm.position.set(x, 0.63, -0.08);
    g.add(arm);
    const under = part(capsule(0.025, 0.42).rotateX(Math.PI / 2), 'gloss', IRON);
    under.position.set(x, 0.36, -0.06);
    g.add(under);
  }
  return g;
}

// ───────── 가로등 ─────────
export function buildLamp(): { group: THREE.Group; light: THREE.PointLight } {
  const g = new THREE.Group();
  const col = '#3f5a52';
  const base = part(new THREE.CylinderGeometry(0.17, 0.22, 0.16, 28), 'gloss', col);
  base.geometry = smoothNormals(base.geometry);
  paint(base.geometry, col);
  base.position.y = 0.08;
  g.add(base);
  const pole = part(capsule(0.05, 1.7), 'gloss', col);
  pole.position.y = 0.95;
  g.add(pole);
  const collar = part(new THREE.SphereGeometry(0.09, 20, 14), 'gloss', col);
  collar.position.y = 1.86;
  g.add(collar);
  // 등: 둥근 유리 + 위 갓
  const glass = part(capsule(0.15, 0.12), 'lampGlow');
  glass.position.y = 2.12;
  g.add(glass);
  for (let i = 0; i < 4; i++) {
    const bar = part(capsule(0.018, 0.3), 'gloss', col);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    bar.position.set(Math.cos(a) * 0.16, 2.12, Math.sin(a) * 0.16);
    g.add(bar);
  }
  const hat = part(new THREE.SphereGeometry(0.22, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), 'gloss', col);
  hat.scale.set(1, 0.55, 1);
  hat.position.y = 2.3;
  g.add(hat);
  const knob = part(new THREE.SphereGeometry(0.05, 16, 12), 'gloss', col);
  knob.position.y = 2.43;
  g.add(knob);
  const light = new THREE.PointLight('#ffc27a', 0, 7, 1.6);
  light.position.y = 2.1;
  light.userData.live = true;
  g.add(light);
  return { group: g, light };
}

// ───────── 바위 ─────────
export function buildRocks(rng: () => number, n: number): THREE.Group {
  const g = new THREE.Group();
  const tones = [['#7f7d79', '#b4b0a8'], ['#8a8178', '#bdb4a7'], ['#7b8284', '#adb3b2']];
  for (let i = 0; i < n; i++) {
    const r = i === 0 ? 0.42 + rng() * 0.12 : 0.2 + rng() * 0.12;
    const geo = blob(r, 0.62 + rng() * 0.15, 0.09, rng() * 10, 5);
    const t = tones[Math.floor(rng() * tones.length)];
    grad(geo, t[0], t[1], 0.8);
    const m = part(geo, 'stone');
    const a = rng() * Math.PI * 2, d = i === 0 ? 0 : 0.45 + rng() * 0.25;
    m.position.set(Math.cos(a) * d, r * 0.3, Math.sin(a) * d);
    m.rotation.y = rng() * Math.PI;
    g.add(m);
  }
  return g;
}
