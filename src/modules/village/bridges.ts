// 말랑섬 큰 강 아치 나무 다리 3개. 원점 = 다리 한가운데(월드 y 0 기준 — 높이는 절대값으로 받는다), 로컬 +z 가 강을 건너는 방향.
// 판자는 아치 곡선을 따라 한 장씩, 난간은 둥근 기둥 + 공 머리. 걸을 수 있게 경사 상자 충돌체를 구간마다 깐다.
import * as THREE from 'three';
import { add, cap, cyl, sph, rbox, V, WOOD, WOOD_DARK, type Built, type Col } from './common';

/** 다리 갑판 높이 계획(순수 — 테스트가 읽는다). t = 0(−z 끝) … 1(+z 끝) */
export interface BridgePlan {
  len: number;
  yA: number;
  yB: number;
  rise: number;
  /** 갑판 윗면 높이(절대) */
  deckY: (t: number) => number;
}

/**
 * 둑 높이 yA·yB 와 물 높이로 아치를 정한다. 한가운데는 물 위로 최소 1.35 m, 솟음은 0.6~1.6 m.
 * 너무 가파르지 않게(구간 경사 ≤ 약 25°) 솟음을 줄인다.
 */
export function planBridge(len: number, yA: number, yB: number, waterY: number): BridgePlan {
  const mid = (yA + yB) / 2;
  let rise = Math.max(0.6, waterY + 1.35 - mid);
  // 끝에서 기울기 = rise·π/len(사인 곡선) + 둑 높이차/len
  const maxRise = (Math.tan((25 * Math.PI) / 180) * len - Math.abs(yB - yA)) / Math.PI;
  rise = Math.min(rise, Math.max(0.6, maxRise), 1.6);
  const deckY = (t: number) => yA + (yB - yA) * t + rise * Math.sin(Math.PI * t);
  return { len, yA, yB, rise, deckY };
}

