// 바다 규칙(순수 — three·DOM 없이 테스트한다): 헤엄 체력·튜브 구조, 잠수 산소, 잠수 구역·후보 거르기,
// 로컬 굴림(econ 이 없을 때), 재료 떨굼, 생물 행동(도망·숨기·톡 튐), flags.ocean 읽기·옛 키 옮기기.
import type { RollResult, SeaZone, Weather } from '../../core/api';
import { isRelic, isWitness, RARITY_WEIGHT, type DiveZone, type SeaBehavior, type SeaSpecies } from './data';

// ───────────── 헤엄 체력(GDD 3.3 P0-1) ─────────────
export const STAMINA = {
  max: 100,
  /** 해안에서 이 안(m)이면 물에서도 회복 */
  recoverDist: 150,
  /** 해안에서 이 밖(m)이면 초당 drain 씩 준다(150~200 은 그대로) */
  drainDist: 200,
  drain: 1,
  /** 땅·배 위 회복(초당) */
  recoverLand: 25,
  /** 얕은 물 회복(초당) */
  recoverWater: 8,
  /** 0 이 되면 이만큼(초) 화면이 하얘진 뒤 튜브 구조 */
  fade: 1.5,
} as const;

export interface SwimInput {
  /** 헤엄·잠수 중인가(땅·배 위면 false) */
  swimming: boolean;
  /** 가장 가까운 해안까지 거리(m, 땅이면 0) */
  coastDist: number;
  /** 헤엄이 아닐 때 쉬는 중인가(땅·배 위 = 회복). false 면(물 위로 잠깐 뛰어오름·활공) 그대로. 기본 true */
  resting?: boolean;
}
export type SwimEvent = 'rescue-start' | 'rescue' | null;

/** 헤엄 체력 — 0 이 되면 1.5초 페이드 → 'rescue'(모듈이 가장 가까운 해변으로 옮긴다, 벌칙 없음) */
export class SwimStamina {
  readonly max = STAMINA.max;
  value: number = STAMINA.max;
  /** 구조 페이드 중 */
  fading = false;
  fadeT = 0;
  get ratio() { return this.value / this.max; }
  /** 페이드 진행 0..1 */
  get fadeK() { return this.fading ? Math.min(1, this.fadeT / STAMINA.fade) : 0; }
  tick(dt: number, s: SwimInput): SwimEvent {
    if (!(dt > 0)) return null;
    if (this.fading) {
      this.fadeT += dt;
      if (this.fadeT < STAMINA.fade) return null;
      this.fading = false;
      this.fadeT = 0;
      this.value = this.max;
      return 'rescue';
    }
    if (!s.swimming) { if (s.resting !== false) this.value = Math.min(this.max, this.value + STAMINA.recoverLand * dt); return null; }
    if (s.coastDist <= STAMINA.recoverDist) this.value = Math.min(this.max, this.value + STAMINA.recoverWater * dt);
    else if (s.coastDist > STAMINA.drainDist) {
      this.value -= STAMINA.drain * dt;
      if (this.value <= 0) {
        this.value = 0;
        this.fading = true;
        this.fadeT = 0;
        return 'rescue-start';
      }
    }
    return null;
  }
  /** 디버그·불러오기 */
  set(v: number) { this.value = Math.max(0, Math.min(this.max, v)); this.fading = false; this.fadeT = 0; }
}

/**
 * 해안까지 거리(m, 땅이면 0). 세계 샘플의 해안 값은 먼바다에서 작게 나오므로
 * geo 바다 구역과 같은 식(섬 원판 반지름 × 1.25 밖 거리)과 큰 쪽을 쓴다.
 */
export function seaDistance(coastSigned: number, x: number, z: number, islands: ReadonlyArray<{ x: number; z: number; r: number }>): number {
  if (coastSigned >= 0) return 0;
  let lo = Infinity;
  for (const d of islands) lo = Math.min(lo, Math.hypot(x - d.x, z - d.z) - d.r * 1.25);
  return Math.max(-coastSigned, Number.isFinite(lo) ? lo : 0);
}

// ───────────── 잠수 산소(GDD 3.3 P0-2) ─────────────
export const OXYGEN = { bare: 20, snorkel: 40, wetsuit: 90, /** 수면·땅에서 초당 채우기 */ refill: 12 } as const;

