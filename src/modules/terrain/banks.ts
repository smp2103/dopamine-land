// 강둑 벽 — 강 중심선 양옆(+ 상류 끝 반원)을 따라 둥근 잔디 테두리 + 곧은 흙벽 + 오목한 발치.
// 단면 각 줄은 riverDist 가 목표값인 점을 이분법으로 찾아 높이장 둑을 정확히 바깥에서 감싼다.
import * as THREE from 'three';
import type * as Island from '../../core/island';

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** 단면: [강 거리 r, 높이] — r 이 큰 쪽(뭍)에서 작은 쪽(강바닥)으로 */
function bankProfile(top: number, bot: number): Array<[number, number]> {
  const H = Math.max(0.05, top - bot);
  const R = Math.min(0.2, H * 0.3), F = Math.min(0.1, H * 0.15);
  const faceR = 1.29;
  // 뭍 쪽 평평한 줄은 높이장 밑으로 살짝 묻는다
  const out: Array<[number, number]> = [[2.4, top - 0.03], [2.1, top - 0.02], [1.85, top - 0.006], [1.7, top]];
  for (let k = 0; k <= 6; k++) {
    const f = (k / 6) * (Math.PI / 2);
    out.push([faceR + R - R * Math.sin(f), top - R + R * Math.cos(f)]);
  }
  const ft = top - R, fb = bot + F;
  for (let k = 1; k <= 3; k++) {
    const t = k / 4;
    out.push([faceR - 0.03 * t, ft + (fb - ft) * t]);
  }
  const cr = faceR - 0.03 - F, cy = bot + F;
  for (let k = 0; k <= 4; k++) {
    const f = (k / 4) * (Math.PI / 2);
    out.push([cr + F * Math.cos(f), cy - F * Math.sin(f)]);
  }
  out.push([cr - 0.12, bot - 0.006], [0.95, bot - 0.03]);
  return out;
}

export function buildBanks(island: typeof Island, material: THREE.Material): THREE.Mesh {
  // 중심선을 0.2 m 간격으로
  const src = island.riverCenterline();
  const cl: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < src.length - 1; i++) {
    const a = src[i], b = src[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 0.2));
    for (let k = 0; k < n; k++) cl.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  cl.push(src[src.length - 1]);
  const tan = cl.map((_, i) => {
    const a = cl[Math.max(0, i - 2)], b = cl[Math.min(cl.length - 1, i + 2)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  });

  // 기둥(단면) 목록: 원점 c, 바깥 방향 d. 왼쪽 둑(하구→상류) → 상류 반원 → 오른쪽 둑(상류→하구)
  const cols: Array<{ c: { x: number; z: number }; d: { x: number; z: number }; bed: number }> = [];
  const bedAt = (p: { x: number; z: number }) => island.heightAt(p.x, p.z);
  for (let i = cl.length - 1; i >= 0; i--) cols.push({ c: cl[i], d: { x: -tan[i].z, z: tan[i].x }, bed: bedAt(cl[i]) });
  const t0 = tan[0];
  for (let k = 1; k < 12; k++) {
    const a = (k / 12) * Math.PI;
    // 왼쪽 법선(-t.z, t.x)에서 뒤쪽(-t)을 거쳐 오른쪽 법선(t.z, -t.x)으로
    const lx = -t0.z, lz = t0.x;
    cols.push({ c: cl[0], d: { x: lx * Math.cos(a) - t0.x * Math.sin(a), z: lz * Math.cos(a) - t0.z * Math.sin(a) }, bed: bedAt(cl[0]) });
  }
  for (let i = 0; i < cl.length; i++) cols.push({ c: cl[i], d: { x: tan[i].z, z: -tan[i].x }, bed: bedAt(cl[i]) });

  const findT = (c: { x: number; z: number }, d: { x: number; z: number }, r: number) => {
    let lo = 0, hi = r * 1.6 + 0.6;
    for (let it = 0; it < 16; it++) {
      const m = (lo + hi) / 2;
      if (island.riverDistAt(c.x + d.x * m, c.z + d.z * m) < r) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  };

  const rows = bankProfile(1, 0.1).length;
  const nC = cols.length;
  const tops = new Float32Array(nC), ks = new Float32Array(nC);
  for (let i = 0; i < nC; i++) {
    const { c, d } = cols[i];
    const t = findT(c, d, 2.3);
    const ox = c.x + d.x * t, oz = c.z + d.z * t;
    tops[i] = island.heightAt(ox, oz);
    const pd = Math.abs(island.plateauDistAt(ox, oz));
    ks[i] = smooth(0.7, 1.6, pd) * smooth(2.6, 4.6, island.coastDistAt(ox, oz));
  }
  for (let it = 0; it < 4; it++) {
    const t0s = tops.slice();
    for (let i = 1; i < nC - 1; i++) tops[i] = (t0s[i - 1] + 2 * t0s[i] + t0s[i + 1]) / 4;
  }

  const pos = new Float32Array(nC * rows * 3);
  const wall = new Float32Array(nC * rows * 4);
  let arc = 0;
  for (let i = 0; i < nC; i++) {
    const { c, d, bed } = cols[i];
    const top = bed + (tops[i] - bed) * ks[i];
    const pr = bankProfile(top, bed);
    for (let r = 0; r < rows; r++) {
      const [rr, y] = pr[r];
      const t = findT(c, d, rr);
      const k = (i * rows + r) * 3;
      pos[k] = c.x + d.x * t;
      pos[k + 1] = y;
      pos[k + 2] = c.z + d.z * t;
      wall.set([arc, top - y, y - bed, 1], (i * rows + r) * 4);
    }
    // 둘레 거리: 둑 꼭대기 줄(r=1.85) 기준
    if (i < nC - 1) {
      const t1 = findT(cols[i + 1].c, cols[i + 1].d, 1.6);
      const t0 = findT(c, d, 1.6);
      arc += Math.hypot(cols[i + 1].c.x + cols[i + 1].d.x * t1 - (c.x + d.x * t0), cols[i + 1].c.z + cols[i + 1].d.z * t1 - (c.z + d.z * t0));
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < nC - 1; i++) {
    if (ks[i] < 0.03 || ks[i + 1] < 0.03) continue;
    for (let r = 0; r < rows - 1; r++) {
      const a = i * rows + r, b = (i + 1) * rows + r, c = (i + 1) * rows + r + 1, d = i * rows + r + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aWall', new THREE.BufferAttribute(wall, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // 첫 줄(뭍 위 평평한 곳) 법선이 아래를 보면 감기 방향을 뒤집는다
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  let probe = 0;
  for (let i = 0; i < nC; i++) if (ks[i] > 0.5) { probe = i * rows; break; }
  if (nrm.getY(probe) < 0) {
    for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'riverbanks';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
