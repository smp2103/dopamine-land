// meta 순수 로직 — 저장 모양(flags.meta), 카운터, 업적·세트·숙련·섬 도감 판정, 오늘의 미션 굴림.
// DOM·three·game 없음: MetaView(읽기 창)만 받아서 계산한다 → 테스트가 그대로 부른다.
import {
  ACHIEVEMENTS, DEX_SLOTS, ISLAND_DEX_STEPS, MASTERY_SILVER_COUNT, MISSION_BY_ID, MISSION_TEMPLATES, MISSIONS_PER_DAY, SETS,
  type AchCond, type AchDef, type MissionTpl, type Reward, type SeenSet, type SetDef, type SpeciesMatch,
} from './data';

// ───────────── 읽기 창 ─────────────
export interface DexRecLike { count: number; variants?: Partial<Record<string, number>> }
export interface SpeciesLike {
  id: string;
  name?: string;
  category: string;
  rarity: number;
  tags?: string[];
  gdd?: string;
  /** P1 전용 종(섬 도감 %에서 뺀다 — islanddev islandDexPct 와 같은 규칙) */
  p1?: boolean;
  where?: ReadonlyArray<{ island?: string; weather?: { only?: readonly string[] } }>;
}
/** 판정이 읽는 것 — meta.ts 가 game(state·econ·geo)로 채운다 */
export interface MetaView {
  /** 누적 카운터 */
  counter(key: string): number;
  /** 최고 기록 */
  max(key: string): number;
  /** 등록된 모든 종 */
  species: readonly SpeciesLike[];
  rec(id: string): DexRecLike | undefined;
  /** GDD id 또는 실제 id → 종 */
  byGdd(id: string): SpeciesLike | undefined;
  /** 다녀간 곳 수(자기 기록 ∪ geo·econ) */
  seen(set: SeenSet): number;
  isUnlocked(key: string): boolean;
  isDonated(id: string): boolean;
  skeletons(): number;
  rocketParts(): number;
}

