// 시간대별 조명·하늘·후처리 값. 룩 조정은 여기서.
export interface TodPreset {
  /** 해 방위각(도, 0 = +x, 90 = -z 쪽), 고도(도) */
  sunAzimuth: number;
  sunElevation: number;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  envIntensity: number;
  skyTop: string;
  skyHorizon: string;
  skyBottom: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  exposure: number;
  bloomIntensity: number;
  bloomThreshold: number;
  saturation: number;
  /** 색보정: 어두운 곳을 띄우는 색 / 밝은 곳에 곱하는 색(sRGB hex) */
  gradeLift: string;
  gradeGain: string;
  contrast: number;
  brightness: number;
  aoIntensity: number;
  aoColor: string;
  shadowRadius: number;
  vignette: number;
  /** 그림자 없는 약한 역광(실루엣 띄우기) */
  rimColor: string;
  rimIntensity: number;
  /** 하늘 해 쪽 번짐(아침·노을) */
  sunGlow: number;
  /** 구름: 빛 받는 면 / 그늘 면 / 전체 불투명도 */
  cloudLit: string;
  cloudShade: string;
  cloudOpacity: number;
  /** 별 밝기(0 = 없음) */
  stars: number;
  /** 생기: 꽃가루·나비·반딧불이 양(0..1) */
  pollen: number;
  butterflies: number;
  fireflies: number;
  /** 은하수 밝기 / 별 촘촘함(1 = 기본) / 해 원반 / 달 / 지평선 공기 띠(0..1) — 없으면 0·1 */
  milky?: number;
  starDensity?: number;
  sunDisc?: number;
  moon?: number;
  hazeBand?: number;
  /** 게임(넓은 세계) 안개 거리 — 없으면 engine.fogOverride */
  worldFog?: { near: number; far: number };
}

