// 성능 손잡이(웨이브 6): 장식 반경 판정·청크 예산·픽셀 비율 조절기·작은 것 빼기·거리 숨김, 그리고 벤치의 범인 모듈·새 정류장.
// 전부 순수 함수(또는 WebGL 없는 three 오브젝트)라 브라우저 없이 돈다.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import {
  QUALITY, QUALITY_ORDER, BUDGET, PIXEL, FAR_KEEP_M, layerReach, planReach, nextBudget, ema, bigEnough, PixelRatioGovernor,
} from '../src/core/quality';
import { ChunkManager, DistanceLod, lodNear, type ChunkLayer } from '../src/core/chunks';

describe('QUALITY 단계', () => {
  it('높음 → 낮음으로 갈수록 장식 반경·거리 숨김 배율이 줄고 작은 것 빼기는 세진다', () => {
    for (let i = 1; i < QUALITY_ORDER.length; i++) {
      const a = QUALITY[QUALITY_ORDER[i - 1]], b = QUALITY[QUALITY_ORDER[i]];
      expect(b.detail).toBeLessThanOrEqual(a.detail);
      expect(b.lod).toBeLessThanOrEqual(a.lod);
      expect(b.cull).toBeGreaterThanOrEqual(a.cull);
      expect(b.pixelRatio).toBeLessThanOrEqual(a.pixelRatio);
    }
  });
  it('낮음만 먼 장식 고리를 버린다', () => {
    expect(QUALITY.high.farDetail).toBe(true);
    expect(QUALITY.medium.farDetail).toBe(true);
    expect(QUALITY.low.farDetail).toBe(false);
  });
  it('픽셀 비율 바닥은 천장 이하이고 0 보다 크다', () => {
    for (const q of QUALITY_ORDER) {
      expect(QUALITY[q].minPixelRatio).toBeGreaterThan(0);
      expect(QUALITY[q].minPixelRatio).toBeLessThanOrEqual(QUALITY[q].pixelRatio);
    }
  });
});

describe('layerReach — 장식 레이어 반경 판정', () => {
  const hi = { detail: 1, farDetail: true }, low = { detail: 0.6, farDetail: false };
  it('장식이 아닌 레이어는 품질과 무관하게 그대로', () => {
    expect(layerReach({ radius: 400 }, low)).toEqual({ inner: -1, outer: 400 });
    expect(layerReach({ radius: 900, innerRadius: 300 }, low)).toEqual({ inner: 300, outer: 900 });
  });
  it('장식 레이어는 안쪽·바깥 반경이 함께 줄어 고리가 이어진다', () => {
    const near = layerReach({ radius: 70, detail: true }, { detail: 0.8, farDetail: true })!;
    const mid = layerReach({ radius: 150, innerRadius: 70, detail: true }, { detail: 0.8, farDetail: true })!;
    expect(near.outer).toBeCloseTo(56);
    expect(mid.inner).toBeCloseTo(near.outer);
    expect(mid.outer).toBeCloseTo(120);
  });
  it('낮음은 안쪽 반경이 있는 먼 장식 고리를 건너뛰고 가까운 고리는 남긴다', () => {
    expect(layerReach({ radius: 390, innerRadius: 150, detail: true }, low)).toBeNull();
    expect(layerReach({ radius: 70, detail: true }, low)).toEqual({ inner: -1, outer: 42 });
    // innerRadius 0 은 '먼 고리'가 아니다
    expect(layerReach({ radius: 100, innerRadius: 0, detail: true }, low)).toEqual({ inner: 0, outer: 60 });
  });
  it('이상한 배율(0·NaN)은 1 로 본다', () => {
    expect(layerReach({ radius: 100, detail: true }, { detail: 0, farDetail: true })!.outer).toBe(100);
    expect(layerReach({ radius: 100, detail: true }, { detail: NaN, farDetail: true })!.outer).toBe(100);
    expect(hi.detail).toBe(1);
  });
});

