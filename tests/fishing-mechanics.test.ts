// 낚시 규칙(fishing/logic.ts) — 낚싯대 문 · 미끼 쓰기 · 쓰레기 길 · 입질 창 표 · 톡에 누르면 catch-fail · 통통배 속도 규칙 · 달 연못 활동.
import { describe, expect, it, vi } from 'vitest';
import * as L from '../src/modules/fishing/logic';
import { rollCatch as rollPure, newRollState } from '../src/modules/economy/roll';
import { rngFor } from '../src/core/rng';
import type { RollResult, RollSpecies } from '../src/core/api';

const noInput: L.StepInput = { press: false, held: false, cancel: false };
const press: L.StepInput = { press: true, held: true, cancel: false };
const fixed = (u: number) => () => u;

/** 상태 기계를 착수 → 톡 단계까지 돌린다 */
function toNibble(rarity = 1, rod: L.RodTier = 'rod', u = 0.5) {
  const s = L.newSession();
  L.beginCast(s, 6);
  const evs: L.FishEvent[] = [];
  for (let i = 0; i < 40 && s.phase === 'cast'; i++) evs.push(...L.step(s, 0.05, noInput, fixed(0.5)));
  expect(evs.some((e) => e.type === 'land')).toBe(true);
  L.arm(s, { wait: 0.3, approach: 1, window: L.biteWindow(rarity, rod) });
  for (let i = 0; i < 100 && s.phase !== 'nibble'; i++) L.step(s, 0.05, noInput, fixed(u));
  expect(s.phase).toBe('nibble');
  return s;
}

describe('낚싯대 문', () => {
  it('tool:rod 가 없으면 낚시 못 함, 있으면 가장 좋은 낚싯대', () => {
    const keys = (...k: string[]) => (key: string) => k.includes(key);
    expect(L.rodTier(keys())).toBe('none');
    expect(L.rodTier(keys('tool:rod'))).toBe('rod');
    expect(L.rodTier(keys('tool:rod', 'tool:goodrod'))).toBe('goodrod');
    expect(L.rodTier(keys('tool:rod', 'tool:goodrod', 'tool:goldrod'))).toBe('goldrod');
    // 경제가 없으면 기본 낚싯대
    expect(L.rodTier(null)).toBe('rod');
  });
});

describe('던지기 3~10m', () => {
  it('누른 시간에 따라 3m → 10m, 넘치면 10m', () => {
    expect(L.castDistance(0)).toBe(L.CAST_MIN);
    expect(L.castDistance(L.CHARGE_SEC / 2)).toBeCloseTo(6.5, 5);
    expect(L.castDistance(99)).toBe(L.CAST_MAX);
  });
  it('원하는 자리가 땅이면 가까운 물로, 3~10m 안에 물이 없으면 null', () => {
    expect(L.landingDistance(9, (d) => d <= 5)).toBe(5);
    expect(L.landingDistance(4, (d) => d >= 7)).toBe(7);
    expect(L.landingDistance(6, () => false)).toBeNull();
  });
  it('충전 단계: 떼면 cast 사건과 거리', () => {
    const s = L.newSession();
    L.beginCharge(s);
    L.step(s, 0.6, { press: true, held: true, cancel: false }, fixed(0.5));
    const ev = L.step(s, 0.016, noInput, fixed(0.5));
    expect(ev[0]).toMatchObject({ type: 'cast' });
    expect(s.phase).toBe('cast');
    expect(s.dist).toBeGreaterThan(L.CAST_MIN);
    expect(s.dist).toBeLessThanOrEqual(L.CAST_MAX);
  });
});

