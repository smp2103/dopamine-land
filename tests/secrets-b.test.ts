// 숨은 곳 B(hidden): 썰물 모래톱 일정(5~9시만 드러남) · 피라미드 퍼즐 상태 기계(밀기·발판·잠긴 채 열림·되돌리기·저장, 방마다 풀이가 있다) ·
// 모래폭풍일 때만 보이는 신전 · 하루 한 번/평생 한 번 보상 규칙. 마지막 묶음은 가짜 게임에 모듈을 띄워
// secret-found 가 숨은 곳마다 딱 한 번 나오는지, 모래톱 땅 공급자와 신전 보이기가 시계·날씨를 따르는지 본다.
import { describe, it, expect, beforeEach } from 'vitest';
import { stubLocalStorage } from './kit/storage';
import { makeFakeGame, makeCtx, recordEvents } from './kit/fakeGame';
import { WEATHERS } from '../src/core/api';
import { SECRET_IDS } from '../src/core/events';
import * as Island from '../src/core/island';
import { worldFeatures } from '../src/core/world';
import buildHidden from '../src/modules/hidden';
import {
  HIDDEN_IDS, SPOTS, TIDE, tideLift, sandbarWalkable, sandbarTopY, tideFalling, hoursToLowTide, sandbarProfile, sandbarShells, segProject,
  templeVisible, fadeToward, templeSolid, clamOpen, clamReachable, updraftLift, UPDRAFT,
  emptyFlags, readHiddenFlags, markFound, takeDaily, dailyReady, takeOnce, chestTierFor, scarabToday,
} from '../src/modules/hidden/logic';
import {
  ROOMS, PUZZLE_ROOMS, CELL, initialState, push, resetRoom, covered, coveredCount, solve, loadStates, saveStates, solvedState, allSolved, doorOpen,
  cellToLocal, localToCell, blockFree, parseRoom,
} from '../src/modules/hidden/puzzle';
import { rngFor } from '../src/core/rng';
import * as THREE from 'three';
import { Bake, disposeTree, matBase, sph } from '../src/modules/hidden/kit';
import { pickupShellGeos, stardustOrbGeo, buildTemple, buildPirateMouth } from '../src/modules/hidden/models';

beforeEach(() => { stubLocalStorage(); });

describe('썰물 모래톱 일정', () => {
  it('아침 5~9시 안에서만 드러나고, 나머지 시간엔 완전히 잠긴다', () => {
    for (const h of [0, 2, 4, 4.99, 9, 9.5, 12, 17, 21, 23.9, 24 + 3]) {
      expect(tideLift(h)).toBe(0);
      expect(sandbarWalkable(h)).toBe(false);
    }
    for (const h of [5.5, 6, 7, 8, 8.5, 24 + 6.5, -24 + 7]) {
      expect(tideLift(h)).toBe(1);
      expect(sandbarWalkable(h)).toBe(true);
    }
  });
  it('창 안쪽 0.4시간 동안 부드럽게 오르고 내린다(단조)', () => {
    let prev = -1;
    for (let h = TIDE.start; h <= TIDE.start + TIDE.ramp; h += 0.02) { const l = tideLift(h); expect(l).toBeGreaterThanOrEqual(prev - 1e-9); prev = l; }
    prev = 2;
    for (let h = TIDE.end - TIDE.ramp; h < TIDE.end; h += 0.02) { const l = tideLift(h); expect(l).toBeLessThanOrEqual(prev + 1e-9); prev = l; }
    expect(tideLift(TIDE.start + 0.05)).toBeLessThan(TIDE.walkAt);
    expect(tideFalling(8.8)).toBe(true);
    expect(tideFalling(7)).toBe(false);
  });
  it('높이: 다 드러나면 해수면 위, 잠기면 해저(약 −0.7 m)보다 아래', () => {
    expect(sandbarTopY(1)).toBeCloseTo(TIDE.top, 6);
    expect(sandbarTopY(1)).toBeGreaterThan(0);
    expect(sandbarTopY(0)).toBeLessThan(-1.2);
    expect(sandbarProfile(0)).toBeCloseTo(0, 9);
    expect(sandbarProfile(TIDE.halfW)).toBeGreaterThan(-0.3);
    expect(sandbarProfile(TIDE.halfW + 2.4)).toBeLessThan(-1.9);
  });
  it('다음 썰물까지 남은 시간', () => {
    expect(hoursToLowTide(7)).toBe(0);
    expect(hoursToLowTide(4)).toBeGreaterThan(1);
    expect(hoursToLowTide(4)).toBeLessThan(1.5);
    expect(hoursToLowTide(12)).toBeGreaterThan(17);
  });
  it('모래톱은 산호빛섬과 쪼꼬미섬 C 를 잇고, 길 위 해저는 물 바로 아래다', () => {
    const f = worldFeatures().find((q) => q.kind === 'sandbar')!;
    const [a, b] = f.pts!;
    const coral = Island.islandById('coral')!, c = Island.islandById('islet-c')!;
    expect(Math.hypot(a.x - coral.x, a.z - coral.z)).toBeLessThan(coral.r);
    expect(Math.hypot(b.x - c.x, b.z - c.z)).toBeLessThan(c.r * 1.2);
    for (const t of [0.3, 0.5, 0.7]) {
      const h = Island.heightAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      expect(h).toBeLessThan(0);
      expect(h).toBeGreaterThan(sandbarTopY(0) + 0.4);
    }
    expect(segProject(a.x, a.z, a, b).t).toBe(0);
  });
  it('조개 자리는 하루마다 결정적이고 길 위에 있다', () => {
    const s1 = sandbarShells(3, rngFor), s2 = sandbarShells(3, rngFor), s3 = sandbarShells(4, rngFor);
    expect(s1).toEqual(s2);
    expect(s1).not.toEqual(s3);
    for (const s of s1) { expect(s.t).toBeGreaterThan(0.1); expect(s.t).toBeLessThan(0.9); expect(Math.abs(s.s)).toBeLessThan(TIDE.halfW); }
  });
});

