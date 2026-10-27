// 이야기 연출 조각 — 별똥별(머리 + 꼬리) · 쾅 반짝(빛 공 + 고리 + 별 튀기) · 구덩이(도톰 도넛 + 별똥별 돌) ·
// 수평선 목표 빛기둥 · 불꽃놀이(구 파티클) · 말풍선 스프라이트. 시간 t 만으로 모양이 정해지는 함수형 — 촬영 모드(dt 0)에서도 같은 그림.
import * as THREE from 'three';
import { PALETTE } from '../../core/art';
import { starGeometry, starMaterial } from './toto';

const shared = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(x: T): T => { x.userData.shared = true; return x; };
const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

/** 빛나는(조명 무시·안개 무시) 재질 */
function glowMat(color: string, opacity = 1, additive = false): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1 || additive, opacity, depthWrite: !(opacity < 1 || additive), fog: false });
  if (additive) m.blending = THREE.AdditiveBlending;
  m.toneMapped = false;
  return m;
}

let sphereGeo: THREE.SphereGeometry | null = null;
const sphere = () => sphereGeo ?? (sphereGeo = shared(new THREE.SphereGeometry(1, 16, 12)));

/** 가운데 밝은 둥근 빛 텍스처 */
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  let t: THREE.Texture;
  if (hasDom()) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,246,210,0.85)');
    gr.addColorStop(0.6, 'rgba(255,210,240,0.25)');
    gr.addColorStop(1, 'rgba(255,200,240,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c);
  } else {
    t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    t.needsUpdate = true;
  }
  t.colorSpace = THREE.SRGBColorSpace;
  return (glowTex = shared(t));
}
/** 둥근 빛 스프라이트(덧셈 섞기) */
export function glowSprite(color: string, size: number): THREE.Sprite {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.toneMapped = false;
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.renderOrder = 5;
  return s;
}

