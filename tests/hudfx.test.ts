// hudfx — 순수 규칙(hudfx/logic.ts): 잡았다 5단계 고르기, 변이 도장, 게이지 보이기(두근·수영 힘·산소·달 산소),
// 날씨 → 배너 글, 섬 발견 카드, 해금 세리머니, 인기 생물 토스트, 콤보 팝, 상자 쏟아짐 차례, 차례 큐, 지도 도장 펀치.
import { describe, it, expect } from 'vitest';
import {
  tierOf, catchPlan, crownLine, cmText, recordVariant, gaugePlan, gaugeSig, crossedHot, isFishing, isNetting, nearChest, GAUGE_IDS, GAUGE_LINGER,
  comboPop, weatherBanner, discoverCard, ceremonyOf, hotToast, cascadeDelay, cascadePlan, coinBurst, SHAKE_SEC, Sequencer, stampPunch, TIER_COLOR,
  type GaugeIn, type VariantSeen,
} from '../src/modules/hudfx/logic';
import { WEATHERS } from '../src/core/api';

describe('잡았다 5단계(GDD 5.1)', () => {
  it('희귀도 → 단계(1..5 로 자른다)', () => {
    expect(tierOf(1)).toBe(1);
    expect(tierOf(3)).toBe(3);
    expect(tierOf(5)).toBe(5);
    expect(tierOf(0)).toBe(1);
    expect(tierOf(9)).toBe(5);
    expect(tierOf('x')).toBe(1);
    expect(tierOf(2.6)).toBe(3);
    for (const t of [1, 2, 3, 4, 5] as const) expect(TIER_COLOR[t]).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('★1 퐁 + 별 · ★2 초록 반짝 + 음표', () => {
    const p1 = catchPlan({ rarity: 1, isNew: false });
    expect(p1.pong).toBe(true);
    expect(p1.sparkle).toBe(false);
    expect(p1.slowmo).toBeNull();
    expect(p1.ring).toBe('none');
    expect(p1.stamps).toEqual([]);
    const p2 = catchPlan({ rarity: 2, isNew: false });
    expect(p2.sparkle).toBe(true);
    expect(p2.pong).toBe(false);
    expect(p2.zoom).toBe(1);
  });
  it('★3 슬로모 0.5초(0.35) · 파란 링 · 줌 · 색종이', () => {
    const p = catchPlan({ rarity: 3, isNew: false });
    expect(p.slowmo).toEqual({ scale: 0.35, ms: 500 });
    expect(p.ring).toBe('blue');
    expect(p.zoom).toBeLessThan(1);
    expect(p.confetti).toBeGreaterThan(0);
    expect(p.freezeMs).toBe(0);
    expect(p.clap).toBe(false);
  });
  it('★4 보라 비네트 · 1초 회전 쇼케이스 · 무지개 링 · 박수', () => {
    const p = catchPlan({ rarity: 4, isNew: false });
    expect(p.vignette).toBe(true);
    expect(p.showcaseMs).toBe(1000);
    expect(p.ring).toBe('rainbow');
    expect(p.clap).toBe(true);
    expect(p.slowmo).toBeNull();
    expect(p.skyTint).toBe(false);
  });
  it('★5 금빛 하늘 · 1초 정지 · 빛기둥 · 코인 분수 · 전설 도장 · cheer', () => {
    const p = catchPlan({ rarity: 5, isNew: false });
    expect(p.skyTint).toBe(true);
    expect(p.freezeMs).toBe(1000);
    expect(p.pillar).toBe(true);
    expect(p.coins).toBeGreaterThan(0);
    expect(p.cheer).toBe(true);
    expect(p.stamps.map((s) => s.kind)).toEqual(['legend']);
    expect(p.stamps[0].text).toBe('전설!');
    // 도장은 정지 프레임이 풀린 뒤에 쾅
    expect(p.stamps[0].delay).toBeGreaterThanOrEqual(p.freezeMs);
    // 목격은 코인 분수가 작다
    expect(catchPlan({ rarity: 5, isNew: false, keep: false }).coins).toBeLessThan(p.coins);
  });
  it('NEW · 반짝이 · 왕관 도장(순서대로 쾅쾅) + 무지개 테두리', () => {
    const p = catchPlan({ rarity: 2, isNew: true, variant: 'shiny', variantNew: true });
    expect(p.stamps.map((s) => s.kind)).toEqual(['new', 'shiny']);
    expect(p.stamps[0].text).toBe('NEW!');
    expect(p.stamps[1].text).toContain('반짝이!');
    expect(p.stamps[1].delay).toBeGreaterThan(p.stamps[0].delay);
    expect(p.rainbowBorder).toBe(true);
    const c = catchPlan({ rarity: 1, isNew: false, variant: 'crown' });
    expect(c.stamps.map((s) => s.kind)).toEqual(['crown']);
    expect(c.rainbowBorder).toBe(false);
    expect(catchPlan({ rarity: 1, isNew: false, variant: 'tiny' }).stamps).toEqual([]);
    // 도장이 다 찍히고 남을 시간
    const all = catchPlan({ rarity: 5, isNew: true, variant: 'shiny' });
    expect(all.stamps.map((s) => s.kind)).toEqual(['new', 'legend', 'shiny']);
    expect(all.ms).toBeGreaterThan(all.stamps[2].delay + 1000);
  });
  it('왕관 기록 줄', () => {
    expect(crownLine(71, 62)).toBe('최대 크기 경신! 62cm → 71cm');
    expect(crownLine(71.25, undefined)).toBe('최대 크기 기록! 71.3cm');
    expect(crownLine(50, 62)).toContain('최고 62cm');
    expect(crownLine(undefined, 62)).toBeNull();
    expect(cmText(12)).toBe('12cm');
  });
  it('본 변이 기록(flags.hud.variants)', () => {
    const seen: VariantSeen = {};
    expect(recordVariant(seen, 'f_carp', 'shiny')).toBe(true);
    expect(recordVariant(seen, 'f_carp', 'shiny')).toBe(false);
    expect(recordVariant(seen, 'f_carp', 'crown')).toBe(true);
    expect(recordVariant(seen, 'f_carp', undefined)).toBe(false);
    expect(seen).toEqual({ f_carp: ['shiny', 'crown'] });
  });
});

describe('게이지 보이기(GDD 5.3)', () => {
  const base = (o: Partial<GaugeIn> = {}): GaugeIn => ({
    now: 100, world: 'earth', action: null, mode: 'ground', current: null,
    pity: { fish: 0.3, bug: 0.5, dive: 0.1, chest: 0.2 }, ocean: null, moon: null, ...o,
  });
  it('동작 이름 읽기', () => {
    expect(isFishing('fish')).toBe(true);
    expect(isFishing('fish-catch')).toBe(true);
    expect(isFishing('reel')).toBe(true);
    expect(isFishing('net')).toBe(false);
    expect(isNetting('net')).toBe(true);
    expect(isNetting(null)).toBe(false);
    expect(nearChest({ id: 'econ-chest', label: '나무상자 열기' })).toBe(true);
    expect(nearChest({ id: 'x', label: '보물상자 열기' })).toBe(true);
    expect(nearChest({ id: 'econ-mimic', label: '미믹 상자게 잡기! 🦀' })).toBe(false);
    expect(nearChest(null)).toBe(false);
  });
  it('아무 것도 안 할 땐 두근 게이지가 숨는다', () => {
    const g = gaugePlan(base(), {});
    expect(g[GAUGE_IDS.fish].show).toBe(false);
    expect(g[GAUGE_IDS.bug].show).toBe(false);
    expect(g[GAUGE_IDS.chest].show).toBe(false);
    expect(g[GAUGE_IDS.dive].show).toBe(false);
  });
  it('낚시 중엔 낚시만 · 잠자리채 중엔 곤충만 · 상자 앞엔 상자만', () => {
    let g = gaugePlan(base({ action: 'fish' }), {});
    expect(g[GAUGE_IDS.fish].show).toBe(true);
    expect(g[GAUGE_IDS.fish].value).toBeCloseTo(0.3);
    expect(g[GAUGE_IDS.bug].show).toBe(false);
    g = gaugePlan(base({ action: 'net' }), {});
    expect(g[GAUGE_IDS.bug].show).toBe(true);
    expect(g[GAUGE_IDS.fish].show).toBe(false);
    g = gaugePlan(base({ current: { id: 'econ-chest', label: '나무상자 열기' } }), {});
    expect(g[GAUGE_IDS.chest].show).toBe(true);
    expect(g[GAUGE_IDS.chest].color).toBe('#ffcf4a');
    g = gaugePlan(base({ mode: 'dive' }), {});
    expect(g[GAUGE_IDS.dive].show).toBe(true);
  });
  it('chestPity 가 없으면 상자 게이지를 안 만든다', () => {
    const g = gaugePlan(base({ pity: { fish: 0, bug: 0, dive: 0, chest: null } }), {});
    expect(g[GAUGE_IDS.chest]).toBeUndefined();
  });
  it('상황이 끝나도 잠깐 남았다 사라진다', () => {
    const last: Record<string, number> = {};
    gaugePlan(base({ now: 10, action: 'fish' }), last);
    expect(gaugePlan(base({ now: 10 + GAUGE_LINGER - 0.1 }), last)[GAUGE_IDS.fish].show).toBe(true);
    expect(gaugePlan(base({ now: 10 + GAUGE_LINGER + 0.1 }), last)[GAUGE_IDS.fish].show).toBe(false);
  });
  it('값은 0..1, 80% 넘으면 hot 이 된다', () => {
    const g = gaugePlan(base({ action: 'fish', pity: { fish: 1.7, bug: -2, dive: NaN, chest: 0 } }), {});
    expect(g[GAUGE_IDS.fish].value).toBe(1);
    expect(g[GAUGE_IDS.bug].value).toBe(0);
    expect(g[GAUGE_IDS.dive].value).toBe(0);
    expect(crossedHot(0.79, 0.8)).toBe(true);
    expect(crossedHot(0.85, 0.9)).toBe(false);
    expect(crossedHot(0.5, 0.6)).toBe(false);
  });
  it('수영 힘: 수영 중 + 덜 찼을 때 · 바다 산소: 잠수 중 · 달 산소: 우주에서', () => {
    const ocean = { stamina: 40, staminaMax: 100, oxygen: 20, oxygenMax: 100, swimming: true };
    let g = gaugePlan(base({ mode: 'swim', ocean }), {});
    expect(g[GAUGE_IDS.stamina].show).toBe(true);
    expect(g[GAUGE_IDS.stamina].value).toBeCloseTo(0.4);
    expect(g[GAUGE_IDS.oxygen].show).toBe(false);
    g = gaugePlan(base({ mode: 'swim', ocean: { ...ocean, stamina: 100 } }), {});
    expect(g[GAUGE_IDS.stamina].show).toBe(false);
    g = gaugePlan(base({ mode: 'dive', ocean }), {});
    expect(g[GAUGE_IDS.oxygen].show).toBe(true);
    expect(g[GAUGE_IDS.oxygen].label).toContain('숨 차요');
    expect(g[GAUGE_IDS.oxygen].color).toBe('#ff8f8f');
    g = gaugePlan(base({ mode: 'ground', ocean: { ...ocean, swimming: false } }), {});
    expect(g[GAUGE_IDS.stamina].show).toBe(false);
    g = gaugePlan(base({ world: 'space', moon: { value: 30, max: 100 } }), {});
    expect(g[GAUGE_IDS.moon].show).toBe(true);
    expect(g[GAUGE_IDS.moon].value).toBeCloseTo(0.3);
    // 넉넉할 땐 hud 시계의 산소 막대만(두 줄로 안 보이게)
    expect(gaugePlan(base({ world: 'space', moon: { value: 80, max: 100 } }), {})[GAUGE_IDS.moon].show).toBe(false);
    expect(gaugePlan(base({ moon: { value: 80, max: 100 } }), {})[GAUGE_IDS.moon].show).toBe(false);
    expect(gaugePlan(base(), {})[GAUGE_IDS.moon]).toBeUndefined();
  });
  it('gaugeSig: 같은 값이면 같다', () => {
    const a = { label: 'x', value: 0.5, color: '#fff', show: true };
    expect(gaugeSig(a)).toBe(gaugeSig({ ...a }));
    expect(gaugeSig(a)).not.toBe(gaugeSig({ ...a, show: false }));
    expect(gaugeSig(null)).toBe('');
  });
});

describe('콤보 팝', () => {
  it('5 이상에서 늘 때만, 10 의 배수는 크게', () => {
    expect(comboPop(3, 4)).toBeNull();
    expect(comboPop(4, 5)).toEqual({ text: '콤보 5!', big: false });
    expect(comboPop(6, 7)?.text).toBe('콤보 7!');
    expect(comboPop(9, 10)?.big).toBe(true);
    expect(comboPop(7, 7)).toBeNull();
    expect(comboPop(8, 0)).toBeNull();
  });
});

describe('날씨 → 배너 글', () => {
  it('정해진 글', () => {
    expect(weatherBanner('meteor', 'clear')?.text).toBe('유성우가 내려요!');
    expect(weatherBanner('aurora', 'clear')?.text).toBe('오로라가 떴어요!');
    expect(weatherBanner('sandstorm', 'clear')?.text).toBe('모래폭풍!');
    expect(weatherBanner('fog', 'clear')?.text).toBe('안개 속에 뭔가가…');
    expect(weatherBanner('rainbow', 'rain')?.text).toBe('무지개가 떴어요!');
  });
  it('맑음 아닌 날씨는 전부 배너가 있다(아이콘·색·시간)', () => {
    for (const w of WEATHERS) {
      if (w === 'clear') continue;
      const b = weatherBanner(w, 'clear');
      expect(b, w).not.toBeNull();
      expect(b!.icon.length).toBeGreaterThan(0);
      expect(b!.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(b!.ms).toBeGreaterThan(1000);
      expect(b!.text).not.toMatch(/[:：]\s/); // hud 토스트가 대화로 읽지 않게
    }
  });
  it('같은 날씨면 없음 · 맑음은 거친 날씨가 걷혔을 때만', () => {
    expect(weatherBanner('rain', 'rain')).toBeNull();
    expect(weatherBanner('clear', 'storm')?.text).toBe('날씨가 맑아졌어요!');
    expect(weatherBanner('clear', 'aurora')).toBeNull();
    expect(weatherBanner('clear', undefined)).toBeNull();
    expect(weatherBanner(null)).toBeNull();
  });
});

describe('섬 발견 · 해금 · 인기 생물', () => {
  it('섬 발견 카드: geo 이름 · 섬 색', () => {
    const c = discoverCard({ place: 'coral', name: 'coral', kind: 'island' }, { islandName: '산호빛섬', theme: 'coral', color: '#ff9f8a', sub: '찰랑찰랑 산호 해변' });
    expect(c.name).toBe('산호빛섬');
    expect(c.color).toBe('#ff9f8a');
    expect(c.kicker).toContain('섬 발견');
    const l = discoverCard({ place: 'lm:home:windmill', name: '무지개 풍차', kind: 'landmark' }, { islandName: '말랑섬', color: '#7fd18b' });
    expect(l.name).toBe('무지개 풍차');
    expect(l.sub).toContain('말랑섬');
    expect(discoverCard({ place: 'islet-a', kind: 'islet' }, { islandName: '쪼꼬미섬 A' }).kicker).toContain('쪼꼬미섬');
  });
  it('해금 세리머니: 큰 해금만, 조용한 이유·제 카드 있는 해금은 건너뛴다', () => {
    const look = (k: string) => (k === 'v:bike' ? { name: '자전거', icon: '🚲' } : undefined);
    const c = ceremonyOf('v:bike', 'buy', look);
    expect(c).toMatchObject({ name: '자전거', icon: '🚲' });
    expect(ceremonyOf('tool:shovel', 'craft', () => undefined)?.name).toBe('shovel');
    expect(ceremonyOf('tool:rod', 'starter', look)).toBeNull();
    expect(ceremonyOf('dino:tino', 'befriend', look)).toBeNull();
    expect(ceremonyOf('v:raft', 'craft', look)).toBeNull();
    expect(ceremonyOf('recipe:r_lamp', 'chest', look)).toBeNull();
    expect(ceremonyOf('', undefined, look)).toBeNull();
  });
  it('오늘의 인기 생물 토스트', () => {
    expect(hotToast(['고등어'])).toBe('📈 오늘은 고등어가 인기래! 팔면 두 배!');
    expect(hotToast(['고등어', '장수풍뎅이', '해마'])).toContain('고등어 · 장수풍뎅이 · 해마');
    expect(hotToast([])).toBeNull();
    expect(hotToast(['', ' '])).toBeNull();
    expect(hotToast(['a', 'b'])!).not.toMatch(/[:：]\s/);
  });
});

describe('상자 쏟아짐', () => {
  it('흔들림 힌트가 끝난 뒤(등급 × 0.38초 + 뚜껑)', () => {
    expect(cascadeDelay(1, 'world')).toBe(Math.round((SHAKE_SEC + 0.15) * 1000));
    expect(cascadeDelay(3, 'daily')).toBe(Math.round((3 * SHAKE_SEC + 0.15) * 1000));
    expect(cascadeDelay(3, 'world')).toBeGreaterThan(cascadeDelay(2, 'world'));
    expect(cascadeDelay(3, 'tino')).toBe(250);
  });
  it('내용물 → 날아갈 곳 · 차례', () => {
    const p = cascadePlan([{ id: 'coins', n: 300 }, { id: 'stars', n: 5 }, { id: 'key:silver', n: 1 }, { id: 'm_wood', n: 3, name: '나무' }, { id: 'x', n: 0 }], 100, 150);
    expect(p.map((i) => i.to)).toEqual(['wallet', 'star', 'key', 'bag']);
    expect(p.map((i) => i.delay)).toEqual([100, 250, 400, 550]);
    expect(p[3].name).toBe('나무');
    expect(coinBurst(0)).toBe(0);
    expect(coinBurst(100)).toBeGreaterThanOrEqual(6);
    expect(coinBurst(1e9)).toBe(30);
    expect(coinBurst(15000)).toBeGreaterThan(coinBurst(300));
  });
});

describe('차례 큐 · 지도 도장', () => {
  it('하나씩, hold 면 안 내린다', () => {
    const q = new Sequencer<{ ms: number; id: string }>(3);
    q.push({ ms: 1000, id: 'a' }); q.push({ ms: 1000, id: 'b' });
    expect(q.update(0)?.show?.id).toBe('a');
    expect(q.update(500)).toBeNull();
    expect(q.update(1200, true)).toBeNull();
    expect(q.update(1200)?.show?.id).toBe('b');
    expect(q.update(2300)?.hide?.id).toBe('b');
    for (const id of ['c', 'd', 'e', 'f']) q.push({ ms: 10, id });
    expect(q.pending().map((x) => x.id)).toEqual(['d', 'e', 'f']);
  });
  it('도장 펀치: 크게 → 작게 → 살짝 크게 → 1', () => {
    expect(stampPunch(0)).toBeCloseTo(2.4);
    expect(stampPunch(0.18)).toBeCloseTo(0.85);
    expect(stampPunch(0.34)).toBeCloseTo(1.1);
    expect(stampPunch(0.6)).toBe(1);
    expect(stampPunch(-1)).toBe(1);
  });
});
