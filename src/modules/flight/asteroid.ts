// 내 소행성(GDD 6.4 엔드게임 '내 소행성' 하우징) — space.registerPlanet 으로 다는 단 하나의 추가 행성 'asteroid'.
// 둥근 라벤더 돌 꼭대기(반경 34 m) + 아래로 늘어진 통통한 바위 덩이 + 크레이터 셋 + 반짝 결정 + 별 하늘(점 하나 묶음) + 멀리 지구·토끼달.
// 착륙 자리 뒤에 작은 귀환 로켓(E '별길 여행'), 앞쪽에 5×4 = 20칸 가구판(칸마다 크림색 받침, 놓인 가구는 furniture.ts).
// 땅 충돌은 이 파일이 짓는다(위 표면 trimesh — 들어갈 때 짓고 나갈 때 뺀다). 땅 높이·가두기·바닥 안전망은 space 가 heightAt 으로 해 준다.
import * as THREE from 'three';
import type { Game } from '../../core/game';
import type { PhysBody } from '../../core/physics';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addEyes, addBlush } from '../../core/art';
import { ASTEROID, ASTEROID_ROCKET, ASTEROID_SLOTS, SLOT_GAP, asteroidHeight, slotLocal } from './logic';

const std = (c: string, o: { rough?: number; glow?: number; emissive?: string } = {}) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: o.rough ?? 0.7, metalness: 0, emissive: o.glow ? (o.emissive ?? c) : '#000000', emissiveIntensity: o.glow ?? 0 });

/** 위 표면 격자(극좌표) — 그림과 충돌이 같은 정점 */
const RINGS = 26, SEGS = 72, EXTRA = 5;
function topSurface(): { geo: THREE.BufferGeometry; verts: Float32Array; idx: Uint32Array } {
  const R = ASTEROID.radius + EXTRA;
  const pos: number[] = [], col: number[] = [], index: number[] = [];
  const c = new THREE.Color(), lav = new THREE.Color('#d9ccf5'), peach = new THREE.Color('#ffe1cf'), rim = new THREE.Color('#b9a6e6'), dust = new THREE.Color('#f3e9ff');
  pos.push(0, asteroidHeight(0, 0), 0);
  c.copy(peach); col.push(c.r, c.g, c.b);
  for (let i = 1; i <= RINGS; i++) {
    const r = (i / RINGS) ** 1.15 * R;
    for (let j = 0; j < SEGS; j++) {
      const a = (j / SEGS) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = asteroidHeight(x, z);
      pos.push(x, y, z);
      const n = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.cos(z * 0.27) * 2);
      c.copy(peach).lerp(lav, 0.35 + n * 0.45);
      const hy = y - ASTEROID.base;
      if (hy < 0.9) c.lerp(rim, Math.min(1, (0.9 - hy) * 0.7));
      if (n > 0.85) c.lerp(dust, (n - 0.85) * 4);
      c.lerp(rim, Math.max(0, Math.min(1, (r - ASTEROID.radius * 0.82) / (R - ASTEROID.radius * 0.82))));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < SEGS; j++) index.push(0, 1 + ((j + 1) % SEGS), 1 + j);
  for (let i = 1; i < RINGS; i++) {
    const a0 = 1 + (i - 1) * SEGS, a1 = 1 + i * SEGS;
    for (let j = 0; j < SEGS; j++) {
      const j1 = (j + 1) % SEGS;
      index.push(a0 + j, a0 + j1, a1 + j);
      index.push(a0 + j1, a1 + j1, a1 + j);
    }
  }
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array(pos);
  const idx = new Uint32Array(index);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return { geo, verts, idx };
}

