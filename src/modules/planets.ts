// 행성 P1(GDD 3.9 P1 · 6.4): game.space.registerPlanet 으로 일곱 행성을 단다 — 슈가링(사탕 고리 서핑) · 젤리별(트램펄린, 젤리곰 6색) ·
// 서리볼(마찰 0.05 미끄럼) · 솜사탕 성운(둥둥 구름 군도, 구름바다 낚시, 하늘고래) · 자갈띠(소행성 사이 폴짝, 운석 캐기) ·
// 별다방(정거장 허브, 꾸물이 상점 자리) · 까만 도넛(일식 때만, 출렁 가변 중력, 블랙홀개복치·꼬마별).
// 각 행성은 SPACE_ORIGIN + (순번 × 3000, 0, 0) 에 따로 앉고 자기 높이·중력·청크 땅·소품·생물이 있다. 활성 행성만 짓는다(space 규칙).
// 여행: 별길 정류장(달 착륙장 옆 + 행성마다) E → '행성 여행' 패널. 앞 행성을 다녀와야 다음 행성이 열리고 처음 갈 땐 별(★)을 낸다(econ.spend).
// 처음 도착하면 econ.unlock('space:planet:<id>'). 토끼달 별공룡 둥지에선 별사과로 별공룡과 친해진다(befriend, kind 'dino').
//
// game.ext.planets — 주인은 이 모듈 하나:
//   list()                 [{id, name, icon, color, cost, gravity, visited, paid, ok, why, text}] (여행 순서)
//   check(id)              {ok, cost, why?, need?} — 해금 사슬 + 별 + 일식
//   travel(id)             규칙대로 가기(별 내기 포함). 성공하면 true
//   visited(id) · current() · eclipse()
//   stationShop            {pos: Vector3|null, claimed: boolean} — 꾸물이 상점 자리(별다방 국소 (−26, −14)).
//                          npcs-p1 이 addSpawn('station') 으로 꾸물이를 세우면 claimed = true 로 바꿔 주세요(그러면 가판대 임시 E 가 꺼진다).
// flags.planets: {visited:{id:1}, paid:{id:1}, saur:{hearts, day, gain, fed}, whale:{hearts, day}, daily:{day, done}, pet?: string|0}
// window.__planets: list() · go(id) · travel(id) · check(id) · state() · current() · eclipse(on|null) · actors() · use(id) · feedSaur() ·
//                   fishNow() · surf() · gravity() · pet(on) · setStars?(n)
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { SPACE_ORIGIN } from '../core/game';
import { isEclipse } from '../core/api';
import type { PlanetDef, Witness } from '../core/api';
import type { Species } from '../core/state';
import type { BodyShape } from '../core/physics';
import {
  PLANETS, PLANET_BY_ID, PLANET_ORDER, HEIGHTS, planetOrigin, travelCheck, travelWhyText, planetKey, gravityAccel, donutGravity,
  slideBlend, bounceVel, FROST_FRICTION, JELLY_JUMP_MUL, spaceMeteor, onSugarRing, onCloudSea, DONUT, STATION, WHALE_MAX, isPlanetId,
  type PlanetId, type PlanetInfo, type SaurState, type TravelCheck,
} from './planets/logic';
import { addGroundLayer } from './planets/terrain';
import { buildScene, beltOres, type PlanetScene } from './planets/props';
import { buildLife } from './planets/life';
import { makePlanetFishing } from './planets/fishing';
import { startSurf } from './planets/surf';
import { buildSaurFeeder } from './planets/saurus';
import { littleStar, type Model } from './planets/models';
import type { Actor, PlanetCtx, Tick } from './planets/kit';

export const order = 42;

interface PlanetFlags {
  visited?: Record<string, 1>;
  paid?: Record<string, 1>;
  saur?: SaurState;
  whale?: { hearts: number; day: number };
  daily?: { day: number; done: Record<string, 1> };
  pet?: string | 0;
}

/** 이 모듈 행성 하나가 활성일 때 */
interface Live {
  id: PlanetId;
  info: PlanetInfo;
  O: THREE.Vector3;
  pc: PlanetCtx;
  scene: PlanetScene | null;
  root: THREE.Object3D | null;
  statics: Array<{ remove(): void }>;
  actors: Map<string, Actor>;
  ticks: Tick[];
  witnesses: Array<{ speciesId: string; pos: THREE.Vector3; visible: () => boolean }>;
  /** 까만 도넛 일식이 끝난 뒤 흐른 초 */
  outOfEclipse: number;
  /** 블랙홀 구멍에 빠져 있던 초 */
  inHole: number;
}

