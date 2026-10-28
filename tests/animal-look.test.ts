// animal-look: 동물 주민 생김새 — 종마다 만들어지고(노드, DOM 없음) · 좌표 유한 · 드로콜 예산(가까이 ≤ 40, 먼 LOD ≤ 6) ·
// 얼굴 조각(눈·입) · 표정 전환 · 쳐다보기 · 스쿼시 · 시설 NPC 시그니처 소품 · 몽실(마을 곰).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { sceneStats, allFinite } from './kit/three';
import { buildAnimal, ANIMAL_KINDS, type AnimalSpec, type AnimalKind } from '../src/modules/characters/animal';
import { buildVillager } from '../src/modules/characters/villager';
import { signatureOf } from '../src/modules/characters/animal/props';
import { headPoint } from '../src/modules/characters/animal/head';
import { FACILITY_NPCS, RESIDENTS, MIGRANTS } from '../src/modules/characters/data';

const OUTFITS = ['stripe', 'pocket', 'overalls', 'dress', 'hoodie'] as const;
const specOf = (kind: AnimalKind, i: number): AnimalSpec => ({
  kind, fur: '#e8b88a', light: '#fff1dc', outfit: i % 3 === 0 ? undefined : OUTFITS[i % OUTFITS.length], outfitColor: '#8fd3ff',
  acc: (['none', 'beanie', 'scarf', 'glasses', 'sunhat', 'bow', 'flower', 'captain'] as const)[i % 8],
});
const visibleStats = (r: THREE.Object3D) => sceneStats(r, { visibleOnly: true });

