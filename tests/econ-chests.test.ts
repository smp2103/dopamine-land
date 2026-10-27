// 경제 wave 3A(econ-chests) — 보물상자 등급표·열쇠·미믹·흔들림·천장·매일 다시 생기기·개발 구역,
// 박물관(동 진행·마일스톤·화석 골격), 오늘의 손님 생물, 주민 부탁(게시판 3 + 주민마다 1, 날마다 바뀜).
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import buildEconomy from '../src/modules/economy';
import type { Species } from '../src/core/state';
import { DAY_SEC, type EconApi } from '../src/core/api';
import { rngFor } from '../src/core/rng';
import { ISLANDS } from '../src/core/world';
import {
  rollLoot, pickOutcome, rollMimic, applyChestPity, chestGauge, toTier, planIslandSpots, keyDay, specialtyOf,
  LOOT_TABLE, MIMIC_RATE, CHEST_PITY, CHEST_DEF, FIXED_PER_ISLAND, DAILY_PER_ISLAND, type ChestTier, type Outcome,
} from '../src/modules/economy/loot';
import { shakePose, buildMimicCrab, tierGeometry } from '../src/modules/economy/chests';
import { reachedMilestones, newMilestones, fossilPartOf, MILESTONES, WING_FURNITURE } from '../src/modules/economy/museum';
import { boardRequests, residentRequest, pickGuest, guestPool, colorFamilyOf, isBirthday, neighbourIsland, makeRequest, type ReqSpecies } from '../src/modules/economy/requests';
import { DEX_TABS } from '../src/modules/economy/data';
import { wingExhibits, WING_BY_ID } from '../src/modules/economy/museum';
import type { ChestSpot } from '../src/modules/economy/loot';
import type { LiveChest } from '../src/modules/economy/chests';

type Econ = Omit<EconApi, 'museum' | 'requestsFor' | 'guest' | 'addChestArea' | 'chestPity' | 'skeletonsDone' | 'chestTiers'> & {
  chestTiers: ChestTier[];
  addChestArea(a: { id: string; island: string; x: number; z: number; r: number; n: number; tier?: ChestTier }): number;
  chestPity(): { wood: number; gauge: number };
  museum(): { wings: Array<{ id: string; got: number; total: number; milestones: number[]; awarded: number[]; skeletons?: Array<{ dino: string; done: boolean }> }>; navChip: { got: number } };
  skeletonsDone(): string[];
  requestsFor(npc: string): Array<{ id: string; npc?: string; kind: string; n: number; reward: number; done: boolean; item?: string; species?: Species }>;
  guest(): { id: string; name: string } | null;
  chestSpots(island?: string): ChestSpot[];
  chests: Map<string, LiveChest>;
  openLocked(tier: string, where?: string): unknown;
  mimics: Array<{ alive: boolean; status: string; pos: THREE.Vector3 }>;
};

function boot(search = '', o: { load?: boolean; day?: number; hour?: number } = {}) {
  const game = makeFakeGame({ search, load: o.load, day: o.day, hour: o.hour });
  const ctx = makeCtx(game);
  buildEconomy(ctx as never);
  return { game, ctx, econ: game.econ as unknown as Econ, ev: recordEvents(game) };
}
/** 몇 번째 굴림이든 같은 난수열(테스트용 시드 rng) */
const seq = (key: string) => rngFor(key);
const fish = (id: string, rarity: number, extra: Partial<Species> = {}): Species => ({ id, name: id, category: 'fish', rarity, price: 100, ...extra });

/** 상자 자리를 청크로 지어 세상에 올린다 */
function buildAround(game: FakeGame, x: number, z: number) {
  game.chunks.buildAtWorld('econ-chests', x, z);
}
/** 플레이어를 상자 옆으로 옮겨 E */
function openAt(game: FakeGame, c: { x: number; z: number }) {
  game.player.pos.set(c.x + 1, game.player.pos.y, c.z);
  game.player.pos.y = (game.econ as unknown as Econ).chests.get((c as LiveChest).key)?.y ?? game.player.pos.y;
  return game.interact('econ-chest');
}
/** 쪼꼬미섬 A 땅 한 점(고정 상자 자리를 빌려 쓴다) — 섬의 원래 상자는 다 연 걸로 쳐서 비운다 */
const isletSpot = (econ: Econ) => {
  const opened = (econ.flags() as { opened: Record<string, string> }).opened;
  for (const s of econ.chestSpots('islet-a')) opened[s.key] = s.tier;
  return econ.chestSpots('islet-a').find((s) => s.key.startsWith('f:'))!;
};

beforeEach(() => { stubLocalStorage(); });