describe('그림자 1~3개 미리 굴리기', () => {
  it('수와 반경', () => {
    expect(L.shadowCount(0)).toBe(1);
    expect(L.shadowCount(0.5)).toBe(2);
    expect(L.shadowCount(0.999)).toBe(3);
    expect(L.shadowCount(0.999, true)).toBe(1);
    expect(L.shadowRadius(0)).toBe(6);
    expect(L.shadowRadius(1)).toBe(12);
  });
  it('commit:false 로 굴리고 빈손은 버린다', () => {
    const qs: L.PreRollQuery[] = [];
    const out = L.rollShadows({
      n: 3, plan: { activity: 'fish', zone: 'river', island: 'home', junk: true }, pool: [], bait: 'bait_dough',
      roll: (q) => { qs.push(q); return qs.length === 2 ? { species: null, rarity: 0, combo: 0 } : { species: { id: 'a', rarity: 1 }, rarity: 1, combo: 1 }; },
    });
    expect(out).toHaveLength(2);
    expect(qs.every((q) => q.commit === false && q.junk === true && q.activity === 'fish')).toBe(true);
  });
});

describe('미끼', () => {
  it('던질 때 하나 쓰고, 굴림마다 그 미끼를 넘긴다', () => {
    const bag: Record<string, number> = { bait_worm: 2, bait_lure: 1 };
    const take = vi.fn((id: string) => { bag[id]--; });
    const count = (id: string) => bag[id] ?? 0;
    const used = L.takeBait('bait_lure', count, take);
    expect(used).toBe('bait_lure');
    expect(take).toHaveBeenCalledTimes(1);
    expect(bag.bait_lure).toBe(0);
    // 다 떨어지면 지렁이로
    expect(L.takeBait('bait_lure', count, take)).toBe('bait_worm');
    expect(bag.bait_worm).toBe(1);
    // '미끼 없음' 이면 안 쓴다
    expect(L.takeBait('none', count, take)).toBeUndefined();
    expect(take).toHaveBeenCalledTimes(2);

    const qs: L.PreRollQuery[] = [];
    L.rollShadows({ n: 3, plan: { activity: 'fish', zone: 'river', island: 'home', junk: true }, pool: [], bait: used, roll: (q) => { qs.push(q); return { species: null, rarity: 0, combo: 0 }; } });
    expect(qs.map((q) => q.bait)).toEqual(['bait_lure', 'bait_lure', 'bait_lure']);
  });
  it('황금 미끼는 직접 골랐을 때만, X 로 가진 미끼 사이를 돈다', () => {
    const bag: Record<string, number> = { bait_golden: 1 };
    const count = (id: string) => bag[id] ?? 0;
    expect(L.chooseBait(undefined, count)).toBeUndefined();
    expect(L.chooseBait('bait_golden', count)).toBe('bait_golden');
    expect(L.cycleBait(undefined, count)).toBe('bait_golden');
    expect(L.cycleBait('bait_golden', count)).toBe('none');
  });
  it('진짜 굴림(economy/roll)에서 미끼가 있으면 쓰레기 8%, 없으면 12%', () => {
    const pool: RollSpecies[] = [{ id: 'f1', rarity: 1, len: 20 }, { id: 'f3', rarity: 3, len: 30 }];
    const env = { day: 1, hour: 12, tod: 'day', weather: 'clear', p0: true, rng: (k: string) => rngFor(k) };
    const rate = (bait?: string) => {
      const st = newRollState();
      st.firstDay.fish = 1; // 오늘 첫 잡기 보상은 이미 받음(쓰레기를 굴리게)
      let junk = 0;
      for (let i = 0; i < 4000; i++) if (rollPure({ activity: 'fish', pool, junk: true, bait, commit: false }, st, env).junk) junk++;
      return junk / 4000;
    };
    expect(rate('bait_worm')).toBeGreaterThan(0.06);
    expect(rate('bait_worm')).toBeLessThan(0.1);
    expect(rate()).toBeGreaterThan(0.1);
    expect(rate()).toBeLessThan(0.14);
  });
});

