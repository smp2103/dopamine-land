// HUD 순수 규칙 — 화면(DOM) 없이 테스트하는 것만 모은다.
// 패널 기본 탭·탭 고르기, 단축키 규칙(B 도감·Tab 가방·I 옛 가방·Esc 닫기), 게이지·콤보 보이기, 가방 칸 글,
// 시계(env 만 읽는다)·지갑 보기, 행동 안내 칩, 해금 카드, 차례 큐(배너·카드), 값 글(코인·반짝별·재료).
import { dispatchHotkeys, type HotkeyCtx } from '../../core/registry';
import { splitVariant, type BannerOpts, type CardOpts, type Cost, type EnvApi, type GaugeOpts, type HotkeyDef, type PanelTab, type Weather } from '../../core/api';

// ───────────── 패널 탭 ─────────────
/** 패널 탭 + 작은 꼬리표(예: 도감 '3/12') — PanelTab 에 그대로 들어간다 */
export interface HudTab extends PanelTab { badge?: string }

/**
 * 지금 그릴 탭을 고른다: 요청한 탭이 목록에 있으면 그것, 아니면 기본 탭(목록에 있을 때), 아니면 첫 탭.
 * 탭이 없는 패널이면 요청 그대로(없으면 기본값).
 */
export function pickTab(requested: string | null | undefined, tabs: readonly PanelTab[], fallback?: string): string | undefined {
  if (!tabs.length) return requested ?? fallback;
  if (requested != null && tabs.some((t) => t.id === requested)) return requested;
  if (fallback != null && tabs.some((t) => t.id === fallback)) return fallback;
  return tabs[0].id;
}

/** 기본 패널 6개(종류·제목·아이콘·색·기본 탭) — 그리기는 panels/*.ts */
export const BUILTIN_PANELS = {
  dex: { kind: 'dex', title: '도감', icon: '📖', color: '#7cc8ff', defaultTab: 'fish' },
  bag: { kind: 'bag', title: '가방', icon: '🎒', color: '#ffb36b', defaultTab: 'all' },
  shop: { kind: 'shop', title: '꽥꽥상회', icon: '🦆', color: '#ffbe3b', defaultTab: 'sell' },
  craft: { kind: 'craft', title: '작업대', icon: '🔨', color: '#9bd77a', defaultTab: 'all' },
  museum: { kind: 'museum', title: '박물관', icon: '🏛️', color: '#c59bff', defaultTab: 'donate' },
  board: { kind: 'board', title: '마을 게시판', icon: '📌', color: '#ff9cb8', defaultTab: 'today' },
} as const;
export type BuiltinKind = keyof typeof BUILTIN_PANELS;

/** 가방 탭 */
export const BAG_TABS: HudTab[] = [
  { id: 'all', label: '전부' }, { id: 'catch', label: '생물', icon: '🐟' }, { id: 'mat', label: '재료', icon: '🪵' }, { id: 'goods', label: '물건', icon: '🎁' },
];

/** 가방 칸 종류(탭 거르기용) */
export type BagKind = 'catch' | 'mat' | 'goods';
export function bagTabMatch(tab: string | undefined, kind: BagKind): boolean {
  return !tab || tab === 'all' || tab === kind;
}

