// hudfx 순수 규칙 — 화면(DOM)·WebGL 없이 테스트하는 것만.
// 잡았다 5단계 연출 계획(GDD 5.1) · 변이 도장 · 두근 게이지/스태미나/산소 보이기(5.3) · 날씨 배너 글 · 섬 발견 카드 ·
// 해금 세리머니 · 오늘의 인기 생물 토스트 · 콤보 팝 · 상자 쏟아짐 차례 · 본 변이 기록 · 차례 큐.
import type { GaugeOpts, Variant, Weather } from '../../core/api';

// ───────────── 1. 잡았다 5단계 ─────────────
export type Tier = 1 | 2 | 3 | 4 | 5;
/** 희귀도 → 연출 단계(1..5 로 자른다, 숫자가 아니면 1) */
export const tierOf = (rarity: unknown): Tier => {
  const r = Math.round(Number(rarity));
  return (Number.isFinite(r) ? Math.min(5, Math.max(1, r)) : 1) as Tier;
};

/** 단계별 대표 색(흰·초록·파랑·보라·금 — GDD 5.1 반짝임 색) */
export const TIER_COLOR: Record<Tier, string> = { 1: '#fff6d8', 2: '#8fe0a0', 3: '#7cc8ff', 4: '#c59bff', 5: '#ffd23f' };

export type Ring = 'none' | 'blue' | 'rainbow' | 'gold';
export type StampKind = 'new' | 'shiny' | 'legend' | 'crown';
export interface StampPlan { kind: StampKind; text: string; color: string; /** 쾅 시작(ms) */ delay: number }
export interface CatchPlan {
  tier: Tier;
  /** '퐁!' 작은 팝 + 별 3개(★1) */
  pong: boolean;
  /** 초록 반짝 + 음표(★2) */
  sparkle: boolean;
  /** 슬로모(engine.timeScale)·길이 */
  slowmo: { scale: number; ms: number } | null;
  /** 정지 프레임(ms, ★5) */
  freezeMs: number;
  /** 카메라 거리 배율(1 = 그대로) */
  zoom: number;
  ring: Ring;
  /** 화면 가장자리 보라 비네트(★4) */
  vignette: boolean;
  /** 1초 회전 쇼케이스(★4 이상) */
  showcaseMs: number;
  /** 하늘 금빛(★5) */
  skyTint: boolean;
  /** 빛기둥(★5) */
  pillar: boolean;
  /** 코인 분수 개수(0 = 없음) */
  coins: number;
  /** 색종이 개수 */
  confetti: number;
  /** 근처 주민 박수(★4) */
  clap: boolean;
  /** 플레이어 cheer(★5) */
  cheer: boolean;
  /** 무지개 테두리(반짝이) */
  rainbowBorder: boolean;
  stamps: StampPlan[];
  /** 연출이 남아 있는 시간(ms) */
  ms: number;
}

export interface CatchIn {
  rarity: number;
  variant?: Variant | null;
  isNew: boolean;
  /** false = 목격(도감만) */
  keep?: boolean;
  /** 왕관 기록 줄용: 지금 크기·이전 최고(cm) */
  size?: number;
  prevBest?: number;
  /** 이 종에서 처음 본 변이인가 */
  variantNew?: boolean;
}

