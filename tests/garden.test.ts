// garden — 물 준 날만큼 자라기(꽃 3단계·사과 5일), 비, 결정적 교배·황금장미 1%, 민들레 → 다음 날 들꽃,
// 네잎클로버 0.5%, 섬마다 큰 바위 3개(마른 땅·길목 밖), 과일 힘, 회전초 바람, 모듈 띄워서 심기·물주기·흔들기·바위·클로버.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import * as Island from '../src/core/island';
import { DAY_SEC, type EconApi } from '../src/core/api';
import buildGarden from '../src/modules/garden';
import {
  APPLE_DAYS, BLOOM, BOULDER_ISLANDS, CLOVER, GOLDEN_CHANCE, BREED_CHANCE, POWER_MAX, WILD_MAX, BOULDER,
} from '../src/modules/garden/data';
import {
  normalizeFlags, plant, waterAt, rainWater, advanceDays, breedPair, pickPetals, shakeTree, hasApples, canPlant, cellFree,
  fourLeafSprigs, boulderSpots, boulderUp, addPower, spendPower, windAt, spawnTumble, stepTumble, wildChunk, gardenSoil, islandProbe,
  type GardenFlags, type Plot,
} from '../src/modules/garden/logic';
import { rngFor } from '../src/core/rng';

const ok = () => true;
const fresh = (day = 0): GardenFlags => normalizeFlags({}, day);

describe('garden logic — 자라기', () => {
  it('꽃은 물 준 날마다 한 단계, 3단계(새싹→봉오리→활짝)에서 멈춘다', () => {
    const F = fresh(0);
    const p = plant(F, 'seed_tulip', 0, 0, 0);
    expect(p.stage).toBe(0);
    // 물 안 준 날은 안 자란다
    advanceDays(F, 1, ok);
    expect(p.stage).toBe(0);
    waterAt(F, 0, 0, 1);
    advanceDays(F, 2, ok);
    expect(p.stage).toBe(1);
    waterAt(F, 0, 0, 2);
    advanceDays(F, 3, ok);
    expect(p.stage).toBe(BLOOM);
    waterAt(F, 0, 0, 3);
    advanceDays(F, 4, ok);
    expect(p.stage).toBe(BLOOM);
  });
  it('사과 묘목은 물 먹은 날 5번이면 열매 나무 — 하루 한 번 흔들면 사과', () => {
    const F = fresh(0);
    const t = plant(F, 'seed_apple', 10, 10, 0);
    for (let d = 0; d < APPLE_DAYS; d++) {
      expect(t.stage).toBe(d);
      waterAt(F, 10, 10, d);
      advanceDays(F, d + 1, ok);
    }
    expect(t.stage).toBe(APPLE_DAYS);
    expect(hasApples(t, 5)).toBe(true);
    expect(shakeTree(F, t.id, 5, 3)).toBe(3);
    expect(shakeTree(F, t.id, 5, 3)).toBe(0);
    expect(hasApples(t, 6)).toBe(true);
    // 다 자란 나무는 물이 필요 없다
    expect(waterAt(F, 10, 10, 6)).toEqual([]);
  });
  it('비가 오면 그날 전부 물 먹은 것으로 친다', () => {
    const F = fresh(3);
    const a = plant(F, 'seed_tulip', 0, 0, 3), b = plant(F, 'seed_sunflower', 5, 5, 3);
    expect(rainWater(F, 3)).toBe(2);
    expect(rainWater(F, 3)).toBe(0);
    advanceDays(F, 4, ok);
    expect(a.stage).toBe(1);
    expect(b.stage).toBe(1);
  });
  it('물뿌리개는 둘레 3×3 칸을 적신다', () => {
    const F = fresh(0);
    for (let x = -2; x <= 2; x++) plant(F, 'seed_tulip', x, 0, 0);
    expect(waterAt(F, 0, 0, 0).length).toBe(3);
  });
  it('오래 쉬다 와도 물 안 준 날은 안 자란다(따라잡기 한도)', () => {
    const F = fresh(0);
    const p = plant(F, 'seed_tulip', 0, 0, 0);
    waterAt(F, 0, 0, 0);
    advanceDays(F, 100, ok);
    expect(p.stage).toBe(1);
    expect(F.day).toBe(100);
  });
  it('칸 겹침·사과나무 둘레', () => {
    const F = fresh(0);
    plant(F, 'seed_apple', 0, 0, 0);
    expect(cellFree(F, 0, 0)).toBe(false);
    expect(cellFree(F, 1, 0)).toBe(false);
    expect(cellFree(F, 2, 0)).toBe(true);
    expect(canPlant(F, 'seed_tulip', 1, 0, ok).ok).toBe(false);
    expect(canPlant(F, 'seed_tulip', 3, 0, () => false).ok).toBe(false);
    expect(canPlant(F, 'seed_tulip', 3, 0, ok).ok).toBe(true);
    expect(canPlant(F, 'm_wood', 3, 0, ok).ok).toBe(false);
  });
  it('저장값이 깨져도 고쳐서 읽고, 고친 걸 다시 넣어도 같다', () => {
    const raw = { day: 4, plots: [{ id: 'p3', kind: 'tulip', x: 1, z: 2, stage: 9, color: 'red' }, { id: 'p3', kind: 'tulip', x: 0, z: 0 }, { kind: 'cactus' }, null], power: 99, blown: { a: { d: 1 } } };
    const F = normalizeFlags(raw, 0);
    expect(F.plots.length).toBe(1);
    expect(F.plots[0].stage).toBe(BLOOM);
    expect(F.power).toBe(POWER_MAX);
    expect(F.seq).toBe(3);
    expect(Object.keys(F.blown)).toEqual([]);
    expect(normalizeFlags(JSON.parse(JSON.stringify(F)))).toEqual(F);
  });
});

