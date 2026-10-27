// 통통 조선소(말랑섬 남동 해변): 계산대(펠리 선장 자리) + 빨간 통통 창고 + 노란 크레인 + 30 m 잔교 + 배 소환 표시.
// 자리(PLACES.shipyard)는 작은 모래톱이라, 본섬에서 건너오는 나무 보도와 깊은 바다로 뻗는 잔교 방향을 지형을 보고 정한다.
import * as THREE from 'three';
import { add, cap, cyl, sph, dome, rbox, roundExtrude, roundRectShape, label, stripesY, compactLive, V, WOOD, WOOD_DARK, type Built } from './common';
import { stripesRing } from './town';

type XZ = { x: number; z: number };
type Spot = XZ & { rotY: number };
interface IslandLike {
  heightAt: (x: number, z: number) => number;
  PLACES: { shipyard: Spot };
}

/** 잔교·보도 하나(놓을 자리 + buildPier 인자) */
export interface DeckPlan { x: number; z: number; rotY: number; y0: number; len: number; deckY: number; endX: number; endZ: number; endY: number }
export interface ShipyardPlan {
  counter: Spot;
  /** 펠리 선장이 서는 곳(계산대 뒤) */
  pelican: XZ;
  warehouse: Spot;
  pier: DeckPlan;
  /** 본섬 ↔ 모래톱 나무 보도(이어져 있으면 null) */
  walk: DeckPlan | null;
  /** 배를 불러내는 곳(잔교 끝 옆 바다) */
  boatSpawn: Spot;
  crane: XZ;
}

export const PIER_LEN = 30;
export const PIER_END = 6;
/** 갑판 윗면(절대 높이) — 바다(0) 위 1 m */
const DECK_ABS = 0.95;

/**
 * 조선소 배치를 지형에서 계산한다(결정적·순수 — 테스트가 그대로 부른다).
 * 1) 본섬 쪽으로 물을 가장 짧게 건너는 방향 → 보도  2) 30 m 안이 가장 깊은 바다 방향 → 잔교  3) 남은 땅에 창고.
 */