describe('상자 내용물 표(GDD 5.4) — 10,000번 굴림 비율', () => {
  const freq = (tier: ChestTier, n = 10000) => {
    const r = seq(`test:loot:${tier}`);
    const c: Partial<Record<Outcome, number>> = {};
    for (let i = 0; i < n; i++) { const p = rollLoot(tier, r, { island: 'home', unknownCards: ['r_shiny_lure'] }); c[p.outcome] = (c[p.outcome] ?? 0) + 1; }
    return c;
  };
  for (const tier of ['wood', 'silver', 'gold', 'space'] as ChestTier[]) {
    it(`${tier}: 표의 % 와 ±1.5%p 안`, () => {
      const c = freq(tier);
      const total = LOOT_TABLE[tier].reduce((a, x) => a + x.w, 0);
      for (const row of LOOT_TABLE[tier]) expect(Math.abs((c[row.kind] ?? 0) / 100 - (row.w / total) * 100)).toBeLessThan(1.5);
    });
  }
  it('나무상자 표: 코인 100~500 · 재료 2~5(섬 특산 포함, 가끔 헌 타이어) · 미끼 3 · 레시피 카드 · 은열쇠 조각 · 캡슐 티켓', () => {
    const r = seq('test:wood:detail');
    let sawTire = false, sawSpecialty = false, sawCard = false, sawPiece = false;
    for (let i = 0; i < 4000; i++) {
      const p = rollLoot('wood', r, { island: 'coral', unknownCards: ['r_shiny_lure'] });
      for (const l of p.lines) {
        if (p.outcome === 'coins' && l.kind === 'coins') { expect(l.n).toBeGreaterThanOrEqual(100); expect(l.n).toBeLessThanOrEqual(500); }
        if (p.outcome === 'mats' && l.kind === 'item') {
          if (l.id === 't_tire') sawTire = true;
          if (l.id === 'm_coral') sawSpecialty = true;
        }
        if (p.outcome === 'bait' && l.kind === 'item') { expect(l.n).toBe(3); expect(l.id.startsWith('bait_')).toBe(true); }
        if (l.kind === 'unlock') { expect(l.key).toBe('recipe:r_shiny_lure'); sawCard = true; }
        if (l.kind === 'keypiece') { expect(l.color).toBe('silver'); sawPiece = true; }
      }
      if (p.outcome === 'mats') {
        const n = p.lines.reduce((a, l) => a + (l.kind === 'item' && l.id !== 't_tire' ? l.n : 0), 0);
        expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(5);
      }
    }
    expect(sawTire && sawSpecialty && sawCard && sawPiece).toBe(true);
    // 산호빛섬 특산은 산호·진주(나무상자는 비싼 진주를 빼고)
    expect(specialtyOf('coral', 999).map((m) => m.id)).toEqual(['m_coral']);
  });
  it('은·금·무지개·우주 상자 고정 내용', () => {
    const r = seq('test:fixed');
    for (let i = 0; i < 3000; i++) {
      const g = rollLoot('gold', r);
      if (g.outcome === 'stars') expect(g.lines).toEqual([{ kind: 'stars', n: 50, name: '반짝별' }]);
      if (g.outcome === 'goldpack') expect(g.lines.map((l) => (l.kind === 'item' ? `${l.id}×${l.n}` : ''))).toEqual(['m_gold×3', 'm_pearl×2']);
      if (g.outcome === 'keypiece') expect(g.lines[0]).toMatchObject({ kind: 'keypiece', color: 'rainbow' });
      const s = rollLoot('silver', r);
      if (s.outcome === 'keypiece') expect(s.lines[0]).toMatchObject({ kind: 'keypiece', color: 'gold' });
      if (s.outcome === 'capsule') expect(s.lines[0]).toMatchObject({ id: 'it_capsule', n: 2 });
      const sp = rollLoot('space', r);
      if (sp.outcome === 'moonrock') { const l = sp.lines[0]; expect(l.kind === 'item' && l.n >= 2 && l.n <= 4).toBe(true); }
      if (sp.outcome === 'stardust') { const l = sp.lines[0]; expect(l.kind === 'item' && l.n >= 3 && l.n <= 8).toBe(true); }
    }
    expect(rollLoot('rainbow', r).lines).toEqual([{ kind: 'coins', n: 30000, name: '도파코인' }, { kind: 'stars', n: 100, name: '반짝별' }]);
    // 가중치 경계: u=0 은 첫 칸, u→1 은 마지막 칸
    expect(pickOutcome('wood', 0)).toBe('coins');
    expect(pickOutcome('wood', 0.99999)).toBe('capsule');
  });
  it('예전 등급 이름을 새 이름으로(common→wood, rare→silver, epic→gold, legend→rainbow)', () => {
    expect(['common', 'rare', 'epic', 'legend', 'wood', 'space', 'nope'].map(toTier)).toEqual(['wood', 'silver', 'gold', 'rainbow', 'wood', 'space', null]);
  });
});

