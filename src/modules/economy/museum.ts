// 박물관 규칙(GDD 5.6·5.5) — 동 5개·동별 진행률·마일스톤(10/25/50/75/100%)·화석 골격(부위 3개). 부수효과 없는 순수 모듈.
// economy.ts 가 기증·골격 완성·마일스톤 보상을 실제로 반영하고, HUD 박물관 창은 econ.museum() 의 결과를 그린다.

/** 종 모양(박물관이 보는 것만) */
export interface MuseumSpecies { id: string; name?: string; category: string; rarity?: number; tags?: string[]; witness?: boolean; p1?: boolean }

export type WingId = 'aquarium' | 'sea' | 'bug' | 'fossil' | 'astro';
export interface WingDef { id: WingId; key: string; name: string; icon: string; cats: string[] }
/** 동 5개 — 수족관동(물고기)·해저관(바다)·곤충관·화석관(골격)·천문관(우주). 공룡은 기증하지 않는다 */
export const WINGS: readonly WingDef[] = [
  { id: 'aquarium', key: 'wing:aquarium', name: '수족관동', icon: '🐟', cats: ['fish'] },
  { id: 'sea', key: 'wing:sea', name: '해저관', icon: '🐙', cats: ['sea'] },
  { id: 'bug', key: 'wing:bug', name: '곤충관', icon: '🦋', cats: ['bug', 'insect'] },
  { id: 'fossil', key: 'wing:fossil', name: '화석관', icon: '🦴', cats: ['fossil'] },
  { id: 'astro', key: 'wing:astro', name: '천문관', icon: '🔭', cats: ['space'] },
];
export const WING_BY_ID = new Map(WINGS.map((w) => [w.id, w]));

/** 마일스톤: 진행률 % → 반짝별(+ 동 전용 가구) */
export const MILESTONES: ReadonlyArray<{ pct: number; stars: number }> = [
  { pct: 10, stars: 10 }, { pct: 25, stars: 25 }, { pct: 50, stars: 50 }, { pct: 75, stars: 80 }, { pct: 100, stars: 150 },
];
export const MILESTONE_PCTS = MILESTONES.map((m) => m.pct);
/** 동 전용 가구 — 마일스톤 순서대로 하나씩(이름은 tables.ts GOODS) */
export const WING_FURNITURE: Readonly<Record<WingId, readonly string[]>> = {
  aquarium: ['f_aq_bubblelamp', 'f_aq_fishmobile', 'f_aq_kelpcurtain', 'f_aq_whalesofa', 'f_aq_grandtank'],
  sea: ['f_sea_shellchair', 'f_sea_starrug', 'f_sea_anchorclock', 'f_sea_jellylamp', 'f_sea_shipwheel'],
  bug: ['f_bug_leafstool', 'f_bug_ladybuglamp', 'f_bug_honeyshelf', 'f_bug_butterflyscreen', 'f_bug_beetlethrone'],
  fossil: ['f_fos_bonestool', 'f_fos_ammonitelamp', 'f_fos_eggchair', 'f_fos_footrug', 'f_fos_trexmodel'],
  astro: ['f_astro_starlamp', 'f_astro_moonrug', 'f_astro_planetmobile', 'f_astro_telescope', 'f_astro_rocketbed'],
};

/** 화석 부위 — 머리(skull)·몸통·꼬리. 데이터가 'head' 로 적어도 같은 칸 */
export const FOSSIL_PARTS = ['skull', 'body', 'tail'] as const;
const PART_ALIAS: Record<string, string> = { head: 'skull' };

/** 화석 조각이면 {공룡, 부위} — 태그 fos:<공룡>:<부위> */
export function fossilPartOf(s: { tags?: string[] } | undefined | null): { dino: string; part: string } | null {
  for (const t of s?.tags ?? []) {
    const m = /^fos:([^:]+):([^:]+)$/.exec(t);
    if (m) return { dino: m[1], part: PART_ALIAS[m[2]] ?? m[2] };
  }
  return null;
}
/** 골격 종 id */
export const skeletonId = (dino: string) => `fos_${dino}`;

/** 이 종은 어느 동에 기증하나(기증 못 하면 null) — 재료·공룡·목격 종·탈것 줄은 안 된다 */
export function wingOf(s: MuseumSpecies | undefined | null): WingId | null {
  if (!s || s.category === 'item' || s.category === 'dino') return null;
  if (s.tags?.includes('vehicle')) return null;
  for (const w of WINGS) if (w.cats.includes(s.category)) return w.id;
  return null;
}

/** 공룡마다 등록된 부위(데이터에 없으면 기본 3부위) */
export function fossilSets(species: Iterable<MuseumSpecies>): Map<string, { parts: Map<string, string>; name?: string }> {
  const out = new Map<string, { parts: Map<string, string>; name?: string }>();
  for (const s of species) {
    const fp = fossilPartOf(s);
    if (!fp) continue;
    let e = out.get(fp.dino);
    if (!e) out.set(fp.dino, (e = { parts: new Map() }));
    e.parts.set(fp.part, s.id);
  }
  return out;
}

/** 부위를 다 기증했나 */
export function skeletonReady(parts: ReadonlyMap<string, string>, donated: (id: string) => boolean): boolean {
  const ids = parts.size ? [...parts.values()] : [];
  if (ids.length < FOSSIL_PARTS.length) return false;
  return ids.every((id) => donated(id));
}

/** 동 하나의 전시 칸 — 박물관에 세는 종(P1·목격 종·화석 조각 제외. 화석관은 골격만) */
export function wingExhibits(w: WingDef, species: Iterable<MuseumSpecies>, skeletonDinos: Iterable<string> = []): string[] {
  const ids = new Set<string>();
  for (const s of species) {
    if (!w.cats.includes(s.category) || s.p1 || s.witness || s.tags?.includes('vehicle')) continue;
    // 화석관은 골격 칸만(20칸, 5.5·5.6) — 조각도, 골격 태그 없는 옛 화석도 세지 않는다
    if (w.id === 'fossil' && (fossilPartOf(s) || !s.tags?.includes('skeleton'))) continue;
    ids.add(s.id);
  }
  // 화석관: 골격 종이 아직 등록 안 됐어도 조각 데이터가 있으면 칸을 센다
  if (w.id === 'fossil') for (const d of skeletonDinos) ids.add(skeletonId(d));
  return [...ids];
}

/** 진행률에 닿은 마일스톤 % */
export function reachedMilestones(got: number, total: number): number[] {
  if (!(total > 0)) return [];
  const pct = (got / total) * 100;
  return MILESTONE_PCTS.filter((m) => pct + 1e-9 >= m);
}

/**
 * 새로 받을 마일스톤(이미 받은 건 빼고) — 순서대로 {pct, stars, furniture}.
 * 받은 기록(awarded)은 부르는 쪽이 저장한다.
 */
export function newMilestones(w: WingId, got: number, total: number, awarded: readonly number[]): Array<{ pct: number; stars: number; furniture: string }> {
  const reached = reachedMilestones(got, total);
  const out: Array<{ pct: number; stars: number; furniture: string }> = [];
  MILESTONES.forEach((m, i) => {
    if (reached.includes(m.pct) && !awarded.includes(m.pct)) out.push({ pct: m.pct, stars: m.stars, furniture: WING_FURNITURE[w][i] });
  });
  return out;
}