export function planShipyard(I: IslandLike): ShipyardPlan {
  const H = I.heightAt;
  const S = I.PLACES.shipyard;
  const dirOf = (a: number) => ({ x: Math.sin(a), z: Math.cos(a) });
  const N = 72;
  // ── 보도: 처음 물을 만난 뒤 다시 '이어진 땅'(8 m 연속)이 나오는 가장 짧은 틈
  let walk: DeckPlan | null = null;
  {
    let best: { a: number; e: number; l: number } | null = null;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, d = dirOf(a);
      let e = -1, l = -1;
      for (let s = 0.5; s < 70; s += 0.5) {
        const h = H(S.x + d.x * s, S.z + d.z * s);
        if (e < 0) { if (h < 0.1) e = s; continue; }
        if (h > 0.55) {
          let solid = true;
          for (let k = 1; k <= 8 && solid; k++) solid = H(S.x + d.x * (s + k), S.z + d.z * (s + k)) > 0.35;
          if (solid) { l = s; break; }
        }
      }
      if (e < 0 || l < 0) continue;
      if (!best || l - e < best.l - best.e) best = { a, e, l };
    }
    if (best && best.l - best.e > 1.5) {
      const d = dirOf(best.a);
      // 양 끝: 땅이 갑판 높이 가까이(≥ 0.45) 오르는 마지막/첫 점
      let s0 = best.e;
      while (s0 > 0.5 && H(S.x + d.x * s0, S.z + d.z * s0) < 0.45) s0 -= 0.5;
      let s1 = best.l;
      while (s1 < best.l + 6 && H(S.x + d.x * s1, S.z + d.z * s1) < 0.6) s1 += 0.5;
      s0 = Math.max(s0, 2.2); // 계산대와 겹치지 않게
      const x = S.x + d.x * s0, z = S.z + d.z * s0, y0 = H(x, z);
      const ex = S.x + d.x * s1, ez = S.z + d.z * s1;
      walk = { x, z, rotY: best.a, y0, len: s1 - s0, deckY: Math.max(0.25, DECK_ABS - y0), endX: ex, endZ: ez, endY: H(ex, ez) };
    }
  }
  // ── 잔교: 보도와 60° 이상 벌어진 방향 가운데 30 m 가 가장 깊은 곳
  let pier: DeckPlan;
  {
    let best: { a: number; s0: number; score: number } | null = null;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, d = dirOf(a);
      if (walk && Math.abs(Math.atan2(Math.sin(a - walk.rotY), Math.cos(a - walk.rotY))) < Math.PI / 3) continue;
      let e = -1;
      for (let s = 0.5; s < 20; s += 0.5) if (H(S.x + d.x * s, S.z + d.z * s) < 0) { e = s; break; }
      if (e < 0) continue;
      let sum = 0, ok = true;
      for (let s = e + 3; s <= e + PIER_LEN + PIER_END; s += 2) {
        const h = H(S.x + d.x * s, S.z + d.z * s);
        if (h > -0.3) { ok = false; break; }
        sum += -h;
      }
      if (!ok) continue;
      const score = sum - e * 0.6;
      if (!best || score > best.score) best = { a, s0: e, score };
    }
    const a = best?.a ?? S.rotY;
    const d = dirOf(a), perp = { x: d.z, z: -d.x };
    const L = PIER_LEN + PIER_END;
    /** 밑점 base 에서 a 방향으로: 땅이 갑판 높이 가까이(≥ 0.45)인 마지막 점 → 잔교 뿌리 */
    const rootFrom = (bx: number, bz: number) => {
      if (H(bx, bz) < 0.3) return null;
      let s0 = 0;
      while (s0 < 20 && H(bx + d.x * (s0 + 0.5), bz + d.z * (s0 + 0.5)) >= 0.45) s0 += 0.5;
      const x = bx + d.x * s0, z = bz + d.z * s0;
      for (let k = 4; k <= L; k += 2) if (H(x + d.x * k, z + d.z * k) > -0.3) return null; // 다시 얕아지면 안 된다
      return { x, z };
    };
    // 계산대·보도 입구와 겹치지 않게 뿌리를 옆으로 비켜 본다(가까운 것부터)
    let root: XZ | null = null;
    for (const o of [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10]) {
      const q = rootFrom(S.x + perp.x * o, S.z + perp.z * o);
      if (!q) continue;
      if (Math.hypot(q.x - S.x, q.z - S.z) < 4.6) continue;
      if (walk && Math.hypot(q.x - walk.x, q.z - walk.z) < 4.2) continue;
      root = q;
      break;
    }
    if (!root) {
      let s0 = best?.s0 ?? 3;
      while (s0 > 0.5 && H(S.x + d.x * s0, S.z + d.z * s0) < 0.45) s0 -= 0.5;
      s0 = Math.max(s0, 4.6);
      root = { x: S.x + d.x * s0, z: S.z + d.z * s0 };
    }
    const y0 = H(root.x, root.z);
    pier = { x: root.x, z: root.z, rotY: a, y0, len: PIER_LEN, deckY: Math.max(0.25, DECK_ABS - y0), endX: root.x + d.x * L, endZ: root.z + d.z * L, endY: 0 };
  }
  const pd = dirOf(pier.rotY);
  // ── 계산대: 보도로 건너오는 사람(또는 잔교 쪽)을 본다
  const faceA = walk ? walk.rotY : pier.rotY + Math.PI / 2;
  const counter: Spot = { x: S.x, z: S.z, rotY: faceA };
  const cf = dirOf(faceA);
  const pelican = { x: S.x - cf.x * 0.95, z: S.z - cf.z * 0.95 };
  // ── 창고: 모래톱의 남은 땅(보도 반대쪽, 잔교·계산대와 떨어진 곳)
  let warehouse: Spot | null = null;
  {
    let bs = -Infinity;
    const ring = (x: number, z: number, r: number) => { for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (H(x + Math.cos(a) * r, z + Math.sin(a) * r) < 0.12) return false; } return H(x, z) > 0.3; };
    const segDist = (p: XZ, a: XZ, dir: XZ, L: number) => { const t = Math.max(0, Math.min(L, (p.x - a.x) * dir.x + (p.z - a.z) * dir.z)); return Math.hypot(p.x - (a.x + dir.x * t), p.z - (a.z + dir.z * t)); };
    for (let gx = -16; gx <= 16; gx += 1) for (let gz = -16; gz <= 16; gz += 1) {
      const p = { x: S.x + gx, z: S.z + gz };
      const dS = Math.hypot(gx, gz);
      if (dS < 4.4 || dS > 16 || !ring(p.x, p.z, 2.4)) continue;
      if (segDist(p, pier, pd, 8) < 3.6) continue;
      if (walk && segDist(p, walk, dirOf(walk.rotY), 4) < 3.2) continue;
      const back = walk ? -((gx * cf.x + gz * cf.z)) : 0;
      const score = back - Math.abs(dS - 6.5) * 0.4 - (H(p.x, p.z) < 0.5 ? 1 : 0);
      if (score > bs) { bs = score; warehouse = { x: p.x, z: p.z, rotY: Math.atan2(S.x - p.x, S.z - p.z) }; }
    }
    if (!warehouse) {
      // 모래톱이 너무 작으면 보도 건너편 본섬에(보도를 바라보게)
      const b = walk ? { x: walk.endX, z: walk.endZ } : { x: S.x - cf.x * 8, z: S.z - cf.z * 8 };
      const wd = walk ? dirOf(walk.rotY) : { x: -cf.x, z: -cf.z };
      const p = { x: b.x + wd.x * 6 - wd.z * 5, z: b.z + wd.z * 6 + wd.x * 5 };
      warehouse = { x: p.x, z: p.z, rotY: Math.atan2(b.x - p.x, b.z - p.z) };
    }
  }
  // ── 잔교 끝: 크레인(끝 선착장 모서리), 배 소환(끝 옆 바다)
  const side = { x: pd.z, z: -pd.x }; // 잔교 로컬 +x
  const endC = { x: pier.x + pd.x * (PIER_LEN + PIER_END / 2 - 0.2), z: pier.z + pd.z * (PIER_LEN + PIER_END / 2 - 0.2) };
  // 배 소환: 끝 선착장 양옆·앞 가운데 가장 깊은 물. 크레인은 그 반대쪽 모서리
  const cands = [
    { x: endC.x + side.x * (PIER_END / 2 + 4), z: endC.z + side.z * (PIER_END / 2 + 4), sg: 1 },
    { x: endC.x - side.x * (PIER_END / 2 + 4), z: endC.z - side.z * (PIER_END / 2 + 4), sg: -1 },
    { x: endC.x + pd.x * (PIER_END / 2 + 5), z: endC.z + pd.z * (PIER_END / 2 + 5), sg: 1 },
  ];
  let bsp = cands[0];
  for (const c of cands) if (H(c.x, c.z) < H(bsp.x, bsp.z) - 0.05) bsp = c;
  const crane = { x: endC.x - side.x * bsp.sg * (PIER_END / 2 - 1.1), z: endC.z - side.z * bsp.sg * (PIER_END / 2 - 1.1) };
  const boatSpawn = { x: bsp.x, z: bsp.z, rotY: pier.rotY };
  return { counter, pelican, warehouse: warehouse!, pier, walk, boatSpawn, crane };
}

