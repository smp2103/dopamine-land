// 벤치: 순수 판정 함수(한도·기준선 회귀·범인 레이어)와 정류장 합치기. 브라우저 없이 scripts/bench.mjs 의 export 만 쓴다.
import { describe, it, expect, beforeAll } from 'vitest';

interface Layer { chunks: number; objects: number; meshes: number; tris: number }
interface StopRes { ms: number; msP90?: number; fps?: number; calls: number; callsMax?: number; tris: number; trisMax?: number; pending?: number; heapMB?: number | null; layers: Record<string, Layer>; error?: string }
interface Run { env?: Record<string, unknown>; presets: Record<string, { stops: Record<string, StopRes | { error: string }> }> }
interface Failure { preset: string; stop: string; kind: string; cur: number | string; base?: number; limit?: number; hasBase?: boolean; layers: Array<{ key: string; dMeshes: number | null; dObjects: number | null }> }
interface Stop { id: string; label?: string; q?: string; eval?: string }
interface BenchLib {
  LIMITS: { calls: number; tris: number };
  DEFAULT_STOPS: Stop[];
  parseArgs(argv: string[]): Record<string, string>;
  mergeStops(base: Stop[], extra: unknown): Stop[];
  stopUrl(base: string, preset: string, stop: Stop, o?: { frozen?: boolean }): string;
  median(xs: number[]): number;
  percentile(xs: number[], p: number): number;
  summarize(raw: { dts: number[]; calls: number[]; tris: number[]; pending: number[]; heap?: number | null; layers?: Record<string, Layer> }): StopRes;
  offendingLayers(cur: StopRes, base: StopRes | null, opts?: number | { top?: number; sortBy?: 'meshes' | 'tris'; growth?: boolean }): Array<{ key: string; dMeshes: number | null; dObjects: number | null; meshes: number; tris: number }>;
  compareRuns(cur: Run, base: Run | null, tol?: Partial<{ calls: number; ms: number; msFloor: number }>): { ok: boolean; failures: Failure[]; warnings: string[] };
  formatTable(cur: Run, base?: Run | null): string;
  formatFailures(res: { failures: Failure[]; warnings: string[] }): string;
  chromiumArgs(platform: string): string[];
}

// .mjs 라 타입 선언이 없다 — 경로를 문자열로 넘겨 위 인터페이스로 받는다
let B: BenchLib;
beforeAll(async () => {
  const spec: string = '../scripts/bench.mjs';
  B = (await import(/* @vite-ignore */ spec)) as BenchLib;
});

const L = (meshes: number, objects = meshes * 2, tris = meshes * 100, chunks = 4): Layer => ({ chunks, objects, meshes, tris });
const stop = (o: Partial<StopRes> = {}): StopRes => ({ ms: 10, calls: 400, tris: 1_000_000, layers: { trees: L(50), grass: L(20) }, ...o });
const run = (stops: Record<string, Record<string, StopRes | { error: string }>>): Run =>
  ({ presets: Object.fromEntries(Object.entries(stops).map(([p, s]) => [p, { stops: s }])) });

describe('compareRuns — 절대 한도(높음)', () => {
  it('기준선 없이 높음의 calls 900·tris 4M 이상이면 실패', () => {
    const r = B.compareRuns(run({ high: { a: stop({ calls: 900 }), b: stop({ tris: 4_000_000 }), c: stop({ calls: 899, tris: 3_999_999 }) } }), null);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => `${f.stop}:${f.kind}`).sort()).toEqual(['a:calls-limit', 'b:tris-limit']);
  });
  it('보통·낮음은 절대 한도를 보지 않는다', () => {
    const r = B.compareRuns(run({ medium: { a: stop({ calls: 1200, tris: 5e6 }) }, low: { a: stop({ calls: 950 }) } }), null);
    expect(r.ok).toBe(true);
  });
  it('기준선이 없으면 범인 레이어는 현재 메시 많은 순', () => {
    const r = B.compareRuns(run({ high: { a: stop({ calls: 950 }) } }), null);
    expect(r.failures[0].layers.map((l) => l.key)).toEqual(['trees', 'grass']);
    expect(r.failures[0].layers[0].dMeshes).toBeNull();
  });
});

