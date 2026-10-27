// 테스트 키트 자체 검사 — 가짜 게임에 모듈을 띄우고, 시간·상호작용·env·HUD·저장 대역이 계약대로 도는지.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { makeFakeGame, makeCtx, recordEvents, recordingRenderer, resetKit, liveGames, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage, stubLocation, stubIndexedDB, stubWindowEvents, idbDone } from './kit/storage';
import { sceneStats, countMeshes, countInstances, countTriangles, allFinite, worldBox } from './kit/three';
import type { Ctx, ModuleBuild } from '../src/core/types';
import type { Species } from '../src/core/state';
import { HOUR_SEC, DAY_SEC, START_HOUR } from '../src/core/api';
import { HudRegistryStore } from '../src/core/registry';
import * as Island from '../src/core/island';

/** 시험용 모듈 — 진짜 모듈처럼 ctx 만 받아 청크·상호작용·매 프레임을 건다 */
const dummyModule: ModuleBuild = (ctx: Ctx) => {
  const game = ctx.game!;
  const root = new THREE.Group();
  root.name = 'dummy';
  const rng = ctx.rng('dummy:seed');
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshStandardMaterial({ color: ctx.palette.sand }));
  mesh.position.set(rng() * 4, 0, rng() * 4);
  root.add(mesh);
  let ticks = 0;
  ctx.onUpdate((_t, dt) => { if (dt > 0) ticks++; root.userData.ticks = ticks; });
  game.chunks.add({
    key: 'dummy-pebbles', size: 32, radius: 120, detail: true,
    build: ({ cx, cz }) => {
      const r = ctx.rng(`dummy-pebbles:${cx},${cz}`);
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial(), 5);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 5; i++) im.setMatrixAt(i, m.makeTranslation(cx * 32 + r() * 32, 0, cz * 32 + r() * 32));
      return im;
    },
  });
  const g = game as unknown as FakeGame;
  g.addProvider('dummy:poke', (p) => ({
    label: '콕 찌르기', dist: p.pos.distanceTo(mesh.position), use: () => { root.userData.poked = (root.userData.poked ?? 0) + 1; },
  }));
  g.addInteractable({ id: 'dummy:sign', position: () => new THREE.Vector3(0, 0, 0), radius: 3, label: '팻말 읽기', key: 'KeyF', priority: 10, onUse: () => { root.userData.read = true; } });
  ctx.onTod((name) => { root.userData.tod = name; });
  return root;
};

beforeEach(() => {
  stubLocalStorage();
  stubLocation('');
});

