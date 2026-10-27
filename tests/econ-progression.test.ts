// 경제 v2(econ-service) — 가짜 게임에서 P0 소비 루프(GDD 4.9)를 화면 없이 처음부터 끝까지:
// 재료 → 뗏목 제작 → 도감 반짝별 → 로켓 설계도(⭐20) → 부품 5개 제작 → 별자리 물고기 3종 기증(항법 칩) → 발사대(30,000) → 발사 가능.
// 그 밖에 가방 규칙·판매가(우주 물건 ×1.8·반짝이 ×5·포화)·날 바뀜·잡기 굴림·저장 이전·치트.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import buildEconomy from '../src/modules/economy';
import { SAVE_KEY, type Species } from '../src/core/state';
import { DAY_SEC, type EconApi } from '../src/core/api';
import { MATERIALS, ROCKET_PARTS } from '../src/modules/economy/data';
import { canLaunch, canMount, islandsVisited, rocketStatus, requirementText } from '../src/modules/economy/progression';
import { rotatePick, saturationMult, unitPrice } from '../src/modules/economy/price';
import { addableCount, bagSize, beltOf, usedSlots } from '../src/modules/economy/bag';
import { canAffordWith, keysFromPieces, costText } from '../src/modules/economy/currency';

type Econ = EconApi & {
  craftCheck(rid: string): { ok: boolean; why?: string };
  counter(name: string): number;
  shopCost(id: string): { coins?: number; stars?: number };
};

const fish = (id: string, rarity: number, extra: Partial<Species> = {}): Species => ({ id, name: id, category: 'fish', rarity, ...extra });
const bug = (id: string, rarity: number): Species => ({ id, name: id, category: 'bug', rarity });

function boot(search = '', o: { load?: boolean } = {}) {
  const game = makeFakeGame({ search, load: o.load });
  const ctx = makeCtx(game);
  buildEconomy(ctx as never);
  return { game, econ: game.econ as unknown as Econ, ev: recordEvents(game) };
}

/** 레시피 재료를 다 넣어 주고 만들기 */
function craftWith(game: FakeGame, econ: Econ, rid: string) {
  for (const [k, n] of Object.entries(econ.needsOf(rid))) econ.give(k, n, 'test');
  return econ.craft(rid);
}

beforeEach(() => { stubLocalStorage(); });

