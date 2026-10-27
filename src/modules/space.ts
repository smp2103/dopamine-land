// 우주(토끼달, GDD 3.9 · 6.3): SPACE_ORIGIN 둘레 반경 400 m 달 — 청크 지형(가까운 땅 trimesh 충돌 + 먼 땅 LOD) · 도톰한 크레이터 30 ·
// 결정 덤불 · 발광 달꽃(하루 한 번) · 별가루 반짝이 · 하늘의 큰 지구 · 착륙장(로켓 E '지구로!' · 펭박사 깃발) ·
// 떡방아 토끼 마을(떡순이) · 크레이터 연못 3 · 월석 들판 · 지구 전망 언덕 · 별공룡 둥지 · UFO 잔해(삐리) · 우주상자 15(하루마다) ·
// 산소(캡슐 1 = 게임 4시간, env.gameSec) + 0 이면 '숨차!' 자동 귀환 · 도착 이벤트 · 우주 생물 18종(GDD) + 예전 달 친구들 ·
// 행성 등록소(registerPlanet · goPlanet · addSpawn — 활성 행성만 짓는다).
//
// game.space(SpaceApi, 계약 2장) — 주인은 이 모듈 하나:
//   planet            지금 행성 id('moon' …)
//   ponds / pondAt    달 연못(월드 좌표 {x, z, r, y}) · 그 자리 물 높이(낚시 zone moonpond)
//   oxygen            {value, max, capsules} — value·max 는 게임 초(캡슐 1개 = 300), capsules = 가방의 it_oxygen
//   landingSpawn      달 착륙장(로켓 발사가 여기로 setWorld) · returnSpawn 지구 발사대 앞
//   registerPlanet(def)  def.heightAt(lx, lz) 는 '국소 좌표'(origin 기준)를 받아 '국소 높이'(origin.y 기준)를 돌려준다.
//                        def.gravity: 음수면 그대로 가속(m/s², 달 −4.5), 0~1.5 면 지구(−22) 배율. def.clampFrac(선택, 기본 0.96).
//                        build() 는 들어갈 때마다 불리고 나갈 때 버린다(활성 행성만 지어진다). 땅 충돌은 행성 주인이 짓는다.
//                        origin 은 SPACE_ORIGIN 에서 2 km 넘게 떨어뜨린다 — 달 청크(먼 땅 반경 900 m + 칸 200 m)는 '안 짓는다(null)'도
//                        칸마다 기억해서, 가까이 붙이면 행성을 오갈 때 빈 칸·남은 달 충돌이 생긴다.
//   goPlanet(id, spawn?) 지구에서면 setWorld('space') 로, 우주에서면 행성끼리 갈아탄다. 도착하면 arrive {to:id}.
//   addSpawn(planetId, {id, build(root), update?(t, dt)}) 그 행성에 들어갈 때마다 build(root), 있는 동안 update.
//   덤: planets() · active() · returnToEarth(why?) · photoSpots
// flags.space: {visited, oxy, daily:{day, done}, chests:{day, open}, found}
// window.__space: goPad · pond(i) · go(place) · oxygen() · setOxygen(v) · capsules() · returnNow() · chests() · openChest(i) · actors() · use(id) · planets() · goPlanet(id)
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { SPACE_ORIGIN } from '../core/game';
import * as Island from '../core/island';
import { curveUniforms, applyCurve } from '../core/curve';
import { CURVE_K } from '../core/presets';
import { disposeGeometries } from '../core/chunks';
import type { PlanetSpawner, Pond, SpaceApi, Witness } from '../core/api';
import { SPACE_SPECIES, SPACE_BY_ID, type SpaceSpecies } from './space/data';
import { makeCreature, type Creature } from './space/model';
import {
  MOON_R, MOON_GRAVITY, PAD_H, PAD_R, OXY_PER_CAPSULE, OXY_GRACE, FIRST_VISIT_CAPSULES, FLOAT_SEC, FLOAT_FALL, MOON_PLACES, PLACE_NAMES,
  moonHeight, pondsWorld, pondAtIn, stepOxygen, PlanetRegistry, planetGround, clampToPlanet, floorRescue, defaultSpawn, dailyFor,
  gravityOf, actRank, type PlanetEntry, type DailyLog, type OxyState,
} from './space/logic';
import { addMoonTerrain, type Pickup } from './space/terrain';
import { addLifeLayer, inCone, spawnCritter } from './space/creatures';
import { addPlacesLayer, buildChests, type SpaceChests } from './space/places';
import { makeMoonSky, type MoonSky } from './space/sky';
import { makePad, makePengFlag, makeRocket } from './space/props';
import { disposeDeep, onDispose, runDispose, type Actor, type Hub, type Ticker, type WitnessRec } from './space/hub';

