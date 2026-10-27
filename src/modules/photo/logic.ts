// 사진 모드 순수 로직 — 화면(DOM)·WebGL 없이 테스트할 수 있는 것만 모았다.
// 카메라 가두기(땅 아래·너무 멀리 못 가게) · 궤도/자유 카메라 수학 · 앨범 줄이기(최근 12장) · 시야 안 목격 고르기 · 사진 명소 판정 ·
// 필터(CSS 문자열 + 색 행렬 대체) · 액자·스티커·포즈 목록 · flags.photo 정리.
import * as THREE from 'three';

// ───────────── 상수 ─────────────
/** 앨범에 남기는 사진 수(IndexedDB·flags 둘 다) */
export const ALBUM_KEEP = 12;
/** 목격 등록 거리(m) — 카메라에서 이 안, 그리고 화면 안 */
export const WITNESS_RANGE = 30;
/** 카메라가 플레이어에게서 벗어날 수 있는 수평 거리(m) — 청크가 플레이어 주변만 있으니까 */
export const CAM_MAX_DIST = 40;
/** 플레이어 위로 올라갈 수 있는 높이(m) */
export const CAM_MAX_ABOVE = 30;
/** 땅에서 띄우는 최소 높이(m) */
export const CAM_CLEAR = 0.45;
/** 궤도 거리 범위(m) */
export const ORBIT_MIN = 1.2;
export const ORBIT_MAX = 25;
/** 자유 카메라 줌(시야각, 도) */
export const FOV_MIN = 18;
export const FOV_MAX = 75;
export const FOV_DEFAULT = 50;
/** 셀프 타이머 단계(초) — 0 = 끔 */
export const TIMER_STEPS = [0, 3, 10] as const;

export interface V3 { x: number; y: number; z: number }
export type GroundFn = (x: number, z: number) => number;

// ───────────── 카메라 가두기 ─────────────
export interface ClampOpts {
  /** 땅 위 최소 높이(기본 CAM_CLEAR) */
  clear?: number;
  /** 기준점(플레이어)에서 수평 최대 거리(기본 CAM_MAX_DIST) */
  maxDist?: number;
  /** 기준점 위 최대 높이(기본 CAM_MAX_ABOVE) */
  maxAbove?: number;
  /** 땅 높이를 둘러 재는 반경(m, 가파른 비탈에서 렌즈가 땅을 파고들지 않게) — 0 이면 한 점만 */
  probe?: number;
}

/** 카메라 자리 둘레(가운데 + 4방향) 땅 높이 중 가장 높은 값 */
export function groundUnder(x: number, z: number, groundAt: GroundFn, probe = 0.35): number {
  let h = safeH(groundAt(x, z));
  if (probe > 0) {
    h = Math.max(h, safeH(groundAt(x + probe, z)), safeH(groundAt(x - probe, z)), safeH(groundAt(x, z + probe)), safeH(groundAt(x, z - probe)));
  }
  return h;
}
const safeH = (h: number) => (Number.isFinite(h) ? h : -Infinity);

/**
 * 카메라 자리를 가둔다(새 객체를 돌려준다, 입력은 안 바꾼다):
 * 1) 기준점에서 수평 maxDist 안으로 끌어당기고  2) 기준점 위 maxAbove 아래로  3) 땅(둘레 최고점) + clear 위로.
 * 땅 조건이 마지막이라 높이 한도보다 이긴다(산꼭대기 옆에서도 땅속엔 안 들어간다).
 */
export function clampCamera(p: V3, anchor: V3, groundAt: GroundFn, o: ClampOpts = {}): V3 & { clamped: boolean } {
  const clear = o.clear ?? CAM_CLEAR, maxDist = o.maxDist ?? CAM_MAX_DIST, maxAbove = o.maxAbove ?? CAM_MAX_ABOVE;
  let { x, y, z } = p;
  let clamped = false;
  if (!Number.isFinite(x) || !Number.isFinite(z)) { x = anchor.x; z = anchor.z; clamped = true; }
  if (!Number.isFinite(y)) { y = anchor.y + 1.5; clamped = true; }
  const dx = x - anchor.x, dz = z - anchor.z, d = Math.hypot(dx, dz);
  if (d > maxDist) { const k = maxDist / d; x = anchor.x + dx * k; z = anchor.z + dz * k; clamped = true; }
  if (y > anchor.y + maxAbove) { y = anchor.y + maxAbove; clamped = true; }
  const g = groundUnder(x, z, groundAt, o.probe ?? 0.35);
  if (Number.isFinite(g) && y < g + clear) { y = g + clear; clamped = true; }
  return { x, y, z, clamped };
}

