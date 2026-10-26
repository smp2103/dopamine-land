// 먼 랜드마크 임포스터: 1.4 km 밖(세계 안개가 다 덮는 거리)에서도 수평선에 실루엣 + 대표색이 보이게.
// 아주 적은 삼각형(랜드마크당 수백 개) + 안개 끈 재질 + 거리만큼 안개색으로 직접 섞어 공기 원근을 낸다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { curveUniforms } from '../../core/curve';

export type ImpKind = 'rocket' | 'lighthouse' | 'windmill' | 'iceCastle' | 'pyramid' | 'mushroom' | 'ruins' | 'controlTower' | 'shipwreck';
export interface Imp { kind: ImpKind; o: THREE.Object3D }

const col = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation) => {
  const cc = new THREE.Color(c);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
/** y 줄무늬 정점색 */
const bands = (g: THREE.BufferGeometry, cs: string[], band: number, y0: number) => {
  const p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
  const C = cs.map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) { const c = C[Math.abs(Math.floor((p.getY(i) - y0) / band)) % C.length]; a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => { g.translate(x, y, z); return g.index ? g.toNonIndexed() : g; };
const cylG = (r0: number, r1: number, h: number, s = 16, hs = 1) => new THREE.CylinderGeometry(r0, r1, h, s, hs);

function shape(kind: ImpKind): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  switch (kind) {
    case 'rocket': {
      L.push(at(bands(cylG(5.2, 4.6, 34, 18, 8), ['#ffffff', '#ff6f6f'], 5, -17), 0, 6 + 17, 0));
      L.push(at(col(new THREE.SphereGeometry(5.2, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2.4, 1), '#ffffff'), 0, 40, 0));
      L.push(at(col(new THREE.SphereGeometry(1.6, 10, 6), '#e8504f'), 0, 52, 0));
      L.push(at(col(cylG(4.4, 4.4, 6, 14), '#ff6f6f'), 0, 6, 0));
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; const f = new THREE.BoxGeometry(1, 7, 6).rotateY(a); L.push(at(col(f, '#e8504f'), Math.sin(a) * 6.5, 10, Math.cos(a) * 6.5)); }
      L.push(at(bands(new THREE.BoxGeometry(6.4, 52, 6.4, 1, 10, 1), ['#ff6f6f', '#ffffff'], 5, -26), 15, 26, 0));
      L.push(at(col(new THREE.BoxGeometry(9.5, 1.2, 9.5), '#ffcc45'), 15, 52.6, 0));
      break;
    }
    case 'lighthouse': {
      L.push(at(bands(cylG(1.7, 2.6, 15, 14, 6), ['#ffffff', '#ff6f61'], 2.5, -7.5), 0, 7.8, 0));
      L.push(at(col(cylG(1.4, 1.4, 2, 12), '#fff3b0'), 0, 16.9, 0));
      L.push(at(col(new THREE.SphereGeometry(1.9, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e8564a'), 0, 17.9, 0));
      break;
    }
    case 'windmill': {
      L.push(at(col(cylG(2.2, 3.2, 9, 14), '#fff3dd'), 0, 4.5, 0));
      L.push(at(col(new THREE.ConeGeometry(3, 3.6, 14), '#4f86c6'), 0, 10.7, 0));
      for (let i = 0; i < 4; i++) { const b = new THREE.BoxGeometry(1.5, 6.5, 0.3).translate(0, 3.6, 0).rotateZ((i / 4) * Math.PI * 2 + 0.3); L.push(at(col(b, '#fff8ea'), 0, 8.4, 3.1)); }
      break;
    }
    case 'iceCastle': {
      L.push(at(col(cylG(16, 17, 6, 20), '#dcefff'), 0, -0.5, 0));
      const tw = (x: number, z: number, r: number, h: number, roof: string) => {
        L.push(at(col(cylG(r, r * 0.9, h, 14), '#cfe8fa'), x, h / 2, z));
        L.push(at(col(new THREE.ConeGeometry(r * 1.1, r * 2.6, 14), roof), x, h + 0.4 + r * 1.3, z));
      };
      tw(0, -2, 5.5, 24, '#7fb8ff'); tw(-10, 4, 3.4, 15, '#a99cff'); tw(10, 4, 3.4, 15, '#a99cff'); tw(-13, -8, 2.8, 12, '#7fd8ff'); tw(13, -8, 2.8, 12, '#7fd8ff');
      L.push(at(col(new THREE.BoxGeometry(20, 6, 2.2), '#e6f5ff'), 0, 3, 4));
      break;
    }
    case 'pyramid': {
      L.push(at(col(new THREE.ConeGeometry(36.8, 34, 4).rotateY(Math.PI / 4), '#f0c47e'), 0, 17, 0));
      L.push(at(col(new THREE.BoxGeometry(7, 4, 7), '#ffd34f'), 0, 33.8, 0));
      break;
    }
    case 'mushroom': {
      L.push(at(col(cylG(7, 8.5, 19, 14), '#fff3dd'), 0, 9.5, 0));
      L.push(at(col(new THREE.SphereGeometry(16, 18, 7, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.75, 1), '#ff5e6c'), 0, 16, 0));
      L.push(at(col(new THREE.TorusGeometry(14, 1.8, 6, 18).rotateX(Math.PI / 2), '#fff2dc'), 0, 18, 0));
      break;
    }
    case 'ruins': {
      for (const sx of [-1, 1]) L.push(at(col(new THREE.BoxGeometry(2.4, 10, 2.4), '#b4bca0'), sx * 3.6, 5, 0));
      L.push(at(col(new THREE.BoxGeometry(10, 2.2, 2.8), '#c9cdb4'), 0, 11, 0));
      L.push(at(col(new THREE.SphereGeometry(2.6, 12, 8).scale(1, 1, 1.4), '#a9b296'), 0, 3, -6.5));
      break;
    }
    case 'controlTower': {
      L.push(at(col(cylG(2.4, 1.8, 22, 14), '#f2f6fa'), 0, 11, 0));
      L.push(at(col(cylG(4.6, 4.4, 3.5, 16), '#5aaef0'), 0, 24, 0));
      L.push(at(col(new THREE.SphereGeometry(4.7, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), '#ff8f6a'), 0, 26, 0));
      break;
    }
    case 'shipwreck': {
      L.push(at(col(cylG(0.4, 0.35, 11, 8), '#8a5a3a'), 0, 9, -2));
      L.push(at(col(new THREE.BoxGeometry(0.4, 4.5, 6), '#fff4e2'), 0, 10, -1.6));
      L.push(at(col(new THREE.BoxGeometry(6, 4, 22), '#8a5a3a'), 0, 1.5, 0));
      break;
    }
  }
  const g = mergeGeometries(L, false)!;
  g.computeVertexNormals();
  return g;
}

/** 임포스터 묶음. update(cam, fogColor) 를 매 프레임 부른다. */
export function buildImpostors(list: Imp[], near = 900, far = 4600, boost = 2.0) {
  const root = new THREE.Group();
  root.name = 'village:impostors';
  const items: Array<{ m: THREE.Mesh; mat: THREE.MeshLambertMaterial; c: THREE.Vector3; base: THREE.Matrix4 }> = [];
  const cache = new Map<ImpKind, THREE.BufferGeometry>();
  for (const it of list) {
    it.o.updateMatrixWorld(true);
    let g = cache.get(it.kind);
    if (!g) { g = shape(it.kind); cache.set(it.kind, g); }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
    const m = new THREE.Mesh(g, mat);
    m.matrixAutoUpdate = false;
    // 실제 배치 변환 + 수평선에서 읽히게 살짝 키움(바닥 기준)
    m.matrix.copy(it.o.matrixWorld).multiply(new THREE.Matrix4().makeScale(boost, boost, boost));
    m.frustumCulled = false;
    m.visible = false;
    m.castShadow = false;
    m.receiveShadow = false;
    m.name = 'imp:' + it.kind;
    root.add(m);
    items.push({ m, mat, c: new THREE.Vector3().setFromMatrixPosition(it.o.matrixWorld), base: m.matrix.clone() });
  }
  const update = (cam: THREE.Vector3, fog: THREE.Color | null, sun = 1) => {
    for (const it of items) {
      const d = Math.hypot(cam.x - it.c.x, cam.z - it.c.z);
      const v = d > near && d < far;
      it.m.visible = v;
      if (!v) continue;
      // 땅 곡률(모험 카메라도 작게 휜다 — 1.6 km 면 300 m 가라앉는다)을 되돌려, 바닥이 수평선 바로 아래에 오게 올린다
      const K = curveUniforms.uCurveK.value, o = curveUniforms.uCurveOrigin.value;
      const dz = it.c.z - o.z, dx = it.c.x - o.x;
      const drop = K * (dz * dz + 0.18 * dx * dx);
      // 화면상 수평선(휜 바다가 가장 높이 보이는 각) 바로 아래에 바닥을 둔다 → 섬은 가라앉아도 랜드마크는 수평선 위로 솟는다
      const camY = Math.max(2, cam.y), dd = Math.max(1, Math.hypot(dx, dz));
      const target = camY - dd * 2 * Math.sqrt(camY * Math.max(K, 1e-7)) - 10;
      const lift = Math.max(0, target - it.c.y + drop);
      it.m.matrix.copy(it.base);
      it.m.matrix.elements[13] += lift;
      it.m.matrixWorldNeedsUpdate = true;
      // 공기 원근: 멀수록 안개색으로(완전히 지우지는 않음 — 실루엣은 남는다)
      const h = Math.min(0.72, 0.38 + ((d - near) / (far - near)) * 0.4);
      it.mat.color.setScalar((1 - h) * sun);
      if (fog) it.mat.emissive.copy(fog).multiplyScalar(h);
    }
  };
  return { root, update };
}
