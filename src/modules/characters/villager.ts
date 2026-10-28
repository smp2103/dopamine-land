// 동물 주민(아기곰 몽실): 동물 주민과 같은 모델(빚은 머리 · 말랑 그림체 눈 · 줄무늬 티 + 칼라·밑단 · 정수리 털) —
// 플레이어를 보며 손을 흔든다. update(t) 만 받으니 dt 는 스스로 잰다.
import * as THREE from 'three';
import { buildAnimal } from './animal';
import type { Rig } from './player';

const FUR = '#f3b77e';
const MUZZLE = '#fff1dc';
const SHIRT_A = '#8fe0c8';

export function buildVillager(): Rig & { setExpression?: (e: 'neutral' | 'blink' | 'smile' | 'happy' | 'surprised' | 'sad' | null) => void; setLod?: (l: 'near' | 'far') => void; head?: THREE.Object3D } {
  const a = buildAnimal({ kind: 'bear', fur: FUR, light: MUZZLE, earIn: '#ffb3ad', iris: '#6b4a3a', outfit: 'stripe', outfitColor: SHIRT_A, acc: 'none' });
  const root = new THREE.Group();
  root.name = 'villager';
  root.add(a.root);
  // 스튜디오 훅(그릇 userData 로도 — 감싸서 쓰는 쪽이 찾게)
  Object.assign(root.userData, { head: a.head, setExpression: a.setExpression, setLod: a.setLod });
  let last = -1;
  return {
    root,
    head: a.head,
    setExpression: a.setExpression,
    setLod: a.setLod,
    update(t) {
      const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, t - last));
      last = t;
      a.update(t, dt, { walk: 0, talk: false, wave: true, happy: false });
    },
  };
}
