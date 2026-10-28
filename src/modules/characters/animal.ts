// 동물 주민 빌더: 종(곰·고양이·토끼·펭귄·북극곰·다람쥐·수달·낙타·여우·강아지 +
// 오리·거북·비버·펠리컨·양·너구리·부엉이·판다·개구리·코알라·햄스터·알파카·고슴도치)별 실루엣(귀·꼬리·주둥이·부리·볼 털·목) +
// 빚은 머리(볼·턱·이마·뒤통수) + 머리 무늬(앞·뒤 — 판다 눈가 · 너구리 가면 · 고양이 줄무늬 …) +
// 말랑(플레이어)과 같은 그림체 눈(흰자·눈동자·반사광·윗속눈썹·볼터치)과 입 모양(ω · 벌린 입 · 'o' · 물결) +
// 옷 디테일(칼라·밑단·멜빵·뒤 리본·후드·주머니) + 벙어리 손(엄지) + 발바닥 젤리 + 시설 NPC 시그니처 소품.
// 움직임: 걷기·손 흔들기·박수·대화 몸짓 + 숨쉬기 + 착지 찌부·점프 쭉(스쿼시&스트레치) + 귀·꼬리 늦게 따라 출렁 +
// 가까운 플레이어 쳐다보기(look) + 말할 때 입 뻐끔. 먼 거리(≥ 25 m)는 낮은 세밀도로 다시 만들어 굳힌 LOD(≤ 6 드로콜).
// 부수효과 없는 빌더(다른 모듈이 import 해도 된다). 노드(DOM 없음)에서도 만들어진다(그림은 1px 대역).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ellipsoid, lathe, capsule, taperTube, withDetail, seg } from './geo';
import { mesh, mergeByMaterial } from './kit';
import { skinMat as skinRaw, clothMat as clothRaw, glossMat as glossRaw } from './animal/mats';
import { headGeo, headAt, headPoint, headTexture, ell, below, smoothSeams, furLocksInto, type HeadShape, type HeadPaint } from './animal/head';
import { eyeTexture, mouthTexture, cutPatch, decalMat, paintTex, EYE_BOX, type EyeMode, type MouthMode, type EyeStyle } from './animal/face';
import { bakeLod, mergePalette } from './animal/lod';
import { paletteMat } from './animal/mats';
import { signatureOf, addProp } from './animal/props';

export type AnimalKind = 'bear' | 'cat' | 'rabbit' | 'penguin' | 'polar' | 'squirrel' | 'otter' | 'camel' | 'fox' | 'dog'
  | 'duck' | 'turtle' | 'beaver' | 'pelican' | 'sheep' | 'raccoon' | 'owl' | 'panda' | 'frog' | 'koala' | 'hamster' | 'alpaca' | 'hedgehog';
/** 나중에 들어온 종(예전엔 art.ts 얼굴 — 지금은 모두 같은 얼굴 체계) */
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
  /** 시설 NPC id(이 NPC 의 시그니처 소품을 단다 — 만드는 쪽이 적는다. 일반 주민은 비운다) */
  npc?: string;
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
  /** 이 점(월드)을 쳐다본다 — 가까운 플레이어 · 말 상대 */
  look?: THREE.Vector3 | null;
}

/** 표정(스튜디오 · 연출) */
export type AnimalExpr = 'neutral' | 'blink' | 'smile' | 'happy' | 'surprised' | 'sad';

export interface AnimalRig {
  root: THREE.Group;
  /** 머리 꼭대기 높이(말풍선 자리, 스케일 반영된 m) */
  top: number;
  update: (t: number, dt: number, p: AnimalPose) => void;
  /** 카메라 근접 페이드(1 = 불투명) */
  setFade: (o: number) => void;
  /** 표정 고정(null = 평소 자동) */
  setExpression?: (e: AnimalExpr | null) => void;
  /** 먼 LOD 전환(미리 안 만들었으면 처음 'far' 때 만든다) */
  setLod?: (l: 'near' | 'far') => void;
  /** 먼 LOD 를 미리 만들어 둔다(한가한 프레임에 하나씩 — 25 m 를 여럿이 한꺼번에 넘을 때 끊김 방지). 이번에 만들었으면 true */
  prepareLod?: () => boolean;
  /** 얼굴 기준(클로즈업) */
  head?: THREE.Object3D;
}

// ───────────── 색 도우미 ─────────────
function lighten(c: string, k: number): string {
  return '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
}
function darken(c: string, k: number): string {
  return '#' + new THREE.Color(c).lerp(new THREE.Color('#3a2a3a'), k).getHexString();
}
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
/** smoothstep(x, e0, e1) — e0 > e1 이면 내려가는 쪽(THREE 것은 거꾸로 된 경계를 계단으로 만든다) */
const ss = (x: number, e0: number, e1: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** 옷 무늬: 회전체 UV(u=0.5 정면, 캔버스 위 = 옷 위) */
function outfitTexture(o: Outfit, a: string): THREE.Texture {
  const hi = lighten(a, 0.72), lo = darken(a, 0.18);
  const t = paintTex(512, 512, (g) => {
    const n = 512;
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
      // 앞판 가운데 바느질 선(점선) + 옆 솔기
      g.strokeStyle = lo; g.lineWidth = n * 0.006; g.setLineDash([n * 0.012, n * 0.01]);
      for (const x of [0.25, 0.75]) { g.beginPath(); g.moveTo(x * n, 0); g.lineTo(x * n, n); g.stroke(); }
      g.setLineDash([]);
    } else if (o === 'overalls') {
      // 흰 티 위 멜빵 바지(앞 가슴판 — 끈·단추는 입체로 따로)
      g.fillStyle = '#fffaf2'; g.fillRect(0, 0, n, n);
      g.fillStyle = a; g.fillRect(0, n * 0.55, n, n * 0.45);
      rr(n * 0.42, n * 0.3, n * 0.16, n * 0.4, n * 0.025); g.fill();
      g.strokeStyle = lo; g.lineWidth = n * 0.006; g.setLineDash([n * 0.012, n * 0.01]);
      rr(n * 0.43, n * 0.315, n * 0.14, n * 0.37, n * 0.02); g.stroke();
      g.beginPath(); g.moveTo(0, n * 0.57); g.lineTo(n, n * 0.57); g.stroke();
      g.setLineDash([]);
      g.strokeStyle = lo; rr(n * 0.475, n * 0.42, n * 0.05, n * 0.1, n * 0.01); g.stroke();
    } else if (o === 'dress') {
      g.fillStyle = a; g.fillRect(0, 0, n, n);
      g.fillStyle = hi;
      for (let y = 0; y < 7; y++) for (let x = 0; x < 14; x++) {
        g.beginPath(); g.arc((x + (y % 2) * 0.5) * n / 14, (y + 0.6) * n / 7, n * 0.012, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = lo; g.fillRect(0, n * 0.5, n, n * 0.03);
    } else {
      // 후드티: 밑단 시보리
      g.fillStyle = a; g.fillRect(0, 0, n, n);
      g.fillStyle = lo;
      for (let i = 0; i < 64; i++) g.fillRect(i * n / 64, n * 0.88, n / 160, n * 0.12);
    }
  });
  t.userData.shared = false;
  return t;
}

/** 옛 shirt 무늬(줄·점) */
function shirtTexture(a: string, b: string, pattern: 'stripe' | 'dots'): THREE.Texture {
  const t = paintTex(256, 256, (g) => {
    const n = 256;
    g.fillStyle = a; g.fillRect(0, 0, n, n);
    g.fillStyle = b;
    if (pattern === 'stripe') for (let i = 0; i < 7; i++) g.fillRect(0, (i + 0.5) * n / 7, n, n / 16);
    else for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      g.beginPath(); g.arc((x + (y % 2) * 0.5) * n / 6, (y + 0.5) * n / 6, n * 0.03, 0, Math.PI * 2); g.fill();
    }
  });
  t.userData.shared = false;
  return t;
}

/** 둥근 끝 뿔 모양(고양이·여우 귀) — 아래 원점, +y 로 h */
function pointyEar(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = lathe([[0.0001, 0], [w * 0.95, 0.05 * h], [w, 0.25 * h], [w * 0.62, 0.65 * h], [w * 0.2, 0.93 * h], [0.0001, h]], 28, 20);
  g.scale(1, 1, d / w);
  return g;
}

/** 거꾸로 둥근 세모 코(위가 넓다) */
function noseGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg(28, 8), seg(18, 6));
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.28 * y - 0.12 * Math.max(0, -y);
    p.setXYZ(i, x * w * k, y * h + 0.25 * h * (1 - x * x) * Math.max(0, -y) * 0, z * d * (1 - 0.15 * Math.max(0, y)));
  }
  smoothSeams(g);
  return g;
}

/** 주둥이: 아래 볼이 두 덩이로 통통한 콩 모양 */
function muzzleGeo(x: number, y: number, z: number, lobe = 0.14): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg(48, 10), seg(32, 8));
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    const l = 1 + lobe * Math.exp(-(((Math.abs(px) - 0.5) / 0.32) ** 2)) * ss(-py, -0.3, 0.6) * Math.max(0, pz + 0.3);
    const flatTop = 1 - 0.08 * ss(py, 0.4, 1);
    p.setXYZ(i, px * x * l, py * y * flatTop, pz * z * (1 + (l - 1) * 0.6));
  }
  smoothSeams(g);
  return g;
}

/** 머리 겉면에서 정규화 앞 좌표(X=x/rx, Y=y/ry)인 점과 법선 — 안경·볼 소품 자리 */
function surfAt(s: HeadShape, X: number, Y: number, lift = 0): { pos: THREE.Vector3; n: THREE.Vector3 } {
  const d = new THREE.Vector3(X, Y, Math.sqrt(Math.max(0.02, 1 - X * X - Y * Y)));
  const p = new THREE.Vector3();
  for (let i = 0; i < 4; i++) {
    headPoint(s, d.x, d.y, d.z, p);
    if (Math.abs(p.x) > 1e-5) d.x *= (X * s.rx) / p.x;
    if (Math.abs(p.y) > 1e-5) d.y *= (Y * s.ry) / p.y;
    d.z = Math.sqrt(Math.max(0.02, 1 - d.x * d.x - d.y * d.y));
  }
  headPoint(s, d.x, d.y, d.z, p);
  const e = 0.01, a = new THREE.Vector3(), b = new THREE.Vector3();
  headPoint(s, d.x + e, d.y, Math.sqrt(Math.max(0.02, 1 - (d.x + e) ** 2 - d.y ** 2)), a).sub(p);
  headPoint(s, d.x, d.y + e, Math.sqrt(Math.max(0.02, 1 - d.x ** 2 - (d.y + e) ** 2)), b).sub(p);
  const n = a.cross(b).normalize();
  if (n.z < 0) n.negate();
  return { pos: p.addScaledVector(n, lift), n };
}

/** 종 무늬 기본색 */
const MARK_DEFAULT: Partial<Record<AnimalKind, string>> = {
  turtle: '#c99a5e', panda: '#4a4458', raccoon: '#6e5a62', hedgehog: '#9a6a4a', beaver: '#7a5038', koala: '#5a5060',
  owl: '#a8784f', duck: '#ffa94d', pelican: '#ffb443', frog: '#7cc96b', sheep: '#5a4a48', alpaca: '#e8cfa8', hamster: '#ffffff',
};

/** 종별 머리 조형 */
const SHAPE: Record<AnimalKind, Partial<HeadShape>> = {
  bear: { cheek: 0.09 }, polar: { rx: 0.35, ry: 0.31, cheek: 0.07, back: 0.09 },
  cat: { rx: 0.37, ry: 0.3, cheek: 0.1, ruff: 0.09, ruffN: 2.5, topFlat: 0.07 },
  rabbit: { rx: 0.335, ry: 0.32, cheek: 0.11 }, penguin: { rx: 0.35, ry: 0.33, cheek: 0.05, jaw: 0.02 },
  squirrel: { rx: 0.34, ry: 0.31, cheek: 0.13, ruff: 0.06, ruffN: 2 }, otter: { rx: 0.385, ry: 0.29, cheek: 0.08, topFlat: 0.09, ruff: 0.04, ruffN: 3 },
  camel: { rx: 0.3, ry: 0.3, rz: 0.31, cheek: 0.03, jaw: 0.08 }, fox: { rx: 0.35, ry: 0.3, cheek: 0.1, ruff: 0.16, ruffN: 2, jaw: 0.1 },
  dog: { rx: 0.36, ry: 0.315, cheek: 0.08 }, duck: { rx: 0.34, ry: 0.315, cheek: 0.06 },
  turtle: { rx: 0.32, ry: 0.3, cheek: 0.06 }, beaver: { rx: 0.36, ry: 0.31, cheek: 0.11 },
  pelican: { rx: 0.32, ry: 0.3, cheek: 0.04 }, sheep: { rx: 0.335, ry: 0.31, cheek: 0.07 },
  raccoon: { rx: 0.37, ry: 0.3, cheek: 0.08, ruff: 0.13, ruffN: 2.5 }, owl: { rx: 0.385, ry: 0.335, flat: 0.13, topFlat: 0.05, cheek: 0.04 },
  panda: { rx: 0.37, ry: 0.32, cheek: 0.1 }, frog: { rx: 0.4, ry: 0.27, rz: 0.31, cheek: 0.05, topFlat: 0.1, jaw: 0.0 },
  koala: { rx: 0.37, ry: 0.32, cheek: 0.08, ruff: 0.05 }, hamster: { rx: 0.37, ry: 0.3, cheek: 0.24, jaw: 0.14, cheekBack: 0.95 },
  alpaca: { rx: 0.3, ry: 0.29, cheek: 0.05 }, hedgehog: { rx: 0.35, ry: 0.3, cheek: 0.1 },
};

