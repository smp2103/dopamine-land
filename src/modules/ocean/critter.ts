// 바다 생물 얼굴 붙이기 — 모델 지오메트리의 눈 표식(kit.withEyeMarkers)을 읽어 art.ts 눈·볼터치를 단다(계약 v2 · GDD 7.2).
//  · critterObject: 들어 올리기·장식용. 진짜 addEyes 메시(눈 2 + 볼 2)를 단 그룹.
//  · EyeBatch: 세상 속 여러 마리 얼굴을 InstancedMesh 3개(왼눈·오른눈·볼)로 한 번에 — 드로우콜을 아낀다.
import * as THREE from 'three';
import { addEyes } from '../../core/art';
import { eyeFrames, type Geo } from './kit';

/** 몸 원점 기준 눈·볼 행렬(왼눈·오른눈·볼 여럿) */
export interface EyeRig { L: THREE.Matrix4; R: THREE.Matrix4; blush: THREE.Matrix4[]; eyeGeo: THREE.BufferGeometry; blushGeo: THREE.BufferGeometry }

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _c = new THREE.Vector3();

/** 눈 표식 한 쌍 → 얼굴 받침(+z = 바라보는 쪽, x = 왼눈→오른눈) 과 addEyes 옵션 */
function holderFor(geo: Geo): { holder: THREE.Object3D; size: number; gap: number; splay: number } | null {
  const fr = eyeFrames(geo);
  const L = fr.find((f) => f.side === 'L'), R = fr.find((f) => f.side === 'R');
  if (!L || !R) return null;
  _c.copy(L.c).add(R.c).multiplyScalar(0.5);
  _x.copy(R.c).sub(L.c);
  const gap = _x.length();
  if (gap < 1e-5) return null;
  _x.normalize();
  _z.copy(L.n).add(R.n);
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
  _z.addScaledVector(_x, -_z.dot(_x)).normalize();
  _y.crossVectors(_z, _x).normalize();
  const holder = new THREE.Object3D();
  holder.matrix.makeBasis(_x, _y, _z).setPosition(_c);
  holder.matrix.decompose(holder.position, holder.quaternion, holder.scale);
  // 표식 법선이 모두 정면이면 살짝 바깥으로 돌려 둥근 얼굴처럼(art 기본 0.22 보다 조금 덜)
  const splay = Math.max(0.16, Math.atan2(Math.abs(R.n.dot(_x)), Math.max(1e-3, R.n.dot(_z))));
  return { holder, size: (L.r + R.r) * 1.02, gap, splay };
}

const rigCache = new WeakMap<Geo, EyeRig | null>();
/** 모델 하나의 눈·볼 행렬(공유 — 지오메트리마다 한 번) */
export function eyeRig(geo: Geo): EyeRig | null {
  if (rigCache.has(geo)) return rigCache.get(geo)!;
  const h = holderFor(geo);
  let rig: EyeRig | null = null;
  if (h) {
    const root = new THREE.Group();
    root.add(h.holder);
    const set = addEyes(h.holder, { size: h.size, gap: h.gap, y: 0, z: 0, splay: h.splay });
    root.updateMatrixWorld(true);
    const rel = (m: THREE.Object3D) => m.matrixWorld.clone();
    rig = { L: rel(set.left), R: rel(set.right), blush: set.blush.map(rel), eyeGeo: set.left.geometry, blushGeo: set.blush[0]?.geometry ?? set.left.geometry };
  }
  rigCache.set(geo, rig);
  return rig;
}

/** 몸 메시 + art 눈·볼(진짜 메시). 들어 올리기·장식·고래처럼 몇 안 되는 것에 */
export function critterObject(geo: Geo, mat: THREE.Material, o: { shadow?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = o.shadow !== false;
  body.name = 'body';
  g.add(body);
  const h = holderFor(geo);
  if (h) {
    g.add(h.holder);
    addEyes(h.holder, { size: h.size, gap: h.gap, y: 0, z: 0, splay: h.splay });
  }
  g.userData.body = body;
  return g;
}

/**
 * 여러 마리 얼굴을 한 번에. 매 프레임 begin() → add(몸 matrixWorld, rig) … → end().
 * 왼눈·오른눈 재질이 달라(하이라이트 좌우 거울) InstancedMesh 가 셋이다.
 */
export class EyeBatch {
  readonly group = new THREE.Group();
  private l: THREE.InstancedMesh | null = null;
  private r: THREE.InstancedMesh | null = null;
  private b: THREE.InstancedMesh | null = null;
  private n = 0;
  private nb = 0;
  private readonly m = new THREE.Matrix4();
  constructor(readonly max: number) { this.group.name = 'ocean-eyes'; }

  private ensure(rig: EyeRig) {
    if (this.l) return;
    // 재질·지오메트리는 art 공용(눈 캔버스 텍스처 하나)을 그대로 쓴다
    const probe = new THREE.Group();
    const set = addEyes(probe, { size: 1 });
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], n: number, order: number) => {
      const im = new THREE.InstancedMesh(geo, mat as THREE.Material, n);
      im.count = 0;
      im.frustumCulled = false;
      im.renderOrder = order;
      im.castShadow = false;
      this.group.add(im);
      return im;
    };
    this.l = mk(rig.eyeGeo, set.left.material, this.max, 2);
    this.r = mk(rig.eyeGeo, set.right.material, this.max, 2);
    this.b = mk(rig.blushGeo, set.blush[0]?.material ?? set.left.material, this.max * 2, 1);
  }
  begin() { this.n = 0; this.nb = 0; }
  add(world: THREE.Matrix4, rig: EyeRig | null) {
    if (!rig || this.n >= this.max) return;
    this.ensure(rig);
    this.l!.setMatrixAt(this.n, this.m.multiplyMatrices(world, rig.L));
    this.r!.setMatrixAt(this.n, this.m.multiplyMatrices(world, rig.R));
    for (const bm of rig.blush) if (this.nb < this.max * 2) this.b!.setMatrixAt(this.nb++, this.m.multiplyMatrices(world, bm));
    this.n++;
  }
  end() {
    if (!this.l) return;
    for (const [im, n] of [[this.l, this.n], [this.r!, this.n], [this.b!, this.nb]] as const) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
  }
}