/** 도구 해금(tool:snorkel · tool:wetsuit)에 따른 산소 초 */
export function oxygenMaxFor(isUnlocked?: ((k: string) => boolean) | null): number {
  const has = (k: string) => { try { return !!isUnlocked?.(k); } catch { return false; } };
  if (has('tool:wetsuit')) return OXYGEN.wetsuit;
  if (has('tool:snorkel')) return OXYGEN.snorkel;
  return OXYGEN.bare;
}

/** 산소 방울 — 잠수 중 초당 1, 0 이면 'out'(모듈이 자동으로 떠오르게 하고 oxygen-out 을 보낸다) */
export class OxygenTank {
  max: number = OXYGEN.bare;
  value: number = OXYGEN.bare;
  get ratio() { return this.max > 0 ? this.value / this.max : 0; }
  /** 최대치가 바뀌면(도구를 샀다) 비율을 지켜 늘린다 — 가득이면 새 최대치로 가득 */
  setMax(m: number) {
    if (!(m > 0) || m === this.max) return;
    this.value = Math.min(m, (this.value / this.max) * m);
    this.max = m;
  }
  tick(dt: number, diving: boolean): 'out' | null {
    if (!(dt > 0)) return null;
    if (!diving) { this.value = Math.min(this.max, this.value + OXYGEN.refill * dt); return null; }
    if (this.value <= 0) return null;
    this.value -= dt;
    if (this.value > 0) return null;
    this.value = 0;
    return 'out';
  }
  set(v: number) { this.value = Math.max(0, Math.min(this.max, v)); }
}

// ───────────── 튜브 구조: 가장 가까운 해변 ─────────────
export interface BeachTerrain {
  height(x: number, z: number): number;
  /** 물 높이(물 없으면 -Infinity) */
  water(x: number, z: number): number;
}
/** 발 디딜 마른 땅(바다·호수 위가 아니고 물가보다 조금 높은 곳) */
export function isDry(T: BeachTerrain, x: number, z: number): boolean {
  const h = T.height(x, z);
  if (!(h > 0.35)) return false;
  const w = T.water(x, z);
  return !(Number.isFinite(w) && w > h - 0.05);
}
/**
 * (x, z) 에서 가장 가까운 해변. targets(섬 가운데들) 쪽으로 걸어가 보고, 둘레 16방향도 본다.
 * 물가에서 몇 걸음 더 안쪽(최대 6m)으로 올려 준다. 못 찾으면 null.
 */
export function findBeach(T: BeachTerrain, x: number, z: number, targets: ReadonlyArray<{ x: number; z: number }>, o: { step?: number; radial?: number } = {}): { x: number; z: number; d: number } | null {
  const step = o.step ?? 4;
  let best: { x: number; z: number; d: number } | null = null;
  const walk = (dx: number, dz: number, limit: number) => {
    const L = Math.hypot(dx, dz);
    if (L < 1e-6) return;
    dx /= L; dz /= L;
    for (let d = 0; d <= limit; d += step) {
      if (best && d >= best.d) return;
      const px = x + dx * d, pz = z + dz * d;
      if (!isDry(T, px, pz)) continue;
      let ix = px, iz = pz;
      for (let k = 1; k <= 3; k++) {
        const qx = px + dx * k * 2, qz = pz + dz * k * 2;
        if (isDry(T, qx, qz)) { ix = qx; iz = qz; } else break;
      }
      best = { x: ix, z: iz, d };
      return;
    }
  };
  for (const t of targets) walk(t.x - x, t.z - z, Math.hypot(t.x - x, t.z - z));
  const R = o.radial ?? 420;
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; walk(Math.cos(a), Math.sin(a), R); }
  return best;
}

// ───────────── 잠수 구역·후보 ─────────────
/** geo 바다 구역 + 난파선 근처 → 잠수 구역(잡기 where.zone) */
export function diveZoneOf(sea: SeaZone | null | undefined, nearWreck: boolean): DiveZone | null {
  if (nearWreck) return 'wreck';
  switch (sea) {
    case 'trench': return 'trench';
    case 'reef': return 'reef';
    case 'shore': case 'shallow': return 'shallow';
    case 'offshore': case 'deep': return 'offshore';
    default: return null;
  }
}

