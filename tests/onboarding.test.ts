// onboarding 순수 로직 — 차례(걷기→달리기→점프) · 한 번만(저장) · 이미 해 본 건 건너뛰기 · 조용한 틈 · 바쁠 때 쉬기
import { describe, it, expect } from 'vitest';
import {
  HINTS, blankSignals, step, makeState, gapOf, parseText, readFlags, initialRec, isVeteran, finishActive,
  FIRST_DELAY, GAP_MIN, GAP_MAX, CAM_AFTER_SEC, type Signals, type OnbState,
} from '../src/modules/onboarding/logic';

const DT = 0.1;
/** n초 동안 굴린다(신호는 매 걸음 fn 으로 바꿀 수 있다). 보인 안내 id 를 돌려준다 */
function run(st: OnbState, s: Signals, sec: number, fn?: (s: Signals, t: number) => void, gap = () => 8) {
  const shown: string[] = [];
  const ended: Array<[string, string]> = [];
  for (let t = 0; t < sec; t += DT) {
    fn?.(s, t);
    const o = step(st, HINTS, s, DT, gap);
    if (o.show) shown.push(o.show.id);
    if (o.end) ended.push([o.end.def.id, o.end.why]);
  }
  return { shown, ended };
}

describe('onboarding 차례', () => {
  it('시작 전엔 아무것도 안 띄우고, 시작하면 잠깐 뒤 걷기부터', () => {
    const st = makeState();
    const s = blankSignals();
    expect(run(st, s, 5).shown).toEqual([]);
    s.started = true;
    const r = run(st, s, FIRST_DELAY + 0.3);
    expect(r.shown).toEqual(['move']);
  });

  it('걷기 4m → 끝나고 틈 → 달리기 → 점프 차례', () => {
    const st = makeState();
    const s = blankSignals({ started: true });
    run(st, s, 2);
    expect(st.active?.id).toBe('move');
    s.movedM = 4.2;
    const r1 = run(st, s, 0.2);
    expect(r1.ended).toEqual([['move', 'done']]);
    expect(st.rec.move).toBe('done');
    // 틈(8초) 동안은 조용
    expect(run(st, s, 7.5).shown).toEqual([]);
    expect(run(st, s, 1).shown).toEqual(['run']);
    s.ranSec = 2.1;
    run(st, s, 0.2);
    expect(st.rec.run).toBe('done');
    const r3 = run(st, s, 9);
    expect(r3.shown).toEqual(['jump']);
    s.jumped = true;
    run(st, s, 0.2);
    expect(st.rec.jump).toBe('done');
  });

  it('달리기 안내는 걷기가 끝나기 전엔 안 뜬다', () => {
    const st = makeState();
    const s = blankSignals({ started: true, world: 'space' }); // 우주에선 걷기 안내가 안 뜬다 → 달리기도 기다린다
    expect(run(st, s, 30).shown).toEqual([]);
  });

  it('상황 안내가 순서 안내보다 먼저(우선순위)', () => {
    const st = makeState({ move: 'done' });
    st.quiet = 0;
    const s = blankSignals({ started: true, nearFishWater: true, hasRod: true });
    const r = run(st, s, 0.2);
    expect(r.shown).toEqual(['fish']);
  });

  it('말 걸기 안내는 시작 자리(주민·상자 곁)에서도 걷기·달리기·점프 순서를 끊지 않는다', () => {
    const st = makeState({ move: 'done' });
    st.quiet = 0;
    const s = blankSignals({ started: true, nearInteract: true });
    expect(run(st, s, 0.2).shown).toEqual(['run']);
  });

  it('주머니·도감·상점 안내는 걷기·달리기·점프가 끝난 뒤(시작 편지가 와도 움직이기가 먼저)', () => {
    const st = makeState({ move: 'done' });
    st.quiet = 0;
    const s = blankSignals({ started: true, gotMail: true, caught: true });
    expect(run(st, s, 0.2).shown).toEqual(['run']);
  });

  it('낚시 안내는 낚싯대가 있을 때만', () => {
    const st = makeState({ move: 'done', run: 'done', jump: 'done' });
    st.quiet = 0;
    const s = blankSignals({ started: true, nearFishWater: true, hasRod: false });
    expect(run(st, s, 3).shown).toEqual([]);
    s.hasRod = true;
    expect(run(st, s, 0.2).shown).toEqual(['fish']);
  });

  it('시간이 다 되면(ttl) ttl 로 적고 다시 안 뜬다', () => {
    const st = makeState({ move: 'done', run: 'done', jump: 'done' });
    st.quiet = 0;
    const s = blankSignals({ started: true, deepWater: true });
    const r = run(st, s, 40);
    expect(r.shown).toEqual(['dive']);
    expect(r.ended).toEqual([['dive', 'ttl']]);
    expect(st.rec.dive).toBe('ttl');
  });

  it('카메라 안내는 5분 놀고 나서', () => {
    const st = makeState({ move: 'done', run: 'done', jump: 'done' });
    st.quiet = 0;
    const s = blankSignals({ started: true, playSec: CAM_AFTER_SEC - 10 });
    expect(run(st, s, 2).shown).toEqual([]);
    s.playSec = CAM_AFTER_SEC + 1;
    expect(run(st, s, 0.2).shown).toEqual(['cam']);
  });
});