// ───────────── 궤도·자유 카메라 ─────────────
/** 궤도 카메라 자리(코어 CameraRig 와 같은 공식: yaw 0 이면 +z 쪽에서 본다) */
export function orbitPos(target: V3, yaw: number, pitch: number, dist: number): V3 {
  const c = Math.cos(pitch);
  return { x: target.x + Math.sin(yaw) * c * dist, y: target.y + Math.sin(pitch) * dist, z: target.z + Math.cos(yaw) * c * dist };
}
/** 자유 카메라가 보는 방향(yaw·pitch → 단위 벡터). orbit 과 짝: 같은 yaw·pitch 면 궤도 카메라도 이 방향을 본다 */
export function lookDir(yaw: number, pitch: number): V3 {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: -Math.sin(pitch), z: -Math.cos(yaw) * c };
}
/** 방향 벡터 → yaw·pitch(lookDir 의 역) */
export function anglesOf(dir: V3): { yaw: number; pitch: number } {
  const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const y = dir.y / l;
  return { yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(Math.max(-1, Math.min(1, -y))) };
}
/** 자유 카메라 한 걸음: 앞뒤·좌우는 수평(yaw)만 따르고, 위아래는 따로(QE) */
export function freeStep(pos: V3, yaw: number, ax: { x: number; y: number }, up: number, speed: number, dt: number): V3 {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = -fz, rz = fx;
  let mx = fx * ax.y + rx * ax.x, mz = fz * ax.y + rz * ax.x;
  const l = Math.hypot(mx, mz);
  if (l > 1) { mx /= l; mz /= l; }
  return { x: pos.x + mx * speed * dt, y: pos.y + up * speed * dt, z: pos.z + mz * speed * dt };
}
/** 휠 줌: 시야각(자유) */
export const zoomFov = (fov: number, wheel: number) => Math.max(FOV_MIN, Math.min(FOV_MAX, fov * (1 + wheel * 0.08)));
/** 휠 줌: 궤도 거리 */
export const zoomDist = (d: number, wheel: number) => Math.max(ORBIT_MIN, Math.min(ORBIT_MAX, d * (1 + wheel * 0.1)));
/** 고개 들기 범위 */
export const clampPitch = (p: number) => Math.max(-1.35, Math.min(1.45, p));
/** 플레이어가 카메라를 보게 하는 yaw(player.facing() = (-sin yaw, 0, -cos yaw)) */
export const faceYaw = (from: V3, to: V3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

// ───────────── 시야(프러스텀) ─────────────
const _m = new THREE.Matrix4();
/** 카메라에서 프러스텀을 만든다(행렬은 최신이어야 한다 — updateMatrixWorld 뒤) */
export function frustumOf(cam: THREE.PerspectiveCamera, out = new THREE.Frustum()): THREE.Frustum {
  cam.updateMatrixWorld();
  _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  return out.setFromProjectionMatrix(_m);
}

export interface WitnessLike { speciesId: string; pos: V3 }
export interface WitnessPick {
  /** 사진에 찍힌 종(겹치면 한 번, 가까운 순) */
  inShot: string[];
  /** 그중 아직 도감에 없는 종 */
  fresh: string[];
}
const _p = new THREE.Vector3();
const _s = new THREE.Sphere();
/**
 * 시야 안 + 카메라에서 range 안의 목격 종을 고른다.
 * 몸집 반경 r(기본 0.4 m)만큼 걸쳐도 찍힌 걸로 친다. isRegistered 가 true 면 fresh 에서 뺀다.
 */
export function selectWitnesses(list: readonly WitnessLike[], camPos: V3, frustum: THREE.Frustum, isRegistered: (id: string) => boolean,
  o: { range?: number; r?: number } = {}): WitnessPick {
  const range = o.range ?? WITNESS_RANGE, r = o.r ?? 0.4;
  const best = new Map<string, number>();
  for (const w of list) {
    if (!w || typeof w.speciesId !== 'string' || !w.speciesId || !w.pos) continue;
    const { x, y, z } = w.pos;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const d = Math.hypot(x - camPos.x, y - camPos.y, z - camPos.z);
    if (d > range) continue;
    _p.set(x, y, z);
    _s.set(_p, r);
    if (!frustum.intersectsSphere(_s)) continue;
    const prev = best.get(w.speciesId);
    if (prev === undefined || d < prev) best.set(w.speciesId, d);
  }
  const inShot = [...best.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  return { inShot, fresh: inShot.filter((id) => { try { return !isRegistered(id); } catch { return false; } }) };
}

// ───────────── 사진 명소 ─────────────
export interface PhotoSpot {
  id: string;
  name: string;
  world: 'earth' | 'space';
  x: number;
  z: number;
  /** 화면에 들어와야 하는 점의 높이(없으면 땅 + 2 m) */
  y?: number;
  /** 카메라가 이 수평 거리 안에 있어야 한다 */
  r: number;
  /** true 면 그 점이 화면 안이어야 한다(등대·폭포). 전망 언덕처럼 '거기서 찍기'면 false */
  mustSee: boolean;
  /** 한 번 주는 반짝별 */
  stars: number;
}
/** 지금 사진이 어느 명소 사진인가(가장 가까운 하나) — 없으면 null */
export function spotInShot(spots: readonly PhotoSpot[], world: 'earth' | 'space', camPos: V3, frustum: THREE.Frustum, groundAt: GroundFn): PhotoSpot | null {
  let pick: PhotoSpot | null = null, pd = Infinity;
  for (const s of spots) {
    if (s.world !== world) continue;
    const d = Math.hypot(camPos.x - s.x, camPos.z - s.z);
    if (d > s.r || d >= pd) continue;
    if (s.mustSee) {
      const y = s.y ?? safeGround(groundAt, s.x, s.z) + 2;
      _p.set(s.x, y, s.z);
      _s.set(_p, 1.5);
      if (!frustum.intersectsSphere(_s)) continue;
    }
    pick = s; pd = d;
  }
  return pick;
}
const safeGround = (g: GroundFn, x: number, z: number) => { const h = g(x, z); return Number.isFinite(h) ? h : 0; };

// ───────────── 앨범 줄이기 ─────────────
/** 남길 것·지울 것: 키(숫자 id, 클수록 새것)를 받아 최근 keep 개만 남긴다 */
export function trimPlan<K extends number | string>(keys: readonly K[], keep = ALBUM_KEEP): { keep: K[]; drop: K[] } {
  const sorted = [...new Set(keys)].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
  const n = Math.max(0, Math.floor(keep));
  const cut = Math.max(0, sorted.length - n);
  return { keep: sorted.slice(cut), drop: sorted.slice(0, cut) };
}

// ───────────── flags.photo ─────────────
/** 사진 한 장의 메타데이터(flags 에는 이것만 — 그림은 IndexedDB) */
export interface PhotoMeta {
  id: number;
  /** 찍은 실제 시각(ms) */
  at: number;
  /** 게임 날·시 */
  day: number;
  hour: number;
  world: 'earth' | 'space';
  place: string;
  spot?: string;
  species: string[];
  filter: FilterId;
  frame: FrameId;
  w: number;
  h: number;
}
export interface PhotoFlags {
  /** 최근 사진 메타(오래된 것부터, 최대 ALBUM_KEEP) */
  album: PhotoMeta[];
  /** 보너스를 받은 명소 */
  spots: Record<string, boolean>;
  /** 다음 사진 번호 */
  seq: number;
  /** 지금까지 찍은 수 */
  shots: number;
  /** 사진으로 처음 등록한 종 수 */
  witnessed: number;
  /** 마지막 설정(다음에 열면 그대로) */
  last?: { filter?: FilterId; frame?: FrameId; timer?: number };
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** flags.photo 를 읽는다(없거나 망가졌으면 고쳐 깐다) */
export function ensurePhotoFlags(flags: Record<string, unknown>): PhotoFlags {
  let f = flags.photo;
  if (!isObj(f)) { f = {}; flags.photo = f; }
  const o = f as Record<string, unknown>;
  if (!Array.isArray(o.album)) o.album = [];
  o.album = (o.album as unknown[]).filter((m): m is PhotoMeta => isObj(m) && typeof m.id === 'number' && Number.isFinite(m.id));
  if (!isObj(o.spots)) o.spots = {};
  o.seq = Math.max(1, Math.floor(num(o.seq, 1)), ...(o.album as PhotoMeta[]).map((m) => m.id + 1));
  o.shots = Math.max(0, Math.floor(num(o.shots)));
  o.witnessed = Math.max(0, Math.floor(num(o.witnessed)));
  if (o.last !== undefined && !isObj(o.last)) delete o.last;
  return o as unknown as PhotoFlags;
}
/** 메타 하나 넣고 최근 keep 장만 남긴다 → 빠진 id 목록 */
export function pushMeta(f: PhotoFlags, m: PhotoMeta, keep = ALBUM_KEEP): number[] {
  f.album = f.album.filter((x) => x.id !== m.id);
  f.album.push(m);
  f.album.sort((a, b) => a.id - b.id);
  const plan = trimPlan(f.album.map((x) => x.id), keep);
  const drop = new Set(plan.drop);
  f.album = f.album.filter((x) => !drop.has(x.id));
  return plan.drop;
}

/** 메타가 없는 앨범 그림(저장 초기화·?fresh=1·다른 저장)을 지우지 않고 '추억' 으로 다시 품는다 → 품은 id.
 *  seq 도 그림 번호보다 크게 올려서 새 사진이 옛 그림을 덮어쓰지 않게 한다 */
export function adoptOrphans(f: PhotoFlags, rows: readonly { id: number; at: number }[], keep = ALBUM_KEEP): number[] {
  const have = new Set(f.album.map((m) => m.id));
  const out: number[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.id)) continue;
    f.seq = Math.max(f.seq, Math.floor(r.id) + 1);
    if (have.has(r.id)) continue;
    f.album.push({ id: r.id, at: num(r.at, 0), day: 0, hour: 12, world: 'earth', place: '추억', species: [], filter: 'none', frame: 'none', w: 0, h: 0 });
    out.push(r.id);
  }
  if (out.length) {
    f.album.sort((a, b) => a.id - b.id);
    const drop = new Set(trimPlan(f.album.map((x) => x.id), keep).drop);
    f.album = f.album.filter((x) => !drop.has(x.id));
  }
  return out;
}

// ───────────── 필터 ─────────────
export type FilterId = 'none' | 'warm' | 'pastel' | 'grain' | 'sepia';
export interface FilterDef {
  id: FilterId;
  label: string;
  icon: string;
  /** 캔버스에 거는 CSS filter(새 렌더 패스 없음) */
  css: string;
  /** 필름 알갱이 겹치기 세기(0 = 없음) */
  grain: number;
}
export const FILTERS: readonly FilterDef[] = [
  { id: 'none', label: '그대로', icon: '🌤️', css: '', grain: 0 },
  { id: 'warm', label: '따끈', icon: '🧡', css: 'sepia(0.22) saturate(1.3) hue-rotate(-10deg) brightness(1.05)', grain: 0 },
  { id: 'pastel', label: '파스텔', icon: '🍬', css: 'saturate(0.68) brightness(1.12) contrast(0.86)', grain: 0 },
  { id: 'grain', label: '필름', icon: '🎞️', css: 'contrast(1.08) saturate(0.9) brightness(1.02)', grain: 0.16 },
  { id: 'sepia', label: '옛날', icon: '📜', css: 'sepia(0.85) contrast(1.05) brightness(1.04)', grain: 0.06 },
];
export const filterById = (id: unknown): FilterDef => FILTERS.find((f) => f.id === id) ?? FILTERS[0];

/** 4×5 색 행렬(행: r,g,b,a — 열: r,g,b,a,더하기 0..1). ctx.filter 가 없는 브라우저에서 픽셀로 거는 대체용 */
export type ColorMatrix = number[];
const IDENT: ColorMatrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
/** a·b(먼저 b, 다음 a) */
export function mulMatrix(a: ColorMatrix, b: ColorMatrix): ColorMatrix {
  const o = new Array(20).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let v = c === 4 ? a[r * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) v += a[r * 5 + k] * (c === 4 ? b[k * 5 + 4] : b[k * 5 + c]);
      o[r * 5 + c] = v;
    }
  }
  return o;
}
/** CSS filter 함수별 행렬(W3C Filter Effects 공식) */
const fx = {
  sepia(a: number): ColorMatrix {
    const k = 1 - Math.min(1, a);
    return [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0, 0,
      0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0, 0,
      0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k, 0, 0, 0, 0, 0, 1, 0];
  },
  saturate(s: number): ColorMatrix {
    return [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0, 0,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0, 0,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0, 0, 0, 0, 0, 1, 0];
  },
  hueRotate(deg: number): ColorMatrix {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0, 0,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0, 0,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0, 0, 0, 0, 0, 1, 0];
  },
  brightness(b: number): ColorMatrix { return [b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0]; },
  contrast(c: number): ColorMatrix { const t = 0.5 - 0.5 * c; return [c, 0, 0, 0, t, 0, c, 0, 0, t, 0, 0, c, 0, t, 0, 0, 0, 1, 0]; },
};
/** CSS filter 문자열 → 색 행렬(sepia·saturate·hue-rotate·brightness·contrast 만 — FILTERS 에 쓰는 것) */
export function cssToMatrix(css: string): ColorMatrix {
  let m = IDENT;
  const re = /([a-z-]+)\(\s*(-?[\d.]+)(deg|%)?\s*\)/g;
  let g: RegExpExecArray | null;
  while ((g = re.exec(css))) {
    const v = Number(g[2]) / (g[3] === '%' ? 100 : 1);
    const f = g[1] === 'sepia' ? fx.sepia(v) : g[1] === 'saturate' ? fx.saturate(v) : g[1] === 'hue-rotate' ? fx.hueRotate(v)
      : g[1] === 'brightness' ? fx.brightness(v) : g[1] === 'contrast' ? fx.contrast(v) : null;
    if (f) m = mulMatrix(f, m);
  }
  return m;
}
/** RGBA 바이트 배열에 색 행렬을 건다(제자리) */
export function applyMatrix(data: Uint8ClampedArray, m: ColorMatrix) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255, a = data[i + 3] / 255;
    data[i] = (m[0] * r + m[1] * g + m[2] * b + m[3] * a + m[4]) * 255;
    data[i + 1] = (m[5] * r + m[6] * g + m[7] * b + m[8] * a + m[9]) * 255;
    data[i + 2] = (m[10] * r + m[11] * g + m[12] * b + m[13] * a + m[14]) * 255;
  }
}

