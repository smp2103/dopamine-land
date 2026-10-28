// 특별 NPC 모델(동물 빌더로는 안 되는 몸): 목길이 할머니(브라키오) · 프로 박사(프로토케라톱스) · 꾸물이(외계 문어) ·
// 삐뽀(관제탑 로봇) · 삐리(외계인 아기) · 티라미(아기 티라노, 티노 조카).
// 얼굴은 전부 art.ts 공용 눈·볼터치(GDD 7.2), 둥글고 통통한 실루엣 + 충분히 쪼갠 곡면.
// AnimalRig 과 같은 모양(root · top · update · setFade)이라 residents 런타임이 그대로 굴린다. 부수효과 없는 빌더.
import * as THREE from 'three';
import { ellipsoid, lathe, capsule, taperTube } from './geo';
import { mesh, mergeByMaterial } from './kit';
import { skinMat, clothMat, glossMat } from './animal/mats';
import { bakeLod, mergePalette } from './animal/lod';
import { paletteMat } from './animal/mats';
import { addBlush } from '../../core/art';
import { ellipsoid as ellipsoidG, withDetail } from './geo';
import { eyeTexture, cutPatch, decalMat, EYE_BOX, type EyeMode } from './animal/face';
import type { AnimalExpr } from './animal';
import type { AnimalRig, AnimalSpec, AnimalPose } from './animal';

export type SpecialKind = 'brachio' | 'proto' | 'octopus' | 'robot' | 'alien' | 'babydino';
export const SPECIAL_KINDS: readonly SpecialKind[] = ['brachio', 'proto', 'octopus', 'robot', 'alien', 'babydino'];
export const isSpecialKind = (k: unknown): k is SpecialKind => typeof k === 'string' && (SPECIAL_KINDS as readonly string[]).includes(k);

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function darken(c: string, k: number): string { return '#' + new THREE.Color(c).lerp(new THREE.Color('#3a2a3a'), k).getHexString(); }

/** 타원체 머리 겉면 위 점(+z 앞) — 눈·안경을 곡면에 딱 붙인다 */
function onEllipsoid(RX: number, RY: number, RZ: number, x: number, y: number, lift = 0.006) {
  const zz = RZ * Math.sqrt(Math.max(0.04, 1 - (x / RX) ** 2 - (y / RY) ** 2));
  const n = new THREE.Vector3(x / (RX * RX), y / (RY * RY), zz / (RZ * RZ)).normalize();
  return { pos: new THREE.Vector3(x, y, zz).addScaledVector(n, lift), n };
}

/** 특별 모델 눈: 동물 주민과 같은 그림 눈(말랑 그림체) — 머리 타원체 곡면에서 오린 조각 둘 */
interface SpecialEyes {
  left: THREE.Mesh;
  right: THREE.Mesh;
  blush: THREE.Mesh[];
  set: (m: EyeMode) => void;
}

/** 눈 두 개 + 볼터치를 타원체 머리(중심 c) 앞면에 */
function faceOn(head: THREE.Object3D, R: [number, number, number], o: { size: number; y: number; gap: number; c?: THREE.Vector3; name: string; iris?: string }): SpecialEyes {
  const c = o.c ?? new THREE.Vector3();
  const src = ellipsoidG(R[0], R[1], R[2], 64, 48);
  const st = { iris: o.iris ?? '#4a3040', noBlush: true };
  const mat = decalMat(eyeTexture(st, 'open'));
  const w = o.size * 0.42, h = o.size * 0.52;
  const { L, R: RR, T, B } = EYE_BOX;
  const make = (m: number) => {
    const cx = m * o.gap / 2, cy = o.y - c.y;
    const box = m > 0 ? { x0: cx - L * w, x1: cx + RR * w, y0: cy - B * h, y1: cy + T * h } : { x0: cx - RR * w, x1: cx + L * w, y0: cy - B * h, y1: cy + T * h };
    const e = new THREE.Mesh(cutPatch(src, box, m < 0, 0.002, 0.05), mat);
    e.position.copy(c);
    e.castShadow = false;
    e.renderOrder = 1;
    e.userData.eye = true;
    e.name = `${o.name}-${m < 0 ? 'L' : 'R'}`;
    head.add(e);
    return e;
  };
  const left = make(-1), right = make(1);
  src.dispose();
  // 볼터치(art 공용) — 눈 아래 바깥
  const blush = addBlush(head, o.size, { y: o.y - o.size * 0.62, gap: o.gap * 1.45 });
  for (const bm of blush) {
    const s = onEllipsoid(R[0], R[1], R[2], bm.position.x - c.x, bm.position.y - c.y, 0.004);
    bm.position.copy(s.pos).add(c);
    bm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.n);
  }
  let cur: EyeMode = 'open';
  return {
    left, right, blush,
    set(m) { if (m === cur) return; cur = m; const t = eyeTexture(st, m); mat.map = t; mat.emissiveMap = t; },
  };
}

/** 동그란 안경(눈 앞) */
function glasses(head: THREE.Object3D, R: [number, number, number], o: { size: number; y: number; gap: number; c?: THREE.Vector3; color: string }) {
  const fm = glossMat(o.color, 0.3);
  const c = o.c ?? new THREE.Vector3();
  for (const m of [-1, 1]) {
    const s = onEllipsoid(R[0], R[1], R[2], m * o.gap / 2, o.y - c.y, 0.035);
    const ring = mesh(new THREE.TorusGeometry(o.size * 0.64, 0.011, 12, 40), fm, s.pos.x + c.x, s.pos.y + c.y, s.pos.z + c.z);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.n);
    head.add(ring);
  }
  const bz = onEllipsoid(R[0], R[1], R[2], 0, o.y - c.y, 0.05).pos.z + c.z;
  const br = mesh(capsule(0.009, Math.max(0.02, o.gap - o.size * 1.25)), fm, c.x, o.y + 0.012, bz);
  br.rotation.z = Math.PI / 2;
  head.add(br);
}

