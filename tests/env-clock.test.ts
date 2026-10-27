// env 시계·날씨(atmosphere/clock.ts · weatherRoll.ts) — 30분 하루·시간대 경계·달력·저장 이어 가기·4시간 날씨 굴림·예보·강제 기한·이벤트.
import { describe, it, expect, beforeEach } from 'vitest';
import { DAY_SEC, HOUR_SEC, START_HOUR, MOON_DAYS, type Weather } from '../src/core/api';
import { GameClock, createEnv, fieldsOf, parseEnvQuery, TOD_PIN, type EnvDeps } from '../src/modules/atmosphere/clock';
import {
  rollWeather, rollBlock, weatherAt, forecastAt, isNightBlock, blockOf, pickFrom, convertFor,
  WEATHER_TABLES, REGIONS, BLOCK_HOURS, type ForceMap,
} from '../src/modules/atmosphere/weatherRoll';
import { stubLocalStorage } from './kit/storage';
import { makeFakeGame, recordEvents } from './kit/fakeGame';

const H = HOUR_SEC;

/** 대역 의존성: 이벤트 모으기 + flags 객체 + 플레이어 지역 고정 */
function deps(o: Partial<EnvDeps> & { region?: string } = {}) {
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  const flags: Record<string, unknown> = {};
  let saves = 0;
  const d: EnvDeps = {
    emit: (e) => { events.push(e as never); },
    flags: () => flags,
    save: () => { saves++; },
    regionAt: () => o.region ?? 'home',
    playerPos: () => ({ x: 0, z: 0 }),
    ...o,
  };
  return { d, events, flags, saves: () => saves, of: (t: string) => events.filter((e) => e.type === t) };
}

/** 그 지역에서 조건에 맞는 블록을 찾는다(결정적이라 늘 같은 블록) */
function findBlock(region: string, pred: (w: Weather, b: number) => boolean, from = 1, max = 20000) {
  for (let b = from; b < from + max; b++) if (pred(rollBlock(region, b), b)) return b;
  throw new Error(`no block for ${region}`);
}

describe('GameClock — 30분 하루', () => {
  it('새 저장은 09:00 에서 시작하고 1800초 = 하루', () => {
    const c = new GameClock();
    expect(c.sec).toBe(START_HOUR * H);
    expect(c.day).toBe(0);
    expect(c.hour).toBeCloseTo(9);
    c.advance(DAY_SEC);
    expect(c.day).toBe(1);
    expect(c.hour).toBeCloseTo(9);
    expect(DAY_SEC).toBe(1800);
    expect(H * 24).toBe(DAY_SEC);
  });

  it('저장된 sec 에서 이어 가고 ?hour= 는 그날의 시각만 바꾼다', () => {
    const c = new GameClock({ sec: 3 * DAY_SEC + 14 * H });
    expect(c.day).toBe(3);
    expect(c.hour).toBeCloseTo(14);
    const c2 = new GameClock({ sec: 3 * DAY_SEC + 14 * H, startHour: 20.5 });
    expect(c2.day).toBe(3);
    expect(c2.hour).toBeCloseTo(20.5);
    // 이상한 저장값은 새 저장처럼
    expect(new GameClock({ sec: -5 }).hour).toBeCloseTo(START_HOUR);
    expect(new GameClock({ sec: NaN }).hour).toBeCloseTo(START_HOUR);
  });

  it('음수·NaN advance 는 무시', () => {
    const c = new GameClock();
    c.advance(-100); c.advance(NaN);
    expect(c.sec).toBe(START_HOUR * H);
  });

  it('pin 은 시각만 붙잡고, 풀면 그 시각에서 다시 흐른다', () => {
    const c = new GameClock({ sec: 2 * DAY_SEC + 10 * H });
    c.pin(TOD_PIN.night);
    expect(c.hour).toBeCloseTo(22);
    expect(c.day).toBe(2);
    c.pin(null);
    expect(c.hour).toBeCloseTo(22);
    c.advance(H);
    expect(c.hour).toBeCloseTo(23);
  });
});