// ───────────── 상점 ─────────────
export interface ShopInfo { name: string; icon: string; color: string; sell: boolean; where: 'home' | 'island' | 'space'; npc: string }
/** 가게마다 이름·색·팔기 가능 여부(계약 6장 ShopItem.shop) */
export const SHOP_INFO: Record<string, ShopInfo> = {
  quack: { name: '꽥꽥상회', icon: '🦆', color: '#ffbe3b', sell: true, where: 'home', npc: '꽥꽥이' },
  shipyard: { name: '통통 조선소', icon: '⚓', color: '#7cc8ff', sell: false, where: 'home', npc: '선장 해달' },
  peng: { name: '펭박사 연구소', icon: '🐧', color: '#a99bff', sell: false, where: 'island', npc: '펭박사' },
  beach: { name: '찰랑 해변 가게', icon: '🏖️', color: '#ff9f8a', sell: true, where: 'island', npc: '소라게' },
  bazaar: { name: '모래 바자르', icon: '🏜️', color: '#ffc46b', sell: true, where: 'island', npc: '사막여우' },
  diving: { name: '뽀글 다이빙 숍', icon: '🤿', color: '#6cc3ef', sell: true, where: 'island', npc: '바다코끼리' },
  potion: { name: '몽글 물약 가게', icon: '🧪', color: '#ff9ccf', sell: true, where: 'island', npc: '마녀 고양이' },
  moon: { name: '떡순이네 떡집', icon: '🐰', color: '#d9c8ff', sell: true, where: 'space', npc: '떡순이' },
  junk: { name: '너구리 고물상', icon: '🦝', color: '#c9a37a', sell: true, where: 'home', npc: '너구리' },
  station: { name: '꾸물이 정거장', icon: '🛰️', color: '#8f86ff', sell: true, where: 'space', npc: '꾸물이' },
  sheep: { name: '보들 양 옷가게', icon: '🐑', color: '#ffd9e6', sell: false, where: 'home', npc: '양 아줌마' },
  capsule: { name: '두근두근 캡슐머신', icon: '🎰', color: '#ff7a9a', sell: false, where: 'home', npc: '캡슐머신' },
};
export const shopInfo = (shop: string | null | undefined): ShopInfo =>
  SHOP_INFO[shop ?? 'quack'] ?? { name: '가게', icon: '🛍️', color: '#ffbe3b', sell: true, where: 'island', npc: '점원' };

/** 상점 패널 인자(open-shop{shop} / hud.open('shop', tab, {shop})) → 가게 id */
export function shopOfArg(arg: unknown): string {
  if (typeof arg === 'string' && arg) return arg;
  const s = (arg as { shop?: unknown } | null | undefined)?.shop;
  return typeof s === 'string' && s ? s : 'quack';
}
/** 가게 탭 — 팔 수 없는 가게는 사기만 */
export function shopTabs(shop: string): HudTab[] {
  const buy: HudTab = { id: 'buy', label: '사기', icon: '🛒' };
  return shopInfo(shop).sell ? [{ id: 'sell', label: '팔기', icon: '💰' }, buy] : [buy];
}

/** 값 한 조각 */
export interface CostPart { kind: 'coins' | 'stars' | 'item'; id?: string; n: number; text: string }
/** 비용 → 보여 줄 조각들(코인·반짝별·재료). 비어 있으면 '공짜' 한 조각 */
export function costParts(c: Cost | null | undefined, nameOf: (id: string) => string = (id) => id, fmt: (n: number) => string = (n) => Math.round(n).toLocaleString('ko-KR')): CostPart[] {
  const out: CostPart[] = [];
  if (c?.coins) out.push({ kind: 'coins', n: c.coins, text: `🪙 ${fmt(c.coins)}` });
  if (c?.stars) out.push({ kind: 'stars', n: c.stars, text: `⭐ ${fmt(c.stars)}` });
  for (const [id, n] of Object.entries(c?.items ?? {})) if (n > 0) out.push({ kind: 'item', id, n, text: `${nameOf(id)} ×${fmt(n)}` });
  if (!out.length) out.push({ kind: 'coins', n: 0, text: '공짜!' });
  return out;
}
export const costText = (c: Cost | null | undefined, nameOf?: (id: string) => string, fmt?: (n: number) => string) =>
  costParts(c, nameOf, fmt).map((p) => p.text).join(' · ');

// ───────────── 가방 ─────────────
export interface BagView { used: number; size: number; free: number; full: boolean; text: string; ratio: number }
/** econ.bag 이 없을 때 가방 칸 세기: 0 넘는 칸 중 도구(tool_*)는 벨트라 뺀다 */
export function countBagSlots(bag: Record<string, number>): number {
  let n = 0;
  for (const [k, v] of Object.entries(bag)) if (v > 0 && !k.startsWith('tool_')) n++;
  return n;
}
/** 가방 칸 글 `${used}/${size}칸` + 꽉 참 */
export function bagView(econBag: { used: number; size: number } | null | undefined, fallbackBag: Record<string, number>, baseSize: number): BagView {
  const size = Math.max(0, Math.round(econBag?.size ?? baseSize));
  const used = Math.max(0, Math.round(econBag?.used ?? countBagSlots(fallbackBag)));
  const free = Math.max(0, size - used);
  return { used, size, free, full: size > 0 && used >= size, text: `${used}/${size}칸`, ratio: size > 0 ? Math.min(1, used / size) : 1 };
}