describe('compareRuns — 기준선 회귀(+10%)', () => {
  const base = run({ high: { a: stop() }, low: { a: stop({ ms: 5, calls: 200 }) } });

  it('정확히 +10% 는 통과, 넘으면 실패', () => {
    expect(B.compareRuns(run({ high: { a: stop({ calls: 440, ms: 11 }) } }), base).ok).toBe(true);
    const r = B.compareRuns(run({ high: { a: stop({ calls: 441 }) } }), base);
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatchObject({ preset: 'high', stop: 'a', kind: 'calls-regress', cur: 441, base: 400 });
  });
  it('ms 는 10% 넘고 msFloor(기본 1ms)도 넘어야 실패 — 잡음 방지', () => {
    // 5ms → 5.9ms: 18% 지만 +0.9ms 라 통과
    expect(B.compareRuns(run({ low: { a: stop({ ms: 5.9, calls: 200 }) } }), base).ok).toBe(true);
    const r = B.compareRuns(run({ low: { a: stop({ ms: 6.1, calls: 200 }) } }), base);
    expect(r.failures.map((f) => f.kind)).toEqual(['ms-regress']);
    // floor 0 이면 순수 10%
    expect(B.compareRuns(run({ low: { a: stop({ ms: 5.6, calls: 200 }) } }), base, { msFloor: 0 }).ok).toBe(false);
  });
  it('허용치를 바꿀 수 있다', () => {
    expect(B.compareRuns(run({ high: { a: stop({ calls: 480 }) } }), base, { calls: 0.25 }).ok).toBe(true);
  });
  it('줄어든 건 언제나 통과', () => {
    expect(B.compareRuns(run({ high: { a: stop({ calls: 100, ms: 2, tris: 10 }) } }), base).ok).toBe(true);
  });
  it('범인 레이어: 늘어난 레이어만, 많이 늘어난 순, 새 레이어도 포함', () => {
    const cur = stop({ calls: 600, layers: { trees: L(52), grass: L(80), boats: L(5) } });
    const r = B.compareRuns(run({ high: { a: cur } }), base);
    const keys = r.failures[0].layers.map((l) => l.key);
    expect(keys[0]).toBe('grass');
    expect(keys).toContain('boats');
    expect(keys).toContain('trees');
    expect(r.failures[0].layers.find((l) => l.key === 'grass')!.dMeshes).toBe(60);
  });
  it('기준선이 있어도 한도 초과면 현재 큰 레이어를 보여 준다(안 늘었어도)', () => {
    // 기준선과 똑같은데 한도를 넘는 경우 — 늘어난 레이어가 없어도 범인 목록은 비면 안 됨
    const same = stop({ calls: 950, tris: 5e6, layers: { trees: L(50), grass: L(20), reef: L(3, 6, 4_000_000) } });
    const r = B.compareRuns(run({ high: { a: same } }), run({ high: { a: same } }));
    const calls = r.failures.find((f) => f.kind === 'calls-limit')!;
    const tris = r.failures.find((f) => f.kind === 'tris-limit')!;
    expect(calls.layers.map((l) => l.key)).toEqual(['trees', 'grass', 'reef']);
    expect(calls.layers[0].dMeshes).toBe(0);
    // 삼각형 한도는 삼각형 많은 순 — 메시 적은 reef 가 맨 앞
    expect(tris.layers[0].key).toBe('reef');
    expect(B.formatFailures(r)).toContain('reef');
  });
  it('offendingLayers: sortBy tris·top 자르기, 숫자 top 도 받는다', () => {
    const cur = stop({ layers: { a: L(10, 20, 10), b: L(1, 2, 9000), c: L(5) } });
    expect(B.offendingLayers(cur, null, { sortBy: 'tris', top: 2 }).map((l) => l.key)).toEqual(['b', 'c']);
    expect(B.offendingLayers(cur, null, 1).map((l) => l.key)).toEqual(['a']);
  });
  it('기준선에 없는 정류장의 한도 초과는 레이어마다 "기준선에 없는 레이어"를 붙이지 않는다', () => {
    const r = B.compareRuns(run({ high: { a: stop(), desert: stop({ calls: 950 }) } }), run({ high: { a: stop() } }));
    const f = B.formatFailures(r);
    expect(f).toContain('high/desert');
    expect(f).toContain('(새 정류장)');
    expect(f).not.toContain('기준선에 없는 레이어');
    expect(f).toContain('trees');
  });
  it('새 정류장·새 단계는 경고만', () => {
    const r = B.compareRuns(run({ high: { a: stop(), island: stop() }, medium: { a: stop() } }), base);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('high/island'))).toBe(true);
    expect(r.warnings.some((w) => w.includes("'medium'"))).toBe(true);
  });
  it('측정 실패는 실패, 기준선 쪽 실패는 새 정류장처럼 경고', () => {
    const r = B.compareRuns(run({ high: { a: { error: '준비 실패' } } }), base);
    expect(r.failures[0].kind).toBe('error');
    const r2 = B.compareRuns(run({ high: { a: stop({ calls: 99 }) } }), run({ high: { a: { error: 'x' } } }));
    expect(r2.ok).toBe(true);
    expect(r2.warnings.length).toBe(1);
  });
  it('해상도·GPU 가 다르면 경고', () => {
    const cur = { ...run({ high: { a: stop() } }), env: { w: 1600, h: 900, dpr: 1, gpu: 'A', live: true } };
    const b = { ...base, env: { w: 1280, h: 720, dpr: 1, gpu: 'B', live: true } };
    const r = B.compareRuns(cur, b);
    expect(r.warnings.length).toBe(2);
  });
});

