// 동물 주민 빌더: 종(곰·고양이·토끼·펭귄·북극곰·다람쥐·수달·낙타·여우·강아지)별 귀·꼬리·주둥이·얼굴 무늬 +
// 섬 테마 옷·소품(목도리·탐험모·우주 헬멧·요정 날개·꽃목걸이·밀짚모자·털모자·화관).
// 관절(다리·팔·머리) 피벗으로 걷기·손 흔들기·대화 몸짓을 한다.
import * as THREE from 'three';
import { ellipsoid, halfEllipsoid, planarUV, lathe, capsule, taperTube } from './geo';
import { stripeTexture, muzzleTexture, canvasTex } from './tex';
import { skinMat, clothMat, glossMat, mesh, faceHead, mergeByMaterial } from './kit';

export type AnimalKind = 'bear' | 'cat' | 'rabbit' | 'penguin' | 'polar' | 'squirrel' | 'otter' | 'camel' | 'fox' | 'dog';
export type Accessory = 'scarf' | 'safari' | 'helmet' | 'fairy' | 'lei' | 'sunhat' | 'beanie' | 'flower' | 'bow' | 'glasses' | 'none';
/** 옷 모양(주민마다 다르게 돌린다) */
export type Outfit = 'stripe' | 'pocket' | 'overalls' | 'dress' | 'hoodie';

export interface AnimalSpec {
  kind: AnimalKind;
  fur: string;
  /** 주둥이·배·얼굴 밝은 부분 */
  light: string;
  earIn?: string;
  iris?: string;
  blush?: string;
  shirt?: { a: string; b?: string; pattern: 'stripe' | 'plain' | 'dots' };
  acc?: Accessory;
  accColor?: string;
  scale?: number;
  lashes?: boolean;
  /** 옷 모양 + 주 색(없으면 shirt 그대로) */
  outfit?: Outfit;
  outfitColor?: string;
  /** 두 번째 소품(안경·리본 등) */
  acc2?: Accessory;
}

export interface AnimalPose {
  /** 걷는 속도(m/s) */
  walk: number;
  /** 대화 중(몸짓) */
  talk: boolean;
  /** 손 흔들기 */
  wave: boolean;
  /** 행복한 눈 */
  happy: boolean;
}

export interface AnimalRig {
  root: THREE.Group;
  /** 머리 꼭대기 높이(말풍선 자리, 스케일 반영된 m) */
  top: number;
  update: (t: number, dt: number, p: AnimalPose) => void;
  /** 카메라 근접 페이드(1 = 불투명) */
  setFade: (o: number) => void;
}

