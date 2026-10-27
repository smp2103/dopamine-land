// 종 모델 썸네일 — 엔진의 렌더러 하나로(새 WebGL 컨텍스트 없이) 128px 렌더 타깃에 그리고 64px 로 줄여 data URL 로 캐시한다.
// 한 프레임에 하나만(ThumbQueue). 잡았다 연출의 실제 모델을 복제해 그리면 'model', 아직 못 봤으면 분류별 코드 모델 'generic'.
// 실제 모델 썸네일은 IndexedDB('dopamine-land-thumbs')에 남겨 다음 접속에도 쓴다(flags 엔 안 넣는다).
// 화질 '낮음'이면 아예 안 그리고 이모지로 둔다.
import * as THREE from 'three';
import type { Engine } from '../../core/engine';
import type { Species } from '../../core/state';
import { curveUniforms } from '../../core/curve';
import { ThumbQueue, srgbLut, type ThumbSrc } from './logic';
import { buildGeneric } from './models';

export type ThumbJob = { obj: THREE.Object3D } | { species: Species };

const RT = 128, OUT = 64;
/** 저장 판 — 모델 모양이 크게 바뀌면 올린다 */
const THUMB_VER = 1;
const DB = 'dopamine-land-thumbs', STORE = 'thumbs';

export class Thumbs {
  readonly q = new ThumbQueue<ThumbJob>();
  private rt: THREE.WebGLRenderTarget | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  private buf = new Uint8Array(RT * RT * 4);
  private big: HTMLCanvasElement | null = null;
  private small: HTMLCanvasElement | null = null;
  private lut = srgbLut();
  private db: Promise<IDBDatabase | null> | null = null;
  private listeners: Array<(ids: string[]) => void> = [];
  private box = new THREE.Box3();
  private sphere = new THREE.Sphere();
  private tmpColor = new THREE.Color();
  private dir = new THREE.Vector3(0.62, 0.42, 1).normalize();

  constructor(private engine: Engine) {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xffe2c8, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(1.5, 3, 2.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xc9e8ff, 0.8);
    rim.position.set(-2, 1, -1.5);
    this.scene.add(rim);
    this.loadStored();
  }

  /** 지금 그릴 수 있나(화질 낮음 · 렌더러 없음이면 이모지) */
  enabled(): boolean { return this.engine.quality !== 'low' && !!this.engine.renderer; }
  /** 캐시된 썸네일(없으면 null) */
  get(id: string): string | null { return this.enabled() ? this.q.get(id) ?? null : null; }
  /** 기본 모양 썸네일을 줄 세운다(이미 있으면 아무것도 안 한다) */
  want(id: string, species: Species | undefined) {
    if (!species || !this.enabled()) return;
    this.q.request(id, { species }, 'generic');
  }
  /** 잡았다 연출의 실제 모델을 복제해 줄 맨 앞에 — 기본 모양을 덮어쓴다 */
  capture(id: string, model: THREE.Object3D | undefined | null) {
    if (!model || !this.enabled() || this.q.srcOf(id) === 'model') return;
    let clone: THREE.Object3D;
    try { clone = model.clone(true); } catch { return; }
    // 연출용 덧붙이(왕관·이름표 등)는 빼고 기본 모습만
    const drop: THREE.Object3D[] = [];
    clone.traverse((o) => { if (o !== clone && (o.name === 'crown' || o.userData?.hudSkip)) drop.push(o); });
    for (const o of drop) o.parent?.remove(o);
    clone.position.set(0, 0, 0);
    clone.quaternion.identity();
    this.q.request(id, { obj: clone }, 'model');
  }
  onReady(fn: (ids: string[]) => void) { this.listeners.push(fn); }
  pending() { return this.q.pending(); }

  /** 매 프레임 — 하나만 그린다 */
  pump(): string[] {
    if (!this.q.pending()) return [];
    if (!this.enabled()) { this.q.drain(); return []; }
    const done = this.q.pump((id, job, src) => this.render(id, job, src), 1);
    if (done.length) for (const fn of this.listeners) { try { fn(done); } catch (e) { console.error('[hud] thumbs', e); } }
    return done;
  }

