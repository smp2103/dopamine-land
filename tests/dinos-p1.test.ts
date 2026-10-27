// dinos-p1 — 알 부화 타이머(게임 날)·성장 3단계·목장 칸(+ranch 특전)·리듬 채점·화요일 대이동 일정·티노 물고기 30번·화석 복원기·저장 모양.
import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../src/core/state';
import { stubLocalStorage, ensureBrowserStubs } from './kit/storage';
import { rngFor } from '../src/core/rng';
import { DAY_SEC, HOUR_SEC } from '../src/core/api';
import { DINO_BY_ID, DINO_GOODS, FOSSIL_PIECES } from '../src/modules/dinos/data';
import { ensureFlags } from '../src/modules/dinos/logic';
import {
  nowDays, leftText, HATCH_DAYS, EGG_ITEM, eggLeft, eggReady, eggProgress, rollEggSpecies, EGG_POOL,
  GROW_AT, STAGE_SCALE, ADULT, ageOf, stageOf, growLeft, canRideStage, feedRanch, FEED_BOOST, rideOf, ranchCap, ranchFull, RANCH_BASE, RANCH_PERK,
  TINO_LEGEND, tinoLegend, tinoLeft,
  MIG_WEEKDAY, MIG_FROM, MIG_TO, MIG_LAP_H, migrationActive, migrationAt, migrationHerd, pingpong, witnessReady,
  makeChart, chartLength, judge, pressLane, sweepMisses, applyJudge, newScore, gradeOf, PERFECT_W, GOOD_W, LEAD_IN, LANES, RHYTHM_REWARD,
  thiefSpeed, THIEF_SEC, restorable, missingPieces, bestPartial, type RanchRec, type Note,
} from '../src/modules/dinos/p1logic';

describe('알 부화 — 게임 3일(env 날·시)', () => {
  it('nowDays 는 날 + 시/24 — 시계(env.day·hour)와 같은 눈금', () => {
    expect(nowDays(4, 12)).toBe(4.5);
    expect(nowDays(0, 0)).toBe(0);
    expect(nowDays(2, 24)).toBe(2);          // 24시 = 다음 날 0시로 접는다
    // 한 게임 날 = DAY_SEC 초 = 24 × HOUR_SEC
    expect(DAY_SEC).toBe(24 * HOUR_SEC);
  });

  it('넣은 지 3일이 지나야 깨어난다(2.99일은 아직)', () => {
    const e = { start: nowDays(10, 9) };
    expect(HATCH_DAYS).toBe(3);
    expect(eggReady(e, nowDays(10, 9))).toBe(false);
    expect(eggLeft(e, nowDays(11, 9))).toBeCloseTo(2);
    expect(eggReady(e, nowDays(13, 8.9))).toBe(false);
    expect(eggReady(e, nowDays(13, 9))).toBe(true);
    expect(eggReady(e, nowDays(20, 0))).toBe(true);
    expect(eggProgress(e, nowDays(11, 21))).toBeCloseTo(0.5);
    expect(eggProgress(e, nowDays(30, 0))).toBe(1);
  });

  it('남은 시간 글씨', () => {
    expect(leftText(0)).toBe('지금!');
    expect(leftText(1 / 48)).toBe('곧!');
    expect(leftText(5 / 24)).toBe('5시간');
    expect(leftText(2 + 5 / 24)).toBe('2일 5시간');
    expect(leftText(2)).toBe('2일');
  });

  it('알 종은 결정적으로 굴리고, 하늘·바다·티노는 안 나온다', () => {
    const ids = EGG_POOL.map((d) => d.id);
    expect(ids).not.toContain('z_tino');
    expect(ids).not.toContain('dino-ptera');
    expect(ids).not.toContain('dino-plesio');
    expect(ids).not.toContain('z_mammoth');
    expect(ids).toContain('dino-trike');
    expect(rollEggSpecies(rngFor('dinos:egg:egg1'))).toBe(rollEggSpecies(rngFor('dinos:egg:egg1')));
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(rollEggSpecies(rngFor(`dinos:egg:egg${i}`)));
    expect(seen.size).toBeGreaterThan(8);
    // ★1 이 ★4 보다 흔하다
    let r1 = 0, r4 = 0;
    for (let i = 0; i < 2000; i++) { const r = DINO_BY_ID.get(rollEggSpecies(rngFor(`e:${i}`)))!.rarity; if (r === 1) r1++; if (r === 4) r4++; }
    expect(r1).toBeGreaterThan(r4 * 2);
  });

  it('공룡 알은 가방 아이템으로 등록된다', () => {
    const egg = DINO_GOODS.find((g) => g.id === EGG_ITEM);
    expect(egg?.category).toBe('item');
    expect(egg?.name).toBe('공룡 알');
  });
});

