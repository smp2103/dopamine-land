// 날씨 굴림(순수) — GDD 3.13 표. 게임 4시간 블록마다 지역별로 한 번 굴리고, 같은 블록이면 언제 다시 물어도 같은 답.
// DOM·three 없이 돈다(tests/env-clock.test.ts). 시계·이벤트는 clock.ts, 화면 효과는 atmosphere.ts.
//
//   rollWeather('ice', day, block)      → 그 블록의 '바탕' 날씨(지역 변환·밤 블록 규칙까지)
//   weatherAt('home', gameSec, forces)  → 그 순간 날씨(무지개 2시간·밤 전용 날씨·강제 덮어쓰기까지)
//   forecastAt(region, gameSec, h, f)   → h 게임시간 뒤 날씨(나중 실제 굴림과 같다)
import { HOUR_SEC, WEATHERS, todOf, type Weather, type RegionId } from '../../core/api';
import { rngFor } from '../../core/rng';

/** 날씨를 굴리는 블록 길이(게임 시간) */
export const BLOCK_HOURS = 4;
/** 비 그친 뒤 무지개가 뜨는 시간(게임 시간) */
export const RAINBOW_HOURS = 2;
/** 솜눈섬 밤 맑음 중 오로라 비율 */
export const AURORA_CHANCE = 0.4;

/** 표의 다섯 칸(유성우는 밤 블록만) */
export type BaseWeather = 'clear' | 'rain' | 'storm' | 'fog' | 'meteor';
export type WeatherTable = Record<BaseWeather, number>;
export type TableId = 'default' | 'ice' | 'mushroom' | 'desert' | 'launch';

/** GDD 3.13 날씨 확률(합 100) */
export const WEATHER_TABLES: Record<TableId, WeatherTable> = {
  default: { clear: 55, rain: 22, storm: 6, fog: 9, meteor: 8 },
  ice: { clear: 45, rain: 25, storm: 8, fog: 12, meteor: 10 },
  mushroom: { clear: 40, rain: 25, storm: 5, fog: 22, meteor: 8 },
  desert: { clear: 70, rain: 8, storm: 6, fog: 4, meteor: 12 },
  launch: { clear: 50, rain: 15, storm: 5, fog: 8, meteor: 22 },
};
const ORDER: BaseWeather[] = ['clear', 'rain', 'storm', 'fog', 'meteor'];

/** 지역 이름표 — 섬 id 가 아니면(바다·쪼꼬미섬) 기본 표, 'space' 는 늘 맑음 */
export const REGIONS: readonly RegionId[] = ['home', 'dino', 'ice', 'mushroom', 'coral', 'desert', 'launch', 'sea'];

export function tableOf(region: RegionId): TableId {
  if (region === 'ice' || region === 'mushroom' || region === 'desert' || region === 'launch') return region;
  return 'default';
}

/** 지역에 맞게 바꾼다: 솜눈섬 비 → 눈·폭풍 → 눈보라, 모래시계섬 비·폭풍 → 모래폭풍 */
export function convertFor(region: RegionId, w: Weather): Weather {
  const t = tableOf(region);
  if (t === 'ice') return w === 'rain' ? 'snow' : w === 'storm' ? 'blizzard' : w;
  if (t === 'desert') return w === 'rain' || w === 'storm' ? 'sandstorm' : w;
  return w;
}

/** 절대 블록 번호(day*24+hour 를 4시간으로 나눈 몫) */
export const blockOf = (day: number, hour: number) => Math.floor((day * 24 + hour) / BLOCK_HOURS);
/** 밤 블록: 블록 한가운데가 밤인 곳(00~04, 20~24) — 유성우·오로라는 여기서만 굴린다 */
export function isNightBlock(block: number): boolean {
  const mid = (((block * BLOCK_HOURS) % 24) + 24) % 24 + BLOCK_HOURS / 2;
  return todOf(mid) === 'night';
}

/** 표에서 하나 고르기(u: 0..1) */
export function pickFrom(table: WeatherTable, u: number): BaseWeather {
  let sum = 0;
  for (const k of ORDER) sum += table[k];
  let x = u * sum;
  for (const k of ORDER) {
    x -= table[k];
    if (x < 0) return k;
  }
  return 'clear';
}

/** 새 저장 첫날 이 블록까지(00~12시)는 맑음 — 시작(09시)부터 폭풍이면 첫인상이 슬프다 */
export const FIRST_CLEAR_BLOCK = 2;

/** 블록마다 같은 결과가 나오게 작은 캐시(같은 프레임에 여러 번 묻는다) */
const cache = new Map<string, Weather>();
const CACHE_MAX = 512;

