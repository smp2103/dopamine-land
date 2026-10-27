// 행성 장면 — 들어갈 때마다 짓고 나갈 때 버린다(공유 지오메트리·재질은 남긴다).
// 공통: 보조광 · 하늘의 이웃 행성(카메라를 따라다녀 무한히 멀리) · 별길 정류장 표지판.
// 행성별: 슈가링(막대사탕 나무·검드롭·하늘의 큰 사탕 고리·서핑보드 대여소·고리 익룡) / 젤리별(젤리 언덕 방울·출렁 젤리 바다·젤리 수장룡) /
// 서리볼(얼음 결정·눈덩이·이글루·미끄럼 펭귄) / 솜사탕 성운(구름 뭉게·솜사탕 나무·무지개 다리) / 자갈띠(떠 있는 소행성 26 + 바위 충돌 · 운석 광맥 · 먼 소행성 고리) /
// 별다방(난간·카페·라떼 카운터·꾸물이 상점 자리·벤치·안테나·UFO 소) / 까만 도넛(블랙홀 구멍·빛 고리·소용돌이·스프링클).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  PLANET_BY_ID, SUGAR_RING, JELLY_SEA, JELLY_SEA_Y, FROST_RINKS, IGLOO, CLOUD_ISLES, CLOUD_SEA_Y, onCloudSea, beltRocks, BELT_FLOOR,
  STATION, DONUT, onSugarRing, inJellySea, rinkAt, type PlanetId,
} from './logic';
import { GEO, instanced, mat4, shared, signMaterial, skyMat, tintMat, toyMat, canvasTex, type PlanetCtx } from './kit';
import { frostPenguin, jellyPlesio, ringPtero, ufoCow, type Model } from './models';

