// 상호작용 고르기(순수 함수) — 계약 v2 3장. game.ts 가 매 프레임 후보를 모아 이걸로 E 하나·대체 키 하나를 고른다.
// DOM·three 없음 → 테스트에서 바로 부른다.

/** 키를 안 적으면 E */
export const DEFAULT_KEY = 'KeyE';

export interface InteractCand {
  id: string;
  /** KeyboardEvent.code. 없으면 'KeyE' */
  key?: string;
  /** 플레이어와 거리(가까울수록 우선) */
  dist: number;
  /** 대체 키 끼리의 우선순위(클수록 먼저, 기본 0) — api.ALT_PRIORITY */
  priority?: number;
  /** 탈것에 탄 채로도 되는 것 */
  whileMounted?: boolean;
}

export interface InteractPick<T extends InteractCand> {
  /** 가장 가까운 E 후보 */
  current: T | null;
  /** E 가 아닌 후보 중 우선순위 높은 것 → 같으면 가까운 것 */
  alt: T | null;
  /** 이번 프레임에 current/alt 가 차지한 키(단축키 디스패처가 건너뛴다) */
  consumed: Set<string>;
}

const keyOf = (c: InteractCand) => c.key || DEFAULT_KEY;

/**
 * 후보 고르기.
 * - 탑승 중(mounted)이면 whileMounted 후보만 센다(그 밖의 E 는 '내리기' 몫).
 * - 거리가 수가 아니면(NaN·무한) 버린다.
 * - 동점은 먼저 들어온 후보가 이긴다(결정적).
 */
export function selectInteractions<T extends InteractCand>(cands: readonly T[], mounted: boolean): InteractPick<T> {
  let current: T | null = null;
  let alt: T | null = null;
  for (const c of cands) {
    if (!c || !Number.isFinite(c.dist)) continue;
    if (mounted && !c.whileMounted) continue;
    if (keyOf(c) === DEFAULT_KEY) {
      if (!current || c.dist < current.dist) current = c;
    } else {
      const p = c.priority ?? 0, ap = alt ? alt.priority ?? 0 : -Infinity;
      if (!alt || p > ap || (p === ap && c.dist < alt.dist)) alt = c;
    }
  }
  const consumed = new Set<string>();
  if (current) consumed.add(DEFAULT_KEY);
  if (alt) consumed.add(keyOf(alt));
  return { current, alt, consumed };
}

/** 화면 안내 글: 'E 낚시하기' / 'F 타기' */
export const promptText = (c: { key?: string; label: string } | null | undefined) =>
  c ? `${(c.key || DEFAULT_KEY).replace(/^Key/, '').replace(/^Digit/, '')} ${c.label}` : null;
