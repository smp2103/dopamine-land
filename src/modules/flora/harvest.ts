// 채집 손맛 — 나무 흔들기(E)·베기(F)·떨어진 열매 줍기·꽃/버섯/고사리 줍기. 청크(world.ts)와 마을(flora.ts)이 나무·풀꽃을 등록하고,
// 하루 횟수는 flags.flora(logic.ts), 아이템은 econ.give(없으면 state.addItem), 소리는 이벤트를 audio 가 듣고 낸다.
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import type { Game } from '../../core/game';
import type { PhysBody } from '../../core/physics';
import { emitEvent, type KnownEvent } from '../../core/events';
import { applyCurve } from '../../core/curve';
import { ALT_PRIORITY } from '../../core/api';
import { rngFor } from '../../core/rng';
import { FRUIT_ITEMS, GATHER, CHOP, itemName, josa, type WFruit, type GatherKind } from './data';
import {
  floraFlags, pruneFlags, shakenToday, markShake, chopsLeft, markChop, pickedToday, markPick, rollShake, rollChop, vineTree,
  fruitCountOf, type FloraFlags,
} from './logic';
import { fruitGeo, fruitMatOf, dropMat, dropMatOf, FRUIT_HANG, FRUIT_R } from './fruits';
import { beehive } from './wshapes';
import { ball, paint, merge, C, ramp, sweep } from './geo';
import type { Anchor } from './shapes';
import type { FloraFx } from './fx';

export interface InstRef { mesh: THREE.InstancedMesh; i: number }
export interface FruitRef extends InstRef { local: THREE.Matrix4 }
/** 흔들고 벨 수 있는 나무 한 그루 */
export interface TreeRec {
  /** 하루 기록 키(위치) */
  key: string;
  /** 모양 종류(broad0·palm1·coco0·banana …) */
  kind: string;
  island: string;
  x: number; y: number; z: number; s: number;
  fruit?: WFruit;
  shake: boolean;
  chop: boolean;
  /** 원래 인스턴스 행렬 */
  base: THREE.Matrix4;
  ref: InstRef;
  fruits: FruitRef[];
  /** 흔들림 시작 시각·세기(-1 = 가만히) */
  wobT: number;
  wobA: number;
}
/** 땅의 작은 채집물(꽃·버섯·고사리·선인장꽃) */
export interface PickRec {
  key: string;
  kind: GatherKind;
  island: string;
  x: number; y: number; z: number;
  base: THREE.Matrix4;
  ref: InstRef;
}
interface Group<T> { x0: number; z0: number; x1: number; z1: number; list: T[] }

/** 채집 모듈들이 같이 쓰는 도구(하루·저장·주기·이벤트·망치) */
export interface FloraServices {
  game: Game;
  ctx: Ctx;
  day(): number;
  flags(): FloraFlags;
  save(): void;
  /** 가방에 넣고 실제로 넣은 수 */
  give(id: string, n: number): number;
  emit(e: KnownEvent): void;
  islandAt(x: number, z: number): string;
  hammer(): { ok: boolean; text: string };
  night(): boolean;
  toast(text: string): void;
  sfx(name: string, at?: { x: number; z: number }, pitch?: number): void;
}