const flatD = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
/** E 거리를 [0, 1.2) 로 눌러 담는다(space 의 actRank 와 같은 식) — 우주를 모르는 공급자에게 지지 않게 */
const rank = (d: number) => { const x = Math.max(0, d); return (1.2 * x) / (x + 1.2); };

export default function build(ctx: Ctx) {
  const g0 = ctx.game;
  if (!g0) return;
  const game = g0;
  const space = game.space;
  if (!space) { console.warn('[planets] game.space 가 없어요 — 행성을 달 수 없어요'); return; }

  // ── 저장
  const F = (): PlanetFlags => {
    const f = game.state.flags as Record<string, unknown>;
    if (!f.planets || typeof f.planets !== 'object') f.planets = {};
    return f.planets as PlanetFlags;
  };
  const save = () => game.state.save();
  const day = () => Math.floor(game.env?.day ?? game.econ?.day?.() ?? 0);
  const hour = () => game.env?.hour ?? 12;
  const daily = () => {
    const f = F();
    if (!f.daily || f.daily.day !== day() || typeof f.daily.done !== 'object') f.daily = { day: day(), done: {} };
    return f.daily;
  };
  const toast = (t: string) => game.ui.toast(t);
  const emit = (e: { type: string; [k: string]: unknown }) => game.state.emit(e);
  const unlocked = (k: string) => { try { return game.econ?.isUnlocked?.(k) ?? true; } catch { return true; } };
  const give = (id: string, n: number, why: string) => {
    const econ = game.econ;
    if (econ && typeof econ.give === 'function') return econ.give(id, n, why);
    game.state.addItem(id, n);
    return n;
  };
  let eclipseOverride: boolean | null = null;
  const eclipse = () => {
    if (eclipseOverride !== null) return eclipseOverride;
    const e = game.env;
    if (!e) return false;
    return typeof e.eclipse === 'boolean' ? e.eclipse : isEclipse(e.moonPhase ?? 0.5);
  };
  const meteor = () => {
    const e = game.env;
    let wl: string | null = null;
    try { wl = e?.weatherOf?.('launch') ?? null; } catch { wl = null; }
    return spaceMeteor({ weatherLaunch: wl, weekday: e?.weekday, hour: hour() });
  };

  // ── 다녀온 곳·해금 사슬
  const visited = (id: string): boolean => {
    if (id === 'moon') {
      const sf = (game.state.flags as Record<string, unknown>).space as { visited?: boolean } | undefined;
      return !!sf?.visited || !!F().visited?.moon || (game.econ ? game.econ.isUnlocked?.('space:moon') === true : false);
    }
    if (F().visited?.[id]) return true;
    return game.econ ? game.econ.isUnlocked?.(planetKey(id)) === true : false;
  };
  const whaleFriend = () => (F().whale?.hearts ?? 0) >= WHALE_MAX;
  const check = (id: string): TravelCheck => travelCheck(id, {
    visited, paid: (x) => !!F().paid?.[x], stars: game.econ?.stars ?? 0, eclipse: eclipse(),
    free: !!game.econ?.cheat || whaleFriend(),
  });
  const spawnOf = (id: PlanetId) => {
    const p = PLANET_BY_ID.get(id)!;
    const O = origins.get(id)!;
    return new THREE.Vector3(O.x + p.spawn.x, O.y + HEIGHTS[id](p.spawn.x, p.spawn.z) + 0.3, O.z + p.spawn.z);
  };
  /** 규칙대로 가기 */
  function travel(id: string): boolean {
    if (!isPlanetId(id)) {
      if (id === 'moon') { space!.goPlanet('moon'); return true; }
      toast('모르는 행성이에요'); return false;
    }
    const c = check(id);
    if (!c.ok) { toast(`${PLANET_BY_ID.get(id)!.icon} ${travelWhyText(c)}`); return false; }
    if (c.cost > 0) {
      const econ = game.econ;
      let paid = false;
      try { paid = econ?.spend?.({ stars: c.cost }, `planet:${id}`) ?? econ?.spendStars?.(c.cost, `planet:${id}`) ?? false; } catch (e) { console.error('[planets spend]', e); }
      if (!paid) { toast(`별 ★${c.cost}개가 필요해요`); return false; }
      const f = F();
      f.paid ??= {};
      f.paid[id] = 1;
      save();
      toast(`★${c.cost} 내고 ${PLANET_BY_ID.get(id)!.name}(으)로 출발! 🚀`);
    } else if (!visited(id) && whaleFriend()) toast('🐋 하늘고래가 태워 줘요! 둥실~');
    go(id);
    return true;
  }
  /** 규칙 없이 가기(디버그·이미 허락된 여행) */
  function go(id: PlanetId) {
    const at = spawnOf(id);
    if (game.world === 'space' && space!.planet === id && live?.id === id) { game.player.teleport(at.x, at.z, at.y); return; }
    space!.goPlanet(id, at);
  }

  // ── 활성 행성
  let live: Live | null = null;
  const origins = new Map<PlanetId, THREE.Vector3>();
  const stationShop: { pos: THREE.Vector3 | null; claimed: boolean } = { pos: null, claimed: false };
  /** 토끼달(다른 주인의 행성) 위에 단 E 행동 — 그 오브젝트가 우주에 붙어 있을 때만 산다 */
  const moonActors = new Map<string, { a: Actor; owner: THREE.Object3D }>();
  const attached = (o: THREE.Object3D) => { let p: THREE.Object3D | null = o; while (p) { if (p === game.spaceRoot) return true; p = p.parent; } return false; };

  function makeCtx(id: PlanetId, O: THREE.Vector3, L: Live): PlanetCtx {
    const h = HEIGHTS[id];
    return {
      game, id, O,
      rng: (k) => ctx.rng(k),
      h,
      gy: (lx, lz) => O.y + h(lx, lz),
      at: (lx, lz, up = 0) => new THREE.Vector3(O.x + lx, O.y + h(lx, lz) + up, O.z + lz),
      day, hour, meteor,
      addStatic: (shape: BodyShape, pos, rot) => { L.statics.push(game.physics.addStatic(shape, pos, rot)); },
      addActor: (a) => { L.actors.set(a.id, a); },
      addTick: (fn) => { L.ticks.push(fn); },
      addWitness: (speciesId, pos, visible) => { L.witnesses.push({ speciesId, pos, visible }); },
      toast, give, emit, unlocked,
      takenToday: (k) => !!daily().done[`${id}:${k}`],
      markToday: (k) => { daily().done[`${id}:${k}`] = 1; save(); },
      catchSpecies: (sp, o) => catchSpecies(sp, o),
      camera: ctx.camera,
    };
  }

  // ── 잡기(space 와 같은 흐름: 한 종만 굴림 → 들어 올리기 → 보고)
  function catchSpecies(sp: Species, o: { model?: THREE.Object3D; keep?: boolean; activity?: string; size?: number }) {
    const econ = game.econ;
    let res: ReturnType<NonNullable<typeof econ>['rollCatch']> | null = null;
    try { res = econ?.rollCatch?.({ activity: 'space', pool: [{ ...sp, where: undefined }] }) ?? null; } catch (e) { console.error('[planets rollCatch]', e); }
    const cm = (sp as Species & { cm?: [number, number] }).cm;
    let size = res?.size ?? o.size;
    if (!(typeof size === 'number' && size > 0)) {
      const lo = cm?.[0] ?? (sp.len ?? 20) * 0.8, hi = cm?.[1] ?? (sp.len ?? 20) * 1.2;
      size = lo + (hi - lo) * ctx.rng(`planets:size:${sp.id}:${game.time.toFixed(2)}`)();
    }
    game.ui.showCatch({ species: sp, sizeText: `${size.toFixed(1)}cm`, size, model: o.model, line: (sp as Species & { line?: string }).line, variant: res?.variant, activity: o.activity ?? 'space', keep: o.keep });
    if (res && res.species) {
      res.rarity = sp.rarity;
      try { econ?.reportCatch?.(res); } catch (e) { console.error('[planets reportCatch]', e); }
    }
  }
  /** 낚은 물고기 보이기·도감(굴림·보고는 fishing.ts) */
  function landFish(sp: Species, model: THREE.Object3D) {
    const lo = (sp.len ?? 20) * 0.75, hi = (sp.len ?? 20) * 1.3;
    const size = lo + (hi - lo) * ctx.rng(`planets:fishsize:${sp.id}:${game.time.toFixed(2)}`)();
    game.ui.showCatch({ species: sp, sizeText: `${size.toFixed(1)}cm`, size, model, line: (sp as Species & { line?: string }).line ?? sp.desc, activity: 'moonfish' });
  }

  // ── 잡은 뒤 덤
  const afterCatch = (id: string) => {
    if (id === 's_crystal_hedgehog') {
      const n = give('m_icecrystal', 1, 'planets:hedgehog');
      if (n > 0) { toast('❄️ 얼음결정 1개도 얻었어요!'); emit({ type: 'harvest', kind: 'rock', item: 'm_icecrystal', n, island: 'frost' }); }
    } else if (id === 's_comet_fox') {
      try { game.econ?.addBuff?.('wish', 24 * 60); } catch { /* P1 전 economy */ }
      toast('🌠 혜성여우에게 소원을 빌었어요! 오늘 하루 희귀한 친구가 더 잘 나와요');
    } else if (id === 's_little_star') {
      F().pet = 's_little_star';
      save();
      toast('⭐ 꼬마별이 머리 위를 빙글빙글 따라와요!');
    }
  };
  const petWhale = () => {
    const f = F();
    const w = f.whale && typeof f.whale.hearts === 'number' ? f.whale : { hearts: 0, day: -1 };
    let gain = 0;
    if (w.day !== day() && w.hearts < WHALE_MAX) { w.hearts++; w.day = day(); gain = 1; }
    f.whale = w;
    save();
    return { hearts: w.hearts, gain };
  };

  // ── 행성 등록
  for (const info of PLANETS) {
    const o = planetOrigin(SPACE_ORIGIN, info.idx);
    const O = new THREE.Vector3(o.x, o.y, o.z);
    origins.set(info.id, O);
    const def: PlanetDef & { clampFrac: number } = {
      id: info.id, name: info.name, origin: O, radius: info.radius, gravity: info.gravity, clampFrac: info.clampFrac,
      heightAt: HEIGHTS[info.id],
      build: () => enter(info.id),
      onEnter: () => arrived(info.id),
      onExit: () => leave(info.id),
    };
    space.registerPlanet(def);
  }

  // ── 땅 청크(활성 행성만)
  addGroundLayer(game, () => (live ? { id: live.id, origin: live.O } : null));

  function enter(id: PlanetId): THREE.Object3D {
    if (live) leave(live.id);
    const info = PLANET_BY_ID.get(id)!, O = origins.get(id)!;
    const L: Live = { id, info, O, pc: null as unknown as PlanetCtx, scene: null, root: null, statics: [], actors: new Map(), ticks: [], witnesses: [], outOfEclipse: 0, inHole: 0 };
    live = L;
    L.pc = makeCtx(id, O, L);
    const scene = buildScene(L.pc);
    L.scene = scene;
    L.root = scene.root;
    // 별길 정류장
    const s = info.stop;
    L.actors.set(`planets:stop:${id}`, {
      id: `planets:stop:${id}`, pos: L.pc.at(s.x, s.z, 1.2), r: 3.2, flat: true,
      label: '별길 정류장 — 행성 여행 🪐', use: () => openTravel(),
    });
    planetActions(L);
    if (id === 'station') stationShop.pos = scene.shopPos ?? null;
    return scene.root;
  }
  function leave(id: PlanetId) {
    if (!live || live.id !== id) return;
    const L = live;
    // 서핑 중이면 내린다(행성끼리 갈아탈 땐 setWorld 가 안 내려 준다)
    if (surf && game.player.mounted === surf) game.player.dismount();
    surf = null;
    fishing.cancel();
    for (const b of L.statics) { try { b.remove(); } catch { /* 이미 지움 */ } }
    L.statics.length = 0;
    L.actors.clear();
    L.ticks.length = 0;
    L.witnesses.length = 0;
    live = null;
    lastVel = null;
  }
  function arrived(id: PlanetId) {
    const info = PLANET_BY_ID.get(id)!;
    const f = F();
    f.visited ??= {};
    const first = !f.visited[id];
    if (first) {
      f.visited[id] = 1;
      save();
      try { if (game.econ && !game.econ.isUnlocked?.(planetKey(id))) game.econ.unlock?.(planetKey(id), 'arrive'); } catch (e) { console.error('[planets unlock]', e); }
      emit({ type: 'discover', place: `planet:${id}`, name: info.name, kind: 'landmark' });
      game.hud?.card?.({ title: `${info.icon} ${info.name} 첫 도착!`, body: info.sub, icon: info.icon, color: info.color });
    }
    game.hud?.showRegion?.(info.name, `${info.sub} · 중력 ${id === 'blackhole' ? '출렁출렁' : `${info.gravity}`}`, info.color, info.dark);
  }

  // ── 행성별 E 행동(장면에 맞춰)
  let surf: ReturnType<typeof startSurf> | null = null;
  function planetActions(L: Live) {
    const { pc } = L;
    if (L.id === 'sugar') {
      // 고리 위면 어디서든 서핑
      const p = new THREE.Vector3();
      L.actors.set('planets:sugar:surf', {
        id: 'planets:sugar:surf', pos: p, r: 99,
        ok: () => { p.copy(game.player.pos); return !game.player.mounted && onSugarRing(game.player.pos.x - L.O.x, game.player.pos.z - L.O.z); },
        label: '고리 서핑하기 🏄 (W 가속 · A/D · Space 점프)',
        use: () => {
          if (!L.root) return;
          surf = startSurf(pc, L.root);
          game.player.mount(surf);
          toast('🏄 사탕 고리 서핑! E 로 내려요');
        },
      });
    }
    if (L.id === 'belt') {
      // 지금 숨겨 둔 운석(날이 바뀌면 아래 틱이 되살린다)
      const hidden = new Set<string>();
      for (const ore of beltOres) {
        const key = ore.id;
        if (pc.takenToday(key)) { hidden.add(key); ore.im.setMatrixAt(ore.index, new THREE.Matrix4().makeScale(0, 0, 0)); ore.im.instanceMatrix.needsUpdate = true; }
        L.actors.set(`planets:${key}`, {
          id: `planets:${key}`, pos: ore.pos, r: 2.4, ok: () => !pc.takenToday(key),
          label: '운석 캐기 ⛏️',
          use: () => {
            const r = ctx.rng(`planets:ore:${key}:${day()}`);
            const n = give('m_meteor', 1 + (r() < 0.3 ? 1 : 0), 'planets:belt');
            if (n <= 0) return;
            game.player.act?.('hit', 0.6);
            pc.markToday(key);
            hidden.add(key);
            ore.im.setMatrixAt(ore.index, new THREE.Matrix4().makeScale(0, 0, 0));
            ore.im.instanceMatrix.needsUpdate = true;
            emit({ type: 'harvest', kind: 'meteor', item: 'm_meteor', n, island: 'belt' });
            game.audio?.sfx?.('rock-break', { x: ore.pos.x, z: ore.pos.z });
            toast(`☄️ 운석 조각 ${n}개를 캤어요!`);
          },
        });
      }
      // 날이 바뀌면(자갈띠에 머무는 동안) 캔 운석이 다시 쏙 — 원래 행렬로 되돌린다
      let acc = 0;
      L.ticks.push((_t, dt) => {
        acc += dt;
        if (acc < 1 || !hidden.size) return;
        acc = 0;
        for (const ore of beltOres) {
          if (!hidden.has(ore.id) || pc.takenToday(ore.id)) continue;
          hidden.delete(ore.id);
          ore.im.setMatrixAt(ore.index, ore.m);
          ore.im.instanceMatrix.needsUpdate = true;
        }
      });
    }
    if (L.id === 'station') {
      const lat = pc.at(STATION.latte.x, STATION.latte.z, 1);
      L.actors.set('planets:station:latte', {
        id: 'planets:station:latte', pos: lat, r: 3,
        label: () => (pc.takenToday('latte') ? '오늘의 별빛 라떼는 다 마셨어요 ☕' : '별빛 라떼 마시기 ☕'),
        use: () => {
          if (pc.takenToday('latte')) { toast('☕ 내일 또 오세요~ 반짝반짝 별빛 라떼!'); return; }
          pc.markToday('latte');
          game.player.act?.('eat', 1.2);
          (game.player as unknown as { stamina?: number }).stamina = 1;
          toast('☕ 별빛 라떼 꿀꺽! 기운이 반짝 솟아요 ✨');
        },
      });
      const sp = pc.at(STATION.shop.x, STATION.shop.z, 1);
      L.actors.set('planets:station:shop', {
        id: 'planets:station:shop', pos: sp, r: 3.2, ok: () => !stationShop.claimed,
        label: '꾸물이 상점 (우주 굿즈) 🐙',
        use: () => { emit({ type: 'open-shop', shop: 'station' }); },
      });
      for (const [i, b] of STATION.benches.entries()) {
        L.actors.set(`planets:station:bench:${i}`, {
          id: `planets:station:bench:${i}`, pos: pc.at(b.x, b.z, 0.5), r: 2,
          label: '벤치에 앉기 🪑', use: () => { game.player.act?.('sit', 3); toast('친구를 기다리며 별 구경~ ✨'); },
        });
      }
    }
  }

  // ── 생물 스포너(행성마다 하나 — space 가 들어갈 때마다 build(root))
  for (const info of PLANETS) {
    let up: ((t: number, dt: number) => void) | null = null;
    space.addSpawn(info.id, {
      id: `planets-life-${info.id}`,
      build: (root) => {
        if (!live || live.id !== info.id) return;
        up = buildLife(live.pc, root, { petWhale, afterCatch }).update;
      },
      update: (t, dt) => { if (live?.id === info.id) up?.(t, dt); },
    });
  }
  // ── 토끼달: 별공룡 먹이 그릇 + 별길 정류장(달 착륙장 옆)
  {
    const MO = SPACE_ORIGIN;
    let feeder: ReturnType<typeof buildSaurFeeder> | null = null;
    space.addSpawn('moon', {
      id: 'planets-moon',
      build: (root) => {
        for (const [k, v] of moonActors) if (!attached(v.owner)) moonActors.delete(k);
        const holder = new THREE.Group();
        holder.name = 'planets-moon-extras';
        root.add(holder);
        feeder = buildSaurFeeder({
          game, O: MO, day,
          get: () => F().saur,
          set: (s) => { F().saur = s; save(); },
          addActor: (a) => { moonActors.set(a.id, { a, owner: holder }); },
          toast,
        }, holder);
        // 별길 정류장(착륙장 동쪽 가장자리)
        const sx = MO.x + 13, sz = MO.z + 5, sy = game.groundAt(sx, sz);
        const sign = moonStop(sx, sy, sz);
        holder.add(sign);
        moonActors.set('planets:stop:moon', { owner: holder, a: { id: 'planets:stop:moon', pos: new THREE.Vector3(sx, sy + 1.2, sz), r: 3.2, flat: true, label: '별길 정류장 — 다른 행성으로 🪐', use: () => openTravel() } });
      },
      update: (t) => feeder?.update(t),
    });
  }
  function moonStop(x: number, y: number, z: number): THREE.Object3D {
    // 행성 정류장과 같은 표지판(달 국소 좌표를 몰라도 되게 장면 빌더를 빌려 쓰지 않고 직접)
    const g = new THREE.Group();
    g.name = 'planets-stop-moon';
    g.position.set(x, y, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 16), new THREE.MeshStandardMaterial({ color: '#fff1cf', roughness: 0.55 }));
    pole.position.y = 1.3;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), new THREE.MeshStandardMaterial({ color: '#ffe27a', emissive: '#ffe27a', emissiveIntensity: 1.2 }));
    lamp.position.y = 2.85;
    const star = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 10, 32), new THREE.MeshStandardMaterial({ color: '#c9b6f2', emissive: '#c9b6f2', emissiveIntensity: 0.6 }));
    star.position.y = 2.85;
    g.add(pole, lamp, star);
    g.rotation.y = -Math.PI / 2;
    return g;
  }

  // ── 여행 패널
  function rows() {
    const out = [{ id: 'moon', name: '토끼달', icon: '🌙', color: '#fff1cf', cost: 0, gravity: 0.2, visited: visited('moon'), paid: true, ok: true, why: undefined as string | undefined, text: '언제든 갈 수 있어요' }];
    for (const id of PLANET_ORDER) {
      const p = PLANET_BY_ID.get(id)!, c = check(id);
      out.push({ id, name: p.name, icon: p.icon, color: p.color, cost: c.cost, gravity: p.gravity, visited: visited(id), paid: !!F().paid?.[id], ok: c.ok, why: c.why, text: c.ok ? (c.cost > 0 ? `★${c.cost} 내고 출발` : visited(id) ? '다녀온 곳 · 공짜' : '갈 수 있어요') : travelWhyText(c) });
    }
    return out;
  }
  game.hud.registerPanel({
    kind: 'planets', title: '행성 여행', color: '#c9b6f2', icon: '🪐',
    meta: () => `★${game.econ?.stars ?? 0}`,
    render: (body, pctx) => {
      const h = pctx.h;
      body.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;color:#4a3b2a';
      const head = document.createElement('div');
      head.style.cssText = 'font-size:14px;opacity:.85';
      head.textContent = `별길을 따라 다른 행성으로! 앞 행성을 다녀오면 다음 행성이 열려요. 내 별 ★${h.fmt(game.econ?.stars ?? 0)}${eclipse() ? ' · 🌑 지금은 일식!' : ''}`;
      wrap.appendChild(head);
      const here = game.world === 'space' ? space.planet : 'earth';
      for (const r of rows()) {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:14px;background:#fff8e8;border:3px solid ${r.color};${r.ok ? '' : 'opacity:.72'}`;
        const ic = document.createElement('div');
        ic.style.cssText = `width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;background:${r.color}`;
        ic.textContent = r.icon;
        const txt = document.createElement('div');
        txt.style.cssText = 'flex:1;line-height:1.25';
        txt.innerHTML = `<b>${h.esc(r.name)}</b>${r.visited ? ' <span style="font-size:12px">✔ 다녀옴</span>' : ''}<br><span style="font-size:12px">중력 ${r.id === 'blackhole' ? '출렁출렁' : r.gravity} · ${h.esc(r.text)}</span>`;
        row.append(ic, txt);
        if (here === r.id) {
          const t = document.createElement('span'); t.textContent = '여기예요!'; t.style.cssText = 'font-size:13px';
          row.appendChild(t);
        } else if (r.ok) row.appendChild(h.button(r.cost > 0 ? `★${r.cost} 가기` : '가기', () => { pctx.close(); travel(r.id); }));
        wrap.appendChild(row);
      }
      wrap.appendChild(h.button('🌏 지구로 돌아가기', () => { pctx.close(); (space as unknown as { returnToEarth?: (w?: string) => void }).returnToEarth?.('rocket'); }));
      body.appendChild(wrap);
    },
  });
  function openTravel() {
    game.hud.open('planets');
  }

  // ── E 행동(가장 가까운 것 하나)
  game.addProvider('planets-act', (pl) => {
    if (game.world !== 'space' || pl.mounted) return null;
    let best: Actor | null = null, bd = Infinity;
    const f = pl.facing();
    const consider = (a: Actor) => {
      const d = a.flat ? flatD(a.pos, pl.pos) : a.pos.distanceTo(pl.pos);
      if (d > a.r || d >= bd) return;
      try { if (a.ok && !a.ok()) return; } catch { return; }
      if (a.cone) {
        const dx = a.pos.x - pl.pos.x, dz = a.pos.z - pl.pos.z, l = Math.hypot(dx, dz);
        if (l > 0.9 && (dx * f.x + dz * f.z) / l < 0.35) return;
      }
      best = a; bd = d;
    };
    if (live) for (const a of live.actors.values()) consider(a);
    if (space.planet === 'moon') for (const [k, v] of moonActors) { if (!attached(v.owner)) { moonActors.delete(k); continue; } consider(v.a); }
    if (!best) return null;
    const a: Actor = best;
    // 서핑은 고리 위 어디서나 — 거리 대신 고정(다른 E 가 가까우면 그쪽)
    const dist = a.id === 'planets:sugar:surf' ? 1.1 : rank(bd);
    return { id: a.id, label: typeof a.label === 'function' ? a.label() : a.label, dist, use: a.use };
  });

  // ── 낚시
  const fishing = makePlanetFishing({
    game,
    current: () => (live && live.root ? { id: live.id, O: live.O, root: live.root } : null),
    rng: (k) => ctx.rng(k), hour, meteor, eclipse, unlocked, toast,
    landFish,
  });
  game.addProvider('planets-fish', () => fishing.provider());

  // ── 목격 등록(사진 모드)
  game.witnesses.add((): Witness[] => {
    if (game.world !== 'space' || !live) return [];
    const p = game.player.pos, out: Witness[] = [];
    for (const w of live.witnesses) if (w.visible() && w.pos.distanceToSquared(p) < 80 * 80) out.push({ speciesId: w.speciesId, pos: w.pos.clone() });
    return out;
  });

  // ── 꼬마별 펫(머리 위 공전 — 지구에서도)
  let petModel: Model | null = null;
  const petOn = () => F().pet === 's_little_star' && !!game.state.dex['s_little_star'];

  // ── 매 프레임: 장면·틱 · 행성 물리(미끄럼·튕김·가변 중력) · 낚시 · 일식
  let lastVel: { x: number; z: number } | null = null;
  let prevMode = game.player.mode, prevVy = 0;
  ctx.onUpdate((t, dt) => {
    // 펫
    const want = petOn();
    if (want && !petModel) { petModel = littleStar(0.4); petModel.scale.setScalar(0.7); petModel.name = 'planets-pet-star'; game.root.add(petModel); }
    if (petModel) {
      petModel.visible = want;
      if (want) {
        const p = game.player.pos;
        petModel.position.set(p.x + Math.cos(t * 1.6) * 0.75, p.y + 2.05 + Math.sin(t * 3) * 0.08, p.z + Math.sin(t * 1.6) * 0.75);
        petModel.rotation.y = -t * 1.6;
        petModel.userData.anim(t);
      }
    }
    if (game.world !== 'space' || !live) { prevMode = game.player.mode; return; }
    const L = live;
    L.scene?.update(t, dt);
    for (const fn of L.ticks) { try { fn(t, dt); } catch (e) { console.error('[planets tick]', e); } }
    fishing.update(t, dt);
    const pl = game.player;
    const lx = pl.pos.x - L.O.x, lz = pl.pos.z - L.O.z;
    // 서리볼: 마찰 0.05 — 땅 위에선 속도가 아주 천천히 바뀐다(미끌미끌)
    if (L.id === 'frost' && pl.mode === 'ground' && !pl.mounted) {
      if (lastVel) { const v = slideBlend(lastVel, { x: pl.vel.x, z: pl.vel.z }, FROST_FRICTION); pl.vel.x = v.x; pl.vel.z = v.z; }
      lastVel = { x: pl.vel.x, z: pl.vel.z };
    } else if (L.id === 'frost' && (pl.mode === 'air' || pl.mode === 'glide')) lastVel = { x: pl.vel.x, z: pl.vel.z };
    else lastVel = null;
    // 젤리별 트램펄린 · 구름바다 폭신(떨어지다 닿으면 통 튕긴다)
    const bouncy = L.id === 'jelly' || (L.id === 'cloud' && onCloudSea(lx, lz));
    if (bouncy && !pl.mounted) {
      if (pl.mode === 'ground' && (prevMode === 'air' || prevMode === 'glide')) {
        const v = bounceVel(prevVy, L.id === 'jelly' ? 0.82 : 0.5, L.id === 'jelly' ? 5 : 3);
        if (v > 0) { pl.vel.y = v; pl.mode = 'air'; if (v > 5) game.audio?.sfx?.('jump', { vol: 0.5, pitch: 1.3 }); }
      } else if (L.id === 'jelly' && prevMode === 'ground' && pl.mode === 'air' && pl.vel.y > 7.5 && pl.vel.y < 8.6) {
        pl.vel.y *= JELLY_JUMP_MUL; // 젤리 위 점프는 더 높이
      }
    }
    if (pl.mode === 'air' || pl.mode === 'glide') prevVy = pl.vel.y;
    prevMode = pl.mode;
    // 까만 도넛: 출렁 가변 중력 · 구멍에 빠지면 퉤! · 일식이 끝나면 별다방으로
    if (L.id === 'blackhole') {
      const R = Math.hypot(lx, lz);
      game.physics.setGravity(gravityAccel(donutGravity(t, R)));
      if (R < DONUT.rIn - 3) {
        L.inHole += dt;
        if (L.inHole > 1.6) {
          L.inHole = 0;
          const a = Math.atan2(lz, lx) || 0.5, R2 = DONUT.rIn + 22;
          const x = Math.cos(a) * R2, z = Math.sin(a) * R2;
          pl.teleport(L.O.x + x, L.O.z + z, L.O.y + HEIGHTS.blackhole(x, z) + 0.3);
          toast('🕳️ 블랙홀이 퉤! 하고 뱉었어요 — 조심조심');
        }
      } else L.inHole = 0;
      if (!eclipse()) {
        L.outOfEclipse += dt;
        if (L.outOfEclipse > 0 && L.outOfEclipse - dt <= 0) toast('🌑 일식이 끝나 가요! 곧 별다방으로 돌아가요');
        if (L.outOfEclipse > 10) { L.outOfEclipse = -1e9; go('station'); }
      } else L.outOfEclipse = 0;
    }
  });

  // ── ext.planets
  const ext = {
    list: () => rows(),
    check: (id: string) => check(id),
    travel: (id: string) => travel(id),
    visited: (id: string) => visited(id),
    current: () => live?.id ?? null,
    eclipse: () => eclipse(),
    origin: (id: string) => (isPlanetId(id) ? origins.get(id)!.clone() : null),
    stationShop,
    open: () => openTravel(),
  };
  game.ext.planets = ext;

  // ── 디버그 훅
  if (typeof window !== 'undefined') {
    (window as unknown as { __planets?: unknown }).__planets = {
      ext,
      list: () => rows(),
      go: (id: string) => { if (id === 'moon') space.goPlanet('moon'); else if (isPlanetId(id)) go(id); return space.planet; },
      travel: (id: string) => travel(id),
      check: (id: string) => check(id),
      state: () => JSON.parse(JSON.stringify(F())),
      current: () => live?.id ?? null,
      eclipse: (on: boolean | null = true) => { eclipseOverride = on; return eclipse(); },
      actors: () => [...(live?.actors.values() ?? []), ...[...moonActors.values()].map((v) => v.a)].map((a) => ({ id: a.id, x: a.pos.x, y: a.pos.y, z: a.pos.z, ok: a.ok ? a.ok() : true })),
      use: (id: string) => { const a = live?.actors.get(id) ?? moonActors.get(id)?.a; if (!a) return false; a.use(); return true; },
      feedSaur: () => { const a = moonActors.get('planets:saur:feed')?.a; if (!a) return false; a.use(); return F().saur ?? null; },
      goNest: () => { space.goPlanet('moon'); const x = SPACE_ORIGIN.x + 150 - 14, z = SPACE_ORIGIN.z - 220 + 12; game.player.teleport(x, z); game.cam.yaw = Math.atan2(-3, -3); return game.player.pos.clone(); },
      fishNow: () => fishing.biteNow(),
      fishSpot: () => fishing.spotAhead(),
      surf: () => { const a = live?.actors.get('planets:sugar:surf'); if (!a || !live) return false; const s = live.pc.at(0, -120, 0.3); game.player.teleport(s.x, s.z, s.y); a.use(); return !!surf; },
      gravity: () => game.physics.gravity,
      pet: (on = true) => { F().pet = on ? 's_little_star' : 0; save(); return petOn(); },
      teleportLocal: (lx: number, lz: number, up = 0.3) => { if (!live) return null; const p = live.pc.at(lx, lz, up); game.player.teleport(p.x, p.z, p.y); return p; },
    };
  }
}