describe('시간대 경계 · 정오 · 자정', () => {
  const at = (h: number) => fieldsOf(h * H);
  it('아침 05~09 · 낮 09~17 · 저녁 17~21 · 밤 21~05', () => {
    expect(at(4.99).tod).toBe('night');
    expect(at(5).tod).toBe('morning');
    expect(at(8.99).tod).toBe('morning');
    expect(at(9).tod).toBe('day');
    expect(at(16.99).tod).toBe('day');
    expect(at(17).tod).toBe('sunset');
    expect(at(20.99).tod).toBe('sunset');
    expect(at(21).tod).toBe('night');
    expect(at(0).tod).toBe('night');
  });
  it('정오 11~13, 자정 00~02', () => {
    expect(at(10.99).noon).toBe(false);
    expect(at(11).noon).toBe(true);
    expect(at(12.99).noon).toBe(true);
    expect(at(13).noon).toBe(false);
    expect(at(0).midnight).toBe(true);
    expect(at(1.99).midnight).toBe(true);
    expect(at(2).midnight).toBe(false);
    expect(at(23.99).midnight).toBe(false);
  });
  it('분은 시각의 소수부', () => {
    expect(at(9.5).minute).toBe(30);
    expect(fieldsOf(9 * H + 1.25 * 15).minute).toBe(15);
  });
});

describe('달력 — 요일·계절·달', () => {
  it('요일 = day%7, 계절은 7일마다', () => {
    expect(fieldsOf(0).weekday).toBe(0);
    expect(fieldsOf(6 * DAY_SEC).weekday).toBe(6);
    expect(fieldsOf(7 * DAY_SEC).weekday).toBe(0);
    expect(fieldsOf(0).season).toBe('spring');
    expect(fieldsOf(7 * DAY_SEC).season).toBe('summer');
    expect(fieldsOf(14 * DAY_SEC).season).toBe('autumn');
    expect(fieldsOf(21 * DAY_SEC).season).toBe('winter');
    expect(fieldsOf(28 * DAY_SEC).season).toBe('spring');
  });
  it('달은 8일 주기 — 4일째 한가운데가 보름, 0일 근처가 삭(월식 창)', () => {
    expect(MOON_DAYS).toBe(8);
    expect(fieldsOf(0).eclipse).toBe(true);
    expect(fieldsOf(4 * DAY_SEC).moonPhase).toBeCloseTo(0.5);
    expect(fieldsOf(4 * DAY_SEC).fullMoon).toBe(true);
    expect(fieldsOf(2 * DAY_SEC).fullMoon).toBe(false);
    expect(fieldsOf(2 * DAY_SEC).eclipse).toBe(false);
    expect(fieldsOf(8 * DAY_SEC).moonPhase).toBeCloseTo(0);
    expect(fieldsOf(8 * DAY_SEC - 1).eclipse).toBe(true);
  });
});

describe('URL', () => {
  it('?hour= · ?tod= · ?weather=', () => {
    expect(parseEnvQuery('?hour=17.5')).toEqual({ startHour: 17.5, pinTod: null, weather: null });
    expect(parseEnvQuery('?tod=sunset&weather=storm')).toEqual({ startHour: null, pinTod: 'sunset', weather: 'storm' });
    expect(parseEnvQuery('?tod=auto&weather=nope&hour=')).toEqual({ startHour: null, pinTod: null, weather: null });
  });
  it('?tod= 고정이면 tick 해도 시각이 그대로', () => {
    const { d } = deps({ pinTod: 'sunset' });
    const env = createEnv(d);
    expect(env.tod).toBe('sunset');
    expect(env.hour).toBeCloseTo(TOD_PIN.sunset);
    for (let i = 0; i < 600; i++) env.tick(1);
    expect(env.hour).toBeCloseTo(TOD_PIN.sunset);
    // setHour 는 고정을 풀고 그 시각에서 흐른다
    env.setHour(6);
    env.tick(H);
    expect(env.hour).toBeCloseTo(7);
  });
});

