// 잡기 굴림(economy/roll.ts) — GDD 5.2/5.3 통계·천장·오늘 첫 잡기·날씨·해금·태그·결정성·쓰레기·크기 변이.
import { describe, it, expect } from 'vitest';
import {
  rollCatch, commitCatch, newRollState, catchFail, pityGauge, comboBonus, rarityWeights,
  JUNK_TABLE, RARITY_W, type RollSpecies, type RollEnv, type RollState, type RollQuery,
} from '../src/modules/economy/roll';

// 시드 고정 난수(테스트 전용 — core/rng 와 같은 mulberry32)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const rngFor = (k: string) => mulberry32(hash(k));

/** 희귀도마다 len 이 있는 종 2마리씩 */
const POOL: RollSpecies[] = [1, 2, 3, 4, 5].flatMap(r => [
  { id: `f${r}a`, rarity: r, len: 30 },
  { id: `f${r}b`, rarity: r, len: 30 },
]);

const env = (o: Partial<RollEnv> = {}): RollEnv => ({
  day: 1, hour: 12, tod: 'day', weather: 'clear', p0: true, rng: rngFor, ...o,
});

/** 천장·콤보·오늘 첫 잡기를 끈 채(매번 초기화) 순수 가중치만 n 번 굴린다 */
function pureRolls(n: number, q: Partial<RollQuery> = {}, e: RollEnv = env()) {
  const s = newRollState();
  const hist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const out = [];
  for (let i = 0; i < n; i++) {
    s.pity = {}; s.combo = 0; s.firstDay.fish = e.day;
    const r = rollCatch({ activity: 'fish', pool: POOL, ...q }, s, e);
    hist[r.rarity]++;
    out.push(r);
  }
  return { hist, out };
}

describe('희귀도 분포', () => {
  it('미끼 없이 1만 번 ≈ 55/27/12/5/1', () => {
    const N = 10000;
    const { hist } = pureRolls(N);
    const exp = [0, 0.55, 0.27, 0.12, 0.05, 0.01];
    for (const r of [1, 2, 3, 4, 5]) expect(Math.abs(hist[r] / N - exp[r])).toBeLessThan(r === 5 ? 0.004 : 0.015);
    expect(RARITY_W).toEqual({ 1: 55, 2: 27, 3: 12, 4: 5, 5: 1 });
  });

  it('미끼가 희귀도를 끌어올린다(떡밥·루어·황금)', () => {
    const N = 10000;
    const base = pureRolls(N).hist;
    const dough = pureRolls(N, { bait: 'bait_dough' }).hist;
    const lure = pureRolls(N, { bait: 'bait_lure' }).hist;
    const gold = pureRolls(N, { bait: 'bait_golden' }).hist;
    // 떡밥: ★2+ ×1.3 → ★1 비율 55/(55+45×1.3)=0.485
    expect(Math.abs(dough[1] / N - 55 / (55 + 45 * 1.3))).toBeLessThan(0.015);
    // 루어: ★3+ ×1.5 → ★3+ 비율 27/(82+27)=0.248
    const hi = (h: Record<number, number>) => h[3] + h[4] + h[5];
    expect(Math.abs(hi(lure) / N - 27 / 109.5)).toBeLessThan(0.015);
    expect(hi(lure)).toBeGreaterThan(hi(base));
    // 황금: ★5 ×3 → 3/102
    expect(Math.abs(gold[5] / N - 3 / 102)).toBeLessThan(0.006);
    expect(gold[5]).toBeGreaterThan(base[5] * 2);
  });

  it('버프·콤보 배율', () => {
    const w = rarityWeights(undefined, ['grilled_fish', 'friend'], 0);
    expect(w[1]).toBe(55); expect(w[2]).toBe(27);
    expect(w[3]).toBeCloseTo(12 * 1.2 * 1.1);
    expect(comboBonus(4)).toBe(0);
    expect(comboBonus(5)).toBeCloseTo(0.1);
    expect(comboBonus(30)).toBeCloseTo(0.2);
    expect(rarityWeights(undefined, [], 12)[4]).toBeCloseTo(5 * 1.2);
  });
});

