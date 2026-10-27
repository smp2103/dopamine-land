// netplay-play 화면 — 방문객 풍선 상자, 레이스 링, 협동 보스 셋(모사·산갈치·하늘고래), 불꽃놀이.
// 놀이가 있을 때만 만들고(지연 생성) 끝나면 숨긴다. 재질·지오메트리는 모듈 안에서 나눠 쓴다(그리기 ≤ 40).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { addEyes, blobShadow } from '../../core/art';
import { applyCurve } from '../../core/curve';
import type { Course, BossKind, BossState } from './logic';
import type { PlayView } from './play';

const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
const shared = <T extends THREE.BufferGeometry>(g: T): T => { g.userData.shared = true; return g; };

/** 둥근 상자 */
function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), mat);
  m.castShadow = true;
  return m;
}
/** 회전체 풍선(아래가 살짝 좁다) */
function balloonGeo(r: number) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI / 2 + (i / 24) * Math.PI, y = Math.sin(a);
    const pinch = y < 0 ? 1 - 0.28 * Math.pow(-y, 1.6) : 1;
    pts.push(new THREE.Vector2(Math.max(1e-3, Math.cos(a) * r * pinch), y * r * 1.12));
  }
  return new THREE.LatheGeometry(pts, 28);
}

// ───────────── 방문객 풍선 상자 ─────────────
function buildChest() {
  const root = new THREE.Group();
  root.name = 'netplayplay-chest';
  const wood = std('#d39a5e'), woodD = std('#b87a45'), gold = std('#ffd36b', { metalness: 0.5, roughness: 0.35 }), pink = std('#ff8fb1');
  const body = rbox(0.9, 0.52, 0.62, 0.1, wood); body.position.y = 0.3; root.add(body);
  const lid = rbox(0.96, 0.26, 0.68, 0.12, woodD); lid.position.y = 0.66; root.add(lid);
  const band = rbox(0.14, 0.82, 0.7, 0.05, gold); band.position.y = 0.44; root.add(band);
  const clasp = rbox(0.18, 0.18, 0.08, 0.05, gold); clasp.position.set(0, 0.5, 0.34); root.add(clasp);
  // 뚜껑 위 리본
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 10, 22), pink);
    loop.scale.set(1, 0.7, 0.7); loop.position.set(s * 0.11, 0.84, 0); loop.rotation.z = s * 0.5;
    root.add(loop);
  }
  // 풍선 셋 + 줄
  const balloons = new THREE.Group();
  balloons.name = 'balloons';
  const cols = ['#ff8fb1', '#ffd36b', '#7cc8f0'];
  const offs: Array<[number, number, number]> = [[-0.32, 1.9, 0.05], [0.34, 2.05, -0.08], [0.02, 2.35, 0.14]];
  offs.forEach(([x, y, z], i) => {
    const b = new THREE.Mesh(balloonGeo(0.3), std(cols[i], { roughness: 0.25 }));
    b.position.set(x, y, z);
    balloons.add(b);
    // 줄: 풍선 아래 매듭 → 뚜껑 리본
    const dir = new THREE.Vector3(x, y - 0.34 - 0.86, z);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, dir.length(), 4), std('#fff6ea'));
    s.position.set(x / 2, (y - 0.34 + 0.86) / 2, z / 2);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    balloons.add(s);
  });
  root.add(balloons);
  const sh = blobShadow(0.7); root.add(sh);
  return { root, balloons };
}

// ───────────── 협동 보스 ─────────────
function eyesOn(head: THREE.Object3D, r: number, size: number) { addEyes(head, { size, head: { r }, blush: true }); }

