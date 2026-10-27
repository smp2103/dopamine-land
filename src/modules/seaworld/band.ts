// 해류 띠 그림: 청크마다 자른 띠 메시(폭 40 m) + 흐르는 거품 셰이더(곡률·안개 포함) · 소용돌이 원판 셰이더.
// 띠 정점 = 가운데 선 샘플 × 가로 5줄. aS = 고리 길이(m, 흐름 무늬가 이어지게), aV = 가로 −1..1, aFade = 땅·얕은 물에서 0.
import * as THREE from 'three';
import { BAND_HALF, CURRENT_SPEED, type CurrentField } from './logic';

/** 띠가 수면 위로 뜨는 높이(파도 마루 0.12 m 위) */
export const BAND_Y = 0.16;

const NOISE = /* glsl */ `
float swHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float swNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(swHash(i), swHash(i + vec2(1.0, 0.0)), u.x), mix(swHash(i + vec2(0.0, 1.0)), swHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

/** 띠·소용돌이가 함께 쓰는 시간·밝기 */
export const bandUniforms = {
  uTime: { value: 0 },
  /** 밤엔 거품을 어둡게(1 = 낮) */
  uLight: { value: 1 },
};

/** 흐르는 흰 거품 띠 재질(공유) */
export function bandMaterial(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uSpeed: { value: CURRENT_SPEED } }]),
    vertexShader: /* glsl */ `
      attribute float aS; attribute float aV; attribute float aFade;
      varying float vS; varying float vV; varying float vFade;
      #include <fog_pars_vertex>
      void main() {
        vS = aS; vV = aV; vFade = aFade;
        vec3 transformed = position;
        #include <project_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uLight; uniform float uSpeed;
      varying float vS; varying float vV; varying float vFade;
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        float av = abs(vV);
        // 물길 따라 흐르는 무늬(해류 속도로 미끄러진다)
        float flow = vS - uTime * uSpeed;
        float n1 = swNoise(vec2(flow * 0.07, vV * 2.2));
        float n2 = swNoise(vec2(flow * 0.19 + 17.0, vV * 5.5 + uTime * 0.25));
        float streak = smoothstep(0.52, 0.82, n1 * 0.62 + n2 * 0.38);
        // 가장자리 레이스 거품 두 줄
        float lace = swNoise(vec2(flow * 0.35, av * 9.0 + uTime * 0.4));
        float edge = smoothstep(0.72, 0.9, av) * (1.0 - smoothstep(0.93, 1.0, av)) * (0.55 + 0.45 * lace);
        // 흐름 방향 화살 무늬(› 모양, 26 m 마다) — 가운데 쪽만 옅게
        float c = fract((flow - av * 9.0) / 26.0);
        float chev = smoothstep(0.0, 0.03, c) * (1.0 - smoothstep(0.05, 0.09, c)) * (1.0 - smoothstep(0.35, 0.6, av));
        float a = max(max(streak * 0.5, edge * 0.65), chev * 0.3);
        a = max(a, 0.12 * (1.0 - av)); // 띠 전체가 살짝 밝은 물빛
        a *= vFade * (1.0 - smoothstep(0.95, 1.0, av));
        vec3 col = mix(vec3(0.80, 0.96, 1.0), vec3(1.0), clamp(streak + edge, 0.0, 1.0));
        gl_FragColor = vec4(col * (0.45 + 0.55 * uLight), a);
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = bandUniforms.uTime;
  m.uniforms.uLight = bandUniforms.uLight;
  m.userData.shared = true;
  return m;
}

/**
 * 청크 한 칸의 띠 조각. fade(x,z) = 땅 가까이 사라지게(0..1). 겹치는 구간이 없으면 null.
 * 구간마다 샘플 i → i+1 사이를 사다리꼴 네모 4칸(가로 5줄)으로.
 */
