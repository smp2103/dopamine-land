// 플레이어(동숲 주민 사람): 키 ≈1.3 m, 2.5등신, 그림 얼굴, 반팔 티 + 반바지.
// 관절(엉덩이·어깨·다리) 피벗이 있어 걷기·달리기·점프·활공·수영·잠수·탑승·동작 포즈를 잡는다.
import * as THREE from 'three';
import { ellipsoid, lathe, capsule, hairCap, taperTube } from './geo';
import { teeTexture } from './tex';
import { skinMat, clothMat, glossMat, mesh, faceHead, blinkClosed, mergeByMaterial } from './kit';
import { buildGlider, buildRod, buildNet, buildShovel } from './gear';

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
  for (const tool of [rod.root, net, shovel]) { tool.visible = false; hands[0].add(tool); }
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
    headRX: -0.12, headRZ: 0, lift: 0, hold: 0,
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
    rod.root.visible = net.visible = shovel.visible = false;

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

    face.setBlink(happy || blinkClosed(t, 3.6, 0.4));
    lastT = t;
  }

  return {
    root,
    holdSlot,
    animate,
    update(t) { animate({ speed: 0, mode: 'ground', action: null, t, dt: Math.max(0, t - lastT) }); },
  };
}
