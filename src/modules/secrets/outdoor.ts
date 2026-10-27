// secrets 바깥 모델 — 숨은 곳 12곳의 입구·꾸밈(로컬 +z = 열린 쪽/다가오는 쪽) + 섬 동굴 입구(PLACES.caves).
// 각 모델은 이름 'secret-<id>' 묶음 + 상호작용 자리(ANCHORS, 로컬) + 정적 충돌체(로컬) + update(t, 상태).
// 굽는 건 kit.Builder(재질 수만큼만 그린다), 움직이는 것(요정·매머드·불꽃·거품)만 따로 둔다.
import * as THREE from 'three';
import type { BodyShape } from '../../core/physics';
import { Builder, G, Motes, glowMat, plainMat, picturePlane, drawSign, sparkGeometry } from './kit';
import { babyMammoth, fairySwarm, moonBunny, sleepyFace } from './critters';
import { thawProgress, type MammothState, type MySecret, AVALANCHE_MOUNDS } from './logic';

type V3 = [number, number, number];
export interface LocalCol { shape: BodyShape; p: V3 }
/** 모델이 매 프레임 받는 상태 */
export interface SpotState {
  /** 시간·날씨 문(gateOpen) */
  open: boolean;
  /** 0(낮)..1(밤) */
  night: number;
  found: boolean;
  /** 한 번 상자(아직 안 열었으면 true) */
  chest: boolean;
  /** 오늘 하루 줍기가 남았나 */
  daily: boolean;
  mammoth?: MammothState;
  /** 매머드가 풀려난 뒤 흐른 초(떠나는 연출) */
  freeAge?: number;
  /** 눈사태: 그 눈 더미를 오늘 팠나 */
  dug?: boolean[];
}
export interface SpotModel {
  id: string;
  root: THREE.Group;
  cols: LocalCol[];
  update(t: number, s: SpotState): void;
  /** 물 위·높은 곳 바닥 윗면 높이(로컬 x, z → 뿌리 기준 y, 바닥 없으면 null) — 땅 공급자용 */
  deck?(lx: number, lz: number): number | null;
}

/** 상호작용 자리(로컬, y 는 바닥 위) */
export const ANCHORS: Record<MySecret, Record<string, V3>> = {
  'home-waterfall-cave': { door: [0, 0, 1.6] },
  'home-cliff-beach': { chest: [2.2, 0, 0.6] },
  'home-fairy-ring': { center: [0, 0, 0] },
  'dino-lava-garden': { chest: [-4.0, 0, 0.6], pick: [3.6, 0, 3.4] },
  'dino-mural-cave': { door: [0, 0, 1.8] },
  'dino-bubble-cave': { door: [0, 0, 1.8] },
  'ice-mammoth': { block: [0, 0, 1.9], fire: [0, 0, 3.4] },
  'ice-aurora-cave': { door: [0, 0, 1.8] },
  'ice-avalanche': { m0: [-3.4, 0, 1.2], m1: [-0.9, 0, -1.6], m2: [1.8, 0, 1.6], m3: [4.0, 0, -1.0] },
  'mush-moon-deck': { scope: [4.6, 0, -2.4], chest: [-4.6, 0, 2.8] },
  'mush-swamp-hut': { door: [0, 0, 3.6] },
  'mush-tree-room': { door: [0, 0, 5.0] },
};

const box = (hx: number, hy: number, hz: number): BodyShape => ({ kind: 'box', hx, hy, hz });
const cylS = (r: number, halfH: number): BodyShape => ({ kind: 'cylinder', r, halfH });

// ───────────── 공통 조각 ─────────────
interface ArchOpt { w: number; h: number; rock: string[]; mouth?: string; seed?: number; moss?: string; snow?: boolean; depth?: number }
/** 울퉁불퉁 돌 아치 + 깊은 입(검정 대신 보랏빛 먹색) — 입은 z=0 둘레, 앞이 +z */
export function archMouth(B: Builder, o: ArchOpt): LocalCol[] {
  const n = 9, r = o.w / 2, d = o.depth ?? 1.6;
  const seed = o.seed ?? 0;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    const x = Math.cos(a) * r, y = Math.sin(a) * o.h;
    const s = 1.3 + ((i * 7 + seed) % 3) * 0.25;
    B.add(G.lump((i + seed) % 8), 'matte', o.rock[i % o.rock.length], [x, Math.max(0.3, y), 0.1], [s, s * 0.95, d], [0, 0, a]);
    if (o.moss && i > 1 && i < n - 1 && i % 2 === 0) B.add(G.sphere(), 'soft', o.moss, [x * 0.98, y + s * 0.42, 0.25], [s * 0.7, 0.28, d * 0.7]);
    if (o.snow && i > 0 && i < n) B.add(G.sphere(), 'soft', '#f7fbff', [x, y + s * 0.4, 0.15], [s * 0.85, 0.36, d * 0.85]);
  }
  // 바위 등(뒤로 비탈에 묻힌다)
  B.add(G.lump(seed + 3), 'matte', o.rock[0], [0, o.h * 0.5, -1.6], [o.w * 1.5, o.h * 1.45, 3.2]);
  // 입(납작한 반구, 안쪽 어둠)
  B.add(G.hemi(), 'matte', o.mouth ?? '#43395a', [0, 0.02, -0.35], [o.w * 0.86, o.h * 0.92, 1.4], [Math.PI / 2, 0, 0]);
  B.add(G.disc(), 'matte', o.mouth ?? '#43395a', [0, 0.03, -0.2], [o.w * 0.8, 1, 1.4]);
  const gy = (x: number, z: number) => B.ground?.(x, z) ?? 0;
  return [
    { shape: box(0.7, o.h * 0.5, d * 0.5), p: [-r - 0.3, o.h * 0.5 + gy(-r - 0.3, 0), 0] },
    { shape: box(0.7, o.h * 0.5, d * 0.5), p: [r + 0.3, o.h * 0.5 + gy(r + 0.3, 0), 0] },
    { shape: box(o.w * 0.6, o.h * 0.6, 1.2), p: [0, o.h * 0.6 + gy(0, -1.7), -1.7] },
  ];
}

/** 작은 꽃(줄기 + 꽃잎 5 + 노랑 가운데) */
function flower(B: Builder, p: V3, c: string, s = 1) {
  B.add(G.cyl(6), 'matte', '#7cc46a', [p[0], p[1] + 0.12 * s, p[2]], [0.03 * s, 0.24 * s, 0.03 * s]);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    B.add(G.sphereLo(), 'soft', c, [p[0] + Math.cos(a) * 0.06 * s, p[1] + 0.25 * s, p[2] + Math.sin(a) * 0.06 * s], [0.08 * s, 0.03 * s, 0.08 * s]);
  }
  B.add(G.sphereLo(), 'gloss', '#ffe07a', [p[0], p[1] + 0.27 * s, p[2]], 0.05 * s);
}
/** 점박이 버섯(줄기 + 반구 갓 + 흰 점) */
function mushroom(B: Builder, p: V3, cap: string, s = 1, kind: 'gloss' | 'glow' = 'gloss') {
  B.add(G.taper(0.8, 10), 'matte', '#fff3e0', [p[0], p[1] + 0.15 * s, p[2]], [0.12 * s, 0.3 * s, 0.12 * s]);
  B.add(G.hemi(), kind, cap, [p[0], p[1] + 0.28 * s, p[2]], [0.36 * s, 0.24 * s, 0.36 * s]);
  if (kind === 'gloss') for (let k = 0; k < 3; k++) {
    const a = k * 2.1;
    B.add(G.sphereLo(), 'matte', '#fffaf2', [p[0] + Math.cos(a) * 0.1 * s, p[1] + 0.36 * s, p[2] + Math.sin(a) * 0.1 * s], 0.05 * s);
  }
}
/** 보물상자(나무 몸 + 금/은 띠 + 하트 자물쇠) — 따로 굽는다(보였다 숨었다) */
export function chestModel(tier: 'gold' | 'silver' | 'wood', open = false): THREE.Group {
  const B = new Builder();
  chestInto(B, tier, open);
  const g = B.bake(`chest-${tier}`);
  g.name = `secrets-chest-${tier}`;
  return g;
}
/** 상자 조각을 이미 있는 Builder 에 얹기(지금 push 된 변환 기준) */
export function chestInto(B: Builder, tier: 'gold' | 'silver' | 'wood', open = false) {
  const band = tier === 'gold' ? '#ffd54a' : tier === 'silver' ? '#dfe6f2' : '#e3b07c';
  const wood = tier === 'wood' ? '#c98a5a' : '#b87a50';
  B.add(G.box(0.12), 'matte', wood, [0, 0.3, 0], [1.0, 0.6, 0.7]);
  B.push([0, 0.6, -0.35], [open ? -1.6 : 0, 0, 0]);
  B.add(G.cyl(16), 'matte', wood, [0, 0, 0.35], [0.7, 1.0, 0.7], [0, 0, Math.PI / 2]);
  B.add(G.torus(0.12, Math.PI), 'metal', band, [0, 0, 0.35], [0.72, 0.72, 0.9], [0, Math.PI / 2, 0]);
  B.pop();
  for (const x of [-0.32, 0.32]) B.add(G.box(0.05), 'metal', band, [x, 0.32, 0], [0.1, 0.64, 0.74]);
  B.add(G.heart(), 'metal', band, [0, 0.5, 0.37], 0.2);
  if (open) B.add(G.sphere(), 'glow', '#fff3a8', [0, 0.62, 0], [0.7, 0.2, 0.45]);
}

