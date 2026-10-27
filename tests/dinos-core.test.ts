// dinos-core — 하트(하루 상한·저장)·친구 하트(P0 2 / 정식 5)·먹이(초식·육식)·티노 스텔스 게이지·금상자 자격·화석 id.
import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../src/core/state';
import { stubLocalStorage, ensureBrowserStubs } from './kit/storage';
import { rngFor } from '../src/core/rng';
import { MATERIALS } from '../src/modules/economy/data';
import {
  DINOS, DINO_BY_ID, FOSSIL_PIECES, FOSSIL_SKELETONS, FOSSILS, FOSSIL_DINOS, allSpecies, rollFossil, parseFossil, fossilKey,
  dinoKey, mountKey, shortId, dinoByAny, LAND_DINOS, WITNESS_IDS,
} from '../src/modules/dinos/data';
import {
  ensureFlags, applyGain, threshold, remainingToday, foodValue, pickFood, HERB_FOODS, FRUIT_IDS, DAY_CAP, HEART_MAX, PET_GAIN,
  habitatAt, speciesFor, awakeAt, useDrop, dropsLeft, requestOfDay, heartLine,
} from '../src/modules/dinos/logic';
import {
  newTino, tinoStep, chestCheck, noiseOf, noiseRate, forceTino, RATE_RUN, RATE_WALK, HEAR_R, CHASE_SEC, SULK_SEC, WAKE_SEC, APPROACH_OUT,
  type TinoInput,
} from '../src/modules/dinos/tino';

const fishLookup = (id: string) => {
  const m = /^fish-r(\d)$/.exec(id);
  if (m) return { category: 'fish', rarity: Number(m[1]) };
  if (id === 'bug-a') return { category: 'bug', rarity: 2 };
  return undefined;
};

describe('하트 — 하루 상한·저장', () => {
  beforeEach(() => { ensureBrowserStubs('?fresh=0'); stubLocalStorage(); });

  it('하루에 종마다 +2 까지만 오르고, 다음 날 다시 오른다', () => {
    const f = ensureFlags({});
    expect(applyGain(f, 'dino-trike', 1, 3, false).added).toBe(1);
    expect(applyGain(f, 'dino-trike', 2, 3, false)).toMatchObject({ added: 1, hearts: 2, capped: true });
    expect(applyGain(f, 'dino-trike', PET_GAIN, 3, false).added).toBe(0);
    expect(remainingToday(f, 'dino-trike', 3)).toBe(0);
    // 다른 종은 따로 센다
    expect(applyGain(f, 'dino-proto', 2, 3, false).added).toBe(2);
    // 다음 날
    expect(remainingToday(f, 'dino-trike', 4)).toBe(DAY_CAP);
    expect(applyGain(f, 'dino-trike', PET_GAIN, 4, false)).toMatchObject({ added: 0.5, hearts: 2.5 });
    expect(f.dayGain[4]['dino-trike']).toBe(0.5);
  });

  it('하트는 5칸을 넘지 않는다', () => {
    const f = ensureFlags({ hearts: { 'z_compy': 4.5 } });
    const r = applyGain(f, 'z_compy', 2, 0, false);
    expect(r.added).toBe(0.5);
    expect(r.hearts).toBe(HEART_MAX);
  });

  it('오래된 날 기록은 지운다(오늘·어제만)', () => {
    const f = ensureFlags({});
    applyGain(f, 'a', 1, 1, false);
    applyGain(f, 'a', 1, 2, false);
    applyGain(f, 'a', 1, 5, false);
    expect(Object.keys(f.dayGain).sort()).toEqual(['5']);
  });

  it('flags.dino 는 저장했다 불러와도 그대로(GameState 저장 왕복)', () => {
    const st = new GameState();
    const f = ensureFlags(st.flags.dino);
    st.flags.dino = f;
    applyGain(f, 'dino-galli', 2, 7, true);
    f.petDay['dino-galli'] = 7;
    f.pet = 'dino-proto';
    f.tinoFish = 3;
    st.saveNow();
    const st2 = new GameState();
    st2.load();
    const g = ensureFlags(st2.flags.dino);
    expect(g.hearts['dino-galli']).toBe(2);
    expect(g.dayGain[7]['dino-galli']).toBe(2);
    expect(remainingToday(g, 'dino-galli', 7)).toBe(0);
    expect(g.petDay['dino-galli']).toBe(7);
    expect(g.pet).toBe('dino-proto');
    expect(g.tinoFish).toBe(3);
  });

  it('깨진 모양도 고쳐 받는다', () => {
    const g = ensureFlags({ hearts: { a: 'x', b: 2 }, dayGain: 5, pet: 9, eggs: 'no' });
    expect(g.hearts).toEqual({ b: 2 });
    expect(g.dayGain).toEqual({});
    expect(g.pet).toBeNull();
    expect(g.eggs).toEqual([]);
    expect(g.tinoChest).toBe(-1);
  });

  it('하트 줄', () => {
    expect(heartLine(2)).toBe('♥♥♡♡♡');
    expect(heartLine(2.5)).toBe('♥♥♡♡♡ +½');
    expect(heartLine(9)).toBe('♥♥♥♥♥');
  });
});

