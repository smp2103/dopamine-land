// 곤충 채집 규칙(insects/logic.ts · insects/swarm.ts) — 잠자리채 부채꼴, 도망 거리, 폴짝, 숨은 곤충, 벌떼·쏘임, catch-fail, 잠자리채 해금.
import { describe, it, expect, beforeEach } from 'vitest';
import * as L from '../src/modules/insects/logic';
import {
  SWARM, makeSwarm, stepSwarm, catchSwarm, swarmActive, swarmFade, beePos, applySting, swarmRewards, SWARM_HONEY,
  type SwarmEvent,
} from '../src/modules/insects/swarm';
import { INSECTS } from '../src/modules/insects/data';
import { makeFakeGame, recordEvents, resetKit } from './kit/fakeGame';
import { rngFor } from '../src/core/rng';

const deg = (d: number) => (d * Math.PI) / 180;
/** 고정 난수 열 */
const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };

beforeEach(() => resetKit());

describe('잠자리채 부채꼴(앞 60° · 2.2m)', () => {
  // yaw 0 = -z 를 본다(Player.facing)
  it('정면 2.2m 안은 닿고, 밖은 안 닿는다', () => {
    expect(L.inCone(0, 0, 0, 0, -2.0, L.NET.range)).toBe(true);
    expect(L.inCone(0, 0, 0, 0, -2.19, L.NET.range)).toBe(true);
    expect(L.inCone(0, 0, 0, 0, -2.3, L.NET.range)).toBe(false);
    // 뒤·옆
    expect(L.inCone(0, 0, 0, 0, 1.5, L.NET.range)).toBe(false);
    expect(L.inCone(0, 0, 0, 1.5, 0, L.NET.range)).toBe(false);
  });
  it('반각 30°: 29° 는 닿고 31° 는 안 닿는다', () => {
    const at = (a: number, d = 1.8) => [Math.sin(deg(a)) * d, -Math.cos(deg(a)) * d] as const;
    const [x29, z29] = at(29), [x31, z31] = at(31), [xm29, zm29] = at(-29);
    expect(L.inCone(0, 0, 0, x29, z29, L.NET.range)).toBe(true);
    expect(L.inCone(0, 0, 0, xm29, zm29, L.NET.range)).toBe(true);
    expect(L.inCone(0, 0, 0, x31, z31, L.NET.range)).toBe(false);
    expect(L.NET.halfAngle * 2).toBeCloseTo(deg(60), 9);
  });
  it('yaw 를 돌리면 부채꼴도 돈다 + 발밑은 늘 닿는다', () => {
    // yaw π/2 → 앞 = -x
    expect(L.inCone(0, 0, Math.PI / 2, -2, 0, L.NET.range)).toBe(true);
    expect(L.inCone(0, 0, Math.PI / 2, 0, -2, L.NET.range)).toBe(false);
    expect(L.inCone(5, 5, 1.3, 5.1, 5.1, L.NET.range)).toBe(true);
  });
  it('좋은 잠자리채 +30% 범위', () => {
    expect(L.netRange('good')).toBeCloseTo(2.2 * 1.3, 9);
    expect(L.netRange('gold')).toBeCloseTo(2.86, 9);
    expect(L.inCone(0, 0, 0, 0, -2.6, L.netRange('net'))).toBe(false);
    expect(L.inCone(0, 0, 0, 0, -2.6, L.netRange('good'))).toBe(true);
  });
  it('높이: 발 위 2.7m · 아래 1.3m 까지 / 가장 가까운 걸 고른다', () => {
    const p = { x: 0, y: 10, z: 0 };
    expect(L.coneHit(p, 0, { x: 0, y: 12, z: -1 }, 2.2)).toBeCloseTo(1, 9);
    expect(L.coneHit(p, 0, { x: 0, y: 13, z: -1 }, 2.2)).toBe(-1);
    expect(L.coneHit(p, 0, { x: 0, y: 8.5, z: -1 }, 2.2)).toBe(-1);
    const list = [{ x: 0, y: 10, z: -2 }, { x: 0, y: 10, z: 1 }, { x: 0.2, y: 10.5, z: -1.2 }, { x: 0, y: 10, z: -3 }];
    expect(L.pickInCone(p, 0, list, 2.2)).toBe(2);
    expect(L.pickInCone(p, Math.PI, list, 2.2)).toBe(1);
    expect(L.pickInCone(p, Math.PI / 2, list, 2.2)).toBe(-1);
  });
  it('휘두르기 0.35초: 0.12초부터 그물이 앞을 쓴다', () => {
    expect(L.NET.swing).toBe(0.35);
    expect(L.swingPhase(0.05)).toMatchObject({ sweeping: false, done: false });
    expect(L.swingPhase(0.2)).toMatchObject({ sweeping: true, done: false });
    expect(L.swingPhase(0.35)).toMatchObject({ sweeping: true, done: true });
    expect(L.swingPhase(0.5).k).toBe(1);
  });
});