describe('makeFakeGame + makeCtx', () => {
  it('모듈 기본 내보내기가 가짜 ctx 위에서 돈다', async () => {
    const game = makeFakeGame({ pos: [0, 0] });
    const ctx = makeCtx(game);
    const obj = await dummyModule(ctx as unknown as Ctx);
    expect(obj).toBeInstanceOf(THREE.Group);
    expect(game.chunks.keys()).toEqual(['dummy-pebbles']);
    const chunk = game.chunks.buildAt('dummy-pebbles', 1, -2)!;
    expect(countInstances(chunk)).toBe(5);
    // 같은 칸은 언제 지어도 같다(ctx.rng 결정성)
    expect(game.chunks.signature('dummy-pebbles', 1, -2)).toBe(game.chunks.signature('dummy-pebbles', 1, -2));
    expect(() => game.chunks.buildAt('nope', 0, 0)).toThrow(/모르는 레이어/);
    expect(ctx.tod).toBe('day');
    expect(ctx.rng).toBeTypeOf('function');
    expect(ctx.rng('a')()).toBe(ctx.rng('a')());
  });

  it('tick 은 시간을 흘리고 onUpdate 를 부른다(timeScale 반영, 해제 가능)', async () => {
    const game = makeFakeGame();
    const ctx = makeCtx(game);
    const obj = (await dummyModule(ctx as unknown as Ctx)) as THREE.Object3D;
    game.tick(0.5, 4);
    expect(game.time).toBeCloseTo(2);
    expect(obj.userData.ticks).toBe(4);
    game.engine.timeScale = 2;
    game.tick(0.5);
    expect(game.time).toBeCloseTo(3);
    let calls = 0;
    const off = game.onUpdate(() => calls++);
    game.tick(0.1, 3);
    off();
    game.tick(0.1, 3);
    expect(calls).toBe(3);
  });

  it('interact(id) 가 공급자를 돌리고, 고르기는 진짜 selectInteractions 를 쓴다', async () => {
    const game = makeFakeGame({ pos: [0, 0] });
    const ctx = makeCtx(game);
    const obj = (await dummyModule(ctx as unknown as Ctx)) as THREE.Object3D;
    const ids = game.listInteractions().map((r) => r.id).sort();
    expect(ids).toEqual(['dummy:poke', 'dummy:sign']);
    expect(game.interact('dummy:poke')).toBe(true);
    expect(obj.userData.poked).toBe(1);
    expect(game.interact('없는거')).toBe(false);
    game.tick();
    expect(game.current?.id).toBe('dummy:poke');
    expect(game.currentAlt?.id).toBe('dummy:sign');
    expect([...game.consumedKeys].sort()).toEqual(['KeyE', 'KeyF']);
    expect(game.ui.prompt).toEqual(['E 콕 찌르기', 'F 팻말 읽기']);
    // 눌린 키로도 쓴다
    game.input.press('KeyF');
    game.tick();
    expect(obj.userData.read).toBe(true);
    game.input.press('KeyE');
    game.tick();
    expect(obj.userData.poked).toBe(2);
    // 잠그면 후보 없음, 주인별 카운터
    game.player.lock('hud'); game.player.lock('hud'); game.player.lock('fishing');
    game.player.unlock('hud');
    expect(game.player.locked).toBe(true);
    expect(game.interact('dummy:poke')).toBe(false);
    game.player.unlock('hud'); game.player.unlock('fishing');
    expect(game.player.locked).toBe(false);
    // removeProvider
    game.removeProvider('dummy:poke');
    expect(game.listInteractions().map((r) => r.id)).toEqual(['dummy:sign']);
    // 탑승 중엔 whileMounted 만
    game.player.mount({ name: '자전거' });
    game.tick();
    expect(game.current).toBe(null);
    expect(game.ui.prompt[0]).toBe('E 내리기');
    game.input.press('KeyE');
    game.tick();
    expect(game.player.mounted).toBe(null);
  });

  it('env.advance(1800) 은 그 자체로 아무 이벤트도 쏘지 않는다(순수 객체)', () => {
    const game = makeFakeGame();
    const rec = recordEvents(game);
    const env = game.env!;
    expect(env.hour).toBeCloseTo(START_HOUR);
    expect(env.tod).toBe('day');
    env.advance(DAY_SEC);
    expect(rec.events).toEqual([]);
    expect(env.day).toBe(1);
    expect(env.weekday).toBe(1);
    env.setHour(22);
    expect(env.tod).toBe('night');
    env.advance(3 * HOUR_SEC); // 22 → 01시, 다음 날
    expect(env.day).toBe(2);
    expect(env.midnight).toBe(true);
    env.forceWeather('*', 'storm', 2);
    expect(env.weather).toBe('storm');
    expect(env.waveMul).toBe(2);
    expect(env.forecast('home', 1)).toBe('storm');
    expect(env.forecast('home', 3)).toBe('clear');
    env.advance(2 * HOUR_SEC);
    expect(env.weather).toBe('clear');
    expect(env.waveMul).toBe(1);
    expect(rec.events).toEqual([]);
    rec.off();
    expect(makeFakeGame({ env: false }).env).toBe(null);
  });
});

describe('플레이어·세계·지면·목격', () => {
  it('teleport 는 지면 공급자를 먼저 따르고, act 는 시간이 지나면 풀린다', () => {
    const game = makeFakeGame({ pos: [5, 5] });
    expect(game.player.pos.x).toBe(5);
    const off = game.addGroundProvider((x) => (x > 100 ? 42 : null));
    game.player.teleport(200, 0);
    expect(game.player.pos.y).toBe(42);
    off();
    game.player.teleport(200, 0, 7);
    expect(game.player.pos.y).toBe(7);
    game.player.act('fish', 1);
    expect(game.player.action).toBe('fish');
    game.tick(0.5);
    expect(game.player.action).toBe('fish');
    game.tick(0.6);
    expect(game.player.action).toBe(null);
  });

  it('setWorld 는 onWorld 를 부르고, 서비스 슬롯은 기본 null', () => {
    const game = makeFakeGame({ world: 'space' });
    expect(game.world).toBe('space');
    const seen: string[] = [];
    game.onWorld((w) => seen.push(w));
    game.setWorld('earth');
    expect(seen).toEqual(['earth']);
    for (const k of ['econ', 'geo', 'ocean', 'space', 'vehicles', 'audio'] as const) expect(game[k]).toBe(null);
    expect(game.ext).toEqual({});
    expect(game.focusOverride).toBe(null);
  });

  it('witnesses 등록·해제, physics 대역은 remove() 를 준다', () => {
    const game = makeFakeGame();
    const off = game.witnesses.add(() => [{ speciesId: 'fish:a', pos: new THREE.Vector3() }]);
    expect(game.witnesses.list()).toHaveLength(1);
    off();
    expect(game.witnesses.list()).toHaveLength(0);
    const b = game.physics.add({ shape: { kind: 'ball', r: 0.3 }, position: { x: 1, y: 2, z: 3 } });
    const s = game.physics.addStatic({ kind: 'box' }, { x: 0, y: 0, z: 0 });
    expect(game.physics.live).toBe(2);
    expect(b.body.translation()).toEqual({ x: 1, y: 2, z: 3 });
    b.remove(); s.remove();
    expect(game.physics.live).toBe(0);
  });
});

