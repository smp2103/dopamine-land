// 플레이어 소품: 패러글라이더 천, 낚싯대, 잠자리채, 삽, 도끼, 뿅망치, 물뿌리개, 사진기, 간식, 새싹 — 전부 둥글고 장난감 같은 파스텔.
// 손 피벗 기준: 원점 = 손, 팔이 아래(-y)로 뻗은 자세에서 도구 끝이 앞(+z)을 향한다.
import * as THREE from 'three';
import { ellipsoid, capsule } from './geo';
import { clothMat, glossMat, mesh } from './kit';
import { canvasTex } from './tex';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** 원통 막대: 원점에서 +y 로 len */
function stick(r: number, len: number, mat: THREE.Material, r2 = r): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r2, r, len, 14, 1);
  g.translate(0, len / 2, 0);
  const m = mesh(g, mat);
  return m;
}

// ───────── 패러글라이더 ─────────
function canopyTexture(): THREE.CanvasTexture {
  const cols = ['#ff8fb1', '#ffd36e', '#8fe3c8', '#8cc8ff', '#c9a6ff', '#ffb38a'];
  const t = canvasTex(512, (g, n) => {
    const cells = 12;
    const w = n / cells;
    for (let i = 0; i < cells; i++) {
      g.fillStyle = cols[i % cols.length];
      g.fillRect(i * w, 0, w, n);
      // 칸 사이 흰 솔기
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(i * w - 2, 0, 4, n);
    }
    // 앞전(입구) 쪽 흰 띠 + 작은 하트
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(0, n * 0.86, n, n * 0.14);
    g.fillStyle = '#ff6f91';
    const hx = n * 0.5, hy = n * 0.45, s = n * 0.05;
    g.beginPath();
    g.moveTo(hx, hy + s * 1.1);
    g.bezierCurveTo(hx - s * 1.6, hy, hx - s * 0.9, hy - s * 1.2, hx, hy - s * 0.4);
    g.bezierCurveTo(hx + s * 0.9, hy - s * 1.2, hx + s * 1.6, hy, hx, hy + s * 1.1);
    g.fill();
  });
  return t;
}

export interface Glider { root: THREE.Group; setOpen: (o: number, t: number) => void }

export function buildGlider(): Glider {
  const root = new THREE.Group();
  root.name = 'glider';
  // 야숨식: 몸 위로 크게(머리 위 ≈1.1 m) 펼친, 위로 볼록한 넓은 아치 날개
  const SPAN = 4.3, CHORD = 1.05, R = 2.7, ARC = 0.8;
  const HY = 2.42; // 천 꼭대기 높이(로컬, 루트 스케일 1.12 전)
  const g = new THREE.PlaneGeometry(SPAN, CHORD, 72, 14);
  const p = g.attributes.position as THREE.BufferAttribute;
  const cells = 14;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const u = x / (SPAN / 2); // -1..1
    const a = u * ARC;
    // 칸마다 볼록(공기로 부푼 셀) + 앞뒤로 둥근 날개 단면, 날개 끝은 살짝 좁게
    const cellBulge = 0.045 * Math.abs(Math.sin(((u + 1) / 2) * cells * Math.PI));
    const v = y / (CHORD / 2); // -1(뒤)..1(앞)
    const camber = 0.16 * (1 - v * v);
    const rr = R + camber + cellBulge;
    const tip = 1 - 0.28 * u * u;
    p.setXYZ(i, Math.sin(a) * rr, Math.cos(a) * rr - R, -y * tip);
  }
  g.computeVertexNormals();
  const mat = clothMat('#ffffff', canopyTexture());
  mat.side = THREE.DoubleSide;
  const canopy = mesh(g, mat);
  canopy.castShadow = true;
  const holder = new THREE.Group();
  holder.position.set(0, HY, 0.0);
  holder.add(canopy);
  // 줄: 두 손에서 천 양끝·중간으로 V 자로 벌어진다(얼굴 앞을 지나지 않게 손 바깥쪽에서)
  const lineMat = new THREE.MeshBasicMaterial({ color: '#fff6ee' });
  const hands = [-0.34, 0.34];
  const HAND_Y = 0.8, HAND_Z = 0.24;
  const lines = new THREE.Group();
  for (const u of [-1, -0.72, -0.4, 0.4, 0.72, 1]) {
    const a = u * ARC;
    for (const cz of [0.32, -0.32]) {
      const top = new THREE.Vector3(Math.sin(a) * R, Math.cos(a) * R - R + HY - 0.02, cz * CHORD * (1 - 0.28 * u * u));
      const bot = new THREE.Vector3(u < 0 ? hands[0] : hands[1], HAND_Y, HAND_Z);
      const d = top.clone().sub(bot);
      const cg = new THREE.CylinderGeometry(0.004, 0.004, d.length(), 4, 1);
      const line = new THREE.Mesh(cg, lineMat);
      line.position.copy(bot).addScaledVector(d, 0.5);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      lines.add(line);
    }
  }
  root.add(lines);
  // 손잡이 토글(통통한 공)
  for (const hx of hands) root.add(mesh(ellipsoid(0.032, 0.042, 0.032), glossMat('#ff8fb1', 0.4), hx, HAND_Y, HAND_Z));
  root.add(holder);
  root.visible = false;
  return {
    root,
    setOpen(o, t) {
      root.visible = o > 0.02;
      if (!root.visible) return;
      // 0 → 1.1 → 1 로 톡 튀어나오는 탄성
      const e = o >= 0.999 ? 1 : o < 0.7 ? 1.1 * THREE.MathUtils.smoothstep(o, 0, 0.7) : 1.1 - 0.1 * THREE.MathUtils.smoothstep(o, 0.7, 1);
      holder.scale.set(Math.max(0.05, e), Math.max(0.05, 0.5 + 0.5 * e), Math.max(0.05, e));
      holder.position.y = 1.3 + (HY - 1.3) * Math.min(1, e) + 0.03 * Math.sin(t * 2.4);
      holder.rotation.z = 0.035 * Math.sin(t * 1.3);
      holder.rotation.x = -0.1 + 0.03 * Math.sin(t * 1.9);
      lines.visible = o > 0.75;
      lines.rotation.z = holder.rotation.z * 0.5;
    },
  };
}