/** 통통한 팔(어깨 피벗, 아래로 늘어진다) */
function arm(mat: THREE.Material, hand: THREE.Material, len = 0.16, r = 0.05): THREE.Group {
  const a = new THREE.Group();
  a.add(mesh(capsule(r, len), mat, 0, -len * 0.55, 0));
  a.add(mesh(ellipsoid(r * 1.15, r * 1.2, r * 1.1), hand, 0, -len * 1.05, 0.004));
  return a;
}

/** 다리(엉덩이 피벗) */
function leg(mat: THREE.Material, foot: THREE.Material, hip: number, r = 0.06, footZ = 0.02): THREE.Group {
  const g = new THREE.Group();
  g.position.y = hip;
  g.add(mesh(ellipsoid(r * 1.25, r * 0.95, r * 1.6), foot, 0, 0.055 - hip, footZ));
  g.add(mesh(capsule(r, hip - 0.03), mat, 0, (hip - 0.03) / 2 + 0.02 - hip, 0));
  return g;
}

interface Built {
  root: THREE.Group;
  rig: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  arms: THREE.Group[];
  legs: THREE.Group[];
  tail: THREE.Group | null;
  eyes: SpecialEyes;
  eyeSize: number;
  top: number;
  /** 다리 넷(브라키오) — 대각선끼리 같이 */
  quad?: boolean;
  /** 정지 부품 묶음(재질별로 합친다) */
  merge: THREE.Object3D[];
  extra?: (t: number, dt: number, p: AnimalPose, k: { wave: number; clap: number; walk: boolean }) => void;
}

/** 공통 몸짓(동물 빌더와 같은 박자): 걷기·대화·손 흔들기·박수·숨쉬기·깜빡임 + 근접 디더 */
function finish(b: Built, spec: AnimalSpec): AnimalRig {
  const { root, rig, body, head, arms, legs, tail, eyes } = b;
  const keep = [eyes.left, eyes.right, ...eyes.blush];
  for (const k of keep) k.parent?.remove(k);
  const pal = paletteMat();
  for (const g of b.merge) { mergePalette(g, pal); mergeByMaterial(g); }
  for (const g of [body]) { mergePalette(g, pal); mergeByMaterial(g); }
  for (const k of keep) head.add(k);
  const fadeMats = new Set<THREE.Material>();
  root.traverse((o) => {
    const mm = (o as THREE.Mesh).material;
    if (!mm || keep.includes(o as THREE.Mesh)) return;
    for (const m of Array.isArray(mm) ? mm : [mm]) if (!m.transparent) { m.alphaHash = true; fadeMats.add(m); }
  });
  let hsh = 0;
  for (const ch of spec.fur + spec.kind + (spec.accColor ?? '')) hsh = (hsh * 31 + ch.charCodeAt(0)) % 9973;
  const blinkP = 3 + (hsh % 200) / 100, blinkPh = (hsh % 97) / 10;
  const S = spec.scale ?? 1;
  root.scale.setScalar(S);
  const headY = head.position.y;
  const armRest = arms.map((a) => a.rotation.z);
  let phase = 0, wave = 0, clap = 0, happyOn = false, fadeCur = 1;
  let expr: AnimalExpr | null = null;
  const lowBuild = pendingLow;
  pendingLow = null;
  const cur = { bob: 0, lean: 0 };
  // 먼 LOD: 처음 'far' 때 지금 모습을 굳힌다(무늬·얼굴 그림은 재질 그대로 따로)
  let far: THREE.Group | null = null;
  let lod: 'near' | 'far' = 'near';
  rig.name = 'lod-near';
  return {
    root,
    top: b.top * S,
    head,
    setExpression(e) { expr = e; },
    setLod(l) {
      if (l === lod) return;
      lod = l;
      if (l === 'far' && !far) {
        // 낮은 세밀도로 한 벌 더 만들어(같은 빌더) 굳힌다 — 없으면 지금 모습 그대로
        const low = lowBuild?.() ?? null;
        const src = low?.getObjectByName('lod-near') ?? rig;
        far = bakeLod(src, (m) => !!m.userData.eye || !!(m.material as THREE.MeshStandardMaterial).map || m.name.startsWith('blush-'));
        far.position.copy(rig.position);
        root.add(far);
      }
      rig.visible = l === 'near';
      if (far) far.visible = l === 'far';
    },
    update(t, dt, p) {
      if (lod === 'far') return;
      const snap = dt <= 0;
      const k = snap ? 1 : 1 - Math.exp(-dt * 10);
      if (!snap) phase += dt * (p.walk > 0.05 ? 4 + p.walk * 4.5 : 0);
      const walking = p.walk > 0.05;
      const sw = Math.sin(phase);
      const breath = Math.sin(t * 2.3 + S * 7);
      wave = snap ? (p.wave ? 1 : 0) : lerp(wave, p.wave ? 1 : 0, 1 - Math.exp(-dt * 6));
      clap = snap ? (p.clap ? 1 : 0) : lerp(clap, p.clap ? 1 : 0, 1 - Math.exp(-dt * 8));
      const hop = clap * Math.abs(Math.sin(t * 7)) * 0.035;
      cur.bob = lerp(cur.bob, walking ? 0.03 * Math.abs(sw) : p.talk ? 0.02 * Math.abs(Math.sin(t * 6)) : 0, k);
      cur.lean = lerp(cur.lean, walking && !b.quad ? 0.07 : 0, k);
      rig.position.y = cur.bob + hop;
      rig.rotation.x = cur.lean;
      rig.rotation.z = walking && !b.quad ? 0.05 * sw : 0;
      // 숨쉬기(1.00 ↔ 1.03 쯤) — 몸통만
      body.scale.set(1 + 0.012 * breath, 1 + 0.018 * breath, 1 + 0.012 * breath);
      head.position.y = headY + 0.01 * breath;
      if (b.quad) {
        // 대각선 두 쌍(앞왼·뒤오 / 앞오·뒤왼)
        legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * 0.35 * sw * (walking ? 1 : 0); });
      } else if (legs.length >= 2) {
        legs[0].rotation.x = 0.55 * sw * (walking ? 1 : 0);
        legs[1].rotation.x = -0.55 * sw * (walking ? 1 : 0);
      }
      const talkG = p.talk ? Math.sin(t * 5) : 0;
      const clapZ = 0.12 + 0.32 * Math.abs(Math.sin(t * 13));
      if (arms.length >= 2) {
        const r0 = armRest[0], r1 = armRest[1];
        const a1x = 0.6 * sw * (walking ? 1 : 0) - 0.35 * Math.max(0, talkG);
        arms[1].rotation.set(lerp(a1x, -1.15, clap), 0, lerp(r1 + 0.02 * breath + 0.25 * Math.max(0, talkG), clapZ, clap));
        const waveZ = -(2.5 + 0.32 * Math.sin(t * 7));
        const restZ = r0 - 0.02 * breath - (p.talk ? 0.3 * Math.max(0, -talkG) : 0);
        arms[0].rotation.set(lerp(lerp(-0.6 * sw * (walking ? 1 : 0), -0.3, wave), -1.15, clap), 0, lerp(lerp(restZ, waveZ, wave), -clapZ, clap));
      }
      head.rotation.z = p.talk ? 0.09 * Math.sin(t * 3.1) : -0.05 * wave + 0.04 * Math.sin(t * 0.9 + S);
      head.rotation.x = walking ? -0.05 : p.talk ? 0.05 * Math.sin(t * 4.2) : -0.1 * clap;
      if (tail) tail.rotation.y = 0.22 * Math.sin(t * 2.2) * (1 + clap);
      b.extra?.(t, dt, p, { wave, clap, walk: walking });
      const blink = (t + blinkPh) % blinkP < 0.12;
      const happy = !!p.clap;
      happyOn = happy;
      eyes.set(expr && expr !== 'neutral' ? EXPR_EYE[expr] : happy ? 'happy' : blink ? 'blink' : p.happy ? 'smile' : 'open');
    },
    setFade(o) {
      if (Math.abs(o - fadeCur) < 0.01) return;
      fadeCur = o;
      for (const m of fadeMats) m.opacity = o;
    },
  };
}

