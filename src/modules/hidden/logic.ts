// hidden 순수 규칙(화면·THREE 없이 테스트한다): 숨은 곳 8곳 이름표 · 썰물 모래톱 일정 · 모래폭풍 신전 보이기 ·
// 대왕조개 여닫기 박자 · 활공대 상승 기류 · 하루 한 번 보상 · flags.hidden 읽기/쓰기.
import type { Weather } from '../../core/api';
import type { SecretId } from '../../core/events';

// ───────────── 숨은 곳(GDD 2.2.2 산호빛섬·모래시계섬·별똥별섬) ─────────────
/** 이 모듈이 맡는 숨은 곳 8곳(launch-probe 는 seaworld 가 블랙박스를 주울 때 알린다) */
export const HIDDEN_IDS = [
  'coral-clam', 'coral-pirate-cave', 'coral-sandbar',
  'desert-temple', 'desert-water-cave', 'desert-trex',
  'launch-meteorite', 'launch-glide',
] as const satisfies readonly SecretId[];
export type HiddenId = typeof HIDDEN_IDS[number];
export const isHiddenId = (s: unknown): s is HiddenId => typeof s === 'string' && (HIDDEN_IDS as readonly string[]).includes(s);

export interface SpotInfo { id: HiddenId; island: 'coral' | 'desert' | 'launch'; name: string; icon: string; color: string; body: string }
/** 발견 카드 문구(귀엽게) */
export const SPOTS: Record<HiddenId, SpotInfo> = {
  'coral-clam': { id: 'coral-clam', island: 'coral', name: '석호 바닥 대왕조개', icon: '🦪', color: '#ff9fc8', body: '하품하듯 입을 벌린 대왕조개 속에 반짝 진주가! 입을 벌렸을 때 살짝 꺼내 봐요. 하루에 한 알씩 키워 준대요.' },
  'coral-pirate-cave': { id: 'coral-pirate-cave', island: 'coral', name: '해적 동굴', icon: '🏴‍☠️', color: '#ffb36b', body: '꼬마 해적 꽃게가 지키는 비밀 동굴. 반짝이는 보물 더미 한가운데 보물상자가 기다려요.' },
  'coral-sandbar': { id: 'coral-sandbar', island: 'coral', name: '썰물 모래톱 길', icon: '🏝️', color: '#7fe0d6', body: '아침 썰물(5~9시)에만 드러나는 모래 길! 쪼꼬미섬 C 까지 걸어서 갈 수 있어요. 물이 차기 전에 돌아와요~' },
  'desert-temple': { id: 'desert-temple', island: 'desert', name: '모래폭풍 뒤 고대 신전', icon: '🏛️', color: '#f6c56a', body: '모래폭풍이 불 때만 모습을 드러내는 신전. 제단에 손을 얹으면 오래된 보물이 나와요.' },
  'desert-water-cave': { id: 'desert-water-cave', island: 'desert', name: '협곡 지하수 동굴', icon: '💧', color: '#6fd6e8', body: '바싹 마른 협곡 바닥 아래, 시원한 지하 샘이 반짝반짝! 한 모금 마시면 발이 가벼워져요.' },
  'desert-trex': { id: 'desert-trex', island: 'desert', name: '완전한 티라노 화석', icon: '🦖', color: '#e8cfa0', body: '화석 절벽 꼭대기에 머리부터 꼬리까지 다 남은 티라노 골격이! 도감에 적어 두었어요.' },
  'launch-meteorite': { id: 'launch-meteorite', island: 'launch', name: '운석 속 무중력 방', icon: '☄️', color: '#b48cf0', body: '크레이터 호수 한가운데 운석 안은 몸이 둥실 뜨는 작은 우주! 떠다니는 별가루를 모아 봐요.' },
  'launch-glide': { id: 'launch-glide', island: 'launch', name: '메사 절벽 활공 출발대', icon: '🪂', color: '#86c8ff', body: '절벽 아래에서 따뜻한 바람이 솟아올라요. 뛰어내려 Space 를 꾹 — 바람을 타고 높이높이!' },
};

// ───────────── 시간 도우미 ─────────────
export const wrapHour = (h: number) => ((h % 24) + 24) % 24;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const x = clamp01(v); return x * x * (3 - 2 * x); };