describe('흔들림 힌트·미믹 비율', () => {
  it('흔들림 횟수 = 1 나무 / 2 은 / 3 + 빛기둥 금 이상', () => {
    expect([CHEST_DEF.wood.shakes, CHEST_DEF.silver.shakes, CHEST_DEF.gold.shakes, CHEST_DEF.rainbow.shakes]).toEqual([1, 2, 3, 3]);
    expect([CHEST_DEF.wood.pillar, CHEST_DEF.silver.pillar, CHEST_DEF.gold.pillar, CHEST_DEF.rainbow.pillar]).toEqual([false, false, true, true]);
    // 0.38초 한 번 — 나무는 0.5초엔 이미 멈췄고, 금은 1.0초에도 흔든다
    expect(shakePose(0.19, 1)).not.toBeNull();
    expect(shakePose(0.5, 1)).toBeNull();
    expect(shakePose(1.0, 3)).not.toBeNull();
    expect(shakePose(1.2, 3)).toBeNull();
  });
  it('미믹: 나무·은 3%, 쪼꼬미섬 15%, 금 이상은 없음', () => {
    const n = 200000, r = seq('test:mimic');
    let a = 0, b = 0, g = 0;
    for (let i = 0; i < n; i++) {
      const u = r();
      if (rollMimic('wood', false, u)) a++;
      if (rollMimic('silver', true, u)) b++;
      if (rollMimic('gold', true, u)) g++;
    }
    expect(Math.abs(a / n - MIMIC_RATE.normal)).toBeLessThan(0.002);
    expect(Math.abs(b / n - MIMIC_RATE.islet)).toBeLessThan(0.004);
    expect(g).toBe(0);
  });
  it('상자게 모델: 상자 몸통 + 눈(art.ts) + 볼터치 + 다리 6 + 집게 2', () => {
    const c = buildMimicCrab('wood');
    expect(c.legs).toHaveLength(6);
    expect(c.claws).toHaveLength(2);
    expect(c.eyes.left && c.eyes.right).toBeTruthy();
    expect(c.eyes.blush).toHaveLength(2);
    c.setAwake(0);
    expect(c.legs[0].scale.x).toBeLessThan(0.01);
    c.setAwake(1);
    expect(c.legs[0].scale.x).toBe(1);
    // 등급마다 한 덩어리 지오메트리(청크 한 칸에 등급당 그리기 1번)
    for (const t of ['wood', 'silver', 'gold', 'rainbow', 'space'] as ChestTier[]) {
      const g = tierGeometry(t).closed;
      expect(g.attributes.color).toBeTruthy();
      // 쪼꼬미섬 40개가 한꺼번에 보여도 모듈 예산(삼각형 150k) 안
      expect(g.attributes.position.count / 3 * 40).toBeLessThan(150000);
    }
  });
});

describe('상자 천장(나무 50 → 은)', () => {
  it('순수: 50번째 나무상자는 은상자', () => {
    const s = { wood: 0 };
    const tiers: string[] = [];
    for (let i = 0; i < 100; i++) tiers.push(applyChestPity(s, 'wood').tier);
    expect(tiers.filter((t) => t === 'silver')).toHaveLength(2);
    expect(tiers[49]).toBe('silver');
    expect(tiers[99]).toBe('silver');
    expect(chestGauge(25)).toBe(0.5);
    // 다른 등급은 세지 않는다
    expect(applyChestPity(s, 'gold')).toEqual({ tier: 'gold', pityHit: false });
    expect(s.wood).toBe(0);
  });
  it('econ.openChest: 게이지가 차오르고 50번째에 은상자 + chest-open', () => {
    const { econ, ev } = boot();
    for (let i = 0; i < 49; i++) expect(econ.openChest('wood', `t${i}`).tier).toBe('wood');
    expect(econ.chestPity()).toEqual({ wood: 49, gauge: 49 / CHEST_PITY });
    expect(econ.pity('chest').gauge).toBeCloseTo(0.98);
    const r = econ.openChest('wood', 't49');
    expect(r.tier).toBe('silver');
    expect(econ.chestPity().wood).toBe(0);
    expect(ev.of('chest-open')).toHaveLength(50);
    expect(ev.of('chest-open').at(-1)).toMatchObject({ tier: 'silver', at: 't49' });
    // 예전 이름도 받는다
    expect(econ.openChest('legend' as ChestTier, 'old').tier).toBe('rainbow');
    expect(econ.chestTiers).toEqual(['wood', 'silver', 'gold', 'rainbow', 'space']);
  });
});

describe('열쇠(은·금·무지개)', () => {
  it('은상자는 은열쇠가 있어야 열리고, 열면 열쇠 하나(조각 3)를 쓴다', () => {
    const { game, econ, ev } = boot();
    const base = isletSpot(econ);
    econ.addChestArea({ id: 'keytest', island: 'islet-a', x: base.x, z: base.z, r: 3, n: 1, tier: 'silver' });
    game.tick(1 / 60);
    for (const s of econ.chestSpots('islet-a')) buildAround(game, s.x, s.z);
    const c = [...econ.chests.values()].find((x) => x.key.startsWith('a:keytest:'))!;
    expect(c.tier).toBe('silver');
    // 열쇠 없음 → 안 열린다
    expect(openAt(game, c)).toBe(true);
    expect(c.opened).toBe(false);
    expect(game.ui.toasts.at(-1)).toContain('은열쇠가 필요해요');
    expect(ev.of('chest-open')).toHaveLength(0);
    // 조각 3개 = 열쇠 1
    econ.addKeyPiece('silver', 3);
    expect(econ.keyCount('silver')).toBe(1);
    expect(openAt(game, c)).toBe(true);
    expect(c.opened).toBe(true);
    expect(econ.keyCount('silver')).toBe(0);
    expect(econ.keys.silver).toBe(0);
    const e = ev.of('chest-open')[0];
    expect(e.tier).toBe('silver');
    expect(e.at).toBe(c.key);
    // 연 상자는 저장에 남아 다시 지어도 안 나온다
    expect((econ.flags() as { opened: Record<string, string> }).opened[c.key]).toBe('silver');
  });
  it('openLocked: 금열쇠 없으면 null, 있으면 쓰고 금상자 내용물', () => {
    const { econ } = boot();
    expect(econ.openLocked('gold', 'x')).toBeNull();
    econ.addKeyPiece('gold', 3);
    const r = econ.openLocked('gold', 'x') as { tier: string };
    expect(r.tier).toBe('gold');
    expect(econ.keyCount('gold')).toBe(0);
    // 무료 openChest 는 열쇠를 건드리지 않는다(티노·보물지도 등)
    econ.addKeyPiece('gold', 3);
    econ.openChest('gold', 'tino');
    expect(econ.keyCount('gold')).toBe(1);
  });
});