/** 반짝이 떼(상자·별조각 둘레) */
function glints(n: number, r: number, h: number, color: string, rnd: () => number): Motes {
  const pts = Array.from({ length: n }, () => {
    const a = rnd() * Math.PI * 2, rr = r * (0.3 + rnd() * 0.7);
    return { x: Math.cos(a) * rr, y: 0.3 + rnd() * h, z: Math.sin(a) * rr, s: 0.08 + rnd() * 0.06 };
  });
  return new Motes(sparkGeometry(), glowMat(color, 0.95), pts, rnd);
}

const mk = (id: string) => { const g = new THREE.Group(); g.name = `secret-${id}`; return g; };
/** 지금 짓는 자리의 땅 높이(로컬 x, z → 뿌리 높이와의 차) — buildSpotModel 이 잠깐 맞춘다 */
let GY: (x: number, z: number) => number = () => 0;
/** 비탈에 맞춰 앉는 Builder */
const newB = () => { const b = new Builder(); b.ground = GY; return b; };

// ───────────── ① 폭포 뒤 동굴(입구) ─────────────
function waterfallCave(rnd: () => number): SpotModel {
  const root = mk('home-waterfall-cave');
  const B = newB();
  const cols = archMouth(B, { w: 4.6, h: 3.8, rock: ['#a7b6c9', '#9aaec4', '#b8c4d6'], moss: '#8fd08a', seed: 1, mouth: '#3f4a6a' });
  // 물 커튼(투명한 물줄기 기둥 여럿) + 아래 물웅덩이
  B.add(G.sheet(), 'water', '#dff7ff', [0, 1.95, 0.35], [4.6, 3.9, 1.6]);
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + 0.2 + (i / 10) * (Math.PI - 0.4);
    B.add(G.capsule(), 'water', i % 3 ? '#ffffff' : '#c8f2ff', [Math.sin(a) * 2.33, 1.9 + (rnd() - 0.5) * 0.3, 0.35 + Math.cos(a) * 0.82], [0.07, 1.4 + rnd() * 0.5, 0.05]);
  }
  // 커튼 위 · 아래 물거품
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    B.add(G.sphereLo(), 'soft', '#ffffff', [Math.sin(a) * 2.2, 0.18, 0.45 + Math.cos(a) * 0.8], [0.7, 0.32, 0.5]);
    B.add(G.sphereLo(), 'soft', '#f2fbff', [Math.sin(a) * 2.2, 3.85, 0.4 + Math.cos(a) * 0.75], [0.6, 0.25, 0.45]);
  }
  B.add(G.disc(), 'water', '#8fdcff', [0, 0.06, 1.6], [5.6, 1, 2.4]);
  B.add(G.torus(0.2), 'matte', '#c9d4e2', [0, 0.06, 1.6], [5.4, 2.4, 2.4], [Math.PI / 2, 0, 0]);
  // 이끼 위 파란 꽃·고사리
  for (let i = 0; i < 7; i++) flower(B, [-2.8 + rnd() * 5.6, 0, 2.6 + rnd() * 1.2], ['#8fc8ff', '#c8b4ff', '#fff2a8'][i % 3], 1.2);
  const fx = B.bake('waterfall-cave');
  root.add(fx);
  // 물방울(아래로 떨어져 튀는 느낌 — 위로 솟는 작은 알갱이)
  const splash = new Motes(G.sphereLo(), glowMat('#e8fbff', 0.7), Array.from({ length: 14 }, () => { const x = -2 + rnd() * 4, z = 1.2 + rnd() * 0.6; return { x, y: 0.05 + GY(x, z), z, s: 0.12 + rnd() * 0.08 }; }), rnd, 'rise', 0.9);
  root.add(splash.mesh);
  const curtain = fx.getObjectByName('waterfall-cave:water');
  return {
    id: 'home-waterfall-cave', root, cols,
    update(t) {
      splash.update(t * 2.4);
      if (curtain) curtain.position.y = Math.sin(t * 7) * 0.03;
    },
  };
}

// ───────────── ② 절벽 아래 비밀 해변 ─────────────
function cliffBeach(rnd: () => number): SpotModel {
  const root = mk('home-cliff-beach');
  const B = newB();
  // 표류목 벤치
  B.add(G.capsule(), 'matte', '#d8b48a', [-2.4, 0.3, -0.8], [0.36, 2.2, 0.36], [0, 0.2, Math.PI / 2]);
  B.add(G.capsule(), 'matte', '#c9a27a', [-2.4, 0.66, -1.1], [0.22, 1.8, 0.22], [0, 0.2, Math.PI / 2]);
  // 파라솔(줄무늬 갓 8조각)
  B.add(G.cyl(8), 'matte', '#fff8e8', [0.2, 1.3, -1.8], [0.08, 2.6, 0.08]);
  for (let k = 0; k < 8; k++) B.add(G.cone(3), 'soft', k % 2 ? '#ff9fb8' : '#fff4f8', [0.2, 2.55, -1.8], [1.6, 0.6, 1.6], [0, (k / 8) * Math.PI * 2, 0]);
  B.add(G.sphere(), 'gloss', '#ffd54a', [0.2, 2.9, -1.8], 0.14);
  // 모래성(탑 셋 + 깃발)
  B.add(G.taper(0.85), 'matte', '#f3d6a0', [-0.6, 0.3, 1.8], [1.2, 0.6, 1.2]);
  for (const [x, z] of [[-1.0, 1.5], [-0.2, 1.6], [-0.6, 2.2]] as const) {
    B.add(G.taper(0.8, 12), 'matte', '#f6dcaa', [x, 0.75, z], [0.4, 0.5, 0.4]);
    B.add(G.cone(12), 'matte', '#eccb92', [x, 1.12, z], [0.42, 0.3, 0.42]);
  }
  B.add(G.cyl(6), 'matte', '#c9a27a', [-0.6, 1.5, 1.8], [0.03, 0.8, 0.03]);
  B.add(G.box(0.02), 'soft', '#7fd3ff', [-0.45, 1.75, 1.8], [0.3, 0.2, 0.02]);
  // 불가사리·조개·조약돌·물웅덩이
  for (let i = 0; i < 4; i++) B.add(G.star(), 'gloss', ['#ff9a8a', '#ffb86a', '#ff9fc0', '#ffd27a'][i], [-3 + rnd() * 6, 0.05, -0.5 + rnd() * 3.5], [0.45, 0.45, 0.3], [-Math.PI / 2, 0, rnd() * 6]);
  for (let i = 0; i < 7; i++) B.add(G.hemi(), 'gloss', ['#fff0e6', '#ffd9e6', '#e6f2ff'][i % 3], [-3.5 + rnd() * 7, 0.02, -2 + rnd() * 5], [0.3, 0.16, 0.26], [0, rnd() * 6, 0]);
  B.add(G.disc(), 'water', '#9fe9ff', [3.2, 0.05, -1.4], [2.4, 1, 1.6]);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; B.add(G.lump(i), 'matte', '#c9c4d6', [3.2 + Math.cos(a) * 1.25, 0.08, -1.4 + Math.sin(a) * 0.85], 0.4); }
  root.add(B.bake('cliff-beach'));
  // 아침 금상자(밀려온 자리 — 젖은 모래 자국)
  const chest = new THREE.Group();
  chest.name = 'secrets-beach-chest';
  const A = ANCHORS['home-cliff-beach'].chest;
  chest.position.set(A[0], GY(A[0], A[2]), A[2]);
  chest.add(chestModel('gold'));
  chest.rotation.y = -0.4;
  const gl = glints(10, 1.2, 1.4, '#fff3a8', rnd);
  chest.add(gl.mesh);
  root.add(chest);
  const cy = chest.position.y;
  return {
    id: 'home-cliff-beach', root,
    cols: [{ shape: box(1.1, 0.4, 0.4), p: [-2.4, 0.4, -0.9] }],
    update(t, s) {
      chest.visible = s.open && s.daily;
      if (chest.visible) { gl.update(t); chest.position.y = cy + Math.abs(Math.sin(t * 2)) * 0.04; }
    },
  };
}