// ───────────── 게이지·콤보 ─────────────
/** 게이지 줄을 보이나: show 이고 값이 숫자일 때 */
export const gaugeVisible = (g: GaugeOpts | null | undefined): boolean => !!g && g.show === true && Number.isFinite(g.value);
/** 게이지 값 0..1 로 자르기 */
export const gaugeValue = (g: GaugeOpts) => Math.min(1, Math.max(0, Number.isFinite(g.value) ? g.value : 0));
/** 두근 게이지가 80% 를 넘으면 분홍 반짝(GDD 5.3) */
export const gaugeHot = (g: GaugeOpts) => gaugeValue(g) >= 0.8;
/** 콤보 카운터는 5 이상일 때만(GDD 3.11·5.3) */
export const comboVisible = (n: number | null | undefined) => typeof n === 'number' && n >= 5;
export const comboText = (n: number) => `콤보 ${Math.floor(n)}!`;

// ───────────── 시계(game.env 만 읽는다) ─────────────
export const WEEKDAY_KO = ['월', '화', '수', '목', '금', '토', '일'] as const;
export const WEATHER_LOOK: Record<Weather, { icon: string; name: string }> = {
  clear: { icon: '☀️', name: '맑음' }, rain: { icon: '🌧️', name: '비' }, storm: { icon: '⛈️', name: '폭풍' }, fog: { icon: '🌫️', name: '안개' },
  meteor: { icon: '🌠', name: '유성우' }, snow: { icon: '❄️', name: '눈' }, blizzard: { icon: '🌨️', name: '눈보라' }, rainbow: { icon: '🌈', name: '무지개' },
  aurora: { icon: '🌌', name: '오로라' }, sandstorm: { icon: '🌪️', name: '모래바람' },
};
export type SkyClass = 'day' | 'dawn' | 'dusk' | 'night' | 'none';
export interface ClockView { time: string; day: string; weekday: string; weatherIcon: string; weatherName: string; sky: SkyClass; ready: boolean }
/** 하늘 아이콘: 새벽 05~07 · 낮 · 노을 17~19:30 · 밤 */
export const skyOf = (h: number): SkyClass => (h < 5 || h >= 19.5 ? 'night' : h >= 17 ? 'dusk' : h < 7 ? 'dawn' : 'day');
/** 시계 칩 글 — env 가 없으면 전부 '—'(다른 데서 시각을 지어내지 않는다) */
export function clockView(env: Pick<EnvApi, 'day' | 'hour' | 'weekday' | 'weather'> | null | undefined): ClockView {
  if (!env || !Number.isFinite(env.hour)) return { time: '—', day: '—', weekday: '', weatherIcon: '', weatherName: '', sky: 'none', ready: false };
  const h = ((env.hour % 24) + 24) % 24;
  let hh = Math.floor(h), mm = Math.floor((h - hh) * 60 + 1e-6);
  if (mm >= 60) { mm = 0; hh = (hh + 1) % 24; }
  const w = WEATHER_LOOK[env.weather] ?? { icon: '☁️', name: String(env.weather ?? '') };
  const wd = Number.isFinite(env.weekday) ? WEEKDAY_KO[((Math.floor(env.weekday) % 7) + 7) % 7] : '';
  return {
    time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    day: `${Math.max(0, Math.floor(env.day ?? 0)) + 1}일째`,
    weekday: wd, weatherIcon: w.icon, weatherName: w.name, sky: skyOf(h), ready: true,
  };
}

