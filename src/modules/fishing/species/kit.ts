// 물고기 모델 공용 도구 — 스윕 몸통·지느러미 모양·관·재질·무늬 칠하기·얼굴(art.ts 눈·볼터치)·모델 앵커.
// model.ts(몸형 생성기)와 parts.ts(0.4 파츠·장식)가 같이 쓴다. three 와 core/art 말고는 아무것도 import 하지 않는다.
// 좌표: 머리가 +x, 위가 +y, 옆이 ±z. 몸 길이는 약 1(원점 중심).
import * as THREE from 'three';
import { addBlush, addEyes, PALETTE, CLEAR, METALNESS } from '../../../core/art';
import type { FishLook } from '../data';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const sm = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** 결정적 해시 0..1(무늬·배치용 — 난수 아님) */
export const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** 문자열 → 0..1(종마다 고정된 값) */
export function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
const fract = (x: number) => x - Math.floor(x);

// ───── 공유 재질(입·이빨) — 모델을 버려도 dispose 하지 않는다 ─────
const sharedMat = <T extends THREE.Material>(m: T): T => { m.userData.shared = true; return m; };
export const MAT = {
  mouth: sharedMat(new THREE.MeshStandardMaterial({ color: '#7a3a44', roughness: 0.6 })),
  tooth: sharedMat(new THREE.MeshStandardMaterial({ color: '#fffaf2', roughness: 0.4, emissive: '#fffaf2', emissiveIntensity: 0.15 })),
  white: sharedMat(new THREE.MeshStandardMaterial({ color: PALETTE.white, roughness: 0.5, emissive: PALETTE.white, emissiveIntensity: 0.2 })),
  gold: sharedMat(new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: METALNESS.gold ?? 0.7, roughness: 0.35, emissive: '#c8961c', emissiveIntensity: 0.5 })),
  star: sharedMat(new THREE.MeshBasicMaterial({ color: '#ffe68a' })),
};

/** 몸통 재질: 정점색 + 무늬별 금속·발광·투명 */
export function bodyMat(look: FishLook, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}): THREE.MeshPhysicalMaterial {
  const chrome = look.pattern === 'chrome';
  const glowC = new THREE.Color(look.colors[2]);
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: chrome ? 0.22 : 0.42, metalness: chrome ? 0.45 : 0,
    clearcoat: chrome ? 1 : 0.4, clearcoatRoughness: chrome ? 0.12 : 0.3,
    sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color(look.colors[1]),
    transparent: !!look.clear, opacity: look.clear ? CLEAR.opacity + 0.2 : 1,
    depthWrite: !look.clear,
    emissive: look.glow ? glowC : new THREE.Color('#000000'),
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

export function finMat(color: THREE.Color, look: FishLook): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.5, sheen: 0.8, sheenColor: color.clone().lerp(new THREE.Color('#ffffff'), 0.5),
    transparent: true, opacity: look.clear ? CLEAR.opacity : 0.88, side: THREE.DoubleSide, depthWrite: !look.clear,
    emissive: color, emissiveIntensity: look.glow ? 0.4 : 0.12,
  });
}

export function solidMat(color: THREE.Color | string, look?: Pick<FishLook, 'glow' | 'clear'>, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c, roughness: 0.45, clearcoat: 0.4, sheen: 0.5, sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.5),
    emissive: c, emissiveIntensity: look?.glow ? 0.45 : 0.14,
    transparent: !!look?.clear, opacity: look?.clear ? CLEAR.opacity + 0.2 : 1,
    ...extra,
  });
}