describe('친구 하트 — P0 2 / 정식 5', () => {
  it('P0 은 2칸에서 crossed', () => {
    const f = ensureFlags({});
    expect(threshold(true)).toBe(2);
    expect(applyGain(f, 'dino-trike', 1, 0, true).crossed).toBe(false);
    const r = applyGain(f, 'dino-trike', 1, 0, true);
    expect(r.crossed).toBe(true);
    // 넘은 뒤엔 다시 crossed 아님
    expect(applyGain(f, 'dino-trike', 1, 1, true).crossed).toBe(false);
  });

  it('정식은 5칸(하루 +2 라 사흘)', () => {
    const f = ensureFlags({});
    expect(threshold(false)).toBe(5);
    expect(applyGain(f, 'z_tino', 2, 0, false).crossed).toBe(false);
    expect(applyGain(f, 'z_tino', 2, 1, false).crossed).toBe(false);
    const r = applyGain(f, 'z_tino', 2, 2, false);
    expect(r).toMatchObject({ hearts: 5, crossed: true, added: 1 });
  });

  it('해금 키: dino:<id>, 탈것은 v:dino_<짧은 id>(vehicles 의 v_dino_trike·ptera·plesio 와 맞다)', () => {
    expect(dinoKey('z_mammoth')).toBe('dino:z_mammoth');
    expect(mountKey('dino-trike')).toBe('v:dino_trike');
    expect(mountKey('dino-ptera')).toBe('v:dino_ptera');
    expect(mountKey('dino-plesio')).toBe('v:dino_plesio');
    const mounts = DINOS.filter((d) => d.reward.kind === 'mount').map((d) => shortId(d.id)).sort();
    expect(mounts).toEqual(['galli', 'plesio', 'ptera', 'trike']);
    for (const d of DINOS.filter((x) => x.reward.kind === 'mount')) expect(d.mount).toBe(true);
  });
});