describe('P0 소비 루프 한 판(GDD 4.9)', () => {
  it('뗏목 → 반짝별 → 설계도 → 부품 6 → 발사대 → 발사', () => {
    const { game, econ, ev } = boot();
    const st = game.state;
    expect(econ.p0).toBe(true);
    expect(econ.cheat).toBe(false);

    // 새 저장: 낚싯대·잠자리채 + 그 키. 도구는 벨트라 가방 칸을 안 쓴다
    expect(st.bag.tool_rod).toBe(1);
    expect(st.bag.tool_net).toBe(1);
    expect(econ.isUnlocked('tool:rod') && econ.isUnlocked('tool:net')).toBe(true);
    expect(econ.bag.belt()).toEqual(['tool_rod', 'tool_net']);
    expect(econ.bag.used).toBe(0);
    expect(econ.bag.size).toBe(20);

    // 뗏목(P0: 나무 4 + 덩굴 1) → v:raft 해금, 가방엔 v_raft 가 없다
    expect(econ.needsOf('r_raft')).toEqual({ m_wood: 4, m_vine: 1 });
    expect(econ.canCraft('r_raft')).toBe(false);
    econ.give('m_wood', 4); econ.give('m_vine', 1);
    expect(econ.canCraft('r_raft')).toBe(true);
    expect(econ.craft('r_raft')).toBe(true);
    expect(econ.isUnlocked('v:raft')).toBe(true);
    expect(st.bag.v_raft).toBeUndefined();
    expect(st.bag.m_wood).toBeUndefined();
    expect(ev.of('craft').at(-1)).toMatchObject({ id: 'r_raft', gives: 'v:raft' });
    expect(ev.of('unlock').some((e) => e.key === 'v:raft')).toBe(true);
    expect(econ.canCraft('r_raft')).toBe(false); // 두 번은 안 만든다
    expect(canMount('raft', econ)).toBe(true);
    expect(canMount('bike', econ)).toBe(false);

    // 도감 첫 등록 → 반짝별(★3 = 3)
    const big = fish('t_big', 3, { price: 700 });
    st.register([big]);
    game.ui.showCatch({ species: big, activity: 'fish' });
    expect(econ.stars).toBe(3);
    game.ui.showCatch({ species: big, activity: 'fish' }); // 두 번째는 별 없음
    expect(econ.stars).toBe(3);
    expect(econ.counter('fish')).toBe(2);

    // 설계도 없이 부품은 못 만든다
    expect(econ.craftCheck('r_rocket_body')).toMatchObject({ ok: false });
    expect(econ.craftCheck('r_rocket_body').why).toContain('설계도');

    // 로켓 설계도 ⭐20(P0) — 섬 방문 조건은 P0 에서 빠진다
    expect(econ.shopPrice('shop_blueprint')).toEqual({ stars: 20 });
    expect(econ.canBuy('shop_blueprint').ok).toBe(false);
    econ.addStars(17, 'test');
    expect(econ.canBuy('shop_blueprint').ok).toBe(true);
    expect(econ.buy('shop_blueprint')).toBe(true);
    expect(econ.stars).toBe(0);
    expect(econ.rocket().blueprint).toBe(true);
    expect(econ.buy('shop_blueprint')).toBe(false); // 한 번만

    // 부품 5개 제작(P0 재료 1/5)
    for (const p of ROCKET_PARTS) if (p.recipe) expect(craftWith(game, econ, p.recipe)).toBe(true);
    expect(econ.rocket().count).toBe(5);
    expect(econ.rocket().parts.chip).toBe(false);
    // 부품이 6개가 아니면 발사대는 못 산다
    st.addCoins(30000, 'test');
    expect(econ.canBuy('shop_launchpad').ok).toBe(false);
    expect(econ.canBuy('shop_launchpad').why).toContain('5/6');

    // 별자리 물고기 3종 기증 → 항법 칩
    const zod = [1, 2, 3].map((i) => fish(`t_zod${i}`, 2, { tags: ['set:zodiac'] }));
    st.register(zod);
    for (const z of zod) game.ui.showCatch({ species: z, activity: 'fish' });
    expect(econ.stars).toBe(6); // ★2 × 3
    expect(econ.canDonate('t_zod1')).toBe(true);
    expect(econ.donate('t_zod1')).toBe(true);
    expect(econ.donate('t_zod2')).toBe(true);
    expect(econ.isUnlocked('rocket:part:chip')).toBe(false);
    expect(econ.donate('t_zod3')).toBe(true);
    expect(econ.isUnlocked('rocket:part:chip')).toBe(true);
    expect(econ.isDonated('t_zod1') && !econ.canDonate('t_zod1')).toBe(true);
    expect(econ.stars).toBe(12); // 기증 ★2 × 3
    expect(ev.of('donate').at(-1)).toMatchObject({ id: 't_zod3', coins: 400, stars: 2 });
    expect(econ.rocket().count).toBe(6);

    // 발사대 전엔 발사 못 함
    expect(canLaunch(econ)).toBe(false);
    expect(econ.requirement('rocket')).toEqual({ ok: false, text: '🔒 로켓 — 부품 6/6 · 발사대' });
    expect(econ.shopPrice('shop_launchpad')).toEqual({ coins: 30000 });
    expect(econ.buy('shop_launchpad')).toBe(true);
    expect(st.coins).toBe(400 * 3);
    expect(canLaunch(econ)).toBe(true);
    expect(econ.requirement('rocket').ok).toBe(true);
    expect(canMount('rocket', econ)).toBe(true);
  });
});

