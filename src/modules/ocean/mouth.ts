// 강 하구 합류부: 강 물판 끝(바다 쪽 마지막 ~6 m)을 바다 얕은 물색으로 블렌드하는 덮개 +
// 강물과 바닷물이 만나는 곳의 레이스 거품 띠. (강 메시는 water 모듈 것 — 여기선 위에 얹기만 한다)
import * as THREE from 'three';
import type * as Island from '../../core/island';

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function laceTexture(rnd: () => number): THREE.CanvasTexture {
  const W = 256, H = 64;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  // 가로로 길쭉한 거품 방울들(가장자리에서 이어지게 세 번 그린다)
  for (let i = 0; i < 150; i++) {
    const x = rnd() * W, y = H * (0.2 + 0.6 * rnd());
    const r = 2 + rnd() * 6;
    const a = 0.35 + rnd() * 0.65;
    for (const ox of [-W, 0, W]) {
      const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`);
      gr.addColorStop(0.6, `rgba(255,255,255,${a * 0.7})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x + ox, y, r * 1.8, r, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = THREE.RepeatWrapping;
  tx.wrapT = THREE.ClampToEdgeWrapping;
  tx.colorSpace = THREE.NoColorSpace;
  return tx;
}

export interface RiverMouth {
  group: THREE.Group;
  update: (t: number) => void;
}

export function buildRiverMouth(island: typeof Island, rnd: () => number): RiverMouth | null {
  const group = new THREE.Group();
  group.name = 'ocean-river-mouth';
  const src = island.riverCenterline();
  if (src.length < 4) return null;
  // 중심선 + 하구 너머 바다 쪽으로 12 m 연장(0.35 m 간격)
  const cl = src.map((p) => ({ x: p.x, z: p.z }));
  {
    const a = src[src.length - 6], b = src[src.length - 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    for (let k = 1; k <= 34; k++) cl.push({ x: b.x + ((b.x - a.x) / l) * k * 0.35, z: b.z + ((b.z - a.z) / l) * k * 0.35 });
  }
  const coastOf = (x: number, z: number) => island.surfaceAt(x, z).coastDist;
  // 해안선 근처 구간만
  const UP = 4.2, DOWN = -8.5;
  const pts: Array<{ x: number; z: number; c: number }> = [];
  for (const p of cl) {
    const c = coastOf(p.x, p.z);
    if (c <= UP && c >= DOWN) pts.push({ x: p.x, z: p.z, c });
  }
  if (pts.length < 4) return null;
  const n = pts.length;
  const tan = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  });
  const HW = island.RIVER_HALF_W;
  const yAt = (x: number, z: number) => {
    const lv = island.riverLevelAt(x, z);
    return Math.max(0, Number.isFinite(lv) ? lv : 0) + 0.05;
  };

  const shallow = new THREE.Color('#a6ecdb');
  const offshore = new THREE.Color('#7fdcd9');
  const tmp = new THREE.Color();

  // ── 1) 물색 블렌드 덮개 ──
  {
    const K = 10; // 가로 칸
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], tn = tan[i];
      const ax = -tn.z, az = tn.x;
      // 바다로 나가며 부채꼴로 퍼진다
      const w = HW * (1.3 + 1.1 * smooth(2.2, -0.5, p.c) + 1.6 * smooth(0, -7, p.c));
      // 상류(강 안) 0 → 해안선 근처 0.85 → 먼 쪽 0
      const along = smooth(UP, 0.9, p.c) * (1 - smooth(-4.5, DOWN, p.c));
      tmp.copy(shallow).lerp(offshore, smooth(0, -7, p.c));
      for (let k = 0; k <= K; k++) {
        const u = (k / K) * 2 - 1;
        const x = p.x + ax * u * w, z = p.z + az * u * w;
        pos.push(x, yAt(x, z), z);
        const edge = 1 - smooth(0.7, 1.0, Math.abs(u));
        col.push(tmp.r, tmp.g, tmp.b, 0.9 * along * edge);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < K; k++) {
      const a = i * (K + 1) + k, b = a + 1, c = a + (K + 1), d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: true });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ── 2) 합류부 거품 띠(해안선 바로 바깥, 강폭보다 조금 넓게) ──
  const lace = laceTexture(rnd);
  const foamMat = new THREE.MeshBasicMaterial({
    color: '#ffffff', alphaMap: lace, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.95,
  });
  {
    const K = 14;
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const band: number[] = [];
    for (let i = 0; i < n; i++) if (pts[i].c <= 1.0 && pts[i].c >= -2.6) band.push(i);
    if (band.length >= 2) {
      const C0 = 1.0, C1 = -2.6;
      band.forEach((i, r) => {
        const p = pts[i], tn = tan[i];
        const ax = -tn.z, az = tn.x;
        const w = HW * (1.9 + 1.4 * smooth(0, -3, p.c));
        // 해안선 조금 바깥(-0.5)에서 가장 진하고 앞뒤로 빠진다
        const prof = smooth(C0, -0.2, p.c) * (1 - smooth(-0.9, C1, p.c));
        for (let k = 0; k <= K; k++) {
          const u = (k / K) * 2 - 1;
          const x = p.x + ax * u * w, z = p.z + az * u * w;
          pos.push(x, yAt(x, z) + 0.015, z);
          uv.push((u * w) / 3.2, (p.c - C1) / (C0 - C1));
          const edge = 1 - smooth(0.6, 1.0, Math.abs(u));
          const a = prof * edge;
          col.push(1, 1, 1, a);
        }
        void r;
      });
      for (let r = 0; r < band.length - 1; r++) for (let k = 0; k < K; k++) {
        const a = r * (K + 1) + k, b = a + 1, c = a + (K + 1), d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
      g.setIndex(idx);
      g.computeVertexNormals();
      foamMat.vertexColors = true;
      const mesh = new THREE.Mesh(g, foamMat);
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  return {
    group,
    update: (t: number) => {
      // 레이스가 옆으로 천천히 밀리고 숨 쉬듯 진해졌다 옅어진다
      lace.offset.set((t * 0.05) % 1, 0);
      foamMat.opacity = 0.8 + 0.15 * Math.sin(t * 1.3);
    },
  };
}
