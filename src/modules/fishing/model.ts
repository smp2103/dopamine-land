// 절차적 물고기·수생생물 모델 — 몸형 생성기 27종 × 색·무늬 17종 × 파츠(GDD 0.4)·장식. 전부 머리가 +x, 길이 약 1(원점 중심).
// 둥근 단면 스윕(충분히 쪼갠 곡면 + 부드러운 법선) + 정점색 무늬 + art.ts 공용 눈·볼터치(무서운 종도 볼터치 필수) + 숨쉬기.
// 몸형은 여기, 파츠·장식(별자리·붕어빵 테두리·우파루파 아가미 …)은 species/parts.ts, 공용 도구는 species/kit.ts.
// 세상 속 크기: worldScale(sp) = clamp(len/100, 0.18, 8) m ÷ 모델 길이(GDD 0.8). 들어 올리기는 core hold() 가 0.55/1.1 m 로 맞춘다.
import * as THREE from 'three';
import { addBlush, breathe, breatheScale } from '../../core/art';
import { holdLen, worldLen } from '../../core/api';
import type { FishLook, FishSpecies } from './data';
import {
  V, sm, hash, strHash, MAT, bodyMat, finMat, solidMat, glowMat, sweep, straight, prof, painter, paintGeo, finGeo, humpShape, tailShape,
  ellipsoidMesh, tube, addSmile, addFace, placeDecal, surfaceShape, inHeart, type Anchors, type Pose, type TailKind,
} from './species/kit';
import { applyParts } from './species/parts';

// ───── 물고기형(옆으로 납작·둥근·길쭉·높은·복어·상어·큰머리·고래 …) ─────
interface FishParams {
  ry: number; rz: number; peak: number; blunt: number; len?: number; sq?: number;
  tail: TailKind | 'none'; tailS: number;
  dorsal?: [number, number, number, number]; anal?: [number, number, number, number];
  eyeT: number; eyeA: number; eyeR: number;
  pect?: number; stripe?: number; bend?: (p: THREE.Vector3) => void;
  /** 고래 꼬리(가로 지느러미) */
  fluke?: boolean;
  /** 입 크기 배율 */
  mouth?: number;
  /** 눈을 몸 밖으로 더 띄우기(얇은 몸은 머리 쪽 곡면이 가팔라 판이 묻힌다) */
  eyeOff?: number;
}

const PRESET: Record<string, FishParams> = {
  round: { ry: 0.33, rz: 0.22, peak: 0.6, blunt: 0.5, tail: 'fan', tailS: 1, dorsal: [-0.22, 0.12, 0.13, 0.3], anal: [-0.28, -0.12, 0.07, 0.3], eyeT: 0.8, eyeA: 1.22, eyeR: 0.088 },
  long: { ry: 0.19, rz: 0.15, peak: 0.6, blunt: 0.45, tail: 'fork', tailS: 0.85, dorsal: [-0.12, 0.08, 0.09, 0.3], anal: [-0.28, -0.15, 0.05, 0.3], eyeT: 0.85, eyeA: 1.25, eyeR: 0.064, stripe: 4.2 },
  tall: { ry: 0.42, rz: 0.13, peak: 0.55, blunt: 0.5, tail: 'fan', tailS: 0.85, dorsal: [-0.32, 0.1, 0.22, 0.2], anal: [-0.32, 0.0, 0.18, 0.2], eyeT: 0.8, eyeA: 1.3, eyeR: 0.08, stripe: 2.6, eyeOff: 0.022 },
  angler: { ry: 0.36, rz: 0.3, peak: 0.66, blunt: 0.4, tail: 'fan', tailS: 0.8, dorsal: [-0.22, -0.02, 0.08, 0.3], eyeT: 0.82, eyeA: 1.0, eyeR: 0.072, mouth: 1.4 },
  shark: { ry: 0.19, rz: 0.17, peak: 0.55, blunt: 0.5, tail: 'crescent', tailS: 1, dorsal: [-0.06, 0.12, 0.2, 0.15], anal: [-0.3, -0.22, 0.05, 0.3], eyeT: 0.86, eyeA: 1.15, eyeR: 0.05, pect: 0.13 },
  whaleshark: { ry: 0.19, rz: 0.22, peak: 0.7, blunt: 0.32, tail: 'crescent', tailS: 1, dorsal: [-0.1, 0.06, 0.15, 0.15], eyeT: 0.9, eyeA: 1.05, eyeR: 0.045, pect: 0.14, sq: 2.6, mouth: 1.5 },
  puffer: { ry: 0.4, rz: 0.38, peak: 0.52, blunt: 0.32, tail: 'fan', tailS: 0.55, dorsal: [-0.12, 0.0, 0.06, 0.3], eyeT: 0.76, eyeA: 1.1, eyeR: 0.1, pect: 0.07, len: 0.9 },
  box: { ry: 0.3, rz: 0.27, peak: 0.55, blunt: 0.25, tail: 'fan', tailS: 0.6, eyeT: 0.8, eyeA: 1.1, eyeR: 0.09, pect: 0.07, sq: 4.5, len: 0.9 },
  sunfish: { ry: 0.4, rz: 0.12, peak: 0.42, blunt: 0.3, tail: 'none', tailS: 1, dorsal: [-0.32, 0.0, 0.3, 0.45], anal: [-0.32, 0.0, 0.3, 0.45], eyeT: 0.82, eyeA: 1.25, eyeR: 0.075, len: 0.8, eyeOff: 0.02 },
  // 큰머리(메기·망둥이·우럭·대구): 머리 쪽이 크고 꼬리로 갈수록 가늘다, 눈은 위쪽에
  bighead: { ry: 0.28, rz: 0.25, peak: 0.74, blunt: 0.42, tail: 'fan', tailS: 0.8, dorsal: [-0.2, 0.04, 0.1, 0.3], anal: [-0.32, -0.14, 0.05, 0.3], eyeT: 0.84, eyeA: 0.95, eyeR: 0.08, pect: 0.12, mouth: 1.5 },
  // 고래(일각돌고래·모래고래·구름고래): 둥근 머리 + 가로 꼬리 + 큰 앞지느러미
  whale: { ry: 0.22, rz: 0.22, peak: 0.64, blunt: 0.38, tail: 'crescent', tailS: 1.05, fluke: true, dorsal: [-0.16, -0.02, 0.06, 0.4], eyeT: 0.82, eyeA: 1.55, eyeR: 0.055, pect: 0.16, mouth: 1.4 },
};

