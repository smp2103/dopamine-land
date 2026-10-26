// 공룡 섬: 꼬마 공룡 무리(청크 스트리밍), 둥지와 알, 화석 발굴 지점, 하늘의 프테라노돈, 앞바다 플레시오사우루스,
// 먼바다 모사사우루스 그림자. 쓰다듬기(하트·우정)·먹이 주기·타기(트리케라톱스·브라키오·랩터)·도감 기록.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game, Mountable, Input } from '../core/game';
import { applyCurve } from '../core/curve';
import { DINOS, DINO_BY_ID, LAND_DINOS, FOSSILS, FRUITS, type DinoSpec } from './dinos/data';
import { makeDino, makePtera, faceMaterials, eggGeometry, nestGeometry, fossilModel, heartTexture, sparkleTexture, crackTexture, dinoSkin, flipperGeometry, type DinoRig, type PteraRig } from './dinos/build';

export const order = 30;

type AState = 'idle' | 'walk' | 'graze' | 'yawn' | 'flee' | 'approach' | 'follow' | 'ride' | 'look';

interface Agent {
  id: string;
  spec: DinoSpec;
  rig: DinoRig;
  x: number; z: number; y: number; yaw: number;
  home: { x: number; z: number };
  state: AState;
  timer: number;
  tx: number; tz: number;
  speed: number;
  phase: number;
  blink: number;
  friend: number;
  headPitch: number; headYaw: number; lean: number;
  hop: number;
  wag: number;
  adopted: boolean;
  chunk: string | null;
  lastPet: number;
}