function buildMosasaur() {
  const g = new THREE.Group();
  const blue = std('#5a78c8'), belly = std('#fffaf2'), fin = std('#7d97da');
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), blue); body.scale.set(2.4, 1.5, 5.2); g.add(body);
  const bel = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), belly); bel.scale.set(2.0, 1.05, 4.6); bel.position.y = -0.55; g.add(bel);
  const head = new THREE.Group(); head.position.set(0, 0.7, 5.2); g.add(head);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(1.7, 32, 20), blue); hm.scale.set(1, 0.9, 1.15); head.add(hm);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), belly); snout.scale.set(1.1, 0.55, 1.0); snout.position.set(0, -0.65, 1.05); head.add(snout);
  eyesOn(head, 1.62, 0.62);
  for (const [x, z] of [[-1, 1.6], [1, 1.6], [-1, -2.4], [1, -2.4]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), fin); f.scale.set(1.6, 0.18, 0.7);
    f.position.set(x * 2.4, -0.4, z); f.rotation.z = -x * 0.35; g.add(f);
  }
  const tail = new THREE.Group(); tail.position.z = -5.4; g.add(tail);
  for (const s of [-1, 1]) {
    const tf = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), fin); tf.scale.set(0.25, 1.6, 1.0); tf.position.set(0, s * 1.1, -0.6); tf.rotation.x = s * 0.6; tail.add(tf);
  }
  return { g, tail, lift: 0.9 };
}
function buildOarfish() {
  const g = new THREE.Group();
  const silver = std('#eef3fa', { metalness: 0.35, roughness: 0.3 }), red = std('#ff6f86'), pinkS = std('#ffd0de');
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(new THREE.Vector3(Math.sin(u * Math.PI * 2.2) * 1.6, Math.sin(u * Math.PI) * 1.2, 7 - u * 16)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubeGeo = new THREE.TubeGeometry(curve, 96, 0.55, 14, false);
  // 꼬리 쪽으로 가늘게
  const pos = tubeGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const seg = Math.floor(i / 15) / 96;
    const c = curve.getPointAt(Math.min(1, seg));
    const k = 1 - seg * 0.75;
    pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k);
  }
  tubeGeo.computeVertexNormals();
  g.add(new THREE.Mesh(tubeGeo, silver));
  // 등 리본(빨간 갈기) — 몸 위로 얇은 관 하나
  const crest = new THREE.CatmullRomCurve3(pts.map((p, i) => p.clone().add(new THREE.Vector3(0, 0.62 + Math.sin(i * 1.3) * 0.12, 0))));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(crest, 96, 0.16, 8, false), red));
  const head = new THREE.Group(); head.position.copy(pts[0]).add(new THREE.Vector3(0, 0.1, 0.5)); g.add(head);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 18), silver); hm.scale.set(1, 1.05, 1.2); head.add(hm);
  eyesOn(head, 0.92, 0.42);
  for (let i = 0; i < 3; i++) {
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.5, 12), i === 1 ? red : pinkS);
    plume.position.set((i - 1) * 0.3, 1.3, -0.2 - i * 0.15); plume.rotation.x = -0.5 - i * 0.12;
    head.add(plume);
  }
  return { g, tail: null as THREE.Object3D | null, lift: 1.4 };
}
function buildWhale() {
  const g = new THREE.Group();
  const white = std('#fffaf2'), sky = std('#c8e8ff'), pink = std('#ffd0de'), yel = std('#ffe9a8');
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), white); body.scale.set(3.6, 3.0, 5.6); g.add(body);
  const bel = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), sky); bel.scale.set(3.0, 2.0, 4.8); bel.position.y = -1.2; g.add(bel);
  const head = new THREE.Group(); head.position.set(0, 0.4, 3.6); g.add(head);
  eyesOn(head, 2.55, 0.8);
  // 몽글몽글 구름 털
  const puff = new THREE.SphereGeometry(1, 20, 14);
  [[0, 2.7, 0.5, 1.3], [1.4, 2.3, -1, 1.0], [-1.4, 2.4, -0.8, 1.05], [0.3, 2.2, -2.6, 0.9]].forEach(([x, y, z, r]) => {
    const p = new THREE.Mesh(puff, white); p.position.set(x, y, z); p.scale.setScalar(r); g.add(p);
  });
  // 무지개 지느러미
  [pink, sky].forEach((m, i) => {
    const s = i ? 1 : -1;
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), m); f.scale.set(2.2, 0.25, 1.1); f.position.set(s * 3.4, -0.8, 0.8); f.rotation.z = -s * 0.5; g.add(f);
  });
  const tail = new THREE.Group(); tail.position.z = -5.6; g.add(tail);
  [yel, pink].forEach((m, i) => {
    const s = i ? 1 : -1;
    const tf = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), m); tf.scale.set(1.8, 0.25, 1.0); tf.position.set(s * 1.4, 0.3, -0.6); tf.rotation.y = s * 0.5; tail.add(tf);
  });
  return { g, tail, lift: 0 };
}

