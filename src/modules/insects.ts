// 곤충: 섬·시간대·서식 위치(꽃·그루터기·바위·땅·물·하늘)별로 플레이어 주변 청크에 나타난다.
// 뛰어서 다가가면 도망, 살금살금 다가가 E 로 잠자리채 → 접근 속도에 따라 성공 → showCatch. 밤엔 반딧불이가 빛난다.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import { applyCurve } from '../core/curve';
import { INSECTS, themeOf, type BugSpecies, type BugSpot, type BugTod, type BugIsland } from './insects/data';
import { makeBug, setWings, bugScale, type BugMesh } from './insects/model';
import { Bag, addPerch, type Anchor } from './insects/perch';

export const order = 30;

const CHUNK = 24;
const RADIUS = 64;
const SHOW_DIST = 40;
const RARITY_W = [0, 10, 5, 2.2, 0.8, 0.3];

interface Slot {
  key: string;
  spot: BugSpot;
  theme: BugIsland;
  anchor: Anchor;
  /** 물 위면 수면 높이 */
  waterY: number;
  group: THREE.Group;
  bug: Bug | null;
  n: number;
  ph: number;
}

interface Bug {
  sp: BugSpecies;
  m: BugMesh;
  slot: Slot;
  state: 'idle' | 'flee' | 'gone';
  fleeT0: number;
  fleeFrom: THREE.Vector3;
  fleeDir: THREE.Vector3;
  respawnAt: number;
  /** 지금 위치(매 프레임) */
  pos: THREE.Vector3;
  baseQ: THREE.Quaternion;
}

const FLIERS = new Set(['butterfly', 'moth', 'dragonfly', 'damselfly', 'bee', 'firefly']);

function todOf(name: string): BugTod {
  return name === 'morning' || name === 'sunset' || name === 'night' ? name : 'day';
}

/** 을/를 */
function josa(word: string, a: string, b: string) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return b;
  return (c - 0xac00) % 28 ? a : b;
}

