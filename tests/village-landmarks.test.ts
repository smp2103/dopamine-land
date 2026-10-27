// village-landmarks: 등대 7(불 켜기)·발사탑 단계·버섯 탑 계단·부표 출렁임·랜드마크 id·임포스터 단계 교체.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import * as Island from '../src/core/island';
import { makeFakeGame, makeCtx } from './kit/fakeGame';
import { buildLandmarks, nightOfHour, sandFallSpot, type LandmarkBuild } from '../src/modules/village/landmarks';
import { buildLaunchTower, buildMushTower, towerPieces, TOWER_STAGES, mushStairs, mushShelf, MUSH, mushStemR } from '../src/modules/village/tower';
import { buildLighthouse, LIGHTHOUSE_LOOK } from '../src/modules/village/lighthouse';
import { buildBuoy, bobHeight } from '../src/modules/village/buoys';
import { buildImpostors, type Imp } from '../src/modules/village/impostors';
import type { Placer } from '../src/modules/village';
import type { Built, Col } from '../src/modules/village/common';

/** village.ts 와 같은 놓기(물리 없이 충돌체 수만 센다) */
function testPlacer(anims: NonNullable<Built['anim']>, cols: { n: number }): () => Placer {
  return () => {
    const root = new THREE.Group();
    return {
      root, anims,
      place: (b, x, y, z, rotY) => {
        b.g.position.set(x, y, z);
        b.g.rotation.y = rotY;
        b.g.scale.setScalar(b.scale ?? 1);
        root.add(b.g);
        if (b.anim) anims.push(...b.anim);
        cols.n += b.cols.length;
        return b.g;
      },
    };
  };
}
const footY = (x: number, z: number, r: number) => {
  let m = Island.heightAt(x, z);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; m = Math.min(m, Island.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
  return m;
};
const findByName = (groups: THREE.Object3D[], name: string) => {
  for (const g of groups) { const o = g.getObjectByName(name); if (o) return o; }
  return undefined;
};

describe('발사탑 단계', () => {
  it('단계 n → 보이는 조각 수 n+1(비계 포함), 범위 밖은 자른다', () => {
    const t = buildLaunchTower();
    expect(t.root.name).toBe('launch-tower');
    for (let n = 0; n <= 6; n++) {
      t.setStage(n);
      expect(t.stage).toBe(n);
      expect(t.visibleCount()).toBe(n + 1);
      expect(towerPieces(n)).toEqual(TOWER_STAGES.slice(0, n + 1));
    }
    t.setStage(99); expect(t.visibleCount()).toBe(7);
    t.setStage(-3); expect(t.visibleCount()).toBe(1);
    t.setStage(Number.NaN); expect(t.stage).toBe(0);
  });
  it('단계 3 = 동체·노즐·창까지, 날개·탱크·안테나는 숨김', () => {
    const t = buildLaunchTower();
    t.setStage(3);
    expect(t.pieces.body.visible && t.pieces.nozzles.visible && t.pieces.window.visible).toBe(true);
    expect(t.pieces.fins.visible || t.pieces.tank.visible || t.pieces.antenna.visible).toBe(false);
  });
  it('단계 조각은 살아 있는 묶음(bake 가 합치지 않는다) + 안은 재질 키로 미리 합쳐 있다', () => {
    const t = buildLaunchTower();
    expect(t.root.userData.live).toBe(true);
    const body = t.pieces.body;
    const meshes: THREE.Mesh[] = [];
    body.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.length).toBeLessThanOrEqual(4);
    for (const m of meshes) expect(typeof m.userData.mk).toBe('string');
  });
});

