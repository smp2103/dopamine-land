// 바다(ocean-dive): 헤엄 체력 시간표·튜브 구조 · 도구별 산소 · waveAt(결정성 · vehicles 잔물결과 같은 식 · 폭풍 진폭 ×2) ·
// 잠수 후보 거르기(구역·깊이·시간·날씨) · 바다거북 목격은 가방에 안 들어감 · 플랑크톤 별가루 · flags.ocean 옮기기 · 행동.
import { describe, it, expect, beforeEach } from 'vitest';
import vehiclesSrc from '../src/modules/vehicles.ts?raw';
import { stubLocalStorage } from './kit/storage';
import { GameState } from '../src/core/state';
import { waveAt, waveSwell, WAVE } from '../src/modules/ocean/waves';
import {
  SwimStamina, OxygenTank, oxygenMaxFor, OXYGEN, STAMINA, findBeach, seaDistance, diveZoneOf, divePool, localRoll, catchDrops,
  readOceanFlags, rollOceanDay, newBeh, stepBehaviour, catchable, FLEE, timeOk,
  isBonusRoll, plainRoll, needsReroll, catchShowFor, localSize, REROLL_NEAR,
} from '../src/modules/ocean/logic';
import { SEA_SPECIES, SEA_BY_ID, isWitness } from '../src/modules/ocean/data';
import { rollCatch as econRoll, newRollState, speciesWeight, commitCatch } from '../src/modules/economy/roll';
import { rngFor } from '../src/core/rng';

beforeEach(() => { stubLocalStorage(); });

/** 일정 시간 동안 같은 조건으로 tick — 일어난 이벤트(시각 포함) */
function run(s: SwimStamina, sec: number, input: { swimming: boolean; coastDist: number; resting?: boolean }, dt = 0.1) {
  const ev: Array<{ t: number; e: string }> = [];
  for (let t = 0; t < sec - 1e-9; t += dt) { const e = s.tick(dt, input); if (e) ev.push({ t: +(t + dt).toFixed(2), e }); }
  return ev;
}

describe('헤엄 체력과 둥둥 튜브 구조', () => {
  it('해안 200m 밖에서 초당 −1 → 100초에 0 → 1.5초 페이드 뒤 구조, 체력은 가득', () => {
    const s = new SwimStamina();
    expect(s.max).toBe(100);
    run(s, 30, { swimming: true, coastDist: 260 });
    expect(s.value).toBeCloseTo(70, 5);
    const ev = run(s, 70.05, { swimming: true, coastDist: 260 });
    expect(ev.map((x) => x.e)).toEqual(['rescue-start']);
    expect(Math.abs(ev[0].t - 70)).toBeLessThan(0.11);
    expect(s.value).toBe(0);
    expect(s.fading).toBe(true);
    // 페이드 중엔 더 줄지도 않고 구조는 1.5초 뒤 한 번
    const ev2 = run(s, 1.4, { swimming: true, coastDist: 260 });
    expect(ev2).toEqual([]);
    expect(s.fadeK).toBeGreaterThan(0.9);
    let ev3: string | null = null;
    for (let i = 0; i < 3 && !ev3; i++) ev3 = s.tick(0.1, { swimming: true, coastDist: 260 });
    expect(ev3).toBe('rescue');
    expect(s.value).toBe(STAMINA.max);
    expect(s.fading).toBe(false);
  });
  it('해안 150m 안·땅에서는 회복, 150~200m 는 그대로', () => {
    const s = new SwimStamina();
    s.set(50);
    run(s, 2, { swimming: true, coastDist: 120 });
    expect(s.value).toBeCloseTo(50 + STAMINA.recoverWater * 2, 5);
    s.set(50);
    run(s, 5, { swimming: true, coastDist: 175 });
    expect(s.value).toBe(50);
    run(s, 1, { swimming: false, coastDist: 0 });
    expect(s.value).toBeCloseTo(50 + STAMINA.recoverLand, 5);
    run(s, 60, { swimming: false, coastDist: 0 });
    expect(s.value).toBe(100);
    // 물 위로 잠깐 뛰어오른(쉬지 않는) 순간엔 그대로
    s.set(40);
    run(s, 2, { swimming: false, coastDist: 260, resting: false });
    expect(s.value).toBe(40);
  });
  it('해안 거리: 땅 0, 바다는 세계 해안 값과 섬 원판 밖 거리 중 큰 쪽', () => {
    const isl = [{ x: 0, z: 0, r: 100 }];
    expect(seaDistance(5, 300, 0, isl)).toBe(0);
    expect(seaDistance(-20, 300, 0, isl)).toBe(175);
    expect(seaDistance(-200, 130, 0, isl)).toBe(200);
  });
  it('가장 가까운 해변 찾기: 마른 땅 몇 걸음 안쪽, 섬 쪽으로', () => {
    // x ≥ 100 은 높이 2 인 섬, 그 밖은 바다(물 0)
    const T = { height: (x: number) => (x >= 100 ? 2 : -10), water: (x: number) => (x >= 100 ? -Infinity : 0) };
    const b = findBeach(T, 0, 0, [{ x: 300, z: 0 }]);
    expect(b).not.toBeNull();
    expect(b!.x).toBeGreaterThanOrEqual(100);
    expect(b!.x).toBeLessThanOrEqual(110);
    expect(Math.abs(b!.z)).toBeLessThan(1e-6);
    // 섬이 하나도 없으면 null(모듈은 시작 마을로 보낸다)
    expect(findBeach({ height: () => -5, water: () => 0 }, 0, 0, [], { radial: 50 })).toBeNull();
  });
});