export interface PlanetScene {
  root: THREE.Group;
  /** 매 프레임(카메라 위치) */
  update(t: number, dt: number): void;
  /** 꾸물이 상점 자리(월드) — 별다방만 */
  shopPos?: THREE.Vector3;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 행성 장면 짓기 */
export function buildScene(pc: PlanetCtx): PlanetScene {
  const root = new THREE.Group();
  root.name = `planet-${pc.id}`;
  const ticks: Array<(t: number, dt: number) => void> = [];
  const info = PLANET_BY_ID.get(pc.id)!;
  // 보조광: 역광 쪽 얼굴도 파스텔로(우주 그룹이 숨으면 같이 꺼진다)
  const hemi = new THREE.HemisphereLight(info.color, '#fff0f6', 0.7);
  const fill = new THREE.DirectionalLight('#e8e0ff', 0.6);
  fill.position.set(pc.O.x - 80, pc.O.y + 90, pc.O.z + 60);
  fill.target.position.copy(pc.O);
  root.add(hemi, fill, fill.target);
  // 하늘
  const sky = buildSky(pc.id);
  root.add(sky);
  ticks.push((t) => { sky.position.copy(pc.camera.position); sky.rotation.y = t * 0.004; });
  // 정류장 표지판
  root.add(travelSign(pc));
  let shopPos: THREE.Vector3 | undefined;
  switch (pc.id) {
    case 'sugar': sugarScene(pc, root, ticks); break;
    case 'jelly': jellyScene(pc, root, ticks); break;
    case 'frost': frostScene(pc, root, ticks); break;
    case 'cloud': cloudScene(pc, root, ticks); break;
    case 'belt': beltScene(pc, root, ticks); break;
    case 'station': shopPos = stationScene(pc, root, ticks); break;
    case 'blackhole': donutScene(pc, root, ticks); break;
  }
  // 흩뿌린 장식은 detail 층 — 플레이어 둘레만 그리고, 그래픽 품질이 낮을수록 반경이 줄어든다
  root.traverse((o) => { if (o instanceof THREE.InstancedMesh && DECO.has(o.name)) detailLayer(pc, ticks, o); });
  return { root, shopPos, update: (t, dt) => { for (const f of ticks) f(t, dt); } };
}

// ───────────── 공통 ─────────────
/** 장식(detail) 인스턴스 묶음 이름 — 운석(belt-ores)처럼 번호로 집어 쓰는 건 넣지 않는다 */
const DECO = new Set(['sugar-sticks', 'sugar-lollipops', 'sugar-gumdrops', 'jelly-drops', 'frost-crystals', 'frost-snowballs', 'cloud-puffs', 'cloud-sticks', 'cloud-candyfloss', 'belt-dots', 'donut-sprinkles']);
/** 장식 반경(m) — 청크 detail:true 층처럼 chunks.detail(높음 1 · 보통 0.8 · 낮음 0.6)을 곱한다 */
export const DETAIL_R = 95;
/** 낮음이면 장식 반경을 한 번 더 줄인다(낮음은 장식을 거의 버리는 단계) */
const LOW_CUT = 0.5;
/**
 * InstancedMesh 를 detail 층으로: 원래 행렬·색을 기억해 두고, 0.4초마다 플레이어 둘레 반경 안 것만 앞칸으로 모아 count 를 줄인다.
 * 경계 구는 처음 것(전체)을 그대로 둔다 — 넉넉해서 잘못 잘릴 일이 없다.
 */
function detailLayer(pc: PlanetCtx, ticks: PlanetScene['update'][], im: THREE.InstancedMesh) {
  const n = im.count;
  const ms: THREE.Matrix4[] = [], cs: THREE.Color[] = [], px = new Float32Array(n), pz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Matrix4();
    im.getMatrixAt(i, m);
    ms.push(m); px[i] = m.elements[12]; pz[i] = m.elements[14];
    if (im.instanceColor) { const c = new THREE.Color(); im.getColorAt(i, c); cs.push(c); }
  }
  im.userData.detail = true;
  let acc = 99, lx = 1e9, lz = 1e9, lk = -1;
  ticks.push((_t, dt) => {
    acc += dt;
    if (acc < 0.4) return;
    acc = 0;
    const p = pc.game.player.pos, d = pc.game.chunks?.detail ?? 1;
    const k = d <= 0.6 ? d * LOW_CUT : d;
    if (k === lk && Math.hypot(p.x - lx, p.z - lz) < 6) return;
    lk = k; lx = p.x; lz = p.z;
    const R2 = (DETAIL_R * k) ** 2;
    let j = 0;
    for (let i = 0; i < n; i++) {
      const dx = px[i] - p.x, dz = pz[i] - p.z;
      if (dx * dx + dz * dz > R2) continue;
      im.setMatrixAt(j, ms[i]);
      if (cs.length) im.setColorAt(j, cs[i]);
      j++;
    }
    im.count = j;
    im.visible = j > 0;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
}

/** 별길 정류장: 둥근 기둥 + 별 등 + 간판(E 는 planets.ts 가 단다) */
function travelSign(pc: PlanetCtx): THREE.Group {
  const s = PLANET_BY_ID.get(pc.id)!.stop;
  const g = new THREE.Group();
  g.name = 'planets-stop';
  const base = pc.at(s.x, s.z);
  g.position.copy(base);
  const pole = new THREE.Mesh(GEO.cyl, toyMat('#fff1cf'));
  pole.scale.set(0.12, 2.6, 0.12); pole.position.y = 1.3; pole.castShadow = true;
  const lamp = new THREE.Mesh(GEO.sph, toyMat('#ffe27a', { glow: 1.2 }));
  lamp.scale.setScalar(0.32); lamp.position.y = 2.85;
  const board = new THREE.Mesh(GEO.plane, signMaterial('별길 정류장', '행성 여행 🪐', '#c9b6f2'));
  board.scale.set(1.9, 0.95, 1); board.position.set(0, 1.9, 0.14);
  const back = new THREE.Mesh(GEO.plane, toyMat('#c9b6f2'));
  back.scale.set(1.9, 0.95, 1); back.position.set(0, 1.9, 0.12); back.rotation.y = Math.PI;
  const foot = new THREE.Mesh(GEO.sph, toyMat('#c9b6f2'));
  foot.scale.set(0.5, 0.18, 0.5); foot.position.y = 0.05;
  g.add(pole, lamp, board, back, foot);
  // 도착 자리 쪽을 본다
  const sp = PLANET_BY_ID.get(pc.id)!.spawn;
  g.rotation.y = Math.atan2(sp.x - s.x, sp.z - s.z);
  return g;
}

/** 하늘: 이웃 행성들(카메라를 따라다닌다) */
const skyCache = new Map<PlanetId, THREE.Group>();
function stripeTex(cols: string[]): THREE.Texture {
  return canvasTex(64, 256, (g) => { const n = cols.length * 3; for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(0, (i / n) * 256, 64, 256 / n + 1); } }, cols[0]);
}
function skyPlanet(r: number, cols: string[], glow = 0.3, ring?: string): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), skyMat(new THREE.MeshStandardMaterial({ map: stripeTex(cols), roughness: 0.85, emissive: cols[0], emissiveIntensity: glow })));
  g.add(m);
  if (ring) {
    const rg = new THREE.Mesh(new THREE.TorusGeometry(r * 1.7, r * 0.12, 8, 64), skyMat(new THREE.MeshStandardMaterial({ color: ring, emissive: ring, emissiveIntensity: 0.5, roughness: 0.6 })));
    rg.scale.z = 0.25;
    rg.rotation.x = Math.PI / 2 - 0.35;
    g.add(rg);
  }
  g.traverse((o) => { o.userData.noCurve = true; const gg = (o as THREE.Mesh).geometry; if (gg) gg.userData.shared = true; });
  return g;
}
function buildSky(id: PlanetId): THREE.Group {
  const hit = skyCache.get(id);
  if (hit) return hit;
  const g = new THREE.Group();
  g.name = `planets-sky-${id}`;
  g.userData.noCurve = true;
  const add = (o: THREE.Object3D, x: number, y: number, z: number) => { o.position.set(x, y, z); g.add(o); };
  // 어느 행성에서든 보이는 토끼달(크림)
  add(skyPlanet(120, ['#fff1cf', '#f3e6d2', '#fff8ea'], 0.35), 1800, 900, -2200);
  switch (id) {
    case 'sugar': add(skyPlanet(260, ['#ffb7d6', '#ffe0ee', '#ff9fc8'], 0.35, '#fffaf2'), -1600, 700, -2600); add(skyPlanet(80, ['#9ef0d2', '#d4fff1'], 0.3), 2400, 400, 900); break;
    case 'jelly': add(skyPlanet(300, ['#e0a8ff', '#ffc2ea', '#c58fd8'], 0.35), -2000, 1100, -1800); add(skyPlanet(70, ['#ffd84a', '#fff2a8'], 0.5), 1500, 600, 2000); break;
    case 'frost': add(skyPlanet(220, ['#bfe9ff', '#ffffff', '#9fd6ff'], 0.3, '#e2d8ff'), -1800, 800, -2400); add(skyPlanet(60, ['#ffd0de', '#fff6fb'], 0.4), 2200, 1300, 500); break;
    case 'cloud': add(skyPlanet(340, ['#ffd6f0', '#e8f4ff', '#fff2fa'], 0.45), -2200, 600, -2000); add(skyPlanet(90, ['#ffe9a8', '#fffaf2'], 0.5), 2000, 1400, -800); break;
    case 'belt': add(skyPlanet(380, ['#ffd9a8', '#ffb07a', '#ffe9c9'], 0.3, '#c9b6ff'), -2400, 900, -2000); add(skyPlanet(70, ['#8fd3f4', '#c8e8ff'], 0.4), 2200, 700, 1600); break;
    case 'station': add(skyPlanet(280, ['#8fd3f4', '#86d16f', '#3aa3cf'], 0.35), -1700, 500, -2500); add(skyPlanet(90, ['#ffb7d6', '#ffe0ee'], 0.35, '#fffaf2'), 2300, 1200, -400); break;
    case 'blackhole': add(skyPlanet(200, ['#7d5ab0', '#a77be0', '#c9a2ff'], 0.45), -2000, 1000, -2200); add(skyPlanet(60, ['#ff9fb8', '#ffd0de'], 0.5), 1800, 500, 1900); break;
  }
  skyCache.set(id, g);
  return g;
}