describe('세상 속 상자: 매일 다시 생기기·개발 구역·미믹', () => {
  it('섬마다 고정 20 + 매일 20(큰 섬은 높은 곳 은상자 2) — 같은 날이면 같은 자리, 다음 날은 매일 상자만 바뀐다', () => {
    const { game, econ } = boot('', { day: 4 });
    const a = econ.chestSpots('home');
    const fixedA = a.filter((s) => !s.daily), dailyA = a.filter((s) => s.daily);
    expect(fixedA.filter((s) => s.key.startsWith('f:'))).toHaveLength(FIXED_PER_ISLAND);
    expect(fixedA.filter((s) => s.key.startsWith('h:') && s.tier === 'silver')).toHaveLength(2);
    expect(dailyA).toHaveLength(DAILY_PER_ISLAND);
    expect(dailyA.every((s) => keyDay(s.key) === 4)).toBe(true);
    // 쪼꼬미섬도 40개(빽빽하게)
    expect(econ.chestSpots('islet-c').length).toBe(FIXED_PER_ISLAND + DAILY_PER_ISLAND);
    // 은상자는 10% 쯤(높은 곳 빼고)
    const all = ISLANDS.flatMap((d) => econ.chestSpots(d.id)).filter((s) => !s.key.startsWith('h:'));
    const silver = all.filter((s) => s.tier === 'silver').length / all.length;
    expect(silver).toBeGreaterThan(0.05); expect(silver).toBeLessThan(0.16);

    // 다시 띄워도 같다(결정적)
    const { econ: econ2 } = boot('', { day: 4 });
    expect(econ2.chestSpots('home').map((s) => `${s.key}@${s.x.toFixed(2)},${s.z.toFixed(2)}`)).toEqual(a.map((s) => `${s.key}@${s.x.toFixed(2)},${s.z.toFixed(2)}`));

    // 하루 지나면: 고정은 그대로, 매일 상자는 새 자리·새 키
    const opened = (econ.flags() as { opened: Record<string, string> }).opened;
    opened[dailyA[0].key] = 'wood';
    opened[fixedA[0].key] = 'wood';
    game.env!.advance(DAY_SEC);
    game.state.emit({ type: 'day', day: 5, prev: 4 });
    const b = econ.chestSpots('home');
    expect(b.filter((s) => !s.daily).map((s) => s.key)).toEqual(fixedA.map((s) => s.key));
    const dailyB = b.filter((s) => s.daily);
    expect(dailyB.every((s) => keyDay(s.key) === 5)).toBe(true);
    expect(dailyB.map((s) => s.x)).not.toEqual(dailyA.map((s) => s.x));
    // 어제 연 매일 상자 기록은 지우고, 고정 상자 기록은 영영 남는다
    expect(opened[dailyA[0].key]).toBeUndefined();
    expect(opened[fixedA[0].key]).toBe('wood');
  });
  it('순수 planIslandSpots: 같은 시드 = 같은 자리, 서로 떨어져 있다', () => {
    const d = ISLANDS.find((x) => x.id === 'islet-b')!;
    const acc = () => 0;
    const p1 = planIslandSpots(d, 20, rngFor('s'), acc, { prefix: 'd:1:islet-b', daily: true });
    const p2 = planIslandSpots(d, 20, rngFor('s'), acc, { prefix: 'd:1:islet-b', daily: true });
    expect(p1).toEqual(p2);
    for (const a of p1) for (const b of p1) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(4.5);
  });
  it('addChestArea: n 개가 구역 안에 생기고 청크에 올라온다(같은 id 는 바꾼다)', () => {
    const { game, econ } = boot();
    const base = isletSpot(econ);
    econ.addChestArea({ id: 'stage3', island: 'islet-a', x: base.x, z: base.z, r: 8, n: 5 });
    const spots = econ.chestSpots('islet-a').filter((s) => s.key.startsWith('a:stage3:'));
    expect(spots).toHaveLength(5);
    for (const s of spots) expect(Math.hypot(s.x - base.x, s.z - base.z)).toBeLessThanOrEqual(8);
    game.tick(1 / 60);
    for (const s of spots) buildAround(game, s.x, s.z);
    expect([...econ.chests.keys()].filter((k) => k.startsWith('a:stage3:'))).toHaveLength(5);
    econ.addChestArea({ id: 'stage3', island: 'islet-a', x: base.x, z: base.z, r: 8, n: 2, tier: 'gold' });
    const again = econ.chestSpots('islet-a').filter((s) => s.key.startsWith('a:stage3:'));
    expect(again).toHaveLength(2);
    expect(again.every((s) => s.tier === 'gold')).toBe(true);
  });
  it('addChestArea: 시작 마을(반도) 땅에도 놓이고, 놓인 수를 돌려준다(물 위면 0)', () => {
    const { econ } = boot();
    expect(econ.addChestArea({ id: 'home-stage', island: 'home', x: 2.4, z: -1.1, r: 3, n: 3 })).toBe(3);
    expect(econ.chestSpots('home').filter((s) => s.key.startsWith('a:home-stage:'))).toHaveLength(3);
    expect(econ.addChestArea({ id: 'sea-stage', island: 'home', x: 60, z: 60, r: 2, n: 2 })).toBe(0);
  });
  it('나무상자 E: 흔들고 열기 → 코인 등 지급 + chest-open(source) — 미믹이면 도망 → E 로 잡으면 상자게 + 상자 2개', () => {
    const { game, econ, ev } = boot();
    // 쪼꼬미섬 A 상자(고정 20 + 오늘 20) 중 미믹 굴림이 나오는 것·안 나오는 것 하나씩(같은 키는 늘 같은 결과)
    const spots = econ.chestSpots('islet-a').filter((s) => s.tier === 'wood');
    const mimicKey = spots.find((s) => rollMimic('wood', true, rngFor(`mimic:${s.key}`)()))?.key ?? null;
    const plainKey = spots.find((s) => !rollMimic('wood', true, rngFor(`mimic:${s.key}`)()))?.key ?? null;
    expect(mimicKey && plainKey).toBeTruthy();
    game.tick(1 / 60);
    for (const s of econ.chestSpots('islet-a')) buildAround(game, s.x, s.z);
    const plain = econ.chests.get(plainKey!)!;
    const coins0 = game.state.coins;
    openAt(game, plain);
    expect(plain.opened).toBe(true);
    const open = ev.of('chest-open').at(-1)!;
    expect(open).toMatchObject({ tier: 'wood', at: plainKey, source: plain.daily ? 'daily' : 'world' });
    expect((open.loot as unknown[]).length).toBeGreaterThan(0);
    expect(game.state.coins >= coins0).toBe(true);
    // 연출 3.6초 돌려도 멀쩡
    game.tick(1 / 30, 120);

    const m = econ.chests.get(mimicKey!)!;
    ev.clear();
    openAt(game, m);
    expect(ev.of('chest-open')[0]).toMatchObject({ tier: 'wood', mimic: true, source: 'mimic', loot: [] });
    expect(ev.of('mimic')).toHaveLength(0);
    // 흔들기(0.38초) 뒤 눈을 뜨고 도망
    game.tick(1 / 30, 15);
    expect(ev.of('mimic')).toHaveLength(1);
    expect(econ.mimics).toHaveLength(1);
    game.tick(1 / 30, 20);
    const r = econ.mimics[0];
    expect(r.status).toBe('run');
    // 따라가서 E(2.5m 안)
    game.player.pos.set(r.pos.x + 1.5, r.pos.y, r.pos.z);
    game.pickInteraction();
    expect(game.current?.id).toBe('econ-mimic');
    expect(game.interact('econ-mimic')).toBe(true);
    expect(game.ui.catches.at(-1)!.species.id).toBe('d_mimic_crab');
    expect(game.state.dex.d_mimic_crab).toBeTruthy();
    const rewards = ev.of('chest-open').filter((e) => e.source === 'mimic-reward');
    expect(rewards).toHaveLength(2);
    expect(econ.chestPity().wood).toBe(3); // 열린 나무상자 1 + 토한 상자 2
  });
  it('미믹을 놓치면 뿅 사라진다', () => {
    const { game, econ, ev } = boot();
    (econ as unknown as { mimicDemo(): string }).mimicDemo();
    game.tick(1 / 30, 60);
    expect(econ.mimics[0]?.status).toBe('run');
    game.tick(1 / 20, 20 * 16);
    expect(ev.of('mimic-escape')).toHaveLength(1);
    expect(econ.mimics).toHaveLength(0);
    expect(game.ui.toasts.some((t) => t.includes('도망갔어요'))).toBe(true);
  });
  it('무지개 날씨: 플레이어 근처에 무지개상자(하루 한 번) — 날씨가 끝나면 사라진다', () => {
    const { game, ctx, econ } = boot();
    const base = isletSpot(econ);
    game.player.teleport(base.x, base.z);
    game.env!.forceWeather('*', 'rainbow');
    game.tick(0.5, 4);
    const rbOf = () => (econ as unknown as { rainbowChest(): { key: string; x: number; z: number } | null }).rainbowChest();
    const rb = rbOf()!;
    expect(rb.key).toBe(`rb:${econ.day()}`);
    expect(Math.hypot(rb.x - base.x, rb.z - base.z)).toBeLessThan(30);
    // 무지개 열쇠가 있어야 열린다
    econ.addKeyPiece('rainbow', 3);
    game.player.pos.set(rb.x + 1, ctx.island.heightAt(rb.x, rb.z), rb.z);
    expect(game.interact('econ-chest')).toBe(true);
    expect(rbOf()).toBeNull();
    expect(econ.keyCount('rainbow')).toBe(0);
    // 같은 날엔 다시 안 나온다
    game.tick(0.5, 4);
    expect(rbOf()).toBeNull();
    // 다음 날 무지개 → 새 상자, 날씨가 끝나면 사라진다
    game.env!.advance(DAY_SEC);
    game.tick(0.5, 4);
    expect(rbOf()?.key).toBe(`rb:${econ.day()}`);
    game.env!.forceWeather('*', null);
    game.tick(0.5, 2);
    expect(rbOf()).toBeNull();
  });
});