describe('잠수 산소(도구별)', () => {
  it('맨몸 20초 · 스노클 40초 · 잠수복 90초', () => {
    expect(oxygenMaxFor(null)).toBe(20);
    expect(oxygenMaxFor((k) => k === 'tool:snorkel')).toBe(40);
    expect(oxygenMaxFor((k) => k === 'tool:snorkel' || k === 'tool:wetsuit')).toBe(90);
    expect(oxygenMaxFor(() => { throw new Error('x'); })).toBe(OXYGEN.bare);
    for (const [keys, sec] of [[[], 20], [['tool:snorkel'], 40], [['tool:wetsuit'], 90]] as const) {
      const tank = new OxygenTank();
      tank.setMax(oxygenMaxFor((k) => (keys as readonly string[]).includes(k)));
      expect(tank.value).toBe(sec);
      let outAt = -1;
      for (let i = 1; i <= sec * 10 + 5; i++) if (tank.tick(0.1, true) === 'out' && outAt < 0) outAt = i / 10;
      expect(Math.abs(outAt - sec)).toBeLessThan(0.11);
      expect(tank.value).toBe(0);
      // 떠오르면 다시 찬다
      tank.tick(1, false);
      expect(tank.value).toBeCloseTo(OXYGEN.refill, 5);
    }
  });
  it('도구를 사면 비율을 지켜 늘어난다', () => {
    const tank = new OxygenTank();
    tank.tick(10, true);
    expect(tank.ratio).toBeCloseTo(0.5, 5);
    tank.setMax(40);
    expect(tank.value).toBeCloseTo(20, 5);
    expect(tank.max).toBe(40);
  });
});

describe('파도 waveAt', () => {
  const vehiclesRipple = (x: number, z: number, t: number) => 0.08 * Math.sin(x * 0.23 + z * 0.11 + t * 0.9) + 0.06 * Math.sin(-x * 0.13 + z * 0.29 + t * 1.25) - 0.02;
  it('결정적이고 vehicles 잔물결(옛 waveY)과 똑같다', () => {
    for (let i = 0; i < 200; i++) {
      const x = (i * 37.3) % 900 - 450, z = (i * 91.7) % 700 - 350, t = i * 0.731;
      expect(waveAt(x, z, t)).toBe(waveAt(x, z, t));
      expect(waveAt(x, z, t, 1)).toBeCloseTo(vehiclesRipple(x, z, t), 12);
    }
  });
  it('vehicles.ts 의 식이 바뀌지 않았다(문자열 그대로)', () => {
    expect(vehiclesSrc).toContain('0.08 * Math.sin(x * 0.23 + z * 0.11 + t * 0.9) + 0.06 * Math.sin(-x * 0.13 + z * 0.29 + t * 1.25) - 0.02');
  });
  it('env.waveMul = 2(폭풍)이면 출렁임 진폭이 두 배, 평균 높이는 그대로', () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 13.1, z = -i * 7.7, t = i * 0.4;
      expect(waveAt(x, z, t, 2) - WAVE.offset).toBeCloseTo(2 * (waveAt(x, z, t, 1) - WAVE.offset), 12);
      expect(waveAt(x, z, t, 2) - WAVE.offset).toBeCloseTo(2 * waveSwell(x, z, t), 12);
    }
    // 최대 진폭 0.14 → 0.28
    let mx1 = 0, mx2 = 0;
    for (let i = 0; i < 4000; i++) { const t = i * 0.05; mx1 = Math.max(mx1, Math.abs(waveSwell(3, 5, t))); mx2 = Math.max(mx2, Math.abs(waveAt(3, 5, t, 2) - WAVE.offset)); }
    expect(mx2 / mx1).toBeCloseTo(2, 6);
    // 이상한 배율은 1
    expect(waveAt(1, 2, 3, NaN)).toBe(waveAt(1, 2, 3, 1));
  });
});