/** 국소 원판 안 결정적 점들(피할 곳 피하기) */
function scatter(pc: PlanetCtx, key: string, n: number, rMin: number, rMax: number, ok: (x: number, z: number) => boolean, gap = 4) {
  const r = pc.rng(`planets:${pc.id}:${key}`);
  const out: Array<{ x: number; z: number; r: () => number }> = [];
  for (let i = 0; i < n * 30 && out.length < n; i++) {
    const a = r() * Math.PI * 2, rr = rMin + Math.sqrt(r()) * (rMax - rMin);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (!ok(x, z)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < gap)) continue;
    out.push({ x, z, r });
  }
  return out;
}
const nearSpawn = (pc: PlanetCtx, x: number, z: number, d = 12) => {
  const p = PLANET_BY_ID.get(pc.id)!;
  return Math.hypot(x - p.spawn.x, z - p.spawn.z) < d || Math.hypot(x - p.stop.x, z - p.stop.z) < 5;
};
const pastel = ['#ff9fb8', '#ffd84a', '#9ef0d2', '#8fd3f4', '#c9b6f2', '#ffc59a'];

/** 장식 친구 하나 띄우기(돌아다니는 길은 fn) */
function decoFriend(root: THREE.Group, ticks: PlanetScene['update'][], m: Model, path: (t: number) => { p: THREE.Vector3; yaw: number }) {
  m.traverse((o) => { o.castShadow = false; });
  root.add(m);
  ticks.push((t) => { const q = path(t); m.position.copy(q.p); m.rotation.y = q.yaw; m.userData.anim(t); });
}

// ───────────── 슈가링 ─────────────
let swirlMat: THREE.Material | null = null;
function sugarScene(pc: PlanetCtx, root: THREE.Group, ticks: PlanetScene['update'][]) {
  const O = pc.O;
  // 막대사탕 나무
  const pts = scatter(pc, 'lolli', 72, 14, 180, (x, z) => !nearSpawn(pc, x, z) && Math.abs(Math.hypot(x, z) - SUGAR_RING.r) > SUGAR_RING.half + 3, 7);
  const sticks: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [], hc: THREE.Color[] = [];
  for (const p of pts) {
    const s = 0.8 + p.r() * 0.9, y = pc.gy(p.x, p.z), yaw = p.r() * 6.28;
    sticks.push(mat4(O.x + p.x, y + 1.4 * s, O.z + p.z, 0.09 * s, 2.8 * s, 0.09 * s));
    heads.push(mat4(O.x + p.x, y + 3.1 * s, O.z + p.z, 0.95 * s, 0.95 * s, 0.32 * s, yaw));
    hc.push(new THREE.Color(pastel[Math.floor(p.r() * pastel.length)]).lerp(new THREE.Color('#ffffff'), 0.15));
  }
  swirlMat ??= shared(new THREE.MeshStandardMaterial({
    map: canvasTex(256, 256, (g) => {
      g.fillStyle = '#fffaf2'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#ffffff'; g.lineWidth = 0;
      for (let i = 0; i < 6; i++) {
        g.beginPath(); g.strokeStyle = i % 2 ? '#ffffff' : 'rgba(255,120,170,0.85)'; g.lineWidth = 16;
        for (let a = 0; a < Math.PI * 6; a += 0.08) { const r = a * 6.5; const x = 128 + Math.cos(a + i * 1.05) * r, y = 128 + Math.sin(a + i * 1.05) * r; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
      }
    }, '#ffc2dc'), roughness: 0.3, emissive: '#ff9fc8', emissiveIntensity: 0.1,
  }));
  root.add(instanced(GEO.cyl, toyMat('#fffaf2'), sticks, undefined, 'sugar-sticks'));
  const hm = instanced(GEO.sph, swirlMat, heads, hc, 'sugar-lollipops');
  hm.castShadow = true;
  root.add(hm);
  // 검드롭(통통한 반구 젤리사탕)
  const gd = scatter(pc, 'gum', 130, 8, 185, (x, z) => !nearSpawn(pc, x, z, 9) && !onSugarRing(x, z), 3);
  const gm: THREE.Matrix4[] = [], gc: THREE.Color[] = [];
  for (const p of gd) { const s = 0.4 + p.r() * 0.8; gm.push(mat4(O.x + p.x, pc.gy(p.x, p.z) + 0.1, O.z + p.z, s, s * 0.85, s)); gc.push(new THREE.Color(pastel[Math.floor(p.r() * 6)])); }
  root.add(instanced(GEO.sph, tintMat({ rough: 0.25 }), gm, gc, 'sugar-gumdrops'));
  // 하늘을 가로지르는 큰 사탕 고리(행성 둘레)
  const ringGeo = new THREE.TorusGeometry(620, 26, 12, 160);
  const rc = new Float32Array(ringGeo.attributes.position.count * 3);
  const rp = ringGeo.attributes.position, cc = new THREE.Color();
  for (let i = 0; i < rp.count; i++) {
    const a = Math.atan2(rp.getY(i), rp.getX(i));
    cc.set(Math.sin(a * 80) > 0 ? '#ff9fc8' : '#fffaf2');
    rc[i * 3] = cc.r; rc[i * 3 + 1] = cc.g; rc[i * 3 + 2] = cc.b;
  }
  ringGeo.setAttribute('color', new THREE.BufferAttribute(rc, 3));
  const ring = new THREE.Mesh(ringGeo, skyMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: '#ffb7d6', emissiveIntensity: 0.35 })));
  ring.name = 'sugar-sky-ring';
  ring.position.set(O.x, O.y - 120, O.z);
  ring.rotation.x = Math.PI / 2 - 0.32;
  ring.scale.z = 0.35;
  root.add(ring);
  ticks.push((t) => { ring.rotation.z = t * 0.01; });
  // 서핑보드 대여소(고리 남쪽 끝, 도착 자리에서 보이는 곳)
  const st = new THREE.Group();
  st.name = 'sugar-surf-stand';
  st.position.copy(pc.at(0, -SUGAR_RING.r - SUGAR_RING.half - 3));
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(GEO.sph, toyMat(pastel[i * 2]));
    b.scale.set(0.45, 1.3, 0.1); b.position.set(-1 + i, 1.25, 0); b.rotation.z = (i - 1) * 0.12; b.castShadow = true;
    st.add(b);
  }
  const sign = new THREE.Mesh(GEO.plane, signMaterial('고리 서핑', '🏄 고리에서 E', '#ff9fc8'));
  sign.scale.set(2.2, 1.1, 1); sign.position.set(0, 3.1, 0.1);
  st.add(sign);
  st.rotation.y = 0;
  root.add(st);
  // 고리 익룡: 고리 위 하늘을 빙빙
  decoFriend(root, ticks, ringPtero(0.3), (t) => {
    const a = t * 0.12, R = SUGAR_RING.r;
    return { p: v3(O.x + Math.cos(a) * R, O.y + 34 + Math.sin(t * 0.6) * 3, O.z + Math.sin(a) * R), yaw: -a };
  });
  root.children[root.children.length - 1].scale.setScalar(4);
}

