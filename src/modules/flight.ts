// 별길 비행(GDD 6.2 P1 · 6.4 · 4.14 엔드): 행성 사이를 오갈 때 20초 별가루 비행 미니게임 · '별길 여행' 패널 · 도감 100% 엔딩 불꽃놀이 · 내 소행성.
//  ① 여행 패널 'startravel'('travel' 은 islanddev 비눗방울 정류장 몫): 토끼달 귀환 로켓 옆 F '다른 행성으로 🪐'(내 소행성 로켓은 E). 다녀온·갈 수 있는 행성 + 다음 행성 하나(별 값) + 내 소행성.
//     고르면 20초 비행(덮개 캔버스): 고리를 지나면 별가루(econ.give m_stardust), 혜성은 피하기 → 도착하면 goPlanet(행성 별 값·해금은 ext.planets.travel 이 낸다).
//     유성의 밤(일요일 21시 ~ 월요일 05시, 또는 meteor 날씨)엔 별가루 ×2. 첫 지구→달 발사는 vehicles 가 바로 setWorld 하므로 건너뛴다(세계가 안 바뀌었을 때만 비행).
//  ② 엔딩: 도감(DEX_TABS 칸 합계) 100% → 불꽃놀이 한 번 → ending 한 번. story(토토 엔딩)가 먼저 ending 을 내면 그걸 같이 쓴다(다시 안 낸다).
//  ③ 내 소행성: space.registerPlanet('asteroid') 하나 — 엔딩 뒤에 열림(space:planet:asteroid). 5×4 = 20칸 가구판(interiors/placement 격자).
//
// game.ext.flight — 주인은 이 모듈 하나:
//   fly(to, o?:{auto?, from?, go?}) → boolean   비행 시작(규칙 검사 포함 — go 를 주면 검사 없이 끝나고 go() 로 간다: vehicles 첫 발사용) · flying() · skip() · open()(여행 패널) · rows()(여행 목록)
//   best() 최고 점수 · ended() 엔딩이 났나 · ending() {dexDone, ended, by} · checkDex(p?:{got,total}) 도감 다시 보기
//   fireworks(title?, sub?) 불꽃놀이만 틀기(story 가 같이 쓰고 싶을 때)
//   asteroid: { unlocked(), unlock(why?), layout(), place(item, slot?) → boolean, take(slot) → boolean, rotate(slot), free(), go() }
// flags.space.flight = {best, flights, ending:{dexDone, ended, by}, launchSeen}  ·  flags.space.asteroid = {unlocked, layout:[{uid,item,gx,gz,rot}]}
// window.__flight: fly(to) · auto(on) · skip() · state() · rows() · open() · finish() · ending() · forceDex(got,total) · fireworks() ·
//                  asteroid() · goAsteroid() · unlockAsteroid() · place(item, slot?) · take(slot) · demo()
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { SPACE_ORIGIN } from '../core/game';
import type { PlanetDef } from '../core/api';
import { DEX_TABS, GOODS } from './economy/data';
import {
  makeCourse, newFlight, stepFlight, runFlight, autopilot, flightReward, flightGrade, courseKey, travelRows, canFly, dexProgress,
  endingOnDex, endingAfterFireworks, endingExternal, endingResume, restoreAsteroid, asteroidPlace, asteroidTake, asteroidRotate, slotOf, slotLocal, freeSlots,
  isFurniture, isMeteorNight, ASTEROID, ASTEROID_ID, ASTEROID_NAME, ASTEROID_SPAWN, ASTEROID_ROCKET, ASTEROID_SLOTS, ASTEROID_ROOM, asteroidHeight,
  type FlightState, type FlightReward, type TravelRow, type EndingState, type PlanetRowIn,
} from './flight/logic';
import { FlightOverlay, FireworksOverlay } from './flight/overlay';
import { buildAsteroidScene, type AsteroidScene } from './flight/asteroid';
import { furnitureModel } from './flight/furniture';
import type { Placed } from './interiors/placement';
import { rotRad } from './interiors/placement';

export const order = 43;

interface FlightFlags { best?: number; flights?: number; ending?: EndingState; launchSeen?: 1 }
interface AsteroidFlags { unlocked?: 1; layout?: Placed[] }

/** 달 귀환 로켓 자리(space: 착륙장 origin 에서 z −1) · F 거리 */
const MOON_ROCKET = { x: 0, z: -1, r: 6.5 };
const ASTEROID_KEY = `space:planet:${ASTEROID_ID}`;
/** E 거리를 [0, 1.2) 로 눌러 담는다(space·planets 와 같은 식) */
const rank = (d: number) => { const x = Math.max(0, d); return (1.2 * x) / (x + 1.2); };

