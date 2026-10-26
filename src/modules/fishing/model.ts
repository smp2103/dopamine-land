// 절차적 물고기·수생생물 모델 — 몸형 생성기 21종 × 색·무늬 변주. 전부 머리가 +x, 길이 약 1(원점 중심).
// 둥근 단면 스윕(충분히 쪼갠 곡면 + 부드러운 법선) + 정점색 그라디언트·무늬 + 큰 눈·하이라이트·볼터치.
import * as THREE from 'three';
import type { FishLook, FishSpecies } from './data';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const sm = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ───── 공유 재질(눈·볼) ─────
const MAT = {
  sclera: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: 0.6, emissive: '#ffffff', emissiveIntensity: 0.12 }),
  pupil: new THREE.MeshPhysicalMaterial({ color: '#2a1f2e', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 }),
  shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  blush: new THREE.MeshBasicMaterial({ color: '#ff8fa8', transparent: true, opacity: 0.55, depthWrite: false }),
  mouth: new THREE.MeshStandardMaterial({ color: '#7a3a44', roughness: 0.6 }),
  tooth: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
};

function bodyMat(look: FishLook, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3,
    sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color(look.colors[1]),
    transparent: !!look.clear, opacity: look.clear ? 0.78 : 1,
    emissive: look.glow ? new THREE.Color(look.colors[2]) : new THREE.Color('#000000'),
    emissiveIntensity: look.glow ? 0.35 : 0,
    ...extra,
  });
  // 동숲식 그늘 채움: 정점색을 살짝 자체발광으로(그늘이 회색으로 죽지 않게)
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance += vColor.rgb * 0.16;\n#endif',
    );
  };
  m.customProgramCacheKey = () => 'fishbody';
  return m;
}

function finMat(color: THREE.Color, look: FishLook): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.5, sheen: 0.8, sheenColor: color.clone().lerp(new THREE.Color('#ffffff'), 0.5),
    transparent: true, opacity: look.clear ? 0.6 : 0.88, side: THREE.DoubleSide,
    emissive: color, emissiveIntensity: look.glow ? 0.4 : 0.12,
  });
}

// ───── 스윕: 경로를 따라 타원(초타원) 단면을 이은 매끈한 몸 ─────
export interface Sweep {
  geo: THREE.BufferGeometry;
  /** 표면 점(t: 0 꼬리 → 1 머리, a: 단면 각도, off: 바깥으로 더 띄우기) + 바깥 방향 */
  at: (t: number, a: number, off?: number) => { p: THREE.Vector3; n: THREE.Vector3 };
}

function sweep(path: THREE.Vector3[], ry: (t: number) => number, rz: (t: number) => number, planeN: THREE.Vector3,
  color: (t: number, a: number, out: THREE.Color) => void, radial = 32, sq = 2): Sweep {
  const n = path.length;
  const T: THREE.Vector3[] = [], N: THREE.Vector3[] = [], B: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = path[Math.min(n - 1, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize();
    const b = planeN.clone().addScaledVector(t, -planeN.dot(t)).normalize();
    T.push(t); B.push(b); N.push(b.clone().cross(t).normalize());
  }
  const shapeR = (a: number) => {
    if (sq === 2) return 1;
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    return Math.pow(Math.pow(c, sq) + Math.pow(s, sq), -1 / sq);
  };
  const ringPt = (i: number, a: number, off = 0) => {
    const t = i / (n - 1);
    const k = shapeR(a);
    const dir = N[i].clone().multiplyScalar(Math.cos(a) * (ry(t) * k + off)).addScaledVector(B[i], Math.sin(a) * (rz(t) * k + off));
    return path[i].clone().add(dir);
  };
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  // 꼬리 극점
  pos.push(...path[0].toArray()); color(0, 0, c); col.push(c.r, c.g, c.b);
  for (let i = 1; i < n - 1; i++) {
    const t = i / (n - 1);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      pos.push(...ringPt(i, a).toArray());
      color(t, a, c); col.push(c.r, c.g, c.b);
    }
  }
  const tip = pos.length / 3;
  pos.push(...path[n - 1].toArray()); color(1, 0, c); col.push(c.r, c.g, c.b);
  const ring = (i: number) => 1 + (i - 1) * radial;
  for (let j = 0; j < radial; j++) {
    const j1 = (j + 1) % radial;
    idx.push(0, ring(1) + j1, ring(1) + j);
    for (let i = 1; i < n - 2; i++) {
      const a = ring(i) + j, b = ring(i) + j1, cc = ring(i + 1) + j, d = ring(i + 1) + j1;
      idx.push(a, b, d, a, d, cc);
    }
    idx.push(tip, ring(n - 2) + j, ring(n - 2) + j1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // 바깥쪽 감기 확인: 법선이 안쪽이면 뒤집는다
  const mid = Math.floor(n / 2);
  const p0 = ringPt(mid, 0.3), cen = path[mid];
  const nAttr = geo.attributes.normal as THREE.BufferAttribute;
  const vi = ring(mid) + Math.round((0.3 / (Math.PI * 2)) * radial);
  const nn = V(nAttr.getX(vi), nAttr.getY(vi), nAttr.getZ(vi));
  if (nn.dot(p0.clone().sub(cen)) < 0) {
    const ii = geo.index!.array as unknown as number[];
    for (let k = 0; k < ii.length; k += 3) { const tmp = ii[k + 1]; ii[k + 1] = ii[k + 2]; ii[k + 2] = tmp; }
    geo.index!.needsUpdate = true;
    geo.computeVertexNormals();
  }
  const at = (t: number, a: number, off = 0) => {
    const i = Math.max(1, Math.min(n - 2, Math.round(t * (n - 1))));
    const p = ringPt(i, a, off);
    return { p, n: p.clone().sub(path[i]).normalize() };
  };
  return { geo, at };
}

const straight = (x0: number, x1: number, n = 48, y = (_t: number) => 0) => {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1); out.push(V(x0 + (x1 - x0) * t, y(t), 0)); }
  return out;
};

/** 몸 단면 윤곽: peak 위치(0 꼬리 ~ 1 머리)에서 가장 굵고, blunt 작을수록 뭉툭 */
const prof = (peak: number, blunt: number) => {
  const a = Math.log(0.5) / Math.log(peak);
  return (t: number) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, t)), a))), blunt);
};

