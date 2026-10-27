// 바닷속 세계: 산호초·말미잘·해초 숲(흔들림)·조개·불가사리·성게·난파선·보물 항아리·해저 동굴·바닥 빛 무늬,
// 잠수 채집 생물 27종(카테고리 'sea'), 수면 위 부표·갈매기·돌고래·고래, 물속 화면 효과(틴트·거품·빛줄기).
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { SEA_SPECIES, RARITY_WEIGHT, type SeaSpecies } from './ocean/data';
import { seaModel, MODEL_KEYS } from './ocean/models';
import { cuteMat } from './ocean/kit';
import {
  oceanTime, swayMat, brainCoral, branchCoral, tubeCoral, fanCoral, tableCoral, anemone, kelp, seagrass, rock, pebble,
  decoShell, decoStar, decoUrchin, causticsMat,
} from './ocean/reef';
import { buildRiverMouth } from './ocean/mouth';
import { buoyGeo, gullBody, gullWing, dolphinGeo, whaleGeo, bubbleTexture, rayTexture, wreckGeo, jarGeo, coinPileGeo, caveGeo } from './ocean/surface';

export const order = 12;

const CORAL_COLORS = ['#ff7f9f', '#ffa66e', '#c08cff', '#ffcf4a', '#ff8fd8', '#ff6f6f', '#ffb3c9', '#ff9a5a', '#a4f07a'];
const ROCK_COLORS = ['#cdbfb0', '#b9b0c6', '#c6b49e', '#aeb8bc'];

interface Critter {
  mesh: THREE.Mesh;
  sp: SeaSpecies;
  key: string;
  base: THREE.Vector3;
  phase: number;
  r: number;
  yaw: number;
  s: number;
}

