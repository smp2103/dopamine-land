// 친구 아바타 — characters/player.ts 의 buildPlayer(허용된 import)를 친구가 고른 옷·머리 색으로 물들이고,
// 머리 위 이름표 + 말풍선(채팅·이모트) + 발밑 둥근 그림자를 붙인다. 자세는 InterpBuffer 가 준 PoseOut 으로.
// 드로콜: buildPlayer 는 메시가 80개쯤이라, 움직이지 않는 메시(애니메이션이 건드리지 않는 것)를 같은 부모·같은 재질끼리 합친다(mergeStatic).
// 몸 그림자는 끄고 발밑 둥근 그림자 하나로 — 이름표 1 + 말풍선 1 + 그림자 1 을 더해도 모듈 예산(40) 안.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildPlayer, PLAYER_POSES, type PlayerRig } from '../characters/player';
import { blobShadow } from '../../core/art';
import { applyCurve } from '../../core/curve';
import type { Colors } from './protocol';
import type { PoseOut } from './interp';

/** buildPlayer 기본 색(물들일 때 이 색 재질을 찾는다) */
const BASE_TEE = 'ff8e86';
const BASE_HAIR = '784a2e';
const UI_TEXT = '#4a3b2a';
const UI_BG = '#fff8e8';

/** 가슴 하트 티셔츠 그림(characters/tex 의 teeTexture 와 같은 모양 — 그 파일은 import 하지 않는다) */
function teeTex(base: string): THREE.CanvasTexture {
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, n, n);
  const cx = n * 0.5, cy = n * 0.42, s = n * 0.05;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(cx, cy + s * 1.1);
  g.bezierCurveTo(cx - s * 1.6, cy, cx - s * 0.9, cy - s * 1.2, cx, cy - s * 0.4);
  g.bezierCurveTo(cx + s * 0.9, cy - s * 1.2, cx + s * 1.6, cy, cx, cy + s * 1.1);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

type PMat = THREE.MeshStandardMaterial & { sheen?: number; map: THREE.Texture | null; emissiveMap: THREE.Texture | null };

/** 리그의 옷·머리 재질을 새 색으로(재질은 복제해서 — 내 플레이어와 나눠 쓰지 않게) */
export function tintRig(root: THREE.Object3D, colors: Colors): () => void {
  const swap = new Map<THREE.Material, THREE.Material>();
  const owned: Array<THREE.Material | THREE.Texture> = [];
  const tee = new THREE.Color(colors.tee), hair = new THREE.Color(colors.hair), baseHair = new THREE.Color(`#${BASE_HAIR}`);
  const make = (m: THREE.Material): THREE.Material => {
    const hit = swap.get(m);
    if (hit) return hit;
    const pm = m as PMat;
    let out: THREE.Material = m;
    if (pm.color && !pm.vertexColors && pm.color.getHexString() === BASE_TEE) {
      // 소매(무늬 없는 옷감)
      const c = pm.clone() as PMat;
      c.color.copy(tee); c.emissive?.copy(tee);
      out = c;
    } else if (pm.map && pm.emissiveMap && pm.sheen === 1 && pm.color?.getHexString() === 'ffffff' && pm.map instanceof THREE.CanvasTexture && !pm.vertexColors && pm.roughness === 0.9) {
      // 하트 티셔츠(그림 무늬 옷감)
      const c = pm.clone() as PMat;
      const tx = teeTex(colors.tee);
      c.map = tx; c.emissiveMap = tx;
      owned.push(tx);
      out = c;
    } else if (pm.color && !pm.vertexColors && pm.color.getHexString() === BASE_HAIR) {
      const c = pm.clone() as PMat;
      c.color.copy(hair); c.emissive?.copy(hair);
      out = c;
    } else if (pm.vertexColors && pm.color?.getHexString() === 'ffffff' && pm.emissive?.getHexString() === BASE_HAIR) {
      // 정점색 머리(앞머리 결) — 곱하는 색으로 비율만 바꾼다
      const c = pm.clone() as PMat;
      c.color.setRGB(hair.r / Math.max(0.02, baseHair.r), hair.g / Math.max(0.02, baseHair.g), hair.b / Math.max(0.02, baseHair.b));
      c.emissive.copy(hair);
      out = c;
    }
    if (out !== m) owned.push(out);
    swap.set(m, out);
    return out;
  };
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    me.material = Array.isArray(me.material) ? me.material.map(make) : make(me.material);
  });
  return () => { for (const x of owned) x.dispose(); };
}

/** 메시 하나의 '움직임 지문'(자리·회전·크기·보임·재질) */
const sig = (m: THREE.Mesh) => {
  const r = (v: number) => Math.round(v * 1e4);
  const p = m.position, q = m.quaternion, s = m.scale;
  const mat = Array.isArray(m.material) ? m.material.map((x) => x.uuid).join(',') : m.material.uuid;
  return `${r(p.x)},${r(p.y)},${r(p.z)}|${r(q.x)},${r(q.y)},${r(q.z)},${r(q.w)}|${r(s.x)},${r(s.y)},${r(s.z)}|${m.visible}|${mat}`;
};

