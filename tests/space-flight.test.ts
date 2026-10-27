// 별길 비행(flight) — 20초 비행 점수의 결정성 · 여행 목록 규칙(별 값·잠금·다음 행성·내 소행성) · 엔딩은 한 번만(story 와 같이) ·
// 내 소행성 20칸 상한. 순수 로직(flight/logic) + 가짜 게임(tests/kit)으로 space + flight 를 띄워서.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import buildSpace from '../src/modules/space';
import buildFlight from '../src/modules/flight';
import {
  makeCourse, newFlight, stepFlight, runFlight, autopilot, flightReward, pathAt, travelRows, canFly, dexProgress,
  endingOnDex, endingAfterFireworks, endingExternal, endingResume, asteroidPlace, asteroidTake, asteroidRotate, restoreAsteroid, freeSlots, slotOf,
  asteroidHeight, slotLocal, isMeteorNight, ASTEROID_SPAWN, ASTEROID_ROCKET, FLIGHT_SEC, INTRO_SEC, PTS, DUST, ASTEROID_SLOTS, ASTEROID, ASTEROID_ID,
  type Course, type PlanetRowIn, type EndingState,
} from '../src/modules/flight/logic';
import { furnKind } from '../src/modules/flight/furniture';

beforeEach(() => { stubLocalStorage(); });

type FlightExt = {
  fly(to: string, o?: { auto?: boolean }): boolean; flying(): boolean; skip(): boolean; rows(): ReturnType<typeof travelRows>;
  ended(): boolean; ending(): EndingState; checkDex(p?: { got: number; total: number }): unknown;
  asteroid: { unlocked(): boolean; unlock(why?: string): boolean; layout(): Array<{ item: string; gx: number; gz: number }>; place(item: string, slot?: number): boolean; take(slot: number): boolean; free(): number[]; go(): boolean };
};
async function boot(o: { world?: 'earth' | 'space'; planets?: unknown } = {}) {
  const game = makeFakeGame({ load: false });
  const ctx = makeCtx(game);
  await buildSpace(ctx as never);
  if (o.planets) game.ext.planets = o.planets;
  await buildFlight(ctx as never);
  if (o.world === 'space') game.setWorld('space');
  return { game, ctx, fx: game.ext.flight as FlightExt };
}
const tickSec = (g: FakeGame, sec: number) => g.tick(1 / 60, Math.round(sec * 60));

/** 손으로 만든 코스(판정 확인용) */
function course(items: Array<[number, 'ring' | 'gold' | 'comet', number, number]>): Course {
  const its = items.map(([t, kind, x, y], id) => ({ id, kind, t, x, y, r: kind === 'comet' ? 0.12 : kind === 'gold' ? 0.22 : 0.27, ph: 0 }));
  return { key: 'test', dur: 5, ph: [0, 0, 0], items: its, rings: its.filter((i) => i.kind === 'ring').length, golds: its.filter((i) => i.kind === 'gold').length, comets: its.filter((i) => i.kind === 'comet').length };
}
const still = () => ({ x: 0, y: 0 });

