// 행성 생물 스포너(game.space.addSpawn 으로 행성마다 하나): GDD 3.9.1 P1 우주 생물을 그 행성에 띄운다.
// 슈가링 솜사탕양(털 깎기)·고리뱀(잠자리채) / 젤리별 젤리곰 6색(낮) / 서리볼 수정가시 고슴도치(밤) / 솜사탕 성운 풍선문어(붙잡으면 둥실)·하늘고래(저녁, 친해지기) /
// 자갈띠 UFO해파리(유성우)·혜성여우(유성우 밤)·토성 달팽이 / 까만 도넛 꼬마별. 종은 space 가 등록한 것을 state.byGdd 로 찾는다(없으면 건너뛴다).
import * as THREE from 'three';
import { blobShadow } from '../../core/art';
import type { Species } from '../../core/state';
import {
  SPAWNS, CLOUD_ISLES, beltRocks, rockTopAt, inJellySea, whenOk, JELLY_BEAR_COLORS, PLANET_BY_ID, WHALE_MAX, type SpawnRow,
} from './logic';
import { modelFor, setShorn, type Model } from './models';
import type { PlanetCtx } from './kit';

/** 한 마리 */
export interface Critter {
  row: SpawnRow;
  sp: Species;
  m: Model;
  /** 집 자리(국소) */
  hx: number; hz: number;
  ph: number;
  goneUntil: number;
  out: boolean;
  shadow: THREE.Mesh | null;
  pos: THREE.Vector3;
  /** 젤리곰 색 등 */
  color?: string;
  /** 바위 위(자갈띠) */
  onRock: boolean;
}

/** 스포너 밖에서 쓰는 것(하늘고래 하트·꼬마별 펫 등) */
export interface LifeHooks {
  /** 하늘고래 쓰다듬기 → 오늘 첫 번이면 하트 +1, 지금 하트 수 */
  petWhale(): { hearts: number; gain: number };
  /** 잡은 뒤 덤(혜성여우 소원 · 꼬마별 펫 · 고슴도치 결정) */
  afterCatch(id: string): void;
}


/** 배치 자리(국소) 하나 고르기 */
function pickSpot(pc: PlanetCtx, row: SpawnRow, r: () => number): { x: number; z: number; rock: boolean } | null {
  const spawn = PLANET_BY_ID.get(pc.id)!.spawn;
  for (let tries = 0; tries < 40; tries++) {
    let x = 0, z = 0, rock = false;
    const A = row.area;
    if (A.kind === 'disc') { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * A.r; x = A.x + Math.cos(a) * d; z = A.z + Math.sin(a) * d; }
    else if (A.kind === 'ring') { const a = r() * Math.PI * 2, d = A.r + (r() - 0.5) * 2 * A.half; x = Math.cos(a) * d; z = Math.sin(a) * d; }
    else if (A.kind === 'isles') { const c = CLOUD_ISLES[1 + Math.floor(r() * (CLOUD_ISLES.length - 1))]; const a = r() * 6.28, d = r() * c.r * 0.55; x = c.x + Math.cos(a) * d; z = c.z + Math.sin(a) * d; }
    else { const rocks = beltRocks().filter((q) => q.r >= 6); const q = rocks[Math.floor(r() * rocks.length)]; const a = r() * 6.28, d = r() * 0.35 * q.r; x = q.x + Math.cos(a) * d; z = q.z + Math.sin(a) * d; rock = true; }
    if (Math.hypot(x - spawn.x, z - spawn.z) < 8) continue;
    if (pc.id === 'jelly' && inJellySea(x, z, 1.1)) continue;
    return { x, z, rock };
  }
  return null;
}

/** 그 자리 바닥(월드 y) — 바위 위면 바위 윗면 */
function floorY(pc: PlanetCtx, c: { onRock: boolean }, x: number, z: number) {
  if (c.onRock) { const t = rockTopAt(x, z); if (t !== null) return pc.O.y + t; }
  return pc.gy(x, z);
}

