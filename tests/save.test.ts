// 저장(v2): 상태가 새로고침(새 GameState + load) 뒤에도 그대로인지, 옛 저장(v1) id 가 옮겨지는지, 주민 부탁 보상을 두 번 받을 수 없는지,
// 경제 flags.econ(반짝별·열쇠·해금·굴림 상태·시작 도구)이 새로고침 뒤에도 남고 두 번 지급되지 않는지.
// 코어 v2 는 save() 를 400ms 묶는다 → 테스트는 saveNow()/flush() 로 바로 쓴다(실제 게임은 pagehide 때 flush).
import { describe, it, expect, beforeEach } from 'vitest';
import { GameState, SAVE_KEY, type Species } from '../src/core/state';
import * as Island from '../src/core/island';
import { rngFor } from '../src/core/rng';
import buildEconomy, { type Request } from '../src/modules/economy';
import type { Ctx } from '../src/core/types';
import type { EconApi } from '../src/core/api';

// 브라우저 저장소 대역
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
  location: { search: '' },
});

const reload = () => { const s = new GameState(); s.load(); return s; };

beforeEach(() => store.clear());

describe('GameState 저장', () => {
  it('코인·가방·도감·플래그가 새로고침 뒤에도 남는다', () => {
    const sp: Species = { id: 'fish:test', name: '시험 물고기', category: 'fish', rarity: 1 };
    const s = new GameState();
    s.collect({ species: sp, size: 12 });
    s.addCoins(250);
    s.flags.hello = 1;
    s.save();
    s.saveNow();
    expect(JSON.parse(store.get(SAVE_KEY)!).v).toBe(2);
    const r = reload();
    expect(r.coins).toBe(250);
    expect(r.bag['fish:test']).toBe(1);
    expect(r.dex['fish:test'].best).toBe(12);
    expect(r.flags.hello).toBe(1);
  });

  it('묶인 저장은 saveNow 전엔 아직 안 쓰였다', () => {
    const s = new GameState();
    s.addCoins(10);
    expect(store.has(SAVE_KEY)).toBe(false);
    s.saveNow();
    expect(reload().coins).toBe(10);
  });

  it('v1 저장(같은 키, v 없음)을 읽으면 옛 id 를 옮긴다', () => {
    store.set(SAVE_KEY, JSON.stringify({
      coins: 40, bag: { 'fruit-apple': 2, 'fruit-pear': 1, beehive: 1, 'star-shard': 6 },
      dex: { 'star-shard': { count: 6, best: 0, first: 1 } }, flags: { econ: { stars: 2 } },
    }));
    const s = reload();
    expect(s.bag).toEqual({ m_apple: 2, m_pear: 1, m_honey: 1, m_stardust: 6 });
    expect(s.dex.m_stardust.count).toBe(6);
    s.saveNow();
    const raw = JSON.parse(store.get(SAVE_KEY)!);
    expect(raw.v).toBe(2);
    expect(raw.bag['fruit-apple']).toBeUndefined();
    expect(reload().bag.m_apple).toBe(2);
  });
});

/** 경제 모듈을 화면 없이 띄운다(필요한 게임 표면만 흉내) */
function econWith(state: GameState, env: { day: number } | null = { day: 3 }, ups: (() => void)[] = []) {
  const game = {
    state, time: 0, env, world: 'earth', ext: {},
    ui: { toast() {} },
    chunks: { add() {} },
    player: { pos: { x: 0, y: 0, z: 0 } },
    addInteractable() {}, addProvider() {}, onUpdate(f: () => void) { ups.push(f); return () => {}; },
  };
  const ctx = { island: Island, rng: rngFor, game } as unknown as Ctx;
  buildEconomy(ctx);
  return Object.assign((game as unknown as { econ: Omit<EconApi, 'requests'> & { requests: () => Request[] } }).econ, { game });
}

describe('주민 부탁', () => {
  it('완료한 부탁은 새로고침 뒤에도 완료 상태다(보상 중복 없음)', () => {
    const sp: Species = { id: 'bug:test', name: '시험 벌레', category: 'bug', rarity: 1, price: 100 };
    const s = new GameState();
    s.register([sp]);
    const econ = econWith(s);
    const rq = econ.requests().find((r) => r.species.id === sp.id)!;
    expect(rq).toBeTruthy();
    s.addItem(sp.id, rq.n);
    expect(econ.fulfill(rq.id)).toBe(true);
    const coins = s.coins;

    // 다른 저장 없이 곧바로 새로고침(페이지를 떠나며 묶인 저장이 flush 된다)
    s.flush();
    const s2 = reload();
    s2.register([sp]);
    s2.addItem(sp.id, rq.n); // 다시 모아 와도
    const econ2 = econWith(s2);
    expect(econ2.requests().find((r) => r.id === rq.id)!.done).toBe(true);
    expect(econ2.fulfill(rq.id)).toBe(false);
    expect(s2.coins).toBe(coins);
  });
});

