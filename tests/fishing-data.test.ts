// fishing-data — GDD 3.5 물고기 135종 데이터(id·별칭·장소·그림자·크기·태그·가격)·poolFor 거르기·모델 생성기(눈·볼·파츠·크기).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FISH, FISH_BY_ID, FISH_BY_GDD, FISH_ZONES, fishById, fishPrice, poolFor, zonesOf, timeMatches, PUNS, type FishSpecies } from '../src/modules/fishing/data';
import { buildFishModel, displayScale, disposeModel, worldScale, worldLength, animateFish } from '../src/modules/fishing/model';
import { hasDeco, hasPart } from '../src/modules/fishing/species/parts';
import { isPart } from '../src/core/art';
import { rngFor } from '../src/core/rng';
import { sceneStats } from './kit/three';

/** GDD 3.5.1~3.5.11 표의 id 전부(135) */
const GDD_IDS = `f_medaka f_crucian f_chub f_crayfish f_tadpole f_loach f_sakura_medaka f_koi f_petal_goldfish f_sleepy_catfish f_softshell f_salmon
f_ribbon_betta f_axolotl f_rainbow_trout f_leopard_mandarin f_taiyaki f_heart_koi f_lucky_goldkoi f_grandpa_catfish f_cloud_carp
f_sardine f_mackerel f_horse_mackerel f_goby f_moon_jelly f_flounder f_puffer f_squid f_seabream f_rockfish f_octopus f_smile_ray f_red_snapper
f_guppy f_mudskipper f_clownfish f_butterflyfish f_angelfish f_piranha f_archerfish f_blue_tang f_boxfish f_parrotfish f_seahorse f_lionfish
f_porcupine f_moray f_arowana f_napoleon f_arapaima f_rainbow_manta
f_footprint_minnow f_doctorfish f_trilobite f_ammonite f_horseshoe f_lava_goldfish f_sturgeon f_coelacanth f_anomalo f_dunkle
f_smelt f_cod f_char f_hair_crab f_baby_salmon f_snowball_puffer f_clione f_aurora_trout f_king_crab f_narwhal
f_swamp_snail f_moss_catfish f_glow_medaka f_fog_eel f_shroom_jelly f_lantern_trout f_crown_frog f_ghost_carp f_moss_turtle
f_sand_medaka f_hump_crucian f_cactus_puffer f_cave_fish f_mirror_fish f_sand_shark f_mummy_catfish f_scarab_koi f_sand_whale
f_galaxy_crucian f_candy_medaka f_comet_goldfish f_zodiac_aries f_zodiac_taurus f_zodiac_gemini f_zodiac_cancer f_zodiac_leo f_zodiac_virgo
f_zodiac_libra f_zodiac_scorpio f_zodiac_sagittarius f_zodiac_capricorn f_zodiac_aquarius f_zodiac_pisces f_meteor_turtle f_meteor_koi
f_flyingfish f_mahi f_tuna f_marlin f_hammerhead f_sunfish f_whaleshark f_oarfish
f_glass_jelly f_anglerfish f_blobfish f_giant_isopod f_dumbo f_barreleye f_goblin_shark f_giant_squid f_baby_megalodon
f_mochi_crucian f_comet_minnow f_moonlight_jelly f_rabbit_fish f_crater_turtle f_galaxy_tail f_candy_puffer f_cloud_whale_baby f_jelly_salmon f_ring_ray f_blackhole_sunfish`
  .split(/\s+/).filter(Boolean);

