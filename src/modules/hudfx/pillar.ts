// ★5 빛기둥 — 플레이어 자리에 금빛 원기둥 하나(그리기 1번). 지오메트리·재질·텍스처는 모듈 전역에서 한 벌만 만들어 다시 쓴다.
// 위로 갈수록 투명해지는 세로 그라데이션 캔버스 + 가산 혼합, 천천히 돌며 숨 쉬듯 밝아졌다 사라진다.
import * as THREE from 'three';

let geo: THREE.CylinderGeometry | null = null;
let innerGeo: THREE.CylinderGeometry | null = null;
let tex: THREE.CanvasTexture | null = null;

function texture() {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  // 캔버스 위 = 기둥 꼭대기(투명) → 아래 = 바닥(진함)
  gr.addColorStop(0, 'rgba(255,240,170,0)');
  gr.addColorStop(0.45, 'rgba(255,226,120,0.55)');
  gr.addColorStop(0.85, 'rgba(255,214,90,0.95)');
  gr.addColorStop(1, 'rgba(255,250,220,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface Pillar { root: THREE.Group; play(at: THREE.Vector3, ms: number): void; update(nowMs: number, hold: boolean): void; readonly active: boolean }

/** 빛기둥 한 벌(다시 쓴다). parent 에 붙여 두고 play 로 켠다 */
export function makePillar(parent: THREE.Object3D): Pillar {
  geo ??= new THREE.CylinderGeometry(0.75, 1.05, 40, 28, 1, true);
  innerGeo ??= new THREE.CylinderGeometry(0.28, 0.38, 40, 20, 1, true);
  geo.userData.shared = true;
  innerGeo.userData.shared = true;
  const mat = (o: number) => new THREE.MeshBasicMaterial({
    map: texture(), color: 0xffe7a0, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
  });
  const outer = new THREE.Mesh(geo, mat(0.7));
  const inner = new THREE.Mesh(innerGeo, mat(1));
  for (const m of [outer, inner]) { m.position.y = 20; m.renderOrder = 5; m.frustumCulled = false; }
  const root = new THREE.Group();
  root.name = 'hudfx-pillar';
  root.add(outer, inner);
  root.visible = false;
  parent.add(root);
  let t0 = 0, dur = 0, on = false;
  return {
    root,
    get active() { return on; },
    play(at, ms) {
      root.position.copy(at);
      t0 = performance.now(); dur = ms; on = true;
      root.visible = true;
    },
    update(now, hold) {
      if (!on) return;
      const k = (now - t0) / dur;
      if (k >= 1 && !hold) { on = false; root.visible = false; return; }
      // 0.25초 솟고 · 가운데 숨 쉬고 · 마지막 30% 에 사라진다
      const kk = hold ? Math.min(k, 0.5) : k;
      const rise = Math.min(1, kk / 0.12);
      const fade = kk > 0.7 ? Math.max(0, 1 - (kk - 0.7) / 0.3) : 1;
      const pulse = 0.85 + Math.sin(now * 0.008) * 0.15;
      root.scale.set(0.6 + rise * 0.4, rise, 0.6 + rise * 0.4);
      (outer.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade * pulse;
      (inner.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade;
      outer.rotation.y = now * 0.0006;
    },
  };
}
