// 도파민 1호 로켓(P0 연출, GDD 6.2): 부품 6 + 발사대(canLaunch)일 때만 탄다. 타면 9초 발사 → 달.
//   0s 쏙(창으로 얼굴) · 0.5s 손 흔들기(launch-wave) + 아래에서 올려다보는 카메라 · 1~4s 3·2·1(가운데 큰 숫자) + 진동 + 둥근 연기
//   4~7s 발사(불꽃 꼬리, 카메라가 군도 전체 높이까지) · 7~9s 남색 → 별 + 둥근 지구 · 9s 흰 페이드 → space:moon → launch → setWorld('space')
import * as THREE from 'three';
import type { Game } from '../../../core/game';
import { curveUniforms } from '../../../core/curve';
import * as M from '../models';
import { LaunchTimeline, completeLaunch, unlockKeyOf, type LaunchCue } from '../logic';
import type { LaunchFx } from '../launchfx';
import type { KindDef, Rt, Veh } from '../types';

const tmp = new THREE.Vector3();
const smooth = (a: number, b: number, t: number) => { const k = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

export const rocket: KindDef = {
  kind: 'rocket', name: '도파민 1호', medium: 'pad', boat: false, land: false, seats: 1,
  cam: 4.2, view: 3200, reach: 11, speed: 0, unlockKey: unlockKeyOf('rocket'), dex: 'v_rocket', focusY: 5.5, scale: 1.6,
  make: () => M.rocket(),
  // 움직임은 RocketLaunch 가 모듈 갱신에서 돌린다(drive 안에서 setWorld 하면 탑승 해제가 겹친다)
  drive() {},
  place(v, _t) {
    const m = v.model;
    if (!m) return;
    m.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), v.h);
    m.root.position.copy(v.pos);
    m.root.updateMatrixWorld(true);
  },
  exit(v) {
    resetRocket(v);
    // 발사탑 반대편 앞쪽에 내린다
    const f = new THREE.Vector3(Math.sin(v.h), 0, Math.cos(v.h));
    return v.pos.clone().addScaledVector(f, 9).add(new THREE.Vector3(Math.cos(v.h) * 2, 0, -Math.sin(v.h) * 2));
  },
};

/** 로켓을 발사대 위 처음 모습으로 */
export function resetRocket(v: Veh) {
  const m = v.model;
  if (!m) return;
  m.bits.body.position.set(0, 0.6, 0);
  m.bits.flame.visible = false;
  m.bits.flame.scale.setScalar(1);
  v.vy = 0;
  m.root.updateMatrixWorld(true);
}

/** 발사 한 번(탈 때 만들고, 끝나거나 내리면 버린다) */
export class RocketLaunch {
  readonly tl = new LaunchTimeline();
  /** 카메라가 보는 점(로켓 root 아래 — 흔들림을 여기에) */
  readonly eye = new THREE.Object3D();
  done = false;
  /** 이번 발사에서 setWorld 를 부른 횟수(1 이어야 한다) */
  worldCalls = 0;
  private prev: { dist: number; pitch: number; camDistance: number | undefined };
  private ascentY = 0;

  constructor(private v: Veh, private g: Game, private rt: Rt, private fx: LaunchFx | null) {
    const m = v.model!;
    m.root.add(this.eye);
    this.eye.position.set(0, 6.4, 0);
    this.prev = { dist: g.cam.dist, pitch: g.cam.pitch, camDistance: v.mountable.camDistance };
    v.mountable.object = this.eye;
    resetRocket(v);
    this.fx?.show();
    this.fx?.setSky(0);
    this.fx?.setWhite(0);
    // 0초 카메라: 로켓 앞(얼굴 쪽), 아래에서 올려다본다
    g.cam.yaw = v.h + 0.42;
    g.cam.pitch = -0.22;
    g.cam.dist = 7.5;
    this.step(0);
  }

  /** 매 프레임(모듈 갱신). dt=0(촬영 고정)이면 멈춘다 */
  step(dt: number) {
    if (this.done) return;
    const cues = this.tl.step(dt);
    for (const c of cues) this.cue(c);
    if (this.done) return;
    this.animate(dt);
  }

  private cue(c: LaunchCue) {
    const g = this.g;
    switch (c) {
      case 'board': g.player.act?.('sit'); break;
      case 'wave':
        this.rt.emit('launch-wave');
        g.player.act?.('wave', 1.6);
        break;
      case 'count3': this.fx?.count('3'); break;
      case 'count2': this.fx?.count('2'); break;
      case 'count1': this.fx?.count('1'); break;
      case 'ignite':
        this.fx?.count('발사!');
        this.v.model!.bits.flame.visible = true;
        g.player.act?.('cheer', 3);
        break;
      case 'sky': break;
      case 'white': this.finish(); break;
    }
  }

