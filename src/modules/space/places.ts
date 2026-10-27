// 달 장소(6.3 표) — 장소 청크(128 m, 반경 300 m)가 그 장소 중심이 든 칸에서 짓는다:
// 떡방아 토끼 마을(떡집 3채 · 방아 토끼 5 · 떡순이) · 크레이터 연못 3(우유빛 물) · 월석 들판(월석거북 · 두드리는 월석) ·
// 지구 전망 언덕(사진 명소) · 별공룡 둥지(헬멧 스타사우루스 3) · UFO 잔해(삐리) · 두더지 잡기 크레이터 3.
// 그리고 하루마다 자리가 바뀌는 우주상자 15개(달 뿌리에 붙는다 — 가까운 것만 보인다).
import * as THREE from 'three';
import { buildAnimal, type AnimalRig } from '../characters/animal';
import { SPACE_BY_ID, type SpaceSpecies } from './data';
import { MOON_PLACES, moleCraters, moonPondsLocal, chestSpots, fallbackSpaceLoot, type Crater } from './logic';
import { makeCreature } from './model';
import { makeMochiHouse, makeMortar, makeMochiStall, makeMoonrock, makeNest, makePondWater, makeSpaceChest, makeUfoWreck, makeViewSpot, plastic } from './props';
import { spawnCritter } from './creatures';
import { EARTH_DIR } from './sky';
import { disposeDeep, onDispose, runDispose, type Hub } from './hub';

const sp = (id: string) => SPACE_BY_ID.get(id)! as SpaceSpecies;
const lineOf = <T>(arr: readonly T[], k: number) => arr[((k % arr.length) + arr.length) % arr.length];

/** 국소 자리에 붙여 세우기 */
function placeAt(hub: Hub, o: THREE.Object3D, lx: number, lz: number, yaw = 0, sink = 0) {
  o.position.set(hub.O.x + lx, hub.groundY(lx, lz) - sink, hub.O.z + lz);
  o.rotation.y = yaw;
  return o;
}
/** 처음 가까이 오면 발견 */
function discoverNear(hub: Hub, grp: THREE.Object3D, place: string, lx: number, lz: number, r: number) {
  let done = false;
  onDispose(grp, hub.addTicker(() => {
    if (done) return;
    const p = hub.game.player.pos;
    if (Math.hypot(p.x - hub.O.x - lx, p.z - hub.O.z - lz) < r) { done = true; hub.discover(place); }
  }));
}