describe('garden logic — 교배', () => {
  const bloom = (F: GardenFlags, kind: Plot['kind'], color: string, x: number, z: number) => {
    const p = plant(F, kind === 'tulip' ? 'seed_tulip' : 'seed_sunflower', x, z, 0);
    p.kind = kind; p.color = color; p.stage = BLOOM;
    return p;
  };
  it('같은 날·같은 두 송이면 늘 같은 결과(결정적)', () => {
    const a = { id: 'p1', kind: 'tulip' as const, color: 'red' }, b = { id: 'p2', kind: 'tulip' as const, color: 'yellow' };
    for (let d = 0; d < 50; d++) expect(breedPair(a, b, d)).toEqual(breedPair(b, a, d));
  });
  it('빨강 × 노랑 튤립 → 주황, 튤립 × 해바라기 → 장미', () => {
    let seen = 0;
    for (let d = 0; d < 200; d++) {
      const r = breedPair({ id: 'a', kind: 'tulip', color: 'red' }, { id: 'b', kind: 'tulip', color: 'yellow' }, d);
      if (r && !r.gold) { expect(r).toMatchObject({ kind: 'tulip', color: 'orange', hybrid: true }); seen++; }
      const q = breedPair({ id: 'a', kind: 'tulip', color: 'pink' }, { id: 'b', kind: 'sunflower', color: 'yellow' }, d);
      if (q && !q.gold) expect(q).toMatchObject({ kind: 'rose', color: 'pink' });
    }
    expect(seen).toBeGreaterThan(40);
  });
  it('교배 성공률 ≈ 35%, 그중 황금장미 ≈ 1%', () => {
    let ok2 = 0, gold = 0;
    const N = 60000;
    for (let i = 0; i < N; i++) {
      const r = breedPair({ id: `a${i}`, kind: 'tulip', color: 'red' }, { id: `b${i}`, kind: 'tulip', color: 'white' }, i % 97);
      if (!r) continue;
      ok2++;
      if (r.gold) { gold++; expect(r).toMatchObject({ kind: 'rose', color: 'gold' }); }
    }
    expect(ok2 / N).toBeGreaterThan(BREED_CHANCE - 0.015);
    expect(ok2 / N).toBeLessThan(BREED_CHANCE + 0.015);
    expect(gold / ok2).toBeGreaterThan(GOLDEN_CHANCE * 0.6);
    expect(gold / ok2).toBeLessThan(GOLDEN_CHANCE * 1.4);
  });
  it('황금색은 교배로 물려주지 않는다', () => {
    for (let d = 0; d < 400; d++) {
      const r = breedPair({ id: 'g', kind: 'rose', color: 'gold' }, { id: 'h', kind: 'rose', color: 'gold' }, d);
      if (r && r.color === 'gold') expect(r.gold).toBe(true);
    }
  });
  it('이웃한 활짝 핀 두 송이가 물 먹으면 다음 날 빈 칸에 꽃 — 두 번 계산해도 같은 자리·색', () => {
    const run = () => {
      const F = fresh(0);
      bloom(F, 'tulip', 'red', 0, 0); bloom(F, 'tulip', 'yellow', 1, 0);
      const out: Array<{ d: number; kind: string; color: string; x: number; z: number }> = [];
      for (let d = 0; d < 40; d++) {
        waterAt(F, 0.5, 0, d, 0.6);
        const rep = advanceDays(F, d + 1, ok);
        for (const c of rep.bred) out.push({ d, kind: c.kind, color: c.color, x: c.x, z: c.z });
      }
      return { out, F };
    };
    const A = run(), B = run();
    expect(A.out.length).toBeGreaterThan(0);
    expect(A.out).toEqual(B.out);
    for (const c of A.out) expect(Math.max(Math.abs(c.x - 0), Math.abs(c.x - 1))).toBeLessThanOrEqual(2);
    // 새 꽃은 바로 활짝, 칸은 겹치지 않는다
    const cells = new Set(A.F.plots.map((p) => `${p.x},${p.z}`));
    expect(cells.size).toBe(A.F.plots.length);
  });
  it('물을 하나라도 안 먹었거나 멀면 교배 없음', () => {
    const F = fresh(0);
    bloom(F, 'tulip', 'red', 0, 0); bloom(F, 'tulip', 'yellow', 3, 0);
    for (let d = 0; d < 30; d++) { waterAt(F, 0, 0, d, 5); expect(advanceDays(F, d + 1, ok).bred).toEqual([]); }
    const G = fresh(0);
    const a = bloom(G, 'tulip', 'red', 0, 0); bloom(G, 'tulip', 'yellow', 1, 0);
    for (let d = 0; d < 30; d++) { a.water = d; expect(advanceDays(G, d + 1, ok).bred).toEqual([]); }
  });
  it('꽃잎 따기는 활짝 핀 꽃 하루 한 번, 황금장미는 꽃잎이 많다', () => {
    const F = fresh(0);
    const p = bloom(F, 'tulip', 'red', 0, 0);
    const g = bloom(F, 'tulip', 'red', 4, 0); g.kind = 'rose'; g.gold = true;
    expect(pickPetals(F, p.id, 0)).toBe(1);
    expect(pickPetals(F, p.id, 0)).toBe(0);
    expect(pickPetals(F, p.id, 1)).toBe(1);
    expect(pickPetals(F, g.id, 0)).toBeGreaterThan(3);
  });
});

