// interiors — 실내(GDD 4.12 꾸미기 · 3.12 박물관 내부 P1 · 5.6 박물관). 먼 지구 좌표(x = -20000 + i·300, y = 600)에 방을 두고
// 문(E)으로 오간다. 들어가면 청크는 문 자리(game.focusOverride)에 머물고, 방 상자 땅 공급자 + 충돌체, 아늑 카메라, 실내 조명, 가까운 안개.
//  ① 내 집: 집 단계(1~4)마다 넓어지는 방 · H 꾸미기 모드(0.5 m 격자 · R 돌리기 · E 놓기/집기 · Z/X 고르기 · F 안의 친구) ·
//     가구 모델 전부(수조 속 물고기 · 곤충 케이지 · 반딧불 랜턴 · 피규어 · 부화기 …) · 벽지·바닥 · 보관함 창 'storage' · 진열장 · 집 점수.
//  ② 박물관: 로비 + 동 5개(수족관 · 해저 · 곤충 · 화석 골격 · 천문) — 기증 목록으로 채우고, 기증 5초 뒤 느릿 관장 해설 말풍선.
//
// game.ext.interiors (주인: interiors) = {
//   register(def:{id, origin, build(), floorAt(x,z), spawn, exitTo, door?, colliders?(), cam?, lightAt?, name?, sub?, onEnter?, onExit?, update?}) → 해제 함수
//   enter(id) → boolean · exit() → boolean · current() → id | null · onChange(fn(id, prev)) → 해제
//   origin(i) → {x,y,z}  — 실내 자리(0 집 · 1 박물관 · 2~ 비밀 동굴 등 다른 모듈 몫)
//   house: { layout(), place(item, gx, gz, rot?, arg?), pickUp(uid), placing(on?), setWall(id), setFloor(id), score(), display(id, on) → boolean,
//            displayed() (진열장 가방 키 — econ.displayed 가 주인), room() }
//   museum: { exhibits(), speak(id), refresh() } · score() → 집 점수(숫자)
// }
// 순수 격자 도우미는 interiors/placement.ts(다른 모듈이 read-only import 해도 된다 — 계약 v2 0장 예외).
// 내보내는 이벤트: interior{id, inside} · place{item, where:'house'} · house-score{score, stars} · curator{id, line}
// flags.interiors = { v, layout[{uid,item,gx,gz,rot,arg?}], wall, floor, score, stars, display[] (econ.display 이전에만), chest{} (econ.storage 이전·꽉 찼을 때 임시 보관) }
// 디버그: window.__interiors = { enter(id), exit(), current(), state(), place(item,gx,gz,rot?), pick(uid), deco(on?), wall(id), floor(id),
//   score(), museum(), speak(id), demo() (가구 몇 개 주고 예쁘게 놓기), give(id,n), hub }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { InteriorHub, type InteriorDef } from './interiors/infra';
import { HouseInterior, readFlags, displayKeys } from './interiors/house';
import { MuseumInterior } from './interiors/museum';
import { storagePanel } from './interiors/panel';
import { interiorOrigin, SLOT, STAGE_NAME, furnitureDef } from './interiors/logic';
import { MUSEUM_D } from './interiors/rooms';
import type { Rot } from './interiors/placement';
import { GOODS } from './economy/data';

export const order = 14;

