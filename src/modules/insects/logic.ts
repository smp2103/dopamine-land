// 곤충 채집 규칙(순수) — 화면·WebGL 없이 시험할 수 있게 숫자만 다룬다. insects.ts 가 매 프레임 부른다.
// GDD 3.6 P0: 64m 청크·반경 100·청크마다 2~5마리 / 달리면 4~8m·걸으면 1.5~4m 에서 도망(경계심 비례) /
// 메뚜기는 2~3m 폴짝 / 나무 흔들기·돌 두드리기 → 숨은 곤충 20초 / 잠자리채 0.35초·앞 60°·2.2m(좋은 채 +30%) /
// 놓치면 도망 + catch-fail / 잠자리채가 없으면 '🔒 잠자리채 필요' / 두근 게이지 80%↑ 면 채가 분홍으로 반짝(5.3).
import type { RollResult, RollSpecies } from '../../core/api';

// ───────────── 수치 ─────────────
/** 청크 한 변(m)·만드는 반경(m) */
export const CHUNK = 64;
export const RADIUS = 100;
/** 청크마다 곤충 수 */
export const PER_CHUNK: readonly [number, number] = [2, 5];
/** 같은 청크·같은 4시간 묶음이면 같은 곤충 */
export const BLOCK_HOURS = 4;

/** 잠자리채: 휘두르기 0.35초, 0.12초부터 그물이 앞을 쓴다. 앞 60°(반각 30°) · 2.2m, 좋은 채 +30% */
export const NET = {
  swing: 0.35,
  sweepFrom: 0.12,
  range: 2.2,
  halfAngle: Math.PI / 6,
  goodMul: 1.3,
  /** 그물이 닿는 높이(발 기준 위·아래) */
  up: 2.7,
  down: 1.3,
} as const;

/** 움직임 판정(평균 속도 m/s): 멈춤 < 1.2 ≤ 살금 < 3.2 ≤ 걷기 < 6.3 ≤ 달리기 */
export const MOVE = { still: 1.2, sneak: 3.2, run: 6.3 } as const;
/** 도망 거리(m): 달리기 4~8, 걷기 1.5~4, 살금살금은 걷기의 45%, 멈추면 0. 붙어 있는 곤충(perch)은 덜 예민 */
export const FLEE = {
  run: [4, 8] as const,
  walk: [1.5, 4] as const,
  sneakMul: 0.45,
  perchRun: [1.5, 3] as const,
  perchWalkMul: 0.5,
} as const;
/** 폴짝: 2~3m, 0.45초, 높이 0.55m, 다음 폴짝까지 0.6초 */
export const HOP = { min: 2, max: 3, dur: 0.45, height: 0.55, cool: 0.6 } as const;
/** 숨은 곤충: 20초 동안, 흔들 때마다 60%, 한꺼번에 3마리까지, 나무·돌에서 0.9~1.7m */
export const HIDE = { sec: 20, chance: 0.6, max: 3, near: [0.9, 1.7] as const } as const;
/** 두근 게이지가 이보다 크면 잠자리채가 분홍으로 반짝 */
export const PINK_GAUGE = 0.8;
/** 희귀도 기본 가중치(GDD 5.2) — econ 이 없을 때 쓰는 로컬 굴림 */
export const RARITY_W: Readonly<Record<number, number>> = { 1: 55, 2: 27, 3: 12, 4: 5, 5: 1 };
/** 잠자리채가 없을 때 안내 */
export const NO_NET_LABEL = '🔒 잠자리채 필요';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ───────────── 움직임·도망 ─────────────
export type MoveState = 'still' | 'sneak' | 'walk' | 'run';

/** 평균 속도 + 이동 모드 → 움직임 단계(점프·활공은 시끄러우니 달리기로 친다) */
export function moveStateOf(speedAvg: number, mode?: string): MoveState {
  if (mode === 'air' || mode === 'glide') return 'run';
  if (speedAvg >= MOVE.run) return 'run';
  if (speedAvg >= MOVE.sneak) return 'walk';
  if (speedAvg >= MOVE.still) return 'sneak';
  return 'still';
}