describe('도망 거리(달리기 4~8m · 걷기 1.5~4m, 경계심 비례)', () => {
  it('움직임 단계', () => {
    expect(L.moveStateOf(0)).toBe('still');
    expect(L.moveStateOf(2)).toBe('sneak');
    expect(L.moveStateOf(5.2)).toBe('walk');
    expect(L.moveStateOf(9.5)).toBe('run');
    expect(L.moveStateOf(0, 'air')).toBe('run');
    expect(L.moveStateOf(0, 'glide')).toBe('run');
  });
  it('★1 은 띠의 아래 끝, ★5 는 위 끝', () => {
    expect(L.fleeRadius('run', 1)).toBeCloseTo(4, 9);
    expect(L.fleeRadius('run', 5)).toBeCloseTo(8, 9);
    expect(L.fleeRadius('walk', 1)).toBeCloseTo(1.5, 9);
    expect(L.fleeRadius('walk', 5)).toBeCloseTo(4, 9);
    expect(L.fleeRadius('run', 3)).toBeCloseTo(6, 9);
    expect(L.fleeRadius('walk', 3)).toBeCloseTo(2.75, 9);
  });
  it('겁(shy)이 많을수록 멀리서 도망 — 띠를 넘지 않는다', () => {
    for (const st of ['run', 'walk'] as const) {
      expect(L.fleeRadius(st, 2, 1.4)).toBeGreaterThan(L.fleeRadius(st, 2, 1));
      expect(L.fleeRadius(st, 2, 0.6)).toBeLessThan(L.fleeRadius(st, 2, 1));
      expect(L.fleeRadius(st, 5, 3)).toBeLessThanOrEqual(st === 'run' ? 8 : 4);
      expect(L.fleeRadius(st, 1, 0.5)).toBeGreaterThanOrEqual(st === 'run' ? 4 : 1.5);
    }
  });
  it('멈추면 안 도망, 살금살금은 걷기보다 가까이까지', () => {
    expect(L.fleeRadius('still', 5)).toBe(0);
    expect(L.shouldFlee(0.3, 'still', 5)).toBe(false);
    expect(L.fleeRadius('sneak', 3)).toBeLessThan(L.fleeRadius('walk', 3));
    // ★1 은 걸어서 잠자리채 거리(2.2m)까지 갈 수 있고, 달리면 못 간다
    expect(L.shouldFlee(2.1, 'walk', 1)).toBe(false);
    expect(L.shouldFlee(2.1, 'run', 1)).toBe(true);
    expect(L.shouldFlee(3.9, 'run', 1)).toBe(true);
    expect(L.shouldFlee(4.1, 'run', 1)).toBe(false);
  });
  it('붙어 있는 곤충(perch)은 덜 예민하다', () => {
    expect(L.fleeRadius('run', 1, 1, 'perch')).toBeCloseTo(1.5, 9);
    expect(L.fleeRadius('run', 5, 1, 'perch')).toBeCloseTo(3, 9);
    expect(L.fleeRadius('walk', 5, 1, 'perch')).toBeLessThan(L.fleeRadius('walk', 5, 1, 'fly'));
  });
});

