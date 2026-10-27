// flora-harvest: 흔들기·베기·돌 두드리기 표(비율·하루 횟수·단단한 나무 20%), 돌 자리(섬마다 5개·keepOut 밖·결정적),
// 모든 아이템 id 가 economy MATERIALS 에 있는지, 섬별 열매 나무 20그루 이상, 가짜 게임에서 돌·나무·꽃 채집 흐름.
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import * as Island from '../src/core/island';
import { rngFor } from '../src/core/rng';
import { DAY_SEC } from '../src/core/api';
import { MAT } from '../src/modules/economy/data';
import { FRUIT_ITEMS, FLORA_ITEMS, ROCK_SPECIAL, GATHER, SHAKE, CHOP, ROCK, WFRUITS, josa } from '../src/modules/flora/data';
import {
  floraFlags, pruneFlags, markShake, shakenToday, markChop, chopsLeft, markHit, hitsLeft, breakToday, markPick, pickedToday,
  rollShake, rollChop, rollRock, rockWeights, comboNext, fruitCountOf, vineTree, floraKeepOut, rockSpots, allRockSpots, inCircles, inVillage,
} from '../src/modules/flora/logic';
import { makePlanner, countFruitTrees } from '../src/modules/flora/world';
import { makeServices, setupHarvest, type TreeRec, type PickRec } from '../src/modules/flora/harvest';
import { setupRocks } from '../src/modules/flora/rocks';
import { makeFx } from '../src/modules/flora/fx';
import { homeTreeSpots, homeLandmarks, HOME_TREE_SCALE } from '../src/modules/flora/homeland';
import { makeFakeGame, makeCtx, recordEvents, resetKit, type FakeGame } from './kit/fakeGame';
import type { EconApi } from '../src/core/api';

afterEach(() => resetKit());

const freq = <T extends string>(n: number, f: (i: number) => T) => {
  const out: Record<string, number> = {};
  for (let i = 0; i < n; i++) { const k = f(i); out[k] = (out[k] ?? 0) + 1; }
  return out;
};

describe('아이템 id', () => {
  it('열매·식물 아이템은 전부 economy MATERIALS 에 있다(팔 수 없는 떨굼 없음)', () => {
    for (const f of WFRUITS) expect(MAT.has(FRUIT_ITEMS[f].id), FRUIT_ITEMS[f].id).toBe(true);
    for (const it of FLORA_ITEMS) { expect(MAT.has(it.id), it.id).toBe(true); expect(it.price).toBeGreaterThan(0); }
    for (const id of Object.values(ROCK_SPECIAL)) expect(MAT.has(id), id).toBe(true);
    for (const g of Object.values(GATHER)) { expect(MAT.has(g.item)).toBe(true); if (g.night) expect(MAT.has(g.night.item)).toBe(true); }
    for (const id of ['m_wood', 'm_hardwood', 'm_vine', 'm_stone', 'm_clay', 'm_iron', 'm_gold', 'm_honey', 'm_petal', 'm_spore', 'm_glowcap', 'm_fern']) expect(MAT.has(id), id).toBe(true);
    // 예전 id(fruit-apple, beehive)는 더 이상 내지 않는다
    expect(FLORA_ITEMS.some((i) => i.id.startsWith('fruit-') || i.id === 'beehive')).toBe(false);
    expect(FRUIT_ITEMS.apple.id).toBe('m_apple');
    expect(FRUIT_ITEMS.cherry.id).toBe('m_cherry');
  });
  it('조사: 받침 따라 이/가·을/를', () => {
    expect(josa('사과', '이가')).toBe('사과가');
    expect(josa('은행', '을를')).toBe('은행을');
    expect(FRUIT_ITEMS.coconut.josa).toBe('이');
  });
});