  private render(id: string, job: ThumbJob, src: ThumbSrc): string | null {
    const r = this.engine.renderer;
    const obj = 'obj' in job ? job.obj : buildGeneric(job.species);
    this.rt ??= new THREE.WebGLRenderTarget(RT, RT, { depthBuffer: true });
    // 틀 맞추기: 경계 구 기준 정사영
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    this.box.setFromObject(obj, true);
    if (this.box.isEmpty()) { this.scene.remove(obj); return null; }
    this.box.getBoundingSphere(this.sphere);
    const rad = Math.max(1e-3, this.sphere.radius) * 0.92;
    const c = this.sphere.center;
    this.cam.left = -rad; this.cam.right = rad; this.cam.top = rad; this.cam.bottom = -rad;
    this.cam.near = rad * 0.05; this.cam.far = rad * 12;
    this.cam.position.copy(c).addScaledVector(this.dir, rad * 5);
    this.cam.lookAt(c);
    this.cam.updateProjectionMatrix();
    this.scene.environment = this.engine.scene.environment;
    this.scene.environmentIntensity = Math.min(1, this.engine.scene.environmentIntensity ?? 1);

    // 렌더러 상태 저장 → 그리기 → 되돌리기(곡률은 끈다 · 통계는 벤치에 안 섞이게)
    const prevRT = r.getRenderTarget();
    const prevClear = r.getClearColor(this.tmpColor).getHex();
    const prevAlpha = r.getClearAlpha();
    const prevK = curveUniforms.uCurveK.value;
    const info = r.info.render;
    const calls = info.calls, tris = info.triangles;
    let url: string | null = null;
    try {
      curveUniforms.uCurveK.value = 0;
      r.setRenderTarget(this.rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      r.render(this.scene, this.cam);
      r.readRenderTargetPixels(this.rt, 0, 0, RT, RT, this.buf);
      url = this.encode();
    } catch (e) {
      console.error('[hud] 썸네일', id, e);
    } finally {
      r.setRenderTarget(prevRT);
      r.setClearColor(prevClear, prevAlpha);
      curveUniforms.uCurveK.value = prevK;
      info.calls = calls; info.triangles = tris;
      this.scene.remove(obj);
    }
    if (url && src === 'model') this.store(id, url);
    return url;
  }

  /** 읽은 픽셀(선형, 아래→위) → sRGB · 위아래 뒤집기 → 64px 로 줄여 PNG */
  private encode(): string {
    this.big ??= Object.assign(document.createElement('canvas'), { width: RT, height: RT });
    this.small ??= Object.assign(document.createElement('canvas'), { width: OUT, height: OUT });
    const g = this.big.getContext('2d')!;
    const img = g.createImageData(RT, RT);
    const d = img.data, b = this.buf, lut = this.lut;
    for (let y = 0; y < RT; y++) {
      const src = (RT - 1 - y) * RT * 4, dst = y * RT * 4;
      for (let x = 0; x < RT * 4; x += 4) {
        const a = b[src + x + 3];
        d[dst + x] = lut[b[src + x]]; d[dst + x + 1] = lut[b[src + x + 1]]; d[dst + x + 2] = lut[b[src + x + 2]];
        d[dst + x + 3] = a;
      }
    }
    g.putImageData(img, 0, 0);
    const s = this.small.getContext('2d')!;
    s.clearRect(0, 0, OUT, OUT);
    s.imageSmoothingEnabled = true; s.imageSmoothingQuality = 'high';
    s.drawImage(this.big, 0, 0, OUT, OUT);
    return this.small.toDataURL('image/png');
  }

  // ───────────── 저장(IndexedDB) ─────────────
  private openDb(): Promise<IDBDatabase | null> {
    if (this.db) return this.db;
    this.db = new Promise((res) => {
      try {
        if (typeof indexedDB === 'undefined') { res(null); return; }
        const rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE); };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
        rq.onblocked = () => res(null);
      } catch { res(null); }
    });
    return this.db;
  }
  private store(id: string, url: string) {
    void this.openDb().then((db) => {
      if (!db) return;
      try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(url, `${THUMB_VER}:${id}`); } catch { /* 저장 못 해도 화면엔 있다 */ }
    });
  }
  private loadStored() {
    void this.openDb().then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(STORE, 'readonly');
        const rq = tx.objectStore(STORE).openCursor();
        const got: string[] = [];
        rq.onsuccess = () => {
          const cur = rq.result;
          if (cur) {
            const k = String(cur.key);
            const i = k.indexOf(':');
            if (k.slice(0, i) === String(THUMB_VER) && typeof cur.value === 'string') { this.q.put(k.slice(i + 1), cur.value, 'model'); got.push(k.slice(i + 1)); }
            cur.continue();
          } else if (got.length) for (const fn of this.listeners) { try { fn(got); } catch { /* */ } }
        };
      } catch { /* 없으면 새로 그린다 */ }
    });
  }
}
