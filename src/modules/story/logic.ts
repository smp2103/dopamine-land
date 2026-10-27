// 이야기 순수 로직 — flags.story 모양 · 챕터 고르기(해금·발견 기록에서) · 챕터 목표 줄 · 수평선 목표 고르기 ·
// 인트로 시작 조건 · 엔딩 상태 기계. DOM·three 없이 테스트한다.
import { CHAINS, CHAPTERS, PIECES_TOTAL, chapterDef, type ChapterNo } from './data';
import { asStatus, type ChainStatus } from './chains';

// ───────────── 저장(flags.story) ─────────────
export type IntroState = 'none' | 'fell' | 'met';
export type EndingState = 'none' | 'armed' | 'playing' | 'done';
export interface StoryFlags {
  v: 1;
  /** none 아직 · fell 별똥별이 떨어짐(토토가 구덩이 안) · met 토토를 만남 */
  intro: IntroState;
  /** 구덩이 자리(처음 정한 뒤 고정) */
  crater: { x: number; z: number } | null;
  /** 지금까지 닿은 가장 높은 챕터(되돌아가지 않는다) */
  chapter: ChapterNo;
  /** 체인 상태('1'..'7') */
  chains: Record<string, { s: ChainStatus; day?: number }>;
  /** 받은 별조각 번호 */
  pieces: number[];
  /** 놓아준 수(태그별) */
  released: Record<string, number>;
  /** 이야기가 본 숨은 곳(secret-found) */
  secrets: string[];
  /** 건넨 물건 */
  given: string[];
  /** 오로라 밤에 잡아 보여 준 종 */
  shown: string[];
  /** 다녀온 행성 */
  planets: string[];
  /** 부탁을 끝내 준 주민(request-done 의 npc) */
  helped: string[];
  /** 별조각 7개로 토토의 별이 되살아났나 */
  restored: boolean;
  /** 한 번이라도 발사했나 */
  launched: boolean;
  ending: EndingState;
  /** 엔딩 본 게임 날 */
  endedDay?: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []);

export function emptyStory(): StoryFlags {
  return {
    v: 1, intro: 'none', crater: null, chapter: 1, chains: {}, pieces: [], released: {}, secrets: [], given: [], shown: [], planets: [], helped: [],
    restored: false, launched: false, ending: 'none',
  };
}

/** flags.story 를 읽어 고쳐 깐다(없으면 새로) — 같은 객체를 돌려준다 */
export function ensureStory(flags: Record<string, unknown>): StoryFlags {
  let s = flags.story;
  if (!isObj(s)) { s = emptyStory(); flags.story = s; }
  const o = s as Record<string, unknown>;
  const d = emptyStory();
  o.v = 1;
  o.intro = o.intro === 'fell' || o.intro === 'met' ? o.intro : 'none';
  const cr = o.crater;
  o.crater = isObj(cr) && Number.isFinite(cr.x) && Number.isFinite(cr.z) ? { x: Number(cr.x), z: Number(cr.z) } : null;
  o.chapter = Math.max(1, Math.min(6, Math.floor(Number(o.chapter) || 1))) as ChapterNo;
  const ch: Record<string, { s: ChainStatus; day?: number }> = {};
  if (isObj(o.chains)) for (const [k, v] of Object.entries(o.chains)) if (isObj(v)) ch[k] = { s: asStatus(v.s), ...(Number.isFinite(v.day) ? { day: Number(v.day) } : {}) };
  o.chains = ch;
  o.pieces = [...new Set(nums(o.pieces).filter((n) => n >= 1 && n <= PIECES_TOTAL))].sort((a, b) => a - b);
  const rel: Record<string, number> = {};
  if (isObj(o.released)) for (const [k, v] of Object.entries(o.released)) if (Number.isFinite(v)) rel[k] = Math.max(0, Number(v));
  o.released = rel;
  o.secrets = [...new Set(strs(o.secrets))];
  o.given = [...new Set(strs(o.given))];
  o.shown = [...new Set(strs(o.shown))];
  o.planets = [...new Set(strs(o.planets))];
  o.helped = [...new Set(strs(o.helped))];
  o.restored = !!o.restored;
  o.launched = !!o.launched;
  o.ending = o.ending === 'armed' || o.ending === 'done' ? o.ending : o.ending === 'playing' ? 'armed' : d.ending;
  if (!Number.isFinite(o.endedDay)) delete o.endedDay;
  return o as unknown as StoryFlags;
}