describe('쓰레기 길', () => {
  const hooks = () => ({
    catchFail: vi.fn(), reportCatch: vi.fn(), showCatch: vi.fn(), give: vi.fn(() => 1), card: vi.fn(),
    itemName: (id: string) => (id === 't_boot' ? { name: '헌 장화', icon: '🥾' } : undefined),
  });
  it('쓰레기는 카드 + econ.give, 도감·reportCatch 는 안 부른다', () => {
    const h = hooks();
    const r: RollResult = { species: null, rarity: 0, junk: 't_boot', combo: 3 };
    expect(L.resolveCatch(r, 'fish', h)).toBe('junk');
    expect(h.give).toHaveBeenCalledWith('t_boot', 1, 'fishing-junk');
    expect(h.card).toHaveBeenCalledTimes(1);
    expect(h.card.mock.calls[0][0]).toMatchObject({ title: '헌 장화을(를) 낚았다…', icon: '🥾', junk: 't_boot' });
    expect(h.showCatch).not.toHaveBeenCalled();
    expect(h.reportCatch).not.toHaveBeenCalled();
  });
  it('물고기는 showCatch(크기·변이·활동) 다음 reportCatch', () => {
    const h = hooks();
    const order: string[] = [];
    h.showCatch.mockImplementation(() => { order.push('show'); });
    h.reportCatch.mockImplementation(() => { order.push('report'); });
    const r: RollResult = { species: { id: 'fish-carp', rarity: 2, name: '붕어' }, rarity: 2, size: 31.5, variant: 'shiny', combo: 1 };
    expect(L.resolveCatch(r, 'fish', h)).toBe('fish');
    expect(h.showCatch.mock.calls[0][0]).toMatchObject({ speciesId: 'fish-carp', size: 31.5, variant: 'shiny', activity: 'fish' });
    expect(order).toEqual(['show', 'report']);
  });
  it('왕관: 최대 크기 경신 줄', () => {
    expect(L.sizeLine(62, 71, 'crown')).toBe('최대 크기 경신! 62cm→71cm');
    expect(L.sizeLine(undefined, 71, 'crown')).toBe('👑 왕관 크기! 71cm');
    expect(L.sizeLine(40, 41.2)).toBe('최대 크기 경신! 40cm→41.2cm');
    expect(L.sizeLine(40, 30)).toBeNull();
    const h = hooks();
    L.resolveCatch({ species: { id: 'x', rarity: 3 }, rarity: 3, size: 71, variant: 'crown', combo: 0 }, 'fish', { ...h, prevBest: () => 62 });
    expect(h.showCatch.mock.calls[0][0].line).toBe('최대 크기 경신! 62cm→71cm');
  });
});

describe('입질 창 표', () => {
  it('★1~3 0.7 · ★4 0.55 · ★5 0.45, 좋은·황금 낚싯대 +0.1', () => {
    for (const r of [1, 2, 3]) expect(L.biteWindow(r, 'rod')).toBe(0.7);
    expect(L.biteWindow(4, 'rod')).toBe(0.55);
    expect(L.biteWindow(5, 'rod')).toBe(0.45);
    expect(L.biteWindow(4, 'goodrod')).toBe(0.65);
    expect(L.biteWindow(5, 'goldrod')).toBe(0.55);
    expect(L.biteWindow(1, 'goldrod')).toBe(0.8);
    expect(L.biteWindow(0, 'rod')).toBe(0.7); // 쓰레기
  });
  it('톡 · 톡 · 꾹 다음 창 안에 누르면 catch, 창을 넘기면 fail late', () => {
    const s = toNibble(5);
    const evs: L.FishEvent[] = [];
    for (let i = 0; i < 200 && s.phase === 'nibble'; i++) evs.push(...L.step(s, 0.05, noInput, fixed(0.5)));
    expect(evs.filter((e) => e.type === 'nibble')).toHaveLength(L.NIBBLES);
    expect(evs.at(-1)).toEqual({ type: 'bite' });
    expect(s.window).toBe(0.45);
    // 0.4초 뒤 누르면 잡았다
    L.step(s, 0.4, noInput, fixed(0.5));
    expect(L.step(s, 0.01, press, fixed(0.5))).toEqual([{ type: 'catch' }]);

    const s2 = toNibble(5);
    for (let i = 0; i < 200 && s2.phase === 'nibble'; i++) L.step(s2, 0.05, noInput, fixed(0.5));
    expect(L.step(s2, 0.5, noInput, fixed(0.5))).toEqual([{ type: 'fail', why: 'late' }]);
  });
  it('첫 톡은 그림자가 닿고 0.8~2.5초 뒤', () => {
    const early = toNibble(1, 'rod', 0);
    let t = 0;
    while (early.phase === 'nibble' && early.nibbles === 0 && t < 5) { L.step(early, 0.05, noInput, fixed(0)); t += 0.05; }
    expect(t).toBeGreaterThanOrEqual(0.8 - 1e-6);
    expect(t).toBeLessThan(0.9);
  });
});

