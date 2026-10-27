// 테스트 키트 — Object3D 안의 메시·인스턴스·삼각형 세기(성능 예산 확인용: 모듈당 그리기 40 · 삼각형 150k).
// WebGL 없이 지오메트리만 보고 센다. InstancedMesh 는 count 만큼, drawRange 와 geometry.groups(재질 여러 개)도 반영한다.
import * as THREE from 'three';

export interface SceneStats {
  /** Mesh(InstancedMesh·SkinnedMesh 포함) 개수 */
  meshes: number;
  /** 그 가운데 InstancedMesh 개수 */
  instancedMeshes: number;
  /** 그려지는 인스턴스 수(일반 메시 = 1, InstancedMesh = count) */
  instances: number;
  /** 삼각형 수(인스턴스 수 곱함) */
  triangles: number;
  /** 대략적인 그리기 호출 수(메시 하나당 재질 그룹 수) */
  drawCalls: number;
  /** Points · Line · Sprite 개수(삼각형엔 안 센다) */
  others: number;
}

export interface CountOpts {
  /** true 면 visible=false 인 가지는 건너뛴다(기본 false = 다 센다) */
  visibleOnly?: boolean;
}

/** 지오메트리 하나의 삼각형 수(drawRange 반영) */
export function geometryTriangles(geo: THREE.BufferGeometry | null | undefined): number {
  if (!geo) return 0;
  const idx = geo.index;
  const pos = geo.getAttribute?.('position');
  const total = idx ? idx.count : pos ? pos.count : 0;
  const start = Math.max(0, geo.drawRange?.start ?? 0);
  const cnt = geo.drawRange && Number.isFinite(geo.drawRange.count) ? geo.drawRange.count : Infinity;
  const n = Math.max(0, Math.min(total - start, cnt));
  return Math.floor(n / 3);
}

/** 메시 하나가 그리는 인스턴스 수 */
export function instanceCount(o: THREE.Object3D): number {
  const im = o as THREE.InstancedMesh;
  if (im.isInstancedMesh) return Math.max(0, im.count);
  const ig = (o as THREE.Mesh).geometry as THREE.InstancedBufferGeometry | undefined;
  if (ig && (ig as { isInstancedBufferGeometry?: boolean }).isInstancedBufferGeometry && Number.isFinite(ig.instanceCount)) return ig.instanceCount;
  return 1;
}

/** 훑으며 센다 */
export function sceneStats(root: THREE.Object3D, o: CountOpts = {}): SceneStats {
  const s: SceneStats = { meshes: 0, instancedMeshes: 0, instances: 0, triangles: 0, drawCalls: 0, others: 0 };
  const visit = (obj: THREE.Object3D) => {
    if (o.visibleOnly && !obj.visible) return;
    const m = obj as THREE.Mesh;
    if (m.isMesh) {
      const n = instanceCount(obj);
      s.meshes++;
      if ((obj as THREE.InstancedMesh).isInstancedMesh) s.instancedMeshes++;
      s.instances += n;
      s.triangles += geometryTriangles(m.geometry) * n;
      // 재질 배열 + groups 면 그룹마다 한 번씩 그린다
      const groups = Array.isArray(m.material) && m.geometry?.groups?.length ? m.geometry.groups.length : 1;
      if (n > 0) s.drawCalls += groups;
    } else if ((obj as THREE.Points).isPoints || (obj as THREE.Line).isLine || (obj as THREE.Sprite).isSprite) {
      s.others++;
      s.drawCalls++;
    }
    for (const c of obj.children) visit(c);
  };
  visit(root);
  return s;
}

export const countMeshes = (root: THREE.Object3D, o?: CountOpts) => sceneStats(root, o).meshes;
export const countInstances = (root: THREE.Object3D, o?: CountOpts) => sceneStats(root, o).instances;
export const countTriangles = (root: THREE.Object3D, o?: CountOpts) => sceneStats(root, o).triangles;
export const countDrawCalls = (root: THREE.Object3D, o?: CountOpts) => sceneStats(root, o).drawCalls;

/** 이름(정규식·문자열 포함)으로 찾은 오브젝트들 */
export function findByName(root: THREE.Object3D, name: string | RegExp): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((x) => { if (typeof name === 'string' ? x.name.includes(name) : name.test(x.name)) out.push(x); });
  return out;
}

/** 지오메트리 꼭짓점이 전부 유한한 수인지(NaN 모델 잡기) */
export function allFinite(root: THREE.Object3D): boolean {
  let ok = true;
  root.traverse((x) => {
    const pos = (x as THREE.Mesh).geometry?.getAttribute?.('position');
    if (!ok || !pos) return;
    const a = pos.array as ArrayLike<number>;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { ok = false; return; }
  });
  return ok;
}

/** 월드 바운딩 박스(빈 그룹이면 isEmpty) */
export function worldBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}