// ───────────── 떡방아 토끼 마을 ─────────────
const TTEOK_LINES = [
  '떡순이: 어서 와요~ 갓 찧은 달떡이 말랑말랑해요!',
  '떡순이: 쿵떡쿵떡~ 방아 소리 들리죠? 오늘도 떡이 잘 돼요!',
  '떡순이: 지구에서 왔어요? 월석이랑 바꿔 줄게요!',
  '떡순이: 달꽃은 밤에 더 반짝여요. 하나 따다 줄래요?',
];
function buildVillage(hub: Hub, grp: THREE.Group) {
  const V = MOON_PLACES.village;
  const toPad = Math.atan2(-V.x, -V.z); // 착륙장 쪽
  const houses: Array<[number, number, string]> = [[-13, -9, '#ff9fb8'], [5, -17, '#c9b6f2'], [16, 4, '#9ef0d2']];
  for (const [dx, dz, tint] of houses) {
    const h = makeMochiHouse(tint);
    placeAt(hub, h, V.x + dx, V.z + dz, Math.atan2(-dx, -dz), 0.15);
    grp.add(h);
    onDispose(grp, hub.addCollider({ kind: 'cylinder', halfH: 2.4, r: 2.9 }, h.position.clone().add(new THREE.Vector3(0, 2.4, 0))));
  }
  // 떡순이네 가게 + 떡순이
  const sx = V.x - 3, sz = V.z + 9;
  const stall = makeMochiStall();
  placeAt(hub, stall, sx, sz, toPad);
  grp.add(stall);
  onDispose(grp, hub.addCollider({ kind: 'cylinder', halfH: 0.8, r: 1.3 }, stall.position.clone().add(new THREE.Vector3(0, 0.8, 0))));
  // 떡순이는 매대 옆(손님 쪽에서 얼굴이 보이게)
  const side = new THREE.Vector3(Math.cos(toPad), 0, -Math.sin(toPad)).multiplyScalar(2.1);
  const npcAt = { x: sx + side.x, z: sz + side.z };
  let rig: AnimalRig | null = null;
  let npc: THREE.Object3D;
  try {
    rig = buildAnimal({
      kind: 'rabbit', fur: '#fffaf2', light: '#fff1cf', earIn: '#ffd0de', blush: '#ff9fb8',
      outfit: 'dress', outfitColor: '#ffd0de', shirt: { a: '#ffd0de', b: '#fffaf2', pattern: 'dots' }, acc: 'bow', accColor: '#ff9fb8', lashes: true, scale: 1,
    });
    npc = rig.root;
  } catch {
    // 화면 없는 곳(테스트)·빌더 실패 → 우리 떡방아 토끼 모델에 분홍 앞치마
    npc = makeCreature(sp('moon-bunny'));
    const apron = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.4), plastic('#ffd0de'));
    apron.scale.set(0.62, 0.62, 0.62); apron.position.y = 0.55; npc.add(apron);
    npc.scale.multiplyScalar(1.3);
  }
  npc.name = 'npc_tteoksun';
  placeAt(hub, npc, npcAt.x, npcAt.z, toPad);
  grp.add(npc);
  let talkUntil = 0, talks = 0;
  const npcPos = npc.position.clone().add(new THREE.Vector3(0, 0.8, 0));
  onDispose(grp, hub.addActor({
    id: 'space:npc:tteoksun', pos: npcPos, r: 3.6, flat: true, label: '떡순이와 이야기하기',
    use: () => {
      const g = hub.game;
      talkUntil = g.time + 2.5;
      hub.toast(lineOf(TTEOK_LINES, talks++ + hub.day()));
      hub.emit({ type: 'npc-talk', npc: 'npc_tteoksun' });
      hub.emit({ type: 'open-shop', shop: 'moon' });
      g.player.act?.('wave', 1);
    },
  }));
  onDispose(grp, hub.addTicker((t, dt) => {
    const talk = hub.game.time < talkUntil;
    if (rig) rig.update(t, dt, { walk: 0, talk, wave: talk && Math.sin(t * 2) > 0.6, happy: talk });
    else { npc.position.y = hub.groundY(npcAt.x, npcAt.z) + (talk ? Math.abs(Math.sin(t * 6)) * 0.15 : 0); }
  }));
  // 떡방아 토끼 5마리: 광장 둘레에서 쿵떡쿵떡
  const bunny = sp('moon-bunny');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3, rr = 6.5;
    const mx = V.x + 2 + Math.cos(a) * rr, mz = V.z - 2 + Math.sin(a) * rr;
    const mortar = makeMortar();
    placeAt(hub, mortar, mx, mz, -a + Math.PI / 2);
    grp.add(mortar);
    const bx = mx + Math.cos(a) * 1.45, bz = mz + Math.sin(a) * 1.45;
    const c = spawnCritter(hub, grp, bunny, bx, bz, { ph: i * 0.29, yaw: Math.atan2(mx - bx, mz - bz), wanderR: 0, fixed: true, label: '떡방아토끼 쓰다듬기' });
    const mallet = mortar.userData.mallet as THREE.Object3D;
    onDispose(grp, hub.addTicker((t) => {
      // 토끼 폴짝 주기(π/2.2 초)와 같은 박자로 공이를 쿵!
      const k = Math.abs(Math.sin((t + c.ph) * 2.2));
      mallet.rotation.z = -0.15 + k * 1.0;
    }));
  }
  // 둥근 등불 6
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lamp = new THREE.Group();
    lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.0, 8), plastic('#fffaf2')));
    (lamp.children[0] as THREE.Mesh).position.y = 1.0;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), plastic(i % 2 ? '#fff2a8' : '#ffd0de', { glow: 1.1 }));
    bulb.position.y = 2.15;
    lamp.add(bulb);
    placeAt(hub, lamp, V.x + Math.cos(a) * 20, V.z + Math.sin(a) * 20);
    grp.add(lamp);
  }
  discoverNear(hub, grp, 'village', V.x, V.z, 32);
}

