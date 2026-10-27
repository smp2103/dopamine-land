// meta — 업적·일일 미션·세트·숙련·섬 도감을 가짜 게임에 이벤트를 쏘아 확인한다(화면 없이).
// econ 은 기록하는 작은 대역(반짝별·열쇠 조각·가방·해금·기증)을 쓴다 — meta 가 보상을 꼭 econ 으로 주는지 본다.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame, type FakeEnv } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import { rngFor } from '../src/core/rng';
import type { EconApi, KeyColor } from '../src/core/api';
import type { Species } from '../src/core/state';
import buildMeta from '../src/modules/meta';
import {
  ACHIEVEMENTS, MISSION_TEMPLATES, MISSION_BY_ID, SETS, C, MISSIONS_PER_DAY, MISSION_STARS, MISSIONS_ALL_STARS, ISLETS,
} from '../src/modules/meta/data';
import { rollMissions, masteryLevel, ensureMetaFlags, progressOf, islandStepsAt, isEndemic } from '../src/modules/meta/logic';

// ───────────── 대역 ─────────────
interface FakeEcon {
  stars: number;
  starLog: Array<[number, string]>;
  keys: Record<KeyColor, number>;
  given: Array<[string, number]>;
  unlocks: Set<string>;
  donated: Set<string>;
  skeletons: string[];
  hot: string[];
  api: EconApi;
}
function fakeEcon(game: FakeGame): FakeEcon {
  const fe: FakeEcon = {
    stars: 0, starLog: [], keys: { silver: 0, gold: 0, rainbow: 0 }, given: [], unlocks: new Set(), donated: new Set(), skeletons: [], hot: [],
    api: null as unknown as EconApi,
  };
  fe.api = {
    get stars() { return fe.stars; },
    addStars: (n: number, why: string) => { fe.stars += n; fe.starLog.push([n, why]); game.state.emit({ type: 'stars', delta: n, why }); },
    addKeyPiece: (c: KeyColor, n: number) => { fe.keys[c] += n; },
    give: (id: string, n: number) => { fe.given.push([id, n]); game.state.addItem(id, n); return n; },
    isUnlocked: (k: string) => fe.unlocks.has(k),
    unlock: (k: string, why?: string) => { if (fe.unlocks.has(k)) return; fe.unlocks.add(k); game.state.emit({ type: 'unlock', key: k, why }); },
    isDonated: (id: string) => fe.donated.has(id),
    skeletonsDone: () => fe.skeletons,
    rocket: () => ({ blueprint: false, parts: { body: false, engine: false, window: false, wing: false, fuel: false, chip: fe.unlocks.has('rocket:part:chip') }, count: 0, pad: false }),
    market: () => ({ day: 0, hot: fe.hot, mult: {} }),
    day: () => Math.floor(game.env?.day ?? 0),
  } as unknown as EconApi;
  game.econ = fe.api;
  return fe;
}

type Meta = {
  progress(): { achievements: { done: number; total: number }; missions: { done: number; total: number; bonus: boolean }; sets: { done: number }; stars: number };
  missions(): Array<{ id: string; done: boolean; have: number; goal: number }>;
  achievements(): Array<{ id: string; done: boolean; have: number; need: number }>;
  mastery(id: string): number;
  perk(name: string): boolean;
  islandDex(id: string): { got: number; total: number; pct: number; steps: number };
  counter(k: string): number;
  check(): void;
};

function boot(o: { load?: boolean; hour?: number; day?: number } = {}) {
  const game = makeFakeGame({ load: o.load, hour: o.hour, day: o.day });
  const econ = fakeEcon(game);
  const ev = recordEvents(game);
  const ctx = makeCtx(game);
  buildMeta(ctx as never);
  const meta = game.ext.meta as Meta;
  const step = () => { game.tick(0.25, 2); };
  return { game, econ, ev, meta, step, env: game.env as FakeEnv };
}

const sp = (id: string, category: string, rarity: number, extra: Partial<Species> = {}): Species => ({ id, name: id, category, rarity, ...extra });
const fishA = sp('t_fish_a', 'fish', 1, { where: [{ island: 'home', zone: 'river' }] });
const bugA = sp('t_bug_a', 'bug', 1, { where: [{ island: 'home', zone: 'flower' }] });