describe('ui·hud', () => {
  it('showCatch 는 state.collect 로 도감·가방에 넣는다', () => {
    const game = makeFakeGame();
    const sp: Species = { id: 'fish:kit', name: '키트 물고기', category: 'fish', rarity: 2 };
    const rec = recordEvents(game);
    expect(game.ui.showCatch({ species: sp, size: 21, activity: 'fish' })).toBe(true);
    expect(game.ui.showCatch({ species: sp, size: 30 })).toBe(false);
    expect(game.state.dex['fish:kit'].count).toBe(2);
    expect(game.state.dex['fish:kit'].best).toBe(30);
    expect(game.state.bag['fish:kit']).toBe(2);
    expect(rec.of('collect')).toHaveLength(2);
    expect(game.ui.catches.map((c) => c.isNew)).toEqual([true, false]);
    rec.off();
  });

  it('hud 는 진짜 HudRegistryStore 에 기록 렌더러가 붙어 있다', () => {
    const game = makeFakeGame();
    expect(game.hud).toBeInstanceOf(HudRegistryStore);
    expect(game.hud.attached).toBe(true);
    game.hud.registerPanel({ kind: 'kit', title: '키트', color: '#ffcf4a', tabs: () => [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], render: () => {} });
    game.hud.open('kit');
    expect(game.hudLog.openDef?.kind).toBe('kit');
    game.hudLog.lastCtx!.setTab('b');
    expect(game.hud.current()?.tab).toBe('b');
    game.hud.toast('안녕!');
    game.hud.card({ title: '카드', body: '' });
    game.dex.close();
    expect(game.hudLog.toasts).toEqual(['안녕!']);
    expect(game.hudLog.cards.map((c) => c.title)).toEqual(['카드']);
    expect(game.hudLog.openDef).toBe(null);
    const r = recordingRenderer();
    game.hud.attach(r);
    expect(r.log.some(([n]) => n === 'addPanel')).toBe(true);
  });

  it('ctx.setTod: onTod 는 늘, onTodChange 는 이름이 바뀔 때만', () => {
    const ctx = makeCtx();
    const all: string[] = [], changes: string[] = [];
    ctx.onTod((n) => all.push(n));
    ctx.onTodChange((n) => changes.push(n));
    ctx.setTod('day'); ctx.setTod('night'); ctx.setTod('night');
    expect(all).toEqual(['day', 'night', 'night']);
    expect(changes).toEqual(['night']);
  });

  it('scatter 대역은 결정적이고 최소 간격을 지킨다', () => {
    const a = makeCtx().scatter({ key: 'k', count: 20, minDist: 3, accept: () => true });
    const b = makeCtx().scatter({ key: 'k', count: 20, minDist: 3, accept: () => true });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(5);
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) expect(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z)).toBeGreaterThanOrEqual(3);
  });
});

