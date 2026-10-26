// 우주(달 표면): 몽글몽글 크레이터 지형(자체 trimesh 충돌) + 하늘의 지구·토성·별 + 착륙한 로켓(E 지구로 귀환)
// + 우주 생물 14종(E 잡기 → showCatch) + 별 조각(반짝이 수집품).
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { SPACE_ORIGIN } from '../core/game';
import { SPACE_SPECIES, type SpaceSpecies } from './space/data';
import { makeCreature, fur, G, starGeometry, type Creature } from './space/model';

export const order = 40;

const O = SPACE_ORIGIN;
const HALF = 260;
const SEG = 260;
/** 착륙한 로켓 자리(국소 좌표) — 시작 시선 왼쪽 앞에 랜드마크로 */
const RKX = -15, RKZ = -33;

interface Crater { x: number; z: number; r: number; d: number }

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const root = game.spaceRoot;
  const rnd = ctx.rng('space:craters');

  // ── 크레이터 ──
  const craters: Crater[] = [];
  for (let i = 0; i < 70 && craters.length < 46; i++) {
    const a = rnd() * Math.PI * 2, rr = 22 + rnd() * 200;
    const c = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, r: 4 + rnd() * rnd() * 22, d: 0 };
    c.d = c.r * (0.16 + rnd() * 0.08);
    if (craters.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < (o.r + c.r) * 0.8)) continue;
    craters.push(c);
  }
  craters.push({ x: -34, z: -46, r: 16, d: 3.0 }, { x: 40, z: 18, r: 9, d: 1.8 }, { x: 14, z: -20, r: 5, d: 1.0 },
    // 시작 시선(-Z) 앞 작은 크레이터들: 가까운 땅에도 굴곡·그늘이 보이게
    { x: -7, z: -11, r: 3.2, d: 0.7 }, { x: 5, z: -30, r: 6.5, d: 1.4 }, { x: -18, z: -24, r: 4.2, d: 0.9 }, { x: 9, z: 6, r: 2.6, d: 0.55 },
    { x: -12, z: 7, r: 3.6, d: 0.75 }, { x: 22, z: -48, r: 9, d: 1.9 }, { x: -3, z: -60, r: 7.5, d: 1.6 }, { x: 3, z: -6, r: 1.8, d: 0.4 });

  /** 국소 좌표 높이 + 크레이터 바닥 정도(0~1) */
  function hl(x: number, z: number) {
    let h = 1.2 + 1.1 * Math.sin(x * 0.021 + 0.7) * Math.cos(z * 0.017) + 0.55 * Math.sin(x * 0.052 + z * 0.031) + 0.25 * Math.sin(x * 0.13 - z * 0.11);
    // 발밑 잔물결(몽글몽글한 둔덕): 가까운 땅에도 빛과 그늘이 생기게
    h += 0.32 * Math.sin(x * 0.55 + Math.sin(z * 0.3) * 1.5) * Math.cos(z * 0.47 - 0.6) + 0.18 * Math.sin(x * 0.93 - z * 0.71 + 2.0);
    let bowl = 0, rim = 0;
    for (const c of craters) {
      const dx = x - c.x, dz = z - c.z;
      const d2 = (dx * dx + dz * dz) / (c.r * c.r);
      if (d2 > 2.6) continue;
      const d = Math.sqrt(d2);
      if (d < 1.05) { const k = 1 - Math.min(1, d2); const b = k * k * (3 - 2 * k); h -= c.d * b; bowl = Math.max(bowl, b); }
      const rr = Math.exp(-((d - 1.02) * (d - 1.02)) / 0.05);
      h += c.d * 0.42 * rr;
      rim = Math.max(rim, rr);
    }
    // 바깥 둘레: 낮고 둥근 언덕 능선 → 그 너머는 작은 별처럼 둥글게 떨어진다(검은 하늘 수평선이 보이게)
    const R = Math.hypot(x, z), ang = Math.atan2(z, x);
    const e = THREE.MathUtils.smoothstep(R, HALF * 0.66, HALF * 0.86);
    h += e * (5 + 3.2 * Math.sin(ang * 5) + 1.8 * Math.sin(ang * 13 + 1.1)) * (1 - THREE.MathUtils.smoothstep(R, HALF * 0.86, HALF * 0.97));
    const fall = Math.max(0, R - HALF * 0.86);
    h -= fall * fall * 0.012;
    return { h: Math.max(h, -60), bowl, rim, edge: e };
  }
  const heightLocal = (x: number, z: number) => hl(x, z).h;

  // ── 우주 전용 보조광(공간 그룹이 숨으면 같이 꺼진다): 역광 쪽 얼굴도 파스텔로 ──
  const fillHemi = new THREE.HemisphereLight('#cfc8ff', '#ffd9ee', 0.95);
  root.add(fillHemi);
  const fill = new THREE.DirectionalLight('#bcd0ff', 0.7);
  fill.position.set(O.x + 60, 50, O.z - 40);
  fill.target.position.copy(O);
  root.add(fill, fill.target);

  // ── 지형 메시 ──
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  // 밝은 라일락 고원 + 푸른 보라 '바다(마리아)' 얼룩 + 크레이터 안은 진한 보라 AO, 능선은 하얗게
  const cBase = new THREE.Color('#d9cff3'), cHigh = new THREE.Color('#efe9fd'), cMare = new THREE.Color('#a59de0'),
    cBowl = new THREE.Color('#6a56b4'), cRim = new THREE.Color('#fdfaff'), cPink = new THREE.Color('#f4c9e4'),
    cMint = new THREE.Color('#bfe6ec'), cFar = new THREE.Color('#7d78c4');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const s = hl(x, z);
    pos.setY(i, s.h);
    tmp.copy(cBase).lerp(cHigh, THREE.MathUtils.clamp((s.h - 1.6) * 0.45, 0, 1));
    // 큰 얼룩: 마리아(어두운 평원)·분홍 모래·민트 먼지
    const mare = Math.sin(x * 0.017 + 0.4) * Math.cos(z * 0.021 - 1.2) + 0.45 * Math.sin(x * 0.041 - z * 0.033);
    const pk = 0.5 + 0.5 * Math.sin(x * 0.011 + 1.3) * Math.sin(z * 0.013 - 0.4);
    const mt = 0.5 + 0.5 * Math.sin(x * 0.009 - 2.1) * Math.cos(z * 0.012 + 0.8);
    tmp.lerp(cMare, THREE.MathUtils.smoothstep(mare, 0.15, 0.85) * 0.75);
    tmp.lerp(cPink, Math.max(0, pk - 0.55) * 1.5).lerp(cMint, Math.max(0, mt - 0.6) * 1.5);
    // 크레이터: 안쪽 깊을수록 진한 보라(AO), 테두리 능선은 하얀 라일락
    tmp.lerp(cBowl, Math.min(1, Math.pow(s.bowl, 0.8) * 0.85)).lerp(cRim, s.rim * 0.9);
    // 멀리 능선·떨어지는 가장자리는 짙은 남보라(깊이감)
    const R = Math.hypot(x, z);
    tmp.lerp(cFar, THREE.MathUtils.smoothstep(R, HALF * 0.45, HALF * 0.95) * 0.55);
    // 중간 크기 얼룩(분홍·하늘 먼지 반점) — 단색 바닥이 안 되게
    const sp = Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.0) * Math.sin(z * 0.19 - Math.cos(x * 0.13) * 1.7);
    if (sp > 0.35) tmp.lerp(cPink, (sp - 0.35) * 0.55); else if (sp < -0.45) tmp.lerp(cMint, (-sp - 0.45) * 0.6);
    const n = (Math.sin(x * 1.7 + z * 2.3) * Math.sin(x * 2.9 - z * 1.1)) * 0.03 + (Math.sin(x * 0.37 + z * 0.29) * 0.025);
    col[i * 3] = tmp.r + n; col[i * 3 + 1] = tmp.g + n; col[i * 3 + 2] = tmp.b + n;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, emissive: '#3a2c78', emissiveIntensity: 0.1 }));
  ground.position.copy(O);
  ground.receiveShadow = true;
  root.add(ground);

  // 충돌: 같은 높이 함수로 2 m 격자 trimesh(한 덩어리, 우주에서만 존재)
  {
    const n = 200, step = (HALF * 2) / n;
    const vs = new Float32Array((n + 1) * (n + 1) * 3);
    const is = new Uint32Array(n * n * 6);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = -HALF + i * step, z = -HALF + j * step, k = (j * (n + 1) + i) * 3;
      vs[k] = O.x + x; vs[k + 1] = heightLocal(x, z); vs[k + 2] = O.z + z;
    }
    let q = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      is[q++] = a; is[q++] = c; is[q++] = b; is[q++] = b; is[q++] = c; is[q++] = d;
    }
    game.physics.add({ shape: { kind: 'mesh', vertices: vs, indices: is }, type: 'fixed', position: { x: 0, y: 0, z: 0 }, tag: 'ground' });
  }
  const worldH = (x: number, z: number) => heightLocal(x - O.x, z - O.z);

  // ── 바위·크리스털(InstancedMesh) ──
  const rockGeo = (() => {
    const g = new THREE.SphereGeometry(1, 20, 14);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.12 * Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 2.7 - y);
      p.setXYZ(i, x * k, Math.max(y, -0.35) * k * 0.72, z * k);
    }
    g.computeVertexNormals();
    return g;
  })();
  const rockR = ctx.rng('space:rocks');
  const ROCKS = 260;
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), ROCKS);
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3();
  const rockCols = ['#d9cff2', '#c8bce9', '#e8def8', '#f2d6ea', '#d3e9f0'];
  for (let i = 0; i < ROCKS; i++) {
    let x = 0, z = 0;
    for (let t = 0; t < 8; t++) {
      if (rockR() < 0.8) {
        // 크레이터 테두리에 모여 있는 바위(충돌로 튀어나온 느낌)
        const c = craters[Math.floor(rockR() * craters.length)];
        const a = rockR() * 6.28, rr = c.r * (1.0 + Math.pow(rockR(), 1.5) * 0.45);
        x = c.x + Math.cos(a) * rr; z = c.z + Math.sin(a) * rr;
      } else { x = (rockR() * 2 - 1) * HALF * 0.8; z = (rockR() * 2 - 1) * HALF * 0.8; }
      if (Math.hypot(x, z) > 9 && Math.hypot(x - RKX, z - RKZ) > 8 && Math.hypot(x, z) < HALF * 0.84) break;
    }
    const s = 0.3 + Math.pow(rockR(), 2.4) * 1.6;
    pp.set(O.x + x, worldH(O.x + x, O.z + z) + s * 0.05, O.z + z);
    qq.setFromEuler(new THREE.Euler(0, rockR() * 6.28, 0));
    sc.set(s * (0.8 + rockR() * 0.5), s, s * (0.8 + rockR() * 0.5));
    rocks.setMatrixAt(i, m4.compose(pp, qq, sc));
    rocks.setColorAt(i, new THREE.Color(rockCols[Math.floor(rockR() * rockCols.length)]));
  }
  rocks.castShadow = true; rocks.receiveShadow = true;
  root.add(rocks);

  // 작은 자갈 + 반짝 전구풀(빈 땅 없이)
  {
    const pr = ctx.rng('space:pebbles');
    const NP = 2600;
    const peb = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), NP);
    // 자갈은 크레이터 테두리(분출물 띠)에 군집: 큰 크레이터일수록 많이, 테두리 바깥으로 갈수록 듬성
    const wsum = craters.reduce((a, c) => a + c.r, 0);
    const pickC = () => { let u = pr() * wsum; for (const c of craters) { u -= c.r; if (u <= 0) return c; } return craters[0]; };
    for (let i = 0; i < NP; i++) {
      let x: number, z: number;
      if (i % 10 < 9) {
        const c = pickC();
        const a = pr() * 6.28, rr = c.r * (0.92 + Math.pow(pr(), 2) * 0.9);
        x = c.x + Math.cos(a) * rr; z = c.z + Math.sin(a) * rr;
      } else { const a = pr() * 6.28, r = Math.pow(pr(), 0.8) * HALF * 0.8; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      const s = 0.06 + pr() * pr() * 0.3;
      pp.set(O.x + x, heightLocal(x, z), O.z + z);
      qq.setFromEuler(new THREE.Euler(0, pr() * 6, 0));
      peb.setMatrixAt(i, m4.compose(pp, qq, sc.set(s * 1.3, s, s)));
      peb.setColorAt(i, new THREE.Color(rockCols[i % rockCols.length]).multiplyScalar(0.92));
    }
    peb.receiveShadow = true;
    root.add(peb);
    const NB = 900;
    const stem = new THREE.CylinderGeometry(0.025, 0.04, 1, 6); stem.translate(0, 0.5, 0);
    const bulb = new THREE.SphereGeometry(1, 16, 12);
    const stems = new THREE.InstancedMesh(stem, new THREE.MeshStandardMaterial({ color: '#d9cdf7', roughness: 0.7, emissive: '#9f8fd8', emissiveIntensity: 0.2 }), NB);
    const bulbs = new THREE.InstancedMesh(bulb, new THREE.MeshBasicMaterial({ color: '#ffffff' }), NB);
    const bCols = ['#ffb8e4', '#a8f0ff', '#d6c4ff', '#b8ffd9', '#fff1a8'];
    for (let i = 0; i < NB; i++) {
      // 무리 지어 핀다
      const ga = Math.floor(i / 7) * 2.39996, gr = Math.sqrt((Math.floor(i / 7) + 0.5) / (NB / 7)) * HALF * 0.5 + 3;
      const x = Math.cos(ga) * gr + (pr() - 0.5) * 3, z = Math.sin(ga) * gr + (pr() - 0.5) * 3;
      const hgt = 0.25 + pr() * 0.45, y = heightLocal(x, z);
      qq.setFromEuler(new THREE.Euler((pr() - 0.5) * 0.4, 0, (pr() - 0.5) * 0.4));
      stems.setMatrixAt(i, m4.compose(pp.set(O.x + x, y, O.z + z), qq, sc.set(1, hgt, 1)));
      const top = new THREE.Vector3(0, hgt, 0).applyQuaternion(qq);
      bulbs.setMatrixAt(i, m4.compose(pp.set(O.x + x + top.x, y + top.y, O.z + z + top.z), qq, sc.setScalar(0.07 + pr() * 0.06)));
      bulbs.setColorAt(i, new THREE.Color(bCols[Math.floor(i / 7) % bCols.length]));
    }
    root.add(stems, bulbs);
  }

  // 작은 구멍 크레이터(땅에 붙은 링 데칼): 가까운 땅에도 달 표면 결이 보이게
  {
    const prof: THREE.Vector2[] = [];
    const NPF = 14;
    for (let i = 0; i <= NPF; i++) {
      const r = (i / NPF) * 1.45;
      const y = r < 1 ? -0.12 * (1 - r * r) + 0.015 : 0.05 * Math.exp(-((r - 1.02) ** 2) / 0.015) + 0.015 * (1 - (r - 1) / 0.45);
      prof.push(new THREE.Vector2(Math.max(r, 0.001), y));
    }
    prof.reverse(); // 바깥→안쪽 순서여야 법선이 위를 본다
    const lg = new THREE.LatheGeometry(prof, 28);
    const lp = lg.attributes.position;
    const lc = new Float32Array(lp.count * 3);
    const cIn = new THREE.Color('#a093d8'), cRm = new THREE.Color('#ece6fb'), cOut = new THREE.Color('#d6ccf1');
    for (let i = 0; i < lp.count; i++) {
      const r = Math.hypot(lp.getX(i), lp.getZ(i));
      tmp.copy(cIn).lerp(cRm, THREE.MathUtils.smoothstep(r, 0.35, 1.0)).lerp(cOut, THREE.MathUtils.smoothstep(r, 1.05, 1.4));
      lc[i * 3] = tmp.r; lc[i * 3 + 1] = tmp.g; lc[i * 3 + 2] = tmp.b;
    }
    lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    lg.computeVertexNormals();
    const NC = 520;
    const cl = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, emissive: '#3a2c78', emissiveIntensity: 0.1, transparent: false }), NC);
    const clr = ctx.rng('space:craterlets');
    let k = 0;
    const placed: Array<[number, number, number]> = [];
    for (let i = 0; i < NC * 2 && k < NC; i++) {
      const a = clr() * 6.28, r = i < NC * 0.5 ? 3 + Math.pow(clr(), 0.9) * 55 : 20 + clr() * HALF * 0.6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s0 = hl(x, z);
      if (s0.bowl > 0.3 || s0.rim > 0.4 || s0.edge > 0.2 || Math.hypot(x - RKX, z - RKZ) < 5) continue;
      const s = 0.22 + Math.pow(clr(), 2.6) * 0.9;
      if (placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < (q[2] + s) * 1.6)) continue;
      placed.push([x, z, s]);
      // 지형 기울기에 맞춰 눕힌다
      const e = 0.4, nx = heightLocal(x - e, z) - heightLocal(x + e, z), nz = heightLocal(x, z - e) - heightLocal(x, z + e);
      qq.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 2 * e, nz).normalize());
      cl.setMatrixAt(k, m4.compose(pp.set(O.x + x, Math.min(heightLocal(x + s, z), heightLocal(x - s, z), heightLocal(x, z + s), heightLocal(x, z - s), s0.h) + 0.03, O.z + z), qq, sc.set(s, s * 0.9, s)));
      cl.setColorAt(k, new THREE.Color().setHSL(0.72 + clr() * 0.08, 0.3, 0.88 + clr() * 0.12));
      k++;
    }
    cl.count = k;
    cl.receiveShadow = true;
    root.add(cl);
  }

  const crystalGeo = new THREE.OctahedronGeometry(1, 0);
  crystalGeo.scale(0.45, 1.3, 0.45);
  const CRY = 160;
  const crystals = new THREE.InstancedMesh(crystalGeo, new THREE.MeshPhysicalMaterial({ roughness: 0.08, transmission: 0, clearcoat: 1, emissive: '#ffffff', emissiveIntensity: 0.35, flatShading: true }), CRY);
  const crR = ctx.rng('space:crystals');
  const cryCols = ['#ffb8e4', '#a8f0ff', '#c9b6ff', '#b8ffd9', '#fff1a8'];
  let ci = 0;
  for (let k = 0; ci < CRY && k < 400; k++) {
    const c = craters[Math.floor(crR() * craters.length)];
    const a = crR() * 6.28, rr = c.r * (0.9 + crR() * 0.3);
    const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
    if (Math.hypot(x, z) > HALF * 0.75) continue;
    // 덩어리(3개씩)
    for (let j = 0; j < 3 && ci < CRY; j++) {
      const s = 0.35 + crR() * 0.6;
      const xx = x + (crR() - 0.5) * 0.9, zz = z + (crR() - 0.5) * 0.9;
      pp.set(O.x + xx, worldH(O.x + xx, O.z + zz) + s * 0.5, O.z + zz);
      qq.setFromEuler(new THREE.Euler((crR() - 0.5) * 0.7, crR() * 6, (crR() - 0.5) * 0.7));
      crystals.setMatrixAt(ci, m4.compose(pp, qq, sc.setScalar(s)));
      crystals.setColorAt(ci, new THREE.Color(cryCols[(k + j) % cryCols.length]));
      ci++;
    }
  }
  crystals.count = ci;
  crystals.castShadow = true;
  root.add(crystals);

  // ── 하늘: 지구·토성·분홍 행성·반짝 별 (카메라를 따라다녀 무한히 멀리 보인다) ──
  const sky = new THREE.Group();
  sky.userData.noCurve = true;
  root.add(sky);
  const skyMat = (m: THREE.Material) => { m.userData.noCurve = true; (m as THREE.MeshBasicMaterial).fog = false; return m; };
  const earth = makeEarth(skyMat);
  earth.position.set(760, 70, -2700); earth.scale.setScalar(0.62); // 기본 시선(-Z) 오른쪽 수평선 위로 떠오르는 지구 = 랜드마크
  sky.add(earth);
  const saturn = makeSaturn(skyMat);
  saturn.position.set(-2300, 900, -2400);
  sky.add(saturn);
  const pinkP = new THREE.Mesh(new THREE.SphereGeometry(140, 48, 32), skyMat(new THREE.MeshStandardMaterial({ map: stripeTex(['#ffc4dd', '#ffd9e8', '#f7b0d0', '#ffe4ee']), roughness: 0.8, emissive: '#ff9fc8', emissiveIntensity: 0.35 })));
  pinkP.position.set(900, 2000, 2600);
  sky.add(pinkP);
  const mintP = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 24), skyMat(new THREE.MeshStandardMaterial({ map: stripeTex(['#a8f0de', '#d4fff1', '#8fe0cc']), roughness: 0.8, emissive: '#8fe0cc', emissiveIntensity: 0.15 })));
  mintP.position.set(-2600, 700, 900);
  sky.add(mintP);
  // 은하수 띠: 분홍·하늘빛 성운 먼지 + 촘촘한 별(하늘을 비스듬히 가로지른다)
  {
    const { c, g: x } = canvas(2048, 512);
    const mr = ctx.rng('space:milky');
    for (let i = 0; i < 520; i++) {
      const u = mr() * 2048, w = 0.5 + 0.5 * Math.sin(u / 2048 * Math.PI * 4 + 1);
      const v = 256 + (mr() + mr() + mr() - 1.5) * 70 * (0.6 + w * 0.6) + Math.sin(u * 0.004) * 30;
      const r = 20 + mr() * 70;
      const col = ['255,170,220', '160,200,255', '200,170,255', '255,230,200'][Math.floor(mr() * 4)];
      const gr = x.createRadialGradient(u, v, 0, u, v, r);
      gr.addColorStop(0, `rgba(${col},${0.05 + 0.07 * w})`); gr.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = gr; x.fillRect(u - r, v - r, r * 2, r * 2);
    }
    for (let i = 0; i < 2600; i++) {
      const u = mr() * 2048, v = 256 + (mr() + mr() + mr() + mr() - 2) * 70 + Math.sin(u * 0.004) * 30;
      x.fillStyle = `rgba(255,255,255,${0.25 + mr() * 0.6})`; x.fillRect(u, v, mr() < 0.1 ? 2 : 1, mr() < 0.1 ? 2 : 1);
    }
    const mt = tex(c); mt.wrapS = THREE.RepeatWrapping;
    const band = new THREE.Mesh(new THREE.SphereGeometry(3600, 64, 32), skyMat(new THREE.MeshBasicMaterial({ map: mt, transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 })));
    band.rotation.set(1.05, 0.4, 0.35);
    band.renderOrder = -1;
    band.userData.noCurve = true;
    sky.add(band);
  }
  // 반짝 별(4갈래 스프라이트)
  const sparkTex = sparkleTex();
  const twinkles: THREE.Sprite[] = [];
  const twR = ctx.rng('space:twinkle');
  const twCols = ['#ffffff', '#fff2b0', '#ffd0ea', '#c8e4ff'];
  for (let i = 0; i < 70; i++) {
    const a = twR() * 6.28, el = 0.12 + twR() * 1.2, d = 3800;
    const s = new THREE.Sprite(skyMat(new THREE.SpriteMaterial({ map: sparkTex, color: twCols[i % 4], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })) as THREE.SpriteMaterial);
    s.position.set(Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(a) * Math.cos(el) * d);
    const base = 30 + twR() * twR() * 110;
    s.scale.setScalar(base);
    s.userData = { base, ph: twR() * 6.28, noCurve: true };
    twinkles.push(s);
    sky.add(s);
  }

  // ── 착륙한 로켓 ──
  const rocket = makeRocket();
  const rx = O.x + RKX, rz = O.z + RKZ;
  rocket.position.set(rx, worldH(rx, rz) - 0.2, rz);
  rocket.rotation.y = 0.5;
  root.add(rocket);
  game.physics.addStatic({ kind: 'cylinder', halfH: 4, r: 1.9 }, { x: rx, y: worldH(rx, rz) + 4, z: rz });
  game.addInteractable({
    id: 'space-rocket', position: () => rocket.position, radius: 6, label: '지구로 귀환',
    enabled: () => game.world === 'space',
    onUse: () => { game.ui.toast('🚀 지구로 귀환!'); game.setWorld('earth'); },
  } as Parameters<typeof game.addInteractable>[0]);

  // ── 생물 ──
  game.state.register(SPACE_SPECIES);
  interface Spawn { sp: SpaceSpecies; m: Creature; base: THREE.Vector3; ph: number; goneUntil: number; wander: number }
  const spawns: Spawn[] = [];
  const cr = ctx.rng('space:creatures');
  // 시작 지점 주변에 한 바퀴씩(보이게), 나머지는 넓게
  const placements: Array<[number, number]> = [
    [-6, 6], [5, 9], [-11, -2], [9, -1], [-3, 13], [17, 8], [-16, 10], [2, -14], [-9, -12], [22, -4], [-22, -6], [12, 18], [-4, 22], [26, 12],
  ];
  const pick = (i: number) => {
    // 희귀종은 한 마리, 흔한 종은 여럿
    if (i < SPACE_SPECIES.length) return SPACE_SPECIES[i];
    const pool = SPACE_SPECIES.filter((s) => s.rarity <= 3);
    return pool[Math.floor(cr() * pool.length)];
  };
  const N = 34;
  for (let i = 0; i < N; i++) {
    const sp = pick(i);
    let x: number, z: number;
    if (i < placements.length) { [x, z] = placements[i]; z = -z * 1.1 - 3; } // 시작 시선(-Z) 앞에 보이게
    else { const a = cr() * 6.28, r = 30 + cr() * 150; x = Math.cos(a) * r; z = Math.sin(a) * r; }
    if (sp.kind === 'whale') { x = -40 + cr() * 20; z = 45 + cr() * 20; }
    const m = makeCreature(sp);
    const base = new THREE.Vector3(O.x + x, 0, O.z + z);
    base.y = worldH(base.x, base.z) + sp.hover * (sp.kind === 'whale' ? 1 : 1);
    if (sp.kind === 'whale') { base.y += 4; m.scale.multiplyScalar(2.2); m.traverse((o) => { o.castShadow = false; }); }
    m.position.copy(base);
    m.rotation.y = cr() * 6.28;
    root.add(m);
    spawns.push({ sp, m, base, ph: cr() * 10, goneUntil: 0, wander: 0.5 + cr() * 1.5 });
  }
  // 멀리 유영하는 거대 우주 고래(풍경용, 잡을 수 없음)
  const bigWhales: Creature[] = [];
  for (let i = 0; i < 2; i++) {
    const w = makeCreature(SPACE_SPECIES.find((s) => s.kind === 'whale')!);
    w.scale.setScalar(10 - i * 3);
    w.traverse((o) => { o.castShadow = false; });
    root.add(w);
    bigWhales.push(w);
  }

  const near = (p: THREE.Vector3) => {
    let best: Spawn | null = null, bd = 3.2;
    for (const s of spawns) {
      if (s.goneUntil > game.time) continue;
      const d = s.m.position.distanceTo(p) - s.m.userData.radius;
      if (d < bd) { bd = d; best = s; }
    }
    return best ? { s: best, d: bd } : null;
  };
  game.addProvider('space-catch', (pl) => {
    if (game.world !== 'space') return null;
    const n = near(pl.pos);
    if (!n) return null;
    return {
      label: `${n.s.sp.name} 잡기`, dist: n.d,
      use: () => {
        const s = n.s;
        const [lo, hi] = s.sp.cm;
        const size = lo + (hi - lo) * (0.5 + 0.5 * Math.sin(game.time * 7.3 + s.ph));
        const model = makeCreature(s.sp);
        model.scale.multiplyScalar(s.sp.kind === 'whale' ? 0.35 : 0.6);
        game.ui.showCatch({ species: s.sp, sizeText: `${size.toFixed(1)}cm`, model, line: s.sp.line });
        s.goneUntil = game.time + 25;
        s.m.visible = false;
      },
    };
  });

  // ── 별 조각(반짝이 수집품) ──
  const SH = 48;
  const shardGeo = starGeometry(0.32, 0.15, 0.12);
  const shards = new THREE.InstancedMesh(shardGeo, new THREE.MeshPhysicalMaterial({ color: '#ffe066', emissive: '#ffcc33', emissiveIntensity: 0.9, roughness: 0.2, clearcoat: 1 }), SH);
  const shR = ctx.rng('space:shards');
  const shardPos: THREE.Vector3[] = [];
  const shardGone: number[] = [];
  const shardCols = ['#ffe066', '#ffb3e0', '#a8e8ff', '#c7ffb0'];
  for (let i = 0; i < SH; i++) {
    const a = shR() * 6.28, r = i < 8 ? 4 + i * 2.2 : 12 + shR() * 170;
    const x = O.x + Math.cos(a) * r, z = O.z + Math.sin(a) * r;
    shardPos.push(new THREE.Vector3(x, worldH(x, z) + 0.9, z));
    shardGone.push(0);
    shards.setColorAt(i, new THREE.Color(shardCols[i % 4]));
  }
  shards.castShadow = true;
  root.add(shards);
  game.addProvider('space-shard', (pl) => {
    if (game.world !== 'space') return null;
    let bi = -1, bd = 2.2;
    for (let i = 0; i < SH; i++) {
      if (shardGone[i] > game.time) continue;
      const d = shardPos[i].distanceTo(pl.pos);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0) return null;
    return {
      label: '별 조각 줍기', dist: bd,
      use: () => { shardGone[bi] = game.time + 60; game.state.addItem('star-shard', 1); game.ui.toast('✨ 별 조각을 주웠다!'); },
    };
  });

  // ── 세계 전환 ──
  let prevTod = ctx.tod;
  game.onWorld((w) => {
    if (w === 'space') { prevTod = game.engine.todName === 'space' ? prevTod : game.engine.todName; game.engine.applyTod('space'); }
    else game.engine.applyTod(prevTod || 'day');
  });

  // ── 매 프레임 ──
  const cam = ctx.camera;
  ctx.onUpdate((t, dt) => {
    if (game.world !== 'space') return;
    // 안전망: 지형 아래(순간이동·전환 직후)면 표면 위로
    const pl = game.player;
    const gh = worldH(pl.pos.x, pl.pos.z);
    if (Math.abs(pl.pos.x - O.x) < HALF && Math.abs(pl.pos.z - O.z) < HALF && pl.pos.y < gh - 0.25) pl.teleport(pl.pos.x, pl.pos.z, gh + 0.05);
    // 가장자리(둥글게 떨어지는 곳) 너머로 못 나가게 살짝 되돌린다
    {
      const lx = pl.pos.x - O.x, lz = pl.pos.z - O.z, R = Math.hypot(lx, lz), lim = HALF * 0.84;
      if (R > lim && R < HALF * 3) { const k = lim / R; const nx = O.x + lx * k, nz = O.z + lz * k; pl.teleport(nx, nz, worldH(nx, nz) + 0.1); }
    }
    sky.position.copy(cam.position);
    earth.userData.clouds.rotation.y = t * 0.01;
    earth.rotation.y = 0.6 + t * 0.004;
    saturn.rotation.y = t * 0.003;
    for (const s of twinkles) s.scale.setScalar(s.userData.base * (0.75 + 0.35 * Math.sin(t * 2.3 + s.userData.ph)));
    for (const s of spawns) {
      if (!s.m.visible && s.goneUntil <= game.time) s.m.visible = true;
      if (!s.m.visible) continue;
      const tt = t + s.ph;
      s.m.userData.anim(tt);
      if (s.sp.hover === 0) {
        // 플레이어가 가까우면 쳐다본다(얼굴이 보이게)
        const dx = pl.pos.x - s.m.position.x, dz = pl.pos.z - s.m.position.z;
        if (dx * dx + dz * dz < 196) {
          const want = Math.atan2(dx, dz);
          let d = want - s.m.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
          s.m.rotation.y += d * (dt > 0 ? Math.min(1, dt * 4) : 1);
        }
      } else {
        const r = s.sp.kind === 'whale' ? 6 : 1.2;
        s.m.position.set(s.base.x + Math.sin(tt * 0.3 * s.wander) * r, s.base.y + Math.sin(tt * 0.9) * 0.3, s.base.z + Math.cos(tt * 0.25 * s.wander) * r);
        s.m.rotation.y = Math.atan2(Math.cos(tt * 0.3 * s.wander), -Math.sin(tt * 0.25 * s.wander) * 0.8) ;
      }
    }
    bigWhales.forEach((w, i) => {
      const a = t * (0.02 + i * 0.012) - Math.PI / 2 - 0.22 + i * 2.6, R = 320 + i * 120;
      w.position.set(O.x + Math.cos(a) * R, 30 + i * 30 + Math.sin(t * 0.2 + i) * 6, O.z + Math.sin(a) * R);
      w.rotation.y = -a;
      w.userData.anim(t + i);
    });
    for (let i = 0; i < SH; i++) {
      const p = shardPos[i];
      const gone = shardGone[i] > game.time;
      pp.set(p.x, p.y + Math.sin(t * 2 + i) * 0.15, p.z);
      qq.setFromEuler(new THREE.Euler(0, t * 1.8 + i, 0.2));
      shards.setMatrixAt(i, m4.compose(pp, qq, sc.setScalar(gone ? 0 : 0.75 + 0.1 * Math.sin(t * 5 + i))));
    }
    shards.instanceMatrix.needsUpdate = true;
  });
  void G; void fur;
}

