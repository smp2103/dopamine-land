// 달 런타임이 장소·생물 빌더에 넘기는 연결판(space.ts 가 채운다). 빌더는 여기로만 게임을 만진다.
import * as THREE from 'three';
import { disposeGeometries } from '../../core/chunks';
import type { Game } from '../../core/game';
import type { SpaceSpecies } from './data';

/** E 로 쓰는 것 하나(살아 있는 동안만 등록) */
export interface Actor {
  id: string;
  /** 월드 좌표(살아 있는 참조 — 움직이면 같이) */
  pos: THREE.Vector3;
  /** 이 거리 안이면 고를 수 있다 */
  r: number;
  label: string | (() => string);
  use: () => void;
  ok?: () => boolean;
  /** 잠자리채: 플레이어가 이쪽을 보고 있어야(앞쪽 부채꼴) */
  cone?: boolean;
  /** 거리를 잴 때 높이 차를 무시한다(큰 생물·높은 NPC) */
  flat?: boolean;
}
/** 매 프레임 돌릴 것 */
export type Ticker = (t: number, dt: number) => void;
/** 목격 등록(사진 모드·인사) */
export interface WitnessRec { speciesId: string; pos: THREE.Vector3; visible: () => boolean }

export interface Hub {
  game: Game;
  /** 달 origin(월드) */
  O: THREE.Vector3;
  rng: (key: string) => () => number;
  /** 국소 → 월드 높이 */
  groundY(lx: number, lz: number): number;
  /** 게임 날짜·시각(env 없으면 0일 12시) */
  day(): number;
  hour(): number;
  addActor(a: Actor): () => void;
  addTicker(fn: Ticker): () => void;
  addWitness(w: WitnessRec): () => void;
  /** 정적 충돌(청크와 같이 지운다) */
  addCollider(shape: { kind: 'cylinder'; halfH: number; r: number } | { kind: 'ball'; r: number }, at: THREE.Vector3): () => void;
  /** 잡기(굴림 → 잡았다 연출 → 보고). keep:false = 목격 */
  catchSpecies(sp: SpaceSpecies, o: { model?: THREE.Object3D; keep?: boolean; how: string }): void;
  /** 인사(목격 등록) — 그날 처음이면 true */
  greet(sp: SpaceSpecies, model: THREE.Object3D | null, line?: string): boolean;
  /** 재료 주기(가방 규칙) */
  give(id: string, n: number, why: string): number;
  takenToday(id: string): boolean;
  markToday(id: string): void;
  emit(e: { type: string; [k: string]: unknown }): void;
  toast(text: string): void;
  /** 처음 다가가면 '발견' */
  discover(place: string): void;
  /** 해금 확인(economy 없으면 true) */
  unlocked(key: string): boolean;
}

/** 청크 오브젝트에 정리 함수 달기 */
export function onDispose(o: THREE.Object3D, ...fns: Array<() => void>) {
  const list = (o.userData.cleanup as Array<() => void> | undefined) ?? [];
  list.push(...fns);
  o.userData.cleanup = list;
}
export function runDispose(o: THREE.Object3D) {
  for (const fn of (o.userData.cleanup as Array<() => void> | undefined) ?? []) { try { fn(); } catch (e) { console.error('[space dispose]', e); } }
  o.userData.cleanup = [];
}
/**
 * 청크가 버릴 때 통째로 비우기: 정리 함수 → 지오메트리 → 재질(+ 그 재질만의 map·emissiveMap 캔버스 텍스처).
 * userData.shared 가 붙은 건(모듈 전역 공유) 건드리지 않는다.
 */
export function disposeDeep(o: THREE.Object3D) {
  runDispose(o);
  disposeGeometries(o);
  const seen = new Set<THREE.Material>();
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (!mat || mat.userData.shared || seen.has(mat)) continue;
      seen.add(mat);
      const mm = mat as THREE.MeshStandardMaterial;
      for (const t of new Set([mm.map, mm.emissiveMap])) if (t && !t.userData.shared) t.dispose();
      mat.dispose();
    }
  });
}
