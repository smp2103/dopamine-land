// 가구 모델(GDD 4.6 가구 레시피 · 5.6 동 전용 가구 · 4.12) — f_* 아이템마다 둥근 기본 도형으로 만든 코드 모델.
// 좌표: 발자국 가운데가 원점, 바닥 y = 0, 앞 = +z(돌림 0 이면 문·카메라 쪽). 가로·깊이는 furnitureDef 발자국(0.5 m 칸)에 맞춘다.
// 돌려주는 것: 굳은 조각(Builder — 방에서 다른 가구와 함께 굽는다) + 움직이는 조각(dyn: 모빌·시계 바늘·로봇 머리·알)
// + 생물 칸(slots: 수조 헤엄 · 케이지 앉기 · 피규어 받침) + 밤 불빛 자리(light).
import { Builder, G } from './kit';
import { furnitureDef, FURNITURE } from './logic';

type V3 = [number, number, number];
export type SlotMode = 'swim' | 'perch' | 'pedestal';
export interface Slot { mode: SlotMode; c: V3; s: V3; scale: number }
export type DynAnim = 'spin' | 'bob' | 'tick' | 'sway' | 'wobble' | 'creak';
export interface Dyn { b: Builder; at: V3; anim: DynAnim; speed?: number }
export interface FurnitureModel { b: Builder; slots: Slot[]; dyn: Dyn[]; light?: V3 }

// ───────────── 색 ─────────────
const C = {
  wood: '#d9a06b', woodD: '#b97f4e', woodL: '#efc795', cream: '#fff1cf', white: '#fffaf2', ink: '#3d3a4a',
  pink: '#ff9fb8', pinkL: '#ffd0de', coral: '#ff8a7a', apricot: '#ffc59a', yellow: '#ffd84a', gold: '#ffcf4a',
  lime: '#a8e06a', green: '#5cc16a', mint: '#9ef0d2', teal: '#3fc7b4', sky: '#8fd3f4', blue: '#4a9cf0', navy: '#3b5bb5',
  lav: '#c9b6f2', purple: '#a77be0', sand: '#f4e2b0', brown: '#a8764f', red: '#ff6b6b', orange: '#ffa24c', silver: '#dfe6ee',
  glass: '#d4f2ff', water: '#8fd3f4', bone: '#fff3dc', moon: '#fff6c8',
  /** 반딧불(형광 노랑) */
  neonYellow: '#f4ff8a',
};

const box = () => G.box(0.18), boxS = () => G.box(0.08), sph = () => G.sphere(), cyl = () => G.cyl(), cap = () => G.capsule();

/** 다리 네 개 */
function legs(b: Builder, w: number, d: number, h: number, color: string, r = 0.05) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(cyl(), 'matte', color, [sx * (w / 2 - r * 1.5), h / 2, sz * (d / 2 - r * 1.5)], [r * 2, h, r * 2]);
}
/** 동글 눈(가구 얼굴 — 먹색 점 + 흰 반짝) */
function dotEyes(b: Builder, y: number, z: number, gap: number, size: number) {
  for (const sx of [-1, 1]) {
    b.add(sph(), 'gloss', C.ink, [sx * gap / 2, y, z], [size, size * 1.25, size * 0.6]);
    b.add(sph(), 'glow', C.white, [sx * gap / 2 + size * 0.18, y + size * 0.25, z + size * 0.25], size * 0.3);
  }
  b.add(sph(), 'matte', C.pink, [-gap / 2 - size * 0.6, y - size * 1.1, z - size * 0.2], [size * 0.9, size * 0.5, size * 0.3]);
  b.add(sph(), 'matte', C.pink, [gap / 2 + size * 0.6, y - size * 1.1, z - size * 0.2], [size * 0.9, size * 0.5, size * 0.3]);
}
/** 물결 수조(가로 w, 깊이 d, 키 h) */
function tank(b: Builder, w: number, d: number, h: number, standH: number): Slot {
  b.add(box(), 'matte', C.wood, [0, standH / 2, 0], [w, standH, d]);
  b.add(boxS(), 'matte', C.woodD, [0, standH + 0.02, 0], [w + 0.04, 0.04, d + 0.04]);
  const gy = standH + h / 2 + 0.03;
  b.add(boxS(), 'glass', C.glass, [0, gy, 0], [w - 0.04, h, d - 0.04]);
  b.add(boxS(), 'glass', C.water, [0, gy - 0.05, 0], [w - 0.1, h - 0.16, d - 0.1]);
  b.add(boxS(), 'matte', C.sand, [0, standH + 0.07, 0], [w - 0.1, 0.06, d - 0.1]);
  // 위는 테두리만(위에서 내려다봐도 물고기가 보이게)
  for (const sz of [-1, 1]) b.add(boxS(), 'gloss', C.white, [0, standH + h + 0.05, sz * d / 2], [w + 0.04, 0.06, 0.06]);
  for (const sx of [-1, 1]) b.add(boxS(), 'gloss', C.white, [sx * w / 2, standH + h + 0.05, 0], [0.06, 0.06, d + 0.04]);
  for (const [x, z, c] of [[-0.3, 0.12, C.pinkL], [0.25, -0.15, C.lav], [0.05, 0.2, C.white]] as const) b.add(sph(), 'gloss', c, [x * w, standH + 0.11, z * d], [0.09, 0.06, 0.08]);
  for (const [x, z, hh] of [[-0.38, -0.25, 0.7], [-0.3, -0.3, 0.5], [0.36, -0.22, 0.6]] as const) b.add(cap(), 'matte', C.green, [x * w, standH + 0.09 + hh * h * 0.35, z * d], [0.06, hh * h * 0.45, 0.06], [0, 0, x * 0.4]);
  return { mode: 'swim', c: [0, gy - 0.04, 0], s: [w - 0.34, h - 0.34, d - 0.3], scale: Math.min(0.26, h * 0.4) };
}
function lampShade(b: Builder, y: number, r: number, color: string) {
  b.add(G.taper(0.62), 'cloth', color, [0, y, 0], [r * 2, r * 1.3, r * 2]);
  b.add(sph(), 'glow', '#fff3c4', [0, y - r * 0.5, 0], [r * 0.9, r * 0.5, r * 0.9]);
}
/** 받침 원판 + 기둥 */
function stand(b: Builder, h: number, color: string, r = 0.16) {
  b.add(cyl(), 'gloss', color, [0, 0.03, 0], [r * 2, 0.06, r * 2]);
  b.add(cyl(), 'matte', color, [0, h / 2, 0], [0.05, h, 0.05]);
}
/** 시계 판 + 바늘(움직이는 조각) */
function clockFace(b: Builder, y: number, z: number, r: number, ring: string, dyn: Dyn[]) {
  b.add(cyl(), 'gloss', ring, [0, y, z], [r * 2.2, 0.06, r * 2.2], [Math.PI / 2, 0, 0]);
  b.add(cyl(), 'matte', C.white, [0, y, z + 0.035], [r * 1.9, 0.02, r * 1.9], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add(sph(), 'matte', i % 3 ? C.lav : C.pink, [Math.sin(a) * r * 0.78, y + Math.cos(a) * r * 0.78, z + 0.05], 0.025 + (i % 3 ? 0 : 0.015));
  }
  const hand = new Builder();
  hand.add(boxS(), 'gloss', C.ink, [0, r * 0.32, 0], [0.025, r * 0.62, 0.015]);
  hand.add(boxS(), 'gloss', C.coral, [0, r * 0.22, 0.012], [0.035, r * 0.42, 0.015]);
  hand.add(sph(), 'gloss', C.gold, [0, 0, 0.02], 0.05);
  dyn.push({ b: hand, at: [0, y, z + 0.06], anim: 'tick' });
}