/**
 * 그 블록의 바탕 날씨. rng 키 `weather:${day}:${block}:${region}`.
 * 낮 블록 유성우 → 맑음, 지역 변환, 솜눈섬 밤 맑음의 40% → 오로라. 첫날 0~2 블록은 맑음.
 */
export function rollWeather(region: RegionId, day: number, block: number): Weather {
  if (region === 'space' || block <= FIRST_CLEAR_BLOCK) return 'clear';
  const key = `weather:${day}:${block}:${region}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rnd = rngFor(key);
  let w: Weather = pickFrom(WEATHER_TABLES[tableOf(region)], rnd());
  const night = isNightBlock(block);
  if (w === 'meteor' && !night) w = 'clear';
  w = convertFor(region, w);
  // 두 번째 뽑기는 늘 해 둔다(오로라 여부가 첫 뽑기 결과와 따로 놀지 않게)
  const u2 = rnd();
  if (w === 'clear' && night && tableOf(region) === 'ice' && u2 < AURORA_CHANCE) w = 'aurora';
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, w);
  return w;
}

/** 절대 블록 → 그 블록의 바탕 날씨 */
export function rollBlock(region: RegionId, block: number): Weather {
  return rollWeather(region, Math.floor((block * BLOCK_HOURS) / 24), block);
}

/** 강제 날씨 하나 — until 은 gameSec(그때 풀림), null = 계속 */
export interface ForcedWeather { w: Weather; until: number | null }
export type ForceMap = Map<RegionId | '*', ForcedWeather>;

/** at 시각에 살아 있는 강제 날씨(지역 것이 '*' 보다 먼저) */
export function forcedAt(region: RegionId, gameSec: number, forces?: ForceMap | null): Weather | null {
  if (!forces || forces.size === 0) return null;
  const alive = (f?: ForcedWeather) => !!f && (f.until === null || gameSec < f.until);
  const own = forces.get(region);
  if (alive(own)) return convertFor(region, own!.w);
  const all = forces.get('*');
  if (alive(all)) return region === 'space' ? 'clear' : convertFor(region, all!.w);
  return null;
}

/**
 * 그 순간 날씨(gameSec 기준).
 * - 강제 날씨가 있으면 그것(지역 변환만).
 * - 유성우·오로라는 밤 시간대(21~05)에만 — 밤 블록의 20~21시는 맑음.
 * - 앞 블록이 비·폭풍이고 이번 블록이 맑음이면 처음 2시간은 무지개(밤 빼고).
 */
export function weatherAt(region: RegionId, gameSec: number, forces?: ForceMap | null): Weather {
  // 강제 날씨는 밤 규칙을 건너뛴다(?weather=meteor&hour=12 처럼 디버그로 낮에 보고 싶을 때)
  const f = forcedAt(region, gameSec, forces);
  if (f) return f;
  if (region === 'space') return 'clear';
  const hourAbs = Math.floor(Math.max(0, gameSec) / HOUR_SEC);
  const hour = hourAbs % 24;
  const block = Math.floor(hourAbs / BLOCK_HOURS);
  const w = rollBlock(region, block);
  const night = todOf(hour) === 'night';
  if (w === 'meteor' || w === 'aurora') return night ? w : 'clear';
  if (w === 'clear' && !night && hourAbs - block * BLOCK_HOURS < RAINBOW_HOURS && block > 0) {
    const prev = rollBlock(region, block - 1);
    if (prev === 'rain' || prev === 'storm') return 'rainbow';
  }
  return w;
}

/** hoursAhead 게임시간 뒤 날씨 — 그때 가서 weatherAt 이 돌려줄 값과 같다(그 사이 새 강제가 없다면) */
export function forecastAt(region: RegionId, gameSec: number, hoursAhead: number, forces?: ForceMap | null): Weather {
  return weatherAt(region, gameSec + Math.max(0, hoursAhead) * HOUR_SEC, forces);
}

/** 기한 지난 강제 날씨를 지운다. 지운 게 있으면 true */
export function pruneForces(forces: ForceMap, gameSec: number): boolean {
  let gone = false;
  for (const [k, f] of forces) if (f.until !== null && gameSec >= f.until) { forces.delete(k); gone = true; }
  return gone;
}

/** 다음 기한(가장 이른 until) — 없으면 Infinity */
export function nextExpiry(forces: ForceMap): number {
  let m = Infinity;
  for (const f of forces.values()) if (f.until !== null && f.until < m) m = f.until;
  return m;
}

/** 날씨 이름 검사(?weather= 등) */
export const isWeather = (s: unknown): s is Weather => typeof s === 'string' && (WEATHERS as readonly string[]).includes(s);
