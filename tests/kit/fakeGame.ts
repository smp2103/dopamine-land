// 테스트 키트 — 화면·WebGL·Rapier 없이 모듈을 띄우는 가짜 게임(계약 v2 의 Game 표면).
// 상태(GameState)와 HUD 저장소(HudRegistryStore)와 상호작용 고르기(selectInteractions)는 진짜를 쓰고,
// 나머지(플레이어·청크·물리·엔진·입력·env)는 기록하는 대역이다. 서비스 슬롯(econ·geo·ocean …)은 기본 null.
//
//   const game = makeFakeGame({ pos: [10, -4] });
//   const ctx = makeCtx(game);
//   await buildMyModule(ctx);
//   game.tick(1 / 60, 30);
//   game.interact('mymod:thing');
import * as THREE from 'three';
import { GameState, type Species } from '../../src/core/state';
import * as Island from '../../src/core/island';
import { PALETTE } from '../../src/core/palette';
import { TOD, type TodPreset } from '../../src/core/presets';
import { rngFor } from '../../src/core/rng';
import { HudRegistryStore, makeDexFacade } from '../../src/core/registry';
import { selectInteractions, promptText, DEFAULT_KEY } from '../../src/core/interact';
import {
  DAY_SEC, HOUR_SEC, START_HOUR, todOf, isNoon, isMidnight, weekdayOf, seasonOf, moonPhaseOf, isFullMoon, isEclipse,
  type EnvApi, type EconApi, type GeoApi, type OceanApi, type SpaceApi, type VehiclesApi, type AudioApi,
  type Weather, type RegionId, type Witness, type WitnessSource, type WitnessRegistry, type DexFacade,
  type HudRenderer, type PanelDef, type PanelCtx, type BannerOpts, type CardOpts, type GaugeOpts, type Variant, type Activity,
} from '../../src/core/api';
import type { ChunkLayer } from '../../src/core/chunks';
import type { Ctx, ScatterOpts } from '../../src/core/types';
import type { Game } from '../../src/core/game';
import { ensureBrowserStubs, onStorageSwap } from './storage';

// ───────────── 타입 ─────────────
export type World = 'earth' | 'space';
export type MoveMode = 'ground' | 'air' | 'glide' | 'swim' | 'dive' | 'mounted';

/** 계약 v2 Interaction(id·whileMounted·priority 추가분 포함) */
export interface FakeInteraction {
  id?: string;
  label: string;
  dist: number;
  use: () => void;
  key?: string;
  whileMounted?: boolean;
  priority?: number;
}
export type FakeProvider = (p: FakePlayer, game: FakeGame) => FakeInteraction | null;
export interface FakePoint {
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
/** listInteractions() 한 줄 */
export interface InteractionRow {
  id: string;
  label: string;
  key: string;
  dist: number;
  priority: number;
  whileMounted: boolean;
  source: 'point' | 'provider';
  use: () => void;
}

/** ui.showCatch 인자(계약 v2 3장) */
export interface FakeCatchShow {
  species: Species;
  sizeText?: string;
  model?: THREE.Object3D;
  line?: string;
  size?: number;
  variant?: Variant;
  activity?: Activity | string;
  /** false = 목격(도감만) */
  keep?: boolean;
}

export interface FakeGameOpts {
  /** location.search(예: '?p0=0&fresh=1'). 주면 location 을 새로 깐다 */
  search?: string;
  /** 플레이어 시작 자리 [x, z](기본 Island.HERO.player) */
  pos?: [number, number];
  /** 시작 세계(기본 earth) */
  world?: World;
  /** false 면 game.env = null(기본 = 아래 env 대역) */
  env?: boolean;
  /** env 대역 시작 시각(기본 START_HOUR) */
  hour?: number;
  /** env 대역 시작 날(기본 0) */
  day?: number;
  /** 시작할 때 state.load() 를 부를지(기본 true — 저장 대역에 든 걸 불러온다) */
  load?: boolean;
  /**
   * true 면 진짜 400ms 묶음 저장(state.save 그대로 — 디바운스·pagehide 를 시험할 때).
   * 기본 false: state.save() 가 그 자리에서 바로 쓴다 → 늦게 깨어난 타이머가 다음 테스트 저장소를 덮지 않는다.
   */
  debounce?: boolean;
}

// ───────────── 살아 있는 가짜 게임들 ─────────────
const live = new Set<FakeGame>();
/** 살아 있는 가짜 게임을 전부 dispose(묶인 저장은 쓰지 않고 버린다). stubLocalStorage() 가 저절로 부른다 */
export function resetKit() { for (const g of [...live]) g.dispose(); }
/** 지금 살아 있는(dispose 안 한) 가짜 게임 수 */
export function liveGames() { return live.size; }
// 저장소를 갈아 끼우면 옛 게임의 묶인 저장·pagehide 가 새 저장소에 새지 않게
onStorageSwap(resetKit);


// ───────────── 입력 대역 ─────────────
/** game.input 대역 — press(code) 는 다음 tick 한 프레임 동안 hit, hold(code) 는 떼기 전까지 down */
export class FakeInput {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseDX = 0; mouseDY = 0; wheel = 0;
  dragging = false;
  down(code: string) { return this.keys.has(code); }
  hit(code: string) { return this.pressed.has(code); }
  /** 이번 프레임에 한 번 눌렀다 */
  press(...codes: string[]) { for (const c of codes) this.pressed.add(c); return this; }
  /** 누르고 있기 */
  hold(code: string, on = true) { if (on) { if (!this.keys.has(code)) this.pressed.add(code); this.keys.add(code); } else this.keys.delete(code); return this; }
  release(code: string) { this.keys.delete(code); return this; }
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; }
  axis() {
    const x = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    const y = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    return { x, y };
  }
}