export default function build(ctx: Ctx) {
  const g0 = ctx.game;
  if (!g0) return;
  const game = g0;
  const st = game.state;

  // ── 저장(flags.space 아래 두 칸만 — space 의 다른 칸은 건드리지 않는다)
  const SP = (): Record<string, unknown> => {
    const f = st.flags as Record<string, unknown>;
    if (!f.space || typeof f.space !== 'object') f.space = {};
    return f.space as Record<string, unknown>;
  };
  const F = (): FlightFlags => { const s = SP(); if (!s.flight || typeof s.flight !== 'object') s.flight = {}; return s.flight as FlightFlags; };
  const A = (): AsteroidFlags => { const s = SP(); if (!s.asteroid || typeof s.asteroid !== 'object') s.asteroid = {}; return s.asteroid as AsteroidFlags; };
  const E = (): EndingState => { const f = F(); if (!f.ending || typeof f.ending !== 'object') f.ending = {}; return f.ending; };
  const save = () => st.save();
  const toast = (t: string) => game.ui.toast(t);
  const sfx = (n: string, o?: { vol?: number; pitch?: number }) => { try { game.audio?.sfx?.(n, o); } catch { /* 소리 없음 */ } };
  const day = () => Math.floor(game.env?.day ?? game.econ?.day?.() ?? 0);
  const give = (id: string, n: number, why: string) => {
    const econ = game.econ;
    if (econ && typeof econ.give === 'function') return econ.give(id, n, why);
    st.addItem(id, n);
    return n;
  };
  const nameOf = (id: string) => GOODS[id]?.name ?? st.byGdd(id)?.name ?? id;
  const iconOf = (id: string) => GOODS[id]?.icon ?? '🪑';

  const space = game.space;
  const planetsExt = () => game.ext.planets as {
    list?: () => PlanetRowIn[]; check?: (id: string) => { ok: boolean; cost: number; why?: string }; travel?: (id: string) => boolean;
  } | undefined;
  const here = () => (game.world === 'space' ? (space?.planet ?? 'moon') : 'earth');

  // ───────────── ③ 내 소행성 ─────────────
  let layout: Placed[] = (() => {
    const r = restoreAsteroid(A());
    if (r.dropped.length) {
      // 버려진 줄(범위 밖·겹침)은 가방으로 돌려주고, 깨끗한 배치를 바로 적어 둔다 — 안 그러면 불러올 때마다 또 돌려준다
      for (const d of r.dropped) if (isFurniture(d.item)) st.addItem(d.item, 1);
      A().layout = r.layout.map((p) => ({ uid: p.uid, item: p.item, gx: p.gx, gz: p.gz, rot: p.rot }));
      save();
    }
    return r.layout;
  })();
  const AO = new THREE.Vector3(SPACE_ORIGIN.x + ASTEROID.offset.x, SPACE_ORIGIN.y + ASTEROID.offset.y, SPACE_ORIGIN.z + ASTEROID.offset.z);
  const asteroidUnlocked = () => !!A().unlocked || (game.econ ? game.econ.isUnlocked?.(ASTEROID_KEY) === true : false);
  let scene: AsteroidScene | null = null;
  let regionIn = -1;
  const furnModels = new Map<string, THREE.Object3D>();
  function saveLayout() { A().layout = layout.map((p) => ({ uid: p.uid, item: p.item, gx: p.gx, gz: p.gz, rot: p.rot })); save(); }
  function rebuildFurniture() {
    if (!scene) return;
    const keep = new Set(layout.map((p) => p.uid));
    for (const [uid, m] of furnModels) if (!keep.has(uid)) { scene.furn.remove(m); furnModels.delete(uid); }
    for (const p of layout) {
      let m = furnModels.get(p.uid);
      if (!m) { m = furnitureModel(p.item, nameOf(p.item)).root; furnModels.set(p.uid, m); scene.furn.add(m); }
      const L = slotLocal(p.gz * ASTEROID_ROOM.w + p.gx);
      m.position.set(L.x, asteroidHeight(L.x, L.z) + 0.14, L.z);
      m.rotation.y = rotRad(p.rot);
    }
  }
  const spawnAsteroid = () => new THREE.Vector3(AO.x + ASTEROID_SPAWN.x, AO.y + asteroidHeight(ASTEROID_SPAWN.x, ASTEROID_SPAWN.z) + 0.3, AO.z + ASTEROID_SPAWN.z);
  if (space) {
    const def: PlanetDef & { clampFrac: number } = {
      id: ASTEROID_ID, name: ASTEROID_NAME, origin: AO, radius: ASTEROID.radius, gravity: ASTEROID.gravity, clampFrac: ASTEROID.clampFrac,
      heightAt: asteroidHeight,
      build: () => {
        scene = buildAsteroidScene(game, AO, (k) => ctx.rng(k));
        furnModels.clear();
        rebuildFurniture();
        return scene.root;
      },
      onEnter: () => {
        // 이름표는 조금 뒤에 — 지구에서 바로 오면 hud 의 '우주' 이름표가 같은 프레임에 덮는다
        regionIn = 0.9;
        // 가구판 쪽을 바라보게
        game.cam.yaw = 0;
      },
      onExit: () => { scene?.dispose(); scene = null; furnModels.clear(); },
    };
    space.registerPlanet(def);
  } else console.warn('[flight] game.space 가 없어요 — 내 소행성을 달 수 없어요');

  function unlockAsteroid(why = 'ending') {
    const a = A();
    if (a.unlocked) return false;
    a.unlocked = 1;
    save();
    try { if (game.econ && !game.econ.isUnlocked?.(ASTEROID_KEY)) game.econ.unlock?.(ASTEROID_KEY, why); } catch (e) { console.error('[flight unlock]', e); }
    game.hud.card({ title: '내 소행성이 생겼어요! 🪨', body: '별길 여행에서 언제든 날아갈 수 있어요. 가구 20개로 나만의 작은 별을 꾸며 봐요!', icon: '🪨', color: '#ffd6a8', ms: 6000 });
    sfx('unlock');
    return true;
  }
  function placeFurniture(item: string, slot?: number): boolean {
    if (!isFurniture(item)) { toast('가구만 놓을 수 있어요 🪑'); return false; }
    if (!st.has(item)) { toast(`${nameOf(item)}이(가) 가방에 없어요`); return false; }
    const r = asteroidPlace(layout, item, slot);
    if (!r.ok) {
      toast(r.why === 'full' ? `🪨 소행성이 꽉 찼어요! (${ASTEROID_SLOTS}칸)` : r.why === 'taken' ? '그 칸엔 벌써 가구가 있어요' : '거기엔 못 놓아요');
      return false;
    }
    layout = r.layout;
    st.addItem(item, -1);
    saveLayout();
    rebuildFurniture();
    st.emit({ type: 'place', item, where: 'asteroid' });
    sfx('craft');
    toast(`${iconOf(item)} ${nameOf(item)}을(를) 놓았어요! (${layout.length}/${ASTEROID_SLOTS})`);
    return true;
  }
  function takeFurniture(slot: number): boolean {
    const p = slotOf(layout, slot);
    if (!p) return false;
    const n = give(p.item, 1, 'asteroid');
    if (n <= 0) return false; // 가방이 꽉 찼다(economy 가 알려 준다)
    layout = asteroidTake(layout, slot).layout;
    saveLayout();
    rebuildFurniture();
    sfx('pick');
    toast(`🎒 ${nameOf(p.item)}을(를) 가방에 넣었어요`);
    return true;
  }
  function rotateFurniture(slot: number) {
    if (!slotOf(layout, slot)) return;
    layout = asteroidRotate(layout, slot);
    saveLayout();
    rebuildFurniture();
    sfx('ui-click');
  }

  // ───────────── ① 여행 목록 · 비행 ─────────────
  const moonVisited = () => !!(SP().visited) || (game.econ?.isUnlocked?.('space:moon') ?? false);
  function rows(): TravelRow[] {
    let list: PlanetRowIn[] | null = null;
    try { list = planetsExt()?.list?.() ?? null; } catch (e) { console.error('[flight planets.list]', e); }
    return travelRows(list, { here: here(), asteroid: asteroidUnlocked(), moonVisited: moonVisited() });
  }
  const destOf = (id: string) => {
    const r = rows().find((x) => x.id === id);
    if (r) return { name: r.name, icon: r.icon, color: r.color };
    if (id === 'earth') return { name: '지구', icon: '🌏', color: '#8fd3ff' };
    return { name: id, icon: '🪐', color: '#c9b6f2' };
  };

  interface Flight {
    to: string;
    from: string;
    s: FlightState;
    auto: boolean;
    /** 'fly' → 'result'(카드) → 'white'(하얗게) → 'arrive'(걷힘) */
    stage: 'fly' | 'result' | 'white' | 'arrive';
    stageT: number;
    reward: (FlightReward & { grade: string; line: string; mult: number }) | null;
    /** 도착 처리(goPlanet) 중 — 이때 세계가 바뀌는 건 우리가 바꾼 것 */
    arriving: boolean;
    /** 실제로 갈 곳으로 보내기 */
    go: () => void;
  }
  let flight: Flight | null = null;
  let autoAll = false;
  const overlay = new FlightOverlay(ctx.rng('flight:overlay'));
  const meteorMult = () => (isMeteorNight(game.env) ? 2 : 1);

  function sendTo(to: string) {
    if (!space) return;
    if (to === 'moon') { space.goPlanet('moon'); return; }
    if (to === ASTEROID_ID) { space.goPlanet(ASTEROID_ID, spawnAsteroid()); return; }
    const pe = planetsExt();
    if (pe?.travel) {
      if (pe.travel(to)) return;
      // 날아오는 사이 별이 줄었거나 일식이 끝났다(까닭은 planets.travel 이 토스트로 알려 준다).
      // 지구에서 떠났으면 그냥 돌아가지 말고 토끼달에 내려 준다 — 별가루는 그대로
      if (game.world !== 'space') { toast('🌙 별길이 닫혀서 토끼달에 먼저 내렸어요'); space.goPlanet('moon'); }
      else toast('앗, 별길이 닫혔어요! 다음에 다시 가요');
      return;
    }
    space.goPlanet(to);
  }

  /** 비행 시작. 규칙: 여기면 안 감 · 잠긴 곳 · 별이 모자라면 안 감 · 내 소행성은 엔딩 뒤 */
  function fly(to: string, o: { auto?: boolean; from?: string; go?: () => void } = {}): boolean {
    if (flight) { toast('벌써 날고 있어요! 🚀'); return false; }
    if (fireworks.running) return false;
    if (!o.go) {
      if (!space) { toast('우주가 아직 없어요'); return false; }
      const r = rows().find((x) => x.id === to);
      const c = canFly(r, game.econ?.stars ?? 0);
      if (!c.ok) {
        if (c.why === 'here') toast('여기예요! 🌟');
        else if (c.why === 'stars') toast(`별 ★${r?.cost ?? 0}개가 필요해요`);
        else if (r && r.next) toast(`${r.icon} ${r.text}`);
        else toast(to === ASTEROID_ID ? '🪨 내 소행성은 도감을 다 채우면 생겨요!' : '아직 못 가는 곳이에요');
        return false;
      }
    }
    const from = o.from ?? here();
    // 산소가 얼마 안 남았으면 미리 알려 준다(비행 중에도 산소가 줄어 도중에 지구로 돌아갈 수 있다)
    const ox = game.world === 'earth' ? null : space?.oxygen;
    if (ox && ox.max > 0 && ox.value < 30) toast('🫧 산소가 얼마 안 남았어요! 가는 길에 지구로 돌아갈 수도 있어요');
    const f = F();
    const course = makeCourse(courseKey(from, to, day(), f.flights ?? 0));
    flight = { to, from, s: newFlight(course), auto: !!o.auto || autoAll, stage: 'fly', stageT: 0, reward: null, arriving: false, go: o.go ?? (() => sendTo(to)) };
    game.hud.close();
    game.player.lock('flight');
    overlay.show();
    sfx('rocket-countdown', { vol: 0.6 });
    st.emit({ type: 'ui-open', kind: 'flight' });
    return true;
  }
  function grant(fl: Flight) {
    if (fl.reward) return;
    const mult = meteorMult();
    const r = flightReward(fl.s, mult);
    const gr = flightGrade(r);
    fl.reward = { ...r, ...gr, mult };
    const f = F();
    f.flights = (f.flights ?? 0) + 1;
    const newBest = r.score > (f.best ?? 0);
    if (newBest) f.best = r.score;
    save();
    if (r.dust > 0) {
      const n = give('m_stardust', r.dust, 'flight');
      if (n > 0) st.emit({ type: 'harvest', kind: 'stardust', item: 'm_stardust', n, island: 'space' });
    }
    sfx(r.perfect ? 'catch-5' : 'star');
    if (newBest && (f.flights ?? 0) > 1) toast(`🏆 별길 최고 기록! ${r.score}점`);
  }
  /** 남은 비행을 건너뛴다(지금까지 모은 것만) */
  function skip() {
    const fl = flight;
    if (!fl || fl.stage !== 'fly') return false;
    fl.s.phase = 'done';
    return true;
  }
  function endFlight() {
    const fl = flight;
    if (!fl) return;
    flight = null;
    overlay.hide();
    game.player.unlock('flight', true);
    st.emit({ type: 'ui-close', kind: 'flight' });
  }
  function tickFlight(dt: number, t: number) {
    const fl = flight;
    if (!fl) return;
    fl.stageT += dt;
    const inp = game.input;
    if (fl.stage === 'fly') {
      if (inp.hit('Escape') && fl.s.clock > 0.3) skip();
      const s = fl.s;
      stepFlight(s, fl.auto ? autopilot : () => { const a = inp.axis(); return { x: a.x, y: a.y }; }, dt);
      overlay.feed(s);
      for (const e of s.events) {
        if (e.kind === 'comet') sfx('stung', { vol: 0.6 });
        else if (e.kind === 'gold') sfx('shiny', { vol: 0.6 });
        else if (e.kind === 'ring') sfx('coin', { vol: 0.5, pitch: 1 + Math.min(0.6, s.combo * 0.04) });
      }
      if (s.phase === 'done') {
        grant(fl);
        fl.stage = 'result'; fl.stageT = 0;
        sfx('arrive', { vol: 0.7 });
      }
    } else if (fl.stage === 'result') {
      // 결과 카드 2.4초(아무 키나 0.8초 뒤부터 넘기기)
      if (fl.stageT > 2.4 || (fl.stageT > 0.8 && (inp.hit('KeyE') || inp.hit('Space') || inp.hit('Enter') || inp.hit('Escape')))) { fl.stage = 'white'; fl.stageT = 0; }
    } else if (fl.stage === 'white') {
      if (fl.stageT >= 0.5) {
        fl.stage = 'arrive'; fl.stageT = 0;
        fl.arriving = true;
        try { fl.go(); } catch (e) { console.error('[flight arrive]', e); }
        fl.arriving = false;
      }
    } else if (fl.stage === 'arrive') {
      if (fl.stageT >= 0.8) { endFlight(); return; }
    }
    const white = fl.stage === 'white' ? Math.min(1, fl.stageT / 0.5) : fl.stage === 'arrive' ? 1 - fl.stageT / 0.8 : 0;
    const dust = fl.reward ? fl.reward.dust : flightReward(fl.s, meteorMult()).dust;
    // 걷히는 동안(arrive)엔 하얀 덮기만 — 뒤에 새 행성이 보인다
    overlay.draw(fl.s, {
      dest: destOf(fl.to), dust, time: t, reward: fl.stage === 'result' || fl.stage === 'white' ? fl.reward ?? undefined : undefined,
      white: Math.max(0, white), alpha: fl.stage === 'arrive' ? 0 : 1,
    });
  }

  // ───────────── ② 엔딩 ─────────────
  const fireworks = new FireworksOverlay(ctx.rng('flight:fireworks'));
  fireworks.onBurst = (i) => sfx('balloon-pop', { vol: 0.5, pitch: 0.8 + ((i * 37) % 9) / 10 });
  let fireworksFromDex = false;
  let selfEmit = false;
  let pendingFireworks = false;
  let lateCard = -1;
  // 첫 지구→달 발사: vehicles 가 곧바로 세계를 바꾸면 건너뛰고, 세계가 그대로면(다른 발사 경로) 비행으로 달까지
  let launchWatch = -1;
  function playFireworks(title = '✨ 도감 100% 완성! ✨', sub = '모든 친구를 다 만났어요! 정말정말 고마워요~', fromDex = false) {
    if (fireworks.running) return false;
    fireworksFromDex = fromDex;
    game.hud.close();
    game.player.lock('flight-ending');
    fireworks.start(title, sub);
    sfx('achievement');
    return true;
  }
  function fireworksDone() {
    game.player.unlock('flight-ending', true);
    sfx('catch-5', { vol: 0.8 });
    if (fireworksFromDex) {
      fireworksFromDex = false;
      if (endingAfterFireworks(E())) {
        save();
        selfEmit = true;
        try { st.emit({ type: 'ending' }); } finally { selfEmit = false; }
      }
      unlockAsteroid('ending');
    }
  }
  function checkDex(p?: { got: number; total: number }) {
    const prog = p ?? dexProgress(DEX_TABS, st.species.values(), (id) => !!st.dex[id]);
    if (endingOnDex(E(), prog.got, prog.total) === 'fireworks') {
      save();
      pendingFireworks = true;
    }
    return prog;
  }
  let dexDirty = true;
  st.on((e) => {
    if (e.type === 'collect' || e.type === 'register') dexDirty = true;
    else if (e.type === 'ending' && !selfEmit) {
      // story 의 토토 엔딩 — 같이 쓴다(다시 안 낸다). 토토 연출이 끝날 즈음 소행성 카드
      if (endingExternal(E(), 'story')) { save(); lateCard = 6; }
    } else if (e.type === 'launch' && (e as { to?: string }).to === 'moon' && !F().launchSeen) {
      F().launchSeen = 1; save();
      launchWatch = 2;
    }
  });

  // ───────────── E·F 행동 ─────────────
  const openTravel = () => { if (!flight) game.hud.open('startravel'); };
  game.addProvider('flight-moon', (pl) => {
    if (game.world !== 'space' || !space || space.planet !== 'moon' || flight || pl.mounted) return null;
    const O = SPACE_ORIGIN;
    const d = Math.hypot(pl.pos.x - (O.x + MOON_ROCKET.x), pl.pos.z - (O.z + MOON_ROCKET.z));
    if (d > MOON_ROCKET.r) return null;
    return { id: 'flight:moon-travel', key: 'KeyF', label: '다른 행성으로 🪐', dist: rank(d), use: openTravel };
  });
  game.addProvider('flight-asteroid', (pl) => {
    if (game.world !== 'space' || !space || space.planet !== ASTEROID_ID || !scene || flight || pl.mounted) return null;
    const lx = pl.pos.x - AO.x, lz = pl.pos.z - AO.z;
    let best: { id: string; label: string; d: number; use: () => void } | null = null;
    const dr = Math.hypot(lx - ASTEROID_ROCKET.x, lz - ASTEROID_ROCKET.z) - 1.2;
    if (dr < 3.2) best = { id: 'flight:asteroid-rocket', label: '별길 여행 🚀', d: Math.max(0, dr), use: openTravel };
    for (let i = 0; i < ASTEROID_SLOTS; i++) {
      const L = slotLocal(i);
      const d = Math.hypot(lx - L.x, lz - L.z);
      if (d > 1.7 || (best && d >= best.d)) continue;
      const p = slotOf(layout, i);
      const slot = i;
      best = { id: `flight:slot:${i}`, label: p ? `${nameOf(p.item)} 꾸미기 ✨` : '가구 놓기 🪑', d, use: () => game.hud.open('asteroid', undefined, slot) };
    }
    if (!best) return null;
    return { id: best.id, label: best.label, dist: rank(best.d), use: best.use };
  });

  // ───────────── 패널 ─────────────
  /** h.button 은 맨 단추라 HUD 의 통통한 단추 옷(.btn)을 입힌다 */
  const cute = (b: HTMLElement, extra = '') => { b.classList.add('btn'); if (extra) b.classList.add(extra); return b; };
  game.hud.registerPanel({
    kind: 'startravel', title: '별길 여행', color: '#a99bff', icon: '🚀',
    meta: () => `★${game.econ?.stars ?? 0}`,
    render: (body, pctx) => {
      const h = pctx.h;
      body.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;color:#4a3b2a';
      const head = document.createElement('div');
      head.style.cssText = 'font-size:14px;opacity:.88;line-height:1.35';
      const best = F().best ?? 0;
      head.innerHTML = `별길을 따라 20초 비행! 반짝 고리를 지나면 별가루가 모여요 ✨ 혜성은 피해요!<br>내 별 ★${h.fmt(game.econ?.stars ?? 0)}${best ? ` · 최고 기록 ${h.fmt(best)}점` : ''}${meteorMult() > 1 ? ' · 🌠 유성의 밤: 별가루 ×2!' : ''}`;
      wrap.appendChild(head);
      for (const r of rows()) {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:14px;background:#fff8e8;border:3px solid ${r.color};${r.ok ? '' : 'opacity:.7'}`;
        const ic = document.createElement('div');
        ic.style.cssText = `width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;background:${r.color}`;
        ic.textContent = r.icon;
        const txt = document.createElement('div');
        txt.style.cssText = 'flex:1;line-height:1.25';
        const tag = r.next ? ' <span style="font-size:12px">🔒 다음 목표</span>' : r.visited ? ' <span style="font-size:12px">✔ 다녀옴</span>' : '';
        // 잠긴 '다음 목표' 줄은 r.text 가 이미 값을 말한다 — 두 번 쓰지 않기
        const costTxt = r.cost > 0 && !r.next && !r.text.includes(`★${r.cost}`) ? ` · 별 ★${r.cost}` : '';
        txt.innerHTML = `<b>${h.esc(r.name)}</b>${tag}<br><span style="font-size:12px">${h.esc(r.text)}${h.esc(costTxt)}</span>`;
        row.append(ic, txt);
        if (r.here) {
          const t = document.createElement('span'); t.textContent = '여기예요!'; t.style.cssText = 'font-size:13px';
          row.appendChild(t);
        } else if (r.ok) row.appendChild(cute(h.button(r.cost > 0 ? `★${r.cost} 날아가기` : '날아가기 🚀', () => { pctx.close(); fly(r.id); }), r.cost > 0 ? 'gold' : ''));
        wrap.appendChild(row);
      }
      if (game.world === 'space') {
        const back = cute(h.button('🌏 지구로 돌아가기', () => { pctx.close(); (space as unknown as { returnToEarth?: (w?: string) => void } | null)?.returnToEarth?.('rocket'); }), 'big');
        back.style.alignSelf = 'center';
        wrap.appendChild(back);
      }
      body.appendChild(wrap);
    },
  });

  game.hud.registerPanel({
    kind: 'asteroid', title: ASTEROID_NAME, color: '#ffd6a8', icon: '🪨',
    meta: () => `${layout.length}/${ASTEROID_SLOTS}칸`,
    render: (body, pctx) => {
      const h = pctx.h;
      body.innerHTML = '';
      const sel = pctx.sel !== null ? Number(pctx.sel) : typeof pctx.arg === 'number' ? (pctx.arg as number) : freeSlots(layout)[0] ?? 0;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;color:#4a3b2a';
      const head = document.createElement('div');
      head.style.cssText = 'font-size:14px;opacity:.88';
      head.textContent = `칸을 고르고 가방 속 가구를 놓아요. 가구는 ${ASTEROID_SLOTS}개까지! (${layout.length}/${ASTEROID_SLOTS})`;
      wrap.appendChild(head);
      // 5 × 4 칸(위가 소행성 안쪽 — 로켓에서 볼 때 그대로)
      const grid = document.createElement('div');
      grid.style.cssText = `display:grid;grid-template-columns:repeat(${ASTEROID_ROOM.w},1fr);gap:6px`;
      for (let i = 0; i < ASTEROID_SLOTS; i++) {
        const p = slotOf(layout, i);
        const cell = document.createElement('button');
        cell.style.cssText = `height:54px;border-radius:14px;border:3px solid ${i === sel ? '#ff9fb8' : '#f0e2c8'};background:${p ? '#fff1dc' : '#fffdf6'};font-size:24px;cursor:pointer;font-family:inherit;color:#4a3b2a`;
        cell.innerHTML = p ? h.ico(p.item) || iconOf(p.item) : '<span style="opacity:.35">＋</span>';
        cell.title = p ? nameOf(p.item) : `${i + 1}번 칸`;
        cell.onclick = () => pctx.setSel(String(i));
        grid.appendChild(cell);
      }
      wrap.appendChild(grid);
      const box = document.createElement('div');
      box.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center';
      const p = slotOf(layout, sel);
      if (p) {
        const t = document.createElement('div');
        t.style.cssText = 'width:100%;font-size:15px';
        t.innerHTML = `<b>${h.esc(nameOf(p.item))}</b> · ${sel + 1}번 칸`;
        box.appendChild(t);
        box.appendChild(cute(h.button('↻ 돌리기', () => { rotateFurniture(sel); pctx.rerender(); })));
        box.appendChild(cute(h.button('🎒 가방에 넣기', () => { takeFurniture(sel); pctx.rerender(); })));
      } else {
        const own = Object.entries(st.bag).filter(([id, n]) => isFurniture(id) && n > 0).sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0]), 'ko'));
        const t = document.createElement('div');
        t.style.cssText = 'width:100%;font-size:15px';
        t.textContent = layout.length >= ASTEROID_SLOTS ? '🪨 소행성이 꽉 찼어요! 하나를 가방에 넣으면 또 놓을 수 있어요' : own.length ? `${sel + 1}번 칸에 놓을 가구를 골라요` : '가방에 가구가 없어요! 상점·제작·캡슐에서 가구를 모아 와요 🪑';
        box.appendChild(t);
        if (layout.length < ASTEROID_SLOTS) for (const [id, n] of own) box.appendChild(cute(h.button(`${h.ico(id) || iconOf(id)} ${h.esc(nameOf(id))} ×${n}`, () => { placeFurniture(id, sel); pctx.rerender(); })));
      }
      wrap.appendChild(box);
      body.appendChild(wrap);
    },
  });

  // ───────────── 세계 전환 ─────────────
  game.onWorld(() => {
    // 비행 중 세계가 바뀌었는데 우리가 바꾼 게 아니면(산소 0 귀환 등) 조용히 접는다
    if (flight && !flight.arriving) { grant(flight); endFlight(); }
  });

  // ───────────── 매 프레임 ─────────────
  let dexT = 0;
  let resumed = false;
  // game.onUpdate(게임 갱신 안, inp.endFrame 전)에 단다 — ctx.onUpdate(엔진 훅)는 endFrame 뒤라 input.hit 이 늘 false
  game.onUpdate((t, dt0) => {
    const dt = dt0 > 0 ? dt0 : 1 / 60;
    // 불러온 저장이 엔딩 한가운데서 멈췄으면 이어 간다(불꽃놀이 도중 저장·새로고침)
    if (!resumed) {
      resumed = true;
      const r = endingResume(E(), !!A().unlocked);
      if (r === 'fireworks') pendingFireworks = true;
      else if (r === 'unlock') unlockAsteroid(E().by === 'dex' ? 'ending' : E().by ?? 'ending');
    }
    if (flight) tickFlight(dt, t);
    if (fireworks.running) {
      if (game.input.hit('Escape') && fireworks.t > 2) fireworks.stop();
      if (!fireworks.update(dt)) fireworksDone();
    }
    // 첫 발사 지켜보기(2 프레임)
    if (launchWatch >= 0) {
      if (game.world === 'space') launchWatch = -1; // vehicles 가 세계를 바꿨다 → 건너뛰기
      else if (--launchWatch < 0 && space && !flight) fly('moon', { from: 'earth', go: () => space.goPlanet('moon') });
    }
    // 도감 다시 보기(바뀌었을 때, 1초에 한 번)
    dexT += dt;
    if (dexDirty && dexT > 1) { dexT = 0; dexDirty = false; checkDex(); }
    if (pendingFireworks && !flight && !fireworks.running && game.ready !== false) {
      pendingFireworks = false;
      playFireworks(undefined, undefined, true);
    }
    if (regionIn > 0) {
      regionIn -= dt;
      if (regionIn <= 0 && game.world === 'space' && space?.planet === ASTEROID_ID) game.hud.showRegion(ASTEROID_NAME, `가구 ${layout.length}/${ASTEROID_SLOTS}칸 · 마음대로 꾸며요!`, '#ffd6a8', '#5a3a78');
    }
    if (lateCard > 0) { lateCard -= dt; if (lateCard <= 0) { lateCard = -1; unlockAsteroid('story'); } }
    if (scene && game.world === 'space' && space?.planet === ASTEROID_ID) scene.update(t, (i) => !slotOf(layout, i), ctx.camera.position);
  });

  // ───────────── ext.flight ─────────────
  const ext = {
    fly: (to: string, o?: { auto?: boolean; from?: string; go?: () => void }) => fly(to, o),
    flying: () => !!flight,
    skip: () => skip(),
    open: () => openTravel(),
    rows: () => rows(),
    best: () => F().best ?? 0,
    ended: () => !!E().ended,
    ending: () => ({ ...E() }),
    checkDex: (p?: { got: number; total: number }) => checkDex(p),
    fireworks: (title?: string, sub?: string) => playFireworks(title, sub, false),
    asteroid: {
      unlocked: () => asteroidUnlocked(),
      unlock: (why?: string) => unlockAsteroid(why),
      layout: () => layout.map((p) => ({ ...p })),
      place: (item: string, slot?: number) => placeFurniture(item, slot),
      take: (slot: number) => takeFurniture(slot),
      rotate: (slot: number) => rotateFurniture(slot),
      free: () => freeSlots(layout),
      go: () => { if (!asteroidUnlocked() || !space) return false; space.goPlanet(ASTEROID_ID, spawnAsteroid()); return true; },
    },
  };
  game.ext.flight = ext;

  // ───────────── 디버그 훅 ─────────────
  if (typeof window !== 'undefined') {
    (window as unknown as { __flight?: unknown }).__flight = {
      ext,
      fly: (to: string, auto = false) => fly(to, { auto }),
      /** 모든 비행을 자동 조종으로(그리고 지금 비행도) */
      auto: (on = true) => { autoAll = on; if (flight) flight.auto = on; return on; },
      skip: () => skip(),
      /** 지금 비행을 자동 조종으로 끝까지(즉시) */
      finish: () => { if (!flight) return null; runFlight(flight.s, autopilot); return flightReward(flight.s, meteorMult()); },
      state: () => (flight ? {
        to: flight.to, stage: flight.stage, t: flight.s.t, phase: flight.s.phase, score: flight.s.score, rings: flight.s.rings, golds: flight.s.golds,
        hits: flight.s.hits, combo: flight.s.combo, x: flight.s.x, y: flight.s.y, course: { rings: flight.s.course.rings, golds: flight.s.course.golds, comets: flight.s.course.comets },
        reward: flight.reward,
      } : null),
      flags: () => JSON.parse(JSON.stringify({ flight: F(), asteroid: A() })),
      rows: () => rows(),
      open: () => { game.hud.open('startravel'); return game.hud.isOpen('startravel'); },
      ending: () => ({ ...E() }),
      forceDex: (got: number, total: number) => checkDex({ got, total }),
      dex: () => dexProgress(DEX_TABS, st.species.values(), (id) => !!st.dex[id]),
      fireworks: () => playFireworks(),
      asteroid: () => ({ unlocked: asteroidUnlocked(), layout: layout.map((p) => ({ ...p })), free: freeSlots(layout).length }),
      unlockAsteroid: () => { unlockAsteroid('debug'); return asteroidUnlocked(); },
      goAsteroid: () => { if (!space) return false; if (!A().unlocked) unlockAsteroid('debug'); space.goPlanet(ASTEROID_ID, spawnAsteroid()); return true; },
      place: (item: string, slot?: number) => { if (!st.has(item)) st.addItem(item, 1); return placeFurniture(item, slot); },
      take: (slot: number) => takeFurniture(slot),
      /** 스크린샷용: 가구 몇 개를 받아 예쁘게 놓기 */
      demo: () => {
        const items = Object.keys(GOODS).filter(isFurniture).slice(0, 14);
        let n = 0;
        for (const [i, it] of items.entries()) { if (slotOf(layout, i)) continue; st.addItem(it, 1); if (placeFurniture(it, i)) n++; }
        return n;
      },
    };
  }
}