/** 낚시 한 번: 도감 기록 + 'catch' */
function catchOne(game: FakeGame, s: Species, activity = 'fish', o: { combo?: number; variant?: 'shiny' | 'crown' } = {}) {
  game.state.collect({ species: s, activity, variant: o.variant });
  game.state.emit({ type: 'catch', activity, species: s, rarity: s.rarity, combo: o.combo ?? 1, variant: o.variant });
}

beforeEach(() => { stubLocalStorage(); });

describe('데이터', () => {
  it('업적 ~60(5.7 표 전부) · 미션 템플릿 15 · 세트 4.11 전부', () => {
    expect(ACHIEVEMENTS.length).toBe(65);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const id of ['ach_first_fish', 'ach_fish_1000', 'ach_dex_100', 'ach_legend_all', 'ach_shiny_5', 'ach_rain_night', 'ach_meteor_wish', 'ach_guppy7',
      'ach_islet_all', 'ach_swim_far', 'ach_speed', 'ach_current', 'ach_tino_sneak', 'ach_dino_ride', 'ach_fossil_all', 'ach_bottle_map', 'ach_million',
      'ach_lighthouse_4', 'ach_launch', 'ach_moon_jump', 'ach_starsaurus', 'ach_space_5']) expect(ACHIEVEMENTS.some((a) => a.id === id)).toBe(true);
    for (const a of ACHIEVEMENTS) expect(a.stars).toBeGreaterThanOrEqual(5);
    expect(MISSION_TEMPLATES.length).toBe(15);
    expect(SETS.filter((s) => s.group === 'set-island-master').length).toBe(7);
    for (const id of ['set-rainbow-guppy', 'set-constellation', 'set-glow', 'set-ball', 'set-nudi', 'set-ancient', 'set-crown', 'set-shiny', 'set-space'])
      expect(SETS.some((s) => s.id === id)).toBe(true);
    expect(ISLETS.length).toBe(8);
  });
  it('미션 굴림은 날마다 결정적, 5개 서로 다름', () => {
    const a = rollMissions(rngFor('missions:3'));
    expect(a).toEqual(rollMissions(rngFor('missions:3')));
    expect(new Set(a).size).toBe(MISSIONS_PER_DAY);
    const days = new Set(Array.from({ length: 6 }, (_, d) => rollMissions(rngFor(`missions:${d}`)).join(',')));
    expect(days.size).toBeGreaterThan(1);
  });
  it('숙련 단계 · 섬 단계 · 고유종', () => {
    expect(masteryLevel(undefined)).toBe(0);
    expect(masteryLevel({ count: 1 })).toBe(1);
    expect(masteryLevel({ count: 10 })).toBe(2);
    expect(masteryLevel({ count: 2, variants: { crown: 1 } })).toBe(3);
    expect([0, 49, 50, 80, 99, 100].map(islandStepsAt)).toEqual([0, 0, 1, 2, 2, 3]);
    expect(isEndemic(sp('x', 'fish', 1, { where: [{ island: 'ice' }, { island: 'ice' }] }), 'ice')).toBe(true);
    expect(isEndemic(sp('y', 'fish', 1, { where: [{ island: 'ice' }, { island: 'any' }] }), 'ice')).toBe(false);
  });
  it('깨진 저장도 받아 준다', () => {
    const flags: Record<string, unknown> = { meta: { c: { a: 'x', b: 2 }, ach: [1], perks: ['ranch', 3], ms: { day: 'no' } } };
    const f = ensureMetaFlags(flags);
    expect(f.c).toEqual({ b: 2 });
    expect(f.ach).toEqual({});
    expect(f.perks).toEqual(['ranch']);
    expect(f.ms).toBeNull();
    expect(flags.meta).toBe(f);
  });
});

