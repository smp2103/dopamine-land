// 게임 시계(순수) + game.env 서비스. 30분 하루(게임 1시간 = 75초), 저장 이어 가기, 4시간 날씨 굴림, env·day·tod·weather 이벤트.
// DOM·three 없이 돈다 — atmosphere.ts 가 의존성(이벤트·저장·플레이어 자리)을 꽂아 쓰고, 테스트는 대역을 꽂는다.
//
//   const env = createEnv({ emit, flags: () => state.flags, save: () => state.save(), regionAt, playerPos })
//   game.env = env; game.onUpdate((t, dt) => env.tick(dt));
//
// 시계는 오직 여기 하나(rule-single-clock). 다른 담당은 game.env 의 값만 읽는다.
import {
  DAY_SEC, HOUR_SEC, START_HOUR, todOf, isNoon, isMidnight, weekdayOf, seasonOf, moonPhaseOf, isFullMoon, isEclipse,
  type EnvApi, type Tod, type Season, type Weather, type RegionId,
} from '../../core/api';
import type { EnvEvent, DayEvent, TodEvent, WeatherEvent } from '../../core/events';
import { REGIONS, weatherAt, forecastAt, pruneForces, nextExpiry, isWeather, type ForceMap } from './weatherRoll';

/** ?tod= 로 고정할 때의 대표 시각(hud 와 같은 값) */
export const TOD_PIN: Record<Tod, number> = { morning: 7.5, day: 12, sunset: 18.25, night: 22 };

const wrap24 = (h: number) => ((h % 24) + 24) % 24;

/** 시계에서 바로 나오는 값들 */
export interface ClockFields {
  day: number;
  hour: number;
  minute: number;
  tod: Tod;
  noon: boolean;
  midnight: boolean;
  weekday: number;
  season: Season;
  moonPhase: number;
  fullMoon: boolean;
  eclipse: boolean;
}

/** gameSec → 시계 값 */
export function fieldsOf(gameSec: number): ClockFields {
  const s = Math.max(0, gameSec);
  const day = Math.floor(s / DAY_SEC);
  const hour = (s - day * DAY_SEC) / HOUR_SEC;
  const moonPhase = moonPhaseOf(s);
  return {
    day, hour, minute: Math.floor((hour % 1) * 60),
    tod: todOf(hour), noon: isNoon(hour), midnight: isMidnight(hour),
    weekday: weekdayOf(day), season: seasonOf(day),
    moonPhase, fullMoon: isFullMoon(moonPhase), eclipse: isEclipse(moonPhase),
  };
}

/** 누적 게임 초 하나로 도는 시계. pin 이 있으면 시각만 그 자리에 붙잡는다(날짜는 그대로) */
export class GameClock {
  /** 저장 이후 누적 게임 초(새 저장이면 START_HOUR 부터) */
  sec: number;
  /** 고정 시각(?tod=) — null 이면 흐른다 */
  pinned: number | null = null;

  constructor(o: { sec?: number | null; startHour?: number | null } = {}) {
    const saved = o.sec;
    this.sec = typeof saved === 'number' && Number.isFinite(saved) && saved >= 0 ? saved : START_HOUR * HOUR_SEC;
    if (typeof o.startHour === 'number' && Number.isFinite(o.startHour)) this.setHour(o.startHour);
  }

  /** 지금 쓰는 게임 초(고정이면 그날의 고정 시각) */
  get now(): number {
    if (this.pinned === null) return this.sec;
    return Math.floor(this.sec / DAY_SEC) * DAY_SEC + this.pinned * HOUR_SEC;
  }
  get day() { return Math.floor(this.now / DAY_SEC); }
  get hour() { return (this.now - this.day * DAY_SEC) / HOUR_SEC; }

