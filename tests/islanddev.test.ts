// islanddev — 단계 조건·비용(P0/정식), 기부 → 해금·이벤트·상자 구역·정류장, 빠른 이동 정류장 추가/이동, 섬 별점 공식,
// 다시 불러와도 같은 상태(멱등), 마당 격자·겹침, 단계별 새 생물 표 모양, 지름길 찾기.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import * as Island from '../src/core/island';
import { rngFor } from '../src/core/rng';
import type { EconApi } from '../src/core/api';
import buildIslandDev from '../src/modules/islanddev';
import {
  DEV_ISLANDS, DEV_SPECIES, STAGE_COST, YARD_DEFS, devKey, parseDevKey, specialtyIds, facilitiesOf, chestAreaId, type DevIsland,
} from '../src/modules/islanddev/data';
import {
  requirementFor, coinCost, specialtyNeed, pickSpecialty, reqProgress, islandRating, decoScore, decoPct, islandDexPct, TravelNet,
  normalizeFlags, canPlace, cellsOf, footprint, snapCell, pieceAtCell, yardToWorld, worldToYard, devSpeciesProblems, riverSpan, gapSpans,
  pierSpan, starText, type ReqEnv, type YardPiece, type TerrainProbe,
} from '../src/modules/islanddev/logic';

// ───────────── 가짜 econ(해금·지갑·상자 구역 기록) ─────────────
function fakeEcon(game: FakeGame, o: { p0?: boolean } = {}) {
  const st = game.state;
  const f = ((st.flags.econ ??= {}) as { unlocks?: string[]; stars?: number });
  f.unlocks ??= [];
  f.stars ??= 0;
  const areas: Array<{ id: string; island: string; x: number; z: number; r: number; n: number; tier?: string }> = [];
  const econ = {
    p0: o.p0 ?? false, cheat: false,
    flags: () => f,
    day: () => 0,
    isUnlocked: (k: string) => f.unlocks!.includes(k),
    unlock: (k: string, why = '') => { if (f.unlocks!.includes(k)) return; f.unlocks!.push(k); st.save(); st.emit({ type: 'unlock', key: k, why }); },
    canAfford: (c: { coins?: number; items?: Record<string, number> }) => st.coins >= (c.coins ?? 0) && Object.entries(c.items ?? {}).every(([k, n]) => st.has(k, n)),
    spend: (c: { coins?: number; items?: Record<string, number> }, why = '') => {
      if (!econ.canAfford(c)) return false;
      if (c.coins) st.addCoins(-c.coins, why);
      for (const [k, n] of Object.entries(c.items ?? {})) st.addItem(k, -n);
      return true;
    },
    give: (id: string, n: number) => { st.addItem(id, n); return n; },
    addStars: (n: number) => { f.stars! += n; },
    addKeyPiece: () => { /* 기록 안 함 */ },
    priceOf: () => 100,
    isDonated: () => false,
    addChestArea: (a: (typeof areas)[number]) => { const i = areas.findIndex((q) => q.id === a.id); if (i >= 0) areas[i] = a; else areas.push(a); return a.n; },
  };
  game.econ = econ as unknown as EconApi;
  return { econ, areas, f };
}

type Hooks = {
  state(): { stage: Record<string, number>; nodes: Array<{ id: string }>; riding: boolean };
  invest(isl: string): boolean;
  travel: { nodes(): Array<{ id: string; kind: string }>; go(id: string): boolean; add(id: string, x: number, z: number, kind?: string, label?: string): unknown };
  place(k: string, isl: string, cx: number, cz: number, r?: number, item?: string): boolean;
};
const hooks = () => (globalThis as unknown as { __islanddev: Hooks }).__islanddev;

function boot(o: { p0?: boolean; species?: boolean } = {}) {
  const game = makeFakeGame({ day: 0, hour: 10 });
  const E = fakeEcon(game, o);
  if (o.species !== false) {
    // 새 생물 잠그기 확인용 — 데이터 주인이 아직 where.dev 를 안 단 종
    game.state.register([{ id: 'fish-jara', gdd: 'f_softshell', name: '자라', category: 'fish', rarity: 2, where: [{ island: 'home', zone: 'pond' }] }]);
  }
  const ctx = makeCtx(game);
  const rec = recordEvents(game);
  buildIslandDev(ctx as never);
  return { game, ctx, rec, ...E };
}

