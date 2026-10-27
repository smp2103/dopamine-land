// 그래픽 품질 단계 — 해상도·후처리·그림자·주변 장식 거리를 한 번에 바꾼다.
// 측정(M 계열, 1600×900 레티나): 높음 56ms → AO 끄면 21ms. AO 가 압도적으로 비싸다.
// 아래 '순수 함수' 구간(장식 반경 판정·청크 예산·픽셀 비율 조절기)은 DOM 없이 tests/perf.test.ts 가 시험한다.

export type QualityName = 'high' | 'medium' | 'low';

export interface QualityPreset {
  label: string;
  /** 최대 픽셀 비율(레티나 2 → 1 이면 픽셀 수 1/4) */
  pixelRatio: number;
  /** 자동 픽셀 비율이 내려갈 수 있는 바닥(버벅일 때만, URL quality= 를 주면 안 내린다) */
  minPixelRatio: number;
  /** 구석 그늘: off | 반해상도 | 전해상도 */
  ao: 'off' | 'half' | 'full';
  bloom: boolean;
  tilt: boolean;
  smaa: boolean;
  shadows: boolean;
  shadowMap: number;
  /** 장식 청크(풀꽃·나무·산호·벌레) 반경 배율 */
  detail: number;
  /** 장식 레이어의 먼 고리(innerRadius 가 있는 LOD 고리)도 만드나 — 낮음은 버린다 */
  farDetail: boolean;
  /** 거리 숨김(chunks.lod) 거리 배율 */
  lod: number;
  /**
   * 작은 것 빼기: 화면에서 (반지름 / 거리) 가 이보다 작은 메시는 그리지 않는다(그림자 패스 포함). 0 = 끔.
   * 0.002 ≈ 1600×900 모험 카메라에서 지름 4 px 쯤(지름 px ≈ 1900 × r/d).
   */
  cull: number;
  /**
   * 그림자 패스의 작은 것 빼기 기준(같은 r/d, cull 보다 크다). 작은 것의 그림자는 몇 픽셀이라 티가 안 나는데 draw call 은 같다.
   * 측정(시작 마을, 보통): 0 → 0.02 에서 draw call 1145 → 966, 화면은 눈으로 구분 안 됨.
   */
  shadowCull: number;
}

export const QUALITY: Record<QualityName, QualityPreset> = {
  high: { label: '높음', pixelRatio: 2, minPixelRatio: 1, ao: 'full', bloom: true, tilt: true, smaa: true, shadows: true, shadowMap: 4096, detail: 1, farDetail: true, lod: 1, cull: 0.001, shadowCull: 0.006 },
  medium: { label: '보통', pixelRatio: 1.5, minPixelRatio: 0.85, ao: 'half', bloom: true, tilt: true, smaa: true, shadows: true, shadowMap: 2048, detail: 0.8, farDetail: true, lod: 0.85, cull: 0.002, shadowCull: 0.02 },
  low: { label: '낮음', pixelRatio: 1, minPixelRatio: 0.7, ao: 'off', bloom: false, tilt: false, smaa: true, shadows: true, shadowMap: 1024, detail: 0.6, farDetail: false, lod: 0.7, cull: 0.003, shadowCull: 0.025 },
};

export const QUALITY_ORDER: QualityName[] = ['high', 'medium', 'low'];

const KEY = 'dopamine-land:quality';

export function isQuality(v: unknown): v is QualityName {
  return typeof v === 'string' && v in QUALITY;
}

/** 저장된 선택(없으면 null — 그때는 자동 측정으로 고른다) */
export function loadQuality(): QualityName | null {
  try {
    const v = localStorage.getItem(KEY);
    return isQuality(v) ? v : null;
  } catch { return null; }
}

export function saveQuality(q: QualityName) {
  try { localStorage.setItem(KEY, q); } catch { /* 저장 불가 환경 */ }
}

// ───────────────────────── 순수 함수(시험 대상) ─────────────────────────

/** 장식 반경 판정에 필요한 레이어 모양(ChunkLayer 의 일부) */
export interface ReachLayer { radius: number; innerRadius?: number; detail?: boolean }
/** 판정에 쓰는 품질 값(QualityPreset 의 일부) */
export interface ReachQuality { detail: number; farDetail: boolean }

/**
 * 레이어 하나만 보고 정한 고리 [안쪽, 바깥] (m). null = 통째로 건너뛴다. (청크 관리자는 사슬을 보는 planReach 를 쓴다)
 * - 장식이 아닌 레이어(지형·충돌·게임 물건)는 품질과 무관하게 그대로.
 * - 장식 레이어는 반경(안쪽 포함)에 detail 배율 — 고리끼리 이어진 채 함께 줄어든다.
 * - farDetail=false(낮음): 안쪽 반경이 있는 먼 고리는 만들지 않는다(가까운 고리만 남김).
 */
export function layerReach(layer: ReachLayer, q: ReachQuality): { inner: number; outer: number } | null {
  if (!layer.detail) return { inner: layer.innerRadius ?? -1, outer: layer.radius };
  if (!q.farDetail && layer.innerRadius !== undefined && layer.innerRadius > 0) return null;
  const k = Number.isFinite(q.detail) && q.detail > 0 ? q.detail : 1;
  return { inner: layer.innerRadius !== undefined ? layer.innerRadius * k : -1, outer: layer.radius * k };
}