/** 빛나는 재질(초롱·빛 꼬리·별) */
export function glowMat(color: THREE.Color | string, k = 1.2, opacity = 1): THREE.MeshStandardMaterial {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

// ───── 스윕: 경로를 따라 타원(초타원) 단면을 이은 매끈한 몸 ─────
export interface Sweep {
  geo: THREE.BufferGeometry;
  /** 표면 점(t: 0 꼬리 → 1 머리, a: 단면 각도 0=위 π/2=+z, off: 바깥으로 더 띄우기) + 바깥 방향 */
  at: (t: number, a: number, off?: number) => { p: THREE.Vector3; n: THREE.Vector3 };
}

export function sweep(path: THREE.Vector3[], ry: (t: number) => number, rz: (t: number) => number, planeN: THREE.Vector3,
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
  // 고리 사이를 이어서(t 가 고리에 딱 붙지 않게) — 표면에 붙이는 무늬가 계단지지 않는다
  const at = (t: number, a: number, off = 0) => {
    const f = Math.max(1, Math.min(n - 2, t * (n - 1)));
    const i0 = Math.min(n - 3, Math.floor(f)), k = Math.min(1, f - i0);
    const p = ringPt(i0, a, off).lerp(ringPt(i0 + 1, a, off), k);
    const c = path[i0].clone().lerp(path[i0 + 1], k);
    return { p, n: p.clone().sub(c).normalize() };
  };
  return { geo, at };
}

export const straight = (x0: number, x1: number, n = 48, y = (_t: number) => 0) => {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1); out.push(V(x0 + (x1 - x0) * t, y(t), 0)); }
  return out;
};

/** 몸 단면 윤곽: peak 위치(0 꼬리 ~ 1 머리)에서 가장 굵고, blunt 작을수록 뭉툭 */
export const prof = (peak: number, blunt: number) => {
  const a = Math.log(0.5) / Math.log(peak);
  return (t: number) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, t)), a))), blunt);
};

// ───── 색·무늬 ─────
const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(fract(h), s, l);

/** 하트 안인가(x,y 는 하트 크기 1 기준, y 위) */
export function inHeart(x: number, y: number): boolean {
  const X = x * 1.15, Y = y * 1.1 + 0.15;
  return Math.pow(X * X + Y * Y - 1, 3) - X * X * Y * Y * Y <= 0;
}
/** 하트 안쪽 정도(1 안 · 0 밖) — x,y 는 하트 크기 1 기준, y 위 */
function heartIn(x: number, y: number): number {
  const X = x * 1.15, Y = y * 1.1 + 0.15;
  const v = Math.pow(X * X + Y * Y - 1, 3) - X * X * Y * Y * Y;
  return sm(0.04, -0.06, v);
}

/** 3D 셀 점무늬 거리(1 근처 = 점 가장자리) */
function cellDist(px: number, py: number, pz: number, keep = 0.4): number {
  const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
  let d = 9;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const gx = cx + i, gy = cy + j, gz = cz + k;
    const h0 = hash(gx * 1.7 + gz * 5.3, gy * 3.1 - gz);
    if (h0 < keep) continue;
    const qx = gx + 0.25 + 0.5 * hash(gx + 7, gy + gz), qy = gy + 0.25 + 0.5 * hash(gx - gz, gy + 3), qz = gz + 0.25 + 0.5 * hash(gx + gz * 2, gy - 5);
    d = Math.min(d, Math.hypot(px - qx, py - qy, pz - qz) / (0.3 + 0.25 * hash(gx + 1, gy + gz + 1)));
  }
  return d;
}

/**
 * 정점색 칠하기: (t 꼬리 0 → 머리 1, a 단면 각 0 위) → 색. 등(colors[0]) · 배(colors[1]) · 포인트(colors[2]).
 * 무늬마다 계산이 다르다 — 별자리(constellation) 별과 선은 parts.ts 가 메시로 따로 얹는다.
 */