// ───────────── 크레이터 연못 ─────────────
function buildPond(hub: Hub, grp: THREE.Group, i: number) {
  const p = moonPondsLocal()[i];
  const w = makePondWater(p.r + 0.6);
  w.position.set(hub.O.x + p.x, hub.O.y + p.y, hub.O.z + p.z);
  grp.add(w);
  const shine = w.userData.shine as THREE.Mesh;
  // 물가의 흰 조약돌 + 떠 있는 별빛 3
  const r = hub.rng(`space:pond:${i}`);
  for (let k = 0; k < 9; k++) {
    const a = r() * Math.PI * 2, rr = p.r + 0.6 + r() * 1.4;
    const st = new THREE.Mesh(new THREE.SphereGeometry(0.25 + r() * 0.25, 14, 10), plastic('#fffaf2', { rough: 0.7 }));
    st.scale.y = 0.6;
    placeAt(hub, st, p.x + Math.cos(a) * rr, p.z + Math.sin(a) * rr);
    grp.add(st);
  }
  const lights: THREE.Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), plastic(['#fff2a8', '#c8e8ff', '#ffd0de'][k], { glow: 1.4 }));
    grp.add(l); lights.push(l);
  }
  onDispose(grp, hub.addTicker((t) => {
    shine.scale.setScalar(1 + 0.12 * Math.sin(t * 0.8 + i));
    (shine.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.15 * Math.sin(t * 1.3 + i);
    lights.forEach((l, k) => {
      const a = t * 0.2 + k * 2.1;
      l.position.set(hub.O.x + p.x + Math.cos(a) * p.r * 0.55, hub.O.y + p.y + 0.5 + Math.sin(t * 1.5 + k) * 0.15, hub.O.z + p.z + Math.sin(a) * p.r * 0.55);
    });
  }));
  discoverNear(hub, grp, 'ponds', p.x, p.z, p.r + 10);
}