describe('planReach — 낮음의 LOD 사슬 접기', () => {
  // flora 와 같은 모양: 나무 3단(96 m 칸) + 풀꽃 2단(32 m 칸) + 장식 아닌 지형
  const trees = [
    { size: 96, radius: 70, detail: true },
    { size: 96, radius: 150, innerRadius: 70, detail: true },
    { size: 96, radius: 390, innerRadius: 150, detail: true },
  ];
  const small = [{ size: 32, radius: 44, detail: true }, { size: 32, radius: 100, innerRadius: 44, detail: true }];
  const ground = { size: 64, radius: 900, innerRadius: 300 };
  const all = [...trees, ...small, ground];
  const low = { detail: 0.6, farDetail: false };

  it('높음·보통은 layerReach 와 똑같다', () => {
    const q = { detail: 0.8, farDetail: true };
    expect(planReach(all, q)).toEqual(all.map((l) => layerReach(l, q)));
  });
  it('가운데 고리는 빼고, 먼 풍경 고리가 안쪽을 당겨 와 빈틈이 없다', () => {
    const p = planReach(all, low);
    expect(p[0]).toEqual({ inner: -1, outer: 42 });
    expect(p[1]).toBeNull();
    expect(p[2]!.inner).toBeCloseTo(42);
    expect(p[2]!.outer).toBeCloseTo(234);
  });
  it('자잘한 마지막 먼 고리(바깥 < FAR_KEEP_M)는 뺀다', () => {
    expect(small[1].radius).toBeLessThan(FAR_KEEP_M);
    const p = planReach(all, low);
    expect(p[3]).toEqual({ inner: -1, outer: 44 * 0.6 });
    expect(p[4]).toBeNull();
  });
  it('장식 아닌 레이어는 낮음에서도 그대로', () => {
    expect(planReach(all, low)[5]).toEqual({ inner: 300, outer: 900 });
  });
  it('칸 크기가 다르면 같은 사슬로 보지 않는다', () => {
    const p = planReach([{ size: 32, radius: 70, detail: true }, { size: 96, radius: 390, innerRadius: 70, detail: true }], low);
    expect(p[1]!.inner).toBeCloseTo(42); // 앞 고리를 뺀 게 아니니 자기 안쪽 그대로
    expect(p[0]).not.toBeNull();
  });
  it('네 단 사슬: 가운데 둘을 빼고 마지막이 맨 앞 빈틈까지 메운다', () => {
    const p = planReach([
      { size: 50, radius: 50, detail: true },
      { size: 50, radius: 100, innerRadius: 50, detail: true },
      { size: 50, radius: 200, innerRadius: 100, detail: true },
      { size: 50, radius: 400, innerRadius: 200, detail: true },
    ], { detail: 1, farDetail: false });
    expect(p.map((r) => r && [r.inner, r.outer])).toEqual([[-1, 50], null, null, [50, 400]]);
  });
});

describe('nextBudget — 프레임 시간에 맞춘 청크 예산', () => {
  it('느린 프레임이면 줄고, 바닥 아래로는 안 간다', () => {
    let b = BUDGET.baseMs;
    b = nextBudget(b, 30, 5);
    expect(b).toBeCloseTo(BUDGET.baseMs * BUDGET.shrink);
    for (let i = 0; i < 50; i++) b = nextBudget(b, 30, 5);
    expect(b).toBe(BUDGET.minMs);
  });
  it('여유 있고 밀린 청크가 있으면 늘고, 천장 위로는 안 간다', () => {
    let b = BUDGET.baseMs;
    b = nextBudget(b, 8, 3);
    expect(b).toBeCloseTo(BUDGET.baseMs + BUDGET.grow);
    for (let i = 0; i < 100; i++) b = nextBudget(b, 8, 3);
    expect(b).toBe(BUDGET.maxMs);
  });
  it('밀린 게 없거나 보통 속도면 평소 값으로 서서히 돌아간다', () => {
    let b = BUDGET.maxMs;
    for (let i = 0; i < 200; i++) b = nextBudget(b, 8, 0);
    expect(b).toBeCloseTo(BUDGET.baseMs, 1);
    let c = BUDGET.minMs;
    for (let i = 0; i < 200; i++) c = nextBudget(c, 15, 10);
    expect(c).toBeCloseTo(BUDGET.baseMs, 1);
  });
  it('이상한 입력은 그대로 두거나 평소 값', () => {
    expect(nextBudget(3, NaN, 1)).toBe(3);
    expect(nextBudget(NaN, 10, 0)).toBeCloseTo(BUDGET.baseMs);
    expect(nextBudget(100, 10, 0)).toBe(BUDGET.maxMs);
  });
  it('ema: 첫 값은 그대로, 그 다음은 섞는다', () => {
    expect(ema(null, 10, 0.2)).toBe(10);
    expect(ema(10, 20, 0.5)).toBe(15);
  });
});

