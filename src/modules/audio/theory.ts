// 음악 이론(순수) — 섬별 곡 정의 + 5음 음계 생성 시퀀서. WebAudio 없이 음표만 만든다 → 테스트가 그대로 읽는다.
// 같은 (곡, 마디, 밤?) 이면 언제나 같은 음표(rngFor 키 고정). 16마디(A 8 + B 8)마다 되풀이된다.
import { rngFor } from '../../core/rng';

/** 악기 이름(patches.ts 가 소리를 만든다) */
export type PatchName = 'pluck' | 'marimba' | 'bells' | 'musicbox' | 'steeldrum' | 'reed' | 'synth' | 'pad';
/** 곡 id = 섬 테마(+ 우주 moon) */
export type TrackId = 'home' | 'dino' | 'ice' | 'mushroom' | 'coral' | 'desert' | 'launch' | 'moon';
export const TRACK_IDS: readonly TrackId[] = ['home', 'dino', 'ice', 'mushroom', 'coral', 'desert', 'launch', 'moon'];

export interface TrackDef {
  id: TrackId;
  patch: PatchName;
  /** 으뜸음(MIDI) */
  root: number;
  /** 5음 음계: 장(도레미솔라) / 단(라도레미솔) */
  mode: 'major' | 'minor';
  /** 낮 빠르기(4분음표/분) */
  bpm: number;
  /** 8분음표 칸마다 음이 날 확률(0..1) */
  density: number;
  /** 마디별 화음: [으뜸음에서 반음 거리, 단조?] — 4마디 돌림 */
  prog: ReadonlyArray<readonly [number, boolean]>;
  /** 베이스 음량(0..1) */
  bass: number;
}

export const MAJOR_PENT = [0, 2, 4, 7, 9] as const;
export const MINOR_PENT = [0, 3, 5, 7, 10] as const;

export const TRACKS: Readonly<Record<TrackId, TrackDef>> = {
  // 말랑섬: 통통 튀는 뜯는 소리, 다장조 I–vi–IV–V
  home: { id: 'home', patch: 'pluck', root: 60, mode: 'major', bpm: 96, density: 0.66, prog: [[0, false], [9, true], [5, false], [7, false]], bass: 0.55 },
  // 공룡섬: 나무 마림바, 경쾌
  dino: { id: 'dino', patch: 'marimba', root: 62, mode: 'major', bpm: 108, density: 0.72, prog: [[0, false], [5, false], [7, false], [0, false]], bass: 0.6 },
  // 솜눈섬: 맑은 종, 느릿
  ice: { id: 'ice', patch: 'bells', root: 67, mode: 'major', bpm: 78, density: 0.42, prog: [[0, false], [4, true], [5, false], [7, false]], bass: 0.35 },
  // 반딧불버섯섬: 오르골, 몽글한 단조
  mushroom: { id: 'mushroom', patch: 'musicbox', root: 69, mode: 'minor', bpm: 86, density: 0.58, prog: [[0, true], [8, false], [3, false], [10, false]], bass: 0.4 },
  // 산호빛섬: 스틸드럼, 여름 바다
  coral: { id: 'coral', patch: 'steeldrum', root: 65, mode: 'major', bpm: 112, density: 0.76, prog: [[0, false], [5, false], [2, true], [7, false]], bass: 0.6 },
  // 모래시계섬: 갈대 피리, 단조
  desert: { id: 'desert', patch: 'reed', root: 62, mode: 'minor', bpm: 84, density: 0.52, prog: [[0, true], [10, false], [8, false], [7, false]], bass: 0.5 },
  // 별똥별섬: 반짝 신스
  launch: { id: 'launch', patch: 'synth', root: 64, mode: 'major', bpm: 118, density: 0.68, prog: [[0, false], [9, true], [5, false], [7, false]], bass: 0.55 },
  // 달: 넓은 패드, 아주 느릿
  moon: { id: 'moon', patch: 'pad', root: 57, mode: 'minor', bpm: 62, density: 0.32, prog: [[0, true], [5, true], [8, false], [7, false]], bass: 0.3 },
};

/** 한 마디 = 8분음표 8칸 */
export const STEPS_PER_BAR = 8;
/** 밤 변주: 빠르기·밀도·세기 배율 */
export const NIGHT = { bpm: 0.74, density: 0.62, vel: 0.62 } as const;

export interface Note {
  /** 마디 안 칸(0..7) */
  step: number;
  midi: number;
  /** 길이(칸) */
  dur: number;
  /** 세기 0..1 */
  vel: number;
  part: 'lead' | 'bass' | 'chord';
}

/** 곡 키: 'dino' · 'dino-night' */
export const trackKey = (id: TrackId, night: boolean) => (night ? `${id}-night` : id);
export const isTrackId = (s: unknown): s is TrackId => typeof s === 'string' && (TRACK_IDS as readonly string[]).includes(s);

/** 'dino-night' → {id:'dino', night:true}. 모르는 이름이면 null */
export function parseTrack(key: string): { id: TrackId; night: boolean } | null {
  const night = key.endsWith('-night');
  const id = night ? key.slice(0, -6) : key;
  return isTrackId(id) ? { id, night } : null;
}

