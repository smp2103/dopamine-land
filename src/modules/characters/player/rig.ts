// 플레이어 리그 '말랑': 딸기우유 젤리 머리 아이(꾸미기로 머리 모양·색·옷·모자를 바꾼다).
// 관절: 엉덩이(pose) → 다리 → 무릎 / 몸(숨쉬기) → 팔 → 팔꿈치 → 손 / 머리(바라보기) → 눈썹 · 더듬이 · 경단·양갈래(스프링 체인).
// 관절마다 '몸 재질' 메시 하나(정점 색 + 정점 표면) → 가까이 ≈ 20 드로, 먼 LOD(≥ 25 m)는 관절마다 하나 = 6 드로(팔다리 움직임 유지).
// 움직임: 부피 보존 찌부·쭉(착지·이륙·발걸음·동작), 주머니 진자 + 대롱대롱 별, 더듬이·경단 늦게 따라오기(들고 있으면 더듬이가 납작),
// 혼자 있을 땐 두리번, 대상이 있으면 고개를 돌려 바라본다. 표정 = 눈 상태 × 입 모양(아틀라스 칸 바꾸기) + 지오메트리 눈썹.
import * as THREE from 'three';
import { ellipsoid, capsule, taperTube } from '../geo';
import { bubbleTexture } from '../tex';
import { buildGlider, buildRod, buildNet, buildShovel, buildAxe, buildHammer, buildCan, buildCamera, buildSnack, buildSprout } from '../gear';
import { Batch, SURF, bodyMat, type FillBoost } from './mats';
import { faceSet, faceMaterial, EX, EY, MOUTH_Y, type EyeState, type Mouth, type FaceMat } from './face';
import { buildHair } from './hair';
import {
  H, HIP_Y, SHOULDER_Y, HEAD_Y, ELBOW, HAND, KNEE, LEMON, GOLD,
  headGeo, onFace, torsoBatch, strapPoint, upperArmBatch, forearmBatch, thighBatch, shinBatch, hatBatch, starGeo, heartGeo,
  type Palette,
} from './body';
import { cleanLook, sameLook, SKINS, HAIR_COLORS, EYE_COLORS, OUTFIT_COLORS, type PlayerLook } from './look';

/** 아바타가 잡을 수 있는 동작 포즈 */
export const PLAYER_POSES = [
  'fish', 'cast', 'reel', 'net', 'dig', 'shake', 'chop', 'hit', 'pick', 'pet', 'hold',
  'cheer', 'stung', 'sit', 'sleep', 'eat', 'wave', 'photo', 'plant', 'water', 'peace',
] as const;

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

export type StudioExpr = 'neutral' | 'blink' | 'smile' | 'happy' | 'surprised' | 'sad';

export interface PlayerRig extends Rig {
  animate: (s: PoseState) => void;
  holdSlot: THREE.Object3D;
  /** 지금 모습 */
  look?: PlayerLook;
  /** 모습 바꾸기(같은 root·holdSlot 안에서 다시 짓는다) */
  setLook?: (l: PlayerLook) => void;
  /** 스튜디오·연출: 표정 고정(null = 자동) */
  setExpression?: (e: StudioExpr | null) => void;
  /** 먼 모습(≥ 25 m) */
  setLod?: (l: 'near' | 'far') => void;
  /** 얼굴 클로즈업 기준 */
  head?: THREE.Object3D;
  /** 바라볼 곳(월드 좌표) — null 이면 혼자 두리번 */
  setLookTarget?: (p: THREE.Vector3 | null) => void;
  dispose?: () => void;
}

const lerp = THREE.MathUtils.lerp;
const sstep = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;

/** 감쇠 스프링 한 걸음 */
function spring(s: { x: number; v: number }, target: number, k: number, c: number, dt: number, push = 0) {
  const h = Math.min(dt, 1 / 30);
  s.v += (-k * (s.x - target) - c * s.v + push) * h;
  s.x += s.v * h;
}

/** 깜빡임: 3.4 초마다(가끔 두 번) — 반쯤 감은 사이 칸을 앞뒤로 */
function blinkAt(t: number): EyeState {
  const p = 3.4, k = (t + 0.4) % p;
  const twice = Math.floor((t + 0.4) / p) % 3 === 1;
  const one = (k0: number) => (k < k0 ? null : k < k0 + 0.035 ? 'half' : k < k0 + 0.1 ? 'closed' : k < k0 + 0.14 ? 'half' : null);
  return (one(0) ?? (twice ? one(0.24) : null) ?? 'open') as EyeState;
}

/** 눈 상태별 눈썹 [높이(m), 기울기] — 기울기 + = 바깥이 처짐(순함·시무룩) / - = 안쪽이 처짐(놀람) */
const BROW: Record<EyeState, [number, number]> = {
  open: [0, 0.06], half: [-0.002, 0.04], closed: [-0.003, 0.08], smile: [0.006, 0.12], happy: [0.01, 0.16],
  wide: [0.018, -0.04], sad: [0.006, 0.4], sleepy: [-0.006, 0.12], dizzy: [0.006, 0.22],
};

interface Model {
  group: THREE.Group;
  squash: THREE.Group;
  pose: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[]; knees: THREE.Group[];
  arms: THREE.Group[]; elbows: THREE.Group[]; hands: THREE.Group[];
  /** 윗팔(소매 포함) 메시 — 들기에서 이것만 길게 늘인다(벙어리 손은 동글게 그대로) */
  uppers: THREE.Mesh[];
  pouchPivot: THREE.Group; pouch: THREE.Group; charm: THREE.Group; core: THREE.Object3D;
  ahoge: THREE.Group; drop: THREE.Object3D;
  brows: THREE.Group[];
  chains: Array<{ pivots: THREE.Group[]; side: number; kind: 'bun' | 'tail' }>;
  puffs: THREE.Mesh[];
  dizzy: THREE.Group;
  face: FaceMat;
  near: THREE.Object3D[]; far: THREE.Object3D[];
  hideAntenna: boolean;
  dispose: () => void;
}

function palOf(l: PlayerLook): Palette & { hair: (typeof HAIR_COLORS)[keyof typeof HAIR_COLORS]; rim: string } {
  const oc = OUTFIT_COLORS[l.outfitColor];
  const sk = SKINS[l.skin];
  return {
    main: oc.main, deep: oc.deep, pants: oc.pants, skin: sk.base, rim: sk.rim,
    shoe: '#ff86ad', shoeLight: '#ffb3cc', hair: HAIR_COLORS[l.hairColor],
  };
}