describe('① 20초 비행 — 결정적인 점수', () => {
  it('같은 key 면 같은 코스, 다른 key 면 다른 코스 · 20초 안에 고리 20개 이상', () => {
    const a = makeCourse('moon>sugar:3:0'), b = makeCourse('moon>sugar:3:0'), c = makeCourse('moon>sugar:3:1');
    expect(a).toEqual(b);
    expect(JSON.stringify(a.items)).not.toBe(JSON.stringify(c.items));
    expect(a.dur).toBe(FLIGHT_SEC);
    expect(a.rings + a.golds).toBeGreaterThanOrEqual(20);
    expect(a.comets).toBeGreaterThanOrEqual(8);
    for (const it of a.items) expect(it.t).toBeLessThanOrEqual(FLIGHT_SEC);
  });

  it('혜성은 늘 고리 길에서 비켜 있다(따라가면 피할 수 있다)', () => {
    for (let k = 0; k < 12; k++) {
      const c = makeCourse(`k${k}`);
      for (const it of c.items) {
        if (it.kind !== 'comet') continue;
        const p = pathAt(it.t, c.ph);
        expect(Math.hypot(it.x - p.x, it.y - p.y)).toBeGreaterThan(it.r + 0.085 + 0.05);
      }
    }
  });

  it('같은 입력이면 같은 결과 — 프레임 간격이 달라도(고정 1/60 시뮬레이션)', () => {
    const c = makeCourse('det');
    const fixed = runFlight(newFlight(c), autopilot);
    const again = runFlight(newFlight(c), autopilot);
    expect(flightReward(again)).toEqual(flightReward(fixed));
    // 들쭉날쭉한 프레임
    const s = newFlight(c);
    const dts = [0.016, 0.033, 0.007, 0.05, 0.021, 0.1];
    for (let i = 0; s.phase !== 'done' && i < 10000; i++) stepFlight(s, autopilot, dts[i % dts.length]);
    expect(s.score).toBe(fixed.score);
    expect(s.rings).toBe(fixed.rings);
    expect(s.hits).toBe(fixed.hits);
    // 자동 조종은 고리를 거의 다 지나고 혜성은 거의 안 맞는다
    expect(fixed.rings + fixed.golds).toBeGreaterThanOrEqual(Math.floor((c.rings + c.golds) * 0.8));
    expect(fixed.hits).toBeLessThanOrEqual(1);
    // 손 놓고 있으면 훨씬 적다
    const idle = runFlight(newFlight(c), still);
    expect(idle.score).toBeLessThan(fixed.score);
  });

  it('점수: 고리 10 + 콤보마다 2 · 금고리 30 · 고리를 놓치면 콤보가 끊긴다', () => {
    // 우주선은 (0, -0.2) 에서 시작 — 그 자리 고리 셋 → 10 + 12 + 14
    const s = runFlight(newFlight(course([[1, 'ring', 0, -0.2], [1.5, 'ring', 0, -0.2], [2, 'ring', 0, -0.2]]), { intro: 0 }), still);
    expect(s.score).toBe(PTS.ring * 3 + PTS.combo * (0 + 1 + 2));
    expect(s.bestCombo).toBe(3);
    const r = flightReward(s);
    expect(r.perfect).toBe(true);
    expect(r.dust).toBe(3 * DUST.ring + DUST.perfect);
    // 놓친 고리(멀리) → 콤보 0, perfect 아님
    const m = runFlight(newFlight(course([[1, 'ring', 0, -0.2], [1.5, 'ring', 0.8, 0.7], [2, 'ring', 0, -0.2], [2.5, 'gold', 0, -0.2]]), { intro: 0 }), still);
    expect(m.rings).toBe(2);
    expect(m.golds).toBe(1);
    expect(m.missed).toBe(1);
    expect(m.score).toBe(PTS.ring + PTS.ring + (PTS.gold + PTS.combo));
    expect(flightReward(m).perfect).toBe(false);
    expect(flightReward(m).dust).toBe(2 * DUST.ring + DUST.gold);
  });

  it('혜성: 부딪히면 콤보 0 + 비틀(그동안 무적) · 별가루 상한과 배율', () => {
    const s = runFlight(newFlight(course([[1, 'ring', 0, -0.2], [1.2, 'comet', 0, -0.2], [1.4, 'comet', 0, -0.2]]), { intro: 0 }), still);
    expect(s.hits).toBe(1); // 두 번째는 비틀거리는 동안이라 무적
    expect(s.combo).toBe(0);
    expect(s.result[2]).toBe('dodge');
    // 배율 ×2 · 상한
    const fake = { score: 0, rings: 100, golds: 0, hits: 0, bestCombo: 0, missed: 0, course: course([[1, 'ring', 0, 0]]) };
    expect(flightReward(fake).dust).toBe(DUST.max);
    expect(flightReward(fake, 2).dust).toBe(DUST.max * 2);
    const small = { ...fake, rings: 4, hits: 1 };
    expect(flightReward(small, 2).dust).toBe(8);
  });

  it('비행 단계: 카운트다운 동안엔 시간이 안 흐르고, 20초 뒤 done', () => {
    const s = newFlight(makeCourse('phase'));
    stepFlight(s, still, 1);
    expect(s.phase).toBe('intro');
    expect(s.t).toBe(0);
    for (let i = 0; i < 200 && s.phase !== 'done'; i++) stepFlight(s, still, 0.2);
    expect(s.phase).toBe('done');
    expect(s.t).toBe(FLIGHT_SEC);
    expect(s.clock).toBeGreaterThanOrEqual(FLIGHT_SEC);
    expect(INTRO_SEC).toBeGreaterThan(0);
  });
});