/** 경계심 0..1 — 희귀도(★1 = 0, ★5 = 1)에 겁(shy, 1 = 보통)을 곱하고, 겁쟁이는 조금 더 */
export function alertness(rarity: number, shy = 1): number {
  const s = Number.isFinite(shy) && shy > 0 ? shy : 1;
  return clamp01(((rarity - 1) / 4) * s + (s - 1) * 0.5);
}

export type Behavior = 'fly' | 'hover' | 'perch' | 'hop' | 'crawl' | 'hide' | 'glow';
export const BEHAVIORS: readonly Behavior[] = ['fly', 'hover', 'perch', 'hop', 'crawl', 'hide', 'glow'];

/** 이 움직임이면 몇 m 안에서 도망치나(0 = 안 도망) */
export function fleeRadius(state: MoveState, rarity: number, shy = 1, beh: Behavior = 'fly'): number {
  const a = alertness(rarity, shy);
  if (state === 'still') return 0;
  const walk = lerp(FLEE.walk[0], FLEE.walk[1], a);
  if (beh === 'perch') {
    if (state === 'run') return lerp(FLEE.perchRun[0], FLEE.perchRun[1], a);
    const w = walk * FLEE.perchWalkMul;
    return state === 'walk' ? w : w * FLEE.sneakMul;
  }
  if (state === 'run') return lerp(FLEE.run[0], FLEE.run[1], a);
  return state === 'walk' ? walk : walk * FLEE.sneakMul;
}

/** 지금 거리에서 놀라나 */
export function shouldFlee(dist: number, state: MoveState, rarity: number, shy = 1, beh: Behavior = 'fly'): boolean {
  const r = fleeRadius(state, rarity, shy, beh);
  return r > 0 && dist < r;
}

// ───────────── 종 읽기(데이터 모양이 조금 달라도 버티게) ─────────────
type LooseSp = {
  id: string; kind?: string; spot?: string; gdd?: string; tags?: string[];
  behavior?: unknown; beh?: unknown; hide?: unknown; hides?: unknown; p1?: boolean;
};

const HOP_KINDS = new Set(['grasshopper', 'cricket', 'hopper', 'springtail', 'flea']);
const HOVER_KINDS = new Set(['dragonfly', 'damselfly']);
const GLOW_KINDS = new Set(['firefly']);

/** 행동 코드(GDD 3.6 7종). data 의 behavior(예: 'hide(나무 흔들기)')가 있으면 그 첫 단어, 없으면 몸형·자리로 */
export function behaviorOf(sp: LooseSp): Behavior {
  const raw = sp.behavior ?? sp.beh;
  if (typeof raw === 'string') {
    const m = /^\s*(fly|hover|perch|hop|crawl|hide|glow)/i.exec(raw);
    if (m) return m[1].toLowerCase() as Behavior;
  }
  if (hideTriggerOf(sp)) return 'hide';
  const kind = sp.kind ?? '';
  if (HOP_KINDS.has(kind)) return 'hop';
  if (HOVER_KINDS.has(kind)) return 'hover';
  if (GLOW_KINDS.has(kind)) return 'glow';
  const spot = sp.spot ?? 'ground';
  if (spot === 'air') return 'fly';
  if (kind === 'bee' || kind === 'butterfly' || kind === 'moth') return spot === 'flower' && kind === 'bee' ? 'fly' : 'perch';
  if (spot === 'flower' || spot === 'tree' || spot === 'rock') return 'perch';
  return 'crawl';
}

export type HideTrigger = 'tree' | 'rock';
/** 데이터에 숨기 표시가 없을 때 쓰는 기본(브리프: 장수풍뎅이·사슴벌레·헤라클레스 = 나무, 톡토기·전갈 = 돌) */
const HIDE_GDD: Readonly<Record<string, HideTrigger>> = {
  b_rhino_beetle: 'tree', b_stag_beetle: 'tree', b_hercules: 'tree',
  b_springtail: 'rock', b_heart_scorpion: 'rock', b_star_scorpion: 'rock',
};

function triggerWord(v: unknown): HideTrigger | null | undefined {
  if (typeof v !== 'string') return v === false || v === null ? null : undefined;
  const s = v.toLowerCase();
  if (/tree|shake|나무|흔들/.test(s)) return 'tree';
  if (/rock|stone|hit|돌|바위/.test(s)) return 'rock';
  return undefined;
}