describe('폴짝(2~3m) · 행동 코드', () => {
  it('플레이어 반대쪽으로 2~3m', () => {
    const r = rngFor('hop-test');
    for (let i = 0; i < 50; i++) {
      const h = L.hopTarget(10, 10, 8, 10, r);
      const d = Math.hypot(h.x - 10, h.z - 10);
      expect(d).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(d).toBeLessThanOrEqual(3 + 1e-9);
      // 플레이어(왼쪽)에서 멀어지는 쪽(±35°)
      expect(h.x - 10).toBeGreaterThan(d * Math.cos(deg(36)));
      expect(Math.hypot(h.x - 8, h.z - 10)).toBeGreaterThan(2);
    }
    expect(L.hopArc(0)).toBe(0);
    expect(L.hopArc(0.5)).toBeCloseTo(L.HOP.height, 9);
  });
  it('행동 코드: data 글 → 몸형 → 자리', () => {
    expect(L.behaviorOf({ id: 'a', behavior: 'hide(나무 흔들기)' })).toBe('hide');
    expect(L.behaviorOf({ id: 'a', behavior: 'fly(꽃 맴돌기)' })).toBe('fly');
    expect(L.behaviorOf({ id: 'a', kind: 'grasshopper', spot: 'ground' })).toBe('hop');
    expect(L.behaviorOf({ id: 'a', kind: 'dragonfly', spot: 'air' })).toBe('hover');
    expect(L.behaviorOf({ id: 'a', kind: 'firefly', spot: 'air' })).toBe('glow');
    expect(L.behaviorOf({ id: 'a', kind: 'ladybug', spot: 'flower' })).toBe('perch');
    expect(L.behaviorOf({ id: 'a', kind: 'snail', spot: 'ground' })).toBe('crawl');
    for (const s of INSECTS) expect(L.BEHAVIORS).toContain(L.behaviorOf(s));
  });
});

describe('숨은 곤충(나무 흔들기 · 돌 두드리기 → 20초)', () => {
  const rhino = { id: 'b_rhino_beetle', gdd: 'b_rhino_beetle', rarity: 3, kind: 'rhino' };
  const stag = { id: 'bug-stag', rarity: 3, kind: 'beetle', tags: ['hide:tree-shake'] };
  const scorp = { id: 'x-scorp', rarity: 3, kind: 'spider', hide: 'rock-hit' };
  const fly = { id: 'b_yellow_butterfly', rarity: 1, kind: 'butterfly', spot: 'flower' };

  it('숨기 표시 읽기(필드·태그·행동 글·GDD id)', () => {
    expect(L.hideTriggerOf(rhino)).toBe('tree');
    expect(L.hideTriggerOf(stag)).toBe('tree');
    expect(L.hideTriggerOf(scorp)).toBe('rock');
    expect(L.hideTriggerOf({ id: 'q', behavior: 'hide(돌)' })).toBe('rock');
    expect(L.hideTriggerOf({ id: 'b_springtail', rarity: 1 } as never)).toBe('rock');
    expect(L.hideTriggerOf({ id: 'q', kind: 'rhino', hide: false })).toBe(null);
    expect(L.hideTriggerOf(fly)).toBe(null);
    // 숨는 곤충은 청크 스포너에 안 나온다
    expect(L.spawnable(rhino)).toBe(false);
    expect(L.spawnable(fly)).toBe(true);
    expect(L.spawnable({ id: 'p', p1: true })).toBe(false);
  });

  it('나무 흔들기 → 나무 숨기 곤충이 플레이어 쪽 0.9~1.7m 에 나온다', () => {
    const pool = [rhino, stag, scorp, fly];
    let got = 0;
    for (let i = 0; i < 40; i++) {
      const plan = L.planHide('tree', 100, 50, 105, 50, pool, rngFor(`shake:${i}`));
      if (!plan) continue;
      got++;
      expect(['b_rhino_beetle', 'bug-stag']).toContain(plan.species.id);
      expect(plan.res.species?.id).toBe(plan.species.id);
      const d = Math.hypot(plan.x - 100, plan.z - 50);
      expect(d).toBeGreaterThanOrEqual(L.HIDE.near[0] - 1e-9);
      expect(d).toBeLessThanOrEqual(L.HIDE.near[1] + 1e-9);
      expect(plan.x).toBeGreaterThan(100 - 0.2); // 플레이어(동쪽) 쪽 반원
    }
    // 60% 확률 — 40번이면 충분히 나온다
    expect(got).toBeGreaterThan(12);
    expect(got).toBeLessThan(40);
  });

  it('확률·후보·마릿수 제한', () => {
    const pool = [rhino, scorp, fly];
    expect(L.planHide('tree', 0, 0, 1, 0, pool, seq(0.1, 0.5, 0.5, 0.5, 0.5))?.species.id).toBe('b_rhino_beetle');
    expect(L.planHide('rock', 0, 0, 1, 0, pool, seq(0.1, 0.5, 0.5, 0.5, 0.5))?.species.id).toBe('x-scorp');
    expect(L.planHide('tree', 0, 0, 1, 0, pool, seq(0.95))).toBe(null);
    expect(L.planHide('tree', 0, 0, 1, 0, [fly, scorp], seq(0.1))).toBe(null);
    expect(L.planHide('tree', 0, 0, 1, 0, pool, seq(0.1), { live: L.HIDE.max })).toBe(null);
    // econ 굴림을 주면 그걸로
    const plan = L.planHide('tree', 0, 0, 1, 0, [rhino, stag], seq(0.1, 0.5), { roll: (c) => ({ species: c[1], rarity: 3, combo: 4, firstOfDay: true }) });
    expect(plan?.species.id).toBe('bug-stag');
    expect(plan?.res.firstOfDay).toBe(true);
  });

  it('20초 동안 보이고(나올 때 톡, 들어갈 때 스르르) 그 뒤엔 없다', () => {
    expect(L.HIDE.sec).toBe(20);
    expect(L.hideScale(0)).toBe(0);
    expect(L.hideScale(0.2)).toBeCloseTo(0.5, 9);
    expect(L.hideScale(5)).toBe(1);
    expect(L.hideScale(19.4)).toBeCloseTo(0.5, 9);
    expect(L.hideScale(20)).toBe(0);
    expect(L.hideScale(25)).toBe(0);
  });

  it('지금 데이터에도 나무 흔들기 곤충이 있다', () => {
    expect(INSECTS.some((s) => L.hideTriggerOf(s) === 'tree')).toBe(true);
  });
});

