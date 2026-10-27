// interiors: 0.5 m 격자(스냅·돌림·겹침·막힌 칸·러그 층) · 배치 저장/되살리기 · 집 점수 · 박물관 동별 전시 목록 ·
// 실내 들어가기/나오기(focusOverride·땅 공급자·충돌체·카메라 되돌리기) · 집 꾸미기(가방 ↔ 배치 · flags 저장) · 느릿 관장 해설 5초.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { makeFakeGame, makeCtx, recordEvents } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import {
  GRID, snap, normRot, nextRot, rotFoot, cellsOf, inBounds, overlaps, canPlace, placeItem, removeItem, pickAt, anchorAt, clampAnchor,
  localToCell, placedCenter, serializeLayout, restoreLayout, newUid, type Placed, type FootOf,
} from '../src/modules/interiors/placement';
import {
  FURNITURE, footOf, furnitureDef, isFurniture, houseScore, starsOf, themeBonus, roomForStage, blockedCells, museumExhibits, curatorLine, josa,
  holderCandidates, cycleHolder, fillSlots, interiorOrigin, WALLPAPERS, FLOORS, CURATOR_DELAY, type ExhibitSpecies,
} from '../src/modules/interiors/logic';
import { InteriorHub } from '../src/modules/interiors/infra';
import { HouseInterior, readFlags } from '../src/modules/interiors/house';
import { buildFurniture, FURNITURE_IDS } from '../src/modules/interiors/furniture';
import { skeletonBones, MuseumInterior } from '../src/modules/interiors/museum';
import { CritterSet, critterColors, critterColor, shapeOfSpecies } from '../src/modules/interiors/critters';
import buildInteriors from '../src/modules/interiors';
import type { Game } from '../src/core/game';
import type { Species } from '../src/core/state';

const F: FootOf = (id) => ({ chair: { w: 2, d: 2 }, bed: { w: 4, d: 2 }, rug: { w: 4, d: 3, layer: 'floor' as const }, lamp: { w: 1, d: 1 } }[id] ?? { w: 1, d: 1 });
const P = (item: string, gx: number, gz: number, rot = 0, uid = `${item}@${gx},${gz}`): Placed => ({ uid, item, gx, gz, rot: normRot(rot) });
const ROOM = { w: 12, d: 10 };

beforeEach(() => { stubLocalStorage(); });

