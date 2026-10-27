// islanddev 순수 규칙 — 저장 모양 고치기, 단계 조건·비용, 섬 도감 %·꾸미기 점수·별점, 빠른 이동 정류장 목록, 마당 격자, 지름길(다리) 찾기.
// DOM·WebGL 없이 테스트한다(tests/islanddev.test.ts).
import { p0Price } from '../../core/api';
import {
  DEV_ISLANDS, STAGE_COST, MOVEIN_REQUESTS, MOVEIN_REQUESTS_P0, INVITE_ITEM, STAR5_DEX, STAGES, DEV_SPECIES,
  YARD_DEFS, YARD_HALF, YARD_CELL, YARD_POND_MAX, YARD_FIREFLY_MAX, YARD_VARIETY_PTS, YARD_DINO_PTS, YARD_FANCY, DECO_FULL,
  RATING_W, RATING_STEPS, isDevIsland, devKey,
  type DevIsland, type StageN, type YardKind, type NodeKind,
} from './data';

// ───────────── 저장(flags.dev) ─────────────
export interface YardPiece {
  /** 놓은 순서 id(같은 섬 안에서 고유) */
  id: number;
  k: YardKind;
  /** 칸 좌표(마당 가운데 = 0,0) */
  cx: number;
  cz: number;
  /** 0..3 (90° 단위) */
  r: number;
  /** 가구 id(k === 'furn') */
  item?: string;
  /** 연못 물고기 id 들 */
  fish?: string[];
  /** 놓아준 반딧불 수 */
  bugs?: number;
}
export interface TravelNode { id: string; x: number; z: number; kind: NodeKind; label: string }
export interface DevFlags {
  v: number;
  /** 섬마다 끝낸 단계(0~5) */
  stage: Record<string, number>;
  /** 한 번만 주는 보상('<섬>:<n>' → 게임 날) */
  rewarded: Record<string, number>;
  /** 섬 주민 부탁을 끝낸 수(④ 조건) */
  req: Record<string, number>;
  /** ④ 이사: 섬 → {npc, done} (moveIn 이 아직 없으면 done:false 로 기다린다) */
  moveIn: Record<string, { npc: string | null; done: boolean }>;
  /** 빠른 이동 정류장(다른 모듈이 addNode 로 넣은 것도) */
  travel: { nodes: TravelNode[] };
  /** 섬마다 마당 조각 */
  yard: Record<string, YardPiece[]>;
  /** 날마다 한 번: 꿀·미끼·바자르 */
  daily: Record<string, number>;
  /** 감정한 화석 id */
  appraised: Record<string, number>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** flags.dev 를 읽고 망가진 곳을 고친다(같은 객체를 고쳐 쓴다 — 저장이 그대로 이어진다) */
export function normalizeFlags(flags: Record<string, unknown>): DevFlags {
  let f = flags.dev as Record<string, unknown> | undefined;
  if (!isObj(f)) { f = {}; flags.dev = f; }
  f.v = 1;
  if (!isObj(f.stage)) f.stage = {};
  const st = f.stage as Record<string, unknown>;
  for (const k of Object.keys(st)) {
    const n = Math.floor(num(st[k]));
    if (!isDevIsland(k) || n <= 0) delete st[k]; else st[k] = Math.min(5, n);
  }
  for (const k of ['rewarded', 'req', 'daily', 'appraised'] as const) if (!isObj(f[k])) f[k] = {};
  if (!isObj(f.moveIn)) f.moveIn = {};
  for (const [k, v] of Object.entries(f.moveIn as Record<string, unknown>)) {
    if (!isObj(v)) { delete (f.moveIn as Record<string, unknown>)[k]; continue; }
    v.npc = typeof v.npc === 'string' ? v.npc : null;
    v.done = !!v.done;
  }
  if (!isObj(f.travel)) f.travel = { nodes: [] };
  const tr = f.travel as Record<string, unknown>;
  if (!Array.isArray(tr.nodes)) tr.nodes = [];
  tr.nodes = (tr.nodes as unknown[]).filter((n): n is TravelNode => isObj(n) && typeof n.id === 'string' && Number.isFinite(n.x) && Number.isFinite(n.z))
    .map((n) => ({ id: n.id, x: n.x, z: n.z, kind: typeof n.kind === 'string' ? n.kind : 'station', label: typeof n.label === 'string' ? n.label : n.id }));
  if (!isObj(f.yard)) f.yard = {};
  for (const [isl, list] of Object.entries(f.yard as Record<string, unknown>)) {
    if (!Array.isArray(list)) { delete (f.yard as Record<string, unknown>)[isl]; continue; }
    (f.yard as Record<string, YardPiece[]>)[isl] = list.filter((p): p is YardPiece => isObj(p) && typeof p.k === 'string' && p.k in YARD_DEFS
      && Number.isFinite(p.cx) && Number.isFinite(p.cz))
      .map((p, i) => ({ ...p, id: Number.isFinite(p.id) ? p.id : i + 1, r: ((Math.floor(num(p.r)) % 4) + 4) % 4 }));
  }
  return f as unknown as DevFlags;
}

export const stageOf = (f: DevFlags, island: string) => Math.max(0, Math.min(5, Math.floor(f.stage[island] ?? 0)));

// ───────────── 단계 조건 ─────────────
export interface ReqLine {
  id: string;
  icon: string;
  label: string;
  have: number;
  need: number;
  ok: boolean;
  /** '또는' 줄(④: 부탁 또는 초대권) — 묶음 중 하나만 맞으면 된다 */
  alt?: string;
}
export interface ReqEnv {
  p0: boolean;
  coins: number;
  /** 가방 수(바탕 id) */
  count(id: string): number;
  /** 이 섬 특산 재료 id 들 */
  specialty: string[];
  /** 섬 도감 % (0..100) */
  dexPct: number;
  /** 지금 별점(1..5) */
  stars: number;
  /** 이 섬 주민 부탁 끝낸 수 */
  reqDone: number;
  /** 물건 이름(표시용) */
  name?(id: string): string;
}
export interface Requirement {
  island: string;
  /** 다음에 할 단계(다 끝났으면 null) */
  n: StageN | null;
  lines: ReqLine[];
  ok: boolean;
  /** 실제로 낼 것(코인·아이템 — 특산 재료는 골라 둔 것) */
  cost: { coins?: number; items?: Record<string, number> };
}

/** 코인 비용(P0 = 1/5) */
export const coinCost = (n: StageN, p0: boolean): number => {
  const c = n <= 3 ? STAGE_COST[n as 1 | 2 | 3].coins : 0;
  return p0 ? p0Price(c) : c;
};
/** ③ 특산 재료 수(P0 = 1/5) */
export const specialtyNeed = (p0: boolean) => (p0 ? p0Price(STAGE_COST[3].specialty) : STAGE_COST[3].specialty);
export const moveInNeed = (p0: boolean) => (p0 ? MOVEIN_REQUESTS_P0 : MOVEIN_REQUESTS);

/** 특산 재료를 싼 것부터 need 개 고른다(모자라면 null) */
export function pickSpecialty(count: (id: string) => number, ids: readonly string[], need: number, price: (id: string) => number = () => 0): Record<string, number> | null {
  const out: Record<string, number> = {};
  let left = need;
  for (const id of [...ids].sort((a, b) => price(a) - price(b) || a.localeCompare(b))) {
    if (left <= 0) break;
    const k = Math.min(left, Math.max(0, Math.floor(count(id))));
    if (k > 0) { out[id] = k; left -= k; }
  }
  return left > 0 ? null : out;
}

/** 다음 단계 조건과 비용 */
export function requirementFor(island: string, done: number, env: ReqEnv, price?: (id: string) => number): Requirement {
  const nx = done + 1;
  if (nx > 5) return { island, n: null, lines: [], ok: false, cost: {} };
  const n = nx as StageN;
  const lines: ReqLine[] = [];
  const cost: Requirement['cost'] = {};
  const nm = (id: string) => env.name?.(id) ?? id;
  if (n <= 3) {
    const c = coinCost(n, env.p0);
    lines.push({ id: 'coins', icon: '🪙', label: '도파코인', have: env.coins, need: c, ok: env.coins >= c });
    cost.coins = c;
    const items: Record<string, number> = {};
    for (const [id, k] of Object.entries(STAGE_COST[n as 1 | 2 | 3].items)) {
      const have = env.count(id);
      lines.push({ id, icon: id === 'it_lighthouse_kit' ? '🗼' : '🌉', label: nm(id), have, need: k, ok: have >= k });
      items[id] = k;
    }
    if (n === 3) {
      const need = specialtyNeed(env.p0);
      const have = env.specialty.reduce((s, id) => s + Math.max(0, env.count(id)), 0);
      lines.push({ id: 'specialty', icon: '🏝️', label: `섬 특산 재료 (${env.specialty.map(nm).join('·') || '—'})`, have, need, ok: have >= need });
      const pick = pickSpecialty(env.count, env.specialty, need, price);
      if (pick) Object.assign(items, pick);
    }
    if (Object.keys(items).length) cost.items = items;
  } else if (n === 4) {
    const need = moveInNeed(env.p0);
    const inv = env.count(INVITE_ITEM);
    const rq = { id: 'requests', icon: '📝', label: '이 섬 주민 부탁 들어주기', have: env.reqDone, need, ok: env.reqDone >= need, alt: 'movein' };
    const iv = { id: INVITE_ITEM, icon: '🎟️', label: '또는 주민 초대권', have: inv, need: 1, ok: inv >= 1, alt: 'movein' };
    lines.push(rq, iv);
    // 부탁을 다 들어줬으면 초대권은 아낀다
    if (!rq.ok && iv.ok) cost.items = { [INVITE_ITEM]: 1 };
  } else {
    lines.push({ id: 'dex', icon: '📖', label: '섬 도감', have: Math.floor(env.dexPct), need: STAR5_DEX, ok: env.dexPct >= STAR5_DEX });
    lines.push({ id: 'stars', icon: '⭐', label: '섬 별점(꾸미기 + 도감)', have: env.stars, need: 5, ok: env.stars >= 5 });
  }
  // '또는' 묶음은 하나만 맞으면 된다
  const groups = new Map<string, boolean>();
  let ok = true;
  for (const l of lines) {
    if (l.alt) groups.set(l.alt, (groups.get(l.alt) ?? false) || l.ok);
    else ok &&= l.ok;
  }
  for (const v of groups.values()) ok &&= v;
  return { island, n, lines, ok, cost };
}

/** 조건 진행(0..1) — 막대 하나로 보일 때 */
export function reqProgress(r: Requirement): number {
  if (!r.n || !r.lines.length) return 1;
  const groups = new Map<string, number>();
  const parts: number[] = [];
  for (const l of r.lines) {
    const p = Math.min(1, l.need > 0 ? l.have / l.need : 1);
    if (l.alt) groups.set(l.alt, Math.max(groups.get(l.alt) ?? 0, p)); else parts.push(p);
  }
  parts.push(...groups.values());
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

// ───────────── 섬 도감 · 꾸미기 · 별점 ─────────────
export interface DexSpecies { id: string; category?: string; p1?: boolean; where?: Array<{ island?: string }> }
/** 섬 도감 %: 그 섬 where 줄이 있는 생물(재료·P1 제외) 중 도감에 있는 비율 */
export function islandDexPct(island: string, species: Iterable<DexSpecies>, has: (id: string) => boolean): { got: number; total: number; pct: number } {
  let got = 0, total = 0;
  for (const s of species) {
    if (s.category === 'item' || s.p1) continue;
    if (!s.where?.some((w) => w.island === island)) continue;
    total++;
    if (has(s.id)) got++;
  }
  return { got, total, pct: total ? (got / total) * 100 : 0 };
}

/** 마당 꾸미기 점수: 조각 점수 + 연못 물고기·반딧불·아기 공룡 + 종류 다양성 */
export function decoScore(pieces: readonly YardPiece[], o: { dinoFriend?: boolean; bonus?: number } = {}): number {
  let s = 0;
  const kinds = new Set<string>();
  for (const p of pieces) {
    const d = YARD_DEFS[p.k];
    if (!d) continue;
    s += d.pts;
    kinds.add(p.k === 'furn' ? `furn:${p.item ?? ''}` : p.k);
    if (p.k === 'furn' && p.item && YARD_FANCY.has(p.item)) s += 2;
    if (p.k === 'pond') s += Math.min(YARD_POND_MAX, p.fish?.length ?? 0);
    if (p.k === 'fireflyspot') s += Math.min(YARD_FIREFLY_MAX, p.bugs ?? 0);
    if (p.k === 'dinofence' && o.dinoFriend) s += YARD_DINO_PTS;
  }
  s += Math.max(0, kinds.size - 1) * YARD_VARIETY_PTS;
  return s + Math.max(0, o.bonus ?? 0);
}
export const decoPct = (score: number) => Math.max(0, Math.min(100, (score / DECO_FULL) * 100));

/** 섬 별점 1~5: 점수 = 도감% × 0.6 + 꾸미기% × 0.4 */
export function islandRating(dexPct: number, deco: number): { score: number; stars: number } {
  const score = Math.max(0, Math.min(100, dexPct)) * RATING_W.dex + decoPct(deco) * RATING_W.deco;
  let stars = 1;
  for (const t of RATING_STEPS) if (score >= t - 1e-9) stars++;
  return { score, stars: Math.min(5, stars) };
}
export const starText = (n: number) => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(5 - Math.max(0, Math.min(5, n)));

// ───────────── 빠른 이동 정류장 ─────────────
/** 정류장 목록(저장 배열을 그대로 고친다 — 같은 id 는 바꿔 끼운다) */
export class TravelNet {
  constructor(private list: TravelNode[]) {}
  add(n: TravelNode): TravelNode {
    const node: TravelNode = { id: String(n.id), x: +(+n.x).toFixed(2), z: +(+n.z).toFixed(2), kind: n.kind || 'station', label: n.label || String(n.id) };
    const i = this.list.findIndex((q) => q.id === node.id);
    if (i >= 0) this.list[i] = node; else this.list.push(node);
    return node;
  }
  remove(id: string) { const i = this.list.findIndex((q) => q.id === id); if (i >= 0) this.list.splice(i, 1); return i >= 0; }
  get(id: string) { return this.list.find((q) => q.id === id) ?? null; }
  has(id: string) { return this.list.some((q) => q.id === id); }
  /** 집이 맨 위, 나머지는 등대 → 부표 → 그 밖, 이름순 */
  all(): TravelNode[] {
    const rank = (k: string) => (k === 'home' ? 0 : k === 'lighthouse' ? 1 : k === 'buoy' ? 2 : 3);
    return [...this.list].sort((a, b) => rank(a.kind) - rank(b.kind) || a.label.localeCompare(b.label, 'ko'));
  }
  /** (x, z) 에서 가장 가까운 정류장 */
  nearest(x: number, z: number, maxD = Infinity): TravelNode | null {
    let best: TravelNode | null = null, bd = maxD;
    for (const q of this.list) { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = q; } }
    return best;
  }
}

// ───────────── 마당 격자(0.5 m) ─────────────
/** 돌린 뒤 차지하는 칸 수 */
export function footprint(k: YardKind, r: number): { w: number; d: number } {
  const d = YARD_DEFS[k];
  return r % 2 ? { w: d.d, d: d.w } : { w: d.w, d: d.d };
}
/** 조각이 차지하는 칸들(cx, cz = 왼쪽 위 칸) */
export function cellsOf(p: { k: YardKind; cx: number; cz: number; r: number }): Array<[number, number]> {
  const f = footprint(p.k, p.r);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < f.w; i++) for (let j = 0; j < f.d; j++) out.push([p.cx + i, p.cz + j]);
  return out;
}
/** 조각 가운데(마당 로컬 m) */
export function pieceCenter(p: { k: YardKind; cx: number; cz: number; r: number }): { x: number; z: number } {
  const f = footprint(p.k, p.r);
  return { x: (p.cx + f.w / 2) * YARD_CELL, z: (p.cz + f.d / 2) * YARD_CELL };
}
/** 마당 로컬 m → 가장 가까운 칸(가운데를 맞춘다) */
export function snapCell(lx: number, lz: number, k: YardKind, r: number): { cx: number; cz: number } {
  const f = footprint(k, r);
  return { cx: Math.round(lx / YARD_CELL - f.w / 2), cz: Math.round(lz / YARD_CELL - f.d / 2) };
}
export function inYard(p: { k: YardKind; cx: number; cz: number; r: number }, half = YARD_HALF): boolean {
  const f = footprint(p.k, p.r);
  return p.cx >= -half && p.cz >= -half && p.cx + f.w <= half && p.cz + f.d <= half;
}
/** 겹치는 조각(없으면 null) */
export function overlapping(pieces: readonly YardPiece[], p: { k: YardKind; cx: number; cz: number; r: number }, ignoreId?: number): YardPiece | null {
  const mine = new Set(cellsOf(p).map(([a, b]) => `${a},${b}`));
  for (const q of pieces) {
    if (q.id === ignoreId) continue;
    for (const [a, b] of cellsOf(q)) if (mine.has(`${a},${b}`)) return q;
  }
  return null;
}
export type PlaceCheck = { ok: true } | { ok: false; why: 'bounds' | 'overlap' | 'ground'; hit?: YardPiece };
/** 놓을 수 있나: 마당 안 + 안 겹침 + (주면) 땅 검사 */
export function canPlace(pieces: readonly YardPiece[], p: { k: YardKind; cx: number; cz: number; r: number }, groundOk?: (cells: Array<[number, number]>) => boolean): PlaceCheck {
  if (!inYard(p)) return { ok: false, why: 'bounds' };
  const hit = overlapping(pieces, p);
  if (hit) return { ok: false, why: 'overlap', hit };
  if (groundOk && !groundOk(cellsOf(p))) return { ok: false, why: 'ground' };
  return { ok: true };
}
/** (x, z) 칸에 있는 조각 */
export function pieceAtCell(pieces: readonly YardPiece[], cx: number, cz: number): YardPiece | null {
  for (const q of pieces) for (const [a, b] of cellsOf(q)) if (a === cx && b === cz) return q;
  return null;
}
export const nextPieceId = (pieces: readonly YardPiece[]) => pieces.reduce((m, p) => Math.max(m, p.id), 0) + 1;

