// 사진 앨범 저장소 — IndexedDB 'dopamine-land-photos'(계약 v2 0·7장: 큰 그림은 flags 가 아니라 여기).
// 저장소 'photos'(keyPath 'id'): { id, at, blob(PNG), thumb(작은 JPEG data URL) }. 넣을 때마다 최근 ALBUM_KEEP 장만 남긴다.
// IndexedDB 가 없거나(사생활 보호 창 등) 열리지 않으면 메모리 앨범으로 조용히 넘어간다(그 세션 동안만).
import { ALBUM_KEEP, trimPlan } from './logic';

export const DB_NAME = 'dopamine-land-photos';
export const DB_VERSION = 1;
export const STORE = 'photos';

export interface PhotoRecord {
  id: number;
  at: number;
  /** PNG 원본 */
  blob: Blob | null;
  /** 앨범 칸에 보일 작은 그림(data URL) */
  thumb: string;
}

interface IdbReq<T> { result: T; error: unknown; onsuccess: ((ev: unknown) => void) | null; onerror: ((ev: unknown) => void) | null }
interface IdbStore {
  put(v: unknown): IdbReq<unknown>;
  get(k: number): IdbReq<unknown>;
  getAll(): IdbReq<unknown[]>;
  getAllKeys(): IdbReq<unknown[]>;
  delete(k: number): IdbReq<unknown>;
}
interface IdbTx { objectStore(n: string): IdbStore; oncomplete: ((ev: unknown) => void) | null; onerror: ((ev: unknown) => void) | null; onabort: ((ev: unknown) => void) | null; error?: unknown }
interface IdbDb { transaction(n: string | string[], mode?: 'readonly' | 'readwrite'): IdbTx; objectStoreNames: { contains(n: string): boolean }; createObjectStore(n: string, o?: { keyPath?: string }): unknown; close(): void }
interface IdbOpen extends IdbReq<IdbDb> { onupgradeneeded: ((ev: unknown) => void) | null; onblocked: ((ev: unknown) => void) | null }
interface IdbFactory { open(name: string, version?: number): IdbOpen }

const req = <T>(r: IdbReq<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = (t: IdbTx): Promise<void> => new Promise((res, rej) => {
  t.oncomplete = () => res();
  t.onerror = () => rej(t.error);
  t.onabort = () => rej(t.error ?? new Error('abort'));
});

/** 앨범: 넣기·목록·하나·지우기. 모두 비동기 */
export interface Album {
  /** 넣고 줄인다 → 지운 id 목록 */
  put(rec: PhotoRecord): Promise<number[]>;
  list(): Promise<PhotoRecord[]>;
  get(id: number): Promise<PhotoRecord | null>;
  remove(id: number): Promise<void>;
  /** 최근 keep 장만 남긴다 → 지운 id */
  trim(keep?: number): Promise<number[]>;
  /** 'idb' | 'memory' */
  readonly kind: 'idb' | 'memory';
}

/** 메모리 앨범(IndexedDB 가 없을 때) */
export function memoryAlbum(keep = ALBUM_KEEP): Album {
  const rows = new Map<number, PhotoRecord>();
  const trim = async (k = keep) => {
    const plan = trimPlan([...rows.keys()], k);
    for (const id of plan.drop) rows.delete(id);
    return plan.drop;
  };
  return {
    kind: 'memory',
    put: async (rec) => { rows.set(rec.id, rec); return trim(); },
    list: async () => [...rows.values()].sort((a, b) => a.id - b.id),
    get: async (id) => rows.get(id) ?? null,
    remove: async (id) => { rows.delete(id); },
    trim,
  };
}

/** IndexedDB 열기(저장소가 없으면 만든다) */
function openDb(f: IdbFactory): Promise<IdbDb> {
  return new Promise((res, rej) => {
    let r: IdbOpen;
    try { r = f.open(DB_NAME, DB_VERSION); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
}

/** IndexedDB 앨범. factory 를 안 주면 globalThis.indexedDB. 열리지 않으면 메모리 앨범을 돌려준다 */
export async function openAlbum(factory?: unknown, keep = ALBUM_KEEP): Promise<Album> {
  const f = (factory ?? (globalThis as { indexedDB?: unknown }).indexedDB) as IdbFactory | undefined;
  if (!f || typeof f.open !== 'function') return memoryAlbum(keep);
  let db: IdbDb;
  try { db = await openDb(f); } catch (e) { console.warn('[photo] IndexedDB 를 못 열어서 이번엔 메모리에만 둘게요', e); return memoryAlbum(keep); }

  const keys = async (): Promise<number[]> => {
    const t = db.transaction(STORE, 'readonly');
    const ks = await req(t.objectStore(STORE).getAllKeys());
    return ks.filter((k): k is number => typeof k === 'number');
  };
  const trim = async (k = keep): Promise<number[]> => {
    const plan = trimPlan(await keys(), k);
    if (!plan.drop.length) return [];
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    for (const id of plan.drop) s.delete(id);
    await txDone(t);
    return plan.drop;
  };
  return {
    kind: 'idb',
    async put(rec) {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(rec);
      await txDone(t);
      return trim();
    },
    async list() {
      const t = db.transaction(STORE, 'readonly');
      const rows = (await req(t.objectStore(STORE).getAll())) as PhotoRecord[];
      return rows.filter((r) => r && typeof r.id === 'number').sort((a, b) => a.id - b.id);
    },
    async get(id) {
      const t = db.transaction(STORE, 'readonly');
      return ((await req(t.objectStore(STORE).get(id))) as PhotoRecord | undefined) ?? null;
    },
    async remove(id) {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).delete(id);
      await txDone(t);
    },
    trim,
  };
}