describe('날씨 굴림 — 결정성·표·변환', () => {
  it('같은 지역·같은 블록이면 늘 같다', () => {
    for (const r of REGIONS) for (let b = 0; b < 60; b++) {
      const day = Math.floor((b * BLOCK_HOURS) / 24);
      expect(rollWeather(r, day, b)).toBe(rollWeather(r, day, b));
    }
  });
  it('블록 = floor((day*24+hour)/4)', () => {
    expect(blockOf(0, 0)).toBe(0);
    expect(blockOf(0, 3.99)).toBe(0);
    expect(blockOf(0, 4)).toBe(1);
    expect(blockOf(1, 0)).toBe(6);
    expect(isNightBlock(0)).toBe(true);
    expect(isNightBlock(1)).toBe(false);
    expect(isNightBlock(2)).toBe(false);
    expect(isNightBlock(4)).toBe(false);
    expect(isNightBlock(5)).toBe(true);
  });
  it('표 고르기: 경계값이 표 순서대로', () => {
    const t = WEATHER_TABLES.default;
    expect(pickFrom(t, 0)).toBe('clear');
    expect(pickFrom(t, 0.549)).toBe('clear');
    expect(pickFrom(t, 0.55)).toBe('rain');
    expect(pickFrom(t, 0.77)).toBe('storm');
    expect(pickFrom(t, 0.83)).toBe('fog');
    expect(pickFrom(t, 0.92)).toBe('meteor');
    expect(pickFrom(t, 0.9999)).toBe('meteor');
    for (const tb of Object.values(WEATHER_TABLES)) expect(Object.values(tb).reduce((a, b) => a + b, 0)).toBe(100);
    expect(WEATHER_TABLES.launch.meteor).toBe(22);
  });
  it('솜눈섬은 비·폭풍이 없고 눈·눈보라, 모래시계섬은 모래폭풍', () => {
    const seen: Record<string, Set<Weather>> = { ice: new Set(), desert: new Set() };
    for (let b = 0; b < 3000; b++) for (const r of ['ice', 'desert'] as const) seen[r].add(rollBlock(r, b));
    expect(seen.ice.has('rain')).toBe(false);
    expect(seen.ice.has('storm')).toBe(false);
    expect(seen.ice.has('snow')).toBe(true);
    expect(seen.ice.has('blizzard')).toBe(true);
    expect(seen.ice.has('aurora')).toBe(true);
    expect(seen.desert.has('rain')).toBe(false);
    expect(seen.desert.has('storm')).toBe(false);
    expect(seen.desert.has('sandstorm')).toBe(true);
    expect(convertFor('ice', 'rain')).toBe('snow');
    expect(convertFor('desert', 'storm')).toBe('sandstorm');
    expect(convertFor('home', 'rain')).toBe('rain');
  });
  it('유성우·오로라는 밤 블록에서만, 순간 날씨로도 밤(21~05)에만', () => {
    let meteors = 0;
    for (const r of REGIONS) for (let b = 0; b < 2000; b++) {
      const w = rollBlock(r, b);
      if (w === 'meteor' || w === 'aurora') { meteors++; expect(isNightBlock(b)).toBe(true); }
    }
    expect(meteors).toBeGreaterThan(0);
    for (const r of ['launch', 'ice', 'home']) for (let h = 0; h < 24 * 40; h++) {
      const w = weatherAt(r, h * H + 1);
      if (w === 'meteor' || w === 'aurora') expect(fieldsOf(h * H + 1).tod).toBe('night');
    }
  });
  it('별똥별섬 유성우가 기본 표보다 잦다(22 vs 8)', () => {
    const count = (r: string) => { let n = 0, nb = 0; for (let b = 0; b < 6000; b++) if (isNightBlock(b)) { nb++; if (rollBlock(r, b) === 'meteor') n++; } return n / nb; };
    const launch = count('launch'), home = count('home');
    expect(launch).toBeGreaterThan(0.16);
    expect(launch).toBeLessThan(0.28);
    expect(home).toBeGreaterThan(0.04);
    expect(home).toBeLessThan(0.12);
  });
  it('비 그친 블록의 처음 2시간은 무지개(낮)', () => {
    const b = findBlock('home', (w, b) => w === 'clear' && !isNightBlock(b) && (rollBlock('home', b - 1) === 'rain' || rollBlock('home', b - 1) === 'storm'));
    const start = b * BLOCK_HOURS * H;
    expect(weatherAt('home', start + 1)).toBe('rainbow');
    expect(weatherAt('home', start + 1.9 * H)).toBe('rainbow');
    expect(weatherAt('home', start + 2 * H)).toBe('clear');
    expect(weatherAt('home', start - 1)).toMatch(/rain|storm/);
  });
  it('새 저장 첫날 아침(0~2 블록)은 늘 맑음 — 첫인상은 맑게', () => {
    for (const r of REGIONS) for (let b = 0; b <= 2; b++) expect(rollBlock(r, b)).toBe('clear');
    expect(new Set(Array.from({ length: 200 }, (_, i) => rollBlock('home', i + 3))).size).toBeGreaterThan(3);
  });
  it('우주는 늘 맑음', () => {
    for (let b = 0; b < 100; b++) expect(rollBlock('space', b)).toBe('clear');
  });
});