// ───────────── 월석 들판 ─────────────
function buildField(hub: Hub, grp: THREE.Group) {
  const F = MOON_PLACES.field;
  const r = hub.rng('space:field');
  const cracks: Array<() => void> = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + r() * 0.4, rr = 6 + r() * 16;
    const x = F.x + Math.cos(a) * rr, z = F.z + Math.sin(a) * rr;
    const rock = makeMoonrock();
    const s = 0.8 + r() * 0.5;
    rock.scale.setScalar(s);
    placeAt(hub, rock, x, z, r() * 6.28, 0.1);
    grp.add(rock);
    onDispose(grp, hub.addCollider({ kind: 'ball', r: 0.9 * s }, rock.position.clone().add(new THREE.Vector3(0, 0.2 * s, 0))));
    const id = `moonrock:${i}`;
    const inner = rock.userData.rock as THREE.Mesh;
    const crack = () => { const done = hub.takenToday(id); inner.scale.set(done ? 0.85 : 1.1, done ? 0.6 : 1.0, done ? 0.85 : 1.0); };
    crack();
    cracks.push(crack);
    let shake = 0;
    onDispose(grp, hub.addActor({
      id: `space:rock:${i}`, pos: rock.position.clone().add(new THREE.Vector3(0, 0.4, 0)), r: 2.4 * s,
      ok: () => !hub.takenToday(id),
      label: () => (hub.unlocked('tool:hammer') ? '월석 두드리기 (망치)' : '월석: 망치가 있어야 해요'),
      use: () => {
        if (!hub.unlocked('tool:hammer')) { hub.toast('망치가 있어야 월석을 두드릴 수 있어요! 🔨'); return; }
        hub.game.player.act?.('hit', 0.6);
        const rr = hub.rng(`space:rock:${hub.day()}:${i}`);
        const n = 2 + Math.floor(rr() * 3);
        const got = hub.give('m_moonrock', n, 'moonrock');
        if (got <= 0) return; // 가방이 꽉 찼다 — 오늘 몫은 남겨 둔다
        hub.markToday(id);
        shake = 0.5;
        crack();
        hub.emit({ type: 'harvest', kind: 'moonrock', item: 'm_moonrock', n: got, island: 'moon' });
        hub.toast(`🌕 통통! 월석 ${got}개를 얻었어요`);
      },
    }));
    onDispose(grp, hub.addTicker((_t, dt) => {
      if (shake <= 0) return;
      shake = Math.max(0, shake - (dt > 0 ? dt : 1 / 60));
      rock.rotation.z = Math.sin(shake * 60) * shake * 0.2;
    }));
  }
  // 날이 바뀌면 금 간 월석도 다시 통통하게(청크를 다시 짓지 않아도)
  let seenDay = hub.day();
  onDispose(grp, hub.addTicker(() => {
    const d = hub.day();
    if (d === seenDay) return;
    seenDay = d;
    for (const f of cracks) f();
  }));
  // 월석거북(우주 밤에 나온다)
  const turtle = sp('meteor-turtle');
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.5;
    spawnCritter(hub, grp, turtle, F.x + Math.cos(a) * 11, F.z + Math.sin(a) * 11, { ph: i * 3.3, wanderR: 5, yaw: a });
  }
  discoverNear(hub, grp, 'field', F.x, F.z, 30);
}

// ───────────── 지구 전망 언덕 ─────────────
function buildHill(hub: Hub, grp: THREE.Group) {
  const H = MOON_PLACES.hill;
  const spot = makeViewSpot();
  const yaw = Math.atan2(EARTH_DIR.x, EARTH_DIR.z);
  placeAt(hub, spot, H.x, H.z, yaw);
  grp.add(spot);
  onDispose(grp, hub.addActor({
    id: 'space:photo:earthview', pos: spot.position.clone().add(new THREE.Vector3(0, 1, 0)), r: 4, flat: true, label: '지구 보며 사진 찍기 📷',
    use: () => {
      hub.game.player.act?.('photo', 1.4);
      hub.emit({ type: 'photo', spot: 'moon-earthview' });
      hub.toast('찰칵! 📷 지구가 정말 예뻐요~');
    },
  }));
  discoverNear(hub, grp, 'hill', H.x, H.z, 24);
}

// ───────────── 별공룡 둥지 ─────────────
function buildNest(hub: Hub, grp: THREE.Group) {
  const N = MOON_PLACES.nest;
  const nest = makeNest();
  placeAt(hub, nest, N.x, N.z);
  grp.add(nest);
  const star = sp('s_starsaurus');
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    spawnCritter(hub, grp, star, N.x + Math.cos(a) * 7.5, N.z + Math.sin(a) * 7.5, { ph: i * 2.7, wanderR: 2.5, yaw: a + Math.PI, label: '별공룡에게 인사하기' });
  }
  const eggs = nest.userData.eggs as THREE.Mesh[];
  onDispose(grp, hub.addTicker((t) => { eggs.forEach((e, i) => { e.rotation.z = Math.sin(t * 2 + i * 2) * 0.08; }); }));
  discoverNear(hub, grp, 'nest', N.x, N.z, 26);
}

