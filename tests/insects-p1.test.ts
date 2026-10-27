// 곤충 P1 규칙(insects/p1.ts) — 씨름 판정·상금, 반딧불 군무 박자 맞추기, 난초사마귀 1.5m 들통, 반딧불 놓아주기 이벤트.
import { describe, it, expect, beforeEach } from 'vitest';
import * as P from '../src/modules/insects/p1';
import { INSECTS, insectOf } from '../src/modules/insects/data';
import { makeFakeGame, recordEvents, resetKit } from './kit/fakeGame';
import { rngFor } from '../src/core/rng';
import * as Island from '../src/core/island';
import { zoneAt } from '../src/modules/worldterrain/zones';
import { seedLandmarks } from '../src/modules/worldterrain/geo';

beforeEach(() => resetKit());

const sp = (gdd: string) => {
  const s = insectOf(gdd);
  if (!s) throw new Error(`종 없음: ${gdd}`);
  return s as unknown as P.P1Species;
};
const byId = (id: string) => insectOf(id) as unknown as P.P1Species | undefined;
/** 늘 같은 값 */
const fixed = (v: number) => () => v;

describe('곤충 씨름 — 능력치(★·크기)', () => {
  it('★ 가 높을수록, 같은 종이면 클수록 힘이 세다', () => {
    const rhino = sp('b_rhino_beetle'), herc = sp('b_hercules'), lady = sp('b_ladybug');
    expect(P.sumoStats(herc).power).toBeGreaterThan(P.sumoStats(rhino).power);
    expect(P.sumoStats(rhino).power).toBeGreaterThan(P.sumoStats(lady).power);
    const small = P.sumoStats(rhino, rhino.cm![0]);
    const big = P.sumoStats(rhino, rhino.cm![1]);
    expect(big.power).toBeGreaterThan(small.power);
    expect(small.sizeK).toBeCloseTo(0.85, 6);
    expect(big.sizeK).toBeCloseTo(1.15, 6);
    // 크기를 모르면 보통(1)
    expect(P.sumoStats(rhino).sizeK).toBe(1);
  });
  it('왕관 변이 ×1.2, 꼬마 ×0.8', () => {
    const rhino = sp('b_rhino_beetle');
    const base = P.sumoStats(rhino).power;
    expect(P.sumoStats(rhino, null, 'crown').power).toBeCloseTo(base * 1.2, 6);
    expect(P.sumoStats(rhino, null, 'tiny').power).toBeCloseTo(base * 0.8, 6);
  });
  it('딱정벌레 무리만 씨름에 나간다(나비·반딧불은 안 됨)', () => {
    expect(P.canSumo(sp('b_rhino_beetle'))).toBe(true);
    expect(P.canSumo(sp('b_stag_beetle'))).toBe(true);
    expect(P.canSumo(sp('b_cabbage_white'))).toBe(false);
    expect(P.canSumo(sp('b_firefly'))).toBe(false);
  });
  it('가방에서 가장 센 딱정벌레를 고른다(변이 키 포함)', () => {
    const rhino = sp('b_rhino_beetle'), stag = sp('b_stag_beetle');
    const bag = { [stag.id]: 1, [rhino.id]: 2, [`${rhino.id}@crown`]: 1, 'bug-firefly': 3 };
    const best = P.bestFighter(bag, byId, () => null)!;
    expect(best.key).toBe(`${rhino.id}@crown`);
    expect(P.bestFighter({ 'bug-firefly': 3 }, byId, () => null)).toBeNull();
  });
});

