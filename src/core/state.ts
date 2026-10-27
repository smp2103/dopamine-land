// 수집·재화 상태 — 도감(종별 마리 수·최대 크기·변이), 가방, 코인. 브라우저 저장(실패해도 게임은 돈다).
// 계약 v2 3장: 저장 v2(같은 키, v:2, 400ms 묶어 저장 + 페이지 떠날 때 즉시), 옛 id 옮기기, 변이 가방 키, canAdd 가방 훅.
import { splitVariant, variantKey, type Activity, type SpeciesExt, type Variant } from './api';
import type { Part } from './art';

export type Category = string; // 'fish' | 'bug' | 'dino' | 'sea' | 'space' | 'fossil' | 'item' …

/** 모양 정보 — 공용은 parts 만, 나머지는 모듈마다 자기 모양(물고기 shape·colors 등)을 얹는다 */
export interface SpeciesLook { parts?: Part[]; [k: string]: any }

export interface Species extends Omit<SpeciesExt, 'look'> {
  look?: SpeciesLook;
  id: string;
  name: string;
  category: Category;
  /** 1(흔함) ~ 5(전설) */
  rarity: number;
  desc?: string;
  habitat?: string;
  /** 기본 판매가(코인) */
  price?: number;
}

export interface CollectOpts {
  /** 반짝이·왕관·꼬마 */
  variant?: Variant;
  /** 어떻게 잡았나(fish·bug·dive …) */
  activity?: Activity | string;
  /** false = 목격(도감만 적고 가방엔 안 넣는다). 기본 true */
  keep?: boolean;
}
export interface CollectEntry extends CollectOpts { species: Species; size?: number }

/** 도감 한 칸 기록 */
export interface DexRecord {
  count: number;
  best: number;
  first: number;
  /** 변이별 잡은 수 */
  variants?: Partial<Record<Variant, number>>;
}

export type StateEvent = { type: string; [k: string]: unknown };
type Listener = (e: StateEvent) => void;

/** 저장 키(v1 과 같은 키 — 안의 JSON 에 v:2 가 붙는다) */
export const SAVE_KEY = 'dopamine-land-save-v1';
export const SAVE_VERSION = 2;
/** save() 를 이만큼 묶는다(ms) */
export const SAVE_DEBOUNCE_MS = 400;

export interface SaveData {
  v: number;
  coins: number;
  bag: Record<string, number>;
  dex: Record<string, DexRecord>;
  flags: Record<string, unknown>;
}

// ───────────── 옛 저장 옮기기 ─────────────
/** v1 → v2: 옛 아이템 id → 새 재료 id */
export const ID_MIGRATIONS: Readonly<Record<string, string>> = {
  'fruit-apple': 'm_apple', 'fruit-peach': 'm_peach', 'fruit-orange': 'm_orange', 'fruit-pear': 'm_pear', 'fruit-cherry': 'm_cherry',
  'beehive': 'm_honey',
  'star-shard': 'm_stardust',
};