// ───────────── 챕터 ─────────────
/** 챕터 고르기에 쓰는 사실(해금 키·발견·체인) */
export interface ChapterFacts {
  isUnlocked(key: string): boolean;
  discovered(island: string): boolean;
  /** 로켓 부품 수(0..6) */
  parts: number;
  /** 발사대 */
  pad: boolean;
  /** 설계도 */
  blueprint: boolean;
  /** 달에 가 봤나(space:moon 또는 발사 기록) */
  moon: boolean;
  /** 다녀온 행성 수(달 빼고) */
  planets: number;
  /** 고친 등대 수 */
  lighthouses: number;
  /** 별조각 수 */
  pieces: number;
  /** 몽실 부탁을 하나라도 끝냈나 */
  mongsilDone: boolean;
  /** 엔딩을 봤나 */
  ended: boolean;
}

export interface GoalRow { text: string; done: boolean; icon: string }

const TOOL_KEYS = ['tool:rod', 'tool:net', 'tool:shovel', 'tool:hammer', 'tool:slingshot'];
const BOAT_KEYS = ['v:raft', 'v:duck_tube', 'v:tugboat', 'v:yacht', 'v:motorboat', 'v:jetski', 'v:submarine'];

/** 챕터 n 을 넘어가는 조건(다음 챕터로) */
export function chapterExit(n: number, f: ChapterFacts): boolean {
  const u = (k: string) => { try { return f.isUnlocked(k); } catch { return false; } };
  const disc = (id: string) => { try { return f.discovered(id); } catch { return false; } };
  switch (n) {
    case 1: return BOAT_KEYS.some(u) || disc('coral') || disc('mushroom');
    case 2: return u('v:tugboat') || u('v:motorboat') || u('v:yacht') || disc('dino') || disc('ice');
    case 3: return u('v:motorboat') || disc('desert');
    case 4: return f.blueprint || u('rocket:blueprint') || f.parts > 0;
    case 5: return f.moon;
    default: return false;
  }
}

/** 사실에서 고른 챕터(1..6) — 앞 챕터를 건너뛰어도(배를 먼저 산 판) 가장 먼 곳까지 */
export function deriveChapter(f: ChapterFacts): ChapterNo {
  let n = 1;
  for (let k = 5; k >= 1; k--) if (chapterExit(k, f)) { n = k + 1; break; }
  return n as ChapterNo;
}

/** 저장된 최고 챕터와 합친다(되돌아가지 않는다) */
export const nextChapter = (saved: number, f: ChapterFacts): ChapterNo => Math.max(Math.floor(saved) || 1, deriveChapter(f)) as ChapterNo;