/** 눈 자리(머리 정규화 좌표: 중심 x·y, 반폭 w·반높이 h) */
function eyeSpot(K: AnimalKind, muzzle: 'big' | 'small' | 'none'): { x: number; y: number; w: number; h: number } {
  switch (K) {
    case 'owl': return { x: 0.37, y: 0.08, w: 0.17, h: 0.2 };
    case 'penguin': return { x: 0.34, y: 0.06, w: 0.15, h: 0.19 };
    case 'koala': return { x: 0.36, y: 0.14, w: 0.13, h: 0.165 };
    case 'hamster': return { x: 0.36, y: 0.12, w: 0.13, h: 0.165 };
    case 'duck': case 'pelican': return { x: 0.37, y: 0.1, w: 0.15, h: 0.185 };
    case 'turtle': return { x: 0.36, y: 0.12, w: 0.15, h: 0.19 };
    case 'frog': return { x: 0, y: 0.08, w: 0.42, h: 0.5 };
    default: return { x: 0.37, y: muzzle === 'big' ? 0.13 : 0.1, w: 0.145, h: 0.185 };
  }
}

const HATS: ReadonlySet<Accessory> = new Set(['beanie', 'safari', 'captain', 'sunhat', 'fairy', 'helmet']);
/** 정수리 털 한 움큼(가족 표지 — 말랑의 더듬이처럼) */
const TUFT: Partial<Record<AnimalKind, 'curl' | 'spikes' | 'fluff'>> = {
  bear: 'curl', polar: 'curl', dog: 'spikes', hamster: 'fluff', otter: 'curl', panda: 'curl', beaver: 'spikes',
  camel: 'spikes', squirrel: 'fluff', rabbit: 'fluff', penguin: 'curl', raccoon: 'spikes', cat: 'curl', fox: 'spikes',
  duck: 'curl', pelican: 'curl', turtle: 'curl', frog: 'curl',
};

// 공용 지오메트리(여러 주민이 같이 쓴다 — 청크가 버려도 dispose 안 함)
const shared = <T extends THREE.BufferGeometry>(g: T): T => { g.userData.shared = true; return g; };
const spineGeo: Partial<Record<string, THREE.BufferGeometry>> = {};
// 가시: 뿌리는 통통, 끝은 바늘처럼 가늘게(잎사귀·솔방울 비늘로 안 읽히게). 먼 LOD 에선 다섯 모 원뿔(가시 하나 ~10 삼각형)
const spine = () => seg(10) === 10
  ? (spineGeo.near ??= shared(lathe([[0.0001, 0], [0.031, 0.008], [0.026, 0.035], [0.014, 0.075], [0.005, 0.105], [0.0001, 0.122]], 9, 7)))
  : (spineGeo.far ??= shared(new THREE.ConeGeometry(0.03, 0.12, 5, 1, true).translate(0, 0.06, 0)));
const puffGeo: Partial<Record<string, THREE.BufferGeometry>> = {};
/** 양털 뭉치(살짝 울퉁불퉁) */
const puff = () => (puffGeo[seg(18)] ??= shared((() => {
  const g = new THREE.SphereGeometry(1, seg(18, 8), seg(12, 6));
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.08 * Math.sin(x * 9 + y * 4) * Math.sin(z * 8 - y * 5);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  smoothSeams(g);
  return g;
})()));

