// 세계 데이터: 섬 이름·장소 표·지형 특징(해구·늪·온천·크레이터·협곡·맹그로브·하트 연못·빙산)이 약속대로인가.
import { describe, it, expect } from 'vitest';
import * as W from '../src/core/world';
import * as I from '../src/core/island';
import { SECRET_IDS } from '../src/core/events';

const MAIN = ['home', 'dino', 'ice', 'mushroom', 'coral', 'desert', 'launch'] as const;
const EXCLUDED = new Set(['cliff', 'rock', 'sea']);
type P = { x: number; z: number };

/** 땅 위(마른 땅, 높이 0.5 초과) */
const onLand = (p: P) => I.heightAt(p.x, p.z) > 0.5 && I.coastDistAt(p.x, p.z) > 0;
/** 물속(바다 또는 섬 안 물) */
const inWater = (p: P) => I.waterLevelAt(p.x, p.z) > I.heightAt(p.x, p.z);

describe('섬 이름(GDD 2.2)', () => {
  it('표시 이름이 정본 표와 같다', () => {
    const want: Record<string, string> = {
      home: '말랑섬', dino: '쿵쿵공룡섬', ice: '솜눈섬', mushroom: '반딧불버섯섬', coral: '산호빛섬', desert: '모래시계섬', launch: '별똥별섬',
    };
    for (const [id, name] of Object.entries(want)) {
      expect(W.ISLAND_NAMES[id]).toBe(name);
      expect(W.islandById(id)!.name).toBe(name);
    }
    for (const c of 'abcdefgh') {
      expect(W.islandById(`islet-${c}`)!.name).toBe(`쪼꼬미섬 ${c.toUpperCase()}`);
      expect(W.islandName(`islet-${c}`)).toBe(`쪼꼬미섬 ${c.toUpperCase()}`);
    }
    for (const d of W.ISLANDS) expect(d.name).toBe(W.ISLAND_NAMES[d.id]);
  });
});

describe('높이장 연속성', () => {
  it('절벽·바위·바다가 아닌 곳은 1 m 걸음에 3 m 넘게 튀지 않는다', () => {
    let worst = 0, where = '';
    for (const d of W.ISLANDS) {
      const span = d.r * 2.6, step = d.theme === 'islet' ? 0.1 : 0.05;
      for (let pass = 0; pass < 2; pass++) {
        for (let row = -1.2; row <= 1.2; row += step) {
          const fixed = pass ? d.x + row * d.r : d.z + row * d.r;
          const at = (t: number) => (pass ? W.worldSample(fixed, t) : W.worldSample(t, fixed));
          const t0 = (pass ? d.z : d.x) - span / 2;
          let prev = at(t0);
          for (let t = t0 + 1; t <= t0 + span; t += 1) {
            const s = at(t);
            if (!EXCLUDED.has(s.kind) && !EXCLUDED.has(prev.kind)) {
              const j = Math.abs(s.h - prev.h);
              if (j > worst) { worst = j; where = `${d.id} (${pass ? fixed : t}, ${pass ? t : fixed}) ${prev.kind}>${s.kind}`; }
            }
            prev = s;
          }
        }
      }
    }
    expect(worst, where).toBeLessThanOrEqual(3);
  }, 120_000);

  it('같은 좌표는 언제 물어도 같은 높이(결정적)', () => {
    for (const [x, z] of [[-1650, -1250], [2650, 747], [1194, 1538], [-500, 3200], [470, -2340]]) {
      expect(W.worldSample(x, z)).toEqual(W.worldSample(x, z));
    }
  });
});