/** 챕터 목표 줄(GDD 4.14 '목표' 칸) */
export function chapterGoals(n: number, f: ChapterFacts): GoalRow[] {
  const u = (k: string) => { try { return f.isUnlocked(k); } catch { return false; } };
  const disc = (id: string) => { try { return f.discovered(id); } catch { return false; } };
  const tools = TOOL_KEYS.filter(u).length;
  switch (n) {
    case 1: return [
      { icon: '🏠', text: '내 집 짓기', done: u('house:1') },
      { icon: '🛠️', text: `도구 4종 (${Math.min(4, tools)}/4)`, done: tools >= 4 },
      { icon: '🐟', text: '박물관 수족관동 열기', done: u('wing:aquarium') },
      { icon: '🐻', text: '곰 몽실 부탁 들어주기', done: f.mongsilDone },
      { icon: '🛶', text: '뗏목 만들기', done: u('v:raft') },
    ];
    case 2: return [
      { icon: '🛶', text: '뗏목으로 바다 건너기', done: BOAT_KEYS.some(u) },
      { icon: '🪸', text: '산호빛섬 가 보기', done: disc('coral') },
      { icon: '🍄', text: '반딧불버섯섬 가 보기', done: disc('mushroom') },
      { icon: '🤿', text: '스노클 장만하기', done: u('tool:snorkel') },
    ];
    case 3: return [
      { icon: '🚤', text: '통통배 타기', done: u('v:tugboat') },
      { icon: '🦕', text: '쿵쿵공룡섬 가 보기', done: disc('dino') },
      { icon: '❄️', text: '솜눈섬 가 보기', done: disc('ice') },
      { icon: '🦴', text: '박물관 화석관 열기', done: u('wing:fossil') },
    ];
    case 4: return [
      { icon: '🛥️', text: '모터보트 타기', done: u('v:motorboat') },
      { icon: '🏜️', text: '모래시계섬 가 보기', done: disc('desert') },
      { icon: '🗼', text: `등대 4개 고치기 (${Math.min(4, f.lighthouses)}/4)`, done: f.lighthouses >= 4 },
      { icon: '📜', text: '펭박사 로켓 설계도', done: f.blueprint || u('rocket:blueprint') },
    ];
    case 5: return [
      { icon: '🔩', text: `로켓 부품 6개 (${Math.min(6, f.parts)}/6)`, done: f.parts >= 6 },
      { icon: '🛰️', text: '발사대 짓기', done: f.pad },
      { icon: '🚀', text: '첫 발사 → 달', done: f.moon },
    ];
    default: return [
      { icon: '🌙', text: '토끼달 도착', done: f.moon },
      { icon: '🪐', text: `행성 3곳 가 보기 (${Math.min(3, f.planets)}/3)`, done: f.planets >= 3 },
      { icon: '⭐', text: `별조각 ${Math.min(PIECES_TOTAL, f.pieces)}/${PIECES_TOTAL}`, done: f.pieces >= PIECES_TOTAL },
      { icon: '🐰', text: '토토를 집에 보내 주기', done: f.ended },
    ];
  }
}

// ───────────── 수평선 목표 ─────────────
export interface TargetSpot { x: number; z: number; name: string; id: string }
export interface LandmarkLike { id: string; kind: string; island: string; name: string; x: number; z: number }

/** 이야기 목표가 가리킬 곳: 토토(아직 못 만남) → 별 되살림 뒤 발사대 → 챕터의 수평선 */
export function pickTarget(o: {
  chapter: number;
  intro: IntroState;
  crater: { x: number; z: number } | null;
  restored: boolean;
  ended: boolean;
  landmarks: readonly LandmarkLike[];
  islandCenter(id: string): { x: number; z: number } | null;
  islandName(id: string): string;
}): TargetSpot | null {
  if (o.intro === 'fell' && o.crater) return { ...o.crater, name: '반짝이는 별똥별', id: 'story:crater' };
  if (o.ended) return null;
  const byId = (id: string) => o.landmarks.find((l) => l.id === id) ?? null;
  if (o.restored) {
    const pad = byId('lm:launch:launchpad') ?? o.landmarks.find((l) => l.kind === 'launchpad') ?? null;
    if (pad) return { x: pad.x, z: pad.z, name: pad.name, id: pad.id };
  }
  const def = chapterDef(o.chapter);
  const t = def.target;
  if (!t) return null;
  for (const id of t.landmarks) { const l = byId(id); if (l) return { x: l.x, z: l.z, name: l.name, id: l.id }; }
  for (const k of t.kinds ?? []) {
    const l = o.landmarks.find((x) => x.kind === k && (!t.island || x.island === t.island));
    if (l) return { x: l.x, z: l.z, name: l.name, id: l.id };
  }
  if (t.island) {
    const c = o.islandCenter(t.island);
    if (c) return { x: c.x, z: c.z, name: o.islandName(t.island), id: `island:${t.island}` };
  }
  return null;
}

