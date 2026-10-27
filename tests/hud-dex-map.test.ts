// hud-dex-map — 도감·가방·상점·지도 순수 규칙(hud/logic.ts): 칸 상태(은별·금별·반짝이·숙련), 314칸 합계, 섬 % 칩,
// 화석 조각 진행, 가방 열린 자리(팔기·기증은 상점·박물관에서만), 다 팔기 계획, 안개 집합, 지도 맞추기, 썸네일 큐(한 프레임 하나).
import { describe, it, expect } from 'vitest';
import {
  dexCellView, masteryOf, clampMastery, dexTotals, dexIslandChips, fossilProgress, bagModeOf, bagArgFrom, sellAllPlan, sellPlanTotal,
  fogSet, fitMap, ThumbQueue, srgbLut, HUD_KEYS, selectHotkeys, type SellEntry,
} from '../src/modules/hud/logic';
import { DEX_TABS } from '../src/modules/economy/data';

describe('도감 칸 상태', () => {
  it('실루엣 → 컬러 → 은별(10회) → 금별(왕관 개체) + 반짝이 별', () => {
    expect(dexCellView(undefined)).toEqual({ state: 'miss', shiny: false, crown: false, star: null, mastery: 0 });
    expect(dexCellView({ count: 3 }).state).toBe('got');
    expect(dexCellView({ count: 3 }).star).toBeNull();
    expect(dexCellView({ count: 10 }).star).toBe('silver');
    const g = dexCellView({ count: 1, variants: { crown: 1 } });
    expect([g.state, g.star, g.crown]).toEqual(['gold', 'gold', true]);
    expect(dexCellView({ count: 12, variants: { shiny: 2 } })).toMatchObject({ state: 'silver', shiny: true, crown: false });
    expect(dexCellView({ count: 1, variants: { tiny: 3 } })).toMatchObject({ state: 'got', shiny: false, crown: false });
  });
  it('숙련 별: ext.meta.mastery 가 있을 때만, 0..5 로 자른다. 못 잡은 칸엔 안 붙는다', () => {
    expect(masteryOf(undefined, 'a')).toBe(0);
    expect(masteryOf({}, 'a')).toBe(0);
    expect(masteryOf({ mastery: (id: string) => (id === 'a' ? 3.7 : 0) }, 'a')).toBe(3);
    expect(masteryOf({ mastery: () => 99 }, 'a')).toBe(5);
    expect(masteryOf({ mastery: () => { throw new Error('x'); } }, 'a')).toBe(0);
    expect(clampMastery('3')).toBe(0);
    expect(dexCellView({ count: 1 }, 2).mastery).toBe(2);
    expect(dexCellView(undefined, 4).mastery).toBe(0);
  });
});

describe('도감 합계 314 · 섬 칩', () => {
  it('탭 칸 수 합은 314 — 덜 실린 탭은 표의 칸 수, 더 실리면 실린 만큼', () => {
    expect(DEX_TABS.map((t) => t.id)).toEqual(['fish', 'sea', 'bug', 'dino', 'fossil', 'space', 'vehicle']);
    const empty = dexTotals(DEX_TABS, [], () => false);
    expect(empty.total).toBe(314);
    expect(empty.got).toBe(0);
    const sp = [
      { id: 'f1', category: 'fish' }, { id: 'f2', category: 'fish' }, { id: 'v_bike', category: 'item', tags: ['vehicle'] },
      { id: 'fos_trex', category: 'fossil', tags: ['skeleton', 'fos:trex'] }, { id: 'fos_trex_skull', category: 'fossil', tags: ['fos:trex:skull'] },
      { id: 'm_wood', category: 'item' },
    ];
    const t = dexTotals(DEX_TABS, sp, (id) => id === 'f1' || id === 'v_bike' || id === 'fos_trex_skull');
    expect(t.tabs.fish).toEqual({ got: 1, registered: 2, slots: 135 });
    expect(t.tabs.vehicle).toEqual({ got: 1, registered: 1, slots: 18 });
    // 화석 탭은 골격만(조각은 칸이 아니다) — 조각을 잡아도 칸은 안 늘어난다
    expect(t.tabs.fossil).toEqual({ got: 0, registered: 1, slots: 20 });
    expect(t.got).toBe(2);
    expect(t.total).toBe(314);
    const many = Array.from({ length: 140 }, (_, i) => ({ id: `x${i}`, category: 'fish' }));
    expect(dexTotals(DEX_TABS, many, () => true).tabs.fish.slots).toBe(140);
  });
  it('섬 칩: 섬 표 순서 → 처음 보는 섬(달), 칩마다 % 와 100% 왕관', () => {
    const sp = [
      { id: 'a', where: [{ island: 'home' }] }, { id: 'b', where: [{ island: 'home' }, { island: 'coral' }] },
      { id: 'c', where: [{ island: 'moon' }] }, { id: 'd', where: [{ island: 'coral' }] }, { id: 'e' },
    ];
    const chips = dexIslandChips(sp, (id) => ['a', 'b', 'c'].includes(id), ['home', 'dino', 'coral']);
    expect(chips.map((c) => c.island)).toEqual(['home', 'coral', 'moon']);
    expect(chips[0]).toEqual({ island: 'home', got: 2, total: 2, pct: 100, crown: true });
    expect(chips[1]).toEqual({ island: 'coral', got: 1, total: 2, pct: 50, crown: false });
    expect(chips[2].crown).toBe(true);
    expect(dexIslandChips([], () => true)).toEqual([]);
  });
  it('화석 골격 칸: 조각 몇 개 모았나', () => {
    const sp = [{ id: 's1', tags: ['fos:trex:skull'] }, { id: 's2', tags: ['fos:trex:body'] }, { id: 's3', tags: ['fos:trex:tail'] }, { id: 'o', tags: ['fos:ptera:skull'] }];
    expect(fossilProgress({ tags: ['skeleton', 'fos:trex'] }, sp, (id) => id === 's2')).toEqual({ have: 1, total: 3 });
    expect(fossilProgress({ tags: ['skeleton'] }, sp, () => true)).toBeNull();
  });
});