describe('저장 대역', () => {
  it('localStorage·location 대역으로 저장 → 새 게임에서 불러온다, ?fresh=1 이면 안 불러온다', () => {
    const ls = stubLocalStorage();
    const g1 = makeFakeGame();
    g1.state.addCoins(77);
    g1.flushSave();
    expect(ls.map.size).toBe(1);
    expect(makeFakeGame().state.coins).toBe(77);
    expect(makeFakeGame({ search: '?fresh=1' }).state.coins).toBe(0);
    expect(location.search).toBe('?fresh=1');
    stubLocation('p0=0');
    expect(location.search).toBe('?p0=0');
  });

  it('창 이벤트 대역(pagehide)', () => {
    const w = stubWindowEvents({ document: true });
    let n = 0;
    addEventListener('pagehide', () => n++);
    w.fire('pagehide');
    expect(n).toBe(1);
    w.restore();
  });

  it('IndexedDB 라이트: 열기·업그레이드·넣기·읽기·지우기', async () => {
    const idb = stubIndexedDB();
    const open = indexedDB.open('dopamine-land-photos', 1);
    open.onupgradeneeded = () => { open.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true }); };
    const db = await idbDone<IDBDatabase>(open);
    expect(db.objectStoreNames.contains('photos')).toBe(true);
    const tx = db.transaction('photos', 'readwrite');
    const st = tx.objectStore('photos');
    const k1 = await idbDone<number>(st.put({ title: '노을', data: new Uint8Array([1, 2, 3]) }));
    const k2 = await idbDone<number>(st.put({ title: '고래' }));
    expect([k1, k2]).toEqual([1, 2]);
    const done = new Promise<void>((res) => { tx.oncomplete = () => res(); });
    await done;
    const rtx = db.transaction(['photos'], 'readonly').objectStore('photos');
    const all = await idbDone<Array<{ title: string }>>(rtx.getAll());
    expect(all.map((x) => x.title)).toEqual(['노을', '고래']);
    expect(await idbDone(rtx.count())).toBe(2);
    await expect(idbDone(rtx.delete(1))).rejects.toThrow(/ReadOnly/);
    const wtx = db.transaction('photos', 'readwrite').objectStore('photos');
    await idbDone(wtx.delete(1));
    expect(idb.rows('dopamine-land-photos', 'photos')).toHaveLength(1);
    // 다시 열면(같은 버전) 업그레이드 없이 그대로
    let upgraded = false;
    const again = indexedDB.open('dopamine-land-photos', 1);
    again.onupgradeneeded = () => { upgraded = true; };
    await idbDone(again);
    expect(upgraded).toBe(false);
    idb.restore();
  });
});

describe('three 세기', () => {
  it('메시·인스턴스·삼각형', () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())); // 12 삼각형
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), 10); // 2 × 10
    im.count = 7;
    g.add(im);
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    hidden.visible = false;
    g.add(hidden);
    expect(countMeshes(g)).toBe(3);
    expect(countInstances(g)).toBe(1 + 7 + 1);
    expect(countTriangles(g)).toBe(12 + 14 + 12);
    const s = sceneStats(g, { visibleOnly: true });
    expect(s).toMatchObject({ meshes: 2, instancedMeshes: 1, instances: 8, triangles: 26, drawCalls: 2 });
    expect(allFinite(g)).toBe(true);
    expect(worldBox(g).isEmpty()).toBe(false);
  });
});

describe('showCatch 옵션(계약 v2 collect opts)', () => {
  it('keep:false 는 도감만, canAdd 가 막으면 bag-full', () => {
    const game = makeFakeGame();
    const sp: Species = { id: 'bug:seen', name: '본 벌레', category: 'bug', rarity: 1 };
    const rec = recordEvents(game);
    game.ui.showCatch({ species: sp, keep: false });
    expect(game.state.dex['bug:seen']).toBeTruthy();
    expect(game.state.bag['bug:seen'] ?? 0).toBe(0);
    const st = game.state as unknown as { canAdd?: (id: string, n: number) => boolean };
    st.canAdd = () => false;
    game.ui.showCatch({ species: sp, activity: 'bug' });
    expect(game.state.bag['bug:seen'] ?? 0).toBe(0);
    expect(rec.of('bag-full')).toHaveLength(1);
    rec.off();
  });
});

