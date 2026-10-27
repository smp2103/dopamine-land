// 빠른 이동 탈것 연출 — 비눗방울(커지기 → 둥실 떠오르기 → 하얗게 → 정류장 위로 → 내려앉기 → 퐁!)과 스키 리프트(줄 따라 설산 꼭대기).
// 플레이어는 Mountable 로 태운다(좌석을 따라간다). 시간은 dt 로 센다(engine.timeScale·촬영 정지를 따른다).
import * as THREE from 'three';
import type { Game, Mountable } from '../../core/game';
import { bigBubble, liftChair, popBurst, stepBurst } from './models';

export interface RideDest { x: number; z: number; label: string }
type Phase = 'grow' | 'rise' | 'hop' | 'fall' | 'pop' | 'lift' | 'done';

const RISE = 34;
const T = { grow: 0.7, rise: 1.7, fall: 1.7, pop: 0.45 };
const LIFT_SPEED = 11;
const LOCK = 'islanddev-ride';

/** 하얀 장막(화면 전체) */
class Veil {
  private el: HTMLDivElement | null = null;
  set(a: number) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function' || !document.body) return;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'islanddev-veil';
      Object.assign(this.el.style, { position: 'fixed', inset: '0', background: 'radial-gradient(circle at 50% 45%, #ffffff, #e3f6ff 70%, #cfeeff)', pointerEvents: 'none', zIndex: '40', opacity: '0' });
      document.body.appendChild(this.el);
    }
    this.el.style.opacity = String(Math.max(0, Math.min(1, a)));
    this.el.style.display = a <= 0.001 ? 'none' : 'block';
  }
}

export class Rides {
  private ph: Phase = 'done';
  private t = 0;
  private obj: THREE.Group | null = null;
  private seat: THREE.Object3D | null = null;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private dest: RideDest | null = null;
  private burst: THREE.Points | null = null;
  private burstT = 0;
  private veil = new Veil();
  private path: THREE.Vector3[] = [];
  private pathLen = 0;
  private cable: THREE.Line | null = null;
  private onDone: (() => void) | null = null;

  constructor(private game: Game, private root: THREE.Object3D, private rnd: () => number) {}

  get riding() { return this.ph !== 'done'; }

  /** 탈 수 있나(이유 문장 또는 null) */
  why(): string | null {
    const g = this.game;
    if (this.riding) return '벌써 타고 있어요!';
    if (g.world !== 'earth') return '여기선 비눗방울이 안 떠요 🫧';
    if (g.focusOverride) return '밖으로 나가서 타요!';
    return null;
  }

  private mountOn(obj: THREE.Group, name: string, cam: number, exitAt: () => THREE.Vector3) {
    const g = this.game, p = g.player;
    // 탈것(배·자전거)에 타고 있으면 먼저 내린다
    if (p.mounted) p.dismount();
    this.seat = obj.getObjectByName('seat') ?? obj;
    obj.updateMatrixWorld(true);
    const m: Mountable = {
      name, seat: this.seat, object: obj, camDistance: cam,
      drive: () => { /* 연출이 움직인다 */ },
      onExit: () => exitAt(),
    };
    p.lock(LOCK);
    p.mount(m, { silent: true });
    p.act('sit', Infinity);
  }

  /** 비눗방울 타고 dest 로 */
  bubble(dest: RideDest, onDone?: () => void): boolean {
    if (this.why()) return false;
    const g = this.game;
    this.dest = dest;
    this.onDone = onDone ?? null;
    this.from.copy(g.player.pos);
    const gy = g.groundAt(dest.x, dest.z);
    this.to.set(dest.x, Math.max(gy, 0), dest.z);
    const obj = bigBubble();
    obj.position.copy(this.from);
    obj.scale.setScalar(0.05);
    this.root.add(obj);
    this.obj = obj;
    this.mountOn(obj, '🫧 비눗방울', 1.5, () => this.to.clone());
    this.ph = 'grow';
    this.t = 0;
    g.audio?.sfx('bubbles', { pitch: 1.2 });
    return true;
  }