// ───── 색·무늬 ─────
function painter(look: FishLook, topAngle = 0, stripeFreq = 3.2, spotK = 0.085) {
  const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
  return (t: number, a: number, out: THREE.Color) => {
    const up = Math.cos(a - topAngle);
    out.copy(belly).lerp(top, sm(-0.55, 0.55, up));
    switch (look.pattern) {
      case 'grad': out.lerp(acc, sm(0.45, 0.0, t) * 0.75 * sm(-0.9, 0.2, up)); break;
      case 'stripe': {
        const s = Math.sin((t * stripeFreq * 2 - 0.25) * Math.PI);
        out.lerp(acc, sm(0.45, 0.7, s) * sm(0.08, 0.2, t) * sm(0.97, 0.85, t));
        break;
      }
      case 'band': out.lerp(acc, sm(0.42, 0.15, Math.abs(up)) * 0.9 * sm(0.05, 0.2, t)); break;
      case 'spots': {
        // 3D 셀 점무늬(몸 표면 근사 좌표) — 둥근 점·얼룩
        const px = t * 1.0 / spotK, py = Math.cos(a) * 0.26 / spotK, pz = Math.sin(a) * 0.26 / spotK;
        const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
        let d = 9;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
          const gx = cx + i, gy = cy + j, gz = cz + k;
          const h0 = hash(gx * 1.7 + gz * 5.3, gy * 3.1 - gz);
          if (h0 < 0.4) continue;
          const qx = gx + 0.25 + 0.5 * hash(gx + 7, gy + gz), qy = gy + 0.25 + 0.5 * hash(gx - gz, gy + 3), qz = gz + 0.25 + 0.5 * hash(gx + gz * 2, gy - 5);
          d = Math.min(d, Math.hypot(px - qx, py - qy, pz - qz) / (0.3 + 0.25 * hash(gx + 1, gy + gz + 1)));
        }
        out.lerp(acc, sm(1.0, 0.82, d) * sm(-0.9, -0.3, up) * sm(0.04, 0.12, t));
        break;
      }
    }
    // 코끝은 살짝 밝게(얼굴이 읽히게)
    out.lerp(belly, sm(0.86, 1.0, t) * 0.25);
  };
}

// ───── 부품 ─────
function addEye(g: THREE.Group, p: THREE.Vector3, out: THREE.Vector3, r: number, look: FishLook) {
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), MAT.sclera);
  sclera.position.copy(p).addScaledVector(out, -r * 0.2);
  g.add(sclera);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.74, 32, 24), MAT.pupil);
  pupil.position.copy(sclera.position).addScaledVector(out, r * 0.34);
  g.add(pupil);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(r * 0.27, 16, 12), MAT.shine);
  shine.position.copy(pupil.position).addScaledVector(out, r * 0.6).add(V(r * 0.2, r * 0.3, 0));
  g.add(shine);
  const shine2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.12, 12, 8), MAT.shine);
  shine2.position.copy(pupil.position).addScaledVector(out, r * 0.62).add(V(-r * 0.22, -r * 0.22, 0));
  g.add(shine2);
}

function addBlush(g: THREE.Group, p: THREE.Vector3, out: THREE.Vector3, r: number) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12), MAT.blush);
  m.position.copy(p).addScaledVector(out, 0.004);
  m.lookAt(m.position.clone().add(out));
  m.scale.set(1, 0.62, 0.18);
  m.renderOrder = 2;
  g.add(m);
}

/** 미소: 바라보는 방향 fwd(+x 등), 크기 w */
function addSmile(g: THREE.Group, p: THREE.Vector3, fwd: THREE.Vector3, w: number, teeth = false) {
  const geo = new THREE.TorusGeometry(w, w * 0.16, 10, 24, Math.PI);
  const m = new THREE.Mesh(geo, MAT.mouth);
  m.position.copy(p);
  // 토러스 호(위쪽 반원)를 뒤집어 ∪ 로, 그리고 fwd 를 향하게
  m.lookAt(p.clone().add(fwd));
  m.rotateZ(Math.PI);
  g.add(m);
  if (teeth) {
    for (const s of [-0.5, 0.5]) {
      const tt = new THREE.Mesh(new THREE.ConeGeometry(w * 0.22, w * 0.4, 10), MAT.tooth);
      tt.position.copy(p);
      tt.lookAt(p.clone().add(fwd));
      tt.translateX(s * w * 0.9);
      tt.translateY(-w * 0.55);
      tt.rotateX(Math.PI / 2);
      tt.rotateX(Math.PI);
      g.add(tt);
    }
  }
}

function finGeo(shape: THREE.Shape, thick = 0.008): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3, curveSegments: 24 });
  g.translate(0, 0, -thick / 2);
  g.computeVertexNormals();
  return g;
}

/** 둥근 지느러미 혹: 밑변 b0(뒤)~b1(앞), 높이 h, 꼭짓점 위치 k(0 뒤 ~ 1 앞) */
function humpShape(b0: number, b1: number, h: number, k = 0.3): THREE.Shape {
  const s = new THREE.Shape();
  const ax = b0 + (b1 - b0) * k;
  s.moveTo(b1, 0);
  s.quadraticCurveTo(b1 - (b1 - b0) * 0.1, h * 0.9, ax, h);
  s.quadraticCurveTo(b0 - (b1 - b0) * 0.25, h * 1.05, b0, 0);
  s.lineTo(b1, 0);
  return s;
}

function tailShape(kind: 'fan' | 'fork' | 'fancy' | 'crescent', s: number): THREE.Shape {
  const sh = new THREE.Shape();
  if (kind === 'fan') {
    sh.moveTo(0.02, 0.03 * s);
    sh.bezierCurveTo(-0.12 * s, 0.12 * s, -0.24 * s, 0.24 * s, -0.3 * s, 0.2 * s);
    sh.bezierCurveTo(-0.34 * s, 0.1 * s, -0.34 * s, -0.1 * s, -0.3 * s, -0.2 * s);
    sh.bezierCurveTo(-0.24 * s, -0.24 * s, -0.12 * s, -0.12 * s, 0.02, -0.03 * s);
  } else if (kind === 'fork') {
    sh.moveTo(0.02, 0.025 * s);
    sh.bezierCurveTo(-0.1 * s, 0.1 * s, -0.22 * s, 0.24 * s, -0.3 * s, 0.24 * s);
    sh.quadraticCurveTo(-0.2 * s, 0.06 * s, -0.17 * s, 0);
    sh.quadraticCurveTo(-0.2 * s, -0.06 * s, -0.3 * s, -0.24 * s);
    sh.bezierCurveTo(-0.22 * s, -0.24 * s, -0.1 * s, -0.1 * s, 0.02, -0.025 * s);
  } else if (kind === 'fancy') {
    sh.moveTo(0.02, 0.04 * s);
    sh.bezierCurveTo(-0.2 * s, 0.34 * s, -0.5 * s, 0.4 * s, -0.56 * s, 0.22 * s);
    sh.bezierCurveTo(-0.5 * s, 0.12 * s, -0.36 * s, 0.06 * s, -0.3 * s, 0);
    sh.bezierCurveTo(-0.36 * s, -0.06 * s, -0.5 * s, -0.12 * s, -0.56 * s, -0.22 * s);
    sh.bezierCurveTo(-0.5 * s, -0.4 * s, -0.2 * s, -0.34 * s, 0.02, -0.04 * s);
  } else {
    sh.moveTo(0.03, 0.03 * s);
    sh.bezierCurveTo(-0.08 * s, 0.12 * s, -0.16 * s, 0.32 * s, -0.2 * s, 0.4 * s);
    sh.quadraticCurveTo(-0.16 * s, 0.1 * s, -0.1 * s, 0);
    sh.quadraticCurveTo(-0.15 * s, -0.1 * s, -0.18 * s, -0.28 * s);
    sh.bezierCurveTo(-0.13 * s, -0.22 * s, -0.06 * s, -0.1 * s, 0.03, -0.03 * s);
  }
  return sh;
}