// ───────────── UFO 잔해 ─────────────
const PIRI_LINES = ['삐리: 삐리리~ 지구인 친구다!', '삐리: 내 UFO 가 쿵 떨어졌어… 그래도 달이 좋아!', '삐리: 눈이 세 개라 윙크는 어려워! 삐빅!'];
function buildWreck(hub: Hub, grp: THREE.Group) {
  const W = MOON_PLACES.wreck;
  const wreck = makeUfoWreck();
  placeAt(hub, wreck, W.x, W.z, 0.7, 0.4);
  grp.add(wreck);
  onDispose(grp, hub.addCollider({ kind: 'cylinder', halfH: 1.2, r: 3.6 }, wreck.position.clone().add(new THREE.Vector3(0, 1.0, 0))));
  const alien = sp('s_alien_kid');
  let k = 0;
  const c = spawnCritter(hub, grp, alien, W.x - 5.5, W.z + 4, { ph: 1.3, wanderR: 1.5, label: '삐리에게 인사하기' });
  // 인사하면 한마디
  onDispose(grp, hub.addActor({
    id: 'space:talk:piri', pos: c.pos, r: 3.2, flat: true, label: '삐리와 이야기하기', ok: () => !!hub.game.state.dex[alien.id],
    use: () => { hub.toast(lineOf(PIRI_LINES, k++)); hub.game.player.act?.('wave', 1); },
  }));
  const lights = wreck.userData.lights as THREE.Mesh[];
  const puffs = wreck.userData.puffs as THREE.Mesh[];
  onDispose(grp, hub.addTicker((t) => {
    lights.forEach((l, i) => { l.visible = Math.sin(t * 5 + i * 1.7) > -0.3; });
    puffs.forEach((p, i) => {
      const u = ((t * 0.25 + i / puffs.length) % 1);
      p.position.set(1.2 + Math.sin(u * 6 + i) * 0.4, 1.4 + u * 4.5, 0.6 + Math.cos(u * 5) * 0.3);
      p.scale.setScalar(0.3 + u * 0.9);
      (p.material as THREE.MeshPhysicalMaterial).opacity = 0.75 * (1 - u);
    });
  }));
  discoverNear(hub, grp, 'wreck', W.x, W.z, 24);
}

// ───────────── 두더지 잡기 크레이터 ─────────────
const MOLE_PERIOD = 2.6;
function buildMoleSite(hub: Hub, grp: THREE.Group, c: Crater, idx: number) {
  const mole = sp('crater-mole');
  const holes: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + idx;
    holes.push({ x: c.x + Math.cos(a) * c.r * 0.38, z: c.z + Math.sin(a) * c.r * 0.38 });
  }
  for (const h of holes) {
    const mound = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.22, 12, 28), plastic('#d8cfe6', { rough: 0.9 }));
    mound.rotation.x = Math.PI / 2;
    placeAt(hub, mound, h.x, h.z);
    mound.position.y += 0.05;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), plastic('#6f6385', { rough: 1 }));
    hole.rotation.x = -Math.PI / 2;
    placeAt(hub, hole, h.x, h.z);
    hole.position.y += 0.04;
    grp.add(mound, hole);
  }
  const m = makeCreature(mole);
  grp.add(m);
  let rest = 0;
  const state = { up: 0, hole: 0, phase: 0 };
  const pos = new THREE.Vector3();
  onDispose(grp, hub.addTicker((t) => {
    const g = hub.game;
    if (g.time < rest) { m.visible = false; state.up = 0; return; }
    const cyc = Math.floor((t + idx * 0.9) / MOLE_PERIOD);
    const u = ((t + idx * 0.9) / MOLE_PERIOD) - cyc;
    state.hole = ((cyc * 7 + idx * 3) % 3 + 3) % 3;
    state.phase = u;
    // 0~0.2 올라오기 · 0.2~0.6 나와 있음 · 0.6~0.75 쏙 · 그 뒤 숨음
    state.up = u < 0.2 ? u / 0.2 : u < 0.6 ? 1 : u < 0.75 ? 1 - (u - 0.6) / 0.15 : 0;
    const h = holes[state.hole];
    const gy = hub.groundY(h.x, h.z);
    m.visible = state.up > 0.02;
    m.position.set(hub.O.x + h.x, gy - 0.95 + state.up * 0.95, hub.O.z + h.z);
    const pl = g.player.pos;
    m.rotation.y = Math.atan2(pl.x - m.position.x, pl.z - m.position.z);
    if (m.visible) m.userData.anim(t);
    pos.set(m.position.x, gy + 0.4, m.position.z);
  }));
  onDispose(grp, hub.addActor({
    id: `space:mole:${idx}`, pos, r: 2.7, flat: true,
    ok: () => hub.game.time >= rest,
    label: () => (state.up > 0.6 ? '두더지 잡기! (지금!)' : '두더지가 쏙 나오면 E!'),
    use: () => {
      const g = hub.game;
      if (state.up > 0.6) {
        g.player.act?.('hit', 0.5);
        hub.catchSpecies(mole, { model: makeCreature(mole), how: 'mole' });
        rest = g.time + 25;
      } else if (state.phase >= 0.6 && state.phase < 0.85) {
        // 아깝게 놓쳤다
        g.player.act?.('hit', 0.5);
        hub.toast('쏙! 아깝다, 숨어 버렸어요');
        g.econ?.catchFail?.('space');
      } else hub.toast('구멍을 잘 보다가 두더지가 쏙 나오면 E! 🐹');
    },
  }));
}