// ───────────── ③ 그루터기 원형 광장 · 요정 버섯 링 ─────────────
function fairyRing(rnd: () => number): SpotModel {
  const root = mk('home-fairy-ring');
  const B = newB();
  // 둘레 그루터기 8(나이테 윗면)
  const cols: LocalCol[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, x = Math.cos(a) * 5.2, z = Math.sin(a) * 5.2;
    const h = 0.55 + (i % 3) * 0.15;
    B.add(G.taper(0.86), 'matte', '#b98a62', [x, h / 2, z], [1.2, h, 1.2]);
    B.add(G.cyl(18), 'matte', '#f2d6a8', [x, h + 0.01, z], [1.08, 0.03, 1.08]);
    B.add(G.torus(0.06), 'matte', '#d9b27c', [x, h + 0.03, z], [0.62, 0.62, 0.62], [Math.PI / 2, 0, 0]);
    for (let k = 0; k < 3; k++) B.add(G.sphereLo(), 'soft', '#a8d88a', [x + Math.cos(a + k) * 0.6, 0.1, z + Math.sin(a + k) * 0.6], [0.3, 0.2, 0.3]);
    cols.push({ shape: cylS(0.6, h / 2), p: [x, h / 2, z] });
  }
  // 가운데 큰 그루터기 무대 + 안내 돌
  B.add(G.taper(0.92), 'matte', '#c6976a', [0, 0.2, 0], [2.4, 0.4, 2.4]);
  B.add(G.cyl(24), 'matte', '#f6dcb0', [0, 0.41, 0], [2.2, 0.02, 2.2]);
  B.add(G.torus(0.05), 'matte', '#dcb37e', [0, 0.43, 0], [1.4, 1.4, 1.4], [Math.PI / 2, 0, 0]);
  B.add(G.torus(0.05), 'matte', '#dcb37e', [0, 0.43, 0], [0.7, 0.7, 0.7], [Math.PI / 2, 0, 0]);
  // 클로버 풀밭 + 꽃
  for (let i = 0; i < 16; i++) flower(B, [Math.cos(i * 0.7) * (6.4 + rnd()), 0, Math.sin(i * 0.7) * (6.4 + rnd())], ['#ffd1e8', '#fff3a8', '#d9c8ff'][i % 3], 1.1);
  B.add(G.cyl(8), 'matte', '#c9955f', [0, 0.45, 6.58], [0.1, 0.9, 0.1]);
  root.add(B.bake('fairy-ring'));
  // 버섯 고리(낮: 점박이 버섯 · 보름 밤: 빛나는 갓으로 바뀐다)
  const day = newB(), lit = newB();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, r = 3.4 + (i % 2) * 0.25, s = 0.75 + (i % 3) * 0.2;
    const p: V3 = [Math.cos(a) * r, 0, Math.sin(a) * r];
    mushroom(day, p, ['#ff8a9a', '#ffb3c8', '#ff9fe0'][i % 3], s);
    mushroom(lit, p, ['#ff8ad8', '#7fe0ff', '#ffe07a'][i % 3], s * 1.05, 'glow');
  }
  const ringDay = day.bake('fairy-mush-day', { shadow: false });
  const ringLit = lit.bake('fairy-mush-lit', { shadow: false });
  root.add(ringDay, ringLit);
  // 안내판
  const sign = picturePlane('fairy-sign', 1.4, 0.55, 384, 150, (g, w, h) => drawSign(g, w, h, ['쉿! 보름달 밤 🌕', '요정들이 춤추는 곳'], { bg: '#fff3fb', border: '#f0a8d0' }), { transparent: true });
  sign.position.set(0, 1.0 + GY(0, 6.6), 6.6);
  root.add(sign);
  // 요정 넷(보름 밤에만) — 가운데를 돌며 춤. 떼 지어 그린다(부분마다 한 번)
  const dancers = new THREE.Group();
  dancers.name = 'secrets-fairies';
  dancers.position.y = GY(0, 0) + 0.4;
  const FC = ['#ffb8e8', '#b8e8ff', '#fff0a8', '#e0c8ff'];
  const swarm = fairySwarm(FC);
  dancers.add(swarm.root);
  root.add(dancers);
  const dust = glints(26, 3.6, 2.6, '#fff4c2', rnd);
  dancers.add(dust.mesh);
  dancers.visible = false;
  return {
    id: 'home-fairy-ring', root, cols,
    update(t, s) {
      ringDay.visible = !s.open;
      ringLit.visible = s.open;
      dancers.visible = s.open;
      if (!s.open) return;
      FC.forEach((_, i) => {
        const a = t * 0.8 + (i / FC.length) * Math.PI * 2;
        const r = 2.4 + Math.sin(t * 1.3 + i) * 0.4;
        swarm.set(i, Math.cos(a) * r, 1.0 + Math.sin(t * 3 + i * 1.7) * 0.35, Math.sin(a) * r, -a, 2.2, t);
      });
      swarm.flush();
      dust.update(t);
    },
  };
}

