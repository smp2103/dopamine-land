// 부표 우체통 6(GDD 2.4 ①~⑥): 섬 사이 바다에 동동 뜬 빨강·흰 부표 + 하늘색 우체통 + 빨간 깃발 + 꼬마 등.
// 통째로 '살아 있는' 묶음(안은 재질별로 미리 합침)이라 파도를 따라 출렁인다 —
// game.ocean?.waveAt 를 그때그때 읽고(없으면 사인 파도), 편지 주고받기 상호작용은 calendar 가 붙인다.
import * as THREE from 'three';
import { add, cap, cyl, sph, dome, rbox, stripesY, label, type Built } from './common';
import { freeze } from './tower';

export const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
const INK = '#3d3a4a', BLUSH = '#ff9fb8';

export interface BuoyCtl {
  id: string;
  /** 1부터 */
  n: number;
  x: number;
  z: number;
  built: Built;
  /** 살아 있는 묶음 'buoy-<n>' — 출렁이는 본체 */
  root: THREE.Group;
  /** 지금 높이(수면 출렁임 포함) */
  y(): number;
}

/** 파도 높이: ocean 이 있으면 그 값(env.waveMul 포함), 없거나 이상하면 부드러운 사인 둘의 합 */
export function bobHeight(ocean: { waveAt(x: number, z: number, t: number): number } | null | undefined, x: number, z: number, t: number, phase = 0): number {
  let w = NaN;
  try { w = ocean && typeof ocean.waveAt === 'function' ? ocean.waveAt(x, z, t) : NaN; } catch { w = NaN; }
  if (Number.isFinite(w)) return w;
  return Math.sin(t * 1.15 + phase) * 0.22 + Math.sin(t * 0.63 + phase * 1.7) * 0.1;
}

/** 부표 하나. 수면(y=0)에 놓는다. ocean() 은 매 프레임 게으르게 읽는다 */
export function buildBuoy(id: string, n: number, x: number, z: number, ocean: () => { waveAt(x: number, z: number, t: number): number } | null | undefined, phase = 0): BuoyCtl {
  const q = new THREE.Group();
  // 뜨는 몸통: 통통한 빨강·흰 줄 공 + 노란 고리(수면선)
  const fl = new THREE.SphereGeometry(1.7, 40, 24);
  fl.scale(1, 0.78, 1);
  stripesY(fl, ['#ff6f6f', '#ffffff'], 0.55, -1.4);
  add(q, fl, 'gloss', null, 0, 0.25, 0);
  add(q, new THREE.TorusGeometry(1.72, 0.2, 12, 56), 'paint', '#ffcc45', 0, 0.1, 0, [Math.PI / 2, 0, 0]);
  // 얼굴(앞 +z): 눈 + 하이라이트 + 볼터치 + 웃는 입
  for (const sx of [-1, 1]) {
    add(q, sph(0.17, 16, 12), 'gloss', INK, sx * 0.42, 0.62, 1.5, undefined, [0.75, 1, 0.45]);
    add(q, sph(0.055, 10, 8), 'matte', '#ffffff', sx * 0.42 + 0.05, 0.69, 1.58);
    add(q, sph(0.13, 14, 10), 'matte', BLUSH, sx * 0.78, 0.45, 1.36, [0, sx * 0.5, 0], [1, 0.6, 0.35]);
  }
  add(q, new THREE.TorusGeometry(0.12, 0.03, 8, 20, Math.PI), 'gloss', '#7a2f3a', 0, 0.48, 1.55, [0, 0, Math.PI]);
  // 기둥 + 우체통(하늘색, 둥근 지붕) + 투입구 + 깃발
  add(q, cyl(0.12, 0.14, 1.6, 16), 'gloss', '#e6ecf3', 0, 1.9, 0);
  const box = rbox(1.0, 0.75, 1.3, 0.16, 3);
  add(q, box, 'paint', ['#4f9ee8', '#7cc0ff'], 0, 2.95, 0);
  // 둥근 지붕: 반원통(위쪽 반)을 앞뒤(z)로 눕힌다
  const roof = new THREE.CylinderGeometry(0.5, 0.5, 1.3, 32, 1, false, Math.PI / 2, Math.PI);
  roof.rotateX(Math.PI / 2);
  add(q, roof, 'paint', '#7cc0ff', 0, 3.32, 0);
  add(q, rbox(0.5, 0.08, 0.05, 0.03, 2), 'matte', '#2f4a66', 0, 3.05, 0.66);
  add(q, cap(0.035, 0.7, 8), 'gloss', '#c6ccd4', 0.56, 3.3, -0.2);
  add(q, rbox(0.04, 0.3, 0.42, 0.03, 2), 'paint', '#ff5e5e', 0.56, 3.55, 0.02);
  // 꼬마 등(밤에 빛나는 glow) + 금 구슬
  add(q, cap(0.05, 0.5, 8), 'gloss', '#c6ccd4', 0, 3.95, 0);
  add(q, sph(0.2, 16, 12), 'glow', null, 0, 4.35, 0);
  add(q, dome(0.24, 16, 8), 'gold', null, 0, 4.5, 0);
  // 번호 판(①~⑥) — 글씨 판은 캔버스라 DOM 이 있을 때만
  if (typeof document !== 'undefined') {
    for (const ry of [0, Math.PI]) {
      const lb = label(CIRCLED[n - 1] ?? String(n), 0.7, 0.5, { fg: '#ffffff', stroke: '#2f6fb0' });
      lb.position.set(0, 2.95, ry ? -0.67 : 0.67);
      lb.rotation.y = ry;
      q.add(lb);
    }
  }
  const root = freeze(q, `buoy-${n}`);
  root.userData.buoy = id;
  const g = new THREE.Group();
  g.add(root);
  let baseY: number | null = null;
  const tilt = new THREE.Quaternion(), e = new THREE.Euler();
  const ctl: BuoyCtl = {
    id, n, x, z, root,
    y: () => root.position.y,
    built: {
      g, cols: [], foot: 2,
      anim: [{
        o: root,
        fn: (o, base, t) => {
          if (baseY === null) baseY = o.position.y;
          // 부표 자기 바다 자리(x, z)의 물결 — root 는 g 안 (0,0,0) 이라 그 좌표를 쓰면 원점만 본다
          const h = bobHeight(ocean(), x, z, t, phase);
          o.position.y = baseY + h;
          // 파도 기울기만큼 살랑
          e.set(Math.sin(t * 0.9 + phase) * 0.08, 0, Math.cos(t * 1.1 + phase * 0.7) * 0.08);
          o.quaternion.copy(base).multiply(tilt.setFromEuler(e));
        },
      }],
    },
  };
  return ctl;
}
