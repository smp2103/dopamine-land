// 반짝이 — 안내할 때만 플레이어 어깨 옆에 뿅 나타나는 아기 별(3D, 통통한 별 + 눈·볼 + 빛무리)과 말풍선(DOM).
// 말풍선은 반짝이의 화면 자리에서 뻗어 나오고, [키] 는 키캡으로 그린다. 해내면 "잘했어요!" 반짝 터지고, 하품하며 위로 사라진다.
// 안 보일 땐 group.visible=false(그리기 0) · DOM 은 display:none. 매 프레임 하는 일은 위치 맞추기 한 번뿐.
import * as THREE from 'three';
import { addEyes, eyeMaterial, blushMaterial, type EyeSet } from '../../core/art';
import type { TextPart } from './logic';
import { CSS } from './style';

type Phase = 'off' | 'in' | 'on' | 'yay' | 'out' | 'nap';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** 키 이름 → 키캡 글(짧고 귀엽게) */
const capOf = (k: string) => k;

/** 통통한 별 모양(뾰족하지 않게 — 반지름을 코사인으로 부드럽게 오르내린다) */
function puffyStar(R = 0.17, r = 0.1, n = 72): THREE.Shape {
  const sh = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    const k = Math.pow(0.5 + 0.5 * Math.cos(5 * (a - Math.PI / 2)), 1.7);
    const rad = r + (R - r) * k;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  return sh;
}

function haloTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,170,0.95)');
    gr.addColorStop(0.35, 'rgba(255,214,120,0.45)');
    gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface ViewOpts {
  camera: THREE.Camera;
  /** 플레이어 발끝 */
  anchor: () => THREE.Vector3;
  /** 불꽃 방향용 난수 */
  rng: () => number;
}

export class BuddyView {
  readonly group = new THREE.Group();
  private star = new THREE.Group();
  private body: THREE.Mesh;
  private halo: THREE.Sprite;
  private eyes: EyeSet;
  private faceMat: { eyeL: THREE.Material[]; eyeR: THREE.Material[]; blush: THREE.Material[] };
  private root: HTMLDivElement;
  /** 말풍선 자리(위치만) — 안쪽 .onb-bub 이 통통 애니메이션 */
  private at: HTMLDivElement;
  private bub: HTMLDivElement;
  private txt: HTMLDivElement;
  private zz: HTMLDivElement;
  private phase: Phase = 'off';
  private pt = 0;
  private clock = 0;
  private wantBubble = true;
  private wantStar = true;
  private pos = new THREE.Vector3();
  private placed = false;
  private measure = true;
  private bw = 280;
  private bh = 70;
  private _v = new THREE.Vector3();
  private _r = new THREE.Vector3();
  /** 반짝이 화면 자리(말풍선 꼬리 · hud.hint 의 anchor) */
  screen: { x: number; y: number } | null = null;

