// 동물 주민 빌더: 종(곰·고양이·토끼·펭귄·북극곰·다람쥐·수달·낙타·여우·강아지 +
// 오리·거북·비버·펠리컨·양·너구리·부엉이·판다·개구리·코알라·햄스터·알파카·고슴도치)별 귀·꼬리·주둥이·부리·얼굴 무늬 +
// 섬 테마 옷·소품(목도리·탐험모·우주 헬멧·요정 날개·꽃목걸이·밀짚모자·털모자·화관·선장 모자).
// 새로 넣은 종은 얼굴을 art.ts 공용 눈·볼터치로(GDD 7.2) — 그림 얼굴엔 무늬(판다 눈가·너구리 가면·부엉이 얼굴판)만.
// 관절(다리·팔·머리) 피벗으로 걷기·손 흔들기·박수·대화 몸짓을 한다. 부수효과 없는 빌더(다른 모듈이 import 해도 된다).
import * as THREE from 'three';
import { ellipsoid, halfEllipsoid, planarUV, lathe, capsule, taperTube } from './geo';
import { stripeTexture, muzzleTexture, canvasTex } from './tex';
import { skinMat, clothMat, glossMat, mesh, faceHead, mergeByMaterial } from './kit';
import { addEyes, addBlush, type EyeSet } from '../../core/art';

export type AnimalKind = 'bear' | 'cat' | 'rabbit' | 'penguin' | 'polar' | 'squirrel' | 'otter' | 'camel' | 'fox' | 'dog'
  | 'duck' | 'turtle' | 'beaver' | 'pelican' | 'sheep' | 'raccoon' | 'owl' | 'panda' | 'frog' | 'koala' | 'hamster' | 'alpaca' | 'hedgehog';
/** 새 종(art.ts 얼굴) */
export const NEW_KINDS: readonly AnimalKind[] = ['duck', 'turtle', 'beaver', 'pelican', 'sheep', 'raccoon', 'owl', 'panda', 'frog', 'koala', 'hamster', 'alpaca', 'hedgehog'];
export const ANIMAL_KINDS: readonly AnimalKind[] = ['bear', 'cat', 'rabbit', 'penguin', 'polar', 'squirrel', 'otter', 'camel', 'fox', 'dog', ...NEW_KINDS];
export type Accessory = 'scarf' | 'safari' | 'helmet' | 'fairy' | 'lei' | 'sunhat' | 'beanie' | 'flower' | 'bow' | 'glasses' | 'captain' | 'none';
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
  /** 종 무늬 색(거북 등딱지·판다 얼룩·너구리 가면·고슴도치 가시·비버 꼬리) */
  mark?: string;
  /** 귀 크기 배율(사막여우 소금별처럼 큰 귀) */
  earScale?: number;
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
  /** 박수(★4 잡기 축하) — '> <' 눈 */
  clap?: boolean;
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

/** 종 무늬 기본색 */
const MARK_DEFAULT: Partial<Record<AnimalKind, string>> = {
  turtle: '#c99a5e', panda: '#4a4458', raccoon: '#6e5a62', hedgehog: '#9a6a4a', beaver: '#7a5038', koala: '#5a5060',
  owl: '#a8784f', duck: '#ffa94d', pelican: '#ffb443', frog: '#7cc96b', sheep: '#5a4a48', alpaca: '#e8cfa8', hamster: '#ffffff',
};

// 공용 지오메트리(여러 주민이 같이 쓴다 — 청크가 버려도 dispose 안 함)
const shared = <T extends THREE.BufferGeometry>(g: T): T => { g.userData.shared = true; return g; };
let spineGeo: THREE.BufferGeometry | null = null;
/** 고슴도치 가시: 끝이 둥근 짧은 뿔(낮은 해상도 — 수십 개를 합친다) */
const spine = () => (spineGeo ??= shared(lathe([[0.0001, 0], [0.034, 0.01], [0.03, 0.05], [0.016, 0.1], [0.0001, 0.115]], 10, 6)));
let puffGeo: THREE.BufferGeometry | null = null;
/** 양털 뭉치 */
const puff = () => (puffGeo ??= shared(ellipsoid(1, 1, 1, 18, 12)));

/** 거북 등딱지 육각 무늬(회전체 UV) */
function shellTexture(base: string, line: string): THREE.CanvasTexture {
  return canvasTex(256, (g, n) => {
    g.fillStyle = base; g.fillRect(0, 0, n, n);
    g.strokeStyle = line; g.lineWidth = n * 0.03; g.lineJoin = 'round';
    const r = n / 7;
    for (let row = -1; row < 6; row++) for (let col = -1; col < 6; col++) {
      const cx = col * r * 1.75 + (row % 2) * r * 0.87, cy = row * r * 1.5;
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.arc(cx - r * 0.2, cy - r * 0.25, r * 0.3, 0, Math.PI * 2); g.fill();
    }
  });
}

