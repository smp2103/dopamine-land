// 경제 wave 4(econ-p1) — 섬 상인 시세(바자르·떡방아·고물상·정거장·다이빙·친구 섬), 재활용 포인트 → 반짝별,
// 캡슐머신(확률표·결정성·천장·중복 반짝별), 피규어(같은 종 5 → 1, 꼬마 ×2), 버프(게임 시계로 끝남 · rollCatch 에 저절로),
// 집 보관함 200칸, 놓아주기·버리기·전시·투자, 다이빙 숍 잠수정 해금, 초대권.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFakeGame, makeCtx, recordEvents, recordingRenderer } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import buildEconomy from '../src/modules/economy';
import type { Species } from '../src/core/state';
import { HOUR_SEC, type EconApi } from '../src/core/api';
import { rngFor } from '../src/core/rng';
import { SHOP, SHOP_ITEMS, GOODS, COSMETIC_TABLE } from '../src/modules/economy/data';
import { merchantMult, junkFixed, recycleToStars, mochiFor, friendHot, isEarthCreature, RECYCLE_PER_STAR } from '../src/modules/economy/merchants';
import { rollCapsule, capsuleOddsTable, capsuleChance, CAPSULE_POOL, CAPSULE_PITY, CAPSULE_GRADE_W, dupStars } from '../src/modules/economy/capsule';
import { applyBuff, activeBuffs, pruneBuffs, rollMods, GAME_MIN_SEC, FOODS } from '../src/modules/economy/buffs';
import { figurePlan, figurePoints, STORAGE_SIZE, displayMax } from '../src/modules/economy/keep';
import { rollCatch as rollPure, newRollState, type RollEnv } from '../src/modules/economy/roll';

type Loot = { id: string; n: number; name?: string; grade: number; kind: string; dup: boolean; stars: number; pity: boolean };
type Econ = Omit<EconApi, 'capsule' | 'storage' | 'display' | 'use' | 'addBuff' | 'buffs' | 'release' | 'invest' | 'figurine'> & {
  use(id: string): boolean;
  addBuff(name: string, min: number): void;
  buffs(): Array<{ name: string; until: number }>;
  rollMods(): { buffs: string[]; luckMult: number };
  storage: { size: number; used: number; free: number; list(): Array<{ id: string; n: number }>; put(id: string, n: number): boolean; take(id: string, n: number): boolean };
  release(id: string): boolean;
  drop(id: string, n?: number): boolean;
  display(id: string, on: boolean): boolean;
  displayed(): Array<{ id: string; n: number }>;
  invest(island: string, cost: { coins?: number; stars?: number; items?: Record<string, number> }): boolean;
  invested(island: string): { coins: number; stars: number; items: Record<string, number>; n: number };
  capsule: { roll(): Loot | null; tickets: number; pityLeft: number; got(): Record<string, number> };
  figurine(id: string): boolean;
  figureList(): Array<{ id: string; points: number }>;
  friendMarket(): { hot: string[]; mult: Record<string, number> };
  recycle(): { points: number; total: number };
  useInvite(island?: string): boolean;
};

function boot(search = '?p0=0', o: { load?: boolean; env?: boolean } = {}) {
  const game = makeFakeGame({ search, load: o.load, env: o.env });
  const ctx = makeCtx(game);
  buildEconomy(ctx as never);
  return { game, ctx, econ: game.econ as unknown as Econ, ev: recordEvents(game) };
}
const sp = (id: string, category: string, rarity: number, extra: Partial<Species> = {}): Species => ({ id, name: id, category, rarity, price: 1000, ...extra });

beforeEach(() => { stubLocalStorage(); });

