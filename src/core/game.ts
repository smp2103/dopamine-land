// 게임 뼈대: 입력·플레이어 이동(걷기·달리기·점프·수영·잠수·활공)·카메라(모험/아늑)·상호작용·탑승·수집 상태·세계 전환.
// 모듈은 ctx.game 으로 이 API 를 쓴다(CONTRACT.md + docs/CONTRACT2.md 2·3장).
// v2: 서비스 슬롯 타입, hud 레지스트리, 상호작용 E/대체 키 고르기, 잠금 주인 세기, 땅 공급자, 목격 등록소, 초점 덮어쓰기, window.__dl.
import * as THREE from 'three';
import { Physics, RAPIER, gridTrimesh, type PhysBody } from './physics';
import { ChunkManager } from './chunks';
import { QUALITY } from './quality';
import * as Island from './island';
import { curveUniforms } from './curve';
import { CURVE_K } from './presets';
import { GameState } from './state';
import { GameUI } from './ui';
import type { Engine } from './engine';
import { HudRegistryStore, makeDexFacade } from './registry';
import { selectInteractions, promptText, DEFAULT_KEY } from './interact';
import { todOf } from './api';
import type {
  AudioApi, DexFacade, EconApi, EnvApi, GeoApi, OceanApi, SpaceApi, VehiclesApi, Witness, WitnessRegistry, WitnessSource,
} from './api';