// ───────────── 플레이어 대역 ─────────────
export interface FakeMountable { name: string; seat?: THREE.Object3D; object?: THREE.Object3D; onExit?: (game: FakeGame) => THREE.Vector3 | void; [k: string]: unknown }

export class FakePlayer {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  mode: MoveMode = 'ground';
  action: string | null = null;
  /** action 이 저절로 풀리는 game.time(없으면 계속) */
  actionUntil: number | null = null;
  mounted: FakeMountable | null = null;
  speed = 0;
  stamina = 1;
  groundY = 0;
  waterY = -Infinity;
  avatar: { root: THREE.Object3D; holdSlot?: THREE.Object3D; [k: string]: unknown } | null = null;
  readonly radius = 0.32;
  readonly halfH = 0.34;
  readonly footOff = 0.66;
  /** 잠금 주인 → 겹친 수 */
  readonly lockOwners = new Map<string, number>();
  private legacyLocked = false;
  /** act() 기록 */
  readonly acts: Array<{ name: string; seconds: number; t: number }> = [];
  /** teleport() 기록 */
  readonly teleports: Array<{ x: number; y: number; z: number }> = [];

  constructor(private game: FakeGame) {}

  /** 잠긴 주인 수 > 0 이거나 예전 방식(locked = true) */
  get locked() { return this.lockOwners.size > 0 || this.legacyLocked; }
  set locked(v: boolean) { this.legacyLocked = v; }
  lock(owner = 'legacy') { this.lockOwners.set(owner, (this.lockOwners.get(owner) ?? 0) + 1); }
  /** 그 주인의 잠금 하나 풀기. all=true 면 그 주인 것을 전부(진짜 Player 와 같다) */
  unlock(owner = 'legacy', all = false) {
    const n = this.lockOwners.get(owner);
    if (n === undefined) return;
    if (all || n <= 1) this.lockOwners.delete(owner); else this.lockOwners.set(owner, n - 1);
  }
  /** 지금 잠근 주인들(디버그) */
  lockedBy(): string[] { return [...this.lockOwners.keys(), ...(this.legacyLocked ? ['(legacy)'] : [])]; }

  /** 동작 포즈(seconds 뒤 풀림, 0 이하면 계속) */
  act(name: string | null, seconds = 0) {
    this.action = name;
    this.actionUntil = name && seconds > 0 ? this.game.time + seconds : null;
    if (name) this.acts.push({ name, seconds, t: this.game.time });
  }

  /** 땅 높이(지면 공급자 → 섬) 위로 옮긴다 — 진짜 Player.teleport 와 같은 계산 */
  teleport(x: number, z: number, y?: number) {
    const claimed = this.game.groundProviderAt(x, z);
    const gy = y ?? claimed ?? Island.heightAt(x, z);
    // 공급자(실내·행성)가 맡은 곳은 그 바닥이 정답 — 바다 높이로 끌어올리지 않는다
    const yy = claimed !== null ? gy : Math.max(gy, Island.waterLevelAt(x, z) - 0.8);
    this.pos.set(x, yy, z);
    this.vel.set(0, 0, 0);
    this.teleports.push({ x, y: yy, z });
    this.game.chunks.update(this.game.focusOverride ?? this.pos, true);
  }

  mount(m: FakeMountable) { this.mounted = m; this.mode = 'mounted'; }
  dismount() {
    const m = this.mounted;
    if (!m) return;
    this.mounted = null;
    // 진짜처럼 내리면 잠깐 'air'(다음 프레임 착지는 대역에 없음 — 테스트가 mode 를 직접 본다)
    this.mode = 'air';
    const at = m.onExit?.(this.game) ?? (m.seat
      ? new THREE.Vector3().setFromMatrixPosition(m.seat.matrixWorld).add(new THREE.Vector3(1.2, 0, 0))
      : this.pos.clone().add(new THREE.Vector3(1.2, 0, 0)));
    this.teleport(at.x, at.z, Math.max(at.y, this.game.groundAt(at.x, at.z)));
  }

  setAvatar(a: { root: THREE.Object3D; [k: string]: unknown }) { this.avatar = a; this.game.root.add(a.root); }
  facing() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
}

// ───────────── 청크 대역 ─────────────
/** game.chunks 대역 — add 는 레이어를 쌓기만, buildAt 으로 원하는 칸을 직접 짓는다 */
export class FakeChunks {
  root = new THREE.Group();
  layers: Array<{ layer: ChunkLayer; live: Map<string, { obj: THREE.Object3D | null }> }> = [];
  focus = new THREE.Vector3();
  world: World = 'earth';
  detail = 1;
  budgetMs = 6;
  pending = 0;
  /** update() 부른 횟수 */
  updates = 0;
  constructor() { this.root.name = 'chunks'; }