/** 아래쪽 통통한 바위 덩이(위 표면 가장자리 아래를 감싼다) */
function underRock(): THREE.BufferGeometry {
  // 정이십면체는 정점이 따로따로라 합쳐서(부드러운 법선) 쓴다
  const ico = new THREE.IcosahedronGeometry(1, 6);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  const g = mergeVertices(ico);
  ico.dispose();
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const v = new THREE.Vector3(), c = new THREE.Color(), top = new THREE.Color('#c2b0ec'), bot = new THREE.Color('#9d8bd0'), spot = new THREE.Color('#ffd6e8');
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const bump = 1 + 0.07 * Math.sin(v.x * 7 + v.z * 3) * Math.cos(v.y * 6 - v.z * 4) + 0.04 * Math.sin(v.x * 17 - v.y * 13);
    v.multiplyScalar(bump);
    p.setXYZ(i, v.x, v.y, v.z);
    c.copy(bot).lerp(top, Math.max(0, Math.min(1, (v.y + 1) / 2)));
    if (Math.sin(v.x * 9) * Math.cos(v.z * 8 + v.y * 5) > 0.82) c.lerp(spot, 0.6);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // 위 표면 밑에 숨는 높이(울퉁불퉁 ±11% 까지 기준 높이 아래) — 가장자리 너머로 통통한 바위 배가 보인다
  g.scale(ASTEROID.radius * 1.12, ASTEROID.radius * 0.6, ASTEROID.radius * 1.12);
  g.translate(0, ASTEROID.base - 2.4 - ASTEROID.radius * 0.6, 0);
  g.computeVertexNormals();
  return g;
}

/** 작은 귀환 로켓(통통 + 창 눈 + 볼터치) */
function miniRocket(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'flight-asteroid-rocket';
  const body = new THREE.LatheGeometry(
    Array.from({ length: 20 }, (_, i) => { const k = i / 19; const r = 1.05 * Math.sin(Math.PI * Math.min(1, 0.08 + k * 0.96)) ** 0.6; return new THREE.Vector2(Math.max(0.04, r), k * 5.2); }),
    36,
  );
  body.computeVertexNormals();
  const white = std('#fff8f2', { rough: 0.35 }), pink = std('#ff9fb8', { rough: 0.35 }), mint = std('#9ef0d2', { rough: 0.35 });
  const b = new THREE.Mesh(body, white); b.position.y = 0.6; b.castShadow = true; g.add(b);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), pink); nose.position.y = 5.55; nose.scale.set(1, 1.4, 1); g.add(nose);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 10, 32), pink); band.rotation.x = Math.PI / 2; band.position.y = 2.2; g.add(band);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), i === 0 ? pink : mint);
    fin.scale.set(0.16, 0.95, 0.66); fin.position.set(Math.sin(a) * 1.0, 1.25, Math.cos(a) * 1.0); fin.rotation.y = a; g.add(fin);
  }
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.62, 28), std('#c8e8ff', { rough: 0.1, glow: 0.25 }));
  win.position.set(0, 3.6, 0.98); g.add(win);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.09, 8, 28), mint); rim.position.copy(win.position); g.add(rim);
  const f = new THREE.Group(); f.position.set(0, 3.62, 1.02); g.add(f);
  addEyes(f, { size: 0.32, gap: 0.62, y: 0, z: 0.02, splay: 0.1, blush: false });
  addBlush(f, 0.32, { y: -0.34, z: 0.0, gap: 1.0 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), std('#fff2a8', { glow: 1.2, emissive: '#ffe066' }));
  beacon.position.y = 6.5; g.add(beacon);
  g.userData.beacon = beacon;
  return g;
}

/** 나무 팻말 '○○의 소행성' (캔버스 글씨) */
function signPost(text: string): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 10), std('#c99a6e'));
  post.position.y = 0.8; g.add(post);
  let mat: THREE.Material = std('#fff8e8');
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const c2 = cv.getContext('2d');
    if (c2) {
      c2.fillStyle = '#fff8e8'; c2.fillRect(0, 0, 256, 96);
      c2.strokeStyle = '#ff9fb8'; c2.lineWidth = 10; c2.strokeRect(5, 5, 246, 86);
      c2.fillStyle = '#4a3b2a'; c2.font = "40px 'Jua', sans-serif"; c2.textAlign = 'center'; c2.textBaseline = 'middle';
      c2.fillText(text, 128, 50);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    }
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.64, 0.08), mat);
  board.position.y = 1.55; g.add(board);
  return g;
}

export interface AsteroidScene {
  root: THREE.Group;
  /** 가구를 붙이는 곳(칸 순서) */
  furn: THREE.Group;
  /** 칸 받침(InstancedMesh) — 빈칸만 반짝 */
  slots: THREE.InstancedMesh;
  rocket: THREE.Group;
  update(t: number, empty: (i: number) => boolean, cam?: THREE.Vector3): void;
  dispose(): void;
}