// ───────────── 단계 조건과 비용 ─────────────
const env = (o: Partial<ReqEnv> & { bag?: Record<string, number> } = {}): ReqEnv => ({
  p0: false, coins: 0, specialty: ['m_petal', 'm_honey'], dexPct: 0, stars: 1, reqDone: 0,
  count: (id) => o.bag?.[id] ?? 0, ...o,
});

describe('단계 조건 · 비용', () => {
  it('① 등대: 정식 20,000 + 키트, P0 는 코인 1/5', () => {
    expect(coinCost(1, false)).toBe(20000);
    expect(coinCost(1, true)).toBe(4000);
    expect(coinCost(2, false)).toBe(STAGE_COST[2].coins);
    expect(coinCost(3, true)).toBe(16000);
    const r = requirementFor('home', 0, env({ coins: 19999, bag: { it_lighthouse_kit: 1 } }));
    expect(r.n).toBe(1);
    expect(r.ok).toBe(false);
    const ok = requirementFor('home', 0, env({ coins: 20000, bag: { it_lighthouse_kit: 1 } }));
    expect(ok.ok).toBe(true);
    expect(ok.cost).toEqual({ coins: 20000, items: { it_lighthouse_kit: 1 } });
  });
  it('② 다리 키트 2개가 있어야', () => {
    expect(requirementFor('coral', 1, env({ coins: 1e6, bag: { it_bridge_kit: 1 } })).ok).toBe(false);
    const r = requirementFor('coral', 1, env({ coins: 1e6, bag: { it_bridge_kit: 2 } }));
    expect(r.ok).toBe(true);
    expect(r.cost.items).toEqual({ it_bridge_kit: 2 });
  });
  it('③ 섬 특산 재료 20(P0 4) — 싼 것부터 섞어 고른다', () => {
    expect(specialtyNeed(false)).toBe(20);
    expect(specialtyNeed(true)).toBe(4);
    expect(specialtyIds('home').sort()).toEqual(['m_honey', 'm_petal']);
    expect(specialtyIds('mushroom')).toEqual(['m_glowcap']);
    const price = (id: string) => (id === 'm_honey' ? 200 : 15);
    expect(pickSpecialty((id) => ({ m_petal: 12, m_honey: 30 } as Record<string, number>)[id] ?? 0, ['m_honey', 'm_petal'], 20, price)).toEqual({ m_petal: 12, m_honey: 8 });
    expect(pickSpecialty(() => 3, ['m_petal'], 20)).toBeNull();
    const r = requirementFor('home', 2, env({ coins: 80000, bag: { m_petal: 12, m_honey: 30 } }), price);
    expect(r.ok).toBe(true);
    expect(r.cost).toEqual({ coins: 80000, items: { m_petal: 12, m_honey: 8 } });
    expect(requirementFor('home', 2, env({ coins: 80000, bag: { m_petal: 19 } })).ok).toBe(false);
  });
  it('④ 이 섬 주민 부탁 2번 또는 초대권 1장(초대권만 낸다)', () => {
    expect(requirementFor('dino', 3, env()).ok).toBe(false);
    const byReq = requirementFor('dino', 3, env({ reqDone: 2 }));
    expect(byReq.ok).toBe(true);
    expect(byReq.cost).toEqual({});
    const byInv = requirementFor('dino', 3, env({ reqDone: 1, bag: { it_invite: 1 } }));
    expect(byInv.ok).toBe(true);
    expect(byInv.cost).toEqual({ items: { it_invite: 1 } });
    expect(requirementFor('dino', 3, env({ p0: true, reqDone: 1 })).ok).toBe(true);
  });
  it('⑤ 섬 도감 80% + 별점 5', () => {
    expect(requirementFor('ice', 4, env({ dexPct: 85, stars: 4 })).ok).toBe(false);
    expect(requirementFor('ice', 4, env({ dexPct: 79, stars: 5 })).ok).toBe(false);
    expect(requirementFor('ice', 4, env({ dexPct: 80, stars: 5 })).ok).toBe(true);
    expect(requirementFor('ice', 5, env()).n).toBeNull();
  });
  it('진행 막대: 또는 줄은 큰 쪽만', () => {
    const r = requirementFor('dino', 3, env({ reqDone: 1, bag: {} }));
    expect(reqProgress(r)).toBeCloseTo(0.5);
  });
});