describe('섬 상인 시세(4.4 P1)', () => {
  it('보정표: 바자르 곤충 ×1.3 · 물고기 ×0.9, 떡방아 지구 생물 ×1.5, 고물상 쓰레기 10, 정거장 우주 ×1.2', () => {
    const bug = { id: 'b', category: 'bug' }, fish = { id: 'f', category: 'fish' }, moonFish = { id: 'mf', category: 'fish', where: [{ island: 'moon', zone: 'moonpond' }] };
    expect(merchantMult('bazaar', bug)).toBe(1.3);
    expect(merchantMult('bazaar', { id: 'i', category: 'insect' })).toBe(1.3);
    expect(merchantMult('bazaar', fish)).toBe(0.9);
    expect(merchantMult('bazaar', { id: 'm_wood', category: 'item' })).toBe(1);
    expect(merchantMult('moon', fish)).toBe(1.5);
    expect(isEarthCreature(moonFish)).toBe(false);
    expect(merchantMult('moon', moonFish)).toBe(1);
    expect(merchantMult('station', { id: 'm_moonrock', category: 'item', tags: ['space-goods'] })).toBe(1.2);
    expect(merchantMult('diving', { id: 'o', category: 'sea' })).toBe(1.1);
    expect(merchantMult('quack', bug)).toBe(1);
    expect(junkFixed('junk', { id: 't_boot', tags: ['junk'] })).toBe(10);
    expect(junkFixed('quack', { id: 't_boot', tags: ['junk'] })).toBeNull();
    // 달떡 덤은 생물(지구·달)만 — 400코인마다 1, 모자란 값은 이월
    expect(mochiFor('moon', fish, 1500)).toEqual({ mochi: 3, carry: 300 });
    expect(mochiFor('moon', fish, 100)).toEqual({ mochi: 0, carry: 100 });
    expect(mochiFor('moon', fish, 100, 300)).toEqual({ mochi: 1, carry: 0 });
    expect(mochiFor('moon', moonFish, 400)).toEqual({ mochi: 1, carry: 0 });
    expect(mochiFor('quack', fish, 1500)).toEqual({ mochi: 0, carry: 0 });
    // 재료·쓰레기·달떡 자신은 덤이 없다(이월분도 그대로)
    expect(mochiFor('moon', { id: 'm_wood', category: 'item', tags: ['material'] }, 1500, 50)).toEqual({ mochi: 0, carry: 50 });
    expect(mochiFor('moon', { id: 'm_mochi', category: 'item', tags: ['space-goods'] }, 300)).toEqual({ mochi: 0, carry: 0 });
    expect(mochiFor('moon', { id: 't_boot', tags: ['junk'] }, 10)).toEqual({ mochi: 0, carry: 0 });
  });

  it('econ.priceOf(…, {shop}) 와 sell(id, n, shop) 이 상인 보정을 쓴다', () => {
    const { game, econ, ev } = boot();
    game.state.register([sp('t-bug', 'bug', 2), sp('t-fish', 'fish', 2)]);
    const q = (id: string, shop: string) => econ.priceOf(id, { shop } as never);
    expect(q('t-bug', 'bazaar')).toBe(Math.round(q('t-bug', 'quack') * 1.3 / 10) * 10);
    expect(q('t-fish', 'bazaar')).toBe(Math.round(q('t-fish', 'quack') * 0.9 / 10) * 10);
    expect(q('t-fish', 'moon')).toBe(Math.round(q('t-fish', 'quack') * 1.5 / 10) * 10);
    // 떡방아에서 팔면 코인 ×1.5 + 달떡 덤
    econ.give('t-fish', 2);
    const expect1 = q('t-fish', 'moon');
    const got = econ.sell('t-fish', 1, 'moon');
    expect(got).toBe(expect1);
    expect(ev.of('sell').at(-1)).toMatchObject({ shop: 'moon', coins: got });
    expect(got).toBeGreaterThan(400);
    expect(game.state.bag.m_mochi ?? 0).toBe(Math.floor(got / 400));
    // 남은 한 마리까지 팔면 이월분과 합쳐 400코인마다 달떡
    const got2 = econ.sell('t-fish', 1, 'moon');
    expect(game.state.bag.m_mochi ?? 0).toBe(Math.floor((got + got2) / 400));
    expect(ev.of('sell').filter((e) => e.mochi).length).toBeGreaterThanOrEqual(1);
  });

  it('달에서 달떡·재료를 팔아도 달떡 덤은 없다(무한 코인 고리 막기)', () => {
    const { game, econ, ev } = boot();
    econ.give('m_mochi', 1);
    const c0 = game.state.coins;
    const got = econ.sell('m_mochi', 1, 'moon');
    expect(got).toBeGreaterThan(0);
    expect(game.state.bag.m_mochi ?? 0).toBe(0);
    expect(ev.of('sell').at(-1)!.mochi).toBeUndefined();
    expect(game.state.coins).toBe(c0 + got);
    // 다시 줘서 30번 — 달떡이 늘지도, 코인이 무한히 쌓이지도 않는다
    econ.give('m_mochi', 1);
    const paid = Array.from({ length: 30 }, () => econ.sell('m_mochi', 1, 'moon')).filter((c) => c > 0);
    expect(paid.length).toBe(1);
    expect(game.state.bag.m_mochi ?? 0).toBe(0);
    // 싼 재료(나무)도 덤 없음 + sellAll 의 가방 키마다 최소 1 도 없다
    econ.give('m_wood', 5);
    econ.sell('m_wood', 5, 'moon');
    expect(game.state.bag.m_mochi ?? 0).toBe(0);
  });

  it('열린 가게 창의 가격표는 그 가게 보정을 보인다', () => {
    const { game, econ } = boot();
    game.state.register([sp('t-bug2', 'bug', 2)]);
    const base = econ.priceOf('t-bug2');
    game.hud.registerPanel({ kind: 'shop', title: '가게', color: '#ffbe3b', render() { /* 대역 */ } });
    game.hud.attach(recordingRenderer());
    game.hud.open('shop', undefined, { shop: 'bazaar' });
    expect(econ.priceOf('t-bug2')).toBe(Math.round(base * 1.3 / 10) * 10);
    game.hud.close();
    expect(econ.priceOf('t-bug2')).toBe(base);
  });

  it('친구 섬 시세: 인기 생물이 날마다 내 것과 다르게', () => {
    const { game, econ } = boot();
    const fishes = Array.from({ length: 6 }, (_, i) => sp(`ff${i}`, 'fish', 1));
    const bugs = Array.from({ length: 6 }, (_, i) => sp(`bb${i}`, 'bug', 1));
    const seas = Array.from({ length: 6 }, (_, i) => sp(`ss${i}`, 'sea', 1));
    game.state.register([...fishes, ...bugs, ...seas]);
    for (let d = 0; d < 6; d++) {
      game.env!.advance(d === 0 ? 0 : 1800);
      const mine = econ.market().hot, fr = econ.friendMarket().hot;
      expect(fr.length).toBe(3);
      for (const id of fr) expect(mine).not.toContain(id);
      // 친구 섬에서 파는 값: 친구 인기 ×2, 내 인기는 보통 값
      const a = fr[0], b = mine[0];
      expect(econ.priceOf(a, { where: 'friend' })).toBe(econ.priceOf(a, { shop: 'quack' } as never) * 2);
      expect(econ.priceOf(b, { where: 'friend' })).toBe(econ.priceOf(b, { shop: 'quack' } as never) / 2);
    }
    // 순수 함수: 겹치면 다음 칸
    expect(friendHot([['a', 'b', 'c']], ['a'], () => 0)).toEqual(['b']);
  });
});