describe('② 여행 목록 — 별 값·잠금 규칙', () => {
  const P = (id: string, o: Partial<PlanetRowIn>): PlanetRowIn => ({ id, name: id, icon: '🪐', color: '#fff', cost: 0, visited: false, ok: false, text: '', ...o });
  const list = [
    P('moon', { visited: true, ok: true, text: '언제든' }),
    P('sugar', { visited: true, ok: true, cost: 0 }),
    P('jelly', { ok: true, cost: 15, text: '★15 내고 출발' }),
    P('frost', { ok: false, cost: 20, why: 'locked', text: '젤리별부터 다녀와요!' }),
    P('cloud', { ok: false, cost: 25, why: 'locked' }),
    P('blackhole', { ok: false, cost: 50, why: 'eclipse' }),
  ];
  it('갈 수 있는·다녀온 곳 전부 + 못 가는 곳은 첫 번째(다음 목표)만, 별 값과 함께', () => {
    const r = travelRows(list, { here: 'moon', asteroid: false });
    expect(r.map((x) => x.id)).toEqual(['moon', 'sugar', 'jelly', 'frost']);
    expect(r.find((x) => x.id === 'jelly')!.cost).toBe(15);
    const nx = r.find((x) => x.id === 'frost')!;
    expect(nx.next).toBe(true);
    expect(nx.ok).toBe(false);
    expect(nx.cost).toBe(20);
    expect(r.find((x) => x.id === 'moon')!.here).toBe(true);
    // 내 소행성은 엔딩 뒤에만, 공짜
    const r2 = travelRows(list, { here: 'moon', asteroid: true });
    expect(r2[r2.length - 1].id).toBe(ASTEROID_ID);
    expect(r2[r2.length - 1].cost).toBe(0);
  });
  it('planets 가 없으면 토끼달만 · canFly: 여기/잠김/별 부족', () => {
    expect(travelRows(null, { here: 'earth', asteroid: false }).map((x) => x.id)).toEqual(['moon']);
    const r = travelRows(list, { here: 'moon', asteroid: false });
    expect(canFly(r.find((x) => x.id === 'moon'), 0)).toEqual({ ok: false, why: 'here' });
    expect(canFly(r.find((x) => x.id === 'jelly'), 14)).toEqual({ ok: false, why: 'stars' });
    expect(canFly(r.find((x) => x.id === 'jelly'), 15)).toEqual({ ok: true });
    expect(canFly(r.find((x) => x.id === 'frost'), 999)).toEqual({ ok: false, why: 'locked' });
    expect(canFly(r.find((x) => x.id === 'sugar'), 0)).toEqual({ ok: true });
    expect(canFly(undefined, 0).ok).toBe(false);
  });

  it('모듈: 비행이 끝나야 planets.travel 로 간다(별은 그때 낸다) · 별길 비행 별가루는 가방으로', async () => {
    const calls: string[] = [];
    const planets = {
      list: () => list,
      travel: (id: string) => { calls.push(id); return true; },
    };
    const { game, fx } = await boot({ world: 'space', planets });
    const ev = recordEvents(game);
    expect(fx.fly('frost')).toBe(false); // 잠김
    expect(fx.fly('moon')).toBe(false); // 여기
    expect(fx.fly(ASTEROID_ID)).toBe(false); // 엔딩 전
    expect(fx.fly('sugar', { auto: true })).toBe(true);
    expect(game.player.locked).toBe(true);
    expect(fx.fly('sugar')).toBe(false); // 이미 나는 중
    tickSec(game, 10);
    expect(calls).toEqual([]);
    tickSec(game, 18);
    expect(calls).toEqual(['sugar']);
    expect(fx.flying()).toBe(false);
    expect(game.player.locked).toBe(false);
    expect(game.state.bag['m_stardust'] ?? 0).toBeGreaterThan(10);
    expect(ev.of('harvest').some((e) => e.kind === 'stardust' && e.island === 'space')).toBe(true);
    // 건너뛰기: 그때까지 모은 만큼만
    const before = game.state.bag['m_stardust'] ?? 0;
    expect(fx.fly('jelly')).toBe(false); // 별 ★15 가 없다
    game.econ = { stars: 15 } as never;
    expect(fx.fly('jelly')).toBe(true);
    tickSec(game, 3);
    expect(fx.skip()).toBe(true);
    tickSec(game, 5);
    expect(calls).toEqual(['sugar', 'jelly']);
    expect((game.state.bag['m_stardust'] ?? 0) - before).toBeLessThan(5);
  });

  it('모듈: 토끼달 로켓 옆 F "다른 행성으로" · 내 소행성은 하나만 등록', async () => {
    const { game } = await boot({ world: 'space' });
    const sp = game.space as unknown as { planets(): string[]; landingSpawn: { x: number; y: number; z: number } };
    expect(sp.planets().filter((p) => p === ASTEROID_ID)).toHaveLength(1);
    // 착륙장 가장자리(9.5 m)에선 아직 — 로켓 앞으로 걸어가면 E '지구로!' 와 함께 F 가 뜬다
    game.player.teleport(sp.landingSpawn.x, sp.landingSpawn.z, sp.landingSpawn.y);
    game.tick(1 / 60, 2);
    expect(game.listInteractions().some((r) => r.id === 'flight:moon-travel')).toBe(false);
    game.player.teleport(sp.landingSpawn.x, sp.landingSpawn.z - 6, sp.landingSpawn.y);
    game.tick(1 / 60, 2);
    const row = game.listInteractions().find((r) => r.id === 'flight:moon-travel');
    expect(row).toBeTruthy();
    expect(row!.key).toBe('KeyF');
    expect(row!.label).toContain('다른 행성');
  });
});

