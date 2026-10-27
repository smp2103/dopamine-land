// 탈것 종류 정의(KindDef)·탈것 하나(Veh)·종류들이 함께 쓰는 런타임(Rt) 타입.
// 새 종류는 kinds/<kind>.ts 에 KindDef 하나 — 웨이브 4 는 game.vehicles.registerKind(def) 로 vehicles.ts 를 안 건드리고 더한다.
import type * as THREE from 'three';
import type { RAPIER } from '../../core/physics';
import type { Game, Input, Mountable } from '../../core/game';
import type * as Island from '../../core/island';
import type { Model } from './models';
import type { Puffs, SpeedLines } from './fx';
import type { Medium } from './logic';

/** 탈것 하나(세상에 놓인 것) */
export interface Veh {
  def: KindDef;
  idx: number;
  model: Model | null;
  pos: THREE.Vector3;
  /** 머리 방향(앞 = (sin h, cos h)) */
  h: number;
  /** 앞 방향 속도 m/s */
  v: number;
  /** 위아래 속도(점프·잠수·풍선) */
  vy: number;
  pitch: number;
  roll: number;
  steer: number;
  mounted: boolean;
  /** 공중에 떴나(자전거 점프·모터보트 파도 점프) */
  air: boolean;
  /** 종류별 자유 상태(쿨다운·박자 등) */
  st: Record<string, number>;
  /** 카메라가 보는 점(모델에 붙는다) */
  focus: THREE.Object3D;
  body: RAPIER.RigidBody | null;
  coll: RAPIER.Collider | null;
  cc: RAPIER.KinematicCharacterController | null;
  mountable: Mountable;
  wheelA: number;
  /** 내 탈것(F 로 부르는 그 한 대) */
  personal: boolean;
}

/** 종류들이 함께 쓰는 것(효과·지형·카메라) */
export interface Rt {
  game: Game | null;
  I: typeof Island;
  puffs: Puffs;
  fire: Puffs;
  lines: SpeedLines;
  /** 결정적 난수(효과용) */
  rnd: () => number;
  groundAt(x: number, z: number): number;
  /** 수면 높이(바다는 파도 포함 — game.ocean?.waveAt 을 늦게 읽고, 없으면 잔물결) */
  waterY(x: number, z: number, t: number): number;
  /** 깊이 depth 이상 물인가 */
  deep(x: number, z: number, depth: number): boolean;
  /** 해류(+8 m/s 까지) — seaworld 가 없으면 0 */
  current(x: number, z: number): { x: number; z: number };
  followCam(g: Game, v: Veh, dt: number, k?: number): void;
  boost(input: Input): boolean;
  fwd(v: Veh): THREE.Vector3;
  dust(v: Veh, dt: number, amt: number): void;
  wake(v: Veh, dt: number, t: number): void;
  bubbles(v: Veh, dt: number): void;
  /** 땅·물·하늘 매체별 기본 놓기(지형/파도에 맞춰 기울이기) */
  place(v: Veh, t: number): void;
  /** 바람 선 + 회전체 돌리기 같은 공통 마무리 */
  finish(v: Veh, g: Game, dt: number, o?: { camK?: number; lineY?: number; lineR?: number; dir?: THREE.Vector3; speed?: number }): void;
  /** 이벤트 보내기(state.emit) */
  emit(type: string, data?: Record<string, unknown>): void;
}

/** 탈것 종류 — kinds/<kind>.ts 하나가 하나 */
export interface KindDef {
  /** 안쪽 이름(sail·motor·raft …) */
  kind: string;
  /** 바깥 이름(GDD id 꼬리, 기본 kind) */
  id?: string;
  /** 표시 이름 */
  name: string;
  medium: Medium;
  /** 물에 뜨는 배(낚시·소리·isBoat) */
  boat: boolean;
  /** 땅을 달린다 */
  land: boolean;
  /** 카메라 거리 배율 */
  cam: number;
  /** 이 거리 안에서만 모델을 보인다(m) */
  view: number;
  /** 이 거리 안이면 '타기' 가 뜬다(m) */
  reach: number;
  /** 기본 최고 속도(m/s, 표·안내용) */
  speed: number;
  seats?: number;
  /** 해금 키 */
  unlockKey: string;
  /** 도감 칸 id(v_*). 없으면 기록하지 않는다 */
  dex?: string;
  /** 카메라 초점 높이(모델 좌표) */
  focusY: number;
  /** 모델 배율 */
  scale?: number;
  /** 배가 뜨는 최소 깊이(물 매체) */
  depth?: number;
  /** 소환할 때 땅 여유 반지름 */
  margin?: number;
  /** 모델 만들기(가까이 갈 때 한 번) */
  make(): Model;
  /** 탑승 중 매 프레임 */
  drive(v: Veh, input: Input, dt: number, g: Game, rt: Rt): void;
  /** 모델을 v.pos·v.h 에 놓기(없으면 rt.place) */
  place?(v: Veh, t: number, rt: Rt): void;
  /** 아무도 안 탈 때 매 프레임(보일 때만) */
  idle?(v: Veh, t: number, dt: number, rt: Rt): void;
  /** 탈 때(물리 몸체 만들기 등) */
  mount?(v: Veh, g: Game, rt: Rt): void;
  /** 내릴 자리(없으면 옆으로) */
  exit?(v: Veh, g: Game, rt: Rt): THREE.Vector3 | void;
}
