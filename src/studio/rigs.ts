// 스튜디오가 세우는 리그(플레이어·동물·NPC·주민·콘셉트)를 한 모양으로 감싼다.
// 고르는 법: player | animal:<kind>(특별 모델 이름도 됨) | npc:<id>(FACILITY_NPCS, 'npc_' 생략 가능) | villager:<id>(RESIDENTS·MIGRANTS, mongsil) | concept:<name>
// 리그가 스스로 내주면 쓰는 선택 훅(없으면 그 칸에 '훅 없음' 표시):
//   rig.setExpression?(e: 'neutral'|'blink'|'smile'|'happy'|'surprised'|'sad' | null)  — null = 평소(자동). animate/update 를 불러도 유지돼야 한다
//   rig.setLod?(l: 'near'|'far')   — 먼 거리 모습(≥ 25 m)
//   rig.head?: THREE.Object3D      — 얼굴 클로즈업 기준(없으면 이름이 'head' 인 자식 → 그것도 없으면 키로 짐작)
//   (rig.root.userData 에 같은 이름으로 넣어도 된다)
import * as THREE from 'three';
import { buildPlayer, PLAYER_POSES, type PlayerRig, type PoseState } from '../modules/characters/player';
import { decodeLook } from '../modules/characters/player/look';
import { buildAnimal, ANIMAL_KINDS, type AnimalKind, type AnimalSpec, type AnimalRig, type AnimalPose } from '../modules/characters/animal';
import { buildSpecial, isSpecialKind, SPECIAL_ZOO } from '../modules/characters/special';
import { buildVillager } from '../modules/characters/villager';
import { RESIDENTS, MIGRANTS, FACILITY_NPCS } from '../modules/characters/data';
import { playerPose, animalPose, rigKey, type RigRef, type Expr } from './params';

export interface StepResult {
  /** 이 리그가 그 포즈를 몰라 가만히 서 있음 */
  fallback: boolean;
  /** 표정을 줬는데 리그에 setExpression 이 없음 */
  noExpr: boolean;
}

export interface StudioRig {
  key: string;
  name: string;
  family: 'player' | 'animal';
  root: THREE.Object3D;
  /** t 에서 포즈를 잡는다(dt 는 이차 움직임 적분용) */
  step: (t: number, dt: number, pose: string, expr: Expr | null) => StepResult;
  head: () => THREE.Object3D | null;
  /** 먼 LOD 로 바꾼다 — 지원하지 않으면 false */
  setLod: (l: 'near' | 'far') => boolean;
  hasLod: boolean;
  dispose: () => void;
}

type Hooks = {
  setExpression?: (e: Expr | null) => void;
  setLod?: (l: 'near' | 'far') => void;
  head?: THREE.Object3D;
};
function hooksOf(rig: object, root: THREE.Object3D): Hooks {
  const r = rig as Hooks, u = root.userData as Hooks;
  return {
    setExpression: r.setExpression?.bind(rig) ?? u.setExpression,
    setLod: r.setLod?.bind(rig) ?? u.setLod,
    head: r.head ?? u.head,
  };
}

function findHead(root: THREE.Object3D): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => { if (!hit && o !== root && /^head$/i.test(o.name)) hit = o; });
  return hit;
}

/** 리그가 쓰는 지오메트리·재질·텍스처 버리기(공유 표시가 있으면 둔다) */
export function disposeTree(root: THREE.Object3D) {
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.userData.shared) m.geometry.dispose();
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) if (mt && !mt.userData.shared) mats.add(mt);
  });
  for (const mt of mats) {
    for (const v of Object.values(mt)) if (v instanceof THREE.Texture && !v.userData.shared) v.dispose();
    mt.dispose();
  }
}