// ───────────── ④ 분화구 용암석 정원 ─────────────
/** 정원 돌 테라스(타원) — 가파른 분화구 벽에 평평하게 깎아 쌓은 단. 뿌리 y = 테라스 윗면 */
const LAVA_TERRACE = { cz: 1.6, rx: 7.2, rz: 3.4, depth: 10 };
const inTerrace = (lx: number, lz: number, k = 1) => (lx / (LAVA_TERRACE.rx * k)) ** 2 + ((lz - LAVA_TERRACE.cz) / (LAVA_TERRACE.rz * k)) ** 2 <= 1;
function lavaGarden(rnd: () => number): SpotModel {
  const root = mk('dino-lava-garden');
  const B = new Builder(); // 테라스 위는 평평(비탈 따라 앉히지 않는다)
  const T = LAVA_TERRACE;
  // 돌 테라스: 큰 타원 단 + 테두리 돌 + 윗면 모래
  B.add(G.taper(0.9, 36), 'matte', '#b8968a', [0, -T.depth / 2, T.cz], [T.rx * 2.2, T.depth, T.rz * 2.2]);
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2;
    B.add(G.lump(k), 'matte', ['#a68ca0', '#b89aaa', '#9e8496'][k % 3], [Math.cos(a) * T.rx * 0.98, 0.05, T.cz + Math.sin(a) * T.rz * 0.98], [0.9, 0.55, 0.8], [0, -a, 0]);
  }
  B.add(G.cyl(36), 'matte', '#f0d2b0', [0, 0.02, T.cz], [T.rx * 1.8, 0.06, T.rz * 1.8]);
  // 갈퀴 무늬 모래 조각(동심원)
  const patches: Array<[number, number, number]> = [[0, 3.2, 1.6], [-4.4, 2.2, 1.2], [4.4, 1.4, 1.1]];
  for (const [x, z, r] of patches) {
    B.add(G.cyl(28), 'matte', '#f6dcbc', [x, 0.06, z], [r * 2, 0.04, r * 2]);
    for (let k = 1; k <= 2; k++) B.add(G.torus(0.04), 'matte', '#dfb894', [x, 0.09, z], [r * k * 0.5, r * k * 0.5, r * k * 0.5], [Math.PI / 2, 0, 0]);
  }
  // 용암석(보랏빛 갈색 + 빛나는 금)
  const stones: Array<[number, number, number]> = [[-2.4, 0.4, 1.0], [2.2, 0.2, 0.9], [-0.6, 4.4, 0.7], [-5.6, 2.6, 0.6], [5.8, 2.4, 0.6]];
  stones.forEach(([x, z, s], i) => {
    B.add(G.lump(i), 'matte', ['#8f6f8f', '#a07a94', '#94708a'][i % 3], [x, s * 0.4, z], [s * 1.2, s, s * 1.1], [0, i, 0]);
    for (let k = 0; k < 4; k++) B.add(G.sphere(), 'glow', '#ffb36a', [x + Math.cos(k * 1.6 + i) * s * 0.55, s * 0.4 + Math.sin(k * 2.1) * s * 0.3, z + Math.sin(k * 1.6 + i) * s * 0.5], [0.12, 0.05, 0.12]);
  });
  // 하트 돌 · 돌탑 · 용암 연못 둘 · 불꽃꽃(테두리)
  B.add(G.heart(), 'gloss', '#ff9aa8', [0, 0.7, 1.4], [1.2, 1.2, 1.4], [0.1, 0, 0]);
  for (const [x, z] of [[5.6, 0.4], [-5.8, 0.6]] as const) for (let k = 0; k < 4; k++) B.add(G.lump(k + 2), 'matte', ['#b89aaa', '#a68ca0', '#c4aab8', '#9e8496'][k], [x, 0.18 + k * 0.34, z], 0.6 - k * 0.1);
  for (const [x, z, r] of [[-1.2, -0.6, 0.7], [1.8, 4.0, 0.7]] as const) {
    B.add(G.disc(), 'glow', '#ff9a5a', [x, 0.1, z], [r * 2, 1, r * 2]);
    B.add(G.disc(), 'glow', '#ffd27a', [x, 0.11, z], [r * 1.1, 1, r * 1.1]);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; B.add(G.lump(k), 'matte', '#8a6a86', [x + Math.cos(a) * r, 0.12, z + Math.sin(a) * r], 0.36); }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.3, x = Math.cos(a) * T.rx * 0.86, z = T.cz + Math.sin(a) * T.rz * 0.84;
    B.add(G.cyl(6), 'matte', '#8fb86a', [x, 0.25, z], [0.05, 0.5, 0.05]);
    B.add(G.cone(8), 'glow', ['#ff8a6a', '#ffb347', '#ff9ac0'][i % 3], [x, 0.62, z], [0.22, 0.34, 0.22]);
  }
  // 돌 등롱(빛, 들어오는 쪽) + 앉는 돌 벤치
  B.add(G.taper(0.7), 'matte', '#c4aab8', [-6.0, 0.5, 3.0], [0.6, 1.0, 0.6]);
  B.add(G.box(0.1), 'matte', '#b89aaa', [-6.0, 1.15, 3.0], [0.7, 0.4, 0.7]);
  B.add(G.sphere(), 'glow', '#ffcf7a', [-6.0, 1.15, 3.0], 0.26);
  B.add(G.cone(4), 'matte', '#a68ca0', [-6.0, 1.55, 3.0], [1.0, 0.45, 1.0], [0, Math.PI / 4, 0]);
  B.add(G.box(0.2), 'matte', '#b89aaa', [-2.8, 0.32, 4.2], [2.4, 0.3, 0.8], [0, 0.25, 0]);
  // 하루 줍기: 따끈한 화산유리 무더기(반짝)
  const P = ANCHORS['dino-lava-garden'].pick;
  for (let k = 0; k < 5; k++) B.add(G.crystal(), 'gloss', '#ffb0a0', [P[0] + Math.cos(k * 1.3) * 0.4, 0.05, P[2] + Math.sin(k * 1.3) * 0.4], 0.35 + (k % 2) * 0.1, [0.3 * Math.cos(k), 0, 0.3 * Math.sin(k)]);
  root.add(B.bake('lava-garden'));
  const embers = new Motes(sparkGeometry(), glowMat('#ffb36a', 0.9), Array.from({ length: 22 }, () => {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.9;
    return { x: Math.cos(a) * T.rx * r, y: 0.2, z: T.cz + Math.sin(a) * T.rz * r, s: 0.07 + rnd() * 0.05 };
  }), rnd, 'rise', 3.2);
  root.add(embers.mesh);
  const chest = chestModel('gold');
  const C = ANCHORS['dino-lava-garden'].chest;
  chest.position.set(C[0], 0.06, C[2]);
  chest.rotation.y = 0.6;
  root.add(chest);
  const pickGlow = glints(8, 0.8, 0.8, '#ffe0a8', rnd);
  pickGlow.mesh.position.set(P[0], 0, P[2]);
  root.add(pickGlow.mesh);
  return {
    id: 'dino-lava-garden', root,
    cols: [
      // 테라스(타원을 원기둥 셋으로) — 윗면 y = 0
      ...[-4.2, 0, 4.2].map((x): LocalCol => ({ shape: cylS(3.4, T.depth / 2), p: [x, -T.depth / 2, T.cz] })),
      ...stones.map(([x, z, s]): LocalCol => ({ shape: cylS(s * 0.5, s * 0.4), p: [x, s * 0.4, z] })),
    ],
    deck: (lx, lz) => (inTerrace(lx, lz, 0.96) ? 0 : null),
    update(t, s) {
      embers.update(t);
      chest.visible = s.chest;
      pickGlow.mesh.visible = s.daily;
      if (s.daily) pickGlow.update(t);
    },
  };
}

// ───────────── ⑤ 고대 벽화 동굴(입구) ─────────────
function muralCave(rnd: () => number): SpotModel {
  const root = mk('dino-mural-cave');
  const B = newB();
  const cols = archMouth(B, { w: 4.4, h: 3.6, rock: ['#d9b48a', '#cfa57c', '#e2c29a'], moss: '#8fc86a', seed: 3, mouth: '#4a3a52' });
  // 바위에 찍힌 손바닥·발자국 물감(주황·분홍·하늘)
  for (let i = 0; i < 7; i++) {
    const a = 0.3 + (i / 6) * (Math.PI - 0.6);
    B.add(G.sphere(), 'matte', ['#ff9a6a', '#ff9fc0', '#7fc8ff'][i % 3], [Math.cos(a) * 2.9, Math.sin(a) * 3.3 + 0.2, 0.9], [0.32, 0.32, 0.06]);
  }
  // 동굴로 들어가는 공룡 발자국(세 발가락)
  for (let i = 0; i < 6; i++) {
    const x = (i % 2 ? 0.45 : -0.45), z = 5.4 - i * 0.9;
    B.add(G.sphere(), 'matte', '#c49a72', [x, 0.03, z], [0.42, 0.04, 0.4]);
    for (const dx of [-0.16, 0, 0.16]) B.add(G.sphere(), 'matte', '#c49a72', [x + dx, 0.03, z - 0.3], [0.12, 0.04, 0.2]);
  }
  // 횃불 둘(밤에 더 환하다)
  for (const s of [-1, 1]) {
    B.add(G.cyl(8), 'matte', '#a67a52', [s * 3.2, 0.8, 1.4], [0.12, 1.6, 0.12]);
    B.add(G.taper(1.4, 10), 'matte', '#8a6a4a', [s * 3.2, 1.65, 1.4], [0.3, 0.2, 0.3]);
  }
  // 덩굴(늘어진 초록 구슬)
  for (let i = 0; i < 5; i++) for (let k = 0; k < 4; k++) B.add(G.sphere(), 'soft', k % 2 ? '#7cc46a' : '#9fd88a', [-1.6 + i * 0.8, 3.4 - k * 0.38, 0.6], 0.2);
  for (let i = 0; i < 5; i++) B.add(G.lump(i), 'soft', '#7fbf6a', [-3.6 + rnd() * 7.2, 0.25, 2.4 + rnd() * 1.6], [0.9, 0.6, 0.9]);
  root.add(B.bake('mural-cave'));
  const flames = torchFlames([[-3.2, 1.9 + GY(-3.2, 1.4), 1.4], [3.2, 1.9 + GY(3.2, 1.4), 1.4]]);
  root.add(flames.group);
  return { id: 'dino-mural-cave', root, cols, update(t, s) { flames.update(t, 0.7 + s.night * 0.5); } };
}

/** 횃불 불꽃(작은 빛 원뿔 둘 겹침 — 흔들) */
export function torchFlames(pts: V3[]): { group: THREE.Group; update(t: number, k?: number): void } {
  const group = new THREE.Group();
  group.name = 'secrets-flames';
  // 바깥 불꽃 · 안쪽 불꽃 — 불이 몇 개든 그리기 둘
  const outer = new THREE.InstancedMesh(G.cone(10), glowMat('#ffb36a', 0.85), pts.length);
  const inner = new THREE.InstancedMesh(G.cone(10), glowMat('#fff0a0', 0.95), pts.length);
  for (const m of [outer, inner]) { m.castShadow = false; m.receiveShadow = false; group.add(m); }
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const set = (t: number, k: number) => {
    pts.forEach((p, i) => {
      const ph = i * 1.7, w = 1 + Math.sin(t * 11 + ph) * 0.12 + Math.sin(t * 17 + ph * 2) * 0.08;
      outer.setMatrixAt(i, M.compose(v.set(p[0], p[1], p[2]), q, sc.set(0.3 * k, 0.55 * w * k, 0.3 * k)));
      inner.setMatrixAt(i, M.compose(v.set(p[0], p[1] - 0.05, p[2]), q, sc.set(0.16 * k, 0.32 * w * k, 0.16 * k)));
    });
    outer.instanceMatrix.needsUpdate = true; inner.instanceMatrix.needsUpdate = true;
  };
  set(0, 1);
  outer.computeBoundingSphere(); inner.computeBoundingSphere();
  for (const m of [outer, inner]) m.boundingSphere!.radius += 0.6;
  return { group, update(t, k = 1) { set(t, k); } };
}