describe('해금·잠금 안내', () => {
  it('requirement 는 사람 말로', () => {
    const { econ } = boot();
    expect(econ.requirement('v:bike')).toEqual({ ok: false, text: '🔒 자전거 — 꽥꽥상회 1,600' });
    expect(econ.requirement('v:raft').text).toBe('🔒 뗏목 — 작업대 나무 4 + 덩굴 밧줄 1');
    expect(econ.requirement('rocket').text).toBe('🔒 로켓 — 설계도 · 부품 0/6 · 발사대');
    expect(econ.requirement('rocket:part:chip').text).toContain('별자리 물고기 3종');
    expect(econ.requirement('tool:rod').ok).toBe(true);
  });

  it('unlock 은 한 번만 이벤트를 쏘고 저장한다', () => {
    const { game, econ, ev } = boot();
    econ.unlock('house:1', 'test');
    econ.unlock('house:1', 'test');
    expect(ev.of('unlock').filter((e) => e.key === 'house:1')).toHaveLength(1);
    expect(ev.of('unlock')[0]).toMatchObject({ key: 'house:1', why: 'test' });
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!);
    expect(raw.flags.econ.unlocks).toContain('house:1');
    expect(game.state.flags.econ).toBe(econ.flags());
  });

  it('가방 확장은 순서대로, 자전거 바구니 +5', () => {
    const { game, econ } = boot();
    game.state.addCoins(1_000_000);
    expect(econ.canBuy('shop_bag40')).toMatchObject({ ok: false });
    expect(econ.buy('shop_bag30')).toBe(true);
    expect(econ.bag.size).toBe(30);
    expect(econ.buy('shop_bag40')).toBe(true);
    expect(econ.buy('shop_bike')).toBe(true);
    expect(econ.bag.size).toBe(45);
    expect(bagSize(() => true)).toBe(55);
  });

  it('도구는 사면 키가 같이 열리고, 같은 도구는 두 번 못 산다', () => {
    const { game, econ } = boot();
    game.state.addCoins(5000);
    expect(econ.buy('shop_shovel')).toBe(true);
    expect(econ.isUnlocked('tool:shovel')).toBe(true);
    expect(econ.bag.belt()).toContain('tool_shovel');
    expect(econ.canBuy('shop_shovel').ok).toBe(false);
    // 벨트는 5칸 — 넘치는 도구는 가방 한 칸
    for (const t of ['tool_hammer', 'tool_slingshot', 'tool_snorkel']) econ.give(t, 1);
    expect(econ.bag.belt()).toHaveLength(5);
    expect(econ.bag.used).toBe(1);
    expect(econ.give('tool_rod', 1)).toBe(0); // 이미 있다(도구는 1개)
  });

  it('islandsVisited 는 worldterrain 발견 기록과 econ 카운터를 합친다', () => {
    expect(islandsVisited({ world: { disc: ['dino', 'island:ice', 'lm:home:x', 'home'] } })).toBe(2);
    expect(islandsVisited({ world: { disc: { coral: 1 } }, econ: { counters: { visit_desert: 1, visit_dino: 0 } } })).toBe(2);
    expect(islandsVisited(null)).toBe(0);
    expect(rocketStatus(() => false).count).toBe(0);
    expect(requirementText('v:raft', { isUnlocked: () => true }, true).ok).toBe(true);
  });

  it('정식 모드(p0=0)에선 섬 방문 조건이 산다', () => {
    const { game, econ } = boot('?p0=0');
    expect(econ.p0).toBe(false);
    expect(econ.shopPrice('shop_blueprint')).toEqual({ stars: 200 });
    econ.addStars(500, 'test');
    expect(econ.canBuy('shop_blueprint')).toMatchObject({ ok: false });
    expect(econ.canBuy('shop_blueprint').why).toContain('0/4');
    game.state.emit({ type: 'discover', place: 'dino', name: '쿵쿵섬', kind: 'island' });
    game.state.flags.world = { disc: ['ice', 'coral', 'desert'] };
    expect(econ.counter('islands')).toBe(4);
    expect(econ.buy('shop_blueprint')).toBe(true);
  });
});