describe('재활용 포인트 → 반짝별', () => {
  it('10포인트 = 반짝별 1(남은 포인트는 쌓인다)', () => {
    expect(recycleToStars(25)).toEqual({ stars: 2, left: 5 });
    expect(RECYCLE_PER_STAR).toBe(10);
    const { game, econ, ev } = boot();
    econ.give('t_can', 25);
    const stars0 = econ.stars;
    const coins = econ.sell('t_can', 25, 'junk');
    expect(coins).toBe(250);
    expect(econ.stars - stars0).toBe(2);
    expect(econ.recycle()).toEqual({ points: 5, total: 25 });
    econ.give('t_boot', 5);
    econ.sell('t_boot', 5, 'junk');
    expect(econ.stars - stars0).toBe(3);
    expect(econ.recycle().points).toBe(0);
    expect(ev.of('recycle').length).toBe(2);
    // 고물상의 쓰레기 값은 판매 포화가 없다(늘 10)
    econ.give('t_can', 12);
    expect(econ.sell('t_can', 12, 'junk')).toBe(120);
    // 꽥꽥상회에서 팔면 포인트 없음
    econ.give('t_boot', 3);
    econ.sell('t_boot', 3, 'quack');
    expect(econ.recycle().total).toBe(42);
    void game;
  });
});