function ellipsoidMesh(rx: number, ry: number, rz: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const g = new THREE.SphereGeometry(1, 32, 24);
  g.scale(rx, ry, rz);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  return m;
}

/** 단색 관(촉수·다리·수염·더듬이) */
function tube(points: THREE.Vector3[], r0: number, r1: number, mat: THREE.Material, planeN = V(0, 0, 1)): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const path = curve.getPoints(28);
  const s = sweep(path, (t) => (r0 + (r1 - r0) * t) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.5 + 0.5)) * 0 + 1, 1) * sm(0, 0.06, t) * sm(1, 0.94, t) + 0.0001,
    (t) => (r0 + (r1 - r0) * t) * sm(0, 0.06, t) * sm(1, 0.94, t) + 0.0001, planeN, (_t, _a, c) => c.setRGB(1, 1, 1), 14);
  return new THREE.Mesh(s.geo, mat);
}

function solidMat(color: THREE.Color | string, look?: FishLook): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c, roughness: 0.45, clearcoat: 0.4, sheen: 0.5, sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.5),
    emissive: c, emissiveIntensity: look?.glow ? 0.35 : 0.14,
    transparent: !!look?.clear, opacity: look?.clear ? 0.75 : 1,
  });
}

// ───── 물고기형(옆으로 납작·둥근·길쭉·높은·복어·상어 …) ─────
interface FishParams {
  ry: number; rz: number; peak: number; blunt: number; len?: number; sq?: number;
  tail: 'fan' | 'fork' | 'fancy' | 'crescent' | 'none'; tailS: number;
  dorsal?: [number, number, number, number]; anal?: [number, number, number, number];
  eyeT: number; eyeA: number; eyeR: number;
  pect?: number; stripe?: number; bend?: (p: THREE.Vector3) => void;
}

function fishBody(look: FishLook, P: FishParams, g: THREE.Group): Sweep {
  const L = P.len ?? 1;
  const pr = prof(P.peak, P.blunt);
  const s = sweep(straight(-L / 2, L / 2, 96), (t) => P.ry * pr(t), (t) => P.rz * pr(t), V(0, 0, 1), painter(look, 0, P.stripe ?? 3.2, look.shape === 'whaleshark' ? 0.06 : 0.085), 56, P.sq ?? 2);
  if (P.bend) {
    const pa = s.geo.attributes.position as THREE.BufferAttribute;
    const v = V();
    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); P.bend(v); pa.setXYZ(i, v.x, v.y, v.z); }
    s.geo.computeVertexNormals();
  }
  const body = new THREE.Mesh(s.geo, bodyMat(look));
  g.add(body);
  const acc = new THREE.Color(look.colors[2]), top = new THREE.Color(look.colors[0]);
  const finC = (look.pattern === 'none' ? top.clone().lerp(new THREE.Color('#ffffff'), 0.25) : acc.clone().lerp(top, 0.35));
  const fm = finMat(finC, look);
  // 꼬리
  if (P.tail !== 'none') {
    const kind = look.fancy ? 'fancy' : P.tail;
    const tg = finGeo(tailShape(kind, P.tailS * (look.fancy ? 1.15 : 1)));
    const tail = new THREE.Mesh(tg, fm);
    tail.position.set(-L / 2 + 0.06 * L, 0, 0);
    g.add(tail);
    if (look.fancy) { const t2 = tail.clone(); t2.rotation.x = 0.5; t2.scale.setScalar(0.85); g.add(t2); const t3 = tail.clone(); t3.rotation.x = -0.5; t3.scale.setScalar(0.85); g.add(t3); }
  }
  // 등·뒷지느러미
  if (P.dorsal) {
    const [b0, b1, h, k] = P.dorsal;
    const mid = (b0 + b1) / 2 + 0.5;
    const y0 = P.ry * pr(mid) - 0.03;
    const d = new THREE.Mesh(finGeo(humpShape(b0, b1, h * (look.fancy ? 1.3 : 1), k)), fm);
    d.position.y = y0;
    g.add(d);
  }
  if (P.anal) {
    const [b0, b1, h, k] = P.anal;
    const mid = (b0 + b1) / 2 + 0.5;
    const y0 = -P.ry * pr(mid) + 0.03;
    const a = new THREE.Mesh(finGeo(humpShape(b0, b1, h, k)), fm);
    a.scale.y = -1;
    a.position.y = y0;
    g.add(a);
  }
  // 가슴지느러미
  const pect = P.pect ?? 0.1;
  if (pect > 0) {
    for (const side of [1, -1]) {
      const at = s.at(P.eyeT - 0.14, Math.PI / 2 * side + 0.35 * side, 0);
      const big = look.wings ? 2.6 : 1;
      const f = ellipsoidMesh(pect * big, pect * 0.42 * (look.wings ? 1.6 : 1), 0.014, fm);
      f.position.copy(at.p);
      f.position.x -= pect * 0.55 * big;
      f.rotation.set(-0.5 * side, -0.55 * side, -0.35);
      g.add(f);
    }
  }
  // 눈·볼·입
  for (const side of [1, -1]) {
    const e = s.at(P.eyeT, P.eyeA * side + (side < 0 ? 0 : 0), 0);
    // a 는 0=위, π/2=+z 옆
    const ee = s.at(P.eyeT, side > 0 ? P.eyeA : -P.eyeA, 0);
    void e;
    const out = ee.n.clone().add(V(0.45, 0.05, 0)).normalize();
    addEye(g, ee.p, out, P.eyeR * 1.22, look);
    const b = s.at(P.eyeT - 0.07, side > 0 ? P.eyeA + 0.7 : -(P.eyeA + 0.7), 0);
    addBlush(g, b.p, b.n, P.eyeR * 0.75);
  }
  const nose = s.at(0.975, Math.PI * 0.62, 0);
  addSmile(g, nose.p.clone().add(V(0.006, 0, 0)), V(1, -0.1, 0).normalize(), P.eyeR * 0.5);
  if (look.whiskers) {
    const wm = solidMat(new THREE.Color(look.colors[0]).multiplyScalar(0.8));
    for (const side of [1, -1]) {
      const m0 = s.at(0.96, side * Math.PI * 0.7, -0.005).p;
      g.add(tube([m0, m0.clone().add(V(0.06, -0.04, side * 0.04)), m0.clone().add(V(0.08, -0.12, side * 0.08))], 0.008, 0.004, wm));
    }
  }
  if (look.bill) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.35, 16), solidMat(look.colors[0]));
    c.rotation.z = -Math.PI / 2;
    c.position.set(L / 2 + 0.15, 0.01, 0);
    g.add(c);
  }
  return s;
}