describe('격자(placement.ts)', () => {
  it('0.5 m 스냅·돌림 정리', () => {
    expect(GRID).toBe(0.5);
    expect(snap(0.74)).toBe(0.5);
    expect(snap(0.76)).toBe(1);
    expect(snap(-0.26)).toBe(-0.5);
    expect(snap(1.3, 1)).toBe(1);
    expect(normRot(5)).toBe(1);
    expect(normRot(-1)).toBe(3);
    expect(normRot('x')).toBe(0);
    expect(nextRot(3)).toBe(0);
  });
  it('돌리면 발자국 가로세로가 바뀐다', () => {
    expect(rotFoot({ w: 4, d: 2 }, 0)).toMatchObject({ w: 4, d: 2 });
    expect(rotFoot({ w: 4, d: 2 }, 1)).toMatchObject({ w: 2, d: 4 });
    expect(rotFoot({ w: 4, d: 2 }, 2)).toMatchObject({ w: 4, d: 2 });
    expect(cellsOf(P('bed', 1, 1, 1), F)).toHaveLength(8);
    expect(cellsOf(P('bed', 1, 1, 1), F)).toContainEqual([2, 4]);
  });
  it('방 밖·겹침·막힌 칸은 못 놓는다', () => {
    expect(inBounds(P('bed', 8, 0), ROOM, F)).toBe(true);
    expect(inBounds(P('bed', 9, 0), ROOM, F)).toBe(false);
    expect(inBounds(P('bed', 9, 0, 1), ROOM, F)).toBe(true);
    expect(inBounds(P('lamp', -1, 0), ROOM, F)).toBe(false);
    let L: Placed[] = [];
    const a = P('chair', 2, 2);
    expect(canPlace(L, a, ROOM, F).ok).toBe(true);
    L = placeItem(L, a);
    const b = P('chair', 3, 3);
    const r = canPlace(L, b, ROOM, F);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.why).toBe('overlap');
    expect(r.ok === false && r.with?.uid).toBe(a.uid);
    expect(canPlace(L, P('chair', 4, 2), ROOM, F).ok).toBe(true);
    // 자기 자신은 무시(옮기기·돌리기 검사)
    expect(canPlace(L, { ...a, gx: 3 }, ROOM, F).ok).toBe(true);
    expect(canPlace(L, P('bed', 10, 0), ROOM, F)).toMatchObject({ ok: false, why: 'bounds' });
    const blocked = new Set(['6,6']);
    expect(canPlace(L, P('chair', 5, 5), ROOM, F, blocked)).toMatchObject({ ok: false, why: 'blocked' });
    // 러그(바닥층)는 막힌 칸·의자 아래에도 깔린다
    expect(canPlace(L, P('rug', 1, 1), ROOM, F, blocked).ok).toBe(true);
    expect(overlaps(P('rug', 1, 1), a, F)).toBe(false);
    L = placeItem(L, P('rug', 1, 1));
    expect(canPlace(L, P('rug', 3, 2), ROOM, F)).toMatchObject({ ok: false, why: 'overlap' });
    // 집으면 서는 가구가 먼저, 없으면 러그
    expect(pickAt(L, 2, 2, F)?.item).toBe('chair');
    expect(pickAt(L, 1, 1, F)?.item).toBe('rug');
    expect(pickAt(L, 11, 9, F)).toBeNull();
    L = removeItem(L, a.uid);
    expect(pickAt(L, 2, 2, F)?.item).toBe('rug');
  });
  it('커서 가운데 맞추기·방 안으로 밀기·좌표 변환', () => {
    expect(anchorAt(5, 5, { w: 4, d: 2 }, 0)).toEqual({ gx: 4, gz: 5 });
    expect(anchorAt(5, 5, { w: 4, d: 2 }, 1)).toEqual({ gx: 5, gz: 4 });
    expect(clampAnchor({ gx: 11, gz: -2 }, { w: 4, d: 2 }, 0, ROOM)).toEqual({ gx: 8, gz: 0 });
    // 방 가운데 원점: 가로 6 m(12칸) → 왼쪽 끝 -3 m 가 0 칸
    expect(localToCell(-3, -2.5, ROOM)).toEqual({ gx: 0, gz: 0 });
    expect(localToCell(0.01, 0.01, ROOM)).toEqual({ gx: 6, gz: 5 });
    const c = placedCenter(P('chair', 0, 0), ROOM, F);
    expect(c.x).toBeCloseTo(-2.5);
    expect(c.z).toBeCloseTo(-2.0);
    expect(newUid([P('lamp', 0, 0, 0, 'lamp#1')], 'lamp')).toBe('lamp#2');
  });
});