const EXPR_EYE: Record<AnimalExpr, EyeMode> = { neutral: 'open', blink: 'blink', smile: 'smile', happy: 'happy', surprised: 'surprised', sad: 'sad' };
/** 먼 LOD 용 낮은 세밀도 빌더(buildSpecial 이 finish 직전에 끼워 둔다) */
let pendingLow: (() => THREE.Group) | null = null;

function base(name: string) {
  const root = new THREE.Group();
  root.name = `resident-${name}`;
  const rig = new THREE.Group();
  root.add(rig);
  const body = new THREE.Group();
  rig.add(body);
  return { root, rig, body };
}

// ───────────── 목길이 할머니(브라키오사우루스) ─────────────
function brachio(spec: AnimalSpec): AnimalRig {
  const { root, rig, body } = base('brachio');
  const skin = skinMat(spec.fur), light = skinMat(spec.light), mark = skinMat(spec.mark ?? darken(spec.fur, 0.18));
  const nail = glossMat('#fff4e2', 0.4);
  const shawl = clothMat(spec.accColor ?? '#ff9fb8');
  // 통통한 몸통 + 밝은 배 + 등 점무늬
  const torso = new THREE.Group();
  body.add(torso);
  torso.add(mesh(ellipsoid(0.44, 0.36, 0.56, 48, 32), skin, 0, 0.66, 0));
  torso.add(mesh(ellipsoid(0.33, 0.24, 0.42, 40, 24), light, 0, 0.56, 0.06));
  for (const [x, z, r] of [[0.16, -0.1, 0.09], [-0.18, 0.08, 0.075], [0.05, 0.2, 0.065], [-0.08, -0.28, 0.08], [0.2, 0.22, 0.06]] as const) {
    const s = mesh(ellipsoid(r, r * 0.35, r), mark, x, 0.66 + 0.34 * Math.sqrt(Math.max(0, 1 - (x / 0.44) ** 2 - (z / 0.56) ** 2)), z);
    torso.add(s);
  }
  // 다리 넷(짧고 굵게, 발톱 세 개)
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.25, 0.3], [0.25, 0.3], [-0.25, -0.3], [0.25, -0.3]] as const) {
    const g = new THREE.Group();
    g.position.set(x, 0.46, z);
    g.add(mesh(capsule(0.115, 0.46), skin, 0, -0.22, 0));
    g.add(mesh(ellipsoid(0.13, 0.07, 0.14), skin, 0, -0.42, 0.01));
    for (const dx of [-0.055, 0, 0.055]) g.add(mesh(ellipsoid(0.03, 0.025, 0.025), nail, dx, -0.44, 0.13));
    rig.add(g);
    legs.push(g);
  }
  // 긴 목: 굵기가 줄어드는 구슬을 곡선으로(합치면 매끈한 한 덩이)
  const neck = new THREE.Group();
  neck.position.set(0, 0.8, 0.4);
  body.add(neck);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.32, 0.12), new THREE.Vector3(0, 0.7, 0.16), new THREE.Vector3(0, 0.98, 0.08)]);
  for (let i = 0; i <= 12; i++) {
    const u = i / 12, p = curve.getPoint(u), r = lerp(0.19, 0.12, u);
    neck.add(mesh(ellipsoid(r, r * 1.05, r, 28, 18), skin, p.x, p.y, p.z));
  }
  // 목 아래 뜨개 숄(둥근 고리) + 브로치
  const sh = mesh(new THREE.TorusGeometry(0.2, 0.07, 16, 40), shawl, 0, 0.1, 0.02);
  sh.rotation.x = Math.PI / 2 - 0.45;
  neck.add(sh);
  neck.add(mesh(ellipsoid(0.04, 0.04, 0.02), glossMat('#ffd36e', 0.3), 0, 0.03, 0.24));
  // 머리
  const head = new THREE.Group();
  const HP = curve.getPoint(1);
  head.position.set(HP.x, HP.y + 0.1, HP.z + 0.04);
  neck.add(head);
  const R: [number, number, number] = [0.2, 0.17, 0.22];
  head.add(mesh(ellipsoid(...R, 40, 28), skin));
  // 주둥이(동글) + 콧구멍 점
  head.add(mesh(ellipsoid(0.15, 0.1, 0.12, 32, 20), light, 0, -0.06, 0.13));
  for (const m of [-1, 1]) head.add(mesh(ellipsoid(0.014, 0.01, 0.01), skinMat('#8a6a6a'), m * 0.04, -0.03, 0.245));
  // 정수리 꽃 한 송이(할머니 멋)
  const petal = clothMat('#fff1a8');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    head.add(mesh(ellipsoid(0.03, 0.012, 0.03), petal, 0.06 + Math.cos(a) * 0.035, R[1] * 0.95, -0.02 + Math.sin(a) * 0.035));
  }
  head.add(mesh(ellipsoid(0.02, 0.014, 0.02), glossMat('#ffb347', 0.4), 0.06, R[1] * 0.97, -0.02));
  const eyeY = 0.03;
  const eyes = faceOn(head, R, { size: 0.1, y: eyeY, gap: 0.16, name: 'eye-brachio' });
  glasses(head, R, { size: 0.1, y: eyeY, gap: 0.16, color: '#c99a5e' });
  // 꼬리(뒤로 길게, 땅 쪽으로 처짐)
  const tail = new THREE.Group();
  tail.position.set(0, 0.66, -0.5);
  body.add(tail);
  tail.add(mesh(taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.08, -0.22), new THREE.Vector3(0.04, -0.24, -0.46), new THREE.Vector3(0.12, -0.36, -0.66)], 0.15, 28, 14), skin));
  const top = 0.8 + HP.y + 0.1 + R[1] + 0.12;
  return finish({
    root, rig, body, head, arms: [], legs, tail, eyes, eyeSize: 0.1, top, quad: true,
    merge: [torso, head, tail, ...legs],
    extra: (t, _dt, p, k) => {
      // 목은 느긋하게 살랑, 손 흔들기 대신 고개 끄덕끄덕
      neck.rotation.x = -0.04 + 0.03 * Math.sin(t * 0.8) + k.wave * 0.12 * Math.sin(t * 5) + (p.talk ? 0.04 * Math.sin(t * 3.3) : 0);
      neck.rotation.z = 0.05 * Math.sin(t * 0.6);
    },
  }, spec);
}