// ───────── 하늘 오브젝트 ─────────
function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}
function tex(c: HTMLCanvasElement) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

function makeEarth(skyMat: (m: THREE.Material) => THREE.Material) {
  const g = new THREE.Group();
  const { c, g: x } = canvas(1024, 512);
  const grd = x.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#9fe4ff'); grd.addColorStop(0.5, '#4fb8f5'); grd.addColorStop(1, '#9fe4ff');
  x.fillStyle = grd; x.fillRect(0, 0, 1024, 512);
  // 대륙: 둥글둥글 블롭
  const blob = (cx: number, cy: number, r: number, n: number, seed: number) => {
    for (let i = 0; i < n; i++) {
      const a = seed + i * 2.39, d = r * 0.6 * Math.sqrt((i + 0.5) / n);
      const bx = cx + Math.cos(a) * d * 1.4, by = cy + Math.sin(a) * d, br = r * (0.35 + 0.25 * Math.sin(seed + i));
      x.fillStyle = '#c4f0a0'; x.beginPath(); x.arc(bx, by, br + 6, 0, Math.PI * 2); x.fill();
    }
    for (let i = 0; i < n; i++) {
      const a = seed + i * 2.39, d = r * 0.6 * Math.sqrt((i + 0.5) / n);
      const bx = cx + Math.cos(a) * d * 1.4, by = cy + Math.sin(a) * d, br = r * (0.35 + 0.25 * Math.sin(seed + i));
      x.fillStyle = i % 3 ? '#7fd67a' : '#9ce07a'; x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fill();
    }
  };
  blob(220, 200, 110, 14, 1); blob(300, 340, 70, 8, 3); blob(560, 190, 130, 16, 5); blob(620, 330, 80, 9, 7); blob(820, 250, 90, 10, 9); blob(900, 380, 40, 5, 2);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 1024, 26); x.fillRect(0, 490, 1024, 22);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(400, 64, 48), skyMat(new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.55, emissive: '#3a8fd8', emissiveIntensity: 0.3 })));
  g.add(earth);
  // 구름
  const cl = canvas(1024, 512);
  // 가늘고 길게 흐르는 구름 띠(몽글한 작은 구름 줄) — 대륙이 사이로 보이게
  for (let i = 0; i < 46; i++) {
    const bx = (i * 157.3) % 1024, by = 50 + ((i * 89.7) % 410), r = 6 + ((i * 37) % 10);
    cl.g.fillStyle = `rgba(255,255,255,${0.75 + 0.2 * ((i * 13) % 3) / 2})`;
    const n = 5 + (i % 4);
    for (let k = 0; k < n; k++) { cl.g.beginPath(); cl.g.arc(bx + k * r * 1.1, by + Math.sin(k * 0.9 + i) * 4, r * (1 - Math.abs(k - (n - 1) / 2) / n * 0.8), 0, Math.PI * 2); cl.g.fill(); }
  }
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(409, 64, 48), skyMat(new THREE.MeshStandardMaterial({ map: tex(cl.c), transparent: true, roughness: 1, depthWrite: false, emissive: '#ffffff', emissiveIntensity: 0.15 })));
  g.add(clouds);
  g.userData.clouds = clouds;
  // 대기 테두리 빛
  const halo = new THREE.Mesh(new THREE.SphereGeometry(440, 48, 32), skyMat(new THREE.MeshBasicMaterial({ color: '#8fd4ff', transparent: true, opacity: 0.22, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending })));
  g.add(halo);
  const halo2 = new THREE.Mesh(new THREE.SphereGeometry(480, 48, 32), skyMat(new THREE.MeshBasicMaterial({ color: '#6fb8ff', transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending })));
  g.add(halo2);
  g.traverse((o) => { o.userData.noCurve = true; });
  return g;
}

