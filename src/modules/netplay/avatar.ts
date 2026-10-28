// 친구 아바타 — 내 캐릭터와 같은 모델(characters/player.ts 의 buildPlayer)을 친구가 고른 모습(look)으로 세우고,
// 머리 위 이름표 + 말풍선(채팅·이모트) + 발밑 둥근 그림자를 붙인다. 자세는 InterpBuffer 가 준 PoseOut 으로.
// 모습: look 이 오면 그대로, 옛 친구(옷·머리 색만 보내는 통신)는 색에 가장 가까운 기본 모습(friendLook).
// 드로콜: buildPlayer 는 이미 관절마다 메시 하나(≈ 20 드로)라 mergeStatic 은 남은 정지 메시만 마저 합친다.
// 25 m 넘게 멀면 먼 모습(6 드로). 몸 그림자는 끄고 발밑 둥근 그림자 하나로.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildPlayer, PLAYER_POSES, cleanLook, decodeLook, lookFromColors, sameLook, type PlayerRig, type PlayerLook } from '../characters/player';
import { blobShadow } from '../../core/art';
import { applyCurve } from '../../core/curve';
import type { Colors } from './protocol';
import type { PoseOut } from './interp';

const UI_TEXT = '#4a3b2a';
const UI_BG = '#fff8e8';
/** 이만큼 멀면 먼 모습(관절마다 메시 하나 = 6 드로) */
const FAR_M = 25;

/**
 * 친구 모습: 새 통신은 look('L1.' 글자 또는 객체)을, 옛 친구(옷·머리 색만)는 가장 가까운 옷 색·머리색을 고른 기본 모습.
 * (look 이 이상하거나 더 새 버전이면 색으로 짐작한다)
 */
export function friendLook(colors: Colors | null | undefined, look?: unknown): PlayerLook {
  const l = typeof look === 'string' ? decodeLook(look) : look && typeof look === 'object' ? cleanLook(look) : null;
  return l ?? lookFromColors(colors ?? null);
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

/** mergeStatic 이 만든 합친 메시 목록 */
function mergedOf(rig: PlayerRig): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.name === 'netplay:merged') out.push(m); });
  return out;
}
/** 아직 rig 안에 붙어 있는지(모습을 바꾸면 옛 몸은 통째로 떨어져 나간다 · 도구 상자는 그대로 남는다) */
function attached(rig: PlayerRig, o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === rig.root) return true;
  return false;
}
/**
 * mergeStatic 이 새로 만든 합친 기하는 rig 가 모르므로 여기서 버린다.
 * list 를 주면 그중 rig 에서 떨어져 나간 것만(모습 바꾼 뒤), 안 주면 전부(친구가 떠날 때). 돌려준 값 = 버린 수.
 */
export function disposeMerged(rig: PlayerRig, list?: THREE.Mesh[]): number {
  const all = !list;
  let n = 0;
  for (const m of list ?? mergedOf(rig)) {
    if (!all && attached(rig, m)) continue;
    m.geometry.dispose();
    m.removeFromParent();
    n++;
  }
  return n;
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
  private look: PlayerLook;
  private far = false;
  private colorsKey = '';
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

  constructor(name: string, colors: Colors, look?: unknown) {
    this.root.name = 'netplay:friend';
    this.look = friendLook(colors, look);
    this.rig = buildPlayer(this.look);
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
    // 이름표는 늘 그려지므로, 그릴 때 카메라 거리로 먼 모습을 고른다(한 프레임 늦어도 티 안 남)
    const wp = new THREE.Vector3();
    this.tag.onBeforeRender = (_r, _s, cam) => {
      this.root.getWorldPosition(wp);
      const far = cam.position.distanceTo(wp) > FAR_M;
      if (far !== this.far) { this.far = far; this.rig.setLod?.(far ? 'far' : 'near'); }
    };
    this.setProfile(name, colors, look);
    applyCurve(this.root);
    this.root.visible = false;
  }

  /** 이름·모습 바꾸기(look 없이 색만 바뀌면 색으로 짐작한 모습) */
  setProfile(name: string, colors: Colors, look?: unknown) {
    const ck = `${colors.tee}|${colors.hair}`;
    if (look !== undefined || ck !== this.colorsKey) {
      const next = look !== undefined ? friendLook(colors, look) : lookFromColors(colors, this.look);
      this.colorsKey = ck;
      if (!sameLook(next, this.look)) {
        this.look = next;
        const prev = mergedOf(this.rig);
        this.rig.setLook?.(next);
        disposeMerged(this.rig, prev);
        mergeStatic(this.rig);
        this.rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
        if (this.far) this.rig.setLod?.('far');
      }
    }
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

  /** 지금 친구 모습 */
  get currentLook(): PlayerLook { return { ...this.look }; }

  dispose() {
    disposeMerged(this.rig);
    this.rig.dispose?.();
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const s = o as THREE.Sprite;
      if (s.isSprite) { (s.material as THREE.SpriteMaterial).map?.dispose(); (s.material as THREE.Material).dispose(); }
    });
  }
}