describe('박물관(5.6)', () => {
  it('동 5개(P0 전부 열림), 공룡은 기증 불가', () => {
    const { game, econ } = boot();
    game.state.register([{ id: 'dino-t', name: '티', category: 'dino', rarity: 3 }]);
    game.state.addItem('dino-t', 1);
    expect(econ.canDonate('dino-t')).toBe(false);
    const w = econ.museum().wings;
    expect(w.map((x) => x.id)).toEqual(['aquarium', 'sea', 'bug', 'fossil', 'astro']);
    expect(w.every((x) => (x as unknown as { open: boolean }).open)).toBe(true);
    expect(w[0].milestones).toEqual([10, 25, 50, 75, 100]);
  });
  it('마일스톤 10/25/50/75/100% → 반짝별 10/25/50/80/150 + 동 가구, 한 번씩만', () => {
    const { game, econ, ev } = boot();
    const list = Array.from({ length: 20 }, (_, i) => fish(`mf${i}`, 1));
    game.state.register(list);
    for (const s of list) game.state.addItem(s.id, 1);
    const stars0 = econ.stars;
    econ.donate('mf0');
    econ.donate('mf1'); // 2/20 = 10%
    expect(ev.of('museum-milestone').map((e) => e.pct)).toEqual([10]);
    expect(game.state.bag[WING_FURNITURE.aquarium[0]]).toBe(1);
    for (let i = 2; i < 20; i++) econ.donate(`mf${i}`);
    expect(ev.of('museum-milestone').map((e) => e.pct)).toEqual([10, 25, 50, 75, 100]);
    const donateStarsSum = 20 * 1;
    expect(econ.stars - stars0).toBe(donateStarsSum + 10 + 25 + 50 + 80 + 150);
    for (const f of WING_FURNITURE.aquarium) expect(game.state.bag[f]).toBe(1);
    // 같은 동에 하나 더 늘어 비율이 떨어졌다가 다시 올라도 또 주지 않는다
    game.state.register([fish('mf20', 1)]);
    game.state.addItem('mf20', 1);
    econ.donate('mf20');
    expect(ev.of('museum-milestone')).toHaveLength(5);
    expect(econ.museum().wings[0].awarded).toEqual([10, 25, 50, 75, 100]);
    // 순수 함수도
    expect(reachedMilestones(5, 20)).toEqual([10, 25]);
    expect(newMilestones('bug', 10, 20, [10]).map((m) => m.stars)).toEqual([25, 50]);
    expect(MILESTONES.map((m) => m.stars)).toEqual([10, 25, 50, 80, 150]);
  });
  it('화석: 부위 3개(skull·body·tail)를 다 기증하면 골격 fos_<공룡> 이 도감에(가방엔 안 들어감) + 카드', () => {
    const { game, econ, ev } = boot();
    const parts: Species[] = ['skull', 'body', 'tail'].map((p) => ({ id: `fos_trex_${p}`, name: `티라노 ${p} 화석`, category: 'fossil', rarity: 3, price: 500, tags: [`fos:trex:${p}`] }));
    game.state.register([...parts, { id: 'fos_trex', name: '티라노 골격', category: 'fossil', rarity: 4, price: 0, tags: ['skeleton', 'fos:trex'] }]);
    expect(fossilPartOf(parts[0])).toEqual({ dino: 'trex', part: 'skull' });
    for (const p of parts) game.state.addItem(p.id, 1);
    econ.donate('fos_trex_skull');
    econ.donate('fos_trex_body');
    expect(econ.skeletonsDone()).toEqual([]);
    expect(game.state.dex.fos_trex).toBeUndefined();
    econ.donate('fos_trex_tail');
    expect(econ.skeletonsDone()).toEqual(['fos_trex']);
    expect(game.state.dex.fos_trex).toBeTruthy();
    expect(game.state.bag.fos_trex).toBeUndefined();
    expect(ev.of('skeleton')).toHaveLength(1);
    expect(game.hudLog.cards.some((c) => c.title.includes('티라노 골격'))).toBe(true);
    const fw = econ.museum().wings.find((w) => w.id === 'fossil')!;
    expect(fw.got).toBe(1);
    expect(fw.total).toBe(1); // 조각은 칸이 아니다 — 골격 한 칸
    expect(fw.skeletons?.[0]).toMatchObject({ dino: 'trex', done: true });
    // 다시 와도 두 번 완성되지 않는다
    econ.donate('fos_trex_tail');
    expect(ev.of('skeleton')).toHaveLength(1);
  });
});

