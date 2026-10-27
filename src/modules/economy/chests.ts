// 보물상자 화면(GDD 5.4) — 등급별 통통한 상자(청크 InstancedMesh, 등급당 한 번에 그리기)·흔들림 힌트·빛기둥·여는 연출·미믹 상자게.
// 규칙(내용물·확률·자리)은 loot.ts, 실제 지급은 economy.ts. 여기는 모양과 움직임만.
// 흔들림 힌트: 가까이 가면 상자가 등급만큼 흔들린다(1번 나무 / 2번 은 / 3번 + 빛기둥 = 금 이상). E 로 열 때도 같은 횟수만큼 흔들고 연다.
// 미믹은 흔들다 눈을 뜨고 다리를 내밀어 옆걸음으로 도망간다(MimicRunner).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Game } from '../../core/game';
import { addEyes, blobShadow, type EyeSet } from '../../core/art';
import { rbox, paint, grad } from '../props/kit';
import { TIERS, type ChestTier } from './data';
import { SHAKE_SEC, type ChestSpot } from './loot';

/** 상자 크기 배율(멀리서도 보이게) */
const S = 1.6;
export const CHEST_W = 0.84 * S, CHEST_H = 0.42 * S, CHEST_D = 0.56 * S;
/** 흔들림 힌트를 보여 주는 거리(m) */
export const HINT_R = 7.5;
/** 힌트 한 바퀴(초) — 흔들고 쉬고 */
const HINT_PERIOD = 3.2;

// ───────────── 지오메트리·재질(공유) ─────────────

type Geo = THREE.BufferGeometry;
/** 합치기 전 정리: 인덱스 풀고 position·normal·color 만 */
function prep(g: Geo): Geo {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}
function merge(parts: Geo[]): Geo {
  const g = mergeGeometries(parts.map(prep), false)!;
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData.shared = true;
  return g;
}
/** 무지개 몸통: x 방향으로 파스텔 무지개 */
function rainbowPaint(g: Geo, w: number): Geo {
  const p = g.attributes.position, out = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getX(i) / w + 0.5));
    c.setHSL(0.95 - t * 0.78, 0.85, 0.78 + 0.06 * Math.sin(p.getY(i) * 6));
    out.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}
/** 우주 몸통: 아래 남보라 → 위 라벤더 + 작은 별 점 */
function spacePaint(g: Geo, c0: string, c1: string): Geo {
  grad(g, c0, c1, 0.9);
  const col = g.attributes.color as THREE.BufferAttribute, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const h = Math.sin(p.getX(i) * 91.7 + p.getY(i) * 47.3 + p.getZ(i) * 13.1) * 43758.5453;
    if (h - Math.floor(h) > 0.985) col.setXYZ(i, 1, 0.97, 0.8);
  }
  return g;
}

interface TierGeo { closed: Geo; base: Geo; lid: Geo }
const geoCache = new Map<ChestTier, TierGeo>();
/** 등급별 상자 모양: closed(한 덩어리, 청크용) · base + lid(뚜껑 경첩이 원점 — 여는 연출·미믹용) */
export function tierGeometry(tier: ChestTier): TierGeo {
  const hit = geoCache.get(tier);
  if (hit) return hit;
  const T = TIERS[tier];
  const W = CHEST_W, H = CHEST_H, D = CHEST_D;
  const colorBody = (g: Geo, lift = 0) => {
    if (tier === 'rainbow') return rainbowPaint(g, W);
    const top = new THREE.Color(T.body[1]).offsetHSL(0, 0, lift).getStyle();
    if (tier === 'space') return spacePaint(g, T.body[0], top);
    return grad(g, T.body[0], top, 0.8);
  };
  const body = rbox(W, H, D, 0.07 * S, 3);
  body.translate(0, H / 2, 0);
  colorBody(body);
  // 뚜껑: 둥근 반원통(통통)
  const lid = new THREE.CylinderGeometry(D / 2, D / 2, W * 0.985, 20, 1, false, 0, Math.PI);
  lid.rotateZ(Math.PI / 2);
  lid.scale(1, 0.72, 1);
  lid.translate(0, H, 0);
  colorBody(lid, 0.04);
  const band = (x: number) => {
    const b = rbox(0.11 * S, H + 0.02, D + 0.03, 0.03, 2); b.translate(x, H / 2, 0); paint(b, T.trim);
    const a = new THREE.CylinderGeometry(D / 2 + 0.02, D / 2 + 0.02, 0.11 * S, 16, 1, true, 0, Math.PI);
    a.rotateZ(Math.PI / 2); a.scale(1, 0.74, 1); a.translate(x, H, 0); paint(a, T.trim);
    return [b, a];
  };
  const [b1, a1] = band(-W / 2 + 0.16 * S);
  const [b2, a2] = band(W / 2 - 0.16 * S);
  const lock = rbox(0.17 * S, 0.2 * S, 0.07 * S, 0.035 * S, 2); lock.translate(0, H * 0.95, D / 2 + 0.03); paint(lock, T.trim);
  const gem = tier === 'rainbow' || tier === 'space'
    ? (() => { const s = new THREE.OctahedronGeometry(0.06 * S, 1); s.scale(1, 1.15, 0.55); return s; })()
    : new THREE.SphereGeometry(0.045 * S, 12, 8);
  gem.translate(0, H * 0.98, D / 2 + 0.075); paint(gem, T.gem);
  const baseParts = [body, b1, b2, lock, gem];
  const lidParts = [lid, a1, a2];
  const closed = merge([...baseParts.map((g) => g.clone()), ...lidParts.map((g) => g.clone())]);
  const base = merge(baseParts);
  // 뚜껑은 뒤쪽 위 모서리(경첩)가 원점이 되게
  const lidG = merge(lidParts.map((g) => g.clone().translate(0, -H, D / 2)));
  const tg = { closed, base, lid: lidG };
  geoCache.set(tier, tg);
  return tg;
}