/** 숨은 곤충이면 무엇으로 나오나(나무 흔들기 / 돌 두드리기). 아니면 null */
export function hideTriggerOf(sp: LooseSp): HideTrigger | null {
  // ① 명시 필드 hide / hides
  for (const v of [sp.hide, sp.hides]) {
    const w = triggerWord(v);
    if (w !== undefined) return w;
  }
  // ② 태그 'hide:tree' 'hide:rock' 'hide:tree-shake' 'hide:rock-hit'
  for (const t of sp.tags ?? []) {
    if (t.startsWith('hide:') || t.startsWith('hide-')) {
      const w = triggerWord(t.slice(5));
      if (w) return w;
    }
  }
  // ③ 행동 글 'hide(나무 흔들기)' 'hide-rock'
  const raw = sp.behavior ?? sp.beh;
  if (typeof raw === 'string' && /^\s*hide/i.test(raw)) {
    const w = triggerWord(raw.replace(/^\s*hide/i, ''));
    if (w) return w;
  }
  // ④ GDD id 기본표 → 예전 몸형
  const g = HIDE_GDD[sp.gdd ?? ''] ?? HIDE_GDD[sp.id];
  if (g) return g;
  if (sp.kind === 'rhino' || sp.kind === 'stag') return 'tree';
  if (sp.kind === 'scorpion') return 'rock';
  return null;
}

/** 청크 스포너에 넣으면 안 되는 종(숨기·P1·줍기 전용) */
export function spawnable(sp: LooseSp): boolean {
  if (sp.p1) return false;
  if (hideTriggerOf(sp)) return false;
  const raw = sp.behavior ?? sp.beh;
  if (typeof raw === 'string' && /줍기|pickup|dig/i.test(raw)) return false;
  return true;
}

// ───────────── 잠자리채 부채꼴 ─────────────
export interface P3 { x: number; y: number; z: number }

/** 플레이어가 보는 방향(yaw 0 = -z) — Player.facing() 과 같다 */
export const facingOf = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

/** 평면 부채꼴 안인가: 거리 ≤ range 이고 보는 방향과 각도 ≤ half */
export function inCone(px: number, pz: number, yaw: number, bx: number, bz: number, range: number, half: number = NET.halfAngle): boolean {
  const dx = bx - px, dz = bz - pz;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  // 발밑(0.25m 안)은 각도와 상관없이 닿는다
  if (d < 0.25) return true;
  const f = facingOf(yaw);
  const cos = (dx * f.x + dz * f.z) / d;
  return cos >= Math.cos(half) - 1e-9;
}

/** 3D: 부채꼴 + 높이(발 기준 -down..+up). 닿으면 수평 거리, 아니면 -1 */
export function coneHit(p: P3, yaw: number, b: P3, range: number, half: number = NET.halfAngle): number {
  const dy = b.y - p.y;
  if (dy > NET.up || dy < -NET.down) return -1;
  if (!inCone(p.x, p.z, yaw, b.x, b.z, range, half)) return -1;
  return Math.hypot(b.x - p.x, b.z - p.z);
}

/** 부채꼴 안에서 가장 가까운 것(없으면 -1) */
export function pickInCone(p: P3, yaw: number, list: readonly P3[], range: number, half: number = NET.halfAngle): number {
  let best = -1, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const d = coneHit(p, yaw, list[i], range, half);
    if (d >= 0 && d < bd) { bd = d; best = i; }
  }
  return best;
}

/**
 * 휘두르기 진행(0..1)과 그물이 앞을 쓰는 중인지. 끝나는 프레임도 한 번 쓴다(프레임이 느려 0.35초를 건너뛰어도
 * 그물이 한 번은 앞을 지나가게) — done 이 된 프레임에서 sweeping 판정 뒤에 휘두르기를 끝낸다.
 */
export function swingPhase(elapsed: number): { k: number; sweeping: boolean; done: boolean } {
  return { k: clamp01(elapsed / NET.swing), sweeping: elapsed >= NET.sweepFrom, done: elapsed >= NET.swing };
}

// ───────────── 잠자리채 해금 ─────────────
export type NetTier = 'none' | 'net' | 'good' | 'gold';

