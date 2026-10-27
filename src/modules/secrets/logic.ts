// secrets 순수 규칙(화면·WebGL 없이 테스트한다) — 숨은 곳 12곳 표, 시간·날씨 문 열림 표, 아기 매머드 녹이기 상태 기계,
// 하루·보름 주기 열쇠, 저장 모양(flags.secrets).
import { DAY_SEC, MOON_DAYS, todOf, type Weather } from '../../core/api';
import type { SecretId } from '../../core/events';

// ───────────── 숨은 곳 표 ─────────────
/** 이 모듈이 맡는 12곳(GDD 2.2.2 — home·dino·ice·mushroom). 산호·사막·별똥별은 hidden 모듈 몫 */
export const MY_SECRETS = [
  'home-waterfall-cave', 'home-cliff-beach', 'home-fairy-ring',
  'dino-lava-garden', 'dino-mural-cave', 'dino-bubble-cave',
  'ice-mammoth', 'ice-aurora-cave', 'ice-avalanche',
  'mush-moon-deck', 'mush-swamp-hut', 'mush-tree-room',
] as const satisfies readonly SecretId[];
export type MySecret = typeof MY_SECRETS[number];
export const isMySecret = (s: unknown): s is MySecret => typeof s === 'string' && (MY_SECRETS as readonly string[]).includes(s);

/**
 * 발견 방식
 *  - near: 반경 안에 들어서면(언제든)
 *  - near-open: 문 열림(gateOf) 일 때 반경 안에 들어서면(보름 밤 요정 춤 · 밤의 달 관측대)
 *  - enter: 실내(동굴·오두막·나무 속 방)에 들어가면
 */
export type FindRule = 'near' | 'near-open' | 'enter';

export interface SecretMeta {
  id: MySecret;
  island: 'home' | 'dino' | 'ice' | 'mushroom';
  name: string;
  icon: string;
  color: string;
  /** 발견 카드 한 줄 */
  line: string;
  find: FindRule;
  /** near 계열 반경(m) */
  r: number;
  /** 한 번만 여는 상자(없으면 그곳만의 보상이 따로 있다) */
  chest?: 'gold' | 'silver';
  /** 실내 이름(enter 계열) */
  room?: string;
}

export const SECRETS: Record<MySecret, SecretMeta> = {
  'home-waterfall-cave': {
    id: 'home-waterfall-cave', island: 'home', name: '폭포 뒤 동굴', icon: '💧', color: '#7fd3ff',
    line: '물 커튼 뒤에 반짝이는 별조각이 숨어 있었어요!', find: 'enter', r: 0, chest: 'gold', room: '💧 폭포 뒤 동굴',
  },
  'home-cliff-beach': {
    id: 'home-cliff-beach', island: 'home', name: '절벽 아래 비밀 해변', icon: '🏖️', color: '#ffd59a',
    line: '아침마다 이 해변에 금상자가 떠밀려 온대요!', find: 'near', r: 16,
  },
  'home-fairy-ring': {
    id: 'home-fairy-ring', island: 'home', name: '요정 버섯 링', icon: '🧚', color: '#ffb8e8',
    line: '보름달 밤, 그루터기 광장에서 요정들이 빙글빙글 춤을 춰요!', find: 'near-open', r: 13,
  },
  'dino-lava-garden': {
    id: 'dino-lava-garden', island: 'dino', name: '분화구 용암석 정원', icon: '🌋', color: '#ff9f7a',
    line: '뜨끈뜨끈 화산 속에 누가 이렇게 예쁜 정원을 꾸몄을까요?', find: 'near', r: 16, chest: 'gold',
  },
  'dino-mural-cave': {
    id: 'dino-mural-cave', island: 'dino', name: '고대 벽화 동굴', icon: '🎨', color: '#f0b46a',
    line: '"로켓 탄 공룡" 그림이…! 옛날 공룡도 우주에 가고 싶었나 봐요', find: 'enter', r: 0, chest: 'silver', room: '🎨 고대 벽화 동굴',
  },
  'dino-bubble-cave': {
    id: 'dino-bubble-cave', island: 'dino', name: '해안 거품동굴', icon: '🫧', color: '#8fe3f0',
    line: '동굴 웅덩이 아래로 뽀글뽀글 거품 길이 이어져요!', find: 'enter', r: 0, chest: 'silver', room: '🫧 해안 거품동굴',
  },
  'ice-mammoth': {
    id: 'ice-mammoth', island: 'ice', name: '빙하 속 아기 매머드', icon: '🦣', color: '#bfe6ff',
    line: '얼음 속에 아기 매머드가 꽁꽁! 따뜻하게 녹여 줄까요?', find: 'near', r: 12,
  },
  'ice-aurora-cave': {
    id: 'ice-aurora-cave', island: 'ice', name: '오로라 얼음 동굴', icon: '🌌', color: '#9ff0d6',
    line: '오로라가 뜬 밤에만 열리는 반짝반짝 얼음 동굴!', find: 'enter', r: 0, chest: 'silver', room: '🌌 오로라 얼음 동굴',
  },
  'ice-avalanche': {
    id: 'ice-avalanche', island: 'ice', name: '눈사태 상자 무덤', icon: '🏔️', color: '#e6f4ff',
    line: '눈 더미 속에 상자들이 파묻혀 있어요. 삽으로 콕콕 파 봐요!', find: 'near', r: 15,
  },
  'mush-moon-deck': {
    id: 'mush-moon-deck', island: 'mushroom', name: '버섯 탑 달 관측대', icon: '🌙', color: '#d9c8ff',
    line: '밤하늘 달님이 손에 닿을 것 같아요!', find: 'near-open', r: 10, chest: 'gold',
  },
  'mush-swamp-hut': {
    id: 'mush-swamp-hut', island: 'mushroom', name: '늪 위 둥둥 오두막', icon: '🛖', color: '#a8e6a0',
    line: '늪 한가운데 둥둥 떠 있는 작은 오두막! 누가 살까요?', find: 'enter', r: 0, chest: 'silver', room: '🛖 늪 위 둥둥 오두막',
  },
  'mush-tree-room': {
    id: 'mush-tree-room', island: 'mushroom', name: '거인 나무 속 방', icon: '🌳', color: '#c8e89a',
    line: '쿨쿨 잠든 거인 나무 속에 아늑한 방이 있었어요!', find: 'enter', r: 0, chest: 'silver', room: '🌳 거인 나무 속 방',
  },
};