/** 웨이브 0 이전 도감 id 102 — 저장 기록이 있으니 하나도 사라지면 안 된다 */
const OLD_IDS = `pirami songsari bungeo ingeo koi megi ssogari euneo sancheoneo yeoneo rainbow-trout sturgeon ppaga gajae jara golden-carp bluegill bass gamulchi
goldfish ranchu tadpole bullfrog-tadpole piranha angelfish discus guppy neon-tetra arowana pirarucu betta pupfish godeungeo jeongaengi sardine ureok
gwangeo gajami chamdom nongeo bok jwichi muneo kkotge saewoo haema ojingeo galchi bungjang moon-jelly starfish sea-urchin clownfish blue-tang
butterflyfish lionfish parrotfish moray stingray sea-turtle manta cleaner-wrasse boxfish mandarin nudibranch sunfish tuna skipjack flyingfish
mahimahi marlin shark hammerhead whale-shark oarfish anglerfish lantern-angler deep-jelly giant-squid dumbo barreleye coelacanth deep-shrimp
blobfish dragonfish bingeo arctic-char daegu clione king-crab icefish snow-crab aurora-trout ice-seal-pup doctor-fish lava-medaka onsen-turtle
flame-carp volcano-eel onsen-shrimp phoenix-goldfish hot-crab`.split(/\s+/).filter(Boolean).map((s) => 'fish-' + s);

const g = (id: string) => fishById(id)!;
const ids = (l: FishSpecies[]) => l.map((f) => f.gdd ?? f.id);