/** 거북 등딱지 육각 무늬(회전체 UV) */
function shellTexture(base: string, line: string): THREE.Texture {
  return paintTex(256, 256, (g) => {
    const n = 256;
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

/** 종별 머리 무늬(앞 얼굴 + 뒤통수) */
function headPaint(K: AnimalKind, spec: AnimalSpec, E: { x: number; y: number; w: number; h: number }, markC: string): HeadPaint {
  const L = new THREE.Color(spec.light), M = new THREE.Color(markC);
  const D = new THREE.Color(darken(spec.fur, 0.22)), DD = new THREE.Color(darken(spec.fur, 0.4));
  const W = new THREE.Color('#fffaf2'), EI = new THREE.Color(spec.earIn ?? '#ffb3ad');
  const HI = new THREE.Color(lighten(K === 'sheep' ? spec.light : spec.fur, 0.35));
  // 파생 색은 여기서 한 번만 — 칠하기(픽셀마다 13만 번) 안에서 색 객체·문자열 변환을 하면 주민 하나에 0.1~0.4 초가 멈춘다
  const PATCH = new THREE.Color(darken(spec.fur, 0.35)); // 개 눈 얼룩
  const SPOT = new THREE.Color(darken(spec.fur, 0.25)); // 개구리 점
  const STREAK = new THREE.Color(darken(markC, 0.3)); // 고슴도치 가시 줄
  const fl = { groove: 0, crest: 0 };
  const lockN = K === 'hedgehog' ? 9 : 7;
  const furry = !(K === 'frog' || K === 'turtle' || K === 'penguin' || K === 'sheep' || K === 'alpaca' || K === 'duck' || K === 'pelican');
  return (q, mix) => {
    const { X, Y, Z, az, el } = q;
    const front = ss(Z, -0.1, 0.25);
    const backness = ss(-Z, 0.0, 0.7);
    const bk = Math.abs(az) > 0 ? Math.PI - Math.abs(az) : Math.PI; // 0 = 뒤 한가운데
    // 공통: 정수리·뒤로 살짝 진한 털빛 + 가마에서 퍼지는 털 결(뒤통수가 민머리처럼 안 보이게) + 뒷목 밝은 털
    mix(D, 0.18 * ss(el, 0.55, 1.3) * (0.4 + 0.6 * backness));
    if (furry) {
      const f = furLocksInto(q.dx, q.dy, q.dz, lockN, fl);
      mix(DD, (K === 'cat' ? 0.2 : 0.38) * f.groove * (0.3 + 0.7 * backness));
      mix(HI, 0.42 * f.crest * (0.25 + 0.75 * backness) * ss(el, -0.3, 0.4));
      mix(L, 0.35 * backness * ss(el, -0.35, -0.65));
    }
    switch (K) {
      case 'cat': {
        // 이마 줄무늬 셋 + 뒤통수 가로 줄 + 흰 턱
        for (const dx of [-0.16, 0, 0.16]) mix(DD, 0.55 * front * ell(X, Y, dx, 0.62, 0.045, 0.16, dx * 1.5));
        mix(DD, 0.8 * backness * ss(Math.sin(el * 11 + 0.6), 0.45, 0.75) * ss(bk, 1.25, 0.6) * ss(el, -0.25, 0.15));
        mix(W, 0.9 * front * ell(X, Y, 0, -0.72, 0.42, 0.28));
        break;
      }
      case 'dog':
        // 한쪽 눈 얼룩 + 이마 흰 줄 + 뒤통수 얼룩 하나
        mix(PATCH, 0.9 * front * ell(X, Y, -E.x - 0.03, E.y + 0.02, E.w * 2.0, E.h * 1.75, 0.3));
        mix(W, 0.85 * front * ell(X, Y, 0, 0.55, 0.07, 0.3));
        mix(D, 0.6 * backness * ell(Math.sin(az), el, 0.35, 0.3, 0.35, 0.3));
        break;
      case 'fox':
        // 흰 아래 얼굴(볼 털까지)
        mix(L, 0.95 * front * Math.max(ell(X, Y, -0.55, -0.4, 0.55, 0.45, -0.5), ell(X, Y, 0.55, -0.4, 0.55, 0.45, 0.5), ell(X, Y, 0, -0.75, 0.4, 0.4)));
        mix(DD, 0.4 * ss(el, 0.7, 1.2) * backness);
        // 뒤통수 가운데 진한 털 줄기(뒤에서 여우 색 띠)
        mix(DD, 0.45 * ss(bk, 0.45, 0.15) * ss(el, -0.2, 0.3));
        break;
      case 'raccoon':
        // 가면 띠 + 흰 눈썹·주둥이 둘레 + 뒤통수 줄
        mix(M, 0.95 * front * Math.max(ell(X, Y, 0, E.y, 0.62, 0.17), ell(X, Y, -E.x, E.y - 0.02, E.w * 1.9, E.h * 1.6), ell(X, Y, E.x, E.y - 0.02, E.w * 1.9, E.h * 1.6)));
        mix(L, 0.95 * front * Math.max(ell(X, Y, -E.x * 1.05, E.y + 0.32, 0.14, 0.06, 0.25), ell(X, Y, E.x * 1.05, E.y + 0.32, 0.14, 0.06, -0.25), ell(X, Y, 0, -0.45, 0.42, 0.33)));
        mix(M, 0.55 * backness * ss(Math.sin(el * 9 + 1.2), 0.6, 0.85) * ss(el, -0.3, 0.1));
        break;
      case 'panda':
        // 눈가 콩 얼룩(바깥 아래로 처짐)
        for (const m of [-1, 1]) mix(M, front * ell(X, Y, m * (E.x + 0.02), E.y - 0.04, E.w * 1.75, E.h * 1.55, m * -0.55));
        break;
      case 'squirrel':
        mix(L, 0.95 * front * Math.max(ell(X, Y, -0.5, -0.38, 0.4, 0.3, -0.3), ell(X, Y, 0.5, -0.38, 0.4, 0.3, 0.3)));
        mix(DD, 0.55 * ss(bk, 0.3, 0.12) * ss(el, -0.3, 0.2));
        mix(L, 0.8 * front * Math.max(ell(X, Y, -E.x, E.y + 0.27, 0.12, 0.05), ell(X, Y, E.x, E.y + 0.27, 0.12, 0.05)));
        break;
      case 'otter':
        mix(L, 0.95 * front * ell(X, Y, 0, -0.42, 0.85, 0.5));
        mix(L, 0.7 * front * Math.max(ell(X, Y, -E.x, E.y + 0.28, 0.1, 0.05), ell(X, Y, E.x, E.y + 0.28, 0.1, 0.05)));
        break;
      case 'hamster':
        // 흰 주둥이·볼 + 이마에서 뒤로 진한 줄
        mix(L, 0.95 * front * ell(X, Y, 0, -0.42, 0.9, 0.5));
        mix(DD, 0.4 * ss(Math.abs(X), 0.2, 0.08) * ss(Y, 0.35, 0.65) * front);
        mix(DD, 0.35 * ss(bk, 0.4, 0.15) * ss(el, 0.0, 0.5));
        break;
      case 'hedgehog': {
        // 얼굴 동그란 밝은 판 + 그 밖(뒤통수·정수리·옆 뒤)은 전부 가시 색 — 가시 사이로 맨살이 안 비치게
        const face = front * ell(X, Y, 0, -0.1, 0.8, 0.84);
        mix(L, face);
        const cover = Math.max(ss(Z, 0.25, -0.1), ss(el, 0.45, 0.7) * ss(Z, 0.75, 0.45));
        mix(M, cover * ss(el, -1.0, -0.7) * (1 - face));
        mix(STREAK, 0.5 * cover * ss(el, -1.0, -0.7) * (1 - face) * ss(Math.sin(az * 13 + el * 9), 0.3, 0.9));
        break;
      }
      case 'koala':
        mix(L, 0.9 * front * ell(X, Y, 0, -0.78, 0.38, 0.25));
        break;
      case 'frog':
        mix(L, 0.95 * front * below(Y, -0.2, 0.06) * ss(Z, 0.05, 0.4));
        for (const [a, e, r] of [[2.6, 0.4, 0.17], [-2.7, 0.5, 0.13], [3.1, 0.15, 0.12], [2.2, 0.7, 0.1], [-2.3, 0.25, 0.14]] as const) {
          mix(SPOT, 0.8 * ell(az, el, a, e, r, r * 0.9, 0, 0.04));
        }
        break;
      case 'turtle':
        mix(L, 0.95 * front * below(Y, -0.35, 0.08));
        for (const [a, e, r] of [[0.5, 0.75, 0.1], [-0.4, 0.82, 0.09], [2.5, 0.5, 0.12], [-2.6, 0.45, 0.11], [3.1, 0.75, 0.1]] as const) {
          mix(L, 0.45 * ell(az, el, a, e, r, r, 0, 0.04));
        }
        break;
      case 'owl': {
        // 하트 얼굴판 + 눈 사이 V 깃 + 뒤통수 깃털 갈매기 무늬
        mix(L, front * Math.max(ell(X, Y, -E.x, E.y - 0.02, 0.34, 0.37), ell(X, Y, E.x, E.y - 0.02, 0.34, 0.37), ell(X, Y, 0, -0.45, 0.35, 0.3)));
        mix(M, 0.9 * front * ell(X, Y, 0, E.y + 0.12, 0.08, 0.22));
        const ch = Math.sin((el * 7 - Math.abs(Math.sin(az)) * 4) * 1.0);
        mix(M, 0.45 * backness * ss(ch, 0.7, 0.92));
        break;
      }
      case 'penguin': {
        // 하트 모양 흰 얼굴 가면
        const heart = Math.max(ell(X, Y, -0.3, 0.02, 0.42, 0.5, 0.35), ell(X, Y, 0.3, 0.02, 0.42, 0.5, -0.35), ell(X, Y, 0, -0.5, 0.42, 0.42));
        mix(L, front * heart * below(Y, 0.42, 0.05));
        break;
      }
      case 'rabbit':
        mix(L, 0.9 * front * ell(X, Y, 0, -0.6, 0.55, 0.38));
        mix(EI, 0.35 * front * ell(X, Y, 0, 0.62, 0.12, 0.08));
        break;
      case 'bear': case 'polar':
        mix(L, 0.35 * front * ell(X, Y, 0, -0.75, 0.6, 0.35));
        // 곰: 정수리~뒤통수 진한 털 모자(뒤에서 다른 주황 공과 갈리게)
        if (K === 'bear') mix(DD, 0.4 * ss(el, 0.25, 0.75) * (0.3 + 0.7 * backness));
        break;
      case 'beaver': case 'camel':
        mix(L, 0.7 * front * ell(X, Y, 0, -0.62, 0.7, 0.42));
        break;
      default: break;
    }
  };
}

interface Core {
  group: THREE.Group;
  rig: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  arms: THREE.Group[];
  legs: THREE.Group[];
  tail: THREE.Group;
  ears: Array<{ g: THREE.Group; base: THREE.Euler; flop: number }>;
  beak: THREE.Group | null;
  eyeMats: THREE.MeshStandardMaterial[];
  mouthMat: THREE.MeshStandardMaterial | null;
  mouthDefault: MouthMode;
  philtrum: boolean;
  eyeStyle: EyeStyle;
}

// 한 벌 안에서 같은 색 재질은 하나만(그래야 재질별 합치기가 드로콜을 줄인다)
let matCache: Map<string, THREE.Material> | null = null;
function memo<T extends THREE.Material>(key: string, make: () => T): T {
  if (!matCache) return make();
  let m = matCache.get(key) as T | undefined;
  if (!m) { m = make(); matCache.set(key, m); }
  return m;
}
const skinMat = (c: string, map?: THREE.Texture, fill?: number) => map ? skinRaw(c, map, fill) : memo(`s${c}${fill ?? ''}`, () => skinRaw(c, undefined, fill));
const clothMat = (c: string, map?: THREE.Texture) => map ? clothRaw(c, map) : memo(`c${c}`, () => clothRaw(c));
const glossMat = (c: string, r = 0.38) => memo(`g${c}${r}`, () => glossRaw(c, r));

function buildCore(spec: AnimalSpec): Core {
  const prev = matCache;
  matCache = new Map();
  try { return buildCoreInner(spec); } finally { matCache = prev; }
}

function buildCoreInner(spec: AnimalSpec): Core {
  const K = spec.kind;
  const group = new THREE.Group();
  const furM = skinMat(spec.fur);
  const lightM = skinMat(spec.light);
  const earIn = spec.earIn ?? '#ffb3ad';
  const earInM = skinMat(earIn);
  const penguin = K === 'penguin';
  const bird = K === 'duck' || K === 'pelican' || K === 'owl';
  const webbed = penguin || K === 'duck' || K === 'pelican';
  const markC = spec.mark ?? MARK_DEFAULT[K] ?? darken(spec.fur, 0.35);
  const markM = skinMat(markC);
  const padM = glossMat(lighten(earIn, 0.1), 0.5);
  // 양은 털(fur) = 몸통 털, 얼굴·팔다리 = light. 판다는 팔다리가 까맣다(먹색 계열)
  const limbM = K === 'sheep' ? lightM : K === 'panda' ? markM : furM;
  const faceSkin = K === 'sheep' ? spec.light : spec.fur;
  let shirtM: THREE.Material | null = null;
  let sleeveM: THREE.Material | null = null;
  let oc = '#8fd3ff';
  if (spec.outfit && !penguin) {
    oc = spec.outfitColor ?? spec.shirt?.a ?? '#8fd3ff';
    shirtM = clothMat(oc, outfitTexture(spec.outfit, oc));
    shirtM.userData.base = spec.outfit === 'overalls' ? lighten(oc, 0.4) : spec.outfit === 'stripe' ? lighten(oc, 0.35) : oc;
    sleeveM = clothMat(spec.outfit === 'overalls' ? '#fffaf2' : spec.outfit === 'stripe' ? lighten(oc, 0.72) : oc);
  } else if (spec.shirt) {
    const s = spec.shirt;
    oc = s.a;
    shirtM = clothMat(s.a, s.pattern === 'plain' ? undefined : shirtTexture(s.a, s.b ?? '#ffffff', s.pattern));
  }
  const trimM = clothMat(spec.outfit === 'stripe' || spec.outfit === 'overalls' ? '#fffaf2' : darken(oc, 0.12));
  const bodyM = shirtM ?? furM;

  const rig = new THREE.Group();
  group.add(rig);
  const HIP = 0.22;
  const chub = K === 'hamster' ? 1.12 : K === 'panda' || K === 'koala' || K === 'sheep' ? 1.06 : K === 'owl' ? 1.08 : 1;

  // ── 다리(짧고 통통) + 통통한 발(뒤꿈치 젤리) ──
  const legs: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(m * (K === 'frog' ? 0.1 : 0.09), HIP, 0);
    if (webbed) {
      const fc = penguin ? '#ffa94d' : markC;
      const foot = new THREE.Group();
      foot.position.set(0, 0.025 - HIP, 0.05);
      foot.add(mesh(ellipsoid(0.08, 0.026, 0.115), glossMat(fc, 0.45)));
      // 물갈퀴 발가락 세 갈래(앞 끝 물결)
      for (const dx of [-0.045, 0, 0.045]) foot.add(mesh(ellipsoid(0.03, 0.022, 0.04, 14, 10), glossMat(fc, 0.45), dx, 0, 0.09));
      mergeByMaterial(foot);
      leg.add(foot);
      leg.add(mesh(capsule(0.045, 0.12), skinMat(fc), 0, 0.1 - HIP, 0.0));
    } else if (K === 'owl') {
      leg.add(mesh(ellipsoid(0.06, 0.03, 0.075), glossMat('#ffc94a', 0.45), 0, 0.03 - HIP, 0.04));
      for (const dx of [-0.03, 0.03]) leg.add(mesh(ellipsoid(0.02, 0.018, 0.04, 12, 8), glossMat('#ffc94a', 0.45), dx, 0.022 - HIP, 0.1));
      leg.add(mesh(capsule(0.068, 0.11), furM, 0, 0.12 - HIP, 0));
    } else if (K === 'frog') {
      leg.add(mesh(ellipsoid(0.1, 0.028, 0.11), lightM, 0, 0.03 - HIP, 0.05));
      for (const dx of [-0.06, 0, 0.06]) leg.add(mesh(ellipsoid(0.025, 0.022, 0.025, 12, 8), lightM, dx, 0.03 - HIP, 0.15));
      leg.add(mesh(capsule(0.064, 0.14), furM, 0, 0.11 - HIP, 0));
    } else {
      const footM = K === 'camel' ? skinMat('#b98a5e') : limbM;
      leg.add(mesh(ellipsoid(0.08, 0.06, 0.1), footM, 0, 0.055 - HIP, 0.025));
      // 뒤꿈치 젤리(뒤에서 걸을 때 보인다) + 발가락 홈 두 줄
      const pad = mesh(ellipsoid(0.042, 0.032, 0.012, 16, 10), padM, 0, 0.045 - HIP, -0.07);
      pad.rotation.x = 0.35;
      leg.add(pad);
      for (const dx of [-0.026, 0.026]) leg.add(mesh(ellipsoid(0.007, 0.02, 0.012, 8, 6), skinMat(darken(K === 'camel' ? '#b98a5e' : spec.fur, 0.3)), dx, 0.07 - HIP, 0.118).rotateX(-0.9));
      leg.add(mesh(capsule(0.062, 0.18), limbM, 0, 0.13 - HIP, 0));
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
  const belly = mesh(ellipsoid(0.168 * chub, 0.138, 0.148 * chub), penguin ? lightM : furM, 0, 0.24, 0);
  bp.add(belly);
  const torso = mesh(lathe([
    [0, 0.2], [0.135, 0.205], [0.192, 0.255], [0.198, 0.33], [0.178, 0.42], [0.135, 0.5], [0.075, 0.535], [0, 0.545],
  ], 64, 40), bodyM);
  torso.scale.set(chub, 1, 0.88 * chub);
  bp.add(torso);
  if (penguin) {
    bp.add(mesh(ellipsoid(0.135, 0.17, 0.085, 40, 28), lightM, 0, 0.33, 0.11));
    // 펭귄 노란 가슴 띠(실루엣이 없어도 색으로 구분)
    bp.add(mesh(ellipsoid(0.11, 0.03, 0.06, 28, 12), skinMat('#ffd36e'), 0, 0.47, 0.1));
  }
  if (!shirtM) {
    // 옷이 없으면 밝은 배 + 가슴 털 한 줌
    if (spec.light !== spec.fur && !penguin) bp.add(mesh(ellipsoid(0.13 * chub, 0.15, 0.075, 36, 24), lightM, 0, 0.33, 0.125 * chub));
  }
  if (K === 'camel') {
    // 쌍봉 혹(옷 밖으로 등 뒤에 크게 — 옆·뒤 실루엣에서 첫눈에 낙타) + 꼭대기 진한 털
    // 혹은 등에 반쯤 묻혀 솟는다(배낭처럼 매달리지 않게): 위 혹은 어깨선 위로, 아래 혹은 작게. 꼭대기 따뜻한 진한 털 + 뿌리 주름 그림자
    const humpM = skinMat(darken(spec.fur, 0.05));
    const capM = skinMat(darken(new THREE.Color(spec.fur).lerp(new THREE.Color('#b0602a'), 0.3).getStyle(), 0.14));
    const creaseM = skinMat(darken(spec.fur, 0.3));
    for (const [y, r, z] of [[0.565, 1, -0.135], [0.37, 0.78, -0.15]] as const) {
      const h = mesh(ellipsoid(0.12 * r, 0.14 * r, 0.105 * r, 32, 22), humpM, 0, y, z);
      h.rotation.x = 0.28; // 꼭대기가 뒤로 기운 혹 모양
      bp.add(h);
      const c = mesh(ellipsoid(0.085 * r, 0.06 * r, 0.07 * r, 18, 12), capM, 0, y + 0.095 * r, z - 0.04 * r);
      c.rotation.x = 0.28;
      bp.add(c);
      // 혹 뿌리 주름(몸과 만나는 곳의 얕은 그늘 띠)
      const cr = mesh(ellipsoid(0.112 * r, 0.03 * r, 0.06 * r, 24, 8), creaseM, 0, y - 0.105 * r, z + 0.02);
      bp.add(cr);
    }
  }
  if (K === 'turtle') {
    const sm = skinMat(markC, shellTexture(markC, darken(markC, 0.3)));
    sm.userData.base = markC;
    const dome = mesh(new THREE.SphereGeometry(1, seg(40), seg(20), 0, Math.PI * 2, 0, Math.PI / 2), sm, 0, 0.36, -0.1);
    dome.rotation.x = -Math.PI / 2;
    dome.scale.set(0.25, 0.29, 0.19);
    bp.add(dome);
    const rim = mesh(new THREE.TorusGeometry(1, 0.13, seg(14), seg(48)), skinMat(lighten(markC, 0.25)), 0, 0.36, -0.1);
    rim.scale.set(0.24, 0.28, 0.2);
    bp.add(rim);
  }
  if (K === 'sheep' || K === 'alpaca') {
    const wool = skinMat(spec.fur);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const p = mesh(puff(), wool, Math.sin(a) * 0.17, 0.5 + 0.02 * Math.cos(a * 3), Math.cos(a) * 0.15);
      p.scale.setScalar(0.068 + 0.012 * (i % 2));
      bp.add(p);
    }
    if (!shirtM) for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, y = 0.26 + 0.09 * (i % 3);
      const p = mesh(puff(), wool, Math.sin(a) * 0.19, y, Math.cos(a) * 0.17);
      p.scale.setScalar(0.075);
      bp.add(p);
    }
  }
  if (K === 'hedgehog') {
    // 등 가시 망토: 목 뒤(머리 가시 아래 끝)부터 엉덩이까지 엇갈린 줄로 빽빽하게, 아래로 누워서
    const rows = 7;
    for (let r = 0; r < rows; r++) {
      const y = 0.6 - r * 0.055, cols = 9 - Math.floor(r / 3);
      for (let c = 0; c < cols; c++) {
        const a = Math.PI + (((c + (r % 2) * 0.5) / (cols - 0.5)) - 0.5) * Math.PI * 0.95;
        const rr = (y > 0.5 ? 0.15 - (y - 0.5) * 0.6 : 0.19) * chub;
        const n = new THREE.Vector3(Math.sin(a), -0.75, Math.cos(a) - 0.35).normalize();
        const sp = mesh(spine(), markM, Math.sin(a) * rr, y, Math.cos(a) * rr * 0.9);
        sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
        sp.scale.setScalar(1.3 + 0.12 * ((r * 7 + c * 3) % 4) / 3);
        bp.add(sp);
      }
    }
  }
  if (K === 'panda' && !shirtM) {
    // 어깨 검은 띠(판다 등 무늬)
    const band = mesh(lathe([[0.15, 0.4], [0.185, 0.43], [0.17, 0.5], [0.12, 0.53]], 48, 10), markM);
    band.scale.set(chub, 1, 0.88 * chub);
    bp.add(band);
  }

  // ── 옷 디테일(입체) ──
  if (shirtM && !penguin) {
    const ring = (y: number, R: number, r: number, mat: THREE.Material) => {
      const t = mesh(new THREE.TorusGeometry(R, r, seg(10, 4), seg(48)), mat, 0, y, 0);
      t.rotation.x = Math.PI / 2;
      t.scale.set(chub, 0.9 * chub, 1);
      bp.add(t);
    };
    if (spec.outfit !== 'dress') ring(0.236, 0.168, 0.017, spec.outfit === 'hoodie' ? trimM : shirtM);
    ring(0.522, 0.086, spec.outfit === 'dress' ? 0.014 : 0.022, trimM);
    if (spec.outfit === 'overalls') {
      // 멜빵 끈(앞 가슴판 → 어깨 → 등에서 엇갈림) + 금 단추
      const strapM = clothMat(oc);
      for (const m of [-1, 1]) {
        const pts = [new THREE.Vector3(m * 0.05, 0.43, 0.165), new THREE.Vector3(m * 0.085, 0.52, 0.06), new THREE.Vector3(m * 0.08, 0.52, -0.08), new THREE.Vector3(-m * 0.02, 0.4, -0.17), new THREE.Vector3(-m * 0.07, 0.3, -0.175)];
        bp.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg(20), 0.017, seg(8, 4), false), strapM));
        bp.add(mesh(ellipsoid(0.02, 0.02, 0.012, 14, 10), glossMat('#ffd36e', 0.3), m * 0.05, 0.43, 0.168));
      }
    } else if (spec.outfit === 'dress') {
      const sk = mesh(lathe([[0.17, 0.36], [0.2, 0.3], [0.25, 0.2], [0.278, 0.15], [0.268, 0.13], [0.2, 0.15]], 64, 24), shirtM);
      sk.scale.z = 0.92;
      bp.add(sk);
      // 둥근 흰 칼라 두 장 + 등 뒤 큰 리본(뒤에서 보이는 포인트)
      for (const m of [-1, 1]) {
        const c = mesh(ellipsoid(0.065, 0.04, 0.018, 20, 12), clothMat('#ffffff'), m * 0.05, 0.505, 0.12);
        c.rotation.set(-0.5, m * 0.35, m * 0.4);
        bp.add(c);
      }
      const bowM = clothMat(darken(oc, 0.15));
      for (const m of [-1, 1]) {
        const l = mesh(ellipsoid(0.075, 0.05, 0.03, 20, 12), bowM, m * 0.07, 0.33, -0.19);
        l.rotation.z = m * -0.35;
        bp.add(l);
        const tl = mesh(capsule(0.02, 0.12), bowM, m * 0.035, 0.26, -0.19);
        tl.rotation.z = m * 0.25;
        bp.add(tl);
      }
      bp.add(mesh(ellipsoid(0.03, 0.032, 0.025), bowM, 0, 0.33, -0.2));
    } else if (spec.outfit === 'hoodie') {
      const hood = mesh(ellipsoid(0.165, 0.09, 0.105, 40, 24), shirtM, 0, 0.545, -0.1);
      hood.rotation.x = -0.35;
      bp.add(hood);
      bp.add(mesh(ellipsoid(0.12, 0.06, 0.07, 32, 16), trimM, 0, 0.56, -0.115).rotateX(-0.35));
      for (const m of [-1, 1]) {
        bp.add(mesh(capsule(0.009, 0.11), clothMat('#ffffff'), m * 0.04, 0.465, 0.165));
        bp.add(mesh(ellipsoid(0.014, 0.014, 0.014, 10, 8), clothMat('#ffffff'), m * 0.04, 0.41, 0.167));
      }
      // 캥거루 주머니(입체)
      const pk = mesh(ellipsoid(0.105, 0.06, 0.03, 28, 14), clothMat(darken(oc, 0.08)), 0, 0.29, 0.16);
      pk.rotation.x = -0.25;
      bp.add(pk);
    } else if (spec.outfit === 'pocket') {
      const pk = mesh(ellipsoid(0.042, 0.048, 0.016, 18, 12), clothMat(lighten(oc, 0.3)), 0.075, 0.42, 0.168);
      pk.rotation.set(-0.35, 0.35, 0);
      bp.add(pk);
      bp.add(mesh(ellipsoid(0.014, 0.014, 0.01, 10, 8), glossMat('#ff7a9a', 0.3), 0.075, 0.47, 0.17));
      for (const y of [0.45, 0.37, 0.29]) bp.add(mesh(ellipsoid(0.013, 0.013, 0.008, 10, 8), glossMat('#fffaf2', 0.35), 0, y, 0.18 + (0.45 - y) * 0.12));
    }
  }

  // ── 꼬리 ──
  const tail = new THREE.Group();
  tail.position.set(0, 0.25, -0.15);
  bp.add(tail);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  switch (K) {
    case 'cat':
      tail.add(mesh(taperTube([V(0, 0, 0), V(0.04, -0.02, -0.12), V(0.14, 0.03, -0.2), V(0.22, 0.17, -0.19), V(0.22, 0.31, -0.11), V(0.17, 0.36, -0.06)], 0.05, 32, 12), furM));
      tail.add(mesh(ellipsoid(0.03, 0.034, 0.03, 14, 10), skinMat(darken(spec.fur, 0.3)), 0.17, 0.36, -0.06));
      break;
    case 'dog':
      tail.add(mesh(taperTube([V(0, 0, 0), V(0, 0.06, -0.08), V(0, 0.16, -0.12), V(0, 0.22, -0.08)], 0.048, 24, 12), furM));
      break;
    case 'fox': {
      // 크고 통통한 꼬리(끝 흰 털) — 뒤에서 가장 먼저 보이는 실루엣
      const t1 = mesh(ellipsoid(0.12, 0.26, 0.12, 32, 22), furM, 0, 0.13, -0.13);
      t1.rotation.x = -0.75;
      tail.add(t1);
      const tip = mesh(ellipsoid(0.085, 0.1, 0.085, 24, 16), lightM, 0, 0.29, -0.29);
      tip.rotation.x = -0.75;
      tail.add(tip);
      break;
    }
    case 'squirrel': {
      const c = new THREE.CatmullRomCurve3([V(0, -0.05, 0), V(0, 0.05, -0.16), V(0, 0.3, -0.24), V(0, 0.54, -0.13), V(0, 0.6, 0.0)]);
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        const p = c.getPoint(u);
        const r = 0.075 + 0.085 * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.1));
        const pm = mesh(puff(), furM, p.x, p.y, p.z);
        pm.scale.set(r, r, r * 0.9);
        tail.add(pm);
      }
      tail.add(mesh(ellipsoid(0.085, 0.065, 0.075, 20, 14), lightM, 0, 0.62, 0.02));
      break;
    }
    case 'raccoon': {
      const c = new THREE.CatmullRomCurve3([V(0, -0.04, 0), V(0, 0.0, -0.14), V(0, 0.12, -0.26), V(0, 0.3, -0.3)]);
      for (let i = 0; i <= 7; i++) {
        const u = i / 7, p = c.getPoint(u), r = 0.078 + 0.032 * Math.sin(Math.PI * u);
        tail.add(mesh(ellipsoid(r, r, r * 0.95, 22, 14), i % 2 ? markM : furM, p.x, p.y, p.z));
      }
      break;
    }
    case 'beaver': {
      // 납작한 노 꼬리(격자 무늬 결)
      // 엉덩이에서 짧게 가늘어지는 뿌리 → 30° 들린 노(땅에서 떠서 그림자·구멍으로 안 읽히게). 따뜻한 밝은 갈색 + 더 밝은 테
      // 털빛을 어둡게 한 따뜻한 갈색(회보라·하늘빛으로 안 돌게) + 같은 색 계열 비늘 격자
      const tc = darken('#' + new THREE.Color(spec.fur).lerp(new THREE.Color('#8a4a22'), 0.35).getHexString(), 0.12);
      const bt = paintTex(128, 128, (g) => {
        g.fillStyle = tc; g.fillRect(0, 0, 128, 128);
        g.strokeStyle = darken(tc, 0.16); g.lineWidth = 2.5;
        for (let i = -128; i < 256; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke(); }
      });
      bt.userData.shared = false;
      const tm = skinMat('#ffffff', bt); // 색은 무늬 그림에(곱해서 두 번 어두워지지 않게)
      tm.userData.base = tc;
      tail.add(mesh(taperTube([V(0, 0.0, 0.02), V(0, -0.04, -0.05), V(0, -0.07, -0.1)], 0.065, 14, 10), furM));
      // 두께 있는 노(둥근 가장자리 · 끝으로 갈수록 아래로 살짝 휜다)
      const bend = (g: THREE.BufferGeometry) => {
        const p = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) { const z = p.getZ(i); p.setY(i, p.getY(i) - 1.1 * z * z); }
        g.computeVertexNormals();
        return g;
      };
      const tilt = (g: THREE.BufferGeometry) => bend(g.translate(0, 0, -0.15)).rotateX(0.5).translate(0, -0.075, -0.1);
      tail.add(mesh(tilt(ellipsoid(0.098, 0.036, 0.16, 28, 16)), tm));
      tail.add(mesh(tilt(ellipsoid(0.104, 0.026, 0.166, 28, 10).translate(0, -0.006, 0)), skinMat(darken(tc, 0.12))));
      break;
    }
    case 'duck': case 'pelican': case 'owl': {
      for (const dx of [-0.055, 0, 0.055]) {
        const f = mesh(ellipsoid(0.038, 0.022, 0.1, 16, 10), K === 'owl' ? markM : furM, dx, -0.02 + (dx ? -0.01 : 0.01), -0.07);
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
      p.scale.setScalar(0.075);
      tail.add(p);
      break;
    }
    case 'otter':
      tail.add(mesh(taperTube([V(0, 0, 0), V(0, -0.1, -0.12), V(0, -0.16, -0.3), V(0.03, -0.12, -0.48), V(0.06, -0.04, -0.56)], 0.085, 24, 14), furM));
      break;
    case 'camel':
      // 짧고 굵은 꼬리 + 끝 털 술(엉덩이에 붙어 늘어진다 — 막대 끝 구슬 진자처럼 안 보이게)
      tail.add(mesh(taperTube([V(0, 0.04, 0.01), V(0, 0.0, -0.045), V(0, -0.06, -0.06)], 0.032, 12, 10), furM));
      for (const [dx, rz] of [[-0.014, 0.25], [0.014, -0.25], [0, 0]] as const) {
        const t = mesh(ellipsoid(0.02, 0.042, 0.02, 12, 10), skinMat(darken(spec.fur, 0.32)), dx, -0.085, -0.062);
        t.rotation.set(-0.15, 0, rz);
        tail.add(t);
      }
      break;
    case 'rabbit': {
      const p = mesh(puff(), lightM, 0, 0.0, 0);
      p.scale.setScalar(0.08);
      tail.add(p);
      break;
    }
    case 'penguin': {
      const pt = mesh(ellipsoid(0.07, 0.025, 0.08), furM, 0, -0.08, -0.02);
      pt.rotation.x = 0.5;
      tail.add(pt);
      break;
    }
    default:
      tail.add(mesh(ellipsoid(0.048, 0.048, 0.043), furM));
  }

  // ── 팔(새는 날개) + 벙어리 손(엄지) ──
  const arms: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(m * 0.138 * chub, 0.44 - HIP, 0);
    arm.rotation.z = m * 0.38;
    const sleeveG = lathe([[0, 0.03], [0.056, 0.028], [0.072, 0.0], [0.074, -0.05], [0.07, -0.085], [0.052, -0.08]], 40, 24);
    if (penguin) {
      arm.add(mesh(ellipsoid(0.045, 0.15, 0.085), furM, 0, -0.1, 0));
    } else if (bird) {
      if (shirtM) arm.add(mesh(sleeveG, sleeveM ?? shirtM));
      arm.add(mesh(ellipsoid(0.052, 0.15, 0.092, 28, 18), furM, 0, -0.09, -0.005));
      // 날개 끝 깃 세 갈래
      for (const dz of [-0.04, 0, 0.04]) arm.add(mesh(ellipsoid(0.03, 0.06, 0.03, 12, 10), K === 'owl' ? markM : lightM, 0, -0.21 + Math.abs(dz) * 0.4, dz));
    } else {
      if (shirtM) arm.add(mesh(sleeveG, sleeveM ?? shirtM));
      arm.add(mesh(capsule(0.05, 0.16), limbM, 0, -0.1, 0));
      const handM = K === 'raccoon' ? markM : limbM;
      arm.add(mesh(ellipsoid(0.06, 0.063, 0.057), handM, 0, -0.185, 0.004));
      arm.add(mesh(ellipsoid(0.024, 0.03, 0.024, 14, 10), handM, -m * 0.042, -0.168, 0.03));
    }
    body.add(arm);
    arms.push(arm);
  }

  // ── 머리 ──
  const napeK = K === 'frog' || K === 'turtle' || K === 'penguin' || K === 'duck' || K === 'pelican' || K === 'sheep' || K === 'alpaca' ? 0 : K === 'fox' || K === 'raccoon' || K === 'cat' ? 0.13 : 0.1;
  const shape: HeadShape = { rx: 0.36, ry: 0.315, rz: 0.33, cheek: 0.07, jaw: 0.06, flat: 0.06, back: 0.05, nape: napeK, ...SHAPE[K] };
  const RX = shape.rx, RY = shape.ry, RZ = shape.rz;
  const head = new THREE.Group();
  head.name = 'head';
  const neck = K === 'alpaca' ? 0.12 : K === 'camel' ? 0.07 : 0;
  head.position.set(0, 0.53 + RY * 0.9 - HIP + neck, 0);
  body.add(head);
  if (K === 'camel') {
    // 낙타: 짧고 굵은 목(앞으로 살짝)
    body.add(mesh(lathe([[0.0001, 0.5], [0.1, 0.5], [0.095, 0.56], [0.085, 0.62], [0.0001, 0.64]], 32, 10), furM, 0, -HIP, 0.02));
  } else if (neck) {
    // 알파카 긴 털 목(몽글 털 기둥)
    const wool = skinMat(spec.fur);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const p = mesh(puff(), wool, Math.sin(a) * 0.09, 0.56 - HIP + 0.05 * (i % 3), Math.cos(a) * 0.08);
      p.scale.setScalar(0.075);
      body.add(p);
    }
  }
  const hasMuzzle = K === 'bear' || K === 'polar' || K === 'dog' || K === 'otter' || K === 'camel' || K === 'beaver' || K === 'alpaca';
  const smallMuzzle = K === 'cat' || K === 'rabbit' || K === 'fox' || K === 'squirrel' || K === 'sheep' || K === 'raccoon' || K === 'panda' || K === 'hamster' || K === 'hedgehog';
  const E = eyeSpot(K, hasMuzzle ? 'big' : smallMuzzle ? 'small' : 'none');

  const hg = headGeo(shape, 72, 54);
  const headMat = skinMat(faceSkin, headTexture(`${K}|${spec.light}|${markC}|${spec.earIn ?? ''}`, shape, faceSkin, headPaint(K, spec, E, markC)));
  headMat.userData.base = faceSkin;
  const headMesh = mesh(hg, headMat);
  headMesh.userData.keepLod = true;
  head.add(headMesh);

  // 눈 조각(두 눈 한 메시 — 말랑 그림체)
  // 낙타: 졸린 듯 내려온 윗눈꺼풀 + 긴 속눈썹
  const eyeStyle: EyeStyle = { iris: spec.iris ?? '#5a3a2e', lashes: spec.lashes ?? (K === 'camel' ? true : undefined), blush: spec.blush, noBlush: K === 'frog', lid: K === 'camel' ? lighten(faceSkin, 0.06) : undefined };
  const eyeMats: THREE.MeshStandardMaterial[] = [];
  const { L: bL, R: bR, T: bT, B: bB } = EYE_BOX;
  const eyeBox = (cx: number, cy: number, w: number, h: number, m: number) => m > 0
    ? { x0: cx - bL * w, x1: cx + bR * w, y0: cy - bB * h, y1: cy + bT * h }
    : { x0: cx - bR * w, x1: cx + bL * w, y0: cy - bB * h, y1: cy + bT * h };
  if (K === 'frog') {
    // 개구리: 정수리 눈 둔덕 앞면에(둔덕마다 한 조각)
    for (const m of [-1, 1]) {
      const bump = new THREE.Group();
      bump.position.set(m * 0.17, RY * 0.78, RZ * 0.36);
      const bg = ellipsoid(0.105, 0.095, 0.095, 32, 24);
      bump.add(mesh(bg, furM));
      const em = decalMat(eyeTexture(eyeStyle, 'open'));
      eyeMats.push(em);
      const pg = cutPatch(bg, eyeBox(0, E.y * 0.095, E.w * 0.105, E.h * 0.095, m), m < 0, 0.0016, 0.1);
      const pm = mesh(pg, em);
      pm.castShadow = false;
      pm.renderOrder = 1;
      bump.add(pm);
      head.add(bump);
    }
    // 볼터치는 둔덕 아래 얼굴에(눈 텍스처 볼 칸만 쓰는 대신 작은 볼 조각)
  } else {
    const em = decalMat(eyeTexture(eyeStyle, 'open'));
    eyeMats.push(em);
    const geos = [1, -1].map((m) => cutPatch(hg, eyeBox(m * E.x * RX, E.y * RY, E.w * RX, E.h * RY, m), m < 0));
    const merged = mergeGeometries(geos, false)!;
    const pm = mesh(merged, em);
    pm.castShadow = false;
    pm.renderOrder = 1;
    pm.name = 'eyes';
    head.add(pm);
  }

  // 주둥이·코·부리 + 입 조각
  let mouthMat: THREE.MeshStandardMaterial | null = null;
  let mouthDefault: MouthMode = 'w';
  let philtrum = true;
  let beak: THREE.Group | null = null;
  const addMouth = (src: THREE.BufferGeometry, parent: THREE.Object3D, box: { x0: number; x1: number; y0: number; y1: number }, mode: MouthMode, ph: boolean) => {
    mouthDefault = mode;
    philtrum = ph;
    mouthMat = decalMat(mouthTexture(mode, ph), 0.4, 0.15);
    const pm = mesh(cutPatch(src, box, false, 0.0014, 0.15), mouthMat);
    pm.castShadow = false;
    pm.renderOrder = 1;
    pm.name = 'mouth';
    parent.add(pm);
  };
  if (hasMuzzle || smallMuzzle) {
    const s = smallMuzzle ? 0.64 : K === 'camel' ? 1.15 : K === 'alpaca' ? 0.9 : K === 'polar' ? 1.08 : 1;
    const MZ = K === 'camel' ? { x: 0.098, y: 0.092, z: 0.36 } : { x: 0.15 * s, y: 0.105 * s, z: (smallMuzzle ? 0.08 : 0.105) * (K === 'alpaca' ? 1.5 : K === 'polar' ? 1.35 : 1) };
    const my = smallMuzzle ? -0.1 : K === 'camel' ? -0.15 : -0.11;
    // 낙타 주둥이는 흰 공이 아니라 털빛과 이어진 연한 모래색(곰 주둥이로 안 읽히게)
    const mcol = K === 'camel' ? '#' + new THREE.Color(spec.light).lerp(new THREE.Color(spec.fur), 0.45).getHexString() : spec.light;
    const mz = new THREE.Group();
    // 머리 곡면에서 주둥이 뒤 절반이 묻히게
    const surfZ = surfAt(shape, 0, my / RY).pos.z;
    mz.position.set(0, my, surfZ - MZ.z * (K === 'camel' ? 0.38 : 0.42));
    if (K === 'camel') mz.rotation.x = 0.22; // 앞끝이 아래로 — 길쭉하게 늘어진 낙타 주둥이
    const mg = muzzleGeo(MZ.x, MZ.y, MZ.z, smallMuzzle ? 0.18 : 0.14);
    const mm = skinMat(mcol);
    mz.add(mesh(mg, mm));
    const noseCol = K === 'cat' || K === 'rabbit' || K === 'sheep' || K === 'hamster' ? '#ff8fa0' : '#4a3028';
    const ns = smallMuzzle ? 0.72 : K === 'polar' ? 1.1 : 1;
    if (K === 'camel') {
      // 낙타: 코 대신 비스듬한 콧구멍 틈 둘(길쭉한 주둥이 위 끝)
      for (const m of [-1, 1]) {
        const nn = mesh(ellipsoid(0.03, 0.008, 0.014, 14, 8), glossMat('#5a3826', 0.35), m * 0.036, MZ.y * 0.62, MZ.z * 0.74);
        nn.rotation.set(-0.6, 0, m * -0.6);
        mz.add(nn);
      }
      // 갈라진 윗입술(가운데 세로 홈) + 두툼한 아랫입술
      mz.add(mesh(ellipsoid(0.006, 0.042, 0.012, 8, 10), skinMat(darken(mcol, 0.3)), 0, -MZ.y * 0.15, MZ.z * 0.93));
      const lip = mesh(ellipsoid(0.06, 0.026, 0.075, 20, 10), skinMat(darken(mcol, 0.06)), 0, -MZ.y * 0.92, MZ.z * 0.42);
      mz.add(lip);
    } else mz.add(mesh(noseGeo(0.052 * ns, 0.036 * ns, 0.034 * ns), glossMat(noseCol, 0.25), 0, MZ.y * 0.45, MZ.z * 0.86));
    if (K === 'camel') addMouth(mg, mz, { x0: -MZ.x * 0.7, x1: MZ.x * 0.7, y0: -MZ.y * 1.0, y1: -MZ.y * 0.2 }, 'smile', true);
    else addMouth(mg, mz, { x0: -MZ.x * 0.82, x1: MZ.x * 0.82, y0: -MZ.y * 1.02, y1: MZ.y * 0.6 }, 'w', true);
    if (K === 'beaver' || K === 'hamster') {
      // 앞니 두 개(흰 둥근 네모)
      const tz = K === 'beaver' ? 1 : 0.6;
      for (const m of [-1, 1]) mz.add(mesh(ellipsoid(0.024 * tz, 0.04 * tz, 0.014 * tz, 14, 10), glossMat('#fffaf2', 0.3), m * 0.026 * tz, -MZ.y * 0.78, MZ.z * 0.7));
    }
    head.add(mz);
    if (K === 'cat' || K === 'otter' || K === 'raccoon' || K === 'squirrel' || K === 'hamster') {
      // 수염(가는 선 — 끝이 살짝 올라간다)
      const wm = new THREE.MeshBasicMaterial({ color: K === 'otter' ? '#fff4ea' : '#8a6a58' });
      const wg: THREE.BufferGeometry[] = [];
      for (const m of [-1, 1]) for (const dy of [0.012, -0.018]) {
        const pts = [V(m * MZ.x * 0.6, dy, MZ.z * 0.55), V(m * (MZ.x + 0.06), dy + 0.004, MZ.z * 0.45), V(m * (MZ.x + 0.13), dy + 0.018 + dy * 0.6, MZ.z * 0.25)];
        wg.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.0035, 4, false));
      }
      const w = new THREE.Mesh(mergeGeometries(wg, false)!, wm);
      w.castShadow = false;
      mz.add(w);
    }
  } else if (penguin || K === 'duck' || K === 'pelican' || K === 'owl') {
    // 부리: 위 · 아래(말할 때 아래 부리가 벌어진다)
    const by = K === 'owl' ? -0.03 : penguin ? -0.09 : -0.07;
    const sz = surfAt(shape, 0, by / RY).pos.z;
    beak = new THREE.Group();
    beak.position.set(0, by - 0.005, sz - 0.03);
    const upper = new THREE.Group();
    upper.position.set(0, 0.005, 0.03);
    const bc = K === 'owl' ? '#ffc94a' : penguin ? '#ffb443' : markC;
    const bm = glossMat(bc, 0.3);
    if (K === 'duck') {
      upper.add(mesh(ellipsoid(0.125, 0.036, 0.105, 32, 16), bm, 0, 0.0, 0.02));
      upper.add(mesh(ellipsoid(0.02, 0.008, 0.01, 8, 6), glossMat(darken(bc, 0.3), 0.3), -0.035, 0.022, 0.1));
      upper.add(mesh(ellipsoid(0.02, 0.008, 0.01, 8, 6), glossMat(darken(bc, 0.3), 0.3), 0.035, 0.022, 0.1));
      beak.add(mesh(ellipsoid(0.105, 0.026, 0.088, 28, 14), glossMat(darken(bc, 0.12), 0.4), 0, -0.022, 0.02));
    } else if (K === 'pelican') {
      const top = mesh(ellipsoid(0.062, 0.032, 0.2, 28, 14), bm, 0, 0.0, 0.12);
      top.rotation.x = 0.1;
      upper.add(top);
      upper.add(mesh(ellipsoid(0.03, 0.026, 0.03), glossMat(darken(bc, 0.2), 0.35), 0, 0.01, 0.3));
      const pouch = mesh(ellipsoid(0.066, 0.075, 0.16, 28, 16), skinMat('#ffc08a'), 0, -0.06, 0.08);
      pouch.rotation.x = 0.2;
      beak.add(pouch);
    } else if (K === 'owl') {
      const bk = mesh(pointyEar(0.036, 0.085, 0.032), bm, 0, 0.035, 0.0);
      bk.rotation.x = Math.PI - 0.3;
      upper.add(bk);
      beak.add(mesh(ellipsoid(0.022, 0.014, 0.018), glossMat(darken(bc, 0.15), 0.35), 0, -0.04, 0.0));
    } else {
      upper.add(mesh(ellipsoid(0.072, 0.034, 0.085), bm, 0, 0.0, 0.02));
      beak.add(mesh(ellipsoid(0.06, 0.022, 0.07), glossMat(darken(bc, 0.12), 0.4), 0, -0.025, 0.02));
    }
    head.add(upper);
    upper.position.add(beak.position);
    head.add(beak);
    mouthDefault = 'none';
  } else if (K === 'koala') {
    // 큰 동그란 검은 코 + 아래 작은 웃음
    const sz = surfAt(shape, 0, -0.2).pos.z;
    head.add(mesh(noseGeo(0.075, 0.095, 0.055), glossMat('#4a3d4e', 0.25), 0, -0.065, sz + 0.005));
    addMouth(hg, head, { x0: -0.08, x1: 0.08, y0: -0.27, y1: -0.13 }, 'smile', false);
  } else {
    // 개구리 · 거북: 넓은 웃는 입을 얼굴에
    const wide = K === 'frog' ? 0.2 : 0.12;
    const yc = K === 'frog' ? -0.06 : -0.12;
    addMouth(hg, head, { x0: -wide, x1: wide, y0: yc - wide * 0.85, y1: yc + wide * 0.45 }, 'smile', false);
    if (K === 'frog') {
      // 볼터치(둔덕 아래)
      const bm = new THREE.MeshBasicMaterial({ color: '#ff9fb0', transparent: true, opacity: 0.55, depthWrite: false });
      for (const m of [-1, 1]) {
        const s = surfAt(shape, m * 0.62, -0.05, 0.002);
        const b = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), bm);
        b.position.copy(s.pos);
        b.quaternion.setFromUnitVectors(V(0, 0, 1), s.n);
        b.scale.y = 0.6;
        head.add(b);
      }
    }
  }
  if (K === 'hamster') {
    // 볼주머니 빵빵(흰 털)
    for (const m of [-1, 1]) head.add(mesh(ellipsoid(0.1, 0.09, 0.09, 28, 18), lightM, m * RX * 0.56, -RY * 0.4, RZ * 0.5)); // 앞으로 당겨서(뒤에서 버섯 갓처럼 안 퍼지게)
  }
  if (K === 'sheep' || K === 'alpaca') {
    // 정수리 털뭉치(앞머리처럼 이마로 살짝)
    const wool = skinMat(spec.fur);
    const n = K === 'alpaca' ? 10 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = mesh(puff(), wool, Math.sin(a) * RX * 0.42, RY * 0.88 + 0.03 * Math.cos(a * 2), Math.cos(a) * RZ * 0.42 + 0.03);
      p.scale.setScalar(K === 'alpaca' ? 0.105 : 0.09);
      head.add(p);
    }
    const c = mesh(puff(), wool, 0, RY * 1.04, 0.03);
    c.scale.setScalar(K === 'alpaca' ? 0.13 : 0.1);
    head.add(c);
    for (const dx of [-0.07, 0.07]) { const f = mesh(puff(), wool, dx, RY * 0.72, RZ * 0.62); f.scale.setScalar(0.065); head.add(f); }
  }
  if (K === 'hedgehog') {
    // 뒤 반쪽 머리 전체에 가시(피보나치 + 정해진 흔들림): 뒤·아래로 누워 겹치고, 아래 끝은 등 가시로 이어진다
    const N = 150, GA = Math.PI * (3 - Math.sqrt(5));
    const jit = (i: number, k: number) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    const up = V(0, 1, 0), dir = new THREE.Vector3(), nrm = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N;
      const el = Math.asin(y) + (jit(i, 1) - 0.5) * 0.08;
      const az = i * GA + (jit(i, 2) - 0.5) * 0.15;
      const azW = Math.atan2(Math.sin(az), Math.cos(az));
      // 뒤(|az| > 1.15) 는 el -0.85..1.35, 정수리는 앞이마 가까이(el > 1.0)까지
      const back = Math.abs(azW) > 1.15 && el > -0.85;
      const crown = el > 1.0 && Math.abs(azW) > 0.55;
      if (!back && !crown) continue;
      const p = headAt(shape, azW, el, 0.9);
      nrm.set(Math.sin(azW) * Math.cos(el), Math.sin(el), Math.cos(azW) * Math.cos(el));
      dir.copy(nrm).multiplyScalar(0.62).add(V(0, -0.22 - 0.2 * Math.max(0, -el), -0.55)).normalize();
      const sp = mesh(spine(), markM, p.x, p.y, p.z);
      sp.quaternion.setFromUnitVectors(up, dir);
      sp.scale.setScalar(1.25 + 0.35 * jit(i, 3) + 0.25 * Math.max(0, -el));
      head.add(sp);
    }
    // 앞머리 가시 세 개(이마 위로 삐죽)
    for (const dx of [-0.08, 0, 0.08]) {
      const n = new THREE.Vector3(dx * 2, 1, 0.5).normalize();
      const sp = mesh(spine(), markM, dx, RY * 0.9, RZ * 0.35);
      sp.quaternion.setFromUnitVectors(V(0, 1, 0), n);
      sp.scale.setScalar(1.1);
      head.add(sp);
    }
  }

  // 정수리 털 한 움큼(모자를 쓰면 숨긴다): 앞으로 말린 갈고리 하나 + 옆 짧은 털 — 말랑의 더듬이와 같은 가족 표지
  const tuft = TUFT[K];
  const hatOn = spec.acc ? HATS.has(spec.acc) : false;
  if (tuft && !hatOn) {
    const top = headAt(shape, 0, Math.PI / 2 - 0.3, 0.965);
    const lock = (dx: number, lean: number, L: number, r: number, curl: number) => {
      const p0 = top.clone().add(V(dx, 0, 0));
      const pts = [p0, p0.clone().add(V(dx * 0.3 + lean * 0.2 * L, L * 0.55, -0.15 * L)), p0.clone().add(V(dx * 0.6 + lean * 0.5 * L, L * 0.95, 0.05 * L))];
      if (curl > 0) pts.push(p0.clone().add(V(dx * 0.7 + lean * 0.6 * L, L * (1.0 - 0.05 * curl), 0.45 * L * curl)), p0.clone().add(V(dx * 0.7 + lean * 0.6 * L, L * (0.82 - 0.1 * curl), 0.55 * L * curl)));
      head.add(mesh(taperTube(pts, r, 18, 10), furM));
    };
    if (tuft === 'curl') { lock(0, 0, 0.12, 0.024, 1); lock(-0.035, -1, 0.06, 0.02, 0); lock(0.035, 1, 0.055, 0.019, 0); }
    else if (tuft === 'spikes') { lock(-0.04, -1, 0.08, 0.026, 0); lock(0, 0, 0.11, 0.028, 0.35); lock(0.04, 1, 0.075, 0.025, 0); }
    else { lock(-0.045, -1.2, 0.065, 0.03, 0.2); lock(0, 0, 0.085, 0.032, 0.5); lock(0.045, 1.2, 0.06, 0.03, 0.2); }
  }

  // 뒷머리 털은 입체 조각을 붙이지 않는다(가시·송곳니 → 동전·단추처럼 읽혔다): 텍스처 털 결 + 머리 조형의 뒷목 지그재그(napeK)로 민머리 공을 깬다
  // 귀(뿌리 피벗 — 출렁임용으로 기본 각도를 적어 둔다)
  const ears: Core['ears'] = [];
  const earAt = (az: number, el: number, k = 0.95) => headAt(shape, az, el, k);
  for (const m of [-1, 1]) {
    const ear = new THREE.Group();
    let flop = 1;
    switch (K) {
      case 'bear': case 'polar': case 'otter': case 'beaver': case 'panda': case 'hamster': case 'hedgehog': {
        const sc = K === 'otter' ? 0.55 : K === 'beaver' || K === 'hedgehog' ? 0.55 : K === 'hamster' ? 0.62 : K === 'polar' ? 0.82 : K === 'panda' ? 1.02 : 1.15;
        const el = K === 'otter' ? 0.45 : K === 'polar' ? 0.72 : K === 'panda' ? 0.7 : 0.8;
        const az = K === 'otter' ? 1.05 : K === 'panda' ? 0.8 : 0.72;
        ear.position.copy(earAt(m * az, el)).add(V(0, 0, 0.02));
        ear.rotation.set(-0.1, m * 0.4, -m * 0.45);
        // 오목한 컵 귀(바깥 털 + 안쪽 분홍이 쏙 들어간)
        ear.add(mesh(ellipsoid(0.1 * sc, 0.095 * sc, 0.055 * sc), K === 'panda' ? markM : furM));
        ear.add(mesh(ellipsoid(0.064 * sc, 0.06 * sc, 0.026 * sc), K === 'panda' ? markM : earInM, 0, -0.008 * sc, 0.036 * sc));
        break;
      }
      case 'koala': {
        // 크고 복슬한 귀(옆으로 — 머리보다 넓은 실루엣) + 가장자리 털 뭉치
        ear.position.copy(earAt(m * 1.2, 0.55)).add(V(m * 0.04, 0, 0));
        ear.rotation.set(0, m * 0.9, -m * 0.2);
        ear.add(mesh(ellipsoid(0.2, 0.19, 0.07, 30, 20), furM));
        ear.add(mesh(ellipsoid(0.13, 0.125, 0.04, 24, 16), lightM, 0, 0, 0.04));
        // 귀 가장자리 복슬 털(바깥 반 바퀴)
        for (let i = 0; i < 11; i++) {
          const a = -1.5 + (i / 10) * 3.0;
          const p = mesh(puff(), furM, Math.cos(a) * 0.17, Math.sin(a) * 0.165, 0.0);
          p.scale.setScalar(0.042);
          ear.add(p);
        }
        break;
      }
      case 'cat': case 'fox': case 'squirrel': case 'raccoon': {
        const big = (K === 'fox' ? 1.4 : K === 'raccoon' ? 0.85 : 1) * (spec.earScale ?? 1);
        ear.position.copy(earAt(m * 0.6, 0.8));
        ear.rotation.set(-0.12, 0, -m * 0.36);
        ear.add(mesh(pointyEar(0.098 * big, 0.21 * big, 0.052), furM));
        ear.add(mesh(pointyEar(0.06 * big, 0.145 * big, 0.02), K === 'raccoon' ? markM : earInM, 0, 0.02, 0.026));
        // 귀 속 털 한 가닥(밝은)
        ear.add(mesh(pointyEar(0.025 * big, 0.08 * big, 0.015), lightM, m * -0.01, 0.015, 0.034));
        if (K === 'squirrel') ear.add(mesh(taperTube([V(0, 0.2, 0), V(0.01, 0.27, 0), V(0.03, 0.31, 0)], 0.025, 8, 6), furM));
        if (K === 'fox') ear.add(mesh(pointyEar(0.055 * big, 0.09 * big, 0.04), skinMat('#5a3a2e'), 0, 0.13 * big, 0.0));
        break;
      }
      case 'owl': {
        ear.position.copy(earAt(m * 0.55, 0.92));
        ear.rotation.set(-0.15, 0, -m * 0.5);
        ear.add(mesh(pointyEar(0.065, 0.17, 0.045), markM));
        ear.add(mesh(pointyEar(0.04, 0.12, 0.03), furM, m * 0.03, 0.0, 0.01).rotateZ(m * 0.3));
        break;
      }
      case 'rabbit': {
        ear.position.copy(earAt(m * 0.32, 1.0));
        ear.rotation.set(-0.15, 0, -m * 0.22);
        ear.add(mesh(ellipsoid(0.078, 0.25, 0.052, 32, 22), furM, 0, 0.21, 0));
        ear.add(mesh(ellipsoid(0.046, 0.2, 0.02, 24, 18), earInM, 0, 0.21, 0.038));
        if (m === 1) { ear.rotation.z = -0.65; ear.rotation.x = 0.1; flop = 1.8; } // 한쪽 귀가 폴더(귀여움)
        break;
      }
      case 'alpaca': {
        ear.position.copy(earAt(m * 0.75, 0.75));
        ear.rotation.set(-0.1, 0, -m * 0.3);
        ear.add(mesh(ellipsoid(0.05, 0.14, 0.04, 24, 16), furM, 0, 0.11, 0));
        ear.add(mesh(ellipsoid(0.03, 0.095, 0.02, 18, 12), earInM, 0, 0.11, 0.025));
        break;
      }
      case 'sheep': {
        ear.position.copy(earAt(m * 1.2, 0.38));
        ear.rotation.set(0, 0, m * 1.25);
        ear.add(mesh(ellipsoid(0.062, 0.125, 0.04, 24, 16), lightM, 0, -0.08, 0));
        ear.add(mesh(ellipsoid(0.036, 0.085, 0.02, 18, 12), earInM, 0, -0.08, 0.025));
        flop = 2.2;
        break;
      }
      case 'dog': {
        // 늘어진 귀(끝이 살짝 바깥으로) — 출렁임 크게
        ear.position.copy(earAt(m * 1.12, 0.5));
        ear.rotation.set(0, 0, m * 0.22);
        const ec = spec.light === '#ffffff' ? '#c98b55' : darken(spec.fur, 0.25);
        ear.add(mesh(ellipsoid(0.088, 0.175, 0.045, 28, 20), skinMat(ec), 0, -0.1, 0));
        flop = 2.5;
        break;
      }
      case 'camel': {
        // 작은 잎사귀 귀: 머리 옆으로 눕혀 뻗는다(곰 귀처럼 정수리에 동그랗게 서지 않게)
        ear.position.copy(earAt(m * 1.42, 0.3, 0.96));
        ear.rotation.set(0.1, m * 0.5, -m * 1.85);
        ear.add(mesh(pointyEar(0.048, 0.13, 0.026), furM));
        ear.add(mesh(pointyEar(0.028, 0.085, 0.012), earInM, 0, 0.014, 0.016));
        flop = 1.4;
        break;
      }
      default: break;
    }
    head.add(ear);
    ears.push({ g: ear, base: ear.rotation.clone(), flop });
  }

  // ── 소품 ──
  const accC = spec.accColor ?? '#ff8fb1';
  // 개구리: 모자를 작게 줄여 눈 둔덕 뒤 정수리에 얹는다(뒤로 젖혀 챙 앞끝이 둔덕 뒤에 살짝 닿게 — 뜨지도, 눈을 가리지도 않게)
  const hatLift = (g: THREE.Object3D) => {
    if (K === 'frog') { g.scale.setScalar(0.6); g.position.set(0, RY * 0.8, -0.13); g.rotation.x = -0.1; }
    return g;
  };
  const accM = clothMat(accC);
  // 개구리는 모자 대신 꽃·잎 화관(눈 둔덕 사이에 모자가 얹히면 노란 얼룩·뒤로 뻗은 챙으로만 읽힌다)
  const frogCrown = K === 'frog' && !!spec.acc && HATS.has(spec.acc) && spec.acc !== 'helmet';
  if (frogCrown) {
    const leafM = clothMat('#3f9a4a'), petalMs = [clothMat('#ff9fc6'), clothMat(accC), clothMat('#ffffff')], coreM = clothMat('#ffd36e');
    const cy = RY * 0.97, cz = -0.03, R0 = 0.14;
    const N = 9;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const x = Math.sin(a) * R0, z = cz + Math.cos(a) * R0 * 0.85;
      if (i % 3 === 0) {
        // 꽃(꽃잎 다섯 + 노란 가운데) — 위로 살짝 바깥을 본다
        const n = V(Math.sin(a) * 0.5, 1, Math.cos(a) * 0.5).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
        for (let k = 0; k < 5; k++) {
          const pg = ellipsoid(0.03, 0.044, 0.012, 12, 8).translate(0, 0.04, 0).rotateZ((k / 5) * Math.PI * 2 + a).applyQuaternion(q).translate(x, cy + 0.035, z);
          head.add(mesh(pg, petalMs[(i / 3) % 3]));
        }
        head.add(mesh(ellipsoid(0.022, 0.022, 0.016, 10, 8).applyQuaternion(q).translate(x + n.x * 0.01, cy + 0.035 + n.y * 0.01, z + n.z * 0.01), coreM));
      } else {
        // 잎: 고리를 따라 비스듬히 누운 뾰족 잎
        const lf = mesh(pointyEar(0.038, 0.11, 0.012), leafM, x, cy, z);
        lf.rotation.set(0, a + Math.PI / 2, 0);
        lf.rotateZ(0.85);
        head.add(lf);
      }
    }
  }
  switch (frogCrown ? 'none' : spec.acc) {
    case 'scarf': {
      const sc = mesh(new THREE.TorusGeometry(0.115, 0.052, seg(18), seg(40)), accM, 0, 0.53 - HIP, 0.0);
      sc.rotation.x = Math.PI / 2;
      sc.scale.set(1.15, 1, 1);
      body.add(sc);
      // 목도리 끝(뒤로 펄럭 — 뒤에서 보이게) + 줄무늬 술
      const tailS = mesh(capsule(0.045, 0.2), accM, 0.07, 0.44 - HIP, -0.14);
      tailS.rotation.set(0.3, 0, 0.2);
      tailS.scale.z = 0.5;
      body.add(tailS);
      body.add(mesh(ellipsoid(0.05, 0.02, 0.03, 14, 8), clothMat(lighten(accC, 0.5)), 0.09, 0.345 - HIP, -0.17));
      break;
    }
    case 'beanie': {
      const cap = mesh(new THREE.SphereGeometry(1, seg(40), seg(20), 0, Math.PI * 2, 0, Math.PI * 0.42), accM, 0, RY * 0.12, 0);
      cap.scale.set(RX * 1.06, RY * 1.06, RZ * 1.12);
      head.add(cap);
      const band = mesh(new THREE.TorusGeometry(1, 0.08, seg(14), seg(40)), clothMat('#ffffff'), 0, RY * 0.12 + RY * 0.25, 0);
      band.rotation.x = Math.PI / 2;
      band.scale.set(RX * 1.0, RZ * 1.06, RY);
      head.add(band);
      const pom = mesh(puff(), clothMat('#ffffff'), 0, RY * 1.2, 0);
      pom.scale.setScalar(0.075);
      head.add(pom);
      break;
    }
    case 'safari': {
      const hat = new THREE.Group();
      hat.position.set(0, RY * 0.62, -0.01);
      hat.rotation.x = -0.12;
      const khaki = clothMat('#e7cf97');
      const dome = mesh(new THREE.SphereGeometry(1, seg(40), seg(18), 0, Math.PI * 2, 0, Math.PI / 2), khaki);
      dome.scale.set(RX * 0.84, RY * 0.62, RZ * 0.86);
      hat.add(dome);
      hat.add(mesh(new THREE.CylinderGeometry(RX * 1.14, RX * 1.14, 0.022, seg(48)), khaki));
      hat.add(mesh(new THREE.CylinderGeometry(RX * 0.85, RX * 0.85, 0.05, seg(48), 1, true), clothMat(accC), 0, 0.035, 0));
      head.add(hatLift(hat));
      break;
    }
    case 'captain': {
      const hat = new THREE.Group();
      hat.position.set(0, RY * 0.78, -0.02);
      hat.rotation.x = -0.18;
      const white = clothMat('#fffaf2');
      hat.add(mesh(lathe([[0.0001, 0.13], [0.16, 0.125], [0.235, 0.1], [0.24, 0.07], [0.19, 0.04], [0.18, 0.0]], 48, 12), white));
      hat.add(mesh(new THREE.CylinderGeometry(0.185, 0.18, 0.06, seg(40), 1, true), clothMat(accC), 0, 0.03, 0));
      const visor = mesh(ellipsoid(0.15, 0.015, 0.09, 32, 10), glossMat(darken(accC, 0.25), 0.3), 0, 0.005, 0.16);
      visor.rotation.x = 0.25;
      hat.add(visor);
      hat.add(mesh(ellipsoid(0.03, 0.03, 0.012, 16, 10), glossMat('#ffcf4a', 0.3), 0, 0.075, 0.2));
      head.add(hatLift(hat));
      break;
    }
    case 'sunhat': {
      const hat = new THREE.Group();
      hat.position.set(0, RY * 0.7, -0.02);
      hat.rotation.x = -0.15;
      const straw = clothMat('#f6dc9a');
      hat.add(mesh(lathe([[0.0001, 0.12], [0.14, 0.115], [0.19, 0.06], [0.2, 0.0]], 40, 12), straw));
      const brimM = clothRaw('#f6dc9a');
      brimM.side = THREE.DoubleSide;
      hat.add(mesh(lathe([[0.19, 0.01], [0.3, 0.0], [0.42, -0.04], [0.44, -0.055]], 48, 10), brimM));
      hat.add(mesh(new THREE.CylinderGeometry(0.197, 0.2, 0.04, seg(40), 1, true), clothMat(accC), 0, 0.03, 0));
      // 띠 리본 꼬리(뒤로)
      for (const m of [-1, 1]) hat.add(mesh(capsule(0.02, 0.1), clothMat(accC), m * 0.03, -0.02, -0.21).rotateX(0.5).rotateZ(m * 0.3));
      head.add(hatLift(hat));
      break;
    }
    case 'helmet': {
      const glass = new THREE.Mesh(new THREE.SphereGeometry(1, seg(48), seg(32)), new THREE.MeshPhysicalMaterial({
        color: '#dff3ff', transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1, depthWrite: false,
      }));
      glass.scale.set(RX * 1.32, RY * 1.36, RZ * 1.38);
      glass.position.set(0, 0.02, 0.03);
      glass.renderOrder = 3;
      glass.castShadow = false;
      head.add(glass);
      const ring = mesh(new THREE.TorusGeometry(0.17, 0.045, seg(16), seg(40)), glossMat('#ffffff', 0.35), 0, 0.53 - HIP, 0);
      ring.rotation.x = Math.PI / 2;
      body.add(ring);
      head.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), glossMat('#c8d4e6', 0.3), 0.12, RY * 1.4, 0));
      head.add(mesh(ellipsoid(0.03, 0.03, 0.03), glossMat(accC, 0.3), 0.12, RY * 1.4 + 0.08, 0));
      body.add(mesh(capsule(0.09, 0.26), glossMat('#ffffff', 0.35), 0, 0.38 - HIP, -0.17));
      break;
    }
    case 'fairy': {
      const capTex = paintTex(256, 256, (g) => {
        const n = 256;
        g.fillStyle = accC; g.fillRect(0, 0, n, n);
        g.fillStyle = '#ffffff';
        for (const [x, y, r] of [[0.2, 0.3, 0.07], [0.55, 0.2, 0.09], [0.8, 0.45, 0.06], [0.35, 0.65, 0.08], [0.7, 0.75, 0.06], [0.05, 0.8, 0.05]]) {
          g.beginPath(); g.arc(x * n, y * n, r * n, 0, Math.PI * 2); g.fill();
        }
      });
      capTex.userData.shared = false;
      capTex.wrapS = THREE.RepeatWrapping;
      const capG = lathe([[0.0001, 1.0], [0.55, 0.92], [0.92, 0.6], [1.08, 0.18], [1.0, 0.02], [0.7, 0.0], [0.0001, 0.02]], 48, 24);
      const cm = clothMat('#ffffff', capTex);
      cm.userData.base = accC;
      const cap = mesh(capG, cm, -0.03, RY * 0.66, -0.01);
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
      const fp = surfAt(shape, 0.72, 0.5, 0.01);
      head.add(mesh(ellipsoid(0.07, 0.07, 0.03), clothMat('#ff7aa8'), fp.pos.x, fp.pos.y, fp.pos.z));
      head.add(mesh(ellipsoid(0.025, 0.025, 0.02), clothMat('#ffd36e'), fp.pos.x + 0.005, fp.pos.y, fp.pos.z + 0.025));
      break;
    }
    case 'flower': {
      // 한쪽 귀 옆에 큰 꽃 한 송이(꽃잎 다섯 + 노란 가운데) + 작은 봉오리 하나 — 정수리에 흩뿌린 사탕처럼 안 보이게
      const petalM = clothMat(spec.accColor ?? '#ff9fc6');
      const fp = surfAt(shape, 0.36, 0.8, 0.014);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), fp.n);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        const pg = ellipsoid(0.044, 0.066, 0.018, 16, 10).translate(0, 0.058, 0).rotateZ(a).rotateX(-0.12).applyQuaternion(q).translate(fp.pos.x, fp.pos.y, fp.pos.z);
        head.add(mesh(pg, petalM));
      }
      head.add(mesh(ellipsoid(0.032, 0.032, 0.024, 14, 10).applyQuaternion(q).translate(fp.pos.x + fp.n.x * 0.012, fp.pos.y + fp.n.y * 0.012, fp.pos.z + fp.n.z * 0.012), clothMat('#ffd36e')));
      const bud = surfAt(shape, 0.08, 0.92, 0.01);
      head.add(mesh(ellipsoid(0.026, 0.03, 0.022, 12, 10), clothMat(lighten(spec.accColor ?? '#ff9fc6', 0.35)), bud.pos.x, bud.pos.y, bud.pos.z));
      break;
    }
    case 'bow': {
      const bp2 = headAt(shape, 0.55, 0.85, 1.0);
      for (const m of [-1, 1]) {
        const b = mesh(ellipsoid(0.075, 0.052, 0.035), accM, bp2.x + m * 0.065, bp2.y, bp2.z);
        b.rotation.z = m * 0.5;
        head.add(b);
      }
      head.add(mesh(ellipsoid(0.03, 0.03, 0.03), accM, bp2.x, bp2.y, bp2.z + 0.01));
      break;
    }
    default: break;
  }
  if (spec.acc2 === 'scarf' && spec.acc !== 'scarf') {
    const sc = mesh(new THREE.TorusGeometry(0.11, 0.045, seg(18), seg(40)), clothMat(spec.outfitColor ?? '#ff8f6e'), 0, 0.53 - HIP, 0.0);
    sc.rotation.x = Math.PI / 2;
    sc.scale.set(1.15, 1, 1);
    body.add(sc);
  }
  if (spec.acc === 'glasses' || spec.acc2 === 'glasses') {
    // 동그란 안경(눈 앞, 곡면 법선 쪽으로 살짝 띄워서)
    const fm = glossMat(spec.acc === 'glasses' ? accC : '#6a4a3a', 0.3);
    const gx = K === 'frog' ? 0.17 / RX : E.x, gy = K === 'frog' ? 0.75 : E.y;
    const pts: THREE.Vector3[] = [];
    for (const m of [-1, 1]) {
      const s = K === 'frog' ? { pos: V(m * 0.17, RY * 0.78, RZ * 0.36 + 0.13), n: V(0, 0, 1) } : surfAt(shape, m * gx, gy, 0.022);
      const rr = Math.max(E.w * RX, 0.05) * 1.15;
      const ring = mesh(new THREE.TorusGeometry(rr, 0.011, seg(12), seg(40)), fm, s.pos.x, s.pos.y, s.pos.z);
      ring.quaternion.setFromUnitVectors(V(0, 0, 1), s.n);
      head.add(ring);
      pts.push(s.pos);
      if (K !== 'frog') {
        // 다리: 테 바깥 끝에서 머리 곡면을 따라 귀 쪽으로(겉면 바로 위 — 옆에서 떠 보이지 않게)
        const edge = s.pos.clone().add(new THREE.Vector3(m, 0, 0).applyQuaternion(ring.quaternion).multiplyScalar(rr));
        const el0 = Math.asin(clamp(edge.y / RY, -0.9, 0.9));
        const az0 = Math.atan2(edge.x, edge.z);
        const path = [edge];
        for (let k = 1; k <= 5; k++) {
          const u = k / 5;
          path.push(headAt(shape, az0 + (m * 1.6 - az0) * u, el0 + (0.1 - el0) * u * 0.6, 1.002));
        }
        head.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), seg(16), 0.008, seg(6, 4), false), fm));
      }
    }
    const br = mesh(capsule(0.009, Math.max(0.02, pts[1].x - pts[0].x - Math.max(E.w * RX, 0.05) * 2.2)), fm, 0, (pts[0].y + pts[1].y) / 2 + 0.015, Math.max(pts[0].z, pts[1].z) + 0.02);
    br.rotation.z = Math.PI / 2;
    head.add(br);
  }
  if (spec.acc2 === 'bow' && spec.acc !== 'bow') {
    const bm = clothMat(spec.outfitColor ? darken(spec.outfitColor, 0.05) : '#ff7aa8');
    const bp2 = headAt(shape, -0.6, 0.82, 1.0);
    for (const m of [-1, 1]) {
      const b = mesh(ellipsoid(0.062, 0.044, 0.03), bm, bp2.x + m * 0.055, bp2.y, bp2.z);
      b.rotation.z = m * 0.5;
      head.add(b);
    }
    head.add(mesh(ellipsoid(0.026, 0.026, 0.026), bm, bp2.x, bp2.y, bp2.z + 0.01));
  }

  // 시설 NPC 시그니처 소품
  const sig = signatureOf(spec);
  if (sig) {
    const hand = new THREE.Group();
    hand.position.set(0, 0, 0);
    arms[1].add(hand);
    addProp(sig, { head, body, hand, R: [RX, RY, RZ], hip: HIP, accent: spec.accColor ?? spec.outfitColor ?? '#ff9fc6', mats: { skin: (c) => skinMat(c), cloth: (c) => clothMat(c), gloss: glossMat } });
  }

  // 정지 부품은 재질별로 합친다(얼굴 조각은 재질이 하나씩이라 그대로 남는다)
  // 무늬 없는 털·천은 부위마다 정점 색 한 메시로, 나머지(무늬 · 광택)는 재질별로
  const pal = paletteMat();
  const groups: THREE.Object3D[] = [bp, body, tail, head, ...arms, ...legs, ...ears.map((e) => e.g), ...arms.flatMap((a) => a.children.filter((c) => !(c as THREE.Mesh).isMesh))];
  if (beak) groups.push(beak);
  for (const c of head.children) if (!(c as THREE.Mesh).isMesh && c !== beak && !ears.some((e) => e.g === c)) groups.push(c);
  for (const g of groups) { mergePalette(g, pal); mergeByMaterial(g); }

  return { group, rig, body, head, arms, legs, tail, ears, beak, eyeMats, mouthMat, mouthDefault, philtrum, eyeStyle };
}

