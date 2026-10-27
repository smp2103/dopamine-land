// 내 소행성 가구 모델(코드로 만든 통통한 모양). 가구 하나 = 정점색 메시 1개(+ 빛나는 곳이 있으면 1개 더) — 20칸이 다 차도 그리기 호출이 적게.
// 아이템 이름(id·표시 이름)의 낱말로 모양을 고르고, 색은 아이템마다 고정(rngFor). 지오메트리는 아이템별로 한 번 만들어 공유한다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rngFor } from '../../core/rng';
import { addEyes } from '../../core/art';

const PASTEL = ['#ff9fb8', '#ffd23f', '#8ff0d2', '#8fd3ff', '#c9a2ff', '#ffb36b', '#ffc2dc', '#a5dba8'];
const CREAM = '#fff8e8', WOOD = '#e0b48a', WOOD2 = '#c99a6e';

export type FurnKind = 'lamp' | 'seat' | 'bed' | 'rug' | 'tank' | 'plant' | 'clock' | 'table' | 'plush' | 'box' | 'swing' | 'umbrella' | 'gift';
const KIND_WORDS: Array<[FurnKind, RegExp]> = [
  ['lamp', /lamp|light|lantern|램프|등|랜턴|조명/i],
  ['bed', /bed|침대/i],
  ['rug', /rug|carpet|mat|러그|양탄자|카펫/i],
  ['tank', /tank|aquarium|수조|어항/i],
  ['swing', /swing|그네/i],
  ['umbrella', /umbrella|파라솔|우산/i],
  ['seat', /chair|stool|sofa|cushion|bench|throne|seat|의자|소파|쿠션|벤치|왕좌|방석/i],
  ['plant', /pot|plant|cactus|planter|flower|bonsai|crown|화분|선인장|꽃|화관/i],
  ['clock', /clock|시계/i],
  ['table', /table|desk|탁자|책상|테이블/i],
  ['plush', /doll|plush|figure|robot|toy|인형|피규어|로봇|봉제/i],
  ['box', /box|cage|incubator|basket|chest|music|chime|케이지|부화기|바구니|상자|오르골|풍경|slide|미끄럼|plate|fountain|분수|arch|아치|mobile|모빌|flag|깃발/i],
];
/** 아이템 → 모양 종류 */
export function furnKind(id: string, name = ''): FurnKind {
  const s = `${id} ${name}`;
  for (const [k, re] of KIND_WORDS) if (re.test(s)) return k;
  return 'gift';
}

// ── 조각 만들기(정점색을 칠한 비색인 지오메트리)
type Part = THREE.BufferGeometry;
function paint(g: THREE.BufferGeometry, color: string): Part {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  ng.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = ng.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ng;
}
function at(g: THREE.BufferGeometry, x: number, y: number, z: number, s?: [number, number, number], rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  if (s) g.scale(s[0], s[1], s[2]);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
const sphere = (r = 1, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt: number, rb: number, h: number, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
/** 모서리가 둥근 상자(통통하게) */
function softBox(w: number, h: number, d: number, r0 = 0.12): THREE.BufferGeometry {
  const r = Math.min(r0, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const g = new THREE.BoxGeometry(w, h, d, 6, 6, 6);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const cx = Math.max(-hw, Math.min(hw, v.x)), cy = Math.max(-hh, Math.min(hh, v.y)), cz = Math.max(-hd, Math.min(hd, v.z));
    const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz, l = Math.hypot(dx, dy, dz) || 1;
    p.setXYZ(i, cx + (dx / l) * r, cy + (dy / l) * r, cz + (dz / l) * r);
  }
  g.computeVertexNormals();
  return g;
}

export interface FurnModel { root: THREE.Group; kind: FurnKind; glow: THREE.Mesh | null }
interface Built { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; glowColor: string; face: { y: number; z: number; size: number } | null; kind: FurnKind }
const cache = new Map<string, Built>();
const shared = <T extends THREE.Material>(m: T): T => { m.userData.shared = true; return m; };
const bodyMat = shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }));
const glowMats = new Map<string, THREE.MeshStandardMaterial>();
const glowMat = (c: string) => {
  let m = glowMats.get(c);
  if (!m) { m = shared(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.3, transparent: true, opacity: 0.9 })); glowMats.set(c, m); }
  return m;
};