describe('배치 저장·되살리기', () => {
  it('JSON 왕복 그대로', () => {
    const L = [P('chair', 1, 1), { ...P('bed', 5, 2, 1), arg: 'fish-koi' }, P('rug', 0, 6)];
    const saved = JSON.parse(JSON.stringify(serializeLayout(L)));
    const r = restoreLayout(saved, ROOM, F);
    expect(r.dropped).toEqual([]);
    expect(r.layout).toEqual(serializeLayout(L));
    expect(r.layout[1].arg).toBe('fish-koi');
  });
  it('방이 작아지면 밖으로 나간 것·겹치는 것·모르는 것·이상한 줄은 버린다', () => {
    const raw = [
      P('chair', 1, 1), P('bed', 8, 6), P('chair', 2, 2, 0, 'dup'), { uid: 'x', item: 'mystery', gx: 0, gz: 5, rot: 0 },
      null, 7, { item: 'lamp' }, { item: 'lamp', gx: 'a', gz: 1 }, P('lamp', 0, 4, 0, 'same'), P('lamp', 1, 4, 0, 'same'),
    ];
    const r = restoreLayout(raw, { w: 10, d: 8 }, F, { known: (i) => i !== 'mystery' });
    expect(r.layout.map((p) => p.uid)).toEqual([P('chair', 1, 1).uid, 'same']);
    expect(r.dropped.map((p) => p.item).sort()).toEqual(['bed', 'chair', 'lamp', 'mystery']);
    expect(restoreLayout('nope', ROOM, F).layout).toEqual([]);
  });
  it('집: 가방에서 놓으면 flags.interiors 에 남고, 새로 만들어도 되살아난다 · 집으면 가방으로', () => {
    const game = makeFakeGame();
    const g = game.asGame();
    game.state.addItem('f_tank', 1);
    game.state.addItem('f_cloudrug', 1);
    const fish: Species = { id: 'fish-koi', name: '비단잉어', category: 'fish', rarity: 3 };
    game.state.register([fish]);
    game.state.collect({ species: fish, keep: false });
    const ev = recordEvents(game);
    const h = new HouseInterior(g, new THREE.Vector3(-20000, 600, 0));
    h.syncStage(true);
    expect(h.room).toEqual(roomForStage(0));
    const r1 = h.place('f_tank', 0, 3);
    expect(r1.ok).toBe(true);
    expect(game.state.bag.f_tank ?? 0).toBe(0);
    expect(h.layout[0].arg).toBe('fish-koi');
    expect(h.place('f_tank', 1, 3).why).toBe('no-item');
    expect(h.place('f_cloudrug', 0, 3).ok).toBe(true);
    expect(ev.types()).toContain('place');
    const f = readFlags(g);
    expect(f.layout.map((p) => p.item)).toEqual(['f_tank', 'f_cloudrug']);
    expect(f.score).toBeGreaterThan(0);
    // 새 집(다시 불러오기)
    const h2 = new HouseInterior(g, new THREE.Vector3(-20000, 600, 0));
    h2.syncStage(true);
    expect(h2.layout.map((p) => p.item)).toEqual(['f_tank', 'f_cloudrug']);
    expect(h2.pickUp(h2.layout[0].uid)).toBe(true);
    expect(game.state.bag.f_tank).toBe(1);
    expect(readFlags(g).layout.map((p) => p.item)).toEqual(['f_cloudrug']);
    // 붙박이 칸(문 앞)에는 못 놓는다
    const door = [...blockedCells(h2.room)][0].split(',').map(Number);
    expect(h2.place('f_tank', door[0], door[1]).why).toBe('blocked');
  });
  it('불러온 직후(방 맞추기 전) 벽지를 바꿔도 저장된 배치가 지워지지 않는다', () => {
    const game = makeFakeGame();
    const g = game.asGame();
    readFlags(g).layout = [{ uid: 'f_tank#1', item: 'f_tank', gx: 0, gz: 3, rot: 0 }];
    const h = new HouseInterior(g, new THREE.Vector3(-20000, 600, 0));
    h.setWall('w_cream');
    expect(readFlags(g).layout.map((p) => p.item)).toEqual(['f_tank']);
    expect(readFlags(g).wall).toBe('w_cream');
    const h2 = new HouseInterior(g, new THREE.Vector3(-20000, 600, 0));
    h2.setFloor('fl_wood');
    h2.setDisplay('nope', false);
    expect(h2.layout.map((p) => p.item)).toEqual(['f_tank']);
    expect(readFlags(g).layout).toHaveLength(1);
  });
  it('방이 줄어 못 놓는 가구는 가방이 꽉 차면 보관함으로(사라지지 않는다)', () => {
    const game = makeFakeGame();
    const g = game.asGame();
    // 1단계 방 밖 칸에 놓인 가구
    readFlags(g).layout = [{ uid: 'f_tank#1', item: 'f_tank', gx: 60, gz: 60, rot: 0 }];
    game.econ = { give: () => 0 } as never;
    const h = new HouseInterior(g, new THREE.Vector3(-20000, 600, 0));
    h.syncStage(true);
    expect(h.layout).toHaveLength(0);
    expect(readFlags(g).chest.f_tank).toBe(1);
  });
  it('진열장: econ.display 가 있으면 econ 이 정한다(가방·보관함에 없는 친구는 못 올린다)', () => {
    const game = makeFakeGame();
    const g = game.asGame();
    const fish: Species = { id: 'fish-songsari', name: '송사리', category: 'fish', rarity: 1 };
    const koi: Species = { id: 'fish-koi', name: '비단잉어', category: 'fish', rarity: 3 };
    game.state.register([fish, koi]);
    game.state.collect({ species: fish, keep: false });
    game.state.addItem('fish-koi', 1);
    const shown: Record<string, number> = {};
    let max = 1;
    game.econ = {
      give: (id: string, n: number) => { game.state.addItem(id, n); return n; },
      display: (id: string, on: boolean) => {
        if (on) {
          if (!game.state.has(id) || Object.values(shown).reduce((a, n) => a + n, 0) >= max) return false;
          game.state.addItem(id, -1); shown[id] = (shown[id] ?? 0) + 1; return true;
        }
        if (!shown[id]) return false;
        shown[id]--; if (!shown[id]) delete shown[id]; game.state.addItem(id, 1); return true;
      },
      displayed: () => Object.entries(shown).map(([id, n]) => ({ id, n })),
      displayMax: () => max,
      storage: { size: 200, list: () => [], put: () => false, take: () => false },
    } as never;
    // 예전 목록(가방에 없는 송사리)은 옮기지 않고 내린다
    readFlags(g).display = ['fish-songsari'];
    const h = new HouseInterior(g, new THREE.Vector3(-20000, 600, 0));
    expect(h.setDisplay('fish-songsari', true)).toBe(false);
    expect(readFlags(g).display).toEqual([]);
    expect(shown).toEqual({});
    const before = h.score.score;
    expect(h.setDisplay('fish-koi', true)).toBe(true);
    expect(shown).toEqual({ 'fish-koi': 1 });
    expect(game.state.bag['fish-koi'] ?? 0).toBe(0);
    expect(h.score.score).toBe(before + 6);
    expect(h.snapshot().display).toEqual(['fish-koi']);
    // 칸 수도 econ 이 센다
    game.state.addItem('fish-koi', 1);
    expect(h.setDisplay('fish-koi', true)).toBe(false);
    max = 2;
    expect(h.setDisplay('fish-koi', true)).toBe(true);
    expect(h.setDisplay('fish-koi', false)).toBe(true);
    expect(game.state.bag['fish-koi']).toBe(1);
  });
  it('진열장(econ.display 이전): 가방에 없는 친구는 못 세운다', () => {
    const game = makeFakeGame();
    const g = game.asGame();
    const fish: Species = { id: 'fish-songsari', name: '송사리', category: 'fish', rarity: 1 };
    game.state.register([fish]);
    game.state.collect({ species: fish, keep: false });
    const h = new HouseInterior(g, new THREE.Vector3(-20000, 600, 0));
    expect(h.setDisplay('fish-songsari', true)).toBe(false);
    game.state.addItem('fish-songsari', 1);
    expect(h.setDisplay('fish-songsari', true)).toBe(true);
    expect(readFlags(g).display).toEqual(['fish-songsari']);
  });
});