describe('등대', () => {
  it('setLit 가 자기 발광 재질을 켜고 끈다(밤엔 빛줄기도)', () => {
    let k = 1;
    const c = buildLighthouse('coral', () => k);
    expect(c.root.name).toBe('lighthouse-coral');
    expect(c.lampMat.emissiveIntensity).toBe(0);
    c.setLit(true);
    expect(c.lampMat.emissiveIntensity).toBeGreaterThan(1);
    expect(c.beam.visible).toBe(true);
    expect(c.glow()).toBeGreaterThan(0.9);
    k = 0;
    c.built.anim![0].fn(c.root, new THREE.Quaternion(), 1);
    expect(c.beam.visible).toBe(false);
    expect(c.lampMat.emissiveIntensity).toBeGreaterThan(0);
    c.setLit(false);
    expect(c.lampMat.emissiveIntensity).toBe(0);
    expect(c.glow()).toBe(0);
  });
  it('산호빛섬 등대는 하얗다, 등대 재질은 섬마다 따로', () => {
    for (const c of LIGHTHOUSE_LOOK.coral.stripes) {
      const hex = new THREE.Color(c).getHex();
      expect(Math.min(hex >> 16, (hex >> 8) & 255, hex & 255)).toBeGreaterThan(0xf0);
    }
    const a = buildLighthouse('home', () => 0), b = buildLighthouse('dino', () => 0);
    expect(a.lampMat).not.toBe(b.lampMat);
  });
  it('밤 세기: 22시 1, 낮 0, 저녁은 그 사이', () => {
    expect(nightOfHour(22)).toBe(1);
    expect(nightOfHour(2)).toBe(1);
    expect(nightOfHour(12)).toBe(0);
    expect(nightOfHour(19)).toBeGreaterThan(0);
    expect(nightOfHour(19)).toBeLessThan(1);
  });
});

describe('버섯 탑 계단', () => {
  it('한 칸 0.45 m 이하로 올라 갓 위 관측대에 닿는다', () => {
    const s = mushStairs();
    expect(s.length).toBeGreaterThan(100);
    // 디딤판 사이는 0.45 이하 — 단, 아래 나선 끝 → 44 m 선반 → 위 나선 시작은 선반을 딛고 두 번 오른다
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1].y, b = s[i].y;
      if (a <= MUSH.shelfY && b > MUSH.shelfY) { expect(MUSH.shelfY - a).toBeLessThanOrEqual(0.45); expect(b - MUSH.shelfY).toBeLessThanOrEqual(0.45); }
      else expect(b - a).toBeLessThanOrEqual(0.45 + 1e-6);
    }
    expect(s[0].y).toBeLessThanOrEqual(0.45);
    expect(Math.abs(s[s.length - 1].y - MUSH.deck)).toBeLessThan(0.41);
    // 아래 나선 디딤판은 줄기 밖, 위 나선은 갓 밖
    for (const st of s) {
      const inner = st.r - st.hx;
      if (st.y < MUSH.shelfY) expect(inner).toBeGreaterThanOrEqual(mushStemR(st.y) - 1e-6);
      else expect(inner).toBeGreaterThan(MUSH.capR);
    }
  });
});

/** 충돌체 안에 점이 있나(로컬, ry 는 y 축 돌림 — village.ts 와 같은 방향) */
function inside(c: Col, x: number, y: number, z: number, pad = 0): boolean {
  if (c.kind === 'cyl') return Math.hypot(x - c.x, z - c.z) < c.r + pad && Math.abs(y - c.y) < c.hh;
  const dx = x - c.x, dz = z - c.z, t = c.ry ?? 0;
  const lx = dx * Math.cos(t) - dz * Math.sin(t), lz = dx * Math.sin(t) + dz * Math.cos(t);
  return Math.abs(lx) < c.hx + pad && Math.abs(y - c.y) < c.hy && Math.abs(lz) < c.hz + pad;
}
const topOf = (c: Col) => (c.kind === 'cyl' ? c.y + c.hh : c.y + c.hy);