describe('③ 엔딩 — 한 번만', () => {
  it('순수: 100% 에서 불꽃놀이 한 번 → ending 한 번 · story 가 먼저면 불꽃놀이만', () => {
    const st: EndingState = {};
    expect(endingOnDex(st, 313, 314)).toBeNull();
    expect(endingOnDex(st, 314, 314)).toBe('fireworks');
    expect(endingOnDex(st, 314, 314)).toBeNull();
    expect(endingAfterFireworks(st)).toBe(true);
    expect(endingAfterFireworks(st)).toBe(false);
    expect(endingExternal(st)).toBe(false);
    const st2: EndingState = {};
    expect(endingExternal(st2, 'story')).toBe(true);
    expect(endingOnDex(st2, 5, 5)).toBe('fireworks');
    expect(endingAfterFireworks(st2)).toBe(false);
    expect(st2.by).toBe('story');
    expect(endingOnDex({}, 0, 0)).toBeNull();
  });
  it('도감 합계: 탭마다 max(실린 종, 칸 수)', () => {
    const tabs = [{ id: 'a', slots: 3, match: (s: { category: string }) => s.category === 'a' }, { id: 'b', slots: 1, match: (s: { category: string }) => s.category === 'b' }];
    const sp = [{ id: 'x', category: 'a' }, { id: 'y', category: 'b' }, { id: 'z', category: 'b' }];
    const p = dexProgress(tabs, sp, (id) => id !== 'z');
    expect(p).toEqual({ got: 2, total: 3 + 2, pct: 2 / 5 });
  });
  it('모듈: 도감 100% → 불꽃놀이 → ending 한 번 + 내 소행성 열림(다시 불러도 안 난다)', async () => {
    const { game, fx } = await boot();
    const ev = recordEvents(game);
    fx.checkDex({ got: 314, total: 314 });
    tickSec(game, 2);
    expect(game.player.locked).toBe(true); // 불꽃놀이 중
    expect(ev.of('ending')).toHaveLength(0);
    tickSec(game, 12);
    expect(ev.of('ending')).toHaveLength(1);
    expect(game.player.locked).toBe(false);
    expect(fx.ended()).toBe(true);
    expect(fx.asteroid.unlocked()).toBe(true);
    fx.checkDex({ got: 314, total: 314 });
    tickSec(game, 14);
    expect(ev.of('ending')).toHaveLength(1);
    // 저장에 남는다
    const f = (game.state.flags as { space?: { flight?: { ending?: EndingState } } }).space?.flight?.ending;
    expect(f?.ended).toBe(1);
    expect(f?.dexDone).toBe(1);
  });
  it('모듈: story 가 먼저 ending 을 내면 같이 쓴다(우리는 다시 안 낸다)', async () => {
    const { game, fx } = await boot();
    const ev = recordEvents(game);
    game.state.emit({ type: 'ending' });
    expect(fx.ended()).toBe(true);
    expect(fx.ending().by).toBe('story');
    tickSec(game, 7);
    expect(fx.asteroid.unlocked()).toBe(true);
    fx.checkDex({ got: 10, total: 10 });
    tickSec(game, 14);
    expect(ev.of('ending')).toHaveLength(1); // story 의 것 하나뿐
  });
});