// ───────────── 들기 소품(hold 포즈 확인용 작은 젤리 물고기) ─────────────
function holdProp(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'studio-hold-prop';
  const m = new THREE.MeshPhysicalMaterial({ color: '#7fd0ff', roughness: 0.35, clearcoat: 0.6, sheen: 0.4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), m);
  body.scale.set(1.5, 1, 0.7);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 16), m);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.24;
  g.add(body, tail);
  return g;
}

// ───────────── 플레이어 꼴(animate(PoseState) + holdSlot) ─────────────
function wrapPlayerLike(key: string, name: string, rig: PlayerRig, actions: readonly string[]): StudioRig {
  const hk = hooksOf(rig, rig.root);
  const prop = holdProp();
  return {
    key, name, family: 'player', root: rig.root,
    step(t, dt, pose, expr) {
      const p = playerPose(pose, actions);
      const has = rig.holdSlot?.children.includes(prop);
      if (p.hold && !has) rig.holdSlot?.add(prop);
      if (!p.hold && has) rig.holdSlot.remove(prop);
      hk.setExpression?.(expr ?? null);
      const s: PoseState = { speed: p.speed, mode: p.mode, action: p.action, t, dt };
      rig.animate(s);
      return { fallback: p.fallback, noExpr: !!expr && expr !== 'neutral' && !hk.setExpression };
    },
    head: () => hk.head ?? findHead(rig.root),
    hasLod: !!hk.setLod,
    setLod(l) { if (!hk.setLod) return false; hk.setLod(l); return true; },
    dispose() { prop.removeFromParent(); disposeTree(rig.root); disposeTree(prop); },
  };
}

// ───────────── 동물 꼴(update(t, dt, AnimalPose)) ─────────────
type AnimalLike = { root: THREE.Object3D; update: (t: number, dt: number, p: AnimalPose) => void; setFade?: (o: number) => void };
function wrapAnimalLike(key: string, name: string, rig: AnimalLike): StudioRig {
  const hk = hooksOf(rig, rig.root);
  rig.setFade?.(1);
  // 깡충(jump)은 리그 바깥 그릇을 띄워서 — 리그가 root.position 을 직접 만져도 안 섞이게
  const box = new THREE.Group();
  box.name = `studio-${key}`;
  box.add(rig.root);
  return {
    key, name, family: 'animal', root: box,
    step(t, dt, pose, expr) {
      const p = animalPose(pose, expr);
      rig.root.position.y = p.hop;
      hk.setExpression?.(expr ?? null);
      rig.update(t, dt, { walk: p.walk, talk: p.talk, wave: p.wave, happy: p.happy, clap: p.clap });
      const exprMapped = expr === 'smile' || expr === 'happy';
      return { fallback: p.fallback, noExpr: !!expr && expr !== 'neutral' && !hk.setExpression && !exprMapped };
    },
    head: () => hk.head ?? findHead(rig.root),
    hasLod: !!hk.setLod,
    setLod(l) { if (!hk.setLod) return false; hk.setLod(l); return true; },
    dispose() { disposeTree(box); },
  };
}

/** 동물 종의 기본 모습: 게임에 실제로 사는 그 종 첫 주민의 색 → 없으면 무난한 갈색 */
export function defaultAnimalSpec(kind: AnimalKind): AnimalSpec {
  const pool: AnimalSpec[] = [
    ...RESIDENTS.filter((r) => !r.model).map((r) => r.spec),
    ...MIGRANTS.filter((r) => !r.model).map((r) => r.spec),
    ...FACILITY_NPCS.filter((n) => !n.model).flatMap((n) => [n.spec, n.alt]).filter((s): s is AnimalSpec => !!s),
  ];
  const hit = pool.find((s) => s.kind === kind);
  return hit ? { ...hit } : { kind, fur: '#f3b77e', light: '#fff1dc' };
}

