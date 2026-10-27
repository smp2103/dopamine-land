// 섬별 악기 — 음표 하나(MIDI·길이·세기)를 Kit 조각으로 친다. 베이스·화음 깔개는 모든 곡이 같은 부드러운 소리.
import { hz, type Kit } from './synth';
import type { Note, PatchName } from './theory';

type Play = (k: Kit, midi: number, dur: number, vel: number) => void;

const LEAD: Record<PatchName, Play> = {
  // 말랑섬: 뜯는 줄(삼각 + 짧은 사각 어택, 금방 사그라짐)
  pluck: (k, m, d, v) => {
    k.tone({ type: 'triangle', f: hz(m), len: Math.max(0.25, d * 1.4), peak: 0.2 * v, a: 0.003 });
    k.tone({ type: 'square', f: hz(m), len: 0.06, peak: 0.05 * v, lp: 3000 });
  },
  // 공룡섬: 마림바(사인 + 4배음 FM, 아주 짧게)
  marimba: (k, m, d, v) => {
    k.fm({ f: hz(m), ratio: 4, index: 0.9, len: Math.min(0.6, 0.3 + d * 0.5), peak: 0.24 * v });
    k.tone({ type: 'sine', f: hz(m) * 0.5, len: 0.12, peak: 0.06 * v });
  },
  // 솜눈섬: 종(비정수비 FM, 길게 울림)
  bells: (k, m, d, v) => {
    k.fm({ f: hz(m), ratio: 3.5, index: 2.2, len: 1.6 + d * 0.5, peak: 0.13 * v });
    k.tone({ type: 'sine', f: hz(m + 12), len: 0.9, peak: 0.04 * v });
  },
  // 버섯섬: 오르골(높은 사인 + 2.76배 FM, 맑고 작게)
  musicbox: (k, m, d, v) => {
    k.fm({ f: hz(m + 12), ratio: 2.76, index: 0.7, len: 0.9 + d * 0.3, peak: 0.13 * v });
  },
  // 산호빛섬: 스틸드럼(사인 + 1.5·2.8배 겹, 살짝 위로 휨)
  steeldrum: (k, m, d, v) => {
    const f0 = hz(m);
    k.tone({ type: 'sine', f: f0 * 0.985, f2: f0, len: 0.5 + d * 0.3, peak: 0.2 * v, a: 0.002 });
    k.tone({ type: 'sine', f: f0 * 1.5, len: 0.25, peak: 0.06 * v });
    k.tone({ type: 'sine', f: f0 * 2.8, len: 0.12, peak: 0.04 * v });
  },
  // 모래시계섬: 갈대 피리(삼각 + 저역 통과 톱니, 숨결 소음, 비브라토)
  reed: (k, m, d, v) => {
    const len = Math.max(0.28, d * 1.05);
    k.tone({ type: 'triangle', f: hz(m), len, peak: 0.15 * v, a: 0.04, curve: 'hold', vib: [5, 14] });
    k.tone({ type: 'sawtooth', f: hz(m), len, peak: 0.04 * v, a: 0.05, lp: 1500, curve: 'hold' });
    k.noise({ len: Math.min(len, 0.4), filter: 'bandpass', f: hz(m) * 2, q: 4, peak: 0.02 * v, a: 0.03 });
  },
  // 별똥별섬: 반짝 신스(사각 두 겹 디튠 + 저역)
  synth: (k, m, d, v) => {
    const len = Math.max(0.18, d * 0.9);
    k.tone({ type: 'square', f: hz(m), len, peak: 0.06 * v, lp: 2600, detune: -6, curve: 'exp' });
    k.tone({ type: 'square', f: hz(m), len, peak: 0.06 * v, lp: 2600, detune: 6, curve: 'exp' });
    k.tone({ type: 'sine', f: hz(m + 12), len: 0.1, peak: 0.05 * v });
  },
  // 달: 패드(톱니 디튠 겹 + 느린 붙임)
  pad: (k, m, d, v) => {
    const len = Math.max(0.8, d * 1.2);
    k.tone({ type: 'sawtooth', f: hz(m), len, peak: 0.04 * v, a: Math.min(0.5, len * 0.4), lp: 1100, detune: -9, curve: 'hold' });
    k.tone({ type: 'sawtooth', f: hz(m), len, peak: 0.04 * v, a: Math.min(0.5, len * 0.4), lp: 1100, detune: 9, curve: 'hold' });
    k.tone({ type: 'sine', f: hz(m), len, peak: 0.08 * v, a: Math.min(0.4, len * 0.3), curve: 'hold' });
  },
};

/** 베이스: 둥근 사인 + 살짝 삼각 */
const BASS: Play = (k, m, d, v) => {
  k.tone({ type: 'sine', f: hz(m), len: Math.max(0.3, d * 0.95), peak: 0.28 * v, a: 0.01, curve: 'hold' });
  k.tone({ type: 'triangle', f: hz(m), len: 0.12, peak: 0.06 * v });
};
/** 화음 깔개: 아주 작은 사인(붙임 길게) */
const CHORD: Play = (k, m, d, v) => {
  k.tone({ type: 'sine', f: hz(m), len: d, peak: 0.12 * v, a: Math.min(0.6, d * 0.35), curve: 'hold' });
};

/** 음표 하나 치기(stepSec = 한 칸 초) */
export function playNote(k: Kit, patch: PatchName, n: Note, stepSec: number) {
  const dur = n.dur * stepSec;
  if (n.part === 'bass') BASS(k, n.midi, dur, n.vel);
  else if (n.part === 'chord') CHORD(k, n.midi, dur, n.vel);
  else (LEAD[patch] ?? LEAD.pluck)(k, n.midi, dur, n.vel);
}

export const PATCHES = Object.keys(LEAD) as PatchName[];