describe('천장(5.3)', () => {
  it('★3+ 없이 20번 연속은 없다, ★5 는 400번 안에 나온다', () => {
    const s = newRollState();
    const e = env();
    let no3 = 0, no5 = 0, max3 = 0, max5 = 0, hits = 0;
    for (let i = 0; i < 20000; i++) {
      s.firstDay.fish = e.day; s.combo = 0;
      const r = rollCatch({ activity: 'fish', pool: POOL }, s, e);
      no3 = r.rarity >= 3 ? 0 : no3 + 1;
      no5 = r.rarity >= 5 ? 0 : no5 + 1;
      max3 = Math.max(max3, no3); max5 = Math.max(max5, no5);
      if (r.pityHit) hits++;
    }
    expect(max3).toBeLessThanOrEqual(19);
    expect(max5).toBeLessThanOrEqual(399);
    expect(hits).toBeGreaterThan(0);
  });

  it('since5 399 → ★5 확정, 게이지 = since5/400, activity 마다 따로', () => {
    const s = newRollState();
    s.firstDay.fish = 1; s.firstDay.bug = 1;
    s.pity.fish = { since3: 0, since4: 0, since5: 399 };
    expect(pityGauge(s, 'fish')).toBeCloseTo(399 / 400);
    expect(pityGauge(s, 'bug')).toBe(0);
    const r = rollCatch({ activity: 'fish', pool: POOL }, s, env());
    expect(r.rarity).toBe(5);
    expect(r.pityHit).toBe(true);
    expect(s.pity.fish).toEqual({ since3: 0, since4: 0, since5: 0 });
    // since4 79 → ★4+
    s.pity.bug = { since3: 0, since4: 79, since5: 0 };
    expect(rollCatch({ activity: 'bug', pool: POOL }, s, env()).rarity).toBeGreaterThanOrEqual(4);
  });

  it('후보에 ★3+ 가 없으면 있는 것 중 가장 높은 희귀도로', () => {
    const s = newRollState();
    s.firstDay.fish = 1;
    s.pity.fish = { since3: 30, since4: 30, since5: 30 };
    const low = POOL.filter(p => p.rarity <= 2);
    const r = rollCatch({ activity: 'fish', pool: low }, s, env());
    expect(r.rarity).toBe(2);
    expect(r.pityHit).toBeUndefined();
    expect(s.pity.fish.since3).toBe(31);
  });

  it('콤보: 성공마다 +1, catchFail 이면 0', () => {
    const s = newRollState();
    for (let i = 0; i < 6; i++) rollCatch({ activity: 'bug', pool: POOL }, s, env());
    expect(s.combo).toBe(6);
    catchFail(s, 'bug');
    expect(s.combo).toBe(0);
    expect(rollCatch({ activity: 'bug', pool: POOL }, s, env()).combo).toBe(1);
  });
});

describe('오늘 첫 잡기', () => {
  it('activity 별 하루 첫 잡기는 ★3+, 다음 날 다시', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = newRollState();
      const e = env({ day: seed });
      const r = rollCatch({ activity: 'fish', pool: POOL }, s, e);
      expect(r.rarity).toBeGreaterThanOrEqual(3);
      expect(r.firstOfDay).toBe(true);
      const r2 = rollCatch({ activity: 'fish', pool: POOL }, s, e);
      expect(r2.firstOfDay).toBeUndefined();
      expect(rollCatch({ activity: 'bug', pool: POOL }, s, e).firstOfDay).toBe(true);
      expect(rollCatch({ activity: 'fish', pool: POOL }, s, env({ day: seed + 1 })).firstOfDay).toBe(true);
    }
  });

  it('★3+ 후보가 없는 곳에선 보상을 아껴 둔다', () => {
    const s = newRollState();
    const low = POOL.filter(p => p.rarity <= 2);
    const r = rollCatch({ activity: 'fish', pool: low }, s, env());
    expect(r.firstOfDay).toBeUndefined();
    expect(r.rarity).toBeLessThanOrEqual(2);
    expect(rollCatch({ activity: 'fish', pool: POOL }, s, env()).firstOfDay).toBe(true);
  });
});