describe('PixelRatioGovernor — 적응형 픽셀 비율', () => {
  // 준비 시간 없이(따로 시험) 바로 잰다
  const T = { ...PIXEL, warmSec: 0 };
  /** fps 간격으로 seconds 동안 같은 프레임 시간을 넣고, 바뀐 값들을 모은다 */
  const feed = (g: PixelRatioGovernor, ms: number, seconds: number, t0: number) => {
    const out: number[] = [];
    let t = t0;
    for (; t < t0 + seconds; t += ms / 1000) { const v = g.feed(ms, t); if (v !== null) out.push(v); }
    return { out, t };
  };

  it('22 ms 넘는 프레임이 3초 이어져야 한 단계 내린다', () => {
    const g = new PixelRatioGovernor(T);
    g.reset(2, 1);
    const a = feed(g, 30, 2.5, 0);
    expect(a.out).toEqual([]);
    const b = feed(g, 30, 1.5, a.t);
    expect(b.out).toEqual([2 * PIXEL.step]);
  });
  it('계속 느리면 바닥까지만 내린다', () => {
    const g = new PixelRatioGovernor(T);
    g.reset(1, 0.7);
    const r = feed(g, 40, 60, 0);
    expect(r.out[r.out.length - 1]).toBe(0.7);
    expect(g.current).toBe(0.7);
    expect(r.out.every((v, i) => i === 0 || v < r.out[i - 1])).toBe(true);
  });
  it('잠깐 튀는 프레임(평균이 안 넘음)으로는 안 내린다', () => {
    const g = new PixelRatioGovernor(T);
    g.reset(2, 1);
    let t = 0;
    for (let i = 0; i < 600; i++) { const ms = i % 20 === 0 ? 60 : 12; expect(g.feed(ms, t)).toBeNull(); t += ms / 1000; }
    expect(g.current).toBe(2);
  });
  it('긴 멈춤(탭 전환)은 무시한다', () => {
    const g = new PixelRatioGovernor(T);
    g.reset(2, 1);
    expect(g.feed(5000, 0)).toBeNull();
    expect(g.avg).toBeNull();
  });
  it('여유가 오래 이어지면 한 단계씩 천장까지 되돌린다', () => {
    const g = new PixelRatioGovernor(T);
    g.reset(2, 1);
    const a = feed(g, 30, 4, 0);
    expect(g.current).toBeLessThan(2);
    const b = feed(g, 8, 60, a.t);
    expect(b.out.length).toBeGreaterThan(0);
    expect(g.current).toBe(2);
  });
  it('올리자마자 다시 버벅이면 다음 올림 대기가 두 배가 된다(왔다 갔다 방지)', () => {
    const g = new PixelRatioGovernor(T);
    g.reset(2, 1);
    let r = feed(g, 30, 3.5, 0); // 내림
    r = feed(g, 8, PIXEL.recoverSec + 1, r.t); // 올림
    expect(g.current).toBe(2);
    r = feed(g, 30, 3.5, r.t); // 곧바로 다시 내림(10초 안)
    expect(g.current).toBeLessThan(2);
    // 예전 대기(8초)로는 아직 안 올라간다
    const c = feed(g, 8, PIXEL.recoverSec + 1, r.t);
    expect(c.out).toEqual([]);
    const d = feed(g, 8, PIXEL.recoverSec + 2, c.t);
    expect(d.out.length).toBe(1);
  });
  it('reset 뒤 준비 시간(warmSec)에는 느려도 재지 않는다', () => {
    const g = new PixelRatioGovernor();
    g.reset(2, 1);
    expect(feed(g, 40, PIXEL.warmSec - 0.1, 0).out).toEqual([]);
    expect(g.avg).toBeNull();
    const r = feed(g, 40, PIXEL.holdSec + 0.5, PIXEL.warmSec);
    expect(r.out.length).toBe(1);
  });
  it('60 Hz 수직동기(16.7 ms)에서도 되올릴 수 있다', () => {
    expect(PIXEL.fastMs).toBeGreaterThan(1000 / 60);
  });
  it('여러 번 튕기면 그 단계가 천장이 된다', () => {
    const g = new PixelRatioGovernor(T);
    g.reset(2, 1);
    let t = 0;
    for (let i = 0; i < PIXEL.maxBounces + 2; i++) {
      t = feed(g, 30, 3.5, t).t; // 내림
      // 올라갈 때까지만 빠르게(올린 직후 다시 버벅이게)
      for (let k = 0; k < 200000 && g.current < g.cap; k++, t += 0.008) g.feed(8, t);
    }
    expect(g.bounces).toBeGreaterThanOrEqual(PIXEL.maxBounces);
    expect(g.cap).toBeLessThan(2);
    expect(g.current).toBe(g.cap);
  });
  it('reset 은 천장에서 다시 시작하고 바닥은 천장을 넘지 않는다', () => {
    const g = new PixelRatioGovernor(T);
    g.reset(1, 1.5);
    expect(g.current).toBe(1);
    expect(g.floor).toBe(1);
    expect(feed(g, 40, 10, 0).out).toEqual([]);
  });
});