describe('garden logic — 민들레·클로버', () => {
  it('민들레를 불면 다음 날 근처에 들꽃(결정적), 들꽃 수는 한도가 있다', () => {
    const F = fresh(0);
    F.blown['d:0,0:0'] = { d: 0, x: 10, z: 10 };
    const rep = advanceDays(F, 1, ok);
    expect(rep.wild.length).toBe(1);
    const w = rep.wild[0];
    expect(w.kind).toBe('wild');
    expect(w.stage).toBe(BLOOM);
    expect(Math.hypot(w.x - 10, w.z - 10)).toBeLessThan(4.5);
    // 다음 날이 지나면 기록은 지워져 다시 홀씨가 맺힌다
    advanceDays(F, 3, ok);
    expect(F.blown['d:0,0:0']).toBeUndefined();
    // 같은 기록이면 같은 자리
    const G = fresh(0);
    G.blown['d:0,0:0'] = { d: 0, x: 10, z: 10 };
    expect(advanceDays(G, 1, ok).wild[0]).toMatchObject({ x: w.x, z: w.z, color: w.color });
    const H = fresh(0);
    for (let i = 0; i < WILD_MAX + 15; i++) H.blown[`d:${i}`] = { d: 0, x: i * 20, z: 0 };
    advanceDays(H, 1, ok);
    expect(H.plots.filter((p) => p.src === 'dandelion').length).toBe(WILD_MAX);
  });
  it('네잎클로버는 덤불마다 하루 0.5%, 붙어도 줄기 하나(결정적)', () => {
    let hit = 0, all = 0;
    for (let d = 0; d < 1000; d++) for (let k = 0; k < 40; k++) {
      const n = 20 + (k % 11), f = fourLeafSprigs(d, `c:${k}`, n);
      expect(f.length).toBeLessThanOrEqual(1);
      if (f.length) { hit++; expect(f[0]).toBeGreaterThanOrEqual(0); expect(f[0]).toBeLessThan(n); }
      all++;
    }
    expect(hit / all).toBeGreaterThan(CLOVER.fourLeaf * 0.8);
    expect(hit / all).toBeLessThan(CLOVER.fourLeaf * 1.2);
    expect(fourLeafSprigs(3, 'c:0', 0)).toEqual([]);
    expect(fourLeafSprigs(7, 'c:1,2:0', 30)).toEqual(fourLeafSprigs(7, 'c:1,2:0', 30));
  });
  it('청크 배치는 결정적이고 ok 를 지킨다', () => {
    const okHalf = (x: number) => x > 40;
    const a = wildChunk(0, 0, 96, okHalf), b = wildChunk(0, 0, 96, okHalf);
    expect(a).toEqual(b);
    for (const d of a.dandelions) expect(d.x).toBeGreaterThan(40);
    for (const p of a.patches) expect(p.x).toBeGreaterThan(40);
  });
  it('꽃밭 땅은 말랑섬 풀밭만', () => {
    const home = Island.islandSpawnPoints('home', 40, 0.2).filter((p) => gardenSoil(islandProbe, p.x, p.z));
    expect(home.length).toBeGreaterThan(3);
    const desert = Island.islandSpawnPoints('desert', 20, 0.2);
    for (const p of desert) expect(gardenSoil(islandProbe, p.x, p.z)).toBe(false);
  });
});

