// 주민 이주 순수 로직(DOM·three 없음 — 테스트가 그대로 부른다).
// 이주민 후보 16(GDD 3.10.1) 중 누가 어느 섬에 사나 · 섬마다 집 수(ISLAND_CAP) · 다음에 올 주민 고르기 ·
// moveIn 검사(섬 id · 자리 · 고정 주민) · 우정 100 이사 제안 섬 고르기.
// 사는 섬 = flags.npc[id].home ?? 원래 섬(새 이주민은 원래 섬이 없다 = 아직 안 옴).
import type { NpcFlag } from './dialog';

export const MIGRATION_ISLANDS = ['home', 'dino', 'ice', 'mushroom', 'coral', 'desert', 'launch'] as const;
export type MigrationIsland = (typeof MIGRATION_ISLANDS)[number];
export const isMigrationIsland = (x: unknown): x is MigrationIsland => typeof x === 'string' && (MIGRATION_ISLANDS as readonly string[]).includes(x);

/** 주민 한 명(인구에 세는 사람) */
export interface ResidentRow {
  id: string;
  /** 원래 사는 섬(null = 아직 이사 안 온 이주민) */
  base: string | null;
  /** 이주민 후보 16 안이면 옮길 수 있다 */
  movable: boolean;
  /** 그 섬을 떠나지 않는다(몽실) */
  fixed?: boolean;
}

export type FlagsOf = (id: string) => Pick<NpcFlag, 'home'> | undefined;

/** 지금 사는 섬(null = 아직 안 옴) */
export const islandOf = (r: ResidentRow, fl: FlagsOf): string | null => fl(r.id)?.home ?? r.base;

/** 그 섬 주민 id(행 순서) */
export function population(rows: readonly ResidentRow[], fl: FlagsOf, island: string): string[] {
  return rows.filter((r) => islandOf(r, fl) === island).map((r) => r.id);
}

/** 남은 집 수 */
export function capacityLeft(rows: readonly ResidentRow[], fl: FlagsOf, island: string, cap: Readonly<Record<string, number>>): number {
  return Math.max(0, (cap[island] ?? 0) - population(rows, fl, island).length);
}

export type MoveCheck =
  | { ok: true; already: boolean; from: string | null }
  | { ok: false; why: 'island' | 'unknown' | 'fixed' | 'full' };

/** moveIn 해도 되나 */
export function checkMoveIn(rows: readonly ResidentRow[], fl: FlagsOf, id: string, island: string, cap: Readonly<Record<string, number>>): MoveCheck {
  if (!isMigrationIsland(island)) return { ok: false, why: 'island' };
  const r = rows.find((x) => x.id === id);
  if (!r || !r.movable) return { ok: false, why: 'unknown' };
  const from = islandOf(r, fl);
  if (from === island) return { ok: true, already: true, from };
  if (r.fixed) return { ok: false, why: 'fixed' };
  if (capacityLeft(rows, fl, island, cap) <= 0) return { ok: false, why: 'full' };
  return { ok: true, already: false, from };
}

export const MOVE_WHY_TEXT: Record<'island' | 'unknown' | 'fixed' | 'full', string> = {
  island: '거기는 이사 갈 수 있는 섬이 아니에요 🏝️',
  unknown: '이사 올 수 있는 주민이 아니에요',
  fixed: '그 친구는 지금 섬을 지키고 있어서 못 떠나요 🏠',
  full: '그 섬엔 빈 집이 없어요 🏠',
};

/**
 * 다음에 그 섬으로 올 주민: 아직 안 온 이주민(후보 순서) 먼저,
 * 다 왔으면 다른 섬에서 사람이 가장 많은 섬의 주민(같으면 후보 순서). 자리가 없으면 null.
 */
export function nextResident(rows: readonly ResidentRow[], fl: FlagsOf, island: string, cap: Readonly<Record<string, number>>): string | null {
  if (!isMigrationIsland(island) || capacityLeft(rows, fl, island, cap) <= 0) return null;
  const movable = rows.filter((r) => r.movable && !r.fixed);
  const fresh = movable.find((r) => islandOf(r, fl) === null);
  if (fresh) return fresh.id;
  let best: string | null = null, bn = 1;
  for (const r of movable) {
    const at = islandOf(r, fl);
    if (!at || at === island) continue;
    const n = population(rows, fl, at).length;
    if (n > bn) { bn = n; best = r.id; }
  }
  return best;
}

/** 이사 후보(아직 안 온 이주민 먼저, 그다음 다른 섬 주민) — islanddev 가 candidates(island) 로 읽는다 */
export function candidates(rows: readonly ResidentRow[], fl: FlagsOf, island: string): string[] {
  const movable = rows.filter((r) => r.movable && !r.fixed);
  const fresh = movable.filter((r) => islandOf(r, fl) === null).map((r) => r.id);
  const others = movable.filter((r) => { const at = islandOf(r, fl); return at !== null && at !== island; }).map((r) => r.id);
  return [...fresh, ...others];
}

/**
 * 우정 100 이사 제안 섬: 플레이어가 지금 선 섬(주민이 사는 섬과 다르고 자리가 있으면) → 아니면 말랑섬(home).
 * 이미 거기 살거나 자리가 없으면 null(사진만 준다).
 */
export function proposalIsland(r: ResidentRow, fl: FlagsOf, here: string | null, cap: Readonly<Record<string, number>>, rows: readonly ResidentRow[]): string | null {
  if (!r.movable || r.fixed) return null;
  const at = islandOf(r, fl);
  for (const isl of [here, 'home']) {
    if (!isl || !isMigrationIsland(isl) || isl === at) continue;
    if (capacityLeft(rows, fl, isl, cap) > 0) return isl;
  }
  return null;
}