function stripeTex(cols: string[]) {
  const { c, g } = canvas(64, 256);
  for (let y = 0; y < 256; y++) {
    const k = y / 256;
    const i = Math.floor((k * cols.length * 2.3 + Math.sin(k * 20) * 0.4) % cols.length + cols.length) % cols.length;
    g.fillStyle = cols[i]; g.fillRect(0, y, 64, 1);
  }
  g.globalAlpha = 0.25; g.filter = 'blur(3px)'; g.drawImage(c, 0, 0);
  return tex(c);
}

function makeSaturn(skyMat: (m: THREE.Material) => THREE.Material) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.SphereGeometry(300, 64, 48), skyMat(new THREE.MeshStandardMaterial({ map: stripeTex(['#ffd9a8', '#ffe8c4', '#f7c08a', '#ffe1b8', '#f4b48a']), roughness: 0.75, emissive: '#ffb37a', emissiveIntensity: 0.4 })));
  g.add(p);
  const { c, g: x } = canvas(512, 8);
  for (let i = 0; i < 512; i++) { const k = i / 512; x.fillStyle = `rgba(${255},${200 + 40 * Math.sin(k * 30)},${210 + 40 * Math.cos(k * 17)},${0.25 + 0.6 * Math.abs(Math.sin(k * 9)) * (k > 0.08 && k < 0.95 ? 1 : 0)})`; x.fillRect(i, 0, 1, 8); }
  const rg = new THREE.RingGeometry(380, 620, 128, 1);
  const uv = rg.attributes.uv, pp = rg.attributes.position;
  for (let i = 0; i < uv.count; i++) { const r = Math.hypot(pp.getX(i), pp.getY(i)); uv.setXY(i, (r - 380) / 240, 0.5); }
  const ring = new THREE.Mesh(rg, skyMat(new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, side: THREE.DoubleSide, depthWrite: false, color: '#ffe6f0' })));
  ring.rotation.x = Math.PI / 2 - 0.35; ring.rotation.y = 0.25;
  g.add(ring);
  g.rotation.z = 0.25;
  g.traverse((o) => { o.userData.noCurve = true; });
  return g;
}