describe('onboarding 건너뛰기', () => {
  it('안내가 뜨기 전에 이미 해 본 건 skip', () => {
    const st = makeState();
    const s = blankSignals({ started: true, movedM: 10, ranSec: 3, jumped: true, camToggled: true });
    const o = step(st, HINTS, s, DT, () => 8);
    expect(o.skipped).toEqual(expect.arrayContaining(['move', 'run', 'jump', 'cam']));
    expect(st.rec.move).toBe('skip');
    // 다음 안내 후보로 안 올라온다
    expect(run(st, s, 30).shown).toEqual([]);
  });

  it('시작 전에 한 일도 지켜본다(타이틀에서 주머니를 열었으면 주머니 안내 skip)', () => {
    const st = makeState({ move: 'done' });
    const s = blankSignals({ started: false, pouchOpened: true });
    step(st, HINTS, s, DT, () => 8);
    expect(st.rec.pouch).toBe('skip');
  });

  it('주머니 안내: 열면 끝(done)', () => {
    const st = makeState({ move: 'done', run: 'done', jump: 'done' });
    st.quiet = 0;
    const s = blankSignals({ started: true, gotMail: true });
    expect(run(st, s, 0.2).shown).toEqual(['pouch']);
    s.pouchOpened = true; s.busy = true; // 주머니가 열리면 바빠지지만 done 이 먼저
    const r = run(st, s, 0.2);
    expect(r.ended).toEqual([['pouch', 'done']]);
  });
});

describe('onboarding 조용한 틈 · 바쁠 때', () => {
  it('틈은 6~10초', () => {
    expect(gapOf(0)).toBe(GAP_MIN);
    expect(gapOf(1)).toBe(GAP_MAX);
    expect(gapOf(0.5)).toBeCloseTo(8);
    expect(gapOf(-3)).toBe(GAP_MIN);
  });

  it('안내가 끝나면 다음 안내는 그 틈만큼 기다린다(조건이 계속 맞아도)', () => {
    const st = makeState({ move: 'done', run: 'done', jump: 'done' });
    st.quiet = 0;
    const s = blankSignals({ started: true, nearInteract: true, deepWater: true });
    const r1 = run(st, s, 0.2, undefined, () => 7);
    expect(r1.shown).toEqual(['dive']);
    s.dived = true;
    run(st, s, 0.1, undefined, () => 7);
    expect(st.quiet).toBeCloseTo(7);
    let t = 0;
    for (; t < 20 && !st.active; t += DT) step(st, HINTS, s, DT, () => 7);
    expect(st.active?.id).toBe('interact');
    expect(t).toBeGreaterThanOrEqual(6.9);
    expect(t).toBeLessThan(7.3);
  });

  it('바쁠 땐 안 띄우고 틈도 안 줄며, 떠 있던 건 숨었다 다시(시간 안 셈)', () => {
    const st = makeState();
    const s = blankSignals({ started: true, busy: true });
    expect(run(st, s, 10).shown).toEqual([]);
    expect(st.quiet).toBeCloseTo(FIRST_DELAY);
    s.busy = false;
    run(st, s, 2);
    expect(st.active?.id).toBe('move');
    const age = st.active!.age;
    s.busy = true;
    const o = step(st, HINTS, s, DT, () => 8);
    expect(o.pause?.id).toBe('move');
    run(st, s, 60);
    expect(st.active?.age).toBe(age);
    s.busy = false;
    const o2 = step(st, HINTS, s, DT, () => 8);
    expect(o2.resume?.id).toBe('move');
  });

  it('한 번에 하나만', () => {
    const st = makeState({ move: 'done', run: 'done', jump: 'done' });
    st.quiet = 0;
    const s = blankSignals({ started: true, nearInteract: true, deepWater: true, gotItem: true, caught: true, gotCoins: true });
    const r = run(st, s, 5);
    expect(r.shown.length).toBe(1);
  });

  it('finishActive(디버그 next) — ttl 로 적고 틈 없이', () => {
    const st = makeState();
    const s = blankSignals({ started: true });
    run(st, s, 2);
    expect(finishActive(st, HINTS)?.id).toBe('move');
    expect(st.rec.move).toBe('ttl');
    expect(st.quiet).toBe(0);
    expect(run(st, s, 0.2).shown).toEqual(['run']);
  });
});