let chestMat: THREE.MeshPhysicalMaterial | null = null;
/** 상자 재질 하나(정점색) — 반들반들 코팅 */
export function chestMaterial(): THREE.MeshPhysicalMaterial {
  if (chestMat) return chestMat;
  chestMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.48, metalness: 0.06, clearcoat: 0.6, clearcoatRoughness: 0.3,
    sheen: 0.35, sheenColor: new THREE.Color('#fff0dc'), sheenRoughness: 0.6,
  });
  chestMat.userData.shared = true;
  return chestMat;
}

// ───────────── 흔들림(순수) ─────────────

/** 흔들기 한 장면 — phase(초)가 흔들림 안이면 기울기·통통 튀기·찌부, 아니면 null */
export function shakePose(phase: number, shakes: number): { rz: number; dy: number; sy: number } | null {
  if (!(phase >= 0)) return null;
  const k = Math.floor(phase / SHAKE_SEC);
  if (k >= shakes) return null;
  const s = (phase - k * SHAKE_SEC) / SHAKE_SEC;
  const env = Math.sin(s * Math.PI);
  return { rz: Math.sin(s * Math.PI * 4) * 0.15 * (1 - s * 0.6), dy: env * 0.1, sy: 1 + env * 0.08 };
}
/** 키 → 0..HINT_PERIOD 위상(상자마다 따로 흔들게) */
const seedOf = (key: string) => {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) / 4294967296) * HINT_PERIOD;
};

// ───────────── 빛기둥(금 이상 힌트) ─────────────

let beamTex: THREE.Texture | null = null;
let sparkTex: THREE.Texture | null = null;
const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function';
function solidTex(): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}
function tex() {
  if (!beamTex) {
    if (hasDom()) {
      const c = document.createElement('canvas'); c.width = 4; c.height = 128;
      const g = c.getContext('2d');
      if (g) {
        const gr = g.createLinearGradient(0, 128, 0, 0);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
        beamTex = new THREE.CanvasTexture(c);
      }
      const s = document.createElement('canvas'); s.width = s.height = 64;
      const h = s.getContext('2d');
      if (h) {
        const rg = h.createRadialGradient(32, 32, 0, 32, 32, 32);
        rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,0.6)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        h.fillStyle = rg; h.fillRect(0, 0, 64, 64);
        h.fillStyle = 'rgba(255,255,255,0.9)';
        h.fillRect(30, 4, 4, 56); h.fillRect(4, 30, 56, 4);
        sparkTex = new THREE.CanvasTexture(s);
      }
    }
    beamTex ??= solidTex();
    sparkTex ??= solidTex();
    beamTex.userData.shared = sparkTex.userData.shared = true;
  }
  return { beam: beamTex!, spark: sparkTex! };
}