// ───────────── 시간·날씨 문 열림 표 ─────────────
/** 문 열림을 판단할 때 보는 값(env 를 그대로 넘겨도 된다) */
export interface GateEnv {
  /** 0..24 */
  hour: number;
  fullMoon: boolean;
  /** 섬 날씨 */
  weatherOf(region: string): Weather | string;
}

export interface Gate {
  /** 무엇이 열리나(설명) */
  what: string;
  /** 닫혔을 때 안내 */
  hint: string;
  test(e: GateEnv): boolean;
}
const isNight = (h: number) => todOf(h) === 'night';

/** 시간·날씨로 열리는 것들. 표에 없는 곳은 늘 열려 있다 */
export const GATES: Partial<Record<MySecret, Gate>> = {
  'home-cliff-beach': {
    what: '아침 금상자', hint: '금상자는 아침(05~09시)에만 떠밀려 와요 🌅',
    test: (e) => todOf(e.hour) === 'morning',
  },
  'home-fairy-ring': {
    what: '요정 춤', hint: '보름달이 뜬 밤(21~05시)에 와 봐요 🌕',
    test: (e) => e.fullMoon && isNight(e.hour),
  },
  'ice-aurora-cave': {
    what: '얼음 동굴 문', hint: '얼음 문이 꽁꽁… 오로라가 뜬 밤에 열린대요 🌌',
    test: (e) => e.weatherOf('ice') === 'aurora',
  },
  'mush-moon-deck': {
    what: '달 관측', hint: '달 관측은 밤(21~05시)에만 할 수 있어요 🌙',
    test: (e) => isNight(e.hour),
  },
};

/** 지금 열렸나(표에 없는 곳은 true) */
export function gateOpen(id: MySecret, e: GateEnv): boolean {
  const g = GATES[id];
  return g ? g.test(e) : true;
}

/** 발견 조건이 채워졌나 — near 계열은 거리, enter 는 들어갔는지 */
export function shouldFind(id: MySecret, o: { dist?: number; entered?: boolean; env: GateEnv }): boolean {
  const m = SECRETS[id];
  if (m.find === 'enter') return !!o.entered;
  if ((o.dist ?? Infinity) > m.r) return false;
  return m.find === 'near' || gateOpen(id, o.env);
}

// ───────────── 주기 열쇠 ─────────────
/** 달 주기 번호(같은 보름은 같은 번호 — 요정 보상은 주기마다 한 번) */
export const moonCycle = (gameSec: number) => Math.floor(Math.max(0, gameSec) / (DAY_SEC * MOON_DAYS));

/** 오늘 쓴 적이 있나(daily[key] === day) */
export const usedToday = (daily: Record<string, number>, key: string, day: number) => daily[key] === day;