describe('리뷰 수정 — 진짜 Game 과 같은 뜻', () => {
  const coinsIn = (ls: { map: Map<string, string> }) => {
    const raw = [...ls.map.values()][0];
    return raw ? (JSON.parse(raw) as { coins?: number }).coins : undefined;
  };

  it('기본은 바로 저장 — 옛 게임 저장이 다음 저장소를 덮지 않는다(A/B)', async () => {
    const lsA = stubLocalStorage();
    const a = makeFakeGame();
    a.state.addCoins(5);
    expect(coinsIn(lsA)).toBe(5);
    const lsB = stubLocalStorage();
    const b = makeFakeGame();
    b.state.addCoins(100);
    b.flushSave();
    await new Promise((r) => setTimeout(r, 600));
    expect(coinsIn(lsB)).toBe(100);
  });

  it('debounce:true 여도 stubLocalStorage 가 옛 타이머·pagehide 를 치운다', () => {
    vi.useFakeTimers();
    try {
      const w = stubWindowEvents();
      stubLocalStorage();
      const a = makeFakeGame({ debounce: true });
      a.state.addCoins(5);
      expect(a.state.savePending).toBe(true);
      const lsB = stubLocalStorage();
      expect(a.disposed).toBe(true);
      expect(a.state.savePending).toBe(false);
      // 창 리스너도 떼었다(남아 있으면 아래 pagehide 가 a 를 부른다)
      expect((a.state as unknown as { flushHooked: boolean }).flushHooked).toBe(false);
      const b = makeFakeGame({ debounce: true });
      b.state.addCoins(100);
      vi.advanceTimersByTime(600);
      expect(coinsIn(lsB)).toBe(100);
      // 다시 묶어 두고 pagehide → b 만 쓴다(a 는 떨어졌다)
      b.state.addCoins(1);
      a.state.coins = 999;
      w.fire('pagehide');
      expect(coinsIn(lsB)).toBe(101);
      // dispose({flush}) 는 먼저 쓴다
      b.state.addCoins(1);
      b.dispose({ flush: true });
      expect(coinsIn(lsB)).toBe(102);
      resetKit();
      expect(liveGames()).toBe(0);
      w.restore();
    } finally { vi.useRealTimers(); }
  });

  it('groundAt 은 늘 숫자(공급자 → 섬), groundProviderAt 은 공급자만, 넘어진 공급자는 건너뛴다', () => {
    const game = makeFakeGame({ pos: [0, 0] });
    const base = Island.heightAt(0, 0);
    expect(game.groundProviderAt(0, 0)).toBe(null);
    expect(game.groundAt(0, 0)).toBe(base);
    game.addGroundProvider(() => { throw new Error('펑'); }, 'broken');
    const off = game.addGroundProvider((x) => (x === 0 ? 3 : null), 'room');
    expect(game.groundProviderAt(0, 0)).toBe(3);
    expect(game.groundAt(0, 0)).toBe(3);
    expect(game.heightAt(0, 0)).toBe(3);
    off();
    expect(game.groundAt(0, 0)).toBe(base);
    // 내리기는 onExit 높이와 바닥 중 높은 쪽
    game.addGroundProvider(() => 10, 'floor');
    game.player.mount({ name: '자전거', onExit: () => new THREE.Vector3(1, 2, 1) });
    game.player.dismount();
    expect(game.player.pos.y).toBe(10);
  });

  it('interact: 탔을 땐 whileMounted 만, force 는 거리 무시 점 상호작용, list 는 가까운 순·유한 거리만', () => {
    const game = makeFakeGame({ pos: [0, 0] });
    let walk = 0, ride = 0, far = 0;
    game.addProvider('walk', () => ({ label: '걷기용', dist: 2, use: () => { walk++; } }));
    game.addProvider('ride', () => ({ label: '탈것용', dist: 1, whileMounted: true, use: () => { ride++; } }));
    game.addProvider('nan', () => ({ label: '이상한', dist: Number.NaN, use: () => {} }));
    game.addInteractable({ id: 'far', position: () => new THREE.Vector3(500, 0, 500), radius: 2, label: '먼 팻말', onUse: () => { far++; } });
    expect(game.listInteractions().map((r) => r.id)).toEqual(['ride', 'walk']);
    game.player.mount({ name: '자전거' });
    expect(game.interact('walk')).toBe(false);
    expect(game.interact('ride')).toBe(true);
    expect(game.listInteractions().map((r) => r.id)).toEqual(['ride']);
    game.player.dismount();
    expect(game.interact('far')).toBe(false);
    expect(game.interact('far', { force: true })).toBe(true);
    expect([walk, ride, far]).toEqual([0, 1, 1]);
  });

  it('unlock(owner, all) · lockedBy()', () => {
    const p = makeFakeGame().player;
    p.lock('hud'); p.lock('hud'); p.lock('fishing');
    expect(p.lockedBy().sort()).toEqual(['fishing', 'hud']);
    p.unlock('hud', true);
    expect(p.lockedBy()).toEqual(['fishing']);
    p.unlock('모르는'); // 아무 일 없음
    p.unlock('fishing');
    p.locked = true;
    expect(p.lockedBy()).toEqual(['(legacy)']);
  });
});
