// 행성 공용 연결판·도우미 — planets.ts 가 행성에 들어갈 때마다 채워서 장면·생물·낚시·서핑 빌더에 넘긴다.
// 빌더는 여기로만 게임을 만진다(행성을 나가면 등록한 충돌·E 행동·틱이 한꺼번에 풀린다).
import * as THREE from 'three';
import type { Game } from '../../core/game';
import type { BodyShape } from '../../core/physics';
import type { Species } from '../../core/state';
import type { PlanetId } from './logic';

/** E 로 쓰는 것 하나(살아 있는 동안만) */
export interface Actor {
  id: string;
  /** 월드 좌표(살아 있는 참조) */
  pos: THREE.Vector3;
  r: number;
  label: string | (() => string);
  use: () => void;
  ok?: () => boolean;
  /** 높이 차를 무시하고 잰다(큰 것·높은 것) */
  flat?: boolean;
  /** 앞쪽 부채꼴 안이어야(잠자리채) */
  cone?: boolean;
}
export type Tick = (t: number, dt: number) => void;

export interface PlanetCtx {
  game: Game;
  id: PlanetId;
  /** 행성 origin(월드) */
  O: THREE.Vector3;
  rng: (key: string) => () => number;
  /** 국소 → 국소 높이 */
  h: (lx: number, lz: number) => number;
  /** 국소 → 월드 높이 */
  gy: (lx: number, lz: number) => number;
  /** 국소 → 월드 점(땅 위 + up) */
  at: (lx: number, lz: number, up?: number) => THREE.Vector3;
  day(): number;
  hour(): number;
  /** 우주 유성우인가 */
  meteor(): boolean;
  addStatic(shape: BodyShape, pos: { x: number; y: number; z: number }, rot?: THREE.Quaternion): void;
  addActor(a: Actor): void;
  addTick(fn: Tick): void;
  /** 목격 등록(사진 모드) */
  addWitness(speciesId: string, pos: THREE.Vector3, visible: () => boolean): void;
  toast(text: string): void;
  give(id: string, n: number, why: string): number;
  emit(e: { type: string; [k: string]: unknown }): void;
  unlocked(key: string): boolean;
  takenToday(key: string): boolean;
  markToday(key: string): void;
  /** 잡기(굴림 → 들어 올리기 → 보고) */
  catchSpecies(sp: Species, o: { model?: THREE.Object3D; keep?: boolean; activity?: string; size?: number }): void;
  /** 지금 카메라 */
  camera: THREE.Camera;
}

const sharedOf = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => { x.userData.shared = true; return x; };
export const shared = sharedOf;

const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function';
/** 캔버스 텍스처(DOM 없으면 1px 단색) */
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, fallback = '#fff8e8'): THREE.Texture {
  if (hasDom()) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (g) {
      draw(g);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }
  }
  const col = new THREE.Color(fallback);
  const t = new THREE.DataTexture(new Uint8Array([col.r * 255, col.g * 255, col.b * 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

/** 귀여운 둥근 간판 텍스처(크림 바탕 + 갈색 글자, Jua) */
const signCache = new Map<string, THREE.MeshStandardMaterial>();
export function signMaterial(text: string, sub = '', color = '#ff9fb8'): THREE.MeshStandardMaterial {
  const key = `${text}|${sub}|${color}`;
  let m = signCache.get(key);
  if (m) return m;
  const tex = canvasTex(512, 256, (g) => {
    g.fillStyle = color;
    rr(g, 6, 6, 500, 244, 70); g.fill();
    g.fillStyle = '#fff8e8';
    rr(g, 22, 22, 468, 212, 56); g.fill();
    g.fillStyle = '#4a3b2a';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${sub ? 92 : 110}px Jua, sans-serif`;
    g.fillText(text, 256, sub ? 112 : 130);
    if (sub) { g.font = '52px Jua, sans-serif'; g.fillStyle = '#8a6a4a'; g.fillText(sub, 256, 190); }
  });
  m = sharedOf(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: '#fff2e0', emissiveIntensity: 0.25, emissiveMap: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  signCache.set(key, m);
  return m;
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ── 공용 재질(색마다 하나)
const matCache = new Map<string, THREE.Material>();
export function toyMat(color: string, o: { rough?: number; glow?: number; alpha?: number; metal?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.rough ?? 0.55}|${o.glow ?? 0}|${o.alpha ?? 1}|${o.metal ?? 0}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    const c = new THREE.Color(color);
    m = sharedOf(new THREE.MeshStandardMaterial({
      color: c, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0, emissive: c, emissiveIntensity: o.glow ?? 0.06,
      transparent: (o.alpha ?? 1) < 1, opacity: o.alpha ?? 1, depthWrite: (o.alpha ?? 1) >= 1,
    }));
    matCache.set(key, m);
  }
  return m;
}
/** 정점색/인스턴스색을 쓰는 흰 재질 */
export function tintMat(o: { rough?: number; clear?: boolean; glow?: boolean } = {}): THREE.Material {
  const key = `tint|${o.rough ?? 0.55}|${o.clear ? 1 : 0}|${o.glow ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    if (o.glow) m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.8) });
    else if (o.clear) m = new THREE.MeshPhysicalMaterial({ roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.6, depthWrite: false, emissive: '#ffffff', emissiveIntensity: 0.06 });
    else m = new THREE.MeshStandardMaterial({ roughness: o.rough ?? 0.55, metalness: 0, emissive: '#ffffff', emissiveIntensity: 0.04 });
    matCache.set(key, sharedOf(m));
  }
  return m;
}
/** 하늘 재질(곡률·안개 없음) */
export function skyMat<M extends THREE.Material>(m: M): M { m.userData.noCurve = true; (m as unknown as { fog: boolean }).fog = false; return sharedOf(m); }

// ── 공용 지오메트리
export const GEO = {
  sph: sharedOf(new THREE.SphereGeometry(1, 24, 16)),
  sphLo: sharedOf(new THREE.SphereGeometry(1, 16, 10)),
  cyl: sharedOf(new THREE.CylinderGeometry(1, 1, 1, 16, 1)),
  cap: sharedOf(new THREE.CapsuleGeometry(1, 1, 4, 12)),
  capLo: sharedOf(new THREE.CapsuleGeometry(1, 1, 2, 6)),
  tor: sharedOf(new THREE.TorusGeometry(1, 0.25, 12, 36)),
  disc: sharedOf(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)),
  plane: sharedOf(new THREE.PlaneGeometry(1, 1)),
};

/** 인스턴스 메시(행렬 목록 + 색 목록) */
export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats4: THREE.Matrix4[], colors?: THREE.Color[], name = 'planets-inst'): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, mats4.length));
  im.name = name;
  mats4.forEach((m, i) => im.setMatrixAt(i, m));
  im.count = mats4.length;
  if (colors) colors.forEach((c, i) => im.setColorAt(i, c));
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/** 위치·회전(y, x, z)·배율로 행렬 */
export function mat4(x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