describe('잠수 후보 거르기', () => {
  const ids = (q: Parameters<typeof divePool>[1]) => divePool(SEA_SPECIES, q).map((s) => s.id);
  it('구역 코드: geo 바다 구역 + 난파선', () => {
    expect(diveZoneOf('reef', false)).toBe('reef');
    expect(diveZoneOf('shore', false)).toBe('shallow');
    expect(diveZoneOf('shallow', false)).toBe('shallow');
    expect(diveZoneOf('offshore', false)).toBe('offshore');
    expect(diveZoneOf('deep', false)).toBe('offshore');
    expect(diveZoneOf('trench', false)).toBe('trench');
    expect(diveZoneOf('offshore', true)).toBe('wreck');
    expect(diveZoneOf(null, false)).toBeNull();
  });
  it('산호초 낮: 젤리바니 5색·갯가재는 있고 밤 친구·해구·목격·유물은 없다', () => {
    const day = ids({ zone: 'reef', depth: 8, tod: 'day', hour: 12, weather: 'clear' });
    for (const id of ['d_nudibranch', 'd_nudibranch_pink', 'd_nudibranch_yellow', 'd_nudibranch_purple', 'd_nudibranch_sky', 'd_mantis_shrimp', 'sea-giantclam']) expect(day).toContain(id);
    for (const id of ['d_baby_octopus', 'd_sea_angel', 'd_plankton', 'sea-turtle', 'd_spyglass', 'd_dolphins', 'sea-cucumber']) expect(day).not.toContain(id);
    const night = ids({ zone: 'reef', depth: 8, tod: 'night', hour: 23, weather: 'clear' });
    expect(night).toContain('d_baby_octopus');
    expect(night).toContain('d_sea_angel');
    expect(night).not.toContain('d_mantis_shrimp');
  });
  it('날씨 only: 대왕조개는 맑은 날만', () => {
    expect(ids({ zone: 'reef', depth: 8, tod: 'day', weather: 'clear' })).toContain('sea-giantclam');
    expect(ids({ zone: 'reef', depth: 8, tod: 'day', weather: 'rain' })).not.toContain('sea-giantclam');
  });
  it('깊이: 얕으면 깊은 종은 빠진다', () => {
    const shallow = ids({ zone: 'reef', depth: 1.2, tod: 'day', weather: 'clear' });
    expect(shallow).not.toContain('d_mantis_shrimp');
    expect(shallow).not.toContain('sea-goldhorse');
  });
  it('해구(trench)에만 심해 셋 — 난파선 밤엔 유령해파리', () => {
    const tr = ids({ zone: 'trench', depth: 80, tod: 'night', weather: 'clear' });
    expect(tr.sort()).toEqual(['d_crinoid', 'd_deep_cucumber', 'd_plankton'].sort());
    expect(ids({ zone: 'trench', depth: 80, tod: 'day', weather: 'clear' }).sort()).toEqual(['d_deep_cucumber', 'd_plankton']);
    for (const z of ['reef', 'shallow', 'offshore', 'wreck'] as const) expect(ids({ zone: z, depth: 40, tod: 'night', weather: 'clear' })).not.toContain('d_plankton');
    expect(ids({ zone: 'wreck', depth: 14, tod: 'night', weather: 'fog' })).toContain('d_ghost_jelly');
    expect(ids({ zone: 'wreck', depth: 14, tod: 'day', weather: 'fog' })).not.toContain('d_ghost_jelly');
  });
  it('econ 굴림(roll.ts)도 같은 후보 안에서만 고르고, 안개 낀 밤 유령해파리는 종 가중치 ×3', () => {
    const pool = divePool(SEA_SPECIES, { zone: 'wreck', depth: 14, tod: 'night', weather: 'fog' });
    const env = (w: string) => ({ day: 3, hour: 23, tod: 'night', weather: w, p0: true, rng: (k: string) => rngFor(k) });
    const s = newRollState();
    const seen = new Set<string>();
    for (let i = 0; i < 1500; i++) {
      const r = econRoll({ activity: 'dive', pool, commit: false, place: { zone: 'wreck' } }, s, env('fog'));
      expect(pool.map((p) => p.id)).toContain(r.species!.id);
      seen.add(r.species!.id);
    }
    expect(seen.has('d_ghost_jelly')).toBe(true);
    const ghost = SEA_BY_ID.get('d_ghost_jelly')!;
    expect(speciesWeight(ghost, env('fog'), { zone: 'wreck' })).toBe(3);
    expect(speciesWeight(ghost, env('clear'), { zone: 'wreck' })).toBe(1);
    // 로컬 굴림(econ 없을 때)도 후보 안에서만
    const rnd = rngFor('ocean-test');
    for (let i = 0; i < 200; i++) expect(pool).toContain(localRoll(pool, rnd, 'fog'));
  });
  it('미리 굴린 그림자: 보상(오늘 첫 ★3+·천장)은 한 자리만 — 나머지는 종 희귀도 그대로의 보통 굴림', () => {
    const pool = divePool(SEA_SPECIES, { zone: 'reef', depth: 10, tod: 'day', weather: 'clear' });
    const env = { day: 5, hour: 12, tod: 'day', weather: 'clear', p0: true, rng: (k: string) => rngFor(k) };
    const s = newRollState();
    // ocean.ts rollSpot 과 같은 규칙: 보상 굴림이 이미 한 자리에 있으면 로컬 종으로 바꾼다
    const spots: Array<ReturnType<typeof econRoll>> = [];
    for (let i = 0; i < 30; i++) {
      const res = econRoll({ activity: 'dive', pool, commit: false, place: { zone: 'reef' } }, s, env);
      expect(isBonusRoll(res)).toBe(true); // 새 저장: 모든 미리 굴림이 '오늘 첫 잡기' 를 받아 온다
      if (spots.some(isBonusRoll)) {
        const rnd = rngFor(`t:${i}`);
        const sp = localRoll(pool, rnd, 'clear')!;
        spots.push(plainRoll(res, sp, localSize(sp, rnd)));
      } else spots.push(res);
    }
    expect(spots.filter(isBonusRoll)).toHaveLength(1);
    expect(spots[0].rarity).toBeGreaterThanOrEqual(3);
    for (const r of spots.slice(1)) {
      expect(r.firstOfDay).toBeUndefined();
      expect(r.pityHit).toBeUndefined();
      expect(r.rarity).toBe(SEA_BY_ID.get(r.species!.id)!.rarity);
      expect(pool.map((p) => p.id)).toContain(r.species!.id);
    }
    // ★3+ 가 다 깔리지 않는다(보통 확률 ≈ 18%)
    expect(spots.slice(1).filter((r) => r.rarity >= 3).length).toBeLessThan(15);
    // 보통 자리를 잡아도 오늘 첫 보상은 남는다 → 보상 자리를 잡으면 그때 쓴다
    const plain = commitCatch(s, 'dive', spots[1], env.day);
    expect(plain.firstOfDay).toBeUndefined();
    expect(s.firstDay.dive).not.toBe(env.day);
    const won = commitCatch(s, 'dive', spots[0], env.day);
    expect(won.firstOfDay).toBe(true);
    expect(s.firstDay.dive).toBe(env.day);
    expect(isBonusRoll(econRoll({ activity: 'dive', pool, commit: false, place: { zone: 'reef' } }, s, env))).toBe(false);
    expect(isBonusRoll(null)).toBe(false);
  });
  it('시간대·날씨가 바뀐 자리: 안 보이거나 20m 밖일 때만 다시 굴린다', () => {
    expect(needsReroll('day|clear', 'day|clear', 40, false)).toBe(false);
    expect(needsReroll('day|clear', 'night|fog', 9, true)).toBe(false); // 눈앞에선 안 바꾼다
    expect(needsReroll('day|clear', 'night|fog', 9, false)).toBe(true); // 가까워도 안 보이면
    expect(needsReroll('day|clear', 'night|fog', REROLL_NEAR + 1, true)).toBe(true);
  });
  it('시간 창: 정오·자정·종일', () => {
    expect(timeOk('all', 'night')).toBe(true);
    expect(timeOk(['noon'], 'day', 12)).toBe(true);
    expect(timeOk(['noon'], 'day', 15)).toBe(false);
    expect(timeOk('midnight', 'night', 1)).toBe(true);
  });
});