describe('캡슐머신', () => {
  it('확률표: 등급 70/25/5, 상품 확률 합 100%', () => {
    const t = capsuleOddsTable();
    const byG = (g: number) => t.filter((o) => o.grade === g).reduce((a, o) => a + o.pct, 0);
    expect(byG(1)).toBeCloseTo(70, 6);
    expect(byG(2)).toBeCloseTo(25, 6);
    expect(byG(3)).toBeCloseTo(5, 6);
    const sum = CAPSULE_POOL.reduce((a, p) => a + capsuleChance(p.id), 0);
    expect(sum).toBeCloseTo(1, 9);
    expect(CAPSULE_GRADE_W).toEqual({ 1: 70, 2: 25, 3: 5 });
    // 의상·스킨·가구가 모두 있고 스킨은 탈것마다 3색
    expect(CAPSULE_POOL.some((p) => p.kind === 'cos' && p.id.startsWith('cos_'))).toBe(true);
    expect(CAPSULE_POOL.filter((p) => p.id.startsWith('skin_bike_')).map((p) => p.id).sort()).toEqual(['skin_bike_1', 'skin_bike_2', 'skin_bike_3']);
    expect(CAPSULE_POOL.some((p) => p.kind === 'furniture' && p.id.startsWith('f_cap_'))).toBe(true);
    for (const p of CAPSULE_POOL) expect(GOODS[p.id]?.name, p.id).toBeTruthy();
  });

  it('굴림 분포가 표와 맞고 천장(30번째 특별)이 걸린다', () => {
    const r = rngFor('capsule-dist');
    const n = 20000;
    const cnt: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < n; i++) cnt[rollCapsule(r, 0).grade]++;
    expect(cnt[1] / n).toBeCloseTo(0.7, 1);
    expect(cnt[2] / n).toBeCloseTo(0.25, 1);
    expect(cnt[3] / n).toBeGreaterThan(0.035);
    expect(cnt[3] / n).toBeLessThan(0.065);
    const pity = rollCapsule(rngFor('p'), CAPSULE_PITY);
    expect(pity.grade).toBe(3);
    expect(pity.pityHit).toBe(true);
    expect(dupStars(CAPSULE_POOL.find((p) => p.kind === 'cos')!, true)).toBeGreaterThan(0);
    expect(dupStars(CAPSULE_POOL.find((p) => p.kind === 'furniture')!, true)).toBe(0);
  });

  it('티켓 1장 = 1회, 같은 저장이면 같은 결과(결정적), 반짝별 20 → 티켓', () => {
    const run = () => {
      stubLocalStorage();
      const { game, econ } = boot();
      game.state.addItem('it_capsule', 8);
      const out = Array.from({ length: 8 }, () => econ.capsule.roll()!.id);
      expect(econ.capsule.tickets).toBe(0);
      expect(econ.capsule.roll()).toBeNull();
      return { out, game, econ };
    };
    const a = run().out, b = run();
    expect(b.out).toEqual(a);
    // 상품이 가방(또는 반짝별)으로
    for (const id of new Set(b.out)) if (!id.startsWith('f_cap_')) expect((b.game.state.bag[id] ?? 0) > 0 || b.econ.capsule.got()[id] > 0).toBe(true);
    // 반짝별 20 → 티켓 1(캡슐머신 가게)
    b.econ.addStars(20, 'test');
    expect(b.econ.buy('capsule_ticket')).toBe(true);
    expect(b.econ.capsule.tickets).toBe(1);
    expect(SHOP.get('shop_capsule')!.cost).toEqual({ stars: 20 });
    // use('it_capsule') 도 같은 굴림
    expect(b.econ.use('it_capsule')).toBe(true);
    expect(b.econ.capsule.tickets).toBe(0);
  });

  it('의상·스킨은 옷장 칸(가방 칸을 쓰지 않는다), 가진 걸 또 뽑으면 반짝별', () => {
    const { game, econ } = boot();
    const used = econ.bag.used;
    econ.give('cos_ribbon', 1);
    econ.give('skin_bike_1', 1);
    expect(econ.bag.used).toBe(used);
    // 모든 상품을 이미 가진 상태로 만들면 의상·스킨은 반짝별로 바뀐다
    for (const p of CAPSULE_POOL) if (p.kind !== 'furniture') game.state.addItem(p.id, 1);
    game.state.addItem('it_capsule', 30);
    let dup = 0, furn = 0;
    for (let i = 0; i < 30; i++) { const r = econ.capsule.roll()!; if (r.kind === 'furniture') furn++; else { expect(r.dup).toBe(true); expect(r.stars).toBeGreaterThan(0); dup++; } }
    expect(dup + furn).toBe(30);
  });

  it('창 capsule 이 등록돼 있다', () => {
    const { game } = boot();
    expect(game.hud.panel('capsule')).toBeTruthy();
    expect(game.hud.panel('bagfull')).toBeTruthy();
    expect(game.hud.panel('figure')).toBeTruthy();
    expect(game.hud.chips().some((c) => c.id === 'econ:buffs')).toBe(true);
  });
});