// ───────────── 불꽃놀이 ─────────────
const SPARKS = 140;
const FW_MAX = 6;
function sparkTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const FW_COLS = [['#ff8fb1', '#ffd0de'], ['#ffd36b', '#fff2b0'], ['#7cc8f0', '#d6f0ff'], ['#8fdc9a', '#e2f7e2'], ['#a99cf0', '#efe9ff'], ['#ffb36b', '#ffe2c2']];
/** 결정적 작은 난수(씨앗 하나로) */
function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

interface Shell { pts: THREE.Points; vel: Float32Array; t: number; ox: number; oy: number; oz: number; apex: number; burst: boolean; heart: boolean }

export class ThreeView implements PlayView {
  readonly root = new THREE.Group();
  private chestObj: ReturnType<typeof buildChest> | null = null;
  private chestPopT = -1;
  private ringGeoCache = new Map<number, THREE.TorusGeometry>();
  private rings: THREE.Mesh[] = [];
  private beacon: THREE.Mesh | null = null;
  private ringMats: THREE.MeshStandardMaterial[] = [];
  private bossObj: { kind: BossKind; g: THREE.Group; tail: THREE.Object3D | null; lift: number; foam: THREE.Mesh } | null = null;
  private bossModels = new Map<BossKind, { g: THREE.Group; tail: THREE.Object3D | null; lift: number }>();
  private bossState: { x: number; y: number; z: number; st: BossState; endT: number; shake: number } | null = null;
  private shells: Shell[] = [];
  private foam: THREE.Mesh | null = null;
  private sparkTex: THREE.Texture | null = null;
  private t = 0;

  constructor(scene: THREE.Object3D, private groundAt: (x: number, z: number) => number) {
    this.root.name = 'netplayplay';
    scene.add(this.root);
  }

  // ── 방문객 상자
  chest(on: boolean, x: number, y: number, z: number) {
    if (on && !this.chestObj) { this.chestObj = buildChest(); this.root.add(this.chestObj.root); applyCurve(this.chestObj.root); }
    const c = this.chestObj;
    if (!c) return;
    if (on) { c.root.visible = true; c.root.position.set(x, y, z); c.root.scale.setScalar(1); c.balloons.position.y = 0; this.chestPopT = -1; }
    else if (this.chestPopT < 0) c.root.visible = false;
  }
  chestPop() { if (this.chestObj?.root.visible) this.chestPopT = 0; }