// ───────────── 입력 ─────────────
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseDX = 0; mouseDY = 0; wheel = 0;
  dragging = false;
  constructor(el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mousedown', (e) => { if (e.button === 0 || e.button === 2) this.dragging = true; });
    addEventListener('mouseup', () => { this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (this.dragging || document.pointerLockElement) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  down(code: string) { return this.keys.has(code); }
  hit(code: string) { return this.pressed.has(code); }
  /** 프레임 끝에 호출 */
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; }
  /** 이동 축(-1..1) */
  axis() {
    const x = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    const y = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    return { x, y };
  }
}

// ───────────── 플레이어 ─────────────
export type MoveMode = 'ground' | 'air' | 'glide' | 'swim' | 'dive' | 'mounted';

/** 캐릭터 모듈이 넘겨주는 아바타 — 상태에 맞춰 스스로 포즈를 잡는다 */
export interface Avatar {
  root: THREE.Object3D;
  /** speed: 수평 속도(m/s), mode, action(낚시·채집 등 모듈이 정한 동작 이름) */
  animate?: (s: { speed: number; mode: MoveMode; action: string | null; t: number; dt: number }) => void;
  /** 손에 무언가 들기(잡은 물고기 들어 올리기 등) — 없으면 머리 위에 띄운다 */
  holdSlot?: THREE.Object3D;
}

/** 탈것 — vehicles 모듈이 구현한다 */
export interface Mountable {
  name: string;
  /** 탑승 중 매 프레임: 입력으로 움직이고, 좌석 위치를 돌려준다 */
  drive: (input: Input, dt: number, game: Game) => void;
  /** 플레이어가 앉을 자리(월드 행렬을 따르는 오브젝트) */
  seat: THREE.Object3D;
  /** 카메라가 볼 대상 */
  object: THREE.Object3D;
  /** 카메라 거리 배율 */
  camDistance?: number;
  /** 내릴 때(위치를 돌려주면 거기에 내린다) */
  onExit?: (game: Game) => THREE.Vector3 | void;
  /** 이 탈것이 물 위·하늘·우주 전용인지 등은 각자 판단 */
}

export class Player {
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  controller!: RAPIER.KinematicCharacterController;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  mode: MoveMode = 'ground';
  action: string | null = null;
  avatar: Avatar | null = null;
  mounted: Mountable | null = null;
  stamina = 1;
  /** 잠금 주인별 횟수(lock/unlock 짝) */
  private lockOwners = new Map<string, number>();
  /** 예전 방식(`player.locked = true`) 깃발 */
  private legacyLock = false;
  /** act() 남은 시간(초). Infinity = 풀 때까지 */
  private actLeft = 0;
  private actName: string | null = null;
  readonly radius = 0.32;
  readonly halfH = 0.34;
  /** 발에서 콜라이더 중심까지 */
  readonly footOff = 0.34 + 0.32;
  speed = 0;
  groundY = 0;
  waterY = -Infinity;
  placeholder: THREE.Mesh;

  constructor(private game: Game) {
    this.placeholder = new THREE.Mesh(
      new THREE.CapsuleGeometry(this.radius, this.halfH * 2, 8, 16),
      new THREE.MeshStandardMaterial({ color: '#ff9fb8', roughness: 0.7 }),
    );
    this.placeholder.castShadow = true;
  }

  /** 이동 잠금: 주인이 하나라도 있거나 예전 깃발이 켜져 있으면 true */
  get locked(): boolean { return this.legacyLock || this.lockOwners.size > 0; }
  /** 예전 방식 그대로(미니게임이 true/false 로 켜고 끈다). 주인 잠금과는 따로 센다 */
  set locked(v: boolean) { this.legacyLock = !!v; }
  /** 주인 이름으로 잠그기(여러 번 부르면 그만큼 unlock 해야 풀린다) */
  lock(owner: string) { this.lockOwners.set(owner, (this.lockOwners.get(owner) ?? 0) + 1); }
  /** 그 주인의 잠금 하나 풀기. all=true 면 그 주인 것을 전부 */
  unlock(owner: string, all = false) {
    const n = this.lockOwners.get(owner);
    if (n === undefined) return;
    if (all || n <= 1) this.lockOwners.delete(owner); else this.lockOwners.set(owner, n - 1);
  }
  /** 지금 잠근 주인들(디버그) */
  lockedBy(): string[] { return [...this.lockOwners.keys(), ...(this.legacyLock ? ['(legacy)'] : [])]; }

  /** 동작(포즈) 잠깐 하기 — seconds 뒤 저절로 풀린다. seconds 를 안 주면 act(null) 할 때까지. 다른 동작이 덮으면 그쪽이 이긴다 */
  act(name: Pose | string | null, seconds?: number) {
    this.action = name;
    this.actName = name;
    this.actLeft = name === null ? 0 : seconds !== undefined && seconds > 0 ? seconds : Infinity;
  }
  private tickAct(dt: number) {
    if (this.actName === null || !Number.isFinite(this.actLeft)) return;
    this.actLeft -= dt;
    if (this.actLeft > 0) return;
    // 그 사이 모듈이 action 을 직접 바꿨으면 건드리지 않는다
    if (this.action === this.actName) this.action = null;
    this.actName = null;
    this.actLeft = 0;
  }

  init(x: number, z: number) {
    const ph = this.game.physics;
    const y = this.game.groundAt(x, z) + this.footOff + 0.05;
    this.body = ph.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    this.collider = ph.world.createCollider(RAPIER.ColliderDesc.capsule(this.halfH, this.radius).setFriction(0.1), this.body);
    const c = ph.world.createCharacterController(0.04);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((65 * Math.PI) / 180);
    c.enableAutostep(0.45, 0.2, true);
    c.enableSnapToGround(0.4);
    c.setApplyImpulsesToDynamicBodies(true);
    c.setCharacterMass(60);
    this.controller = c;
    this.pos.set(x, y - this.footOff, z);
    this.game.root.add(this.placeholder);
  }

  setAvatar(a: Avatar) {
    this.avatar = a;
    this.placeholder.visible = false;
    this.game.root.add(a.root);
  }

  teleport(x: number, z: number, y?: number) {
    const g = this.game;
    const claimed = g.groundProviderAt(x, z);
    const gy = y ?? claimed ?? Island.heightAt(x, z);
    // 공급자(실내·행성)가 맡은 곳은 그 바닥이 정답 — 바다 높이로 끌어올리지 않는다
    const yy = claimed !== null ? gy : Math.max(gy, Island.waterLevelAt(x, z) - 0.8);
    this.body.setTranslation({ x, y: yy + this.footOff + 0.05, z }, true);
    this.body.setNextKinematicTranslation({ x, y: yy + this.footOff + 0.05, z });
    this.pos.set(x, yy, z);
    this.vel.set(0, 0, 0);
    // 발밑 충돌·주변 청크를 바로(초점 덮어쓰기가 있으면 그쪽 기준)
    g.chunks.update(g.focusOverride ?? this.pos, true);
  }

  /** opts.silent — 비눗방울·리프트처럼 E 로 못 내리는 잠긴 탑승은 '탑승!' 토스트를 띄우지 않는다 */
  mount(m: Mountable, opts?: { silent?: boolean }) {
    this.mounted = m;
    this.mode = 'mounted';
    this.collider.setEnabled(false);
    if (!opts?.silent) this.game.ui.toast(`${m.name} 탑승! (E 내리기)`);
  }

  /** 밖에서 미는 힘(해류·소용돌이) — 이번 프레임 이동에 얹는다(m). 몸체를 직접 옮기지 말고 이걸 쓴다 */
  private pushPend = { x: 0, z: 0 };
  push(dx: number, dz: number) {
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
    this.pushPend.x += dx; this.pushPend.z += dz;
  }

  dismount() {
    const m = this.mounted;
    if (!m) return;
    this.mounted = null;
    const at = m.onExit?.(this.game) ?? new THREE.Vector3().setFromMatrixPosition(m.seat.matrixWorld).add(new THREE.Vector3(1.2, 0, 0));
    this.collider.setEnabled(true);
    this.mode = 'air';
    this.teleport(at.x, at.z, Math.max(at.y, this.game.groundAt(at.x, at.z)));
  }

  update(input: Input, dt: number, camYaw: number) {
    const g = this.game;
    this.tickAct(dt);
    if (this.mounted) {
      this.pushPend.x = 0; this.pushPend.z = 0;
      if (!this.locked) this.mounted.drive(input, dt, g);
      const sp = new THREE.Vector3().setFromMatrixPosition(this.mounted.seat.matrixWorld);
      this.pos.copy(sp);
      const q = new THREE.Quaternion().setFromRotationMatrix(this.mounted.seat.matrixWorld);
      this.yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
      this.body.setNextKinematicTranslation({ x: sp.x, y: sp.y + this.footOff, z: sp.z });
      this.speed = 0;
      this.syncVisual(dt, q);
      return;
    }
    const ax = this.locked ? { x: 0, y: 0 } : input.axis();
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    // 카메라 기준 이동 방향
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3().addScaledVector(fwd, ax.y).addScaledVector(right, ax.x);
    if (wish.lengthSq() > 1) wish.normalize();

    this.waterY = Island.waterLevelAt(this.pos.x, this.pos.z);
    const depth = this.waterY - this.pos.y;
    const inWater = Number.isFinite(this.waterY) && depth > 0.95;
    let maxSpeed = run ? 9.5 : 5.2;
    // 과일파이 같은 속도 버프(economy.buffMult('speed'), 기본 1)
    let spdMul = 1;
    try { const m = this.game.econ?.buffMult?.('speed'); if (typeof m === 'number' && Number.isFinite(m) && m > 0) spdMul = m; } catch { /* 없으면 1 */ }

    if (inWater && this.mode !== 'dive') this.mode = 'swim';
    if (!inWater && (this.mode === 'swim' || this.mode === 'dive')) this.mode = 'air';

    if (this.mode === 'swim' || this.mode === 'dive') {
      maxSpeed = run ? 5.5 : 3.4;
      if (input.hit('KeyC') || input.hit('ControlLeft')) this.mode = this.mode === 'dive' ? 'swim' : 'dive';
      const targetY = this.mode === 'dive' ? Math.max(g.groundAt(this.pos.x, this.pos.z) + 0.5, this.waterY - 6) : this.waterY - 0.85;
      this.vel.y += (targetY - this.pos.y) * 4 * dt - this.vel.y * 3 * dt;
      if (input.hit('Space') && this.mode === 'swim' && depth < 1.3) this.vel.y = 6; // 물가로 뛰어오르기
    } else {
      const grounded = this.controller.computedGrounded();
      if (grounded) {
        this.mode = 'ground';
        if (this.vel.y < 0) this.vel.y = -1;
        if (input.hit('Space') && !this.locked) { this.vel.y = 8.2; this.mode = 'air'; }
        this.stamina = Math.min(1, this.stamina + dt * 0.5);
      } else {
        // 활공: 공중에서 Space 를 누르고 있으면 패러글라이더
        const wantGlide = input.down('Space') && this.vel.y < 1 && this.stamina > 0;
        this.mode = wantGlide ? 'glide' : 'air';
        if (this.mode === 'glide') {
          this.vel.y = Math.max(this.vel.y - 22 * dt, -2.2);
          maxSpeed = 11;
          this.stamina = Math.max(0, this.stamina - dt * 0.06);
        } else {
          this.vel.y += g.physics.gravity * dt;
        }
      }
    }

    // 수평 가속(관성 있게)
    const target = wish.multiplyScalar(maxSpeed * spdMul);
    const accel = this.mode === 'ground' ? 14 : this.mode === 'glide' ? 3 : 6;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, accel * dt);
    if (this.mode === 'glide' && wish.lengthSq() < 0.01) {
      // 활공 중 손을 놓아도 앞으로
      this.vel.x -= Math.sin(this.yaw) * 4 * dt;
      this.vel.z -= Math.cos(this.yaw) * 4 * dt;
    }

    const desired = { x: this.vel.x * dt + this.pushPend.x, y: this.vel.y * dt, z: this.vel.z * dt + this.pushPend.z };
    this.pushPend.x = 0; this.pushPend.z = 0;
    // 깊은 바다로 걸어 들어가는 건 수영으로 이어진다(막지 않음). 맵 끝만 막는다 — 지구에서, 땅 공급자가 맡지 않은 곳만.
    const b = Island.WORLD_BOUNDS;
    const nx = this.pos.x + desired.x, nz = this.pos.z + desired.z;
    if (g.world === 'earth' && g.groundProviderAt(nx, nz) === null) {
      if (nx < b.minX || nx > b.maxX) desired.x = 0;
      if (nz < b.minZ || nz > b.maxZ) desired.z = 0;
    }
    if (this.mode === 'swim' || this.mode === 'dive') this.controller.enableSnapToGround(0); else this.controller.enableSnapToGround(0.4);
    this.controller.computeColliderMovement(this.collider, desired);
    const mv = this.controller.computedMovement();
    const cur = this.body.translation();
    const next = { x: cur.x + mv.x, y: cur.y + mv.y, z: cur.z + mv.z };
    // 안전망: 땅(공급자 우선) 아래로 빠지면 끌어올린다
    const gy = g.groundAt(next.x, next.z);
    if (next.y - this.footOff < gy - 0.6) { next.y = gy + this.footOff; this.vel.y = 0; }
    this.body.setNextKinematicTranslation(next);
    if (dt > 0) this.vel.y = this.mode === 'ground' ? this.vel.y : mv.y / dt;
    this.pos.set(next.x, next.y - this.footOff, next.z);
    this.speed = Math.hypot(mv.x, mv.z) / Math.max(dt, 1e-4);

    // 바라보는 방향: 움직이는 쪽으로 부드럽게
    if (Math.hypot(this.vel.x, this.vel.z) > 0.4 && !this.locked) {
      const want = Math.atan2(-this.vel.x, -this.vel.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    }
    this.syncVisual(dt);
  }

  private syncVisual(dt: number, q?: THREE.Quaternion) {
    const o = this.avatar?.root ?? this.placeholder;
    o.position.copy(this.pos);
    if (!this.avatar) o.position.y += this.footOff;
    if (q) o.quaternion.copy(q); else o.rotation.set(0, this.yaw + Math.PI, 0);
    this.avatar?.animate?.({ speed: this.speed, mode: this.mode, action: this.action, t: this.game.time, dt });
  }

  /** 바라보는 방향 단위 벡터 */
  facing(): THREE.Vector3 { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
}

// ───────────── 카메라 ─────────────
export type CamStyle = 'adventure' | 'cozy';

export class CameraRig {
  style: CamStyle = 'adventure';
  yaw = 0;
  pitch = 0.32;
  dist = 7.5;
  target = new THREE.Vector3();
  constructor(private game: Game) {}

  setStyle(s: CamStyle) {
    this.style = s;
    if (s === 'cozy') { this.pitch = 0.72; this.dist = 15; this.yaw = 0; }
    else { this.pitch = 0.3; this.dist = 7.5; }
    this.game.applyCurveForStyle();
  }

  update(input: Input, dt: number) {
    const p = this.game.player;
    const m = p.mounted;
    const focusObj = m ? new THREE.Vector3().setFromMatrixPosition(m.object.matrixWorld) : p.pos;
    const k = Math.min(1, dt * 8);
    this.target.lerp(new THREE.Vector3(focusObj.x, focusObj.y + 1.1, focusObj.z), k);
    if (dt === 0) this.target.set(focusObj.x, focusObj.y + 1.1, focusObj.z);
    this.yaw -= input.mouseDX * 0.005;
    if (input.down('KeyQ')) this.yaw += dt * 2;
    if (input.down('KeyR')) this.yaw -= dt * 2;
    if (this.style === 'adventure') this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * 0.004, -0.35, 1.2);
    this.dist = THREE.MathUtils.clamp(this.dist * (1 + input.wheel * 0.08), 3, 60);
    const d = this.dist * (m?.camDistance ?? 1);
    const cam = this.game.engine.camera;
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(d);
    const want = this.target.clone().add(off);
    // 카메라가 땅속으로 들어가지 않게(실내·행성은 땅 공급자 높이)
    const gy = this.game.groundAt(want.x, want.z) + 0.6;
    if (want.y < gy) want.y = gy;
    cam.position.copy(want);
    cam.fov = this.style === 'cozy' ? 32 : 50;
    cam.updateProjectionMatrix();
    cam.lookAt(this.target);
    this.game.engine.camName = this.style;
  }
}

// ───────────── 상호작용 ─────────────
export interface Interaction {
  /** 없으면 공급자 id(점 상호작용은 그 id) */
  id?: string;
  label: string;
  /** 플레이어와 거리(가까울수록 우선) */
  dist: number;
  use: () => void;
  /** 키(기본 E). E 가 아니면 대체 줄(F 등)에 뜬다 */
  key?: string;
  /** 탈것에 탄 채로도 고를 수 있나(기본 false — 탑승 중 E 는 내리기) */
  whileMounted?: boolean;
  /** 대체 키끼리 우선순위(클수록 먼저, 기본 0 — api.ALT_PRIORITY) */
  priority?: number;
}

/** 공급자: 매 프레임 플레이어 위치로 지금 할 수 있는 행동을 돌려준다 */
export type InteractionProvider = (p: Player, game: Game) => Interaction | null;

export interface PointInteractable {
  id: string;
  position: () => THREE.Vector3;
  radius: number;
  label: string | (() => string);
  onUse: () => void;
  enabled?: () => boolean;
  key?: string;
  whileMounted?: boolean;
  priority?: number;
}

/** 지금 고를 수 있는 상호작용 한 줄(listInteractions) */
export interface InteractionInfo { id: string; label: string; key: string; dist: number; priority: number; whileMounted: boolean; source: 'point' | 'provider' }
type Cand = Interaction & { id: string; source: 'point' | 'provider' };

/** 땅 공급자: 그 자리를 맡으면 바닥 높이, 아니면 null */
export type GroundProvider = (x: number, z: number) => number | null | undefined;

/** 플레이어 포즈 이름(game.player.action / act) — 아바타가 이걸 보고 자세를 잡는다 */
export const POSES = [
  'fish', 'cast', 'reel', 'net', 'dig', 'shake', 'chop', 'hit', 'pick', 'pet', 'hold', 'cheer', 'stung', 'sit', 'sleep', 'eat', 'wave', 'photo',
  'plant', 'water', 'peace',
] as const;
export type Pose = typeof POSES[number];

// 서비스 슬롯 타입은 api.ts 에 — 예전 import 를 위해 다시 내보낸다
export type { EnvApi, GeoApi, EconApi, OceanApi, AudioApi, VehiclesApi, SpaceApi } from './api';

/** __dl.unlockAll 이 푸는 해금 키(계약 6장) — 섬별 키는 ISLANDS 에서 만든다 */
const UNLOCK_KEYS = [
  'tool:rod', 'tool:net', 'tool:shovel', 'tool:hammer', 'tool:slingshot', 'tool:snorkel', 'tool:wetsuit', 'tool:goodrod', 'tool:goldrod',
  'tool:goodnet', 'tool:goldnet', 'tool:wateringcan',
  'v:bike', 'v:scooter', 'v:kart', 'v:raft', 'v:duck_tube', 'v:tugboat', 'v:yacht', 'v:motorboat', 'v:jetski', 'v:submarine', 'v:sled',
  'v:buggy', 'v:balloon', 'v:plane', 'v:rover', 'v:ufo',
  'rocket:blueprint', 'rocket:part:body', 'rocket:part:engine', 'rocket:part:window', 'rocket:part:wing', 'rocket:part:fuel', 'rocket:part:chip',
  'rocket:pad', 'space:moon',
  'wing:aquarium', 'wing:bug', 'wing:fossil', 'wing:sea', 'wing:astro',
  'house:1', 'house:2', 'house:3', 'house:4', 'bag:30', 'bag:40', 'bag:50',
] as const;

// ───────────── 게임 ─────────────
export interface GameOpts { spawn?: { x: number; z: number }; style?: CamStyle; world?: 'earth' | 'space' }

export const SPACE_ORIGIN = new THREE.Vector3(0, 0, 30000);

export class Game {
  physics = new Physics();
  chunks = new ChunkManager();
  root = new THREE.Group();
  /** 우주 세계 콘텐츠는 여기에(space 모듈) */
  spaceRoot = new THREE.Group();
  input: Input;
  player: Player;
  cam: CameraRig;
  state = new GameState();
  ui: GameUI;
  private _world: 'earth' | 'space' = 'earth';
  /** 지금 세계(지구/우주). 객체를 넣으면(옛 기획서 표기) geo 로 돌려보낸다 */
  get world(): 'earth' | 'space' { return this._world; }
  set world(v: 'earth' | 'space' | GeoApi) {
    if (typeof v === 'object') { this.geo = v; return; }
    this._world = v;
  }
  // ── 서비스 슬롯(계약 v2 2장) — 코어는 null, 주인 모듈이 채운다. 읽는 쪽은 늘 `?.` + 기본값
  // 쓰기 타입은 느슨하게 둔다: 옛 모듈(v1 economy 등)이 계약 모양을 다 채우기 전에도 컴파일되게.
  private _env: EnvApi | null = null;
  private _econ: EconApi | null = null;
  private _geo: GeoApi | null = null;
  private _ocean: OceanApi | null = null;
  private _audio: AudioApi | null = null;
  private _vehicles: VehiclesApi | null = null;
  private _space: SpaceApi | null = null;
  /** atmosphere(order 50) */
  get env(): EnvApi | null { return this._env; }
  set env(v: EnvApi | Partial<EnvApi> | Record<string, any> | null) { this._env = v as EnvApi | null; }
  /** economy(order 9) */
  get econ(): EconApi | null { return this._econ; }
  set econ(v: EconApi | Partial<EconApi> | Record<string, any> | null) { this._econ = v as EconApi | null; }
  /** worldterrain(order 2) */
  get geo(): GeoApi | null { return this._geo; }
  set geo(v: GeoApi | Partial<GeoApi> | Record<string, any> | null) { this._geo = v as GeoApi | null; }
  /** ocean 만 쓴다 */
  get ocean(): OceanApi | null { return this._ocean; }
  set ocean(v: OceanApi | Partial<OceanApi> | Record<string, any> | null) { this._ocean = v as OceanApi | null; }
  /** audio(order 1) */
  get audio(): AudioApi | null { return this._audio; }
  set audio(v: AudioApi | Partial<AudioApi> | Record<string, any> | null) { this._audio = v as AudioApi | null; }
  /** vehicles */
  get vehicles(): VehiclesApi | null { return this._vehicles; }
  set vehicles(v: VehiclesApi | Partial<VehiclesApi> | Record<string, any> | null) { this._vehicles = v as VehiclesApi | null; }
  /** space */
  get space(): SpaceApi | null { return this._space; }
  set space(v: SpaceApi | Partial<SpaceApi> | Record<string, any> | null) { this._space = v as SpaceApi | null; }
  /** HUD 레지스트리 — 코어가 늘 만들어 둔다. hud 모듈이 attach(renderer) 로 그리기를 붙인다 */
  readonly hud = new HudRegistryStore();
  private _dex: DexFacade | null = null;
  private dexWarned = false;
  /** 예전 이름 game.dex — hud 위의 외관(open·close·toast·showRegion·register). 덮어쓰기는 무시한다 */
  get dex(): DexFacade { return (this._dex ??= makeDexFacade(this.hud)); }
  set dex(_v: unknown) {
    if (this.dexWarned) return;
    this.dexWarned = true;
    console.warn('[game] game.dex 는 이제 코어가 hud 위에 만든 외관이에요 — 덮어쓰기는 무시합니다(game.hud.registerPanel 을 쓰세요)');
  }
  /** 담당별 확장(한 키에 주인 하나 — 계약 2장 ext 표) */
  ext: Record<string, any> = {};
  /** 목격 등록소(사진 모드·인사 등록) */
  readonly witnesses: WitnessRegistry;
  /** 실내·행성: 청크가 플레이어 대신 이 점 주변을 만든다 */
  focusOverride: THREE.Vector3 | null = null;
  time = 0;
  providers: Array<{ id: string; fn: InteractionProvider }> = [];
  points: PointInteractable[] = [];
  /** 이번 프레임의 E 상호작용 */
  current: Interaction | null = null;
  /** 이번 프레임의 대체 키(F 등) 상호작용 */
  currentAlt: Interaction | null = null;
  /** current/currentAlt 가 차지한 키 — 단축키 디스패처가 건너뛴다 */
  consumedKeys = new Set<string>();
  updates: Array<(t: number, dt: number) => void> = [];
  worldHooks: Array<(w: 'earth' | 'space') => void> = [];
  groundProviders: Array<{ id: string; fn: GroundProvider }> = [];
  groundBodies = new Map<string, PhysBody>();
  ready = false;
  /** 옛 모듈이 붙이는 임시 필드용 탈출구(새 코드는 ext 를 쓴다) */
  [k: string]: any;

  constructor(public engine: Engine, public opts: GameOpts) {
    this.input = new Input(engine.renderer.domElement);
    this.player = new Player(this);
    this.cam = new CameraRig(this);
    this.ui = new GameUI(this);
    this.root.name = 'game';
    this.spaceRoot.name = 'space';
    this.spaceRoot.visible = false;
    engine.scene.add(this.root, this.chunks.root, this.spaceRoot);
    const sources: WitnessSource[] = [];
    this.witnesses = {
      add: (fn) => { sources.push(fn); return () => { const i = sources.indexOf(fn); if (i >= 0) sources.splice(i, 1); }; },
      list: () => {
        const out: Witness[] = [];
        for (const fn of sources.slice()) {
          try { for (const w of fn() ?? []) if (w && w.speciesId && w.pos) out.push(w); } catch (e) { console.error('[witnesses]', e); }
        }
        return out;
      },
    };
  }

  async init() {
    await this.physics.init();
    this.physics.waterLevel = (x, z) => Island.waterLevelAt(x, z);
    // 지형 충돌: 플레이어 주변 청크 trimesh(1 m 격자)
    this.chunks.add({
      key: 'phys-ground', size: 48, radius: 110,
      build: ({ x0, z0, size, cx, cz }) => {
        const k = cx + ',' + cz;
        const { vertices, indices } = gridTrimesh(x0, z0, size, 1, Island.heightAt);
        const pb = this.physics.add({ shape: { kind: 'mesh', vertices, indices }, type: 'fixed', position: { x: 0, y: 0, z: 0 }, tag: 'ground' });
        this.groundBodies.set(k, pb);
        const o = new THREE.Object3D();
        o.userData.ground = k;
        return o;
      },
      dispose: (o) => {
        const k = o.userData.ground as string;
        this.groundBodies.get(k)?.remove();
        this.groundBodies.delete(k);
      },
    });
    const s = this.opts.spawn ?? Island.HERO.player;
    this.player.init(s.x, s.z);
    this.cam.setStyle(this.opts.style ?? 'adventure');
    this.chunks.update(this.focusOverride ?? this.player.pos, true);
    this.cam.target.copy(this.player.pos);
    this.state.load();
    this.ui.mount();
    this.installDebug();
    this.ready = true;
  }

  /** 순간이동 직후 발밑 충돌이 있게 */
  ensureGround(x: number, z: number) { this.chunks.update(new THREE.Vector3(x, 0, z), true); }

  // ───────────── 땅 공급자 ─────────────
  /** 실내·행성 등이 바닥 높이를 맡는다. 먼저 등록한 것부터 묻고, 처음 null 이 아닌 값이 Island.heightAt 을 이긴다. 해제 함수를 돌려준다.
   *  물리 바닥(phys-ground 청크)은 여전히 Island.heightAt 으로 만든다 — 땅보다 높은 바닥이면 주인이 addStatic 으로 바닥 콜라이더를 따로 깔 것 */
  addGroundProvider(fn: GroundProvider, id = `ground-${this.groundProviders.length}`): () => void {
    const entry = { id, fn };
    this.groundProviders.push(entry);
    return () => { const i = this.groundProviders.indexOf(entry); if (i >= 0) this.groundProviders.splice(i, 1); };
  }
  /** 공급자가 맡은 높이(아무도 안 맡으면 null) */
  groundProviderAt(x: number, z: number): number | null {
    for (const p of this.groundProviders) {
      let h: number | null | undefined = null;
      try { h = p.fn(x, z); } catch (e) { console.error(`[ground ${p.id}]`, e); }
      if (typeof h === 'number' && Number.isFinite(h)) return h;
    }
    return null;
  }
  /** 바닥 높이: 공급자 우선, 없으면 섬 지형 */
  groundAt(x: number, z: number): number { return this.groundProviderAt(x, z) ?? Island.heightAt(x, z); }

  applyCurveForStyle() {
    curveUniforms.uCurveK.value = this.cam.style === 'cozy' ? CURVE_K : 0.00012;
  }

  /** 매 프레임(게임 갱신 안). 해제 함수를 돌려준다 */
  onUpdate(fn: (t: number, dt: number) => void): () => void {
    this.updates.push(fn);
    return () => { const i = this.updates.indexOf(fn); if (i >= 0) this.updates.splice(i, 1); };
  }
  /** 세계 바뀔 때(지구 ↔ 우주). 해제 함수를 돌려준다 */
  onWorld(fn: (w: 'earth' | 'space') => void): () => void {
    this.worldHooks.push(fn);
    return () => { const i = this.worldHooks.indexOf(fn); if (i >= 0) this.worldHooks.splice(i, 1); };
  }

  /** 상황형 상호작용 공급자. 해제 함수를 돌려준다(그 등록 하나만) */
  addProvider(id: string, fn: InteractionProvider): () => void {
    const entry = { id, fn };
    this.providers.push(entry);
    return () => { const i = this.providers.indexOf(entry); if (i >= 0) this.providers.splice(i, 1); };
  }
  /** 그 id 의 공급자를 전부 뗀다 */
  removeProvider(id: string) { this.providers = this.providers.filter((p) => p.id !== id); }
  addInteractable(p: PointInteractable) { this.points.push(p); return () => { this.points = this.points.filter((x) => x !== p); }; }

  /** 우주 ↔ 지구 */
  setWorld(w: 'earth' | 'space', spawn?: THREE.Vector3) {
    if (this.player.mounted) this.player.dismount();
    this.world = w;
    this.chunks.world = w;
    this.root.visible = true;
    for (const o of this.engine.scene.children) {
      if (o.userData.world === 'earth') o.visible = w === 'earth';
    }
    this.spaceRoot.visible = w === 'space';
    this.physics.setGravity(w === 'space' ? -4.5 : -22);
    const at = spawn ?? (w === 'space' ? SPACE_ORIGIN.clone().add(new THREE.Vector3(0, 2, 0)) : new THREE.Vector3(Island.HERO.player.x, 0, Island.HERO.player.z));
    for (const fn of this.worldHooks) fn(w);
    this.player.teleport(at.x, at.z, w === 'space' ? at.y : undefined);
  }

  update(t: number, dt: number) {
    if (!this.ready) return;
    this.time = t;
    const inp = this.input;
    if (inp.hit('KeyV')) this.cam.setStyle(this.cam.style === 'adventure' ? 'cozy' : 'adventure');
    if (inp.hit('KeyG')) {
      const q = this.engine.cycleQuality();
      this.engine.onQualityChange?.(q);
      this.engine.guiSync?.();
      this.ui.toast(`그래픽 품질: ${QUALITY[q].label}`);
    }
    this.player.update(inp, dt, this.cam.yaw);
    this.physics.update(dt);
    this.chunks.update(this.focusOverride ?? this.player.pos);
    // 상호작용은 모듈 갱신 전에 고른다 — 같은 프레임의 단축키 디스패처(hud)가 consumedKeys 를 보게
    this.pickInteraction();
    this.runInteractionKeys();
    for (const fn of this.updates.slice()) fn(t, dt);
    this.cam.update(inp, dt);
    // 엔진 시점(그림자·심도·곡률 원점)을 플레이어에 맞춘다
    this.engine.viewTarget.copy(this.cam.target);
    curveUniforms.uCurveOrigin.value.set(this.cam.target.x, 0, this.cam.target.z);
    this.ui.update(dt);
    inp.endFrame();
  }

  /** 이번 프레임에 눌린 키로 current / currentAlt 실행, 탑승 중 E 는 내리기 */
  private runInteractionKeys() {
    const inp = this.input;
    const cur = this.current, alt = this.currentAlt;
    if (cur && inp.hit(cur.key || DEFAULT_KEY)) this.safeUse(cur);
    // 잠금 중(갑판 낚시·연출 등)엔 E 가 '내리기'로 새지 않는다 — 그 E 는 잠근 모듈 몫
    else if (this.player.mounted && !this.player.locked && inp.hit(DEFAULT_KEY)) this.player.dismount();
    if (alt && inp.hit(alt.key || DEFAULT_KEY)) this.safeUse(alt);
  }
  private safeUse(it: Interaction) {
    try { it.use(); } catch (e) { console.error(`[interaction ${it.id ?? it.label}]`, e); }
  }

  /** 지금 할 수 있는 후보(반경 안 점 + 공급자). 잠금 중이면 빈 배열 */
  private collectCandidates(): Cand[] {
    const p = this.player;
    const out: Cand[] = [];
    if (p.locked) return out;
    for (const pt of this.points) {
      try {
        if (pt.enabled && !pt.enabled()) continue;
        const d = pt.position().distanceTo(p.pos);
        if (!(d <= pt.radius)) continue;
        out.push({
          id: pt.id, source: 'point', label: typeof pt.label === 'function' ? pt.label() : pt.label, dist: d, use: pt.onUse,
          key: pt.key, whileMounted: pt.whileMounted, priority: pt.priority,
        });
      } catch (e) { console.error(`[interaction ${pt.id}]`, e); }
    }
    for (const pr of this.providers) {
      let r: Interaction | null = null;
      try { r = pr.fn(p, this); } catch (e) { console.error(`[interaction ${pr.id}]`, e); }
      if (r) out.push({ ...r, id: r.id ?? pr.id, source: 'provider' });
    }
    return out;
  }

  private pickInteraction() {
    const pick = selectInteractions(this.collectCandidates(), !!this.player.mounted);
    this.current = pick.current;
    this.currentAlt = pick.alt;
    this.consumedKeys = pick.consumed;
    const primary = pick.current ? promptText(pick.current) : this.player.mounted && !this.player.locked ? 'E 내리기' : null;
    this.ui.setPrompt(primary, promptText(pick.alt));
  }

  /** 지금 고를 수 있는 상호작용 목록(가까운 순) — 디버그·자동 루프용 */
  listInteractions(): InteractionInfo[] {
    const mounted = !!this.player.mounted;
    return this.collectCandidates()
      .filter((c) => Number.isFinite(c.dist) && (!mounted || c.whileMounted))
      .sort((a, b) => a.dist - b.dist)
      .map((c) => ({ id: c.id, label: c.label, key: c.key || DEFAULT_KEY, dist: c.dist, priority: c.priority ?? 0, whileMounted: !!c.whileMounted, source: c.source }));
  }

  /**
   * id 로 상호작용 실행. 지금 후보에 있으면 그걸, 없고 force 면 같은 id 의 점 상호작용을 거리 무시하고(디버그).
   * 실행했으면 true.
   */
  interact(id: string, o: { force?: boolean } = {}): boolean {
    const mounted = !!this.player.mounted;
    const c = this.collectCandidates().find((x) => x.id === id && (!mounted || x.whileMounted));
    if (c) { this.safeUse(c); return true; }
    if (o.force) {
      const pt = this.points.find((x) => x.id === id && (!x.enabled || x.enabled()));
      if (pt) { this.safeUse({ id: pt.id, label: String(pt.id), dist: 0, use: pt.onUse }); return true; }
    }
    return false;
  }

  // ───────────── window.__dl 디버그 ─────────────
  /** scripts/loop.mjs 가 화면 없이 게임을 몰 수 있게(계약 v2 3장) */
  private installDebug() {
    if (typeof window === 'undefined') return;
    (window as unknown as { __dl?: DebugApi }).__dl = makeDebugApi(this);
  }
}

// ───────────── window.__dl (진짜 Game · 테스트 가짜 게임 둘 다) ─────────────
/** __dl 이 쓰는 게임 표면 — 진짜 Game 과 tests/kit 가짜 게임이 둘 다 맞는다 */
export interface DebugHost {
  econ: EconApi | null;
  env: EnvApi | null;
  state: GameState;
  world: 'earth' | 'space';
  player: { pos: THREE.Vector3; teleport(x: number, z: number, y?: number): void; lockedBy?(): string[] };
  points: Array<{ id: string; position: () => THREE.Vector3; enabled?: () => boolean }>;
  chunks: { layerStats?: () => unknown };
  engine: { timeScale: number; applyTod?: (name: string) => void };
  setWorld(w: 'earth' | 'space', spawn?: THREE.Vector3): void;
  listInteractions(): unknown[];
  interact(id: string, o?: { force?: boolean }): boolean;
}

/** 이벤트 기록 한 줄(종·객체는 id 로 줄인다 — 페이지 밖으로 꺼내기 쉽게) */
export interface DebugEvent { i: number; type: string; [k: string]: unknown }

/** 이벤트 값 줄이기: 종 객체 → id, 배열 → id 목록(앞 20개), 함수·큰 객체는 버린다 */
function slimValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => (x && typeof x === 'object' ? (x as { id?: unknown }).id ?? slimFlat(x) : x));
  const o = v as { id?: unknown };
  return typeof o.id === 'string' ? o.id : slimFlat(v);
}
function slimFlat(v: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) if (x === null || ['string', 'number', 'boolean'].includes(typeof x)) out[k] = x;
  return out;
}

