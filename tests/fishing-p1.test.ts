// 낚시 P1 — 릴 줄다리기 텐션 모델 · 협동 ×2 · 얼음 구멍 뚫기·타이밍 · 돛등이 대결 점수·상 · 트롤링 규칙 · fight 단계(logic) · 빈 물은 미끼를 안 쓴다.
import { describe, expect, it } from 'vitest';
import * as R from '../src/modules/fishing/reel';
import * as I from '../src/modules/fishing/icehole';
import * as K from '../src/modules/fishing/contest';
import * as T from '../src/modules/fishing/trolling';
import * as L from '../src/modules/fishing/logic';
import { rngFor } from '../src/core/rng';
import type { RollResult } from '../src/core/api';

const DT = 1 / 60;

/** 줄다리기를 정책대로 끝까지 돌린다 — 끝(win/snap/escape)과 걸린 시간 */
function runReel(rarity: number, policy: (s: R.ReelState, frame: number) => { mash: boolean; steer?: number; coop?: boolean }, seed = 'reel') {
  const rng = rngFor(seed);
  const s = R.newReel(rarity, 1, rng);
  for (let f = 0; f < 60 * 60 && !s.done; f++) {
    const p = policy(s, f);
    R.stepReel(s, DT, { mash: p.mash, steer: p.steer ?? 0, coop: p.coop }, rng);
  }
  return s;
}
/** 1초에 6번 연타 */
const every10 = (f: number) => f % 10 === 0;
/** 잘하는 사람: 빨간 칸이면 놓고, 텐션이 0.5 아래로 내려오면 다시 연타 + 물고기 반대쪽으로 버티기 */
function smart() {
  let resting = false;
  return (s: R.ReelState, f: number) => {
    if (R.inRed(s)) resting = true;
    if (resting && s.tension < 0.5) resting = false;
    return { mash: !resting && every10(f), steer: s.surge > 0 ? -s.dir : 0 };
  };
}

describe('릴 줄다리기 텐션 모델(★4+)', () => {
  it('세기: ★5 가 ★4 보다 세고, 큰 개체일수록 조금 더 세다', () => {
    expect(R.fishStrength(5)).toBeGreaterThan(R.fishStrength(4));
    expect(R.fishStrength(4, 1.6)).toBeGreaterThan(R.fishStrength(4, 1));
    expect(R.fishStrength(4, 100)).toBeLessThanOrEqual(1.3 + 1e-9);
  });

  it('쉬지 않고 연타하면 빨간 칸을 지나 줄이 끊어진다(snap)', () => {
    for (const r of [4, 5]) {
      const s = runReel(r, (_s, f) => ({ mash: every10(f) }), `snap${r}`);
      expect(s.done).toBe('snap');
      expect(s.redTime).toBeGreaterThan(0);
    }
  });

  it('빨간 칸에선 놓고 다시 당기면 ★4·★5 모두 잡힌다(win)', () => {
    for (const r of [4, 5]) for (const seed of ['a', 'b', 'c']) {
      const s = runReel(r, smart(), `${seed}${r}`);
      expect(s.done).toBe('win');
      expect(s.t).toBeLessThan(R.FIGHT_MAX_SEC);
    }
    // ★5 는 더 오래 걸린다
    const t4 = runReel(4, smart(), 'cmp').t, t5 = runReel(5, smart(), 'cmp').t;
    expect(t5).toBeGreaterThan(t4);
  });

  it('가만히 있으면 물고기가 도망간다(escape)', () => {
    const s = runReel(4, () => ({ mash: false }), 'idle');
    expect(s.done).toBe('escape');
    expect(s.progress).toBeLessThanOrEqual(0);
  });

  it('빨간 칸에서 놓으면 텐션이 빨리 풀린다, 당기면 더 오른다', () => {
    const rng = () => 0.99; // 돌진 없음(먼 다음 돌진)
    const a = R.newReel(4, 1, rng); a.tension = 0.9; a.nextSurge = 99;
    const b = R.newReel(4, 1, rng); b.tension = 0.9; b.nextSurge = 99;
    R.stepReel(a, 0.1, { mash: false, steer: 0 }, rng);
    R.stepReel(b, 0.1, { mash: true, steer: 0 }, rng);
    expect(a.tension).toBeLessThan(0.9);
    expect(b.tension).toBeGreaterThan(0.9 + R.RED_MASH_TENSION * 0.9);
  });

  it('물고기 반대쪽으로 버티면(A·D) 끄는 힘이 줄고, 같은 쪽이면 늘어난다', () => {
    const rng = () => 0.5;
    const mk = () => { const s = R.newReel(4, 1, rng); s.dir = 1; s.surge = 1; s.tension = 0.4; return s; };
    const counter = mk(), none = mk(), wrong = mk();
    R.stepReel(counter, 0.1, { mash: false, steer: -1 }, rng);
    R.stepReel(none, 0.1, { mash: false, steer: 0 }, rng);
    R.stepReel(wrong, 0.1, { mash: false, steer: 1 }, rng);
    expect(counter.tension).toBeLessThan(none.tension);
    expect(wrong.tension).toBeGreaterThan(none.tension);
  });

  it('돌진·빨간 칸·끝 사건을 낸다', () => {
    const rng = rngFor('ev');
    const s = R.newReel(4, 1, rng);
    const types = new Set<string>();
    for (let f = 0; f < 3600 && !s.done; f++) for (const e of R.stepReel(s, DT, { mash: every10(f), steer: 0 }, rng)) types.add(e.type);
    expect(types.has('surge')).toBe(true);
    expect(types.has('red')).toBe(true);
    expect(types.has('end')).toBe(true);
    // 끝나면 더 진행하지 않는다
    expect(R.stepReel(s, DT, { mash: true, steer: 0 }, rng)).toEqual([]);
  });

  it('화면용 거리: 감을수록 가까워진다', () => {
    expect(R.fishDistance({ progress: 0 }, 8)).toBeCloseTo(8);
    expect(R.fishDistance({ progress: 1 }, 8)).toBeCloseTo(1.2);
  });
});

