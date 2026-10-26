// 고원 절벽 벽 — 높이장 대신 등고선(plateauDist = 0)을 따라 둥근 위 모서리·곧은 면·오목한 발치를 뽑는다.
// 높이장 경사(0.7 m 폭)를 바깥에서 감싸서 톱니 없이 매끈한 테두리가 된다. 지형과 같은 재질을 쓴다.
import * as THREE from 'three';
import type * as Island from '../../core/island';

type P2 = { x: number; z: number };

/** 마칭 스퀘어로 f = 0 등고선 고리들을 뽑는다 */
export function contourLoops(f: (x: number, z: number) => number, b: { minX: number; maxX: number; minZ: number; maxZ: number }, step: number): P2[][] {
  const nx = Math.ceil((b.maxX - b.minX) / step) + 1, nz = Math.ceil((b.maxZ - b.minZ) / step) + 1;
  const v = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = f(b.minX + i * step, b.minZ + j * step);
  // 변 id: 가로 변 (i,j)-(i+1,j) = 2*(j*nx+i), 세로 변 (i,j)-(i,j+1) = 2*(j*nx+i)+1
  const pt = new Map<number, P2>();
  const edgePt = (id: number): P2 => {
    let p = pt.get(id);
    if (p) return p;
    const k = id >> 1, i = k % nx, j = (k / nx) | 0;
    const a = v[k], c = id & 1 ? v[k + nx] : v[k + 1];
    const t = a / (a - c);
    p = id & 1 ? { x: b.minX + i * step, z: b.minZ + (j + t) * step } : { x: b.minX + (i + t) * step, z: b.minZ + j * step };
    pt.set(id, p);
    return p;
  };
  const next = new Map<number, number>();
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const k = j * nx + i;
    const s0 = v[k] > 0 ? 1 : 0, s1 = v[k + 1] > 0 ? 2 : 0, s2 = v[k + nx + 1] > 0 ? 4 : 0, s3 = v[k + nx] > 0 ? 8 : 0;
    const c = s0 | s1 | s2 | s3;
    if (c === 0 || c === 15) continue;
    const eB = 2 * k, eR = 2 * (k + 1) + 1, eT = 2 * (k + nx), eL = 2 * k + 1;
    // 안쪽(양수)을 왼쪽에 두고 도는 방향으로 잇는다
    const segs: Array<[number, number]> = [];
    switch (c) {
      case 1: segs.push([eL, eB]); break;
      case 2: segs.push([eB, eR]); break;
      case 3: segs.push([eL, eR]); break;
      case 4: segs.push([eR, eT]); break;
      case 5: segs.push([eL, eB], [eR, eT]); break;
      case 6: segs.push([eB, eT]); break;
      case 7: segs.push([eL, eT]); break;
      case 8: segs.push([eT, eL]); break;
      case 9: segs.push([eT, eB]); break;
      case 10: segs.push([eB, eR], [eT, eL]); break;
      case 11: segs.push([eT, eR]); break;
      case 12: segs.push([eR, eL]); break;
      case 13: segs.push([eR, eB]); break;
      case 14: segs.push([eB, eL]); break;
    }
    for (const [a, c2] of segs) next.set(a, c2);
  }
  const loops: P2[][] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: P2[] = [];
    let e: number | undefined = start;
    while (e !== undefined && !seen.has(e)) {
      seen.add(e);
      loop.push(edgePt(e));
      e = next.get(e);
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

/** 닫힌 고리를 고르게 다시 찍고 살짝 다듬는다 */
export function resampleLoop(loop: P2[], spacing: number, smoothIters = 6): P2[] {
  let pts = loop.slice();
  for (let it = 0; it < smoothIters; it++) {
    pts = pts.map((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length], c = pts[(i + 1) % pts.length];
      return { x: p.x * 0.5 + (a.x + c.x) * 0.25, z: p.z * 0.5 + (a.z + c.z) * 0.25 };
    });
  }
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], c = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(c.x - a.x, c.z - a.z));
  }
  const L = cum[pts.length];
  const n = Math.max(8, Math.round(L / spacing));
  const out: P2[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * L;
    while (cum[seg + 1] < s) seg++;
    const t = (s - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    const a = pts[seg], c = pts[(seg + 1) % pts.length];
    out.push({ x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t });
  }
  return out;
}