  constructor(private o: ViewOpts) {
    this.group.name = 'onboarding-buddy';
    this.group.visible = false;
    const geo = new THREE.ExtrudeGeometry(puffyStar(), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 5, curveSegments: 4 });
    geo.translate(0, 0, -0.035);
    geo.computeVertexNormals();
    // 벽·나무 뒤에서도 반짝이는 보인다(깊이 검사 끔 — 늘 카메라를 보는 별이라 뒷면은 컬링으로 충분)
    const mat = new THREE.MeshStandardMaterial({ color: '#ffe27a', emissive: '#ffc24a', emissiveIntensity: 0.55, roughness: 0.42, metalness: 0, depthTest: false });
    this.body = new THREE.Mesh(geo, mat);
    this.body.castShadow = false;
    this.body.renderOrder = 990;
    this.star.add(this.body);
    // 얼굴: 앞면(z = 0.035 + 0.04) 바로 위. 공용 눈·볼 재질을 '깊이 검사 끔' 복제로 바꿔 낀다(공용 것은 건드리지 않는다)
    this.eyes = addEyes(this.star, { size: 0.048, y: 0.012, z: 0.078, gap: 0.07, splay: 0.08 });
    const noDepth = <T extends THREE.Material>(m: T): T => { const c = m.clone() as T; c.depthTest = false; c.userData = {}; return c; };
    this.faceMat = {
      eyeL: [noDepth(eyeMaterial('L', false)), noDepth(eyeMaterial('L', true))],
      eyeR: [noDepth(eyeMaterial('R', false)), noDepth(eyeMaterial('R', true))],
      blush: [noDepth(blushMaterial(false)), noDepth(blushMaterial(true))],
    };
    this.eyes.left.renderOrder = this.eyes.right.renderOrder = 992;
    for (const b of this.eyes.blush) b.renderOrder = 991;
    this.setHappy(false);
    const hm = new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.halo = new THREE.Sprite(hm);
    this.halo.scale.setScalar(0.72);
    this.halo.renderOrder = 989;
    this.star.add(this.halo);
    this.group.add(this.star);

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'dl-onb';
    this.root.innerHTML = '<div class="onb-pos"><div class="onb-bub"><div class="onb-who">반짝이</div><div class="onb-txt"></div></div></div><div class="onb-zz">하암…</div>';
    this.at = this.root.querySelector('.onb-pos') as HTMLDivElement;
    this.bub = this.root.querySelector('.onb-bub') as HTMLDivElement;
    this.txt = this.root.querySelector('.onb-txt') as HTMLDivElement;
    this.zz = this.root.querySelector('.onb-zz') as HTMLDivElement;
    document.body.appendChild(this.root);
  }

  get state(): Phase { return this.phase; }

  /** 웃는 눈 '> <' + 볼 진하게(복제 재질로) */
  private setHappy(on: boolean) {
    const i = on ? 1 : 0;
    this.eyes.left.material = this.faceMat.eyeL[i];
    this.eyes.right.material = this.faceMat.eyeR[i];
    for (const b of this.eyes.blush) b.material = this.faceMat.blush[i];
  }

  /** 안내 시작. bubble=false 면 말풍선은 hud.hint 가, star=false 면 별도 hud 가 그린다(화면 자리 계산·소리 박자만 여기서) */
  show(parts: TextPart[], o: { bubble: boolean; star?: boolean }) {
    this.wantBubble = o.bubble;
    this.wantStar = o.star !== false;
    this.txt.innerHTML = parts.map((p) => (p.t === 'key' ? `<kbd class="onb-key">${esc(capOf(p.v))}</kbd>` : esc(p.v))).join('');
    this.bub.classList.remove('yay');
    this.measure = true;
    if (this.phase === 'off' || this.phase === 'out') this.placed = false;
    this.enter();
  }

  /** 바빠서 잠깐 숨었다가(pause) 다시 나타나기(resume) */
  pause() { if (this.phase !== 'off') this.go('out', false); }
  resume() { this.enter(); }

  /** 해냈다! — 말을 바꾸고 반짝 터진 뒤 하품하며 떠난다 */
  yay(text: string) {
    if (this.phase === 'off') return;
    this.txt.textContent = text;
    this.bub.classList.add('yay');
    this.measure = true;
    this.burst();
    this.setHappy(true);
    this.phase = 'yay'; this.pt = 0;
  }

  /** 시간 다 됨 — 하품하고 떠난다 */
  away() { if (this.phase !== 'off') this.go('nap', true); }

  /** 바로 치우기(reset) */
  clear() {
    this.phase = 'off';
    this.group.visible = false;
    this.root.className = '';
    this.setHappy(false);
  }

  private enter() {
    this.phase = 'in'; this.pt = 0;
    this.group.visible = this.wantStar;
    this.setHappy(false);
    this.root.className = `on${this.wantBubble ? ' bubble' : ''}`;
    // 다시 띄우면 애니메이션을 처음부터
    this.bub.style.animation = 'none';
    void this.bub.offsetWidth;
    this.bub.style.animation = '';
  }

  private go(p: 'out' | 'nap', sleepy: boolean) {
    this.phase = p; this.pt = 0;
    this.root.className = `${this.wantBubble ? 'bubble ' : ''}leave${sleepy ? ' nap' : ''}`;
  }

  /** 작은 반짝이 가루(DOM — 반짝이 화면 자리에서 튀어 나간다) */
  private burst() {
    if (!this.screen) return;
    const colors = ['#ffd84a', '#ff9fb8', '#9fd8ff', '#b9f0a0', '#c9b8ff'];
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('i');
      s.className = 'onb-spark';
      const a = (i / 9) * Math.PI * 2 + this.o.rng() * 0.6;
      const d = 42 + this.o.rng() * 36;
      s.style.left = `${this.screen.x}px`;
      s.style.top = `${this.screen.y}px`;
      s.style.setProperty('--x', `${Math.cos(a) * d}px`);
      s.style.setProperty('--y', `${Math.sin(a) * d}px`);
      s.style.color = colors[i % colors.length];
      s.textContent = i % 3 === 0 ? '★' : '✦';
      this.root.appendChild(s);
      setTimeout(() => s.remove(), 800);
    }
  }

  /** 매 프레임(dt = 실제 초) */
  update(dt: number) {
    if (this.phase === 'off') return;
    this.clock += dt;
    this.pt += dt;
    const cam = this.o.camera;
    // 어깨 자리: 발끝 + 위 1.55 m + 화면 오른쪽 0.6 m
    const base = this.o.anchor();
    this._r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    this._r.y = 0;
    if (this._r.lengthSq() < 1e-6) this._r.set(1, 0, 0);
    this._r.normalize();
    const bob = Math.sin(this.clock * 2.6) * 0.06;
    const want = this._v.copy(base).addScaledVector(this._r, 0.62);
    want.y += 1.55 + bob;
    if (!this.placed) { this.pos.copy(want); this.pos.y += 0.9; this.placed = true; }
    this.pos.lerp(want, Math.min(1, dt * 7));

    // 크기·떠나기
    let s = 1, lift = 0, sleepy = 0;
    const p = this.pt;
    if (this.phase === 'in') {
      // 위에서 톡 떨어져 말랑 착지(탄성)
      const k = Math.min(1, p / 0.45);
      s = elastic(k);
      if (k >= 1) this.phase = 'on';
    } else if (this.phase === 'yay') {
      s = 1 + Math.sin(Math.min(1, p / 0.5) * Math.PI) * 0.35;
      if (p > 1.05) { this.go('nap', true); }
    } else if (this.phase === 'out' || this.phase === 'nap') {
      const dur = this.phase === 'nap' ? 1.1 : 0.3;
      const k = Math.min(1, p / dur);
      sleepy = this.phase === 'nap' ? Math.min(1, k * 2.2) : 0;
      lift = this.phase === 'nap' ? k * k * 0.9 : 0;
      s = this.phase === 'nap' ? (k < 0.45 ? 1 + 0.08 * Math.sin(k / 0.45 * Math.PI) : 1 - (k - 0.45) / 0.55) : 1 - k;
      if (k >= 1) { this.phase = 'off'; this.group.visible = false; this.root.className = ''; this.setHappy(false); return; }
    }
    this.star.position.copy(this.pos);
    this.star.position.y += lift;
    this.star.quaternion.copy(cam.quaternion);
    this.star.rotateZ(Math.sin(this.clock * 1.7) * 0.18 + (this.phase === 'yay' ? p * 9 : 0));
    this.star.scale.setScalar(Math.max(0.001, s));
    // 졸린 눈(세로로 납작)
    const ey = this.eyes.size * (1 - sleepy * 0.82);
    this.eyes.left.scale.y = ey; this.eyes.right.scale.y = ey;
    this.halo.material.opacity = 0.75 + Math.sin(this.clock * 3.1) * 0.2;

    // 화면 자리 → 말풍선
    const v = this._v.copy(this.star.position).project(cam);
    const W = window.innerWidth, H = window.innerHeight;
    if (v.z > 1 || v.z < -1) { this.screen = null; this.root.style.visibility = 'hidden'; return; }
    this.root.style.visibility = '';
    const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
    this.screen = { x: sx, y: sy };
    if (this.wantBubble) this.placeBubble(sx, sy, W, H);
    this.zz.style.transform = `translate(${Math.round(sx + 14)}px, ${Math.round(sy - 46)}px)`;
  }

  private placeBubble(sx: number, sy: number, W: number, H: number) {
    // 크기는 글이 바뀐 뒤 한 번만 잰다(매 프레임 레이아웃 읽기 없이)
    if (this.measure) { this.measure = false; this.bw = this.bub.offsetWidth || this.bw; this.bh = this.bub.offsetHeight || this.bh; }
    const bw = this.bw, bh = this.bh;
    const M = 12;
    // 기본: 별 오른쪽 위 · 화면 오른쪽 끝이면 왼쪽으로 뒤집는다
    let flip = sx + 26 + bw > W - M;
    let x = flip ? sx - 26 - bw : sx + 26;
    if (x < M) { flip = false; x = M; }
    let y = sy - 18 - bh;
    y = Math.max(M, Math.min(H - bh - M, y));
    x = Math.max(M, Math.min(W - bw - M, x));
    this.bub.classList.toggle('flip', flip);
    this.at.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  dispose() { this.root.remove(); }
}

/** 0..1 → 말랑 착지(살짝 넘쳤다 돌아온다) */
function elastic(k: number) {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  return 1 - Math.pow(2, -9 * k) * Math.cos(k * Math.PI * 2.6);
}