describe('bigEnough — 작은 것 빼기', () => {
  it('k=0 이면 늘 그린다', () => { expect(bigEnough(0.001, 1e6, 0)).toBe(true); });
  it('반지름/거리 가 k 보다 작으면 뺀다', () => {
    expect(bigEnough(0.05, 10, 0.002)).toBe(true); // 0.005
    expect(bigEnough(0.05, 30, 0.002)).toBe(false); // 0.0017
  });
  it('눈이 구 안에 있으면 늘 그린다', () => { expect(bigEnough(5, 3, 0.5)).toBe(true); });
});

describe('DistanceLod — 거리 숨김', () => {
  it('lodNear: 경계에서 깜빡이지 않게 이력을 둔다', () => {
    expect(lodNear(true, 100, 100)).toBe(true);
    expect(lodNear(true, 101, 100)).toBe(false);
    expect(lodNear(false, 95, 100)).toBe(false);
    expect(lodNear(false, 91, 100)).toBe(true);
  });
  it('멀면 숨기고, 돌아오면 자기가 숨긴 것만 되살린다', () => {
    const lod = new DistanceLod();
    const a = new THREE.Group(); a.position.set(100, 0, 0); a.updateMatrixWorld();
    const b = new THREE.Group(); b.position.set(100, 0, 0); b.visible = false; b.updateMatrixWorld();
    const seen: boolean[] = [];
    lod.register(a, 50, { onChange: (n) => seen.push(n) });
    lod.register(b, 50);
    lod.update(new THREE.Vector3(0, 0, 0));
    expect(a.visible).toBe(false);
    expect(lod.stats()).toEqual({ total: 2, hidden: 2 });
    lod.update(new THREE.Vector3(90, 0, 0));
    expect(a.visible).toBe(true);
    expect(b.visible).toBe(false); // 모듈이 숨긴 것은 그대로
    expect(seen).toEqual([false, true]);
  });
  it('고정 위치(at)·배율·해제', () => {
    const lod = new DistanceLod();
    const o = new THREE.Group();
    const off = lod.register(o, 100, { at: { x: 0, z: 80 } });
    lod.update(new THREE.Vector3(0, 0, 0), 0.7); // far 70 < 80 → 숨김
    expect(o.visible).toBe(false);
    expect(lod.isNear(o)).toBe(false);
    lod.update(new THREE.Vector3(0, 0, 0), 1); // 배율이 바뀌면 바로 다시 본다(92 > 80 → 보임)
    expect(o.visible).toBe(true);
    lod.update(new THREE.Vector3(0, 0, 0), 0.7);
    off();
    expect(o.visible).toBe(true); // 해제하면 되살린다
    expect(lod.entries.length).toBe(0);
  });
  it('한 프레임에 maxPerFrame 개씩만 본다', () => {
    const lod = new DistanceLod();
    lod.maxPerFrame = 3;
    const objs = Array.from({ length: 7 }, () => { const o = new THREE.Group(); o.position.set(500, 0, 0); o.updateMatrixWorld(); lod.register(o, 10); return o; });
    lod.update(new THREE.Vector3());
    expect(objs.filter((o) => !o.visible).length).toBe(3);
    lod.update(new THREE.Vector3());
    lod.update(new THREE.Vector3());
    expect(objs.filter((o) => !o.visible).length).toBe(7);
  });
});