describe('후보 거르기·종 가중치', () => {
  it('weather.only: 그 날씨에만', () => {
    const rainy: RollSpecies = { id: 'rainfish', rarity: 1, where: [{ weather: { only: ['rain'] } }] };
    const plain: RollSpecies = { id: 'plain', rarity: 1 };
    const s = newRollState();
    for (let i = 0; i < 300; i++) {
      s.firstDay.fish = 1;
      expect(rollCatch({ activity: 'fish', pool: [rainy, plain] }, s, env()).species?.id).toBe('plain');
    }
    const got = new Set<string>();
    for (let i = 0; i < 300; i++) { s.firstDay.fish = 1; got.add(rollCatch({ activity: 'fish', pool: [rainy, plain] }, s, env({ weather: 'rain' })).species!.id); }
    expect(got.has('rainfish')).toBe(true);
    // 날씨가 안 맞아 후보가 0 이면 빈손
    const r = rollCatch({ activity: 'fish', pool: [rainy] }, s, env());
    expect(r.species).toBeNull();
    expect(r.rarity).toBe(0);
  });

  it('dev 해금 키가 잠겨 있으면 안 나온다', () => {
    const devfish: RollSpecies = { id: 'devfish', rarity: 4, where: [{ dev: 'dev:coral:3' }] };
    const plain: RollSpecies = { id: 'plain', rarity: 1 };
    const locked = env({ isUnlocked: k => k !== 'dev:coral:3' });
    const s = newRollState();
    for (let i = 0; i < 300; i++) expect(rollCatch({ activity: 'dive', pool: [devfish, plain] }, s, locked).species?.id).toBe('plain');
    const open = env({ isUnlocked: () => true });
    // 첫 잡기 ★3+ → 하나뿐인 ★4 devfish
    const s2 = newRollState();
    expect(rollCatch({ activity: 'dive', pool: [devfish, plain] }, s2, open).species?.id).toBe('devfish');
    // 여러 where 중 하나라도 열려 있으면 후보
    const two: RollSpecies = { id: 'two', rarity: 1, where: [{ dev: 'dev:coral:3' }, { zone: 'reef' }] };
    expect(rollCatch({ activity: 'dive', pool: [two] }, newRollState(), locked).species?.id).toBe('two');
  });

  it('weather.boost ×3, 손님 ×5, boostTags 배율', () => {
    const count = (pool: RollSpecies[], e: RollEnv, id: string, n = 6000) => {
      const s = newRollState(); let c = 0;
      for (let i = 0; i < n; i++) { s.firstDay.bug = e.day; if (rollCatch({ activity: 'bug', pool }, s, e).species?.id === id) c++; }
      return c / n;
    };
    const a: RollSpecies = { id: 'a', rarity: 1, tags: ['set:glow'], where: [{ weather: { boost: ['fog'] } }] };
    const b: RollSpecies = { id: 'b', rarity: 1 };
    // 같은 ★ 안에서만 비교하려고 ★1 두 종만
    expect(count([a, b], env(), 'a')).toBeCloseTo(0.5, 1);
    expect(count([a, b], env({ weather: 'fog' }), 'a')).toBeCloseTo(0.75, 1);
    expect(count([a, b], env({ guestId: 'b' }), 'b')).toBeCloseTo(5 / 6, 1);
    expect(count([a, b], env({ boostTags: { 'set:glow': 4 } }), 'a')).toBeCloseTo(0.8, 1);
    expect(count([a, b], env({ boostTags: { 'set:glow': 0 } }), 'a')).toBe(0);
    const cx: RollSpecies = { id: 'cx', rarity: 1, where: [{ weather: { boost: ['rain'], x: 9 } }] };
    expect(count([cx, b], env({ weather: 'rain' }), 'cx')).toBeCloseTo(0.9, 1);
  });

  it('없는 희귀도는 r−1 … 다음 r+1 로 내려/올라간다', () => {
    const only3: RollSpecies[] = [{ id: 'x3', rarity: 3 }];
    const s = newRollState();
    for (let i = 0; i < 200; i++) { s.firstDay.fish = 1; expect(rollCatch({ activity: 'fish', pool: only3 }, s, env()).rarity).toBe(3); }
    // ★1·★4 만 있으면 ★2·★3 굴림은 ★1 로(아래 먼저)
    const s2 = newRollState(); const h: Record<number, number> = {};
    for (let i = 0; i < 5000; i++) {
      s2.firstDay.fish = 1; s2.pity = {};
      const r = rollCatch({ activity: 'fish', pool: [{ id: 'a1', rarity: 1 }, { id: 'a4', rarity: 4 }] }, s2, env()).rarity;
      h[r] = (h[r] ?? 0) + 1;
    }
    expect(h[1] / 5000).toBeCloseTo(0.94, 1);
  });
});