describe('종 데이터', () => {
  it('135종 이상, id 는 모두 다르다', () => {
    expect(GDD_IDS.length).toBe(135);
    expect(FISH.length).toBeGreaterThanOrEqual(135);
    expect(new Set(FISH.map((f) => f.id)).size).toBe(FISH.length);
    expect(FISH_BY_ID.size).toBe(FISH.length);
  });

  it('GDD f_ id 가 전부 종으로 풀린다(예전 id 를 쓰는 종도 gdd 별칭으로)', () => {
    const missing = GDD_IDS.filter((id) => !FISH_BY_GDD.has(id));
    expect(missing).toEqual([]);
    for (const id of GDD_IDS) expect(fishById(id)?.gdd).toBe(id);
    // 짝이 있던 종은 예전 id 를 그대로 쓴다
    expect(g('f_medaka').id).toBe('fish-songsari');
    expect(g('f_koi').id).toBe('fish-koi');
    expect(g('f_taiyaki').id).toBe('f_taiyaki');
  });

  it('예전 도감 id 102개가 하나도 안 사라진다', () => {
    expect(OLD_IDS.length).toBe(102);
    expect(OLD_IDS.filter((id) => !FISH_BY_ID.has(id))).toEqual([]);
  });

  it('모든 종에 len · 그림자 · 장소 · 가격 · 사는 곳 문구가 있다', () => {
    const shadows = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
    for (const f of FISH) {
      expect(f.len, f.id).toBeGreaterThan(0);
      expect(shadows.has(f.shadow), f.id).toBe(true);
      expect(f.where.length, f.id).toBeGreaterThan(0);
      expect(f.price, f.id).toBeGreaterThanOrEqual(10);
      expect(f.habitat, f.id).toMatch(/\S/);
      expect(f.category).toBe('fish');
      for (const z of zonesOf(f)) expect(FISH_ZONES[z], `${f.id} ${z}`).toBeTruthy();
    }
  });

  it('표 값 그대로(장소·시간·날씨·★·크기)', () => {
    const t = g('f_taiyaki');
    expect([t.rarity, t.shadow, t.len, zonesOf(t)]).toEqual([4, 'M', 30, ['river']]);
    expect(t.where[0]).toMatchObject({ island: 'home', zone: 'river', time: ['sunset'] });
    expect(g('f_loach').where[0].weather).toEqual({ boost: ['rain'], x: 3 });
    expect(g('f_rainbow_trout').where[0].weather).toEqual({ only: ['rainbow'] });
    expect(g('f_whaleshark').where[0].weather?.only).toEqual(['rainbow', 'clear']);
    expect(g('f_scarab_koi').where[0]).toMatchObject({ moon: 'full', weather: { only: ['clear'] } });
    expect(g('f_blackhole_sunfish').where[0].moon).toBe('eclipse');
    expect(g('f_mirror_fish').where[0].time).toEqual(['noon']);
    expect(zonesOf(g('f_goby'))).toEqual(['shore', 'estuary']);
    // 모래 낚시(P1) 종은 P0 오아시스에도
    expect(zonesOf(g('f_sand_whale'))).toEqual(['dune', 'oasis']);
    expect(g('f_narwhal').shadow).toBe('XXL');
    expect(g('f_giant_squid').len).toBe(1200);
  });

  it('새 구역: 하트연못·폭포·하구·우주 연못 + P1 우주 바다', () => {
    for (const z of ['heartpond', 'waterfall', 'estuary', 'stream', 'mangrove', 'lagoon', 'footprint', 'ancientlake', 'swamp', 'foglake', 'ruin', 'cave',
      'dune', 'crater', 'icehole', 'icelake', 'icesea', 'moonpond', 'cloudsea', 'jellysea', 'blackhole']) {
      expect(FISH_ZONES[z], z).toBeTruthy();
      expect(FISH.some((f) => zonesOf(f).includes(z)), z).toBe(true);
    }
    const moon = FISH.filter((f) => zonesOf(f).includes('moonpond'));
    expect(moon.map((f) => f.gdd).sort()).toEqual(['f_comet_minnow', 'f_crater_turtle', 'f_mochi_crucian', 'f_moonlight_jelly', 'f_rabbit_fish']);
    expect(moon.every((f) => !f.p1 && f.where[0].island === 'moon')).toBe(true);
  });

  it('태그: 별자리 12 · 무지개구피 7색 · 빛 · 볼빵빵 · 고대 · 우주 물건 · P1', () => {
    const zodiac = FISH.filter((f) => f.tags.includes('set:zodiac'));
    expect(zodiac.length).toBe(12);
    expect(zodiac.every((f) => f.gdd!.startsWith('f_zodiac_') && f.look.pattern === 'constellation')).toBe(true);
    const rainbow = FISH.filter((f) => f.tags.includes('set:rainbow'));
    expect(rainbow.length).toBe(7);
    expect(new Set(rainbow.map((f) => f.look.colors[2])).size).toBe(7);
    expect(rainbow.every((f) => zonesOf(f)[0] === 'stream' && f.rarity === 1)).toBe(true);
    expect(FISH.filter((f) => f.tags.includes('set:glow')).length).toBeGreaterThanOrEqual(8);
    expect(g('f_lava_goldfish').tags).toContain('set:glow');
    expect(g('f_lantern_trout').tags).toContain('set:glow');
    expect(FISH.filter((f) => f.tags.includes('set:ball')).length).toBeGreaterThanOrEqual(10);
    expect(g('f_mochi_crucian').tags).toContain('set:ball');
    expect(FISH.filter((f) => f.tags.includes('ancient')).length).toBeGreaterThanOrEqual(6);
    const space = FISH.filter((f) => f.tags.includes('space-goods'));
    expect(space.length).toBe(11);
    // 심해 9 + 다른 행성 6 = P1
    expect(FISH.filter((f) => f.p1).map((f) => f.gdd).length).toBe(15);
    expect(g('f_baby_megalodon').p1).toBe(true);
  });

  it('가격은 GDD 0.7 공식(BASE × SIZE × ZONE)', () => {
    expect(g('f_medaka').price).toBe(40); // 60 × 0.7 × 1
    expect(g('f_taiyaki').price).toBe(2500); // 2500 × 1 × 1
    expect(g('f_dunkle').price).toBe(17600); // 9000 × 1.7 × 1.15 = 17595
    expect(g('f_whaleshark').price).toBe(25740); // 9000 × 2.2 × 1.3
    expect(g('f_mochi_crucian').price).toBe(90); // 60 × 0.85 × 1.8 = 91.8
    expect(fishPrice(3, 'M', [{ island: 'any', zone: 'shore' }])).toBe(700);
  });

  it('예전 시간·사는 곳 필드도 그대로 채운다(timeMatches)', () => {
    expect(g('f_crayfish').time).toBe('night');
    expect(g('f_chub').time).toBe('day');
    expect(g('f_medaka').time).toBe('all');
    expect(g('f_salmon').time).toBe('evening');
    expect(timeMatches(g('f_chub').time, 'morning')).toBe(true);
    expect(g('f_smile_ray').hab).toEqual(['coast']);
    expect(PUNS[5].length).toBeGreaterThan(0);
  });
});

