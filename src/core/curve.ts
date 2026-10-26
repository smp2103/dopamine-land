// 굴러가는 통나무처럼 휘는 땅(동숲식). 모든 재질의 정점 단계에 같은 곡률을 넣고,
// 그림자 깊이 재질에도 똑같이 넣어서 그림자가 어긋나지 않게 한다.
import * as THREE from 'three';

export const curveUniforms = {
  uCurveK: { value: 0.0045 },
  uCurveOrigin: { value: new THREE.Vector3() },
};

export const CURVE_GLSL_HEAD = /* glsl */ `
uniform float uCurveK;
uniform vec3 uCurveOrigin;
vec4 dlCurve( vec4 wp ) {
  float dz = wp.z - uCurveOrigin.z;
  float dx = wp.x - uCurveOrigin.x;
  wp.y -= uCurveK * ( dz * dz + 0.18 * dx * dx );
  return wp;
}
`;

const PROJECT = THREE.ShaderChunk.project_vertex.replace(
  'mvPosition = modelViewMatrix * mvPosition;',
  'mvPosition = viewMatrix * dlCurve( modelMatrix * mvPosition );',
);
const WORLDPOS = THREE.ShaderChunk.worldpos_vertex.replace(
  'worldPosition = modelMatrix * worldPosition;',
  'worldPosition = dlCurve( modelMatrix * worldPosition );',
);

/** 셰이더 소스(정점)에 곡률을 넣는다. ShaderMaterial 을 직접 쓰는 모듈도 이걸 쓰면 된다. */
export function curveVertexSource(src: string): string {
  if (src.includes('dlCurve(')) return src;
  return CURVE_GLSL_HEAD + src
    .replace('#include <project_vertex>', PROJECT)
    .replace('#include <worldpos_vertex>', WORLDPOS);
}

const PATCHED = Symbol('curvePatched');

export function patchMaterial(mat: THREE.Material): void {
  const m = mat as THREE.Material & { [PATCHED]?: boolean };
  if (m[PATCHED] || mat.userData.noCurve) return;
  m[PATCHED] = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uCurveK = curveUniforms.uCurveK;
    shader.uniforms.uCurveOrigin = curveUniforms.uCurveOrigin;
    shader.vertexShader = curveVertexSource(shader.vertexShader);
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => prevKey() + '|curve';
  mat.needsUpdate = true;
}

const depthMat = new THREE.MeshDepthMaterial();
patchMaterial(depthMat);

/** 루트 아래 모든 메시에 곡률을 건다(새로 추가한 오브젝트에 다시 불러도 안전). */
export function applyCurve(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Line).isLine) return;
    if (o.userData.noCurve) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if (m) patchMaterial(m);
    if (mesh.isMesh && mesh.castShadow && !mesh.customDepthMaterial) mesh.customDepthMaterial = depthMat;
  });
}