  /** 앞으로만 간다(음수·NaN 은 무시) */
  advance(dt: number) { if (dt > 0 && Number.isFinite(dt)) this.sec += dt; }
  /** 같은 날 안에서 그 시각으로(뒤로 갈 수도 있다) */
  setHour(h: number) {
    const day = Math.floor(this.sec / DAY_SEC);
    this.sec = day * DAY_SEC + wrap24(h) * HOUR_SEC;
  }
  /** 시각 고정/해제. 해제할 땐 고정했던 시각에서 다시 흐른다 */
  pin(h: number | null) {
    if (h === null) { if (this.pinned !== null) this.sec = this.now; this.pinned = null; return; }
    this.pinned = wrap24(h);
  }
  fields(): ClockFields { return fieldsOf(this.now); }
}

/** URL 해석: ?hour=17.5(시작 시각) · ?tod=morning|day|sunset|night(시간대 고정) · ?weather=rain(강제) */
export function parseEnvQuery(search: string): { startHour: number | null; pinTod: Tod | null; weather: Weather | null } {
  const q = new URLSearchParams(search);
  const hs = q.get('hour');
  const h = hs !== null && hs.trim() !== '' ? Number(hs) : NaN;
  const t = q.get('tod');
  const w = q.get('weather');
  return {
    startHour: Number.isFinite(h) ? h : null,
    pinTod: t && t in TOD_PIN ? (t as Tod) : null,
    weather: isWeather(w) ? w : null,
  };
}

/** 이 서비스가 쏘는 이벤트 */
export type EnvEmit = EnvEvent | DayEvent | TodEvent | WeatherEvent;

/** flags.env 저장 모양 */
export interface EnvFlags { sec: number }

/** env 서비스가 바깥에서 받는 것 */
export interface EnvDeps {
  /** state.emit */
  emit?(e: EnvEmit): void;
  /** game.state.flags(불러오기로 객체가 바뀔 수 있어 함수로 받는다) */
  flags?(): Record<string, unknown>;
  /** state.save()(묶음 저장) */
  save?(): void;
  /** (x,z) 가 어느 날씨 지역인가 */
  regionAt?(x: number, z: number): RegionId;
  /** 플레이어 자리(없으면 'home' 기준) */
  playerPos?(): { x: number; z: number } | null;
  /** 지금 세계 — 'space' 면 플레이어 날씨는 맑음 */
  world?(): 'earth' | 'space';
  /** 시작 시각(?hour=) — 저장된 날은 그대로 두고 시각만 */
  startHour?: number | null;
  /** 시간대 고정(?tod=) */
  pinTod?: Tod | null;
  /** 모든 지역 강제 날씨(?weather=) */
  weather?: Weather | null;
}

/** game.env 에 들어가는 실물 — EnvApi + 프레임 구동·저장 도구 */
export interface EnvService extends EnvApi {
  /** 지금 플레이어가 있는 날씨 지역 */
  region: RegionId;
  readonly clock: GameClock;
  readonly forces: ForceMap;
  /** 프레임마다(game.onUpdate dt). 고정 시각이면 시계는 멈추고 자리·날씨만 다시 본다 */
  tick(dt: number): void;
  /** flags.env.sec 쓰기(+ save) */
  persist(): void;
  /** 시간대 고정/해제(?tod=) */
  pin(tod: Tod | null): void;
  /** 디버그 요약 */
  snapshot(): Record<string, unknown>;
}

/** 한 번에 이만큼 넘게 감으면 시간마다 쪼개지 않고 건너뛴다(하루 이벤트는 그래도 한 번) */
const MAX_STEP_HOURS = 24 * 60;