describe('톡에 누르면 실패', () => {
  it('톡 단계 E → fail early → econ.catchFail(활동)', () => {
    const s = toNibble();
    const ev = L.step(s, 0.016, press, fixed(0.5));
    expect(ev).toEqual([{ type: 'fail', why: 'early' }]);
    expect(s.phase).toBe('miss');
    const catchFail = vi.fn();
    L.resolveFail('fish', { catchFail });
    expect(catchFail).toHaveBeenCalledWith('fish');
    // 실패 연출이 끝나면 end
    const end = L.step(s, L.MISS_HOLD + 0.01, noInput, fixed(0.5));
    expect(end).toEqual([{ type: 'end' }]);
    expect(s.phase).toBe('idle');
  });
  it('그림자가 오기 전 E 는 줄 감기(실패 아님)', () => {
    const s = L.newSession();
    L.beginCast(s, 5);
    L.step(s, L.CAST_FLIGHT, noInput, fixed(0.5));
    expect(s.phase).toBe('wait');
    L.arm(s, { wait: 1, approach: 2, window: 0.7 });
    expect(L.step(s, 0.1, press, fixed(0.5))).toEqual([{ type: 'reel' }]);
  });
});

describe('통통배·구역 규칙', () => {
  it('통통배는 속도 < 1 일 때만 갑판 낚시', () => {
    expect(L.deckFishingOk({ kind: 'tugboat', speed: 0 })).toBe(true);
    expect(L.deckFishingOk({ kind: 'tugboat', speed: 0.99 })).toBe(true);
    expect(L.deckFishingOk({ kind: 'tugboat', speed: 1 })).toBe(false);
    expect(L.deckFishingOk({ kind: 'tugboat', speed: -3 })).toBe(false);
    expect(L.deckFishingOk({ kind: 'motorboat', speed: 0 })).toBe(false);
    expect(L.deckFishingOk(null)).toBe(false);
  });
  it('먼바다·심해 후보는 배 위에서만', () => {
    expect(L.fishingZone('offshore', false)).toBe('shore');
    expect(L.fishingZone('deep', false)).toBe('shore');
    expect(L.fishingZone('offshore', true)).toBe('offshore');
    expect(L.fishingZone('heartpond', false)).toBe('heartpond');
    const zone = { island: null, theme: 'sea', zone: 'offshore', sea: 'offshore' as const };
    expect(L.planCast({ world: 'earth', pond: false, zone, onBoat: true }).zone).toBe('offshore');
    expect(L.planCast({ world: 'earth', pond: false, zone, onBoat: false }).zone).toBe('shore');
  });
  it('달리면(> 6.3 m/s) 물가 그림자가 놀라고, 던지면 그림자 1개만 늦게 온다', () => {
    let until = 0;
    until = L.spookUntil(until, 10, 5, true);
    expect(L.isSpooked(until, 10)).toBe(false);
    until = L.spookUntil(until, 10, 7, false);
    expect(L.isSpooked(until, 10)).toBe(false);
    until = L.spookUntil(until, 10, 7, true);
    expect(L.isSpooked(until, 12)).toBe(true);
    expect(L.isSpooked(until, 10 + L.SPOOK_SEC + 0.01)).toBe(false);
    expect(L.shadowCount(0.99, L.isSpooked(until, 11))).toBe(1);
  });
});