export function makeServices(ctx: Ctx, game: Game): FloraServices {
  let cached: FloraFlags | null = null;
  const day = () => {
    const d = game.env?.day ?? game.econ?.day?.() ?? 0;
    return Number.isFinite(d) ? Math.floor(d) : 0;
  };
  return {
    game, ctx, day,
    flags: () => {
      // 저장을 다시 읽으면(state.flags 객체가 바뀜) 새로 꺼낸다
      if (!cached || game.state.flags.flora !== cached) cached = floraFlags(game.state.flags);
      return cached;
    },
    save: () => game.state.save(),
    give: (id, n) => {
      const econ = game.econ;
      if (econ && typeof econ.give === 'function') return econ.give(id, n, 'flora');
      game.state.addItem(id, n);
      return n;
    },
    emit: (e) => emitEvent(game.state, e),
    islandAt: (x, z) => {
      const B = ctx.island.ISLAND_BOUNDS;
      if (x > B.minX - 30 && x < B.maxX + 30 && z > B.minZ - 30 && z < B.maxZ + 30) return 'home';
      const zi = game.geo?.zoneAt?.(x, z)?.island;
      if (zi) return zi;
      return ctx.island.worldSample(x, z).island?.id ?? 'home';
    },
    hammer: () => {
      const econ = game.econ;
      const ok = econ?.isUnlocked?.('tool:hammer') ?? true;
      return { ok, text: ok ? '' : econ?.requirement?.('tool:hammer')?.text ?? '🔒 돌망치 필요' };
    },
    night: () => {
      const env = game.env;
      if (env) return env.tod === 'night';
      return ctx.tod === 'night';
    },
    toast: (t) => game.ui.toast(t),
    sfx: (name, at, pitch) => game.audio?.sfx(name, at ? { x: at.x, z: at.z, pitch } : pitch ? { pitch } : undefined),
  };
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _Y = new THREE.Vector3(0, 1, 0), _X = new THREE.Vector3(1, 0, 0), _Z = new THREE.Vector3(0, 0, 1);
export const treeKey = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;

/** 코인 주머니(떨어지는 것) */
function pouchGeo(): THREE.BufferGeometry {
  const b = ball(0.17, 3, 0.95);
  paint(b, (q) => ramp([C('#c98a2a'), C('#f2c24a'), C('#ffe9a0')], 0.4 + q.y * 2.5));
  const knot = sweep([new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0.02, 0.2, 0), new THREE.Vector3(0, 0.26, 0)], (t) => 0.06 * (1 - 0.5 * t), 8, 4);
  paint(knot, () => C('#ff8fb5'));
  return merge([b, knot]);
}

export interface Harvest {
  S: FloraServices;
  addTrees(group: string, list: TreeRec[], bounds: { x0: number; z0: number; size: number }): void;
  removeTrees(group: string): void;
  addPicks(group: string, list: PickRec[], bounds: { x0: number; z0: number; size: number }): void;
  removePicks(group: string): void;
  /** 열매 인스턴스 메시를 만들어 g 에 넣고 나무마다 FruitRef 를 단다(오늘 흔든 나무는 숨김) */
  hangFruit(g: THREE.Group, list: Array<{ rec?: TreeRec; tm: THREE.Matrix4; fruit: WFruit; key: string; anchors: Anchor[] }>): void;
  /** 오늘 주운 채집물이면 숨긴다(청크를 만들 때) */
  pickHidden(key: string): boolean;
  shake(rec: TreeRec): void;
  chop(rec: TreeRec): void;
  nearestTree(x: number, z: number, maxD?: number, want?: (r: TreeRec) => boolean): { rec: TreeRec; d: number } | null;
  trees(): TreeRec[];
  drops(): number;
  /** 하루가 바뀌면 부른다(열매·꽃 되살리기) */
  refresh(): void;
}