// ───────── 계산대(앞 = +z, 펠리 선장은 뒤 z −0.95) ─────────
export function buildShipCounter(): Built {
  const g = new THREE.Group();
  // 나무 마루
  add(g, rbox(3.6, 0.16, 2.8, 0.07, 3), 'wood', ['#b9834f', '#d6a571'], 0, 0.08, -0.4);
  // 계산대: 빨강·흰 줄 앞판 + 둥근 윗판
  const front = rbox(2.7, 0.95, 0.7, 0.14, 5);
  stripesY(front, ['#ff6f61', '#ffffff'], 0.24, 0);
  add(g, front, 'paint', null, 0, 0.16 + 0.475, 0.1);
  add(g, rbox(2.95, 0.12, 0.92, 0.06, 4), 'wood', ['#c8955f', '#e3b27c'], 0, 1.17, 0.1);
  // 차양 기둥 + 줄무늬 차양(통통한 공 가장자리)
  for (const sx of [-1, 1]) add(g, cap(0.07, 2.2), 'wood', WOOD_DARK, sx * 1.55, 1.25, -0.25);
  const aw = new THREE.Group();
  const n = 6, AW = 3.5;
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? '#ffffff' : '#5aaef0';
    const sw = AW / n, x = -AW / 2 + sw * (i + 0.5);
    add(aw, rbox(sw + 0.01, 0.07, 1.2, 0.03, 3), 'cloth', col, x, 0, 0.6);
    add(aw, sph(sw / 2, 14, 8), 'cloth', col, x, -0.02, 1.2, undefined, [1, 0.55, 0.35]);
  }
  aw.position.set(0, 2.35, -0.45);
  aw.rotation.x = 0.32;
  g.add(aw);
  // 간판: 둥근 판 + 닻
  const sy = 2.95;
  add(g, roundExtrude(roundRectShape(2.3, 0.62, 0.28), 0.1, 0.04), 'paint', ['#fff1cf', '#fff9ea'], 0, sy, -0.42);
  add(g, roundExtrude(roundRectShape(2.48, 0.78, 0.35), 0.06, 0.03), 'wood', ['#b9834f', '#cf9a63'], 0, sy, -0.47);
  const lb = label('통통 조선소', 2.1, 0.5, { fg: '#2f6fae' });
  lb.position.set(0, sy, -0.3);
  g.add(lb);
  // 닻 장식(간판 왼쪽 위)
  const an = new THREE.Group();
  add(an, cap(0.05, 0.5), 'gloss', '#3f6fa8', 0, 0, 0);
  add(an, new THREE.TorusGeometry(0.1, 0.035, 10, 20), 'gloss', '#3f6fa8', 0, 0.33, 0);
  add(an, new THREE.TorusGeometry(0.24, 0.045, 10, 28, Math.PI), 'gloss', '#3f6fa8', 0, -0.15, 0, [0, 0, Math.PI]);
  add(an, cap(0.035, 0.36).rotateZ(Math.PI / 2), 'gloss', '#3f6fa8', 0, 0.16, 0);
  an.position.set(-1.38, sy + 0.38, -0.38);
  an.rotation.z = 0.2;
  g.add(an);
  // 놋쇠 종 + 구명 튜브(앞판)
  add(g, dome(0.13, 18, 10), 'gold', null, 0.95, 1.36, 0.25, undefined, [1, 1.2, 1]);
  add(g, sph(0.035, 10, 8), 'gold', null, 0.95, 1.28, 0.25);
  const ring = new THREE.TorusGeometry(0.26, 0.085, 14, 30);
  stripesRing(ring);
  add(g, ring, 'gloss', null, -0.85, 0.7, 0.47);
  // 밧줄 더미 두 개 + 나무통(옆)
  const rope = (x: number, z: number, k: number) => {
    for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(0.3 * k, 0.07 * k, 8, 20), 'matte', i % 2 ? '#f0dcb4' : '#e4cb9c', x, 0.2 + i * 0.12 * k, z, [Math.PI / 2, 0, 0]);
  };
  rope(1.95, 0.55, 1);
  rope(-1.95, -1.3, 0.8);
  for (const [x, z] of [[-2.05, 0.4], [-2.3, -0.3]] as const) {
    add(g, cyl(0.3, 0.3, 0.75, 22), 'wood', ['#a77650', '#c8955f'], x, 0.53, z);
    for (const y of [0.3, 0.75]) add(g, new THREE.TorusGeometry(0.305, 0.03, 8, 26), 'gloss', '#8c98a8', x, y, z, [Math.PI / 2, 0, 0]);
  }
  return {
    g, foot: 1.8, front: 0.5,
    cols: [{ kind: 'box', hx: 1.4, hy: 0.6, hz: 0.42, x: 0, y: 0.6, z: 0.1 }],
  };
}