describe('garden logic — 과일 힘·큰 바위·회전초', () => {
  it('과일 힘은 POWER_MAX 에서 멈추고, 가득일 때만 부순다', () => {
    const F = fresh(0);
    expect(spendPower(F)).toBe(false);
    for (let i = 0; i < 5; i++) addPower(F, 1);
    expect(F.power).toBe(POWER_MAX);
    expect(spendPower(F)).toBe(true);
    expect(F.power).toBe(0);
  });
  it('섬마다 큰 바위 3개 — 그 섬 마른 땅, 숨은 곳 입구·부두에서 비켜서, 서로 떨어져', () => {
    const spots = boulderSpots();
    expect(spots).toEqual(boulderSpots());
    for (const isl of BOULDER_ISLANDS) {
      const mine = spots.filter((s) => s.island === isl);
      expect(mine.length, isl).toBe(BOULDER.perIsland);
      for (const s of mine) {
        const sf = Island.surfaceAt(s.x, s.z);
        expect(sf.island, s.key).toBe(isl);
        expect(sf.kind, s.key).not.toBe('sea');
        expect(Island.waterLevelAt(s.x, s.z) > sf.h, s.key).toBe(false);
        const h = (Island.PLACES.hidden as Record<string, { x: number; z: number }>)[s.secret];
        expect(Math.hypot(h.x - s.x, h.z - s.z), s.key).toBeGreaterThan(8);
        for (const d of Object.values(Island.PLACES.docks)) expect(Math.hypot(d.x - s.x, d.z - s.z), s.key).toBeGreaterThan(40);
      }
    }
    expect(new Set(spots.map((s) => s.key)).size).toBe(spots.length);
  });
  it('부순 바위는 다음 날 다시 선다', () => {
    const F = fresh(0);
    expect(boulderUp(F, 'b:x', 3)).toBe(true);
    F.boulders['b:x'] = 3;
    expect(boulderUp(F, 'b:x', 3)).toBe(false);
    expect(boulderUp(F, 'b:x', 4)).toBe(true);
  });
  it('회전초는 바람 위쪽에서 나와 바람 따라 굴러간다', () => {
    const w = windAt(2, 10);
    expect(Math.hypot(w.x, w.z)).toBeCloseTo(1, 5);
    expect(windAt(2, 10)).toEqual(w);
    expect(windAt(2, 10, true).k).toBeGreaterThan(w.k);
    const tw = spawnTumble(1, 0, 0, w, rngFor('t'), ok)!;
    expect(tw).not.toBeNull();
    // 플레이어보다 바람 위쪽
    expect(tw.x * w.x + tw.z * w.z).toBeLessThan(0);
    const x0 = tw.x * w.x + tw.z * w.z;
    for (let i = 0; i < 120; i++) expect(stepTumble(tw, w, 1 / 30, () => 0, ok)).toBe(true);
    expect(tw.x * w.x + tw.z * w.z).toBeGreaterThan(x0 + 3);
    expect(stepTumble(tw, w, 1 / 30, () => 0, () => false)).toBe(false);
  });
});