export function painter(look: FishLook, topAngle = 0, stripeFreq = 3.2, spotK = 0.085) {
  const top = new THREE.Color(look.colors[0]), belly = new THREE.Color(look.colors[1]), acc = new THREE.Color(look.colors[2]);
  const tmp = new THREE.Color();
  return (t: number, a: number, out: THREE.Color) => {
    const up = Math.cos(a - topAngle);
    const side = Math.sin(a - topAngle);
    out.copy(belly).lerp(top, sm(-0.55, 0.55, up));
    switch (look.pattern) {
      case 'grad': out.lerp(acc, sm(0.45, 0.0, t) * 0.75 * sm(-0.9, 0.2, up)); break;
      case 'stripe': {
        const s = Math.sin((t * stripeFreq * 2 - 0.25) * Math.PI);
        out.lerp(acc, sm(0.45, 0.7, s) * sm(0.08, 0.2, t) * sm(0.97, 0.85, t));
        break;
      }
      case 'band': out.lerp(acc, sm(0.42, 0.15, Math.abs(up)) * 0.9 * sm(0.05, 0.2, t)); break;
      case 'hstripe': {
        // 몸을 따라 가로로 여러 줄(위아래로 세 줄쯤)
        const s = Math.sin(up * Math.PI * 2.6 + 0.4);
        out.lerp(acc, sm(0.5, 0.78, s) * 0.85 * sm(0.06, 0.18, t) * sm(0.97, 0.86, t));
        break;
      }
      case 'spots': case 'glowdots': {
        const k = look.pattern === 'glowdots' ? spotK * 0.7 : spotK;
        const d = cellDist(t / k, Math.cos(a) * 0.26 / k, Math.sin(a) * 0.26 / k, look.pattern === 'glowdots' ? 0.55 : 0.4);
        out.lerp(acc, sm(1.0, 0.82, d) * sm(-0.9, -0.3, up) * sm(0.04, 0.12, t));
        break;
      }
      case 'rainbow': {
        // 머리 빨강 → 꼬리 보라, 배는 밝게
        tmp.copy(hsl(0.0 + (1 - t) * 0.78, 0.78, 0.66));
        out.copy(belly).lerp(tmp, sm(-0.75, 0.25, up));
        break;
      }
      case 'huecycle': {
        tmp.copy(hsl(0.45 + t * 0.55 + up * 0.12, 0.7, 0.72));
        out.copy(belly).lerp(tmp, sm(-0.8, 0.3, up) * 0.9 + 0.1);
        break;
      }
      case 'galaxy': case 'constellation': {
        // 남색 밤하늘 + 보라 성운 + 작은 반짝이
        const neb = hash(Math.floor(t * 6), Math.floor((a + 7) * 1.5));
        out.copy(belly).lerp(top, sm(-0.75, 0.35, up));
        if (look.pattern === 'galaxy') out.lerp(acc, 0.45 * sm(0.5, 0.9, neb) * sm(-0.4, 0.6, Math.sin(t * 9 + a * 2)));
        const sx = Math.floor(t * 40), sy = Math.floor((a / (Math.PI * 2)) * 34);
        const sp = hash(sx * 1.3, sy * 2.7);
        if (sp > (look.pattern === 'galaxy' ? 0.9 : 0.95)) out.lerp(new THREE.Color('#ffffff'), 0.85);
        break;
      }
      case 'chrome': {
        // 금속 띠: 위쪽 밝은 하이라이트 · 옆 아래 어두운 반사
        out.lerp(new THREE.Color('#ffffff'), 0.55 * sm(0.2, 0.0, Math.abs(up - 0.45)));
        out.lerp(acc, 0.35 * sm(0.25, 0.0, Math.abs(up + 0.05)));
        break;
      }
      case 'scales': {
        const u = t * 22, v = (a / (Math.PI * 2)) * 16 + (Math.floor(u) % 2) * 0.5;
        const fx = fract(u), fy = fract(v) - 0.5;
        const d = Math.hypot(fx * 0.9, fy);
        out.lerp(acc, 0.65 * sm(0.36, 0.5, d) * sm(0.06, 0.16, t) * sm(0.9, 0.78, t));
        break;
      }
      case 'bandage': {
        // 비스듬히 감긴 붕대: 띠마다 크림/베이지 + 얇은 그림자 선
        const w = fract(t * 7.5 + (a / (Math.PI * 2)) * 1.4);
        out.copy(hash(Math.floor(t * 7.5 + (a / (Math.PI * 2)) * 1.4), 3) > 0.5 ? top : belly);
        out.lerp(acc, 0.55 * sm(0.12, 0.0, w) + 0.3 * sm(0.88, 1, w));
        break;
      }
      case 'heart': {
        // 스윕 몸은 하트를 표면에 붙인 메시(surfaceShape)로 그린다 — 여기선 스윕이 아닌 몸만 흐릿하게
        if (look.shape !== 'long' && look.shape !== 'round' && look.shape !== 'tall') {
          const x = (t - 0.5) / 0.16, y = up / 0.5;
          out.lerp(acc, heartIn(x, y) * sm(0.35, 0.6, Math.abs(side)));
        }
        break;
      }
      case 'cheek': {
        // 비단잉어 볼 무늬: 양 볼 + 등 큰 얼룩 두 개
        const P: Array<[number, number, number]> = [[0.8, 1.25, 0.09], [0.8, -1.25, 0.09], [0.5, 0.15, 0.14], [0.27, -0.3, 0.1]];
        let k = 0;
        for (const [pt, pa, r] of P) {
          const dt = t - pt, da = Math.atan2(Math.sin(a - pa), Math.cos(a - pa)) * 0.24;
          k = Math.max(k, sm(r, r * 0.7, Math.hypot(dt, da)));
        }
        out.lerp(acc, k);
        break;
      }
      case 'taiyaki': {
        // 붕어빵: 노릇노릇 + 가장자리 진하게 구운 색 + 비늘 틀 자국
        const edge = sm(0.35, 0.0, Math.abs(side));
        const u = t * 14, v = up * 3 + (Math.floor(u) % 2) * 0.5;
        const d = Math.hypot(fract(u) - 0.5, fract(v) - 0.5);
        out.copy(belly).lerp(top, 0.35 + 0.65 * edge);
        out.lerp(acc, 0.45 * sm(0.34, 0.48, d) * sm(0.12, 0.25, t) * sm(0.82, 0.7, t) * (1 - edge));
        out.lerp(acc, 0.35 * sm(0.18, 0.02, t));
        break;
      }
    }
    // 코끝은 살짝 밝게(얼굴이 읽히게)
    if (look.pattern !== 'taiyaki') out.lerp(belly, sm(0.86, 1.0, t) * 0.25);
  };
}

