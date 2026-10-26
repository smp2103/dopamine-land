// 강물 띠·폭포 커튼 지오메트리. 강물 높이는 중심선 기준으로 가로가 수평이고,
// 고원 가장자리(plateauDist = 0)를 넘는 곳은 띠를 끊고 커튼(폭포)으로 잇는다.
import * as THREE from 'three';
import type * as Island from '../../core/island';

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

type V2 = { x: number; z: number };

export interface FallInfo {
  lip: V2;
  /** 절벽 바깥 방향(물이 떨어지는 쪽) */
  out: V2;
  /** 커튼 가로 방향 */
  across: V2;
  halfL: number;
  halfR: number;
  topY: number;
  botY: number;
}

export interface RiverBuild {
  ribbon: THREE.BufferGeometry;
  fall: FallInfo | null;
}

export function buildRiver(island: typeof Island): RiverBuild {
  const src = island.riverCenterline();
  // 0.25 m 간격 + 상류 끝 뒤로 2 m 연장(반원 웅덩이 끝까지 물을 채운다)
  const cl: V2[] = [];
  {
    const a = src[0], b = src[1];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    for (let k = 8; k >= 1; k--) cl.push({ x: a.x - ((b.x - a.x) / l) * k * 0.25, z: a.z - ((b.z - a.z) / l) * k * 0.25 });
  }
  for (let i = 0; i < src.length - 1; i++) {
    const a = src[i], b = src[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
    for (let k = 0; k < n; k++) cl.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  {
    // 하구 너머 바다 쪽으로 조금 더
    const a = src[src.length - 2], b = src[src.length - 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    for (let k = 0; k <= 12; k++) cl.push({ x: b.x + ((b.x - a.x) / l) * k * 0.25, z: b.z + ((b.z - a.z) / l) * k * 0.25 });
  }
  const n = cl.length;
  const s = new Float32Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(cl[i].x - cl[i - 1].x, cl[i].z - cl[i - 1].z);
  const tan = cl.map((_, i) => {
    const a = cl[Math.max(0, i - 2)], b = cl[Math.min(n - 1, i + 2)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  });

  // 폭포 자리: 고원 안 → 밖으로 넘어가는 곳
  let iLip = -1;
  for (let i = 1; i < n; i++) {
    if (island.plateauDistAt(cl[i - 1].x, cl[i - 1].z) > 0 && island.plateauDistAt(cl[i].x, cl[i].z) <= 0) { iLip = i; break; }
  }
  let fall: FallInfo | null = null;
  let sLip = -1e9;
  let topY = 0, botY = 0;
  if (iLip > 0) {
    const a = cl[iLip - 1], b = cl[iLip];
    const pa = island.plateauDistAt(a.x, a.z), pb = island.plateauDistAt(b.x, b.z);
    const t = pa / (pa - pb);
    const lip = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    sLip = s[iLip - 1] + (s[iLip] - s[iLip - 1]) * t;
    const e = 0.15;
    let gx = island.plateauDistAt(lip.x + e, lip.z) - island.plateauDistAt(lip.x - e, lip.z);
    let gz = island.plateauDistAt(lip.x, lip.z + e) - island.plateauDistAt(lip.x, lip.z - e);
    const gl = Math.hypot(gx, gz) || 1;
    gx /= gl; gz /= gl;
    const out = { x: -gx, z: -gz };
    const across = { x: -out.z, z: out.x };
    topY = island.riverLevelAt(lip.x - out.x * 1.5, lip.z - out.z * 1.5);
    botY = island.riverLevelAt(lip.x + out.x * 2.0, lip.z + out.z * 2.0);
    const findT = (dir: number) => {
      let lo = 0, hi = 4;
      for (let it = 0; it < 18; it++) {
        const m = (lo + hi) / 2;
        if (island.riverDistAt(lip.x + across.x * m * dir, lip.z + across.z * m * dir) < 1.42) lo = m; else hi = m;
      }
      return lo;
    };
    fall = { lip, out, across, halfL: findT(-1), halfR: findT(1), topY, botY };
  }

  // 띠
  const COLS = 11;
  const pos: number[] = [], flow: number[] = [];
  const keep: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const c = cl[i];
    const coast = island.coastDistAt(c.x, c.z);
    const hw = 1.75 + 1.1 * (1 - smooth(1.0, 4.5, coast));
    let y = island.riverLevelAt(c.x, c.z);
    if (fall) {
      if (s[i] < sLip) y = topY;
      else y = Math.min(y, botY);
    }
    // 하구: 바다와 같은 높이에서 살짝 위(겹침 깜빡임 방지는 재질 polygonOffset)
    const nx = -tan[i].z, nz = tan[i].x;
    for (let k = 0; k < COLS; k++) {
      const v = -hw + (2 * hw * k) / (COLS - 1);
      pos.push(c.x + nx * v, y, c.z + nz * v);
      // z: 상류 끝 웅덩이·폭포 앞 가장자리에서 흐름 줄무늬를 줄인다
      const near = fall ? Math.abs(s[i] - sLip) : 99;
      flow.push(s[i], v, smooth(0.0, 1.5, near));
    }
    // 폭포 구간(입술 조금 앞 ~ 커튼이 물에 닿는 곳)은 비운다
    keep.push(!fall || s[i] < sLip - 0.25 || s[i] > sLip + 0.65);
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (!keep[i] || !keep[i + 1]) continue;
    for (let k = 0; k < COLS - 1; k++) {
      const a = i * COLS + k, b = (i + 1) * COLS + k, c = (i + 1) * COLS + k + 1, d = i * COLS + k + 1;
      idx.push(a, d, b, b, d, c);
    }
  }
  const ribbon = new THREE.BufferGeometry();
  ribbon.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ribbon.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
  ribbon.setIndex(idx);
  ribbon.computeVertexNormals();
  // 위를 보도록
  if ((ribbon.attributes.normal as THREE.BufferAttribute).getY(0) < 0) {
    for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
    ribbon.setIndex(idx);
  }
  ribbon.computeVertexNormals();
  return { ribbon, fall };
}

/** 폭포 커튼: 입술 위로 넘쳐 둥글게 꺾였다가 아래 웅덩이로 떨어진다 */
export function buildFallCurtain(f: FallInfo): THREE.BufferGeometry {
  const H = f.topY - f.botY;
  // 단면 (u = 바깥 방향 m, y)
  const prof: Array<[number, number]> = [];
  prof.push([-1.0, f.topY], [-0.6, f.topY], [-0.25, f.topY], [0.0, f.topY - 0.01], [0.16, f.topY - 0.04], [0.28, f.topY - 0.1], [0.36, f.topY - 0.2]);
  for (let k = 1; k <= 14; k++) {
    const q = k / 14;
    const y = f.topY - 0.2 - (H + 0.12 - 0.2) * q;
    prof.push([0.36 + 0.55 * Math.sqrt(q), y]);
  }
  const rows = prof.length;
  const len = [0];
  for (let r = 1; r < rows; r++) len.push(len[r - 1] + Math.hypot(prof[r][0] - prof[r - 1][0], prof[r][1] - prof[r - 1][1]));
  const COLS = 24;
  const pos: number[] = [], flow: number[] = [];
  for (let r = 0; r < rows; r++) {
    const [u, y] = prof[r];
    for (let k = 0; k < COLS; k++) {
      const a = -f.halfL + ((f.halfL + f.halfR) * k) / (COLS - 1);
      // 가운데가 살짝 앞으로 불룩
      const mid = (f.halfR - f.halfL) / 2;
      const w = (f.halfL + f.halfR) / 2;
      const bulge = 0.08 * (1 - ((a - mid) / w) ** 2) * Math.min(1, Math.max(0, u / 0.4));
      pos.push(f.lip.x + f.out.x * (u + bulge) + f.across.x * a, y, f.lip.z + f.out.z * (u + bulge) + f.across.z * a);
      flow.push(a, len[r], (a + f.halfL) / (f.halfL + f.halfR));
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < COLS - 1; k++) {
    const a = r * COLS + k, b = r * COLS + k + 1, c = (r + 1) * COLS + k + 1, d = (r + 1) * COLS + k;
    idx.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 바깥(카메라 쪽)을 보도록: 아래 줄 가운데 법선이 out 쪽이어야 한다
  const nn = g.attributes.normal as THREE.BufferAttribute;
  const probe = (rows - 3) * COLS + (COLS >> 1);
  if (nn.getX(probe) * f.out.x + nn.getZ(probe) * f.out.z < 0) {
    for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}
