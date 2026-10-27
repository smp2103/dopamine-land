// 탑 랜드마크: 별똥별섬 발사탑(80 m 비계 — 부품 수 0~6 에 따라 로켓이 단계적으로 완성된다) + 펭박사 연구소 돔,
// 반딧불버섯섬 빛나는 버섯 탑(60 m, 걸어 오르는 나선 계단 + 꼭대기 달 관측대), 산호빛섬 코코넛 탑.
// 단계 조각은 bake 가 합치지 않게 '살아 있는' 묶음으로 두되, 묶음 안은 미리 재질별로 합쳐(freeze) 그리기 호출을 아낀다.
import * as THREE from 'three';
import { bake, type MatKey } from '../props/kit';
import { add, rod, cap, cyl, sph, dome, rbox, grad, stripesY, roundExtrude, blob, V, WOOD_DARK, type Built, type Col } from './common';

// ───────── 살아 있는 묶음 미리 굽기 ─────────
const dummyMats = new Map<string, THREE.Material>();
/** 재질 키마다 자리만 차지하는 재질 — 바깥 bake(village.ts)가 살아 있는 묶음 안의 mk 메시에 진짜 재질을 건다 */
const DUMMY = new Proxy({} as Record<MatKey, THREE.Material>, {
  get: (_t, k: string) => {
    let m = dummyMats.get(k);
    if (!m) { m = new THREE.MeshStandardMaterial({ vertexColors: true }); m.name = 'village:dummy:' + k; m.userData.shared = true; dummyMats.set(k, m); }
    return m;
  },
});
/**
 * g(원점 기준, 부모 없음)를 재질별로 합친 '살아 있는' 묶음으로 바꾼다.
 * 합친 메시는 userData.mk 를 다시 달아 둬서 바깥 bake 가 진짜 재질을 끼운다. 자기 재질(빛)·글씨 판은 그대로 남는다.
 */
export function freeze(g: THREE.Group, name?: string): THREE.Group {
  const out = bake(g, DUMMY);
  out.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.mk && m.name.startsWith('props:')) m.userData.mk = m.name.slice(6) as MatKey;
  });
  out.userData.live = true;
  if (name) out.name = name;
  return out;
}

const RED = '#ff6f61', YEL = '#ffcc45', WHITE = '#fffaf6', INK = '#3d3a4a', BLUSH = '#ff9fb8';

/** 귀여운 얼굴(먹색 세로 타원 눈 + 하이라이트 2 + 볼터치) — +z 가 앞인 면 위 (0, y, z) 에 */
function face(g: THREE.Object3D, y: number, z: number, s: number, gap = 1.0) {
  for (const sx of [-1, 1]) {
    add(g, sph(0.5 * s, 24, 16), 'gloss', INK, sx * gap * s, y, z, undefined, [0.75, 1, 0.35]);
    add(g, sph(0.16 * s, 12, 10), 'matte', '#ffffff', sx * gap * s + 0.14 * s, y + 0.2 * s, z + 0.16 * s);
    add(g, sph(0.08 * s, 10, 8), 'matte', '#ffffff', sx * gap * s - 0.12 * s, y - 0.16 * s, z + 0.16 * s);
    add(g, sph(0.4 * s, 16, 12), 'matte', BLUSH, sx * (gap + 0.75) * s, y - 0.55 * s, z - 0.08 * s, undefined, [1, 0.6, 0.3]);
  }
  add(g, new THREE.TorusGeometry(0.3 * s, 0.07 * s, 10, 24, Math.PI), 'gloss', '#7a2f3a', 0, y - 0.55 * s, z + 0.04 * s, [0, 0, Math.PI]);
}

// ───────── 발사탑 ─────────
/** 발사탑 단계(GDD 6.1): 부품 수 n → 보이는 조각. 0 = 비계만 */
export const TOWER_STAGES = ['scaffold', 'body', 'nozzles', 'window', 'fins', 'tank', 'antenna'] as const;
export type TowerPiece = (typeof TOWER_STAGES)[number];
/** 단계 n(0~6, 범위 밖은 자른다)에서 보이는 조각 이름 */
export function towerPieces(n: number): TowerPiece[] {
  const k = Math.max(0, Math.min(6, Math.floor(Number.isFinite(n) ? n : 0)));
  return TOWER_STAGES.slice(0, k + 1) as TowerPiece[];
}
export const TOWER_H = 80;
/** 비계 기둥 반 간격(로켓 축에서 ±P) */
const TP = 8;

export interface TowerCtl {
  built: Built;
  /** 살아 있는 묶음(이름 'launch-tower') — 단계 조각이 들어 있다 */
  root: THREE.Group;
  pieces: Record<TowerPiece, THREE.Object3D>;
  stage: number;
  setStage(n: number): void;
  /** 지금 보이는 조각 수(비계 포함) */
  visibleCount(): number;
}