// ───────────── 젤리별 ─────────────
function jellyScene(pc: PlanetCtx, root: THREE.Group, ticks: PlanetScene['update'][]) {
  const O = pc.O;
  // 젤리 방울(투명 반구, 6색)
  const pts = scatter(pc, 'drops', 60, 12, 175, (x, z) => !nearSpawn(pc, x, z) && !inJellySea(x, z, 1.15), 4);
  const m: THREE.Matrix4[] = [], c: THREE.Color[] = [];
  const six = ['#ff7a8a', '#ffa24c', '#ffd84a', '#7fdc7a', '#6fb6ff', '#b58cff'];
  for (const p of pts) { const s = 0.6 + p.r() * p.r() * 2.4; m.push(mat4(O.x + p.x, pc.gy(p.x, p.z) - s * 0.25, O.z + p.z, s, s * 0.8, s)); c.push(new THREE.Color(six[Math.floor(p.r() * 6)])); }
  root.add(instanced(GEO.sph, tintMat({ clear: true }), m, c, 'jelly-drops'));
  // 젤리 바다 표면(출렁)
  const seaGeo = new THREE.CircleGeometry(JELLY_SEA.r * 1.02, 72, 0, Math.PI * 2);
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, toyMat('#ff7ac0', { alpha: 0.5, rough: 0.08, glow: 0.25 }));
  sea.name = 'jelly-sea';
  sea.position.set(O.x + JELLY_SEA.x, O.y + JELLY_SEA_Y + 0.18, O.z + JELLY_SEA.z);
  sea.renderOrder = 2;
  root.add(sea);
  const sp = seaGeo.attributes.position;
  const base = Float32Array.from(sp.array as Float32Array);
  ticks.push((t) => {
    for (let i = 0; i < sp.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      sp.setY(i, 0.12 * Math.sin(x * 0.25 + t * 1.6) * Math.cos(z * 0.22 - t * 1.2));
    }
    sp.needsUpdate = true;
  });
  // 젤리 수장룡: 바다 가운데서 목을 쭉
  decoFriend(root, ticks, jellyPlesio(0.6), (t) => {
    const a = t * 0.15;
    return { p: v3(O.x + JELLY_SEA.x + Math.cos(a) * 12, O.y + JELLY_SEA_Y - 0.3 + Math.sin(t * 0.9) * 0.15, O.z + JELLY_SEA.z + Math.sin(a) * 12), yaw: -a };
  });
  root.children[root.children.length - 1].scale.setScalar(3);
  // 바다 표지판
  const sign = new THREE.Mesh(GEO.plane, signMaterial('젤리 바다', '🎣 낚시 OK', '#ff9fd8'));
  sign.scale.set(2.2, 1.1, 1);
  const sx = JELLY_SEA.x - JELLY_SEA.r * 0.72 - 4, sz = JELLY_SEA.z + JELLY_SEA.r * 0.72 + 4;
  sign.position.copy(pc.at(sx, sz, 2.2));
  sign.rotation.y = Math.atan2(-sx, -sz + 10);
  root.add(sign);
}