/** 종 이름(라벨용) */
export const KIND_KO: Readonly<Record<string, string>> = {
  bear: '곰', cat: '고양이', rabbit: '토끼', penguin: '펭귄', polar: '북극곰', squirrel: '다람쥐', otter: '수달', camel: '낙타',
  fox: '여우', dog: '강아지', duck: '오리', turtle: '거북', beaver: '비버', pelican: '펠리컨', sheep: '양', raccoon: '너구리',
  owl: '부엉이', panda: '판다', frog: '개구리', koala: '코알라', hamster: '햄스터', alpaca: '알파카', hedgehog: '고슴도치',
  brachio: '브라키오', proto: '프로토', octopus: '문어', robot: '로봇', alien: '외계인', babydino: '아기공룡',
};

const conceptMods = import.meta.glob<{ build: () => PlayerRig }>('../modules/characters/concepts/*.ts');

/** 리그 만들기 — 모르는 이름이면 오류 */
export async function buildStudioRig(ref: RigRef): Promise<StudioRig> {
  const key = rigKey(ref);
  switch (ref.type) {
    case 'player':
      // ?look=L1.xxxxxxx(encodeLook 글자) 로 꾸민 모습을 찍는다 — 머리 모양·옷·모자 조합 점검용
      return wrapPlayerLike(key, '플레이어', buildPlayer(typeof location !== 'undefined' ? decodeLook(new URLSearchParams(location.search).get('look')) : null), PLAYER_POSES);
    case 'concept': {
      const load = conceptMods[`../modules/characters/concepts/${ref.id}.ts`];
      if (!load) throw new Error(`콘셉트 '${ref.id}' 가 없어요 (src/modules/characters/concepts/${ref.id}.ts)`);
      const mod = await load();
      if (typeof mod.build !== 'function') throw new Error(`콘셉트 '${ref.id}' 에 build() 가 없어요`);
      const acts = (mod as { PLAYER_POSES?: readonly string[] }).PLAYER_POSES ?? PLAYER_POSES;
      return wrapPlayerLike(key, `콘셉트 ${ref.id}`, mod.build(), acts);
    }
    case 'animal': {
      if (isSpecialKind(ref.id)) return wrapAnimalLike(key, KIND_KO[ref.id] ?? ref.id, buildSpecial(ref.id, SPECIAL_ZOO[ref.id]));
      if (!(ANIMAL_KINDS as readonly string[]).includes(ref.id)) throw new Error(`동물 종 '${ref.id}' 를 몰라요`);
      return wrapAnimalLike(key, KIND_KO[ref.id] ?? ref.id, buildAnimal(defaultAnimalSpec(ref.id as AnimalKind)));
    }
    case 'npc': {
      const id = ref.id.startsWith('npc_') ? ref.id : `npc_${ref.id}`;
      const n = FACILITY_NPCS.find((d) => d.id === id);
      if (!n) throw new Error(`NPC '${ref.id}' 를 몰라요`);
      if (!n.spec) return wrapVillager(key, n.name);
      const rig: AnimalRig = n.model ? buildSpecial(n.model, n.spec) : buildAnimal({ ...n.spec });
      return wrapAnimalLike(key, n.name, rig);
    }
    case 'villager': {
      if (ref.id === 'mongsil' || ref.id === 'npc_mongsil') return wrapVillager(key, '몽실');
      const d = [...RESIDENTS, ...MIGRANTS].find((r) => r.id === ref.id);
      if (!d) throw new Error(`주민 '${ref.id}' 를 몰라요`);
      const rig: AnimalRig = d.model ? buildSpecial(d.model, d.spec) : buildAnimal({ ...d.spec });
      return wrapAnimalLike(key, d.name, rig);
    }
  }
}

function wrapVillager(key: string, name: string): StudioRig {
  const v = buildVillager();
  return wrapAnimalLike(key, name, { root: v.root, update: (t) => v.update(t) });
}

/** 줄 세우기: 플레이어 + 동물 종 전부 */
export const LINEUP_KINDS: readonly string[] = ANIMAL_KINDS;