/** 몸통(스윕) + 지느러미 + 얼굴. 파츠는 앵커로 parts.ts 가 붙인다 */
function fishBody(look: FishLook, P: FishParams, g: THREE.Group): Anchors {
  const L = P.len ?? 1;
  const deco = new Set(look.deco ?? []), parts = new Set(look.parts ?? []);
  const pr = prof(P.peak, P.blunt);
  const s = sweep(straight(-L / 2, L / 2, 96), (t) => P.ry * pr(t), (t) => P.rz * pr(t), V(0, 0, 1),
    painter(look, 0, P.stripe ?? 3.2, look.shape === 'whaleshark' ? 0.06 : 0.085), 56, P.sq ?? 2);
  if (P.bend) {
    const pa = s.geo.attributes.position as THREE.BufferAttribute;
    const v = V();
    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); P.bend(v); pa.setXYZ(i, v.x, v.y, v.z); }
    s.geo.computeVertexNormals();
  }
  const body = new THREE.Mesh(s.geo, bodyMat(look));
  body.name = 'body';
  g.add(body);
  const acc = new THREE.Color(look.colors[2]), top = new THREE.Color(look.colors[0]);
  const taiyaki = look.pattern === 'taiyaki';
  const finC = deco.has('color-tail') ? acc.clone() : taiyaki ? top.clone().lerp(acc, 0.2)
    : look.pattern === 'none' ? top.clone().lerp(new THREE.Color('#ffffff'), 0.25) : acc.clone().lerp(top, 0.35);
  // 붕어빵 지느러미는 빵(불투명), 투명 꼬리는 더 맑게
  const fm = taiyaki ? solidMat(finC, undefined, { roughness: 0.7 }) : finMat(finC, look);
  const A: Anchors = {
    L, nose: V(L / 2, 0, 0), brow: s.at(Math.min(0.97, P.eyeT + 0.05), 0).p, back: s.at(0.5, 0).p, belly: s.at(0.5, Math.PI).p,
    tail: V(-L / 2, 0, 0), center: V(0, 0, 0), h: P.ry, w: P.rz, eye: 0, surf: s.at,
  };
  // 꼬리
  if (P.tail !== 'none') {
    const tailM = deco.has('clear-tail') ? finMat(finC.clone().lerp(new THREE.Color('#ffffff'), 0.4), { ...look, clear: true })
      : parts.has('ribbon-fin') ? finMat(finC.clone().lerp(new THREE.Color('#ffffff'), 0.35), look) : fm;
    if (deco.has('petal-tail')) {
      // 꽃잎 꼬리 네 장(벚꽃·꽃잎금붕어)
      const pm = finMat(new THREE.Color(look.colors[2]).lerp(new THREE.Color('#ffd0de'), 0.5), look);
      const tg = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const p = new THREE.Mesh(finGeo(tailShape('petal', P.tailS * 1.15)), pm);
        p.rotation.set(k % 2 ? 0.35 : -0.35, 0, (k < 2 ? 1 : -1) * 0.45);
        tg.add(p);
      }
      tg.position.set(-L / 2 + 0.06 * L, 0, 0);
      g.add(tg);
      A.tailFin = tg;
    } else {
      const kind: TailKind = parts.has('ribbon-fin') ? 'ribbon' : deco.has('cloud-fin') ? 'cloud' : look.fancy ? 'fancy' : P.tail;
      const tail = new THREE.Mesh(finGeo(tailShape(kind, P.tailS * (look.fancy ? 1.15 : 1) * (kind === 'ribbon' ? 0.8 : 1))), tailM);
      tail.position.set(-L / 2 + 0.06 * L, 0, 0);
      if (P.fluke) tail.rotation.x = Math.PI / 2;
      g.add(tail);
      A.tailFin = tail;
      if (look.fancy || deco.has('galaxy-tail')) {
        for (const rx of [0.5, -0.5]) { const t2 = tail.clone(); t2.rotation.x = rx; t2.scale.setScalar(0.85); g.add(t2); }
      }
    }
  }
  // 등·뒷지느러미
  if (P.dorsal) {
    const [b0, b1, h, k] = P.dorsal;
    const y0 = P.ry * pr((b0 + b1) / 2 / L + 0.5) - 0.03;
    const d = new THREE.Mesh(finGeo(humpShape(b0, b1, h * (look.fancy ? 1.3 : 1), k)), fm);
    d.position.y = y0;
    g.add(d);
    A.dorsal = d;
  }
  if (P.anal) {
    const [b0, b1, h, k] = P.anal;
    const y0 = -P.ry * pr((b0 + b1) / 2 / L + 0.5) + 0.03;
    const a = new THREE.Mesh(finGeo(humpShape(b0, b1, h, k)), fm);
    a.scale.y = -1;
    a.position.y = y0;
    g.add(a);
    A.anal = a;
  }
  // 가슴지느러미(날치는 큰 날개, 고래는 큰 앞지느러미)
  const pect = P.pect ?? 0.1;
  if (pect > 0) {
    for (const side of [1, -1]) {
      const at = s.at(P.eyeT - 0.14, Math.PI / 2 * side + 0.35 * side, 0);
      const big = look.wings ? 2.6 : P.fluke ? 1.5 : 1;
      const f = ellipsoidMesh(pect * big, pect * 0.42 * (look.wings ? 1.6 : 1), 0.014, fm);
      f.position.copy(at.p);
      f.position.x -= pect * 0.55 * big;
      f.rotation.set(-0.5 * side, -0.55 * side, -0.35);
      g.add(f);
    }
  }
  // 얼굴 — 눈은 art 공용 판(지름 = 예전 눈알 지름), 볼터치는 모든 종(무서운 종 필수)
  const eyeR = P.eyeR * (look.eye ?? 1);
  const size = eyeR * 2.3;
  A.eye = size;
  // 하트잉어: 옆구리마다 표면에 붙인 빨간 하트 하나
  if (look.pattern === 'heart') {
    const hm = new THREE.MeshStandardMaterial({ color: acc, roughness: 0.45, emissive: acc, emissiveIntensity: 0.15, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const w = 0.085 * L;
    for (const sd of [1, -1] as const) g.add(surfaceShape(s.at, (u, v) => inHeart(u / w, v / w), [-w * 1.1, w * 1.1, -w * 1.2, w * 1.1], 0.48, sd, 1 / Math.max(0.08, P.ry * pr(0.48)), hm, 0.003));
  }
  const fwd = V(0.18, 0.04, 0);
  let ePose = (side: number): Pose => { const e = s.at(P.eyeT, side * P.eyeA, P.eyeOff ?? 0); return { p: e.p, n: e.n.clone().add(fwd).normalize() }; };
  if (deco.has('top-eyes')) {
    // 머리 위로 톡 튀어나온 눈(팔짝망둥이): 눈 혹 위에 눈
    const bumpM = bodyMat(look);
    ePose = (side: number): Pose => {
      const e = s.at(P.eyeT, side * 0.42, 0);
      const bump = ellipsoidMesh(size * 0.55, size * 0.55, size * 0.5, bumpM, e.p.x, e.p.y + size * 0.15, e.p.z);
      paintGeo(bump.geometry as THREE.BufferGeometry, painter(look, 0), () => 0.9, () => 0);
      g.add(bump);
      return { p: V(e.p.x + size * 0.1, e.p.y + size * 0.3, e.p.z + side * size * 0.25), n: V(0.55, 0.6, side * 0.6).normalize() };
    };
  }
  const L0 = ePose(-1), R0 = ePose(1);
  A.eyes = [L0, R0];
  const bPose = (side: number): Pose => s.at(P.eyeT - 0.075, side * (P.eyeA + 0.62));
  if (deco.has('blind')) {
    const bl = addBlush(g, size);
    placeDecal(bl[0], bPose(-1), size * 0.04); placeDecal(bl[1], bPose(1), size * 0.04);
  } else if (!parts.has('t-head')) {
    addFace(g, L0, R0, size, { blush: [bPose(-1), bPose(1)], lid: deco.has('sleepy') ? top : undefined, brows: deco.has('brows') });
  }
  const nose = s.at(0.975, Math.PI * 0.62, 0);
  const mw = eyeR * 0.5 * (P.mouth ?? 1) * (deco.has('big-smile') ? 1.7 : 1);
  addSmile(g, nose.p.clone().add(V(0.006, 0, 0)), V(1, -0.1, 0).normalize(), mw, deco.has('teeth') || look.shape === 'angler');
  return A;
}

/** 몸형별 파라미터 손보기(장식·파츠가 몸 모양을 바꾸는 것) */
function paramsFor(look: FishLook): FishParams {
  const P: FishParams = { ...PRESET[look.shape] };
  const deco = new Set(look.deco ?? []);
  if (deco.has('melty')) { P.blunt = 0.35; P.peak = 0.75; P.eyeR = 0.06; P.dorsal = undefined; P.bend = (v) => { v.y -= 0.08 * sm(0.1, 0.5, v.x) * sm(-0.1, -0.3, v.y); }; }
  if (deco.has('long-body')) { P.len = 1.15; P.ry *= 0.85; P.rz *= 0.9; }
  if (deco.has('long-ball')) { P.ry = 0.27; P.rz = 0.19; P.peak = 0.58; }
  if (deco.has('mochi')) {
    // 떡: 아주 뭉툭하고 아래가 납작 — 꼬리·지느러미는 쪼끄맣게
    P.ry = 0.34; P.rz = 0.3; P.peak = 0.56; P.blunt = 0.28; P.tailS = 0.6; P.dorsal = undefined; P.anal = undefined; P.pect = 0.06; P.eyeR = 0.07;
    P.bend = (v) => { if (v.y < -0.08) v.y = -0.08 + (v.y + 0.08) * 0.35; };
  }
  if (look.pattern === 'taiyaki') { P.rz = 0.14; P.blunt = 0.48; P.dorsal = [-0.3, 0.12, 0.12, 0.3]; P.anal = [-0.3, -0.05, 0.1, 0.3]; P.pect = 0; }
  if (look.parts?.includes('plates')) P.peak = 0.45;
  if (look.shape === 'round' && look.parts?.includes('hump')) P.eyeT = 0.78;
  return P;
}

// ───── 그 밖의 몸형 ─────
type Builder = (look: FishLook, g: THREE.Group) => Anchors;

const B: Partial<Record<FishLook['shape'], Builder>> = {
  // 넙치·광어: 납작하게 누운 몸, 눈 둘 다 위쪽
  flatfish: (look, g) => {
    const pr = prof(0.55, 0.5);
    const s = sweep(straight(-0.5, 0.5, 56), (t) => 0.07 * pr(t), (t) => 0.36 * pr(t), V(0, 0, 1), painter(look, 0), 40);
    const body = new THREE.Mesh(s.geo, bodyMat(look)); body.name = 'body'; g.add(body);
    const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
    g.add(ellipsoidMesh(0.5, 0.025, 0.42, finMat(top.clone().lerp(belly, 0.3), look), -0.03, 0, 0));
    const tail = new THREE.Mesh(finGeo(tailShape('fan', 0.7)), finMat(top.clone().lerp(acc, 0.3), look));
    tail.rotation.x = Math.PI / 2; tail.position.x = -0.46; g.add(tail);
    const eye = (k: number): Pose => { const e = s.at(0.8, k * 0.32, 0); return { p: e.p.clone().add(V(0, 0.008, 0)), n: V(0.35, 1, k * 0.35).normalize() }; };
    const Le = eye(-1), Re = eye(1);
    addFace(g, Le, Re, 0.12, { blush: [{ p: s.at(0.68, -0.85).p, n: V(0, 1, -0.2).normalize() }, { p: s.at(0.68, 0.85).p, n: V(0, 1, 0.2).normalize() }] });
    addSmile(g, s.at(0.97, 0.1, 0).p.add(V(0, 0.02, 0)), V(0.5, 1, 0).normalize(), 0.025);
    return { L: 1, nose: V(0.5, 0, 0), brow: s.at(0.82, 0).p, back: s.at(0.5, 0).p, belly: s.at(0.5, Math.PI).p, tail: V(-0.5, 0, 0), center: V(), h: 0.07, w: 0.36, eye: 0.12, surf: s.at, eyes: [Le, Re] };
  },
  // 가오리: 마름모 날개 + 긴 꼬리
  ray: (look, g) => {
    const curl = look.deco?.includes('curl-wings');
    const pr = prof(0.5, 0.75);
    const s = sweep(straight(-0.42, 0.42, 56), (t) => 0.075 * prof(0.55, 0.5)(t), (t) => 0.52 * pr(t), V(0, 0, 1), painter(look, 0), 48);
    const pa = s.geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      const z = Math.abs(pa.getZ(i)) / 0.52;
      pa.setY(i, pa.getY(i) + 0.14 * Math.pow(z, 2.2) - 0.03 + (curl ? 0.22 * Math.pow(z, 5) : 0));
    }
    s.geo.computeVertexNormals();
    const body = new THREE.Mesh(s.geo, bodyMat(look)); body.name = 'body'; g.add(body);
    const top = new THREE.Color(look.colors[0]);
    g.add(tube([V(-0.38, 0, 0), V(-0.6, 0.02, 0.04), V(-0.85, 0.05, -0.02)], 0.03, 0.006, solidMat(top)));
    const eye = (k: number): Pose => { const e = s.at(0.74, 0.45 * k, 0); return { p: e.p.clone().add(V(0, 0.01, 0)), n: V(0.5, 1, 0.4 * k).normalize() }; };
    const Le = eye(-1), Re = eye(1);
    const bl = (k: number): Pose => ({ p: s.at(0.66, 0.85 * k, 0).p.add(V(0, 0.02, 0)), n: V(0, 1, 0.15 * k).normalize() });
    addFace(g, Le, Re, 0.12, { blush: [bl(-1), bl(1)] });
    addSmile(g, V(0.42, -0.005, 0), V(1, 0.2, 0).normalize(), 0.035);
    return { L: 0.84, nose: V(0.42, 0, 0), brow: s.at(0.78, 0).p, back: s.at(0.5, 0).p, belly: V(0, -0.06, 0), tail: V(-0.85, 0.05, 0), center: V(), h: 0.08, w: 0.52, eye: 0.12, surf: s.at, eyes: [Le, Re] };
  },
  // 장어·곰치·산갈치: 물결치는 긴 몸 + 등 리본
  eel: (look, g) => {
    const long = look.deco?.includes('long-body') ? 1.25 : 1;
    const path: THREE.Vector3[] = [];
    for (let i = 0; i < 72; i++) { const t = i / 71; path.push(V((-0.55 + 1.1 * t) * long, 0, 0.07 * Math.sin((1 - t) * Math.PI * 2.2) * (1 - t))); }
    const pr = prof(0.72, 0.3);
    const s = sweep(path, (t) => 0.1 * pr(t) + 0.004, (t) => 0.12 * pr(t) + 0.004, V(0, 1, 0), painter(look, Math.PI / 2, 5), 32);
    const body = new THREE.Mesh(s.geo, bodyMat(look)); body.name = 'body'; g.add(body);
    const top = new THREE.Color(look.colors[0]), acc = new THREE.Color(look.colors[2]);
    const ribbon = new THREE.Shape();
    ribbon.moveTo(0.42 * long, 0); ribbon.quadraticCurveTo(0.4 * long, 0.1, 0.3 * long, 0.05); ribbon.lineTo(-0.5 * long, 0.03); ribbon.lineTo(-0.5 * long, 0); ribbon.lineTo(0.42 * long, 0);
    const fin = new THREE.Mesh(finGeo(ribbon, 0.004), finMat(acc.clone().lerp(top, 0.2), look));
    fin.position.y = 0.08;
    g.add(fin);
    const at = (t: number, a: number, off = 0) => s.at(t, a + Math.PI / 2, off);
    const eye = (k: number): Pose => { const e = at(0.93, k * 1.0); return { p: e.p, n: e.n.clone().add(V(0.5, 0.2, 0)).normalize() }; };
    const Le = eye(-1), Re = eye(1);
    addFace(g, Le, Re, 0.12, { blush: [at(0.88, -1.6), at(0.88, 1.6)] });
    addSmile(g, at(0.985, Math.PI * 0.6 + Math.PI, 0).p.add(V(0.004, 0, 0)), V(1, 0, 0), 0.016);
    return { L: 1.1 * long, nose: V(0.55 * long, 0, 0), brow: at(0.92, 0).p, back: at(0.5, 0).p, belly: at(0.5, Math.PI).p, tail: V(-0.55 * long, 0, 0), center: V(), h: 0.1, w: 0.12, eye: 0.12, surf: at, dorsal: fin, eyes: [Le, Re] };
  },
  seahorse: (look, g) => {
    const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) { const k = i / 10; const th = Math.PI * 2.1 * (1 - k) - Math.PI * 0.5; const rr = 0.025 + 0.07 * k; pts.push(V(0.03 + rr * Math.cos(th), -0.34 + rr * Math.sin(th), 0)); }
    pts.push(V(0.1, -0.2, 0), V(0.12, -0.06, 0), V(0.08, 0.08, 0), V(0.02, 0.18, 0));
    const path = new THREE.CatmullRomCurve3(pts).getPoints(70);
    const r = (t: number) => 0.012 + 0.085 * sm(0.3, 0.72, t) * (1 - 0.35 * sm(0.85, 1, t));
    const s = sweep(path, r, (t) => r(t) * 0.85, V(0, 0, 1), painter(look, Math.PI, 8), 28);
    const body = new THREE.Mesh(s.geo, bodyMat(look)); body.name = 'body'; g.add(body);
    const headGeo = new THREE.SphereGeometry(1, 32, 24); headGeo.scale(0.13, 0.11, 0.1);
    paintGeo(headGeo, (_t, a, c) => c.copy(belly).lerp(top, sm(-0.06, 0.06, Math.cos(a) * 0.1)), () => 0.9, (p) => Math.atan2(p.z, p.y));
    const head = new THREE.Mesh(headGeo, bodyMat(look)); head.position.set(0.04, 0.22, 0); head.rotation.z = -0.4; g.add(head);
    g.add(tube([V(0.1, 0.2, 0), V(0.18, 0.17, 0), V(0.24, 0.155, 0)], 0.03, 0.022, solidMat(top.clone().lerp(belly, 0.3))));
    for (let i = 0; i < 3; i++) g.add(ellipsoidMesh(0.018, 0.018, 0.018, solidMat(acc), i * 0.03, 0.3 - i * 0.004, 0, 12));
    const Le: Pose = { p: V(0.08, 0.245, -0.085), n: V(0.4, 0.15, -1).normalize() }, Re: Pose = { p: V(0.08, 0.245, 0.085), n: V(0.4, 0.15, 1).normalize() };
    addFace(g, Le, Re, 0.1, { blush: [{ p: V(0.11, 0.19, -0.07), n: V(0.3, 0, -1).normalize() }, { p: V(0.11, 0.19, 0.07), n: V(0.3, 0, 1).normalize() }] });
    const df = new THREE.Mesh(finGeo(humpShape(-0.08, 0.06, 0.08, 0.4)), finMat(acc.clone().lerp(belly, 0.3), look));
    df.rotation.z = Math.PI * 0.5 + 0.3; g.add(df);
    addSmile(g, V(0.245, 0.15, 0), V(1, 0, 0), 0.012);
    g.position.y = 0.04;
    return { L: 0.7, nose: V(0.25, 0.155, 0), brow: V(0.05, 0.33, 0), back: V(-0.05, 0.05, 0), belly: V(0.12, -0.1, 0), tail: V(0.03, -0.36, 0), center: V(0.05, 0, 0), h: 0.3, w: 0.08, eye: 0.1, eyes: [Le, Re] };
  },
  // 문어·오징어: 세로 외투막 + 다리
  octopus: (look, g) => octo(look, g, false),
  squid: (look, g) => octo(look, g, true),
  jelly: (look, g) => {
    const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
    const deco = new Set(look.deco ?? []);
    const jar = deco.has('jar');
    // 종(갓): 구의 위쪽 — 항아리면 아래가 둥근 항아리 모양 회전체
    const bellGeo = jar
      ? new THREE.LatheGeometry([V(0.001, -0.16), V(0.16, -0.14), V(0.27, -0.02), V(0.28, 0.08), V(0.2, 0.2), V(0.12, 0.24), V(0.001, 0.25)].map((v) => new THREE.Vector2(v.x, v.y)), 48)
      : new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.56);
    if (!jar) bellGeo.scale(0.3, 0.26, 0.3);
    const paint = painter(look, 0);
    paintGeo(bellGeo, look.pattern === 'none'
      ? (t, _a, c) => c.copy(belly).lerp(top, sm(0.3, 0.7, t)).lerp(acc, 0.35 * sm(0.9, 1, t))
      : (t, a, c) => paint(t, a, c), (p) => Math.min(1, (p.y + 0.16) * 2.4), (p) => Math.atan2(p.z, p.x) + Math.PI / 2);
    const bm = bodyMat(look, { side: THREE.DoubleSide, transparent: true, opacity: look.clear ? 0.62 : 0.88 });
    const bell = new THREE.Mesh(bellGeo, bm); bell.name = 'body'; g.add(bell);
    if (!deco.has('cap') && !jar && look.pattern === 'none') {
      // 네잎 무늬
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const m = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 10, 24), solidMat(acc, look)); m.position.set(Math.cos(a) * 0.07, 0.235, Math.sin(a) * 0.07); m.rotation.x = Math.PI / 2; g.add(m); }
    }
    const arm = solidMat(acc.clone().lerp(belly, 0.4), look);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2, d = V(Math.cos(a), 0, Math.sin(a));
      g.add(tube([d.clone().multiplyScalar(0.03).setY(0.02), d.clone().multiplyScalar(0.06).setY(-0.12), d.clone().multiplyScalar(0.02).setY(-0.25), d.clone().multiplyScalar(0.07).setY(-0.38)], 0.03, 0.01, arm, V(-d.z, 0, d.x)));
    }
    const ten = solidMat(top.clone().lerp(belly, 0.5), look);
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, d = V(Math.cos(a), 0, Math.sin(a));
      g.add(tube([d.clone().multiplyScalar(0.27).setY(0.0), d.clone().multiplyScalar(0.25).setY(-0.15), d.clone().multiplyScalar(0.28).setY(-0.3)], 0.008, 0.003, ten, V(-d.z, 0, d.x)));
    }
    const sph = (ph: number, ang: number) => V(Math.sin(ph) * Math.cos(ang) * 0.3, Math.cos(ph) * 0.26, Math.sin(ph) * Math.sin(ang) * 0.3);
    const Le: Pose = { p: sph(1.1, -0.42), n: V(Math.cos(-0.42), 0.35, Math.sin(-0.42)).normalize() };
    const Re: Pose = { p: sph(1.1, 0.42), n: V(Math.cos(0.42), 0.35, Math.sin(0.42)).normalize() };
    if (jar) { Le.p.set(0.27, 0.04, -0.1); Re.p.set(0.27, 0.04, 0.1); Le.n.set(1, 0.1, -0.4).normalize(); Re.n.set(1, 0.1, 0.4).normalize(); }
    const bl = (k: number): Pose => { const p = jar ? V(0.27, -0.03, 0.18 * k) : sph(1.3, 0.8 * k); return { p, n: jar ? V(1, 0, 0.7 * k).normalize() : p.clone().normalize() }; };
    addFace(g, Le, Re, 0.1, { blush: [bl(-1), bl(1)] });
    addSmile(g, jar ? V(0.285, -0.02, 0) : V(Math.sin(1.32) * 0.3 + 0.004, Math.cos(1.32) * 0.26, 0), V(1, 0.2, 0).normalize(), 0.02);
    g.position.y = 0.12;
    return { L: 0.6, nose: V(0.3, 0.08, 0), brow: V(0.12, 0.24, 0), back: V(0, 0.26, 0), belly: V(0, -0.05, 0), tail: V(-0.3, 0.05, 0), center: V(0, 0.08, 0), h: 0.2, w: 0.3, eye: 0.1, eyes: [Le, Re] };
  },
  crab: (look, g) => {
    const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
    const bumpy = look.deco?.includes('bumpy');
    const bodyGeo = new THREE.SphereGeometry(1, 40, 28);
    bodyGeo.scale(0.28, 0.16, 0.34);
    const pa = bodyGeo.attributes.position as THREE.BufferAttribute;
    if (bumpy) for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); if (y > 0.03) pa.setY(i, y + 0.012 * Math.sin(x * 60) * Math.sin(z * 60)); }
    paintGeo(bodyGeo, painter(look, 0), (p) => 0.5 + p.x * 1.6, (p) => Math.atan2(p.z, p.y));
    bodyGeo.computeVertexNormals();
    const body = new THREE.Mesh(bodyGeo, bodyMat(look)); body.name = 'body'; g.add(body);
    const shell = solidMat(top.clone().lerp(belly, 0.15), look);
    const tip = solidMat(acc.clone().lerp(top, 0.3), look);
    const legL = look.parts?.includes('legs-long') ? 1.6 : 1;
    for (const k of [1, -1]) for (let i = 0; i < 3; i++) {
      const x = -0.1 + i * 0.07;
      g.add(tube([V(x, -0.02, 0.2 * k), V(x - 0.04, 0.06, (0.32 + 0.06 * legL) * k), V(x - 0.08, -0.08, (0.38 + 0.12 * legL) * k), V(x - 0.1, -0.16, (0.4 + 0.12 * legL) * k)], 0.03, 0.012, shell));
    }
    if (look.claws) for (const k of [1, -1]) {
      g.add(tube([V(0.14, -0.02, 0.18 * k), V(0.24, 0.04, 0.3 * k), V(0.32, 0.06, 0.26 * k)], 0.035, 0.03, shell));
      const palm = ellipsoidMesh(0.09, 0.07, 0.06, shell, 0.36, 0.08, 0.25 * k); palm.rotation.y = 0.5 * k; g.add(palm);
      const f1 = ellipsoidMesh(0.08, 0.03, 0.03, tip, 0.45, 0.12, 0.2 * k); f1.rotation.set(0, 0.6 * k, 0.4); g.add(f1);
      const f2 = ellipsoidMesh(0.07, 0.025, 0.028, tip, 0.44, 0.05, 0.21 * k); f2.rotation.set(0, 0.6 * k, -0.25); g.add(f2);
    }
    for (const k of [1, -1]) g.add(tube([V(0.16, 0.06, 0.07 * k), V(0.18, 0.13, 0.08 * k), V(0.19, 0.18, 0.085 * k)], 0.018, 0.016, shell));
    const Le: Pose = { p: V(0.2, 0.2, -0.085), n: V(0.8, 0.25, -0.45).normalize() }, Re: Pose = { p: V(0.2, 0.2, 0.085), n: V(0.8, 0.25, 0.45).normalize() };
    addFace(g, Le, Re, 0.11, { blush: [{ p: V(0.21, 0.03, -0.18), n: V(0.6, 0.3, -0.7).normalize() }, { p: V(0.21, 0.03, 0.18), n: V(0.6, 0.3, 0.7).normalize() }] });
    addSmile(g, V(0.235, 0.0, 0), V(1, 0.15, 0).normalize(), 0.03);
    g.position.y = 0.12;
    return { L: 0.56, nose: V(0.28, 0, 0), brow: V(0.16, 0.16, 0), back: V(0, 0.16, 0), belly: V(0, -0.12, 0), tail: V(-0.28, 0, 0), center: V(), h: 0.16, w: 0.34, eye: 0.11, eyes: [Le, Re] };
  },
  shrimp: (look, g) => {
    const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
    const pts = [V(0.3, 0.06, 0), V(0.12, 0.12, 0), V(-0.08, 0.1, 0), V(-0.22, 0.02, 0), V(-0.28, -0.1, 0), V(-0.24, -0.2, 0)];
    const path = new THREE.CatmullRomCurve3(pts.reverse()).getPoints(64);
    const pr = prof(0.75, 0.5);
    const s = sweep(path, (t) => 0.1 * pr(t) + 0.004, (t) => 0.085 * pr(t) + 0.004, V(0, 0, 1), painter(look, Math.PI, 6), 32);
    const body = new THREE.Mesh(s.geo, bodyMat(look)); body.name = 'body'; g.add(body);
    const headM = ellipsoidMesh(0.15, 0.13, 0.12, solidMat(top.clone().lerp(belly, 0.25), look), 0.26, 0.08, 0, 40);
    g.add(headM);
    const fm = finMat(acc.clone().lerp(top, 0.3), look);
    if (!look.deco?.includes('heart-tail')) for (const k of [-0.5, 0, 0.5]) { const f = ellipsoidMesh(0.07, 0.016, 0.04, fm, -0.27, -0.25, k * 0.06); f.rotation.set(k * 0.6, -k * 0.8, 1.2); g.add(f); }
    const am = solidMat(acc, look);
    for (const k of [1, -1]) {
      g.add(tube([V(0.36, 0.16, 0.04 * k), V(0.44, 0.27, 0.08 * k), V(0.42, 0.34, 0.11 * k)], 0.016, 0.011, am));
      g.add(ellipsoidMesh(0.022, 0.022, 0.022, am, 0.42, 0.345, 0.11 * k, 12));
      g.add(tube([V(0.3, 0.14, 0.05 * k), V(0.32, 0.2, 0.07 * k)], 0.018, 0.018, am));
      for (let i = 0; i < 3; i++) g.add(ellipsoidMesh(0.022, 0.05, 0.02, am, 0.1 - i * 0.09, -0.06, 0.06 * k, 12));
      if (look.claws) {
        // 집게를 번쩍 치켜든다
        g.add(tube([V(0.25, 0.0, 0.06 * k), V(0.38, 0.04, 0.14 * k), V(0.48, 0.14, 0.14 * k)], 0.022, 0.02, am));
        g.add(ellipsoidMesh(0.08, 0.045, 0.045, am, 0.53, 0.19, 0.14 * k));
        const f1 = ellipsoidMesh(0.06, 0.018, 0.02, am, 0.61, 0.23, 0.14 * k); f1.rotation.z = 0.5; g.add(f1);
      }
    }
    const Le: Pose = { p: V(0.32, 0.23, -0.08), n: V(0.6, 0.3, -1).normalize() }, Re: Pose = { p: V(0.32, 0.23, 0.08), n: V(0.6, 0.3, 1).normalize() };
    addFace(g, Le, Re, 0.12, { blush: [{ p: V(0.37, 0.07, -0.1), n: V(0.6, 0, -0.8).normalize() }, { p: V(0.37, 0.07, 0.1), n: V(0.6, 0, 0.8).normalize() }] });
    addSmile(g, V(0.405, 0.05, 0), V(1, 0, 0), 0.022);
    g.position.y = 0.05;
    return { L: 0.7, nose: V(0.41, 0.06, 0), brow: V(0.26, 0.21, 0), back: V(0, 0.13, 0), belly: V(0, -0.05, 0), tail: V(-0.24, -0.2, 0), center: V(0.05, 0.03, 0), h: 0.12, w: 0.1, eye: 0.12, surf: s.at, eyes: [Le, Re] };
  },
  turtle: (look, g) => {
    const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
    const deco = new Set(look.deco ?? []);
    const rock = deco.has('meteor-shell') || deco.has('crater-shell');
    const flat = deco.has('flat-shell') ? 0.62 : 1;
    const shellGeo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    shellGeo.scale(0.4, 0.22 * flat, 0.34);
    const pa = shellGeo.attributes.position as THREE.BufferAttribute;
    const cc: number[] = [];
    // 크레이터 자리(고정 해시)
    const craters = rock ? Array.from({ length: 7 }, (_, i) => ({ x: (hash(i, 1) - 0.5) * 0.5, z: (hash(i, 2) - 0.5) * 0.45, r: 0.04 + 0.04 * hash(i, 3) })) : [];
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      let c: THREE.Color;
      if (rock) {
        // 운석·달 등딱지: 울퉁불퉁 + 크레이터 + 금 반짝
        let dip = 0, rim = 0;
        for (const q of craters) { const d = Math.hypot(x - q.x, z - q.z) / q.r; dip = Math.max(dip, sm(1, 0.4, d)); rim = Math.max(rim, sm(0.7, 1, d) * sm(1.3, 1, d)); }
        const n = hash(Math.round(x * 40), Math.round(z * 40));
        if (y > 0.02) pa.setY(i, y * (1 + 0.04 * (n - 0.5)) - dip * 0.02 * flat + rim * 0.008);
        c = top.clone().lerp(belly, 0.25 * rim).multiplyScalar(1 - 0.18 * dip);
        if (n > 0.93) c.lerp(acc, 0.9);
      } else {
        const u = x * 9, v = z * 9 + (Math.floor(u) % 2) * 0.5;
        const fx = Math.abs((u - Math.floor(u)) - 0.5), fz = Math.abs((v - Math.floor(v)) - 0.5);
        const edge = sm(0.36, 0.48, Math.max(fx, fz));
        c = top.clone().lerp(acc, 0.35 * (1 - edge)).lerp(belly, edge * 0.55);
      }
      c.lerp(belly, sm(0.06, 0.0, y) * 0.6);
      cc.push(c.r, c.g, c.b);
    }
    shellGeo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    shellGeo.computeVertexNormals();
    const shell = new THREE.Mesh(shellGeo, bodyMat(look)); shell.position.y = 0.04; shell.name = 'body'; g.add(shell);
    const skin = solidMat(top.clone().lerp(new THREE.Color('#ffffff'), 0.35).lerp(belly, 0.25));
    g.add(ellipsoidMesh(0.4, 0.06, 0.33, solidMat(belly), 0, 0.04, 0));
    const hx = flat < 1 ? 0.52 : 0.46;
    if (flat < 1) g.add(tube([V(0.34, 0.06, 0), V(0.46, 0.09, 0)], 0.06, 0.055, skin));
    g.add(ellipsoidMesh(0.13, 0.11, 0.115, skin, hx, 0.1, 0));
    for (const k of [1, -1]) {
      const f = ellipsoidMesh(0.16, 0.03, 0.07, skin, 0.22, 0.04, 0.3 * k); f.rotation.y = -0.7 * k; g.add(f);
      const b = ellipsoidMesh(0.1, 0.03, 0.05, skin, -0.3, 0.04, 0.22 * k); b.rotation.y = 0.6 * k; g.add(b);
    }
    const Le: Pose = { p: V(hx + 0.07, 0.14, -0.07), n: V(0.7, 0.2, -0.7).normalize() }, Re: Pose = { p: V(hx + 0.07, 0.14, 0.07), n: V(0.7, 0.2, 0.7).normalize() };
    addFace(g, Le, Re, 0.085, { blush: [{ p: V(hx + 0.1, 0.08, -0.075), n: V(0.6, 0, -0.8).normalize() }, { p: V(hx + 0.1, 0.08, 0.075), n: V(0.6, 0, 0.8).normalize() }] });
    addSmile(g, V(hx + 0.13, 0.075, 0), V(1, 0, 0), 0.025);
    g.position.y = 0.04;
    return { L: 0.95, nose: V(hx + 0.13, 0.1, 0), brow: V(hx, 0.21, 0), back: V(0, 0.04 + 0.22 * flat, 0), belly: V(0, 0.0, 0), tail: V(-0.4, 0.04, 0), center: V(0, 0.08, 0), h: 0.22 * flat, w: 0.34, eye: 0.085, eyes: [Le, Re] };
  },
  tadpole: (look, g) => {
    const top = new THREE.Color(look.colors[0]), acc = new THREE.Color(look.colors[2]);
    const headGeo = new THREE.SphereGeometry(1, 40, 28);
    headGeo.scale(0.22, 0.18, 0.19);
    paintGeo(headGeo, painter(look, 0), (p) => 0.55 + p.x, (p) => Math.atan2(p.z, p.y));
    const head = new THREE.Mesh(headGeo, bodyMat(look)); head.position.x = 0.18; head.name = 'body'; g.add(head);
    const path: THREE.Vector3[] = [];
    for (let i = 0; i < 40; i++) { const t = i / 39; path.push(V(0.05 - 0.6 * (1 - t), 0, 0.06 * Math.sin((1 - t) * Math.PI * 1.6) * (1 - t))); }
    const s = sweep(path, (t) => 0.02 * sm(0, 0.6, t) + 0.003, (t) => 0.12 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9)), 0.6) * (0.4 + 0.6 * t) + 0.004, V(0, 1, 0), painter(look, Math.PI / 2), 20);
    g.add(new THREE.Mesh(s.geo, bodyMat(look)));
    if (look.wings) for (const k of [1, -1]) { const w = ellipsoidMesh(0.09, 0.05, 0.015, finMat(top.clone().lerp(acc, 0.2), look), 0.16, 0.0, 0.2 * k); w.rotation.set(0.3 * k, 0.8 * k, 0.3); g.add(w); }
    const Le: Pose = { p: V(0.33, 0.07, -0.11), n: V(0.7, 0.3, -0.65).normalize() }, Re: Pose = { p: V(0.33, 0.07, 0.11), n: V(0.7, 0.3, 0.65).normalize() };
    const er = 0.11 * (look.eye ?? 1);
    addFace(g, Le, Re, er, { blush: [{ p: V(0.37, -0.03, -0.12), n: V(0.6, 0, -0.8).normalize() }, { p: V(0.37, -0.03, 0.12), n: V(0.6, 0, 0.8).normalize() }] });
    addSmile(g, V(0.4, -0.02, 0), V(1, 0, 0), look.deco?.includes('axolotl') ? 0.05 : 0.022);
    return { L: 0.95, nose: V(0.4, 0, 0), brow: V(0.2, 0.18, 0), back: V(0.12, 0.18, 0), belly: V(0.18, -0.18, 0), tail: V(-0.55, 0, 0), center: V(0.18, 0, 0), h: 0.18, w: 0.19, eye: er, eyes: [Le, Re] };
  },
  star: (look, g) => {
    const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
    const sh = new THREE.Shape();
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * Math.PI * 2 + Math.PI / 2, a1 = a0 + Math.PI / 5, a2 = a1 + Math.PI / 5;
      if (i === 0) sh.moveTo(Math.cos(a0) * 0.42, Math.sin(a0) * 0.42);
      sh.quadraticCurveTo(Math.cos(a1) * 0.17, Math.sin(a1) * 0.17, Math.cos(a2) * 0.42, Math.sin(a2) * 0.42);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 6, curveSegments: 16 });
    geo.computeVertexNormals();
    const pa = geo.attributes.position as THREE.BufferAttribute;
    const cc: number[] = [], c = new THREE.Color();
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const r = Math.hypot(x, y); c.copy(top).lerp(belly, sm(0.06, -0.04, z) * 0.7).lerp(acc, sm(0.7, 0.9, hash(Math.round(x * 30), Math.round(y * 30))) * sm(0.12, 0.2, r) * 0.6); cc.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    const inner = new THREE.Group();
    const body = new THREE.Mesh(geo, bodyMat(look)); body.name = 'body'; inner.add(body);
    const Le: Pose = { p: V(-0.06, 0.04, 0.1), n: V(-0.1, 0.1, 1).normalize() }, Re: Pose = { p: V(0.06, 0.04, 0.1), n: V(0.1, 0.1, 1).normalize() };
    addFace(inner, Le, Re, 0.1, { blush: [{ p: V(-0.12, -0.04, 0.1), n: V(0, 0, 1) }, { p: V(0.12, -0.04, 0.1), n: V(0, 0, 1) }] });
    addSmile(inner, V(0, -0.04, 0.105), V(0, 0, 1), 0.025);
    inner.rotation.y = Math.PI / 2;
    g.add(inner);
    return { L: 0.84, nose: V(0.1, 0, 0), brow: V(0.1, 0.3, 0), back: V(0, 0.42, 0), belly: V(0, -0.35, 0), tail: V(-0.1, 0, 0), center: V(), h: 0.42, w: 0.1, eye: 0.1 };
  },
  // 우렁이·암모나이트: 나선 껍데기(로그 나선 관) + 부드러운 몸
  snail: (look, g) => {
    const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
    const ammo = !!look.parts?.includes('tentacles6');
    const N = 110, thMax = Math.PI * 5.5, b = Math.log(11) / thMax;
    const path: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const th = (i / (N - 1)) * thMax, R = 0.02 * Math.exp(b * th);
      path.push(V(Math.cos(th) * R, Math.sin(th) * R, ammo ? 0 : -0.012 * (thMax - th)));
    }
    const rad = (t: number) => 0.02 * Math.exp(b * t * thMax) * 0.55 + 0.004;
    const s = sweep(path, rad, (t) => rad(t) * (ammo ? 0.78 : 1), V(0, 0, 1), (t, a, c) => {
      const up = Math.cos(a);
      c.copy(belly).lerp(top, 0.55 + 0.45 * sm(-0.6, 0.6, up));
      // 성장선(갈비 무늬) + 껍데기 끝으로 갈수록 진하게
      const rib = Math.sin(t * thMax * (ammo ? 5 : 2.5));
      c.lerp(acc, (ammo ? 0.7 : 0.5) * sm(0.55, 0.9, rib) * sm(0.05, 0.2, t));
    }, 32);
    const shell = new THREE.Mesh(s.geo, bodyMat(look)); shell.name = 'body';
    const sg = new THREE.Group(); sg.add(shell);
    if (!ammo) { sg.rotation.set(0.25, 0.35, 0); }
    g.add(sg);
    const skin = solidMat(ammo ? new THREE.Color('#fff1cf').lerp(acc, 0.15) : belly.clone().lerp(top, 0.3).lerp(new THREE.Color('#fffaf2'), 0.3));
    let Le: Pose, Re: Pose, nose: THREE.Vector3, brow: THREE.Vector3;
    if (ammo) {
      // 껍데기 입구(아래 앞)에서 머리 + 촉수 여섯
      g.add(ellipsoidMesh(0.11, 0.1, 0.09, skin, 0.08, -0.25, 0));
      for (let i = 0; i < 6; i++) {
        const z = (i - 2.5) * 0.028, b0 = V(0.16, -0.3, z);
        g.add(tube([b0, b0.clone().add(V(0.08, -0.04 - 0.02 * (i % 2), z * 0.6)), b0.clone().add(V(0.14, -0.1, z * 1.1)), b0.clone().add(V(0.18, -0.08 + 0.02 * (i % 3), z * 1.3))], 0.018, 0.008, skin));
      }
      Le = { p: V(0.15, -0.21, -0.07), n: V(0.6, 0.2, -0.8).normalize() }; Re = { p: V(0.15, -0.21, 0.07), n: V(0.6, 0.2, 0.8).normalize() };
      nose = V(0.2, -0.27, 0); brow = V(0.08, -0.15, 0);
      addFace(g, Le, Re, 0.07, { blush: [{ p: V(0.17, -0.27, -0.06), n: V(0.7, 0, -0.7).normalize() }, { p: V(0.17, -0.27, 0.06), n: V(0.7, 0, 0.7).normalize() }] });
      addSmile(g, V(0.19, -0.27, 0), V(1, 0, 0), 0.018);
    } else {
      // 달팽이 발(앞으로 길게) + 머리 + 눈자루
      g.add(ellipsoidMesh(0.3, 0.06, 0.11, skin, 0.08, -0.34, 0));
      g.add(ellipsoidMesh(0.1, 0.09, 0.09, skin, 0.3, -0.27, 0));
      for (const k of [-1, 1]) g.add(tube([V(0.32, -0.22, 0.04 * k), V(0.35, -0.12, 0.06 * k), V(0.36, -0.06, 0.065 * k)], 0.018, 0.014, skin));
      Le = { p: V(0.375, -0.05, -0.065), n: V(1, 0.2, -0.5).normalize() }; Re = { p: V(0.375, -0.05, 0.065), n: V(1, 0.2, 0.5).normalize() };
      nose = V(0.4, -0.28, 0); brow = V(0.3, -0.18, 0);
      addFace(g, Le, Re, 0.07, { blush: [{ p: V(0.38, -0.29, -0.05), n: V(0.8, 0, -0.6).normalize() }, { p: V(0.38, -0.29, 0.05), n: V(0.8, 0, 0.6).normalize() }] });
      addSmile(g, V(0.395, -0.3, 0), V(1, 0, 0), 0.02);
    }
    g.position.y = 0.1;
    return { L: 0.75, nose, brow, back: V(0, 0.25, 0), belly: V(0.05, -0.38, 0), tail: V(-0.3, 0, 0), center: V(0, -0.04, 0), h: 0.3, w: 0.12, eye: 0.07, eyes: [Le, Re] };
  },
  // 삼엽충·공벌레·아노말로카리스: 마디 진 납작 돔 + 다리 + 더듬이
  isopod: (look, g) => {
    const acc = new THREE.Color(look.colors[2]), top = new THREE.Color(look.colors[0]);
    const deco = new Set(look.deco ?? []);
    const tri = deco.has('trilobe'), anom = deco.has('flaps');
    const segs = anom ? 11 : 8, L = anom ? 1.0 : 0.8;
    const pr = prof(0.55, 0.45);
    const base = painter(look, 0);
    const s = sweep(straight(-L / 2, L / 2, 90), (t) => 0.13 * pr(t), (t) => (anom ? 0.17 : 0.27) * pr(t), V(0, 0, 1), (t, a, c) => {
      base(t, a, c);
      const groove = sm(0.82, 1, Math.abs(Math.cos(t * Math.PI * segs)));
      c.lerp(acc, 0.45 * groove * sm(0.12, 0.2, t) * sm(0.9, 0.8, t));
      if (tri) c.lerp(acc, 0.4 * sm(0.12, 0.0, Math.abs(Math.abs(Math.sin(a)) - 0.45)));
    }, 48, 2.3);
    const pa = s.geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i);
      const t = x / L + 0.5;
      // 배는 납작, 등은 마디마다 살짝 볼록
      pa.setY(i, y < 0 ? y * 0.3 : y * (1 + 0.08 * Math.cos(t * Math.PI * segs * 2)));
    }
    s.geo.computeVertexNormals();
    const body = new THREE.Mesh(s.geo, bodyMat(look)); body.name = 'body'; g.add(body);
    const legM = solidMat(top.clone().lerp(acc, 0.4), look);
    if (!anom) for (const k of [1, -1]) for (let i = 0; i < 7; i++) {
      const x = -0.28 + i * 0.085, z0 = 0.2 * pr(x / L + 0.5);
      g.add(tube([V(x, -0.02, z0 * k), V(x + 0.01, -0.05, (z0 + 0.05) * k), V(x + 0.02, -0.08, (z0 + 0.07) * k)], 0.014, 0.008, legM));
    }
    for (const k of [1, -1]) {
      g.add(tube([V(L / 2 - 0.03, 0.02, 0.05 * k), V(L / 2 + 0.08, 0.06, 0.12 * k), V(L / 2 + 0.16, 0.05, 0.2 * k)], 0.012, 0.007, legM));
      if (!anom) { const u = ellipsoidMesh(0.06, 0.012, 0.03, legM, -L / 2 - 0.02, -0.01, 0.05 * k); u.rotation.y = 0.4 * k; g.add(u); }
    }
    const eye = (k: number): Pose => { const e = s.at(0.86, k * 0.75, 0); return { p: e.p, n: e.n.clone().add(V(0.6, 0.2, 0)).normalize() }; };
    const Le = eye(-1), Re = eye(1);
    addFace(g, Le, Re, 0.09, { blush: [s.at(0.82, -1.25), s.at(0.82, 1.25)] });
    addSmile(g, V(L / 2 - 0.005, -0.02, 0), V(1, -0.2, 0).normalize(), 0.025);
    g.position.y = 0.05;
    return { L, nose: V(L / 2, 0, 0), brow: s.at(0.88, 0).p, back: s.at(0.5, 0).p, belly: V(0, -0.04, 0), tail: V(-L / 2, 0, 0), center: V(), h: 0.13, w: anom ? 0.17 : 0.27, eye: 0.09, surf: s.at, eyes: [Le, Re] };
  },
  // 투구게: 말굽 돔 + 뒷배 + 긴 꼬리 가시(끝은 동글)
  horseshoe: (look, g) => {
    const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
    const dome = new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(0.32, 0.13, 0.36);
    paintGeo(dome, (t, a, c) => { c.copy(belly).lerp(top, sm(0.0, 0.6, t)); c.lerp(acc, 0.4 * sm(0.03, 0.0, Math.abs(a))); }, (p) => p.y / 0.13, (p) => p.z);
    const front = new THREE.Mesh(dome, bodyMat(look)); front.position.x = 0.08; front.name = 'body'; g.add(front);
    const ab = new THREE.SphereGeometry(1, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    ab.scale(0.16, 0.08, 0.2);
    paintGeo(ab, (t, _a, c) => c.copy(belly).lerp(top, sm(0, 0.7, t)), (p) => p.y / 0.08, () => 0);
    const back = new THREE.Mesh(ab, bodyMat(look)); back.position.x = -0.28; g.add(back);
    g.add(ellipsoidMesh(0.3, 0.02, 0.012, solidMat(acc), 0.0, 0.12, 0));
    const tm = solidMat(top.clone().lerp(acc, 0.3));
    g.add(tube([V(-0.4, 0.02, 0), V(-0.6, 0.05, 0), V(-0.78, 0.09, 0)], 0.02, 0.01, tm));
    g.add(ellipsoidMesh(0.018, 0.018, 0.018, tm, -0.79, 0.09, 0, 10));
    g.add(ellipsoidMesh(0.33, 0.012, 0.37, solidMat(belly), 0.08, 0.005, 0));
    const Le: Pose = { p: V(0.16, 0.115, -0.1), n: V(0.3, 1, -0.3).normalize() }, Re: Pose = { p: V(0.16, 0.115, 0.1), n: V(0.3, 1, 0.3).normalize() };
    addFace(g, Le, Re, 0.08, { blush: [{ p: V(0.22, 0.09, -0.16), n: V(0.5, 1, -0.4).normalize() }, { p: V(0.22, 0.09, 0.16), n: V(0.5, 1, 0.4).normalize() }] });
    addSmile(g, V(0.39, 0.02, 0), V(1, 0.2, 0).normalize(), 0.03);
    g.position.y = 0.03;
    return { L: 1.2, nose: V(0.4, 0.03, 0), brow: V(0.2, 0.12, 0), back: V(0, 0.13, 0), belly: V(0, 0, 0), tail: V(-0.79, 0.09, 0), center: V(0, 0.04, 0), h: 0.13, w: 0.36, eye: 0.08, eyes: [Le, Re] };
  },
  // 개구리(왕관개굴): 통통한 몸 + 머리 위 눈 혹 + 접은 뒷다리
  frog: (look, g) => {
    const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]);
    const geo = new THREE.SphereGeometry(1, 40, 28);
    geo.scale(0.26, 0.2, 0.25);
    paintGeo(geo, painter(look, 0), (p) => 0.5 + p.x * 1.4, (p) => Math.atan2(p.z, p.y));
    const body = new THREE.Mesh(geo, bodyMat(look)); body.position.y = 0.15; body.name = 'body'; g.add(body);
    const bump = bodyMat(look);
    const bm: THREE.Mesh[] = [];
    for (const k of [-1, 1]) { const m = ellipsoidMesh(0.08, 0.075, 0.075, bump, 0.1, 0.32, 0.1 * k, 24); paintGeo(m.geometry as THREE.BufferGeometry, (_t, _a, c) => c.copy(top), () => 1, () => 0); bm.push(m); g.add(m); }
    const leg = solidMat(top.clone().lerp(belly, 0.2));
    for (const k of [-1, 1]) {
      g.add(ellipsoidMesh(0.13, 0.07, 0.07, leg, -0.1, 0.06, 0.2 * k));
      g.add(ellipsoidMesh(0.08, 0.02, 0.05, leg, 0.0, 0.0, 0.25 * k));
      g.add(tube([V(0.14, 0.1, 0.13 * k), V(0.2, 0.03, 0.15 * k)], 0.025, 0.022, leg));
      g.add(ellipsoidMesh(0.05, 0.015, 0.04, leg, 0.22, 0.01, 0.15 * k));
    }
    g.add(ellipsoidMesh(0.2, 0.12, 0.2, solidMat(belly), 0.07, 0.1, 0));
    const Le: Pose = { p: V(0.155, 0.35, -0.12), n: V(0.75, 0.4, -0.5).normalize() }, Re: Pose = { p: V(0.155, 0.35, 0.12), n: V(0.75, 0.4, 0.5).normalize() };
    addFace(g, Le, Re, 0.1, { blush: [{ p: V(0.24, 0.17, -0.12), n: V(0.7, 0, -0.7).normalize() }, { p: V(0.24, 0.17, 0.12), n: V(0.7, 0, 0.7).normalize() }] });
    addSmile(g, V(0.262, 0.2, 0), V(1, 0, 0), 0.06);
    return { L: 0.6, nose: V(0.26, 0.18, 0), brow: V(0.1, 0.4, 0), back: V(0, 0.34, 0), belly: V(0.05, 0.0, 0), tail: V(-0.26, 0.15, 0), center: V(0, 0.15, 0), h: 0.2, w: 0.25, eye: 0.1, eyes: [Le, Re] };
  },
};