/** 마당 로컬(m) ↔ 월드: 마당 가운데 (ox, oz), 돌림 rot(rotY 문법: 로컬 +z → 월드 (sin, cos)) */
export function yardToWorld(o: { x: number; z: number; rot: number }, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
}
export function worldToYard(o: { x: number; z: number; rot: number }, x: number, z: number): { x: number; z: number } {
  const dx = x - o.x, dz = z - o.z, c = Math.cos(o.rot), s = Math.sin(o.rot);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

// ───────────── 지름길(다리) 찾기 ─────────────
export interface Span {
  /** 양 끝(마른 땅) */
  ax: number; az: number; bx: number; bz: number;
  /** 다리 판 높이(월드 y) */
  y: number;
  kind: 'river' | 'gap' | 'pier';
}
export interface TerrainProbe {
  h(x: number, z: number): number;
  /** 물 높이(없으면 -Infinity) */
  water(x: number, z: number): number;
  /** 이 섬 마른 땅인가 */
  dry(x: number, z: number): boolean;
}
const spanLen = (s: Span) => Math.hypot(s.bx - s.ax, s.bz - s.az);
const spanMid = (s: Span) => ({ x: (s.ax + s.bx) / 2, z: (s.az + s.bz) / 2 });

/** 강 가로지르기: 강 줄 위 frac 자리에서 물길에 수직으로, 양쪽 마른 둑까지 */
export function riverSpan(pts: ReadonlyArray<{ x: number; z: number }>, halfW: number, frac: number, T: TerrainProbe): Span | null {
  if (pts.length < 3) return null;
  const i = Math.max(1, Math.min(pts.length - 2, Math.round(frac * (pts.length - 1))));
  const c = pts[i], a = pts[i - 1], b = pts[i + 1];
  let tx = b.x - a.x, tz = b.z - a.z;
  const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
  const nx = -tz, nz = tx;
  const bank = (sgn: number): { x: number; z: number } | null => {
    for (let d = halfW + 1; d <= halfW + 14; d += 0.5) {
      const x = c.x + nx * d * sgn, z = c.z + nz * d * sgn;
      if (T.dry(x, z) && T.dry(x + nx * sgn * 1.5, z + nz * sgn * 1.5)) return { x: x + nx * sgn * 1.2, z: z + nz * sgn * 1.2 };
    }
    return null;
  };
  const A = bank(-1), B = bank(1);
  if (!A || !B) return null;
  const ha = T.h(A.x, A.z), hb = T.h(B.x, B.z);
  if (Math.abs(ha - hb) > 2.6) return null;
  const s: Span = { ax: A.x, az: A.z, bx: B.x, bz: B.z, y: Math.max(ha, hb) + 0.3, kind: 'river' };
  return spanLen(s) <= 34 ? s : null;
}

/**
 * 골짜기·물웅덩이 지름길: 양 끝이 비슷한 높이의 마른 땅이고, 가운데는 물이거나 양 끝보다 2.5 m 이상 낮은 줄.
 * rng 로 뽑은 후보 중 '빠지는 깊이 × 물 비율'이 큰 것, 서로 minSep 이상 떨어진 것을 고른다.
 */
export function gapSpans(center: { x: number; z: number; r: number }, T: TerrainProbe, rng: () => number, o: { count: number; tries?: number; avoid?: Array<{ x: number; z: number; r: number }>; minSep?: number } ): Span[] {
  const tries = o.tries ?? 520, minSep = o.minSep ?? 80;
  const cands: Array<{ s: Span; score: number }> = [];
  for (let k = 0; k < tries; k++) {
    const rr = Math.sqrt(rng()) * center.r * 0.85, aa = rng() * Math.PI * 2;
    const ax = center.x + Math.cos(aa) * rr, az = center.z + Math.sin(aa) * rr;
    if (!T.dry(ax, az)) continue;
    const dir = rng() * Math.PI * 2, len = 12 + rng() * 22;
    const bx = ax + Math.cos(dir) * len, bz = az + Math.sin(dir) * len;
    if (!T.dry(bx, bz)) continue;
    const ha = T.h(ax, az), hb = T.h(bx, bz);
    if (Math.abs(ha - hb) > 2.0) continue;
    const top = Math.max(ha, hb);
    let wet = 0, low = Infinity, n = 0;
    for (let t = 0.12; t <= 0.88; t += 0.04) {
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const w = T.water(x, z), h = T.h(x, z);
      if (Number.isFinite(w) && w > h) wet++;
      // 다리보다 높이 솟은 곳(언덕)이 있으면 지름길이 아니다
      if (h > top + 0.6) { low = -Infinity; break; }
      low = Math.min(low, h);
      n++;
    }
    if (low === -Infinity || !n) continue;
    const drop = Math.min(ha, hb) - low;
    const wetF = wet / n;
    if (drop < 2.5 && wetF < 0.3) continue;
    const s: Span = { ax, az, bx, bz, y: top + 0.3, kind: 'gap' };
    if (o.avoid?.some((q) => Math.hypot(spanMid(s).x - q.x, spanMid(s).z - q.z) < q.r)) continue;
    // 깊이(최대 8 m)·물·적당한 길이(20 m 근처)를 좋아한다
    const score = Math.min(8, drop) + wetF * 6 - Math.abs(len - 20) * 0.08;
    cands.push({ s, score });
  }
  cands.sort((a, b) => b.score - a.score);
  const out: Span[] = [];
  for (const c of cands) {
    if (out.length >= o.count) break;
    const m = spanMid(c.s);
    if (out.some((q) => Math.hypot(spanMid(q).x - m.x, spanMid(q).z - m.z) < minSep)) continue;
    out.push(c.s);
  }
  return out;
}

/** 부두: 기준점 근처 해안에서 섬 바깥(바다)으로 len m. 땅 끝은 얕은 모래, 바다 끝은 물 */
export function pierSpan(near: { x: number; z: number }, islandC: { x: number; z: number }, T: TerrainProbe, len = 16, avoid: Array<{ x: number; z: number; r: number }> = []): Span | null {
  let best: { x: number; z: number; ox: number; oz: number; d: number } | null = null;
  for (let r = 6; r <= 70; r += 4) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
      const h = T.h(x, z);
      if (!(h > 0.25 && h < 2.2) || !T.dry(x, z)) continue;
      if (avoid.some((q) => Math.hypot(q.x - x, q.z - z) < q.r)) continue;
      let ox = x - islandC.x, oz = z - islandC.z;
      const L = Math.hypot(ox, oz) || 1; ox /= L; oz /= L;
      const wx = x + ox * 7, wz = z + oz * 7;
      if (T.dry(wx, wz) || T.h(wx, wz) > -0.6) continue;
      if (T.h(x + ox * len, z + oz * len) > -1) continue;
      const d = Math.hypot(x - near.x, z - near.z);
      if (!best || d < best.d) best = { x, z, ox, oz, d };
    }
    if (best) break;
  }
  if (!best) return null;
  return { ax: best.x - best.ox * 1.5, az: best.z - best.oz * 1.5, bx: best.x + best.ox * len, bz: best.z + best.oz * len, y: Math.max(1.1, T.h(best.x, best.z) + 0.3), kind: 'pier' };
}

// ───────────── 정리용 ─────────────
/** 단계별 새 생물 표가 맞는 모양인지(섬 7 × 단계 5, 빈 id 없음, 겹침 없음) */
export function devSpeciesProblems(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const isl of DEV_ISLANDS) {
    const row = DEV_SPECIES[isl];
    for (const n of [1, 2, 3, 4, 5] as StageN[]) {
      const id = row?.[n];
      if (!id || !/^[a-z]_[a-z0-9_]+$/.test(id)) out.push(`${isl}:${n} 빈 id`);
      else if (seen.has(id)) out.push(`${id} 겹침`);
      else seen.add(id);
      if (!/^dev:[a-z]+:[1-5]$/.test(devKey(isl, n))) out.push(`${isl}:${n} 키 모양`);
    }
  }
  return out;
}
export const stageName = (n: number) => STAGES[n as StageN]?.name ?? '';
export type { DevIsland, StageN };