describe('결정성·쓰레기·크기', () => {
  it('같은 저장·같은 날이면 같은 결과(키 roll:activity:day:count)', () => {
    const run = () => {
      const s = newRollState();
      return Array.from({ length: 200 }, () => rollCatch({ activity: 'fish', pool: POOL, junk: true }, s, env({ day: 7 })));
    };
    expect(run()).toEqual(run());
    const keys: string[] = [];
    const s = newRollState();
    const e = env({ day: 3, rng: k => { keys.push(k); return rngFor(k); } });
    rollCatch({ activity: 'space', pool: POOL }, s, e); rollCatch({ activity: 'space', pool: POOL }, s, e);
    rollCatch({ activity: 'moonfish', pool: POOL }, s, e);
    expect(keys).toEqual(['roll:space:3:0', 'roll:space:3:1', 'roll:moonfish:3:0']);
    // q.rng 가 있으면 그걸 쓴다
    const k0 = keys.length;
    rollCatch({ activity: 'space', pool: POOL, rng: mulberry32(1) }, s, e);
    expect(keys.length).toBe(k0);
  });

  it('쓰레기: 미끼 없음 12%, 미끼 8%, 표 비율, 낚시만', () => {
    const N = 20000;
    const rate = (bait?: string, activity: RollQuery['activity'] = 'fish') => {
      const s = newRollState(); const tab: Record<string, number> = {}; let j = 0;
      for (let i = 0; i < N; i++) {
        s.firstDay[activity] = 1;
        const r = rollCatch({ activity, pool: POOL, junk: true, bait }, s, env());
        if (r.junk) { j++; tab[r.junk] = (tab[r.junk] ?? 0) + 1; expect(r.species).toBeNull(); }
      }
      return { r: j / N, tab, j };
    };
    const none = rate();
    expect(Math.abs(none.r - 0.12)).toBeLessThan(0.008);
    expect(Math.abs(rate('bait_worm').r - 0.08)).toBeLessThan(0.008);
    expect(rate(undefined, 'bug').r).toBe(0);
    const tw = JUNK_TABLE.reduce((a, t) => a + t.w, 0);
    for (const t of JUNK_TABLE) expect(Math.abs((none.tab[t.id] ?? 0) / none.j - t.w / tw)).toBeLessThan(0.03);
    // junk 플래그가 없으면 쓰레기 없음
    const s = newRollState();
    for (let i = 0; i < 500; i++) expect(rollCatch({ activity: 'fish', pool: POOL }, s, env()).junk).toBeUndefined();
    // 오늘 첫 잡기는 쓰레기로 날아가지 않는다
    for (let d = 0; d < 300; d++) expect(rollCatch({ activity: 'fish', pool: POOL, junk: true }, newRollState(), env({ day: d })).firstOfDay).toBe(true);
  });

  it('크기 정규분포, 왕관 ≈1%, 꼬마 ≈3%, 반짝이 1/256 × luckMult', () => {
    const N = 20000;
    const { out } = pureRolls(N);
    const sizes = out.map(r => r.size!);
    const mean = sizes.reduce((a, b) => a + b, 0) / N;
    const sd = Math.sqrt(sizes.reduce((a, b) => a + (b - mean) ** 2, 0) / N);
    expect(mean).toBeCloseTo(30, 0);
    expect(Math.abs(sd - 4.5)).toBeLessThan(0.2);
    const v = (k: string) => out.filter(r => r.variant === k).length / N;
    expect(Math.abs(v('crown') - 0.0099)).toBeLessThan(0.003);
    expect(Math.abs(v('tiny') - 0.03)).toBeLessThan(0.005);
    expect(Math.abs(v('shiny') - 1 / 256)).toBeLessThan(0.002);
    // 왕관은 큰 쪽, 꼬마는 작은 쪽
    for (const r of out) {
      if (r.variant === 'crown') expect(r.size!).toBeGreaterThan(30 * (1 + 0.15 * 2.3));
      if (r.variant === 'tiny') expect(r.size!).toBeLessThan(30 * (1 - 0.15 * 1.87));
    }
    const lucky = pureRolls(N, { luckMult: 4 }).out.filter(r => r.variant === 'shiny').length / N;
    expect(Math.abs(lucky - 4 / 256)).toBeLessThan(0.004);
    // len 없는 종은 크기 없음
    expect(rollCatch({ activity: 'bug', pool: [{ id: 'nolen', rarity: 1 }] }, newRollState(), env()).size).toBeUndefined();
  });

  it('깨진 저장 상태에서도 굴린다', () => {
    const broken = {} as RollState;
    const r = rollCatch({ activity: 'fish', pool: POOL }, broken, env());
    expect(r.species).not.toBeNull();
    expect(broken.count.fish).toBe(1);
    expect(pityGauge({} as RollState, 'fish')).toBe(0);
  });
});

