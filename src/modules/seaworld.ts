// 바다 이벤트(GDD 2.3 · 2.4 · 3.3 P1 · 4.13): 해류 고속도로(흰 거품 띠 + 날치 떼) · 유령선 으스스호(밤 + 안개, 토요일 해적 은상자) ·
// 별빛 탐사선 UFO 잔해(블랙박스 → 비밀 launch-probe, 탐사선 해안 = 은하나비 자리) · 소용돌이(고리를 도는 상자) ·
// 고래 길 혹등고래(분수 → 무지개 + 코인 비, 금요일 확정) · 돌고래 경주(배 옆 20초) · 갈매기 도둑(물고기 1마리 → 쫓아가 되찾기) ·
// 매일 먼바다 표류 상자. 모든 것은 플레이어 가까이에서만 만든다(띠·날치·장소 = 청크, 상자·고래·돌고래·갈매기 = 근처 풀).
//
// game.ext.currents (이 모듈만 쓴다):
//   at(x,z) → {x,z} m/s | null   — 띠 가운데 8 m/s(가장자리로 갈수록 0, 폭 40 m), 소용돌이 둘레는 빙글 흐름. 띠·소용돌이 밖이면 null
//   onBand(x,z) → boolean         — 해류 띠 안인가
//   nearest(x,z) → BandHit|null   — 가운데 선까지 거리·진행 방향·고리 길이
//   length                        — 고리 한 바퀴(m)
//   rode() → m                    — 배로 띠를 탄 누적 거리(ach_current 해류 띠 1km 용)
//   whale() → {visible, x, z, spouting} · dolphins() → {active, progress} · ghost() → {up, k}  (ocean 이 자기 목격 고래·돌고래를 숨길 때 읽는다)
// game.geo.currentAt 도 같은 at 으로 채운다(계약 2장). vehicles 는 at 을 읽고, 수영하는 플레이어는 이 모듈이 0.5배로 떠내려 보낸다.
// flags.seaworld: { v, day, opened[], whaleN, whaleSeen, raceN, blackbox, probe, gull, rode } (seaworld/logic.ts readSeaFlags)
// 디버그: window.__seaworld { currentAt, onBand, goBand(s?), goGhost(), goUfo(), goWhirl(), goRoad(), ghost(on?), whale(on?), spout(),
//          race(), gull(), takeBlackBox(), chests(), openNear(), state() }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Witness } from '../core/api';
import { HOUR_SEC, splitVariant } from '../core/api';
import { applyCurve } from '../core/curve';
import { breathe } from '../core/art';
import type { Species } from '../core/state';
import {
  CurrentField, CURRENT_PATH, BAND_HALF, SWIM_DRIFT, WHIRL_RING,
  ghostSurfaced, isWhaleRoadDay, isPirateDay, whaleActive, whalePhase, whaleCoins, coinDrops, WHALE_MAX_PER_DAY, roadNearest, WHALE_ROAD,
  driftChests, driftPos, whirlChests, whirlAngle, pirateChests,
  newRace, stepRace, raceCoins, RACE_SPEED, RACE_SEC, RACE_MAX_PER_DAY,
  pickStealable, gullRoll, GULL_CHASE, GULL_CATCH, GULL_CHECK,
  readSeaFlags, rollSeaDay, takeBlackBox, type SeaFlags, type BandHit,
} from './seaworld/logic';
import {
  seaMats, ghostShipGeo, ghostShipFace, spiritGeo, spirit, ufoGeo, ufoDomeGeo, ufoFace, blackBoxGeo, floatBalloonGeo, chestGeo,
  humpbackGeo, whaleFace, dolphinGeo, bakedEyes, eyeInstances, gull as buildGull, flyingFishGeo, rainbowGeo, coinGeo, foamRingGeo, puffGeo,
  wreckshoreGeo,
} from './seaworld/models';
import { bandMaterial, bandStrip, bandUniforms, whirlpoolMesh, BAND_Y } from './seaworld/band';

export const order = 35;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** 상자를 만드는 거리 / 버리는 거리 */
const CHEST_NEAR = 360, CHEST_FAR = 430;
/** 배로 스치면 저절로 열리는 거리(수평 m) */
const BOAT_TOUCH = 4.5;
/** 헤엄쳐서 E 로 여는 거리 */
const SWIM_REACH = 2.8;

interface ChestDesc { id: string; tier: 'wood' | 'silver' | 'gold'; where: string; kind: 'drift' | 'whirl' | 'pirate' | 'ghost'; pos: (gs: number, t: number) => THREE.Vector3 | null }
interface LiveChest { d: ChestDesc; mesh: THREE.Mesh; pos: THREE.Vector3 }
interface School { s0: number; v: number; ph: number; n: number }

