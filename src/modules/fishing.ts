// 낚시: 물가에서 E → 낚싯대·찌 → 물고기 그림자가 다가와 톡톡 → "!" 순간 E → 잡았다(머리 위 들기 + 배너 + 말장난).
// 물 위 물고기 그림자는 플레이어 주변 물에 청크로 흘려 보낸다(바다 멀리는 큰 그림자).
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import { applyCurve } from '../core/curve';
import { FISH, FISH_BY_ID, PUNS, timeMatches, type FishSpecies, type Habitat } from './fishing/data';
import { buildFishModel, displayScale, disposeModel } from './fishing/model';

export const order = 30;

const RARITY_W = [0, 50, 26, 13, 5, 1.6];
const BITE_WINDOW = [0, 0.95, 0.85, 0.72, 0.6, 0.5];

// ───── 캔버스 텍스처 ─────
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const shadowTex = canvasTex(256, 128, (g) => {
  g.filter = 'blur(6px)';
  g.fillStyle = '#06263c';
  g.beginPath(); g.ellipse(120, 64, 70, 30, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(60, 64); g.quadraticCurveTo(40, 44, 20, 38); g.quadraticCurveTo(30, 64, 20, 90); g.quadraticCurveTo(40, 84, 60, 64); g.fill();
});
const ringTex = canvasTex(256, 256, (g) => {
  g.filter = 'blur(2px)';
  g.strokeStyle = '#ffffff'; g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
});
const bangTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#6b4a2b'; g.lineWidth = 10;
  g.beginPath();
  g.ellipse(128, 118, 96, 92, 0, 0, Math.PI * 2);
  g.fill(); g.stroke();
  g.beginPath(); g.moveTo(98, 196); g.lineTo(128, 238); g.lineTo(140, 200); g.closePath(); g.fill();
  g.font = 'bold 150px Jua, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = '#ffffff';
  g.fillStyle = '#ff5a6a';
  g.fillText('!', 128, 124);
});
const dotsTex = canvasTex(256, 128, (g) => {
  g.fillStyle = '#fffaf0';
  g.strokeStyle = '#c9a77a'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(14, 14, 228, 96, 46); g.fill(); g.stroke();
  g.fillStyle = '#8a6a4a';
  for (const x of [78, 128, 178]) { g.beginPath(); g.arc(x, 62, 13, 0, Math.PI * 2); g.fill(); }
});
const sparkTex = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 60);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,180,0.9)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(64, 4); g.quadraticCurveTo(70, 58, 124, 64); g.quadraticCurveTo(70, 70, 64, 124); g.quadraticCurveTo(58, 70, 4, 64); g.quadraticCurveTo(58, 58, 64, 4); g.fill();
});

// ───── 공유 지오메트리·재질 ─────
const planeGeo = new THREE.PlaneGeometry(1, 0.5).rotateX(-Math.PI / 2);
planeGeo.userData.shared = true;
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.62, depthWrite: false });
const ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** 물고기 그림자 크기(m): 몸 길이에서 */
function shadowLen(sp: FishSpecies): number {
  const cm = (sp.size[0] + sp.size[1]) / 2;
  return THREE.MathUtils.clamp(0.35 + Math.log2(1 + cm / 20) * 0.38, 0.35, 3.2);
}

type Phase = 'idle' | 'cast' | 'approach' | 'nibble' | 'bite' | 'reel' | 'catch' | 'miss';

