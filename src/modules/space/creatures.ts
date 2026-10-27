// 달 생물: 한 마리 띄우기(모델·그림자·움직임·시간대 보이기) + 잡는 법별 E 행동
// (잠자리채 부채꼴 · 점프해서 둥실 잡기 · 인사(목격) · 느린 줍기 · 그냥 잡기) + 평원·하늘 생물 청크 레이어.
import * as THREE from 'three';
import { makeCreature, groundShadow, type Creature } from './model';
import { SPACE_SPECIES, type SpaceSpecies, type MoonZone } from './data';
import { isEarthUp, isSpaceNight, MOON_PLACES, MOON_R, moonPondsLocal, PAD_R } from './logic';
import { onDispose, runDispose, type Hub } from './hub';

export interface Critter {
  sp: SpaceSpecies;
  m: Creature;
  /** 집 자리(국소) */
  hx: number; hz: number;
  ph: number;
  /** 다시 나타나는 game.time */
  goneUntil: number;
  wanderR: number;
  speed: number;
  /** 지금 시간대에 나와 있나 */
  out: boolean;
  shadow: THREE.Mesh | null;
  /** 스스로 움직이지 않는다(마을 방아 토끼·둥지 공룡처럼 장소가 직접 움직임) */
  fixed?: boolean;
  /** 월드 위치(살아 있는 참조) */
  pos: THREE.Vector3;
}

/** 시간대: 지금 나와 있을 시각인가 */
export function isOut(sp: SpaceSpecies, hour: number) {
  if (sp.when === 'night') return isSpaceNight(hour);
  if (sp.when === 'earth') return isEarthUp(hour);
  return true;
}

const tmpV = new THREE.Vector3();

/**
 * 한 마리 띄우기 — parent 아래 모델을 두고 E 행동·목격·움직임을 등록한다. 정리 함수는 parent 의 dispose 로 묶인다.
 * lx·lz = 국소 집 자리.
 */