// ───────────── 액자·스티커·포즈 ─────────────
export type FrameId = 'none' | 'polaroid' | 'film' | 'heart' | 'cloud' | 'star';
export interface FrameDef { id: FrameId; label: string; icon: string }
export const FRAMES: readonly FrameDef[] = [
  { id: 'none', label: '없음', icon: '⬜' },
  { id: 'polaroid', label: '폴라로이드', icon: '🖼️' },
  { id: 'film', label: '필름', icon: '🎞️' },
  { id: 'heart', label: '하트', icon: '💗' },
  { id: 'cloud', label: '구름', icon: '☁️' },
  { id: 'star', label: '반짝별', icon: '⭐' },
];
export const frameById = (id: unknown): FrameDef => FRAMES.find((f) => f.id === id) ?? FRAMES[0];

export const STICKERS: readonly string[] = ['🌸', '⭐', '💖', '🌈', '✨', '🍀', '🎀', '🐾', '🌙', '🐟', '🦋', '🦖', '🍓', '☁️', '🐣', '👑'];
/** 한 장에 붙일 수 있는 스티커 수 */
export const STICKER_MAX = 16;
/** 붙인 스티커(화면 비율 좌표 0..1, 크기는 짧은 변 비율) */
export interface PlacedSticker { e: string; x: number; y: number; s: number; rot: number }
/** 이 자리(0..1)에 있는 스티커 번호(위에 있는 것부터) — 없으면 -1 */
export function stickerAt(list: readonly PlacedSticker[], x: number, y: number, aspect: number): number {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    // s 는 짧은 변 비율 — 가로 비율로 바꿔 원으로 판정
    const sx = aspect >= 1 ? s.s / aspect : s.s, sy = aspect >= 1 ? s.s : s.s * aspect;
    const dx = (x - s.x) / (sx * 0.6), dy = (y - s.y) / (sy * 0.6);
    if (dx * dx + dy * dy <= 1) return i;
  }
  return -1;
}