export function buildLaunchTower(): TowerCtl {
  const g = new THREE.Group();
  const cols: Col[] = [];
  const H = TOWER_H, P = TP;
  // 받침: 둥근 판 + 노랑·먹색 경고 띠
  add(g, cyl(11.5, 12, 1.2, 64), 'stone', ['#a9b1bb', '#d6dbe2'], 0, 0.6, 0);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    add(g, rbox(2.0, 0.1, 0.8, 0.08, 2), 'paint', i % 2 ? YEL : '#4a4f5c', Math.cos(a) * 10.6, 1.22, Math.sin(a) * 10.6, [0, -a, 0]);
  }
  add(g, cyl(5.6, 5.6, 0.2, 48), 'paint', '#4a4f5c', 0, 1.25, 0);
  cols.push({ kind: 'cyl', r: 12, hh: 0.6, x: 0, y: 0.6, z: 0 });
  // 기둥 4(노랑·빨강 10 m 띠) + 둥근 볼트
  const posts = [[-P, -P], [P, -P], [P, P], [-P, P]];
  for (const [x, z] of posts) {
    const pg = rbox(1.1, H, 1.1, 0.3, 2);
    stripesY(pg, [YEL, RED], 10, -H / 2);
    add(g, pg, 'paint', null, x, H / 2 + 1.2, z);
    cols.push({ kind: 'box', hx: 0.6, hy: H / 2, hz: 0.6, x, y: H / 2 + 1.2, z });
    for (let y = 11.2; y < H; y += 10) add(g, sph(0.55, 12, 8), 'gold', null, x, y, z);
  }
  // 가로대(5 m 마다) + 빗대(면마다 10 m 마다 X)
  for (let y = 6.2; y <= H + 1.2; y += 5) {
    const c = Math.round(y / 5) % 2 ? WHITE : RED;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = posts[k], [bx, bz] = posts[(k + 1) % 4];
      rod(g, V(ax, y, az), V(bx, y, bz), 0.2, 'paint', c, 6);
      if (Math.round(y) % 10 === 6 && y + 10 <= H + 1.2) {
        rod(g, V(ax, y, az), V(bx, y + 10, bz), 0.13, 'paint', WHITE, 5);
        rod(g, V(bx, y, bz), V(ax, y + 10, az), 0.13, 'paint', WHITE, 5);
      }
    }
  }
  // 정비 발판(20·40·60 m) + 로켓 쪽 팔
  for (const y of [21.2, 41.2, 61.2]) {
    add(g, rbox(2 * P + 2, 0.5, 2.4, 0.2, 2), 'paint', YEL, 0, y, P + 1.6);
    add(g, rbox(2.2, 0.5, P - 3.2, 0.2, 2), 'paint', YEL, 0, y, (P + 4.6) / 2);
    for (const sx of [-1, 1]) add(g, sph(0.35, 14, 10), 'glow', null, sx * (P + 0.6), y + 0.6, P + 2.6);
  }
  // 꼭대기 판 + 난간
  add(g, rbox(2 * P + 3, 1.2, 2 * P + 3, 0.4, 3), 'paint', YEL, 0, H + 1.8, 0);
  for (let i = 0; i < 20; i++) {
    const t = i / 20, side = Math.floor(t * 4), u = (t * 4) % 1;
    const [ax, az] = posts[side], [bx, bz] = posts[(side + 1) % 4];
    const k = (P + 1.3) / P;
    add(g, cap(0.09, 1.2, 8), 'paint', WHITE, (ax + (bx - ax) * u) * k, H + 3.1, (az + (bz - az) * u) * k);
  }
  for (let k = 0; k < 4; k++) {
    const [ax, az] = posts[k], [bx, bz] = posts[(k + 1) % 4], s = (P + 1.3) / P;
    rod(g, V(ax * s, H + 3.7, az * s), V(bx * s, H + 3.7, bz * s), 0.1, 'paint', RED, 8);
  }
  // 사다리(+x 면 바깥)
  for (const sz of [-0.5, 0.5]) add(g, cyl(0.07, 0.07, H, 6), 'gloss', '#c6ccd4', P + 0.9, H / 2 + 1.2, sz);
  for (let y = 2; y < H; y += 1.2) add(g, cyl(0.05, 0.05, 1.0, 6), 'gloss', '#c6ccd4', P + 0.9, y, 0, [Math.PI / 2, 0, 0]);
  // 연료 탱크 받침(빈 요람 — 반짝 연료 단계에서 탱크가 놓인다)
  add(g, rbox(6, 1.2, 6, 0.3, 2), 'stone', ['#a9b1bb', '#d6dbe2'], P + 7, 0.6, -2);
  for (const sz of [-1.6, 1.6]) add(g, new THREE.TorusGeometry(2.6, 0.25, 8, 24, Math.PI), 'paint', '#9aa6b4', P + 7, 1.2, -2 + sz, [0, 0, Math.PI]);
  cols.push({ kind: 'box', hx: 3, hy: 0.6, hz: 3, x: P + 7, y: 0.6, z: -2 });

  // ── 단계 조각(각자 살아 있는 묶음)
  const R = 4.6;
  const piece = (fill: (q: THREE.Group) => void, name: TowerPiece) => { const q = new THREE.Group(); fill(q); return freeze(q, 'launch-tower:' + name); };
  const lathe = (y0: number, y1: number, rf: (t: number) => number, n = 32) => {
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= n; i++) { const t = i / n; prof.push(new THREE.Vector2(Math.max(0.001, rf(t)), y0 + t * (y1 - y0))); }
    return new THREE.LatheGeometry(prof, 64);
  };
  // ① 동체 아래: 흰 몸통(빨간 띠) + 하늘색 고리
  const body = piece((q) => {
    const b = lathe(6, 30, (t) => R * (t < 0.06 ? 0.9 + t * 1.6 : 1), 24);
    stripesY(b, [WHITE, WHITE, RED], 3, 6);
    add(q, b, 'gloss', null, 0, 0, 0);
    for (const y of [12, 26]) add(q, new THREE.TorusGeometry(R * 1.01, 0.4, 12, 72), 'gloss', '#7cc8ff', 0, y, 0, [Math.PI / 2, 0, 0]);
    add(q, cyl(R, R, 0.6, 64), 'gloss', '#d4dce6', 0, 30, 0);
  }, 'body');
  // ② 엔진: 바닥 노즐 3개 + 엔진 판
  const nozzles = piece((q) => {
    add(q, cyl(R * 0.95, R * 0.95, 0.8, 56), 'gloss', ['#8f9bab', '#c6ccd4'], 0, 5.6, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const nz = lathe(1.6, 5.4, (t) => 1.9 - t * 0.9 + Math.sin(t * Math.PI) * 0.15, 16);
      grad(nz, '#7c8898', '#dfe6ee');
      add(q, nz, 'gloss', null, Math.cos(a) * 2.3, 0, Math.sin(a) * 2.3);
      add(q, new THREE.TorusGeometry(1.9, 0.14, 8, 32), 'gold', null, Math.cos(a) * 2.3, 1.65, Math.sin(a) * 2.3, [Math.PI / 2, 0, 0]);
    }
  }, 'nozzles');
  // ③ 조종석 창: 위 몸통 + 둥근 코 + 꼭대기 둥근 창(금테) + 얼굴
  const windowP = piece((q) => {
    const up = lathe(30, 58, (t) => (t < 0.5 ? R : R * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.5) / 0.5, 2)))), 32);
    stripesY(up, [WHITE, WHITE, RED], 3, 30);
    add(q, up, 'gloss', null, 0, 0, 0);
    add(q, sph(1.1, 24, 16), 'gloss', '#e8504f', 0, 57.6, 0, undefined, [1, 0.8, 1]);
    add(q, new THREE.TorusGeometry(1.9, 0.32, 14, 48), 'gold', null, 0, 45, R - 0.2);
    add(q, sph(1.8, 32, 20), 'window', null, 0, 45, R - 0.55, undefined, [1, 1, 0.35]);
    face(q, 38.5, R + 0.02, 1.7, 1.1);
  }, 'window');
  // ④ 날개: 빨간 지느러미 3장(통통한 곡선)
  const fins = piece((q) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.quadraticCurveTo(2.6, -0.4, 3.0, -7.5); s.quadraticCurveTo(1.6, -5.2, 0, -5.6); s.lineTo(0, 0);
      const fg = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 4, curveSegments: 20 });
      fg.translate(0, 0, -0.3);
      grad(fg, '#e8504f', '#ff9a9a');
      const m = add(q, fg, 'gloss', null, Math.sin(a) * (R - 0.3), 15.5, Math.cos(a) * (R - 0.3));
      m.rotation.y = a - Math.PI / 2;
    }
  }, 'fins');
  // ⑤ 반짝 연료: 옆 탱크(스스로 빛나는 재질 — 숨 쉬듯 깜빡) + 관
  const tankMat = new THREE.MeshStandardMaterial({ color: '#c9fbff', roughness: 0.25, emissive: '#5fe8ff', emissiveIntensity: 1.4 });
  const tank = piece((q) => {
    const t = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, 6.5, 10, 32), tankMat);
    t.rotation.x = Math.PI / 2;
    t.position.set(P + 7, 3.8, -2);
    t.castShadow = true;
    t.userData.live = true;
    t.name = 'launch-tower:tank-glow';
    q.add(t);
    for (const sz of [-3.2, 3.2]) add(q, new THREE.TorusGeometry(2.5, 0.18, 8, 32), 'gold', null, P + 7, 3.8, -2 + sz);
    rod(q, V(P + 4.6, 3.8, -2), V(R + 0.2, 8, 0), 0.32, 'gloss', '#9aa6b4', 10);
    rod(q, V(P + 7, 6.4, -2), V(P + 7, 9.5, -2), 0.25, 'gloss', '#9aa6b4', 10);
    add(q, sph(0.6, 16, 12), 'paint', YEL, P + 7, 9.8, -2);
  }, 'tank');
  // ⑥ 항법 칩: 꼭대기 안테나 + 깜빡이(빨강)
  const blinkMat = new THREE.MeshStandardMaterial({ color: '#ffd0d0', roughness: 0.3, emissive: '#ff3b3b', emissiveIntensity: 2 });
  const antennaP = piece((q) => {
    const m = cyl(0.22, 0.38, 10, 16);
    stripesY(m, [WHITE, RED], 2, -5);
    add(q, m, 'gloss', null, 0, H + 2.4 + 5, 0);
    for (const y of [H + 5, H + 8]) add(q, new THREE.TorusGeometry(1.1, 0.08, 8, 32), 'gloss', '#c6ccd4', 0, y, 0, [Math.PI / 2, 0, 0]);
    const dish = new THREE.SphereGeometry(2.2, 32, 10, 0, Math.PI * 2, 0, Math.PI * 0.3);
    grad(dish, '#ffffff', '#d9e6f5');
    add(q, dish, 'gloss', null, 2.6, H + 6.5, 0, [0, 0, -1.2]);
    const b = new THREE.Mesh(sph(0.75, 20, 14), blinkMat);
    b.position.set(0, H + 13, 0);
    b.userData.live = true;
    b.name = 'launch-tower:blink';
    q.add(b);
  }, 'antenna');

  const root = new THREE.Group();
  root.name = 'launch-tower';
  root.userData.live = true;
  const scaffoldMark = new THREE.Object3D();
  scaffoldMark.name = 'launch-tower:scaffold';
  root.add(scaffoldMark, body, nozzles, windowP, fins, tank, antennaP);
  g.add(root);
  const pieces: Record<TowerPiece, THREE.Object3D> = { scaffold: scaffoldMark, body, nozzles, window: windowP, fins, tank, antenna: antennaP };

  const ctl: TowerCtl = {
    built: {
      g, cols, foot: 10,
      anim: [{
        o: root,
        fn: (_o, _b, t) => {
          if (ctl.stage >= 5) tankMat.emissiveIntensity = 1.1 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.4));
          if (ctl.stage >= 6) blinkMat.emissiveIntensity = Math.sin(t * Math.PI * 1.6) > 0 ? 3.2 : 0.15;
        },
      }],
    },
    root, pieces, stage: 0,
    setStage(n) {
      const on = new Set<string>(towerPieces(n));
      ctl.stage = on.size - 1;
      for (const k of TOWER_STAGES) pieces[k].visible = on.has(k);
    },
    visibleCount: () => TOWER_STAGES.filter((k) => pieces[k].visible).length,
  };
  ctl.setStage(0);
  // 디버그: scene.getObjectByName('launch-tower').userData.setStage(3)
  root.userData.setStage = (n: number) => ctl.setStage(n);
  return ctl;
}