export interface DiveQuery {
  zone: DiveZone;
  /** 그 자리 해저 깊이(m, 양수) */
  depth: number;
  tod: string;
  /** 0..24 — 정오·자정 창(where.time 'noon'·'midnight') */
  hour?: number;
  weather: Weather | string;
}

const ALL_TIME = new Set(['all', 'any', 'always', '종일']);
/** where.time 이 지금 맞나 */
export function timeOk(time: string | string[] | undefined, tod: string, hour?: number): boolean {
  if (time == null) return true;
  const ts = Array.isArray(time) ? time : [time];
  if (!ts.length) return true;
  const h = hour != null && Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : undefined;
  return ts.some((t) => ALL_TIME.has(t) || t === tod || (t === 'noon' && h != null && h >= 11 && h < 13) || (t === 'midnight' && h != null && h < 2));
}

/** 잠수 굴림 후보: 깊이 · 구역 · 시간대 · 날씨(only) 로 거른다. 목격·유물·P1 은 뺀다 */
export function divePool(list: readonly SeaSpecies[], q: DiveQuery): SeaSpecies[] {
  return list.filter((sp) => {
    if (isWitness(sp) || isRelic(sp) || sp.p1) return false;
    if (q.depth < sp.minDepth) return false;
    const ws = sp.where ?? [];
    if (!ws.length) return true;
    return ws.some((w) => {
      if (w.zone && w.zone !== q.zone) return false;
      if (!timeOk(w.time, q.tod, q.hour)) return false;
      const only = w.weather?.only;
      if (only && only.length && !(only as string[]).includes(q.weather)) return false;
      return true;
    });
  });
}