describe('재화', () => {
  it('반짝별 쓰기·열쇠 조각(3조각 = 열쇠 1)·녹슨 열쇠', () => {
    const { game, econ, ev } = boot();
    econ.addStars(5, 'test');
    expect(econ.spendStars(9, 'x')).toBe(false);
    expect(econ.spendStars(4, 'x')).toBe(true);
    expect(econ.stars).toBe(1);
    expect(ev.of('stars').map((e) => e.delta)).toEqual([5, -4]);

    expect(econ.give('t_rustykey', 1)).toBe(1);
    expect(game.state.bag.t_rustykey).toBeUndefined();
    expect(econ.keys.silver).toBe(1);
    // 다른 모듈이 직접 addItem 해도, 낚시로 잡아도(collect) 조각으로 바뀐다
    game.state.addItem('t_rustykey', 1);
    const key = game.state.species.get('t_rustykey')!;
    game.state.collect({ species: key, activity: 'fish' });
    expect(game.state.bag.t_rustykey).toBeUndefined();
    expect(econ.keys.silver).toBe(3);
    expect(econ.keyCount('silver')).toBe(1);
    expect(econ.useKey('silver')).toBe(true);
    expect(econ.useKey('silver')).toBe(false);
    econ.addKeyPiece('gold', 7);
    expect(econ.keyCount('gold')).toBe(2);
    expect(keysFromPieces(8)).toBe(2);
  });

  it('비용: 코인·반짝별·아이템을 전부 본다', () => {
    const { game, econ } = boot();
    game.state.addCoins(100);
    econ.give('m_iron', 2);
    expect(econ.canAfford({ coins: 100, items: { m_iron: 2 } })).toBe(true);
    expect(econ.canAfford({ coins: 100, stars: 1 })).toBe(false);
    expect(econ.spend({ coins: 60, items: { m_iron: 1 } }, 'test')).toBe(true);
    expect(game.state.coins).toBe(40);
    expect(game.state.bag.m_iron).toBe(1);
    expect(econ.spend({ coins: 41 }, 'test')).toBe(false);
    expect(canAffordWith(undefined, { coins: 0, stars: 0, has: () => false })).toBe(true);
    expect(costText({ coins: 30000, items: { p_engine: 1 } }, () => '통통 엔진')).toBe('30,000코인 · 통통 엔진 1');
  });

  it('반짝이 첫 등록 +10(한 번만), 공룡은 기증 불가', () => {
    const { game, econ } = boot();
    const s = fish('t_shiny', 1);
    const d: Species = { id: 't_dino', name: '공룡', category: 'dino', rarity: 3 };
    game.state.register([s, d]);
    game.ui.showCatch({ species: s, variant: 'shiny' });
    expect(econ.stars).toBe(1 + 10);
    game.ui.showCatch({ species: s, variant: 'shiny' });
    expect(econ.stars).toBe(11);
    game.state.addItem('t_dino', 1);
    expect(econ.canDonate('t_dino')).toBe(false);
    // 반짝이 개체만 있어도 기증은 된다
    expect(econ.canDonate('t_shiny')).toBe(true);
  });
});