describe('미리 굴리기(commit:false) → commitCatch', () => {
  it('commit:false 세 번은 count 만 올리고 천장·콤보·오늘 첫 잡기는 그대로', () => {
    const s = newRollState();
    s.pity.fish = { since3: 5, since4: 6, since5: 7 };
    s.combo = 4;
    const before = JSON.parse(JSON.stringify({ pity: s.pity, combo: s.combo, firstDay: s.firstDay }));
    const rs = [0, 1, 2].map(() => rollCatch({ activity: 'fish', pool: POOL, commit: false }, s, env()));
    expect({ pity: s.pity, combo: s.combo, firstDay: s.firstDay }).toEqual(before);
    expect(s.count.fish).toBe(3);
    // 아직 오늘 보상 전이라 셋 다 ★3+ 후보, 콤보는 '잡으면 될 값'
    for (const r of rs) { expect(r.firstOfDay).toBe(true); expect(r.rarity).toBeGreaterThanOrEqual(3); expect(r.combo).toBe(5); }
  });

  it('commitCatch 는 바로 반영하는 굴림과 같은 상태·결과를 만든다', () => {
    for (let d = 0; d < 100; d++) {
      const a = newRollState(), b = newRollState();
      a.pity.bug = { since3: 18, since4: 40, since5: 350 }; b.pity.bug = { ...a.pity.bug };
      a.combo = b.combo = 6;
      const q: RollQuery = { activity: 'bug', pool: POOL };
      for (let i = 0; i < 3; i++) {
        const ra = rollCatch(q, a, env({ day: d }));
        const rb = rollCatch({ ...q, commit: false }, b, env({ day: d }));
        expect(rb).toEqual(ra);
        expect(commitCatch(b, 'bug', rb, d)).toEqual(ra);
        expect(b).toEqual(a);
      }
    }
  });

  it('미리 굴린 것 중 하나만 잡으면 그것만 반영, 오늘 보상은 한 번만', () => {
    const s = newRollState();
    const shadows = [0, 1, 2].map(() => rollCatch({ activity: 'fish', pool: POOL, commit: false }, s, env()));
    const got = commitCatch(s, 'fish', shadows[1], 1);
    expect(got.firstOfDay).toBe(true);
    expect(got.combo).toBe(1);
    expect(s.firstDay.fish).toBe(1);
    expect(s.pity.fish).toEqual({ since3: 0, since4: shadows[1].rarity >= 4 ? 0 : 1, since5: shadows[1].rarity >= 5 ? 0 : 1 });
    // 같은 날 남은 그림자를 또 잡으면 보상 표시는 떨어진다
    const again = commitCatch(s, 'fish', shadows[2], 1);
    expect(again.firstOfDay).toBeUndefined();
    expect(again.combo).toBe(2);
    // 쓰레기·빈손은 아무것도 안 바꾼다
    const snap = JSON.stringify(s);
    commitCatch(s, 'fish', { species: null, rarity: 0, junk: 't_boot', combo: 0 }, 1);
    expect(JSON.stringify(s)).toBe(snap);
  });
});