describe('가방: 팔기·기증 버튼은 상점·박물관 앞에서만', () => {
  it('인자 → 열린 자리', () => {
    expect(bagModeOf(undefined)).toEqual({ from: null });
    expect(bagModeOf({ from: 'shop' })).toEqual({ from: 'shop', shop: 'quack' });
    expect(bagModeOf({ from: 'shop', shop: 'beach' })).toEqual({ from: 'shop', shop: 'beach' });
    expect(bagModeOf({ from: 'museum' })).toEqual({ from: 'museum' });
    expect(bagModeOf({ from: 'field' })).toEqual({ from: null });
  });
  it('Tab 을 누른 창 → 가방 인자: 파는 가게·박물관만 싣는다', () => {
    expect(bagArgFrom(null)).toBeUndefined();
    expect(bagArgFrom({ kind: 'dex', arg: undefined })).toBeUndefined();
    expect(bagArgFrom({ kind: 'shop', arg: { shop: 'quack' } })).toEqual({ from: 'shop', shop: 'quack' });
    expect(bagArgFrom({ kind: 'shop', arg: { shop: 'shipyard' } })).toBeUndefined();
    expect(bagArgFrom({ kind: 'museum', arg: undefined })).toEqual({ from: 'museum' });
  });
  it('M 지도 단축키: 다른 창이 열려 있어도 바로 바꾼다', () => {
    const m = HUD_KEYS.find((k) => k.code === 'KeyM')!;
    expect(m).toMatchObject({ kind: 'map', action: 'toggle', panel: '*' });
    const defs = HUD_KEYS.map((k) => ({ id: k.id, code: k.code, label: k.label, panel: k.panel, run() {} }));
    expect(selectHotkeys(defs, ['KeyM'], null, { typing: false, locked: true, openKind: 'dex' }).map((h) => h.id)).toEqual(['hud:map']);
  });
});

describe('다 팔기', () => {
  const E = (key: string, n: number, o: Partial<SellEntry> = {}): SellEntry => ({ key, n, sellable: true, creature: true, junk: false, donatable: false, ...o });
  it('생물·쓰레기만, 못 파는 것·재료는 그대로', () => {
    const p = sellAllPlan([E('f1', 3), E('t_can', 2, { creature: false, junk: true }), E('m_wood', 9, { creature: false }), E('x', 1, { sellable: false }), E('z', 0)]);
    expect(p.all).toEqual(['f1', 't_can']);
    expect(p.partial).toEqual([]);
    expect(p.kept).toEqual([]);
  });
  it('반짝이·왕관은 남기고, 기증 안 한 생물은 한 마리 남긴다', () => {
    const p = sellAllPlan([E('f1@shiny', 1), E('f1@crown', 2), E('f1@tiny', 1), E('f2', 4, { donatable: true }), E('f3', 1, { donatable: true })]);
    expect(p.all).toEqual(['f1@tiny']);
    expect(p.partial).toEqual([{ key: 'f2', n: 3 }]);
    expect(p.kept.map((k) => `${k.key}:${k.why}`)).toEqual(['f1@shiny:precious', 'f1@crown:precious', 'f2:donate', 'f3:donate']);
    const all = sellAllPlan([E('f1@shiny', 1), E('f2', 4, { donatable: true })], { keepPrecious: false, keepDonate: false });
    expect(all.all).toEqual(['f1@shiny', 'f2']);
  });
  it('미리 보기 코인 = 몽땅 + 나머지', () => {
    const bag: Record<string, number> = { a: 2, b: 5 };
    const p = { all: ['a'], partial: [{ key: 'b', n: 4 }], kept: [] };
    expect(sellPlanTotal(p, (k) => (k === 'a' ? 100 : 10), (k) => bag[k])).toBe(240);
  });
});