// ───────────── 썰물 모래톱(아침 5~9시) ─────────────
export const TIDE = {
  /** 물이 빠지기 시작(시) */
  start: 5,
  /** 물이 다 찬다(시) */
  end: 9,
  /** 오르내리는 데 걸리는 시간(시) — 창 안쪽에서 */
  ramp: 0.4,
  /** 다 드러났을 때 길 꼭대기 높이(해수면 위 m) */
  top: 0.32,
  /** 잠겼을 때 길 꼭대기 높이(해저 아래로 숨는다) */
  low: -1.7,
  /** 걸을 수 있는 반폭(m) */
  halfW: 3.2,
  /** 이만큼 올라와야 걸을 수 있다(충돌체·땅 공급자) */
  walkAt: 0.6,
} as const;

/** 모래톱이 얼마나 드러났나(0 잠김 … 1 다 드러남). 5시에 오르기 시작해 9시에 다 잠긴다 */
export function tideLift(hour: number): number {
  const h = wrapHour(hour);
  if (h < TIDE.start || h >= TIDE.end) return 0;
  return smooth(Math.min((h - TIDE.start) / TIDE.ramp, (TIDE.end - h) / TIDE.ramp));
}
/** 지금 걸어갈 수 있나 */
export const sandbarWalkable = (hour: number) => tideLift(hour) >= TIDE.walkAt;
/** 드러난 정도 → 길 꼭대기 높이 */
export const sandbarTopY = (lift: number) => TIDE.low + (TIDE.top - TIDE.low) * clamp01(lift);
/** 물이 차기 시작하는가(경고 토스트용: 다 드러난 뒤 내려가는 쪽) */
export const tideFalling = (hour: number) => { const h = wrapHour(hour); return h >= TIDE.end - TIDE.ramp && h < TIDE.end; };
/** 다음 썰물까지 남은 시간(시). 지금 드러나 있으면 0 */
export function hoursToLowTide(hour: number): number {
  const h = wrapHour(hour);
  if (sandbarWalkable(h)) return 0;
  // 다 드러나는 순간(start + ramp·(walkAt 지점))
  const open = TIDE.start + TIDE.ramp * 0.55;
  return h < open ? open - h : 24 - h + open;
}

/** 선분 위 가장 가까운 점까지(t 0..1, d 거리) */
export function segProject(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
  const px = a.x + dx * t, pz = a.z + dz * t;
  return { t, d: Math.hypot(x - px, z - pz), len: Math.sqrt(L2) };
}

/** 모래톱 길 가로 단면(가운데 0 → 가장자리 halfW+2.4 에서 해저 아래로). 꼭대기 기준 상대 높이 */
export function sandbarProfile(d: number): number {
  const hw = TIDE.halfW;
  if (d <= hw) return -0.22 * (d / hw) ** 2;
  return -0.22 - 1.9 * smooth((d - hw) / 2.4);
}

/** 모래톱 위 조개 줍기 자리(하루마다 바뀐다) — t 는 길 위 위치, s 는 옆 치우침(m) */
export function sandbarShells(day: number, rng: (key: string) => () => number, n = 6): Array<{ i: number; t: number; s: number; kind: number }> {
  const r = rng(`hidden:sandbar-shells:${day}`);
  const out: Array<{ i: number; t: number; s: number; kind: number }> = [];
  for (let i = 0; i < n; i++) out.push({ i, t: 0.12 + (i + r()) * (0.76 / n), s: (r() * 2 - 1) * (TIDE.halfW - 0.8), kind: Math.floor(r() * 3) });
  return out;
}

// ───────────── 모래폭풍 신전 ─────────────
/** 모래폭풍일 때만 신전이 보인다(수요일 sandtemple 이벤트는 calendar 가 모래폭풍을 건다) */
export const templeVisible = (weather: Weather | string | null | undefined) => weather === 'sandstorm';
/** 보이기 정도를 한 프레임 다가간다(dt=0 촬영 모드면 바로 목표값) */
export function fadeToward(k: number, on: boolean, dt: number, rate = 0.6): number {
  const target = on ? 1 : 0;
  if (!(dt > 0)) return target;
  const step = rate * dt;
  return k < target ? Math.min(target, k + step) : Math.max(target, k - step);
}
/** 신전에 다가가 만질 수 있을 만큼 또렷한가 */
export const templeSolid = (k: number) => k >= 0.85;