describe('성장 3단계 · 목장', () => {
  const rec = (born: number): RanchRec => ({ uid: 'r1', sp: 'dino-trike', born, boost: 0, stage: 0, fedDay: -1 });

  it('아기(0) → 꼬마(1.5일) → 어른(3일), 어른만 탄다', () => {
    expect(GROW_AT).toEqual([0, 1.5, 3]);
    expect(stageOf(0)).toBe(0);
    expect(stageOf(1.49)).toBe(0);
    expect(stageOf(1.5)).toBe(1);
    expect(stageOf(2.99)).toBe(1);
    expect(stageOf(3)).toBe(ADULT);
    expect(stageOf(40)).toBe(ADULT);
    expect(canRideStage(1)).toBe(false);
    expect(canRideStage(ADULT)).toBe(true);
    expect(STAGE_SCALE[0]).toBeLessThan(STAGE_SCALE[1]);
    expect(STAGE_SCALE[ADULT]).toBe(1);
    const r = rec(nowDays(5, 0));
    expect(stageOf(ageOf(r, nowDays(6, 12)))).toBe(1);
    expect(growLeft(ageOf(r, nowDays(6, 12)))).toBeCloseTo(1.5);
    expect(growLeft(10)).toBe(0);
  });

  it('밥은 하루 한 번만 성장 보너스(+0.25일)', () => {
    const r = rec(0);
    expect(feedRanch(r, 3)).toBe(true);
    expect(feedRanch(r, 3)).toBe(false);
    expect(r.boost).toBeCloseTo(FEED_BOOST);
    expect(feedRanch(r, 4)).toBe(true);
    expect(ageOf(r, 1)).toBeCloseTo(1.5);   // 1일 + 0.5 보너스 = 꼬마
    expect(stageOf(ageOf(r, 1))).toBe(1);
  });

  it('탑승 값: 탈것 공룡은 자기 값, 나머지는 크기·빠르기로', () => {
    expect(rideOf(DINO_BY_ID.get('dino-galli')!)).toMatchObject({ walk: 8, run: 16, mode: 'land' });
    const r = rideOf(DINO_BY_ID.get('dino-brachio')!);
    expect(r.run).toBeGreaterThan(r.walk);
    expect(r.walk).toBeGreaterThan(4);
  });

  it("목장 칸: 기본 4, 'ranch' 특전 +4", () => {
    expect(ranchCap(false)).toBe(RANCH_BASE);
    expect(ranchCap(true)).toBe(RANCH_BASE + RANCH_PERK);
    expect(ranchCap(true)).toBe(8);
    expect(ranchFull(4, false)).toBe(true);
    expect(ranchFull(4, true)).toBe(false);
    expect(ranchFull(8, true)).toBe(true);
  });
});

describe('티노 — 물고기 선물 30번', () => {
  it('29번은 아직, 30번이면 전설의 친구', () => {
    expect(TINO_LEGEND).toBe(30);
    expect(tinoLegend(29)).toBe(false);
    expect(tinoLegend(30)).toBe(true);
    expect(tinoLegend(31)).toBe(true);
    expect(tinoLeft(0)).toBe(30);
    expect(tinoLeft(27)).toBe(3);
    expect(tinoLeft(45)).toBe(0);
  });
});

describe('화요일 대이동 일정', () => {
  it('화요일(weekday 1) 7~19시에만', () => {
    expect(MIG_WEEKDAY).toBe(1);
    expect(migrationActive(1, 12)).toBe(true);
    expect(migrationActive(1, MIG_FROM)).toBe(true);
    expect(migrationActive(1, MIG_FROM - 0.01)).toBe(false);
    expect(migrationActive(1, MIG_TO)).toBe(false);
    for (const wd of [0, 2, 3, 4, 5, 6]) expect(migrationActive(wd, 12)).toBe(false);
    // 게임 날 → weekday = day % 7
    for (let day = 0; day < 21; day++) expect(migrationActive(day % 7, 10)).toBe(day % 7 === 1);
  });

  it("calendar 의 weekday-event 'migration' 이 이긴다(시각 창은 그대로)", () => {
    expect(migrationActive(3, 12, true)).toBe(true);
    expect(migrationActive(1, 12, false)).toBe(false);
    expect(migrationActive(3, 22, true)).toBe(false);
  });

  it('무리는 길을 왕복하고 뒤 공룡은 줄 간격만큼 늦게 따라온다', () => {
    expect(pingpong(0)).toBe(0); expect(pingpong(0.5)).toBe(0.5); expect(pingpong(1)).toBe(1); expect(pingpong(1.5)).toBe(0.5); expect(pingpong(2)).toBe(0);
    const L = 400;
    const a = migrationAt(MIG_FROM, 0, L);
    expect(a.s).toBe(0); expect(a.dir).toBe(1);
    const mid = migrationAt(MIG_FROM + MIG_LAP_H / 2, 0, L);
    expect(mid.s).toBeCloseTo(0.5);
    const back = migrationAt(MIG_FROM + MIG_LAP_H * 1.5, 0, L);
    expect(back.s).toBeCloseTo(0.5); expect(back.dir).toBe(-1);
    const lead = migrationAt(MIG_FROM + 1, 0, L), tail = migrationAt(MIG_FROM + 1, 3, L);
    expect(lead.s - tail.s).toBeCloseTo((3 * 6.5) / L);
  });

  it('무리 구성은 날마다 결정적, 큰 목길이가 앞장선다', () => {
    const h1 = migrationHerd(rngFor('dinos:mig:8')), h2 = migrationHerd(rngFor('dinos:mig:8'));
    expect(h1).toEqual(h2);
    expect(h1).toHaveLength(9);
    expect(['dino-brachio', 'z_apatosaurus']).toContain(h1[0]);
    for (const id of h1) expect(DINO_BY_ID.has(id)).toBe(true);
  });

  it('목격 보너스는 하루 한 번', () => {
    expect(witnessReady(-1, 8)).toBe(true);
    expect(witnessReady(8, 8)).toBe(false);
    expect(witnessReady(8, 15)).toBe(true);
  });
});