describe('onboarding 저장 · 한 번만', () => {
  it('저장된 기록이 있으면 다시 안 뜬다', () => {
    const f = readFlags({ v: 1, done: { move: 'done', run: 'ttl', bogus: 'nope' }, play: 42 });
    expect(f).toEqual({ v: 1, done: { move: 'done', run: 'ttl' }, play: 42 });
    const st = makeState(initialRec(HINTS, f, undefined, false));
    const s = blankSignals({ started: true });
    expect(run(st, s, 5).shown).toEqual(['jump']);
  });

  it('망가진 flags 는 버린다', () => {
    expect(readFlags(null)).toBeNull();
    expect(readFlags('x')).toBeNull();
    expect(readFlags({ done: 5, play: -1 })).toEqual({ v: 1, done: {}, play: 0 });
  });

  it('hud 가 기억한 안내(flags.ui.hints)도 본 것으로', () => {
    expect(initialRec(HINTS, null, ['onboarding:dive', 'other'], false)).toEqual({ dive: 'done' });
    expect(initialRec(HINTS, null, { 'onboarding:cam': true }, false)).toEqual({ cam: 'done' });
  });

  it('예전부터 놀던 사람은 움직이기 안내만 건너뛴다', () => {
    const rec = initialRec(HINTS, null, undefined, true);
    expect(rec).toEqual({ move: 'skip', run: 'skip', jump: 'skip' });
    const st = makeState(rec);
    st.quiet = 0;
    const s = blankSignals({ started: true, nearInteract: true });
    expect(run(st, s, 0.2).shown).toEqual(['interact']);
  });

  it('isVeteran: 예전 안내 · 시계 · 도감 생물 / onboarding 기록이 있으면 아님', () => {
    const base = { hasOnbFlags: false, tutorialSeen: false, envSec: 0, dexIds: [] as string[] };
    expect(isVeteran(base)).toBe(false);
    expect(isVeteran({ ...base, tutorialSeen: true })).toBe(true);
    expect(isVeteran({ ...base, envSec: 900 })).toBe(true);
    expect(isVeteran({ ...base, dexIds: ['v_raft', 'tool_rod'] })).toBe(false);
    expect(isVeteran({ ...base, dexIds: ['f_carp'] })).toBe(true);
    expect(isVeteran({ ...base, tutorialSeen: true, hasOnbFlags: true })).toBe(false);
  });
});

describe('onboarding 글', () => {
  it('[키] → 키캡 조각 + 키 목록 + 괄호 뺀 글', () => {
    const t = parseText('[E] 로 말을 걸거나 [E]·[F]');
    expect(t.keys).toEqual(['E', 'F']);
    expect(t.plain).toBe('E 로 말을 걸거나 E·F');
    expect(t.parts[0]).toEqual({ t: 'key', v: 'E' });
    expect(t.parts[1]).toEqual({ t: 'text', v: ' 로 말을 걸거나 ' });
  });

  it('모든 안내: id 가 겹치지 않고, after 는 있는 id, 글에 키가 있거나 짧다', () => {
    const ids = HINTS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const h of HINTS) {
      for (const a of h.after ?? []) expect(ids).toContain(a);
      expect(h.ttl).toBeGreaterThan(0);
    }
    expect(ids).toEqual(expect.arrayContaining(['move', 'run', 'jump', 'interact', 'fish', 'dive', 'pouch', 'dex', 'sell', 'vehicle', 'cam']));
  });
});