describe('버섯 탑 걸어 오르기', () => {
  const rng = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  const cols = buildMushTower(rng).cols;
  const steps = mushStairs();
  const shelf = mushShelf();
  /** (x,z) 에서 발 높이 h 로 설 때 밟는 바닥 높이(자동 오르기 0.45 안에서 가장 높은 윗면) */
  const groundAt = (x: number, z: number, h: number) => {
    let best = -Infinity;
    for (const c of cols) {
      const tp = topOf(c);
      if (tp > h + 0.45 + 1e-6) continue;
      if (inside(c, x, tp - 0.01, z, 0.15)) best = Math.max(best, tp); // 캡슐(반경 0.32) 절반쯤만 걸쳐도 딛는다
    }
    return best;
  };
  /** 발 위 자동 오르기 높이(0.45) ~ 2 m 기둥(캡슐 반경 0.3)을 막는 충돌체가 있나 — 그 아래는 딛고 오르는 턱 */
  const blocked = (x: number, z: number, h: number) =>
    cols.some((c) => { for (let y = h + 0.5; y <= h + 2; y += 0.1) if (inside(c, x, y, z, 0.3)) return true; return false; });

  it('디딤판·선반 발판 위(턱 높이 ~ 2 m)에 다른 충돌체가 없다', () => {
    for (const s of [...steps, ...shelf.land]) {
      for (const [dr, dt] of [[0, 0], [-1, 0], [1, 0], [0, -0.35], [0, 0.35]]) {
        const r = s.r + dr, a = s.ang + dt / s.r;
        expect(blocked(Math.cos(a) * r, Math.sin(a) * r, s.y), `계단 y=${s.y.toFixed(1)} (${dr},${dt})`).toBe(false);
      }
    }
  });

  it('바닥부터 관측대까지 한 걸음씩 걸어 오를 수 있다(0.45 m 넘는 턱·머리 위 막힘·빠짐 없음)', () => {
    const low = steps.filter((s) => s.y <= MUSH.shelfY), up = steps.filter((s) => s.y > MUSH.shelfY);
    const e = low[low.length - 1], u = up[0];
    const P = (a: number, r: number) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    // 길: 아래 나선 칸 중심 → 선반 발판 → 선반 길(같은 반경) → 선반 길 바깥 → 위 나선 칸 중심
    const way = [
      ...low.map((s) => P(s.ang, s.r)),
      ...shelf.land.map((s) => P(s.ang, s.r)),
      P(shelf.aB, e.r), P(shelf.aB, u.r),
      ...up.map((s) => P(s.ang, s.r)),
      P(up[up.length - 1].ang + 0.05, MUSH.capR - 2), // 마지막 칸 → 갓 위 관측대
    ];
    let h = groundAt(way[0].x, way[0].z, 0.45);
    expect(h).toBeCloseTo(steps[0].y, 3);
    for (let i = 1; i < way.length; i++) {
      const A = way[i - 1], B = way[i], n = Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / 0.1);
      for (let k = 1; k <= n; k++) {
        const x = A.x + ((B.x - A.x) * k) / n, z = A.z + ((B.z - A.z) * k) / n;
        const g = groundAt(x, z, h);
        expect(g, `구간 ${i} 에서 발밑이 비었다(h=${h.toFixed(2)})`).toBeGreaterThan(h - 0.05);
        h = g;
        expect(blocked(x, z, h), `구간 ${i} h=${h.toFixed(2)} 머리 위가 막혔다`).toBe(false);
      }
    }
    expect(h).toBeCloseTo(MUSH.deck, 1);
  });
});