  add(layer: ChunkLayer) { this.layers.push({ layer, live: new Map() }); }
  /** key 로 레이어 찾기 */
  layer(key: string): ChunkLayer | null { return this.layers.find((L) => L.layer.key === key)?.layer ?? null; }
  keys() { return this.layers.map((L) => L.layer.key); }

  /** 레이어 key 의 (cx, cz) 칸을 지어 돌려준다(root 에는 안 붙인다). 모르는 key 면 예외 */
  buildAt(key: string, cx: number, cz: number): THREE.Object3D | null {
    const L = this.layers.find((x) => x.layer.key === key);
    if (!L) throw new Error(`[fakeChunks] 모르는 레이어 '${key}' (있는 것: ${this.keys().join(', ') || '없음'})`);
    const s = L.layer.size;
    return L.layer.build({ cx, cz, x0: cx * s, z0: cz * s, size: s });
  }
  /** 월드 좌표 (x, z) 가 든 칸을 짓는다 */
  buildAtWorld(key: string, x: number, z: number) {
    const l = this.layer(key);
    if (!l) throw new Error(`[fakeChunks] 모르는 레이어 '${key}'`);
    return this.buildAt(key, Math.floor(x / l.size), Math.floor(z / l.size));
  }
  /** 같은 칸을 두 번 지으면 같은가(결정성) — 메시 수·위치 합을 비교할 요약 */
  signature(key: string, cx: number, cz: number) {
    const o = this.buildAt(key, cx, cz);
    if (!o) return 'null';
    o.updateMatrixWorld(true);
    let n = 0, sx = 0, sy = 0, sz = 0;
    const v = new THREE.Vector3(), m = new THREE.Matrix4();
    o.traverse((x) => {
      n++;
      v.setFromMatrixPosition(x.matrixWorld); sx += v.x; sy += v.y; sz += v.z;
      const im = x as THREE.InstancedMesh;
      if (im.isInstancedMesh) for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); v.setFromMatrixPosition(m); sx += v.x; sy += v.y; sz += v.z; }
    });
    return `${n}:${sx.toFixed(3)}:${sy.toFixed(3)}:${sz.toFixed(3)}`;
  }
  /** 진짜 스트리밍은 안 한다 — 초점만 적는다 */
  update(focus: THREE.Vector3, _force = false) { this.focus.copy(focus); this.updates++; }
}

// ───────────── 물리 대역 ─────────────
export interface FakeBody {
  opts: Record<string, unknown>;
  removed: boolean;
  remove(): void;
  body: {
    translation(): { x: number; y: number; z: number };
    setTranslation(p: { x: number; y: number; z: number }, wake?: boolean): void;
    linvel(): { x: number; y: number; z: number };
    setLinvel(v: { x: number; y: number; z: number }, wake?: boolean): void;
    applyImpulse(v: { x: number; y: number; z: number }, wake?: boolean): void;
    setNextKinematicTranslation(p: { x: number; y: number; z: number }): void;
    isSleeping(): boolean;
    wakeUp(): void;
  };
  mesh?: THREE.Object3D;
}

/** game.physics 대역 — add/addStatic 은 {remove()} 를 돌려주고, 살아 있는 몸체 수를 센다 */
export class FakePhysics {
  bodies: FakeBody[] = [];
  statics: FakeBody[] = [];
  gravity = -22;
  step = 1 / 60;
  accumulator = 0;
  waterLevel: (x: number, z: number) => number = () => -Infinity;
  get live() { return this.bodies.filter((b) => !b.removed).length + this.statics.filter((b) => !b.removed).length; }
  private make(list: FakeBody[], opts: Record<string, unknown>, pos?: { x: number; y: number; z: number }): FakeBody {
    const p = { x: 0, y: 0, z: 0, ...(pos ?? (opts.position as object) ?? {}) };
    const v = { x: 0, y: 0, z: 0 };
    const b: FakeBody = {
      opts, removed: false, mesh: opts.mesh as THREE.Object3D | undefined,
      remove: () => { b.removed = true; const i = list.indexOf(b); if (i >= 0) list.splice(i, 1); },
      body: {
        translation: () => ({ ...p }),
        setTranslation: (q) => { Object.assign(p, q); },
        linvel: () => ({ ...v }),
        setLinvel: (q) => { Object.assign(v, q); },
        applyImpulse: (q) => { v.x += q.x; v.y += q.y; v.z += q.z; },
        setNextKinematicTranslation: (q) => { Object.assign(p, q); },
        isSleeping: () => false,
        wakeUp: () => {},
      },
    };
    list.push(b);
    return b;
  }
  add(opts: Record<string, unknown>) { return this.make(this.bodies, opts); }
  /** 진짜와 같은 모양(shape, pos, rotation?, tag?) — 예전 호출(셋째 칸에 객체)도 받아 준다 */
  addStatic(shape: unknown, pos?: { x: number; y: number; z: number }, rotation?: unknown, tag?: string) {
    const isQuat = !!rotation && typeof (rotation as { isQuaternion?: boolean }).isQuaternion === 'boolean';
    const extra = rotation && !isQuat ? rotation as Record<string, unknown> : {};
    return this.make(this.statics, { shape, position: pos, ...(isQuat ? { rotation } : {}), ...(tag !== undefined ? { tag } : {}), ...extra }, pos);
  }
  setGravity(g: number) { this.gravity = g; }
  update(_dt: number) { /* 물리 없음 */ }
}

