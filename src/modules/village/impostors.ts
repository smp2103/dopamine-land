// 먼 랜드마크 임포스터: 1.4 km 밖(세계 안개가 다 덮는 거리)에서도 수평선에 실루엣 + 대표색이 보이게.
// 아주 적은 삼각형(랜드마크당 수백 개) + 안개 끈 재질 + 거리만큼 안개색으로 직접 섞어 공기 원근을 낸다.
// 바뀌는 랜드마크도 따라간다: stage()(발사탑 단계 0~6 → 모양 교체), light()(등대 불 0..1 → 꼭대기 빛 점).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { curveUniforms } from '../../core/curve';

export type ImpKind =
  | 'rocket' | 'lighthouse' | 'windmill' | 'iceCastle' | 'pyramid' | 'mushTower' | 'ruins' | 'controlTower' | 'shipwreck'
  | 'launchTower' | 'coconutTower' | 'ghostShip' | 'pengLab';
export interface Imp {
  kind: ImpKind;
  o: THREE.Object3D;
  /** 같은 종류 안의 색 변형(등대: 'a,b,c' = 줄무늬 두 색 + 지붕색) */
  variant?: string;
  /** 단계형 랜드마크(발사탑): 지금 단계 — 바뀌면 모양을 갈아 끼운다 */
  stage?: () => number;
  /** 불빛(등대): 0..1 — 0 이면 꺼짐 */
  light?: () => number;
  /** 불빛 높이(로컬, 배율 전) */
  lightY?: number;
}

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
/** 정점마다 무지개(둘레 각도) */
const rainbowA = (g: THREE.BufferGeometry, cs: string[]) => {
  const p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
  const C = cs.map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    const k = Math.floor(((Math.atan2(p.getZ(i), p.getX(i)) + Math.PI) / (Math.PI * 2)) * C.length) % C.length;
    a[i * 3] = C[k].r; a[i * 3 + 1] = C[k].g; a[i * 3 + 2] = C[k].b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => { g.translate(x, y, z); return g.index ? g.toNonIndexed() : g; };
const cylG = (r0: number, r1: number, h: number, s = 16, hs = 1) => new THREE.CylinderGeometry(r0, r1, h, s, hs);
export const RAINBOW = ['#ff7b7b', '#ffb36b', '#ffe066', '#8fe07a', '#6fc8ff', '#8f9bff', '#c99bff'];

/** 발사탑 임포스터(tower.ts 와 같은 치수: 기둥 ±8, 높이 80(+받침 1.2), 로켓 축 = 원점, 탱크 x=15) */
function towerShape(L: THREE.BufferGeometry[], stage: number) {
  const P = 8;
  for (const [x, z] of [[-P, -P], [P, -P], [-P, P], [P, P]]) L.push(at(bands(new THREE.BoxGeometry(1.1, 80, 1.1, 1, 8, 1), ['#ffcc45', '#ff6f61'], 10, -40), x, 41.2, z));
  for (let y = 11.2; y <= 81.2; y += 10) for (const [w, d, x, z] of [[2 * P, 0.7, 0, -P], [2 * P, 0.7, 0, P], [0.7, 2 * P, -P, 0], [0.7, 2 * P, P, 0]]) L.push(at(col(new THREE.BoxGeometry(w, 0.7, d), Math.round(y / 10) % 2 ? '#ffcc45' : '#ff6f61'), x, y, z));
  L.push(at(col(new THREE.BoxGeometry(2 * P + 3, 1.2, 2 * P + 3), '#ffcc45'), 0, 81.8, 0));
  L.push(at(col(cylG(11.5, 12, 1.2, 16), '#c6ccd4'), 0, 0.6, 0));
  if (stage >= 1) L.push(at(bands(cylG(4.6, 4.6, 24, 14, 8), ['#fffaf6', '#fffaf6', '#ff6f6f'], 3, -12), 0, 18, 0));
  if (stage >= 2) for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; L.push(at(col(cylG(1.0, 1.9, 3.8, 10), '#9aa6b4'), Math.cos(a) * 2.3, 3.5, Math.sin(a) * 2.3)); }
  if (stage >= 3) {
    L.push(at(bands(cylG(4.6, 4.6, 14, 14, 4), ['#fffaf6', '#fffaf6', '#ff6f6f'], 3, -7), 0, 37, 0));
    L.push(at(col(new THREE.SphereGeometry(4.6, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 3.0, 1), '#fffaf6'), 0, 44, 0));
    L.push(at(col(new THREE.SphereGeometry(1.9, 10, 6).scale(1, 1, 0.4), '#7cc8ff'), 0, 45, 4.5));
  }
  if (stage >= 4) for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 3; L.push(at(col(new THREE.BoxGeometry(0.9, 7, 3.2).rotateY(a), '#e8504f'), Math.sin(a) * 6, 12, Math.cos(a) * 6)); }
  if (stage >= 5) L.push(at(col(new THREE.CapsuleGeometry(2.4, 6.5, 4, 10).rotateX(Math.PI / 2), '#8ff0ff'), P + 7, 3.8, -2));
  if (stage >= 6) { L.push(at(col(cylG(0.3, 0.3, 10, 6), '#e6ecf3'), 0, 87.4, 0)); L.push(at(col(new THREE.SphereGeometry(1.2, 8, 6), '#ff5e5e'), 0, 93, 0)); }
}