// ───────────── 모듈 띄우기 ─────────────
function fakeEcon(game: FakeGame) {
  const st = game.state;
  const unlocks = new Set<string>(['tool:wateringcan']);
  const buffs: Array<{ name: string; min: number }> = [];
  const chests: Array<{ tier?: string; where?: string }> = [];
  const econ = {
    p0: true, cheat: false,
    isUnlocked: (k: string) => unlocks.has(k),
    requirement: () => ({ ok: false, text: '' }),
    give: (id: string, n: number) => { if (id === 'coins') st.addCoins(n, 'test'); else st.addItem(id, n); return n; },
    addStars: () => { /* 기록 안 함 */ },
    addBuff: (name: string, min: number) => { buffs.push({ name, min }); },
    use: (id: string) => { if (!st.has(id)) return false; st.addItem(id, -1); st.emit({ type: 'use', id, kind: 'fruit', buff: 'power', minutes: 5 } as never); return true; },
    openChest: (tier?: string, where?: string) => { chests.push({ tier, where }); return { tier: tier ?? 'wood', loot: [] }; },
    day: () => game.env?.day ?? 0,
  };
  game.econ = econ as unknown as EconApi;
  return { econ, unlocks, buffs, chests };
}

type Hooks = {
  state(): { day: number; plots: Plot[]; power: number };
  plant(seed?: string, x?: number, z?: number): Plot | null;
  water(): number;
  nextDay(n?: number): unknown;
  shake(id?: string): number;
  pick(id?: string): number;
  feed(n?: number): number;
  boulders(): Array<{ key: string; island: string; x: number; z: number; up: boolean }>;
  breakNearest(): unknown;
  searchClover(key?: string): unknown;
  clovers(): Array<{ key: string; x: number; z: number; four: number[] }>;
  dandelions(): Array<{ key: string; x: number; z: number; blown: boolean }>;
  blow(key?: string): boolean;
  gardenSpot(): { x: number; z: number };
};
const hooks = () => (globalThis as unknown as { __garden: Hooks }).__garden;

