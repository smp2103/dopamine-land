// 플레이어(동숲 주민 사람): 키 ≈1.3 m, 2.5등신, 그림 얼굴, 반팔 티 + 반바지.
// 관절(엉덩이·어깨·다리) 피벗이 있어 걷기·달리기·점프·활공·수영·잠수·탑승·동작 포즈를 잡는다.
// 동작(game.player.action, 계약 v2 3장): fish cast reel net dig shake chop hit pick pet hold cheer stung sit sleep eat wave photo plant water peace.
// 들어 올리기(hold)·만세(cheer) 땐 '> <' 눈 + 진한 볼(GDD 7.2), 벌에 쏘이면(stung) 볼이 퉁퉁 + 머리 위 어질어질 별.
// 부수효과 없는 빌더(다른 모듈이 buildPlayer 를 import 해도 된다).
import * as THREE from 'three';
import { ellipsoid, lathe, capsule, hairCap, taperTube } from './geo';
import { teeTexture, bubbleTexture } from './tex';
import { skinMat, clothMat, glossMat, mesh, faceHead, blinkClosed, mergeByMaterial } from './kit';
import { buildGlider, buildRod, buildNet, buildShovel, buildAxe, buildHammer, buildCan, buildCamera, buildSnack, buildSprout } from './gear';

/** 아바타가 잡을 수 있는 동작 포즈 */
export const PLAYER_POSES = [
  'fish', 'cast', 'reel', 'net', 'dig', 'shake', 'chop', 'hit', 'pick', 'pet', 'hold',
  'cheer', 'stung', 'sit', 'sleep', 'eat', 'wave', 'photo', 'plant', 'water', 'peace',
] as const;

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

export interface PoseState {
  speed: number;
  mode: 'ground' | 'air' | 'glide' | 'swim' | 'dive' | 'mounted';
  action: string | null;
  t: number;
  dt: number;
}

export interface PlayerRig extends Rig {
  animate: (s: PoseState) => void;
  holdSlot: THREE.Object3D;
}

const HIP_Y = 0.24;
const SHOULDER_Y = 0.52;
const lerp = THREE.MathUtils.lerp;

