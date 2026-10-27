// 벌떼(GDD 3.6 P0-6, 순수) — 벌집 이벤트{x,z} 에서 붕 떠올라(0.6초) 5초 동안 플레이어를 쫓는다.
// 닿으면 쏘임(한 번) → 벌집으로 돌아간다. 쫓는 동안 잠자리채 부채꼴에 들어오면 잡힌다(꿀벌 + 꿀 3 + 은 열쇠 조각 — 보상은 insects.ts).
// 숫자만 다룬다 — 그리기는 insects.ts 가 beePos() 로 벌 위치를 받아 인스턴스로 그린다.

export const SWARM = {
  /** 벌집에서 떠오르기(초) */
  rise: 0.6,
  /** 쫓는 시간(초) */
  chase: 5,
  /** 돌아가며 흩어지기(초) */
  leave: 1.6,
  /** 쫓는 속도(m/s) — 걷기(5.2)보다 조금 빠르고 달리기(9.5)보다 느리다 → 달리면 따돌린다 */
  speed: 7,
  /** 처음 떠오르는 높이(m) */
  riseH: 2.2,
  /** 이만큼 가까우면 쏘임(벌떼 중심 ↔ 플레이어 가슴) */
  sting: 0.9,
  /** 벌떼는 크니까 잠자리채가 이만큼 더 닿는다 */
  catchPad: 0.6,
  /** 벌 마릿수 */
  n: 10,
  /** 쏘였을 때 포즈 시간 */
  stungSec: 3,
  /** 플레이어 가슴 높이 */
  chest: 1.0,
} as const;

export type SwarmPhase = 'rise' | 'chase' | 'leave' | 'done';

export interface Swarm {
  /** 벌집 자리 */
  hx: number; hy: number; hz: number;
  /** 벌떼 중심 */
  x: number; y: number; z: number;
  t0: number;
  phase: SwarmPhase;
  /** 이 단계가 시작된 시각 */
  tPhase: number;
  stung: boolean;
  caught: boolean;
  /** 떠날 때 시작 위치 */
  lx: number; ly: number; lz: number;
}

export type SwarmEvent = 'chase' | 'stung' | 'leave' | 'done';

/** 벌집 자리(땅 높이 hy)에서 벌떼를 만든다 */
export function makeSwarm(x: number, hy: number, z: number, t: number): Swarm {
  return { hx: x, hy: hy + 1.6, hz: z, x, y: hy + 1.6, z, t0: t, phase: 'rise', tPhase: t, stung: false, caught: false, lx: x, ly: hy + 1.6, lz: z };
}

/** 살아 있나(쫓거나 떠오르는 중 — 잡을 수 있는 때) */
export const swarmActive = (s: Swarm | null | undefined) => !!s && (s.phase === 'rise' || s.phase === 'chase');

/**
 * 한 걸음. 플레이어 발 위치를 받는다. 이번 걸음에 생긴 일(단계 바뀜·쏘임)을 돌려준다.
 * 시간은 절대 시각 t 로 판정한다 → dt 가 커도(탭 전환) 단계를 건너뛰지 않는다.
 */
export function stepSwarm(s: Swarm, t: number, dt: number, player: { x: number; y: number; z: number }): SwarmEvent[] {
  const out: SwarmEvent[] = [];
  if (s.phase === 'done') return out;
  const px = player.x, py = player.y + SWARM.chest, pz = player.z;
  if (s.phase === 'rise') {
    const k = Math.min(1, (t - s.t0) / SWARM.rise);
    s.x = s.hx; s.z = s.hz;
    s.y = s.hy + SWARM.riseH * k * (2 - k);
    if (t - s.t0 >= SWARM.rise) { s.phase = 'chase'; s.tPhase = s.t0 + SWARM.rise; out.push('chase'); }
    else return out;
  }
  if (s.phase === 'chase') {
    // 쫓기 — 플레이어 가슴 쪽으로 일정 속도(살짝 흔들리며)
    const dx = px - s.x, dy = py - s.y, dz = pz - s.z;
    const d = Math.hypot(dx, dy, dz);
    const step = Math.min(d, SWARM.speed * Math.max(0, dt));
    if (d > 1e-6) { s.x += (dx / d) * step; s.y += (dy / d) * step; s.z += (dz / d) * step; }
    const nd = Math.hypot(px - s.x, py - s.y, pz - s.z);
    if (nd <= SWARM.sting) {
      s.stung = true;
      out.push('stung');
      leave(s, t);
      out.push('leave');
    } else if (t - s.tPhase >= SWARM.chase) {
      leave(s, t);
      out.push('leave');
    }
    return out;
  }
  if (s.phase === 'leave') {
    const k = Math.min(1, (t - s.tPhase) / SWARM.leave);
    const e = k * k * (3 - 2 * k);
    s.x = s.lx + (s.hx - s.lx) * e;
    s.y = s.ly + (s.hy + 0.6 - s.ly) * e;
    s.z = s.lz + (s.hz - s.lz) * e;
    if (k >= 1) { s.phase = 'done'; out.push('done'); }
  }
  return out;
}

