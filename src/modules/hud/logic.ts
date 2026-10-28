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
    Escape: 'Esc', Tab: 'Tab', Space: 'Space', Enter: 'Enter', Backquote: '`', Backslash: '\\', ShiftLeft: 'Shift', ShiftRight: 'Shift',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: '⌫', Slash: '/', Minus: '-', Equal: '=',
  };
  return M[code] ?? code;
}

/**
 * hud 가 거는 단축키(GDD 3.11 · wave 7): Tab 말랑 주머니 · B 도감 · I 가방 · M 지도 · Esc 닫기 · \ HUD 숨기기(` 는 개발 패널 몫).
 * panel '*' = 창이 열려 잠긴 동안에도 돈다(도감 ↔ 가방 바로 바꾸기, 같은 키로 닫기, 창에서 Tab → 주머니로).
 * 그 밖의 잠금(낚시 미니게임 등) 중엔 창이 없으니 안 돈다.
 */
export interface HudKeySpec { id: string; code: string; label: string; hint?: boolean; panel?: string; action: 'toggle' | 'close' | 'hide' | 'pocket'; kind?: string; tab?: string }
/** 말랑 주머니 창 kind(레지스트리 패널 — 렌더러가 창 대신 고리로 그린다) */
export const POCKET_KIND = 'pocket';
export const HUD_KEYS: readonly HudKeySpec[] = [
  { id: 'hud:pocket', code: 'Tab', label: '말랑 주머니', hint: true, panel: '*', action: 'pocket' },
  { id: 'hud:dex', code: 'KeyB', label: '도감', hint: true, panel: '*', action: 'toggle', kind: 'dex' },
  { id: 'hud:bag', code: 'KeyI', label: '가방', hint: true, panel: '*', action: 'toggle', kind: 'bag' },
  { id: 'hud:map', code: 'KeyM', label: '지도', hint: true, panel: '*', action: 'toggle', kind: 'map' },
  { id: 'hud:close', code: 'Escape', label: '닫기', panel: '*', action: 'close' },
  { id: 'hud:hide', code: 'Backslash', label: 'HUD 숨기기', action: 'hide' },
];

/**
 * Tab 을 눌렀을 때: 주머니가 열려 있으면 닫기 · 파는 가게/박물관 창이면 그 자리를 실은 가방(팔기·기증) ·
 * 다른 창이면 주머니로 돌아가기 · 아무것도 없으면 주머니 열기.
 */
export function pocketKeyAction(open: { kind: string; arg: unknown } | null | undefined): { do: 'close' } | { do: 'bag'; arg: BagMode } | { do: 'pocket' } {
  if (open?.kind === POCKET_KIND) return { do: 'close' };
  const arg = open && open.kind !== 'bag' ? bagArgFrom(open) : undefined;
  if (arg && arg.from) return { do: 'bag', arg };
  return { do: 'pocket' };
}

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
/** 행성 id → 이름(지역 이름표·해금 카드) */
export const PLANET_NAME: Record<string, string> = { moon: '토끼달' };
/** 카드로 안 띄우는 해금 이유(처음 받는 기본 도구·디버그·저장 옮기기) */
export const QUIET_UNLOCK = new Set(['start', 'starter', 'debug', 'migrate', 'load', 'p0', 'cheat']);
/** 다른 모듈이 더 자세한 카드를 직접 띄우는 해금(키, 이유 — 이유가 없으면 늘) */
const OWN_CARD: Array<[RegExp, string | undefined]> = [[/^dino:/, 'befriend'], [/^v:dino_/, 'befriend'], [/^v:raft$/, undefined]];
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
  // 제 카드를 직접 띄우는 해금 — 공룡 친구(dinos, 보상 글 포함)·뗏목(vehicles, F 안내 포함). 두 장 겹치지 않게
  if (OWN_CARD.some(([re, w]) => re.test(key) && (!w || w === why))) return null;
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
  /** 바뀌었으면 {show} 또는 {hide}. allowShow=false 면 다 된 것을 내리기만 하고 새로 띄우지 않는다(큰 배너가 떠 있을 때 카드는 기다린다) */
  update(now: number, hold = false, allowShow = true): { show?: T; hide?: T } | null {
    if (this.cur && !hold && now >= this.until) {
      const was = this.cur;
      this.cur = null;
      if (!this.q.length || !allowShow) return { hide: was };
    }
    if (!this.cur && this.q.length && allowShow) {
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

// ───────────── 도감(wave 3B) — 칸 보기·합계 314·섬 칩·숙련 ─────────────
/** 칸 하나를 그릴 때 필요한 전부(GDD 5.5): 상태 + 반짝이 무지개 별 + 왕관 개체 + 숙련 별 */
export interface DexCellView { state: DexCellState; shiny: boolean; crown: boolean; star: 'silver' | 'gold' | null; mastery: number }
export function dexCellView(rec: { count: number; variants?: Partial<Record<string, number>> } | null | undefined, mastery = 0): DexCellView {
  const c = dexCell(rec);
  return {
    state: c.state, shiny: c.shiny, crown: (rec?.variants?.crown ?? 0) > 0,
    star: c.state === 'gold' ? 'gold' : c.state === 'silver' ? 'silver' : null,
    mastery: rec ? clampMastery(mastery) : 0,
  };
}
/** 숙련 별 0..5(정수) — 이상한 값은 0 */
export const clampMastery = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(5, Math.floor(v))) : 0);
/** game.ext.meta?.mastery?.(id) 를 안전하게(없으면 0) */
export function masteryOf(meta: unknown, id: string): number {
  const f = (meta as { mastery?: unknown } | null | undefined)?.mastery;
  if (typeof f !== 'function') return 0;
  try { return clampMastery((f as (id: string) => unknown)(id)); } catch { return 0; }
}