describe('곤충 씨름 — 박자 판정과 승부', () => {
  it('박자 차이 → 딱 좋아/좋아/놓쳤다', () => {
    expect(P.tapGrade(0)).toBe('perfect');
    expect(P.tapGrade(-P.SUMO.perfect)).toBe('perfect');
    expect(P.tapGrade(P.SUMO.perfect + 0.01)).toBe('good');
    expect(P.tapGrade(-P.SUMO.good)).toBe('good');
    expect(P.tapGrade(P.SUMO.good + 0.01)).toBe('miss');
  });
  it('가장 가까운 박자 번호', () => {
    expect(P.nearestBeat(10 + P.SUMO.beat * 3 + 0.02, 10)).toEqual({ k: 3, dt: expect.closeTo(0.02, 6) });
    expect(P.nearestBeat(10, 10).k).toBe(1);
  });
  it('같은 상대에 박자를 다 맞추면 밀어내서 이기고, 다 놓치면 밀려서 진다', () => {
    const me = P.sumoStats(sp('b_rhino_beetle'));
    const opp = P.sumoStats(sp('b_stag_beetle'));
    const win = P.runBout(me, opp, ['perfect'], fixed(1));
    expect(win.over).toBe(true);
    expect(win.result).toBe('win');
    expect(win.pos).toBe(1);
    expect(win.beat).toBeLessThan(P.SUMO.beats);
    const lose = P.runBout(me, opp, ['miss'], fixed(0.5));
    expect(lose.result).toBe('lose');
    expect(lose.pos).toBe(-1);
  });
  it('연속 딱 좋아! 3번째에 필살 들어올리기(×1.6)', () => {
    const me = P.sumoStats(sp('b_rhino_beetle'));
    const opp = P.sumoStats(sp('b_hercules'));
    let b = P.newBout(me, opp);
    b = P.sumoStep(b, 'perfect', fixed(0));
    b = P.sumoStep(b, 'perfect', fixed(0));
    expect(b.last!.lift).toBe(false);
    b = P.sumoStep(b, 'perfect', fixed(0));
    expect(b.last!.lift).toBe(true);
    expect(b.last!.my).toBeCloseTo(me.power * 1.15 * 1.6, 6);
    // 놓치면 콤보가 끊긴다
    b = P.sumoStep(b, 'miss', fixed(0));
    expect(b.combo).toBe(0);
  });
  it('박자가 다 지나면 위치로 판정(가운데 띠는 비김), 끝난 판은 더 안 움직인다', () => {
    expect(P.sumoJudge(0.3)).toBe('win');
    expect(P.sumoJudge(-0.3)).toBe('lose');
    expect(P.sumoJudge(0)).toBe('draw');
    expect(P.sumoJudge(P.SUMO.drawBand)).toBe('draw');
    // 똑같은 두 선수 · 좋아! 만 · 상대는 늘 평균(0.5) → 16박자 안에 못 끝내도 판정이 난다
    const me = P.sumoStats(sp('b_stag_beetle'));
    const b = P.runBout(me, me, ['good'], fixed(0.5));
    expect(b.over).toBe(true);
    expect(b.beat).toBeLessThanOrEqual(P.SUMO.beats);
    expect(['win', 'lose', 'draw']).toContain(b.result);
    const after = P.sumoStep(b, 'perfect', fixed(0));
    expect(after).toBe(b);
  });
  it('상금: 이기면 코인(★·연승) + 별(하루 5승까지, 대장 3), 지면 참가상', () => {
    expect(P.sumoReward('win', 3, 0, 0)).toEqual({ coins: 360, stars: 1 });
    expect(P.sumoReward('win', 3, 2, 0).coins).toBe(430);
    expect(P.sumoReward('win', 3, 0, 0, true)).toEqual({ coins: 540, stars: 3 });
    expect(P.sumoReward('win', 2, 0, P.SUMO.starWinsPerDay).stars).toBe(0);
    expect(P.sumoReward('draw', 5, 3, 0)).toEqual({ coins: 40, stars: 0 });
    expect(P.sumoReward('lose', 5, 3, 0)).toEqual({ coins: 15, stars: 0 });
  });
  it('상대: 내 ★ 근처, 네 판째는 마을 씨름 대장(대장뿔장수풍뎅이)', () => {
    const me = P.sumoStats(sp('b_rhino_beetle'));
    const pool = INSECTS as unknown as P.P1Species[];
    const o = P.sumoOpponent(pool, me, 0, rngFor('t'))!;
    expect(P.canSumo(o.sp)).toBe(true);
    expect(Math.abs(o.sp.rarity - (me.rarity - 1))).toBeLessThanOrEqual(1);
    expect(P.isChampionBout(3)).toBe(true);
    expect(P.isChampionBout(0)).toBe(false);
    const boss = P.sumoOpponent(pool, me, 0, rngFor('t'), true)!;
    expect(boss.sp.gdd).toBe('b_rhino_beetle');
    expect(boss.champion).toBe(true);
  });
  it('하루가 바뀌면 오늘 승수만 0 으로(연승·총 승수는 남는다)', () => {
    const f: P.InsectFlags = { released: 0, sumo: { day: 1, wins: 4, streak: 4, total: 9, best: 4, bouts: 6 } };
    const s = P.sumoFlags(f, 2);
    expect(s).toMatchObject({ day: 2, wins: 0, streak: 4, total: 9 });
  });
});

