// 두근두근 캡슐머신(GDD 4.1 캡슐 티켓, wave 4 econ-p1) — 상품표·확률·굴림. 부수효과 없는 순수 모듈.
// 티켓(it_capsule) 1장 = 1회. 의상(cos_*) · 탈것 스킨(skin_<kind>_<n>) · 한정 가구(f_cap_*).
//   등급: 보통 70% · 희귀 25% · 특별 5% → 그 등급 안에서 종류(의상 45 · 스킨 35 · 가구 20) → 같은 무게로 하나.
//   천장: 특별 없이 29번 돌리면 30번째는 특별 확정. 가진 의상·스킨이 또 나오면 반짝별로 바꿔 준다(가구는 여러 개 둬도 된다).
// 난수는 부르는 쪽이 넘긴다(economy 는 ctx.rng(`capsule:${n}`)) — 같은 저장이면 같은 결과.
import { COSMETIC_TABLE, CAPSULE_COSMETICS, SKIN_KINDS, SKIN_COLORS, CAPSULE_FURNITURE } from './tables';

export type CapsuleGrade = 1 | 2 | 3;
export type CapsuleKind = 'cos' | 'skin' | 'furniture';
export interface CapsulePrize { id: string; kind: CapsuleKind; grade: CapsuleGrade; name: string; icon: string }

/** 등급 무게(%) */
export const CAPSULE_GRADE_W: Readonly<Record<CapsuleGrade, number>> = Object.freeze({ 1: 70, 2: 25, 3: 5 });
/** 종류 무게 */
export const CAPSULE_KIND_W: Readonly<Record<CapsuleKind, number>> = Object.freeze({ cos: 45, skin: 35, furniture: 20 });
/** 특별 등급 천장 — 특별 없이 이만큼 돌리면 다음은 특별 */
export const CAPSULE_PITY = 29;
/** 가진 의상·스킨이 또 나오면 반짝별(등급별) */
export const CAPSULE_DUP_STARS: Readonly<Record<CapsuleGrade, number>> = Object.freeze({ 1: 2, 2: 4, 3: 10 });
export const GRADE_NAME: Record<CapsuleGrade, string> = { 1: '보통', 2: '희귀', 3: '특별' };
export const GRADE_COLOR: Record<CapsuleGrade, string> = { 1: '#a5dba8', 2: '#86c5ff', 3: '#ffcf4a' };

const COS_BY_ID = new Map(COSMETIC_TABLE.map((c) => [c.id, c]));

/** 상품 전부 — 캡슐 한정 의상 + 스킨 36(탈것 12 × 3색, 번호 = 등급) + 한정 가구 */
export const CAPSULE_POOL: readonly CapsulePrize[] = Object.freeze([
  ...CAPSULE_COSMETICS.map((id): CapsulePrize => {
    const c = COS_BY_ID.get(id)!;
    return { id, kind: 'cos', grade: c.grade, name: c.name, icon: c.icon };
  }),
  ...SKIN_KINDS.flatMap((k) => ([1, 2, 3] as const).map((n): CapsulePrize => ({
    id: `skin_${k.kind}_${n}`, kind: 'skin', grade: n, name: `${k.name} ${SKIN_COLORS[n]} 스킨`, icon: k.icon,
  }))),
  ...CAPSULE_FURNITURE.map((f): CapsulePrize => ({ id: f.id, kind: 'furniture', grade: f.grade, name: f.name, icon: f.icon })),
]);
export const CAPSULE_BY_ID = new Map(CAPSULE_POOL.map((p) => [p.id, p]));

/** 무게 표에서 하나(u ∈ [0,1)) */
function pick<T>(items: readonly T[], w: (t: T) => number, u: number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, w(it));
  let x = u * total;
  for (const it of items) { x -= Math.max(0, w(it)); if (x < 0) return it; }
  return items[items.length - 1];
}

export interface CapsuleRoll { prize: CapsulePrize; grade: CapsuleGrade; pityHit: boolean }

/**
 * 한 번 굴리기. since3 = 마지막 특별 뒤로 돌린 수(천장).
 * 난수 3개를 늘 같은 순서로 쓴다(등급 · 종류 · 상품).
 */
export function rollCapsule(rnd: () => number, since3: number, pool: readonly CapsulePrize[] = CAPSULE_POOL): CapsuleRoll {
  const uG = rnd(), uK = rnd(), uP = rnd();
  const pityHit = since3 >= CAPSULE_PITY;
  const grades = ([1, 2, 3] as const).filter((g) => pool.some((p) => p.grade === g));
  let grade: CapsuleGrade = pityHit && grades.includes(3) ? 3 : pick(grades, (g) => CAPSULE_GRADE_W[g], uG);
  const inGrade = pool.filter((p) => p.grade === grade);
  const kinds = (['cos', 'skin', 'furniture'] as const).filter((k) => inGrade.some((p) => p.kind === k));
  const kind = pick(kinds, (k) => CAPSULE_KIND_W[k], uK);
  const list = inGrade.filter((p) => p.kind === kind);
  const prize = list[Math.min(list.length - 1, Math.floor(uP * list.length))];
  grade = prize.grade;
  return { prize, grade, pityHit: pityHit && grade === 3 };
}

/** 한 상품이 나올 확률(천장 빼고) — 확률 공개표 */
export function capsuleChance(id: string, pool: readonly CapsulePrize[] = CAPSULE_POOL): number {
  const p = pool.find((x) => x.id === id);
  if (!p) return 0;
  const gTotal = ([1, 2, 3] as const).filter((g) => pool.some((x) => x.grade === g)).reduce((a, g) => a + CAPSULE_GRADE_W[g], 0);
  const inGrade = pool.filter((x) => x.grade === p.grade);
  const kinds = (['cos', 'skin', 'furniture'] as const).filter((k) => inGrade.some((x) => x.kind === k));
  const kTotal = kinds.reduce((a, k) => a + CAPSULE_KIND_W[k], 0);
  const same = inGrade.filter((x) => x.kind === p.kind).length;
  return (CAPSULE_GRADE_W[p.grade] / gTotal) * (CAPSULE_KIND_W[p.kind] / kTotal) / same;
}

/** 등급·종류별 확률 표(확률 공개) — [{grade, kind, pct, n}] */
export function capsuleOddsTable(pool: readonly CapsulePrize[] = CAPSULE_POOL): Array<{ grade: CapsuleGrade; kind: CapsuleKind; pct: number; n: number }> {
  const out: Array<{ grade: CapsuleGrade; kind: CapsuleKind; pct: number; n: number }> = [];
  for (const g of [1, 2, 3] as const) for (const k of ['cos', 'skin', 'furniture'] as const) {
    const items = pool.filter((p) => p.grade === g && p.kind === k);
    if (!items.length) continue;
    out.push({ grade: g, kind: k, n: items.length, pct: items.reduce((a, p) => a + capsuleChance(p.id, pool), 0) * 100 });
  }
  return out;
}

/** 이미 가진 의상·스킨이면 반짝별로 바꿔 줄 수(가구는 0 = 그대로 받는다) */
export const dupStars = (p: CapsulePrize, owned: boolean) => (owned && p.kind !== 'furniture' ? CAPSULE_DUP_STARS[p.grade] : 0);
export const KIND_NAME: Record<CapsuleKind, string> = { cos: '의상', skin: '탈것 스킨', furniture: '한정 가구' };
