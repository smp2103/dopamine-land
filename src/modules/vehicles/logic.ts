// 탈것 순수 규칙 — 해금 키·잠금 안내·소유 기록(flags.vehicles)·소환 자리 찾기·발사 시간표(GDD 6.2).
// DOM·WebGL·Rapier 없음 → tests/vehicles-core.test.ts 가 바로 부른다. 실제 움직임·모델은 vehicles.ts 와 kinds/*.
import * as THREE from 'three';
import { canMount, canLaunch, rocketStatus, type EconLike } from '../economy/progression';

/** 어디서 타나: 땅 · 물 · 하늘(땅에서 출발) · 발사대(움직이지 않음) */
export type Medium = 'land' | 'water' | 'air' | 'pad';

// ───────────── 해금 키 ─────────────

/** 종류 → 해금 키(GDD 4.8). 부두에 매어 둔 배도 같은 키를 쓴다 */
export const UNLOCK_KEY: Readonly<Record<string, string>> = {
  bike: 'v:bike', scooter: 'v:bike', kart: 'v:kart',
  sail: 'v:yacht', motor: 'v:motorboat', sub: 'v:submarine',
  balloon: 'v:balloon', plane: 'v:plane',
  raft: 'v:raft', tugboat: 'v:tugboat', duck_tube: 'v:duck_tube',
  rocket: 'rocket:pad',
};
/** 종류의 해금 키(표에 없으면 `v:<kind>`) */
export const unlockKeyOf = (kind: string, fallback?: string) => UNLOCK_KEY[kind] ?? fallback ?? `v:${kind}`;

/** 안쪽 이름 → 바깥(GDD id 꼬리) 이름. 이벤트·current() 는 바깥 이름을 쓴다 */
export const PUBLIC_ID: Readonly<Record<string, string>> = { sail: 'yacht', motor: 'motorboat', sub: 'submarine' };
/** 바깥 이름·줄임말 → 안쪽 이름 */
const ALIAS: Readonly<Record<string, string>> = {
  yacht: 'sail', sailboat: 'sail', motorboat: 'motor', submarine: 'sub', duck: 'duck_tube', tube: 'duck_tube', tug: 'tugboat',
};
/** 'v_raft' · 'v:motorboat' · 'motorboat' → 안쪽 종류 이름 */
export function normKind(k: string): string {
  const s = String(k ?? '').replace(/^v[_:]/, '');
  return ALIAS[s] ?? s;
}
export const publicId = (kind: string) => PUBLIC_ID[kind] ?? kind;
/** 도감 칸 id(v_*) — 해금 키에서 만든다(scooter 는 자전거 칸을 함께 쓴다) */
export const dexIdOf = (kind: string, key = unlockKeyOf(kind)) => (kind === 'rocket' ? 'v_rocket' : key.startsWith('v:') ? `v_${key.slice(2)}` : `v_${kind}`);

// ───────────── 잠금 판정·안내 ─────────────

/** 잠금 안내에 쓰는 econ 모양(진짜 EconApi·가짜 모두) */
export interface GateEcon extends EconLike {
  requirement?(key: string): { ok: boolean; text: string };
  rocket?(): { blueprint: boolean; count: number; pad: boolean };
}

/** 이 종류를 탈 수 있나. 로켓은 부품 6 + 발사대(canLaunch), 경제가 없으면(룩 테스트) 로켓 빼고 다 탄다 */
export function isRidable(kind: string, key: string, econ: GateEcon | null | undefined): boolean {
  if (kind === 'rocket' || key === 'rocket:pad') return canLaunch(econ);
  if (!econ) return true;
  if (key.startsWith('v:')) return canMount(key.slice(2), econ);
  return econ.isUnlocked(key);
}

/** econ.requirement 글에서 '🔒 이름 — ' 머리를 떼고 조건만 */
export function requirementBody(text: string | undefined | null): string {
  let s = String(text ?? '').trim().replace(/^(🔒|✅)\s*/u, '');
  const i = s.indexOf(' — ');
  if (i >= 0) s = s.slice(i + 3);
  return s.trim();
}

/** 로켓 부품·발사대 상태 */
export function rocketInfo(econ: GateEcon | null | undefined): { count: number; total: number; pad: boolean; blueprint: boolean } {
  if (!econ) return { count: 0, total: 6, pad: false, blueprint: false };
  const r = econ.rocket?.() ?? rocketStatus((k) => econ.isUnlocked(k));
  return { count: r.count, total: 6, pad: r.pad, blueprint: r.blueprint };
}

export interface GateResult { ok: boolean; label: string; /** 잠겼을 때 토스트로 보여 줄 한 줄 */ why: string }

/**
 * 타기 안내 한 줄.
 * - 열림: '<이름> 타기' (로켓은 '🚀 <이름> 발사!')
 * - 잠김: '🔒 <이름> — <조건>' (로켓은 '🔒 <이름> — 부품 n/6 · 발사대 …')
 */