describe('ChunkManager — 품질 판정이 실제 만들기에 걸린다', () => {
  const mk = () => {
    const m = new ChunkManager();
    const built: Record<string, number> = {};
    const layer = (key: string, o: Partial<ChunkLayer>): ChunkLayer => ({
      key, size: 32, radius: 100, build: () => { built[key] = (built[key] ?? 0) + 1; return null; }, ...o,
    });
    m.add(layer('ground', { radius: 100 }));
    m.add(layer('deco-near', { radius: 100, detail: true }));
    m.add(layer('deco-far', { radius: 200, innerRadius: 100, detail: true }));
    return { m, built };
  };
  it('높음: 먼 장식 고리도 만든다', () => {
    const { m, built } = mk();
    m.update(new THREE.Vector3(), true);
    expect(built['deco-far']).toBeGreaterThan(0);
    expect(built['deco-near']).toBe(built.ground);
  });
  it('낮음: 가운데 고리는 건너뛰고 먼 풍경 고리가 메운다, 가까운 장식은 반경이 준다', () => {
    const { m, built } = mk();
    m.add({ key: 'deco-lo', size: 32, radius: 400, innerRadius: 200, detail: true, build: () => { built['deco-lo'] = (built['deco-lo'] ?? 0) + 1; return null; } });
    m.detail = 0.6; m.farDetail = false;
    m.update(new THREE.Vector3(), true);
    expect(built['deco-far'] ?? 0).toBe(0);
    expect(built['deco-lo']).toBeGreaterThan(0);
    expect(built['deco-near']).toBeLessThan(built.ground);
    // 빈틈 없음: deco-lo 가 가까운 고리 바깥(60 m)부터 만든다
    expect(m.reachPlan()[3]!.inner).toBeCloseTo(60);
  });
  it('품질을 낮추면 이미 만든 가운데 고리 청크를 버린다', () => {
    const { m } = mk();
    m.add({ key: 'deco-lo', size: 32, radius: 400, innerRadius: 200, detail: true, build: () => null });
    m.update(new THREE.Vector3(), true);
    const far = m.layers.find((l) => l.layer.key === 'deco-far')!;
    expect(far.live.size).toBeGreaterThan(0);
    m.farDetail = false;
    m.update(new THREE.Vector3(), true);
    expect(far.live.size).toBe(0);
  });
  it('예산: 강제 갱신은 예산을 건드리지 않고, adaptive=false 면 고정', () => {
    const { m } = mk();
    const b0 = m.budgetMs;
    m.update(new THREE.Vector3(), true);
    expect(m.budgetMs).toBe(b0);
    m.adaptive = false; m.budgetMs = 6;
    m.update(new THREE.Vector3()); m.update(new THREE.Vector3());
    expect(m.budgetMs).toBe(6);
  });
});

