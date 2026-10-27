// 효과음 목록 — 전부 합성(발진기·소음·FM·필터). 이름 → {만들기, 기본 크기, 잔향, 최소 간격}.
// 귀여운 결: 사인·삼각파 위주, 통통 튀는 음높이 미끄럼, 5음 음계 아르페지오. k.p = 높이 배율(sfx o.pitch).
// vol 은 크기 배율이다 — 오프라인 렌더로 잰 최고점이 발소리 ~0.07 · UI ~0.15 · 보통 ~0.3 · 팡파르 0.45~0.6 쯤 되게 골랐다(음악 최고점 ~0.25 와 어울리게).
import { hz, type Kit } from './synth';

export interface SfxDef {
  build: (k: Kit) => void;
  /** 크기 배율(조각 peak 에 곱한다 — 1 을 넘을 수 있다) */
  vol?: number;
  /** 잔향 보내기(0..1) */
  send?: number;
  /** 같은 소리를 다시 울리기까지 최소 간격(초) — 이벤트가 겹쳐도 한 번만 */
  gap?: number;
}

const f = (k: Kit, m: number) => hz(m) * k.p;

// ───────────── 공용 조각 ─────────────
/** 통! 짧은 팝(음높이가 위로 튐) */
function pop(k: Kit, m: number, at = 0, peak = 0.35) {
  k.tone({ type: 'sine', f: f(k, m) * 0.7, f2: f(k, m) * 1.25, at, len: 0.09, peak, a: 0.002 });
  k.tone({ type: 'triangle', f: f(k, m + 12), at: at + 0.01, len: 0.06, peak: peak * 0.3 });
}
/** 반짝 띵(종 같은 FM) */
function ding(k: Kit, m: number, at = 0, peak = 0.22, len = 0.6) {
  k.fm({ f: f(k, m), ratio: 3.5, index: 1.6, at, len, peak });
}
/** 팡파르: 삼각파 + 부드러운 사각파 겹 아르페지오 → 마지막 음 길게 */
function fanfare(k: Kit, notes: number[], step: number, hold: number, peak = 0.22) {
  notes.forEach((m, i) => {
    const last = i === notes.length - 1;
    const len = last ? hold : step * 1.6;
    k.tone({ type: 'triangle', f: f(k, m), at: i * step, len, peak, a: 0.006, curve: last ? 'hold' : 'exp', vib: last ? [5.5, 12] : undefined });
    k.tone({ type: 'square', f: f(k, m), at: i * step, len: len * 0.8, peak: peak * 0.18, lp: 2400, curve: last ? 'hold' : 'exp' });
  });
}
/** 물 튀김(소음 띠 + 방울) */
function splash(k: Kit, big: number) {
  k.noise({ len: 0.35 * big, filter: 'bandpass', f: 2600, f2: 700, q: 0.7, peak: 0.38 * big, a: 0.004 });
  k.noise({ len: 0.5 * big, filter: 'lowpass', f: 1100, f2: 250, peak: 0.2 * big, at: 0.03 });
  for (let i = 0; i < 4; i++) k.tone({ type: 'sine', f: (500 + k.rng() * 700) * k.p, f2: (1200 + k.rng() * 900) * k.p, at: 0.04 + i * 0.05 + k.rng() * 0.03, len: 0.05, peak: 0.1 });
}
/** 발소리 */
function step(k: Kit, filter: BiquadFilterType, fr: number, len: number, peak: number, crunch = false) {
  k.noise({ len, filter, f: fr * k.p, f2: fr * 0.6 * k.p, q: 1.1, peak, a: 0.002 });
  if (crunch) k.noise({ len: len * 0.7, filter: 'highpass', f: 3200, peak: peak * 0.35, at: 0.012 });
}

