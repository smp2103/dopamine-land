// 시설 NPC 시그니처 소품: 멀리서도 '아, 그 가게 주인!' 하게 하나씩(손에 든 것 · 머리 · 등).
// 누가 NPC 인지는 생김새로 짐작하지 않는다: 만드는 쪽(residents.ts — 시설 NPC 자리)이 spec.npc 에 id 를 적는다.
// 스튜디오처럼 NPC spec 을 그대로 복사해 온 경우만(모든 칸이 똑같고, 어떤 일반 주민 spec 과도 다를 때) 알아본다.
import * as THREE from 'three';
import { ellipsoid, lathe, capsule } from '../geo';
import { mesh } from '../kit';
import { FACILITY_NPCS, RESIDENTS, MIGRANTS } from '../data';
import type { AnimalSpec } from '../animal';

export type PropKind = 'bowtie' | 'magnifier' | 'goggles' | 'spyglass' | 'toolbelt' | 'snorkel' | 'carpet' | 'sack' | 'yarn' | 'mortarboard' | 'cane' | 'wand';

const BY_NPC: Readonly<Record<string, PropKind>> = {
  npc_quack: 'bowtie', npc_slow: 'magnifier', npc_peng: 'goggles', npc_peli: 'spyglass', npc_tongtong: 'toolbelt',
  npc_bodeul: 'snorkel', npc_camel: 'carpet', npc_raccoon: 'sack', npc_sheep: 'yarn', npc_owl_prof: 'mortarboard',
  npc_snow_elder: 'cane', npc_saltstar: 'wand',
};

/** 이 NPC id 의 소품 */
export function propOfNpc(id: string | undefined): PropKind | null {
  return (id && BY_NPC[id]) || null;
}

