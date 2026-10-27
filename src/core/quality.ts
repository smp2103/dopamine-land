// 그래픽 품질 단계 — 해상도·후처리·그림자·주변 장식 거리를 한 번에 바꾼다.
// 측정(M 계열, 1600×900 레티나): 높음 56ms → AO 끄면 21ms. AO 가 압도적으로 비싸다.

export type QualityName = 'high' | 'medium' | 'low';

export interface QualityPreset {
  label: string;
  /** 최대 픽셀 비율(레티나 2 → 1 이면 픽셀 수 1/4) */
  pixelRatio: number;
  /** 구석 그늘: off | 반해상도 | 전해상도 */
  ao: 'off' | 'half' | 'full';
  bloom: boolean;
  tilt: boolean;
  smaa: boolean;
  shadows: boolean;
  shadowMap: number;
  /** 장식 청크(풀꽃·나무·산호·벌레) 반경 배율 */
  detail: number;
}

export const QUALITY: Record<QualityName, QualityPreset> = {
  high: { label: '높음', pixelRatio: 2, ao: 'full', bloom: true, tilt: true, smaa: true, shadows: true, shadowMap: 4096, detail: 1 },
  medium: { label: '보통', pixelRatio: 1.5, ao: 'half', bloom: true, tilt: true, smaa: true, shadows: true, shadowMap: 2048, detail: 0.8 },
  low: { label: '낮음', pixelRatio: 1, ao: 'off', bloom: false, tilt: false, smaa: true, shadows: true, shadowMap: 1024, detail: 0.6 },
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