describe('나팔이 리듬 놀이 채점', () => {
  it('판정 창: 완벽 ≤ 0.09 s, 좋아 ≤ 0.18 s', () => {
    expect(judge(0)).toBe('perfect');
    expect(judge(-PERFECT_W)).toBe('perfect');
    expect(judge(0.12)).toBe('good');
    expect(judge(-GOOD_W)).toBe('good');
    expect(judge(0.2)).toBe('miss');
  });

  it('악보는 날마다 결정적, 첫 음표는 준비 시간 뒤, 시간 순서', () => {
    const c1 = makeChart(rngFor('dinos:rhythm:3')), c2 = makeChart(rngFor('dinos:rhythm:3'));
    expect(c1).toEqual(c2);
    expect(c1.length).toBeGreaterThanOrEqual(16);
    expect(c1[0].t).toBeGreaterThanOrEqual(LEAD_IN);
    for (let i = 1; i < c1.length; i++) expect(c1[i].t).toBeGreaterThan(c1[i - 1].t);
    for (const n of c1) expect(n.lane).toBeGreaterThanOrEqual(0), expect(n.lane).toBeLessThan(LANES);
    // 같은 줄 세 번 연속은 없다
    for (let i = 2; i < c1.length; i++) expect(c1[i].lane === c1[i - 1].lane && c1[i].lane === c1[i - 2].lane).toBe(false);
    expect(chartLength(c1)).toBeGreaterThan(c1[c1.length - 1].t);
    expect(makeChart(rngFor('dinos:rhythm:4'))).not.toEqual(c1);
  });

  it('점수: 완벽 100 · 좋아 50 · 10콤보마다 +10, 놓치면 콤보 0', () => {
    const s = newScore();
    for (let i = 0; i < 9; i++) applyJudge(s, 'perfect');
    expect(s.score).toBe(900);
    expect(applyJudge(s, 'perfect')).toBe(110);  // 10콤보
    expect(applyJudge(s, 'good')).toBe(60);
    expect(s.combo).toBe(11);
    applyJudge(s, 'miss');
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(11);
    expect(s).toMatchObject({ perfect: 10, good: 1, miss: 1 });
  });

  it('누르면 그 줄 가장 가까운 음표를 치고, 지나간 음표는 놓침', () => {
    const notes: Note[] = [{ t: 3, lane: 0 }, { t: 3.5, lane: 1 }, { t: 4, lane: 0 }];
    expect(pressLane(notes, 2, 3)).toBeNull();                  // 그 줄엔 음표 없음
    expect(pressLane(notes, 0, 3.05)?.judge).toBe('perfect');
    expect(pressLane(notes, 0, 3.05)).toBeNull();               // 이미 쳤다
    expect(pressLane(notes, 0, 3.86)?.judge).toBe('good');      // 4.0 음표
    const miss = sweepMisses(notes, 3.75);
    expect(miss.map((n) => n.t)).toEqual([3.5]);
    expect(notes[1].hit).toBe('miss');
  });

  it('등급: 정확도(완벽 + 좋아×½)로 S~C, 보상은 등급 순서', () => {
    const s = newScore();
    s.perfect = 20; expect(gradeOf(s, 20).grade).toBe('S');
    s.perfect = 14; s.good = 4; expect(gradeOf(s, 20)).toMatchObject({ grade: 'A', acc: 0.8 });
    s.perfect = 8; s.good = 4; expect(gradeOf(s, 20).grade).toBe('B');
    s.perfect = 2; s.good = 2; expect(gradeOf(s, 20).grade).toBe('C');
    expect(gradeOf(newScore(), 0).grade).toBe('C');
    expect(RHYTHM_REWARD.S.coins).toBeGreaterThan(RHYTHM_REWARD.A.coins);
    expect(RHYTHM_REWARD.A.coins).toBeGreaterThan(RHYTHM_REWARD.B.coins);
    expect(RHYTHM_REWARD.S.stars).toBeGreaterThan(0);
  });
});