// ───────── 빨간 통통 창고(둥근 지붕, 앞 = +z 큰 문) ─────────
export function buildWarehouse(): Built {
  const g = new THREE.Group();
  const W = 5.2, D = 4.4, H = 2.4;
  add(g, rbox(W + 0.5, 0.25, D + 0.5, 0.1, 4), 'stone', ['#b9ab98', '#dcd0bd'], 0, 0.12, 0);
  add(g, rbox(W, H, D, 0.32, 6), 'paint', ['#e8564a', '#ff7b6b'], 0, 0.25 + H / 2, 0);
  // 흰 모서리 띠
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, cap(0.12, H - 0.2, 10), 'matte', '#fff6ea', sx * (W / 2 - 0.05), 0.25 + H / 2, sz * (D / 2 - 0.05));
  // 둥근 지붕(반원통, 통통하게) — 용마루 = z
  const roof = new THREE.CylinderGeometry(W / 2 + 0.25, W / 2 + 0.25, D + 0.7, 40, 1, true, -Math.PI / 2, Math.PI);
  roof.rotateX(-Math.PI / 2);
  add(g, roof, 'gloss', ['#c94338', '#ff8a7a'], 0, 0.25 + H, 0, undefined, [1, 0.62, 1]);
  // 지붕 골(흰 줄)
  for (let i = 0; i < 4; i++) {
    const z = -D / 2 + (D / 3) * i;
    add(g, new THREE.TorusGeometry(W / 2 + 0.27, 0.05, 8, 40, Math.PI), 'matte', '#fff0e0', 0, 0.25 + H, z, undefined, [1, 0.62, 1]);
  }
  // 앞뒤 반원 박공(크림)
  for (const sz of [-1, 1]) {
    const cap0 = new THREE.CircleGeometry(W / 2 + 0.05, 40, 0, Math.PI);
    if (sz < 0) cap0.rotateY(Math.PI);
    add(g, cap0, 'matte', '#fff1dc', 0, 0.25 + H, sz * (D / 2 + 0.01), undefined, [1, 0.6, 1]);
  }
  // 큰 아치 문(흰 테 + 나무 미닫이 + X 띠)
  const ds = new THREE.Shape();
  ds.moveTo(-1.1, 0); ds.lineTo(1.1, 0); ds.lineTo(1.1, 1.5); ds.absarc(0, 1.5, 1.1, 0, Math.PI, false); ds.lineTo(-1.1, 0);
  add(g, roundExtrude(ds, 0.12, 0.05, 32), 'matte', '#ffffff', 0, 0.25, D / 2 + 0.02, undefined, [1.08, 1.05, 1]);
  add(g, roundExtrude(ds, 0.1, 0.04, 32), 'wood', ['#9a6440', '#b57a4f'], 0, 0.27, D / 2 + 0.08);
  for (const s of [-1, 1]) add(g, rbox(0.14, 2.2, 0.05, 0.03, 2), 'matte', '#fff6ea', 0, 1.25, D / 2 + 0.2, [0, 0, s * 0.62]);
  // 둥근 창(박공) + 옆 창
  add(g, new THREE.TorusGeometry(0.34, 0.07, 12, 32), 'matte', '#ffffff', 0, 0.25 + H + 0.75, D / 2 + 0.05);
  add(g, cyl(0.32, 0.32, 0.05, 32).rotateX(Math.PI / 2), 'window', null, 0, 0.25 + H + 0.75, D / 2 + 0.03);
  for (const sx of [-1, 1]) for (const z of [-1, 1]) {
    add(g, rbox(0.1, 0.7, 0.8, 0.12, 2), 'matte', '#ffffff', sx * (W / 2 + 0.02), 1.5, z * 1.0);
    add(g, rbox(0.08, 0.55, 0.64, 0.09, 2), 'window', null, sx * (W / 2 + 0.05), 1.5, z * 1.0);
  }
  // 닻 간판(문 위)
  add(g, roundExtrude(roundRectShape(1.5, 0.42, 0.2), 0.07, 0.03), 'paint', '#fff1cf', 0, 0.25 + H + 0.12, D / 2 + 0.08);
  const lb = label('창고', 1.3, 0.38, { fg: '#c94338' });
  lb.position.set(0, 0.25 + H + 0.12, D / 2 + 0.17);
  g.add(lb);
  // 앞 마당: 나무 상자·통·노
  add(g, rbox(0.6, 0.55, 0.6, 0.08, 3), 'wood', ['#b9834f', '#d6a571'], W / 2 - 0.2, 0.28, D / 2 + 0.9);
  add(g, rbox(0.48, 0.45, 0.48, 0.07, 3), 'wood', ['#b9834f', '#d6a571'], W / 2 - 0.25, 0.78, D / 2 + 0.85, [0, 0.5, 0]);
  for (const k of [0, 1]) {
    const oar = new THREE.Group();
    add(oar, cap(0.04, 1.5), 'wood', WOOD, 0, 0.85, 0);
    add(oar, rbox(0.22, 0.5, 0.05, 0.05, 3), 'wood', '#e3b27c', 0, 0.12, 0);
    oar.position.set(-W / 2 - 0.12, 0.25, 0.6 + k * 0.4);
    oar.rotation.set(0, 0, -0.18 - k * 0.08);
    g.add(oar);
  }
  return { g, foot: 3.2, cols: [{ kind: 'box', hx: W / 2 + 0.1, hy: (H + 1.6) / 2, hz: D / 2 + 0.1, x: 0, y: (H + 1.6) / 2, z: 0 }] };
}

