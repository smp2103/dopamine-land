// insects-data — GDD 3.6 곤충 71종 데이터·출현 후보(poolFor)·숨기 표시·몸 모델(STICK·PUFF·CRUST·LEAF·AMBER) 검사.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameState } from '../src/core/state';
import {
  INSECTS, INSECT_BY_ID, INSECT_BY_GDD, LEGACY_INSECTS, GDD_BUG_IDS, poolFor, canAppear, themeOf, insectOf, bugPrice,
  type BugSpecies,
} from '../src/modules/insects/data';
import { bugModel, makeBug, breatheBug, setBugHappy, variantsOf, SLOT, bugMats } from '../src/modules/insects/model';
import { isPart } from '../src/core/art';

/** GDD 3.6.1~3.6.7 표의 id 전부(표 순서) */
const GDD_IDS = [
  // 말랑섬 21
  'b_cabbage_white', 'b_yellow_butterfly', 'b_honeybee', 'b_ladybug', 'b_cicada', 'b_red_dragonfly', 'b_snail', 'b_pillbug',
  'b_water_strider', 'b_cricket', 'b_swallowtail', 'b_sakura_butterfly', 'b_bumblebee', 'b_flower_chafer', 'b_firefly',
  'b_rhino_beetle', 'b_stag_beetle', 'b_rainbow_beetle', 'b_heart_ladybug', 'b_orchid_mantis', 'b_crown_butterfly',
  // 산호빛섬 9
  'b_hermit_crab', 'b_leafcutter', 'b_orange_wasp', 'b_stick_insect', 'b_leaf_insect', 'b_jewel_beetle', 'b_birdwing', 'b_morpho', 'b_hercules',
  // 쿵쿵공룡섬 8
  'b_fern_hopper', 'b_dung_beetle', 'b_lava_firefly', 'b_lava_beetle', 'b_heart_scorpion', 'b_amber_mosquito', 'b_meganeura', 'b_fire_butterfly',
  // 솜눈섬 7
  'b_springtail', 'b_cave_cricket', 'b_snow_bug', 'b_scarf_moth', 'b_snow_ladybug', 'b_frost_butterfly', 'b_aurora_butterfly',
  // 반딧불버섯섬 9
  'b_firefly_swarm', 'b_swamp_dragonfly', 'b_shroom_bug', 'b_jumping_spider', 'b_neon_snail', 'b_ghost_moth', 'b_glasswing', 'b_moon_moth', 'b_firefly_queen',
  // 모래시계섬 8
  'b_desert_hopper', 'b_silver_ant', 'b_scarab', 'b_antlion', 'b_star_scorpion', 'b_tarantula', 'b_sundial_cicada', 'b_golden_scarab',
  // 별똥별섬 9
  'b_wind_dragonfly', 'b_star_firefly', 'b_antenna_moth', 'b_launch_cricket', 'b_meteor_beetle', 'b_satellite_ladybug', 'b_stardust_moth', 'b_galaxy_butterfly', 'b_comet_dragonfly',
];
const PER_ISLAND: Record<string, number> = { home: 21, coral: 9, dino: 8, ice: 7, mushroom: 9, desert: 8, launch: 9 };
const g = (id: string) => INSECT_BY_GDD.get(id)!;
const ids = (list: BugSpecies[]) => list.map((s) => s.gdd ?? s.id);