// ───────────── 별똥별 ─────────────
const TRAIL_N = 26;
export interface MeteorFx {
  root: THREE.Group;
  /** head 위치(부모 좌표), 지난 길(최근 → 오래된 순)로 꼬리를 그린다. on=false 면 숨김 */
  set(on: boolean, head: THREE.Vector3, trail: THREE.Vector3[], t: number, camDist?: number): void;
}
export function buildMeteor(): MeteorFx {
  const root = new THREE.Group();
  root.name = 'story-meteor';
  const head = new THREE.Mesh(sphere(), glowMat('#fffbe8'));
  head.scale.setScalar(2.6);
  const halo = glowSprite('#ffe9a8', 18);
  const halo2 = glowSprite('#ffb8e6', 30);
  root.add(head, halo, halo2);
  // 꼬리: 구 인스턴스(앞은 크고 노랑, 뒤로 갈수록 작고 분홍 → 라벤더)
  const trailMesh = new THREE.InstancedMesh(sphere(), glowMat('#ffffff', 0.9, true), TRAIL_N);
  trailMesh.frustumCulled = false;
  const cA = new THREE.Color('#fff2a8'), cB = new THREE.Color(PALETTE.pink), cC = new THREE.Color(PALETTE.lavender);
  for (let i = 0; i < TRAIL_N; i++) {
    const u = i / (TRAIL_N - 1);
    const c = u < 0.5 ? cA.clone().lerp(cB, u * 2) : cB.clone().lerp(cC, (u - 0.5) * 2);
    trailMesh.setColorAt(i, c);
  }
  root.add(trailMesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const set = (on: boolean, h: THREE.Vector3, trail: THREE.Vector3[], t: number, camDist = 300) => {
    root.visible = on;
    if (!on) return;
    head.position.copy(h);
    halo.position.copy(h);
    halo2.position.copy(h);
    const fl = 1 + 0.12 * Math.sin(t * 37);
    // 가까워져도 화면을 덮지 않게: 빛 번짐 크기는 거리에 비례(각도 일정)
    const k = Math.min(1, Math.max(0.15, camDist / 300));
    // 멀리 있을 땐 머리·꼬리를 키워서 줄무늬가 또렷하게
    const big = Math.max(1, camDist / 160);
    head.scale.setScalar(2.6 * big);
    halo.scale.setScalar(18 * fl * k);
    halo2.scale.setScalar(30 * fl * k);
    (halo2.material as THREE.SpriteMaterial).opacity = 0.55;
    for (let i = 0; i < TRAIL_N; i++) {
      const p = trail[Math.min(trail.length - 1, i)] ?? h;
      const u = i / (TRAIL_N - 1);
      sc.setScalar((2.6 * (1 - u) ** 1.1 + 0.2) * big);
      m4.compose(p, q, sc);
      trailMesh.setMatrixAt(i, m4);
    }
    trailMesh.instanceMatrix.needsUpdate = true;
  };
  set(false, new THREE.Vector3(), [], 0);
  return { root, set };
}

// ───────────── 쾅 반짝 ─────────────
const BURST_N = 36;
export interface ImpactFx {
  root: THREE.Group;
  /** age = 쾅 뒤 지난 초(음수 = 아직) */
  set(age: number): void;
}
export function buildImpact(rng: () => number): ImpactFx {
  const root = new THREE.Group();
  root.name = 'story-impact';
  const flash = new THREE.Mesh(sphere(), glowMat('#fff6d0', 1, true));
  const flashS = glowSprite('#fff0b0', 1);
  const ringM = glowMat('#ffd6f0', 0.8, true);
  ringM.side = THREE.DoubleSide;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 40), ringM);
  ring.rotation.x = Math.PI / 2;
  root.add(flash, flashS, ring);
  // 튀는 별(금·분홍·하늘)
  const burst = new THREE.InstancedMesh(starGeometry(), glowMat('#ffffff'), BURST_N);
  burst.frustumCulled = false;
  const cols = ['#ffe58a', '#ffb3d1', '#bfe6ff', '#d8c8ff', '#fff6c8'].map((c) => new THREE.Color(c));
  const dirs: Array<{ v: THREE.Vector3; spin: number; s: number }> = [];
  for (let i = 0; i < BURST_N; i++) {
    const a = rng() * Math.PI * 2, up = 0.45 + rng() * 0.9, sp = 3 + rng() * 5;
    dirs.push({ v: new THREE.Vector3(Math.cos(a) * sp, up * sp * 1.2, Math.sin(a) * sp), spin: (rng() - 0.5) * 12, s: 0.25 + rng() * 0.3 });
    burst.setColorAt(i, cols[i % cols.length]);
  }
  root.add(burst);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const set = (age: number) => {
    root.visible = age >= 0 && age < 3.2;
    if (!root.visible) return;
    const f = Math.min(1, age / 0.25);
    const fade = Math.max(0, 1 - age / 0.9);
    flash.scale.setScalar(0.5 + f * 3.2);
    (flash.material as THREE.MeshBasicMaterial).opacity = fade * 0.6;
    flashS.scale.setScalar(4 + f * 22);
    (flashS.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - age / 1.4);
    ring.scale.setScalar(1 + age * 9);
    ringM.opacity = Math.max(0, 0.85 - age * 0.7);
    for (let i = 0; i < BURST_N; i++) {
      const d = dirs[i];
      const tt = Math.min(age, 2.4);
      p.set(d.v.x * tt, Math.max(0.15, d.v.y * tt - 4.5 * tt * tt), d.v.z * tt);
      e.set(0, 0, d.spin * tt);
      q.setFromEuler(e);
      const k = age < 2.2 ? 1 : Math.max(0, 1 - (age - 2.2) / 0.9);
      sc.setScalar(d.s * k);
      m4.compose(p, q, sc);
      burst.setMatrixAt(i, m4);
    }
    burst.instanceMatrix.needsUpdate = true;
  };
  set(-1);
  return { root, set };
}

