// hud-framework — HUD v2 순수 규칙(hud/logic.ts): 패널 기본값·탭, 단축키(B/Tab/I/Esc, consumed, 잠금), 게이지 보이기,
// 가방 칸 글, 시계(env 만), 행동 안내 칩, 해금 카드, 차례 큐. 화면(DOM) 없이 돈다.
import { describe, it, expect } from 'vitest';
import { HudRegistryStore } from '../src/core/registry';
import type { HotkeyDef, HudRenderer, PanelDef } from '../src/core/api';
import {
  BUILTIN_PANELS, BAG_TABS, HUD_KEYS, pickTab, shopTabs, shopOfArg, shopInfo, selectHotkeys, keyCap, keyHints,
  gaugeVisible, gaugeHot, comboVisible, comboText, bagView, countBagSlots, clockView, skyOf, promptChips, splitPrompt,
  unlockCard, TimedQueue, costParts, costText, keyView, countStep, dexCell, islandProgress, variantName, ToastDedupe, bagTabMatch,
} from '../src/modules/hud/logic';

// HUD_KEYS → 실제 HotkeyDef 처럼(run 은 기록만)
const ran: string[] = [];
let panelOpen = false;
const keys: HotkeyDef[] = HUD_KEYS.map((k) => ({
  id: k.id, code: k.code, label: k.label, hint: k.hint, panel: k.panel,
  when: k.action === 'close' ? () => panelOpen : undefined,
  run: () => ran.push(k.id),
}));
const pick = (pressed: string[], o: { consumed?: string[]; locked?: boolean; open?: string | null; typing?: boolean } = {}) =>
  selectHotkeys(keys, pressed, new Set(o.consumed ?? []), { typing: !!o.typing, locked: !!o.locked, openKind: o.open ?? null }).map((h) => h.id);

describe('패널 기본값·탭', () => {
  it('기본 패널 6개와 기본 탭', () => {
    expect(Object.keys(BUILTIN_PANELS).sort()).toEqual(['bag', 'board', 'craft', 'dex', 'museum', 'shop']);
    expect(BUILTIN_PANELS.dex.defaultTab).toBe('fish');
    expect(BUILTIN_PANELS.bag.defaultTab).toBe('all');
    expect(BUILTIN_PANELS.shop.defaultTab).toBe('sell');
    for (const p of Object.values(BUILTIN_PANELS)) {
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.title.length).toBeGreaterThan(0);
    }
  });
  it('pickTab: 요청 → 기본 → 첫 탭', () => {
    const tabs = [{ id: 'sell', label: '팔기' }, { id: 'buy', label: '사기' }];
    expect(pickTab('buy', tabs, 'sell')).toBe('buy');
    expect(pickTab('nope', tabs, 'sell')).toBe('sell');
    expect(pickTab(undefined, tabs, 'sell')).toBe('sell');
    expect(pickTab(undefined, [{ id: 'buy', label: '사기' }], 'sell')).toBe('buy');
    expect(pickTab('x', [], 'y')).toBe('x');
    expect(pickTab(undefined, [], 'y')).toBe('y');
  });
  it('가게 탭: 팔 수 없는 가게는 사기만, 인자 읽기', () => {
    expect(shopTabs('quack').map((t) => t.id)).toEqual(['sell', 'buy']);
    expect(shopTabs('peng').map((t) => t.id)).toEqual(['buy']);
    expect(shopTabs('shipyard').map((t) => t.id)).toEqual(['buy']);
    expect(shopOfArg({ shop: 'moon' })).toBe('moon');
    expect(shopOfArg('junk')).toBe('junk');
    expect(shopOfArg(undefined)).toBe('quack');
    expect(shopOfArg({})).toBe('quack');
    expect(shopInfo('quack').name).toBe('꽥꽥상회');
    expect(shopInfo('???').sell).toBe(true);
  });
  it('가방 탭 거르기', () => {
    expect(BAG_TABS.map((t) => t.id)).toEqual(['all', 'catch', 'mat', 'goods']);
    expect(bagTabMatch('all', 'mat')).toBe(true);
    expect(bagTabMatch('catch', 'mat')).toBe(false);
    expect(bagTabMatch(undefined, 'goods')).toBe(true);
  });
  it('레지스트리: 기본 탭 → 열린 패널 상태, 탭 없는 패널은 기본값', () => {
    const store = new HudRegistryStore();
    const calls: string[] = [];
    const impl: HudRenderer = {
      openPanel: (d, c) => calls.push(`open:${d.kind}:${c.tab}`), closePanel: () => calls.push('close'), showBanner() {}, showCard() {},
      setGauge() {}, refreshChips() {}, toast() {}, showRegion() {},
    };
    const def: PanelDef = { ...BUILTIN_PANELS.bag, tabs: () => BAG_TABS, render() {} };
    store.registerPanel(def);
    store.attach(impl);
    store.open('bag');
    expect(store.current()?.tab).toBe('all');
    store.toggle('bag');
    expect(store.isOpen()).toBe(false);
    expect(calls).toEqual(['open:bag:all', 'close']);
  });
});

