// 토토(아기 별토끼) 모델 + 몸짓 · 토토의 별 로켓 모델. 전부 코드 지오메트리, 얼굴은 core/art(눈·볼·그림자·숨쉬기).
// 큰 머리(아기 비율) · 긴 귀 끝에 반짝 별 · 이마에 금별 · 통통 몸 · 솜꼬리. 별빛 재질은 살짝 스스로 빛난다.
import * as THREE from 'three';
import { addEyes, blobShadow, breathe, PALETTE, type EyeSet } from '../../core/art';

const shared = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => { x.userData.shared = true; return x; };

// ───────────── 공용 지오메트리 ─────────────
let G: {
  sphere: THREE.SphereGeometry; ear: THREE.CapsuleGeometry; star: THREE.ExtrudeGeometry; starFlat: THREE.ShapeGeometry;
} | null = null;

/** 다섯 뿔 별 모양(바깥 r, 안 r) — 끝이 둥글게 보이도록 점을 조금 더 */
export function starShape(r = 0.5, ri = 0.23): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : ri;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  return s;
}

function geos() {
  if (G) return G;
  const star = new THREE.ExtrudeGeometry(starShape(0.5, 0.24), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 3, curveSegments: 4 });
  star.center();
  star.computeVertexNormals();
  G = {
    sphere: shared(new THREE.SphereGeometry(1, 28, 20)),
    ear: shared(new THREE.CapsuleGeometry(0.05, 0.2, 6, 14)),
    star: shared(star),
    starFlat: shared(new THREE.ShapeGeometry(starShape(0.5, 0.24))),
  };
  return G;
}

/** 공용 별 지오메트리(다른 연출도 쓴다) */
export const starGeometry = () => geos().star;
export const starFlatGeometry = () => geos().starFlat;

// ───────────── 재질 ─────────────
const mats = new Map<string, THREE.Material>();
function std(key: string, color: string, o: { emissive?: string; ei?: number; rough?: number } = {}) {
  let m = mats.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = shared(new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.62, emissive: o.emissive ?? '#000000', emissiveIntensity: o.ei ?? 0 }));
    mats.set(key, m);
  }
  return m;
}
/** 별빛 금색(살짝 발광) */
export const starMaterial = () => std('star', PALETTE.gold, { emissive: '#ffc94a', ei: 0.9, rough: 0.35 });

// ───────────── 토토 ─────────────
export interface TotoModel {
  root: THREE.Group;
  /** 몸 전체(뛰기·기울기) */
  body: THREE.Group;
  eyes: EyeSet;
  /** 귀(좌·우) — 몸짓 */
  ears: [THREE.Object3D, THREE.Object3D];
  /** 반짝 별들(귀 끝·이마) — 빛 맥박 */
  stars: THREE.Mesh[];
  /** 매 프레임: t 초, 동작 */
  animate(t: number, s: TotoPose): void;
}
export interface TotoPose {
  /** 깡총 높이 0..1(0 = 땅) — 바깥에서 정해 준다(뛰어가기·튀어나오기) */
  hop?: number;
  /** 신남(귀 쫑긋 + 눈 > <) */
  happy?: boolean;
  /** 손 흔들기 */
  wave?: boolean;
  /** 별빛 세기 배율(되살린 뒤 1.6) */
  glow?: number;
}