describe('부표', () => {
  it('ocean.waveAt 를 따라 출렁이고, 없으면 사인 파도', () => {
    expect(bobHeight({ waveAt: () => 0.7 }, 0, 0, 1)).toBe(0.7);
    const a = bobHeight(null, 0, 0, 1), b = bobHeight(null, 0, 0, 2.3);
    expect(Math.abs(a)).toBeLessThan(0.5);
    expect(a).not.toBe(b);
    expect(Number.isFinite(bobHeight({ waveAt: () => NaN }, 0, 0, 1))).toBe(true);
    let ocean: { waveAt(x: number, z: number, t: number): number } | null = null;
    const c = buildBuoy('buoy-1', 1, 800, -480, () => ocean);
    expect(c.root.name).toBe('buoy-1');
    c.built.anim![0].fn(c.root, new THREE.Quaternion(), 1);
    const y0 = c.y();
    ocean = { waveAt: () => 1.25 };
    c.built.anim![0].fn(c.root, new THREE.Quaternion(), 1);
    expect(c.y()).toBeCloseTo(1.25, 5);
    expect(c.y()).not.toBe(y0);
  });
});

/** 글씨 판(캔버스)용 최소 document 대역 — 그리기는 아무것도 안 한다 */
function stubCanvasDocument(): () => void {
  const g = globalThis as { document?: unknown };
  if (g.document) return () => {};
  const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 0 }) : () => {}), set: () => true });
  g.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };
  return () => { delete g.document; };
}

