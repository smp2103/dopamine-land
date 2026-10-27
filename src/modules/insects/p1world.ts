// 곤충 P1 세계 연출(GDD 3.6 P1) — insects.ts 가 installP1 로 붙인다. 규칙(숫자)은 insects/p1.ts(순수).
// ① 반딧불 군무: 반딧불버섯섬 반딧불 늪(반딧불 정원 옆) 밤 30마리가 박자를 맞춰 깜빡 — 처음엔 제각각, 15초쯤 지나면 다 같이 반짝.
//    목요일(weekday-event 'firefly' 또는 env.weekday 3)엔 90마리 대축제 + 배너. 놓아준 반딧불 3마리마다 1마리씩 늘어난다(최대 +30).
// ② 놓아주기 'insects-release'(F): 밤(20시~) 물가·늪·하트 연못·안개 호수·반딧불 정원·군무 자리에서 가방 속 반딧불 한 묶음을 하늘로.
//    flags.insects.released += n, release {species: GDD id, n, where: 섬 id} — 부엉 교수 부탁(4.6.2 ③)은 story 가 이 이벤트를 센다.
// ③ 곤충 씨름 'insects-sumo'(E): 말랑섬 마을 서쪽 풀밭 그루터기 씨름판. 가방 속 가장 센 딱정벌레(★·크기·변이) 출전,
//    줄어드는 박자 링이 과녁에 닿을 때 E/Space — 딱 좋아!/좋아!/놓쳤다 → 밀어내면 승리. 코인 + 별(하루 5승까지), 네 판째마다 대장전.
// ④ 쇠똥구리 따라가기: 쿵쿵공룡섬 목장 · 모래시계섬 유적, 05~17시, 섬마다 하루 한 번. 다가가면 큰 공을 굴려 18~30m 앞 X 까지 안내
//    (뒤처지면 기다려 준다) → 'insects-dung'(E, 삽) 파기 → econ.openChest('silver', 'dung').
// ⑤ 난초사마귀: insects.ts 가 위장 중(1.5m 밖)인 사마귀를 여기 orchidPush 로 '꽃'으로 그린다 — 다가오면 고개를 갸웃.
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import type { Game } from '../../core/game';
import { ALT_PRIORITY } from '../../core/api';
import { applyCurve } from '../../core/curve';
import { onEvent } from '../../core/events';
import { INSECTS, type BugSpecies } from './data';
import { makeBug, bugScale, setWings, type BugMesh } from './model';
import * as P from './p1';

export interface P1Host {
  ctx: Ctx;
  g: Game;
  root: THREE.Group;
  /** 실제 id · GDD id → 종 */
  byId: (id: string) => BugSpecies | undefined;
}

export interface P1Api {
  /** 프레임 시작: 난초 꽃 인스턴스 비우기 */
  frameStart(): void;
  /** 위장 중인 난초사마귀 하나를 꽃으로(pos = 앉은 자리, s = 곤충 배율, ph = 개체 위상) */
  orchidPush(pos: THREE.Vector3, up: THREE.Vector3, s: number, t: number, ph: number, playerPos: THREE.Vector3): void;
  /** 프레임 끝: 꽃 인스턴스 올리기 */
  frameEnd(): void;
  /** window.__insects 에 섞을 디버그 */
  debug: Record<string, unknown>;
}

const TAU = Math.PI * 2;

