// 두드릴 돌(GDD 3.4 P0-3) — 섬마다 5개(섬 시드로 고정), 돌망치로 E. 하루 8번, 0.9초 박자 콤보면 철광석·금광석이 잘 나온다.
// 청크 하나에 돌 InstancedMesh 하나(공유 지오메트리) + 'rock' 정적 충돌체. 8번째에 와르르 → 다음 날 다시 생긴다.
import * as THREE from 'three';
import type { PhysBody } from '../../core/physics';
import { rngFor } from '../../core/rng';
import { ROCK, itemName } from './data';
import { allRockSpots, hitsLeft, markHit, breakToday, comboNext, rollRock, type RockSpot, type Circle } from './logic';
import { floraMat } from './mat';
import { tapRock } from './wshapes2';
import type { FloraServices } from './harvest';
import type { FloraFx } from './fx';

/** 섬별 돌 색조(인스턴스 색 — 돌 몸만 받는다) */
const ROCK_TINT: Record<string, string> = {
  home: '#ffffff', dino: '#f0c0b0', ice: '#dcecff', mushroom: '#dcebd6', coral: '#fff0e2', desert: '#ffdcae', launch: '#ddd2ff',
};
/** 결과별 반짝 가루 색 */
const ITEM_SPARK: Record<string, string> = {
  m_stone: '#d6d2de', m_clay: '#e9b48f', m_iron: '#b9c3d6', m_gold: '#ffe066', m_volcanic: '#ff8a70', m_icecrystal: '#bfefff',
  m_sandglass: '#ffd08a', m_meteor: '#c9a8ff', m_shell: '#ffe3d1', m_spore: '#ffc1c1',
};

export interface RockInfo { key: string; id: string; island: string; x: number; z: number; hits: number; left: number; broken: boolean }
export interface HitResult { ok: boolean; key?: string; item?: string; n?: number; combo?: number; left?: number; broken?: boolean; why?: string }
export interface Rocks {
  rocks(): RockInfo[];
  hit(key: string): HitResult;
  hitNearest(maxD?: number): HitResult | null;
  breakRock(key: string): boolean;
  refresh(): void;
}

interface Live { spot: RockSpot; mesh: THREE.InstancedMesh; i: number; base: THREE.Matrix4; body: PhysBody | null; wobT: number }

const rockMat = floraMat('w-rock', { sway: 0, swayH: 1, rough: 0.78, sheen: 0.25, sheenColor: '#ffffff' });
let rockGeo: THREE.BufferGeometry | null = null;
const geo = () => {
  if (!rockGeo) { rockGeo = tapRock(9301); rockGeo.userData.shared = true; rockGeo.computeBoundingSphere(); }
  return rockGeo;
};

