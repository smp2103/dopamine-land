// 청크 스트리밍 — 넓은 세계를 플레이어 주변만 만들고, 멀어지면 버린다.
// 레이어마다 청크 크기·반경이 다르다(풀꽃은 가까이만, 나무는 멀리까지, 지형은 두 단계 LOD).
// 성능(웨이브 6): 만들기 예산은 프레임 시간에 맞춰 늘고 준다(quality.nextBudget), 장식 레이어는 품질의 detail·farDetail 로
// 반경이 줄거나 먼 고리를 건너뛴다(quality.planReach — 낮음은 가운데 LOD 고리를 빼고 먼 풍경 고리가 당겨 와 메운다). 청크가 아닌 큰 덩어리(주민·건물 소품)는 chunks.lod 에 맡기면
// 멀어질 때 숨긴다.
import * as THREE from 'three';
import { applyCurve } from './curve';
import { BUDGET, ema, nextBudget, planReach } from './quality';

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
  /** 장식 레이어: 그래픽 품질의 detail 배율로 반경이 줄고, 낮음에선 먼 고리(innerRadius 있음)를 건너뛴다 */
  detail?: boolean;
}

interface Live { obj: THREE.Object3D | null; }

/** 레이어 하나의 현재 통계(벤치·디버그용) */
export interface LayerStat {
  key: string;
  world: 'earth' | 'space';
  detail: boolean;
  /** 살아 있는 청크 칸(빈 칸 포함) */
  chunks: number;
  /** 실제 오브젝트가 있는 청크 */
  filled: number;
  /** 메시 수(InstancedMesh 도 1) ≈ 드로우 콜 */
  meshes: number;
  /** 인스턴스 수(일반 메시 1 + InstancedMesh.count) */
  instances: number;
  /** 삼각형 수(인스턴스 곱) */
  tris: number;
}

export class ChunkManager {
  root = new THREE.Group();
  layers: Array<{ layer: ChunkLayer; live: Map<string, Live> }> = [];
  /** 프레임당 만드는 시간 예산(ms) — adaptive 면 프레임 시간에 맞춰 매 프레임 바뀐다 */
  budgetMs = BUDGET.baseMs;
  /** false 면 budgetMs 를 고정값으로 쓴다 */
  adaptive = true;
  /** 최근 프레임 시간 평균(ms, update 호출 간격) */
  frameMs: number | null = null;
  private lastCall = -1;
  focus = new THREE.Vector3();
  world: 'earth' | 'space' = 'earth';
  /** 장식 레이어 반경 배율(그래픽 품질) */
  detail = 1;
  /** 장식 레이어의 먼 고리도 만드나(그래픽 품질, 낮음 = false) */
  farDetail = true;
  /** 거리 숨김 — 청크가 아닌 덩어리를 멀어지면 숨긴다(lodScale = 품질 배율) */
  lod = new DistanceLod();
  lodScale = 1;

  constructor() { this.root.name = 'chunks'; }

  add(layer: ChunkLayer) {
    this.layers.push({ layer, live: new Map() });
  }

  private plan: { key: string; reach: ReturnType<typeof planReach> } | null = null;
  /** 레이어별 [안쪽, 바깥] 반경(품질·레이어 목록이 바뀔 때만 다시 계산) */
  reachPlan() {
    const key = `${this.detail}|${this.farDetail}|${this.layers.length}`;
    if (this.plan?.key !== key) this.plan = { key, reach: planReach(this.layers.map((l) => l.layer), { detail: this.detail, farDetail: this.farDetail }) };
    return this.plan.reach;
  }

  /** 만들 청크가 남았나(촬영 대기용) */
  pending = 0;

  /** 레이어별 통계 — 벤치가 어느 레이어가 무거운지 본다 */
  layerStats(): LayerStat[] { return layerStats(this); }

  /** focus = 만드는 중심(코어가 game.focusOverride ?? player.pos 를 넘긴다) */
  update(focus: THREE.Vector3, force = false) {
    this.focus.copy(focus);
    const t0 = performance.now();
    // 프레임마다 한 번(강제 갱신 = 순간이동 직후는 같은 프레임 안이라 빼고) 예산을 맞춘다
    if (!force) {
      if (this.lastCall >= 0) {
        const dt = t0 - this.lastCall;
        // 탭 전환 같은 긴 멈춤은 평균에 넣지 않는다
        if (dt > 0 && dt < 250) this.frameMs = ema(this.frameMs, dt, 0.15);
      }
      this.lastCall = t0;
      if (this.adaptive && this.frameMs !== null) this.budgetMs = nextBudget(this.budgetMs, this.frameMs, this.pending);
    }
    let pending = 0;
    const plan = this.reachPlan();
    for (let li = 0; li < this.layers.length; li++) {
      const { layer, live } = this.layers[li];
      const reach = plan[li];
      const active = (layer.world ?? 'earth') === this.world && reach !== null;
      const s = layer.size, r = reach?.outer ?? 0, ri = reach?.inner ?? -1;
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
    this.lod.update(focus, this.lodScale);
  }
}

/** 거리 숨김에 맡긴 덩어리 하나 */
interface LodEntry {
  obj: THREE.Object3D;
  far: number;
  near: boolean;
  /** 거리 숨김이 숨겼나(우리가 숨긴 것만 되살린다) */
  hid: boolean;
  at?: { x: number; z: number };
  onChange?: (near: boolean) => void;
}

export interface LodOpts {
  /** 고정 위치(없으면 obj.matrixWorld 의 x·z — 움직이는 주민도 따라간다) */
  at?: { x: number; z: number };
  /** 보임/숨김이 바뀔 때(모듈이 애니메이션 갱신을 쉬게) */
  onChange?: (near: boolean) => void;
}

/**
 * 거리 숨김 — 청크로 못 쪼갠 덩어리(주민·NPC 뼈대·조선소·씨름장 같은 큰 소품)를 초점에서 far(m) 넘게 멀어지면 visible=false.
 * - 되돌아올 때 숨김 경계보다 8% 안쪽에서 다시 보인다(경계에서 깜빡임 방지).
 * - 거리 숨김이 숨긴 것만 되살린다. 모듈이 스스로 visible 을 바꾸는 오브젝트라면 감싼 Group 을 맡겨라.
 * - 프레임마다 최대 maxPerFrame 개씩 돌아가며 본다(O(가까운 수) 아니라도 일정한 비용).
 * 사용: const off = game.chunks.lod.register(rig, 90, { onChange: (near) => … }); 버릴 때 off().
 */
export class DistanceLod {
  entries: LodEntry[] = [];
  maxPerFrame = 256;
  private cursor = 0;
  private lastScale = 1;