export const TOD: Record<string, TodPreset> = {
  // 낮: 맑고 밝게, 그림자는 하늘빛이 고여 푸르스름
  day: {
    sunAzimuth: 235, sunElevation: 55,
    sunColor: '#fff4e0', sunIntensity: 2.5,
    hemiSky: '#b4dcff', hemiGround: '#9cc57a', hemiIntensity: 1.25,
    envIntensity: 0.6,
    skyTop: '#3d9cec', skyHorizon: '#c6eafd', skyBottom: '#dcf3ff',
    fogColor: '#c8eafc', fogNear: 40, fogFar: 150,
    milky: 0, sunDisc: 0.55, hazeBand: 0.55, worldFog: { near: 20, far: 1150 },
    exposure: 1.0,
    bloomIntensity: 0.3, bloomThreshold: 1.6,
    gradeLift: '#0c1c38', gradeGain: '#fff8ea',
    saturation: 0.06, contrast: 0.05, brightness: 0.0,
    aoIntensity: 1.8, aoColor: '#28466a',
    shadowRadius: 4, vignette: 0.22,
    rimColor: '#fff6e8', rimIntensity: 0.55,
    sunGlow: 0.0,
    cloudLit: '#ffffff', cloudShade: '#b9d6f2', cloudOpacity: 1,
    stars: 0,
    pollen: 0.7, butterflies: 1, fireflies: 0,
  },
  // 아침: 낮은 해, 복숭아빛
  morning: {
    sunAzimuth: 205, sunElevation: 24,
    sunColor: '#ffd9b0', sunIntensity: 2.3,
    hemiSky: '#c9dcff', hemiGround: '#b4b585', hemiIntensity: 1.15,
    envIntensity: 0.6,
    skyTop: '#6eaeee', skyHorizon: '#ffdcc4', skyBottom: '#ffe9da',
    fogColor: '#f6e2d6', fogNear: 35, fogFar: 130,
    milky: 0, sunDisc: 0.8, hazeBand: 0.6, worldFog: { near: 35, far: 1100 },
    exposure: 1.02,
    bloomIntensity: 0.4, bloomThreshold: 1.45,
    gradeLift: '#1f1430', gradeGain: '#fff0e2',
    saturation: 0.04, contrast: 0.03, brightness: 0.01,
    aoIntensity: 1.7, aoColor: '#4a3a5a',
    shadowRadius: 5, vignette: 0.22,
    rimColor: '#ffd8b8', rimIntensity: 0.7,
    sunGlow: 0.35,
    cloudLit: '#fff1e4', cloudShade: '#d6c4dc', cloudOpacity: 1,
    stars: 0,
    pollen: 1, butterflies: 0.7, fireflies: 0,
  },
  // 노을: 낮게 깔린 금빛 해(긴 그림자·금빛 가장자리), 풀은 노랑-연두로 살아 있게, 분홍은 하늘에만
  sunset: {
    sunAzimuth: 300, sunElevation: 8,
    sunColor: '#ffb070', sunIntensity: 2.9,
    hemiSky: '#d4c4e0', hemiGround: '#d8b878', hemiIntensity: 1.1,
    envIntensity: 0.5,
    skyTop: '#6a7ed6', skyHorizon: '#ffb98a', skyBottom: '#ffd2a8',
    fogColor: '#f3c7a4', fogNear: 36, fogFar: 140,
    milky: 0, sunDisc: 1, hazeBand: 0.4, worldFog: { near: 45, far: 1100 },
    exposure: 1.04,
    bloomIntensity: 0.55, bloomThreshold: 1.3,
    gradeLift: '#221a3a', gradeGain: '#fff3d2',
    saturation: 0.19, contrast: 0.05, brightness: 0.01,
    aoIntensity: 1.7, aoColor: '#4a2f58',
    shadowRadius: 5, vignette: 0.24,
    rimColor: '#ffc078', rimIntensity: 1.25,
    sunGlow: 0.7,
    cloudLit: '#ffd0a6', cloudShade: '#b6a0d6', cloudOpacity: 1,
    stars: 0.1,
    pollen: 0.5, butterflies: 0.4, fireflies: 0.2,
  },
  // 밤: 포근한 라벤더 달빛 — 물체 색은 남기고(블루 틴트 약하게), 달 그림자·별·은하수, 따뜻한 불빛은 번진다
  night: {
    sunAzimuth: 250, sunElevation: 38,
    sunColor: '#dcd8ff', sunIntensity: 1.35,
    hemiSky: '#a49cc8', hemiGround: '#5a4a62', hemiIntensity: 1.05,
    envIntensity: 0.5,
    skyTop: '#0b0f3a', skyHorizon: '#3a4790', skyBottom: '#4a4f98',
    fogColor: '#3a4282', fogNear: 30, fogFar: 130,
    milky: 0.9, starDensity: 1.6, moon: 1, hazeBand: 0.3, worldFog: { near: 40, far: 1000 },
    exposure: 1.5,
    bloomIntensity: 0.9, bloomThreshold: 1.0,
    gradeLift: '#16123a', gradeGain: '#efe8ff',
    saturation: 0.05, contrast: 0.05, brightness: 0.0,
    aoIntensity: 1.4, aoColor: '#120f34',
    shadowRadius: 4, vignette: 0.3,
    rimColor: '#b8b8ff', rimIntensity: 0.75,
    sunGlow: 0.0,
    cloudLit: '#6670b0', cloudShade: '#262a5c', cloudOpacity: 0.9,
    stars: 1,
    pollen: 0, butterflies: 0, fireflies: 1,
  },
  /** 우주(달 표면): 검은 하늘·촘촘한 별·은하수, 하얗고 강한 햇빛(공기 없음 → 안개 없음) */
  space: {
    sunAzimuth: 210, sunElevation: 32,
    sunColor: '#fff8ee', sunIntensity: 3.0,
    hemiSky: '#3a4566', hemiGround: '#1a1a22', hemiIntensity: 0.55,
    envIntensity: 0.3,
    skyTop: '#000003', skyHorizon: '#05060f', skyBottom: '#020205',
    fogColor: '#05060f', fogNear: 6000, fogFar: 9000,
    milky: 1.25, starDensity: 3.2, sunDisc: 1, moon: 0, hazeBand: 0, worldFog: { near: 9000, far: 20000 },
    exposure: 1.0,
    bloomIntensity: 0.8, bloomThreshold: 1.15,
    gradeLift: '#03050e', gradeGain: '#f4f6ff',
    saturation: 0.08, contrast: 0.06, brightness: 0.0,
    aoIntensity: 1.6, aoColor: '#05060f',
    shadowRadius: 3, vignette: 0.35,
    rimColor: '#9fb8ff', rimIntensity: 0.8,
    sunGlow: 0.0,
    cloudLit: '#ffffff', cloudShade: '#b9d6f2', cloudOpacity: 0,
    stars: 1.3,
    pollen: 0, butterflies: 0, fireflies: 0,
  },
};

/** 시간 흐름(tod=auto): atmosphere 모듈이 매 프레임 프리셋 사이를 보간해 이 객체를 채운다 */
TOD.auto = { ...TOD.day };