describe('모래폭풍 신전 보이기', () => {
  it('날씨 10가지 중 모래폭풍에서만 보인다', () => {
    for (const w of WEATHERS) expect(templeVisible(w)).toBe(w === 'sandstorm');
    expect(templeVisible(null)).toBe(false);
    expect(templeVisible(undefined)).toBe(false);
  });
  it('서서히 나타나고 사라진다(촬영 dt=0 이면 바로)', () => {
    let k = 0;
    k = fadeToward(k, true, 0.5);
    expect(k).toBeGreaterThan(0);
    expect(templeSolid(k)).toBe(false);
    for (let i = 0; i < 10; i++) k = fadeToward(k, true, 0.5);
    expect(k).toBe(1);
    expect(templeSolid(k)).toBe(true);
    k = fadeToward(k, false, 0.5);
    expect(k).toBeLessThan(1);
    expect(fadeToward(0.3, true, 0)).toBe(1);
    expect(fadeToward(0.3, false, 0)).toBe(0);
  });
});

describe('피라미드 퍼즐 상태 기계', () => {
  it('방 3개 + 보물방, 모든 퍼즐 방은 블록 수 = 발판 수이고 문이 있다', () => {
    expect(ROOMS).toHaveLength(4);
    expect(PUZZLE_ROOMS).toHaveLength(3);
    for (const r of PUZZLE_ROOMS) {
      expect(r.start.length).toBe(r.plates.length);
      expect(r.door).not.toBeNull();
      expect(covered(r, initialState(r))).toBe(false);
    }
    expect(ROOMS[3].pedestals).toHaveLength(2);
    expect(PUZZLE_ROOMS.map((r) => r.start.length)).toEqual([1, 2, 3]);
  });
  it('방마다 입구에서 풀 수 있다(BFS) — 뒤로 갈수록 더 많이 민다', () => {
    const n = PUZZLE_ROOMS.map((r) => solve(r));
    for (const k of n) expect(k).toBeGreaterThan(0);
    expect(n[0]).toBeLessThan(n[1]);
    expect(n[2]).toBeGreaterThanOrEqual(5);
  });
  it('밀기: 앞 칸 블록이 한 칸, 너머가 벽·블록이면 막힘, 빈 곳 밀기는 none', () => {
    const r = PUZZLE_ROOMS[0], s0 = initialState(r);
    const [bx, by] = r.start[0];
    // 아래(남)에서 위(북)로
    const a = push(r, s0, bx, by + 1, 'N');
    expect(a.ok).toBe(true);
    expect(a.state.blocks[0]).toEqual([bx, by - 1]);
    expect(a.state.moves).toBe(1);
    expect(s0.blocks[0]).toEqual([bx, by]); // 원래 상태는 그대로(불변)
    expect(push(r, s0, bx + 3, by, 'E').why).toBe('none');
    // 벽 앞까지 밀어 붙이면 막힌다
    const wallSide = push(r, { blocks: [[1, 3]], solved: false, moves: 0 }, 2, 3, 'W');
    expect(wallSide.ok).toBe(false);
    expect(wallSide.why).toBe('blocked');
    // 블록끼리
    const r2 = PUZZLE_ROOMS[1], s2 = initialState(r2);
    const [p, q] = r2.start;
    expect(q[0] - p[0]).toBe(2);
    const m = push(r2, s2, p[0] - 1, p[1], 'E');
    expect(m.ok).toBe(true);
    expect(push(r2, m.state, p[0], p[1], 'E').why).toBe('blocked');
  });
  it('발판을 다 덮는 순간 풀리고(solvedNow), 풀린 방은 더 안 바뀌고 되돌리기도 안 된다', () => {
    const r = PUZZLE_ROOMS[0];
    const [bx, by] = r.start[0];
    let s = initialState(r);
    let res = push(r, s, bx, by + 1, 'N');
    expect(res.solvedNow).toBe(false);
    s = res.state;
    res = push(r, s, bx, by, 'N');
    expect(res.ok).toBe(true);
    expect(res.solvedNow).toBe(true);
    expect(res.state.solved).toBe(true);
    expect(coveredCount(r, res.state)).toBe(1);
    expect(push(r, res.state, bx, by - 1, 'N').why).toBe('solved');
    expect(resetRoom(r, res.state)).toBe(res.state);
    expect(doorOpen([res.state], 0)).toBe(true);
  });
  it('되돌리기: 안 풀린 방은 처음 자리로', () => {
    const r = PUZZLE_ROOMS[2];
    const s = push(r, initialState(r), r.start[2][0], r.start[2][1] + 1, 'N').state;
    expect(s.moves).toBe(1);
    expect(resetRoom(r, s)).toEqual(initialState(r));
  });
  it('저장/불러오기: 정상 값은 그대로, 망가진 값·거짓 solved 는 고친다', () => {
    const st = PUZZLE_ROOMS.map((r) => initialState(r));
    st[0] = solvedState(PUZZLE_ROOMS[0], 2);
    const back = loadStates(JSON.parse(JSON.stringify(saveStates(st))));
    expect(back).toEqual(st);
    expect(allSolved(back)).toBe(false);
    expect(loadStates(null)).toEqual(PUZZLE_ROOMS.map((r) => initialState(r)));
    const liar = loadStates([{ blocks: PUZZLE_ROOMS[0].start, solved: true, moves: 3 }]);
    expect(liar[0].solved).toBe(false);
    const wall = loadStates([{ blocks: [[0, 0]], solved: false, moves: 0 }]);
    expect(wall[0]).toEqual(initialState(PUZZLE_ROOMS[0]));
    expect(allSolved(PUZZLE_ROOMS.map((r) => solvedState(r)))).toBe(true);
  });
  it('블록은 문·입구 칸으로 못 들어간다', () => {
    for (const r of PUZZLE_ROOMS) {
      const s = initialState(r);
      expect(blockFree(r, s, r.entry[0], r.entry[1])).toBe(false);
      expect(blockFree(r, s, r.door![0], r.door![1])).toBe(false);
    }
  });
  it('칸 ↔ 실내 좌표가 맞고, 방이 북쪽으로 이어진다(문 칸 바로 위가 다음 방 입구)', () => {
    for (let k = 0; k < ROOMS.length; k++) for (const [x, y] of [[1, 1], [ROOMS[k].w - 2, ROOMS[k].h - 2]]) {
      const l = cellToLocal(k, x, y);
      expect(localToCell(l.x + 0.3, l.z - 0.3)).toEqual({ k, x, y });
    }
    for (let k = 0; k < PUZZLE_ROOMS.length; k++) {
      const d = cellToLocal(k, ROOMS[k].door![0], ROOMS[k].door![1]);
      const e = cellToLocal(k + 1, ROOMS[k + 1].entry[0], ROOMS[k + 1].entry[1]);
      expect(e.x).toBeCloseTo(d.x, 6);
      expect(d.z - e.z).toBeCloseTo(CELL, 6);
    }
    expect(localToCell(500, 500)).toBeNull();
  });
  it('지도 읽기: * 는 발판 위 블록', () => {
    const r = parseRoom('t', 't', ['#####', '#*.o#', '#...#', '#.B.#', '#...#', '##S##']);
    expect(r.plates).toEqual([[1, 1], [3, 1]]);
    expect(r.start).toEqual([[1, 1], [2, 3]]);
    expect(solve(r)).toBe(3);
    // 막힌 방은 -1
    expect(solve(parseRoom('u', 'u', ['#####', '#.o.#', '#B..#', '##S##']))).toBe(-1);
  });
});