describe('지도: 안개 · 맞추기', () => {
  const ids = ['home', 'dino', 'ice', 'islet-a'];
  it('가 본 섬 + 지금 선 섬만 밝힌다, geo 가 없으면 다 밝힌다', () => {
    const disc = (id: string) => id === 'home';
    expect([...fogSet(ids, disc, null)]).toEqual(['home']);
    expect([...fogSet(ids, disc, 'ice')].sort()).toEqual(['home', 'ice']);
    expect(fogSet(ids, null, null).size).toBe(4);
    expect([...fogSet(ids, () => { throw new Error('x'); }, 'dino')]).toEqual(['dino']);
  });
  it('세계 → 캔버스 가운데, 왕복', () => {
    const m = fitMap({ minX: -4000, maxX: 4000, minZ: -4000, maxZ: 4000 }, 600, 400, 20);
    expect(m.s).toBeCloseTo(360 / 8000);
    expect(m.toPx(0, 0)).toEqual([300, 200]);
    const [x, y] = m.toPx(4000, -4000);
    expect(x).toBeCloseTo(480); expect(y).toBeCloseTo(20);
    const [wx, wz] = m.toWorld(...m.toPx(1234, -567));
    expect(wx).toBeCloseTo(1234); expect(wz).toBeCloseTo(-567);
  });
});

describe('썸네일 큐 — 한 프레임에 하나', () => {
  it('pump 한 번에 하나만 그리고, 캐시된 건 다시 줄 서지 않는다', () => {
    const q = new ThumbQueue<string>();
    for (let i = 0; i < 10; i++) expect(q.request(`s${i}`, `job${i}`)).toBe(true);
    expect(q.request('s3', 'again')).toBe(false);
    const drawn: string[] = [];
    const render = (id: string) => { drawn.push(id); return `url:${id}`; };
    let frames = 0;
    while (q.pending()) { const d = q.pump(render); expect(d.length).toBeLessThanOrEqual(1); frames++; }
    expect(frames).toBe(10);
    expect(drawn).toEqual(Array.from({ length: 10 }, (_, i) => `s${i}`));
    expect(q.get('s4')).toBe('url:s4');
    expect(q.request('s4', 'x')).toBe(false);
    expect(q.pump(render)).toEqual([]);
    expect(q.drawn).toBe(10);
  });
  it('실제 모델은 앞으로 새치기하고 기본 모양을 덮어쓴다(한 번만)', () => {
    const q = new ThumbQueue<string>();
    q.request('a', 'gen-a'); q.request('b', 'gen-b');
    expect(q.request('c', 'model-c', 'model')).toBe(true);
    // 줄에 있던 기본 모양 일감은 모델로 바꿔 끼운다
    expect(q.request('b', 'model-b', 'model')).toBe(true);
    const jobs: string[] = [];
    while (q.pending()) q.pump((_id, job) => { jobs.push(job); return job; });
    expect(jobs).toEqual(['model-c', 'gen-a', 'model-b']);
    expect(q.srcOf('a')).toBe('generic');
    expect(q.request('a', 'model-a', 'model')).toBe(true);
    q.pump((_i, j) => j);
    expect(q.get('a')).toBe('model-a');
    expect(q.request('a', 'model-a2', 'model')).toBe(false);
    expect(q.request('a', 'gen-a2')).toBe(false);
  });
  it('밖에서 넣은 결과(저장소)는 줄을 지우고, 모델 위엔 기본 모양을 안 덮는다. 실패는 null 로 캐시', () => {
    const q = new ThumbQueue<string>();
    q.request('a', 'gen');
    q.put('a', 'stored', 'model');
    expect(q.pending()).toBe(0);
    q.put('a', 'gen-url', 'generic');
    expect(q.get('a')).toBe('stored');
    q.request('bad', 'x');
    q.pump(() => { throw new Error('gl'); });
    expect(q.get('bad')).toBeNull();
    expect(q.request('bad', 'y')).toBe(false);
    // 실제 모델이 실패하면 캐시에 안 남아 기본 모양을 다시 받는다
    q.request('m', 'model', 'model');
    q.pump(() => null);
    expect(q.has('m')).toBe(false);
    expect(q.request('m', 'gen')).toBe(true);
  });
  it('캐시 상한을 넘으면 오래된 것부터 버린다 · drain 은 줄만 비운다', () => {
    const q = new ThumbQueue<number>(3);
    for (let i = 0; i < 5; i++) { q.request(`k${i}`, i); q.pump((_id, j) => String(j)); }
    expect(q.has('k0')).toBe(false);
    expect(q.has('k4')).toBe(true);
    q.request('z1', 1); q.request('z2', 2);
    expect(q.drain()).toEqual([1, 2]);
    expect(q.pending()).toBe(0);
    expect(q.isQueued('z1')).toBe(false);
  });
  it('선형 → sRGB 표', () => {
    const l = srgbLut();
    expect(l[0]).toBe(0); expect(l[255]).toBe(255);
    expect(l[55]).toBeGreaterThan(120);
  });
});