// ───────────── 공용: 빛 점(가산 혼합) ─────────────
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.22, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class GlowPoints {
  readonly pts: THREE.Points;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array;
  private geo = new THREE.BufferGeometry();
  readonly mat: THREE.ShaderMaterial;
  n = 0;
  constructor(readonly max: number, tex: THREE.Texture) {
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { map: { value: tex }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute vec3 color; varying vec3 vC;
        uniform float uScale;
        void main() {
          vC = color;
          vec3 transformed = position;
          #include <project_vertex>
          gl_PointSize = size * uScale / max( 0.5, -mvPosition.z );
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec3 vC;
        void main() {
          vec4 t = texture2D( map, gl_PointCoord );
          gl_FragColor = vec4( vC * t.a, t.a );
        }`,
    });
    this.pts = new THREE.Points(this.geo, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 6;
  }
  push(x: number, y: number, z: number, c: THREE.Color, size: number, k: number) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r * k; this.col[i * 3 + 1] = c.g * k; this.col[i * 3 + 2] = c.b * k;
    this.size[i] = size;
  }
  flush(scale: number) {
    this.mat.uniforms.uScale.value = scale;
    this.geo.setDrawRange(0, this.n);
    for (const a of ['position', 'color', 'size']) (this.geo.attributes[a] as THREE.BufferAttribute).needsUpdate = true;
    this.pts.visible = this.n > 0;
  }
}

// ───────────── 난초 꽃(난초사마귀 위장) ─────────────
/** 호접란 모양: 꽃받침 3 + 넓은 꽃잎 2 + 입술꽃잎 + 노란 가운데 + 짧은 줄기·잎 — 정점 색 한 재질 */
function orchidGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pink = new THREE.Color('#ffc4d8'), white = new THREE.Color('#fff6fa'), deep = new THREE.Color('#ff8fb8'), gold = new THREE.Color('#ffd84a');
  const leafC = new THREE.Color('#7ccf6a'), stemC = new THREE.Color('#8fd36a');
  const paint = (g: THREE.BufferGeometry, fn: (p: THREE.Vector3) => THREE.Color) => {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const c = fn(v);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const petal = (len: number, wid: number, ang: number, tilt: number, inner: THREE.Color, outer: THREE.Color) => {
    // 납작한 타원 꽃잎(가운데에서 바깥으로 색이 번진다)
    const g = new THREE.SphereGeometry(1, 18, 10);
    g.scale(wid, 0.016, len);
    g.translate(0, 0, len * 0.92);
    paint(g, (p) => inner.clone().lerp(outer, Math.min(1, Math.max(0, p.z / (len * 1.8)))));
    g.rotateX(-tilt);
    g.rotateY(ang);
    return g;
  };
  // 꽃받침 3(위·좌하·우하) — 흰 빛이 도는 분홍
  for (const a of [Math.PI, Math.PI / 3, -Math.PI / 3]) parts.push(petal(0.15, 0.075, a, 0.25, white, pink));
  // 넓은 꽃잎 2(좌우)
  for (const a of [Math.PI * 0.62, -Math.PI * 0.62]) parts.push(petal(0.14, 0.12, a, 0.15, white, pink));
  // 입술꽃잎(앞, 진분홍)
  {
    const g = new THREE.SphereGeometry(1, 16, 10);
    g.scale(0.055, 0.035, 0.075);
    g.translate(0, 0.025, 0.085);
    paint(g, (p) => deep.clone().lerp(white, Math.max(0, p.y - 0.03) * 6));
    g.rotateX(-0.2);
    parts.push(g);
  }
  // 노란 가운데
  {
    const g = new THREE.SphereGeometry(0.035, 12, 8);
    g.translate(0, 0.045, 0.02);
    paint(g, () => gold);
    parts.push(g);
  }
  // 꽃 머리를 세운다(호접란처럼 얼굴이 옆을 보게: 위 꽃받침은 위로, 입술꽃잎은 아래로) + 줄기 끝으로
  for (const p of parts) { p.rotateX(1.1); p.translate(0, 0.1, 0); }
  // 줄기 + 잎 두 장(꽃 아래로)
  {
    const g = new THREE.CylinderGeometry(0.012, 0.018, 0.3, 8);
    g.translate(0, -0.06, 0);
    paint(g, () => stemC);
    parts.push(g);
    for (const s of [-1, 1]) {
      const l = new THREE.SphereGeometry(1, 14, 8);
      l.scale(0.05, 0.012, 0.13);
      l.translate(0, 0, 0.12);
      paint(l, (p) => leafC.clone().lerp(new THREE.Color('#b8f08a'), Math.abs(p.x) * 8));
      l.rotateX(0.5);
      l.rotateY(s * 1.3 + 0.3);
      l.translate(0, -0.19, 0);
      parts.push(l);
    }
  }
  // 합치기(색·위치·법선만)
  let n = 0;
  for (const p of parts) n += (p.index ? p.index.count : p.getAttribute('position').count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    const ng = p.index ? p.toNonIndexed() : p;
    ng.computeVertexNormals();
    const a = ng.getAttribute('position') as THREE.BufferAttribute;
    const b = ng.getAttribute('normal') as THREE.BufferAttribute;
    const c = ng.getAttribute('color') as THREE.BufferAttribute;
    pos.set(a.array as Float32Array, o * 3); nor.set(b.array as Float32Array, o * 3); col.set(c.array as Float32Array, o * 3);
    o += a.count;
    if (ng !== p) ng.dispose();
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

// ───────────── 씨름판 그루터기 ─────────────
function ringsTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f2cf96'; x.fillRect(0, 0, 256, 256);
  for (let r = 120; r > 4; r -= 11) {
    x.beginPath(); x.arc(128, 128, r, 0, TAU);
    x.strokeStyle = r % 22 ? 'rgba(201,143,90,0.55)' : 'rgba(176,118,72,0.7)';
    x.lineWidth = 3; x.stroke();
  }
  // 가운데 하트(씨름판 표시)
  x.fillStyle = 'rgba(255,143,184,0.85)';
  x.beginPath();
  x.moveTo(128, 150);
  x.bezierCurveTo(96, 126, 104, 96, 128, 112);
  x.bezierCurveTo(152, 96, 160, 126, 128, 150);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(text: string, sub: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff8e8';
  x.beginPath(); x.roundRect(6, 6, 244, 116, 26); x.fill();
  x.strokeStyle = '#d79a5e'; x.lineWidth = 8; x.stroke();
  x.fillStyle = '#4a3b2a';
  x.textAlign = 'center';
  x.font = '44px Jua, sans-serif';
  x.fillText(text, 128, 62);
  x.font = '24px Jua, sans-serif';
  x.fillStyle = '#c98f5a';
  x.fillText(sub, 128, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 판정 글씨(딱 좋아!/좋아!/놓쳤다…/필살!) */
function gradeTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const x = c.getContext('2d')!;
  x.textAlign = 'center';
  x.font = '58px Jua, sans-serif';
  x.lineWidth = 12; x.strokeStyle = '#fff8e8'; x.lineJoin = 'round';
  x.strokeText(text, 128, 68);
  x.fillStyle = color;
  x.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildArena(): { group: THREE.Group; ring: THREE.Mesh; target: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; top: number } {
  const group = new THREE.Group();
  group.name = 'insects-sumo-arena';
  const bark = new THREE.MeshStandardMaterial({ color: '#b07a4e', roughness: 0.85 });
  const top = new THREE.MeshStandardMaterial({ map: ringsTexture(), roughness: 0.7 });
  const H = 0.55;
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.18, H, 40, 3), [bark, top, bark]);
  // 나무껍질 울퉁불퉁(옆면만)
  {
    const p = stump.geometry.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const r = Math.hypot(v.x, v.z);
      if (r < 0.95 || Math.abs(v.y) > H / 2 - 0.001) continue;
      const a = Math.atan2(v.z, v.x);
      const k = 1 + Math.sin(a * 11) * 0.025 + Math.sin(a * 5 + v.y * 6) * 0.02;
      p.setXYZ(i, v.x * k, v.y, v.z * k);
    }
    stump.geometry.computeVertexNormals();
  }
  stump.position.y = H / 2;
  stump.castShadow = true; stump.receiveShadow = true;
  group.add(stump);
  // 뿌리 네 갈래
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    const root = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 4, 10), bark);
    root.position.set(Math.cos(a) * 1.15, 0.08, Math.sin(a) * 1.15);
    root.rotation.set(0, -a, Math.PI / 2 - 0.25);
    root.rotateY(Math.PI / 2);
    root.castShadow = true;
    group.add(root);
  }
  // 짚 줄(씨름판 테두리)
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 10, 64), new THREE.MeshStandardMaterial({ color: '#f0d58a', roughness: 0.9 }));
  rope.rotation.x = Math.PI / 2;
  rope.position.y = H + 0.03;
  group.add(rope);
  // 깃발 네 개(분홍·하늘·노랑·민트)
  const poleM = new THREE.MeshStandardMaterial({ color: '#e8c39a', roughness: 0.7 });
  ['#ff9fb8', '#8fd3f4', '#ffd84a', '#9ef0d2'].forEach((c, i) => {
    const a = (i / 4) * TAU + Math.PI / 4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.5, 8), poleM);
    pole.position.set(Math.cos(a) * 1.45, 0.75, Math.sin(a) * 1.45);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 3), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide }));
    flag.rotation.z = -Math.PI / 2;
    flag.position.set(0.18, 0.6, 0);
    pole.add(flag);
    pole.castShadow = true;
    group.add(pole);
  });
  // 팻말
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 8), poleM);
  post.position.y = 0.55;
  // 상자 판: 앞뒤 면 모두 글씨가 바로 읽히게(평면 양면은 뒤에서 거울 글씨가 된다)
  const face = new THREE.MeshStandardMaterial({ map: signTexture('곤충 씨름', '딱정벌레 모여라!'), roughness: 0.8 });
  const edge = new THREE.MeshStandardMaterial({ color: '#d79a5e', roughness: 0.8 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.05), [edge, edge, edge, edge, face, face]);
  board.castShadow = true;
  board.position.y = 1.1;
  sign.add(post, board);
  sign.position.set(-1.6, 0, 0.9);
  sign.rotation.y = 0.5;
  group.add(sign);
  // 박자 링(줄어드는 링) + 과녁 링
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ff8fc8', transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 48), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = H + 0.06;
  ring.visible = false;
  const target = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 8, 48), new THREE.MeshBasicMaterial({ color: '#fff8e8', transparent: true, opacity: 0.85, depthWrite: false }));
  target.rotation.x = Math.PI / 2;
  target.position.y = H + 0.05;
  target.visible = false;
  group.add(ring, target);
  return { group, ring, target, ringMat, top: H };
}

/** 은상자(쇠똥구리 보물 연출용 — 몸통 + 뚜껑) */
function buildChest(): { root: THREE.Group; lid: THREE.Object3D } {
  const root = new THREE.Group();
  const silver = new THREE.MeshPhysicalMaterial({ color: '#dfe6ee', metalness: 0.6, roughness: 0.3, clearcoat: 0.8 });
  const band = new THREE.MeshPhysicalMaterial({ color: '#8fd3f4', metalness: 0.3, roughness: 0.35, clearcoat: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.42, 2, 2, 2), silver);
  body.position.y = 0.18;
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.36, -0.21);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.6, 20, 1, false, 0, Math.PI), silver);
  lid.rotation.z = Math.PI / 2;
  lid.position.set(0, 0, 0.21);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.44), band);
  strap.position.y = 0.18;
  const lock = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshPhysicalMaterial({ color: '#ffd84a', metalness: 0.7, roughness: 0.3 }));
  lock.position.set(0, 0.3, 0.23);
  lidPivot.add(lid);
  root.add(body, strap, lock, lidPivot);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return { root, lid: lidPivot };
}

/** X 표시(흙 둔덕 + 분홍 X) */
function buildXMark(): THREE.Group {
  const g = new THREE.Group();
  const dirt = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 10, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#a8764f', roughness: 0.95 }));
  dirt.scale.set(1, 0.28, 1);
  dirt.receiveShadow = true;
  g.add(dirt);
  const xm = new THREE.MeshStandardMaterial({ color: '#ff6b8a', roughness: 0.5, emissive: '#ff6b8a', emissiveIntensity: 0.25 });
  for (const s of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.6, 4, 10), xm);
    bar.rotation.set(Math.PI / 2, 0, s * Math.PI / 4);
    bar.position.y = 0.21;
    g.add(bar);
  }
  return g;
}

/** 쇠똥 공(정점 색 얼룩) */
function buildDungBall(r: number): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(r, 4);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color('#b08a66'), b = new THREE.Color('#8f6a4a'), c = new THREE.Color('#c9a27a');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 17) * Math.sin(v.y * 15) * Math.sin(v.z * 13);
    const k = 1 + n * 0.05;
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
    const cc = n > 0.25 ? b : n < -0.4 ? c : a;
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.castShadow = true;
  return m;
}

/** 모델을 가장 긴 변이 len(m) 이 되게 */
function fitBug(sp: BugSpecies, len: number): BugMesh {
  const b = makeBug(sp, 1);
  b.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(b.root);
  const sz = box.getSize(new THREE.Vector3());
  const m = Math.max(sz.x, sz.y, sz.z) || 1;
  b.root.scale.setScalar(len / m);
  return b;
}

export function installP1(h: P1Host): P1Api {
  const { ctx, g, root, byId } = h;
  const island = ctx.island;
  const glowTex = glowTexture();
  const fx = new GlowPoints(640, glowTex);
  root.add(fx.pts);
  const p1Root = new THREE.Group();
  p1Root.name = 'insects-p1';
  root.add(p1Root);

  const F = () => P.insectFlags(g.state.flags);
  const env = () => {
    const e = g.env;
    const hour = typeof e?.hour === 'number' ? e.hour : 12;
    const tod = e?.tod ?? (hour >= 21 || hour < 5 ? 'night' : hour >= 17 ? 'sunset' : hour >= 5 && hour < 9 ? 'morning' : 'day');
    return { day: e?.day ?? 0, hour, tod: tod as string, weekday: e?.weekday ?? null };
  };
  const zoneAt = (x: number, z: number) => {
    try { return g.geo?.zoneAt(x, z) ?? null; } catch { return null; }
  };
  const dryOk = (x: number, z: number, maxSlope = 0.3) => {
    const s = island.surfaceAt(x, z);
    if (s.kind === 'sea' || s.kind === 'river' || s.kind === 'cliff' || s.kind === 'lava') return false;
    const y = island.heightAt(x, z);
    if (island.waterLevelAt(x, z) > y - 0.1) return false;
    const e = 0.8;
    const sl = Math.hypot(island.heightAt(x + e, z) - island.heightAt(x - e, z), island.heightAt(x, z + e) - island.heightAt(x, z - e)) / (2 * e);
    return sl <= maxSlope;
  };
  const scaleNow = () => ctx.renderer.domElement.height * 0.5;
  const toast = (s: string) => g.ui.toast(s);

  // ═════════════ ① 반딧불 군무 ═════════════
  let site: THREE.Vector3 | null = null;
  const findSite = (): THREE.Vector3 => {
    if (site) return site;
    const d = island.islandById('mushroom');
    const lm = g.geo?.landmarks?.find((l) => l.id === 'lm:mushroom:fireflygarden');
    const base = lm ? { x: lm.x, z: lm.z } : d ? { x: d.x, z: d.z + d.r * 0.55 } : { x: -1750, z: 1386 };
    let best: { x: number; z: number } | null = null;
    // 반딧불 정원 둘레에서 늪(swamp) 자리 — 가까운 고리부터
    outer: for (let r = 22; r <= 120; r += 7) {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU + r * 0.13;
        const x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r;
        const zi = zoneAt(x, z);
        if (zi && (zi.island !== 'mushroom' || zi.zone !== 'swamp')) continue;
        if (!zi && island.surfaceAt(x, z).island !== 'mushroom') continue;
        const s = island.surfaceAt(x, z);
        if (s.kind === 'sea' || s.kind === 'cliff') continue;
        best = { x, z };
        break outer;
      }
    }
    const p = best ?? base;
    const wl = island.waterLevelAt(p.x, p.z);
    site = new THREE.Vector3(p.x, Math.max(island.heightAt(p.x, p.z), Number.isFinite(wl) ? wl : -99), p.z);
    return site;
  };
  let festivalEvt = false;
  onEvent(g.state, 'weekday-event', (e) => { if (e.id === 'firefly') festivalEvt = !!e.active; });
  let flies: P.DanceFly[] = [];
  let fliesKey = '';
  let danceT0: number | null = null;
  /** 디버그: 다음 프레임에 박자 맞추기를 끝낸 상태로 */
  let syncReq = false;
  let lastDanceT = 0;
  let danceOnNow = false;
  let bannerDay = -1;
  const flyCol = new THREE.Color('#c8ff5a'), goldCol = new THREE.Color('#fff27a'), festCol = new THREE.Color('#9ef0d2');
  // 몸(깜빡이반딧불이 몸 하나를 인스턴스로 — 날개는 밤에 거의 안 보여 뺀다)
  const swarmSp = byId('b_firefly_swarm') ?? INSECTS.find((s) => s.kind === 'firefly')!;
  const flyTpl = makeBug(swarmSp, 1);
  const flyBodyScale = bugScale(swarmSp) * 0.8;
  const FLY_MAX = P.DANCE.festivalN + P.DANCE.releaseBonusMax;
  const flyIM = new THREE.InstancedMesh(flyTpl.body.geometry, flyTpl.body.material, FLY_MAX);
  flyIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flyIM.frustumCulled = false;
  flyIM.count = 0;
  applyCurve(flyIM);
  p1Root.add(flyIM);
  const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), ss = new THREE.Vector3(), ee = new THREE.Euler();
  const off = { x: 0, y: 0, z: 0 };
  /** 마지막 프레임 위상(디버그·테스트 확인용) */
  const lastPhasesBuf: number[] = new Array(256).fill(0);
  let lastPhasesN = 0;

  const updateDance = (t: number) => {
    flyIM.count = 0;
    lastPhasesN = 0;
    danceOnNow = false;
    if (g.world !== 'earth') { danceT0 = null; return; }
    const pp = g.player.pos;
    const d = island.islandById('mushroom');
    if (d && Math.hypot(pp.x - d.x, pp.z - d.z) > d.r + 300) { danceT0 = null; return; }
    const E = env();
    if (!P.danceTime(E.tod, E.hour)) { danceT0 = null; return; }
    const c = findSite();
    const dist = Math.hypot(pp.x - c.x, pp.z - c.z);
    if (dist > P.DANCE.showDist) { danceT0 = null; return; }
    danceOnNow = true;
    const fest = P.festivalOn(E.weekday, festivalEvt);
    const n = P.danceCount(fest, F().released);
    const key = `${n}:${fest ? 1 : 0}`;
    if (key !== fliesKey) {
      fliesKey = key;
      flies = P.danceFlies(n, fest ? P.DANCE.festivalRadius : P.DANCE.radius, ctx.rng(`insects:dance:${key}`));
      if (danceT0 !== null) danceT0 = t; // 마릿수가 바뀌면 처음부터 다시 맞춘다(새 친구가 박자를 배운다)
    }
    if (danceT0 === null) danceT0 = t;
    if (syncReq) { syncReq = false; danceT0 = t - 120; }
    if (fest && bannerDay !== E.day && dist < 60) {
      bannerDay = E.day;
      g.hud.banner({ text: '반딧불 대축제!', sub: '목요일 밤, 늪 위에서 반딧불이 다 같이 반짝반짝 ✨', icon: '✨', color: '#c8ff5a', ms: 4200 });
    }
    const age = t - danceT0;
    lastDanceT = t;
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      const ph = P.dancePhase(f.off0, age, t);
      if (lastPhasesN < lastPhasesBuf.length) lastPhasesBuf[lastPhasesN++] = ph;
      const k = P.flashOf(ph);
      P.flyOffset(f, t, fest, off);
      const x = c.x + off.x, z = c.z + off.z;
      const y = c.y + off.y;
      const col = fest ? (i % 5 === 0 ? goldCol : i % 3 === 0 ? festCol : flyCol) : i % 9 === 0 ? goldCol : flyCol;
      // 몸 빛(작고 진함) + 둘레 번짐(크고 옅음) — 멀리서도 '반짝!'이 읽히게
      fx.push(x, y, z, col, 0.7 + k * (fest ? 2.4 : 2.0), 0.3 + 3.4 * k);
      if (k > 0.3) fx.push(x, y, z, col, 2.2 + k * 3.2, 0.35 * k);
      if (dist < 45 && flyIM.count < FLY_MAX) {
        ee.set(Math.sin(t * 0.7 + f.ph) * 0.2, t * 0.35 * f.sp + f.ph + Math.PI / 2, 0, 'YXZ');
        qq.setFromEuler(ee);
        mm.compose(vv.set(x, y, z), qq, ss.setScalar(flyBodyScale));
        flyIM.setMatrixAt(flyIM.count++, mm);
      }
    }
    flyIM.instanceMatrix.needsUpdate = true;
  };

  // ═════════════ ② 반딧불 놓아주기 ═════════════
  interface Freed { x: number; y: number; z: number; t0: number; a: number; r: number; col: THREE.Color; toDance: boolean }
  const freed: Freed[] = [];
  let spotCacheT = -1, spotCache = false;
  const releaseSpot = (t: number): boolean => {
    if (t - spotCacheT < 0.3 && t >= spotCacheT) return spotCache;
    spotCacheT = t;
    const p = g.player.pos;
    let ok = false;
    const c = site ?? (island.islandAt(p.x, p.z)?.id === 'mushroom' ? findSite() : null);
    if (c && Math.hypot(p.x - c.x, p.z - c.z) < 30) ok = true;
    if (!ok) {
      const zi = zoneAt(p.x, p.z);
      if (zi && P.RELEASE_ZONES.has(zi.zone)) ok = true;
    }
    if (!ok) {
      const s = island.surfaceAt(p.x, p.z);
      // 강·연못 바로 옆(4m 안) 물가
      for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
        const k = island.surfaceAt(p.x + dx, p.z + dz).kind;
        if (k === 'river' || (s.kind !== 'sea' && Number.isFinite(island.waterLevelAt(p.x + dx, p.z + dz)) && island.waterLevelAt(p.x + dx, p.z + dz) > island.heightAt(p.x + dx, p.z + dz) && k !== 'sea')) { ok = true; break; }
      }
    }
    if (!ok) {
      const lm = g.geo?.landmarks?.find((l) => l.id.endsWith(':fireflygarden'));
      if (lm && Math.hypot(p.x - lm.x, p.z - lm.z) < lm.r + 12) ok = true;
    }
    spotCache = ok;
    return ok;
  };
  const nightNow = () => { const E = env(); return P.danceTime(E.tod, E.hour) || E.tod === 'night'; };

  const doRelease = (force = false): P.ReleaseResult | null => {
    const p = g.player.pos;
    const isl = g.world !== 'earth' ? 'space' : (zoneAt(p.x, p.z)?.island ?? island.islandAt(p.x, p.z)?.id ?? 'sea');
    if (!force && !nightNow()) { toast('반딧불은 밤에 놓아줘야 반짝반짝 빛나요 🌙'); return null; }
    const r = P.releaseFireflies(g.state as unknown as P.ReleaseSink, byId as (id: string) => P.P1Species | undefined, isl);
    if (!r) { toast('가방에 놓아줄 반딧불이 없어요'); return null; }
    g.player.act('cheer', 1.4);
    const c = site;
    const toDance = !!c && Math.hypot(p.x - c.x, p.z - c.z) < 30 && danceOnNow;
    const sp = byId(r.species);
    const col = new THREE.Color((sp?.colors?.[2]) ?? '#c8ff5a');
    const n = Math.min(40, r.n * 3);
    const rnd = ctx.rng(`insects:release:${r.total}`);
    for (let i = 0; i < n; i++) {
      freed.push({ x: p.x, y: p.y + 1.1, z: p.z, t0: g.time + i * 0.06, a: rnd() * TAU, r: 0.4 + rnd() * 1.2, col, toDance });
    }
    if (freed.length > 200) freed.splice(0, freed.length - 200);
    toast(`반딧불 ${r.n}마리가 밤하늘로 훨훨~ ✨ (지금까지 ${r.total}마리)`);
    return r;
  };

  g.addProvider('insects-release', (p) => {
    if (g.world !== 'earth' || p.mode !== 'ground' || p.mounted || sumo) return null;
    if (!nightNow()) return null;
    const pick = P.pickRelease(g.state.bag, byId as (id: string) => P.P1Species | undefined);
    if (!pick) return null;
    if (!releaseSpot(g.time)) return null;
    return { label: `반딧불 ${pick.n}마리 놓아주기 ✨`, dist: 2.4, key: 'KeyF', priority: ALT_PRIORITY.other, use: () => { doRelease(); } };
  });

  const updateFreed = (t: number) => {
    const c = site;
    for (let i = freed.length - 1; i >= 0; i--) {
      const f = freed[i];
      const age = t - f.t0;
      if (age < 0) continue;
      const life = 6;
      if (age > life || age < -1) { freed.splice(i, 1); continue; }
      const k = age / life;
      let x = f.x + Math.cos(f.a + age * 1.3) * f.r * (0.4 + k * 2);
      let z = f.z + Math.sin(f.a + age * 1.3) * f.r * (0.4 + k * 2);
      let y = f.y + age * 1.3 + Math.sin(age * 3 + f.a) * 0.2;
      if (f.toDance && c) {
        // 군무 쪽으로 스르르 합류
        const m = THREE.MathUtils.smoothstep(k, 0.15, 0.9);
        x += (c.x + Math.cos(f.a) * 3 - x) * m;
        z += (c.z + Math.sin(f.a) * 3 - z) * m;
        y += (c.y + 1.5 - y) * m;
      }
      const flash = 0.5 + 0.5 * Math.sin(age * 7 + f.a * 3);
      const fade = Math.min(1, age * 3) * (1 - THREE.MathUtils.smoothstep(k, 0.7, 1));
      fx.push(x, y, z, f.col, 0.5 + flash * 0.6, (0.6 + flash * 2) * fade);
    }
  };

  // ═════════════ ③ 곤충 씨름 ═════════════
  const arena = buildArena();
  let arenaAt: THREE.Vector3 | null = null;
  let arenaPhys: { remove(): void } | null = null;
  const findArena = (): THREE.Vector3 => {
    if (arenaAt) return arenaAt;
    // 마을 서쪽 풀밭(강 건너 반도) — 평평한 마른 땅 중 기준점에서 가까운 곳
    const base = { x: -24, z: 3 };
    let pick: { x: number; z: number } | null = null;
    for (let r = 0; r <= 16 && !pick; r += 2) {
      for (let i = 0; i < (r ? 12 : 1); i++) {
        const a = (i / 12) * TAU;
        const x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r;
        if (!dryOk(x, z, 0.12)) continue;
        if (island.surfaceAt(x, z).coastDist < 5) continue;
        // 그루터기 둘레(1.6 m)도 마른 땅
        let fine = true;
        for (let j = 0; j < 8 && fine; j++) {
          const b = (j / 8) * TAU;
          if (!dryOk(x + Math.cos(b) * 1.8, z + Math.sin(b) * 1.8, 0.2)) fine = false;
        }
        if (fine) { pick = { x, z }; break; }
      }
    }
    const p = pick ?? base;
    arenaAt = new THREE.Vector3(p.x, island.heightAt(p.x, p.z) - 0.04, p.z);
    return arenaAt;
  };
  {
    const a = findArena();
    arena.group.position.copy(a);
    arena.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) applyCurve(o as THREE.Mesh); });
    p1Root.add(arena.group);
    try {
      arenaPhys = g.physics.addStatic({ kind: 'cylinder', halfH: arena.top / 2, r: 1.1 }, { x: a.x, y: a.y + arena.top / 2, z: a.z }, undefined, 'insects-sumo');
    } catch (e) { console.error('[insects sumo physics]', e); }
  }
  void arenaPhys;

  const mkGrade = (text: string, color: string) => new THREE.SpriteMaterial({ map: gradeTexture(text, color), transparent: true, depthWrite: false, depthTest: false });
  const GRADE_MAT: Record<string, THREE.SpriteMaterial> = {
    perfect: mkGrade('딱 좋아!', '#ff6fa8'), good: mkGrade('좋아!', '#4fb3e8'), miss: mkGrade('놓쳤다…', '#a8a0b8'), lift: mkGrade('필살 들어올리기!', '#ffb02e'),
  };
  const gradeSprite = new THREE.Sprite(GRADE_MAT.perfect);
  gradeSprite.scale.set(1.6, 0.6, 1);
  gradeSprite.visible = false;
  gradeSprite.renderOrder = 20;
  arena.group.add(gradeSprite);
  let gradeT = -10;
  const showGrade = (k: string, t: number) => { gradeSprite.material = GRADE_MAT[k]; gradeT = t; };

  interface SumoLive {
    bout: P.Bout; t0: number; phase: 'intro' | 'fight' | 'end'; tEnd: number;
    mine: BugMesh; opp: BugMesh; myKey: string; oppSp: BugSpecies; champion: boolean;
    tapped: Map<number, P.TapGrade>; rnd: () => number; axis: THREE.Vector3; startPos: THREE.Vector3;
    rewarded: boolean; mineBob: number; oppBob: number;
  }
  let sumo: SumoLive | null = null;
  let camBack: { yaw: number; pitch: number; dist: number } | null = null;

  const bestCm = (id: string) => { const r = g.state.dex[id]; return r && r.best > 0 ? r.best : null; };
  const sumoPool = () => INSECTS.filter((s) => P.canSumo(s as unknown as P.P1Species));

  const startSumo = (force = false): boolean => {
    if (sumo) return false;
    const a = findArena();
    const me = P.bestFighter(g.state.bag, byId as (id: string) => P.P1Species | undefined, bestCm);
    if (!me) { toast('씨름할 딱정벌레가 없어요! 장수풍뎅이·사슴벌레를 잡아 와요 🪲'); return false; }
    const E = env();
    const sf = P.sumoFlags(F(), E.day);
    const champion = P.isChampionBout(sf.bouts);
    const rnd = ctx.rng(`insects:sumo:${E.day}:${sf.bouts}`);
    const o = P.sumoOpponent(sumoPool() as unknown as P.P1Species[], me.fighter, sf.wins, rnd, champion);
    if (!o) return false;
    const mySp = byId(me.sp.id) as BugSpecies;
    const oppSp = byId(o.sp.id) as BugSpecies;
    const p = g.player;
    if (!force && Math.hypot(p.pos.x - a.x, p.pos.z - a.z) > 4) return false;
    // 그루터기를 바라보게 + 두 선수는 화면 좌우로(밀기가 잘 보이게)
    const to = new THREE.Vector3(a.x - p.pos.x, 0, a.z - p.pos.z);
    if (to.lengthSq() < 0.5) { to.set(0, 0, -1); }
    to.normalize();
    if (force) p.teleport(a.x - to.x * 2.6, a.z - to.z * 2.6);
    p.yaw = Math.atan2(-to.x, -to.z);
    const axis = new THREE.Vector3(-to.z, 0, to.x); // 플레이어 기준 오른쪽
    p.lock('insects-sumo');
    p.act('cheer', 1.2);
    // 카메라: 어깨 너머 비스듬히 + 조금 가까이(씨름판이 화면 가운데에 크게) — 끝나면 돌려 놓는다
    camBack = { yaw: g.cam.yaw, pitch: g.cam.pitch, dist: g.cam.dist };
    if (g.cam.style !== 'cozy') { g.cam.yaw = p.yaw + 0.55; g.cam.pitch = 0.42; g.cam.dist = 5.2; }
    const lenOf = (f: P.Fighter) => 0.82 * Math.min(1.3, Math.max(0.8, 0.85 + (f.rarity - 1) * 0.07)) * f.sizeK;
    const mine = fitBug(mySp, lenOf(me.fighter));
    const opp = fitBug(oppSp, lenOf(o.fighter) * (o.champion ? 1.15 : 1));
    for (const b of [mine, opp]) { b.root.traverse((x) => { if ((x as THREE.Mesh).isMesh) applyCurve(x as THREE.Mesh); }); arena.group.add(b.root); }
    sumo = {
      bout: P.newBout(me.fighter, o.fighter), t0: g.time + 1.8, phase: 'intro', tEnd: 0, mine, opp, myKey: me.key, oppSp, champion: o.champion,
      tapped: new Map(), rnd, axis, startPos: p.pos.clone(), rewarded: false, mineBob: 0, oppBob: 0,
    };
    arena.ring.visible = arena.target.visible = false;
    g.hud.banner({
      text: o.champion ? '대장전! 곤충 씨름' : '곤충 씨름!', sub: `${mySp.name} vs ${oppSp.name} — 링이 닿을 때 E!`,
      icon: '🪲', color: o.champion ? '#ffb02e' : '#ff9fb8', ms: 2200,
    });
    g.audio?.sfx('ui-open');
    return true;
  };

  const endSumo = () => {
    if (!sumo) return;
    for (const b of [sumo.mine, sumo.opp]) b.root.removeFromParent();
    arena.ring.visible = arena.target.visible = false;
    gradeSprite.visible = false;
    g.hud.gauge('insects-sumo', { label: '', value: 0.5, color: '#ff9fb8', show: false });
    g.player.unlock('insects-sumo');
    if (camBack && g.cam.style !== 'cozy') { g.cam.yaw = camBack.yaw; g.cam.pitch = camBack.pitch; g.cam.dist = camBack.dist; }
    camBack = null;
    sumo = null;
  };

  const finishSumo = (t: number) => {
    const s = sumo!;
    if (s.rewarded) return;
    s.rewarded = true;
    const E = env();
    const f = F();
    const sf = P.sumoFlags(f, E.day);
    const res = s.bout.result ?? 'draw';
    const rw = P.sumoReward(res, s.bout.opp.rarity, sf.streak, sf.wins, s.champion);
    sf.bouts++;
    if (res === 'win') { sf.wins++; sf.total++; sf.streak++; sf.best = Math.max(sf.best, sf.streak); }
    else if (res === 'lose') sf.streak = 0;
    if (rw.coins > 0) g.state.addCoins(rw.coins, 'sumo');
    if (rw.stars > 0) {
      try { g.econ?.addStars?.(rw.stars, 'sumo'); } catch (e) { console.error('[insects sumo stars]', e); }
    }
    g.state.save();
    s.phase = 'end';
    s.tEnd = t;
    const myName = byId(s.bout.me.id)?.name ?? '내 곤충';
    if (res === 'win') {
      g.hud.banner({ text: s.champion ? '대장을 이겼다! 🏆' : '이겼다! 🏆', sub: `${myName} 최고! 코인 +${rw.coins}${rw.stars ? ` · 별 +${rw.stars}` : ''}${sf.streak > 1 ? ` · ${sf.streak}연승!` : ''}`, icon: '🏆', color: '#ffd84a', ms: 2600 });
      g.player.act('cheer', 2);
      g.audio?.sfx('achievement');
    } else if (res === 'draw') {
      g.hud.banner({ text: '비겼다!', sub: `막상막하! 코인 +${rw.coins}`, icon: '🤝', color: '#8fd3f4', ms: 2200 });
    } else {
      g.hud.banner({ text: '아쉽다…', sub: `다음엔 박자에 딱 맞춰 보자! 참가상 코인 +${rw.coins}`, icon: '💦', color: '#c9b6f2', ms: 2400 });
    }
  };

  /** 씨름 탭(E/Space) — 다음 박자에 판정을 적는다 */
  const sumoTap = (t: number, gradeOverride?: P.TapGrade): P.TapGrade | null => {
    const s = sumo;
    if (!s || s.phase !== 'fight') return null;
    const nb = P.nearestBeat(t, s.t0);
    const k = Math.max(nb.k, s.bout.beat + 1);
    if (s.tapped.has(k)) return null;
    const dt = t - (s.t0 + k * P.SUMO.beat);
    const gr = gradeOverride ?? P.tapGrade(dt);
    s.tapped.set(k, gr);
    showGrade(gr, t);
    g.audio?.sfx(gr === 'perfect' ? 'pick' : gr === 'good' ? 'ui-click' : 'net-miss', { vol: 0.8 });
    return gr;
  };

  g.addProvider('insects-sumo', (p) => {
    if (sumo || g.world !== 'earth' || p.mode !== 'ground' || p.mounted) return null;
    const a = findArena();
    const d = Math.hypot(p.pos.x - a.x, p.pos.z - a.z);
    if (d > 3) return null;
    const me = P.bestFighter(g.state.bag, byId as (id: string) => P.P1Species | undefined, bestCm);
    const label = me ? `곤충 씨름 — ${byId(me.sp.id)?.name ?? '딱정벌레'} 출전!` : '곤충 씨름판 (딱정벌레가 필요해요)';
    return { label, dist: d, use: () => { startSumo(); } };
  });

  const fighterAt = (s: SumoLive, side: -1 | 1, out: THREE.Vector3) => {
    const a = findArena();
    const shift = s.bout.pos * 0.5;
    out.copy(a).addScaledVector(s.axis, side * 0.3 + shift);
    out.y = a.y + arena.top + 0.01;
    return out;
  };
  const fpos = new THREE.Vector3(), sumoDir = new THREE.Vector3();
  const updateSumo = (t: number) => {
    const s = sumo;
    if (!s) return;
    const a = findArena();
    if (g.world !== 'earth' || Math.hypot(g.player.pos.x - a.x, g.player.pos.z - a.z) > 8) { endSumo(); return; }
    const inp = g.input;
    if (s.phase === 'intro' && t >= s.t0) s.phase = 'fight';
    if (s.phase === 'fight') {
      if (inp.hit('KeyE') || inp.hit('Space')) sumoTap(t);
      // 박자 판정 시간이 지난 박자를 차례로 처리
      while (!s.bout.over && t >= s.t0 + (s.bout.beat + 1) * P.SUMO.beat + P.SUMO.good) {
        const k = s.bout.beat + 1;
        const gr = s.tapped.get(k) ?? 'miss';
        if (!s.tapped.has(k)) showGrade('miss', t);
        s.bout = P.sumoStep(s.bout, gr, s.rnd);
        if (s.bout.last?.lift) showGrade('lift', t);
        if (s.bout.last && s.bout.last.my >= s.bout.last.their) s.mineBob = t; else s.oppBob = t;
        g.audio?.sfx('rock-hit', { x: a.x, z: a.z, vol: 0.35, pitch: 1.4 });
      }
      if (s.bout.over) finishSumo(t);
      g.hud.gauge('insects-sumo', {
        label: `${s.bout.beat}/${P.SUMO.beats} 박자 — 링이 닿을 때 E!`, value: (s.bout.pos + 1) / 2,
        color: s.bout.pos >= 0 ? '#ff9fb8' : '#8fd3f4', show: true,
      });
    }
    // 박자 링: 다음 박자까지 2.2 → 1 로 줄어든다
    const fighting = s.phase === 'fight' && !s.bout.over;
    arena.ring.visible = arena.target.visible = fighting;
    if (fighting) {
      const next = s.t0 + (s.bout.beat + 1) * P.SUMO.beat;
      const k = THREE.MathUtils.clamp(1 - (next - t) / P.SUMO.beat, 0, 1.3);
      const sc = 2.4 - 1.4 * Math.min(1, k);
      arena.ring.scale.setScalar(sc);
      arena.ringMat.color.set(Math.abs(next - t) <= P.SUMO.perfect ? '#ffd84a' : '#ff8fc8');
      arena.ringMat.opacity = 0.35 + 0.6 * Math.min(1, k);
    }
    // 판정 글씨(0.6초)
    const ga = t - gradeT;
    gradeSprite.visible = ga >= 0 && ga < 0.6;
    if (gradeSprite.visible) {
      gradeSprite.position.set(0, arena.top + 1.2 + ga * 0.5, 0);
      gradeSprite.material.opacity = 1 - Math.max(0, ga - 0.35) / 0.25;
      const pop = 1 + Math.max(0, 0.15 - ga) * 2;
      gradeSprite.scale.set(1.6 * pop, 0.6 * pop, 1);
    }
    // 두 선수: 서로 마주 보고, 밀 때 앞으로 콩
    const yawToward = (dir: THREE.Vector3) => Math.atan2(dir.x, dir.z);
    for (const side of [-1, 1] as const) {
      const b = side < 0 ? s.mine : s.opp;
      fighterAt(s, side, fpos);
      const bobT = t - (side < 0 ? s.mineBob : s.oppBob);
      const lunge = bobT >= 0 && bobT < 0.25 ? Math.sin((bobT / 0.25) * Math.PI) * 0.08 : 0;
      fpos.addScaledVector(s.axis, -side * lunge);
      let tilt = 0, drop = 0;
      if (s.phase === 'end') {
        const e = t - s.tEnd;
        const lost = (s.bout.result === 'win' && side > 0) || (s.bout.result === 'lose' && side < 0);
        const won = (s.bout.result === 'win' && side < 0) || (s.bout.result === 'lose' && side > 0);
        if (lost) {
          // 씨름판 밖으로 데굴(뒤집혀 떨어진다)
          const k = Math.min(1, e / 0.8);
          fpos.addScaledVector(s.axis, side * k * 0.9);
          drop = k > 0.55 ? -(k - 0.55) * 1.2 : 0;
          tilt = k * Math.PI;
        } else if (won) {
          fpos.y += Math.abs(Math.sin(e * 7)) * 0.12;
        }
      } else if (s.phase === 'intro') {
        // 등장: 위에서 톡
        const e = Math.min(1, Math.max(0, 1 - (s.t0 - t) / 1.8) * 2.2);
        fpos.y += (1 - e) * 0.8;
      }
      fpos.y += drop;
      const dir = sumoDir.copy(s.axis).multiplyScalar(-side);
      b.root.position.copy(fpos).sub(findArena());
      b.root.rotation.set(0, yawToward(dir), side * tilt * 0.5, 'YXZ');
      if (tilt) b.root.rotateZ(tilt);
      if (b.model.wing) setWings(b, b.model.wing.rest);
      // 숨쉬기
      b.body.scale.y = 1 + Math.sin(t * Math.PI + side) * 0.025;
    }
    if (s.phase === 'end' && t - s.tEnd > 2.4) endSumo();
  };

  // ═════════════ ④ 쇠똥구리 따라가기 ═════════════
  interface DungLive {
    island: string; day: number; path: P.DungPath; st: P.DungState; group: THREE.Group; beetle: BugMesh; ball: THREE.Mesh;
    x: THREE.Group; arrivedT: number; dug: boolean; told: Set<string>; roll: number; chest: { root: THREE.Group; lid: THREE.Object3D } | null; dugT: number;
  }
  let dung: DungLive | null = null;
  const dungFailed = new Set<string>();
  const ballGeoR = P.DUNG.ball;
  const shovelOk = () => { try { return g.econ?.isUnlocked?.('tool:shovel') ?? true; } catch { return true; } };

  const disposeDung = () => {
    if (!dung) return;
    dung.group.removeFromParent();
    dung.ball.geometry.dispose();
    dung = null;
  };

  /** 쇠똥구리 자리 고르기용 세상 정보 — 섬 구역 칸은 섬마다 한 번만 훑어 캐시 */
  const dungWorld: P.DungWorld = {
    islandById: (id) => island.islandById(id),
    islandAt: (x, z) => island.islandAt(x, z),
    zoneAt: (x, z) => zoneAt(x, z),
    dryOk: (x, z) => dryOk(x, z, 0.32),
    get landmarks() { return g.geo?.landmarks ?? []; },
  };
  const zoneScans = new Map<string, P.ZoneScan>();
  /** 훑는 중인 섬 구역(프레임마다 조금씩 — 한 번에 하면 0.5초 멈춤) */
  let scanning: P.ZoneScan | null = null;
  const scanOf = (isl: string): P.ZoneScan => {
    let sc = zoneScans.get(isl);
    if (!sc) {
      const lm = dungWorld.landmarks.find((l) => l.island === isl && (isl === 'dino' ? /tinohill/.test(l.id) : /ruin|pyramid/.test(l.id)));
      const d = island.islandById(isl);
      sc = P.newZoneScan(dungWorld, isl, P.DUNG_SITES[isl].zone, lm ?? d ?? { x: 0, z: 0 });
      zoneScans.set(isl, sc);
    }
    return sc;
  };
  /** now = true 면 남은 칸을 한 번에(디버그 dung()) */
  const planFor = (isl: string, day: number, now = false): P.DungPath | null | 'pending' => {
    if (!P.DUNG_SITES[isl]) return null;
    const cells = () => {
      const sc = scanOf(isl);
      if (!sc.done && now) P.stepZoneScan(sc, dungWorld, sc.n);
      if (sc.done) return sc.cells;
      scanning = sc;
      return null;
    };
    return P.planDungSite(dungWorld, isl, ctx.rng(`insects:dung:${isl}:${day}`), cells);
  };

  const spawnDung = (isl: string, day: number, path: P.DungPath) => {
    disposeDung();
    const siteDef = P.DUNG_SITES[isl];
    const base = byId(siteDef.gdd) ?? INSECTS.find((s) => s.kind === 'dungbeetle')!;
    // 공은 따로 굴리니까 몸만(쇠똥구리 모양 그대로, 공 부품 없이)
    const guide = { ...base, id: `${base.id}:guide`, kind: 'beetle' as const, look: { ...base.look, ball: undefined } } as BugSpecies;
    const beetle = fitBug(guide, 0.55);
    const ball = buildDungBall(ballGeoR);
    const group = new THREE.Group();
    group.name = 'insects-dung';
    const xm = buildXMark();
    xm.visible = false;
    group.add(beetle.root, ball, xm);
    group.traverse((o) => { if ((o as THREE.Mesh).isMesh) applyCurve(o as THREE.Mesh); });
    p1Root.add(group);
    dung = { island: isl, day, path, st: { k: 0, phase: 'wait' }, group, beetle, ball, x: xm, arrivedT: -1, dug: false, told: new Set(), roll: 0, chest: null, dugT: -1 };
  };

  let dungCheckAt = 0;
  const checkDung = (t: number) => {
    if (t < dungCheckAt && t > dungCheckAt - 5) return;
    dungCheckAt = t + 1;
    if (g.world !== 'earth') { disposeDung(); return; }
    const p = g.player.pos;
    const E = env();
    const isl = island.islandAt(p.x, p.z)?.id ?? null;
    if (dung && (dung.day !== E.day || (isl !== dung.island && Math.hypot(p.x - dung.path.sx, p.z - dung.path.sz) > 200))) {
      // 다른 날·다른 섬: 판 건 남기고(상자 연출 끝) 치운다
      if (!dung.chest) disposeDung();
    }
    if (dung || !isl || !P.DUNG_SITES[isl]) return;
    if (!P.dungHour(E.hour) || P.dungDoneToday(F(), isl, E.day)) return;
    const key = `${isl}:${E.day}`;
    if (dungFailed.has(key)) return;
    const path = planFor(isl, E.day);
    if (path === 'pending') { dungCheckAt = t + 0.25; return; } // 구역 훑는 중 — 끝나면 다시
    if (!path) { dungFailed.add(key); return; }
    spawnDung(isl, E.day, path);
  };

  const dungDig = (force = false): boolean => {
    const d = dung;
    if (!d || d.dug || (d.st.phase !== 'arrived' && !force)) return false;
    if (!shovelOk()) { toast('삽이 있어야 팔 수 있어요! 너굴 상점에 가 보자 🛒'); return false; }
    d.dug = true;
    d.dugT = g.time;
    g.player.act('dig', 1.3);
    g.audio?.sfx('dig');
    const E = env();
    P.markDung(F(), d.island, E.day);
    g.state.save();
    let opened = false;
    try {
      const r = g.econ?.openChest?.('silver', 'dung');
      opened = !!r;
    } catch (e) { console.error('[insects dung openChest]', e); }
    if (!opened) g.state.addCoins(300, 'dung');
    d.chest = buildChest();
    d.chest.root.position.set(d.path.ex, island.heightAt(d.path.ex, d.path.ez) - 0.4, d.path.ez);
    d.chest.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) applyCurve(o as THREE.Mesh); });
    d.group.add(d.chest.root);
    g.audio?.sfx('chest-open-silver');
    toast('쇠똥구리가 숨겨 둔 은상자를 찾았다! ✨');
    return true;
  };

  g.addProvider('insects-dung', (p) => {
    const d = dung;
    if (!d || d.dug || d.st.phase !== 'arrived' || p.mounted || p.mode !== 'ground') return null;
    const dist = Math.hypot(p.pos.x - d.path.ex, p.pos.z - d.path.ez);
    if (dist > P.DUNG.digR) return null;
    return { label: shovelOk() ? '쇠똥구리 보물 파기' : '🔒 삽 필요', dist, use: () => { dungDig(); } };
  });

  const bq = new THREE.Quaternion(), bAxis = new THREE.Vector3(), dungDir = new THREE.Vector3();
  let lastDungT = 0;
  const updateDung = (t: number, dt: number) => {
    if (scanning && P.stepZoneScan(scanning, dungWorld, 24)) scanning = null; // 한 프레임 24칸(≈1ms)
    checkDung(t);
    const d = dung;
    if (!d) return;
    const p = g.player.pos;
    const step = Math.max(0, Math.min(0.1, dt || (t - lastDungT)));
    lastDungT = t;
    const cur = P.dungPoint(d.path, d.st.k);
    const pd = Math.hypot(p.x - cur.x, p.z - cur.z);
    const prev = d.st;
    if (!d.dug) d.st = P.dungStep(d.st, d.path, pd, step);
    if (prev.phase === 'wait' && d.st.phase === 'roll' && !d.told.has('roll')) {
      d.told.add('roll');
      toast('쇠똥구리가 공을 데굴데굴~ 어디로 가는 걸까? 따라가 보자! 🪲');
    }
    if (d.st.phase === 'pause' && !d.told.has('pause')) { d.told.add('pause'); toast('쇠똥구리가 기다려 주고 있어요! 얼른 따라와~'); }
    if (d.st.phase === 'arrived' && d.arrivedT < 0) {
      d.arrivedT = t;
      toast('여기다! 공 아래에 뭔가 묻혀 있대요 — E 로 파 보자! ⛏️');
      g.audio?.sfx('pick');
    }
    // 길 위 자리·방향
    const k = d.st.k;
    const at = P.dungPoint(d.path, k);
    const ahead = P.dungPoint(d.path, Math.min(1, k + 0.02));
    const dir = dungDir.set(ahead.x - at.x, 0, ahead.z - at.z);
    if (dir.lengthSq() < 1e-8) dir.set(d.path.ex - d.path.sx, 0, d.path.ez - d.path.sz);
    dir.normalize();
    const moved = (k - (d.roll / Math.max(1, d.path.len))) * d.path.len;
    d.roll = k * d.path.len;
    const gy = island.heightAt(at.x, at.z);
    // 공: 굴러간 거리만큼 돈다
    bAxis.set(dir.z, 0, -dir.x);
    if (moved > 0) { bq.setFromAxisAngle(bAxis, moved / ballGeoR); d.ball.quaternion.premultiply(bq); }
    let ballSink = 0;
    if (d.arrivedT >= 0) ballSink = Math.min(1, (t - d.arrivedT) / 1.2);
    d.ball.position.set(at.x, gy + ballGeoR * (1 - ballSink * 1.1), at.z);
    d.ball.visible = ballSink < 1;
    d.ball.scale.setScalar(1 - ballSink * 0.4);
    // 쇠똥구리: 공 뒤에서 밀기(굴릴 때 엉덩이 들썩) → 도착하면 폴짝 → 3초 뒤 땅속으로
    const bx = at.x - dir.x * (ballGeoR + 0.22), bz = at.z - dir.z * (ballGeoR + 0.22);
    let by = island.heightAt(bx, bz);
    const rolling = d.st.phase === 'roll';
    if (rolling) by += Math.abs(Math.sin(t * 10)) * 0.03;
    let sc = 1;
    if (d.arrivedT >= 0) {
      const e = t - d.arrivedT;
      if (e < 2.2) by += Math.abs(Math.sin(e * 6)) * 0.18 * (1 - e / 2.2);
      else sc = Math.max(0.001, 1 - (e - 2.2) / 0.8);
    } else if (d.st.phase === 'wait' || d.st.phase === 'pause') {
      // 제자리에서 공을 톡톡(같이 가자는 듯)
      by += Math.max(0, Math.sin(t * 4)) * 0.06;
    }
    d.beetle.root.position.set(bx, by, bz);
    d.beetle.root.rotation.set(rolling ? -0.25 : 0, Math.atan2(dir.x, dir.z), 0, 'YXZ');
    const base = d.beetle.root.userData.baseScale ?? (d.beetle.root.userData.baseScale = d.beetle.root.scale.x);
    d.beetle.root.scale.setScalar(base * sc);
    d.beetle.root.visible = sc > 0.01;
    // X 표시: 도착하면 흙 둔덕 + X 가 쏙
    d.x.visible = d.arrivedT >= 0 && !d.dug;
    if (d.x.visible) {
      const e = Math.min(1, (t - d.arrivedT) / 0.6);
      d.x.position.set(d.path.ex, island.heightAt(d.path.ex, d.path.ez) + 0.01, d.path.ez);
      d.x.scale.setScalar(0.3 + 0.7 * e + Math.sin(t * 3) * 0.03);
      const pk = 0.5 + 0.5 * Math.sin(t * 4);
      fx.push(d.path.ex, d.x.position.y + 0.6 + pk * 0.2, d.path.ez, goldCol, 0.6 + pk * 0.4, 0.8 + pk);
    }
    // 판 뒤: 은상자가 쑥 올라와 뚜껑이 열린다 → 3초 뒤 치운다
    if (d.chest) {
      const e = t - d.dugT;
      const gy2 = island.heightAt(d.path.ex, d.path.ez);
      d.chest.root.position.y = gy2 - 0.4 + Math.min(1, e / 0.6) * 0.42;
      d.chest.lid.rotation.x = -Math.min(1, Math.max(0, (e - 0.7) / 0.4)) * 1.9;
      if (e > 0.8 && e < 2.6) for (let i = 0; i < 6; i++) {
        const a = e * 2 + i * 1.05;
        fx.push(d.path.ex + Math.cos(a) * 0.4, gy2 + 0.5 + ((e * 0.8 + i * 0.17) % 1) * 1.2, d.path.ez + Math.sin(a) * 0.4, i % 2 ? goldCol : festCol, 0.6, 1.6);
      }
      if (e > 3.2) disposeDung();
    }
  };

  // ═════════════ ⑤ 난초사마귀 꽃 ═════════════
  const orchidGeo = orchidGeometry();
  const orchidMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color('#ffffff'), emissive: '#ffb8d0', emissiveIntensity: 0.08 });
  const ORCH_MAX = 24;
  const orchidIM = new THREE.InstancedMesh(orchidGeo, orchidMat, ORCH_MAX);
  orchidIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  orchidIM.frustumCulled = false;
  orchidIM.count = 0;
  orchidIM.castShadow = false;
  orchidIM.receiveShadow = true;
  applyCurve(orchidIM);
  p1Root.add(orchidIM);
  const oq = new THREE.Quaternion(), oq2 = new THREE.Quaternion(), oe = new THREE.Euler(), ov = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  const api: P1Api = {
    frameStart() { orchidIM.count = 0; },
    orchidPush(pos, up, s, t, ph, playerPos) {
      if (orchidIM.count >= ORCH_MAX) return;
      // 바람에 살랑 + 가까이 오면(3 m) 플레이어 쪽으로 고개를 살짝 갸웃 — 눈치 빠른 사람만 아는 힌트
      const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
      const d = Math.hypot(dx, dz);
      const peek = d < 3 ? (1 - d / 3) : 0;
      const yaw = Math.atan2(dx, dz) * peek + ph * 1.7 + Math.sin(t * 0.6 + ph) * 0.25 * (1 - peek);
      oe.set(Math.sin(t * 1.3 + ph) * 0.06 - peek * 0.2, yaw, Math.sin(t * 0.9 + ph * 2) * 0.08 + peek * Math.sin(t * 5) * 0.06, 'YXZ');
      oq.setFromEuler(oe);
      oq2.setFromUnitVectors(UP, up);
      oq.premultiply(oq2);
      const k = s * 2.1;
      ov.copy(pos).addScaledVector(up, 0.25 * k);
      mm.compose(ov, oq, ss.setScalar(k));
      orchidIM.setMatrixAt(orchidIM.count++, mm);
    },
    frameEnd() {
      if (orchidIM.count) orchidIM.instanceMatrix.needsUpdate = true;
      orchidIM.visible = orchidIM.count > 0;
    },
    debug: {},
  };

  g.onUpdate((t, dt) => {
    fx.n = 0;
    try { updateDance(t); } catch (e) { console.error('[insects dance]', e); }
    updateFreed(t);
    // 씨름판은 가까이(160 m)에서만 그린다(멀리선 draw call 아끼기)
    if (arenaAt) arena.group.visible = g.world === 'earth' && Math.hypot(g.player.pos.x - arenaAt.x, g.player.pos.z - arenaAt.z) < 160;
    try { updateSumo(t); } catch (e) { console.error('[insects sumo]', e); endSumo(); }
    try { updateDung(t, dt); } catch (e) { console.error('[insects dung]', e); }
    fx.flush(scaleNow());
  });
  g.onWorld((w) => {
    if (w !== 'earth') { endSumo(); disposeDung(); freed.length = 0; }
  });

  // ───────────── 디버그 ─────────────
  api.debug = {
    /** 군무 상태: 자리·마릿수·대축제·위상 흩어짐(0 = 완전히 같이 깜빡) */
    dance: () => {
      const c = findSite();
      const E = env();
      const fest = P.festivalOn(E.weekday, festivalEvt);
      const lastPhases = lastPhasesBuf.slice(0, lastPhasesN); // 디버그 때만 복사
      return {
        site: { x: +c.x.toFixed(1), y: +c.y.toFixed(1), z: +c.z.toFixed(1) }, active: danceOnNow, festival: fest,
        n: P.danceCount(fest, F().released), drawn: lastPhases.length, spread: +P.phaseSpread(lastPhases).toFixed(4),
        age: danceT0 !== null ? +(lastDanceT - danceT0).toFixed(2) : null, syncReq,
        flash: lastPhases.length ? +(lastPhases.reduce((a, p) => a + P.flashOf(p), 0) / lastPhases.length).toFixed(3) : 0,
      };
    },
    /** 박자 맞추기를 건너뛴다(이미 다 같이 깜빡이는 상태로) */
    danceSync: () => { syncReq = true; return true; },
    /** 군무 앞으로 가서 밤 10시로(+ festival=true 면 대축제) */
    danceGo: (festival = false, back = 9) => {
      const c = findSite();
      g.env?.setHour?.(22);
      if (festival) festivalEvt = true;
      g.player.teleport(c.x - back * 0.6, c.z + back * 0.8);
      const to = new THREE.Vector3(c.x - g.player.pos.x, 0, c.z - g.player.pos.z).normalize();
      g.player.yaw = Math.atan2(-to.x, -to.z);
      g.cam.yaw = g.player.yaw;
      return { x: c.x, z: c.z };
    },
    festival: (on = true) => { festivalEvt = !!on; return festivalEvt; },
    /** 놓아주기(자리·시간 무시) */
    release: () => doRelease(true),
    released: () => F().released,
    /** 씨름판 앞에서 씨름 시작 */
    sumo: () => startSumo(true),
    sumoGo: (ang = 0) => {
      const a = findArena();
      g.player.teleport(a.x + Math.sin(ang) * 2.6, a.z + Math.cos(ang) * 2.6);
      g.player.yaw = ang;
      g.cam.yaw = ang;
      return { x: a.x, z: a.z };
    },
    sumoTap: (grade?: P.TapGrade) => sumoTap(g.time, grade),
    sumoState: () => (sumo ? { phase: sumo.phase, pos: +sumo.bout.pos.toFixed(3), beat: sumo.bout.beat, result: sumo.bout.result, me: sumo.bout.me.name, opp: sumo.bout.opp.name, champion: sumo.champion } : null),
    /** 쇠똥구리: 그 섬 오늘 길을 정하고 출발점 옆으로 */
    dung: (isl = 'dino') => {
      const E = env();
      if (!P.dungHour(E.hour)) g.env?.setHour?.(8);
      const path = planFor(isl, env().day, true);
      if (!path || path === 'pending') return null;
      const f = F();
      if (f.dung) delete f.dung[isl];
      spawnDung(isl, env().day, path);
      g.player.teleport(path.sx - (path.ex - path.sx) / path.len * 4, path.sz - (path.ez - path.sz) / path.len * 4);
      const to = new THREE.Vector3(path.ex - path.sx, 0, path.ez - path.sz).normalize();
      g.player.yaw = Math.atan2(-to.x, -to.z);
      g.cam.yaw = g.player.yaw;
      return { ...path };
    },
    /** 쇠똥구리 길 끝까지 바로(도착) */
    dungSkip: () => { if (!dung) return null; dung.st = { k: 1, phase: 'arrived' }; return dung.path; },
    dungDig: () => dungDig(true),
    dungState: () => (dung ? { island: dung.island, k: +dung.st.k.toFixed(3), phase: dung.st.phase, dug: dung.dug, path: dung.path } : null),
    arena: () => findArena().clone(),
  };
  return api;
}
