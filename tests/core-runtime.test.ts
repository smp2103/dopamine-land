// 코어 v2 런타임(계약 3장): 저장 v2·옮기기·묶어 저장, 가방 훅, 변이, byGdd, 해제 함수, 잠금 주인, 땅 공급자, game.dex 외관,
// 상호작용 E/대체 키, 목격 등록소, 들어 올리기 정규화. 화면(WebGL·DOM) 없이 Game 을 띄운다.
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  GameState, migrateSave, migrateId, SAVE_KEY, SAVE_DEBOUNCE_MS, type Species, type StateEvent,
} from '../src/core/state';
import { Game } from '../src/core/game';
import { wrapForHold } from '../src/core/ui';
import * as Island from '../src/core/island';
import { holdLen, type HudRenderer, type PanelDef } from '../src/core/api';
import type { Engine } from '../src/core/engine';

// ───────────── 브라우저 대역 ─────────────
const store = new Map<string, string>();
const setItem = vi.fn((k: string, v: string) => { store.set(k, v); });
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem, removeItem: (k: string) => { store.delete(k); } },
  location: { search: '' },
});
// Input 이 window 에 키 리스너를 단다 — 노드엔 없으니 빈 함수
const g0 = globalThis as unknown as { addEventListener?: unknown };
if (typeof g0.addEventListener !== 'function') g0.addEventListener = () => {};

const fakeEl = () => ({ addEventListener() {} }) as unknown as HTMLElement;
/** 렌더러 없는 엔진 대역(게임이 쓰는 표면만) */
function fakeEngine(): Engine {
  return {
    renderer: { domElement: fakeEl() }, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    viewTarget: new THREE.Vector3(), timeScale: 1, applyTod: () => {},
  } as unknown as Engine;
}
const newGame = () => new Game(fakeEngine(), {});
const sp = (id: string, extra: Partial<Species> = {}): Species => ({ id, name: id, category: 'fish', rarity: 2, ...extra });
const saved = () => JSON.parse(store.get(SAVE_KEY) ?? 'null');

beforeEach(() => { store.clear(); setItem.mockClear(); });

// ───────────── 저장 v2 ─────────────
describe('저장 v2 — 옛 id 옮기기', () => {
  it('fruit-apple → m_apple (가방·도감·변이 꼬리, 겹치면 합친다)', () => {
    store.set(SAVE_KEY, JSON.stringify({
      coins: 120,
      bag: { 'fruit-apple': 3, m_apple: 1, beehive: 2, 'star-shard@shiny': 1, 'fruit-cherry': 4, other: 5, broken: -2 },
      dex: { 'fruit-apple': { count: 2, best: 5, first: 100 }, m_apple: { count: 1, best: 9, first: 50 } },
      flags: { econ: { stars: 3 } },
    }));
    const s = new GameState();
    s.load();
    expect(s.coins).toBe(120);
    expect(s.bag).toEqual({ m_apple: 4, m_honey: 2, 'm_stardust@shiny': 1, m_cherry: 4, other: 5 });
    expect(s.bag['fruit-apple']).toBeUndefined();
    expect(s.dex.m_apple).toEqual({ count: 3, best: 9, first: 50 });
    expect(s.dex['fruit-apple']).toBeUndefined();
    expect(s.flags).toEqual({ econ: { stars: 3 } });
    // v1 을 읽었으면 v2 로 다시 써 둔다(묶어서)
    expect(s.savePending).toBe(true);
    s.saveNow();
    expect(saved().v).toBe(2);
    expect(saved().bag.m_apple).toBe(4);
  });

  it('옮기기는 순수·멱등이고 깨진 저장도 받아 준다', () => {
    const once = migrateSave({ bag: { 'fruit-peach': 2 }, dex: {} });
    expect(migrateSave(once)).toEqual(once);
    expect(migrateSave(null)).toEqual({ v: 2, coins: 0, bag: {}, dex: {}, flags: {} });
    expect(migrateSave({ coins: 'x', bag: [1, 2], dex: 3 })).toEqual({ v: 2, coins: 0, bag: {}, dex: {}, flags: {} });
    expect(migrateId('fruit-orange@crown')).toBe('m_orange@crown');
    expect(migrateId('f_carp')).toBe('f_carp');
  });

  it('v2 저장을 다시 읽으면 다시 쓰지 않는다', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 2, coins: 1, bag: {}, dex: {}, flags: {} }));
    const s = new GameState();
    s.load();
    expect(s.savePending).toBe(false);
  });
});

