// 사진 모드 — 카메라 가두기 수학 · 앨범 줄이기(IndexedDB 라이트) · 시야 안 목격 고르기 · 명소 판정 · flags 정리 · 필터 행렬.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  ALBUM_KEEP, CAM_CLEAR, adoptOrphans, anglesOf, clampCamera, cssToMatrix, ensurePhotoFlags, faceYaw, freeStep, frustumOf, lookDir, orbitPos, pushMeta,
  selectWitnesses, spotInShot, stickerAt, trimPlan, zoomDist, zoomFov, FILTERS, applyMatrix, nextTimer, type PhotoMeta, type PhotoSpot,
} from '../src/modules/photo/logic';
import { DB_NAME, STORE, openAlbum, memoryAlbum } from '../src/modules/photo/album';
import { stubIndexedDB, type StubIDB } from './kit/storage';

const flat = (h: number) => () => h;

describe('카메라 가두기', () => {
  const anchor = { x: 0, y: 2, z: 0 };
  it('땅 아래로 못 들어간다(땅 + 여유)', () => {
    const c = clampCamera({ x: 3, y: -5, z: 1 }, anchor, flat(4));
    expect(c.y).toBeCloseTo(4 + CAM_CLEAR);
    expect(c.clamped).toBe(true);
  });
  it('가파른 비탈: 둘레에서 가장 높은 땅을 본다', () => {
    // x 가 커질수록 높아지는 비탈 — 가운데(0)보다 +probe 쪽이 높다
    const slope = (x: number) => x * 10;
    const c = clampCamera({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: 0 }, slope, { probe: 0.5, clear: 0.2 });
    expect(c.y).toBeCloseTo(5.2);
  });
  it('땅 공급자(실내·행성) 높이도 그대로 따른다', () => {
    const provider = (x: number, z: number) => (Math.hypot(x, z) < 10 ? 30000 : 0);
    const c = clampCamera({ x: 1, y: 10, z: 1 }, { x: 0, y: 30000, z: 0 }, provider);
    expect(c.y).toBeGreaterThanOrEqual(30000 + CAM_CLEAR);
  });
  it('플레이어에게서 수평 40 m 밖으로 못 나간다', () => {
    const c = clampCamera({ x: 300, y: 5, z: 400 }, anchor, flat(0), { maxDist: 40 });
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(40);
    expect(c.x / c.z).toBeCloseTo(300 / 400); // 방향은 그대로
  });
  it('너무 높이 못 올라가지만 땅 조건이 이긴다', () => {
    expect(clampCamera({ x: 0, y: 500, z: 0 }, anchor, flat(0), { maxAbove: 30 }).y).toBeCloseTo(32);
    // 땅이 한도보다 높으면 땅 위
    expect(clampCamera({ x: 0, y: 500, z: 0 }, anchor, flat(100), { maxAbove: 30 }).y).toBeCloseTo(100 + CAM_CLEAR);
  });
  it('괜찮은 자리는 그대로, NaN 은 플레이어 곁으로', () => {
    const ok = clampCamera({ x: 2, y: 3, z: 2 }, anchor, flat(0));
    expect(ok).toMatchObject({ x: 2, y: 3, z: 2, clamped: false });
    const bad = clampCamera({ x: NaN, y: NaN, z: 1 }, anchor, flat(0));
    expect(Number.isFinite(bad.x) && Number.isFinite(bad.y) && Number.isFinite(bad.z)).toBe(true);
  });
});