describe('가방', () => {
  it('생물 10 · 재료 30 칸, 꽉 차면 give 가 막히고 토스트', () => {
    const { game, econ, ev } = boot();
    const sp = fish('t_bagfish', 1);
    game.state.register([sp]);
    expect(econ.bag.stackMax('t_bagfish')).toBe(10);
    expect(econ.bag.stackMax('t_bagfish@crown')).toBe(10);
    expect(econ.bag.stackMax('m_wood')).toBe(30);
    expect(econ.bag.stackMax('tool_rod')).toBe(1);
    expect(econ.give('m_wood', 31)).toBe(31);
    expect(econ.bag.used).toBe(2);

    // 다른 재료로 20칸을 채운다
    const mats = MATERIALS.filter((m) => !m.noSell && !m.onObtain && m.id !== 'm_wood');
    let i = 0;
    while (econ.bag.free > 0) econ.give(mats[i++].id, 30);
    expect(econ.bag.used).toBe(20);
    const fresh = mats[i].id;
    expect(econ.bag.canAdd(fresh)).toBe(false);
    expect(econ.give(fresh, 1)).toBe(0);
    expect(game.state.bag[fresh]).toBeUndefined();
    expect(game.ui.toasts).toContain('가방이 꽉 찼어요! 🎒');
    expect(ev.of('bag-full').at(-1)).toMatchObject({ id: fresh });
    // 나무 칸(31/60)엔 아직 자리가 있다
    expect(econ.give('m_wood', 40)).toBe(29);
    // 잡아도 가방엔 안 들어가고 도감만(core collect + canAdd)
    game.ui.showCatch({ species: sp, activity: 'fish' });
    expect(game.state.dex.t_bagfish.count).toBe(1);
    expect(game.state.bag.t_bagfish).toBeUndefined();
    // 녹슨 열쇠는 가방을 안 쓴다
    expect(econ.give('t_rustykey', 1)).toBe(1);
  });

  it('순수 도우미: 칸 수·넣을 수 있는 수·벨트', () => {
    const rules = { size: 3, speciesOf: (id: string) => (id.startsWith('f') ? { category: 'fish' } : undefined) };
    expect(usedSlots({ f1: 11, m_wood: 30, tool_rod: 1 }, rules)).toBe(3);
    expect(addableCount({ f1: 11 }, 'f1', 100, rules)).toBe(9 + 10);
    expect(addableCount({}, 'tool_x', 2, rules)).toBe(1);
    expect(beltOf({ tool_net: 1, tool_goldrod: 1, m_wood: 3 })).toEqual(['tool_goldrod', 'tool_net']);
  });
});