// ───────────── ⑥ 해안 거품동굴(입구) ─────────────
function bubbleCave(rnd: () => number): SpotModel {
  const root = mk('dino-bubble-cave');
  const B = newB();
  const cols = archMouth(B, { w: 4.6, h: 3.4, rock: ['#9ec4cf', '#b2d2da', '#8fb8c6'], seed: 5, mouth: '#36506a' });
  // 따개비·조개·불가사리
  for (let i = 0; i < 10; i++) {
    const a = 0.2 + (i / 9) * (Math.PI - 0.4);
    B.add(G.taper(0.6, 8), 'matte', '#eef4ff', [Math.cos(a) * 2.7, Math.sin(a) * 3.1, 0.95], [0.22, 0.16, 0.22], [Math.PI / 2, 0, 0]);
  }
  for (let i = 0; i < 4; i++) B.add(G.star(), 'gloss', ['#ff9a8a', '#ffb86a', '#ff9fc0', '#c8a8ff'][i], [-2.8 + i * 1.8 + rnd() * 0.4, 0.05, 2.4 + rnd()], [0.4, 0.4, 0.26], [-Math.PI / 2, 0, rnd() * 6]);
  B.add(G.disc(), 'water', '#8fe3f0', [0, 0.05, 0.8], [3.4, 1, 2.2]);
  root.add(B.bake('bubble-cave'));
  const bubbles = new Motes(G.sphere(), plainMat('glass'), Array.from({ length: 16 }, () => { const x = -1.4 + rnd() * 2.8, z = 0.2 + rnd() * 1.2; return { x, y: 0.1 + GY(x, z), z, s: 0.14 + rnd() * 0.2 }; }), rnd, 'rise', 3.6);
  root.add(bubbles.mesh);
  return { id: 'dino-bubble-cave', root, cols, update(t) { bubbles.update(t); } };
}

// ───────────── ⑦ 빙하 속 아기 매머드 ─────────────
function mammothSpot(rnd: () => number): SpotModel {
  const root = mk('ice-mammoth');
  const B = newB();
  // 뒤쪽 빙하 벽(큰 얼음 조각들)
  for (let i = 0; i < 7; i++) {
    const x = -5 + i * 1.7, h = 3.2 + ((i * 5) % 3) * 0.9;
    B.add(G.lump(i), 'ice', i % 2 ? '#cfeeff' : '#b8e4ff', [x, h * 0.45, -2.6 - (i % 2) * 0.6], [1.9, h, 1.8]);
  }
  for (let i = 0; i < 9; i++) B.add(G.sphere(), 'soft', '#f7fbff', [-5 + rnd() * 10, 0.1, -1.4 + rnd() * 5], [1.2 + rnd(), 0.4, 1.0 + rnd()]);
  // 따뜻한 것 받침 셋(돌 접시)
  for (const x of [-1.3, 0, 1.3]) {
    B.add(G.taper(1.3, 14), 'matte', '#c9c4d6', [x, 0.3, 2.3], [0.7, 0.6, 0.7]);
    B.add(G.cyl(16), 'matte', '#e2dcec', [x, 0.61, 2.3], [0.62, 0.04, 0.62]);
  }
  // 모닥불 자리(돌 둥글게)
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; B.add(G.lump(k), 'matte', '#b8b4c8', [Math.cos(a) * 0.75, 0.15, 3.5 + Math.sin(a) * 0.75], 0.4); }
  // 안내 표지(나무 팻말)
  B.add(G.cyl(8), 'matte', '#c9955f', [3.4, 0.6, 2.6], [0.1, 1.2, 0.1]);
  root.add(B.bake('mammoth-glacier'));
  const sign = picturePlane('mammoth-sign', 1.5, 0.6, 384, 150, (g, w, h) => drawSign(g, w, h, ['🦣 꽁꽁 얼었어요', '따뜻한 것 3개 · 또는 모닥불'], { bg: '#f2faff', border: '#9fd0f0' }), { transparent: true });
  sign.position.set(3.4, 1.35 + GY(3.4, 2.6), 2.68);
  root.add(sign);
  // 얼음 덩어리 + 안의 매머드
  const mam = babyMammoth(0.7);
  const g0 = GY(0, 0.1);
  mam.root.position.set(0, 0.05 + g0, 0.1);
  root.add(mam.root);
  const iceB = new Builder();
  iceB.add(G.box(0.4), 'ice', '#c8ecff', [0, 1.25, 0.1], [2.6, 2.5, 2.9]);
  for (let i = 0; i < 6; i++) iceB.add(G.crystal(), 'ice', '#e2f6ff', [-1.2 + (i % 3) * 1.2, 2.4, -0.8 + Math.floor(i / 3) * 1.8], 0.5 + (i % 2) * 0.2, [(i % 2) * 0.3, i, 0]);
  const iceBlock = iceB.bake('mammoth-ice', { shadow: false });
  iceBlock.position.y = g0;
  root.add(iceBlock);
  // 받침 위 따뜻한 것(빛나는 불씨)
  const HOT_X = [-1.3, 0, 1.3];
  const GY0 = HOT_X.map((x) => GY(x, 2.3));
  const hot = new THREE.InstancedMesh(G.crystal(), glowMat('#ffb36a', 0.95), HOT_X.length);
  hot.castShadow = false;
  hot.count = 0;
  hot.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8 + GY(0, 2.3), 2.3), 2.2);
  root.add(hot);
  const hm = new THREE.Matrix4(), hv = new THREE.Vector3(), hq = new THREE.Quaternion(), hs = new THREE.Vector3();
  // 모닥불(장작 + 불꽃)
  const fireG = new THREE.Group();
  fireG.name = 'secrets-campfire';
  const FB = new Builder();
  for (let k = 0; k < 4; k++) FB.add(G.capsule(), 'matte', '#a87a52', [0, 0.16, 0], [0.14, 0.9, 0.14], [Math.PI / 2 - 0.35, (k / 4) * Math.PI * 2, 0]);
  fireG.add(FB.bake('campfire-logs'));
  const flames = torchFlames([[0, 0.55, 0], [0.15, 0.45, 0.1], [-0.15, 0.45, -0.08]]);
  fireG.add(flames.group);
  fireG.position.set(0, GY(0, 3.5), 3.5);
  root.add(fireG);
  // 물방울(녹을 때) · 하트(풀려날 때)
  const drips = new Motes(G.sphereLo(), glowMat('#dff6ff', 0.8), Array.from({ length: 16 }, () => ({ x: -1.3 + rnd() * 2.6, y: 0.1 + g0, z: -1.2 + rnd() * 2.6, s: 0.1 + rnd() * 0.06 })), rnd, 'rise', 2.4);
  root.add(drips.mesh);
  const hearts = new Motes(G.heart(), glowMat('#ff9fc0', 0.95), Array.from({ length: 8 }, () => ({ x: -1 + rnd() * 2, y: 1.6 + g0, z: -0.6 + rnd() * 1.2, s: 0.25 + rnd() * 0.1 })), rnd, 'rise', 2.2);
  root.add(hearts.mesh);
  const puddle = new THREE.Mesh(G.disc(), plainMat('water'));
  puddle.position.set(0, 0.05 + g0, 0.1);
  root.add(puddle);
  return {
    id: 'ice-mammoth', root,
    cols: [{ shape: box(2.5, 2.2, 0.9), p: [0, 2.2 + GY(0, -2.8), -2.8] }],
    update(t, s) {
      const st = s.mammoth;
      const ph = st?.phase ?? 'frozen';
      const p = st ? thawProgress(st) : 0;
      hot.count = st && ph !== 'free' ? Math.min(HOT_X.length, st.heat) : 0;
      for (let i = 0; i < hot.count; i++) {
        const x = HOT_X[i];
        hot.setMatrixAt(i, hm.compose(hv.set(x, 0.65 + GY0[i], 2.3), hq, hs.setScalar(0.32 + Math.sin(t * 4 + i) * 0.03)));
      }
      if (hot.count) hot.instanceMatrix.needsUpdate = true;
      fireG.visible = !!st?.fire && ph !== 'free';
      if (fireG.visible) flames.update(t, 1.4);
      iceBlock.visible = ph !== 'free';
      if (iceBlock.visible) {
        const k = 1 - p * 0.85;
        iceBlock.scale.set(0.15 + k * 0.85, k, 0.15 + k * 0.85);
        iceBlock.position.x = ph === 'thawing' ? Math.sin(t * 30) * 0.03 : 0;
      }
      drips.mesh.visible = ph === 'thawing';
      if (drips.mesh.visible) drips.update(t * 1.6);
      puddle.visible = ph !== 'frozen';
      puddle.scale.setScalar(1.5 + p * 3.5);
      // 매머드: 얼어서 가만히 → 녹으며 꿈틀 → 풀려나 콩콩 뛰고 하트, 한참 뒤엔 눈사람 마을로 떠난다
      const age = s.freeAge ?? 0;
      const gone = ph === 'free' && age > 9;
      mam.root.visible = !gone;
      hearts.mesh.visible = ph === 'free' && !gone;
      if (ph === 'frozen') { mam.body.scale.setScalar(1); mam.trunk.rotation.set(-0.15, 0, 0); mam.root.position.y = 0.05 + g0; }
      else if (ph === 'thawing') mam.animate(t, p);
      else if (!gone) {
        mam.animate(t, 1);
        mam.root.position.y = 0.05 + g0 + Math.abs(Math.sin(t * 5)) * 0.35;
        mam.root.position.z = 0.1 + Math.min(1, Math.max(0, age - 5) / 4) * 5;
        mam.root.rotation.y = age > 5 ? 0 : Math.sin(t * 2) * 0.4;
        hearts.update(t);
      }
    },
  };
}