// ───────────── 섬 별점 ─────────────
describe('섬 별점 공식', () => {
  it('점수 = 도감% × 0.6 + 꾸미기% × 0.4 → 별 1~5', () => {
    expect(islandRating(0, 0)).toEqual({ score: 0, stars: 1 });
    expect(islandRating(100, 40).stars).toBe(5);
    expect(islandRating(80, 0).score).toBeCloseTo(48);
    expect(islandRating(80, 0).stars).toBe(3);
    // 도감 80% 에 꾸미기 80%(32점) 이면 딱 별 5
    expect(decoPct(32)).toBeCloseTo(80);
    expect(islandRating(80, 32).stars).toBe(5);
    expect(islandRating(80, 31).stars).toBe(4);
    expect(islandRating(33.4, 0).stars).toBe(2);
    expect(starText(3)).toBe('★★★☆☆');
  });
  it('꾸미기 점수: 조각 + 연못 물고기 + 반딧불 + 아기 공룡 + 다양성', () => {
    const P = (k: YardPiece['k'], extra: Partial<YardPiece> = {}): YardPiece => ({ id: 1, k, cx: 0, cz: 0, r: 0, ...extra });
    expect(decoScore([P('fence', { id: 1 }), P('fence', { id: 2 })])).toBe(2);
    const pond = P('pond', { id: 3, fish: ['a', 'b', 'c'] });
    expect(decoScore([pond])).toBe(YARD_DEFS.pond.pts + 3);
    const mix = [P('fence', { id: 1 }), pond, P('dinofence', { id: 4 }), P('furn', { id: 5, item: 'f_rainbowlamp' })];
    const base = 1 + (5 + 3) + 6 + (4 + 2) + 3 * 2;
    expect(decoScore(mix)).toBe(base);
    expect(decoScore(mix, { dinoFriend: true })).toBe(base + 3);
    expect(decoScore(mix, { bonus: 4 })).toBe(base + 4);
  });
  it('섬 도감 %: 그 섬 줄이 있는 생물만, 재료·P1 빼고', () => {
    const sp = [
      { id: 'a', category: 'fish', where: [{ island: 'home' }] },
      { id: 'b', category: 'bug', where: [{ island: 'home' }, { island: 'coral' }] },
      { id: 'c', category: 'fish', where: [{ island: 'coral' }] },
      { id: 'd', category: 'item', where: [{ island: 'home' }] },
      { id: 'e', category: 'fish', p1: true, where: [{ island: 'home' }] },
    ];
    expect(islandDexPct('home', sp, (id) => id === 'a')).toEqual({ got: 1, total: 2, pct: 50 });
    expect(islandDexPct('coral', sp, () => true).pct).toBe(100);
  });
});

// ───────────── 정류장 ─────────────
describe('빠른 이동 정류장(순수)', () => {
  it('같은 id 는 바꿔 끼우고, 집 → 등대 → 부표 순', () => {
    const list: never[] = [];
    const n = new TravelNet(list);
    n.add({ id: 'buoy-1', x: 800, z: -480, kind: 'buoy', label: '부표 ①' });
    n.add({ id: 'lh:coral', x: 640, z: 1089, kind: 'lighthouse', label: '산호빛섬 등대' });
    n.add({ id: 'home', x: 0, z: 0, kind: 'home', label: '집' });
    n.add({ id: 'buoy-1', x: 801, z: -481, kind: 'buoy', label: '부표 ①' });
    expect(list.length).toBe(3);
    expect(n.all().map((q) => q.id)).toEqual(['home', 'lh:coral', 'buoy-1']);
    expect(n.get('buoy-1')!.x).toBe(801);
    expect(n.nearest(630, 1080)!.id).toBe('lh:coral');
    expect(n.nearest(630, 1080, 5)).toBeNull();
    expect(n.remove('buoy-1')).toBe(true);
    expect(n.has('buoy-1')).toBe(false);
  });
});