// ───────── 낚싯대 ─────────
export interface Rod { root: THREE.Group; setTension: (k: number) => void }

export function buildRod(): Rod {
  const root = new THREE.Group();
  root.name = 'rod';
  const shaft = new THREE.Group();
  shaft.rotation.x = 1.87;
  root.add(shaft);
  const wood = glossMat('#c98b55', 0.5);
  shaft.add(mesh(capsule(0.03, 0.26), glossMat('#e9c79d', 0.75), 0, 0.02, 0)); // 코르크 손잡이
  shaft.add(stick(0.016, 1.25, wood, 0.007));
  // 릴(하늘색 동글이)
  const reel = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 24), glossMat('#8cc8ff', 0.35), 0.05, 0.16, 0);
  reel.rotation.z = Math.PI / 2;
  shaft.add(reel);
  shaft.add(mesh(ellipsoid(0.018, 0.018, 0.018), glossMat('#ffffff', 0.3), 0.075, 0.16, 0.0));
  // 끝(줄이 매달리는 곳)
  const tip = new THREE.Group();
  tip.position.set(0, 1.25, 0);
  shaft.add(tip);
  const lineGeo = new THREE.CylinderGeometry(0.003, 0.003, 1, 4, 1);
  lineGeo.translate(0, -0.5, 0);
  const line = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  tip.add(line);
  // 찌: 빨강·흰 공
  const bob = new THREE.Group();
  bob.add(mesh(new THREE.SphereGeometry(0.045, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glossMat('#ff5f6d', 0.35)));
  const lower = mesh(new THREE.SphereGeometry(0.045, 20, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glossMat('#ffffff', 0.35));
  bob.add(lower);
  tip.add(bob);
  const q = new THREE.Quaternion();
  return {
    root,
    setTension(k) {
      // 줄은 월드 아래로 늘어진다(부모 회전을 되돌림)
      tip.updateWorldMatrix(true, false);
      tip.getWorldQuaternion(q);
      q.invert();
      const len = 1.05 - 0.25 * k;
      line.quaternion.copy(q);
      line.scale.set(1, len, 1);
      bob.quaternion.copy(q);
      bob.position.set(0, -len, 0).applyQuaternion(q);
    },
  };
}

// ───────── 잠자리채 ─────────
export function buildNet(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'net';
  const shaft = new THREE.Group();
  shaft.rotation.x = 1.87;
  root.add(shaft);
  shaft.add(stick(0.02, 1.0, glossMat('#ffd36e', 0.45)));
  shaft.add(mesh(capsule(0.028, 0.18), glossMat('#ff8fb1', 0.5), 0, 0.05, 0));
  const ring = mesh(new THREE.TorusGeometry(0.2, 0.018, 12, 40), glossMat('#ff8fb1', 0.4), 0, 1.2, 0);
  shaft.add(ring);
  const bagGeo = new THREE.SphereGeometry(0.2, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  bagGeo.scale(1, 1.6, 1);
  bagGeo.rotateX(-Math.PI / 2);
  const bagMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, side: THREE.DoubleSide, roughness: 0.9 });
  const bag = new THREE.Mesh(bagGeo, bagMat);
  bag.position.set(0, 1.2, 0);
  bag.rotation.x = Math.PI; // 망은 뒤로 늘어진다
  shaft.add(bag);
  return root;
}

// ───────── 삽 ─────────
export function buildShovel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'shovel';
  const shaft = new THREE.Group();
  shaft.rotation.x = Math.PI - 0.55; // 손에서 아래 앞으로
  root.add(shaft);
  shaft.add(stick(0.02, 0.72, glossMat('#c98b55', 0.5)));
  // D 손잡이
  const grip = mesh(new THREE.TorusGeometry(0.05, 0.014, 10, 24), glossMat('#8fe3c8', 0.4), 0, -0.05, 0);
  shaft.add(grip);
  // 둥근 삽날(통통한 숟가락)
  const blade = mesh(ellipsoid(0.11, 0.15, 0.035, 28, 18), glossMat('#9fd0ff', 0.3), 0, 0.82, 0.01);
  shaft.add(blade);
  shaft.add(mesh(capsule(0.03, 0.08), glossMat('#9fd0ff', 0.3), 0, 0.69, 0));
  return root;
}