// ───────────── 서리볼 ─────────────
function frostScene(pc: PlanetCtx, root: THREE.Group, ticks: PlanetScene['update'][]) {
  const O = pc.O;
  // 얼음 결정 덤불
  const pts = scatter(pc, 'crystal', 40, 14, 165, (x, z) => !nearSpawn(pc, x, z) && rinkAt(x, z) < 0.05 && Math.hypot(x - IGLOO.x, z - IGLOO.z) > 9, 6);
  const cm: THREE.Matrix4[] = [], cc: THREE.Color[] = [];
  for (const p of pts) {
    const y = pc.gy(p.x, p.z);
    for (let k = 0; k < 4; k++) {
      const s = 0.25 + p.r() * 0.35, ax = (p.r() - 0.5) * 0.9, az = (p.r() - 0.5) * 0.9;
      cm.push(mat4(O.x + p.x + (p.r() - 0.5) * 1.4, y + s * 1.6, O.z + p.z + (p.r() - 0.5) * 1.4, s, s * 3, s, p.r() * 3, ax, az));
      cc.push(new THREE.Color(p.r() < 0.5 ? '#c8e8ff' : '#e2d8ff'));
    }
  }
  root.add(instanced(GEO.cap, tintMat({ clear: true }), cm, cc, 'frost-crystals'));
  // 눈덩이
  const sn = scatter(pc, 'snow', 40, 10, 170, (x, z) => !nearSpawn(pc, x, z, 8) && rinkAt(x, z) < 0.05, 4);
  const sm: THREE.Matrix4[] = [];
  for (const p of sn) { const s = 0.35 + p.r() * 0.9; sm.push(mat4(O.x + p.x, pc.gy(p.x, p.z) + s * 0.6, O.z + p.z, s, s * 0.85, s)); }
  const snow = instanced(GEO.sph, toyMat('#ffffff', { rough: 0.9, glow: 0.12 }), sm, undefined, 'frost-snowballs');
  snow.castShadow = true;
  root.add(snow);
  // 이글루(둥근 돔 + 입구 터널)
  const ig = new THREE.Group();
  ig.name = 'frost-igloo';
  ig.position.copy(pc.at(IGLOO.x, IGLOO.z, -0.2));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), toyMat('#f4fbff', { rough: 0.8, glow: 0.1 }));
  dome.castShadow = true;
  const door = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.55, 12, 24, Math.PI), toyMat('#e3f1ff', { rough: 0.8 }));
  door.position.set(0, 0, 3.7);
  const hole = new THREE.Mesh(GEO.disc, toyMat('#5b6fb0'));
  hole.scale.setScalar(1.05); hole.rotation.x = Math.PI / 2; hole.position.set(0, 0.2, 3.62);
  ig.add(dome, door, hole);
  ig.rotation.y = Math.atan2(-IGLOO.x, -IGLOO.z + 10);
  root.add(ig);
  pc.addStatic({ kind: 'ball', r: 3.8 }, { x: ig.position.x, y: ig.position.y, z: ig.position.z });
  // 미끄럼 펭귄 3(얼음판을 빙글빙글)
  for (let i = 0; i < 3; i++) {
    const rk = FROST_RINKS[i % FROST_RINKS.length];
    decoFriend(root, ticks, frostPenguin(i * 0.31), (t) => {
      const a = t * (0.35 + i * 0.07) + i * 2.1, R = rk.r * (0.45 + 0.15 * i);
      const x = rk.x + Math.cos(a) * R, z = rk.z + Math.sin(a) * R;
      return { p: pc.at(x, z, 0), yaw: -a };
    });
    root.children[root.children.length - 1].scale.setScalar(1.6);
  }
}

// ───────────── 솜사탕 성운 ─────────────
let rainbowMat: THREE.MeshBasicMaterial | null = null;
function cloudScene(pc: PlanetCtx, root: THREE.Group, ticks: PlanetScene['update'][]) {
  const O = pc.O;
  // 구름바다 뭉게
  const pf = scatter(pc, 'puffs', 110, 10, 215, (x, z) => onCloudSea(x, z), 7);
  const pm: THREE.Matrix4[] = [], pcs: THREE.Color[] = [];
  const cl = ['#fffaf2', '#ffe4f4', '#dff0ff', '#fff2fa'];
  for (const p of pf) { const s = 2 + p.r() * 4.5; pm.push(mat4(O.x + p.x, O.y + CLOUD_SEA_Y + s * 0.15, O.z + p.z, s, s * 0.55, s)); pcs.push(new THREE.Color(cl[Math.floor(p.r() * 4)])); }
  // 섬 가장자리 뭉게(가파른 테를 감싼다)
  for (const [i, c] of CLOUD_ISLES.entries()) {
    const n = Math.round(c.r * 0.9);
    const r = pc.rng(`planets:cloud:rim:${i}`);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.3, R = c.r * (0.98 + r() * 0.12);
      const s = 2 + r() * 2.5, x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
      pm.push(mat4(O.x + x, O.y + (CLOUD_SEA_Y + c.top) * 0.5 + (r() - 0.3) * 2, O.z + z, s, s * 0.8, s));
      pcs.push(new THREE.Color(cl[k % 4]));
    }
  }
  const puffs = instanced(GEO.sphLo, tintMat({ rough: 0.95 }), pm, pcs, 'cloud-puffs');
  root.add(puffs);
  // 솜사탕 나무(섬 위)
  const tm: THREE.Matrix4[] = [], st: THREE.Matrix4[] = [], tc: THREE.Color[] = [];
  for (const [i, c] of CLOUD_ISLES.entries()) {
    const r = pc.rng(`planets:cloud:trees:${i}`);
    const n = i === 0 ? 2 : 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = r() * 6.28, R = c.r * (0.25 + r() * 0.45);
      const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
      if (nearSpawn(pc, x, z, 7)) continue;
      const y = pc.gy(x, z), s = 0.9 + r() * 0.7;
      st.push(mat4(O.x + x, y + 1.2 * s, O.z + z, 0.08 * s, 2.4 * s, 0.08 * s));
      tm.push(mat4(O.x + x, y + 3 * s, O.z + z, 1.1 * s, 1.0 * s, 1.1 * s));
      tc.push(new THREE.Color(r() < 0.5 ? '#ffb7d6' : '#bfe4ff'));
    }
  }
  root.add(instanced(GEO.cyl, toyMat('#fffaf2'), st, undefined, 'cloud-sticks'));
  const tops = instanced(GEO.sph, tintMat({ rough: 0.95 }), tm, tc, 'cloud-candyfloss');
  tops.castShadow = true;
  root.add(tops);
  // 무지개 다리(첫 섬 → 둘째 섬 사이 하늘)
  const parts: THREE.BufferGeometry[] = [];
  const rb = ['#ff9fb8', '#ffc59a', '#ffe27a', '#9ef0d2', '#8fd3f4', '#c9b6f2'];
  rb.forEach((col, i) => {
    const g = new THREE.TorusGeometry(34 - i * 1.3, 0.7, 8, 64, Math.PI);
    const cc = new THREE.Color(col), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { arr[k * 3] = cc.r; arr[k * 3 + 1] = cc.g; arr[k * 3 + 2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    parts.push(g);
  });
  const rbGeo = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  rainbowMat ??= shared(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }));
  const rainbow = new THREE.Mesh(rbGeo, rainbowMat);
  rainbow.name = 'cloud-rainbow';
  const a = CLOUD_ISLES[0], b = CLOUD_ISLES[1];
  rainbow.position.set(O.x + (a.x + b.x) / 2, O.y + CLOUD_SEA_Y, O.z + (a.z + b.z) / 2);
  rainbow.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  root.add(rainbow);
  // 구름바다 표지판
  const sign = new THREE.Mesh(GEO.plane, signMaterial('구름바다', '🎣 섬 가장자리에서', '#ffb7d6'));
  sign.scale.set(2.2, 1.1, 1);
  sign.position.copy(pc.at(-14, -14, 2.2));
  sign.rotation.y = Math.atan2(14, 20);
  root.add(sign);
  ticks.push((t) => { puffs.position.y = Math.sin(t * 0.3) * 0.25; });
}