interface AmbientSet { mesh: THREE.InstancedMesh; fish: Array<{ x: number; z: number; y: number; rx: number; rz: number; ph: number; sp: number; s: number }> }

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

  // ── 물 판정 ──
  const waterAt = (x: number, z: number): number | null => {
    const wl = island.waterLevelAt(x, z);
    if (!Number.isFinite(wl)) return null;
    if (wl - island.heightAt(x, z) < 0.35) return null;
    return wl;
  };

  const habitatAt = (x: number, z: number): Habitat[] => {
    const s = island.surfaceAt(x, z);
    if (s.kind === 'river' || (s.coastDist > 0 && Number.isFinite(island.waterLevelAt(x, z)))) return ['river', 'lake', 'pond'];
    const off = -s.coastDist;
    if (off > 520) return ['deep', 'offshore'];
    if (off > 220) return ['offshore', 'deep'];
    const d = s.island ? island.islandById(s.island) : undefined;
    const theme = d?.theme ?? 'home';
    const near: Habitat[] = theme === 'ice' ? ['ice', 'coast'] : theme === 'desert' ? ['oasis', 'coast'] : theme === 'dino' ? ['hotspring', 'coast']
      : theme === 'coral' ? ['reef', 'coast'] : theme === 'mushroom' ? ['pond', 'lake', 'coast'] : ['coast'];
    if (off > 90) near.push('offshore');
    return near;
  };

  const pickSpecies = (habs: Habitat[], r: () => number): FishSpecies => {
    let cands = FISH.filter((f) => f.hab.some((h) => habs.includes(h)) && timeMatches(f.time, tod));
    if (!cands.length) cands = FISH.filter((f) => f.hab.some((h) => habs.includes(h)));
    if (!cands.length) cands = FISH;
    const w = cands.map((f) => RARITY_W[f.rarity] * (f.hab.includes(habs[0]) ? 1.4 : 1));
    let sum = w.reduce((a, b) => a + b, 0) * r();
    for (let i = 0; i < cands.length; i++) { sum -= w[i]; if (sum <= 0) return cands[i]; }
    return cands[cands.length - 1];
  };

  // ── 주변 물고기 그림자(청크) ──
  const ambient = new Set<AmbientSet>();
  game.chunks.add({
    key: 'fishing-shadows', size: 96, radius: 140,
    build: ({ cx, cz, x0, z0, size }) => {
      const r = ctx.rng(`fishing-shadows:${cx},${cz}`);
      const fish: AmbientSet['fish'] = [];
      for (let i = 0; i < 40 && fish.length < 12; i++) {
        const x = x0 + r() * size, z = z0 + r() * size;
        const wl = waterAt(x, z);
        if (wl === null) continue;
        const s = island.surfaceAt(x, z);
        const off = Math.max(0, -s.coastDist);
        const river = s.kind === 'river' || s.coastDist > 0;
        const base = river ? 0.6 + r() * 0.4 : 0.5 + r() * 0.6 + Math.min(2.4, off / 160) * (0.4 + r());
        fish.push({ x, z, y: wl + 0.1, rx: river ? 0.8 : 2 + r() * 3, rz: river ? 0.4 : 1.5 + r() * 2, ph: r() * 6.28, sp: 0.15 + r() * 0.2, s: base });
        if (river && fish.length >= 5) break;
      }
      if (!fish.length) return null;
      const mesh = new THREE.InstancedMesh(planeGeo, shadowMat, fish.length);
      mesh.frustumCulled = false;
      mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.renderOrder = 4;
      const set: AmbientSet = { mesh, fish };
      mesh.userData.fishSet = set;
      ambient.add(set);
      updateAmbient(set, game.time);
      return mesh;
    },
    dispose: (o) => { ambient.delete(o.userData.fishSet as AmbientSet); (o as THREE.InstancedMesh).dispose(); },
  });
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function updateAmbient(set: AmbientSet, t: number) {
    set.fish.forEach((f, i) => {
      const a = f.ph + t * f.sp;
      const x = f.x + Math.cos(a) * f.rx, z = f.z + Math.sin(a * 1.3) * f.rz;
      const vx = -Math.sin(a) * f.rx, vz = Math.cos(a * 1.3) * 1.3 * f.rz;
      tmpQ.setFromAxisAngle(UP, Math.atan2(-vz, vx));
      tmpS.set(f.s * (1 + 0.04 * Math.sin(t * 6 + f.ph)), 1, f.s);
      tmpP.set(x, f.y, z);
      set.mesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
    });
    set.mesh.instanceMatrix.needsUpdate = true;
  }

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
  {
    const red = new THREE.MeshPhysicalMaterial({ color: '#ff5a6a', roughness: 0.3, clearcoat: 1, emissive: '#ff5a6a', emissiveIntensity: 0.15 });
    const white = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 1, emissive: '#ffffff', emissiveIntensity: 0.1 });
    const topG = new THREE.SphereGeometry(0.11, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const botG = new THREE.SphereGeometry(0.11, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    bobber.add(new THREE.Mesh(topG, red), new THREE.Mesh(botG, white));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), red); stick.position.y = 0.15; bobber.add(stick);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), white); ball.position.y = 0.22; bobber.add(ball);
  }
  bobber.visible = false;
  root.add(bobber);

  const lineGeo = new THREE.BufferGeometry();
  const LINE_N = 24;
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(LINE_N * 3), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }));
  line.frustumCulled = false;
  line.visible = false;
  root.add(line);

  const target = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.85, depthWrite: false }));
  target.renderOrder = 4;
  target.visible = false;
  root.add(target);

  const rings = Array.from({ length: 5 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, depthWrite: false }));
    m.renderOrder = 5; m.visible = false; root.add(m);
    return { m, born: -99, x: 0, z: 0, y: 0, big: 1 };
  });
  let ringI = 0;
  const ripple = (x: number, y: number, z: number, big = 1) => {
    const r = rings[ringI++ % rings.length];
    r.born = game.time; r.x = x; r.y = y + 0.03; r.z = z; r.big = big; r.m.visible = true;
  };

  const bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: bangTex, depthTest: false, transparent: true }));
  bang.scale.set(0.7, 0.7, 1); bang.renderOrder = 10; bang.visible = false; root.add(bang);
  const dots = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotsTex, depthTest: false, transparent: true }));
  dots.scale.set(0.7, 0.35, 1); dots.renderOrder = 10; dots.visible = false; root.add(dots);

  // 반짝이(희귀도 연출)
  const SPARK_N = 60;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARK_N * 3), 3));
  const sparkMat = new THREE.PointsMaterial({ map: sparkTex, size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe9a8' });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false; sparks.visible = false; root.add(sparks);
  const sparkSeed = Array.from({ length: SPARK_N }, (_, i) => ({ a: (i * 2.399) % 6.283, r: 0.4 + ((i * 0.618) % 1) * 1.2, v: 0.6 + ((i * 0.37) % 1) * 1.4, h: (i * 0.13) % 1 }));
  let sparkBorn = -99, sparkLevel = 0;

  // 화면 반짝(전설)
  const flashEl = document.createElement('div');
  flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5;display:none;';
  let flashTimer = 0;
  document.body.appendChild(flashEl);
  const flash = (level: number) => {
    flashEl.style.background = level >= 5
      ? 'radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0) 22%, rgba(255,236,170,0.45) 48%, rgba(255,190,120,0.8) 78%, rgba(255,150,200,0.9) 100%)'
      : 'radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0) 30%, rgba(210,240,255,0.4) 60%, rgba(180,220,255,0.7) 100%)';
    flashEl.style.transition = 'none';
    flashEl.style.display = 'block';
    flashEl.style.opacity = '0.85';
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => { flashEl.style.display = 'none'; }, 1800);
    requestAnimationFrame(() => requestAnimationFrame(() => { flashEl.style.transition = 'opacity 1.4s ease-out'; flashEl.style.opacity = '0'; }));
  };

  // ── 상태 ──
  const S = {
    phase: 'idle' as Phase, t0: 0, cast: new THREE.Vector3(), waterY: 0, sp: null as FishSpecies | null, size: 0,
    from: new THREE.Vector3(), nibbles: 0, nibbleAt: 0, approachDur: 3, frozen: false,
  };

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

  const handPos = () => {
    const p = game.player;
    const f = p.facing();
    const right = new THREE.Vector3(-f.z, 0, f.x);
    return p.pos.clone().addScaledVector(right, 0.24).addScaledVector(f, 0.18).add(new THREE.Vector3(0, 0.55, 0));
  };

  /** 바라보는 앞 물 위 찌 자리 */
  const castPointFor = (pl: Game['player']): { p: THREE.Vector3; wy: number } | null => {
    const f = pl.facing();
    for (const d of [4.2, 3.4, 2.6, 5.2]) {
      const x = pl.pos.x + f.x * d, z = pl.pos.z + f.z * d;
      const wy = waterAt(x, z);
      if (wy !== null) return { p: new THREE.Vector3(x, wy, z), wy };
    }
    return null;
  };

  const start = (force?: { p: THREE.Vector3; wy: number }) => {
    const pl = game.player;
    const cp = force ?? castPointFor(pl);
    if (!cp) return false;
    S.cast.copy(cp.p); S.waterY = cp.wy;
    S.phase = 'cast'; S.t0 = game.time;
    S.sp = pickSpecies(habitatAt(cp.p.x, cp.p.z), rng);
    S.size = Math.round((S.sp.size[0] + (S.sp.size[1] - S.sp.size[0]) * Math.pow(rng(), 1.6)) * 10) / 10;
    S.nibbles = 1 + Math.floor(rng() * 3);
    S.approachDur = 2.2 + rng() * 2.4;
    const a = rng() * Math.PI * 2;
    const L = shadowLen(S.sp) * (S.sp.hab.includes('offshore') || S.sp.hab.includes('deep') ? 1.4 : 1);
    S.from.set(cp.p.x + Math.cos(a) * (2.6 + L), cp.wy, cp.p.z + Math.sin(a) * (2.6 + L));
    // 찌 자리가 물 밖이면 가깝게
    if (waterAt(S.from.x, S.from.z) === null) S.from.lerp(cp.p, 0.6);
    target.scale.set(L, 1, L);
    pl.action = 'fish'; pl.locked = true;
    rod.visible = true; line.visible = true; bobber.visible = true;
    return true;
  };

  const end = () => {
    S.phase = 'idle';
    rod.visible = line.visible = bobber.visible = target.visible = bang.visible = dots.visible = false;
    setAvatarLine(true);
    game.player.action = null; game.player.locked = false;
  };

  const success = () => {
    const sp = S.sp!;
    S.phase = 'catch'; S.t0 = game.time;
    bobber.visible = false; target.visible = false; bang.visible = false; line.visible = false;
    ripple(S.cast.x, S.waterY, S.cast.z, 1.6); ripple(S.cast.x, S.waterY, S.cast.z, 1);
    const model = buildFishModel(sp);
    const holder = new THREE.Group();
    const sc = displayScale(sp, S.size);
    model.scale.setScalar(sc);
    model.rotation.y = 0;
    // 머리 위에 얹히게: 모델 바닥을 손잡이 자리 위로
    const bb = new THREE.Box3().setFromObject(model);
    model.position.y = -bb.min.y * 0.55;
    holder.add(model);
    applyCurve(holder);
    const lines = PUNS[sp.rarity] ?? PUNS[1];
    const pun = lines[Math.floor(rng() * lines.length)].replace('{n}', sp.name);
    game.ui.showCatch({ species: sp, sizeText: `${S.size}cm`, model: holder, line: pun });
    game.player.action = 'fish-catch';
    if (sp.rarity >= 3) { sparkBorn = game.time; sparkLevel = sp.rarity; }
    if (sp.rarity >= 4) flash(sp.rarity);
    // 들고 있는 동안 모델이 사라지면 정리
    const cleanup = () => { if (!holder.parent) { disposeModel(holder); return; } setTimeout(cleanup, 1000); };
    setTimeout(cleanup, 4000);
  };

  const fail = (msg: string) => {
    S.phase = 'miss'; S.t0 = game.time;
    bang.visible = false; dots.visible = false;
    ripple(target.position.x, S.waterY, target.position.z, 1.2);
    game.ui.toast(msg);
  };

  // ── 상호작용 ──
  game.addProvider('fishing', (pl) => {
    if (S.phase !== 'idle' || pl.mounted || pl.mode !== 'ground' || pl.action) return null;
    // 발밑이 물이면 안 됨
    if (Number.isFinite(island.waterLevelAt(pl.pos.x, pl.pos.z)) && island.waterLevelAt(pl.pos.x, pl.pos.z) > pl.pos.y + 0.2) return null;
    const cp = castPointFor(pl);
    if (!cp) return null;
    return { label: '낚시하기', dist: 1.6, use: () => { start(cp); } };
  });

  // ── 매 프레임 ──
  const v = new THREE.Vector3();
  game.onUpdate((t, dt) => {
    for (const set of ambient) updateAmbient(set, t);
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
    // 반짝이
    if (t - sparkBorn < 2.6 && t >= sparkBorn) {
      sparks.visible = true;
      const age = t - sparkBorn;
      const pa = sparkGeo.attributes.position as THREE.BufferAttribute;
      const n = sparkLevel >= 5 ? SPARK_N : sparkLevel >= 4 ? 40 : 24;
      const p = game.player.pos;
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

    if (S.phase === 'idle') return;
    const pl = game.player;
    const inp = game.input;
    const age = t - S.t0;

    // 낚싯대: 오른손에서 앞으로 기울여 든다
    const hp = handPos();
    rod.position.copy(hp);
    const f = pl.facing();
    const yaw = Math.atan2(f.x, f.z);
    let pitch = 0.95; // 앞으로 기울기(라디안, 0 = 똑바로 위)
    if (S.phase === 'cast') pitch = age < 0.18 ? 0.95 - (age / 0.18) * 1.3 : -0.35 + Math.min(1, (age - 0.18) / 0.3) * 1.3;
    if (S.phase === 'nibble') pitch = 0.95 + 0.04 * Math.sin(t * 20);
    if (S.phase === 'bite') pitch = 1.05 + 0.06 * Math.sin(t * 40);
    if (S.phase === 'catch') pitch = Math.max(0.2, 0.95 - age * 3);
    rod.rotation.set(0, 0, 0);
    rod.rotateY(yaw);
    rod.rotateX(pitch);
    rod.updateMatrixWorld(true);
    const ar = findAvatarRod();
    let tip: THREE.Vector3;
    if (S.phase === 'catch') {
      rod.visible = false;
      tip = new THREE.Vector3().setFromMatrixPosition(rodTip.matrixWorld);
    } else if (ar && ar.root.visible) {
      rod.visible = false;
      setAvatarLine(false);
      ar.tip.updateWorldMatrix(true, false);
      tip = new THREE.Vector3().setFromMatrixPosition(ar.tip.matrixWorld);
    } else {
      rod.visible = S.phase !== 'miss' || age < 1;
      tip = new THREE.Vector3().setFromMatrixPosition(rodTip.matrixWorld);
    }

    // 찌 위치
    let bob = S.cast.clone();
    bob.y = S.waterY + 0.02 + 0.025 * Math.sin(t * 2.4);
    if (S.phase === 'cast') {
      const k = Math.min(1, Math.max(0, (age - 0.25) / 0.55));
      bob = tip.clone().lerp(S.cast, k);
      bob.y += Math.sin(k * Math.PI) * 1.6 - (1 - k) * 0.4;
      if (k >= 1 && !S.frozen) { S.phase = 'approach'; S.t0 = t; ripple(S.cast.x, S.waterY, S.cast.z, 0.7); target.visible = true; }
    }
    // 물고기 그림자
    if (S.phase === 'approach' || S.phase === 'nibble' || S.phase === 'bite' || S.phase === 'miss') {
      const L = target.scale.x;
      const toward = S.cast.clone().sub(S.from); toward.y = 0;
      const stopAt = S.cast.clone().addScaledVector(toward.clone().normalize(), -L * 0.5);
      let pos: THREE.Vector3;
      if (S.phase === 'approach') {
        const k = Math.min(1, (t - S.t0) / S.approachDur);
        const e = 1 - Math.pow(1 - k, 2);
        pos = S.from.clone().lerp(stopAt, e);
        pos.addScaledVector(new THREE.Vector3(-toward.z, 0, toward.x).normalize(), Math.sin(t * 3) * 0.25 * (1 - e));
        if (k >= 1 && !S.frozen) { S.phase = 'nibble'; S.t0 = t; S.nibbleAt = t + 0.5 + rng() * 0.6; }
      } else if (S.phase === 'miss') {
        pos = stopAt.clone().addScaledVector(toward.clone().normalize(), -age * 6);
      } else {
        pos = stopAt.clone().addScaledVector(toward.clone().normalize(), S.phase === 'bite' ? L * 0.2 : 0.06 * Math.max(0, Math.sin(t * 9)));
      }
      target.position.set(pos.x, S.waterY + 0.1, pos.z);
      target.rotation.y = Math.atan2(-toward.z, toward.x);
      (target.material as THREE.MeshBasicMaterial).opacity = S.phase === 'miss' ? Math.max(0, 0.85 - age * 0.85) : 0.85;
      if (S.phase === 'miss' && age > 1.2) end();
    }
    // 톡톡
    if (S.phase === 'nibble') {
      dots.visible = true;
      dots.position.copy(pl.pos).add(new THREE.Vector3(0, 2.05, 0));
      const since = t - (S.nibbleAt - 0.9);
      const dip = since > 0.9 && since < 1.05 ? 0.06 : 0;
      bob.y -= dip;
      if (!S.frozen && t > S.nibbleAt) {
        ripple(S.cast.x, S.waterY, S.cast.z, 0.5);
        S.nibbles--;
        S.nibbleAt = t + 0.8 + rng() * 0.7;
        if (S.nibbles <= 0) { S.phase = 'bite'; S.t0 = t; ripple(S.cast.x, S.waterY, S.cast.z, 1.3); ripple(S.cast.x, S.waterY, S.cast.z, 0.6); dots.visible = false; }
      }
      if (inp.hit('KeyE') && !S.frozen) { dots.visible = false; fail('앗, 너무 빨랐다! 물고기가 도망갔다…'); }
    }
    if (S.phase === 'bite') {
      bang.visible = true;
      const bage = t - S.t0;
      const pop = Math.min(1, bage / 0.08);
      bang.scale.setScalar(0.75 * (0.6 + 0.4 * pop) * (1 + 0.06 * Math.sin(t * 30)));
      bang.position.copy(pl.pos).add(new THREE.Vector3(0, 2.15, 0));
      bob.y = S.waterY - 0.16;
      const win = BITE_WINDOW[S.sp!.rarity];
      if (inp.hit('KeyE')) success();
      else if (!S.frozen && bage > win) fail('놓쳤다… 물고기가 도망갔다!');
    }
    if (S.phase === 'catch') {
      if (t - S.t0 > 1.6) end();
    }
    // 그만두기
    if ((S.phase === 'approach' || S.phase === 'cast') && (inp.hit('Escape') || inp.hit('KeyE'))) {
      if (S.phase === 'approach' && inp.hit('KeyE')) fail('앗, 너무 빨랐다! 물고기가 도망갔다…');
      else end();
    }
    if ((S.phase as Phase) !== 'idle' && S.phase !== 'catch' && inp.hit('Escape')) end();
    void dt;

    // 찌·줄
    bobber.position.copy(bob);
    bobber.rotation.z = S.phase === 'nibble' ? 0.25 * Math.sin(t * 14) : 0.06 * Math.sin(t * 1.7);
    const pa = lineGeo.attributes.position as THREE.BufferAttribute;
    const sag = S.phase === 'bite' ? 0.05 : S.phase === 'cast' ? 0.1 : 0.45;
    for (let i = 0; i < LINE_N; i++) {
      const k = i / (LINE_N - 1);
      v.copy(tip).lerp(bob.clone().add(new THREE.Vector3(0, 0.22, 0)), k);
      v.y -= Math.sin(k * Math.PI) * sag * Math.min(1, tip.distanceTo(bob) / 3);
      pa.setXYZ(i, v.x, v.y, v.z);
    }
    pa.needsUpdate = true;
  });

  // ── 디버그(촬영용) ──
  const gallery = new THREE.Group();
  root.add(gallery);
  const placeFacing = (wx: number, wz: number) => {
    // 물(wx,wz) 쪽을 보며 설 물가 자리
    for (let rr = 2.6; rr < 7; rr += 0.4) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = wx + Math.cos(a) * rr, z = wz + Math.sin(a) * rr;
      if (Number.isFinite(island.waterLevelAt(x, z))) continue;
      const s = island.surfaceAt(x, z);
      if (s.kind === 'cliff' || s.kind === 'sea') continue;
      game.player.teleport(x, z);
      game.player.yaw = Math.atan2(-(wx - x), -(wz - z));
      return true;
    }
    return false;
  };
  const W = window as unknown as Record<string, unknown>;
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
    /** 물가로 가서 물 쪽을 본다(기본: 마을 강 낚시 포인트) */
    goto: (wx = island.HERO.fishing.x, wz = island.HERO.fishing.z, camSide = 0.9) => {
      const ok = placeFacing(wx, wz);
      game.cam.yaw = game.player.yaw + camSide;
      return ok;
    },
    /** 섬 해안: 섬 중심에서 바깥으로 가다 처음 만나는 바다 + 물가에 선다 */
    gotoCoast: (id = 'coral', ang = 3.6, camSide = 0.9) => {
      const d = island.islandById(id);
      if (!d) return false;
      let wx = d.x, wz = d.z;
      for (let r = d.r * 0.5; r < d.r * 2; r += 2) { wx = d.x + Math.cos(ang) * r; wz = d.z + Math.sin(ang) * r; if (waterAt(wx, wz) !== null && waterAt(wx + Math.cos(ang) * 4, wz + Math.sin(ang) * 4) !== null) break; }
      const ok = placeFacing(wx + Math.cos(ang) * 1.5, wz + Math.sin(ang) * 1.5);
      game.cam.yaw = game.player.yaw + camSide;
      return ok;
    },
    start: (fast = false) => { const ok = start(); if (ok && fast) { S.approachDur = 0.6; S.nibbles = 1; } return ok; },
    /** 장면 고정: 'cast'|'approach'|'nibble'|'bite' 단계에서 멈춘 그림 */
    pose: (phase: Phase, id?: string) => {
      if (S.phase === 'idle' && !start()) return 'no water ahead';
      if (id && FISH_BY_ID.has(id)) S.sp = FISH_BY_ID.get(id)!;
      const L = shadowLen(S.sp!); target.scale.set(L, 1, L);
      S.frozen = true; S.phase = phase; target.visible = phase !== 'cast';
      S.t0 = game.time - (phase === 'approach' ? S.approachDur * 0.6 : phase === 'cast' ? 0.5 : 0.04);
      if (phase === 'nibble') S.nibbleAt = game.time + 0.4;
      ripple(S.cast.x, S.waterY, S.cast.z, 0.8);
      rings[(ringI - 1) % rings.length].born = game.time - 0.35;
      return S.sp!.name;
    },
    /** 바로 잡기 */
    catchNow: (id?: string, size?: number) => {
      if (S.phase === 'idle') start();
      if (id) { const sp = FISH_BY_ID.get(id.startsWith('fish-') ? id : 'fish-' + id); if (sp) S.sp = sp; }
      if (!S.sp) S.sp = FISH[0];
      if (size) S.size = size; else S.size = S.sp.size[1];
      success();
      if (game.time === S.t0 && S.sp.rarity >= 3) sparkBorn = game.time - 0.6;
      return S.sp.name;
    },
    stop: () => end(),
    state: () => ({ phase: S.phase, fish: S.sp?.name, size: S.size }),
  };

  return root;
}