// ───────────── 마당 격자 ─────────────
describe('마당 격자(0.5 m)', () => {
  it('돌림 · 칸 · 겹침 · 마당 밖', () => {
    expect(footprint('fence', 0)).toEqual({ w: 2, d: 1 });
    expect(footprint('fence', 1)).toEqual({ w: 1, d: 2 });
    expect(cellsOf({ k: 'pond', cx: 0, cz: 0, r: 0 }).length).toBe(16);
    const pieces: YardPiece[] = [{ id: 1, k: 'pond', cx: 0, cz: 0, r: 0 }];
    expect(canPlace(pieces, { k: 'fence', cx: 3, cz: 3, r: 0 })).toMatchObject({ ok: false, why: 'overlap' });
    expect(canPlace(pieces, { k: 'fence', cx: 4, cz: 0, r: 0 }).ok).toBe(true);
    expect(canPlace(pieces, { k: 'dinofence', cx: 8, cz: 0, r: 0 })).toMatchObject({ ok: false, why: 'bounds' });
    expect(canPlace(pieces, { k: 'fence', cx: -6, cz: -6, r: 0 }, () => false)).toMatchObject({ ok: false, why: 'ground' });
    expect(pieceAtCell(pieces, 2, 3)?.id).toBe(1);
    expect(snapCell(1, 1, 'pond', 0)).toEqual({ cx: 0, cz: 0 });
  });
  it('마당 로컬 ↔ 월드는 서로 되돌린다', () => {
    const o = { x: 40, z: -70, rot: Math.PI / 2 };
    const w = yardToWorld(o, 2, -3);
    const back = worldToYard(o, w.x, w.z);
    expect(back.x).toBeCloseTo(2);
    expect(back.z).toBeCloseTo(-3);
  });
});

// ───────────── 데이터 모양 ─────────────
describe('단계별 새 생물 표(DEV_SPECIES)', () => {
  it('섬 7 × 단계 5, GDD id 모양, 겹침 없음, 키 dev:<섬>:<n>', () => {
    expect(devSpeciesProblems()).toEqual([]);
    for (const isl of DEV_ISLANDS) for (const n of [1, 2, 3, 4, 5] as const) {
      expect(DEV_SPECIES[isl][n]).toMatch(/^[fb]_[a-z0-9_]+$/);
      expect(parseDevKey(devKey(isl, n))).toEqual({ island: isl, n });
    }
    expect(parseDevKey('dev:islet-a:1')).toBeNull();
    expect(parseDevKey('dev:home:6')).toBeNull();
    expect(facilitiesOf('ice').map((f) => f.id)).toEqual(['iceHut', 'skiLift']);
    expect(facilitiesOf('mushroom').map((f) => f.id)).toEqual(['fireflyGarden', 'potionShop']);
  });
  it('저장 고치기: 이상한 값은 버린다', () => {
    const flags: Record<string, unknown> = { dev: { stage: { home: 9, nope: 2, coral: -1 }, travel: { nodes: [{ id: 'a', x: 1, z: 2 }, { id: 3 }] }, yard: { home: [{ k: 'fence', cx: 0, cz: 0, r: 7 }, { k: 'xx', cx: 0, cz: 0 }] } } };
    const f = normalizeFlags(flags);
    expect(f.stage).toEqual({ home: 5 });
    expect(f.travel.nodes).toEqual([{ id: 'a', x: 1, z: 2, kind: 'station', label: 'a' }]);
    expect(f.yard.home).toEqual([{ id: 1, k: 'fence', cx: 0, cz: 0, r: 3 }]);
  });
});

// ───────────── 지름길 ─────────────
describe('지름길(다리·부두) 찾기', () => {
  const H = Island.heightAt;
  const probe = (isl: string): TerrainProbe => ({
    h: H, water: (x, z) => Island.waterLevelAt(x, z),
    dry: (x, z) => H(x, z) > 0.3 && !Number.isFinite(Island.waterLevelAt(x, z)) && Island.islandAt(x, z)?.id === isl,
  });
  it('말랑섬 강 위 다리는 양쪽 마른 둑에 닿는다', () => {
    const rv = Island.worldRivers().filter((r) => r.island === 'home').sort((a, b) => b.pts.length - a.pts.length)[0];
    const T = probe('home');
    const s = riverSpan(rv.pts, rv.halfW, 0.38, T)!;
    expect(s).not.toBeNull();
    expect(T.dry(s.ax, s.az) && T.dry(s.bx, s.bz)).toBe(true);
    expect(Math.hypot(s.bx - s.ax, s.bz - s.az)).toBeLessThanOrEqual(34);
    expect(s.y).toBeGreaterThan(Math.max(H(s.ax, s.az), H(s.bx, s.bz)));
  });
  it('부두는 땅에서 바다로, 골짜기 다리는 같은 rng 면 같은 자리', () => {
    const d = Island.islandById('coral')!;
    const lh = (Island.PLACES.lighthouses as Record<string, { x: number; z: number }>).coral;
    const p = pierSpan(lh, d, probe('coral'), 16)!;
    expect(p.kind).toBe('pier');
    expect(H(p.bx, p.bz)).toBeLessThan(-1);
    const a = gapSpans({ x: d.x, z: d.z, r: d.r }, probe('coral'), rngFor('t:gap'), { count: 2, tries: 300 });
    const b = gapSpans({ x: d.x, z: d.z, r: d.r }, probe('coral'), rngFor('t:gap'), { count: 2, tries: 300 });
    expect(a).toEqual(b);
  });
});