const LINES: Record<string, string[]> = {
  butterfly: ['팔랑팔랑~ 날개가 반짝반짝!', '꽃향기가 솔솔 나요!', '살금살금 작전 성공!'],
  moth: ['복슬복슬 솜뭉치 겟!', '밤 산책 친구를 만났다!'],
  dragonfly: ['하늘 순찰대장을 잡았다!', '눈이 엄청 커! 나를 보고 있어!'],
  damselfly: ['바늘처럼 가느다래!', '사뿐사뿐 잡았다!'],
  bee: ['붕붕~ 꿀 냄새가 나!', '쏘지 마~ 친구 하자!'],
  beetle: ['반질반질 보석 같아!', '오늘의 반짝이 챔피언!'],
  ladybug: ['행운이 왔다!', '점이 몇 개인지 세어 볼까?'],
  stag: ['집게가 멋져! 기사님 등장!', '힘자랑 대회 나가자!'],
  rhino: ['뿔이 우와~ 진짜 멋져!', '숲속의 장사를 잡았다!'],
  cicada: ['맴맴! 귀가 멍~', '여름 노래를 잡았다!'],
  grasshopper: ['폴짝! 이번엔 내가 빨랐지!', '풀숲의 점프왕 겟!'],
  mantis: ['기도하는 손 귀여워!', '쿵후 고수를 잡았다!'],
  firefly: ['손안에 작은 등불이 생겼다!', '반짝반짝 밤의 별!'],
  ant: ['영차영차 일꾼 겟!', '작아도 힘은 장사!'],
  spider: ['눈이 반칙이야… 너무 귀여워!', '거미줄 건축가 등장!'],
  snail: ['느긋느긋 여행자 겟!', '집째로 따라왔네!'],
  strider: ['물 위의 스케이터!', '쓱쓱~ 잡았다!'],
  snowbug: ['차가워! 눈 결정이 반짝!', '똑같은 결정은 하나도 없대!'],
  sporebug: ['포자가 퐁퐁!', '버섯 모자 너무 귀여워!'],
  scorpion: ['집게 번쩍! 근데 순해!', '사막의 친구 겟!'],
  dungbeetle: ['영차! 공은 두고 가렴~', '힘센 공 굴리기 선수!'],
  pillbug: ['데구루루~ 공이 됐다!', '수줍음쟁이 겟!'],
  caterpillar: ['냠냠 잎사귀 먹보!', '언젠가 멋진 나비가 될 거야!'],
};

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return; // 룩 테스트 모드엔 곤충을 내보내지 않는다(마을 장면 그대로)
  const g: Game = game;
  const { island } = ctx;
  g.state.register(INSECTS);

  const root = new THREE.Group();
  root.name = 'insects';
  let tod: BugTod = todOf(ctx.tod);
  const slots = new Set<Slot>();

  // 섬 테마별 · 자리별 후보(시간대 무관) — 자리 고르기용
  const spotsFor = new Map<BugIsland, Set<BugSpot>>();
  for (const s of INSECTS) for (const i of s.islands) {
    if (!spotsFor.has(i)) spotsFor.set(i, new Set());
    spotsFor.get(i)!.add(s.spot);
  }

  function pickSpecies(slot: Slot): BugSpecies | null {
    const cands = INSECTS.filter((s) => s.spot === slot.spot && s.islands.includes(slot.theme) && s.tods.includes(tod));
    if (!cands.length) return null;
    const rnd = ctx.rng(`insects:pick:${slot.key}:${tod}:${slot.n}`);
    let sum = 0;
    for (const c of cands) sum += RARITY_W[c.rarity] ?? 1;
    let r = rnd() * sum;
    for (const c of cands) { r -= RARITY_W[c.rarity] ?? 1; if (r <= 0) return c; }
    return cands[cands.length - 1];
  }

  function spawn(slot: Slot) {
    if (slot.bug) { slot.bug.m.root.removeFromParent(); slot.bug = null; }
    const sp = pickSpecies(slot);
    if (!sp) return;
    const m = makeBug(sp);
    const a = slot.anchor;
    // 자리 방향: up = a.up, 앞 = a.fwd
    const z = a.fwd.clone().normalize();
    const y = a.up.clone().normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    const z2 = new THREE.Vector3().crossVectors(x, y).normalize();
    const baseQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z2));
    m.body.castShadow = bugScale(sp) > 0.5;
    m.root.position.copy(a.pos);
    m.root.quaternion.copy(baseQ);
    applyCurve(m.root);
    slot.group.add(m.root);
    slot.bug = { sp, m, slot, state: 'idle', fleeT0: 0, fleeFrom: new THREE.Vector3(), fleeDir: new THREE.Vector3(), respawnAt: 0, pos: a.pos.clone(), baseQ };
  }

  const VB = island.ISLAND_BOUNDS;
  const inVillage = (x: number, z: number) => x > VB.minX - 4 && x < VB.maxX + 4 && z > VB.minZ - 4 && z < VB.maxZ + 4;

  g.chunks.add({
    key: 'insects', size: CHUNK, radius: RADIUS,
    build: ({ cx, cz, x0, z0, size }) => {
      const rnd = ctx.rng(`insects:${cx},${cz}`);
      const n = rnd() < 0.3 ? 1 : rnd() < 0.75 ? 2 : 3;
      const group = new THREE.Group();
      group.name = `insects ${cx},${cz}`;
      const bag = new Bag();
      const made: Slot[] = [];
      for (let i = 0; i < n; i++) {
        for (let tries = 0; tries < 8; tries++) {
          const x = x0 + 1.5 + rnd() * (size - 3), z = z0 + 1.5 + rnd() * (size - 3);
          if (Math.hypot(x - island.HERO.player.x, z - island.HERO.player.z) < 4) continue;
          if (made.some((s) => s.anchor.pos.distanceToSquared(new THREE.Vector3(x, s.anchor.pos.y, z)) < 25)) continue;
          const s = island.surfaceAt(x, z);
          const theme = themeOf(s.island);
          if (!theme) continue;
          const avail = spotsFor.get(theme);
          if (!avail) continue;
          let spot: BugSpot | null = null;
          let waterY = -Infinity;
          const wl = island.waterLevelAt(x, z);
          if (s.kind === 'sea' || s.kind === 'river') {
            if (!avail.has('water') || !Number.isFinite(wl)) continue;
            const depth = wl - s.h;
            if (depth < 0.12 || depth > 2.4) continue;
            if (s.kind === 'sea' && s.coastDist < -14) continue;
            spot = 'water';
            waterY = wl;
          } else {
            if (s.kind === 'cliff' || s.kind === 'lava') continue;
            const village = inVillage(x, z);
            const w: Array<[BugSpot, number]> = village
              ? [['air', 3], ['ground', 1.5]]
              : [['flower', 3.2], ['tree', 2], ['rock', 1.8], ['ground', 2.2], ['air', 3]];
            const ok = w.filter(([k]) => avail.has(k));
            if (!ok.length) continue;
            let sum = 0;
            for (const [, v] of ok) sum += v;
            let r = rnd() * sum;
            for (const [k, v] of ok) { r -= v; if (r <= 0) { spot = k; break; } }
            spot ??= ok[0][0];
            // 경사 심한 곳엔 자리를 놓지 않는다
            if (spot !== 'air') {
              const e = 0.6;
              const sl = Math.hypot(island.heightAt(x + e, z) - island.heightAt(x - e, z), island.heightAt(x, z + e) - island.heightAt(x, z - e)) / (2 * e);
              if (sl > 0.45) continue;
            }
          }
          const y = spot === 'water' ? waterY : island.heightAt(x, z);
          let anchor: Anchor;
          if (spot === 'flower' || spot === 'tree' || spot === 'rock') {
            anchor = addPerch(bag, { type: spot, x, y, z, theme, rnd });
          } else {
            const a = rnd() * Math.PI * 2;
            anchor = { pos: new THREE.Vector3(x, y, z), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) };
          }
          const slot: Slot = { key: `${cx},${cz}:${i}`, spot, theme, anchor, waterY, group, bug: null, n: 0, ph: rnd() * 100 };
          made.push(slot);
          break;
        }
      }
      const pm = bag.mesh();
      if (pm) group.add(pm);
      for (const s of made) { slots.add(s); spawn(s); }
      group.userData.slots = made;
      return group;
    },
    dispose: (o) => {
      const made = o.userData.slots as Slot[] | undefined;
      if (made) for (const s of made) slots.delete(s);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh && m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      });
    },
  });

  // 시간대가 바뀌면 그 시간대 곤충으로 다시 뽑는다
  ctx.onTod((name) => {
    const nt = todOf(name);
    if (nt === tod) return;
    tod = nt;
    for (const s of slots) spawn(s);
  });

  // ── 빛(반딧불이 꼬리·결정·포자): 점 하나 + 주변을 떠도는 작은 불빛들 ──
  const MAXP = 600;
  const gpos = new Float32Array(MAXP * 3), gcol = new Float32Array(MAXP * 3), gsize = new Float32Array(MAXP);
  const ggeo = new THREE.BufferGeometry();
  ggeo.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  ggeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
  ggeo.setAttribute('size', new THREE.BufferAttribute(gsize, 1));
  const gtex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = r; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const gmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { map: { value: gtex }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 color; varying vec3 vC;
      uniform float uScale;
      void main() {
        vC = color;
        vec3 transformed = position;
        #include <project_vertex>
        gl_PointSize = size * uScale / max( 0.5, -mvPosition.z );
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; varying vec3 vC;
      void main() {
        vec4 t = texture2D( map, gl_PointCoord );
        gl_FragColor = vec4( vC * t.a, t.a );
      }`,
  });
  const glowPts = new THREE.Points(ggeo, gmat);
  glowPts.frustumCulled = false;
  glowPts.renderOrder = 6;
  root.add(glowPts);

  // ── 블롭 그림자(땅·꽃·바위 위 곤충 아래 동그란 그림자 — 풀밭에서도 위치가 읽히게) ──
  const MAXS = 420;
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    // alphaMap 은 초록 채널을 읽는다 → 검정 바탕 위 회색 그라디언트(불투명)
    x.fillStyle = '#000'; x.fillRect(0, 0, 64, 64);
    r.addColorStop(0, 'rgb(175,175,175)');
    r.addColorStop(0.55, 'rgb(130,130,130)');
    r.addColorStop(1, 'rgb(0,0,0)');
    x.fillStyle = r; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  shadowGeo.userData.shared = true;
  const shadowMat = new THREE.MeshBasicMaterial({
    color: '#2c5a1e', alphaMap: shadowTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, MAXS);
  shadows.frustumCulled = false;
  shadows.renderOrder = 1;
  shadows.count = 0;
  applyCurve(shadows);
  root.add(shadows);
  let shN = 0;
  const shM = new THREE.Matrix4(), shQ = new THREE.Quaternion(), shS = new THREE.Vector3(), shP = new THREE.Vector3();
  const UPV = new THREE.Vector3(0, 1, 0);
  const pushShadow = (pos: THREE.Vector3, up: THREE.Vector3, size: number) => {
    if (shN >= MAXS) return;
    shQ.setFromUnitVectors(UPV, up);
    shS.set(size, 1, size * 0.86);
    shM.compose(pos, shQ, shS);
    shadows.setMatrixAt(shN++, shM);
  };

  // ── 반짝이(2~3초마다 곤충 머리 위에 별 하나 — "여기 있어요!") ──
  const MAXK = 300;
  const kpos = new Float32Array(MAXK * 3), kcol = new Float32Array(MAXK * 3), ksize = new Float32Array(MAXK), krot = new Float32Array(MAXK);
  const kgeo = new THREE.BufferGeometry();
  kgeo.setAttribute('position', new THREE.BufferAttribute(kpos, 3));
  kgeo.setAttribute('color', new THREE.BufferAttribute(kcol, 3));
  kgeo.setAttribute('size', new THREE.BufferAttribute(ksize, 1));
  kgeo.setAttribute('rot', new THREE.BufferAttribute(krot, 1));
  const ktex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const r = x.createRadialGradient(64, 64, 0, 64, 64, 40);
    r.addColorStop(0, 'rgba(255,255,255,0.9)');
    r.addColorStop(0.3, 'rgba(255,255,255,0.25)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = r; x.fillRect(0, 0, 128, 128);
    // 네 갈래 별
    x.fillStyle = '#ffffff';
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? 9 : 60;
      if (i === 0) x.moveTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr);
      else x.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr);
    }
    x.closePath(); x.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const kmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { map: { value: ktex }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute float rot; attribute vec3 color; varying vec3 vC; varying float vR;
      uniform float uScale;
      void main() {
        vC = color; vR = rot;
        vec3 transformed = position;
        #include <project_vertex>
        gl_PointSize = size * uScale / max( 0.5, -mvPosition.z );
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; varying vec3 vC; varying float vR;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float c = cos(vR), s = sin(vR);
        q = mat2(c, -s, s, c) * q + 0.5;
        vec4 t = texture2D( map, q );
        gl_FragColor = vec4( vC * t.a, t.a );
      }`,
  });
  const sparkPts = new THREE.Points(kgeo, kmat);
  sparkPts.frustumCulled = false;
  sparkPts.renderOrder = 7;
  root.add(sparkPts);
  let kN = 0;
  const sparkCol = new THREE.Color('#fff4c4');
  const pushSpark = (pos: THREE.Vector3, size: number, k: number, rot: number) => {
    if (kN >= MAXK) return;
    kpos[kN * 3] = pos.x; kpos[kN * 3 + 1] = pos.y; kpos[kN * 3 + 2] = pos.z;
    kcol[kN * 3] = sparkCol.r * k; kcol[kN * 3 + 1] = sparkCol.g * k; kcol[kN * 3 + 2] = sparkCol.b * k;
    ksize[kN] = size; krot[kN] = rot;
    kN++;
  };

  // ── 잠자리채(휘두를 때만 보인다) ──
  const net = new THREE.Group();
  {
    const wood = new THREE.MeshPhysicalMaterial({ color: '#d79a5e', roughness: 0.55, clearcoat: 0.4 });
    const hoopM = new THREE.MeshPhysicalMaterial({ color: '#ffd04a', roughness: 0.35, clearcoat: 0.6 });
    const bagM = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.8, side: THREE.DoubleSide, sheen: 1, depthWrite: false });
    const stick = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.9, 4, 10), wood);
    stick.position.y = 0.45;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 10, 32), hoopM);
    hoop.position.y = 1.08;
    const bagG = new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    bagG.scale(1, 1.6, 1);
    const bagMesh = new THREE.Mesh(bagG, bagM);
    bagMesh.position.y = 1.08;
    bagMesh.rotation.x = Math.PI / 2;
    hoop.rotation.x = Math.PI / 2;
    for (const m of [stick, hoop]) m.castShadow = true;
    net.add(stick, hoop, bagMesh);
    net.visible = false;
    applyCurve(net);
  }
  let netHost: THREE.Object3D | null = null;

  // ── 잡기 ──
  let speedAvg = 0;
  let catching: { bug: Bug; t0: number; done: boolean } | null = null;
  let netUntil = -1;
  let catches = 0;

  function flee(b: Bug, t: number) {
    if (b.state !== 'idle') return;
    b.state = 'flee';
    b.fleeT0 = t;
    b.fleeFrom.copy(b.pos);
    const p = g.player.pos;
    b.fleeDir.set(b.pos.x - p.x, 0, b.pos.z - p.z);
    if (b.fleeDir.lengthSq() < 1e-4) b.fleeDir.set(1, 0, 0);
    b.fleeDir.normalize();
  }

  function resolveCatch(t: number) {
    if (!catching || catching.done) return;
    catching.done = true;
    const b = catching.bug;
    g.player.locked = false;
    if (b.state !== 'idle' || !b.slot.bug || b.slot.bug !== b) return;
    const sp = b.sp;
    const base = [0, 0.97, 0.9, 0.8, 0.68, 0.55][sp.rarity] ?? 0.7;
    const shy = sp.shy ?? 1;
    const speedK = 1 - Math.min(0.5, Math.max(0, (speedAvg - 1.0) / 9));
    const airK = sp.spot === 'air' ? 0.92 : 1;
    const chance = (base / Math.sqrt(shy)) * speedK * airK;
    const rnd = ctx.rng(`insects:catch:${catches++}:${b.slot.key}:${Math.floor(t * 1000)}`);
    if (rnd() < chance) {
      // 성공: 그 자리 곤충은 사라지고 잠시 뒤 다시 나타난다
      b.state = 'gone';
      b.m.root.visible = false;
      b.respawnAt = t + 40;
      const cm = sp.cm[0] + rnd() * (sp.cm[1] - sp.cm[0]);
      const show = makeBug(sp, Math.min(1.1, Math.max(0.5, sp.size * 1.7)));
      if (show.model.wing) setWings(show, show.model.wing.rest * 0.4 + 0.2);
      show.root.rotation.y = Math.PI;
      applyCurve(show.root);
      const lines = LINES[sp.kind] ?? ['잡았다!'];
      const line = `${sp.name}${josa(sp.name, '을', '를')} 잡았다! ${lines[Math.floor(rnd() * lines.length)]}`;
      g.ui.showCatch({ species: sp, sizeText: `${cm.toFixed(1)}cm`, model: show.root, line });
    } else {
      flee(b, t);
      g.ui.toast(speedAvg > 3 ? '앗, 놓쳤다… 더 살금살금 다가가 보자!' : '앗, 놓쳤다…! 다시 찾아보자');
    }
  }

  g.addProvider('insects', (p) => {
    if (catching && !catching.done) return null;
    if (p.mode !== 'ground' || p.mounted) return null;
    let best: Bug | null = null, bd = Infinity;
    for (const s of slots) {
      const b = s.bug;
      if (!b || b.state !== 'idle') continue;
      const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z, dy = b.pos.y - p.pos.y;
      if (dy > 2.6 || dy < -1.5) continue;
      const d = Math.hypot(dx, dz);
      if (d < 2.5 && d < bd) { bd = d; best = b; }
    }
    if (!best) return null;
    const b = best;
    const known = !!g.state.dex[b.sp.id];
    return {
      label: known ? `잠자리채로 ${b.sp.name} 잡기` : '잠자리채로 살금살금 잡기',
      dist: bd + 0.3,
      use: () => {
        if (catching && !catching.done) return;
        catching = { bug: b, t0: g.time, done: false };
        g.player.action = 'net';
        g.player.locked = true;
        netUntil = g.time + 0.75;
        // 곤충 쪽을 바라본다
        g.player.yaw = Math.atan2(-(b.pos.x - g.player.pos.x), -(b.pos.z - g.player.pos.z));
      },
    };
  });

  // ── 매 프레임 ──
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), qTmp = new THREE.Quaternion(), eul = new THREE.Euler();
  const lookQ = (dir: THREE.Vector3, bank = 0) => {
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = -Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 0.6;
    eul.set(pitch, yaw, bank, 'YXZ');
    return qTmp.setFromEuler(eul);
  };

  /** 공중 경로(시간 t, 위상 ph) — home 주변 고리 */
  const airPath = (b: Bug, t: number, out: THREE.Vector3) => {
    const s = b.slot, sp = b.sp;
    const kind = sp.kind;
    const fast = kind === 'dragonfly' || kind === 'damselfly' ? 0.55 : kind === 'firefly' ? 0.22 : 0.32;
    const R = kind === 'dragonfly' ? 3.2 : kind === 'firefly' ? 1.6 : 2.2;
    let a = t * fast + s.ph;
    if (kind === 'dragonfly' || kind === 'damselfly') {
      // 휙 날다가 멈추는 잠자리 비행
      const k = Math.floor(a), f = a - k;
      a = k + THREE.MathUtils.smootherstep(f, 0.15, 0.55);
    }
    const hx = s.anchor.pos.x, hz = s.anchor.pos.z;
    out.x = hx + Math.sin(a * 1.0) * R + Math.sin(a * 2.3 + 1) * R * 0.25;
    out.z = hz + Math.cos(a * 0.8) * R * 0.9 + Math.cos(a * 1.9) * R * 0.2;
    const baseH = kind === 'firefly' ? 0.9 : kind === 'dragonfly' || kind === 'damselfly' ? 1.4 : 1.05;
    const gy = Math.max(island.heightAt(out.x, out.z), Number.isFinite(island.waterLevelAt(out.x, out.z)) ? island.waterLevelAt(out.x, out.z) : -99);
    out.y = gy + baseH * (sp.size > 0.8 ? 2.2 : 1) + Math.sin(a * 1.7 + s.ph) * 0.35 + (kind === 'butterfly' ? Math.abs(Math.sin(t * 4.5 + s.ph)) * 0.12 : 0);
    return out;
  };

  const groundPath = (b: Bug, t: number, out: THREE.Vector3) => {
    const s = b.slot;
    const slow = b.sp.kind === 'snail' ? 0.04 : b.sp.kind === 'grasshopper' ? 0.16 : 0.11;
    const R = b.sp.kind === 'snail' ? 0.6 : 1.3;
    const a = t * slow + s.ph;
    out.x = s.anchor.pos.x + Math.sin(a) * R + Math.sin(a * 2.7) * 0.25;
    out.z = s.anchor.pos.z + Math.cos(a * 0.85) * R;
    out.y = s.spot === 'water' ? s.waterY : island.heightAt(out.x, out.z);
    if (b.sp.kind === 'grasshopper') {
      const hp = (t * 0.7 + s.ph) % 1;
      out.y += hp < 0.3 ? Math.sin((hp / 0.3) * Math.PI) * 0.35 : 0;
    }
    return out;
  };

  let ptsN = 0;
  const pushGlow = (p: THREE.Vector3, c: THREE.Color, size: number, k = 1) => {
    if (ptsN >= MAXP) return;
    gpos[ptsN * 3] = p.x; gpos[ptsN * 3 + 1] = p.y; gpos[ptsN * 3 + 2] = p.z;
    gcol[ptsN * 3] = c.r * k; gcol[ptsN * 3 + 1] = c.g * k; gcol[ptsN * 3 + 2] = c.b * k;
    gsize[ptsN] = size;
    ptsN++;
  };
  const swarmCol = new THREE.Color();

  g.onUpdate((t, dt) => {
    const p = g.player;
    if (dt > 0) speedAvg += (p.speed - speedAvg) * Math.min(1, dt * 3);
    gmat.uniforms.uScale.value = ctx.renderer.domElement.height * 0.5;
    kmat.uniforms.uScale.value = ctx.renderer.domElement.height * 0.5;
    const night = tod === 'night' ? 1 : tod === 'sunset' ? 0.55 : 0.25;

    // 잡기 진행
    if (catching && !catching.done && t - catching.t0 > 0.42) resolveCatch(t);
    if (netUntil > 0 && t > netUntil) {
      netUntil = -1;
      if (p.action === 'net') p.action = null;
      if (catching && !catching.done) resolveCatch(t);
    }
    // 잠자리채 휘두르기(아바타에 잠깐 붙인다)
    const host = p.avatar?.root ?? null;
    if (host && netHost !== host) { host.add(net); netHost = host; }
    if (netUntil > 0 && catching) {
      const k = THREE.MathUtils.clamp((t - catching.t0) / 0.38, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      net.visible = true;
      net.position.set(0.22, 0.62, 0.05);
      net.rotation.set(-2.3 + e * 3.55, 0, -0.25 + e * 0.15);
    } else net.visible = false;

    ptsN = 0; shN = 0; kN = 0;
    for (const s of slots) {
      const b = s.bug;
      if (!b) continue;
      const root = b.m.root;
      const sp = b.sp;
      const w = b.m.model.wing;
      if (b.state === 'gone') {
        root.visible = false;
        if (t > b.respawnAt) { s.n++; spawn(s); }
        continue;
      }
      const dx = s.anchor.pos.x - p.pos.x, dz = s.anchor.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      root.visible = dist < SHOW_DIST;
      if (!root.visible) continue;

      if (b.state === 'idle') {
        // 겁: 뛰거나 점프하며 다가오면 도망
        const pdx = b.pos.x - p.pos.x, pdz = b.pos.z - p.pos.z;
        const pd = Math.hypot(pdx, pdz);
        const shy = sp.shy ?? 1;
        const loud = p.speed > 6.3 || p.mode === 'air' || p.mode === 'glide';
        if (!(catching && catching.bug === b && !catching.done)) {
          if ((loud && pd < 4.2 * shy) || (p.speed > 4.2 && pd < 1.4 * shy && sp.rarity >= 4)) flee(b, t);
        }
      }

      if (b.state === 'flee') {
        const tau = t - b.fleeT0;
        const flier = FLIERS.has(sp.kind) || sp.spot === 'air';
        tmp.copy(b.fleeFrom).addScaledVector(b.fleeDir, tau * (flier ? 5.5 : 2.6));
        if (flier) tmp.y += tau * 2.6 + tau * tau * 0.8;
        else tmp.y = sp.spot === 'water' ? s.waterY : island.heightAt(tmp.x, tmp.z);
        b.pos.copy(tmp);
        root.position.copy(tmp);
        tmp2.copy(b.fleeDir); if (flier) tmp2.y = 0.5;
        root.quaternion.copy(lookQ(tmp2));
        if (w) setWings(b.m, w.rest * 0.2 + Math.sin(t * w.hz * Math.PI * 2) * Math.max(w.amp, 0.6));
        const fade = flier ? 1 : Math.max(0, 1 - Math.max(0, tau - 0.6) / 0.8);
        root.scale.setScalar(bugScale(sp) * Math.max(0.01, fade));
        if (tau > 2.4) { b.state = 'gone'; b.respawnAt = t + 45; root.scale.setScalar(bugScale(sp)); }
        continue;
      }

      // 대기 자세
      const kind = sp.kind;
      const flapT = t * (w?.hz ?? 0) * Math.PI * 2;
      if (s.spot === 'air') {
        airPath(b, t, tmp);
        airPath(b, t + 0.06, tmp2);
        tmp2.sub(tmp);
        if (tmp2.lengthSq() < 1e-6) tmp2.set(0, 0, 1);
        const bank = THREE.MathUtils.clamp(-tmp2.x * 0.0, -0.3, 0.3);
        root.position.copy(tmp);
        root.quaternion.copy(lookQ(tmp2.normalize(), bank));
        b.pos.copy(tmp);
        if (w) {
          if (kind === 'butterfly' || kind === 'moth') setWings(b.m, 0.12 + (0.5 + 0.5 * Math.sin(flapT)) * w.amp);
          else setWings(b.m, w.rest + Math.sin(flapT) * w.amp);
        }
      } else if (s.spot === 'ground' || s.spot === 'water') {
        groundPath(b, t, tmp);
        groundPath(b, t + 0.1, tmp2);
        tmp2.sub(tmp); tmp2.y = 0;
        if (tmp2.lengthSq() < 1e-8) tmp2.set(0, 0, 1);
        root.position.copy(tmp);
        root.quaternion.copy(lookQ(tmp2.normalize()));
        b.pos.copy(tmp);
        // 걸음 통통
        root.position.y += Math.abs(Math.sin(t * 9 + s.ph)) * 0.012;
      } else {
        // 꽃·그루터기·바위 위: 제자리 숨쉬기
        root.position.copy(s.anchor.pos);
        if (kind === 'bee' && s.spot === 'flower') {
          // 꽃 위를 맴도는 벌
          const a = t * 1.4 + s.ph;
          root.position.x += Math.cos(a) * 0.3;
          root.position.z += Math.sin(a) * 0.3;
          root.position.y += 0.22 + Math.sin(t * 2.3 + s.ph) * 0.06;
          tmp2.set(-Math.sin(a), 0, Math.cos(a));
          root.quaternion.copy(lookQ(tmp2));
          if (w) setWings(b.m, w.rest + Math.sin(flapT) * w.amp);
        } else {
          root.quaternion.copy(b.baseQ);
          const breathe = 1 + Math.sin(t * 2.2 + s.ph) * 0.025;
          root.scale.set(bugScale(sp), bugScale(sp) * breathe, bugScale(sp));
          if (w) setWings(b.m, w.rest + Math.sin(t * 1.4 + s.ph) * w.idleAmp);
        }
        b.pos.copy(root.position);
      }

      // 블롭 그림자 + 반짝이
      {
        const wsc = bugScale(sp);
        const flier = s.spot === 'air' || (kind === 'bee' && s.spot === 'flower');
        if (s.spot === 'ground' || flier) {
          shP.set(root.position.x, 0, root.position.z);
          const gy = island.heightAt(shP.x, shP.z);
          const wy = island.waterLevelAt(shP.x, shP.z);
          shP.y = Math.max(gy, Number.isFinite(wy) ? wy : -Infinity) + 0.03;
          const hAbove = Math.max(0, root.position.y - shP.y);
          if (hAbove < 5) pushShadow(shP, UPV, wsc * 0.8 * (flier ? Math.max(0.35, 0.8 - hAbove * 0.12) : 1));
        } else if (s.spot !== 'water') {
          shP.copy(root.position).addScaledVector(s.anchor.up, 0.012);
          pushShadow(shP, s.anchor.up, wsc * 0.75);
        }
        if (dist < 26) {
          const per = 2.2 + ((s.ph * 7.31) % 1) * 0.9;
          const ph = (t + s.ph) % per;
          if (ph < 0.75) {
            const e = Math.sin((ph / 0.75) * Math.PI);
            const perch = s.spot === 'tree' || s.spot === 'rock' || s.spot === 'flower';
            shP.copy(root.position).addScaledVector(perch ? s.anchor.up : UPV, b.m.model.height * wsc + 0.12 + ph * 0.18);
            shP.x += Math.sin(s.ph * 3.7) * wsc * 0.25;
            pushSpark(shP, (0.26 + wsc * 0.25) * e, 1.6 * e, ph * 1.8 + s.ph);
            if (ph > 0.15) {
              shP.x += Math.cos(s.ph * 5.1) * wsc * 0.45; shP.y -= wsc * 0.18;
              const e2 = Math.sin(((ph - 0.15) / 0.6) * Math.PI);
              pushSpark(shP, (0.14 + wsc * 0.12) * e2, 1.2 * e2, -ph * 2.4);
            }
          }
        }
      }

      // 빛
      const gm = b.m.model;
      if (gm.glow && gm.glowColor) {
        tmp.copy(gm.glow).multiplyScalar(bugScale(sp)).applyQuaternion(root.quaternion).add(root.position);
        const pulse = 0.65 + 0.35 * Math.sin(t * 3.1 + s.ph);
        pushGlow(tmp, gm.glowColor, 1.5 * pulse * (0.5 + night), 2.6 * night * pulse);
        if (kind === 'firefly' && night > 0.5) {
          // 같이 떠도는 작은 반딧불(못 잡는 배경 무리)
          swarmCol.copy(gm.glowColor);
          for (let i = 0; i < 14; i++) {
            const a = t * (0.25 + i * 0.03) + i * 2.4 + s.ph;
            tmp.set(
              s.anchor.pos.x + Math.sin(a) * (1.5 + (i % 3)) + Math.sin(a * 2.1) * 0.6,
              0,
              s.anchor.pos.z + Math.cos(a * 0.9) * (1.5 + (i % 4) * 0.7),
            );
            tmp.y = island.heightAt(tmp.x, tmp.z) + 0.5 + ((i * 0.37) % 1) * 1.6 + Math.sin(a * 1.3) * 0.3;
            const pk = Math.max(0, Math.sin(t * (1.7 + i * 0.13) + i));
            pushGlow(tmp, swarmCol, 0.7 + pk * 0.45, 0.35 + 2.2 * pk);
          }
        }
      }
    }
    // 빈 점은 치운다
    shadows.count = shN;
    shadows.instanceMatrix.needsUpdate = true;
    kgeo.setDrawRange(0, kN);
    for (const a of ['position', 'color', 'size', 'rot']) (kgeo.attributes[a] as THREE.BufferAttribute).needsUpdate = true;
    ggeo.setDrawRange(0, ptsN);
    (ggeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (ggeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (ggeo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  });

  // 촬영·디버그: 종 진열(플레이어 앞 격자) — node scripts/shot.mjs --eval "__insects.gallery(0, 12)"
  const gal = new THREE.Group();
  root.add(gal);
  (window as unknown as { __insects?: unknown }).__insects = {
    slots,
    species: INSECTS,
    gallery(from = 0, count = 12, cols = 4, gap = 0.95, mag = 0) {
      gal.clear();
      const p = g.player.pos;
      const yaw = g.cam.yaw;
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      INSECTS.slice(from, from + count).forEach((sp, i) => {
        const sc = mag ? sp.size * mag : bugScale(sp);
        const b = makeBug(sp, sc);
        const r = Math.floor(i / cols), c = i % cols;
        const pos = p.clone().addScaledVector(fwd, 1.2 + r * gap).addScaledVector(right, (c - (cols - 1) / 2) * gap);
        pos.y = island.heightAt(pos.x, pos.z) + (FLIERS.has(sp.kind) && sp.kind !== 'firefly' ? 0.15 : 0.02);
        b.root.position.copy(pos);
        b.root.rotation.y = yaw + 0.35;
        if (b.model.wing) setWings(b, sp.kind === 'butterfly' || sp.kind === 'moth' ? 0.45 : b.model.wing.rest);
        const sh = new THREE.Mesh(shadowGeo, shadowMat);
        sh.position.set(pos.x, island.heightAt(pos.x, pos.z) + 0.03, pos.z);
        sh.scale.set(sc * 0.8, 1, sc * 0.7);
        applyCurve(sh);
        applyCurve(b.root);
        gal.add(sh, b.root);
      });
      return INSECTS.slice(from, from + count).map((s) => s.name).join(', ');
    },
  };

  return root;
}
