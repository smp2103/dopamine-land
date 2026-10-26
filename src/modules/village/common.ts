// village 공용: 조각 도우미·충돌체 목록·글씨 판·줄무늬 정점색.
import * as THREE from 'three';
import { rbox, grad, paint, part, roundExtrude, roundRectShape, blob, canvasTex, smoothNormals } from '../props/kit';
import type { MatKey } from '../props/kit';

export { rbox, grad, paint, part, roundExtrude, roundRectShape, blob, canvasTex, smoothNormals };
export type { MatKey };

/** 정적 충돌체(로컬 좌표, 건물 원점 기준) */
export type Col =
  | { kind: 'box'; hx: number; hy: number; hz: number; x: number; y: number; z: number; ry?: number }
  | { kind: 'cyl'; r: number; hh: number; x: number; y: number; z: number };

export interface Built {
  g: THREE.Group;
  cols: Col[];
  /** 움직이는 조각(풍차 날개·깃발) — bake 뒤 기준 자세를 잡고 t 로 돌린다 */
  anim?: Array<{ o: THREE.Object3D; fn: (o: THREE.Object3D, base: THREE.Quaternion, t: number) => void }>;
  /** 이 건물이 차지하는 반경(땅 판 크기) */
  foot?: number;
  /** 전체 배율(충돌체도 함께) */
  scale?: number;
}

export const WOOD = '#c89766';
export const WOOD_DARK = '#a8754b';
export const BONE = '#fbf1dc';

export function cap(r: number, len: number, rs = 20): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(r, Math.max(1e-3, len), 8, rs);
}
export function cyl(r0: number, r1: number, h: number, rs = 32, open = false): THREE.BufferGeometry {
  return smoothNormals(new THREE.CylinderGeometry(r1, r0, h, rs, 1, open));
}
export function sph(r: number, ws = 32, hs = 24): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, ws, hs);
}
/** 반구(위) */
export function dome(r: number, ws = 40, hs = 20): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2);
}

/** 위치 y 를 띠(band)로 나눠 번갈아 색칠 */
export function stripesY(geo: THREE.BufferGeometry, cols: THREE.ColorRepresentation[], band: number, y0 = 0): THREE.BufferGeometry {
  const cs = cols.map((c) => new THREE.Color(c));
  const p = geo.attributes.position;
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = Math.floor((p.getY(i) - y0) / band);
    const c = cs[((k % cs.length) + cs.length) % cs.length];
    a.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** 각도(x-z 평면, 둘레) 로 번갈아 색칠 — 천막·파라솔 */
export function stripesA(geo: THREE.BufferGeometry, cols: THREE.ColorRepresentation[], n: number, shade = 0): THREE.BufferGeometry {
  const cs = cols.map((c) => new THREE.Color(c));
  const p = geo.attributes.position;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const a = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const ang = Math.atan2(p.getZ(i), p.getX(i)) + Math.PI;
    const k = Math.floor((ang / (Math.PI * 2)) * n) % cs.length;
    const t = (p.getY(i) - bb.min.y) / Math.max(1e-4, bb.max.y - bb.min.y);
    c.copy(cs[k]).multiplyScalar(1 - shade * (1 - t));
    a.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** 글씨 판(따로 그리는 조각 — bake 가 건드리지 않는다) */
export function label(text: string, w: number, h: number, o: { bg?: string; fg?: string; px?: number; stroke?: string } = {}): THREE.Mesh {
  const W = 512, H = Math.max(64, Math.round((512 * h) / w));
  const tex = canvasTex(W, H, (c) => {
    c.clearRect(0, 0, W, H);
    if (o.bg) {
      c.fillStyle = o.bg;
      const r = H * 0.3;
      c.beginPath();
      c.roundRect(4, 4, W - 8, H - 8, r);
      c.fill();
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `${o.px ?? Math.round(H * 0.62)}px "Jua", "Malgun Gothic", sans-serif`;
    if (o.stroke) { c.lineWidth = 10; c.strokeStyle = o.stroke; c.lineJoin = 'round'; c.strokeText(text, W / 2, H / 2 + 4); }
    c.fillStyle = o.fg ?? '#7a4b2a';
    c.fillText(text, W / 2, H / 2 + 4);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.userData.live = true;
  return m;
}

/** 조각 하나 만들고 위치까지 */
export function add(g: THREE.Object3D, geo: THREE.BufferGeometry, mk: MatKey, color: THREE.ColorRepresentation | [THREE.ColorRepresentation, THREE.ColorRepresentation] | null, x: number, y: number, z: number, rot?: [number, number, number], scale?: [number, number, number]): THREE.Mesh {
  if (Array.isArray(color)) grad(geo, color[0], color[1]);
  else if (color !== null) paint(geo, color);
  const m = part(geo, mk);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  g.add(m);
  return m;
}

/** 두 점 사이 둥근 막대 */
export function rod(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mk: MatKey, color: THREE.ColorRepresentation, rs = 12): THREE.Mesh {
  const d = b.clone().sub(a);
  const len = d.length();
  const geo = cap(r, Math.max(1e-3, len - 2 * r), rs);
  paint(geo, color);
  const m = part(geo, mk);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.add(m);
  return m;
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
