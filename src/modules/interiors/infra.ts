// 실내 기반(GDD 4.12 · 3.12 박물관 내부) — 실내 등록·들어가기·나오기.
// 들어갈 때: 화면을 살짝 가렸다 걷고(페이드) · game.focusOverride = 문 자리(청크 스트리밍이 문 주변에 머문다) ·
// 방 상자에 땅 공급자 + 바닥·벽 충돌체 · 아늑 카메라(곡률은 거의 0) · 실내 조명 묶음(따뜻한 점광원 + 해·하늘빛 덮어쓰기) ·
// 바깥은 가까운 안개 + 둥근 배경막으로 가리고 지구 묶음·청크는 숨긴다. 나올 때는 모두 되돌린다.
import * as THREE from 'three';
import { curveUniforms, applyCurve } from '../../core/curve';
import type { Game } from '../../core/game';

type V3 = THREE.Vector3;
const v3 = (p: V3 | (() => V3)) => (typeof p === 'function' ? p() : p).clone();

export interface InteriorBox { hx: number; hy: number; hz: number; x: number; y: number; z: number }
export interface InteriorDef {
  id: string;
  /** 들어갈 때 큰 이름 카드 */
  name?: string;
  sub?: string;
  color?: string;
  /** 먼 지구 자리(logic.interiorOrigin) */
  origin: V3;
  /** 처음 들어갈 때 한 번(이후 그대로 쓴다 — 바꾸려면 rebuild(id)) */
  build(): THREE.Object3D;
  /** 방 상자 안이면 바닥 높이, 밖이면 null */
  floorAt(x: number, z: number): number | null;
  /** 들어와 서는 자리 */
  spawn: V3 | (() => V3);
  /** 나가면 서는 바깥 자리(문 앞) */
  exitTo: V3 | (() => V3);
  /** 청크를 붙잡아 둘 문 자리(기본 exitTo) */
  door?: V3 | (() => V3);
  /** 정적 충돌 상자(월드 좌표) — 들어갈 때 깔고 나올 때 걷는다 */
  colliders?(): InteriorBox[];
  /** 아늑 카메라 값 */
  cam?: { dist?: number; pitch?: number; yaw?: number };
  /** 실내 점광원 자리(매 프레임 물어본다, 기본 origin 위 2.6 m) */
  lightAt?(): V3;
  /** 바깥 가리개 색 */
  backdrop?: string;
  onEnter?(): void;
  onExit?(): void;
  update?(t: number, dt: number): void;
}

/** 실내 조명 값(해·하늘빛·안개 덮어쓰기) */
const LIGHT = {
  hemiSky: '#fff4e0', hemiGround: '#e8c9a8', hemi: 1.25, sun: '#fff1d6', sunI: 1.55, exposure: 1.0, fogNear: 38, fogFar: 110,
  sunDir: new THREE.Vector3(0.38, 1, 0.62).normalize(),
};

export class InteriorHub {
  readonly root = new THREE.Group();
  private defs = new Map<string, InteriorDef>();
  private built = new Map<string, THREE.Object3D>();
  private cur: { id: string; def: InteriorDef; off: Array<() => void>; prev: Prev; out: number } | null = null;
  private light = new THREE.PointLight('#ffd9a8', 14, 26, 1.4);
  private fill = new THREE.PointLight('#ffe8f0', 5, 22, 1.6);
  private lights = new THREE.Group();
  private backdrop: THREE.Mesh;
  private backMat: THREE.MeshBasicMaterial;
  private fadeEl: HTMLDivElement | null = null;
  private listeners: Array<(id: string | null, prev: string | null) => void> = [];