describe('정류장·인자', () => {
  it('parseArgs: 값·플래그', () => {
    expect(B.parseArgs(['--compare', '--presets', 'high,low', '--write-baseline'])).toEqual({ compare: '1', presets: 'high,low', 'write-baseline': '1' });
  });
  it('기본 정류장 8곳, id 중복 없음', () => {
    const ids = B.DEFAULT_STOPS.map((s) => s.id);
    expect(ids).toEqual(['home-village', 'home-wild', 'dino-valley', 'coral-coast', 'mushroom-night', 'desert', 'launch-pad', 'moon']);
    expect(B.DEFAULT_STOPS.find((s) => s.id === 'mushroom-night')!.q).toContain('hour=22');
    expect(B.DEFAULT_STOPS.find((s) => s.id === 'moon')!.q).toContain('world=space');
  });
  it('mergeStops: 추가·덮어쓰기·replace·잘못된 입력', () => {
    const add = B.mergeStops(B.DEFAULT_STOPS, [{ id: 'ice', q: 'spawn=ice' }, { id: 'moon', q: 'world=space&hour=3' }]);
    expect(add.length).toBe(9);
    expect(add.find((s) => s.id === 'moon')!.q).toBe('world=space&hour=3');
    expect(add.at(-1)).toMatchObject({ id: 'ice', label: 'ice' });
    expect(B.mergeStops(B.DEFAULT_STOPS, { replace: true, stops: [{ id: 'mars', eval: 'x()' }] })).toEqual([{ id: 'mars', label: 'mars', q: '', eval: 'x()' }]);
    expect(() => B.mergeStops([], [{ q: 'x' }])).toThrow();
    expect(() => B.mergeStops([], { nope: 1 })).toThrow();
    // 원본은 건드리지 않는다
    expect(B.DEFAULT_STOPS.find((s) => s.id === 'moon')!.q).toBe('world=space');
  });
  it('stopUrl: 촬영·live·저장 무시·품질', () => {
    expect(B.stopUrl('http://h:1', 'low', { id: 'x', q: 'spawn=dino' })).toBe('http://h:1/?shot=1&live=1&fresh=1&quality=low&spawn=dino');
    expect(B.stopUrl('http://h:1/', 'high', { id: 'x' }, { frozen: true })).toBe('http://h:1/?shot=1&fresh=1&quality=high');
  });
  it('chromiumArgs: 맥 metal, 윈도 d3d11, 그 밖엔 ANGLE 지정 없음', () => {
    expect(B.chromiumArgs('darwin')).toContain('--use-angle=metal');
    expect(B.chromiumArgs('win32')).toContain('--use-angle=d3d11');
    expect(B.chromiumArgs('linux').some((a) => a.startsWith('--use-angle'))).toBe(false);
  });
});

describe('통계·출력', () => {
  it('median·percentile', () => {
    expect(B.median([3, 1, 2])).toBe(2);
    expect(B.median([4, 1, 2, 3])).toBe(2.5);
    expect(Number.isNaN(B.median([]))).toBe(true);
    expect(B.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
  });
  it('summarize: 중앙값·최댓값·힙 MB', () => {
    const s = B.summarize({ dts: [10, 20, 30], calls: [100, 300, 200], tris: [5, 7, 6], pending: [0, 2, 1], heap: 100 * 1048576, layers: { a: L(1) } });
    expect(s).toMatchObject({ ms: 20, fps: 50, calls: 200, callsMax: 300, tris: 6, trisMax: 7, pending: 2, heapMB: 100 });
    expect(B.summarize({ dts: [1], calls: [1], tris: [1], pending: [], heap: null }).heapMB).toBeNull();
  });
  it('formatTable·formatFailures 가 정류장과 범인 레이어를 보여 준다', () => {
    const base = run({ high: { a: stop() } });
    const cur = run({ high: { a: stop({ calls: 990, layers: { trees: L(50), grass: L(90) } }), b: { error: '준비 실패' } } });
    const t = B.formatTable(cur, base);
    expect(t).toContain('a');
    expect(t).toContain('+148%');
    expect(t).toContain('오류: 준비 실패');
    const f = B.formatFailures(B.compareRuns(cur, base));
    expect(f).toContain('high/a');
    expect(f).toContain('draw call 한도');
    expect(f).toContain('grass');
    expect(f).toContain('메시 +70');
  });
});
