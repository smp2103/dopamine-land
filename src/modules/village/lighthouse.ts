// 섬 등대 7(GDD 2.4·3.12): 섬마다 말랑섬(원점) 쪽 해안, 높이 16 m, 줄무늬 + 둥근 지붕. 산호빛섬은 새하얀 등대.
// 불(등롱)과 빛줄기는 bake 하지 않는 '살아 있는' 조각 + 등대마다 자기 발광 재질:
// 복구 전엔 꺼진 유리, 복구(lighthouse:<섬>) 뒤엔 낮엔 은은히, 밤엔 환하게 + 빛줄기 두 갈래가 빙글빙글.
import * as THREE from 'three';
import { add, cap, cyl, sph, dome, rbox, stripesY, roundExtrude, type Built } from './common';

/** 섬별 등대 색: 줄무늬 두 색 + 지붕 두 색(아래→위) + 장식 */
export const LIGHTHOUSE_LOOK: Record<string, { stripes: [string, string]; roof: [string, string]; trim: string }> = {
  home: { stripes: ['#ffffff', '#ff6f61'], roof: ['#e8564a', '#ff7b6b'], trim: '#3f5a52' },
  dino: { stripes: ['#ffffff', '#7fcf66'], roof: ['#4f9e44', '#7fcf66'], trim: '#4a5a3a' },
  ice: { stripes: ['#ffffff', '#7fb8ff'], roof: ['#4f7fd0', '#86b4ff'], trim: '#3d5a80' },
  mushroom: { stripes: ['#fff4fb', '#c59cff'], roof: ['#9a6fe0', '#c59cff'], trim: '#54406e' },
  // 산호빛섬: 새하얀 등대 + 청록 지붕(무지개 석호 섬)
  coral: { stripes: ['#ffffff', '#fbf8f1'], roof: ['#3fbdb4', '#7fe0d6'], trim: '#3f8a86' },
  desert: { stripes: ['#fff6e6', '#ffb347'], roof: ['#e0782e', '#ffa057'], trim: '#6e4a2e' },
  launch: { stripes: ['#ffffff', '#6f86f0'], roof: ['#4f63c8', '#7f92ff'], trim: '#3a4470' },
};
/** 등롱 높이(로컬, 배율 전) — 임포스터 불빛 점도 여기 */
export const LAMP_Y = 16.9;
/** 켜졌을 때 낮/밤 발광 세기 */
export const LIT_DAY = 0.9, LIT_NIGHT = 3.4;

export interface LighthouseCtl {
  id: string;
  built: Built;
  /** 살아 있는 묶음 'lighthouse-<id>'(등롱 + 빛줄기) — 위치 = 등대 바닥 */
  root: THREE.Group;
  lamp: THREE.Mesh;
  lampMat: THREE.MeshStandardMaterial;
  beam: THREE.Group;
  beamMat: THREE.MeshBasicMaterial;
  lit: boolean;
  setLit(on: boolean): void;
  /** 멀리서 보이는 불빛 세기 0..1(임포스터) */
  glow(): number;
}

let beamGeo: THREE.BufferGeometry | null = null;
/** 빛줄기: 등롱에서 +x 로 뻗는 원뿔(끝으로 갈수록 정점색이 어두워져 더하기 혼합에서 투명해진다) */
function beamGeometry(): THREE.BufferGeometry {
  if (beamGeo) return beamGeo;
  const L = 34;
  const g = new THREE.CylinderGeometry(4.2, 0.55, L, 24, 6, true);
  g.translate(0, L / 2 + 0.6, 0);
  g.rotateZ(-Math.PI / 2);
  const p = g.attributes.position, a = new Float32Array(p.count * 3);
  const c0 = new THREE.Color('#fff1b8');
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getX(i) / L));
    const k = Math.pow(1 - t, 1.6);
    a[i * 3] = c0.r * k; a[i * 3 + 1] = c0.g * k; a[i * 3 + 2] = c0.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.userData.shared = true;
  return (beamGeo = g);
}

/**
 * 등대 하나. night() 는 0(낮)..1(밤) — 매 프레임 anim 이 읽는다.
 * 모든 정적 조각은 재질 키(bake 가 합침), 등롱·빛줄기만 자기 재질.
 */