// ───────────── 지갑 ─────────────
/** 숫자 통통 카운트업 한 걸음(절반씩 다가가다 1 안쪽이면 딱) */
export function countStep(shown: number, target: number, k = 0.35): number {
  if (!Number.isFinite(shown)) return target;
  const d = target - shown;
  if (Math.abs(d) < 1) return target;
  const step = d * k;
  return shown + (Math.abs(step) < 1 ? Math.sign(d) : step);
}
export type KeyColorName = 'silver' | 'gold' | 'rainbow';
export const KEY_LOOK: Record<KeyColorName, { name: string; color: string }> = {
  silver: { name: '은열쇠', color: '#cfd8e6' }, gold: { name: '금열쇠', color: '#ffcf4a' }, rainbow: { name: '무지개열쇠', color: '#ff9fb8' },
};
/** 열쇠 조각 → {열쇠 수, 남은 조각} (3조각 = 열쇠 1). 하나도 없는 색은 뺀다 */
export function keyView(pieces: Partial<Record<KeyColorName, number>> | null | undefined): Array<{ color: KeyColorName; keys: number; pieces: number }> {
  const out: Array<{ color: KeyColorName; keys: number; pieces: number }> = [];
  for (const color of ['silver', 'gold', 'rainbow'] as const) {
    const p = Math.max(0, Math.floor(pieces?.[color] ?? 0));
    if (p > 0) out.push({ color, keys: Math.floor(p / 3), pieces: p % 3 });
  }
  return out;
}

// ───────────── 단축키 ─────────────
/** KeyboardEvent.code → 키 모자 글자 */
export function keyCap(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  const M: Record<string, string> = {
    Escape: 'Esc', Tab: 'Tab', Space: 'Space', Enter: 'Enter', Backquote: '`', ShiftLeft: 'Shift', ShiftRight: 'Shift',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: '⌫', Slash: '/', Minus: '-', Equal: '=',
  };
  return M[code] ?? code;
}

/**
 * hud 가 거는 단축키(GDD 3.11): B 도감 · Tab 가방 · I 가방(옛 키) · Esc 닫기 · ` HUD 숨기기.
 * panel '*' = 창이 열려 잠긴 동안에도 돈다(도감 ↔ 가방 바로 바꾸기, 같은 키로 닫기).
 * 그 밖의 잠금(낚시 미니게임 등) 중엔 창이 없으니 안 돈다.
 */
export interface HudKeySpec { id: string; code: string; label: string; hint?: boolean; panel?: string; action: 'toggle' | 'close' | 'hide'; kind?: string; tab?: string }
export const HUD_KEYS: readonly HudKeySpec[] = [
  { id: 'hud:dex', code: 'KeyB', label: '도감', hint: true, panel: '*', action: 'toggle', kind: 'dex' },
  { id: 'hud:bag', code: 'Tab', label: '가방', hint: true, panel: '*', action: 'toggle', kind: 'bag' },
  { id: 'hud:bag-legacy', code: 'KeyI', label: '가방', panel: '*', action: 'toggle', kind: 'bag' },
  { id: 'hud:close', code: 'Escape', label: '닫기', panel: '*', action: 'close' },
  { id: 'hud:hide', code: 'Backquote', label: 'HUD 숨기기', action: 'hide' },
];

/** 코어가 직접 받는 키(단축키 디스패처 밖) — 안내 칩에만 붙인다 */
export const CORE_KEY_HINTS: ReadonlyArray<{ code: string; label: string }> = [{ code: 'KeyE', label: '하기' }, { code: 'KeyG', label: '화질' }];

/** 이번 프레임에 돌릴 단축키(코어 dispatchHotkeys 규칙 그대로: 입력 중·consumed·잠금·when) */
export function selectHotkeys<T extends Pick<HotkeyDef, 'code' | 'when' | 'panel'>>(
  hotkeys: readonly T[], pressed: Iterable<string>, consumed: ReadonlySet<string> | null | undefined, ctx: HotkeyCtx,
): T[] {
  const picked = dispatchHotkeys(hotkeys, pressed, consumed, ctx);
  // 같은 키를 두 개가 잡으면 먼저 등록된 것 하나만(가방 Tab 두 번 토글 방지)
  const seen = new Set<string>();
  return picked.filter((h) => (seen.has(h.code) ? false : (seen.add(h.code), true)));
}

/** 키 안내 칩: hint 인 단축키(같은 키는 하나) + 코어 키 꼬리 */
export function keyHints(hotkeys: readonly Pick<HotkeyDef, 'code' | 'label' | 'hint' | 'when'>[]): Array<{ cap: string; label: string }> {
  const out: Array<{ cap: string; label: string }> = [];
  const seen = new Set<string>();
  for (const h of hotkeys) {
    if (!h.hint || seen.has(h.code)) continue;
    try { if (h.when && !h.when()) continue; } catch { continue; }
    seen.add(h.code);
    out.push({ cap: keyCap(h.code), label: h.label });
  }
  for (const k of CORE_KEY_HINTS) if (!seen.has(k.code)) { seen.add(k.code); out.push({ cap: keyCap(k.code), label: k.label }); }
  return out;
}