/** 잡았다 연출 계획(GDD 5.1 표). 높은 단계는 낮은 단계 연출 일부(색종이·줌)를 이어받아 점점 커진다 */
export function catchPlan(c: CatchIn): CatchPlan {
  const tier = tierOf(c.rarity);
  const witness = c.keep === false;
  const p: CatchPlan = {
    tier, pong: tier === 1, sparkle: tier === 2, slowmo: null, freezeMs: 0, zoom: 1, ring: 'none', vignette: false,
    showcaseMs: 0, skyTint: false, pillar: false, coins: 0, confetti: 0, clap: false, cheer: false,
    rainbowBorder: c.variant === 'shiny', stamps: [], ms: 2400,
  };
  if (tier >= 3) { p.zoom = 0.86; p.confetti = 26; p.ring = 'blue'; p.ms = 2800; }
  if (tier === 3) p.slowmo = { scale: 0.35, ms: 500 };
  if (tier >= 4) { p.vignette = tier === 4; p.showcaseMs = 1000; p.ring = 'rainbow'; p.confetti = 40; p.clap = true; p.ms = 3200; }
  if (tier === 5) {
    p.ring = 'gold'; p.skyTint = true; p.freezeMs = 1000; p.pillar = true; p.cheer = true; p.confetti = 56; p.ms = 4200;
    // 목격은 돈이 안 되니 코인 분수는 작게
    p.coins = witness ? 8 : 26;
  }
  // 도장: 처음(NEW) → 전설 → 반짝이 → 왕관 순서로 쾅쾅
  let d = tier === 5 ? 1150 : tier >= 3 ? 450 : 250;
  const add = (kind: StampKind, text: string, color: string) => { p.stamps.push({ kind, text, color, delay: d }); d += 320; };
  if (c.isNew) add('new', 'NEW!', '#ff6f8e');
  if (tier === 5) add('legend', '전설!', '#f0a020');
  if (c.variant === 'shiny') add('shiny', c.variantNew ? '반짝이! NEW' : '반짝이!', '#b46cff');
  if (c.variant === 'crown') add('crown', '왕관!', '#e0a010');
  if (p.stamps.length) p.ms = Math.max(p.ms, d + 1600);
  return p;
}

/** cm 글(소수 한 자리, 정수면 떼기) */
export const cmText = (n: number) => `${Math.round(n * 10) / 10}cm`;
/** 왕관 기록 줄: "최대 크기 경신! 62cm → 71cm" (이전 기록이 없으면 "최대 크기 기록! 71cm") */
export function crownLine(size: number | undefined, prevBest: number | undefined): string | null {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return null;
  if (typeof prevBest === 'number' && Number.isFinite(prevBest) && prevBest > 0) {
    return size > prevBest ? `최대 크기 경신! ${cmText(prevBest)} → ${cmText(size)}` : `왕관 크기! ${cmText(size)} (최고 ${cmText(prevBest)})`;
  }
  return `최대 크기 기록! ${cmText(size)}`;
}

// ───────────── 본 변이 기록(flags.hud.variants) ─────────────
export type VariantSeen = Record<string, Variant[]>;
/** 본 변이를 적는다. 처음이면 true */
export function recordVariant(seen: VariantSeen, id: string, v: Variant | null | undefined): boolean {
  if (!v || !id) return false;
  const list = (seen[id] ??= []);
  if (list.includes(v)) return false;
  list.push(v);
  return true;
}

// ───────────── 2. 두근 게이지 · 스태미나 · 산소 (5.3) ─────────────
export interface GaugeIn {
  /** 지금 시각(초, 실제) */
  now: number;
  world: 'earth' | 'space' | string;
  /** player.action */
  action: string | null;
  /** player.mode */
  mode: string;
  /** 지금 E 로 고른 상호작용(id·글) */
  current?: { id?: string; label?: string } | null;
  pity: { fish: number; bug: number; dive: number; chest: number | null };
  ocean?: { stamina: number; staminaMax: number; oxygen: number; oxygenMax: number; swimming: boolean } | null;
  moon?: { value: number; max: number } | null;
}
/** 상황이 끝난 뒤에도 잠깐(초) 남겨 둔다 — 잡자마자 게이지가 사라지지 않게 */
export const GAUGE_LINGER = 2.5;
/** 낚시 중(던지기·당기기 포함) */
/** 낚시 중? — fishing.ts 만 'fish' 동작을 쓴다(보물 새총의 'cast' 는 낚시가 아니다) */
/** 달 산소: hud 시계 위젯에 늘 산소 막대가 있으니 모자랄 때(40% 아래)만 크게 띄운다 */
export const MOON_O2_SHOW = 0.4;
export const isFishing = (action: string | null | undefined) => !!action && /^(fish|reel|bite)/.test(action);
/** 잠자리채 휘두르는 중 */
export const isNetting = (action: string | null | undefined) => !!action && /^net/.test(action);
/** 상자 앞(E 가 상자) */
export const nearChest = (cur: { id?: string; label?: string } | null | undefined) =>
  !!cur && (/chest/i.test(cur.id ?? '') || /상자/.test(cur.label ?? '')) && !/mimic|미믹/i.test(`${cur.id ?? ''}${cur.label ?? ''}`);