/** 행성 생물 짓기(행성 root 아래). 돌려주는 update 는 스포너 update 로 */
export function buildLife(pc: PlanetCtx, root: THREE.Object3D, hooks: LifeHooks): { critters: Critter[]; update(t: number, dt: number): void } {
  const { game } = pc;
  const rows = SPAWNS[pc.id] ?? [];
  const critters: Critter[] = [];
  const grp = new THREE.Group();
  grp.name = `planets-life-${pc.id}`;
  root.add(grp);
  for (const row of rows) {
    const sp = game.state.byGdd(row.species);
    if (!sp) continue;
    const r = pc.rng(`planets:${pc.id}:life:${row.species}`);
    for (let i = 0; i < row.n; i++) {
      const at = pickSpot(pc, row, r);
      if (!at) continue;
      const ph = r();
      const color = row.species === 's_jelly_bear' ? JELLY_BEAR_COLORS[i % JELLY_BEAR_COLORS.length] : undefined;
      const m = modelFor(row.species, ph, color);
      if (row.scale) m.scale.setScalar(row.scale);
      const c: Critter = { row, sp, m, hx: at.x, hz: at.z, ph, goneUntil: 0, out: true, shadow: null, pos: m.position, color, onRock: at.rock };
      const fy = floorY(pc, c, at.x, at.z);
      m.position.set(pc.O.x + at.x, fy + (row.hover ?? 0), pc.O.z + at.z);
      m.rotation.y = r() * 6.28;
      if (row.hover) {
        // 떠 있는 친구는 그림자를 땅에 따로
        const own = m.getObjectByName('blob-shadow');
        if (own) own.visible = false;
        c.shadow = blobShadow(0.35 * (row.scale ?? 1) * (row.species === 's_sky_whale' ? 2 : 1));
        c.shadow.position.set(m.position.x, fy + 0.03, m.position.z);
        grp.add(c.shadow);
      }
      if (row.how === 'shear' && pc.takenToday(`shear:${i}`)) setShorn(m, true);
      grp.add(m);
      critters.push(c);
      addAction(pc, c, i, hooks);
      pc.addWitness(sp.id, m.position, () => c.out && m.visible);
    }
  }

  // 움직임: 가까운 것만(70 m) 숨쉬고 돌아다닌다
  const update = (t: number, dt: number) => {
    const pl = game.player.pos;
    const meteor = pc.meteor(), hour = pc.hour();
    for (const c of critters) {
      const m = c.m;
      c.out = whenOk(c.row.when, hour, meteor);
      const back = c.goneUntil <= game.time;
      const dx = pl.x - m.position.x, dz = pl.z - m.position.z, d2 = dx * dx + dz * dz;
      const farR = c.row.species === 's_sky_whale' ? 260 : 70;
      const vis = c.out && back && d2 < farR * farR;
      if (m.visible !== vis) { m.visible = vis; if (c.shadow) c.shadow.visible = vis; }
      if (!vis) continue;
      const tt = t + c.ph * 10;
      m.userData.anim(tt);
      const hover = c.row.hover ?? 0;
      if (c.row.area.kind === 'ring') {
        // 고리뱀: 고리 길을 따라 데굴데굴
        const a0 = Math.atan2(c.hz, c.hx), R = Math.hypot(c.hx, c.hz);
        const a = a0 + Math.sin(tt * 0.08) * 0.12;
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        m.position.set(pc.O.x + x, pc.gy(x, z), pc.O.z + z);
        m.rotation.y = -a;
        continue;
      }
      if (hover > 0) {
        const wr = c.row.species === 's_sky_whale' ? 18 : 1.8;
        const a = tt * (c.row.species === 's_sky_whale' ? 0.05 : 0.3);
        const x = c.hx + Math.sin(a) * wr, z = c.hz + Math.cos(a * 0.83) * wr;
        const fy = floorY(pc, c, x, z);
        m.position.set(pc.O.x + x, fy + hover + Math.sin(tt * 0.9) * 0.35, pc.O.z + z);
        m.rotation.y = Math.atan2(Math.cos(a), -Math.sin(a * 0.83) * 0.83);
        if (c.shadow) c.shadow.position.set(m.position.x, fy + 0.03, m.position.z);
        continue;
      }
      if (d2 < 12 * 12) {
        // 가까우면 멈춰서 쳐다본다(얼굴이 보이게)
        const want = Math.atan2(dx, dz);
        let dd = want - m.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        m.rotation.y += dd * (dt > 0 ? Math.min(1, dt * 4) : 1);
      } else {
        const wr = c.onRock ? 1.2 : 3;
        const a = tt * 0.1;
        const x = c.hx + Math.sin(a) * wr, z = c.hz + Math.cos(a) * wr;
        m.position.set(pc.O.x + x, floorY(pc, c, x, z), pc.O.z + z);
        m.rotation.y = a + Math.PI / 2;
      }
    }
  };
  return { critters, update };
}