/** 장소 청크 레이어 */
export function addPlacesLayer(hub: Hub, active: () => boolean) {
  const { game, O } = hub;
  const P = MOON_PLACES;
  type Builder = (g: THREE.Group) => void;
  const list: Array<{ x: number; z: number; name: string; build: Builder }> = [
    { ...P.village, name: 'village', build: (g) => buildVillage(hub, g) },
    ...P.ponds.map((p, i) => ({ ...p, name: `pond-${i}`, build: (g: THREE.Group) => buildPond(hub, g, i) })),
    { ...P.field, name: 'field', build: (g) => buildField(hub, g) },
    { ...P.hill, name: 'hill', build: (g) => buildHill(hub, g) },
    { ...P.nest, name: 'nest', build: (g) => buildNest(hub, g) },
    { ...P.wreck, name: 'wreck', build: (g) => buildWreck(hub, g) },
    ...moleCraters().map((c, i) => ({ x: c.x, z: c.z, name: `mole-${i}`, build: (g: THREE.Group) => buildMoleSite(hub, g, c, i) })),
  ];
  const SIZE = 128;
  game.chunks.add({
    key: 'space-moon-places', size: SIZE, radius: 240, world: 'space',
    build: ({ x0, z0, size }) => {
      if (!active()) return null;
      const here = list.filter((p) => { const wx = O.x + p.x, wz = O.z + p.z; return wx >= x0 && wx < x0 + size && wz >= z0 && wz < z0 + size; });
      if (!here.length) return null;
      const grp = new THREE.Group();
      grp.name = `moon-places:${here.map((p) => p.name).join(',')}`;
      for (const p of here) {
        const sub = new THREE.Group();
        sub.name = `moon-place-${p.name}`;
        grp.add(sub);
        try { p.build(sub); } catch (e) { console.error(`[space place ${p.name}]`, e); }
        // 멀면 통째로 숨긴다(작은 행성 곡률 너머라 어차피 안 보인다 — 그리기 호출 아끼기)
        const cx = O.x + p.x, cz = O.z + p.z, far2 = 170 * 170;
        onDispose(sub, hub.addTicker(() => {
          const pl = game.player.pos;
          const v = (pl.x - cx) ** 2 + (pl.z - cz) ** 2 < far2;
          if (sub.visible !== v) sub.visible = v;
        }));
        // 장소별 정리 함수를 묶음에 모은다
        onDispose(grp, () => runDispose(sub));
      }
      return grp;
    },
    // 정리 함수 + 이 청크만의 지오메트리·재질·간판 텍스처까지(기본 disposeGeometries 를 대신하니 여기서 다)
    dispose: (o) => disposeDeep(o),
  });
  return list.map((p) => p.name);
}