// ───────────── 대왕조개 ─────────────
export const CLAM = { period: 9, open: 5, ramp: 0.7, maxAngle: 0.95 } as const;
/** 조개가 얼마나 벌어졌나(0 닫힘 … 1 활짝) — 9초마다 5초 동안 벌린다 */
export function clamOpen(t: number): number {
  const c = ((t % CLAM.period) + CLAM.period) % CLAM.period;
  if (c >= CLAM.open) return 0;
  return smooth(Math.min(c / CLAM.ramp, (CLAM.open - c) / CLAM.ramp));
}
/** 진주를 꺼낼 수 있을 만큼 벌렸나 */
export const clamReachable = (t: number) => clamOpen(t) >= 0.7;

// ───────────── 활공대 상승 기류 ─────────────
export const UPDRAFT = { r: 8, lift: 7.5, height: 46 } as const;
/**
 * 상승 기류 기둥 안에서 올려 주는 속도(m/s). 기둥 가운데가 가장 세고, 가장자리·꼭대기로 갈수록 약하다.
 * dx, dz = 기둥 가운데로부터, y = 플레이어 높이, base = 기둥 바닥(절벽 아래), top = 바닥 + height
 */
export function updraftLift(dx: number, dz: number, y: number, base: number): number {
  const r = Math.hypot(dx, dz);
  if (r >= UPDRAFT.r) return 0;
  const top = base + UPDRAFT.height;
  if (y < base - 2 || y > top) return 0;
  const radial = 1 - smooth(r / UPDRAFT.r);
  const vertical = 1 - smooth((y - (top - 12)) / 12);
  return UPDRAFT.lift * radial * vertical;
}

// ───────────── 저장(flags.hidden) ─────────────
export interface PuzzleSaveRoom { blocks: Array<[number, number]>; solved: boolean; moves: number }
export interface HiddenFlags {
  v: 1;
  /** 알린 숨은 곳(secret-found 를 이미 쏜 것) */
  found: string[];
  /** 하루 한 번 보상: 키 → 마지막으로 받은 게임 날 */
  daily: Record<string, number>;
  /** 평생 한 번(첫 금상자·첫 진주 …) */
  once: Record<string, boolean>;
  /** 피라미드 퍼즐 방 상태 */
  pyramid: { rooms: PuzzleSaveRoom[] };
}
export function emptyFlags(): HiddenFlags { return { v: 1, found: [], daily: {}, once: {}, pyramid: { rooms: [] } }; }
/** flags.hidden 을 읽고(없거나 망가졌으면 고쳐서) 그 객체를 돌려준다 — 같은 객체를 고쳐 쓰고 save() */
export function readHiddenFlags(flags: Record<string, unknown>): HiddenFlags {
  const raw = flags.hidden as Partial<HiddenFlags> | undefined;
  const f: HiddenFlags = raw && typeof raw === 'object' ? (raw as HiddenFlags) : emptyFlags();
  f.v = 1;
  if (!Array.isArray(f.found)) f.found = [];
  else if (f.found.some((x) => typeof x !== 'string')) f.found = f.found.filter((x) => typeof x === 'string');
  if (!f.daily || typeof f.daily !== 'object') f.daily = {};
  if (!f.once || typeof f.once !== 'object') f.once = {};
  if (!f.pyramid || typeof f.pyramid !== 'object' || !Array.isArray(f.pyramid.rooms)) f.pyramid = { rooms: [] };
  flags.hidden = f;
  return f;
}
/** 처음 찾은 거면 기록하고 true(그때만 secret-found 를 쏜다) */
export function markFound(f: HiddenFlags, id: string): boolean {
  if (f.found.includes(id)) return false;
  f.found.push(id);
  return true;
}
/** 오늘 아직 안 받았나 */
export const dailyReady = (f: HiddenFlags, key: string, day: number) => f.daily[key] !== day;
/** 오늘 받았다고 적는다. 이미 받았으면 false */
export function takeDaily(f: HiddenFlags, key: string, day: number): boolean {
  if (!dailyReady(f, key, day)) return false;
  f.daily[key] = day;
  return true;
}
/** 평생 처음이면 true 를 돌려주고 적는다 */
export function takeOnce(f: HiddenFlags, key: string): boolean {
  if (f.once[key]) return false;
  f.once[key] = true;
  return true;
}
/** 보물상자 등급: 처음 한 번은 금, 그 뒤로는 하루 한 번 은 */
export const chestTierFor = (first: boolean): 'gold' | 'silver' => (first ? 'gold' : 'silver');
/** 황금풍뎅이 자리: 처음엔 꼭, 그다음부터는 날마다 35% */
export const scarabToday = (caughtBefore: boolean, roll: number) => !caughtBefore || roll < 0.35;