const PRESET: Record<string, FishParams> = {
  round: { ry: 0.33, rz: 0.22, peak: 0.6, blunt: 0.5, tail: 'fan', tailS: 1, dorsal: [-0.22, 0.12, 0.13, 0.3], anal: [-0.28, -0.12, 0.07, 0.3], eyeT: 0.8, eyeA: 1.22, eyeR: 0.088 },
  long: { ry: 0.19, rz: 0.15, peak: 0.6, blunt: 0.45, tail: 'fork', tailS: 0.85, dorsal: [-0.12, 0.08, 0.09, 0.3], anal: [-0.28, -0.15, 0.05, 0.3], eyeT: 0.85, eyeA: 1.25, eyeR: 0.064, stripe: 4.2 },
  tall: { ry: 0.42, rz: 0.13, peak: 0.55, blunt: 0.5, tail: 'fan', tailS: 0.85, dorsal: [-0.32, 0.1, 0.22, 0.2], anal: [-0.32, 0.0, 0.18, 0.2], eyeT: 0.8, eyeA: 1.15, eyeR: 0.08, stripe: 2.6 },
  angler: { ry: 0.36, rz: 0.3, peak: 0.66, blunt: 0.4, tail: 'fan', tailS: 0.8, dorsal: [-0.22, -0.02, 0.08, 0.3], eyeT: 0.82, eyeA: 1.0, eyeR: 0.072 },
  shark: { ry: 0.19, rz: 0.17, peak: 0.55, blunt: 0.5, tail: 'crescent', tailS: 1, dorsal: [-0.06, 0.12, 0.2, 0.15], anal: [-0.3, -0.22, 0.05, 0.3], eyeT: 0.86, eyeA: 1.15, eyeR: 0.05, pect: 0.13 },
  whaleshark: { ry: 0.19, rz: 0.22, peak: 0.7, blunt: 0.32, tail: 'crescent', tailS: 1, dorsal: [-0.1, 0.06, 0.15, 0.15], eyeT: 0.9, eyeA: 1.05, eyeR: 0.045, pect: 0.14, sq: 2.6 },
  puffer: { ry: 0.4, rz: 0.38, peak: 0.52, blunt: 0.32, tail: 'fan', tailS: 0.55, dorsal: [-0.12, 0.0, 0.06, 0.3], eyeT: 0.76, eyeA: 1.1, eyeR: 0.1, pect: 0.07, len: 0.9 },
  box: { ry: 0.3, rz: 0.27, peak: 0.55, blunt: 0.25, tail: 'fan', tailS: 0.6, eyeT: 0.8, eyeA: 1.1, eyeR: 0.09, pect: 0.07, sq: 4.5, len: 0.9 },
  sunfish: { ry: 0.4, rz: 0.12, peak: 0.42, blunt: 0.3, tail: 'none', tailS: 1, dorsal: [-0.32, 0.0, 0.3, 0.45], anal: [-0.32, 0.0, 0.3, 0.45], eyeT: 0.82, eyeA: 1.1, eyeR: 0.075, len: 0.8 },
};