describe('그 밖의 규칙', () => {
  it('숨은 곳 8곳(launch-probe 제외)이 모두 계약의 비밀 id 이고 카드 문구가 있다', () => {
    expect(HIDDEN_IDS).toHaveLength(8);
    expect(HIDDEN_IDS as readonly string[]).not.toContain('launch-probe');
    for (const id of HIDDEN_IDS) { expect(SECRET_IDS as readonly string[]).toContain(id); expect(SPOTS[id].body.length).toBeGreaterThan(10); }
  });
  it('하루 한 번 · 평생 한 번 · 발견은 한 번', () => {
    const f = emptyFlags();
    expect(markFound(f, 'coral-clam')).toBe(true);
    expect(markFound(f, 'coral-clam')).toBe(false);
    expect(takeDaily(f, 'pearl', 3)).toBe(true);
    expect(takeDaily(f, 'pearl', 3)).toBe(false);
    expect(dailyReady(f, 'pearl', 4)).toBe(true);
    expect(takeOnce(f, 'x')).toBe(true);
    expect(takeOnce(f, 'x')).toBe(false);
    expect(chestTierFor(true)).toBe('gold');
    expect(chestTierFor(false)).toBe('silver');
    expect(scarabToday(false, 0.99)).toBe(true);
    expect(scarabToday(true, 0.99)).toBe(false);
    expect(scarabToday(true, 0.1)).toBe(true);
    const flags: Record<string, unknown> = { hidden: { found: 'oops', pyramid: 3 } };
    const r = readHiddenFlags(flags);
    expect(r.found).toEqual([]);
    expect(r.pyramid.rooms).toEqual([]);
    expect(flags.hidden).toBe(r);
  });
  it('대왕조개는 9초마다 5초 벌린다', () => {
    expect(clamOpen(2)).toBe(1);
    expect(clamReachable(2)).toBe(true);
    expect(clamOpen(6)).toBe(0);
    expect(clamReachable(9 + 2)).toBe(true);
  });
  it('상승 기류: 기둥 가운데가 세고 밖·꼭대기 위는 0', () => {
    expect(updraftLift(0, 0, 10, 0)).toBeCloseTo(UPDRAFT.lift, 3);
    expect(updraftLift(UPDRAFT.r + 0.1, 0, 10, 0)).toBe(0);
    expect(updraftLift(0, 0, UPDRAFT.height + 1, 0)).toBe(0);
    expect(updraftLift(UPDRAFT.r * 0.7, 0, 10, 0)).toBeLessThan(updraftLift(1, 0, 10, 0));
  });
});