describe('업적', () => {
  it('첫 손맛: 물고기 1마리 → 업적 + ⭐5 + 카드 + achievement 이벤트', () => {
    const { game, econ, ev, meta, step } = boot();
    game.state.register([fishA]);
    step();
    expect(meta.achievements().find((a) => a.id === 'ach_first_fish')!.done).toBe(false);
    catchOne(game, fishA);
    step();
    expect(meta.achievements().find((a) => a.id === 'ach_first_fish')!.done).toBe(true);
    expect(ev.of('achievement').filter((e) => e.id === 'ach_first_fish')).toEqual([{ type: 'achievement', id: 'ach_first_fish', stars: 5 }]);
    expect(econ.starLog.some(([n, why]) => n === 5 && why === 'ach:ach_first_fish')).toBe(true);
    expect(game.hudLog.cards.some((c) => c.title.includes('첫 손맛'))).toBe(true);
    // 곤충은 아직
    expect(meta.achievements().find((a) => a.id === 'ach_first_bug')!.done).toBe(false);
    catchOne(game, bugA, 'bug');
    step();
    expect(meta.achievements().find((a) => a.id === 'ach_first_bug')!.done).toBe(true);
  });

  it('10 / 100 카운터: 낚시꾼 견습 → 낚시꾼, 진행 막대', () => {
    const { game, ev, meta, step } = boot();
    game.state.register([fishA]);
    for (let i = 0; i < 9; i++) catchOne(game, fishA);
    step();
    const a10 = () => meta.achievements().find((a) => a.id === 'ach_fish_10')!;
    expect(a10()).toMatchObject({ done: false, have: 9, need: 10 });
    catchOne(game, fishA);
    step();
    expect(a10().done).toBe(true);
    expect(meta.counter(C.fish)).toBe(10);
    for (let i = 0; i < 89; i++) catchOne(game, fishA);
    step();
    expect(meta.achievements().find((a) => a.id === 'ach_fish_100')!.done).toBe(false);
    catchOne(game, fishA);
    step();
    expect(meta.achievements().find((a) => a.id === 'ach_fish_100')!.done).toBe(true);
    expect(ev.of('achievement').filter((e) => e.id === 'ach_fish_100').length).toBe(1);
    // 숙련: 같은 종 10번 → 은별
    expect(meta.mastery('t_fish_a')).toBe(2);
  });

  it('날씨 조건: 비 오는 밤에만 센다(낮 비·맑은 밤은 안 침)', () => {
    const { game, env, meta, step } = boot({ hour: 12 });
    game.state.register([fishA]);
    env.forceWeather('*', 'rain');
    for (let i = 0; i < 10; i++) catchOne(game, fishA); // 비 오는 낮
    env.setHour(23);
    env.forceWeather('*', null);
    for (let i = 0; i < 10; i++) catchOne(game, fishA); // 맑은 밤
    step();
    expect(meta.counter(C.rainNightFish)).toBe(0);
    env.forceWeather('*', 'rain');
    expect(env.tod).toBe('night');
    for (let i = 0; i < 9; i++) catchOne(game, fishA);
    step();
    expect(meta.achievements().find((a) => a.id === 'ach_rain_night')!.done).toBe(false);
    catchOne(game, fishA);
    step();
    expect(meta.achievements().find((a) => a.id === 'ach_rain_night')!.done).toBe(true);
    // 유성우 별가루도 그때 날씨로
    env.forceWeather('*', 'meteor');
    game.state.emit({ type: 'harvest', kind: 'meteor', item: 'm_stardust', n: 6, island: 'launch' });
    env.forceWeather('*', 'clear');
    game.state.emit({ type: 'harvest', kind: 'stardust', item: 'm_stardust', n: 6, island: 'launch' });
    env.forceWeather('*', 'meteor');
    game.state.emit({ type: 'harvest', kind: 'stardust', item: 'm_stardust', n: 4, island: 'launch' });
    step();
    expect(meta.counter(C.meteorDust)).toBe(10);
    expect(meta.achievements().find((a) => a.id === 'ach_meteor_wish')!.done).toBe(true);
  });

  it('상태 판정: ★5 첫 등록·반짝이·왕관·날씨 전용 생물·도감 %, 업적 여럿이면 카드 한 장', () => {
    const { game, ev, meta, step } = boot();
    const legend = sp('t_legend', 'fish', 5, { where: [{ island: 'ice', weather: { only: ['aurora'] } }] });
    game.state.register([legend, fishA]);
    step();
    game.hudLog.cards.length = 0;
    catchOne(game, legend, 'fish', { variant: 'crown' });
    game.state.collect({ species: fishA, variant: 'shiny' });
    step();
    const done = new Set(meta.achievements().filter((a) => a.done).map((a) => a.id));
    for (const id of ['ach_first_fish', 'ach_legend_first', 'ach_legend_all', 'ach_crown_first', 'ach_shiny_first', 'ach_aurora']) expect(done.has(id)).toBe(true);
    expect(done.has('ach_rare_first')).toBe(false);
    expect(done.has('ach_dex_10')).toBe(false); // 2 / 314
    // 한 판정에 4개 넘게 → 묶음 카드 한 장, 이벤트는 하나씩
    expect(game.hudLog.cards.filter((c) => c.title.includes('업적')).length).toBe(1);
    expect(ev.of('achievement').length).toBeGreaterThanOrEqual(6);
    expect(meta.mastery('t_legend')).toBe(3);
  });

  it('세상 살피기·이벤트: 상자 출처·티노·공룡·등대·쪼꼬미섬·다른 모듈이 알린 업적', () => {
    const { game, econ, meta, step } = boot();
    const st = game.state;
    st.emit({ type: 'chest-open', tier: 'silver', at: 'wreck', loot: [], source: 'wreck' });
    st.emit({ type: 'chest-open', tier: 'gold', at: 'tino', loot: [], source: 'tino' });
    st.emit({ type: 'chest-open', tier: 'wood', at: 'x', loot: [], source: 'mimic', mimic: true });
    st.emit({ type: 'tino', state: 'wake' });
    st.emit({ type: 'befriend', id: 'z_x', hearts: 5, kind: 'dino', why: 'feed' });
    st.emit({ type: 'mount', vehicle: 'dino_tri' });
    st.emit({ type: 'stung' });
    for (const id of ['home', 'dino', 'ice', 'coral']) econ.unlocks.add(`lighthouse:${id}`);
    for (const id of ISLETS) st.emit({ type: 'discover', place: id, name: id, kind: 'islet' });
    st.emit({ type: 'achievement', id: 'ach_speed', stars: 10 });
    step();
    const done = new Set(meta.achievements().filter((a) => a.done).map((a) => a.id));
    for (const id of ['ach_wreck', 'ach_tino_sneak', 'ach_tino_wake', 'ach_dino_friend', 'ach_dino_ride', 'ach_stung', 'ach_gold_chest', 'ach_lighthouse_4', 'ach_islet_all', 'ach_speed'])
      expect(done.has(id)).toBe(true);
    expect(meta.counter(C.chest)).toBe(2); // 상자게 도망은 안 센다
    expect(meta.counter(C.feed)).toBe(1);
    expect(econ.starLog.filter(([, w]) => w === 'ach:ach_speed').length).toBe(1);
  });

  it('달 높이뛰기·먼바다 수영은 세상을 살펴서', () => {
    const { game, meta, step } = boot();
    // 바다 한가운데서 수영
    game.player.pos.set(0, 0, 3600);
    game.player.mode = 'swim';
    step();
    expect(meta.achievements().find((a) => a.id === 'ach_swim_far')!.done).toBe(true);
    // 달
    game.setWorld('space');
    game.addGroundProvider(() => 0, 'moon-floor');
    game.player.mode = 'air';
    game.player.pos.set(0, 11, 30000);
    step();
    expect(meta.achievements().find((a) => a.id === 'ach_moon_jump')!.done).toBe(true);
  });
});