/** 이 바깥 반경(m, 배율 전) 이상인 마지막 고리는 '풍경' 고리 — 낮음에서도 남긴다(먼 숲이 통째로 사라지면 섬이 휑하다) */
export const FAR_KEEP_M = 200;

/** 고리 계획에 쓰는 레이어 모양 */
export interface PlanLayer extends ReachLayer { size: number }

/**
 * 레이어 전부의 고리 계획(layerReach 의 묶음판). 같은 칸 크기이고 앞 고리 바깥 = 뒤 고리 안쪽이면 한 줄(LOD 사슬)로 본다.
 * farDetail=false(낮음)일 때 먼 장식 고리(innerRadius > 0)는:
 * - 뒤에 더 먼 고리가 있으면 건너뛰고, 그 뒤 고리가 안쪽 반경을 당겨 와 빈틈을 메운다(가까이도 싼 먼 LOD 로).
 * - 마지막 고리인데 바깥 반경이 FAR_KEEP_M 보다 작으면(먼 풀꽃처럼 자잘한 것) 건너뛴다.
 * - 마지막 '풍경' 고리(먼 숲)는 남긴다.
 * 그 밖에는 layerReach 와 같다. 결과는 layers 와 같은 순서.
 */
export function planReach(layers: PlanLayer[], q: ReachQuality): Array<{ inner: number; outer: number } | null> {
  const out = layers.map((L) => layerReach(L, { ...q, farDetail: true }));
  if (q.farDetail) return out;
  const far = (L: PlanLayer) => !!L.detail && L.innerRadius !== undefined && L.innerRadius > 0;
  // 뒤 고리 찾기: 같은 크기·장식, 안쪽 반경 = 이 고리 바깥 반경
  const next = layers.map((L) => (L.detail ? layers.findIndex((M) => M !== L && M.detail && M.size === L.size && M.innerRadius !== undefined && Math.abs(M.innerRadius - L.radius) < 0.5) : -1));
  const skip = layers.map((L, i) => far(L) && (next[i] >= 0 || L.radius < FAR_KEEP_M));
  const prevOf = (i: number) => next.findIndex((n, j) => n === i && j !== i);
  for (let i = 0; i < layers.length; i++) {
    if (skip[i]) { out[i] = null; continue; }
    const r = out[i];
    if (!far(layers[i]) || !r) continue;
    // 앞쪽으로 건너뛴 고리들의 안쪽 반경까지 당긴다(사슬이 고리 모양으로 꼬여도 레이어 수만큼만)
    let inner = r.inner;
    for (let j = prevOf(i), n = 0; j >= 0 && skip[j] && n < layers.length; j = prevOf(j), n++) {
      const pr = layerReach(layers[j], { ...q, farDetail: true });
      if (pr) inner = Math.min(inner, pr.inner);
    }
    out[i] = { inner, outer: r.outer };
  }
  return out;
}

/** 청크 만들기 예산 조절 값 */
export interface BudgetTune {
  /** 예산 최소·최대·평소(ms) */
  minMs: number;
  maxMs: number;
  baseMs: number;
  /** 이보다 프레임이 길면 예산을 줄인다(ms) */
  slowMs: number;
  /** 이보다 프레임이 짧고 대기 청크가 있으면 예산을 늘린다(ms) */
  fastMs: number;
  /** 줄일 때 곱, 늘릴 때 더함(ms) */
  shrink: number;
  grow: number;
}

/** 60fps(16.7 ms) 목표: 느리면 빨리 줄이고, 여유 있고 밀린 게 있으면 천천히 늘린다 */
export const BUDGET: BudgetTune = { minMs: 1.5, maxMs: 8, baseMs: 4, slowMs: 18, fastMs: 12, shrink: 0.7, grow: 0.25 };

/**
 * 다음 프레임의 청크 예산(ms).
 * frameMs = 최근 프레임 시간(지수 평균), pending = 예산이 모자라 미룬 청크 수.
 * - 느림(> slowMs): 줄인다(바닥 minMs)
 * - 빠름(< fastMs) + 밀림: 늘린다(천장 maxMs)
 * - 그 사이 또는 밀린 게 없음: 평소 값으로 서서히 돌아간다
 */
export function nextBudget(cur: number, frameMs: number, pending: number, o: BudgetTune = BUDGET): number {
  const c = Number.isFinite(cur) ? cur : o.baseMs;
  let n: number;
  if (!Number.isFinite(frameMs) || frameMs <= 0) n = c;
  else if (frameMs > o.slowMs) n = c * o.shrink;
  else if (frameMs < o.fastMs && pending > 0) n = c + o.grow;
  else n = c + (o.baseMs - c) * 0.1;
  return Math.min(o.maxMs, Math.max(o.minMs, n));
}

/** 지수 평균(첫 값이면 그대로) */
export function ema(prev: number | null, x: number, a: number): number {
  return prev === null || !Number.isFinite(prev) ? x : prev + (x - prev) * a;
}