// ───────────── 아기 매머드 녹이기 ─────────────
/** 따뜻한 것(하나씩 얼음 앞 받침에 놓는다) — 3개면 녹기 시작 */
export const HOT_ITEMS = ['m_volcanic', 'it_grilled_fish', 'bait_lava', 'it_fruit_pie'] as const;
export const HOT_NAMES: Record<string, string> = { m_volcanic: '화산유리', it_grilled_fish: '생선구이', bait_lava: '화산 미끼', it_fruit_pie: '과일 파이' };
export const THAW_NEED = 3;
/** 녹는 데 걸리는 시간(실제 초) */
export const THAW_SEC = 6;
/** 모닥불 재료 */
export const CAMPFIRE_COST = { m_wood: 5 } as const;

export type MammothPhase = 'frozen' | 'thawing' | 'free';
export interface MammothState {
  phase: MammothPhase;
  /** 놓은 따뜻한 것 수 */
  heat: number;
  /** 모닥불을 피웠나 */
  fire: boolean;
  /** 녹기 시작한 뒤 흐른 초 */
  t: number;
}
export type MammothEvent = { type: 'heat' } | { type: 'fire' } | { type: 'tick'; dt: number };
/** 상태 기계가 알려 주는 일(연출·지급은 모듈이) */
export type MammothFx = 'heat' | 'fire' | 'thaw-start' | 'free' | 'ignored';

export const freshMammoth = (): MammothState => ({ phase: 'frozen', heat: 0, fire: false, t: 0 });

/** 한 걸음. 새 상태와 일어난 일 */
export function mammothStep(s0: MammothState, ev: MammothEvent): { s: MammothState; fx: MammothFx[] } {
  const s = { ...s0 };
  const fx: MammothFx[] = [];
  switch (ev.type) {
    case 'heat':
      if (s.phase !== 'frozen') return { s, fx: ['ignored'] };
      s.heat = Math.min(THAW_NEED, s.heat + 1);
      fx.push('heat');
      if (s.heat >= THAW_NEED) { s.phase = 'thawing'; s.t = 0; fx.push('thaw-start'); }
      break;
    case 'fire':
      if (s.phase !== 'frozen' || s.fire) return { s, fx: ['ignored'] };
      s.fire = true;
      s.phase = 'thawing';
      s.t = 0;
      fx.push('fire', 'thaw-start');
      break;
    case 'tick':
      if (s.phase !== 'thawing' || !(ev.dt > 0)) return { s, fx };
      s.t = Math.min(THAW_SEC, s.t + ev.dt);
      if (s.t >= THAW_SEC) { s.phase = 'free'; fx.push('free'); }
      break;
  }
  return { s, fx };
}
/** 녹은 정도 0..1(얼음 크기·물방울 연출) */
export const thawProgress = (s: MammothState) => (s.phase === 'free' ? 1 : s.phase === 'thawing' ? s.t / THAW_SEC : (s.heat / THAW_NEED) * 0.15);

/** 불러온 값을 믿을 수 있게 고친다 */
export function sanitizeMammoth(v: unknown): MammothState {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<MammothState>;
  const phase: MammothPhase = o.phase === 'thawing' || o.phase === 'free' ? o.phase : 'frozen';
  return {
    phase,
    heat: Math.max(0, Math.min(THAW_NEED, Math.floor(Number(o.heat) || 0))),
    fire: !!o.fire,
    t: Math.max(0, Math.min(THAW_SEC, Number(o.t) || 0)),
  };
}

// ───────────── 눈사태 상자 무덤 ─────────────
export const AVALANCHE_MOUNDS = 4;
export type AvalancheTier = 'wood' | 'silver' | 'gold';
/** 그날 그 눈 더미의 상자 등급(나무 60 · 은 32 · 금 8) */
export function avalancheTier(r: () => number): AvalancheTier {
  const u = r();
  return u < 0.08 ? 'gold' : u < 0.4 ? 'silver' : 'wood';
}