describe('buildLandmarks(가짜 게임)', () => {
  let res: LandmarkBuild;
  let undoDoc = () => {};
  afterAll(() => undoDoc());
  const anims: NonNullable<Built['anim']> = [];
  const cols = { n: 0 };
  const imps: Imp[] = [];
  beforeAll(() => {
    undoDoc = stubCanvasDocument();
    const game = makeFakeGame();
    const ctx = makeCtx(game);
    res = buildLandmarks(ctx as never, testPlacer(anims, cols), footY, imps);
  });
  it('돌려주는 모양: groups + controls(등대 7·발사탑·부표 6)', () => {
    expect(Array.isArray(res.groups)).toBe(true);
    expect(res.groups.length).toBeGreaterThan(5);
    expect([...res]).toEqual(res.groups);
    expect(Object.keys(res.controls.lighthouses).sort()).toEqual([...Island.LIGHTHOUSE_ISLANDS].sort());
    expect(res.controls.buoys.map((b) => b.id)).toEqual(Island.PLACES.buoyMail.map((b) => b.id));
    expect(findByName(res.groups, 'launch-tower')).toBeTruthy();
    for (const id of Island.LIGHTHOUSE_ISLANDS) expect(findByName(res.groups, `lighthouse-${id}`)).toBeTruthy();
    expect(cols.n).toBeGreaterThan(200); // 버섯 탑 계단 충돌체 포함
  });
  it('setLighthouse 가 발광을 토글하고 lit 를 맞춘다', () => {
    const lamp = findByName(res.groups, 'lighthouse-lamp-ice') as THREE.Mesh;
    const mat = lamp.material as THREE.MeshStandardMaterial;
    expect(mat.emissiveIntensity).toBe(0);
    res.controls.setLighthouse('ice', true);
    expect(res.controls.lighthouses.ice.lit).toBe(true);
    expect(mat.emissiveIntensity).toBeGreaterThan(0);
    res.controls.setLighthouse('ice', false);
    expect(res.controls.lighthouses.ice.lit).toBe(false);
    expect(mat.emissiveIntensity).toBe(0);
    expect(() => res.controls.setLighthouse('nope', true)).not.toThrow();
  });
  it('setTowerStage 가 발사탑 조각을 켠다', () => {
    res.controls.setTowerStage(4);
    expect(res.controls.towerStage()).toBe(4);
    expect(findByName(res.groups, 'launch-tower:fins')!.visible).toBe(true);
    expect(findByName(res.groups, 'launch-tower:tank')!.visible).toBe(false);
    res.controls.setTowerStage(0);
    expect(findByName(res.groups, 'launch-tower:body')!.visible).toBe(false);
  });
  it('랜드마크 id 는 겹치지 않고 lm:<섬>:<종류>[:n] 모양, LANDMARK_ZONE 종류(mushtower·launchtower·coconut·pyramid)', () => {
    const ids = res.controls.landmarks.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of res.controls.landmarks) {
      expect(l.id).toMatch(/^lm:[a-z]+:[a-z]+(:\d+)?$/);
      expect(l.id.startsWith(`lm:${l.island}:${l.kind}`)).toBe(true);
      expect(Number.isFinite(l.x) && Number.isFinite(l.z) && l.r > 0).toBe(true);
      expect(l.name.length).toBeGreaterThan(0);
    }
    for (const k of ['lm:mushroom:mushtower', 'lm:launch:launchtower', 'lm:coral:coconut', 'lm:desert:pyramid', 'lm:desert:sandfall', 'lm:ice:icecastle', 'lm:dino:volcanovent', 'lm:mushroom:ghostship', 'lm:launch:penglab', 'lm:home:windmill']) expect(ids).toContain(k);
    // geo 씨앗과 같은 id(멱등 addLandmark): 등대·부표
    expect(ids).toContain('lm:coral:lighthouse');
    expect(ids).toContain('lm:sea:buoy:6');
  });
  it('등대 자리는 그 섬 땅 위, 부표는 바다 위', () => {
    for (const [id, p] of Object.entries(res.controls.lighthouses)) {
      const s = Island.worldSample(p.x, p.z);
      expect(s.island?.id).toBe(id);
      expect(s.coast).toBeGreaterThan(0);
      expect(s.h).toBeGreaterThan(0);
    }
    for (const b of res.controls.buoys) expect(Island.heightAt(b.x, b.z)).toBeLessThan(-1);
  });
  it('얼음 성은 빙산 위, 관측대는 숨은 곳 자리 위 56 m 쯤', () => {
    const c = res.controls.landmarks.find((l) => l.id === 'lm:ice:icecastle')!;
    expect(Math.hypot(c.x - Island.ICEBERG.x, c.z - Island.ICEBERG.z)).toBeLessThan(5);
    const hd = Island.PLACES.hidden['mush-moon-deck'];
    const d = res.controls.moonDeck;
    expect(Math.hypot(d.x - hd.x, d.z - hd.z)).toBeLessThan(1);
    expect(d.y - Island.heightAt(hd.x, hd.z)).toBeGreaterThan(50);
  });
  it('모래 폭포 자리는 사막 절벽(높이 차 8 m 이상)', () => {
    const sf = sandFallSpot(Island);
    expect(Island.worldSample(sf.x, sf.z).island?.id).toBe('desert');
    expect(sf.drop).toBeGreaterThan(8);
  });
  it('임포스터: 등대 불빛 점 + 발사탑은 단계가 바뀌면 모양을 바꾼다', () => {
    const lh = imps.filter((i) => i.kind === 'lighthouse');
    expect(lh.length).toBe(7);
    expect(lh.every((i) => typeof i.light === 'function')).toBe(true);
    const far = buildImpostors(imps);
    const towerImp = far.root.children.find((m) => m.name === 'imp:launchTower') as THREE.Mesh;
    expect(towerImp).toBeTruthy();
    const tw = res.controls.launchTower;
    const cam = new THREE.Vector3(tw.x + 2000, 30, tw.z);
    res.controls.setTowerStage(0);
    far.update(cam, new THREE.Color('#aaccee'));
    const g0 = towerImp.geometry;
    res.controls.setTowerStage(6);
    far.update(cam, new THREE.Color('#aaccee'));
    expect(towerImp.visible).toBe(true);
    expect(towerImp.geometry).not.toBe(g0);
    expect(towerImp.geometry.attributes.position.count).toBeGreaterThan(g0.attributes.position.count);
  });
  it('밤 anim: 켠 등대는 빛줄기가 돈다', () => {
    res.controls.setLighthouse('home', true);
    const beam = findByName(res.groups, 'lighthouse-beam-home')!;
    for (const a of anims) a.fn(a.o, a.o.quaternion.clone(), 3);
    // 가짜 ctx.tod 는 'day' → 낮이면 빛줄기 꺼짐
    expect(beam.visible).toBe(false);
  });
});
