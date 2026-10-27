// 날씨 연출(atmosphere/sky.ts 순수 고르기·섞기 + 소원 반짝이) — 날씨별 켜질 층, 유성우·오로라 밤 전용, 계절 색 표, 일요일 별가루 ×2,
// 5초 섞기, 달 위상, 밤눈 특전, 세계 구름 자리.
import { describe, it, expect, beforeEach } from 'vitest';
import { WEATHERS, SEASONS, HOUR_SEC, DAY_SEC, type Weather, type Season } from '../src/core/api';
import {
  THEMES, LAYERS, LAYER_OBJECT, WEATHER_LAYERS, SEASON_TINT, BLEND_SEC,
  blendToward, layerAmounts, activeLayers, oneHot, nightGate, moonLook, wishYield, nightVisionBoost,
  wishSpots, buildWishes, WISH_PER_HOUR, type LayerInput, type LayerName,
} from '../src/modules/atmosphere/sky';
import { worldCloudSpots, WORLD_CLOUD } from '../src/modules/atmosphere/clouds';
import { rngFor } from '../src/core/rng';
import * as Island from '../src/core/island';
import { stubLocalStorage } from './kit/storage';
import { makeFakeGame, makeCtx, recordEvents } from './kit/fakeGame';

/** 기본 입력: 그 날씨 하나만, 섬 분위기 없음, 여름(꽃잎·서리 없음), 물 밖 */
function input(w: Weather, o: Partial<LayerInput> = {}): LayerInput {
  return { mix: oneHot(w), night: 0, theme: {}, season: 'summer', under: 1, space: false, ...o };
}

describe('blendToward — 날씨·섬 분위기 5초 섞기', () => {
  it('정확히 5초에 도착하고, 그 전엔 중간값', () => {
    let v = 0;
    for (let i = 0; i < 150; i++) v = blendToward(v, 1, 1 / 60);
    expect(v).toBeGreaterThan(0.45);
    expect(v).toBeLessThan(0.55);
    for (let i = 0; i < 150; i++) v = blendToward(v, 1, 1 / 60);
    expect(v).toBe(1);
    expect(BLEND_SEC).toBe(5);
  });
  it('내려갈 때도 같은 빠르기, 넘치지 않는다', () => {
    expect(blendToward(1, 0, 1)).toBeCloseTo(0.8);
    expect(blendToward(0.1, 0, 1)).toBe(0);
  });
  it('dt 0(촬영 모드·첫 프레임)이면 바로 목표', () => {
    expect(blendToward(0, 1, 0)).toBe(1);
    expect(blendToward(0.3, 0, NaN)).toBe(0);
  });
});