describe('흔들기 표(GDD 3.4 P0-2)', () => {
  it('코인 주머니 5% · 벌집 3% · 가구 2%, 열매는 전부', () => {
    const N = 40000;
    const f = freq(N, (i) => { const r = rollShake(rngFor(`t-shake:${i}`), 2); expect(r.fruits).toBe(2); return r.bonus ?? 'none'; });
    expect(f.coins / N).toBeCloseTo(SHAKE.coins, 2);
    expect(f.hive / N).toBeCloseTo(SHAKE.hive, 2);
    expect(f.furniture / N).toBeCloseTo(SHAKE.furniture, 2);
    expect(f.none / N).toBeCloseTo(0.9, 2);
  });
  it('코인 주머니는 100~1,000(100 단위), 가구는 코인으로', () => {
    for (let i = 0; i < 4000; i++) {
      const r = rollShake(rngFor(`t-coin:${i}`), 0);
      if (r.bonus === 'coins') { expect(r.coins).toBeGreaterThanOrEqual(100); expect(r.coins).toBeLessThanOrEqual(1000); expect(r.coins % 100).toBe(0); }
      if (r.bonus === 'furniture') expect(r.coins).toBe(SHAKE.furnitureCoins);
      if (!r.bonus) expect(r.coins).toBe(0);
    }
  });
  it('나무마다 열매 1~3개(키로 고정)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) { const n = fruitCountOf(`${i},${i * 7}`); expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(3); seen.add(n); expect(fruitCountOf(`${i},${i * 7}`)).toBe(n); }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});

describe('베기 표(GDD 3.4 P0-4)', () => {
  it('단단한 나무 약 20%', () => {
    const N = 30000;
    const f = freq(N, (i) => rollChop(rngFor(`t-chop:${i}`), { nth: 1 })[0].id);
    expect(f.m_hardwood / N).toBeCloseTo(CHOP.hardwood, 2);
    expect((f.m_wood + f.m_hardwood)).toBe(N);
  });
  it('덩굴은 산호빛섬·반딧불버섯섬 야자·거대 버섯에서, 오늘 첫 베기에만', () => {
    expect(vineTree('palm0', 'coral')).toBe(true);
    expect(vineTree('coco1', 'coral')).toBe(true);
    expect(vineTree('gmush0', 'mushroom')).toBe(true);
    expect(vineTree('palm0', 'home')).toBe(false);
    expect(vineTree('broad0', 'coral')).toBe(false);
    const r = rngFor('t-vine');
    expect(rollChop(r, { vine: true, nth: 1 }).map((d) => d.id)).toContain('m_vine');
    expect(rollChop(r, { vine: true, nth: 2 }).map((d) => d.id)).not.toContain('m_vine');
    expect(rollChop(r, { nth: 0 })).toEqual([]);
  });
});

describe('돌 표(GDD 3.4 P0-3)', () => {
  it('콤보 0: 돌 60 · 점토 15 · 철 15 · 금 3 · 특산 7', () => {
    const N = 60000;
    const f = freq(N, (i) => rollRock(rngFor(`t-rock:${i}`), 'dino', 0));
    expect(f.m_stone / N).toBeCloseTo(0.6, 2);
    expect(f.m_clay / N).toBeCloseTo(0.15, 2);
    expect(f.m_iron / N).toBeCloseTo(0.15, 2);
    expect(f.m_gold / N).toBeCloseTo(0.03, 2);
    expect(f.m_volcanic / N).toBeCloseTo(0.07, 2);
  });
  it('섬 특산: 공룡 화산유리 · 솜눈 얼음결정 · 모래시계 모래유리 · 별똥별 운석조각', () => {
    expect(ROCK_SPECIAL.dino).toBe('m_volcanic');
    expect(ROCK_SPECIAL.ice).toBe('m_icecrystal');
    expect(ROCK_SPECIAL.desert).toBe('m_sandglass');
    expect(ROCK_SPECIAL.launch).toBe('m_meteor');
    // 말랑섬은 특산이 점토 → 한 줄로 합쳐 22%
    const w = Object.fromEntries(rockWeights('home', 0));
    expect(w.m_clay).toBe(22);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('콤보가 오르면 철광석·금광석이 잘 나온다(7에서 멈춤)', () => {
    const share = (c: number, id: string) => { const ws = rockWeights('ice', c); const sum = ws.reduce((a, [, v]) => a + v, 0); return (ws.find(([k]) => k === id)?.[1] ?? 0) / sum; };
    expect(share(3, 'm_iron')).toBeGreaterThan(share(0, 'm_iron'));
    expect(share(7, 'm_gold')).toBeGreaterThan(share(3, 'm_gold'));
    expect(share(20, 'm_gold')).toBeCloseTo(share(7, 'm_gold'), 10);
    expect(share(7, 'm_gold')).toBeGreaterThan(0.06);
  });
  it('콤보는 0.9초 박자 안에서만 이어진다', () => {
    expect(comboNext(10, 10.5, 2)).toBe(3);
    expect(comboNext(10, 10.9, 2)).toBe(3);
    expect(comboNext(10, 11.0, 2)).toBe(0);
    expect(comboNext(10, 9, 2)).toBe(0);
  });
});

describe('하루 횟수(flags.flora)', () => {
  it('흔들기 하루 1번 · 베기 3번 · 돌 8번 · 꽃 1번, 다음 날 다시', () => {
    const flags: Record<string, unknown> = {};
    const f = floraFlags(flags);
    expect(flags.flora).toBe(f);
    markShake(f, 't1', 4);
    expect(shakenToday(f, 't1', 4)).toBe(true);
    expect(shakenToday(f, 't1', 5)).toBe(false);
    expect([1, 2, 3, 4].map(() => markChop(f, 't1', 4))).toEqual([1, 2, 3, 0]);
    expect(chopsLeft(f, 't1', 4)).toBe(0);
    expect(chopsLeft(f, 't1', 5)).toBe(CHOP.perDay);
    const hits = Array.from({ length: 9 }, () => markHit(f, 'r1', 4));
    expect(hits).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
    expect(hitsLeft(f, 'r1', 4)).toBe(0);
    expect(markHit(f, 'r1', 5)).toBe(1);
    expect(hitsLeft(f, 'r1', 5)).toBe(ROCK.hitsPerDay - 1);
    markPick(f, 'p1', 5);
    expect(pickedToday(f, 'p1', 5)).toBe(true);
    // 공룡 돌진: 한 번 부수면 그날은 끝
    expect(breakToday(f, 'r2', 5)).toBe(true);
    expect(breakToday(f, 'r2', 5)).toBe(false);
    expect(hitsLeft(f, 'r2', 5)).toBe(0);
    // 정리: 5일 것만 남는다
    pruneFlags(f, 5);
    expect(Object.keys(f.shake)).toEqual([]);
    expect(Object.keys(f.chop)).toEqual([]);
    expect(Object.keys(f.rock).sort()).toEqual(['r1', 'r2']);
    expect(f.day).toBe(5);
  });
  it('망가진 저장도 고쳐 읽는다', () => {
    const flags: Record<string, unknown> = { flora: { shake: { a: 'x', b: 3 }, chop: { c: [1], d: [2, 1] }, rock: 7 } };
    const f = floraFlags(flags);
    expect(f.shake).toEqual({ b: 3 });
    expect(f.chop).toEqual({ d: [2, 1] });
    expect(f.rock).toEqual({});
    expect(f.pick).toEqual({});
  });
});

describe('돌 자리(섬마다 5개)', () => {
  const keepOut = floraKeepOut(Island);
  const spots = allRockSpots(Island, keepOut);
  it('큰 섬 7개 × 5개, 결정적', () => {
    const big = Island.ISLANDS.filter((d) => d.theme !== 'islet');
    expect(big.length).toBe(7);
    for (const d of big) expect(spots.filter((s) => s.island === d.id).length, d.id).toBe(ROCK.perIsland);
    expect(allRockSpots(Island, keepOut)).toEqual(spots);
    expect(rockSpots(Island, 'dino', keepOut)).toEqual(spots.filter((s) => s.island === 'dino'));
    expect(new Set(spots.map((s) => s.key)).size).toBe(spots.length);
  });
  it('keepOut·마을·물 밖, 제 섬 마른 땅 위', () => {
    for (const s of spots) {
      expect(inCircles(keepOut, s.x, s.z), s.key).toBe(false);
      expect(inVillage(Island, s.x, s.z, 8), s.key).toBe(false);
      const w = Island.worldSample(s.x, s.z);
      expect(w.island?.id, s.key).toBe(s.island);
      expect((w.water ?? -Infinity) > w.h - 0.3, s.key).toBe(false);
      expect(['cliff', 'lava', 'river', 'sea']).not.toContain(w.kind);
    }
  });
  it('말랑섬 첫 돌은 마을 가까이(하루 루틴)', () => {
    const h = spots.find((s) => s.key === 'rock:home:0')!;
    expect(Math.hypot(h.x, h.z)).toBeLessThan(140);
  });
});

describe('섬별 열매 나무(GDD 2.2.1: 섬마다 20그루 이상)', () => {
  it('산호 코코넛·바나나, 사막 대추, 별똥별 별사과, 솜눈 서리 열매, 공룡 은행', () => {
    const plan = makePlanner(Island, rngFor, floraKeepOut(Island));
    const want: Record<string, string[]> = { coral: ['coconut', 'banana'], desert: ['date'], launch: ['starapple'], ice: ['frostberry'], dino: ['ginkgo'] };
    for (const [id, fruits] of Object.entries(want)) {
      const d = Island.islandById(id)!;
      const n = countFruitTrees(plan, d, Island);
      for (const f of fruits) expect(n[f] ?? 0, `${id}:${f}`).toBeGreaterThanOrEqual(20);
    }
  }, 120000);
});

describe('말랑섬 랜드마크 나무', () => {
  it('할미벚 40 m · 소원나무 25 m 자리와 랜드마크', () => {
    const t = homeTreeSpots(Island, floraKeepOut(Island));
    expect(t.map((x) => x.kind).sort()).toEqual(['halmi', 'wishtree']);
    for (const x of t) expect(Island.worldSample(x.x, x.z).island?.id).toBe('home');
    expect(HOME_TREE_SCALE.halmi * 4).toBeCloseTo(40, 0);
    expect(HOME_TREE_SCALE.wishtree * 4).toBeCloseTo(25, 0);
    const lm = homeLandmarks(t);
    expect(lm.map((l) => l.id).sort()).toEqual(['lm:home:halmi', 'lm:home:wishtree']);
    expect(lm.find((l) => l.id === 'lm:home:halmi')!.kind).toMatch(/halmi/);
  });
});

// ───────────── 가짜 게임에서 흐름 ─────────────
function fakeEcon(game: FakeGame, hammer: { on: boolean }): EconApi {
  return {
    isUnlocked: (k: string) => (k === 'tool:hammer' ? hammer.on : true),
    requirement: () => ({ ok: false, text: '🔒 돌망치 — 꽥꽥상회 120' }),
    give: (id: string, n: number) => { game.state.addItem(id, n); return n; },
    day: () => game.env?.day ?? 0,
  } as unknown as EconApi;
}
function setup(pos: [number, number]) {
  const game = makeFakeGame({ pos });
  const ctx = makeCtx(game);
  const g = ctx.game!;
  const hammer = { on: false };
  game.econ = fakeEcon(game, hammer);
  const S = makeServices(ctx as never, g);
  const fx = makeFx(g, (k) => ctx.rng(k));
  const H = setupHarvest(S, fx);
  return { game, ctx, g, S, fx, H, hammer };
}

describe('가짜 게임: 돌 두드리기', () => {
  it('돌망치 없으면 막히고, 있으면 8번 → 부서짐 · rock-hit/harvest 이벤트 · 다음 날 다시', () => {
    const spot = allRockSpots(Island, floraKeepOut(Island)).find((s) => s.island === 'desert')!;
    const { game, S, fx, hammer } = setup([spot.x + 1.0, spot.z]);
    const R = setupRocks(S, fx, floraKeepOut(Island));
    game.chunks.buildAtWorld('flora-rocks', spot.x, spot.z);
    expect(game.physics.statics.length).toBeGreaterThan(0);
    const ev = recordEvents(game);
    // 잠김: 안내 줄에 조건이 보이고 두드려도 아무것도 안 나온다
    const row = game.listInteractions().find((r) => r.id === 'flora-rock');
    expect(row?.label).toContain('돌망치');
    expect(R.hit(spot.key)).toMatchObject({ ok: false, why: 'hammer' });
    hammer.on = true;
    for (let i = 0; i < ROCK.hitsPerDay; i++) {
      game.time += 0.4; // 박자 맞춰 연타 → 콤보
      const r = R.hit(spot.key);
      expect(r.ok).toBe(true);
      expect(r.combo).toBe(i);
    }
    expect(R.hit(spot.key)).toMatchObject({ ok: false, why: 'done' });
    expect(ev.of('rock-hit').length).toBe(ROCK.hitsPerDay);
    expect(ev.of('rock-hit')[3]).toMatchObject({ rock: spot.key, combo: 3, island: 'desert' });
    const got = ev.of('harvest');
    expect(got.length).toBe(ROCK.hitsPerDay);
    for (const h of got) { expect(h.kind).toBe('rock'); expect(MAT.has(h.item as string)).toBe(true); }
    const bagN = Object.entries(game.state.bag).filter(([k]) => k.startsWith('m_')).reduce((a, [, v]) => a + v, 0);
    expect(bagN).toBe(ROCK.hitsPerDay);
    expect(R.rocks().find((r) => r.key === spot.key)).toMatchObject({ broken: true, left: 0 });
    expect(game.listInteractions().some((r) => r.id === 'flora-rock')).toBe(false);
    expect(fx.live()).toBeGreaterThan(0);
    // 공룡 돌진: 이미 부서졌으면 false
    expect(R.breakRock(spot.key)).toBe(false);
    // 다음 날
    game.env!.advance(DAY_SEC);
    game.tick(1 / 60, 2);
    expect(R.rocks().find((r) => r.key === spot.key)).toMatchObject({ broken: false, left: ROCK.hitsPerDay });
    expect(R.breakRock(spot.key)).toBe(true);
    expect(R.breakRock(spot.key)).toBe(false);
    expect((game.state.flags.flora as { rock: Record<string, unknown> }).rock[spot.key]).toBeTruthy();
  });
});

describe('가짜 게임: 나무 흔들기·베기·꽃 줍기', () => {
  const mkTree = (o: Partial<TreeRec> & { x: number; z: number }): TreeRec => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
    const base = new THREE.Matrix4().makeTranslation(o.x, 0, o.z);
    return { key: `${o.x},${o.z}`, kind: 'broad0', island: 'home', y: 0, s: 1, shake: true, chop: true, base, ref: { mesh, i: 0 }, fruits: [], wobT: -1, wobA: 0, ...o };
  };
  it('흔들기: 열매가 떨어져 줍기(m_apple) · 하루 1번 · tree-shake 이벤트', () => {
    const { game, H, g } = setup([0.8, 0]);
    const rec = mkTree({ x: 0, z: 0, fruit: 'apple' });
    const grp = new THREE.Group();
    const anchors = [0, 1, 2].map((i) => ({ p: new THREE.Vector3(Math.cos(i * 2) * 0.8, 2.2, Math.sin(i * 2) * 0.8), n: new THREE.Vector3(Math.cos(i * 2), 0, Math.sin(i * 2)) }));
    H.hangFruit(grp, [{ rec, tm: rec.base, fruit: 'apple', key: rec.key, anchors }]);
    H.addTrees('t', [rec], { x0: -10, z0: -10, size: 20 });
    expect(rec.fruits.length).toBe(fruitCountOf(rec.key));
    const ev = recordEvents(game);
    expect(game.interact('flora-shake')).toBe(true);
    expect(ev.of('tree-shake')[0]).toMatchObject({ tree: 'broad0', island: 'home' });
    expect(H.drops()).toBeGreaterThanOrEqual(rec.fruits.length);
    expect(game.player.acts.some((a) => a.name === 'shake')).toBe(true);
    // 떨어진 것 줍기(가짜 물리라 제자리) — 플레이어를 옮겨 가며
    let picked = 0;
    for (let k = 0; k < 10 && H.drops() > 0; k++) {
      const row = game.listInteractions().find((r) => r.id === 'flora-pick');
      if (!row) {
        // 떨어진 자리로 걸어가기
        game.player.teleport(0.3, 0.3);
        continue;
      }
      game.interact('flora-pick'); picked++;
    }
    expect(game.state.bag.m_apple ?? 0).toBeGreaterThanOrEqual(1);
    expect(ev.of('harvest').some((h) => h.kind === 'fruit' && h.item === 'm_apple')).toBe(true);
    expect(picked).toBeGreaterThan(0);
    // 같은 날 다시 흔들면 아무것도 없다
    const before = H.drops();
    game.player.teleport(0.8, 0);
    game.interact('flora-shake');
    expect(H.drops()).toBe(before);
    void g;
  });
  it('베기(F, 우선순위 10): 돌망치 필요 · 하루 3번 · 나무/단단한 나무', () => {
    const { game, H, hammer } = setup([0.8, 0]);
    const rec = mkTree({ x: 0, z: 0, kind: 'palm0', island: 'coral' });
    H.addTrees('t', [rec], { x0: -10, z0: -10, size: 20 });
    const row = game.listInteractions().find((r) => r.id === 'flora-chop')!;
    expect(row).toMatchObject({ key: 'KeyF', priority: 10 });
    expect(row.label).toContain('돌망치');
    game.interact('flora-chop');
    expect(game.state.bag.m_wood ?? 0).toBe(0);
    hammer.on = true;
    expect(game.listInteractions().find((r) => r.id === 'flora-chop')!.label).toBe('나무 베기');
    const ev = recordEvents(game);
    for (let i = 0; i < 4; i++) game.interact('flora-chop');
    const wood = (game.state.bag.m_wood ?? 0) + (game.state.bag.m_hardwood ?? 0);
    expect(wood).toBe(CHOP.perDay);
    expect(game.state.bag.m_vine).toBe(1);
    expect(ev.of('harvest').filter((h) => h.kind === 'chop').length).toBe(CHOP.perDay);
    expect(ev.of('harvest').filter((h) => h.kind === 'vine').length).toBe(1);
    expect(game.player.acts.filter((a) => a.name === 'chop').length).toBeGreaterThanOrEqual(3);
    expect(game.listInteractions().find((r) => r.id === 'flora-chop')!.label).toContain('오늘은 끝');
  });
  it('꽃 줍기 → 꽃잎, 오늘은 숨김 · 버섯은 밤에 발광 버섯', () => {
    const { game, H } = setup([0.5, 0]);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2);
    const mk = (i: number, kind: PickRec['kind'], x: number): PickRec => ({ key: `p:${i}`, kind, island: 'mushroom', x, y: 0, z: 0, base: new THREE.Matrix4().makeTranslation(x, 0, 0), ref: { mesh, i } });
    H.addPicks('p', [mk(0, 'flower', 0), mk(1, 'mushroom', 3)], { x0: -5, z0: -5, size: 10 });
    const ev = recordEvents(game);
    expect(game.listInteractions().find((r) => r.id === 'flora-gather')?.label).toBe('꽃 줍기');
    game.interact('flora-gather');
    expect(game.state.bag.m_petal).toBe(1);
    expect(H.pickHidden('p:0')).toBe(true);
    const m = new THREE.Matrix4(); mesh.getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixScale(m).length()).toBe(0);
    expect(game.listInteractions().some((r) => r.id === 'flora-gather')).toBe(false);
    // 밤 버섯
    game.env!.setHour(22);
    game.player.teleport(3.4, 0);
    expect(game.listInteractions().find((r) => r.id === 'flora-gather')?.label).toBe('발광 버섯 따기');
    game.interact('flora-gather');
    expect(game.state.bag.m_glowcap).toBe(1);
    expect(ev.of('harvest').map((h) => h.kind)).toEqual(['flower', 'glowcap']);
    // 다음 날 꽃이 다시 핀다
    game.env!.advance(DAY_SEC);
    game.tick(1 / 60, 2);
    expect(H.pickHidden('p:0')).toBe(false);
    mesh.getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixScale(m).length()).toBeGreaterThan(0);
  });
});