describe('협동 릴(친구와 같이 감기 ×2)', () => {
  it('친구가 같이 감으면 연타 한 번의 감기가 정확히 두 배', () => {
    expect(R.mashGain(1, true)).toBeCloseTo(R.mashGain(1, false) * 2);
    const rng = () => 0.99;
    const solo = R.newReel(4, 1, rng), duo = R.newReel(4, 1, rng);
    solo.nextSurge = duo.nextSurge = 99;
    const p0 = solo.progress;
    R.stepReel(solo, 0, { mash: true, steer: 0, coop: false }, rng);
    R.stepReel(duo, 0, { mash: true, steer: 0, coop: true }, rng);
    expect(duo.progress - p0).toBeCloseTo((solo.progress - p0) * 2);
    expect(duo.coopMashes).toBe(1);
    expect(solo.coopMashes).toBe(0);
  });

  it('협동이면 같은 연타로 더 빨리 잡는다', () => {
    const solo = runReel(5, smart(), 'coop');
    const pol = smart();
    const duo = runReel(5, (s, f) => ({ ...pol(s, f), coop: true }), 'coop');
    expect(solo.done).toBe('win');
    expect(duo.done).toBe('win');
    expect(duo.t).toBeLessThan(solo.t);
  });

  it('협동 중 판정: 친구가 붙어 있고 1.5초 안에 감기 신호가 왔을 때만', () => {
    expect(R.coopActive(true, 10, 11)).toBe(true);
    expect(R.coopActive(true, 10, 10 + R.COOP_WINDOW + 0.01)).toBe(false);
    expect(R.coopActive(false, 10, 10.5)).toBe(false);
    expect(R.coopActive(true, -99, 0)).toBe(false);
  });
});

