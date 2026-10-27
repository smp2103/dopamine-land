import type * as THREE from 'three';
import type { PALETTE } from './palette';
import type * as Island from './island';
import type { TodPreset } from './presets';
import type { Game } from './game';

export interface Ctx {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  island: typeof Island;
  palette: typeof PALETTE;
  /** 키별 고정 난수 */
  rng: (key: string | number) => () => number;
  /** 매 프레임 호출(t = 경과 초, 촬영 모드에선 고정). dt 는 engine.timeScale 이 곱해진 값. 해제 함수를 돌려준다 */
  onUpdate: (fn: (t: number, dt: number) => void) => () => void;
  /** 시간대 프리셋이 적용될 때마다 호출(밤에 불 켜기 등 — 보간 중엔 매 프레임 올 수 있다) */
  onTod: (fn: (name: string, p: TodPreset) => void) => void;
  /** 시간대 '이름'이 바뀔 때만 호출(계약 v2 3장). 해제 함수를 돌려준다 */
  onTodChange: (fn: (name: string, prev: string) => void) => () => void;
  /** 푸아송 원반 배치: 조건을 만족하는 점들을 최소 간격으로 */
  scatter: (opts: ScatterOpts) => Array<{ x: number; z: number; y: number }>;
  /** 시간대 이름 */
  tod: string;
  /** 게임(이동·물리·청크·상호작용·수집·UI). 룩 테스트 모드(game=0)면 null */
  game: Game | null;
}

export interface ScatterOpts {
  key: string;
  count: number;
  minDist: number;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  accept: (x: number, z: number) => boolean;
  /** 다른 모듈이 이미 차지한 점을 피한다(기본 true) */
  avoidOccupied?: boolean;
  /** 이 배치를 다른 모듈이 피하도록 등록(기본 true) */
  occupy?: number;
}

/** 모듈 기본 내보내기: 씬에 넣을 오브젝트를 돌려준다. */
export type ModuleBuild = (ctx: Ctx) => Promise<THREE.Object3D | void> | THREE.Object3D | void;

/** 모듈이 원하면 내보내는 로드 순서(작을수록 먼저). terrain=0, 나머지 기본 10. */
export type ModuleOrder = number;