// ───────────── HUD 렌더러 기록기 ─────────────
export interface RecordingRenderer extends HudRenderer {
  /** 부른 순서대로 [이름, ...인자] */
  log: Array<[string, ...unknown[]]>;
  toasts: string[];
  banners: BannerOpts[];
  cards: CardOpts[];
  gauges: Map<string, GaugeOpts>;
  regions: Array<[string, string, string, string | undefined]>;
  /** 지금 열려 있다고 그린 패널(닫으면 null) */
  openDef: PanelDef | null;
  /** 마지막으로 받은 패널 ctx(setTab·close 를 테스트에서 직접 부를 수 있다) */
  lastCtx: PanelCtx | null;
  clear(): void;
}

/** 그리지 않고 기록만 하는 HudRenderer */
export function recordingRenderer(): RecordingRenderer {
  const r: RecordingRenderer = {
    log: [], toasts: [], banners: [], cards: [], gauges: new Map(), regions: [], openDef: null, lastCtx: null,
    openPanel(def, ctx) { r.log.push(['openPanel', def.kind, ctx.tab]); r.openDef = def; r.lastCtx = ctx; },
    renderPanel(def, ctx) { r.log.push(['renderPanel', def.kind, ctx.tab]); r.openDef = def; r.lastCtx = ctx; },
    closePanel() { r.log.push(['closePanel']); r.openDef = null; },
    showBanner(b) { r.log.push(['showBanner', b]); r.banners.push(b); },
    showCard(c) { r.log.push(['showCard', c]); r.cards.push(c); },
    setGauge(id, g) { r.log.push(['setGauge', id, g]); r.gauges.set(id, g); },
    refreshChips() { r.log.push(['refreshChips']); },
    toast(t) { r.log.push(['toast', t]); r.toasts.push(t); },
    showRegion(name, sub, color, dark) { r.log.push(['showRegion', name]); r.regions.push([name, sub, color, dark]); },
    drawLayersHint() { r.log.push(['drawLayersHint']); },
    addPanel(d) { r.log.push(['addPanel', d.kind]); },
    addChip(c) { r.log.push(['addChip', c.id]); },
    addHotkey(h) { r.log.push(['addHotkey', h.code]); },
    addLayer(l) { r.log.push(['addLayer', l.id]); },
    removeChip(id) { r.log.push(['removeChip', id]); },
    removeHotkey(h) { r.log.push(['removeHotkey', h.code]); },
    removeLayer(id) { r.log.push(['removeLayer', id]); },
    clear() { r.log.length = 0; r.toasts.length = 0; r.banners.length = 0; r.cards.length = 0; r.gauges.clear(); r.regions.length = 0; },
  };
  return r;
}

// ───────────── UI 대역 ─────────────
export class FakeUI {
  toasts: string[] = [];
  /** setPrompt 의 마지막 [주, 대체] */
  prompt: [string | null, string | null] = [null, null];
  /** showCatch 기록(isNew 함께) */
  catches: Array<FakeCatchShow & { isNew: boolean }> = [];
  held: { obj: THREE.Object3D; until: number } | null = null;
  renderCatch: ((c: FakeCatchShow, isNew: boolean) => void) | null = null;
  constructor(private game: FakeGame) {}
  toast(text: string) { this.toasts.push(text); }
  setPrompt(primary: string | null, alt?: string | null) { this.prompt = [primary, alt ?? null]; }
  /** 도감 기록(+ keep 이 false 가 아니면 가방) — state.collect 에 opts 를 그대로 넘긴다 */
  showCatch(c: FakeCatchShow): boolean {
    const st = this.game.state as unknown as { collect(e: Record<string, unknown>): boolean };
    const isNew = !!st.collect({ species: c.species, size: c.size, variant: c.variant, activity: c.activity, keep: c.keep });
    if (c.model) this.held = { obj: c.model, until: this.game.time + 2.2 };
    this.catches.push({ ...c, isNew });
    this.renderCatch?.(c, isNew);
    return isNew;
  }
  refreshCoins() { /* 그리기 없음 */ }
  update(_dt: number) { if (this.held && this.game.time >= this.held.until) this.held = null; }
}

// ───────────── env 대역(EnvApi) ─────────────
export interface FakeEnv extends EnvApi {
  /** forceWeather 기록: region → {w, until(gameSec, 없으면 무한)} */
  forced: Map<string, { w: Weather; until: number | null }>;
  /** 섬(region) → 평소 날씨(테스트가 바꿔 끼운다) */
  base: Map<string, Weather>;
  /** 플레이어 자리 region(기본 'home') */
  regionAtPlayer: () => RegionId;
}

/**
 * 순수 객체 env. advance/setHour 는 시각만 다시 계산하고 아무 이벤트도 쏘지 않는다
 * (진짜 atmosphere 는 tod·day·env 이벤트를 쏜다 — 그건 atmosphere 테스트 몫).
 */
