// 티노 낮잠 스텔스(GDD 3.7 P0-2) — 순수 상태 기계. three·DOM 없음 → 테스트가 바로 몬다.
// 낮(09~17)엔 티노 낮잠 언덕에서 쿨쿨. 10 m 안에서 달리면 소음 게이지가 빨리, 걸으면 천천히 오르고, 살금살금이면 안 오른다.
// 100% → 깸('꺄오!') → 5초 쫓아옴 → 짧은 팔로 못 안아서 시무룩 → 제자리로 돌아가 다시 잠.
// 언덕 꼭대기 금상자는 "이번에 언덕에 다가오는 동안 게이지가 한 번도 100 에 안 닿았을 때"만 열린다.

export type TinoState = 'sleep' | 'stir' | 'wake' | 'chase' | 'sulk' | 'return' | 'awake';
/** 계약 v2 이벤트 tino{state} 로 내보내는 상태 */
export type TinoEventState = 'sleep' | 'stir' | 'wake' | 'chase';

/** 낮잠 시간(시) */
export const NAP_FROM = 9;
export const NAP_TO = 17;
/** 소리가 들리는 거리(m) */
export const HEAR_R = 10;
/** 게이지 오름(%/초) — 달리기 / 걷기 */
export const RATE_RUN = 45;
export const RATE_WALK = 9;
/** 조용하면 내려감(%/초) */
export const DECAY = 7;
/** 뒤척임 시작·끝 */
export const STIR_AT = 50;
export const STIR_OFF = 35;
/** 깬 뒤 단계 길이(초) */
export const WAKE_SEC = 1.2;
export const CHASE_SEC = 5;
export const SULK_SEC = 3;
/** 돌아가는 데 쓰는 최대 시간 */
export const RETURN_SEC = 8;
/** 이 속도(m/s)를 넘으면 달리기, 이 아래면 살금살금(걷기 5.2 · 달리기 9.5) */
export const RUN_SPEED = 7;
export const SNEAK_SPEED = 2.4;
/** 언덕에 "다가오는 중" 판정 반경(꼭대기에서) / 벗어나면 다가오기가 끝난다 */
export const APPROACH_IN = 32;
export const APPROACH_OUT = 48;

export interface TinoMachine {
  state: TinoState;
  /** 소음 게이지 0..100 */
  gauge: number;
  /** 지금 단계에서 지난 시간 */
  timer: number;
  /** 언덕에 다가오는 중인가 */
  approaching: boolean;
  /** 이번 다가오기 동안 100% 를 한 번도 안 찍었나 */
  clean: boolean;
  /** 깬 횟수(디버그·업적) */
  wakes: number;
}

export function newTino(hour: number): TinoMachine {
  return { state: isNap(hour) ? 'sleep' : 'awake', gauge: 0, timer: 0, approaching: false, clean: true, wakes: 0 };
}

export const isNap = (hour: number) => { const h = ((hour % 24) + 24) % 24; return h >= NAP_FROM && h < NAP_TO; };

/** 플레이어 움직임 → 소리 종류 */
export type Noise = 'run' | 'walk' | 'quiet';
export function noiseOf(speed: number, sneaking = false): Noise {
  if (sneaking || speed <= SNEAK_SPEED) return 'quiet';
  return speed > RUN_SPEED ? 'run' : 'walk';
}
/** 게이지 오름 속도(%/초) — 10 m 밖이면 0 */
export function noiseRate(noise: Noise, dist: number): number {
  if (!(dist <= HEAR_R)) return 0;
  return noise === 'run' ? RATE_RUN : noise === 'walk' ? RATE_WALK : 0;
}

export interface TinoInput {
  dt: number;
  hour: number;
  /** 플레이어 ↔ 티노 */
  dist: number;
  /** 플레이어 ↔ 언덕 꼭대기(상자) */
  summitDist: number;
  /** 플레이어 수평 속도 */
  speed: number;
  /** 살금살금 키를 누르고 있나 */
  sneaking?: boolean;
  /** 티노가 집(낮잠 자리)에 돌아왔나(return 단계용, 런타임이 계산) */
  home?: boolean;
  /** 쫓다가 플레이어에게 닿았나(런타임이 계산) */
  caught?: boolean;
}

const enter = (m: TinoMachine, s: TinoState, out: TinoEventState[]) => {
  m.state = s;
  m.timer = 0;
  if (s === 'sleep' || s === 'stir' || s === 'wake' || s === 'chase') out.push(s);
};