/** 섬 테마 → 곡. 작은 섬(islet)·모르는 곳은 말랑섬 곡 */
export function themeTrack(theme: string | null | undefined): TrackId {
  if (theme && isTrackId(theme) && theme !== 'moon') return theme;
  return 'home';
}

/** 지금 들려줄 곡 키(우주 = 달, 밤 = 느린 변주) */
export function trackFor(o: { world: 'earth' | 'space'; theme: string | null | undefined; tod: string }): string {
  const id: TrackId = o.world === 'space' ? 'moon' : themeTrack(o.theme);
  return trackKey(id, o.tod === 'night');
}

/** 8분음표 한 칸 길이(초) */
export function stepSec(def: TrackDef, night: boolean): number {
  return 60 / (def.bpm * (night ? NIGHT.bpm : 1)) / 2;
}

const scaleOf = (def: TrackDef) => (def.mode === 'major' ? MAJOR_PENT : MINOR_PENT);
/** 음계 도(0..) → 으뜸음 기준 반음 */
export function degreeSemi(def: TrackDef, deg: number): number {
  const sc = scaleOf(def);
  const o = Math.floor(deg / sc.length);
  return o * 12 + sc[((deg % sc.length) + sc.length) % sc.length];
}
/** 그 화음의 구성음(반음 class 0..11) */
function chordPcs(rootSemi: number, minor: boolean): number[] {
  return [rootSemi % 12, (rootSemi + (minor ? 3 : 4)) % 12, (rootSemi + 7) % 12];
}
/** 선율 음역: 음계 도 0..10(두 옥타브 남짓) */
const LEAD_MAX = 10;

/**
 * 한 마디 음표(결정적). bar 는 0 부터 무한히 — 16마디마다 같은 모양으로 돈다.
 * 선율은 5음 음계를 무작위 걸음으로 걷고, 센 박(0·4칸)에선 화음 구성음에 붙는다. 프레이즈 끝(8마디째)은 길게 끈다.
 */
export function barNotes(id: TrackId, bar: number, night = false): Note[] {
  const def = TRACKS[id] ?? TRACKS.home;
  const b = ((Math.floor(bar) % 16) + 16) % 16;
  const phrase = b % 8;
  const section = b < 8 ? 'A' : 'B';
  const rng = rngFor(`audio:music:${id}:${night ? 'n' : 'd'}:${section}:${phrase}`);
  const [chordRoot, minor] = def.prog[phrase % def.prog.length];
  const pcs = chordPcs(chordRoot, minor);
  const velMul = night ? NIGHT.vel : 1;
  const dens = def.density * (night ? NIGHT.density : 1);
  const out: Note[] = [];

  // 선율: 프레이즈 시작 높이는 절의 rng 로(A·B 가 다른 결)
  let deg = 3 + Math.floor(rngFor(`audio:music:${id}:${section}:start`)() * 4);
  const last = phrase === 7;
  for (let s = 0; s < STEPS_PER_BAR; s++) {
    const strong = s % 4 === 0;
    const p = strong ? Math.min(1, dens + 0.25) : s % 2 === 0 ? dens : dens * 0.55;
    if (rng() >= p) continue;
    if (last && s > 4) break; // 끝 마디는 쉬며 숨 돌리기
    const stepBy = [-2, -1, -1, 0, 1, 1, 2][Math.floor(rng() * 7)];
    deg = Math.max(0, Math.min(LEAD_MAX, deg + stepBy));
    if (strong) {
      // 가까운 화음 구성음으로 붙기
      for (const d of [0, 1, -1, 2, -2]) {
        const c = deg + d;
        if (c < 0 || c > LEAD_MAX) continue;
        const pc = ((degreeSemi(def, c) % 12) + 12) % 12;
        if (pcs.includes(pc)) { deg = c; break; }
      }
    }
    let dur = rng() < 0.3 ? 2 : 1;
    if (last && s >= 4) dur = 4;
    dur = Math.min(dur, STEPS_PER_BAR - s);
    out.push({ step: s, midi: def.root + degreeSemi(def, deg), dur, vel: (strong ? 0.8 : 0.62) * velMul * (0.9 + rng() * 0.2), part: 'lead' });
  }

  // 베이스: 마디 첫 박 으뜸음, 낮엔 셋째 박에 5도
  const bassRoot = def.root - 24 + chordRoot;
  out.push({ step: 0, midi: bassRoot, dur: night ? 8 : 4, vel: def.bass * velMul, part: 'bass' });
  if (!night) out.push({ step: 4, midi: bassRoot + (rng() < 0.5 ? 7 : 12), dur: 4, vel: def.bass * 0.8, part: 'bass' });

  // 화음 깔개: 패드 곡이거나 밤이면 마디 내내, 아니면 홀수 프레이즈 첫 박에만 살짝
  if (def.patch === 'pad' || night || phrase % 2 === 1) {
    const base = def.root - 12 + chordRoot;
    const tri = [0, minor ? 3 : 4, 7];
    for (const iv of tri) out.push({ step: 0, midi: base + iv, dur: 8, vel: 0.22 * velMul, part: 'chord' });
  }
  return out;
}

/** MIDI → Hz */
export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
