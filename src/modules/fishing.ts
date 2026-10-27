// 낚시: 물가(강·연못·호수·바다·늪·온천·크레이터·달 연못)에서 E 를 꾹 눌러 충전 → 떼면 휙! 3~10m 앞에 찌가 떨어진다.
// 찌 둘레 6~12m 에 물그림자 1~3개(미리 econ.rollCatch 로 정해 둔 종 — ★4 이상 지느러미, ★5·반짝이는 금빛 반짝)가 나타나고
// 하나가 다가와 톡 · 톡 · 꾹! 꾹 뒤 입질 창(★1~3 0.7초 · ★4 0.55초 · ★5 0.45초, 좋은·황금 낚싯대 +0.1초) 안에 E → 잡았다.
// 톡에 누르거나 창을 놓치면 도망(econ.catchFail). 쓰레기는 카드 + econ.give. 성공은 showCatch(크기·변이·활동) 다음 reportCatch.
// 통통배가 멈춰 있으면(속도 < 1) 갑판에서도 낚시하고, 먼바다·심해 후보는 배 위에서만 열린다. 우주에선 달 연못(space.pondAt)만.
// 달리면(> 6.3 m/s) 물가 그림자가 놀라 달아난다(살금살금). 두근 게이지 80% 를 넘으면 낚싯줄·찌가 분홍으로 반짝.
// 규칙은 fishing/logic.ts(순수), 그림자 그림은 fishing/shadows.ts. 미끼는 X 로 고른다(가진 미끼 + 미끼 없음).
// P1(GDD 3.5 P1 · 3.7 P1):
//   ★4 이상은 꾹에 걸면 릴 줄다리기(fishing/reel.ts 규칙 · fight.ts 화면 — 텐션 = hud.gauge, E 연타, 빨간 칸에선 놓기, 실패 = catchFail).
//   모래 낚시: 모래시계섬 모래 언덕(dune)에서 모래 위로 던진다(medium 'sand' — 모래 그림자·꼬마모래상어·모래고래).
//   트롤링 · 얼음 구멍 미니게임 · 돛등이 낚시 대결 · 협동 릴 돕기는 fishing/p1.ts.
//   협동 릴: game.ext.net?.peer 가 있으면 'net-coop' {kind:'reel'} 을 주고받고, 친구가 같이 감으면 연타 감기가 두 배(fight.ts).
//
// flags.fishing = { bait?: 고른 미끼 id | 'none', casts: 던진 수, catches: 잡은 수, junk: 쓰레기 수,
//                   reel?: {wins, snaps, escapes}, sand?: 모래 낚시 수, troll?, ice?: {day, open[]}, spino?: {played, wins, lastWinDay, best} }
// window.__fishingDebug = { catchNow(id?, size?, variant?), goto(zone | x, z), cast(dist?), bite(), spook(), state(), shadows(), setBait(id),
//                           reel(id?, freeze?), fightState(), sand(), coop(on), …, p1: window.__fishingP1(troll·icehole·spino·contest …) }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import type { Activity, RollResult, RollSpecies, Variant } from '../core/api';
import { applyCurve } from '../core/curve';
import * as FD from './fishing/data';
import { FISH, FISH_BY_ID, PUNS, type FishSpecies } from './fishing/data';
import { buildFishModel, disposeModel, worldLength } from './fishing/model';
import { rollCatch as rollPure, newRollState, type RollQuery as PureQuery } from './economy/roll';
import { itemDef } from './economy/data';
import * as L from './fishing/logic';
import { CastShadows, canvasTex, glowTex, makeAmbient, overWater, ringGeo, ringTex, shadowLenFor, sparkTex } from './fishing/shadows';
import * as RL from './fishing/reel';
import { ReelFight } from './fishing/fight';
import { installP1 } from './fishing/p1';

export const order = 30;

/** 데이터 담당(fishing-data)이 내보내는 구역 후보 함수 — 아직 없으면 logic.zonePool 이 데이터에서 직접 고른다 */
const poolFor = (FD as unknown as { poolFor?: L.PoolFn }).poolFor ?? null;
const FISH_BY_GDD = (FD as unknown as { FISH_BY_GDD?: Map<string, FishSpecies> }).FISH_BY_GDD ?? null;

// ───── 말풍선 텍스처 ─────
const bangTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#6b4a2b'; g.lineWidth = 10;
  g.beginPath(); g.ellipse(128, 118, 96, 92, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(98, 196); g.lineTo(128, 238); g.lineTo(140, 200); g.closePath(); g.fill();
  g.font = 'bold 150px Jua, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ff5a6a';
  g.fillText('!', 128, 124);
});
const tokTex = canvasTex(256, 128, (g) => {
  g.fillStyle = '#fffaf0';
  g.strokeStyle = '#c9a77a'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(14, 14, 228, 96, 46); g.fill(); g.stroke();
  g.font = 'bold 64px Jua, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#8a6a4a';
  g.fillText('톡!', 128, 66);
});
const ggukTex = canvasTex(256, 128, (g) => {
  g.fillStyle = '#ff7eb6';
  g.strokeStyle = '#ffffff'; g.lineWidth = 8;
  g.beginPath(); g.roundRect(14, 14, 228, 96, 46); g.fill(); g.stroke();
  g.font = 'bold 66px Jua, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillText('꾹!', 128, 66);
});

/** 분홍 반짝(두근 게이지 80%+) */
const PINK = new THREE.Color('#ff7eb6');
const WHITE = new THREE.Color('#ffffff');

// ───── 쓰레기 모델(코드로, 통통하게) ─────
function buildJunkModel(id: string): THREE.Group {
  const g = new THREE.Group();
  const std = (c: string, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.6, clearcoat: 0.3, ...o });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  switch (id) {
    case 't_boot': {
      const brown = std('#b08463');
      add(new THREE.CapsuleGeometry(0.16, 0.36, 8, 20), brown, 0, 0.34, 0);
      const toe = add(new THREE.SphereGeometry(0.19, 24, 16), brown, 0.14, 0.14, 0); toe.scale.set(1.4, 0.8, 1);
      add(new THREE.TorusGeometry(0.15, 0.035, 10, 24), std('#ffd3a0'), 0, 0.62, 0).rotation.x = Math.PI / 2;
      break;
    }
    case 't_can': {
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 28, 1), std('#dfe5ee', { metalness: 0.6, roughness: 0.3 }), 0, 0.21, 0);
      add(new THREE.CylinderGeometry(0.175, 0.175, 0.2, 28, 1, true), std('#ff9fb8'), 0, 0.21, 0);
      break;
    }
    case 't_tire': {
      add(new THREE.TorusGeometry(0.24, 0.1, 14, 28), std('#6f6a7a', { roughness: 0.9 }), 0, 0.34, 0);
      break;
    }
    case 'm_seaweed': {
      const green = std('#7fd39a', { sheen: 0.6 });
      for (let k = 0; k < 3; k++) {
        const pts = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.sin(i * 1.3 + k) * 0.07 + (k - 1) * 0.08, i * 0.12, Math.cos(i + k) * 0.04));
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.035 - k * 0.004, 8, false), green);
      }
      break;
    }
    case 't_rustykey': {
      const rust = std('#d9a36b', { metalness: 0.5, roughness: 0.45 });
      add(new THREE.TorusGeometry(0.12, 0.04, 12, 24), rust, 0, 0.5, 0);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 12), rust, 0, 0.22, 0);
      add(new THREE.BoxGeometry(0.1, 0.05, 0.05), rust, 0.05, 0.08, 0);
      add(new THREE.BoxGeometry(0.08, 0.05, 0.05), rust, 0.04, 0.16, 0);
      break;
    }
    default: { // t_bottle 병편지
      add(new THREE.CapsuleGeometry(0.13, 0.26, 8, 20), std('#bfeee3', { transmission: 0.6, transparent: true, opacity: 0.7, roughness: 0.1 }), 0, 0.27, 0);
      add(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 16), std('#bfeee3', { transparent: true, opacity: 0.75 }), 0, 0.53, 0);
      add(new THREE.CylinderGeometry(0.052, 0.052, 0.06, 16), std('#c99a6b'), 0, 0.62, 0);
      const paper = add(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 16), std('#fff3d6'), 0, 0.27, 0);
      paper.rotation.z = 0.2;
    }
  }
  return g;
}