// ───────────── 자갈띠 ─────────────
let rockGeoC: THREE.BufferGeometry | null = null;
function rockGeo() {
  if (rockGeoC) return rockGeoC;
  const g = new THREE.SphereGeometry(1, 24, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.1 * Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 2.7 - y) + 0.05 * Math.sin(x * 7 + z * 5);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return (rockGeoC = shared(g));
}
/** 운석 광맥(자리 = 소행성 위) — planets.ts 가 E 행동을 단다 */
export interface OreNode { id: string; pos: THREE.Vector3; im: THREE.InstancedMesh; index: number; m: THREE.Matrix4 }
export const beltOres: OreNode[] = [];
function beltScene(pc: PlanetCtx, root: THREE.Group, ticks: PlanetScene['update'][]) {
  const O = pc.O;
  const rocks = beltRocks();
  const rm: THREE.Matrix4[] = [], rc: THREE.Color[] = [];
  const rcol = ['#cbbfe8', '#e2d8f6', '#d8c8ff', '#ecc8e0', '#c8d6f0'];
  const geo = rockGeo();
  const gp = geo.attributes.position;
  for (const [i, a] of rocks.entries()) {
    const m = mat4(O.x + a.x, O.y + a.y, O.z + a.z, a.r, a.r * a.squash, a.r, a.spin);
    rm.push(m);
    rc.push(new THREE.Color(rcol[i % rcol.length]));
    // 충돌: 바위 모양 그대로 볼록 껍질
    const pts = new Float32Array(gp.count * 3), v = new THREE.Vector3();
    for (let k = 0; k < gp.count; k++) { v.fromBufferAttribute(gp, k).applyMatrix4(m); pts[k * 3] = v.x; pts[k * 3 + 1] = v.y; pts[k * 3 + 2] = v.z; }
    pc.addStatic({ kind: 'hull', points: pts }, { x: 0, y: 0, z: 0 });
  }
  const rim = instanced(geo, tintMat({ rough: 0.8 }), rm, rc, 'belt-asteroids');
  rim.castShadow = true; rim.receiveShadow = true;
  root.add(rim);
  // 바위 위 작은 크레이터 점(분홍 반구) — 바위가 덜 심심하게
  const dm: THREE.Matrix4[] = [];
  for (const a of rocks) {
    const r = pc.rng(`planets:belt:dots:${a.x.toFixed(1)}`);
    for (let k = 0; k < 3; k++) {
      const ang = r() * 6.28, d = r() * 0.55;
      const x = a.x + Math.cos(ang) * d * a.r, z = a.z + Math.sin(ang) * d * a.r;
      const y = a.y + a.r * a.squash * Math.sqrt(Math.max(0, 1 - d * d)) - 0.05;
      const s = a.r * (0.08 + r() * 0.08);
      dm.push(mat4(O.x + x, O.y + y, O.z + z, s, s * 0.25, s));
    }
  }
  root.add(instanced(GEO.sphLo, toyMat('#b9add8', { rough: 0.9 }), dm, undefined, 'belt-dots'));
  // 운석 광맥(빛나는 결정 덩이)
  beltOres.length = 0;
  const om: THREE.Matrix4[] = [];
  const orePos: THREE.Vector3[] = [];
  for (const [i, a] of rocks.entries()) {
    for (let k = 0; k < a.ore; k++) {
      const ang = a.spin + k * 2.4, d = 0.35;
      const x = a.x + Math.cos(ang) * d * a.r, z = a.z + Math.sin(ang) * d * a.r;
      const y = a.y + a.r * a.squash * Math.sqrt(1 - d * d);
      om.push(mat4(O.x + x, O.y + y + 0.35, O.z + z, 0.42, 0.7, 0.42, ang, 0.2, 0.15));
      orePos.push(v3(O.x + x, O.y + y + 0.3, O.z + z));
      void i;
    }
  }
  // 바닥 광맥 몇 개
  for (const p of scatter(pc, 'floorore', 5, 20, 150, (x, z) => !nearSpawn(pc, x, z), 25)) {
    const y = pc.gy(p.x, p.z);
    om.push(mat4(O.x + p.x, y + 0.35, O.z + p.z, 0.42, 0.7, 0.42, p.r() * 6));
    orePos.push(v3(O.x + p.x, y + 0.3, O.z + p.z));
  }
  const oc = om.map((_, i) => new THREE.Color(i % 2 ? '#d8c8ff' : '#ffd0f0'));
  const ores = instanced(GEO.cap, tintMat({ glow: true }), om, oc, 'belt-ores');
  root.add(ores);
  orePos.forEach((p, i) => beltOres.push({ id: `belt:ore:${i}`, pos: p, im: ores, index: i, m: om[i].clone() }));
  // 먼 소행성 고리(바깥 둘레의 작은 바위들 — 풍경)
  const far: THREE.Matrix4[] = [];
  const fr = pc.rng('planets:belt:far');
  for (let i = 0; i < 260; i++) {
    const a = fr() * Math.PI * 2, R = 300 + fr() * 220, s = 1 + fr() * fr() * 9;
    far.push(mat4(O.x + Math.cos(a) * R, O.y + BELT_FLOOR + (fr() - 0.3) * 70, O.z + Math.sin(a) * R, s, s * (0.6 + fr() * 0.4), s, fr() * 6));
  }
  const farIm = instanced(GEO.sphLo, toyMat('#b3abc9', { rough: 0.9, glow: 0.1 }), far, undefined, 'belt-far');
  root.add(farIm);
  ticks.push((t) => { farIm.rotation.y = t * 0.003; ores.rotation.y = 0; });
}