/** 타원체 머리 앞면 위 점(x, y) → 표면 위치 + 법선(art 눈을 정확히 붙이려고) */
function onHead(RX: number, RY: number, RZ: number, x: number, y: number, lift = 0.004) {
  const zz = RZ * Math.sqrt(Math.max(0.04, 1 - (x / RX) ** 2 - (y / RY) ** 2));
  const n = new THREE.Vector3(x / (RX * RX), y / (RY * RY), zz / (RZ * RZ)).normalize();
  return { pos: new THREE.Vector3(x, y, zz).addScaledVector(n, lift), n };
}

export function buildAnimal(spec: AnimalSpec): AnimalRig {
  const K = spec.kind;
  const root = new THREE.Group();
  root.name = `resident-${K}`;
  const furM = skinMat(spec.fur);
  const lightM = skinMat(spec.light);
  const earInM = skinMat(spec.earIn ?? '#ffb3ad');
  const penguin = K === 'penguin';
  /** art.ts 공용 눈·볼터치를 쓰는 새 종 */
  const artFace = NEW_KINDS.includes(K);
  const bird = K === 'duck' || K === 'pelican' || K === 'owl';
  const webbed = penguin || K === 'duck' || K === 'pelican';
  const markC = spec.mark ?? MARK_DEFAULT[K] ?? darken(spec.fur, 0.35);
  const markM = skinMat(markC);
  // 양은 털(fur) = 몸통 털, 얼굴·팔다리 = light. 판다는 팔다리가 까맣다(먹색 계열)
  const limbM = K === 'sheep' ? lightM : K === 'panda' ? markM : furM;
  const faceSkin = K === 'sheep' ? spec.light : spec.fur;
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
    leg.position.set(m * (K === 'frog' ? 0.1 : 0.088), HIP, 0);
    if (webbed) {
      // 주황 물갈퀴 발
      const fc = penguin ? '#ffa94d' : markC;
      leg.add(mesh(ellipsoid(0.075, 0.03, 0.11), glossMat(fc, 0.45), 0, 0.03 - HIP, 0.05));
      leg.add(mesh(capsule(0.045, 0.12), skinMat(fc), 0, 0.1 - HIP, 0.0));
    } else if (K === 'owl') {
      // 노란 동글 발 + 깃털 바지
      leg.add(mesh(ellipsoid(0.06, 0.03, 0.075), glossMat('#ffc94a', 0.45), 0, 0.03 - HIP, 0.04));
      leg.add(mesh(capsule(0.065, 0.1), furM, 0, 0.12 - HIP, 0));
    } else if (K === 'frog') {
      // 납작 넓은 발(물갈퀴 느낌)
      leg.add(mesh(ellipsoid(0.09, 0.03, 0.1), lightM, 0, 0.03 - HIP, 0.05));
      leg.add(mesh(capsule(0.062, 0.14), furM, 0, 0.11 - HIP, 0));
    } else {
      leg.add(mesh(ellipsoid(0.075, 0.058, 0.092), K === 'camel' ? skinMat('#b98a5e') : limbM, 0, 0.055 - HIP, 0.02));
      leg.add(mesh(capsule(0.06, 0.18), limbM, 0, 0.13 - HIP, 0));
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
  // 햄스터·판다·코알라는 더 통통하게
  const chub = K === 'hamster' ? 1.12 : K === 'panda' || K === 'koala' || K === 'sheep' ? 1.06 : 1;
  const belly = mesh(ellipsoid(0.165 * chub, 0.135, 0.145 * chub), penguin ? lightM : furM, 0, 0.24, 0);
  bp.add(belly);
  const torso = mesh(lathe([
    [0, 0.2], [0.13, 0.205], [0.185, 0.25], [0.19, 0.32], [0.172, 0.42], [0.13, 0.5], [0.07, 0.53], [0, 0.54],
  ], 64, 40), bodyM);
  torso.scale.set(chub, 1, 0.88 * chub);
  bp.add(torso);
  if (penguin) {
    // 하얀 배(앞쪽 볼록)
    const wb = mesh(ellipsoid(0.13, 0.17, 0.08, 40, 28), lightM, 0, 0.33, 0.11);
    bp.add(wb);
  }
  if (!shirtM && (bird || K === 'frog' || K === 'hamster' || K === 'koala' || K === 'turtle' || K === 'beaver')) {
    // 옷이 없으면 밝은 배(깃털·배 무늬)
    bp.add(mesh(ellipsoid(0.125 * chub, 0.15, 0.07, 36, 24), lightM, 0, 0.33, 0.12 * chub));
  }
  if (K === 'camel') {
    // 등 혹 두 개
    bp.add(mesh(ellipsoid(0.11, 0.1, 0.09), furM, 0, 0.48, -0.13));
    bp.add(mesh(ellipsoid(0.09, 0.085, 0.08), furM, 0, 0.36, -0.16));
  }
  if (K === 'turtle') {
    // 등딱지: 육각 무늬 둥근 돔 + 도톰한 테두리
    const sm = skinMat(markC, shellTexture(markC, darken(markC, 0.3)));
    const dome = mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), sm, 0, 0.36, -0.1);
    dome.rotation.x = -Math.PI / 2;
    dome.scale.set(0.24, 0.28, 0.17);
    bp.add(dome);
    const rim = mesh(new THREE.TorusGeometry(1, 0.13, 14, 48), skinMat(lighten(markC, 0.25)), 0, 0.36, -0.1);
    rim.scale.set(0.235, 0.275, 0.2);
    bp.add(rim);
  }
  if (K === 'sheep' || K === 'alpaca') {
    // 몽글몽글 털 목도리 + 어깨 털
    const wool = skinMat(spec.fur);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const p = mesh(puff(), wool, Math.sin(a) * 0.17, 0.5 + 0.02 * Math.cos(a * 3), Math.cos(a) * 0.15);
      p.scale.setScalar(0.065 + 0.012 * (i % 2));
      bp.add(p);
    }
    if (!shirtM) for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, y = 0.28 + 0.1 * (i % 3);
      const p = mesh(puff(), wool, Math.sin(a) * 0.185, y, Math.cos(a) * 0.165);
      p.scale.setScalar(0.07);
      bp.add(p);
    }
  }
  if (K === 'hedgehog') {
    // 등 가시(뒤쪽 반구에 바깥으로)
    for (let i = 0; i < 34; i++) {
      const u = (i + 0.5) / 34;
      const a = Math.PI * 0.62 + u * Math.PI * 0.76 + ((i * 7) % 5) * 0.03, y = 0.26 + 0.26 * ((i * 0.618) % 1);
      const n = new THREE.Vector3(Math.sin(a), (y - 0.36) * 1.6, Math.cos(a)).normalize();
      const sp = mesh(spine(), markM, Math.sin(a) * 0.18, y, Math.cos(a) * 0.16);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      sp.scale.setScalar(1.15);
      bp.add(sp);
    }
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
    case 'raccoon': {
      // 줄무늬 복슬 꼬리(색 띠 번갈아)
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.04, 0), new THREE.Vector3(0, 0.0, -0.14), new THREE.Vector3(0, 0.12, -0.26), new THREE.Vector3(0, 0.3, -0.3)]);
      for (let i = 0; i <= 7; i++) {
        const u = i / 7, p = c.getPoint(u), r = 0.075 + 0.03 * Math.sin(Math.PI * u);
        tail.add(mesh(ellipsoid(r, r, r * 0.95, 22, 14), i % 2 ? markM : furM, p.x, p.y, p.z));
      }
      break;
    }
    case 'beaver': {
      // 납작한 노 꼬리(격자 무늬 느낌은 색으로만)
      const pd = mesh(ellipsoid(0.1, 0.025, 0.16, 28, 14), skinMat(markC), 0, -0.17, -0.12);
      pd.rotation.x = 0.25;
      tail.add(pd);
      break;
    }
    case 'duck': case 'pelican': case 'owl': {
      // 짧은 꽁지깃 세 갈래
      for (const dx of [-0.05, 0, 0.05]) {
        const f = mesh(ellipsoid(0.035, 0.02, 0.09, 16, 10), K === 'owl' ? markM : furM, dx, -0.02 + (dx ? -0.01 : 0.01), -0.06);
        f.rotation.set(-0.5, dx * 4, 0);
        tail.add(f);
      }
      break;
    }
    case 'turtle':
      tail.add(mesh(pointyEar(0.035, 0.08, 0.035).rotateX(-Math.PI / 2 - 0.4), furM, 0, -0.1, 0.0));
      break;
    case 'frog': case 'koala': break;
    case 'panda':
      tail.add(mesh(ellipsoid(0.05, 0.05, 0.045), markM));
      break;
    case 'sheep': case 'alpaca': {
      const p = mesh(puff(), furM, 0, 0.02, 0);
      p.scale.setScalar(0.07);
      tail.add(p);
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
      tail.add(mesh(ellipsoid(0.045, 0.045, 0.04), furM));
  }

  // ── 팔(새는 날개) ──
  const arms: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(m * 0.135 * chub, 0.44 - HIP, 0);
    arm.rotation.z = m * 0.38;
    if (penguin) {
      const fl = mesh(ellipsoid(0.045, 0.15, 0.085), furM, 0, -0.1, 0);
      arm.add(fl);
    } else if (bird) {
      // 둥근 날개 + 끝 깃털 한 겹
      if (shirtM) arm.add(mesh(lathe([[0, 0.03], [0.055, 0.028], [0.07, 0.0], [0.072, -0.05], [0.068, -0.085], [0.05, -0.08]], 40, 24), sleeveM ?? shirtM));
      arm.add(mesh(ellipsoid(0.05, 0.15, 0.09, 28, 18), furM, 0, -0.09, -0.005));
      arm.add(mesh(ellipsoid(0.04, 0.07, 0.075, 20, 14), K === 'owl' ? markM : lightM, 0, -0.2, -0.01));
    } else {
      if (shirtM) arm.add(mesh(lathe([[0, 0.03], [0.055, 0.028], [0.07, 0.0], [0.072, -0.05], [0.068, -0.085], [0.05, -0.08]], 40, 24), sleeveM ?? shirtM));
      arm.add(mesh(capsule(0.05, 0.16), limbM, 0, -0.1, 0));
      arm.add(mesh(ellipsoid(0.058, 0.06, 0.055), limbM, 0, -0.18, 0.004));
    }
    body.add(arm);
    arms.push(arm);
  }

  // ── 머리 ──
  const RX = K === 'rabbit' ? 0.34 : K === 'penguin' ? 0.35 : K === 'frog' ? 0.4 : K === 'hamster' ? 0.37 : K === 'turtle' || K === 'pelican' ? 0.32 : K === 'duck' ? 0.34 : 0.36;
  const RY = K === 'rabbit' ? 0.32 : K === 'camel' ? 0.3 : K === 'frog' ? 0.28 : K === 'turtle' || K === 'pelican' ? 0.3 : K === 'owl' ? 0.33 : 0.315;
  const RZ = K === 'frog' ? 0.31 : 0.33;
  const head = new THREE.Group();
  head.position.set(0, 0.53 + RY * 0.9 - HIP, 0);
  body.add(head);
  const hasMuzzle = K === 'bear' || K === 'polar' || K === 'dog' || K === 'otter' || K === 'camel' || K === 'beaver' || K === 'alpaca';
  const smallMuzzle = K === 'cat' || K === 'rabbit' || K === 'fox' || K === 'squirrel' || K === 'sheep' || K === 'raccoon' || K === 'panda' || K === 'hamster' || K === 'hedgehog';
  const lightCss = spec.light;
  // art 눈 자리(머리 좌표) — 그림 무늬가 눈을 둘러싸게 같은 값을 쓴다
  const EYE = { size: K === 'frog' ? 0.11 : 0.125, y: hasMuzzle ? 0.055 : K === 'frog' ? 0.21 : 0.035, gap: K === 'frog' ? 0.34 : K === 'owl' ? 0.2 : 0.18 };
  // 머리 좌표(m) → 얼굴 캔버스(정면 투영)
  const cvx = (n: number, x: number) => (0.5 + x / (2 * RX)) * n, cvy = (n: number, y: number) => (0.5 - y / (2 * RY)) * n;
  const smile = (g: CanvasRenderingContext2D, n: number, y: number, w: number) => {
    // ◡ 작은 웃는 입(먹색 얇은 선)
    g.strokeStyle = '#3d3a4a'; g.lineCap = 'round'; g.lineWidth = n * 0.014;
    g.beginPath(); g.moveTo(cvx(n, -w), cvy(n, y)); g.quadraticCurveTo(cvx(n, 0), cvy(n, y - w * 0.9), cvx(n, w), cvy(n, y)); g.stroke();
  };
  const newPaint = (g: CanvasRenderingContext2D, n: number) => {
    const ex = EYE.gap / 2;
    switch (K) {
      case 'panda':
        // 눈가 얼룩(바깥 아래로 처진 콩 모양)
        g.fillStyle = markC;
        for (const m of [-1, 1]) {
          g.save(); g.translate(cvx(n, m * ex), cvy(n, EYE.y - 0.01)); g.rotate(m * -0.5);
          g.beginPath(); g.ellipse(0, 0, n * 0.085, n * 0.11, 0, 0, Math.PI * 2); g.fill(); g.restore();
        }
        break;
      case 'raccoon':
        // 가면 띠 + 흰 눈썹
        g.fillStyle = markC;
        g.beginPath(); g.ellipse(cvx(n, 0), cvy(n, EYE.y), n * 0.27, n * 0.075, 0, 0, Math.PI * 2); g.fill();
        for (const m of [-1, 1]) { g.beginPath(); g.ellipse(cvx(n, m * ex * 1.05), cvy(n, EYE.y - 0.01), n * 0.085, n * 0.095, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = lightCss;
        for (const m of [-1, 1]) { g.beginPath(); g.ellipse(cvx(n, m * ex * 1.1), cvy(n, EYE.y + 0.09), n * 0.07, n * 0.028, m * 0.2, 0, Math.PI * 2); g.fill(); }
        break;
      case 'owl':
        // 얼굴판: 두 개의 밝은 원(하트 모양으로 이어짐)
        g.fillStyle = lightCss;
        for (const m of [-1, 1]) { g.beginPath(); g.arc(cvx(n, m * ex), cvy(n, EYE.y), n * 0.16, 0, Math.PI * 2); g.fill(); }
        break;
      case 'frog':
        g.fillStyle = lightCss;
        g.beginPath(); g.ellipse(n * 0.5, n * 0.88, n * 0.42, n * 0.3, 0, 0, Math.PI * 2); g.fill();
        smile(g, n, -0.05, 0.14);
        break;
      case 'turtle':
        g.fillStyle = lightCss;
        g.beginPath(); g.ellipse(n * 0.5, n * 0.9, n * 0.36, n * 0.25, 0, 0, Math.PI * 2); g.fill();
        smile(g, n, -0.09, 0.07);
        break;
      case 'koala': case 'hamster': case 'hedgehog': case 'beaver':
        g.fillStyle = lightCss;
        g.beginPath(); g.ellipse(n * 0.5, n * 0.88, n * 0.38, n * 0.28, 0, 0, Math.PI * 2); g.fill();
        if (K === 'hedgehog') { g.beginPath(); g.ellipse(n * 0.5, n * 0.62, n * 0.33, n * 0.32, 0, 0, Math.PI * 2); g.fill(); }
        if (K === 'koala') smile(g, n, -0.16, 0.05);
        break;
      default: break;
    }
  };
  const paint = artFace ? newPaint : penguin
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
  const face = faceHead(RX, RY, RZ, faceSkin, artFace ? {
    skin: faceSkin, eyes: false, eyeX: 0, eyeY: 0, eyeW: 0, eyeH: 0, iris: '#3d3a4a', mouth: 'none', paint,
  } : {
    skin: spec.fur,
    eyeX: penguin ? 0.36 : 0.4, eyeY: penguin ? 0.02 : 0.08, eyeW: 0.1, eyeH: 0.135,
    iris: spec.iris ?? '#6b4a3a',
    lashes: spec.lashes,
    blush: { x: 0.62, y: -0.16, w: 0.14, h: 0.085, color: spec.blush ?? '#ff8f86' },
    mouth: 'none',
    paint,
  }, K === 'hamster' ? 0.12 : 0.07);
  head.add(face.group);

  // 주둥이·코·부리
  if (hasMuzzle || smallMuzzle) {
    const s = smallMuzzle ? 0.62 : K === 'camel' ? 1.15 : K === 'alpaca' ? 0.9 : 1;
    const MZ = { x: 0.15 * s, y: 0.105 * s, z: (smallMuzzle ? 0.075 : 0.1) * (K === 'camel' ? 2.0 : K === 'alpaca' ? 1.6 : 1) };
    const front = halfEllipsoid(MZ.x, MZ.y, MZ.z, true, 48, 32);
    planarUV(front, MZ.x, MZ.y);
    const mcol = K === 'panda' || K === 'hedgehog' ? lightCss : spec.light;
    const mz = new THREE.Group();
    mz.position.set(0, smallMuzzle ? -0.1 : -0.11, RZ * (smallMuzzle ? 0.86 : 0.8));
    mz.add(mesh(front, skinMat(mcol, muzzleTexture(mcol, '#5a3a2e'))));
    mz.add(mesh(halfEllipsoid(MZ.x, MZ.y, MZ.z, false, 48, 32), skinMat(mcol)));
    const noseCol = K === 'cat' || K === 'rabbit' || K === 'sheep' || K === 'hamster' ? '#ff8fa0' : '#4a3028';
    const ns = smallMuzzle ? 0.7 : 1;
    mz.add(mesh(ellipsoid(0.05 * ns, 0.034 * ns, 0.034 * ns), glossMat(noseCol, 0.3), 0, 0.045 * s, MZ.z * 0.86));
    if (K === 'beaver') {
      // 앞니 두 개(흰 둥근 네모)
      for (const m of [-1, 1]) mz.add(mesh(ellipsoid(0.024, 0.04, 0.014, 14, 10), glossMat('#fffaf2', 0.3), m * 0.026, -MZ.y * 0.85, MZ.z * 0.62));
    }
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
  } else if (K === 'duck') {
    // 납작 넓은 주황 부리(위·아래 두 겹)
    const bm = glossMat(markC, 0.35);
    head.add(mesh(ellipsoid(0.12, 0.035, 0.1, 32, 16), bm, 0, -0.07, RZ * 0.9));
    head.add(mesh(ellipsoid(0.1, 0.025, 0.085, 28, 14), glossMat(darken(markC, 0.12), 0.4), 0, -0.1, RZ * 0.88));
  } else if (K === 'pelican') {
    // 긴 부리 + 아래 주머니(통통)
    const bm = glossMat(markC, 0.35);
    const top = mesh(ellipsoid(0.06, 0.03, 0.19, 28, 14), bm, 0, -0.06, RZ * 0.95 + 0.09);
    top.rotation.x = 0.12;
    head.add(top);
    head.add(mesh(ellipsoid(0.03, 0.025, 0.03), glossMat(darken(markC, 0.2), 0.35), 0, -0.045, RZ * 0.95 + 0.27));
    const pouch = mesh(ellipsoid(0.065, 0.07, 0.15, 28, 16), skinMat('#ffc08a'), 0, -0.12, RZ * 0.9 + 0.06);
    pouch.rotation.x = 0.2;
    head.add(pouch);
  } else if (K === 'owl') {
    // 작은 갈고리 부리(둥근 끝)
    const bk = mesh(pointyEar(0.035, 0.08, 0.03), glossMat('#ffc94a', 0.35), 0, -0.02, RZ * 0.95);
    bk.rotation.x = Math.PI;
    head.add(bk);
  } else if (K === 'koala') {
    // 큰 동그란 검은 코
    head.add(mesh(ellipsoid(0.07, 0.09, 0.05, 28, 18), glossMat('#4a3d4e', 0.3), 0, -0.07, RZ * 0.93));
  }
  if (K === 'hamster') {
    // 볼주머니 빵빵
    for (const m of [-1, 1]) head.add(mesh(ellipsoid(0.12, 0.1, 0.1, 28, 18), lightM, m * RX * 0.62, -RY * 0.42, RZ * 0.35));
  }
  if (K === 'frog') {
    // 머리 위 눈 둔덕(그 위에 art 눈)
    for (const m of [-1, 1]) head.add(mesh(ellipsoid(0.1, 0.09, 0.09, 28, 18), furM, m * EYE.gap / 2, RY * 0.78, RZ * 0.38));
  }
  if (K === 'sheep' || K === 'alpaca') {
    // 정수리 털뭉치
    const wool = skinMat(spec.fur);
    const n = K === 'alpaca' ? 9 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = mesh(puff(), wool, Math.sin(a) * RX * 0.38, RY * 0.9 + 0.03 * Math.cos(a * 2), Math.cos(a) * RZ * 0.38 + 0.02);
      p.scale.setScalar(K === 'alpaca' ? 0.1 : 0.085);
      head.add(p);
    }
    const c = mesh(puff(), wool, 0, RY * 1.02, 0.02);
    c.scale.setScalar(K === 'alpaca' ? 0.12 : 0.095);
    head.add(c);
  }
  if (K === 'hedgehog') {
    // 머리 뒤 가시
    for (let i = 0; i < 22; i++) {
      const a = Math.PI * 0.55 + ((i % 11) / 10) * Math.PI * 0.9, el = i < 11 ? 0.15 : 0.6;
      const n = new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)).normalize();
      const sp = mesh(spine(), markM, n.x * RX * 0.92, n.y * RY * 0.92, n.z * RZ * 0.92);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      sp.scale.setScalar(1.3);
      head.add(sp);
    }
  }

  // 귀
  const earAt = (az: number, el: number) => new THREE.Vector3(Math.sin(az) * Math.cos(el) * RX * 0.95, Math.sin(el) * RY * 0.95, Math.cos(az) * Math.cos(el) * RZ * 0.95);
  for (const m of [-1, 1]) {
    const ear = new THREE.Group();
    switch (K) {
      case 'bear': case 'polar': case 'otter': case 'beaver': case 'panda': case 'hamster': case 'hedgehog': {
        const sc = K === 'otter' ? 0.6 : K === 'beaver' || K === 'hedgehog' ? 0.55 : K === 'hamster' ? 0.7 : 1;
        ear.position.copy(earAt(m * 0.72, 0.8)).add(new THREE.Vector3(0, 0, 0.03));
        ear.rotation.set(-0.1, m * 0.4, -m * 0.45);
        ear.add(mesh(ellipsoid(0.1 * sc, 0.095 * sc, 0.055 * sc), K === 'panda' ? markM : furM));
        ear.add(mesh(ellipsoid(0.062 * sc, 0.058 * sc, 0.03 * sc), K === 'panda' ? markM : earInM, 0, -0.005, 0.03 * sc));
        break;
      }
      case 'koala': {
        // 크고 복슬한 귀(안쪽 흰 털)
        ear.position.copy(earAt(m * 1.0, 0.55));
        ear.rotation.set(0, m * 0.9, -m * 0.25);
        ear.add(mesh(ellipsoid(0.16, 0.15, 0.06, 30, 20), furM));
        ear.add(mesh(ellipsoid(0.11, 0.1, 0.04, 24, 16), lightM, 0, 0, 0.03));
        break;
      }
      case 'cat': case 'fox': case 'squirrel': case 'raccoon': {
        const big = (K === 'fox' ? 1.35 : K === 'raccoon' ? 0.85 : 1) * (spec.earScale ?? 1);
        ear.position.copy(earAt(m * 0.62, 0.78));
        ear.rotation.set(-0.12, 0, -m * 0.38);
        ear.add(mesh(pointyEar(0.095 * big, 0.2 * big, 0.05), furM));
        ear.add(mesh(pointyEar(0.06 * big, 0.14 * big, 0.02), K === 'raccoon' ? markM : earInM, 0, 0.02, 0.025));
        if (K === 'squirrel') ear.add(mesh(ellipsoid(0.03, 0.06, 0.03), furM, 0, 0.2, 0));
        if (K === 'fox') ear.add(mesh(pointyEar(0.05, 0.08, 0.035), skinMat('#5a3a2e'), 0, 0.2, 0.0));
        break;
      }
      case 'owl': {
        // 귀깃(뿔처럼 서는 깃털 다발)
        ear.position.copy(earAt(m * 0.55, 0.95));
        ear.rotation.set(-0.15, 0, -m * 0.45);
        ear.add(mesh(pointyEar(0.06, 0.15, 0.04), markM));
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
      case 'alpaca': {
        // 쫑긋 선 바나나 귀
        ear.position.copy(earAt(m * 0.75, 0.75));
        ear.rotation.set(-0.1, 0, -m * 0.3);
        ear.add(mesh(ellipsoid(0.05, 0.13, 0.04, 24, 16), furM, 0, 0.1, 0));
        ear.add(mesh(ellipsoid(0.03, 0.09, 0.02, 18, 12), earInM, 0, 0.1, 0.025));
        break;
      }
      case 'sheep': {
        // 옆으로 늘어진 귀
        ear.position.copy(earAt(m * 1.2, 0.35));
        ear.rotation.set(0, 0, m * 1.25);
        ear.add(mesh(ellipsoid(0.06, 0.12, 0.04, 24, 16), lightM, 0, -0.08, 0));
        ear.add(mesh(ellipsoid(0.035, 0.08, 0.02, 18, 12), earInM, 0, -0.08, 0.025));
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
      case 'duck': case 'pelican':
        // 정수리 깃털 한 가닥(오리는 말린 털)
        if (m === 1) {
          const tuft = mesh(taperTube([new THREE.Vector3(0, RY * 0.95, 0), new THREE.Vector3(0.02, RY * 1.12, 0.02), new THREE.Vector3(0.06, RY * 1.2, 0.06), new THREE.Vector3(0.08, RY * 1.14, 0.09)], 0.025, 16, 10), furM);
          ear.add(tuft);
        }
        break;
      default: break;
    }
    head.add(ear);
  }

  // ── 소품 ──
  const accC = spec.accColor ?? '#ff8fb1';
  const accM = clothMat(accC);
  const top = 0.53 + RY * 1.9
    + (K === 'rabbit' ? 0.32 : K === 'fox' || K === 'cat' || K === 'squirrel' ? 0.1 : K === 'alpaca' ? 0.14 : K === 'owl' ? 0.1 : K === 'sheep' || K === 'koala' || K === 'duck' || K === 'pelican' ? 0.06 : 0)
    + (spec.acc === 'helmet' ? 0.12 : spec.acc === 'captain' ? 0.08 : 0);
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
    case 'captain': {
      // 선장 모자: 흰 둥근 윗면 + 남색 띠 + 짧은 챙 + 금 닻 배지
      const hat = new THREE.Group();
      hat.position.set(0, RY * 0.78, -0.02);
      hat.rotation.x = -0.18;
      const white = clothMat('#fffaf2');
      const crown = mesh(lathe([[0.0001, 0.13], [0.16, 0.125], [0.235, 0.1], [0.24, 0.07], [0.19, 0.04], [0.18, 0.0]], 48, 12), white);
      hat.add(crown);
      hat.add(mesh(new THREE.CylinderGeometry(0.185, 0.18, 0.06, 40, 1, true), clothMat(accC), 0, 0.03, 0));
      const visor = mesh(ellipsoid(0.15, 0.015, 0.09, 32, 10), glossMat(darken(accC, 0.25), 0.3), 0, 0.005, 0.16);
      visor.rotation.x = 0.25;
      hat.add(visor);
      hat.add(mesh(ellipsoid(0.03, 0.03, 0.012, 16, 10), glossMat('#ffcf4a', 0.3), 0, 0.075, 0.2));
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
  if (spec.acc2 === 'scarf' && spec.acc !== 'scarf') {
    // 두 번째 소품 목도리(펭박사 같은 과학자 목도리)
    const sc = mesh(new THREE.TorusGeometry(0.11, 0.045, 18, 40), clothMat(spec.outfitColor ?? '#ff8f6e'), 0, 0.53 - HIP, 0.0);
    sc.rotation.x = Math.PI / 2;
    sc.scale.set(1.15, 1, 1);
    body.add(sc);
  }

  // ── 새 종 얼굴: art.ts 공용 눈 + 볼터치(머리 곡면 위에 정확히) ──
  let eyes: EyeSet | null = null;
  if (artFace) {
    eyes = addEyes(head, { size: EYE.size, y: EYE.y, gap: EYE.gap, blush: false, name: `eye-${K}` });
    for (const [m, e] of [[-1, eyes.left], [1, eyes.right]] as const) {
      let x = m * EYE.gap / 2, y = EYE.y, rx = RX, ry = RY, rz = RZ, cx = 0, cy = 0, cz = 0;
      if (K === 'frog') {
        // 개구리는 정수리 둔덕 앞면에
        rx = 0.1; ry = 0.09; rz = 0.09; cx = x; cy = RY * 0.78; cz = RZ * 0.38; x = 0; y = 0.0;
      }
      const s = onHead(rx, ry, rz, x, y, 0.006);
      e.position.set(s.pos.x + cx, s.pos.y + cy, s.pos.z + cz);
      e.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.n);
    }
    addBlush(head, EYE.size);
    if (K === 'frog') {
      // 개구리 볼은 둔덕 아래 얼굴로
      for (const [i, b] of eyes.blush.entries()) {
        const m = i === 0 ? -1 : 1;
        const s = onHead(RX, RY, RZ, m * RX * 0.6, -0.02, 0.006);
        b.position.copy(s.pos);
        b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.n);
      }
    }
  }

  if (spec.acc === 'glasses' || spec.acc2 === 'glasses') {
    // 동그란 안경(눈 위치 앞)
    const fm = glossMat(spec.acc === 'glasses' ? accC : '#6a4a3a', 0.3);
    const gx = artFace ? EYE.gap / 2 : 0.12, gy = artFace ? EYE.y : 0.035;
    const gz = artFace ? onHead(RX, RY, RZ, gx, gy).pos.z + 0.035 : RZ * 0.97;
    for (const m of [-1, 1]) {
      const ring = mesh(new THREE.TorusGeometry(artFace ? EYE.size * 0.62 : 0.07, 0.011, 12, 40), fm, m * gx, gy, gz);
      ring.rotation.y = m * 0.25;
      head.add(ring);
    }
    const br = mesh(capsule(0.009, Math.max(0.02, gx * 2 - (artFace ? EYE.size * 1.2 : 0.17))), fm, 0, gy + 0.015, gz + 0.02);
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

  // 정지 부품은 재질별로 합친다(art 눈·볼은 재질을 바꿔 끼우니 빼 둔다)
  const keep = eyes ? [eyes.left, eyes.right, ...eyes.blush] : [];
  for (const k of keep) head.remove(k);
  for (const g of [bp, tail, head, ...arms, ...legs]) mergeByMaterial(g);
  for (const k of keep) head.add(k);
  // 카메라가 파고들면 디더로 비치게(alphaHash: 정렬 없이 점점이 빠진다)
  const fadeMats = new Set<THREE.Material>();
  root.traverse((o) => {
    const mm = (o as THREE.Mesh).material;
    if (!mm || keep.includes(o as THREE.Mesh)) return;
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
  let phase = 0, wave = 0, clap = 0;
  let happyOn = false;
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
      clap = snap ? (p.clap ? 1 : 0) : lerp(clap, p.clap ? 1 : 0, 1 - Math.exp(-dt * 8));
      const amp = walking ? 1 : 0;
      // 박수: 톡톡 뛰며 두 손을 앞에서 짝짝
      const hop = clap * Math.abs(Math.sin(t * 7)) * 0.035;
      cur.bob = lerp(cur.bob, walking ? 0.03 * Math.abs(sw) : p.talk ? 0.02 * Math.abs(Math.sin(t * 6)) : 0, k);
      cur.lean = lerp(cur.lean, walking ? 0.08 : 0, k);
      rig.position.y = cur.bob + hop;
      rig.rotation.x = cur.lean;
      rig.rotation.z = walking ? 0.05 * sw : 0;
      body.scale.set(1 + 0.01 * breath, 1 + 0.016 * breath, 1 + 0.01 * breath);
      head.position.y = headBaseY + 0.009 * breath;
      legs[0].rotation.x = 0.55 * sw * amp;
      legs[1].rotation.x = -0.55 * sw * amp;
      // 팔: 걷기 흔들기 / 대화 몸짓 / 손 흔들기(-x 팔) / 박수(두 팔 앞에서 모았다 폈다)
      const talkG = p.talk ? Math.sin(t * 5) : 0;
      const clapZ = 0.12 + 0.32 * Math.abs(Math.sin(t * 13));
      const a1x = 0.6 * sw * amp - 0.35 * Math.max(0, talkG), a1z = 0.38 + 0.02 * breath + 0.25 * Math.max(0, talkG);
      arms[1].rotation.set(lerp(a1x, -1.15, clap), 0, lerp(a1z, clapZ, clap));
      const waveZ = -(2.5 + 0.32 * Math.sin(t * 7.0));
      const restZ = -(0.38 + 0.02 * breath) - (p.talk ? 0.3 * Math.max(0, -talkG) : 0);
      const a0x = lerp(-0.6 * sw * amp, -0.3, wave), a0z = lerp(restZ, waveZ, wave);
      arms[0].rotation.set(lerp(a0x, -1.15, clap), 0, lerp(a0z, -clapZ, clap));
      head.rotation.z = p.talk ? 0.09 * Math.sin(t * 3.1) : -0.05 * wave + 0.04 * Math.sin(t * 0.9 + S);
      head.rotation.x = walking ? -0.06 : p.talk ? 0.04 * Math.sin(t * 4.2) : -0.1 * clap;
      tail.rotation.y = 0.25 * Math.sin(t * (K === 'dog' ? 9 : 2.2)) * (1 + clap);
      const blink = (t + blinkPh) % blinkP < 0.12;
      const happy = !!p.clap;
      if (eyes) {
        // art 눈: '> <' 는 박수 때만, 깜빡임·웃는 눈은 세로로 납작하게
        if (happy !== happyOn) { happyOn = happy; eyes.setHappy(happy); }
        const sy = happy ? 1 : blink ? 0.12 : p.happy ? 0.55 : 1;
        eyes.left.scale.y = eyes.right.scale.y = EYE.size * sy;
      } else {
        if (happy !== happyOn) { happyOn = happy; face.setMode(happy ? 'happy' : 'open'); }
        if (!happy) face.setBlink(p.happy || blink);
      }
    },
    setFade(o) {
      if (Math.abs(o - fadeCur) < 0.01) return;
      fadeCur = o;
      for (const m of fadeMats) m.opacity = o;
    },
  };
}