// ───────────── ⑧ 오로라 얼음 동굴(입구) ─────────────
function auroraCave(rnd: () => number): SpotModel {
  const root = mk('ice-aurora-cave');
  const B = newB();
  const cols = archMouth(B, { w: 4.8, h: 3.8, rock: ['#cfe6f6', '#bcdcf2', '#e0f0fa'], snow: true, seed: 6, mouth: '#3a4c72' });
  // 고드름
  for (let i = 0; i < 9; i++) {
    const a = 0.25 + (i / 8) * (Math.PI - 0.5);
    B.add(G.cone(8), 'ice', '#e6f8ff', [Math.cos(a) * 2.0, Math.sin(a) * 3.2 - 0.35, 0.6], [0.2, 0.7 + (i % 3) * 0.25, 0.2], [Math.PI, 0, 0]);
  }
  for (let i = 0; i < 6; i++) B.add(G.crystal(), 'ice', ['#c8f0ff', '#e0d0ff', '#c8ffe8'][i % 3], [-3.4 + i * 1.35, 0, 1.6 + (i % 2) * 0.8], 0.5 + rnd() * 0.4, [0.2 * (i % 2 ? 1 : -1), i, 0]);
  root.add(B.bake('aurora-cave'));
  // 얼음 문(닫힘) — 서리 무늬가 반짝
  const door = newB();
  door.add(G.box(0.3), 'ice', '#bfe6ff', [0, 1.6, 0.2], [3.6, 3.2, 0.5]);
  for (let i = 0; i < 7; i++) door.add(G.star(), 'glow', '#f2fbff', [-1.3 + (i % 4) * 0.85, 0.7 + Math.floor(i / 4) * 1.3 + (i % 2) * 0.3, 0.5], 0.28);
  const doorG = door.bake('aurora-door', { shadow: false });
  root.add(doorG);
  // 열린 입 안쪽 오로라 빛(초록·분홍 띠)
  const glow = new THREE.Group();
  glow.name = 'secrets-aurora-glow';
  const ribbons = ['#9ff0d6', '#c8a8ff', '#ff9fd0'].map((c, i) => {
    const m = new THREE.Mesh(G.capsule(), glowMat(c, 0.55));
    m.position.set(-0.8 + i * 0.8, 1.6 + GY(0, -0.3), -0.3);
    m.scale.set(0.5, 2.0, 0.08);
    glow.add(m);
    return m;
  });
  const ay = GY(0, -0.3);
  const sp = glints(18, 2.0, 3.0, '#e8fff6', rnd);
  sp.mesh.position.y = ay;
  glow.add(sp.mesh);
  root.add(glow);
  return {
    id: 'ice-aurora-cave', root, cols,
    update(t, s) {
      doorG.visible = !s.open;
      glow.visible = s.open;
      if (s.open) {
        ribbons.forEach((m, i) => { m.position.y = 1.6 + ay + Math.sin(t * 1.2 + i) * 0.25; m.rotation.z = Math.sin(t * 0.8 + i * 2) * 0.25; });
        sp.update(t);
      }
    },
  };
}

// ───────────── ⑨ 눈사태 상자 무덤 ─────────────
function avalanche(rnd: () => number): SpotModel {
  const root = mk('ice-avalanche');
  const B = newB();
  // 쏟아진 눈 더미 띠(비탈 위쪽 −z 로 갈수록 크게)
  for (let i = 0; i < 14; i++) B.add(G.sphere(), 'soft', i % 3 ? '#f7fbff' : '#eaf4ff', [-6 + rnd() * 12, 0.2, -5 + rnd() * 3.5], [2 + rnd() * 2, 0.9 + rnd() * 0.8, 1.6 + rnd()]);
  // 부서진 썰매 · 기울어진 깃발 · 팻말
  B.add(G.box(0.1), 'matte', '#ff9a8a', [-5.0, 0.35, 3.0], [1.6, 0.16, 0.7], [0.1, 0.5, 0.25]);
  for (const s of [-1, 1]) B.add(G.capsule(), 'metal', '#dfe6f2', [-5.0 + s * 0.05, 0.12, 3.0 + s * 0.3], [0.06, 1.7, 0.06], [0, 0.5, Math.PI / 2]);
  B.add(G.cyl(6), 'matte', '#c9955f', [5.4, 1.0, 2.6], [0.08, 2.0, 0.08], [0, 0, 0.18]);
  B.add(G.box(0.02), 'soft', '#ffb3c8', [5.7, 1.8, 2.6], [0.6, 0.4, 0.03], [0, 0, 0.18]);
  B.add(G.cyl(8), 'matte', '#c9955f', [-2.2, 0.6, 3.6], [0.1, 1.2, 0.1]);
  root.add(B.bake('avalanche'));
  const sign = picturePlane('aval-sign', 1.5, 0.6, 384, 150, (g, w, h) => drawSign(g, w, h, ['상자 무덤 🏔️', '삽으로 콕콕 파 봐요'], { bg: '#f2faff', border: '#9fd0f0' }), { transparent: true });
  sign.position.set(-2.2, 1.35 + GY(-2.2, 3.6), 3.68);
  root.add(sign);
  // 눈 더미 4: 상자 모서리가 삐죽(오늘 안 팠으면) / 판 자리는 납작 + 열린 상자 — 더미마다 상자까지 한 덩이로 굽는다
  const MA = Array.from({ length: AVALANCHE_MOUNDS }, (_, i) => ANCHORS['ice-avalanche'][`m${i}`]);
  const mounds = MA.map((A, i) => {
    const g = new THREE.Group();
    g.position.set(A[0], GY(A[0], A[2]), A[2]);
    const M = new Builder();
    M.add(G.sphere(), 'soft', '#f7fbff', [0, 0.25, 0], [2.2, 1.3, 2.0]);
    M.add(G.sphere(), 'soft', '#eef6ff', [0.5, 0.5, -0.3], [1.0, 0.7, 0.9]);
    M.push([-0.2, 0.35, 0.35], [0.5, 0.6, 0.3], 0.7);
    chestInto(M, i === 2 ? 'gold' : 'silver');
    M.pop();
    const full = M.bake(`aval-mound-${i}`);
    const flat = new Builder();
    flat.add(G.sphere(), 'soft', '#f2f8ff', [0, 0.05, 0], [2.4, 0.25, 2.2]);
    flat.push([0, 0.1, 0.1], [0, 0, 0], 0.6);
    chestInto(flat, 'wood', true);
    flat.pop();
    const dugG = flat.bake(`aval-dug-${i}`, { shadow: false });
    g.add(full, dugG);
    root.add(g);
    return { full, dugG };
  });
  // 반짝이(안 판 더미 둘레만) — 넷을 한 떼로
  const per = 6;
  const glPts = MA.flatMap((A) => Array.from({ length: per }, () => {
    const a = rnd() * Math.PI * 2, rr = 0.6 * (0.3 + rnd() * 0.7);
    return { x: A[0] + Math.cos(a) * rr, y: GY(A[0], A[2]) + 0.3 + rnd() * 0.8, z: A[2] + Math.sin(a) * rr, s: 0.08 + rnd() * 0.06 };
  }));
  const gl = new Motes(sparkGeometry(), glowMat('#fff3a8', 0.95), glPts, rnd);
  root.add(gl.mesh);
  let dugNow: boolean[] = [];
  const keep = (k: number) => !dugNow[Math.floor(k / per)];
  return {
    id: 'ice-avalanche', root, cols: [],
    update(t, s) {
      dugNow = s.dug ?? [];
      mounds.forEach((m, i) => {
        const dug = !!dugNow[i];
        m.full.visible = !dug; m.dugG.visible = dug;
      });
      gl.mesh.visible = mounds.some((_, i) => !dugNow[i]);
      if (gl.mesh.visible) gl.update(t, 1, keep);
    },
  };
}