export interface PoseDef { id: 'cheer' | 'wave' | 'sit' | 'photo' | 'peace'; label: string; icon: string }
export const POSES: readonly PoseDef[] = [
  { id: 'cheer', label: '만세', icon: '🙌' },
  { id: 'wave', label: '안녕', icon: '👋' },
  { id: 'sit', label: '앉기', icon: '🪑' },
  { id: 'photo', label: '찰칵', icon: '📸' },
  { id: 'peace', label: '브이', icon: '✌️' },
];

/** 다음 타이머 단계 */
export const nextTimer = (t: number) => TIMER_STEPS[(TIMER_STEPS.indexOf(t as (typeof TIMER_STEPS)[number]) + 1) % TIMER_STEPS.length];
/** 다음 목록 원소(순환) */
export function cycle<T extends { id: string }>(list: readonly T[], id: string, dir = 1): T {
  const i = Math.max(0, list.findIndex((x) => x.id === id));
  return list[(i + dir + list.length) % list.length];
}
/** 파일 이름: dopamine-land-20261027-153012.png */
export function fileName(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `dopamine-land-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}
/** 게임 시각 글자: '3일째 오후 2:05' */
export function gameTimeText(day: number, hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const ampm = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${Math.max(0, Math.floor(day)) + 1}일째 ${ampm} ${h12}:${String(mm).padStart(2, '0')}`;
}