const pillarGeos = new Map<number, Geo[]>();
/** 빛기둥(바닥에서 위로 사라지는 원통 두 겹). opacity(k) 로 밝기 */
export function makePillar(tier: ChestTier, tall = 16): { obj: THREE.Group; opacity(k: number): void; dispose(): void } {
  const col = new THREE.Color(TIERS[tier].color);
  let geos = pillarGeos.get(tall);
  if (!geos) {
    geos = [[0.3, 1.25], [0.75, 1.3]].map(([r, f]) => { const g = new THREE.CylinderGeometry(r, r * f, tall, 24, 1, true); g.translate(0, tall / 2, 0); g.userData.shared = true; return g; });
    pillarGeos.set(tall, geos);
  }
  const g = new THREE.Group();
  g.name = 'chest-pillar';
  const mats = geos.map((geo, i) => {
    const m = new THREE.MeshBasicMaterial({ color: col, map: tex().beam, transparent: true, opacity: i ? 0.18 : 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    g.add(mesh);
    return m;
  });
  return {
    obj: g,
    opacity: (k) => { mats[0].opacity = 0.5 * k; mats[1].opacity = 0.18 * k; g.visible = k > 0.01; },
    dispose: () => { g.removeFromParent(); for (const m of mats) m.dispose(); },
  };
}

// ───────────── 청크 상자 밭 ─────────────

/** 지금 세상에 놓인 상자 하나 */
export interface LiveChest extends ChestSpot {
  y: number;
  opened: boolean;
  /** 여는 중(연출이 맡았다) */
  busy: boolean;
  /** 힌트로 흔드는 중 */
  wig: boolean;
  /** 힌트 위상 */
  seed: number;
  hide(): void;
  pose(rz: number, dy: number, sy: number): void;
  reset(): void;
}
interface Slot { cx: number; cz: number; x0: number; z0: number; size: number; group: THREE.Group; keys: string[] }
export interface FieldHooks {
  /** 이 칸(x0, z0, size) 안 상자 자리 전부(연 것도 포함) */
  spotsIn(x0: number, z0: number, size: number): ChestSpot[];
  isOpened(key: string): boolean;
  heightAt(x: number, z: number): number;
}

/** 청크 스트리밍 상자 밭 — 칸마다 등급별 InstancedMesh 하나씩 */
export class ChestField {
  readonly live = new Map<string, LiveChest>();
  private slots = new Set<Slot>();
  private pillars: Array<{ p: ReturnType<typeof makePillar>; tier: ChestTier; key: string | null }> = [];

  constructor(private game: Game, private hooks: FieldHooks) {
    game.chunks.add({
      key: 'econ-chests', size: 128, radius: 260,
      build: (c) => {
        const slot: Slot = { ...c, group: new THREE.Group(), keys: [] };
        slot.group.name = 'chests';
        slot.group.userData.slot = slot;
        this.fill(slot);
        this.slots.add(slot);
        return slot.group;
      },
      // 공유 지오메트리라 버리지 않는다 — 상자 목록과 인스턴스 버퍼만
      dispose: (o) => {
        const slot = o.userData.slot as Slot | undefined;
        if (!slot) return;
        this.clear(slot);
        this.slots.delete(slot);
      },
    });
  }

  private clear(slot: Slot) {
    for (const k of slot.keys) this.live.delete(k);
    slot.keys = [];
    for (const ch of [...slot.group.children]) { slot.group.remove(ch); (ch as THREE.InstancedMesh).dispose?.(); }
  }

  private fill(slot: Slot) {
    const spots = this.hooks.spotsIn(slot.x0, slot.z0, slot.size).filter((s) => !this.hooks.isOpened(s.key));
    if (!spots.length) return;
    const byTier = new Map<ChestTier, ChestSpot[]>();
    for (const s of spots) { const l = byTier.get(s.tier) ?? []; l.push(s); byTier.set(s.tier, l); }
    const q = new THREE.Quaternion(), qt = new THREE.Quaternion(), e = new THREE.Euler(), up = new THREE.Vector3(0, 1, 0);
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const [tier, list] of byTier) {
      const im = new THREE.InstancedMesh(tierGeometry(tier).closed, chestMaterial(), list.length);
      im.castShadow = true; im.receiveShadow = true;
      im.name = `chest-${tier}`;
      slot.group.add(im);
      list.forEach((s, i) => {
        const y = this.hooks.heightAt(s.x, s.z);
        const set = (rz: number, dy: number, sy: number, hidden = false) => {
          q.setFromAxisAngle(up, s.rot);
          qt.setFromEuler(e.set(0, 0, rz));
          q.multiply(qt);
          const wide = 1 + (1 - sy) * 0.6;
          if (hidden) { p.set(s.x, -999, s.z); sc.set(0, 0, 0); } else { p.set(s.x, y - 0.03 + dy, s.z); sc.set(wide, sy, wide); }
          m4.compose(p, q, sc);
          im.setMatrixAt(i, m4);
          im.instanceMatrix.needsUpdate = true;
        };
        set(0, 0, 1);
        const c: LiveChest = {
          ...s, y, opened: false, busy: false, wig: false, seed: seedOf(s.key),
          hide: () => set(0, 0, 1, true),
          pose: (rz, dy, sy) => set(rz, dy, sy),
          reset: () => set(0, 0, 1),
        };
        this.live.set(s.key, c);
        slot.keys.push(s.key);
      });
      im.computeBoundingSphere();
    }
  }

  /** 자리 목록이 바뀌었다(날 바뀜·구역 추가) — 살아 있는 칸을 다시 채운다 */
  refresh() {
    for (const s of this.slots) { this.clear(s); this.fill(s); }
  }

  /** 가장 가까운 닫힌 상자(maxD m 안, 높이 차 3m 안) */
  nearest(pos: THREE.Vector3, maxD: number): { c: LiveChest; d: number } | null {
    let best: LiveChest | null = null, bd = maxD;
    for (const c of this.live.values()) {
      if (c.opened || c.busy) continue;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d < bd && Math.abs(c.y - pos.y) < 3) { bd = d; best = c; }
    }
    return best ? { c: best, d: bd } : null;
  }

  /** 매 프레임: 가까운 상자만 흔들림 힌트(+ 금 이상 빛기둥) */
  updateHints(t: number, pos: THREE.Vector3) {
    const r2 = HINT_R * HINT_R;
    const want: LiveChest[] = [];
    for (const c of this.live.values()) {
      if (c.opened || c.busy) { c.wig = false; continue; }
      const d2 = (c.x - pos.x) ** 2 + (c.z - pos.z) ** 2;
      const pose = d2 < r2 ? shakePose((t + c.seed) % HINT_PERIOD, TIERS[c.tier].shakes) : null;
      if (pose) { c.pose(pose.rz, pose.dy, pose.sy); c.wig = true; if (TIERS[c.tier].pillar) want.push(c); }
      else if (c.wig) { c.reset(); c.wig = false; }
    }
    this.syncPillars(t, want);
  }

  private syncPillars(t: number, want: LiveChest[]) {
    const keep = new Set(want.slice(0, 3).map((c) => c.key));
    for (const pl of this.pillars) if (pl.key && !keep.has(pl.key)) { pl.p.opacity(0); pl.key = null; }
    for (const c of want.slice(0, 3)) {
      let pl = this.pillars.find((x) => x.key === c.key);
      if (!pl) {
        pl = this.pillars.find((x) => !x.key && x.tier === c.tier);
        if (!pl) { pl = { p: makePillar(c.tier), tier: c.tier, key: null }; this.pillars.push(pl); this.game.root.add(pl.p.obj); }
        pl.key = c.key;
        pl.p.obj.position.set(c.x, c.y, c.z);
      }
      // 세 번째 흔들림 동안 환하게
      const ph = (t + c.seed) % HINT_PERIOD;
      pl.p.opacity(Math.min(1, Math.max(0.25, Math.sin(Math.min(1, ph / (SHAKE_SEC * 3)) * Math.PI))));
    }
  }
}

