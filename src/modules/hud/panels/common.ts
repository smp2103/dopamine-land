// 기본 패널 공용 — 이름·아이콘·색 찾기(변이 가방 키 포함), 칸 HTML 조각, 빈 가방 그림.
// 읽기 전용 표(economy/data.ts)만 가져온다. 돈·가방·해금은 늘 game.econ 을 거친다(없으면 코어 상태로 대신).
import type { Game } from '../../../core/game';
import type { Species } from '../../../core/state';
import type { EconApi, PanelCtx } from '../../../core/api';
import { splitVariant } from '../../../core/api';
import { MAT, GOODS, SHOP_ITEMS, RECIPES, CAT_ICON, RARITY_COLOR, ANY_NEEDS, itemDef } from '../../economy/data';
import { PLANET_NAME, variantName } from '../logic';
import type { Thumbs } from '../thumbs';
import type { IslandShapes } from '../map';
import { silhouetteURL } from '../models';

/** 패널이 받는 것 — thumbs(모델 썸네일)·shapes(지도 섬 모양)는 hud.ts 가 만들어 넘긴다(시험에선 없어도 된다) */
export interface PanelEnv {
  game: Game;
  look: Look;
  thumbs?: Thumbs | null;
  shapes?: IslandShapes | null;
}

/**
 * 칸 그림 HTML: 썸네일이 있으면 <img>, 없으면 이모지(+ 줄 세우기). 썸네일이 다 되면 렌더러가 data-th 칸을 바꿔 끼운다.
 * 종이 아닌 물건(재료 등)은 늘 이모지.
 */
export function thumbHtml(env: PanelEnv, id: string, fallback: string): string {
  const s = env.look.species(id);
  const base = splitVariant(id).id;
  const T = env.thumbs;
  if (!s || !T || !T.enabled() || s.category === 'item' && !s.tags?.includes('vehicle')) return fallback;
  const url = T.get(base);
  if (url) return `<img class="th" src="${url}" alt="" draggable="false">`;
  T.want(base, s);
  return `<span class="th-wait" data-th="${base.replace(/"/g, '')}">${fallback}</span>`;
}
/** 못 잡은 칸 실루엣(분류 모양 2D 캔버스) */
export const silHtml = (s: { category: string; tags?: string[] }) => {
  const u = silhouetteURL(s);
  return u ? `<img class="sil-img" src="${u}" alt="" draggable="false">` : '';
};

export interface Look {
  /** 변이 꼬리 없는 이름 */
  baseName(id: string): string;
  /** 표시 이름(변이 꼬리 포함) */
  name(id: string): string;
  ico(id: string): string;
  color(id: string): string;
  species(id: string): Species | undefined;
  /** 해금 키 → 사람 이름(상점·레시피 표에서) */
  unlockName(key: string): string | undefined;
}

export function makeLook(game: Game): Look {
  const st = game.state;
  const sp = (id: string) => st.species.get(splitVariant(id).id);
  const baseName = (id: string): string => {
    const any = ANY_NEEDS[id];
    if (any) return any.name;
    return st.species.get(id)?.name ?? itemDef(id)?.name ?? GOODS[id]?.name ?? SHOP_ITEMS.find((s) => s.id === id)?.name ?? id;
  };
  const unlockNames = new Map<string, string>();
  for (const s of SHOP_ITEMS) if (s.unlock && !unlockNames.has(s.unlock)) unlockNames.set(s.unlock, s.name);
  for (const r of RECIPES) if (r.unlock && !unlockNames.has(r.unlock)) unlockNames.set(r.unlock, r.name);
  return {
    baseName,
    name: (id) => variantName(id, baseName),
    ico: (id) => {
      const b = splitVariant(id).id;
      return ANY_NEEDS[b]?.icon ?? itemDef(b)?.icon ?? GOODS[b]?.icon ?? CAT_ICON[sp(b)?.category ?? ''] ?? '🎁';
    },
    color: (id) => {
      const b = splitVariant(id).id;
      const m = MAT.get(b);
      if (m) return m.color;
      const s = sp(b);
      return s ? RARITY_COLOR[Math.min(5, Math.max(1, s.rarity))] + '88' : '#ffe7c2';
    },
    species: sp,
    unlockName: (key) => {
      const n = unlockNames.get(key);
      if (n) return n;
      if (key.startsWith('recipe:')) return RECIPES.find((r) => r.id === key.slice(7))?.name;
      if (key.startsWith('dino:')) return st.species.get(key.slice(5))?.name;
      if (key.startsWith('v:')) return st.species.get(`v_${key.slice(2)}`)?.name;
      if (key.startsWith('space:planet:')) return PLANET_NAME[key.slice(13)];
      if (key.startsWith('space:')) return PLANET_NAME[key.slice(6)];
      return undefined;
    },
  };
}