describe('벌떼(5초 추격) · 쏘임', () => {
  const run = (player: (t: number) => { x: number; y: number; z: number }, until: number, dt = 1 / 60) => {
    const s = makeSwarm(0, 0, 0, 0);
    const evs: Array<{ t: number; e: SwarmEvent }> = [];
    for (let t = dt; t <= until + 1e-9; t += dt) for (const e of stepSwarm(s, t, dt, player(t))) evs.push({ t, e });
    return { s, evs };
  };

  it('멀리 도망친 플레이어: 떠오름 0.6초 → 추격 5초 → 돌아가기 1.6초 → 끝, 안 쏘임', () => {
    const { s, evs } = run(() => ({ x: 200, y: 0, z: 0 }), 10);
    const at = (e: SwarmEvent) => evs.find((x) => x.e === e)?.t ?? NaN;
    expect(at('chase')).toBeCloseTo(SWARM.rise, 1);
    expect(at('leave')).toBeCloseTo(SWARM.rise + SWARM.chase, 1);
    expect(at('done')).toBeCloseTo(SWARM.rise + SWARM.chase + SWARM.leave, 1);
    expect(evs.some((x) => x.e === 'stung')).toBe(false);
    expect(s.phase).toBe('done');
    expect(s.stung).toBe(false);
  });

  it('가만히 있으면 쏘인다(한 번만), 그 뒤엔 돌아간다', () => {
    const { s, evs } = run(() => ({ x: 4, y: 0, z: 0 }), 8);
    const stung = evs.filter((x) => x.e === 'stung');
    expect(stung.length).toBe(1);
    // 4m 를 7m/s 로 → 떠오른 뒤 1초 안
    expect(stung[0].t).toBeGreaterThan(SWARM.rise);
    expect(stung[0].t).toBeLessThan(SWARM.rise + 1.2);
    expect(evs.find((x) => x.e === 'leave')!.t).toBeCloseTo(stung[0].t, 6);
    expect(s.stung).toBe(true);
    expect(s.phase).toBe('done');
  });

  it('달리면(9.5m/s) 따돌리고, 걸으면(5.2m/s) 잡힌다', () => {
    expect(SWARM.speed).toBeGreaterThan(5.2);
    expect(SWARM.speed).toBeLessThan(9.5);
    const runner = run((t) => ({ x: 3 + 9.5 * t, y: 0, z: 0 }), 8);
    expect(runner.evs.some((x) => x.e === 'stung')).toBe(false);
    const walker = run((t) => ({ x: 3 + 5.2 * t, y: 0, z: 0 }), 8);
    expect(walker.evs.some((x) => x.e === 'stung')).toBe(true);
  });

  it('쫓는 동안만 잡힌다', () => {
    const s = makeSwarm(0, 0, 0, 0);
    stepSwarm(s, 1, 1, { x: 30, y: 0, z: 0 });
    expect(swarmActive(s)).toBe(true);
    expect(catchSwarm(s)).toBe(true);
    expect(s.caught).toBe(true);
    expect(s.phase).toBe('done');
    expect(catchSwarm(s)).toBe(false);
    const late = makeSwarm(0, 0, 0, 0);
    stepSwarm(late, 0.7, 0.7, { x: 30, y: 0, z: 0 });
    stepSwarm(late, 6, 0.01, { x: 30, y: 0, z: 0 });
    expect(late.phase).toBe('leave');
    expect(catchSwarm(late)).toBe(false);
    expect(swarmFade(late, 6 + SWARM.leave / 2)).toBeCloseTo(0.5, 6);
  });

  it('dt 가 커도(탭 전환) 단계를 건너뛰지 않는다 + 벌 위치는 중심 둘레', () => {
    const s = makeSwarm(0, 0, 0, 0);
    expect(stepSwarm(s, 3, 3, { x: 100, y: 0, z: 0 })).toEqual(['chase']);
    expect(s.phase).toBe('chase');
    const o = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < SWARM.n; i++) {
      beePos(s, i, 1.23, o);
      expect(Math.hypot(o.x - s.x, o.z - s.z)).toBeLessThan(1);
    }
  });

  it('쏘이면 act(stung, 3) + stung 방송', () => {
    const g = makeFakeGame();
    const rec = recordEvents(g);
    applySting(g as never);
    expect(g.player.action).toBe('stung');
    expect(g.player.acts.at(-1)).toMatchObject({ name: 'stung', seconds: 3 });
    expect(rec.types()).toContain('stung');
  });

  it('벌떼 보상: 꿀 ×3 + 은 열쇠 조각 1 + harvest(honey)', () => {
    const g = makeFakeGame();
    const rec = recordEvents(g);
    const calls: string[] = [];
    (g as unknown as { econ: unknown }).econ = {
      give: (id: string, n: number) => { calls.push(`give:${id}:${n}`); return n; },
      addKeyPiece: (c: string, n: number) => { calls.push(`key:${c}:${n}`); },
    };
    const r = swarmRewards(g as never, 'home');
    expect(r).toEqual({ honey: SWARM_HONEY, key: true });
    expect(calls).toEqual(['give:m_honey:3', 'key:silver:1']);
    expect(rec.of('harvest')[0]).toMatchObject({ kind: 'honey', item: 'm_honey', n: 3, island: 'home' });
    // econ 이 없으면 가방에 바로(열쇠 조각은 경제가 없으니 못 준다)
    const g2 = makeFakeGame();
    const r2 = swarmRewards(g2 as never, 'home');
    expect(r2).toEqual({ honey: 3, key: false });
    expect(g2.state.bag.m_honey).toBe(3);
  });
});