  register(obj: THREE.Object3D, far: number, o: LodOpts = {}): () => void {
    const e: LodEntry = { obj, far: Math.max(1, far), near: true, hid: false, at: o.at, onChange: o.onChange };
    this.entries.push(e);
    return () => {
      const i = this.entries.indexOf(e);
      if (i < 0) return;
      this.entries.splice(i, 1);
      if (e.hid) { e.obj.visible = true; e.hid = false; }
    };
  }

  /** 이 오브젝트가 지금 가까운가(맡기지 않았으면 true) */
  isNear(obj: THREE.Object3D): boolean {
    return this.entries.find((e) => e.obj === obj)?.near ?? true;
  }

  update(focus: THREE.Vector3, scale = 1) {
    const n = this.entries.length;
    if (!n) return;
    // 배율이 바뀌면(품질 변경) 이번에 전부 다시 본다
    const all = scale !== this.lastScale;
    this.lastScale = scale;
    const count = all ? n : Math.min(n, this.maxPerFrame);
    for (let i = 0; i < count; i++) {
      if (this.cursor >= this.entries.length) this.cursor = 0;
      const e = this.entries[this.cursor++];
      const m = e.obj.matrixWorld.elements;
      const x = e.at?.x ?? m[12], z = e.at?.z ?? m[14];
      const d = Math.hypot(x - focus.x, z - focus.z);
      const far = e.far * scale;
      const near = lodNear(e.near, d, far);
      if (near === e.near) continue;
      e.near = near;
      if (!near && e.obj.visible) { e.obj.visible = false; e.hid = true; }
      else if (near && e.hid) { e.obj.visible = true; e.hid = false; }
      try { e.onChange?.(near); } catch (err) { console.error('[lod onChange]', err); }
    }
  }

  stats() {
    let hidden = 0;
    for (const e of this.entries) if (!e.near) hidden++;
    return { total: this.entries.length, hidden };
  }
}

/**
 * 작은 조각의 그림자 끄기 — root 기준 반지름(지오메트리 경계구 × 누적 배율)이 minR(m) 보다 작은 메시는 castShadow=false.
 * 눈·볼터치·귀·손·장식처럼 그림자가 거의 안 보이는데 그림자 패스 그리기는 똑같이 드는 조각을 덜어 낸다. 끈 개수를 돌려준다.
 */
export function trimSmallShadows(root: THREE.Object3D, minR: number): number {
  let off = 0;
  const parent = root.parent;
  // root 의 부모 변환은 빼고 root 기준으로만 잰다
  const inv = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  if (parent) inv.copy(parent.matrixWorld).invert();
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.castShadow || !mesh.geometry) return;
    const g = mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const r0 = g.boundingSphere?.radius ?? 0;
    m.multiplyMatrices(inv, mesh.matrixWorld).decompose(p, q, s);
    const r = r0 * Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
    if (r < minR) { mesh.castShadow = false; off++; }
  });
  return off;
}

/** 거리 숨김 판정(이력 포함): 가까웠으면 far 를 넘어야 숨고, 숨었으면 far×0.92 안으로 와야 보인다 */
export function lodNear(wasNear: boolean, d: number, far: number): boolean {
  return wasNear ? d <= far : d < far * 0.92;
}

/** 레이어별 오브젝트·인스턴스·삼각형 수(살아 있는 청크만, 보이지 않는 것도 센다) */
export function layerStats(m: Pick<ChunkManager, 'layers'>): LayerStat[] {
  const out: LayerStat[] = [];
  for (const { layer, live } of m.layers) {
    const st: LayerStat = { key: layer.key, world: layer.world ?? 'earth', detail: !!layer.detail, chunks: live.size, filled: 0, meshes: 0, instances: 0, tris: 0 };
    for (const v of live.values()) {
      if (!v.obj) continue;
      st.filled++;
      v.obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const n = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
        const g = mesh.geometry;
        const tri = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
        st.meshes++;
        st.instances += n;
        st.tris += Math.round(tri * n);
      });
    }
    out.push(st);
  }
  return out;
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