describe('궤도·자유 카메라 수학', () => {
  it('orbitPos 는 코어 CameraRig 와 같은 공식', () => {
    const p = orbitPos({ x: 0, y: 1, z: 0 }, 0, 0, 5);
    expect(p).toMatchObject({ x: 0, y: 1 });
    expect(p.z).toBeCloseTo(5);
    const q = orbitPos({ x: 0, y: 0, z: 0 }, Math.PI / 2, Math.PI / 6, 2);
    expect(q.x).toBeCloseTo(Math.sqrt(3));
    expect(q.y).toBeCloseTo(1);
  });
  it('lookDir ↔ anglesOf 는 서로 되돌린다', () => {
    for (const [yaw, pitch] of [[0, 0], [1.2, 0.4], [-2.5, -0.8]]) {
      const a = anglesOf(lookDir(yaw, pitch));
      expect(Math.atan2(Math.sin(a.yaw - yaw), Math.cos(a.yaw - yaw))).toBeCloseTo(0);
      expect(a.pitch).toBeCloseTo(pitch);
    }
  });
  it('궤도 카메라 방향 = lookDir(같은 yaw·pitch)', () => {
    const t = { x: 3, y: 1, z: -2 };
    const p = orbitPos(t, 0.7, 0.3, 6);
    const d = lookDir(0.7, 0.3);
    const v = new THREE.Vector3(t.x - p.x, t.y - p.y, t.z - p.z).normalize();
    expect(v.x).toBeCloseTo(d.x); expect(v.y).toBeCloseTo(d.y); expect(v.z).toBeCloseTo(d.z);
  });
  it('자유 이동: W 는 바라보는 수평 방향, E 는 위로, 대각선도 속도 그대로', () => {
    const p = freeStep({ x: 0, y: 0, z: 0 }, 0, { x: 0, y: 1 }, 0, 5, 1);
    expect(p.z).toBeCloseTo(-5);
    const u = freeStep({ x: 0, y: 0, z: 0 }, 0, { x: 0, y: 0 }, 1, 5, 0.5);
    expect(u.y).toBeCloseTo(2.5);
    const dgl = freeStep({ x: 0, y: 0, z: 0 }, 0.3, { x: 1, y: 1 }, 0, 5, 1);
    expect(Math.hypot(dgl.x, dgl.z)).toBeCloseTo(5);
  });
  it('줌 범위', () => {
    expect(zoomFov(50, 100)).toBe(75);
    expect(zoomFov(50, -100)).toBe(18);
    expect(zoomDist(5, 100)).toBe(25);
    expect(zoomDist(5, -100)).toBe(1.2);
  });
  it('faceYaw: 플레이어가 카메라를 바라본다(facing = (-sin, -cos))', () => {
    const yaw = faceYaw({ x: 0, y: 0, z: 0 }, { x: 4, y: 2, z: 4 });
    expect(-Math.sin(yaw)).toBeCloseTo(Math.SQRT1_2);
    expect(-Math.cos(yaw)).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('시야 안 목격 고르기', () => {
  // 원점에서 -z 를 보는 카메라
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  cam.position.set(0, 1, 0);
  cam.lookAt(0, 1, -10);
  const fr = frustumOf(cam);
  const W = (speciesId: string, x: number, y: number, z: number) => ({ speciesId, pos: new THREE.Vector3(x, y, z) });

  it('앞에 있고 30 m 안이면 찍힌다 · 뒤나 멀면 안 찍힌다', () => {
    const list = [W('a', 0, 1, -10), W('behind', 0, 1, 10), W('far', 0, 1, -45), W('side', 40, 1, -5), W('edge', 0, 1, -29.5)];
    const r = selectWitnesses(list, cam.position, fr, () => false);
    expect(r.inShot).toEqual(['a', 'edge']);
  });
  it('겹치는 종은 한 번, 가까운 순 · 등록된 종은 fresh 에서 빠진다', () => {
    const list = [W('b', 1, 1, -20), W('a', 0, 1, -5), W('b', 0, 1, -8), W('c', -1, 1, -12)];
    const r = selectWitnesses(list, cam.position, fr, (id) => id === 'b');
    expect(r.inShot).toEqual(['a', 'b', 'c']);
    expect(r.fresh).toEqual(['a', 'c']);
  });
  it('화면 가장자리에 몸이 걸치면 찍힌 걸로', () => {
    // 수평 시야 끝 바로 밖(반 시야각 + 조금) — 반경 0.4 m 몸이 걸친다
    const hfov = 2 * Math.atan(Math.tan((50 * Math.PI) / 360) * (16 / 9));
    const ang = hfov / 2 + 0.01, d = 10;
    const p = W('rim', Math.sin(ang) * d, 1, -Math.cos(ang) * d);
    expect(selectWitnesses([p], cam.position, fr, () => false).inShot).toEqual(['rim']);
    expect(selectWitnesses([p], cam.position, fr, () => false, { r: 0.01 }).inShot).toEqual([]);
  });
  it('망가진 항목은 건너뛴다', () => {
    const bad = [{ speciesId: '', pos: new THREE.Vector3(0, 1, -5) }, { speciesId: 'x', pos: new THREE.Vector3(NaN, 0, 0) }, null as never];
    expect(selectWitnesses(bad, cam.position, fr, () => false).inShot).toEqual([]);
  });
});

describe('사진 명소', () => {
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  cam.position.set(0, 2, 0);
  cam.lookAt(0, 2, -10);
  const fr = frustumOf(cam);
  const spot = (o: Partial<PhotoSpot>): PhotoSpot => ({ id: 's', name: 'S', world: 'earth', x: 0, z: -30, r: 60, mustSee: true, stars: 5, y: 4, ...o });
  it('가까이 + 화면 안이면 그 명소', () => {
    expect(spotInShot([spot({})], 'earth', cam.position, fr, () => 0)?.id).toBe('s');
  });
  it('등 뒤의 등대는 안 친다 · 전망 언덕(mustSee 없음)은 거기 서 있기만 하면', () => {
    expect(spotInShot([spot({ z: 30 })], 'earth', cam.position, fr, () => 0)).toBeNull();
    expect(spotInShot([spot({ z: 30, mustSee: false })], 'earth', cam.position, fr, () => 0)?.id).toBe('s');
  });
  it('세계가 다르거나 멀면 없음 · 여럿이면 가까운 것', () => {
    expect(spotInShot([spot({ world: 'space' })], 'earth', cam.position, fr, () => 0)).toBeNull();
    expect(spotInShot([spot({ r: 10 })], 'earth', cam.position, fr, () => 0)).toBeNull();
    const two = [spot({ id: 'far', z: -50 }), spot({ id: 'near', z: -20 })];
    expect(spotInShot(two, 'earth', cam.position, fr, () => 0)?.id).toBe('near');
  });
});

describe('앨범 줄이기', () => {
  it('trimPlan: 최근 keep 개만(숫자 순)', () => {
    const keys = Array.from({ length: 15 }, (_, i) => 15 - i);
    const p = trimPlan(keys, 12);
    expect(p.keep).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(p.drop).toEqual([1, 2, 3]);
    expect(trimPlan([3, 1], 12).drop).toEqual([]);
  });
  it('flags 메타도 최근 12장 · seq 는 남은 것보다 크다', () => {
    const flags: Record<string, unknown> = {};
    const f = ensurePhotoFlags(flags);
    const meta = (id: number): PhotoMeta => ({ id, at: id, day: 0, hour: 9, world: 'earth', place: '말랑섬', species: [], filter: 'none', frame: 'none', w: 1, h: 1 });
    const dropped: number[] = [];
    for (let i = 1; i <= 14; i++) dropped.push(...pushMeta(f, meta(f.seq++)));
    expect(f.album.map((m) => m.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 3));
    expect(dropped).toEqual([1, 2]);
    // 망가진 저장을 고쳐 읽는다
    const re = ensurePhotoFlags({ photo: { album: [{ id: 40 }, 'x', null], spots: 3, seq: 'a' } });
    expect(re.album.map((m) => m.id)).toEqual([40]);
    expect(re.seq).toBe(41);
    expect(re.spots).toEqual({});
  });

  it('저장 초기화 뒤 남은 앨범 그림은 지우지 않고 \'추억\' 으로 다시 품는다 · seq 가 그 위로', () => {
    const f = ensurePhotoFlags({});
    expect(f.seq).toBe(1);
    const rows = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, at: 100 + i }));
    const got = adoptOrphans(f, rows);
    expect(got.length).toBe(14);
    // 12장만 남고, 새 번호는 옛 그림을 덮지 않는다
    expect(f.album.map((m) => m.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 3));
    expect(f.album.every((m) => m.place === '추억')).toBe(true);
    expect(f.seq).toBe(15);
    // 이미 있는 메타는 그대로
    expect(adoptOrphans(f, [{ id: 14, at: 0 }])).toEqual([]);
  });

  describe('IndexedDB(라이트 대역)', () => {
    let idb: StubIDB;
    beforeEach(() => { idb = stubIndexedDB(); });
    afterEach(() => { idb.restore(); });

    it("'dopamine-land-photos' 에 넣고, 13장째부터 오래된 것을 지운다", async () => {
      const a = await openAlbum();
      expect(a.kind).toBe('idb');
      const dropped: number[] = [];
      for (let i = 1; i <= 15; i++) dropped.push(...await a.put({ id: i, at: 1000 + i, blob: null, thumb: `t${i}` }));
      expect(dropped).toEqual([1, 2, 3]);
      const rows = idb.rows(DB_NAME, STORE) as Array<{ id: number }>;
      expect(rows.map((r) => r.id)).toEqual(Array.from({ length: ALBUM_KEEP }, (_, i) => i + 4));
      expect((await a.list()).length).toBe(12);
      expect((await a.get(15))?.thumb).toBe('t15');
      await a.remove(15);
      expect(await a.get(15)).toBeNull();
      expect((await a.list()).length).toBe(11);
    });
    it('다시 열어도 그대로(저장소를 또 만들지 않는다)', async () => {
      const a = await openAlbum();
      await a.put({ id: 7, at: 7, blob: null, thumb: 'x' });
      const b = await openAlbum();
      expect((await b.list()).map((r) => r.id)).toEqual([7]);
    });
  });
  it('IndexedDB 가 없으면 메모리 앨범(같은 규칙)', async () => {
    const a = await openAlbum(null as never);
    // 전역 indexedDB 가 node 엔 없다 → 메모리
    expect(a.kind).toBe('memory');
    const m = memoryAlbum(2);
    await m.put({ id: 1, at: 1, blob: null, thumb: '' });
    await m.put({ id: 2, at: 2, blob: null, thumb: '' });
    expect(await m.put({ id: 3, at: 3, blob: null, thumb: '' })).toEqual([1]);
  });
});

describe('꾸미기·필터', () => {
  it('CSS 필터 → 색 행렬(대체 경로)이 말이 된다', () => {
    const px = new Uint8ClampedArray([200, 100, 50, 255]);
    applyMatrix(px, cssToMatrix(FILTERS.find((f) => f.id === 'sepia')!.css));
    // 옛날 필터: 빨강 ≥ 초록 ≥ 파랑(누런 빛)
    expect(px[0]).toBeGreaterThanOrEqual(px[1]);
    expect(px[1]).toBeGreaterThanOrEqual(px[2]);
    const id = new Uint8ClampedArray([10, 20, 30, 255]);
    applyMatrix(id, cssToMatrix(''));
    expect([...id]).toEqual([10, 20, 30, 255]);
  });
  it('스티커 맞히기는 위에 붙은 것부터', () => {
    const list = [{ e: 'a', x: 0.5, y: 0.5, s: 0.1, rot: 0 }, { e: 'b', x: 0.52, y: 0.5, s: 0.1, rot: 0 }];
    expect(stickerAt(list, 0.51, 0.5, 16 / 9)).toBe(1);
    expect(stickerAt(list, 0.9, 0.9, 16 / 9)).toBe(-1);
  });
  it('타이머 순환 0 → 3 → 10 → 0', () => {
    expect([nextTimer(0), nextTimer(3), nextTimer(10)]).toEqual([3, 10, 0]);
  });
});