describe('놓침 → catch-fail', () => {
  it('econ 이 있으면 econ.catchFail("bug")', () => {
    const g = makeFakeGame();
    const got: string[] = [];
    (g as unknown as { econ: unknown }).econ = {
      catchFail: (a: string) => { got.push(a); g.state.emit({ type: 'catch-fail', activity: a } as never); },
    };
    const rec = recordEvents(g);
    L.reportFail(g as never);
    expect(got).toEqual(['bug']);
    expect(rec.of('catch-fail')).toEqual([{ type: 'catch-fail', activity: 'bug' }]);
  });
  it('econ 이 없으면 직접 catch-fail{activity:"bug"} 방송', () => {
    const g = makeFakeGame();
    const rec = recordEvents(g);
    L.reportFail(g as never);
    expect(rec.of('catch-fail')).toEqual([{ type: 'catch-fail', activity: 'bug' }]);
  });
  it('econ.catchFail 이 터져도 방송은 나간다', () => {
    const g = makeFakeGame();
    (g as unknown as { econ: unknown }).econ = { catchFail: () => { throw new Error('boom'); } };
    const rec = recordEvents(g);
    const err = console.error;
    console.error = () => {};
    try { L.reportFail(g as never); } finally { console.error = err; }
    expect(rec.of('catch-fail').length).toBe(1);
  });
});