function shape(kind: ImpKind, variant = '', stage = 0): THREE.BufferGeometry {
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
      const [a, b, roof] = (variant || '#ffffff,#ff6f61,#e8564a').split(',');
      L.push(at(bands(cylG(1.7, 2.6, 15, 14, 6), [a, b], 2.5, -7.5), 0, 7.8, 0));
      L.push(at(col(cylG(2.3, 2.3, 0.6, 14), '#3f5a52'), 0, 15.5, 0));
      L.push(at(col(cylG(1.4, 1.4, 2, 12), '#fff3b0'), 0, 16.9, 0));
      L.push(at(col(new THREE.SphereGeometry(1.9, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), roof), 0, 17.9, 0));
      break;
    }
    case 'windmill': {
      L.push(at(bands(cylG(2.2, 3.2, 9, 14, 7), RAINBOW, 9 / 7, -4.5), 0, 4.5, 0));
      L.push(at(col(new THREE.ConeGeometry(3, 3.6, 14), '#ff8fb1'), 0, 10.7, 0));
      for (let i = 0; i < 4; i++) { const b = new THREE.BoxGeometry(1.5, 6.5, 0.3).translate(0, 3.6, 0).rotateZ((i / 4) * Math.PI * 2 + 0.3); L.push(at(col(b, RAINBOW[i * 2]), 0, 8.4, 3.1)); }
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
    case 'mushTower': {
      // tower.ts mushTower 치수: 줄기 0~48(반경 7.5→4.6), 갓 48~56(반경 12.6), 꼭대기 달 장식 ~62
      L.push(at(col(cylG(4.6, 7.5, 48, 14), '#fff3dd'), 0, 24, 0));
      L.push(at(col(cylG(12.6, 11, 3, 18), '#fff2dc'), 0, 49.5, 0));
      L.push(at(col(new THREE.SphereGeometry(12.6, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1), '#ff5e8a'), 0, 51, 0));
      L.push(at(col(new THREE.TorusGeometry(1.8, 0.6, 6, 12, Math.PI * 1.3), '#ffe27a'), 0, 61, 0));
      for (let i = 0; i < 5; i++) { const a = i * 2.2; L.push(at(col(new THREE.SphereGeometry(2.6, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), '#ffb3d1'), Math.cos(a) * 7.5, 8 + i * 8, Math.sin(a) * 7.5)); }
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
    case 'ghostShip': {
      L.push(at(col(new THREE.BoxGeometry(7, 5, 24), '#6a5a8a'), 0, 2, 0));
      for (const [z, h] of [[-4, 15], [5, 11]]) {
        L.push(at(col(cylG(0.4, 0.35, h, 8), '#4e4366'), 0, h / 2 + 3, z));
        L.push(at(col(new THREE.BoxGeometry(0.4, h * 0.45, 6), '#d9c8ff'), 0, h * 0.6 + 3, z + 0.4));
      }
      break;
    }
    case 'launchTower': towerShape(L, stage); break;
    case 'coconutTower': {
      L.push(at(bands(cylG(1.6, 2.4, 24, 12, 8), ['#a8754b', '#c8955f'], 2, -12), 0, 12, 0));
      L.push(at(col(cylG(4.2, 3.4, 2.4, 14), '#8a5a3a'), 0, 25, 0));
      L.push(at(col(new THREE.SphereGeometry(2.4, 12, 8), '#7a4e33'), 0, 28, 0));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; L.push(at(col(new THREE.BoxGeometry(9, 0.4, 2.4).translate(4.5, 0, 0).rotateZ(-0.45).rotateY(a), '#6fcf6a'), 0, 30, 0)); }
      break;
    }
    case 'pengLab': {
      L.push(at(col(cylG(9, 9.5, 4, 16), '#e6f1ff'), 0, 2, 0));
      L.push(at(col(new THREE.SphereGeometry(9, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff'), 0, 4, 0));
      L.push(at(col(cylG(0.4, 0.4, 6, 6), '#c6ccd4'), 0, 15, 0));
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
  type Item = { it: Imp; m: THREE.Mesh; mat: THREE.MeshLambertMaterial; c: THREE.Vector3; base: THREE.Matrix4; stage: number; lamp: THREE.Mesh | null };
  const items: Item[] = [];
  const cache = new Map<string, THREE.BufferGeometry>();
  const geoOf = (it: Imp, stage: number) => {
    const key = `${it.kind}|${it.variant ?? ''}|${stage}`;
    let g = cache.get(key);
    if (!g) { g = shape(it.kind, it.variant, stage); cache.set(key, g); }
    return g;
  };
  const lampGeo = new THREE.SphereGeometry(1.7, 12, 8);
  for (const it of list) {
    it.o.updateMatrixWorld(true);
    const stage = it.stage ? it.stage() : 0;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
    const m = new THREE.Mesh(geoOf(it, stage), mat);
    m.matrixAutoUpdate = false;
    // 실제 배치 변환 + 수평선에서 읽히게 살짝 키움(바닥 기준)
    m.matrix.copy(it.o.matrixWorld).multiply(new THREE.Matrix4().makeScale(boost, boost, boost));
    m.frustumCulled = false;
    m.visible = false;
    m.castShadow = false;
    m.receiveShadow = false;
    m.name = 'imp:' + it.kind;
    let lamp: THREE.Mesh | null = null;
    if (it.light) {
      // 등대 불빛: 안개를 무시하고 더해지는 빛 점 — 밤바다 수평선 위의 반짝이
      lamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: '#ffe9a0', fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      lamp.position.set(0, it.lightY ?? 17, 0);
      lamp.frustumCulled = false;
      lamp.visible = false;
      lamp.name = 'imp:light';
      m.add(lamp);
    }
    root.add(m);
    items.push({ it, m, mat, c: new THREE.Vector3().setFromMatrixPosition(it.o.matrixWorld), base: m.matrix.clone(), stage, lamp });
  }
  const update = (cam: THREE.Vector3, fog: THREE.Color | null, sun = 1) => {
    for (const x of items) {
      const d = Math.hypot(cam.x - x.c.x, cam.z - x.c.z);
      const v = d > near && d < far;
      x.m.visible = v;
      if (!v) continue;
      // 단계가 바뀐 랜드마크는 모양을 갈아 끼운다(캐시 — 단계마다 한 번만 만든다)
      if (x.it.stage) {
        const s = x.it.stage();
        if (s !== x.stage) { x.stage = s; x.m.geometry = geoOf(x.it, s); }
      }
      // 땅 곡률(모험 카메라도 작게 휜다 — 1.6 km 면 300 m 가라앉는다)을 되돌려, 바닥이 수평선 바로 아래에 오게 올린다
      const K = curveUniforms.uCurveK.value, o = curveUniforms.uCurveOrigin.value;
      const dz = x.c.z - o.z, dx = x.c.x - o.x;
      const drop = K * (dz * dz + 0.18 * dx * dx);
      // 화면상 수평선(휜 바다가 가장 높이 보이는 각) 바로 아래에 바닥을 둔다 → 섬은 가라앉아도 랜드마크는 수평선 위로 솟는다
      const camY = Math.max(2, cam.y), dd = Math.max(1, Math.hypot(dx, dz));
      const target = camY - dd * 2 * Math.sqrt(camY * Math.max(K, 1e-7)) - 10;
      const lift = Math.max(0, target - x.c.y + drop);
      x.m.matrix.copy(x.base);
      x.m.matrix.elements[13] += lift;
      x.m.matrixWorldNeedsUpdate = true;
      // 공기 원근: 멀수록 안개색으로(완전히 지우지는 않음 — 실루엣은 남는다)
      const h = Math.min(0.72, 0.38 + ((d - near) / (far - near)) * 0.4);
      x.mat.color.setScalar((1 - h) * sun);
      if (fog) x.mat.emissive.copy(fog).multiplyScalar(h);
      if (x.lamp) {
        const k = x.it.light ? x.it.light() : 0;
        x.lamp.visible = k > 0.02;
        (x.lamp.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k);
      }
    }
  };
  return { root, update };
}
