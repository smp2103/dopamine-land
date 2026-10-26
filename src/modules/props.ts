// 소품: 보물상자·풍선 선물·낚시 물고기 그림자·마을 소품(집·우체통·표지판·울타리·벤치·가로등·바위)·해변 조개.
// 정적인 것은 재질별로 합쳐 draw call 을 줄이고, 움직이는 것(뚜껑·풍선·물고기)만 따로 둔다.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { makeMaterials, bake, groundY } from './props/kit';
import { buildChest } from './props/chest';
import { buildHouse, buildMailbox, buildSign, buildFence, buildBench, buildLamp, buildRocks } from './props/village';
import { buildScallop, buildConch, buildStarfish, buildDriftwood } from './props/beach';
import { buildBalloonGift } from './props/balloon';
import { buildFishSpot } from './props/fishing';

// 다른 모듈(꽃·나무)이 집·울타리 자리를 피하도록 먼저 놓는다
export const order = 5;

export default function build(ctx: Ctx) {
  const { island } = ctx;
  const H = island.heightAt;
  const mats = makeMaterials(ctx.rng('props:mat'));
  const root = new THREE.Group();

  /** 땅에 앉히고(발자국 최저 높이) 다른 모듈이 피하도록 등록 */
  const put = (o: THREE.Object3D, x: number, z: number, rotY = 0, foot = 0.3, occupy = 0.8, sink = 0.02) => {
    o.position.set(x, groundY(H, x, z, foot, foot) - sink, z);
    o.rotation.y = rotY;
    root.add(o);
    if (occupy > 0) reserve(ctx, x, z, occupy);
    return o;
  };
  /** 비탈(모래)에 맞춰 기울여 앉힌다 */
  const putTilted = (o: THREE.Object3D, x: number, z: number, rotY: number, sink = 0.01) => {
    const e = 0.15;
    const n = new THREE.Vector3(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    o.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY));
    o.position.set(x, H(x, z) - sink, z);
    root.add(o);
    return o;
  };

  // ── 보물상자: HERO.chest, 카메라(+z) 쪽으로 살짝 돌려서
  const c = island.HERO.chest;
  const chest = put(buildChest({ rng: ctx.rng('props:chest'), onUpdate: ctx.onUpdate, camera: ctx.camera, renderer: ctx.renderer }), c.x, c.z, -0.22, 0.35, 0.9, 0.01);
  chest.scale.setScalar(1.1);

  // ── 마을: 화면 위쪽(북)에 집, 그 앞에 우체통·가로등, 오른쪽에 벤치·울타리
  put(buildHouse('#f07264'), -0.7, -7.3, 0, 1.4, 2.4, 0.05);
  put(buildMailbox('#5aaef0'), 1.45, -5.55, -0.25, 0.15, 0.5);
  const lamps = [buildLamp(), buildLamp()];
  put(lamps[0].group, -2.75, -5.2, 0, 0.2, 0.5);
  put(lamps[1].group, 4.3, 2.3, 0, 0.2, 0.5);
  put(buildBench(), 4.7, -3.2, -0.18, 0.6, 1.0);
  put(buildFence(3), 4.6, -6.3, -0.05, 1.5, 1.6);
  put(buildSign('도파민랜드'), -1.75, 3.7, 0.18, 0.5, 0.8);

  // 둥근 바위 무리
  const rr = ctx.rng('props:rocks');
  for (const [x, z, n] of [[6.6, 0.4, 3], [-3.3, -3.2, 2], [7.4, -7.2, 3], [-2.6, 6.6, 3], [6.2, 6.4, 2]] as const) {
    put(buildRocks(rr, n), x, z, rr() * 6, 0.35, 0.9, 0.08);
  }

  // ── 해변(마른 모래 띠 위)
  const br = ctx.rng('props:beach');
  putTilted(buildScallop('#ff8fa3', '#fff0f0', 0.36), 9.35, 2.0, 0.6);
  putTilted(buildScallop('#ffad70', '#fff3df', 0.3), 8.45, 4.25, -0.9);
  putTilted(buildConch(), 8.85, 3.05, -0.7);
  putTilted(buildStarfish(br), 9.95, 0.85, 0.4);
  putTilted(buildDriftwood(), 7.45, 5.45, 0.5, 0.03);

  // ── 낚시 포인트(강·바다)
  const rf = island.HERO.fishing, sf = island.HERO.seaFishing;
  const ry = island.riverWaterY(rf.x, rf.z);
  root.add(buildFishSpot({ x: rf.x, z: rf.z, waterY: Number.isFinite(ry) ? ry : 0.58, size: 0.85, rx: 0.3, rz: 0.55, phase: 0.4, ringPhase: 4.6, lift: 0.02, opacity: 0.66, onUpdate: ctx.onUpdate }));
  root.add(buildFishSpot({ x: sf.x, z: sf.z, waterY: 0, size: 1.2, rx: 0.9, rz: 0.6, phase: 2.1, ringPhase: 4.9, lift: 0.07, opacity: 0.55, onUpdate: ctx.onUpdate }));

  // ── 풍선 선물(하늘을 떠감)
  root.add(buildBalloonGift({ onUpdate: ctx.onUpdate, heightAt: H }));

  // ── 밤: 가로등·창문 켜기
  ctx.onTod((name) => {
    const k = name === 'night' ? 1 : name === 'sunset' ? 0.45 : 0;
    mats.lampGlow.emissiveIntensity = 3.2 * k;
    mats.window.emissiveIntensity = 1.6 * k;
    mats.window.color.set(k > 0 ? '#ffe7b8' : '#bfe6ff');
    for (const l of lamps) l.light.intensity = 6 * k;
  });

  // (점검용) ?propcam=px,py,pz,tx,ty,tz 면 카메라를 소품 근접 촬영 위치로
  const pc = new URLSearchParams(location.search).get('propcam');
  if (pc) {
    const v = pc.split(',').map(Number);
    ctx.onUpdate(() => {
      ctx.camera.position.set(v[0], v[1], v[2]);
      ctx.camera.lookAt(v[3], v[4], v[5]);
    });
  }

  const out = bake(root, mats);
  out.name = 'props';
  return out;
}

/** 고정 위치를 다른 모듈의 scatter 가 피하도록 등록 */
function reserve(ctx: Ctx, x: number, z: number, r: number) {
  ctx.scatter({
    key: `props:reserve:${x.toFixed(2)},${z.toFixed(2)}`, count: 1, minDist: 0.01,
    bounds: { minX: x - 1e-3, maxX: x + 1e-3, minZ: z - 1e-3, maxZ: z + 1e-3 },
    accept: () => true, avoidOccupied: false, occupy: r,
  });
}