/** 가방 키 하나 옮기기(변이 꼬리는 그대로) */
export function migrateId(key: string): string {
  const { id, variant } = splitVariant(key);
  const to = ID_MIGRATIONS[id];
  return to ? variantKey(to, variant) : key;
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 도감 기록 둘 합치기(옮긴 id 가 이미 있을 때) */
function mergeDex(a: DexRecord | undefined, b: DexRecord): DexRecord {
  if (!a) return b;
  const out: DexRecord = { count: a.count + b.count, best: Math.max(a.best, b.best), first: Math.min(a.first, b.first) };
  if (a.variants || b.variants) {
    const v: Partial<Record<Variant, number>> = { ...a.variants };
    for (const [k, n] of Object.entries(b.variants ?? {}) as Array<[Variant, number]>) v[k] = (v[k] ?? 0) + n;
    out.variants = v;
  }
  return out;
}

/** 아무 모양(v1·v2·깨진 것)의 저장 → 깨끗한 v2. 순수 함수 — 몇 번 돌려도 같다 */
export function migrateSave(raw: unknown): SaveData {
  const d = isObj(raw) ? raw : {};
  const bag: Record<string, number> = {};
  for (const [k, n] of Object.entries(isObj(d.bag) ? d.bag : {})) {
    const c = num(n);
    if (c <= 0) continue;
    const to = migrateId(k);
    bag[to] = (bag[to] ?? 0) + c;
  }
  const dex: Record<string, DexRecord> = {};
  for (const [k, r] of Object.entries(isObj(d.dex) ? d.dex : {})) {
    if (!isObj(r)) continue;
    const rec: DexRecord = { count: num(r.count, 1), best: num(r.best), first: num(r.first, 0) };
    if (isObj(r.variants)) {
      const v: Partial<Record<Variant, number>> = {};
      for (const vk of ['shiny', 'crown', 'tiny'] as const) { const n = num(r.variants[vk]); if (n > 0) v[vk] = n; }
      if (Object.keys(v).length) rec.variants = v;
    }
    const to = migrateId(k);
    dex[to] = mergeDex(dex[to], rec);
  }
  return { v: SAVE_VERSION, coins: Math.max(0, num(d.coins)), bag, dex, flags: isObj(d.flags) ? { ...d.flags } : {} };
}

// ───────────── 상태 ─────────────
export class GameState {
  coins = 0;
  /** 가방: 아이템 id(변이는 `${id}@shiny|crown|tiny`) → 개수 */
  bag: Record<string, number> = {};
  /** 도감: 종 id → 기록 */
  dex: Record<string, DexRecord> = {};
  /** 등록된 모든 종(도감 칸) */
  species = new Map<string, Species>();
  flags: Record<string, unknown> = {};
  /** 가방 규칙 훅 — economy 가 단다. false 면 collect 가 도감만 적고 'bag-full' 을 보낸다 */
  canAdd?: (id: string, n: number) => boolean;
  /** 마지막으로 실제 저장한 시각(performance/Date ms, 디버그용) */
  lastSaved = 0;
  private listeners: Listener[] = [];
  private gdd = new Map<string, Species>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private flushHooked = false;

  /** 이벤트 듣기 — 해제 함수를 돌려준다 */
  on(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => this.off(fn);
  }
  off(fn: Listener) {
    const i = this.listeners.indexOf(fn);
    if (i >= 0) this.listeners.splice(i, 1);
  }
  /** 한 리스너가 터져도 나머지는 받는다. 듣는 중에 해제해도 이번 이벤트 순서는 그대로 */
  emit(e: StateEvent) {
    for (const l of this.listeners.slice()) {
      try { l(e); } catch (err) { console.error(`[state ${e.type}]`, err); }
    }
  }

  /** 모듈이 자기 종 목록을 등록한다(도감 전체 칸 수가 여기서 정해진다) */
  register(list: Species[]) {
    for (const s of list) this.addSpecies(s);
    this.emit({ type: 'register' });
  }
  private addSpecies(s: Species) {
    this.species.set(s.id, s);
    if (s.gdd && s.gdd !== s.id) this.gdd.set(s.gdd, s);
  }

  /** GDD 표 id 또는 실제 id → 종(기존 id 를 안 바꾼 종은 gdd 로 찾는다) */
  byGdd(id: string): Species | undefined {
    return this.species.get(id) ?? this.gdd.get(id);
  }

  /**
   * 잡았다/주웠다: 도감 기록 + 가방에 넣기. 처음이면 true.
   * collect({species, size, variant, activity, keep}) 또는 collect(species, size, {variant, activity, keep}).
   * keep:false 면 도감만(목격). canAdd 가 false 면 도감은 적고 가방은 그대로 + 'bag-full'.
   */
  collect(e: CollectEntry): boolean;
  collect(species: Species, size?: number, o?: CollectOpts): boolean;
  collect(a: CollectEntry | Species, size?: number, o?: CollectOpts): boolean {
    const e: CollectEntry = isEntry(a) ? a : { species: a, size, ...o };
    const sp = e.species;
    const id = sp.id;
    if (!this.species.has(id)) this.addSpecies(sp);
    const sz = typeof e.size === 'number' && Number.isFinite(e.size) ? e.size : undefined;
    const rec = this.dex[id];
    const isNew = !rec;
    const next: DexRecord = { count: (rec?.count ?? 0) + 1, best: Math.max(rec?.best ?? 0, sz ?? 0), first: rec?.first ?? Date.now() };
    const variants = rec?.variants ? { ...rec.variants } : undefined;
    if (e.variant) { const v = variants ?? {}; v[e.variant] = (v[e.variant] ?? 0) + 1; next.variants = v; }
    else if (variants) next.variants = variants;
    this.dex[id] = next;
    let full = false;
    if (e.keep !== false) {
      const key = variantKey(id, e.variant);
      if (this.allowAdd(key, 1)) this.bag[key] = (this.bag[key] ?? 0) + 1;
      else full = true;
    }
    this.emit({ type: 'collect', species: sp, size: sz, isNew, variant: e.variant, activity: e.activity, rarity: sp.rarity, kept: e.keep !== false && !full });
    if (full) this.emit({ type: 'bag-full', id: variantKey(id, e.variant) });
    this.save();
    return isNew;
  }
  private allowAdd(id: string, n: number) {
    if (!this.canAdd) return true;
    try { return this.canAdd(id, n) !== false; } catch (err) { console.error('[state canAdd]', err); return true; }
  }

  addCoins(n: number, why = '') { this.coins = Math.max(0, this.coins + n); this.emit({ type: 'coins', delta: n, why }); this.save(); }
  /** 가방 직접 넣고 빼기(규칙 없음 — 규칙은 econ.give) */
  addItem(id: string, n = 1) { this.bag[id] = (this.bag[id] ?? 0) + n; if (this.bag[id] <= 0) delete this.bag[id]; this.emit({ type: 'bag', id, delta: n }); this.save(); }
  /** 기본 id 만 센다('f_carp@crown' 은 'f_carp' 로 치지 않는다 — 변이 키로 따로 물어본다) */
  has(id: string, n = 1) { return (this.bag[id] ?? 0) >= n; }

  dexCount(category?: Category) {
    let got = 0, total = 0;
    for (const s of this.species.values()) {
      if (category && s.category !== category) continue;
      total++;
      if (this.dex[s.id]) got++;
    }
    return { got, total };
  }

  /** 저장할 모양 */
  snapshot(): SaveData {
    return { v: SAVE_VERSION, coins: this.coins, bag: this.bag, dex: this.dex, flags: this.flags };
  }

  /** 저장 예약 — 400ms 안의 호출은 하나로 묶인다. 마음껏 불러도 된다 */
  save() {
    this.hookFlush();
    if (this.saveTimer !== null) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.write(); }, SAVE_DEBOUNCE_MS);
  }
  /** 지금 바로 저장(테스트·페이지 떠날 때·디버그) */
  saveNow() {
    if (this.saveTimer !== null) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.write();
  }
  /** 예약된 저장이 있으면 지금 쓴다 */
  flush() { if (this.saveTimer !== null) this.saveNow(); }
  /** 예약된 저장이 남았나 */
  get savePending() { return this.saveTimer !== null; }

  private write() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.snapshot()));
      this.lastSaved = Date.now();
    } catch { /* 저장 불가 환경(사생활 모드·용량 초과) — 게임은 계속 */ }
  }

  /** 페이지를 떠나거나 숨길 때 묶인 저장을 바로 쓴다 */
  private hookFlush() {
    if (this.flushHooked || typeof addEventListener !== 'function') return;
    this.flushHooked = true;
    addEventListener('pagehide', this.onLeave);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVis);
  }
  private onLeave = () => this.flush();
  private onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') this.flush(); };

  /** 저장 불러오기(+ 옛 id 옮기기). ?fresh=1 이면 무시 */
  load() {
    try {
      if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('fresh') === '1') return;
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const d = migrateSave(parsed);
      this.coins = d.coins; this.bag = d.bag; this.dex = d.dex; this.flags = d.flags;
      // v1 이었으면 새 모양으로 한 번 써 둔다
      if (!isObj(parsed) || parsed.v !== SAVE_VERSION) this.save();
    } catch { /* 깨진 저장 — 새로 시작 */ }
  }
}

const isEntry = (a: CollectEntry | Species): a is CollectEntry => !!(a as CollectEntry).species && typeof (a as CollectEntry).species === 'object';