interface Spot { key: string; x: number; z: number; y: number; obj: THREE.Object3D; sparkles: THREE.Sprite[] }
interface Nest { key: string; x: number; z: number; y: number; eggs: THREE.Mesh[]; pets: number; obj: THREE.Object3D }

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const { island } = ctx;
  const isl = island.islandById('dino')!;
  const group = new THREE.Group();
  group.name = 'dinos';
  group.userData.world = 'earth';

  game.state.register([...DINOS, ...FOSSILS]);

  const agents = new Set<Agent>();
  const spots = new Map<string, Spot>();
  const nests = new Map<string, Nest>();
  const dug = new Set<string>((game.state.flags['dinos.dug'] as string[] | undefined) ?? []);
  const [faceOpen, faceShut] = faceMaterials();

  // ── 공용 리소스 ──
  const heartMat = new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false });
  const sparkMat = new THREE.SpriteMaterial({ map: sparkleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const crackGeo = new THREE.PlaneGeometry(1.8, 1.8, 6, 6); crackGeo.rotateX(-Math.PI / 2); crackGeo.userData.shared = true;
  const crackMat = new THREE.MeshStandardMaterial({ map: crackTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, emissive: '#ffd27a', emissiveIntensity: 0.0 });
  const boneGeo = new THREE.CapsuleGeometry(0.06, 0.32, 6, 16); boneGeo.userData.shared = true;
  const boneEndGeo = new THREE.SphereGeometry(0.075, 18, 14); boneEndGeo.userData.shared = true;
  const boneMat = new THREE.MeshStandardMaterial({ color: '#fbf1dc', roughness: 0.6 });
  const nestMat = dinoSkin();
  const eggMat = dinoSkin();
  const shadowTex = blobTex();
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#2a3f38', alphaMap: shadowTex, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2); shadowGeo.userData.shared = true;

  // ── 땅 판정 ──
  const okGround = (x: number, z: number) => {
    const s = island.worldSample(x, z);
    if (s.island?.id !== 'dino' || s.coast < 6) return false;
    if (s.kind === 'lava' || s.h > 34) return false;
    return true;
  };
  const slopeOk = (x: number, z: number, y0: number, step: number) => Math.abs(island.heightAt(x, z) - y0) < Math.max(0.5, step * 1.3);

  // ── 개체 만들기 ──
  function spawn(spec: DinoSpec, x: number, z: number, yaw: number, key: string, parent: THREE.Object3D, chunk: string | null): Agent {
    const rig = makeDino(spec);
    const sh = new THREE.Mesh(shadowGeo, shadowMat);
    const r = rig.tpl.radius * spec.scale * 1.5;
    sh.scale.set(r * 1.1, 1, r * 1.6);
    sh.position.y = 0.04;
    sh.renderOrder = 2;
    rig.root.add(sh);
    const y = island.heightAt(x, z);
    rig.root.position.set(x, y, z);
    rig.root.rotation.y = yaw;
    parent.add(rig.root);
    const a: Agent = {
      id: key, spec, rig, x, z, y, yaw, home: { x, z }, state: 'idle', timer: 0, tx: x, tz: z, speed: 0,
      phase: 0, blink: hashf(key) * 5, friend: 0, headPitch: 0, headYaw: 0, lean: 0, hop: 0, wag: 0,
      adopted: false, chunk, lastPet: -99,
    };
    agents.add(a);
    return a;
  }

  // 도착 지점(스폰·부두)
  const WELCOME: Array<{ x: number; z: number }> = [];
  {
    const sp = island.islandSpawnPoints('dino', 1, 0.08)[0];
    if (sp) WELCOME.push(sp);
    const dock = island.PLACES.docks.dino;
    if (dock) {
      // 부두에서 섬 안쪽으로 조금 들어간 곳
      const dx = isl.x - dock.x, dz = isl.z - dock.z, l = Math.hypot(dx, dz);
      WELCOME.push({ x: dock.x + (dx / l) * 45, z: dock.z + (dz / l) * 45 });
    }
  }
  // 도착 지점 둘레 CLEAR m 는 비워 둔다(가까운 컷 구도·카메라 겹침 방지)
  const CLEAR = 8;
  const nearWelcome = (x: number, z: number, r: number) => WELCOME.some((w) => Math.hypot(x - w.x, z - w.z) < r);
  // ── 청크: 무리·둥지·화석 ──
  const CH = 96;
  game.chunks.add({
    key: 'dinos', size: CH, radius: 200,
    build: ({ cx, cz, x0, z0 }) => {
      const mx = x0 + CH / 2, mz = z0 + CH / 2;
      if (Math.hypot(mx - isl.x, mz - isl.z) > isl.r * 1.25) return null;
      const rnd = ctx.rng(`dinos:${cx},${cz}`);
      const g = new THREE.Group();
      g.userData.dinoChunk = `${cx},${cz}`;
      const ck = `${cx},${cz}`;
      // 무리 1~2
      const herds = rnd() < 0.55 ? 2 : 1;
      for (let h = 0; h < herds; h++) {
        let hx = 0, hz = 0, ok = false;
        for (let k = 0; k < 8 && !ok; k++) { hx = x0 + 8 + rnd() * (CH - 16); hz = z0 + 8 + rnd() * (CH - 16); ok = okGround(hx, hz); }
        if (!ok) continue;
        const spec = pickSpecies(rnd);
        const n = spec.herd[0] + Math.floor(rnd() * (spec.herd[1] - spec.herd[0] + 1));
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2, rr = 1.5 + rnd() * 4 * Math.sqrt(spec.scale);
          const x = hx + Math.cos(a) * rr, z = hz + Math.sin(a) * rr;
          if (!okGround(x, z) || nearWelcome(x, z, CLEAR + 2)) continue;
          const ag = spawn(spec, x, z, rnd() * Math.PI * 2, `d:${ck}:${h}:${i}`, g, ck);
          ag.home = { x: hx, z: hz };
          ag.timer = rnd() * 3;
          // 아기는 무리 옆에 가끔
        }
        // 둥지
        if (rnd() < 0.3) {
          const nx = hx + 5 + rnd() * 3, nz = hz - 3 + rnd() * 6;
          if (okGround(nx, nz)) makeNest(`n:${ck}:${h}`, nx, nz, 2 + Math.floor(rnd() * 2), g, rnd);
        }
      }
      // 환영 무리: 섬 도착 지점(스폰·부두) 근처엔 여러 종이 섞인 무리와 둥지를 꼭 둔다
      for (const w of WELCOME) {
        if (w.x < x0 || w.x >= x0 + CH || w.z < z0 || w.z >= z0 + CH) continue;
        const mix = ['dino-trike', 'dino-trike', 'dino-proto', 'dino-proto', 'dino-proto', 'dino-stego', 'dino-pachy', 'dino-brachio', 'dino-raptor', 'dino-parasaur'];
        mix.forEach((id, i) => {
          const sp = DINO_BY_ID.get(id)!;
          const a = (i / mix.length) * Math.PI * 2 + 0.4, rr = (id === 'dino-brachio' ? 24 : 12 + (i % 3) * 4);
          const x = w.x + Math.cos(a) * rr, z = w.z + Math.sin(a) * rr;
          if (!okGround(x, z)) return;
          const ag = spawn(sp, x, z, a + Math.PI, `w:${ck}:${i}`, g, ck);
          ag.home = { x: w.x + Math.cos(a) * rr, z: w.z + Math.sin(a) * rr };
          ag.timer = 1 + i * 0.7;
        });
        if (okGround(w.x - 8, w.z + 7)) makeNest(`n:w:${ck}`, w.x - 8, w.z + 7, 3, g, rnd);
        if (okGround(w.x + 6, w.z - 7) && !dug.has(`f:w:${ck}`)) makeSpot(`f:w:${ck}`, w.x + 6, w.z - 7, g, rnd);
      }
      // 화석 발굴 지점 0~2
      const nf = rnd() < 0.85 ? (rnd() < 0.4 ? 2 : 1) : 0;
      for (let i = 0; i < nf; i++) {
        const key = `f:${ck}:${i}`;
        const fx = x0 + 6 + rnd() * (CH - 12), fz = z0 + 6 + rnd() * (CH - 12);
        if (dug.has(key) || !okGround(fx, fz)) continue;
        makeSpot(key, fx, fz, g, rnd);
      }
      return g;
    },
    dispose: (o) => {
      const ck = o.userData.dinoChunk as string;
      for (const a of [...agents]) if (a.chunk === ck && !a.adopted) agents.delete(a);
      for (const [k, s] of spots) if (s.obj.parent === o || isChild(o, s.obj)) spots.delete(k);
      for (const [k, n] of nests) if (isChild(o, n.obj)) nests.delete(k);
    },
  });

  function pickSpecies(rnd: () => number): DinoSpec {
    const tot = LAND_DINOS.reduce((s, d) => s + d.weight, 0);
    let r = rnd() * tot;
    for (const d of LAND_DINOS) { r -= d.weight; if (r <= 0) return d; }
    return LAND_DINOS[0];
  }

  function makeNest(key: string, x: number, z: number, n: number, parent: THREE.Object3D, rnd: () => number) {
    const y = island.heightAt(x, z);
    const o = new THREE.Group();
    o.position.set(x, y, z);
    const nm = new THREE.Mesh(nestGeometry(), nestMat);
    nm.receiveShadow = true; nm.castShadow = true;
    o.add(nm);
    const eggs: THREE.Mesh[] = [];
    for (let i = 0; i < n; i++) {
      const e = new THREE.Mesh(eggGeometry(), eggMat);
      const a = (i / n) * Math.PI * 2 + rnd();
      e.position.set(Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3);
      e.rotation.set((rnd() - 0.5) * 0.3, rnd() * 6, (rnd() - 0.5) * 0.3);
      e.scale.setScalar(0.8 + rnd() * 0.2);
      e.castShadow = true;
      o.add(e);
      eggs.push(e);
    }
    parent.add(o);
    nests.set(key, { key, x, z, y, eggs, pets: 0, obj: o });
  }

  function makeSpot(key: string, x: number, z: number, parent: THREE.Object3D, rnd: () => number) {
    const y = island.heightAt(x, z);
    const o = new THREE.Group();
    o.position.set(x, y + 0.03, z);
    const crack = new THREE.Mesh(crackGeo, crackMat);
    crack.rotation.y = rnd() * 6;
    crack.renderOrder = 2;
    o.add(crack);
    // 삐죽 나온 뼈 끝
    const bone = new THREE.Group();
    const b1 = new THREE.Mesh(boneGeo, boneMat); b1.rotation.z = Math.PI / 2; bone.add(b1);
    for (const bx of [-0.2, 0.2]) for (const by of [-0.05, 0.05]) { const e = new THREE.Mesh(boneEndGeo, boneMat); e.position.set(bx, by, 0); bone.add(e); }
    bone.position.set(0.15, 0.02, 0.1);
    bone.rotation.set(0.3, rnd() * 6, 0.35);
    bone.scale.setScalar(0.9);
    o.add(bone);
    const sparkles: THREE.Sprite[] = [];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(sparkMat);
      s.position.set((rnd() - 0.5) * 1.0, 0.25 + rnd() * 0.4, (rnd() - 0.5) * 1.0);
      s.userData.ph = rnd() * 6;
      sparkles.push(s);
      o.add(s);
    }
    parent.add(o);
    spots.set(key, { key, x, z, y, obj: o, sparkles });
  }

  // ── 하트 ──
  const hearts: Array<{ s: THREE.Sprite; t0: number; base: THREE.Vector3; vx: number }> = [];
  function burstHearts(at: THREE.Vector3, n = 4) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(heartMat.clone());
      s.scale.setScalar(0.5);
      group.add(s);
      hearts.push({ s, t0: game!.time + i * 0.12, base: at.clone().add(new THREE.Vector3((i - n / 2) * 0.25, 0, 0)), vx: (i - n / 2) * 0.15 });
    }
  }

  // ── 상호작용 ──
  let hint: { agent?: Agent; spot?: Spot; nest?: Nest } = {};
  const fruitInBag = () => FRUITS.find((f) => game.state.has(f));
  const FRUIT_NAME: Record<string, string> = { apple: '사과', peach: '복숭아', orange: '오렌지', pear: '배', cherry: '체리', coconut: '코코넛', banana: '바나나' };

  game.addProvider('dinos', (p) => {
    hint = {};
    if (p.mounted) return null;
    let best: { d: number; label: string; use: () => void } | null = null;
    for (const a of agents) {
      if (a.state === 'ride') continue;
      const reach = a.rig.tpl.radius * a.spec.scale + 1.6;
      const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
      if (d > reach) continue;
      const dd = d - reach + 2;
      if (best && dd >= best.d) continue;
      const fruit = fruitInBag();
      const canRide = a.spec.mount && a.friend >= 2;
      const label = fruit ? `${a.spec.name}에게 먹이 주기(${FRUIT_NAME[fruit] ?? fruit})` : `${a.spec.name} 쓰다듬기${canRide ? '   F 타기' : ''}`;
      best = { d: dd, label, use: () => (fruit ? feed(a, fruit) : pet(a)) };
      hint = { agent: a };
    }
    for (const s of spots.values()) {
      const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
      if (d > 1.9 || (best && d >= best.d)) continue;
      best = { d, label: '반짝이는 금 파기', use: () => dig(s) };
      hint = { spot: s };
    }
    for (const n of nests.values()) {
      const d = Math.hypot(n.x - p.pos.x, n.z - p.pos.z);
      if (d > 2.3 || (best && d >= best.d) || !n.eggs.length) continue;
      best = { d, label: '공룡 알 쓰다듬기', use: () => petEgg(n) };
      hint = { nest: n };
    }
    return best ? { label: best.label, dist: best.d, use: best.use } : null;
  });

  function faceTo(a: Agent) {
    const p = game!.player;
    p.yaw = Math.atan2(-(a.x - p.pos.x), -(a.z - p.pos.z));
  }
  function setAction(name: string, sec: number) {
    const p = game!.player;
    p.action = name;
    const t = game!.time;
    actionUntil = t + sec;
  }
  let actionUntil = -1;

  function pet(a: Agent) {
    if (game!.time - a.lastPet < 0.6) return;
    a.lastPet = game!.time;
    a.friend += 1;
    a.hop = 1;
    a.wag = 3;
    a.state = 'look'; a.timer = 2.5;
    faceTo(a);
    setAction('pet', 0.9);
    burstHearts(headWorld(a), 3 + Math.min(3, a.friend));
    record(a.spec);
    const lines = ['꾸우~ 기분 좋아 보인다!', '꼬리를 살랑살랑 흔든다!', '눈을 꼭 감고 좋아한다!', '몸을 비비며 애교를 부린다!'];
    game!.ui.toast(`${a.spec.name}: ${lines[a.friend % lines.length]}${a.friend === 2 && a.spec.mount ? '  (F 로 타 볼 수 있다!)' : ''}`);
  }

  function feed(a: Agent, fruit: string) {
    game!.state.addItem(fruit, -1);
    a.friend += 3;
    a.hop = 1.4; a.wag = 5;
    a.state = 'follow'; a.timer = 25;
    faceTo(a);
    setAction('pet', 1.0);
    burstHearts(headWorld(a), 7);
    record(a.spec);
    game!.ui.toast(`${a.spec.name}이(가) ${FRUIT_NAME[fruit] ?? fruit}을(를) 냠냠! 졸졸 따라온다`);
  }

  function dig(s: Spot) {
    setAction('dig', 1.1);
    const p = game!.player;
    p.yaw = Math.atan2(-(s.x - p.pos.x), -(s.z - p.pos.z));
    const r = ctx.rng(`dig:${s.key}:${game!.state.dexCount('fossil').got}`)();
    const tot = FOSSILS.reduce((t, f) => t + f.weight, 0);
    let k = r * tot, pick = FOSSILS[0];
    for (const f of FOSSILS) { k -= f.weight; if (k <= 0) { pick = f; break; } }
    s.obj.removeFromParent();
    spots.delete(s.key);
    dug.add(s.key);
    game!.state.flags['dinos.dug'] = [...dug].slice(-400);
    const lines: Record<number, string> = { 1: '흙 냄새 나는 보물!', 2: '오, 꽤 괜찮은데?', 3: '박물관이 좋아하겠다!', 4: '대발견이다!!', 5: '전설의 화석!!!' };
    game!.ui.showCatch({ species: pick, model: fossilModel(pick.model, pick.tint), line: lines[pick.rarity] });
    burstHearts(new THREE.Vector3(s.x, s.y + 1.2, s.z), 0);
  }

  function petEgg(n: Nest) {
    setAction('pet', 0.8);
    n.pets += 1;
    const egg = DINO_BY_ID.get('dino-egg')!;
    record(egg);
    const e = n.eggs[n.eggs.length - 1];
    e.userData.wob = game!.time;
    const hatch = n.pets >= 3 || ctx.rng(`egg:${n.key}:${n.pets}`)() < 0.25;
    if (!hatch) { game!.ui.toast('톡톡… 알 속에서 대답했다!'); return; }
    // 부화!
    n.eggs.pop();
    e.removeFromParent();
    n.pets = 0;
    const baby = spawn(DINO_BY_ID.get('dino-baby')!, n.x + 0.6, n.z + 0.6, 0, `baby:${n.key}:${game!.time.toFixed(2)}`, group, null);
    applyCurve(baby.rig.root);
    baby.adopted = true;
    baby.friend = 5;
    baby.state = 'follow'; baby.timer = 1e9;
    baby.hop = 1.6;
    burstHearts(new THREE.Vector3(n.x, n.y + 1.2, n.z), 6);
    // 따라오는 아기는 4마리까지
    const babies = [...agents].filter((a) => a.spec.id === 'dino-baby' && a.adopted);
    if (babies.length > 4) { const old = babies[0]; old.rig.root.removeFromParent(); agents.delete(old); }
    const isNew = !game!.state.dex['dino-baby'];
    record(baby.spec);
    game!.ui.toast(isNew ? '알이 깨졌다! 아기 공룡이 태어났다! (도감 기록)' : '알이 깨졌다! 아기 공룡이 졸졸 따라온다!');
  }

  function headWorld(a: Agent) {
    const v = new THREE.Vector3();
    a.rig.head.getWorldPosition(v);
    v.y += a.rig.tpl.spec.head.r * a.spec.scale + 0.3;
    return v;
  }

  // ── 도감: 만나면 기록 ──
  function record(spec: { id: string; name: string; category: string; rarity: number }) {
    if (game!.state.dex[spec.id]) return;
    const sp = game!.state.species.get(spec.id);
    if (!sp) return;
    game!.state.collect({ species: sp });
    game!.state.addItem(spec.id, -1); // 도감만, 가방엔 안 넣는다
    game!.ui.toast(`공룡 도감에 「${spec.name}」 기록!`);
  }

  // ── 타기 ──
  let riding: Agent | null = null;
  const RIDE: Record<string, { walk: number; run: number; cam: number }> = {
    'dino-trike': { walk: 7, run: 12, cam: 1.35 }, 'dino-brachio': { walk: 6, run: 9.5, cam: 2.1 }, 'dino-raptor': { walk: 9, run: 16, cam: 1.15 },
  };
  function mount(a: Agent) {
    const cfg = RIDE[a.spec.id] ?? { walk: 6, run: 10, cam: 1.3 };
    // 청크가 사라져도 남게: 모듈 그룹으로 옮긴다
    if (!a.adopted) {
      for (const o of [...agents]) if (o.adopted && o !== a && o.spec.mount && o.state !== 'ride' && o.spec.id !== 'dino-baby') { o.rig.root.removeFromParent(); agents.delete(o); }
      group.add(a.rig.root);
      a.adopted = true;
      a.chunk = null;
    }
    let vx = 0, vz = 0, vy = 0;
    const m: Mountable = {
      name: a.spec.name,
      seat: a.rig.seat,
      object: a.rig.root,
      camDistance: cfg.cam * 0.7,
      drive: (input: Input, dt: number, g: Game) => {
        const ax = input.axis();
        const run = input.down('ShiftLeft') || input.down('ShiftRight');
        const cy = g.cam.yaw;
        const fx = -Math.sin(cy), fz = -Math.cos(cy);
        let wx = fx * ax.y + -fz * ax.x, wz = fz * ax.y + fx * ax.x;
        const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
        const sp = run ? cfg.run : cfg.walk;
        const k = Math.min(1, dt * 5);
        vx += (wx * sp - vx) * k; vz += (wz * sp - vz) * k;
        const nx = a.x + vx * dt, nz = a.z + vz * dt;
        const ny = island.heightAt(nx, nz);
        const wet = island.waterLevelAt(nx, nz) > ny + 0.6;
        if (!wet && Math.abs(ny - a.y) < 1.6 + Math.hypot(vx, vz) * dt * 2) { a.x = nx; a.z = nz; }
        else { vx *= 0.3; vz *= 0.3; }
        const gy = island.heightAt(a.x, a.z);
        if (input.hit('Space') && a.hop <= 0.01 && a.y <= gy + 0.05) vy = a.spec.id === 'dino-raptor' ? 9 : 6;
        vy -= 22 * dt;
        a.y = Math.max(gy, a.y + vy * dt);
        if (a.y <= gy) vy = 0;
        const v = Math.hypot(vx, vz);
        if (v > 0.3) {
          let d = Math.atan2(vx, vz) - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
          a.yaw += d * Math.min(1, dt * 8);
        }
        a.speed = v;
        a.state = 'ride';
      },
      onExit: () => {
        riding = null;
        a.state = 'follow'; a.timer = 8;
        a.speed = 0;
        const side = new THREE.Vector3(Math.cos(a.yaw), 0, -Math.sin(a.yaw)).multiplyScalar(a.rig.tpl.radius * a.spec.scale + 1.2);
        return new THREE.Vector3(a.x + side.x, a.y, a.z + side.z);
      },
    };
    riding = a;
    a.state = 'ride';
    game!.player.mount(m);
  }

  // ── 하늘: 프테라노돈 ──
  const pteraSpec = DINO_BY_ID.get('dino-ptera')!;
  const pteras: Array<{ rig: PteraRig; cx: number; cz: number; r: number; h: number; w: number; ph: number }> = [];
  {
    const rnd = ctx.rng('dinos:ptera');
    for (let i = 0; i < 8; i++) {
      const rig = makePtera(pteraSpec);
      const a = rnd() * Math.PI * 2, rr = i < 2 ? 0 : isl.r * (0.25 + rnd() * 0.45);
      const cx = isl.x + Math.cos(a) * rr, cz = isl.z + Math.sin(a) * rr;
      rig.root.scale.multiplyScalar(1.5);
      pteras.push({ rig, cx, cz, r: 25 + rnd() * 40, h: (i < 2 ? 175 : 22) + rnd() * 18, w: (0.12 + rnd() * 0.08) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6 });
      group.add(rig.root);
    }
  }

  // ── 앞바다: 플레시오사우루스 ──
  const plesioSpec = DINO_BY_ID.get('dino-plesio')!;
  const plesios: Array<{ rig: DinoRig; flippers: THREE.Object3D[]; cx: number; cz: number; r: number; w: number; ph: number }> = [];
  const mosas: Array<{ m: THREE.Mesh; cx: number; cz: number; r: number; w: number; ph: number }> = [];
  {
    const rnd = ctx.rng('dinos:sea');
    const seaPoint = (minC: number, maxC: number, a0: number) => {
      for (let k = 0; k < 24; k++) {
        const a = a0 + k * 0.26;
        for (let rr = isl.r * 0.85; rr < isl.r * 1.6; rr += 8) {
          const x = isl.x + Math.cos(a) * rr, z = isl.z + Math.sin(a) * rr;
          const c = island.worldSample(x, z).coast;
          if (c < minC && c > maxC) return { x, z };
        }
      }
      return null;
    };
    for (let i = 0; i < 4; i++) {
      const p = seaPoint(-22, -70, i * 1.57 + 0.4);
      if (!p) continue;
      const rig = makeDino(plesioSpec);
      const fl: THREE.Object3D[] = [];
      for (const z of [0.3, -0.3]) for (const m of [-1, 1]) {
        const f = new THREE.Group();
        f.position.set(m * plesioSpec.body.rx * 0.8, rig.tpl.hipF.y - 0.1, z);
        const fm = new THREE.Mesh(flipperGeometry(plesioSpec), dinoSkin());
        fm.scale.x = m;
        f.add(fm);
        rig.rig.add(f);
        fl.push(f);
      }
      plesios.push({ rig, flippers: fl, cx: p.x, cz: p.z, r: 10 + rnd() * 14, w: 0.1 + rnd() * 0.06, ph: rnd() * 6 });
      group.add(rig.root);
    }
    const mtex = mosaTexture();
    const mgeo = new THREE.PlaneGeometry(1, 1); mgeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const p = seaPoint(-140, -320, i * 3.1 + 1.0);
      if (!p) continue;
      const m = new THREE.Mesh(mgeo, new THREE.MeshBasicMaterial({ map: mtex, transparent: true, depthWrite: false, opacity: 0.55, color: '#0d2a44' }));
      m.scale.set(7, 1, 20);
      m.renderOrder = 1;
      group.add(m);
      mosas.push({ m, cx: p.x, cz: p.z, r: 30 + rnd() * 20, w: 0.05 + rnd() * 0.03, ph: rnd() * 6 });
    }
  }

  // ── 디버그(촬영): 전 종 진열 ──
  (window as unknown as { __dinos?: unknown }).__dinos = {
    agents, spots, nests, pteras, plesios,
    lineup(x: number, z: number, faceYaw = 0, gap = 3.2, ids?: string[]) {
      const list = ids ? ids.map((i) => DINO_BY_ID.get(i)!).filter(Boolean) : LAND_DINOS.concat([DINO_BY_ID.get('dino-baby')!]);
      return list.map((s, i) => {
        const a = spawn(s, x + (i - list.length / 2) * gap, z, faceYaw, `show:${i}`, group, null);
        a.adopted = true; a.state = 'look'; a.timer = 1e9;
        applyCurve(a.rig.root);
        return a;
      });
    },
    ride(a: Agent) { a.friend = 3; mount(a); },
    pet(a: Agent) { pet(a); },
    near(spec: string) { for (const a of agents) if (a.spec.id === spec) return a; return null; },
  };

  // ── 매 프레임 ──
  let meetT = 0;
  game.onUpdate((t, dt) => {
    const p = game.player;
    const px = p.pos.x, pz = p.pos.z;
    const nearIsland = Math.hypot(px - isl.x, pz - isl.z) < isl.r + 900;
    group.visible = game.world === 'earth';
    if (actionUntil > 0 && t > actionUntil) { if (p.action === 'pet' || p.action === 'dig') p.action = null; actionUntil = -1; }

    // F: 친한 탈것 공룡 타기
    if (!p.mounted && hint.agent && hint.agent.spec.mount && hint.agent.friend >= 2 && game.input.hit('KeyF')) mount(hint.agent);

    for (const a of agents) updateAgent(a, t, dt, px, pz);
    // 서로 겹치지 않게 살짝 밀어낸다(플레이어 근처만)
    if (dt > 0) {
      const near: Agent[] = [];
      for (const a of agents) if (a.state !== 'ride' && Math.abs(a.x - px) < 45 && Math.abs(a.z - pz) < 45) near.push(a);
      for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
        const a = near[i], b = near[j];
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        const min = (a.rig.tpl.radius * a.spec.scale + b.rig.tpl.radius * b.spec.scale) * 0.75;
        if (d >= min || d < 1e-4) continue;
        const push = Math.min(0.5, (min - d) * 0.5 * Math.min(1, dt * 6)) / d;
        const wa = a.spec.scale > b.spec.scale * 1.8 ? 0.15 : 0.5;
        a.x -= dx * push * wa * 2; a.z -= dz * push * wa * 2;
        b.x += dx * push * (1 - wa) * 2; b.z += dz * push * (1 - wa) * 2;
      }
    }

    // 하트
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      const k = (t - h.t0) / 1.4;
      if (k < 0) { h.s.visible = false; continue; }
      h.s.visible = true;
      h.s.position.set(h.base.x + h.vx * k + Math.sin(k * 9 + i) * 0.08, h.base.y + k * 1.3, h.base.z);
      h.s.scale.setScalar(0.32 + 0.25 * Math.min(1, k * 5) - 0.1 * k);
      (h.s.material as THREE.SpriteMaterial).opacity = 1 - sm(0.6, 1, k);
      if (k >= 1) { h.s.removeFromParent(); (h.s.material as THREE.Material).dispose(); hearts.splice(i, 1); }
    }
    // 화석 반짝이
    for (const s of spots.values()) {
      for (const sp of s.sparkles) {
        const k = 0.5 + 0.5 * Math.sin(t * 3.2 + sp.userData.ph);
        sp.scale.setScalar(0.12 + 0.3 * k * k);
        sp.material.opacity = 0.3 + 0.7 * k;
      }
    }
    // 알 들썩
    for (const n of nests.values()) {
      for (let i = 0; i < n.eggs.length; i++) {
        const e = n.eggs[i];
        const w0 = e.userData.wob as number | undefined;
        const kick = w0 !== undefined ? Math.max(0, 1 - (t - w0) / 1.2) : 0;
        const idle = Math.max(0, Math.sin(t * 0.9 + i * 2.1 + n.x) - 0.85) * 4;
        e.rotation.z = Math.sin(t * 22 + i) * 0.12 * (idle + kick * 1.5);
      }
    }
    if (!nearIsland) {
      for (const pt of pteras) pt.rig.root.visible = false;
      for (const pl of plesios) pl.rig.root.visible = false;
      for (const m of mosas) m.m.visible = false;
      return;
    }
    // 프테라노돈 선회
    for (const pt of pteras) {
      pt.rig.root.visible = true;
      const a = pt.ph + t * pt.w;
      const x = pt.cx + Math.cos(a) * pt.r, z = pt.cz + Math.sin(a) * pt.r;
      const y = Math.max(island.heightAt(x, z) + 16, (pt.h > 100 ? pt.h : island.heightAt(pt.cx, pt.cz) + pt.h) + Math.sin(t * 0.4 + pt.ph) * 5);
      pt.rig.root.position.set(x, y, z);
      // 진행 방향(접선)
      const dx = -Math.sin(a) * Math.sign(pt.w), dz = Math.cos(a) * Math.sign(pt.w);
      pt.rig.root.rotation.set(0, Math.atan2(dx, dz), 0);
      pt.rig.root.rotateZ(-Math.sign(pt.w) * 0.35);
      const flap = Math.sin(t * 3.2 + pt.ph);
      const glide = sm(-0.2, 0.6, Math.sin(t * 0.35 + pt.ph));
      const wing = (1 - glide) * flap * 0.55 + glide * 0.05;
      pt.rig.wingL.rotation.z = -wing;
      pt.rig.wingR.rotation.z = wing;
      pt.rig.head.rotation.x = 0.1 + 0.05 * Math.sin(t * 2 + pt.ph);
      pt.rig.face.material = blinkAt(t, pt.ph) ? faceShut : faceOpen;
    }
    // 플레시오
    for (const pl of plesios) {
      pl.rig.root.visible = Math.hypot(pl.cx - px, pl.cz - pz) < 700;
      if (!pl.rig.root.visible) continue;
      const a = pl.ph + t * pl.w;
      const x = pl.cx + Math.cos(a) * pl.r, z = pl.cz + Math.sin(a) * pl.r;
      pl.rig.root.position.set(x, -0.55 * plesioSpec.scale + Math.sin(t * 1.3 + pl.ph) * 0.08, z);
      pl.rig.root.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
      pl.rig.head.rotation.y = Math.sin(t * 0.7 + pl.ph) * 0.35;
      pl.rig.head.rotation.x = Math.sin(t * 0.9 + pl.ph) * 0.12;
      if (pl.rig.tail) pl.rig.tail.rotation.y = Math.sin(t * 2.2 + pl.ph) * 0.3;
      pl.flippers.forEach((f, i) => { f.rotation.z = (i % 2 ? 1 : -1) * Math.sin(t * 2.4 + (i < 2 ? 0 : 1.5)) * 0.35; });
      pl.rig.face.material = blinkAt(t, pl.ph) ? faceShut : faceOpen;
      if (Math.hypot(x - px, z - pz) < 26) record(plesioSpec);
    }
    // 모사사우루스 그림자
    for (const m of mosas) {
      m.m.visible = true;
      const a = m.ph + t * m.w;
      const x = m.cx + Math.cos(a) * m.r, z = m.cz + Math.sin(a) * m.r;
      m.m.position.set(x, -1.2, z);
      m.m.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.sin(t * 1.4 + m.ph) * 0.08;
      if (Math.hypot(x - px, z - pz) < 45) record(DINO_BY_ID.get('dino-mosa')!);
    }
    // 만남 기록(가끔)
    meetT -= dt;
    if (meetT <= 0 || dt === 0) {
      meetT = 0.5;
      for (const a of agents) if (Math.hypot(a.x - px, a.z - pz) < 9 + a.spec.scale * 2) record(a.spec);
      for (const pt of pteras) if (pt.rig.root.position.distanceTo(p.pos) < 75) record(pteraSpec);
      for (const n of nests.values()) if (Math.hypot(n.x - px, n.z - pz) < 7) record(DINO_BY_ID.get('dino-egg')!);
    }
  });

  function blinkAt(t: number, ph: number) {
    const per = 3.7 + (ph % 1.3);
    const k = (t + ph) % per;
    return k < 0.13 || (Math.floor((t + ph) / per) % 3 === 1 && k > 0.26 && k < 0.36);
  }

  function updateAgent(a: Agent, t: number, dt: number, px: number, pz: number) {
    const R = a.rig;
    const dxp = px - a.x, dzp = pz - a.z;
    const dp = Math.hypot(dxp, dzp);
    const far = dp > 90;
    // 멀면 다리·얼굴·꼬리·그림자 숨기고 AI 쉬기(브라키오는 멀리서도 보이는 랜드마크)
    const near = dp < 55;
    R.face.visible = near;
    R.root.children[2] && (R.root.children[2].visible = near);
    for (const l of R.legs) l.visible = dp < 75;
    if (R.tail) R.tail.visible = dp < 75;
    // 실제 그림자는 가까운 몸통·머리만(다리·꼬리·발밑 원형 그림자로 충분)
    const shadow = dp < 32;
    if (shadow !== R.root.userData.shadow) {
      R.root.userData.shadow = shadow;
      R.rig.children[0].castShadow = shadow;
      (R.head.children[0] as THREE.Mesh).castShadow = shadow;
      R.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== R.rig.children[0] && o !== R.head.children[0]) o.castShadow = false; });
    }
    if (far && a.state !== 'ride') { R.root.visible = dp < (a.spec.scale > 3 ? 320 : 150); return; }
    R.root.visible = true;
    const sc = a.spec.scale;
    const baseSpeed = a.spec.speed * Math.sqrt(sc);

    if (a.state !== 'ride') {
      a.timer -= dt;
      const pers = a.friend >= 4 && a.spec.personality === 'shy' ? 'curious' : a.spec.personality;
      const pClose = dp < (a.rig.tpl.radius * sc + 2.0);
      // 성격별 반응
      if (a.state === 'follow' || (a.spec.personality === 'follow' && a.adopted)) {
        if (a.timer <= 0 && !a.adopted) a.state = 'idle';
        else if (dp > 3.5 + sc) { a.state = 'follow'; a.tx = px - (dxp / dp) * (2.5 + sc); a.tz = pz - (dzp / dp) * (2.5 + sc); }
      } else if (pers === 'shy' && dp < 9 + sc * 2 && a.friend < 2 && !pClose) {
        if (a.state !== 'flee') { a.state = 'flee'; a.timer = 2.5; }
        a.tx = a.x - (dxp / dp) * 14; a.tz = a.z - (dzp / dp) * 14;
      } else if (pers === 'curious' && dp < 14 && dp > 3.4 + sc && a.state !== 'look' && a.timer < 6) {
        a.state = 'approach';
        a.tx = px - (dxp / dp) * (2.6 + sc); a.tz = pz - (dzp / dp) * (2.6 + sc);
      } else if (a.timer <= 0) {
        const r = hashf(a.id + Math.floor(t * 10));
        if (a.state === 'walk' || a.state === 'approach' || a.state === 'flee' || a.state === 'look') {
          a.state = r < 0.45 ? 'graze' : r < 0.6 ? 'yawn' : 'idle';
          a.timer = a.state === 'yawn' ? 2.2 : 2 + r * 4;
        } else {
          a.state = 'walk';
          const ang = r * 40, rr = 4 + ((r * 97) % 1) * 10 * Math.sqrt(sc);
          a.tx = a.home.x + Math.cos(ang) * rr; a.tz = a.home.z + Math.sin(ang) * rr;
          // 플레이어 정면 시야(카메라 → 플레이어 방향 앞 12 m, ±35°)를 가로막는 목표는 옆으로 민다
          {
            const cy = game!.cam.yaw, fx = -Math.sin(cy), fz = -Math.cos(cy);
            const rx = a.tx - px, rz = a.tz - pz, along = rx * fx + rz * fz, lat = rx * -fz + rz * fx;
            if (along > 0 && along < 12 && Math.abs(lat) < along * 0.7 + 1.5) {
              const sgn = lat >= 0 ? 1 : -1, push = along * 0.7 + 3 - Math.abs(lat);
              a.tx += -fz * sgn * push; a.tz += fx * sgn * push;
            }
          }
          for (const w of WELCOME) {
            const wx = a.tx - w.x, wz = a.tz - w.z, wd = Math.hypot(wx, wz);
            if (wd < CLEAR) { const s2 = (CLEAR + 1) / Math.max(0.01, wd); a.tx = w.x + wx * s2; a.tz = w.z + wz * s2; }
          }
          a.timer = 9;
        }
      }
      if (a.state === 'approach' && dp <= 3.6 + sc) { a.state = 'look'; a.timer = 4; }

      // 이동
      let want = 0;
      if (a.state === 'walk' || a.state === 'approach' || a.state === 'flee' || a.state === 'follow') {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.6) { if (a.state !== 'follow') { a.state = 'idle'; a.timer = 1 + hashf(a.id + t) * 2; } }
        else {
          want = baseSpeed * (a.state === 'flee' ? 2.4 : a.state === 'follow' ? (dp > 9 ? 2.6 : 1.4) : a.state === 'approach' ? 1.3 : 1);
          let dyaw = Math.atan2(dx, dz) - a.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
          a.yaw += dyaw * Math.min(1, dt * 3.5);
        }
      }
      a.speed += (want - a.speed) * Math.min(1, dt * 4);
      if (a.speed > 0.02) {
        const step = a.speed * dt;
        const nx = a.x + Math.sin(a.yaw) * step, nz = a.z + Math.cos(a.yaw) * step;
        const okLand = a.adopted ? island.waterLevelAt(nx, nz) < island.heightAt(nx, nz) + 0.3 : okGround(nx, nz);
        if (okLand && slopeOk(nx, nz, a.y, step)) { a.x = nx; a.z = nz; }
        else { a.yaw += 1.6; a.state = a.state === 'follow' ? 'follow' : 'idle'; a.timer = 0.5; a.speed *= 0.3; }
      }
      a.y = island.heightAt(a.x, a.z);
    }

    // ── 몸짓 ──
    const moving = a.speed / Math.max(0.3, baseSpeed);
    a.phase += dt * (a.speed / Math.max(0.15, sc * 0.55)) * 3.2;
    const sw = Math.sin(a.phase);
    const amp = Math.min(0.75, moving * 0.55);
    if (a.spec.biped) {
      R.legs[0] && (R.legs[0].rotation.x = sw * amp);
      R.legs[1] && (R.legs[1].rotation.x = -sw * amp);
    } else {
      R.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? sw : -sw) * amp; });
    }
    const bob = Math.abs(Math.cos(a.phase)) * 0.05 * Math.min(1, moving);
    a.hop = Math.max(0, a.hop - dt * 2.2);
    const hopY = a.hop > 0 ? Math.abs(Math.sin(a.hop * Math.PI * 2)) * 0.25 * Math.min(1, a.hop) : 0;
    const breathe = Math.sin(t * 2.1 + a.blink) * 0.012;
    R.rig.position.y = bob + hopY / sc;
    R.rig.rotation.z = Math.sin(a.phase) * 0.06 * Math.min(1, moving);
    R.rig.scale.set(1 + breathe * 0.5, 1 + breathe, 1 + breathe * 0.5);
    // 머리: 풀 뜯기·하품·바라보기
    let tp = 0, ty = 0, lean = 0;
    if (a.state === 'graze') { tp = 0.55 + Math.sin(t * 7 + a.blink) * 0.06; lean = a.spec.biped ? 0.25 : 0.1; }
    else if (a.state === 'yawn') { tp = -0.45; }
    const lookP = (a.state === 'look' || a.state === 'approach' || a.state === 'follow' || dp < 8) && a.state !== 'graze' && a.state !== 'flee';
    if (lookP) {
      let rel = Math.atan2(dxp, dzp) - a.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      ty = THREE.MathUtils.clamp(rel, -0.9, 0.9);
      tp = -0.12;
      if (a.state === 'look') R.head.rotation.z = Math.sin(t * 2.4 + a.blink) * 0.12; // 갸웃
    } else R.head.rotation.z *= 0.9;
    const k = Math.min(1, dt * 4);
    a.headPitch += (tp - a.headPitch) * k;
    a.headYaw += (ty - a.headYaw) * k;
    a.lean += (lean - a.lean) * k;
    R.head.rotation.x = a.headPitch;
    R.head.rotation.y = a.headYaw;
    R.rig.rotation.x = a.lean;
    // 꼬리 흔들기(기분 좋으면 빠르게)
    a.wag = Math.max(0, a.wag - dt);
    if (R.tail) {
      const wagF = a.wag > 0 ? 9 : 2.2 + moving * 3;
      R.tail.rotation.y = Math.sin(t * wagF + a.blink) * (a.wag > 0 ? 0.35 : 0.14);
      R.tail.rotation.x = -0.05 + Math.sin(t * 1.3 + a.blink) * 0.04;
    }
    // 눈 깜빡임(하품·쓰다듬기 땐 감기)
    const shut = a.state === 'yawn' || (t - a.lastPet < 0.9) || blinkAt(t, a.blink);
    R.face.material = shut ? faceShut : faceOpen;

    R.root.position.set(a.x, a.y, a.z);
    R.root.rotation.y = a.yaw;
    // 카메라 근평면 1.5 m 안: 디더 페이드(타고 있는 공룡 제외)
    {
      let lv = 0;
      if (a.state !== 'ride' && dp < 30) {
        const cp = game!.engine.camera.position;
        const cdist = Math.hypot(cp.x - a.x, cp.y - (a.y + R.tpl.height * sc * 0.45), cp.z - a.z) - R.tpl.radius * sc * 0.85;
        const f = Math.min(1, Math.max(0, (cdist - 0.2) / 1.5));
        lv = f > 0.85 ? 0 : f > 0.5 ? 1 : f > 0.15 ? 2 : -1;
      }
      if (lv !== (R.root.userData.fadeLv ?? 0)) {
        R.root.userData.fadeLv = lv;
        const mat = lv >= 0 ? dinoSkin(lv) : null;
        R.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || o === R.face) return;
          if (m.userData.skin === undefined) m.userData.skin = m.material === dinoSkin();
          if (!m.userData.skin) return;
          if (mat) { m.material = mat; m.visible = true; } else m.visible = false;
        });
        R.face.visible = R.face.visible && lv === 0;
      } else if (lv !== 0) R.face.visible = false;
    }
    // 좌석: 몸 움직임을 따라(스케일 없는 좌표)
    R.seat.position.set(0, R.tpl.seat.y * sc + (bob + hopY / sc) * sc, R.tpl.seat.z * sc);
  }

  return group;
}

function isChild(parent: THREE.Object3D, o: THREE.Object3D) {
  let p: THREE.Object3D | null = o;
  while (p) { if (p === parent) return true; p = p.parent; }
  return false;
}

function hashf(s: string | number) {
  const str = String(s);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

const sm = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function blobTex(): THREE.CanvasTexture {
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, '#bbb'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(c);
}

function mosaTexture(): THREE.CanvasTexture {
  const n = 256, c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d')!;
  g.filter = 'blur(10px)';
  g.fillStyle = '#ffffff';
  // 위에서 본 길쭉한 몸 + 머리 + 지느러미 4 + 꼬리
  g.beginPath(); g.ellipse(128, 120, 34, 92, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(128, 34, 24, 30, 0, 0, Math.PI * 2); g.fill();
  for (const [x, y, r] of [[84, 90, -0.6], [172, 90, 0.6], [94, 170, -0.5], [162, 170, 0.5]] as const) { g.beginPath(); g.ellipse(x, y, 12, 30, r, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.moveTo(128, 200); g.lineTo(100, 250); g.lineTo(156, 250); g.fill();
  return new THREE.CanvasTexture(c);
}