export default function build(ctx: Ctx) {
  const { island, game } = ctx;
  const q = new URLSearchParams(location.search);
  const root = new THREE.Group();
  root.name = 'ocean';
  root.userData.world = 'earth';

  // ───────── 재질(공유) ─────────
  const critterMat = cuteMat({ rough: 0.45, sheen: 0.7, clearcoat: 0.4, fill: 0.32 });
  const jellyMat = cuteMat({ rough: 0.3, sheen: 0.4, clearcoat: 0.6, fill: 0.4, transparent: true, opacity: 0.82 });
  const reefMat = cuteMat({ rough: 0.6, sheen: 0.6, clearcoat: 0.15, fill: 0.48 });
  const swayReef = swayMat(cuteMat({ rough: 0.6, sheen: 0.6, clearcoat: 0.1, fill: 0.25 }), 0.35, 1.5);
  const kelpMat = swayMat(cuteMat({ rough: 0.55, sheen: 0.3, clearcoat: 0.2, fill: 0.22, side: THREE.DoubleSide }), 0.05, 0.9);
  const grassMat = swayMat(cuteMat({ rough: 0.6, sheen: 0.3, clearcoat: 0.0, fill: 0.25, side: THREE.DoubleSide }), 0.35, 1.7);
  const woodMat = cuteMat({ rough: 0.75, sheen: 0.3, clearcoat: 0.0, fill: 0.18 });
  const sailMat = cuteMat({ rough: 0.9, sheen: 0.6, clearcoat: 0, fill: 0.25, side: THREE.DoubleSide });
  const glowMat = cuteMat({ rough: 0.25, sheen: 0.2, clearcoat: 0.8, fill: 0.55 });
  const caveMat = cuteMat({ rough: 0.8, sheen: 0.4, clearcoat: 0, fill: 0.28 });
  const rockMat = cuteMat({ rough: 0.85, sheen: 0.3, clearcoat: 0, fill: 0.16 });
  const caust = causticsMat();
  const isJelly = (k: string) => k === 'jelly' || k === 'moonjelly';
  const matFor = (k: string) => (isJelly(k) ? jellyMat : critterMat);

  // 공유 지오메트리
  const G = {
    brain: brainCoral(), branch: branchCoral(), tube: tubeCoral(), fan: fanCoral(), table: tableCoral(), anem: anemone(),
    kelpA: kelp(4.2), kelpB: kelp(6.5), grass: seagrass(), rock: rock(), pebble: pebble(), shell: decoShell(), star: decoStar(), urchin: decoUrchin(),
  };
  for (const g of Object.values(G)) g.userData.shared = true;

  // ───────── 강 하구 합류부(물색 블렌드 + 거품 띠) ─────────
  const mouth = buildRiverMouth(island, ctx.rng('ocean:mouth'));
  if (mouth) { root.add(mouth.group); mouth.update(0); }

  // ───────── 룩 테스트: 생물 줄 세우기(?oceanlineup=1) ─────────
  if (!game) {
    if (q.get('oceanlineup') !== '1') return mouth ? root : undefined;
    const keys = MODEL_KEYS;
    const cols = 7;
    keys.forEach((k, i) => {
      const m = new THREE.Mesh(seaModel(k), matFor(k));
      const sp = SEA_SPECIES.find((s) => s.model === k);
      const big = k === 'turtle' ? 0.45 : k === 'giantclam' ? 0.75 : 1;
      m.scale.setScalar(1.6 * big * (sp?.scale ?? 1));
      const row = Math.floor(i / cols), col = i % cols;
      m.position.set(-3.3 + col * 1.1, island.heightAt(0, 0) + 0.05, -1.2 + row * 1.0);
      m.rotation.y = 0.25;
      m.castShadow = true;
      root.add(m);
    });
    return root;
  }

  game.state.register(SEA_SPECIES);

  const VB = island.ISLAND_BOUNDS;
  const seaAt = (x: number, z: number) => {
    if (x > VB.minX - 4 && x < VB.maxX + 4 && z > VB.minZ - 4 && z < VB.maxZ + 4) return Number.isFinite(island.waterLevelAt(x, z)) && island.surfaceAt(x, z).kind !== 'river';
    return island.worldSample(x, z).coast < 0;
  };

  // 산호초 구역(넓은 띠) — 깊이와 노이즈로
  const reefiness = (x: number, z: number) =>
    0.5 + 0.3 * Math.sin(x * 0.021 + Math.sin(z * 0.013) * 2.0) * Math.cos(z * 0.017 - 1.3) + 0.2 * Math.sin((x + z) * 0.047);

  // ───────── 산호초 청크 ─────────
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const tmpCol = new THREE.Color();

  game.chunks.add({
    key: 'ocean-reef', size: 40, radius: 92, detail: true,
    build: ({ cx, cz, x0, z0, size }) => {
      // 바다가 아닌 청크는 건너뛴다
      let wet = 0;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const x = x0 + (i + 0.5) * size / 5, z = z0 + (j + 0.5) * size / 5;
        if (seaAt(x, z) && island.heightAt(x, z) < -0.6) wet++;
      }
      if (wet === 0) return null;
      const rnd = ctx.rng(`ocean-reef:${cx},${cz}`);
      const lists: Record<string, Array<{ m: THREE.Matrix4; c: THREE.Color }>> = {};
      const put = (kind: string, x: number, y: number, z: number, s: number, ry: number, col: string, tilt = 0.12) => {
        tmpE.set((rnd() - 0.5) * tilt, ry, (rnd() - 0.5) * tilt);
        tmpQ.setFromEuler(tmpE);
        tmpS.set(s, s * (0.85 + rnd() * 0.3), s);
        tmpP.set(x, y, z);
        (lists[kind] ??= []).push({ m: new THREE.Matrix4().compose(tmpP, tmpQ, tmpS), c: tmpCol.set(col).clone() });
      };
      const tries = 24 + wet * 8;
      for (let i = 0; i < tries; i++) {
        const x = x0 + rnd() * size, z = z0 + rnd() * size;
        if (!seaAt(x, z)) continue;
        const h = island.heightAt(x, z);
        const depth = -h;
        if (depth < 0.6) continue;
        const rf = reefiness(x, z) + (rnd() - 0.5) * 0.3;
        const pick = rnd();
        const pc = CORAL_COLORS[Math.floor(rnd() * CORAL_COLORS.length)];
        const ry = rnd() * Math.PI * 2;
        const y = h - 0.06;
        if (depth < 1.6) {
          // 얕은 물: 해초 잔디·조개·불가사리
          if (pick < 0.5) put('grass', x, y, z, 0.8 + rnd() * 0.6, ry, rnd() < 0.5 ? '#ffffff' : '#e4ffd0');
          else if (pick < 0.7) put('shell', x, y + 0.04, z, 0.9 + rnd() * 0.8, ry, ['#ffd0dc', '#fff0d0', '#e0d4ff'][Math.floor(rnd() * 3)]);
          else if (pick < 0.85) put('star', x, y + 0.04, z, 1 + rnd() * 0.8, ry, ['#ff9f6a', '#ff7f9a', '#ffcf5a'][Math.floor(rnd() * 3)], 0.02);
          else put('pebble', x, y + 0.02, z, 0.7 + rnd() * 1.2, ry, ROCK_COLORS[Math.floor(rnd() * 4)]);
          continue;
        }
        if (rf > 0.48) {
          // 산호 정원
          if (pick < 0.2) put('brain', x, y, z, 1.0 + rnd() * 1.3, ry, pc);
          else if (pick < 0.37) put('branch', x, y, z, 1.3 + rnd() * 1.4, ry, pc);
          else if (pick < 0.5) put('tube', x, y, z, 1.1 + rnd() * 1.2, ry, pc);
          else if (pick < 0.54) put('fan', x, y, z, 0.8 + rnd() * 0.8, ry, pc);
          else if (pick < 0.6) put('brain', x, y, z, 0.8 + rnd() * 1.0, ry, pc);
          else if (pick < 0.66) put('table', x, y, z, 1.2 + rnd() * 1.5, ry, pc);
          else if (pick < 0.73) put('anem', x, y, z, 0.8 + rnd() * 0.7, ry, ['#ff9ad0', '#c4a8ff', '#ffcf7a', '#8ff0d8'][Math.floor(rnd() * 4)]);
          else if (pick < 0.82) put('rock', x, y, z, 1.0 + rnd() * 1.8, ry, ROCK_COLORS[Math.floor(rnd() * 4)], 0.4);
          else if (pick < 0.9) put('grass', x, y, z, 0.8 + rnd() * 0.7, ry, '#ffffff');
          else if (pick < 0.95) put('urchin', x, y + 0.02, z, 0.8 + rnd() * 0.6, ry, ['#9b7bf0', '#6a5ad8', '#ff8ac0'][Math.floor(rnd() * 3)]);
          else put('shell', x, y + 0.04, z, 1 + rnd(), ry, '#ffe0ea');
        } else if (rf < 0.38 && depth > 3.5) {
          // 해초 숲
          if (pick < 0.55) put(rnd() < 0.5 ? 'kelpA' : 'kelpB', x, y, z, 0.8 + rnd() * 0.5 * Math.min(1, depth / 8), ry, rnd() < 0.5 ? '#ffffff' : '#e0ffd8', 0.05);
          else if (pick < 0.75) put('grass', x, y, z, 1 + rnd() * 0.6, ry, '#ffffff');
          else if (pick < 0.88) put('rock', x, y, z, 0.8 + rnd() * 1.6, ry, ROCK_COLORS[Math.floor(rnd() * 4)], 0.4);
          else put('pebble', x, y + 0.02, z, 1 + rnd(), ry, ROCK_COLORS[Math.floor(rnd() * 4)]);
        } else {
          // 모래밭: 드문드문
          if (pick < 0.25) put('grass', x, y, z, 0.8 + rnd() * 0.5, ry, '#ffffff');
          else if (pick < 0.4) put('pebble', x, y + 0.02, z, 0.8 + rnd() * 1.2, ry, ROCK_COLORS[Math.floor(rnd() * 4)]);
          else if (pick < 0.5) put('shell', x, y + 0.04, z, 1 + rnd() * 0.8, ry, ['#ffd0dc', '#fff0d0', '#e0d4ff'][Math.floor(rnd() * 3)]);
          else if (pick < 0.58) put('star', x, y + 0.04, z, 1 + rnd() * 0.8, ry, ['#ff9f6a', '#ff7f9a', '#ffcf5a'][Math.floor(rnd() * 3)], 0.02);
          else if (pick < 0.7) put('brain', x, y, z, 0.7 + rnd() * 0.8, ry, pc);
          else if (pick < 0.76) put('branch', x, y, z, 0.9 + rnd() * 0.9, ry, pc);
          else if (pick < 0.8) put('fan', x, y, z, 0.9 + rnd() * 0.9, ry, pc);
          else if (pick < 0.85) put('rock', x, y, z, 0.8 + rnd() * 1.4, ry, ROCK_COLORS[Math.floor(rnd() * 4)], 0.4);
          else if (pick < 0.9) put('urchin', x, y + 0.02, z, 0.8 + rnd() * 0.6, ry, '#8a6ae0');
        }
      }
      const grp = new THREE.Group();
      for (const [kind, arr] of Object.entries(lists)) {
        const geo = G[kind as keyof typeof G];
        const mat = kind === 'anem' ? swayReef : kind.startsWith('kelp') ? kelpMat : kind === 'grass' ? grassMat : kind === 'rock' || kind === 'pebble' ? rockMat : reefMat;
        const im = new THREE.InstancedMesh(geo, mat, arr.length);
        arr.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = kind === 'rock';
        im.receiveShadow = true;
        grp.add(im);
      }
      // 바닥 빛 무늬
      const res = 1, n = Math.round(size / res);
      const pg = new THREE.PlaneGeometry(size, size, n, n).rotateX(-Math.PI / 2);
      const pp = pg.attributes.position;
      let any = false;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i) + x0 + size / 2, z = pp.getZ(i) + z0 + size / 2;
        const h = island.heightAt(x, z);
        if (h < -0.4) any = true;
        pp.setY(i, Math.min(h, 0.3) + 0.06);
      }
      if (any) {
        pg.computeVertexNormals();
        const cm = new THREE.Mesh(pg, caust);
        cm.position.set(x0 + size / 2, 0, z0 + size / 2);
        cm.receiveShadow = true;
        grp.add(cm);
      } else pg.dispose();
      return grp;
    },
    dispose: (o) => {
      o.traverse((m) => {
        const im = m as THREE.InstancedMesh;
        if (im.isInstancedMesh) im.dispose();
        else if ((m as THREE.Mesh).isMesh && !(m as THREE.Mesh).geometry.userData.shared) (m as THREE.Mesh).geometry.dispose();
      });
    },
  });

  // ───────── 생물 청크 ─────────
  const critters = new Set<Critter>();
  const caught = new Set<string>();
  const pickSpecies = (rnd: () => number, depth: number): SeaSpecies | null => {
    const pool = SEA_SPECIES.filter((s) => depth >= s.minDepth);
    if (!pool.length) return null;
    let tot = 0;
    for (const s of pool) tot += RARITY_WEIGHT[s.rarity];
    let r = rnd() * tot;
    for (const s of pool) { r -= RARITY_WEIGHT[s.rarity]; if (r <= 0) return s; }
    return pool[pool.length - 1];
  };

  game.chunks.add({
    key: 'ocean-life', size: 40, radius: 66, detail: true,
    build: ({ cx, cz, x0, z0, size }) => {
      const rnd = ctx.rng(`ocean-life:${cx},${cz}`);
      const grp = new THREE.Group();
      const mine: Critter[] = [];
      const want = 8 + Math.floor(rnd() * 5);
      for (let i = 0; i < want * 3 && mine.length < want; i++) {
        const x = x0 + rnd() * size, z = z0 + rnd() * size;
        if (!seaAt(x, z)) continue;
        const h = island.heightAt(x, z);
        const depth = -h;
        if (depth < 0.6) continue;
        const sp = pickSpecies(rnd, depth);
        if (!sp) continue;
        const key = `${cx},${cz}:${i}`;
        if (caught.has(key)) continue;
        const m = new THREE.Mesh(seaModel(sp.model), matFor(sp.model));
        const s = sp.scale * 2.0 * (0.85 + rnd() * 0.35);
        m.scale.setScalar(s);
        let y = h - 0.02;
        if (sp.habitat === 'swim') y = h + 0.5 + rnd() * Math.max(0.3, Math.min(3, depth - 1.2));
        if (sp.habitat === 'anemone') {
          // 말미잘 집과 함께
          const an = new THREE.Mesh(G.anem, swayReef);
          an.position.set(x, h - 0.05, z);
          an.scale.setScalar(1.1);
          grp.add(an);
          y = h + 0.35;
        }
        if (sp.id === 'sea-turtle') y = h + 1.2 + rnd() * Math.max(0.2, Math.min(2, depth - 3));
        m.position.set(x, Math.min(y, -0.5), z);
        m.rotation.y = rnd() * Math.PI * 2;
        m.castShadow = true;
        grp.add(m);
        const c: Critter = { mesh: m, sp, key, base: m.position.clone(), phase: rnd() * 100, r: sp.habitat === 'swim' ? (sp.id === 'sea-turtle' ? 5 : 0.6 + rnd() * 1.2) : 0, yaw: m.rotation.y, s };
        mine.push(c);
      }
      if (!mine.length) return null;
      for (const c of mine) critters.add(c);
      grp.userData.critters = mine;
      return grp;
    },
    dispose: (o) => { for (const c of (o.userData.critters as Critter[]) ?? []) critters.delete(c); },
  });

  // ───────── 고정 장소: 난파선·보물 항아리·해저 동굴 ─────────
  type Site = { kind: 'wreck' | 'cave'; x: number; z: number; y: number; rot: number; id: string };
  const sites: Site[] = [];
  const march = (x: number, z: number, dx: number, dz: number, depth: number, maxD = 700): { x: number; z: number } | null => {
    const l = Math.hypot(dx, dz);
    dx /= l; dz /= l;
    for (let d = 0; d < maxD; d += 4) {
      const px = x + dx * d, pz = z + dz * d;
      if (seaAt(px, pz) && island.heightAt(px, pz) < -depth) return { x: px, z: pz };
    }
    return null;
  };
  {
    const w0 = march(14, 30, 0.45, 1, 7.5);
    if (w0) sites.push({ kind: 'wreck', ...w0, y: island.heightAt(w0.x, w0.z), rot: 0.6, id: 'home' });
    const c0 = march(-20, 26, -0.7, 1, 9);
    if (c0) sites.push({ kind: 'cave', ...c0, y: island.heightAt(c0.x, c0.z), rot: -0.4, id: 'home' });
    const srnd = ctx.rng('ocean-sites');
    for (const d of island.ISLANDS) {
      if (d.theme === 'islet' || d.id === 'home') continue;
      const a = srnd() * Math.PI * 2;
      const w = march(d.x + Math.cos(a) * d.r * 0.8, d.z + Math.sin(a) * d.r * 0.8, Math.cos(a), Math.sin(a), 9);
      if (w) sites.push({ kind: 'wreck', ...w, y: island.heightAt(w.x, w.z), rot: srnd() * 6, id: d.id });
      const b = a + 2 + srnd() * 2;
      const c = march(d.x + Math.cos(b) * d.r * 0.8, d.z + Math.sin(b) * d.r * 0.8, Math.cos(b), Math.sin(b), 10);
      if (c) sites.push({ kind: 'cave', ...c, y: island.heightAt(c.x, c.z), rot: b + Math.PI, id: d.id });
    }
  }
  const W = wreckGeo();
  for (const g of [W.hull, W.trim, W.sail]) g.userData.shared = true;
  const JAR = jarGeo(), COINS = coinPileGeo(), CAVE = caveGeo();
  const jars: Array<{ id: string; pos: THREE.Vector3; mesh: THREE.Object3D | null; spark: THREE.Object3D | null }> = [];
  for (const s of sites) {
    if (s.kind !== 'wreck') continue;
    for (let i = 0; i < 3; i++) {
      const a = s.rot + i * 1.9 + 0.8, r = 3.2 + i * 1.1;
      const x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
      jars.push({ id: `${s.id}-${i}`, pos: new THREE.Vector3(x, island.heightAt(x, z), z), mesh: null, spark: null });
    }
  }
  const jarOpened = (id: string) => !!game.state.flags[`ocean.jar.${id}`];
  const sparkMat = new THREE.SpriteMaterial({ map: bubbleTexture(), color: '#fff2a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  game.chunks.add({
    key: 'ocean-sites', size: 128, radius: 300,
    build: ({ x0, z0, size }) => {
      const inside = sites.filter((s) => s.x >= x0 && s.x < x0 + size && s.z >= z0 && s.z < z0 + size);
      if (!inside.length) return null;
      const grp = new THREE.Group();
      for (const s of inside) {
        const g = new THREE.Group();
        g.position.set(s.x, s.y - 0.5, s.z);
        g.rotation.set(0.12, s.rot, s.kind === 'wreck' ? 0.32 : 0);
        if (s.kind === 'wreck') {
          for (const [geo, mat] of [[W.hull, woodMat], [W.trim, woodMat], [W.sail, sailMat]] as const) {
            const m = new THREE.Mesh(geo, mat);
            m.castShadow = true; m.receiveShadow = true;
            g.add(m);
          }
          // 해초가 감긴 난파선
          const kelpIm = new THREE.InstancedMesh(G.kelpA, kelpMat, 8);
          for (let i = 0; i < 8; i++) {
            tmpM.compose(tmpP.set(Math.sin(i * 2.1) * 2.4, 0.2, -5 + i * 1.4), tmpQ.setFromEuler(tmpE.set(0, i, 0)), tmpS.set(0.8, 0.7 + (i % 3) * 0.2, 0.8));
            kelpIm.setMatrixAt(i, tmpM);
            kelpIm.setColorAt(i, tmpCol.set('#ffffff'));
          }
          g.add(kelpIm);
        } else {
          const m = new THREE.Mesh(CAVE, caveMat);
          m.castShadow = true; m.receiveShadow = true;
          g.rotation.set(0, s.rot, 0);
          g.position.y = s.y - 0.3;
          g.add(m);
        }
        grp.add(g);
      }
      for (const j of jars) {
        if (j.pos.x < x0 || j.pos.x >= x0 + size || j.pos.z < z0 || j.pos.z >= z0 + size) continue;
        const jg = new THREE.Group();
        jg.position.copy(j.pos).add(new THREE.Vector3(0, -0.05, 0));
        jg.rotation.z = 0.15;
        const jm = new THREE.Mesh(JAR, woodMat);
        jm.scale.setScalar(1.3);
        jm.castShadow = true;
        jg.add(jm);
        const coins = new THREE.Mesh(COINS, glowMat);
        coins.position.set(0.45, 0, 0.2);
        coins.scale.setScalar(1.6);
        jg.add(coins);
        const spark = new THREE.Sprite(sparkMat);
        spark.position.set(0, 1.5, 0);
        spark.scale.setScalar(0.5);
        jg.add(spark);
        j.mesh = jg; j.spark = spark;
        spark.visible = !jarOpened(j.id);
        grp.add(jg);
      }
      return grp;
    },
  });
  for (const j of jars) {
    game.addInteractable({
      id: `ocean-jar-${j.id}`,
      position: () => j.pos,
      radius: 2.4,
      label: '보물 항아리 열기',
      enabled: () => !jarOpened(j.id) && (game.player.mode === 'dive' || game.player.mode === 'swim'),
      onUse: () => {
        const r = ctx.rng(`ocean-jar:${j.id}`)();
        const n = Math.round(300 + r * r * 2700);
        game.state.flags[`ocean.jar.${j.id}`] = true;
        game.state.addCoins(n, '보물 항아리');
        game.ui.toast(`보물 항아리에서 코인 ${n.toLocaleString()}개가 쏟아졌다!`);
        if (j.spark) j.spark.visible = false;
      },
    });
  }

  // ───────── 잡기(잠수 중 E) ─────────
  const tv = new THREE.Vector3();
  game.addProvider('ocean-catch', (p) => {
    if (p.mode !== 'dive' && p.mode !== 'swim') return null;
    let best: Critter | null = null, bd = Infinity;
    for (const c of critters) {
      if (!c.mesh.visible) continue;
      c.mesh.getWorldPosition(tv);
      const dh = Math.hypot(tv.x - p.pos.x, tv.z - p.pos.z), dy = Math.abs(tv.y - (p.pos.y + 0.4));
      const reach = c.sp.id === 'sea-turtle' ? 3.2 : 2.0;
      if (dh > reach || dy > 2.4) continue;
      if (dh < bd) { bd = dh; best = c; }
    }
    if (!best) return null;
    const c = best;
    return {
      label: c.sp.meetOnly ? `${c.sp.name}에게 인사하기` : `${c.sp.name} 잡기`,
      dist: bd,
      use: () => {
        const rnd = ctx.rng(`ocean-catch:${c.key}:${game.time.toFixed(2)}`);
        const sz = c.sp.size[0] + (c.sp.size[1] - c.sp.size[0]) * Math.pow(rnd(), 1.6);
        let model: THREE.Object3D | undefined;
        if (!c.sp.meetOnly) {
          caught.add(c.key);
          c.mesh.visible = false;
          const g = seaModel(c.sp.model);
          g.computeBoundingSphere();
          const m = new THREE.Mesh(g, matFor(c.sp.model));
          const fit = 0.32 / Math.max(0.05, g.boundingSphere!.radius);
          m.scale.setScalar(Math.min(2.2, fit));
          m.position.y = 0.1;
          model = m;
        }
        game.ui.showCatch({ species: c.sp, sizeText: `${sz.toFixed(1)}cm`, model, line: c.sp.line });
      },
    };
  });

  // ───────── 수면 위: 부표 ─────────
  const BUOY = buoyGeo();
  const buoyMat = cuteMat({ rough: 0.45, sheen: 0.4, clearcoat: 0.5, fill: 0.2 });
  const buoys = new Set<THREE.Object3D>();
  game.chunks.add({
    key: 'ocean-buoys', size: 110, radius: 600,
    build: ({ cx, cz, x0, z0, size }) => {
      const rnd = ctx.rng(`ocean-buoys:${cx},${cz}`);
      if (rnd() > 0.85) return null;
      const x = x0 + size * (0.2 + rnd() * 0.6), z = z0 + size * (0.2 + rnd() * 0.6);
      if (!seaAt(x, z) || island.heightAt(x, z) > -1.5) return null;
      const m = new THREE.Mesh(BUOY, buoyMat);
      m.position.set(x, -0.25, z);
      m.scale.setScalar(1.1);
      m.rotation.y = rnd() * 6;
      m.castShadow = true;
      m.userData.phase = rnd() * 10;
      buoys.add(m);
      return m;
    },
    dispose: (o) => { buoys.delete(o); },
  });

  // ───────── 갈매기 ─────────
  const gullG = gullBody(), wingG = gullWing();
  const gulls: Array<{ o: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; r: number; h: number; ph: number; sp: number }> = [];
  const gullRoot = new THREE.Group();
  root.add(gullRoot);
  for (let i = 0; i < 7; i++) {
    const o = new THREE.Group();
    o.add(new THREE.Mesh(gullG, critterMat));
    const wl = new THREE.Mesh(wingG, critterMat), wr = new THREE.Mesh(wingG, critterMat);
    wr.scale.x = -1;
    wl.position.set(0.08, 0.06, 0); wr.position.set(-0.08, 0.06, 0);
    o.add(wl, wr);
    o.scale.setScalar(2.4);
    gullRoot.add(o);
    gulls.push({ o, wl, wr, r: 7 + i * 2.4, h: 7 + (i % 3) * 3, ph: i * 1.7, sp: 0.22 + (i % 4) * 0.05 });
  }
  const gullCenter = new THREE.Vector3();

  // ───────── 돌고래 떼 ─────────
  const DOL = dolphinGeo();
  const dolphins: THREE.Mesh[] = [];
  const dolRoot = new THREE.Group();
  root.add(dolRoot);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(DOL, critterMat);
    m.castShadow = true;
    m.scale.setScalar(i === 4 ? 0.9 : 1.4);
    dolRoot.add(m);
    dolphins.push(m);
  }
  const splashMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false });
  const splashG = new THREE.TorusGeometry(1, 0.08, 6, 28).rotateX(Math.PI / 2);
  const splashes = dolphins.map(() => { const s = new THREE.Mesh(splashG, splashMat.clone()); dolRoot.add(s); return s; });
  const pod = { x: 0, z: 0, yaw: 0, active: 0 };

  // ───────── 고래 ─────────
  const whale = new THREE.Group();
  const whaleM = new THREE.Mesh(whaleGeo(), critterMat);
  whale.add(whaleM);
  root.add(whale);
  const spoutTex = bubbleTexture();
  const spoutMat = new THREE.SpriteMaterial({ map: spoutTex, color: '#ffffff', transparent: true, depthWrite: false, opacity: 0.9 });
  const spout: THREE.Sprite[] = [];
  for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(spoutMat); whale.add(s); spout.push(s); }
  const whaleState = { x: 0, z: 0, yaw: 0, on: 0 };

  // ───────── 물속 효과: 틴트·거품·부유물·빛줄기 ─────────
  const tint = document.createElement('div');
  tint.style.cssText = `position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .35s;
    background: radial-gradient(ellipse 85% 75% at 50% 45%, rgba(120,230,255,0) 55%, rgba(30,110,200,0.22) 85%, rgba(20,70,160,0.42) 100%);
    mix-blend-mode: normal;`;
  const tintTop = document.createElement('div');
  tintTop.style.cssText = `position:absolute;left:0;right:0;top:0;height:22%;background:linear-gradient(rgba(210,255,255,0.12),rgba(210,255,255,0));`;
  tint.appendChild(tintTop);
  // 게임 UI(#ui) 아래, 캔버스 위
  const uiEl = document.getElementById('ui');
  if (uiEl) document.body.insertBefore(tint, uiEl); else document.body.appendChild(tint);

  const NB = 260;
  const bubbleGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(NB * 3), bSeed = new Float32Array(NB * 3);
  const brnd = ctx.rng('ocean-bubbles');
  for (let i = 0; i < NB; i++) { bSeed[i * 3] = brnd(); bSeed[i * 3 + 1] = brnd(); bSeed[i * 3 + 2] = brnd(); }
  bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bubbleGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const bubbleMat = new THREE.PointsMaterial({ map: bubbleTexture(), size: 0.22, sizeAttenuation: true, transparent: true, depthWrite: false, color: '#ffffff' });
  const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
  bubbles.frustumCulled = false;
  root.add(bubbles);

  const NS = 500;
  const snowGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(NS * 3), sSeed = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) { sSeed[i * 3] = brnd(); sSeed[i * 3 + 1] = brnd(); sSeed[i * 3 + 2] = brnd(); }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  snowGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: bubbleTexture(), size: 0.07, transparent: true, depthWrite: false, color: '#e8fbff', opacity: 0.8 }));
  snow.frustumCulled = false;
  root.add(snow);

  const rayMat = new THREE.MeshBasicMaterial({ map: rayTexture(), color: '#bff4ff', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const rays: THREE.Mesh[] = [];
  const rayG = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(rayG, rayMat);
    m.frustumCulled = false;
    root.add(m);
    rays.push(m);
  }

  // 잡을 수 있는 생물 위 반짝이(점 하나 = 드로우콜 하나)
  const NSP = 64;
  const spGeo = new THREE.BufferGeometry();
  const spPos = new Float32Array(NSP * 3);
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const sparkTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,250,200,0.8)');
    gr.addColorStop(1, 'rgba(255,240,180,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.moveTo(32, 2); g.lineTo(36, 28); g.lineTo(62, 32); g.lineTo(36, 36); g.lineTo(32, 62); g.lineTo(28, 36); g.lineTo(2, 32); g.lineTo(28, 28); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const sparkPts = new THREE.Points(spGeo, new THREE.PointsMaterial({ map: sparkTex, size: 0.45, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#fff6c0' }));
  sparkPts.frustumCulled = false;
  root.add(sparkPts);

  // ───────── 매 프레임 ─────────
  const cam = ctx.camera;
  const wp = new THREE.Vector3();
  ctx.onUpdate((t, dt) => {
    mouth?.update(t);
    oceanTime.value = t;
    if (game.world !== 'earth') { root.visible = false; tint.style.opacity = '0'; return; }
    root.visible = true;
    const p = game.player.pos;

    // 생물 움직임
    for (const c of critters) {
      const m = c.mesh;
      if (!m.visible) continue;
      const ph = c.phase + t;
      if (c.sp.habitat === 'swim') {
        const sp = c.sp.id === 'sea-turtle' ? 0.12 : isJelly(c.sp.model) ? 0.15 : 0.35;
        const a = ph * sp;
        m.position.set(c.base.x + Math.cos(a) * c.r, c.base.y + Math.sin(ph * 1.3) * 0.15, c.base.z + Math.sin(a) * c.r);
        m.rotation.y = -a;
        if (isJelly(c.sp.model)) {
          const pulse = Math.sin(ph * 2.4);
          m.scale.set(c.s * (1 + pulse * 0.08), c.s * (1 - pulse * 0.08), c.s * (1 + pulse * 0.08));
          m.position.y = c.base.y + Math.sin(ph * 0.8) * 0.4;
        } else if (c.sp.model === 'ray' || c.sp.id === 'sea-turtle') {
          m.rotation.z = Math.sin(ph * 1.6) * 0.12;
        }
      } else {
        // 바닥: 숨쉬듯 말랑 + 두리번
        const b = Math.sin(ph * 2.2) * 0.04;
        m.scale.set(c.s * (1 - b * 0.5), c.s * (1 + b), c.s * (1 - b * 0.5));
        m.rotation.y = c.yaw + Math.sin(ph * 0.7) * 0.35;
        if (c.sp.model === 'crab' || c.sp.model === 'hermit') m.position.x = c.base.x + Math.sin(ph * 0.9) * 0.4;
        if (c.sp.habitat === 'anemone') m.position.set(c.base.x + Math.cos(ph) * 0.35, c.base.y + Math.sin(ph * 2) * 0.06, c.base.z + Math.sin(ph) * 0.35);
      }
    }

    // 반짝이: 가까운 생물 위에서 깜빡
    {
      let n = 0;
      for (const c of critters) {
        if (n >= NSP) break;
        if (!c.mesh.visible) continue;
        const d = Math.hypot(c.mesh.position.x - p.x, c.mesh.position.z - p.z);
        if (d > 22) continue;
        const tw = Math.sin(t * 3 + c.phase * 7);
        if (tw < -0.2) continue;
        spPos[n * 3] = c.mesh.position.x + Math.sin(c.phase) * 0.15;
        spPos[n * 3 + 1] = c.mesh.position.y + 0.55 * c.s + 0.1 * tw;
        spPos[n * 3 + 2] = c.mesh.position.z;
        n++;
      }
      spGeo.setDrawRange(0, n);
      spGeo.attributes.position.needsUpdate = true;
      sparkPts.visible = n > 0 && (game.player.mode === 'dive' || game.player.mode === 'swim');
    }

    // 부표 출렁
    for (const b of buoys) {
      const ph = (b.userData.phase as number) + t;
      b.position.y = -0.3 + Math.sin(ph * 1.3) * 0.12;
      b.rotation.x = Math.sin(ph * 1.1) * 0.08;
      b.rotation.z = Math.cos(ph * 0.9) * 0.08;
    }

    // 바다 근처인가(수면 위 생기는 물가·바다에서만)
    const nearSea = seaAt(p.x, p.z) || seaAt(p.x + 25, p.z) || seaAt(p.x - 25, p.z) || seaAt(p.x, p.z + 25) || seaAt(p.x, p.z - 25);
    const onSea = seaAt(p.x, p.z) && island.heightAt(p.x, p.z) < -2;

    // 갈매기: 플레이어 위를 크게 돈다
    gullRoot.visible = nearSea;
    if (nearSea) {
      const gx = p.x - Math.sin(game.cam.yaw) * 12, gz = p.z - Math.cos(game.cam.yaw) * 12;
      if (dt === 0 || gullCenter.lengthSq() === 0) gullCenter.set(gx, 0, gz);
      else gullCenter.lerp(tv.set(gx, 0, gz), Math.min(1, dt * 0.4));
      for (const g of gulls) {
        const a = g.ph + t * g.sp;
        g.o.position.set(gullCenter.x + Math.cos(a) * g.r, g.h + Math.sin(t * 0.7 + g.ph) * 1.5, gullCenter.z + Math.sin(a) * g.r);
        g.o.rotation.set(0, -a + Math.PI, 0.35);
        const f = Math.sin(t * 7 + g.ph * 3) * 0.55;
        g.wl.rotation.z = f; g.wr.rotation.z = -f;
      }
    }

    // 돌고래: 바다 위에 있을 때 옆에서 뛰어오른다
    pod.active += ((onSea && game.player.mode !== 'dive' ? 1 : 0) - pod.active) * Math.min(1, dt * 0.5 + (dt === 0 ? 1 : 0));
    dolRoot.visible = pod.active > 0.05;
    if (dolRoot.visible) {
      const yaw = game.player.mounted ? game.player.yaw : game.cam.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const wantX = p.x + fx * 14 - fz * 7, wantZ = p.z + fz * 14 + fx * 7;
      if (dt === 0 || pod.x === 0) { pod.x = wantX; pod.z = wantZ; }
      else { pod.x += (wantX - pod.x) * Math.min(1, dt * 0.6); pod.z += (wantZ - pod.z) * Math.min(1, dt * 0.6); }
      dolphins.forEach((d, i) => {
        const cyc = 3.2, tt = (t + i * 0.55) % cyc, jump = 1.25;
        const lx = (i - 2) * 2.2 + Math.sin(i * 1.7) * 1.2, lz = Math.cos(i * 2.1) * 2.5;
        const ox = pod.x + fz * lx + fx * lz, oz = pod.z - fx * lx + fz * lz;
        let y = -1.4, pitch = 0;
        if (tt < jump) {
          const u = tt / jump;
          y = -0.6 + Math.sin(u * Math.PI) * (i === 4 ? 2.2 : 3.2);
          pitch = (0.5 - u) * 1.6;
        }
        const adv = (tt / cyc) * 6 - 3;
        d.position.set(ox + fx * adv, y, oz + fz * adv);
        d.rotation.set(-pitch, Math.atan2(fx, fz), 0, 'YXZ');
        const sp = splashes[i];
        const since = tt - jump;
        sp.visible = since > 0 && since < 0.8;
        if (sp.visible) {
          const k = since / 0.8;
          sp.position.set(ox + fx * (adv), 0.05, oz + fz * (adv));
          sp.scale.setScalar(0.4 + k * 1.6);
          (sp.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
        }
      });
    }

    // 고래: 먼바다에서 가끔 숨 쉬러 올라온다
    const coast = island.worldSample(p.x, p.z).coast;
    const far = coast < -120 && onSea;
    whaleState.on += ((far ? 1 : 0) - whaleState.on) * Math.min(1, dt * 0.3 + (dt === 0 ? 1 : 0));
    whale.visible = whaleState.on > 0.05;
    if (whale.visible) {
      const yaw = game.cam.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      if (whaleState.x === 0 || dt === 0) { whaleState.x = p.x + fx * 55 + fz * 22; whaleState.z = p.z + fz * 55 - fx * 22; whaleState.yaw = Math.atan2(-fz, fx); }
      whaleState.x += Math.sin(whaleState.yaw) * dt * 1.5;
      whaleState.z += Math.cos(whaleState.yaw) * dt * 1.5;
      if (Math.hypot(whaleState.x - p.x, whaleState.z - p.z) > 180) whaleState.x = 0;
      const cyc = 14, tt = t % cyc;
      const surf = Math.sin(Math.min(1, tt / 7) * Math.PI);
      whale.position.set(whaleState.x, -3.2 + surf * 2.4, whaleState.z);
      whale.rotation.set(0, whaleState.yaw, 0);
      whaleM.rotation.x = Math.sin(t * 0.4) * 0.05;
      // 분수: 수면에 올라왔을 때
      const st = tt - 2;
      spout.forEach((s, i) => {
        const k = ((i / spout.length) + st * 0.9) % 1;
        const on = st > 0 && st < 4.5;
        s.visible = on;
        if (!on) return;
        const ang = i * 2.39996, spread = k * 1.6;
        s.position.set(Math.cos(ang) * spread * 1.4, 2.4 + k * 7 - k * k * 3, 3.2 + Math.sin(ang) * spread * 1.4);
        s.scale.setScalar(1.0 + k * 2.2);
      });
      spoutMat.opacity = 0.85;
    }

    // 물속인가(카메라 기준)
    const wl = island.waterLevelAt(cam.position.x, cam.position.z);
    const under = Number.isFinite(wl) && cam.position.y < wl - 0.05;
    tint.style.opacity = under ? '1' : '0';
    bubbles.visible = under || game.player.mode === 'dive';
    snow.visible = under;
    for (const r of rays) r.visible = under;
    if (under || game.player.mode === 'dive') {
      // 거품: 플레이어 입가에서 보글보글 + 주변에서 떠오르는 것
      const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      for (let i = 0; i < NB; i++) {
        const a = bSeed[i * 3], b = bSeed[i * 3 + 1], c = bSeed[i * 3 + 2];
        if (i < 60) {
          const life = (t * 0.6 + a) % 1;
          bPos[i * 3] = p.x + Math.sin(t * 3 + i) * 0.12 * life + (b - 0.5) * 0.2;
          bPos[i * 3 + 1] = Math.min(-0.05, p.y + 1.1 + life * 4);
          bPos[i * 3 + 2] = p.z + Math.cos(t * 2.6 + i) * 0.12 * life + (c - 0.5) * 0.2;
        } else {
          const rise = (t * (0.4 + c * 0.5) + a * 30) % 30;
          bPos[i * 3] = cx + (a - 0.5) * 30 + Math.sin(t * 2 + i) * 0.1;
          bPos[i * 3 + 1] = Math.min(-0.05, cy - 12 + rise);
          bPos[i * 3 + 2] = cz + (b - 0.5) * 30;
        }
      }
      bubbleGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < NS; i++) {
        const a = sSeed[i * 3], b = sSeed[i * 3 + 1], c = sSeed[i * 3 + 2];
        const S = 24;
        const wrap = (v: number, c0: number) => c0 + ((((v - c0) % S) + S * 1.5) % S) - S / 2;
        sPos[i * 3] = wrap(a * 400 + Math.sin(t * 0.3 + i) * 0.5, cx);
        sPos[i * 3 + 1] = Math.min(-0.1, wrap(b * 400 - t * 0.08, cy));
        sPos[i * 3 + 2] = wrap(c * 400 + Math.cos(t * 0.25 + i) * 0.5, cz);
      }
      snowGeo.attributes.position.needsUpdate = true;
      // 빛줄기: 수면에서 아래로, 카메라를 향해
      const floor = island.heightAt(p.x, p.z);
      rays.forEach((r, i) => {
        const a = i * 2.39996, rr = 4 + (i % 4) * 4.5;
        const x = p.x + Math.cos(a + t * 0.02) * rr, z = p.z + Math.sin(a + t * 0.02) * rr;
        const len = Math.max(4, -floor + 1);
        r.position.set(x, 0, z);
        r.scale.set(1.2 + (i % 3) * 0.9, len, 1);
        r.rotation.set(0, Math.atan2(cam.position.x - x, cam.position.z - z), 0.18);
        (r.material as THREE.MeshBasicMaterial).opacity = 0.16;
      });
      rayMat.opacity = 0.12 + 0.05 * Math.sin(t * 0.8);
    }
    void wp;
  });

  game.onWorld((w) => { if (w !== 'earth') tint.style.opacity = '0'; });
  // 촬영·디버그: 장소 목록과 잠수 순간이동
  (window as unknown as { __ocean?: unknown }).__ocean = {
    sites, jars, critters, reefiness, seaAt, mats: { caust, reefMat },
    dive: (x: number, z: number, above = 1.2) => {
      const pl = game.player;
      const y = island.heightAt(x, z) + above;
      pl.teleport(x, z);
      pl.mode = 'dive';
      pl.body.setTranslation({ x, y: y + pl.footOff, z }, true);
      pl.body.setNextKinematicTranslation({ x, y: y + pl.footOff, z });
      pl.pos.set(x, y, z);
    },
  };
  return root;
}