export function buildPlayer(): PlayerRig {
  const root = new THREE.Group();
  root.name = 'player';
  const skin = skinMat(SKIN);
  const tee = clothMat(TEE, teeTexture(TEE, '#ffffff'));
  const sleeveMat = clothMat(TEE);
  const shorts = clothMat(SHORTS);
  const shoe = clothMat(SHOE);
  const sole = glossMat(SOLE, 0.5);

  // 전신 자세(통통 튀기·기울기) — 엉덩이 높이가 피벗
  const pose = new THREE.Group();
  pose.position.y = HIP_Y;
  root.add(pose);

  // 다리: 엉덩이 관절 피벗 → 바짓단 + 다리 + 신발
  const legs: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const leg = new THREE.Group();
    const x = m * 0.08;
    leg.position.set(x, 0, 0);
    leg.add(mesh(ellipsoid(0.07, 0.054, 0.098), shoe, 0, 0.06 - HIP_Y, 0.022));
    leg.add(mesh(ellipsoid(0.074, 0.03, 0.102), sole, 0, 0.033 - HIP_Y, 0.022));
    leg.add(mesh(capsule(0.046, 0.17), skin, 0, 0.15 - HIP_Y, 0));
    const cuff = mesh(lathe([[0.04, 0.27], [0.078, 0.255], [0.084, 0.2], [0.083, 0.17], [0.075, 0.158], [0.054, 0.163]], 40, 24), shorts, m * 0.075 - x, -HIP_Y, 0);
    cuff.rotation.z = m * 0.05;
    cuff.scale.z = 0.95;
    leg.add(cuff);
    pose.add(leg);
    legs.push(leg);
  }

  // 몸통(숨쉬기로 위아래 스케일) — 엉덩이 피벗 기준
  const body = new THREE.Group();
  pose.add(body);
  const torsoParts = new THREE.Group();
  torsoParts.position.y = -HIP_Y;
  body.add(torsoParts);
  const hip = mesh(lathe([[0, 0.19], [0.12, 0.193], [0.158, 0.225], [0.162, 0.29], [0.15, 0.33], [0, 0.34]]), shorts);
  hip.scale.z = 0.86;
  torsoParts.add(hip);
  const torso = mesh(lathe([
    [0, 0.29], [0.125, 0.292], [0.16, 0.318], [0.163, 0.39], [0.152, 0.47], [0.124, 0.54], [0.078, 0.582], [0, 0.592],
  ], 64, 40), tee);
  torso.scale.z = 0.84;
  torsoParts.add(torso);
  const collar = mesh(new THREE.TorusGeometry(0.064, 0.013, 16, 48), clothMat('#ffffff'), 0, 0.578, 0);
  collar.rotation.x = Math.PI / 2;
  torsoParts.add(collar);

  // 팔: 어깨 피벗 → 소매 + 팔 + 둥근 손. arms[0] = 오른팔(-x), arms[1] = 왼팔(+x)
  const arms: THREE.Group[] = [];
  const hands: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(m * 0.112, SHOULDER_Y - HIP_Y, 0);
    arm.rotation.z = m * 0.3;
    arm.add(mesh(lathe([[0, 0.02], [0.05, 0.016], [0.068, -0.02], [0.072, -0.07], [0.07, -0.105], [0.06, -0.113], [0.044, -0.104]], 40, 24), sleeveMat));
    arm.add(mesh(capsule(0.04, 0.16), skin, 0, -0.14, 0));
    arm.add(mesh(ellipsoid(0.05, 0.056, 0.048), skin, 0, -0.225, 0.004));
    const hand = new THREE.Group();
    hand.position.set(0, -0.225, 0.004);
    arm.add(hand);
    body.add(arm);
    arms.push(arm);
    hands.push(hand);
  }

  // 머리(몸을 따라 기울지만 숨쉬기 스케일은 받지 않게 pose 에 단다)
  const hairMat = glossMat(HAIR, 0.66);
  const hairMatV = glossMat('#ffffff', 0.66);
  hairMatV.vertexColors = true;
  // 물속 색보정에도 갈색이 남게 아주 약한 자체광(물속에서 더 올린다)
  for (const hm of [hairMat, hairMatV]) { hm.emissive.set(HAIR); hm.emissiveIntensity = 0.05; }
  const RX = 0.305, RY = 0.28, RZ = 0.29;
  const head = new THREE.Group();
  head.position.set(0, 0.592 + RY * 0.9 - HIP_Y, 0.0);
  head.rotation.x = -0.12;
  pose.add(head);
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
  for (const m of [-1, 1]) head.add(mesh(ellipsoid(0.03, 0.046, 0.028), skin, m * RX * 0.99, -0.08, 0.0));
  head.add(mesh(hairCap({
    rx: RX, ry: RY, rz: RZ,
    front: 0.52, side: -0.3, back: -0.8,
    locks: 4.6, lockDepth: 0.22, puff: 0.11, sidePuff: 0.03, sweep: 0.12,
    color: HAIR, shine: '#b07a52', backDetail: true,
  }), hairMatV));
  // 뒷머리 끝 삐침 세 가닥(목덜미에서 바깥으로 살짝 말려 올라감)
  for (const [az, len] of [[-0.55, 1], [0.05, 0.85], [0.6, 1.05]] as const) {
    const a = Math.PI + az, el = -0.62;
    const at = (e: number, k: number) => new THREE.Vector3(Math.sin(a) * Math.cos(e) * RX * k, Math.sin(e) * RY * k, Math.cos(a) * Math.cos(e) * RZ * k);
    const p0 = at(el + 0.25, 1.02), p1 = at(el, 1.08), p2 = at(el - 0.12 * len, 1.2), p3 = at(el - 0.1 * len, 1.32);
    p3.y += 0.03;
    head.add(mesh(taperTube([p0, p1, p2, p3], 0.04, 20, 12), hairMat));
  }
  const tuft = mesh(taperTube([
    new THREE.Vector3(0.0, RY * 1.0, -0.02), new THREE.Vector3(0.015, RY * 1.17, 0.0),
    new THREE.Vector3(0.05, RY * 1.27, 0.035), new THREE.Vector3(0.085, RY * 1.25, 0.06),
  ], 0.022), hairMat);
  head.add(tuft);

  // 정지 부품은 재질별로 합친다(삐침 머리는 따로 흔들리게 빼 둔다)
  head.remove(tuft);
  for (const g of [torsoParts, head, ...arms, ...legs]) mergeByMaterial(g);
  head.add(tuft);

  // ── 도구·글라이더 ──
  const rod = buildRod();
  const net = buildNet();
  const shovel = buildShovel();
  const axe = buildAxe();
  const hammer = buildHammer();
  const can = buildCan();
  const camTool = buildCamera();
  const snack = buildSnack();
  const sprout = buildSprout();
  // 브이(✌): 오른손에서 뻗는 손가락 두 개
  const vsign = new THREE.Group();
  for (const sg of [-1, 1]) {
    const f = mesh(capsule(0.016, 0.06), skin, sg * 0.018, -0.06, 0.01);
    f.rotation.z = sg * 0.28;
    vsign.add(f);
  }
  vsign.rotation.x = Math.PI;
  const tools = [rod.root, net, shovel, axe, hammer, can, camTool, snack, sprout, vsign];
  for (const tool of tools) { tool.visible = false; hands[0].add(tool); }

  // 벌에 쏘인 볼(퉁퉁) — 얼굴 양옆, 처음엔 0 크기
  const puffM = skinMat('#ffb9b0');
  const puffs: THREE.Mesh[] = [];
  for (const m of [-1, 1]) {
    const pf = mesh(ellipsoid(0.09, 0.075, 0.07, 28, 18), puffM, m * RX * 0.66, -0.13, RZ * 0.66);
    pf.scale.setScalar(0.001);
    pf.castShadow = false;
    head.add(pf);
    puffs.push(pf);
  }
  // 어질어질 별 세 개(머리 위를 빙글빙글)
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.022 : 0.05;
    if (i) starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.018, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
  starGeo.center();
  const starM = new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffcf4a', emissiveIntensity: 0.6, roughness: 0.4 });
  const dizzy = new THREE.Group();
  dizzy.position.set(0, RY * 1.25, 0);
  dizzy.visible = false;
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(starGeo, starM);
    st.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.24, 0, Math.sin((i / 3) * Math.PI * 2) * 0.24);
    dizzy.add(st);
  }
  head.add(dizzy);
  // 잘 때 머리 위 'Zzz'(스프라이트 — 늘 카메라를 본다)
  const zzz = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture('zzz', 256), transparent: true, depthWrite: false }));
  zzz.scale.setScalar(0.42);
  zzz.position.set(0.22, 1.42, 0);
  zzz.visible = false;
  root.add(zzz);
  const glider = buildGlider();
  root.add(glider.root);

  // 머리 위 두 손 사이(들어 올리기 자리)
  const holdSlot = new THREE.Object3D();
  holdSlot.name = 'holdSlot';
  holdSlot.position.set(0, 1.42, 0.04);
  root.add(holdSlot);

  // 키 1.3 m 로 맞춤(정수리 ≈ 1.16 → ×1.12)
  root.scale.setScalar(1.12);
  root.rotation.y = THREE.MathUtils.degToRad(20);

  const headBaseY = head.position.y;
  let phase = 0;
  let glideOpen = 0;
  let lastT = 0;
  let holdT0 = -9, wasHeld = false;
  const cur = {
    poseY: 0, poseRX: 0, poseRZ: 0,
    armX: [0, 0], armZ: [-0.3, 0.3], armY: [0, 0],
    legX: [0, 0], legZ: [0, 0],
    headRX: -0.12, headRZ: 0, lift: 0, hold: 0, puff: 0,
  };

  function animate(s0: PoseState) {
    let s = s0;
    const { t } = s;
    const dt = Math.max(0, s.dt);
    const snap = dt === 0; // 촬영 모드: 목표 포즈로 바로
    const k = snap ? 1 : 1 - Math.exp(-dt * 14);
    // 촬영 모드(물리 정지)에선 공중 판정이 풀리지 않으니 서 있는 자세로
    if (snap && s.mode === 'air') s = { ...s, mode: 'ground' };
    const held = holdSlot.children.length > 0;
    if (held && !wasHeld) holdT0 = t;
    wasHeld = held;
    // 뭔가 들고 있으면(낚시·채집 직후 포함) 다른 동작보다 '들기'가 먼저
    const action = held && s.mode !== 'swim' && s.mode !== 'dive' && s.mode !== 'mounted' && s.mode !== 'glide' ? 'hold' : s.action;
    let holdLift = 0;

    // 걸음 위상: 속도에 비례
    const sp = s.mode === 'ground' ? s.speed : 0;
    if (!snap) phase += dt * (sp > 0.2 ? 3.2 + sp * 1.15 : 0);
    else if (sp > 0.2) phase = t * (3.2 + sp * 1.15);
    const moving = s.mode === 'ground' && s.speed > 0.4;
    const run = moving ? THREE.MathUtils.smoothstep(s.speed, 5.6, 8.5) : 0;
    const amp = moving ? THREE.MathUtils.clamp(s.speed / 5, 0.35, 1) : 0;
    const sw = Math.sin(phase);
    const breath = Math.sin(t * 2.1);

    let poseY = 0, poseRX = 0, poseRZ = 0;
    const armX = [0, 0], armZ = [-0.32 - 0.02 * breath, 0.32 + 0.02 * breath], armY = [0, 0];
    const legX = [0, 0], legZ = [0, 0];
    let headRX = -0.12, headRZ = 0.04 * Math.sin(t * 0.9);
    for (const hm of [hairMat, hairMatV]) hm.emissiveIntensity = s.mode === 'dive' || s.mode === 'swim' ? 0.11 : 0.05;
    let wantGlide = false;
    let lift = 0;
    let happy = false;
    /** '> <' 눈 + 진한 볼(들기·만세) */
    let joy = false;
    /** 눈 감기(잠·어질어질) */
    let shut = false;
    let puffW = 0;
    for (const tool of tools) tool.visible = false;
    dizzy.visible = false;
    zzz.visible = false;

    if (s.mode === 'mounted') {
      // 앉은 자세: 다리 앞으로, 두 손은 앞(손잡이)
      poseY = -0.17;
      legX[0] = legX[1] = -1.45;
      legZ[0] = 0.12; legZ[1] = -0.12;
      armX[0] = armX[1] = -0.95;
      armZ[0] = -0.18; armZ[1] = 0.18;
      poseRX = 0.06;
      headRX = -0.05 + 0.03 * Math.sin(t * 3);
    } else if (s.mode === 'glide') {
      // 활공: 두 팔 위로 손잡이 잡고, 다리는 흔들흔들
      wantGlide = true;
      lift = 1;
      armX[0] = armX[1] = -2.75;
      armZ[0] = -0.62; armZ[1] = 0.62;
      legX[0] = 0.4 + 0.22 * Math.sin(t * 4.2);
      legX[1] = 0.4 + 0.22 * Math.sin(t * 4.2 + 2.2);
      poseRX = 0.26;
      headRX = -0.42;
      poseY = 0.02 * Math.sin(t * 2.4);
      happy = Math.sin(t * 0.7) > 0.6;
    } else if (s.mode === 'air') {
      // 점프: 팔 만세, 다리 웅크림
      lift = 0.6;
      armX[0] = armX[1] = -0.9;
      armZ[0] = -1.75; armZ[1] = 1.75;
      legX[0] = -0.75; legX[1] = -0.2;
      poseRX = -0.05;
      headRX = -0.25;
      happy = true;
    } else if (s.mode === 'swim') {
      // 헤엄: 몸을 살짝 앞으로, 평영 팔 + 발차기, 머리만 물 위
      const st = t * (s.speed > 0.5 ? 4.2 : 2.2);
      poseY = 0.64 + 0.03 * Math.sin(t * 2.2); // 바다 표면(물결)이 해수면보다 높게 그려져 머리가 잠기지 않게 띄운다
      poseRX = 0.26;
      headRX = -0.4;
      const stroke = Math.sin(st);
      armX[0] = armX[1] = -1.35 + 0.45 * stroke;
      armZ[0] = -0.55 - 0.5 * Math.max(0, stroke); armZ[1] = -armZ[0];
      legX[0] = 0.35 + 0.35 * Math.sin(st * 2);
      legX[1] = 0.35 + 0.35 * Math.sin(st * 2 + Math.PI);
    } else if (s.mode === 'dive') {
      // 잠수: 몸을 수평으로 눕히고(≈70°) 팔은 앞으로 쭉 뻗어 평영으로 젓고, 다리는 위아래 번갈아 찬다.
      // 뒤에서 봐도 머리 → 몸통 → 다리가 한 줄로 이어진 사람 실루엣이 되게.
      const st = t * 2.4;
      poseRX = 1.22;
      poseY = 0.05 * Math.sin(st);
      headRX = -0.95;
      const c = (st / (Math.PI * 2)) % 1;
      // 평영: 앞으로 쭉(0~0.45) → 옆으로 크게 젓기(0.45~0.75) → 가슴으로 모아 다시 뻗기
      const sweep = c < 0.45 ? 0 : c < 0.75 ? THREE.MathUtils.smoothstep(c, 0.45, 0.75) : 1 - THREE.MathUtils.smoothstep(c, 0.75, 1);
      armX[0] = armX[1] = -2.95 + 1.15 * sweep;
      armZ[0] = -0.12 - 1.1 * sweep; armZ[1] = -armZ[0];
      const kick = Math.sin(t * 7.5);
      legX[0] = 0.12 + 0.42 * kick;
      legX[1] = 0.12 - 0.42 * kick;
      legZ[0] = 0.06; legZ[1] = -0.06;
    } else {
      // 땅: 걷기·달리기 사이클 + 동작
      if (moving) {
        const bounce = Math.abs(Math.sin(phase));
        poseY = (0.022 + 0.03 * run) * bounce - 0.01;
        poseRX = 0.06 + 0.16 * run;
        poseRZ = 0.04 * sw * amp;
        legX[0] = 0.62 * amp * sw * (1 + 0.25 * run);
        legX[1] = -legX[0];
        armX[0] = -0.75 * amp * sw * (1 + 0.2 * run);
        armX[1] = -armX[0];
        armZ[0] -= 0.12 * run; armZ[1] += 0.12 * run;
        headRX = -0.12 - 0.12 * run + 0.03 * Math.cos(phase * 2);
        headRZ = -0.05 * sw * amp;
      } else {
        poseY = 0.004 * breath;
      }
      switch (action) {
        case 'fish': {
          // 낚싯대를 앞으로 들고 찌를 기다린다(가끔 톡 당김)
          rod.root.visible = true;
          const tug = Math.max(0, Math.sin(t * 1.3)) ** 8;
          armX[0] = -1.05 - 0.15 * tug;
          armZ[0] = -0.05;
          armY[0] = 0.15;
          armX[1] = -0.75; armZ[1] = -0.35;
          headRX = 0.05;
          rod.setTension(tug);
          break;
        }
        case 'net': {
          // 잠자리채 휘두르기: 위에서 앞 아래로 크게
          net.visible = true;
          const c = (t * 1.4) % 1;
          const swing = c < 0.35 ? THREE.MathUtils.smoothstep(c, 0, 0.35) : 1 - THREE.MathUtils.smoothstep(c, 0.5, 1);
          armX[0] = -2.6 + 1.9 * swing;
          armZ[0] = -0.2 - 0.5 * swing;
          armX[1] = -1.4 + 1.0 * swing; armZ[1] = -0.25;
          poseRX = 0.05 + 0.22 * swing;
          poseRZ = -0.06 * swing;
          headRX = -0.2 + 0.25 * swing;
          break;
        }
        case 'dig': {
          // 삽질: 두 손 앞 아래, 푹 찌르고 퍼올리기
          shovel.visible = true;
          const c = (t * 1.6) % 1;
          const push = Math.sin(c * Math.PI);
          armX[0] = -0.7 - 0.5 * push; armZ[0] = 0.05;
          armX[1] = -0.95 - 0.4 * push; armZ[1] = -0.35;
          poseRX = 0.18 + 0.2 * push;
          poseY = -0.03 * push;
          legX[0] = -0.25; legX[1] = 0.2;
          headRX = 0.15;
          break;
        }
        case 'shake': {
          // 나무 흔들기: 두 팔 앞으로 쭉, 빠르게 덜덜
          const j = Math.sin(t * 26);
          armX[0] = armX[1] = -1.45 + 0.12 * j;
          armZ[0] = 0.12; armZ[1] = -0.12;
          poseRX = -0.06 + 0.04 * j;
          poseRZ = 0.03 * Math.sin(t * 13);
          legX[0] = -0.3; legX[1] = 0.25;
          headRX = -0.25;
          break;
        }
        case 'pet': {
          // 쓰다듬기: 오른손으로 앞 아래 토닥토닥, 행복한 눈
          const pat = Math.sin(t * 7);
          armX[0] = -1.0 - 0.18 * pat; armZ[0] = 0.05;
          armY[0] = -0.1;
          poseRX = 0.22;
          headRX = 0.1;
          headRZ = 0.1;
          happy = true;
          break;
        }
        case 'hold': {
          // 동숲식 '잡았다!': 두 손을 번쩍 들어 머리 위 물건 양옆을 받친다 + 들자마자 톡 뛰며 활짝 웃는 눈
          lift = 1;
          holdLift = 1;
          armX[0] = armX[1] = -2.9;
          armZ[0] = -0.3; armZ[1] = 0.3;
          headRX = -0.22;
          const age = snap ? 1 : t - holdT0;
          const hop = age < 0.32 ? Math.sin((age / 0.32) * Math.PI) : 0;
          poseY = 0.1 * hop + 0.012 * Math.abs(Math.sin(t * 6));
          legX[0] = -0.35 * hop; legX[1] = 0.25 * hop;
          happy = true;
          joy = true;
          break;
        }
        case 'cast': {
          // 낚싯대 던지기: 머리 뒤로 젖혔다가 앞으로 휙
          rod.root.visible = true;
          const c = (t * 1.1) % 1;
          const fw = c < 0.45 ? 1 - THREE.MathUtils.smoothstep(c, 0, 0.45) : THREE.MathUtils.smoothstep(c, 0.5, 0.62);
          armX[0] = -2.7 + 1.75 * fw;
          armZ[0] = -0.1;
          armX[1] = -0.6; armZ[1] = 0.45;
          poseRX = -0.08 + 0.2 * fw;
          headRX = -0.18 + 0.1 * fw;
          legX[0] = -0.2; legX[1] = 0.2;
          rod.setTension(1 - fw);
          break;
        }
        case 'reel': {
          // 감기: 낚싯대를 세우고 왼손이 릴을 뱅글뱅글, 몸은 뒤로 버틴다
          rod.root.visible = true;
          const j = Math.sin(t * 15);
          armX[0] = -1.35 + 0.08 * Math.sin(t * 9);
          armZ[0] = 0.05; armY[0] = 0.12;
          armX[1] = -1.05 + 0.18 * j; armZ[1] = -0.55 + 0.12 * Math.cos(t * 15);
          poseRX = -0.12;
          poseRZ = 0.03 * Math.sin(t * 9);
          legX[0] = -0.3; legX[1] = 0.3;
          headRX = -0.05;
          rod.setTension(0.75 + 0.25 * Math.abs(Math.sin(t * 6)));
          break;
        }
        case 'chop': {
          // 도끼질: 어깨 너머로 들었다가 옆 앞으로 쿵
          axe.visible = true;
          const c = (t * 1.5) % 1;
          const sw2 = c < 0.55 ? THREE.MathUtils.smoothstep(c, 0, 0.55) : 1 - THREE.MathUtils.smoothstep(c, 0.62, 1);
          armX[0] = -2.55 + 1.8 * sw2;
          armZ[0] = 0.1 + 0.35 * sw2;
          armY[0] = -0.3 * sw2;
          armX[1] = -1.2 + 0.6 * sw2; armZ[1] = -0.5;
          poseRX = 0.04 + 0.2 * sw2;
          poseRZ = -0.08 + 0.12 * sw2;
          legX[0] = -0.3; legX[1] = 0.3;
          headRX = -0.1 + 0.2 * sw2;
          break;
        }
        case 'hit': {
          // 뿅망치로 돌 두드리기: 위에서 아래로 콩! 콩!
          hammer.visible = true;
          const c = (t * 2.2) % 1;
          const bonk = c < 0.3 ? THREE.MathUtils.smoothstep(c, 0, 0.3) : 1 - THREE.MathUtils.smoothstep(c, 0.4, 1);
          armX[0] = -2.4 + 1.65 * bonk;
          armZ[0] = 0.05;
          armX[1] = -0.5; armZ[1] = 0.4;
          poseRX = 0.06 + 0.18 * bonk;
          poseY = -0.02 * bonk;
          headRX = 0.05 + 0.12 * bonk;
          break;
        }
        case 'pick': {
          // 줍기·따기: 살짝 쪼그려 앞 아래로 손 뻗어 톡 당기기
          const pull = Math.max(0, Math.sin(t * 4));
          armX[0] = -1.25 + 0.35 * pull; armZ[0] = 0.12;
          armX[1] = -0.6; armZ[1] = 0.25;
          poseRX = 0.32;
          poseY = -0.05;
          legX[0] = -0.55; legX[1] = 0.15;
          headRX = 0.2;
          break;
        }
        case 'cheer': {
          // 만세! 두 팔 번쩍 + 통통 뛰기 + '> <'
          lift = 1;
          const hopC = Math.abs(Math.sin(t * 6.5));
          armX[0] = armX[1] = -2.7;
          armZ[0] = -0.75 - 0.18 * Math.sin(t * 13); armZ[1] = 0.75 + 0.18 * Math.sin(t * 13);
          poseY = 0.09 * hopC;
          legX[0] = -0.35 * hopC; legX[1] = 0.2 * hopC;
          headRX = -0.25;
          headRZ = 0.08 * Math.sin(t * 6.5);
          joy = true;
          break;
        }
        case 'stung': {
          // 벌에 쏘임: 두 손으로 볼을 감싸고 비틀비틀, 볼 퉁퉁 + 어질어질 별
          const wob = Math.sin(t * 5);
          armX[0] = armX[1] = -2.05;
          armZ[0] = 0.85; armZ[1] = -0.85;
          poseRZ = 0.09 * wob;
          poseRX = 0.05 * Math.sin(t * 3.3);
          headRZ = 0.16 * wob;
          headRX = -0.05;
          legX[0] = 0.15 * wob; legX[1] = -0.15 * wob;
          puffW = 1;
          shut = Math.sin(t * 1.7) > -0.6;
          dizzy.visible = true;
          break;
        }
        case 'sit': {
          // 땅에 털썩 앉기: 엉덩이 바닥, 다리 앞으로 쭉, 손은 무릎 옆
          poseY = -0.2;
          legX[0] = legX[1] = -1.45;
          legZ[0] = 0.08; legZ[1] = -0.08;
          armX[0] = armX[1] = -0.35;
          armZ[0] = -0.55; armZ[1] = 0.55;
          poseRX = -0.06;
          headRX = -0.1 + 0.04 * Math.sin(t * 1.2);
          break;
        }
        case 'sleep': {
          // 앉아서 꾸벅꾸벅 + Zzz
          poseY = -0.2;
          legX[0] = legX[1] = -1.45;
          legZ[0] = 0.1; legZ[1] = -0.1;
          armX[0] = armX[1] = -0.55;
          armZ[0] = 0.15; armZ[1] = -0.15;
          poseRX = 0.12 + 0.05 * Math.sin(t * 1.1);
          headRX = 0.35 + 0.08 * Math.sin(t * 1.1);
          headRZ = 0.22;
          shut = true;
          zzz.visible = true;
          zzz.position.y = 1.32 + 0.05 * Math.sin(t * 1.6);
          break;
        }
        case 'eat': {
          // 주먹밥 냠냠: 오른손을 입으로, 씹을 때마다 머리 끄덕
          snack.visible = true;
          const chew = Math.sin(t * 9);
          armX[0] = -2.25 + 0.12 * chew; armZ[0] = 0.62;
          armX[1] = -0.55; armZ[1] = -0.2;
          headRX = 0.05 + 0.04 * chew;
          happy = true;
          break;
        }
        case 'wave': {
          // 손 흔들기(오른팔 높이 들고 좌우로)
          armX[0] = -0.3;
          armZ[0] = -(2.5 + 0.32 * Math.sin(t * 7));
          headRZ = -0.08 + 0.05 * Math.sin(t * 3.5);
          happy = Math.sin(t * 2) > 0;
          break;
        }
        case 'photo': {
          // 사진 찍기: 두 손으로 사진기를 눈앞에
          camTool.visible = true;
          armX[0] = armX[1] = -1.55;
          armZ[0] = 0.42; armZ[1] = -0.42;
          headRX = -0.05;
          poseRX = 0.03;
          break;
        }
        case 'plant': {
          // 심기: 쪼그려 앉아 새싹을 땅에 톡
          sprout.visible = true;
          const pat = Math.max(0, Math.sin(t * 3));
          poseY = -0.12;
          poseRX = 0.38;
          legX[0] = -1.0; legX[1] = -0.35;
          armX[0] = -0.85 + 0.15 * pat; armZ[0] = 0.1;
          armX[1] = -0.7; armZ[1] = -0.1;
          headRX = 0.25;
          break;
        }
        case 'water': {
          // 물 주기: 물뿌리개를 앞으로 기울여 졸졸
          can.visible = true;
          armX[0] = -1.15 + 0.05 * Math.sin(t * 2); armZ[0] = 0.05; armY[0] = 0.15;
          armX[1] = -0.4; armZ[1] = 0.35;
          poseRX = 0.12;
          headRX = 0.18;
          can.rotation.x = 0.55 + 0.1 * Math.sin(t * 2);
          break;
        }
        case 'peace': {
          // 브이! 얼굴 옆에 손가락 두 개 + 고개 갸웃 + 반대 손은 허리에
          vsign.visible = true;
          lift = 0.5;
          armX[0] = -2.3; armZ[0] = 0.28;
          armX[1] = -0.2; armZ[1] = 0.75; armY[1] = 0.6;
          headRZ = 0.2;
          poseRZ = -0.05;
          joy = Math.sin(t * 1.5) > -0.3;
          happy = true;
          break;
        }
        default:
          break;
      }
    }

    cur.poseY = lerp(cur.poseY, poseY, k);
    cur.poseRX = lerp(cur.poseRX, poseRX, k);
    cur.poseRZ = lerp(cur.poseRZ, poseRZ, k);
    cur.headRX = lerp(cur.headRX, headRX, k);
    cur.headRZ = lerp(cur.headRZ, headRZ, k);
    for (let i = 0; i < 2; i++) {
      cur.armX[i] = lerp(cur.armX[i], armX[i], k);
      cur.armZ[i] = lerp(cur.armZ[i], armZ[i], k);
      cur.armY[i] = lerp(cur.armY[i], armY[i], k);
      cur.legX[i] = lerp(cur.legX[i], legX[i], k);
      cur.legZ[i] = lerp(cur.legZ[i], legZ[i], k);
    }
    pose.position.y = HIP_Y + cur.poseY;
    pose.rotation.set(cur.poseRX, 0, cur.poseRZ);
    body.scale.set(1 + 0.008 * breath, 1 + 0.014 * breath, 1 + 0.008 * breath);
    head.position.y = headBaseY + 0.008 * breath;
    head.rotation.set(cur.headRX, 0, cur.headRZ);
    cur.lift = lerp(cur.lift, lift, k);
    cur.hold = lerp(cur.hold, holdLift, k);
    // 들기 자리: 정수리 바로 위, 두 손 사이(몸이 뛰면 같이 뛴다)
    holdSlot.position.set(0, 1.27 + cur.poseY, 0.06);
    for (let i = 0; i < 2; i++) {
      // 팔을 들 땐 어깨를 살짝 올리고 팔을 늘려(만화식) 큰 머리 옆으로 손이 보이게
      const m = i === 0 ? -1 : 1;
      arms[i].position.set(m * (0.112 + 0.05 * cur.lift), SHOULDER_Y - HIP_Y + 0.09 * cur.lift + 0.04 * cur.hold, 0);
      arms[i].scale.set(1 + 0.12 * cur.hold, 1 + 0.38 * cur.lift + 0.85 * cur.hold, 1 + 0.12 * cur.hold);
      arms[i].rotation.set(cur.armX[i], cur.armY[i], cur.armZ[i]);
      legs[i].rotation.set(cur.legX[i], 0, cur.legZ[i]);
    }
    tuft.rotation.z = 0.12 * Math.sin(phase * 2) * amp;

    // 글라이더: 펼침(톡 튀어나오는 탄성)
    const gk = snap ? 1 : 1 - Math.exp(-dt * (wantGlide ? 9 : 14));
    glideOpen = lerp(glideOpen, wantGlide ? 1 : 0, gk);
    glider.setOpen(glideOpen, t);

    // 볼 퉁퉁(벌): 톡 부풀었다가 살짝 출렁, 별은 머리 위를 돈다
    cur.puff = lerp(cur.puff, puffW, snap ? 1 : 1 - Math.exp(-dt * 8));
    const ps = Math.max(0.001, cur.puff * (1 + 0.06 * Math.sin(t * 7)));
    for (const pf of puffs) pf.scale.setScalar(ps);
    if (dizzy.visible) {
      dizzy.rotation.y = t * 3.2;
      dizzy.children.forEach((st, i) => { st.rotation.y = -t * 3.2; st.position.y = 0.03 * Math.sin(t * 6 + i * 2); });
    }

    // 표정: '> <'(들기·만세·브이) > 감은 눈(잠·쏘임) > 웃는 눈 > 깜빡임
    if (joy) face.setMode('happy');
    else {
      face.setMode('open');
      face.setBlink(shut || happy || blinkClosed(t, 3.6, 0.4));
    }
    lastT = t;
  }

  return {
    root,
    holdSlot,
    animate,
    update(t) { animate({ speed: 0, mode: 'ground', action: null, t, dt: Math.max(0, t - lastT) }); },
  };
}