describe('④ 내 소행성 — 20칸', () => {
  it('순수: 20칸까지, 21번째는 full · 같은 칸 taken · 빼고 돌리기 · 저장값 되살리기', () => {
    let lay: ReturnType<typeof restoreAsteroid>['layout'] = [];
    for (let i = 0; i < ASTEROID_SLOTS; i++) {
      const r = asteroidPlace(lay, i % 2 ? 'f_lamp' : 'f_chair');
      expect(r.ok).toBe(true);
      if (r.ok) { lay = r.layout; expect(r.slot).toBe(i); }
    }
    expect(lay).toHaveLength(20);
    expect(freeSlots(lay)).toEqual([]);
    expect(asteroidPlace(lay, 'f_rug')).toEqual({ ok: false, why: 'full' });
    const t = asteroidTake(lay, 7);
    expect(t.took?.item).toBe('f_lamp');
    expect(freeSlots(t.layout)).toEqual([7]);
    expect(asteroidPlace(t.layout, 'f_rug', 3)).toEqual({ ok: false, why: 'taken' });
    expect(asteroidPlace(t.layout, 'f_rug', 20)).toEqual({ ok: false, why: 'bounds' });
    expect(asteroidPlace(t.layout, 'm_stardust', 7)).toEqual({ ok: false, why: 'item' });
    const rot = asteroidRotate(t.layout, 0);
    expect(slotOf(rot, 0)!.rot).toBe(1);
    // 되살리기: 겹침·범위 밖·가구 아닌 것은 버린다
    const back = restoreAsteroid({ layout: [...lay, { uid: 'x', item: 'f_bed', gx: 0, gz: 0, rot: 0 }, { uid: 'y', item: 'f_bed', gx: 9, gz: 0, rot: 0 }, { uid: 'z', item: 'm_wood', gx: 1, gz: 1, rot: 0 }] });
    expect(back.layout).toHaveLength(20);
    expect(back.dropped.map((d) => d.uid).sort()).toEqual(['x', 'y', 'z']);
  });
  it('땅: 가구판·도착 자리는 평평, 가장자리는 둥글게 떨어진다', () => {
    const h0 = asteroidHeight(slotLocal(0).x, slotLocal(0).z), h1 = asteroidHeight(slotLocal(19).x, slotLocal(19).z);
    expect(Math.abs(h0 - h1)).toBeLessThan(0.15);
    expect(asteroidHeight(ASTEROID.radius + 6, 0)).toBeLessThan(asteroidHeight(0, 0) - 3);
    for (let i = 0; i < ASTEROID_SLOTS; i++) expect(Math.hypot(slotLocal(i).x, slotLocal(i).z)).toBeLessThan(ASTEROID.radius * 0.8);
  });
  it('가구 모양 고르기', () => {
    expect(furnKind('f_lamp')).toBe('lamp');
    expect(furnKind('f_shellbed')).toBe('bed');
    expect(furnKind('f_cloudrug')).toBe('rug');
    expect(furnKind('f_cap_bunnysofa')).toBe('seat');
    expect(furnKind('f_mystery', '수수께끼')).toBe('gift');
  });
  it('모듈: 엔딩 뒤 가서 가방 가구 놓기 → 가방에서 빠지고 저장 · 20칸 상한 · 빼면 가방으로', async () => {
    const { game, fx } = await boot();
    expect(fx.asteroid.go()).toBe(false); // 아직 안 열림
    fx.asteroid.unlock('test');
    expect(fx.asteroid.go()).toBe(true);
    expect(game.world).toBe('space');
    expect((game.space as { planet: string }).planet).toBe(ASTEROID_ID);
    game.state.addItem('f_lamp', 25);
    expect(fx.asteroid.place('m_stardust')).toBe(false);
    for (let i = 0; i < ASTEROID_SLOTS; i++) expect(fx.asteroid.place('f_lamp')).toBe(true);
    expect(fx.asteroid.place('f_lamp')).toBe(false);
    expect(game.state.bag['f_lamp']).toBe(5);
    expect(fx.asteroid.layout()).toHaveLength(20);
    const saved = (game.state.flags as { space?: { asteroid?: { layout?: unknown[] } } }).space?.asteroid?.layout;
    expect(saved).toHaveLength(20);
    expect(fx.asteroid.take(4)).toBe(true);
    expect(game.state.bag['f_lamp']).toBe(6);
    expect(fx.asteroid.free()).toEqual([4]);
    // 칸 옆에 서면 E '가구 놓기'
    const L = slotLocal(4), O = { x: -3000, z: 30000 };
    game.player.teleport(O.x + L.x + 0.3, O.z + L.z);
    game.tick(1 / 60, 2);
    expect(game.listInteractions().some((r) => r.id === 'flight:slot:4' && r.label.includes('가구 놓기'))).toBe(true);
  });
});