// ───────── 펭박사 연구소 돔 ─────────
/** 흰 돔 연구소(펭귄 얼굴 창 + 하늘색 띠 + 위성 접시 + 둥근 문). 정면(+z)이 rotY 방향(발사대 쪽) */
export function buildPengLab(): Built {
  const g = new THREE.Group();
  const R = 9;
  add(g, cyl(R + 2.2, R + 2.6, 0.8, 56), 'stone', ['#b9c1cb', '#dfe4ea'], 0, 0.4, 0);
  const wall = cyl(R, R + 0.3, 4, 64);
  grad(wall, '#d6e6f8', '#f4f9ff');
  add(g, wall, 'paint', null, 0, 2.8, 0);
  add(g, new THREE.TorusGeometry(R + 0.15, 0.4, 12, 72), 'gloss', '#5aaef0', 0, 4.8, 0, [Math.PI / 2, 0, 0]);
  const d = dome(R, 64, 24);
  grad(d, '#e8f1fb', '#ffffff');
  add(g, d, 'gloss', null, 0, 4.8, 0);
  // 돔 앞면 = 펭귄 얼굴: 까만 머리 무늬(반구 조각) + 큰 눈 + 노란 부리 + 볼터치
  const mask = new THREE.SphereGeometry(R + 0.06, 48, 16, Math.PI / 2 - 0.9, 1.8, 0.25, 0.9);
  add(g, mask, 'gloss', '#3f4a66', 0, 4.8, 0);
  const fy = 4.8 + R * 0.5, fz = R * 0.86;
  for (const sx of [-1, 1]) {
    add(g, sph(1.25, 32, 20), 'matte', '#ffffff', sx * 2.1, fy, fz, undefined, [1, 1, 0.45]);
    add(g, sph(0.72, 24, 16), 'gloss', INK, sx * 2.1, fy - 0.05, fz + 0.45, undefined, [0.8, 1, 0.4]);
    add(g, sph(0.22, 12, 10), 'matte', '#ffffff', sx * 2.1 + 0.22, fy + 0.28, fz + 0.72);
    add(g, sph(0.9, 20, 14), 'matte', BLUSH, sx * 3.7, fy - 1.3, fz - 0.6, undefined, [1, 0.6, 0.35]);
  }
  add(g, new THREE.ConeGeometry(0.8, 1.6, 24), 'gloss', '#ffb347', 0, fy - 1.3, fz + 0.9, [Math.PI / 2, 0, 0]);
  // 둥근 문 + 문틀
  const ds = new THREE.Shape(); ds.moveTo(-1.2, 0); ds.lineTo(1.2, 0); ds.lineTo(1.2, 2.2); ds.absarc(0, 2.2, 1.2, 0, Math.PI, false); ds.lineTo(-1.2, 0);
  add(g, roundExtrude(ds, 0.3, 0.1, 24), 'paint', ['#4f86c6', '#78a9e6'], 0, 0.8, R + 0.2);
  add(g, sph(0.12, 12, 10), 'gold', null, 0.8, 2.1, R + 0.42);
  for (const sx of [-1, 1]) add(g, rbox(1.6, 1.0, 0.2, 0.3, 3), 'window', null, sx * 4.6, 3.0, Math.sqrt(R * R - 4.6 * 4.6) + 0.12, [0, sx * Math.asin(4.6 / R), 0]);
  // 꼭대기: 회전 관측창 띠 + 위성 접시 + 안테나
  add(g, cyl(1.8, 2.0, 1.4, 40), 'window', null, 0, 4.8 + R - 0.1, 0);
  add(g, dome(1.9, 32, 12), 'gloss', '#5aaef0', 0, 4.8 + R + 0.6, 0);
  add(g, cap(0.12, 3.6), 'gloss', '#c6ccd4', 0, 4.8 + R + 3.4, 0);
  add(g, sph(0.45, 16, 12), 'glow', null, 0, 4.8 + R + 5.4, 0);
  const dish = new THREE.SphereGeometry(2.4, 40, 12, 0, Math.PI * 2, 0, Math.PI * 0.32);
  grad(dish, '#ffffff', '#d9e6f5');
  add(g, cap(0.2, 2.2), 'gloss', '#9aa6b4', -R * 0.62, 4.8 + R * 0.72, -R * 0.2);
  add(g, dish, 'gloss', null, -R * 0.62 - 0.6, 4.8 + R * 0.72 + 1.8, -R * 0.2, [0.3, 0, 0.9]);
  // 옆 실험 탱크(물방울 무늬 공) + 눈사람 같은 얼음 상자
  add(g, sph(1.6, 32, 20), 'gloss', ['#9fe0ff', '#e8fbff'], R + 2.2, 1.9, -3, undefined, [1, 1.1, 1]);
  add(g, rbox(1.8, 1.4, 1.8, 0.4, 3), 'ice', '#dff2ff', R + 1.8, 1.5, 2.6);
  return { g, cols: [{ kind: 'cyl', r: R, hh: 7, x: 0, y: 7, z: 0 }], foot: R + 2 };
}