/** 픽셀 비율 조절 값 */
export interface PixelTune {
  /** 이보다 느린 프레임(ms, 평균)이 holdSec 동안 이어지면 한 단계 내린다 */
  slowMs: number;
  holdSec: number;
  /** 내릴 때 곱(올릴 때는 나눔) */
  step: number;
  /**
   * 이보다 빠른 프레임이 recoverSec 동안 이어지면 한 단계 올린다(첫 대기 — 다시 버벅이면 두 배로 늘어난다).
   * 60 Hz 수직동기면 프레임이 16.7 ms 아래로 안 내려가므로 그보다 조금 위.
   */
  fastMs: number;
  recoverSec: number;
  recoverMaxSec: number;
  /** 올렸다가 곧 다시 내린 일이 이만큼 쌓이면 그 단계를 천장으로 삼는다(더는 안 올림) */
  maxBounces: number;
  /** reset 뒤 처음 이만큼(초)은 재지 않는다(로딩·청크 몰아 만들기) */
  warmSec: number;
  /** 평균 계수(프레임마다) */
  smooth: number;
}

export const PIXEL: PixelTune = { slowMs: 22, holdSec: 3, step: 0.8, fastMs: 17.5, recoverSec: 8, recoverMaxSec: 120, maxBounces: 3, warmSec: 4, smooth: 0.1 };

/**
 * 적응형 픽셀 비율 — 프레임 시간이 22 ms 넘게 3초 이어지면 한 단계 내리고, 오래 여유가 있으면 한 단계 올린다.
 * 시간은 밖에서 넣는다(초). 바뀌면 feed 가 새 비율을 돌려준다(아니면 null).
 * 올렸다가 곧 다시 내리면(10초 안) 다음 올림 대기를 두 배로, 그런 일이 maxBounces 번이면 그 단계가 천장 — 왔다 갔다 깜빡임 방지.
 * reset 뒤 warmSec 동안은 재지 않는다.
 */
export class PixelRatioGovernor {
  cap = 1;
  floor = 1;
  current = 1;
  /** 평균 프레임 시간(ms) */
  avg: number | null = null;
  private slowSince = -1;
  private fastSince = -1;
  private recoverWait: number;
  private lastUp = -Infinity;
  private startAt = -1;
  /** 올렸다가 곧 다시 내린 횟수 */
  bounces = 0;
  /** 내린 횟수(디버그) */
  drops = 0;

  constructor(public o: PixelTune = PIXEL) { this.recoverWait = o.recoverSec; }

  /** 품질 단계가 바뀌었을 때: 천장·바닥을 새로 잡고 천장에서 시작 */
  reset(cap: number, floor: number) {
    this.cap = cap;
    this.floor = Math.min(cap, floor);
    this.current = cap;
    this.avg = null;
    this.slowSince = this.fastSince = -1;
    this.recoverWait = this.o.recoverSec;
    this.lastUp = -Infinity;
    this.startAt = -1;
    this.bounces = 0;
  }

  feed(frameMs: number, now: number): number | null {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return null;
    if (this.startAt < 0) this.startAt = now;
    if (now - this.startAt < this.o.warmSec) return null;
    // 탭 전환 같은 긴 멈춤은 버린다(평균만 흐트러진다)
    if (frameMs > 250) { this.slowSince = this.fastSince = -1; return null; }
    const o = this.o;
    this.avg = ema(this.avg, frameMs, o.smooth);
    const a = this.avg;
    if (a > o.slowMs) {
      this.fastSince = -1;
      if (this.slowSince < 0) this.slowSince = now;
      if (now - this.slowSince >= o.holdSec && this.current > this.floor) {
        const next = Math.max(this.floor, round2(this.current * o.step));
        this.slowSince = now;
        if (now - this.lastUp < 10) {
          this.recoverWait = Math.min(o.recoverMaxSec, this.recoverWait * 2);
          // 여러 번 튕기면 이 단계(내린 값)가 이 기계의 천장
          if (++this.bounces >= o.maxBounces) this.cap = next;
        }
        this.drops++;
        return this.set(next);
      }
      return null;
    }
    this.slowSince = -1;
    if (a < o.fastMs && this.current < this.cap) {
      if (this.fastSince < 0) this.fastSince = now;
      if (now - this.fastSince >= this.recoverWait) {
        this.fastSince = now;
        this.lastUp = now;
        return this.set(Math.min(this.cap, round2(this.current / o.step)));
      }
      return null;
    }
    this.fastSince = -1;
    return null;
  }

  private set(v: number): number | null {
    if (v === this.current) return null;
    this.current = v;
    return v;
  }
}

function round2(x: number) { return Math.round(x * 100) / 100; }

/** 작은 것 빼기 판정: 반지름 r 인 구가 eye 에서 거리 d 에 있을 때 그릴 만한가(k = 최소 r/d, 0 이면 늘 그림) */
export function bigEnough(r: number, d: number, k: number): boolean {
  if (!(k > 0)) return true;
  if (d <= r) return true;
  return r >= d * k;
}
