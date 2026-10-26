// 동물 주민(아기곰): 큰 머리, 둥근 귀, 주둥이, 그림 얼굴, 줄무늬 티. 플레이어를 보며 손을 흔든다.
import * as THREE from 'three';
import { ellipsoid, halfEllipsoid, planarUV, lathe, capsule } from './geo';
import { stripeTexture, muzzleTexture } from './tex';
import { skinMat, clothMat, glossMat, mesh, faceHead, blinkClosed, mergeByMaterial } from './kit';
import type { Rig } from './player';

const FUR = '#f3b77e';
const MUZZLE = '#fff1dc';
const EAR_IN = '#ffb3ad';
const SHIRT_A = '#8fe0c8';
const SHIRT_B = '#ffffff';

export function buildVillager(): Rig {
  const root = new THREE.Group();
  root.name = 'villager';
  const fur = skinMat(FUR);
  const stripes = stripeTexture(SHIRT_A, SHIRT_B, 7);
  const shirt = clothMat(SHIRT_A, stripes);
  const sleeve = clothMat(SHIRT_A, stripes);

  // 짧고 통통한 다리 + 발
  for (const m of [-1, 1]) {
    const x = m * 0.088;
    root.add(mesh(ellipsoid(0.075, 0.058, 0.092), fur, x, 0.055, 0.02));
    root.add(mesh(capsule(0.06, 0.18), fur, x, 0.13, 0));
  }

  const body = new THREE.Group();
  root.add(body);
  // 배·엉덩이(털) + 줄무늬 티
  const belly = mesh(ellipsoid(0.16, 0.13, 0.14), fur, 0, 0.24, 0);
  body.add(belly);
  const torso = mesh(lathe([
    [0, 0.2], [0.13, 0.205], [0.185, 0.25], [0.19, 0.32], [0.172, 0.42], [0.13, 0.5], [0.07, 0.53], [0, 0.54],
  ], 64, 40), shirt);
  torso.scale.z = 0.88;
  body.add(torso);
  // 꼬리
  body.add(mesh(ellipsoid(0.055, 0.055, 0.05), fur, 0, 0.25, -0.15));

  // 팔: -x 쪽 팔을 들어 흔든다
  const arms: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(m * 0.135, 0.44, 0);
    arm.rotation.z = m * 0.38;
    arm.add(mesh(lathe([[0, 0.03], [0.055, 0.028], [0.07, 0.0], [0.072, -0.05], [0.068, -0.085], [0.05, -0.08]], 40, 24), sleeve));
    arm.add(mesh(capsule(0.05, 0.16), fur, 0, -0.1, 0));
    arm.add(mesh(ellipsoid(0.058, 0.06, 0.055), fur, 0, -0.18, 0.004));
    body.add(arm);
    arms.push(arm);
  }

  // 머리
  const RX = 0.36, RY = 0.315, RZ = 0.33;
  const head = new THREE.Group();
  head.position.set(0, 0.53 + RY * 0.9, 0);
  root.add(head);
  const face = faceHead(RX, RY, RZ, FUR, {
    skin: FUR,
    eyeX: 0.4, eyeY: 0.08, eyeW: 0.1, eyeH: 0.135,
    iris: '#6b4a3a',
    blush: { x: 0.62, y: -0.16, w: 0.14, h: 0.085, color: '#ff8f86' },
    mouth: 'none',
  }, 0.07);
  head.add(face.group);
  // 주둥이: 앞 반쪽에 ω 입 그림
  const MZ = { x: 0.15, y: 0.105, z: 0.1 };
  const muzzleFront = halfEllipsoid(MZ.x, MZ.y, MZ.z, true, 48, 32);
  planarUV(muzzleFront, MZ.x, MZ.y);
  const muzzle = new THREE.Group();
  muzzle.position.set(0, -0.11, RZ * 0.8);
  muzzle.add(mesh(muzzleFront, skinMat(MUZZLE, muzzleTexture(MUZZLE, '#5a3a2e'))));
  muzzle.add(mesh(halfEllipsoid(MZ.x, MZ.y, MZ.z, false, 48, 32), skinMat(MUZZLE)));
  head.add(muzzle);
  // 코
  muzzle.add(mesh(ellipsoid(0.05, 0.034, 0.034), glossMat('#5a3a2e', 0.3), 0, 0.045, MZ.z * 0.86));
  // 둥근 귀 + 안쪽 분홍
  const earIn = skinMat(EAR_IN);
  for (const m of [-1, 1]) {
    const ear = new THREE.Group();
    const el = 0.8, az = m * 0.72;
    ear.position.set(Math.sin(az) * Math.cos(el) * RX * 0.98, Math.sin(el) * RY * 0.98, Math.cos(az) * Math.cos(el) * RZ * 0.98 + 0.03);
    ear.rotation.set(-0.1, az * 0.55, -m * 0.45);
    ear.add(mesh(ellipsoid(0.1, 0.095, 0.055), fur));
    ear.add(mesh(ellipsoid(0.062, 0.058, 0.03), earIn, 0, -0.005, 0.03));
    head.add(ear);
  }

  // 정지 부품은 재질별로 합친다
  for (const g of [root, body, head, ...arms]) mergeByMaterial(g);
  const headBaseY = head.position.y;
  return {
    root,
    update(t) {
      const b = Math.sin(t * 2.3 + 1.0);
      body.scale.set(1 + 0.01 * b, 1 + 0.016 * b, 1 + 0.01 * b);
      head.position.y = headBaseY + 0.009 * b;
      // 손 흔들기: 카메라 쪽(-x) 팔을 높이 들고 좌우로
      arms[0].rotation.z = -(2.5 + 0.32 * Math.sin(t * 7.0));
      arms[0].rotation.x = -0.3;
      arms[1].rotation.z = 0.38 + 0.02 * b;
      head.rotation.z = -0.07 + 0.05 * Math.sin(t * 3.5);
      face.setBlink(blinkClosed(t, 4.1, 2.0));
    },
  };
}