// ───────── 빛나는 버섯 탑(60 m) ─────────
export const MUSH = { stemTop: 48, deck: 56.2, capR: 12.6, rise: 0.4, shelfY: 44 } as const;
/** 줄기 반경(높이 y) — 아래 7.5 → 위 4.6, 살짝 통통 */
export const mushStemR = (y: number) => {
  const t = Math.max(0, Math.min(1, y / MUSH.stemTop));
  return 7.5 - 2.9 * t + Math.sin(t * Math.PI) * 0.5;
};
export interface StairStep { x: number; y: number; z: number; ang: number; hx: number; hz: number; r: number }
/** 디딤판 반폭(나선 바깥쪽 hx, 진행 방향 hz) */
const STEP_HX = 1.6, STEP_HZ = 0.62;
/** 선반 길(줄기 → 갓 바깥) 진행 방향 반폭 */
export const SHELF_HZ = 1.4;

/** 아래 나선(줄기 표면 + 3.2 m 폭) — 0.4 m 씩 올라 선반 바로 아래 칸(43.6 m)에서 끝난다 */
function lowerSpiral(): StairStep[] {
  const out: StairStep[] = [];
  const { rise, shelfY } = MUSH;
  let ang = 0, y = rise;
  while (y <= shelfY - rise + 1e-6) {
    const r0 = mushStemR(y) + 0.1, rc = r0 + STEP_HX;
    out.push({ x: Math.cos(ang) * rc, y, z: Math.sin(ang) * rc, ang, hx: STEP_HX, hz: STEP_HZ, r: rc });
    ang += 1.0 / rc;
    y += rise;
  }
  return out;
}