const V = (o: { x: number; y: number; z: number }) => new THREE.Vector3(o.x, o.y, o.z);

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const st = game.state;
  readFlags(game);
  const hub = new InteriorHub(game);
  const house = new HouseInterior(game, V(interiorOrigin(SLOT.house)));
  const museum = new MuseumInterior(game, V(interiorOrigin(SLOT.museum)));
  const inside = (id: string) => hub.current() === id;
  const onEarth = () => game.world === 'earth';

  // ───────────── ① 내 집 ─────────────
  const houseDef: InteriorDef = {
    id: 'house',
    get name() { return '🏠 우리 집'; },
    get sub() { return `${STAGE_NAME[Math.max(0, house.stage)] ?? ''} · H 로 꾸미기`; },
    color: '#ffb37a',
    origin: house.origin,
    build: () => { house.syncStage(true); return house.root; },
    floorAt: (x, z) => house.floorAt(x, z),
    spawn: () => house.spawn(),
    exitTo: () => house.exitSpot(),
    door: () => house.doorOutside(),
    colliders: () => { house.syncStage(); return house.colliders(); },
    get cam() { return { dist: 9.5 + house.W * 0.35, pitch: 0.86, yaw: 0 }; },
    lightAt: () => house.origin.clone().add(new THREE.Vector3(0, 2.5, 0.4)),
    onEnter: () => {
      house.inside = true;
      house.rebuildBodies();
      if (!house.layout.length) game.ui.toast('H 를 누르면 가구를 놓을 수 있어요 🛠️');
    },
    onExit: () => { house.setPlacing(false); house.inside = false; house.clearBodies(); house.hideBar(); },
    update: (t, dt) => house.update(t, dt),
  };
  hub.register(houseDef);

  // ───────────── ② 박물관 ─────────────
  const museumDef: InteriorDef = {
    id: 'museum',
    name: '🏛️ 말랑 박물관',
    sub: '느릿 관장과 다섯 전시관',
    color: '#c59bff',
    origin: museum.origin,
    build: () => museum.root,
    floorAt: (x, z) => museum.floorAt(x, z),
    spawn: () => museum.spawn(),
    exitTo: () => MuseumInterior.doorOf(game, 7.4),
    door: () => MuseumInterior.doorOf(game, 5.0),
    colliders: () => museum.colliders(),
    cam: { dist: 16, pitch: 0.66, yaw: 0 },
    // 실내 등은 플레이어가 있는 방 위로
    lightAt: () => new THREE.Vector3(game.player.pos.x, museum.origin.y + 3.0, museum.origin.z + 0.5),
    onEnter: () => museum.onEnter(),
    onExit: () => museum.onExit(),
  };
  hub.register(museumDef);

  // ───────────── 문(바깥) ─────────────
  game.addInteractable({
    id: 'interiors:house-door', radius: 2.4, label: '집에 들어가기 🏠',
    position: () => house.doorOutside(),
    enabled: () => onEarth() && !hub.current() && !!game.ext.village,
    onUse: () => hub.enter('house'),
  });
  game.addInteractable({
    id: 'interiors:museum-door', radius: 2.1, label: '박물관 안 구경하기 🏛️',
    position: () => MuseumInterior.doorOf(game, 5.0),
    enabled: () => onEarth() && !hub.current(),
    onUse: () => hub.enter('museum'),
  });
  // ── 안쪽(집)
  const houseLocal = (x: number, z: number) => house.origin.clone().add(new THREE.Vector3(x, 0, z));
  game.addInteractable({
    id: 'interiors:house-exit', radius: 1.4, label: '밖으로 나가기 🚪',
    position: () => houseLocal(0, house.D / 2 - 0.5),
    enabled: () => inside('house') && !house.placing,
    onUse: () => hub.exit(),
  });
  game.addInteractable({
    id: 'interiors:house-chest', radius: 1.7, label: '보관함 열기 🧰',
    position: () => houseLocal(house.W / 2 - 0.75, -house.D / 2 + 1.1),
    enabled: () => inside('house') && !house.placing,
    onUse: () => game.hud.open('storage', 'chest'),
  });
  game.addInteractable({
    id: 'interiors:house-display', radius: 1.8, label: '진열장 꾸미기 🏺',
    position: () => houseLocal(-house.W / 2 + 1.0, -house.D / 2 + 1.1),
    enabled: () => inside('house') && !house.placing,
    onUse: () => game.hud.open('storage', 'display'),
  });
  // 꾸미기 모드: E 놓기·집기(가장 가까운 것으로 늘 뽑히게 dist 0) · F 안의 친구 바꾸기
  game.addProvider('interiors:place', () => {
    if (!inside('house') || !house.placing) return null;
    const tg = house.target();
    const label = tg.kind === 'pick' ? `${nameOfItem(tg.p.item)} 집기` : tg.kind === 'place' ? `${nameOfItem(tg.cand.item)} 놓기${tg.ok ? '' : ' (자리가 없어요)'}` : '가방에 가구가 없어요';
    return { id: 'interiors:place', label, dist: 0, use: () => house.useTarget() };
  });
  game.addProvider('interiors:place-alt', () => {
    if (!inside('house') || !house.placing) return null;
    const h = house.holderUnderCursor();
    if (!h) return null;
    return { id: 'interiors:place-alt', key: 'KeyF', priority: 50, label: '안의 친구 바꾸기', dist: 0, use: () => { house.cycleArg(h.uid); } };
  });
  // ── 안쪽(박물관)
  const museumLocal = (x: number, z: number) => museum.origin.clone().add(new THREE.Vector3(x, 0, z));
  game.addInteractable({
    id: 'interiors:museum-exit', radius: 1.6, label: '박물관 밖으로 🚪',
    position: () => museumLocal(museum.cx('lobby'), MUSEUM_D / 2 - 0.6),
    enabled: () => inside('museum'),
    onUse: () => hub.exit(),
  });
  game.addInteractable({
    id: 'interiors:museum-curator', radius: 2.4, label: '느릿 관장에게 기증하기 🐢',
    position: () => museum.curatorPos(),
    enabled: () => inside('museum'),
    onUse: () => st.emit({ type: 'open-museum' }),
  });

  // ───────────── 창·단축키 ─────────────
  game.hud.registerPanel(storagePanel(game, () => house));
  game.hud.registerHotkey({
    id: 'interiors:deco', code: 'KeyH', label: '꾸미기',
    run: () => {
      if (!inside('house')) { game.ui.toast('집 안에서 H 를 누르면 꾸밀 수 있어요 🏠'); return; }
      house.setPlacing(!house.placing);
    },
  });

  // ───────────── 이벤트 ─────────────
  st.on((e) => {
    if (e.type === 'donate' && typeof e.id === 'string') museum.queueComment(e.id);
    else if (e.type === 'skeleton') museum.markDirty();
    else if (e.type === 'unlock' && typeof e.key === 'string') {
      if (e.key.startsWith('wing:')) { museum.markDirty(); if (inside('museum')) reenter('museum'); }
      if (e.key.startsWith('house:')) pendingStage = true;
    }
  });
  let pendingStage = false;
  const reenter = (id: string) => { hub.exit({ silent: true }); hub.enter(id); };
  game.onWorld((w) => { if (w !== 'earth' && hub.current()) hub.exit({ teleport: false, keepWorldVis: true }); });

  let stageCheck = 0;
  game.onUpdate((t, dt) => {
    museum.tick(t, dt);
    hub.update(t, dt);
    // 집 증축(village 가 단계를 바꾼 뒤) — 안에 있으면 새 방으로 다시 들어간다
    stageCheck -= dt;
    if (pendingStage && stageCheck <= 0) {
      stageCheck = 0.5;
      if (inside('house')) {
        const before = house.stage;
        house.syncStage();
        if (house.stage !== before) { reenter('house'); game.hud.banner({ text: '🏠 집이 넓어졌어요!', sub: STAGE_NAME[house.stage] ?? '', icon: '🏠', color: '#ffb37a' }); }
      }
      pendingStage = false;
    }
  });

  // ───────────── game.ext.interiors ─────────────
  // 어느 입구든 먼저 방을 맞춘다(불러온 직후 밖에서 불러도 저장된 배치가 살아 있게)
  const houseApi = {
    layout: () => { house.ensure(); return house.layout.map((p) => ({ ...p })); },
    place: (item: string, gx: number, gz: number, rot: Rot = 0, arg?: string) => { house.syncStage(); return house.place(item, gx, gz, rot, arg); },
    pickUp: (uid: string) => { house.ensure(); return house.pickUp(uid); },
    placing: (on?: boolean) => { if (on !== undefined && inside('house')) house.setPlacing(on); return house.placing; },
    setWall: (id: string) => { house.ensure(); house.setWall(id); },
    setFloor: (id: string) => { house.ensure(); house.setFloor(id); },
    score: () => { house.ensure(); return { ...house.score }; },
    display: (id: string, on: boolean) => { house.ensure(); return house.setDisplay(id, on); },
    displayed: () => displayKeys(game),
    room: () => { house.ensure(); return { ...house.room, stage: house.stage }; },
  };
  const museumApi = {
    exhibits: () => { museum.refresh(); return JSON.parse(JSON.stringify(museum.exhibits)) as typeof museum.exhibits; },
    speak: (id: string) => museum.speak(id),
    refresh: () => museum.refresh(),
  };
  game.ext.interiors = {
    register: (def: InteriorDef) => hub.register(def),
    enter: (id: string) => hub.enter(id),
    exit: () => hub.exit(),
    current: () => hub.current(),
    onChange: (fn: (id: string | null, prev: string | null) => void) => hub.onChange(fn),
    origin: (i: number) => interiorOrigin(i),
    house: houseApi,
    museum: museumApi,
    /** 집 점수(숫자) — islanddev 등이 읽는다 */
    score: () => { house.ensure(); return house.score.score; },
  };

  // ───────────── window.__interiors ─────────────
  if (typeof window !== 'undefined') {
    const give = (id: string, n = 1) => (game.econ?.give ? game.econ.give(id, n, 'debug', { silent: true }) : (st.addItem(id, n), n));
    (window as unknown as { __interiors?: unknown }).__interiors = {
      hub,
      enter: (id: string) => hub.enter(id),
      exit: () => hub.exit(),
      current: () => hub.current(),
      state: () => ({ current: hub.current(), house: house.snapshot(), flags: JSON.parse(JSON.stringify(readFlags(game))) }),
      place: houseApi.place,
      pick: houseApi.pickUp,
      deco: (on?: boolean) => { if (!inside('house')) hub.enter('house'); house.setPlacing(on ?? !house.placing); return house.placing; },
      wall: houseApi.setWall,
      floor: houseApi.setFloor,
      score: houseApi.score,
      museum: museumApi.exhibits,
      speak: museumApi.speak,
      give,
      /** 가구 몇 개를 주고 예쁘게 놓는다(촬영·점검용) — 놓은 수를 돌려준다 */
      demo: () => {
        house.syncStage();
        const R = house.room;
        const plan: Array<[string, number, number, Rot]> = [
          ['f_cloudrug', Math.floor(R.w / 2) - 2, Math.floor(R.d / 2) - 2, 0],
          ['f_pastelchair', Math.floor(R.w / 2) - 3, Math.floor(R.d / 2) - 1, 1],
          ['f_tank', R.w - 5, 3, 0],
          ['f_bugcage', 5, 2, 0],
          ['f_fireflylantern', 4, 4, 0],
          ['f_shellbed', 1, R.d - 5, 0],
          ['f_corallamp', 5, R.d - 4, 0],
          ['f_figure', R.w - 3, 3, 0],
          ['f_incubator', R.w - 3, R.d - 5, 0],
          ['f_aq_whalesofa', Math.floor(R.w / 2) - 2, 3, 0],
          ['f_canrobot', R.w - 2, R.d - 2, 3],
          ['f_cactuspot', 1, 3, 0],
          ['f_astro_planetmobile', R.w - 6, R.d - 4, 0],
          ['f_shellclock', 7, 2, 0],
        ];
        let n = 0;
        for (const [item, gx, gz, rot] of plan) {
          if (house.layout.some((p) => p.item === item)) continue;
          give(item, 1);
          if (house.place(item, gx, gz, rot).ok) n++;
        }
        const fish = Object.keys(st.dex).find((id) => st.species.get(id)?.category === 'fish');
        if (!fish) {
          const f = [...st.species.values()].find((s) => s.category === 'fish' && s.rarity >= 2);
          if (f) { st.collect({ species: f, keep: false, activity: 'debug' }); for (const p of house.layout) if (furnitureDef(p.item).holds === 'fish') house.cycleArg(p.uid); }
        }
        return n;
      },
    };
  }

  return hub.root;
}

/** 가구 이름(가방 표) */
const nameOfItem = (id: string) => GOODS[id]?.name ?? id;