describe('얼음 구멍 미니게임', () => {
  it('뚫기: E 를 DRILL_PRESSES 번 누르면 뚫리고, 쉬면 다시 언다', () => {
    let p = 0;
    for (let i = 0; i < I.DRILL_PRESSES - 1; i++) p = I.drillStep(p, true, 0);
    expect(I.drilled(p)).toBe(false);
    const before = p;
    p = I.drillStep(p, false, 1);
    expect(p).toBeCloseTo(before - I.DRILL_REFREEZE);
    p = I.drillStep(p, true, 0); p = I.drillStep(p, true, 0);
    expect(I.drilled(p)).toBe(true);
  });

  it('뚫은 구멍은 그날만 열려 있다', () => {
    let f = I.openHole(undefined, 3, 'ice-lake4:0');
    expect(I.holeOpen(f, 3, 'ice-lake4:0')).toBe(true);
    expect(I.holeOpen(f, 3, 'ice-lake4:1')).toBe(false);
    expect(I.holeOpen(f, 4, 'ice-lake4:0')).toBe(false);
    f = I.openHole(f, 4, 'ice-lake4:1');
    expect(f).toEqual({ day: 4, open: ['ice-lake4:1'] });
  });

  it('타이밍 표: ★ 가 높을수록 칸이 좁고 하트가 빠르고 맞혀야 하는 수가 많다', () => {
    expect(I.timingWidth(1)).toBeGreaterThan(I.timingWidth(5));
    expect(I.timingSpeed(5)).toBeGreaterThan(I.timingSpeed(1));
    expect(I.timingNeed(1)).toBe(2);
    expect(I.timingNeed(3)).toBe(3);
    expect(I.timingNeed(5)).toBe(4);
  });

  it('하트는 0..1 을 왕복한다', () => {
    const s = { t0: 0, speed: 1 };
    expect(I.markerPos(s, 0)).toBe(0);
    expect(I.markerPos(s, 0.25)).toBeCloseTo(0.5);
    expect(I.markerPos(s, 0.5)).toBeCloseTo(1);
    expect(I.markerPos(s, 0.75)).toBeCloseTo(0.5);
    expect(I.markerPos(s, 1)).toBeCloseTo(0);
  });

  /** 하트가 칸 가운데에 오는 시각 */
  const hitTime = (s: I.Timing, from: number) => {
    for (let t = from; t < from + 10; t += 0.001) if (Math.abs(I.markerPos(s, t) - s.center) < 0.004) return t;
    throw new Error('never in zone');
  };
  const missTime = (s: I.Timing, from: number) => {
    for (let t = from; t < from + 10; t += 0.001) if (!I.inZone(s, I.markerPos(s, t))) return t;
    throw new Error('always in zone');
  };

  it('칸 안에서 누르면 맞힘 → 다 맞히면 잡았다(win)', () => {
    const rng = rngFor('ice-win');
    const s = I.newTiming(3, 0, rng);
    let t = 0, last: string = '';
    for (let i = 0; i < s.need; i++) { t = hitTime(s, t + 0.01); last = I.timingPress(s, t, rng); }
    expect(last).toBe('win');
    expect(s.hits).toBe(s.need);
    expect(s.done).toBe('win');
  });

  it('두 번 빗나가면 도망(fail) — 한 번은 봐준다', () => {
    const rng = rngFor('ice-fail');
    const s = I.newTiming(5, 0, rng);
    expect(I.timingPress(s, missTime(s, 0), rng)).toBe('miss');
    expect(s.done).toBeNull();
    expect(I.timingPress(s, missTime(s, 1), rng)).toBe('fail');
    expect(s.done).toBe('fail');
    // 끝난 뒤엔 그대로
    expect(I.timingPress(s, hitTime(s, 2), rng)).toBe('fail');
  });

  it('맞히면 칸이 옮겨 가고 조금 좁아진다', () => {
    const rng = rngFor('ice-move');
    const s = I.newTiming(1, 0, rng);
    const w0 = s.width;
    expect(I.timingPress(s, hitTime(s, 0.01), rng)).toBe('hit');
    expect(s.width).toBeLessThan(w0);
    expect(s.center - s.width / 2).toBeGreaterThanOrEqual(0);
    expect(s.center + s.width / 2).toBeLessThanOrEqual(1);
  });
});