/**
 * 애니메이션이 건드리지 않는 메시만 같은 부모·같은 재질끼리 하나로 합친다.
 * 어떤 메시가 움직이는지는 모든 포즈·모드·시각으로 animate 를 돌려 보고 지문이 바뀌는지로 가린다(바뀐 건 그대로 둔다).
 * 돌려준 값 = 합친 뒤 메시 수.
 */
export function mergeStatic(rig: PlayerRig): number {
  const meshes: THREE.Mesh[] = [];
  rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) meshes.push(m); });
  const before = new Map(meshes.map((m) => [m, sig(m)]));
  const moving = new Set<THREE.Mesh>();
  const modes = ['ground', 'air', 'glide', 'swim', 'dive', 'mounted'] as const;
  const check = () => { for (const m of meshes) if (!moving.has(m) && sig(m) !== before.get(m)) moving.add(m); };
  for (const t of [0, 0.21, 0.77, 1.43, 2.9, 3.61, 5.3]) {
    for (const mode of modes) { rig.animate({ speed: mode === 'ground' ? 5 : 1, mode, action: null, t, dt: 0.016 }); check(); }
    rig.animate({ speed: 0, mode: 'ground', action: null, t, dt: 0.016 }); check();
    for (const a of PLAYER_POSES) { rig.animate({ speed: 0, mode: 'ground', action: a, t, dt: 0.016 }); check(); }
  }
  rig.animate({ speed: 0, mode: 'ground', action: null, t: 0, dt: 0.016 });
  // 부모별·재질별 묶기(자식이 있는 메시·여러 재질 메시·움직이는 메시는 빼고)
  const groups = new Map<string, THREE.Mesh[]>();
  for (const m of meshes) {
    if (moving.has(m) || m.children.length || Array.isArray(m.material) || !m.parent || !m.visible || m.matrixAutoUpdate === false) continue;
    const g = m.geometry;
    const key = `${m.parent.uuid}|${m.material.uuid}|${g.index ? 'i' : 'n'}|${Object.keys(g.attributes).sort().join(',')}`;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  let removed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const parent = list[0].parent!;
    const geos = list.map((m) => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const one = new THREE.Mesh(merged, list[0].material);
    one.name = 'netplay:merged';
    one.renderOrder = list[0].renderOrder;
    parent.add(one);
    for (const m of list) parent.remove(m);
    removed += list.length - 1;
  }
  return meshes.length - removed;
}

/** 둥근 라벨 그림(이름표·말풍선) → 스프라이트 */
function labelCanvas(text: string, o: { size: number; color: string; bg: string; border: string; tail?: boolean; maxW?: number }) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `${o.size}px Jua, system-ui, sans-serif`;
  g.font = font;
  // 너무 길면 두 줄로
  const maxW = o.maxW ?? 520;
  const words = Array.from(text);
  const lines: string[] = [];
  let cur = '';
  for (const ch of words) {
    if (g.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width)) + o.size * 1.4);
  const lh = o.size * 1.25;
  const tail = o.tail ? o.size * 0.6 : 0;
  const h = Math.ceil(lines.length * lh + o.size * 0.9 + tail);
  c.width = w + 8; c.height = h + 8;
  const g2 = c.getContext('2d')!;
  g2.font = font;
  const r = Math.min(o.size * 0.9, (h - tail) / 2);
  const x = 4, y = 4, bw = w, bh = h - tail;
  g2.beginPath();
  g2.moveTo(x + r, y);
  g2.arcTo(x + bw, y, x + bw, y + bh, r);
  g2.arcTo(x + bw, y + bh, x, y + bh, r);
  if (tail) { g2.lineTo(x + bw / 2 + tail * 0.7, y + bh); g2.lineTo(x + bw / 2, y + bh + tail); g2.lineTo(x + bw / 2 - tail * 0.7, y + bh); }
  g2.arcTo(x, y + bh, x, y, r);
  g2.arcTo(x, y, x + bw, y, r);
  g2.closePath();
  g2.fillStyle = o.bg;
  g2.fill();
  g2.lineWidth = Math.max(3, o.size * 0.14);
  g2.strokeStyle = o.border;
  g2.stroke();
  g2.fillStyle = o.color;
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  lines.forEach((l, i) => g2.fillText(l, x + bw / 2, y + o.size * 0.45 + lh * (i + 0.5)));
  return c;
}

function spriteFrom(c: HTMLCanvasElement, worldH: number, old?: THREE.Sprite): THREE.Sprite {
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.minFilter = THREE.LinearFilter;
  if (old) {
    const m = old.material as THREE.SpriteMaterial;
    m.map?.dispose();
    m.map = tx;
    m.needsUpdate = true;
    old.scale.set(worldH * (c.width / c.height), worldH, 1);
    return old;
  }
  const mat = new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, fog: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(worldH * (c.width / c.height), worldH, 1);
  s.renderOrder = 20;
  s.center.set(0.5, 0);
  return s;
}