export function spawnCritter(hub: Hub, parent: THREE.Object3D, sp: SpaceSpecies, lx: number, lz: number, o: { ph?: number; scale?: number; yaw?: number; wanderR?: number; fixed?: boolean; label?: string } = {}): Critter {
  const { game, O } = hub;
  const ph = o.ph ?? 0;
  const m = makeCreature(sp, (ph * 0.173) % 1);
  if (o.scale) m.scale.multiplyScalar(o.scale);
  m.rotation.y = o.yaw ?? 0;
  const gy = hub.groundY(lx, lz);
  m.position.set(O.x + lx, gy + sp.hover, O.z + lz);
  parent.add(m);
  let shadow: THREE.Mesh | null = null;
  if (sp.hover > 0) {
    shadow = groundShadow(0.5 * sp.size * (o.scale ?? 1));
    shadow.position.set(m.position.x, gy + 0.03, m.position.z);
    parent.add(shadow);
  }
  const c: Critter = {
    sp, m, hx: lx, hz: lz, ph, goneUntil: 0, wanderR: o.wanderR ?? (sp.hover > 0 ? 1.6 : 2.5), speed: 0.25 + ((ph * 7.31) % 1) * 0.35,
    out: true, shadow, fixed: o.fixed, pos: m.position,
  };
  const alive = () => c.out && c.goneUntil <= game.time && m.visible;
  const hide = (sec: number) => { c.goneUntil = game.time + sec; m.visible = false; if (shadow) shadow.visible = false; };
  const big = sp.kind === 'brachio' || sp.kind === 'starsaurus';
  const reach = big ? 6.5 : sp.how === 'float' ? 2.4 : 2.6;

  const offs: Array<() => void> = [];
  /** 느린 줍기 진행 중이면 그 틱 끄기 */
  let pendingOff: (() => void) | null = null;
  switch (sp.how) {
    case 'net':
      offs.push(hub.addActor({
        id: `space:net:${sp.id}:${Math.round(lx)},${Math.round(lz)}`, pos: m.position, r: reach, cone: true, ok: alive,
        label: () => (hub.unlocked('tool:net') ? `${sp.name} 잡기 (잠자리채)` : '잠자리채가 있어야 해요'),
        use: () => {
          if (!hub.unlocked('tool:net')) { hub.toast('잠자리채가 있어야 잡을 수 있어요! 🦋'); return; }
          game.player.act?.('net', 0.6);
          hub.catchSpecies(sp, { model: makeCreature(sp), how: 'net' });
          hide(40);
        },
      }));
      break;
    case 'float': {
      // 공중 3~6m — 3차원 거리로만 닿는다(점프·둥실 중에만)
      offs.push(hub.addActor({
        id: `space:float:${sp.id}:${Math.round(lx)},${Math.round(lz)}`, pos: m.position, r: reach, cone: false, ok: alive,
        label: () => (hub.unlocked('tool:net') ? `${sp.name} 잡기 (잠자리채)` : '잠자리채가 있어야 해요'),
        use: () => {
          if (!hub.unlocked('tool:net')) { hub.toast('잠자리채가 있어야 잡을 수 있어요! 🫧'); return; }
          game.player.act?.('net', 0.6);
          hub.catchSpecies(sp, { model: makeCreature(sp), how: 'float' });
          hide(45);
        },
      }));
      // 아래에 서 있으면 귀띔
      const hint = new THREE.Vector3();
      offs.push(hub.addActor({
        id: `space:floathint:${sp.id}:${Math.round(lx)},${Math.round(lz)}`, pos: hint, r: 5, flat: true,
        ok: () => { hint.copy(m.position); return alive() && m.position.distanceTo(game.player.pos) > reach; },
        label: `${sp.name}: 점프해서 잡자! (Space 꾹 = 둥실)`,
        use: () => hub.toast('Space 로 높이 뛰고, 꾹 누르면 3초 동안 둥실 떠 있어요! 🫧'),
      }));
      break;
    }
    case 'greet':
      offs.push(hub.addActor({
        id: `space:greet:${sp.id}:${Math.round(lx)},${Math.round(lz)}`, pos: m.position, r: big ? 8 : 3, flat: true, ok: () => c.out && m.visible,
        label: o.label ?? `${sp.name}에게 인사하기`,
        use: () => {
          game.player.act?.('wave', 1.2);
          hub.greet(sp, makeCreature(sp), sp.line);
        },
      }));
      offs.push(hub.addWitness({ speciesId: sp.id, pos: m.position, visible: () => c.out && m.visible }));
      break;
    case 'pickup':
      offs.push(hub.addActor({
        id: `space:pickup:${sp.id}:${Math.round(lx)},${Math.round(lz)}`, pos: m.position, r: reach, ok: alive,
        label: `${sp.name} 줍기 (느릿느릿)`,
        use: () => {
          // 느린 줍기: 잠깐 멈춰서 낑낑 들어 올린다
          const pl = game.player;
          pl.act?.('pick', 1.1);
          pl.lock?.('space-pickup');
          let left = 1.1;
          pendingOff?.();
          const off = hub.addTicker((_t, dt) => {
            left -= dt > 0 ? dt : 1 / 60;
            if (left > 0) return;
            off();
            pendingOff = null;
            pl.unlock?.('space-pickup');
            hub.catchSpecies(sp, { model: makeCreature(sp), how: 'pickup' });
            hide(60);
          });
          pendingOff = off;
        },
      }));
      // 들어 올리는 중에 청크가 버려지면: 틱을 끊고 잠금도 푼다(지구에서 굳지 않게)
      offs.push(() => { if (!pendingOff) return; pendingOff(); pendingOff = null; game.player.unlock?.('space-pickup', true); });
      break;
    case 'grab':
    default:
      offs.push(hub.addActor({
        id: `space:grab:${sp.id}:${Math.round(lx)},${Math.round(lz)}`, pos: m.position, r: reach, ok: alive,
        label: `${sp.name} 잡기`,
        use: () => {
          game.player.act?.('pick', 0.6);
          hub.catchSpecies(sp, { model: makeCreature(sp), how: 'grab' });
          hide(40);
        },
      }));
  }

  // 움직임
  offs.push(hub.addTicker((t, dt) => {
    const pl = game.player.pos;
    c.out = isOut(sp, hub.hour());
    const back = c.goneUntil <= game.time;
    const vis = c.out && back;
    if (m.visible !== vis) { m.visible = vis; if (shadow) shadow.visible = vis; }
    if (!vis) return;
    const dx = pl.x - m.position.x, dz = pl.z - m.position.z, d2 = dx * dx + dz * dz;
    // 멀면 숨기고 쉰다(큰 친구는 멀리서도 보이게)
    const farR = sp.kind === 'brachio' ? 400 : sp.kind === 'starsaurus' ? 140 : 80;
    const near = d2 < farR * farR;
    if (m.visible !== near) { m.visible = near; if (shadow) shadow.visible = near; }
    if (!near) return;
    const tt = t + ph;
    m.userData.anim(tt);
    if (c.fixed) return;
    if (sp.hover > 0) {
      const a = tt * 0.3 * c.speed;
      const x = c.hx + Math.sin(a) * c.wanderR, z = c.hz + Math.cos(a * 0.83) * c.wanderR;
      const g = hub.groundY(x, z);
      m.position.set(O.x + x, g + sp.hover + Math.sin(tt * 0.9) * 0.35, O.z + z);
      m.rotation.y = Math.atan2(Math.cos(a), -Math.sin(a * 0.83) * 0.83);
      if (shadow) shadow.position.set(m.position.x, g + 0.03, m.position.z);
    } else {
      // 가까우면 멈춰서 쳐다본다(얼굴이 보이게), 아니면 집 둘레를 천천히
      if (d2 < 14 * 14) {
        const want = Math.atan2(dx, dz);
        let dd = want - m.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        m.rotation.y += dd * (dt > 0 ? Math.min(1, dt * 4) : 1);
      } else if (c.wanderR > 0) {
        const a = tt * 0.12 * c.speed;
        const x = c.hx + Math.sin(a) * c.wanderR, z = c.hz + Math.cos(a) * c.wanderR;
        m.position.set(O.x + x, hub.groundY(x, z), O.z + z);
        m.rotation.y = a + Math.PI / 2;
      }
    }
  }));
  onDispose(parent, ...offs);
  return c;
}