function buildModel(look: PlayerLook, boost: FillBoost): Model {
  const pal = palOf(look);
  const body = bodyMat({ boost });
  const hairM = bodyMat({ boost, rimK: 0.42, rimPow: 2.2, ccRough: 0.42 });
  const bubbleM = bodyMat({ boost, rimK: 0.85, rimPow: 1.8, ccRough: 0.05, transparent: true, opacity: 0.78 });
  bubbleM.depthWrite = false;
  const ec = EYE_COLORS[look.eyes];
  const fs = faceSet({ skin: pal.skin, irisDark: ec.dark, irisLight: ec.light, line: '#3a1a33', blush: '#ff8fa8', freckles: look.freckles });
  const face = faceMaterial(fs, { rim: pal.rim, blush: '#ff8fa8' }, boost);
  const near: THREE.Object3D[] = [], far: THREE.Object3D[] = [];
  const keep = <T extends THREE.Object3D>(o: T, lod: 'near' | 'far'): T => { (lod === 'near' ? near : far).push(o); return o; };
  const geos: THREE.BufferGeometry[] = [];
  const mk = (b: Batch, m: THREE.Material, lod: 'near' | 'far' = 'near') => {
    const me = b.build(m);
    geos.push(me.geometry);
    return keep(me, lod);
  };

  const group = new THREE.Group();
  group.name = 'player-model';
  const squash = new THREE.Group();
  group.add(squash);
  const pose = new THREE.Group();
  pose.position.y = HIP_Y;
  squash.add(pose);

  // ── 다리: 엉덩이 → (허벅지 + 바짓단) → 무릎 → (정강이 + 운동화) ──
  const legs: THREE.Group[] = [], knees: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(m * 0.082, 0, 0);
    const knee = new THREE.Group();
    knee.position.set(0, KNEE - HIP_Y, 0);
    leg.add(knee);
    const a = new Batch(); thighBatch(a, look.outfit, pal, false); leg.add(mk(a, body));
    const b = new Batch(); shinBatch(b, pal, false); knee.add(mk(b, body));
    // 먼 LOD: 다리 하나 = 메시 하나
    const f = new Batch(); thighBatch(f, look.outfit, pal, true);
    const fs2 = new Batch(); shinBatch(fs2, pal, true);
    for (const g of fs2.parts) { g.translate(0, KNEE - HIP_Y, 0); f.raw(g); }
    fs2.parts.length = 0;
    leg.add(mk(f, body, 'far'));
    pose.add(leg);
    legs.push(leg); knees.push(knee);
  }

  // ── 몸통 + 말랑 주머니 ──
  const bodyG = new THREE.Group();
  pose.add(bodyG);
  const torso = new THREE.Group();
  torso.position.y = -HIP_Y;
  bodyG.add(torso);
  const tb = new Batch();
  const T = torsoBatch(tb, look.outfit, pal, false);
  // 가방끈(분홍 젤리)
  const strapPts = Array.from({ length: 48 }, (_, i) => strapPoint(T, (i / 48) * Math.PI * 2));
  tb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strapPts, true), 96, 0.012, 8, true), '#ff86ad', SURF.jelly);
  // 목(턱 밑 접촉 그늘: 위로 갈수록 조금 진하게)
  const skinC = new THREE.Color(pal.skin), neckDark = skinC.clone().multiplyScalar(0.8);
  tb.add(capsule(0.056, 0.12), (p) => skinC.clone().lerp(neckDark, sstep(p.y, -0.01, 0.04)).getHex(), SURF.skin, 0, 0.59, -0.005);
  torso.add(mk(tb, body));
  // 주머니 자리: 왼 엉덩이 조금 뒤(등 뒤에서도 옆으로 보인다)
  const hipA = Math.PI * 0.62;
  const hip = strapPoint(T, hipA, 0.02);
  const pouchPivot = new THREE.Group();
  pouchPivot.position.set(hip.x, hip.y + 0.005, hip.z);
  pouchPivot.rotation.y = 0.5;
  torso.add(pouchPivot);
  const pouch = new THREE.Group();
  pouchPivot.add(pouch);
  const PR = 0.094;
  const pb = new Batch();
  pb.add(ellipsoid(0.021, 0.017, 0.021, 16, 10), LEMON, SURF.candy, 0.02, -0.012, 0);
  pb.add(new THREE.TorusGeometry(0.016, 0.007, 8, 20), '#ff86ad', SURF.jelly, 0.008, 0.0, 0);
  pb.add(ellipsoid(0.018, 0.011, 0.006, 12, 8), '#ffffff', [0.1, 1, 0, 0.9], 0.07, -0.052, PR * 0.62, -0.3, 0.7, -0.6);
  pouch.add(mk(pb, body));
  const bubble = new Batch();
  bubble.add(ellipsoid(PR, PR * 0.92, PR * 0.88, 32, 22), '#ffe07a', [0.08, 1, 0, 0.32], 0.03, -0.08, 0);
  const bubbleMesh = mk(bubble, bubbleM);
  bubbleMesh.renderOrder = 3;
  bubbleMesh.castShadow = false;
  pouch.add(bubbleMesh);
  const core = new THREE.Group();
  core.position.set(0.03, -0.085, 0);
  pouch.add(core);
  const cb = new Batch(); cb.add(heartGeo(0.027), '#ff7aa6', [0.3, 1, 0, 0.35]); core.add(mk(cb, body));
  // 대롱대롱 젤리 별(주머니 밑)
  const charm = new THREE.Group();
  charm.position.set(0.03, -0.165, 0.0);
  pouch.add(charm);
  const chb = new Batch();
  chb.add(new THREE.TorusGeometry(0.009, 0.003, 6, 14), GOLD, SURF.jelly, 0, -0.006, 0, 0, 0, Math.PI / 2);
  chb.add(capsule(0.0025, 0.02), '#ff86ad', SURF.jelly, 0, -0.02, 0);
  chb.add(starGeo(0.03, 0.01), '#8ee6c8', SURF.jelly, 0, -0.05, 0, 0, Math.PI / 2, 0);
  const charmMesh = mk(chb, body);
  charmMesh.castShadow = false;
  charm.add(charmMesh);
  // 먼 몸통: 옷 + 끈 + 주머니(노랑)
  {
    const f = new Batch();
    const T2 = torsoBatch(f, look.outfit, pal, true);
    const pts = Array.from({ length: 16 }, (_, i) => strapPoint(T2, (i / 16) * Math.PI * 2));
    f.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 24, 0.014, 4, true), '#ff86ad', SURF.jelly);
    f.add(capsule(0.056, 0.12), pal.skin, SURF.skin, 0, 0.59, -0.005);
    f.add(ellipsoid(PR, PR * 0.92, PR * 0.86, 12, 8), '#ffd75a', SURF.candy, hip.x + 0.04, hip.y - 0.075, hip.z);
    torso.add(mk(f, body, 'far'));
  }

  // ── 팔: 어깨 → 소매·윗팔 → 팔꿈치 → 팔뚝·벙어리 손 ──
  const arms: THREE.Group[] = [], elbows: THREE.Group[] = [], hands: THREE.Group[] = [], uppers: THREE.Mesh[] = [];
  for (const m of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(m * 0.128, SHOULDER_Y - HIP_Y, 0);
    const elbow = new THREE.Group();
    elbow.position.set(0, -ELBOW, 0);
    arm.add(elbow);
    const ua = new Batch(); upperArmBatch(ua, look.outfit, pal, m, false); const uaM = mk(ua, body); arm.add(uaM); uppers.push(uaM);
    const fa = new Batch(); forearmBatch(fa, pal, m, false); elbow.add(mk(fa, body));
    const f = new Batch(); upperArmBatch(f, look.outfit, pal, m, true);
    const ff = new Batch(); forearmBatch(ff, pal, m, true);
    const e = new THREE.Matrix4().makeRotationX(-0.25).premultiply(new THREE.Matrix4().makeTranslation(0, -ELBOW, 0));
    for (const g of ff.parts) { g.applyMatrix4(e); f.raw(g); }
    ff.parts.length = 0;
    arm.add(mk(f, body, 'far'));
    const hand = new THREE.Group();
    hand.position.set(0, -HAND, 0.004);
    elbow.add(hand);
    bodyG.add(arm);
    arms.push(arm); elbows.push(elbow); hands.push(hand);
  }

  // ── 머리 ──
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, HEAD_Y - HIP_Y, 0.005);
  pose.add(head);
  const hg = headGeo(H, pal.skin);
  geos.push(hg);
  const headMesh = keep(new THREE.Mesh(hg, [face.mat, body]), 'near');
  headMesh.castShadow = headMesh.receiveShadow = true;
  head.add(headMesh);
  const hair = buildHair(look.hair, pal.hair, H, 'near');
  const hairMesh = keep(new THREE.Mesh(hair.main, hairM), 'near');
  geos.push(hair.main);
  hairMesh.castShadow = true;
  head.add(hairMesh);
  const hatB = new Batch();
  const hatInfo = hatBatch(hatB, look.hat, pal, false);
  // 구름 머리엔 모자를 한 치수 크게(뽀글 속에 묻히지 않게)
  const hatGrow = look.hair === 'cloud' && (look.hat === 'cap' || look.hat === 'bucket') ? new THREE.Matrix4().makeTranslation(0, 0.035, 0).multiply(new THREE.Matrix4().makeScale(1.2, 1.2, 1.2)) : null;
  if (hatGrow) for (const g of hatB.parts) g.applyMatrix4(hatGrow);
  if (!hatB.empty) head.add(mk(hatB, body));
  // 눈썹(지오메트리): 머리색보다 진한 색 — 앞머리 아래로 보이게
  const browCol = new THREE.Color(pal.hair.shade).lerp(new THREE.Color('#5a2a3a'), 0.25);
  const brows: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const { p, n } = onFace(H, m * (EX + 0.02), 0.27, 0.003);
    const pv = new THREE.Group();
    pv.position.copy(p);
    pv.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    head.add(pv);
    const inner = new THREE.Group();
    pv.add(inner);
    const bb = new Batch();
    // 짧고 통통한 둥근 획: 안쪽 끝이 조금 굵다
    const w = 0.03;
    const pts = [new THREE.Vector3(-m * w, -0.003, 0), new THREE.Vector3(-m * w * 0.3, 0.005, 0.002), new THREE.Vector3(m * w * 0.4, 0.004, 0.002), new THREE.Vector3(m * w, -0.004, 0)];
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.0056, 8, false);
    const pp = g.attributes.position as THREE.BufferAttribute;
    // 끝으로 갈수록 가늘게 + 판판하게(이마에 붙게)
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i) * m;
      const k = 1 - 0.45 * sstep(x, -w, w);
      const c = new THREE.Vector3(); new THREE.CatmullRomCurve3(pts).getPointAt(THREE.MathUtils.clamp((x + w) / (2 * w), 0, 1), c);
      pp.setXYZ(i, pp.getX(i), c.y + (pp.getY(i) - c.y) * k, c.z + (pp.getZ(i) - c.z) * 0.45);
    }
    g.computeVertexNormals();
    bb.add(g, browCol.getHex(), SURF.brow);
    inner.add(mk(bb, body));
    brows.push(inner);
  }
  // 더듬이(젤리 방울 삐침): 정수리에서 솟아 앞으로 말리고 끝에 방울
  const ahoge = new THREE.Group();
  ahoge.position.set(0.02, H.ry * 0.98 + hatInfo.lift, -0.03);
  head.add(ahoge);
  const ahogeG = (seg: number, rad: number) => taperTube([
    new THREE.Vector3(0, -0.04, 0), new THREE.Vector3(-0.005, 0.07, -0.005), new THREE.Vector3(0.03, 0.16, 0.0),
    new THREE.Vector3(0.1, 0.18, 0.01), new THREE.Vector3(0.13, 0.13, 0.015),
  ], 0.032, seg, rad);
  const ab = new Batch();
  ab.add(ahogeG(26, 10), pal.hair.base, SURF.hair);
  ahoge.add(mk(ab, hairM));
  const drop = new THREE.Group();
  drop.position.set(0.128, 0.112, 0.015);
  ahoge.add(drop);
  const db = new Batch(); db.add(ellipsoid(0.03, 0.035, 0.03, 16, 12), pal.hair.base, SURF.hair); drop.add(mk(db, hairM));
  ahoge.visible = !hatInfo.hideAntenna;
  // 경단·양갈래(스프링 체인)
  const chains: Model['chains'] = [];
  for (const ex of hair.extras) {
    const pivots: THREE.Group[] = [];
    let parent: THREE.Object3D = head;
    ex.geos.forEach((g, i) => {
      const pv = new THREE.Group();
      if (i === 0) pv.position.copy(ex.at); else pv.position.set(0, -ex.seg, 0);
      parent.add(pv);
      const me = keep(new THREE.Mesh(g, hairM), 'near');
      geos.push(g);
      me.castShadow = true; me.receiveShadow = true;
      pv.add(me);
      pivots.push(pv);
      parent = pv;
    });
    if (ex.kind === 'bun') {
      // 경단 묶은 레몬 방울 끈
      const lb = new Batch(); lb.add(ellipsoid(0.03, 0.026, 0.03, 14, 10), LEMON, SURF.candy, 0, 0, 0);
      pivots[0].add(mk(lb, body));
    } else {
      const lb = new Batch(); lb.add(new THREE.TorusGeometry(0.05, 0.016, 8, 20).rotateX(Math.PI / 2), LEMON, SURF.candy, 0, -0.02, 0, 0, 0, 0, [1, 1, 0.85]);
      pivots[0].add(mk(lb, body));
    }
    chains.push({ pivots, side: ex.side, kind: ex.kind });
  }
  // 먼 머리: 피부(+ 눈·입 점) + 머리카락 + 모자 + 더듬이 = 메시 하나
  {
    const f = new Batch();
    const hf = headGeo(H, pal.skin, 24, 18);
    hf.clearGroups();
    hf.deleteAttribute('uv');
    f.raw(hf);
    for (const m of [-1, 1]) {
      const { p } = onFace(H, m * EX, EY, -0.004);
      f.add(ellipsoid(0.034, 0.06, 0.012, 8, 6), ec.dark, SURF.eye, p.x, p.y, p.z);
    }
    const bl = onFace(H, 0, MOUTH_Y, -0.002).p;
    f.add(ellipsoid(0.02, 0.012, 0.008, 6, 4), '#c0506a', SURF.skin, bl.x, bl.y, bl.z);
    const fh = buildHair(look.hair, pal.hair, H, 'far');
    f.raw(fh.main);
    for (const ex of fh.extras) for (const g of ex.geos.slice(0, 1)) { g.translate(ex.at.x, ex.at.y, ex.at.z); f.raw(g); }
    const n0 = f.parts.length;
    hatBatch(f, look.hat, pal, true);
    if (hatGrow) for (const g of f.parts.slice(n0)) g.applyMatrix4(hatGrow);
    if (!hatInfo.hideAntenna) {
      const ag = ahogeG(6, 4);
      f.add(ag, pal.hair.base, SURF.hair, ahoge.position.x, ahoge.position.y, ahoge.position.z);
    }
    head.add(mk(f, body, 'far'));
  }

  // 벌에 쏘인 볼(퉁퉁)
  const puffs: THREE.Mesh[] = [];
  for (const m of [-1, 1]) {
    const b = new Batch(); b.add(ellipsoid(0.08, 0.066, 0.062, 22, 14), '#ffb3b3', [0.4, 0.6, 0, 0.25]);
    const pf = mk(b, body);
    const { p } = onFace(H, m * 0.55, -0.5, -0.03);
    pf.position.copy(p);
    pf.scale.setScalar(0.001);
    pf.castShadow = false;
    pf.visible = false;
    head.add(pf);
    puffs.push(pf);
  }
  // 어질어질 별
  const starM = new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffcf4a', emissiveIntensity: 0.6, roughness: 0.4 });
  const sg = starGeo(0.05, 0.018, 2);
  geos.push(sg);
  const dizzy = new THREE.Group();
  dizzy.position.set(0, H.ry * 1.4 + hatInfo.lift, 0);
  dizzy.visible = false;
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(sg, starM);
    st.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.25, 0, Math.sin((i / 3) * Math.PI * 2) * 0.25);
    dizzy.add(st);
  }
  head.add(dizzy);

  // 머리카락은 화면 AO(N8AO, 반경 1.6 m)·그림자를 받지 않는다 — 덩어리가 겹치는 틈마다 검은 띠·톱니(AO)와
  // 모래 같은 PCF 얼룩(제 그림자)이 생겨 '때'처럼 보여서. 덩어리 사이 그늘은 정점 색(뿌리 진하게)이 이미 그린다.
  group.traverse((o) => {
    const me = o as THREE.Mesh;
    if (me.isMesh && me.material === hairM) { me.userData.cannotReceiveAO = true; me.receiveShadow = false; }
  });
  for (const o of far) o.visible = false;
  return {
    group, squash, pose, body: bodyG, head, legs, knees, arms, elbows, hands, uppers, pouchPivot, pouch, charm, core, ahoge, drop, brows, chains, puffs, dizzy, face, near, far,
    hideAntenna: hatInfo.hideAntenna,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of [body, hairM, bubbleM, face.mat, starM]) m.dispose();
      fs.release();
    },
  };
}