// ───────────── 따로 선 상자(무지개·디버그) ─────────────

/** 청크 밖 상자 하나(무지개 날씨 상자 등) — 흔들림은 wob 에 */
export function buildStandaloneChest(tier: ChestTier): { root: THREE.Group; wob: THREE.Group; pillar: ReturnType<typeof makePillar> | null } {
  const root = new THREE.Group();
  root.name = `chest-${tier}`;
  const wob = new THREE.Group();
  const mesh = new THREE.Mesh(tierGeometry(tier).closed, chestMaterial());
  mesh.castShadow = true; mesh.receiveShadow = true;
  wob.add(mesh);
  root.add(wob, blobShadow(0.9));
  const pillar = TIERS[tier].pillar ? makePillar(tier, 26) : null;
  if (pillar) { root.add(pillar.obj); pillar.opacity(0.6); }
  return { root, wob, pillar };
}
/** 흔들기 장면을 오브젝트에 */
export function applyShake(wob: THREE.Object3D, pose: { rz: number; dy: number; sy: number } | null) {
  if (!pose) { wob.rotation.z = 0; wob.position.y = 0; wob.scale.set(1, 1, 1); return; }
  const wide = 1 + (1 - pose.sy) * 0.6;
  wob.rotation.z = pose.rz; wob.position.y = pose.dy; wob.scale.set(wide, pose.sy, wide);
}
/** 따로 선 상자의 힌트 흔들기 */
export function hintShake(wob: THREE.Object3D, t: number, key: string, tier: ChestTier) {
  applyShake(wob, shakePose((t + seedOf(key)) % HINT_PERIOD, TIERS[tier].shakes));
}

// ───────────── 미믹 상자게 ─────────────