  // ── 레이스 링
  private ringGeo(r: number) {
    let g = this.ringGeoCache.get(r);
    if (!g) { g = shared(new THREE.TorusGeometry(r, Math.max(0.18, r * 0.05), 12, 48)); this.ringGeoCache.set(r, g); }
    return g;
  }
  course(c: Course | null, next: number) {
    if (!this.rings.length) {
      this.ringMats = [
        std('#ff8fb1', { emissive: new THREE.Color('#ff5f8f'), emissiveIntensity: 0.55 }),
        std('#ffd36b', { transparent: true, opacity: 0.55 }),
        std('#7cc8f0', { transparent: true, opacity: 0.35 }),
      ];
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(this.ringGeo(6), this.ringMats[i]); m.visible = false; this.rings.push(m); this.root.add(m); }
      const bm = new THREE.MeshBasicMaterial({ color: '#ffd0de', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
      this.beacon = new THREE.Mesh(shared(new THREE.CylinderGeometry(0.5, 0.5, 60, 12, 1, true)), bm);
      this.beacon.visible = false;
      this.root.add(this.beacon);
      for (const m of this.rings) applyCurve(m);
    }
    for (let i = 0; i < 3; i++) {
      const ring = this.rings[i];
      const k = next + i;
      const cp = c?.cps[k];
      if (!c || !cp || k === 0) { ring.visible = false; continue; }
      const boat = c.kind === 'boat';
      const r = boat ? cp.r * 0.6 : cp.r * 0.7;
      ring.geometry = this.ringGeo(r);
      const y = boat ? 0 : this.groundAt(cp.x, cp.z);
      ring.position.set(cp.x, y + r * 0.85, cp.z);
      const prev = c.cps[k - 1] ?? cp;
      ring.rotation.set(0, Math.atan2(cp.x - prev.x, cp.z - prev.z), 0);
      ring.material = k === c.cps.length - 1 ? this.ringMats[1] : this.ringMats[Math.min(i, 2)];
      ring.visible = true;
      if (i === 0 && this.beacon) { this.beacon.position.set(cp.x, y + 30, cp.z); this.beacon.visible = true; }
    }
    if (!c && this.beacon) this.beacon.visible = false;
  }

  // ── 보스
  private model(kind: BossKind) {
    let m = this.bossModels.get(kind);
    if (!m) {
      m = kind === 'mosasaur' ? buildMosasaur() : kind === 'oarfish' ? buildOarfish() : buildWhale();
      m.g.name = `netplayplay-boss-${kind}`;
      applyCurve(m.g);
      this.bossModels.set(kind, m);
    }
    return m;
  }
  boss(b: { kind: BossKind; x: number; y: number; z: number; hp: number; max: number; st: BossState } | null) {
    if (!b) { if (this.bossObj) { this.root.remove(this.bossObj.g); this.root.remove(this.bossObj.foam); } this.bossObj = null; this.bossState = null; return; }
    if (!this.bossObj || this.bossObj.kind !== b.kind) {
      if (this.bossObj) { this.root.remove(this.bossObj.g); this.root.remove(this.bossObj.foam); }
      const m = this.model(b.kind);
      // 물거품 고리는 하나만 만들어 보스가 바뀌어도 다시 쓴다(GPU 새는 것 막기)
      const foam = this.foam ??= new THREE.Mesh(shared(new THREE.RingGeometry(6, 9, 40)), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false }));
      foam.rotation.x = -Math.PI / 2;
      foam.visible = b.kind !== 'whale';
      this.bossObj = { kind: b.kind, g: m.g, tail: m.tail, lift: m.lift, foam };
      m.g.scale.setScalar(1);
      this.root.add(m.g, foam);
    }
    const prev = this.bossState;
    this.bossState = { x: b.x, y: b.y, z: b.z, st: b.st, endT: b.st !== 'on' ? (prev?.st !== 'on' && prev ? prev.endT : this.t) : -1, shake: prev?.shake ?? 0 };
  }
  bossHit() { if (this.bossState) this.bossState.shake = 0.25; }

  // ── 불꽃놀이
  firework(x: number, y: number, z: number, seed: number) {
    const rnd = mulberry(seed);
    if (!this.sparkTex) this.sparkTex = sparkTexture();
    const n = 2 + Math.floor(rnd() * 2);
    for (let s = 0; s < n; s++) {
      if (this.shells.length >= FW_MAX) { const old = this.shells.shift()!; this.root.remove(old.pts); old.pts.geometry.dispose(); (old.pts.material as THREE.Material).dispose(); }
      const geo = new THREE.BufferGeometry();
      const P = new Float32Array(SPARKS * 3), C = new Float32Array(SPARKS * 3), vel = new Float32Array(SPARKS * 3);
      const [c1, c2] = FW_COLS[Math.floor(rnd() * FW_COLS.length)].map((h) => new THREE.Color(h));
      const heart = rnd() < 0.3;
      for (let i = 0; i < SPARKS; i++) {
        let vx: number, vy: number, vz: number;
        if (heart) {
          // 하트 모양 터짐(카메라 쪽 상관없이 xy 판)
          const a = (i / SPARKS) * Math.PI * 2;
          const hx = 16 * Math.pow(Math.sin(a), 3), hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
          vx = hx * 0.55; vy = hy * 0.55; vz = (rnd() - 0.5) * 1.5;
        } else {
          const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = 8 + rnd() * 4;
          vx = r * Math.cos(th) * sp; vy = u * sp; vz = r * Math.sin(th) * sp;
        }
        vel.set([vx, vy, vz], i * 3);
        const c = (i % 3 === 0 ? c2 : c1);
        C.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
      const mat = new THREE.PointsMaterial({ size: 1.1, map: this.sparkTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      const ox = x + (rnd() - 0.5) * 10, oz = z + (rnd() - 0.5) * 10;
      this.shells.push({ pts, vel, t: -s * 0.45, ox, oy: y, oz, apex: 13 + rnd() * 7, burst: false, heart });
      this.root.add(pts);
    }
  }

  update(t: number, dt: number) {
    this.t = t;
    // 상자: 풍선 살랑 + 펑
    const c = this.chestObj;
    if (c?.root.visible) {
      c.balloons.rotation.z = Math.sin(t * 0.9) * 0.06;
      c.balloons.rotation.x = Math.sin(t * 0.7 + 1) * 0.05;
      if (this.chestPopT >= 0) {
        this.chestPopT += dt;
        const k = this.chestPopT;
        c.balloons.position.y = k * k * 6;
        c.root.scale.setScalar(Math.max(0.01, 1 - Math.max(0, k - 0.6) * 1.6));
        if (k > 1.3) { c.root.visible = false; this.chestPopT = -1; }
      }
    }
    // 링 빙글
    for (const r of this.rings) if (r.visible) r.rotation.z = Math.sin(t * 1.5) * 0.08;
    // 보스
    const b = this.bossObj, s = this.bossState;
    if (b && s) {
      const g = b.g;
      const end = s.endT >= 0 ? t - s.endT : -1;
      s.shake = Math.max(0, s.shake - dt);
      const bob = Math.sin(t * 1.3) * 0.5;
      const orbit = t * 0.25;
      const rx = s.x + Math.cos(orbit) * 3, rz = s.z + Math.sin(orbit) * 3;
      let y = s.y + b.lift + bob;
      if (end >= 0) {
        if (s.st === 'won') { y += end * end * 4; g.scale.setScalar(Math.max(0.01, 1 - end * 0.5)); }
        else { y -= end * 4; }
        if (end > 2.2) { this.root.remove(g, b.foam); this.bossObj = null; this.bossState = null; return; }
      }
      g.position.set(rx + (s.shake > 0 ? Math.sin(t * 90) * 0.25 : 0), y, rz);
      g.rotation.y = -orbit + Math.PI;
      g.rotation.z = Math.sin(t * 0.9) * 0.08;
      if (b.kind === 'oarfish') g.rotation.x = Math.sin(t * 1.1) * 0.12;
      if (b.tail) b.tail.rotation.y = Math.sin(t * 2.2) * 0.35;
      b.foam.position.set(rx, s.y + 0.05, rz);
      b.foam.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
    }
    // 불꽃
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.t += dt;
      const pos = sh.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const mat = sh.pts.material as THREE.PointsMaterial;
      if (sh.t < 0) { sh.pts.visible = false; continue; }
      sh.pts.visible = true;
      const RISE = 1.1;
      if (sh.t < RISE) {
        // 올라가는 불씨(한 점에 모아 꼬리처럼)
        const k = sh.t / RISE, yy = sh.oy + sh.apex * (1 - (1 - k) * (1 - k));
        for (let j = 0; j < SPARKS; j++) { arr[j * 3] = sh.ox; arr[j * 3 + 1] = yy - (j % 12) * 0.12; arr[j * 3 + 2] = sh.oz; }
        mat.size = 0.7; mat.opacity = 1;
      } else {
        const tt = sh.t - RISE;
        const drag = (1 - Math.exp(-tt * 2.2)) / 2.2;
        const cy = sh.oy + sh.apex;
        for (let j = 0; j < SPARKS; j++) {
          arr[j * 3] = sh.ox + sh.vel[j * 3] * drag;
          arr[j * 3 + 1] = cy + sh.vel[j * 3 + 1] * drag - 2.2 * tt * tt;
          arr[j * 3 + 2] = sh.oz + sh.vel[j * 3 + 2] * drag;
        }
        if (!sh.burst) { sh.burst = true; }
        mat.size = 2.6;
        mat.opacity = Math.max(0, 1 - tt / 1.9);
        if (tt > 1.9) { this.root.remove(sh.pts); sh.pts.geometry.dispose(); mat.dispose(); this.shells.splice(i, 1); continue; }
      }
      pos.needsUpdate = true;
    }
  }
}