describe('목격·떨굼', () => {
  it('바다거북(목격)은 keep:false — 도감에만, 가방엔 안 들어간다', () => {
    const turtle = SEA_BY_ID.get('sea-turtle')!;
    expect(turtle.gdd).toBe('d_turtle');
    expect(isWitness(turtle)).toBe(true);
    const st = new GameState();
    st.register(SEA_SPECIES);
    expect(st.byGdd('d_turtle')?.id).toBe('sea-turtle');
    // ocean.ts 의 쓰다듬기·인사·잡기가 쓰는 그 함수로
    expect(catchShowFor(turtle)).toEqual({ keep: false });
    expect(catchShowFor(SEA_BY_ID.get('d_dolphins')!).keep).toBe(false);
    expect(catchShowFor(SEA_BY_ID.get('sea-lobster')!).keep).toBe(true);
    st.collect({ species: turtle, ...catchShowFor(turtle) });
    expect(st.dex['sea-turtle']?.count).toBe(1);
    expect(st.bag['sea-turtle']).toBeUndefined();
    expect(Object.keys(st.bag)).toHaveLength(0);
    for (const id of ['d_dolphins', 'd_sealion', 'd_humpback', 'd_orca']) {
      const sp = SEA_BY_ID.get(id)!;
      expect(sp.witness).toBe(true);
      expect(sp.tags).toContain('witness');
    }
    // 상자게는 economy 몫
    expect(SEA_BY_ID.has('d_mimic_crab')).toBe(false);
  });
  it('플랑크톤은 별가루 2개, 조개류는 조개껍데기, 진주굴 20%·대왕조개(맑음) 진주', () => {
    const rnd = rngFor('drops');
    expect(catchDrops({ id: 'd_plankton' }, 'clear', rnd)).toEqual([{ id: 'm_stardust', n: 2, kind: 'stardust' }]);
    for (const id of ['sea-scallop', 'sea-oyster', 'sea-conch']) expect(catchDrops({ id }, 'rain', rnd)).toContainEqual({ id: 'm_shell', n: 1, kind: 'shell' });
    expect(catchDrops({ id: 'sea-giantclam' }, 'clear', rnd)).toContainEqual({ id: 'm_pearl', n: 1, kind: 'pearl' });
    expect(catchDrops({ id: 'sea-giantclam' }, 'rain', rnd)).toEqual([]);
    let pearls = 0;
    const r2 = rngFor('pearl-oyster');
    for (let i = 0; i < 5000; i++) if (catchDrops({ id: 'sea-pearl' }, 'clear', r2).length) pearls++;
    expect(pearls / 5000).toBeGreaterThan(0.17);
    expect(pearls / 5000).toBeLessThan(0.23);
  });
  it('GDD 별칭·세트 태그', () => {
    const st = new GameState();
    st.register(SEA_SPECIES);
    for (const [g, id] of [['d_urchin', 'sea-urchin'], ['d_starfish', 'sea-starfish'], ['d_seacucumber', 'sea-cucumber'], ['d_scallop', 'sea-scallop'], ['d_crab', 'sea-crab'],
      ['d_conch', 'sea-conch'], ['d_abalone', 'sea-abalone'], ['d_seasquirt', 'sea-squirt'], ['d_pearl_oyster', 'sea-pearl'], ['d_giant_clam', 'sea-giantclam']]) {
      expect(st.byGdd(g)?.id).toBe(id);
    }
    expect(SEA_SPECIES.filter((s) => s.tags?.includes('set:nudi'))).toHaveLength(5);
    for (const id of ['d_seahare', 'd_mantis_shrimp', 'd_baby_octopus', 'd_sea_angel', 'd_leafy_dragon', 'd_ghost_jelly', 'd_spyglass', 'd_plankton', 'd_crinoid', 'd_deep_cucumber']) expect(SEA_BY_ID.has(id)).toBe(true);
    // 모든 종: 바다 범주 · 그림자·길이 있음 · 희귀도 1~5
    for (const s of SEA_SPECIES) {
      expect(s.category).toBe('sea');
      expect(s.shadow).toBeTruthy();
      expect(s.len).toBeGreaterThan(0);
      expect(s.rarity).toBeGreaterThanOrEqual(1);
      expect(s.rarity).toBeLessThanOrEqual(5);
    }
  });
});

