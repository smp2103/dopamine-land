// 해적 난파선 꿀꺽호(GDD 2.4 · 3.3 P0-7): 통통한 해적선이 해저(−14m)에 비스듬히 앉아 있다.
// 기울어진 돛대·찢어진 돛·웃는 해적 깃발, 앞이 트인 선실(은상자·선장의 망원경), 갑판 금화단지 3, 선체 구멍에서 빼꼼 곰치.
// 좌표: 원점 = 배 가운데 해저, +Z = 뱃머리. 기울기는 group 회전에 들어 있다(갑판 높이 계산은 기울기를 무시한 근사).
import * as THREE from 'three';
import { at, cyl, ell, merge, paint, paintFn, sph, torus, type Geo } from './kit';

const PI = Math.PI;
const C = (h: string) => new THREE.Color(h);

/** 배 치수(m) */
export const GG = {
  /** 선체 반폭·반길이·깊이 */
  hw: 3.3, hl: 7.4, hd: 2.9,
  /** 해저에서 갑판까지 */
  deck: 2.75,
  /** 선실(배 뒤쪽) */
  cabin: { z: -4.3, w: 3.6, d: 2.9, h: 2.3 },
  /** 기울기(옆으로 · 앞뒤) */
  roll: 0.16, pitch: -0.05,
} as const;

/** 로컬 자리들(배 좌표) — 상호작용 위치는 이걸 세상 좌표로 바꿔 쓴다 */
export const GG_SPOTS = {
  chest: new THREE.Vector3(0.5, GG.deck + 0.02, GG.cabin.z + 0.85),
  spyglass: new THREE.Vector3(-0.95, GG.deck + 0.55, GG.cabin.z - 0.7),
  jars: [new THREE.Vector3(1.6, GG.deck, 2.2), new THREE.Vector3(-1.7, GG.deck, 0.4), new THREE.Vector3(4.4, 0, -1.8)],
  moray: new THREE.Vector3(GG.hw * 0.93, 1.55, 1.6),
};

/** (lx, lz) 가 갑판 위인가 — 갑판 높이(배 좌표 y) 또는 null */
export function deckHeightLocal(lx: number, lz: number): number | null {
  const e = (lx / (GG.hw * 0.95)) ** 2 + (lz / (GG.hl * 0.95)) ** 2;
  return e <= 1 ? GG.deck : null;
}

function planks(a: string, b: string, k = 20) {
  return (v: THREE.Vector3, o: THREE.Color) => { o.copy(C(a)).lerp(C(b), 0.5 + 0.5 * Math.sin(v.y * k)); if (v.y < 0.7) o.lerp(C('#7fc9a8'), 0.4 * (1 - v.y / 0.7)); };
}

function hullGeo(): Geo {
  const p: Geo[] = [];
  // 통통한 아래 반구 선체
  const shell = new THREE.SphereGeometry(1, 48, 24, 0, PI * 2, PI / 2, PI / 2).scale(GG.hw, GG.hd, GG.hl);
  p.push(at(paintFn(shell, (v, o) => { o.copy(C('#d9a06a')).lerp(C('#a8764f'), 0.5 + 0.5 * Math.sin(v.y * 7)); if (v.y < -2.1) o.lerp(C('#7fc9a8'), 0.5); }), 0, GG.hd, 0));
  // 갑판
  p.push(at(paintFn(ell(GG.hw * 0.97, 0.12, GG.hl * 0.97, 40, 10), (v, o) => { o.copy(C('#f4c690')).lerp(C('#d39a62'), Math.sin(v.x * 8) > 0.8 ? 0.7 : 0.15); }), 0, GG.deck, 0));
  // 뱃전 둥근 테(산호색)
  p.push(at(paint(torus(1, 0.16, 10, 64).scale(GG.hw, GG.hl, 1).rotateX(PI / 2), '#ff8a7a', '#e86a5e'), 0, GG.hd + 0.08, 0));
  // 대포 구멍(금 테) — 좌우 3개씩
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const z = -2 + i * 2.2, x = s * GG.hw * Math.sqrt(Math.max(0, 1 - (z / GG.hl) ** 2)) * 0.96;
    p.push(at(paint(torus(0.26, 0.07, 8, 20), '#ffcf4a', '#e0a92e'), x, GG.hd - 0.65, z, 0, PI / 2, 0));
    p.push(at(paint(cyl(0.21, 0.21, 0.06, 18), '#3b5bb5', '#24376e'), x, GG.hd - 0.65, z, 0, 0, PI / 2));
  }
  // 뱃머리 기움 돛대
  p.push(at(paint(cyl(0.1, 0.14, 3.2, 12), '#c98f55', '#9a6a46'), 0, GG.hd + 0.6, GG.hl + 0.6, 1.1, 0, 0));
  // 선체 옆 곰치 구멍(어둠)
  p.push(at(paint(new THREE.CircleGeometry(0.42, 24), '#24376e', '#3b5bb5'), GG_SPOTS.moray.x + 0.02, GG_SPOTS.moray.y, GG_SPOTS.moray.z, 0, PI / 2, 0));
  p.push(at(paint(torus(0.44, 0.08, 8, 22), '#a8764f'), GG_SPOTS.moray.x, GG_SPOTS.moray.y, GG_SPOTS.moray.z, 0, PI / 2, 0));
  // 따개비·불가사리 장식
  for (let i = 0; i < 14; i++) {
    const z = -6 + i * 0.9, s = i % 2 ? 1 : -1, x = s * GG.hw * Math.sqrt(Math.max(0, 1 - (z / GG.hl) ** 2)) * 0.9;
    p.push(at(paint(sph(0.09 + (i % 3) * 0.03, 10, 8), '#fff1cf', '#e9d3a8'), x, 0.9 + (i % 4) * 0.35, z));
  }
  return merge(p);
}