export function setupHarvest(S: FloraServices, fx: FloraFx): Harvest {
  const { game } = S;
  const treeGroups = new Map<string, Group<TreeRec>>();
  const pickGroups = new Map<string, Group<PickRec>>();
  let wobbling: TreeRec[] = [];

  // ── 등록 ──
  const H: Harvest = {
    S,
    addTrees(group, list, b) { treeGroups.set(group, { x0: b.x0, z0: b.z0, x1: b.x0 + b.size, z1: b.z0 + b.size, list }); },
    removeTrees(group) {
      const g = treeGroups.get(group);
      if (g) wobbling = wobbling.filter((r) => !g.list.includes(r));
      treeGroups.delete(group);
    },
    addPicks(group, list, b) { pickGroups.set(group, { x0: b.x0, z0: b.z0, x1: b.x0 + b.size, z1: b.z0 + b.size, list }); },
    removePicks(group) { pickGroups.delete(group); },
    pickHidden: (key) => pickedToday(S.flags(), key, S.day()),
    hangFruit(g, list) {
      const byF = new Map<WFruit, Array<{ m: THREE.Matrix4; rec?: TreeRec; local: THREE.Matrix4; hide: boolean }>>();
      const f = S.flags(), day = S.day();
      for (const e of list) {
        const n = Math.min(e.anchors.length, fruitCountOf(e.key));
        const hide = shakenToday(f, e.key, day);
        let arr = byF.get(e.fruit);
        if (!arr) byF.set(e.fruit, (arr = []));
        for (const an of e.anchors.slice(0, n)) {
          const local = new THREE.Matrix4().compose(
            an.p.clone().addScaledVector(an.n, 0.06).add(new THREE.Vector3(0, FRUIT_HANG[e.fruit], 0)),
            new THREE.Quaternion().setFromAxisAngle(_Y, Math.atan2(an.n.x, an.n.z)), new THREE.Vector3(1, 1, 1));
          arr.push({ m: e.tm.clone().multiply(local), rec: e.rec, local, hide });
        }
      }
      for (const [fr, arr] of byF) {
        if (!arr.length) continue;
        const mesh = new THREE.InstancedMesh(fruitGeo(fr), fruitMatOf(fr), arr.length);
        arr.forEach((e, i) => { mesh.setMatrixAt(i, e.hide ? ZERO : e.m); e.rec?.fruits.push({ mesh, i, local: e.local }); });
        mesh.castShadow = false; mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        g.add(mesh);
      }
    },
    shake, chop,
    nearestTree(x, z, maxD = 1.6, want) {
      let best: TreeRec | null = null, bd = 1e9;
      for (const g of treeGroups.values()) {
        if (x < g.x0 - 6 || x > g.x1 + 6 || z < g.z0 - 6 || z > g.z1 + 6) continue;
        for (const rec of g.list) {
          const dx = rec.x - x, dz = rec.z - z;
          if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
          if (want && !want(rec)) continue;
          const d = Math.hypot(dx, dz) - 0.3 * rec.s;
          if (d < maxD && d < bd) { bd = d; best = rec; }
        }
      }
      return best ? { rec: best, d: bd } : null;
    },
    trees: () => [...treeGroups.values()].flatMap((g) => g.list),
    drops: () => drops.length,
    refresh,
  };

  // ── 흔들림 ──
  const wobble = (rec: TreeRec, amp: number) => {
    rec.wobT = game.time; rec.wobA = amp;
    if (!wobbling.includes(rec)) wobbling.push(rec);
  };
  const rot = new THREE.Matrix4(), rz = new THREE.Matrix4(), m4 = new THREE.Matrix4();
  const showFruit = (rec: TreeRec, m: THREE.Matrix4) => {
    for (const fr of rec.fruits) { fr.mesh.setMatrixAt(fr.i, m4.copy(m).multiply(fr.local)); fr.mesh.instanceMatrix.needsUpdate = true; }
  };
  const hidden = (rec: TreeRec) => shakenToday(S.flags(), rec.key, S.day());

  // ── 떨어진 것(물리로 굴러가는 열매·벌집·코인 주머니) ──
  interface Drop { body: PhysBody; mesh: THREE.Mesh; name: string; pick: () => boolean; born: number }
  let drops: Drop[] = [];
  const dropRoot = new THREE.Group();
  dropRoot.name = 'flora-drops';
  game.root.add(dropRoot);
  const hiveGeo = beehive(); hiveGeo.userData.shared = true;
  const bagGeo = pouchGeo(); bagGeo.userData.shared = true;
  let dropSeq = 0;

  const spawnDrop = (geo: THREE.BufferGeometry, mat: THREE.Material, at: THREE.Vector3, r: number, name: string, pick: () => boolean) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.copy(at);
    applyCurve(mesh);
    dropRoot.add(mesh);
    const body = game.physics.add({ shape: { kind: 'ball', r }, position: at, mesh, restitution: 0.35, friction: 0.8, linearDamping: 0.3, angularDamping: 0.6, density: 0.8, buoyancy: 1.6, tag: 'fruit' });
    const rr = rngFor(`flora-drop:${dropSeq++}`);
    body.body.setLinvel({ x: (rr() - 0.5) * 2.4, y: 1 + rr(), z: (rr() - 0.5) * 2.4 }, true);
    drops.push({ body, mesh, name, pick, born: game.time });
    if (drops.length > 40) { const o = drops.shift()!; o.body.remove(); o.mesh.removeFromParent(); }
  };
  const fruitDrop = (f: WFruit, at: THREE.Vector3, island: string) => {
    const info = FRUIT_ITEMS[f];
    spawnDrop(fruitGeo(f), dropMatOf(f), at, FRUIT_R[f], info.name, () => {
      const n = S.give(info.id, 1);
      if (n <= 0) return false;
      S.emit({ type: 'harvest', kind: 'fruit', item: info.id, n, island });
      S.toast(`${josa(info.name, '을를')} 주웠다! ${f === 'starapple' ? '⭐' : '🍎'}`);
      return true;
    });
  };

  // ── 흔들기 ──
  function shake(rec: TreeRec) {
    const day = S.day(), f = S.flags();
    wobble(rec, 0.07);
    game.player.act('shake', 0.7);
    S.emit({ type: 'tree-shake', x: rec.x, z: rec.z, tree: rec.kind, island: rec.island });
    if (shakenToday(f, rec.key, day)) { S.toast('사락사락… 오늘은 더 떨어질 게 없어요. 내일 또 흔들어 봐요!'); return; }
    markShake(f, rec.key, day);
    S.save();
    const top = new THREE.Vector3(rec.x, rec.y + 2.4 * rec.s, rec.z);
    const toward = game.player.pos.clone().sub(top).setY(0).normalize().multiplyScalar(0.9);
    const res = rollShake(rngFor(`flora-shake:${rec.key}:${day}`), rec.fruit ? rec.fruits.length : 0);
    const said: string[] = [];
    if (rec.fruit && res.fruits > 0) {
      const fr = rec.fruit;
      const m = new THREE.Matrix4();
      rec.fruits.forEach((r) => {
        r.mesh.getMatrixAt(r.i, m);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        r.mesh.setMatrixAt(r.i, ZERO);
        r.mesh.instanceMatrix.needsUpdate = true;
        if (p.lengthSq() > 0) fruitDrop(fr, p.add(toward.clone().multiplyScalar(0.3)), rec.island);
      });
      S.sfx('fruit-drop', rec);
      const info = FRUIT_ITEMS[fr];
      said.push(`${info.name} ${rec.fruits.length}개가 톡톡 떨어졌다!`);
    }
    // 아이템 harvest 는 주울 때만 낸다(흔들기 자체는 tree-shake 로 이미 알림 — 두 번 세지 않게).
    if (res.bonus === 'coins') {
      const n = res.coins;
      spawnDrop(bagGeo, dropMat, top.clone().add(toward), 0.17, `코인 주머니(${n})`, () => {
        game.state.addCoins(n, 'tree');
        S.toast(`코인 주머니 짤랑! +${n.toLocaleString()} 코인 💰`);
        return true;
      });
      said.push('어? 코인 주머니가 떨어졌다! 💰');
    } else if (res.bonus === 'hive') {
      const at = top.clone().add(toward);
      spawnDrop(hiveGeo, dropMat, at, 0.25, '벌집', () => {
        const n = S.give('m_honey', 1);
        if (n <= 0) return false;
        S.emit({ type: 'harvest', kind: 'honey', item: 'm_honey', n, island: rec.island });
        S.toast(`${josa(itemName('m_honey'), '을를')} 얻었다! 🍯`);
        return true;
      });
      S.emit({ type: 'beehive', x: at.x, z: at.z });
      said.push('벌집이 떨어졌다! 앗, 벌들이 화났다! 🐝');
    } else if (res.bonus === 'furniture') {
      game.state.addCoins(res.coins, 'tree-furniture');
      said.push(`작은 의자가 떨어졌… 아직 놓을 곳이 없어 ${res.coins} 코인으로 바꿨어요 🪑`);
    }
    S.toast(said.length ? said.join(' ') : '사락사락… 나뭇잎만 흔들렸다 🍃');
  }

  // ── 베기 ──
  function chop(rec: TreeRec) {
    const hm = S.hammer();
    if (!hm.ok) { S.toast(`돌망치가 있어야 나무를 벨 수 있어요 ${hm.text}`); return; }
    const day = S.day(), f = S.flags();
    game.player.act('chop', 0.6);
    wobble(rec, 0.11);
    const nth = markChop(f, rec.key, day);
    if (!nth) { S.toast('이 나무는 오늘 충분히 베었어요 — 내일 다시 자라요 🌱'); return; }
    S.save();
    const r = rngFor(`flora-chop:${rec.key}:${day}:${nth}`);
    const got: string[] = [];
    for (const d of rollChop(r, { vine: vineTree(rec.kind, rec.island), nth })) {
      const n = S.give(d.id, d.n);
      if (n <= 0) continue;
      S.emit({ type: 'harvest', kind: d.id === 'm_vine' ? 'vine' : 'chop', item: d.id, n, island: rec.island });
      got.push(`${itemName(d.id)} +${n}`);
    }
    const at = new THREE.Vector3(rec.x, rec.y + 0.8, rec.z).lerp(game.player.pos.clone().setY(rec.y + 0.8), 0.25);
    fx.puff(at, '#d9a874', 7, { speed: 1.8, up: 2.2, size: 0.8, life: 0.6 });
    const left = CHOP.perDay - nth;
    S.toast(got.length ? `쿵! ${got.join(' · ')}${left ? ` (오늘 ${left}번 더)` : ' (오늘은 끝!)'}` : '쿵! …가방이 꽉 찼어요');
  }

  // ── 하루가 바뀌면: 열매·꽃 되살리기 ──
  function refresh() {
    const f = S.flags(), day = S.day();
    for (const g of treeGroups.values()) for (const rec of g.list) {
      if (!rec.fruits.length) continue;
      if (shakenToday(f, rec.key, day)) continue;
      showFruit(rec, rec.base);
    }
    for (const g of pickGroups.values()) for (const p of g.list) {
      p.ref.mesh.setMatrixAt(p.ref.i, pickedToday(f, p.key, day) ? ZERO : p.base);
      p.ref.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ── 상호작용 ──
  game.addProvider('flora-shake', (p) => {
    const hit = H.nearestTree(p.pos.x, p.pos.z, 1.6, (r) => r.shake);
    if (!hit) return null;
    const rec = hit.rec;
    const fruity = rec.fruit && rec.fruits.length && !hidden(rec);
    return { label: fruity ? `나무 흔들기 (${FRUIT_ITEMS[rec.fruit!].name})` : '나무 흔들기', dist: hit.d + 0.5, use: () => shake(rec) };
  });
  game.addProvider('flora-chop', (p) => {
    const hit = H.nearestTree(p.pos.x, p.pos.z, 1.6, (r) => r.chop);
    if (!hit) return null;
    const rec = hit.rec;
    const hm = S.hammer();
    const left = chopsLeft(S.flags(), rec.key, S.day());
    const label = !hm.ok ? `나무 베기 (${hm.text})` : left > 0 ? '나무 베기' : '나무 베기 (오늘은 끝)';
    return { label, dist: hit.d + 0.5, key: 'KeyF', priority: ALT_PRIORITY.chop, use: () => chop(rec) };
  });
  game.addProvider('flora-pick', (p) => {
    let best: Drop | null = null, bd = 1e9;
    for (const d of drops) {
      const t = d.body.body.translation();
      const dd = Math.hypot(t.x - p.pos.x, t.z - p.pos.z);
      if (dd < 1.6 && Math.abs(t.y - p.pos.y) < 2 && dd < bd) { bd = dd; best = d; }
    }
    if (!best) return null;
    const d = best;
    return {
      label: `${d.name} 줍기`, dist: bd, use: () => {
        game.player.act('pick', 0.4);
        if (!d.pick()) return;
        d.body.remove(); d.mesh.removeFromParent();
        drops = drops.filter((x) => x !== d);
      },
    };
  });
  // 꽃·버섯·고사리
  const nearestPick = (x: number, z: number, maxD: number) => {
    const f = S.flags(), day = S.day();
    let best: PickRec | null = null, bd = maxD;
    for (const g of pickGroups.values()) {
      if (x < g.x0 - 2 || x > g.x1 + 2 || z < g.z0 - 2 || z > g.z1 + 2) continue;
      for (const pk of g.list) {
        const dx = pk.x - x, dz = pk.z - z;
        if (Math.abs(dx) > maxD || Math.abs(dz) > maxD) continue;
        const d = Math.hypot(dx, dz);
        if (d < bd && !pickedToday(f, pk.key, day)) { bd = d; best = pk; }
      }
    }
    return best ? { pk: best, d: bd } : null;
  };
  const gatherInfo = (k: GatherKind) => {
    const G = GATHER[k];
    return G.night && S.night() ? { label: '발광 버섯 따기', item: G.night.item, harvest: G.night.harvest } : { label: G.label, item: G.item, harvest: G.harvest };
  };
  const gather = (pk: PickRec) => {
    const day = S.day(), f = S.flags();
    if (pickedToday(f, pk.key, day)) return false;
    const gi = gatherInfo(pk.kind);
    game.player.act('pick', 0.4);
    const n = S.give(gi.item, 1);
    if (n <= 0) return false;
    markPick(f, pk.key, day);
    S.save();
    pk.ref.mesh.setMatrixAt(pk.ref.i, ZERO);
    pk.ref.mesh.instanceMatrix.needsUpdate = true;
    S.emit({ type: 'harvest', kind: gi.harvest, item: gi.item, n, island: pk.island });
    fx.puff(new THREE.Vector3(pk.x, pk.y + 0.25, pk.z), pk.kind === 'flower' ? '#ffc9dc' : pk.kind === 'fern' ? '#9ade6e' : pk.kind === 'cactus' ? '#ffb8e8' : '#fff3c8', 5, { speed: 0.9, up: 1.6, size: 0.6, life: 0.5, grav: -3 });
    S.toast(`${itemName(gi.item)} +${n}`);
    return true;
  };
  game.addProvider('flora-gather', (p) => {
    const hit = nearestPick(p.pos.x, p.pos.z, 1.25);
    if (!hit) return null;
    const pk = hit.pk;
    return { label: gatherInfo(pk.kind).label, dist: hit.d + 0.35, use: () => { gather(pk); } };
  });
  (H as Harvest & { gatherNearest?: () => unknown }).gatherNearest = () => {
    const hit = nearestPick(game.player.pos.x, game.player.pos.z, 4);
    return hit ? { key: hit.pk.key, kind: hit.pk.kind, ok: gather(hit.pk) } : null;
  };

  // ── 매 프레임: 흔들림·하루 바뀜 ──
  let lastDay = S.day();
  let dropTick = 0;
  {
    const f = S.flags();
    if (f.day !== lastDay) { pruneFlags(f, lastDay); }
  }
  game.onUpdate(() => {
    const d = S.day();
    if (d !== lastDay) {
      lastDay = d;
      pruneFlags(S.flags(), d);
      S.save();
      refresh();
    }
    // 잃어버린 낙하물 정리: 지형 밖으로 떨어졌거나 너무 멀거나 너무 오래됐으면 치운다(조용히 사라지지 않게 가까우면 자동으로 줍기)
    if (drops.length && (dropTick += 1) % 30 === 0) {
      const pp = game.player.pos;
      drops = drops.filter((d) => {
        const p = d.mesh.position;
        const lost = p.y < S.ctx.island.heightAt(p.x, p.z) - 8 || game.time - d.born > 300;
        const far = Math.hypot(p.x - pp.x, p.z - pp.z) > 150;
        if (!lost && !far) return true;
        if (lost && !far && game.time - d.born <= 300) d.pick();
        d.body.remove(); d.mesh.removeFromParent();
        return false;
      });
    }
    if (!wobbling.length) return;
    const t = game.time;
    wobbling = wobbling.filter((rec) => {
      const e = t - rec.wobT;
      const done = e > 1.1;
      const ang = done ? 0 : Math.sin(e * 28) * rec.wobA * Math.exp(-e * 3.2);
      rot.makeRotationAxis(_X, ang).premultiply(rz.makeRotationAxis(_Z, ang * 0.6));
      const m = m4.copy(rec.base).multiply(rot);
      rec.ref.mesh.setMatrixAt(rec.ref.i, m);
      rec.ref.mesh.instanceMatrix.needsUpdate = true;
      if (rec.fruits.length && !hidden(rec)) {
        const mm = m.clone();
        showFruit(rec, mm);
      }
      return !done;
    });
  });
  game.onWorld((w) => { dropRoot.visible = w === 'earth'; });
  return H;
}
