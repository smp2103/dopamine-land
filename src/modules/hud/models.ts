// HUD 썸네일용 기본 모양 — 잡은 모델을 아직 못 본 종(지난 저장에서 잡은 종 등)은 분류별 코드 모델로 그린다.
// 물고기·곤충·바다·공룡·화석·우주·탈것마다 통통한 실루엣 + 큰 눈·볼터치(art.ts). 색은 종 look.colors → 희귀도 파스텔.
// 못 잡은 칸의 실루엣은 같은 분류 모양을 2D 캔버스로 먹색 그림자처럼 그린다(분류색 동그라미 위).
// 지오메트리는 모듈 전역 공유(shared), 재질은 색마다 하나 — 썸네일을 그린 뒤 버리지 않는다(작고 몇 개 안 된다).
import * as THREE from 'three';
import { addEyes, pastelize, PALETTE } from '../../core/art';
import type { Species } from '../../core/state';

const shared = <T extends THREE.BufferGeometry>(g: T): T => { g.userData.shared = true; return g; };
const G = {
  ball: shared(new THREE.SphereGeometry(0.5, 28, 20)),
  cone: shared(new THREE.ConeGeometry(0.5, 1, 20)),
  cyl: shared(new THREE.CylinderGeometry(0.5, 0.5, 1, 18)),
  torus: shared(new THREE.TorusGeometry(0.5, 0.12, 12, 32)),
  disc: shared(new THREE.CircleGeometry(0.5, 24)),
};
const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, o: { opacity?: number; metal?: number } = {}): THREE.MeshStandardMaterial {
  const k = `${color}|${o.opacity ?? 1}|${o.metal ?? 0}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: o.metal ?? 0, transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, side: (o.opacity ?? 1) < 1 ? THREE.DoubleSide : THREE.FrontSide });
    mats.set(k, m);
  }
  return m;
}
function part(g: THREE.BufferGeometry, color: string, s: [number, number, number], p: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0], o?: { opacity?: number; metal?: number }) {
  const m = new THREE.Mesh(g, mat(color, o));
  m.scale.set(...s); m.position.set(...p); m.rotation.set(...r);
  return m;
}

/** 분류별 기본 색(희귀도와 섞는다) */
const CAT_TINT: Record<string, string> = {
  fish: PALETTE.sky, sea: PALETTE.coral, bug: PALETTE.lime, insect: PALETTE.lime, dino: PALETTE.green,
  fossil: PALETTE.cream, space: PALETTE.lavender, vehicle: PALETTE.apricot, item: PALETTE.apricot,
};
/** 칸 실루엣 동그라미 색(분류색 옅게) */
export const catTint = (cat: string) => CAT_TINT[cat] ?? PALETTE.apricot;

/** 종 대표 색 두 개(몸·포인트) — look.colors 가 있으면 그것 */
export function speciesColors(s: Species): [string, string] {
  const cs = (s.look as { colors?: unknown } | undefined)?.colors;
  const list = Array.isArray(cs) ? cs.filter((c): c is string => typeof c === 'string') : [];
  const base = list[0] ?? catTint(s.category);
  const acc = list[1] ?? (s.rarity >= 4 ? PALETTE.gold : s.rarity >= 3 ? PALETTE.pink : PALETTE.white);
  return [safeColor(base), safeColor(acc)];
}
function safeColor(c: string): string { try { return pastelize(c); } catch { return PALETTE.apricot; } }

/** 분류 → 모양 종류 */
export type ShapeKind = 'fish' | 'bug' | 'sea' | 'dino' | 'fossil' | 'space' | 'vehicle' | 'blob';
export function shapeOf(s: { category: string; tags?: string[] }): ShapeKind {
  if (s.tags?.includes('vehicle')) return 'vehicle';
  switch (s.category) {
    case 'fish': return 'fish';
    case 'bug': case 'insect': return 'bug';
    case 'sea': return 'sea';
    case 'dino': return 'dino';
    case 'fossil': return 'fossil';
    case 'space': return 'space';
    default: return 'blob';
  }
}

/** 썸네일용 코드 모델(카메라는 +z·약간 오른쪽 위에서 본다) */
export function buildGeneric(s: Species): THREE.Object3D {
  const [c1, c2] = speciesColors(s);
  const g = new THREE.Group();
  g.name = `hud-thumb:${s.id}`;
  const eyes = (parent: THREE.Object3D, r: number, center: [number, number, number], size = r * 0.55) =>
    addEyes(parent, { size, head: { r, center: new THREE.Vector3(...center) } });
  switch (shapeOf(s)) {
    case 'fish': {
      // 머리 +x, 몸은 동글 길쭉. 꼬리·등지느러미는 포인트 색
      g.add(part(G.ball, c1, [1.25, 0.82, 0.62]));
      g.add(part(G.ball, PALETTE.white, [0.9, 0.42, 0.5], [0.05, -0.18, 0.06]));
      g.add(part(G.cone, c2, [0.5, 0.42, 0.14], [-0.78, 0, 0], [0, 0, Math.PI / 2]));
      g.add(part(G.cone, c2, [0.34, 0.3, 0.1], [-0.05, 0.44, 0], [0, 0, -0.35]));
      const head = new THREE.Group(); head.position.set(0.32, 0.06, 0); head.rotation.y = 0.65; g.add(head);
      eyes(head, 0.3, [0, 0, 0], 0.16);
      break;
    }
    case 'bug': {
      g.add(part(G.ball, c1, [0.78, 0.66, 0.9], [0, 0, -0.1]));
      g.add(part(G.ball, c2, [0.5, 0.48, 0.5], [0, 0.12, 0.42]));
      g.add(part(G.ball, PALETTE.white, [0.5, 0.06, 0.36], [-0.3, 0.3, -0.14], [0, 0.4, 0.5], { opacity: 0.6 }));
      g.add(part(G.ball, PALETTE.white, [0.5, 0.06, 0.36], [0.3, 0.3, -0.14], [0, -0.4, -0.5], { opacity: 0.6 }));
      for (const sx of [-1, 1]) {
        g.add(part(G.cyl, PALETTE.ink, [0.025, 0.36, 0.025], [sx * 0.1, 0.48, 0.5], [0.5, 0, -sx * 0.4]));
        g.add(part(G.ball, c2, [0.08, 0.08, 0.08], [sx * 0.18, 0.64, 0.6]));
      }
      eyes(g, 0.25, [0, 0.12, 0.42], 0.13);
      break;
    }
    case 'sea': {
      // 동그란 갓 + 짧은 다리 방울(문어·해파리 사이)
      g.add(part(G.ball, c1, [0.95, 0.8, 0.95], [0, 0.18, 0]));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        g.add(part(G.ball, c2, [0.2, 0.34, 0.2], [Math.cos(a) * 0.32, -0.28, Math.sin(a) * 0.32]));
      }
      eyes(g, 0.475, [0, 0.18, 0], 0.17);
      break;
    }
    case 'dino': {
      g.add(part(G.ball, c1, [0.95, 0.72, 0.7], [-0.05, 0, 0]));
      g.add(part(G.ball, PALETTE.cream, [0.7, 0.4, 0.55], [0, -0.14, 0.12]));
      g.add(part(G.cyl, c1, [0.26, 0.4, 0.26], [0.32, 0.36, 0.05], [0, 0, -0.5]));
      g.add(part(G.ball, c1, [0.52, 0.48, 0.48], [0.48, 0.58, 0.1]));
      g.add(part(G.cone, c1, [0.26, 0.6, 0.26], [-0.6, 0.02, 0], [0, 0, 1.3]));
      for (const [x, z] of [[0.22, 0.2], [0.22, -0.2], [-0.25, 0.2], [-0.25, -0.2]]) g.add(part(G.cyl, c1, [0.18, 0.3, 0.18], [x, -0.36, z]));
      for (let i = 0; i < 3; i++) g.add(part(G.cone, c2, [0.12, 0.18, 0.12], [-0.3 + i * 0.22, 0.38 - Math.abs(i - 1) * 0.02, 0]));
      const head = new THREE.Group(); head.position.set(0.48, 0.6, 0.1); head.rotation.y = 0.5; g.add(head);
      eyes(head, 0.24, [0, 0, 0], 0.13);
      break;
    }
    case 'fossil': {
      // 뼈다귀(가운데 막대 + 양끝 혹 넷)
      const bone = '#f4e6c8';
      g.add(part(G.cyl, bone, [0.22, 1.2, 0.22], [0, 0, 0], [0, 0, Math.PI / 2.6]));
      const d = new THREE.Vector3(Math.cos(Math.PI / 2 - Math.PI / 2.6), Math.sin(Math.PI / 2 - Math.PI / 2.6), 0).multiplyScalar(0.6);
      for (const sgn of [-1, 1]) for (const off of [-0.12, 0.12]) {
        g.add(part(G.ball, bone, [0.32, 0.32, 0.32], [-sgn * d.x + off, sgn * d.y + off * 0.6, 0]));
      }
      g.add(part(G.ball, c2, [0.1, 0.1, 0.1], [0.1, 0.05, 0.14]));
      break;
    }
    case 'space': {
      g.add(part(G.ball, c1, [0.92, 0.88, 0.92]));
      g.add(part(G.torus, c2, [1.35, 1.35, 1.35], [0, -0.05, 0], [Math.PI / 2.3, 0, 0.2]));
      g.add(part(G.cyl, PALETTE.ink, [0.03, 0.34, 0.03], [0, 0.56, 0]));
      g.add(part(G.ball, PALETTE.gold, [0.14, 0.14, 0.14], [0, 0.76, 0]));
      eyes(g, 0.46, [0, 0.04, 0], 0.18);
      break;
    }
    case 'vehicle': {
      g.add(part(G.ball, c1, [1.3, 0.55, 0.8], [0, 0.1, 0]));
      g.add(part(G.ball, '#c9f3ff', [0.6, 0.42, 0.6], [-0.05, 0.38, 0], [0, 0, 0], { opacity: 0.8 }));
      for (const [x, z] of [[0.42, 0.36], [0.42, -0.36], [-0.42, 0.36], [-0.42, -0.36]]) g.add(part(G.cyl, PALETTE.ink, [0.3, 0.14, 0.3], [x, -0.18, z], [Math.PI / 2, 0, 0]));
      g.add(part(G.ball, PALETTE.yellow, [0.1, 0.1, 0.06], [0.64, 0.12, 0.2]));
      g.add(part(G.ball, PALETTE.yellow, [0.1, 0.1, 0.06], [0.64, 0.12, -0.2]));
      break;
    }
    default: {
      g.add(part(G.ball, c1, [0.9, 0.8, 0.85]));
      g.add(part(G.ball, c2, [0.3, 0.3, 0.3], [0, 0.46, 0]));
      eyes(g, 0.44, [0, 0.02, 0], 0.17);
    }
  }
  return g;
}

// ───────────── 2D 실루엣(못 잡은 칸) ─────────────
const silCache = new Map<string, string>();
/** 분류 모양을 2D 경로로(0..1 좌표, 가운데 0.5) */
function silPath(g: CanvasRenderingContext2D, k: ShapeKind, S: number) {
  const P = (x: number, y: number) => [x * S, y * S] as const;
  const ell = (x: number, y: number, rx: number, ry: number, rot = 0) => { g.moveTo(...P(x + rx * Math.cos(rot), y + rx * Math.sin(rot))); g.ellipse(x * S, y * S, rx * S, ry * S, rot, 0, Math.PI * 2); };
  g.beginPath();
  switch (k) {
    case 'fish':
      ell(0.54, 0.52, 0.3, 0.2);
      g.moveTo(...P(0.28, 0.52)); g.lineTo(...P(0.1, 0.36)); g.quadraticCurveTo(...P(0.16, 0.52), ...P(0.1, 0.68)); g.closePath();
      g.moveTo(...P(0.46, 0.34)); g.quadraticCurveTo(...P(0.56, 0.2), ...P(0.66, 0.34)); g.closePath();
      break;
    case 'bug':
      ell(0.5, 0.58, 0.18, 0.22);
      ell(0.5, 0.33, 0.12, 0.11);
      ell(0.3, 0.42, 0.17, 0.11, -0.5); ell(0.7, 0.42, 0.17, 0.11, 0.5);
      g.moveTo(...P(0.46, 0.24)); g.lineTo(...P(0.38, 0.1)); g.lineTo(...P(0.41, 0.09)); g.lineTo(...P(0.49, 0.23));
      g.moveTo(...P(0.54, 0.24)); g.lineTo(...P(0.62, 0.1)); g.lineTo(...P(0.59, 0.09)); g.lineTo(...P(0.51, 0.23));
      break;
    case 'sea':
      ell(0.5, 0.42, 0.26, 0.22);
      for (let i = 0; i < 5; i++) ell(0.3 + i * 0.1, 0.66, 0.05, 0.12);
      break;
    case 'dino':
      ell(0.44, 0.58, 0.24, 0.16);
      ell(0.7, 0.3, 0.12, 0.1);
      g.moveTo(...P(0.56, 0.5)); g.lineTo(...P(0.64, 0.34)); g.lineTo(...P(0.72, 0.38)); g.lineTo(...P(0.64, 0.56)); g.closePath();
      g.moveTo(...P(0.22, 0.56)); g.lineTo(...P(0.06, 0.66)); g.lineTo(...P(0.24, 0.66)); g.closePath();
      for (const x of [0.32, 0.54]) { g.moveTo(...P(x - 0.04, 0.68)); g.rect(...P(x - 0.04, 0.66), 0.08 * S, 0.14 * S); }
      break;
    case 'fossil':
      g.moveTo(...P(0.28, 0.66)); g.lineTo(...P(0.66, 0.3)); g.lineTo(...P(0.72, 0.36)); g.lineTo(...P(0.34, 0.72)); g.closePath();
      for (const [x, y] of [[0.24, 0.64], [0.32, 0.74], [0.66, 0.26], [0.76, 0.34]]) ell(x, y, 0.08, 0.08);
      break;
    case 'space':
      ell(0.5, 0.52, 0.22, 0.22);
      ell(0.5, 0.56, 0.38, 0.08, -0.15);
      g.moveTo(...P(0.49, 0.3)); g.rect(...P(0.485, 0.18), 0.03 * S, 0.14 * S);
      ell(0.5, 0.16, 0.05, 0.05);
      break;
    case 'vehicle':
      g.moveTo(...P(0.14, 0.6)); g.quadraticCurveTo(...P(0.16, 0.42), ...P(0.34, 0.42)); g.quadraticCurveTo(...P(0.42, 0.26), ...P(0.6, 0.3));
      g.quadraticCurveTo(...P(0.72, 0.34), ...P(0.74, 0.44)); g.quadraticCurveTo(...P(0.88, 0.46), ...P(0.86, 0.6)); g.closePath();
      ell(0.3, 0.64, 0.08, 0.08); ell(0.7, 0.64, 0.08, 0.08);
      break;
    default:
      ell(0.5, 0.54, 0.26, 0.24);
      ell(0.5, 0.26, 0.08, 0.08);
  }
}
/** 못 잡은 칸 실루엣(data URL) — 분류색 동그라미 위 먹색 그림자. 분류마다 한 장 */
export function silhouetteURL(s: { category: string; tags?: string[] }, size = 96): string {
  const k = shapeOf(s);
  const key = `${k}|${s.category}|${size}`;
  const have = silCache.get(key);
  if (have) return have;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return '';
  // 분류색 옅은 동그라미
  const tint = catTint(s.category);
  const gr = g.createRadialGradient(size * 0.36, size * 0.3, 2, size / 2, size / 2, size / 2);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, tint + '66');
  g.fillStyle = gr; g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); g.fill();
  // 먹색 실루엣(가장자리 살짝 흰 테)
  g.save();
  silPath(g, k, size);
  g.lineJoin = 'round';
  g.strokeStyle = '#ffffffcc'; g.lineWidth = size * 0.05; g.stroke();
  g.fillStyle = PALETTE.ink + 'b0'; g.fill('nonzero');
  g.restore();
  const url = cv.toDataURL('image/png');
  silCache.set(key, url);
  return url;
}