describe('행동', () => {
  it('flee: 빨리 다가가면 도망(그동안 못 잡음), 살금살금이면 그대로', () => {
    const rnd = rngFor('beh');
    const b = newBeh(rnd);
    stepBehaviour('flee', b, 0.1, { dist: 2, speed: 0.5, dx: 1, dz: 0 }, rnd);
    expect(catchable(b)).toBe(true);
    stepBehaviour('flee', b, 0.1, { dist: 2, speed: 3, dx: 1, dz: 0 }, rnd);
    expect(b.mode).toBe('dash');
    expect(catchable(b)).toBe(false);
    for (let i = 0; i < 10; i++) stepBehaviour('flee', b, 0.1, { dist: 4, speed: 3, dx: 1, dz: 0 }, rnd);
    expect(b.mode).toBe('idle');
    expect(Math.hypot(b.ox, b.oz)).toBeGreaterThan(FLEE.len * 0.8);
    expect(b.ox).toBeGreaterThan(0);
  });
  it('hide: 가까이 가면 쏙 숨었다가 나온다', () => {
    const rnd = rngFor('beh2');
    const b = newBeh(rnd);
    stepBehaviour('hide', b, 0.1, { dist: 1, speed: 0, dx: 1, dz: 0 }, rnd);
    expect(b.mode).toBe('hidden');
    expect(catchable(b)).toBe(false);
    for (let i = 0; i < 30; i++) stepBehaviour('hide', b, 0.1, { dist: 1, speed: 0, dx: 1, dz: 0 }, rnd);
    expect(b.mode).toBe('idle');
    // 한 번 놀란 뒤엔 잠시 안 숨는다(잡을 틈)
    stepBehaviour('hide', b, 0.1, { dist: 1, speed: 0, dx: 1, dz: 0 }, rnd);
    expect(b.mode).toBe('idle');
  });
  it('hop: 가끔 톡 뛰고(공중이면 못 잡음) 집 근처를 벗어나지 않는다', () => {
    const rnd = rngFor('beh3');
    const b = newBeh(rnd);
    let sawHop = false;
    for (let i = 0; i < 600; i++) {
      stepBehaviour('hop', b, 0.05, { dist: 5, speed: 0, dx: 1, dz: 0 }, rnd);
      if (b.mode === 'hop') { sawHop = true; expect(catchable(b)).toBe(false); }
      expect(Math.hypot(b.ox, b.oz)).toBeLessThanOrEqual(2.2 + 1e-6);
    }
    expect(sawHop).toBe(true);
  });
});

describe('flags.ocean', () => {
  it("옛 'ocean.jar.*' 를 jars 로 옮기고, 날이 바뀌면 오늘 목록을 비운다", () => {
    const flags: Record<string, unknown> = { 'ocean.jar.home-0': true, 'ocean.jar.dino-2': true, other: 1 };
    const f = readOceanFlags(flags);
    expect(Object.keys(f.jars).sort()).toEqual(['dino-2', 'home-0']);
    expect(flags['ocean.jar.home-0']).toBeUndefined();
    expect(flags.other).toBe(1);
    expect(flags.ocean).toBe(f);
    rollOceanDay(f, 4);
    f.caught.keys.push('1,2:3');
    expect(rollOceanDay(f, 4)).toBe(false);
    expect(readOceanFlags(flags).caught.keys).toEqual(['1,2:3']);
    expect(rollOceanDay(readOceanFlags(flags), 5)).toBe(true);
    expect(readOceanFlags(flags).caught).toEqual({ day: 5, keys: [] });
    // 깨진 값도 견딘다
    expect(readOceanFlags({ ocean: { jars: 'x', caught: 5 } }).caught.keys).toEqual([]);
  });
});