function octo(look: FishLook, g: THREE.Group, sq: boolean): Anchors {
  const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
  const paint = painter(look, 0);
  const path = straight(0, 1, 48).map((p) => V(0, sq ? -0.05 + p.x * 0.6 : 0.02 + p.x * 0.42, 0));
  const pr = sq ? prof(0.3, 0.55) : prof(0.45, 0.5);
  const R = sq ? 0.16 : 0.24;
  const s = sweep(path, (t) => R * pr(t), (t) => R * pr(t), V(0, 0, 1), (t, a, c) => paint(0.3 + t * 0.6, a + Math.PI / 2, c), 40);
  const body = new THREE.Mesh(s.geo, bodyMat(look)); body.name = 'body'; g.add(body);
  const legM = solidMat(top.clone().lerp(belly, 0.15), look);
  const n = sq ? 10 : look.parts?.includes('tentacles6') ? 6 : 8;
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2 + 0.3;
    const d = V(Math.cos(ang), 0, Math.sin(ang));
    const long = sq && k % 5 === 0;
    const L = sq ? (long ? 0.42 : 0.24) : 0.38;
    const y0 = sq ? -0.04 : 0.1;
    const pts = [d.clone().multiplyScalar(0.06).setY(y0), d.clone().multiplyScalar(0.14 + L * 0.2).setY(y0 - L * 0.4), d.clone().multiplyScalar(0.2 + L * 0.55).setY(y0 - L * 0.55),
      d.clone().multiplyScalar(0.22 + L * 0.75).setY(y0 - L * 0.4), d.clone().multiplyScalar(0.19 + L * 0.72).setY(y0 - L * 0.28)];
    g.add(tube(pts, sq ? 0.03 : 0.055, 0.012, legM, V(-d.z, 0, d.x)));
  }
  if (sq) {
    const fm = finMat(top.clone().lerp(acc, 0.3), look);
    for (const k of [1, -1]) { const f = new THREE.Mesh(finGeo(humpShape(-0.12, 0.12, 0.16, 0.5)), fm); f.rotation.set(Math.PI / 2 * k, Math.PI / 2, 0); f.position.set(0, 0.42, 0.04 * k); g.add(f); }
  }
  if (look.wings || look.parts?.includes('ear-fins')) for (const k of [1, -1]) { const e = ellipsoidMesh(0.12, 0.08, 0.02, finMat(acc, look), 0, 0.34, 0.2 * k); e.rotation.x = 0.6 * k; g.add(e); }
  const ey = sq ? 0.06 : 0.17;
  const er = (sq ? 0.06 : 0.075) * (look.eye ?? 1);
  const tOf = (y: number) => (y - path[0].y) / (path[path.length - 1].y - path[0].y);
  const eye = (k: number): Pose => { const ang = 0.62 * k, rr = R * pr(tOf(ey)); return { p: V(Math.cos(ang) * rr, ey, Math.sin(ang) * rr), n: V(Math.cos(ang), 0.1, Math.sin(ang)).normalize() }; };
  const Le = eye(-1), Re = eye(1);
  const bl = (k: number): Pose => { const bang = 1.05 * k, by = ey - er * 1.2, br = R * pr(tOf(by)); return { p: V(Math.cos(bang) * br, by, Math.sin(bang) * br), n: V(Math.cos(bang), 0, Math.sin(bang)) }; };
  addFace(g, Le, Re, er * 2.2, { blush: [bl(-1), bl(1)] });
  const my = ey - er * 1.5, mr = R * pr(tOf(my));
  addSmile(g, V(mr + 0.004, my, 0), V(1, 0, 0), er * 0.38);
  g.position.y = sq ? 0.1 : 0.12;
  const topY = path[path.length - 1].y;
  return { L: 0.6, nose: V(R, ey, 0), brow: V(0.05, topY - 0.03, 0), back: V(0, topY, 0), belly: V(0, -0.1, 0), tail: V(-R, ey, 0), center: V(0, (path[0].y + topY) / 2, 0), h: (topY - path[0].y) / 2, w: R, eye: er * 2.2, eyes: [Le, Re] };
}