/** 플레이어 만들기. look 을 안 주면 기본(딸기우유 젤리 아이) */
export function buildPlayer(look0?: Partial<PlayerLook> | null): PlayerRig {
  let look = cleanLook(look0 ?? {});
  const root = new THREE.Group();
  root.name = 'player';
  const boost: FillBoost = { value: 1 };
  let M = buildModel(look, boost);
  root.add(M.group);

  // ── 도구(오른손) · 글라이더 · Zzz · 들기 자리 — 모습을 바꿔도 그대로 ──
  const rod = buildRod(), net = buildNet(), shovel = buildShovel(), axe = buildAxe(), hammer = buildHammer();
  const can = buildCan(), camTool = buildCamera(), snack = buildSnack(), sprout = buildSprout();
  const vsign = new THREE.Group();
  const vmat = bodyMat({ boost });
  let vgeo: THREE.BufferGeometry | null = null;
  const makeV = () => {
    vsign.clear();
    vgeo?.dispose();
    const b = new Batch();
    for (const sg of [-1, 1]) b.add(capsule(0.017, 0.068), SKINS[look.skin].base, SURF.skin, sg * 0.018, -0.06, 0.01, 0, 0, sg * 0.28);
    const me = b.build(vmat);
    vgeo = me.geometry;
    vsign.add(me);
  };
  makeV();
  vsign.rotation.x = Math.PI;
  // 손이 커진 만큼 도구도 살짝 크게
  const toolBox = new THREE.Group();
  toolBox.scale.setScalar(1.06);
  const tools = [rod.root, net, shovel, axe, hammer, can, camTool, snack, sprout];
  for (const tool of tools) { tool.visible = false; toolBox.add(tool); }
  vsign.visible = false;
  const attachTools = () => { M.hands[0].add(toolBox); M.hands[0].add(vsign); };
  attachTools();

  const zzz = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture('zzz', 256), transparent: true, depthWrite: false }));
  zzz.scale.setScalar(0.42);
  zzz.position.set(0.24, 1.38, 0);
  zzz.visible = false;
  root.add(zzz);
  const glider = buildGlider();
  root.add(glider.root);
  const holdSlot = new THREE.Object3D();
  holdSlot.name = 'holdSlot';
  holdSlot.position.set(0, 1.3, 0.04);
  root.add(holdSlot);

  root.scale.setScalar(1.12);
  root.rotation.y = THREE.MathUtils.degToRad(20);

  // ── 움직임 상태(모습을 바꿔도 이어진다) ──
  const headBaseY = HEAD_Y - HIP_Y;
  let phase = 0, glideOpen = 0, lastT = 0;
  let holdT0 = -9, wasHeld = false;
  let lastMode: PoseState['mode'] = 'ground';
  let forced: StudioExpr | null = null;
  let lookAt: THREE.Vector3 | null = null;
  let lod: 'near' | 'far' = 'near';
  const S = () => ({ x: 0, v: 0 });
  const spr = { sq: S(), px: S(), pz: S(), cx: S(), cz: S(), ax: S(), az: S() };
  const chainS = [0, 1].map(() => [0, 1, 2].map(() => ({ x: S(), z: S() })));
  let prevPoseY = 0, prevHeadRX = 0, prevYaw = 0;
  const cur = {
    poseY: 0, poseRX: 0, poseRZ: 0,
    armX: [0, 0], armZ: [-0.3, 0.3], armY: [0, 0], elb: [-0.2, -0.2],
    legX: [0, 0], legZ: [0, 0], legY: [0, 0], knee: [0, 0],
    headRX: -0.1, headRZ: 0, headRY: 0, lift: 0, hold: 0, puff: 0, brow: 0, browT: 0.06,
  };
  const tmpV = new THREE.Vector3();
  let curFace = '';

  function setFace(e: EyeState, m: Mouth) {
    const k = `${e}|${m}`;
    if (k === curFace) return;
    curFace = k;
    M.face.set(e, m);
  }

  function animate(s0: PoseState) {
    let s = s0;
    const { t } = s;
    const dt = Math.min(0.05, Math.max(0, s.dt));
    const snap = dt === 0;
    const k = snap ? 1 : 1 - Math.exp(-dt * 14);
    if (snap && s.mode === 'air') s = { ...s, mode: 'ground' };
    const held = holdSlot.children.length > 0;
    if (held && !wasHeld) holdT0 = t;
    wasHeld = held;
    const action = held && s.mode !== 'swim' && s.mode !== 'dive' && s.mode !== 'mounted' && s.mode !== 'glide' ? 'hold' : s.action;
    let holdLift = 0;

    const sp = s.mode === 'ground' ? s.speed : 0;
    if (!snap) phase += dt * (sp > 0.2 ? 3.2 + sp * 1.15 : 0);
    else if (sp > 0.2) phase = t * (3.2 + sp * 1.15);
    const moving = s.mode === 'ground' && s.speed > 0.4;
    const run = moving ? sstep(s.speed, 5.6, 8.5) : 0;
    const amp = moving ? clamp(s.speed / 5, 0.35, 1) : 0;
    const sw = Math.sin(phase);
    const breath = Math.sin(t * 2.1);

    let poseY = 0, poseRX = 0, poseRZ = 0;
    const armX = [0, 0], armZ = [-0.3 - 0.02 * breath, 0.3 + 0.02 * breath], armY = [0, 0];
    const elb = [-0.22, -0.22];
    const legX = [0, 0], legZ = [0, 0], legY = [0, 0], knee = [0, 0];
    let headRX = -0.1, headRZ = 0.04 * Math.sin(t * 0.9);
    // 가만히 있을 땐 가끔 두리번(결정적)
    let headRY = 0.24 * Math.sin(t * 0.37) * sstep(Math.sin(t * 0.21), 0.2, 0.7);
    let wantGlide = false;
    let lift = 0;
    let eyes: EyeState | null = null;
    let mouth: Mouth = 'smile';
    let happy = false, joy = false, shut = false;
    let sqTarget = 0.012 * breath;
    let puffW = 0;
    let wind = 0;
    for (const tool of tools) tool.visible = false;
    vsign.visible = false;
    M.dizzy.visible = false;
    zzz.visible = false;

    if (s.mode === 'mounted') {
      // 탈것: 무릎 굽혀 앉고(발바닥이 카메라를 안 보게) 손은 앞 손잡이
      poseY = -0.17;
      legX[0] = legX[1] = -1.3;
      legZ[0] = -0.16; legZ[1] = 0.16;
      knee[0] = knee[1] = 1.25;
      armX[0] = armX[1] = -0.9; elb[0] = elb[1] = -0.45;
      armZ[0] = -0.16; armZ[1] = 0.16;
      poseRX = 0.06;
      headRX = -0.05 + 0.03 * Math.sin(t * 3);
      headRY = 0;
      mouth = 'grin';
      wind = 0.6;
    } else if (s.mode === 'glide') {
      wantGlide = true;
      lift = 1;
      armX[0] = armX[1] = -2.75; elb[0] = elb[1] = -0.05;
      armZ[0] = -0.62; armZ[1] = 0.62;
      legX[0] = 0.4 + 0.22 * Math.sin(t * 4.2);
      legX[1] = 0.4 + 0.22 * Math.sin(t * 4.2 + 2.2);
      knee[0] = 0.3 + 0.2 * Math.sin(t * 4.2 + 1); knee[1] = 0.3 + 0.2 * Math.sin(t * 4.2 + 3.2);
      poseRX = 0.26;
      headRX = -0.42;
      headRY = 0;
      poseY = 0.02 * Math.sin(t * 2.4);
      happy = Math.sin(t * 0.7) > 0.6;
      mouth = 'grin';
      sqTarget = 0.05;
      wind = 1.2;
    } else if (s.mode === 'air') {
      lift = 0.6;
      armX[0] = armX[1] = -0.9; elb[0] = elb[1] = -0.35;
      armZ[0] = -1.75; armZ[1] = 1.75;
      legX[0] = -0.75; legX[1] = -0.2;
      knee[0] = 0.9; knee[1] = 0.4;
      poseRX = -0.05;
      headRX = -0.25;
      headRY = 0;
      happy = true; mouth = 'o';
      sqTarget = 0.07;
      wind = 0.8;
    } else if (s.mode === 'swim') {
      const st = t * (s.speed > 0.5 ? 4.2 : 2.2);
      poseY = 0.66 + 0.03 * Math.sin(t * 2.2);
      poseRX = 0.26;
      headRX = -0.4;
      headRY = 0;
      const stroke = Math.sin(st);
      armX[0] = armX[1] = -1.35 + 0.45 * stroke;
      armZ[0] = -0.55 - 0.5 * Math.max(0, stroke); armZ[1] = -armZ[0];
      elb[0] = elb[1] = -0.5 + 0.3 * stroke;
      legX[0] = 0.35 + 0.35 * Math.sin(st * 2);
      legX[1] = 0.35 + 0.35 * Math.sin(st * 2 + Math.PI);
      knee[0] = 0.3 + 0.3 * Math.max(0, Math.sin(st * 2)); knee[1] = 0.3 + 0.3 * Math.max(0, -Math.sin(st * 2));
      sqTarget = 0.02 * stroke;
      mouth = 'cat';
    } else if (s.mode === 'dive') {
      const st = t * 2.4;
      poseRX = 1.22;
      poseY = 0.05 * Math.sin(st);
      headRX = -0.95;
      headRY = 0;
      const c = (st / (Math.PI * 2)) % 1;
      const sweep = c < 0.45 ? 0 : c < 0.75 ? sstep(c, 0.45, 0.75) : 1 - sstep(c, 0.75, 1);
      armX[0] = armX[1] = -2.95 + 1.15 * sweep;
      armZ[0] = -0.12 - 1.1 * sweep; armZ[1] = -armZ[0];
      elb[0] = elb[1] = -0.05 - 0.6 * sweep;
      const kick = Math.sin(t * 7.5);
      legX[0] = 0.12 + 0.42 * kick;
      legX[1] = 0.12 - 0.42 * kick;
      knee[0] = 0.25 + 0.25 * kick; knee[1] = 0.25 - 0.25 * kick;
      legZ[0] = 0.06; legZ[1] = -0.06;
      mouth = 'o';
      wind = 0.5;
    } else {
      if (moving) {
        const bounce = Math.abs(Math.sin(phase));
        poseY = (0.026 + 0.034 * run) * bounce - 0.012;
        poseRX = 0.07 + 0.16 * run;
        poseRZ = 0.045 * sw * amp;
        legX[0] = 0.62 * amp * sw * (1 + 0.25 * run);
        legX[1] = -legX[0];
        // 뒤로 차는 다리만 무릎을 굽힌다
        knee[0] = (0.25 + 0.7 * run) * amp * Math.max(0, Math.sin(phase - 0.9));
        knee[1] = (0.25 + 0.7 * run) * amp * Math.max(0, -Math.sin(phase - 0.9));
        armX[0] = -0.75 * amp * sw * (1 + 0.2 * run);
        armX[1] = -armX[0];
        elb[0] = -0.3 - 0.55 * run - 0.15 * Math.max(0, sw);
        elb[1] = -0.3 - 0.55 * run - 0.15 * Math.max(0, -sw);
        armZ[0] -= 0.12 * run; armZ[1] += 0.12 * run;
        headRX = -0.1 - 0.12 * run + 0.03 * Math.cos(phase * 2);
        headRZ = -0.05 * sw * amp;
        headRY = 0;
        // 발이 닿을 때마다 말랑 찌부
        sqTarget = (0.035 + 0.03 * run) * (bounce - 0.55);
        if (run > 0.3) mouth = 'grin';
        wind = 0.3 + 0.9 * run;
      } else {
        poseY = 0.004 * breath;
      }
      switch (action) {
        case 'fish': {
          rod.root.visible = true;
          const tug = Math.max(0, Math.sin(t * 1.3)) ** 8;
          armX[0] = -1.05 - 0.15 * tug; armZ[0] = -0.38; armY[0] = -0.15; elb[0] = -0.35; // 낚싯대는 몸 바깥으로(얼굴 앞을 가르지 않게)
          armX[1] = -0.75; armZ[1] = -0.35; elb[1] = -0.6;
          headRX = 0.05; headRY = 0;
          rod.setTension(tug);
          mouth = 'cat';
          if (tug > 0.5) { eyes = 'wide'; mouth = 'o'; }
          break;
        }
        case 'net': {
          net.visible = true;
          const c = (t * 1.4) % 1;
          const swing = c < 0.35 ? sstep(c, 0, 0.35) : 1 - sstep(c, 0.5, 1);
          armX[0] = -2.6 + 1.9 * swing; armZ[0] = -0.2 - 0.5 * swing; elb[0] = -0.15;
          armX[1] = -1.4 + 1.0 * swing; armZ[1] = -0.25; elb[1] = -0.4;
          poseRX = 0.05 + 0.22 * swing; poseRZ = -0.06 * swing;
          headRX = -0.2 + 0.25 * swing; headRY = 0;
          sqTarget = -0.04 * swing;
          mouth = 'o';
          break;
        }
        case 'dig': {
          shovel.visible = true;
          const c = (t * 1.6) % 1;
          const push = Math.sin(c * Math.PI);
          armX[0] = -0.7 - 0.5 * push; armZ[0] = 0.05; elb[0] = -0.15;
          armX[1] = -0.95 - 0.4 * push; armZ[1] = -0.35; elb[1] = -0.55;
          poseRX = 0.18 + 0.2 * push; poseY = -0.03 * push;
          legX[0] = -0.25; legX[1] = 0.2; knee[0] = 0.35; knee[1] = 0.1;
          headRX = 0.15; headRY = 0;
          sqTarget = -0.05 * push;
          mouth = 'cat';
          break;
        }
        case 'shake': {
          const j = Math.sin(t * 26);
          armX[0] = armX[1] = -1.45 + 0.12 * j; elb[0] = elb[1] = -0.12;
          armZ[0] = 0.12; armZ[1] = -0.12;
          poseRX = -0.06 + 0.04 * j; poseRZ = 0.03 * Math.sin(t * 13);
          legX[0] = -0.3; legX[1] = 0.25; knee[0] = 0.3;
          headRX = -0.25; headRY = 0;
          sqTarget = 0.025 * j;
          shut = true; mouth = 'grin';
          break;
        }
        case 'pet': {
          const pat = Math.sin(t * 7);
          armX[0] = -1.0 - 0.18 * pat; armZ[0] = 0.05; armY[0] = -0.1; elb[0] = -0.35;
          poseRX = 0.22; headRX = 0.1; headRZ = 0.1; headRY = 0;
          happy = true; mouth = 'grin';
          break;
        }
        case 'hold': {
          lift = 1;
          holdLift = 1;
          // 팔은 큰 머리 옆으로 쭉 — 벙어리 손 끝이 머리 위에 얹은 물건 양 끝을 받친다(holdSlot 을 손 높이로 내렸다)
          // 윗팔은 머리 옆으로 벌려 둥글게 돌아 올라가고(소매가 머리 옆에 보이게), 팔꿈치에서 안으로 꺾어 손끝을 모은다
          armX[0] = armX[1] = -2.3; elb[0] = elb[1] = -1.0;
          armZ[0] = -0.72; armZ[1] = 0.72;
          armY[0] = 0.8; armY[1] = -0.8;
          headRX = -0.22; headRY = 0;
          const age = snap ? 1 : t - holdT0;
          const hop = age < 0.32 ? Math.sin((age / 0.32) * Math.PI) : 0;
          poseY = 0.1 * hop + 0.012 * Math.abs(Math.sin(t * 6));
          legX[0] = -0.35 * hop; legX[1] = 0.25 * hop; knee[0] = 0.6 * hop;
          sqTarget = 0.08 * hop - 0.02;
          // 잡자마자 깜짝 → 곧 '> <'
          if (age < 0.3) { eyes = 'wide'; mouth = 'o'; } else joy = true;
          break;
        }
        case 'cast': {
          rod.root.visible = true;
          const c = (t * 1.1) % 1;
          const fw = c < 0.45 ? 1 - sstep(c, 0, 0.45) : sstep(c, 0.5, 0.62);
          armX[0] = -2.7 + 1.75 * fw; armZ[0] = -0.1; elb[0] = -0.1 - 0.35 * (1 - fw);
          armX[1] = -0.6; armZ[1] = 0.45; elb[1] = -0.4;
          poseRX = -0.08 + 0.2 * fw; headRX = -0.18 + 0.1 * fw; headRY = 0;
          legX[0] = -0.2; legX[1] = 0.2; knee[1] = 0.2;
          rod.setTension(1 - fw);
          mouth = 'o';
          break;
        }
        case 'reel': {
          rod.root.visible = true;
          const j = Math.sin(t * 15);
          armX[0] = -1.1 + 0.08 * Math.sin(t * 9); armZ[0] = -0.42; armY[0] = -0.2; elb[0] = -0.45; // 낚싯대는 몸 바깥·앞으로 비스듬히(얼굴을 가르지 않게)
          armX[1] = -1.05 + 0.18 * j; armZ[1] = -0.55 + 0.12 * Math.cos(t * 15); elb[1] = -0.75;
          poseRX = -0.12; poseRZ = 0.03 * Math.sin(t * 9);
          legX[0] = -0.3; legX[1] = 0.3; knee[1] = 0.25;
          headRX = -0.05; headRY = 0;
          rod.setTension(0.75 + 0.25 * Math.abs(Math.sin(t * 6)));
          shut = true; mouth = 'grin';
          break;
        }
        case 'chop': {
          axe.visible = true;
          const c = (t * 1.5) % 1;
          const sw2 = c < 0.55 ? sstep(c, 0, 0.55) : 1 - sstep(c, 0.62, 1);
          armX[0] = -2.55 + 1.8 * sw2; armZ[0] = 0.1 + 0.35 * sw2; armY[0] = -0.3 * sw2; elb[0] = -0.15;
          armX[1] = -1.2 + 0.6 * sw2; armZ[1] = -0.5; elb[1] = -0.5;
          poseRX = 0.04 + 0.2 * sw2; poseRZ = -0.08 + 0.12 * sw2;
          legX[0] = -0.3; legX[1] = 0.3; knee[1] = 0.25;
          headRX = -0.1 + 0.2 * sw2; headRY = 0;
          sqTarget = -0.05 * sw2;
          mouth = sw2 > 0.6 ? 'o' : 'cat';
          break;
        }
        case 'hit': {
          hammer.visible = true;
          const c = (t * 2.2) % 1;
          const bonk = c < 0.3 ? sstep(c, 0, 0.3) : 1 - sstep(c, 0.4, 1);
          armX[0] = -2.4 + 1.65 * bonk; armZ[0] = 0.05; elb[0] = -0.15;
          armX[1] = -0.5; armZ[1] = 0.4; elb[1] = -0.4;
          poseRX = 0.06 + 0.18 * bonk; poseY = -0.02 * bonk;
          headRX = 0.05 + 0.12 * bonk; headRY = 0;
          sqTarget = -0.06 * bonk;
          shut = bonk > 0.7; mouth = 'grin';
          break;
        }
        case 'pick': {
          const pull = Math.max(0, Math.sin(t * 4));
          armX[0] = -1.25 + 0.35 * pull; armZ[0] = 0.12; elb[0] = -0.12;
          armX[1] = -0.6; armZ[1] = 0.25; elb[1] = -0.4;
          poseRX = 0.32; poseY = -0.05;
          legX[0] = -0.55; legX[1] = 0.15; knee[0] = 0.7; knee[1] = 0.25;
          headRX = 0.2; headRY = 0;
          mouth = 'cat';
          break;
        }
        case 'cheer': {
          lift = 1;
          const hopC = Math.abs(Math.sin(t * 6.5));
          armX[0] = armX[1] = -2.7; elb[0] = elb[1] = -0.12;
          armZ[0] = -0.75 - 0.18 * Math.sin(t * 13); armZ[1] = 0.75 + 0.18 * Math.sin(t * 13);
          poseY = 0.09 * hopC;
          legX[0] = -0.35 * hopC; legX[1] = 0.2 * hopC; knee[0] = 0.6 * hopC; knee[1] = 0.3 * hopC;
          headRX = -0.25; headRZ = 0.08 * Math.sin(t * 6.5); headRY = 0;
          sqTarget = 0.07 * (hopC - 0.4);
          joy = true;
          break;
        }
        case 'stung': {
          const wob = Math.sin(t * 5);
          armX[0] = armX[1] = -2.0; elb[0] = elb[1] = -1.0;
          armZ[0] = 0.5; armZ[1] = -0.5;
          poseRZ = 0.09 * wob; poseRX = 0.05 * Math.sin(t * 3.3);
          headRZ = 0.16 * wob; headRX = -0.05; headRY = 0;
          legX[0] = 0.15 * wob; legX[1] = -0.15 * wob; knee[0] = 0.15; knee[1] = 0.15;
          puffW = 1;
          eyes = 'dizzy'; mouth = 'wavy';
          M.dizzy.visible = true;
          sqTarget = 0.03 * Math.sin(t * 10);
          break;
        }
        case 'sit': {
          // 털썩: 무릎을 세우고 다리를 살짝 벌려 앉는다(발바닥이 카메라를 안 본다)
          poseY = -0.16;
          // 허벅지를 수평보다 조금 아래로 + 옆으로 더 벌려 무릎이 치맛단을 뚫지 않고 단 아래·옆으로 나온다
          legX[0] = legX[1] = -1.2;
          legZ[0] = -0.42; legZ[1] = 0.42;
          legY[0] = 0.3; legY[1] = -0.3;
          knee[0] = knee[1] = 1.15;
          armX[0] = armX[1] = -0.55; elb[0] = elb[1] = -0.55;
          armZ[0] = -0.38; armZ[1] = 0.38;
          poseRX = -0.08;
          headRX = -0.1 + 0.04 * Math.sin(t * 1.2);
          sqTarget = -0.04;
          mouth = 'cat';
          break;
        }
        case 'sleep': {
          poseY = -0.205;
          legX[0] = legX[1] = -1.35;
          legZ[0] = -0.24; legZ[1] = 0.24;
          legY[0] = 0.2; legY[1] = -0.2;
          knee[0] = knee[1] = 1.15;
          armX[0] = armX[1] = -0.75; elb[0] = elb[1] = -0.9;
          armZ[0] = 0.12; armZ[1] = -0.12;
          poseRX = 0.12 + 0.05 * Math.sin(t * 1.1);
          headRX = 0.35 + 0.08 * Math.sin(t * 1.1); headRZ = 0.22; headRY = 0;
          eyes = 'closed'; mouth = 'tiny';
          zzz.visible = true;
          zzz.position.y = 1.28 + 0.05 * Math.sin(t * 1.6);
          sqTarget = -0.05 + 0.025 * Math.sin(t * 1.1);
          break;
        }
        case 'eat': {
          snack.visible = true;
          const chew = Math.sin(t * 9);
          // 팔꿈치를 굽혀 주먹밥을 입으로
          armX[0] = -1.55 + 0.1 * chew; armZ[0] = 0.32; elb[0] = -1.65; armY[0] = -0.25;
          armX[1] = -0.55; armZ[1] = -0.2; elb[1] = -0.6;
          headRX = 0.05 + 0.04 * chew; headRY = 0;
          happy = true; mouth = chew > 0 ? 'chew' : 'cat';
          sqTarget = 0.015 * chew;
          break;
        }
        case 'wave': {
          armX[0] = -0.3; elb[0] = -0.4;
          armZ[0] = -(2.5 + 0.32 * Math.sin(t * 7));
          headRZ = -0.08 + 0.05 * Math.sin(t * 3.5); headRY = 0;
          happy = Math.sin(t * 2) > 0; mouth = 'grin';
          break;
        }
        case 'photo': {
          camTool.visible = true;
          armX[0] = armX[1] = -1.3; elb[0] = elb[1] = -0.85;
          armZ[0] = 0.32; armZ[1] = -0.32;
          headRX = -0.05; poseRX = 0.03; headRY = 0;
          mouth = 'cat';
          break;
        }
        case 'plant': {
          sprout.visible = true;
          const pat = Math.max(0, Math.sin(t * 3));
          poseY = -0.13; poseRX = 0.38;
          legX[0] = -1.0; legX[1] = -0.35; knee[0] = 1.5; knee[1] = 1.1;
          armX[0] = -0.85 + 0.15 * pat; armZ[0] = 0.1; elb[0] = -0.2;
          armX[1] = -0.7; armZ[1] = -0.1; elb[1] = -0.5;
          headRX = 0.25; headRY = 0;
          mouth = 'smile';
          break;
        }
        case 'water': {
          can.visible = true;
          armX[0] = -1.15 + 0.05 * Math.sin(t * 2); armZ[0] = 0.05; armY[0] = 0.15; elb[0] = -0.2;
          armX[1] = -0.4; armZ[1] = 0.35; elb[1] = -0.4;
          poseRX = 0.12; headRX = 0.18; headRY = 0;
          can.rotation.x = 0.55 + 0.1 * Math.sin(t * 2);
          happy = true;
          break;
        }
        case 'peace': {
          // 브이! 팔꿈치를 굽혀 얼굴 옆에 손가락 두 개 + 고개 갸웃 + 반대 손은 허리
          vsign.visible = true;
          lift = 0.35;
          armX[0] = -1.55; armZ[0] = 0.15; elb[0] = -1.55; armY[0] = -0.3;
          armX[1] = -0.2; armZ[1] = 0.75; armY[1] = 0.6; elb[1] = -1.2;
          headRZ = 0.2; poseRZ = -0.05; headRY = 0;
          joy = Math.sin(t * 1.5) > -0.3;
          happy = true; mouth = 'grin';
          break;
        }
        default:
          break;
      }
    }

    // 바라보기: 대상(월드 좌표)을 고개로 따라본다(좌우 ±0.8, 위아래 ±0.35)
    if (lookAt && s.mode === 'ground' && !action) {
      root.updateWorldMatrix(true, false);
      tmpV.copy(lookAt);
      root.worldToLocal(tmpV);
      const yaw = Math.atan2(tmpV.x, tmpV.z);
      const pitch = Math.atan2(tmpV.y - HEAD_Y, Math.hypot(tmpV.x, tmpV.z));
      if (Math.abs(yaw) < 2.0) { headRY = clamp(yaw, -0.8, 0.8); headRX = clamp(-pitch, -0.35, 0.3) - 0.05; }
    }

    // 착지·이륙 순간: 찌부/쭉 충격
    if (!snap) {
      if (lastMode === 'air' && s.mode === 'ground') spr.sq.v -= 2.2;
      if (lastMode === 'ground' && s.mode === 'air') spr.sq.v += 1.5;
    }
    lastMode = s.mode;

    cur.poseY = lerp(cur.poseY, poseY, k);
    cur.poseRX = lerp(cur.poseRX, poseRX, k);
    cur.poseRZ = lerp(cur.poseRZ, poseRZ, k);
    cur.headRX = lerp(cur.headRX, headRX, k);
    cur.headRZ = lerp(cur.headRZ, headRZ, k);
    cur.headRY = lerp(cur.headRY, headRY, snap ? 1 : 1 - Math.exp(-dt * 5));
    for (let i = 0; i < 2; i++) {
      cur.armX[i] = lerp(cur.armX[i], armX[i], k);
      cur.armZ[i] = lerp(cur.armZ[i], armZ[i], k);
      cur.armY[i] = lerp(cur.armY[i], armY[i], k);
      cur.elb[i] = lerp(cur.elb[i], elb[i], k);
      cur.legX[i] = lerp(cur.legX[i], legX[i], k);
      cur.legZ[i] = lerp(cur.legZ[i], legZ[i], k);
      cur.legY[i] = lerp(cur.legY[i], legY[i], k);
      cur.knee[i] = lerp(cur.knee[i], knee[i], k);
    }

    // 스프링: 찌부(부피 보존) · 주머니 진자 · 대롱 별 · 더듬이
    const vy = dt > 0 ? (cur.poseY - prevPoseY) / dt : 0;
    const vh = dt > 0 ? (cur.headRX - prevHeadRX) / dt : 0;
    const vyaw = dt > 0 ? (cur.headRY - prevYaw) / dt : 0;
    const swingBack = 0.25 * wind;
    if (snap) {
      spr.sq.x = sqTarget; spr.sq.v = 0;
      spr.px.x = swingBack + 0.1 * amp * Math.cos(phase); spr.pz.x = 0.25 * cur.poseRZ;
      spr.cx.x = spr.px.x * 0.6; spr.cz.x = 0;
      spr.ax.x = 0; spr.az.x = 0;
      for (const ch of chainS) for (const c of ch) { c.x.x = swingBack * 0.8; c.z.x = 0; c.x.v = c.z.v = 0; }
    } else {
      // 찌부는 단단하게, 오래 출렁이지 않게(임계 감쇠에 가깝게)
      spring(spr.sq, sqTarget, 300, 26, dt);
      spring(spr.px, swingBack - 0.6 * cur.poseRX, 120, 9, dt, -vy * 8 + Math.cos(phase) * amp * 14);
      spring(spr.pz, 0.25 * cur.poseRZ, 120, 9, dt, Math.sin(phase) * amp * 6);
      spring(spr.cx, spr.px.x * 0.5, 160, 7, dt, -spr.px.v * 3 - vy * 5);
      spring(spr.cz, spr.pz.x * 0.5, 160, 7, dt, -spr.pz.v * 3);
      spring(spr.ax, 0.12 * wind, 170, 10, dt, -vh * 2.4 - vy * 6 - spr.sq.v * 4);
      spring(spr.az, 0.6 * cur.poseRZ, 170, 10, dt, -vyaw * 4 + Math.sin(phase * 2) * amp * 6);
      chainS.forEach((ch, side) => ch.forEach((c, i) => {
        const up = i === 0 ? null : ch[i - 1];
        const lag = up ? up.x.x * 0.35 : 0;
        spring(c.x, swingBack * (0.8 + 0.3 * i) - 0.5 * cur.poseRX + lag, 110 - 20 * i, 8 - i, dt, -vy * (5 + 2 * i) - vh * 1.5 + Math.cos(phase * 2 + i) * amp * 6);
        spring(c.z, (side ? -1 : 1) * 0.04 + 0.4 * cur.poseRZ + (up ? up.z.x * 0.35 : 0), 110 - 20 * i, 8 - i, dt, -vyaw * 2.5 + Math.sin(phase + i) * amp * 4);
      }));
    }
    prevPoseY = cur.poseY; prevHeadRX = cur.headRX; prevYaw = cur.headRY;

    const sq = clamp(spr.sq.x, -0.2, 0.2);
    const sxz = 1 / Math.sqrt(1 + sq);
    M.squash.scale.set(sxz, 1 + sq, sxz);

    M.pose.position.y = HIP_Y + cur.poseY;
    M.pose.rotation.set(cur.poseRX, 0, cur.poseRZ);
    M.body.scale.set(1 + 0.01 * breath, 1 + 0.014 * breath, 1 + 0.01 * breath);
    M.head.position.y = headBaseY + 0.008 * breath;
    M.head.rotation.set(cur.headRX, cur.headRY, cur.headRZ, 'YXZ');
    cur.lift = lerp(cur.lift, lift, k);
    cur.hold = lerp(cur.hold, holdLift, k);
    holdSlot.position.set(0, 1.27 - 0.075 * cur.hold + cur.poseY, 0.06);
    for (let i = 0; i < 2; i++) {
      const m = i === 0 ? -1 : 1;
      M.arms[i].position.set(m * (0.128 + 0.05 * cur.lift), SHOULDER_Y - HIP_Y + 0.08 * cur.lift + 0.11 * cur.hold, 0);
      // 말랑 팔: 들 땐 쭉 늘어난다(젤리) — 큰 머리 옆으로 손이 보이게
      // 들 땐 윗팔만 두 배쯤 더 늘여 큰 머리 옆을 돌아 올라간다 — 팔뚝·벙어리 손은 제 크기(뿔처럼 길쭉해지지 않게)
      M.arms[i].scale.set(1 + 0.08 * cur.hold, 1 + 0.3 * cur.lift, 1 + 0.08 * cur.hold);
      const ext = 1 + 1.7 * cur.hold;
      M.uppers[i].scale.set(1, ext, 1);
      M.elbows[i].position.y = -ELBOW * ext;
      M.arms[i].rotation.set(cur.armX[i], cur.armY[i], cur.armZ[i]);
      // 손은 늘어나지 않게(팔만 젤리처럼 늘고 벙어리 손은 동글동글 그대로 — 뿔처럼 길쭉해지지 않게)
      const as = M.arms[i].scale;
      M.hands[i].scale.set(1 / as.x, 1 / as.y, 1 / as.z);
      M.elbows[i].rotation.set(cur.elb[i], 0, 0);
      M.legs[i].rotation.set(cur.legX[i], cur.legY[i], cur.legZ[i], 'XZY');
      M.knees[i].rotation.set(cur.knee[i], 0, 0);
    }
    // 주머니: 흔들 + 말랑(위아래 출렁임에 찌부), 별은 한 박자 늦게
    M.pouchPivot.rotation.set(clamp(spr.px.x, -0.7, 0.9), 0.5, clamp(spr.pz.x, -0.6, 0.6), 'YXZ');
    const pj = clamp(-spr.px.v * 0.015 - spr.sq.v * 0.05, -0.12, 0.12);
    M.pouch.scale.set(1 - pj * 0.5, 1 + pj, 1 - pj * 0.5);
    M.core.rotation.y = 0.9 + 0.4 * Math.sin(t * 1.3);
    M.charm.rotation.set(clamp(spr.cx.x, -0.9, 0.9), 0, clamp(spr.cz.x, -0.9, 0.9));
    // 더듬이: 늦게 따라오고, 머리 위에 뭔가 들면 납작하게 눌린다
    M.ahoge.rotation.set(clamp(spr.ax.x, -0.5, 0.5) + 0.05 * Math.sin(t * 1.7) - 1.0 * cur.hold, 0, clamp(spr.az.x, -0.5, 0.5) + 0.12 * Math.sin(phase * 2) * amp);
    M.ahoge.scale.set(1, 1 - 0.4 * cur.hold, 1);
    const dsq = 1 + 0.06 * Math.sin(t * 3.1);
    M.drop.scale.set(1 / Math.sqrt(dsq), dsq, 1 / Math.sqrt(dsq));
    for (const ch of M.chains) {
      const st = chainS[ch.side < 0 ? 0 : 1];
      ch.pivots.forEach((pv, i) => {
        const a = st[i] ?? st[st.length - 1];
        // 경단은 머리 뒤로 매달려 있어 흔들림을 작게
        const kk = ch.kind === 'bun' ? 0.45 : 1;
        // 양갈래는 뿌리에서 바깥으로 살짝 벌어진다
        const splay = ch.kind === 'tail' && i === 0 ? ch.side * 0.42 : ch.kind === 'tail' ? -ch.side * 0.12 : 0;
        pv.rotation.set(clamp(a.x.x * kk, -0.9, 1.2), 0, splay + clamp(a.z.x * kk, -0.7, 0.7));
      });
    }

    boost.value = s.mode === 'dive' || s.mode === 'swim' ? 1.8 : 1;

    const gk = snap ? 1 : 1 - Math.exp(-dt * (wantGlide ? 9 : 14));
    glideOpen = lerp(glideOpen, wantGlide ? 1 : 0, gk);
    glider.setOpen(glideOpen, t);

    cur.puff = lerp(cur.puff, puffW, snap ? 1 : 1 - Math.exp(-dt * 8));
    const ps = Math.max(0.001, cur.puff * (1 + 0.06 * Math.sin(t * 7)));
    for (const pf of M.puffs) { pf.scale.setScalar(ps); pf.visible = lod === 'near' && cur.puff > 0.01; }
    if (M.dizzy.visible) {
      M.dizzy.rotation.y = t * 3.2;
      M.dizzy.children.forEach((st, i) => { st.rotation.y = -t * 3.2; st.position.y = 0.03 * Math.sin(t * 6 + i * 2); });
    }

    // 표정: 고정(스튜디오) > 동작 표정 > '> <' > 감은 눈 > 웃는 눈 > 깜빡임
    let e: EyeState, mo: Mouth = mouth;
    if (forced) {
      const F: Record<StudioExpr, [EyeState, Mouth]> = {
        neutral: ['open', 'smile'], blink: ['closed', 'cat'], smile: ['smile', 'grin'], happy: ['happy', 'grin'], surprised: ['wide', 'o'], sad: ['sad', 'wavy'],
      };
      [e, mo] = F[forced];
    } else if (eyes) e = eyes;
    else if (joy) { e = 'happy'; mo = 'grin'; }
    else if (shut) e = 'closed';
    else if (happy) e = 'smile';
    else e = blinkAt(t);
    setFace(e, mo);
    M.face.blush(e === 'happy' || e === 'smile' || mo === 'chew' ? 1.15 : puffW > 0 ? 1.3 : 0.72);
    const [bdy, btl] = BROW[e];
    const bk = snap ? 1 : 1 - Math.exp(-dt * 12);
    cur.brow = lerp(cur.brow, bdy + 0.0015 * Math.sin(t * 1.3), bk);
    cur.browT = lerp(cur.browT, btl, bk);
    M.brows.forEach((b, i) => {
      const m = i === 0 ? -1 : 1;
      b.position.y = cur.brow;
      b.rotation.z = -m * cur.browT;
    });
    lastT = t;
  }

  const rig: PlayerRig = {
    root,
    holdSlot,
    animate,
    get head() { return M.head; },
    get look() { return { ...look }; },
    update(t) { animate({ speed: 0, mode: 'ground', action: null, t, dt: Math.max(0, t - lastT) }); },
    setExpression(e) { forced = e; },
    setLookTarget(v) { lookAt = v ? v.clone() : null; },
    setLod(l) {
      lod = l;
      for (const o of M.near) o.visible = l === 'near';
      for (const o of M.far) o.visible = l === 'far';
      M.ahoge.visible = l === 'near' && !M.hideAntenna;
      for (const pf of M.puffs) pf.visible = false;
    },
    setLook(l) {
      const next = cleanLook(l);
      if (sameLook(next, look)) return;
      const skinChanged = next.skin !== look.skin;
      look = next;
      toolBox.removeFromParent();
      vsign.removeFromParent();
      root.remove(M.group);
      // 새 모델을 먼저 만들고 옛 것을 버린다 — 겹치는 굽기 판(눈·입)을 다시 굽지 않게
      const old = M;
      M = buildModel(look, boost);
      old.dispose();
      root.add(M.group);
      if (skinChanged) makeV();
      attachTools();
      curFace = '';
      rig.setLod!(lod);
      animate({ speed: 0, mode: 'ground', action: null, t: lastT, dt: 0 });
    },
    dispose() {
      M.dispose(); vmat.dispose(); vgeo?.dispose();
      // 도구·글라이더·졸음 말풍선도 이 몸 전용이라 같이 버린다(공유 표시가 있는 것은 남긴다)
      const seen = new Set<object>();
      const drop = (x: { dispose(): void; userData?: Record<string, unknown> } | null | undefined) => {
        if (!x || seen.has(x) || x.userData?.shared) return;
        seen.add(x); x.dispose();
      };
      for (const part of [toolBox, glider.root, zzz] as THREE.Object3D[]) {
        part.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh && !(o as THREE.Sprite).isSprite) return;
          if (m.isMesh) drop(m.geometry); // 스프라이트 판은 three 가 모두에게 같이 쓴다
          for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
            if (!mt || mt.userData?.shared) continue;
            for (const v of Object.values(mt)) if ((v as THREE.Texture)?.isTexture) drop(v as THREE.Texture);
            drop(mt);
          }
        });
      }
    },
  };
  return rig;
}