// ───────────── 행동 안내 칩 ─────────────
export interface PromptChip { cap: string; label: string; main: boolean }
/** 'E 낚시하기' → {cap:'E', label:'낚시하기'} (첫 낱말이 짧은 키 글자일 때) */
export function splitPrompt(text: string): { cap: string; label: string } {
  const m = /^(\S{1,6})\s+(.+)$/s.exec(text.trim());
  if (m && /^([A-Z0-9]|Esc|Tab|Space|Shift|Enter|[↑↓←→])$/.test(m[1])) return { cap: m[1], label: m[2] };
  return { cap: 'E', label: text.trim() };
}
/**
 * 행동 안내 칩: 코어가 고른 current(E)·currentAlt(F 등)를 그대로 쓰고, 고른 게 없는데 글이 오면(탑승 중 'E 내리기' 등) 글을 읽는다.
 */
export function promptChips(
  primary: string | null | undefined, alt: string | null | undefined,
  cur?: { key?: string; label: string } | null, curAlt?: { key?: string; label: string } | null,
): PromptChip[] {
  const out: PromptChip[] = [];
  if (cur) out.push({ cap: keyCap(cur.key || 'KeyE'), label: cur.label, main: true });
  else if (primary) out.push({ ...splitPrompt(primary), main: true });
  if (curAlt) out.push({ cap: keyCap(curAlt.key || 'KeyF'), label: curAlt.label, main: false });
  else if (alt) out.push({ ...splitPrompt(alt), main: false });
  return out;
}

// ───────────── 해금 카드 ─────────────
/** 카드로 안 띄우는 해금 이유(처음 받는 기본 도구·디버그·저장 옮기기) */
export const QUIET_UNLOCK = new Set(['start', 'starter', 'debug', 'migrate', 'load', 'p0', 'cheat']);
const UNLOCK_KIND: Array<[RegExp, { title: string; icon: string; color: string }]> = [
  [/^tool:/, { title: '새 도구!', icon: '🧰', color: '#7cc8ff' }],
  [/^(v|licence):/, { title: '새 탈것!', icon: '🚲', color: '#ffb36b' }],
  [/^recipe:/, { title: '레시피를 배웠어요!', icon: '📇', color: '#9bd77a' }],
  [/^rocket:/, { title: '로켓 준비!', icon: '🚀', color: '#a99bff' }],
  [/^space:/, { title: '우주가 열렸어요!', icon: '🪐', color: '#8f86ff' }],
  [/^bag:/, { title: '가방이 커졌어요!', icon: '🎒', color: '#ffb36b' }],
  [/^wing:/, { title: '박물관 증축!', icon: '🏛️', color: '#c59bff' }],
  [/^house:/, { title: '집이 넓어졌어요!', icon: '🏠', color: '#ff9cb8' }],
  [/^dino:/, { title: '공룡 친구!', icon: '🦕', color: '#9fcf5a' }],
  [/^lighthouse:/, { title: '등대에 불이 켜졌어요!', icon: '🗼', color: '#ffd23f' }],
  [/^dev:/, { title: '섬이 자랐어요!', icon: '🏝️', color: '#7fd18b' }],
  [/^facility:/, { title: '새 시설!', icon: '🏗️', color: '#ffbe3b' }],
  [/^invite:/, { title: '새 주민 초대!', icon: '💌', color: '#ff9cb8' }],
];
/** 해금 → 카드(조용한 이유면 null). nameOf 는 해금 키 → 사람 이름(없으면 키 꼬리) */
export function unlockCard(key: string, why: string | undefined, nameOf: (key: string) => string | undefined): CardOpts | null {
  if (!key || (why && QUIET_UNLOCK.has(why))) return null;
  const k = UNLOCK_KIND.find(([re]) => re.test(key))?.[1] ?? { title: '새로 열렸어요!', icon: '✨', color: '#ffcf4a' };
  const name = nameOf(key) ?? key.slice(key.indexOf(':') + 1).replace(/[_:]/g, ' ');
  return { title: k.title, body: name, icon: k.icon, color: k.color, ms: 3200 };
}