/** 미션 하나를 이벤트로 채운다 */
function doMission(game: FakeGame, econ: FakeEcon, id: string) {
  const st = game.state;
  const tpl = MISSION_BY_ID.get(id)!;
  for (let i = 0; i < tpl.goal && i < 10; i++) {
    switch (tpl.key) {
      case C.fish: catchOne(game, fishA); break;
      case C.bug: catchOne(game, bugA, 'bug'); break;
      case C.dive: catchOne(game, sp('t_sea', 'sea', 1), 'dive'); break;
      case C.r3: catchOne(game, sp('t_rare', 'fish', 3)); break;
      case C.newDex: st.collect({ species: sp(`t_new_${st.species.size}`, 'bug', 1) }); break;
      case C.chest: st.emit({ type: 'chest-open', tier: 'wood', at: 'call', loot: [], source: 'call' }); break;
      case C.rock: st.emit({ type: 'rock-hit', x: 0, z: 0, rock: 'r', combo: 1, island: 'home' }); break;
      case C.shake: st.emit({ type: 'tree-shake', x: 0, z: 0, tree: 't', island: 'home' }); break;
      case C.dig: st.emit({ type: 'harvest', kind: 'dig', item: 'm_stone', n: 1, island: 'home' }); break;
      case C.donate: st.emit({ type: 'donate', id: 't_fish_a', n: 1, coins: 0 }); break;
      case C.travel: st.emit({ type: 'arrive', to: 'moon' }); break;
      case C.feed: st.emit({ type: 'befriend', id: 'z_x', hearts: 1, kind: 'dino', why: 'feed' }); break;
      case C.balloon: st.emit({ type: 'harvest', kind: 'balloon', item: 'm_balloon_scrap', n: 1, island: 'home' }); break;
      case C.hot: econ.hot = ['t_hot']; catchOne(game, sp('t_hot', 'fish', 2)); break;
    }
  }
  if (tpl.key === C.sold) st.emit({ type: 'sell', id: 't_fish_a', n: 1, coins: tpl.goal });
}