describe('단축키 규칙', () => {
  it('B 도감 · Tab 말랑 주머니 · I 가방, 안내 칩은 B·Tab·I (wave 7)', () => {
    expect(pick(['KeyB'])).toEqual(['hud:dex']);
    expect(pick(['Tab'])).toEqual(['hud:pocket']);
    expect(pick(['KeyI'])).toEqual(['hud:bag']);
    const hints = keyHints(keys).map((k) => `${k.cap} ${k.label}`);
    expect(hints).toContain('B 도감');
    expect(hints).toContain('Tab 말랑 주머니');
    expect(hints).toContain('I 가방');
    expect(hints.filter((x) => x.endsWith('가방'))).toHaveLength(1);
    expect(hints).not.toContain('Esc 닫기');
  });
  it('Esc 는 창이 열려 있을 때만', () => {
    panelOpen = false;
    expect(pick(['Escape'])).toEqual([]);
    panelOpen = true;
    expect(pick(['Escape'], { locked: true, open: 'dex' })).toEqual(['hud:close']);
    panelOpen = false;
  });
  it('consumed 키는 건너뛴다', () => {
    expect(pick(['KeyB'], { consumed: ['KeyB'] })).toEqual([]);
    expect(pick(['KeyB', 'Tab'], { consumed: ['Tab'] })).toEqual(['hud:dex']);
  });
  it('입력 중이면 아무것도', () => {
    expect(pick(['KeyB', 'Tab'], { typing: true })).toEqual([]);
  });
  it('잠금: 창이 열려 있으면 hud 키는 돈다(바꾸기·닫기), 창 없는 잠금(미니게임)이면 안 돈다', () => {
    expect(pick(['KeyB'], { locked: true, open: null })).toEqual([]);
    expect(pick(['Tab'], { locked: true, open: 'dex' })).toEqual(['hud:pocket']);
    expect(pick(['KeyB'], { locked: true, open: 'dex' })).toEqual(['hud:dex']);
    // HUD 숨기기는 패널 키가 아니라 잠금 중엔 안 돈다
    expect(pick(['Backslash'], { locked: true, open: 'dex' })).toEqual([]);
    // ` 는 개발 패널 몫이라 hud 가 안 잡는다
    expect(pick(['Backquote'])).toEqual([]);
    expect(pick(['Backslash'])).toEqual(['hud:hide']);
  });
  it('다른 모듈 패널 키는 자기 패널일 때만 잠금을 뚫는다', () => {
    const m: HotkeyDef = { code: 'KeyM', label: '지도', panel: 'map', run() {} };
    const r = (open: string | null) => selectHotkeys([m], ['KeyM'], null, { typing: false, locked: true, openKind: open });
    expect(r('map')).toHaveLength(1);
    expect(r('dex')).toHaveLength(0);
  });
  it('같은 키 두 개면 먼저 등록된 것 하나', () => {
    const a: HotkeyDef = { code: 'KeyK', label: '우편', run() {} };
    const b: HotkeyDef = { code: 'KeyK', label: '우편2', run() {} };
    expect(selectHotkeys([a, b], ['KeyK'], null, { typing: false, locked: false, openKind: null })).toEqual([a]);
  });
  it('키 모자 글자', () => {
    expect(keyCap('KeyB')).toBe('B');
    expect(keyCap('Tab')).toBe('Tab');
    expect(keyCap('Escape')).toBe('Esc');
    expect(keyCap('Digit3')).toBe('3');
    expect(keyCap('Backquote')).toBe('`');
  });
});

