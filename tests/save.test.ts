// 저장: 상태가 새로고침(새 GameState + load) 뒤에도 그대로인지, 주민 부탁 보상을 두 번 받을 수 없는지.
import { describe, it, expect, beforeEach } from 'vitest';
import { GameState, type Species } from '../src/core/state';
import * as Island from '../src/core/island';
import { rngFor } from '../src/core/rng';
import buildEconomy, { type Request } from '../src/modules/economy';
import type { Ctx } from '../src/core/types';

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
    const r = reload();
    expect(r.coins).toBe(250);
    expect(r.bag['fish:test']).toBe(1);
    expect(r.dex['fish:test'].best).toBe(12);
    expect(r.flags.hello).toBe(1);
  });
});

/** 경제 모듈을 화면 없이 띄운다(필요한 게임 표면만 흉내) */
function econWith(state: GameState) {
  const game = {
    state, time: 0, env: { day: 3 },
    ui: { toast() {} },
    chunks: { add() {} },
    player: { pos: { x: 0, y: 0, z: 0 } },
    addInteractable() {}, addProvider() {},
  };
  const ctx = { island: Island, rng: rngFor, game } as unknown as Ctx;
  buildEconomy(ctx);
  return (game as unknown as { econ: { requests: () => Request[]; fulfill: (id: string) => boolean } }).econ;
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

    // 다른 저장 없이 곧바로 새로고침
    const s2 = reload();
    s2.register([sp]);
    s2.addItem(sp.id, rq.n); // 다시 모아 와도
    const econ2 = econWith(s2);
    expect(econ2.requests().find((r) => r.id === rq.id)!.done).toBe(true);
    expect(econ2.fulfill(rq.id)).toBe(false);
    expect(s2.coins).toBe(coins);
  });
});
