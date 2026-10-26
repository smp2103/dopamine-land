// 풍선 선물: 풍선 셋에 매달린 선물 상자가 하늘을 천천히 떠간다(t 기반, 그림자도 땅에 진다).
import * as THREE from 'three';
import { rbox, grad, part, smoothNormals } from './kit';

function balloonGeo(r: number): THREE.BufferGeometry {
  // 아래가 살짝 좁은 물방울 모양(회전체)
  const pts: THREE.Vector2[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;
    const y = Math.sin(a);
    const pinch = y < 0 ? 1 - 0.28 * Math.pow(-y, 1.6) : 1;
    pts.push(new THREE.Vector2(Math.max(1e-3, Math.cos(a) * r * pinch), y * r * 1.12));
  }
  return smoothNormals(new THREE.LatheGeometry(pts, 40), 1e-5);
}

export interface BalloonOpts { onUpdate: (fn: (t: number) => void) => void; heightAt: (x: number, z: number) => number }

export function buildBalloonGift(o: BalloonOpts): THREE.Group {
  const root = new THREE.Group();
  root.name = 'balloonGift';
  root.userData.live = true;
  const rig = new THREE.Group(); // 흔들림 중심 = 풍선 매듭
  root.add(rig);

  // 선물 상자(줄 끝, 매듭 아래 1.0 m)
  const gift = new THREE.Group();
  gift.position.y = -1.05;
  const box = part(rbox(0.42, 0.36, 0.42, 0.08, 5), 'matte');
  grad(box.geometry, '#e9e3ff', '#ffffff');
  gift.add(box);
  // 리본 띠(분홍) 두 줄 + 나비 리본
  const rib1 = part(rbox(0.44, 0.38, 0.1, 0.04, 3), 'paint', '#ff7aa2');
  const rib2 = part(rbox(0.1, 0.38, 0.44, 0.04, 3), 'paint', '#ff7aa2');
  gift.add(rib1, rib2);
  for (const s of [-1, 1]) {
    const loop = part(new THREE.TorusGeometry(0.07, 0.03, 12, 28), 'paint', '#ff7aa2');
    loop.scale.set(1, 0.75, 0.7);
    loop.position.set(s * 0.075, 0.23, 0);
    loop.rotation.set(0, 0, s * 0.5);
    gift.add(loop);
  }
  const knot = part(new THREE.SphereGeometry(0.04, 16, 12), 'paint', '#ff6a96');
  knot.position.y = 0.21;
  gift.add(knot);
  rig.add(gift);

  // 풍선 셋(빨강·노랑·하늘)
  const cols = [['#ff5f6d', '#ff8f99'], ['#ffd34a', '#ffe58a'], ['#62c6ff', '#9fdcff']];
  const offs: Array<[number, number, number, number]> = [[-0.2, 0.75, 0.02, 0.27], [0.24, 0.85, -0.06, 0.3], [0.02, 1.08, 0.12, 0.28]];
  for (let i = 0; i < 3; i++) {
    const [x, y, z, r] = offs[i];
    const bm = part(balloonGeo(r), 'gloss');
    grad(bm.geometry, cols[i][0], cols[i][1], 1.4);
    bm.position.set(x, y, z);
    bm.rotation.z = -x * 0.6;
    rig.add(bm);
    const tie = part(new THREE.ConeGeometry(0.035, 0.06, 16), 'gloss', cols[i][0]);
    tie.position.set(x * 0.92, y - r * 1.12 - 0.02, z);
    rig.add(tie);
    // 줄: 풍선 매듭 → 선물 리본 매듭
    // 가는 관(빛을 받아 밤에 혼자 빛나지 않게)
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x * 0.92, y - r * 1.12 - 0.05, z),
      new THREE.Vector3(x * 0.4, (y - r * 1.12) * 0.4 - 0.5, z * 0.5),
      new THREE.Vector3(0, -1.05 + 0.24, 0),
    ]);
    rig.add(part(new THREE.TubeGeometry(curve, 24, 0.007, 6, false), 'matte', '#f3eee6'));
  }

  // 떠가는 경로: z 고정, x 를 천천히(왼→오), 끝나면 반대편에서 다시
  const Z = -0.5, ALT = 3.4, SPEED = 0.32, SPAN = 30;
  o.onUpdate((t) => {
    const x = ((t * SPEED + 17.7) % SPAN) - SPAN / 2; // t=1.5 에 x ≈ 3.2(집과 겹치지 않게)
    const ground = Math.max(1, o.heightAt(x, Z));
    root.position.set(x, ground + ALT + Math.sin(t * 0.9) * 0.12, Z + Math.sin(t * 0.37) * 0.3);
    rig.rotation.z = Math.sin(t * 0.8) * 0.06;
    rig.rotation.x = Math.sin(t * 0.6 + 1) * 0.04;
    rig.rotation.y = t * 0.15;
    gift.rotation.z = -rig.rotation.z * 0.5;
  });
  return root;
}