function sparkleTex() {
  const { c, g } = canvas(128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.12, 'rgba(255,255,255,0.8)'); r.addColorStop(0.35, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.moveTo(64, 0); g.quadraticCurveTo(68, 60, 128, 64); g.quadraticCurveTo(68, 68, 64, 128); g.quadraticCurveTo(60, 68, 0, 64); g.quadraticCurveTo(60, 60, 64, 0); g.fill();
  return tex(c);
}

function makeRocket() {
  const g = new THREE.Group();
  const body = new THREE.LatheGeometry(
    Array.from({ length: 24 }, (_, i) => { const k = i / 23; const y = k * 8.4; const r = 1.55 * Math.sin(Math.PI * Math.min(1, 0.1 + k * 0.95)) ** 0.6 * (k > 0.86 ? 1 - (k - 0.86) * 4 : 1); return new THREE.Vector2(Math.max(0.05, r), y); }),
    48,
  );
  body.computeVertexNormals();
  const white = new THREE.MeshPhysicalMaterial({ color: '#fff8f2', roughness: 0.35, clearcoat: 0.8 });
  const pink = new THREE.MeshPhysicalMaterial({ color: '#ff8fb5', roughness: 0.35, clearcoat: 0.8 });
  const mint = new THREE.MeshPhysicalMaterial({ color: '#7fdcc8', roughness: 0.35, clearcoat: 0.8 });
  const b = new THREE.Mesh(body, white); b.position.y = 1.4; b.castShadow = true; g.add(b);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2), pink);
  nose.scale.set(1.05, 1.6, 1.05); nose.position.y = 1.4 + 7.0; nose.castShadow = true; g.add(nose);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.18, 16, 48), pink); band.rotation.x = Math.PI / 2; band.position.y = 1.4 + 2.2; g.add(band);
  // 창문(동그란 현창 2개)
  for (const [y, s] of [[5.2, 0.62], [3.4, 0.42]] as const) {
    const win = new THREE.Group(); win.position.set(0, 1.4 + y, 0); g.add(win);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(s, 0.13, 16, 40), mint); rim.position.z = 1.52 * (y > 4 ? 0.98 : 1.0); win.add(rim);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(s, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#9fdcff', roughness: 0.05, clearcoat: 1, emissive: '#5fb0ff', emissiveIntensity: 0.35 }));
    glass.rotation.x = Math.PI / 2; glass.scale.z = 0.35; glass.position.z = rim.position.z - 0.02; win.add(glass);
  }
  // 날개(둥근 지느러미) 3개 + 다리
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), i === 0 ? pink : mint);
    fin.scale.set(0.22, 1.5, 1.0);
    fin.position.set(Math.sin(a) * 1.55, 2.0, Math.cos(a) * 1.55);
    fin.rotation.y = a;
    fin.castShadow = true;
    g.add(fin);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12), white);
    foot.scale.y = 0.5; foot.position.set(Math.sin(a) * 2.2, 0.25, Math.cos(a) * 2.2); g.add(foot);
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: '#fff2a8', emissive: '#ffe066', emissiveIntensity: 1.2 }));
  top.position.y = 1.4 + 8.6; g.add(top);
  // 엔진 노즐 + 사다리 대신 깃발
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 0.8, 32), new THREE.MeshStandardMaterial({ color: '#b9b0d8', roughness: 0.4, metalness: 0.4 }));
  noz.position.y = 1.0; g.add(noz);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), white); pole.position.set(3.4, 1.6, 1.2); g.add(pole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.04), pink); flag.position.set(4.05, 2.8, 1.2); g.add(flag);
  const st = new THREE.Mesh(G.star, new THREE.MeshStandardMaterial({ color: '#fff2a8', emissive: '#ffe066', emissiveIntensity: 0.6 })); st.scale.setScalar(0.25); st.position.set(4.05, 2.8, 1.25); g.add(st);
  g.scale.setScalar(1.0);
  return g;
}
