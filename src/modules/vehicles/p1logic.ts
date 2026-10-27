// 탈것 P1 순수 규칙 — 바람(요트·열기구)·썰매 경사 속도·P1 해금 조건·스킨(색 바꾸기)·2인승 좌석.
// DOM·WebGL·Rapier 없음 → tests/vehicles-p1.test.ts 가 바로 부른다. 실제 움직임은 kinds/*, 놓기·패널은 vehicles.ts.
import * as THREE from 'three';

const TAU = Math.PI * 2;
/** 각도 차를 -π..π 로 */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// ───────────── 바람 ─────────────

/**
 * 오늘의 바람. angle 은 바람이 '불어 가는' 쪽(앞 = (sin a, cos a), 탈것 머리 h 와 같은 문법),
 * strength 0.75~1. 날(env.day)마다 rng 로 정하고, 시각에 따라 ±0.35 rad 천천히 흔들린다.
 */
export interface Wind { angle: number; strength: number; x: number; z: number }
export function windOf(day: number, hour: number, rng: (key: string) => () => number): Wind {
  const r = rng(`vehicles:wind:${Math.floor(day)}`);
  const base = r() * TAU, strength = 0.75 + r() * 0.25, phase = r() * TAU;
  const angle = wrapAngle(base + 0.35 * Math.sin((hour / 24) * TAU * 2 + phase));
  return { angle, strength, x: Math.sin(angle) * strength, z: Math.cos(angle) * strength };
}

/** 요트 순풍·역풍 최고 속도(GDD 3.8: 순풍 35 / 역풍 15) */
export const YACHT_DOWN = 35, YACHT_UP = 15;
/** 머리 h 로 갈 때 요트 최고 속도: 바람과 같은 쪽 35, 정면 15, 옆바람은 그 사이(코사인) */
export function yachtMaxSpeed(heading: number, windAngle: number): number {
  const k = (1 + Math.cos(wrapAngle(heading - windAngle))) / 2;
  return YACHT_UP + (YACHT_DOWN - YACHT_UP) * k;
}
/** 순풍/옆바람/역풍 한 단어 */
export function windWord(heading: number, windAngle: number): '순풍' | '옆바람' | '역풍' {
  const c = Math.cos(wrapAngle(heading - windAngle));
  return c > 0.5 ? '순풍' : c < -0.5 ? '역풍' : '옆바람';
}

/** 열기구 표류 속도(GDD 3.8: 6 m/s) */
export const BALLOON_DRIFT = 6;
/** 공중에 떠 있으면 바람 방향으로 6 m/s(땅에 닿아 있으면 0). 돌려주는 건 {x, z} m/s */
export function balloonDrift(w: Wind, airborne: boolean): { x: number; z: number } {
  if (!airborne) return { x: 0, z: 0 };
  return { x: Math.sin(w.angle) * BALLOON_DRIFT, z: Math.cos(w.angle) * BALLOON_DRIFT };
}

/** 바람 화살표가 화면에서 돌아갈 각(라디안, CSS rotate 시계 방향) — 위 = 카메라가 보는 쪽 */
export function windArrowRotation(windAngle: number, camYaw: number): number {
  // 카메라는 뒤에서 앞을 본다: 보는 쪽 = yaw - π. 머리 h 가 커지면 왼쪽(반시계)이라 화면 각은 부호가 반대
  return -wrapAngle(windAngle - (camYaw - Math.PI));
}

// ───────────── 썰매 ─────────────

/** 썰매 최고 속도(GDD 3.8: 경사 비례, 최대 20) */
export const SLED_MAX = 20;
/** 평지에서 발로 밀어 낼 수 있는 속도 */
export const SLED_PUSH = 5;
/**
 * 썰매 한 걸음: 경사(내리막 +, 앞쪽이 낮을수록 큼)가 당기고, 마찰이 늦춘다. 눈이 아니면 마찰 ×3.
 * push(W) 는 평지에서 SLED_PUSH 까지만 밀어 준다. 결과는 0..SLED_MAX.
 */
export function sledStep(v: number, slope: number, dt: number, o: { push?: boolean; brake?: boolean; snow?: boolean } = {}): number {
  const g = 9.8 * 1.5 * THREE.MathUtils.clamp(slope, -0.8, 0.8);
  const fr = (o.snow === false ? 3 : 1) * (0.6 + 0.12 * v) + (o.brake ? 6 : 0);
  let a = g - fr * Math.sign(v || (g > 0 ? 1 : 0));
  if (o.push && v < SLED_PUSH) a = Math.max(a, 3.5);
  const nv = v + a * dt;
  return THREE.MathUtils.clamp(nv, 0, SLED_MAX);
}
/** 그 경사에서 결국 닿는 속도(종단 속도) — 표·테스트용 */
export function sledTerminal(slope: number, o: { push?: boolean; snow?: boolean } = {}): number {
  let v = 0;
  for (let i = 0; i < 1200; i++) v = sledStep(v, slope, 1 / 30, o);
  return v;
}

// ───────────── P1 해금 조건 ─────────────