export function makeFakeEnv(o: { hour?: number; day?: number; regionAt?: () => RegionId } = {}): FakeEnv {
  const forced = new Map<string, { w: Weather; until: number | null }>();
  const base = new Map<string, Weather>();
  const env = {
    gameSec: (o.day ?? 0) * DAY_SEC + (o.hour ?? START_HOUR) * HOUR_SEC,
    day: 0, hour: 0, minute: 0, tod: 'day', noon: false, midnight: false, weekday: 0, season: 'spring',
    moonPhase: 0, fullMoon: false, eclipse: false, weather: 'clear', waveMul: 1,
    forced, base,
    regionAtPlayer: o.regionAt ?? (() => 'home'),
    weatherOf(region: RegionId): Weather {
      const f = forced.get(region) ?? forced.get('*');
      if (f && (f.until === null || env.gameSec < f.until)) return f.w;
      return base.get(region) ?? 'clear';
    },
    regionWeather(_x: number, _z: number): Weather { return env.weatherOf(env.regionAtPlayer()); },
    /** 대역: 강제 날씨가 그때까지 남아 있으면 그것, 아니면 평소 날씨 */
    forecast(region: RegionId, hoursAhead: number): Weather {
      const at = env.gameSec + hoursAhead * HOUR_SEC;
      const f = forced.get(region) ?? forced.get('*');
      if (f && (f.until === null || at < f.until)) return f.w;
      return base.get(region) ?? 'clear';
    },
    forceWeather(region: RegionId | '*', w: Weather | null, hours?: number) {
      if (w === null) { if (region === '*') forced.clear(); else forced.delete(region); }
      else forced.set(region, { w, until: hours !== undefined ? env.gameSec + hours * HOUR_SEC : null });
      recompute();
    },
    advance(sec: number) { env.gameSec = Math.max(0, env.gameSec + sec); recompute(); },
    setHour(h: number) {
      const day = Math.floor(env.gameSec / DAY_SEC);
      env.gameSec = day * DAY_SEC + (((h % 24) + 24) % 24) * HOUR_SEC;
      recompute();
    },
  };
  function recompute() {
    const day = Math.floor(env.gameSec / DAY_SEC);
    const hour = (env.gameSec - day * DAY_SEC) / HOUR_SEC;
    env.day = day;
    env.hour = hour;
    env.minute = Math.floor((hour % 1) * 60);
    env.tod = todOf(hour);
    env.noon = isNoon(hour);
    env.midnight = isMidnight(hour);
    env.weekday = weekdayOf(day);
    env.season = seasonOf(day);
    env.moonPhase = moonPhaseOf(env.gameSec);
    env.fullMoon = isFullMoon(env.moonPhase);
    env.eclipse = isEclipse(env.moonPhase);
    // 끝난 강제 날씨는 지운다
    for (const [k, f] of forced) if (f.until !== null && env.gameSec >= f.until) forced.delete(k);
    env.weather = env.weatherOf(env.regionAtPlayer());
    env.waveMul = env.weather === 'storm' ? 2 : 1;
  }
  recompute();
  return env as unknown as FakeEnv;
}

// ───────────── 목격 등록(진짜와 같은 동작) ─────────────
export function makeWitnesses(): WitnessRegistry & { sources: WitnessSource[] } {
  const sources: WitnessSource[] = [];
  return {
    sources,
    add(fn) { sources.push(fn); return () => { const i = sources.indexOf(fn); if (i >= 0) sources.splice(i, 1); }; },
    list() {
      const out: Witness[] = [];
      for (const fn of sources) { try { out.push(...fn()); } catch (e) { console.error('[witness]', e); } }
      return out;
    },
  };
}