describe('집 점수', () => {
  it('가구 수 ×3 + 서로 다른 가구 ×10 + 테마 묶음 + 벽지·바닥 맞춤 + 전시 친구', () => {
    expect(houseScore([], undefined, undefined).score).toBe(0);
    expect(houseScore([], undefined, undefined).stars).toBe(1);
    const sea = ['f_sea_starrug', 'f_sea_shellchair', 'f_sea_jellylamp'];
    const L = sea.map((id, i) => P(id, i * 4, 0));
    const s = houseScore(L, 'w_cream', 'fl_wood');
    // 3×3 + 3×10 + 바다 테마 3개 20 (+ 반짝 불빛 1개는 보너스 없음)
    expect(s.score).toBe(9 + 30 + 20);
    expect(s.top).toBe('sea');
    const s2 = houseScore(L, 'w_sea', 'fl_sand');
    expect(s2.score).toBe(s.score + 50);
    // 같은 가구 둘은 서로 다른 가구로 치지 않는다
    const dup = houseScore([P('f_pot', 0, 0), P('f_pot', 2, 0, 0, 'b')], undefined, undefined);
    expect(dup.variety).toBe(1);
    expect(dup.score).toBe(6 + 10);
    // 전시한 친구(수조 arg + 진열장) — 같은 종은 한 번
    const sh = houseScore([{ ...P('f_aq_grandtank', 0, 0), arg: 'a|b|a' }], undefined, undefined, ['b', 'c']);
    expect(sh.creatures).toBe(3);
    expect(themeBonus(2)).toBe(0); expect(themeBonus(3)).toBe(20); expect(themeBonus(5)).toBe(50); expect(themeBonus(8)).toBe(100);
    expect(starsOf(59)).toBe(1); expect(starsOf(60)).toBe(2); expect(starsOf(150)).toBe(3); expect(starsOf(300)).toBe(4); expect(starsOf(9999)).toBe(5);
  });
  it('집 단계가 오르면 방이 넓어진다', () => {
    let prev = 0;
    for (let s = 0; s <= 4; s++) { const r = roomForStage(s); expect(r.w * r.d).toBeGreaterThan(prev); prev = r.w * r.d; }
    expect(roomForStage(9)).toEqual(roomForStage(4));
  });
  it('안에 넣을 친구 고르기(희귀한 것부터 · F 로 돌기 · 대왕 수조 3칸)', () => {
    const caught = [
      { id: 'b1', category: 'bug', rarity: 1 }, { id: 'f1', category: 'fish', rarity: 1 }, { id: 'f3', category: 'fish', rarity: 3 },
      { id: 'f2', category: 'fish', rarity: 2 }, { id: 'v', category: 'fish', rarity: 5, tags: ['vehicle'] },
    ];
    const list = holderCandidates('fish', caught);
    expect(list.map((s) => s.id)).toEqual(['f3', 'f2', 'f1']);
    expect(cycleHolder(list, undefined)).toBe('f3');
    expect(cycleHolder(list, 'f1')).toBe('f3');
    expect(cycleHolder(list, 'f3', -1)).toBe('f1');
    expect(cycleHolder([], 'x')).toBeNull();
    expect(fillSlots(list, 'f2', 3)).toBe('f2|f1|f3');
    expect(holderCandidates('creature', caught).length).toBe(4);
  });
});