/** 해금 판정에 쓰는 econ 모양 */
export interface P1Econ {
  isUnlocked(key: string): boolean;
  unlock(key: string, why?: string): void;
  stars?: number;
  spend?(c: { stars?: number; coins?: number }, why: string): boolean;
  canAfford?(c: { stars?: number }): boolean;
  rocket?(): { count: number };
}

/** 열기구: 풍선 선물 30개 터뜨리기 + 반짝별 300(GDD 3.8) */
export const BALLOON_POPS = 30, BALLOON_STARS = 300;
export interface BalloonGate { ok: boolean; ready: boolean; text: string }
/** 열기구 관문 상태 — ok 이미 열림, ready 지금 열 수 있음(⭐ 를 쓰면) */
export function balloonGate(popped: number, stars: number, unlocked: boolean): BalloonGate {
  if (unlocked) return { ok: true, ready: false, text: '✅ 열기구' };
  const p = Math.min(BALLOON_POPS, Math.max(0, Math.floor(popped)));
  if (p < BALLOON_POPS) return { ok: false, ready: false, text: `🔒 열기구 — 풍선 선물 ${p}/${BALLOON_POPS}개 터뜨리기 · ⭐${BALLOON_STARS} 🎈` };
  if (stars < BALLOON_STARS) return { ok: false, ready: false, text: `🔒 열기구 — 반짝별 ${Math.floor(stars)}/${BALLOON_STARS} ⭐` };
  return { ok: false, ready: true, text: `🎈 열기구 열기 (⭐${BALLOON_STARS})` };
}
/** 조건이 되면 econ.spend(⭐300) → econ.unlock('v:balloon'). 열었으면 true */
export function tryUnlockBalloon(econ: P1Econ | null | undefined, popped: number): boolean {
  if (!econ || econ.isUnlocked('v:balloon')) return false;
  const stars = Number(econ.stars ?? 0);
  if (!balloonGate(popped, stars, false).ready) return false;
  if (typeof econ.spend !== 'function' || !econ.spend({ stars: BALLOON_STARS }, 'v:balloon')) return false;
  econ.unlock('v:balloon', 'balloon30');
  return true;
}

/** 비행기: 로켓 부품 1개 이상(우주센터 1단계) */
export const planeReady = (rocketParts: number) => rocketParts >= 1;
/** UFO: 우주 도감 80% */
export const UFO_DEX = 0.8;
export const ufoReady = (got: number, total: number) => total > 0 && got / total >= UFO_DEX - 1e-9;
/** 수상바이크: 다이빙 센터 의뢰 — 바다 친구(도감 'sea') 10종 만나기 */
export const JETSKI_SEA = 10;
export const jetskiReady = (seaGot: number) => seaGot >= JETSKI_SEA;

/** 조건을 보고 열 수 있는 P1 키를 연다(이미 열린 건 건너뛴다). 연 키 목록을 돌려준다 */
export function autoUnlocks(econ: P1Econ | null | undefined, s: { parts: number; spaceGot: number; spaceTotal: number; seaGot: number; moon: boolean }): string[] {
  if (!econ) return [];
  const out: string[] = [];
  const open = (key: string, ok: boolean, why: string) => { if (ok && !econ.isUnlocked(key)) { econ.unlock(key, why); out.push(key); } };
  open('v:plane', planeReady(s.parts), 'rocket-part');
  open('v:ufo', ufoReady(s.spaceGot, s.spaceTotal), 'space-dex');
  open('v:jetski', jetskiReady(s.seaGot), 'diving-request');
  open('v:rover', s.moon, 'moon');
  return out;
}

// ───────────── 스킨 ─────────────

/** 탈것마다 스킨 3개(skin_<kind>_<1..3>) — 0 = 기본색 */
export const SKIN_COUNT = 3;
export interface SkinDef { n: number; name: string; hue: number; hex: string }
/** 스킨 팔레트: 딸기우유 · 민트소다 · 라벤더꿈 */
export const SKINS: readonly SkinDef[] = [
  { n: 1, name: '딸기우유', hue: 345 / 360, hex: '#ff9fbf' },
  { n: 2, name: '민트소다', hue: 160 / 360, hex: '#8fe8c8' },
  { n: 3, name: '라벤더꿈', hue: 262 / 360, hex: '#bba3ff' },
];
/** 아이템 id(바깥 이름 기준): skin_yacht_2 */
export const skinId = (pubKind: string, n: number) => `skin_${pubKind}_${n}`;
/** 'skin_yacht_2' → {kind:'yacht', n:2} (모양이 다르면 null) */
export function parseSkin(id: string): { kind: string; n: number } | null {
  const m = /^skin_([a-z0-9_]+)_(\d)$/.exec(String(id ?? ''));
  if (!m) return null;
  const n = Number(m[2]);
  return n >= 1 && n <= SKIN_COUNT ? { kind: m[1], n } : null;
}
/** 그 스킨을 가졌나: 가방에 있거나 차고(skinBox)에 넣어 둔 것 */
export function skinOwned(pubKind: string, n: number, bag: Record<string, number>, box: readonly string[]): boolean {
  if (n === 0) return true;
  const id = skinId(pubKind, n);
  return (bag[id] ?? 0) > 0 || box.includes(id);
}
/** 입히기: 가진 스킨이면 skins[kind] = n(0 = 기본). 가방 것은 차고로 옮긴다(takeFromBag 이 가방에서 뺀다). 됐으면 true */
export function applySkinChoice(f: { skins?: Record<string, number>; skinBox?: string[] }, pubKind: string, n: number,
  bag: Record<string, number>, takeFromBag: (id: string) => void): boolean {
  if (!Number.isInteger(n) || n < 0 || n > SKIN_COUNT) return false;
  const box = (f.skinBox ??= []);
  if (!skinOwned(pubKind, n, bag, box)) return false;
  if (n > 0) {
    const id = skinId(pubKind, n);
    if (!box.includes(id)) { takeFromBag(id); box.push(id); }
  }
  const skins = (f.skins ??= {});
  if (n === 0) delete skins[pubKind]; else skins[pubKind] = n;
  return true;
}

