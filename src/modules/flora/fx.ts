// 채집 연출 — 퐁퐁 가루(돌 부스러기·나무 조각·반짝이). 인스턴스 메시 하나에 알갱이 96개를 돌려 쓴다(살아 있을 때만 갱신).
import * as THREE from 'three';
import type { Game } from '../../core/game';
import { applyCurve } from '../../core/curve';
import { ball } from './geo';

export interface PuffOpts {
  /** 퍼지는 속도(m/s) */
  speed?: number;
  /** 위로 튀는 정도(m/s) */
  up?: number;
  /** 알갱이 크기 배율 */
  size?: number;
  /** 수명(초) */
  life?: number;
  /** 중력(m/s², 음수가 아래) */
  grav?: number;
}
export interface FloraFx {
  puff(at: THREE.Vector3, color: string | THREE.Color, n: number, o?: PuffOpts): void;
  /** 살아 있는 알갱이 수(디버그) */
  live(): number;
  readonly mesh: THREE.InstancedMesh;
}

const MAX = 96;
interface P { born: number; life: number; p0: THREE.Vector3; v: THREE.Vector3; g: number; s: number }

export function makeFx(game: Game, rng: (k: string) => () => number): FloraFx {
  const geo = ball(0.07, 1);
  geo.userData.shared = true;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.12 });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.name = 'flora-fx';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
  applyCurve(mesh);
  game.root.add(mesh);
  const parts: P[] = [];
  const cols: THREE.Color[] = [];
  let seq = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();

  const puff: FloraFx['puff'] = (at, color, n, o = {}) => {
    const r = rng(`flora-fx:${seq++}`);
    const base = typeof color === 'string' ? new THREE.Color(color) : color;
    for (let k = 0; k < n; k++) {
      if (parts.length >= MAX) { parts.shift(); cols.shift(); }
      const a = r() * Math.PI * 2, sp = (o.speed ?? 2.2) * (0.5 + r() * 0.7);
      parts.push({
        born: game.time, life: (o.life ?? 0.7) * (0.7 + r() * 0.6), p0: at.clone().add(new THREE.Vector3((r() - 0.5) * 0.3, r() * 0.2, (r() - 0.5) * 0.3)),
        v: new THREE.Vector3(Math.cos(a) * sp, (o.up ?? 2.4) * (0.6 + r() * 0.8), Math.sin(a) * sp), g: o.grav ?? -7, s: (o.size ?? 1) * (0.7 + r() * 0.7),
      });
      cols.push(base.clone().multiplyScalar(0.9 + r() * 0.2));
    }
  };

  game.onUpdate(() => {
    if (!parts.length) { if (mesh.count) mesh.count = 0; return; }
    const t = game.time;
    for (let i = parts.length - 1; i >= 0; i--) if (t - parts[i].born > parts[i].life) { parts.splice(i, 1); cols.splice(i, 1); }
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i], age = Math.max(0, t - p.born), k = age / p.life;
      pos.copy(p.p0).addScaledVector(p.v, age);
      pos.y += 0.5 * p.g * age * age;
      sc.setScalar(p.s * Math.max(0.05, 1 - k * k));
      mesh.setMatrixAt(i, m4.compose(pos, q, sc));
      mesh.setColorAt(i, cols[i]);
    }
    mesh.count = parts.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  game.onWorld((w) => { mesh.visible = w === 'earth'; });
  return { puff, live: () => parts.length, mesh };
}