describe('박물관 전시 목록', () => {
  const sp: ExhibitSpecies[] = [
    { id: 'fa', category: 'fish', rarity: 1 }, { id: 'fb', category: 'fish', rarity: 4, name: '용왕붕어' },
    { id: 'sa', category: 'sea', rarity: 2 }, { id: 'ba', category: 'insect', rarity: 1 }, { id: 'bb', category: 'bug', rarity: 2 },
    { id: 'fos_rex_skull', category: 'fossil', rarity: 3, tags: ['fos:rex:skull'] }, { id: 'fos_rex', category: 'fossil', rarity: 3 },
    { id: 'fos_old', category: 'fossil', rarity: 2 }, { id: 'xa', category: 'space', rarity: 2 }, { id: 'v_ufo', category: 'space', rarity: 3, tags: ['vehicle'] },
    { id: 'm_wood', category: 'item', rarity: 1 },
  ];
  const donated = new Set(['fb', 'sa', 'ba', 'bb', 'fos_rex_skull', 'fos_old', 'xa', 'v_ufo', 'm_wood']);
  const isD = (id: string) => donated.has(id);
  it('동마다 기증한 것만, 등록 순서대로', () => {
    expect(museumExhibits('aquarium', sp, isD)).toEqual(['fb']);
    expect(museumExhibits('sea', sp, isD)).toEqual(['sa']);
    expect(museumExhibits('bug', sp, isD)).toEqual(['ba', 'bb']);
    expect(museumExhibits('astro', sp, isD)).toEqual(['xa']);
  });
  it('화석관은 골격만(조각은 안 세운다)', () => {
    expect(museumExhibits('fossil', sp, isD)).toEqual(['fos_old']);
    expect(museumExhibits('fossil', sp, isD, ['fos_rex'])).toEqual(['fos_rex', 'fos_old']);
  });
  it('골격 모양은 종마다 늘 같고 받침 위에 선다', () => {
    const a = skeletonBones('fos_rex'), b = skeletonBones('fos_rex');
    expect(a.bones.length).toBeGreaterThan(10);
    expect(a.bones.map((x) => x.a.toArray())).toEqual(b.bones.map((x) => x.a.toArray()));
    for (const bn of a.bones) { expect(bn.a.y).toBeGreaterThanOrEqual(0); expect(bn.b.y).toBeGreaterThanOrEqual(0); }
  });
  it('느릿 관장 해설(느린 말투 · 동마다 · 귀한 친구 꼬리 · 받침)', () => {
    const l = curatorLine({ id: 'fb', name: '용왕붕어', category: 'fish', rarity: 4 }, 0.1, 0.2);
    expect(l).toContain('용왕붕어');
    expect(l).toContain('……');
    expect(l).toMatch(/귀한|처음/);
    expect(curatorLine({ id: 'q', name: '나비', category: 'bug', rarity: 1 }, 0.99)).toContain('나비는');
    expect(curatorLine({ id: 'q', name: '사슴벌레', category: 'bug', rarity: 1 }, 0.99)).toContain('사슴벌레는');
    expect(josa('잉어', '은', '는')).toBe('는');
    expect(josa('붕어빵', '은', '는')).toBe('은');
  });
});