describe('판매가·시세', () => {
  it('월석은 지구에서 ×1.8, 다른 섬 과일은 300', () => {
    const { econ } = boot();
    const earth = econ.priceOf('m_moonrock', { where: 'home' });
    const moon = econ.priceOf('m_moonrock', { where: 'space' });
    expect(earth / moon).toBeCloseTo(1.8, 1);
    expect(unitPrice({ id: 'm_moonrock', where: 'home', market: 1, soldBefore: 0 })).toBe(2160);
    expect(unitPrice({ id: 'm_moonrock', where: 'space', market: 1, soldBefore: 0 })).toBe(1200);
    expect(unitPrice({ id: 'm_apple', where: 'island', island: 'coral', market: 1, soldBefore: 0 })).toBe(300);
    expect(unitPrice({ id: 'm_apple', where: 'home', island: 'home', market: 1, soldBefore: 0 })).toBe(100);
    expect(unitPrice({ id: 't_bottle', where: 'home', market: 1, soldBefore: 0 })).toBe(0);
  });

  it('반짝이 가방 키는 ×5 로 팔린다(왕관 ×3 · 꼬마 ×0.8)', () => {
    const { game, econ } = boot();
    game.state.register([fish('t_sell', 2, { price: 200 })]);
    const base = econ.priceOf('t_sell');
    expect(econ.priceOf('t_sell@shiny')).toBe(base * 5);
    expect(econ.priceOf('t_sell@crown')).toBe(base * 3);
    expect(econ.priceOf('t_sell', { variant: 'tiny' })).toBe(Math.round((base * 0.8) / 10) * 10);
    econ.give('t_sell@shiny', 1);
    const coins = game.state.coins;
    expect(econ.sell('t_sell@shiny', 1)).toBe(base * 5);
    expect(game.state.coins).toBe(coins + base * 5);
    expect(game.state.bag['t_sell@shiny']).toBeUndefined();
  });

  it('판매 포화 — 11번째부터 −5%, 날이 바뀌면 처음부터 + 오늘의 인기가 바뀐다', () => {
    const { game, econ } = boot();
    const pool = ['a', 'b', 'c', 'd'].map((x) => fish(`t_mk_${x}`, 1, { price: 100 }));
    game.state.register([...pool, bug('t_mk_bug1', 1), bug('t_mk_bug2', 1)]);
    const id = 't_mk_a';
    const p0 = econ.priceOf(id);
    econ.give(id, 10);
    econ.sell(id, 10);
    expect(econ.priceOf(id)).toBe(Math.round((p0 * 0.95) / 10) * 10);
    econ.give(id, 10);
    econ.sell(id, 10);
    expect(econ.priceOf(id)).toBe(Math.round((p0 * 0.5) / 10) * 10); // 21번째: 바닥 50%
    const hot = econ.market().hot;
    const d = econ.day();
    expect(hot).toHaveLength(2); // 물고기 1 · 곤충 1 (바다·공룡 없음)
    game.env!.advance(DAY_SEC);
    expect(econ.day()).toBe(d + 1);
    const hot2 = econ.market().hot;
    expect(hot2[0]).not.toBe(hot[0]);
    expect(hot2[1]).not.toBe(hot[1]);
    // 하루가 지나면 포화 끝 — 같은 시세 배율로 다시 제값
    const mult = econ.market().mult[id] ?? 1;
    expect(econ.priceOf(id)).toBe(Math.round((100 * mult) / 10) * 10);
    // 'day' 이벤트로도 캐시를 비운다
    game.state.emit({ type: 'day', day: d + 1, prev: d });
    expect(econ.market().day).toBe(d + 1);
  });

  it('포화·돌려 고르기 순수 도우미', () => {
    expect(saturationMult(9)).toBe(1);
    expect(saturationMult(10)).toBeCloseTo(0.95);
    expect(saturationMult(100)).toBe(0.5);
    for (const len of [2, 3, 5]) {
      let prev = -1;
      for (let d = 0; d < 40; d++) {
        const i = rotatePick(len, d, (b) => { let s = b * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); });
        expect(i).not.toBe(prev);
        expect(i >= 0 && i < len).toBe(true);
        prev = i;
      }
    }
  });

  it('sellAll 은 생물·쓰레기만(재료·도구는 남긴다)', () => {
    const { game, econ } = boot();
    game.state.register([fish('t_all', 1, { price: 60 })]);
    econ.give('t_all', 3); econ.give('m_wood', 5); econ.give('t_boot', 2);
    const got = econ.sellAll();
    expect(got).toBeGreaterThan(0);
    expect(game.state.bag.t_all).toBeUndefined();
    expect(game.state.bag.t_boot).toBeUndefined();
    expect(game.state.bag.m_wood).toBe(5);
    expect(game.state.bag.tool_rod).toBe(1);
  });
});