export function bandStrip(F: CurrentField, x0: number, z0: number, size: number, fade: (x: number, z: number) => number): THREE.BufferGeometry | null {
  const segs = F.segmentsIn(x0, z0, x0 + size, z0 + size);
  if (!segs.length) return null;
  const ACROSS = [-1, -0.5, 0, 0.5, 1];
  const pos: number[] = [], aS: number[] = [], aV: number[] = [], aF: number[] = [], idx: number[] = [];
  const n = F.n;
  /** 샘플 i 의 가로 방향(앞뒤 구간 평균 법선 — 모서리에서 벌어지지 않게) */
  const normalAt = (i: number) => {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const tx = F.xs[b] - F.xs[a], tz = F.zs[b] - F.zs[a], l = Math.hypot(tx, tz) || 1;
    return { nx: -tz / l, nz: tx / l };
  };
  let any = false;
  for (const i of segs) {
    const j = (i + 1) % n;
    const base = pos.length / 3;
    const sI = F.ss[i], sJ = j === 0 ? F.length : F.ss[j];
    for (const [k, s] of [[i, sI], [j, sJ]] as const) {
      const { nx, nz } = normalAt(k);
      for (const v of ACROSS) {
        const x = F.xs[k] + nx * v * BAND_HALF, z = F.zs[k] + nz * v * BAND_HALF;
        const f = fade(x, z);
        if (f > 0) any = true;
        pos.push(x - x0, BAND_Y, z - z0);
        aS.push(s); aV.push(v); aF.push(f);
      }
    }
    for (let c = 0; c < ACROSS.length - 1; c++) {
      const a = base + c, b = base + c + 1, d = base + ACROSS.length + c, e = base + ACROSS.length + c + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  if (!any) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(aV, 1));
  g.setAttribute('aFade', new THREE.Float32BufferAttribute(aF, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** 소용돌이 원판: 가운데로 갈수록 오목하고, 나선 거품 팔이 시계 반대로 돈다. 반지름 = r × 1.6 */
export function whirlpoolMesh(r: number): THREE.Mesh {
  const R = r * 1.6;
  // 반지름 방향 24칸으로 쪼갠 고리(오목하게 휘려고)
  const ring = new THREE.RingGeometry(0.5, R, 96, 24);
  ring.rotateX(-Math.PI / 2);
  const p = ring.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = Math.min(1, Math.hypot(x, z) / R);
    p.setY(i, 0.14 + 0.06 * d); // 수면 위에 평평하게(바다 판이 먼저 깊이를 쓰니 아래로 파면 가려진다) — 오목함은 셰이더 색으로
  }
  ring.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uR: { value: R } }]),
    vertexShader: /* glsl */ `
      varying vec2 vP;
      #include <fog_pars_vertex>
      void main() {
        vP = position.xz;
        vec3 transformed = position;
        #include <project_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uLight; uniform float uR;
      varying vec2 vP;
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        float d = length(vP) / uR;
        float ang = atan(vP.y, vP.x);
        // 안쪽일수록 빨리 도는 나선 팔 5개(가는 거품 줄)
        float sw = ang * 5.0 + log(max(d, 0.02)) * 6.0 + uTime * (1.6 + 1.6 * (1.0 - d));
        float arm = smoothstep(0.78, 0.97, 0.5 + 0.5 * sin(sw));
        float n = swNoise(vec2(ang * 6.0 + uTime * 0.8, d * 14.0 - uTime * 1.5));
        float foam = arm * (0.45 + 0.55 * n) * smoothstep(0.04, 0.2, d);
        // 가운데는 짙은 남색 구멍, 바깥으로 갈수록 바다로 녹는다
        vec3 hole = vec3(0.06, 0.16, 0.40), deep = vec3(0.13, 0.32, 0.64), mid = vec3(0.26, 0.58, 0.86);
        vec3 col = mix(hole, deep, smoothstep(0.0, 0.35, d));
        col = mix(col, mid, smoothstep(0.35, 0.85, d));
        col = mix(col, vec3(1.0), foam * 0.9);
        float body = 0.9 * (1.0 - smoothstep(0.45, 1.0, d));
        float a = max(body, foam * 0.85 * (1.0 - smoothstep(0.85, 1.0, d)));
        gl_FragColor = vec4(col * (0.45 + 0.55 * uLight), clamp(a, 0.0, 0.95));
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uTime = bandUniforms.uTime;
  mat.uniforms.uLight = bandUniforms.uLight;
  mat.userData.shared = true;
  const m = new THREE.Mesh(ring, mat);
  m.renderOrder = 3;
  m.name = 'seaworld-whirlpool';
  return m;
}