describe('도감 데이터 — 71종', () => {
  it('GDD 표 71종이 표 순서 그대로, 섬별 개수도 표와 같다', () => {
    expect(GDD_IDS).toHaveLength(71);
    expect([...GDD_BUG_IDS]).toEqual(GDD_IDS);
    expect(INSECTS).toHaveLength(71);
    const per: Record<string, number> = {};
    for (const s of INSECTS) per[s.where[0].island!] = (per[s.where[0].island!] ?? 0) + 1;
    expect(per).toEqual(PER_ISLAND);
  });

  it('모든 GDD b_ id 가 state.byGdd 로 풀린다(옛 id 는 그대로, gdd 별칭)', () => {
    const st = new GameState();
    st.register(INSECTS);
    for (const id of GDD_IDS) {
      const sp = st.byGdd(id);
      expect(sp, id).toBeDefined();
      expect(sp!.gdd).toBe(id);
      expect(insectOf(id)?.id).toBe(sp!.id);
    }
    // 예전 id 정책: 옛 종은 id 를 안 바꾼다
    expect(st.byGdd('b_honeybee')!.id).toBe('bug-honeybee');
    expect(st.byGdd('b_cabbage_white')!.id).toBe('bug-cabbage-white');
    expect(st.byGdd('b_moon_moth')!.id).toBe('bug-luna-moth');
    // 새 종은 GDD id 그대로
    expect(st.byGdd('b_hermit_crab')!.id).toBe('b_hermit_crab');
  });

  it('id 는 겹치지 않는다(옛 종 포함), 옛 종은 도감 칸 밖', () => {
    const all = [...INSECTS, ...LEGACY_INSECTS].map((s) => s.id);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(INSECTS.map((s) => s.gdd)).size).toBe(71);
    expect(INSECT_BY_ID.size).toBe(all.length);
    for (const s of LEGACY_INSECTS) {
      expect(s.p1).toBe(true);
      expect(s.tags).toContain('legacy');
      expect(INSECTS.includes(s)).toBe(false);
    }
  });

  it('모든 종이 where·행동·태그·크기·판매가(0.7 공식)·파츠 어휘를 갖는다', () => {
    for (const s of INSECTS) {
      expect(s.category).toBe('bug');
      expect(s.where.length, s.id).toBeGreaterThan(0);
      expect(['fly', 'hover', 'perch', 'hop', 'crawl', 'hide', 'glow', 'pickup']).toContain(s.behavior);
      expect(s.tags).toContain(`ai:${s.behavior}`);
      expect(s.len).toBeGreaterThan(0);
      expect(s.cm[0]).toBeLessThanOrEqual(s.cm[1]);
      expect(s.price).toBe(bugPrice(s.rarity, s.where[0].island!));
      expect(s.rarity).toBeGreaterThanOrEqual(1);
      expect(s.rarity).toBeLessThanOrEqual(5);
      for (const p of s.look.parts ?? []) expect(isPart(p), `${s.id} ${p}`).toBe(true);
      expect(s.habitat).toBeTruthy();
      expect(s.islands.length).toBeGreaterThan(0);
      expect(s.tods.length).toBeGreaterThan(0);
      for (const c of s.colors) expect(c.toLowerCase()).not.toBe('#000000');
    }
    expect(bugPrice(5, 'home')).toBe(9000);
    expect(bugPrice(1, 'coral')).toBe(70);
  });

  it('조건들이 표대로 들어 있다', () => {
    expect(g('b_snail').where.every((w) => w.weather?.only?.join() === 'rain')).toBe(true);
    expect(g('b_snail').where.map((w) => w.zone)).toEqual(['flower', 'rock']);
    expect(g('b_rainbow_beetle').where[0].weather?.only).toEqual(['rainbow']);
    expect(g('b_crown_butterfly').where[0].weather?.only).toEqual(['clear']);
    expect(g('b_crown_butterfly').minAlt).toBe(15);
    expect(g('b_snow_bug').where[0].weather?.only).toEqual(['snow']);
    expect(g('b_ghost_moth').where[0].weather).toEqual({ boost: ['fog'], x: 3 });
    expect(g('b_stardust_moth').where[0].weather?.only).toEqual(['meteor']);
    expect(g('b_stardust_moth').drop).toEqual({ id: 'm_stardust', n: 3 });
    expect(g('b_aurora_butterfly').where[0].weather?.only).toEqual(['aurora']);
    expect(g('b_moon_moth').moon).toBe('full');
    expect(g('b_firefly_queen').where[0]).toMatchObject({ island: 'mushroom', zone: 'tower', time: 'midnight' });
    expect(g('b_firefly_queen').top).toBe('mushroom-tower');
    expect(g('b_golden_scarab').where[0]).toMatchObject({ island: 'desert', zone: 'pyramid' });
    expect(g('b_golden_scarab').top).toBe('pyramid');
    expect(g('b_heart_ladybug').visit).toBe(2);
    expect(g('b_fire_butterfly').where[0].time).toBe('noon');
    expect(g('b_amber_mosquito').digChance).toBe(0.05);
    expect(g('b_meganeura').tags).toContain('ancient');
  });
});