// ───────────── 하루 줍기 표 ─────────────
/** 그곳에서 하루 한 번 얻는 것 */
export interface DailyGift { key: string; items: Array<{ id: string; n: number; chance?: number }>; label: string; line: string }
export const DAILY: Record<string, DailyGift> = {
  lava: { key: 'lava', label: '따끈한 용암석 줍기 🔥', line: '따끈따끈! 화산유리를 주웠어요', items: [{ id: 'm_volcanic', n: 2 }] },
  mural: { key: 'mural', label: '벽화 아래 반짝이 줍기 🟠', line: '벽화 아래에서 호박 조각이!', items: [{ id: 'm_amber', n: 1 }] },
  bubble: { key: 'bubble', label: '거품 웅덩이 뒤지기 🐚', line: '거품 속에서 조개랑 산호를 건졌어요', items: [{ id: 'm_shell', n: 3 }, { id: 'm_coral', n: 2 }, { id: 'm_pearl', n: 1, chance: 0.2 }] },
  aurora: { key: 'aurora', label: '오로라 얼음 결정 따기 ❄️', line: '오로라 빛을 머금은 얼음 결정!', items: [{ id: 'm_icecrystal', n: 3 }] },
  cauldron: { key: 'cauldron', label: '보글보글 솥 들여다보기 🧪', line: '솥 바닥에 발광 버섯이 동동!', items: [{ id: 'm_glowcap', n: 2 }, { id: 'm_spore', n: 2 }] },
  tree: { key: 'tree', label: '나무 방 선반 뒤지기 🌰', line: '거인 나무가 단단한 나무를 나눠 줬어요', items: [{ id: 'm_hardwood', n: 2 }] },
  moon: { key: 'moon', label: '달 관측하기 🔭', line: '망원경 속 달님이 반짝! 별가루가 톡 떨어졌어요', items: [{ id: 'm_stardust', n: 1 }] },
};
/** 그날 실제로 받을 것(chance 는 rng 로) */
export function rollDaily(g: DailyGift, r: () => number): Array<{ id: string; n: number }> {
  const out: Array<{ id: string; n: number }> = [];
  for (const it of g.items) if (it.chance === undefined || r() < it.chance) out.push({ id: it.id, n: it.n });
  return out;
}

/** 요정 춤 보상(보름마다 한 번) */
export const FAIRY_GIFT = { items: [{ id: 'm_glowcap', n: 3 }, { id: 'm_stardust', n: 2 }, { id: 'it_capsule', n: 1 }], stars: 5 } as const;

// ───────────── 저장 ─────────────
export interface SecretsFlags {
  v: 1;
  /** 발견한 곳 → 발견한 날 */
  found: Record<string, number>;
  /** 한 번만 여는 상자를 열었나 */
  chest: Record<string, boolean>;
  /** 하루 한 번 것 → 마지막으로 쓴 날 */
  daily: Record<string, number>;
  /** 요정 보상 받은 달 주기(-1 = 아직) */
  fairy: number;
  mammoth: MammothState;
  /** 눈사태: 그날 판 눈 더미 */
  aval: { day: number; dug: number[] };
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const numRec = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(rec(v))) if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
  return out;
};

/** flags.secrets 를 고쳐 돌려준다(같은 객체를 고친다 — 다른 곳이 들고 있어도 맞게) */
export function ensureFlags(v: unknown): SecretsFlags {
  const o = rec(v) as Partial<SecretsFlags> & Record<string, unknown>;
  o.v = 1;
  o.found = numRec(o.found);
  const ch: Record<string, boolean> = {};
  for (const [k, x] of Object.entries(rec(o.chest))) if (x) ch[k] = true;
  o.chest = ch;
  o.daily = numRec(o.daily);
  o.fairy = typeof o.fairy === 'number' && Number.isFinite(o.fairy) ? o.fairy : -1;
  o.mammoth = sanitizeMammoth(o.mammoth);
  const a = rec(o.aval);
  o.aval = {
    day: typeof a.day === 'number' ? a.day : -1,
    dug: Array.isArray(a.dug) ? (a.dug as unknown[]).filter((x): x is number => typeof x === 'number' && x >= 0 && x < AVALANCHE_MOUNDS) : [],
  };
  return o as SecretsFlags;
}

export const ISLAND_KO: Record<SecretMeta['island'], string> = { home: '말랑섬', dino: '쿵쿵공룡섬', ice: '솜눈섬', mushroom: '반딧불버섯섬' };
/** 그 섬에서 찾은 수(이 모듈 몫 3곳 기준) */
export const islandFound = (found: Record<string, number>, island: SecretMeta['island']) =>
  MY_SECRETS.filter((s) => SECRETS[s].island === island && found[s] !== undefined).length;

/** 발견 카드(그 섬 숨은 곳 n/3) */
export function foundCard(id: MySecret, found: Record<string, number>): { title: string; body: string; icon: string; color: string } {
  const m = SECRETS[id];
  const n = islandFound(found, m.island);
  return { title: `숨은 곳 발견! ${m.name}`, body: `${m.line} · ${ISLAND_KO[m.island]} 숨은 곳 ${n}/3`, icon: m.icon, color: m.color };
}