describe('잠자리채 해금 · 분홍 반짝', () => {
  const keys = (...k: string[]) => (x: string) => k.includes(x);
  it('등급: 없음 / 기본 / 좋은 / 황금', () => {
    expect(L.netTier(keys())).toBe('none');
    expect(L.netTier(keys('tool:net'))).toBe('net');
    expect(L.netTier(keys('tool:net', 'tool:goodnet'))).toBe('good');
    expect(L.netTier(keys('tool:goldnet'))).toBe('gold');
    // econ 이 없으면(테스트·룩) 기본 채
    expect(L.netTier(null)).toBe('net');
    expect(L.netTier(() => { throw new Error('x'); })).toBe('none');
  });
  it('채가 없으면 잠금 안내, 있으면 잡기 안내', () => {
    expect(L.netPrompt('none', '노랑나비')).toBe('🔒 잠자리채 필요');
    expect(L.netPrompt('none', null, true)).toBe('🔒 잠자리채 필요');
    expect(L.NO_NET_LABEL).toBe('🔒 잠자리채 필요');
    expect(L.netPrompt('net', '노랑나비')).toBe('잠자리채로 노랑나비 잡기');
    expect(L.netPrompt('good', null)).toBe('잠자리채로 살금살금 잡기');
    expect(L.netPrompt('net', null, true)).toBe('잠자리채로 벌떼 잡기!');
    expect(L.netRange('none')).toBe(0);
  });
  it('황금 잠자리채는 반짝이 ×2', () => {
    expect(L.netLuck('gold')).toBe(2);
    expect(L.netLuck('good')).toBe(1);
  });
  it('두근 게이지 0.8 초과면 분홍', () => {
    expect(L.netGlows(0.8)).toBe(false);
    expect(L.netGlows(0.81)).toBe(true);
    expect(L.netGlows(1)).toBe(true);
    expect(L.netGlows(undefined)).toBe(false);
  });
});

describe('청크 스포너 규칙', () => {
  it('청크 64m · 반경 100 · 2~5마리', () => {
    expect(L.CHUNK).toBe(64);
    expect(L.RADIUS).toBe(100);
    const seen = new Set<number>();
    const r = rngFor('per-chunk');
    for (let i = 0; i < 400; i++) {
      const n = L.bugsPerChunk(r);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
    expect(L.bugsPerChunk(() => 0.999999)).toBe(5);
  });
  it('같은 청크·날·4시간 묶음·시간대면 같은 키', () => {
    expect(L.blockOf(0)).toBe(0);
    expect(L.blockOf(3.99)).toBe(0);
    expect(L.blockOf(4)).toBe(1);
    expect(L.blockOf(23.5)).toBe(5);
    expect(L.blockOf(-1)).toBe(5);
    expect(L.chunkSeed(1, -2, 3, 9.2, 'day')).toBe(L.chunkSeed(1, -2, 3, 11.9, 'day'));
    expect(L.chunkSeed(1, -2, 3, 9.2, 'day')).not.toBe(L.chunkSeed(1, -2, 3, 12.1, 'day'));
    expect(L.chunkSeed(1, -2, 3, 9.2, 'day')).not.toBe(L.chunkSeed(1, -2, 4, 9.2, 'day'));
    expect(L.chunkSeed(1, -2, 3, 9.2, 'day')).not.toBe(L.chunkSeed(2, -2, 3, 9.2, 'day'));
    // 같은 키 → 같은 난수 열
    const a = rngFor(L.chunkSeed(5, 5, 1, 13, 'day')), b = rngFor(L.chunkSeed(5, 5, 1, 14, 'day'));
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
  it('econ 이 없을 때 로컬 굴림: 후보 안에서, 없는 희귀도는 가까운 걸로', () => {
    const pool = [{ id: 'a', rarity: 1 }, { id: 'b', rarity: 3 }];
    const r = rngFor('local');
    const hits: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const res = L.localRoll(pool, r);
      expect(res.species).not.toBe(null);
      hits[res.species!.id] = (hits[res.species!.id] ?? 0) + 1;
      expect(res.rarity).toBe(res.species!.rarity);
    }
    // ★1(55) + ★2(27 → ★1 로) 가 훨씬 많다
    expect(hits.a).toBeGreaterThan(hits.b * 3);
    expect(L.localRoll([], r).species).toBe(null);
    // ★5 를 뽑았는데 ★3 뿐이면 ★3
    expect(L.localRoll([{ id: 'c', rarity: 3 }], seq(0.9999, 0)).species?.id).toBe('c');
  });
  it('천장·오늘 첫 잡기 굴림 표시 · 크기', () => {
    expect(L.isSpecialRoll({ species: null, rarity: 3, combo: 0, firstOfDay: true })).toBe(true);
    expect(L.isSpecialRoll({ species: null, rarity: 4, combo: 0, pityHit: true })).toBe(true);
    expect(L.isSpecialRoll({ species: null, rarity: 1, combo: 0 })).toBe(false);
    expect(L.sizeCm({ size: 7.3 }, [1, 2], () => 0.5)).toBe(7.3);
    expect(L.sizeCm(null, [4, 6], () => 0.5)).toBe(5);
  });
});
