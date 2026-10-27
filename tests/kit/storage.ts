// 테스트 키트 — 브라우저 저장소 대역(localStorage · location · window 이벤트 · IndexedDB 라이트).
// node 환경(vitest)에서 GameState 저장·불러오기, 사진 앨범(IndexedDB) 같은 걸 화면 없이 돌리려고 쓴다.
// 모두 globalThis 에 끼우고, 되돌리는 restore() 를 돌려준다.

type G = Record<string, unknown>;
const g = globalThis as unknown as G;

/** globalThis[key] 를 바꿔 끼우고, 원래 값으로 되돌리는 함수를 돌려준다 */
function swap(key: string, value: unknown): () => void {
  const had = Object.prototype.hasOwnProperty.call(g, key);
  const prev = Object.getOwnPropertyDescriptor(g, key);
  Object.defineProperty(g, key, { value, configurable: true, writable: true, enumerable: true });
  return () => {
    if (had && prev) Object.defineProperty(g, key, prev);
    else delete g[key];
  };
}

// ───────────── localStorage ─────────────
export interface StubStorage extends Storage {
  /** 속을 그대로 들여다보는 Map */
  readonly map: Map<string, string>;
  /** 원래 globalThis.localStorage 로 되돌리기 */
  restore(): void;
}

/** Map 으로 된 Storage 를 만든다(globalThis 에는 안 끼운다) */
export function makeStorage(init?: Record<string, string>): Omit<StubStorage, 'restore'> {
  const map = new Map<string, string>(init ? Object.entries(init) : []);
  const s = {
    map,
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(String(k)) ? map.get(String(k))! : null),
    setItem: (k: string, v: string) => { map.set(String(k), String(v)); },
    removeItem: (k: string) => { map.delete(String(k)); },
    clear: () => { map.clear(); },
  };
  return s as unknown as Omit<StubStorage, 'restore'>;
}

/** 저장소를 갈아 끼우기 직전에 부를 것들(fakeGame 의 resetKit 이 여기 붙는다 — 순환 import 없이) */
const swapHooks: Array<() => void> = [];
export function onStorageSwap(fn: () => void) { if (!swapHooks.includes(fn)) swapHooks.push(fn); }

/**
 * globalThis.localStorage 를 새 Map 저장소로 바꾼다. 같은 테스트 파일 안에서 다시 부르면 새 빈 저장소.
 * 바꾸기 전에 살아 있는 가짜 게임을 전부 dispose 한다(묶인 저장이 새 저장소를 덮지 않게).
 */
export function stubLocalStorage(init?: Record<string, string>): StubStorage {
  for (const fn of swapHooks) fn();
  const s = makeStorage(init) as StubStorage;
  const restore = swap('localStorage', s);
  Object.defineProperty(s, 'restore', { value: restore, enumerable: false });
  return s;
}

// ───────────── location ─────────────
export interface StubLocation {
  search: string;
  href: string;
  pathname: string;
  hash: string;
  origin: string;
  host: string;
  hostname: string;
  protocol: string;
  reload(): void;
  restore(): void;
}

/** globalThis.location 을 바꾼다. search 는 '?p0=0&fresh=1' 처럼(앞의 ? 는 있어도 없어도) */
export function stubLocation(search = ''): StubLocation {
  const q = search && !search.startsWith('?') ? `?${search}` : search;
  const origin = 'http://127.0.0.1:5180';
  const loc = {
    search: q, pathname: '/', hash: '', origin, host: '127.0.0.1:5180', hostname: '127.0.0.1', protocol: 'http:',
    get href() { return `${origin}/${this.search}${this.hash}`; },
    reload() { /* 새로고침 없음 */ },
  } as StubLocation;
  const restore = swap('location', loc);
  Object.defineProperty(loc, 'restore', { value: restore, enumerable: false });
  return loc;
}

// ───────────── window 이벤트(pagehide · visibilitychange) ─────────────
export interface StubWindow {
  target: EventTarget;
  /** 'pagehide' · 'visibilitychange' 같은 걸 쏜다 */
  fire(type: string): void;
  /** document.visibilityState 를 바꾸고 visibilitychange 를 쏜다 */
  setHidden(hidden: boolean): void;
  restore(): void;
}

/**
 * globalThis.addEventListener/removeEventListener/dispatchEvent 와 최소 document(visibilityState)를 끼운다.
 * 저장 디바운스가 pagehide·visibilitychange 에 매달리는 걸 node 에서 확인하려고.
 * 이미 있으면(jsdom 등) 건드리지 않고 그것을 쓴다.
 * 가짜 document 는 { document: true } 일 때만 깐다 — `typeof document` 로 DOM 을 가늠하는 모듈이 createElement 없이 넘어지지 않게.
 */