// ───────────── 별다방 ─────────────
function stationScene(pc: PlanetCtx, root: THREE.Group, ticks: PlanetScene['update'][]): THREE.Vector3 {
  const O = pc.O, deckY = pc.gy(STATION.deck - 2, 0);
  // 난간(둥근 고리 + 기둥)
  const rail = new THREE.Mesh(new THREE.TorusGeometry(STATION.deck - 0.6, 0.12, 8, 128), toyMat('#c9b6f2'));
  rail.rotation.x = Math.PI / 2; rail.position.set(O.x, deckY + 1.05, O.z);
  root.add(rail);
  const posts: THREE.Matrix4[] = [];
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; posts.push(mat4(O.x + Math.cos(a) * (STATION.deck - 0.6), deckY + 0.5, O.z + Math.sin(a) * (STATION.deck - 0.6), 0.09, 1, 0.09)); }
  root.add(instanced(GEO.cyl, toyMat('#fff1cf'), posts, undefined, 'station-posts'));
  // 갑판 테두리 두툼한 판(아래로 떨어지는 단면이 안 보이게)
  const lip = new THREE.Mesh(new THREE.TorusGeometry(STATION.deck + 0.6, 1.4, 10, 96), toyMat('#ffe3a8', { rough: 0.5 }));
  lip.rotation.x = Math.PI / 2; lip.scale.z = 0.8; lip.position.set(O.x, deckY - 1.1, O.z);
  root.add(lip);
  // 바닥 밑 둥근 정거장 몸통(아래에서 봐도 둥글게)
  const belly = new THREE.Mesh(new THREE.SphereGeometry(STATION.deck * 0.98, 48, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toyMat('#dfe6ee', { rough: 0.45, metal: 0.2 }));
  belly.scale.y = 0.35; belly.position.set(O.x, deckY - 1.6, O.z);
  root.add(belly);
  // 가운데 카페(둥근 건물 + 줄무늬 차양 + 지붕의 큰 커피잔)
  const cafe = new THREE.Group();
  cafe.name = 'station-cafe';
  cafe.position.set(O.x + STATION.cafe.x, pc.gy(0, 0), O.z + STATION.cafe.z);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7, 4.6, 40, 1, true), toyMat('#fff8e8', { rough: 0.6 }));
  wall.position.y = 2.3; wall.castShadow = true;
  const roof = new THREE.Mesh(new THREE.SphereGeometry(7.6, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), toyMat('#ff9fb8', { rough: 0.5 }));
  roof.scale.y = 0.45; roof.position.y = 4.6; roof.castShadow = true;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.6, 2.6, 32), toyMat('#fffaf2'));
  cup.position.y = 7.4;
  const coffee = new THREE.Mesh(GEO.disc, toyMat('#c98f55'));
  coffee.scale.setScalar(2.05); coffee.position.y = 8.6;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.22, 10, 24), toyMat('#fffaf2'));
  handle.position.set(2.3, 7.4, 0);
  const steam: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(GEO.sphLo, toyMat('#ffffff', { alpha: 0.6, glow: 0.3 })); s.scale.setScalar(0.6); cafe.add(s); steam.push(s); }
  const sign = new THREE.Mesh(GEO.plane, signMaterial('별다방', '★ STAR CAFÉ', '#ff9fb8'));
  sign.scale.set(4.2, 2.1, 1); sign.position.set(0, 3.2, 7.05);
  cafe.add(wall, roof, cup, coffee, handle, sign);
  root.add(cafe);
  pc.addStatic({ kind: 'cylinder', halfH: 2.3, r: 6.8 }, { x: cafe.position.x, y: cafe.position.y + 2.3, z: cafe.position.z });
  ticks.push((t) => steam.forEach((s, i) => { const k = (t * 0.4 + i / 3) % 1; s.position.set(Math.sin(k * 6 + i) * 0.6, 9 + k * 3, 0); s.scale.setScalar(0.5 + k * 0.9); }));
  // 라떼 카운터(카페 앞)
  const counter = new THREE.Group();
  counter.name = 'station-latte';
  counter.position.copy(pc.at(STATION.latte.x, STATION.latte.z));
  const desk = new THREE.Mesh(GEO.cap, toyMat('#ffd0de'));
  desk.scale.set(0.6, 1.4, 0.6); desk.rotation.z = Math.PI / 2; desk.position.y = 0.6;
  const mug = new THREE.Mesh(GEO.cyl, toyMat('#fffaf2'));
  mug.scale.set(0.18, 0.28, 0.18); mug.position.set(0.4, 1.32, 0);
  counter.add(desk, mug);
  root.add(counter);
  // 꾸물이 상점 자리(가판대 + 차양 + 간판 — 꾸물이는 npcs-p1 이 세운다)
  const shop = new THREE.Group();
  shop.name = 'station-kkumul-shop';
  shop.position.copy(pc.at(STATION.shop.x, STATION.shop.z));
  const stall = new THREE.Mesh(GEO.cap, toyMat('#9ef0d2'));
  stall.scale.set(0.7, 1.8, 0.7); stall.rotation.z = Math.PI / 2; stall.position.y = 0.7;
  const awn = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), toyMat('#c9b6f2'));
  awn.scale.set(1, 0.4, 0.75); awn.position.y = 3.1;
  const p1 = new THREE.Mesh(GEO.cyl, toyMat('#fff1cf')); p1.scale.set(0.08, 3.1, 0.08); p1.position.set(-1.9, 1.55, 0);
  const p2 = p1.clone(); p2.position.x = 1.9;
  const ss = new THREE.Mesh(GEO.plane, signMaterial('꾸물이 상점', '우주 굿즈 🐙', '#9ef0d2'));
  ss.scale.set(2.4, 1.2, 1); ss.position.set(0, 2.2, 0.75);
  shop.add(stall, awn, p1, p2, ss);
  shop.rotation.y = Math.atan2(-STATION.shop.x, -STATION.shop.z + 10);
  root.add(shop);
  // 친구 모임 벤치
  for (const b of STATION.benches) {
    const bg = new THREE.Group();
    bg.position.copy(pc.at(b.x, b.z));
    const seat = new THREE.Mesh(GEO.cap, toyMat('#ffc59a'));
    seat.scale.set(0.35, 1.1, 0.35); seat.rotation.z = Math.PI / 2; seat.position.y = 0.45;
    const backr = seat.clone(); backr.position.set(0, 0.95, -0.3); backr.scale.set(0.25, 1.1, 0.25);
    bg.add(seat, backr);
    bg.rotation.y = Math.atan2(-b.x, -b.z);
    root.add(bg);
  }
  // 안테나 + 태양광 날개(난간 밖)
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI + 0.4;
    const wing = new THREE.Mesh(GEO.cap, toyMat('#8fd3f4', { rough: 0.3, glow: 0.15 }));
    wing.scale.set(2.2, 9, 0.25); wing.rotation.set(Math.PI / 2, 0, a + Math.PI / 2);
    wing.position.set(O.x + Math.cos(a) * (STATION.deck + 16), deckY - 1, O.z + Math.sin(a) * (STATION.deck + 16));
    root.add(wing);
  }
  const ant = new THREE.Mesh(GEO.cyl, toyMat('#dfe6ee', { metal: 0.4 }));
  ant.scale.set(0.15, 10, 0.15); ant.position.set(O.x + 30, deckY + 5, O.z - 30);
  const blink = new THREE.Mesh(GEO.sph, toyMat('#ff9fb8', { glow: 1.5 }));
  blink.scale.setScalar(0.45); blink.position.set(O.x + 30, deckY + 10.3, O.z - 30);
  root.add(ant, blink);
  ticks.push((t) => { blink.visible = Math.sin(t * 3) > -0.3; });
  // UFO 소 손님(갑판 위를 둥실)
  decoFriend(root, ticks, ufoCow(0.2), (t) => {
    const a = t * 0.1;
    return { p: v3(O.x + Math.cos(a) * 34, deckY + 4 + Math.sin(t * 0.8) * 0.6, O.z + Math.sin(a) * 34), yaw: -a };
  });
  root.children[root.children.length - 1].scale.setScalar(2.2);
  return shop.position.clone().add(v3(0, 0, 0));
}