export const order = 40;

/** 지구 발사대 앞 귀환 자리(발사대 PLACES.launchPad 에서 섬 쪽으로) */
export const RETURN_OFFSET = { x: 0, z: 20 };
/** 달에서 땅을 작은 행성처럼 휘는 정도(모험 카메라) */
const MOON_CURVE = 0.0007;

interface SpaceFlags {
  visited?: boolean;
  oxy?: number;
  daily?: DailyLog;
  chests?: { day: number; open: number[] };
  found?: Record<string, 1>;
}

export default function build(ctx: Ctx) {
  const g0 = ctx.game;
  if (!g0) return;
  const game = g0;
  const O = SPACE_ORIGIN;
  game.state.register(SPACE_SPECIES);

  const F = (): SpaceFlags => {
    const f = game.state.flags as Record<string, unknown>;
    if (!f.space || typeof f.space !== 'object') f.space = {};
    return f.space as SpaceFlags;
  };
  const save = () => game.state.save();
  const day = () => Math.floor(game.env?.day ?? game.econ?.day?.() ?? 0);
  const hour = () => game.env?.hour ?? 12;

  // ── 살아 있는 E 행동·틱·목격
  const actors = new Map<string, Actor>();
  const tickers = new Set<Ticker>();
  const witnesses = new Set<WitnessRec>();

  const daily = () => { const f = F(); f.daily = dailyFor(f.daily, day()); return f.daily; };
  const unlocked = (k: string) => { try { return game.econ?.isUnlocked?.(k) ?? true; } catch { return true; } };
  const give = (id: string, n: number, why: string) => {
    const econ = game.econ;
    if (econ && typeof econ.give === 'function') return econ.give(id, n, why);
    game.state.addItem(id, n);
    return n;
  };
  const toast = (t: string) => game.ui.toast(t);
  const emit = (e: { type: string; [k: string]: unknown }) => game.state.emit(e);

  const hub: Hub = {
    game, O,
    rng: (k) => ctx.rng(k),
    groundY: (lx, lz) => O.y + moonHeight(lx, lz),
    day, hour,
    addActor: (a) => { actors.set(a.id, a); return () => { if (actors.get(a.id) === a) actors.delete(a.id); }; },
    addTicker: (fn) => { tickers.add(fn); return () => { tickers.delete(fn); }; },
    addWitness: (w) => { witnesses.add(w); return () => { witnesses.delete(w); }; },
    addCollider: (shape, at) => {
      const b = game.physics.addStatic(shape, { x: at.x, y: at.y, z: at.z });
      return () => b.remove();
    },
    catchSpecies: (sp, o) => catchSpecies(sp, o),
    greet: (sp, model, line) => greet(sp, model, line),
    give, unlocked, toast, emit,
    takenToday: (id) => !!daily().done[id],
    markToday: (id) => { daily().done[id] = 1; save(); },
    discover: (place) => {
      const f = F();
      f.found ??= {};
      if (f.found[place]) return;
      f.found[place] = 1;
      save();
      const name = PLACE_NAMES[place] ?? place;
      emit({ type: 'discover', place: `moon:${place}`, name, kind: 'landmark' });
      toast(`✨ ${name} 발견!`);
    },
  };

  // ── 잡기·인사
  function catchSpecies(sp: SpaceSpecies, o: { model?: THREE.Object3D; keep?: boolean; how: string }) {
    const econ = game.econ;
    let res: ReturnType<NonNullable<typeof econ>['rollCatch']> | null = null;
    try { res = econ?.rollCatch?.({ activity: 'space', pool: [{ ...sp, where: undefined }] }) ?? null; } catch (e) { console.error('[space rollCatch]', e); }
    const [lo, hi] = sp.cm;
    let size = res?.size;
    if (!(typeof size === 'number' && size > 0)) size = lo + (hi - lo) * ctx.rng(`space:size:${sp.id}:${game.time.toFixed(2)}`)();
    game.ui.showCatch({ species: sp, sizeText: `${size.toFixed(1)}cm`, size, model: o.model, line: sp.line, variant: res?.variant, activity: 'space', keep: o.keep });
    if (res && res.species) {
      res.rarity = sp.rarity; // 한 종만 굴렸으니 희귀도는 그 종 그대로
      try { econ?.reportCatch?.(res); } catch (e) { console.error('[space reportCatch]', e); }
    }
    if (sp.drop) {
      const n = give(sp.drop.id, sp.drop.n, `space:${sp.id}`);
      if (n > 0) {
        const nm = sp.drop.id === 'm_stardust' ? '별가루' : sp.drop.id === 'm_moonrock' ? '월석' : sp.drop.id;
        toast(`✨ ${nm} ${n}개도 얻었어요!`);
        emit({ type: 'harvest', kind: sp.drop.id === 'm_stardust' ? 'stardust' : 'moonrock', item: sp.drop.id, n, island: 'moon' });
      }
    }
  }
  function greet(sp: SpaceSpecies, model: THREE.Object3D | null, line?: string) {
    const key = `greet:${sp.id}`;
    const first = !daily().done[key];
    if (!first && game.state.dex[sp.id]) { toast(`${sp.name}: ${line ?? '반가워!'} (오늘은 벌써 인사했어요)`); return false; }
    daily().done[key] = 1;
    save();
    game.ui.showCatch({ species: sp, model: model ?? undefined, line: line ?? sp.line, activity: 'space', keep: false });
    return true;
  }

  // ── 행성 등록소
  const reg = new PlanetRegistry();
  let active: { def: PlanetEntry; root: THREE.Object3D } | null = null;
  let pendingPlanet: string | null = null;
  let arrivedFix = false;
  const moonActive = () => active?.def.id === 'moon';

  const L = Island.PLACES.launchPad;
  const rx = L.x + RETURN_OFFSET.x, rz = L.z + RETURN_OFFSET.z;
  const ponds: Pond[] = pondsWorld(O);
  const oxy: OxyState & { capsules: number } = {
    value: 0, max: OXY_PER_CAPSULE,
    get capsules() { return game.state.bag['it_oxygen'] ?? 0; },
  } as OxyState & { capsules: number };

  const api: SpaceApi & {
    planets(): string[]; active(): string | null; returnToEarth(why?: string): void;
    photoSpots: Array<{ id: string; name: string; x: number; z: number }>;
  } = {
    planet: 'moon',
    ponds,
    pondAt: (x, z) => pondAtIn(ponds, x, z),
    oxygen: oxy,
    landingSpawn: new THREE.Vector3(O.x, O.y + PAD_H + 0.1, O.z + PAD_R - 0.5),
    returnSpawn: new THREE.Vector3(rx, Island.heightAt(rx, rz), rz),
    registerPlanet: (def) => {
      reg.register(def as PlanetEntry);
    },
    goPlanet: (id, spawn) => goPlanet(id, spawn),
    addSpawn: (planetId, s) => {
      reg.addSpawn(planetId, s);
      // 이미 그 행성에 있으면 바로 짓는다
      if (active && active.def.id === planetId) buildSpawner(s, active.root);
    },
    planets: () => reg.list().map((d) => d.id),
    active: () => active?.def.id ?? null,
    returnToEarth: (why = 'rocket') => startReturn(why),
    photoSpots: [{ id: 'moon-earthview', name: PLACE_NAMES.hill, x: O.x + MOON_PLACES.hill.x, z: O.z + MOON_PLACES.hill.z }],
  };
  game.space = api;

  function buildSpawner(s: PlanetSpawner, root: THREE.Object3D) {
    try { s.build(root); } catch (e) { console.error(`[space spawner ${s.id}]`, e); }
  }
  function enterPlanet(id: string) {
    if (active?.def.id === id) return;
    if (active) exitPlanet();
    const def = reg.get(id) ?? reg.get('moon')!;
    let root: THREE.Object3D;
    try { root = def.build(); } catch (e) { console.error(`[space planet ${def.id}]`, e); root = new THREE.Group(); }
    if (!root.name) root.name = `planet-${def.id}`;
    game.spaceRoot.add(root);
    applyCurve(root);
    active = { def, root };
    api.planet = def.id;
    game.physics.setGravity(gravityOf(def.gravity));
    game.focusOverride = null;
    for (const s of reg.spawnersOf(def.id)) buildSpawner(s, root);
    try { def.onEnter?.(); } catch (e) { console.error(`[space planet ${def.id} onEnter]`, e); }
    // 새로 붙은 것에도 곡률
    applyCurve(root);
  }
  function exitPlanet() {
    if (!active) return;
    const { def, root } = active;
    try { def.onExit?.(); } catch (e) { console.error(`[space planet ${def.id} onExit]`, e); }
    active = null;
    // 행성을 떠나면 그 행성 틱이 멈춘다 — 느린 줍기 잠금이 지구까지 따라오지 않게
    game.player.unlock?.('space-pickup', true);
    game.spaceRoot.remove(root);
    root.traverse((o) => runDispose(o));
    disposeGeometries(root);
  }
  function spawnFor(def: PlanetEntry) {
    return def.id === 'moon' ? api.landingSpawn.clone() : defaultSpawn(def);
  }
  function goPlanet(id: string, spawn?: THREE.Vector3) {
    const def = reg.get(id);
    if (!def) { console.warn(`[space] 모르는 행성 '${id}'`); return; }
    const at = spawn ?? spawnFor(def);
    if (game.world !== 'space') {
      pendingPlanet = id;
      game.setWorld('space', at);
      return;
    }
    if (active?.def.id !== id) {
      enterPlanet(id);
      emit({ type: 'arrive', to: id });
    }
    game.player.teleport(at.x, at.z, at.y);
  }

  // ── 달(첫 행성)
  let sky: MoonSky | null = null;
  let chests: SpaceChests | null = null;
  let rocket: THREE.Group | null = null;
  let rocketBaseY = 0;
  const bigWhales: Creature[] = [];
  function buildMoon(): THREE.Object3D {
    const root = new THREE.Group();
    root.name = 'planet-moon';
    // 보조광(우주 그룹이 숨으면 같이 꺼진다): 역광 쪽 얼굴도 파스텔로
    const hemi = new THREE.HemisphereLight('#d9d2ff', '#ffe6ee', 0.6);
    const fill = new THREE.DirectionalLight('#c8d6ff', 0.7);
    fill.position.set(O.x + 60, O.y + 60, O.z - 40);
    fill.target.position.copy(O);
    root.add(hemi, fill, fill.target);
    // 하늘(한 번 만들어 두고 다시 쓴다)
    sky ??= makeMoonSky((k) => ctx.rng(k));
    sky.group.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) g.userData.shared = true; });
    root.add(sky.group);
    // 착륙장 + 로켓 + 펭박사 깃발
    const pad = makePad(PAD_R);
    pad.position.set(O.x, O.y + PAD_H - 0.28, O.z);
    root.add(pad);
    const padLights = pad.userData.lights as THREE.Mesh[];
    rocket = makeRocket();
    rocketBaseY = O.y + PAD_H + 0.02;
    rocket.position.set(O.x, rocketBaseY, O.z - 1);
    root.add(rocket);
    const flag = makePengFlag();
    flag.position.set(O.x + 5.5, O.y + PAD_H - 0.05, O.z - 3);
    flag.rotation.y = -0.5;
    root.add(flag);
    const rk = rocket;
    onDispose(root,
      hub.addCollider({ kind: 'cylinder', halfH: 4.2, r: 1.8 }, new THREE.Vector3(O.x, O.y + PAD_H + 4.2, O.z - 1)),
      hub.addActor({
        id: 'space:rocket', pos: new THREE.Vector3(O.x, O.y + PAD_H + 0.5, O.z - 1), r: 6.5, flat: true,
        label: '지구로! 🚀', use: () => startReturn('rocket'),
      }),
      hub.addTicker((t) => {
        padLights.forEach((l, i) => { l.scale.setScalar(0.16 * (0.75 + 0.45 * Math.max(0, Math.sin(t * 3 - i * 0.52)))); });
        const fm = flag.userData.flag as THREE.Mesh;
        const p = fm.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 0.9; p.setZ(i, Math.sin(x * 3 - t * 2.4) * 0.08 * x); }
        p.needsUpdate = true;
        (rk.userData.beacon as THREE.Mesh).scale.setScalar(0.28 * (0.8 + 0.3 * Math.sin(t * 4)));
      }),
    );
    // 달브라키오: 먼 언덕을 천천히(늘 보이는 큰 친구)
    const H = MOON_PLACES.farHill;
    spawnCritter(hub, root, SPACE_BY_ID.get('s_moon_brachio')!, H.x, H.z, { ph: 4.2, scale: 1.7, wanderR: 10, label: '달브라키오에게 인사하기' });
    // 멀리 유영하는 하늘고래(풍경 — 잡을 수 없다)
    bigWhales.length = 0;
    const whaleSp = SPACE_BY_ID.get('space-whale')!;
    for (let i = 0; i < 2; i++) {
      const w = makeCreature(whaleSp, 0.3 * i);
      w.scale.setScalar(10 - i * 3);
      w.traverse((o) => { o.castShadow = false; });
      root.add(w);
      bigWhales.push(w);
    }
    // 우주상자 15(하루마다 자리가 바뀐다)
    const ch = buildChests(hub, () => { const f = F(); f.chests ??= { day: -1, open: [] }; return f.chests; }, save);
    chests = ch;
    ch.rebuild(day());
    root.add(ch.group);
    onDispose(root, () => disposeDeep(ch.group));
    return root;
  }
  reg.register({
    id: 'moon', name: '토끼달', origin: O, radius: MOON_R, gravity: MOON_GRAVITY, heightAt: moonHeight,
    build: buildMoon,
    onExit: () => { chests = null; rocket = null; },
  });

  // ── 지형·생물·장소 청크(달이 활성일 때만)
  const terrain = addMoonTerrain({ game, origin: O, rng: (k) => ctx.rng(k), active: moonActive, takenToday: (id) => !!daily().done[id] });
  addLifeLayer(hub, moonActive);
  addPlacesLayer(hub, moonActive);

  // ── 땅 공급자: 우주에선 활성 행성(없으면 점이 든 행성) 높이
  game.addGroundProvider((x, z) => {
    if (game.world !== 'space') return null;
    const def = active?.def ?? reg.planetAt(x, z);
    return def ? planetGround(def, x, z) : null;
  }, 'space');

  // ── 목격 등록소(사진 모드·인사)
  game.witnesses.add((): Witness[] => {
    if (game.world !== 'space') return [];
    const p = game.player.pos, out: Witness[] = [];
    for (const w of witnesses) if (w.visible() && w.pos.distanceToSquared(p) < 80 * 80) out.push({ speciesId: w.speciesId, pos: w.pos.clone() });
    return out;
  });

  // ── E 행동(가장 가까운 것 하나). 내미는 거리는 actRank 로 눌러 담는다 — 우주를 모르는 공급자(낚시가 달 밑 지구 바다를 보고
  //    늘 1.6 으로 '낚시하기')에게 지지 않게. 진짜 고침은 fishing.ts 쪽(우주에선 pondAt 만).
  const pickupUse = (pk: Pickup) => {
    if (pk.taken) return;
    const isFlower = pk.kind === 'flower';
    const item = isFlower ? 'm_moonflower' : 'm_stardust';
    const n = give(item, 1, isFlower ? 'moonflower' : 'stardust');
    if (n <= 0) return; // 가방이 꽉 찼다(economy 가 알려 준다) — 그 자리에 그대로 둔다
    hub.markToday(pk.id);
    terrain.take(pk);
    game.player.act?.('pick', 0.5);
    emit({ type: 'harvest', kind: isFlower ? 'moonflower' : 'stardust', item, n, island: 'moon' });
    toast(isFlower ? '🌼 반짝이는 달꽃을 땄어요!' : '✨ 별가루를 주웠어요!');
  };
  const flatD = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
  game.addProvider('space-act', (pl) => {
    if (game.world !== 'space' || leaving) return null;
    let best: Actor | null = null, bd = Infinity;
    const f = pl.facing();
    for (const a of actors.values()) {
      const d = a.flat ? flatD(a.pos, pl.pos) : a.pos.distanceTo(pl.pos);
      if (d > a.r || d >= bd) continue;
      try { if (a.ok && !a.ok()) continue; } catch { continue; }
      if (a.cone && !inCone(f, pl.pos, a.pos)) continue;
      best = a; bd = d;
    }
    let pick: Pickup | null = null;
    for (const pk of terrain.pickups.values()) {
      if (pk.taken) continue;
      const d = pk.pos.distanceTo(pl.pos) - 0.5;
      if (d < 1.6 && d < bd) { bd = d; pick = pk; best = null; }
    }
    if (pick) {
      const pk = pick;
      return { id: `space:${pk.kind}`, label: pk.kind === 'flower' ? '달꽃 따기 🌼' : '별가루 줍기 ✨', dist: actRank(bd), use: () => pickupUse(pk) };
    }
    if (!best) return null;
    const a = best;
    return { id: a.id, label: typeof a.label === 'function' ? a.label() : a.label, dist: actRank(bd), use: a.use };
  });

  // ── 도착·산소
  let lastSec: number | null = null;
  let lowWarned = false;
  const takeCapsule = () => {
    if (!game.state.has('it_oxygen')) return false;
    game.state.addItem('it_oxygen', -1);
    return true;
  };
  function startOxygen() {
    const f = F();
    lastSec = game.env?.gameSec ?? null;
    lowWarned = false;
    if (!f.visited) {
      f.visited = true;
      const n = give('it_oxygen', FIRST_VISIT_CAPSULES, 'peng');
      game.hud?.card?.({ title: '펭박사의 선물', body: `"달은 공기가 없으니까! 산소 캡슐 ${n}개 챙겨 가~" 캡슐 1개 = 게임 4시간`, icon: '🐧', color: '#8fd3f4' });
      toast(`🐧 펭박사: 산소 캡슐 ${n}개 챙겨 가!`);
    }
    oxy.value = Math.max(0, Math.min(OXY_PER_CAPSULE, f.oxy ?? 0));
    if (oxy.value <= 0) {
      if (takeCapsule()) oxy.value = OXY_PER_CAPSULE;
      else { oxy.value = OXY_GRACE; toast('🫧 산소 캡슐이 없어요! 비상 산소로 1시간만 둘러볼 수 있어요'); }
    }
    f.oxy = oxy.value;
    save();
  }
  let saveAcc = 0;
  function tickOxygen(dt: number) {
    const sec = game.env?.gameSec;
    let d: number;
    if (typeof sec === 'number' && Number.isFinite(sec)) { d = lastSec === null ? 0 : sec - lastSec; lastSec = sec; }
    else d = dt;
    const r = stepOxygen(oxy, Math.max(0, d), takeCapsule);
    if (r.used > 0) { lowWarned = false; toast(`🫧 산소 캡슐을 열었어요 (남은 캡슐 ${oxy.capsules}개)`); }
    if (!lowWarned && oxy.value < oxy.max * 0.2 && oxy.capsules <= 0 && !r.out) { lowWarned = true; toast('🫧 산소가 얼마 안 남았어요! 로켓으로 돌아가요'); }
    saveAcc += dt;
    if (r.used > 0 || r.out || saveAcc > 3) { saveAcc = 0; F().oxy = oxy.value; save(); }
    if (r.out) {
      F().oxy = 0;
      toast('숨차! 🫧 산소가 다 떨어졌어요 — 지구로 돌아가요');
      emit({ type: 'oxygen-out', where: 'space' });
      startReturn('oxygen');
    }
  }

  // ── 귀환(로켓 E '지구로!' 또는 산소 0): 로켓이 들썩 → 하얀 페이드 → 지구 발사대 앞 → arrive {to:'earth'}
  let leaving: { t: number; why: string; done: boolean } | null = null;
  let fadeOut = 0;
  const fade = makeFade();
  function startReturn(why: string) {
    if (leaving || game.world !== 'space') return;
    leaving = { t: 0, why, done: false };
    game.player.lock?.('space-return');
    if (why === 'rocket') toast('🚀 지구로 출발!');
    game.audio?.sfx?.('rocket-launch');
    const fl = rocket?.userData.flame as THREE.Object3D | undefined;
    if (fl) fl.visible = true;
  }
  function finishReturn() {
    if (!leaving || leaving.done) return;
    leaving.done = true;
    game.player.unlock?.('space-return', true);
    const at = api.returnSpawn.clone();
    game.setWorld('earth', at);
    emit({ type: 'arrive', to: 'earth' });
    leaving = null;
    fadeOut = 0.9;
  }

  // ── 세계 전환
  let prevTod = ctx.tod;
  game.onWorld((w) => {
    if (w === 'space') {
      const id = pendingPlanet ?? active?.def.id ?? 'moon';
      pendingPlanet = null;
      enterPlanet(id);
      arrivedFix = true;
      const name = game.engine?.todName;
      if (name && name !== 'space') prevTod = name;
      game.engine?.applyTod?.('space');
      if (id === 'moon') {
        startOxygen();
        if (!unlocked('space:moon')) game.econ?.unlock?.('space:moon', 'arrive');
        game.hud?.showRegion?.('토끼달', `산소 ${Math.round(oxy.value / 75 * 10) / 10}시간 · 캡슐 ${oxy.capsules}개`, '#c9b6f2', '#3b3566');
      }
      emit({ type: 'arrive', to: id });
    } else {
      if (active) { F().oxy = oxy.value; save(); exitPlanet(); }
      pendingPlanet = null;
      game.engine?.applyTod?.(prevTod || 'day');
      (game as unknown as { applyCurveForStyle?: () => void }).applyCurveForStyle?.();
    }
  });

  // ── 매 프레임
  let floatT = 0, dayCheck = 0, chestDay = day();
  ctx.onUpdate((t, dt) => {
    // 페이드(지구로 돌아온 뒤에도 마저 걷힌다)
    if (leaving) {
      leaving.t += dt > 0 ? dt : 1 / 60;
      fade(Math.min(1, leaving.t / 1.2));
      if (rocket) {
        const k = Math.max(0, leaving.t - 0.2);
        rocket.position.y = rocketBaseY + k * k * 4;
        rocket.rotation.z = Math.sin(leaving.t * 40) * 0.01;
      }
      if (leaving.t >= 1.3) finishReturn();
    } else if (fadeOut > 0) {
      fadeOut = Math.max(0, fadeOut - (dt > 0 ? dt : 1 / 60));
      fade(fadeOut / 0.9);
    }
    if (game.world !== 'space' || !active) return;
    const def = active.def;
    const pl = game.player;
    // 착륙 직후: 기본 자리(origin 바로 위 = 로켓 속)면 착륙장 가장자리로
    if (arrivedFix) {
      arrivedFix = false;
      if (def.id === 'moon' && Math.hypot(pl.pos.x - O.x, pl.pos.z - O.z) < 3) pl.teleport(api.landingSpawn.x, api.landingSpawn.z, api.landingSpawn.y);
    }
    // 바닥 안전망 + 가장자리 가두기(활성 행성 기준)
    const up = floorRescue(def, pl.pos.x, pl.pos.y, pl.pos.z);
    if (up !== null) pl.teleport(pl.pos.x, pl.pos.z, up);
    const c = clampToPlanet(def, pl.pos.x, pl.pos.z);
    if (c) pl.teleport(c.x, c.z, (planetGround(def, c.x, c.z) ?? pl.pos.y) + 0.1);
    // 공중에서 Space 꾹 = 3초 둥실
    if (pl.mode === 'ground' || pl.mode === 'swim') floatT = 0;
    else if ((pl.mode === 'air' || pl.mode === 'glide') && !pl.mounted && game.input.down('Space') && pl.vel.y < 0.6 && floatT < FLOAT_SEC) {
      floatT += dt;
      // 플레이어 갱신이 다음 프레임에 빼는 만큼 미리 더해 둔다 → 실제로는 FLOAT_FALL 로 살살
      const pre = pl.mode === 'glide' ? 22 : -game.physics.gravity;
      pl.vel.y = Math.max(pl.vel.y, pre * dt - FLOAT_FALL);
    }
    // 작은 행성 곡률
    curveUniforms.uCurveK.value = game.cam.style === 'cozy' ? Math.max(CURVE_K, MOON_CURVE) : MOON_CURVE;
    // 행성 스포너
    for (const s of reg.spawnersOf(def.id)) { try { s.update?.(t, dt); } catch (e) { console.error(`[space spawner ${s.id}]`, e); } }
    if (def.id !== 'moon') return;
    // ── 달
    if (!leaving) tickOxygen(dt);
    sky?.update(t, ctx.camera.position, hour());
    for (const fn of tickers) { try { fn(t, dt); } catch (e) { console.error('[space tick]', e); } }
    terrain.update(t);
    bigWhales.forEach((w, i) => {
      const a = t * (0.02 + i * 0.012) - Math.PI / 2 - 0.22 + i * 2.6, R = 330 + i * 120;
      w.position.set(O.x + Math.cos(a) * R, O.y + 40 + i * 30 + Math.sin(t * 0.2 + i) * 6, O.z + Math.sin(a) * R);
      w.rotation.y = -a;
      w.userData.anim(t + i);
    });
    // 날이 바뀌면: 상자 자리·달꽃·월석 되살리기
    dayCheck += dt;
    if (dayCheck > 1) {
      dayCheck = 0;
      const d = day();
      if (d !== chestDay) { chestDay = d; chests?.rebuild(d); terrain.refresh(); }
    }
  });

  // ── 디버그 훅
  if (typeof window !== 'undefined') {
    const goLocal = (lx: number, lz: number, faceX?: number, faceZ?: number) => {
      if (game.world !== 'space' || !moonActive()) goPlanet('moon');
      game.player.teleport(O.x + lx, O.z + lz, O.y + moonHeight(lx, lz) + 0.1);
      if (faceX !== undefined && faceZ !== undefined) game.cam.yaw = Math.atan2(lx - faceX, lz - faceZ);
      return game.player.pos.clone();
    };
    (window as unknown as { __space?: unknown }).__space = {
      api,
      goPad: () => { if (game.world !== 'space' || !moonActive()) goPlanet('moon'); else game.player.teleport(api.landingSpawn.x, api.landingSpawn.z, api.landingSpawn.y); game.cam.yaw = 0; return game.player.pos.clone(); },
      pond: (i = 0) => { const p = MOON_PLACES.ponds[i] ?? MOON_PLACES.ponds[0]; const pp = ponds[i] ?? ponds[0]; return goLocal(p.x + pp.r + 4, p.z + 3, p.x, p.z); },
      go: (place: keyof typeof MOON_PLACES) => {
        const p = MOON_PLACES[place] as { x: number; z: number } | Array<{ x: number; z: number }>;
        const q = Array.isArray(p) ? p[0] : p;
        return goLocal(q.x, q.z + 16, q.x, q.z);
      },
      oxygen: () => ({ value: oxy.value, max: oxy.max, capsules: oxy.capsules }),
      setOxygen: (v: number) => { oxy.value = Math.max(0, v); return oxy.value; },
      capsules: () => oxy.capsules,
      returnNow: () => { startReturn('debug'); finishReturn(); return game.world; },
      chests: () => chests?.spots().map((s, i) => ({ i, x: O.x + s.x, z: O.z + s.z, open: chests!.isOpen(i) })) ?? [],
      openChest: (i: number) => chests?.open(i) ?? false,
      actors: () => [...actors.values()].map((a) => ({ id: a.id, x: a.pos.x, y: a.pos.y, z: a.pos.z, ok: a.ok ? a.ok() : true })),
      use: (id: string) => { const a = actors.get(id); if (!a) return false; a.use(); return true; },
      planets: () => api.planets(),
      goPlanet: (id: string) => { goPlanet(id); return api.planet; },
      species: () => SPACE_SPECIES.map((s) => s.id),
    };
  }
}

/** 화면 페이드(하얀 → 라벤더). DOM 이 없으면 아무것도 안 한다 */
function makeFade(): (k: number) => void {
  let el: HTMLDivElement | null = null;
  return (k: number) => {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0;background:radial-gradient(circle at 50% 55%,#ffffff 0%,#fff8e8 45%,#e9e0ff 100%);transition:none';
      document.body.appendChild(el);
    }
    el.style.opacity = String(Math.max(0, Math.min(1, k)));
    el.style.display = k > 0.001 ? 'block' : 'none';
  };
}