function dotsTexture(a: string, b: string): THREE.CanvasTexture {
  const t = canvasTex(256, (g, n) => {
    g.fillStyle = a; g.fillRect(0, 0, n, n);
    g.fillStyle = b;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      g.beginPath(); g.arc((x + (y % 2) * 0.5) * n / 6, (y + 0.5) * n / 6, n * 0.03, 0, Math.PI * 2); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function lighten(c: string, k: number): string {
  return '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
}
function darken(c: string, k: number): string {
  return '#' + new THREE.Color(c).lerp(new THREE.Color('#3a2a3a'), k).getHexString();
}

/** 옷 무늬: 회전체 UV(u=0.5 정면, 캔버스 위 = 옷 위) */
function outfitTexture(o: Outfit, a: string): THREE.CanvasTexture {
  const hi = lighten(a, 0.72), lo = darken(a, 0.18);
  return canvasTex(512, (g, n) => {
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    };
    if (o === 'stripe') {
      g.fillStyle = hi; g.fillRect(0, 0, n, n);
      g.fillStyle = a;
      for (let i = 0; i < 6; i++) g.fillRect(0, (i + 0.15) * n / 6, n, n / 13);
    } else if (o === 'pocket') {
      g.fillStyle = a; g.fillRect(0, 0, n, n);
      // 밑단 흰 띠 + 가슴 주머니
      g.fillStyle = hi; g.fillRect(0, n * 0.9, n, n * 0.1);
      g.fillStyle = lighten(a, 0.35); rr(n * 0.535, n * 0.3, n * 0.06, n * 0.2, n * 0.02); g.fill();
      g.strokeStyle = lo; g.lineWidth = n * 0.008; g.setLineDash([n * 0.012, n * 0.01]);
      rr(n * 0.54, n * 0.31, n * 0.05, n * 0.18, n * 0.016); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ff7a9a'; g.beginPath(); g.arc(n * 0.565, n * 0.27, n * 0.016, 0, Math.PI * 2); g.fill();
    } else if (o === 'overalls') {
      // 흰 티 위 멜빵 바지(앞 가슴판 + 끈 + 단추)
      g.fillStyle = '#fffaf2'; g.fillRect(0, 0, n, n);
      g.fillStyle = a; g.fillRect(0, n * 0.55, n, n * 0.45);
      rr(n * 0.44, n * 0.32, n * 0.12, n * 0.4, n * 0.02); g.fill();
      g.fillRect(n * 0.445, 0, n * 0.025, n * 0.36); g.fillRect(n * 0.53, 0, n * 0.025, n * 0.36);
      g.fillRect(n * 0.945, 0, n * 0.03, n * 0.6); g.fillRect(n * 0.025, 0, n * 0.03, n * 0.6);
      g.fillStyle = '#ffd36e';
      for (const x of [0.457, 0.543]) { g.beginPath(); g.arc(x * n, n * 0.36, n * 0.014, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = lo; g.lineWidth = n * 0.006; rr(n * 0.475, n * 0.42, n * 0.05, n * 0.1, n * 0.01); g.stroke();
    } else if (o === 'dress') {
      g.fillStyle = a; g.fillRect(0, 0, n, n);
      // 물방울 + 흰 둥근 칼라
      g.fillStyle = hi;
      for (let y = 0; y < 7; y++) for (let x = 0; x < 14; x++) {
        g.beginPath(); g.arc((x + (y % 2) * 0.5) * n / 14, (y + 0.6) * n / 7, n * 0.012, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#ffffff';
      for (const x of [0.47, 0.53]) { g.beginPath(); g.ellipse(x * n, n * 0.02, n * 0.04, n * 0.09, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = lo; g.fillRect(0, n * 0.5, n, n * 0.03);
    } else {
      // 후드티: 캥거루 주머니 + 밑단 시보리
      g.fillStyle = a; g.fillRect(0, 0, n, n);
      g.fillStyle = lo; rr(n * 0.43, n * 0.58, n * 0.14, n * 0.2, n * 0.04); g.fill();
      g.fillStyle = a; rr(n * 0.437, n * 0.59, n * 0.126, n * 0.18, n * 0.035); g.fill();
      g.fillStyle = lo;
      for (let i = 0; i < 64; i++) g.fillRect(i * n / 64, n * 0.88, n / 160, n * 0.12);
      g.fillStyle = hi; g.beginPath(); g.arc(n * 0.5, n * 0.36, n * 0.03, 0, Math.PI * 2); g.fill();
    }
  });
}

/** 둥근 끝 뿔 모양(고양이·여우 귀) — 아래 원점, +y 로 h */
function pointyEar(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = lathe([[0.0001, 0], [w * 0.95, 0.05 * h], [w, 0.25 * h], [w * 0.62, 0.65 * h], [w * 0.2, 0.93 * h], [0.0001, h]], 28, 20);
  g.scale(1, 1, d / w);
  return g;
}

const lerp = THREE.MathUtils.lerp;

export function buildAnimal(spec: AnimalSpec): AnimalRig {
  const K = spec.kind;
  const root = new THREE.Group();
  root.name = `resident-${K}`;
  const furM = skinMat(spec.fur);
  const lightM = skinMat(spec.light);
  const earInM = skinMat(spec.earIn ?? '#ffb3ad');
  const penguin = K === 'penguin';
  let shirtM: THREE.Material | null = null;
  let sleeveM: THREE.Material | null = null;
  if (spec.outfit && !penguin) {
    const oc = spec.outfitColor ?? spec.shirt?.a ?? '#8fd3ff';
    shirtM = clothMat(oc, outfitTexture(spec.outfit, oc));
    sleeveM = clothMat(spec.outfit === 'overalls' ? '#fffaf2' : spec.outfit === 'stripe' ? lighten(oc, 0.72) : oc);
  } else if (spec.shirt) {
    const s = spec.shirt;
    const tex = s.pattern === 'stripe' ? stripeTexture(s.a, s.b ?? '#ffffff', 7) : s.pattern === 'dots' ? dotsTexture(s.a, s.b ?? '#ffffff') : undefined;
    shirtM = clothMat(s.a, tex);
  }
  const bodyM = shirtM ?? furM;

  const rig = new THREE.Group();
  root.add(rig);
  const HIP = 0.22;

  // ── 다리(짧고 통통) ──
  const legs: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(m * 0.088, HIP, 0);
    if (penguin) {
      // 주황 물갈퀴 발
      leg.add(mesh(ellipsoid(0.075, 0.03, 0.11), glossMat('#ffa94d', 0.45), 0, 0.03 - HIP, 0.05));
      leg.add(mesh(capsule(0.045, 0.12), skinMat('#ffa94d'), 0, 0.1 - HIP, 0.0));
    } else {
      leg.add(mesh(ellipsoid(0.075, 0.058, 0.092), K === 'camel' ? skinMat('#b98a5e') : furM, 0, 0.055 - HIP, 0.02));
      leg.add(mesh(capsule(0.06, 0.18), furM, 0, 0.13 - HIP, 0));
    }
    rig.add(leg);
    legs.push(leg);
  }

  // ── 몸통 ──
  const body = new THREE.Group();
  body.position.y = HIP;
  rig.add(body);
  const bp = new THREE.Group();
  bp.position.y = -HIP;
  body.add(bp);
  const belly = mesh(ellipsoid(0.165, 0.135, 0.145), penguin ? lightM : furM, 0, 0.24, 0);
  bp.add(belly);
  const torso = mesh(lathe([
    [0, 0.2], [0.13, 0.205], [0.185, 0.25], [0.19, 0.32], [0.172, 0.42], [0.13, 0.5], [0.07, 0.53], [0, 0.54],
  ], 64, 40), bodyM);
  torso.scale.z = 0.88;
  bp.add(torso);
  if (penguin) {
    // 하얀 배(앞쪽 볼록)
    const wb = mesh(ellipsoid(0.13, 0.17, 0.08, 40, 28), lightM, 0, 0.33, 0.11);
    bp.add(wb);
  }
  if (K === 'camel') {
    // 등 혹 두 개
    bp.add(mesh(ellipsoid(0.11, 0.1, 0.09), furM, 0, 0.48, -0.13));
    bp.add(mesh(ellipsoid(0.09, 0.085, 0.08), furM, 0, 0.36, -0.16));
  }

  if (spec.outfit === 'dress' && shirtM && !penguin) {
    // 나팔 치마
    const sk = mesh(lathe([[0.17, 0.36], [0.2, 0.3], [0.25, 0.2], [0.275, 0.15], [0.262, 0.135], [0.2, 0.15]], 64, 24), shirtM);
    sk.scale.z = 0.92;
    bp.add(sk);
  }
  if (spec.outfit === 'hoodie' && shirtM && !penguin) {
    // 등 뒤로 접힌 후드 + 끈 두 가닥
    const hood = mesh(ellipsoid(0.16, 0.085, 0.1, 40, 24), shirtM, 0, 0.545, -0.1);
    hood.rotation.x = -0.35;
    bp.add(hood);
    for (const m of [-1, 1]) bp.add(mesh(capsule(0.011, 0.11), clothMat('#ffffff'), m * 0.04, 0.47, 0.16));
  }

  // ── 꼬리 ──
  const tail = new THREE.Group();
  tail.position.set(0, 0.25, -0.15);
  bp.add(tail);
  switch (K) {
    case 'cat':
      tail.add(mesh(taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.02, -0.12), new THREE.Vector3(0, 0.14, -0.2), new THREE.Vector3(0.03, 0.3, -0.17), new THREE.Vector3(0.07, 0.36, -0.1)], 0.04, 32, 12), furM));
      break;
    case 'dog':
      tail.add(mesh(taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.06, -0.08), new THREE.Vector3(0, 0.16, -0.12), new THREE.Vector3(0, 0.22, -0.08)], 0.045, 24, 12), furM));
      break;
    case 'fox': {
      const t1 = mesh(ellipsoid(0.11, 0.24, 0.11, 32, 22), furM, 0, 0.12, -0.12);
      t1.rotation.x = -0.75;
      tail.add(t1);
      const tip = mesh(ellipsoid(0.075, 0.09, 0.075, 24, 16), lightM, 0, 0.27, -0.27);
      tip.rotation.x = -0.75;
      tail.add(tip);
      break;
    }
    case 'squirrel': {
      // 크게 말린 복슬 꼬리: 굵어지는 구슬을 S 곡선으로
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, 0.05, -0.16), new THREE.Vector3(0, 0.3, -0.22), new THREE.Vector3(0, 0.52, -0.12), new THREE.Vector3(0, 0.56, 0.0)]);
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        const p = c.getPoint(u);
        const r = 0.07 + 0.08 * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.1));
        tail.add(mesh(ellipsoid(r, r, r * 0.9, 24, 16), furM, p.x, p.y, p.z));
      }
      tail.add(mesh(ellipsoid(0.08, 0.06, 0.07, 20, 14), lightM, 0, 0.58, 0.02));
      break;
    }
    case 'otter':
      tail.add(mesh(taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.12, -0.12), new THREE.Vector3(0, -0.2, -0.3), new THREE.Vector3(0, -0.22, -0.42)], 0.07, 24, 14), furM));
      break;
    case 'camel':
      tail.add(mesh(taperTube([new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, -0.02, -0.06), new THREE.Vector3(0, -0.12, -0.08)], 0.02, 12, 8), furM));
      tail.add(mesh(ellipsoid(0.03, 0.045, 0.03), skinMat('#8a5e3c'), 0, -0.14, -0.08));
      break;
    case 'rabbit':
      tail.add(mesh(ellipsoid(0.075, 0.075, 0.07), lightM, 0, 0.0, 0));
      break;
    case 'penguin': {
      const pt = mesh(ellipsoid(0.07, 0.025, 0.08), furM, 0, -0.08, -0.02);
      pt.rotation.x = 0.5;
      tail.add(pt);
      break;
    }
    default:
      tail.add(mesh(ellipsoid(0.055, 0.055, 0.05), furM));
  }

  // ── 팔 ──
  const arms: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(m * 0.135, 0.44 - HIP, 0);
    arm.rotation.z = m * 0.38;
    if (penguin) {
      const fl = mesh(ellipsoid(0.045, 0.15, 0.085), furM, 0, -0.1, 0);
      arm.add(fl);
    } else {
      if (shirtM) arm.add(mesh(lathe([[0, 0.03], [0.055, 0.028], [0.07, 0.0], [0.072, -0.05], [0.068, -0.085], [0.05, -0.08]], 40, 24), sleeveM ?? shirtM));
      arm.add(mesh(capsule(0.05, 0.16), furM, 0, -0.1, 0));
      arm.add(mesh(ellipsoid(0.058, 0.06, 0.055), K === 'camel' ? furM : furM, 0, -0.18, 0.004));
    }
    body.add(arm);
    arms.push(arm);
  }

  // ── 머리 ──
  const RX = K === 'rabbit' ? 0.34 : K === 'penguin' ? 0.35 : 0.36;
  const RY = K === 'rabbit' ? 0.32 : K === 'camel' ? 0.3 : 0.315;
  const RZ = 0.33;
  const head = new THREE.Group();
  head.position.set(0, 0.53 + RY * 0.9 - HIP, 0);
  body.add(head);
  const hasMuzzle = K === 'bear' || K === 'polar' || K === 'dog' || K === 'otter' || K === 'camel';
  const smallMuzzle = K === 'cat' || K === 'rabbit' || K === 'fox' || K === 'squirrel';
  const lightCss = spec.light;
  const paint = penguin
    ? (g: CanvasRenderingContext2D, n: number) => {
      // 하트 모양 흰 얼굴 가면
      g.fillStyle = lightCss;
      g.beginPath();
      const cx = n / 2, cy = n * 0.52;
      g.moveTo(cx, n * 0.98);
      g.bezierCurveTo(n * 0.05, n * 0.8, n * 0.02, cy - n * 0.2, n * 0.25, n * 0.27);
      g.bezierCurveTo(n * 0.38, n * 0.2, n * 0.47, n * 0.28, cx, n * 0.36);
      g.bezierCurveTo(n * 0.53, n * 0.28, n * 0.62, n * 0.2, n * 0.75, n * 0.27);
      g.bezierCurveTo(n * 0.98, cy - n * 0.2, n * 0.95, n * 0.8, cx, n * 0.98);
      g.fill();
    }
    : K === 'fox' || K === 'otter' || K === 'squirrel'
      ? (g: CanvasRenderingContext2D, n: number) => {
        // 아래 볼 밝은 털
        g.fillStyle = lightCss;
        g.beginPath(); g.ellipse(n * 0.5, n * 0.9, n * 0.42, n * 0.3, 0, 0, Math.PI * 2); g.fill();
      }
      : K === 'cat'
        ? (g: CanvasRenderingContext2D, n: number) => {
          // 이마 줄무늬 세 가닥
          g.strokeStyle = 'rgba(150,90,50,0.45)';
          g.lineWidth = n * 0.025; g.lineCap = 'round';
          for (const dx of [-0.06, 0, 0.06]) {
            g.beginPath(); g.moveTo(n * (0.5 + dx), n * 0.08); g.lineTo(n * (0.5 + dx * 0.8), n * 0.2); g.stroke();
          }
        }
        : undefined;
  const face = faceHead(RX, RY, RZ, spec.fur, {
    skin: spec.fur,
    eyeX: penguin ? 0.36 : 0.4, eyeY: penguin ? 0.02 : 0.08, eyeW: 0.1, eyeH: 0.135,
    iris: spec.iris ?? '#6b4a3a',
    lashes: spec.lashes,
    blush: { x: 0.62, y: -0.16, w: 0.14, h: 0.085, color: spec.blush ?? '#ff8f86' },
    mouth: 'none',
    paint,
  }, 0.07);
  head.add(face.group);

  // 주둥이·코·부리
  if (hasMuzzle || smallMuzzle) {
    const s = smallMuzzle ? 0.62 : K === 'camel' ? 1.15 : 1;
    const MZ = { x: 0.15 * s, y: 0.105 * s, z: (smallMuzzle ? 0.075 : 0.1) * (K === 'camel' ? 2.0 : 1) };
    const front = halfEllipsoid(MZ.x, MZ.y, MZ.z, true, 48, 32);
    planarUV(front, MZ.x, MZ.y);
    const mcol = smallMuzzle && K !== 'cat' && K !== 'rabbit' ? spec.light : spec.light;
    const mz = new THREE.Group();
    mz.position.set(0, smallMuzzle ? -0.1 : -0.11, RZ * (smallMuzzle ? 0.86 : 0.8));
    mz.add(mesh(front, skinMat(mcol, muzzleTexture(mcol, '#5a3a2e'))));
    mz.add(mesh(halfEllipsoid(MZ.x, MZ.y, MZ.z, false, 48, 32), skinMat(mcol)));
    const noseCol = K === 'cat' || K === 'rabbit' ? '#ff8fa0' : '#4a3028';
    const ns = smallMuzzle ? 0.7 : 1;
    mz.add(mesh(ellipsoid(0.05 * ns, 0.034 * ns, 0.034 * ns), glossMat(noseCol, 0.3), 0, 0.045 * s, MZ.z * 0.86));
    head.add(mz);
    if (K === 'cat') {
      // 수염(가는 선)
      const wm = new THREE.MeshBasicMaterial({ color: '#8a6a58' });
      for (const m of [-1, 1]) for (const dy of [0.0, -0.03]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 4), wm);
        w.position.set(m * 0.17, -0.1 + dy, RZ * 0.86);
        w.rotation.z = Math.PI / 2 + m * (0.12 + dy * 3);
        head.add(w);
      }
    }
  } else if (penguin) {
    // 노란 부리(통통한 물방울)
    const beak = mesh(ellipsoid(0.07, 0.045, 0.08), glossMat('#ffb443', 0.35), 0, -0.1, RZ * 0.92);
    head.add(beak);
  }

  // 귀
  const earAt = (az: number, el: number) => new THREE.Vector3(Math.sin(az) * Math.cos(el) * RX * 0.95, Math.sin(el) * RY * 0.95, Math.cos(az) * Math.cos(el) * RZ * 0.95);
  for (const m of [-1, 1]) {
    const ear = new THREE.Group();
    switch (K) {
      case 'bear': case 'polar': case 'otter': {
        const sc = K === 'otter' ? 0.6 : 1;
        ear.position.copy(earAt(m * 0.72, 0.8)).add(new THREE.Vector3(0, 0, 0.03));
        ear.rotation.set(-0.1, m * 0.4, -m * 0.45);
        ear.add(mesh(ellipsoid(0.1 * sc, 0.095 * sc, 0.055 * sc), furM));
        ear.add(mesh(ellipsoid(0.062 * sc, 0.058 * sc, 0.03 * sc), earInM, 0, -0.005, 0.03 * sc));
        break;
      }
      case 'cat': case 'fox': case 'squirrel': {
        const big = K === 'fox' ? 1.35 : 1;
        ear.position.copy(earAt(m * 0.62, 0.78));
        ear.rotation.set(-0.12, 0, -m * 0.38);
        ear.add(mesh(pointyEar(0.095 * big, 0.2 * big, 0.05), furM));
        ear.add(mesh(pointyEar(0.06 * big, 0.14 * big, 0.02), earInM, 0, 0.02, 0.025));
        if (K === 'squirrel') ear.add(mesh(ellipsoid(0.03, 0.06, 0.03), furM, 0, 0.2, 0));
        if (K === 'fox') ear.add(mesh(pointyEar(0.05, 0.08, 0.035), skinMat('#5a3a2e'), 0, 0.2, 0.0));
        break;
      }
      case 'rabbit': {
        ear.position.copy(earAt(m * 0.32, 1.0));
        ear.rotation.set(-0.15, 0, -m * 0.22);
        const e1 = mesh(ellipsoid(0.075, 0.24, 0.05, 32, 22), furM, 0, 0.2, 0);
        ear.add(e1);
        ear.add(mesh(ellipsoid(0.045, 0.19, 0.02, 24, 18), earInM, 0, 0.2, 0.036));
        if (m === 1) { ear.rotation.z = -0.65; ear.rotation.x = 0.1; } // 한쪽 귀가 폴더(귀여움)
        break;
      }
      case 'dog': {
        ear.position.copy(earAt(m * 1.15, 0.45));
        ear.rotation.set(0, 0, m * 0.25);
        ear.add(mesh(ellipsoid(0.085, 0.17, 0.045, 28, 20), skinMat(spec.light === '#ffffff' ? '#c98b55' : spec.light), 0, -0.1, 0));
        break;
      }
      case 'camel': {
        ear.position.copy(earAt(m * 1.2, 0.55));
        ear.rotation.set(0, 0, -m * 0.9);
        ear.add(mesh(ellipsoid(0.04, 0.075, 0.03), furM));
        break;
      }
      default: break;
    }
    head.add(ear);
  }

  // ── 소품 ──
  const accC = spec.accColor ?? '#ff8fb1';
  const accM = clothMat(accC);
  const top = 0.53 + RY * 1.9 + (K === 'rabbit' ? 0.32 : K === 'fox' || K === 'cat' || K === 'squirrel' ? 0.1 : 0) + (spec.acc === 'helmet' ? 0.12 : 0);
  switch (spec.acc) {
    case 'scarf': {
      const sc = mesh(new THREE.TorusGeometry(0.11, 0.05, 18, 40), accM, 0, 0.53 - HIP, 0.0);
      sc.rotation.x = Math.PI / 2;
      sc.scale.set(1.15, 1, 1);
      body.add(sc);
      const tailS = mesh(capsule(0.045, 0.2), accM, 0.08, 0.42 - HIP, 0.13);
      tailS.rotation.z = 0.25;
      tailS.scale.z = 0.5;
      body.add(tailS);
      break;
    }
    case 'beanie': {
      const cap = mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.42), accM, 0, RY * 0.12, 0);
      cap.scale.set(RX * 1.05, RY * 1.05, RZ * 1.05);
      head.add(cap);
      const band = mesh(new THREE.TorusGeometry(1, 0.08, 14, 40), clothMat('#ffffff'), 0, RY * 0.12 + RY * 0.25, 0);
      band.rotation.x = Math.PI / 2;
      band.scale.set(RX * 0.98, RZ * 0.98, RY);
      head.add(band);
      head.add(mesh(ellipsoid(0.07, 0.07, 0.07), clothMat('#ffffff'), 0, RY * 1.18, 0));
      break;
    }
    case 'safari': {
      const hat = new THREE.Group();
      hat.position.set(0, RY * 0.62, -0.01);
      hat.rotation.x = -0.12;
      const khaki = clothMat('#e7cf97');
      const dome = mesh(new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2), khaki);
      dome.scale.set(RX * 0.82, RY * 0.6, RZ * 0.82);
      hat.add(dome);
      const brim = mesh(new THREE.CylinderGeometry(RX * 1.12, RX * 1.12, 0.022, 48), khaki);
      hat.add(brim);
      const band = mesh(new THREE.CylinderGeometry(RX * 0.83, RX * 0.83, 0.05, 48, 1, true), clothMat(accC), 0, 0.035, 0);
      hat.add(band);
      head.add(hat);
      break;
    }
    case 'sunhat': {
      const hat = new THREE.Group();
      hat.position.set(0, RY * 0.7, -0.02);
      hat.rotation.x = -0.15;
      const straw = clothMat('#f6dc9a');
      const crown = mesh(lathe([[0.0001, 0.12], [0.14, 0.115], [0.19, 0.06], [0.2, 0.0]], 40, 12), straw);
      hat.add(crown);
      const brim = mesh(lathe([[0.19, 0.01], [0.3, 0.0], [0.42, -0.04], [0.44, -0.055]], 48, 10), straw);
      brim.material = straw.clone();
      (brim.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide;
      hat.add(brim);
      hat.add(mesh(new THREE.CylinderGeometry(0.197, 0.2, 0.04, 40, 1, true), clothMat(accC), 0, 0.03, 0));
      head.add(hat);
      break;
    }
    case 'helmet': {
      // 우주 헬멧: 투명 유리 방울 + 흰 목 링 + 작은 안테나
      const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshPhysicalMaterial({
        color: '#dff3ff', transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1, depthWrite: false,
      }));
      glass.scale.set(RX * 1.32, RY * 1.36, RZ * 1.38);
      glass.position.set(0, 0.02, 0.03);
      glass.renderOrder = 3;
      glass.castShadow = false;
      head.add(glass);
      const ring = mesh(new THREE.TorusGeometry(0.17, 0.045, 16, 40), glossMat('#ffffff', 0.35), 0, 0.53 - HIP, 0);
      ring.rotation.x = Math.PI / 2;
      body.add(ring);
      head.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), glossMat('#c8d4e6', 0.3), 0.12, RY * 1.4, 0));
      head.add(mesh(ellipsoid(0.03, 0.03, 0.03), glossMat(accC, 0.3), 0.12, RY * 1.4 + 0.08, 0));
      // 산소통 배낭
      body.add(mesh(capsule(0.09, 0.26), glossMat('#ffffff', 0.35), 0, 0.38 - HIP, -0.17));
      break;
    }
    case 'fairy': {
      // 빨간 버섯 모자(흰 점) + 반투명 날개
      const capTex = canvasTex(256, (g, n) => {
        g.fillStyle = accC; g.fillRect(0, 0, n, n);
        g.fillStyle = '#ffffff';
        for (const [x, y, r] of [[0.2, 0.3, 0.07], [0.55, 0.2, 0.09], [0.8, 0.45, 0.06], [0.35, 0.65, 0.08], [0.7, 0.75, 0.06], [0.05, 0.8, 0.05]]) {
          g.beginPath(); g.arc(x * n, y * n, r * n, 0, Math.PI * 2); g.fill();
        }
      });
      capTex.wrapS = THREE.RepeatWrapping;
      const capG = lathe([[0.0001, 1.0], [0.55, 0.92], [0.92, 0.6], [1.08, 0.18], [1.0, 0.02], [0.7, 0.0], [0.0001, 0.02]], 48, 24);
      const cap = mesh(capG, clothMat('#ffffff', capTex), -0.03, RY * 0.66, -0.01);
      cap.scale.set(RX * 0.95, RY * 0.95, RZ * 0.95);
      cap.rotation.z = 0.2;
      head.add(cap);
      const wingM = new THREE.MeshPhysicalMaterial({ color: '#d9f1ff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.2, sheen: 1, sheenColor: new THREE.Color('#ffd1f0'), depthWrite: false });
      for (const m of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), wingM);
        w.scale.set(1, 1.5, 1);
        w.position.set(m * 0.13, 0.48 - HIP, -0.17);
        w.rotation.set(0, m * 0.6, m * 0.5);
        w.renderOrder = 3;
        body.add(w);
      }
      break;
    }
    case 'lei': {
      const cols = ['#ff7aa8', '#ffd36e', '#ffffff', '#ff9f6e', '#c9a6ff'];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        body.add(mesh(ellipsoid(0.04, 0.04, 0.03, 16, 12), clothMat(cols[i % cols.length]), Math.sin(a) * 0.15, 0.5 - HIP - 0.04 * Math.max(0, Math.cos(a)), Math.cos(a) * 0.13));
      }
      // 귀 옆 꽃
      head.add(mesh(ellipsoid(0.07, 0.07, 0.03), clothMat('#ff7aa8'), RX * 0.75, RY * 0.55, RZ * 0.35));
      head.add(mesh(ellipsoid(0.025, 0.025, 0.02), clothMat('#ffd36e'), RX * 0.77, RY * 0.56, RZ * 0.39));
      break;
    }
    case 'flower': {
      const cols = ['#ff9fc6', '#fff1a8', '#c9b6ff', '#ffffff', '#ffb38a'];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const p = new THREE.Vector3(Math.sin(a) * RX * 0.8, RY * 0.72, Math.cos(a) * RZ * 0.8);
        head.add(mesh(ellipsoid(0.045, 0.03, 0.045, 16, 10), clothMat(cols[i % cols.length]), p.x, p.y, p.z));
        head.add(mesh(ellipsoid(0.016, 0.014, 0.016, 10, 8), clothMat('#ffd36e'), p.x, p.y + 0.02, p.z));
      }
      break;
    }
    case 'bow': {
      for (const m of [-1, 1]) {
        const b = mesh(ellipsoid(0.07, 0.05, 0.035), accM, m * 0.065 + RX * 0.45, RY * 0.8, 0.05);
        b.rotation.z = m * 0.5;
        head.add(b);
      }
      head.add(mesh(ellipsoid(0.03, 0.03, 0.03), accM, RX * 0.45, RY * 0.8, 0.06));
      break;
    }
    default: break;
  }

  if (spec.acc === 'glasses' || spec.acc2 === 'glasses') {
    // 동그란 안경(눈 위치 앞)
    const fm = glossMat(spec.acc === 'glasses' ? accC : '#6a4a3a', 0.3);
    for (const m of [-1, 1]) {
      const ring = mesh(new THREE.TorusGeometry(0.07, 0.011, 12, 40), fm, m * 0.12, 0.035, RZ * 0.97);
      ring.rotation.y = m * 0.25;
      head.add(ring);
    }
    const br = mesh(capsule(0.009, 0.07), fm, 0, 0.05, RZ * 1.0);
    br.rotation.z = Math.PI / 2;
    head.add(br);
  }
  if (spec.acc2 === 'bow' && spec.acc !== 'bow') {
    const bm = clothMat(spec.outfitColor ? darken(spec.outfitColor, 0.05) : '#ff7aa8');
    for (const m of [-1, 1]) {
      const b = mesh(ellipsoid(0.06, 0.042, 0.03), bm, m * 0.055 - RX * 0.5, RY * 0.78, 0.06);
      b.rotation.z = m * 0.5;
      head.add(b);
    }
    head.add(mesh(ellipsoid(0.026, 0.026, 0.026), bm, -RX * 0.5, RY * 0.78, 0.07));
  }

  // 정지 부품은 재질별로 합친다
  for (const g of [bp, tail, head, ...arms, ...legs]) mergeByMaterial(g);
  // 카메라가 파고들면 디더로 비치게(alphaHash: 정렬 없이 점점이 빠진다)
  const fadeMats = new Set<THREE.Material>();
  root.traverse((o) => {
    const mm = (o as THREE.Mesh).material;
    if (!mm) return;
    for (const m of Array.isArray(mm) ? mm : [mm]) if (!m.transparent) { m.alphaHash = true; fadeMats.add(m); }
  });
  let fadeCur = 1;
  // 깜빡임 주기 3~5 초(주민마다 다르게), 0.12 초만
  let hsh = 0;
  for (const ch of spec.fur + spec.kind + (spec.outfitColor ?? '')) hsh = (hsh * 31 + ch.charCodeAt(0)) % 9973;
  const blinkP = 3 + (hsh % 200) / 100, blinkPh = (hsh % 97) / 10;

  const S = spec.scale ?? 1;
  root.scale.setScalar(S);
  const headBaseY = head.position.y;
  let phase = 0, wave = 0;
  const cur = { lean: 0, bob: 0 };

  return {
    root,
    top: (top + 0.05) * S,
    update(t, dt, p) {
      const snap = dt <= 0;
      const k = snap ? 1 : 1 - Math.exp(-dt * 10);
      if (!snap) phase += dt * (p.walk > 0.05 ? 4 + p.walk * 4.5 : 0);
      const walking = p.walk > 0.05;
      const sw = Math.sin(phase);
      const breath = Math.sin(t * 2.3 + S * 7);
      wave = lerp(wave, p.wave ? 1 : 0, snap ? (p.wave ? 1 : 0) : 1 - Math.exp(-dt * 6));
      if (snap) wave = p.wave ? 1 : 0;
      const amp = walking ? 1 : 0;
      cur.bob = lerp(cur.bob, walking ? 0.03 * Math.abs(sw) : p.talk ? 0.02 * Math.abs(Math.sin(t * 6)) : 0, k);
      cur.lean = lerp(cur.lean, walking ? 0.08 : 0, k);
      rig.position.y = cur.bob;
      rig.rotation.x = cur.lean;
      rig.rotation.z = walking ? 0.05 * sw : 0;
      body.scale.set(1 + 0.01 * breath, 1 + 0.016 * breath, 1 + 0.01 * breath);
      head.position.y = headBaseY + 0.009 * breath;
      legs[0].rotation.x = 0.55 * sw * amp;
      legs[1].rotation.x = -0.55 * sw * amp;
      // 팔: 걷기 흔들기 / 대화 몸짓 / 손 흔들기(-x 팔)
      const talkG = p.talk ? Math.sin(t * 5) : 0;
      arms[1].rotation.set(0.6 * sw * amp - 0.35 * Math.max(0, talkG), 0, 0.38 + 0.02 * breath + 0.25 * Math.max(0, talkG));
      const waveZ = -(2.5 + 0.32 * Math.sin(t * 7.0));
      const restZ = -(0.38 + 0.02 * breath) - (p.talk ? 0.3 * Math.max(0, -talkG) : 0);
      arms[0].rotation.set(lerp(-0.6 * sw * amp, -0.3, wave), 0, lerp(restZ, waveZ, wave));
      head.rotation.z = p.talk ? 0.09 * Math.sin(t * 3.1) : -0.05 * wave + 0.04 * Math.sin(t * 0.9 + S);
      head.rotation.x = walking ? -0.06 : p.talk ? 0.04 * Math.sin(t * 4.2) : 0;
      tail.rotation.y = 0.25 * Math.sin(t * (K === 'dog' ? 9 : 2.2));
      face.setBlink(p.happy || (t + blinkPh) % blinkP < 0.12);
    },
    setFade(o) {
      if (Math.abs(o - fadeCur) < 0.01) return;
      fadeCur = o;
      for (const m of fadeMats) m.opacity = o;
    },
  };
}