const crabMat = (() => {
  let m: THREE.MeshPhysicalMaterial | null = null;
  return () => (m ??= Object.assign(new THREE.MeshPhysicalMaterial({ color: '#ff8f7a', roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: new THREE.Color('#ffd6c8') }), { userData: { shared: true } }));
})();
const mouthMat = (() => {
  let m: THREE.MeshStandardMaterial | null = null;
  return () => (m ??= Object.assign(new THREE.MeshStandardMaterial({ color: '#ff6f91', roughness: 0.55, emissive: '#7a1d3a', emissiveIntensity: 0.25 }), { userData: { shared: true } }));
})();
let crabGeo: { leg: Geo; claw: Geo; pinch: Geo; tongue: Geo; inside: Geo } | null = null;
function crabGeos() {
  if (crabGeo) return crabGeo;
  const leg = new THREE.CapsuleGeometry(0.055 * S, 0.16 * S, 6, 12); leg.translate(0, -0.08 * S, 0);
  const claw = new THREE.SphereGeometry(0.12 * S, 22, 16); claw.scale(1.15, 0.85, 0.9);
  const pinch = new THREE.SphereGeometry(0.07 * S, 18, 12); pinch.scale(1.3, 0.55, 0.7);
  const tongue = new THREE.SphereGeometry(0.16 * S, 22, 12); tongue.scale(1.25, 0.28, 0.9);
  const inside = new THREE.PlaneGeometry(CHEST_W * 0.9, CHEST_D * 0.85); inside.rotateX(-Math.PI / 2);
  for (const g of [leg, claw, pinch, tongue, inside]) g.userData.shared = true;
  return (crabGeo = { leg, claw, pinch, tongue, inside });
}

export interface MimicCrab {
  root: THREE.Group;
  /** 흔들림·통통 튀기 */
  wob: THREE.Group;
  lid: THREE.Group;
  eyes: EyeSet;
  legs: THREE.Object3D[];
  claws: THREE.Group[];
  /** 0 = 상자인 척 · 1 = 눈 뜨고 다리 내밈 */
  setAwake(k: number): void;
  /** 다리 종종·집게 짤깍·입 뻐끔(run 0..1) */
  animate(t: number, run: number): void;
}

/**
 * 상자게(d_mimic_crab): 상자 몸통 앞에 큰 눈 + 볼터치(art.ts), 옆구리에 통통 다리 6개, 앞에 동글 집게 2개,
 * 뚜껑 안엔 분홍 혀. 등에 상자 뚜껑을 이고 옆걸음으로 도망간다.
 */
export function buildMimicCrab(tier: ChestTier = 'wood'): MimicCrab {
  const G = tierGeometry(tier), C = crabGeos();
  const W = CHEST_W, H = CHEST_H, D = CHEST_D;
  const root = new THREE.Group();
  root.name = 'mimic-crab';
  const wob = new THREE.Group();
  root.add(wob);
  const body = new THREE.Mesh(G.base, chestMaterial());
  body.castShadow = true;
  wob.add(body);
  // 입 안(뚜껑이 열리면 보인다)
  const inside = new THREE.Mesh(C.inside, mouthMat());
  inside.position.y = H - 0.01;
  const tongue = new THREE.Mesh(C.tongue, mouthMat());
  tongue.position.set(0, H + 0.02, D * 0.08);
  wob.add(inside, tongue);
  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  const lidMesh = new THREE.Mesh(G.lid, chestMaterial());
  lidMesh.castShadow = true;
  lid.add(lidMesh);
  wob.add(lid);
  // 얼굴: 몸통 앞면(자물쇠 아래 양옆)
  const face = new THREE.Group();
  face.position.set(0, H * 0.5, D / 2 + 0.012);
  wob.add(face);
  const eyeSize = 0.17 * S;
  const eyes = addEyes(face, { size: eyeSize, gap: W * 0.36, splay: 0, name: 'mimic-eye' });
  // 다리 6개(양옆 3개씩)
  const legs: THREE.Object3D[] = [];
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(side * W * 0.46, H * 0.18, (i - 1) * D * 0.32);
    const leg = new THREE.Mesh(C.leg, crabMat());
    leg.rotation.z = side * 0.9;
    leg.castShadow = true;
    pivot.add(leg);
    pivot.userData.side = side; pivot.userData.i = i;
    wob.add(pivot);
    legs.push(pivot);
  }
  // 집게 2개(앞 양옆, 살짝 들고)
  const claws: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(side * W * 0.62, H * 0.32, D * 0.42);
    const ball = new THREE.Mesh(C.claw, crabMat());
    ball.castShadow = true;
    const top = new THREE.Mesh(C.pinch, crabMat());
    top.position.set(side * 0.02, 0.07 * S, 0.1 * S);
    const bot = new THREE.Mesh(C.pinch, crabMat());
    bot.position.set(side * 0.02, -0.03 * S, 0.11 * S);
    g.add(ball, top, bot);
    g.userData.top = top;
    wob.add(g);
    claws.push(g);
  }
  root.add(blobShadow(0.95));
  let awake = 1;
  const crab: MimicCrab = {
    root, wob, lid, eyes, legs, claws,
    setAwake(k) {
      awake = Math.min(1, Math.max(0, k));
      const e = Math.max(0.001, awake);
      eyes.left.scale.set(eyeSize, eyeSize * e, 1);
      eyes.right.scale.set(eyeSize, eyeSize * e, 1);
      for (const b of eyes.blush) b.visible = awake > 0.5;
      for (const l of legs) l.scale.setScalar(Math.max(0.001, awake));
      for (const c of claws) c.scale.setScalar(Math.max(0.001, awake));
      tongue.visible = inside.visible = awake > 0.05;
      if (awake < 0.05) lid.rotation.x = 0;
    },
    animate(t, run) {
      const r = Math.min(1, Math.max(0, run));
      for (const l of legs) {
        const side = l.userData.side as number, i = l.userData.i as number;
        l.rotation.x = Math.sin(t * 20 + i * 2.1 + (side > 0 ? Math.PI : 0)) * 0.55 * r;
        l.rotation.z = side * Math.abs(Math.sin(t * 20 + i * 2.1)) * 0.25 * r;
      }
      claws.forEach((c, i) => {
        c.rotation.x = -0.25 + Math.sin(t * 7 + i * 1.7) * 0.25;
        (c.userData.top as THREE.Object3D).rotation.z = (i ? -1 : 1) * (0.15 + Math.max(0, Math.sin(t * 11 + i)) * 0.35);
      });
      // 입 뻐끔(눈 뜬 뒤)
      lid.rotation.x = -(0.22 + 0.22 * Math.max(0, Math.sin(t * 13))) * awake;
      wob.position.y = Math.abs(Math.sin(t * 10)) * 0.07 * r;
      wob.rotation.z = Math.sin(t * 10) * 0.06 * r;
    },
  };
  crab.setAwake(1);
  return crab;
}