// ───────────── 프로 박사(프로토케라톱스, 흰 연구복 + 안경) ─────────────
function proto(spec: AnimalSpec): AnimalRig {
  const { root, rig, body } = base('proto');
  const skin = skinMat(spec.fur), light = skinMat(spec.light), mark = skinMat(spec.mark ?? darken(spec.fur, 0.2));
  const coat = clothMat(spec.accColor ?? '#fffaf2');
  const HIP = 0.24;
  const legs = [-1, 1].map((m) => { const l = leg(skin, mark, HIP, 0.068, 0.03); l.position.x = m * 0.1; rig.add(l); return l; });
  body.position.y = HIP;
  const bp = new THREE.Group();
  bp.position.y = -HIP;
  body.add(bp);
  bp.add(mesh(ellipsoid(0.18, 0.15, 0.16), skin, 0, 0.27, 0));
  // 연구복(아래가 살짝 퍼진 회전체) + 단추 + 주머니
  const torso = mesh(lathe([[0, 0.18], [0.15, 0.19], [0.21, 0.24], [0.2, 0.34], [0.175, 0.44], [0.13, 0.52], [0.06, 0.55], [0, 0.56]], 64, 40), coat);
  torso.scale.z = 0.9;
  bp.add(torso);
  for (const y of [0.46, 0.38, 0.3]) bp.add(mesh(ellipsoid(0.016, 0.016, 0.01), glossMat('#8fd3ff', 0.3), 0, y, 0.19));
  bp.add(mesh(ellipsoid(0.05, 0.04, 0.012), clothMat('#dfe8ff'), 0.1, 0.42, 0.165));
  // 꼬리(굵고 짧게, 땅에 닿을락말락)
  const tail = new THREE.Group();
  tail.position.set(0, 0.26, -0.14);
  bp.add(tail);
  tail.add(mesh(taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.06, -0.14), new THREE.Vector3(0, -0.14, -0.3), new THREE.Vector3(0.03, -0.2, -0.42)], 0.1, 24, 12), skin));
  // 팔(연구복 소매 + 손)
  const arms = [-1, 1].map((m) => {
    const a = arm(coat, skin, 0.16, 0.05);
    a.position.set(m * 0.15, 0.45 - HIP, 0);
    a.rotation.z = m * 0.38;
    body.add(a);
    return a;
  });
  // 머리 + 프릴 + 부리 + 코 뿔
  const head = new THREE.Group();
  const R: [number, number, number] = [0.31, 0.27, 0.3];
  head.position.set(0, 0.55 + R[1] * 0.85 - HIP, 0.02);
  body.add(head);
  head.add(mesh(ellipsoid(...R, 48, 32), skin));
  head.add(mesh(ellipsoid(0.17, 0.12, 0.14, 32, 20), light, 0, -0.1, 0.2));
  const beak = mesh(ellipsoid(0.07, 0.06, 0.08, 24, 16), glossMat(darken(spec.fur, 0.3), 0.4), 0, -0.12, 0.33);
  beak.rotation.x = 0.4;
  head.add(beak);
  head.add(mesh(ellipsoid(0.035, 0.045, 0.035), mark, 0, 0.0, 0.3));
  // 프릴: 머리 뒤 둥근 방패 + 가장자리 점
  const frill = mesh(ellipsoid(0.36, 0.3, 0.05, 40, 20), mark, 0, 0.12, -0.16);
  frill.rotation.x = -0.35;
  head.add(frill);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.1 + 0.8 * (i / 8));
    head.add(mesh(ellipsoid(0.035, 0.035, 0.03), light, Math.cos(a) * 0.32, 0.12 + Math.sin(a) * 0.26, -0.12 - Math.sin(a) * 0.08));
  }
  const eyeY = 0.04;
  const eyes = faceOn(head, R, { size: 0.12, y: eyeY, gap: 0.21, name: 'eye-proto' });
  glasses(head, R, { size: 0.12, y: eyeY, gap: 0.21, color: '#7a5a3a' });
  const top = 0.55 + R[1] * 1.85 + 0.12;
  return finish({ root, rig, body, head, arms, legs, tail, eyes, eyeSize: 0.12, top, merge: [bp, tail, head, ...arms, ...legs] }, spec);
}