// ───── 생성기 ─────
export function buildFishModel(sp: FishSpecies): THREE.Group {
  const look = sp.look;
  const g = new THREE.Group();
  const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
  switch (look.shape) {
    case 'round': case 'long': case 'tall': case 'angler': case 'puffer': case 'box': case 'sunfish': case 'shark': case 'whaleshark': {
      const P = { ...PRESET[look.shape] };
      if (sp.id === 'fish-blobfish') { P.blunt = 0.35; P.peak = 0.75; P.eyeR = 0.06; P.dorsal = undefined; P.bend = (v) => { v.y -= 0.08 * sm(0.1, 0.5, v.x) * sm(-0.1, -0.3, v.y); }; }
      if (sp.id === 'fish-sturgeon') { P.peak = 0.45; }
      const s = fishBody(look, P, g);
      if (look.shape === 'puffer' || sp.id === 'fish-sea-urchin') {
        const urchin = sp.id === 'fish-sea-urchin';
        const spikeM = solidMat(urchin ? top.clone().multiplyScalar(0.8) : belly.clone().lerp(top, 0.4));
        const sg = new THREE.ConeGeometry(urchin ? 0.018 : 0.022, urchin ? 0.2 : 0.07, 10);
        sg.translate(0, urchin ? 0.1 : 0.035, 0);
        for (let i = 0; i < (urchin ? 90 : 46); i++) {
          const t = 0.18 + 0.62 * hash(i, 3), a = hash(i, 9) * Math.PI * 2;
          const at = s.at(t, a, -0.005);
          if (!urchin && Math.abs(at.p.x - 0.22) < 0.12 && at.p.y > -0.05 && Math.abs(at.p.z) > 0.15) continue; // 눈 자리 비우기
          const m = new THREE.Mesh(sg, spikeM);
          m.position.copy(at.p);
          m.quaternion.setFromUnitVectors(V(0, 1, 0), at.n);
          g.add(m);
        }
      }
      if (look.shape === 'angler') {
        const lureM = solidMat(acc); lureM.emissiveIntensity = 1.2;
        const base = s.at(0.82, 0, -0.01).p;
        g.add(tube([base, base.clone().add(V(0.05, 0.18, 0)), base.clone().add(V(0.2, 0.26, 0)), base.clone().add(V(0.3, 0.2, 0))], 0.012, 0.008, solidMat(top)));
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), lureM);
        bulb.position.copy(base).add(V(0.31, 0.17, 0));
        g.add(bulb);
        const nose = s.at(0.97, Math.PI * 0.6, 0);
        addSmile(g, nose.p.clone().add(V(0.01, -0.01, 0)), V(1, 0, 0), 0.06, true);
      }
      if (sp.id === 'fish-hammerhead') {
        const hm = ellipsoidMesh(0.07, 0.05, 0.2, bodyMat(look));
        const geo = hm.geometry as THREE.BufferGeometry;
        const cc: number[] = []; for (let i = 0; i < geo.attributes.position.count; i++) { const y = geo.attributes.position.getY(i); const c = belly.clone().lerp(top, sm(-0.03, 0.02, y)); cc.push(c.r, c.g, c.b); }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
        hm.position.set(0.44, 0.02, 0);
        g.add(hm);
        for (const side of [1, -1]) addEye(g, V(0.45, 0.04, side * 0.2), V(0.4, 0.1, side).normalize(), 0.045, look);
      }
      break;
    }
    case 'flatfish': {
      const pr = prof(0.55, 0.5);
      const paint = painter(look, 0);
      const s = sweep(straight(-0.5, 0.5, 56), (t) => 0.07 * pr(t), (t) => 0.36 * pr(t), V(0, 0, 1), paint, 40);
      g.add(new THREE.Mesh(s.geo, bodyMat(look)));
      const fringe = ellipsoidMesh(0.5, 0.025, 0.42, finMat(top.clone().lerp(belly, 0.3), look), -0.03, 0, 0);
      g.add(fringe);
      const tail = new THREE.Mesh(finGeo(tailShape('fan', 0.7)), finMat(top.clone().lerp(acc, 0.3), look));
      tail.rotation.x = Math.PI / 2;
      tail.position.x = -0.46;
      g.add(tail);
      const side = sp.id === 'fish-gwangeo' ? -1 : 1;
      for (const k of [0.1, -0.1]) {
        const e = s.at(0.8 + k * 0.3, k * 4 * side, 0);
        addEye(g, e.p.clone().add(V(0, 0.01, 0)), V(0.35, 1, k * 1.5).normalize(), 0.06, look);
      }
      for (const k of [1, -1]) { const b = s.at(0.68, k * 0.9, 0); addBlush(g, b.p, V(0, 1, 0), 0.045); }
      addSmile(g, s.at(0.97, 0.1, 0).p.add(V(0, 0.02, 0)), V(0.5, 1, 0).normalize(), 0.025);
      break;
    }
    case 'ray': {
      const pr = prof(0.5, 0.75);
      const s = sweep(straight(-0.42, 0.42, 56), (t) => 0.075 * prof(0.55, 0.5)(t), (t) => 0.52 * pr(t), V(0, 0, 1), painter(look, 0), 48);
      const pa = s.geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) { const z = pa.getZ(i); pa.setY(i, pa.getY(i) + 0.14 * Math.pow(Math.abs(z) / 0.52, 2.2) - 0.03); }
      s.geo.computeVertexNormals();
      g.add(new THREE.Mesh(s.geo, bodyMat(look)));
      g.add(tube([V(-0.38, 0, 0), V(-0.6, 0.02, 0.04), V(-0.85, 0.05, -0.02)], 0.03, 0.006, solidMat(top)));
      for (const k of [1, -1]) {
        const e = s.at(0.74, 0.45 * k, 0);
        addEye(g, e.p.clone().add(V(0, 0.01, 0)), V(0.5, 1, 0.4 * k).normalize(), 0.055, look);
        const b = s.at(0.66, 0.85 * k, 0);
        addBlush(g, b.p.add(V(0, 0.02, 0)), V(0, 1, 0), 0.04);
      }
      // 만타는 머리 앞 두 갈래 지느러미
      if (sp.id === 'fish-manta') for (const k of [1, -1]) { const c = ellipsoidMesh(0.08, 0.02, 0.03, solidMat(top), 0.43, 0.0, 0.1 * k); c.rotation.y = 0.5 * k; g.add(c); }
      addSmile(g, V(0.42, -0.005, 0), V(1, 0.2, 0).normalize(), 0.035);
      break;
    }
    case 'eel': {
      const path: THREE.Vector3[] = [];
      for (let i = 0; i < 72; i++) { const t = i / 71; path.push(V(-0.55 + 1.1 * t, 0, 0.07 * Math.sin((1 - t) * Math.PI * 2.2) * (1 - t))); }
      const pr = prof(0.72, 0.3);
      const s = sweep(path, (t) => 0.1 * pr(t) + 0.004, (t) => 0.12 * pr(t) + 0.004, V(0, 1, 0), painter(look, Math.PI / 2, 5), 32);
      g.add(new THREE.Mesh(s.geo, bodyMat(look)));
      // 등 리본 지느러미(산갈치는 빨간 볏)
      const ribbon = new THREE.Shape();
      ribbon.moveTo(0.42, 0); ribbon.quadraticCurveTo(0.4, 0.1, 0.3, 0.05); ribbon.lineTo(-0.5, 0.03); ribbon.lineTo(-0.5, 0); ribbon.lineTo(0.42, 0);
      const fin = new THREE.Mesh(finGeo(ribbon, 0.004), finMat(acc.clone().lerp(top, 0.2), look));
      fin.position.y = 0.08;
      g.add(fin);
      for (const k of [1, -1]) {
        const e = s.at(0.93, Math.PI / 2 + k * 1.0, 0);
        addEye(g, e.p, e.n.clone().add(V(0.5, 0.2, 0)).normalize(), 0.055, look);
        const b = s.at(0.88, Math.PI / 2 + k * 1.6, 0);
        addBlush(g, b.p, b.n, 0.022);
      }
      addSmile(g, s.at(0.985, Math.PI / 2 - Math.PI * 0.6, 0).p.add(V(0.004, 0, 0)), V(1, 0, 0), 0.016);
      break;
    }
    case 'seahorse': {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) { const s = i / 10; const th = Math.PI * 2.1 * (1 - s) - Math.PI * 0.5; const rr = 0.025 + 0.07 * s; pts.push(V(0.03 + rr * Math.cos(th), -0.34 + rr * Math.sin(th), 0)); }
      pts.push(V(0.1, -0.2, 0), V(0.12, -0.06, 0), V(0.08, 0.08, 0), V(0.02, 0.18, 0));
      const path = new THREE.CatmullRomCurve3(pts).getPoints(70);
      const r = (t: number) => 0.012 + 0.085 * sm(0.3, 0.72, t) * (1 - 0.35 * sm(0.85, 1, t));
      const s = sweep(path, r, (t) => r(t) * 0.85, V(0, 0, 1), painter(look, Math.PI, 8), 28);
      g.add(new THREE.Mesh(s.geo, bodyMat(look)));
      const hm = bodyMat(look);
      const headGeo = new THREE.SphereGeometry(1, 32, 24); headGeo.scale(0.13, 0.11, 0.1);
      const hc: number[] = []; for (let i = 0; i < headGeo.attributes.position.count; i++) { const y = headGeo.attributes.position.getY(i); const c = belly.clone().lerp(top, sm(-0.06, 0.06, y)); hc.push(c.r, c.g, c.b); }
      headGeo.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
      const head = new THREE.Mesh(headGeo, hm); head.position.set(0.04, 0.22, 0); head.rotation.z = -0.4; g.add(head);
      g.add(tube([V(0.1, 0.2, 0), V(0.18, 0.17, 0), V(0.24, 0.155, 0)], 0.03, 0.022, solidMat(top.clone().lerp(belly, 0.3))));
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), solidMat(acc)); b.position.set(0.0 + i * 0.03, 0.3 - i * 0.004, 0); g.add(b); }
      for (const k of [1, -1]) { addEye(g, V(0.08, 0.245, 0.075 * k), V(0.4, 0.15, k).normalize(), 0.052, look); addBlush(g, V(0.1, 0.19, 0.062 * k), V(0.2, 0, k).normalize(), 0.025); }
      const df = new THREE.Mesh(finGeo(humpShape(-0.08, 0.06, 0.08, 0.4)), finMat(acc.clone().lerp(belly, 0.3), look));
      df.rotation.z = Math.PI * 0.5 + 0.3; df.position.set(0.0, -0.02, 0); g.add(df);
      addSmile(g, V(0.245, 0.15, 0), V(1, 0, 0), 0.012);
      g.position.y = 0.04;
      break;
    }
    case 'octopus': case 'squid': {
      const sq = look.shape === 'squid';
      const paint = painter(look, 0);
      // 머리(외투막): 세로 스윕
      const path = straight(0, 1, 48).map((p) => V(0, sq ? -0.05 + p.x * 0.6 : 0.02 + p.x * 0.42, 0));
      const pr = sq ? prof(0.3, 0.55) : prof(0.45, 0.5);
      const R = sq ? 0.16 : 0.24;
      const s = sweep(path, (t) => R * pr(t), (t) => R * pr(t), V(0, 0, 1), (t, a, c) => paint(0.3 + t * 0.6, a + Math.PI / 2, c), 40);
      g.add(new THREE.Mesh(s.geo, bodyMat(look)));
      const legM = solidMat(top.clone().lerp(belly, 0.15), look);
      const n = sq ? 10 : 8;
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
      if (look.wings) for (const k of [1, -1]) { const e = ellipsoidMesh(0.12, 0.08, 0.02, finMat(acc, look), 0, 0.34, 0.2 * k); e.rotation.x = 0.6 * k; g.add(e); }
      const ey = sq ? 0.06 : 0.17;
      const er = sq ? 0.06 : 0.075;
      for (const k of [1, -1]) {
        const at = s.at((ey - path[0].y) / (path[path.length - 1].y - path[0].y), Math.PI / 2 * k + (k > 0 ? -0.75 : 0.75), 0);
        void at;
        const ang = 0.62 * k;
        const rr = R * pr((ey - path[0].y) / (path[path.length - 1].y - path[0].y));
        const p = V(Math.cos(ang) * rr, ey, Math.sin(ang) * rr);
        addEye(g, p, V(Math.cos(ang), 0.1, Math.sin(ang)).normalize(), er, look);
        const bang = 1.05 * k, by = ey - er * 1.2;
        const br = R * pr((by - path[0].y) / (path[path.length - 1].y - path[0].y));
        addBlush(g, V(Math.cos(bang) * br, by, Math.sin(bang) * br), V(Math.cos(bang), 0, Math.sin(bang)), er * 0.7);
      }
      const my = ey - er * 1.5;
      const mr = R * pr((my - path[0].y) / (path[path.length - 1].y - path[0].y));
      addSmile(g, V(mr + 0.004, my, 0), V(1, 0, 0), er * 0.38);
      g.position.y = sq ? 0.1 : 0.12;
      break;
    }
    case 'jelly': {
      const bellGeo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.56);
      bellGeo.scale(0.3, 0.26, 0.3);
      const cc: number[] = [];
      for (let i = 0; i < bellGeo.attributes.position.count; i++) { const y = bellGeo.attributes.position.getY(i); const c = belly.clone().lerp(top, sm(0.0, 0.25, y)).lerp(acc, 0.35 * sm(0.18, 0.26, y)); cc.push(c.r, c.g, c.b); }
      bellGeo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      const bm = bodyMat(look, { side: THREE.DoubleSide, transparent: true, opacity: 0.82 });
      g.add(new THREE.Mesh(bellGeo, bm));
      // 네잎 무늬
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const m = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 10, 24), solidMat(acc, look)); m.position.set(Math.cos(a) * 0.07, 0.235, Math.sin(a) * 0.07); m.rotation.x = Math.PI / 2; g.add(m); }
      const arm = solidMat(acc.clone().lerp(belly, 0.4), look);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        const d = V(Math.cos(a), 0, Math.sin(a));
        g.add(tube([d.clone().multiplyScalar(0.03).setY(0.02), d.clone().multiplyScalar(0.06).setY(-0.12), d.clone().multiplyScalar(0.02).setY(-0.25), d.clone().multiplyScalar(0.07).setY(-0.38)], 0.03, 0.01, arm, V(-d.z, 0, d.x)));
      }
      const ten = solidMat(top.clone().lerp(belly, 0.5), look);
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2;
        const d = V(Math.cos(a), 0, Math.sin(a));
        g.add(tube([d.clone().multiplyScalar(0.27).setY(0.0), d.clone().multiplyScalar(0.25).setY(-0.15), d.clone().multiplyScalar(0.28).setY(-0.3)], 0.008, 0.003, ten, V(-d.z, 0, d.x)));
      }
      for (const k of [1, -1]) {
        const ang = 0.42 * k; const ph = 1.1;
        const p = V(Math.sin(ph) * Math.cos(ang) * 0.3, Math.cos(ph) * 0.26, Math.sin(ph) * Math.sin(ang) * 0.3);
        addEye(g, p, V(Math.cos(ang), 0.35, Math.sin(ang)).normalize(), 0.05, look);
        const b = V(Math.sin(1.3) * Math.cos(0.8 * k) * 0.3, Math.cos(1.3) * 0.26, Math.sin(1.3) * Math.sin(0.8 * k) * 0.3);
        addBlush(g, b, b.clone().normalize(), 0.035);
      }
      addSmile(g, V(Math.sin(1.32) * 0.3 + 0.004, Math.cos(1.32) * 0.26, 0), V(1, 0.2, 0).normalize(), 0.02);
      g.position.y = 0.12;
      break;
    }
    case 'crab': {
      const bodyGeo = new THREE.SphereGeometry(1, 40, 28);
      bodyGeo.scale(0.28, 0.16, 0.34);
      const pa = bodyGeo.attributes.position as THREE.BufferAttribute;
      const cc: number[] = []; const c = new THREE.Color();
      const paint = painter(look, 0);
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        paint(0.5 + x * 1.6, Math.atan2(z, y), c);
        cc.push(c.r, c.g, c.b);
        if (sp.id === 'fish-king-crab' && y > 0.03) pa.setY(i, y + 0.012 * Math.sin(x * 60) * Math.sin(z * 60));
      }
      bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      bodyGeo.computeVertexNormals();
      g.add(new THREE.Mesh(bodyGeo, bodyMat(look)));
      const shell = solidMat(top.clone().lerp(belly, 0.15), look);
      const tip = solidMat(acc.clone().lerp(top, 0.3), look);
      // 다리 3쌍
      for (const k of [1, -1]) for (let i = 0; i < 3; i++) {
        const x = -0.1 + i * 0.07;
        const L = sp.id === 'fish-snow-crab' ? 1.6 : 1;
        g.add(tube([V(x, -0.02, 0.2 * k), V(x - 0.04, 0.06, (0.32 + 0.06 * L) * k), V(x - 0.08, -0.08, (0.38 + 0.12 * L) * k), V(x - 0.1, -0.16, (0.4 + 0.12 * L) * k)], 0.03, 0.012, shell));
      }
      // 집게
      if (look.claws) for (const k of [1, -1]) {
        g.add(tube([V(0.14, -0.02, 0.18 * k), V(0.24, 0.04, 0.3 * k), V(0.32, 0.06, 0.26 * k)], 0.035, 0.03, shell));
        const palm = ellipsoidMesh(0.09, 0.07, 0.06, shell, 0.36, 0.08, 0.25 * k); palm.rotation.y = 0.5 * k; g.add(palm);
        const f1 = ellipsoidMesh(0.08, 0.03, 0.03, tip, 0.45, 0.12, 0.2 * k); f1.rotation.set(0, 0.6 * k, 0.4); g.add(f1);
        const f2 = ellipsoidMesh(0.07, 0.025, 0.028, tip, 0.44, 0.05, 0.21 * k); f2.rotation.set(0, 0.6 * k, -0.25); g.add(f2);
      }
      // 눈자루 + 눈
      for (const k of [1, -1]) {
        g.add(tube([V(0.16, 0.06, 0.07 * k), V(0.18, 0.13, 0.08 * k), V(0.19, 0.18, 0.085 * k)], 0.018, 0.016, shell));
        addEye(g, V(0.2, 0.2, 0.085 * k), V(0.8, 0.25, 0.45 * k).normalize(), 0.055, look);
        addBlush(g, V(0.2, 0.03, 0.18 * k), V(0.6, 0.3, 0.7 * k).normalize(), 0.04);
      }
      addSmile(g, V(0.235, 0.0, 0), V(1, 0.15, 0).normalize(), 0.03);
      g.position.y = 0.12;
      break;
    }
    case 'shrimp': {
      const pts = [V(0.3, 0.06, 0), V(0.12, 0.12, 0), V(-0.08, 0.1, 0), V(-0.22, 0.02, 0), V(-0.28, -0.1, 0), V(-0.24, -0.2, 0)];
      const path = new THREE.CatmullRomCurve3(pts.reverse()).getPoints(64);
      const pr = prof(0.75, 0.5);
      const s = sweep(path, (t) => 0.1 * pr(t) + 0.004, (t) => 0.085 * pr(t) + 0.004, V(0, 0, 1), painter(look, Math.PI, 6), 32);
      g.add(new THREE.Mesh(s.geo, bodyMat(look)));
      // 머리 1.5배: 통통한 머리 덩어리
      const headM = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), solidMat(top.clone().lerp(belly, 0.25), look));
      headM.scale.set(0.15, 0.13, 0.12); headM.position.set(0.26, 0.08, 0); g.add(headM);
      const fm = finMat(acc.clone().lerp(top, 0.3), look);
      for (const k of [-0.5, 0, 0.5]) { const f = ellipsoidMesh(0.07, 0.016, 0.04, fm, -0.27, -0.25, k * 0.06); f.rotation.set(k * 0.6, -k * 0.8, 1.2); g.add(f); }
      const am = solidMat(acc, look);
      for (const k of [1, -1]) {
        // 굵고 짧은 더듬이(끝 동그라미) + 큰 눈자루 위 큰 눈
        g.add(tube([V(0.36, 0.16, 0.04 * k), V(0.44, 0.27, 0.08 * k), V(0.42, 0.34, 0.11 * k)], 0.016, 0.011, am));
        g.add(ellipsoidMesh(0.022, 0.022, 0.022, am, 0.42, 0.345, 0.11 * k));
        g.add(tube([V(0.3, 0.14, 0.05 * k), V(0.32, 0.2, 0.07 * k)], 0.018, 0.018, am));
        addEye(g, V(0.32, 0.21, 0.075 * k), V(0.6, 0.3, k).normalize(), 0.062, look);
        addBlush(g, V(0.37, 0.07, 0.095 * k), V(0.6, 0, k).normalize(), 0.035);
        for (let i = 0; i < 3; i++) g.add(ellipsoidMesh(0.022, 0.05, 0.02, am, 0.1 - i * 0.09, -0.06, 0.06 * k));
        if (look.claws) {
          g.add(tube([V(0.25, 0.0, 0.06 * k), V(0.38, -0.02, 0.14 * k), V(0.48, 0.02, 0.14 * k)], 0.022, 0.02, am));
          const palm = ellipsoidMesh(0.08, 0.04, 0.045, am, 0.55, 0.03, 0.14 * k); g.add(palm);
          const f1 = ellipsoidMesh(0.06, 0.018, 0.02, am, 0.63, 0.05, 0.14 * k); f1.rotation.z = 0.3; g.add(f1);
        }
      }
      addSmile(g, V(0.405, 0.05, 0), V(1, 0, 0), 0.022);
      g.position.y = 0.05;
      break;
    }
    case 'turtle': {
      const shellGeo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
      shellGeo.scale(0.4, 0.22, 0.34);
      const pa = shellGeo.attributes.position as THREE.BufferAttribute;
      const cc: number[] = [];
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        // 등딱지 판: 육각 비슷한 셀 가장자리를 밝게
        const u = x * 9, v = z * 9 + (Math.floor(u) % 2) * 0.5;
        const fx = Math.abs((u - Math.floor(u)) - 0.5), fz = Math.abs((v - Math.floor(v)) - 0.5);
        const edge = sm(0.36, 0.48, Math.max(fx, fz));
        const c = top.clone().lerp(acc, 0.35 * (1 - edge)).lerp(belly, edge * 0.55).lerp(belly, sm(0.06, 0.0, y) * 0.6);
        cc.push(c.r, c.g, c.b);
      }
      shellGeo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      const shell = new THREE.Mesh(shellGeo, bodyMat(look)); shell.position.y = 0.04; g.add(shell);
      const skin = solidMat(top.clone().lerp(new THREE.Color('#ffffff'), 0.35).lerp(belly, 0.25));
      g.add(ellipsoidMesh(0.4, 0.06, 0.33, solidMat(belly), 0, 0.04, 0));
      const head = ellipsoidMesh(0.13, 0.11, 0.115, skin, 0.46, 0.1, 0); g.add(head);
      for (const k of [1, -1]) {
        addEye(g, V(0.53, 0.14, 0.065 * k), V(0.7, 0.2, 0.7 * k).normalize(), 0.042, look);
        addBlush(g, V(0.555, 0.08, 0.075 * k), V(0.6, 0, 0.8 * k).normalize(), 0.028);
        const f = ellipsoidMesh(0.16, 0.03, 0.07, skin, 0.22, 0.04, 0.3 * k); f.rotation.y = -0.7 * k; g.add(f);
        const b = ellipsoidMesh(0.1, 0.03, 0.05, skin, -0.3, 0.04, 0.22 * k); b.rotation.y = 0.6 * k; g.add(b);
      }
      addSmile(g, V(0.59, 0.075, 0), V(1, 0, 0), 0.025);
      if (sp.id === 'fish-onsen-turtle') { const towel = ellipsoidMesh(0.08, 0.025, 0.07, solidMat('#ffffff'), 0.46, 0.215, 0); g.add(towel); }
      g.position.y = 0.04;
      break;
    }
    case 'tadpole': {
      const headGeo = new THREE.SphereGeometry(1, 40, 28);
      headGeo.scale(0.22, 0.18, 0.19);
      const paint = painter(look, 0);
      const cc: number[] = []; const c = new THREE.Color();
      for (let i = 0; i < headGeo.attributes.position.count; i++) { const x = headGeo.attributes.position.getX(i), y = headGeo.attributes.position.getY(i), z = headGeo.attributes.position.getZ(i); paint(0.55 + x, Math.atan2(z, y), c); cc.push(c.r, c.g, c.b); }
      headGeo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      const head = new THREE.Mesh(headGeo, bodyMat(look)); head.position.x = 0.18; g.add(head);
      const path: THREE.Vector3[] = [];
      for (let i = 0; i < 40; i++) { const t = i / 39; path.push(V(0.05 - 0.6 * (1 - t), 0, 0.06 * Math.sin((1 - t) * Math.PI * 1.6) * (1 - t))); }
      const s = sweep(path, (t) => 0.02 * sm(0, 0.6, t) + 0.003, (t) => 0.12 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9)), 0.6) * (0.4 + 0.6 * t) + 0.004, V(0, 1, 0), painter(look, Math.PI / 2), 20);
      g.add(new THREE.Mesh(s.geo, bodyMat(look)));
      if (look.wings) for (const k of [1, -1]) { const w = ellipsoidMesh(0.09, 0.05, 0.015, finMat(top.clone().lerp(acc, 0.2), look), 0.16, 0.0, 0.2 * k); w.rotation.set(0.3 * k, 0.8 * k, 0.3); g.add(w); }
      if (sp.id === 'fish-clione') { g.add(ellipsoidMesh(0.05, 0.04, 0.04, solidMat(acc, { ...look, glow: true }), 0.1, -0.02, 0)); }
      if (sp.id === 'fish-nudibranch') for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 10), solidMat(acc)); m.position.set(0.1 - i * 0.06, 0.08, (i % 2 - 0.5) * 0.06); g.add(m); }
      for (const k of [1, -1]) { addEye(g, V(0.33, 0.06, 0.1 * k), V(0.7, 0.3, 0.65 * k).normalize(), 0.06, look); addBlush(g, V(0.36, -0.03, 0.12 * k), V(0.6, 0, 0.8 * k).normalize(), 0.035); }
      addSmile(g, V(0.4, -0.02, 0), V(1, 0, 0), 0.022);
      break;
    }
    case 'star': {
      const sh = new THREE.Shape();
      for (let i = 0; i < 5; i++) {
        const a0 = (i / 5) * Math.PI * 2 + Math.PI / 2, a1 = a0 + Math.PI / 5;
        const p0 = [Math.cos(a0) * 0.42, Math.sin(a0) * 0.42], p1 = [Math.cos(a1) * 0.17, Math.sin(a1) * 0.17];
        if (i === 0) sh.moveTo(p0[0], p0[1]);
        const a2 = a1 + Math.PI / 5;
        sh.quadraticCurveTo(p1[0] * 1.0, p1[1] * 1.0, Math.cos(a2) * 0.42, Math.sin(a2) * 0.42);
      }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 6, curveSegments: 16 });
      geo.computeVertexNormals();
      const pa = geo.attributes.position as THREE.BufferAttribute;
      const cc: number[] = []; const c = new THREE.Color();
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const r = Math.hypot(x, y); c.copy(top).lerp(belly, sm(0.06, -0.04, z) * 0.7).lerp(acc, sm(0.7, 0.9, hash(Math.round(x * 30), Math.round(y * 30))) * sm(0.12, 0.2, r) * 0.6); cc.push(c.r, c.g, c.b); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      const m = new THREE.Mesh(geo, bodyMat(look));
      g.add(m);
      for (const k of [1, -1]) { addEye(g, V(0.06 * k, 0.04, 0.1), V(0.1 * k, 0.1, 1).normalize(), 0.055, look); addBlush(g, V(0.12 * k, -0.04, 0.1), V(0, 0, 1), 0.035); }
      addSmile(g, V(0, -0.04, 0.105), V(0, 0, 1), 0.025);
      g.rotation.y = Math.PI / 2;
      const w = new THREE.Group(); w.add(g); return finish(w, sp);
    }
  }
  return finish(g, sp);
}

function finish(g0: THREE.Group, sp: FishSpecies): THREE.Group {
  let g = g0;
  // 납작한 것(가오리·넙치)은 등이 보이게 살짝 세운다
  if (sp.look.shape === 'ray' || sp.look.shape === 'flatfish') { const w = new THREE.Group(); g0.rotation.x = 0.85; w.add(g0); g = w; }
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = m.material !== MAT.blush; m.receiveShadow = false; } });
  g.userData.fishId = sp.id;
  return g;
}

/** 들어 올릴 때 보이는 크기(m): 작은 건 키우고 큰 건 줄인다 */
export function displayScale(sp: FishSpecies, sizeCm: number): number {
  const m = sizeCm / 100;
  return THREE.MathUtils.clamp(0.55 + Math.log2(1 + m) * 0.55, 0.5, 2.2);
}

export function disposeModel(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mt of mats) if (!Object.values(MAT).includes(mt as never)) mt.dispose();
  });
}
