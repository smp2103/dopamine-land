// 머리 위 게이지(헤엄 체력 = 물방울 링, 잠수 산소 = 거품 링)와 둥둥 튜브 구조 연출(하얀 페이드 + 줄무늬 튜브).
// HUD 칩은 hudfx 몫 — 여기선 세상 속(3D) 표시만.
import * as THREE from 'three';
import { at, merge, paintFn, torus, type Geo } from './kit';

const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

/** 링 가운데 아이콘(캔버스 한 번 그리기) — drop 물방울 / bubble 거품 */
function iconTexture(kind: 'drop' | 'bubble'): THREE.Texture | null {
  if (!hasDom()) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  if (kind === 'drop') {
    g.fillStyle = '#8fd3f4';
    g.beginPath();
    g.moveTo(32, 6);
    g.bezierCurveTo(44, 24, 52, 34, 52, 42);
    g.arc(32, 42, 20, 0, Math.PI, false);
    g.bezierCurveTo(12, 34, 20, 24, 32, 6);
    g.fill();
    g.fillStyle = '#4a9cf0';
    g.beginPath(); g.ellipse(25, 44, 2.6, 3.4, 0, 0, Math.PI * 2); g.ellipse(39, 44, 2.6, 3.4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff9fb8';
    g.beginPath(); g.ellipse(20, 51, 3.4, 2.2, 0, 0, Math.PI * 2); g.ellipse(44, 51, 3.4, 2.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.ellipse(24, 30, 4, 6, -0.5, 0, Math.PI * 2); g.fill();
  } else {
    for (const [x, y, r] of [[30, 36, 18], [50, 16, 8], [12, 14, 6]] as const) {
      g.fillStyle = 'rgba(220,250,255,0.55)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(2, r * 0.22);
      g.beginPath(); g.arc(x, y, r - 1, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(x - r * 0.35, y - r * 0.35, r * 0.25, r * 0.17, -0.6, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#4a9cf0';
    g.beginPath(); g.ellipse(24, 38, 2.2, 3, 0, 0, Math.PI * 2); g.ellipse(36, 38, 2.2, 3, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const overlayMat = (color: string, opacity: number, map?: THREE.Texture | null) => new THREE.MeshBasicMaterial({
  color, map: map ?? null, transparent: true, opacity, depthTest: false, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true,
});

/** 링 지오메트리 하나에 바탕(흰 반투명) + 채움(색) — 정점색 RGBA 로 칠해 그리기 1번 */
function ringGeo(radius: number, q: number, fill: THREE.Color): THREE.BufferGeometry {
  const parts: Array<[THREE.BufferGeometry, THREE.Color, number]> = [[new THREE.RingGeometry(radius * 0.72, radius, 48), new THREE.Color('#ffffff'), 0.55]];
  if (q > 0) {
    const len = (q / 60) * Math.PI * 2;
    parts.push([new THREE.RingGeometry(radius * 0.76, radius * 0.96, Math.max(3, Math.round(48 * q / 60)), 1, Math.PI / 2, Math.max(1e-4, len)), fill, 0.95]);
  }
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (const [g, c, a] of parts) {
    const base = pos.length / 3, P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); col.push(c.r, c.g, c.b, a); }
    const I = g.index!;
    for (let i = 0; i < I.count; i++) idx.push(base + I.getX(i));
    g.dispose();
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  o.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  o.setIndex(idx);
  return o;
}

/** 머리 위 원형 게이지(카메라를 본다). set(0..1) 은 60칸으로 끊어 그때만 지오메트리를 바꾼다(링 1 + 아이콘 1 = 그리기 2번) */
export class HeadRing {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private q = -1;
  private low = false;
  private fillC = new THREE.Color();
  constructor(kind: 'drop' | 'bubble', private color: string, private lowColor = '#ff8a7a', readonly radius = 0.19) {
    this.group.name = `ocean-ring-${kind}`;
    const ringMat = overlayMat('#ffffff', 1);
    ringMat.vertexColors = true;
    this.fillC.set(color);
    this.ring = new THREE.Mesh(ringGeo(radius, 60, this.fillC), ringMat);
    const icon = new THREE.Mesh(new THREE.PlaneGeometry(radius * 1.25, radius * 1.25), overlayMat('#ffffff', 1, iconTexture(kind)));
    for (const [i, m] of [this.ring, icon].entries()) { m.renderOrder = 990 + i; m.frustumCulled = false; this.group.add(m); }
    this.group.visible = false;
  }
  /** v = 0..1 남은 양 */
  set(v: number) {
    const q = Math.max(0, Math.min(60, Math.round(v * 60)));
    const low = v < 0.25;
    if (q !== this.q || low !== this.low) {
      this.q = q; this.low = low;
      this.fillC.set(low ? this.lowColor : this.color);
      this.ring.geometry.dispose();
      this.ring.geometry = ringGeo(this.radius, q, this.fillC);
    }
  }
  /** 자리·카메라 맞추기. 숨이 적으면 콩콩 뛴다 */
  place(pos: THREE.Vector3, cam: THREE.Camera, t: number) {
    this.group.position.copy(pos);
    this.group.quaternion.copy(cam.quaternion);
    const k = this.low ? 1 + 0.08 * Math.max(0, Math.sin(t * 9)) : 1;
    this.group.scale.setScalar(k);
  }
}

/** 둥둥 튜브(분홍·흰 줄무늬) */
export function tubeGeo(): Geo {
  const g = torus(0.5, 0.17, 14, 36).rotateX(Math.PI / 2);
  return merge([at(paintFn(g, (v, o) => { o.set(Math.floor((Math.atan2(v.z, v.x) / Math.PI + 1) * 4) % 2 ? '#fffaf2' : '#ff9fb8'); }), 0, 0, 0)]);
}

/** 화면 페이드(하늘색-하얀) + 가운데 글자 — 전체 화면 패스가 아니라 DOM 한 장 */
export class FadeOverlay {
  private el: HTMLDivElement | null = null;
  private label: HTMLDivElement | null = null;
  constructor() {
    if (!hasDom()) return;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:30;display:flex;align-items:center;justify-content:center;'
      + 'background:radial-gradient(ellipse at 50% 50%, rgba(255,250,242,0.96) 0%, rgba(214,244,255,0.97) 60%, rgba(143,211,244,0.98) 100%);';
    const lb = document.createElement('div');
    lb.style.cssText = "font-family:Jua,system-ui,sans-serif;font-size:34px;color:#4a3b2a;text-shadow:0 2px 0 #fff8e8;letter-spacing:1px;";
    el.appendChild(lb);
    (document.getElementById('ui') ?? document.body).appendChild(el);
    this.el = el; this.label = lb;
  }
  set(k: number, text?: string) {
    if (!this.el) return;
    this.el.style.opacity = String(Math.max(0, Math.min(1, k)));
    if (text !== undefined && this.label) this.label.textContent = text;
  }
  get opacity() { return this.el ? Number(this.el.style.opacity) || 0 : 0; }
}