// ───────────── 목록 ─────────────
export const SFX: Record<string, SfxDef> = {
  // ── UI
  'ui-click': { vol: 1.84, gap: 0.03, build: (k) => k.tone({ type: 'sine', f: f(k, 84), f2: f(k, 90), len: 0.05, peak: 0.25 }) },
  'ui-open': { vol: 0.73, gap: 0.08, build: (k) => { pop(k, 72); pop(k, 79, 0.06, 0.28); } },
  'ui-close': { vol: 0.9, gap: 0.08, build: (k) => { pop(k, 79, 0, 0.25); pop(k, 72, 0.06, 0.22); } },
  toast: { vol: 1.32, gap: 0.2, build: (k) => { ding(k, 88, 0, 0.15, 0.35); ding(k, 93, 0.07, 0.12, 0.4); } },
  'bag-full': { vol: 0.75, gap: 0.6, build: (k) => { k.tone({ type: 'triangle', f: f(k, 60), f2: f(k, 55), len: 0.16, peak: 0.3 }); k.tone({ type: 'triangle', f: f(k, 55), f2: f(k, 48), at: 0.16, len: 0.24, peak: 0.3 }); } },

  // ── 돈·진행
  coin: { vol: 1.52, gap: 0.05, send: 0.15, build: (k) => { k.tone({ type: 'square', f: f(k, 83), len: 0.06, peak: 0.12, lp: 5000 }); k.tone({ type: 'square', f: f(k, 88), at: 0.06, len: 0.28, peak: 0.12, lp: 5000 }); ding(k, 100, 0.06, 0.06, 0.3); } },
  'coins-big': {
    vol: 1.98, gap: 0.2, send: 0.2,
    build: (k) => { for (let i = 0; i < 9; i++) { const m = [83, 88, 91, 95, 100][Math.floor(k.rng() * 5)]; k.tone({ type: 'square', f: f(k, m), at: i * 0.055 + k.rng() * 0.02, len: 0.14, peak: 0.08, lp: 5000 }); ding(k, m + 12, i * 0.055, 0.05, 0.3); } },
  },
  star: { vol: 1.27, gap: 0.12, send: 0.35, build: (k) => { k.arp([84, 88, 91, 96], 0.05, { type: 'triangle', len: 0.4, peak: 0.16 }); ding(k, 103, 0.2, 0.12, 0.8); } },
  unlock: { vol: 1.42, gap: 0.3, send: 0.3, build: (k) => { k.tone({ type: 'triangle', f: f(k, 67), f2: f(k, 72), len: 0.1, peak: 0.2 }); fanfare(k, [72, 76, 79, 84], 0.08, 0.5, 0.18); } },
  craft: {
    vol: 0.75, gap: 0.3, send: 0.2,
    // 뚝딱뚝딱 — 나무망치 세 번 + 반짝
    build: (k) => { for (let i = 0; i < 3; i++) { k.tone({ type: 'sine', f: f(k, 64 + i * 3), f2: f(k, 52), at: i * 0.13, len: 0.08, peak: 0.35 }); k.noise({ at: i * 0.13, len: 0.04, filter: 'bandpass', f: 1800, peak: 0.2 }); } k.arp([84, 88, 91], 0.05, { at: 0.42, type: 'triangle', len: 0.35, peak: 0.15 }); },
  },
  sell: { vol: 2.17, gap: 0.08, send: 0.15, build: (k) => { k.tone({ type: 'square', f: f(k, 79), len: 0.05, peak: 0.1, lp: 4000 }); k.tone({ type: 'square', f: f(k, 86), at: 0.05, len: 0.08, peak: 0.1, lp: 4000 }); k.tone({ type: 'square', f: f(k, 91), at: 0.1, len: 0.25, peak: 0.1, lp: 4000 }); } },
  buy: { vol: 1.38, gap: 0.1, send: 0.15, build: (k) => { pop(k, 76); k.tone({ type: 'triangle', f: f(k, 83), at: 0.07, len: 0.3, peak: 0.18 }); ding(k, 95, 0.07, 0.08, 0.4); } },

  // ── 말
  'talk-blip': {
    vol: 0.8, gap: 0.05,
    // "뽀로롱": 높낮이가 살짝 다른 짧은 음 셋(주민마다 pitch)
    build: (k) => { const base = 72 + Math.floor(k.rng() * 5); [0, 4, 2].forEach((d, i) => k.tone({ type: 'triangle', f: f(k, base + d), f2: f(k, base + d + 1), at: i * 0.055, len: 0.05, peak: 0.22, a: 0.004 })); },
  },

  // ── 잡기(5.1 희귀도별)
  'catch-1': { vol: 2.25, gap: 0.1, send: 0.2, build: (k) => { pop(k, 74, 0, 0.4); k.arp([86, 91], 0.06, { at: 0.06, type: 'triangle', len: 0.2, peak: 0.12 }); } },
  'catch-2': { vol: 1.8, gap: 0.1, send: 0.25, build: (k) => { pop(k, 74, 0, 0.4); k.arp([79, 83, 86, 91], 0.06, { at: 0.05, type: 'triangle', len: 0.28, peak: 0.15 }); } },
  'catch-3': { vol: 1.18, gap: 0.2, send: 0.35, build: (k) => { k.noise({ len: 0.4, filter: 'bandpass', f: 1500, f2: 6000, q: 2, peak: 0.08, a: 0.2, curve: 'lin' }); fanfare(k, [72, 76, 79, 84], 0.09, 0.6, 0.2); ding(k, 96, 0.36, 0.12, 0.9); } },
  'catch-4': {
    vol: 1.14, gap: 0.3, send: 0.4,
    build: (k) => { k.noise({ len: 0.5, filter: 'bandpass', f: 1200, f2: 8000, q: 2.5, peak: 0.1, a: 0.3, curve: 'lin' }); fanfare(k, [71, 74, 78, 83, 86], 0.09, 0.9, 0.2); for (let i = 0; i < 5; i++) ding(k, 95 + [0, 3, 7, 10, 12][i], 0.45 + i * 0.07, 0.08, 0.7); },
  },
  'catch-5': {
    vol: 0.81, gap: 0.5, send: 0.45,
    // 전설 팡파르: 빰-빰-빰 빠아아암 + 위로 반짝 계단 + 낮은 받침
    build: (k) => {
      k.noise({ len: 0.9, filter: 'bandpass', f: 600, f2: 9000, q: 1.8, peak: 0.1, a: 0.6, curve: 'lin' });
      fanfare(k, [67, 67, 67, 72], 0.14, 0.05, 0.22);
      fanfare(k, [72, 76, 79, 84, 88], 0.11, 1.4, 0.22);
      k.tone({ type: 'triangle', f: f(k, 48), at: 0.42, len: 1.6, peak: 0.25, curve: 'hold' });
      k.tone({ type: 'triangle', f: f(k, 55), at: 0.42, len: 1.6, peak: 0.15, curve: 'hold' });
      for (let i = 0; i < 8; i++) ding(k, 96 + [0, 4, 7, 12, 16, 19, 24, 28][i], 0.9 + i * 0.06, 0.07, 0.8);
    },
  },
  'new-dex': {
    vol: 1.79, gap: 0.3, send: 0.2,
    // 도장 쾅! 낮은 쿵 + 종이 퍽 + 반짝
    build: (k) => { k.tone({ type: 'sine', f: f(k, 45), f2: f(k, 33), len: 0.25, peak: 0.6, a: 0.002 }); k.noise({ len: 0.12, filter: 'lowpass', f: 2200, f2: 400, peak: 0.4 }); ding(k, 91, 0.12, 0.12, 0.5); ding(k, 98, 0.18, 0.1, 0.6); },
  },
  shiny: { vol: 2.13, gap: 0.3, send: 0.5, build: (k) => { for (let i = 0; i < 10; i++) ding(k, [96, 99, 103, 106, 108][i % 5] + (i > 4 ? 12 : 0), i * 0.045, 0.07, 0.5); } },
  'fail-splash': { vol: 1.57, gap: 0.3, send: 0.1, build: (k) => { splash(k, 0.7); k.tone({ type: 'triangle', f: f(k, 67), f2: f(k, 60), at: 0.15, len: 0.18, peak: 0.16 }); k.tone({ type: 'triangle', f: f(k, 60), f2: f(k, 55), at: 0.33, len: 0.28, peak: 0.16 }); } },
  cast: { vol: 2.27, gap: 0.3, build: (k) => { k.noise({ len: 0.35, filter: 'bandpass', f: 900, f2: 3500, q: 2, peak: 0.25, a: 0.05 }); k.tone({ type: 'sine', f: f(k, 60), f2: f(k, 84), len: 0.3, peak: 0.06 }); } },
  nibble: { vol: 2.81, gap: 0.08, build: (k) => { k.tone({ type: 'sine', f: 380 * k.p, f2: 900 * k.p, len: 0.05, peak: 0.25 }); k.noise({ len: 0.05, filter: 'bandpass', f: 1600, q: 3, peak: 0.08 }); } },
  bite: { vol: 2.2, gap: 0.2, build: (k) => { k.tone({ type: 'sine', f: 260 * k.p, f2: 1100 * k.p, len: 0.1, peak: 0.4 }); splash(k, 0.45); k.tone({ type: 'triangle', f: f(k, 88), at: 0.05, len: 0.12, peak: 0.14 }); } },
  reel: { vol: 1.73, gap: 0.05, build: (k) => { for (let i = 0; i < 6; i++) k.noise({ at: i * 0.035, len: 0.02, filter: 'bandpass', f: 3800 + i * 80, q: 6, peak: 0.25 }); } },
  'net-swing': { vol: 1.38, gap: 0.15, build: (k) => k.noise({ len: 0.24, filter: 'bandpass', f: 600 * k.p, f2: 2600 * k.p, q: 1.5, peak: 0.35, a: 0.05, curve: 'lin' }) },
  'net-miss': { vol: 2.14, gap: 0.3, build: (k) => { k.noise({ len: 0.2, filter: 'bandpass', f: 2200, f2: 500, q: 1.4, peak: 0.25 }); k.tone({ type: 'triangle', f: f(k, 71), f2: f(k, 64), at: 0.1, len: 0.3, peak: 0.14, vib: [7, 40] }); } },

  // ── 채집
  chop: { vol: 1.98, gap: 0.08, send: 0.1, build: (k) => { k.tone({ type: 'triangle', f: 210 * k.p, f2: 120 * k.p, len: 0.12, peak: 0.5, a: 0.001 }); k.noise({ len: 0.08, filter: 'bandpass', f: 1300, q: 1.2, peak: 0.35 }); } },
  'rock-hit': { vol: 2.28, gap: 0.06, send: 0.15, build: (k) => { k.fm({ f: f(k, 72), ratio: 2.76, index: 2.2, len: 0.22, peak: 0.25 }); k.noise({ len: 0.05, filter: 'highpass', f: 2500, peak: 0.25 }); } },
  'rock-break': { vol: 1.17, gap: 0.2, send: 0.2, build: (k) => { k.noise({ len: 0.45, filter: 'lowpass', f: 2400, f2: 300, peak: 0.45 }); for (let i = 0; i < 5; i++) k.tone({ type: 'triangle', f: (300 + k.rng() * 500) * k.p, f2: 140 * k.p, at: 0.05 + i * 0.06, len: 0.07, peak: 0.2 }); ding(k, 91, 0.25, 0.1, 0.5); } },
  'shake-leaves': { vol: 2.46, gap: 0.2, build: (k) => { for (let i = 0; i < 7; i++) k.noise({ at: i * 0.06 + k.rng() * 0.03, len: 0.1, filter: 'bandpass', f: 3200 + k.rng() * 2000, q: 1.2, peak: 0.18 }); } },
  'fruit-drop': { vol: 0.64, gap: 0.1, build: (k) => { k.tone({ type: 'sine', f: f(k, 79), f2: f(k, 67), len: 0.18, peak: 0.25 }); k.tone({ type: 'sine', f: 160 * k.p, f2: 80 * k.p, at: 0.2, len: 0.1, peak: 0.45 }); k.tone({ type: 'sine', f: 140 * k.p, f2: 90 * k.p, at: 0.33, len: 0.06, peak: 0.2 }); } },
  pick: { vol: 2.73, gap: 0.06, send: 0.15, build: (k) => { pop(k, 79, 0, 0.3); ding(k, 91, 0.04, 0.08, 0.3); } },
  dig: { vol: 3.0, gap: 0.12, build: (k) => { k.noise({ len: 0.18, filter: 'lowpass', f: 1400, f2: 300, peak: 0.45, a: 0.004 }); k.noise({ at: 0.06, len: 0.14, filter: 'bandpass', f: 600, q: 1, peak: 0.2 }); } },

  // ── 상자·보물
  'chest-shake': { vol: 3.0, gap: 0.12, build: (k) => { k.noise({ len: 0.12, filter: 'bandpass', f: 900 * k.p, q: 2, peak: 0.3 }); k.tone({ type: 'triangle', f: 180 * k.p, f2: 140 * k.p, len: 0.1, peak: 0.25 }); for (let i = 0; i < 3; i++) k.tone({ type: 'square', f: (1600 + k.rng() * 800) * k.p, at: 0.02 + i * 0.03, len: 0.02, peak: 0.04, lp: 6000 }); } },
  'chest-open-wood': { vol: 1.58, gap: 0.3, send: 0.25, build: (k) => { k.tone({ type: 'sine', f: f(k, 60), f2: f(k, 72), len: 0.12, peak: 0.35 }); k.arp([79, 84, 88], 0.06, { at: 0.1, type: 'triangle', len: 0.3, peak: 0.16 }); } },
  'chest-open-silver': { vol: 1.74, gap: 0.3, send: 0.3, build: (k) => { k.tone({ type: 'sine', f: f(k, 62), f2: f(k, 74), len: 0.12, peak: 0.35 }); k.arp([81, 86, 90, 93], 0.06, { at: 0.1, type: 'triangle', len: 0.35, peak: 0.16 }); ding(k, 98, 0.35, 0.12, 0.7); } },
  'chest-open-gold': { vol: 1.57, gap: 0.3, send: 0.4, build: (k) => { k.noise({ len: 0.5, filter: 'bandpass', f: 800, f2: 7000, q: 2, peak: 0.1, a: 0.3, curve: 'lin' }); k.tone({ type: 'sine', f: f(k, 60), f2: f(k, 72), len: 0.12, peak: 0.35 }); fanfare(k, [72, 76, 79, 84, 88], 0.07, 0.8, 0.18); } },
  'chest-open-rainbow': { vol: 1.25, gap: 0.3, send: 0.45, build: (k) => { k.noise({ len: 0.7, filter: 'bandpass', f: 600, f2: 9000, q: 2, peak: 0.12, a: 0.5, curve: 'lin' }); fanfare(k, [72, 76, 79, 84, 88, 91], 0.07, 1.1, 0.2); for (let i = 0; i < 8; i++) ding(k, [96, 100, 103, 108][i % 4] + (i > 3 ? 12 : 0), 0.45 + i * 0.05, 0.07, 0.6); } },
  'chest-open-space': { vol: 1.88, gap: 0.3, send: 0.5, build: (k) => { k.tone({ type: 'sine', f: f(k, 60), f2: f(k, 96), len: 0.6, peak: 0.2, vib: [6, 30] }); fanfare(k, [69, 72, 76, 81, 84], 0.08, 0.9, 0.16); } },
  mimic: { vol: 1.31, gap: 0.4, send: 0.2, build: (k) => { k.tone({ type: 'sawtooth', f: 200 * k.p, f2: 90 * k.p, len: 0.25, peak: 0.25, lp: 1500 }); k.tone({ type: 'triangle', f: f(k, 72), f2: f(k, 60), at: 0.22, len: 0.12, peak: 0.2 }); k.tone({ type: 'triangle', f: f(k, 76), f2: f(k, 64), at: 0.36, len: 0.12, peak: 0.2 }); k.tone({ type: 'triangle', f: f(k, 79), f2: f(k, 67), at: 0.5, len: 0.2, peak: 0.2 }); } },
  'balloon-pop': { vol: 1.51, gap: 0.1, send: 0.2, build: (k) => { k.noise({ len: 0.08, filter: 'highpass', f: 1200, peak: 0.6, a: 0.0005 }); k.tone({ type: 'sine', f: 900 * k.p, f2: 200 * k.p, len: 0.06, peak: 0.3 }); k.arp([84, 88, 91], 0.05, { at: 0.08, type: 'triangle', len: 0.2, peak: 0.12 }); } },
  bottle: { vol: 2.09, gap: 0.3, send: 0.3, build: (k) => { k.tone({ type: 'sine', f: 520 * k.p, f2: 700 * k.p, len: 0.25, peak: 0.25, vib: [9, 30] }); k.noise({ len: 0.06, filter: 'bandpass', f: 4000, q: 4, peak: 0.15, at: 0.02 }); ding(k, 93, 0.2, 0.12, 0.6); } },

  // ── 물
  splash: { vol: 2.12, gap: 0.15, send: 0.1, build: (k) => splash(k, 1) },
  dive: { vol: 2.23, gap: 0.3, send: 0.15, build: (k) => { k.noise({ len: 0.4, filter: 'lowpass', f: 1800, f2: 200, peak: 0.4 }); for (let i = 0; i < 6; i++) k.tone({ type: 'sine', f: (300 + k.rng() * 300) * k.p, f2: (700 + k.rng() * 500) * k.p, at: 0.1 + i * 0.07, len: 0.05, peak: 0.12 }); } },
  surface: { vol: 2.43, gap: 0.3, send: 0.1, build: (k) => { k.noise({ len: 0.3, filter: 'bandpass', f: 700, f2: 2600, q: 0.8, peak: 0.3 }); k.tone({ type: 'sine', f: f(k, 72), f2: f(k, 79), at: 0.1, len: 0.1, peak: 0.12 }); } },
  bubbles: { vol: 1.08, gap: 0.25, send: 0.2, build: (k) => { for (let i = 0; i < 5; i++) { const b = (400 + k.rng() * 600) * k.p; k.tone({ type: 'sine', f: b, f2: b * 2.2, at: i * 0.07 + k.rng() * 0.04, len: 0.045, peak: 0.16 }); } } },

  // ── 움직임
  'step-grass': { vol: 1.51, gap: 0.12, build: (k) => step(k, 'bandpass', 1400, 0.07, 0.3) },
  'step-sand': { vol: 1.62, gap: 0.12, build: (k) => step(k, 'bandpass', 2400, 0.09, 0.22, true) },
  'step-snow': { vol: 1.02, gap: 0.12, build: (k) => step(k, 'lowpass', 1800, 0.12, 0.35, true) },
  'step-wood': { vol: 0.76, gap: 0.12, build: (k) => { k.tone({ type: 'triangle', f: 190 * k.p, f2: 130 * k.p, len: 0.06, peak: 0.4, a: 0.001 }); k.noise({ len: 0.04, filter: 'bandpass', f: 900, q: 1.5, peak: 0.15 }); } },
  'step-stone': { vol: 0.9, gap: 0.12, build: (k) => { k.noise({ len: 0.035, filter: 'bandpass', f: 3200 * k.p, f2: 2200 * k.p, q: 1.8, peak: 0.3, a: 0.001 }); k.tone({ type: 'triangle', f: 260 * k.p, f2: 200 * k.p, len: 0.035, peak: 0.18, a: 0.001 }); } },
  'step-land': { vol: 0.81, gap: 0.2, build: (k) => { k.tone({ type: 'sine', f: 120 * k.p, f2: 60 * k.p, len: 0.1, peak: 0.45 }); k.noise({ len: 0.08, filter: 'lowpass', f: 1200, peak: 0.2 }); } },
  jump: { vol: 1.66, gap: 0.15, build: (k) => k.tone({ type: 'sine', f: f(k, 64), f2: f(k, 79), len: 0.13, peak: 0.25, a: 0.004 }) },
  'glide-wind': { vol: 1.18, gap: 0.5, build: (k) => k.noise({ len: 1.2, filter: 'bandpass', f: 500, f2: 1400, q: 1.2, peak: 0.3, a: 0.3, curve: 'lin' }) },

  // ── 탈것·발사
  'bike-bell': { vol: 1.51, gap: 0.4, send: 0.2, build: (k) => { k.fm({ f: 1850 * k.p, ratio: 1.41, index: 1.2, len: 0.5, peak: 0.18 }); k.fm({ f: 1850 * k.p, ratio: 1.41, index: 1.2, at: 0.13, len: 0.6, peak: 0.18 }); } },
  'boat-engine': { vol: 1.02, gap: 0.6, build: (k) => { k.tone({ type: 'sawtooth', f: 45 * k.p, f2: 75 * k.p, len: 0.7, peak: 0.3, lp: 400, a: 0.05 }); k.noise({ len: 0.7, filter: 'lowpass', f: 500, peak: 0.12 }); } },
  'raft-paddle': { vol: 1.36, gap: 0.3, build: (k) => { k.noise({ len: 0.3, filter: 'bandpass', f: 800, f2: 1800, q: 1.1, peak: 0.25, a: 0.06, curve: 'lin' }); k.tone({ type: 'sine', f: 300 * k.p, f2: 500 * k.p, at: 0.18, len: 0.05, peak: 0.08 }); } },
  'rocket-countdown': {
    vol: 1.73, gap: 2,
    // 3 · 2 · 1 — 한 박 간격 삐, 마지막은 높게
    build: (k) => { for (let i = 0; i < 3; i++) k.tone({ type: 'square', f: f(k, 81), at: i, len: 0.16, peak: 0.12, lp: 3000, curve: 'hold' }); k.tone({ type: 'square', f: f(k, 93), at: 3, len: 0.4, peak: 0.12, lp: 3000, curve: 'hold' }); },
  },
  'rocket-launch': {
    vol: 1.01, gap: 2, send: 0.25,
    build: (k) => {
      k.noise({ len: 3.2, filter: 'lowpass', f: 300, f2: 2600, peak: 0.55, a: 0.4, curve: 'lin' });
      k.tone({ type: 'sawtooth', f: 38, f2: 70, len: 3, peak: 0.25, lp: 260, a: 0.3, curve: 'lin' });
      k.tone({ type: 'sine', f: f(k, 60), f2: f(k, 96), at: 0.4, len: 2.4, peak: 0.08, curve: 'lin' });
    },
  },
  arrive: { vol: 1.67, gap: 1, send: 0.4, build: (k) => { k.noise({ len: 0.8, filter: 'bandpass', f: 4000, f2: 500, q: 1.5, peak: 0.18 }); fanfare(k, [69, 72, 76, 81], 0.1, 0.8, 0.16); } },

  // ── 팡파르
  discover: {
    vol: 1.1, gap: 1, send: 0.45,
    build: (k) => { fanfare(k, [67, 72, 76, 79], 0.13, 0.12, 0.2); fanfare(k, [81, 79, 84], 0.16, 1.3, 0.2); k.tone({ type: 'triangle', f: f(k, 48), at: 0.5, len: 1.5, peak: 0.2, curve: 'hold' }); },
  },
  achievement: { vol: 1.29, gap: 0.8, send: 0.4, build: (k) => { fanfare(k, [72, 79, 84, 88, 91], 0.08, 0.9, 0.2); for (let i = 0; i < 4; i++) ding(k, 100 + i * 3, 0.4 + i * 0.06, 0.08, 0.6); } },
  mission: { vol: 1.52, gap: 0.6, send: 0.3, build: (k) => { fanfare(k, [76, 79, 84], 0.09, 0.5, 0.2); } },

  // ── 날씨(일회성: 천둥 · 빗방울 · 돌풍. 계속 나는 건 ambience)
  thunder: {
    vol: 0.92, gap: 2.5, send: 0.6,
    build: (k) => { k.noise({ len: 0.25, filter: 'highpass', f: 900, peak: 0.25 }); k.noise({ at: 0.05, len: 2.6, filter: 'lowpass', f: 600 * k.p, f2: 90, peak: 0.6, a: 0.05 }); k.tone({ type: 'sine', f: 50, f2: 32, at: 0.1, len: 2, peak: 0.4 }); },
  },
  rain: { vol: 1.32, gap: 0.5, build: (k) => { for (let i = 0; i < 12; i++) k.noise({ at: k.rng() * 0.8, len: 0.03, filter: 'bandpass', f: 2500 + k.rng() * 3000, q: 3, peak: 0.15 }); } },
  wind: { vol: 1.21, gap: 1, build: (k) => k.noise({ len: 2, filter: 'bandpass', f: 300, f2: 900, q: 1.4, peak: 0.35, a: 0.8, curve: 'lin' }) },

  // ── 생물
  'bee-buzz': { vol: 0.85, gap: 0.8, build: (k) => { k.tone({ type: 'sawtooth', f: 220 * k.p, len: 1, peak: 0.12, lp: 1400, a: 0.1, curve: 'hold', vib: [18, 60] }); k.tone({ type: 'sawtooth', f: 226 * k.p, len: 1, peak: 0.08, lp: 1400, a: 0.1, curve: 'hold', vib: [13, 50] }); } },
  stung: { vol: 1.17, gap: 0.8, build: (k) => { k.tone({ type: 'triangle', f: f(k, 84), f2: f(k, 96), len: 0.08, peak: 0.3 }); k.tone({ type: 'sine', f: f(k, 72), f2: f(k, 55), at: 0.1, len: 0.5, peak: 0.25, vib: [8, 60] }); } },
  'dino-roar-cute': {
    vol: 1.4, gap: 0.8, send: 0.25,
    // "꺅!" — 작은 공룡이 힘껏(톱니파 + 포먼트 띠 + 위로 꺾임)
    build: (k) => { k.tone({ type: 'sawtooth', f: 320 * k.p, f2: 520 * k.p, len: 0.18, peak: 0.2, lp: 2600, a: 0.02, vib: [24, 80] }); k.tone({ type: 'sawtooth', f: 520 * k.p, f2: 300 * k.p, at: 0.18, len: 0.3, peak: 0.18, lp: 2000, vib: [20, 60] }); k.noise({ len: 0.45, filter: 'bandpass', f: 1400, q: 3, peak: 0.08 }); },
  },
  'tino-snore': {
    vol: 0.77, gap: 1.5, send: 0.2,
    // 드르렁(들이쉼) … 쿠우(내쉼)
    build: (k) => { k.tone({ type: 'sawtooth', f: 70 * k.p, f2: 95 * k.p, len: 1, peak: 0.25, lp: 500, a: 0.4, curve: 'lin', vib: [26, 90] }); k.noise({ at: 1.1, len: 0.9, filter: 'bandpass', f: 500, f2: 300, q: 1.5, peak: 0.12, a: 0.2, curve: 'lin' }); },
  },
  clap: { vol: 1.2, gap: 0.3, send: 0.2, build: (k) => { for (let i = 0; i < 6; i++) k.noise({ at: i * 0.11 + k.rng() * 0.03, len: 0.05, filter: 'bandpass', f: 1500 + k.rng() * 600, q: 1.4, peak: 0.35, a: 0.001 }); } },
};

// 별칭
SFX['chest-open'] = SFX['chest-open-wood'];
SFX['step'] = SFX['step-grass'];

export const SFX_NAMES: readonly string[] = Object.keys(SFX);
export const hasSfx = (name: string) => Object.prototype.hasOwnProperty.call(SFX, name);