// ───────────── 저장 ─────────────
export interface MissionDay {
  day: number;
  /** 오늘 고른 템플릿 id 5개 */
  ids: string[];
  /** 끝낸 것(보상 받은 것) */
  done: string[];
  /** 다섯 개 모두 +10 을 받았나 */
  bonus: boolean;
}
export interface MetaFlags {
  v: 1;
  /** 누적 카운터 */
  c: Record<string, number>;
  /** 최고 기록 */
  max: Record<string, number>;
  /** 오늘 카운터(day 가 바뀌면 비운다) */
  d: { day: number; c: Record<string, number> };
  /** 받은 업적 → 받은 날 */
  ach: Record<string, number>;
  /** 끝낸 세트 → 끝낸 날 */
  sets: Record<string, number>;
  perks: string[];
  /** 종 → 보상 받은 숙련 단계 */
  mastery: Record<string, number>;
  /** 섬 → 받은 섬 도감 단계 수(0..3) */
  isl: Record<string, number>;
  /** 다녀간 곳 */
  seen: Record<SeenSet, string[]>;
  ms: MissionDay | null;
  /** econ 이 없을 때 밀린 보상 */
  owed: Reward[];
  /** meta 가 준 반짝별 합(일지 표시) */
  stars: number;
  /** 마지막으로 디딘 섬(다시 불러와도 '다른 섬 가기'·뗏목 출발 섬이 이어진다) */
  lastLand?: string;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const numMap = (x: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isObj(x)) for (const [k, v] of Object.entries(x)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
};
const strList = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string'))] : []);

/** flags.meta 를 꺼내고(없거나 깨졌으면 새로) 빈 칸을 채운다. 같은 객체를 계속 쓴다 */
export function ensureMetaFlags(flags: Record<string, unknown>): MetaFlags {
  const raw = isObj(flags.meta) ? flags.meta : {};
  const d = isObj(raw.d) ? raw.d : {};
  const seen = isObj(raw.seen) ? raw.seen : {};
  const ms = isObj(raw.ms) && typeof raw.ms.day === 'number'
    ? { day: raw.ms.day, ids: strList(raw.ms.ids), done: strList(raw.ms.done), bonus: raw.ms.bonus === true }
    : null;
  const f: MetaFlags = {
    v: 1,
    c: numMap(raw.c),
    max: numMap(raw.max),
    d: { day: typeof d.day === 'number' ? d.day : -1, c: numMap(d.c) },
    ach: numMap(raw.ach),
    sets: numMap(raw.sets),
    perks: strList(raw.perks),
    mastery: numMap(raw.mastery),
    isl: numMap(raw.isl),
    seen: { island: strList(seen.island), islet: strList(seen.islet), landmark: strList(seen.landmark), lighthouse: strList(seen.lighthouse) },
    ms,
    owed: Array.isArray(raw.owed) ? (raw.owed.filter(isObj) as Reward[]) : [],
    stars: typeof raw.stars === 'number' && Number.isFinite(raw.stars) ? raw.stars : 0,
  };
  if (raw === flags.meta) {
    // 같은 객체를 고쳐 쓴다(다른 곳이 들고 있는 참조가 끊기지 않게)
    for (const k of Object.keys(raw)) delete raw[k];
    Object.assign(raw, f);
    return raw as unknown as MetaFlags;
  }
  flags.meta = f;
  return f;
}

/** 날이 바뀌었으면 오늘 카운터를 비운다(바뀌었으면 true) */
export function rollDay(f: MetaFlags, day: number): boolean {
  if (f.d.day === day) return false;
  f.d = { day, c: {} };
  return true;
}
/** 카운터 올리기(누적 + 오늘) */
export function bump(f: MetaFlags, key: string, n = 1) {
  if (!(n > 0) || !Number.isFinite(n)) return;
  f.c[key] = (f.c[key] ?? 0) + n;
  f.d.c[key] = (f.d.c[key] ?? 0) + n;
}
/** 최고 기록 갱신(올랐으면 true) */
export function setMax(f: MetaFlags, key: string, v: number): boolean {
  if (!Number.isFinite(v) || v <= (f.max[key] ?? 0)) return false;
  f.max[key] = v;
  return true;
}
/** 다녀간 곳 기록(새로면 true) */
export function addSeen(f: MetaFlags, set: SeenSet, id: string): boolean {
  if (!id || f.seen[set].includes(id)) return false;
  f.seen[set].push(id);
  return true;
}

// ───────────── 종 고르기 ─────────────
/** 도감 칸이 있는 종(재료 'item' 은 빼고, 탈것 줄은 넣는다) */
export const isDexRow = (s: SpeciesLike) => s.category !== 'item' || !!s.tags?.includes('vehicle');

export function matches(s: SpeciesLike, m: SpeciesMatch): boolean {
  if (!isDexRow(s)) return false;
  if (m.cat !== undefined) {
    const cats = typeof m.cat === 'string' ? [m.cat] : m.cat;
    if (!cats.includes(s.category)) return false;
  }
  if (m.tag !== undefined && !s.tags?.includes(m.tag)) return false;
  if (m.rarity !== undefined && s.rarity !== m.rarity) return false;
  if (m.weatherOnly !== undefined && !(s.where ?? []).some((w) => (w.weather?.only ?? []).includes(m.weatherOnly!))) return false;
  return true;
}

/** 도감 % (0..100) — 칸 수는 max(등록된 칸, 314) */
export function dexPct(v: MetaView): { got: number; total: number; pct: number } {
  let rows = 0, got = 0;
  for (const s of v.species) {
    if (!isDexRow(s)) continue;
    rows++;
    if (v.rec(s.id)) got++;
  }
  const total = Math.max(rows, DEX_SLOTS);
  return { got, total, pct: total > 0 ? (got / total) * 100 : 0 };
}

/** 반짝이·왕관 개체 누적 수 */
export function variantTotal(v: MetaView, variant: 'shiny' | 'crown'): number {
  let n = 0;
  for (const s of v.species) { const r = v.rec(s.id); if (r) n += r.variants?.[variant] ?? 0; }
  return n;
}

// ───────────── 진행도 ─────────────
export interface Progress { have: number; need: number; done: boolean }
const prog = (have: number, need: number): Progress => ({ have: Math.max(0, have), need, done: need > 0 && have >= need });

export function progressOf(c: AchCond, v: MetaView): Progress {
  switch (c.k) {
    case 'count': return prog(v.counter(c.key), c.n);
    case 'max': return prog(v.max(c.key), c.n);
    case 'dexPct': { const d = dexPct(v); return prog(Math.floor(d.pct * 10) / 10, c.pct); }
    case 'dexAny': return prog(c.ids.some((id) => { const s = v.byGdd(id); return !!s && !!v.rec(s.id); }) ? 1 : 0, 1);
    case 'dexN': {
      let got = 0;
      for (const s of v.species) if (matches(s, c.match) && v.rec(s.id)) got++;
      return prog(got, c.n);
    }
    case 'dexAll': {
      let got = 0, total = 0;
      for (const s of v.species) if (matches(s, c.match)) { total++; if (v.rec(s.id)) got++; }
      return prog(got, Math.max(total, c.min ?? 1));
    }
    case 'variant': return prog(variantTotal(v, c.v), c.n);
    case 'seen': return prog(v.seen(c.set), c.n);
    case 'unlocked': return prog(c.keys.filter((k) => v.isUnlocked(k)).length, c.n);
    case 'skeletons': return prog(v.skeletons(), c.n);
    case 'rocketParts': return prog(v.rocketParts(), c.n);
  }
}
export const achProgress = (a: AchDef, v: MetaView) => progressOf(a.cond, v);

/** 아직 안 받았는데 조건을 채운 업적 */
export function newAchievements(f: MetaFlags, v: MetaView): AchDef[] {
  return ACHIEVEMENTS.filter((a) => f.ach[a.id] === undefined && achProgress(a, v).done);
}

// ───────────── 세트 ─────────────
/** 섬 고유종: where 가 하나 이상이고 전부 그 섬 */
export const isEndemic = (s: SpeciesLike, island: string) => isDexRow(s) && !!s.where?.length && s.where.every((w) => w.island === island);

export interface SetProgress extends Progress {
  /** 세트에 드는 종(칸 그림용) — variant 세트는 비어 있다 */
  members: SpeciesLike[];
  /** 덧붙는 조건 */
  extra?: { have: number; need: number; label: string };
}
export function setMembers(def: SetDef, v: MetaView): SpeciesLike[] {
  if (def.mode === 'endemic') return v.species.filter((s) => isEndemic(s, def.island ?? ''));
  if (def.mode === 'variant' || !def.match) return [];
  return v.species.filter((s) => matches(s, def.match!));
}
export function setProgress(def: SetDef, v: MetaView): SetProgress {
  const members = setMembers(def, v);
  let have = 0;
  let need = def.need ?? 0;
  switch (def.mode) {
    case 'dex': have = members.filter((s) => v.rec(s.id)).length; break;
    case 'donate': have = members.filter((s) => v.isDonated(s.id)).length; break;
    case 'variant': have = variantTotal(v, def.variant ?? 'shiny'); break;
    case 'endemic': have = members.filter((s) => v.rec(s.id)).length; need = members.length; break;
  }
  const out: SetProgress = { ...prog(have, need), members };
  if (def.extra) {
    const eh = def.extra.k === 'skeletons' ? v.skeletons() : 0;
    out.extra = { have: eh, need: def.extra.n, label: def.extra.label };
    out.done = out.done && eh >= def.extra.n;
  }
  return out;
}
export function newSets(f: MetaFlags, v: MetaView): SetDef[] {
  return SETS.filter((s) => f.sets[s.id] === undefined && setProgress(s, v).done);
}

// ───────────── 숙련 ─────────────
/** 0 미등록 · 1 등록 · 2 은별(10회) · 3 금별(왕관 개체) */
export function masteryLevel(rec: DexRecLike | undefined | null): number {
  if (!rec || !(rec.count > 0)) return 0;
  if ((rec.variants?.crown ?? 0) > 0) return 3;
  if (rec.count >= MASTERY_SILVER_COUNT) return 2;
  return 1;
}
/** 보상 받을 숙련 오름: [종, 예전 단계, 새 단계] */
export function masteryUps(f: MetaFlags, v: MetaView): Array<{ s: SpeciesLike; from: number; to: number }> {
  const out: Array<{ s: SpeciesLike; from: number; to: number }> = [];
  for (const s of v.species) {
    if (!isDexRow(s)) continue;
    const to = masteryLevel(v.rec(s.id));
    const from = f.mastery[s.id] ?? 0;
    if (to > from) out.push({ s, from, to });
  }
  return out;
}

// ───────────── 섬 도감 % ─────────────
// islanddev/logic islandDexPct 와 같은 규칙(물건·P1 종 빼기) — 일지와 개발 창의 % 가 같아야 한다
export const onIsland = (s: SpeciesLike, island: string) => s.category !== 'item' && !s.p1 && (s.where ?? []).some((w) => w.island === island);
export function islandDex(v: MetaView, island: string): { got: number; total: number; pct: number } {
  let got = 0, total = 0;
  for (const s of v.species) if (onIsland(s, island)) { total++; if (v.rec(s.id)) got++; }
  return { got, total, pct: total > 0 ? (got / total) * 100 : 0 };
}
/** 이 % 로 닿은 단계 수(0..3) */
export const islandStepsAt = (pct: number) => ISLAND_DEX_STEPS.filter((s) => pct >= s.pct - 1e-9).length;

// ───────────── 미션 ─────────────
/** 오늘의 미션 5개(템플릿 id) — rng 는 `missions:${day}` 로 만든 것 */
export function rollMissions(rng: () => number, n = MISSIONS_PER_DAY, pool: readonly MissionTpl[] = MISSION_TEMPLATES): string[] {
  const ids = pool.map((m) => m.id);
  const k = Math.min(n, ids.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (ids.length - i));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, k);
}
/** 오늘 미션 판을 마련(날이 바뀌었으면 새로 굴림). 새로 굴렸으면 true */
export function ensureMissions(f: MetaFlags, day: number, rngFor: (key: string) => () => number): boolean {
  if (f.ms && f.ms.day === day && f.ms.ids.length) return false;
  f.ms = { day, ids: rollMissions(rngFor(`missions:${day}`)), done: [], bonus: false };
  return true;
}
export interface MissionRow { id: string; tpl: MissionTpl; have: number; goal: number; done: boolean; ready: boolean }
/** 오늘 미션 진행(have 는 오늘 카운터, 끝낸 것은 goal 로 고정) */
export function missionRows(f: MetaFlags): MissionRow[] {
  const ms = f.ms;
  if (!ms) return [];
  const today = f.d.day === ms.day ? f.d.c : {};
  return ms.ids.map((id) => MISSION_BY_ID.get(id)).filter((t): t is MissionTpl => !!t).map((tpl) => {
    const done = ms.done.includes(tpl.id);
    const have = done ? tpl.goal : Math.min(tpl.goal, today[tpl.key] ?? 0);
    return { id: tpl.id, tpl, have, goal: tpl.goal, done, ready: !done && have >= tpl.goal };
  });
}