/** spec 두 개가 칸 하나까지 똑같은지(중첩 shirt 포함) */
function sameSpec(a: AnimalSpec, b: AnimalSpec): boolean {
  const ka = Object.keys(a).filter((k) => k !== 'npc' && (a as unknown as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => k !== 'npc' && (b as unknown as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  const ra = a as unknown as Record<string, unknown>, rb = b as unknown as Record<string, unknown>;
  for (const k of ka) {
    const x = ra[k], y = rb[k];
    if (x && y && typeof x === 'object' && typeof y === 'object') { if (JSON.stringify(x) !== JSON.stringify(y)) return false; }
    else if (x !== y) return false;
  }
  return true;
}

/** 시그니처 소품: spec.npc 가 있으면 그것만 본다. 없으면 NPC spec 을 통째로 복사한 경우만(일반 주민과 겹치면 없음) */
export function signatureOf(spec: AnimalSpec): PropKind | null {
  if (spec.npc !== undefined) return propOfNpc(spec.npc);
  for (const n of FACILITY_NPCS) {
    const p = BY_NPC[n.id];
    if (!p || n.model) continue;
    for (const s of [n.spec, n.alt]) {
      if (!s || !sameSpec(s, spec)) continue;
      if ([...RESIDENTS, ...MIGRANTS].some((r) => sameSpec(r.spec, spec))) return null;
      return p;
    }
  }
  return null;
}

export interface PropSlots {
  head: THREE.Object3D;
  body: THREE.Object3D;
  /** 오른손(+x 팔) 끝 그룹 — 손 흔들지 않는 쪽 */
  hand: THREE.Object3D;
  /** 머리 반지름 · 정수리 높이(머리 좌표) · 엉덩이 높이 */
  R: [number, number, number];
  hip: number;
  accent: string;
  /** 재질(빌더의 같은 색 하나 캐시를 같이 쓴다 — 합치기가 드로콜을 줄이게) */
  mats: { skin: (c: string) => THREE.Material; cloth: (c: string) => THREE.Material; gloss: (c: string, r?: number) => THREE.Material };
}

/** 소품 달기 — 머리 꼭대기에 더해지는 높이(m, 말풍선 자리용)를 돌려준다 */
export function addProp(kind: PropKind, s: PropSlots): number {
  const [RX, RY, RZ] = s.R;
  const { head, body, hand } = s;
  const H = s.hip;
  const { skin: skinMat, cloth: clothMat, gloss: glossMat } = s.mats;
  switch (kind) {
    case 'bowtie': {
      // 가게 주인 나비넥타이(빨강 물방울)
      const m = clothMat('#ff6f7f');
      for (const k of [-1, 1]) {
        const w = mesh(ellipsoid(0.055, 0.04, 0.025, 20, 14), m, k * 0.05, 0.515 - H, 0.115);
        w.rotation.z = k * 0.35;
        body.add(w);
      }
      body.add(mesh(ellipsoid(0.026, 0.026, 0.024, 14, 10), m, 0, 0.515 - H, 0.13));
      return 0;
    }
    case 'magnifier': {
      // 돋보기(금테 + 반짝 유리)
      const g = new THREE.Group();
      g.position.set(0, -0.2, 0.06);
      g.rotation.set(-0.5, 0, 0.3);
      g.add(mesh(capsule(0.014, 0.12), glossMat('#a0744a', 0.4), 0, -0.02, 0));
      const ring = mesh(new THREE.TorusGeometry(0.055, 0.011, 10, 32), glossMat('#ffcf4a', 0.25), 0, 0.09, 0);
      g.add(ring);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.052, 28), new THREE.MeshPhysicalMaterial({ color: '#dff6ff', transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
      lens.position.y = 0.09;
      g.add(lens);
      hand.add(g);
      return 0;
    }
    case 'goggles': {
      // 실험 고글(이마 위로 올린) + 끈
      const g = new THREE.Group();
      g.position.set(0, RY * 0.5, 0);
      const strap = mesh(new THREE.TorusGeometry(1, 0.06, 10, 48), clothMat('#5a4a6a'));
      strap.rotation.x = Math.PI / 2 - 0.35;
      strap.scale.set(RX * 0.99, RZ * 0.99, RY * 0.5);
      g.add(strap);
      for (const k of [-1, 1]) {
        const lens = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 28), glossMat('#ffcf4a', 0.3), k * 0.09, RY * 0.25, RZ * 0.82);
        lens.rotation.x = Math.PI / 2 - 0.45;
        g.add(lens);
        const glass = mesh(new THREE.CircleGeometry(0.05, 24), glossMat('#8fe0ff', 0.08), k * 0.09, RY * 0.25 + 0.012, RZ * 0.82 + 0.026);
        glass.rotation.x = -0.45;
        g.add(glass);
      }
      head.add(g);
      return 0.02;
    }
    case 'spyglass': {
      const g = new THREE.Group();
      g.position.set(0, -0.2, 0.05);
      g.rotation.set(-1.2, 0, 0);
      g.add(mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.16, 16), glossMat('#b07a4a', 0.4), 0, 0.02, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 16), glossMat('#ffcf4a', 0.25), 0, 0.12, 0));
      hand.add(g);
      return 0;
    }
    case 'toolbelt': {
      // 목수 허리띠 + 망치 주머니 + 귀에 꽂은 연필
      const belt = mesh(new THREE.TorusGeometry(0.19, 0.022, 10, 48), clothMat('#8a5a3a'), 0, 0.27 - H, 0);
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(1, 0.9, 1);
      body.add(belt);
      body.add(mesh(ellipsoid(0.06, 0.07, 0.035, 18, 12), clothMat('#a8704a'), 0.15, 0.22 - H, 0.08));
      const hammer = new THREE.Group();
      hammer.position.set(0.17, 0.25 - H, 0.06);
      hammer.add(mesh(capsule(0.012, 0.15), glossMat('#d9a066', 0.5), 0, 0.03, 0));
      hammer.add(mesh(capsule(0.024, 0.09), glossMat('#8a96a8', 0.3), 0, 0.11, 0).rotateZ(Math.PI / 2));
      body.add(hammer);
      const pencil = mesh(capsule(0.011, 0.14), glossMat('#ffd36e', 0.4), RX * 0.78, RY * 0.35, RZ * 0.2);
      pencil.rotation.set(0.2, 0, -1.0);
      head.add(pencil);
      return 0;
    }
    case 'snorkel': {
      // 머리 옆 스노클 관(주황 끝)
      const pts = [new THREE.Vector3(RX * 0.9, -RY * 0.1, RZ * 0.3), new THREE.Vector3(RX * 1.0, RY * 0.4, RZ * 0.05), new THREE.Vector3(RX * 0.95, RY * 1.05, -RZ * 0.1)];
      const tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.022, 10, false), glossMat('#4fd1c5', 0.3));
      head.add(tube);
      head.add(mesh(capsule(0.03, 0.06), glossMat('#ff9f6e', 0.3), RX * 0.95, RY * 1.08, -RZ * 0.1));
      return 0.1;
    }
    case 'carpet': {
      // 옆구리에 낀 말린 양탄자(줄무늬 끝) — 등은 혹 자리라 비워 둔다. 팔과 같이 흔들린다
      const g = new THREE.Group();
      g.position.set(0.035, -0.15, 0.0);
      g.rotation.set(Math.PI / 2 - 0.25, 0, -0.38);
      g.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.4, 24), clothMat('#e0524f'), 0, 0, 0));
      for (const k of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.057, 0.057, 0.045, 24), clothMat('#ffd36e'), 0, k * 0.16, 0));
      hand.add(g);
      return 0;
    }
    case 'sack': {
      // 고물 보따리(기운 천 조각 + 매듭)
      const g = new THREE.Group();
      g.position.set(0.02, 0.42 - H, -0.22);
      const bag = mesh(ellipsoid(0.17, 0.19, 0.13, 28, 20), clothMat('#c9b48a'));
      g.add(bag);
      g.add(mesh(ellipsoid(0.06, 0.05, 0.02, 14, 10), clothMat('#8fae6a'), 0.07, 0.03, -0.125));
      g.add(mesh(ellipsoid(0.045, 0.04, 0.02, 14, 10), clothMat('#ff9f6e'), -0.08, -0.07, -0.115));
      g.add(mesh(ellipsoid(0.05, 0.035, 0.04, 14, 10), clothMat('#a8946a'), 0, 0.19, 0.02));
      body.add(g);
      const strap = mesh(new THREE.TorusGeometry(0.2, 0.014, 8, 40), clothMat('#a8946a'), 0, 0.42 - H, -0.02);
      strap.rotation.set(0.25, 0, 0.7);
      strap.scale.set(1, 1.1, 0.75);
      body.add(strap);
      return 0;
    }
    case 'yarn': {
      // 털실 뭉치 + 뜨개바늘
      const g = new THREE.Group();
      g.position.set(0, -0.2, 0.07);
      g.add(mesh(ellipsoid(0.07, 0.07, 0.07, 22, 16), clothMat(s.accent)));
      for (const k of [-1, 1]) {
        const n = mesh(capsule(0.007, 0.18), glossMat('#ffd36e', 0.3), k * 0.02, 0.03, 0.02);
        n.rotation.z = k * 0.5;
        g.add(n);
      }
      hand.add(g);
      return 0;
    }
    case 'mortarboard': {
      // 학사모(네모 판 + 술)
      const g = new THREE.Group();
      g.position.set(0, RY * 0.86, -0.01);
      g.rotation.x = -0.1;
      g.add(mesh(lathe([[0.0001, 0.06], [0.17, 0.055], [0.19, 0.02], [0.185, 0.0]], 32, 8), clothMat('#3a3550')));
      const board = mesh(new THREE.BoxGeometry(0.42, 0.025, 0.42), clothMat('#3a3550'), 0, 0.07, 0);
      board.rotation.y = Math.PI / 4;
      g.add(board);
      g.add(mesh(ellipsoid(0.02, 0.015, 0.02), glossMat('#ffcf4a', 0.3), 0, 0.09, 0));
      const tassel = mesh(capsule(0.012, 0.12), clothMat('#ffcf4a'), 0.19, 0.02, 0.0);
      g.add(tassel);
      head.add(g);
      return 0.1;
    }
    case 'cane': {
      // 할아버지 지팡이 + 하얀 수염
      const g = new THREE.Group();
      g.position.set(0, -0.2, 0.04);
      g.add(mesh(capsule(0.016, 0.38), glossMat('#b07a4a', 0.45), 0, -0.12, 0));
      const hook = mesh(new THREE.TorusGeometry(0.04, 0.016, 8, 20, Math.PI), glossMat('#b07a4a', 0.45), -0.04, 0.07, 0);
      g.add(hook);
      hand.add(g);
      const beard = skinMat('#ffffff');
      for (const [x, y, r] of [[0, -0.2, 0.09], [-0.07, -0.17, 0.07], [0.07, -0.17, 0.07], [0, -0.29, 0.065], [0, -0.36, 0.045]] as const) {
        head.add(mesh(ellipsoid(r, r * 1.1, r * 0.7, 18, 12), beard, x * RX / 0.35, y * RY / 0.31, RZ * 0.82));
      }
      return 0;
    }
    case 'wand': {
      // 별 지팡이(반짝)
      const g = new THREE.Group();
      g.position.set(0, -0.2, 0.06);
      g.rotation.x = -0.4;
      g.add(mesh(capsule(0.01, 0.2), glossMat('#fffaf2', 0.3), 0, 0.05, 0));
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.026 : 0.06;
        if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r); else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const sg = new THREE.ExtrudeGeometry(star, { depth: 0.022, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
      sg.translate(0, 0, -0.011);
      const sm = new THREE.MeshPhysicalMaterial({ color: '#ffe27a', emissive: '#ffcf4a', emissiveIntensity: 0.6, roughness: 0.3, clearcoat: 0.6 });
      g.add(mesh(sg, sm, 0, 0.18, 0));
      hand.add(g);
      return 0;
    }
  }
}