/** 아치 다리 한 채. len = 둑에서 둑까지(+여유). yA/yB = 양 끝 땅 높이, waterY = 강물 높이(모두 절대값) */
export function buildBridge(len: number, yA: number, yB: number, waterY: number, rng: () => number, tint = '#ff9f8f'): Built {
  const g = new THREE.Group();
  const cols: Col[] = [];
  const W = 2.3;
  const plan = planBridge(len, yA + 0.02, yB + 0.02, waterY);
  const zOf = (t: number) => -len / 2 + t * len;
  const yOf = (t: number) => plan.deckY(t);
  const slopeAt = (t: number) => {
    const e = 1e-3;
    return Math.atan2(yOf(Math.min(1, t + e)) - yOf(Math.max(0, t - e)), (Math.min(1, t + e) - Math.max(0, t - e)) * len);
  };

  // ── 판자(아치를 따라, 한 장씩 살짝 다른 결·색)
  const boardW = 0.34, gap = 0.05;
  const n = Math.floor(len / (boardW + gap));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const c = new THREE.Color('#c8955f').multiplyScalar(0.9 + rng() * 0.14);
    const a = slopeAt(t);
    add(g, rbox(W + (rng() - 0.5) * 0.1, 0.12, boardW, 0.05, 2), 'wood', [c.clone().multiplyScalar(0.86), c], (rng() - 0.5) * 0.05, yOf(t) - 0.06, zOf(t), [-a, (rng() - 0.5) * 0.025, 0]);
  }

  // ── 곡선 들보(양옆 아래, 통통한 둥근 관) + 가운데 아치 보
  const curve = (dx: number, dy: number) => new THREE.CatmullRomCurve3(Array.from({ length: 17 }, (_, i) => V(dx, yOf(i / 16) + dy, zOf(i / 16))));
  for (const sx of [-1, 1]) {
    add(g, new THREE.TubeGeometry(curve(sx * (W / 2 - 0.12), -0.2), 40, 0.13, 10), 'wood', WOOD_DARK, 0, 0, 0);
    // 아래쪽 아치 보(갑판보다 더 휜 곡선) — 물 위로 둥근 무지개 모양
    const arch = new THREE.CatmullRomCurve3(Array.from({ length: 17 }, (_, i) => {
      const t = 0.06 + (i / 16) * 0.88;
      return V(sx * (W / 2 - 0.12), yOf(t) - 0.55 + Math.sin(Math.PI * t) * 0.3 - (1 - Math.sin(Math.PI * t)) * 0.4, zOf(t));
    }));
    add(g, new THREE.TubeGeometry(arch, 40, 0.1, 10), 'wood', '#9a6a43', 0, 0, 0);
  }

  // ── 난간: 둥근 기둥(공 머리) + 손잡이 관
  const posts = Math.max(4, Math.round(len / 1.6));
  const railH = 0.85;
  const knob = new THREE.Color(tint);
  for (const sx of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const x = sx * (W / 2 + 0.02), y = yOf(t), z = zOf(t);
      const end = i === 0 || i === posts;
      const r = end ? 0.12 : 0.075;
      add(g, cap(r, railH - r, 10), 'wood', end ? WOOD : '#d6a571', x, y + railH / 2 - 0.05, z);
      add(g, sph(end ? 0.17 : 0.1, end ? 18 : 10, end ? 12 : 8), 'paint', end ? knob : '#fff1d6', x, y + railH + (end ? 0.08 : 0.02), z);
      pts.push(V(x, y + railH - 0.12, z));
      // 기둥 받침(갑판 밖으로 살짝)
      if (end) add(g, rbox(0.34, 0.14, 0.34, 0.06, 3), 'stone', ['#b9ab98', '#dcd0bd'], x, y - 0.02, z);
    }
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), posts * 6, 0.055, 8), 'wood', '#e0b07c', 0, 0, 0);
    // 아래 가로대(손잡이 아래 둥근 줄)
    const low = pts.map((p) => p.clone().add(V(0, -0.38, 0)));
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(low), posts * 6, 0.035, 8), 'wood', '#c8955f', 0, 0, 0);
  }
  // ── 다리 기둥(물속으로) — 1/4·3/4 지점 양옆
  for (const t of [0.28, 0.72]) for (const sx of [-1, 1]) {
    const y = yOf(t), h = y - (waterY - 2.2);
    add(g, cyl(0.16, 0.14, h, 18), 'wood', ['#7d5236', '#a8754b'], sx * (W / 2 - 0.15), y - 0.25 - h / 2, zOf(t));
  }
  // ── 양 끝 꽃 화분(귀엽게)
  for (const t of [0, 1]) for (const sx of [-1, 1]) {
    const z = zOf(t) + (t === 0 ? -0.55 : 0.55), y = (t === 0 ? yA : yB);
    add(g, cyl(0.17, 0.21, 0.28, 18), 'paint', ['#d0704e', '#e98c63'], sx * (W / 2 + 0.05), y + 0.14, z);
    add(g, sph(0.2, 18, 12), 'matte', '#6cc46a', sx * (W / 2 + 0.05), y + 0.38, z, undefined, [1, 0.75, 1]);
    for (let k = 0; k < 3; k++) add(g, sph(0.06, 12, 8), 'matte', ['#ff8fb1', '#ffd34f', '#ffffff'][k], sx * (W / 2 + 0.05) + Math.cos(k * 2.1) * 0.12, y + 0.47, z + Math.sin(k * 2.1) * 0.12);
  }

  // ── 충돌체: 갑판을 10 구간 경사 상자로 + 난간 벽
  const S = 10;
  for (let k = 0; k < S; k++) {
    const t0 = k / S, t1 = (k + 1) / S;
    const y0 = yOf(t0), y1 = yOf(t1), z0 = zOf(t0), z1 = zOf(t1);
    const a = Math.atan2(y1 - y0, z1 - z0), L = Math.hypot(z1 - z0, y1 - y0);
    const hy = 0.1;
    // 윗면이 갑판 윗면에 오도록 중심을 법선 반대로 hy 만큼 내린다
    const cy = (y0 + y1) / 2 - hy * Math.cos(a), cz = (z0 + z1) / 2 + hy * Math.sin(a);
    cols.push({ kind: 'box', hx: W / 2, hy, hz: L / 2 + 0.04, x: 0, y: cy, z: cz, rx: -a });
    for (const sx of [-1, 1]) cols.push({ kind: 'box', hx: 0.07, hy: 0.5, hz: L / 2 + 0.02, x: sx * (W / 2 + 0.03), y: (y0 + y1) / 2 + 0.45, z: (z0 + z1) / 2, rx: -a });
  }
  return { g, cols, foot: 0 };
}