// ───────────── 우주상자(하루마다 15개) ─────────────
export interface SpaceChests {
  group: THREE.Group;
  /** 그날 자리로 다시 놓는다 */
  rebuild(day: number): void;
  /** 열었나 */
  isOpen(i: number): boolean;
  open(i: number): boolean;
  spots(): Array<{ x: number; z: number }>;
}
export function buildChests(hub: Hub, opened: () => { day: number; open: number[] }, save: () => void): SpaceChests {
  const group = new THREE.Group();
  group.name = 'moon-space-chests';
  let day = -1;
  let spots: Array<{ x: number; z: number }> = [];
  let models: THREE.Group[] = [];
  let offs: Array<() => void> = [];
  const isOpen = (i: number) => { const o = opened(); return o.day === day && o.open.includes(i); };
  const open = (i: number) => {
    if (i < 0 || i >= spots.length || isOpen(i)) return false;
    const o = opened();
    if (o.day !== day) { o.day = day; o.open = []; }
    o.open.push(i);
    save();
    const g = hub.game;
    const econ = g.econ;
    const where = `moon:${day}:${i}`;
    let names: string[] = [];
    if (econ && typeof econ.openChest === 'function') {
      const res = econ.openChest('space', where);
      names = (res?.loot ?? []).map((l) => `${l.name ?? l.id} ${l.n}`);
    } else {
      // economy 가 없을 때: 5.4 우주상자 표로 직접
      for (const l of fallbackSpaceLoot(hub.rng(`space:chestloot:${where}`))) {
        if (l.id === 'coins') g.state.addCoins(l.n, 'chest');
        else if (l.id !== 'stars' && !l.id.startsWith('recipe:')) hub.give(l.id, l.n, 'chest');
        names.push(`${l.id} ${l.n}`);
      }
      hub.emit({ type: 'chest-open', tier: 'space', at: where, loot: [], source: 'space' });
    }
    g.player.act?.('pick', 0.8);
    hub.toast(`🪐 우주상자를 열었어요!${names.length ? ' ' + names.slice(0, 3).join(' · ') : ''}`);
    const lid = models[i]?.userData.lid as THREE.Object3D | undefined;
    if (lid) lid.rotation.x = -1.9;
    return true;
  };
  const rebuild = (d: number) => {
    for (const f of offs) f();
    offs = [];
    for (const m of models) { group.remove(m); disposeDeep(m); }
    models = [];
    day = d;
    spots = chestSpots(d);
    spots.forEach((s, i) => {
      const m = makeSpaceChest();
      placeAt(hub, m, s.x, s.z, hub.rng(`space:chestyaw:${d}:${i}`)() * 6.28, 0.05);
      if (isOpen(i)) (m.userData.lid as THREE.Object3D).rotation.x = -1.9;
      group.add(m);
      models.push(m);
      offs.push(hub.addActor({
        id: `space:chest:${i}`, pos: m.position.clone().add(new THREE.Vector3(0, 0.4, 0)), r: 2.4,
        ok: () => !isOpen(i), label: '우주상자 열기',
        use: () => { open(i); },
      }));
    });
  };
  // 가까운 것만 보이게 + 안 연 상자는 통통 흔들
  offs.push(hub.addTicker((t) => {
    const p = hub.game.player.pos;
    models.forEach((m, i) => {
      const d2 = (m.position.x - p.x) ** 2 + (m.position.z - p.z) ** 2;
      m.visible = d2 < 150 * 150;
      if (!m.visible || isOpen(i)) return;
      const u = (t * 0.6 + i * 0.37) % 1;
      m.rotation.z = u < 0.12 ? Math.sin(u / 0.12 * Math.PI * 4) * 0.06 : 0;
    });
  }));
  const tickOff = offs.pop()!;
  const wrap: SpaceChests = {
    group, rebuild: (d) => { rebuild(d); }, isOpen, open, spots: () => spots,
  };
  onDispose(group, () => { for (const f of offs) f(); tickOff(); });
  return wrap;
}