describe('리뷰 고침', () => {
  it('버려진 가구는 한 번만 돌려주고 깨끗한 배치를 저장한다', async () => {
    const game = makeFakeGame({ load: false });
    const ctx = makeCtx(game);
    await buildSpace(ctx as never);
    (game.state.flags as Record<string, unknown>).space = { asteroid: { unlocked: 1, layout: [{ uid: 'bad', item: 'f_tank', gx: 9, gz: 9, rot: 0 }] } };
    await buildFlight(ctx as never);
    expect(game.state.bag['f_tank']).toBe(1);
    const saved = (game.state.flags as { space?: { asteroid?: { layout?: unknown[] } } }).space?.asteroid?.layout;
    expect(saved).toEqual([]);
  });
  it('유성의 밤은 일요일 밤 21~05시(또는 meteor 날씨)만', () => {
    expect(isMeteorNight({ weekday: 6, hour: 14 })).toBe(false);
    expect(isMeteorNight({ weekday: 6, hour: 22 })).toBe(true);
    expect(isMeteorNight({ weekday: 0, hour: 3 })).toBe(true);
    expect(isMeteorNight({ weekday: 0, hour: 6 })).toBe(false);
    expect(isMeteorNight({ weekday: 2, hour: 12, weather: 'meteor' })).toBe(true);
    expect(isMeteorNight(undefined)).toBe(false);
  });
  it('도착 때 카메라 줄(도착 자리 뒤 +z)에 로켓이 없다', () => {
    // 카메라는 도착 자리 바로 뒤(+z 로 ~8m)에 선다 — 로켓 몸통(반경 1.1)이 그 줄에서 넉넉히 비켜 있어야
    const dx = Math.abs(ASTEROID_ROCKET.x - ASTEROID_SPAWN.x);
    expect(ASTEROID_ROCKET.z < ASTEROID_SPAWN.z + 1 || dx > 3).toBe(true);
    expect(dx).toBeGreaterThan(3);
  });
  it('진짜 엔진 순서: 키(Esc)는 inp.endFrame 전에 읽어야 먹는다 — 비행 건너뛰기·결과 카드·불꽃놀이', async () => {
    // 진짜 엔진: game.update(그 안 game.onUpdate → endFrame) 다음에 ctx.onUpdate(엔진 훅). 같은 순서로 돌린다
    const game = makeFakeGame({ load: false });
    const ctx = makeCtx(game);
    const engineHooks: Array<(t: number, dt: number) => void> = [];
    (ctx as { onUpdate: (fn: (t: number, dt: number) => void) => () => void }).onUpdate = (fn) => { engineHooks.push(fn); return () => {}; };
    const frames = (n: number) => { for (let i = 0; i < n; i++) { game.tick(1 / 60, 1); for (const fn of engineHooks) fn(game.time, 1 / 60); } };
    const calls: string[] = [];
    await buildSpace(ctx as never);
    game.ext.planets = { list: () => [{ id: 'moon', name: 'moon', icon: '🌙', color: '#fff', cost: 0, visited: true, ok: true, text: '' }, { id: 'sugar', name: 'sugar', icon: '🪐', color: '#fff', cost: 0, visited: true, ok: true, text: '' }], travel: (id: string) => { calls.push(id); return true; } };
    await buildFlight(ctx as never);
    game.setWorld('space');
    const fx = game.ext.flight as FlightExt;
    expect(fx.fly('sugar')).toBe(true);
    frames(180);
    game.input.press('Escape');
    frames(1);
    // 결과 카드도 키로 넘긴다(0.8초 뒤부터)
    frames(60);
    game.input.press('KeyE');
    frames(90);
    expect(calls).toEqual(['sugar']);
    expect(fx.flying()).toBe(false);
    // 불꽃놀이도 Esc(2초 뒤)로 접힌다
    const ev = recordEvents(game);
    fx.checkDex({ got: 5, total: 5 });
    frames(70 + 150);
    expect(game.player.locked).toBe(true);
    game.input.press('Escape');
    frames(5 * 60);
    expect(game.player.locked).toBe(false);
    expect(ev.of('ending')).toHaveLength(1);
  });
  it('불꽃놀이 도중 저장·새로고침: dexDone 만 있고 ended 가 없으면 다시 틀고 ending 한 번 + 소행성', async () => {
    expect(endingResume({}, false)).toBeNull();
    expect(endingResume({ dexDone: 1 }, false)).toBe('fireworks');
    expect(endingResume({ dexDone: 1, ended: 1, by: 'dex' }, false)).toBe('unlock');
    expect(endingResume({ ended: 1, by: 'story' }, false)).toBe('unlock');
    expect(endingResume({ dexDone: 1, ended: 1, by: 'dex' }, true)).toBeNull();
    const game = makeFakeGame({ load: false });
    const ctx = makeCtx(game);
    await buildSpace(ctx as never);
    (game.state.flags as Record<string, unknown>).space = { flight: { ending: { dexDone: 1 } } };
    const ev = recordEvents(game);
    await buildFlight(ctx as never);
    const fx = game.ext.flight as FlightExt;
    tickSec(game, 2);
    expect(game.player.locked).toBe(true); // 다시 트는 중
    tickSec(game, 14);
    expect(ev.of('ending')).toHaveLength(1);
    expect(fx.ended()).toBe(true);
    expect(fx.asteroid.unlocked()).toBe(true);
    // 그 뒤로는 다시 안 난다
    fx.checkDex({ got: 5, total: 5 });
    tickSec(game, 14);
    expect(ev.of('ending')).toHaveLength(1);
  });
  it('story 엔딩 뒤 소행성 카드 전에 새로고침해도 소행성이 열린다', async () => {
    const game = makeFakeGame({ load: false });
    const ctx = makeCtx(game);
    await buildSpace(ctx as never);
    (game.state.flags as Record<string, unknown>).space = { flight: { ending: { ended: 1, by: 'story' } } };
    const ev = recordEvents(game);
    await buildFlight(ctx as never);
    tickSec(game, 0.5);
    expect((game.ext.flight as FlightExt).asteroid.unlocked()).toBe(true);
    expect(ev.of('ending')).toHaveLength(0);
  });
});