/** econ(없으면 null) — 늦게 생기는 서비스라 늘 그때그때 읽는다 */
export const econOf = (game: Game): EconApi | null => (game.econ as EconApi | null) ?? null;

/** 함수인지 보고 부르기(계약보다 옛 economy 가 붙어 있어도 안 넘어지게) */
export function call<R>(o: unknown, name: string, ...args: unknown[]): R | undefined {
  const f = (o as Record<string, unknown> | null)?.[name];
  if (typeof f !== 'function') return undefined;
  try { return (f as (...a: unknown[]) => R).apply(o, args); } catch (e) { console.error(`[hud] econ.${name}`, e); return undefined; }
}

/** 칸 클릭 → data-* 로 연결(본문 innerHTML 뒤에) */
export function bind(body: HTMLElement, attr: string, fn: (v: string, el: HTMLElement) => void) {
  body.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((el) => {
    el.onclick = (ev) => { ev.stopPropagation(); fn(el.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]!, el); };
  });
}

/** 패널 안 '꽝' 안내 한 줄 */
export const note = (pc: PanelCtx, text: string) => `<div class="note">${pc.h.esc(text)}</div>`;

/** 빈 가방 칸 n 개 */
export const slots = (n: number) => Array.from({ length: Math.max(0, n) }, () => '<div class="cell slot"></div>').join('');

export const BAG_SVG = `<svg viewBox="0 0 120 120" width="132" height="132"><ellipse cx="60" cy="110" rx="40" ry="6" fill="#e9d3a8"/>
    <path d="M40 36 Q40 14 60 14 Q80 14 80 36" fill="none" stroke="#c98a52" stroke-width="8" stroke-linecap="round"/>
    <path d="M22 50 Q22 34 40 34 H80 Q98 34 98 50 L100 92 Q100 106 84 106 H36 Q20 106 20 92 Z" fill="#ffb36b" stroke="#fff" stroke-width="5"/>
    <path d="M24 54 Q60 70 96 54" fill="none" stroke="#e8914a" stroke-width="5" stroke-linecap="round"/>
    <rect x="50" y="58" width="20" height="14" rx="5" fill="#ffe08a" stroke="#fff" stroke-width="3"/>
    <circle cx="46" cy="84" r="3.4" fill="#6b4a2b"/><circle cx="74" cy="84" r="3.4" fill="#6b4a2b"/>
    <ellipse cx="38" cy="92" rx="6" ry="3.5" fill="#ff8fa8" opacity=".7"/><ellipse cx="82" cy="92" rx="6" ry="3.5" fill="#ff8fa8" opacity=".7"/>
    <path d="M55 90 Q60 95 65 90" fill="none" stroke="#6b4a2b" stroke-width="3" stroke-linecap="round"/>
    <path d="M100 24 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#ffd23f"/></svg>`;

/** 빈 가방 안내 */
export const emptyBag = (title: string, sub: string, pc: PanelCtx) =>
  `<div class="empty">${BAG_SVG}<div><div class="e1">${pc.h.esc(title)}</div><div class="e2">${pc.h.esc(sub)}</div></div></div>`;

/** 가방 안 칸 목록(0 넘는 것, 도구 벨트 제외) */
export function bagKeys(game: Game): string[] {
  const bag = game.state.bag;
  const E = econOf(game);
  return Object.keys(bag).filter((k) => bag[k] > 0 && !(E?.bag?.isTool ? safe(() => E.bag.isTool(k), false) : k.startsWith('tool_')));
}
export function safe<T>(fn: () => T, fb: T): T { try { return fn(); } catch { return fb; } }

/** 가방 칸 종류: 생물(도감 종, 재료 아님) / 재료 / 물건 */
export function bagKind(game: Game, key: string): 'catch' | 'mat' | 'goods' {
  const id = splitVariant(key).id;
  if (MAT.has(id) || itemDef(id)) return 'mat';
  const s = game.state.species.get(id);
  if (s && s.category !== 'item') return 'catch';
  return 'goods';
}

/** ★ 줄 */
export const starsHtml = (r: number) => `${'★'.repeat(r)}<span style="opacity:.3">${'★'.repeat(Math.max(0, 5 - r))}</span>`;
