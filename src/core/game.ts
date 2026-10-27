// 게임 뼈대: 입력·플레이어 이동(걷기·달리기·점프·수영·잠수·활공)·카메라(모험/아늑)·상호작용·탑승·수집 상태·세계 전환.
// 모듈은 ctx.game 으로 이 API 를 쓴다(CONTRACT.md 참고).
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
  locked = false;
  stamina = 1;
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

  init(x: number, z: number) {
    const ph = this.game.physics;
    const y = Island.heightAt(x, z) + this.footOff + 0.05;
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
    const gy = y ?? Island.heightAt(x, z);
    const yy = Math.max(gy, Island.waterLevelAt(x, z) - 0.8);
    this.body.setTranslation({ x, y: yy + this.footOff + 0.05, z }, true);
    this.body.setNextKinematicTranslation({ x, y: yy + this.footOff + 0.05, z });
    this.pos.set(x, yy, z);
    this.vel.set(0, 0, 0);
    this.game.chunks.update(this.pos, true);
    this.game.ensureGround(x, z);
  }

  mount(m: Mountable) {
    this.mounted = m;
    this.mode = 'mounted';
    this.collider.setEnabled(false);
    this.game.ui.toast(`${m.name} 탑승! (E 내리기)`);
  }

  dismount() {
    const m = this.mounted;
    if (!m) return;
    this.mounted = null;
    const at = m.onExit?.(this.game) ?? new THREE.Vector3().setFromMatrixPosition(m.seat.matrixWorld).add(new THREE.Vector3(1.2, 0, 0));
    this.collider.setEnabled(true);
    this.mode = 'air';
    this.teleport(at.x, at.z, Math.max(at.y, Island.heightAt(at.x, at.z)));
  }

  update(input: Input, dt: number, camYaw: number) {
    const g = this.game;
    if (this.mounted) {
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

    if (inWater && this.mode !== 'dive') this.mode = 'swim';
    if (!inWater && (this.mode === 'swim' || this.mode === 'dive')) this.mode = 'air';

    if (this.mode === 'swim' || this.mode === 'dive') {
      maxSpeed = run ? 5.5 : 3.4;
      if (input.hit('KeyC') || input.hit('ControlLeft')) this.mode = this.mode === 'dive' ? 'swim' : 'dive';
      const targetY = this.mode === 'dive' ? Math.max(Island.heightAt(this.pos.x, this.pos.z) + 0.5, this.waterY - 6) : this.waterY - 0.85;
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
    const target = wish.multiplyScalar(maxSpeed);
    const accel = this.mode === 'ground' ? 14 : this.mode === 'glide' ? 3 : 6;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, accel * dt);
    if (this.mode === 'glide' && wish.lengthSq() < 0.01) {
      // 활공 중 손을 놓아도 앞으로
      this.vel.x -= Math.sin(this.yaw) * 4 * dt;
      this.vel.z -= Math.cos(this.yaw) * 4 * dt;
    }

    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    // 깊은 바다로 걸어 들어가는 건 수영으로 이어진다(막지 않음). 맵 끝만 막는다.
    const b = Island.WORLD_BOUNDS;
    if (this.pos.x + desired.x < b.minX || this.pos.x + desired.x > b.maxX) desired.x = 0;
    if (this.pos.z + desired.z < b.minZ || this.pos.z + desired.z > b.maxZ) desired.z = 0;
    if (this.mode === 'swim' || this.mode === 'dive') this.controller.enableSnapToGround(0); else this.controller.enableSnapToGround(0.4);
    this.controller.computeColliderMovement(this.collider, desired);
    const mv = this.controller.computedMovement();
    const cur = this.body.translation();
    const next = { x: cur.x + mv.x, y: cur.y + mv.y, z: cur.z + mv.z };
    // 안전망: 지형 아래로 빠지면 끌어올린다
    const gy = Island.heightAt(next.x, next.z);
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
    // 카메라가 땅속으로 들어가지 않게
    const gy = Island.heightAt(want.x, want.z) + 0.6;
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
  label: string;
  /** 플레이어와 거리(가까울수록 우선) */
  dist: number;
  use: () => void;
  /** 키(기본 E) */
  key?: string;
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
}

// ───────────── 공유 런타임 객체 타입(느슨하게) ─────────────
export interface EnvApi { day?: number; hour: number; tod: string; weather: string; regionWeather?: (x: number, z: number) => string; moonPhase?: number; [k: string]: any }
export interface GeoApi { zoneAt?: (x: number, z: number) => { island: string | null; zone: string }; landmarks?: unknown; [k: string]: any }

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
  /** 담당끼리 런타임 공유 객체(GDD 0.6) — 만든 담당이 채운다. 없을 수 있으니 ?. 로 부른다 */
  env: EnvApi | null = null;
  econ: Record<string, any> | null = null;
  geo: GeoApi | null = null;
  ocean: { waveAt?: (x: number, z: number, t: number) => number; [k: string]: any } | null = null;
  time = 0;
  providers: Array<{ id: string; fn: InteractionProvider }> = [];
  points: PointInteractable[] = [];
  current: Interaction | null = null;
  updates: Array<(t: number, dt: number) => void> = [];
  worldHooks: Array<(w: 'earth' | 'space') => void> = [];
  groundBodies = new Map<string, PhysBody>();
  ready = false;

  constructor(public engine: Engine, public opts: GameOpts) {
    this.input = new Input(engine.renderer.domElement);
    this.player = new Player(this);
    this.cam = new CameraRig(this);
    this.ui = new GameUI(this);
    this.root.name = 'game';
    this.spaceRoot.name = 'space';
    this.spaceRoot.visible = false;
    engine.scene.add(this.root, this.chunks.root, this.spaceRoot);
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
    this.chunks.update(this.player.pos, true);
    this.cam.target.copy(this.player.pos);
    this.state.load();
    this.ui.mount();
    this.ready = true;
  }

  /** 순간이동 직후 발밑 충돌이 있게 */
  ensureGround(x: number, z: number) { this.chunks.update(new THREE.Vector3(x, 0, z), true); }

  applyCurveForStyle() {
    curveUniforms.uCurveK.value = this.cam.style === 'cozy' ? CURVE_K : 0.00012;
  }

  onUpdate(fn: (t: number, dt: number) => void) { this.updates.push(fn); }
  onWorld(fn: (w: 'earth' | 'space') => void) { this.worldHooks.push(fn); }

  addProvider(id: string, fn: InteractionProvider) { this.providers.push({ id, fn }); }
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
    this.chunks.update(this.player.pos);
    for (const fn of this.updates) fn(t, dt);
    this.cam.update(inp, dt);
    // 엔진 시점(그림자·심도·곡률 원점)을 플레이어에 맞춘다
    this.engine.viewTarget.copy(this.cam.target);
    curveUniforms.uCurveOrigin.value.set(this.cam.target.x, 0, this.cam.target.z);
    this.pickInteraction();
    if (this.current && inp.hit(this.current.key ?? 'KeyE')) this.current.use();
    else if (this.player.mounted && inp.hit('KeyE')) this.player.dismount();
    this.ui.update(dt);
    inp.endFrame();
  }

  private pickInteraction() {
    let best: Interaction | null = null;
    const p = this.player;
    if (!p.locked) {
      for (const pt of this.points) {
        if (pt.enabled && !pt.enabled()) continue;
        const d = pt.position().distanceTo(p.pos);
        if (d > pt.radius) continue;
        if (!best || d < best.dist) best = { label: typeof pt.label === 'function' ? pt.label() : pt.label, dist: d, use: pt.onUse };
      }
      for (const pr of this.providers) {
        let r: Interaction | null = null;
        try { r = pr.fn(p, this); } catch (e) { console.error(`[interaction ${pr.id}]`, e); }
        if (r && (!best || r.dist < best.dist)) best = r;
      }
    }
    this.current = best;
    this.ui.setPrompt(best ? `${(best.key ?? 'KeyE').replace('Key', '')} ${best.label}` : p.mounted ? 'E 내리기' : null);
  }
}