/** 해금 키로 잠자리채 등급. econ 이 없으면(테스트·룩) 기본 잠자리채가 있는 걸로 */
export function netTier(isUnlocked?: ((k: string) => boolean) | null): NetTier {
  if (!isUnlocked) return 'net';
  const has = (k: string) => { try { return !!isUnlocked(k); } catch { return false; } };
  if (has('tool:goldnet')) return 'gold';
  if (has('tool:goodnet')) return 'good';
  if (has('tool:net')) return 'net';
  return 'none';
}
/** 등급별 닿는 거리 — 좋은 채·황금 채 +30% */
export const netRange = (tier: NetTier) => (tier === 'none' ? 0 : tier === 'net' ? NET.range : NET.range * NET.goodMul);
/** 반짝이 배율 — 황금 잠자리채 ×2(GDD 5.2 7단계) */
export const netLuck = (tier: NetTier) => (tier === 'gold' ? 2 : 1);

/** 안내 글: 채가 없으면 잠금 표시, 알던 종이면 이름까지 */
export function netPrompt(tier: NetTier, name: string | null, swarm = false): string {
  if (tier === 'none') return NO_NET_LABEL;
  if (swarm) return '잠자리채로 벌떼 잡기!';
  return name ? `잠자리채로 ${name} 잡기` : '잠자리채로 살금살금 잡기';
}

/** 분홍 반짝(두근 게이지 > 0.8) */
export const netGlows = (gauge: number | null | undefined) => typeof gauge === 'number' && gauge > PINK_GAUGE;

// ───────────── 스폰 ─────────────
/** 4시간 묶음 번호(0..5) */
export const blockOf = (hour: number) => Math.floor((((hour % 24) + 24) % 24) / BLOCK_HOURS);

/** 청크 난수 키 — 같은 청크·날·4시간 묶음·시간대면 같은 곤충 */
export const chunkSeed = (cx: number, cz: number, day: number, hour: number, tod: string) =>
  `insects:${cx},${cz}:${Math.floor(day)}:${blockOf(hour)}:${tod}`;

/** 청크마다 2~5마리 */
export function bugsPerChunk(rnd: () => number): number {
  const [a, b] = PER_CHUNK;
  return Math.min(b, a + Math.floor(rnd() * (b - a + 1)));
}

/** 폴짝 도착점: 플레이어 반대쪽 ±35°, 2~3m */
export function hopTarget(bx: number, bz: number, px: number, pz: number, rnd: () => number): { x: number; z: number; dist: number } {
  let ax = bx - px, az = bz - pz;
  const l = Math.hypot(ax, az);
  if (l < 1e-4) { ax = 1; az = 0; } else { ax /= l; az /= l; }
  const turn = (rnd() - 0.5) * (70 * Math.PI / 180);
  const c = Math.cos(turn), s = Math.sin(turn);
  const dx = ax * c - az * s, dz = ax * s + az * c;
  const dist = HOP.min + rnd() * (HOP.max - HOP.min);
  return { x: bx + dx * dist, z: bz + dz * dist, dist };
}

/** 폴짝 궤적(0..1) → 높이 */
export const hopArc = (k: number) => Math.sin(clamp01(k) * Math.PI) * HOP.height;

/** econ 이 없을 때: 희귀도 가중치(55·27·12·5·1)로 희귀도를 고르고(없으면 r-1… r+1…), 그 안에서 고르게 */
export function localRoll<T extends RollSpecies>(pool: readonly T[], rnd: () => number): RollResult & { species: T | null } {
  const byR: Record<number, T[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const sp of pool) if (sp && sp.rarity >= 1 && sp.rarity <= 5) byR[Math.round(sp.rarity)].push(sp);
  const have = [1, 2, 3, 4, 5].filter((r) => byR[r].length > 0);
  const u = rnd(), u2 = rnd();
  if (!have.length) return { species: null, rarity: 0, combo: 0 };
  let total = 0;
  for (const r of [1, 2, 3, 4, 5]) total += RARITY_W[r];
  let x = u * total, r = 5;
  for (const k of [1, 2, 3, 4, 5]) { x -= RARITY_W[k]; if (x < 0) { r = k; break; } }
  const order: number[] = [];
  for (let k = r; k >= 1; k--) order.push(k);
  for (let k = r + 1; k <= 5; k++) order.push(k);
  const rr = order.find((k) => byR[k].length > 0)!;
  const list = byR[rr];
  const species = list[Math.min(list.length - 1, Math.floor(u2 * list.length))];
  return { species, rarity: rr, combo: 0 };
}

