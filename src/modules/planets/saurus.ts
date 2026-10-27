// 별공룡 친해지기(GDD 3.9 P1): 토끼달 별공룡 둥지(150, −220) 옆에 별사과 먹이 그릇을 둔다(game.space.addSpawn('moon')).
// 별사과(m_starapple) 하나를 주면 하루에 하트 1개(최대 5) → befriend {id:'s_starsaurus', hearts, kind:'dino'}. 하트가 퐁퐁 떠오른다.
import * as THREE from 'three';
import { GEO, toyMat, shared } from './kit';
import { MOON_NEST, STARSAURUS_MAX, feedSaur, type SaurState } from './logic';
import type { Actor } from './kit';
import type { Game } from '../../core/game';

let heartGeo: THREE.BufferGeometry | null = null;
/** 통통한 하트(공유) */
export function heartGeometry() {
  if (heartGeo) return heartGeo;
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.15, -0.35, -0.6, -0.1, -0.6, 0.2);
  s.bezierCurveTo(-0.6, 0.5, -0.25, 0.62, 0, 0.35);
  s.bezierCurveTo(0.25, 0.62, 0.6, 0.5, 0.6, 0.2);
  s.bezierCurveTo(0.6, -0.1, 0.15, -0.35, 0, -0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 4, curveSegments: 10 });
  g.translate(0, 0, -0.1);
  g.computeVertexNormals();
  return (heartGeo = shared(g));
}

let bowlM: THREE.MeshStandardMaterial | null = null;
/** 그릇 안쪽도 보이게 양면 — 공유 toyMat 캐시를 건드리지 않게 따로 만든다 */
function bowlMat() {
  if (bowlM) return bowlM;
  const m = toyMat('#ffd0de', { rough: 0.5 }).clone();
  m.side = THREE.DoubleSide;
  return (bowlM = shared(m));
}

export interface SaurDeps {
  game: Game;
  O: THREE.Vector3;
  day(): number;
  get(): SaurState | undefined;
  set(s: SaurState): void;
  addActor(a: Actor): void;
  toast(text: string): void;
}

/** 둥지 옆 먹이 그릇 + 하트 연출. 돌려주는 update 는 스포너 update 로 */
export function buildSaurFeeder(d: SaurDeps, root: THREE.Object3D) {
  const { game, O } = d;
  const lx = MOON_NEST.x - 11, lz = MOON_NEST.z + 9;
  const x = O.x + lx, z = O.z + lz;
  const y = game.groundAt(x, z);
  const g = new THREE.Group();
  g.name = 'planets-saur-feeder';
  g.position.set(x, y, z);
  // 둥근 그릇 + 별사과 3개 + 작은 하트 깃발
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.9, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bowlMat());
  bowl.scale.y = 0.55; bowl.position.y = 0.5;
  const rim = new THREE.Mesh(GEO.tor, toyMat('#ff9fb8'));
  rim.rotation.x = Math.PI / 2; rim.scale.setScalar(0.9); rim.position.y = 0.5;
  const apples: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = new THREE.Mesh(GEO.sph, toyMat('#ffc4c4', { glow: 0.25 }));
    a.scale.setScalar(0.22); a.position.set(Math.cos(i * 2.1) * 0.35, 0.62, Math.sin(i * 2.1) * 0.35);
    g.add(a); apples.push(a);
  }
  const pole = new THREE.Mesh(GEO.cyl, toyMat('#fff1cf'));
  pole.scale.set(0.05, 1.6, 0.05); pole.position.set(1.1, 0.8, 0);
  const flag = new THREE.Mesh(heartGeometry(), toyMat('#ff9fb8', { glow: 0.3 }));
  flag.scale.setScalar(0.42); flag.position.set(1.1, 1.75, 0);
  g.add(bowl, rim, pole, flag);
  root.add(g);
  // 하트 퐁퐁(최대 6개 재사용)
  const pops: Array<{ m: THREE.Mesh; t0: number }> = [];
  const heartMat = toyMat('#ff9fb8', { glow: 0.6 });
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(heartGeometry(), heartMat); m.visible = false; m.scale.setScalar(0.5); root.add(m); pops.push({ m, t0: -99 }); }
  const burst = (n: number) => {
    let k = 0;
    for (const p of pops) { if (k >= n) break; if (game.time - p.t0 < 1.8) continue; p.t0 = game.time + k * 0.12; k++; }
  };

  const hearts = () => d.get()?.hearts ?? 0;
  const pos = new THREE.Vector3(x, y + 0.6, z);
  d.addActor({
    id: 'planets:saur:feed', pos, r: 5, flat: true,
    label: () => {
      const h = hearts();
      const bar = `${'💗'.repeat(h)}${'🤍'.repeat(Math.max(0, STARSAURUS_MAX - h))}`;
      return game.state.has('m_starapple') ? `별공룡에게 별사과 주기 🍎 ${bar}` : `별사과가 있으면 별공룡과 친해져요 ${bar}`;
    },
    use: () => {
      if (!game.state.has('m_starapple')) { d.toast('🍎 별사과가 있어야 해요! (별똥별섬 별사과 나무)'); return; }
      game.player.act?.('pet', 1.2);
      const r = feedSaur(d.get(), d.day());
      d.set(r.st);
      if (r.gain > 0) {
        game.state.addItem('m_starapple', -1); // 하트를 받을 때만 별사과를 먹는다(배부르면 그대로 남겨 둠)
        burst(3 + r.st.hearts);
        game.state.emit({ type: 'befriend', id: 's_starsaurus', hearts: r.st.hearts, kind: 'dino' });
        if (r.max) {
          game.hud?.card?.({ title: '별공룡과 단짝!', body: '헬멧 속 눈이 반짝반짝… 별공룡이 꼬리를 흔들며 둥지 앞에서 기다려 줘요 🦕💗', icon: '🦕', color: '#8fd3f4' });
          d.toast('🦕 별공룡과 단짝이 되었어요! 💗💗💗💗💗');
        } else d.toast(`🦕 냠냠! 별공룡이 좋아해요 (하트 ${r.st.hearts}/${STARSAURUS_MAX})`);
      } else {
        burst(1);
        d.toast(r.max ? '🦕 킁킁… 우린 이미 단짝이야~ 별사과는 아껴 둬요' : '🦕 오늘은 배불러요 — 별사과는 내일 또 줘요');
      }
    },
  });
  const update = (t: number) => {
    apples.forEach((a, i) => { a.position.y = 0.62 + Math.sin(t * 2 + i) * 0.03; });
    flag.rotation.y = Math.sin(t * 1.5) * 0.4;
    for (const p of pops) {
      const k = (game.time - p.t0) / 1.6;
      const on = k >= 0 && k < 1;
      p.m.visible = on;
      if (!on) continue;
      const i = pops.indexOf(p);
      p.m.position.set(O.x + MOON_NEST.x + Math.sin(i * 2.3) * 2, y + 3 + k * 4, O.z + MOON_NEST.z + Math.cos(i * 2.3) * 2);
      p.m.scale.setScalar(0.5 * (1 - k * 0.4) * (k < 0.15 ? k / 0.15 : 1));
      p.m.rotation.y = t * 2;
    }
  };
  return { group: g, update, burst };
}