// ───────────── 모듈: 기부 · 정류장 · 다시 불러오기 ─────────────
describe('islanddev 모듈', () => {
  beforeEach(() => { stubLocalStorage(); });

  it('① 기부: 돈·키트를 쓰고 해금 + 이벤트 + 상자 구역 + 등대 정류장', () => {
    const { game, rec, areas, f } = boot();
    const H = hooks();
    game.state.addCoins(25000);
    game.state.addItem('it_lighthouse_kit', 1);
    expect(H.invest('coral')).toBe(true);
    expect(game.state.coins).toBe(5000);
    expect(game.state.has('it_lighthouse_kit')).toBe(false);
    expect(f.unlocks).toEqual(expect.arrayContaining(['dev:coral:1', 'lighthouse:coral']));
    expect(rec.of('dev-stage')).toEqual([expect.objectContaining({ island: 'coral', stage: 1 })]);
    expect(rec.of('lighthouse')).toEqual([expect.objectContaining({ island: 'coral', lit: true })]);
    expect(areas.map((a) => a.id)).toContain(chestAreaId('coral', 1));
    expect(H.travel.nodes().map((n) => n.id)).toEqual(expect.arrayContaining(['home', 'lh:coral']));
    // 돈이 모자라면 아무것도 안 바뀐다
    expect(H.invest('coral')).toBe(false);
    expect(H.state().stage.coral).toBe(1);
  });

  it('등대 4곳이면 facility:launch, ③ 은 섬 시설 해금', () => {
    const { game, f } = boot();
    const H = hooks();
    for (const isl of ['home', 'coral', 'mushroom', 'dino'] as DevIsland[]) {
      game.state.addCoins(20000);
      game.state.addItem('it_lighthouse_kit', 1);
      expect(H.invest(isl)).toBe(true);
    }
    expect(f.unlocks).toContain('facility:launch');
    game.state.addCoins(30000 + 80000);
    game.state.addItem('it_bridge_kit', 2);
    game.state.addItem('m_glowcap', 20);
    expect(H.invest('mushroom')).toBe(true);
    expect(H.invest('mushroom')).toBe(true);
    expect(f.unlocks).toEqual(expect.arrayContaining(['dev:mushroom:3', 'facility:fireflyGarden', 'facility:potionShop']));
    expect(game.state.bag.m_glowcap ?? 0).toBe(0);
  });

  it('새 생물: 데이터에 where.dev 가 없으면 그 섬 줄에 단다', () => {
    const { game } = boot();
    expect(game.state.species.get('fish-jara')!.where![0].dev).toBe('dev:home:1');
  });

  it('정류장: 다른 모듈이 addNode → 저장, go 는 비눗방울 타고 도착', () => {
    const { game } = boot();
    const T = game.ext.travel as { addNode: Function; nodes: () => Array<{ id: string; kind: string }>; go: (id: string) => boolean; riding: () => boolean };
    T.addNode('buoy-2', 450, 760, 'buoy', '부표 ②');
    T.addNode('buoy-2', 450, 760, 'buoy', '부표 ②');
    expect(T.nodes().filter((n) => n.id === 'buoy-2').length).toBe(1);
    expect((game.state.flags.dev as { travel: { nodes: Array<{ id: string }> } }).travel.nodes.some((n) => n.id === 'buoy-2')).toBe(true);
    expect(T.go('nope')).toBe(false);
    expect(T.go('buoy-2')).toBe(true);
    expect(T.riding()).toBe(true);
    expect(game.player.locked).toBe(true);
    game.tick(1 / 30, 200);
    expect(T.riding()).toBe(false);
    expect(game.player.locked).toBe(false);
    expect(game.player.mounted).toBeNull();
    expect(Math.hypot(game.player.pos.x - 450, game.player.pos.z - 760)).toBeLessThan(1);
  });

  it('다시 불러오기: 단계·정류장·마당은 그대로, 이벤트·보상은 다시 안 나온다', () => {
    const a = boot();
    const H = hooks();
    a.game.state.addCoins(20000);
    a.game.state.addItem('it_lighthouse_kit', 1);
    expect(H.invest('dino')).toBe(true);
    expect(H.place('fence', 'dino', 0, 0)).toBe(true);
    const nodes = H.travel.nodes().length;
    a.game.state.saveNow();
    a.game.dispose();

    const b = boot();
    const H2 = hooks();
    expect(H2.state().stage.dino).toBe(1);
    expect(H2.travel.nodes().length).toBe(nodes);
    expect((b.game.state.flags.dev as { yard: Record<string, unknown[]> }).yard.dino.length).toBe(1);
    expect(b.rec.of('dev-stage')).toEqual([]);
    expect(b.rec.of('lighthouse')).toEqual([]);
    // 상자 구역은 econ 이 기억하지 않으니 다시 깐다(같은 id)
    expect(b.areas.map((x) => x.id)).toEqual([chestAreaId('dino', 1)]);
    // 같은 단계를 다시 적용해도 해금 키는 하나씩
    expect(b.f.unlocks!.filter((k) => k === 'dev:dino:1').length).toBe(1);
  });

  it('④ 이주: 이 섬 주민 부탁을 세고, moveIn 이 생기면 한 번만 부른다', () => {
    const { game } = boot({ p0: true });
    const calls: Array<[string, string]> = [];
    game.ext.npc = {
      list: () => [{ id: 'pengdal', island: 'dino', kind: 'resident' }, { id: 'nabi', island: 'home', kind: 'resident' }],
      name: (id: string) => id,
    };
    const H = hooks();
    (game.state.flags.dev as { stage: Record<string, number> }).stage.dino = 3;
    game.state.emit({ type: 'request-done', id: 'r1', coins: 10, npc: 'pengdal' });
    game.state.emit({ type: 'request-done', id: 'r2', coins: 10, npc: 'nabi' });
    expect((game.state.flags.dev as { req: Record<string, number> }).req).toEqual({ dino: 1, home: 1 });
    expect(H.invest('dino')).toBe(true);
    expect(H.state().stage.dino).toBe(4);
    // moveIn 이 아직 없으면 기다린다
    game.tick(1 / 30, 90);
    expect((game.state.flags.dev as { moveIn: Record<string, { done: boolean }> }).moveIn.dino.done).toBe(false);
    (game.ext.npc as { moveIn?: (id: string, isl: string) => boolean }).moveIn = (id, isl) => { calls.push([id, isl]); return true; };
    game.tick(1 / 30, 90);
    game.tick(1 / 30, 90);
    expect(calls).toEqual([['nabi', 'dino']]);
  });

  it('⑤ 보상은 한 번만: 섬 전용 가구 + 반짝별', () => {
    const { game, f } = boot();
    const H = hooks() as Hooks & { stage(isl: string, n: number): number };
    H.stage('home', 5);
    expect(game.state.has('f_rainbowlamp')).toBe(true);
    expect(f.stars).toBe(50);
    H.stage('home', 5);
    expect(game.state.bag.f_rainbowlamp).toBe(1);
    expect(f.unlocks).toEqual(expect.arrayContaining(['dev:home:5', 'facility:apiary']));
  });

  it('③ 다이빙 센터 단골 할인: 산 뒤 20% 를 돌려준다(시설 전엔 없음)', () => {
    const { game } = boot();
    const H = hooks() as Hooks & { stage(isl: string, n: number): number };
    game.state.emit({ type: 'buy', id: 'shop_snorkel', n: 1, cost: { coins: 3000 } });
    expect(game.state.coins).toBe(0);
    H.stage('coral', 3);
    game.state.emit({ type: 'buy', id: 'shop_snorkel', n: 1, cost: { coins: 3000 } });
    expect(game.state.coins).toBe(600);
    expect((game.ext.dev as { discount(s: string): number }).discount('diving')).toBeCloseTo(0.2);
  });

  it('econ 에 이미 열린 dev 키가 있으면 단계를 맞춘다', () => {
    const game = makeFakeGame({ day: 0, hour: 10 });
    const E = fakeEcon(game);
    E.f.unlocks!.push('dev:desert:2');
    buildIslandDev(makeCtx(game) as never);
    expect(hooks().state().stage.desert).toBe(2);
    expect(E.f.unlocks).toEqual(expect.arrayContaining(['dev:desert:1', 'lighthouse:desert']));
  });
});