// ───────────── 꾸물이(외계 문어, 다리 여덟으로 커피) ─────────────
function octopus(spec: AnimalSpec): AnimalRig {
  const { root, rig, body } = base('octopus');
  const skin = skinMat(spec.fur), light = skinMat(spec.light);
  const glow = new THREE.MeshPhysicalMaterial({ color: spec.accColor ?? '#9ef0d2', emissive: spec.accColor ?? '#9ef0d2', emissiveIntensity: 0.6, roughness: 0.3 });
  // 둥근 머리몸(문어는 머리가 곧 몸) + 반점
  const head = new THREE.Group();
  const R: [number, number, number] = [0.37, 0.4, 0.35];
  head.position.y = 0.72;
  body.add(head);
  head.add(mesh(ellipsoid(...R, 48, 34), skin));
  for (const [x, y, r] of [[0.2, 0.22, 0.05], [-0.24, 0.16, 0.04], [0.05, 0.34, 0.045], [-0.1, 0.28, 0.035], [0.28, 0.02, 0.035]] as const) {
    const s = onEllipsoid(R[0], R[1], R[2], x, y, -0.01);
    const d = mesh(ellipsoid(r, r, r * 0.4), light, s.pos.x, s.pos.y, -s.pos.z);
    d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(s.n.x, s.n.y, -s.n.z));
    head.add(d);
  }
  // 더듬이 둘(반짝 구슬)
  const ant: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(m * 0.12, R[1] * 0.92, 0);
    a.rotation.z = -m * 0.35;
    a.add(mesh(capsule(0.014, 0.2), skin, 0, 0.09, 0));
    a.add(mesh(ellipsoid(0.04, 0.04, 0.04), glow, 0, 0.2, 0));
    head.add(a);
    ant.push(a);
  }
  // 다리 여덟: 바깥으로 퍼졌다 끝이 돌돌(앞 둘은 팔 — 손 흔들기·커피잔)
  const tent: THREE.Group[] = [];
  const arms: THREE.Group[] = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    const g = new THREE.Group();
    g.position.set(Math.sin(a) * 0.2, 0.42, Math.cos(a) * 0.18);
    g.rotation.y = a;
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.2, 0.1), new THREE.Vector3(0, -0.34, 0.26), new THREE.Vector3(0, -0.32, 0.38), new THREE.Vector3(0, -0.24, 0.36)];
    g.add(mesh(taperTube(pts, 0.085, 28, 12), skin));
    // 빨판 점 두 개
    g.add(mesh(ellipsoid(0.02, 0.008, 0.02), light, 0, -0.33, 0.2));
    g.add(mesh(ellipsoid(0.016, 0.007, 0.016), light, 0, -0.36, 0.3));
    body.add(g);
    tent.push(g);
  }
  for (const m of [-1, 1]) {
    // 앞 팔: 어깨 피벗 + 둥근 끝
    const a = new THREE.Group();
    a.position.set(m * 0.3, 0.6, 0.12);
    a.rotation.z = m * 0.5;
    a.add(mesh(taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(m * 0.02, -0.12, 0.02), new THREE.Vector3(m * 0.0, -0.24, 0.06)], 0.06, 20, 10), skin));
    a.add(mesh(ellipsoid(0.045, 0.045, 0.045), skin, 0, -0.25, 0.06));
    body.add(a);
    arms.push(a);
  }
  // 오른손(+x)엔 별다방 커피잔
  const cup = new THREE.Group();
  cup.position.set(0, -0.3, 0.1);
  cup.add(mesh(new THREE.CylinderGeometry(0.06, 0.048, 0.1, 24), glossMat('#fffaf2', 0.3), 0, 0, 0));
  cup.add(mesh(new THREE.CircleGeometry(0.055, 24).rotateX(-Math.PI / 2), skinMat('#c98f55'), 0, 0.05, 0));
  cup.add(mesh(new THREE.TorusGeometry(0.03, 0.01, 8, 16), glossMat('#fffaf2', 0.3), 0.065, 0, 0));
  arms[1].add(cup);
  const eyeY = 0.0;
  const eyes = faceOn(head, R, { size: 0.15, y: eyeY, gap: 0.24, name: 'eye-octopus' });
  // 웃는 입(작은 동그라미)
  const mouth = mesh(ellipsoid(0.03, 0.02, 0.01), skinMat('#ff8fa0'), 0, -0.13, onEllipsoid(R[0], R[1], R[2], 0, -0.13).pos.z);
  head.add(mouth);
  const top = 0.72 + R[1] + 0.24;
  return finish({
    root, rig, body, head, arms, legs: [], tail: null, eyes, eyeSize: 0.15, top,
    merge: [head, ...tent],
    extra: (t, _dt, p) => {
      // 다리가 물결치듯 꾸물꾸물(걸을 땐 더 빨리)
      const sp = p.walk > 0.05 ? 7 : 2.2;
      tent.forEach((g, i) => { g.rotation.x = 0.12 * Math.sin(t * sp + i * 0.8); });
      ant.forEach((a, i) => { a.rotation.x = 0.15 * Math.sin(t * 3 + i * 1.7); });
      glow.emissiveIntensity = 0.45 + 0.3 * Math.max(0, Math.sin(t * 2.6));
    },
  }, spec);
}