describe('layerAmounts — 날씨별 켜지는 층', () => {
  const on = (i: LayerInput) => new Set(activeLayers(i));

  it('맑은 낮 바다: 아무 층도 없다', () => {
    expect(activeLayers(input('clear'))).toEqual([]);
  });

  it('비: 빗줄기 + 비구름 지붕, 번개는 없다', () => {
    const s = on(input('rain'));
    expect(s.has('rain')).toBe(true);
    expect(s.has('storm-deck')).toBe(true);
    expect(s.has('bolt')).toBe(false);
  });

  it('폭풍: 빗줄기 ×1.6 + 지붕 + 번개', () => {
    const a = layerAmounts(input('storm'));
    const rain = layerAmounts(input('rain'));
    expect(a.rain).toBeCloseTo(1.6);
    expect(rain.rain).toBeCloseTo(1);
    expect(a.bolt).toBe(1);
    expect(a['storm-deck']).toBeGreaterThan(rain['storm-deck']);
  });

  it('안개: 하얀 안개 덩이', () => {
    expect([...on(input('fog'))]).toEqual(['mist']);
  });

  it('눈 / 눈보라(솜눈섬): 눈 · 눈보라 줄 · 하얀 시야', () => {
    expect(on(input('snow')).has('snow')).toBe(true);
    const b = on(input('blizzard', { theme: { ice: 1 } }));
    for (const l of ['snow', 'blizzard', 'whiteout'] as LayerName[]) expect(b.has(l)).toBe(true);
    // 눈보라가 눈보다 펑펑(최대 1.8)
    expect(layerAmounts(input('blizzard', { theme: { ice: 1 } })).snow).toBeCloseTo(1.8);
  });

  it('모래폭풍(모래시계섬): 모래 알갱이 몇 배 + 모래 안개', () => {
    const a = layerAmounts(input('sandstorm', { theme: { desert: 1 } }));
    expect(a.sand).toBe(4);
    expect(a.dust).toBe(1);
    // 그냥 사막 맑은 날은 모래바람만 조금
    const c = layerAmounts(input('clear', { theme: { desert: 1 } }));
    expect(c.sand).toBe(1);
    expect(c.dust).toBe(0);
  });

  it('무지개: 낮에만', () => {
    expect(layerAmounts(input('rainbow')).rainbow).toBe(1);
    expect(layerAmounts(input('rainbow', { night: 1 })).rainbow).toBe(0);
  });

  it('WEATHER_LAYERS 표와 실제 결과가 맞는다(그 날씨 밤/섬에서)', () => {
    for (const w of WEATHERS) {
      const i = input(w, { night: w === 'meteor' || w === 'aurora' ? 1 : 0, theme: w === 'blizzard' || w === 'snow' || w === 'aurora' ? { ice: 1 } : w === 'sandstorm' ? { desert: 1 } : {} });
      const s = on(i);
      for (const l of WEATHER_LAYERS[w]) expect(s.has(l), `${w} → ${l}`).toBe(true);
    }
  });

  it('잠수 중·우주에선 모두 꺼진다', () => {
    for (const w of WEATHERS) {
      expect(activeLayers(input(w, { night: 1, under: 0, theme: { ice: 1, dino: 1 } }))).toEqual([]);
      expect(activeLayers(input(w, { night: 1, space: true, theme: { ice: 1 } }))).toEqual([]);
    }
  });

  it('섬 파티클: 공룡섬 화산재·불씨, 버섯섬 포자, 산호섬 반짝', () => {
    expect(on(input('clear', { theme: { dino: 1 } })).has('ash')).toBe(true);
    expect(layerAmounts(input('clear', { theme: { dino: 1 }, night: 1 })).embers).toBe(1);
    expect(on(input('clear', { theme: { mushroom: 1 } })).has('spores')).toBe(true);
    expect(on(input('clear', { theme: { coral: 1 } })).has('sparkle')).toBe(true);
  });

  it('밤 풀숲 빛 점은 밤에만, 비가 오면 꺼진다', () => {
    expect(layerAmounts(input('clear', { night: 1 })).glow).toBe(1);
    expect(layerAmounts(input('clear', { night: 0.2 })).glow).toBe(0);
    expect(layerAmounts(input('rain', { night: 1 })).glow).toBe(0);
  });

  it('층 이름 ↔ 장면 오브젝트 이름이 모두 있고 겹치지 않는다', () => {
    const names = LAYERS.map((l) => LAYER_OBJECT[l]);
    expect(names.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('유성우·오로라 — 밤 전용', () => {
  it('유성우: 낮엔 별똥별·소원 반짝이 없음, 밤엔 있음', () => {
    const day = layerAmounts(input('meteor', { night: 0 }));
    expect(day.meteor).toBe(0);
    expect(day.wishes).toBe(0);
    const dusk = layerAmounts(input('meteor', { night: 0.3 }));
    expect(dusk.meteor).toBe(0);
    const n = layerAmounts(input('meteor', { night: 1 }));
    expect(n.meteor).toBe(1);
    expect(n.wishes).toBe(1);
  });
  it('밤 문은 부드럽게 열린다(0.45 → 0.85)', () => {
    expect(nightGate(0.45)).toBe(0);
    expect(nightGate(0.65)).toBeCloseTo(0.5);
    expect(nightGate(0.85)).toBe(1);
  });
  it('오로라: 오로라 날씨 밤 = 꽉, 솜눈섬 맑은 밤 = 옅게, 다른 섬 맑은 밤 = 없음, 낮 = 없음', () => {
    expect(layerAmounts(input('aurora', { night: 1, theme: { ice: 1 } })).aurora).toBe(1);
    expect(layerAmounts(input('aurora', { night: 0, theme: { ice: 1 } })).aurora).toBe(0);
    const faint = layerAmounts(input('clear', { night: 1, theme: { ice: 1 } })).aurora;
    expect(faint).toBeGreaterThan(0.1);
    expect(faint).toBeLessThan(0.5);
    expect(layerAmounts(input('clear', { night: 1, theme: { home: 1 } })).aurora).toBe(0);
  });
});

describe('계절 색 표', () => {
  it('네 계절 모두 있고 은은하다(섞는 양 ≤ 0.5, 채도 ±0.05)', () => {
    for (const s of SEASONS) {
      const t = SEASON_TINT[s];
      expect(t.gain).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.fog).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.amount).toBeGreaterThan(0);
      expect(t.amount).toBeLessThanOrEqual(0.5);
      expect(Math.abs(t.sat)).toBeLessThanOrEqual(0.05);
      expect(t.fogAmount).toBeLessThanOrEqual(0.2);
    }
  });
  it('봄 = 꽃잎, 겨울 = 서리, 가을 = 따뜻한 색(빨강 > 파랑)', () => {
    const only = (key: 'petals' | 'frost') => SEASONS.filter((s) => SEASON_TINT[s][key] > 0);
    expect(only('petals')).toEqual(['spring']);
    expect(only('frost')).toEqual(['winter']);
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [ar, , ab] = rgb(SEASON_TINT.autumn.gain);
    expect(ar).toBeGreaterThan(ab);
    const [wr, , wb] = rgb(SEASON_TINT.winter.gain);
    expect(wb).toBeGreaterThan(wr);
  });
  it('봄 꽃잎은 섬 위에서만, 비 오면 그친다 · 겨울 서리는 섬 위에서', () => {
    const spring = (w: Weather, theme: Record<string, number>) => layerAmounts(input(w, { season: 'spring', theme })).petals;
    expect(spring('clear', { home: 1 })).toBeGreaterThan(0.5);
    expect(spring('clear', {})).toBe(0);
    expect(spring('rain', { home: 1 })).toBe(0);
    const winter: Season = 'winter';
    expect(layerAmounts(input('clear', { season: winter, theme: { home: 1 } })).frost).toBeGreaterThan(0.5);
    expect(layerAmounts(input('clear', { season: 'summer', theme: { home: 1 } })).frost).toBe(0);
  });
});

describe('섬 분위기 표(THEMES)', () => {
  it('말랑섬·별똥별섬이 있고, 별똥별섬 밤은 남색 하늘 + 별 ×2', () => {
    expect(THEMES.home).toBeTruthy();
    expect(THEMES.launch.night?.stars).toBe(2);
    expect(THEMES.launch.night?.skyTop).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('모든 큰 섬 테마에 분위기가 있다', () => {
    for (const d of Island.ISLANDS) if (d.theme !== 'islet') expect(THEMES[d.theme], d.theme).toBeTruthy();
  });
});

describe('달 · 밤눈 특전', () => {
  it('보름(0.45~0.55) = 가장 크고 밝다, 그믐 = 작고 어둡다', () => {
    const full = moonLook(0.5), win = moonLook(0.47), nw = moonLook(0.01), q = moonLook(0.25);
    expect(full.full).toBe(1);
    expect(win.full).toBe(1);
    expect(full.radius).toBeGreaterThan(q.radius);
    expect(q.radius).toBeGreaterThan(nw.radius);
    expect(full.bright).toBe(1);
    expect(nw.bright).toBeLessThan(0.5);
    // 빛 방향: 보름 = 정면(π)
    expect(full.light).toBeCloseTo(Math.PI);
  });
  it('밤눈: 특전 있을 때 밤에만 노출 +', () => {
    expect(nightVisionBoost(false, 1)).toBe(0);
    expect(nightVisionBoost(true, 0)).toBe(0);
    expect(nightVisionBoost(true, 1)).toBeGreaterThan(0.05);
    expect(nightVisionBoost(true, 1)).toBeLessThan(0.3);
  });
});

describe('세계 구름 — 바다 위 120~200 m', () => {
  it('높이 범위 안, 같은 청크는 늘 같은 자리', () => {
    let n = 0;
    for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) {
      const a = worldCloudSpots(rngFor, Island.heightAt, cx, cz);
      const b = worldCloudSpots(rngFor, Island.heightAt, cx, cz);
      expect(a).toEqual(b);
      for (const s of a) {
        expect(s.y).toBeGreaterThanOrEqual(WORLD_CLOUD.minY);
        expect(s.y).toBeLessThanOrEqual(WORLD_CLOUD.maxY);
        // 산꼭대기와 60 m 이상
        expect(s.y - Math.max(0, Island.heightAt(s.x, s.z))).toBeGreaterThanOrEqual(60);
        n++;
      }
    }
    expect(n).toBeGreaterThan(20);
  });
});

describe('별똥별섬 소원 반짝이 — E → 별가루, 일요일 ×2', () => {
  beforeEach(() => stubLocalStorage());

  it('wishYield: 일요일(6)만 ×2', () => {
    for (let wd = 0; wd < 7; wd++) expect(wishYield(wd)).toBe(wd === 6 ? 2 : 1);
  });

  it('자리: 크레이터 둘레 마른 땅, 결정적', () => {
    const ctx = { rng: rngFor, island: Island };
    const a = wishSpots(ctx, 100), b = wishSpots(ctx, 100);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(WISH_PER_HOUR / 2);
    const c = Island.PLACES.crater;
    for (const s of a) {
      const d = Math.hypot(s.x - c.x, s.z - c.z);
      expect(d).toBeGreaterThan(c.r);
      expect(d).toBeLessThan(c.r * 3.6);
      expect(s.y).toBeGreaterThan(0.5);
    }
  });

  /** 유성우 밤 별똥별섬 크레이터 옆에 선 가짜 게임 + 반짝이 */
  function setup(day: number) {
    const c = Island.PLACES.crater;
    const game = makeFakeGame({ pos: [c.x, c.z], day, hour: 23 });
    const ctx = makeCtx(game);
    const w = buildWishes(ctx);
    const sec = day * DAY_SEC + 23 * HOUR_SEC + HOUR_SEC * 0.9; // 그 시간 반짝이가 다 떨어진 뒤
    const cam = game.engine.camera.position.set(c.x, 40, c.z);
    w.update(0, true, cam, sec, day, false);
    const env = game.env as unknown as { gameSec: number };
    env.gameSec = sec;
    const spot = w.landed()[0];
    expect(spot).toBeTruthy();
    game.player.teleport(spot.x, spot.z);
    return { game, w, spot, ev: recordEvents(game) };
  }

  it('가까이 가면 "별똥별에 소원 빌기", E → 별가루 + harvest{kind:"meteor"}', () => {
    const { game, ev } = setup(2); // 수요일
    const row = game.listInteractions().find((r) => r.id === 'atmosphere:wish');
    expect(row?.label).toContain('소원');
    expect(game.interact('atmosphere:wish')).toBe(true);
    expect(game.state.bag.m_stardust).toBe(1);
    const h = ev.of('harvest');
    expect(h.length).toBe(1);
    expect(h[0]).toMatchObject({ kind: 'meteor', item: 'm_stardust', n: 1, island: 'launch' });
  });

  it('일요일은 별가루 ×2', () => {
    const { game, ev } = setup(6);
    expect(game.interact('atmosphere:wish')).toBe(true);
    expect(game.state.bag.m_stardust).toBe(2);
    expect(ev.of('harvest')[0]).toMatchObject({ kind: 'meteor', n: 2 });
  });

  it('같은 반짝이는 한 번만, 주운 기록은 flags.env.wish 에', () => {
    const { game, w, spot } = setup(3);
    expect(game.interact('atmosphere:wish')).toBe(true);
    expect(w.landed().some((s) => s.key === spot.key)).toBe(false);
    const f = game.state.flags.env as { wish?: { day: number; keys: string[] } };
    expect(f.wish?.day).toBe(3);
    expect(f.wish?.keys).toContain(spot.key);
  });

  it('23시에 주운 반짝이는 자정을 넘겨도 다시 줍지 못한다', () => {
    const { game, w } = setup(4);
    const env = game.env as unknown as { gameSec: number };
    const before = w.landed().map((s) => s.key);
    expect(before.length).toBeGreaterThan(0);
    while (w.landed().length) expect(w.pickAny()).toBeGreaterThan(0);
    const got = game.state.bag.m_stardust;
    // 0.5시간 뒤 = 다음 날 0시 반: 23시 것은 한 시간 더 남는 자리
    env.gameSec += HOUR_SEC * 0.5;
    w.update(0, true, game.engine.camera.position, env.gameSec, 5, false);
    const after = w.landed().map((s) => s.key);
    for (const k of before) expect(after).not.toContain(k);
    expect(game.state.bag.m_stardust).toBe(got);
    // 다시 만든 반짝이(새 건물)도 저장된 열쇠를 읽어 같은 판단
    const w2 = buildWishes(makeCtx(game));
    w2.update(0, true, game.engine.camera.position, env.gameSec, 5, false);
    for (const k of before) expect(w2.landed().map((s) => s.key)).not.toContain(k);
  });

  it('주운 기록을 저장할 때 flags.env.sec 도 함께 적는다', () => {
    const { game } = setup(3);
    expect(game.interact('atmosphere:wish')).toBe(true);
    const f = game.state.flags.env as { sec?: number };
    expect(typeof f.sec).toBe('number');
  });

  it('가방이 꽉 차 못 받으면 반짝이는 그대로 남는다', () => {
    const { game, w, spot } = setup(2);
    (game as unknown as { econ: unknown }).econ = { give: () => 0 };
    expect(w.pickAny()).toBe(0);
    expect(w.landed().some((s) => s.key === spot.key)).toBe(true);
  });

  it('유성우가 아니면(active=false) 반짝이도 상호작용도 없다', () => {
    const { game, w } = setup(1);
    w.update(0, false, game.engine.camera.position, (game.env as unknown as { gameSec: number }).gameSec, 1, false);
    expect(game.listInteractions().some((r) => r.id === 'atmosphere:wish')).toBe(false);
  });
});