describe('poolFor — 지금 여기 나오는 종', () => {
  it('구역으로 거른다(섬이 달라도 해안은 같이)', () => {
    const river = poolFor({ island: 'home', zone: 'river', tod: 'day', fallback: false });
    expect(ids(river)).toContain('f_medaka');
    expect(river.every((f) => zonesOf(f).includes('river'))).toBe(true);
    expect(ids(river)).not.toContain('f_sakura_medaka');
    const shoreIce = poolFor({ island: 'ice', zone: 'shore', tod: 'day' });
    const shoreHome = poolFor({ island: 'home', zone: 'shore', tod: 'day' });
    expect(ids(shoreIce)).toEqual(ids(shoreHome));
    expect(ids(shoreIce)).toContain('f_mackerel');
    // 다른 섬의 늪은 섞이지 않는다
    const dinoSwamp = ids(poolFor({ island: 'dino', zone: 'swamp', tod: 'night' }));
    expect(dinoSwamp).toContain('f_sturgeon');
    expect(dinoSwamp).not.toContain('f_glow_medaka');
  });

  it('시간으로 거른다(정오·자정은 시각 창으로)', () => {
    expect(ids(poolFor({ island: 'home', zone: 'heartpond', tod: 'day' }))).toContain('f_heart_koi');
    expect(ids(poolFor({ island: 'home', zone: 'heartpond', tod: 'night' }))).not.toContain('f_heart_koi');
    expect(ids(poolFor({ island: 'home', zone: 'heartpond', hour: 18 }))).toContain('f_ribbon_betta');
    expect(ids(poolFor({ island: 'home', zone: 'river', hour: 19 }))).toContain('f_taiyaki');
    expect(ids(poolFor({ island: 'home', zone: 'river', hour: 10 }))).not.toContain('f_taiyaki');
    // 거울고기: 정오(11~13시) + 맑음
    expect(ids(poolFor({ island: 'desert', zone: 'oasis', hour: 12, weather: 'clear' }))).toContain('f_mirror_fish');
    expect(ids(poolFor({ island: 'desert', zone: 'oasis', hour: 15, weather: 'clear' }))).not.toContain('f_mirror_fish');
    expect(ids(poolFor({ island: 'desert', zone: 'oasis', tod: 'day', noon: true, weather: 'clear' }))).toContain('f_mirror_fish');
  });

  it('날씨 전용은 그 날씨에만, ×n 은 늘 후보(가중치는 rollCatch)', () => {
    const q = { island: 'home', zone: 'waterfall', tod: 'morning' } as const;
    expect(ids(poolFor({ ...q, weather: 'clear' }))).not.toContain('f_cloud_carp');
    expect(ids(poolFor({ ...q, weather: 'rainbow' }))).toContain('f_cloud_carp');
    expect(ids(poolFor({ ...q, weather: 'rainbow' }))).toContain('f_rainbow_trout');
    expect(ids(poolFor({ island: 'home', zone: 'pond', tod: 'day', weather: 'clear' }))).toContain('f_loach');
    // 날씨를 모르면 맑음으로
    expect(ids(poolFor({ island: 'home', zone: 'pond', tod: 'morning' }))).toContain('f_lucky_goldkoi');
    const crater = (w: string) => ids(poolFor({ island: 'launch', zone: 'crater', tod: 'night', weather: w }));
    expect(crater('clear').filter((id) => id.startsWith('f_zodiac_')).length).toBe(10);
    expect(crater('meteor').filter((id) => id.startsWith('f_zodiac_')).length).toBe(12);
  });

  it('달: 보름 · 일식 / P1 은 기본으로 빠진다', () => {
    const q = { island: 'desert', zone: 'ruin', tod: 'night', weather: 'clear' } as const;
    expect(ids(poolFor({ ...q, moonPhase: 0.5 }))).toContain('f_scarab_koi');
    expect(ids(poolFor({ ...q, moonPhase: 0.2 }))).not.toContain('f_scarab_koi');
    expect(ids(poolFor(q))).not.toContain('f_scarab_koi');
    const bh = { island: 'blackhole', zone: 'blackhole', tod: 'day', p1: true } as const;
    expect(ids(poolFor({ ...bh, moonPhase: 0.99 }))).toContain('f_blackhole_sunfish');
    expect(ids(poolFor({ ...bh, moonPhase: 0.5 }))).not.toContain('f_blackhole_sunfish');
    expect(ids(poolFor({ ...bh, p1: false, moonPhase: 0.99 }))).toEqual([]);
    expect(ids(poolFor({ ...bh, moonPhase: 0.5, fallback: false }))).toEqual([]);
    expect(ids(poolFor({ island: 'home', zone: 'deep', tod: 'night' }))).not.toContain('f_anglerfish');
    expect(ids(poolFor({ island: 'home', zone: 'deep', tod: 'night', p1: true }))).toContain('f_anglerfish');
  });

  it('달 연못 P0 5종', () => {
    const day = ids(poolFor({ island: 'moon', zone: 'moonpond', tod: 'day' }));
    expect(day).toEqual(expect.arrayContaining(['f_mochi_crucian', 'f_comet_minnow', 'f_rabbit_fish', 'f_crater_turtle']));
    expect(day).not.toContain('f_moonlight_jelly');
    expect(ids(poolFor({ island: 'moon', zone: 'moonpond', tod: 'night' }))).toContain('f_moonlight_jelly');
  });

  it('표대로 비면 같은 섬 이웃 물 → 시간 풀기로 채운다(fallback)', () => {
    const q = { island: 'home', zone: 'waterfall', tod: 'morning', weather: 'clear' } as const;
    expect(poolFor({ ...q, fallback: false })).toEqual([]);
    const fb = poolFor(q);
    expect(fb.length).toBeGreaterThan(0);
    expect(fb.every((f) => zonesOf(f).includes('river'))).toBe(true);
    // 다른 섬 종은 안 섞이고, 날씨 전용 종은 여전히 막힌다
    const ice = poolFor({ island: 'ice', zone: 'icehole', tod: 'day', weather: 'clear' });
    expect(ice.length).toBeGreaterThan(0);
    expect(ice.every((f) => f.where.some((w) => w.island === 'ice'))).toBe(true);
    expect(ids(ice)).not.toContain('f_snowball_puffer');
  });

  it('P0 낚시 구역마다 어느 시간이든 후보가 있다', () => {
    const P0 = ['river', 'pond', 'waterfall', 'heartpond', 'estuary', 'shore', 'stream', 'mangrove', 'lagoon', 'reef', 'footprint', 'hotspring',
      'ancientlake', 'icehole', 'icelake', 'icesea', 'foglake', 'oasis', 'crater', 'offshore', 'moonpond'];
    for (const z of P0) for (const tod of ['morning', 'day', 'sunset', 'night']) {
      expect(poolFor({ zone: z, tod, weather: 'clear' }).length, `${z} ${tod}`).toBeGreaterThan(0);
    }
  });
});