// ───────────── 삐뽀(관제탑 로봇, 화면 얼굴 + 안테나 불빛) ─────────────
function robot(spec: AnimalSpec): AnimalRig {
  const { root, rig, body } = base('robot');
  const shell = glossMat(spec.fur, 0.3), trim = glossMat(spec.accColor ?? '#ff7a8a', 0.35);
  const screen = new THREE.MeshPhysicalMaterial({ color: spec.light, emissive: spec.light, emissiveIntensity: 0.35, roughness: 0.25, clearcoat: 0.6 });
  const lamp = new THREE.MeshPhysicalMaterial({ color: spec.accColor ?? '#ff7a8a', emissive: spec.accColor ?? '#ff7a8a', emissiveIntensity: 0.8, roughness: 0.3 });
  const HIP = 0.2;
  // 통통 다리(둥근 장화)
  const legs = [-1, 1].map((m) => { const l = leg(shell, trim, HIP, 0.07, 0.03); l.position.x = m * 0.1; rig.add(l); return l; });
  body.position.y = HIP;
  const bp = new THREE.Group();
  bp.position.y = -HIP;
  body.add(bp);
  // 동글 몸통(위가 좁은 캡슐) + 가슴 버튼 셋 + 허리띠
  const torso = mesh(lathe([[0, 0.17], [0.16, 0.18], [0.21, 0.24], [0.215, 0.34], [0.19, 0.46], [0.13, 0.53], [0, 0.55]], 64, 40), shell);
  bp.add(torso);
  bp.add(mesh(new THREE.TorusGeometry(0.205, 0.022, 12, 48).rotateX(Math.PI / 2), trim, 0, 0.27, 0));
  for (const [i, c] of (['#8fd3ff', '#ffe58a', '#ff9fb8'] as const).entries()) bp.add(mesh(ellipsoid(0.026, 0.026, 0.014), glossMat(c, 0.3), -0.06 + i * 0.06, 0.4, 0.19));
  const arms = [-1, 1].map((m) => {
    const a = arm(shell, trim, 0.15, 0.048);
    a.position.set(m * 0.17, 0.46 - HIP, 0);
    a.rotation.z = m * 0.38;
    body.add(a);
    return a;
  });
  // 머리: 둥근 캡슐 머리 + 앞 화면 + 귀 레이더
  const head = new THREE.Group();
  const R: [number, number, number] = [0.32, 0.25, 0.28];
  head.position.set(0, 0.56 + R[1] * 0.95 - HIP, 0);
  body.add(head);
  head.add(mesh(ellipsoid(...R, 48, 32), shell));
  const scr = mesh(ellipsoid(0.25, 0.18, 0.06, 40, 24), screen, 0, -0.01, R[2] - 0.035);
  head.add(scr);
  const ears: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(m * R[0] * 0.98, 0.02, 0);
    e.rotation.z = -m * Math.PI / 2;
    const dish = mesh(new THREE.SphereGeometry(0.08, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), trim, 0, 0.02, 0);
    e.add(dish);
    e.add(mesh(ellipsoid(0.018, 0.04, 0.018), shell, 0, 0.06, 0));
    head.add(e);
    ears.push(e);
  }
  // 안테나 + 깜빡이 등
  head.add(mesh(capsule(0.016, 0.16), shell, 0, R[1] + 0.07, 0));
  const bulb = mesh(ellipsoid(0.05, 0.05, 0.05, 24, 16), lamp, 0, R[1] + 0.17, 0);
  head.add(bulb);
  // 눈은 화면 위에(화면 면 좌표)
  const SR: [number, number, number] = [0.25, 0.18, 0.06];
  const sc = new THREE.Vector3(0, -0.01, R[2] - 0.035);
  const eyes = faceOn(head, SR, { size: 0.11, y: sc.y + 0.02, gap: 0.17, c: sc, name: 'eye-robot' });
  const top = 0.56 + R[1] * 1.95 + 0.26 - HIP + HIP;
  return finish({
    root, rig, body, head, arms, legs, tail: null, eyes, eyeSize: 0.11, top,
    merge: [bp, ...arms, ...legs],
    extra: (t) => {
      ears.forEach((e, i) => { e.rotation.y = t * 1.6 * (i ? 1 : -1); });
      lamp.emissiveIntensity = (t % 1.4) < 0.5 ? 1.1 : 0.35;
      screen.emissiveIntensity = 0.3 + 0.06 * Math.sin(t * 9);
    },
  }, spec);
}

