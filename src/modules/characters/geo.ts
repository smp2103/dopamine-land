// 캐릭터용 매끈한 지오메트리 도우미 — 전부 충분히 쪼갠 곡면 + 해석적 법선.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** 타원체(중심 원점) */
export function ellipsoid(rx: number, ry: number, rz: number, ws = 32, hs = 22): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

/** 앞(+z) 반쪽 / 뒤 반쪽 타원체 — 얼굴 그림은 앞 반쪽에만 정면 투영 UV 로 붙인다. */
export function halfEllipsoid(rx: number, ry: number, rz: number, front: boolean, ws = 48, hs = 48): THREE.BufferGeometry {
  // SphereGeometry: phi 0 → x=-1, phi π/2 → z=+1, phi π → x=+1
  const g = new THREE.SphereGeometry(1, ws, hs, front ? 0 : Math.PI, Math.PI);
  g.scale(rx, ry, rz);
  return g;
}

/** 정면 투영 UV: (x, y) ∈ [-sx, sx] × [-sy, sy] → [0, 1]² (cy = 세로 중심) */
export function planarUV(g: THREE.BufferGeometry, sx: number, sy: number, cy = 0): void {
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, 0.5 + p.getX(i) / (2 * sx), 0.5 + (p.getY(i) - cy) / (2 * sy));
  }
  uv.needsUpdate = true;
}

/**
 * 회전체: 단면 (반지름, 높이) 점들을 캐트멀롬으로 매끈하게 이어 y 축으로 돌린다.
 * 이음매는 뒤(-z)에 두어 앞쪽 u=0.5 가 정면이다.
 */
export function lathe(pts: Array<[number, number]>, segs = 48, samples = 32): THREE.BufferGeometry {
  // 점은 아래→위 순서여야 법선이 바깥을 향한다
  if (pts[0][1] > pts[pts.length - 1][1]) pts = [...pts].reverse();
  const curve = new THREE.CatmullRomCurve3(pts.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  const sampled = curve.getPoints(samples).map((v) => new THREE.Vector2(Math.max(0, v.x), v.y));
  return new THREE.LatheGeometry(sampled, segs, Math.PI, Math.PI * 2);
}

/** 캡슐(세로, 중심 원점): 전체 길이 len, 반지름 r */
export function capsule(r: number, len: number): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 8, 24);
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export interface HairOpts {
  /** 머리(타원체) 반지름 */
  rx: number; ry: number; rz: number;
  /** 정면 머리선 높이(위도, 라디안) — 앞머리 끝 */
  front: number;
  /** 옆 머리선 */
  side: number;
  /** 뒤 머리선 */
  back: number;
  /** 앞머리 갈래 수와 깊이 */
  locks: number;
  lockDepth: number;
  /** 머리 두께(반지름 배율) */
  puff: number;
  /** 옆·뒤 볼륨(관자놀이 쪽이 부푼다) */
  sidePuff?: number;
  /** 가르마 쪽으로 앞머리를 비스듬히 */
  sweep?: number;
  /** 머리색과 윤기 띠(천사 고리) 색 — 정점 색으로 칠한다 */
  color?: string;
  shine?: string;
}

/**
 * 머리카락 덩어리: 머리보다 살짝 큰 구에서 머리선 아래 정점은 머리 속으로 넣어 숨긴다.
 * 경계가 둥글게 말려 들어가서 통통한 헬멧형 머리(동숲식)가 된다.
 */