describe('먹이(GDD 3.7)', () => {
  const trike = DINO_BY_ID.get('dino-trike')!;       // 초식, 과일 좋아함
  const iguanodon = DINO_BY_ID.get('z_iguanodon')!;  // 초식, 고사리 좋아함
  const compy = DINO_BY_ID.get('z_compy')!;          // 육식, 물고기
  const spino = DINO_BY_ID.get('dino-spino')!;       // 육식, ★3+ 물고기 좋아함
  const mammoth = DINO_BY_ID.get('z_mammoth')!;      // 서리 열매

  it('식성 칸: 물고기 좋아하면 육식, 나머지 초식', () => {
    expect(trike.diet).toBe('herb');
    expect(compy.diet).toBe('carni');
    expect(spino.diet).toBe('carni');
    expect(mammoth.diet).toBe('herb');
    for (const d of DINOS) if (d.diet === 'carni') expect(d.tags).toContain('food:carni');
    expect(DINO_BY_ID.get('dino-mosa')!.fav).toBeNull();
  });

  it('초식: 과일 m_*·고사리·은행만, 좋아하는 먹이 +2', () => {
    expect(FRUIT_IDS).toContain('m_apple');
    expect(FRUIT_IDS).toContain('m_frostberry');
    expect(HERB_FOODS).toEqual(expect.arrayContaining(['m_fern', 'm_ginkgo', 'm_banana']));
    for (const id of HERB_FOODS) expect(MATERIALS.some((m) => m.id === id)).toBe(true);
    expect(foodValue(trike, 'm_apple', fishLookup)).toEqual({ ok: true, gain: 2, fav: true });
    expect(foodValue(trike, 'm_fern', fishLookup)).toEqual({ ok: true, gain: 1, fav: false });
    expect(foodValue(iguanodon, 'm_fern', fishLookup)).toEqual({ ok: true, gain: 2, fav: true });
    expect(foodValue(iguanodon, 'm_peach', fishLookup)).toEqual({ ok: true, gain: 1, fav: false });
    expect(foodValue(trike, 'fish-r3', fishLookup).ok).toBe(false);
    expect(foodValue(trike, 'm_wood', fishLookup).ok).toBe(false);
    expect(foodValue(mammoth, 'm_frostberry', fishLookup)).toMatchObject({ ok: true, fav: true, gain: 2 });
  });

  it('육식: 아무 물고기, ★마다 +1(좋아하는 ★ 이상이면 +1 더). 과일·곤충·변이 키는 안 먹는다', () => {
    expect(foodValue(compy, 'fish-r1', fishLookup)).toEqual({ ok: true, gain: 2, fav: true });
    expect(foodValue(spino, 'fish-r1', fishLookup)).toEqual({ ok: true, gain: 1, fav: false });
    expect(foodValue(spino, 'fish-r2', fishLookup)).toEqual({ ok: true, gain: 2, fav: false });
    expect(foodValue(spino, 'fish-r3', fishLookup)).toEqual({ ok: true, gain: 4, fav: true });
    expect(foodValue(compy, 'm_apple', fishLookup).ok).toBe(false);
    expect(foodValue(compy, 'bug-a', fishLookup).ok).toBe(false);
    expect(foodValue(compy, 'fish-r1@crown', fishLookup).ok).toBe(false);
  });

  it('pickFood: 오늘 남은 하트를 가장 채우는 것 → 좋아하는 것 → 덜 귀한 것', () => {
    const bag = { m_fern: 3, m_apple: 1, m_wood: 9 };
    expect(pickFood(trike, bag, fishLookup, 2)!.id).toBe('m_apple');
    expect(pickFood(iguanodon, bag, fishLookup, 2)!.id).toBe('m_fern');
    // 남은 하트가 1 이면 효과는 같다 → 좋아하는 것
    expect(pickFood(trike, bag, fishLookup, 1)!.id).toBe('m_apple');
    // 육식: 남은 2 를 채우는 가장 덜 귀한 물고기(★1 좋아함 = +2)
    expect(pickFood(compy, { 'fish-r1': 1, 'fish-r4': 1 }, fishLookup, 2)!.id).toBe('fish-r1');
    expect(pickFood(spino, { 'fish-r1': 1, 'fish-r2': 1, 'fish-r5': 1 }, fishLookup, 2)!.id).toBe('fish-r2');
    expect(pickFood(compy, { m_apple: 5 }, fishLookup, 2)).toBeNull();
    expect(pickFood(trike, { m_apple: 0 }, fishLookup, 2)).toBeNull();
  });
});