// ───────────── 가짜 게임 ─────────────
export class FakeGame {
  readonly fake = true;
  state: GameState;
  ui: FakeUI;
  player: FakePlayer;
  chunks = new FakeChunks();
  physics = new FakePhysics();
  input = new FakeInput();
  engine = { timeScale: 1, camName: 'adventure', scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000), viewTarget: new THREE.Vector3() };
  cam = { yaw: 0, pitch: 0.32, dist: 7.5, style: 'adventure' as 'adventure' | 'cozy', target: new THREE.Vector3(), setStyle(s: 'adventure' | 'cozy') { this.style = s; } };
  root = new THREE.Group();
  spaceRoot = new THREE.Group();
  hud = new HudRegistryStore();
  /** hud 에 붙어 있는 기록 렌더러 */
  hudLog: RecordingRenderer = recordingRenderer();
  witnesses = makeWitnesses();
  focusOverride: THREE.Vector3 | null = null;
  /** 타이틀을 떠나 놀고 있나(진짜는 main 이 'game:start' 와 함께 true) — 시험은 기본으로 이미 놀이 중. 타이틀부터 보려면 false 로 두고 start() */
  started = true;
  ext: Record<string, any> = {};

  // 서비스 슬롯(주인이 채운다) — env 만 기본으로 대역이 들어 있다
  env: EnvApi | null;
  econ: EconApi | null = null;
  geo: GeoApi | null = null;
  ocean: OceanApi | null = null;
  space: SpaceApi | null = null;
  vehicles: VehiclesApi | null = null;
  audio: AudioApi | null = null;

  time = 0;
  frame = 0;
  ready = true;
  opts: FakeGameOpts;
  providers: Array<{ id: string; fn: FakeProvider }> = [];
  points: FakePoint[] = [];
  updates: Array<(t: number, dt: number) => void> = [];
  worldHooks: Array<(w: World) => void> = [];
  groundProviders: Array<{ id: string; fn: (x: number, z: number) => number | null }> = [];
  current: InteractionRow | null = null;
  currentAlt: InteractionRow | null = null;
  consumedKeys = new Set<string>();
  /** interact() 로 돌린 id 기록 */
  used: string[] = [];
  private _world: World = 'earth';
  private _dex: DexFacade | null = null;

  constructor(opts: FakeGameOpts = {}) {
    this.opts = opts;
    ensureBrowserStubs(opts.search);
    this.state = new GameState();
    if (!opts.debounce) {
      // 이 인스턴스만 바로 쓰기로(타이머·창 이벤트 없음)
      const st = this.state as unknown as { save: () => void; saveNow: () => void };
      st.save = () => st.saveNow();
    }
    live.add(this);
    if (opts.load !== false) this.state.load();
    this.ui = new FakeUI(this);
    this.player = new FakePlayer(this);
    this.env = opts.env === false ? null : makeFakeEnv({ hour: opts.hour, day: opts.day });
    this.hud.attach(this.hudLog);
    this.root.name = 'game';
    this.spaceRoot.name = 'space';
    this.engine.scene.add(this.root, this.chunks.root, this.spaceRoot);
    this._world = opts.world ?? 'earth';
    this.chunks.world = this._world;
    this.spaceRoot.visible = this._world === 'space';
    const [x, z] = opts.pos ?? [Island.HERO.player.x, Island.HERO.player.z];
    this.player.teleport(x, z);
  }

  get world(): World { return this._world; }
  /** 예전 이름 game.dex(hud 위의 외관) */
  get dex(): DexFacade { return (this._dex ??= makeDexFacade(this.hud)); }

  // ── 매 프레임·세계
  onUpdate(fn: (t: number, dt: number) => void) { this.updates.push(fn); return () => { const i = this.updates.indexOf(fn); if (i >= 0) this.updates.splice(i, 1); }; }
  onWorld(fn: (w: World) => void) { this.worldHooks.push(fn); return () => { const i = this.worldHooks.indexOf(fn); if (i >= 0) this.worldHooks.splice(i, 1); }; }
  setWorld(w: World, spawn?: THREE.Vector3) {
    if (this.player.mounted) this.player.dismount();
    this._world = w;
    this.chunks.world = w;
    this.spaceRoot.visible = w === 'space';
    this.physics.setGravity(w === 'space' ? -4.5 : -22);
    for (const fn of [...this.worldHooks]) fn(w);
    if (spawn) this.player.teleport(spawn.x, spawn.z, spawn.y);
  }

  // ── 지면 공급자
  addGroundProvider(fn: (x: number, z: number) => number | null, id = `ground-${this.groundProviders.length}`) {
    const entry = { id, fn };
    this.groundProviders.push(entry);
    return () => { const i = this.groundProviders.indexOf(entry); if (i >= 0) this.groundProviders.splice(i, 1); };
  }
  /** 공급자가 맡은 높이(아무도 안 맡으면 null). 넘어진 공급자는 건너뛴다(진짜와 같다) */
  groundProviderAt(x: number, z: number): number | null {
    for (const p of this.groundProviders) {
      let h: number | null | undefined = null;
      try { h = p.fn(x, z); } catch (e) { console.error(`[ground ${p.id}]`, e); }
      if (typeof h === 'number' && Number.isFinite(h)) return h;
    }
    return null;
  }
  /** 바닥 높이: 공급자 우선, 없으면 섬 지형(진짜 Game.groundAt 과 같은 뜻 — 늘 숫자) */
  groundAt(x: number, z: number): number { return this.groundProviderAt(x, z) ?? Island.heightAt(x, z); }
  /** groundAt 의 옛 이름 */
  heightAt(x: number, z: number) { return this.groundAt(x, z); }
  ensureGround(_x: number, _z: number) { /* 물리 지면 없음 */ }

  // ── 상호작용
  addProvider(id: string, fn: FakeProvider) {
    const row = { id, fn };
    this.providers.push(row);
    return () => { const i = this.providers.indexOf(row); if (i >= 0) this.providers.splice(i, 1); };
  }
  removeProvider(id: string) { this.providers = this.providers.filter((p) => p.id !== id); }
  addInteractable(p: FakePoint) { this.points.push(p); return () => { this.points = this.points.filter((x) => x !== p); }; }

  /** 지금 후보 전부(잠금 중엔 없음, 거르기·정렬 전). 공급자 id 는 Interaction.id ?? 공급자 id */
  private collectCandidates(): InteractionRow[] {
    const p = this.player;
    if (p.locked) return [];
    const out: InteractionRow[] = [];
    for (const pt of this.points) {
      try {
        if (pt.enabled && !pt.enabled()) continue;
        const d = pt.position().distanceTo(p.pos);
        if (!(d <= pt.radius)) continue;
        out.push({
          id: pt.id, label: typeof pt.label === 'function' ? pt.label() : pt.label, key: pt.key ?? DEFAULT_KEY, dist: d,
          priority: pt.priority ?? 0, whileMounted: !!pt.whileMounted, source: 'point', use: pt.onUse,
        });
      } catch (e) { console.error(`[interactable ${pt.id}]`, e); }
    }
    for (const pr of this.providers) {
      let r: FakeInteraction | null = null;
      try { r = pr.fn(p, this); } catch (e) { console.error(`[interaction ${pr.id}]`, e); }
      if (!r) continue;
      out.push({
        id: r.id ?? pr.id, label: r.label, key: r.key ?? DEFAULT_KEY, dist: r.dist,
        priority: r.priority ?? 0, whileMounted: !!r.whileMounted, source: 'provider', use: r.use,
      });
    }
    return out;
  }

  /** 지금 고를 수 있는 상호작용(가까운 순) — 진짜처럼 거리가 유한한 것만, 탔을 땐 whileMounted 만 */
  listInteractions(): InteractionRow[] {
    const mounted = !!this.player.mounted;
    return this.collectCandidates()
      .filter((c) => Number.isFinite(c.dist) && (!mounted || c.whileMounted))
      .sort((a, b) => a.dist - b.dist);
  }

  /** current(E)·currentAlt(그 밖의 키) 고르기 — 진짜 selectInteractions 를 쓴다 */
  pickInteraction() {
    const pick = selectInteractions(this.collectCandidates(), !!this.player.mounted);
    this.current = pick.current;
    this.currentAlt = pick.alt;
    this.consumedKeys = pick.consumed;
    this.ui.setPrompt(promptText(pick.current) ?? (this.player.mounted ? 'E 내리기' : null), promptText(pick.alt));
    return pick;
  }

  /**
   * id 로 바로 쓰기(진짜 Game.interact 와 같다): 지금 후보에 있으면(탔을 땐 whileMounted 만) 그걸,
   * 없고 force 면 같은 id 의 점 상호작용을 거리 무시하고(window.__dl.interact 가 쓰는 길). 돌렸으면 true.
   * 진짜처럼 use() 가 던져도 삼킨다 — 대신 useErrors 에 적는다.
   */
  interact(id: string, o: { force?: boolean } = {}): boolean {
    const mounted = !!this.player.mounted;
    const c = this.collectCandidates().find((x) => x.id === id && (!mounted || x.whileMounted));
    if (c) { this.safeUse(id, c.use); return true; }
    if (o.force) {
      const pt = this.points.find((x) => x.id === id && (!x.enabled || x.enabled()));
      if (pt) { this.safeUse(id, pt.onUse); return true; }
    }
    return false;
  }
  /** interact()·키 처리에서 use() 가 던진 것 */
  useErrors: Array<{ id: string; error: unknown }> = [];
  private safeUse(id: string, use: () => void) {
    this.used.push(id);
    try { use(); } catch (e) { this.useErrors.push({ id, error: e }); console.error(`[interaction ${id}]`, e); }
  }

  // ── 시간
  /**
   * dt 초짜리 프레임을 n 번 돌린다(진짜 Game.update 순서를 줄인 것):
   * 시간 → 동작 풀기 → 청크 → 상호작용 고르기 → 눌린 키 처리 → onUpdate → ui → 입력 비우기.
   * env 대역은 저절로 흐르지 않는다(env.advance 로 직접).
   */
  /** 타이틀 끝(main 흉내): started = true + 'game:start' 알림 */
  start(skipped = true) {
    this.started = true;
    this.state.emit({ type: 'game:start', skipped } as never);
  }

  tick(dt = 1 / 60, n = 1) {
    for (let i = 0; i < n; i++) {
      const d = dt * (this.engine.timeScale ?? 1);
      this.time += d;
      this.frame++;
      const p = this.player;
      if (p.actionUntil !== null && this.time >= p.actionUntil) { p.action = null; p.actionUntil = null; }
      this.chunks.update(this.focusOverride ?? p.pos);
      // 진짜 Game 과 같은 순서: 고르기 → 키 처리 → 모듈 갱신(같은 프레임 단축키가 consumedKeys 를 보게)
      this.pickInteraction();
      const inp = this.input;
      const cur = this.current, alt = this.currentAlt;
      if (cur && inp.hit(cur.key)) this.safeUse(cur.id, cur.use);
      else if (p.mounted && inp.hit(DEFAULT_KEY)) p.dismount();
      if (alt && inp.hit(alt.key)) this.safeUse(alt.id, alt.use);
      for (const fn of [...this.updates]) {
        try { fn(this.time, d); } catch (e) { console.error('[fakeGame onUpdate]', e); throw e; }
      }
      this.ui.update(d);
      inp.endFrame();
    }
    return this;
  }

  /** 저장을 바로 쓴다(v2 saveNow 가 있으면 그것, 없으면 save) */
  flushSave() {
    const st = this.state as unknown as { saveNow?: () => void; save: () => void };
    if (typeof st.saveNow === 'function') st.saveNow(); else st.save();
  }

  /** dispose 했나 */
  disposed = false;
  /**
   * 테스트 끝 정리: 묶인 저장 타이머를 지우고(flush=true 면 먼저 쓰고) state 의 pagehide·visibilitychange 를 뗀다.
   * 게임 객체는 계속 읽을 수 있지만, 이후 debounce 저장은 다시 걸릴 수 있다(그땐 또 dispose).
   */
  dispose(o: { flush?: boolean } = {}) {
    const st = this.state as unknown as {
      flush?: () => void; saveTimer?: ReturnType<typeof setTimeout> | null; flushHooked?: boolean;
      onLeave?: EventListener; onVis?: EventListener;
    };
    if (o.flush) st.flush?.();
    if (st.saveTimer != null) { clearTimeout(st.saveTimer); st.saveTimer = null; }
    if (st.flushHooked) {
      const gg = globalThis as unknown as { removeEventListener?: (t: string, f: EventListener) => void; document?: { removeEventListener?: (t: string, f: EventListener) => void } };
      if (st.onLeave) gg.removeEventListener?.('pagehide', st.onLeave);
      if (st.onVis) gg.document?.removeEventListener?.('visibilitychange', st.onVis);
      st.flushHooked = false;
    }
    this.disposed = true;
    live.delete(this);
  }

  /** 진짜 Game 타입이 필요한 곳(ctx.game)에 넘길 때 */
  asGame(): Game { return this as unknown as Game; }
}