/** 구·타원 지오메트리 정점마다 칠하기(사이 각·위치를 t,a 로 바꿔 painter 에 넘긴다) */
export function paintGeo(geo: THREE.BufferGeometry, paint: (t: number, a: number, out: THREE.Color) => void, tOf: (p: THREE.Vector3) => number, aOf: (p: THREE.Vector3) => number) {
  const pa = geo.attributes.position as THREE.BufferAttribute;
  const cc: number[] = [], c = new THREE.Color(), p = V();
  for (let i = 0; i < pa.count; i++) { p.fromBufferAttribute(pa, i); paint(tOf(p), aOf(p), c); cc.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
}

// ───── 부품 모양 ─────
export function finGeo(shape: THREE.Shape, thick = 0.008): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3, curveSegments: 24 });
  g.translate(0, 0, -thick / 2);
  g.computeVertexNormals();
  return g;
}

/** 둥근 지느러미 혹: 밑변 b0(뒤)~b1(앞), 높이 h, 꼭짓점 위치 k(0 뒤 ~ 1 앞) */
export function humpShape(b0: number, b1: number, h: number, k = 0.3): THREE.Shape {
  const s = new THREE.Shape();
  const ax = b0 + (b1 - b0) * k;
  s.moveTo(b1, 0);
  s.quadraticCurveTo(b1 - (b1 - b0) * 0.1, h * 0.9, ax, h);
  s.quadraticCurveTo(b0 - (b1 - b0) * 0.25, h * 1.05, b0, 0);
  s.lineTo(b1, 0);
  return s;
}