describe('가짜 게임에 띄우기', () => {
  async function boot(hour = 12) {
    const game = makeFakeGame({ load: false, hour });
    const ctx = makeCtx(game);
    const root = await buildHidden(ctx as never);
    return { game, ctx, root };
  }
  it('ext.hidden · 청크 레이어 · 땅 공급자를 단다', async () => {
    const { game, root } = await boot();
    expect(root).toBeTruthy();
    expect(game.chunks.keys()).toEqual(expect.arrayContaining(['hidden-spots', 'hidden-sandbar']));
    expect(game.ext.hidden.ids).toHaveLength(8);
    expect(game.ext.hidden.spots()).toHaveLength(8);
    expect(game.groundProviders.some((g) => g.id === 'hidden:sandbar')).toBe(true);
  });
  it('모래톱 땅 공급자는 썰물 때만 길 위를 맡는다', async () => {
    const { game } = await boot(12);
    const f = worldFeatures().find((q) => q.kind === 'sandbar')!;
    const [a, b] = f.pts!;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    expect(game.groundProviderAt(mid.x, mid.z)).toBeNull();
    game.env!.setHour(6.5);
    expect(game.groundProviderAt(mid.x, mid.z)).toBeCloseTo(TIDE.top, 1);
    expect(game.groundProviderAt(mid.x + 40, mid.z)).toBeNull();
    expect(game.ext.hidden.tide().walkable).toBe(true);
    game.env!.setHour(9.2);
    expect(game.groundProviderAt(mid.x, mid.z)).toBeNull();
  });
  it('모래톱 조각: 썰물 때 충돌체를 깔고, 물이 차면 걷는다 · 길 위에 서면 coral-sandbar 를 한 번 알린다', async () => {
    const { game } = await boot(12);
    const ev = recordEvents(game);
    const f = worldFeatures().find((q) => q.kind === 'sandbar')!;
    const [a, b] = f.pts!;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const piece = game.chunks.buildAtWorld('hidden-sandbar', mid.x, mid.z);
    expect(piece).toBeTruthy();
    const before = game.physics.statics.length;
    game.tick(1 / 60, 2);
    expect(game.physics.statics.length).toBe(before);
    game.env!.setHour(6.5);
    game.player.teleport(mid.x, mid.z);
    game.player.mode = 'ground';
    game.tick(1 / 60, 2);
    expect(game.physics.statics.length).toBe(before + 1);
    game.tick(1 / 60, 3);
    expect(ev.of('secret-found').map((e) => e.id)).toEqual(['coral-sandbar']);
    game.env!.setHour(12);
    game.tick(1 / 60, 1);
    expect(game.physics.statics.filter((s) => !s.removed).length).toBe(before);
  });
  it('신전: 모래폭풍에서만 보이고, 다가가면 desert-temple 을 한 번 알린다', async () => {
    const { game } = await boot(12);
    const ev = recordEvents(game);
    const t = game.ext.hidden.spots().find((s: { id: string }) => s.id === 'desert-temple');
    game.chunks.buildAtWorld('hidden-spots', t.x, t.z);
    game.player.teleport(t.x + 6, t.z + 6);
    game.tick(1 / 60, 3);
    expect(game.ext.hidden.templeVisible()).toBe(false);
    expect(ev.of('secret-found')).toHaveLength(0);
    game.env!.forceWeather('desert', 'sandstorm', 6);
    (game.env as unknown as { regionAtPlayer: () => string }).regionAtPlayer = () => 'desert';
    game.tick(0.5, 6);
    expect(game.ext.hidden.templeVisible()).toBe(true);
    game.tick(0.5, 3);
    expect(ev.of('secret-found').map((e) => e.id)).toEqual(['desert-temple']);
    game.env!.forceWeather('desert', null);
    game.tick(0.5, 6);
    expect(game.ext.hidden.templeVisible()).toBe(false);
  });
  it('티라노 화석: 도감 기록(가방엔 안 넣음) + desert-trex 를 딱 한 번', async () => {
    const { game } = await boot(12);
    const ev = recordEvents(game);
    game.state.register([{ id: 'fos_tino', name: '대장렉스 티노 골격', category: 'fossil', rarity: 5, price: 0 } as never]);
    const t = game.ext.hidden.spots().find((s: { id: string }) => s.id === 'desert-trex');
    game.chunks.buildAtWorld('hidden-spots', t.x, t.z);
    expect(game.interact('hidden:trex', { force: true })).toBe(true);
    expect(game.interact('hidden:trex', { force: true })).toBe(true);
    expect(ev.of('secret-found').map((e) => e.id)).toEqual(['desert-trex']);
    expect(game.state.dex['fos_tino']).toBeTruthy();
    expect(game.state.bag['fos_tino'] ?? 0).toBe(0);
    expect(game.ext.hidden.found('desert-trex')).toBe(true);
    expect((game.state.flags.hidden as { found: string[] }).found).toEqual(['desert-trex']);
  });
});