describe('25종 데이터', () => {
  it('공룡 도감 25칸 = 공룡 22 + 빙하기 손님 3, 새 종은 GDD id, 예전 15종은 gdd 별칭', () => {
    expect(DINOS).toHaveLength(25);
    expect(new Set(DINOS.map((d) => d.id)).size).toBe(25);
    expect(DINOS.every((d) => d.category === 'dino')).toBe(true);
    for (const id of ['z_iguanodon', 'z_compy', 'z_apatosaurus', 'z_oviraptor', 'z_therizino', 'z_quetzal', 'z_tino', 'z_mammoth', 'z_sabertooth', 'z_yutyrannus']) {
      expect(DINO_BY_ID.get(id)?.gdd).toBe(id);
    }
    const legacy = DINOS.filter((d) => d.id.startsWith('dino-'));
    expect(legacy).toHaveLength(15);
    for (const d of legacy) expect(d.gdd).toMatch(/^z_/);
    expect(dinoByAny('z_triceratops')?.id).toBe('dino-trike');
    expect(dinoByAny('z_baby_rex')?.id).toBe('dino-trex');
    expect(DINOS.filter((d) => d.home === 'ice').map((d) => d.id).sort()).toEqual(['z_mammoth', 'z_sabertooth', 'z_yutyrannus']);
    expect(WITNESS_IDS.sort()).toEqual(['dino-mosa', 'dino-plesio', 'dino-ptera']);
    for (const d of DINOS) {
      expect(['QUAD', 'BIPED', 'LONGNECK', 'WING', 'SWIM']).toContain(d.form);
      expect(d.zones.length).toBeGreaterThan(0);
      expect(d.where?.length).toBeGreaterThan(0);
    }
  });

  it('구역 고르기: 공룡섬 6구역 + 해안 정글 + 정상, 솜눈섬 3구역', () => {
    const base = { island: 'dino', coast: 200, h: 10 } as const;
    expect(habitatAt({ ...base, zone: 'ranch' })).toBe('meadow');
    expect(habitatAt({ ...base, zone: 'fern' })).toBe('forest');
    expect(habitatAt({ ...base, zone: 'fern', coast: 40 })).toBe('jungle');
    expect(habitatAt({ ...base, zone: 'volcano' })).toBe('volcano');
    expect(habitatAt({ ...base, zone: 'fern', lake: 'ancientlake' })).toBe('lake');
    expect(habitatAt({ ...base, zone: 'fern', lake: 'swamp' })).toBe('swamp');
    expect(habitatAt({ ...base, zone: 'fossil' })).toBe('nest');
    expect(habitatAt({ ...base, zone: 'crater', h: 80 })).toBe('summit');
    expect(habitatAt({ ...base, zone: 'lava' })).toBeNull();
    expect(habitatAt({ ...base, zone: 'fern', coast: 3 })).toBeNull();
    expect(habitatAt({ island: 'ice', coast: 100, h: 5, zone: 'snow' })).toBe('snowfield');
    expect(habitatAt({ island: 'ice', coast: 100, h: 30, zone: 'snow' })).toBe('snowpeak');
    expect(habitatAt({ island: 'ice', coast: 100, h: 5, zone: 'snowtree' })).toBe('snowforest');
    expect(habitatAt({ island: 'home', coast: 100, h: 5, zone: 'grass' })).toBeNull();
    // 구역마다 사는 종이 있다
    for (const z of ['meadow', 'forest', 'jungle', 'volcano', 'lake', 'swamp', 'nest', 'summit', 'snowpeak', 'snowforest'] as const) {
      expect(speciesFor(z, LAND_DINOS).length).toBeGreaterThan(0);
    }
    // 매머드는 빙하 속 비밀(ice-mammoth) — 눈밭 무리로는 절대 안 나온다(녹이면 마을에 한 마리)
    expect(DINO_BY_ID.get('z_mammoth')!.weight).toBe(0);
    expect(speciesFor('snowfield', LAND_DINOS).map((d) => d.id)).not.toContain('z_mammoth');
    for (const z of ['snowfield', 'snowpeak', 'snowforest'] as const) expect(speciesFor(z, LAND_DINOS).some((d) => d.id === 'z_mammoth')).toBe(false);
    expect(speciesFor('meadow', LAND_DINOS).map((d) => d.id)).toEqual(expect.arrayContaining(['z_iguanodon', 'dino-trike', 'dino-galli', 'dino-proto']));
    expect(LAND_DINOS.some((d) => d.id === 'z_tino')).toBe(false);
  });

  it('깨어 있는 시간(그 밖엔 쿨쿨)', () => {
    expect(awakeAt('all', 3)).toBe(true);
    expect(awakeAt(['day'], 12)).toBe(true);
    expect(awakeAt(['day'], 23)).toBe(false);
    expect(awakeAt(['night'], 2)).toBe(true);
    expect(awakeAt(['night'], 12)).toBe(false);
    expect(awakeAt(['morning'], 6)).toBe(true);
  });

  it('하루 선물 횟수(망치꼬리 3·손톱정원사 5)', () => {
    const f = ensureFlags({});
    for (let i = 0; i < 3; i++) expect(useDrop(f, 'dino-ankylo', 2, 3)).toBe(true);
    expect(useDrop(f, 'dino-ankylo', 2, 3)).toBe(false);
    expect(dropsLeft(f, 'dino-ankylo', 3, 3)).toBe(3);
    const theri = DINO_BY_ID.get('z_therizino')!;
    expect(theri.reward.kind === 'gift' && theri.reward.perDay).toBe(5);
    const ank = DINO_BY_ID.get('dino-ankylo')!;
    expect(ank.reward.kind === 'gift' && ank.reward.items.some((x) => x.id === 'm_iron')).toBe(true);
  });

  it('오늘의 부탁: 같은 날은 같은 부탁', () => {
    const a = requestOfDay(LAND_DINOS, rngFor('dinos:req:4'));
    const b = requestOfDay(LAND_DINOS, rngFor('dinos:req:4'));
    expect(a).toEqual(b);
    expect(a && DINO_BY_ID.get(a.id)?.home).toBe('dino');
  });
});