function buildParts(id: string, name: string): Built {
  const r = rngFor(`flight:furn:${id}`);
  const pick = () => PASTEL[Math.floor(r() * PASTEL.length)];
  const a = pick(); let b = pick(); if (b === a) b = PASTEL[(PASTEL.indexOf(a) + 3) % PASTEL.length];
  const kind = furnKind(id, name);
  const parts: Part[] = [];
  let glow: THREE.BufferGeometry | null = null;
  let glowColor = '#fff2a8';
  let faceAt: Built['face'] = null;
  const P = (g: THREE.BufferGeometry, c: string) => parts.push(paint(g, c));
  switch (kind) {
    case 'lamp': {
      P(at(cyl(0.42, 0.5, 0.16), 0, 0.08, 0), WOOD);
      P(at(cyl(0.07, 0.07, 1.3, 10), 0, 0.8, 0), CREAM);
      P(at(sphere(0.5, 22, 14), 0, 1.55, 0, [1, 0.62, 1]), a);
      P(at(new THREE.TorusGeometry(0.46, 0.05, 8, 28), 0, 1.38, 0, undefined, Math.PI / 2), b);
      glow = at(sphere(0.22, 16, 12), 0, 1.3, 0); glowColor = '#fff2a8';
      break;
    }
    case 'seat': {
      P(at(softBox(1.2, 0.42, 1.1, 0.16), 0, 0.42, 0), a);
      P(at(softBox(1.2, 0.9, 0.3, 0.14), 0, 0.95, -0.42), a);
      P(at(sphere(0.26), -0.6, 0.72, 0, [0.6, 0.9, 1.6]), b);
      P(at(sphere(0.26), 0.6, 0.72, 0, [0.6, 0.9, 1.6]), b);
      for (const [x, z] of [[-0.45, -0.38], [0.45, -0.38], [-0.45, 0.38], [0.45, 0.38]]) P(at(sphere(0.12, 10, 8), x, 0.1, z), WOOD);
      break;
    }
    case 'bed': {
      P(at(softBox(1.4, 0.4, 2.1, 0.14), 0, 0.32, 0), WOOD);
      P(at(softBox(1.3, 0.28, 1.9, 0.13), 0, 0.62, 0.02), CREAM);
      P(at(softBox(1.32, 0.18, 1.2, 0.08), 0, 0.74, 0.38), a);
      P(at(sphere(0.32), 0, 0.82, -0.7, [1.4, 0.5, 0.75]), '#ffffff');
      P(at(softBox(1.45, 1.0, 0.18, 0.08), 0, 0.75, -1.02), b);
      break;
    }
    case 'rug': {
      P(at(cyl(1.2, 1.2, 0.06, 36), 0, 0.03, 0, [1, 1, 0.8]), a);
      P(at(new THREE.TorusGeometry(1.0, 0.06, 6, 40), 0, 0.07, 0, [1, 0.8, 1], Math.PI / 2), b);
      P(at(cyl(0.45, 0.45, 0.07, 24), 0, 0.05, 0, [1, 1, 0.8]), CREAM);
      break;
    }
    case 'tank': {
      P(at(softBox(1.5, 0.22, 0.9, 0.06), 0, 0.11, 0), WOOD);
      P(at(softBox(1.5, 0.12, 0.9, 0.05), 0, 1.18, 0), WOOD2);
      P(at(sphere(0.12, 10, 8), -0.35, 0.65, 0.05, [1.3, 0.8, 0.6]), '#ffb36b');
      P(at(sphere(0.1, 10, 8), 0.3, 0.85, -0.1, [1.3, 0.8, 0.6]), '#ff9fb8');
      P(at(cyl(0.05, 0.08, 0.6, 8), 0.5, 0.5, 0.1), '#a5dba8');
      glow = at(softBox(1.4, 0.95, 0.8, 0.05), 0, 0.68, 0); glowColor = '#bfe9ff';
      break;
    }
    case 'plant': {
      P(at(cyl(0.38, 0.28, 0.55, 22), 0, 0.28, 0), a);
      P(at(new THREE.TorusGeometry(0.38, 0.06, 8, 24), 0, 0.55, 0, undefined, Math.PI / 2), b);
      P(at(cyl(0.34, 0.34, 0.05, 22), 0, 0.53, 0), '#a77b5a');
      P(at(sphere(0.34), 0, 0.95, 0, [1, 1.1, 1]), '#8fd49a');
      P(at(sphere(0.26), -0.25, 1.15, 0.1), '#a5dba8');
      P(at(sphere(0.24), 0.24, 1.2, -0.08), '#9fe0a8');
      for (let i = 0; i < 4; i++) { const ang = (i / 4) * Math.PI * 2 + 0.4; P(at(sphere(0.08, 10, 8), Math.cos(ang) * 0.3, 1.25 + (i % 2) * 0.15, Math.sin(ang) * 0.3), PASTEL[(i * 2) % PASTEL.length]); }
      break;
    }
    case 'clock': {
      P(at(cyl(0.18, 0.3, 0.14, 16), 0, 0.07, 0), WOOD);
      P(at(cyl(0.06, 0.06, 0.6, 8), 0, 0.42, 0), WOOD2);
      P(at(cyl(0.55, 0.55, 0.22, 32), 0, 1.15, 0, undefined, Math.PI / 2), a);
      P(at(cyl(0.45, 0.45, 0.06, 32), 0, 1.15, 0.12, undefined, Math.PI / 2), CREAM);
      P(at(softBox(0.06, 0.32, 0.03, 0.02), 0, 1.27, 0.16), '#6e4a5a');
      P(at(softBox(0.24, 0.05, 0.03, 0.02), 0.1, 1.15, 0.16), '#6e4a5a');
      P(at(sphere(0.14), -0.38, 1.65, 0), b);
      P(at(sphere(0.14), 0.38, 1.65, 0), b);
      faceAt = null;
      break;
    }
    case 'table': {
      P(at(cyl(0.85, 0.85, 0.14, 32), 0, 0.82, 0), a);
      P(at(cyl(0.12, 0.2, 0.75, 14), 0, 0.4, 0), WOOD);
      P(at(cyl(0.45, 0.5, 0.08, 24), 0, 0.04, 0), WOOD2);
      P(at(cyl(0.12, 0.09, 0.2, 14), 0.3, 0.99, 0.1), CREAM);
      P(at(sphere(0.1, 10, 8), -0.3, 0.95, -0.2), b);
      break;
    }
    case 'plush': {
      P(at(sphere(0.55, 24, 16), 0, 0.55, 0, [1, 0.9, 0.95]), a);
      P(at(sphere(0.45, 24, 16), 0, 1.25, 0.02), a);
      P(at(sphere(0.16), -0.3, 1.62, 0, [1, 1.3, 0.7]), a);
      P(at(sphere(0.16), 0.3, 1.62, 0, [1, 1.3, 0.7]), a);
      P(at(sphere(0.3), 0, 0.55, 0.38, [1, 1, 0.4]), CREAM);
      P(at(sphere(0.14), -0.42, 0.18, 0.25), b);
      P(at(sphere(0.14), 0.42, 0.18, 0.25), b);
      faceAt = { y: 1.25, z: 0.43, size: 0.13 };
      break;
    }
    case 'swing': {
      for (const x of [-0.9, 0.9]) P(at(cyl(0.08, 0.1, 2.1, 10), x, 1.05, 0), WOOD);
      P(at(cyl(0.08, 0.08, 1.95, 10), 0, 2.08, 0, undefined, 0, 0, Math.PI / 2), WOOD2);
      for (const x of [-0.35, 0.35]) P(at(cyl(0.025, 0.025, 1.3, 6), x, 1.4, 0), CREAM);
      P(at(new THREE.TorusGeometry(0.42, 0.16, 12, 24), 0, 0.72, 0, [1, 1, 1], Math.PI / 2), a);
      break;
    }
    case 'umbrella': {
      P(at(cyl(0.4, 0.45, 0.12, 20), 0, 0.06, 0), CREAM);
      P(at(cyl(0.05, 0.05, 2.0, 8), 0, 1.05, 0), CREAM);
      const cone = new THREE.ConeGeometry(1.25, 0.55, 16, 1, true);
      P(at(cone, 0, 2.15, 0), a);
      P(at(sphere(0.1, 10, 8), 0, 2.45, 0), b);
      break;
    }
    case 'box': {
      P(at(softBox(1.1, 0.9, 0.9, 0.16), 0, 0.45, 0), a);
      P(at(softBox(1.18, 0.2, 0.98, 0.08), 0, 0.98, 0), b);
      P(at(softBox(0.2, 0.25, 0.08, 0.04), 0, 0.72, 0.47), '#ffd23f');
      faceAt = { y: 0.5, z: 0.46, size: 0.12 };
      break;
    }
    default: {
      // 선물 받침대 + 반짝 별
      P(at(cyl(0.5, 0.6, 0.5, 24), 0, 0.25, 0), a);
      P(at(new THREE.TorusGeometry(0.52, 0.06, 8, 28), 0, 0.5, 0, undefined, Math.PI / 2), b);
      const star = new THREE.OctahedronGeometry(0.32, 1);
      glow = at(star, 0, 1.05, 0, [1, 1.3, 0.5]); glowColor = '#ffd23f';
      break;
    }
  }
  const body = mergeGeometries(parts, false) ?? parts[0];
  for (const p of parts) if (p !== body) p.dispose();
  body.computeBoundingSphere();
  body.userData.shared = true;
  if (glow) { glow.userData.shared = true; }
  return { body, glow, glowColor, face: faceAt, kind };
}

/** 가구 모델 하나(지오메트리·재질은 공유) */
export function furnitureModel(id: string, name = ''): FurnModel {
  let b = cache.get(id);
  if (!b) { b = buildParts(id, name); cache.set(id, b); }
  const root = new THREE.Group();
  root.name = `flight-furn-${id}`;
  const m = new THREE.Mesh(b.body, bodyMat);
  m.castShadow = true; m.receiveShadow = true;
  root.add(m);
  let glow: THREE.Mesh | null = null;
  if (b.glow) { glow = new THREE.Mesh(b.glow, glowMat(b.glowColor)); root.add(glow); }
  if (b.face) {
    const f = new THREE.Group();
    f.position.set(0, b.face.y, b.face.z);
    addEyes(f, { size: b.face.size, gap: b.face.size * 3.4, y: 0, z: 0, splay: 0.15 });
    root.add(f);
  }
  root.userData.kind = b.kind;
  return { root, kind: b.kind, glow };
}