describe('잡기 굴림', () => {
  it('RollState 는 flags.econ.roll, reportCatch → catch, catchFail → 콤보 0', () => {
    const { game, econ, ev } = boot();
    const pool = [fish('t_r1', 1, { len: 30 }), fish('t_r3', 3, { len: 40 })];
    game.state.register(pool);
    const r = econ.rollCatch({ activity: 'fish', pool, commit: false } as never);
    expect(r.species).toBeTruthy();
    expect(r.firstOfDay).toBe(true); // 오늘 첫 잡기 ★3+
    expect(r.rarity).toBe(3);
    expect(econ.combo).toBe(0); // 아직 반영 전
    const out = econ.reportCatch(r) as unknown as { combo: number };
    expect(out.combo).toBe(1);
    expect(econ.combo).toBe(1);
    expect(ev.of('catch').at(-1)).toMatchObject({ activity: 'fish', rarity: 3, combo: 1, firstOfDay: true });
    expect((ev.of('catch').at(-1)!.species as Species).id).toBe('t_r3');
    const roll = (econ.flags() as { roll: { combo: number; count: Record<string, number> } }).roll;
    expect(roll.count.fish).toBe(1);
    // 바로 반영하는 굴림 + reportCatch 는 두 번 세지 않는다
    const r2 = econ.rollCatch({ activity: 'fish', pool });
    econ.reportCatch(r2);
    expect(econ.combo).toBe(2);
    econ.catchFail('fish');
    expect(econ.combo).toBe(0);
    expect(ev.of('catch-fail')).toHaveLength(1);
    expect(econ.pity('fish').since3).toBeGreaterThanOrEqual(0);
    expect(econ.pity('fish').gauge).toBeLessThanOrEqual(1);
    // 달력 배율(ext.calendar.boosts)·해금(isUnlocked)이 env 로 들어간다: 막힌 종은 안 나온다
    game.ext.calendar = { boosts: () => ({ 'set:none': 0 }) };
    const locked = fish('t_locked', 1, { where: [{ dev: 'dev:home:5' }] as never });
    for (let i = 0; i < 20; i++) expect(econ.rollCatch({ activity: 'bug', pool: [locked, pool[0]] }).species?.id).not.toBe('t_locked');
  });
});

describe('저장·치트', () => {
  it('옛 저장의 v_raft·v_sled 는 가방에서 빼고 해금으로', () => {
    stubLocalStorage({ [SAVE_KEY]: JSON.stringify({ v: 2, coins: 10, bag: { v_raft: 1, v_sled: 1, m_wood: 2 }, dex: {}, flags: { econ: { stars: 4, combo: 3, keys: { silver: 2 } } } }) });
    const { game, econ } = boot();
    expect(game.state.bag.v_raft).toBeUndefined();
    expect(game.state.bag.v_sled).toBeUndefined();
    expect(game.state.bag.m_wood).toBe(2);
    expect(econ.isUnlocked('v:raft') && econ.isUnlocked('v:sled')).toBe(true);
    expect(econ.stars).toBe(4);
    expect(econ.combo).toBe(3); // 예전 콤보 → roll.combo
    expect(econ.keys).toEqual({ silver: 2, gold: 0, rainbow: 0 });
    // 도구가 아이템이 되기 전 저장도 시작 도구를 한 번 받는다
    expect(game.state.bag.tool_rod).toBe(1);
    expect(econ.isUnlocked('tool:rod')).toBe(true);
  });

  it('?cheat=1: 코인 1M · 반짝별 999 · 재료 99 · 열쇠 · 전부 해금', () => {
    const { game, econ } = boot('?cheat=1');
    expect(econ.cheat).toBe(true);
    expect(game.state.coins).toBe(1_000_000);
    expect(econ.stars).toBe(999);
    expect(game.state.bag.m_gold).toBe(99);
    expect(econ.keyCount('rainbow')).toBeGreaterThanOrEqual(1);
    expect(econ.isUnlocked('space:moon')).toBe(true);
    expect(econ.give('m_pearl', 5)).toBe(5); // 치트 가방은 넉넉
  });

  it('시설 E: 상점·조선소·펭박사·섬 가게가 open-shop 을 보낸다', () => {
    const { game, ev } = boot();
    for (const id of ['econ-shop', 'econ-shipyard', 'econ-peng', 'econ-diving', 'econ-bazaar', 'econ-potion']) {
      expect(game.interact(id, { force: true })).toBe(true);
    }
    expect(ev.of('open-shop').map((e) => e.shop)).toEqual(['quack', 'shipyard', 'peng', 'diving', 'bazaar', 'potion']);
    expect(game.interact('econ-museum', { force: true })).toBe(true);
    expect(ev.of('open-museum')).toHaveLength(1);
  });
});