/** 천장·오늘 첫 잡기로 끌어올린 굴림 — 한 청크에 하나만 둔다(온 섬이 ★3 이 되지 않게) */
export const isSpecialRoll = (r: RollResult | null | undefined) => !!r && (!!r.firstOfDay || !!r.pityHit);

/** 개체 크기(cm): 굴림에 크기가 있으면 그것, 없으면 종의 cm 범위에서 */
export function sizeCm(res: { size?: number } | null, cm: readonly [number, number] | undefined, rnd: () => number): number {
  if (res && typeof res.size === 'number' && Number.isFinite(res.size) && res.size > 0) return res.size;
  const [a, b] = cm ?? [2, 4];
  return Math.round((a + rnd() * (b - a)) * 10) / 10;
}

// ───────────── 숨은 곤충(나무 흔들기·돌 두드리기) ─────────────
export interface HidePlan<T> { species: T; res: RollResult; x: number; z: number }

/**
 * 흔들기/두드리기 한 번 → 숨은 곤충 계획. 후보는 trigger 가 맞는 종만.
 * 확률 60%, 이미 숨은 곤충이 max 마리면 안 나온다. 자리는 나무·돌에서 0.9~1.7m, 플레이어 쪽으로 기운다.
 * roll 을 주면 그걸로 종을 고른다(econ.rollCatch), 아니면 localRoll.
 */
export function planHide<T extends RollSpecies & LooseSp>(
  trigger: HideTrigger, x: number, z: number, px: number, pz: number, pool: readonly T[], rnd: () => number,
  o: { live?: number; roll?: (pool: T[], rnd: () => number) => RollResult | null } = {},
): HidePlan<T> | null {
  const u = rnd();
  if ((o.live ?? 0) >= HIDE.max) return null;
  const cands = pool.filter((s) => !s.p1 && hideTriggerOf(s) === trigger);
  if (!cands.length || u >= HIDE.chance) return null;
  const res = (o.roll ? o.roll(cands, rnd) : null) ?? localRoll(cands, rnd);
  const species = (res.species ? cands.find((c) => c.id === res.species!.id) : null) ?? null;
  if (!species) return null;
  // 플레이어 쪽 반원으로 떨어진다(나무 뒤에 숨어 안 보이지 않게)
  let tx = px - x, tz = pz - z;
  const l = Math.hypot(tx, tz);
  const base = l > 1e-3 ? Math.atan2(tz, tx) : rnd() * Math.PI * 2;
  const a = base + (rnd() - 0.5) * Math.PI * 0.9;
  const r = HIDE.near[0] + rnd() * (HIDE.near[1] - HIDE.near[0]);
  tx = x + Math.cos(a) * r; tz = z + Math.sin(a) * r;
  return { species, res: { ...res, species }, x: tx, z: tz };
}

/** 숨은 곤충 남은 시간 → 0..1 크기(나올 때 0.4초 톡, 들어갈 때 1.2초 스르르) */
export function hideScale(age: number): number {
  if (age < 0) return 0;
  if (age < 0.4) return age / 0.4;
  const left = HIDE.sec - age;
  if (left <= 0) return 0;
  return left < 1.2 ? left / 1.2 : 1;
}

// ───────────── 놓침 ─────────────
/** catch-fail 을 보낼 곳(진짜 Game·가짜 게임 둘 다) */
export interface FailSink {
  econ?: { catchFail?: (a: 'bug') => void } | null;
  state: { emit: (e: { type: string; [k: string]: unknown }) => void };
}
/** 놓쳤다: econ 이 있으면 econ.catchFail('bug')(콤보 0 + 'catch-fail' 방송), 없으면 직접 방송 */
export function reportFail(g: FailSink): void {
  const f = g.econ?.catchFail;
  if (typeof f === 'function') {
    try { f.call(g.econ, 'bug'); return; } catch (e) { console.error('[insects catchFail]', e); }
  }
  g.state.emit({ type: 'catch-fail', activity: 'bug' });
}

/** 놓친 뒤 같이 놀라 도망갈 반경(목표 + 근처 친구들) */
export const MISS_SCARE_R = 3;