// ───────────── ⑩ 버섯 탑 꼭대기 달 관측대 ─────────────
function moonDeck(rnd: () => number): SpotModel {
  const root = mk('mush-moon-deck');
  const B = newB();
  // 방석 셋 + 낮은 둥근 상 + 찻잔
  for (const [x, z, c] of [[-1.6, 5.4, '#ffc2d6'], [1.8, 5.2, '#c8d8ff'], [5.4, 1.6, '#fff0a8']] as const) {
    B.add(G.sphere(), 'soft', c, [x, 0.14, z], [1.1, 0.3, 1.1]);
    B.add(G.sphere(), 'soft', '#fffaf2', [x, 0.3, z], 0.12);
  }
  B.add(G.cyl(20), 'matte', '#c8955f', [0.6, 0.38, 3.4], [1.6, 0.12, 1.6]);
  B.add(G.cyl(10), 'matte', '#a77650', [0.6, 0.18, 3.4], [0.25, 0.36, 0.25]);
  for (let k = 0; k < 3; k++) { const a = k * 2.1; B.add(G.taper(1.3, 12), 'gloss', '#fff8ee', [0.6 + Math.cos(a) * 0.45, 0.52, 3.4 + Math.sin(a) * 0.45], [0.16, 0.16, 0.16]); }
  B.add(G.sphere(), 'gloss', '#ffd3e0', [0.6, 0.56, 3.4], [0.3, 0.26, 0.3]);
  // 별 등불 넷(작은 기둥 + 별)
  const lamps: V3[] = [[-5.6, 0, -2.0], [-2.4, 0, -5.8], [3.0, 0, -5.4], [6.0, 0, 3.6]];
  for (const [x, , z] of lamps) B.add(G.cyl(8), 'matte', '#fff3e0', [x, 0.5, z], [0.08, 1.0, 0.08]);
  // 작은 놋쇠 망원경(삼각대) — 달 관측하기
  const S = ANCHORS['mush-moon-deck'].scope;
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; B.rod([S[0] + Math.cos(a) * 0.4, 0, S[2] + Math.sin(a) * 0.4], [S[0], 1.0, S[2]], 0.04, 'matte', '#a77650'); }
  B.add(G.taper(0.7, 16), 'metal', '#ffd27a', [S[0], 1.35, S[2]], [0.28, 1.2, 0.28], [0.9, 0.6, 0]);
  B.add(G.sphere(), 'gloss', '#7fd3ff', [S[0] + 0.3, 1.7, S[2] - 0.35], 0.12);
  root.add(B.bake('moon-deck'));
  // 별 등불(빙글) — 넷을 한 번에
  const starLamps = new THREE.InstancedMesh(G.star(), glowMat('#fff3a8', 0.95), lamps.length);
  starLamps.castShadow = false;
  root.add(starLamps);
  const lm = new THREE.Matrix4(), lv = new THREE.Vector3(), lq = new THREE.Quaternion(), ls = new THREE.Vector3(), ly = new THREE.Vector3(0, 1, 0);
  const setLamps = (t: number, night: number) => {
    lamps.forEach(([x, , z], i) => starLamps.setMatrixAt(i, lm.compose(lv.set(x, 1.15, z), lq.setFromAxisAngle(ly, t * 0.8 + i), ls.setScalar(0.3 + night * 0.16 + Math.sin(t * 2 + i) * 0.02))));
    starLamps.instanceMatrix.needsUpdate = true;
  };
  setLamps(0, 0);
  starLamps.computeBoundingSphere();
  starLamps.boundingSphere!.radius += 1;
  const bunny = moonBunny(1.3);
  bunny.root.position.set(-1.6, 0.2, 5.4);
  bunny.root.rotation.y = Math.PI + 0.3;
  root.add(bunny.root);
  const chest = chestModel('gold');
  const C = ANCHORS['mush-moon-deck'].chest;
  chest.position.set(C[0], 0, C[2]);
  chest.rotation.y = 2.2;
  root.add(chest);
  const stars = glints(30, 6.5, 4.0, '#fff8d0', rnd);
  root.add(stars.mesh);
  return {
    id: 'mush-moon-deck', root, cols: [],
    update(t, s) {
      bunny.animate(t);
      chest.visible = s.chest;
      stars.mesh.visible = s.night > 0.4;
      if (stars.mesh.visible) stars.update(t * 0.6);
      setLamps(t, s.night);
    },
  };
}

// ───────────── ⑪ 늪 위 둥둥 오두막 ─────────────
/** pads: 로컬 연잎 징검다리 자리(오두막 앞 +z 로 물가까지) */
function swampHut(rnd: () => number, padLen: number): SpotModel {
  const root = mk('mush-swamp-hut');
  const B = newB();
  // 통나무 뗏목(둥근)
  B.add(G.cyl(28), 'matte', '#b98a5a', [0, 0.1, 0], [8.6, 0.5, 8.6]);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; B.add(G.capsule(), 'matte', k % 2 ? '#a87a4e' : '#c49766', [Math.cos(a) * 4.2, 0.12, Math.sin(a) * 4.2], [0.36, 2.0, 0.36], [Math.PI / 2, -a, 0]); }
  // 오두막(둥근 나무 벽 + 보라 버섯 지붕 + 둥근 문 + 빛 창)
  B.add(G.cyl(24), 'matte', '#d8a878', [0, 1.5, -0.3], [5.0, 2.6, 5.0]);
  for (let k = 0; k < 10; k++) B.add(G.torus(0.04), 'matte', '#c4946a', [0, 0.4 + k * 0.25, -0.3], [5.02, 5.02, 5.02], [Math.PI / 2, 0, 0]);
  B.add(G.hemi(), 'gloss', '#b48cf0', [0, 2.75, -0.3], [7.0, 3.4, 7.0]);
  for (let k = 0; k < 7; k++) { const a = k * 0.9; B.add(G.sphere(), 'matte', '#fff3fb', [Math.cos(a) * 2.2, 3.9 + Math.sin(k) * 0.3, -0.3 + Math.sin(a) * 2.2], [0.5, 0.2, 0.5]); }
  B.add(G.box(0.4), 'matte', '#8a5e40', [0, 1.05, 2.2], [1.3, 1.9, 0.2]);
  B.add(G.sphere(), 'gloss', '#ffd54a', [0.4, 1.0, 2.33], 0.08);
  B.add(G.cyl(8), 'matte', '#c49766', [1.8, 3.8, -1.0], [0.4, 1.2, 0.4]);
  // 등불 · 개구리 장식 · 연꽃
  B.add(G.cyl(8), 'matte', '#a87a4e', [-2.6, 1.0, 2.6], [0.1, 1.8, 0.1]);
  for (let i = 0; i < 6; i++) { const a = rnd() * Math.PI * 2, r = 5.5 + rnd() * 2; B.add(G.cyl(16), 'soft', '#8fd88a', [Math.cos(a) * r, 0.02, Math.sin(a) * r], [1.4, 0.04, 1.4]); B.add(G.sphere(), 'soft', '#ffc2d6', [Math.cos(a) * r, 0.16, Math.sin(a) * r], [0.4, 0.26, 0.4]); }
  // 연잎 징검다리(입구 +z 쪽, 물가까지 지그재그)
  const pads: V3[] = [];
  for (let z = 5.4, i = 0; z < padLen; z += 2.5, i++) pads.push([Math.sin(i * 1.3) * 0.9, 0, z]);
  for (const p of pads) {
    B.add(G.cyl(20), 'soft', '#8fd88a', [p[0], 0.06, p[2]], [2.2, 0.12, 2.2]);
    B.add(G.box(0.02), 'soft', '#6fbf6a', [p[0] + 0.5, 0.13, p[2]], [1.0, 0.01, 0.06], [0, 0.4, 0]);
  }
  // 빛 창(구워 넣는다 — 그리기 하나 덜기)
  B.add(G.sphere(), 'glow', '#ffe7a0', [-1.4, 1.7, 2.12], [0.7, 0.7, 0.1]);
  root.add(B.bake('swamp-hut'));
  const lamp = new THREE.Mesh(G.sphere(), glowMat('#c8ffb0', 0.95));
  lamp.position.set(-2.6, 2.0, 2.6); lamp.scale.setScalar(0.32);
  root.add(lamp);
  const flies = glints(18, 6.0, 2.4, '#d8ff9a', rnd);
  root.add(flies.mesh);
  const cols: LocalCol[] = [
    { shape: cylS(4.4, 0.3), p: [0, 0.05, 0] },
    { shape: cylS(2.45, 1.4), p: [0, 1.75, -0.3] },
    ...pads.map((p): LocalCol => ({ shape: cylS(1.1, 0.15), p: [p[0], -0.05, p[2]] })),
  ];
  return {
    id: 'mush-swamp-hut', root, cols,
    deck(lx, lz) {
      if (Math.hypot(lx, lz) < 4.3) return 0.35;
      for (const p of pads) if (Math.hypot(lx - p[0], lz - p[2]) < 1.05) return 0.1;
      return null;
    },
    update(t, s) {
      flies.update(t);
      flies.mesh.visible = s.night > 0.2;
      lamp.scale.setScalar(0.28 + s.night * 0.1);
    },
  };
}