/** 원격 친구 한 명 */
export class RemoteAvatar {
  readonly root = new THREE.Group();
  private rig: PlayerRig;
  private untint: () => void = () => {};
  private tag: THREE.Sprite;
  private bubble: THREE.Sprite | null = null;
  private bubbleUntil = 0;
  private bubbleBorn = 0;
  private shadow: THREE.Mesh;
  private poseUntil = 0;
  private posePose: string | null = null;
  private lastT = 0;
  private yaw = 0;
  name = '';
  /** 합친 뒤 몸 메시 수(디버그) */
  meshCount = 0;

  constructor(name: string, colors: Colors) {
    this.root.name = 'netplay:friend';
    this.rig = buildPlayer();
    this.rig.root.name = 'netplay:friend-rig';
    this.meshCount = mergeStatic(this.rig);
    // 몸 그림자는 끄고 발밑 둥근 그림자로(그림자 패스 드로콜을 아낀다)
    this.rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
    this.root.add(this.rig.root);
    this.shadow = blobShadow(0.32);
    this.shadow.position.y = 0.02;
    this.root.add(this.shadow);
    this.tag = spriteFrom(labelCanvas(' ', { size: 40, color: UI_TEXT, bg: UI_BG, border: '#ffffff' }), 0.24);
    this.tag.position.y = 1.62;
    this.root.add(this.tag);
    this.setProfile(name, colors);
    applyCurve(this.root);
    this.root.visible = false;
  }

  setProfile(name: string, colors: Colors) {
    this.untint();
    this.untint = tintRig(this.rig.root, colors);
    if (name !== this.name) {
      this.name = name;
      spriteFrom(labelCanvas(`♥ ${name}`, { size: 40, color: UI_TEXT, bg: UI_BG, border: colors.tee }), 0.24, this.tag);
    }
  }

  /** 말풍선(글 또는 이모지) — sec 초 보인다 */
  say(text: string, t: number, sec = 4, big = false) {
    const c = labelCanvas(text, { size: big ? 84 : 42, color: UI_TEXT, bg: '#ffffff', border: '#ffd6e2', tail: true, maxW: 460 });
    const h = big ? 0.5 : Math.max(0.34, 0.3 * (c.height / 80));
    if (!this.bubble) {
      this.bubble = spriteFrom(c, h);
      this.root.add(this.bubble);
    } else spriteFrom(c, h, this.bubble);
    this.bubble.visible = true;
    this.bubble.userData.h = h;
    this.bubble.position.y = 1.98;
    this.bubbleBorn = t;
    this.bubbleUntil = t + sec;
  }
  /** 이모트 포즈를 sec 초 잡는다 */
  pose(name: string | null, t: number, sec: number) { this.posePose = name; this.poseUntil = name ? t + sec : 0; }

  /** 매 프레임. out=null 이면 숨긴다 */
  update(out: PoseOut | null, t: number, dt: number, show: boolean) {
    const vis = !!out && show;
    this.root.visible = vis;
    if (!vis || !out) { this.lastT = t; return; }
    this.root.position.set(out.x, out.y, out.z);
    this.yaw = out.yaw;
    this.rig.root.rotation.y = this.yaw + Math.PI; // 코어 Player 와 같은 방향 약속
    this.shadow.visible = out.m === 'ground' || out.m === 'mounted';
    const action = t < this.poseUntil ? this.posePose : out.a;
    const speed = out.s > 0.05 ? out.s : out.speed;
    this.rig.animate({ speed, mode: out.m as 'ground', action, t, dt: Math.max(0, Math.min(0.1, dt || t - this.lastT)) });
    if (this.bubble?.visible) {
      if (t >= this.bubbleUntil) this.bubble.visible = false;
      else {
        // 톡 튀어나오기 + 끝에 살짝 사라지기
        const k = Math.min(1, (t - this.bubbleBorn) / 0.18);
        const pop = 0.6 + 0.4 * (1 - (1 - k) * (1 - k)) + Math.sin(k * Math.PI) * 0.08;
        this.bubble.position.y = 1.98 + Math.sin(t * 3) * 0.02;
        (this.bubble.material as THREE.SpriteMaterial).opacity = Math.min(1, (this.bubbleUntil - t) / 0.4);
        const m = this.bubble.material as THREE.SpriteMaterial;
        const img = m.map?.image as HTMLCanvasElement | undefined;
        if (img) {
          const h = this.bubble.userData.h as number;
          this.bubble.scale.set(h * pop * (img.width / img.height), h * pop, 1);
        }
      }
    }
    this.lastT = t;
  }

  dispose() {
    this.untint();
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const s = o as THREE.Sprite;
      if (s.isSprite) { (s.material as THREE.SpriteMaterial).map?.dispose(); (s.material as THREE.Material).dispose(); }
    });
  }
}