describe('hidden 모델 정리(청크가 버릴 때)', () => {
  it('Bake 는 기본이 개체 전용 · 공유 캐시(조개·구슬)만 shared', () => {
    expect(new Bake().add(sph(1), '#fff').build().userData.shared).toBe(false);
    expect(pickupShellGeos().every((q) => q.userData.shared === true)).toBe(true);
    expect(stardustOrbGeo().userData.shared).toBe(true);
  });
  it('disposeTree: 개체 전용 지오·재질은 버리고 공유 재질·캐시 지오는 남긴다', () => {
    const root = new THREE.Group();
    const t = buildTemple(), pm = buildPirateMouth(rngFor('t:pm'));
    root.add(t.root, pm.root, new THREE.Mesh(pickupShellGeos()[0], matBase()));
    const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) geos.add(m.geometry); if (m.material) mats.add(m.material as THREE.Material); });
    const gone = new Set<unknown>();
    for (const x of [...geos, ...mats]) x.addEventListener('dispose', () => gone.add(x));
    disposeTree(root);
    for (const q of geos) expect(gone.has(q)).toBe(!q.userData.shared);
    for (const m of mats) expect(gone.has(m)).toBe(!m.userData.shared);
    expect(gone.has(t.fade)).toBe(true);
    expect(gone.has(matBase())).toBe(false);
    expect(gone.has(pickupShellGeos()[0])).toBe(false);
  });
});