/** econ 이 없을 때의 로컬 굴림(GDD 5.2 의 희귀도 가중치 + 날씨 boost) */
export function localRoll(pool: readonly SeaSpecies[], rnd: () => number, weather: string): SeaSpecies | null {
  if (!pool.length) return null;
  const w = pool.map((sp) => {
    let k = RARITY_WEIGHT[sp.rarity] ?? 1;
    for (const wh of sp.where ?? []) if ((wh.weather?.boost as string[] | undefined)?.includes(weather)) k *= wh.weather?.x ?? 3;
    return k;
  });
  let tot = 0;
  for (const k of w) tot += k;
  let r = rnd() * tot;
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** 개체 크기(cm) — econ 결과가 없을 때 size 범위에서 */
export function localSize(sp: Pick<SeaSpecies, 'size'>, rnd: () => number): number {
  return Math.round((sp.size[0] + (sp.size[1] - sp.size[0]) * Math.pow(rnd(), 1.6)) * 10) / 10;
}

// ───────────── 미리 굴린 그림자와 보상 ─────────────
/** 오늘 첫 잡기(★3+)·천장 보상을 들고 있는 굴림인가 */
export const isBonusRoll = (r: Pick<RollResult, 'firstOfDay' | 'pityHit'> | null | undefined) => !!r && (!!r.firstOfDay || !!r.pityHit);
/**
 * 보상 없는 보통 굴림으로 바꾼다 — 보상은 한 자리만 들고, 나머지 자리는 로컬 굴림 종(sp)으로.
 * 희귀도는 그 종 그대로, 크기는 새로, 보상 표시는 뗀다(콤보·변이는 그대로 — 희귀도와 무관).
 */
export function plainRoll(res: RollResult, sp: SeaSpecies, size: number): RollResult {
  const out: RollResult = { species: sp as unknown as RollResult['species'], rarity: sp.rarity, combo: res.combo, size };
  if (res.variant) out.variant = res.variant;
  return out;
}
/** 시간대·날씨가 바뀐 자리를 다시 굴릴까 — 안 보이거나 20m 밖일 때만(눈앞에서 바뀌지 않게) */
export const REROLL_NEAR = 20;
export const needsReroll = (tag: string, nowTag: string, dist: number, visible: boolean) => tag !== nowTag && (!visible || dist > REROLL_NEAR);
/** 잡기 창 — 목격(바다거북·돌고래·고래)은 도감에만(keep:false), 나머지는 가방에 */
export const catchShowFor = (sp: Pick<SeaSpecies, 'witness' | 'meetOnly' | 'tags'>): { keep: boolean } => ({ keep: !isWitness(sp) });

// ───────────── 재료 떨굼(GDD 4.3) ─────────────
export interface DropLine { id: string; n: number; kind: 'shell' | 'pearl' | 'stardust' | 'seaweed' | 'coral' }
const SHELL_SPECIES = new Set(['sea-scallop', 'sea-oyster', 'sea-conch']);
export const PEARL_OYSTER_P = 0.2;
/** 잡은 생물이 덤으로 주는 재료 */
export function catchDrops(sp: Pick<SeaSpecies, 'id'>, weather: string, rnd: () => number): DropLine[] {
  const out: DropLine[] = [];
  if (SHELL_SPECIES.has(sp.id)) out.push({ id: 'm_shell', n: 1, kind: 'shell' });
  if (sp.id === 'sea-pearl' && rnd() < PEARL_OYSTER_P) out.push({ id: 'm_pearl', n: 1, kind: 'pearl' });
  if (sp.id === 'sea-giantclam' && weather === 'clear') out.push({ id: 'm_pearl', n: 1, kind: 'pearl' });
  if (sp.id === 'd_plankton') out.push({ id: 'm_stardust', n: 2, kind: 'stardust' });
  return out;
}
/** 해초 뜯기·산호 줍기 */
export function harvestDrop(kind: 'seaweed' | 'coral', rnd: () => number): DropLine {
  return kind === 'seaweed' ? { id: 'm_seaweed', n: rnd() < 0.35 ? 2 : 1, kind } : { id: 'm_coral', n: 1, kind };
}

// ───────────── 생물 행동 ─────────────
export interface BehState {
  mode: 'idle' | 'dash' | 'hidden' | 'hop';
  /** 지금 상태로 지난 시간 */
  t: number;
  /** 다음 상태까지(초) */
  next: number;
  /** 다시 놀라기까지 남은 시간 */
  cd: number;
  /** 집(처음 자리)에서 떨어진 거리 */
  ox: number;
  oz: number;
  /** 이동 시작·목표(dash·hop) */
  fx: number; fz: number; tx: number; tz: number;
  /** 바닥 위로 뜬 높이(hop) */
  y: number;
}
export const newBeh = (rnd: () => number): BehState => ({ mode: 'idle', t: 0, next: 1.5 + rnd() * 3, cd: 0, ox: 0, oz: 0, fx: 0, fz: 0, tx: 0, tz: 0, y: 0 });

export interface BehNear {
  /** 플레이어까지 거리(m) */
  dist: number;
  /** 플레이어 속도(m/s) */
  speed: number;
  /** 플레이어 → 생물 방향(단위, 수평) */
  dx: number;
  dz: number;
}
/** 도망 조건: 이만큼 가까이에서 이보다 빨리 다가오면 휙(살금살금 다가가면 괜찮다) */
export const FLEE = { dist: 3.5, speed: 1.1, len: 5, time: 0.7, rest: 2.6, roam: 9 } as const;
export const HIDE = { dist: 2.2, out: [4, 6], hidden: 2.4, cd: 5 } as const;
export const HOP = { time: 0.55, height: 0.35, len: 0.6, roam: 2.2 } as const;

const ease = (u: number) => u * u * (3 - 2 * u);
const clampRoam = (st: BehState, r: number) => {
  const L = Math.hypot(st.tx, st.tz);
  if (L > r) { st.tx *= r / L; st.tz *= r / L; }
};

/** 한 프레임 행동 — still·slow·drift·swim 은 그리는 쪽이 t 로 움직이고 여기선 상태가 없다 */
export function stepBehaviour(b: SeaBehavior, st: BehState, dt: number, near: BehNear, rnd: () => number): void {
  if (!(dt > 0)) return;
  st.t += dt;
  st.cd = Math.max(0, st.cd - dt);
  if (b === 'flee') {
    if (st.mode === 'idle' && st.cd <= 0 && near.dist < FLEE.dist && near.speed > FLEE.speed) {
      st.mode = 'dash'; st.t = 0;
      st.fx = st.ox; st.fz = st.oz;
      const side = rnd() < 0.5 ? -1 : 1;
      st.tx = st.ox + (near.dx - near.dz * 0.4 * side) * FLEE.len;
      st.tz = st.oz + (near.dz + near.dx * 0.4 * side) * FLEE.len;
      clampRoam(st, FLEE.roam);
    }
    if (st.mode === 'dash') {
      const u = Math.min(1, st.t / FLEE.time), k = ease(u);
      st.ox = st.fx + (st.tx - st.fx) * k; st.oz = st.fz + (st.tz - st.fz) * k;
      if (u >= 1) { st.mode = 'idle'; st.t = 0; st.cd = FLEE.rest; }
    }
    return;
  }
  if (b === 'hide') {
    if (st.mode === 'idle') {
      const startled = st.cd <= 0 && near.dist < HIDE.dist;
      if (startled || st.t >= st.next) { st.mode = 'hidden'; st.t = 0; st.next = HIDE.hidden; if (startled) st.cd = HIDE.cd + HIDE.hidden; }
    } else if (st.mode === 'hidden' && st.t >= st.next) {
      st.mode = 'idle'; st.t = 0; st.next = HIDE.out[0] + rnd() * (HIDE.out[1] - HIDE.out[0]);
    }
    return;
  }
  if (b === 'hop') {
    if (st.mode === 'idle' && st.t >= st.next) {
      st.mode = 'hop'; st.t = 0;
      st.fx = st.ox; st.fz = st.oz;
      const a = rnd() * Math.PI * 2;
      st.tx = st.ox + Math.cos(a) * HOP.len; st.tz = st.oz + Math.sin(a) * HOP.len;
      clampRoam(st, HOP.roam);
    }
    if (st.mode === 'hop') {
      const u = Math.min(1, st.t / HOP.time);
      st.ox = st.fx + (st.tx - st.fx) * u; st.oz = st.fz + (st.tz - st.fz) * u;
      st.y = Math.sin(u * Math.PI) * HOP.height;
      if (u >= 1) { st.mode = 'idle'; st.t = 0; st.y = 0; st.next = 1.5 + rnd() * 1.8; }
    }
  }
}

/** 지금 잡을 수 있나 — 도망치는 중·숨은 중·뛰는 중이면 놓친다(catch-fail) */
export const catchable = (st: BehState) => st.mode === 'idle';

// ───────────── flags.ocean ─────────────
export interface OceanFlags {
  v: 1;
  /** 연 보물 항아리 id → 연 날(옛 'ocean.jar.<id>' 를 옮겨 온다) */
  jars: Record<string, number>;
  /** 오늘 잡은 잠수 자리(하루 지나면 비운다) */
  caught: { day: number; keys: string[] };
  /** 오늘 뜯은 해초·산호 자리 */
  picked: { day: number; keys: string[] };
  /** 난파선 은상자 연 날 */
  chest: Record<string, number>;
  /** 목격 인사한 날(종 id → 날) */
  greet: Record<string, number>;
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const dayList = (v: unknown): { day: number; keys: string[] } =>
  isObj(v) && typeof v.day === 'number' && Array.isArray(v.keys) ? { day: v.day, keys: v.keys.filter((k): k is string => typeof k === 'string') } : { day: -1, keys: [] };
const numRec = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) out[k] = typeof n === 'number' ? n : n ? 0 : -1;
  for (const k of Object.keys(out)) if (out[k] < 0) delete out[k];
  return out;
};

/** flags.ocean 을 읽어 고친다(없으면 만든다). 옛 최상위 'ocean.jar.<id>' 는 jars 로 옮기고 지운다. 같은 객체를 돌려준다 */
export function readOceanFlags(flags: Record<string, unknown>): OceanFlags {
  const raw = isObj(flags.ocean) ? flags.ocean : {};
  const f: OceanFlags = {
    v: 1,
    jars: numRec(raw.jars),
    caught: dayList(raw.caught),
    picked: dayList(raw.picked),
    chest: numRec(raw.chest),
    greet: numRec(raw.greet),
  };
  for (const k of Object.keys(flags)) {
    if (!k.startsWith('ocean.jar.')) continue;
    if (flags[k]) f.jars[k.slice('ocean.jar.'.length)] ??= 0;
    delete flags[k];
  }
  flags.ocean = f;
  return f;
}
/** 날이 바뀌었으면 오늘 목록을 비운다. 비웠으면 true */
export function rollOceanDay(f: OceanFlags, day: number): boolean {
  let changed = false;
  if (f.caught.day !== day) { f.caught = { day, keys: [] }; changed = true; }
  if (f.picked.day !== day) { f.picked = { day, keys: [] }; changed = true; }
  return changed;
}