export default function build(ctx: Ctx) {
  const game = ctx.game;
  const { island } = ctx;
  const root = new THREE.Group();
  root.name = 'fishing';
  if (!game) return root;
  game.state.register(FISH);
  let tod = ctx.tod;
  ctx.onTod((n) => { tod = n; });
  const rng = ctx.rng('fishing-session');
  let modelSeq = 0;
  const W = window as unknown as Record<string, unknown>;

  // ── 저장(flags.fishing) ──
  type Flags = { bait?: string; casts: number; catches: number; junk: number; reel?: { wins: number; snaps: number; escapes: number }; sand?: number } & Record<string, unknown>;
  const F = (): Flags => {
    const fl = game.state.flags as Record<string, unknown>;
    let f = fl.fishing as Flags | undefined;
    if (!f || typeof f !== 'object') { f = { casts: 0, catches: 0, junk: 0 }; fl.fishing = f; }
    f.casts ??= 0; f.catches ??= 0; f.junk ??= 0;
    return f;
  };
  const save = () => game.state.save();
  const count = (id: string) => game.state.bag[id] ?? 0;

  // ── 물 판정 ──
  /** 지구: 낚시되는 깊이(0.35m 이상)의 물 높이 */
  const earthWater = (x: number, z: number): number | null => {
    const wl = island.waterLevelAt(x, z);
    if (!Number.isFinite(wl)) return null;
    if (wl - island.heightAt(x, z) < 0.35) return null;
    return wl;
  };
  /** 우주: 달 연못만(달 밑 지구 바다를 보지 않게) */
  const pondWater = (x: number, z: number): number | null => {
    try { return game.space?.pondAt?.(x, z)?.y ?? null; } catch { return null; }
  };
  const waterAt = (x: number, z: number): number | null => (game.world === 'space' ? pondWater(x, z) : earthWater(x, z));
  /** 모래 낚시(GDD 3.5.7 dune, P1): 모래시계섬 모래 언덕 위 땅 높이(물·다른 구역이면 null) */
  const zoneName = (x: number, z: number): string | undefined => { try { return game.geo?.zoneAt?.(x, z)?.zone; } catch { return undefined; } };
  const sandAt = (x: number, z: number): number | null => {
    if (game.world !== 'earth' || Number.isFinite(island.waterLevelAt(x, z))) return null;
    return zoneName(x, z) === 'dune' ? island.heightAt(x, z) : null;
  };
  /** 지금 낚시의 '수면'(물 또는 모래) */
  let medium: 'water' | 'sand' = 'water';
  const surfAt = (x: number, z: number): number | null => (medium === 'sand' ? sandAt(x, z) : waterAt(x, z));
  /** 수면 높이(바다는 파도를 탄다) */
  const ripple = (x: number, z: number, t: number) => 0.05 * Math.sin(x * 0.23 + z * 0.11 + t * 0.9) + 0.04 * Math.sin(-x * 0.13 + z * 0.29 + t * 1.25);
  const surfaceY = (x: number, z: number, base: number, t: number): number => {
    if (medium === 'sand') return island.heightAt(x, z) + 0.04;
    if (game.world === 'earth' && island.waterLevelAt(x, z) === 0) {
      const oc = game.ocean;
      if (oc && typeof oc.waveAt === 'function') { const y = oc.waveAt(x, z, t); if (Number.isFinite(y)) return y; }
      return base + ripple(x, z, t);
    }
    return base + 0.2 * ripple(x, z, t);
  };
  /** 발밑이 물 속이면 못 한다(수영·물에 선 채) */
  const standingInWater = (pl: Game['player']) => {
    if (game.world === 'space') { const y = pondWater(pl.pos.x, pl.pos.z); return y !== null && y > pl.pos.y + 0.2; }
    const wl = island.waterLevelAt(pl.pos.x, pl.pos.z);
    return Number.isFinite(wl) && wl > pl.pos.y + 0.2;
  };
  /** 바라보는 방향 3~10m 안에 물이 있나 */
  const waterAhead = (pl: Game['player']): boolean => {
    const f = pl.facing();
    for (let d = L.CAST_MIN; d <= L.CAST_MAX; d += 1) if (waterAt(pl.pos.x + f.x * d, pl.pos.z + f.z * d) !== null) return true;
    return false;
  };
  /** 바라보는 방향 3~10m 안이 모래 언덕인가 */
  const sandAhead = (pl: Game['player']): boolean => {
    const f = pl.facing();
    for (let d = L.CAST_MIN; d <= L.CAST_MAX; d += 1.75) if (sandAt(pl.pos.x + f.x * d, pl.pos.z + f.z * d) !== null) return true;
    return false;
  };
  /** 근처(14m)에 물이 있나 — 살금살금 판정 */
  const nearWater = (x: number, z: number): boolean => {
    if (waterAt(x, z) !== null) return true;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      for (const r of [5, 10, L.SPOOK_NEAR]) if (waterAt(x + Math.cos(a) * r, z + Math.sin(a) * r) !== null) return true;
    }
    return false;
  };

  // ── 경제(늦게 읽기) ──
  const econ = () => game.econ ?? null;
  const isUnlocked = () => { const e = econ(); return e ? (k: string) => e.isUnlocked(k) : null; };
  // 경제가 없을 때(룩 테스트 등) 쓰는 자리 굴림 상태 — 저장하지 않는다
  const localRoll = newRollState();
  const roll = (q: L.PreRollQuery): RollResult => {
    const e = econ();
    if (e) return e.rollCatch(q);
    const env = game.env;
    return rollPure(q as unknown as PureQuery, localRoll, {
      day: env?.day ?? 0, hour: env?.hour ?? 12, tod: env?.tod ?? tod, weather: env?.weather ?? 'clear', p0: true, rng: (k) => ctx.rng(k),
    }) as unknown as RollResult;
  };
  const gaugeOf = (a: Activity) => { try { return econ()?.pity(a).gauge ?? 0; } catch { return 0; } };

  /** 지금 이 자리 후보 */
  const placeFor = (zone: string, isl: string | null): L.PoolPlace => {
    const env = game.env;
    const hour = env?.hour ?? 12;
    return {
      island: isl, zone, hour, tod: env?.tod ?? tod, noon: env?.noon ?? (hour >= 11 && hour < 13), midnight: env?.midnight ?? hour < 2,
      weather: (env?.regionWeather?.(game.player.pos.x, game.player.pos.z) ?? env?.weather ?? 'clear') as string, moonPhase: env?.moonPhase ?? 0.25,
    };
  };
  const poolAt = (zone: string, isl: string | null): L.PoolFish[] => L.zonePool(FISH as unknown as L.PoolFish[], placeFor(zone, isl), poolFor);
  /** 표대로만(이웃 물·시간 풀기 없이) — 모래 언덕·트롤링 심해처럼 '그 자리 종만' 나와야 하는 곳. p1 = P1 종 포함 */
  const strictPool = (zone: string, isl: string | null, p1 = false): L.PoolFish[] => {
    const pf = (FD as unknown as { poolFor?: (q: Record<string, unknown>) => L.PoolFish[] }).poolFor;
    if (!pf) return poolAt(zone, isl);
    const pl = placeFor(zone, isl);
    try { return pf({ ...pl, island: isl ?? undefined, p1, fallback: false }) ?? []; } catch { return []; }
  };
  const speciesOf = (r: RollResult | RollSpecies | null | undefined): FishSpecies | undefined => {
    const id = (r && 'species' in r ? r.species?.id : (r as RollSpecies | null)?.id) ?? '';
    return FISH_BY_ID.get(id) ?? (game.state.species.get(id) as FishSpecies | undefined);
  };

  // ── 장식 그림자(청크, 구역 후보 크기) ──
  const ambient = makeAmbient({
    rng: (k) => ctx.rng(k),
    waterAt: earthWater,
    isRiver: (x, z) => { const s = island.surfaceAt(x, z); return s.kind === 'river' || s.coastDist > 0; },
    moonPonds: () => game.space?.ponds ?? [],
    speciesAt: (x, z, u) => {
      let zone = 'moonpond', isl: string | null = 'moon';
      if (game.world !== 'space' || !game.space?.pondAt?.(x, z)) {
        const zi = game.geo?.zoneAt?.(x, z);
        zone = L.fishingZone(zi?.zone, false); isl = zi?.island ?? null;
      }
      const sp = L.pickAmbient(poolAt(zone, isl), u);
      return sp ? { ...(speciesOf(sp) ?? {}), rarity: sp.rarity } : null;
    },
  });
  for (const layer of ambient.layers) game.chunks.add(layer);

  // ── 낚싯대·줄·찌 ──
  const rod = new THREE.Group();
  {
    const wood = new THREE.MeshPhysicalMaterial({ color: '#d9a066', roughness: 0.55, sheen: 0.4, clearcoat: 0.3, emissive: '#d9a066', emissiveIntensity: 0.1 });
    const grip = new THREE.MeshPhysicalMaterial({ color: '#ff8fa8', roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#ffd6e0'), emissive: '#ff8fa8', emissiveIntensity: 0.1 });
    const metal = new THREE.MeshPhysicalMaterial({ color: '#fff2c8', roughness: 0.25, metalness: 0.6, clearcoat: 1 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.03, 1.7, 16, 1), wood);
    pole.position.y = 0.85; rod.add(pole);
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.3, 8, 16), grip);
    handle.position.y = 0.08; rod.add(handle);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 24), metal);
    reel.rotation.z = Math.PI / 2; reel.position.set(0.05, 0.28, 0); rod.add(reel);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), grip); knob.position.set(0.1, 0.32, 0); rod.add(knob);
    for (const y of [0.7, 1.15, 1.55]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 16), metal); ring.position.set(0, y, 0.025); rod.add(ring); }
    const tipBall = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), grip); tipBall.position.y = 1.7; rod.add(tipBall);
    rod.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  }
  const rodTip = new THREE.Object3D(); rodTip.position.y = 1.7; rod.add(rodTip);
  rod.visible = false;
  root.add(rod);

  const bobber = new THREE.Group();
  const bobRed = new THREE.MeshPhysicalMaterial({ color: '#ff5a6a', roughness: 0.3, clearcoat: 1, emissive: '#ff5a6a', emissiveIntensity: 0.15 });
  const bobWhite = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 1, emissive: '#ffffff', emissiveIntensity: 0.1 });
  {
    const topG = new THREE.SphereGeometry(0.11, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const botG = new THREE.SphereGeometry(0.11, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    bobber.add(new THREE.Mesh(topG, bobRed), new THREE.Mesh(botG, bobWhite));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), bobRed); stick.position.y = 0.15; bobber.add(stick);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), bobWhite); ball.position.y = 0.22; bobber.add(ball);
  }
  // 분홍 후광(두근 게이지 80%+)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PINK, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  halo.scale.set(0.9, 0.9, 1); halo.renderOrder = 8; halo.visible = false;
  bobber.add(halo);
  bobber.visible = false;
  root.add(bobber);

  const lineGeo = new THREE.BufferGeometry();
  const LINE_N = 24;
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(LINE_N * 3), 3));
  const lineMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
  const line = new THREE.Line(lineGeo, lineMat);
  line.frustumCulled = false;
  line.visible = false;
  root.add(line);

  // 던질 자리 표적 고리(충전 중)
  const aimRing = new THREE.Mesh(ringGeo, overWater(new THREE.MeshBasicMaterial({ map: ringTex, color: '#ffd6e8', transparent: true, opacity: 0.9, depthWrite: false })));
  aimRing.renderOrder = 7; aimRing.visible = false; root.add(aimRing);

  const rings = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(ringGeo, overWater(new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, depthWrite: false })));
    m.renderOrder = 7; m.visible = false; root.add(m);
    return { m, born: -99, x: 0, z: 0, y: 0, big: 1 };
  });
  let ringI = 0;
  const splash = (x: number, y: number, z: number, big = 1) => {
    const r = rings[ringI++ % rings.length];
    r.born = game.time; r.x = x; r.y = y + 0.03; r.z = z; r.big = big; r.m.visible = true;
    // 모래 위에선 모래먼지 색
    (r.m.material as THREE.MeshBasicMaterial).color.set(medium === 'sand' ? '#f0d6a4' : '#ffffff');
  };

  const sprite = (map: THREE.Texture, w: number, h: number) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true }));
    s.scale.set(w, h, 1); s.renderOrder = 10; s.visible = false; root.add(s);
    return s;
  };
  const bang = sprite(bangTex, 0.7, 0.7);
  const tok = sprite(tokTex, 1.0, 0.5);
  const gguk = sprite(ggukTex, 1.2, 0.6);
  let tokAt = -99;

  // 잡았다 반짝이(★3 이상)
  const SPARK_N = 60;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARK_N * 3), 3));
  const sparkMat = new THREE.PointsMaterial({ map: sparkTex, size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe9a8' });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false; sparks.visible = false; root.add(sparks);
  const sparkSeed = Array.from({ length: SPARK_N }, (_, i) => ({ a: (i * 2.399) % 6.283, r: 0.4 + ((i * 0.618) % 1) * 1.2, v: 0.6 + ((i * 0.37) % 1) * 1.4, h: (i * 0.13) % 1 }));
  let sparkBorn = -99, sparkLevel = 0;

  // 찌 둘레 그림자
  const shadows = new CastShadows();
  root.add(shadows.root);
  // ★4 이상 릴 줄다리기(+ 협동 릴)
  const fight = new ReelFight(game, root);
  /** 줄다리기 시작 거리 · 물고기 쪽 방향(플레이어 기준) */
  const fightAt = { d0: 6, ax: 0, az: 1, x: 0, z: 0, splashAt: -99 };

  // ── 세션 ──
  const S = L.newSession();
  const cur = {
    rod: 'rod' as L.RodTier, deck: false, onBoat: false,
    cast: new THREE.Vector3(), waterY: 0,
    plan: null as L.CastPlan | null, bait: undefined as string | undefined,
    rolls: [] as RollResult[], target: -1, glow: false,
    /** 잡은 결과 — 물고기가 뛰어올라 손에 닿을 때(0.4초 뒤) 처리 */
    pending: null as null | { r: RollResult; at: number },
    leap: null as null | { obj: THREE.Object3D; t0: number; from: THREE.Vector3 },
    frozen: false,
  };
  let spookUntil = 0, spookHinted = false, nearCheckAt = -1;
  /** 디버그: 분홍 반짝 줄 고정(던질 때 게이지 값으로 덮이지 않게) */
  let forceGlow = false;

  /** 캐릭터가 손에 드는 낚싯대(있으면 그걸 쓰고 내 낚싯대는 숨긴다) — 끝(tip)과 기본 줄·찌 */
  let avRod: { root: THREE.Object3D; tip: THREE.Object3D } | null = null;
  const findAvatarRod = () => {
    const av = game.player.avatar?.root;
    if (!av) return null;
    if (avRod && avRod.root.parent) return avRod;
    let found: THREE.Object3D | null = null;
    av.traverse((o) => { if (!found && o.name === 'rod') found = o; });
    if (!found) return null;
    let tip: THREE.Object3D | null = null;
    (found as THREE.Object3D).traverse((o) => { if (!tip && o !== found && (o as THREE.Group).isGroup && Math.abs(o.position.y - 1.25) < 0.01 && o.children.length >= 2) tip = o; });
    if (!tip) return null;
    avRod = { root: found, tip };
    return avRod;
  };
  const setAvatarLine = (show: boolean) => { const r = findAvatarRod(); if (r) for (const c of r.tip.children) c.visible = show; };

  // 매 프레임 쓰는 임시 벡터(쓰레기 줄이기)
  const _hand = new THREE.Vector3();
  const UP55 = new THREE.Vector3(0, 0.55, 0);
  const _right = new THREE.Vector3();
  const handPos = () => {
    const p = game.player;
    const f = p.facing();
    _right.set(-f.z, 0, f.x);
    return _hand.copy(p.pos).addScaledVector(_right, 0.24).addScaledVector(f, 0.18).add(UP55);
  };

  const tipW = new THREE.Vector3();
  /**
   * 낚싯대를 오른손에 pitch(앞 기울기, 0 = 똑바로 위)·yawOff(몸 기준 돌림)로 들고 끝(tip) 월드 좌표를 돌려준다.
   * 캐릭터가 든 낚싯대가 있으면 그쪽 끝을 쓰고 내 것은 숨긴다. hide = 끝 자리만 재고 숨기기(잡았다 연출).
   */
  const poseRod = (pitch: number, yawOff = 0, hide = false): THREE.Vector3 => {
    const pl = game.player;
    rod.position.copy(handPos());
    const f = pl.facing();
    rod.rotation.set(0, 0, 0);
    rod.rotateY(Math.atan2(f.x, f.z) + yawOff);
    rod.rotateX(pitch);
    rod.updateMatrixWorld(true);
    const ar = findAvatarRod();
    if (hide) {
      rod.visible = false;
      tipW.setFromMatrixPosition(rodTip.matrixWorld);
    } else if (ar && ar.root.visible) {
      rod.visible = false;
      setAvatarLine(false);
      ar.tip.updateWorldMatrix(true, false);
      tipW.setFromMatrixPosition(ar.tip.matrixWorld);
    } else {
      rod.visible = true;
      tipW.setFromMatrixPosition(rodTip.matrixWorld);
    }
    return tipW;
  };
  const hideRod = () => { if (S.phase === 'idle') { rod.visible = false; setAvatarLine(true); } };

  /** 탄 것: 통통배 갑판 낚시가 되나, 배 위인가 */
  const vehicleNow = () => { try { return game.vehicles?.current?.() ?? null; } catch { return null; } };

  const begin = (tier: L.RodTier, deck: boolean, med: 'water' | 'sand' = 'water') => {
    const pl = game.player;
    const v = deck ? vehicleNow() : null;
    medium = med;
    shadows.setMedium(med === 'sand', med === 'sand' ? (x, z) => island.heightAt(x, z) : null);
    cur.rod = tier; cur.deck = deck; cur.onBoat = !!v?.boat || deck;
    cur.plan = null; cur.rolls = []; cur.target = -1; cur.pending = null;
    L.beginCharge(S);
    pl.lock('fishing');
    pl.act('fish');
    rod.visible = true;
    return true;
  };

  const end = () => {
    if (cur.pending) flushPending();
    S.phase = 'idle';
    rod.visible = line.visible = bobber.visible = bang.visible = tok.visible = gguk.visible = aimRing.visible = false;
    halo.visible = false;
    shadows.clear();
    if (fight.active) fight.stop();
    setAvatarLine(true);
    game.hud?.gauge?.('fishing-cast', { label: '던지기', value: 0, color: '#ff9fb8', show: false });
    const pl = game.player;
    pl.unlock('fishing', true);
    if (pl.action === 'fish' || pl.action === 'hold' || pl.action === 'reel') pl.act(null);
    cur.frozen = false;
    medium = 'water';
    shadows.setMedium(false);
  };

  /** 찌가 떨어진 자리 정하기 + 미끼 쓰기 + 활동·구역 */
  const onCast = (dist: number): boolean => {
    const pl = game.player;
    const f = pl.facing();
    const d = L.landingDistance(dist, (k) => surfAt(pl.pos.x + f.x * k, pl.pos.z + f.z * k) !== null);
    if (d === null) { game.ui.toast(medium === 'sand' ? '모래 언덕이 너무 멀어요! 언덕 쪽을 봐요 🏜️' : '물이 너무 멀어요! 물가로 조금 더 가 봐요 🌊'); return false; }
    const x = pl.pos.x + f.x * d, z = pl.pos.z + f.z * d;
    cur.waterY = surfAt(x, z) ?? pl.pos.y;
    cur.cast.set(x, cur.waterY, z);
    const space = game.world === 'space';
    cur.plan = medium === 'sand'
      // 모래 낚시: 모래 언덕 종만(쓰레기 없음)
      ? { activity: 'fish', zone: 'dune', island: 'desert', junk: false }
      : L.planCast({ world: space ? 'space' : 'earth', pond: space, zone: space ? null : game.geo?.zoneAt?.(x, z) ?? null, onBoat: cur.onBoat });
    const fl = F();
    if (medium === 'sand') fl.sand = (fl.sand ?? 0) + 1;
    // 미끼는 고르기만 — 실제로 쓰는 건 착수 때 그림자가 하나라도 있을 때(빈 물에서 미끼만 날리지 않게)
    cur.bait = L.chooseBait(fl.bait, count);
    fl.casts++; save();
    cur.glow = forceGlow || gaugeOf(cur.plan.activity) > 0.8;
    bobber.visible = true; line.visible = true;
    game.audio?.sfx('cast', { x: pl.pos.x, z: pl.pos.z });
    return true;
  };

  /** 착수: 그림자 1~3개를 미리 굴려 놓고 하나를 고른다 */
  const onLand = () => {
    const plan = cur.plan!;
    const t = game.time;
    splash(cur.cast.x, cur.waterY, cur.cast.z, 0.7);
    game.audio?.sfx('splash', { x: cur.cast.x, z: cur.cast.z, vol: 0.4, pitch: 1.3 });
    const pool = medium === 'sand' ? strictPool('dune', 'desert') : poolAt(plan.zone, plan.island);
    const spooked = L.isSpooked(spookUntil, t);
    const n = L.shadowCount(rng(), spooked);
    const rolls = pool.length ? L.rollShadows({ n, plan, pool, bait: cur.bait, roll }) : [];
    if (!rolls.length) {
      game.ui.toast(medium === 'sand' ? '모래 속 친구들이 지금은 쉬나 봐요… 낮이나 모래폭풍 때 와 봐요 🏜️' : '여긴 물고기가 없나 봐요… 다른 물가로 가 볼까요?');
      L.reelIn(S); return;
    }
    if (cur.bait) game.state.addItem(cur.bait, -1);
    // 그림자 자리: 찌 둘레 6~12m 물 위(없으면 더 가까이)
    const spawns: Parameters<CastShadows['spawn']>[0] = [];
    const kept: RollResult[] = [];
    for (const r of rolls) {
      const sp = speciesOf(r);
      const len = r.junk ? 0.5 : shadowLenFor(sp ?? null);
      const R = L.shadowRadius(rng());
      const a0 = rng() * Math.PI * 2;
      let pos: { x: number; z: number; y: number } | null = null;
      for (const k of [1, 0.75, 0.5, 0.32]) {
        for (let i = 0; i < 10 && !pos; i++) {
          const a = a0 + (i / 10) * Math.PI * 2;
          const x = cur.cast.x + Math.cos(a) * R * k, z = cur.cast.z + Math.sin(a) * R * k;
          const y = surfAt(x, z);
          if (y !== null) pos = { x, z, y };
        }
        if (pos) break;
      }
      if (!pos) pos = { x: cur.cast.x + Math.cos(a0) * 1.2, z: cur.cast.z + Math.sin(a0) * 1.2, y: cur.waterY };
      spawns.push({ len, rarity: r.rarity, junk: !!r.junk, shiny: r.variant === 'shiny', ...pos });
      kept.push(r);
    }
    cur.rolls = kept;
    shadows.spawn(spawns, cur.cast, t, rng);
    cur.target = Math.floor(rng() * kept.length);
    const tg = spawns[cur.target];
    const far = Math.hypot(tg.x - cur.cast.x, tg.z - cur.cast.z);
    const speed = (1.8 + rng() * 0.8) / Math.sqrt(Math.max(0.6, tg.len));
    L.arm(S, {
      wait: 0.5 + rng() * 1.1 + (spooked ? L.SPOOK_DELAY : 0),
      approach: THREE.MathUtils.clamp(far / speed, 2.2, 7),
      window: L.biteWindow(kept[cur.target].rarity, cur.rod),
      fight: L.needsFight(kept[cur.target]),
    });
    if (spooked) game.ui.toast('쉿! 뛰어오는 바람에 물고기가 놀랐어요… 🤫');
  };

  /** 결과 처리(쓰레기 카드 + give / showCatch + reportCatch) */
  const hooks: L.OutcomeHooks = {
    catchFail: (a) => {
      const e = econ();
      if (e) e.catchFail(a);
      else game.state.emit({ type: 'catch-fail', activity: a });
    },
    reportCatch: (r) => { econ()?.reportCatch(r); },
    showCatch: (o) => {
      const sp = FISH_BY_ID.get(o.speciesId) ?? (game.state.species.get(o.speciesId) as FishSpecies | undefined);
      if (!sp) return;
      const holder = new THREE.Group();
      holder.add(buildFishModel(sp, ctx.rng(`fish:model:${modelSeq++}`)));
      applyCurve(holder);
      game.ui.showCatch({ species: sp, sizeText: `${o.size}cm`, size: o.size, variant: o.variant, activity: o.activity, model: holder, line: o.line });
      const fl = F(); fl.catches++; save();
      if (sp.rarity >= 3 || o.variant === 'shiny') { sparkBorn = game.time; sparkLevel = Math.max(sp.rarity, o.variant === 'shiny' ? 4 : 0); }
      // 들고 있는 동안 모델이 사라지면 정리
      const cleanup = () => { if (!holder.parent) { disposeModel(holder); return; } setTimeout(cleanup, 1000); };
      setTimeout(cleanup, 4000);
    },
    give: (id, n, why) => {
      const e = econ();
      if (e) return e.give(id, n, why);
      game.state.addItem(id, n);
      return n;
    },
    card: (o) => {
      game.hud.card({ title: o.title, body: o.body, icon: o.icon ?? '🗑️', color: '#9fb8c8', ms: 2600 });
      const model = buildJunkModel(o.junk);
      applyCurve(model);
      game.ui.hold(model, 2.2);
      const cleanup = () => { if (!model.parent) { disposeModel(model); return; } setTimeout(cleanup, 1000); };
      setTimeout(cleanup, 3200);
      const zi = game.world === 'earth' ? game.geo?.zoneAt?.(cur.cast.x, cur.cast.z) : null;
      game.state.emit({ type: 'harvest', kind: 'junk', item: o.junk, n: 1, island: zi?.island ?? (game.world === 'space' ? 'moon' : 'sea') });
      const fl = F(); fl.junk++; save();
    },
    prevBest: (id) => game.state.dex[id]?.best,
    pun: (r) => {
      const sp = speciesOf(r);
      const lines = PUNS[r.rarity] ?? PUNS[1];
      return lines[Math.floor(rng() * lines.length)].replace('{n}', sp?.name ?? r.species?.name ?? '물고기');
    },
    itemName: (id) => { const d = itemDef(id); return d ? { name: d.name, icon: d.icon } : undefined; },
  };
  const sizeFallback = (r: RollResult) => { const sp = speciesOf(r); return sp ? L.fallbackSize(sp, rng()) : 20; };
  const flushPending = () => {
    const p = cur.pending;
    if (!p) return;
    cur.pending = null;
    if (cur.leap) { cur.leap.obj.removeFromParent(); disposeModel(cur.leap.obj); cur.leap = null; }
    L.resolveCatch(p.r, cur.plan?.activity ?? 'fish', hooks, p.r.size ?? sizeFallback(p.r));
    p1.onCatch(p.r, cur.cast.x, cur.cast.z);
    game.player.act('hold', 1.2);
  };

  /** 꾹에 걸었다 — ★4 이상 릴 줄다리기 시작 */
  const onHook = () => {
    const r = cur.rolls[cur.target];
    const sp = speciesOf(r);
    const pos = shadows.pos(cur.target) ?? { x: cur.cast.x, z: cur.cast.z, y: cur.waterY };
    const pl = game.player;
    const dx = pos.x - pl.pos.x, dz = pos.z - pl.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    fightAt.d0 = Math.max(3, d); fightAt.ax = dx / d; fightAt.az = dz / d; fightAt.x = pos.x; fightAt.z = pos.z;
    bang.visible = gguk.visible = false;
    splash(pos.x, cur.waterY, pos.z, 1.5);
    const size = r.size ?? (sp ? L.fallbackSize(sp, 0.5) : 30);
    fight.start({ rarity: r.rarity, sizeRatio: sp?.len ? size / sp.len : 1, rng, name: sp?.name });
    pl.act('reel');
  };
  /** 줄다리기 한 프레임: 물고기 자리(좌우로 끌고, 감을수록 가까이) → 끝나면 결과 사건 */
  const stepFight = (t: number, dt: number): L.FishEvent[] => {
    const pl = game.player;
    const inp = game.input;
    const res = fight.update(t, dt, inp.hit('KeyE'), inp.axis().x, pl.pos);
    const st = fight.state;
    if (st) {
      const dist = RL.fishDistance(st, fightAt.d0);
      const a = st.sway * 0.55;
      const ax = fightAt.ax * Math.cos(a) - fightAt.az * Math.sin(a), az = fightAt.ax * Math.sin(a) + fightAt.az * Math.cos(a);
      const x = pl.pos.x + ax * dist, z = pl.pos.z + az * dist;
      // 물(모래) 밖으로는 끌려 나오지 않는다 — 마지막 자리 유지
      if (surfAt(x, z) !== null || dist < 1.8) { fightAt.x = x; fightAt.z = z; }
      shadows.drag(cur.target, fightAt.x, fightAt.z);
      if (t - fightAt.splashAt > (st.surge > 0 ? 0.22 : 0.5)) {
        fightAt.splashAt = t;
        splash(fightAt.x, cur.waterY, fightAt.z, st.surge > 0 ? 1.2 : 0.6);
      }
    }
    if (!res) return [];
    const fr = F();
    fr.reel ??= { wins: 0, snaps: 0, escapes: 0 };
    if (res === 'win') fr.reel.wins++; else if (res === 'snap') fr.reel.snaps++; else fr.reel.escapes++;
    save();
    if (res === 'snap') game.audio?.sfx('fail-splash', { x: fightAt.x, z: fightAt.z });
    return L.endFight(S, res === 'win', res === 'snap' ? 'snap' : 'escape');
  };

  /** 잡았다! — 물고기가 물에서 튀어 올라 손으로(0.4초) → 결과 */
  const onCatch = () => {
    const t = game.time;
    const r = cur.rolls[cur.target];
    const sp = speciesOf(r);
    const pos = shadows.pos(cur.target) ?? { x: cur.cast.x, z: cur.cast.z, y: cur.waterY };
    shadows.hide(cur.target);
    shadows.flee(t);
    bang.visible = gguk.visible = false;
    line.visible = false; bobber.visible = false;
    splash(pos.x, cur.waterY, pos.z, 1.6); splash(pos.x, cur.waterY, pos.z, 1);
    game.audio?.sfx('reel', { x: pos.x, z: pos.z });
    game.audio?.sfx('splash', { x: pos.x, z: pos.z, vol: 0.8 });
    // 튀어 오르는 모습
    const obj = r.junk || !sp ? buildJunkModel(r.junk ?? 't_boot') : buildFishModel(sp, ctx.rng(`fish:model:${modelSeq++}`));
    const size = r.size ?? (sp ? L.fallbackSize(sp, 0.5) : 30);
    if (!r.size && !r.junk) r.size = sizeFallback(r);
    // 튀어 오르는 물고기: 세상 길이(0.35~2m로 잡아 둠) ÷ 모델 길이 — 크기 등급마다 달라 보이게
    const leapLen = sp ? THREE.MathUtils.clamp(worldLength(sp, size), 0.35, 2) : 0;
    obj.scale.setScalar(r.junk || !sp ? 0.8 : leapLen / ((obj.userData.modelLen as number | undefined) ?? 1));
    applyCurve(obj);
    root.add(obj);
    cur.leap = { obj, t0: t, from: new THREE.Vector3(pos.x, cur.waterY, pos.z) };
    cur.pending = { r, at: t + 0.42 };
  };

  const onFail = (why: L.FailWhy) => {
    const t = game.time;
    shadows.flee(t);
    bang.visible = tok.visible = gguk.visible = false;
    splash(cur.cast.x, cur.waterY, cur.cast.z, 1.2);
    game.ui.toast(L.FAIL_TOAST[why]);
    L.resolveFail(cur.plan?.activity ?? 'fish', hooks);
  };

  // ── P1: 트롤링 · 얼음 구멍 · 모래 그림자 · 돛등이 대결 · 협동 릴 돕기(fishing/p1.ts) ──
  const p1 = installP1({
    game, ctx, root, rng, roll,
    pool: (zone, isl, o) => (o?.strict || o?.p1 ? strictPool(zone, isl, !!o?.p1) : poolAt(zone, isl)),
    speciesOf,
    resolve: (r, activity, at) => {
      if (!r.size && !r.junk) r.size = sizeFallback(r);
      L.resolveCatch(r, activity, hooks, r.size ?? sizeFallback(r));
      p1.onCatch(r, at.x, at.z);
      game.player.act('hold', 1.2);
    },
    fail: (a) => L.resolveFail(a, hooks),
    rodTier: () => L.rodTier(isUnlocked()),
    splash: (x, y, z, big) => splash(x, y, z, big),
    poseRod: (pitch, yawOff) => poseRod(pitch, yawOff ?? 0),
    hideRod,
    idle: () => S.phase === 'idle' && !cur.pending,
    bait: () => L.chooseBait(F().bait, count),
    useBait: (id) => game.state.addItem(id, -1),
    fight,
    flags: () => F(),
    save,
  });

  // ── 상호작용 ──
  /** 이번 프레임 '낚시할 수 있는 물가' 였나(미끼 바꾸기 줄이 따라 뜬다) */
  let canHere = false;
  game.addProvider('fishing', (pl) => {
    canHere = false;
    // 집·박물관 안은 먼바다 위에 떠 있다 — 바닥 아래 바다로 낚시하지 않게
    if ((game.ext as { interiors?: { current?(): string | null } }).interiors?.current?.()) return null;
    if (S.phase !== 'idle' || cur.pending) return null;
    // 탄 채로는 통통배가 멈췄을 때만(GDD 3.8)
    const deck = !!pl.mounted && L.deckFishingOk(vehicleNow());
    if (pl.mounted && !deck) return null;
    if (!pl.mounted && (pl.mode !== 'ground' || pl.action)) return null;
    if (!deck && standingInWater(pl)) return null;
    // 얼음 구멍 가까이에선 얼음 구멍 미니게임(p1)이 맡는다
    if (!deck && game.world === 'earth' && p1.nearHole(pl.pos.x, pl.pos.z)) return null;
    if (p1.busy()) return null;
    // 물이 없으면 모래 언덕(P1 모래 낚시)
    const sand = !deck && !waterAhead(pl) && game.world === 'earth' && zoneName(pl.pos.x, pl.pos.z) === 'dune' && sandAhead(pl);
    if (!sand && !waterAhead(pl)) return null;
    const tier = L.rodTier(isUnlocked());
    if (tier === 'none') {
      return { id: 'fishing:norod', label: '낚싯대가 필요해요 🎣', dist: 1.9, whileMounted: deck, use: () => { game.ui.toast('작업대에서 낚싯대를 만들어요! (나무 5) 🎣'); } };
    }
    canHere = true;
    if (sand) return { id: 'fishing:sand', label: '모래 낚시하기 🏜️🎣 (꾹 누르면 멀리)', dist: 1.6, use: () => { begin(tier, false, 'sand'); } };
    return deck
      ? { id: 'fishing:deck', label: '갑판에서 낚시하기 🎣 (꾹 누르면 멀리)', dist: 0.5, whileMounted: true, use: () => { begin(tier, true); } }
      : { id: 'fishing', label: '낚시하기 🎣 (꾹 누르면 멀리)', dist: 1.6, use: () => { begin(tier, false); } };
  });
  // X: 미끼 바꾸기(가진 미끼가 있을 때만)
  game.addProvider('fishing-bait', (pl) => {
    if (!canHere) return null;
    const any = L.BAITS.some((b) => count(b) > 0);
    if (!any) return null;
    const f = F();
    const now = L.chooseBait(f.bait, count);
    const label = `미끼: ${now ? `${L.BAIT_NAME[now]} ×${count(now)}` : L.BAIT_NAME.none} (바꾸기)`;
    return {
      id: 'fishing:bait', label, key: 'KeyX', dist: 1.6, whileMounted: !!pl.mounted,
      use: () => {
        const fl = F();
        fl.bait = L.cycleBait(fl.bait, count);
        save();
        const b = L.chooseBait(fl.bait, count);
        game.ui.toast(b ? `🪱 ${L.BAIT_NAME[b]} 끼웠다! (${count(b)}개)` : '미끼 없이 낚시할래요');
      },
    };
  });

  // ── 매 프레임 ──
  const v = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const bob = new THREE.Vector3();
  const _tmp = new THREE.Vector3();
  const end2 = new THREE.Vector3();
  // 안내 줄(충전 줄만 매번 새로 만든다)
  const DECK_LIVE = new Set<L.Phase>(['charge', 'cast', 'wait', 'approach', 'nibble', 'bite']);
  const PROMPT: Partial<Record<L.Phase, string>> = {
    cast: '휙~', wait: '두근두근… (E 줄 감기)', approach: '다가온다…! (E 줄 감기)',
    nibble: '톡톡… 아직이야!', bite: 'E 지금!!',
  };
  game.onUpdate((t, dt) => {
    const pl = game.player;
    // 살금살금: 물가에서 달리면 그림자가 놀란다
    const amb = ambient.update(t, { x: pl.pos.x, z: pl.pos.z, speed: S.phase === 'idle' ? pl.speed : 0 });
    // 물가 검사는 달릴 때만, 0.25초에 한 번
    if (S.phase === 'idle' && pl.speed > L.SPOOK_SPEED && (amb > 0 || (t - nearCheckAt > 0.25 && ((nearCheckAt = t), nearWater(pl.pos.x, pl.pos.z))))) {
      spookUntil = L.spookUntil(spookUntil, t, pl.speed, true);
      if (amb > 0 && !spookHinted) { spookHinted = true; game.ui.toast('쉿! 물가에서 뛰면 물고기가 도망가요 🤫'); }
    }
    // 물결 고리
    for (const r of rings) {
      if (!r.m.visible) continue;
      const age = t - r.born;
      if (age > 1.4 || age < 0) { r.m.visible = false; continue; }
      const k = age / 1.4;
      r.m.position.set(r.x, r.y, r.z);
      r.m.scale.setScalar((0.3 + k * 1.6) * r.big);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
    }
    // 잡았다 반짝이
    if (t - sparkBorn < 2.6 && t >= sparkBorn) {
      sparks.visible = true;
      const age = t - sparkBorn;
      const pa = sparkGeo.attributes.position as THREE.BufferAttribute;
      const n = sparkLevel >= 5 ? SPARK_N : sparkLevel >= 4 ? 40 : 24;
      const p = pl.pos;
      for (let i = 0; i < SPARK_N; i++) {
        const s = sparkSeed[i];
        if (i >= n) { pa.setXYZ(i, 0, -999, 0); continue; }
        const rr = s.r * (0.6 + age * 0.9);
        pa.setXYZ(i, p.x + Math.cos(s.a + age * 1.2) * rr, p.y + 1.4 + s.h * 1.2 + age * s.v * 0.6, p.z + Math.sin(s.a + age * 1.2) * rr);
      }
      pa.needsUpdate = true;
      sparkMat.opacity = Math.min(1, (2.6 - age) * 1.5);
      sparkMat.size = sparkLevel >= 5 ? 0.5 : 0.35;
    } else sparks.visible = false;

    // 튀어 오른 물고기 → 손
    if (cur.leap) {
      const k = Math.min(1, (t - cur.leap.t0) / 0.42);
      const to = _to.copy(pl.pos); to.y += 1.3;
      cur.leap.obj.position.copy(cur.leap.from).lerp(to, k);
      cur.leap.obj.position.y += Math.sin(k * Math.PI) * 1.4;
      cur.leap.obj.rotation.set(0, Math.atan2(to.x - cur.leap.from.x, to.z - cur.leap.from.z) - Math.PI / 2, Math.sin(k * Math.PI * 3) * 0.6);
    }
    if (cur.pending && t >= cur.pending.at) flushPending();

    shadows.update(t, dt);
    if (S.phase === 'idle') return;

    // 갑판 낚시 중 배가 움직이기 시작하면 줄을 감는다(멈췄을 때만 낚시, GDD 3.8)
    if (cur.deck && DECK_LIVE.has(S.phase) && !L.deckFishingOk(vehicleNow())) {
      L.reelIn(S);
      shadows.flee(t);
      bang.visible = tok.visible = gguk.visible = false;
      game.ui.toast('배가 움직여서 줄을 감았어요! 멈추고 다시 던져 봐요 ⛵');
    }

    // ── 상태 기계 한 걸음 ──
    const inp = game.input;
    if (!cur.frozen) {
      // 충전 중엔 A·D 로 방향을 살짝 돌린다
      if (S.phase === 'charge') { const ax = inp.axis().x; if (ax) pl.yaw -= ax * dt * 1.8; }
      const evs = S.phase === 'fight' && !inp.hit('Escape') ? stepFight(t, dt) : L.step(S, dt, { press: inp.hit('KeyE'), held: inp.down('KeyE'), cancel: inp.hit('Escape') }, rng);
      for (const e of evs) {
        switch (e.type) {
          case 'cast': if (!onCast(e.dist)) { end(); return; } break;
          case 'land': onLand(); break;
          case 'approach': shadows.approach(cur.target, t, S.approach); break;
          case 'nibble': {
            shadows.poke(cur.target, t);
            tokAt = t;
            splash(cur.cast.x, cur.waterY, cur.cast.z, 0.45);
            game.audio?.sfx('splash', { x: cur.cast.x, z: cur.cast.z, vol: 0.25, pitch: 1.7 });
            break;
          }
          case 'bite': {
            shadows.bite(cur.target);
            splash(cur.cast.x, cur.waterY, cur.cast.z, 1.3); splash(cur.cast.x, cur.waterY, cur.cast.z, 0.6);
            game.audio?.sfx('splash', { x: cur.cast.x, z: cur.cast.z, vol: 0.7, pitch: 0.9 });
            break;
          }
          case 'hook': onHook(); break;
          case 'catch': if (fight.active) fight.stop(); onCatch(); break;
          case 'fail':
            // 줄다리기가 아직 살아 있는데 실패 = Esc 로 놓아줌 — 도망친 수에 센다(stepFight 끝은 스스로 멈춘 뒤라 여기 안 온다)
            if (fight.active) { fight.stop(); const fr = F(); fr.reel ??= { wins: 0, snaps: 0, escapes: 0 }; fr.reel.escapes++; save(); }
            onFail(e.why); break;
          case 'reel': shadows.flee(t); break;
          case 'end': end(); return;
        }
      }
    }
    if ((S.phase as L.Phase) === 'idle') return;
    const age = S.t;

    // 안내 줄
    if (S.phase === 'charge') game.ui.setPrompt(`E 떼면 휙! ${Math.round(L.castDistance(S.charge))}m · A·D 방향 · ${L.BAIT_NAME[cur.bait ?? L.chooseBait(F().bait, count) ?? 'none']}`, null);
    else { const pr = PROMPT[S.phase]; if (pr) game.ui.setPrompt(pr, null); }

    // 충전 표적
    if (S.phase === 'charge') {
      const f = pl.facing();
      const want = L.castDistance(S.charge);
      const d = L.landingDistance(want, (k) => surfAt(pl.pos.x + f.x * k, pl.pos.z + f.z * k) !== null);
      aimRing.visible = d !== null;
      if (d !== null) {
        const x = pl.pos.x + f.x * d, z = pl.pos.z + f.z * d;
        const wy = surfAt(x, z) ?? pl.pos.y;
        aimRing.position.set(x, surfaceY(x, z, wy, t) + 0.05, z);
        aimRing.scale.setScalar(0.7 + 0.08 * Math.sin(t * 8));
      }
      game.hud?.gauge?.('fishing-cast', { label: '던지기', value: L.chargeFrac(S.charge), color: '#ff9fb8', show: true });
    } else if (aimRing.visible) {
      aimRing.visible = false;
      game.hud?.gauge?.('fishing-cast', { label: '던지기', value: 0, color: '#ff9fb8', show: false });
    }

    // 낚싯대: 오른손에서 앞으로 기울여 든다
    let pitch = 0.95; // 앞으로 기울기(라디안, 0 = 똑바로 위)
    if (S.phase === 'charge') pitch = 0.95 - Math.min(1, L.chargeFrac(S.charge)) * 1.25 + 0.03 * Math.sin(t * 30) * L.chargeFrac(S.charge);
    if (S.phase === 'cast') pitch = age < 0.12 ? -0.3 + (age / 0.12) * 1.25 : 0.95;
    if (S.phase === 'nibble') pitch = 0.95 + (t - tokAt < 0.2 ? 0.08 : 0.02 * Math.sin(t * 20));
    if (S.phase === 'bite') pitch = 1.08 + 0.06 * Math.sin(t * 40);
    // 줄다리기: 낚싯대가 휘청 — 텐션이 높을수록 덜덜
    if (S.phase === 'fight') pitch = 1.12 - 0.25 * (fight.state?.progress ?? 0) + (0.03 + 0.08 * (fight.state?.tension ?? 0)) * Math.sin(t * 38);
    if (S.phase === 'catch') pitch = Math.max(0.1, 0.95 - age * 3);
    if (S.phase === 'reel' || S.phase === 'miss') pitch = 0.95 - Math.min(0.5, age);
    poseRod(pitch, 0, S.phase === 'catch');

    // 찌 위치
    const wy = surfaceY(cur.cast.x, cur.cast.z, cur.waterY, t);
    bob.set(cur.cast.x, wy + 0.02 + 0.025 * Math.sin(t * 2.4), cur.cast.z);
    if (S.phase === 'charge') {
      bobber.visible = true;
      bob.copy(tipW); bob.y -= 0.5;
    } else if (S.phase === 'cast') {
      const k = Math.min(1, age / L.CAST_FLIGHT);
      bob.copy(tipW).lerp(_tmp.set(cur.cast.x, wy, cur.cast.z), k);
      bob.y += Math.sin(k * Math.PI) * (0.8 + S.dist * 0.12) - (1 - k) * 0.4;
    } else if (S.phase === 'reel' || S.phase === 'miss') {
      const k = Math.min(1, age / (S.phase === 'reel' ? L.REEL_HOLD : 0.8));
      _tmp.copy(tipW); _tmp.y -= 0.4;
      bob.lerp(_tmp, k * k);
      if (k >= 1) bobber.visible = line.visible = false;
    } else if (S.phase === 'nibble') {
      if (t - tokAt < 0.18) bob.y -= 0.07;
    } else if (S.phase === 'bite') {
      bob.y = wy - 0.16;
    } else if (S.phase === 'fight') {
      // 찌는 물고기와 같이 끌려 다니며 반쯤 잠긴다
      bob.set(fightAt.x, surfaceY(fightAt.x, fightAt.z, cur.waterY, t) - 0.12 + 0.05 * Math.sin(t * 17), fightAt.z);
    }

    // 톡·꾹 말풍선
    tok.visible = S.phase === 'nibble' && t - tokAt < 0.6;
    if (tok.visible) tok.position.set(cur.cast.x, wy + 0.7 + (t - tokAt) * 0.6, cur.cast.z);
    if (S.phase === 'bite') {
      const pop = Math.min(1, age / 0.08);
      bang.visible = true;
      bang.scale.setScalar(0.75 * (0.6 + 0.4 * pop) * (1 + 0.06 * Math.sin(t * 30)));
      bang.position.copy(pl.pos); bang.position.y += 2.15;
      gguk.visible = true;
      gguk.position.set(cur.cast.x, wy + 0.8, cur.cast.z);
      gguk.scale.set(1.2 * (0.6 + 0.4 * pop), 0.6 * (0.6 + 0.4 * pop), 1);
    } else { bang.visible = false; gguk.visible = false; }

    // 두근 게이지 80%+: 분홍 반짝 줄·찌
    const glowK = cur.glow ? 0.55 + 0.45 * Math.sin(t * 5) : 0;
    lineMat.color.copy(WHITE).lerp(PINK, cur.glow ? 0.65 + 0.35 * Math.sin(t * 5) : 0);
    if (S.phase === 'fight' && fight.state && RL.inRed(fight.state)) lineMat.color.set(Math.sin(t * 18) > 0 ? '#ff4d6a' : '#ffb3c0');
    lineMat.opacity = cur.glow ? 1 : 0.85;
    bobRed.emissive.set(cur.glow ? '#ff7eb6' : '#ff5a6a');
    bobRed.emissiveIntensity = cur.glow ? 0.5 + 0.4 * glowK : 0.15;
    halo.visible = cur.glow && bobber.visible;
    (halo.material as THREE.SpriteMaterial).opacity = 0.35 + 0.4 * glowK;
    halo.scale.setScalar(0.8 + 0.25 * glowK);

    // 찌·줄
    bobber.position.copy(bob);
    bobber.rotation.z = S.phase === 'nibble' ? 0.25 * Math.sin(t * 14) : 0.06 * Math.sin(t * 1.7);
    if (line.visible) {
      const pa = lineGeo.attributes.position as THREE.BufferAttribute;
      const sag = S.phase === 'bite' || S.phase === 'fight' ? 0.03 : S.phase === 'cast' || S.phase === 'charge' ? 0.08 : 0.45;
      end2.copy(bob); end2.y += 0.22;
      for (let i = 0; i < LINE_N; i++) {
        const k = i / (LINE_N - 1);
        v.copy(tipW).lerp(end2, k);
        v.y -= Math.sin(k * Math.PI) * sag * Math.min(1, tipW.distanceTo(bob) / 3);
        pa.setXYZ(i, v.x, v.y, v.z);
      }
      pa.needsUpdate = true;
    }
  });
  // 세계가 바뀌면(로켓) 낚시 그만
  game.onWorld(() => { if (S.phase !== 'idle') end(); });

  // ── 디버그(촬영·자동 루프) ──
  const gallery = new THREE.Group();
  root.add(gallery);
  /** 물(wx,wz) 쪽을 보며 설 물가 자리 */
  const placeFacing = (wx: number, wz: number) => {
    for (let rr = 2.6; rr < 9; rr += 0.4) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = wx + Math.cos(a) * rr, z = wz + Math.sin(a) * rr;
      if (game.world === 'space') { if (pondWater(x, z) !== null) continue; }
      else {
        if (Number.isFinite(island.waterLevelAt(x, z))) continue;
        const s = island.surfaceAt(x, z);
        if (s.kind === 'cliff' || s.kind === 'sea') continue;
      }
      game.player.teleport(x, z);
      game.player.yaw = Math.atan2(-(wx - x), -(wz - z));
      return true;
    }
    return false;
  };
  /** 호수(중심 cx,cz) 가장자리 안쪽 물 자리 */
  const edgeWater = (cx: number, cz: number, ang: number, maxR: number, wf: (x: number, z: number) => number | null) => {
    let last: { x: number; z: number } | null = null;
    for (let r = 0; r < maxR; r += 0.75) {
      const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
      if (wf(x, z) === null) break;
      last = { x, z };
    }
    if (!last) return null;
    // 가장자리에서 4m 안쪽(찌가 3~10m 에 떨어지게)
    const back = Math.max(0, Math.hypot(last.x - cx, last.z - cz) - 4);
    return { x: cx + Math.cos(ang) * back, z: cz + Math.sin(ang) * back };
  };
  const toEarth = () => { if (game.world !== 'earth') game.setWorld('earth'); };
  const lookAt = (camSide: number) => { game.cam.yaw = game.player.yaw + camSide; };
  const findSpecies = (id: string): FishSpecies | undefined => {
    const tries = [id, id.startsWith('fish-') ? id : `fish-${id}`, id.replace(/^f_/, 'fish-')];
    for (const k of tries) { const s = FISH_BY_ID.get(k); if (s) return s; }
    return FISH_BY_GDD?.get(id) ?? (game.state.byGdd?.(id) as FishSpecies | undefined);
  };
  /** 바로 결과로(연출 포함) */
  const fakeRoll = (id?: string, size?: number, variant?: Variant): RollResult | null => {
    if (id && (id.startsWith('t_') || id === 'm_seaweed' || id === 'junk')) return { species: null, rarity: 0, junk: id === 'junk' ? 't_boot' : id, combo: 0 };
    if (id) {
      const sp = findSpecies(id);
      if (!sp) return null;
      return { species: sp, rarity: sp.rarity, size: size ?? L.fallbackSize(sp, 0.9), combo: 0, ...(variant ? { variant } : {}) };
    }
    const plan = cur.plan ?? L.planCast({ world: game.world, pond: game.world === 'space', zone: game.geo?.zoneAt?.(game.player.pos.x, game.player.pos.z) ?? null, onBoat: false });
    const r = roll({ activity: plan.activity, pool: poolAt(plan.zone, plan.island), commit: false });
    if (size) r.size = size;
    if (variant) r.variant = variant;
    return r.species || r.junk ? r : null;
  };

  W.__fishingDebug = {
    list: () => FISH.map((f) => `${f.id} ${f.name} ★${f.rarity} ${f.look.shape}`),
    count: () => FISH.length,
    /** 물고기 모델 격자(카메라 앞에) */
    gallery: (from = 0, n = 20, cols = 5, spacing = 1.3) => {
      for (const c of [...gallery.children]) { gallery.remove(c); disposeModel(c); }
      const list = FISH.slice(from, from + n);
      const rows = Math.ceil(list.length / cols);
      const P = game.player.pos;
      const center = new THREE.Vector3(P.x, P.y + 30, P.z);
      list.forEach((sp, i) => {
        const m = buildFishModel(sp);
        const col = i % cols, row = Math.floor(i / cols);
        const holder = new THREE.Group();
        holder.position.copy(center).add(new THREE.Vector3((col - (cols - 1) / 2) * spacing, ((rows - 1) / 2 - row) * spacing * 0.8, 0));
        m.rotation.y = -0.5;
        m.scale.setScalar(sp.look.shape === 'whaleshark' || sp.look.shape === 'shark' ? 1.0 : 0.95);
        holder.add(m);
        gallery.add(holder);
      });
      applyCurve(gallery);
      const dist = Math.max(cols * spacing * 1.25, rows * spacing * 1.6);
      const cam = ctx.camera;
      game.cam.update = () => {
        cam.position.set(center.x, center.y + 0.6, center.z + dist);
        cam.fov = 40; cam.updateProjectionMatrix();
        cam.lookAt(center);
        game.engine.viewTarget.copy(center);
      };
      return list.map((f) => f.name).join(',');
    },
    clearGallery: () => { for (const c of [...gallery.children]) { gallery.remove(c); disposeModel(c); } },
    /**
     * 낚시터로 가서 물 쪽을 본다. goto('heartpond'|'crater'|'hotspring'|… 호수 종류 · 'moonpond'[, 연못 번호] · 'river' · 'shore'|섬 id)
     * 또는 goto(x, z). 기본: 마을 강 낚시 포인트.
     */
    goto: (zone: string | number = 'river', b?: number, camSide = 0.9) => {
      if (typeof zone === 'number') { toEarth(); const ok = placeFacing(zone, b ?? 0); lookAt(camSide); return ok; }
      if (zone === 'moonpond' || zone === 'moon') {
        const sp = game.space;
        if (!sp) return false;
        if (game.world !== 'space') game.setWorld('space', sp.landingSpawn?.clone());
        const p = sp.ponds[Math.max(0, Math.min(sp.ponds.length - 1, Math.floor(b ?? 0)))];
        if (!p) return false;
        const w = edgeWater(p.x, p.z, 0.4, p.r + 2, pondWater) ?? { x: p.x, z: p.z };
        const ok = placeFacing(w.x, w.z);
        lookAt(camSide);
        return ok;
      }
      if (zone === 'river') { toEarth(); const ok = placeFacing(island.HERO.fishing.x, island.HERO.fishing.z); lookAt(camSide); return ok; }
      const lakes = island.worldLakes();
      const want = zone === 'ruin' ? 'oasis' : zone;
      const lake = lakes.find((l) => l.kind === want && (zone !== 'ruin' || l.island === 'desert'));
      if (lake) {
        toEarth();
        const w = edgeWater(lake.x, lake.z, b ?? 2.4, lake.r * 2.5, earthWater) ?? { x: lake.x, z: lake.z };
        const ok = placeFacing(w.x, w.z);
        lookAt(camSide);
        return ok;
      }
      const isl = island.islandById(zone === 'shore' ? 'home' : zone);
      if (isl) return (W.__fishingDebug as { gotoCoast: (id: string) => boolean }).gotoCoast(isl.id);
      return false;
    },
    /** 섬 해안: 섬 중심에서 바깥으로 가다 처음 만나는 바다 + 물가에 선다 */
    gotoCoast: (id = 'coral', ang = 3.6, camSide = 0.9) => {
      toEarth();
      const d = island.islandById(id);
      if (!d) return false;
      let wx = d.x, wz = d.z;
      for (let r = d.r * 0.5; r < d.r * 2; r += 2) { wx = d.x + Math.cos(ang) * r; wz = d.z + Math.sin(ang) * r; if (earthWater(wx, wz) !== null && earthWater(wx + Math.cos(ang) * 4, wz + Math.sin(ang) * 4) !== null) break; }
      const ok = placeFacing(wx + Math.cos(ang) * 1.5, wz + Math.sin(ang) * 1.5);
      lookAt(camSide);
      return ok;
    },
    /** 낚시 시작(충전 없이 dist m 로 바로 던지기) */
    cast: (dist = 6) => {
      if (S.phase !== 'idle') end();
      const tier = L.rodTier(isUnlocked());
      if (tier === 'none') return 'no rod';
      const deck = !!game.player.mounted && L.deckFishingOk(vehicleNow());
      begin(tier, deck);
      L.beginCast(S, dist);
      if (!onCast(S.dist)) { end(); return 'no water'; }
      return S.dist;
    },
    start: (fast = false) => {
      const r = (W.__fishingDebug as { cast: (d?: number) => unknown }).cast(6);
      if (fast && typeof r === 'number') S.approach = 0.6;
      return typeof r === 'number';
    },
    /** 다가오는 그림자를 바로 꾹! 단계로 */
    bite: () => {
      if (S.phase === 'idle' || S.phase === 'charge' || S.phase === 'cast') return false;
      if (cur.target < 0) return false;
      shadows.approach(cur.target, game.time - 10, 0.2);
      L.forceBite(S, L.biteWindow(cur.rolls[cur.target]?.rarity ?? 1, cur.rod));
      return true;
    },
    /** 장면 고정: 'cast'|'wait'|'approach'|'nibble'|'bite' 에서 멈춘 그림(촬영) */
    pose: (phase: L.Phase = 'approach') => {
      if (S.phase === 'idle') { const r = (W.__fishingDebug as { cast: (d?: number) => unknown }).cast(6); if (typeof r !== 'number') return r; }
      // 착수까지 바로
      if (S.phase === 'cast') { S.t = L.CAST_FLIGHT; const ev = L.step(S, 0, { press: false, held: false, cancel: false }, rng); if (ev.some((e) => e.type === 'land')) onLand(); }
      if (cur.target < 0) return 'no fish';
      cur.frozen = true;
      if (phase === 'approach' || phase === 'nibble' || phase === 'bite') shadows.approach(cur.target, game.time - (phase === 'approach' ? S.approach * 0.6 : 10), S.approach);
      S.phase = phase; S.t = 0.04;
      if (phase === 'nibble') { tokAt = game.time; shadows.poke(cur.target, game.time); }
      if (phase === 'bite') shadows.bite(cur.target);
      splash(cur.cast.x, cur.waterY, cur.cast.z, 0.8);
      rings[(ringI - 1) % rings.length].born = game.time - 0.35;
      return speciesOf(cur.rolls[cur.target])?.name ?? cur.rolls[cur.target]?.junk ?? '?';
    },
    /** 바로 잡기: catchNow(id?, size?, variant?) — id 는 'fish-…'·GDD 'f_…'·쓰레기 't_…'. 없으면 이 자리 후보에서 굴린다 */
    catchNow: (id?: string, size?: number, variant?: Variant) => {
      const r = fakeRoll(id, size, variant);
      if (!r) return null;
      if (S.phase !== 'idle') end();
      if (!cur.plan) cur.plan = L.planCast({ world: game.world, pond: game.world === 'space', zone: null, onBoat: false });
      L.resolveCatch(r, cur.plan.activity, hooks, r.size ?? sizeFallback(r));
      if (r.rarity >= 3) sparkBorn = game.time - 0.6;
      return r.junk ?? speciesOf(r)?.name ?? null;
    },
    /** 달리기 놀람 흉내 */
    spook: () => { spookUntil = game.time + L.SPOOK_SEC; return ambient.update(game.time, { x: game.player.pos.x, z: game.player.pos.z, speed: L.SPOOK_SPEED + 1 }); },
    setBait: (id: string) => { F().bait = id; save(); return L.chooseBait(id, count) ?? 'none'; },
    /** 두근 게이지 분홍 반짝 강제(촬영) */
    glow: (on = true) => { forceGlow = on; cur.glow = on || (!!cur.plan && gaugeOf(cur.plan.activity) > 0.8); return on; },
    stop: () => end(),
    state: () => ({
      phase: S.phase, t: Math.round(S.t * 100) / 100, dist: S.dist, window: S.window, rod: cur.rod, deck: cur.deck, bait: cur.bait,
      activity: cur.plan?.activity, zone: cur.plan?.zone, glow: cur.glow, spooked: L.isSpooked(spookUntil, game.time),
      target: cur.target, flags: { ...F() },
    }),
    shadows: () => cur.rolls.map((r, i) => ({ i, id: r.species?.id ?? r.junk, rarity: r.rarity, variant: r.variant, size: r.size, target: i === cur.target, pos: shadows.pos(i) })),
    ambient: () => ambient.live(),
    pool: (zone?: string) => {
      const zi = game.world === 'earth' ? game.geo?.zoneAt?.(game.player.pos.x, game.player.pos.z) : null;
      const z = zone ?? (game.world === 'space' ? 'moonpond' : L.fishingZone(zi?.zone, false));
      return poolAt(z, zi?.island ?? null).map((s) => s.id);
    },
    // ── P1 ──
    /**
     * 릴 줄다리기 바로 보기: 지금 물가에서 던져 ★4+ 그림자를 걸고 fight 단계로. id = 그 종(없으면 이 자리 ★4+ 중 하나).
     * freeze = true 면 텐션·감기를 고정(촬영) — tension/progress 로 값을 줄 수 있다.
     */
    reel: (id?: string, freeze = false, tension = 0.84, progress = 0.55) => {
      if (S.phase !== 'idle') end();
      const r0 = (W.__fishingDebug as { cast: (d?: number) => unknown }).cast(7);
      if (typeof r0 !== 'number') return r0;
      S.t = L.CAST_FLIGHT;
      const ev = L.step(S, 0, { press: false, held: false, cancel: false }, rng);
      if (ev.some((e) => e.type === 'land')) onLand();
      if (cur.target < 0) return 'no fish';
      let r: RollResult | null = null;
      if (id) r = fakeRoll(id);
      if (!r) {
        const pool = poolAt(cur.plan!.zone, cur.plan!.island).filter((sp) => sp.rarity >= 4);
        const sp = pool.length ? pool[Math.floor(rng() * pool.length)] : FISH.find((f) => f.rarity >= 4 && f.where.some((w) => w.zone === cur.plan!.zone));
        if (sp) r = fakeRoll(sp.id);
      }
      if (!r || !r.species) return 'no big fish';
      cur.rolls[cur.target] = r;
      shadows.approach(cur.target, game.time - 10, 0.2);
      L.forceFight(S);
      onHook();
      if (freeze && fight.state) { fight.frozen = true; fight.state.tension = tension; fight.state.progress = progress; fight.state.surge = 0.5; }
      return r.species.name;
    },
    fightState: () => (fight.state ? { ...fight.state, coop: fight.forceCoop || fight.coop.active(game.time), peer: fight.coop.peer() } : null),
    /** 협동 강제(친구 없이 ×2 보기) */
    coop: (on = true) => { fight.forceCoop = on; return on; },
    /** 모래시계섬 모래 언덕 한가운데로 — 모래 쪽을 본다 */
    sand: (ang = 0.6, camSide = 0.9) => {
      toEarth();
      const d = island.islandById('desert');
      if (!d) return false;
      for (let r = 0; r < d.r * 0.3; r += 6) for (let k = 0; k < 12; k++) {
        const a = ang + (k / 12) * Math.PI * 2;
        const x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r;
        // 둘레 8m 가 다 모래 언덕인 자리
        if (sandAt(x, z) === null || [0, 1, 2, 3, 4, 5].some((j) => sandAt(x + Math.cos(a + j * 1.05) * 8, z + Math.sin(a + j * 1.05) * 8) === null)) continue;
        game.player.teleport(x, z);
        game.player.yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
        lookAt(camSide);
        return { x: Math.round(x), z: Math.round(z) };
      }
      return false;
    },
    /** 모래 낚시 시작(던지기까지) */
    sandCast: (dist = 7) => {
      if (S.phase !== 'idle') end();
      const tier = L.rodTier(isUnlocked());
      if (tier === 'none') return 'no rod';
      begin(tier, false, 'sand');
      L.beginCast(S, dist);
      if (!onCast(S.dist)) { end(); return 'no sand'; }
      return S.dist;
    },
    p1: p1.debug,
  };

  return root;
}