  /** 리프트: 점들을 따라(첫 점 = 타는 곳) */
  lift(points: THREE.Vector3[], exit: THREE.Vector3, onDone?: () => void): boolean {
    if (this.why() || points.length < 2) return false;
    this.path = points.map((p) => p.clone());
    this.pathLen = 0;
    for (let i = 1; i < this.path.length; i++) this.pathLen += this.path[i].distanceTo(this.path[i - 1]);
    this.to.copy(exit);
    this.onDone = onDone ?? null;
    const obj = liftChair();
    obj.position.copy(this.path[0]);
    this.root.add(obj);
    this.obj = obj;
    this.cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.path.map((p) => p.clone().add(new THREE.Vector3(0, 0.05, 0)))), new THREE.LineBasicMaterial({ color: '#5a6672' }));
    this.cable.frustumCulled = false;
    this.root.add(this.cable);
    this.mountOn(obj, '🚡 스키 리프트', 1.6, () => this.to.clone());
    this.ph = 'lift';
    this.t = 0;
    this.game.audio?.sfx('ui-open', { pitch: 0.7 });
    return true;
  }

  private at(u: number, out: THREE.Vector3) {
    let d = u * this.pathLen;
    for (let i = 1; i < this.path.length; i++) {
      const L = this.path[i].distanceTo(this.path[i - 1]);
      if (d <= L || i === this.path.length - 1) return out.copy(this.path[i - 1]).lerp(this.path[i], L > 0 ? Math.min(1, d / L) : 1);
      d -= L;
    }
    return out.copy(this.path[this.path.length - 1]);
  }

  private finish() {
    const g = this.game, p = g.player;
    if (p.mounted && this.seat && p.mounted.seat === this.seat) p.dismount();
    p.unlock(LOCK, true);
    p.act(null);
    if (this.obj) { this.root.remove(this.obj); disposeObj(this.obj); }
    if (this.cable) { this.root.remove(this.cable); this.cable.geometry.dispose(); this.cable = null; }
    this.obj = null;
    this.seat = null;
    this.veil.set(0);
    this.ph = 'done';
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  /** 중간에 끊기(세계 전환 등) — 그 자리에 내린다 */
  abort() {
    if (!this.riding) return;
    this.to.copy(this.game.player.pos);
    this.finish();
  }

  update(dt: number) {
    if (this.burst) {
      this.burstT += dt;
      stepBurst(this.burst, dt, 1 - this.burstT / 0.9);
      if (this.burstT > 0.9) { this.root.remove(this.burst); this.burst.geometry.dispose(); (this.burst.material as THREE.Material).dispose(); this.burst = null; }
    }
    if (this.ph === 'done' || !this.obj) return;
    const g = this.game;
    if (g.world !== 'earth') { this.abort(); return; }
    this.t += dt;
    const o = this.obj;
    const ease = (x: number) => x * x * (3 - 2 * x);
    const wob = Math.sin(g.time * 5) * 0.04;
    if (this.ph === 'grow') {
      const k = Math.min(1, this.t / T.grow);
      o.scale.set(k * (1 + wob), k * (1 - wob), k * (1 + wob));
      o.position.copy(this.from);
      if (this.t >= T.grow) { this.ph = 'rise'; this.t = 0; }
    } else if (this.ph === 'rise') {
      const k = Math.min(1, this.t / T.rise);
      o.scale.set(1 + wob, 1 - wob, 1 + wob);
      o.position.set(this.from.x + Math.sin(k * 6) * 0.6, this.from.y + RISE * ease(k), this.from.z + Math.cos(k * 5) * 0.4);
      this.veil.set((k - 0.62) / 0.38);
      if (this.t >= T.rise) { this.ph = 'hop'; this.t = 0; }
    } else if (this.ph === 'hop') {
      // 하얀 동안 정류장 위로 옮기고 그 근처 땅·청크를 미리 만든다
      o.position.set(this.to.x, this.to.y + RISE, this.to.z);
      g.ensureGround(this.to.x, this.to.z);
      this.ph = 'fall';
      this.t = 0;
    } else if (this.ph === 'fall') {
      const k = Math.min(1, this.t / T.fall);
      o.scale.set(1 + wob, 1 - wob, 1 + wob);
      o.position.set(this.to.x + Math.sin(k * 5) * 0.5 * (1 - k), this.to.y + RISE * (1 - ease(k)), this.to.z);
      this.veil.set(1 - k / 0.35);
      if (this.t >= T.fall) { this.ph = 'pop'; this.t = 0; }
    } else if (this.ph === 'pop') {
      const k = Math.min(1, this.t / T.pop);
      o.scale.setScalar(1 + k * 0.35);
      o.position.copy(this.to);
      if (this.t >= T.pop) {
        // 퐁!
        this.burst = popBurst(this.rnd);
        this.burst.position.copy(this.to);
        this.burstT = 0;
        this.root.add(this.burst);
        g.audio?.sfx('balloon-pop', { x: this.to.x, z: this.to.z });
        g.ui.toast(`🫧 ${this.dest?.label ?? ''} 도착!`);
        this.finish();
        return;
      }
    } else if (this.ph === 'lift') {
      const u = Math.min(1, (this.t * LIFT_SPEED) / Math.max(1, this.pathLen));
      this.at(u, o.position);
      // 의자가 살짝 흔들흔들
      o.rotation.set(Math.sin(g.time * 1.8) * 0.05, Math.atan2(this.path[this.path.length - 1].x - this.path[0].x, this.path[this.path.length - 1].z - this.path[0].z), 0);
      if (u >= 1) { g.ui.toast('🚡 꼭대기 도착! 슝 내려가 볼까?'); g.audio?.sfx('arrive'); this.finish(); return; }
    }
    o.updateMatrixWorld(true);
  }
}

function disposeObj(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
  });
}