// ───── 생성기 ─────
/** 한 마리 몸(파츠·장식까지) — 쌍둥이자리·물고기자리는 이걸 두 번 */
function buildCore(sp: FishSpecies, look: FishLook): { g: THREE.Group; A: Anchors } {
  const g = new THREE.Group();
  const b = B[look.shape];
  const A = b ? b(look, g) : fishBody(look, paramsFor(look), g);
  applyParts(g, look, A, sp);
  if (look.deco?.includes('upside-down')) { const w = new THREE.Group(); g.rotation.x = Math.PI; w.add(g); return { g: w, A }; }
  return { g, A };
}

export interface FishModelOpts {
  /** 개체마다 다른 값(숨쉬기 위상·색 변이) — ctx.rng(key) 나 rngFor(key) */
  rng?: () => number;
}

/**
 * 종 → 모델(THREE.Group). 머리 +x, 길이 약 1. 두 번째 인자는 rng 함수 또는 { rng }.
 * userData: fishId · breathePhase · squish · modelLen(가장 긴 변 m) · eyes(EyeSet — setHappy 로 '> <')
 * 숨쉬기는 그릴 때 저절로(art.breathe, 위상은 rng). 직접 시각을 넘기려면 animateFish(root, t).
 */
export function buildFishModel(sp: FishSpecies, opts?: FishModelOpts | (() => number)): THREE.Group {
  const rng = typeof opts === 'function' ? opts : opts?.rng;
  let look: FishLook = sp.look;
  // 예전 깃발 → 파츠(수염·창 주둥이)
  const parts = new Set(look.parts ?? []);
  if (look.whiskers && !parts.has('whiskers2') && !parts.has('whiskers4')) parts.add('whiskers2');
  if (look.bill) parts.add('spear');
  if (parts.size !== (look.parts?.length ?? 0)) look = { ...look, parts: [...parts] };
  if (look.variants?.length) {
    const i = Math.min(look.variants.length - 1, Math.floor((rng ? rng() : strHash(sp.id)) * look.variants.length));
    look = { ...look, colors: look.variants[i] };
  }
  const deco = new Set(look.deco ?? []);
  const inner = new THREE.Group();
  inner.name = 'fish-inner';
  if (deco.has('twin') || deco.has('twin-ribbon')) {
    // 별자리 쌍둥이: 나란히 붙은 두 마리 / 리본으로 이어진 반대 방향 두 마리
    const solo: FishLook = { ...look, deco: look.deco!.filter((d) => d !== 'twin' && d !== 'twin-ribbon') };
    const a = buildCore(sp, solo), b = buildCore(sp, solo);
    if (deco.has('twin')) {
      a.g.position.set(0.02, 0.02, -0.14); b.g.position.set(-0.02, -0.02, 0.14);
      a.g.scale.setScalar(0.78); b.g.scale.setScalar(0.78);
      a.g.rotation.y = 0.1; b.g.rotation.y = -0.1;
    } else {
      a.g.position.set(0.12, 0.18, 0); b.g.position.set(-0.12, -0.18, 0);
      a.g.scale.setScalar(0.66); b.g.scale.setScalar(0.66);
      b.g.rotation.y = Math.PI;
      const rib = glowMat(look.colors[2], 0.8);
      const ta = V(0.12 - 0.5 * 0.66, 0.18, 0), tb = V(-0.12 + 0.5 * 0.66, -0.18, 0);
      inner.add(tube([ta, V(-0.4, 0.05, 0.08), V(0, 0, 0.12), V(0.4, -0.05, 0.08), tb], 0.012, 0.012, rib));
    }
    inner.add(a.g, b.g);
  } else {
    inner.add(buildCore(sp, look).g);
  }
  return finish(inner, sp, look, rng);
}

