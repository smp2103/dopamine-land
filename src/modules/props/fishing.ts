// 낚시 포인트: 물속 물고기 그림자(부드러운 어두운 타원, 천천히 헤엄) + 가끔 퍼지는 물결 고리.
import * as THREE from 'three';
import { canvasTex } from './kit';

let fishTex: THREE.CanvasTexture | null = null;
function getFishTex(): THREE.CanvasTexture {
  if (fishTex) return fishTex;
  // 위에서 본 물고기 실루엣(몸통 타원 + 꼬리), 가장자리를 흐리게
  fishTex = canvasTex(256, 128, (g) => {
    g.clearRect(0, 0, 256, 128);
    g.filter = 'blur(10px)';
    g.fillStyle = '#0d3550';
    g.beginPath();
    g.ellipse(114, 64, 76, 32, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(175, 64);
    g.quadraticCurveTo(200, 46, 222, 42);
    g.quadraticCurveTo(212, 64, 222, 86);
    g.quadraticCurveTo(200, 82, 175, 64);
    g.fill();
  });
  fishTex.wrapS = fishTex.wrapT = THREE.ClampToEdgeWrapping;
  return fishTex;
}

let ringTex: THREE.CanvasTexture | null = null;
function getRingTex(): THREE.CanvasTexture {
  if (ringTex) return ringTex;
  ringTex = canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.filter = 'blur(3px)';
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(128, 128, 108, 0, Math.PI * 2);
    g.stroke();
  });
  ringTex.wrapS = ringTex.wrapT = THREE.ClampToEdgeWrapping;
  return ringTex;
}

export interface FishOpts {
  /** 물고기가 헤엄치는 중심 */
  x: number; z: number;
  /** 수면 높이 */
  waterY: number;
  /** 몸 길이(m) */
  size: number;
  /** 배회 반경(x, z) */
  rx: number; rz: number;
  phase: number;
  /** 물결 고리 주기 위상(초) */
  ringPhase: number;
  /** 그림자·고리를 수면 위로 얼마나 띄울지(바다 물결 높이만큼) */
  lift: number;
  opacity: number;
  onUpdate: (fn: (t: number) => void) => void;
}

export function buildFishSpot(o: FishOpts): THREE.Group {
  const g = new THREE.Group();
  g.name = 'fishSpot';
  g.userData.live = true;

  // 물이 꽤 불투명해서(강 알파 ~0.8) 그림자는 물 위에 겹쳐 그린다 — 짙은 청록이라 물속처럼 보인다
  const fishMat = new THREE.MeshBasicMaterial({
    map: getFishTex(), transparent: true, opacity: 0.5, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16,
  });
  const fish = new THREE.Mesh(new THREE.PlaneGeometry(o.size, o.size * 0.5).rotateX(-Math.PI / 2), fishMat);
  fish.renderOrder = 5;
  g.add(fish);

  // 물결 고리 두 겹(시차)
  const rings: Array<{ m: THREE.Mesh; mat: THREE.MeshBasicMaterial; off: number }> = [];
  for (let i = 0; i < 2; i++) {
    // 고리는 물 위(강 재질의 polygonOffset 보다 더 당겨서)
    const mat = new THREE.MeshBasicMaterial({
      map: getRingTex(), transparent: true, opacity: 0, depthWrite: false, color: '#ffffff',
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
    m.renderOrder = 6;
    g.add(m);
    rings.push({ m, mat, off: i * 0.45 });
  }

  const PERIOD = 5.2;
  let rx = o.x, rz = o.z, lastCycle = -1;
  o.onUpdate((t) => {
    const tt = t * 0.22 + o.phase;
    // 리사주 궤적으로 느릿느릿
    const x = o.x + Math.sin(tt) * o.rx;
    const z = o.z + Math.sin(tt * 1.37 + 0.6) * o.rz;
    const dx = Math.cos(tt) * o.rx, dz = 1.37 * Math.cos(tt * 1.37 + 0.6) * o.rz;
    fish.position.set(x, o.waterY + o.lift * 0.6, z);
    // 머리(텍스처 왼쪽 = -x) 가 진행 방향을 보게
    fish.rotation.y = Math.atan2(dz, -dx);
    // 꼬리 살랑(폭만 아주 살짝)
    fish.scale.set(1, 1, 1 + 0.06 * Math.sin(t * 5.0 + o.phase));
    fishMat.opacity = o.opacity + 0.06 * Math.sin(t * 0.7 + o.phase);

    // 고리: 주기마다 물고기 근처(머리 앞)에서 퍼진다
    const cyc = Math.floor((t + o.ringPhase) / PERIOD);
    if (cyc !== lastCycle) {
      lastCycle = cyc;
      rx = x - Math.cos(fish.rotation.y) * o.size * 0.35;
      rz = z + Math.sin(fish.rotation.y) * o.size * 0.35;
    }
    const local = ((t + o.ringPhase) % PERIOD) / PERIOD;
    for (const r of rings) {
      const k = (local * PERIOD - r.off) / 2.4; // 2.4 초 동안 퍼짐
      if (k < 0 || k > 1) { r.mat.opacity = 0; continue; }
      const s = 0.25 + k * (0.9 + o.size);
      r.m.scale.set(s, 1, s);
      r.m.position.set(rx, o.waterY + o.lift, rz);
      r.mat.opacity = 0.75 * Math.sin(Math.PI * Math.sqrt(k)) * (1 - k);
    }
  });
  return g;
}