describe('숨기 표시', () => {
  it('나무 흔들기: 장수풍뎅이·사슴벌레·헤라클레스 / 돌 두드리기: 톡토기·전갈들(+공벌레·용암딱정벌레)', () => {
    for (const id of ['b_rhino_beetle', 'b_stag_beetle', 'b_hercules']) {
      expect(g(id).hide, id).toBe('tree');
      expect(g(id).tags).toContain('hide:tree');
    }
    for (const id of ['b_springtail', 'b_heart_scorpion', 'b_star_scorpion', 'b_pillbug', 'b_lava_beetle']) {
      expect(g(id).hide, id).toBe('rock');
      expect(g(id).tags).toContain('hide:rock');
    }
    expect(g('b_antlion').hide).toBe('pit');
    expect(g('b_amber_mosquito').hide).toBe('dig');
  });

  it('숨는 종은 평소 후보에 없고, 그 계기로만 나온다', () => {
    const night = { island: 'home', zone: 'tree', hour: 23 };
    expect(ids(poolFor(night))).not.toContain('b_rhino_beetle');
    const shaken = ids(poolFor({ ...night, reveal: 'tree' }));
    expect(shaken).toEqual(expect.arrayContaining(['b_rhino_beetle', 'b_stag_beetle']));
    expect(shaken).not.toContain('b_cicada');
    expect(ids(poolFor({ island: 'coral', zone: 'jungle', hour: 23, reveal: 'tree' }))).toEqual(['b_hercules']);
    expect(ids(poolFor({ island: 'ice', zone: 'snow', hour: 12, reveal: 'rock' }))).toEqual(['b_springtail']);
    expect(ids(poolFor({ island: 'ice', zone: 'snow', hour: 12 }))).not.toContain('b_springtail');
    expect(ids(poolFor({ island: 'dino', zone: 'rock', hour: 23, reveal: 'rock' }))).toEqual(['b_heart_scorpion']);
    expect(ids(poolFor({ island: 'desert', zone: 'ruin', hour: 23, reveal: 'rock' }))).toEqual(['b_star_scorpion']);
  });
});