/** 표정 → 눈·입 */
function exprFace(e: AnimalExpr, mouthDefault: MouthMode): { eye: EyeMode; mouth: MouthMode } {
  const beakless = mouthDefault === 'none';
  const m = (x: MouthMode) => (beakless ? 'none' : x);
  switch (e) {
    case 'blink': return { eye: 'blink', mouth: m(mouthDefault) };
    case 'smile': return { eye: 'smile', mouth: m('grin') };
    case 'happy': return { eye: 'happy', mouth: m('grin') };
    case 'surprised': return { eye: 'surprised', mouth: m('o') };
    case 'sad': return { eye: 'sad', mouth: m('wavy') };
    default: return { eye: 'open', mouth: m(mouthDefault) };
  }
}

export function buildAnimal(spec: AnimalSpec): AnimalRig {
  const K = spec.kind;
  const root = new THREE.Group();
  root.name = `resident-${K}`;
  const near = buildCore(spec);
  near.group.name = 'lod-near';
  root.add(near.group);
  const { rig, body, head, arms, legs, tail, ears, beak } = near;

  // 말풍선 자리: 쉬는 자세 그대로의 꼭대기(투명 유리 헬멧은 뺀다)
  const box = new THREE.Box3();
  near.group.updateMatrixWorld(true);
  near.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    if (mat?.transparent && !mat.userData.decal) return;
    m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
  });
  const top = box.isEmpty() ? 1.2 : box.max.y;

  // 카메라가 파고들면 디더로 비치게(alphaHash: 정렬 없이 점점이 빠진다) — 얼굴 조각은 불투명도로
  const fadeMats = new Set<THREE.Material>();
  const decals = new Set<THREE.Material>();
  const collectFade = (g: THREE.Object3D) => g.traverse((o) => {
    const mm = (o as THREE.Mesh).material;
    if (!mm) return;
    for (const m of Array.isArray(mm) ? mm : [mm]) {
      if (m.userData.decal) decals.add(m);
      else if (!m.transparent) { m.alphaHash = true; fadeMats.add(m); }
    }
  });
  collectFade(near.group);
  let fadeCur = 1;
  // 깜빡임 주기 3~5 초(주민마다 다르게), 0.12 초만
  let hsh = 0;
  for (const ch of spec.fur + spec.kind + (spec.outfitColor ?? '')) hsh = (hsh * 31 + ch.charCodeAt(0)) % 9973;
  const blinkP = 3 + (hsh % 200) / 100, blinkPh = (hsh % 97) / 10;

  const S = spec.scale ?? 1;
  root.scale.setScalar(S);
  const headBaseY = head.position.y;
  const headRest = head.rotation.clone();
  let phase = 0, wave = 0, clap = 0;
  const cur = { lean: 0, bob: 0, yaw: 0, pitch: 0 };
  // 이차 움직임 상태
  let lastY = 0, lastVy = 0, sq = 0, sqV = 0, earA = 0, earV = 0, tailA = 0, tailV = 0, lastRigY = 0;
  let expr: AnimalExpr | null = null;
  let curEye: EyeMode = 'open', curMouth: MouthMode = near.mouthDefault;
  const setFace = (eye: EyeMode, mouth: MouthMode) => {
    if (eye !== curEye) {
      curEye = eye;
      const t = eyeTexture(near.eyeStyle, eye);
      for (const m of near.eyeMats) { m.map = t; m.emissiveMap = t; }
    }
    if (mouth !== curMouth && near.mouthMat) {
      curMouth = mouth;
      const t = mouthTexture(mouth, near.philtrum);
      near.mouthMat.map = t; near.mouthMat.emissiveMap = t;
    }
  };
  const _v = new THREE.Vector3();

  // 먼 LOD(처음 'far' 때 낮은 세밀도로 다시 만들어 굳힌다)
  let far: THREE.Group | null = null;
  let lod: 'near' | 'far' = 'near';
  const buildFar = () => {
    const c = withDetail(0.32, () => buildCore(spec));
    const g = bakeLod(c.group, (m) => !!m.userData.keepLod);
    // 곡률: 가까운 모습이 곡률 셰이더를 쓰면 같이(applyCurve 를 거친 재질은 캐시 키에 '|curve')
    let curved = false;
    near.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m) && m.customProgramCacheKey?.().includes('|curve')) curved = true; });
    if (curved) void import('../../core/curve').then(({ applyCurve }) => applyCurve(g));
    collectFade(g);
    for (const m of fadeMats) m.opacity = fadeCur;
    return g;
  };

  return {
    root,
    top: (top + 0.05) * S,
    head,
    setExpression(e) { expr = e; },
    prepareLod() {
      if (far) return false;
      far = buildFar();
      far.visible = lod === 'far';
      root.add(far);
      return true;
    },
    setLod(l) {
      if (l === lod) return;
      lod = l;
      if (l === 'far' && !far) { far = buildFar(); root.add(far); }
      near.group.visible = l === 'near';
      if (far) far.visible = l === 'far';
    },
    update(t, dt, p) {
      const snap = dt <= 0;
      const k = snap ? 1 : 1 - Math.exp(-dt * 10);
      if (!snap) phase += dt * (p.walk > 0.05 ? 4 + p.walk * 4.5 : 0);
      const walking = p.walk > 0.05;
      const sw = Math.sin(phase);
      if (lod === 'far') {
        // 먼 모습: 통통 걸음 들썩임 + 뒤뚱(좌우 기울기) + 서 있을 땐 숨쉬기 — 굳은 조각상처럼 미끄러지지 않게
        if (far) {
          far.position.y = walking ? 0.035 * Math.abs(sw) : 0.006 * Math.sin(t * 2.3 + S * 7);
          far.rotation.z = walking ? 0.07 * sw : 0.015 * Math.sin(t * 0.9 + S);
          far.rotation.x = walking ? 0.06 : 0;
        }
        return;
      }
      const breath = Math.sin(t * 2.3 + S * 7);
      wave = snap ? (p.wave ? 1 : 0) : lerp(wave, p.wave ? 1 : 0, 1 - Math.exp(-dt * 6));
      clap = snap ? (p.clap ? 1 : 0) : lerp(clap, p.clap ? 1 : 0, 1 - Math.exp(-dt * 8));
      const amp = walking ? 1 : 0;
      // 박수: 톡톡 뛰며 두 손을 앞에서 짝짝
      const hop = clap * Math.abs(Math.sin(t * 7)) * 0.035;
      cur.bob = lerp(cur.bob, walking ? 0.032 * Math.abs(sw) : p.talk ? 0.02 * Math.abs(Math.sin(t * 6)) : 0, k);
      cur.lean = lerp(cur.lean, walking ? 0.08 : 0, k);
      rig.position.y = cur.bob + hop;
      rig.rotation.x = cur.lean;
      rig.rotation.z = walking ? 0.05 * sw : 0;

      // 스쿼시&스트레치: 몸 전체 높이 변화(바깥 그릇의 깡충 + 박수 톡톡)로 쭉 · 착지에 찌부
      const y = root.position.y + rig.position.y;
      const h = snap ? 0 : Math.min(dt, 0.05);
      const vy = h > 0 ? (y - lastY) / h : 0;
      if (h > 0) {
        if (lastVy < -0.6 && vy > lastVy + 0.5) sqV -= Math.min(2.2, -lastVy * 0.9); // 착지 충격
        const target = clamp(Math.abs(vy) * 0.045, 0, 0.1) + (walking ? 0.02 * (Math.abs(sw) - 0.5) : 0);
        sqV += (-(sq - target) * 260 - sqV * 16) * h;
        sq += sqV * h;
        sq = clamp(sq, -0.16, 0.16);
      } else { sq = 0; sqV = 0; }
      lastY = y; lastVy = vy;
      rig.scale.set(1 - sq * 0.45, 1 + sq, 1 - sq * 0.45);

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

      // 쳐다보기: 목 돌릴 수 있는 만큼(좌우 ±0.8, 위아래 ±0.35)
      let wy = 0, wp = 0;
      if (p.look) {
        body.updateWorldMatrix(true, false);
        _v.copy(p.look);
        body.worldToLocal(_v);
        _v.y -= head.position.y;
        wy = clamp(Math.atan2(_v.x, _v.z), -0.8, 0.8);
        wp = clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.35, 0.35);
        if (Math.abs(Math.atan2(_v.x, _v.z)) > 2.2) { wy = 0; wp = 0; } // 등 뒤면 포기
      }
      const lk = snap ? 1 : 1 - Math.exp(-dt * 5);
      cur.yaw = lerp(cur.yaw, wy, lk);
      cur.pitch = lerp(cur.pitch, wp, lk);
      head.rotation.y = headRest.y + cur.yaw;
      head.rotation.z = (p.talk ? 0.09 * Math.sin(t * 3.1) : -0.05 * wave + 0.04 * Math.sin(t * 0.9 + S));
      head.rotation.x = (walking ? -0.06 : p.talk ? 0.04 * Math.sin(t * 4.2) : -0.1 * clap) - cur.pitch * 0.7;

      // 귀·꼬리: 몸 들썩임을 늦게 따라 출렁(스프링) + 가끔 귀 쫑긋
      const rigVy = h > 0 ? (rig.position.y + root.position.y - lastRigY) / h : 0;
      lastRigY = rig.position.y + root.position.y;
      if (h > 0) {
        earV += (-earA * 140 - earV * 9 + rigVy * 18) * h;
        earA += earV * h;
        tailV += (-(tailA - (walking ? 0.25 * Math.sin(phase * 2) : 0)) * 90 - tailV * 7) * h;
        tailA += tailV * h;
      } else { earA = 0; earV = 0; tailA = 0; tailV = 0; }
      const twitch = Math.max(0, Math.sin(t * 0.7 + hsh)) ** 40 * Math.sin(t * 30);
      for (const [i, e] of ears.entries()) {
        const side = i === 0 ? -1 : 1;
        e.g.rotation.x = e.base.x + clamp(earA, -0.5, 0.5) * 0.6 * e.flop + (i === 1 ? twitch * 0.12 : 0);
        e.g.rotation.z = e.base.z + side * clamp(earA, -0.5, 0.5) * 0.25 * e.flop - head.rotation.z * 0.6 * (e.flop - 1);
      }
      tail.rotation.y = 0.25 * Math.sin(t * (K === 'dog' ? 9 : 2.2)) * (1 + clap) + tailA;
      tail.rotation.x = clamp(-earA * 0.5, -0.3, 0.3);
      if (beak) beak.rotation.x = p.talk ? 0.22 * Math.max(0, Math.sin(t * 13)) : 0.12 * clap;

      // 얼굴
      if (expr && expr !== 'neutral') {
        const f = exprFace(expr, near.mouthDefault);
        setFace(f.eye, f.mouth);
      } else {
        const blink = (t + blinkPh) % blinkP < 0.12;
        const beakless = near.mouthDefault === 'none';
        let eye: EyeMode = 'open', mouth: MouthMode = near.mouthDefault;
        if (p.clap) { eye = 'happy'; mouth = 'grin'; }
        else if (p.happy) { eye = 'smile'; mouth = p.talk ? 'open' : 'grin'; }
        else if (blink) eye = 'blink';
        if (p.wave && !p.clap && !p.talk) mouth = 'smile';
        // 말할 때 입 뻐끔(0.2 초 간격)
        if (p.talk && !p.clap) mouth = (t * 5) % 1 < 0.55 ? 'open' : near.mouthDefault === 'w' ? 'w' : 'smile';
        if (expr === 'neutral') { eye = blink ? 'blink' : 'open'; mouth = near.mouthDefault; }
        setFace(eye, beakless ? 'none' : mouth);
      }
    },
    setFade(o) {
      if (Math.abs(o - fadeCur) < 0.01) return;
      fadeCur = o;
      for (const m of fadeMats) m.opacity = o;
      for (const m of decals) m.opacity = o;
    },
  };
}