describe('바다 지형', () => {
  it('꼬르륵 해구 가운데는 −60 m 보다 깊고, 가장 깊은 곳은 −110 m 아래', () => {
    const h = I.heightAt(W.TRENCH.x, W.TRENCH.z);
    expect(h).toBeLessThanOrEqual(-60);
    expect(h).toBeLessThanOrEqual(-110);
    expect(h).toBeGreaterThanOrEqual(W.TRENCH_FLOOR - 5);
    // 타원 가장자리 안쪽도 −60 m 정도
    expect(I.heightAt(W.TRENCH.x + W.TRENCH.rx * 0.9, W.TRENCH.z)).toBeLessThanOrEqual(-55);
    expect(W.seaZoneAt(W.TRENCH.x, W.TRENCH.z)).toBe('trench');
  });
  it('월드 가장자리 고리(3700 m 밖)는 −60 m 보다 깊어진다', () => {
    expect(I.heightAt(3850, 0)).toBeLessThanOrEqual(-59);
    expect(I.heightAt(-3000, -3000)).toBeLessThan(I.heightAt(-2600, -2600) + 1);
    expect(I.heightAt(-3600, -3600)).toBeLessThanOrEqual(-60);
  });
  it('난파선 자리 해저는 정한 깊이로 돋워져 있다', () => {
    expect(I.heightAt(W.PLACES.wreck.x, W.PLACES.wreck.z)).toBeCloseTo(W.PLACES.wreck.depth, -0.5);
    expect(I.heightAt(W.PLACES.ghostShip.x, W.PLACES.ghostShip.z)).toBeCloseTo(W.PLACES.ghostShip.depth, -0.5);
    expect(I.heightAt(W.PLACES.ufoWreck.x, W.PLACES.ufoWreck.z)).toBeCloseTo(W.PLACES.ufoWreck.depth, -0.5);
  });
  it('얼음 성 빙산: 꼭대기는 땅, 둘레는 바다(솜눈섬 펭귄 만)', () => {
    const b = W.PLACES.iceberg;
    expect(I.heightAt(b.x, b.z)).toBeGreaterThan(10);
    expect(W.worldSample(b.x, b.z).island?.id).toBe('ice');
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const p = { x: b.x + Math.cos(a) * (b.r + 30), z: b.z + Math.sin(a) * (b.r + 30) };
      expect(inWater(p), `빙산 둘레 ${k}`).toBe(true);
    }
  });
  it('모래톱 길은 물 바로 아래 얕은 둑', () => {
    const f = W.worldFeatures().find((q) => q.kind === 'sandbar')!;
    const h = I.heightAt(f.x, f.z);
    expect(h).toBeLessThan(0);
    expect(h).toBeGreaterThan(-1.5);
  });
});