describe('동물 주민 생김새', () => {
  it('종마다 만들어지고 좌표가 유한하며 드로콜 예산 안(가까이 ≤ 40)', () => {
    for (const [i, k] of ANIMAL_KINDS.entries()) {
      const rig = buildAnimal(specOf(k, i));
      rig.update(0.5, 1 / 60, { walk: 0.8, talk: true, wave: true, happy: true });
      rig.update(1.0, 1 / 60, { walk: 0, talk: false, wave: false, happy: false, clap: true });
      expect(allFinite(rig.root), k).toBe(true);
      const st = visibleStats(rig.root);
      expect(st.drawCalls, k).toBeLessThanOrEqual(40);
      expect(rig.top, k).toBeGreaterThan(0.8);
      expect(rig.top, k).toBeLessThan(2.2);
    }
  });

  it('게임 주민 전부(RESIDENTS) 그대로 만들어진다 — 좌표 유한 · 예산 안', () => {
    let worst = 0;
    for (const r of RESIDENTS) {
      if (r.model) continue;
      const rig = buildAnimal({ ...r.spec });
      for (let i = 0; i < 4; i++) rig.update(i * 0.3, 1 / 60, { walk: i % 2, talk: i === 2, wave: i === 1, happy: i === 3, clap: i === 3 });
      expect(allFinite(rig.root), r.id).toBe(true);
      worst = Math.max(worst, visibleStats(rig.root).drawCalls);
    }
    expect(worst).toBeLessThanOrEqual(40);
  });

  it('먼 LOD(≥ 25 m): ≤ 6 드로콜 · 삼각형이 크게 준다 · 되돌리면 가까운 모습', () => {
    for (const [i, k] of ANIMAL_KINDS.entries()) {
      const rig = buildAnimal(specOf(k, i));
      const nearSt = visibleStats(rig.root);
      rig.setLod!('far');
      rig.update(1, 1 / 60, { walk: 1, talk: false, wave: false, happy: false });
      const farSt = visibleStats(rig.root);
      expect(allFinite(rig.root), k).toBe(true);
      expect(farSt.drawCalls, k).toBeLessThanOrEqual(6);
      expect(farSt.triangles, k).toBeLessThan(nearSt.triangles * 0.35);
      // 먼 LOD 는 종마다 비슷한 무게(고슴도치 가시도 원뿔로 줄여 다른 종의 3 배가 안 되게)
      expect(farSt.triangles, k).toBeLessThan(9000);
      // 굳힌 몸은 정점 색을 가진다(하얗게 바래면 안 된다 — 팔레트 색을 그대로 옮긴다)
      const body = rig.root.getObjectByName('lod-body') as THREE.Mesh;
      const col = body.geometry.attributes.color;
      let min = 9, max = -9;
      for (let j = 0; j < col.count; j += 7) { const v = col.getX(j) + col.getY(j) + col.getZ(j); min = Math.min(min, v); max = Math.max(max, v); }
      expect(max - min, k).toBeGreaterThan(0.05);
      rig.setLod!('near');
      expect(visibleStats(rig.root).drawCalls, k).toBe(nearSt.drawCalls);
    }
  });

  it('먼 LOD 미리 굽기(prepareLod): 한 번만 굽고 가까운 동안엔 숨어 있다 · 먼 모습도 뒤뚱 움직인다', () => {
    const rig = buildAnimal(specOf('bear', 1));
    const nearSt = visibleStats(rig.root);
    expect(rig.prepareLod!()).toBe(true);
    expect(rig.prepareLod!()).toBe(false);
    expect(visibleStats(rig.root).drawCalls).toBe(nearSt.drawCalls);
    rig.setLod!('far');
    const far = rig.root.getObjectByName('lod-far')!;
    rig.update(0.3, 1 / 60, { walk: 1, talk: false, wave: false, happy: false });
    const a = far.rotation.z;
    rig.update(0.6, 1 / 60, { walk: 1, talk: false, wave: false, happy: false });
    expect(Math.abs(far.rotation.z - a) + Math.abs(far.position.y)).toBeGreaterThan(0.001);
  });

  it('얼굴 조각: 눈·입(부리 종은 눈만) · 표정마다 눈 그림이 바뀐다', () => {
    const rig = buildAnimal({ kind: 'bear', fur: '#e8b88a', light: '#fff1dc' });
    const eyes = rig.root.getObjectByName('eyes') as THREE.Mesh;
    const mouth = rig.root.getObjectByName('mouth') as THREE.Mesh;
    expect(eyes?.isMesh).toBe(true);
    expect(mouth?.isMesh).toBe(true);
    expect((eyes.geometry.attributes.position.count)).toBeGreaterThan(30);
    const mat = eyes.material as THREE.MeshStandardMaterial;
    rig.update(0, 1 / 60, { walk: 0, talk: false, wave: false, happy: false });
    const open = mat.map;
    rig.setExpression!('happy');
    rig.update(0.1, 1 / 60, { walk: 0, talk: false, wave: false, happy: false });
    expect(mat.map).not.toBe(open);
    rig.setExpression!(null);
    rig.update(0.2, 1 / 60, { walk: 0, talk: false, wave: false, happy: false });
    expect(mat.map).toBe(open);
    const duck = buildAnimal({ kind: 'duck', fur: '#fff3c4', light: '#fffaf0' });
    expect(duck.root.getObjectByName('eyes')).toBeTruthy();
    expect(duck.root.getObjectByName('mouth')).toBeFalsy();
  });

  it('쳐다보기: 옆에 선 플레이어 쪽으로 머리가 돈다(한계 안)', () => {
    const rig = buildAnimal({ kind: 'cat', fur: '#f3c48e', light: '#fff4e2' });
    rig.root.updateMatrixWorld(true);
    for (let i = 0; i < 90; i++) rig.update(i / 60, 1 / 60, { walk: 0, talk: false, wave: false, happy: false, look: new THREE.Vector3(3, 1, 1) });
    const h = rig.head!;
    expect(h.rotation.y).toBeGreaterThan(0.4);
    expect(h.rotation.y).toBeLessThanOrEqual(0.81);
  });

  it('깡충 뛰면 쭉 늘었다가 착지에 찌부(스쿼시&스트레치)', () => {
    const rig = buildAnimal({ kind: 'rabbit', fur: '#ffffff', light: '#fff4f4' });
    const rigNode = rig.root.children[0].children[0];
    let maxY = 1, minY = 1;
    for (let i = 0; i < 120; i++) {
      const t = i / 60;
      rig.root.position.y = Math.max(0, Math.sin(t * 5)) * 0.4;
      rig.update(t, 1 / 60, { walk: 0, talk: false, wave: false, happy: false });
      maxY = Math.max(maxY, rigNode.scale.y);
      minY = Math.min(minY, rigNode.scale.y);
    }
    expect(maxY).toBeGreaterThan(1.03);
    expect(minY).toBeLessThan(0.97);
  });

  it('머리 조형: 볼 통통 · 뒤통수 볼록(완전한 타원체가 아니다)', () => {
    const s = { rx: 0.36, ry: 0.315, rz: 0.33, cheek: 0.1, jaw: 0.06, flat: 0.06, back: 0.06 };
    const cheek = headPoint(s, 0.95, -0.31, 0).x / 0.95;
    const temple = headPoint(s, 0.95, 0.31, 0).x / 0.95;
    expect(cheek).toBeGreaterThan(temple * 1.03);
    expect(-headPoint(s, 0, 0, -1).z).toBeGreaterThan(headPoint(s, 0, 0, 1).z);
  });

  it('시설 NPC 시그니처 소품: spec.npc 로 단다 · 일반 주민(RESIDENTS · MIGRANTS)은 생김새가 같아도 없음', () => {
    const peng = FACILITY_NPCS.find((n) => n.id === 'npc_peng')!;
    expect(signatureOf({ ...peng.spec!, npc: 'npc_peng' })).toBe('goggles');
    // 스튜디오처럼 NPC spec 을 통째로 복사해 와도 알아본다
    expect(signatureOf({ ...peng.spec! })).toBe('goggles');
    const sheep = FACILITY_NPCS.find((n) => n.id === 'npc_sheep')!;
    expect(signatureOf({ ...sheep.alt! })).toBe('yarn');
    // 일반 주민: 원본 그대로 · 주민 런타임이 옷을 돌린 뒤 · npc 칸을 비운 채(빈 문자열 포함) 모두 없음
    for (const r of [...RESIDENTS, ...MIGRANTS]) {
      if (r.model) continue;
      expect(signatureOf(r.spec), r.id).toBeNull();
      expect(signatureOf({ ...r.spec, outfit: 'stripe', outfitColor: r.accent, acc2: r.spec.acc2 ?? 'glasses' }), r.id).toBeNull();
    }
    // 흰눈 영감·낙타 상인과 종·털색이 같은 주민(눈송이 · 모래)도 소품이 없다
    for (const id of ['snowy', 'morae']) {
      const r = RESIDENTS.find((q) => q.id === id);
      if (r) expect(signatureOf(r.spec), id).toBeNull();
    }
    // 다른 NPC id · 모르는 id
    expect(signatureOf({ ...peng.spec!, npc: 'npc_camel' })).toBe('carpet');
    expect(signatureOf({ ...peng.spec!, npc: 'nobody' })).toBeNull();
    for (const n of FACILITY_NPCS) {
      if (!n.spec || n.model) continue;
      const rig = buildAnimal({ ...n.spec, npc: n.id });
      expect(allFinite(rig.root), n.id).toBe(true);
      expect(visibleStats(rig.root).drawCalls, n.id).toBeLessThanOrEqual(40);
    }
  });

  it('몽실(마을 곰)도 같은 모델 — 손 흔들기', () => {
    const v = buildVillager();
    v.update(0.5);
    v.update(1.0);
    expect(allFinite(v.root)).toBe(true);
    expect(v.root.getObjectByName('eyes')).toBeTruthy();
    expect(visibleStats(v.root).drawCalls).toBeLessThanOrEqual(40);
  });

  it('머리 무늬 텍스처: 놀이 중 생기는 주민이 끊김을 만들지 않게 빠르다(털빛이 달라 캐시가 빗나가도)', () => {
    // 개구리·개·고슴도치는 예전에 칠하기 안에서 색을 새로 만들어 0.1~0.4 초가 걸렸다
    for (const [i, k] of (['frog', 'dog', 'hedgehog', 'cat'] as const).entries()) {
      const t0 = performance.now();
      buildAnimal({ kind: k, fur: `#c0${(0x80 + i * 7).toString(16)}5e`, light: '#f6dcc0' });
      // 노드(테스트 기기)는 브라우저보다 느릴 수 있어 넉넉히 — 브라우저 실측은 종마다 ≤ 50 ms
      expect(performance.now() - t0, k).toBeLessThan(400);
    }
  });

  it('개구리는 모자 대신 꽃·잎 화관(눈 둔덕 사이에서 모자가 얼룩으로 안 읽히게)', () => {
    const plain = visibleStats(buildAnimal({ kind: 'frog', fur: '#7cc96b', light: '#e6f7c9', acc: 'none' }).root);
    const hat = visibleStats(buildAnimal({ kind: 'frog', fur: '#7cc96b', light: '#e6f7c9', acc: 'sunhat' }).root);
    expect(hat.triangles).toBeGreaterThan(plain.triangles);
    expect(hat.drawCalls).toBeLessThanOrEqual(40);
  });
});