// ───────────── ⑫ 잠든 거인 나무(속 방 입구) ─────────────
function giantTree(rnd: () => number): SpotModel {
  const root = mk('mush-tree-room');
  const B = newB();
  // 줄기(아래 넓게) + 뿌리 혹
  B.add(G.taper(0.72, 24), 'matte', '#a8805e', [0, 8, 0], [8.4, 16, 8.4]);
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + 0.3; B.add(G.lump(k), 'matte', k % 2 ? '#9a7454' : '#b28a66', [Math.cos(a) * 4.0, 0.6, Math.sin(a) * 4.0], [2.6, 1.6, 2.6], [0, -a, 0]); }
  // 이끼 띠
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; B.add(G.sphere(), 'soft', '#9fd88a', [Math.cos(a) * 3.6, 5.5 + Math.sin(k * 2) * 0.8, Math.sin(a) * 3.6], [1.4, 0.6, 1.4]); }
  // 큰 잎 뭉치(통통)
  const leaf = ['#7cc46a', '#8fd07a', '#a8dc8a', '#6fb86a'];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2, r = k === 0 ? 0 : 5.5 + rnd() * 2;
    B.add(G.sphere(), 'soft', leaf[k % 4], [Math.cos(a) * r, 18 + rnd() * 3 + (k === 0 ? 4 : 0), Math.sin(a) * r], 7 + rnd() * 2.5);
  }
  // 둥근 문 + 문틀 + 빛 창 + 작은 우체통 · 버섯
  B.add(G.cyl(24), 'matte', '#7a5238', [0, 1.3, 3.6], [2.2, 0.3, 2.2], [Math.PI / 2, 0, 0]);
  B.add(G.torus(0.14), 'matte', '#e3b07c', [0, 1.3, 3.72], [2.3, 2.3, 2.3]);
  B.add(G.sphere(), 'gloss', '#ffd54a', [0.65, 1.2, 3.8], 0.1);
  B.add(G.box(0.1), 'matte', '#c49766', [0, 0.1, 4.6], [2.4, 0.2, 1.4]);
  for (let i = 0; i < 9; i++) mushroom(B, [-4 + rnd() * 8, 0, 4.4 + rnd() * 2.2], ['#ff8a9a', '#b48cf0', '#ffb347'][i % 3], 1.0 + rnd() * 0.6);
  const ty = GY(0, 3.6);
  // 빛 창(줄기 앞 — 구워 넣는다)
  B.push([0, ty, 0]);
  B.add(G.sphere(), 'glow', '#ffe7a0', [-1.3, 3.8, 3.35], [0.9, 0.9, 0.12]);
  B.pop();
  root.add(B.bake('giant-tree'));
  // 쿨쿨 얼굴 + Zzz
  const face = sleepyFace(1.4);
  face.position.set(0, 7.2 + ty, 3.4);
  face.rotation.x = -0.05;
  root.add(face);
  const zzz = new THREE.Group();
  const zs = [0, 1, 2].map((i) => {
    const m = picturePlane('tree-z', 0.8, 0.8, 128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.font = `${h * 0.8}px Jua, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', w / 2, h / 2); }, { glow: true, color: '#e8d8ff' });
    m.scale.setScalar(0.7 + i * 0.25);
    zzz.add(m);
    return m;
  });
  zzz.position.set(1.8, 8.4 + ty, 3.6);
  root.add(zzz);
  return {
    id: 'mush-tree-room', root,
    cols: [{ shape: cylS(3.7, 8), p: [0, 8 + GY(0, 0), 0] }],
    update(t) {
      face.scale.setScalar(1.4 * (1 + Math.sin(t * 0.9) * 0.02));
      zs.forEach((m, i) => {
        const u = (t * 0.25 + i / 3) % 1;
        m.position.set(u * 1.6, u * 2.6, 0);
        (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(u * Math.PI);
      });
    },
  };
}

// ───────────── 섬 동굴 입구(PLACES.caves) ─────────────
const CAVE_LOOK: Record<string, { rock: string[]; moss?: string; snow?: boolean; mouth: string; deco: 'flower' | 'mush' | 'shell' | 'crystal' | 'fern' | 'none' }> = {
  home: { rock: ['#b8b2c8', '#a9a3bb', '#c6c0d4'], moss: '#9fd88a', mouth: '#463c5c', deco: 'flower' },
  dino: { rock: ['#c7a68c', '#b8967c', '#d2b49a'], moss: '#7fbf6a', mouth: '#4a3a52', deco: 'fern' },
  ice: { rock: ['#cfe6f6', '#bcdcf2', '#e0f0fa'], snow: true, mouth: '#3a4c72', deco: 'crystal' },
  mushroom: { rock: ['#b4a4c8', '#a696bc', '#c4b6d6'], moss: '#a8e6a0', mouth: '#3e3458', deco: 'mush' },
  coral: { rock: ['#d8c8b4', '#cbb9a4', '#e4d6c4'], mouth: '#3c4a62', deco: 'shell' },
  desert: { rock: ['#e6bf8e', '#d9ae7c', '#f0cc9e'], mouth: '#4c3a4e', deco: 'none' },
  launch: { rock: ['#b8aed0', '#a89ec2', '#c8c0dc'], mouth: '#3a3458', deco: 'crystal' },
};
export function caveEntrance(island: string, seed: number, rnd: () => number, ground?: (x: number, z: number) => number): THREE.Group {
  const L = CAVE_LOOK[island] ?? CAVE_LOOK.home;
  const B = new Builder();
  B.ground = ground ?? null;
  archMouth(B, { w: 3.8, h: 3.0, rock: L.rock, moss: L.moss, snow: L.snow, seed, mouth: L.mouth });
  for (let i = 0; i < 6; i++) {
    const p: V3 = [-2.6 + rnd() * 5.2, 0, 1.4 + rnd() * 1.6];
    if (L.deco === 'flower') flower(B, p, ['#ffd1e8', '#fff3a8', '#c8d8ff'][i % 3], 1.1);
    else if (L.deco === 'mush') mushroom(B, p, ['#ff8a9a', '#b48cf0', '#ffb347'][i % 3], 0.8);
    else if (L.deco === 'shell') B.add(G.hemi(), 'gloss', ['#fff0e6', '#ffd9e6', '#e6f2ff'][i % 3], p, [0.34, 0.18, 0.3], [0, rnd() * 6, 0]);
    else if (L.deco === 'crystal') B.add(G.crystal(), 'gloss', ['#c8f0ff', '#e0d0ff', '#c8ffe8'][i % 3], p, 0.4 + rnd() * 0.3, [0.2, i, 0.1]);
    else if (L.deco === 'fern') for (let k = 0; k < 4; k++) B.add(G.capsule(), 'soft', '#7cc46a', [p[0], 0.3, p[2]], [0.12, 0.6, 0.04], [0.6, (k / 4) * Math.PI * 2, 0]);
  }
  // 입구 안 작은 빛(뭔가 있을 것 같은 느낌)
  B.add(G.sphere(), 'glow', L.deco === 'crystal' ? '#c8f0ff' : '#fff0a8', [0.6, 0.3, -0.9], 0.18);
  const g = B.bake('secrets-cave');
  g.name = 'secrets-cave';
  return g;
}

// ───────────── 묶음 ─────────────
export interface BuildOpts {
  padLen?: number;
  /** 로컬 (x, z) 땅 높이 - 뿌리 높이(비탈에 앉히기). 없으면 평평 */
  ground?: (x: number, z: number) => number;
}
export function buildSpotModel(id: MySecret, rnd: () => number, o: BuildOpts = {}): SpotModel {
  GY = o.ground ?? (() => 0);
  try { return buildOne(id, rnd, o); } finally { GY = () => 0; }
}
function buildOne(id: MySecret, rnd: () => number, o: BuildOpts): SpotModel {
  switch (id) {
    case 'home-waterfall-cave': return waterfallCave(rnd);
    case 'home-cliff-beach': return cliffBeach(rnd);
    case 'home-fairy-ring': return fairyRing(rnd);
    case 'dino-lava-garden': return lavaGarden(rnd);
    case 'dino-mural-cave': return muralCave(rnd);
    case 'dino-bubble-cave': return bubbleCave(rnd);
    case 'ice-mammoth': return mammothSpot(rnd);
    case 'ice-aurora-cave': return auroraCave(rnd);
    case 'ice-avalanche': return avalanche(rnd);
    case 'mush-moon-deck': return moonDeck(rnd);
    case 'mush-swamp-hut': return swampHut(rnd, o.padLen ?? 30);
    case 'mush-tree-room': return giantTree(rnd);
  }
}