export function createEnv(deps: EnvDeps = {}): EnvService {
  const emit = (e: EnvEmit) => { try { deps.emit?.(e); } catch (err) { console.error('[env] emit', err); } };
  const flagsEnv = (): Partial<EnvFlags> | null => {
    const f = deps.flags?.();
    const v = f?.env;
    return v && typeof v === 'object' ? (v as Partial<EnvFlags>) : null;
  };
  const clock = new GameClock({ sec: flagsEnv()?.sec ?? null, startHour: deps.startHour ?? null });
  if (deps.pinTod) clock.pin(TOD_PIN[deps.pinTod]);
  const forces: ForceMap = new Map();
  if (deps.weather) forces.set('*', { w: deps.weather, until: null });

  const regionNow = (): RegionId => {
    if (deps.world?.() === 'space') return 'space';
    const p = deps.playerPos?.();
    if (!p || !deps.regionAt) return 'home';
    return deps.regionAt(p.x, p.z);
  };

  // 지역 날씨 캐시: 게임 1시간 칸 + 강제 변경 횟수가 같으면 그대로
  let cacheHour = -1, cacheRev = -1, forceRev = 0;
  const cache = new Map<RegionId, Weather>();
  const weatherOf = (region: RegionId): Weather => {
    const now = clock.now;
    const h = Math.floor(now / HOUR_SEC);
    if (h !== cacheHour || forceRev !== cacheRev) { cache.clear(); cacheHour = h; cacheRev = forceRev; }
    let w = cache.get(region);
    if (w === undefined) { w = weatherAt(region, now, forces); cache.set(region, w); }
    return w;
  };

  const env = {
    day: 0, hour: 0, minute: 0, tod: 'day' as Tod, noon: false, midnight: false,
    weekday: 0, season: 'spring' as Season, moonPhase: 0, fullMoon: false, eclipse: false,
    weather: 'clear' as Weather, waveMul: 1, gameSec: 0, region: 'home' as RegionId,
    clock, forces,
    weatherOf,
    regionWeather(x: number, z: number): Weather {
      if (deps.world?.() === 'space') return 'clear';
      return weatherOf(deps.regionAt ? deps.regionAt(x, z) : 'home');
    },
    forecast(region: RegionId, hoursAhead: number): Weather {
      return forecastAt(region, clock.now, hoursAhead, forces);
    },
    forceWeather(region: RegionId | '*', w: Weather | null, hours?: number) {
      if (w === null) {
        if (region === '*') forces.clear(); else forces.delete(region);
      } else {
        // 기한은 보이는 시각(now) 기준. ?tod= 로 시각을 붙잡으면 시계가 안 가니 기한 있는 강제도 그대로 멈춘다(디버그 전용)
        const until = typeof hours === 'number' && Number.isFinite(hours) && hours > 0 ? clock.now + hours * HOUR_SEC : null;
        forces.set(region, { w, until });
      }
      forceRev++;
      refresh();
    },
    advance(sec: number) {
      if (!(sec > 0) || !Number.isFinite(sec)) return;
      // 시간 칸마다 쪼개 간다 → 자정을 지나면 'day' 가 꼭 한 번, 시간대·날씨 이벤트도 순서대로
      const end = clock.sec + sec;
      if (sec > MAX_STEP_HOURS * HOUR_SEC) clock.sec = end - MAX_STEP_HOURS * HOUR_SEC;
      let guard = MAX_STEP_HOURS + 2;
      while (clock.sec < end && guard-- > 0) {
        const nextHour = (Math.floor(clock.sec / HOUR_SEC) + 1) * HOUR_SEC;
        const expiry = nextExpiry(forces);
        let to = Math.min(end, nextHour);
        if (expiry > clock.sec && expiry < to) to = expiry;
        clock.sec = to;
        refresh();
      }
      clock.sec = Math.max(clock.sec, end);
      refresh();
    },
    setHour(h: number) {
      if (!Number.isFinite(h)) return;
      const pinned = clock.pinned !== null;
      if (pinned) clock.pin(null);
      clock.setHour(h);
      refresh();
      persist();
    },
    tick(dt: number) {
      // 첫 프레임: 늦게 붙은 모듈(order 50 넘는 쪽)도 지금 상태를 한 번 받게
      if (!greeted) { greeted = true; emit({ type: 'env', tod: env.tod, weather: env.weather, hour: env.hour, day: env.day }); }
      if (clock.pinned === null) {
        // 한 프레임은 짧다 — 시간 칸을 넘을 때만 advance 의 쪼개기 경로로
        if (dt > 0 && Number.isFinite(dt)) {
          const before = Math.floor(clock.sec / HOUR_SEC);
          if (Math.floor((clock.sec + dt) / HOUR_SEC) !== before || nextExpiry(forces) <= clock.sec + dt) { env.advance(dt); return; }
          clock.advance(dt);
        }
      }
      refresh();
    },
    persist,
    pin(tod: Tod | null) {
      clock.pin(tod ? TOD_PIN[tod] : null);
      refresh();
    },
    snapshot() {
      const regions: Record<string, Weather> = {};
      for (const r of REGIONS) regions[r] = weatherOf(r);
      const next: Record<string, Weather> = {};
      for (const r of REGIONS) next[r] = env.forecast(r, 4);
      return {
        day: env.day, hour: +env.hour.toFixed(3), tod: env.tod, weekday: env.weekday, season: env.season,
        moonPhase: +env.moonPhase.toFixed(3), fullMoon: env.fullMoon, eclipse: env.eclipse,
        region: env.region, weather: env.weather, waveMul: env.waveMul, gameSec: env.gameSec,
        pinned: clock.pinned, forces: [...forces].map(([k, f]) => ({ region: k, ...f })), regions, next,
      };
    },
  };

  // 지난 값(이벤트 비교용) — 처음 refresh 는 조용히 채우기만
  let primed = false, greeted = false;
  let lastDay = 0, lastHourIdx = 0, lastTod: Tod = 'day', lastPlayerW: Weather = 'clear';
  const lastRegionW = new Map<RegionId, Weather>();

  function writeFields() {
    const f = clock.fields();
    env.day = f.day; env.hour = f.hour; env.minute = f.minute; env.tod = f.tod;
    env.noon = f.noon; env.midnight = f.midnight; env.weekday = f.weekday; env.season = f.season;
    env.moonPhase = f.moonPhase; env.fullMoon = f.fullMoon; env.eclipse = f.eclipse;
    env.gameSec = clock.now;
  }

  function refresh() {
    if (pruneForces(forces, clock.now)) forceRev++;
    writeFields();
    const region = regionNow();
    env.region = region;
    const w = weatherOf(region);
    env.weather = w;
    env.waveMul = w === 'storm' ? 2 : 1;
    const hourIdx = Math.floor(clock.now / HOUR_SEC);
    if (!primed) {
      primed = true;
      lastDay = env.day; lastHourIdx = hourIdx; lastTod = env.tod; lastPlayerW = w;
      for (const r of REGIONS) lastRegionW.set(r, weatherOf(r));
      return;
    }
    let sendEnv = false;
    if (env.day !== lastDay) { const prev = lastDay; lastDay = env.day; emit({ type: 'day', day: env.day, prev }); }
    if (env.tod !== lastTod) { const prev = lastTod; lastTod = env.tod; emit({ type: 'tod', tod: env.tod, prev }); }
    if (hourIdx !== lastHourIdx) {
      lastHourIdx = hourIdx;
      sendEnv = true;
      persist();
    }
    // 지역 날씨: 시간 칸·강제가 바뀌었을 때만 바뀔 수 있다 — 캐시라 싸다
    for (const r of REGIONS) {
      const rw = weatherOf(r);
      const prev = lastRegionW.get(r);
      if (prev !== undefined && prev !== rw) emit({ type: 'weather', region: r, weather: rw, prev });
      lastRegionW.set(r, rw);
    }
    if (w !== lastPlayerW) {
      const prev = lastPlayerW;
      lastPlayerW = w;
      // 플레이어 지역이 표에 없는 곳(space 등)이면 여기서 따로 알린다
      if (!REGIONS.includes(region)) emit({ type: 'weather', region, weather: w, prev });
      sendEnv = true;
    }
    if (sendEnv) emit({ type: 'env', tod: env.tod, weather: env.weather, hour: env.hour, day: env.day });
  }

  function persist() {
    const f = deps.flags?.();
    if (!f) return;
    const cur = f.env;
    if (cur && typeof cur === 'object') (cur as EnvFlags).sec = clock.sec;
    else f.env = { sec: clock.sec } satisfies EnvFlags;
    deps.save?.();
  }

  refresh();
  return env as EnvService;
}