export function gateLabel(def: { kind: string; name: string; unlockKey: string }, econ: GateEcon | null | undefined): GateResult {
  const ok = isRidable(def.kind, def.unlockKey, econ);
  if (def.kind === 'rocket') {
    if (ok) return { ok, label: `🚀 ${def.name} 발사!`, why: '' };
    const r = rocketInfo(econ);
    const body = `부품 ${Math.min(r.count, r.total)}/${r.total} · 발사대 ${r.pad ? '완성 ✅' : '아직이에요'}`;
    const why = !r.blueprint && r.count === 0 ? `${body} (펭박사의 설계도부터!)` : body;
    return { ok, label: `🔒 ${def.name} — ${body}`, why: `🔒 ${def.name} — ${why}` };
  }
  if (ok) return { ok, label: `${def.name} 타기`, why: '' };
  const req = econ?.requirement?.(def.unlockKey);
  const body = requirementBody(req?.text) || '아직 잠겨 있어요';
  const label = `🔒 ${def.name} — ${body}`;
  return { ok, label, why: label };
}

// ───────────── 소유 기록(flags.vehicles) ─────────────

/** 마지막으로 내린 자리 */
export interface VehAt { x: number; z: number; h: number; y?: number }
/** flags.vehicles — owned 는 얻은/탄 차례(마지막이 가장 최근), at 은 종류별 마지막 자리, 그 밖의 키(skins 등)는 그대로 둔다 */
export interface VehFlags { owned: string[]; at: Record<string, VehAt>; [k: string]: unknown }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 저장에서 읽기 — 이상한 값은 버린다(새 객체를 돌려준다) */
export function readFlags(raw: unknown): VehFlags {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: VehFlags = { ...src, owned: [], at: {} };
  if (Array.isArray(src.owned)) {
    for (const k of src.owned) if (typeof k === 'string' && k && !out.owned.includes(normKind(k))) out.owned.push(normKind(k));
  }
  const at = src.at && typeof src.at === 'object' ? (src.at as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(at)) {
    const o = v as Record<string, unknown> | null;
    const x = num(o?.x), z = num(o?.z);
    if (x === null || z === null) continue;
    const e: VehAt = { x, z, h: num(o?.h) ?? 0 };
    const y = num(o?.y);
    if (y !== null) e.y = y;
    out.at[normKind(k)] = e;
  }
  return out;
}

/** 소유 목록에 넣거나 맨 뒤(가장 최근)로 옮긴다. 처음이면 true */
export function noteOwned(f: VehFlags, kind: string): boolean {
  const i = f.owned.indexOf(kind);
  if (i >= 0) f.owned.splice(i, 1);
  f.owned.push(kind);
  return i < 0;
}

// ───────────── 소환 자리 ─────────────

/** 지형 질문(섬 함수를 그대로 넘기거나 테스트용 가짜) */
export interface Terrain {
  height(x: number, z: number): number;
  /** 물 높이(없으면 -Infinity) */
  water(x: number, z: number): number;
  /** 평평한 맨땅인가(없으면 기울기만 본다) */
  buildable?(x: number, z: number, margin: number): boolean;
  /** 부두·건물 같은 것이 그 자리를 막았나(물리 충돌 검사 등) */
  blocked?(x: number, z: number): boolean;
}

/** 물 깊이가 depth 이상인가 */
export function deepAt(T: Terrain, x: number, z: number, depth: number): boolean {
  const wl = T.water(x, z);
  return Number.isFinite(wl) && wl - T.height(x, z) >= depth;
}
/** 물이 없는(또는 발목도 안 되는) 땅 */
export function dryAt(T: Terrain, x: number, z: number): boolean {
  const wl = T.water(x, z);
  return !Number.isFinite(wl) || wl - T.height(x, z) < 0.05;
}

/**
 * 가장 가까운, 배가 뜰 물(깊이 depth 이상, 둘레 clearR 도 깊은 곳). 고리 모양으로 넓혀 가며 찾는다.
 * rot 은 깊어지는 쪽(먼바다)을 본다 — 앞 = (sin rot, cos rot).
 */
export function findWaterSpot(T: Terrain, x: number, z: number, depth: number, maxR = 60, step = 2, clearR = 3): { x: number; z: number; rot: number } | null {
  for (let r = 0; r <= maxR; r += step) {
    const n = Math.max(1, Math.floor(r * 0.8));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!deepAt(T, px, pz, depth)) continue;
      let clear = true;
      for (const [ox, oz] of [[clearR, 0], [-clearR, 0], [0, clearR], [0, -clearR]]) if (!deepAt(T, px + ox, pz + oz, depth * 0.6)) { clear = false; break; }
      if (!clear || T.blocked?.(px, pz)) continue;
      const e = 4;
      const gx = T.height(px + e, pz) - T.height(px - e, pz), gz = T.height(px, pz + e) - T.height(px, pz - e);
      const rot = Math.abs(gx) + Math.abs(gz) < 1e-6 ? Math.atan2(px - x, pz - z) : Math.atan2(-gx, -gz);
      return { x: px, z: pz, rot };
    }
  }
  return null;
}

