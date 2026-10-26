// 플레이어(동숲 주민 사람): 키 ≈1.3 m, 2.5등신, 그림 얼굴, 반팔 티 + 반바지.
import * as THREE from 'three';
import { ellipsoid, lathe, capsule, hairCap, taperTube } from './geo';
import { teeTexture } from './tex';
import { skinMat, clothMat, glossMat, mesh, faceHead, blinkClosed, mergeByMaterial } from './kit';

const SKIN = '#ffd4b4';
const HAIR = '#784a2e';
const TEE = '#ff8e86';
const SHORTS = '#5d8fd8';
const SHOE = '#fff7ee';
const SOLE = '#f0675c';

export interface Rig {
  root: THREE.Group;
  update: (t: number) => void;
}

export function buildPlayer(): Rig {
  const root = new THREE.Group();
  root.name = 'player';
  const skin = skinMat(SKIN);
  const tee = clothMat(TEE, teeTexture(TEE, '#ffffff'));
  const sleeveMat = clothMat(TEE);
  const shorts = clothMat(SHORTS);
  const shoe = clothMat(SHOE);
  const sole = glossMat(SOLE, 0.5);

  // 다리·신발(고정)
  for (const m of [-1, 1]) {
    const x = m * 0.08;
    root.add(mesh(ellipsoid(0.07, 0.054, 0.098), shoe, x, 0.06, 0.022));
    root.add(mesh(ellipsoid(0.074, 0.03, 0.102), sole, x, 0.033, 0.022));
    root.add(mesh(capsule(0.046, 0.17), skin, x, 0.15, 0));
  }

  // 몸통(숨쉬기로 위아래 스케일)
  const body = new THREE.Group();
  root.add(body);
  // 반바지: 엉덩이 통 + 바짓단(엉덩이 속에서 시작해 이음매가 안 보이게)
  const hip = mesh(lathe([[0, 0.19], [0.12, 0.193], [0.158, 0.225], [0.162, 0.29], [0.15, 0.33], [0, 0.34]]), shorts);
  hip.scale.z = 0.86;
  body.add(hip);
  for (const m of [-1, 1]) {
    const leg = mesh(lathe([[0.04, 0.27], [0.078, 0.255], [0.084, 0.2], [0.083, 0.17], [0.075, 0.158], [0.054, 0.163]], 40, 24), shorts, m * 0.075, 0, 0);
    leg.rotation.z = m * 0.05;
    leg.scale.z = 0.95;
    body.add(leg);
  }
  // 티셔츠 몸통: 아래로 살짝 퍼진 짧고 통통한 통
  const torso = mesh(lathe([
    [0, 0.29], [0.125, 0.292], [0.16, 0.318], [0.163, 0.39], [0.152, 0.47], [0.124, 0.54], [0.078, 0.582], [0, 0.592],
  ], 64, 40), tee);
  torso.scale.z = 0.84;
  body.add(torso);
  // 목둘레 시보리
  const collar = mesh(new THREE.TorusGeometry(0.064, 0.013, 16, 48), clothMat('#ffffff'), 0, 0.578, 0);
  collar.rotation.x = Math.PI / 2;
  body.add(collar);

  // 팔: 어깨 피벗(몸통 안) → 소매 + 팔 + 둥근 손
  const arms: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(m * 0.112, 0.52, 0);
    arm.rotation.z = m * 0.3;
    arm.rotation.x = -0.05;
    arm.add(mesh(lathe([[0, 0.02], [0.05, 0.016], [0.068, -0.02], [0.072, -0.07], [0.07, -0.105], [0.06, -0.113], [0.044, -0.104]], 40, 24), sleeveMat));
    arm.add(mesh(capsule(0.04, 0.16), skin, 0, -0.14, 0));
    arm.add(mesh(ellipsoid(0.05, 0.056, 0.048), skin, 0, -0.225, 0.004));
    body.add(arm);
    arms.push(arm);
  }

  // 머리
  const hairMat = glossMat(HAIR, 0.66);
  const hairMatV = glossMat('#ffffff', 0.66);
  hairMatV.vertexColors = true;
  const RX = 0.305, RY = 0.28, RZ = 0.29;
  const head = new THREE.Group();
  head.position.set(0, 0.592 + RY * 0.9, 0.0);
  head.rotation.x = -0.12;
  root.add(head);
  const face = faceHead(RX, RY, RZ, SKIN, {
    skin: SKIN,
    eyeX: 0.34, eyeY: -0.05, eyeW: 0.125, eyeH: 0.175,
    iris: '#8a5a3c',
    brow: { color: '#9a6444', y: 0.26, w: 0.065 },
    blush: { x: 0.56, y: -0.28, w: 0.15, h: 0.09, color: '#ff9a9a' },
    mouth: 'smile', mouthY: -0.36,
    nose: { y: -0.19, color: '#f2b79c' },
  });
  head.add(face.group);
  // 귀(머리카락 아래로 살짝)
  for (const m of [-1, 1]) {
    head.add(mesh(ellipsoid(0.03, 0.046, 0.028), skin, m * RX * 0.99, -0.08, 0.0));
  }
  const hair = mesh(hairCap({
    rx: RX, ry: RY, rz: RZ,
    front: 0.52, side: -0.3, back: -0.8,
    locks: 4.6, lockDepth: 0.22, puff: 0.11, sidePuff: 0.03, sweep: 0.12,
    color: HAIR, shine: '#b07a52',
  }), hairMatV);
  head.add(hair);
  // 정수리 삐침 머리 한 가닥
  head.add(mesh(taperTube([
    new THREE.Vector3(0.0, RY * 1.0, -0.02), new THREE.Vector3(0.015, RY * 1.17, 0.0),
    new THREE.Vector3(0.05, RY * 1.27, 0.035), new THREE.Vector3(0.085, RY * 1.25, 0.06),
  ], 0.022), hairMat));

  // 키 1.3 m 로 맞춤(정수리 ≈ 1.16 → ×1.12)
  root.scale.setScalar(1.12);
  root.rotation.y = THREE.MathUtils.degToRad(20);

  // 정지 부품은 재질별로 합친다
  for (const g of [root, body, head, ...arms]) mergeByMaterial(g);
  const headBaseY = head.position.y;
  return {
    root,
    update(t) {
      // 숨쉬기: 몸은 살짝 부풀고 머리는 따라 오르내린다
      const b = Math.sin(t * 2.1);
      body.scale.set(1 + 0.008 * b, 1 + 0.014 * b, 1 + 0.008 * b);
      head.position.y = headBaseY + 0.008 * b;
      head.rotation.z = 0.04 * Math.sin(t * 0.9);
      for (const [i, a] of arms.entries()) a.rotation.z = (i ? 1 : -1) * (0.32 + 0.02 * b);
      face.setBlink(blinkClosed(t, 3.6, 0.4));
    },
  };
}