/** 44 m 선반 발판(충돌체) + 선반 길이 놓인 각도. 마지막 아래 칸 앞쪽에서 시작해 아래 칸들 머리 위를 덮지 않는다 */
export interface MushShelf { cols: Col[]; land: StairStep[]; aB: number; rIn: number; rOut: number }
function shelfOf(low: StairStep[]): MushShelf {
  const { shelfY, capR } = MUSH;
  const e = low[low.length - 1];
  const rMin = e.r - e.hx;
  // 선반 길(곧은 반지름 방향 판)의 뒷면이 마지막 칸 앞면보다 (가장 안쪽 반경에서도) 앞에 오게
  const aB = e.ang + Math.asin((e.hz + 0.1) / rMin) + Math.asin(SHELF_HZ / rMin) + 0.02;
  // 그 사이는 계단과 같은 꼴의 평평한 발판(44 m)으로 메운다 — 칸끼리처럼 살짝 겹쳐 틈이 없다
  const land: StairStep[] = [];
  for (let k = 1; e.ang + k / e.r < aB; k++) {
    const a = e.ang + k / e.r;
    land.push({ x: Math.cos(a) * e.r, y: shelfY, z: Math.sin(a) * e.r, ang: a, hx: e.hx, hz: e.hz, r: e.r });
  }
  const cols: Col[] = land.map((s) => ({ kind: 'box' as const, hx: s.hx, hy: 0.2, hz: s.hz, x: s.x, y: s.y - 0.2, z: s.z, ry: -s.ang }));
  const rIn = mushStemR(shelfY) - 0.2, rOut = capR + 3.4;
  const n = 4;
  for (let i = 0; i < n; i++) {
    const rr = rIn + ((rOut - rIn) * (i + 0.5)) / n, hx = (rOut - rIn) / n / 2 + 0.05;
    cols.push({ kind: 'box', hx, hy: 0.2, hz: SHELF_HZ, x: Math.cos(aB) * rr, y: shelfY - 0.2, z: Math.sin(aB) * rr, ry: -aB });
  }
  return { cols, land, aB, rIn, rOut };
}
/** 버섯 탑 선반(충돌체·발판·각도) */
export const mushShelf = (): MushShelf => shelfOf(lowerSpiral());