describe('미리 굴린 그림자의 천장 표시', () => {
  it('형제 그림자가 먼저 잡혀 천장이 풀렸으면 commitCatch 가 pityHit 을 뗀다', () => {
    const s = newRollState(); s.firstDay.fish = 1;
    s.pity.fish = { since3: 0, since4: 0, since5: 399 };
    const a = rollCatch({ activity: 'fish', pool: POOL, commit: false }, s, env());
    const b = rollCatch({ activity: 'fish', pool: POOL, commit: false }, s, env());
    expect(a.rarity).toBe(5); expect(a.pityHit).toBe(true);
    expect(b.rarity).toBe(5); expect(b.pityHit).toBe(true);
    expect(commitCatch(s, 'fish', a, 1).pityHit).toBe(true);
    const later = commitCatch(s, 'fish', b, 1);
    expect(later.pityHit).toBeUndefined();
    expect(later.rarity).toBe(5);
  });
});

describe('자리(place)로 where 줄 고르기', () => {
  const coralLocked: RollSpecies = { id: 'leak', rarity: 4, where: [{ island: 'coral', zone: 'reef', dev: 'dev:coral:3' }, { island: 'ice', zone: 'reef' }] };
  const plain: RollSpecies = { id: 'plain', rarity: 1 };
  const locked = env({ isUnlocked: k => k !== 'dev:coral:3' });

  it('다른 섬 줄이 열려 있어도 이 자리 줄이 잠겨 있으면 안 나온다', () => {
    for (let i = 0; i < 200; i++) {
      const r = rollCatch({ activity: 'dive', pool: [coralLocked, plain], place: { island: 'coral', zone: 'reef' } }, newRollState(), env({ ...locked, day: i }));
      expect(r.species?.id).toBe('plain');
    }
    // 얼음섬 자리에선 그 줄이 열려 있으니 후보(첫 잡기 ★3+ → leak)
    expect(rollCatch({ activity: 'dive', pool: [coralLocked, plain], place: { island: 'ice', zone: 'reef' } }, newRollState(), locked).species?.id).toBe('leak');
  });

  it('island any·zone shore 는 모든 섬, 시간은 env.tod(또는 place.time)', () => {
    const shore: RollSpecies = { id: 'sh', rarity: 1, where: [{ zone: 'shore', island: 'home' }] };
    const any: RollSpecies = { id: 'an', rarity: 1, where: [{ island: 'any', zone: 'pond' }] };
    const night: RollSpecies = { id: 'nt', rarity: 1, where: [{ time: ['night', 'sunset'] }] };
    const allday: RollSpecies = { id: 'ad', rarity: 1, where: [{ time: 'all' }] };
    const ids = (place: RollQuery['place'], e = env()) => {
      const s = newRollState(); const got = new Set<string>();
      for (let i = 0; i < 400; i++) { s.firstDay.fish = 1; const r = rollCatch({ activity: 'fish', pool: [shore, any, night, allday], place }, s, e); if (r.species) got.add(r.species.id); }
      return [...got].sort();
    };
    expect(ids({ island: 'ice', zone: 'shore' })).toEqual(['ad', 'sh']);
    expect(ids({ island: 'ice', zone: 'pond' })).toEqual(['ad', 'an']);
    expect(ids({ island: 'ice', zone: 'pond' }, env({ tod: 'night' }))).toEqual(['ad', 'an', 'nt']);
    expect(ids({ island: 'ice', zone: 'pond', time: 'sunset' })).toEqual(['ad', 'an', 'nt']);
  });

  it('정오·자정은 env.hour 시간 창(정오 11~13시·자정 00~02시)으로 맞춘다', () => {
    const noon: RollSpecies = { id: 'noon', rarity: 5, where: [{ island: 'dino', zone: 'crater', time: ['noon'] }] };
    const mid: RollSpecies = { id: 'mid', rarity: 5, where: [{ island: 'dino', zone: 'crater', time: ['midnight'] }] };
    const plain: RollSpecies = { id: 'p', rarity: 1 };
    const place = { island: 'dino', zone: 'crater' };
    // ★5 확정 천장 — 후보면 반드시 나오고, 아니면 ★1 로 내려간다
    const got = (sp: RollSpecies, e: RollEnv, pl: RollQuery['place'] = place) => {
      const s = newRollState(); s.firstDay.bug = e.day;
      s.pity.bug = { since3: 0, since4: 0, since5: 399 };
      return rollCatch({ activity: 'bug', pool: [sp, plain], place: pl }, s, e).species?.id;
    };
    for (let i = 0; i < 50; i++) {
      expect(got(noon, env({ day: i, hour: 12, tod: 'day' }))).toBe('noon');
      expect(got(noon, env({ day: i, hour: 11, tod: 'day' }))).toBe('noon');
      expect(got(noon, env({ day: i, hour: 13, tod: 'day' }))).toBe('p');
      expect(got(noon, env({ day: i, hour: 15, tod: 'day' }))).toBe('p');
      expect(got(mid, env({ day: i, hour: 1, tod: 'night' }))).toBe('mid');
      expect(got(mid, env({ day: i, hour: 0, tod: 'night' }))).toBe('mid');
      expect(got(mid, env({ day: i, hour: 23, tod: 'night' }))).toBe('p');
      expect(got(mid, env({ day: i, hour: 2, tod: 'night' }))).toBe('p');
    }
    // place.time 을 직접 주면 이름으로만 — 'noon' 이면 맞고 'day' 면 시각이 12시여도 안 맞는다
    expect(got(noon, env({ hour: 15 }), { ...place, time: 'noon' })).toBe('noon');
    expect(got(noon, env({ hour: 12 }), { ...place, time: 'day' })).toBe('p');
  });

  it('tod 가 비어도 시각이 있으면 시간 창으로 거른다', () => {
    const noon: RollSpecies = { id: 'noon', rarity: 5, where: [{ time: ['noon'] }] };
    const plain: RollSpecies = { id: 'p', rarity: 1 };
    const got = (hour: number) => {
      const s = newRollState(); s.pity.bug = { since3: 0, since4: 0, since5: 399 };
      return rollCatch({ activity: 'bug', pool: [noon, plain], place: {} }, s, env({ tod: '', hour })).species?.id;
    };
    expect(got(12)).toBe('noon');
    expect(got(15)).toBe('p');
  });

  it('weather.boost 도 이 자리 줄에서만', () => {
    const a: RollSpecies = { id: 'a', rarity: 1, where: [{ island: 'home' }, { island: 'ice', weather: { boost: ['fog'], x: 9 } }] };
    const b: RollSpecies = { id: 'b', rarity: 1 };
    const s = newRollState(); let c = 0;
    for (let i = 0; i < 6000; i++) { s.firstDay.fish = 1; if (rollCatch({ activity: 'fish', pool: [a, b], place: { island: 'home' } }, s, env({ weather: 'fog' })).species?.id === 'a') c++; }
    expect(c / 6000).toBeCloseTo(0.5, 1);
  });
});

describe('태그 배율 0 = 막기', () => {
  it('희귀도에 하나뿐이거나 전부 0 이어도 안 나오고 옆 희귀도로 넘어간다', () => {
    const g3: RollSpecies = { id: 'g3', rarity: 3, tags: ['set:glow'] };
    const g3b: RollSpecies = { id: 'g3b', rarity: 3, tags: ['set:glow'] };
    const p1: RollSpecies = { id: 'p1', rarity: 1 };
    const e = env({ boostTags: { 'set:glow': 0 } });
    for (let i = 0; i < 300; i++) {
      expect(rollCatch({ activity: 'bug', pool: [g3, p1] }, newRollState(), env({ ...e, day: i })).species?.id).toBe('p1');
      expect(rollCatch({ activity: 'bug', pool: [g3, g3b, p1] }, newRollState(), env({ ...e, day: i })).species?.id).toBe('p1');
    }
    // 전부 막히면 빈손
    expect(rollCatch({ activity: 'bug', pool: [g3, g3b] }, newRollState(), e).species).toBeNull();
  });
});