// ───────────── 인트로 ─────────────
export interface IntroGate {
  intro: IntroState;
  /** 지구에 있고 실내·행성이 아니다 */
  earth: boolean;
  /** 지금 밤(env 없으면 null) */
  night: boolean | null;
  /** env 없이 기다린 실제 초 */
  waited: number;
  /** 잠금·탈것·창 열림 등 연출을 못 하는 때 */
  busy: boolean;
}
/** 별똥별 인트로를 지금 시작해도 되나(첫 밤 · 지구 · 한가할 때 — env 가 없으면 한참 기다린 뒤) */
export function introReady(g: IntroGate, noEnvSec: number): boolean {
  if (g.intro !== 'none' || !g.earth || g.busy) return false;
  if (g.night === null) return g.waited >= noEnvSec;
  return g.night;
}

/** 0..1 보간 도우미 */
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
export const easeIn = (x: number) => clamp01(x) ** 2;

/** 별똥별 위치: 하늘 start → 구덩이 end 로 살짝 휘며(u 0..1). 돌려주는 값은 구덩이 기준 상대 좌표 */
export function meteorPath(u: number, from: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const k = easeIn(u);
  // 끝으로 갈수록 빨라지고(easeIn), 살짝 아래로 휜다
  return { x: from.x * (1 - k), y: from.y * (1 - k) - Math.sin(Math.PI * k) * from.y * 0.08, z: from.z * (1 - k) };
}

// ───────────── 엔딩 상태 기계 ─────────────
export type EndingInput =
  | { kind: 'launch' }
  | { kind: 'arrive'; to: string }
  | { kind: 'tick'; world: 'earth' | 'space'; sinceLaunch: number }
  | { kind: 'finish' };
export interface EndingCtx { restored: boolean; fallbackSec: number }
export interface EndingOut { state: EndingState; /** 지금 엔딩 연출을 시작한다 */ play: boolean; /** ending 이벤트를 보낸다 */ emit: boolean }

/**
 * 별이 되살아난(restored) 뒤 발사하면 armed → 우주(달·행성)에 닿으면 playing(연출) → 끝나면 done + ending 이벤트.
 * 우주 모듈이 없어서 한참 지나도 지구에 있으면 그 자리에서 연출한다. done 은 다시 안 돈다.
 */
export function endingStep(state: EndingState, inp: EndingInput, c: EndingCtx): EndingOut {
  const same = { state, play: false, emit: false };
  if (state === 'done') return same;
  switch (inp.kind) {
    case 'launch': return state === 'none' && c.restored ? { state: 'armed', play: false, emit: false } : same;
    case 'arrive': return state === 'armed' && inp.to !== 'earth' ? { state: 'playing', play: true, emit: false } : same;
    case 'tick':
      if (state !== 'armed') return same;
      if (inp.world === 'space' && inp.sinceLaunch > 2.5) return { state: 'playing', play: true, emit: false };
      if (inp.sinceLaunch >= c.fallbackSec) return { state: 'playing', play: true, emit: false };
      return same;
    case 'finish': return state === 'playing' ? { state: 'done', play: false, emit: true } : same;
  }
}

/** 지금 할 일 한 줄(목표 칩 둘째 줄) */
export function nextStepText(o: { intro: IntroState; pieces: number; restored: boolean; ending: EndingState; chapter: number }): string {
  if (o.intro === 'none') return '밤하늘을 올려다보자 ✨';
  if (o.intro === 'fell') return '집 근처 반짝이는 별똥별을 살펴보자';
  if (o.ending === 'done') return '토토는 별나라에서 반짝이는 중! 🌟';
  if (o.ending === 'armed' || o.ending === 'playing') return '우주로! 토토가 집에 가는 길 🚀';
  if (o.restored) return '로켓을 타고 우주로 가자 🚀';
  const def = chapterDef(o.chapter);
  return `별조각 ${o.pieces}/${PIECES_TOTAL} · 다음: ${def.horizon}`;
}

/** 챕터 표(패널) */
export const chapterRows = (cur: number) => CHAPTERS.map((c) => ({ def: c, state: c.no < cur ? 'done' as const : c.no === cur ? 'now' as const : 'later' as const }));
/** 체인 표 */
export const chainList = () => CHAINS;