describe('장소 표(PLACES)', () => {
  const P = W.PLACES;
  it('마을 안(ISLAND_BOUNDS) 예전 장소는 마을 땅 위(물 밖)', () => {
    // 마을 전용 지형(높이 0~1 m 모래·들판)이라 높이 기준 대신 해안 안쪽 + 물 밖만 본다
    for (const [k, p] of [['shop', P.shop], ['museum', P.museum], ['workbench', P.workbench], ['townBoard', P.townBoard], ['bikeRack', P.bikeRack]] as Array<[string, P]>) {
      expect(I.coastDistAt(p.x, p.z), k).toBeGreaterThan(0);
      expect(inWater(p), k).toBe(false);
    }
  });
  it('땅 장소는 모두 땅 위에 있다', () => {
    const land: Array<[string, P]> = [
      ['launchPad', P.launchPad], ['shipyard', P.shipyard], ['house', P.house], ['mailbox', P.mailbox], ['pengLab', P.pengLab], ['tinoHill', P.tinoHill],
      ...Object.entries(P.docks).map(([k, v]) => [`dock:${k}`, v] as [string, P]),
      ...Object.entries(P.lighthouses).map(([k, v]) => [`lighthouse:${k}`, v] as [string, P]),
      ...Object.entries(P.facilities).map(([k, v]) => [`facility:${k}`, v] as [string, P]),
      ...P.caves.map((c) => [c.id, c] as [string, P]),
      ...Object.entries(P.hidden).filter(([, v]) => !v.water).map(([k, v]) => [`hidden:${k}`, v] as [string, P]),
    ];
    for (const [k, p] of land) {
      expect(onLand(p), `${k} (${p.x}, ${p.z}) h=${I.heightAt(p.x, p.z).toFixed(2)}`).toBe(true);
      expect(inWater(p), `${k} 물속`).toBe(false);
    }
  });
  it('바다 장소는 모두 물속에 있다', () => {
    const sea: Array<[string, P]> = [
      ['wreck', P.wreck], ['ghostShip', P.ghostShip], ['ufoWreck', P.ufoWreck], ['whirlpool', P.whirlpool], ['crater', P.crater],
      ...P.buoyMail.map((b) => [b.id, b] as [string, P]),
      ...Object.entries(P.hidden).filter(([, v]) => v.water).map(([k, v]) => [`hidden:${k}`, v] as [string, P]),
    ];
    for (const [k, p] of sea) expect(inWater(p), `${k} (${p.x}, ${p.z})`).toBe(true);
  });
  it('부표 우체통 6개는 GDD 2.4 좌표 그대로', () => {
    expect(P.buoyMail.map((b) => [b.x, b.z])).toEqual([[800, -480], [450, 760], [-880, 560], [-1000, -1060], [2200, 80], [-200, -1500]]);
    expect([P.wreck.x, P.wreck.z, P.ghostShip.x, P.ghostShip.z, P.ufoWreck.x, P.ufoWreck.z, P.whirlpool.x, P.whirlpool.z, P.iceberg.x, P.iceberg.z])
      .toEqual([-650, 650, -2700, 2000, 1100, -2900, 3200, -2600, -1650, -1250]);
  });
  it('조선소는 부두 동쪽 모래 해변', () => {
    expect(P.shipyard.x).toBeGreaterThan(P.boatDock.x);
    expect(I.surfaceAt(P.shipyard.x, P.shipyard.z).kind).toBe('sand');
    expect(P.shipyard.island).toBe('home');
  });
  it('집터·우체통은 마을 근처 평지, 펭박사 연구소는 발사대 옆', () => {
    expect(Math.hypot(P.house.x, P.house.z)).toBeLessThan(250);
    expect(I.isBuildable(P.house.x, P.house.z, 1)).toBe(true);
    expect(Math.hypot(P.mailbox.x - P.house.x, P.mailbox.z - P.house.z)).toBeLessThan(15);
    expect(Math.hypot(P.pengLab.x - P.launchPad.x, P.pengLab.z - P.launchPad.z)).toBeLessThan(200);
    expect(W.worldSample(P.pengLab.x, P.pengLab.z).island?.id).toBe('launch');
  });
  it('말랑섬 등대는 예전 식 spot("home", 0.75, 10) 그대로', () => {
    // village/landmarks.ts 의 spot 을 그대로 옮긴 식
    const spot = (id: string, ang: number, coast: number) => {
      const d = I.islandById(id)!;
      let best = { x: d.x, z: d.z };
      for (let r = 0; r < d.r * 1.6; r += 3) {
        const x = d.x + Math.cos(ang) * r, z = d.z + Math.sin(ang) * r;
        const s = I.worldSample(x, z);
        if (s.island?.id === id && s.coast >= coast) best = { x, z };
      }
      return best;
    };
    const want = spot('home', 0.75, 10);
    const got = W.lighthouseSpot('home');
    expect(got.x).toBeCloseTo(want.x, 6);
    expect(got.z).toBeCloseTo(want.z, 6);
    expect(P.lighthouses.home.x).toBeCloseTo(want.x, 1);
    expect(P.lighthouses.home.z).toBeCloseTo(want.z, 1);
    expect(Object.keys(P.lighthouses).sort()).toEqual([...MAIN].sort());
    // 다른 섬은 원점 쪽 해안
    for (const id of MAIN) {
      if (id === 'home') continue;
      const d = I.islandById(id)!, L = P.lighthouses[id];
      expect(Math.hypot(L.x, L.z)).toBeLessThan(Math.hypot(d.x, d.z));
      expect(I.coastDistAt(L.x, L.z)).toBeGreaterThanOrEqual(9.5);
    }
  });
  it('다리 3개: 말랑섬 강 위, 양쪽 끝은 땅', () => {
    expect(P.bridges).toHaveLength(3);
    for (const b of P.bridges) {
      expect(W.worldSample(b.x, b.z).island?.id).toBe('home');
      expect(b.len).toBeGreaterThan(4);
      expect(b.len).toBeLessThan(40);
      // 다리 가운데는 물, 양끝(rot 방향 ± len/2)은 마른 땅
      expect(inWater(b), `다리 가운데 (${b.x}, ${b.z})`).toBe(true);
      const ux = Math.sin(b.rot), uz = Math.cos(b.rot);
      for (const s of [-1, 1]) {
        const e = { x: b.x + ux * (b.len / 2) * s, z: b.z + uz * (b.len / 2) * s };
        expect(onLand(e) && !inWater(e), `다리 끝 ${s}`).toBe(true);
      }
    }
  });
  it('시설 9곳은 각자 섬 위', () => {
    const want: Record<string, string> = {
      apiary: 'home', divingCenter: 'coral', fireflyGarden: 'mushroom', fossilLab: 'dino', iceHut: 'ice',
      bazaar: 'desert', observatory: 'launch', potionShop: 'mushroom', skiLift: 'ice',
    };
    expect(Object.keys(P.facilities).sort()).toEqual(Object.keys(want).sort());
    for (const [k, island] of Object.entries(want)) {
      const f = P.facilities[k as keyof typeof P.facilities];
      expect(f.island).toBe(island);
      expect(W.worldSample(f.x, f.z).island?.id, k).toBe(island);
    }
  });
  it('동굴 입구는 섬마다 1~3개', () => {
    for (const id of MAIN) {
      const n = P.caves.filter((c) => c.island === id).length;
      expect(n, id).toBeGreaterThanOrEqual(1);
      expect(n, id).toBeLessThanOrEqual(3);
    }
    expect(new Set(P.caves.map((c) => c.id)).size).toBe(P.caves.length);
  });
  it('숨은 곳 21개 = SECRET_IDS', () => {
    expect(Object.keys(P.hidden).sort()).toEqual([...SECRET_IDS].sort());
    for (const [k, v] of Object.entries(P.hidden)) {
      const isl = k.startsWith('mush') ? 'mushroom' : k.split('-')[0];
      expect(v.island, k).toBe(isl);
    }
  });
  it('티노 언덕은 공룡섬 중심보다 북쪽 언덕, 크레이터는 별똥별섬 동쪽', () => {
    const d = I.islandById('dino')!;
    expect(P.tinoHill.z).toBeLessThan(d.z);
    expect(I.heightAt(P.tinoHill.x, P.tinoHill.z)).toBeGreaterThan(I.heightAt(P.tinoHill.x + 80, P.tinoHill.z + 80) + 5);
    const L = I.islandById('launch')!;
    expect(P.crater.x).toBeGreaterThan(L.x + 100);
  });
});