describe('garden 모듈', () => {
  let game: FakeGame;
  beforeEach(() => { stubLocalStorage(); });

  const boot = async () => {
    game = makeFakeGame({ day: 0, hour: 10 });
    const E = fakeEcon(game);
    const ctx = makeCtx(game);
    await buildGarden(ctx as never);
    const spot = hooks().gardenSpot();
    game.player.teleport(spot.x, spot.z);
    game.tick(1 / 30, 2);
    return E;
  };

  it('E 로 씨앗 심고 물 주고, 이틀 지나면 활짝 — flags.garden 에 남는다', async () => {
    await boot();
    game.state.addItem('seed_tulip', 2);
    game.tick(1 / 30, 2);
    const rows = game.listInteractions().filter((r) => r.id.startsWith('garden'));
    const plantRow = rows.find((r) => r.id === 'garden-plant');
    expect(plantRow, JSON.stringify(rows.map((r) => r.label))).toBeTruthy();
    plantRow!.use();
    expect(game.state.bag.seed_tulip).toBe(1);
    const F = () => (game.state.flags.garden as GardenFlags);
    expect(F().plots.length).toBe(1);
    const id = F().plots[0].id;
    expect(hooks().water()).toBeGreaterThan(0);
    hooks().nextDay();
    expect(F().plots[0].stage).toBe(1);
    hooks().water();
    hooks().nextDay();
    expect(F().plots.find((p) => p.id === id)!.stage).toBe(BLOOM);
    expect(hooks().pick(id)).toBe(1);
    expect(game.state.bag.m_petal).toBe(1);
  });

  it('사과나무 5일 → 흔들면 m_apple · tree-shake', async () => {
    await boot();
    const ev = recordEvents(game);
    const sp = hooks().gardenSpot();
    const t = hooks().plant('seed_apple', sp.x, sp.z);
    expect(t).toBeTruthy();
    for (let d = 0; d < APPLE_DAYS; d++) { hooks().water(); hooks().nextDay(); }
    expect(hooks().shake(t!.id)).toBe(3);
    expect(game.state.bag.m_apple).toBe(3);
    expect(ev.of('tree-shake').length).toBe(1);
    expect(hooks().shake(t!.id)).toBe(0);
  });

  it('과일을 먹으면 힘이 차고, 가득이면 큰 바위를 부순다', async () => {
    await boot();
    const ev = recordEvents(game);
    game.state.addItem('m_apple', 5);
    expect(hooks().feed(3)).toBe(POWER_MAX);
    const b = hooks().boulders().find((q) => q.island === 'home')!;
    game.player.teleport(b.x + 2.4, b.z);
    game.tick(1 / 30, 2);
    const r = hooks().breakNearest() as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(hooks().state().power).toBe(0);
    expect(game.state.bag.m_stone).toBeGreaterThanOrEqual(3);
    expect(ev.of('rock-hit').length).toBe(1);
    expect(hooks().boulders().find((q) => q.key === b.key)!.up).toBe(false);
    game.env!.advance(DAY_SEC);
    game.tick(1 / 30, 2);
    expect(hooks().boulders().find((q) => q.key === b.key)!.up).toBe(true);
  });

  it('진짜 길: 바위 앞에서 E 로 과일 먹고 힘내기 → 가득이면 E 로 부수기', async () => {
    await boot();
    game.state.addItem('m_apple', 2);
    game.state.addItem('m_banana', 2);
    const b = hooks().boulders().find((q) => q.island === 'home')!;
    game.player.teleport(b.x + 2.4, b.z);
    game.tick(1 / 30, 2);
    for (let i = 0; i < POWER_MAX; i++) {
      const rows = game.listInteractions();
      expect(rows[0]?.id, JSON.stringify(rows.map((r) => r.label))).toBe('garden-eat');
      expect(rows[0].label).toContain(`(${i}/${POWER_MAX})`);
      expect(game.interact('garden-eat')).toBe(true);
      game.tick(1 / 30, 1);
    }
    expect(hooks().state().power).toBe(POWER_MAX);
    // 사과 둘 먼저, 그다음 바나나 — 과일은 econ.use 로 하나씩 줄었다
    expect(game.state.bag.m_apple ?? 0).toBe(0);
    expect(game.state.bag.m_banana).toBe(1);
    const rows = game.listInteractions();
    expect(rows.some((r) => r.id === 'garden-eat')).toBe(false);
    expect(rows[0].id).toBe('garden-boulder');
    expect(game.interact('garden-boulder')).toBe(true);
    expect(hooks().state().power).toBe(0);
  });

  it('사과나무를 흔든 직후 그 자리에서 사과 먹고 힘내기', async () => {
    await boot();
    const sp = hooks().gardenSpot();
    const t = hooks().plant('seed_apple', sp.x, sp.z)!;
    for (let d = 0; d < APPLE_DAYS; d++) { hooks().water(); hooks().nextDay(); }
    game.player.teleport(t.x + 1.2, t.z);
    game.tick(1 / 30, 2);
    expect(game.interact('garden-plot')).toBe(true);
    expect(game.state.bag.m_apple).toBe(3);
    game.tick(1 / 30, 1);
    const eat = game.listInteractions().find((r) => r.id === 'garden-eat');
    expect(eat?.label).toContain('사과 먹고 힘내기');
    expect(game.interact('garden-eat')).toBe(true);
    expect(hooks().state().power).toBe(1);
    expect(game.state.bag.m_apple).toBe(2);
  });

  it('클로버 덤불 살펴보기: 네잎이면 clover 버프 120분', async () => {
    const E = await boot();
    expect(hooks().clovers().length).toBeGreaterThan(0);
    const plain = hooks().clovers().find((c) => c.four.length === 0)!;
    const r0 = hooks().searchClover(plain.key) as { found: boolean };
    expect(r0.found).toBe(false);
    // 같은 덤불은 하루 한 번
    expect((hooks().searchClover(plain.key) as { why?: string }).why).toBe('searched');
    // 네잎이 있는 날까지 하루씩(결정적이라 늘 같은 날에 찾는다)
    let four: { key: string; four: number[] } | undefined;
    for (let d = 0; d < 1500 && !four; d++) { four = hooks().clovers().find((c) => c.four.length > 0); if (!four) hooks().nextDay(); }
    expect(four).toBeTruthy();
    const r1 = hooks().searchClover(four!.key) as { found: boolean };
    expect(r1.found).toBe(true);
    expect(E.buffs).toContainEqual({ name: 'clover', min: CLOVER.buffMin });
    // 찾은 네잎은 그날 사라진다
    expect(hooks().clovers().find((c) => c.key === four!.key)!.four).toEqual([]);
  });

  it('모래시계섬 회전초: 바람 따라 굴러가고, 잡으면 나무상자(하루 한도)', async () => {
    const E = await boot();
    const sp = Island.islandSpawnPoints('desert', 1, 0.2)[0];
    game.player.teleport(sp.x, sp.z);
    game.tick(1 / 30, 2);
    const h = hooks() as unknown as { spawnTumble(near?: boolean): { id: number; x: number; z: number } | null; tumbles(): Array<{ id: number; x: number; z: number }>; catchTumble(): unknown };
    const t = h.spawnTumble(true);
    expect(t).toBeTruthy();
    const x0 = h.tumbles().find((q) => q.id === t!.id)!;
    game.tick(1 / 30, 30);
    const x1 = h.tumbles().find((q) => q.id === t!.id);
    if (x1) expect(Math.hypot(x1.x - x0.x, x1.z - x0.z)).toBeGreaterThan(0.5);
    expect(h.catchTumble()).toBeTruthy();
    expect(E.chests.at(-1)).toEqual({ tier: 'wood', where: 'tumbleweed:desert' });
    // 섬을 떠나면 회전초는 사라진다
    const home = hooks().gardenSpot();
    game.player.teleport(home.x, home.z);
    game.tick(1 / 30, 2);
    expect(h.tumbles()).toEqual([]);
  });

  it('민들레를 불면 다음 날 근처에 들꽃', async () => {
    await boot();
    const d = hooks().dandelions()[0];
    expect(d).toBeTruthy();
    expect(hooks().blow(d.key)).toBe(true);
    expect(hooks().blow(d.key)).toBe(false);
    hooks().nextDay();
    const wild = hooks().state().plots.filter((p) => p.src === 'dandelion');
    expect(wild.length).toBe(1);
    expect(Math.hypot(wild[0].x - d.x, wild[0].z - d.z)).toBeLessThan(4.5);
  });
});