describe('알도둑 · 화석 복원기', () => {
  it('알도둑은 처음엔 빠르다가 지쳐서 플레이어(달리기 9.5)보다 느려진다', () => {
    expect(thiefSpeed(0)).toBeGreaterThan(thiefSpeed(8));
    expect(thiefSpeed(8)).toBe(thiefSpeed(20));
    expect(thiefSpeed(0)).toBeLessThan(9.5);
    expect(THIEF_SEC).toBeGreaterThan(10);
  });

  it('세 조각이 다 있는 공룡만 복원할 수 있다', () => {
    const trike = FOSSIL_PIECES.filter((f) => f.dino === 'triceratops').map((f) => f.id);
    expect(trike).toHaveLength(3);
    const bag: Record<string, number> = { [trike[0]]: 1, [trike[1]]: 2 };
    expect(restorable(bag)).toEqual([]);
    expect(missingPieces(bag, 'triceratops')).toEqual([trike[2]]);
    expect(bestPartial(bag)).toEqual({ dino: 'triceratops', have: 2 });
    bag[trike[2]] = 1;
    expect(restorable(bag)).toEqual(['triceratops']);
    expect(bestPartial({})).toBeNull();
  });
});

describe('저장(flags.dino P1 칸)', () => {
  beforeEach(() => { ensureBrowserStubs('?fresh=0'); stubLocalStorage(); });

  it('깨진 알·모르는 종은 버리고, 저장 왕복해도 그대로', () => {
    const f = ensureFlags({
      eggs: [
        { uid: 'egg1', sp: 'dino-trike', where: 'hatchery', slot: '0', start: 4.5 },
        { uid: 'egg2', sp: 'nope', where: 'hatchery', slot: '1', start: 1 },
        { uid: 'egg3', sp: 'dino-proto', where: 'oven', slot: '1', start: 1 },
        'junk',
      ],
      ranch: [{ uid: 'r9', sp: 'z_iguanodon', born: 2, boost: 0.25, stage: 7 }, { uid: 'x', sp: 'dino-trike' }],
      tinoFish: 12,
    });
    expect(f.eggs.map((e) => e.uid)).toEqual(['egg1']);
    expect(f.eggN).toBeGreaterThanOrEqual(1);
    expect(f.ranch).toHaveLength(1);
    expect(f.ranch[0]).toMatchObject({ uid: 'r9', stage: ADULT, fedDay: -1, boost: 0.25 });
    expect(f.migDay).toBe(-1);
    expect(f.tinoLegend).toBe(false);
    expect(f.restored).toEqual([]);

    const st = new GameState();
    st.flags.dino = f;
    f.tinoLegend = true;
    st.saveNow();
    const st2 = new GameState();
    st2.load();
    const g = ensureFlags(st2.flags.dino);
    expect(g.eggs).toEqual(f.eggs);
    expect(g.ranch).toEqual(f.ranch);
    expect(g.tinoLegend).toBe(true);
    expect(g.tinoFish).toBe(12);
  });

  it('부화장 칸이 틀리거나 겹친 알은 빈 칸으로 옮기고, 빈 칸이 없으면 버린다(부화기 알은 그대로)', () => {
    const f = ensureFlags({
      eggs: [
        { uid: 'egg1', sp: 'dino-trike', where: 'hatchery', slot: '0', start: 1 },
        { uid: 'egg2', sp: 'dino-trike', where: 'hatchery', slot: '3', start: 1 },
        { uid: 'egg3', sp: 'dino-trike', where: 'hatchery', slot: '0', start: 1 },
        { uid: 'egg4', sp: 'dino-trike', where: 'hatchery', slot: '-1', start: 1 },
        { uid: 'egg5', sp: 'dino-trike', where: 'incubator', slot: 'f_inc_7', start: 1 },
      ],
    });
    const hs = f.eggs.filter((e) => e.where === 'hatchery');
    expect(hs.map((e) => e.slot).sort()).toEqual(['0', '1', '2']);
    expect(hs.map((e) => e.uid)).toEqual(['egg1', 'egg2', 'egg3']);
    expect(f.eggs.find((e) => e.uid === 'egg5')?.slot).toBe('f_inc_7');
  });
});