/** 아기 별토끼 토토(키 약 0.75m). 앞 = +z */
export function buildToto(phase = 0): TotoModel {
  const g = geos();
  const fur = std('fur', '#fbf3ff', { emissive: '#f0e4ff', ei: 0.12 });
  const belly = std('belly', PALETTE.white);
  const inner = std('inner', PALETTE.lightPink);
  const lav = std('lav', PALETTE.lavender);
  const starM = starMaterial();

  const root = new THREE.Group();
  root.name = 'npc-npc_toto';
  const body = new THREE.Group();
  body.name = 'toto-body';
  root.add(body);

  // 몸통(통통한 달걀)
  const torso = new THREE.Mesh(g.sphere, fur);
  torso.scale.set(0.2, 0.19, 0.18);
  torso.position.y = 0.2;
  torso.castShadow = true;
  body.add(torso);
  const tummy = new THREE.Mesh(g.sphere, belly);
  tummy.scale.set(0.13, 0.13, 0.08);
  tummy.position.set(0, 0.19, 0.115);
  body.add(tummy);
  // 배 위 작은 별 무늬
  const tStar = new THREE.Mesh(g.starFlat, std('tstar', '#ffe7a0', { emissive: '#ffd36b', ei: 0.5 }));
  tStar.scale.setScalar(0.07);
  tStar.position.set(0, 0.2, 0.196);
  body.add(tStar);

  // 머리(크게)
  const head = new THREE.Group();
  head.position.y = 0.5;
  body.add(head);
  const skull = new THREE.Mesh(g.sphere, fur);
  skull.scale.set(0.215, 0.195, 0.2);
  skull.castShadow = true;
  head.add(skull);
  // 볼 솜털(양옆 통통)
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(g.sphere, fur);
    cheek.scale.set(0.09, 0.075, 0.08);
    cheek.position.set(s * 0.12, -0.08, 0.1);
    head.add(cheek);
  }
  // 주둥이 + 코
  const muzzle = new THREE.Mesh(g.sphere, belly);
  muzzle.scale.set(0.07, 0.05, 0.05);
  muzzle.position.set(0, -0.07, 0.175);
  head.add(muzzle);
  const nose = new THREE.Mesh(g.sphere, std('nose', PALETTE.pink));
  nose.scale.set(0.022, 0.016, 0.016);
  nose.position.set(0, -0.05, 0.222);
  head.add(nose);
  const eyes = addEyes(head, { size: 0.085, head: { r: 0.2 }, lift: 0.05, gap: 0.15, name: 'toto-eye' });

  // 귀(길고 살짝 바깥으로) + 끝 별
  const stars: THREE.Mesh[] = [];
  const mkEar = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.085, 0.14, -0.02);
    pivot.rotation.z = -side * 0.28;
    head.add(pivot);
    const ear = new THREE.Mesh(g.ear, fur);
    ear.scale.set(1, 1, 0.7);
    ear.position.y = 0.15;
    ear.castShadow = true;
    pivot.add(ear);
    const inn = new THREE.Mesh(g.ear, inner);
    inn.scale.set(0.55, 0.85, 0.4);
    inn.position.set(0, 0.15, 0.022);
    pivot.add(inn);
    const tip = new THREE.Mesh(g.star, starM);
    tip.scale.setScalar(0.11);
    tip.position.y = 0.32;
    pivot.add(tip);
    stars.push(tip);
    return pivot;
  };
  const ears: [THREE.Object3D, THREE.Object3D] = [mkEar(-1), mkEar(1)];
  // 이마 금별
  const brow = new THREE.Mesh(g.star, starM);
  brow.scale.setScalar(0.075);
  brow.position.set(0, 0.11, 0.175);
  brow.rotation.x = -0.35;
  head.add(brow);
  stars.push(brow);

  // 팔(짧은 솜방울)
  const arms: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(g.sphere, fur);
    a.scale.set(0.05, 0.065, 0.05);
    a.position.set(s * 0.17, 0.25, 0.06);
    body.add(a);
    arms.push(a);
  }
  // 발(납작 동글)
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(g.sphere, lav);
    f.scale.set(0.07, 0.04, 0.09);
    f.position.set(s * 0.09, 0.035, 0.05);
    body.add(f);
  }
  // 솜꼬리(별가루색)
  const tail = new THREE.Mesh(g.sphere, std('tail', '#fff6d8', { emissive: '#ffe9a8', ei: 0.35 }));
  tail.scale.setScalar(0.065);
  tail.position.set(0, 0.14, -0.18);
  body.add(tail);

  const sh = blobShadow(0.24);
  root.add(sh);

  const animate = (t: number, s: TotoPose) => {
    const hop = Math.max(0, s.hop ?? 0);
    body.position.y = hop * 0.45;
    // 땅에 닿을 때 꾹 눌림(hop 0 근처), 공중에선 살짝 늘어남
    const squash = hop > 0.02 ? 1 + Math.min(0.08, hop * 0.2) : 1;
    body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    breathe(torso, t, phase);
    const happy = !!s.happy;
    const wig = Math.sin(t * (happy ? 9 : 2.2) + phase * 6.28);
    ears[0].rotation.z = 0.28 + wig * (happy ? 0.18 : 0.06) + hop * 0.25;
    ears[1].rotation.z = -0.28 - wig * (happy ? 0.18 : 0.06) - hop * 0.25;
    ears[0].rotation.x = ears[1].rotation.x = -0.1 + Math.sin(t * 1.3 + phase) * 0.05;
    head.rotation.z = Math.sin(t * 1.1 + phase * 3) * 0.06;
    eyes.setHappy(happy);
    if (s.wave) { arms[1].position.set(0.2, 0.36 + Math.sin(t * 12) * 0.04, 0.05); arms[1].scale.set(0.05, 0.08, 0.05); }
    else { arms[1].position.set(0.17, 0.25, 0.06); arms[1].scale.set(0.05, 0.065, 0.05); }
    const gl = (s.glow ?? 1) * (0.75 + 0.35 * Math.sin(t * 3 + phase * 5));
    starM.emissiveIntensity = 0.6 * gl + 0.3;
    for (const m of stars) m.rotation.z = Math.sin(t * 2 + m.id) * 0.25;
    sh.scale.setScalar(0.24 * (1 - Math.min(0.4, hop * 0.5)));
  };
  return { root, body, eyes, ears, stars, animate };
}