/** 가구 하나 만들기 */
export function buildFurniture(id: string): FurnitureModel {
  const def = furnitureDef(id);
  const W = def.w * 0.5, D = def.d * 0.5;
  const b = new Builder();
  const slots: Slot[] = [];
  const dyn: Dyn[] = [];
  let light: V3 | undefined;
  switch (id) {
    // ── 생물 칸이 있는 가구
    case 'f_tank': slots.push(tank(b, W * 0.92, D * 0.85, 0.62, 0.42)); break;
    case 'f_aq_grandtank': {
      const s = tank(b, W * 0.95, D * 0.85, 0.85, 0.45);
      slots.push(s, s, s);
      b.add(G.torus(0.2, Math.PI), 'gloss', C.sky, [0, 1.42, 0], [W * 0.8, 0.5, 0.3]);
      break;
    }
    case 'f_bugcage': {
      b.add(box(), 'matte', C.wood, [0, 0.08, 0], [W * 0.9, 0.16, D * 0.9]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(cyl(), 'matte', C.woodD, [sx * W * 0.4, 0.5, sz * D * 0.4], [0.045, 0.72, 0.045]);
      b.add(boxS(), 'glass', C.glass, [0, 0.5, 0], [W * 0.78, 0.7, D * 0.78]);
      b.add(G.torus(0.1), 'gloss', C.lime, [0, 0.86, 0], [W * 0.92, W * 0.92, 0.5], [Math.PI / 2, 0, 0]);
      b.add(G.hemi(), 'glass', C.lime, [0, 0.86, 0], [W * 0.9, 0.3, D * 0.9]);
      b.add(sph(), 'gloss', C.yellow, [0, 1.0, 0], 0.08);
      b.add(cyl(), 'matte', C.brown, [0, 0.42, 0], [0.04, 0.6, 0.04], [0, 0, 0.9]);
      for (const [x, y] of [[-0.18, 0.3], [0.16, 0.52], [0.02, 0.4]] as const) b.add(sph(), 'matte', C.green, [x, y, 0.02], [0.13, 0.05, 0.09], [0, 0, x]);
      b.add(sph(), 'matte', C.green, [0, 0.18, 0], [W * 0.6, 0.06, D * 0.6]);
      slots.push({ mode: 'perch', c: [0.02, 0.52, 0], s: [0.25, 0.1, 0.2], scale: 0.2 });
      break;
    }
    case 'f_figure': {
      b.add(cyl(), 'gloss', C.pink, [0, 0.12, 0], [0.42, 0.24, 0.42]);
      b.add(cyl(), 'gloss', C.pinkL, [0, 0.25, 0], [0.36, 0.04, 0.36]);
      b.add(boxS(), 'gloss', C.gold, [0, 0.12, 0.2], [0.18, 0.08, 0.02]);
      slots.push({ mode: 'pedestal', c: [0, 0.27, 0], s: [0, 0, 0], scale: 0.36 });
      break;
    }
    case 'f_incubator': {
      b.add(box(), 'gloss', C.mint, [0, 0.18, 0], [W * 0.86, 0.36, D * 0.86]);
      b.add(G.torus(0.14), 'glow', C.orange, [0, 0.38, 0], [W * 0.62, W * 0.62, 0.3], [Math.PI / 2, 0, 0]);
      b.add(G.hemi(), 'glass', C.glass, [0, 0.37, 0], [W * 0.75, 0.75, D * 0.75]);
      b.add(G.hemi(), 'gloss', C.white, [0, 0.36, 0], [W * 0.6, 0.12, D * 0.6]);
      for (const [x, c] of [[-0.16, C.red], [0, C.yellow], [0.16, C.lime]] as const) b.add(sph(), 'gloss', c, [x, 0.22, D * 0.44], 0.06);
      b.add(sph(), 'matte', C.sand, [0, 0.39, 0], [0.42, 0.08, 0.42]);
      const egg = new Builder();
      egg.add(sph(), 'gloss', C.cream, [0, 0.2, 0], [0.3, 0.4, 0.3]);
      for (const [x, y, z] of [[0.1, 0.28, 0.08], [-0.09, 0.16, 0.1], [0.02, 0.33, -0.12], [-0.11, 0.3, -0.04]] as const) egg.add(sph(), 'matte', C.lime, [x, y, z], 0.07);
      dyn.push({ b: egg, at: [0, 0.4, 0], anim: 'wobble' });
      light = [0, 0.6, 0];
      break;
    }
    // ── 불빛 가구
    case 'f_fireflylantern': {
      b.add(cyl(), 'matte', C.woodD, [0, 0.04, 0], [0.34, 0.08, 0.34]);
      b.add(cyl(), 'glass', C.glass, [0, 0.36, 0], [0.3, 0.56, 0.3]);
      b.add(G.cone(), 'gloss', C.green, [0, 0.72, 0], [0.38, 0.18, 0.38]);
      b.add(G.torus(0.14), 'metal', C.gold, [0, 0.86, 0], [0.16, 0.16, 0.16]);
      for (const [x, y, z] of [[0.05, 0.22, 0.03], [-0.06, 0.34, -0.04], [0.04, 0.46, -0.05], [-0.03, 0.55, 0.06], [0.07, 0.38, 0.06]] as const) b.add(sph(), 'glow', C.neonYellow, [x, y, z], 0.045);
      light = [0, 0.4, 0];
      break;
    }
    case 'f_corallamp': {
      b.add(sph(), 'matte', C.sand, [0, 0.06, 0], [0.4, 0.14, 0.4]);
      for (const [x, z, h, r] of [[0, 0, 0.6, 0], [-0.09, 0.03, 0.42, 0.4], [0.09, -0.02, 0.48, -0.45], [0.02, 0.08, 0.34, 0.2]] as const) b.add(cap(), 'gloss', C.coral, [x + Math.sin(r) * h * 0.3, 0.1 + h / 2, z], [0.07, h * 0.6, 0.07], [0, 0, r]);
      lampShade(b, 0.88, 0.2, C.pinkL);
      b.add(sph(), 'gloss', C.white, [0, 1.06, 0], 0.07);
      light = [0, 0.8, 0];
      break;
    }
    case 'f_amberlamp': {
      b.add(cyl(), 'matte', C.woodD, [0, 0.06, 0], [0.36, 0.12, 0.36]);
      b.add(cyl(), 'matte', C.wood, [0, 0.3, 0], [0.08, 0.4, 0.08]);
      b.add(sph(), 'glow', C.gold, [0, 0.66, 0], [0.3, 0.38, 0.3]);
      b.add(sph(), 'glass', C.orange, [0, 0.66, 0], [0.36, 0.44, 0.36]);
      b.add(sph(), 'matte', C.brown, [0.02, 0.68, 0.06], [0.06, 0.04, 0.08]);
      b.add(cyl(), 'metal', C.gold, [0, 0.9, 0], [0.14, 0.06, 0.14]);
      light = [0, 0.66, 0];
      break;
    }
    case 'f_mushlamp': {
      b.add(cyl(), 'matte', C.cream, [0, 0.32, 0], [0.12, 0.64, 0.12]);
      b.add(sph(), 'matte', C.cream, [0, 0.04, 0], [0.24, 0.08, 0.24]);
      b.add(G.hemi(), 'gloss', C.red, [0, 0.62, 0], [0.5, 0.36, 0.5]);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.add(sph(), 'matte', C.white, [Math.cos(a) * 0.15, 0.72, Math.sin(a) * 0.15], [0.07, 0.04, 0.07]); }
      b.add(sph(), 'matte', C.white, [0, 0.79, 0], 0.07);
      b.add(G.disc(), 'glow', '#fff3c4', [0, 0.615, 0], [0.44, 1, 0.44], [Math.PI, 0, 0]);
      light = [0, 0.55, 0];
      break;
    }
    case 'f_spacelamp': {
      b.add(sph(), 'matte', C.lav, [0, 0.1, 0], [0.42, 0.22, 0.38]);
      b.add(sph(), 'matte', '#b8a8dc', [0.1, 0.16, 0.08], [0.16, 0.12, 0.14]);
      b.add(cyl(), 'metal', C.silver, [0, 0.36, 0], [0.04, 0.36, 0.04]);
      b.add(sph(), 'glow', C.moon, [0, 0.68, 0], 0.36);
      for (const [x, y, z, r] of [[0.08, 0.76, 0.14, 0.07], [-0.1, 0.62, 0.13, 0.05], [0.02, 0.58, -0.16, 0.06]] as const) b.add(sph(), 'matte', '#f2e2a8', [x, y, z], [r, r, r * 0.5]);
      light = [0, 0.68, 0];
      break;
    }
    case 'f_rainbowlamp': {
      for (const [x, z] of [[-0.12, 0], [0.12, 0], [0, 0.06]] as const) b.add(sph(), 'cloth', C.white, [x, 0.1, z], [0.26, 0.2, 0.22]);
      const rb = [C.red, C.orange, C.yellow, C.lime, C.sky, C.purple];
      rb.forEach((c, i) => b.add(G.torus(0.09, Math.PI), 'glow', c, [0, 0.2, 0], [0.62 - i * 0.07, 0.86 - i * 0.08, 0.6]));
      for (const x of [-0.27, 0.27]) b.add(sph(), 'cloth', C.white, [x, 0.22, 0], [0.18, 0.15, 0.16]);
      light = [0, 0.6, 0];
      break;
    }
    case 'f_aq_bubblelamp': {
      b.add(cyl(), 'gloss', C.blue, [0, 0.05, 0], [0.36, 0.1, 0.36]);
      b.add(cyl(), 'metal', C.silver, [0, 0.25, 0], [0.05, 0.3, 0.05]);
      b.add(sph(), 'glass', C.glass, [0, 0.68, 0], 0.5);
      b.add(sph(), 'glow', C.sky, [0, 0.66, 0], 0.2);
      for (const [x, y, z, r] of [[0.1, 0.8, 0.05, 0.06], [-0.12, 0.6, 0.08, 0.05], [0.04, 0.52, -0.12, 0.04], [-0.05, 0.86, -0.08, 0.035]] as const) b.add(sph(), 'glass', C.white, [x, y, z], r);
      light = [0, 0.66, 0];
      break;
    }
    case 'f_sea_jellylamp': {
      b.add(cyl(), 'gloss', C.lav, [0, 0.04, 0], [0.36, 0.08, 0.36]);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.add(cap(), 'glass', C.pinkL, [Math.cos(a) * 0.1, 0.4, Math.sin(a) * 0.1], [0.04, 0.42, 0.04], [Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15]); }
      b.add(G.hemi(), 'glass', C.pink, [0, 0.72, 0], [0.56, 0.48, 0.56]);
      b.add(sph(), 'glow', '#ffe3f0', [0, 0.8, 0], [0.34, 0.24, 0.34]);
      light = [0, 0.8, 0];
      break;
    }
    case 'f_bug_ladybuglamp': {
      b.add(G.hemi(), 'gloss', C.red, [0, 0.2, 0], [0.5, 0.5, 0.56]);
      b.add(boxS(), 'matte', C.ink, [0, 0.36, 0], [0.02, 0.2, 0.5]);
      for (const [x, z] of [[-0.12, 0.06], [0.12, 0.06], [-0.1, -0.12], [0.1, -0.12], [0, -0.02]] as const) b.add(sph(), 'matte', C.ink, [x, 0.4, z], [0.07, 0.04, 0.07]);
      b.add(sph(), 'gloss', C.ink, [0, 0.28, 0.27], [0.24, 0.2, 0.18]);
      dotEyes(b, 0.31, 0.35, 0.1, 0.035);
      b.add(G.disc(), 'glow', '#fff3c4', [0, 0.205, 0], [0.48, 1, 0.52], [Math.PI, 0, 0]);
      b.add(cyl(), 'matte', C.ink, [0, 0.1, 0], [0.06, 0.2, 0.06]);
      light = [0, 0.3, 0];
      break;
    }
    case 'f_fos_ammonitelamp': {
      b.add(cyl(), 'matte', C.sand, [0, 0.06, 0], [0.38, 0.12, 0.38]);
      for (let i = 0; i < 5; i++) b.add(G.torus(0.22), 'gloss', i % 2 ? C.apricot : C.sand, [0.02 * i, 0.5 - i * 0.025, 0], [0.5 - i * 0.08, 0.5 - i * 0.08, 0.5 - i * 0.06]);
      b.add(sph(), 'glow', '#ffe9b0', [0.08, 0.44, 0], 0.12);
      light = [0, 0.5, 0];
      break;
    }
    case 'f_astro_starlamp': {
      stand(b, 0.7, C.navy);
      b.add(G.star(), 'glow', C.gold, [0, 0.92, 0], 0.5);
      b.add(sph(), 'glow', C.white, [0.18, 1.12, 0.06], 0.06);
      light = [0, 0.92, 0];
      break;
    }
    // ── 침대·의자·소파
    case 'f_shellbed': {
      b.add(box(), 'gloss', '#ffc6d6', [0, 0.14, 0.05], [W * 0.95, 0.28, D * 0.85]);
      b.add(box(), 'cloth', '#fff1f6', [0, 0.34, 0.08], [W * 0.88, 0.16, D * 0.75]);
      b.add(box(), 'cloth', '#ffb3c8', [0, 0.38, 0.3], [W * 0.9, 0.1, D * 0.42]);
      b.add(sph(), 'cloth', C.white, [0, 0.46, -0.3], [0.5, 0.16, 0.26]);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i / 6) * Math.PI;
        b.add(cap(), 'gloss', i % 2 ? '#ffd8e2' : '#ffbfd0', [Math.sin(a) * 0.42, 0.42 + Math.cos(a) * 0.4, -D * 0.42], [0.14, 0.5, 0.1], [0, 0, -a]);
      }
      b.add(sph(), 'gloss', C.white, [0, 0.92, -D * 0.4], 0.11);
      break;
    }
    case 'f_pastelchair': {
      legs(b, W * 0.7, D * 0.7, 0.24, C.woodL, 0.04);
      b.add(box(), 'cloth', C.pinkL, [0, 0.32, 0.04], [W * 0.78, 0.18, D * 0.72]);
      b.add(box(), 'cloth', C.pink, [0, 0.66, -D * 0.32], [W * 0.78, 0.62, 0.16], [-0.12, 0, 0]);
      b.add(G.heart(), 'gloss', C.white, [0, 0.72, -D * 0.22], 0.2, [-0.12, 0, 0]);
      break;
    }
    case 'f_spacechair': {
      b.add(G.cone(), 'metal', C.silver, [0, 0.18, 0], [0.5, 0.36, 0.5], [Math.PI, 0, 0]);
      b.add(G.hemi(), 'gloss', C.lav, [0, 0.36, 0], [W * 0.9, 0.5, D * 0.9], [Math.PI, 0, 0]);
      b.add(box(), 'cloth', C.purple, [0, 0.42, 0.04], [W * 0.6, 0.1, D * 0.55]);
      b.add(G.torus(0.08), 'glow', C.mint, [0, 0.38, 0], [W * 0.92, W * 0.92, 0.3], [Math.PI / 2, 0, 0]);
      b.add(box(), 'gloss', C.lav, [0, 0.66, -D * 0.34], [W * 0.75, 0.5, 0.14], [-0.2, 0, 0]);
      break;
    }
    case 'f_starthrone': {
      b.add(box(), 'gloss', C.navy, [0, 0.22, 0.05], [W * 0.85, 0.44, D * 0.8]);
      b.add(box(), 'cloth', C.purple, [0, 0.47, 0.08], [W * 0.7, 0.1, D * 0.65]);
      b.add(box(), 'gloss', C.navy, [0, 0.82, -D * 0.38], [W * 0.85, 1.0, 0.16]);
      for (const sx of [-1, 1]) b.add(box(), 'gloss', C.blue, [sx * W * 0.4, 0.58, 0.04], [0.14, 0.18, D * 0.7]);
      b.add(G.star(), 'metal', C.gold, [0, 1.42, -D * 0.38], 0.34);
      for (const sx of [-1, 1]) b.add(G.star(), 'glow', C.yellow, [sx * 0.26, 1.08, -D * 0.29], 0.12);
      break;
    }
    case 'f_aq_whalesofa': {
      b.add(cap(), 'gloss', C.blue, [0, 0.36, -0.08], [0.6, W * 0.62, 0.6], [0, 0, Math.PI / 2]);
      b.add(box(), 'cloth', C.sky, [0, 0.34, 0.2], [W * 0.75, 0.2, 0.42]);
      b.add(sph(), 'cloth', C.white, [0, 0.2, 0.22], [W * 0.8, 0.26, 0.5]);
      b.add(G.heart(), 'gloss', C.blue, [W * 0.48, 0.72, -0.08], [0.5, 0.36, 0.4], [0, Math.PI / 2, -0.6]);
      for (const z of [0.0]) { b.add(sph(), 'gloss', C.ink, [-W * 0.34, 0.5, 0.18 + z], [0.07, 0.09, 0.05]); b.add(sph(), 'glow', C.white, [-W * 0.33, 0.52, 0.21 + z], 0.025); }
      b.add(sph(), 'matte', C.pink, [-W * 0.3, 0.42, 0.24], [0.08, 0.04, 0.03]);
      b.add(cyl(), 'glow', C.white, [-W * 0.25, 0.8, -0.1], [0.04, 0.2, 0.04]);
      for (const sx of [-1, 1]) b.add(sph(), 'glow', C.white, [-W * 0.25 + sx * 0.06, 0.92, -0.1], 0.05);
      break;
    }
    case 'f_sea_shellchair': {
      b.add(box(), 'gloss', C.pinkL, [0, 0.2, 0.06], [W * 0.75, 0.4, D * 0.66]);
      b.add(box(), 'cloth', C.white, [0, 0.42, 0.08], [W * 0.66, 0.08, D * 0.56]);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2.4 + (i / 6) * (Math.PI / 1.2);
        b.add(cap(), 'gloss', i % 2 ? C.pinkL : C.apricot, [Math.sin(a) * 0.3, 0.6 + Math.cos(a) * 0.3, -D * 0.3], [0.12, 0.42, 0.08], [0, 0, -a]);
      }
      break;
    }
    case 'f_fos_eggchair': {
      b.add(sph(), 'gloss', C.cream, [0, 0.52, -0.05], [W * 0.9, 1.0, D * 0.85]);
      b.add(sph(), 'cloth', C.apricot, [0, 0.46, 0.14], [W * 0.66, 0.5, D * 0.55]);
      for (const [x, y] of [[-0.24, 0.8], [0.2, 0.92], [0.28, 0.5], [-0.3, 0.42]] as const) b.add(sph(), 'matte', C.lime, [x, y, -0.2], [0.12, 0.12, 0.06]);
      b.add(cyl(), 'metal', C.gold, [0, 0.04, 0], [0.5, 0.08, 0.5]);
      break;
    }
    case 'f_bug_beetlethrone': {
      b.add(box(), 'gloss', C.brown, [0, 0.24, 0.05], [W * 0.85, 0.48, D * 0.78]);
      b.add(box(), 'cloth', C.lime, [0, 0.5, 0.08], [W * 0.7, 0.08, D * 0.62]);
      b.add(sph(), 'gloss', '#7a5a3e', [0, 0.92, -D * 0.34], [W * 0.82, 0.9, 0.3]);
      b.add(boxS(), 'matte', C.ink, [0, 0.92, -D * 0.2], [0.02, 0.8, 0.04]);
      b.add(cap(), 'gloss', '#7a5a3e', [0, 1.5, -D * 0.34], [0.12, 0.4, 0.12], [0.4, 0, 0]);
      b.add(sph(), 'gloss', '#7a5a3e', [0, 1.7, -D * 0.2], 0.14);
      for (const sx of [-1, 1]) b.add(box(), 'gloss', C.green, [sx * W * 0.4, 0.62, 0.05], [0.14, 0.16, D * 0.66]);
      break;
    }
    case 'f_bench': {
      b.add(box(), 'matte', C.wood, [0, 0.4, 0], [W * 0.95, 0.12, D * 0.7]);
      for (const sx of [-1, 1]) b.add(cyl(), 'matte', C.woodD, [sx * W * 0.36, 0.17, 0], [0.18, 0.34, 0.18]);
      for (const sx of [-1, 1]) b.add(cyl(), 'matte', C.woodL, [sx * W * 0.36, 0.345, 0], [0.16, 0.01, 0.16]);
      b.add(sph(), 'matte', C.green, [W * 0.3, 0.47, 0.05], [0.14, 0.04, 0.1], [0, 0.6, 0]);
      break;
    }
    case 'f_bug_leafstool': {
      b.add(cyl(), 'matte', C.brown, [0, 0.2, 0], [0.08, 0.4, 0.08]);
      b.add(sph(), 'gloss', C.green, [0, 0.43, 0], [0.48, 0.07, 0.42]);
      b.add(boxS(), 'matte', C.lime, [0, 0.47, 0], [0.02, 0.01, 0.38]);
      b.add(sph(), 'matte', C.green, [0, 0.03, 0], [0.24, 0.06, 0.24]);
      break;
    }
    case 'f_fos_bonestool': {
      for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [0, 0.14]] as const) {
        b.add(cyl(), 'matte', C.bone, [x, 0.2, z], [0.06, 0.38, 0.06]);
        b.add(sph(), 'matte', C.bone, [x - 0.03, 0.03, z], 0.08); b.add(sph(), 'matte', C.bone, [x + 0.03, 0.03, z], 0.08);
      }
      b.add(cyl(), 'cloth', C.apricot, [0, 0.42, 0], [0.44, 0.1, 0.44]);
      break;
    }
    // ── 시계·장식
    case 'f_shellclock': {
      b.add(box(), 'matte', C.woodL, [0, 0.5, 0], [0.34, 1.0, 0.22]);
      b.add(sph(), 'gloss', C.pinkL, [0, 1.12, 0], [0.48, 0.42, 0.2]);
      clockFace(b, 1.1, 0.08, 0.15, C.pink, dyn);
      for (const sx of [-1, 1]) b.add(cap(), 'gloss', C.pinkL, [sx * 0.22, 1.12, 0], [0.08, 0.2, 0.08], [0, 0, sx * 0.5]);
      b.add(cyl(), 'metal', C.gold, [0, 0.5, 0.11], [0.12, 0.02, 0.12], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'f_sea_anchorclock': {
      b.add(cyl(), 'gloss', C.navy, [0, 0.04, 0], [0.4, 0.08, 0.4]);
      b.add(cyl(), 'metal', C.silver, [0, 0.55, 0], [0.07, 0.95, 0.07]);
      b.add(G.torus(0.14, Math.PI), 'metal', C.silver, [0, 0.3, 0], [0.38, 0.32, 0.38], [0, 0, Math.PI]);
      b.add(boxS(), 'metal', C.silver, [0, 0.9, 0], [0.32, 0.06, 0.06]);
      clockFace(b, 1.15, 0.03, 0.14, C.blue, dyn);
      break;
    }
    case 'f_sea_shipwheel': {
      b.add(box(), 'matte', C.woodD, [0, 0.35, 0], [0.24, 0.7, 0.2]);
      b.add(box(), 'matte', C.wood, [0, 0.04, 0], [W * 0.8, 0.08, D * 0.7]);
      const wheel = new Builder();
      wheel.add(G.torus(0.08), 'metal', C.gold, [0, 0, 0], 0.7);
      wheel.add(cyl(), 'metal', C.gold, [0, 0, 0], [0.16, 0.08, 0.16], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        wheel.add(cyl(), 'matte', C.wood, [Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0], [0.04, 0.5, 0.04], [0, 0, a + Math.PI / 2]);
        wheel.add(sph(), 'matte', C.woodD, [Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0], 0.07);
      }
      dyn.push({ b: wheel, at: [0, 0.95, 0.14], anim: 'spin', speed: 0.25 });
      break;
    }
    case 'f_thanks_letter': {
      for (const [x, z, r] of [[-0.12, 0.06, 0.12], [0.12, 0.06, -0.12]] as const) b.add(cyl(), 'matte', C.wood, [x, 0.4, z], [0.035, 0.82, 0.035], [0.15, 0, r]);
      b.add(cyl(), 'matte', C.wood, [0, 0.38, -0.12], [0.035, 0.8, 0.035], [-0.2, 0, 0]);
      b.add(box(), 'gloss', C.pink, [0, 0.82, 0.1], [0.4, 0.34, 0.04], [-0.15, 0, 0]);
      b.add(boxS(), 'matte', C.white, [0, 0.82, 0.125], [0.33, 0.27, 0.01], [-0.15, 0, 0]);
      b.add(G.heart(), 'gloss', C.red, [0, 0.84, 0.14], 0.1, [-0.15, 0, 0]);
      for (const y of [0.74, 0.92]) b.add(boxS(), 'matte', C.lav, [0, y, 0.13], [0.2, 0.012, 0.005], [-0.15, 0, 0]);
      break;
    }
    case 'f_flowercrown': {
      b.add(cyl(), 'matte', C.woodL, [0, 0.25, 0], [0.38, 0.04, 0.38]);
      b.add(cyl(), 'matte', C.wood, [0, 0.12, 0], [0.06, 0.24, 0.06]);
      b.add(cyl(), 'matte', C.wood, [0, 0.01, 0], [0.26, 0.02, 0.26]);
      b.add(G.torus(0.14), 'matte', C.green, [0, 0.33, 0], [0.3, 0.3, 0.3], [Math.PI / 2, 0, 0]);
      const fc = [C.pink, C.yellow, C.lav, C.white, C.coral, C.sky];
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; b.add(sph(), 'matte', fc[i % fc.length], [Math.cos(a) * 0.15, 0.36, Math.sin(a) * 0.15], 0.07); }
      break;
    }
    case 'f_stego_plate': {
      b.add(box(), 'matte', C.woodL, [0, 0.05, 0], [W * 0.8, 0.1, D * 0.6]);
      for (let i = 0; i < 5; i++) {
        const x = -0.36 + i * 0.18, h = 0.3 + Math.sin((i / 4) * Math.PI) * 0.35;
        b.add(G.heart(), 'gloss', i % 2 ? C.pink : C.pinkL, [x, 0.12 + h / 2, 0], [0.24, h + 0.05, 0.4]);
        b.add(sph(), 'matte', C.yellow, [x, 0.14 + h * 0.7, 0.05], 0.05);
      }
      break;
    }
    // ── 장난감·재활용
    case 'f_canrobot': {
      b.add(cyl(), 'metal', C.silver, [0, 0.28, 0], [0.32, 0.44, 0.32]);
      for (const y of [0.12, 0.44]) b.add(cyl(), 'metal', '#c9d3dd', [0, y, 0], [0.34, 0.03, 0.34]);
      b.add(sph(), 'glow', C.red, [0, 0.3, 0.16], 0.05);
      for (const sx of [-1, 1]) b.add(cap(), 'metal', '#c9d3dd', [sx * 0.21, 0.28, 0], [0.06, 0.18, 0.06], [0, 0, sx * 0.4]);
      for (const sx of [-1, 1]) b.add(cyl(), 'metal', '#c9d3dd', [sx * 0.08, 0.03, 0], [0.1, 0.06, 0.12]);
      const head = new Builder();
      head.add(box(), 'metal', C.silver, [0, 0.12, 0], [0.3, 0.22, 0.26]);
      head.add(sph(), 'glow', C.sky, [-0.07, 0.13, 0.13], 0.06); head.add(sph(), 'glow', C.sky, [0.07, 0.13, 0.13], 0.06);
      head.add(cyl(), 'metal', C.silver, [0, 0.29, 0], [0.02, 0.12, 0.02]);
      head.add(sph(), 'glow', C.yellow, [0, 0.36, 0], 0.05);
      head.add(sph(), 'matte', C.pink, [-0.11, 0.06, 0.13], [0.05, 0.025, 0.01]); head.add(sph(), 'matte', C.pink, [0.11, 0.06, 0.13], [0.05, 0.025, 0.01]);
      dyn.push({ b: head, at: [0, 0.5, 0], anim: 'creak' });
      break;
    }
    case 'f_bootplanter': {
      b.add(cyl(), 'gloss', C.sky, [0, 0.3, -0.03], [0.24, 0.48, 0.22]);
      b.add(box(), 'gloss', C.sky, [0, 0.06, 0.06], [0.24, 0.12, 0.4]);
      b.add(cyl(), 'gloss', C.blue, [0, 0.53, -0.03], [0.26, 0.04, 0.24]);
      b.add(cyl(), 'matte', C.brown, [0, 0.54, -0.03], [0.2, 0.02, 0.18]);
      for (const [x, z, c] of [[-0.05, -0.05, C.pink], [0.06, 0.0, C.yellow], [0, -0.1, C.lav]] as const) {
        b.add(cyl(), 'matte', C.green, [x, 0.64, z], [0.02, 0.2, 0.02]);
        b.add(sph(), 'matte', c, [x, 0.75, z], [0.11, 0.07, 0.11]);
        b.add(sph(), 'matte', C.yellow, [x, 0.78, z], 0.035);
      }
      break;
    }
    case 'f_boneslide': {
      for (const sx of [-1, 1]) {
        b.add(cap(), 'matte', C.bone, [sx * 0.3, 0.62, -D * 0.3], [0.07, 1.1, 0.07]);
        b.add(cap(), 'matte', C.bone, [sx * 0.3, 0.6, 0.1], [0.06, 1.25, 0.06], [-0.95, 0, 0]);
      }
      for (let i = 0; i < 4; i++) b.add(cap(), 'matte', C.bone, [0, 0.2 + i * 0.26, -D * 0.32], [0.05, 0.55, 0.05], [0, 0, Math.PI / 2]);
      b.add(box(), 'gloss', C.cream, [0, 0.62, 0.15], [0.5, 0.05, 1.25], [0.62, 0, 0]);
      b.add(box(), 'matte', C.woodL, [0, 1.12, -D * 0.3], [0.62, 0.06, 0.36]);
      b.add(sph(), 'matte', C.bone, [0, 1.32, -D * 0.36], [0.32, 0.26, 0.28]);
      for (const sx of [-1, 1]) b.add(sph(), 'matte', C.ink, [sx * 0.08, 1.34, -D * 0.23], [0.07, 0.08, 0.03]);
      break;
    }
    case 'f_fos_trexmodel': {
      b.add(cyl(), 'gloss', C.woodL, [0, 0.05, 0], [W * 0.85, 0.1, D * 0.7]);
      b.add(sph(), 'gloss', C.green, [0, 0.42, -0.02], [0.4, 0.46, 0.5]);
      b.add(sph(), 'matte', C.cream, [0, 0.4, 0.12], [0.28, 0.34, 0.3]);
      b.add(sph(), 'gloss', C.green, [0, 0.82, 0.12], [0.36, 0.32, 0.42]);
      b.add(G.cone(), 'gloss', C.green, [0, 0.32, -0.36], [0.24, 0.5, 0.24], [-Math.PI / 2 - 0.3, 0, 0]);
      for (const sx of [-1, 1]) {
        b.add(cyl(), 'gloss', C.green, [sx * 0.12, 0.16, 0.0], [0.13, 0.2, 0.16]);
        b.add(cap(), 'gloss', C.green, [sx * 0.15, 0.52, 0.2], [0.04, 0.08, 0.04], [0.8, 0, 0]);
      }
      for (let i = 0; i < 3; i++) b.add(G.cone(), 'gloss', C.yellow, [0, 0.98 - i * 0.12, -0.0 - i * 0.12], [0.08, 0.12, 0.08], [-0.6, 0, 0]);
      dotEyes(b, 0.88, 0.31, 0.16, 0.045);
      break;
    }
    case 'f_dino_musicbox': {
      b.add(box(), 'gloss', C.apricot, [0, 0.13, 0], [0.42, 0.26, 0.36]);
      b.add(box(), 'gloss', C.pinkL, [0, 0.27, 0], [0.44, 0.04, 0.38]);
      b.add(G.heart(), 'gloss', C.pink, [0, 0.14, 0.185], 0.1);
      b.add(cyl(), 'metal', C.gold, [0.23, 0.14, 0], [0.04, 0.04, 0.04], [0, 0, Math.PI / 2]);
      const dn = new Builder();
      dn.add(cyl(), 'gloss', C.white, [0, 0.01, 0], [0.24, 0.02, 0.24]);
      dn.add(sph(), 'gloss', C.lime, [0, 0.09, 0], [0.14, 0.12, 0.18]);
      dn.add(sph(), 'gloss', C.lime, [0, 0.18, 0.06], [0.1, 0.1, 0.1]);
      dn.add(G.cone(), 'gloss', C.lime, [0, 0.07, -0.11], [0.06, 0.12, 0.06], [-Math.PI / 2, 0, 0]);
      dn.add(sph(), 'gloss', C.ink, [-0.025, 0.2, 0.105], 0.018); dn.add(sph(), 'gloss', C.ink, [0.025, 0.2, 0.105], 0.018);
      dyn.push({ b: dn, at: [0, 0.29, 0], anim: 'spin', speed: 0.8 });
      break;
    }
    // ── 화분·바구니
    case 'f_cactuspot': {
      b.add(G.taper(1.25), 'matte', C.orange, [0, 0.14, 0], [0.32, 0.28, 0.32]);
      b.add(cyl(), 'matte', C.coral, [0, 0.29, 0], [0.4, 0.05, 0.4]);
      b.add(cap(), 'gloss', C.green, [0, 0.52, 0], [0.18, 0.32, 0.18]);
      b.add(cap(), 'gloss', C.green, [0.13, 0.55, 0], [0.09, 0.12, 0.09]);
      b.add(cap(), 'gloss', C.green, [0.17, 0.62, 0], [0.08, 0.1, 0.08]);
      b.add(cap(), 'gloss', C.green, [-0.12, 0.48, 0], [0.08, 0.1, 0.08], [0, 0, 0.6]);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.add(sph(), 'matte', C.pink, [Math.cos(a) * 0.05, 0.8, Math.sin(a) * 0.05], 0.06); }
      b.add(sph(), 'matte', C.yellow, [0, 0.82, 0], 0.04);
      break;
    }
    case 'f_pot': {
      b.add(G.taper(1.3), 'gloss', C.sky, [0, 0.16, 0], [0.34, 0.32, 0.34]);
      b.add(G.torus(0.2), 'gloss', C.white, [0, 0.32, 0], [0.38, 0.38, 0.38], [Math.PI / 2, 0, 0]);
      for (const [x, y, z, r] of [[0, 0.62, 0, 0.3], [-0.12, 0.52, 0.06, 0.2], [0.13, 0.55, -0.04, 0.22], [0.04, 0.78, -0.06, 0.18]] as const) b.add(sph(), 'matte', C.green, [x, y, z], r);
      b.add(sph(), 'matte', C.lime, [-0.06, 0.7, 0.12], 0.12);
      break;
    }
    case 'f_fruitbasket': {
      b.add(G.taper(1.3), 'matte', C.woodL, [0, 0.1, 0], [0.4, 0.2, 0.4]);
      b.add(G.torus(0.18), 'matte', C.wood, [0, 0.2, 0], [0.44, 0.44, 0.44], [Math.PI / 2, 0, 0]);
      for (const [x, z, c] of [[-0.08, 0.04, C.red], [0.09, -0.02, C.orange], [0, -0.1, C.yellow], [0.02, 0.1, C.pink], [-0.1, -0.08, C.lime]] as const) b.add(sph(), 'gloss', c, [x, 0.26, z], 0.13);
      b.add(G.torus(0.06, Math.PI), 'matte', C.wood, [0, 0.22, 0], [0.42, 0.62, 0.42]);
      break;
    }
    // ── 러그(바닥층)
    case 'f_cloudrug': {
      for (const [x, z, r] of [[0, 0, 0.62], [-0.55, 0.1, 0.42], [0.55, 0.05, 0.45], [-0.2, -0.32, 0.38], [0.25, 0.3, 0.4]] as const) b.add(cyl(), 'cloth', C.white, [x * W * 0.7, 0.015, z * D], [r * 2, 0.03, r * 1.5]);
      for (const [x, z] of [[-0.2, 0.05], [0.35, -0.1]] as const) b.add(cyl(), 'cloth', '#dfe8ff', [x * W, 0.03, z * D], [0.3, 0.01, 0.2]);
      break;
    }
    case 'f_sea_starrug': {
      b.add(G.star(), 'cloth', C.coral, [0, 0.02, 0], [W * 0.95, D * 0.95, 0.12], [-Math.PI / 2, 0, 0]);
      b.add(G.star(), 'cloth', C.apricot, [0, 0.035, 0], [W * 0.55, D * 0.55, 0.1], [-Math.PI / 2, 0, 0]);
      break;
    }
    case 'f_fos_footrug': {
      b.add(cyl(), 'cloth', C.sand, [0, 0.015, 0], [W * 0.95, 0.03, D * 0.9]);
      for (const [x, z, s] of [[-0.3, 0.1, 0.7], [0.3, -0.12, 0.7]] as const) {
        b.add(cyl(), 'cloth', C.brown, [x, 0.035, z], [0.28 * s, 0.01, 0.34 * s]);
        for (const t of [-1, 0, 1]) b.add(cyl(), 'cloth', C.brown, [x + t * 0.1 * s, 0.035, z - 0.26 * s], [0.09 * s, 0.01, 0.13 * s], [0, t * 0.3, 0]);
      }
      break;
    }
    case 'f_astro_moonrug': {
      b.add(cyl(), 'cloth', C.moon, [0, 0.015, 0], [W * 0.95, 0.03, D * 0.95]);
      for (const [x, z, r] of [[-0.25, -0.1, 0.18], [0.2, 0.22, 0.12], [0.3, -0.25, 0.09], [-0.05, 0.3, 0.07]] as const) b.add(cyl(), 'cloth', '#f2e2a8', [x * W, 0.035, z * D], [r * 2, 0.01, r * 2]);
      for (const [x, z] of [[-0.6, 0.6], [0.65, -0.55], [0.6, 0.62]] as const) b.add(G.star(), 'glow', C.gold, [x * W * 0.62, 0.04, z * D * 0.62], [0.12, 0.12, 0.05], [-Math.PI / 2, 0, 0]);
      break;
    }
    // ── 걸개·모빌·병풍
    case 'f_aq_fishmobile':
    case 'f_astro_planetmobile': {
      const astro = id === 'f_astro_planetmobile';
      stand(b, 1.5, astro ? C.navy : C.sky, 0.2);
      b.add(G.torus(0.1, Math.PI), 'metal', C.gold, [0, 1.5, 0], [0.2, 0.16, 0.2]);
      const mob = new Builder();
      mob.add(cyl(), 'metal', C.gold, [0, 0, 0], [0.7, 0.02, 0.02], [0, 0, Math.PI / 2]);
      mob.add(cyl(), 'metal', C.gold, [0, 0, 0], [0.7, 0.02, 0.02], [Math.PI / 2, Math.PI / 2, 0]);
      const cs = astro ? [C.coral, C.sky, C.lav, C.yellow] : [C.sky, C.pink, C.yellow, C.mint];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2, x = Math.cos(a) * 0.34, z = Math.sin(a) * 0.34, y = -0.22 - (i % 2) * 0.12;
        mob.add(cyl(), 'matte', C.white, [x, y / 2, z], [0.01, -y, 0.01]);
        if (astro) {
          mob.add(sph(), 'gloss', cs[i], [x, y - 0.08, z], 0.16 - i * 0.015);
          if (i % 2 === 0) mob.add(G.torus(0.06), 'gloss', C.cream, [x, y - 0.08, z], 0.24, [Math.PI / 2 - 0.4, 0, 0]);
        } else {
          mob.add(sph(), 'gloss', cs[i], [x, y - 0.08, z], [0.08, 0.1, 0.16], [0, -a, 0]);
          mob.add(G.cone(), 'gloss', C.white, [x - Math.sin(-a) * 0.0, y - 0.08, z], [0.08, 0.1, 0.08], [0, -a, Math.PI / 2]);
        }
      }
      dyn.push({ b: mob, at: [0, 1.44, 0], anim: 'spin', speed: 0.35 });
      break;
    }
    case 'f_aq_kelpcurtain': {
      for (const sx of [-1, 1]) b.add(cyl(), 'matte', C.woodD, [sx * W * 0.45, 0.9, 0], [0.06, 1.8, 0.06]);
      b.add(cyl(), 'matte', C.wood, [0, 1.78, 0], [0.05, W * 0.95, 0.05], [0, 0, Math.PI / 2]);
      const kelp = new Builder();
      for (let i = 0; i < 7; i++) {
        const x = -W * 0.38 + (i / 6) * W * 0.76;
        kelp.add(cap(), 'gloss', i % 2 ? C.green : C.lime, [x, -0.75, 0], [0.12, 1.2, 0.04]);
        for (let k = 0; k < 3; k++) kelp.add(sph(), 'gloss', C.lime, [x + (k % 2 ? 0.07 : -0.07), -0.4 - k * 0.38, 0], [0.1, 0.16, 0.04]);
      }
      kelp.add(sph(), 'glass', C.white, [0.2, -0.5, 0.05], 0.06);
      dyn.push({ b: kelp, at: [0, 1.75, 0], anim: 'sway' });
      break;
    }
    case 'f_bug_butterflyscreen': {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * W * 0.32, r = (i - 1) * 0.25;
        b.push([x, 0, Math.abs(i - 1) * 0.08], [0, r, 0]);
        b.add(box(), 'matte', C.woodL, [0, 0.72, 0], [W * 0.3, 1.36, 0.06]);
        b.add(boxS(), 'cloth', C.cream, [0, 0.74, 0.03], [W * 0.26, 1.2, 0.02]);
        const c = [C.pink, C.sky, C.yellow][i];
        b.add(G.heart(), 'gloss', c, [-0.09, 0.82, 0.05], [0.2, 0.18, 0.04], [0, 0, 0.9]);
        b.add(G.heart(), 'gloss', c, [0.09, 0.82, 0.05], [0.2, 0.18, 0.04], [0, 0, -0.9]);
        b.add(cap(), 'matte', C.ink, [0, 0.8, 0.06], [0.03, 0.12, 0.03]);
        b.pop();
      }
      break;
    }
    case 'f_bug_honeyshelf': {
      for (const [x, y] of [[-0.25, 0.3], [0.25, 0.3], [0, 0.72], [-0.25, 1.12], [0.25, 1.12]] as const) {
        b.add(G.cyl(6), 'gloss', C.yellow, [x, y, 0], [0.46, 0.2, 0.46], [Math.PI / 2, 0, Math.PI / 6]);
        b.add(G.cyl(6), 'matte', '#f2b13a', [x, y, 0.05], [0.36, 0.12, 0.36], [Math.PI / 2, 0, Math.PI / 6]);
      }
      for (const [x, y] of [[-0.25, 0.26], [0.25, 1.08]] as const) {
        b.add(cyl(), 'glass', C.orange, [x, y, 0.06], [0.14, 0.16, 0.14]);
        b.add(cyl(), 'cloth', C.red, [x, y + 0.09, 0.06], [0.16, 0.03, 0.16]);
      }
      b.add(sph(), 'gloss', C.yellow, [0, 0.74, 0.14], [0.12, 0.1, 0.1]);
      b.add(boxS(), 'matte', C.ink, [0, 0.74, 0.18], [0.12, 0.02, 0.02]);
      break;
    }
    // ── 우주 가구
    case 'f_astro_telescope': {
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.add(cyl(), 'matte', C.woodD, [Math.cos(a) * 0.18, 0.4, Math.sin(a) * 0.18], [0.04, 0.84, 0.04], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]); }
      b.add(sph(), 'metal', C.gold, [0, 0.82, 0], 0.1);
      b.add(cyl(), 'gloss', C.navy, [0, 1.02, 0.06], [0.2, 0.9, 0.2], [0.8, 0, 0]);
      b.add(cyl(), 'metal', C.gold, [0, 1.32, 0.38], [0.24, 0.06, 0.24], [0.8, 0, 0]);
      b.add(G.star(), 'glow', C.yellow, [0, 1.06, 0.18], [0.12, 0.12, 0.06], [0.8, 0, 0]);
      break;
    }
    case 'f_astro_rocketbed': {
      b.add(cap(), 'gloss', C.white, [0, 0.42, 0], [0.7, W * 0.55, 0.7], [0, 0, Math.PI / 2]);
      b.add(G.cone(), 'gloss', C.red, [W * 0.46, 0.42, 0], [0.62, 0.36, 0.62], [0, 0, -Math.PI / 2]);
      b.add(box(), 'cloth', C.sky, [-0.05, 0.68, 0], [W * 0.62, 0.14, 0.56]);
      b.add(sph(), 'cloth', C.white, [W * 0.22, 0.78, 0], [0.32, 0.14, 0.4]);
      for (const sz of [-1, 1]) b.add(box(), 'gloss', C.red, [-W * 0.42, 0.3, sz * 0.38], [0.36, 0.4, 0.06], [0, 0, 0.3]);
      b.add(cyl(), 'glass', C.glass, [W * 0.18, 0.46, 0.34], [0.2, 0.04, 0.2], [Math.PI / 2, 0, 0]);
      b.add(G.torus(0.14), 'metal', C.gold, [W * 0.18, 0.46, 0.35], [0.22, 0.22, 0.22]);
      b.add(G.cone(), 'glow', C.orange, [-W * 0.52, 0.42, 0], [0.4, 0.26, 0.4], [0, 0, Math.PI / 2]);
      break;
    }
    default: {
      // 모르는 가구: 리본 선물 상자
      b.add(box(), 'gloss', C.pinkL, [0, W * 0.32, 0], [W * 0.7, W * 0.64, D * 0.7]);
      b.add(boxS(), 'gloss', C.pink, [0, W * 0.32, 0], [W * 0.14, W * 0.66, D * 0.72]);
      b.add(boxS(), 'gloss', C.pink, [0, W * 0.32, 0], [W * 0.72, W * 0.66, D * 0.14]);
      b.add(G.torus(0.2), 'gloss', C.pink, [-0.1, W * 0.7, 0], 0.22, [0, 0, 0.5]);
      b.add(G.torus(0.2), 'gloss', C.pink, [0.1, W * 0.7, 0], 0.22, [0, 0, -0.5]);
    }
  }
  return { b, slots, dyn, light };
}

/** 표에 있는 가구 id 전부(테스트·디버그 진열) */
export const FURNITURE_IDS = Object.keys(FURNITURE);
