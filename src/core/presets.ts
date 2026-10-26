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
}

export const TOD: Record<string, TodPreset> = {
  // 낮: 맑고 밝게, 그림자는 하늘빛이 고여 푸르스름
  day: {
    sunAzimuth: 235, sunElevation: 55,
    sunColor: '#fff4e0', sunIntensity: 2.5,
    hemiSky: '#b4dcff', hemiGround: '#9cc57a', hemiIntensity: 1.25,
    envIntensity: 0.6,
    skyTop: '#3fa4ee', skyHorizon: '#bfe8ff', skyBottom: '#d9f2ff',
    fogColor: '#c8eafc', fogNear: 40, fogFar: 150,
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
    skyTop: '#7fb6ec', skyHorizon: '#ffdcc4', skyBottom: '#ffe9da',
    fogColor: '#f6e2d6', fogNear: 35, fogFar: 130,
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
  // 노을: 주황·분홍이지만 화면이 읽히게(해는 너무 빨갛지 않게, 환경광 보라분홍)
  sunset: {
    sunAzimuth: 300, sunElevation: 14,
    sunColor: '#ffbf8a', sunIntensity: 2.2,
    hemiSky: '#d8b6e6', hemiGround: '#b89a80', hemiIntensity: 1.1,
    envIntensity: 0.55,
    skyTop: '#8a8fd8', skyHorizon: '#ffb99a', skyBottom: '#ffcfb4',
    fogColor: '#f4c0b0', fogNear: 32, fogFar: 125,
    exposure: 1.02,
    bloomIntensity: 0.5, bloomThreshold: 1.35,
    gradeLift: '#2a1440', gradeGain: '#fff0e6',
    saturation: 0.04, contrast: 0.03, brightness: 0.01,
    aoIntensity: 1.7, aoColor: '#4a2f50',
    shadowRadius: 6, vignette: 0.25,
    rimColor: '#ffc29a', rimIntensity: 0.9,
    sunGlow: 0.6,
    cloudLit: '#ffd4b8', cloudShade: '#b9a0cf', cloudOpacity: 1,
    stars: 0.1,
    pollen: 0.5, butterflies: 0.4, fireflies: 0,
  },
  // 밤: 푸른 달빛, 사물은 읽히고 불빛은 번진다
  night: {
    sunAzimuth: 250, sunElevation: 48,
    sunColor: '#9fbcff', sunIntensity: 0.9,
    hemiSky: '#5b74c4', hemiGround: '#2c3c5a', hemiIntensity: 1.0,
    envIntensity: 0.55,
    skyTop: '#0d1a4a', skyHorizon: '#2f4b8f', skyBottom: '#3a5596',
    fogColor: '#253a72', fogNear: 30, fogFar: 120,
    exposure: 1.2,
    bloomIntensity: 0.9, bloomThreshold: 1.0,
    gradeLift: '#0a1638', gradeGain: '#d4e0ff',
    saturation: 0.0, contrast: 0.04, brightness: 0.02,
    aoIntensity: 1.4, aoColor: '#0a1030',
    shadowRadius: 5, vignette: 0.32,
    rimColor: '#a8c4ff', rimIntensity: 0.6,
    sunGlow: 0.0,
    cloudLit: '#5a6fa8', cloudShade: '#2a3a6c', cloudOpacity: 0.85,
    stars: 1,
    pollen: 0, butterflies: 0, fireflies: 1,
  },
};

export interface CamPreset {
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** 심도: 초점(기준점) 앞뒤 선명 거리·흐림 램프(m), 최대 흐림 0..1 */
  dof?: { nearSharp: number; farSharp: number; nearRamp: number; farRamp: number; nearMax: number; farMax: number };
}

export const CAMS: Record<string, CamPreset> = {
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