describe('티노 낮잠 스텔스', () => {
  const step = (m: ReturnType<typeof newTino>, o: Partial<TinoInput>, sec = 1, fps = 30) => {
    const evs: string[] = [];
    for (let i = 0; i < sec * fps; i++) evs.push(...tinoStep(m, { dt: 1 / fps, hour: 12, dist: 6, summitDist: 6, speed: 0, ...o }));
    return evs;
  };

  it('소리: 달리기 빠르게, 걷기 천천히, 살금살금·10 m 밖은 0', () => {
    expect(noiseOf(9.5)).toBe('run');
    expect(noiseOf(5.2)).toBe('walk');
    expect(noiseOf(1.3)).toBe('quiet');
    expect(noiseOf(5.2, true)).toBe('quiet');
    expect(noiseRate('run', 5)).toBe(RATE_RUN);
    expect(noiseRate('walk', 5)).toBe(RATE_WALK);
    expect(RATE_RUN).toBeGreaterThan(RATE_WALK * 3);
    expect(noiseRate('quiet', 1)).toBe(0);
    expect(noiseRate('run', HEAR_R + 0.1)).toBe(0);
  });

  it('09~17시엔 자고, 그 밖엔 깨어 있다', () => {
    expect(newTino(12).state).toBe('sleep');
    expect(newTino(20).state).toBe('awake');
    const m = newTino(16.9);
    const evs = tinoStep(m, { dt: 0.1, hour: 17.1, dist: 30, summitDist: 30, speed: 0 });
    expect(m.state).toBe('awake');
    expect(evs).toEqual(['wake']);
  });

  it('살금살금이면 게이지 0, 걸으면 천천히, 달리면 금방 깬다', () => {
    const a = newTino(12);
    step(a, { speed: 1.2 }, 5);
    expect(a.gauge).toBe(0);
    expect(a.state).toBe('sleep');
    const b = newTino(12);
    step(b, { speed: 5.2 }, 3);
    expect(b.gauge).toBeGreaterThan(20);
    expect(b.gauge).toBeLessThan(35);
    expect(b.state).toBe('sleep');
    const c = newTino(12);
    const evs = step(c, { speed: 9.5 }, 3);
    expect(evs).toContain('stir');
    expect(evs).toContain('wake');
    expect(c.wakes).toBe(1);
  });

  it('100% → 꺄오(깸) → 5초 쫓기 → 시무룩 → 돌아가 다시 잠', () => {
    const m = newTino(12);
    const evs = step(m, { speed: 9.5 }, 2.5);
    expect(evs.slice(-1)[0]).toBe('wake');
    step(m, {}, WAKE_SEC + 0.05);
    expect(m.state).toBe('chase');
    step(m, {}, CHASE_SEC + 0.05);
    expect(m.state).toBe('sulk');
    step(m, {}, SULK_SEC + 0.05);
    expect(m.state).toBe('return');
    const back = step(m, { home: true }, 0.1);
    expect(back).toEqual(['sleep']);
    expect(m.gauge).toBe(0);
  });

  it('쫓다가 닿으면(짧은 팔) 바로 시무룩', () => {
    const m = newTino(12);
    forceTino(m, 'chase');
    step(m, { caught: true }, 0.1);
    expect(m.state).toBe('sulk');
  });

  it('금상자: 이번 다가오기 동안 한 번도 안 깨웠을 때만', () => {
    // 살금살금 다가오면 열린다
    const m = newTino(12);
    step(m, { summitDist: 60, dist: 60, speed: 9.5 }, 1);
    step(m, { summitDist: 20, dist: 18, speed: 9.5 }, 0.5); // 10 m 밖이라 소리 안 들림
    step(m, { summitDist: 1, dist: 6, speed: 1.0 }, 2);
    expect(m.approaching).toBe(true);
    expect(chestCheck(m, 12, -1, 3)).toEqual({ ok: true });
    // 오늘 이미 열었으면 안 됨
    expect(chestCheck(m, 12, 3, 3).ok).toBe(false);
    // 깨우면 이번 다가오기는 실패 — 다시 자도 안 열린다
    const w = newTino(12);
    step(w, { summitDist: 5, dist: 5, speed: 9.5 }, 3);
    expect(w.clean).toBe(false);
    forceTino(w, 'sleep');
    expect(chestCheck(w, 12, -1, 3).ok).toBe(false);
    // 언덕을 벗어났다 다시 살금살금 오면 된다
    step(w, { summitDist: APPROACH_OUT + 5, dist: 60 }, 0.2);
    expect(w.approaching).toBe(false);
    step(w, { summitDist: 2, dist: 6, speed: 1 }, 0.5);
    expect(w.approaching && w.clean).toBe(true);
    expect(chestCheck(w, 12, -1, 3).ok).toBe(true);
    // 밤엔 티노가 지킨다
    const n = newTino(22);
    step(n, { hour: 22, summitDist: 1, dist: 6 }, 0.5);
    expect(chestCheck(n, 22, -1, 3).ok).toBe(false);
  });
});