/** 두 프리셋 보간(색은 sRGB hex 끼리 선형, 수치는 선형) */
export function lerpPreset(a: TodPreset, b: TodPreset, t: number, out: TodPreset = { ...a }): TodPreset {
  const o = out as unknown as Record<string, unknown>;
  const A = a as unknown as Record<string, unknown>, B = b as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) {
    const va = A[k], vb = B[k];
    if (typeof va === 'number' || typeof vb === 'number') {
      const x = typeof va === 'number' ? va : 0, y = typeof vb === 'number' ? vb : 0;
      o[k] = x + (y - x) * t;
    } else if (typeof va === 'string' && typeof vb === 'string' && va[0] === '#') {
      o[k] = lerpHex(va, vb, t);
    } else if (va && vb && typeof va === 'object') {
      const fa = va as { near: number; far: number }, fb = vb as { near: number; far: number };
      o[k] = { near: fa.near + (fb.near - fa.near) * t, far: fa.far + (fb.far - fa.far) * t };
    } else {
      o[k] = t < 0.5 ? va ?? vb : vb ?? va;
    }
  }
  return out;
}

export function lerpHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const r = Math.round(ch(pa, 16) + (ch(pb, 16) - ch(pa, 16)) * t);
  const g = Math.round(ch(pa, 8) + (ch(pb, 8) - ch(pa, 8)) * t);
  const bl = Math.round(ch(pa, 0) + (ch(pb, 0) - ch(pa, 0)) * t);
  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}

export interface CamPreset {
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** 심도: 초점(기준점) 앞뒤 선명 거리·흐림 램프(m), 최대 흐림 0..1 */
  dof?: { nearSharp: number; farSharp: number; nearRamp: number; farRamp: number; nearMax: number; farMax: number };
}

export const CAMS: Record<string, CamPreset> = {
  /** 게임: 젤다식 모험 카메라(어깨 뒤). 심도는 아주 약하게 — 먼 풍경이 보여야 한다 */
  adventure: { pos: [0, 3, 8], target: [0, 1.2, 0], fov: 50,
    dof: { nearSharp: 50, farSharp: 320, nearRamp: 2, farRamp: 2200, nearMax: 0, farMax: 0.08 } },
  /** 게임: 동숲식 아늑한 카메라(위에서) */
  cozy: { pos: [0, 10.5, 12.5], target: [0, 1.2, -0.6], fov: 32,
    dof: { nearSharp: 2.5, farSharp: 3.5, nearRamp: 3, farRamp: 14, nearMax: 0.5, farMax: 1 } },
  /** 동숲 플레이 시점: 위에서 비스듬히, 플레이어 중심 */
  ac: {
    pos: [0, 8.99, 15.38], target: [0, 1.1, -0.8], fov: 28,
    dof: { nearSharp: 2.5, farSharp: 3.5, nearRamp: 3, farRamp: 14, nearMax: 0.5, farMax: 1 },
  },
  /** 캐릭터·상자 가까이 */
  close: {
    pos: [1.2, 3.1, 5.6], target: [0.6, 1.5, -0.8], fov: 30,
    dof: { nearSharp: 1.5, farSharp: 2.5, nearRamp: 2, farRamp: 10, nearMax: 0.4, farMax: 1 },
  },
  /** 섬 전체 */
  wide: {
    pos: [26, 34, 38], target: [-8, 0, -8], fov: 40,
    dof: { nearSharp: 30, farSharp: 25, nearRamp: 20, farRamp: 40, nearMax: 0.3, farMax: 0.5 },
  },
  /** 눈높이(지평선·곡률 확인) */
  low: {
    pos: [4, 2.2, 8], target: [-3, 1.6, -10], fov: 38,
    dof: { nearSharp: 12, farSharp: 10, nearRamp: 4, farRamp: 30, nearMax: 0.4, farMax: 0.7 },
  },
  /** 강가·낚시 */
  river: {
    pos: [-1.5, 5.5, 8.5], target: [-4.6, 0.8, 2.0], fov: 34,
    dof: { nearSharp: 2.5, farSharp: 3.5, nearRamp: 3, farRamp: 12, nearMax: 0.5, farMax: 1 },
  },
  /** 해변·바다 */
  beach: {
    pos: [6, 6.5, 12], target: [12.5, 0.2, 3.5], fov: 36,
    dof: { nearSharp: 3, farSharp: 5, nearRamp: 4, farRamp: 16, nearMax: 0.5, farMax: 1 },
  },
};

/** 땅 휘는 정도 기본값(동숲처럼 화면 위쪽에서 지평선이 둥글게 넘어가게) */
export const CURVE_K = 0.0085;