describe('피규어 공방(같은 종 5 → 1)', () => {
  it('보통 5마리 → f_figure_<종> 1개', () => {
    const { game, econ, ev } = boot();
    game.state.register([sp('fig-carp', 'fish', 1)]);
    econ.give('fig-carp', 4);
    expect(econ.figurine('fig-carp')).toBe(false);
    econ.give('fig-carp', 2);
    expect(econ.figurine('fig-carp')).toBe(true);
    expect(game.state.bag['fig-carp']).toBe(1);
    expect(game.state.bag.f_figure_fig_carp ?? game.state.bag['f_figure_fig-carp']).toBe(1);
    expect(GOODS['f_figure_fig-carp'].name).toBe('fig-carp 피규어');
    expect(ev.of('figurine')[0]).toMatchObject({ species: 'fig-carp', id: 'f_figure_fig-carp' });
  });
  it('꼬마는 두 마리로 친다 · 반짝이·왕관은 쓰지 않는다', () => {
    expect(figurePoints({ a: 1, 'a@tiny': 2 }, 'a')).toBe(5);
    expect(figurePlan({ a: 1, 'a@tiny': 2, 'a@shiny': 3 }, 'a')).toEqual({ a: 1, 'a@tiny': 2 });
    expect(figurePlan({ 'a@tiny': 3 }, 'a')).toEqual({ 'a@tiny': 3 });
    expect(figurePlan({ a: 9, 'a@tiny': 1 }, 'a')).toEqual({ a: 3, 'a@tiny': 1 });
    expect(figurePlan({ a: 2, 'a@crown': 5 }, 'a')).toBeNull();
    const { game, econ } = boot();
    game.state.register([sp('fig-moth', 'bug', 2)]);
    game.state.addItem('fig-moth@tiny', 2);
    game.state.addItem('fig-moth', 1);
    game.state.addItem('fig-moth@shiny', 1);
    expect(econ.figureList()[0]).toEqual({ id: 'fig-moth', points: 5 });
    expect(econ.craft('r_figure')).toBe(true);
    expect(game.state.bag['fig-moth@shiny']).toBe(1);
    expect(game.state.bag['fig-moth@tiny'] ?? 0).toBe(0);
    expect(game.state.bag['f_figure_fig-moth']).toBe(1);
  });
});