const DEFAULT_CLOCK = () => (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;

/**
 * 그리기 호출 줄이기: 모델은 통째로만 움직이니(숨쉬기는 inner 배율) 같은 재질 조각을 하나로 굽는다.
 * 몸통(onBeforeRender)·눈·볼터치(표정 바꾸기)·이름 붙은 것은 그대로 둔다. 가시 46개 복어도 그리기 몇 번으로.
 */
function mergeByMaterial(inner: THREE.Group) {
  inner.updateMatrixWorld(true);
  const inv = inner.matrixWorld.clone().invert();
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || m.name || m.userData.eye) return;
    const mat = m.material as THREE.Material;
    if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial && mat.userData?.shared && mat !== MAT.star) return;
    let arr = groups.get(mat);
    if (!arr) groups.set(mat, (arr = []));
    arr.push(m);
  });
  const tmp = new THREE.Matrix4();
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const useColor = !!(mat as THREE.MeshStandardMaterial).vertexColors;
    const useUv = !!(mat as THREE.MeshStandardMaterial).map;
    const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const m of list) {
      tmp.multiplyMatrices(inv, m.matrixWorld);
      const geo = m.geometry.clone().applyMatrix4(tmp);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const P = geo.attributes.position as THREE.BufferAttribute, N = geo.attributes.normal as THREE.BufferAttribute;
      const Cc = geo.attributes.color as THREE.BufferAttribute | undefined, U = geo.attributes.uv as THREE.BufferAttribute | undefined;
      const base = pos.length / 3;
      for (let i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i));
        nor.push(N.getX(i), N.getY(i), N.getZ(i));
        if (useColor) col.push(Cc ? Cc.getX(i) : 1, Cc ? Cc.getY(i) : 1, Cc ? Cc.getZ(i) : 1);
        if (useUv) uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
      }
      const flip = tmp.determinant() < 0;
      const ii = geo.index ? Array.from(geo.index.array as ArrayLike<number>) : Array.from({ length: P.count }, (_, k) => k);
      for (let k = 0; k + 2 < ii.length; k += 3) {
        if (flip) idx.push(base + ii[k], base + ii[k + 2], base + ii[k + 1]);
        else idx.push(base + ii[k], base + ii[k + 1], base + ii[k + 2]);
      }
      geo.dispose();
      if (!m.geometry.userData?.shared) m.geometry.dispose();
      m.parent?.remove(m);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (useColor) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (useUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const merged = new THREE.Mesh(g, mat);
    merged.renderOrder = list[0].renderOrder;
    inner.add(merged);
  }
}

