// 캐릭터 공통 부품: 재질, 그림 얼굴 머리, 접지 그림자, 깜빡임 타이밍.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceHeadGeo } from './geo';
import { faceTexture, blobTexture, type FaceSpec, type FaceMode } from './tex';

/** 피부·털: 거칠고 살짝 보송한 표면 */
export function skinMat(color: string, map?: THREE.Texture, fill = 0.16): THREE.MeshPhysicalMaterial {
  // 동숲식 고른 얼굴빛: 그늘 쪽이 회색으로 죽지 않게 자기 색으로 살짝 채운다(가짜 표면하산란)
  return new THREE.MeshPhysicalMaterial({
    color: map ? '#ffffff' : color, map: map ?? null,
    emissive: map ? '#ffffff' : color, emissiveMap: map ?? null, emissiveIntensity: fill,
    roughness: 0.68, sheen: 0.5, sheenRoughness: 0.55, sheenColor: new THREE.Color('#fff0e6'),
  });
}

/** 천: sheen 으로 보송하게 */
export function clothMat(color: string, map?: THREE.Texture): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: map ? '#ffffff' : c, map: map ?? null,
    emissive: map ? '#ffffff' : c, emissiveMap: map ?? null, emissiveIntensity: 0.07,
    roughness: 0.9, sheen: 1, sheenRoughness: 0.7, sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.35),
  });
}

/** 매끈한 소재(신발 밑창·코·머리카락) */
export function glossMat(color: string, roughness = 0.42): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: 0.25, clearcoatRoughness: 0.5 });
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export interface FaceHead {
  group: THREE.Group;
  /** 눈 감김 전환 */
  setBlink: (closed: boolean) => void;
  /** 표정 전환('happy' = '> <' 눈 + 진한 볼, 처음 쓸 때 텍스처를 만든다) */
  setMode: (m: FaceMode) => void;
}

/** 머리: 앞쪽 = 얼굴 그림(정면 투영), 나머지 = 피부색. 한 메시라 이음매가 없다. */
export function faceHead(rx: number, ry: number, rz: number, skin: string, face: FaceSpec, cheek = 0.05): FaceHead {
  const group = new THREE.Group();
  const tex: Partial<Record<FaceMode, THREE.Texture>> = { open: faceTexture(face, 'open') };
  // 눈을 따로 붙이는 얼굴(art.ts)은 표정 판이 하나면 된다
  const plain = face.eyes === false;
  const fm = skinMat(skin, tex.open);
  group.add(mesh(faceHeadGeo(rx, ry, rz, cheek), [fm, skinMat(skin)]));
  let cur: FaceMode = 'open';
  const setMode = (m: FaceMode) => {
    if (plain || m === cur) return;
    cur = m;
    const t = (tex[m] ??= faceTexture(face, m));
    fm.map = fm.emissiveMap = t;
  };
  return {
    group,
    setMode,
    setBlink(closed) {
      if (cur === 'happy') return;
      setMode(closed ? 'closed' : 'open');
    },
  };
}

let blobTex: THREE.Texture | null = null;
/** 발밑 둥근 접지 그림자(실제 그림자와 별개) */
export function blobShadow(r: number, opacity = 0.42): THREE.Mesh {
  blobTex ??= blobTexture();
  const g = new THREE.PlaneGeometry(r * 2, r * 2, 8, 8);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color: '#2a3f38', alphaMap: blobTex, transparent: true, opacity, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }));
  m.renderOrder = 2;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/** 깜빡임: 주기마다 0.13 초 감는다(가끔 두 번) */
export function blinkClosed(t: number, period: number, phase: number): boolean {
  const k = (t + phase) % period;
  return k < 0.12 || (Math.floor((t + phase) / period) % 3 === 1 && k > 0.24 && k < 0.34);
}

/** 같은 재질을 쓰는 직속 자식 메시를 하나로 합친다(draw call 절약). 정지한 부품 묶음에만 쓴다. */
export function mergeByMaterial(group: THREE.Object3D): void {
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  for (const c of group.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || c.children.length) continue;
    const list = buckets.get(m.material) ?? [];
    list.push(m);
    buckets.set(m.material, list);
  }
  for (const [mat, list] of buckets) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrix);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    for (const m of list) group.remove(m);
    group.add(mesh(merged, mat));
  }
}