/**
 * 한 걸음. 바뀐 상태 중 이벤트로 보낼 것(sleep·stir·wake·chase)을 순서대로 돌려준다.
 * 낮잠 시간이 끝나면 깨어 있는다('awake' — 이벤트는 wake), 다시 낮잠 시간이 되면 잠든다.
 */
export function tinoStep(m: TinoMachine, i: TinoInput): TinoEventState[] {
  const out: TinoEventState[] = [];
  const dt = Math.max(0, i.dt);
  m.timer += dt;
  // ── 다가오기 추적(상자 자격)
  if (!m.approaching && i.summitDist <= APPROACH_IN) { m.approaching = true; m.clean = m.state !== 'wake' && m.state !== 'chase' && m.state !== 'sulk'; }
  else if (m.approaching && i.summitDist > APPROACH_OUT) m.approaching = false;

  const nap = isNap(i.hour);
  switch (m.state) {
    case 'awake':
      m.gauge = 0;
      if (nap) enter(m, 'sleep', out);
      break;
    case 'sleep':
    case 'stir': {
      if (!nap) { m.gauge = 0; enter(m, 'awake', out); out.push('wake'); break; }
      const rate = noiseRate(noiseOf(i.speed, i.sneaking), i.dist);
      m.gauge = rate > 0 ? Math.min(100, m.gauge + rate * dt) : Math.max(0, m.gauge - DECAY * dt);
      if (m.gauge >= 100) {
        m.gauge = 100;
        m.wakes++;
        if (m.approaching) m.clean = false;
        enter(m, 'wake', out);
      } else if (m.state === 'sleep' && m.gauge >= STIR_AT) enter(m, 'stir', out);
      else if (m.state === 'stir' && m.gauge < STIR_OFF) enter(m, 'sleep', out);
      break;
    }
    case 'wake':
      if (m.timer >= WAKE_SEC) enter(m, 'chase', out);
      break;
    case 'chase':
      if (m.timer >= CHASE_SEC || i.caught) enter(m, 'sulk', out);
      break;
    case 'sulk':
      if (m.timer >= SULK_SEC) enter(m, 'return', out);
      break;
    case 'return':
      m.gauge = Math.max(0, m.gauge - 30 * dt);
      if (i.home || m.timer >= RETURN_SEC) {
        m.gauge = 0;
        if (nap) enter(m, 'sleep', out); else { enter(m, 'awake', out); }
      }
      break;
  }
  return out;
}

/** 강제로 상태 바꾸기(디버그 __dinos.tino) */
export function forceTino(m: TinoMachine, s: TinoState): TinoEventState[] {
  const out: TinoEventState[] = [];
  if (s === 'wake') { m.gauge = 100; m.wakes++; if (m.approaching) m.clean = false; }
  if (s === 'sleep' || s === 'awake') m.gauge = 0;
  if (s === 'stir') m.gauge = Math.max(m.gauge, STIR_AT);
  enter(m, s, out);
  return out;
}

export interface ChestCheck { ok: boolean; why?: string }
/**
 * 꼭대기 금상자를 열 수 있나.
 * - 오늘 이미 열었으면 안 됨.
 * - 티노가 깨어 있는(낮잠 시간 밖) 동안엔 지키고 있어서 안 됨.
 * - 이번 다가오기 동안 게이지가 100 을 찍었으면 안 됨(언덕 밖으로 나갔다 다시 와야 한다).
 */
export function chestCheck(m: TinoMachine, hour: number, openedDay: number, day: number): ChestCheck {
  if (openedDay === day) return { ok: false, why: '오늘은 이미 열었어요. 내일 또 와요!' };
  if (!isNap(hour) || m.state === 'awake') return { ok: false, why: '티노가 깨어서 상자를 지키고 있어요… 낮잠 시간(9~17시)에 살금살금!' };
  if (m.state === 'wake' || m.state === 'chase' || m.state === 'sulk' || m.state === 'return') return { ok: false, why: '티노가 깼어요! 언덕을 내려갔다가 다시 살금살금 와 봐요' };
  if (!m.approaching) return { ok: false, why: '언덕 아래에서부터 살금살금 올라와야 열려요' };
  if (!m.clean) return { ok: false, why: '이번엔 티노를 깨웠어요… 언덕을 내려갔다가 다시 살금살금!' };
  return { ok: true };
}