export const GAUGE_IDS = {
  fish: 'pity:fish', bug: 'pity:bug', dive: 'pity:dive', chest: 'pity:chest',
  stamina: 'fx:stamina', oxygen: 'fx:oxygen', moon: 'fx:moon-o2',
} as const;
const PINK = '#ff9fb8';
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * 게이지 보이기 규칙. 마지막으로 상황이 맞았던 시각(last)을 들고 다니며 GAUGE_LINGER 동안 남긴다.
 * - 낚시: 'fish' 동작 중 · 곤충: 'net' 동작 중 · 상자: 상자 앞(chestPity 가 있을 때만) · 잠수 두근: 잠수 중
 * - 스태미나: 수영 중이고 덜 찼을 때 · 바다 산소: 잠수 중 · 달 산소: 우주에서 늘
 * 80% 를 넘는 두근 게이지는 렌더러가 분홍으로 반짝인다(hot).
 */
export function gaugePlan(g: GaugeIn, last: Record<string, number>): Record<string, GaugeOpts> {
  const live = (key: string, on: boolean) => {
    if (on) last[key] = g.now;
    const t = last[key];
    return on || (t !== undefined && g.now - t <= GAUGE_LINGER);
  };
  const earth = g.world === 'earth';
  const swim = g.mode === 'swim' || (!!g.ocean?.swimming && g.mode !== 'dive');
  const dive = g.mode === 'dive';
  const out: Record<string, GaugeOpts> = {};
  out[GAUGE_IDS.fish] = { label: '🎣 두근 낚시', value: clamp01(g.pity.fish), color: PINK, show: live('fish', earth && isFishing(g.action)) };
  out[GAUGE_IDS.bug] = { label: '🦋 두근 곤충', value: clamp01(g.pity.bug), color: PINK, show: live('bug', isNetting(g.action)) };
  out[GAUGE_IDS.dive] = { label: '🤿 두근 잠수', value: clamp01(g.pity.dive), color: PINK, show: live('dive', earth && dive) };
  if (g.pity.chest !== null) out[GAUGE_IDS.chest] = { label: '🎁 두근 상자', value: clamp01(g.pity.chest), color: '#ffcf4a', show: live('chest', nearChest(g.current)) };
  const o = g.ocean;
  if (o && o.staminaMax > 0) {
    const v = clamp01(o.stamina / o.staminaMax);
    out[GAUGE_IDS.stamina] = { label: v < 0.25 ? '💦 헥헥… 쉬어 가요' : '🏊 수영 힘', value: v, color: v < 0.25 ? '#ff8f8f' : '#8fdcff', show: live('stamina', earth && swim && v < 0.999) };
  }
  if (o && o.oxygenMax > 0) {
    const v = clamp01(o.oxygen / o.oxygenMax);
    out[GAUGE_IDS.oxygen] = { label: v < 0.25 ? '🫧 숨 차요! 올라가요' : '🫧 산소', value: v, color: v < 0.25 ? '#ff8f8f' : '#7ef0ff', show: live('oxygen', earth && dive) };
  }
  const m = g.moon;
  if (m && m.max > 0) {
    const v = clamp01(m.value / m.max);
    out[GAUGE_IDS.moon] = { label: v < 0.25 ? '🧑‍🚀 산소 모자라요!' : '🧑‍🚀 헬멧 산소', value: v, color: v < 0.25 ? '#ff8f8f' : '#b7ffcf', show: g.world === 'space' && v < MOON_O2_SHOW };
  }
  return out;
}
/** 게이지 같은지(보낼지 말지) */
export const gaugeSig = (g: GaugeOpts | null | undefined) => (g ? `${g.label}|${clamp01(g.value).toFixed(3)}|${g.show}|${g.color}` : '');
/** 두근 게이지가 막 80% 를 넘었나(곧 뭔가 온다 안내) */
export const crossedHot = (prev: number, now: number) => prev < 0.8 && now >= 0.8;

