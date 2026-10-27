// 환경음 섞기(순수) — 지금 자리·날씨·시간대·움직임으로 환경음 고리마다 크기(0..1)를 정한다.
// audio.ts 가 0.5초마다 부르고, ambience.ts 가 부드럽게 따라간다.

export const AMBIENCES = ['sea', 'rain', 'storm', 'wind', 'crickets', 'moon-hum', 'boat-engine', 'glide-wind', 'underwater'] as const;
export type AmbienceName = typeof AMBIENCES[number];
export const isAmbience = (s: unknown): s is AmbienceName => typeof s === 'string' && (AMBIENCES as readonly string[]).includes(s);

export interface MixInput {
  world: 'earth' | 'space';
  /** 해안선까지 부호 거리(+ 육지 안쪽, - 바다 쪽) */
  coast: number;
  /** 땅 종류(surfaceAt.kind) */
  kind: string;
  /** 플레이어 높이(m, 바다 0) */
  y: number;
  weather: string;
  tod: string;
  mode: string;
  /** 수평 속도 */
  speed: number;
  /** 지금 탄 것 */
  vehicle: { kind: string; speed: number; boat: boolean } | null;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 엔진 소리가 나는 배(노 젓는 뗏목·오리 튜브는 아니다) */
export const MOTOR_BOATS = /motorboat|jetski|tugboat|yacht|submarine|boat/;
export const PADDLE_BOATS = /raft|duck/;
/** 하늘을 나는 탈것 → 바람 */
export const FLYERS = /plane|balloon|ufo|glider/;

export function ambienceLevels(s: MixInput): Record<AmbienceName, number> {
  const out: Record<AmbienceName, number> = { sea: 0, rain: 0, storm: 0, wind: 0, crickets: 0, 'moon-hum': 0, 'boat-engine': 0, 'glide-wind': 0, underwater: 0 };
  if (s.world === 'space') {
    out['moon-hum'] = 0.65;
    if (s.mode === 'glide') out['glide-wind'] = 0.2;
    return out;
  }
  const under = s.mode === 'dive';
  if (under) { out.underwater = 0.75; return out; }
  // 바다: 해안 60m 안에서 커지고, 바다 위에선 늘
  out.sea = s.coast <= 0 ? 0.75 : 0.75 * clamp01(1 - s.coast / 60);
  // 비·폭풍
  if (s.weather === 'rain') out.rain = 0.55;
  if (s.weather === 'storm') { out.rain = 0.8; out.storm = 0.7; out.sea = Math.max(out.sea, s.coast < 80 ? 0.85 : 0); }
  // 바람: 높은 곳(45m 위) + 눈보라·모래폭풍
  out.wind = 0.7 * clamp01((s.y - 45) / 60);
  if (s.weather === 'blizzard' || s.weather === 'sandstorm') out.wind = Math.max(out.wind, 0.8);
  else if (s.weather === 'snow') out.wind = Math.max(out.wind, 0.25);
  else if (s.weather === 'storm') out.wind = Math.max(out.wind, 0.45);
  // 밤 귀뚜라미: 땅 위, 눈·비 아닐 때
  const wet = s.weather === 'rain' || s.weather === 'storm' || s.weather === 'blizzard' || s.weather === 'snow';
  if (s.coast > 4 && s.kind !== 'snow' && !wet) {
    if (s.tod === 'night') out.crickets = 0.5;
    else if (s.tod === 'sunset') out.crickets = 0.15;
  }
  // 활공·탈것
  if (s.mode === 'glide') out['glide-wind'] = 0.3 + 0.55 * clamp01(s.speed / 16);
  const v = s.vehicle;
  if (v) {
    if (v.boat && MOTOR_BOATS.test(v.kind) && !PADDLE_BOATS.test(v.kind)) out['boat-engine'] = 0.28 + 0.62 * clamp01(Math.abs(v.speed) / 14);
    if (FLYERS.test(v.kind)) out['glide-wind'] = Math.max(out['glide-wind'], 0.2 + 0.6 * clamp01(Math.abs(v.speed) / 25));
  }
  return out;
}

// ───────────── 거리·좌우(순수) ─────────────
/** 이 거리(m) 밖 소리는 안 들린다 */
export const HEAR_DIST = 45;
/** 3m 안은 그대로 */
export const NEAR_DIST = 3;

/**
 * 듣는 자리(lx,lz)·카메라 오른쪽(rx,rz)에서 본 소리 (x,z) 의 크기 배율과 좌우(-1..1).
 * 3m 안은 1, 45m 에서 0 으로 부드럽게(1.6 제곱). 가까울수록 좌우를 덜 벌린다.
 */
export function spatialize(lx: number, lz: number, rx: number, rz: number, x: number, z: number, maxDist = HEAR_DIST): { gain: number; pan: number } {
  const dx = x - lx, dz = z - lz;
  const d = Math.hypot(dx, dz);
  const rl = Math.hypot(rx, rz) || 1;
  if (d <= NEAR_DIST) return { gain: 1, pan: d < 0.5 ? 0 : clampPan(((dx * rx + dz * rz) / (d * rl)) * (d / 6) * 0.8) };
  if (d >= maxDist) return { gain: 0, pan: 0 };
  const g = Math.pow(1 - (d - NEAR_DIST) / (maxDist - NEAR_DIST), 1.6);
  const pan = clampPan(((dx * rx + dz * rz) / (d * rl)) * Math.min(1, d / 6) * 0.8);
  return { gain: g, pan };
}
const clampPan = (p: number) => (p < -1 ? -1 : p > 1 ? 1 : p);