export function makeFakeGame(opts: FakeGameOpts = {}): FakeGame { return new FakeGame(opts); }

/** state 이벤트를 모은다. 돌려준 off() 로 그만 듣기(v1 state.on 은 해제가 없어 막아 둔다) */
export function recordEvents(game: { state: GameState }) {
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  let live = true;
  const off = (game.state.on as (fn: (e: { type: string; [k: string]: unknown }) => void) => unknown)((e) => { if (live) events.push(e); });
  return {
    events,
    types: () => events.map((e) => e.type),
    of: (type: string) => events.filter((e) => e.type === type),
    clear: () => { events.length = 0; },
    off: () => { live = false; if (typeof off === 'function') (off as () => void)(); },
  };
}

// ───────────── 모듈 ctx ─────────────
export interface FakeCtx extends Omit<Ctx, 'onTodChange'> {
  /** 시간대 이름이 바뀔 때만(name, prev) */
  onTodChange: (fn: (name: string, prev: string) => void) => () => void;
  /** 테스트에서 시간대 바꾸기: onTod 는 늘, onTodChange 는 이름이 바뀔 때만 부른다 */
  setTod(name: string): void;
  /** 진짜 타입으로 쓰는 game 말고, 대역 그대로 */
  fake: FakeGame;
  /** scatter 가 차지한 점(avoidOccupied 용) */
  occupied: Array<{ x: number; z: number; r: number }>;
}