export function stubWindowEvents(o: { document?: boolean } = {}): StubWindow {
  const undo: Array<() => void> = [];
  let target: EventTarget;
  if (typeof g.addEventListener === 'function' && typeof g.dispatchEvent === 'function') {
    target = globalThis as unknown as EventTarget;
  } else {
    target = new EventTarget();
    undo.push(swap('addEventListener', target.addEventListener.bind(target)));
    undo.push(swap('removeEventListener', target.removeEventListener.bind(target)));
    undo.push(swap('dispatchEvent', target.dispatchEvent.bind(target)));
  }
  let docTarget: EventTarget | null = null;
  const doc = g.document as { visibilityState?: string; addEventListener?: unknown } | undefined;
  if (!doc && o.document) {
    docTarget = new EventTarget();
    const fake = {
      visibilityState: 'visible' as string,
      get hidden() { return this.visibilityState === 'hidden'; },
      addEventListener: docTarget.addEventListener.bind(docTarget),
      removeEventListener: docTarget.removeEventListener.bind(docTarget),
      dispatchEvent: docTarget.dispatchEvent.bind(docTarget),
    };
    undo.push(swap('document', fake));
  }
  const fire = (type: string) => {
    target.dispatchEvent(new Event(type));
    // visibilitychange 는 document 에서 나는 게 원래 자리 — 양쪽 다 쏜다
    if (type === 'visibilitychange') (docTarget ?? (g.document as EventTarget | undefined))?.dispatchEvent?.(new Event(type));
  };
  return {
    target,
    fire,
    setHidden(hidden) {
      const d = g.document as { visibilityState?: string } | undefined;
      if (d) { try { d.visibilityState = hidden ? 'hidden' : 'visible'; } catch { /* 읽기 전용(jsdom) */ } }
      fire('visibilitychange');
    },
    restore() { for (const u of undo.reverse()) u(); },
  };
}

/** 없을 때만 저장소·주소·창 이벤트를 깐다(fakeGame 이 부른다). 이미 있으면 그대로 */
export function ensureBrowserStubs(search?: string) {
  if (typeof g.localStorage === 'undefined') stubLocalStorage();
  if (search !== undefined || typeof g.location === 'undefined') stubLocation(search ?? '');
  if (typeof g.addEventListener !== 'function') stubWindowEvents();
}

// ───────────── IndexedDB 라이트 ─────────────
// 사진 앨범(IndexedDB 'dopamine-land-photos') 테스트용. 진짜 IDB 의 콜백 모양(onsuccess/onerror/onupgradeneeded,
// transaction.oncomplete)만 흉내 낸다. 인덱스·커서·키 범위는 없다 — getAll/getAllKeys/count 로 충분하게.
// 결과는 다음 매크로태스크(setTimeout 0)에 알린다 → 요청을 만든 뒤 핸들러를 붙여도 된다(진짜 IDB 와 같게).

type Key = string | number;
type Handler = ((this: unknown, ev: { target: unknown; type: string }) => void) | null;

const later = (fn: () => void) => setTimeout(fn, 0);
const clone = <T>(v: T): T => { try { return structuredClone(v); } catch { return v; } };

class LiteEvents {
  private ls = new Map<string, Array<(ev: unknown) => void>>();
  addEventListener(type: string, fn: (ev: unknown) => void) { (this.ls.get(type) ?? this.ls.set(type, []).get(type)!).push(fn); }
  removeEventListener(type: string, fn: (ev: unknown) => void) { const a = this.ls.get(type); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  protected emit(type: string, extra?: Record<string, unknown>) {
    const ev = { type, target: this, currentTarget: this, ...extra };
    const on = (this as unknown as Record<string, Handler>)[`on${type}`];
    try { on?.call(this, ev); } catch (e) { console.error(`[idb-lite on${type}]`, e); }
    for (const fn of [...(this.ls.get(type) ?? [])]) { try { fn(ev); } catch (e) { console.error(`[idb-lite ${type}]`, e); } }
  }
}

export class LiteRequest<T = unknown> extends LiteEvents {
  result: T | undefined = undefined;
  error: Error | null = null;
  readyState: 'pending' | 'done' = 'pending';
  onsuccess: Handler = null;
  onerror: Handler = null;
  constructor(public source: unknown = null, public transaction: LiteTransaction | null = null) { super(); }
  /** @internal */ _ok(v: T) { this.result = v; this.readyState = 'done'; this.emit('success'); }
  /** @internal */ _fail(e: Error) { this.error = e; this.readyState = 'done'; this.emit('error'); }
}

export class LiteOpenRequest extends LiteRequest<LiteDB> {
  onupgradeneeded: Handler = null;
  onblocked: Handler = null;
  /** @internal */ _upgrade(oldVersion: number, newVersion: number) { this.emit('upgradeneeded', { oldVersion, newVersion }); }
}

interface StoreData { keyPath: string | null; autoIncrement: boolean; next: number; rows: Map<Key, unknown> }
interface DBData { version: number; stores: Map<string, StoreData> }

const cmpKey = (a: Key, b: Key) => (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === 'number' ? -1 : 1);
const sortedKeys = (m: Map<Key, unknown>) => [...m.keys()].sort(cmpKey);

export class LiteStore {
  constructor(public name: string, private data: StoreData, private tx: LiteTransaction) {}
  get keyPath() { return this.data.keyPath; }
  get autoIncrement() { return this.data.autoIncrement; }