describe('화석 탭·화석관은 골격만', () => {
  it('골격(fos_<공룡>, 태그 skeleton·fos:<공룡>)은 세고, 조각(fos:<공룡>:<부위>)·옛 화석은 안 센다', () => {
    const tab = DEX_TABS.find((t) => t.id === 'fossil')!;
    const skel = { id: 'fos_iguanodon', category: 'fossil', tags: ['skeleton', 'fos:iguanodon'] };
    const part = { id: 'fos_iguanodon_skull', category: 'fossil', tags: ['fossil-part', 'fos:iguanodon:skull'] };
    const legacy = { id: 'fos_old', category: 'fossil', tags: [] as string[] };
    expect(tab.match(skel)).toBe(true);
    expect(tab.match(part)).toBe(false);
    expect(wingExhibits(WING_BY_ID.get('fossil')!, [skel, part, legacy], ['iguanodon', 'trex']).sort()).toEqual(['fos_iguanodon', 'fos_trex']);
  });
});

describe('오늘의 손님 생물(4.4)', () => {
  it('하루 한 종: 판매가 ×5, 기증하면 반짝별 +5, 날마다 바뀐다', () => {
    const { game, econ } = boot();
    const list = Array.from({ length: 12 }, (_, i) => fish(`g${i}`, 2 + (i % 3), { where: [{ island: 'home', zone: 'river', time: 'all' }] }));
    game.state.register(list);
    const g = econ.guest()!;
    expect(g).toBeTruthy();
    expect(econ.market().mult[g.id]).toBe(5);
    const other = list.find((s) => s.id !== g.id && !econ.market().hot.includes(s.id) && s.rarity === game.state.species.get(g.id)!.rarity)
      ?? list.find((s) => s.id !== g.id && !econ.market().hot.includes(s.id))!;
    const ratio = econ.priceOf(g.id) / econ.priceOf(other.id);
    const rr = (game.state.species.get(g.id)!.price ?? 1) / (other.price ?? 1);
    expect(ratio / rr).toBeCloseTo(5, 0);
    game.state.addItem(g.id, 1);
    const s0 = econ.stars;
    econ.donate(g.id);
    expect(econ.stars - s0).toBe(game.state.species.get(g.id)!.rarity === 4 ? 5 + 5 : game.state.species.get(g.id)!.rarity + 5);
    // 순수: 어제와 다른 종
    const sp = list as unknown as ReqSpecies[];
    for (let d = 0; d < 20; d++) expect(pickGuest(sp, d, rngFor)).not.toBe(pickGuest(sp, d + 1, rngFor));
  });
  it('where 없는 실제 데이터 모양(낚시 hab/time·곤충·바다)도 손님 후보 — 미믹·★1·★5 는 빼고', () => {
    const real = [
      { id: 'fi_a', name: 'a', category: 'fish', rarity: 2, hab: ['river'], time: 'night' },
      { id: 'in_b', name: 'b', category: 'insect', rarity: 3 },
      { id: 'se_c', name: 'c', category: 'sea', rarity: 4 },
      { id: 'fi_low', name: 'l', category: 'fish', rarity: 1, hab: ['pond'], time: 'all' },
      { id: 'fi_top', name: 't', category: 'fish', rarity: 5, hab: ['deep'], time: 'all' },
      { id: 'd_mimic_crab', name: 'm', category: 'sea', rarity: 3, tags: ['mimic'], where: [{ island: 'any', zone: 'shore' }] },
    ] as unknown as ReqSpecies[];
    expect(guestPool(real)).toEqual(['fi_a', 'in_b', 'se_c']);
    expect(pickGuest(real, 3, rngFor)).toBeTruthy();
    const { game, econ } = boot();
    game.state.register(real as unknown as Species[]);
    expect(econ.guest()).toBeTruthy();
  });
});

