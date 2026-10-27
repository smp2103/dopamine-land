// world-zones — game.geo: 구역 판정(zoneAt)·랜드마크 등록부·섬/랜드마크 발견(discover + flags.world).
import { describe, it, expect, beforeEach } from 'vitest';
import * as I from '../src/core/island';
import { zoneAt, bearing, WATER_ZONES, LAND_ZONES, SEA_SHALLOW, SEA_DEEP, REEF_RING } from '../src/modules/worldterrain/zones';
import { installGeo, seedLandmarks, worldFlags, DISCOVER_R } from '../src/modules/worldterrain/geo';
import { makeFakeGame, recordEvents } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';

const lake = (kind: string, island: string, pick: (l: I.LakeInfo) => boolean = () => true) => {
  const L = I.worldLakes().find((l) => l.kind === kind && l.island === island && pick(l));
  if (!L) throw new Error(`no ${kind} on ${island}`);
  return L;
};

/** 섬 중심에서 방위 ang(라디안, world 좌표 각) 으로 나가며 해안 바깥 off m 인 바다 점 */
function seaPoint(id: string, ang: number, off: number): { x: number; z: number } {
  const d = I.islandById(id)!;
  for (let r = d.r * 0.5; r < d.r * 3; r += 2) {
    const x = d.x + Math.cos(ang) * r, z = d.z + Math.sin(ang) * r;
    if (-I.islandCoast(d, x, z) >= off) return { x, z };
  }
  throw new Error('no sea point');
}