describe('버프(먹기·마시기)', () => {
  it('순수: 게임 분 → 게임 시계 초, 끝나면 빠진다', () => {
    const s: Record<string, number> = {};
    applyBuff(s, 'grilled', 30, 100);
    expect(s.grilled).toBe(100 + 30 * GAME_MIN_SEC);
    expect(GAME_MIN_SEC).toBe(HOUR_SEC / 60);
    expect(activeBuffs(s, 100 + 30 * GAME_MIN_SEC - 0.01).map((b) => b.name)).toEqual(['grilled']);
    expect(activeBuffs(s, 100 + 30 * GAME_MIN_SEC)).toEqual([]);
    applyBuff(s, 'grilled', 5, 100); // 더 짧은 건 줄이지 않는다
    expect(s.grilled).toBe(100 + 30 * GAME_MIN_SEC);
    expect(pruneBuffs(s, 1e9)).toEqual(['grilled']);
    expect(rollMods(['lucky', 'clover', 'grilled'])).toEqual({ buffs: ['lucky', 'clover', 'grilled'], luckMult: 3 });
  });

  it('생선구이를 먹으면 게임 30분 — env 시계로 끝난다', () => {
    const { game, econ, ev } = boot();
    econ.give('it_grilled_fish', 1);
    expect(econ.use('it_grilled_fish')).toBe(true);
    expect(game.state.bag.it_grilled_fish ?? 0).toBe(0);
    expect(econ.buffs().map((b) => b.name)).toEqual(['grilled']);
    expect(ev.of('use')[0]).toMatchObject({ id: 'it_grilled_fish', buff: 'grilled', minutes: 30 });
    game.env!.advance(29 * GAME_MIN_SEC);
    expect(econ.buffs().map((b) => b.name)).toEqual(['grilled']);
    game.env!.advance(2 * GAME_MIN_SEC);
    expect(econ.buffs()).toEqual([]);
    game.tick(1.1, 1);
    expect(ev.of('buff-end').map((e) => e.name)).toEqual(['grilled']);
    // 없는 걸 먹으면 false, 음식 표
    expect(econ.use('it_grilled_fish')).toBe(false);
    expect(FOODS.it_lucky_cookie).toMatchObject({ buff: 'lucky', minutes: 1440 });
    expect(FOODS.it_fruit_pie.buff).toBe('speed');
  });

  it('행운 쿠키·물약·과일·addBuff(다른 모듈)', () => {
    const { econ, ev } = boot();
    econ.give('it_lucky_cookie', 1);
    econ.give('it_potion_star', 1);
    econ.give('m_apple', 1);
    expect(econ.use('it_lucky_cookie')).toBe(true);
    expect(econ.use('it_potion_star')).toBe(true);
    expect(econ.use('m_apple')).toBe(true);
    econ.addBuff('clover', 120);
    const names = econ.buffs().map((b) => b.name).sort();
    expect(names).toEqual(['clover', 'lucky', 'power', 'starlight']);
    expect(econ.rollMods().luckMult).toBeCloseTo(3, 9);
    expect(ev.of('use').find((e) => e.id === 'm_apple')).toMatchObject({ kind: 'fruit' });
    expect(econ.use('m_wood')).toBe(false);
  });

  it('켜진 버프는 rollCatch 에 저절로 실린다(같은 난수면 희귀도가 같거나 높다)', () => {
    const pool = [1, 2, 3, 4, 5].map((r) => sp(`rr${r}`, 'fish', r, { len: 30 }));
    const rolls = (buff: string | null) => {
      stubLocalStorage();
      const { econ } = boot();
      if (buff) econ.addBuff(buff, 600);
      // 오늘 첫 잡기 보상(★3+ 확정)은 이미 받은 걸로 — 그래야 ★1~5 전부에서 굴린다
      (econ.flags() as { roll: { firstDay: Record<string, number> } }).roll.firstDay.fish = econ.day();
      return Array.from({ length: 400 }, () => econ.rollCatch({ activity: 'fish', pool, commit: false } as never));
    };
    const plain = rolls(null), grilled = rolls('grilled');
    let up = 0;
    plain.forEach((r, i) => { expect(grilled[i].rarity).toBeGreaterThanOrEqual(r.rarity); if (grilled[i].rarity > r.rarity) up++; });
    expect(up).toBeGreaterThan(0);
    // 행운 쿠키: 반짝이 수가 늘거나 같다
    const lucky = rolls('lucky');
    const shiny = (l: typeof plain) => l.filter((r) => r.variant === 'shiny').length;
    expect(shiny(lucky)).toBeGreaterThanOrEqual(shiny(plain));
    lucky.forEach((r, i) => { if (plain[i].variant === 'shiny') expect(r.variant).toBe('shiny'); });
    // 순수 굴림: 별빛 물약 ★4+ · 쑥쑥 물약 크기
    const env: RollEnv = { day: 3, hour: 12, tod: 'day', weather: 'clear', p0: false, rng: (k) => rngFor(k) };
    let bigger = 0;
    for (let i = 0; i < 200; i++) {
      const a = rollPure({ activity: 'bug', pool, commit: false }, Object.assign(newRollState(), { count: { bug: i } }), env);
      const b = rollPure({ activity: 'bug', pool, commit: false, buffs: ['bigsize'] }, Object.assign(newRollState(), { count: { bug: i } }), env);
      if (a.species?.id === b.species?.id && (b.size ?? 0) > (a.size ?? 0)) bigger++;
    }
    expect(bigger).toBeGreaterThan(100);
  });
});