describe('저장 v2 — 400ms 묶기 + saveNow', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('여러 번 불러도 400ms 뒤 한 번만 쓴다', () => {
    const s = new GameState();
    s.addCoins(5); s.addCoins(5); s.addItem('m_wood', 2); s.save();
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(saved()).toMatchObject({ v: 2, coins: 10, bag: { m_wood: 2 } });
    // 다음 묶음은 새로
    s.addCoins(1);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(setItem).toHaveBeenCalledTimes(2);
  });

  it('saveNow 는 바로 쓰고 예약을 지운다(두 번 쓰지 않는다)', () => {
    const s = new GameState();
    s.addCoins(7);
    expect(s.savePending).toBe(true);
    s.saveNow();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(saved().coins).toBe(7);
    expect(s.savePending).toBe(false);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 3);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('flush 는 예약이 있을 때만 쓴다(pagehide·숨김 때 이걸 부른다)', () => {
    const s = new GameState();
    s.flush();
    expect(setItem).not.toHaveBeenCalled();
    s.addCoins(3);
    s.flush();
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('저장이 터져도(용량 초과) 게임은 계속', () => {
    const s = new GameState();
    setItem.mockImplementationOnce(() => { throw new Error('QuotaExceeded'); });
    expect(() => s.saveNow()).not.toThrow();
  });
});

// ───────────── 수집 ─────────────
describe('collect — 가방 훅·변이·목격', () => {
  it('canAdd 가 false 면 도감만 적고 bag-full 을 보낸다', () => {
    const s = new GameState();
    const ev: StateEvent[] = [];
    s.on((e) => ev.push(e));
    s.canAdd = (id, n) => { expect(n).toBe(1); return id !== 'f_carp'; };
    const isNew = s.collect({ species: sp('f_carp'), size: 30, activity: 'fish' });
    expect(isNew).toBe(true);
    expect(s.dex.f_carp.count).toBe(1);
    expect(s.bag.f_carp).toBeUndefined();
    expect(ev.map((e) => e.type)).toEqual(['collect', 'bag-full']);
    expect(ev[1]).toEqual({ type: 'bag-full', id: 'f_carp' });
    expect(ev[0]).toMatchObject({ species: { id: 'f_carp' }, size: 30, isNew: true, activity: 'fish', rarity: 2, kept: false });
    // 다른 종은 들어간다
    s.collect({ species: sp('f_goby') });
    expect(s.bag.f_goby).toBe(1);
  });

  it('변이는 가방 키 `${id}@v` 로 따로, has(id) 는 기본 id 만 센다, 도감엔 변이별 수', () => {
    const s = new GameState();
    const ev: StateEvent[] = [];
    s.on((e) => ev.push(e));
    s.collect({ species: sp('f_carp', { rarity: 4 }), size: 50, variant: 'crown' });
    s.collect(sp('f_carp', { rarity: 4 }), 12, { variant: 'crown' });
    s.collect(sp('f_carp', { rarity: 4 }), 9, { variant: 'shiny' });
    expect(s.bag['f_carp@crown']).toBe(2);
    expect(s.bag['f_carp@shiny']).toBe(1);
    expect(s.has('f_carp')).toBe(false);
    expect(s.has('f_carp@crown', 2)).toBe(true);
    expect(s.dex.f_carp).toMatchObject({ count: 3, best: 50, variants: { crown: 2, shiny: 1 } });
    s.collect(sp('f_carp', { rarity: 4 }));
    expect(s.has('f_carp')).toBe(true);
    expect(s.dex.f_carp.variants).toEqual({ crown: 2, shiny: 1 });
    expect(ev[0]).toMatchObject({ type: 'collect', variant: 'crown', rarity: 4, isNew: true });
    expect(ev[1]).toMatchObject({ type: 'collect', isNew: false });
    // canAdd 는 변이 키로 묻는다
    const asked: string[] = [];
    s.canAdd = (id) => { asked.push(id); return true; };
    s.collect(sp('f_carp'), 1, { variant: 'tiny' });
    expect(asked).toEqual(['f_carp@tiny']);
  });

  it('keep:false(목격)는 도감만 — 가방 훅도 안 묻는다', () => {
    const s = new GameState();
    const canAdd = vi.fn(() => true);
    s.canAdd = canAdd;
    const ev: StateEvent[] = [];
    s.on((e) => ev.push(e));
    expect(s.collect({ species: sp('s_alien_kid'), keep: false })).toBe(true);
    expect(s.dex.s_alien_kid.count).toBe(1);
    expect(Object.keys(s.bag)).toEqual([]);
    expect(canAdd).not.toHaveBeenCalled();
    expect(ev.map((e) => e.type)).toEqual(['collect']);
  });

  it('변이 도감 기록이 저장·불러오기를 지난다', () => {
    const s = new GameState();
    s.collect(sp('f_carp'), 3, { variant: 'shiny' });
    s.saveNow();
    const r = new GameState();
    r.load();
    expect(r.dex.f_carp.variants).toEqual({ shiny: 1 });
    expect(r.bag['f_carp@shiny']).toBe(1);
  });
});

describe('byGdd', () => {
  it('GDD id 또는 실제 id 로 종을 찾는다', () => {
    const s = new GameState();
    s.register([sp('fish:carp', { gdd: 'f_carp' }), sp('f_goby')]);
    expect(s.byGdd('f_carp')?.id).toBe('fish:carp');
    expect(s.byGdd('fish:carp')?.id).toBe('fish:carp');
    expect(s.byGdd('f_goby')?.id).toBe('f_goby');
    expect(s.byGdd('nope')).toBeUndefined();
    // collect 로 처음 알게 된 종도
    s.collect(sp('b_x', { gdd: 'b_gdd_x' }));
    expect(s.byGdd('b_gdd_x')?.id).toBe('b_x');
  });
});

// ───────────── 해제 함수 ─────────────
describe('해제 함수', () => {
  it('state.on 이 해제를 돌려주고 off 도 된다, 한 리스너가 터져도 나머지는 받는다', () => {
    const s = new GameState();
    const a = vi.fn(), b = vi.fn();
    const offA = s.on(a);
    s.on(b);
    const bad = () => { throw new Error('boom'); };
    s.on(bad);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    s.emit({ type: 'x' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    s.off(b);
    s.emit({ type: 'x' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it('onUpdate·onWorld·addProvider·witnesses 가 해제를 돌려주고 removeProvider 는 그 id 를 전부 뗀다', () => {
    const g = newGame();
    const u = () => {};
    const offU = g.onUpdate(u);
    expect(g.updates).toContain(u);
    offU();
    expect(g.updates).not.toContain(u);

    const w = () => {};
    const offW = g.onWorld(w);
    offW();
    expect(g.worldHooks).not.toContain(w);

    const off1 = g.addProvider('p', () => null);
    g.addProvider('p', () => null);
    g.addProvider('q', () => null);
    off1();
    expect(g.providers.map((p) => p.id)).toEqual(['p', 'q']);
    g.removeProvider('p');
    expect(g.providers.map((p) => p.id)).toEqual(['q']);

    const pos = new THREE.Vector3(1, 0, 2);
    const offWit = g.witnesses.add(() => [{ speciesId: 'z_tino', pos }]);
    g.witnesses.add(() => { throw new Error('x'); });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(g.witnesses.list()).toEqual([{ speciesId: 'z_tino', pos }]);
    offWit();
    expect(g.witnesses.list()).toEqual([]);
    err.mockRestore();
  });
});

// ───────────── 플레이어 ─────────────
describe('잠금 주인 세기 + 예전 깃발', () => {
  it('lock/unlock 은 주인별로 세고, locked = true/false 는 따로 논다', () => {
    const p = newGame().player;
    expect(p.locked).toBe(false);
    p.lock('hud'); p.lock('hud'); p.lock('fishing');
    expect(p.locked).toBe(true);
    p.unlock('hud');
    p.unlock('fishing');
    expect(p.locked).toBe(true); // hud 가 하나 더
    p.unlock('hud');
    expect(p.locked).toBe(false);
    p.unlock('nobody'); // 모르는 주인은 무시
    expect(p.locked).toBe(false);

    // 예전 방식
    p.locked = true;
    expect(p.locked).toBe(true);
    p.lock('hud');
    p.locked = false; // 미니게임이 풀어도 hud 잠금은 남는다
    expect(p.locked).toBe(true);
    expect(p.lockedBy()).toEqual(['hud']);
    p.unlock('hud');
    expect(p.locked).toBe(false);

    p.lock('a'); p.lock('a'); p.unlock('a', true);
    expect(p.locked).toBe(false);
  });

  it('act(name, s) 는 시간이 지나면 풀리고, 그 사이 다른 동작이 덮으면 건드리지 않는다', () => {
    const p = newGame().player;
    const tick = (dt: number) => (p as unknown as { tickAct(dt: number): void }).tickAct(dt);
    p.act('cheer', 1);
    expect(p.action).toBe('cheer');
    tick(0.6);
    expect(p.action).toBe('cheer');
    tick(0.5);
    expect(p.action).toBeNull();
    p.act('dig', 1);
    p.action = 'fish';
    tick(2);
    expect(p.action).toBe('fish');
    p.act('sit');
    tick(100);
    expect(p.action).toBe('sit');
    p.act(null);
    expect(p.action).toBeNull();
  });
});

describe('땅 공급자', () => {
  let g: Game;
  beforeAll(async () => {
    g = newGame();
    await g.physics.init();
    g.player.init(0, 0);
  });

  it('처음 null 이 아닌 값이 heightAt 을 이긴다(등록 순서)', () => {
    const x = 5000, z = 5000; // 세계 밖
    const base = Island.heightAt(x, z);
    expect(g.groundAt(x, z)).toBe(base);
    const off1 = g.addGroundProvider((px, pz) => (Math.hypot(px - x, pz - z) < 50 ? 42 : null), 'interior');
    const off2 = g.addGroundProvider(() => 7, 'planet');
    expect(g.groundAt(x, z)).toBe(42);
    expect(g.groundAt(0, 0)).toBe(7);
    off2();
    expect(g.groundAt(0, 0)).toBe(Island.heightAt(0, 0));
    expect(g.groundProviderAt(0, 0)).toBeNull();
    // NaN·undefined·예외는 '안 맡음'
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const off3 = g.addGroundProvider(() => { throw new Error('x'); });
    const off4 = g.addGroundProvider(() => NaN);
    expect(g.groundAt(x, z)).toBe(42);
    off1(); off3(); off4();
    err.mockRestore();
    expect(g.groundAt(x, z)).toBe(base);
  });

  it('순간이동은 공급자 바닥에 내려 준다(바다 높이로 끌어올리지 않는다)', () => {
    const x = 3000, z = 3000;
    const off = g.addGroundProvider((px, pz) => (Math.abs(px - x) < 20 && Math.abs(pz - z) < 20 ? -20 : null));
    g.player.teleport(x, z);
    expect(g.player.pos.y).toBeCloseTo(-20, 5);
    off();
    g.player.teleport(x, z);
    expect(g.player.pos.y).toBeGreaterThan(-20); // 바다 위(수면 - 0.8)
  });

  it('focusOverride 가 있으면 순간이동 때 청크가 그 점 기준으로 돈다', () => {
    const seen: THREE.Vector3[] = [];
    const orig = g.chunks.update.bind(g.chunks);
    g.chunks.update = (f, force) => { seen.push(f.clone()); orig(f, force); };
    g.focusOverride = new THREE.Vector3(100, 0, 200);
    g.player.teleport(0, 0);
    expect(seen.at(-1)!.toArray()).toEqual([100, 0, 200]);
    g.focusOverride = null;
    g.player.teleport(10, 10);
    expect(seen.at(-1)!.x).toBe(10);
    g.chunks.update = orig;
  });
});

// ───────────── game.dex ─────────────
describe('game.dex 외관', () => {
  it('attach 전 open 을 쌓아 두고, 붙으면 연다. 덮어쓰기는 한 번 경고하고 무시', () => {
    const g = newGame();
    g.dex.open('bag', 'all');
    expect(g.hud.pendingOpen()).toEqual({ kind: 'bag', tab: 'all', arg: undefined });
    g.dex.open(); // 기본 = 'dex', 마지막 요청만 남는다
    expect(g.hud.pendingOpen()?.kind).toBe('dex');
    expect(g.dex).toBe(g.dex); // 같은 외관

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = g.dex;
    (g as unknown as { dex: unknown }).dex = { open() {} };
    (g as unknown as { dex: unknown }).dex = { open() {} };
    expect(g.dex).toBe(before);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();

    const log: string[] = [];
    const impl: HudRenderer = {
      openPanel: (d) => log.push(`open:${d.kind}`), closePanel: () => log.push('close'), showBanner: () => {}, showCard: () => {},
      setGauge: () => {}, refreshChips: () => {}, toast: (t) => log.push(`toast:${t}`), showRegion: () => {},
    };
    const panel: PanelDef = { kind: 'dex', title: '도감', color: '#fff', render: () => {} };
    g.dex.toast('안녕');
    g.dex.register(panel);
    g.hud.attach(impl);
    expect(log).toEqual(['open:dex', 'toast:안녕']);
    expect(g.hud.isOpen('dex')).toBe(true);
  });
});

// ───────────── 상호작용 ─────────────
describe('상호작용 고르기', () => {
  const pick = (g: Game) => (g as unknown as { pickInteraction(): void }).pickInteraction();

  it('E 는 가장 가까운 것, 대체 키는 우선순위 → 거리, consumedKeys 를 채운다', () => {
    const g = newGame();
    g.player.pos.set(0, 0, 0);
    const used: string[] = [];
    g.addInteractable({ id: 'pt-near', position: () => new THREE.Vector3(1, 0, 0), radius: 3, label: '가까운 점', onUse: () => used.push('pt-near') });
    g.addInteractable({ id: 'pt-out', position: () => new THREE.Vector3(9, 0, 0), radius: 3, label: '먼 점', onUse: () => used.push('pt-out') });
    g.addProvider('far-e', () => ({ label: '먼 E', dist: 2, use: () => used.push('far-e') }));
    g.addProvider('chop', () => ({ label: '베기', dist: 0.5, key: 'KeyF', priority: 10, use: () => used.push('chop') }));
    g.addProvider('mount', () => ({ id: 'dino-ride', label: '타기', dist: 2.5, key: 'KeyF', priority: 30, use: () => used.push('dino-ride') }));
    pick(g);
    expect(g.current?.id).toBe('pt-near');
    expect(g.currentAlt?.id).toBe('dino-ride');
    expect([...g.consumedKeys].sort()).toEqual(['KeyE', 'KeyF']);

    const list = g.listInteractions();
    expect(list.map((l) => l.id)).toEqual(['chop', 'pt-near', 'far-e', 'dino-ride']);
    expect(list.find((l) => l.id === 'chop')).toMatchObject({ key: 'KeyF', priority: 10, source: 'provider' });

    expect(g.interact('far-e')).toBe(true);
    expect(g.interact('pt-out')).toBe(false); // 반경 밖
    expect(g.interact('pt-out', { force: true })).toBe(true); // 디버그는 거리 무시
    expect(used).toEqual(['far-e', 'pt-out']);
  });

  it('잠금 중엔 아무것도, 탑승 중엔 whileMounted 만 고른다(E 는 내리기 몫)', () => {
    const g = newGame();
    g.addProvider('talk', () => ({ label: '말 걸기', dist: 1, use: () => {} }));
    g.addProvider('honk', () => ({ label: '빵빵', dist: 1, key: 'KeyH', whileMounted: true, use: () => {} }));
    g.player.lock('hud');
    pick(g);
    expect(g.current).toBeNull();
    expect(g.currentAlt).toBeNull();
    expect(g.consumedKeys.size).toBe(0);
    g.player.unlock('hud');
    (g.player as unknown as { mounted: unknown }).mounted = { name: '오리 튜브' };
    pick(g);
    expect(g.current).toBeNull();
    expect(g.currentAlt?.id).toBe('honk');
    expect(g.listInteractions().map((l) => l.id)).toEqual(['honk']);
    expect(g.interact('talk')).toBe(false);
  });

  it('use 가 터져도 게임은 계속', () => {
    const g = newGame();
    g.addProvider('bad', () => ({ label: '터짐', dist: 1, use: () => { throw new Error('x'); } }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(g.interact('bad')).toBe(true);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

// ───────────── 들어 올리기 ─────────────
describe('들어 올리기 정규화', () => {
  const longest = (o: THREE.Object3D) => {
    o.updateMatrixWorld(true);
    const s = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    return Math.max(s.x, s.y, s.z);
  };
  const model = (w: number, h: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
    m.position.set(3, 4, 5); // 엉뚱한 자리에 있어도
    return m;
  };

  it('가장 긴 변 = 0.55m, 가로는 가운데·바닥은 0, 원본 변환은 그대로', () => {
    const m = model(2, 1, 0.5);
    const { outer } = wrapForHold(m, holdLen({ shadow: 'M' }));
    expect(longest(outer)).toBeCloseTo(0.55, 5);
    const b = new THREE.Box3().setFromObject(outer);
    expect(b.min.y).toBeCloseTo(0, 5);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0, 5);
    expect(m.position.toArray()).toEqual([3, 4, 5]);
    expect(m.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('XL·XXL 그림자(또는 그림자 없고 len ≥ 150)는 1.1m', () => {
    expect(longest(wrapForHold(model(0.1, 0.1, 0.3), holdLen({ shadow: 'XXL' })).outer)).toBeCloseTo(1.1, 5);
    expect(longest(wrapForHold(model(5, 1, 1), holdLen({ len: 200 })).outer)).toBeCloseTo(1.1, 5);
    expect(longest(wrapForHold(model(5, 1, 1), holdLen({ shadow: 'L', len: 200 })).outer)).toBeCloseTo(0.55, 5);
  });

  it('showCatch 가 크기·변이·활동·keep 을 넘기고, 왕관 변이엔 금관을 씌운다', () => {
    const g = newGame();
    const ev: StateEvent[] = [];
    g.state.on((e) => ev.push(e));
    const isNew = g.ui.showCatch({ species: sp('f_koi', { rarity: 4 }), sizeText: '41.5cm', model: model(1, 1, 3), variant: 'crown', activity: 'fish' });
    expect(isNew).toBe(true);
    expect(ev[0]).toMatchObject({ type: 'collect', size: 41.5, variant: 'crown', activity: 'fish', rarity: 4 });
    expect(g.state.bag['f_koi@crown']).toBe(1);
    const held = g.ui.held!.obj;
    expect(held.getObjectByName('crown')).toBeTruthy();
    expect(held.parent).toBe(g.root);

    // 목격: 도감만
    g.ui.showCatch({ species: sp('s_alien_kid'), size: 80, keep: false });
    expect(g.state.dex.s_alien_kid.best).toBe(80);
    expect(g.state.bag.s_alien_kid).toBeUndefined();
  });

  it('빈 모델도 죽지 않는다', () => {
    const { outer } = wrapForHold(new THREE.Group(), 0.55);
    expect(outer.children.length).toBe(1);
  });
});