export type DebugApi = ReturnType<typeof makeDebugApi>;

/**
 * window.__dl 본체. 진짜 Game 은 init 에서, 루프 테스트(tests/loop)는 가짜 게임으로 부른다.
 * give·coins·stars·teleport·world·hour·advance·list·interact·unlockAll·save(계약 v2 3장) +
 * 루프용 덤: where/goto(상호작용 id 자리), places(고정 자리표), events/mark(이벤트 기록), layers·locks·timeScale.
 */
export function makeDebugApi(g: DebugHost) {
  const unlockAll = () => {
    const econ = g.econ;
    if (!econ || typeof econ.unlock !== 'function') { console.warn('[__dl] econ 이 아직 없어요'); return 0; }
    const keys: string[] = [...UNLOCK_KEYS];
    for (const d of Island.ISLANDS) {
      keys.push(`lighthouse:${d.id}`);
      for (let i = 1; i <= 5; i++) keys.push(`dev:${d.id}:${i}`);
    }
    let n = 0;
    for (const k of keys) {
      try { if (!econ.isUnlocked?.(k)) { econ.unlock(k, 'debug'); n++; } } catch (e) { console.error(`[__dl] unlock ${k}`, e); }
    }
    return n;
  };
  // 이벤트 기록(최근 2000개) — 자동 루프가 단계마다 mark() 하고 events(since) 로 본다
  const rec: DebugEvent[] = [];
  let seq = 0;
  g.state.on((e) => {
    const row: DebugEvent = { i: seq++, type: e.type };
    for (const [k, v] of Object.entries(e)) if (k !== 'type') { const x = slimValue(v); if (x !== undefined) row[k] = x; }
    rec.push(row);
    if (rec.length > 2000) rec.splice(0, rec.length - 2000);
  });
  /** 점 상호작용 자리(켜진 것만) */
  const where = (id: string) => {
    const pt = g.points.find((p) => p.id === id && (!p.enabled || p.enabled()));
    if (!pt) return null;
    try { return pt.position().clone(); } catch (e) { console.error(`[__dl] where ${id}`, e); return null; }
  };
  return {
    game: g,
    /** 가방에 넣기(econ.give 가 있으면 가방 규칙대로) */
    give: (id: string, n = 1) => {
      const econ = g.econ;
      if (econ && typeof econ.give === 'function') return econ.give(id, n, 'debug');
      g.state.addItem(id, n);
      return n;
    },
    coins: (n: number) => { g.state.addCoins(n, 'debug'); return g.state.coins; },
    stars: (n: number) => {
      const econ = g.econ;
      if (econ && typeof econ.addStars === 'function') { econ.addStars(n, 'debug'); return econ.stars; }
      console.warn('[__dl] econ.addStars 가 아직 없어요');
      return 0;
    },
    teleport: (x: number, z: number, y?: number) => { g.player.teleport(x, z, y); return g.player.pos.clone(); },
    world: (w: 'earth' | 'space') => { g.setWorld(w); return g.world; },
    hour: (h: number) => {
      const env = g.env;
      if (env && typeof env.setHour === 'function') env.setHour(h);
      else g.engine.applyTod?.(todOf(h)); // 시계가 없으면 시간대 프리셋만
      return h;
    },
    advance: (sec: number) => {
      const env = g.env;
      if (env && typeof env.advance === 'function') { env.advance(sec); return true; }
      console.warn('[__dl] env.advance 가 아직 없어요');
      return false;
    },
    list: () => g.listInteractions(),
    interact: (id: string) => g.interact(id, { force: true }),
    unlockAll,
    save: () => { g.state.saveNow(); return true; },
    /** 점 상호작용 id 의 자리(없으면 null) */
    where,
    /** 점 상호작용 옆(back m 떨어진 곳)으로 순간이동 — 그 자리에서 E 가 잡히게 */
    goto: (id: string, back = 1.6) => {
      const p = where(id);
      if (!p) return null;
      g.player.teleport(p.x + back, p.z + back * 0.4);
      return g.player.pos.clone();
    },
    /** 고정 자리표(마을 시설·부두·발사대·섬) */
    places: { PLACES: Island.PLACES, HERO: Island.HERO, ISLANDS: Island.ISLANDS },
    /** 지금까지 쌓인 이벤트 번호(다음 이벤트가 받을 i) */
    mark: () => seq,
    /** since 번 이후의 이벤트(type 을 주면 그것만) */
    events: (since = 0, type?: string) => rec.filter((e) => e.i >= since && (!type || e.type === type)),
    /** 덤: 레이어별 청크 통계·잠금 주인 */
    layers: () => g.chunks.layerStats?.() ?? [],
    locks: () => g.player.lockedBy?.() ?? [],
    /** dt 만 늦춘다(t·game.time 은 그대로 흐른다) */
    timeScale: (k: number) => { g.engine.timeScale = k; return k; },
  };
}
