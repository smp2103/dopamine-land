// 루프 테스트용 아주 작은 DOM 대역 — 캔버스 그림(텍스처)·HUD 요소를 만들어도 넘어지지 않게만.
// 그리기는 아무것도 하지 않고, 요소 트리(appendChild·querySelector 일부)와 이벤트 등록만 흉내 낸다.
/* eslint-disable @typescript-eslint/no-explicit-any */

const g = globalThis as any;

/** 2D 캔버스 컨텍스트 대역 — 모든 메서드는 아무 일 안 함, measureText 는 글자 수로 너비 */
function make2d(canvas: any) {
  const grad = { addColorStop() {} };
  const ctx: any = {
    canvas,
    measureText: (t: string) => ({ width: String(t).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createConicGradient: () => grad,
    createPattern: () => ({}),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    isPointInPath: () => false,
    getLineDash: () => [],
  };
  return new Proxy(ctx, {
    get(t, k) { if (k in t) return t[k]; return typeof k === 'string' ? (t[k] = () => {}) : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

class FakeClassList {
  private s = new Set<string>();
  add(...c: string[]) { for (const x of c) this.s.add(x); }
  remove(...c: string[]) { for (const x of c) this.s.delete(x); }
  toggle(c: string, on?: boolean) { const v = on ?? !this.s.has(c); if (v) this.s.add(c); else this.s.delete(c); return v; }
  contains(c: string) { return this.s.has(c); }
  toString() { return [...this.s].join(' '); }
}

export class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  style: Record<string, any> = new Proxy({ setProperty() {}, removeProperty() {}, getPropertyValue: () => '' } as Record<string, any>, {});
  dataset: Record<string, string> = {};
  classList = new FakeClassList();
  attrs: Record<string, string> = {};
  listeners = new Map<string, Array<(e: any) => void>>();
  textContent = '';
  private _html = '';
  value = '';
  width = 300;
  height = 150;
  id = '';
  className = '';
  hidden = false;
  disabled = false;
  checked = false;
  scrollTop = 0; scrollLeft = 0; scrollHeight = 0; clientWidth = 1600; clientHeight = 900; offsetWidth = 100; offsetHeight = 20;
  private _ctx: any = null;
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  get innerHTML() { return this._html; }
  set innerHTML(v: string) { this._html = String(v); this.children = []; this.picked?.clear(); }
  get firstChild() { return this.children[0] ?? null; }
  get lastChild(): FakeElement | null { return this.children.at(-1) ?? null; }
  get firstElementChild() { return this.firstChild; }
  get childNodes() { return this.children; }
  get isConnected() { return true; }
  get ownerDocument() { return g.document; }
  appendChild<T extends FakeElement>(c: T) { if (c && c !== (this as any)) { c.remove?.(); c.parentNode = this; this.children.push(c); } return c; }
  append(...cs: any[]) { for (const c of cs) if (c instanceof FakeElement) this.appendChild(c); else this.textContent += String(c); }
  prepend(...cs: any[]) { for (const c of cs.reverse()) if (c instanceof FakeElement) { c.parentNode = this; this.children.unshift(c); } }
  insertBefore<T extends FakeElement>(c: T, _ref: any) { return this.appendChild(c); }
  insertAdjacentHTML() {}
  insertAdjacentElement(_p: string, c: FakeElement) { return this.appendChild(c); }
  replaceChildren(...cs: any[]) { this.children = []; this.append(...cs); }
  removeChild<T extends FakeElement>(c: T) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  replaceWith(c: FakeElement) { const p = this.parentNode; if (p) { p.removeChild(this); p.appendChild(c); } }
  remove() { this.parentNode?.removeChild(this); }
  contains(o: any): boolean { return o === this || this.children.some((c): boolean => c.contains(o)); }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  hasAttribute(k: string) { return k in this.attrs; }
  addEventListener(t: string, fn: (e: any) => void) { (this.listeners.get(t) ?? this.listeners.set(t, []).get(t)!).push(fn); }
  removeEventListener(t: string, fn: (e: any) => void) { const a = this.listeners.get(t); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  dispatchEvent(e: any) { for (const fn of [...(this.listeners.get(e?.type) ?? [])]) fn(e); return true; }
  click() { this.dispatchEvent({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} }); }
  focus() {} blur() {}
  animate() { return { finished: Promise.resolve(), cancel() {}, onfinish: null, addEventListener() {} }; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 }; }
  /** 고른 요소 — innerHTML 을 해석하지 않으므로 선택자마다 빈 요소 하나를 만들어 돌려준다(널 검사 없이 쓰는 코드용) */
  private picked = new Map<string, FakeElement>();
  querySelector(s: string): FakeElement | null {
    let el = this.picked.get(s);
    if (!el) { el = new FakeElement('div'); el.parentNode = this; this.picked.set(s, el); }
    return el;
  }
  querySelectorAll(_s: string): FakeElement[] { return []; }
  getElementsByTagName() { return []; }
  closest() { return null; }
  matches() { return false; }
  scrollIntoView() {} scrollTo() {}
  setPointerCapture() {} releasePointerCapture() {}
  requestPointerLock() {}
  // 캔버스
  getContext(kind: string) { if (kind !== '2d') return null; return (this._ctx ??= make2d(this)); }
  toDataURL() { return 'data:image/png;base64,'; }
  toBlob(cb: (b: unknown) => void) { cb(null); }
  // 오디오·비디오 요소
  play() { return Promise.resolve(); } pause() {}
}

/** 없을 때만 document·window·requestAnimationFrame 등을 깐다. 되돌리기 함수를 돌려준다 */
export function installDom(): () => void {
  const undo: Array<() => void> = [];
  const put = (k: string, v: unknown) => {
    const had = Object.prototype.hasOwnProperty.call(g, k);
    const old = g[k];
    Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
    undo.push(() => { if (had) Object.defineProperty(g, k, { value: old, configurable: true, writable: true }); else delete g[k]; });
  };
  if (typeof g.document === 'undefined' || typeof g.document.createElement !== 'function') {
    const body = new FakeElement('body');
    const head = new FakeElement('head');
    const docEl = new FakeElement('html');
    const byId = new Map<string, FakeElement>();
    const docTarget = new EventTarget();
    const doc: any = {
      body, head, documentElement: docEl, visibilityState: 'visible', hidden: false, fonts: { ready: Promise.resolve(), load: () => Promise.resolve([]), add() {} },
      activeElement: null,
      createElement: (t: string) => new FakeElement(t),
      createElementNS: (_ns: string, t: string) => new FakeElement(t),
      createTextNode: (t: string) => Object.assign(new FakeElement('#text'), { textContent: t }),
      createDocumentFragment: () => new FakeElement('#fragment'),
      getElementById: (id: string) => byId.get(id) ?? (byId.set(id, Object.assign(new FakeElement('div'), { id })).get(id)!),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: docTarget.addEventListener.bind(docTarget),
      removeEventListener: docTarget.removeEventListener.bind(docTarget),
      dispatchEvent: docTarget.dispatchEvent.bind(docTarget),
      exitPointerLock() {}, pointerLockElement: null,
    };
    put('document', doc);
  }
  if (typeof g.window === 'undefined') put('window', g);
  if (typeof g.addEventListener !== 'function') {
    const t = new EventTarget();
    put('addEventListener', t.addEventListener.bind(t));
    put('removeEventListener', t.removeEventListener.bind(t));
    put('dispatchEvent', t.dispatchEvent.bind(t));
  }
  if (typeof g.requestAnimationFrame !== 'function') { put('requestAnimationFrame', (fn: (t: number) => void) => setTimeout(() => fn(Date.now()), 0)); put('cancelAnimationFrame', (h: any) => clearTimeout(h)); }
  if (typeof g.innerWidth !== 'number') { put('innerWidth', 1600); put('innerHeight', 900); put('devicePixelRatio', 1); }
  if (typeof g.getComputedStyle !== 'function') put('getComputedStyle', () => ({ getPropertyValue: () => '' }));
  if (typeof g.matchMedia !== 'function') put('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  if (typeof g.Image !== 'function') put('Image', class { onload: any = null; src = ''; width = 1; height = 1; });
  if (typeof g.HTMLCanvasElement === 'undefined') put('HTMLCanvasElement', FakeElement);
  if (typeof g.HTMLElement === 'undefined') put('HTMLElement', FakeElement);
  if (typeof g.HTMLInputElement === 'undefined') put('HTMLInputElement', FakeElement);
  if (typeof g.HTMLTextAreaElement === 'undefined') put('HTMLTextAreaElement', FakeElement);
  return () => { for (const u of undo.reverse()) u(); };
}