  constructor(private game: Game) {
    this.root.name = 'interiors';
    this.lights.name = 'interiors-lights';
    this.light.castShadow = false;
    this.fill.castShadow = false;
    this.lights.add(this.light, this.fill);
    // 바깥 가리개: 카메라를 감싸는 둥근 막(위는 따뜻한 크림, 아래는 연보라 — 바다·땅이 비치지 않게)
    const g = new THREE.SphereGeometry(80, 32, 16);
    const col = new Float32Array(g.getAttribute('position').count * 3);
    const pos = g.getAttribute('position');
    const top = new THREE.Color('#fff3e2'), bot = new THREE.Color('#e3d2ec');
    for (let i = 0; i < pos.count; i++) {
      const k = THREE.MathUtils.clamp((pos.getY(i) / 80 + 0.4) / 1.2, 0, 1);
      const c = bot.clone().lerp(top, k);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.backMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: true, toneMapped: false });
    this.backdrop = new THREE.Mesh(g, this.backMat);
    this.backdrop.name = 'interiors-backdrop';
    this.backdrop.renderOrder = -10;
    this.backdrop.frustumCulled = false;
    this.backdrop.visible = false;
    this.backdrop.userData.noCurve = true;
    this.root.add(this.backdrop);
    this.installRenderHook();
  }

  register(def: InteriorDef): () => void {
    this.defs.set(def.id, def);
    return () => { if (this.cur?.id === def.id) this.exit(); this.defs.delete(def.id); };
  }
  has(id: string) { return this.defs.has(id); }
  ids() { return [...this.defs.keys()]; }
  current(): string | null { return this.cur?.id ?? null; }
  def(id: string) { return this.defs.get(id) ?? null; }
  /** 들어갔을 때 만든 모델(없으면 null) */
  object(id: string) { return this.built.get(id) ?? null; }
  /** 다음에 들어갈 때(또는 지금 안이면 바로) 다시 만든다 */
  rebuild(id: string) {
    const o = this.built.get(id);
    if (!o) return;
    this.root.remove(o);
    this.built.delete(id);
    if (this.cur?.id === id) this.ensureBuilt(this.cur.def).visible = true;
  }
  onChange(fn: (id: string | null, prev: string | null) => void) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }

  private ensureBuilt(def: InteriorDef) {
    let o = this.built.get(def.id);
    if (!o) {
      o = def.build();
      o.name ||= `interior:${def.id}`;
      applyCurve(o);
      this.built.set(def.id, o);
      this.root.add(o);
    }
    return o;
  }

  /** 들어가기. 이미 그 안이면 true, 모르는 id 면 false */
  enter(id: string): boolean {
    const def = this.defs.get(id);
    if (!def) return false;
    if (this.cur?.id === id) return true;
    if (this.cur) this.exit({ silent: true });
    const g = this.game;
    const p = g.player;
    if (p.mounted) p.dismount();
    const prev: Prev = {
      focus: g.focusOverride ? g.focusOverride.clone() : null,
      cam: { style: g.cam.style, yaw: g.cam.yaw, pitch: g.cam.pitch, dist: g.cam.dist },
      curveK: curveUniforms.uCurveK.value,
      hidden: [],
    };
    const off: Array<() => void> = [];
    this.fade();
    const obj = this.ensureBuilt(def);
    obj.visible = true;
    // 청크는 문 주변에 머문다
    g.focusOverride = v3(def.door ?? def.exitTo);
    off.push(g.addGroundProvider((x, z) => def.floorAt(x, z), `interiors:${id}`));
    for (const c of def.colliders?.() ?? []) {
      const body = g.physics.addStatic({ kind: 'box', hx: c.hx, hy: c.hy, hz: c.hz }, { x: c.x, y: c.y, z: c.z }, undefined, 'interior');
      off.push(() => body.remove());
    }
    // 바깥 숨기기(지구 묶음·청크) — 원래 보이던 것만 기억했다가 되돌린다
    const scene = g.engine?.scene as THREE.Scene | undefined;
    if (scene) {
      for (const o of scene.children) if (o.userData?.world === 'earth' && o.visible) { o.visible = false; prev.hidden.push(o); }
      if (!scene.children.includes(this.lights)) scene.add(this.lights);
    }
    if (g.chunks.root.visible) { g.chunks.root.visible = false; prev.chunks = true; }
    this.backdrop.visible = true;
    if (def.backdrop) this.backMat.color.set(def.backdrop); else this.backMat.color.set('#ffffff');
    // 들어서기 + 아늑 카메라
    const at = v3(def.spawn);
    p.teleport(at.x, at.z, at.y);
    p.yaw = 0;
    g.cam.setStyle('cozy');
    g.cam.yaw = def.cam?.yaw ?? 0;
    g.cam.pitch = def.cam?.pitch ?? 0.82;
    g.cam.dist = def.cam?.dist ?? 12;
    g.cam.target?.copy?.(p.pos);
    curveUniforms.uCurveK.value = 0.00012;
    this.placeLights(def);
    this.cur = { id, def, off, prev, out: 0 };
    if (def.name) g.hud.showRegion(def.name, def.sub ?? '', def.color ?? '#ffb37a');
    g.audio?.sfx('ui-open');
    try { def.onEnter?.(); } catch (e) { console.error(`[interiors ${id} onEnter]`, e); }
    g.state.emit({ type: 'interior', id, inside: true });
    for (const fn of this.listeners.slice()) fn(id, null);
    return true;
  }

  /** 나가기(바깥 문 앞으로). o.teleport=false 면 자리 이동 없이(세계 전환 중) */
  exit(o: { silent?: boolean; teleport?: boolean; keepWorldVis?: boolean } = {}): boolean {
    const c = this.cur;
    if (!c) return false;
    const g = this.game;
    this.cur = null;
    try { c.def.onExit?.(); } catch (e) { console.error(`[interiors ${c.id} onExit]`, e); }
    for (const f of c.off) { try { f(); } catch (e) { console.error('[interiors off]', e); } }
    const obj = this.built.get(c.id);
    if (obj) obj.visible = false;
    if (!o.keepWorldVis) for (const h of c.prev.hidden) h.visible = true;
    if (c.prev.chunks) g.chunks.root.visible = true;
    this.backdrop.visible = false;
    this.lights.parent?.remove(this.lights);
    g.focusOverride = c.prev.focus;
    if (o.teleport !== false) {
      if (!o.silent) this.fade();
      const at = v3(c.def.exitTo);
      g.player.teleport(at.x, at.z);
      g.player.yaw = Math.PI;
    }
    const pc = c.prev.cam;
    g.cam.setStyle(pc.style);
    g.cam.yaw = pc.yaw; g.cam.pitch = pc.pitch; g.cam.dist = pc.dist;
    if (typeof g.applyCurveForStyle === 'function') g.applyCurveForStyle(); else curveUniforms.uCurveK.value = c.prev.curveK;
    if (!o.silent) g.audio?.sfx('ui-close');
    g.state.emit({ type: 'interior', id: c.id, inside: false });
    for (const fn of this.listeners.slice()) fn(null, c.id);
    return true;
  }

  /** 매 프레임(모듈 onUpdate) */
  update(t: number, dt: number) {
    const c = this.cur;
    if (!c) return;
    const g = this.game;
    // V 로 카메라를 바꿔도 실내는 평평하게
    curveUniforms.uCurveK.value = 0.00012;
    const tgt = g.cam.target ?? g.player.pos;
    this.backdrop.position.set(tgt.x, tgt.y, tgt.z);
    this.placeLights(c.def);
    // 방 밖으로 새면(충돌 틈·순간이동 사고) 1초 뒤 들어온 자리로
    const p = g.player.pos;
    if (c.def.floorAt(p.x, p.z) === null) {
      c.out += dt;
      if (c.out > 1) { const at = v3(c.def.spawn); g.player.teleport(at.x, at.z, at.y); c.out = 0; }
    } else c.out = 0;
    try { c.def.update?.(t, dt); } catch (e) { console.error(`[interiors ${c.id} update]`, e); }
  }

  private placeLights(def: InteriorDef) {
    const at = def.lightAt?.() ?? def.origin.clone().add(new THREE.Vector3(0, 2.6, 0));
    this.light.position.copy(at);
    this.fill.position.copy(at).add(new THREE.Vector3(0, -0.6, 3.2));
  }

  // ───────────── 렌더 직전 조명 덮어쓰기 ─────────────
  /** 실내일 때만: 그리기 직전에 해·하늘빛·안개·노출을 실내 값으로, 그린 뒤 원래대로(atmosphere 가 바꾸지 않는 프레임에도 새지 않게) */
  private installRenderHook() {
    const eng = this.game.engine as unknown as EngineLike | undefined;
    const scene = eng?.scene;
    if (!scene || !eng?.sun || !eng?.hemi) return;
    const before = scene.onBeforeRender, after = scene.onAfterRender;
    let saved: Saved | null = null;
    const self = this;
    scene.onBeforeRender = function (this: THREE.Scene, ...a: Parameters<THREE.Object3D['onBeforeRender']>) {
      before.apply(this, a);
      if (!self.cur || saved) return;
      const fog = scene.fog as THREE.Fog | null;
      saved = {
        hemiC: eng.hemi.color.clone(), hemiG: eng.hemi.groundColor.clone(), hemiI: eng.hemi.intensity,
        sunC: eng.sun.color.clone(), sunI: eng.sun.intensity, sunP: eng.sun.position.clone(),
        rimI: eng.rim?.intensity ?? 0, exp: eng.renderer.toneMappingExposure,
        fog: fog ? { c: fog.color.clone(), n: fog.near, f: fog.far } : null,
      };
      eng.hemi.color.set(LIGHT.hemiSky); eng.hemi.groundColor.set(LIGHT.hemiGround); eng.hemi.intensity = LIGHT.hemi;
      eng.sun.color.set(LIGHT.sun); eng.sun.intensity = LIGHT.sunI;
      eng.sun.position.copy(eng.sun.target.position).addScaledVector(LIGHT.sunDir, 60);
      eng.sun.updateMatrixWorld(); eng.sun.target.updateMatrixWorld();
      if (eng.rim) eng.rim.intensity = 0.25;
      eng.renderer.toneMappingExposure = LIGHT.exposure;
      if (fog) { fog.color.set('#f4d7b8'); fog.near = LIGHT.fogNear; fog.far = LIGHT.fogFar; }
    };
    scene.onAfterRender = function (this: THREE.Scene, ...a: Parameters<THREE.Object3D['onAfterRender']>) {
      after.apply(this, a);
      const s = saved;
      if (!s) return;
      saved = null;
      eng.hemi.color.copy(s.hemiC); eng.hemi.groundColor.copy(s.hemiG); eng.hemi.intensity = s.hemiI;
      eng.sun.color.copy(s.sunC); eng.sun.intensity = s.sunI; eng.sun.position.copy(s.sunP);
      if (eng.rim) eng.rim.intensity = s.rimI;
      eng.renderer.toneMappingExposure = s.exp;
      const fog = scene.fog as THREE.Fog | null;
      if (fog && s.fog) { fog.color.copy(s.fog.c); fog.near = s.fog.n; fog.far = s.fog.f; }
    };
  }

  // ───────────── 페이드 ─────────────
  /** 화면을 바로 덮었다가 0.5초에 걸쳐 걷는다(자리 바꾸기는 그 자리에서 — 고정 시간 촬영에서도 맞는다) */
  private fade() {
    if (typeof document === 'undefined' || !document.body) return;
    let el = this.fadeEl;
    if (!el) {
      el = document.createElement('div');
      el.id = 'interiors-fade';
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0;background:radial-gradient(circle at 50% 45%,#fff8e8 0%,#ffe3c4 70%,#f2c39c 100%);';
      document.body.appendChild(el);
      this.fadeEl = el;
    }
    el.style.transition = 'none';
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'opacity 0.55s ease-out 0.08s';
    el.style.opacity = '0';
  }
}

interface Prev {
  focus: V3 | null;
  cam: { style: 'adventure' | 'cozy'; yaw: number; pitch: number; dist: number };
  curveK: number;
  hidden: THREE.Object3D[];
  chunks?: boolean;
}
interface Saved {
  hemiC: THREE.Color; hemiG: THREE.Color; hemiI: number; sunC: THREE.Color; sunI: number; sunP: V3; rimI: number; exp: number;
  fog: { c: THREE.Color; n: number; f: number } | null;
}
interface EngineLike {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  rim?: THREE.DirectionalLight;
  renderer: THREE.WebGLRenderer;
}