describe('실내 들어가기·나오기(infra)', () => {
  const setup = () => {
    const game = makeFakeGame({ pos: [10, -4] });
    const g = game.asGame();
    const hub = new InteriorHub(g);
    const origin = new THREE.Vector3(-20000, 600, 0);
    const door = new THREE.Vector3(12, 0, -6);
    hub.register({
      id: 'room', name: '방', origin, build: () => new THREE.Group(),
      floorAt: (x, z) => (Math.abs(x - origin.x) < 3 && Math.abs(z - origin.z) < 3 ? origin.y : null),
      spawn: () => origin.clone().add(new THREE.Vector3(0, 0, 2)),
      exitTo: () => door.clone().add(new THREE.Vector3(0, 0, 1.5)),
      door: () => door,
      colliders: () => [{ hx: 3, hy: 0.5, hz: 3, x: origin.x, y: origin.y - 0.5, z: origin.z }, { hx: 3, hy: 1, hz: 0.2, x: origin.x, y: origin.y + 1, z: origin.z - 3 }],
      cam: { dist: 11, pitch: 0.9 },
    });
    return { game, g, hub, origin, door };
  };
  it('들어가면 focusOverride = 문 · 땅 공급자 · 충돌체 · 아늑 카메라 · 들어선 자리', () => {
    const { game, hub, origin, door } = setup();
    const ev = recordEvents(game);
    game.cam.yaw = 1.3;
    expect(hub.enter('nope')).toBe(false);
    expect(hub.enter('room')).toBe(true);
    expect(hub.current()).toBe('room');
    expect(game.focusOverride).not.toBeNull();
    expect(game.focusOverride!.distanceTo(door)).toBeLessThan(1e-6);
    expect(game.groundProviderAt(origin.x + 1, origin.z)).toBe(600);
    expect(game.groundProviderAt(0, 0)).toBeNull();
    expect(game.player.pos.y).toBeCloseTo(600);
    expect(game.player.pos.z).toBeCloseTo(2);
    expect(game.physics.live).toBe(2);
    expect(game.cam.style).toBe('cozy');
    expect(game.cam.dist).toBe(11);
    // 청크는 문 자리 기준으로 갱신된다
    expect(game.chunks.focus.distanceTo(door)).toBeLessThan(1e-6);
    expect(ev.types()).toContain('interior');
    expect(hub.enter('room')).toBe(true);
    expect(game.physics.live).toBe(2);
  });
  it('나오면 모두 되돌린다(이전 focusOverride 포함)', () => {
    const { game, hub, door } = setup();
    const before = new THREE.Vector3(5, 0, 5);
    game.focusOverride = before.clone();
    game.cam.yaw = 1.3; game.cam.pitch = 0.3; game.cam.dist = 7.5;
    hub.enter('room');
    expect(hub.exit()).toBe(true);
    expect(hub.current()).toBeNull();
    expect(game.focusOverride!.distanceTo(before)).toBeLessThan(1e-6);
    expect(game.groundProviders.length).toBe(0);
    expect(game.physics.live).toBe(0);
    expect(game.player.pos.x).toBeCloseTo(door.x);
    expect(game.player.pos.z).toBeCloseTo(door.z + 1.5);
    expect(game.cam.style).toBe('adventure');
    expect(game.cam.yaw).toBeCloseTo(1.3);
    expect(game.cam.dist).toBeCloseTo(7.5);
    expect(hub.exit()).toBe(false);
    // 아무것도 없을 때 들어갔다 나오면 null 로
    game.focusOverride = null;
    hub.enter('room'); hub.exit();
    expect(game.focusOverride).toBeNull();
  });
  it('방 밖으로 새면 1초 뒤 들어온 자리로', () => {
    const { game, hub, origin } = setup();
    hub.enter('room');
    game.player.pos.set(origin.x + 50, 600, 0);
    for (let i = 0; i < 70; i++) hub.update(i / 60, 1 / 60);
    expect(game.player.pos.x).toBeCloseTo(origin.x);
  });
});