/** 가장 가까운 평평한 마른 땅(둘레 margin 도 비슷한 높이) */
export function findLandSpot(T: Terrain, x: number, z: number, margin = 1, maxR = 14, step = 0.5): { x: number; z: number } | null {
  for (let r = 0; r <= maxR; r += step) {
    const n = Math.max(1, Math.floor(r * 4));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!dryAt(T, px, pz) || T.blocked?.(px, pz)) continue;
      if (T.buildable) { if (!T.buildable(px, pz, margin)) continue; }
      else {
        const h = T.height(px, pz);
        let flat = true;
        for (const [ox, oz] of [[margin, 0], [-margin, 0], [0, margin], [0, -margin]]) {
          if (!dryAt(T, px + ox, pz + oz) || Math.abs(T.height(px + ox, pz + oz) - h) > 0.35) { flat = false; break; }
        }
        if (!flat) continue;
      }
      return { x: px, z: pz };
    }
  }
  return null;
}

export interface SummonSpot { x: number; z: number; rot: number }
/**
 * 소환할 것 고르기: 가장 최근(owned 끝)부터, 지금 그 매체 자리가 있는 첫 종류.
 * spotFor(medium) 는 자리(없으면 null), mediumOf(kind) 가 null 이면 부를 수 없는 종류(로켓 등).
 */
export function chooseSummon(order: readonly string[], mediumOf: (kind: string) => Medium | null, ridable: (kind: string) => boolean,
  spotFor: (medium: Medium, kind: string) => SummonSpot | null): { kind: string; spot: SummonSpot } | null {
  for (let i = order.length - 1; i >= 0; i--) {
    const k = order[i];
    const m = mediumOf(k);
    if (!m || m === 'pad' || !ridable(k)) continue;
    const spot = spotFor(m, k);
    if (spot) return { kind: k, spot };
  }
  return null;
}

// ───────────── 발사 시간표(GDD 6.2) ─────────────

/** 시각(초) */
export const LAUNCH_T = { board: 0, wave: 0.5, count3: 1, count2: 2, count1: 3, ignite: 4, sky: 7, white: 9 } as const;
export type LaunchCue = keyof typeof LAUNCH_T;
const CUE_ORDER = (Object.keys(LAUNCH_T) as LaunchCue[]).sort((a, b) => LAUNCH_T[a] - LAUNCH_T[b]);
export type LaunchPhase = 'board' | 'count' | 'ascent' | 'sky' | 'done';

/** 시각 → 구간 */
export function launchPhase(t: number): LaunchPhase {
  if (t >= LAUNCH_T.white) return 'done';
  if (t >= LAUNCH_T.sky) return 'sky';
  if (t >= LAUNCH_T.ignite) return 'ascent';
  if (t >= LAUNCH_T.count3) return 'count';
  return 'board';
}

/** 발사 시간표: step(dt) 가 이번에 지난 신호를 차례대로 돌려준다. 신호는 한 번씩만 */
export class LaunchTimeline {
  t = 0;
  private fired = new Set<LaunchCue>();
  get done() { return this.fired.has('white'); }
  get phase(): LaunchPhase { return launchPhase(this.t); }
  /** 시작 신호(board)는 첫 step(0) 에도 나온다 */
  step(dt: number): LaunchCue[] {
    if (this.done) return [];
    this.t += Math.max(0, dt);
    const out: LaunchCue[] = [];
    for (const c of CUE_ORDER) if (!this.fired.has(c) && this.t >= LAUNCH_T[c]) { this.fired.add(c); out.push(c); }
    return out;
  }
}

/** 핵심 SPACE_ORIGIN(core/game.ts) 과 같은 값 — 코어 전체를 끌어오지 않으려고 숫자만 */
export const SPACE_ORIGIN_XYZ = { x: 0, y: 0, z: 30000 } as const;

/** 발사 마무리가 쓰는 게임 모양(진짜·가짜) */
export interface LaunchGame {
  econ?: { isUnlocked(k: string): boolean; unlock(k: string, why?: string): void } | null;
  state: { emit(e: { type: string; [k: string]: unknown }): void };
  space?: { landingSpawn?: THREE.Vector3 } | null;
  setWorld(w: 'earth' | 'space', spawn?: THREE.Vector3): void;
}

/**
 * 9초: (처음이면) space:moon 해금 → launch{to:'moon'} → setWorld('space', 달 착륙장).
 * 착륙장은 space 가 주면 그것, 아니면 SPACE_ORIGIN + (0, 2, 0). 돌려주는 값은 내린 자리
 */
export function completeLaunch(g: LaunchGame): THREE.Vector3 {
  const econ = g.econ;
  if (econ && !econ.isUnlocked('space:moon')) econ.unlock('space:moon', 'launch');
  g.state.emit({ type: 'launch', to: 'moon' });
  const ls = g.space?.landingSpawn;
  const spawn = ls ? ls.clone() : new THREE.Vector3(SPACE_ORIGIN_XYZ.x, SPACE_ORIGIN_XYZ.y + 2, SPACE_ORIGIN_XYZ.z);
  g.setWorld('space', spawn);
  return spawn;
}