describe('화석(ext.fossils)', () => {
  it('조각 60 = 공룡 20 × skull·body·tail, 골격 20', () => {
    expect(FOSSIL_DINOS).toHaveLength(20);
    expect(FOSSIL_DINOS.some((d) => d.home !== 'dino')).toBe(false);
    expect(FOSSIL_PIECES).toHaveLength(60);
    expect(FOSSIL_SKELETONS).toHaveLength(20);
    expect(new Set(FOSSILS.map((f) => f.id)).size).toBe(80);
    for (const f of FOSSIL_PIECES) {
      expect(f.id).toMatch(/^fos_[a-z_]+_(skull|body|tail)$/);
      expect(f.category).toBe('fossil');
      const p = parseFossil(f.id)!;
      expect(f.tags).toContain(`fos:${p.dino}:${p.part}`);
      expect(f.id).toBe(`fos_${p.dino}_${p.part}`);
      expect(f.price).toBeGreaterThan(0);
    }
    for (const s of FOSSIL_SKELETONS) {
      expect(s.id).toMatch(/^fos_[a-z_]+$/);
      expect(s.tags).toContain('skeleton');
      expect(FOSSIL_PIECES.filter((f) => f.dino === s.dino)).toHaveLength(3);
    }
    // 밑줄 든 키도 안전하게 읽는다
    expect(parseFossil('fos_baby_rex_skull')).toEqual({ dino: 'baby_rex', part: 'skull' });
    expect(fossilKey(DINO_BY_ID.get('dino-trike')!)).toBe('triceratops');
    expect(parseFossil('fos_nope_skull')).toBeNull();
  });

  it('60 조각이 등록 목록에 다 들어 있고 GameState 에 칸이 생긴다', () => {
    const st = new GameState();
    st.register(allSpecies());
    expect(st.dexCount('dino').total).toBe(25);
    const pieces = [...st.species.values()].filter((s) => s.category === 'fossil' && s.tags?.includes('fossil-part'));
    expect(pieces).toHaveLength(60);
    expect([...st.species.values()].filter((s) => s.tags?.includes('skeleton'))).toHaveLength(20);
    expect(st.byGdd('z_triceratops')?.id).toBe('dino-trike');
    expect(st.species.get('f_dino_musicbox')?.category).toBe('item');
  });

  it('roll: 결정적이고 늘 진짜 조각 id', () => {
    const a = Array.from({ length: 40 }, (_, i) => rollFossil(rngFor(`x:${i}`), 'dino').id);
    const b = Array.from({ length: 40 }, (_, i) => rollFossil(rngFor(`x:${i}`), 'dino').id);
    expect(a).toEqual(b);
    const r = rngFor('many');
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) { const f = rollFossil(r, i % 2 ? 'home' : 'dino'); expect(FOSSIL_PIECES).toContain(f); seen.add(f.id); }
    expect(seen.size).toBeGreaterThan(50);
  });
});