export function setupRocks(S: FloraServices, fx: FloraFx, keepOut: readonly Circle[]): Rocks {
  const { game, ctx } = S;
  const spots = allRockSpots(ctx.island, keepOut);
  const byKey = new Map(spots.map((s) => [s.key, s]));
  const live = new Map<string, Live>();
  let wob: Live[] = [];
  let last = { key: '', t: -9, combo: 0 };

  const used = (key: string) => ROCK.hitsPerDay - hitsLeft(S.flags(), key, S.day());
  const broken = (key: string) => hitsLeft(S.flags(), key, S.day()) <= 0;

  const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
  const matrixOf = (s: RockSpot, out: THREE.Matrix4, squash = 1, shrink = 1) => {
    _q.setFromAxisAngle(_Y, s.rot);
    _p.set(s.x, s.y - 0.12 * s.s, s.z);
    _s.set(s.s * shrink, s.s * shrink * squash, s.s * shrink);
    return out.compose(_p, _q, _s);
  };
  const colliderFor = (s: RockSpot) => game.physics.addStatic({ kind: 'cylinder', halfH: 0.42 * s.s, r: 0.62 * s.s }, { x: s.x, y: s.y + 0.3 * s.s, z: s.z }, undefined, 'rock');
  /** 부서진 돌은 작은 조약돌로 남는다(충돌체 없음) */
  const pebble = (L: Live) => {
    L.mesh.setMatrixAt(L.i, matrixOf(L.spot, new THREE.Matrix4(), 0.55, 0.38));
    L.mesh.instanceMatrix.needsUpdate = true;
    L.body?.remove();
    L.body = null;
  };
  const whole = (L: Live) => {
    L.mesh.setMatrixAt(L.i, L.base);
    L.mesh.instanceMatrix.needsUpdate = true;
    if (!L.body) L.body = colliderFor(L.spot);
  };

  game.chunks.add({
    key: 'flora-rocks', size: 256, radius: 380,
    build: ({ cx, cz, x0, z0, size }) => {
      const its = spots.filter((s) => s.x >= x0 && s.x < x0 + size && s.z >= z0 && s.z < z0 + size);
      if (!its.length) return null;
      const g = new THREE.Group();
      const mesh = new THREE.InstancedMesh(geo(), rockMat, its.length);
      const m4 = new THREE.Matrix4();
      its.forEach((s, i) => {
        mesh.setMatrixAt(i, matrixOf(s, m4));
        mesh.setColorAt(i, new THREE.Color(ROCK_TINT[s.island] ?? '#ffffff'));
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
      const keys: string[] = [];
      its.forEach((s, i) => {
        const L: Live = { spot: s, mesh, i, base: matrixOf(s, new THREE.Matrix4()), body: null, wobT: -1 };
        live.set(s.key, L);
        keys.push(s.key);
        if (broken(s.key)) pebble(L); else whole(L);
      });
      mesh.computeBoundingSphere();
      g.userData.rockKeys = keys;
      g.name = `flora-rocks:${cx},${cz}`;
      return g;
    },
    dispose: (o) => {
      for (const k of (o.userData.rockKeys as string[] | undefined) ?? []) {
        const L = live.get(k);
        L?.body?.remove();
        wob = wob.filter((w) => w !== L);
        live.delete(k);
      }
    },
  });

  const info = (s: RockSpot): RockInfo => {
    const u = used(s.key);
    return { key: s.key, id: s.key, island: s.island, x: s.x, z: s.z, hits: u, left: ROCK.hitsPerDay - u, broken: u >= ROCK.hitsPerDay };
  };
  const top = (s: RockSpot) => new THREE.Vector3(s.x, s.y + 0.75 * s.s, s.z);
  const crumble = (s: RockSpot) => {
    const L = live.get(s.key);
    fx.puff(top(s).add(new THREE.Vector3(0, -0.3, 0)), '#d8d2e0', 18, { speed: 2.8, up: 3.2, size: 1.4, life: 0.9 });
    fx.puff(top(s), '#fff6c8', 8, { speed: 1.6, up: 4, size: 0.7, life: 0.7, grav: -4 });
    if (L) pebble(L);
    S.sfx('rock-break', s);
  };

  function hit(key: string): HitResult {
    const s = byKey.get(key);
    if (!s) return { ok: false, why: 'no-rock' };
    const hm = S.hammer();
    if (!hm.ok) { S.toast(`돌망치가 있어야 두드릴 수 있어요 ${hm.text}`); return { ok: false, key, why: 'hammer' }; }
    const day = S.day(), f = S.flags();
    const nth = markHit(f, key, day);
    if (!nth) { S.toast('이 돌은 오늘 다 두드렸어요 — 내일 다시 생겨요 🪨'); return { ok: false, key, why: 'done', broken: true }; }
    const t = game.time;
    const combo = last.key === key ? comboNext(last.t, t, last.combo) : 0;
    last = { key, t, combo };
    const item = rollRock(rngFor(`flora-rock:${key}:${day}:${nth}`), s.island, combo);
    const n = S.give(item, 1);
    S.save();
    game.player.act('hit', 0.45);
    S.emit({ type: 'rock-hit', x: s.x, z: s.z, rock: key, combo, island: s.island });
    if (n > 0) S.emit({ type: 'harvest', kind: 'rock', item, n, island: s.island, combo });
    const L = live.get(key);
    if (L) { L.wobT = t; if (!wob.includes(L)) wob.push(L); }
    const rare = item === 'm_gold' || item === 'm_iron';
    fx.puff(top(s), ITEM_SPARK[item] ?? '#e6e0ee', rare ? 10 : 6, { speed: 1.9, up: 2.6, size: rare ? 1.0 : 0.75, life: 0.6 });
    const left = ROCK.hitsPerDay - nth;
    const brokeNow = left <= 0;
    if (brokeNow) crumble(s);
    const name = itemName(item);
    const cm = combo > 0 ? ` · 콤보 ${combo + 1}!` : '';
    S.toast(n > 0
      ? `${item === 'm_gold' ? '반짝! ' : ''}${name} +${n}${cm}${brokeNow ? ' — 와르르! 돌이 부서졌어요' : ` (${left}번 남음)`}`
      : `딱! …가방이 꽉 찼어요${cm}`);
    return { ok: true, key, item, n, combo, left, broken: brokeNow };
  }

  // E 두드리기(돌망치)
  game.addProvider('flora-rock', (p) => {
    let best: RockSpot | null = null, bd = 1e9;
    for (const s of spots) {
      const dx = s.x - p.pos.x, dz = s.z - p.pos.z;
      if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const d = Math.hypot(dx, dz) - 0.55 * s.s;
      if (d < 1.5 && d < bd) { bd = d; best = s; }
    }
    if (!best || broken(best.key)) return null;
    const s = best;
    const hm = S.hammer();
    const left = hitsLeft(S.flags(), s.key, S.day());
    return { label: hm.ok ? `돌 두드리기 (${left}/${ROCK.hitsPerDay})` : `돌 두드리기 (${hm.text})`, dist: Math.max(0, bd) + 0.3, use: () => { hit(s.key); } };
  });

  // 흔들림(맞은 돌이 말랑 움찔)
  const m4 = new THREE.Matrix4();
  let lastDay = S.day();
  game.onUpdate(() => {
    // 새 날: 부서진 돌이 다시 생긴다(기록 정리는 harvest 몫)
    const d = S.day();
    if (d !== lastDay) { lastDay = d; for (const L of live.values()) if (broken(L.spot.key)) pebble(L); else whole(L); }
    if (!wob.length) return;
    const t = game.time;
    wob = wob.filter((L) => {
      const e = t - L.wobT;
      if (broken(L.spot.key)) return false;
      const done = e > 0.35;
      const k = done ? 0 : Math.sin(e * 40) * Math.exp(-e * 9);
      L.mesh.setMatrixAt(L.i, matrixOf(L.spot, m4, 1 - 0.12 * k, 1 + 0.05 * k));
      L.mesh.instanceMatrix.needsUpdate = true;
      return !done;
    });
  });

  return {
    rocks: () => spots.map(info),
    hit,
    hitNearest(maxD = 6) {
      const p = game.player.pos;
      let best: RockSpot | null = null, bd = maxD;
      for (const s of spots) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = s; } }
      return best ? hit(best.key) : null;
    },
    breakRock(key) {
      const s = byKey.get(key);
      if (!s) return false;
      if (!breakToday(S.flags(), key, S.day())) return false;
      S.save();
      crumble(s);
      return true;
    },
    refresh() {
      for (const L of live.values()) if (broken(L.spot.key)) pebble(L); else whole(L);
    },
  };
}
