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
  contrast: number;
  brightness: number;
  aoIntensity: number;
  aoColor: string;
  shadowRadius: number;
  vignette: number;
}

export const TOD: Record<string, TodPreset> = {
  day: {
    sunAzimuth: 235, sunElevation: 52,
    sunColor: '#fff3dc', sunIntensity: 2.6,
    hemiSky: '#bfe6ff', hemiGround: '#8fbf6a', hemiIntensity: 1.15,
    envIntensity: 0.55,
    skyTop: '#5fb8f0', skyHorizon: '#c9ecff', skyBottom: '#e8f7ff',
    fogColor: '#c4e8fb', fogNear: 45, fogFar: 140,
    exposure: 1.0,
    bloomIntensity: 0.35, bloomThreshold: 1.6,
    saturation: 0.12, contrast: 0.04, brightness: 0.0,
    aoIntensity: 2.2, aoColor: '#2f4a3a',
    shadowRadius: 5, vignette: 0.25,
  },
  morning: {
    sunAzimuth: 200, sunElevation: 22,
    sunColor: '#ffe2b8', sunIntensity: 2.2,
    hemiSky: '#cfe3ff', hemiGround: '#a6b97a', hemiIntensity: 1.0,
    envIntensity: 0.5,
    skyTop: '#79b9ea', skyHorizon: '#ffe4cc', skyBottom: '#fff1e2',
    fogColor: '#f3e6dc', fogNear: 35, fogFar: 120,
    exposure: 1.0,
    bloomIntensity: 0.45, bloomThreshold: 1.5,
    saturation: 0.08, contrast: 0.03, brightness: 0.0,
    aoIntensity: 2.0, aoColor: '#3a3a4a',
    shadowRadius: 6, vignette: 0.25,
  },
  sunset: {
    sunAzimuth: 320, sunElevation: 10,
    sunColor: '#ffb070', sunIntensity: 2.4,
    hemiSky: '#c9a6d8', hemiGround: '#a07a5a', hemiIntensity: 0.85,
    envIntensity: 0.45,
    skyTop: '#6f7fd0', skyHorizon: '#ffb48a', skyBottom: '#ffd2a8',
    fogColor: '#f1b49a', fogNear: 30, fogFar: 110,
    exposure: 1.0,
    bloomIntensity: 0.6, bloomThreshold: 1.4,
    saturation: 0.1, contrast: 0.05, brightness: 0.0,
    aoIntensity: 2.0, aoColor: '#3a2a3a',
    shadowRadius: 7, vignette: 0.3,
  },
  night: {
    sunAzimuth: 250, sunElevation: 40,
    sunColor: '#a9c4ff', sunIntensity: 0.55,
    hemiSky: '#3a4f8f', hemiGround: '#1f2c3a', hemiIntensity: 0.7,
    envIntensity: 0.35,
    skyTop: '#0f1a45', skyHorizon: '#2d3f7a', skyBottom: '#33467f',
    fogColor: '#22305e', fogNear: 30, fogFar: 110,
    exposure: 1.15,
    bloomIntensity: 0.9, bloomThreshold: 1.1,
    saturation: 0.05, contrast: 0.05, brightness: 0.02,
    aoIntensity: 1.6, aoColor: '#0a0f20',
    shadowRadius: 6, vignette: 0.35,
  },
};

export interface CamPreset { pos: [number, number, number]; target: [number, number, number]; fov: number }

export const CAMS: Record<string, CamPreset> = {
  /** 동숲 플레이 시점: 위에서 비스듬히, 플레이어 중심 */
  ac: { pos: [0, 10.5, 12.5], target: [0, 1.2, -0.6], fov: 32 },
  /** 캐릭터·상자 가까이 */
  close: { pos: [1.2, 3.1, 5.6], target: [0.6, 1.5, -0.8], fov: 30 },
  /** 섬 전체 */
  wide: { pos: [26, 34, 38], target: [-8, 0, -8], fov: 40 },
  /** 눈높이(지평선·곡률 확인) */
  low: { pos: [4, 2.2, 8], target: [-3, 1.6, -10], fov: 38 },
  /** 강가·낚시 */
  river: { pos: [-1.5, 5.5, 8.5], target: [-4.6, 0.8, 2.0], fov: 34 },
  /** 해변·바다 */
  beach: { pos: [6, 6.5, 12], target: [12.5, 0.2, 3.5], fov: 36 },
};