// ───────────── 까만 도넛 ─────────────
let swirlTex: THREE.Texture | null = null;
let glowMat: THREE.MeshBasicMaterial | null = null;
let swirlDiskMat: THREE.MeshBasicMaterial | null = null;
function donutScene(pc: PlanetCtx, root: THREE.Group, ticks: PlanetScene['update'][]) {
  const O = pc.O;
  // 블랙홀(먹색 구 — 순수 검정 금지) + 빛 고리 + 소용돌이 원판
  const core = new THREE.Mesh(new THREE.SphereGeometry(14, 40, 24), toyMat('#3d3a4a', { rough: 0.3, glow: 0.05 }));
  core.position.set(O.x, O.y - 4, O.z);
  core.name = 'blackhole-core';
  glowMat ??= shared(new THREE.MeshBasicMaterial({ color: new THREE.Color('#c9a2ff').multiplyScalar(1.8) }));
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(24, 2.2, 14, 96), glowMat);
  glowRing.rotation.x = Math.PI / 2; glowRing.position.set(O.x, O.y + 1.5, O.z);
  swirlTex ??= canvasTex(512, 512, (g) => {
    const gr = g.createRadialGradient(256, 256, 30, 256, 256, 256);
    gr.addColorStop(0, 'rgba(61,58,74,1)'); gr.addColorStop(0.45, 'rgba(167,123,224,0.85)'); gr.addColorStop(0.75, 'rgba(255,159,200,0.5)'); gr.addColorStop(1, 'rgba(255,159,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(255,240,255,0.55)'; g.lineWidth = 6;
    for (let k = 0; k < 5; k++) { g.beginPath(); for (let a = 0; a < 7; a += 0.05) { const r = 40 + a * 30; const x = 256 + Math.cos(a + k * 1.25) * r, y = 256 + Math.sin(a + k * 1.25) * r; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
  }, '#a77be0');
  swirlDiskMat ??= shared(new THREE.MeshBasicMaterial({ map: swirlTex, transparent: true, depthWrite: false, opacity: 0.95 }));
  const disk = new THREE.Mesh(GEO.disc, swirlDiskMat);
  disk.scale.setScalar(DONUT.rIn + 2); disk.position.set(O.x, O.y + 3.2, O.z); disk.renderOrder = 2;
  disk.name = 'blackhole-swirl';
  root.add(core, glowRing, disk);
  ticks.push((t) => { disk.rotation.y = -t * 0.35; glowRing.scale.setScalar(1 + 0.03 * Math.sin(t * 2)); });
  // 스프링클(파스텔 막대 — 도넛 위)
  const sm: THREE.Matrix4[] = [], sc: THREE.Color[] = [];
  const r = pc.rng('planets:blackhole:sprinkles');
  for (let i = 0; i < 420 && sm.length < 360; i++) {
    const a = r() * Math.PI * 2, R = DONUT.rMid + (r() - 0.5) * DONUT.half * 1.1;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    if (nearSpawn(pc, x, z, 4)) continue;
    sm.push(mat4(O.x + x, pc.gy(x, z) + 0.1, O.z + z, 0.2, 0.6, 0.2, r() * 6.28, Math.PI / 2, 0));
    sc.push(new THREE.Color(pastel[Math.floor(r() * 6)]));
  }
  root.add(instanced(GEO.capLo, tintMat({ rough: 0.35 }), sm, sc, 'donut-sprinkles'));
  // 구멍 가장자리 표지판
  const sign = new THREE.Mesh(GEO.plane, signMaterial('블랙홀 낚시터', '🎣 빨려 들어가지 않게!', '#c9a2ff'));
  sign.scale.set(2.4, 1.2, 1);
  sign.position.copy(pc.at(0, DONUT.rIn + 9, 2.2));
  root.add(sign);
}