/** 탭 모양(economy/data DexTab 에서 쓰는 것만) */
export interface DexTabLike { id: string; slots: number; match(s: { category: string; tags?: string[] }): boolean }
export interface DexTotals { got: number; registered: number; total: number; tabs: Record<string, { got: number; registered: number; slots: number }> }
/**
 * 도감 합계: 탭마다 칸 수 = max(등록된 종, 표의 칸 수) → 모두 더하면 314(GDD 5.5).
 * 데이터가 덜 실려도 314칸 판은 그대로, 표보다 많이 실리면 실린 만큼.
 */
export function dexTotals(tabs: readonly DexTabLike[], species: Iterable<{ id: string; category: string; tags?: string[] }>, has: (id: string) => boolean): DexTotals {
  const list = [...species];
  const out: DexTotals = { got: 0, registered: 0, total: 0, tabs: {} };
  for (const t of tabs) {
    let reg = 0, got = 0;
    for (const s of list) if (t.match(s)) { reg++; if (has(s.id)) got++; }
    const slots = Math.max(reg, t.slots);
    out.tabs[t.id] = { got, registered: reg, slots };
    out.got += got; out.registered += reg; out.total += slots;
  }
  return out;
}

export interface IslandChip { island: string; got: number; total: number; pct: number; crown: boolean }
/**
 * 섬 필터 칩: 이 탭 종들의 where 에 나오는 섬만, order(섬 표 순서) 먼저 그다음 처음 보는 섬(달 등).
 * 칩마다 그 섬 % 와 100% 왕관.
 */
export function dexIslandChips(species: Iterable<{ id: string; where?: Array<{ island?: string }> }>, has: (id: string) => boolean, order: readonly string[] = []): IslandChip[] {
  const list = [...species];
  const seen: string[] = [];
  for (const s of list) for (const w of s.where ?? []) if (w.island && !seen.includes(w.island)) seen.push(w.island);
  const ids = [...order.filter((i) => seen.includes(i)), ...seen.filter((i) => !order.includes(i))];
  return ids.map((island) => ({ island, ...islandProgress(list, has, island) }));
}

/** 화석 골격 칸 진행: 조각(fos:<공룡>:<부위>) 중 모은 수. 골격 태그 fos:<공룡> */
export function fossilProgress(skeleton: { tags?: string[] }, species: Iterable<{ id: string; tags?: string[] }>, has: (id: string) => boolean): { have: number; total: number } | null {
  const tag = skeleton.tags?.find((t) => /^fos:[^:]+$/.test(t));
  if (!tag) return null;
  let have = 0, total = 0;
  for (const s of species) {
    if (!s.tags?.some((t) => t.startsWith(tag + ':'))) continue;
    total++;
    if (has(s.id)) have++;
  }
  return total ? { have, total } : null;
}