describe('일일 미션', () => {
  it('5개 굴림(missions:day) → 하나에 ⭐3, 모두 끝내면 +10 한 번만, 다음 날 새 판', () => {
    const { game, econ, ev, meta, step, env } = boot();
    game.state.register([fishA, bugA]);
    step();
    const ids = meta.missions().map((m) => m.id);
    expect(ids).toEqual(rollMissions(rngFor('missions:0')));
    expect(ids.length).toBe(MISSIONS_PER_DAY);

    doMission(game, econ, ids[0]);
    step();
    expect(meta.missions()[0].done).toBe(true);
    expect(ev.of('mission-done').map((e) => e.id)).toEqual([ids[0]]);
    expect(econ.starLog.filter(([, w]) => w.startsWith('mission:')).map(([n]) => n)).toEqual([MISSION_STARS]);
    expect(econ.keys.silver).toBe(1);

    for (const id of ids.slice(1)) doMission(game, econ, id);
    step();
    expect(meta.missions().every((m) => m.done)).toBe(true);
    expect(ev.of('mission-done').length).toBe(5);
    expect(ev.of('missions-all')).toEqual([{ type: 'missions-all', day: 0 }]);
    expect(econ.starLog.filter(([, w]) => w === 'missions-all').map(([n]) => n)).toEqual([MISSIONS_ALL_STARS]);
    expect(econ.keys.gold).toBe(1);
    expect(meta.progress().missions).toMatchObject({ done: 5, total: 5, bonus: true });

    // 더 해도 두 번은 없다
    for (const id of ids) doMission(game, econ, id);
    meta.check();
    step();
    expect(ev.of('mission-done').length).toBe(5);
    expect(ev.of('missions-all').length).toBe(1);

    // 다음 날: 새 판, 진행은 0부터
    env.advance(1800);
    game.state.emit({ type: 'day', day: 1, prev: 0 });
    step();
    const next = meta.missions();
    expect(next.map((m) => m.id)).toEqual(rollMissions(rngFor('missions:1')));
    expect(next.every((m) => !m.done && m.have === 0)).toBe(true);
    expect(meta.progress().missions.bonus).toBe(false);
  });
});