function cabinGeo(): Geo {
  const p: Geo[] = [];
  const { z, w, d, h } = GG.cabin;
  const y0 = GG.deck;
  const wood = planks('#f0b878', '#c98f55', 9);
  // 뒤 벽·옆 벽(앞은 활짝 — 안이 보인다)
  p.push(at(paintFn(new THREE.BoxGeometry(w, h, 0.18, 1, 6, 1), wood), 0, y0 + h / 2, z - d / 2));
  for (const s of [-1, 1]) p.push(at(paintFn(new THREE.BoxGeometry(0.18, h, d, 1, 6, 1), wood), s * w / 2, y0 + h / 2, z));
  // 앞 벽 양쪽 기둥 + 아치 문틀
  for (const s of [-1, 1]) p.push(at(paintFn(new THREE.BoxGeometry(0.7, h, 0.18, 1, 6, 1), wood), s * (w / 2 - 0.35), y0 + h / 2, z + d / 2));
  p.push(at(paint(torus(1.1, 0.12, 8, 24, PI), '#ff8a7a', '#e86a5e'), 0, y0 + h - 1.15, z + d / 2 + 0.04));
  // 둥근 지붕(반원통)
  const roof = new THREE.CylinderGeometry(w / 2 + 0.25, w / 2 + 0.25, d + 0.5, 28, 1, false, 0, PI);
  p.push(at(paint(roof, '#ff9f8a', '#e86a5e'), 0, y0 + h, z, 0, 0, PI / 2));
  // 둥근 창(옆)
  for (const s of [-1, 1]) {
    p.push(at(paint(torus(0.3, 0.07, 8, 20), '#ffcf4a'), s * (w / 2 + 0.06), y0 + h * 0.6, z, 0, PI / 2, 0));
    p.push(at(paint(cyl(0.26, 0.26, 0.05, 18), '#bfe9ff', '#8fd3f4'), s * (w / 2 + 0.06), y0 + h * 0.6, z, 0, 0, PI / 2));
  }
  // 선실 안: 작은 탁자(망원경 자리)·통
  p.push(at(paint(cyl(0.45, 0.45, 0.08, 20), '#f0b878', '#c98f55'), GG_SPOTS.spyglass.x, y0 + 0.5, GG_SPOTS.spyglass.z));
  p.push(at(paint(cyl(0.1, 0.14, 0.5, 10), '#c98f55'), GG_SPOTS.spyglass.x, y0 + 0.25, GG_SPOTS.spyglass.z));
  p.push(at(paint(cyl(0.38, 0.38, 0.8, 16), '#d9a06a', '#a8764f'), -1.25, y0 + 0.4, z + 0.7));
  p.push(at(paint(torus(0.39, 0.04, 6, 20).rotateX(PI / 2), '#9aa0b8'), -1.25, y0 + 0.6, z + 0.7));
  return merge(p);
}