function finish(inner: THREE.Group, sp: FishSpecies, look: FishLook, rng?: () => number): THREE.Group {
  const root = new THREE.Group();
  let holder: THREE.Object3D = inner;
  // 납작한 것(가오리·넙치)은 등이 보이게 살짝 세운다
  if (look.shape === 'ray' || look.shape === 'flatfish') { const w = new THREE.Group(); w.rotation.x = 0.85; w.add(inner); holder = w; }
  root.add(holder);
  mergeByMaterial(inner);
  let eyes: unknown = null, body: THREE.Mesh | null = null;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (o.userData.eyes && !eyes) eyes = o.userData.eyes;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material;
    const decal = !!mat.userData?.shared && (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    m.castShadow = !decal && !mat.transparent;
    m.receiveShadow = false;
    if (!body && m.name === 'body') body = m;
  });
  const phase = rng ? rng() : strHash(sp.id);
  root.name = 'fish:' + sp.id;
  root.userData.fishId = sp.id;
  root.userData.breathePhase = phase;
  root.userData.squish = look.squish ?? 1;
  root.userData.inner = inner;
  root.userData.huecycle = look.pattern === 'huecycle';
  if (eyes) root.userData.eyes = eyes;
  const box = new THREE.Box3().setFromObject(root);
  const sz = box.getSize(V());
  root.userData.modelLen = Math.max(sz.x, sz.y, sz.z) || 1;
  // 그릴 때마다 숨쉬기(누가 animateFish 를 직접 부르면 그쪽 시각을 따른다)
  const b0 = body as THREE.Mesh | null;
  if (b0) {
    b0.onBeforeRender = () => { if (!root.userData.manualAnim) stepFish(root, DEFAULT_CLOCK()); };
  }
  return root;
}