// ───────── 노란 크레인(잔교 끝 선착장, 팔 = +z) ─────────
export function buildCrane(): Built {
  const g = new THREE.Group();
  add(g, cyl(0.75, 0.85, 0.4, 28), 'paint', ['#3f5a52', '#5a7a70'], 0, 0.2, 0);
  const tower = rbox(0.55, 4.6, 0.55, 0.12, 4);
  stripesY(tower, ['#ffcf3a', '#ffe27a'], 0.6, 0);
  add(g, tower, 'paint', null, 0, 0.4 + 2.3, 0);
  // 운전실(둥근 상자 + 창)
  add(g, rbox(1.1, 0.9, 1.0, 0.25, 5), 'paint', ['#ffbe2a', '#ffd95a'], 0, 5.2, -0.15);
  add(g, rbox(0.8, 0.45, 0.06, 0.12, 3), 'window', null, 0, 5.3, 0.36);
  add(g, dome(0.6, 24, 10), 'paint', '#ff8f5e', 0, 5.62, -0.15, undefined, [1, 0.45, 0.95]);
  // 팔(앞으로 기울어진 막대) + 평형추
  add(g, rbox(0.32, 0.3, 4.6, 0.1, 4), 'paint', ['#ffbe2a', '#ffe27a'], 0, 5.9, 1.9, [-0.22, 0, 0]);
  add(g, rbox(0.7, 0.6, 0.7, 0.15, 4), 'stone', ['#8c98a8', '#aab4c2'], 0, 5.55, -1.0);
  add(g, sph(0.12, 14, 10), 'gloss', '#ff5e57', 0, 6.95, 3.95);
  // 흔들리는 갈고리 + 매달린 상자
  const hook = new THREE.Group();
  hook.position.set(0, 6.78, 4.0);
  hook.userData.live = true;
  add(hook, cap(0.025, 2.1), 'matte', '#5a5a66', 0, -1.1, 0);
  add(hook, new THREE.TorusGeometry(0.12, 0.035, 8, 18, Math.PI * 1.4), 'gloss', '#8c98a8', 0, -2.25, 0, [0, 0, 2.4]);
  add(hook, rbox(0.7, 0.55, 0.7, 0.08, 3), 'wood', ['#b9834f', '#d6a571'], 0, -2.7, 0);
  add(hook, rbox(0.74, 0.08, 0.74, 0.03, 2), 'wood', WOOD_DARK, 0, -2.55, 0);
  g.add(compactLive(hook));
  return {
    g, foot: 0.9,
    cols: [{ kind: 'cyl', r: 0.5, hh: 2.7, x: 0, y: 2.7, z: 0 }],
    anim: [{ o: hook, fn: (o, b, t) => { o.quaternion.copy(b).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 0.9) * 0.06, 0, Math.sin(t * 0.7 + 1) * 0.05))); } }],
  };
}