describe('돛등이 낚시 대결 점수', () => {
  it('점수 = ★ 기본점 × 크기 비율(0.5~2), 쓰레기 1점', () => {
    expect(K.contestPoints(1)).toBe(10);
    expect(K.contestPoints(3)).toBe(50);
    expect(K.contestPoints(5)).toBe(200);
    expect(K.contestPoints(0)).toBe(1);
    expect(K.contestPoints(4, 150, 100)).toBe(150);
    expect(K.contestPoints(4, 10, 100)).toBe(50); // 0.5 아래는 0.5
    expect(K.contestPoints(2, 400, 100)).toBe(50); // 2 위는 2
  });

  it('돛등이 일정: 3분 안 · 시간 순 · 같은 씨앗이면 같다', () => {
    const a = K.spinoSchedule(rngFor('sp:1'));
    const b = K.spinoSchedule(rngFor('sp:1'));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(5);
    expect(a.length).toBeLessThanOrEqual(11);
    for (let i = 1; i < a.length; i++) expect(a[i].at).toBeGreaterThan(a[i - 1].at);
    expect(a[a.length - 1].at).toBeLessThan(K.CONTEST_SEC);
    for (const c of a) { expect(c.rarity).toBeGreaterThanOrEqual(1); expect(c.rarity).toBeLessThanOrEqual(5); expect(c.points).toBeGreaterThan(0); }
  });

  it('이름은 ★별 이름표에서 고른다', () => {
    const s = K.spinoSchedule(rngFor('sp:names'), K.CONTEST_SEC, { 1: ['발자국피라미'], 2: ['투구게투구'], 3: ['갑옷철갑상어'], 4: ['아노말'], 5: ['철갑턱둔클레오'] });
    expect(s.every((c) => ['발자국피라미', '투구게투구', '갑옷철갑상어', '아노말', '철갑턱둔클레오'].includes(c.name))).toBe(true);
  });

  it('시간이 흐르면 돛등이 점수가 쌓이고 3분에 끝난다', () => {
    const sched = K.spinoSchedule(rngFor('sp:tick'));
    const c = K.newContest(100, sched);
    expect(K.contestTick(c, 100).spino).toEqual([]);
    const mid = K.contestTick(c, 100 + 90);
    expect(mid.ended).toBe(false);
    const end = K.contestTick(c, 100 + K.CONTEST_SEC);
    expect(end.ended).toBe(true);
    expect(c.his).toBe(sched.length);
    expect(c.spino).toBe(sched.reduce((a, s) => a + s.points, 0));
    // 끝난 뒤엔 점수를 더 받지 않는다
    expect(K.addCatch(c, 5)).toBe(0);
    expect(K.contestTick(c, 999).ended).toBe(false);
  });

  it('승부 · 상: 이기면 그날 처음 한 번 황금 미끼 ×5', () => {
    const c = K.newContest(0, []);
    K.addCatch(c, 3); K.addCatch(c, 2, 30, 20);
    expect(c.me).toBe(50 + 38);
    expect(c.mine).toBe(2);
    expect(K.contestResult(c)).toBe('win');
    expect(K.contestResult({ me: 10, spino: 10 })).toBe('tie');
    expect(K.contestResult({ me: 5, spino: 10 })).toBe('lose');
    expect(K.prizeFor('win', undefined, 7)).toBe(K.GOLDEN_PRIZE);
    expect(K.GOLDEN_PRIZE).toBe(5);
    expect(K.PRIZE_ITEM).toBe('bait_golden');
    expect(K.prizeFor('win', 7, 7)).toBe(0);
    expect(K.prizeFor('lose', undefined, 7)).toBe(0);
    expect(K.prizeFor('tie', undefined, 7)).toBe(0);
  });

  it('남은 시간 표시', () => {
    expect(K.clock(180)).toBe('3:00');
    expect(K.clock(61.2)).toBe('1:02');
    expect(K.clock(-3)).toBe('0:00');
  });
});

describe('트롤링(배 뒤 낚시)', () => {
  it('먼바다·심해에서 배가 충분히 빠를 때만', () => {
    expect(T.canTroll({ boat: true, speed: 6 }, 'offshore')).toBe(true);
    expect(T.canTroll({ boat: true, speed: -6 }, 'deep')).toBe(true);
    expect(T.canTroll({ boat: true, speed: 1 }, 'offshore')).toBe(false);
    expect(T.canTroll({ boat: true, speed: 8 }, 'shore')).toBe(false);
    expect(T.canTroll({ boat: false, speed: 8 }, 'offshore')).toBe(false);
    expect(T.canTroll(null, 'offshore')).toBe(false);
    expect(T.trollZone('trench')).toBe('deep');
    expect(T.trollZone('offshore')).toBe('offshore');
  });

  it('달린 시간이 쌓이면 꾹 → 창 안 E 로 걸기', () => {
    const s = T.newTroll(0);
    const evs: T.TrollEvent[] = [];
    for (let i = 0; i < 600 && s.phase === 'lure'; i++) evs.push(...T.stepTroll(s, 0.1, { speed: 8, press: false, cancel: false }));
    expect(evs).toContainEqual({ type: 'strike' });
    expect(T.stepTroll(s, 0.1, { speed: 8, press: true, cancel: false })).toEqual([{ type: 'hook' }]);
  });

  it('꾹 창을 놓치면 miss, 오래 느리면 루어가 가라앉는다, E 는 줄 감기', () => {
    const a = T.newTroll(0); a.moved = a.wait;
    T.stepTroll(a, 0.01, { speed: 8, press: false, cancel: false });
    expect(a.phase).toBe('strike');
    expect(T.stepTroll(a, a.window + 0.1, { speed: 8, press: false, cancel: false })).toEqual([{ type: 'miss' }]);
    const b = T.newTroll(0.5);
    let slow: T.TrollEvent[] = [];
    for (let i = 0; i < 40 && b.phase === 'lure'; i++) slow = T.stepTroll(b, 0.1, { speed: 1, press: false, cancel: false });
    expect(slow).toEqual([{ type: 'slow' }]);
    const c = T.newTroll(0.5);
    expect(T.stepTroll(c, 0.1, { speed: 8, press: true, cancel: false })).toEqual([{ type: 'reel' }]);
  });

  it('빠를수록 꾹이 빨리 온다', () => {
    const run = (speed: number) => { const s = T.newTroll(0.5); let n = 0; while (s.phase === 'lure' && n < 2000) { T.stepTroll(s, 0.1, { speed, press: false, cancel: false }); n++; } return n; };
    expect(run(12)).toBeLessThan(run(4));
  });
});