/** 잡는 법마다 E 행동 */
function addAction(pc: PlanetCtx, c: Critter, i: number, hooks: LifeHooks) {
  const { game } = pc;
  const sp = c.sp, m = c.m, name = sp.name;
  const alive = () => c.out && c.goneUntil <= game.time && m.visible;
  const hide = (sec: number) => { c.goneUntil = game.time + sec; m.visible = false; if (c.shadow) c.shadow.visible = false; };
  const big = c.row.species === 's_sky_whale';
  const reach = big ? 12 : (c.row.hover ?? 0) > 1.4 ? 2.8 : 2.6;
  const id = `planets:${pc.id}:${c.row.how}:${sp.id}:${i}`;
  const show = () => modelFor(c.row.species, c.ph, c.color);
  switch (c.row.how) {
    case 'net':
      pc.addActor({
        id, pos: m.position, r: reach, cone: true, ok: alive,
        label: () => (pc.unlocked('tool:net') ? `${name} 잡기 (잠자리채)` : '잠자리채가 있어야 해요'),
        use: () => {
          if (!pc.unlocked('tool:net')) { pc.toast('잠자리채가 있어야 잡을 수 있어요! 🦋'); return; }
          game.player.act?.('net', 0.6);
          pc.catchSpecies(sp, { model: show() });
          hooks.afterCatch(sp.id);
          hide(45);
        },
      });
      break;
    case 'shear': {
      const key = `shear:${i}`;
      pc.addActor({
        id, pos: m.position, r: reach, ok: () => alive() && !pc.takenToday(key),
        label: `${name} 털 깎기 ✂️`,
        use: () => {
          game.player.act?.('shake', 0.9);
          pc.catchSpecies(sp, { model: show() });
          pc.markToday(key);
          setShorn(m, true);
          pc.toast('복슬복슬 솜사탕 털을 깎았어요! (내일 다시 자라요)');
          hooks.afterCatch(sp.id);
        },
      });
      break;
    }
    case 'lift':
      pc.addActor({
        id, pos: m.position, r: reach, ok: alive,
        label: `${name} 붙잡기 🎈`,
        use: () => {
          const pl = game.player;
          pl.act?.('hold', 1.2);
          pc.catchSpecies(sp, { model: show() });
          // 붙잡으면 같이 둥실 떠오른다
          pl.mode = 'air';
          pl.vel.y = Math.max(pl.vel.y, 9);
          pc.toast('🎈 빵빠레! 같이 둥실 떠올라요~');
          hooks.afterCatch(sp.id);
          hide(50);
        },
      });
      break;
    case 'pet':
      pc.addActor({
        id, pos: m.position, r: reach, flat: true, ok: () => c.out && m.visible,
        label: () => `${name} 쓰다듬기 🐋`,
        use: () => {
          game.player.act?.('pet', 1.2);
          const first = !game.state.dex[sp.id];
          if (first) game.ui.showCatch({ species: sp, model: show(), line: '우와… 은하수를 헤엄치는 고래!', activity: 'space', keep: false });
          const r = hooks.petWhale();
          if (r.gain > 0) pc.toast(`🐋 하늘고래가 꼬리를 살랑! 하트 ${'💗'.repeat(r.hearts)}${'🤍'.repeat(Math.max(0, WHALE_MAX - r.hearts))}`);
          else if (!first) pc.toast(r.hearts >= WHALE_MAX ? '🐋 하늘고래는 이제 단짝이에요! 행성 사이를 공짜로 태워 줘요' : '🐋 오늘은 벌써 쓰다듬었어요. 내일 또 만나요!');
          if (r.gain > 0 && r.hearts >= WHALE_MAX) game.hud?.card?.({ title: '하늘고래와 단짝!', body: '이제 별 없이도 하늘고래가 다음 행성까지 태워 줘요 🐋✨', icon: '🐋', color: '#c8e8ff' });
        },
      });
      break;
    case 'grab':
    case 'pickup':
    default:
      pc.addActor({
        id, pos: m.position, r: reach, ok: alive,
        label: `${name} 잡기`,
        use: () => {
          game.player.act?.('pick', 0.6);
          pc.catchSpecies(sp, { model: show() });
          hooks.afterCatch(sp.id);
          hide(45);
        },
      });
  }
}