describe('zoneAt — GDD 구역 코드', () => {
  it('말랑섬 큰 강 한가운데(폭포·하구에서 먼 곳) = river', () => {
    const R = I.worldRivers().find((r) => r.island === 'home')!;
    const falls = R.pts.slice(0, -1).flatMap((a, i) => (a.level - R.pts[i + 1].level > 1.2 ? [a] : []));
    const p = R.pts.find((q) => {
      const s = I.worldSample(q.x, q.z);
      return s.coast > 90 && (s.water ?? -Infinity) > s.h && !I.lakeAt(q.x, q.z) && falls.every((f) => Math.hypot(f.x - q.x, f.z - q.z) > 60);
    })!;
    expect(p).toBeTruthy();
    expect(zoneAt(p.x, p.z)).toEqual({ island: 'home', theme: 'home', zone: 'river', sea: null });
  });

  it('하트 연못 · 크레이터 호수 · 오아시스 · 온천 · 얼음 구멍', () => {
    const hp = lake('heartpond', 'home');
    expect(zoneAt(hp.x, hp.z).zone).toBe('heartpond');
    const cr = lake('crater', 'launch');
    expect(zoneAt(cr.x, cr.z)).toMatchObject({ island: 'launch', zone: 'crater', sea: null });
    const desert = I.islandById('desert')!;
    const oa = lake('oasis', 'desert', (l) => l.x < desert.x);
    expect(zoneAt(oa.x, oa.z)).toMatchObject({ island: 'desert', theme: 'desert', zone: 'oasis' });
    // 동쪽 오아시스는 피라미드 유적 쪽 신전 연못
    const ru = lake('oasis', 'desert', (l) => l.x > desert.x);
    expect(zoneAt(ru.x, ru.z).zone).toBe('ruin');
    for (const hs of I.worldLakes().filter((l) => l.kind === 'hotspring')) expect(zoneAt(hs.x, hs.z).zone).toBe('hotspring');
    const ice = lake('icelake', 'ice', (l) => l.holes.length > 0);
    const h = ice.holes[0];
    expect(zoneAt(h.x, h.z)).toMatchObject({ island: 'ice', zone: 'icehole', sea: null });
    // 구멍 밖 얼음판은 icelake
    const off = { x: h.x + 4, z: h.z };
    if (I.lakeAt(off.x, off.z) && ice.holes.every((q) => Math.hypot(q.x - off.x, q.z - off.z) > q.r + 1)) expect(zoneAt(off.x, off.z).zone).toBe('icelake');
    const sw = lake('swamp', 'mushroom');
    expect(zoneAt(sw.x, sw.z).zone).toBe('swamp');
    const fl = lake('foglake', 'mushroom');
    expect(zoneAt(fl.x, fl.z).zone).toBe('foglake');
    const fp = lake('footprint', 'dino');
    expect(zoneAt(fp.x, fp.z).zone).toBe('footprint');
    const an = lake('ancientlake', 'dino');
    expect(zoneAt(an.x, an.z).zone).toBe('ancientlake');
  });

  it('산호빛섬 산호초 고리(해안 바깥 80~250 m) = reef, 그 안쪽은 shore, 바깥은 offshore', () => {
    const north = -Math.PI / 2; // −z(북쪽, 말랑섬 쪽)
    const r = seaPoint('coral', north, (REEF_RING.r0 + REEF_RING.r1) / 2);
    expect(zoneAt(r.x, r.z)).toMatchObject({ island: 'coral', zone: 'reef', sea: 'reef' });
    const s = seaPoint('coral', north, 40);
    expect(zoneAt(s.x, s.z)).toMatchObject({ zone: 'shore', sea: 'shallow' });
    const o = seaPoint('coral', north, 330);
    expect(zoneAt(o.x, o.z)).toMatchObject({ zone: 'offshore', sea: 'offshore' });
  });

  it('말랑섬 남쪽 만(원점 남쪽 40~200 m) = reef', () => {
    expect(zoneAt(0, 120)).toMatchObject({ zone: 'reef', sea: 'reef' });
  });

  it('꼬르륵 해구 한가운데 = 바다 trench, 낚시 구역 deep(GDD 3.5.10)', () => {
    expect(zoneAt(I.TRENCH.x, I.TRENCH.z)).toMatchObject({ island: null, theme: 'sea', zone: 'deep', sea: 'trench' });
    // 가장자리 고리 밖도 deep
    expect(zoneAt(3900, 0).sea).toBe('deep');
  });

  it('바다 깊이 단계: 0~20 shore → ~150 shallow → ~520 offshore → 그 밖 deep', () => {
    const east = 0; // +x
    const a = seaPoint('dino', east, 8), b = seaPoint('dino', east, 90), c = seaPoint('dino', east, 300);
    // 섬 사이 한복판(버섯섬·쪼꼬미섬 F 에서 650 m 넘게, 가장자리 고리 안쪽)
    const d = { x: -3000, z: 600 };
    for (const q of I.ISLANDS) expect(Math.hypot(d.x - q.x, d.z - q.z) - q.r * 1.25).toBeGreaterThan(SEA_DEEP);
    expect(Math.hypot(d.x, d.z)).toBeLessThan(I.EDGE_RING.r0);
    expect(zoneAt(a.x, a.z)).toMatchObject({ island: 'dino', zone: 'shore', sea: 'shore' });
    expect(zoneAt(b.x, b.z)).toMatchObject({ zone: 'shore', sea: 'shallow' });
    expect(zoneAt(c.x, c.z)).toMatchObject({ zone: 'offshore', sea: 'offshore' });
    expect(zoneAt(d.x, d.z).sea).toBe('deep');
    expect(SEA_SHALLOW).toBe(150);
  });

  it('솜눈섬 앞바다·얼음 성 빙산 둘레 = icesea, 말랑섬 강 어귀 바다 = estuary', () => {
    const p = seaPoint('ice', Math.PI * 0.75, 60);
    expect(zoneAt(p.x, p.z).zone).toBe('icesea');
    expect(zoneAt(I.ICEBERG.x + I.ICEBERG.r + 40, I.ICEBERG.z).zone).toBe('icesea');
    const est = I.worldFeatures().find((f) => f.kind === 'estuary')!;
    const pts = est.pts!;
    const m = pts[pts.length - 1];
    const z = zoneAt(m.x, m.z);
    expect(['estuary']).toContain(z.zone);
  });

  it('마을(원점) = 말랑섬 flower, 마을 강 = river', () => {
    expect(zoneAt(0, 0)).toEqual({ island: 'home', theme: 'home', zone: 'flower', sea: null });
    const q = I.RIVER_PATH[3];
    expect(zoneAt(q.x, q.z).zone).toBe('river');
  });

  it('섬마다 5구역이 실제로 나온다(GDD 2.2) + 모든 답이 정해진 코드 안', () => {
    const want: Record<string, string[]> = {
      home: ['flower', 'tree', 'sakura', 'orchard', 'rock', 'grass'],
      dino: ['fern', 'ranch', 'volcano', 'lava', 'fossil', 'crater'],
      ice: ['snow', 'cabin', 'icelake', 'snowtree', 'aurorahill', 'icecave'],
      mushroom: ['mushroom', 'shade', 'swamp', 'foglake', 'giant', 'tower'],
      coral: ['palm', 'beach', 'lagoon', 'jungle', 'mangrove'],
      desert: ['oasis', 'desertgrass', 'dune', 'cave', 'ruin', 'fossil', 'cactus'],
      launch: ['meadow', 'pad', 'crater', 'telescope', 'hill', 'wreckshore'],
    };
    const codes = new Set<string>([...WATER_ZONES, ...LAND_ZONES]);
    for (const [id, zs] of Object.entries(want)) {
      const d = I.islandById(id)!;
      const seen = new Set<string>();
      for (let z = d.z - d.r * 1.2; z <= d.z + d.r * 1.2; z += 12) for (let x = d.x - d.r * 1.2; x <= d.x + d.r * 1.2; x += 12) {
        const q = zoneAt(x, z);
        expect(codes.has(q.zone), `${id} ${x},${z} → ${q.zone}`).toBe(true);
        if (q.island === id && !q.sea) seen.add(q.zone);
      }
      for (const zc of zs) expect(seen.has(zc), `${id} 에 ${zc} 가 없다 (${[...seen].join(',')})`).toBe(true);
    }
  });

  it('결정적: 같은 좌표는 같은 답, 바다면 sea 가 차고 섬 안이면 null', () => {
    for (const [x, z] of [[100, 900], [-1750, 1100], [2650, 1050], [1234, -567]]) {
      const a = zoneAt(x, z), b = zoneAt(x, z);
      expect(a).toEqual(b);
      const s = I.worldSample(x, z);
      if (s.coast < 0) expect(a.sea).not.toBe(null);
    }
  });

  it('랜드마크를 넘기면 그 둘레 땅 구역을 덮어쓴다(피라미드)', () => {
    const d = I.islandById('desert')!;
    const sp = I.islandSpawnPoints('desert', 40).find((p) => zoneAt(p.x, p.z).zone !== 'pyramid' && !I.lakeAt(p.x, p.z))!;
    const lm = { id: 'lm:desert:pyramid', kind: 'pyramid', name: '모래 피라미드', island: 'desert', x: sp.x, z: sp.z, r: 20 };
    expect(zoneAt(sp.x, sp.z, [lm]).zone).toBe('pyramid');
    expect(zoneAt(sp.x + 200, sp.z, [lm]).zone).not.toBe('pyramid');
    expect(bearing(d.x, d.z, d.x, d.z - 10)).toBeCloseTo(0);
    expect(bearing(d.x, d.z, d.x + 10, d.z)).toBeCloseTo(90);
  });

  it('충분히 빠르다(청크 스포너가 칸마다 부른다)', () => {
    const t0 = performance.now();
    let n = 0;
    for (let z = -3000; z <= 3000; z += 150) for (let x = -3000; x <= 3000; x += 150) { zoneAt(x, z); n++; }
    expect((performance.now() - t0) / n).toBeLessThan(0.5);
  });
});

