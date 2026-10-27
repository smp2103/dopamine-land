// 행성 낚시(구름바다 cloudsea · 젤리 바다 jellysea · 블랙홀 blackhole): 물가에서 E 던지기 → 찌가 둥실 → 입질(찌가 쏙!) 때 E 당기기.
// 물고기는 fishing 이 등록한 종(where island/zone)에서 지금 시각에 맞는 것만 골라 econ.rollCatch(activity 'moonfish')로 굴린다.
// 너무 일찍 당기거나 늦으면 놓친다(econ.catchFail). 움직이면 찌를 거둔다. 낚싯대(tool:rod)가 있어야 한다.
import * as THREE from 'three';
import type { Game, Interaction } from '../../core/game';
import type { Species } from '../../core/state';
import { FISH_ZONES, fishZoneAt, fishSurfaceY, biteDelay, BITE_WINDOW, zonePool, type PlanetId } from './logic';
import { spaceFish } from './models';
import { GEO, toyMat } from './kit';

type Phase = 'idle' | 'wait' | 'bite';
export interface PlanetFishing {
  provider(): Interaction | null;
  update(t: number, dt: number): void;
  cancel(why?: string): void;
  /** 디버그: 지금 바로 입질 */
  biteNow(): boolean;
  phase(): Phase;
  /** 던질 수 있는 물 자리(월드, 없으면 null) */
  spotAhead(): THREE.Vector3 | null;
}

export interface FishDeps {
  game: Game;
  /** 지금 활성 행성(이 모듈 것) */
  current(): { id: PlanetId; O: THREE.Vector3; root: THREE.Object3D } | null;
  rng(key: string): () => number;
  hour(): number;
  meteor(): boolean;
  /** 일식인가(moon:'eclipse' 물고기) */
  eclipse(): boolean;
  unlocked(key: string): boolean;
  toast(text: string): void;
  /** 잡은 물고기 보이기·보고 */
  landFish(sp: Species, model: THREE.Object3D): void;
}

let bobberGeo: THREE.BufferGeometry | null = null;
function makeBobber(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'planets-bobber';
  bobberGeo ??= GEO.sph;
  const top = new THREE.Mesh(bobberGeo, toyMat('#ff6b6b', { rough: 0.35, glow: 0.2 }));
  top.scale.set(0.16, 0.12, 0.16); top.position.y = 0.06;
  const bot = new THREE.Mesh(bobberGeo, toyMat('#fffaf2', { rough: 0.35 }));
  bot.scale.set(0.16, 0.1, 0.16); bot.position.y = -0.03;
  const ring = new THREE.Mesh(GEO.tor, toyMat('#fffaf2', { alpha: 0.6, glow: 0.4 }));
  ring.rotation.x = Math.PI / 2; ring.scale.setScalar(0.3); ring.position.y = -0.05;
  ring.name = 'ripple';
  g.add(top, bot, ring);
  return g;
}