describe('모델', () => {
  it('모든 종이 만들어지고 눈·볼터치·크기가 맞다', () => {
    for (const sp of FISH) {
      const m = buildFishModel(sp, rngFor('test:' + sp.id));
      const st = sceneStats(m);
      expect(st.triangles, sp.id).toBeLessThan(150_000);
      expect(st.drawCalls, sp.id).toBeLessThan(40);
      const len = m.userData.modelLen as number;
      expect(len, sp.id).toBeGreaterThan(0.4);
      expect(len, sp.id).toBeLessThan(2.2);
      let blush = 0, eyes = 0;
      m.traverse((o) => { if (o.name.startsWith('blush-')) blush++; if (o.userData.eye) eyes++; });
      expect(blush, sp.id).toBeGreaterThanOrEqual(2);
      if (!sp.look.deco?.includes('blind')) expect(eyes, sp.id).toBeGreaterThanOrEqual(2);
      disposeModel(m);
    }
  });

  it('무서운 종(아귀·상어·둔클레오·메갈로돈·고블린상어)은 볼터치 필수', () => {
    for (const id of ['f_anglerfish', 'f_hammerhead', 'f_dunkle', 'f_baby_megalodon', 'f_goblin_shark', 'fish-shark']) {
      const m = buildFishModel(g(id));
      const names: string[] = [];
      m.traverse((o) => names.push(o.name));
      expect(names.filter((n) => n.startsWith('blush-')).length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('쓰인 파츠·장식은 전부 그리는 곳이 있다', () => {
    for (const f of FISH) {
      for (const p of f.look.parts ?? []) { expect(isPart(p), `${f.id} ${p}`).toBe(true); expect(hasPart(p), `${f.id} ${p}`).toBe(true); }
      for (const d of f.look.deco ?? []) expect(hasDeco(d), `${f.id} ${d}`).toBe(true);
    }
  });

  it('숨쉬기 위상은 rng 에서, 떡붕어는 크게 말랑', () => {
    const a = buildFishModel(g('f_mochi_crucian'), rngFor('a'));
    const b = buildFishModel(g('f_mochi_crucian'), { rng: rngFor('b') });
    expect(a.userData.breathePhase).not.toBe(b.userData.breathePhase);
    expect(a.userData.squish).toBe(2.5);
    const inner = a.userData.inner as THREE.Object3D;
    const ph = a.userData.breathePhase as number;
    animateFish(a, -2 * ph); const y0 = inner.scale.y;
    animateFish(a, 1 - 2 * ph); const y1 = inner.scale.y;
    expect(y0).toBeCloseTo(1);
    expect(y1 - y0).toBeGreaterThan(0.1);
    // 늘어나면 옆은 홀쭉(부피 그대로)
    expect(inner.scale.x).toBeLessThan(1);
    const n = buildFishModel(g('f_koi'), rngFor('c'));
    animateFish(n, 0.3);
    expect((n.userData.inner as THREE.Object3D).scale.y).toBeLessThanOrEqual(1.05 + 1e-6);
  });

  it('별사탕송사리 5색은 개체마다(rng)', () => {
    const cols = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const m = buildFishModel(g('f_candy_medaka'), rngFor('candy:' + i));
      const body = m.getObjectByName('body') as THREE.Mesh;
      const c = (body.geometry.getAttribute('color') as THREE.BufferAttribute);
      cols.add([c.getX(c.count >> 1), c.getY(c.count >> 1), c.getZ(c.count >> 1)].map((v) => v.toFixed(2)).join(','));
    }
    expect(cols.size).toBeGreaterThanOrEqual(3);
  });

  it('세상 속 크기 = clamp(len/100, 0.18, 8) m, 들어 올리기 0.55/1.1 m 기준', () => {
    expect(worldLength(g('f_medaka'))).toBeCloseTo(0.18);
    expect(worldLength(g('f_koi'))).toBeCloseTo(0.5);
    expect(worldLength(g('f_whaleshark'))).toBe(8);
    const m = buildFishModel(g('f_koi'));
    expect(worldScale(g('f_koi'), m) * (m.userData.modelLen as number)).toBeCloseTo(0.5);
    expect(displayScale(g('f_koi'), 50)).toBeCloseTo(0.55);
    expect(displayScale(g('f_tuna'), 200)).toBeCloseTo(1.1);
  });
});