describe('game.geo — 랜드마크·발견', () => {
  beforeEach(() => { stubLocalStorage(); });
  const SEA: [number, number] = [-1200, 2500];

  it('build 하면 game.geo 가 붙고 PLACES 랜드마크가 심긴다', () => {
    const game = makeFakeGame({ pos: SEA });
    const geo = installGeo(game.asGame());
    expect(game.geo).toBe(geo);
    expect(geo.currentAt(0, 0)).toBe(null);
    expect(geo.islandName('coral')).toBe('산호빛섬');
    const ids = geo.landmarks.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['lm:home:lighthouse', 'lm:launch:launchpad', 'lm:sea:wreck', 'lm:ice:iceberg', 'lm:dino:tinohill', 'lm:sea:buoy:1']) expect(ids).toContain(id);
    for (const l of geo.landmarks) expect(l.id).toMatch(/^lm:[a-z0-9-]+:[a-z0-9]+(:\d+)?$/);
    expect(seedLandmarks().length).toBe(geo.landmarks.length);
    expect(geo.zoneAt(0, 120).sea).toBe('reef');
    geo.dispose();
  });

  it('addLandmark 는 id 로 멱등', () => {
    const game = makeFakeGame({ pos: SEA });
    const geo = installGeo(game.asGame());
    const n = geo.landmarks.length;
    geo.addLandmark({ id: 'lm:home:halmi', kind: 'halmi', name: '할미벚', island: 'home', x: -60, z: -700, r: 20 });
    geo.addLandmark({ id: 'lm:home:halmi', kind: 'halmi', name: '가짜', island: 'home', x: 0, z: 0, r: 5 });
    geo.addLandmark({ id: 'lm:home:lighthouse', kind: 'lighthouse', name: '덮어쓰기', island: 'home', x: 0, z: 0, r: 5 });
    expect(geo.landmarks.length).toBe(n + 1);
    expect(geo.landmark('lm:home:halmi')!.name).toBe('할미벚');
    expect(geo.landmark('lm:home:lighthouse')!.name).toBe('말랑섬 등대');
    // 할미벚 둘레는 sakura
    expect(geo.zoneAt(-60, -700).zone).toBe('sakura');
    geo.dispose();
  });

  it('섬마다 처음 올라설 때 한 번 discover(섬·쪼꼬미섬), 다시 불러와도 안 울린다', () => {
    const game = makeFakeGame({ pos: SEA });
    const ev = recordEvents(game);
    const geo = installGeo(game.asGame());
    game.tick(1 / 30, 30);
    expect(ev.of('discover')).toEqual([]);
    const dino = I.islandSpawnPoints('dino', 1, 0.3)[0];
    game.player.teleport(dino.x, dino.z);
    game.tick(1 / 30, 30);
    const isl = () => ev.of('discover').filter((e) => e.kind !== 'landmark');
    expect(isl()).toEqual([{ type: 'discover', place: 'dino', name: '쿵쿵공룡섬', kind: 'island' }]);
    // 섬 안에서 돌아다녀도, 나갔다 들어와도 한 번
    const dino2 = I.islandSpawnPoints('dino', 3, 0.3)[2];
    game.player.teleport(dino2.x, dino2.z);
    game.tick(1 / 30, 30);
    game.player.teleport(...SEA);
    game.tick(1 / 30, 30);
    game.player.teleport(dino.x, dino.z);
    game.tick(1 / 30, 30);
    expect(isl().length).toBe(1);
    const a = I.islandSpawnPoints('islet-a', 1, 0)[0];
    game.player.teleport(a.x, a.z);
    game.tick(1 / 30, 30);
    expect(isl()[1]).toMatchObject({ place: 'islet-a', kind: 'islet', name: '쪼꼬미섬 A' });
    expect(geo.discovered('dino')).toBe(true);
    expect(geo.discovered('ice')).toBe(false);
    expect(worldFlags(game.state.flags).disc.dino).toBeGreaterThanOrEqual(1);
    ev.off();
    geo.dispose();
    game.flushSave();
    game.dispose();

    // 다시 불러오기: 같은 섬은 다시 안 울린다
    const g2 = makeFakeGame({ pos: SEA });
    const ev2 = recordEvents(g2);
    const geo2 = installGeo(g2.asGame());
    expect(geo2.discovered('dino')).toBe(true);
    expect(geo2.discovered('islet-a')).toBe(true);
    g2.player.teleport(dino.x, dino.z);
    g2.tick(1 / 30, 30);
    g2.player.teleport(a.x, a.z);
    g2.tick(1 / 30, 30);
    expect(ev2.of('discover').filter((e) => e.kind !== 'landmark')).toEqual([]);
    // 새 섬은 울린다
    const c = I.islandSpawnPoints('coral', 1, 0.15)[0];
    g2.player.teleport(c.x, c.z);
    g2.tick(1 / 30, 30);
    expect(ev2.of('discover').filter((e) => e.kind !== 'landmark').map((e) => e.place)).toEqual(['coral']);
    geo2.dispose();
  });

  it('랜드마크 40 m 안에 처음 들 때 한 번 discover(landmark), 저장된다', () => {
    const game = makeFakeGame({ pos: SEA });
    const ev = recordEvents(game);
    const geo = installGeo(game.asGame());
    const W = I.PLACES.wreck;
    game.player.teleport(W.x + DISCOVER_R + 20, W.z);
    game.tick(1 / 30, 30);
    expect(ev.of('discover').filter((e) => e.place === 'lm:sea:wreck')).toEqual([]);
    game.player.teleport(W.x + 25, W.z);
    game.tick(1 / 30, 30);
    game.player.teleport(W.x - 10, W.z + 5);
    game.tick(1 / 30, 30);
    const hits = ev.of('discover').filter((e) => e.place === 'lm:sea:wreck');
    expect(hits).toEqual([{ type: 'discover', place: 'lm:sea:wreck', name: '해적 난파선 꿀꺽호', kind: 'landmark' }]);
    // 나중에 등록된 랜드마크도 잡는다
    geo.addLandmark({ id: 'lm:sea:test', kind: 'test', name: '시험 부표', island: 'sea', x: W.x, z: W.z + 10, r: 5 });
    game.tick(1 / 30, 30);
    expect(ev.of('discover').filter((e) => e.place === 'lm:sea:test').length).toBe(1);
    game.flushSave();
    const raw = JSON.parse(localStorage.getItem('dopamine-land-save-v1')!);
    expect(raw.flags.world.disc['lm:sea:wreck']).toBeGreaterThanOrEqual(1);
    geo.dispose();
  });

  it('우주·실내(focusOverride)에선 발견하지 않는다', () => {
    const game = makeFakeGame({ pos: SEA });
    const ev = recordEvents(game);
    const geo = installGeo(game.asGame());
    const dino = I.islandSpawnPoints('dino', 1, 0.3)[0];
    game.setWorld('space');
    game.player.teleport(dino.x, dino.z);
    game.tick(1 / 30, 30);
    expect(ev.of('discover')).toEqual([]);
    game.setWorld('earth');
    game.focusOverride = game.player.pos.clone();
    game.tick(1 / 30, 30);
    expect(ev.of('discover')).toEqual([]);
    game.focusOverride = null;
    game.tick(1 / 30, 30);
    expect(ev.of('discover').map((e) => e.place)).toContain('dino');
    geo.dispose();
  });
});