describe('게이지·콤보', () => {
  it('show 이고 숫자일 때만 보인다', () => {
    expect(gaugeVisible({ label: 'a', value: 0.3, color: '#fff', show: true })).toBe(true);
    expect(gaugeVisible({ label: 'a', value: 0.3, color: '#fff', show: false })).toBe(false);
    expect(gaugeVisible({ label: 'a', value: NaN, color: '#fff', show: true })).toBe(false);
    expect(gaugeVisible(null)).toBe(false);
  });
  it('80% 넘으면 반짝', () => {
    expect(gaugeHot({ label: 'a', value: 0.81, color: '', show: true })).toBe(true);
    expect(gaugeHot({ label: 'a', value: 0.5, color: '', show: true })).toBe(false);
    expect(gaugeHot({ label: 'a', value: 7, color: '', show: true })).toBe(true);
  });
  it('콤보는 5 이상만', () => {
    expect(comboVisible(4)).toBe(false);
    expect(comboVisible(5)).toBe(true);
    expect(comboVisible(undefined)).toBe(false);
    expect(comboText(7)).toBe('콤보 7!');
  });
});

describe('가방 칸 글', () => {
  it('econ.bag 이 있으면 그 값', () => {
    const v = bagView({ used: 12, size: 30 }, {}, 20);
    expect(v.text).toBe('12/30칸');
    expect(v.full).toBe(false);
    expect(v.free).toBe(18);
  });
  it('꽉 참', () => {
    const v = bagView({ used: 20, size: 20 }, {}, 20);
    expect(v.text).toBe('20/20칸');
    expect(v.full).toBe(true);
    expect(v.ratio).toBe(1);
  });
  it('econ 없으면 가방 키를 센다(도구·0개 빼고), 크기는 기본값', () => {
    const bag = { f_carp: 3, m_wood: 10, tool_rod: 1, gone: 0, 'f_carp@crown': 1 };
    expect(countBagSlots(bag)).toBe(3);
    expect(bagView(null, bag, 20).text).toBe('3/20칸');
  });
});

describe('시계(game.env 만 읽는다)', () => {
  it('env 없으면 —', () => {
    const v = clockView(null);
    expect(v.time).toBe('—');
    expect(v.ready).toBe(false);
  });
  it('day N · HH:MM · 요일 · 날씨', () => {
    const v = clockView({ day: 0, hour: 9.5, weekday: 0, weather: 'rain' });
    expect(v.time).toBe('09:30');
    expect(v.day).toBe('1일째');
    expect(v.weekday).toBe('월');
    expect(v.weatherIcon).toBe('🌧️');
    expect(v.weatherName).toBe('비');
    expect(clockView({ day: 6, hour: 23.999, weekday: 6, weather: 'meteor' }).time).toBe('23:59');
    expect(clockView({ day: 6, hour: 23.999, weekday: 6, weather: 'meteor' }).weekday).toBe('일');
  });
  it('하늘 아이콘', () => {
    expect(skyOf(12)).toBe('day');
    expect(skyOf(6)).toBe('dawn');
    expect(skyOf(18)).toBe('dusk');
    expect(skyOf(22)).toBe('night');
  });
});

describe('행동 안내 칩', () => {
  it('current/currentAlt 를 그대로', () => {
    const c = promptChips('E 낚시하기', 'F 베기', { label: '낚시하기' }, { key: 'KeyF', label: '베기' });
    expect(c).toEqual([{ cap: 'E', label: '낚시하기', main: true }, { cap: 'F', label: '베기', main: false }]);
  });
  it('고른 게 없으면 글을 읽는다', () => {
    expect(promptChips('E 내리기', null)).toEqual([{ cap: 'E', label: '내리기', main: true }]);
    expect(splitPrompt('Space 당기기')).toEqual({ cap: 'Space', label: '당기기' });
    expect(splitPrompt('그냥 말')).toEqual({ cap: 'E', label: '그냥 말' });
    expect(promptChips(null, null)).toEqual([]);
  });
});