describe('섬 지형 특징', () => {
  const lakes = W.worldLakes();
  const of = (island: string, kind: W.LakeKind) => lakes.filter((l) => l.island === island && l.kind === kind);
  it('호수 종류: 하트 연못·온천 3·늪·안개 호수·고대 호수·크레이터·오아시스', () => {
    expect(of('home', 'heartpond')).toHaveLength(1);
    expect(of('dino', 'hotspring')).toHaveLength(3);
    expect(of('dino', 'swamp').length).toBeGreaterThanOrEqual(1);
    expect(of('dino', 'ancientlake')).toHaveLength(1);
    expect(of('mushroom', 'swamp').length).toBeGreaterThanOrEqual(1);
    expect(of('mushroom', 'foglake')).toHaveLength(1);
    expect(of('launch', 'crater')[0].galaxy).toBe(true);
    expect(of('desert', 'oasis').length).toBeGreaterThanOrEqual(1);
    // 새 호수가 붙어도 예전 호수 id 는 그대로
    expect(lakes.slice(0, 11).map((l) => l.id)).toEqual([
      'home-lake0', 'home-lake1', 'dino-lake2', 'dino-lake3', 'ice-lake4', 'ice-lake5',
      'mushroom-lake6', 'mushroom-lake7', 'mushroom-lake8', 'desert-lake9', 'launch-lake10',
    ]);
  });
  it('물이 고인 호수는 가운데가 물속(언 호수 제외)', () => {
    for (const L of lakes) {
      if (L.frozen) continue;
      // 하트·발자국은 모양 가운데가 중심에서 살짝 비켜 있어 안쪽 한 점을 찾는다
      let p: P | null = null;
      for (let r = 0; r < L.r && !p; r += 1) for (let k = 0; k < 12 && !p; k++) {
        const q = { x: L.x + Math.cos(k) * r, z: L.z + Math.sin(k) * r };
        if (W.lakeEdge(L, q.x, q.z) > 1) p = q;
      }
      expect(p, L.id).not.toBeNull();
      expect(inWater(p!), L.id).toBe(true);
    }
  });
  it('하트 연못은 하트 모양(뾰족한 끝 쪽은 좁다)', () => {
    const L = of('home', 'heartpond')[0];
    expect(L.shape).toBe('heart');
    // 하트 위쪽 두 혹 사이는 가운데보다 덜 안쪽
    expect(W.lakeEdge(L, L.x - L.r * 0.5, L.z - L.r * 0.5)).toBeGreaterThan(0);
    expect(W.lakeEdge(L, L.x + L.r * 0.5, L.z - L.r * 0.5)).toBeGreaterThan(0);
    expect(W.lakeEdge(L, L.x, L.z + L.r * 0.95)).toBeLessThan(W.lakeEdge(L, L.x, L.z + L.r * 0.2));
  });
  it('언 호수 얼음 구멍은 물이 보인다', () => {
    const L = of('ice', 'icelake')[0];
    expect(L.holes.length).toBeGreaterThanOrEqual(5);
    for (const q of L.holes) expect(inWater(q)).toBe(true);
    expect(inWater({ x: L.x + L.r * 0.9, z: L.z })).toBe(false);
  });
  it('산호빛섬: 석호와 동쪽 맹그로브 수로는 바다 높이 물', () => {
    const c = I.islandById('coral')!;
    expect(I.waterLevelAt(c.x, c.z)).toBe(0);
    let wet = 0;
    for (let z = c.z - 150; z <= c.z + 150; z += 6) for (let x = c.x + 0.45 * c.r; x <= c.x + 0.8 * c.r; x += 6) {
      const s = W.worldSample(x, z);
      if (s.coast > 0 && s.water === 0 && s.h < 0) wet++;
    }
    expect(wet).toBeGreaterThan(20);
  });
  it('모래시계섬: 북쪽 협곡 미로는 절벽 벽 + 걸을 수 있는 바닥', () => {
    const f = W.worldFeatures().find((q) => q.kind === 'canyon')!;
    let cliff = 0, floor = 0, top = 0;
    for (let z = f.z - 100; z <= f.z + 100; z += 3) for (let x = f.x - 100; x <= f.x + 100; x += 3) {
      const s = W.worldSample(x, z);
      if (s.kind === 'cliff') cliff++;
      else if (s.h < 5 && s.coast > 30) floor++;
      else if (s.h > 14) top++;
    }
    expect(cliff).toBeGreaterThan(100);
    expect(floor).toBeGreaterThan(100);
    expect(top).toBeGreaterThan(100);
  });
  it('해안 절벽(말랑섬 북쪽, 모래시계섬 남쪽 화석층)은 절벽으로 표시된다', () => {
    for (const kind of ['coastCliff', 'fossilCliff'] as const) {
      const f = W.worldFeatures().find((q) => q.kind === kind)!;
      let n = 0;
      for (let z = f.z - 60; z <= f.z + 60; z += 2) for (let x = f.x - 60; x <= f.x + 60; x += 2) if (W.worldSample(x, z).kind === 'cliff') n++;
      expect(n, kind).toBeGreaterThan(20);
    }
  });
  it('별똥별섬 크레이터: 테두리 둑보다 호수가 낮다 + 천문대 언덕이 고원보다 높다', () => {
    const c = W.PLACES.crater;
    expect(c.level).toBeLessThan(I.heightAt(c.x + c.r * 1.45, c.z));
    const obs = W.PLACES.facilities.observatory;
    expect(I.heightAt(obs.x, obs.z)).toBeGreaterThan(I.heightAt(W.PLACES.launchPad.x, W.PLACES.launchPad.z) + 6);
  });
  it('worldFeatures 에 world-zones 가 쓸 특징이 다 있다', () => {
    const kinds = new Set(W.worldFeatures().map((f) => f.kind));
    for (const k of ['trench', 'edgeRing', 'reef', 'iceberg', 'narwhal', 'heartpond', 'estuary', 'coastCliff', 'tinoHill', 'geyserValley', 'geyser',
      'icehole', 'penguinBeach', 'mangrove', 'lagoon', 'canyon', 'fossilCliff', 'crater', 'observatoryHill', 'sandbar', 'wreck'] as const) {
      expect(kinds.has(k), k).toBe(true);
    }
    const ids = W.worldFeatures().map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('펭귄 해변은 모래, 간헐천 골짜기엔 온천', () => {
    const pb = W.worldFeatures().find((f) => f.kind === 'penguinBeach')!;
    expect(W.worldSample(pb.x, pb.z).kind).toBe('sand');
    expect(of('ice', 'hotspring').length).toBeGreaterThanOrEqual(1);
  });
  it('섬마다 3층 고도(해안 → 평지 → 언덕 → 정상)', () => {
    for (const p of W.islandProfiles()) {
      if (!MAIN.includes(p.id as (typeof MAIN)[number])) continue;
      expect(p.peak.h, p.id).toBeGreaterThan(14);
      expect(p.tiers.summit, p.id).toBeGreaterThan(p.tiers.plain);
    }
  });
  it('마을 범위(ISLAND_BOUNDS)는 그대로', () => {
    expect(I.ISLAND_BOUNDS).toEqual({ minX: -48, maxX: 22, minZ: -44, maxZ: 26 });
  });
});