describe('모듈(interiors.ts)', () => {
  it('ext.interiors · 집·박물관 등록 · 문 상호작용 · storage 창 · H 단축키 · 해설 5초', () => {
    const game = makeFakeGame();
    const g = game.asGame();
    game.ext.village = { houseStage: () => 2, positions: { house: { x: 30, z: 40, rotY: 0 } } };
    const fish: Species = { id: 'fish-koi', name: '비단잉어', category: 'fish', rarity: 3 };
    game.state.register([fish]);
    const ctx = makeCtx(game);
    buildInteriors(ctx as never);
    const ext = game.ext.interiors;
    expect(typeof ext.enter).toBe('function');
    expect(ext.origin(0)).toEqual(interiorOrigin(0));
    expect(ext.origin(2).x).toBe(-19400);
    expect(game.hud.panel('storage')).not.toBeNull();
    expect(game.hud.hotkeys().some((h) => h.code === 'KeyH')).toBe(true);
    expect(game.points.some((p) => p.id === 'interiors:house-door')).toBe(true);
    expect(game.points.some((p) => p.id === 'interiors:museum-door')).toBe(true);
    // 집 문으로 들어가기
    expect(game.interact('interiors:house-door', { force: true })).toBe(true);
    expect(ext.current()).toBe('house');
    expect(ext.house.room()).toMatchObject({ stage: 2, ...roomForStage(2) });
    game.state.addItem('f_pot', 1);
    expect(ext.house.place('f_pot', 3, 3).ok).toBe(true);
    expect(readFlags(g).layout).toHaveLength(1);
    ext.exit();
    expect(game.focusOverride).toBeNull();
    // 박물관: 기증 5초 뒤 관장 해설(밖이면 HUD 카드)
    const ev = recordEvents(game);
    game.state.emit({ type: 'donate', id: 'fish-koi', n: 1, coins: 0 });
    game.tick(1, CURATOR_DELAY - 1);
    expect(ev.types()).not.toContain('curator');
    game.tick(1, 2);
    expect(ev.types()).toContain('curator');
    const c = ev.events.find((e) => e.type === 'curator')!;
    expect(String(c.line)).toContain('비단잉어');
    expect(ext.enter('museum')).toBe(true);
    expect(ext.current()).toBe('museum');
    ext.exit();
  });
});

describe('가구 모델', () => {
  it('표의 가구 전부(+ 모르는 f_*) 모델이 나온다 · 수조·케이지·피규어엔 생물 칸', () => {
    expect(FURNITURE_IDS.length).toBeGreaterThanOrEqual(50);
    for (const id of [...FURNITURE_IDS, 'f_mystery']) {
      const m = buildFurniture(id);
      expect(m.b.pieces.length, id).toBeGreaterThan(0);
      const d = furnitureDef(id);
      if (d.holds) expect(m.slots.length, id).toBe(d.slots ?? 1);
      expect(isFurniture(id)).toBe(true);
    }
    expect(footOf('f_cloudrug').layer).toBe('floor');
    expect(Object.keys(FURNITURE)).toContain('f_incubator');
    expect(WALLPAPERS.length).toBeGreaterThanOrEqual(6);
    expect(FLOORS.length).toBeGreaterThanOrEqual(6);
    const baked = buildFurniture('f_tank').b.bake('t');
    expect(baked.children.length).toBeGreaterThan(0);
    expect(baked.children.length).toBeLessThanOrEqual(6);
  });
  it('생물 무리: 모양별 인스턴스 · 용량 넘치면 안 그린다', () => {
    const cs = new CritterSet({ fish: 2, blob: 1 });
    const sp = { id: 'f', category: 'fish', rarity: 4 };
    expect(shapeOfSpecies(sp)).toBe('fish');
    const [a, b] = critterColors(sp);
    cs.begin();
    const m = new THREE.Matrix4();
    expect(cs.push('fish', m, critterColor(a), critterColor(b))).toBe(true);
    expect(cs.push('fish', m, critterColor(a), critterColor(b))).toBe(true);
    expect(cs.push('fish', m, critterColor(a), critterColor(b))).toBe(false);
    expect(cs.push('bug', m, critterColor(a), critterColor(b))).toBe(true);
    cs.end();
    expect(cs.total()).toBe(3);
    cs.dispose();
  });
});

describe('삼각형 예산(계약: 모듈당 15만)', () => {
  const tris = (root: THREE.Object3D) => {
    let n = 0;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible || !m.geometry) return;
      const g = m.geometry, per = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const im = o as THREE.InstancedMesh;
      n += per * (im.isInstancedMesh ? im.count : 1);
    });
    return n;
  };
  it('박물관(관장 3.5만 포함)이 15만 아래', () => {
    const game = makeFakeGame();
    const m = new MuseumInterior(game.asGame(), new THREE.Vector3(-19700, 600, 0));
    const t = tris(m.root);
    expect(t + 35000).toBeLessThan(150000);
  });
});