  /** 시간에 따른 움직임·카메라·연기 */
  private animate(dt: number) {
    const v = this.v, g = this.g, rt = this.rt, t = this.tl.t;
    const m = v.model!;
    const body = m.bits.body, flame = m.bits.flame;
    const base = tmp.setFromMatrixPosition(body.matrixWorld);
    const bx = base.x, by = base.y, bz = base.z;
    // 진동: 카운트다운 동안 점점 세게, 발사 직후 가장 세고 올라가며 잦아든다
    const shake = t < 1 ? 0 : t < 4 ? 0.015 + (t - 1) * 0.02 : Math.max(0.02, 0.12 * Math.exp(-(t - 4) * 1.2));
    const jx = (rt.rnd() - 0.5) * shake, jz = (rt.rnd() - 0.5) * shake;
    if (t < 4) {
      body.position.set(jx, 0.6, jz);
      // 둥근 연기 뭉게뭉게(발사대 둘레)
      const rate = t < 1 ? 6 : 14 + (t - 1) * 10;
      if (dt > 0 && rt.rnd() < dt * rate) {
        const a = rt.rnd() * Math.PI * 2;
        rt.puffs.emit(bx + Math.cos(a) * 2.0, by + 0.3, bz + Math.sin(a) * 2.0, Math.cos(a) * 3.5, 0.6 + rt.rnd(), Math.sin(a) * 3.5,
          { life: 2.4, s0: 0.7, s1: 1.9, color: rt.rnd() < 0.5 ? '#ffffff' : '#f6eefa', drag: 1.2 });
      }
      if (t > 3.2) flame.visible = rt.rnd() < 0.5; // 점화 직전 깜빡
    } else {
      // 상승: 점점 빠르게(3초 만에 약 600 m) — 불꽃 꼬리 + 연기 기둥
      const T = t - 4;
      this.ascentY = 2.4 * T * T * T + 22 * T * T;
      body.position.set(jx, 0.6 + this.ascentY / (v.def.scale ?? 1), jz);
      flame.visible = true;
      flame.scale.set(1 + 0.12 * Math.sin(t * 50), 1.2 + 0.3 * Math.sin(t * 37) + Math.min(1.2, T * 0.6), 1 + 0.12 * Math.sin(t * 43));
      const n = Math.min(10, dt * 150);
      for (let i = 0; i < 10 && rt.rnd() < n - i; i++) {
        const a = rt.rnd() * Math.PI * 2, r = rt.rnd() * 1.2;
        const near = this.ascentY < 14;
        const sp = near ? 8 + rt.rnd() * 7 : 1.5 + rt.rnd() * 3;
        rt.puffs.emit(bx + Math.cos(a) * r, by - 1.4, bz + Math.sin(a) * r, Math.cos(a) * sp, near ? 0.4 + rt.rnd() : -3 - rt.rnd() * 4, Math.sin(a) * sp,
          { life: 2.6 + rt.rnd() * 2, s0: 0.8 + rt.rnd() * 0.5, s1: (near ? 3.0 : 2.2) + rt.rnd() * 1.6, color: rt.rnd() < 0.5 ? '#ffffff' : '#f6eefa', drag: near ? 1.3 : 0.6 });
        rt.fire.emit(bx + Math.cos(a) * r * 0.6, by - 1.8, bz + Math.sin(a) * r * 0.6, Math.cos(a) * 2.5, -18 - rt.rnd() * 8, Math.sin(a) * 2.5,
          { life: 0.4, s0: 0.8, s1: 0.3, color: rt.rnd() < 0.5 ? '#ffb347' : '#ffe08a', drag: 2 });
      }
    }
    m.root.updateMatrixWorld(true);
    // 카메라: 처음엔 아래에서 올려다보고(0.5~4s), 발사하면 따라 올라가며 멀어져 군도 전체가 보이게(곡률도 크게)
    const up = smooth(4.2, 7.2, t);
    this.eye.position.set(jx * 6, body.position.y + 6.0 - up * 2, jz * 6);
    g.cam.pitch = THREE.MathUtils.lerp(-0.24, 0.62, up);
    g.cam.dist = 7.5;
    v.mountable.camDistance = THREE.MathUtils.lerp(4.2, 120, up * up);
    g.cam.yaw += (v.h + 0.42 + up * 0.5 - g.cam.yaw) * Math.min(1, dt * 1.5);
    curveUniforms.uCurveK.value = THREE.MathUtils.lerp(g.cam.style === 'cozy' ? 0.0045 : 0.00012, 0.00042, up);
    // 하늘: 7~8.6s 남색 → 별 + 지구, 8.5~9s 흰 페이드
    this.fx?.setSky(smooth(7, 8.6, t));
    this.fx?.setWhite(smooth(8.5, 9, t));
  }

  /** 9초: 해금 → launch → setWorld(정확히 한 번) */
  private finish() {
    if (this.done) return;
    this.done = true;
    this.fx?.setWhite(1);
    this.restoreCam();
    this.worldCalls++;
    completeLaunch(this.g);
  }

  /** 카메라·곡률 되돌리기 */
  restoreCam() {
    const g = this.g;
    g.cam.dist = this.prev.dist;
    g.cam.pitch = Math.max(0.15, this.prev.pitch);
    this.v.mountable.camDistance = this.prev.camDistance ?? this.v.def.cam;
    this.v.mountable.object = this.v.focus;
    g.applyCurveForStyle?.();
    this.eye.removeFromParent();
  }

  /** 도중에 끝남(내림·세계 바뀜): 덮개를 치우고 로켓을 되돌린다 */
  abort() {
    if (this.done) return;
    this.done = true;
    this.restoreCam();
    this.fx?.hide();
    resetRocket(this.v);
  }
}