// ───────── 경사 판자(땅 → 갑판) ─────────
/** 길이 run(−z 에서 0 까지) 동안 rise 만큼 오르는 판자 경사로. 원점 = 갑판 시작점 아래 땅 */
export function buildRamp(rise: number, run: number, w: number): Built {
  const g = new THREE.Group();
  const a = Math.atan2(rise, run), L = Math.hypot(rise, run);
  const n = Math.max(2, Math.round(L / 0.46));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    add(g, rbox(w, 0.1, 0.42, 0.04, 3), 'wood', ['#b9834f', '#d6a571'], 0, rise * t - 0.03, -run + run * t, [-a, 0, 0]);
  }
  for (const sx of [-1, 1]) add(g, rbox(0.14, 0.16, L, 0.05, 3), 'wood', WOOD_DARK, sx * (w / 2 - 0.15), rise / 2 - 0.12, -run / 2, [-a, 0, 0]);
  const hy = 0.08;
  return {
    g, foot: 0,
    cols: [{ kind: 'box', hx: w / 2, hy, hz: L / 2 + 0.05, x: 0, y: rise / 2 - hy * Math.cos(a), z: -run / 2 + hy * Math.sin(a), rx: -a }],
  };
}

// ───────── 떠 있는 것(배 소환 부표·매어 둔 작은 배) — bake 안 하는 살아 있는 조각 ─────────
/** 배 소환 자리 표시: 빨강·흰 원 부표 + 닻 깃발. y = 물 높이 */
export function buildSpawnMarker(): THREE.Group {
  const g = new THREE.Group();
  g.userData.live = true;
  g.name = 'village-boat-spawn';
  const ring = new THREE.TorusGeometry(1.1, 0.16, 14, 40);
  stripesRing(ring);
  add(g, ring, 'gloss', null, 0, 0.05, 0, [Math.PI / 2, 0, 0]);
  add(g, cyl(0.28, 0.36, 0.5, 20), 'gloss', ['#ff5e57', '#ff8a7a'], 1.4, 0.15, 0);
  add(g, cap(0.03, 1.0), 'gloss', '#5a6f6a', 1.4, 0.9, 0);
  add(g, rbox(0.04, 0.32, 0.5, 0.04, 3), 'cloth', '#5aaef0', 1.4, 1.25, 0.26);
  add(g, sph(0.07, 12, 10), 'gold', null, 1.4, 1.45, 0);
  return compactLive(g);
}