// ───────────── 가방 열린 자리(팔기·기증 버튼은 상점·박물관에서만) ─────────────
export type BagMode = { from: 'shop'; shop: string } | { from: 'museum' } | { from: null };
/** 가방 창 인자 → 어디서 열었나. {from:'shop', shop} / {from:'museum'} 만 버튼이 붙는다 */
export function bagModeOf(arg: unknown): BagMode {
  const a = arg as { from?: unknown; shop?: unknown } | null | undefined;
  if (a && a.from === 'shop') return { from: 'shop', shop: typeof a.shop === 'string' && a.shop ? a.shop : 'quack' };
  if (a && a.from === 'museum') return { from: 'museum' };
  return { from: null };
}
/** 지금 열린 창에서 가방(Tab)을 열 때 넘길 인자 — 가게(팔 수 있는 곳)·박물관이면 그 자리, 아니면 없음 */
export function bagArgFrom(open: { kind: string; arg: unknown } | null | undefined): BagMode | undefined {
  if (!open) return undefined;
  if (open.kind === 'shop') { const shop = shopOfArg(open.arg); return shopInfo(shop).sell ? { from: 'shop', shop } : undefined; }
  if (open.kind === 'museum') return { from: 'museum' };
  if (open.kind === 'bag') { const m = bagModeOf(open.arg); return m.from ? m : undefined; }
  return undefined;
}

// ───────────── 다 팔기 ─────────────
/** 다 팔기 후보 한 칸 */
export interface SellEntry { key: string; n: number; sellable: boolean; creature: boolean; junk: boolean; donatable: boolean }
export interface SellPlan { all: string[]; partial: Array<{ key: string; n: number }>; kept: Array<{ key: string; why: 'precious' | 'donate' }> }
/** 반짝이·왕관은 소중해서 다 팔기에서 뺀다 */
export const PRECIOUS = new Set(['shiny', 'crown']);
/**
 * 다 팔기 계획(econ.sellAll 기본 규칙 = 생물 + 쓰레기): 못 파는 것·재료는 그대로,
 * 반짝이·왕관은 남기고, 아직 기증 안 한 생물은 한 마리 남긴다(여러 마리면 나머지만 판다).
 * all → econ.sellAll(all, shop), partial → econ.sell(key, n, shop).
 */
export function sellAllPlan(entries: readonly SellEntry[], o: { keepPrecious?: boolean; keepDonate?: boolean } = {}): SellPlan {
  const plan: SellPlan = { all: [], partial: [], kept: [] };
  for (const e of entries) {
    if (e.n <= 0 || !e.sellable || !(e.creature || e.junk)) continue;
    const v = splitVariant(e.key).variant;
    if ((o.keepPrecious ?? true) && v && PRECIOUS.has(v)) { plan.kept.push({ key: e.key, why: 'precious' }); continue; }
    if ((o.keepDonate ?? true) && e.creature && e.donatable) {
      plan.kept.push({ key: e.key, why: 'donate' });
      if (e.n > 1) plan.partial.push({ key: e.key, n: e.n - 1 });
      continue;
    }
    plan.all.push(e.key);
  }
  return plan;
}
/** 계획대로 팔면 받을 코인(미리 보기) */
export const sellPlanTotal = (p: SellPlan, unit: (key: string) => number, count: (key: string) => number) =>
  p.all.reduce((s, k) => s + unit(k) * count(k), 0) + p.partial.reduce((s, x) => s + unit(x.key) * x.n, 0);

// ───────────── 지도·안개(fog of war) ─────────────
/**
 * 밝혀진 섬: geo.discovered(id) 인 섬 + 지금 서 있는 섬. geo 가 아직 없으면(옛 저장·worldterrain 없음) 다 밝힌다.
 * 지도(M)와 미니맵이 같은 집합을 쓴다.
 */
export function fogSet(islandIds: readonly string[], discovered: ((id: string) => boolean) | null | undefined, here: string | null | undefined): Set<string> {
  if (typeof discovered !== 'function') return new Set(islandIds);
  const out = new Set<string>();
  for (const id of islandIds) {
    let d = false;
    try { d = !!discovered(id); } catch { d = false; }
    if (d || id === here) out.add(id);
  }
  return out;
}
/** 지도 맞추기: 세계 사각형 → W×H 캔버스(가운데 정렬, 여백 pad). toPx / toWorld */
export function fitMap(b: { minX: number; maxX: number; minZ: number; maxZ: number }, W: number, H: number, pad = 16) {
  const s = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxZ - b.minZ));
  const ox = W / 2 - ((b.minX + b.maxX) / 2) * s, oy = H / 2 - ((b.minZ + b.maxZ) / 2) * s;
  return {
    s,
    toPx: (x: number, z: number): [number, number] => [ox + x * s, oy + z * s],
    toWorld: (px: number, py: number): [number, number] => [(px - ox) / s, (py - oy) / s],
  };
}