export function hairCap(o: HairOpts): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 112, 76);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3);
  const cBase = new THREE.Color(o.color ?? '#ffffff'), cShine = new THREE.Color(o.shine ?? o.color ?? '#ffffff'), cc = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const az = Math.atan2(v.x, v.z); // 0 = 정면
    const el = Math.asin(THREE.MathUtils.clamp(v.y, -1, 1));
    const f = Math.cos(az);
    // 머리선: 정면 → 옆 → 뒤
    let line = f > 0
      ? THREE.MathUtils.lerp(o.side, o.front, smooth(0.25, 0.95, f))
      : THREE.MathUtils.lerp(o.side, o.back, smooth(0.0, -0.8, f));
    // 앞머리 갈래(정면 ±70° 안): 둥근 덩어리가 이마로 내려온다
    let bang = 0;
    if (Math.abs(az) < 1.25) {
      const k = (az + (o.sweep ?? 0)) * o.locks;
      const lock = Math.pow(Math.abs(Math.cos(k)), 0.45);
      const fade = smooth(1.25, 0.55, Math.abs(az));
      line -= o.lockDepth * lock * fade;
      bang = fade;
    }
    const t = smooth(line - 0.13, line + 0.06, el);
    // 정수리·관자놀이 쪽이 더 부풀게, 앞머리는 이마 위로 살짝 떠 있게
    const side = (o.sidePuff ?? 0) * Math.pow(Math.abs(Math.sin(az)), 1.5) * Math.exp(-(((el - 0.4) / 0.45) ** 2));
    const fringe = 0.025 * bang * Math.exp(-(((el - line - 0.12) / 0.18) ** 2));
    const top = 1 + o.puff + 0.025 * smooth(0.3, 1.2, el) + side + fringe;
    const s = THREE.MathUtils.lerp(0.9, top, t);
    p.setXYZ(i, v.x * o.rx * s, v.y * o.ry * s, v.z * o.rz * s);
    // 윤기 띠: 정수리 앞쪽에 물결치는 밝은 고리
    const ring = Math.exp(-(((el - 0.8 - 0.015 * Math.sin(az * 7)) / 0.085) ** 2)) * smooth(-0.3, 0.7, f);
    cc.copy(cBase).lerp(cShine, ring * 0.65);
    col.set([cc.r, cc.g, cc.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return smoothNormals(g);
}

/** 가늘어지는 관(삐침 머리·꼬리): 끝으로 갈수록 반지름 → 0 */
export function taperTube(pts: THREE.Vector3[], r: number, seg = 24, radial = 12): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, seg, r, radial, false);
  const p = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    curve.getPointAt(u, c);
    const k = Math.max(0.12, Math.sin(Math.PI * Math.min(1, 0.25 + u * 0.75))) * (1 - u * 0.75);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(k).add(c);
      p.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * 얼굴 머리: 한 장의 매끈한 타원체(볼은 아래쪽이 살짝 통통) + 재질 그룹 2개
 * (0 = 앞쪽 얼굴 그림, 1 = 나머지 피부). 이음매 없이 법선이 이어진다.
 */
export function faceHeadGeo(rx: number, ry: number, rz: number, cheek = 0.05): THREE.BufferGeometry {
  const base = new THREE.SphereGeometry(1, 80, 60);
  base.deleteAttribute('uv');
  base.deleteAttribute('normal');
  const g = mergeVertices(base, 1e-5);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // 볼: 아래 1/3 이 옆으로 통통, 정수리는 살짝 납작
    const c = 1 + cheek * Math.exp(-(((y + 0.35) / 0.38) ** 2));
    const top = 1 - 0.03 * smooth(0.5, 1, y);
    p.setXYZ(i, x * rx * c, y * ry * top, z * rz * (1 + cheek * 0.4 * Math.exp(-(((y + 0.35) / 0.38) ** 2))));
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = 0.5 + p.getX(i) / (2 * rx);
    uv[i * 2 + 1] = 0.5 + p.getY(i) / (2 * ry);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // 삼각형을 앞/뒤로 나눠 그룹
  const idx = g.index!.array;
  const front: number[] = [], back: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const zc = p.getZ(a) + p.getZ(b) + p.getZ(c);
    (zc > 0.15 * rz ? front : back).push(a, b, c);
  }
  g.setIndex([...front, ...back]);
  g.clearGroups();
  g.addGroup(0, front.length, 0);
  g.addGroup(front.length, back.length, 1);
  return g;
}

/** 이음매·극점 정점을 합쳐 법선을 다시 구한다(이음매 줄 없애기). UV 는 버린다. */
export function smoothNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const m = mergeVertices(g, 1e-5);
  m.computeVertexNormals();
  return m;
}