describe('예보 = 나중의 실제 날씨', () => {
  it('forecast(region, h) 는 h 시간 뒤 env.weatherOf 와 같다', () => {
    for (const region of ['home', 'ice', 'desert', 'launch', 'mushroom']) {
      const { d } = deps({ region });
      const env = createEnv(d);
      const ahead = [1, 3, 4, 7, 12, 23];
      const want = ahead.map((h) => env.forecast(region, h));
      let done = 0;
      for (let i = 0; i < ahead.length; i++) {
        env.advance((ahead[i] - done) * H);
        done = ahead[i];
        expect(env.weatherOf(region)).toBe(want[i]);
        expect(env.weather).toBe(want[i]);
      }
    }
  });
  it('forecastAt 는 기한 있는 강제도 계산에 넣는다', () => {
    const f: ForceMap = new Map([['home', { w: 'storm', until: 10 * H }]]);
    expect(forecastAt('home', 0, 5, f)).toBe('storm');
    expect(forecastAt('home', 0, 12, f)).toBe(weatherAt('home', 12 * H));
  });
});

describe('강제 날씨', () => {
  it('기한이 지나면 풀리고 weather 이벤트가 난다', () => {
    const { d, of } = deps();
    const env = createEnv(d);
    // 새 저장 첫 블록은 맑음이라 강제 전후가 늘 다르다
    expect(env.weather).toBe('clear');
    const natural = env.forecast('home', 2.5);
    env.forceWeather('home', 'storm', 2);
    expect(env.weather).toBe('storm');
    expect(env.waveMul).toBe(2);
    env.advance(1.5 * H);
    expect(env.weather).toBe('storm');
    env.advance(1 * H);
    expect(env.weather).toBe(natural);
    expect(env.forces.size).toBe(0);
    const ws = of('weather').filter((e) => e.region === 'home');
    expect(ws[0]).toMatchObject({ weather: 'storm' });
    expect(ws.at(-1)).toMatchObject({ weather: natural, prev: 'storm' });
  });
  it("'*' 는 모든 지역(지역 변환 적용), null 이면 해제", () => {
    const { d } = deps({ region: 'ice' });
    const env = createEnv(d);
    env.forceWeather('*', 'rain');
    expect(env.weather).toBe('snow');
    expect(env.weatherOf('desert')).toBe('sandstorm');
    expect(env.weatherOf('home')).toBe('rain');
    env.forceWeather('home', 'fog');
    expect(env.weatherOf('home')).toBe('fog');
    env.forceWeather('*', null);
    expect(env.forces.size).toBe(0);
  });
  it('?weather= 는 계속 걸려 있다', () => {
    const { d } = deps({ weather: 'fog' });
    const env = createEnv(d);
    env.advance(3 * DAY_SEC);
    expect(env.weather).toBe('fog');
  });
});