// ───────────── 썸네일 큐(한 프레임에 하나씩) ─────────────
/** 썸네일 품질: generic = 코드 기본 모양, model = 실제 잡은 모델 */
export type ThumbSrc = 'generic' | 'model';
/**
 * 썸네일 큐: id 마다 결과 하나를 캐시하고, pump 한 번에 budget(기본 1)개만 그린다(프레임 나눠 갚기).
 * 같은 id 는 한 번만 줄 서고, 실제 모델(model)이 오면 기본 모양(generic) 결과를 덮어쓴다(줄에 있으면 일감만 바꾼다).
 */
export class ThumbQueue<J> {
  private cache = new Map<string, { url: string | null; src: ThumbSrc }>();
  private q: Array<{ id: string; job: J; src: ThumbSrc }> = [];
  private queued = new Map<string, { id: string; job: J; src: ThumbSrc }>();
  /** 지금까지 그린 수(디버그) */
  drawn = 0;
  constructor(private max = 600) {}
  /** 캐시된 url(없으면 undefined, 그리다 실패했으면 null) */
  get(id: string): string | null | undefined { return this.cache.get(id)?.url; }
  srcOf(id: string): ThumbSrc | undefined { return this.cache.get(id)?.src; }
  has(id: string) { return this.cache.has(id); }
  isQueued(id: string) { return this.queued.has(id); }
  /** 줄 세우기 — 이미 같은 품질 이상이 있거나 줄에 있으면 false(모델이면 줄의 일감을 바꿔 끼운다) */
  request(id: string, job: J, src: ThumbSrc = 'generic'): boolean {
    const have = this.cache.get(id);
    if (have && (have.src === 'model' || src === 'generic')) return false;
    const q = this.queued.get(id);
    if (q) {
      if (src === 'model' && q.src === 'generic') { q.job = job; q.src = 'model'; return true; }
      return false;
    }
    const item = { id, job, src };
    // 실제 모델은 앞에(방금 잡은 것부터 보이게)
    if (src === 'model') this.q.unshift(item); else this.q.push(item);
    this.queued.set(id, item);
    return true;
  }
  /** 밖에서 받은 결과(저장소에서 읽은 것 등)를 넣는다 */
  put(id: string, url: string | null, src: ThumbSrc) {
    const have = this.cache.get(id);
    if (have && have.src === 'model' && src === 'generic') return;
    this.cache.set(id, { url, src });
    const q = this.queued.get(id);
    if (q && (src === 'model' || q.src === 'generic')) {
      this.queued.delete(id);
      const i = this.q.indexOf(q);
      if (i >= 0) this.q.splice(i, 1);
    }
    this.trim();
  }
  /** budget 개만 그린다. 그린 id 목록 */
  pump(render: (id: string, job: J, src: ThumbSrc) => string | null, budget = 1): string[] {
    const done: string[] = [];
    while (done.length < budget && this.q.length) {
      const it = this.q.shift()!;
      this.queued.delete(it.id);
      let url: string | null = null;
      try { url = render(it.id, it.job, it.src); } catch { url = null; }
      // 실제 모델이 실패하면(복제 못 하는 모델 등) 비워 둬서 기본 모양이 대신 그려지게 한다
      if (url === null && it.src === 'model') { if (this.cache.get(it.id)?.src !== 'generic') this.cache.delete(it.id); }
      else this.cache.set(it.id, { url, src: it.src });
      this.drawn++;
      done.push(it.id);
    }
    this.trim();
    return done;
  }
  pending(): number { return this.q.length; }
  /** 줄 비우기(품질을 낮췄을 때) — 버린 일감 */
  drain(): J[] { const jobs = this.q.map((x) => x.job); this.q = []; this.queued.clear(); return jobs; }
  clear() { this.cache.clear(); this.drain(); }
  private trim() {
    while (this.cache.size > this.max) { const k = this.cache.keys().next().value as string; this.cache.delete(k); }
  }
}

/** 선형 → sRGB 8비트 표(렌더 타깃은 선형이라 읽은 뒤 바꾼다) */
export function srgbLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    lut[i] = Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
  }
  return lut;
}