/** 무지개 거리(원형) 평균: 색이 있는 정점들의 대표 색상(0..1) */
export function dominantHue(colors: ArrayLike<number>): number | null {
  let sx = 0, sy = 0, w = 0;
  const hsl = { h: 0, s: 0, l: 0 }, c = new THREE.Color();
  for (let i = 0; i + 2 < colors.length; i += 3) {
    c.setRGB(colors[i], colors[i + 1], colors[i + 2]);
    c.getHSL(hsl);
    if (hsl.s < 0.22 || hsl.l > 0.93 || hsl.l < 0.12) continue;
    const k = hsl.s;
    sx += Math.cos(hsl.h * TAU) * k; sy += Math.sin(hsl.h * TAU) * k; w += k;
  }
  if (w <= 0) return null;
  return ((Math.atan2(sy, sx) / TAU) + 1) % 1;
}

/** 볼터치 색(kit face) — 스킨이 바꾸지 않는다 */
const KEEP = [new THREE.Color('#ff9fb4'), new THREE.Color('#ff9fb8')];
/**
 * 스킨 색 입히기(정점색 배열). base 는 원래 색, out 에 쓴다.
 * 대표 색상(dom)이 스킨 색상이 되도록 모든 '색 있는' 정점의 색상을 같이 돌린다 → 무늬·강조색 관계는 그대로.
 * 흰색·크림·회색(채도 낮음)과 볼터치는 그대로 둔다. 결과는 파스텔(채도 ≤ 0.85, 밝기 ≥ 0.55).
 */
export function tintColors(base: ArrayLike<number>, out: { [i: number]: number; length: number }, skin: number, dom: number | null): void {
  const def = SKINS.find((s) => s.n === skin);
  const c = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i + 2 < base.length; i += 3) {
    out[i] = base[i]; out[i + 1] = base[i + 1]; out[i + 2] = base[i + 2];
    if (!def || dom === null) continue;
    c.setRGB(base[i], base[i + 1], base[i + 2]);
    if (KEEP.some((k) => Math.abs(k.r - c.r) + Math.abs(k.g - c.g) + Math.abs(k.b - c.b) < 0.05)) continue;
    c.getHSL(hsl);
    // 채도 0.12 아래는 그대로, 0.12~0.3 은 조금씩
    const w = THREE.MathUtils.smoothstep(hsl.s, 0.12, 0.3);
    if (w <= 0) continue;
    const h = (hsl.h + (def.hue - dom) + 2) % 1;
    const s = THREE.MathUtils.clamp(hsl.s, 0.35, 0.85);
    const l = Math.max(0.55, hsl.l);
    const t = new THREE.Color().setHSL(h, s, l);
    out[i] = c.r + (t.r - c.r) * w; out[i + 1] = c.g + (t.g - c.g) * w; out[i + 2] = c.b + (t.b - c.b) * w;
  }
}

// ───────────── 2인승 ─────────────

/** 좌석 수(안쪽 이름) — GDD 4.15: 카트·요트·열기구·자전거는 2인승 */
export const SEATS: Readonly<Record<string, number>> = { kart: 2, sail: 2, balloon: 2, bike: 2 };
export const seatsOf = (kind: string) => SEATS[kind] ?? 1;
/** 둘이 같이 밟으면 자전거 ×1.3 */
export const COPEDAL_MUL = 1.3;
export function pedalMul(kind: string, riders: number, bothPedal: boolean): number {
  return kind === 'bike' && riders >= 2 && bothPedal ? COPEDAL_MUL : 1;
}

// ───────────── 기록 ─────────────

/** 탈 때마다 최고 속도 기록(flags.vehicles.top) — 더 빠르면 바꾸고 true */
export function noteTop(top: Record<string, number>, pubKind: string, speed: number): boolean {
  const s = Math.round(speed * 10) / 10;
  if (!(s > (top[pubKind] ?? 0))) return false;
  top[pubKind] = s;
  return true;
}
