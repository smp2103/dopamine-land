// 청크 스트리밍 — 넓은 세계를 플레이어 주변만 만들고, 멀어지면 버린다.
// 레이어마다 청크 크기·반경이 다르다(풀꽃은 가까이만, 나무는 멀리까지, 지형은 두 단계 LOD).
import * as THREE from 'three';
import { applyCurve } from './curve';

export interface ChunkLayer {
  key: string;
  /** 청크 한 변(m) */
  size: number;
  /** 이 거리(청크 중심까지) 안이면 만든다 */
  radius: number;
  /** 이 거리 안쪽은 만들지 않는다(먼 LOD 고리용) */
  innerRadius?: number;
  /** 청크 하나를 만든다. 비면 null. (cx, cz = 청크 인덱스, x0/z0 = 월드 좌표 모서리) */
  build: (c: { cx: number; cz: number; x0: number; z0: number; size: number }) => THREE.Object3D | null;
  /** 버릴 때(기본: 지오메트리·재질 dispose 는 하지 않는다 — 공유 재질이 많으므로) */
  dispose?: (obj: THREE.Object3D) => void;
  /** 지구/우주 어느 세계 것인가(기본 earth) */
  world?: 'earth' | 'space';
  /** 장식 레이어: 그래픽 품질의 detail 배율로 반경이 줄어든다 */
  detail?: boolean;
}

interface Live { obj: THREE.Object3D | null; }

export class ChunkManager {
  root = new THREE.Group();
  layers: Array<{ layer: ChunkLayer; live: Map<string, Live> }> = [];
  /** 프레임당 만드는 시간 예산(ms) */
  budgetMs = 6;
  focus = new THREE.Vector3();
  world: 'earth' | 'space' = 'earth';
  /** 장식 레이어 반경 배율(그래픽 품질) */
  detail = 1;

  constructor() { this.root.name = 'chunks'; }

  add(layer: ChunkLayer) {
    this.layers.push({ layer, live: new Map() });
  }

  /** 만들 청크가 남았나(촬영 대기용) */
  pending = 0;

  update(focus: THREE.Vector3, force = false) {
    this.focus.copy(focus);
    const t0 = performance.now();
    let pending = 0;
    for (const L of this.layers) {
      const { layer, live } = L;
      const active = (layer.world ?? 'earth') === this.world;
      const k = layer.detail ? this.detail : 1;
      const s = layer.size, r = layer.radius * k, ri = layer.innerRadius !== undefined ? layer.innerRadius * k : -1;
      const want = new Set<string>();
      if (active) {
        const c0x = Math.floor((focus.x - r) / s), c1x = Math.floor((focus.x + r) / s);
        const c0z = Math.floor((focus.z - r) / s), c1z = Math.floor((focus.z + r) / s);
        // 가까운 것부터
        const list: Array<[number, number, number]> = [];
        for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
          const mx = (cx + 0.5) * s, mz = (cz + 0.5) * s;
          const d = Math.hypot(mx - focus.x, mz - focus.z);
          if (d > r || d < ri) continue;
          list.push([d, cx, cz]);
        }
        list.sort((a, b) => a[0] - b[0]);
        for (const [, cx, cz] of list) {
          const k = cx + ',' + cz;
          want.add(k);
          if (live.has(k)) continue;
          if (!force && performance.now() - t0 > this.budgetMs) { pending++; continue; }
          let obj: THREE.Object3D | null = null;
          try { obj = layer.build({ cx, cz, x0: cx * s, z0: cz * s, size: s }); }
          catch (e) { console.error(`[chunk ${layer.key} ${k}]`, e); }
          if (obj) { applyCurve(obj); this.root.add(obj); }
          live.set(k, { obj });
        }
      }
      for (const [k, v] of live) {
        if (want.has(k)) continue;
        if (v.obj) { this.root.remove(v.obj); layer.dispose ? layer.dispose(v.obj) : disposeGeometries(v.obj); }
        live.delete(k);
      }
    }
    this.pending = pending;
  }
}

/** 청크 전용 지오메트리만 버린다(공유 지오메트리는 userData.shared = true 로 표시) */
export function disposeGeometries(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
  });
}

/** 청크별 고정 난수 키 */
export function chunkKey(layer: string, cx: number, cz: number) { return `${layer}:${cx},${cz}`; }