export function buildLighthouse(id: string, night: () => number, phase = 0): LighthouseCtl {
  const look = LIGHTHOUSE_LOOK[id] ?? LIGHTHOUSE_LOOK.home;
  const g = new THREE.Group();
  // 바위 받침 + 둥근 계단 턱
  add(g, cyl(5.2, 4.8, 1.2, 40), 'stone', ['#a9a094', '#cfc7b9'], 0, 0, 0);
  add(g, cyl(3.4, 3.4, 0.35, 40), 'stone', '#d8d0c2', 0, 0.75, 0);
  // 탑(위로 갈수록 가늘게, 줄무늬)
  const tw = new THREE.CylinderGeometry(1.7, 2.6, 15, 40, 60);
  stripesY(tw, look.stripes, 2.5, -7.5);
  add(g, tw, 'gloss', null, 0, 7.8, 0);
  // 산호빛섬 흰 등대: 줄무늬 대신 청록 띠 두 줄 + 조개 장식
  if (id === 'coral') {
    for (const y of [5.2, 11.2]) {
      const r = 2.6 - ((y - 0.3) / 15) * 0.9;
      add(g, new THREE.TorusGeometry(r + 0.02, 0.16, 10, 48), 'gloss', look.roof[1], 0, y, 0, [Math.PI / 2, 0, 0]);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      add(g, sph(0.45, 20, 12), 'shell', '#ffd6e0', Math.cos(a) * 3.0, 1.0, Math.sin(a) * 3.0, undefined, [1, 0.45, 1]);
    }
  }
  // 전망대(난간 + 기둥)
  add(g, cyl(2.3, 2.3, 0.5, 40), 'paint', look.trim, 0, 15.5, 0);
  add(g, new THREE.TorusGeometry(2.25, 0.07, 8, 48), 'gloss', look.trim, 0, 16.4, 0, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; add(g, cap(0.05, 0.8), 'gloss', look.trim, Math.cos(a) * 2.25, 16.0, Math.sin(a) * 2.25); }
  // 등롱 창살
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(g, cap(0.08, 2.0), 'gloss', look.trim, Math.cos(a) * 1.4, LAMP_Y, Math.sin(a) * 1.4); }
  add(g, cyl(1.5, 1.5, 0.25, 32), 'gloss', look.trim, 0, LAMP_Y - 1.05, 0);
  // 둥근 지붕 + 금 구슬 + 작은 깃발
  add(g, dome(1.8, 40, 16), 'gloss', look.roof, 0, LAMP_Y + 1.0, 0, undefined, [1, 0.9, 1]);
  add(g, sph(0.3), 'gold', null, 0, LAMP_Y + 2.8, 0);
  add(g, cap(0.04, 0.9, 8), 'gold', null, 0, LAMP_Y + 3.4, 0);
  add(g, rbox(0.04, 0.32, 0.55, 0.02, 2), 'cloth', look.roof[1], 0, LAMP_Y + 3.65, 0.3);
  // 둥근 문 + 창 3
  const ds = new THREE.Shape(); ds.moveTo(-0.55, 0); ds.lineTo(0.55, 0); ds.lineTo(0.55, 1.2); ds.absarc(0, 1.2, 0.55, 0, Math.PI, false); ds.lineTo(-0.55, 0);
  add(g, roundExtrude(ds, 0.14, 0.05, 24), 'wood', ['#7d4f33', '#a06b45'], 0, 0.9, 2.5);
  for (const y of [6, 10, 13.5]) add(g, rbox(0.55, 0.75, 0.1, 0.18, 3), 'window', null, 0, y, 2.6 - ((y - 0.3) / 15) * 0.9 + 0.02, [-0.06, 0, 0]);

  // ── 살아 있는 조각: 등롱(자기 재질) + 빛줄기
  const root = new THREE.Group();
  root.name = `lighthouse-${id}`;
  root.userData.live = true;
  root.userData.lighthouse = id;
  const lampMat = new THREE.MeshStandardMaterial({ color: '#9fb3c4', roughness: 0.25, metalness: 0.05, emissive: '#ffcf5a', emissiveIntensity: 0 });
  lampMat.name = `lighthouse-lamp-${id}`;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 1.9, 32), lampMat);
  lamp.position.set(0, LAMP_Y, 0);
  lamp.name = `lighthouse-lamp-${id}`;
  lamp.castShadow = false;
  root.add(lamp);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), lampMat);
  bulb.position.set(0, LAMP_Y, 0);
  root.add(bulb);
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  beamMat.name = `lighthouse-beam-${id}`;
  const beam = new THREE.Group();
  beam.name = `lighthouse-beam-${id}`;
  beam.position.set(0, LAMP_Y, 0);
  for (const ry of [0, Math.PI]) {
    const m = new THREE.Mesh(beamGeometry(), beamMat);
    m.rotation.y = ry;
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.renderOrder = 3;
    beam.add(m);
  }
  beam.visible = false;
  root.add(beam);
  g.add(root);

  const ctl: LighthouseCtl = {
    id, root, lamp, lampMat, beam, beamMat, lit: false,
    built: {
      g, foot: 4.5,
      cols: [{ kind: 'cyl', r: 2.6, hh: 9, x: 0, y: 9, z: 0 }, { kind: 'cyl', r: 5.0, hh: 0.6, x: 0, y: 0, z: 0 }],
      anim: [{
        o: root,
        fn: (_o, _b, t) => {
          const k = night();
          if (ctl.lit) {
            // 은은한 숨쉬기(밤엔 환하게)
            lampMat.emissiveIntensity = (LIT_DAY + (LIT_NIGHT - LIT_DAY) * k) * (0.92 + 0.08 * Math.sin(t * 2.2 + phase));
            beam.visible = k > 0.05;
            beamMat.opacity = 0.6 * k;
            beam.rotation.y = t * 0.85 + phase;
          } else {
            lampMat.emissiveIntensity = 0;
            beam.visible = false;
          }
        },
      }],
    },
    setLit(on) {
      ctl.lit = !!on;
      if (ctl.lit) {
        lampMat.color.set('#fff6d0');
        lampMat.emissiveIntensity = LIT_DAY + (LIT_NIGHT - LIT_DAY) * night();
        beam.visible = night() > 0.05;
        beamMat.opacity = 0.6 * night();
      } else {
        lampMat.color.set('#9fb3c4');
        lampMat.emissiveIntensity = 0;
        beam.visible = false;
        beamMat.opacity = 0;
      }
    },
    glow: () => (ctl.lit ? 0.15 + 0.85 * night() : 0),
  };
  ctl.setLit(false);
  // 디버그: 씬에서 이름으로 찾아 바로 켤 수 있게(scene.getObjectByName('lighthouse-coral').userData.setLit(true))
  root.userData.setLit = (on: boolean) => ctl.setLit(on);
  return ctl;
}