/**
 * 나선 계단 디딤판(로컬). 줄기를 감고 0.4 m 씩(자동 오르기 0.45 안) 올라 44 m 선반에 닿고,
 * 선반 끝에서 갓 바깥을 감아 갓 위 달 관측대(56.2 m)까지 오른다.
 */
export function mushStairs(): StairStep[] {
  const { rise, shelfY, deck, capR } = MUSH;
  const out = lowerSpiral();
  // 선반 길 바깥 끝(갓 바깥)에서 위 나선 시작 — 첫 칸 뒷면이 선반 길 앞면에 살짝 걸친다
  const { aB } = shelfOf(out);
  const rc = capR + 1.7;
  let ang = aB + (SHELF_HZ + STEP_HZ - 0.3) / rc;
  let y = shelfY + rise;
  while (y <= deck + 1e-6) {
    out.push({ x: Math.cos(ang) * rc, y, z: Math.sin(ang) * rc, ang, hx: STEP_HX, hz: STEP_HZ, r: rc });
    ang += 1.0 / rc;
    y += rise;
  }
  return out;
}

/** 디딤판 모양(윗모서리만 깎은 팔각 단면 판, 28 삼각형) — 139칸이라 둥근 상자(108)보다 훨씬 가볍다 */
function stepGeo(hx: number, hz: number): THREE.BufferGeometry {
  const w = hz + 0.06, c = 0.1, h = 0.18;
  const sh = new THREE.Shape();
  sh.moveTo(-w, -h); sh.lineTo(w, -h); sh.lineTo(w, h - c); sh.lineTo(w - c, h); sh.lineTo(-w + c, h); sh.lineTo(-w, h - c); sh.lineTo(-w, -h);
  const g = new THREE.ExtrudeGeometry(sh, { depth: hx * 2, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -hx);
  g.rotateY(Math.PI / 2); // 돌출 방향(z) → 반지름 방향(x)
  return g;
}

export function buildMushTower(rng: () => number): Built {
  const g = new THREE.Group();
  const cols: Col[] = [];
  const { stemTop, deck, capR, shelfY } = MUSH;
  // 줄기(lathe, 크림색 + 아래로 갈수록 살짝 분홍)
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) { const y = (i / 24) * (stemTop + 1); prof.push(new THREE.Vector2(mushStemR(y), y)); }
  const stem = new THREE.LatheGeometry(prof, 40);
  grad(stem, '#f6dfe6', '#fff8ea');
  add(g, stem, 'matte', null, 0, 0, 0);
  for (let y = 0; y < stemTop; y += 8) cols.push({ kind: 'cyl', r: mushStemR(y + 4) - 0.1, hh: 4, x: 0, y: y + 4, z: 0 });
  // 줄기 둘레 빛 점(밤에 빛남)
  for (let i = 0; i < 26; i++) {
    const y = 3 + rng() * (stemTop - 6), a = rng() * Math.PI * 2, r = mushStemR(y);
    const m = add(g, sph(0.35 + rng() * 0.25, 10, 6), 'glow', null, Math.cos(a) * r, y, Math.sin(a) * r, undefined, [1, 1, 0.5]);
    m.lookAt(Math.cos(a) * r * 2, y, Math.sin(a) * r * 2);
  }
  // 갓: 위가 납작한 통통 갓(관측대 바닥) + 아래 주름 고리
  const cp: THREE.Vector2[] = [];
  const c0 = stemTop + 0.3;
  cp.push(new THREE.Vector2(4.4, c0));
  for (let i = 0; i <= 12; i++) { const t = i / 12; cp.push(new THREE.Vector2(4.4 + (capR - 1.6 - 4.4) * t, c0 + Math.sin(t * Math.PI * 0.5) * 0.6)); }
  for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (i / 16) * Math.PI; cp.push(new THREE.Vector2(capR - 1.6 + Math.cos(a) * 1.6, c0 + 0.6 + (deck - 0.05 - c0 - 0.6) * ((Math.sin(a) + 1) / 2))); }
  for (let i = 0; i <= 12; i++) { const t = i / 12; cp.push(new THREE.Vector2((capR - 1.6) * (1 - t) + 0.001, deck - 0.05 + Math.sin(t * Math.PI * 0.5) * 0.05)); }
  const capG = new THREE.LatheGeometry(cp, 48);
  grad(capG, '#ff5e8a', '#ff9fc0', 0.7);
  add(g, capG, 'gloss', null, 0, 0, 0);
  add(g, new THREE.TorusGeometry(capR - 2.2, 0.35, 8, 48), 'matte', '#fff2dc', 0, c0 + 0.1, 0, [Math.PI / 2, 0, 0]);
  cols.push({ kind: 'cyl', r: capR, hh: (deck - c0) / 2, x: 0, y: (deck + c0) / 2, z: 0 });
  // 갓 위 흰 점(빛)
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, r = 3 + rng() * (capR - 5);
    add(g, sph(0.6 + rng() * 0.5, 12, 6), 'glow', null, Math.cos(a) * r, deck - 0.1, Math.sin(a) * r, undefined, [1, 0.25, 1]);
  }
  // 갓 옆구리 큰 흰 점(버섯다운 물방울 무늬) — 둥근 테두리 위에 납작하게
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng() * 0.2, y = c0 + 1.6 + (i % 3) * 1.9 + rng() * 0.6;
    const m = add(g, sph(0.9 + rng() * 0.5, 12, 8), 'matte', '#fff6f0', Math.cos(a) * (capR - 0.05), y, Math.sin(a) * (capR - 0.05), undefined, [1, 1, 0.22]);
    m.lookAt(Math.cos(a) * capR * 2, y, Math.sin(a) * capR * 2);
  }
  // 달 관측대: 나무 바닥 원판 + 난간 + 망원경 + 초승달 장식
  const steps = mushStairs();
  const topAng = steps[steps.length - 1].ang;
  add(g, cyl(7.5, 7.5, 0.3, 56), 'wood', ['#a77650', '#c8955f'], 0, deck + 0.1, 0);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const da = Math.atan2(Math.sin(a - topAng), Math.cos(a - topAng));
    if (Math.abs(da) < 0.3) continue; // 계단이 올라오는 쪽은 열어 둔다
    add(g, cap(0.09, 1.0, 8), 'wood', WOOD_DARK, Math.cos(a) * (capR - 0.6), deck + 0.6, Math.sin(a) * (capR - 0.6));
  }
  // 난간 손잡이(열린 쪽은 비운 호)
  add(g, new THREE.TorusGeometry(capR - 0.6, 0.09, 6, 64, Math.PI * 2 - 0.6), 'wood', '#c8955f', 0, deck + 1.15, 0, [Math.PI / 2, 0, topAng + 0.3]);
  const tel = new THREE.Group();
  add(tel, cyl(0.5, 0.35, 3.2, 24), 'gloss', '#5aaef0', 0, 0, 0);
  add(tel, cyl(0.62, 0.62, 0.3, 24), 'gold', null, 0, 1.6, 0);
  tel.position.set(-2, deck + 2.0, -1.5);
  tel.rotation.set(-0.7, 0.4, 0);
  g.add(tel);
  for (const sx of [-0.5, 0.5]) rod(g, V(-2 + sx, deck + 0.25, -1.5 + 0.4), V(-2, deck + 1.6, -1.5), 0.07, 'wood', WOOD_DARK, 6);
  // 초승달(가운데 기둥 위) — 밤에 은은히
  add(g, cap(0.16, 3.6), 'wood', WOOD_DARK, 2.4, deck + 2.0, 1.6);
  const moon = new THREE.Shape();
  moon.absarc(0, 0, 1.6, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0.7, 0.35, 1.3, 0, Math.PI * 2, true); moon.holes.push(hole);
  add(g, roundExtrude(moon, 0.4, 0.12, 20), 'glow', null, 2.4, deck + 4.6, 1.6);
  // 선반 버섯(아래 나선 끝 → 위 나선 시작을 잇는 다리) + 장식 선반 몇 개
  {
    const sf = mushShelf();
    cols.push(...sf.cols);
    const { aB, rIn, rOut } = sf;
    const rm = (rIn + rOut) / 2, cx = Math.cos(aB) * rm, cz = Math.sin(aB) * rm;
    // 딛는 판(위가 평평 = 충돌체와 같은 높이) + 그 아래 통통한 버섯 갓 받침
    add(g, rbox(rOut - rIn, 0.4, SHELF_HZ * 2, 0.18, 2), 'wood', '#e3b07c', cx, shelfY - 0.2, cz, [0, -aB, 0]);
    const sh = new THREE.SphereGeometry(1, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    grad(sh, '#fff4f8', '#ffd0e2');
    add(g, sh, 'gloss', null, cx, shelfY - 0.38, cz, [Math.PI, aB, 0], [(rOut - rIn) / 2 + 0.6, 0.9, SHELF_HZ + 0.7]);
    add(g, new THREE.TorusGeometry(1, 0.12, 6, 32), 'matte', '#fff2dc', cx, shelfY - 0.4, cz, [Math.PI / 2, 0, -aB], [(rOut - rIn) / 2 + 0.6, SHELF_HZ + 0.7, 1]);
    // 마지막 아래 칸 → 선반 길 사이 평평한 발판
    for (const s of sf.land) add(g, stepGeo(s.hx, s.hz), 'wood', '#e3b07c', s.x, s.y - 0.18, s.z, [0, -s.ang, 0]);
  }
  for (let i = 0; i < 5; i++) {
    const y = 8 + i * 7.5, a = i * 2.2 + 1.1, r = mushStemR(y);
    const sh = new THREE.SphereGeometry(2.4, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    grad(sh, ['#ffb3d1', '#b48cf0', '#ffcf6a'][i % 3], '#ffffff');
    add(g, sh, 'gloss', null, Math.cos(a) * (r + 1.2), y, Math.sin(a) * (r + 1.2), undefined, [1, 0.42, 1]);
  }
  // 계단 디딤판(통통한 버섯 판) + 12칸마다 작은 버섯 등
  const stepCols = ['#c98a5a', '#d9a06c'];
  steps.forEach((s, i) => {
    add(g, stepGeo(s.hx, s.hz), 'wood', stepCols[i % 2], s.x, s.y - 0.18, s.z, [0, -s.ang, 0]);
    cols.push({ kind: 'box', hx: s.hx, hy: 0.2, hz: s.hz, x: s.x, y: s.y - 0.2, z: s.z, ry: -s.ang });
    if (i % 12 === 6) {
      const ox = Math.cos(s.ang) * (s.r + s.hx - 0.25), oz = Math.sin(s.ang) * (s.r + s.hx - 0.25);
      add(g, cyl(0.08, 0.1, 1.0, 8), 'matte', '#fff3e0', ox, s.y + 0.5, oz);
      add(g, dome(0.36, 10, 5), 'glow', null, ox, s.y + 1.0, oz);
    }
  });
  // 바닥 입구 아치 표지(첫 계단 앞)
  add(g, blob(2.2, 0.35, 0.1, 5, 3), 'matte', ['#6fbf5e', '#8fdc7a'], Math.cos(-0.3) * 9.6, 0.3, Math.sin(-0.3) * 9.6);
  return { g, cols, foot: 8 };
}

// ───────── 코코넛 탑(산호빛섬) ─────────
/** 야자 줄기 마디 탑(24 m) 꼭대기에 반쪽 코코넛 전망대 + 야자잎 왕관 + 매달린 코코넛 */
export function buildCoconutTower(rng: () => number): Built {
  const g = new THREE.Group();
  const H = 24;
  add(g, blob(4.6, 0.25, 0.1, 9, 4), 'matte', ['#e8cf98', '#f6e3b4'], 0, 0.2, 0);
  for (let i = 0; i < 12; i++) {
    const y0 = i * (H / 12), r = 2.5 - i * 0.07;
    const seg = cyl(r, r - 0.22, H / 12 + 0.05, 32);
    grad(seg, i % 2 ? '#a8754b' : '#9a6440', '#c8955f');
    add(g, seg, 'wood', null, Math.sin(i * 0.35) * 0.25, y0 + H / 24, 0);
    add(g, new THREE.TorusGeometry(r - 0.08, 0.16, 8, 40), 'wood', WOOD_DARK, Math.sin(i * 0.35) * 0.25, y0 + 0.05, 0, [Math.PI / 2, 0, 0]);
  }
  // 반쪽 코코넛 전망대(속은 하얀 과육)
  const shell = new THREE.SphereGeometry(4.4, 48, 18, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  grad(shell, '#5a3b28', '#8a5a3a');
  add(g, shell, 'wood', null, 0, H + 2.4, 0);
  add(g, new THREE.TorusGeometry(4.3, 0.35, 12, 64), 'matte', '#fff8ec', 0, H + 2.4, 0, [Math.PI / 2, 0, 0]);
  add(g, cyl(4.0, 4.0, 0.2, 48), 'wood', ['#c8955f', '#e0b07a'], 0, H + 1.4, 0);
  // 야자잎 왕관
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng() * 0.2;
    const leaf = new THREE.Group();
    const lg = new THREE.SphereGeometry(1, 24, 8);
    grad(lg, '#4fb35a', '#9be27a');
    add(leaf, lg, 'matte', null, 3.6, 0, 0, undefined, [4.2, 0.16, 1.1]);
    leaf.rotation.set(0, -a, -0.35 - rng() * 0.25);
    leaf.position.set(0, H + 7.2, 0);
    g.add(leaf);
  }
  add(g, cyl(0.6, 0.9, 4.2, 20), 'wood', ['#9a6440', '#b98352'], 0, H + 5.0, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    add(g, sph(0.75, 24, 16), 'wood', ['#6a4430', '#8a5a3a'], Math.cos(a) * 1.2, H + 6.4, Math.sin(a) * 1.2);
  }
  // 줄사다리 + 깃발
  for (let y = 1; y < H; y += 1.0) add(g, cyl(0.05, 0.05, 1.2, 6), 'wood', '#d9b77a', 0, y, 2.6, [0, 0, Math.PI / 2]);
  for (const sx of [-0.55, 0.55]) add(g, cyl(0.05, 0.05, H, 6), 'wood', '#d9b77a', sx, H / 2, 2.6);
  add(g, cap(0.07, 3), 'wood', WOOD_DARK, 3.2, H + 4.2, 0);
  add(g, rbox(0.06, 1.0, 1.6, 0.05, 2), 'cloth', '#ff8a6a', 3.2, H + 5.2, 0.8);
  return { g, cols: [{ kind: 'cyl', r: 2.5, hh: H / 2, x: 0, y: H / 2, z: 0 }], foot: 4 };
}
