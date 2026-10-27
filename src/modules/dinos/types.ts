// 공룡 개체(런타임) 타입 — dinos.ts(무리·펫·탈것)와 dinos/p1.ts(알·목장·대이동·도둑·엘리베이터)가 같이 쓴다.
import type * as THREE from 'three';
import type { DinoSpec } from './data';
import type { DinoRig } from './build';

export type AState = 'idle' | 'walk' | 'graze' | 'yawn' | 'flee' | 'approach' | 'follow' | 'ride' | 'look' | 'sleep';

export interface Agent {
  id: string;
  spec: DinoSpec;
  rig: DinoRig;
  /** 사는 섬(땅 판정) */
  isl: string;
  x: number; z: number; y: number; yaw: number;
  home: { x: number; z: number };
  state: AState;
  timer: number;
  tx: number; tz: number;
  speed: number;
  phase: number;
  blink: number;
  /** 숨쉬기 위상 0..1(개체마다) */
  bph: number;
  headPitch: number; headYaw: number; lean: number;
  hop: number;
  wag: number;
  /** 청크를 떠나 모듈 그룹에 붙었다(탑승·펫) */
  adopted: boolean;
  /** 같이 다니는 펫 */
  pet: boolean;
  chunk: string | null;
  lastPet: number;
  /** 포즈(엄지척·짜잔) 남은 시간 */
  pose: number;
  /** 부탁 '!' 표시 */
  mark?: THREE.Sprite;
  /** 높은 곳(화산 정상) 허용 */
  high: boolean;
  // ── P1(dinos/p1.ts)
  /** 내 목장 공룡(RanchRec.uid) */
  ranch?: string;
  /** P1 이 수명을 맡는다(멀리 두고 온 탈것 정리·탑승 때 보내기에서 뺀다) */
  keep?: boolean;
  /** 바깥 조종(도둑 도망·대이동 행진·엘리베이터 멈춤) — true 면 이번 프레임 보통 AI 이동을 건너뛴다 */
  ctl?: ((a: Agent, t: number, dt: number) => boolean) | null;
}

/** 탈 수 있는 몸(공룡 개체·티노) — 땅 탑승 조종이 움직인다 */
export interface RideBody { x: number; y: number; z: number; yaw: number; speed: number }