// ───────────── 삐리(외계인 아기 — 큰 머리, 별 더듬이) ─────────────
function alien(spec: AnimalSpec): AnimalRig {
  const { root, rig, body } = base('alien');
  const skin = skinMat(spec.fur), light = skinMat(spec.light);
  const suit = clothMat(spec.outfitColor ?? spec.accColor ?? '#c9b6f2');
  const star = new THREE.MeshPhysicalMaterial({ color: '#ffe58a', emissive: '#ffd36e', emissiveIntensity: 0.6, roughness: 0.3 });
  const HIP = 0.18;
  const legs = [-1, 1].map((m) => { const l = leg(skin, suit, HIP, 0.055, 0.02); l.position.x = m * 0.08; rig.add(l); return l; });
  body.position.y = HIP;
  const bp = new THREE.Group();
  bp.position.y = -HIP;
  body.add(bp);
  // 작은 몸 + 별 무늬 우주복 + 동그란 목깃
  bp.add(mesh(lathe([[0, 0.15], [0.12, 0.16], [0.16, 0.22], [0.15, 0.32], [0.11, 0.4], [0.05, 0.43], [0, 0.44]], 56, 32), suit));
  bp.add(mesh(new THREE.TorusGeometry(0.075, 0.025, 12, 32).rotateX(Math.PI / 2), light, 0, 0.42, 0));
  bp.add(mesh(ellipsoid(0.04, 0.04, 0.012), star, 0, 0.32, 0.15));
  const arms = [-1, 1].map((m) => {
    const a = arm(skin, skin, 0.13, 0.038);
    a.position.set(m * 0.12, 0.37 - HIP, 0);
    a.rotation.z = m * 0.4;
    body.add(a);
    return a;
  });
  const head = new THREE.Group();
  const R: [number, number, number] = [0.36, 0.31, 0.32];
  head.position.set(0, 0.43 + R[1] * 0.9 - HIP, 0);
  body.add(head);
  head.add(mesh(ellipsoid(...R, 48, 32), skin));
  // 볼록 이마 + 더듬이 둘(끝에 별 구슬)
  head.add(mesh(ellipsoid(0.2, 0.08, 0.1), light, 0, R[1] * 0.55, R[2] * 0.62));
  const ant: THREE.Group[] = [];
  for (const m of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(m * 0.14, R[1] * 0.88, 0);
    a.rotation.z = -m * 0.45;
    a.add(mesh(taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.08, 0.02), new THREE.Vector3(m * 0.02, 0.17, 0.0)], 0.022, 14, 8), skin));
    a.add(mesh(ellipsoid(0.045, 0.045, 0.045, 20, 14), star, m * 0.02, 0.2, 0));
    head.add(a);
    ant.push(a);
  }
  const eyes = faceOn(head, R, { size: 0.16, y: 0.0, gap: 0.24, name: 'eye-alien' });
  head.add(mesh(ellipsoid(0.025, 0.015, 0.01), skinMat('#ff8fa0'), 0, -0.14, onEllipsoid(R[0], R[1], R[2], 0, -0.14).pos.z));
  const top = 0.43 + R[1] * 1.9 + 0.26 - HIP + HIP;
  return finish({
    root, rig, body, head, arms, legs, tail: null, eyes, eyeSize: 0.16, top,
    merge: [bp, ...arms, ...legs],
    extra: (t, _dt, _p, k) => {
      ant.forEach((a, i) => { a.rotation.x = 0.2 * Math.sin(t * 3.4 + i * 1.3) + k.wave * 0.2; });
      star.emissiveIntensity = 0.45 + 0.3 * Math.max(0, Math.sin(t * 3));
    },
  }, spec);
}