describe('달 연못', () => {
  it('우주 연못은 moonfish·moonpond, 쓰레기 없음', () => {
    const p = L.planCast({ world: 'space', pond: true, zone: null, onBoat: false });
    expect(p).toEqual({ activity: 'moonfish', zone: 'moonpond', island: 'moon', junk: false });
    const qs: L.PreRollQuery[] = [];
    L.rollShadows({ n: 2, plan: p, pool: [], roll: (q) => { qs.push(q); return { species: { id: 'm', rarity: 1 }, rarity: 1, combo: 0 }; } });
    expect(qs.every((q) => q.activity === 'moonfish' && q.junk === false)).toBe(true);
    // 실패도 moonfish 로
    const catchFail = vi.fn();
    L.resolveFail(p.activity, { catchFail });
    expect(catchFail).toHaveBeenCalledWith('moonfish');
  });
  it('구역 후보: where 줄(새 데이터)과 hab(옛 데이터) 둘 다, 달 연못 물고기가 있으면 그것만', () => {
    const place: L.PoolPlace = { island: 'moon', zone: 'moonpond', hour: 12, tod: 'day', noon: true, midnight: false, weather: 'clear', moonPhase: 0.3 };
    const fish: L.PoolFish[] = [
      { id: 'mochi', rarity: 1, where: [{ island: 'moon', zone: 'moonpond', time: 'all' }] },
      { id: 'carp', rarity: 1, hab: ['pond'], time: 'all' },
      { id: 'heart', rarity: 3, where: [{ island: 'home', zone: 'heartpond', time: 'night' }] },
    ];
    expect(L.zonePool(fish, place).map((f) => f.id)).toEqual(['mochi']);
    expect(L.zonePool(fish.slice(1), place).map((f) => f.id)).toEqual(['carp']);
    // 밤 전용만 있으면 시간을 풀어서라도 빈 물은 없게
    expect(L.zonePool(fish.filter((f) => f.where), { ...place, island: 'home', zone: 'heartpond' }).map((f) => f.id)).toEqual(['heart']);
    // poolFor 가 있으면 그걸 쓴다
    expect(L.zonePool(fish, place, () => [{ id: 'given', rarity: 2 }]).map((f) => f.id)).toEqual(['given']);
  });
});

describe('다른 섬의 강', () => {
  const place: L.PoolPlace = { island: 'dino', zone: 'river', hour: 12, tod: 'day', noon: true, midnight: false, weather: 'clear', moonPhase: 0.3 };
  const fish: L.PoolFish[] = [
    { id: 'trout', rarity: 1, where: [{ island: 'home', zone: 'river', time: 'all' }] },
    { id: 'gar', rarity: 2, where: [{ island: 'dino', zone: 'ancientlake', time: 'night' }] },
  ];
  it('공룡섬 강은 그 섬 고대 호수 물고기로(시간 무시)', () => {
    expect(L.zonePool(fish, place).map((f) => f.id)).toEqual(['gar']);
  });
  it('섬 고인 물도 없으면 섬을 무시하고 강 물고기로', () => {
    expect(L.zonePool(fish.slice(0, 1), place).map((f) => f.id)).toEqual(['trout']);
  });
  it('poolFor 가 강에서 비면 그 섬 호수로 다시 물어본다', () => {
    const asked: string[] = [];
    const r = L.zonePool([], place, (q) => { asked.push(q.zone); return q.zone === 'ancientlake' ? [{ id: 'given', rarity: 2 }] : []; });
    expect(r.map((f) => f.id)).toEqual(['given']);
    expect(asked).toEqual(['river', 'ancientlake']);
  });
});