// ───────────── 토토의 별 로켓(별조각 7개로 만든 작은 로켓) ─────────────
export interface StarRocket {
  root: THREE.Group;
  /** 토토가 앉는 자리(창 안) */
  seat: THREE.Object3D;
  /** 불꽃(0 = 꺼짐) */
  setFlame(k: number, t: number): void;
}

/** 키 약 2.1m 의 통통한 별 로켓. 동체에 별조각 7개가 박혀 있다 */
export function buildStarRocket(): StarRocket {
  const g = geos();
  const root = new THREE.Group();
  root.name = 'story-star-rocket';
  // 동체(회전체): 통통한 물방울
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const y = 0.2 + u * 1.5;
    const r = 0.42 * Math.sin(Math.PI * (0.12 + u * 0.88)) ** 0.8 + (u < 0.1 ? 0.04 : 0);
    prof.push(new THREE.Vector2(Math.max(0.02, r), y));
  }
  const lathe = new THREE.LatheGeometry(prof, 28);
  lathe.computeVertexNormals();
  const hull = new THREE.Mesh(lathe, std('rhull', PALETTE.white, { emissive: '#fff4e0', ei: 0.1 }));
  hull.castShadow = true;
  root.add(hull);
  // 코(분홍 방울)
  const nose = new THREE.Mesh(g.sphere, std('rnose', PALETTE.pink, { emissive: '#ff9fb8', ei: 0.15 }));
  nose.scale.set(0.16, 0.2, 0.16);
  nose.position.y = 1.66;
  root.add(nose);
  // 꼭대기 큰 별
  const top = new THREE.Mesh(g.star, starMaterial());
  top.scale.setScalar(0.32);
  top.position.y = 1.98;
  root.add(top);
  // 둥근 창(토토가 보이는 곳)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 10, 24), std('rrim', PALETTE.gold, { emissive: '#d9a43a', ei: 0.3, rough: 0.4 }));
  rim.position.set(0, 1.05, 0.37);
  rim.rotation.x = -0.12;
  root.add(rim);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.35, roughness: 0.1 }));
  glass.position.set(0, 1.05, 0.375);
  glass.rotation.x = -0.12;
  root.add(glass);
  const seat = new THREE.Group();
  seat.position.set(0, 0.78, 0.12);
  root.add(seat);
  // 지느러미 3장(라벤더)
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.quadraticCurveTo(0.42, -0.05, 0.38, -0.42); finShape.quadraticCurveTo(0.16, -0.3, 0, -0.32); finShape.lineTo(0, 0);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 });
  finGeo.translate(0, 0, -0.03);
  const finM = std('rfin', PALETTE.lavender);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI;
    const fin = new THREE.Mesh(finGeo, finM);
    fin.position.set(Math.sin(a) * 0.36, 0.62, Math.cos(a) * 0.36);
    fin.rotation.y = a - Math.PI / 2;
    fin.castShadow = true;
    root.add(fin);
  }
  // 별조각 7개(동체 둘레 띠)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const s = new THREE.Mesh(g.star, starMaterial());
    s.scale.setScalar(0.1);
    s.position.set(Math.sin(a) * 0.41, 0.5, Math.cos(a) * 0.41);
    s.rotation.y = a;
    root.add(s);
  }
  // 노즐 + 불꽃
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.18, 20), std('rnoz', PALETTE.slate, { rough: 0.5 }));
  nozzle.position.y = 0.12;
  root.add(nozzle);
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffc04a', transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  flameMat.toneMapped = false;
  const coreMat = new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.95, depthWrite: false, fog: false });
  coreMat.toneMapped = false;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 16, 1, true), flameMat);
  flame.rotation.x = Math.PI;
  flame.position.y = -0.36;
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 12, 1, true), coreMat);
  core.rotation.x = Math.PI;
  core.position.y = -0.18;
  root.add(flame, core);
  const setFlame = (k: number, t: number) => {
    const on = k > 0.01;
    flame.visible = core.visible = on;
    if (!on) return;
    const fl = 0.85 + 0.25 * Math.sin(t * 40) + 0.1 * Math.sin(t * 23);
    flame.scale.set(k, k * fl, k);
    core.scale.set(k, k * (0.9 + 0.2 * Math.sin(t * 31)), k);
    flame.position.y = 0.08 - 0.4 * k * fl;
    core.position.y = 0.08 - 0.22 * k;
  };
  setFlame(0, 0);
  return { root, seat, setFlame };
}