// ───────────── 보상 ─────────────
/** 보상 묶음 → 한 줄(카드 본문) */
export function rewardLine(r: Reward, names: (id: string) => string = (id) => id): string {
  const parts: string[] = [];
  if (r.stars) parts.push(`⭐${r.stars}`);
  for (const k of r.keys ?? []) parts.push(`${k.color === 'gold' ? '🔑금' : k.color === 'rainbow' ? '🌈' : '🗝️은'}열쇠 조각 ${k.n}`);
  for (const [id, n] of Object.entries(r.items ?? {})) parts.push(`${names(id)}${n > 1 ? ` ×${n}` : ''}`);
  return parts.join(' · ');
}
/** 보상 여럿 합치기(밀린 보상 정리용) */
export function mergeRewards(list: readonly Reward[]): Reward {
  const keys = new Map<string, number>();
  const items: Record<string, number> = {};
  const unlock = new Set<string>();
  let stars = 0;
  for (const r of list) {
    stars += r.stars ?? 0;
    for (const k of r.keys ?? []) keys.set(k.color, (keys.get(k.color) ?? 0) + k.n);
    for (const [id, n] of Object.entries(r.items ?? {})) items[id] = (items[id] ?? 0) + n;
    for (const u of r.unlock ?? []) unlock.add(u);
  }
  return {
    ...(stars ? { stars } : {}),
    ...(keys.size ? { keys: [...keys].map(([color, n]) => ({ color: color as 'silver' | 'gold' | 'rainbow', n })) } : {}),
    ...(Object.keys(items).length ? { items } : {}),
    ...(unlock.size ? { unlock: [...unlock] } : {}),
  };
}