// ───────────── 구덩이 + 별똥별 돌 ─────────────
export interface CraterFx {
  root: THREE.Group;
  /** 별똥별 돌(갈라지면 두 쪽) */
  rock: THREE.Group;
  halves: [THREE.Object3D, THREE.Object3D];
  glow: THREE.Sprite;
  /** 0 = 안 보임 ~ 1 = 다 생김(쾅 직후 커진다) · crack 0..1 갈라짐 · t 시간 */
  set(appear: number, crack: number, t: number): void;
}
export function buildCrater(rng: () => number): CraterFx {
  const root = new THREE.Group();
  root.name = 'story-crater';
  // 도톰한 테두리(도넛) — 흙색 + 위가 살짝 밝게
  const rimM = new THREE.MeshStandardMaterial({ color: '#d9b98a', roughness: 0.9 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.55, 14, 40), rimM);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1, 1, 0.6);
  rim.position.y = 0.12;
  rim.receiveShadow = true;
  rim.castShadow = true;
  root.add(rim);
  // 바닥(움푹, 별빛 라벤더 흙)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.25, 32), new THREE.MeshStandardMaterial({ color: '#b8a3c8', roughness: 0.95, emissive: '#6d5a8a', emissiveIntensity: 0.15 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.03;
  floor.receiveShadow = true;
  root.add(floor);
  // 둘레 흙 덩이(동글)
  const lumpM = new THREE.MeshStandardMaterial({ color: '#c9a878', roughness: 0.92 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.4;
    const r = 3.0 + rng() * 0.6;
    const l = new THREE.Mesh(sphere(), lumpM);
    const s = 0.22 + rng() * 0.22;
    l.scale.set(s * 1.3, s * 0.7, s);
    l.position.set(Math.cos(a) * r, s * 0.3, Math.sin(a) * r);
    l.castShadow = true;
    root.add(l);
  }
  // 별똥별 돌: 둥근 라벤더 돌 두 쪽(가운데로 별빛 금)
  const rock = new THREE.Group();
  rock.name = 'story-meteor-rock';
  rock.position.y = 0.55;
  const rockM = new THREE.MeshStandardMaterial({ color: '#a99bd6', roughness: 0.55, emissive: '#7a68c8', emissiveIntensity: 0.35 });
  const halfGeo = new THREE.SphereGeometry(0.6, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const mkHalf = (up: boolean) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(halfGeo, rockM);
    if (!up) m.rotation.x = Math.PI;
    m.castShadow = true;
    g.add(m);
    // 반짝 점(별가루)
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2, el = (0.15 + rng() * 0.6) * (up ? 1 : -1);
      const dot = new THREE.Mesh(starGeometry(), starMaterial());
      dot.scale.setScalar(0.07 + rng() * 0.04);
      const r = 0.6;
      dot.position.set(Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(a) * Math.cos(el) * r);
      dot.lookAt(dot.position.clone().multiplyScalar(2));
      g.add(dot);
    }
    return g;
  };
  const top = mkHalf(true), bot = mkHalf(false);
  rock.add(top, bot);
  // 갈라진 틈 빛(납작 원판)
  const seam = new THREE.Mesh(new THREE.CylinderGeometry(0.61, 0.61, 0.03, 28), glowMat('#fff2b0'));
  rock.add(seam);
  root.add(rock);
  const glow = glowSprite('#ffe6a8', 4);
  glow.position.y = 0.8;
  root.add(glow);
  const set = (appear: number, crack: number, t: number) => {
    const a = Math.max(0, Math.min(1, appear));
    root.visible = a > 0.001;
    if (!root.visible) return;
    const k = 1 - (1 - a) ** 3;
    rim.scale.set(k, k, 0.6 * k);
    floor.scale.setScalar(k);
    // 쾅 직후엔 돌이 살짝 통통 튄다
    rock.scale.setScalar(Math.max(0.01, k));
    const c = Math.max(0, Math.min(1, crack));
    if (c <= 0) {
      const wob = Math.sin(t * 3.1) * 0.04;
      rock.rotation.set(wob, t * 0.3, -wob);
      rock.position.y = 0.55 + Math.sin(t * 2.2) * 0.03;
      top.position.set(0, 0, 0); top.rotation.set(0, 0, 0);
      bot.position.set(0, 0, 0); bot.rotation.set(0, 0, 0);
      seam.visible = true;
      seam.scale.set(1, 1 + 0.6 * Math.sin(t * 5) ** 2, 1);
    } else {
      // 껍데기가 벌어져 뒤로 넘어간다(달걀 껍질처럼)
      rock.rotation.set(0, 0.4, 0);
      rock.position.y = 0.55 - 0.3 * c;
      top.position.set(-0.45 * c, 0.35 * c - 0.2 * c * c, -0.1 * c);
      top.rotation.set(0, 0, 1.4 * c);
      bot.position.set(0.25 * c, -0.05 * c, 0.05 * c);
      bot.rotation.set(0, 0, -0.25 * c);
      seam.visible = c < 0.4;
    }
    const gl = c <= 0 ? 0.8 + 0.3 * Math.sin(t * 4) : Math.max(0.25, 1.6 - c * 1.2);
    glow.scale.setScalar(4.5 * gl * k);
    (glow.material as THREE.SpriteMaterial).opacity = 0.85;
    rockM.emissiveIntensity = 0.3 + 0.2 * Math.sin(t * 4) ** 2;
  };
  set(0, 0, 0);
  return { root, rock, halves: [top, bot], glow, set };
}