function leave(s: Swarm, t: number) {
  s.phase = 'leave';
  s.tPhase = t;
  s.lx = s.x; s.ly = s.y; s.lz = s.z;
}

/** 잠자리채에 들어왔다 — 떠오르거나 쫓는 중이면 잡힌다(true) */
export function catchSwarm(s: Swarm): boolean {
  if (!swarmActive(s)) return false;
  s.caught = true;
  s.phase = 'done';
  return true;
}

/** 떠날 때 흐려지기(1 → 0) */
export function swarmFade(s: Swarm, t: number): number {
  if (s.phase === 'done') return 0;
  if (s.phase !== 'leave') return 1;
  return Math.max(0, 1 - (t - s.tPhase) / SWARM.leave);
}

/** 벌 i 의 위치(중심 둘레를 붕붕 — 벌마다 궤도·속도가 다르다) */
export function beePos(s: Swarm, i: number, t: number, out: { x: number; y: number; z: number }) {
  const n = SWARM.n;
  const ph = (i / n) * Math.PI * 2 + i * 0.37;
  const sp = 3.1 + (i % 4) * 0.55;
  const r = 0.32 + (i % 3) * 0.16 + Math.sin(t * 1.7 + i) * 0.06;
  const a = t * sp + ph;
  out.x = s.x + Math.cos(a) * r;
  out.z = s.z + Math.sin(a * 1.13 + i) * r;
  out.y = s.y + Math.sin(a * 0.9 + i * 1.3) * 0.28;
  return out;
}

// ───────────── 쏘임·보상(게임에 거는 부분 — 최소 모양만 받아 가짜 게임으로도 시험된다) ─────────────
export interface StingSink {
  player: { act(name: string, seconds?: number): void };
  state: { emit(e: { type: string; [k: string]: unknown }): void };
}
/** 쏘였다: 얼굴 퉁퉁 포즈 3초 + 'stung' 방송(소리·HUD 가 듣는다) */
export function applySting(g: StingSink): void {
  g.player.act('stung', SWARM.stungSec);
  g.state.emit({ type: 'stung' });
}

export interface RewardSink {
  econ?: { give?(id: string, n: number, why?: string): number; addKeyPiece?(color: 'silver' | 'gold' | 'rainbow', n: number): void } | null;
  state: { addItem(id: string, n?: number): void; emit(e: { type: string; [k: string]: unknown }): void };
}
/** 벌떼 보상: 꿀(m_honey) ×3 + 은 열쇠 조각 1(꿀벌 도감·가방은 insects.ts 가 showCatch 로). 실제로 넣은 꿀 수를 돌려준다 */
export const SWARM_HONEY = 3;
export function swarmRewards(g: RewardSink, island: string): { honey: number; key: boolean } {
  let honey = 0;
  const econ = g.econ;
  if (econ?.give) {
    try { honey = econ.give('m_honey', SWARM_HONEY, 'beehive'); } catch (e) { console.error('[swarm give]', e); }
  } else {
    g.state.addItem('m_honey', SWARM_HONEY);
    honey = SWARM_HONEY;
  }
  if (honey > 0) g.state.emit({ type: 'harvest', kind: 'honey', item: 'm_honey', n: honey, island });
  let key = false;
  if (econ?.addKeyPiece) {
    try { econ.addKeyPiece('silver', 1); key = true; } catch (e) { console.error('[swarm addKeyPiece]', e); }
  }
  return { honey, key };
}