// ───────── 벤치(scripts/bench.mjs)의 새 부분 ─────────
interface Mod { meshes: number; tris: number }
interface StopRes { ms: number; calls: number; tris: number; layers: Record<string, { chunks: number; objects: number; meshes: number; tris: number }>; modules?: Record<string, Mod>; skipped?: string }
interface BenchLib {
  DEFAULT_STOPS: Array<{ id: string }>;
  EXTRA_STOPS: Array<{ id: string; q?: string; eval?: string; need?: string }>;
  ALL_STOPS: Array<{ id: string }>;
  mergeStops(base: unknown[], extra: unknown): Array<{ id: string }>;
  offendingModules(cur: StopRes, base: StopRes | null, o?: { top?: number; sortBy?: 'meshes' | 'tris' }): Array<{ key: string; meshes: number; dMeshes: number | null }>;
  compareRuns(cur: unknown, base: unknown): { ok: boolean; failures: Array<{ kind: string; stop: string; modules?: Array<{ key: string }> }>; warnings: string[] };
  formatFailures(res: unknown): string;
  formatTable(cur: unknown, base?: unknown): string;
}
let B: BenchLib;
beforeAll(async () => {
  const spec: string = '../scripts/bench.mjs';
  B = (await import(/* @vite-ignore */ spec)) as BenchLib;
});

describe('벤치 — 웨이브 6 정류장', () => {
  it('요청된 정류장이 다 있고 기준 8곳은 그대로 앞에 있다', () => {
    const ids = B.EXTRA_STOPS.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['reef-dive', 'desert-sandstorm', 'planet', 'boat-band', 'house-interior', 'moon-village']));
    expect(B.ALL_STOPS.slice(0, B.DEFAULT_STOPS.length).map((s) => s.id)).toEqual(B.DEFAULT_STOPS.map((s) => s.id));
    expect(new Set(B.ALL_STOPS.map((s) => s.id)).size).toBe(B.ALL_STOPS.length);
  });
  it('정류장은 mergeStops 검사를 통과한다(eval 은 문자열, need 는 훅 이름)', () => {
    expect(() => B.mergeStops([], B.EXTRA_STOPS)).not.toThrow();
    expect(B.EXTRA_STOPS.find((s) => s.id === 'planet')?.need).toBe('__planets');
    expect(() => B.mergeStops([], [{ id: 'x', need: 3 }])).toThrow();
  });
});

describe('벤치 — 범인 모듈', () => {
  const s = (modules: Record<string, Mod>, o: Partial<StopRes> = {}): StopRes => ({ ms: 10, calls: 400, tris: 1e6, layers: {}, modules, ...o });
  it('기준선 없으면 보이는 메시 많은 순', () => {
    const r = B.offendingModules(s({ 'mod:a': { meshes: 5, tris: 10 }, 'mod:b': { meshes: 50, tris: 1 }, 'mod:c': { meshes: 0, tris: 0 } }), null);
    expect(r.map((x) => x.key)).toEqual(['mod:b', 'mod:a']);
    expect(r[0].dMeshes).toBeNull();
  });
  it('기준선이 있으면 늘어난 것만, 새 모듈은 통째로 증가', () => {
    const base = s({ 'mod:a': { meshes: 40, tris: 10 }, 'mod:b': { meshes: 10, tris: 10 } });
    const r = B.offendingModules(s({ 'mod:a': { meshes: 30, tris: 10 }, 'mod:b': { meshes: 25, tris: 10 }, 'mod:new': { meshes: 8, tris: 5 } }), base);
    expect(r.map((x) => [x.key, x.dMeshes])).toEqual([['mod:b', 15], ['mod:new', 8]]);
  });
  it('높음 한도 실패에 범인 모듈이 붙고 출력에도 찍힌다', () => {
    const cur = { presets: { high: { stops: { v: s({ 'mod:village': { meshes: 300, tris: 2e6 } }, { calls: 1000 }) } } } };
    const res = B.compareRuns(cur, null);
    expect(res.failures[0].kind).toBe('calls-limit');
    expect(res.failures[0].modules?.[0].key).toBe('mod:village');
    expect(B.formatFailures(res)).toContain('mod:village');
  });
  it('건너뛴 정류장은 실패가 아니라 경고', () => {
    const cur = { presets: { high: { stops: { planet: { skipped: '__planets 없음' } } } } };
    const res = B.compareRuns(cur, null);
    expect(res.ok).toBe(true);
    expect(res.warnings.join()).toContain('건너뜀');
    expect(B.formatTable(cur)).toContain('건너뜀');
  });
});