describe('반딧불 군무 — 박자 맞추기', () => {
  it('처음엔 제각각 깜빡이다가 15초쯤이면 30마리가 같이 반짝', () => {
    const flies = P.danceFlies(P.DANCE.n, P.DANCE.radius, rngFor('dance'));
    expect(flies).toHaveLength(30);
    const at = (age: number, t: number) => flies.map((f) => P.dancePhase(f.off0, age, t));
    const early = P.phaseSpread(at(0, 100));
    const late = P.phaseSpread(at(30, 130));
    expect(early).toBeGreaterThan(0.3);
    expect(late).toBeLessThan(0.01);
    // 같은 위상이면 밝기도 같다 — 동시에 반짝
    const t = 130 + P.DANCE.period * 0.1;
    const ks = flies.map((f) => P.flashOf(P.dancePhase(f.off0, 30, t)));
    expect(Math.max(...ks) - Math.min(...ks)).toBeLessThan(0.05);
    expect(Math.min(...ks)).toBeGreaterThan(0.5);
  });
  it('흩어짐은 시간이 갈수록 줄어든다(단조)', () => {
    const flies = P.danceFlies(30, 7, rngFor('mono'));
    let prev = Infinity;
    for (const age of [0, 2, 5, 10, 20]) {
      const s = P.phaseSpread(flies.map((f) => P.dancePhase(f.off0, age, 50 + age)));
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });
  it('깜빡: 주기 앞쪽만 켜지고 나머지는 은은한 불빛', () => {
    expect(P.flashOf(P.DANCE.flash / 2)).toBeCloseTo(1, 6);
    expect(P.flashOf(0.7)).toBe(P.DANCE.ember);
    expect(P.flashOf(1.15)).toBeCloseTo(P.flashOf(0.15), 9);
  });
  it('밤에만, 목요일엔 대축제(90마리) + 놓아준 반딧불이 합류', () => {
    expect(P.danceTime('night', 23)).toBe(true);
    expect(P.danceTime('sunset', 20.5)).toBe(true);
    expect(P.danceTime('sunset', 18)).toBe(false);
    expect(P.danceTime('day', 12)).toBe(false);
    expect(P.festivalOn(3, false)).toBe(true);
    expect(P.festivalOn(2, true)).toBe(true);
    expect(P.festivalOn(2, false)).toBe(false);
    expect(P.danceCount(false)).toBe(30);
    expect(P.danceCount(true)).toBe(90);
    expect(P.danceCount(false, 9)).toBe(33);
    expect(P.danceCount(false, 9999)).toBe(30 + P.DANCE.releaseBonusMax);
  });
  it('같은 rng 면 같은 군무(결정적), 모두 반경 안', () => {
    const a = P.danceFlies(30, 7, rngFor('same')), b = P.danceFlies(30, 7, rngFor('same'));
    expect(a).toEqual(b);
    for (const f of a) expect(Math.hypot(f.hx, f.hz)).toBeLessThanOrEqual(7 * 1.11);
  });
});

describe('난초사마귀 — 1.5m 안에서 들통', () => {
  it('난초사마귀만 위장 대상', () => {
    expect(P.isOrchid(sp('b_orchid_mantis'))).toBe(true);
    expect(P.isOrchid(sp('b_cabbage_white'))).toBe(false);
  });
  it('1.5m 밖은 꽃인 척, 안이면 도망(움직임과 상관없이)', () => {
    expect(P.ORCHID.reveal).toBe(1.5);
    expect(P.orchidReveals(1.6)).toBe(false);
    expect(P.orchidReveals(1.5)).toBe(false);
    expect(P.orchidReveals(1.49)).toBe(true);
    expect(P.orchidReveals(0)).toBe(true);
    expect(P.orchidReveals(NaN)).toBe(false);
  });
  it('위장 안내 글엔 이름이 안 나온다(아는 종이면 힌트만)', () => {
    expect(P.orchidPrompt(false)).not.toContain('난초사마귀');
    expect(P.orchidPrompt(true)).toContain('수상한 꽃');
  });
});

describe('반딧불 놓아주기 — release 이벤트', () => {
  it('가방에서 반딧불 한 묶음을 빼고 released 를 올리고 release {species, n, where} 를 보낸다', () => {
    const g = makeFakeGame({ load: false });
    const rec = recordEvents(g);
    const fly = sp('b_firefly');
    g.state.addItem(fly.id, 4);
    g.state.addItem('bug-firefly@shiny', 1);
    const r = P.releaseFireflies(g.state as unknown as P.ReleaseSink, byId, 'mushroom')!;
    expect(r).toMatchObject({ species: 'b_firefly', n: 4, where: 'mushroom', total: 4, id: fly.id });
    expect(g.state.bag[fly.id] ?? 0).toBe(0);
    // 반짝이 변이는 아껴 둔다
    expect(g.state.bag['bug-firefly@shiny']).toBe(1);
    expect((g.state.flags.insects as P.InsectFlags).released).toBe(4);
    const ev = rec.of('release');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toEqual({ type: 'release', species: 'b_firefly', n: 4, where: 'mushroom' });
    rec.off();
  });
  it('여러 번 놓아주면 누적, 다른 반딧불(늪 깜빡이)도 GDD id 로', () => {
    const g = makeFakeGame({ load: false });
    const rec = recordEvents(g);
    const swarm = sp('b_firefly_swarm');
    g.state.addItem(swarm.id, 10);
    g.state.flags.insects = { released: 25 };
    const r = P.releaseFireflies(g.state as unknown as P.ReleaseSink, byId, 'home', 6)!;
    expect(r).toMatchObject({ species: 'b_firefly_swarm', n: 6, total: 31 });
    expect(g.state.bag[swarm.id]).toBe(4);
    expect(rec.of('release')[0]).toMatchObject({ species: 'b_firefly_swarm', n: 6, where: 'home' });
    rec.off();
  });
  it('말랑섬 반딧불이부터, 여왕(★5)은 놓아주지 않는다', () => {
    const bag = { [sp('b_firefly_swarm').id]: 2, [sp('b_firefly').id]: 1, [sp('b_firefly_queen').id]: 1 };
    expect(P.pickRelease(bag, byId)).toMatchObject({ species: 'b_firefly', n: 1 });
    expect(P.pickRelease({ [sp('b_firefly_queen').id]: 1 }, byId)).toBeNull();
  });
  it('놓아줄 게 없으면 아무것도 안 바뀐다', () => {
    const g = makeFakeGame({ load: false });
    const rec = recordEvents(g);
    g.state.addItem(sp('b_rhino_beetle').id, 1);
    expect(P.releaseFireflies(g.state as unknown as P.ReleaseSink, byId, 'home')).toBeNull();
    expect(rec.of('release')).toHaveLength(0);
    expect(g.state.flags.insects).toBeUndefined();
    rec.off();
  });
});

describe('쇠똥구리 따라가기', () => {
  const path: P.DungPath = { sx: 0, sz: 0, ex: 20, ez: 0, bend: 2, len: 20 };
  it('다가가면 굴리기 시작, 뒤처지면 기다리고, 끝에 닿으면 도착', () => {
    let s: P.DungState = { k: 0, phase: 'wait' };
    s = P.dungStep(s, path, 20, 1);
    expect(s.phase).toBe('wait');
    s = P.dungStep(s, path, 5, 1);
    expect(s.phase).toBe('roll');
    s = P.dungStep(s, path, 3, 2);
    expect(s.k).toBeCloseTo((P.DUNG.speed * 2) / 20, 6);
    const k0 = s.k;
    s = P.dungStep(s, path, 15, 2);
    expect(s.phase).toBe('pause');
    expect(s.k).toBe(k0);
    for (let i = 0; i < 40 && s.phase !== 'arrived'; i++) s = P.dungStep(s, path, 2, 1);
    expect(s).toEqual({ k: 1, phase: 'arrived' });
  });
  it('길은 끝점을 지나고 가운데서 옆으로 휜다', () => {
    expect(P.dungPoint(path, 0)).toEqual({ x: 0, z: 0 });
    const e = P.dungPoint(path, 1);
    expect(e.x).toBeCloseTo(20, 9); expect(e.z).toBeCloseTo(0, 9);
    expect(Math.abs(P.dungPoint(path, 0.5).z)).toBeCloseTo(2, 9);
  });
  it('planDung: 괜찮은 땅에서만, 같은 rng 면 같은 길', () => {
    const ok = (x: number) => x > -100;
    const a = P.planDung({ x: 0, z: 0 }, 40, rngFor('d'), ok)!;
    const b = P.planDung({ x: 0, z: 0 }, 40, rngFor('d'), ok)!;
    expect(a).toEqual(b);
    expect(a.len).toBeGreaterThanOrEqual(P.DUNG.trip[0]);
    expect(a.len).toBeLessThanOrEqual(P.DUNG.trip[1]);
    expect(P.planDung({ x: 0, z: 0 }, 40, rngFor('d'), () => false)).toBeNull();
  });
  it('섬마다 하루 한 번', () => {
    const f: P.InsectFlags = { released: 0 };
    expect(P.dungDoneToday(f, 'dino', 3)).toBe(false);
    P.markDung(f, 'dino', 3);
    expect(P.dungDoneToday(f, 'dino', 3)).toBe(true);
    expect(P.dungDoneToday(f, 'dino', 4)).toBe(false);
    expect(P.dungDoneToday(f, 'desert', 3)).toBe(false);
    expect(P.dungHour(8)).toBe(true);
    expect(P.dungHour(20)).toBe(false);
  });
});

describe('쇠똥구리 — 진짜 지형에서 자리 찾기(두 곳 다)', () => {
  // 게임과 같은 규칙: 마른 땅·완만한 비탈 + 진짜 구역표
  const dryOk = (x: number, z: number) => {
    const s = Island.surfaceAt(x, z);
    if (s.kind === 'sea' || s.kind === 'river' || s.kind === 'cliff' || s.kind === 'lava') return false;
    const y = Island.heightAt(x, z);
    if (Island.waterLevelAt(x, z) > y - 0.1) return false;
    const e = 0.8;
    const sl = Math.hypot(Island.heightAt(x + e, z) - Island.heightAt(x - e, z), Island.heightAt(x, z + e) - Island.heightAt(x, z - e)) / (2 * e);
    return sl <= 0.32;
  };
  const pyramid = { id: 'lm:desert:pyramid', kind: 'pyramid', name: '피라미드', island: 'desert', x: 2272, z: 816, r: 30 };
  const lms = [...seedLandmarks(), pyramid];
  const w: P.DungWorld = {
    islandById: (id) => Island.islandById(id), islandAt: (x, z) => Island.islandAt(x, z),
    zoneAt: (x, z) => zoneAt(x, z, lms), dryOk, landmarks: lms,
  };
  it('공룡섬(목장)·사막(유적) 모두 며칠이 지나도 길이 나온다 — 출발점은 그 구역', () => {
    for (const isl of Object.keys(P.DUNG_SITES)) {
      let cache: Array<{ x: number; z: number }> | null = null;
      const cells = () => (cache ??= P.zoneCellsOf(w, isl, P.DUNG_SITES[isl].zone, Island.islandById(isl)!));
      for (const day of [0, 1, 2, 7]) {
        const got = P.planDungSite(w, isl, rngFor(`insects:dung:${isl}:${day}`), cells);
        expect(got, `${isl} ${day}일`).not.toBeNull();
        expect(got).not.toBe('pending');
        const path = got as P.DungPath;
        expect(zoneAt(path.sx, path.sz, lms).zone, `${isl} 출발 구역`).toBe(P.DUNG_SITES[isl].zone);
        expect(Island.islandAt(path.ex, path.ez)?.id).toBe(isl);
      }
    }
  });
  it('구역 훑기는 조금씩 나눠 해도 한 번에 한 것과 같다 + 훑는 중이면 pending', () => {
    const near = Island.islandById('desert')!;
    const sc = P.newZoneScan(w, 'desert', 'ruin', near);
    let k = 0;
    while (!P.stepZoneScan(sc, w, 40)) k++;
    expect(k).toBeGreaterThan(10);
    expect(sc.cells).toEqual(P.zoneCellsOf(w, 'desert', 'ruin', near));
    expect(sc.cells.length).toBeGreaterThan(0);
    const sc2 = P.newZoneScan(w, 'desert', 'ruin', near);
    // 피라미드 둘레엔 유적 구역이 없으니 훑기 칸을 기다린다
    const res = P.planDungSite(w, 'desert', rngFor('insects:dung:desert:0'), () => (sc2.done ? sc2.cells : null));
    expect(res).toBe('pending');
  });
});