export default function build(ctx: Ctx) {
  const { game, island } = ctx;
  if (!game) return;
  const g = game;
  const P = island.PLACES;
  const st = g.state;
  const root = new THREE.Group();
  root.name = 'seaworld';
  root.userData.world = 'earth';
  const M = seaMats();

  // ───────── 해류장 ─────────
  /** 땅·얕은 물에서 띠가 사라지게(해저 −0.6 m 보다 얕으면 0, −3 m 이면 1) */
  const fade = (x: number, z: number) => clamp((-island.heightAt(x, z) - 0.6) / 2.4, 0, 1);
  const W = { x: P.whirlpool.x, z: P.whirlpool.z, r: P.whirlpool.r };
  const F = new CurrentField(CURRENT_PATH, fade, W);

  // ───────── 저장 ─────────
  let sf: SeaFlags = readSeaFlags(st.flags);
  const SF = () => (st.flags.seaworld === sf ? sf : (sf = readSeaFlags(st.flags)));
  const dayNow = () => { try { return Math.floor(g.econ?.day?.() ?? g.env?.day ?? 0); } catch { return Math.floor(g.env?.day ?? 0); } };
  const hourNow = () => g.env?.hour ?? ({ morning: 7, day: 12, sunset: 18, night: 23 } as Record<string, number>)[ctx.tod] ?? 12;
  const gameSec = () => g.env?.gameSec ?? g.time;
  rollSeaDay(SF(), dayNow());
  const say = (text: string) => { try { g.hud?.toast ? g.hud.toast(text) : g.ui.toast(text); } catch { g.ui.toast(text); } };
  const give = (id: string, n: number, why: string) => {
    const e = g.econ;
    if (e && typeof e.give === 'function') return e.give(id, n, why);
    st.addItem(id, n);
    return n;
  };
  const sfx = (name: string, o?: { x?: number; z?: number; vol?: number; pitch?: number }) => { try { g.audio?.sfx(name, o); } catch { /* 소리 없음 */ } };
  // 켜기 전에 갈매기가 들고 간 물고기 → 몰래 돌려놓는다(새로고침으로 잃지 않게)
  if (sf.gull) {
    const k = sf.gull;
    sf.gull = null;
    st.addItem(k, 1);
    say('갈매기가 가져간 물고기를 몰래 돌려놨어요 🐦');
  }
  st.save();

  // 요일 이벤트(달력 모듈이 알려 주면 그 값, 아니면 요일로)
  const weekEv = new Map<string, { on: boolean; day: number }>();
  st.on((e) => {
    if (e.type !== 'weekday-event' || typeof e.id !== 'string') return;
    weekEv.set(e.id, { on: e.active === true, day: dayNow() });
    if (e.id === 'pirate') rebuildChests();
  });
  /** 그날 받은 요일 이벤트 알림(없으면 undefined → 요일로) */
  const evOn = (id: string) => { const v = weekEv.get(id); return v && v.day === dayNow() ? v.on : undefined; };
  const whaleDay = () => evOn('whaleroad') ?? isWhaleRoadDay(dayNow());
  const pirateDay = () => evOn('pirate') ?? isPirateDay(dayNow());

  const currents = {
    at: (x: number, z: number) => F.at(x, z),
    onBand: (x: number, z: number) => F.onBand(x, z),
    nearest: (x: number, z: number): BandHit | null => F.nearest(x, z),
    length: F.length,
    rode: () => SF().rode,
    whale: () => ({ visible: whale.root.visible, x: whale.root.position.x, z: whale.root.position.z, spouting: whale.spouting }),
    dolphins: () => ({ active: podK > 0.05, progress: race.progress / RACE_SEC }),
    ghost: () => ({ up: ghostUp, k: ghostK }),
  };
  g.ext.currents = currents;
  if (g.geo) g.geo.currentAt = (x: number, z: number) => F.at(x, z);

  // ───────── 해류 띠(청크) ─────────
  const bandMat = bandMaterial();
  g.chunks.add({
    key: 'seaworld-band', size: 256, radius: 900,
    build: ({ x0, z0, size }) => {
      const geo = bandStrip(F, x0, z0, size, fade);
      if (!geo) return null;
      const m = new THREE.Mesh(geo, bandMat);
      m.position.set(x0, 0, z0);
      m.renderOrder = 2;
      m.name = 'seaworld-band';
      return m;
    },
  });

  // ───────── 날치 떼(장식 — 띠 위를 톡톡 뛴다) ─────────
  const FISH_MAX = 72;
  const fishIm = new THREE.InstancedMesh(flyingFishGeo(), M.body, FISH_MAX);
  const fishEyes = eyeInstances(bakedEyes({ size: 0.06, y: 0.035, z: 0.19, gap: 0.1, splay: 0.7 }), FISH_MAX).slice(0, 2);
  const fishRoot = new THREE.Group();
  fishRoot.name = 'seaworld-flyfish';
  for (const im of [fishIm, ...fishEyes]) { im.count = 0; im.frustumCulled = false; fishRoot.add(im); }
  root.add(fishRoot);
  const schools = new Set<School>();
  g.chunks.add({
    key: 'seaworld-flyfish', size: 192, radius: 260, detail: true,
    build: ({ cx, cz, x0, z0, size }) => {
      const segs = F.segmentsIn(x0, z0, x0 + size, z0 + size);
      if (!segs.length) return null;
      const r = ctx.rng(`seaworld-flyfish:${cx},${cz}`);
      const grp = new THREE.Group();
      const mine: School[] = [];
      const k = 1 + Math.floor(r() * 2);
      for (let i = 0; i < k; i++) {
        const seg = segs[Math.floor(r() * segs.length)];
        const sc: School = { s0: F.ss[seg], v: (r() - 0.5) * 0.9, ph: r() * 10, n: 5 + Math.floor(r() * 4) };
        if (fade(F.xs[seg], F.zs[seg]) < 0.9) continue;
        mine.push(sc); schools.add(sc);
      }
      grp.userData.schools = mine;
      return grp;
    },
    dispose: (o) => { for (const sc of (o.userData.schools as School[] | undefined) ?? []) schools.delete(sc); },
  });
  const fM = new THREE.Matrix4(), fQ = new THREE.Quaternion(), fE = new THREE.Euler(0, 0, 0, 'YXZ'), fP = new THREE.Vector3(), fS = new THREE.Vector3();
  const updateFish = (t: number) => {
    let n = 0;
    const pl = g.player.pos;
    for (const sc of schools) {
      for (let i = 0; i < sc.n && n < FISH_MAX; i++) {
        const per = 2.4, tt = t + sc.ph + i * 0.37, hop = Math.floor(tt / per), u = (tt - hop * per) / per;
        if (u > 0.4) continue; // 물속에서 쉬는 중
        const a = u / 0.4;
        const s = sc.s0 + (hop % 18) * 7 + a * 7 + i * 2.2;
        const p = F.pointAt(s);
        const lat = (sc.v + Math.sin(i * 2.3) * 0.25) * BAND_HALF;
        const x = p.x - p.tz * lat, z = p.z + p.tx * lat;
        if (Math.abs(x - pl.x) > 300 || Math.abs(z - pl.z) > 300) continue;
        const y = BAND_Y - 0.25 + Math.sin(a * Math.PI) * (1.2 + (i % 3) * 0.25);
        fE.set(-Math.cos(a * Math.PI) * 0.7, Math.atan2(p.tx, p.tz), 0);
        fM.compose(fP.set(x, y, z), fQ.setFromEuler(fE), fS.setScalar(1.25));
        fishIm.setMatrixAt(n, fM);
        for (const e of fishEyes) e.setMatrixAt(n, fM);
        n++;
      }
    }
    for (const im of [fishIm, ...fishEyes]) { im.count = n; im.instanceMatrix.needsUpdate = true; }
  };

  // ───────── 장소(청크): 유령선 · 탐사선 · 소용돌이 · 탐사선 해안 ─────────
  const GS = P.ghostShip, UF = P.ufoWreck;
  const ghostFloor = island.heightAt(GS.x, GS.z), ufoFloor = island.heightAt(UF.x, UF.z);
  /** 탐사선 해안(별똥별섬에서 탐사선 쪽 바닷가 — zones 의 wreckshore 부채꼴 안) */
  const shoreSpot = (() => {
    const L = island.islandById('launch');
    if (!L) return null;
    const dx = UF.x - L.x, dz = UF.z - L.z, l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uz = dz / l;
    let shore = -1;
    for (let r = L.r * 0.4; r < L.r * 1.4; r += 3) if (island.heightAt(L.x + ux * r, L.z + uz * r) < 0.3) { shore = r; break; }
    if (shore < 0) return null;
    const r = shore - 14;
    const x = L.x + ux * r, z = L.z + uz * r;
    return { x, z, y: Math.max(0.2, island.heightAt(x, z)), yaw: Math.atan2(ux, uz) };
  })();
  if (shoreSpot) {
    try { g.geo?.addLandmark({ id: 'lm:launch:wreckshore', kind: 'wreckshore', name: '탐사선 해안', island: 'launch', x: Math.round(shoreSpot.x), z: Math.round(shoreSpot.z), r: 40 }); } catch { /* 지리 서비스 없음 */ }
  }

  // 자리 조각 지오메트리·소용돌이는 한 번만 만든다 — 청크를 다시 지어도 새로 만들지 않게(공유 표시라 dispose 가 못 지워 새던 것)
  const once = <T,>(f: () => T) => { let v: T | undefined; return () => (v ??= f()); };
  const G1 = {
    ufo: once(() => ufoGeo()), dome: once(() => ufoDomeGeo()), box: once(() => blackBoxGeo()), balloon: once(() => floatBalloonGeo()),
    whirl: once(() => whirlpoolMesh(W.r)), shore: once(() => wreckshoreGeo(ctx.rng('seaworld:wreckshore'))),
  };
  const ghostGeo = ghostShipGeo(), spiritG = spiritGeo();
  const live: {
    ghost: { surf: THREE.Group; spirits: THREE.Group[]; deck: THREE.Vector3 } | null;
    ufo: { box: THREE.Object3D; balloon: THREE.Object3D; tether: THREE.Object3D; boxPos: THREE.Vector3; face: THREE.Object3D } | null;
    whirl: THREE.Mesh | null;
    shore: THREE.Mesh | null;
  } = { ghost: null, ufo: null, whirl: null, shore: null };
  const inChunk = (x: number, z: number, x0: number, z0: number, s: number) => x >= x0 && x < x0 + s && z >= z0 && z < z0 + s;
  const boxMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: new THREE.Color('#ff9a3c'), emissiveIntensity: 0.3 });
  g.chunks.add({
    key: 'seaworld-places', size: 512, radius: 1150,
    build: ({ x0, z0, size }) => {
      const grp = new THREE.Group();
      grp.name = 'seaworld-places';
      let any = false;
      if (inChunk(GS.x, GS.z, x0, z0, size)) {
        any = true;
        // 가라앉은 선체(늘) — 해저에 비스듬히
        const sunk = new THREE.Mesh(ghostGeo, M.sunken);
        sunk.position.set(GS.x + 6, ghostFloor + 1.4, GS.z - 4);
        sunk.rotation.set(0.12, 0.8, 0.32);
        grp.add(sunk);
        // 수면에 뜨는 유령(밤 + 안개)
        const surf = new THREE.Group();
        surf.position.set(GS.x, -0.8, GS.z);
        surf.rotation.y = 2.2;
        surf.add(new THREE.Mesh(ghostGeo, M.ghost));
        surf.add(ghostShipFace());
        const spirits: THREE.Group[] = [];
        for (let i = 0; i < 2; i++) { const s = spirit(spiritG, M.spirit); s.userData.ph = i * 0.5 + 0.13; surf.add(s); spirits.push(s); }
        surf.visible = false;
        grp.add(surf);
        live.ghost = { surf, spirits, deck: new THREE.Vector3(0, 1.5, -2.5) };
      }
      if (inChunk(UF.x, UF.z, x0, z0, size)) {
        any = true;
        const ufo = new THREE.Group();
        ufo.position.set(UF.x, ufoFloor + 2.0, UF.z);
        ufo.rotation.set(0.24, 0.6, -0.16);
        ufo.add(new THREE.Mesh(G1.ufo(), M.glossy), new THREE.Mesh(G1.dome(), M.glass));
        const face = ufoFace();
        ufo.add(face);
        grp.add(ufo);
        // 블랙박스: 비상 풍선에 매달려 −13 m 에 둥실(맨몸 잠수로도 닿는다) + 탐사선까지 줄
        const boxPos = new THREE.Vector3(UF.x + 3, Math.max(ufoFloor + 6, -13), UF.z + 2);
        const box = new THREE.Mesh(G1.box(), boxMat);
        box.position.copy(boxPos);
        const balloon = new THREE.Mesh(G1.balloon(), M.body);
        balloon.position.copy(boxPos).add(new THREE.Vector3(0, 1.6, 0));
        const top = new THREE.Vector3(UF.x, ufoFloor + 4.2, UF.z);
        const len = boxPos.distanceTo(top);
        const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 5), M.line);
        tether.position.copy(boxPos).add(top).multiplyScalar(0.5);
        tether.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(boxPos).normalize());
        const done = SF().blackbox;
        box.visible = balloon.visible = tether.visible = !done;
        grp.add(box, balloon, tether);
        live.ufo = { box, balloon, tether, boxPos, face };
      }
      if (inChunk(W.x, W.z, x0, z0, size)) {
        any = true;
        const wp = G1.whirl();
        wp.position.set(W.x, 0, W.z);
        grp.add(wp);
        live.whirl = wp;
      }
      if (shoreSpot && inChunk(shoreSpot.x, shoreSpot.z, x0, z0, size)) {
        any = true;
        const wr = G1.shore();
        const body = new THREE.Mesh(wr.body, M.glossy);
        const glow = new THREE.Mesh(wr.glow, M.glow);
        for (const m of [body, glow]) { m.position.set(shoreSpot.x, shoreSpot.y, shoreSpot.z); m.rotation.y = shoreSpot.yaw; }
        body.castShadow = true;
        grp.add(body, glow);
        live.shore = glow;
      }
      return any ? grp : null;
    },
    dispose: (o) => {
      o.traverse((x) => {
        if (live.ghost && x === live.ghost.surf) live.ghost = null;
        if (live.ufo && x === live.ufo.box) live.ufo = null;
        if (x === live.whirl) live.whirl = null;
        if (x === live.shore) live.shore = null;
      });
      o.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh && m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); });
    },
  });

  // ───────── 유령선 일정 ─────────
  let ghostUp = false, ghostK = 0, forceGhost: boolean | null = null, ghostAnnounced = -1;
  const ghostWeather = () => { try { return g.env?.regionWeather?.(GS.x, GS.z) ?? g.env?.weather ?? 'clear'; } catch { return 'clear'; } };
  const checkGhost = () => { ghostUp = forceGhost ?? ghostSurfaced(hourNow(), ghostWeather()); };

  // ───────── 상자(근처 풀) ─────────
  const chestDescs: ChestDesc[] = [];
  const chests = new Map<string, LiveChest>();
  const tmpV = new THREE.Vector3();
  const openSea = (x: number, z: number) => island.heightAt(x, z) < -10 && -island.coastDistAt(x, z) > 160 /* 바다 쪽은 음수 */ && !F.onBand(x, z) && Math.hypot(x - W.x, z - W.z) > W.r * 2;
  let chestDay = -1;
  const rebuildChests = () => {
    chestDescs.length = 0;
    const day = dayNow();
    chestDay = day;
    for (const c of driftChests(day, openSea)) {
      chestDescs.push({ id: c.id, tier: c.tier, where: 'drift', kind: 'drift', pos: (gs) => { const p = driftPos(c, gs); return tmpV.set(p.x, 0, p.z); } });
    }
    const ring = W.r * WHIRL_RING;
    for (const c of whirlChests(day)) {
      chestDescs.push({ id: c.id, tier: c.tier, where: 'whirlpool', kind: 'whirl', pos: (gs) => { const a = whirlAngle(c, gs, ring); return tmpV.set(W.x + Math.cos(a) * ring, -0.15 - (1 - c.lift) * 0.2, W.z + Math.sin(a) * ring); } });
    }
    for (const c of pirateChests(day, pirateDay())) {
      chestDescs.push({ id: c.id, tier: 'silver', where: 'pirate', kind: 'pirate', pos: (gs) => { const a = c.a + gs * 0.004; return tmpV.set(GS.x + Math.cos(a) * c.r, 0, GS.z + Math.sin(a) * c.r); } });
    }
    // 유령선 갑판 은상자(유령선이 떠 있을 때만)
    chestDescs.push({
      id: `ghost:${day}`, tier: 'silver', where: 'ghost', kind: 'ghost',
      pos: () => {
        const gh = live.ghost;
        if (!gh || ghostK < 0.6) return null;
        gh.surf.updateMatrixWorld();
        return tmpV.copy(gh.deck).applyMatrix4(gh.surf.matrixWorld);
      },
    });
    // 날이 바뀌어 사라진 상자는 치운다
    for (const [id, lc] of chests) if (!chestDescs.some((d) => d.id === id)) { root.remove(lc.mesh); chests.delete(id); }
  };
  rebuildChests();
  const isOpened = (id: string) => SF().opened.includes(id);
  const puffs: Array<{ m: THREE.Mesh; t: number }> = [];
  const puffG = foamRingGeo();
  const openChest = (lc: LiveChest) => {
    const f = SF();
    if (f.opened.includes(lc.d.id)) return false;
    f.opened.push(lc.d.id);
    st.save();
    const e = g.econ;
    // 유령선·해적 은상자는 'ghost' 자리(계약: econ.openChest('silver','ghost'))
    const where = lc.d.kind === 'ghost' || lc.d.kind === 'pirate' ? 'ghost' : lc.d.where;
    if (e && typeof e.openChest === 'function') e.openChest(lc.d.tier, where);
    else { const n = { wood: 300, silver: 1200, gold: 4000 }[lc.d.tier]; st.addCoins(n, `${where} 상자`); say(`상자에서 코인 ${n.toLocaleString()}개! ✨`); }
    const ring = new THREE.Mesh(puffG, M.foam.clone());
    ring.position.set(lc.pos.x, 0.1, lc.pos.z);
    applyCurve(ring);
    root.add(ring);
    puffs.push({ m: ring, t: 0 });
    sfx('splash', { x: lc.pos.x, z: lc.pos.z, vol: 0.6 });
    lc.mesh.visible = false;
    return true;
  };
  const updateChests = (t: number, dt: number) => {
    const gs = gameSec(), pl = g.player.pos;
    for (const d of chestDescs) {
      const have = chests.get(d.id);
      if (isOpened(d.id)) { if (have) { root.remove(have.mesh); chests.delete(d.id); } continue; }
      const p = d.pos(gs, t);
      if (!p) { if (have) have.mesh.visible = false; continue; }
      const dist = Math.hypot(p.x - pl.x, p.z - pl.z);
      if (!have) {
        if (dist > CHEST_NEAR) continue;
        const mesh = new THREE.Mesh(chestGeo(d.tier), M.chest);
        mesh.castShadow = true;
        applyCurve(mesh);
        root.add(mesh);
        chests.set(d.id, { d, mesh, pos: new THREE.Vector3() });
        continue;
      }
      if (dist > CHEST_FAR) { root.remove(have.mesh); chests.delete(d.id); continue; }
      have.pos.copy(p);
      const wave = g.ocean?.waveAt?.(p.x, p.z, t) ?? 0;
      have.mesh.visible = true;
      have.mesh.position.set(p.x, d.kind === 'ghost' ? p.y : p.y + wave - 0.12 + Math.sin(t * 1.3 + p.x) * 0.06, p.z);
      have.mesh.rotation.set(Math.sin(t * 0.9 + p.z) * 0.08, t * 0.25 + p.x, Math.cos(t * 1.1 + p.x) * 0.08);
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const pf = puffs[i];
      pf.t += dt;
      const k = pf.t / 0.9;
      pf.m.scale.setScalar(0.6 + k * 2.4);
      (pf.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      if (k >= 1) { root.remove(pf.m); (pf.m.material as THREE.Material).dispose(); puffs.splice(i, 1); }
    }
  };
  /** 배로 스치면 연다(유령선 갑판 상자는 E 로) */
  const boatTouch = () => {
    const v = g.vehicles?.current?.();
    if (!g.player.mounted || !v?.boat) return;
    const pl = g.player.pos;
    for (const lc of chests.values()) {
      if (!lc.mesh.visible || lc.d.kind === 'ghost') continue;
      if (Math.hypot(lc.pos.x - pl.x, lc.pos.z - pl.z) < BOAT_TOUCH) openChest(lc);
    }
  };
  g.addProvider('seaworld-chest', (p) => {
    let best: { lc: LiveChest; d: number } | null = null;
    const mounted = !!p.mounted;
    for (const lc of chests.values()) {
      if (!lc.mesh.visible || isOpened(lc.d.id)) continue;
      const dh = Math.hypot(lc.pos.x - p.pos.x, lc.pos.z - p.pos.z);
      // 유령선 갑판: 배로 선체 곁(16 m) 또는 헤엄쳐 옆(8 m)
      const reach = lc.d.kind === 'ghost' ? (mounted ? 16 : 8) : SWIM_REACH;
      if (lc.d.kind !== 'ghost' && mounted) continue; // 떠다니는 상자는 배로 스치면 열린다
      if (lc.d.kind !== 'ghost' && Math.abs(lc.pos.y - p.pos.y) > 2.5) continue;
      if (dh <= reach && (!best || dh < best.d)) best = { lc, d: dh };
    }
    if (!best) return null;
    const b = best;
    const name = b.lc.d.kind === 'ghost' ? '으스스호 은상자 열기 👻' : b.lc.d.kind === 'pirate' ? '해적 은상자 열기 🏴‍☠️' : '떠다니는 상자 열기 ✨';
    return { id: 'seaworld-chest', label: name, dist: b.d, whileMounted: true, use: () => { openChest(b.lc); g.player.act('pick', 0.8); } };
  });

  // ───────── 블랙박스 ─────────
  const takeBox = () => {
    const r = takeBlackBox(SF(), { give: (id, n) => give(id, n, 'blackbox'), emit: (e) => st.emit(e) });
    if (r === 'taken') {
      st.save();
      if (live.ufo) live.ufo.box.visible = live.ufo.balloon.visible = live.ufo.tether.visible = false;
      g.hud.card({ title: '별빛 탐사선의 블랙박스 📦', body: '삐빅… 삐빅… 누군가 저 하늘 위에서 보낸 기록이 들어 있어요. 펭박사에게 보여 줄까요?', icon: '🛸', color: '#c9b6f2' });
      g.player.act('hold', 1.2);
    } else if (r === 'full') say('가방이 꽉 찼어요! 블랙박스를 넣을 자리가 없어요');
    return r;
  };
  g.addProvider('seaworld-blackbox', (p) => {
    const u = live.ufo;
    if (!u || SF().blackbox) return null;
    const d = p.pos.distanceTo(u.boxPos);
    const reach = p.mounted ? 12 : 4.5;
    if (d > reach) return null;
    return { id: 'seaworld-blackbox', label: '블랙박스 줍기 📦', dist: d, whileMounted: true, use: () => { takeBox(); } };
  });

  // ───────── 혹등고래(고래 길) ─────────
  const whale = {
    root: new THREE.Group(), body: new THREE.Group(), placed: false, x: 0, z: 0, dir: 1, spouting: false, rewarded: -1, force: false, k: 0,
    spout: new THREE.InstancedMesh(puffGeo(), M.foam, 28),
  };
  whale.body.add(new THREE.Mesh(humpbackGeo(), M.body), whaleFace());
  whale.body.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.eye && !o.name.startsWith('blush')) o.castShadow = true; });
  whale.root.add(whale.body);
  whale.spout.frustumCulled = false;
  whale.spout.count = 0;
  root.add(whale.root, whale.spout);
  whale.root.visible = false;
  const rainbow = new THREE.Mesh(rainbowGeo(), M.rainbow);
  rainbow.visible = false;
  root.add(rainbow);
  let rainbowT = -1;
  const coins = new THREE.InstancedMesh(coinGeo(), M.coin, 40);
  coins.frustumCulled = false;
  coins.count = 0;
  root.add(coins);
  let coinRain: { t: number; n: number; x: number; y: number; z: number; seed: number } | null = null;
  let fridayToast = -1;
  const humpback = () => (st.byGdd('d_humpback') as Species | undefined) ?? null;
  const dolphinSp = () => (st.byGdd('d_dolphins') as Species | undefined) ?? null;
  const pM = new THREE.Matrix4(), pQ = new THREE.Quaternion(), pS = new THREE.Vector3(), pP = new THREE.Vector3();
  const spoutReward = () => {
    const f = SF(), day = dayNow(), fri = whaleDay();
    if (f.whaleN >= WHALE_MAX_PER_DAY) { say('고래가 반갑게 물을 뿜어 줬어요 🐋'); return 0; }
    const n = whaleCoins(day, f.whaleN, fri);
    f.whaleN++;
    st.addCoins(n, '고래 분수');
    // 무지개 + 코인 비
    const pl = g.player.pos;
    // 카메라에서 본 플레이어 너머 18 m 에 무지개(늘 화면 안에 걸린다)
    const cam = ctx.camera.position;
    const fx = pl.x - cam.x, fz = pl.z - cam.z, fl = Math.hypot(fx, fz) || 1;
    rainbow.position.set(pl.x + (fx / fl) * 18, 0, pl.z + (fz / fl) * 18);
    rainbow.rotation.y = Math.atan2(fx, fz);
    rainbowT = 0;
    coinRain = { t: 0, n: coinDrops(n), x: pl.x, y: pl.y + 7, z: pl.z, seed: day * 31 + f.whaleN };
    g.hud.banner({ text: '무지개다! 🌈', sub: `고래 분수 코인 비 +${n.toLocaleString()}`, icon: '🐋', color: '#8fd3f4' });
    sfx('shiny');
    const sp = humpback();
    if (sp && !f.whaleSeen) { f.whaleSeen = true; g.ui.showCatch({ species: sp, line: sp.desc ?? '분수에 맞으면 무지개.', keep: false, activity: 'witness' }); }
    st.save();
    return n;
  };
  const updateWhale = (t: number, dt: number) => {
    const pl = g.player.pos, day = dayNow(), fri = whaleDay();
    const active = whale.force || whaleActive(day, hourNow(), fri);
    const road = roadNearest(pl.x, pl.z);
    if (fri && road.d < 400 && fridayToast !== day) { fridayToast = day; g.hud.banner({ text: '오늘은 고래 길! 🐋', sub: '혹등고래가 물을 뿜으러 놀러 왔어요', color: '#4a9cf0' }); }
    if (active && !whale.placed && road.d < 320) {
      // 플레이어 앞 고래 길 위(70 m)에 떠오른다 — 모래시계섬 쪽 또는 반대쪽으로 천천히
      whale.dir = ((Math.floor(gameSec() / HOUR_SEC) + day) % 2) ? 1 : -1;
      const ahead = clamp(road.u * road.len + 70 * whale.dir, 0, road.len);
      whale.x = WHALE_ROAD.a.x + road.tx * ahead + road.tz * 18;
      whale.z = WHALE_ROAD.a.z + road.tz * ahead - road.tx * 18;
      whale.placed = true;
    }
    if (whale.placed && (!active || Math.hypot(whale.x - pl.x, whale.z - pl.z) > 450)) whale.placed = false;
    whale.k += ((whale.placed ? 1 : 0) - whale.k) * Math.min(1, dt * 0.6);
    whale.root.visible = whale.k > 0.03;
    whale.spout.count = 0;
    whale.spouting = false;
    if (!whale.root.visible) return;
    if (whale.placed) { whale.x += road.tx * whale.dir * 1.6 * dt; whale.z += road.tz * whale.dir * 1.6 * dt; }
    const ph = whalePhase(t);
    const yaw = Math.atan2(road.tx * whale.dir, road.tz * whale.dir);
    whale.root.position.set(whale.x, -4.6 + ph.surf * 3.6 * whale.k + (g.ocean?.waveAt?.(whale.x, whale.z, t) ?? 0), whale.z);
    whale.root.rotation.set(Math.sin(t * 0.4) * 0.04 - ph.surf * 0.05, yaw, Math.sin(t * 0.3) * 0.05);
    breathe(whale.body, t, 0.21);
    // 분수(숨구멍 = 몸 좌표 (0, 2.4, 2.4))
    whale.root.updateMatrixWorld();
    const hole = new THREE.Vector3(0, 2.4, 2.4).applyMatrix4(whale.root.matrixWorld);
    whale.spouting = ph.spouting && whale.k > 0.7;
    if (whale.spouting) {
      const age = ph.k - 2.5;
      let n = 0;
      for (let i = 0; i < 28; i++) {
        const u = ((i / 28) + age * 0.85) % 1;
        const ang = i * 2.39996, spread = u * 1.8;
        pM.compose(pP.set(hole.x + Math.cos(ang) * spread, hole.y + u * 9.5, hole.z + Math.sin(ang) * spread), pQ.identity(), pS.setScalar(0.5 + u * 1.3));
        whale.spout.setMatrixAt(n++, pM);
      }
      whale.spout.count = n;
      whale.spout.instanceMatrix.needsUpdate = true;
      // 분수 기둥을 지나가면(수평 6 m) 한 번
      if (ph.cycle !== whale.rewarded && Math.hypot(pl.x - hole.x, pl.z - hole.z) < 6 && pl.y < hole.y + 10) {
        whale.rewarded = ph.cycle;
        spoutReward();
      }
      if (ph.k - 2.5 < 0.05) sfx('splash', { x: hole.x, z: hole.z, vol: 0.8, pitch: 0.7 });
    }
  };
  const updateRainbow = (dt: number) => {
    if (rainbowT >= 0) {
      rainbowT += dt;
      const k = rainbowT < 0.8 ? rainbowT / 0.8 : rainbowT > 5 ? Math.max(0, 1 - (rainbowT - 5) / 1.5) : 1;
      rainbow.visible = k > 0;
      M.rainbow.opacity = 0.75 * k;
      rainbow.scale.setScalar(0.6 + 0.4 * Math.min(1, rainbowT / 0.8));
      if (rainbowT > 6.5) { rainbowT = -1; rainbow.visible = false; }
    }
    if (coinRain) {
      const c = coinRain;
      c.t += dt;
      const r = ctx.rng(`seaworld:coinrain:${c.seed}`);
      for (let i = 0; i < c.n; i++) {
        const delay = r() * 0.9, ox = (r() - 0.5) * 5, oz = (r() - 0.5) * 5, spin = r() * 6;
        const tt = Math.max(0, c.t - delay);
        const y = c.y - 4.5 * tt * tt;
        pM.compose(pP.set(c.x + ox, Math.max(y, g.player.pos.y + 0.3), c.z + oz), pQ.setFromEuler(new THREE.Euler(0, spin + c.t * 8, 0.3)), pS.setScalar(y > g.player.pos.y + 0.4 ? 1.4 : 0.0001));
        coins.setMatrixAt(i, pM);
      }
      coins.count = c.n;
      coins.instanceMatrix.needsUpdate = true;
      if (c.t > 2.6) { coinRain = null; coins.count = 0; }
    }
  };

  // ───────── 돌고래 경주 ─────────
  const POD = 4;
  const dolIm = new THREE.InstancedMesh(dolphinGeo(), M.body, POD);
  const dolEyes = eyeInstances(bakedEyes({ size: 0.17, y: 0.12, z: 0.97, gap: 0.52, splay: 0.55 }), POD);
  const dolRoot = new THREE.Group();
  dolRoot.name = 'seaworld-dolphins';
  for (const im of [dolIm, ...dolEyes]) { im.frustumCulled = false; dolRoot.add(im); }
  dolIm.castShadow = true;
  dolRoot.visible = false;
  root.add(dolRoot);
  const race = newRace();
  let podK = 0;
  const lastPos = new THREE.Vector3().copy(g.player.pos);
  const heading = { x: 0, z: 1 };
  let raceWarn = 0;
  const updateRace = (t: number, dt: number) => {
    const pl = g.player.pos;
    const v = g.vehicles?.current?.();
    if (dt > 0) {
      const dx = pl.x - lastPos.x, dz = pl.z - lastPos.z, l = Math.hypot(dx, dz);
      if (l > 0.05 && l < 60) { heading.x += (dx / l - heading.x) * Math.min(1, dt * 3); heading.z += (dz / l - heading.z) * Math.min(1, dt * 3); }
      const hl = Math.hypot(heading.x, heading.z) || 1; heading.x /= hl; heading.z /= hl;
    }
    lastPos.copy(pl);
    const offshore = island.heightAt(pl.x, pl.z) < -8;
    const ok = !!g.player.mounted && !!v?.boat && Math.abs(v.speed) >= RACE_SPEED && offshore;
    const allowed = SF().raceN < RACE_MAX_PER_DAY;
    const ev = stepRace(race, ok, dt, allowed);
    if (ev === 'start') say('돌고래 떼가 배 옆에 나란히! 20초 동안 속도를 유지해요 🐬');
    else if (ev === 'lost') say('앗, 돌고래들이 떨어져 나갔어요… 다시 달려 봐요!');
    else if (ev === 'win') {
      const f = SF();
      const n = raceCoins(dayNow(), f.raceN);
      f.raceN++;
      st.addCoins(n, '돌고래 경주');
      g.hud.banner({ text: '돌고래랑 끝까지 나란히! 🐬', sub: `신나게 점프한 돌고래들이 코인 +${n.toLocaleString()}`, color: '#8fd3f4' });
      const sp = dolphinSp();
      if (sp) g.ui.showCatch({ species: sp, line: sp.desc ?? '배랑 경주하는 걸 좋아한다.', keep: false, activity: 'witness' });
      st.save();
    }
    if (race.mode === 'race' && ok && raceWarn > 0) raceWarn = 0;
    g.hud.gauge('seaworld-race', { label: '🐬 돌고래와 나란히', value: clamp(race.progress / RACE_SEC, 0, 1), color: '#8fd3f4', show: race.mode === 'race' });
    const want = race.mode === 'arrive' || race.mode === 'race' ? 1 : 0;
    podK += (want - podK) * Math.min(1, dt * (want ? 1.2 : 0.6));
    dolRoot.visible = podK > 0.03 && dt >= 0;
    if (!dolRoot.visible) return;
    // 배 오른쪽 6~10 m 에서 나란히(떠날 땐 뒤로 처진다)
    const sx = -heading.z, sz = heading.x;
    const lag = (1 - podK) * 25;
    for (let i = 0; i < POD; i++) {
      const cyc = 2.6, tt = (t + i * 0.47) % cyc, jump = 1.05;
      const side = 6 + (i % 2) * 3.2, fwd = (i - 1.5) * 2.6 - lag + Math.sin(t * 0.8 + i) * 0.8;
      let y = -0.9, pitch = 0;
      if (tt < jump) { const u = tt / jump; y = -0.5 + Math.sin(u * Math.PI) * 2.4; pitch = (0.5 - u) * 1.5; }
      const x = pl.x + sx * side + heading.x * fwd, z = pl.z + sz * side + heading.z * fwd;
      fE.set(-pitch, Math.atan2(heading.x, heading.z), 0);
      fM.compose(fP.set(x, y + (g.ocean?.waveAt?.(x, z, t) ?? 0), z), fQ.setFromEuler(fE), fS.setScalar(podK));
      dolIm.setMatrixAt(i, fM);
      for (const e of dolEyes) e.setMatrixAt(i, fM);
    }
    for (const im of [dolIm, ...dolEyes]) im.instanceMatrix.needsUpdate = true;
  };

  // ───────── 갈매기 도둑 ─────────
  const gb = buildGull();
  gb.root.visible = false;
  gb.root.scale.setScalar(1.6);
  root.add(gb.root);
  const thief = { mode: 'idle' as 'idle' | 'swoop' | 'flee' | 'leave', key: '', t: 0, cx: 0, cz: 0, ang: 0, pos: new THREE.Vector3(), slot: -1, today: 0, day: -1, from: new THREE.Vector3() };
  const fishInfo = (k: string) => {
    const sp = st.species.get(splitVariant(k).id);
    return sp && sp.category === 'fish' ? { rarity: sp.rarity } : null;
  };
  const nearWater = () => {
    const p = g.player;
    if (p.mounted) return !!g.vehicles?.current?.()?.boat;
    if (p.mode === 'swim' || p.mode === 'dive') return p.mode === 'swim';
    const h = island.heightAt(p.pos.x, p.pos.z);
    return h < 2.5 && Math.abs(island.coastDistAt(p.pos.x, p.pos.z)) < 30;
  };
  const steal = (force = false): boolean => {
    if (thief.mode !== 'idle') return false;
    const day = dayNow();
    const key = pickStealable(st.bag, fishInfo, ctx.rng(`seaworld:gull-pick:${day}:${thief.slot}:${force ? 'f' : ''}`));
    if (!key) return false;
    st.addItem(key, -1);
    const f = SF();
    f.gull = key;
    st.save();
    thief.key = key;
    thief.mode = 'swoop';
    thief.t = 0;
    const pl = g.player.pos;
    const a = ctx.rng(`seaworld:gull-from:${day}:${thief.slot}`)() * Math.PI * 2;
    thief.from.set(pl.x + Math.cos(a) * 30, pl.y + 14, pl.z + Math.sin(a) * 30);
    thief.pos.copy(thief.from);
    thief.cx = pl.x; thief.cz = pl.z;
    thief.ang = a + Math.PI;
    gb.root.visible = true;
    gb.fish.visible = true;
    const name = st.species.get(splitVariant(key).id)?.name ?? '물고기';
    g.hud.banner({ text: '앗! 갈매기 도둑 🐦', sub: `${name}을(를) 물고 달아나요 — 쫓아가서 되찾아요!`, color: '#ffa24c' });
    sfx('net-miss', { x: pl.x, z: pl.z });
    return true;
  };
  const gullEnd = (got: boolean) => {
    const f = SF();
    if (got && thief.key) {
      // 되찾은 물고기는 새 잡기가 아니다 — 가방에 조용히 되돌린다(미션·통계가 두 번 세지 않게)
      st.addItem(thief.key, 1);
      give('m_feather', 1, 'gull');
      say('되찾았다! 갈매기가 미안하다며 깃털도 하나 떨어뜨렸어요 🪶');
      sfx('pick');
    } else say('갈매기가 수평선 너머로 날아갔어요… 다음엔 꼭 잡아요!');
    f.gull = null;
    st.save();
    thief.mode = 'leave';
    thief.t = 0;
    gb.fish.visible = false;
    g.hud.gauge('seaworld-gull', { label: '🐦 갈매기 쫓기', value: 0, color: '#ffa24c', show: false });
  };
  const groundOrWater = (x: number, z: number) => Math.max(0, island.heightAt(x, z));
  const updateGull = (t: number, dt: number) => {
    const day = dayNow();
    if (thief.day !== day) { thief.day = day; thief.today = SF().day === day ? SF().gullN ?? 0 : 0; }
    const slot = Math.floor(gameSec() / GULL_CHECK);
    if (thief.mode === 'idle' && slot !== thief.slot) {
      thief.slot = slot;
      if (thief.today < 2 && nearWater() && gullRoll(day, slot) && steal()) { thief.today++; SF().gullN = thief.today; st.save(); }
    }
    if (thief.mode === 'idle') return;
    thief.t += dt;
    const pl = g.player.pos;
    const v = g.vehicles?.current?.();
    if (thief.mode === 'swoop') {
      // 위에서 휙 내려와 머리 위를 스치고 달아난다
      const k = Math.min(1, thief.t / 1.3);
      thief.pos.lerpVectors(thief.from, tmpV.set(pl.x, pl.y + 2.4, pl.z), k * k * (3 - 2 * k));
      if (k >= 1) {
        // 내려온 방향 그대로 12 m 앞을 가운데로 삼아 달아난다
        const dx = pl.x - thief.from.x, dz = pl.z - thief.from.z, l = Math.hypot(dx, dz) || 1;
        thief.mode = 'flee'; thief.t = 0; thief.cx = pl.x + (dx / l) * 12; thief.cz = pl.z + (dz / l) * 12;
        thief.ang = Math.atan2(pl.z - thief.cz, pl.x - thief.cx);
      }
    } else if (thief.mode === 'flee') {
      // 둥근 원을 그리며 플레이어에게서 멀어진다(가운데가 천천히 달아남 → 모퉁이를 질러 가면 잡힌다)
      const awayX = thief.cx - pl.x, awayZ = thief.cz - pl.z, al = Math.hypot(awayX, awayZ) || 1;
      const sp = g.player.mounted ? Math.min(14, 0.55 * Math.max(10, Math.abs(v?.speed ?? 10))) : 3.2;
      thief.cx += (awayX / al) * sp * dt;
      thief.cz += (awayZ / al) * sp * dt;
      thief.ang += dt * 0.75;
      const tx = thief.cx + Math.cos(thief.ang) * 9, tz = thief.cz + Math.sin(thief.ang) * 9;
      const ty = groundOrWater(tx, tz) + 2.6 + Math.sin(t * 2) * 0.4;
      thief.pos.x += (tx - thief.pos.x) * Math.min(1, dt * 2.5);
      thief.pos.z += (tz - thief.pos.z) * Math.min(1, dt * 2.5);
      thief.pos.y += (ty - thief.pos.y) * Math.min(1, dt * 2);
      const left = Math.max(0, 1 - thief.t / GULL_CHASE);
      g.hud.gauge('seaworld-gull', { label: '🐦 갈매기 쫓기', value: left, color: '#ffa24c', show: true });
      const dh = Math.hypot(thief.pos.x - pl.x, thief.pos.z - pl.z);
      // 채 가자마자(1.2초 안)는 못 잡는다 — 쫓아가야 한다
      if (dh < GULL_CATCH && thief.t > 1.2) gullEnd(true);
      else if (thief.t > GULL_CHASE || dh > 140) gullEnd(false);
    } else if (thief.mode === 'leave') {
      thief.pos.y += dt * 6;
      thief.pos.x += Math.cos(thief.ang) * dt * 10;
      thief.pos.z += Math.sin(thief.ang) * dt * 10;
      if (thief.t > 3) { thief.mode = 'idle'; gb.root.visible = false; }
    }
    const prev = gb.root.position.clone();
    gb.root.position.copy(thief.pos);
    const mx = thief.pos.x - prev.x, mz = thief.pos.z - prev.z;
    if (Math.hypot(mx, mz) > 1e-3) gb.root.rotation.y = Math.atan2(mx, mz);
    const flap = Math.sin(t * 14) * 0.7;
    gb.wingR.rotation.z = flap; gb.wingL.rotation.z = -flap;
  };

  // ───────── 수영하면 떠내려간다 · 배로 탄 거리 ─────────
  let bandHint = false, rodeSave = 0;
  const updateSwimAndRide = (dt: number) => {
    const p = g.player;
    if (dt <= 0) return;
    if (p.mode === 'swim' && !p.mounted) {
      const c = F.at(p.pos.x, p.pos.z);
      if (c) {
        const dx = c.x * SWIM_DRIFT * dt, dz = c.z * SWIM_DRIFT * dt;
        // 코어 push 로 다음 이동에 얹는다(몸체를 직접 옮기면 물리 스텝과 어긋난다). 옛 코어면 몸체를 옮기는 예전 길
        const pp = p as unknown as { push?(dx: number, dz: number): void; body?: { translation(): { x: number; y: number; z: number }; setTranslation(v: { x: number; y: number; z: number }, w: boolean): void } };
        if (typeof pp.push === 'function') pp.push(dx, dz);
        else {
          const body = pp.body;
          if (body && typeof body.translation === 'function') { const tr = body.translation(); body.setTranslation({ x: tr.x + dx, y: tr.y, z: tr.z + dz }, true); }
          p.pos.x += dx; p.pos.z += dz;
        }
        if (!bandHint && F.onBand(p.pos.x, p.pos.z)) { bandHint = true; say('둥둥~ 해류에 실려 떠내려가요 🛟'); }
      }
    }
    const v = g.vehicles?.current?.();
    if (p.mounted && v?.boat && F.onBand(p.pos.x, p.pos.z)) {
      if (!bandHint) { bandHint = true; say('해류 고속도로! 물살을 타면 +8 m/s 슝~ 🌊'); }
      const f = SF();
      f.rode += Math.abs(v.speed) * dt;
      rodeSave += dt;
      if (rodeSave > 3) { rodeSave = 0; st.save(); }
    }
  };

  // ───────── 목격(사진 모드·인사) ─────────
  g.witnesses?.add?.((): Witness[] => {
    const out: Witness[] = [];
    if (g.world !== 'earth') return out;
    if (whale.root.visible && whale.k > 0.5) out.push({ speciesId: 'd_humpback', pos: whale.root.position.clone() });
    if (dolRoot.visible && podK > 0.5) { dolIm.getMatrixAt(0, fM); out.push({ speciesId: 'd_dolphins', pos: new THREE.Vector3().setFromMatrixPosition(fM) }); }
    return out;
  });

  // ───────── 지도: 해류 고리 + 바다 장소 ─────────
  try {
    g.hud.registerMapLayer({
      id: 'seaworld-currents', order: 5,
      draw: (g2, toPx, _scale, world) => {
        if (world !== 'earth') return;
        g2.save();
        g2.strokeStyle = 'rgba(255,255,255,0.8)';
        g2.lineWidth = 3;
        g2.setLineDash([7, 5]);
        g2.beginPath();
        for (let i = 0; i <= F.n; i += 4) { const k = i % F.n; const [px, pz] = toPx(F.xs[k], F.zs[k]); if (i === 0) g2.moveTo(px, pz); else g2.lineTo(px, pz); }
        g2.closePath();
        g2.stroke();
        g2.setLineDash([]);
        g2.fillStyle = 'rgba(255,255,255,0.95)';
        for (let s = 300; s < F.length; s += 900) {
          const a = F.pointAt(s), b = F.pointAt(s + 40);
          const [ax, az] = toPx(a.x, a.z), [bx, bz] = toPx(b.x, b.z);
          const ang = Math.atan2(bz - az, bx - ax);
          g2.beginPath();
          g2.moveTo(bx + Math.cos(ang) * 6, bz + Math.sin(ang) * 6);
          g2.lineTo(bx + Math.cos(ang + 2.5) * 6, bz + Math.sin(ang + 2.5) * 6);
          g2.lineTo(bx + Math.cos(ang - 2.5) * 6, bz + Math.sin(ang - 2.5) * 6);
          g2.fill();
        }
        g2.font = '16px Jua, sans-serif';
        g2.textAlign = 'center';
        g2.textBaseline = 'middle';
        for (const [x, z, ic] of [[GS.x, GS.z, '👻'], [UF.x, UF.z, '🛸'], [W.x, W.z, '🌀']] as const) { const [px, pz] = toPx(x, z); g2.fillText(ic, px, pz); }
        g2.restore();
      },
    });
  } catch { /* 지도 없음 */ }

  // ───────── 매 프레임 ─────────
  let slow = 0;
  ctx.onUpdate((t, dt) => {
    bandUniforms.uTime.value = t;
    if (g.world !== 'earth') { gb.root.visible = whale.root.visible = dolRoot.visible = false; return; }
    const hour = hourNow();
    const night = hour < 5 || hour >= 20 ? 1 : hour < 7 ? (7 - hour) / 2 : hour > 18 ? (hour - 18) / 2 : 0;
    bandUniforms.uLight.value = 1 - 0.55 * night;
    slow -= dt;
    if (slow <= 0 || dt === 0) {
      slow = 0.5;
      const day = dayNow();
      if (rollSeaDay(SF(), day) || day !== chestDay) { rebuildChests(); st.save(); }
      checkGhost();
    }
    // 유령선: 스르르 나타났다 사라진다
    ghostK += ((ghostUp ? 1 : 0) - ghostK) * Math.min(1, dt * 0.4 + (dt === 0 ? 1 : 0));
    const gh = live.ghost;
    if (gh) {
      gh.surf.visible = ghostK > 0.02;
      M.ghost.opacity = 0.8 * ghostK;
      gh.surf.position.y = -2.5 + 1.9 * ghostK + Math.sin(t * 0.7) * 0.25;
      gh.surf.rotation.z = Math.sin(t * 0.5) * 0.04;
      gh.spirits.forEach((s, i) => {
        const a = t * 0.5 + i * Math.PI;
        s.position.set(Math.cos(a) * 4.5, 6 + Math.sin(t * 1.3 + i) * 0.6, Math.sin(a) * 9);
        s.rotation.y = a + Math.PI / 2;
        breathe(s, t, s.userData.ph as number);
      });
      if (ghostUp && ghostK > 0.5 && ghostAnnounced !== dayNow() && Math.hypot(g.player.pos.x - GS.x, g.player.pos.z - GS.z) < 700) {
        ghostAnnounced = dayNow();
        g.hud.banner({ text: '으스스호가 떠올랐어요 👻', sub: '안개 낀 밤에만 나타나는 유령선 — 갑판의 은상자를 열어 봐요', color: '#a77be0' });
      }
    }
    // 블랙박스 깜빡이 · 풍선 둥실
    const u = live.ufo;
    if (u && u.box.visible) {
      boxMat.emissiveIntensity = 0.25 + 0.55 * (Math.sin(t * 5) > 0.6 ? 1 : 0);
      u.balloon.position.y = u.boxPos.y + 1.6 + Math.sin(t * 1.1) * 0.15;
      u.box.rotation.y = Math.sin(t * 0.6) * 0.4;
    }
    if (live.shore) M.glow.emissiveIntensity = 0.35 + night * (0.8 + 0.3 * Math.sin(t * 1.7));
    updateFish(t);
    updateChests(t, dt);
    boatTouch();
    updateWhale(t, dt);
    updateRainbow(dt);
    updateRace(t, dt);
    updateGull(t, dt);
    updateSwimAndRide(dt);
  });

  // ───────── 디버그 ─────────
  const go = (x: number, z: number) => { g.player.teleport(x, z); return { x, z }; };
  const hooks = {
    currentAt: (x: number, z: number) => F.at(x, z),
    onBand: (x: number, z: number) => F.onBand(x, z),
    nearest: (x: number, z: number) => F.nearest(x, z),
    length: () => F.length,
    /** 띠 위 길이 s 지점으로(기본 = 원점 앞바다 근처) */
    goBand: (s = 120) => { const p = F.pointAt(s); return go(p.x, p.z); },
    goGhost: () => go(GS.x + 30, GS.z + 30),
    goUfo: () => go(UF.x + 6, UF.z + 6),
    goWhirl: () => go(W.x + W.r * 1.4, W.z),
    goRoad: (u = 0.5) => go(WHALE_ROAD.a.x + (WHALE_ROAD.b.x - WHALE_ROAD.a.x) * u, WHALE_ROAD.a.z + (WHALE_ROAD.b.z - WHALE_ROAD.a.z) * u),
    /** 유령선 강제(true/false), null = 일정대로 */
    ghost: (on: boolean | null = true) => { forceGhost = on; checkGhost(); if (on !== null) ghostK = on ? 1 : 0; return { up: ghostUp, weather: ghostWeather(), hour: hourNow() }; },
    whale: (on = true) => { whale.force = on; return { active: on || whaleActive(dayNow(), hourNow(), whaleDay()), windows: whaleActive }; },
    /** 고래 분수 보상 한 번(무지개 + 코인 비) */
    spout: () => spoutReward(),
    race: () => ({ ...race }),
    gull: () => { thief.mode = 'idle'; return steal(true); },
    takeBlackBox: () => takeBox(),
    chests: () => chestDescs.map((d) => { const p = d.pos(gameSec(), g.time); return { id: d.id, kind: d.kind, tier: d.tier, opened: isOpened(d.id), x: p ? Math.round(p.x) : null, z: p ? Math.round(p.z) : null }; }),
    /** 가장 가까운 살아 있는 상자를 연다 */
    openNear: () => {
      let best: LiveChest | null = null, bd = Infinity;
      for (const lc of chests.values()) { const d = lc.pos.distanceTo(g.player.pos); if (lc.mesh.visible && d < bd) { bd = d; best = lc; } }
      return best ? openChest(best) : false;
    },
    goChest: (i = 0) => { const d = chestDescs[i]; const p = d?.pos(gameSec(), g.time); return p ? go(p.x + 3, p.z + 3) : null; },
    state: () => ({ ...SF(), floors: { ghost: ghostFloor, ufo: ufoFloor }, ghostUp, ghostK, whale: currents.whale(), race: { ...race }, thief: thief.mode, gullPos: thief.pos.clone(), chests: chests.size, schools: schools.size }),
  };
  if (typeof window !== 'undefined') (window as unknown as { __seaworld?: typeof hooks }).__seaworld = hooks;
  root.userData.hooks = hooks;

  return root;
}