/** 도망가는 미믹 상자게 — 플레이어 반대쪽으로 옆걸음. 지치면 느려진다(걷기 5.2 m/s 로 따라잡을 수 있게) */
export class MimicRunner {
  readonly pos: THREE.Vector3;
  private dir: number;
  private t0: number;
  private state: 'wake' | 'run' | 'gone' | 'caught' = 'wake';
  private goneAt = 0;
  /** 다 도망가면(시간 초과·멀어짐) */
  static readonly LIFE = 14;
  static readonly FAR = 40;

  constructor(
    private game: Game, readonly crab: MimicCrab, at: THREE.Vector3, rotY: number,
    private ground: { heightAt(x: number, z: number): number; dry(x: number, z: number): boolean },
    readonly key: string, readonly tier: ChestTier,
  ) {
    this.pos = at.clone();
    this.dir = rotY;
    this.t0 = game.time;
    crab.root.position.copy(this.pos);
    crab.root.rotation.y = rotY;
    crab.setAwake(0);
  }
  get alive() { return this.state === 'wake' || this.state === 'run'; }
  get status() { return this.state; }

  /** 매 프레임 — 끝났으면(잡힘·사라짐 연출 끝) false */
  update(t: number, dt: number, player: THREE.Vector3): boolean {
    const k = t - this.t0;
    const c = this.crab;
    if (this.state === 'caught') return false;
    if (this.state === 'gone') {
      const g = (t - this.goneAt) / 0.45;
      c.root.scale.setScalar(Math.max(0.001, 1 - g));
      c.root.position.y = this.pos.y + g * 0.8;
      if (g >= 1) { c.root.removeFromParent(); return false; }
      return true;
    }
    if (this.state === 'wake') {
      // 눈을 뜨고(0.25초) 다리를 쏙 — 깜짝 점프
      c.setAwake(Math.min(1, k / 0.3));
      c.animate(t, 0.3);
      c.wob.position.y = Math.sin(Math.min(1, k / 0.6) * Math.PI) * 0.35;
      if (k >= 0.6) this.state = 'run';
      return true;
    }
    // 도망: 플레이어 반대쪽 + 지그재그
    const away = Math.atan2(this.pos.x - player.x, this.pos.z - player.z);
    const wantDir = away + Math.sin(k * 2.3) * 0.55;
    let dd = wantDir - this.dir;
    dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    this.dir += dd * Math.min(1, dt * 4);
    const speed = k < 2.2 ? 5.6 : 3.6;
    let moved = false;
    for (let i = 0; i < 6 && !moved; i++) {
      const a = this.dir + (i ? (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.9 : 0);
      const nx = this.pos.x + Math.sin(a) * speed * dt, nz = this.pos.z + Math.cos(a) * speed * dt;
      if (this.ground.dry(nx, nz)) { this.pos.x = nx; this.pos.z = nz; this.dir = a; moved = true; }
    }
    this.pos.y = this.ground.heightAt(this.pos.x, this.pos.z);
    c.root.position.copy(this.pos);
    // 게는 옆걸음 — 몸은 진행 방향에 옆으로
    c.root.rotation.y = this.dir + Math.PI / 2;
    c.animate(t, moved ? 1 : 0.3);
    if (k > MimicRunner.LIFE || Math.hypot(this.pos.x - player.x, this.pos.z - player.z) > MimicRunner.FAR) this.vanish();
    return true;
  }
  /** 다 도망갔다(뿅) */
  vanish() { if (this.alive) { this.state = 'gone'; this.goneAt = this.game.time; } }
  /** 잡혔다 — 세상에서 치운다 */
  catch() { this.state = 'caught'; this.crab.root.removeFromParent(); }
}

// ───────────── 여는 연출 ─────────────

/**
 * E 로 열기: 등급만큼 흔들고(금 이상은 빛기둥) → 뚜껑 열고 빛기둥·반짝이·코인 분수.
 * mimic 이면 흔들다 눈을 뜬다 → onMimic(상자게) 로 넘긴다(도망은 MimicRunner).
 */
export function playOpen(
  game: Game, at: THREE.Vector3, rotY: number, tier: ChestTier,
  o: { mimic?: boolean; onMimic?: (crab: MimicCrab) => void; onBurst?: () => void } = {},
) {
  const N = TIERS[tier].shakes;
  const root = new THREE.Group();
  root.name = 'chest-open';
  root.position.copy(at);
  root.rotation.y = rotY;
  game.root.add(root);
  let crab: MimicCrab | null = null;
  let wob: THREE.Object3D, lid: THREE.Object3D | null = null;
  if (o.mimic) {
    crab = buildMimicCrab(tier);
    crab.setAwake(0);
    root.add(crab.root);
    wob = crab.wob;
  } else {
    const G = tierGeometry(tier);
    const w = new THREE.Group();
    const base = new THREE.Mesh(G.base, chestMaterial()); base.castShadow = true;
    const lg = new THREE.Group(); lg.position.set(0, CHEST_H, -CHEST_D / 2);
    const lm = new THREE.Mesh(G.lid, chestMaterial()); lm.castShadow = true;
    lg.add(lm); w.add(base, lg);
    root.add(w, blobShadow(0.9));
    wob = w; lid = lg;
  }
  const pillar = TIERS[tier].pillar ? makePillar(tier, 26) : null;
  if (pillar) { root.add(pillar.obj); pillar.opacity(0); }
  const t0 = game.time, shakeEnd = N * SHAKE_SEC;
  let burst = false, done = false;
  const finish = () => { done = true; off(); pillar?.dispose(); root.removeFromParent(); };
  const off = game.onUpdate((t) => {
    if (done) return;
    const k = t - t0;
    if (k < shakeEnd) {
      applyShake(wob, shakePose(k, N));
      if (pillar) pillar.opacity(Math.min(1, k / shakeEnd) * 0.9);
      return;
    }
    applyShake(wob, null);
    if (crab) {
      // 미믹: 상자게를 세상으로 넘기고 이 연출은 끝
      const c = crab;
      root.remove(c.root);
      c.root.position.copy(at);
      c.root.rotation.y = rotY;
      game.root.add(c.root);
      crab = null;
      finish();
      o.onMimic?.(c);
      return;
    }
    const kk = k - shakeEnd;
    if (lid) lid.rotation.x = -1.95 * (1 - Math.pow(1 - Math.min(1, kk / 0.35), 3));
    if (!burst) { burst = true; spawnChestFx(game, at, tier, rotY); o.onBurst?.(); }
    if (pillar) pillar.opacity(Math.max(0, 0.9 - kk * 0.4));
    if (kk > 2.6) { const s = Math.max(0.001, 1 - (kk - 2.6) / 0.6); root.scale.setScalar(s); }
    if (kk > 3.2) finish();
  });
  return root;
}

// ── 터지는 연출(빛기둥·고리·반짝이·코인 분수) ──
const coinGeo = (() => { const g = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 28); g.rotateX(Math.PI / 2); g.userData.shared = true; return g; })();
const coinMat = new THREE.MeshPhysicalMaterial({ color: '#ffd23f', metalness: 0.7, roughness: 0.25, emissive: '#8a5a00', emissiveIntensity: 0.35, clearcoat: 0.8 });
const TALL: Record<ChestTier, number> = { wood: 14, silver: 22, gold: 32, rainbow: 46, space: 32 };