describe('경제 저장(flags.econ)', () => {
  it('반짝별·열쇠·해금·굴림 상태가 새로고침 뒤에도 남고, 시작 도구는 한 번만', () => {
    const s = new GameState();
    const econ = econWith(s);
    expect(s.bag.tool_rod).toBe(1);
    econ.addStars(7, 'test');
    econ.addKeyPiece('gold', 4);
    econ.unlock('v:bike', 'test');
    const fishSp: Species = { id: 'fish:save', name: '저장 물고기', category: 'fish', rarity: 1 };
    s.register([fishSp]);
    econ.reportCatch(econ.rollCatch({ activity: 'fish', pool: [fishSp] }));
    s.addItem('tool_rod', -1); // 낚싯대를 잃어버려도
    s.saveNow();

    const s2 = reload();
    const econ2 = econWith(s2);
    expect(econ2.stars).toBe(7);
    expect(econ2.keyCount('gold')).toBe(1);
    expect(econ2.keys.gold).toBe(4);
    expect(econ2.isUnlocked('v:bike')).toBe(true);
    expect(econ2.combo).toBe(1);
    expect(s2.bag.tool_rod).toBeUndefined(); // 새로고침으로 다시 생기지 않는다
    expect(econ2.bag.size).toBe(25); // 자전거 바구니 +5
    expect(JSON.parse(store.get(SAVE_KEY)!).flags.econ.roll.count.fish).toBe(1);
  });

  it('옛 저장 가방의 v_raft → 해금 키(가방엔 없다)', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 2, coins: 0, bag: { v_raft: 1, p_fuel: 1 }, dex: {}, flags: {} }));
    const s = reload();
    const econ = econWith(s);
    expect(s.bag.v_raft).toBeUndefined();
    expect(s.bag.p_fuel).toBeUndefined();
    expect(econ.isUnlocked('v:raft')).toBe(true);
    expect(econ.isUnlocked('rocket:part:fuel')).toBe(true);
    s.saveNow();
    expect(JSON.parse(store.get(SAVE_KEY)!).bag.v_raft).toBeUndefined();
  });
});

describe('판매 포화(오늘 판 수)', () => {
  it('새로고침 때 시계(env)가 경제보다 늦게 붙어도 같은 날 판 수가 남는다', () => {
    const s = new GameState();
    const econ = econWith(s);
    const fresh = econ.priceOf('m_wood');
    s.addItem('m_wood', 30);
    econ.sell('m_wood', 30);
    const after = econ.priceOf('m_wood');
    expect(after).toBeLessThan(fresh);
    s.saveNow();

    // 새로고침: 경제(order 9)가 먼저, 날씨(order 50)가 나중에 game.env 를 붙인다
    const s2 = reload();
    const ups: (() => void)[] = [];
    const econ2 = econWith(s2, null, ups);
    expect(JSON.parse(JSON.stringify(s2.flags.econ)).sold.m_wood).toBe(30);
    (econ2.game as { env: { day: number } | null }).env = { day: 3 };
    for (const f of ups) f();
    expect(econ2.priceOf('m_wood')).toBe(after);
    expect((s2.flags.econ as { soldDay: number }).soldDay).toBe(3);

    // 다음 날이 되면 그때 비운다
    (econ2.game as { env: { day: number } | null }).env = { day: 4 };
    for (const f of ups) f();
    expect((s2.flags.econ as { sold: Record<string, number> }).sold.m_wood).toBeUndefined();
  });

  it('이미 가진 도구를 또 받으면 0 — 가방이 꽉 찼다는 알림은 없다', () => {
    const s = new GameState();
    const econ = econWith(s);
    expect(s.bag.tool_rod).toBe(1);
    let full = 0;
    const toasts: string[] = [];
    (econ.game as unknown as { ui: { toast: (t: string) => void } }).ui.toast = (t) => { toasts.push(t); };
    s.on((e) => { if (e.type === 'bag-full') full++; });
    expect(econ.give('tool_rod', 1, 'test')).toBe(0);
    expect(full).toBe(0);
    expect(toasts.some((t) => t.includes('꽉'))).toBe(false);
  });
});
