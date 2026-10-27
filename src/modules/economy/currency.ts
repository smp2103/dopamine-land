// 재화 도우미 — 비용(코인·반짝별·아이템) 계산, 열쇠 조각(3조각 = 열쇠 1), 반짝별 보상표(GDD 4.1·4.1.1).
// 부수효과 없는 순수 함수만. 실제로 지갑을 바꾸는 건 economy.ts 의 econ(addStars·spend·addKeyPiece …) 하나뿐이다.
import type { Cost, KeyColor } from '../../core/api';
import { STARS_FIRST, STARS_DONATE, STARS_SHINY, itemDef } from './data';

/** 열쇠 색(은·금·무지개) */
export const KEY_COLORS: readonly KeyColor[] = ['silver', 'gold', 'rainbow'];
/** 조각 3개 = 열쇠 1개 */
export const PIECES_PER_KEY = 3;
export const KEY_NAME: Record<KeyColor, string> = { silver: '은열쇠', gold: '금열쇠', rainbow: '무지개 열쇠' };
export const KEY_ICON: Record<KeyColor, string> = { silver: '🗝️', gold: '🔑', rainbow: '🌈' };
export const isKeyColor = (c: unknown): c is KeyColor => c === 'silver' || c === 'gold' || c === 'rainbow';

/** 저장에서 읽은 열쇠 조각 칸을 깨끗하게(옛 저장은 아무 키나 들어 있을 수 있다) */
export function normalizeKeys(raw: unknown): Record<KeyColor, number> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { silver: 0, gold: 0, rainbow: 0 } as Record<KeyColor, number>;
  for (const c of KEY_COLORS) { const n = Number(r[c]); out[c] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  return out;
}
/** 조각 수 → 쓸 수 있는 열쇠 수 */
export const keysFromPieces = (pieces: number) => Math.floor(Math.max(0, pieces) / PIECES_PER_KEY);

// ── 비용 ──

/** 지갑 모양(코인·반짝별·가방) — econ 이 진짜 값을 넣어 준다 */
export interface Wallet { coins: number; stars: number; has(id: string, n: number): boolean }

/** 비용이 비었나(공짜) */
export const isFree = (c: Cost | undefined) => !c || (!(c.coins ?? 0) && !(c.stars ?? 0) && !Object.values(c.items ?? {}).some((n) => n > 0));

/** 낼 수 있나 — 코인·반짝별·재료를 전부 본다(별 값 물건이 공짜로 나가지 않게) */
export function canAffordWith(c: Cost | undefined, w: Wallet): boolean {
  if (!c) return true;
  if ((c.coins ?? 0) > w.coins) return false;
  if ((c.stars ?? 0) > w.stars) return false;
  return Object.entries(c.items ?? {}).every(([k, n]) => n <= 0 || w.has(k, n));
}

/** 무엇이 모자란지 한 줄(귀여운 말투). 다 있으면 null */
export function shortfallText(c: Cost | undefined, w: Wallet, nameOf: (id: string) => string = defaultName): string | null {
  if (!c) return null;
  if ((c.stars ?? 0) > w.stars) return `반짝별이 ${fmt((c.stars ?? 0) - w.stars)}개 모자라요… ⭐`;
  if ((c.coins ?? 0) > w.coins) return `코인이 ${fmt((c.coins ?? 0) - w.coins)} 모자라요… 🥲`;
  for (const [k, n] of Object.entries(c.items ?? {})) if (n > 0 && !w.has(k, n)) return `${nameOf(k)}이(가) 모자라요… 🧺`;
  return null;
}

/** 비용을 사람 말로: '1,600코인 · ⭐20 · 통통 엔진 1' */
export function costText(c: Cost | undefined, nameOf: (id: string) => string = defaultName): string {
  if (isFree(c)) return '무료';
  const parts: string[] = [];
  if (c!.coins) parts.push(`${fmt(c!.coins)}코인`);
  if (c!.stars) parts.push(`⭐${fmt(c!.stars)}`);
  for (const [k, n] of Object.entries(c!.items ?? {})) if (n > 0) parts.push(`${nameOf(k)} ${n}`);
  return parts.join(' · ');
}

/** 재료 묶음을 사람 말로: '나무 4 + 덩굴 밧줄 1' */
export function needsText(needs: Record<string, number>, nameOf: (id: string) => string = defaultName): string {
  return Object.entries(needs).filter(([, n]) => n > 0).map(([k, n]) => `${nameOf(k)} ${n}`).join(' + ');
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const defaultName = (id: string) => itemDef(id)?.name ?? id;

// ── 반짝별 보상표(4.1.1) ──

const clampR = (r: number) => Math.min(5, Math.max(1, Math.round(r) || 1));
/** 도감 첫 등록 반짝별: ★1/2/3/4/5 → 1/2/3/5/10 */
export const firstDexStars = (rarity: number) => STARS_FIRST[clampR(rarity)] ?? 1;
/** 박물관 첫 기증 반짝별(같은 표) */
export const donateStars = (rarity: number) => STARS_DONATE[clampR(rarity)] ?? 1;
/** 반짝이 첫 등록 덤 */
export const shinyFirstStars = () => STARS_SHINY;
/** 기증 코인(예전 공식 그대로): 100 × ★² */
export const donateCoins = (rarity: number) => 100 * clampR(rarity) * clampR(rarity);

// ── 줍는 즉시 바뀌는 것(녹슨 열쇠 → 은열쇠 조각) ──

/** 'keypiece:silver' 같은 onObtain 을 읽는다. 아니면 null */
export function obtainEffect(id: string): { kind: 'keypiece'; color: KeyColor } | null {
  const o = itemDef(id)?.onObtain;
  if (!o) return null;
  const [kind, arg] = o.split(':');
  if (kind === 'keypiece' && isKeyColor(arg)) return { kind: 'keypiece', color: arg };
  return null;
}