/** 소행성 장면 + 땅 충돌 */
export function buildAsteroidScene(game: Game, O: THREE.Vector3, rng: (k: string) => () => number): AsteroidScene {
  const root = new THREE.Group();
  root.name = 'planet-asteroid';
  const statics: PhysBody[] = [];
  // 빛(우주 그룹이 숨으면 같이 꺼진다)
  const hemi = new THREE.HemisphereLight('#e5dcff', '#ffe6ee', 0.75);
  const key = new THREE.DirectionalLight('#fff4e0', 1.5);
  key.position.set(O.x + 40, O.y + 70, O.z + 30);
  key.target.position.set(O.x, O.y + ASTEROID.base, O.z);
  root.add(hemi, key, key.target);

  const local = new THREE.Group();
  local.position.copy(O);
  root.add(local);
  // 땅
  const top = topSurface();
  const ground = new THREE.Mesh(top.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
  ground.receiveShadow = true;
  local.add(ground);
  statics.push(game.physics.addStatic({ kind: 'mesh', vertices: top.verts, indices: top.idx }, { x: O.x, y: O.y, z: O.z }));
  const rock = new THREE.Mesh(underRock(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  local.add(rock);

  // 반짝 결정(묶음 하나)
  const r = rng('flight:asteroid:deco');
  const crystalGeo = new THREE.OctahedronGeometry(0.45, 0);
  const crystals = new THREE.InstancedMesh(crystalGeo, std('#c9f0ff', { rough: 0.2, glow: 0.45, emissive: '#9fe8ff' }), 22);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  let nC = 0;
  for (let i = 0; i < 60 && nC < 22; i++) {
    const a = r() * Math.PI * 2, d = 12 + r() * (ASTEROID.radius * 0.8 - 12);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < 13 && z > -18 && z < 18) continue; // 가구판·로켓 자리 비우기
    const sc2 = 0.6 + r() * 1.1;
    p3.set(x, asteroidHeight(x, z) + 0.25 * sc2, z);
    q.setFromEuler(e.set(r() * 0.5, r() * 3, r() * 0.5));
    s3.set(sc2, sc2 * (1.3 + r() * 0.8), sc2);
    crystals.setMatrixAt(nC++, m4.compose(p3, q, s3));
  }
  crystals.count = nC;
  crystals.instanceMatrix.needsUpdate = true;
  local.add(crystals);

  // 별 하늘(점 하나 묶음) + 멀리 지구·토끼달
  const starN = 900, sp = new Float32Array(starN * 3), scol = new Float32Array(starN * 3);
  const sr = rng('flight:asteroid:stars');
  const tint = [new THREE.Color('#ffffff'), new THREE.Color('#fff2a8'), new THREE.Color('#ffc2dc'), new THREE.Color('#bfe9ff')];
  for (let i = 0; i < starN; i++) {
    const u = sr() * 2 - 1, a = sr() * Math.PI * 2, k = Math.sqrt(1 - u * u), R = 700 + sr() * 200;
    sp.set([Math.cos(a) * k * R, Math.abs(u) * R * 0.9 - 60, Math.sin(a) * k * R], i * 3);
    const c = tint[Math.floor(sr() * tint.length)];
    scol.set([c.r, c.g, c.b], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: true, vertexColors: true, fog: false, transparent: true, opacity: 0.95 }));
  stars.frustumCulled = false;
  // 하늘은 카메라를 따라다닌다(곡률 없음 — 늘 멀리)
  const sky = new THREE.Group();
  sky.name = 'flight-asteroid-sky';
  sky.add(stars);
  root.add(sky);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(70, 40, 28), new THREE.MeshStandardMaterial({ color: '#7fc8ff', emissive: '#3f88d8', emissiveIntensity: 0.35, roughness: 0.6, fog: false }));
  earth.position.set(-380, 160, -520);
  const land = new THREE.Mesh(new THREE.SphereGeometry(70.6, 32, 20, 0.4, 1.2, 0.8, 0.9), new THREE.MeshStandardMaterial({ color: '#9fe0a8', emissive: '#5fb06a', emissiveIntensity: 0.3, fog: false }));
  earth.add(land);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 28, 20), new THREE.MeshStandardMaterial({ color: '#fff1cf', emissive: '#e8d8b0', emissiveIntensity: 0.35, roughness: 0.9, fog: false }));
  moon.position.set(420, 120, -380);
  sky.add(earth, moon);
  sky.traverse((o) => { o.userData.noCurve = true; });

  // 로켓 + 팻말
  const rocket = miniRocket();
  rocket.position.set(ASTEROID_ROCKET.x, asteroidHeight(ASTEROID_ROCKET.x, ASTEROID_ROCKET.z), ASTEROID_ROCKET.z);
  rocket.rotation.y = -Math.PI / 2;
  local.add(rocket);
  statics.push(game.physics.addStatic({ kind: 'cylinder', halfH: 2.8, r: 1.1 }, { x: O.x + ASTEROID_ROCKET.x, y: O.y + rocket.position.y + 2.8, z: O.z + ASTEROID_ROCKET.z }));
  const sign = signPost('내 소행성 🪨');
  // 팻말은 로켓 옆(가구판 쪽), 도착 자리에서 보이게
  const SX = ASTEROID_ROCKET.x - 1.6, SZ = ASTEROID_ROCKET.z - 2.6;
  sign.position.set(SX, asteroidHeight(SX, SZ), SZ);
  sign.rotation.y = 0.5;
  local.add(sign);

  // 가구판 받침 20칸(묶음 하나)
  const padGeo = new THREE.CylinderGeometry(1.15, 1.25, 0.16, 28);
  const slots = new THREE.InstancedMesh(padGeo, new THREE.MeshStandardMaterial({ color: '#fff8e8', roughness: 0.55, emissive: '#ffd6ec', emissiveIntensity: 0.0 }), ASTEROID_SLOTS);
  const slotCol = new THREE.Color();
  for (let i = 0; i < ASTEROID_SLOTS; i++) {
    const L = slotLocal(i);
    p3.set(L.x, asteroidHeight(L.x, L.z) + 0.06, L.z);
    slots.setMatrixAt(i, m4.compose(p3, q.identity(), s3.set(1, 1, 1)));
    slots.setColorAt(i, slotCol.set(i % 2 ? '#fff1dc' : '#ffe9f2'));
  }
  slots.instanceMatrix.needsUpdate = true;
  if (slots.instanceColor) slots.instanceColor.needsUpdate = true;
  slots.receiveShadow = true;
  local.add(slots);
  // 가구판 테두리(별 점선 대신 통통한 띠 하나)
  const border = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.12, 8, 64),
    std('#ffc2dc', { rough: 0.5 }),
  );
  border.rotation.x = Math.PI / 2;
  const L0 = slotLocal(0), L1 = slotLocal(ASTEROID_SLOTS - 1);
  const midX = (L0.x + L1.x) / 2, midZ = (L0.z + L1.z) / 2;
  border.scale.set((Math.abs(L1.x - L0.x) + SLOT_GAP) * 0.78, (Math.abs(L1.z - L0.z) + SLOT_GAP) * 0.78, 1);
  border.position.set(midX, asteroidHeight(midX, midZ) + 0.05, midZ);
  local.add(border);

  const furn = new THREE.Group();
  furn.name = 'flight-asteroid-furniture';
  local.add(furn);

  const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
  return {
    root, furn, slots, rocket,
    update(t, empty, cam) {
      if (cam) sky.position.copy(cam);
      (rocket.userData.beacon as THREE.Mesh).scale.setScalar(0.85 + 0.3 * Math.sin(t * 4));
      // 빈칸은 살짝 둥실 숨쉬기(여기 놓을 수 있어요!)
      for (let i = 0; i < ASTEROID_SLOTS; i++) {
        const L = slotLocal(i);
        const k = empty(i) ? 1 + 0.04 * Math.sin(t * 2.4 + i * 0.7) : 1;
        tmpP.set(L.x, asteroidHeight(L.x, L.z) + 0.06, L.z);
        slots.setMatrixAt(i, tmpM.compose(tmpP, tmpQ.identity(), tmpS.set(k, 1, k)));
      }
      slots.instanceMatrix.needsUpdate = true;
      earth.rotation.y = t * 0.02;
    },
    dispose() {
      for (const b of statics) { try { b.remove(); } catch (e) { console.error('[flight asteroid collider]', e); } }
      statics.length = 0;
      // 인스턴스 버퍼도 바로 놓는다(GC 를 기다리지 않게)
      slots.dispose();
      crystals.dispose();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mt of mats) {
          // 공용 재질(가구 몸통·눈·볼터치 — art 의 MeshBasic)은 남긴다
          if ((mt as THREE.Material).userData?.shared || (mt as THREE.MeshBasicMaterial).isMeshBasicMaterial) continue;
          const map = (mt as THREE.MeshStandardMaterial).map;
          if (map) map.dispose();
          (mt as THREE.Material).dispose();
        }
      });
    },
  };
}