/** 모듈 기본 내보내기에 넘길 ctx. game 을 안 주면 새로 만든다 */
export function makeCtx(game: FakeGame = makeFakeGame()): FakeCtx {
  const todFns: Array<(name: string, p: TodPreset) => void> = [];
  const changeFns: Array<(name: string, prev: string) => void> = [];
  const occupied: Array<{ x: number; z: number; r: number }> = [];
  const scene = game.engine.scene;
  const ctx: FakeCtx = {
    scene,
    renderer: null as unknown as THREE.WebGLRenderer,
    camera: game.engine.camera,
    island: Island,
    palette: PALETTE,
    rng: rngFor,
    onUpdate: (fn) => game.onUpdate(fn),
    onTod: (fn) => { todFns.push(fn); },
    onTodChange: (fn) => { changeFns.push(fn); return () => { const i = changeFns.indexOf(fn); if (i >= 0) changeFns.splice(i, 1); }; },
    scatter: (o) => scatter(o, occupied),
    tod: 'day',
    game: game.asGame(),
    fake: game,
    occupied,
    setTod(name: string) {
      const prev = ctx.tod;
      ctx.tod = name;
      const p = TOD[name] ?? TOD.day;
      for (const fn of [...todFns]) fn(name, p);
      if (name !== prev) for (const fn of [...changeFns]) fn(name, prev);
    },
  };
  return ctx;
}

/** 결정적 다트 던지기 배치(진짜 푸아송과 같은 계약: 최소 간격·accept·차지 피하기) */
function scatter(o: ScatterOpts, occupied: Array<{ x: number; z: number; r: number }>) {
  const rng = rngFor(`scatter:${o.key}`);
  const b = o.bounds ?? Island.ISLAND_BOUNDS;
  const out: Array<{ x: number; z: number; y: number }> = [];
  const avoid = o.avoidOccupied !== false;
  const tries = Math.max(30, o.count * 30);
  const md2 = o.minDist * o.minDist;
  for (let i = 0; i < tries && out.length < o.count; i++) {
    const x = b.minX + rng() * (b.maxX - b.minX);
    const z = b.minZ + rng() * (b.maxZ - b.minZ);
    if (out.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < md2)) continue;
    if (avoid && occupied.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < q.r * q.r)) continue;
    if (!o.accept(x, z)) continue;
    out.push({ x, z, y: Island.heightAt(x, z) });
  }
  if (o.occupy !== 0) {
    const r = typeof o.occupy === 'number' ? o.occupy : o.minDist * 0.5;
    for (const q of out) occupied.push({ x: q.x, z: q.z, r });
  }
  return out;
}