export type TailKind = 'fan' | 'fork' | 'fancy' | 'crescent' | 'petal' | 'cloud' | 'ribbon';
export function tailShape(kind: TailKind, s: number): THREE.Shape {
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
  } else if (kind === 'petal') {
    // 꽃잎 하나(꽃잎 꼬리는 이걸 4장 돌려 붙인다)
    sh.moveTo(0.02, 0.0);
    sh.bezierCurveTo(-0.06 * s, 0.1 * s, -0.24 * s, 0.14 * s, -0.3 * s, 0.05 * s);
    sh.quadraticCurveTo(-0.27 * s, 0, -0.3 * s, -0.05 * s);
    sh.bezierCurveTo(-0.24 * s, -0.14 * s, -0.06 * s, -0.1 * s, 0.02, 0);
  } else if (kind === 'cloud') {
    // 몽글몽글 구름 꼬리: 둥근 혹 세 개
    sh.moveTo(0.02, 0.03 * s);
    sh.bezierCurveTo(-0.1 * s, 0.2 * s, -0.24 * s, 0.32 * s, -0.3 * s, 0.2 * s);
    sh.bezierCurveTo(-0.42 * s, 0.22 * s, -0.44 * s, 0.04 * s, -0.36 * s, 0);
    sh.bezierCurveTo(-0.44 * s, -0.04 * s, -0.42 * s, -0.22 * s, -0.3 * s, -0.2 * s);
    sh.bezierCurveTo(-0.24 * s, -0.32 * s, -0.1 * s, -0.2 * s, 0.02, -0.03 * s);
  } else if (kind === 'ribbon') {
    // 몸의 세 배쯤 흘러내리는 드레스 꼬리
    sh.moveTo(0.02, 0.05 * s);
    sh.bezierCurveTo(-0.25 * s, 0.36 * s, -0.7 * s, 0.46 * s, -0.85 * s, 0.24 * s);
    sh.bezierCurveTo(-0.78 * s, 0.1 * s, -0.64 * s, 0.04 * s, -0.56 * s, 0);
    sh.bezierCurveTo(-0.64 * s, -0.04 * s, -0.78 * s, -0.1 * s, -0.85 * s, -0.24 * s);
    sh.bezierCurveTo(-0.7 * s, -0.46 * s, -0.25 * s, -0.36 * s, 0.02, -0.05 * s);
  } else {
    sh.moveTo(0.03, 0.03 * s);
    sh.bezierCurveTo(-0.08 * s, 0.12 * s, -0.16 * s, 0.32 * s, -0.2 * s, 0.4 * s);
    sh.quadraticCurveTo(-0.16 * s, 0.1 * s, -0.1 * s, 0);
    sh.quadraticCurveTo(-0.15 * s, -0.1 * s, -0.18 * s, -0.28 * s);
    sh.bezierCurveTo(-0.13 * s, -0.22 * s, -0.06 * s, -0.1 * s, 0.03, -0.03 * s);
  }
  return sh;
}

/** 하트 모양(가로 약 2w) */
export function heartShape(w: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -w * 0.9);
  s.bezierCurveTo(w * 0.4, -w * 0.5, w * 1.05, -w * 0.05, w * 0.95, w * 0.42);
  s.bezierCurveTo(w * 0.85, w * 0.95, w * 0.2, w * 0.95, 0, w * 0.5);
  s.bezierCurveTo(-w * 0.2, w * 0.95, -w * 0.85, w * 0.95, -w * 0.95, w * 0.42);
  s.bezierCurveTo(-w * 1.05, -w * 0.05, -w * 0.4, -w * 0.5, 0, -w * 0.9);
  return s;
}

/** 별 모양(뾰족 n개, 끝이 둥글게) */
export function starShape(r0: number, r1: number, n = 5): THREE.Shape {
  const sh = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + Math.PI / 2, a1 = a0 + Math.PI / n, a2 = a1 + Math.PI / n;
    if (i === 0) sh.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    sh.quadraticCurveTo(Math.cos(a1) * r1, Math.sin(a1) * r1, Math.cos(a2) * r0, Math.sin(a2) * r0);
  }
  return sh;
}

export function ellipsoidMesh(rx: number, ry: number, rz: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 32): THREE.Mesh {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.75)));
  g.scale(rx, ry, rz);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  return m;
}