// ───────── 도끼(나무 베기) ─────────
export function buildAxe(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'axe';
  const shaft = new THREE.Group();
  shaft.rotation.x = 1.87;
  root.add(shaft);
  shaft.add(stick(0.022, 0.62, glossMat('#c98b55', 0.5)));
  shaft.add(mesh(capsule(0.03, 0.12), glossMat('#ff8fb1', 0.5), 0, 0.04, 0));
  // 둥근 날(통통한 반달) + 뒤 혹
  const head = new THREE.Group();
  head.position.set(0, 0.58, 0);
  shaft.add(head);
  head.add(mesh(ellipsoid(0.05, 0.075, 0.03, 24, 14), glossMat('#9fd0ff', 0.3), 0, 0, 0.07));
  head.add(mesh(ellipsoid(0.035, 0.05, 0.035, 16, 12), glossMat('#ffd36e', 0.4), 0, 0, -0.02));
  return root;
}

// ───────── 뿅망치(돌 두드리기) ─────────
export function buildHammer(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'hammer';
  const shaft = new THREE.Group();
  shaft.rotation.x = 1.87;
  root.add(shaft);
  shaft.add(stick(0.02, 0.5, glossMat('#ffd36e', 0.45)));
  // 통통한 원통 머리(양끝 분홍 고무)
  const hm = new THREE.Group();
  hm.position.set(0, 0.5, 0);
  hm.rotation.x = Math.PI / 2;
  shaft.add(hm);
  hm.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 24), glossMat('#ff8fb1', 0.4)));
  for (const s of [-1, 1]) hm.add(mesh(ellipsoid(0.062, 0.025, 0.062, 20, 10), glossMat('#ffffff', 0.4), 0, s * 0.095, 0));
  return root;
}

// ───────── 물뿌리개 ─────────
export function buildCan(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'can';
  const body = new THREE.Group();
  body.position.set(0, -0.08, 0.06);
  root.add(body);
  const blue = glossMat('#8cc8ff', 0.35);
  body.add(mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.13, 28), blue));
  body.add(mesh(ellipsoid(0.075, 0.025, 0.075, 24, 10), blue, 0, 0.065, 0));
  // 손잡이(위 고리) + 주둥이(앞으로 비스듬히) + 해바라기 꼭지
  const grip = mesh(new THREE.TorusGeometry(0.05, 0.012, 10, 24, Math.PI), glossMat('#ffd36e', 0.4), 0, 0.075, 0);
  grip.rotation.y = Math.PI / 2;
  body.add(grip);
  const spout = mesh(capsule(0.016, 0.15), blue, 0, 0.03, 0.1);
  spout.rotation.x = 1.0;
  body.add(spout);
  body.add(mesh(ellipsoid(0.03, 0.012, 0.03, 16, 8), glossMat('#ffd36e', 0.4), 0, 0.07, 0.17));
  return root;
}

// ───────── 사진기 ─────────
export function buildCamera(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'camera';
  const b = new THREE.Group();
  b.position.set(0.06, -0.02, 0.05);
  root.add(b);
  b.add(mesh(new RoundedBoxGeometry(0.2, 0.13, 0.08, 4, 0.03), glossMat('#ffb3c8', 0.35)));
  const lens = mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.05, 24), glossMat('#ffffff', 0.25), 0, 0, 0.055);
  lens.rotation.x = Math.PI / 2;
  b.add(lens);
  b.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.01, 20).rotateX(Math.PI / 2), glossMat('#6a8fd8', 0.15), 0, 0, 0.082));
  b.add(mesh(ellipsoid(0.02, 0.012, 0.02, 12, 8), glossMat('#ffd36e', 0.35), 0.06, 0.07, 0));
  return root;
}

// ───────── 간식(먹기: 주먹밥) ─────────
export function buildSnack(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'snack';
  const rice = mesh(ellipsoid(0.06, 0.055, 0.04, 20, 14), clothMat('#fffaf2'), 0, -0.01, 0.06);
  root.add(rice);
  root.add(mesh(ellipsoid(0.045, 0.03, 0.043, 16, 10), glossMat('#5a8a6a', 0.6), 0, -0.045, 0.06));
  return root;
}

// ───────── 새싹(심기) ─────────
export function buildSprout(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'sprout';
  root.add(mesh(ellipsoid(0.04, 0.035, 0.04, 16, 10), clothMat('#c98f55'), 0, -0.04, 0.05));
  const leafM = clothMat('#86d16f');
  root.add(mesh(capsule(0.006, 0.05), leafM, 0, 0.0, 0.05));
  for (const s of [-1, 1]) {
    const lf = mesh(ellipsoid(0.03, 0.012, 0.018, 14, 8), leafM, s * 0.025, 0.03, 0.05);
    lf.rotation.z = s * 0.5;
    root.add(lf);
  }
  return root;
}