describe('집 보관함·놓아주기·전시·투자', () => {
  it('보관함 200칸 — 가방 ↔ 보관함, 꽉 차면 거절', () => {
    const { game, econ, ev } = boot();
    expect(econ.storage.size).toBe(STORAGE_SIZE);
    expect(STORAGE_SIZE).toBe(200);
    econ.give('m_wood', 40);
    expect(econ.storage.put('m_wood', 35)).toBe(true);
    expect(game.state.bag.m_wood).toBe(5);
    expect(econ.storage.used).toBe(2); // 30 + 5 → 두 칸
    expect(econ.storage.put('m_wood', 10)).toBe(false); // 가방에 5개뿐
    // 199칸을 채운다(서로 다른 재료 1개씩) → 1칸 남음
    const f = econ.flags() as { storage: Record<string, number> };
    for (let i = 0; i < 197; i++) f.storage[`m_fill_${i}`] = 1;
    expect(econ.storage.free).toBe(1);
    econ.give('m_stone', 2);
    expect(econ.storage.put('m_stone', 1)).toBe(true);
    expect(econ.storage.free).toBe(0);
    expect(econ.storage.put('m_stone', 1)).toBe(true); // 같은 칸(30까지)엔 더 들어간다
    econ.give('m_clay', 1);
    expect(econ.storage.put('m_clay', 1)).toBe(false);
    // 꺼내기
    expect(econ.storage.take('m_wood', 35)).toBe(true);
    expect(game.state.bag.m_wood).toBe(40);
    expect(econ.storage.take('m_wood', 1)).toBe(false);
    expect(ev.of('storage').length).toBeGreaterThanOrEqual(3);
  });

  it('가방이 꽉 차서 못 넣은 친구: 하나 놓아주면 바로 들어간다 · 버리면 땅에 꾸러미(E 로 다시)', () => {
    const { game, econ, ev } = boot();
    const fishes = Array.from({ length: 21 }, (_, i) => sp(`bf${i}`, 'fish', 1));
    game.state.register(fishes);
    for (let i = 0; i < 19; i++) econ.give(`bf${i}`, 1);
    econ.give('m_wood', 3);
    expect(econ.bag.free).toBe(0);
    game.state.collect({ species: fishes[20], size: 10, activity: 'fish' } as never);
    expect(game.state.bag.bf20 ?? 0).toBe(0);
    expect(ev.of('bag-full').length).toBe(1);
    expect(econ.release('bf3')).toBe(true);
    expect(ev.of('release').at(-1)).toMatchObject({ species: 'bf3', n: 1 });
    expect(game.state.bag.bf3 ?? 0).toBe(0);
    expect(game.state.bag.bf20).toBe(1); // 구해 줬다
    // 재료는 버리기 → 땅에 꾸러미 → E 로 다시 줍기
    expect(econ.release('m_wood')).toBe(false);
    expect(econ.drop('m_wood')).toBe(true);
    expect(game.state.bag.m_wood ?? 0).toBe(0);
    expect(game.interact('econ-drop')).toBeTruthy();
    expect(game.state.bag.m_wood).toBe(3);
  });

  it('전시: 가방 → 진열장(칸은 집 단계), 내리면 가방으로', () => {
    const { game, econ, ev } = boot();
    game.state.register([sp('dp-fish', 'fish', 3)]);
    econ.give('dp-fish', 2);
    expect(econ.display('dp-fish', true)).toBe(true);
    expect(game.state.bag['dp-fish']).toBe(1);
    expect(econ.displayed()).toEqual([{ id: 'dp-fish', n: 1 }]);
    expect(ev.of('display')[0]).toMatchObject({ id: 'dp-fish', on: true });
    expect(econ.display('m_wood', true)).toBe(false);
    expect(econ.display('dp-fish', false)).toBe(true);
    expect(game.state.bag['dp-fish']).toBe(2);
    expect(displayMax(0)).toBe(10);
    expect(displayMax(4)).toBe(30);
  });

  it('투자: 비용을 내고 flags.econ.invested 에 쌓인다', () => {
    const { game, econ, ev } = boot();
    game.state.coins = 50000;
    econ.give('m_coral', 5);
    expect(econ.invest('coral', { coins: 20000, items: { m_coral: 5 } })).toBe(true);
    expect(game.state.coins).toBe(30000);
    expect(econ.invest('coral', { coins: 40000 })).toBe(false);
    expect(econ.invest('coral', { coins: 10000 })).toBe(true);
    expect(econ.invested('coral')).toEqual({ coins: 30000, stars: 0, items: { m_coral: 5 }, n: 2 });
    expect((econ.flags() as { invested: Record<string, unknown> }).invested.coral).toBeTruthy();
    expect(ev.of('invest').length).toBe(2);
  });

  it('저장 → 다시 불러오면 보관함·전시·버프·캡슐 천장이 그대로', () => {
    const a = boot();
    a.game.state.register([sp('sv-fish', 'fish', 1)]);
    a.econ.give('m_wood', 10);
    a.econ.storage.put('m_wood', 4);
    a.econ.give('sv-fish', 1);
    a.econ.display('sv-fish', true);
    a.econ.addBuff('grilled', 30);
    a.game.state.addItem('it_capsule', 2);
    a.econ.capsule.roll();
    a.game.state.saveNow();
    const b = boot('?p0=0', { load: true });
    expect(b.econ.storage.list()).toEqual([{ id: 'm_wood', n: 4 }]);
    expect(b.econ.displayed()).toEqual([{ id: 'sv-fish', n: 1 }]);
    expect(b.econ.buffs().map((x) => x.name)).toEqual(['grilled']);
    expect(b.econ.capsule.pityLeft).toBe(a.econ.capsule.pityLeft);
  });
});