describe('세트', () => {
  it('태그로 세트 완성(밤의 빛 8종) → 특전 nightvision + 랜턴 + 큰 축하 + set-complete', () => {
    const { game, econ, ev, meta, step } = boot();
    const glow = Array.from({ length: 8 }, (_, i) => sp(`t_glow_${i}`, i < 4 ? 'bug' : 'fish', 2, { tags: ['set:glow'] }));
    game.state.register(glow);
    for (const s of glow.slice(0, 7)) game.state.collect({ species: s });
    step();
    expect(meta.perk('nightvision')).toBe(false);
    game.state.collect({ species: glow[7] });
    step();
    expect(meta.perk('nightvision')).toBe(true);
    expect(ev.of('set-complete').map((e) => e.id)).toEqual(['set-glow']);
    expect(econ.given).toContainEqual(['f_fireflylantern', 1]);
    expect(econ.keys.gold).toBeGreaterThanOrEqual(3);
    expect(game.hudLog.banners.some((b) => b.text === '세트 완성!')).toBe(true);
    // 기증 세트: 별자리 12 기증 → 항법 칩 해금
    const zod = Array.from({ length: 12 }, (_, i) => sp(`t_zod_${i}`, 'fish', 3, { tags: ['set:zodiac'] }));
    game.state.register(zod);
    for (const s of zod) { game.state.collect({ species: s }); econ.donated.add(s.id); game.state.emit({ type: 'donate', id: s.id, n: 1, coins: 0 }); }
    step();
    expect(econ.unlocks.has('rocket:part:chip')).toBe(true);
    expect(ev.of('set-complete').map((e) => e.id)).toContain('set-constellation');
    expect(meta.achievements().find((a) => a.id === 'ach_zodiac')!.done).toBe(true);
  });

  it('고대 세트는 골격 3 까지 · 섬 마스터는 고유종 전부 · 섬 도감 50/80/100%', () => {
    const { game, econ, ev, meta, step } = boot();
    const anc = Array.from({ length: 6 }, (_, i) => sp(`t_anc_${i}`, 'fish', 2, { tags: ['ancient'], where: [{ island: 'dino' }] }));
    const shared = sp('t_shared', 'fish', 1, { where: [{ island: 'dino' }, { island: 'home' }] });
    game.state.register([...anc, shared]);
    for (const s of anc) game.state.collect({ species: s });
    step();
    expect(meta.perk('ranch')).toBe(false); // 골격이 아직
    // 고유종(anc 6)은 다 모았다 → 쿵쿵공룡섬 마스터, 섬 도감 6/7 = 85%
    expect(ev.of('set-complete').map((e) => e.id)).toEqual(['set-island-master:dino']);
    expect(meta.islandDex('dino')).toMatchObject({ got: 6, total: 7, steps: 2 });
    expect(econ.starLog.filter(([, w]) => w === 'island-dex:dino').map(([n]) => n)).toEqual([70]);
    econ.skeletons = ['a', 'b', 'c'];
    game.state.emit({ type: 'collect', species: sp('fos_x', 'fossil', 1), isNew: true });
    step();
    expect(meta.perk('ranch')).toBe(true);
    expect(econ.unlocks.has('facility:ranch')).toBe(true);
    game.state.collect({ species: shared });
    step();
    expect(meta.islandDex('dino').steps).toBe(3);
    expect(econ.starLog.filter(([, w]) => w === 'island-dex:dino').map(([n]) => n)).toEqual([70, 100]);
  });

  it('progressOf 는 선언형 조건 그대로', () => {
    const view = {
      counter: (k: string) => (k === 'x' ? 4 : 0), max: () => 7, species: [], rec: () => undefined, byGdd: () => undefined,
      seen: () => 3, isUnlocked: (k: string) => k === 'a', isDonated: () => false, skeletons: () => 2, rocketParts: () => 1,
    };
    expect(progressOf({ k: 'count', key: 'x', n: 5 }, view)).toMatchObject({ have: 4, need: 5, done: false });
    expect(progressOf({ k: 'max', key: 'y', n: 7 }, view).done).toBe(true);
    expect(progressOf({ k: 'unlocked', keys: ['a', 'b'], n: 1 }, view).done).toBe(true);
    expect(progressOf({ k: 'seen', set: 'island', n: 7 }, view)).toMatchObject({ have: 3, need: 7 });
  });
});