/** 평원·하늘에 둘 수 있는 자리인가(국소) */
function openSpot(x: number, z: number, ponds: Array<{ x: number; z: number; r: number }>) {
  const P = MOON_PLACES;
  const R = Math.hypot(x, z);
  if (R < PAD_R + 6 || R > MOON_R * 0.9) return false;
  for (const p of ponds) if (Math.hypot(x - p.x, z - p.z) < p.r + 3) return false;
  const keep: Array<[{ x: number; z: number }, number]> = [[P.village, 32], [P.nest, 22], [P.wreck, 18], [P.farHill, 30], [P.field, 26]];
  return !keep.some(([q, r]) => Math.hypot(x - q.x, z - q.z) < r);
}

/** 희귀도 가중치(5.2 W) */
const W: Record<number, number> = { 1: 55, 2: 27, 3: 12, 4: 5, 5: 1 };
function pickWeighted(pool: SpaceSpecies[], r: () => number) {
  const tot = pool.reduce((a, s) => a + (W[s.rarity] ?? 1), 0);
  let x = r() * tot;
  for (const s of pool) { x -= W[s.rarity] ?? 1; if (x <= 0) return s; }
  return pool[pool.length - 1];
}
const zonePool = (z: MoonZone) => SPACE_SPECIES.filter((s) => s.zone === z && !s.p1);

/** 평원·하늘 생물 청크(96 m, 반경 120 m) — 결정적 배치, 시간대는 보이기로 */
export function addLifeLayer(hub: Hub, active: () => boolean) {
  const { game, O } = hub;
  const ponds = moonPondsLocal();
  const plain = zonePool('plain'), sky = zonePool('sky');
  game.chunks.add({
    key: 'space-moon-life', size: 96, radius: 110, world: 'space',
    build: ({ x0, z0, size, cx, cz }) => {
      if (!active()) return null;
      const lx0 = x0 - O.x, lz0 = z0 - O.z;
      const r = hub.rng(`space:life:${cx},${cz}`);
      const grp = new THREE.Group();
      grp.name = 'moon-life';
      const n = 2 + (r() < 0.45 ? 1 : 0) + (r() < 0.25 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const x = lx0 + 6 + r() * (size - 12), z = lz0 + 6 + r() * (size - 12);
        if (!openSpot(x, z, ponds)) continue;
        spawnCritter(hub, grp, pickWeighted(plain, r), x, z, { ph: r() * 10, yaw: r() * 6.28 });
      }
      if (r() < 0.6) {
        const x = lx0 + 10 + r() * (size - 20), z = lz0 + 10 + r() * (size - 20);
        if (openSpot(x, z, ponds)) spawnCritter(hub, grp, pickWeighted(sky, r), x, z, { ph: r() * 10 });
      }
      return grp.children.length ? grp : null;
    },
    dispose: (o) => runDispose(o),
  });
}

/** 플레이어 앞쪽 부채꼴 안인가(잠자리채) */
export function inCone(facing: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, cos = 0.35) {
  tmpV.set(to.x - from.x, 0, to.z - from.z);
  const d = tmpV.length();
  if (d < 0.9) return true;
  return tmpV.divideScalar(d).dot(facing) >= cos;
}