/** 단색 관(촉수·다리·수염·더듬이) — 양 끝이 둥글게 닫힌다 */
export function tube(points: THREE.Vector3[], r0: number, r1: number, mat: THREE.Material, planeN = V(0, 0, 1), radial = 14): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const path = curve.getPoints(28);
  const r = (t: number) => (r0 + (r1 - r0) * t) * sm(0, 0.06, t) * sm(1, 0.94, t) + 0.0001;
  // 경로가 planeN 과 나란하면 단면이 망가지니 다른 기준을 고른다
  const d = path[path.length - 1].clone().sub(path[0]).normalize();
  const pn = Math.abs(d.dot(planeN)) > 0.9 ? (Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)) : planeN;
  const s = sweep(path, r, r, pn, (_t, _a, c) => c.setRGB(1, 1, 1), radial);
  return new THREE.Mesh(s.geo, mat);
}

/** 미소: 바라보는 방향 fwd(+x 등), 크기 w */
export function addSmile(g: THREE.Object3D, p: THREE.Vector3, fwd: THREE.Vector3, w: number, teeth = false) {
  const geo = new THREE.TorusGeometry(w, w * 0.16, 10, 24, Math.PI);
  const m = new THREE.Mesh(geo, MAT.mouth);
  m.position.copy(p);
  m.lookAt(p.clone().add(fwd));
  m.rotateZ(Math.PI);
  m.name = 'mouth';
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

/**
 * 표면에 착 붙는 모양(하트 무늬 등): 모양 좌표 (u 앞뒤, v 위아래)를 스윕 표면 (t, a)로 옮겨 휘게 만든다.
 * side +1 = +z 옆구리, -1 = -z 옆구리. kA = 각도/길이(옆구리 반높이의 역수쯤).
 */
export function surfaceShape(at: Sweep['at'], inside: (u: number, v: number) => boolean, box: [number, number, number, number],
  t0: number, side: 1 | -1, kA: number, mat: THREE.Material, off = 0.004, N = 44): THREE.Mesh {
  // 모양 칸(격자)을 촘촘히 깔고 안쪽 칸만 남긴다 → 곡면을 따라 휘어도 안이 꽉 찬다
  const [u0, u1, v0, v1] = box;
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const u = u0 + (u1 - u0) * (i / N), v = v0 + (v1 - v0) * (j / N);
    const p = at(t0 + u, side * (Math.PI / 2 - v * kA), off).p;
    pos.push(p.x, p.y, p.z);
  }
  const id = (i: number, j: number) => j * (N + 1) + i;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = u0 + (u1 - u0) * ((i + 0.5) / N), v = v0 + (v1 - v0) * ((j + 0.5) / N);
    if (!inside(u, v)) continue;
    idx.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 1;
  return m;
}

// ───── 얼굴(GDD 7.2 — art.ts 눈·볼터치) ─────
export interface Pose { p: THREE.Vector3; n: THREE.Vector3 }

/** 판(눈·볼)을 표면 p 에 법선 n 으로 세운다 — 판의 위쪽은 세상 위(+y), 위를 보는 판은 앞(+x)을 위로 */
export function placeDecal(m: THREE.Object3D, pose: Pose, off = 0) {
  const z = pose.n.clone().normalize();
  const ref = Math.abs(z.y) > 0.8 ? V(1, 0, 0) : V(0, 1, 0);
  const x = ref.clone().cross(z).normalize();
  const y = z.clone().cross(x).normalize();
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  m.position.copy(pose.p).addScaledVector(z, off);
}

export interface FaceOpts {
  /** 볼 자리(없으면 눈 기준 앞·아래) */
  blush?: [Pose, Pose];
  /** 반쯤 감은 졸린 눈(눈꺼풀 색) */
  lid?: THREE.Color | string;
  /** 하얀 눈썹(할배) */
  brows?: boolean;
}

/**
 * 눈 두 개(왼쪽 = -z 쪽, 오른쪽 = +z 쪽) + 볼터치. 눈은 art.eyeMaterial 공용 판 — 크기는 눈 지름(m).
 * 볼터치는 모든 종에 붙인다(무서운 종은 필수 — 계약 0장 Art).
 */