describe('poolFor — 섬·구역·시간·날씨', () => {
  it('날씨 전용(only)은 그 날씨에서만', () => {
    const flower = { island: 'home', zone: 'flower', hour: 12 };
    expect(ids(poolFor({ ...flower, weather: 'clear' }))).not.toContain('b_snail');
    expect(ids(poolFor({ ...flower, weather: 'rain' }))).toContain('b_snail');
    expect(ids(poolFor({ ...flower, weather: 'rain' }))).not.toContain('b_rainbow_beetle');
    expect(ids(poolFor({ ...flower, weather: 'rainbow' }))).toContain('b_rainbow_beetle');
    // 날씨를 안 주면 맑음 — 전용 종은 빠진다
    expect(ids(poolFor(flower))).not.toContain('b_snail');
    // 눈송이벌레: 눈 오는 날, 솜눈섬 어디서든(sky)
    expect(ids(poolFor({ island: 'ice', zone: 'snow', hour: 10, weather: 'snow' }))).toContain('b_snow_bug');
    expect(ids(poolFor({ island: 'ice', zone: 'snow', hour: 10, weather: 'clear' }))).not.toContain('b_snow_bug');
    // 오로라나비 · 별가루나방 · 혜성잠자리
    expect(ids(poolFor({ island: 'ice', zone: 'aurorahill', hour: 23, weather: 'aurora' }))).toContain('b_aurora_butterfly');
    expect(ids(poolFor({ island: 'ice', zone: 'aurorahill', hour: 23, weather: 'clear' }))).not.toContain('b_aurora_butterfly');
    expect(ids(poolFor({ island: 'launch', zone: 'crater', hour: 22, weather: 'meteor' }))).toContain('b_stardust_moth');
    expect(ids(poolFor({ island: 'launch', zone: 'crater', hour: 22, weather: 'clear' }))).not.toContain('b_stardust_moth');
    expect(ids(poolFor({ island: 'launch', zone: 'tower', hour: 22, weather: 'meteor' }))).toEqual(['b_comet_dragonfly']);
  });

  it('왕관나비: 할미벚 언덕 · 아침 · 맑음 전용', () => {
    const q = { island: 'home', zone: 'sakura', hour: 7 };
    expect(ids(poolFor({ ...q, weather: 'clear' }))).toContain('b_crown_butterfly');
    expect(ids(poolFor({ ...q, weather: 'rain' }))).not.toContain('b_crown_butterfly');
    expect(ids(poolFor({ ...q, hour: 12, weather: 'clear' }))).not.toContain('b_crown_butterfly');
  });

  it('정오·자정 창(불꽃나비 정오, 반딧불여왕 자정)', () => {
    expect(ids(poolFor({ island: 'dino', zone: 'crater', hour: 12, weather: 'clear' }))).toContain('b_fire_butterfly');
    expect(ids(poolFor({ island: 'dino', zone: 'crater', hour: 15, weather: 'clear' }))).not.toContain('b_fire_butterfly');
    expect(ids(poolFor({ island: 'mushroom', zone: 'tower', hour: 1 }))).toEqual(['b_firefly_queen']);
    expect(ids(poolFor({ island: 'mushroom', zone: 'tower', hour: 23 }))).toEqual([]);
    // tod/noon/midnight 를 직접 줘도 된다
    expect(ids(poolFor({ island: 'mushroom', zone: 'tower', tod: 'night', midnight: true }))).toEqual(['b_firefly_queen']);
  });

  it('섬·구역·시간대가 맞는 종만, 별똥별섬은 고유 9종만', () => {
    const home = poolFor({ island: 'home', zone: 'flower', hour: 12 });
    for (const s of home) expect(s.where.every((w) => w.island === 'home' && w.zone === 'flower')).toBe(true);
    expect(ids(home)).toEqual(expect.arrayContaining(['b_cabbage_white', 'b_honeybee', 'b_swallowtail', 'b_flower_chafer']));
    expect(ids(home)).not.toContain('b_ladybug'); // 아침에만
    expect(ids(poolFor({ island: 'home', zone: 'flower', hour: 7 }))).toContain('b_ladybug');
    // 별똥별섬: 어느 구역·시간·날씨든 다른 섬 종이 섞이지 않는다
    const launch = new Set<string>();
    for (const zone of [undefined, 'hill', 'antenna', 'pad', 'meadow', 'crater', 'telescope', 'wreckshore', 'tower'])
      for (const hour of [0, 6, 12, 18, 22]) for (const weather of ['clear', 'meteor', 'rain'])
        for (const reveal of [null, 'tree', 'rock'] as const) for (const s of poolFor({ island: 'launch', zone, hour, weather, reveal })) launch.add(s.gdd!);
    expect([...launch].sort()).toEqual(GDD_IDS.slice(-9).sort());
  });

  it('섬 id(islet-a)는 테마로, 보물 섬엔 말랑섬의 흔한 친구들', () => {
    expect(themeOf('islet-c')).toBe('islet');
    const islet = poolFor({ island: 'islet-a', zone: 'palm', hour: 12 });
    expect(islet.length).toBeGreaterThan(2);
    for (const s of islet) expect(s.rarity).toBe(1);
  });

  it('돌려준 where 는 지금 맞는 줄만(rollCatch 가 바로 쓴다), 원본은 안 바뀐다', () => {
    const p = poolFor({ island: 'home', zone: 'rock', hour: 3, weather: 'rain' }).find((s) => s.gdd === 'b_snail')!;
    expect(p.where).toHaveLength(1);
    expect(p.where[0].zone).toBe('rock');
    expect(g('b_snail').where).toHaveLength(2);
    expect(INSECT_BY_ID.get(p.id)).toBe(g('b_snail'));
  });

  it('달나방 배율은 보름달 때만, 하트무당벌레는 친구 방문 중 ×2', () => {
    const q = { island: 'mushroom', zone: 'giant', hour: 23, weather: 'clear' };
    const off = poolFor(q).find((s) => s.gdd === 'b_moon_moth')!;
    expect(off.where[0].weather).toBeUndefined();
    const on = poolFor({ ...q, fullMoon: true }).find((s) => s.gdd === 'b_moon_moth')!;
    expect(on.where[0].weather).toEqual({ boost: ['clear'], x: 3 });
    const h = { island: 'home', zone: 'heartpond', hour: 12, weather: 'rain' };
    expect(poolFor(h).find((s) => s.gdd === 'b_heart_ladybug')!.where[0].weather).toBeUndefined();
    expect(poolFor({ ...h, visiting: true }).find((s) => s.gdd === 'b_heart_ladybug')!.where[0].weather).toEqual({ boost: ['rain'], x: 2 });
    // 유령나방: 안개 ×3 은 그대로 남는다
    expect(poolFor({ island: 'mushroom', zone: 'shipwreck', hour: 23, weather: 'fog' }).find((s) => s.gdd === 'b_ghost_moth')!.where[0].weather).toEqual({ boost: ['fog'], x: 3 });
  });

  it('같은 입력이면 같은 결과, spot 으로도 거른다, canAppear', () => {
    const q = { island: 'coral', zone: 'jungle', hour: 12 };
    expect(ids(poolFor(q))).toEqual(ids(poolFor(q)));
    expect(ids(poolFor({ ...q, spot: 'tree' }))).toEqual(['b_leaf_insect']);
    expect(canAppear(g('b_hercules'), { island: 'coral', zone: 'jungle', hour: 23 })).toBe(true);
    expect(canAppear(g('b_hercules'), { island: 'coral', zone: 'jungle', hour: 12 })).toBe(false);
  });

  it('71종 모두 어딘가 어느 때엔 나온다(조건 조합 전수)', () => {
    const seen = new Set<string>();
    const weathers = ['clear', 'rain', 'fog', 'meteor', 'snow', 'rainbow', 'aurora'];
    for (const s of INSECTS) for (const w of s.where) for (const hour of [0.5, 6, 12, 19, 23]) for (const weather of weathers)
      if (poolFor({ island: w.island, zone: w.zone, hour, weather, reveal: s.hide ?? null }).some((p) => p.id === s.id)) seen.add(s.id);
    expect(seen.size).toBe(71);
  });
});