/** 벽 단면(u = 등고선에서 바깥쪽 m, y = 0..1 비율 아님 — 위/아래 높이 기준) */
function profile(yTop: number, yBot: number, faceU: number): Array<[number, number]> {
  const H = Math.max(0.2, yTop - yBot);
  const R = Math.min(0.46, H * 0.3);
  const F = Math.min(0.32, H * 0.18);
  const out: Array<[number, number]> = [];
  // 바깥 평평한 줄은 높이장 밑으로 살짝 묻는다(겹친 면 깜빡임 없이 높이장이 이긴다)
  out.push([-0.95, yTop - 0.03], [-0.7, yTop - 0.02], [-0.45, yTop - 0.004]);
  // 둥근 위 모서리(사분원)
  const cu = faceU - R, cy = yTop - R;
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI / 2 - (k / 10) * (Math.PI / 2);
    out.push([cu + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  // 곧은 면(살짝 바깥으로 기운다)
  const faceTop = yTop - R, faceBot = yBot + F;
  for (let k = 1; k <= 7; k++) {
    const t = k / 8;
    out.push([faceU + 0.07 * t, faceTop + (faceBot - faceTop) * t]);
  }
  // 오목한 발치
  const fu = faceU + 0.07 + F, fy = yBot + F;
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI + (k / 6) * (Math.PI / 2);
    out.push([fu + F * Math.cos(a), fy + F * Math.sin(a)]);
  }
  out.push([fu + 0.3, yBot - 0.004], [fu + 0.6, yBot - 0.03]);
  return out;
}

export function buildCliff(island: typeof Island, material: THREE.Material): THREE.Mesh | null {
  const loops = contourLoops(island.plateauDistAt, { minX: -30, maxX: 2, minZ: -36, maxZ: -6 }, 0.1);
  if (!loops.length) return null;
  loops.sort((a, b) => b.length - a.length);
  const loop = resampleLoop(loops[0], 0.09, 10);
  const n = loop.length;

  // 바깥 방향 법선: 접선을 돌리고 plateauDist 가 줄어드는 쪽으로
  const nor = loop.map((p, i) => {
    const a = loop[(i - 1 + n) % n], c = loop[(i + 1) % n];
    let tx = c.x - a.x, tz = c.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    let nx = tz, nz = -tx;
    if (island.plateauDistAt(p.x + nx * 0.2, p.z + nz * 0.2) > island.plateauDistAt(p.x, p.z)) { nx = -nx; nz = -nz; }
    return { x: nx, z: nz };
  });
  // 법선도 이웃과 평균해 부드럽게
  for (let it = 0; it < 4; it++) {
    const cp = nor.map((v) => ({ ...v }));
    for (let i = 0; i < n; i++) {
      const a = cp[(i - 1 + n) % n], c = cp[(i + 1) % n];
      const x = cp[i].x * 2 + a.x + c.x, z = cp[i].z * 2 + a.z + c.z;
      const l = Math.hypot(x, z) || 1;
      nor[i] = { x: x / l, z: z / l };
    }
  }

  // 위·아래 높이(강이 지나가는 곳은 강바닥까지 내려간다), 면 위치는 살짝 울퉁불퉁
  const tops = new Float32Array(n), bots = new Float32Array(n), faces = new Float32Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = loop[i], q = nor[i];
    tops[i] = island.heightAt(p.x - q.x * 0.9, p.z - q.z * 0.9);
    bots[i] = island.heightAt(p.x + q.x * 1.2, p.z + q.z * 1.2);
    s += i ? Math.hypot(p.x - loop[i - 1].x, p.z - loop[i - 1].z) : 0;
    faces[i] = 0.4 + 0.05 * Math.sin(s * 1.7) + 0.035 * Math.sin(s * 4.3 + 1.0);
  }
  // 높이 변화를 이웃과 섞어 계단 없이
  for (let it = 0; it < 6; it++) {
    const t0 = tops.slice(), b0 = bots.slice();
    for (let i = 0; i < n; i++) {
      tops[i] = (t0[(i - 1 + n) % n] + 2 * t0[i] + t0[(i + 1) % n]) / 4;
      bots[i] = (b0[(i - 1 + n) % n] + 2 * b0[i] + b0[(i + 1) % n]) / 4;
    }
  }

  const rows = profile(3, 1, 0.4).length;
  const pos = new Float32Array(n * rows * 3);
  // aWall = (둘레 거리, 위에서 내려온 깊이, 바닥에서 높이, 1) — 잔디 테두리 무늬용
  const wall = new Float32Array(n * rows * 4);
  let arc = 0;
  for (let i = 0; i < n; i++) {
    if (i) arc += Math.hypot(loop[i].x - loop[i - 1].x, loop[i].z - loop[i - 1].z);
    const pr = profile(tops[i], bots[i], faces[i]);
    for (let r = 0; r < rows; r++) {
      const [u, y] = pr[r];
      const k = (i * rows + r) * 3;
      pos[k] = loop[i].x + nor[i].x * u;
      pos[k + 1] = y;
      pos[k + 2] = loop[i].z + nor[i].z * u;
      wall.set([arc, tops[i] - y, y - bots[i], 1], (i * rows + r) * 4);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let r = 0; r < rows - 1; r++) {
      const a = i * rows + r, b = i2 * rows + r, c = i2 * rows + r + 1, d = i * rows + r + 1;
      idx.push(a, d, b, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aWall', new THREE.BufferAttribute(wall, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // 앞면이 바깥(위)을 보도록: 첫 고리의 위쪽 평평한 줄 법선이 아래면 뒤집는다
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  if (nrm.getY(0) < 0) {
    for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'cliff';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