function stepFish(root: THREE.Object3D, t: number) {
  const inner = root.userData.inner as THREE.Object3D | undefined;
  if (!inner) return;
  const phase = root.userData.breathePhase ?? 0, k = root.userData.squish ?? 1;
  if (k === 1) breathe(inner, t, phase);
  else {
    // 말랑(떡붕어): 위로 늘어나면 옆은 홀쭉 — 부피가 그대로인 스쿼시
    const s = 1 + (breatheScale(t, phase) - 1) * k;
    inner.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
  }
  if (root.userData.huecycle) {
    // 오로라송어: 보는 동안 빛깔이 천천히 돈다
    const body = inner.getObjectByName('body') as THREE.Mesh | undefined;
    const m = body?.material as THREE.MeshPhysicalMaterial | undefined;
    if (m?.color) m.color.setHSL(((t * 0.05 + phase) % 1 + 1) % 1, 0.45, 0.82);
  }
}

/** 시각 t(초)로 숨쉬기·빛깔 돌리기 — 부르면 그때부터 자동 숨쉬기 대신 이 시각을 쓴다 */
export function animateFish(root: THREE.Object3D, t: number) {
  root.userData.manualAnim = true;
  stepFish(root, t);
}

/** 세상 속 길이(m, GDD 0.8 = clamp(len/100, 0.18, 8)) */
export const worldLength = (sp: Pick<FishSpecies, 'len'>, sizeCm?: number) => worldLen(sizeCm ?? sp.len);

/** 모델을 세상 속 크기로 맞추는 배율(모델 길이 약 1 기준. model 을 주면 그 모델의 실제 길이로) */
export function worldScale(sp: Pick<FishSpecies, 'len'>, model?: THREE.Object3D, sizeCm?: number): number {
  const ml = (model?.userData.modelLen as number | undefined) ?? 1;
  return worldLength(sp, sizeCm) / ml;
}

/** 들어 올릴 때 보이는 크기(m): 0.55m(거대종 1.1m) 기준 + 개체 크기만큼 살짝(core hold 가 최종 정규화) */
export function displayScale(sp: FishSpecies, sizeCm: number): number {
  const base = holdLen(sp);
  const ratio = sp.len > 0 && sizeCm > 0 ? sizeCm / sp.len : 1;
  return base * THREE.MathUtils.clamp(Math.sqrt(ratio), 0.85, 1.2);
}

export function disposeModel(o: THREE.Object3D) {
  const shared = new Set<unknown>(Object.values(MAT));
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.userData?.shared) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mt of mats) if (!shared.has(mt) && !mt.userData?.shared) mt.dispose();
  });
}