// ───────────── 수평선 목표 빛기둥 ─────────────
export interface BeaconFx {
  root: THREE.Group;
  /** 목표 자리·땅 높이·플레이어까지 거리 → 보이기 */
  set(on: boolean, x: number, y: number, z: number, dist: number, t: number, color: string): void;
}
export function buildBeacon(): BeaconFx {
  const root = new THREE.Group();
  root.name = 'story-beacon';
  // 아래가 진하고 위로 갈수록 사라지는 세로 그라데이션
  let tex: THREE.Texture;
  if (hasDom()) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
    tex = new THREE.CanvasTexture(c);
  } else { tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 128]), 1, 1); tex.needsUpdate = true; }
  tex.colorSpace = THREE.SRGBColorSpace;
  const H = 220;
  const beamM = new THREE.MeshBasicMaterial({ map: tex, color: '#ffe58a', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  beamM.toneMapped = false;
  const beamGeo = new THREE.CylinderGeometry(2.2, 3.2, H, 20, 1, true);
  beamGeo.translate(0, H / 2, 0);
  const beam = new THREE.Mesh(beamGeo, beamM);
  beam.renderOrder = 4;
  const inner = new THREE.Mesh(beamGeo, beamM);
  inner.scale.set(0.4, 1, 0.4);
  // 꼭대기 큰 별(멀리서도 별 모양)
  const star = new THREE.Mesh(starGeometry(), glowMat('#fff2a8'));
  star.position.y = H * 0.55;
  const halo = glowSprite('#ffe58a', 40);
  halo.position.y = H * 0.55;
  root.add(beam, inner, star, halo);
  root.visible = false;
  const set = (on: boolean, x: number, y: number, z: number, dist: number, t: number, color: string) => {
    // 가까이 가면(60 m 안) 사라진다 — 그 자리에선 실제 목표를 보면 되니까
    const k = on ? Math.max(0, Math.min(1, (dist - 60) / 80)) : 0;
    root.visible = k > 0.01;
    if (!root.visible) return;
    root.position.set(x, y, z);
    beamM.color.set(color);
    beamM.opacity = 0.55 * k * (0.85 + 0.15 * Math.sin(t * 2));
    // 멀수록 굵게(화면에서 늘 보이게)
    const w = 1 + Math.min(5, dist / 500);
    beam.scale.set(w, 1, w);
    inner.scale.set(w * 0.4, 1, w * 0.4);
    const s = (6 + Math.min(30, dist / 60)) * (1 + 0.08 * Math.sin(t * 3));
    star.scale.setScalar(s);
    star.rotation.y = t * 0.8;
    halo.scale.setScalar(s * 5);
    (halo.material as THREE.SpriteMaterial).opacity = 0.7 * k;
    (halo.material as THREE.SpriteMaterial).color.set(color);
  };
  return { root, set };
}

// ───────────── 불꽃놀이 ─────────────
const FW_BURSTS = 8, FW_N = 44;
export interface FireworksFx {
  root: THREE.Group;
  /** age = 불꽃놀이 시작 뒤 초(음수 = 꺼짐) · 돌려주는 값 = 이번에 막 터진 불꽃 수(소리용) */
  set(age: number): number;
}
/** 둥근 구 파티클 불꽃. center 기준 위쪽 하늘 반경 spread 안에서 차례로 터진다 */
export function buildFireworks(rng: () => number, spread = 28, height = 26): FireworksFx {
  const root = new THREE.Group();
  root.name = 'story-fireworks';
  const mesh = new THREE.InstancedMesh(sphere(), glowMat('#ffffff', 0.95, true), FW_BURSTS * FW_N);
  mesh.frustumCulled = false;
  const pal = ['#ff9fb8', '#ffe58a', '#9ef0d2', '#bfe6ff', '#c9b6f2', '#ffc59a'];
  const bursts: Array<{ at: number; c: THREE.Vector3; dirs: THREE.Vector3[]; r: number }> = [];
  for (let b = 0; b < FW_BURSTS; b++) {
    const c = new THREE.Vector3((rng() - 0.5) * spread * 2, height + rng() * 14, (rng() - 0.5) * spread);
    const col = new THREE.Color(pal[b % pal.length]);
    const col2 = new THREE.Color('#fffaf2');
    const dirs: THREE.Vector3[] = [];
    for (let i = 0; i < FW_N; i++) {
      // 고른 구면 방향(피보나치)
      const y = 1 - (i + 0.5) / FW_N * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
      dirs.push(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
      mesh.setColorAt(b * FW_N + i, i % 5 === 0 ? col2 : col);
    }
    bursts.push({ at: b * 0.55 + rng() * 0.3, c, dirs, r: 7 + rng() * 5 });
  }
  root.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  let lastAge = -1;
  const set = (age: number) => {
    root.visible = age >= 0;
    let popped = 0;
    if (!root.visible) { lastAge = age; return 0; }
    for (let b = 0; b < FW_BURSTS; b++) {
      const B = bursts[b];
      // 한 바퀴 돈 뒤에도 계속(4.6 초마다 다시)
      const loop = 4.6;
      const local = ((age - B.at) % loop + loop) % loop;
      const started = age >= B.at;
      if (started && lastAge >= 0) {
        const prevLocal = ((lastAge - B.at) % loop + loop) % loop;
        if (lastAge < B.at || prevLocal > local) popped++;
      }
      const life = 1.7;
      const live = started && local < life;
      for (let i = 0; i < FW_N; i++) {
        const k = b * FW_N + i;
        if (!live) { sc.setScalar(0); m4.compose(B.c, q, sc); mesh.setMatrixAt(k, m4); continue; }
        const u = local / life;
        const out = B.r * (1 - (1 - u) ** 3);
        p.copy(B.c).addScaledVector(B.dirs[i], out);
        p.y -= 3.2 * local * local;
        sc.setScalar(0.42 * (1 - u) ** 0.6 + 0.05);
        m4.compose(p, q, sc);
        mesh.setMatrixAt(k, m4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    lastAge = age;
    return popped;
  };
  set(-1);
  return { root, set };
}

// ───────────── 말풍선 ─────────────
export interface Bubble {
  sprite: THREE.Sprite;
  say(text: string | null): void;
}
/** 흰 둥근 말풍선(Jua) — 글이 바뀔 때만 다시 그린다 */
export function buildBubble(): Bubble {
  const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
  mat.toneMapped = false;
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 20;
  sprite.visible = false;
  sprite.name = 'story-bubble';
  let canvas: HTMLCanvasElement | null = null;
  let tex: THREE.CanvasTexture | null = null;
  let cur: string | null = null;
  const say = (text: string | null) => {
    if (text === cur) return;
    cur = text;
    if (!text || !hasDom()) { sprite.visible = false; return; }
    canvas ??= document.createElement('canvas');
    const g = canvas.getContext('2d');
    if (!g) { sprite.visible = false; return; }
    const font = '30px Jua, "Apple SD Gothic Neo", system-ui, sans-serif';
    g.font = font;
    // 줄 나누기(한 줄 최대 14자 정도)
    const words = Array.from(text);
    const lines: string[] = [];
    let line = '';
    for (const ch of words) {
      if (g.measureText(line + ch).width > 380 && line) { lines.push(line); line = ch === ' ' ? '' : ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width)) + 48);
    const h = lines.length * 38 + 40;
    canvas.width = Math.max(96, w);
    canvas.height = h + 18;
    const c2 = canvas.getContext('2d')!;
    c2.font = font;
    const W = canvas.width, R = 26;
    c2.fillStyle = '#fffdf6';
    c2.strokeStyle = '#e8d6b4';
    c2.lineWidth = 4;
    c2.beginPath();
    c2.moveTo(R, 2); c2.lineTo(W - R, 2); c2.quadraticCurveTo(W - 2, 2, W - 2, R);
    c2.lineTo(W - 2, h - R); c2.quadraticCurveTo(W - 2, h, W - R, h);
    c2.lineTo(W / 2 + 12, h); c2.lineTo(W / 2, h + 14); c2.lineTo(W / 2 - 12, h);
    c2.lineTo(R, h); c2.quadraticCurveTo(2, h, 2, h - R);
    c2.lineTo(2, R); c2.quadraticCurveTo(2, 2, R, 2);
    c2.closePath(); c2.fill(); c2.stroke();
    c2.fillStyle = '#4a3b2a';
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    lines.forEach((l, i) => c2.fillText(l, W / 2, 22 + 19 + i * 38));
    tex?.dispose();
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex;
    mat.needsUpdate = true;
    const k = 0.0042;
    sprite.scale.set(canvas.width * k, canvas.height * k, 1);
    sprite.center.set(0.5, 0);
    sprite.visible = true;
  };
  return { sprite, say };
}