function mastGeo(): { mast: Geo; sail: Geo; flag: Geo } {
  const m: Geo[] = [];
  m.push(at(paint(cyl(0.2, 0.26, 9.2, 16), '#c98f55', '#9a6a46'), 0, 4.6, 0));
  m.push(at(paint(cyl(0.09, 0.09, 4.2, 10), '#b07a4c'), 0, 6.4, 0.05, 0, 0, PI / 2));
  // 망대(둥근 바구니)
  m.push(at(paint(cyl(0.75, 0.55, 0.6, 20, ), '#d9a06a', '#a8764f'), 0, 8.4, 0));
  m.push(at(paint(torus(0.75, 0.07, 8, 24).rotateX(PI / 2), '#ff8a7a'), 0, 8.72, 0));
  // 찢어진 돛(분홍·크림 줄)
  const sail = new THREE.PlaneGeometry(3.6, 3.4, 14, 10);
  const sp = sail.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i);
    sp.setZ(i, Math.sin(x * 1.4) * 0.3 + Math.sin(y * 1.8) * 0.12);
    // 아래 가장자리 너덜너덜
    if (y < -1.5) sp.setY(i, y + Math.abs(Math.sin(x * 4.2)) * 0.5);
  }
  sail.computeVertexNormals();
  const sailG = merge([at(paintFn(sail, (v, o) => { o.set(Math.floor((v.x + 1.8) / 0.6) % 2 ? '#fff1cf' : '#ffb3c0'); }), 0, 4.6, 0.25)]);
  // 웃는 해적 깃발(남색 바탕 + 하얀 동그라미 얼굴)
  const flag = new THREE.PlaneGeometry(1.5, 1.0, 16, 10);
  const fp = flag.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 3) * 0.08);
  flag.computeVertexNormals();
  const flagG = merge([at(paintFn(flag, (v, o) => {
    o.set('#3b5bb5');
    const fx = v.x - 0.05, fy = v.y;
    const d = Math.hypot(fx, fy * 1.1);
    if (d < 0.32) o.set('#fffaf2');
    if (Math.hypot(fx - 0.11, fy - 0.06) < 0.05 || Math.hypot(fx + 0.11, fy - 0.06) < 0.05) o.set('#3d3a4a');
    if (Math.abs(Math.hypot(fx, fy + 0.02) - 0.15) < 0.03 && fy < -0.04) o.set('#ff6b6b');
    if (Math.hypot(fx - 0.2, fy + 0.06) < 0.045 || Math.hypot(fx + 0.2, fy + 0.06) < 0.045) o.set('#ff9fb8');
  }), 0.8, 9.6, 0)]);
  return { mast: merge(m), sail: sailG, flag: flagG };
}

/** 은상자 몸통·뚜껑(뚜껑은 뒤쪽 경첩 기준으로 따로 돈다) */
export function chestGeo(): { body: Geo; lid: Geo } {
  const silver = (v: THREE.Vector3, o: THREE.Color) => { o.copy(C('#dfe6ee')).lerp(C('#b8c4d8'), 0.5 + 0.5 * Math.sin(v.x * 18)); };
  const body: Geo[] = [];
  body.push(at(paintFn(new THREE.BoxGeometry(1.0, 0.55, 0.65, 4, 3, 3), silver), 0, 0.275, 0));
  for (const x of [-0.35, 0.35]) body.push(at(paint(new THREE.BoxGeometry(0.08, 0.57, 0.67), '#8aa0b8'), x, 0.275, 0));
  body.push(at(paint(new THREE.BoxGeometry(0.18, 0.2, 0.06), '#ffcf4a', '#e0a92e'), 0, 0.42, 0.34));
  body.push(at(paint(sph(0.04, 10, 8), '#3d3a4a'), 0, 0.4, 0.375));
  const lid: Geo[] = [];
  const top = new THREE.CylinderGeometry(0.33, 0.33, 1.0, 20, 1, false, 0, PI);
  lid.push(at(paintFn(top, silver), 0, 0, 0.325, 0, 0, PI / 2));
  for (const x of [-0.35, 0.35]) lid.push(at(paint(new THREE.CylinderGeometry(0.345, 0.345, 0.08, 20, 1, false, 0, PI), '#8aa0b8'), x, 0, 0.325, 0, 0, PI / 2));
  return { body: merge(body), lid: merge(lid) };
}