// ───────────── 콤보 ─────────────
/** 콤보가 5 이상에서 늘었으면 팝 글('콤보 7!'), 10·20·30… 은 큰 팝 */
export function comboPop(prev: number, now: number): { text: string; big: boolean } | null {
  if (!Number.isFinite(now) || now < 5 || now <= prev) return null;
  const n = Math.floor(now);
  return { text: `콤보 ${n}!`, big: n % 10 === 0 };
}

// ───────────── 3. 날씨 배너 ─────────────
export interface WeatherBanner { text: string; sub: string; icon: string; color: string; ms: number }
const WEATHER_BANNER: Partial<Record<Weather, WeatherBanner>> = {
  rain: { text: '비가 톡톡 내려요', sub: '비 오는 날엔 물고기가 바글바글!', icon: '🌧️', color: '#7cb7e8', ms: 2800 },
  storm: { text: '폭풍이 와요!', sub: '파도가 출렁출렁 — 배는 꽉 잡아요', icon: '⛈️', color: '#9a8fd6', ms: 3000 },
  fog: { text: '안개 속에 뭔가가…', sub: '흐릿한 그림자를 찾아봐요', icon: '🌫️', color: '#a9b4c2', ms: 3000 },
  meteor: { text: '유성우가 내려요!', sub: '떨어진 별똥별을 주우면 별가루!', icon: '🌠', color: '#8f86ff', ms: 3200 },
  snow: { text: '눈이 펑펑 내려요', sub: '눈송이처럼 하얀 친구들이 나와요', icon: '❄️', color: '#8fd3ff', ms: 2800 },
  blizzard: { text: '눈보라가 몰아쳐요!', sub: '따뜻한 곳으로 피해요', icon: '🌨️', color: '#8fb6e0', ms: 3000 },
  rainbow: { text: '무지개가 떴어요!', sub: '무지개 끝에 반짝이는 상자가 있대요', icon: '🌈', color: '#ff9fb8', ms: 3200 },
  aurora: { text: '오로라가 떴어요!', sub: '하늘이 춤춰요 — 오로라 손님이 와요', icon: '🌌', color: '#7fe0c0', ms: 3200 },
  sandstorm: { text: '모래폭풍!', sub: '모래 속에서 뭔가 꿈틀꿈틀', icon: '🌪️', color: '#e8b46b', ms: 3000 },
};
/** 거친 날씨 — 이게 걷히면 '맑아졌어요' */
const ROUGH: ReadonlySet<string> = new Set(['storm', 'blizzard', 'sandstorm', 'fog', 'rain']);
/** 날씨 → 배너(맑음은 거친 날씨가 걷혔을 때만, 같은 날씨면 없음) */
export function weatherBanner(w: Weather | string | null | undefined, prev?: Weather | string | null): WeatherBanner | null {
  if (!w || w === prev) return null;
  if (w === 'clear') return prev && ROUGH.has(prev) ? { text: '날씨가 맑아졌어요!', sub: '햇살이 반짝반짝', icon: '☀️', color: '#ffbe3b', ms: 2400 } : null;
  return WEATHER_BANNER[w as Weather] ?? null;
}
/** 같은 날씨 배너는 이 시간(초) 안에 다시 안 띄운다(섬 경계에서 들락날락) */
export const WEATHER_REPEAT_SEC = 90;