/** 잔교 옆에 매어 둔 작은 나룻배(통통한 선체) */
export function buildRowboat(): THREE.Group {
  const g = new THREE.Group();
  g.userData.live = true;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(Math.max(0.02, Math.sin(t * Math.PI * 0.5) * 0.7), -0.45 + t * 0.55));
  }
  const hull = new THREE.LatheGeometry(pts, 32);
  hull.scale(1, 1, 2.1);
  stripesY(hull, ['#ff8f8f', '#ff8f8f', '#ffffff'], 0.18, -0.45);
  add(g, hull, 'gloss', null, 0, 0, 0);
  add(g, new THREE.TorusGeometry(0.7, 0.06, 8, 40), 'wood', WOOD, 0, 0.11, 0, [Math.PI / 2, 0, 0], [1, 2.1, 1]);
  add(g, rbox(1.2, 0.07, 0.36, 0.03, 2), 'wood', '#e3b27c', 0, 0.02, 0.35);
  add(g, rbox(1.0, 0.07, 0.3, 0.03, 2), 'wood', '#e3b27c', 0, 0.02, -0.65);
  for (const sx of [-1, 1]) add(g, cap(0.035, 1.3).rotateX(Math.PI / 2), 'wood', WOOD, sx * 0.62, 0.1, 0.2, [0, sx * 0.25, 0]);
  return compactLive(g);
}

export { V };