describe('해금 카드·큐', () => {
  const names = (k: string) => (k === 'tool:shovel' ? '삽' : undefined);
  it('키 종류로 제목, 이름은 표에서', () => {
    expect(unlockCard('tool:shovel', 'buy', names)).toMatchObject({ title: '새 도구!', body: '삽' });
    expect(unlockCard('v:bike', 'buy', names)?.title).toBe('새 탈것!');
    expect(unlockCard('bag:30', 'buy', names)?.body).toBe('30');
  });
  it('조용한 이유(시작·디버그)는 카드 없음', () => {
    expect(unlockCard('tool:rod', 'start', names)).toBeNull();
    expect(unlockCard('tool:rod', 'debug', names)).toBeNull();
    expect(unlockCard('', 'buy', names)).toBeNull();
  });
  it('TimedQueue: 하나씩, hold 면 안 내림, 넘치면 오래된 것 버림', () => {
    const q = new TimedQueue<{ t: string; ms?: number }>(1000, 2);
    q.push({ t: 'a' }); q.push({ t: 'b' });
    expect(q.update(0)?.show?.t).toBe('a');
    expect(q.update(500)).toBeNull();
    expect(q.update(1200, true)).toBeNull();
    expect(q.cur?.t).toBe('a');
    expect(q.update(1200)?.show?.t).toBe('b');
    expect(q.update(2300)?.hide?.t).toBe('b');
    q.push({ t: 'c' }); q.push({ t: 'd' }); q.push({ t: 'e' });
    expect(q.dropped).toBe(1);
    expect(q.update(3000)?.show?.t).toBe('d');
  });
});

describe('값·지갑·도감·이름', () => {
  it('값 글: 코인·반짝별·재료', () => {
    expect(costText({ coins: 1600, stars: 20, items: { p_sail: 1 } }, (id) => (id === 'p_sail' ? '돛' : id))).toBe('🪙 1,600 · ⭐ 20 · 돛 ×1');
    expect(costParts({})[0].text).toBe('공짜!');
    expect(costParts({ stars: 5 }).map((p) => p.kind)).toEqual(['stars']);
  });
  it('열쇠: 3조각 = 1개', () => {
    expect(keyView({ silver: 7, gold: 0, rainbow: 1 })).toEqual([{ color: 'silver', keys: 2, pieces: 1 }, { color: 'rainbow', keys: 0, pieces: 1 }]);
    expect(keyView(null)).toEqual([]);
  });
  it('카운트업은 결국 목표에 닿는다', () => {
    let v = 0;
    for (let i = 0; i < 60; i++) v = countStep(v, 1234);
    expect(v).toBe(1234);
    expect(countStep(10, 10.4)).toBe(10.4);
  });
  it('도감 칸: 실루엣 → 컬러 → 은별 → 금별 + 반짝이', () => {
    expect(dexCell(undefined).state).toBe('miss');
    expect(dexCell({ count: 1 }).state).toBe('got');
    expect(dexCell({ count: 10 }).state).toBe('silver');
    expect(dexCell({ count: 2, variants: { crown: 1, shiny: 1 } })).toEqual({ state: 'gold', shiny: true });
  });
  it('섬 % 바와 왕관', () => {
    const sp = [{ id: 'a', where: [{ island: 'home' }] }, { id: 'b', where: [{ island: 'home' }] }, { id: 'c', where: [{ island: 'ice' }] }, { id: 'd' }];
    expect(islandProgress(sp, (id) => id === 'a', 'home')).toEqual({ got: 1, total: 2, pct: 50, crown: false });
    expect(islandProgress(sp, (id) => id === 'c', 'ice').crown).toBe(true);
    expect(islandProgress(sp, () => false, null).total).toBe(4);
  });
  it('변이 이름·토스트 묶기', () => {
    expect(variantName('f_carp@crown', () => '잉어')).toBe('잉어 👑왕관');
    expect(variantName('f_carp', () => '잉어')).toBe('잉어');
    const d = new ToastDedupe(1000);
    expect(d.allow('가방이 꽉 찼어요!', 0)).toBe(true);
    expect(d.allow('가방이 꽉 찼어요!', 500)).toBe(false);
    expect(d.allow('가방이 꽉 찼어요!', 1600)).toBe(true);
  });
});