// ───────────── 4. 섬 발견 카드 ─────────────
export interface DiscoverCard { kicker: string; name: string; sub: string; color: string; icon: string; stamp: string }
/** discover{place, name, kind} → 가운데 큰 이름 카드 */
export function discoverCard(
  e: { place: string; name?: string; kind?: string },
  look: { islandName?: string | null; island?: string | null; theme?: string | null; color?: string | null; sub?: string | null },
): DiscoverCard {
  const kind = e.kind === 'islet' || e.kind === 'landmark' ? e.kind : 'island';
  const color = look.color || '#7fd18b';
  if (kind === 'landmark') {
    return { kicker: '✦ 새로운 곳 발견! ✦', name: e.name || look.islandName || '어딘가', sub: look.islandName ? `${look.islandName}의 명소` : '지도에 콕 찍어 뒀어요', color, icon: '📍', stamp: '발견' };
  }
  const name = look.islandName || e.name || '이름 모를 섬';
  if (kind === 'islet') return { kicker: '✦ 쪼꼬미섬 발견! ✦', name, sub: look.sub || '어딘가 보물이 있대!', color: look.color || '#ffd23f', icon: '🏝️', stamp: '발견' };
  return { kicker: '✦ 새로운 섬 발견! ✦', name, sub: look.sub || '두근두근 새 섬', color, icon: '🗺️', stamp: '발견' };
}

// ───────────── 해금 세리머니 ─────────────
export interface Ceremony { title: string; name: string; icon: string; color: string; ms: number }
/** 카드로 안 띄우는 이유(처음 받는 기본 도구·디버그·저장 옮기기) */
export const QUIET_WHY: ReadonlySet<string> = new Set(['start', 'starter', 'debug', 'migrate', 'load', 'p0', 'cheat']);
/** 큰 세리머니를 할 해금(레시피·초대처럼 자주 오는 건 hud 의 작은 카드만) */
const CEREMONY_KIND: Array<[RegExp, { title: string; icon: string; color: string }]> = [
  [/^tool:/, { title: '새 도구를 얻었어요!', icon: '🧰', color: '#7cc8ff' }],
  [/^(v|licence):/, { title: '새 탈것이 생겼어요!', icon: '🚲', color: '#ffb36b' }],
  [/^rocket:/, { title: '로켓이 한 걸음 더!', icon: '🚀', color: '#a99bff' }],
  [/^space:/, { title: '우주가 열렸어요!', icon: '🪐', color: '#8f86ff' }],
  [/^bag:/, { title: '가방이 커졌어요!', icon: '🎒', color: '#ffb36b' }],
  [/^wing:/, { title: '박물관이 넓어졌어요!', icon: '🏛️', color: '#c59bff' }],
  [/^house:/, { title: '집이 넓어졌어요!', icon: '🏠', color: '#ff9cb8' }],
  [/^lighthouse:/, { title: '등대에 불이 켜졌어요!', icon: '🗼', color: '#ffd23f' }],
  [/^dev:/, { title: '섬이 자랐어요!', icon: '🏝️', color: '#7fd18b' }],
  [/^facility:/, { title: '새 시설이 생겼어요!', icon: '🏗️', color: '#ffbe3b' }],
];
/** 다른 모듈이 제 카드를 직접 띄우는 해금(공룡 친구·뗏목) — 겹치지 않게 건너뛴다 */
// 섬 개발(islanddev)은 단계마다 제 의식 카드·배너를 띄운다 — 등대·단계·시설 해금은 겹치지 않게
const OWN_CARD: Array<[RegExp, string | undefined]> = [
  [/^dino:/, undefined], [/^v:dino_/, undefined], [/^v:raft$/, undefined],
  [/^(lighthouse|dev|facility):/, 'islanddev'],
];
/** 해금 → 세리머니(아이콘·이름은 lookup 이 상점·레시피 표에서 찾는다) */
export function ceremonyOf(key: string, why: string | undefined, lookup: (key: string) => { name?: string; icon?: string } | undefined): Ceremony | null {
  if (!key || (why && QUIET_WHY.has(why))) return null;
  if (OWN_CARD.some(([re, w]) => re.test(key) && (!w || w === why))) return null;
  const k = CEREMONY_KIND.find(([re]) => re.test(key))?.[1];
  if (!k) return null;
  const hit = lookup(key);
  const name = hit?.name || key.slice(key.indexOf(':') + 1).replace(/[_:]/g, ' ');
  return { title: k.title, name, icon: hit?.icon || k.icon, color: k.color, ms: 2600 };
}