describe('몸 모델', () => {
  it('새 몸형(STICK·PUFF·CRUST·LEAF·AMBER)과 모든 종이 만들어지고, art 눈·볼 칸을 쓴다', () => {
    const mats = bugMats();
    for (const s of INSECTS) {
      const m = bugModel(s);
      expect(m.geo.attributes.position.count, s.id).toBeGreaterThan(50);
      expect(m.height).toBeGreaterThan(0.05);
      // art 눈·볼터치 재질 그룹이 들어 있다(GDD 7.2) — 두 눈이 한 그룹
      expect(m.mats, s.id).toContain(mats[SLOT.EYE]);
      expect(m.mats, s.id).toContain(mats[SLOT.BLUSH]);
      expect(m.mats.length, s.id).toBeLessThanOrEqual(8);
      expect(m.geo.groups.length).toBe(m.mats.length);
      expect(m.geo.userData.shared).toBe(true);
    }
    expect(g('b_stick_insect').kind).toBe('stick');
    expect(g('b_springtail').kind).toBe('puff');
    expect(g('b_hermit_crab').kind).toBe('crust');
    expect(g('b_leaf_insect').kind).toBe('leaf');
    expect(bugModel(g('b_amber_mosquito')).mats).toContain(mats[SLOT.CLEAR]);
  });

  it('반딧불·혜성잠자리는 빛 위치, 날개 있는 종은 날개', () => {
    expect(bugModel(g('b_firefly')).glow).toBeInstanceOf(THREE.Vector3);
    expect(bugModel(g('b_firefly_queen')).glow).toBeTruthy();
    expect(bugModel(g('b_comet_dragonfly')).glow).toBeTruthy();
    expect(bugModel(g('b_neon_snail')).glow).toBeTruthy();
    expect(bugModel(g('b_snow_bug')).wing).toBeTruthy();
    expect(bugModel(g('b_springtail')).wing).toBeNull();
    expect(bugModel(g('b_crown_butterfly')).wing).toBeTruthy();
  });

  it('소라게 껍데기 색은 개체 위상으로 변주(같은 위상 = 같은 모델 공유)', () => {
    const crab = g('b_hermit_crab');
    expect(variantsOf(crab)).toBeGreaterThan(1);
    const a = makeBug(crab, 1, 0.05), b = makeBug(crab, 1, 0.95), c = makeBug(crab, 1, 0.05);
    expect(a.model).not.toBe(b.model);
    expect(a.model).toBe(c.model);
    expect(variantsOf(g('b_honeybee'))).toBe(1);
  });

  it('숨쉬기 1.00↔1.05, 잡힌 표정은 그 개체 재질만 바꾼다', () => {
    const bug = makeBug(g('b_ladybug'), 1, 0);
    breatheBug(bug, 0);
    const s0 = bug.body.scale.y;
    breatheBug(bug, 0.5);
    const s1 = bug.body.scale.y;
    expect(Math.min(s0, s1)).toBeGreaterThanOrEqual(1);
    expect(Math.max(s0, s1)).toBeLessThanOrEqual(1.0501);
    expect(Math.abs(s1 - s0)).toBeGreaterThan(0.01);
    const other = makeBug(g('b_ladybug'), 1, 0.5);
    setBugHappy(bug, true);
    expect(bug.body.material).not.toBe(other.body.material);
    expect(other.body.material).toBe(bug.model.mats);
    setBugHappy(bug, false);
    expect(bug.body.material).toBe(bug.model.mats);
  });
});
