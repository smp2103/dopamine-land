// 산호초 소품(정점색 지오메트리) + 흔들리는 재질 + 빛 무늬(caustics) 재질.
import * as THREE from 'three';
import { at, bump, cap, cone, cyl, ell, merge, paint, paintFn, sph, torus, type Geo } from './kit';

const PI = Math.PI;

export const oceanTime = { value: 0 };

/** 흔들림: 지역 y 가 높을수록 크게(인스턴스 위치로 위상) */
export function swayMat(base: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial, amp = 0.12, freq = 1.4): THREE.Material {
  const prev = base.onBeforeCompile;
  base.onBeforeCompile = (sh, r) => {
    prev?.call(base, sh, r);
    sh.uniforms.uOT = oceanTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec2 ph = vec2(0.0);
          #ifdef USE_INSTANCING
            ph = instanceMatrix[3].xz;
          #endif
          float hy = max(position.y, 0.0);
          float w = sin(uOT * ${freq.toFixed(2)} + ph.x * 0.31 + ph.y * 0.17 + hy * 1.3);
          float w2 = sin(uOT * ${(freq * 0.73).toFixed(2)} + ph.y * 0.27 + hy * 0.9);
          transformed.x += w * ${amp.toFixed(3)} * hy * hy;
          transformed.z += w2 * ${(amp * 0.7).toFixed(3)} * hy * hy;
        }`);
  };
  const k = base.customProgramCacheKey.bind(base);
  base.customProgramCacheKey = () => k() + `|sway${amp}${freq}`;
  return base;
}

// ───────── 산호 지오메트리 (흰~회 그라디언트, 색은 인스턴스 색으로) ─────────
export function brainCoral(): Geo {
  let g = new THREE.SphereGeometry(0.5, 32, 20, 0, PI * 2, 0, PI * 0.62) as Geo;
  g = bump(g, (p) => 0.035 * Math.sin(p.x * 22 + Math.sin(p.z * 17) * 2.2) * Math.min(1, p.y * 6 + 0.3));
  g.scale(1, 0.8, 1);
  return merge([paint(g, '#ffffff', '#9a9aa6')]);
}

export function branchCoral(): Geo {
  const parts: Geo[] = [];
  const twig = (x: number, y: number, z: number, len: number, rx: number, rz: number, r: number, depth: number) => {
    const g = paint(cap(r, len, 2, 8), '#ffffff', '#c8c8d2');
    g.translate(0, len / 2, 0);
    g.rotateX(rx); g.rotateZ(rz);
    parts.push(at(g, x, y, z));
    if (depth <= 0) return;
    const dir = new THREE.Vector3(0, len, 0).applyEuler(new THREE.Euler(rx, 0, rz));
    const ex = x + dir.x, ey = y + dir.y, ez = z + dir.z;
    twig(ex, ey, ez, len * 0.75, rx + 0.55, rz + 0.25, r * 0.8, depth - 1);
    twig(ex, ey, ez, len * 0.72, rx - 0.45, rz - 0.4, r * 0.8, depth - 1);
    if (depth > 1) twig(ex, ey, ez, len * 0.7, rx + 0.1, rz + 0.65, r * 0.78, depth - 2);
  };
  twig(0, 0, 0, 0.3, 0, 0, 0.06, 2);
  twig(0.08, 0, 0.05, 0.25, 0.4, -0.5, 0.05, 2);
  twig(-0.08, 0, -0.05, 0.22, -0.5, 0.5, 0.05, 1);
  return merge(parts);
}

export function tubeCoral(): Geo {
  const parts: Geo[] = [];
  const spots = [[0, 0, 0.55], [0.13, 0.05, 0.38], [-0.12, 0.07, 0.42], [0.04, -0.13, 0.32], [-0.05, 0.16, 0.28], [0.15, -0.1, 0.22]];
  for (const [x, z, h] of spots) {
    parts.push(at(paint(cyl(0.065, 0.075, h, 14), '#ffffff', '#b8b8c4'), x, h / 2, z));
    parts.push(at(paint(torus(0.062, 0.018, 5, 14).rotateX(PI / 2), '#ffffff'), x, h, z));
    parts.push(at(paint(cyl(0.05, 0.05, 0.01, 12), '#6a5a78'), x, h - 0.004, z));
  }
  return merge(parts);
}

export function fanCoral(): Geo {
  // 세로로 선 부채: 위쪽 반구를 얇게 눌러 앞뒤로 물결
  const g = new THREE.SphereGeometry(1, 28, 14, 0, PI * 2, 0, PI / 2);
  g.scale(0.55, 0.6, 0.06);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, pos.getZ(i) + Math.sin(x * 7) * 0.05 + Math.cos(y * 6) * 0.03);
  }
  g.computeVertexNormals();
  const fan = paintFn(g, (p, o) => {
    const ang = Math.atan2(p.x, p.y + 0.05) * 16, r = Math.hypot(p.x, p.y + 0.05) * 30;
    const vein = Math.max(Math.pow(0.5 + 0.5 * Math.cos(ang), 6), Math.pow(0.5 + 0.5 * Math.cos(r), 8));
    o.setRGB(0.62, 0.55, 0.7).lerp(new THREE.Color('#ffffff'), vein * 0.9 + Math.min(1, p.y / 0.6) * 0.15);
  });
  const stem = paint(cyl(0.03, 0.04, 0.2, 10), '#d8d0e0');
  return merge([at(fan, 0, 0.12, 0), at(stem, 0, 0.1, 0)]);
}

export function tableCoral(): Geo {
  let top = new THREE.SphereGeometry(1, 32, 10) as Geo;
  top.scale(0.62, 0.11, 0.62);
  top = bump(top, (p) => 0.025 * Math.sin(Math.atan2(p.x, p.z) * 9));
  return merge([
    at(paint(top, '#ffffff', '#b0b0be'), 0, 0.42, 0),
    at(paint(cyl(0.09, 0.15, 0.42, 16), '#e6e6ee', '#a8a8b8'), 0, 0.21, 0),
  ]);
}

export function anemone(): Geo {
  const parts: Geo[] = [paint(cyl(0.16, 0.2, 0.16, 16), '#ffd7a8', '#e6a878').translate(0, 0.08, 0)];
  parts.push(at(paint(sph(0.14, 16, 8), '#ffe6c4'), 0, 0.15, 0));
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, rr = 0.03 + Math.sqrt(i / n) * 0.13;
    const len = 0.22 + (i % 3) * 0.04;
    const g = paint(cap(0.022, len, 2, 6), '#ffffff', '#ffd8ea');
    g.translate(0, len / 2 + 0.02, 0);
    g.rotateX(Math.sin(a) * rr * 3.2);
    g.rotateZ(-Math.cos(a) * rr * 3.2);
    parts.push(at(g, Math.cos(a) * rr, 0.17, Math.sin(a) * rr));
    parts.push(at(paint(sph(0.03, 8, 5), '#ffffff'), Math.cos(a) * rr * (1 + len * 3.2) , 0.17 + len + 0.02, Math.sin(a) * rr * (1 + len * 3.2)));
  }
  return merge(parts);
}

export function kelp(h: number): Geo {
  // 좁은 띠 세 가닥: 구불구불 + 비틀림, 양면, 끝으로 갈수록 가늘게
  const blades: Geo[] = [];
  for (let b = 0; b < 3; b++) {
    const hh = h * (0.7 + b * 0.15), seg = 16;
    const g = new THREE.PlaneGeometry(0.16, hh, 1, seg);
    g.translate(0, hh / 2, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), x = pos.getX(i);
      const tw = y * 1.3 + b * 2;
      const w = 1 - 0.75 * Math.pow(Math.max(0, y / hh), 2.5);
      const xx = x * w * (0.75 + 0.25 * Math.sin(y * 7 + b));
      pos.setX(i, xx * Math.cos(tw) + Math.sin(y * 1.8 + b * 2.1) * 0.14);
      pos.setZ(i, xx * Math.sin(tw) + Math.cos(y * 1.5 + b) * 0.08);
    }
    g.computeVertexNormals();
    const a = b * 2.1;
    blades.push(at(paint(g, b === 1 ? '#e2f78a' : '#b8ee8a', '#3a9a62'), Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, 0, a, 0));
    // 작은 공기주머니
    for (let k = 1; k < 4; k++) blades.push(at(paint(sph(0.035, 6, 4), '#f0ff9a'), Math.cos(a) * 0.12 + Math.sin(k * hh / 4 * 1.8 + b * 2.1) * 0.14, k * hh / 4, Math.sin(a) * 0.12));
  }
  return merge(blades);
}

export function seagrass(): Geo {
  const parts: Geo[] = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, r = 0.05 + (i % 3) * 0.05, h = 0.35 + (i % 4) * 0.12;
    const g = new THREE.PlaneGeometry(0.05, h, 1, 5);
    g.translate(0, h / 2, 0);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); pos.setX(k, pos.getX(k) * (1 - y / h * 0.7)); pos.setZ(k, y * y * 0.4); }
    g.computeVertexNormals();
    g.rotateY(a);
    parts.push(at(paint(g, '#b8ec8a', '#4caa60'), Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return merge(parts);
}

export function rock(): Geo {
  let g = new THREE.SphereGeometry(0.5, 24, 16) as Geo;
  g = bump(g, (p) => 0.06 * Math.sin(p.x * 7 + 1.3) * Math.cos(p.z * 6 - 0.5) + 0.04 * Math.sin(p.y * 9 + p.x * 4));
  g.scale(1, 0.62, 0.9);
  g.translate(0, 0.12, 0);
  return merge([paint(g, '#ffffff', '#a8a8b8')]);
}

export function pebble(): Geo {
  return merge([paint(ell(0.08, 0.04, 0.06, 10, 6), '#ffffff', '#c4c4cc').translate(0, 0.02, 0)]);
}

/** 장식용 작은 조개(얼굴 없음) */
export function decoShell(): Geo {
  const top = new THREE.SphereGeometry(1, 16, 6, 0, PI * 2, 0, PI / 2).scale(0.09, 0.035, 0.08);
  return merge([paintFn(top, (p, o) => { o.setRGB(1, 1, 1).lerp(new THREE.Color('#d8c8d8'), 0.5 + 0.5 * Math.cos(Math.atan2(p.x, p.z + 0.08) * 14)); })]);
}

export function decoStar(): Geo {
  const parts: Geo[] = [paint(ell(0.04, 0.02, 0.04, 10, 6), '#ffffff', '#ddd')];
  for (let i = 0; i < 5; i++) {
    const g = paint(ell(0.025, 0.016, 0.07, 8, 6), '#ffffff', '#ddd');
    g.translate(0, 0, 0.06); g.rotateY((i / 5) * PI * 2);
    parts.push(g);
  }
  return merge(parts.map((g) => g.translate(0, 0.015, 0)));
}

export function decoUrchin(): Geo {
  const parts: Geo[] = [paint(sph(0.07, 14, 10), '#ffffff', '#bbb').translate(0, 0.06, 0)];
  for (let i = 0; i < 22; i++) {
    const y = 1 - (i + 0.5) / 30 * 1.5, rr = Math.sqrt(1 - y * y), th = i * 2.39996;
    const d = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
    const g = paint(cone(0.008, 0.09, 4), '#ffffff', '#ccc');
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
    parts.push(at(g, d.x * 0.1, 0.06 + d.y * 0.1, d.z * 0.1));
  }
  return merge(parts);
}

// ───────── 바다 바닥: 고운 모래 + 물결 자국 + 빛 무늬(caustics) ─────────
const CAUSTIC_GLSL = `
  uniform float uOT;
  varying vec3 vCW;
  float cst(vec2 uv, float t) {
    // 이음매 없는 빛 그물: 출렁이게 비튼 sin 격자의 0 등고선
    vec2 p = uv * 6.0;
    for (int n = 0; n < 3; n++) {
      p += vec2(sin(p.y * 1.17 + t * 0.9 + float(n)), cos(p.x * 1.07 - t * 0.7 + float(n) * 1.7)) * 0.55;
    }
    float v = sin(p.x) * sin(p.y);
    return pow(clamp(1.0 - abs(v) * 2.2, 0.0, 1.0), 5.0);
  }
  float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

export function seabedMat(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOT = oceanTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CAUSTIC_GLSL)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        if (vCW.y > -0.35) discard;
        float depth = -vCW.y;
        vec2 q = vCW.xz;
        // 물결 자국(구불구불한 띠) + 고운 반점
        float rip = sin(q.x * 1.3 + sin(q.y * 0.45) * 2.2 + sin(q.x * 0.21) * 3.0);
        rip = smoothstep(0.55, 1.0, rip);
        vec3 sandA = vec3(0.82, 0.74, 0.58);
        vec3 sandB = vec3(0.7, 0.6, 0.47);
        float blot = 0.5 + 0.5 * sin(q.x * 0.11 + 1.7) * sin(q.y * 0.13 - 0.4);
        vec3 col = mix(sandB, sandA, blot * 0.6 + 0.4 * rip);
        // 깊을수록 살짝 청록
        col = mix(col, vec3(0.42, 0.62, 0.7), smoothstep(3.0, 25.0, depth) * 0.6);
        vec4 diffuseColor = vec4( col, 1.0 );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float depth = -vCW.y;
          vec2 uv = vCW.xz * 0.1;
          float t = uOT * 0.45 + 23.0;
          float cr = cst(uv, t);
          float cg = cr;
          float cb = cr;
          float k = smoothstep(0.2, 1.4, depth) * exp(-depth / 28.0) * 0.5;
          totalEmissiveRadiance += vec3(0.85, 1.0, 1.0) * cr * k;
        }`);
  };
  m.customProgramCacheKey = () => 'ocean-seabed';
  return m;
}

/** (옛 이름) */
export const causticsMat = seabedMat;