// ───────────── 오늘의 인기 생물 ─────────────
/** 'day' → 토스트 글(GDD 4.4 "오늘은 고등어가 인기래!") */
export function hotToast(names: string[]): string | null {
  const n = names.filter((s) => !!s && s.trim().length > 0);
  if (!n.length) return null;
  if (n.length === 1) return `📈 오늘은 ${n[0]}가 인기래! 팔면 두 배!`;
  return `📈 오늘의 인기 생물! ${n.join(' · ')} — 팔면 두 배!`;
}

// ───────────── 2. 상자 쏟아짐 ─────────────
/** 흔들림 한 번 길이(초) — economy 상자 연출(SHAKE_SEC)과 같다 */
export const SHAKE_SEC = 0.38;
/** 상자 3D 연출을 거치는 출처(흔들고 뚜껑이 열린 뒤에 쏟아진다) */
const PLAYED = new Set(['world', 'daily', 'rainbow']);
/** chest-open → 내용물이 튀어나오기 시작할 때(ms): 흔들림 × 등급 + 뚜껑 0.15초. 다른 출처는 바로 */
export function cascadeDelay(shakes: number, source: string | undefined): number {
  if (source && !PLAYED.has(source)) return 250;
  return Math.round((Math.max(1, shakes) * SHAKE_SEC + 0.15) * 1000);
}
export interface CascadeItem { id: string; n: number; name: string; to: 'wallet' | 'star' | 'bag' | 'key'; delay: number }
/** 내용물 → 하나씩 튀어나오는 차례(코인은 지갑, 별은 별, 열쇠는 열쇠 칸, 나머지는 가방) */
export function cascadePlan(loot: Array<{ id: string; n: number; name?: string }>, start: number, step = 160): CascadeItem[] {
  return (loot ?? []).filter((l) => l && l.n > 0).map((l, i) => ({
    id: l.id, n: l.n, name: l.name ?? l.id,
    to: l.id === 'coins' ? 'wallet' : l.id === 'stars' ? 'star' : l.id.startsWith('key:') ? 'key' : 'bag',
    delay: start + i * step,
  }));
}
/** 코인 분수 개수(많이 받을수록, 6..30) */
export const coinBurst = (coins: number) => (coins > 0 ? Math.max(6, Math.min(30, Math.round(Math.log10(coins + 1) * 7))) : 0);

// ───────────── 차례 큐(가운데 카드) ─────────────
/** 하나씩 보여 주는 큐: update(now, hold) 가 {show}/{hide} 를 돌려준다. hold 면 지금 것을 안 내린다 */
export class Sequencer<T extends { ms: number }> {
  private q: T[] = [];
  cur: T | null = null;
  private until = 0;
  constructor(private max = 6) {}
  push(it: T) { this.q.push(it); while (this.q.length > this.max) this.q.shift(); }
  update(now: number, hold = false): { show?: T; hide?: T } | null {
    if (this.cur && !hold && now >= this.until) {
      const was = this.cur;
      this.cur = null;
      if (!this.q.length) return { hide: was };
    }
    if (!this.cur && this.q.length) {
      this.cur = this.q.shift()!;
      this.until = now + Math.max(400, this.cur.ms);
      return { show: this.cur };
    }
    return null;
  }
  pending(): readonly T[] { return this.q; }
}

// ───────────── 지도 도장 ─────────────
/** 막 찍은 도장의 크기(쾅 회전 + 스케일 펀치): age 초 → 배율 */
export function stampPunch(age: number): number {
  if (!Number.isFinite(age) || age < 0) return 1;
  if (age < 0.18) return 2.4 - (age / 0.18) * 1.55; // 2.4 → 0.85
  if (age < 0.34) return 0.85 + ((age - 0.18) / 0.16) * 0.25; // 0.85 → 1.1
  if (age < 0.5) return 1.1 - ((age - 0.34) / 0.16) * 0.1; // 1.1 → 1
  return 1;
}