export function addFace(g: THREE.Object3D, left: Pose, right: Pose, size: number, o: FaceOpts = {}) {
  const set = addEyes(g, { size, blush: false });
  // 판이 둥근 몸에 묻히지 않게 살짝 띄운다(가장자리가 파묻히면 눈이 졸려 보인다)
  placeDecal(set.left, left, size * 0.16);
  placeDecal(set.right, right, size * 0.16);
  const bl = addBlush(g, size);
  if (o.blush) { placeDecal(bl[0], o.blush[0], size * 0.07); placeDecal(bl[1], o.blush[1], size * 0.07); }
  if (o.lid) {
    // 위 절반을 덮는 눈꺼풀(살짝 처진 반달)
    const lidM = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.lid), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    for (const [eye, pose] of [[set.left, left], [set.right, right]] as const) {
      const lg = new THREE.CircleGeometry(0.5, 20, -0.12, Math.PI + 0.24);
      const lid = new THREE.Mesh(lg, lidM);
      placeDecal(lid, pose, size * 0.12);
      lid.scale.setScalar(size * 1.02);
      lid.translateY(-size * 0.05);
      lid.renderOrder = 3;
      g.add(lid);
      void eye;
    }
  }
  if (o.brows) {
    for (const [pose, side] of [[left, -1], [right, 1]] as const) {
      const b = tube([V(-0.6, 0, 0), V(0, 0.18, 0), V(0.7, 0.05, 0)].map((v) => v.multiplyScalar(size)), size * 0.16, size * 0.1, MAT.white);
      placeDecal(b, pose, size * 0.15);
      b.translateY(size * 0.72);
      void side;
      g.add(b);
    }
  }
  return set;
}

// ───── 모델 앵커(파츠를 어디에 붙일지) ─────
export interface Anchors {
  /** 몸 길이(m, 모델 좌표) */
  L: number;
  /** 코끝 · 이마(눈 위 머리 꼭대기) · 등 한가운데 꼭대기 · 배 아래 · 꼬리 끝 · 몸 가운데 */
  nose: THREE.Vector3; brow: THREE.Vector3; back: THREE.Vector3; belly: THREE.Vector3; tail: THREE.Vector3; center: THREE.Vector3;
  /** 몸 반높이 · 반폭(가장 굵은 곳) */
  h: number; w: number;
  /** 눈 지름 */
  eye: number;
  /** 스윕 몸이면 표면 함수(t 꼬리0→머리1, a 0=위) */
  surf?: Sweep['at'];
  /** 등지느러미를 이미 붙였나(fan-fin·sail 은 대신 붙는다) */
  dorsal?: THREE.Object3D;
  anal?: THREE.Object3D;
  tailFin?: THREE.Object3D;
  /** 눈 자리(왼쪽 -z, 오른쪽 +z) — 눈썹·뾰로통 표정이 따라간다 */
  eyes?: [Pose, Pose];
}

/**
 * 스윕이 아닌 몸(게·해파리·거북 …)에 파츠를 붙일 때 쓰는 대충 표면: 꼬리→코를 잇는 타원체.
 * t 0 꼬리 ~ 1 코, a 0 위 · π/2 +z. 스윕 몸이면 그 표면을 그대로 쓴다.
 */
export function surfOf(A: Anchors): Sweep['at'] {
  if (A.surf) return A.surf;
  return (t: number, a: number, off = 0) => {
    const x = A.tail.x + (A.nose.x - A.tail.x) * t;
    const k = Math.sqrt(Math.max(0.05, Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, t)))));
    const y0 = A.center.y;
    const n = V(0, Math.cos(a) * A.w, Math.sin(a) * A.h).normalize();
    const p = V(x, y0 + Math.cos(a) * (A.h * k + off), Math.sin(a) * (A.w * k + off));
    return { p, n: V(0, n.y, n.z).normalize() };
  };
}