// ───────────── 차례 큐(배너·카드) ─────────────
/**
 * 한 번에 하나씩 보여 주는 큐. update(now, hold) 를 자주 부르면 된다.
 * hold(window.__hudHold) 이면 지금 것을 안 내린다. max 를 넘으면 가장 오래 기다린 것부터 버린다.
 */
export class TimedQueue<T extends { ms?: number }> {
  private q: T[] = [];
  cur: T | null = null;
  private until = 0;
  dropped = 0;
  constructor(private defMs: number, private max = 8) {}
  push(item: T) {
    this.q.push(item);
    while (this.q.length > this.max) { this.q.shift(); this.dropped++; }
  }
  /** 바뀌었으면 {show} 또는 {hide} */
  update(now: number, hold = false): { show?: T; hide?: T } | null {
    if (this.cur && !hold && now >= this.until) {
      const was = this.cur;
      this.cur = null;
      if (!this.q.length) return { hide: was };
    }
    if (!this.cur && this.q.length) {
      this.cur = this.q.shift()!;
      this.until = now + Math.max(400, this.cur.ms ?? this.defMs);
      return { show: this.cur };
    }
    return null;
  }
  /** 지금 것 바로 내리기 */
  skip(now: number) { this.until = now; }
  pending(): readonly T[] { return this.q; }
  clear() { this.q = []; this.cur = null; }
}
export type BannerItem = BannerOpts;
export type CardItem = CardOpts;

// ───────────── 도감 ─────────────
export type DexCellState = 'miss' | 'got' | 'silver' | 'gold';
/** 칸 상태(GDD 5.5): 실루엣 → 컬러 → 은별(10회) → 금별(왕관 개체). 반짝이는 따로 무지개 별 */
export function dexCell(rec: { count: number; variants?: Partial<Record<string, number>> } | null | undefined): { state: DexCellState; shiny: boolean } {
  if (!rec) return { state: 'miss', shiny: false };
  const shiny = (rec.variants?.shiny ?? 0) > 0;
  if ((rec.variants?.crown ?? 0) > 0) return { state: 'gold', shiny };
  if (rec.count >= 10) return { state: 'silver', shiny };
  return { state: 'got', shiny };
}
/** 섬별 % 바: 그 섬 where 를 가진 종 기준(where 가 없는 종은 섬 필터 '전부'에만) */
export function islandProgress(species: Iterable<{ id: string; where?: Array<{ island?: string }> }>, has: (id: string) => boolean, island: string | null): { got: number; total: number; pct: number; crown: boolean } {
  let got = 0, total = 0;
  for (const s of species) {
    if (island && !s.where?.some((w) => w.island === island)) continue;
    total++;
    if (has(s.id)) got++;
  }
  const pct = total ? Math.floor((got / total) * 100) : 0;
  return { got, total, pct, crown: total > 0 && got >= total };
}
export const speciesOnIsland = (s: { where?: Array<{ island?: string }> }, island: string | null) => !island || !!s.where?.some((w) => w.island === island);

// ───────────── 이름 ─────────────
export const VARIANT_TAIL: Record<string, string> = { shiny: '✨반짝이', crown: '👑왕관', tiny: '🐣꼬마' };
/** 변이 가방 키 이름: 'f_carp@crown' → '잉어 👑왕관' */
export function variantName(bagKey: string, baseName: (id: string) => string): string {
  const { id, variant } = splitVariant(bagKey);
  const n = baseName(id);
  return variant ? `${n} ${VARIANT_TAIL[variant]}` : n;
}

/** 같은 글 토스트 묶기: 같은 글이 ms 안에 또 오면 건너뛴다 */
export class ToastDedupe {
  private last = new Map<string, number>();
  constructor(private ms = 1500) {}
  allow(text: string, now: number): boolean {
    const t = this.last.get(text);
    if (t !== undefined && now - t < this.ms) return false;
    this.last.set(text, now);
    if (this.last.size > 40) for (const [k, v] of this.last) if (now - v > this.ms) this.last.delete(k);
    return true;
  }
}