describe('fight 단계(logic 상태 기계)', () => {
  const noInput: L.StepInput = { press: false, held: false, cancel: false };
  const press: L.StepInput = { press: true, held: true, cancel: false };
  it('★4 이상만 줄다리기', () => {
    expect(L.needsFight({ rarity: 4 })).toBe(true);
    expect(L.needsFight({ rarity: 5 })).toBe(true);
    expect(L.needsFight({ rarity: 3 })).toBe(false);
    expect(L.needsFight({ rarity: 5, junk: 't_boot' })).toBe(false);
  });
  it('fight 로 무장하면 꾹에 E = hook → endFight 로 catch/fail', () => {
    const s = L.newSession();
    L.forceBite(s, 0.5);
    s.fight = true;
    expect(L.step(s, 0.01, press, () => 0.5)).toEqual([{ type: 'hook' }]);
    expect(s.phase).toBe('fight');
    // 줄다리기 중 E 는 상태 기계가 먹지 않는다(reel 모델 몫), 줄 감기도 안 된다
    expect(L.step(s, 0.01, press, () => 0.5)).toEqual([]);
    L.reelIn(s);
    expect(s.phase).toBe('fight');
    expect(L.endFight(s, true)).toEqual([{ type: 'catch' }]);
    const s2 = L.newSession(); L.forceFight(s2);
    expect(L.endFight(s2, false, 'snap')).toEqual([{ type: 'fail', why: 'snap' }]);
    expect(L.endFight(s2, true)).toEqual([]); // fight 가 아니면 아무 일 없음
    const s3 = L.newSession(); L.forceFight(s3);
    expect(L.step(s3, 0.01, { ...noInput, cancel: true }, () => 0.5)).toEqual([{ type: 'fail', why: 'escape' }]);
    expect(L.FAIL_TOAST.snap).toContain('빨간');
  });
  it('fight 가 아니면 예전처럼 바로 catch', () => {
    const s = L.newSession();
    L.arm(s, { wait: 0, approach: 1, window: 0.7 });
    L.forceBite(s, 0.7);
    expect(L.step(s, 0.01, press, () => 0.5)).toEqual([{ type: 'catch' }]);
  });
});

describe('빈 물은 미끼를 안 쓴다(handoff)', () => {
  it('후보가 없으면 굴림 결과도 없고 미끼를 쓰지 않는다', () => {
    let used = 0;
    const roll = (): RollResult => ({ species: null, rarity: 0, combo: 0 });
    const plan: L.CastPlan = { activity: 'fish', zone: 'dune', island: 'desert', junk: false };
    const rolls = L.rollShadows({ n: 3, plan, pool: [], bait: 'bait_worm', roll });
    // fishing.ts 와 같은 규칙: 그림자가 하나라도 있을 때만 takeBait
    if (rolls.length) L.takeBait('bait_worm', () => 1, () => { used++; });
    expect(rolls).toEqual([]);
    expect(used).toBe(0);
    const some = L.rollShadows({ n: 1, plan, pool: [], bait: 'bait_worm', roll: () => ({ species: { id: 'x', rarity: 1 } as never, rarity: 1, combo: 0 }) });
    if (some.length) L.takeBait('bait_worm', () => 1, () => { used++; });
    expect(used).toBe(1);
  });
});