// ───────────── 티라미(아기 티라노 — 큰 머리, 짧은 팔, 등 뾰족) ─────────────
function babydino(spec: AnimalSpec): AnimalRig {
  const { root, rig, body } = base('babydino');
  const skin = skinMat(spec.fur), light = skinMat(spec.light), mark = skinMat(spec.mark ?? darken(spec.fur, 0.15));
  const HIP = 0.22;
  const legs = [-1, 1].map((m) => {
    const l = new THREE.Group();
    l.position.set(m * 0.11, HIP, 0);
    l.add(mesh(ellipsoid(0.085, 0.11, 0.09), skin, 0, -0.04, 0));
    l.add(mesh(ellipsoid(0.07, 0.04, 0.1), skin, 0, 0.04 - HIP, 0.04));
    for (const dx of [-0.035, 0.035]) l.add(mesh(ellipsoid(0.02, 0.018, 0.02), glossMat('#fff4e2', 0.4), dx, 0.035 - HIP, 0.13));
    rig.add(l);
    return l;
  });
  body.position.y = HIP;
  const bp = new THREE.Group();
  bp.position.y = -HIP;
  body.add(bp);
  bp.add(mesh(lathe([[0, 0.14], [0.15, 0.16], [0.2, 0.24], [0.19, 0.34], [0.15, 0.44], [0.09, 0.5], [0, 0.52]], 56, 36), skin));
  bp.add(mesh(ellipsoid(0.13, 0.15, 0.07, 32, 20), light, 0, 0.32, 0.13));
  // 등 뾰족이(둥근 끝 — 무섭지 않게)
  for (let i = 0; i < 5; i++) {
    const y = 0.48 - i * 0.07, z = -0.12 - i * 0.025;
    const s = mesh(ellipsoid(0.03, 0.05, 0.022, 16, 12), mark, 0, y, z);
    s.rotation.x = -0.6;
    bp.add(s);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.24, -0.15);
  bp.add(tail);
  tail.add(mesh(taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.04, -0.16), new THREE.Vector3(0.02, -0.12, -0.32), new THREE.Vector3(0.06, -0.15, -0.44)], 0.11, 24, 12), skin));
  // 짧은 팔(티라노답게 쪼꼬미)
  const arms = [-1, 1].map((m) => {
    const a = arm(skin, skin, 0.09, 0.032);
    a.position.set(m * 0.15, 0.42 - HIP, 0.07);
    a.rotation.z = m * 0.45;
    body.add(a);
    return a;
  });
  const head = new THREE.Group();
  const R: [number, number, number] = [0.31, 0.27, 0.3];
  head.position.set(0, 0.52 + R[1] * 0.8 - HIP, 0.05);
  body.add(head);
  head.add(mesh(ellipsoid(...R, 48, 32), skin));
  // 동글 주둥이 + 콧구멍 + 작은 이빨 두 개(하얀 콩알)
  head.add(mesh(ellipsoid(0.22, 0.13, 0.15, 36, 22), skin, 0, -0.09, 0.2));
  head.add(mesh(ellipsoid(0.17, 0.05, 0.11, 28, 14), light, 0, -0.17, 0.22));
  for (const m of [-1, 1]) {
    head.add(mesh(ellipsoid(0.014, 0.01, 0.01), skinMat('#8a5a4a'), m * 0.05, -0.04, 0.345));
    head.add(mesh(ellipsoid(0.018, 0.022, 0.012), glossMat('#fffaf2', 0.3), m * 0.06, -0.15, 0.33));
  }
  head.add(mesh(ellipsoid(0.05, 0.03, 0.05), mark, 0, R[1] * 0.92, 0.02));
  const eyes = faceOn(head, R, { size: 0.12, y: 0.08, gap: 0.24, name: 'eye-babydino' });
  const top = 0.52 + R[1] * 1.8 + 0.14 - HIP + HIP;
  return finish({ root, rig, body, head, arms, legs, tail, eyes, eyeSize: 0.12, top, merge: [bp, tail, head, ...arms, ...legs] }, spec);
}

/** 특별 모델(종 이름으로) — 색은 AnimalSpec(fur·light·mark·accColor·outfitColor·scale)에서 */
export function buildSpecial(kind: SpecialKind, spec: AnimalSpec): AnimalRig {
  pendingLow = () => withDetail(0.32, () => { pendingLow = null; return buildSpecialRaw(kind, spec).root; });
  try { return buildSpecialRaw(kind, spec); } finally { pendingLow = null; }
}

function buildSpecialRaw(kind: SpecialKind, spec: AnimalSpec): AnimalRig {
  switch (kind) {
    case 'brachio': return brachio(spec);
    case 'proto': return proto(spec);
    case 'octopus': return octopus(spec);
    case 'robot': return robot(spec);
    case 'alien': return alien(spec);
    case 'babydino': return babydino(spec);
  }
}

/** 검수용 기본 색 */
export const SPECIAL_ZOO: Record<SpecialKind, AnimalSpec> = {
  brachio: { kind: 'bear', fur: '#a8dcc0', light: '#f4fff0', accColor: '#ff9fb8' },
  proto: { kind: 'bear', fur: '#ffcf9e', light: '#fff4e2', accColor: '#fffaf2' },
  octopus: { kind: 'bear', fur: '#c9b6f2', light: '#f4eeff', accColor: '#9ef0d2' },
  robot: { kind: 'bear', fur: '#e8f4ff', light: '#dff7f0', accColor: '#ff7a8a' },
  alien: { kind: 'bear', fur: '#b6f0c8', light: '#e9fff0', accColor: '#c9b6f2' },
  babydino: { kind: 'bear', fur: '#ffb88a', light: '#fff1dc', mark: '#ff8f6e' },
};