describe('섬 가게 품목·해금', () => {
  it('다이빙 숍: 잠수정 선체 + 50,000 → v:submarine', () => {
    const { game, econ } = boot();
    expect(econ.shopItems('diving').map((s) => s.id)).toEqual(expect.arrayContaining(['shop_snorkel', 'shop_wetsuit', 'shop_submarine']));
    game.state.coins = 100000;
    expect(econ.canBuy('shop_submarine').ok).toBe(false); // 선체가 없다
    expect(econ.isUnlocked('v:submarine')).toBe(false);
    // 선체 설계 의뢰(반짝별) → 작업대 r_sub_hull → 잠수정
    econ.addStars(30, 'test');
    expect(econ.buy('diving_hull_plan')).toBe(true);
    for (const [k, n] of Object.entries(econ.needsOf('r_sub_hull'))) econ.give(k, n);
    expect(econ.craft('r_sub_hull')).toBe(true);
    expect(game.state.bag.p_sub_hull).toBe(1);
    expect(econ.buy('shop_submarine')).toBe(true);
    expect(econ.isUnlocked('v:submarine')).toBe(true);
    expect(game.state.bag.p_sub_hull ?? 0).toBe(0);
    expect(game.state.bag.v_submarine).toBeUndefined();
    expect(econ.canBuy('shop_submarine').ok).toBe(false); // 한 번만
    // 스노클 → 잠수복 순서
    expect(econ.canBuy('shop_wetsuit').ok).toBe(false);
    expect(econ.buy('shop_snorkel')).toBe(true);
    expect(econ.isUnlocked('tool:snorkel')).toBe(true);
    expect(econ.buy('shop_wetsuit')).toBe(true);
  });

  it('모든 섬 가게에 품목이 있고 P1 진열만 남은 품목이 없다', () => {
    const { econ } = boot();
    for (const shop of ['beach', 'bazaar', 'diving', 'potion', 'moon', 'junk', 'station', 'sheep', 'capsule']) expect(econ.shopItems(shop).length, shop).toBeGreaterThan(0);
    expect(SHOP_ITEMS.filter((s) => s.p1)).toEqual([]);
    expect(SHOP.get('shop_duck_tube')).toMatchObject({ shop: 'beach', unlock: 'v:duck_tube', cost: { coins: 1500 } });
    expect(SHOP.get('shop_buggy')).toMatchObject({ shop: 'bazaar', unlock: 'v:buggy', cost: { coins: 80000 } });
    expect(SHOP.get('shop_submarine')!.cost).toEqual({ coins: 50000, items: { p_sub_hull: 1 } });
    // 떡방아 품목은 달떡으로
    for (const s of econ.shopItems('moon')) expect(Object.keys(s.cost.items ?? {})).toEqual(['m_mochi']);
    // 양 옷가게는 의상만
    for (const s of econ.shopItems('sheep')) expect(Object.keys(s.gives ?? {})[0].startsWith('cos_')).toBe(true);
    expect(COSMETIC_TABLE.length).toBeGreaterThanOrEqual(15);
  });

  it('오리튜브(해변)·버기(바자르) 사면 해금', () => {
    const { game, econ } = boot();
    game.state.coins = 200000;
    expect(econ.buy('shop_duck_tube')).toBe(true);
    expect(econ.buy('shop_buggy')).toBe(true);
    expect(econ.isUnlocked('v:duck_tube') && econ.isUnlocked('v:buggy')).toBe(true);
  });

  it('주민 초대권: ext.npc.moveIn 이 있으면 쓰고 하나 줄어든다', () => {
    const { game, econ, ev } = boot();
    econ.addStars(50, 'test');
    expect(econ.buy('shop_invite')).toBe(true);
    expect(econ.use('it_invite')).toBe(false); // moveIn 이 아직 없다 → 간직
    expect(game.state.bag.it_invite).toBe(1);
    const calls: unknown[][] = [];
    game.ext.npc = { moveIn: (...a: unknown[]) => { calls.push(a); return 'npc_panda'; }, nextResident: () => 'npc_panda' };
    expect(econ.useInvite('coral')).toBe(true);
    expect(calls[0]).toEqual(['npc_panda', 'coral']);
    expect(game.state.bag.it_invite ?? 0).toBe(0);
    expect(ev.of('invite')[0]).toMatchObject({ island: 'coral', npc: 'npc_panda' });
  });
});
