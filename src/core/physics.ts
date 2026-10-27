// Rapier 물리 — 지형 충돌(청크 trimesh), 정적·동적 물체, 메시 동기화.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export { RAPIER };

export type BodyShape =
  | { kind: 'ball'; r: number }
  | { kind: 'box'; hx: number; hy: number; hz: number }
  | { kind: 'capsule'; halfH: number; r: number }
  | { kind: 'cylinder'; halfH: number; r: number }
  | { kind: 'hull'; points: Float32Array }
  | { kind: 'mesh'; vertices: Float32Array; indices: Uint32Array };

export interface BodyOpts {
  shape: BodyShape;
  /** 'dynamic' = 굴러가고 밀린다, 'fixed' = 움직이지 않음, 'kinematic' = 코드가 옮김 */
  type?: 'dynamic' | 'fixed' | 'kinematic';
  position: THREE.Vector3 | { x: number; y: number; z: number };
  rotation?: THREE.Quaternion;
  density?: number;
  friction?: number;
  restitution?: number;
  linearDamping?: number;
  angularDamping?: number;
  /** 이 메시를 물체에 맞춰 움직인다(월드 좌표) */
  mesh?: THREE.Object3D;
  /** 수면에 뜬다(밀도 비율, 1 = 물과 같음) */
  buoyancy?: number;
  /** 사용자 데이터(상호작용용) */
  tag?: string;
  ccd?: boolean;
}

export interface PhysBody {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh?: THREE.Object3D;
  buoyancy?: number;
  tag?: string;
  remove: () => void;
}

export class Physics {
  world!: RAPIER.World;
  bodies = new Set<PhysBody>();
  /** 콜라이더 핸들 → 몸체(상호작용·충돌 조회) */
  byHandle = new Map<number, PhysBody>();
  gravity = -22;
  accumulator = 0;
  readonly step = 1 / 60;
  /** 물 높이 함수(바다·강) — 부력 계산용 */
  waterLevel: (x: number, z: number) => number = () => 0;

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: this.gravity, z: 0 });
    this.world.timestep = this.step;
  }

  setGravity(g: number) {
    this.gravity = g;
    this.world.gravity = { x: 0, y: g, z: 0 };
  }

  colliderDesc(s: BodyShape): RAPIER.ColliderDesc {
    switch (s.kind) {
      case 'ball': return RAPIER.ColliderDesc.ball(s.r);
      case 'box': return RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz);
      case 'capsule': return RAPIER.ColliderDesc.capsule(s.halfH, s.r);
      case 'cylinder': return RAPIER.ColliderDesc.cylinder(s.halfH, s.r);
      case 'hull': return RAPIER.ColliderDesc.convexHull(s.points) ?? RAPIER.ColliderDesc.ball(0.5);
      case 'mesh': return RAPIER.ColliderDesc.trimesh(s.vertices, s.indices);
    }
  }

  add(o: BodyOpts): PhysBody {
    const type = o.type ?? 'dynamic';
    const bd = type === 'dynamic' ? RAPIER.RigidBodyDesc.dynamic()
      : type === 'kinematic' ? RAPIER.RigidBodyDesc.kinematicPositionBased()
      : RAPIER.RigidBodyDesc.fixed();
    bd.setTranslation(o.position.x, o.position.y, o.position.z);
    if (o.rotation) bd.setRotation({ x: o.rotation.x, y: o.rotation.y, z: o.rotation.z, w: o.rotation.w });
    if (o.linearDamping !== undefined) bd.setLinearDamping(o.linearDamping);
    if (o.angularDamping !== undefined) bd.setAngularDamping(o.angularDamping);
    if (o.ccd) bd.setCcdEnabled(true);
    const body = this.world.createRigidBody(bd);
    const cd = this.colliderDesc(o.shape)
      .setDensity(o.density ?? 1)
      .setFriction(o.friction ?? 0.7)
      .setRestitution(o.restitution ?? 0.2);
    const collider = this.world.createCollider(cd, body);
    const pb: PhysBody = {
      body, collider, mesh: o.mesh, buoyancy: o.buoyancy, tag: o.tag,
      remove: () => {
        this.bodies.delete(pb);
        this.byHandle.delete(collider.handle);
        this.world.removeRigidBody(body);
      },
    };
    this.bodies.add(pb);
    this.byHandle.set(collider.handle, pb);
    return pb;
  }

  /** 정적 콜라이더만(나무 줄기·바위·집 벽 등) */
  addStatic(shape: BodyShape, position: { x: number; y: number; z: number }, rotation?: THREE.Quaternion, tag?: string): PhysBody {
    return this.add({ shape, type: 'fixed', position, rotation, tag });
  }

  /** 고정 시간 간격으로 진행하고 메시를 맞춘다 */
  update(dt: number) {
    this.accumulator += Math.min(dt, 0.1);
    let n = 0;
    while (this.accumulator >= this.step && n < 4) {
      this.applyBuoyancy();
      this.world.step();
      this.accumulator -= this.step;
      n++;
    }
    // 못 따라간 몫은 버린다(쌓아 두면 프레임이 회복될 때 물리가 빨리 감긴다)
    if (n === 4) this.accumulator = 0;
    for (const b of this.bodies) {
      if (!b.mesh || b.body.isFixed()) continue;
      const p = b.body.translation(), q = b.body.rotation();
      b.mesh.position.set(p.x, p.y, p.z);
      b.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }

  private applyBuoyancy() {
    for (const b of this.bodies) {
      if (!b.buoyancy || !b.body.isDynamic()) continue;
      // Rapier 의 addForce 는 resetForces 전까지 매 스텝 남는다 → 스텝마다 지우고 새로 건다
      b.body.resetForces(false);
      const p = b.body.translation();
      const lvl = this.waterLevel(p.x, p.z);
      if (!Number.isFinite(lvl) || p.y > lvl + 0.3) continue;
      const depth = Math.min(1, (lvl + 0.3 - p.y) / 0.6);
      const m = b.body.mass();
      b.body.addForce({ x: 0, y: -this.gravity * m * b.buoyancy * depth, z: 0 }, true);
      const v = b.body.linvel();
      b.body.setLinvel({ x: v.x * 0.985, y: v.y * 0.95, z: v.z * 0.985 }, true);
    }
  }

  /** 아래로 광선: 지면(콜라이더) 높이. 없으면 NaN */
  groundY(x: number, z: number, fromY = 500): number {
    const ray = new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, fromY + 600, true);
    return hit ? fromY - hit.timeOfImpact : NaN;
  }
}

/** 높이 격자 → 삼각형 메시 콜라이더 데이터 */
export function gridTrimesh(x0: number, z0: number, size: number, res: number, h: (x: number, z: number) => number) {
  const n = Math.round(size / res);
  const v = new Float32Array((n + 1) * (n + 1) * 3);
  let k = 0;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = x0 + i * res, z = z0 + j * res;
    v[k++] = x; v[k++] = h(x, z); v[k++] = z;
  }
  const idx = new Uint32Array(n * n * 6);
  k = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b;
    idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  return { vertices: v, indices: idx };
}