describe('저장', () => {
  it('다시 불러와도 같은 보상을 두 번 주지 않는다', () => {
    const a = boot();
    const glow = Array.from({ length: 8 }, (_, i) => sp(`t_glow_${i}`, 'bug', 2, { tags: ['set:glow'] }));
    a.game.state.register([fishA, ...glow]);
    for (let i = 0; i < 10; i++) catchOne(a.game, fishA);
    for (const s of glow) a.game.state.collect({ species: s });
    a.step();
    const ids = a.meta.missions().map((m) => m.id);
    for (const id of ids) doMission(a.game, a.econ, id);
    a.step();
    const doneBefore = a.meta.achievements().filter((x) => x.done).map((x) => x.id);
    expect(doneBefore).toContain('ach_fish_10');
    expect(a.meta.progress().missions.bonus).toBe(true);
    expect(a.meta.perk('nightvision')).toBe(true);
    a.game.flushSave();
    a.game.dispose();

    // 같은 저장소로 새 게임(같은 날)
    const b = boot({ load: true });
    b.game.state.register([fishA, ...glow]);
    b.step();
    b.meta.check();
    b.step();
    expect(b.econ.stars).toBe(0);
    expect(b.ev.of('achievement').length).toBe(0);
    expect(b.ev.of('set-complete').length).toBe(0);
    expect(b.ev.of('mission-done').length).toBe(0);
    expect(b.ev.of('missions-all').length).toBe(0);
    expect(b.meta.achievements().filter((x) => x.done).map((x) => x.id)).toEqual(doneBefore);
    expect(b.meta.missions().map((m) => m.id)).toEqual(ids);
    expect(b.meta.perk('nightvision')).toBe(true);
    expect(b.meta.mastery('t_fish_a')).toBe(2);
    // 이어서 새로 채운 건 준다
    for (let i = 0; i < 90; i++) catchOne(b.game, fishA);
    b.step();
    expect(b.ev.of('achievement').map((e) => e.id)).toContain('ach_fish_100');
  });

  it('econ 이 없으면 보상을 밀려 뒀다가 econ 이 생기면 준다', () => {
    const game = makeFakeGame();
    const ctx = makeCtx(game);
    buildMeta(ctx as never);
    game.state.register([fishA]);
    catchOne(game, fishA);
    game.tick(0.25, 2);
    expect((game.state.flags.meta as { owed: unknown[] }).owed.length).toBeGreaterThan(0);
    const econ = fakeEcon(game);
    game.state.emit({ type: 'catch-fail', activity: 'fish' });
    game.tick(0.25, 2);
    expect(econ.stars).toBeGreaterThanOrEqual(5);
    expect((game.state.flags.meta as { owed: unknown[] }).owed.length).toBe(0);
  });
});

describe('일지 창', () => {
  it('J 로 열고 네 탭이 그려진다', () => {
    const { game, meta, step } = boot();
    game.state.register([fishA]);
    catchOne(game, fishA);
    step();
    expect(game.hud.panel('journal')).not.toBeNull();
    expect(game.hud.hotkeys().some((h) => h.code === 'KeyJ')).toBe(true);
    game.hud.open('journal');
    expect(game.hud.isOpen('journal')).toBe(true);
    const def = game.hud.panel('journal')!;
    expect(def.tabs!().map((t) => t.id)).toEqual(['missions', 'ach', 'sets', 'mastery']);
    for (const tab of ['missions', 'ach', 'sets', 'mastery']) {
      const body = { innerHTML: '' } as unknown as HTMLElement;
      const h = { esc: (s: unknown) => String(s), fmt: (n: number) => String(n), ico: () => '🐟', name: (id: string) => id, color: () => '#fff', confetti: () => {}, button: () => body };
      def.render(body, { tab, sel: null, arg: undefined, setSel: () => {}, setTab: () => {}, rerender: () => {}, close: () => {}, h } as never);
      expect(body.innerHTML.length).toBeGreaterThan(50);
      if (tab === 'ach') expect(body.innerHTML).toContain('첫 손맛');
      if (tab === 'sets') expect(body.innerHTML).toContain('무지개 구피');
      if (tab === 'mastery') expect(body.innerHTML).toContain('t_fish_a');
    }
    expect(meta.progress().achievements.total).toBe(65);
  });
});
