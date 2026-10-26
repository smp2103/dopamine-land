// 캐릭터: 플레이어(HERO.player) + 동물 주민(HERO.villager), 접지 그림자, 감정 말풍선, 대기 애니메이션.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { buildPlayer } from './characters/player';
import { buildVillager } from './characters/villager';
import { blobShadow } from './characters/kit';
import { bubbleTexture } from './characters/tex';

export const order = 20;

export default function build(ctx: Ctx) {
  const { island, camera } = ctx;
  const { HERO } = island;
  const group = new THREE.Group();
  group.name = 'characters';

  const player = buildPlayer();
  const py = island.heightAt(HERO.player.x, HERO.player.z);
  player.root.position.set(HERO.player.x, py, HERO.player.z);
  group.add(player.root);

  const vill = buildVillager();
  const vx = HERO.villager.x, vz = HERO.villager.z;
  const vy = island.heightAt(vx, vz);
  vill.root.position.set(vx, vy, vz);
  // 플레이어를 바라본다(카메라 쪽으로 조금 더 틀어 얼굴이 읽히게)
  vill.root.rotation.y = Math.atan2(HERO.player.x - vx, HERO.player.z - vz) - 0.12;
  group.add(vill.root);

  // 발밑 둥근 그림자
  const ps = blobShadow(0.32, 0.38);
  ps.position.set(HERO.player.x, py + 0.012, HERO.player.z);
  ps.scale.z = 0.85;
  group.add(ps);
  const vs = blobShadow(0.34, 0.38);
  vs.position.set(vx, vy + 0.012, vz);
  group.add(vs);

  // 감정 말풍선(♪) — 카메라를 향하는 판
  const bubble = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.46),
    new THREE.MeshBasicMaterial({ map: bubbleTexture('note'), transparent: true, depthWrite: false, alphaTest: 0.02 }),
  );
  bubble.renderOrder = 5;
  const bubbleBase = new THREE.Vector3(vx + 0.18, vy + 1.48, vz + 0.05);
  bubble.position.copy(bubbleBase);
  group.add(bubble);

  ctx.onUpdate((t) => {
    player.update(t);
    vill.update(t);
    // 말풍선: 둥실 + 살짝 통통
    const k = Math.sin(t * 2.6);
    bubble.position.set(bubbleBase.x, bubbleBase.y + 0.035 * k, bubbleBase.z);
    bubble.quaternion.copy(camera.quaternion);
    bubble.scale.setScalar(1 + 0.04 * Math.max(0, Math.sin(t * 5.2)));
  });

  return group;
}