export function spawnChestFx(game: Game, at: THREE.Vector3, tier: ChestTier, rotY: number) {
  const T = TIERS[tier];
  const col = new THREE.Color(T.color);
  const { beam, spark } = tex();
  const g = new THREE.Group();
  g.name = 'chest-fx';
  g.position.copy(at);
  game.root.add(g);
  const tall = TALL[tier];
  const beams: THREE.Mesh[] = [];
  for (const [rad, op] of [[0.38, 0.6], [0.95, 0.22]] as const) {
    const geo = new THREE.CylinderGeometry(rad, rad * 1.25, tall, 32, 1, true);
    geo.translate(0, tall / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, map: beam, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.renderOrder = 5;
    g.add(m); beams.push(m);
  }
  // 바닥 빛 고리
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 1.6, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  g.add(ring);
  // 반짝이
  const N = tier === 'rainbow' ? 90 : tier === 'gold' || tier === 'space' ? 60 : 36;
  const pos = new Float32Array(N * 3), seeds: number[] = [];
  for (let i = 0; i < N; i++) seeds.push(Math.sin(i * 12.9898 + at.x) * 43758.5453 % 1);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: new THREE.Color(T.glow), map: spark, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pts.frustumCulled = false;
  g.add(pts);
  // 코인 분수
  const C = tier === 'rainbow' ? 40 : tier === 'gold' || tier === 'space' ? 28 : tier === 'silver' ? 18 : 10;
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, C);
  coins.castShadow = true; coins.frustumCulled = false;
  g.add(coins);
  const vel = Array.from({ length: C }, (_, i) => {
    const a = i * 2.39996 + rotY, sp = 1.6 + ((i * 7) % 5) * 0.45;
    return new THREE.Vector3(Math.cos(a) * sp, 7 + ((i * 3) % 4) * 1.3, Math.sin(a) * sp);
  });
  // 광원 추가는 전체 셰이더 재컴파일(멈춤)을 부르므로 빛 대신 바닥 글로우 원판
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshBasicMaterial({ color: col, map: spark, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.08;
  g.add(glow);
  const t0 = game.time;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const life = 3.6;
  let done = false;
  const step = (t: number) => {
    const k = t - t0;
    const fade = Math.max(0, 1 - Math.max(0, k - life + 1.2) / 1.2);
    const pop = Math.min(1, k * 4);
    beams.forEach((b, i) => { b.scale.set(pop * (1 + Math.sin(t * 8 + i) * 0.06), Math.min(1, k * 2.2), pop); (b.material as THREE.MeshBasicMaterial).opacity = (i ? 0.22 : 0.6) * fade; });
    ring.scale.setScalar(1 + k * 1.6);
    (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - k * 0.5);
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.6 * fade * (1 + Math.sin(t * 10) * 0.15);
    for (let i = 0; i < N; i++) {
      const s = Math.abs(seeds[i]);
      const a = s * 40 + k * (0.8 + s), rr = 0.4 + s * 1.8 + k * 0.4;
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = ((s * 13 + k * (2 + s * 3)) % (tall * 0.5)); pos[i * 3 + 2] = Math.sin(a) * rr;
    }
    pg.attributes.position.needsUpdate = true;
    (pts.material as THREE.PointsMaterial).opacity = fade;
    for (let i = 0; i < C; i++) {
      const kk = Math.max(0, k - i * 0.025);
      const v = vel[i];
      const y = Math.max(0.08, 0.5 + v.y * kk - 11 * kk * kk);
      const ground = y <= 0.08;
      const land = (v.y + Math.sqrt(v.y * v.y + 22 * 0.42)) / 22;
      p.set(v.x * Math.min(kk, ground ? land : kk), y, v.z * Math.min(kk, ground ? land : kk));
      e.set(kk * 9 + i, kk * 6, 0); q.setFromEuler(e);
      sc.setScalar(Math.min(1, kk * 6) * fade + 0.0001);
      m4.compose(p, q, sc); coins.setMatrixAt(i, m4);
    }
    coins.instanceMatrix.needsUpdate = true;
    if (k > life) {
      done = true;
      off();
      g.removeFromParent();
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | undefined;
        if (mat && mat !== coinMat) mat.dispose();
      });
      coins.dispose();
    }
  };
  step(t0 + 0.0001);
  const off = game.onUpdate((t) => { if (!done) step(t); });
  return g;
}