describe('주민 부탁(4.6.1)', () => {
  const world = (day: number, extra: Partial<Species>[] = []) => ({
    day, hour: 22, tod: 'night', weather: 'clear',
    species: [
      fish('rq_day', 2, { where: [{ island: 'home', zone: 'river', time: 'day' }], look: { c1: '#4a9cf0' } } as Partial<Species>),
      fish('rq_night', 2, { where: [{ island: 'home', zone: 'river', time: 'night' }], look: { c1: '#4a9cf0' } } as Partial<Species>),
      fish('rq_blue', 1, { look: { c1: '#8fd3f4' } } as Partial<Species>),
      { id: 'rq_dino', name: 'd', category: 'dino', rarity: 2 },
      ...extra,
    ] as unknown as ReqSpecies[],
  });
  it('① 오늘 나오는 종(공룡 빼고) — 시각이 달라도(새로고침) 같은 부탁, 시간대 귀띔', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) {
      const night = boardRequests(world(d), rngFor);
      const noon = boardRequests({ ...world(d), hour: 12, tod: 'day', weather: 'rain' }, rngFor);
      expect(noon.map((r) => [r.id, r.kind, r.species?.id ?? r.item])).toEqual(night.map((r) => [r.id, r.kind, r.species?.id ?? r.item]));
      for (const r of night) {
        if (r.kind !== 'species') continue;
        seen.add(r.species!.id);
        expect(r.species!.id).not.toBe('rq_dino');
        if (r.species!.id === 'rq_night') expect(r.text).toContain('밤에 나온대');
      }
    }
    expect(seen.size).toBeGreaterThan(1);
    // 낚시 데이터 모양(where 없이 time) 도 시간대 귀띔
    const catfish = { id: 'fi_catfish', name: '메기', category: 'fish', rarity: 2, price: 300, hab: ['river'], time: 'night' } as unknown as ReqSpecies;
    const r = makeRequest('species', 'x', { day: 1, hour: 12, tod: 'day', weather: 'clear', species: [catfish] }, () => 0)!;
    expect(r.species!.id).toBe('fi_catfish');
    expect(r.text).toContain('밤에 나온대');
  });
  it('③ 색 부탁: 낚시·곤충 모양 look.colors 로도 색을 안다', () => {
    const colorsOnly = (id: string, c: string) => ({ id, name: id, category: 'fish', rarity: 1, price: 90, hab: ['river'], time: 'all', look: { shape: 'round', colors: [c, '#ffffff', '#000000'] } }) as unknown as ReqSpecies;
    expect(colorFamilyOf(colorsOnly('a', '#4a9cf0'))).toBe('blue');
    const w = { day: 1, hour: 12, tod: 'day', weather: 'clear', species: [colorsOnly('a', '#4a9cf0'), colorsOnly('b', '#5aa8f5'), colorsOnly('c', '#ff7fae')] };
    const r = makeRequest('color', 'x', w, () => 0)!;
    expect(r).toBeTruthy();
    expect(r.any?.color).toBe('blue');
  });
  it('템플릿 ②~⑧: 재료 3·색·★3+·가구·밤 동행·편지·생일 — 보상 코인 300~3,000', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 300; d++) {
      const r = residentRequest(world(d), { id: 'npc_a', island: 'home', birthday: 7 }, rngFor)!;
      seen.add(r.kind);
      expect(r.reward).toBeGreaterThanOrEqual(300);
      expect(r.reward).toBeLessThanOrEqual(3000);
      expect(r.npc).toBe('npc_a');
      if (r.kind === 'materials') expect(r.n).toBe(3);
      if (r.kind === 'letter') { expect(r.item).toMatch(/^it_letter_\d+$/); expect(r.to).toBe(neighbourIsland('home')); }
      if (r.kind === 'birthday') expect(isBirthday(7, d)).toBe(true);
      if (isBirthday(7, d)) expect(r.kind).toBe('birthday');
    }
    for (const k of ['species', 'materials', 'color', 'rarity', 'furniture', 'night', 'letter', 'birthday']) expect(seen.has(k)).toBe(true);
    expect(colorFamilyOf({ look: { c1: '#4a9cf0' } })).toBe('blue');
  });
  it('게시판 3장 + 주민마다 1장, "day" 가 오면 새 부탁으로 바뀐다. request-done 에 npc', () => {
    const { game, econ, ev } = boot('', { day: 2 });
    game.state.register([fish('rq_any', 1)]);
    const a = econ.requests();
    expect(a).toHaveLength(3);
    expect(a.every((r) => r.id.startsWith('req:2:'))).toBe(true);
    const m1 = econ.requestsFor('npc_mongsil');
    expect(m1).toHaveLength(1);
    expect(m1[0].id).toBe('req:2:npc:npc_mongsil');
    expect(econ.requestsFor('npc_mongsil')[0]).toBe(m1[0]);
    game.env!.advance(DAY_SEC);
    game.state.emit({ type: 'day', day: 3, prev: 2 });
    const b = econ.requests();
    expect(b.every((r) => r.id.startsWith('req:3:'))).toBe(true);
    expect(econ.requestsFor('npc_mongsil')[0].id).toBe('req:3:npc:npc_mongsil');
    // 재료 부탁 들어주기
    const rq = b.find((r) => r.item && !r.species) ?? b[0];
    const need = rq.species?.id ?? rq.item!;
    game.state.addItem(need, rq.n);
    const coins0 = game.state.coins;
    expect(econ.fulfill(rq.id)).toBe(true);
    expect(game.state.coins - coins0).toBeGreaterThanOrEqual(rq.reward);
    expect(ev.of('request-done').at(-1)).toMatchObject({ id: rq.id, coins: rq.reward, npc: rq.npc });
    expect(rq.npc).toBeTruthy();
    expect(econ.fulfill(rq.id)).toBe(false);
  });
  it('주민 ext.npc.list() 를 쓰고, 생일이면 생일 선물 부탁', () => {
    const { game, econ } = boot('', { day: 30 });
    game.ext.npc = { list: () => [{ id: 'npc_bear', name: '곰', island: 'coral' }], birthdayOf: (id: string) => (id === 'npc_bear' ? 30 % 28 : null) };
    const r = econ.requestsFor('npc_bear')[0];
    expect(r.kind).toBe('birthday');
    game.state.addItem(r.item!, 1);
    expect(econ.fulfill(r.id)).toBe(true);
  });
  it('⑦ 편지: 처음 건네면 편지를 받고, 옆 섬에서 건네야 끝', () => {
    const { game, econ } = boot();
    let r: ReturnType<Econ['requestsFor']>[number] | null = null;
    for (let i = 0; i < 200 && !r; i++) { const x = econ.requestsFor(`npc_t${i}`)[0]; if (x?.kind === 'letter') r = x; }
    expect(r).toBeTruthy();
    expect(econ.fulfill(r!.id)).toBe(false);
    expect(game.state.has(r!.item!)).toBe(true);
    // 아직 집 섬 → 안 끝남
    expect(econ.fulfill(r!.id)).toBe(false);
    // 옆 섬 땅으로
    const to = (r as unknown as { to: string }).to;
    const spot = econ.chestSpots(to).find((s) => !s.daily)!;
    game.player.teleport(spot.x, spot.z);
    expect(econ.fulfill(r!.id)).toBe(true);
    expect(game.state.has(r!.item!)).toBe(false);
  });
  it('⑦ 편지: calendar 우체통은 deliverLetter 로 자리 확인 없이 끝낸다', () => {
    const { game, econ, ev } = boot();
    let r: ReturnType<Econ['requestsFor']>[number] | null = null;
    for (let i = 0; i < 200 && !r; i++) { const x = econ.requestsFor(`npc_m${i}`)[0]; if (x?.kind === 'letter') r = x; }
    const E = econ as unknown as { deliverLetter(id: string): boolean };
    expect(E.deliverLetter(r!.item!)).toBe(false); // 편지가 아직 없다
    econ.fulfill(r!.id); // 편지 받기
    expect(E.deliverLetter(r!.item!)).toBe(true);
    expect(ev.of('request-done').at(-1)).toMatchObject({ id: r!.id, kind: 'letter' });
    expect(game.state.has(r!.item!)).toBe(false);
  });
});