  private req<T>(work: () => T): LiteRequest<T> {
    const r = new LiteRequest<T>(this, this.tx);
    this.tx._track(r, () => work());
    return r;
  }
  private keyOf(value: unknown, key?: Key): Key {
    if (this.data.keyPath) {
      const v = (value as Record<string, unknown> | null)?.[this.data.keyPath];
      if (v !== undefined) return v as Key;
      if (!this.data.autoIncrement) throw new Error('DataError: keyPath 값이 없어요');
      const k = this.data.next++;
      (value as Record<string, unknown>)[this.data.keyPath] = k;
      return k;
    }
    if (key !== undefined) { if (typeof key === 'number' && key >= this.data.next) this.data.next = Math.floor(key) + 1; return key; }
    if (this.data.autoIncrement) return this.data.next++;
    throw new Error('DataError: 키가 없어요');
  }
  private writable() { if (this.tx.mode === 'readonly') throw new Error('ReadOnlyError: readonly 트랜잭션이에요'); }

  put(value: unknown, key?: Key) { return this.req(() => { this.writable(); const v = clone(value); const k = this.keyOf(v, key); this.data.rows.set(k, v); return k; }); }
  add(value: unknown, key?: Key) {
    return this.req(() => {
      this.writable();
      const v = clone(value); const k = this.keyOf(v, key);
      if (this.data.rows.has(k)) throw new Error('ConstraintError: 이미 있는 키예요');
      this.data.rows.set(k, v); return k;
    });
  }
  get(key: Key) { return this.req(() => clone(this.data.rows.get(key))); }
  getAll() { return this.req(() => sortedKeys(this.data.rows).map((k) => clone(this.data.rows.get(k)))); }
  getAllKeys() { return this.req(() => sortedKeys(this.data.rows)); }
  count() { return this.req(() => this.data.rows.size); }
  delete(key: Key) { return this.req(() => { this.writable(); this.data.rows.delete(key); return undefined; }); }
  clear() { return this.req(() => { this.writable(); this.data.rows.clear(); return undefined; }); }
}

export class LiteTransaction extends LiteEvents {
  oncomplete: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  error: Error | null = null;
  private pending = 0;
  private finished = false;
  private aborted = false;
  constructor(public db: LiteDB, private names: string[], public mode: 'readonly' | 'readwrite' | 'versionchange') {
    super();
    // 요청이 하나도 없어도 끝은 난다
    later(() => this.maybeDone());
  }
  get objectStoreNames() { return this.names; }
  objectStore(name: string): LiteStore {
    // versionchange(업그레이드) 트랜잭션은 그 사이 새로 만든 저장소도 다 볼 수 있다
    if (this.mode !== 'versionchange' && !this.names.includes(name)) throw new Error(`NotFoundError: 트랜잭션에 '${name}' 저장소가 없어요`);
    const d = this.db._data.stores.get(name);
    if (!d) throw new Error(`NotFoundError: '${name}' 저장소가 없어요`);
    return new LiteStore(name, d, this);
  }
  abort() { if (this.finished) return; this.aborted = true; this.finished = true; later(() => this.emit('abort')); }
  /** @internal 요청 하나를 등록하고 다음 틱에 돌린다 */
  _track<T>(r: LiteRequest<T>, work: () => T) {
    if (this.finished) throw new Error('TransactionInactiveError: 이미 끝난 트랜잭션이에요');
    this.pending++;
    later(() => {
      if (this.aborted) { this.pending--; return; }
      try { r._ok(work()); }
      catch (e) { const err = e instanceof Error ? e : new Error(String(e)); this.error = err; r._fail(err); this.emit('error'); }
      this.pending--;
      later(() => this.maybeDone());
    });
  }
  private maybeDone() {
    if (this.finished || this.pending > 0) return;
    this.finished = true;
    this.emit('complete');
  }
}

export class LiteDB {
  onversionchange: Handler = null;
  onclose: Handler = null;
  closed = false;
  constructor(public name: string, /** @internal */ public _data: DBData) {}
  get version() { return this._data.version; }
  get objectStoreNames() {
    const names = [...this._data.stores.keys()];
    return Object.assign(names, { contains: (n: string) => this._data.stores.has(n), item: (i: number) => names[i] ?? null });
  }
  createObjectStore(name: string, o?: { keyPath?: string | null; autoIncrement?: boolean }) {
    if (this._data.stores.has(name)) throw new Error(`ConstraintError: '${name}' 저장소가 이미 있어요`);
    const d: StoreData = { keyPath: o?.keyPath ?? null, autoIncrement: !!o?.autoIncrement, next: 1, rows: new Map() };
    this._data.stores.set(name, d);
    return new LiteStore(name, d, new LiteTransaction(this, [name], 'versionchange'));
  }
  deleteObjectStore(name: string) { this._data.stores.delete(name); }
  transaction(names: string | string[], mode: 'readonly' | 'readwrite' = 'readonly') {
    if (this.closed) throw new Error('InvalidStateError: 닫힌 DB 예요');
    const list = Array.isArray(names) ? names : [names];
    for (const n of list) if (!this._data.stores.has(n)) throw new Error(`NotFoundError: '${n}' 저장소가 없어요`);
    return new LiteTransaction(this, list, mode);
  }
  close() { this.closed = true; }
}

export interface StubIDB {
  /** globalThis.indexedDB 에 끼운 공장 */
  factory: { open(name: string, version?: number): LiteOpenRequest; deleteDatabase(name: string): LiteRequest<undefined>; databases(): Promise<Array<{ name: string; version: number }>> };
  /** 이름 → DB 내용(직접 들여다보기) */
  dbs: Map<string, DBData>;
  /** 저장소 안 값 목록(테스트 확인용) */
  rows(db: string, store: string): unknown[];
  /** 다 비우기 */
  reset(): void;
  restore(): void;
}

/** Map 으로 된 IndexedDB 라이트를 globalThis.indexedDB 에 끼운다 */
export function stubIndexedDB(): StubIDB {
  const dbs = new Map<string, DBData>();
  const factory: StubIDB['factory'] = {
    open(name, version) {
      const req = new LiteOpenRequest(null, null);
      later(() => {
        let d = dbs.get(name);
        const old = d?.version ?? 0;
        const want = version ?? (old || 1);
        if (want < old) { req._fail(new Error(`VersionError: 요청 버전 ${want} < 지금 ${old}`)); return; }
        if (!d) { d = { version: 0, stores: new Map() }; dbs.set(name, d); }
        const db = new LiteDB(name, d);
        req.result = db;
        if (want > old) {
          d.version = want;
          req.transaction = new LiteTransaction(db, [...d.stores.keys()], 'versionchange');
          try { req._upgrade(old, want); } catch (e) { req._fail(e instanceof Error ? e : new Error(String(e))); return; }
          req.transaction = null;
        }
        req._ok(db);
      });
      return req;
    },
    deleteDatabase(name) {
      const req = new LiteRequest<undefined>(null, null);
      later(() => { dbs.delete(name); req._ok(undefined); });
      return req;
    },
    databases: async () => [...dbs].map(([name, d]) => ({ name, version: d.version })),
  };
  const restore = swap('indexedDB', factory);
  return {
    factory,
    dbs,
    rows: (db, store) => { const s = dbs.get(db)?.stores.get(store); return s ? sortedKeys(s.rows).map((k) => s.rows.get(k)) : []; },
    reset: () => dbs.clear(),
    restore,
  };
}

/** IDB 요청 하나를 프라미스로(테스트에서 await 하기 좋게) */
export function idbDone<T = unknown>(req: unknown): Promise<T> {
  // 진짜 IDBRequest 든 LiteRequest 든 onsuccess/onerror 모양만 본다
  const r = req as { onsuccess: unknown; onerror: unknown; result?: T; error?: unknown };
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result as T);
    r.onerror = () => rej(r.error);
  });
}