describe('이벤트', () => {
  it("advance 로 자정을 지나면 'day' 가 딱 한 번", () => {
    const { d, of } = deps();
    const env = createEnv(d);
    env.advance(14.5 * H); // 09:00 → 23:30
    expect(of('day')).toHaveLength(0);
    env.advance(1 * H); // → 00:30
    expect(of('day')).toEqual([{ type: 'day', day: 1, prev: 0 }]);
    expect(env.midnight).toBe(true);
    env.advance(2 * H);
    expect(of('day')).toHaveLength(1);
  });
  it('하루를 한 번에 감아도 day 는 한 번, tod 는 순서대로, env 는 시간마다', () => {
    const { d, of } = deps();
    const env = createEnv(d);
    env.advance(DAY_SEC);
    expect(of('day')).toHaveLength(1);
    expect(of('tod').map((e) => e.tod)).toEqual(['sunset', 'night', 'morning', 'day']);
    expect(of('tod')[0]).toMatchObject({ prev: 'day' });
    expect(of('env').length).toBeGreaterThanOrEqual(24);
  });
  it('tick 으로도 같은 경로 — 프레임마다 조금씩', () => {
    const { d, of } = deps();
    const env = createEnv(d);
    for (let i = 0; i < 8 * 60 * 75 + 2; i++) env.tick(1 / 60); // 8 게임시간(+ 부동소수 여유 2프레임)
    expect(env.hour).toBeCloseTo(17, 3);
    expect(of('tod').map((e) => e.tod)).toEqual(['sunset']);
    // 첫 프레임 인사 1 + 시간마다 8
    expect(of('env').length).toBeGreaterThanOrEqual(9);
  });
  it('폭풍이면 waveMul 2, 아니면 1', () => {
    const { d } = deps();
    const env = createEnv(d);
    env.forceWeather('*', 'storm');
    expect(env.waveMul).toBe(2);
    env.forceWeather('*', 'rain');
    expect(env.waveMul).toBe(1);
    env.forceWeather('*', null);
    const b = findBlock('home', (w) => w === 'storm');
    env.advance(b * BLOCK_HOURS * H - env.gameSec + 0.5 * H);
    expect(env.weather).toBe('storm');
    expect(env.waveMul).toBe(2);
  });
  it('플레이어가 다른 지역으로 가면 env 이벤트(날씨가 다를 때)', () => {
    let region = 'home';
    const { d, of } = deps({ regionAt: () => region });
    const env = createEnv(d);
    env.forceWeather('ice', 'blizzard');
    env.tick(0); // 첫 프레임 인사(env 한 번)
    const n = of('env').length;
    region = 'ice';
    env.tick(0);
    expect(env.weather).toBe('blizzard');
    expect(of('env').length).toBe(n + 1);
  });
  it('우주에선 맑음', () => {
    const { d } = deps({ world: () => 'space', weather: 'storm' });
    const env = createEnv(d);
    expect(env.weather).toBe('clear');
    expect(env.waveMul).toBe(1);
  });
});

describe('저장 이어 가기(flags.env.sec)', () => {
  beforeEach(() => { stubLocalStorage(); });

  it('게임 1시간마다 flags.env.sec 를 쓰고 save 한다', () => {
    const { d, flags, saves } = deps();
    const env = createEnv(d);
    env.advance(0.5 * H);
    expect(flags.env).toBeUndefined();
    env.advance(0.6 * H);
    // 시간 칸을 넘는 그 순간(10:00)에 쓴다
    expect((flags.env as { sec: number }).sec).toBeCloseTo(10 * H);
    expect(saves()).toBeGreaterThan(0);
  });

  it('진짜 GameState 로 저장 → 불러오기 → 같은 시각에서 이어 간다', () => {
    const g1 = makeFakeGame({ env: false });
    const rec = recordEvents(g1);
    const e1 = createEnv({ emit: (e) => g1.state.emit(e), flags: () => g1.state.flags, save: () => g1.state.save() });
    e1.advance(2 * DAY_SEC + 5 * H); // 2일째 14:00
    e1.persist();
    g1.state.saveNow();
    expect(rec.of('day')).toHaveLength(2);
    const sec = e1.clock.sec;
    g1.dispose();

    const g2 = makeFakeGame({ env: false });
    const e2 = createEnv({ flags: () => g2.state.flags });
    expect(e2.clock.sec).toBeCloseTo(sec);
    expect(e2.day).toBe(2);
    expect(e2.hour).toBeCloseTo(14);
    expect(e2.weather).toBe(e1.weather);
    g2.dispose();
  });
});
