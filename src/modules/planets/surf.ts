// 슈가링 고리 서핑: 사탕 고리 길(반경 120 m) 위를 서핑보드로 빙글빙글. W 가속 · S 브레이크 · A/D 안쪽·바깥쪽 · Space 톡 점프 · E 내리기.
// 보드는 Mountable(코어 player.mount) — 좌석을 따라 플레이어가 앉는다. 내리면 고리 옆 땅에 내려 주고 보드는 치운다.
import * as THREE from 'three';
import type { Mountable } from '../../core/game';
import { SUGAR_RING } from './logic';
import { GEO, toyMat, tintMat, instanced, mat4 } from './kit';
import type { PlanetCtx } from './kit';

export const SURF = { min: 3, max: 18, accel: 7, brake: 10, drag: 0.35, side: 5, hop: 6.5, grav: 11 } as const;

/** 순수: 서핑 한 걸음(각도·속도·옆 위치·점프) — 테스트용으로 분리 */
export interface SurfState { a: number; speed: number; off: number; hopY: number; hopV: number }
export function surfStep(s: SurfState, ax: { x: number; y: number }, jump: boolean, dt: number): SurfState {
  const o = { ...s };
  if (ax.y > 0) o.speed += SURF.accel * ax.y * dt;
  else if (ax.y < 0) o.speed += SURF.brake * ax.y * dt;
  else o.speed -= SURF.drag * dt;
  o.speed = Math.min(SURF.max, Math.max(SURF.min, o.speed));
  const lim = SUGAR_RING.half - 1.5;
  o.off = Math.min(lim, Math.max(-lim, o.off - ax.x * SURF.side * dt));
  o.a += (o.speed / (SUGAR_RING.r + o.off)) * dt;
  if (jump && o.hopY <= 0.001) o.hopV = SURF.hop;
  o.hopV -= SURF.grav * dt;
  o.hopY = Math.max(0, o.hopY + o.hopV * dt);
  if (o.hopY <= 0) o.hopV = 0;
  return o;
}

/** 보드 메시(분홍·흰 줄 + 반짝 꼬리) */
function makeBoard(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sugar-surfboard';
  g.rotation.order = 'YXZ';
  const deck = new THREE.Mesh(GEO.sph, toyMat('#ff9fc8', { rough: 0.3 }));
  deck.scale.set(0.42, 0.07, 1.25); deck.castShadow = true;
  const stripe = new THREE.Mesh(GEO.sph, toyMat('#fffaf2', { rough: 0.3 }));
  stripe.scale.set(0.12, 0.075, 1.2); stripe.position.y = 0.01;
  const fin = new THREE.Mesh(GEO.sph, toyMat('#9ef0d2'));
  fin.scale.set(0.03, 0.14, 0.18); fin.position.set(0, -0.1, -0.9);
  const trail = instanced(GEO.sphLo, tintMat({ glow: true }), [0, 1, 2, 3, 4].map((i) => mat4(0, 0.02, -1.4 - i * 0.35, 0.12 - i * 0.018)), [0, 1, 2, 3, 4].map((i) => new THREE.Color(['#ffd84a', '#ff9fb8', '#9ef0d2', '#8fd3f4', '#c9b6f2'][i])), 'surf-trail');
  const seat = new THREE.Object3D();
  seat.name = 'seat';
  seat.position.y = 0.12;
  g.add(deck, stripe, fin, trail, seat);
  g.userData.seat = seat;
  g.userData.trail = trail;
  return g;
}

/** 서핑 시작: 플레이어 자리에서 가장 가까운 고리 점부터 */
export function startSurf(pc: PlanetCtx, root: THREE.Object3D): Mountable & { state: SurfState; board: THREE.Group } {
  const { game, O } = pc;
  const board = makeBoard();
  root.add(board);
  const lx = game.player.pos.x - O.x, lz = game.player.pos.z - O.z;
  let st: SurfState = { a: Math.atan2(lz, lx), speed: 6, off: Math.max(-(SUGAR_RING.half - 1.5), Math.min(SUGAR_RING.half - 1.5, Math.hypot(lx, lz) - SUGAR_RING.r)), hopY: 0, hopV: 0 };
  const place = (t: number) => {
    const R = SUGAR_RING.r + st.off;
    const x = Math.cos(st.a) * R, z = Math.sin(st.a) * R;
    board.position.set(O.x + x, pc.gy(x, z) + 0.28 + st.hopY + Math.sin(t * 7) * 0.04, O.z + z);
    // 진행 방향(각도가 늘어나는 쪽) = (−sin a, cos a) → 보드 앞(+z)
    board.rotation.set(Math.sin(t * 3) * 0.05, -st.a, -0.18 * Math.min(1, st.speed / SURF.max));
    const trail = board.userData.trail as THREE.InstancedMesh;
    trail.visible = st.speed > 5;
  };
  place(game.time);
  const m: Mountable & { state: SurfState; board: THREE.Group } = {
    name: '사탕 서핑보드',
    seat: board.userData.seat as THREE.Object3D,
    object: board,
    camDistance: 1.35,
    state: st,
    board,
    drive: (input, dt) => {
      st = surfStep(st, input.axis(), input.hit('Space'), dt);
      m.state = st;
      place(game.time);
    },
    onExit: () => {
      const R = SUGAR_RING.r + SUGAR_RING.half + 1.5;
      const x = Math.cos(st.a) * R, z = Math.sin(st.a) * R;
      board.removeFromParent();
      return new THREE.Vector3(O.x + x, pc.gy(x, z) + 0.2, O.z + z);
    },
  };
  return m;
}