export interface GgulkkeokParts {
  group: THREE.Group;
  /** 은상자 뚜껑(열면 뒤로 젖힌다) */
  lid: THREE.Object3D;
  /** 상자 반짝이 */
  sparkle: THREE.Object3D;
  /** 망원경 자리 표시(주우면 숨긴다) */
  spyglass: THREE.Object3D;
  /** 곰치(흔들기) */
  moray: THREE.Object3D;
  flag: THREE.Object3D;
}

/**
 * 꿀꺽호 한 척. mats 는 ocean.ts 의 공유 재질, extra 는 망원경·곰치처럼 생물 모델(눈 달린 그룹)을 넘겨받는다.
 */
export function buildGgulkkeok(mats: { wood: THREE.Material; sail: THREE.Material; metal: THREE.Material; glow: THREE.Material }, extra: { spyglass: THREE.Object3D; moray: THREE.Object3D; sparkle: THREE.Object3D }): GgulkkeokParts {
  const group = new THREE.Group();
  group.name = 'ocean-ggulkkeok';
  const ship = new THREE.Group();
  ship.rotation.set(GG.pitch, 0, GG.roll);
  group.add(ship);
  const mesh = (g: Geo, m: THREE.Material, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; ship.add(o); return o; };
  mesh(hullGeo(), mats.wood);
  mesh(cabinGeo(), mats.wood);
  const M = mastGeo();
  // 기울어진 돛대(뱃머리 쪽 갑판에서 옆으로 25°)
  const mast = new THREE.Group();
  mast.position.set(0, GG.deck, 0.9);
  mast.rotation.set(0.12, 0, -0.44);
  ship.add(mast);
  for (const [g, m] of [[M.mast, mats.wood], [M.sail, mats.sail]] as const) { const o = new THREE.Mesh(g, m); o.castShadow = true; mast.add(o); }
  const flag = new THREE.Mesh(M.flag, mats.sail);
  mast.add(flag);
  // 은상자
  const C2 = chestGeo();
  const chest = new THREE.Group();
  chest.position.copy(GG_SPOTS.chest);
  chest.rotation.y = 0.25;
  ship.add(chest);
  const cb = new THREE.Mesh(C2.body, mats.metal); cb.castShadow = true; chest.add(cb);
  const lid = new THREE.Group();
  lid.position.set(0, 0.55, -0.325);
  chest.add(lid);
  lid.add(new THREE.Mesh(C2.lid, mats.metal));
  extra.sparkle.position.set(0, 1.05, 0);
  chest.add(extra.sparkle);
  // 망원경(유물) — 선실 탁자 위
  extra.spyglass.position.copy(GG_SPOTS.spyglass);
  extra.spyglass.rotation.set(0, 0.8, 0.1);
  ship.add(extra.spyglass);
  // 곰치 — 선체 구멍에서 옆으로 빼꼼
  extra.moray.position.copy(GG_SPOTS.moray);
  extra.moray.rotation.set(0, PI / 2, 0);
  ship.add(extra.moray);
  // 해초가 감긴 선체 둘레 — 금화단지 받침 모래 둔덕
  const mound = new THREE.Mesh(merge([at(paint(ell(1.1, 0.25, 1.1, 20, 10), '#f4e2b0', '#e9d3a8'), 0, 0, 0)]), mats.wood);
  mound.position.copy(GG_SPOTS.jars[2]);
  group.add(mound);
  return { group, lid, sparkle: extra.sparkle, spyglass: extra.spyglass, moray: extra.moray, flag };
}

/** 배 좌표 → 세상 좌표(group 이 (x, y, z), yaw 로 놓였을 때, 기울기 포함) */
export function ggToWorld(local: THREE.Vector3, base: { x: number; y: number; z: number; yaw: number }, out = new THREE.Vector3()): THREE.Vector3 {
  const e = new THREE.Euler(GG.pitch, 0, GG.roll);
  out.copy(local).applyEuler(e);
  out.applyAxisAngle(new THREE.Vector3(0, 1, 0), base.yaw);
  return out.add(new THREE.Vector3(base.x, base.y, base.z));
}
/** 세상 (x, z) → 배 좌표 (lx, lz)(기울기 무시) */
export function worldToGg(x: number, z: number, base: { x: number; z: number; yaw: number }): { lx: number; lz: number } {
  const dx = x - base.x, dz = z - base.z, c = Math.cos(-base.yaw), s = Math.sin(-base.yaw);
  return { lx: dx * c + dz * s, lz: -dx * s + dz * c };
}