export function makePlanetFishing(d: FishDeps): PlanetFishing {
  const { game } = d;
  let phase: Phase = 'idle';
  let castAt = new THREE.Vector3();
  let spot = new THREE.Vector3();
  let biteAt = 0, count = 0;
  let bobber: THREE.Group | null = null;
  let line: THREE.Line | null = null;
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  lineGeo.userData.shared = true;
  const lineMat = new THREE.LineBasicMaterial({ color: '#fffaf2', transparent: true, opacity: 0.8 });

  const spotAhead = (): THREE.Vector3 | null => {
    const cur = d.current();
    if (!cur || !FISH_ZONES[cur.id]) return null;
    const pl = game.player, f = pl.facing();
    for (const k of [4.5, 6, 3.2]) {
      const x = pl.pos.x + f.x * k - cur.O.x, z = pl.pos.z + f.z * k - cur.O.z;
      if (fishZoneAt(cur.id, x, z)) return new THREE.Vector3(cur.O.x + x, cur.O.y + fishSurfaceY(cur.id, x, z), cur.O.z + z);
    }
    return null;
  };

  function clear() {
    bobber?.removeFromParent();
    line?.removeFromParent();
    bobber = null;
    line = null;
    if (game.player.action === 'fish' || game.player.action === 'cast') game.player.act?.(null);
    phase = 'idle';
  }
  function cancel(why?: string) {
    if (phase === 'idle') return;
    clear();
    if (why) d.toast(why);
  }
  function cast() {
    const cur = d.current();
    if (!cur) return;
    if (!d.unlocked('tool:rod')) { d.toast('낚싯대가 있어야 해요! 🎣'); return; }
    const s = spotAhead();
    if (!s) return;
    spot = s;
    castAt = game.player.pos.clone();
    count++;
    const r = d.rng(`planets:fish:${cur.id}:${game.time.toFixed(2)}:${count}`);
    biteAt = game.time + biteDelay(r());
    bobber = makeBobber();
    bobber.position.copy(spot);
    cur.root.add(bobber);
    line = new THREE.Line(lineGeo, lineMat);
    line.frustumCulled = false;
    line.name = 'planets-fishline';
    cur.root.add(line);
    game.player.act?.('cast', 0.6);
    game.audio?.sfx?.('cast', { x: spot.x, z: spot.z });
    phase = 'wait';
  }
  function reel() {
    const cur = d.current();
    if (!cur || phase !== 'bite') { cancel('너무 빨랐어요! 물고기가 도망갔어요 💦'); game.econ?.catchFail?.('moonfish'); return; }
    const z = FISH_ZONES[cur.id]!;
    const all = [...game.state.species.values()];
    const pool = zonePool(all as Array<Species & { where?: Array<{ island?: string; zone?: string; time?: string | string[]; weather?: { only?: string[] }; moon?: string }> }>, z.island, z.zone, d.hour(), d.meteor(), d.eclipse());
    clear();
    if (!pool.length) { d.toast(`${z.name}엔 지금 아무도 안 물어요… 다른 시간에 와 봐요`); return; }
    let sp: Species = pool[0];
    let res: ReturnType<NonNullable<Game['econ']>['rollCatch']> | null = null;
    try {
      // 자리·시간은 여기서 이미 골랐다 → where 는 떼고 굴린다(우주 날씨는 늘 맑음이라 economy 가 거르지 않게)
      res = game.econ?.rollCatch?.({ activity: 'moonfish', pool: pool.map((s) => ({ ...s, where: undefined })) }) ?? null;
    } catch (e) { console.error('[planets rollCatch]', e); }
    if (res?.species) sp = game.state.byGdd(res.species.id) ?? (res.species as Species);
    else {
      // economy 가 없으면 희귀도 가중치로 직접
      const W: Record<number, number> = { 1: 55, 2: 27, 3: 12, 4: 5, 5: 1 };
      const r = d.rng(`planets:fishpick:${count}`);
      let x = r() * pool.reduce((a, s) => a + (W[s.rarity] ?? 1), 0);
      for (const s of pool) { x -= W[s.rarity] ?? 1; if (x <= 0) { sp = s; break; } }
    }
    game.player.act?.('reel', 0.8);
    d.landFish(sp, spaceFish(sp.id));
    if (res?.species) { try { game.econ?.reportCatch?.(res); } catch (e) { console.error('[planets reportCatch]', e); } }
  }

  const provider = (): Interaction | null => {
    if (game.world !== 'space' || game.player.mounted) return null;
    const cur = d.current();
    if (!cur) return null;
    const z = FISH_ZONES[cur.id];
    if (!z) return null;
    if (phase === 'wait') return { id: 'planets:fish:wait', label: '찌를 보는 중… 🎣 (E 거두기)', dist: 0.05, use: () => cancel('찌를 거뒀어요') };
    if (phase === 'bite') return { id: 'planets:fish:reel', label: '지금! 당기기 🎣❗', dist: 0.01, use: reel };
    if (!spotAhead()) return null;
    return { id: 'planets:fish:cast', label: `${z.name} 낚시하기 🎣`, dist: 0.9, use: cast };
  };

  const update = (t: number) => {
    if (phase === 'idle') return;
    const cur = d.current();
    if (!cur || game.world !== 'space') { clear(); return; }
    const pl = game.player;
    if (Math.hypot(pl.pos.x - castAt.x, pl.pos.z - castAt.z) > 1.5) { cancel('움직여서 찌를 거뒀어요'); return; }
    if (phase === 'wait' && pl.action !== 'fish' && pl.action !== 'cast') pl.act?.('fish', 0);
    if (phase === 'wait' && game.time >= biteAt) {
      phase = 'bite';
      biteAt = game.time + BITE_WINDOW;
      game.audio?.sfx?.('splash', { x: spot.x, z: spot.z, vol: 0.6 });
    } else if (phase === 'bite' && game.time >= biteAt) {
      cancel('놓쳤어요… 다시 던져 봐요 💦');
      game.econ?.catchFail?.('moonfish');
      return;
    }
    if (bobber) {
      const dip = phase === 'bite' ? -0.18 + Math.sin(t * 30) * 0.06 : Math.sin(t * 2.4) * 0.05;
      bobber.position.set(spot.x, spot.y + dip, spot.z);
      const rp = bobber.getObjectByName('ripple');
      if (rp) rp.scale.setScalar(0.3 + ((t * (phase === 'bite' ? 2 : 0.6)) % 1) * 0.5);
    }
    if (line) {
      const p = lineGeo.attributes.position as THREE.BufferAttribute;
      const f = pl.facing();
      p.setXYZ(0, pl.pos.x + f.x * 0.6, pl.pos.y + 1.6, pl.pos.z + f.z * 0.6);
      p.setXYZ(1, spot.x, (bobber?.position.y ?? spot.y) + 0.08, spot.z);
      p.needsUpdate = true;
    }
  };

  return {
    provider, update, cancel: (w) => cancel(w), phase: () => phase, spotAhead,
    biteNow: () => {
      if (phase === 'idle') cast();
      if (phase === 'idle') return false;
      phase = 'bite';
      biteAt = game.time + BITE_WINDOW;
      return true;
    },
  };
}
