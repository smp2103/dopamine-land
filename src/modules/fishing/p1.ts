// 낚시 P1 런타임(GDD 3.5 P1 · 3.7 P1) — fishing.ts 가 installP1(host) 로 붙인다. 규칙은 순수 파일들:
//   트롤링(trolling.ts) · 얼음 구멍(icehole.ts) · 돛등이 대결(contest.ts) · 릴 줄다리기(reel.ts → fight.ts).
//   ① 트롤링: 먼바다·심해에서 배가 달리는 동안 배 뒤로 루어를 끈다(물살 거품 = 줄 끌림 연출). ★4+ 는 줄다리기.
//   ② 모래 낚시 장식: 모래시계섬 모래 언덕(dune)에서 모래 그림자(지느러미 + 모래 먼지)가 어슬렁 — 캐스팅은 fishing.ts(medium 'sand').
//   ③ 얼음 구멍: 솜눈섬 언 호수 구멍은 날마다 다시 언다 → E 연타로 뚫고 → 줄 내리기 → 꾹 → 타이밍 릴.
//   ④ 돛등이와 낚시 대결: 쿵쿵공룡섬 늪가에 앉은 돛등이(spino.ts)에게 E → 3분 점수 대결, 이기면 그날 첫 승에 황금 미끼 ×5.
//   ⑤ 협동 릴 돕기: 친구가 줄다리기 중이면(net-coop start) 'E 같이 감기' 로 help 신호를 보낸다.
// flags.fishing.ice = {day, open[]} · flags.fishing.spino = {played, wins, lastWinDay, best} · flags.fishing.troll = 트롤링 횟수
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import type { Game } from '../../core/game';
import type { Activity, RollResult } from '../../core/api';
import { applyCurve } from '../../core/curve';
import type { FishSpecies } from './data';
import * as L from './logic';
import * as T from './trolling';
import * as I from './icehole';
import * as K from './contest';
import * as R from './reel';
import type { ReelFight } from './fight';
import { buildSpino, animateSpino, disposeSpino, type SpinoModel } from './spino';
import { buildFishModel, disposeModel, worldLength } from './model';
import { canvasTex, overWater, ringGeo, ringTex, shadowTex, sparkTex } from './shadows';

/** fishing.ts 가 넘겨 주는 것 */
export interface P1Host {
  game: Game;
  ctx: Ctx;
  root: THREE.Group;
  rng: () => number;
  roll(q: L.PreRollQuery): RollResult;
  /** 구역 후보(strict = 표대로만, p1 = 심해 등 P1 종 포함) */
  pool(zone: string, island: string | null, o?: { p1?: boolean; strict?: boolean }): L.PoolFish[];
  speciesOf(r: RollResult | null | undefined): FishSpecies | undefined;
  /** 잡았다(showCatch·reportCatch·쓰레기 카드) + 대결 점수 — at = 낚은 자리 */
  resolve(r: RollResult, activity: Activity, at: { x: number; z: number }): void;
  fail(activity: Activity): void;
  rodTier(): L.RodTier;
  splash(x: number, y: number, z: number, big?: number): void;
  /** 낚싯대를 손에 들고 pitch(앞 기울기)·yawOff(몸 기준 돌림)로 — 끝(tip) 월드 좌표 */
  poseRod(pitch: number, yawOff?: number): THREE.Vector3;
  hideRod(): void;
  /** 기본 낚시가 쉬는 중인가 */
  idle(): boolean;
  /** 지금 고른 미끼(없으면 undefined) · 쓰기 */
  bait(): string | undefined;
  useBait(id: string): void;
  fight: ReelFight;
  flags(): Record<string, unknown>;
  save(): void;
}

/** 꾹!/톡! 말풍선(작게) */
const ggukTex = canvasTex(256, 128, (g) => {
  g.fillStyle = '#ff7eb6'; g.strokeStyle = '#ffffff'; g.lineWidth = 8;
  g.beginPath(); g.roundRect(14, 14, 228, 96, 46); g.fill(); g.stroke();
  g.font = 'bold 66px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
  g.fillText('꾹!', 128, 66);
});
const tokTex = canvasTex(256, 128, (g) => {
  g.fillStyle = '#fffaf0'; g.strokeStyle = '#c9a77a'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(14, 14, 228, 96, 46); g.fill(); g.stroke();
  g.font = 'bold 64px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#8a6a4a';
  g.fillText('톡!', 128, 66);
});
/** 얼음 뚜껑: 하늘빛 얼음 + 금 간 무늬 + 눈 */
const lidTex = canvasTex(256, 256, (g) => {
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, '#f4fbff'); gr.addColorStop(0.7, '#d4ecfa'); gr.addColorStop(1, '#b8dcf2');
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(140,190,225,0.8)'; g.lineWidth = 4; g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = i * 1.07;
    g.beginPath(); g.moveTo(128, 128);
    g.lineTo(128 + Math.cos(a) * 60, 128 + Math.sin(a) * 60);
    g.lineTo(128 + Math.cos(a + 0.25) * 110, 128 + Math.sin(a + 0.25) * 110);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [x, y, r] of [[80, 70, 22], [170, 90, 16], [150, 180, 26], [70, 170, 14]] as const) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
});
/** 모래 먼지 */
const dustTex = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,210,0.95)'); gr.addColorStop(0.6, 'rgba(240,215,170,0.5)'); gr.addColorStop(1, 'rgba(240,215,170,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});

// 공유 지오메트리
const lidGeo = (() => { const g = new THREE.CylinderGeometry(1, 1.06, 0.14, 32); g.userData.shared = true; return g; })();
const lidMat = new THREE.MeshStandardMaterial({ map: lidTex, color: '#ffffff', roughness: 0.25, metalness: 0, emissive: '#cfe9ff', emissiveIntensity: 0.18 });
lidMat.userData.shared = true;
const finGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0.35, 0); s.quadraticCurveTo(0.2, 0.55, -0.12, 1); s.quadraticCurveTo(-0.22, 0.45, -0.4, 0); s.lineTo(0.35, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -0.04); g.computeVertexNormals(); g.userData.shared = true;
  return g;
})();

// ───────────── 캔버스 미터(얼음 구멍 타이밍) ─────────────
const TW = 360, TH = 140;
function drawTiming(g: CanvasRenderingContext2D, s: I.Timing, pos: number, flash: 'hit' | 'miss' | null) {
  g.clearRect(0, 0, TW, TH);
  g.fillStyle = 'rgba(255,248,232,0.95)'; g.strokeStyle = '#9cc9e6'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(8, 8, TW - 16, TH - 16, 30); g.fill(); g.stroke();
  const x0 = 36, x1 = TW - 36, y = 72, w = x1 - x0;
  g.fillStyle = '#e4f1fa'; g.beginPath(); g.roundRect(x0, y - 16, w, 32, 16); g.fill();
  g.fillStyle = flash === 'hit' ? '#5fe0b0' : '#9ff0d2';
  g.beginPath(); g.roundRect(x0 + (s.center - s.width / 2) * w, y - 16, s.width * w, 32, 14); g.fill();
  // 하트 표시
  const hx = x0 + pos * w;
  g.fillStyle = flash === 'miss' ? '#ff5a6a' : '#ff7eb6';
  g.beginPath();
  g.moveTo(hx, y + 12);
  g.bezierCurveTo(hx - 22, y - 2, hx - 12, y - 22, hx, y - 10);
  g.bezierCurveTo(hx + 12, y - 22, hx + 22, y - 2, hx, y + 12);
  g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
  // 맞힌 수 · 빗나간 수
  g.font = 'bold 24px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#4a3b2a';
  const pips = Array.from({ length: s.need }, (_, i) => (i < s.hits ? '●' : '○')).join(' ');
  g.fillText(`민트 칸에서 E!  ${pips}`, TW / 2, 30);
  g.fillStyle = '#ff7a8a';
  g.fillText(s.misses ? '✕'.repeat(s.misses) : '', TW / 2, 112);
}

interface Hole { id: string; x: number; z: number; r: number; level: number }

export function installP1(h: P1Host) {
  const { game, ctx, root } = h;
  const island = ctx.island;
  const W = window as unknown as Record<string, unknown>;
  const day = () => game.env?.day ?? (() => { try { return game.econ?.day() ?? 0; } catch { return 0; } })();
  const fl = () => h.flags();

  // 공용 연출
  const sprite = (map: THREE.Texture, w: number, hgt: number) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true }));
    s.scale.set(w, hgt, 1); s.renderOrder = 10; s.visible = false; root.add(s);
    return s;
  };
  const gguk = sprite(ggukTex, 1.2, 0.6);
  const tok = sprite(tokTex, 1.0, 0.5);
  const mkLine = (n: number) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
    const ln = new THREE.Line(geo, mat);
    ln.frustumCulled = false; ln.visible = false; root.add(ln);
    return ln;
  };
  const _v = new THREE.Vector3();
  const drawLine = (ln: THREE.Line, a: THREE.Vector3, b: THREE.Vector3, sag: number) => {
    const pa = ln.geometry.attributes.position as THREE.BufferAttribute;
    const n = pa.count;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      _v.copy(a).lerp(b, k);
      _v.y -= Math.sin(k * Math.PI) * sag;
      pa.setXYZ(i, _v.x, _v.y, _v.z);
    }
    pa.needsUpdate = true;
    ln.visible = true;
  };
  /** 물고기가 뛰어올라 손(또는 돛등이 입)으로 — 0.45초 */
  const leaps: Array<{ obj: THREE.Object3D; t0: number; from: THREE.Vector3; to: () => THREE.Vector3; done?: () => void }> = [];
  const leap = (sp: FishSpecies | undefined, from: THREE.Vector3, to: () => THREE.Vector3, done?: () => void, sizeCm?: number) => {
    if (!sp) { done?.(); return; }
    const obj = buildFishModel(sp, ctx.rng(`fishing-p1:leap:${leaps.length}:${Math.floor(game.time * 10)}`));
    const len = THREE.MathUtils.clamp(worldLength(sp, sizeCm ?? sp.len), 0.35, 1.8);
    obj.scale.setScalar(len / ((obj.userData.modelLen as number | undefined) ?? 1));
    applyCurve(obj);
    root.add(obj);
    leaps.push({ obj, t0: game.time, from: from.clone(), to, done });
  };

  // ════════════════ ① 트롤링 ════════════════
  const lure = new THREE.Group();
  {
    const pink = new THREE.MeshPhysicalMaterial({ color: '#ff9fb8', roughness: 0.3, clearcoat: 1, emissive: '#ff9fb8', emissiveIntensity: 0.25 });
    const gold = new THREE.MeshPhysicalMaterial({ color: '#ffe08a', roughness: 0.25, metalness: 0.5, clearcoat: 1 });
    const bodyM = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.16, 8, 16), pink);
    bodyM.rotation.z = Math.PI / 2; lure.add(bodyM);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 12), gold);
    tail.rotation.z = Math.PI / 2; tail.position.x = -0.17; lure.add(tail);
    const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    eyeW.position.set(0.1, 0.03, 0.05); lure.add(eyeW);
  }
  lure.visible = false; root.add(lure);
  const trollLine = mkLine(28);
  // 물살 거품(줄 끌림)
  const WAKE_N = 18;
  const wakeMat = overWater(new THREE.MeshBasicMaterial({ map: ringTex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
  const wakes = Array.from({ length: WAKE_N }, () => {
    const m = new THREE.Mesh(ringGeo, wakeMat.clone());
    m.renderOrder = 7; m.visible = false; root.add(m);
    return { m, born: -99, x: 0, y: 0, z: 0, s: 1 };
  });
  let wakeI = 0, wakeAt = -99;
  const foam = (x: number, y: number, z: number, s = 1) => {
    const w = wakes[wakeI++ % WAKE_N];
    w.born = game.time; w.x = x; w.y = y; w.z = z; w.s = s; w.m.visible = true;
  };
  const troll = {
    s: null as T.Troll | null, roll: null as RollResult | null, fight: false, d0: T.LURE_BACK,
    pos: new THREE.Vector3(), zone: 'offshore', count: 0,
    /** 디버그: 배가 서 있어도 달리는 셈 치기(꾹까지) */
    force: false,
  };
  const vehicleNow = () => { try { return game.vehicles?.current?.() ?? null; } catch { return null; } };
  const seaAt = (x: number, z: number) => { try { return game.geo?.zoneAt?.(x, z)?.sea ?? null; } catch { return null; } };
  const seaY = (x: number, z: number, t: number) => {
    const oc = game.ocean;
    if (oc && typeof oc.waveAt === 'function') { const y = oc.waveAt(x, z, t); if (Number.isFinite(y)) return y; }
    return 0;
  };
  const stopTroll = (msg?: string) => {
    if (!troll.s) return;
    if (troll.fight) h.fight.stop();
    troll.s = null; troll.roll = null; troll.fight = false; troll.force = false;
    lure.visible = false; trollLine.visible = false; gguk.visible = false;
    h.hideRod();
    if (game.player.action === 'fish' || game.player.action === 'reel') game.player.act(null);
    if (msg) game.ui.toast(msg);
  };
  const startTroll = () => {
    const pl = game.player;
    const sea = seaAt(pl.pos.x, pl.pos.z);
    troll.zone = T.trollZone(sea);
    const bonus = h.rodTier() === 'goodrod' || h.rodTier() === 'goldrod' ? L.ROD_WINDOW_BONUS : 0;
    troll.s = T.newTroll(h.rng(), bonus);
    troll.fight = false; troll.roll = null; troll.d0 = T.LURE_BACK;
    troll.count++;
    const f = fl(); f.troll = (Number(f.troll) || 0) + 1; h.save();
    pl.act('fish');
    game.audio?.sfx('cast', { x: pl.pos.x, z: pl.pos.z });
    game.ui.toast(troll.zone === 'deep' ? '심해 위 트롤링! 계속 달리면 큰 게 물어요 🌊' : '트롤링 시작! 배를 계속 달려요 ⛵🎣');
  };
  const trollHook = () => {
    const r = troll.roll;
    gguk.visible = false;
    if (!r) return;
    if (L.needsFight(r)) {
      const sp = h.speciesOf(r);
      troll.fight = true;
      troll.d0 = T.LURE_BACK;
      h.fight.start({ rarity: r.rarity, sizeRatio: (r.size ?? sp?.len ?? 1) / (sp?.len ?? r.size ?? 1), rng: h.rng, name: sp?.name });
      game.player.act('reel');
      return;
    }
    landTroll(r);
  };
  const landTroll = (r: RollResult) => {
    const at = troll.pos.clone();
    h.splash(at.x, at.y, at.z, 1.5);
    game.audio?.sfx('splash', { x: at.x, z: at.z, vol: 0.8 });
    const sp = h.speciesOf(r);
    stopTroll();
    leap(sp, at, () => _hand.copy(game.player.pos).setY(game.player.pos.y + 1.3), () => h.resolve(r, 'fish', { x: at.x, z: at.z }), r.size);
  };
  const _hand = new THREE.Vector3();

  game.addProvider('fishing-troll', (pl) => {
    if (!pl.mounted) return null;
    if (troll.s) {
      // 트롤링 중 E 는 내 것(내리기로 새지 않게)
      const lab = troll.fight ? 'E 연타로 감기!' : troll.s.phase === 'strike' ? '꾹! 지금 E!!' : '트롤링 중… (E 줄 감기)';
      return { id: 'fishing:troll-live', label: lab, dist: 0.05, whileMounted: true, use: () => {} };
    }
    if (!h.idle() || busy()) return null;
    const v = vehicleNow();
    if (!T.canTroll(v, seaAt(pl.pos.x, pl.pos.z))) return null;
    if (h.rodTier() === 'none') return null;
    return { id: 'fishing:troll', label: '트롤링 낚시하기 🎣 (달리면서!)', dist: 0.4, whileMounted: true, use: startTroll };
  });

  function updateTroll(t: number, dt: number) {
    // 거품
    for (const w of wakes) {
      if (!w.m.visible) continue;
      const age = t - w.born;
      if (age < 0 || age > 1.3) { w.m.visible = false; continue; }
      const k = age / 1.3;
      w.m.position.set(w.x, w.y + 0.04, w.z);
      w.m.scale.setScalar((0.25 + k * 1.1) * w.s);
      (w.m.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - k);
    }
    const s = troll.s;
    if (!s) return;
    const pl = game.player;
    const v = vehicleNow();
    if (!pl.mounted || !v || !v.boat) { stopTroll('배에서 내려서 줄을 감았어요'); return; }
    const inp = game.input;
    const f = pl.facing();
    const speed = troll.force && s.phase === 'lure' ? Math.max(Math.abs(v.speed), T.TROLL_MIN_SPEED) : Math.abs(v.speed);
    // 루어 자리: 배 뒤(줄다리기 중엔 가까워지고 좌우로 끈다)
    let back = T.LURE_BACK, side = Math.sin(t * 0.7) * 1.2;
    if (troll.fight && h.fight.state) {
      back = R.fishDistance(h.fight.state, troll.d0);
      side = h.fight.state.sway * 4;
    }
    const rx = -f.z, rz = f.x;
    const lx = pl.pos.x - f.x * back + rx * side, lz = pl.pos.z - f.z * back + rz * side;
    troll.pos.set(lx, seaY(lx, lz, t), lz);
    if (troll.fight) {
      const res = h.fight.update(t, dt, inp.hit('KeyE'), inp.axis().x, pl.pos);
      if (res === 'win' && troll.roll) { troll.fight = false; landTroll(troll.roll); return; }
      if (res) {
        h.fail('fish');
        stopTroll(L.FAIL_TOAST[res === 'snap' ? 'snap' : 'escape']);
        return;
      }
    } else {
      const evs = T.stepTroll(s, dt, { speed, press: inp.hit('KeyE'), cancel: inp.hit('Escape') });
      for (const e of evs) {
        if (e.type === 'strike') {
          // 이 바다의 물고기 하나를 미리 굴린다(먼바다·심해)
          const pool = h.pool(troll.zone, null, { p1: troll.zone === 'deep' });
          const r = h.roll({ activity: 'fish', pool, junk: false, commit: false });
          if (!r || !r.species) { stopTroll('입질이 끊겼어요… 다시 던져 봐요'); return; }
          troll.roll = r;
          h.splash(lx, troll.pos.y, lz, 1.4);
          game.audio?.sfx('bite', { x: lx, z: lz });
        }
        if (e.type === 'hook') { trollHook(); if (!troll.s) return; }
        if (e.type === 'miss') { h.fail('fish'); stopTroll(L.FAIL_TOAST.late); return; }
        if (e.type === 'reel') { stopTroll('줄을 감았어요'); return; }
        if (e.type === 'slow') { stopTroll('배가 느려서 루어가 가라앉았어요… 달리면서 다시! ⛵'); return; }
      }
      if (!troll.s) return;
      gguk.visible = s.phase === 'strike';
      if (gguk.visible) gguk.position.set(lx, troll.pos.y + 1, lz);
    }
    // 낚싯대(뒤로) · 줄 · 루어
    const tip = h.poseRod(troll.fight ? 1.15 + 0.06 * Math.sin(t * 34) : 0.75, Math.PI * 0.82);
    lure.visible = true;
    lure.position.copy(troll.pos); lure.position.y += 0.04 + 0.03 * Math.sin(t * 9);
    lure.rotation.y = Math.atan2(f.x, f.z) - Math.PI / 2;
    drawLine(trollLine, tip, lure.position, troll.fight ? 0.05 : 0.6);
    (trollLine.material as THREE.LineBasicMaterial).color.set(troll.fight && h.fight.state && R.inRed(h.fight.state) ? '#ff7a8a' : '#ffffff');
    // 줄 끌림 거품: 루어 뒤로 V 자
    if (t - wakeAt > (troll.fight ? 0.07 : 0.11) && (speed > 1 || troll.fight)) {
      wakeAt = t;
      const k = (wakeI % 2 ? 1 : -1) * 0.35;
      foam(lx + rx * k - f.x * 0.3, troll.pos.y, lz + rz * k - f.z * 0.3, troll.fight ? 1.4 : 0.8);
    }
    game.ui.setPrompt(troll.fight ? null : s.phase === 'strike' ? '꾹! 지금 E!!' : `트롤링 중… ${speed < T.TROLL_MIN_SPEED ? '더 빨리 달려요!' : '두근두근'} (E 줄 감기)`, null);
  }

  // ════════════════ ② 모래 언덕 그림자(장식 + 길잡이) ════════════════
  const SAND_N = 4;
  const sandMat = overWater(new THREE.MeshBasicMaterial({ map: shadowTex, color: '#6e5236', transparent: true, opacity: 0, depthWrite: false }));
  const sandFinMat = new THREE.MeshStandardMaterial({ color: '#e6c48e', roughness: 0.7, emissive: '#9a7442', emissiveIntensity: 0.2, transparent: true, opacity: 0 });
  const dustMat = new THREE.PointsMaterial({ map: dustTex, size: 0.9, transparent: true, depthWrite: false, opacity: 0, color: '#ffffff' });
  const sandRoam = Array.from({ length: SAND_N }, (_, i) => {
    const g = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5).rotateX(-Math.PI / 2), sandMat);
    plane.renderOrder = 6; g.add(plane);
    const fin = new THREE.Mesh(finGeo, sandFinMat); fin.castShadow = false; g.add(fin);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(10 * 3), 3));
    const dust = new THREE.Points(dg, dustMat); dust.frustumCulled = false; g.add(dust);
    g.visible = false; root.add(g);
    return { g, plane, fin, dust, ax: 0, az: 0, ph: i * 1.7, len: 1, key: '' };
  });
  let sandOn = 0, sandCheckAt = -99, inDune = false;
  const SAND_CELL = 22;
  function updateSand(t: number, dt: number) {
    const pl = game.player;
    if (t - sandCheckAt > 0.5) {
      sandCheckAt = t;
      // 모래시계섬 위면 켠다 — 칸마다 그 자리가 모래 언덕인지 따로 본다(언덕 가장자리에서도 보이게)
      let isl: string | null | undefined;
      try { isl = game.world === 'earth' ? game.geo?.zoneAt?.(pl.pos.x, pl.pos.z)?.island : undefined; } catch { isl = undefined; }
      inDune = isl === 'desert' && h.pool('dune', 'desert', { strict: true }).length > 0;
    }
    const want = inDune ? 1 : 0;
    // 촬영 모드(dt = 0)는 바로, 아니면 천천히 나타났다 사라진다
    sandOn = dt === 0 ? want : sandOn + (want - sandOn) * Math.min(1, dt * 2);
    if (sandOn < 0.02 && !want) { for (const s of sandRoam) s.g.visible = false; return; }
    sandMat.opacity = 0.78 * sandOn;
    sandFinMat.opacity = 0.95 * sandOn;
    dustMat.opacity = 0.7 * sandOn;
    // 플레이어 둘레 칸 4개에 하나씩(칸마다 같은 자리 — 다시 와도 같다)
    const cx = Math.floor(pl.pos.x / SAND_CELL), cz = Math.floor(pl.pos.z / SAND_CELL);
    sandRoam.forEach((s, i) => {
      const ox = (i % 2) - (pl.pos.x / SAND_CELL - cx < 0.5 ? 1 : 0), oz = Math.floor(i / 2) - (pl.pos.z / SAND_CELL - cz < 0.5 ? 1 : 0);
      const key = `${cx + ox},${cz + oz}`;
      if (s.key !== key) {
        s.key = key;
        const r = ctx.rng(`fishing-sand:${key}`);
        s.ax = (cx + ox + 0.2 + r() * 0.6) * SAND_CELL; s.az = (cz + oz + 0.2 + r() * 0.6) * SAND_CELL;
        s.len = 1.6 + r() * 1.6; s.ph = r() * 6.28;
      }
      let zz: string | undefined;
      // 모래 언덕 밖·물 위에는 안 그린다(칸이 바뀔 때만 확인)
      if (s.g.userData.k !== key) {
        try { zz = game.geo?.zoneAt?.(s.ax, s.az)?.zone; } catch { zz = undefined; }
        s.g.userData.k = key; s.g.userData.ok = zz === 'dune' && !Number.isFinite(island.waterLevelAt(s.ax, s.az));
      }
      if (!s.g.userData.ok) { s.g.visible = false; return; }
      const a = s.ph + t * 0.35 / Math.max(0.8, s.len * 0.6);
      const x = s.ax + Math.cos(a) * 3.2, z = s.az + Math.sin(a * 1.3) * 2.4;
      const y = island.heightAt(x, z);
      s.g.visible = true;
      s.g.position.set(x, y + 0.18, z);
      const vx = -Math.sin(a) * 3.2, vz = Math.cos(a * 1.3) * 2.4 * 1.3;
      s.g.rotation.y = Math.atan2(-vz, vx);
      s.plane.scale.set(s.len * 1.3, 1, s.len * 1.3);
      const fh = 0.26 + s.len * 0.2;
      s.fin.scale.set(fh * 0.9, fh * (0.85 + 0.15 * Math.sin(t * 4 + s.ph)), 1);
      s.fin.rotation.z = 0.1 * Math.sin(t * 5 + s.ph);
      const pa = s.dust.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < 10; k++) {
        const age = ((t * 1.3 + k / 10) % 1);
        pa.setXYZ(k, -s.len * 0.3 - age * s.len * 0.9, 0.08 + age * 0.45, (k % 2 ? 1 : -1) * age * 0.35);
      }
      pa.needsUpdate = true;
    });
  }

  // ════════════════ ③ 얼음 구멍 ════════════════
  const holes: Hole[] = [];
  try {
    for (const lk of island.worldLakes()) {
      if (!lk.frozen) continue;
      lk.holes.forEach((q, i) => holes.push({ id: `${lk.id}:${i}`, x: q.x, z: q.z, r: q.r, level: lk.level }));
    }
  } catch { /* 섬 데이터가 없으면(룩 테스트) 구멍 없음 */ }
  const iceF = (): I.IceFlags | undefined => fl().ice as I.IceFlags | undefined;
  const isOpen = (id: string) => I.holeOpen(iceF(), day(), id);
  const lids = new Map<string, THREE.Mesh>();
  game.chunks.add({
    key: 'fishing-icelid', size: 128, radius: 260, world: 'earth',
    build: ({ x0, z0, size }) => {
      const mine = holes.filter((q) => q.x >= x0 && q.x < x0 + size && q.z >= z0 && q.z < z0 + size);
      if (!mine.length) return null;
      const g = new THREE.Group();
      g.name = 'fishing-icelid';
      for (const q of mine) {
        const m = new THREE.Mesh(lidGeo, lidMat);
        m.position.set(q.x, q.level + 0.02, q.z);
        m.scale.set(q.r + 0.12, 1, q.r + 0.12);
        m.receiveShadow = true;
        m.visible = !isOpen(q.id);
        m.userData.hole = q.id;
        lids.set(q.id, m);
        g.add(m);
      }
      return g;
    },
    dispose: (obj) => { obj.traverse((o) => { if (o.userData.hole) lids.delete(o.userData.hole as string); }); },
  });
  let lidDay = -1;
  const refreshLids = () => { for (const [id, m] of lids) m.visible = !isOpen(id); };
  const nearestHole = (x: number, z: number, maxD: number): Hole | null => {
    let best: Hole | null = null, bd = maxD;
    for (const q of holes) {
      const d = Math.hypot(q.x - x, q.z - z) - q.r;
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  };
  // 얼음 조각
  const CHIP_N = 24;
  const chipGeo = new THREE.BufferGeometry();
  chipGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(CHIP_N * 3), 3));
  const chipMat = new THREE.PointsMaterial({ map: sparkTex, size: 0.22, transparent: true, depthWrite: false, color: '#dff4ff' });
  const chips = new THREE.Points(chipGeo, chipMat);
  chips.frustumCulled = false; chips.visible = false; root.add(chips);
  let chipAt = -99;
  const chipSeed = Array.from({ length: CHIP_N }, (_, i) => ({ a: i * 2.399, v: 1.4 + ((i * 0.618) % 1) * 1.6, u: 2 + ((i * 0.37) % 1) * 2 }));
  // 타이밍 미터
  let tCanvas: HTMLCanvasElement | null = null, tCtx: CanvasRenderingContext2D | null = null;
  if (typeof document !== 'undefined') { tCanvas = document.createElement('canvas'); tCanvas.width = TW; tCanvas.height = TH; tCtx = tCanvas.getContext('2d'); }
  const tTex = tCanvas ? new THREE.CanvasTexture(tCanvas) : new THREE.Texture();
  tTex.colorSpace = THREE.SRGBColorSpace;
  const tMeter = new THREE.Sprite(new THREE.SpriteMaterial({ map: tTex, depthTest: false, transparent: true }));
  tMeter.scale.set(1.9, 0.74, 1); tMeter.renderOrder = 11; tMeter.visible = false; root.add(tMeter);
  const iceBob = new THREE.Group();
  {
    const red = new THREE.MeshPhysicalMaterial({ color: '#ff5a6a', roughness: 0.3, clearcoat: 1, emissive: '#ff5a6a', emissiveIntensity: 0.15 });
    const white = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 1 });
    iceBob.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), red));
    iceBob.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white));
  }
  iceBob.visible = false; root.add(iceBob);
  const iceLine = mkLine(12);
  type IcePhase = 'drill' | 'drop' | 'wait' | 'bite' | 'timing' | 'done';
  const ice = {
    on: false, phase: 'drill' as IcePhase, t: 0, hole: null as Hole | null, drill: 0, idle: 0,
    roll: null as RollResult | null, wait: 2, window: 0.7, timing: null as I.Timing | null, flash: null as null | 'hit' | 'miss', flashAt: -99,
    tokAt: -99, toks: 0, frozen: false,
  };
  const iceGo = (p: IcePhase) => { ice.phase = p; ice.t = 0; };
  const endIce = (msg?: string) => {
    if (!ice.on) return;
    ice.on = false; ice.frozen = false;
    iceBob.visible = false; iceLine.visible = false; tMeter.visible = false; gguk.visible = false; tok.visible = false;
    h.hideRod();
    game.player.unlock('fishing-ice', true);
    if (game.player.action) game.player.act(null);
    game.hud?.gauge?.('fishing-ice', { label: '얼음 구멍', value: 0, color: '#9fd8ff', show: false });
    if (msg) game.ui.toast(msg);
  };
  const startIce = (q: Hole) => {
    const pl = game.player;
    ice.on = true; ice.hole = q; ice.drill = 0; ice.idle = 0; ice.roll = null; ice.timing = null; ice.frozen = false;
    // 구멍 가장자리에서 구멍을 바라본다
    const d = Math.hypot(pl.pos.x - q.x, pl.pos.z - q.z) || 1;
    const ux = (pl.pos.x - q.x) / d, uz = (pl.pos.z - q.z) / d;
    const sx = q.x + ux * (q.r + 0.55), sz = q.z + uz * (q.r + 0.55);
    pl.teleport(sx, sz);
    pl.yaw = Math.atan2(-(q.x - sx), -(q.z - sz));
    pl.lock('fishing-ice');
    if (isOpen(q.id)) { iceGo('drop'); pl.act('fish'); }
    else { iceGo('drill'); pl.act('dig'); game.ui.toast('꽁꽁 언 구멍! E 를 연타해서 뚫어요 ⛏️'); }
  };
  const iceCatch = () => {
    const r = ice.roll, q = ice.hole;
    if (!r || !q) { endIce(); return; }
    const sp = h.speciesOf(r);
    const from = new THREE.Vector3(q.x, q.level, q.z);
    h.splash(q.x, q.level, q.z, 1.3);
    game.audio?.sfx('splash', { x: q.x, z: q.z, vol: 0.8 });
    iceBob.visible = false; iceLine.visible = false; tMeter.visible = false;
    iceGo('done');
    leap(sp, from, () => _hand.copy(game.player.pos).setY(game.player.pos.y + 1.3), () => { h.resolve(r, 'fish', { x: q.x, z: q.z }); endIce(); }, r.size);
  };
  const iceFail = (msg: string) => {
    h.fail('fish');
    const q = ice.hole;
    if (q) h.splash(q.x, q.level, q.z, 1);
    iceGo('done');
    tMeter.visible = false; gguk.visible = false;
    game.ui.toast(msg);
  };

  game.addProvider('fishing-icehole', (pl) => {
    if (ice.on || pl.mounted || pl.mode !== 'ground' || pl.action || !h.idle() || busy()) return null;
    if (game.world !== 'earth' || !holes.length) return null;
    const q = nearestHole(pl.pos.x, pl.pos.z, 2.4);
    if (!q) return null;
    if (h.rodTier() === 'none') return { id: 'fishing:icehole-norod', label: '낚싯대가 있어야 얼음 낚시를 해요 🎣', dist: 0.3, use: () => game.ui.toast('작업대에서 낚싯대를 만들어요! (나무 5) 🎣') };
    return {
      id: 'fishing:icehole', label: isOpen(q.id) ? '얼음 구멍 낚시하기 🧊🎣' : '얼음 구멍 뚫기 ⛏️ (E 연타)', dist: 0.3,
      use: () => startIce(q),
    };
  });

  function updateIce(t: number, dt: number) {
    if (day() !== lidDay) { lidDay = day(); refreshLids(); }
    // 얼음 조각 튀기
    if (t - chipAt < 0.6 && t >= chipAt && ice.hole) {
      chips.visible = true;
      const age = t - chipAt, q = ice.hole;
      const pa = chipGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < CHIP_N; i++) {
        const s = chipSeed[i];
        pa.setXYZ(i, q.x + Math.cos(s.a) * s.u * age * 0.6, q.level + 0.1 + s.v * age - 4.5 * age * age, q.z + Math.sin(s.a) * s.u * age * 0.6);
      }
      pa.needsUpdate = true;
      chipMat.opacity = 1 - age / 0.6;
    } else chips.visible = false;
    if (!ice.on || !ice.hole) return;
    const q = ice.hole;
    const inp = game.input;
    const press = inp.hit('KeyE');
    if (inp.hit('Escape') && ice.phase !== 'done') { endIce('줄을 감았어요'); return; }
    if (!ice.frozen) ice.t += dt;
    const pitch = ice.phase === 'drill' ? 0.4 : 1.45 + (ice.phase === 'timing' ? 0.05 * Math.sin(t * 30) : 0);
    const tip = ice.phase === 'drill' ? null : h.poseRod(pitch);
    if (ice.phase === 'drill') h.hideRod();
    switch (ice.phase) {
      case 'drill': {
        if (press) {
          ice.idle = 0;
          ice.drill = I.drillStep(ice.drill, true, 0);
          chipAt = t;
          game.audio?.sfx('rock-hit', { x: q.x, z: q.z, vol: 0.5, pitch: 1.5 + ice.drill * 0.4 });
          game.player.act('dig', 0.3);
        } else { ice.drill = I.drillStep(ice.drill, false, dt); ice.idle += dt; }
        game.hud?.gauge?.('fishing-ice', { label: '구멍 뚫기 ⛏️ (E 연타)', value: ice.drill, color: '#9fd8ff', show: true });
        game.ui.setPrompt('E 연타로 얼음 뚫기!', null);
        if (I.drilled(ice.drill)) {
          fl().ice = I.openHole(iceF(), day(), q.id); h.save();
          const lid = lids.get(q.id); if (lid) lid.visible = false;
          h.splash(q.x, q.level, q.z, 1.4);
          game.audio?.sfx('splash', { x: q.x, z: q.z, vol: 0.7, pitch: 1.2 });
          game.ui.toast('뽀각! 구멍이 뚫렸다 🧊');
          game.player.act('fish');
          iceGo('drop');
        } else if (ice.idle > 5) endIce('얼음이 다시 얼었어요… 다음엔 쉬지 말고 콕콕!');
        break;
      }
      case 'drop': {
        game.hud?.gauge?.('fishing-ice', { label: '얼음 구멍', value: 0, color: '#9fd8ff', show: false });
        if (ice.t >= I.DROP_SEC) {
          const pool = h.pool('icehole', 'ice');
          const bait = h.bait();
          const q2: L.PreRollQuery = { activity: 'fish', pool, junk: true, commit: false };
          if (bait) q2.bait = bait;
          const r = pool.length ? h.roll(q2) : null;
          if (!r || (!r.species && !r.junk)) { endIce('구멍 아래가 조용해요… 다른 구멍을 뚫어 볼까요?'); return; }
          if (bait) h.useBait(bait);
          ice.roll = r;
          ice.wait = I.waitTime(h.rng());
          ice.window = L.biteWindow(r.rarity || 1, h.rodTier());
          ice.toks = 0;
          h.splash(q.x, q.level, q.z, 0.5);
          iceGo('wait');
        }
        game.ui.setPrompt('줄을 내리는 중…', null);
        break;
      }
      case 'wait': {
        if (press) { endIce('줄을 감았어요'); return; }
        // 톡 두 번
        const tokTimes = [ice.wait * 0.45, ice.wait * 0.75];
        if (ice.toks < 2 && ice.t >= tokTimes[ice.toks]) { ice.toks++; ice.tokAt = t; h.splash(q.x, q.level, q.z, 0.35); game.audio?.sfx('nibble', { x: q.x, z: q.z }); }
        if (ice.t >= ice.wait) { iceGo('bite'); h.splash(q.x, q.level, q.z, 1); game.audio?.sfx('bite', { x: q.x, z: q.z }); }
        game.ui.setPrompt('두근두근… 얼음 밑에서 뭔가 와요', null);
        break;
      }
      case 'bite': {
        if (press) { ice.timing = I.newTiming(ice.roll?.rarity || 1, t, h.rng); iceGo('timing'); game.audio?.sfx('reel', { x: q.x, z: q.z }); break; }
        if (ice.t > ice.window && !ice.frozen) { iceFail(L.FAIL_TOAST.late); break; }
        game.ui.setPrompt('E 지금!!', null);
        break;
      }
      case 'timing': {
        const tm = ice.timing!;
        if (press && !ice.frozen) {
          const res = I.timingPress(tm, t, h.rng);
          ice.flash = res === 'miss' || res === 'fail' ? 'miss' : 'hit'; ice.flashAt = t;
          if (res === 'hit') { game.audio?.sfx('reel', { x: q.x, z: q.z, pitch: 1 + tm.hits * 0.12 }); h.splash(q.x, q.level, q.z, 0.6); }
          if (res === 'miss') game.audio?.sfx('fail-splash', { x: q.x, z: q.z, vol: 0.4 });
          if (res === 'win') { iceCatch(); return; }
          if (res === 'fail') { iceFail('미끄덩! 얼음 밑으로 도망갔다…'); return; }
        }
        game.ui.setPrompt('하트가 민트 칸에 오면 E!', null);
        game.hud?.gauge?.('fishing-ice', { label: `타이밍 릴 ${tm.hits}/${tm.need}`, value: tm.hits / tm.need, color: '#7fe0c0', show: true });
        break;
      }
      case 'done':
        if (ice.t > 0.9) endIce();
        break;
    }
    if (!ice.on) return;
    // 그림: 찌 · 줄 · 미터 · 말풍선
    const bobY = q.level + 0.02 + (ice.phase === 'bite' ? -0.12 : 0.02 * Math.sin(t * 2.4)) - (t - ice.tokAt < 0.18 ? 0.06 : 0) + (ice.phase === 'timing' ? 0.04 * Math.sin(t * 22) : 0);
    if (ice.phase === 'drop') {
      const k = Math.min(1, ice.t / I.DROP_SEC);
      iceBob.visible = true;
      iceBob.position.set(q.x, (tip ? tip.y : q.level + 1) * (1 - k) + bobY * k, q.z);
    } else if (ice.phase !== 'drill' && ice.phase !== 'done') {
      iceBob.visible = true;
      iceBob.position.set(q.x, bobY, q.z);
    } else iceBob.visible = false;
    if (tip && iceBob.visible) { _v.copy(iceBob.position); _v.y += 0.1; drawLine(iceLine, tip, _v.clone(), 0.05); } else iceLine.visible = false;
    tok.visible = ice.phase === 'wait' && t - ice.tokAt < 0.6;
    if (tok.visible) tok.position.set(q.x, q.level + 0.8 + (t - ice.tokAt) * 0.6, q.z);
    gguk.visible = ice.phase === 'bite';
    if (gguk.visible) gguk.position.set(q.x, q.level + 0.9, q.z);
    tMeter.visible = ice.phase === 'timing';
    if (tMeter.visible && ice.timing) {
      const pl = game.player;
      tMeter.position.set(pl.pos.x, pl.pos.y + 2.6, pl.pos.z);
      if (tCtx) { drawTiming(tCtx, ice.timing, I.markerPos(ice.timing, t), t - ice.flashAt < 0.25 ? ice.flash : null); tTex.needsUpdate = true; }
    }
  }

  // ════════════════ ④ 돛등이와 낚시 대결 ════════════════
  type Spot = { x: number; z: number; y: number; yaw: number; wx: number; wz: number; wy: number };
  let spot: Spot | null | undefined;
  const findSpot = (): Spot | null => {
    try {
      const lk = island.worldLakes().find((l) => l.island === 'dino' && l.kind === 'swamp');
      const isl = island.islandById('dino');
      if (!lk || !isl) return null;
      // 늪 가운데에서 섬 가운데 쪽으로 가다 처음 마른 땅 + 2m
      const base = Math.atan2(isl.z - lk.z, isl.x - lk.x);
      for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) {
        const a = base + da;
        for (let r = lk.r * 0.5; r < lk.r * 2.2; r += 1) {
          const x = lk.x + Math.cos(a) * r, z = lk.z + Math.sin(a) * r;
          if (Number.isFinite(island.waterLevelAt(x, z))) continue;
          const s = island.surfaceAt(x, z);
          if (s.kind === 'cliff' || s.kind === 'sea' || s.kind === 'lava') break;
          const x2 = x + Math.cos(a) * 2, z2 = z + Math.sin(a) * 2;
          // 바라보는 쪽(늪) 3.6m 앞 물
          const wx = x2 - Math.cos(a) * 5.6, wz = z2 - Math.sin(a) * 5.6;
          const wl = island.waterLevelAt(wx, wz);
          if (!Number.isFinite(wl)) break;
          return { x: x2, z: z2, y: island.heightAt(x2, z2), yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), wx, wz, wy: wl };
        }
      }
    } catch { /* 섬 없음 */ }
    return null;
  };
  let spino: SpinoModel | null = null;
  let spinoCheck = -99;
  const contest = { c: null as K.Contest | null, yankAt: -99, happyUntil: -99, last: '', hudAt: -99 };
  const spF = () => {
    const f = fl();
    let s = f.spino as { played: number; wins: number; lastWinDay?: number; best: number } | undefined;
    if (!s || typeof s !== 'object') { s = { played: 0, wins: 0, best: 0 }; f.spino = s; }
    return s;
  };
  const ensureSpino = () => {
    if (spino || !spot) return;
    spino = buildSpino(ctx.rng('fishing-spino'));
    spino.root.position.set(spot.x, spot.y, spot.z);
    spino.root.rotation.y = spot.yaw;
    applyCurve(spino.root);
    root.add(spino.root);
  };
  const dropSpino = () => { if (spino) { disposeSpino(spino); spino = null; } };
  /** 돛등이가 낚을 이름표(쿵쿵공룡섬 물고기, ★별) */
  const spinoNames = (): Partial<Record<number, string[]>> => {
    const out: Partial<Record<number, string[]>> = {};
    for (const z of ['swamp', 'ancientlake', 'footprint', 'hotspring']) {
      for (const sp of h.pool(z, 'dino', { strict: false })) {
        const arr = (out[sp.rarity] ??= []);
        const nm = sp.name ?? '물고기';
        if (!arr.includes(nm)) arr.push(nm);
      }
    }
    return out;
  };
  const spinoSpecies = (name: string) => {
    for (const z of ['swamp', 'ancientlake', 'footprint', 'hotspring']) {
      const sp = h.pool(z, 'dino', { strict: false }).find((s) => s.name === name);
      if (sp) return h.speciesOf({ species: sp, rarity: sp.rarity, combo: 0 } as RollResult);
    }
    return undefined;
  };
  const startContest = () => {
    if (contest.c) return;
    const n = spF().played;
    const sched = K.spinoSchedule(ctx.rng(`fishing-spino:${day()}:${n}`), K.CONTEST_SEC, spinoNames());
    contest.c = K.newContest(game.time, sched);
    spF().played++; h.save();
    game.hud?.banner?.({ text: '돛등이와 낚시 대결!', sub: '3분 동안 쿵쿵공룡섬에서 더 많이 낚아요 🦖🎣', icon: '🦖', color: '#ffa24c', ms: 2600 });
    game.audio?.sfx('ui-open');
  };
  const endContest = (forfeit = false) => {
    const c = contest.c;
    if (!c) return;
    contest.c = null;
    game.hud?.gauge?.('fishing-contest', { label: '대결', value: 0, color: '#ffa24c', show: false });
    if (forfeit) { game.ui.toast('대결 장소에서 너무 멀어져서 대결이 끝났어요… 🦖'); return; }
    const res = K.contestResult(c);
    const sf = spF();
    sf.best = Math.max(sf.best, c.me);
    const prize = K.prizeFor(res, sf.lastWinDay, day());
    if (res === 'win') {
      sf.wins++;
      if (prize) {
        sf.lastWinDay = day();
        const e = game.econ;
        if (e) e.give(K.PRIZE_ITEM, prize, 'spino-contest'); else game.state.addItem(K.PRIZE_ITEM, prize);
      }
      game.hud?.banner?.({ text: `이겼다! ${c.me} : ${c.spino}`, sub: prize ? `돛등이가 황금 미끼 ×${prize} 를 줬어요 🏆✨` : '오늘 상은 벌써 받았어요 — 그래도 최고! 🏆', icon: '🏆', color: '#ffd36b', ms: 3400 });
      game.audio?.sfx('coins-big');
      game.player.act('cheer', 1.6);
    } else if (res === 'tie') {
      game.hud?.banner?.({ text: `무승부! ${c.me} : ${c.spino}`, sub: '돛등이가 꼬리로 하이파이브 🦖✋', icon: '🤝', color: '#9fd8ff', ms: 3000 });
    } else {
      game.hud?.banner?.({ text: `돛등이 승리… ${c.me} : ${c.spino}`, sub: '다음엔 이길 수 있어! 다시 도전해요 💪', icon: '🦖', color: '#7fdcd2', ms: 3000 });
      contest.happyUntil = game.time + 3;
    }
    h.save();
  };
  /** 대결 중에 낚았다(fishing.ts·트롤링·얼음 구멍이 부른다) */
  const onCatch = (r: RollResult, x: number, z: number) => {
    const c = contest.c;
    if (!c || c.over) return;
    let isl: string | null = null;
    try { isl = game.geo?.zoneAt?.(x, z)?.island ?? null; } catch { isl = null; }
    if (isl !== 'dino') return;
    const sp = h.speciesOf(r);
    const p = K.addCatch(c, r.junk ? 0 : r.rarity, r.size, sp?.len);
    setTimeout(() => game.ui.toast(`🎣 대결 점수 +${p}점! (나 ${c.me} : ${c.spino} 돛등이)`), 900);
  };

  game.addProvider('fishing-spino', (pl) => {
    if (!spino || !spot || pl.mounted || pl.mode !== 'ground' || busy()) return null;
    const d = Math.hypot(pl.pos.x - spot.x, pl.pos.z - spot.z);
    if (d > 4.2) return null;
    if (contest.c) {
      const c = contest.c;
      return { id: 'fishing:spino-score', label: `대결 중! ${K.clock(K.remaining(c, game.time))} · 나 ${c.me} : ${c.spino} 🦖`, dist: d, use: () => game.ui.toast('돛등이: "크르릉~ 나도 질 수 없지!" 🦖🎣') };
    }
    if (!h.idle() || pl.action) return null;
    return { id: 'fishing:spino', label: '돛등이와 낚시 대결하기 🦖🎣', dist: d, use: startContest };
  });

  function updateSpino(t: number) {
    if (spot === undefined) spot = findSpot();
    if (!spot) return;
    if (t - spinoCheck > 0.5) {
      spinoCheck = t;
      const pl = game.player;
      const d = game.world === 'earth' ? Math.hypot(pl.pos.x - spot.x, pl.pos.z - spot.z) : Infinity;
      if (d < 260) ensureSpino(); else if (d > 320) dropSpino();
      if (contest.c && d > 700) endContest(true);
    }
    const c = contest.c;
    if (c) {
      const { spino: got, ended } = K.contestTick(c, t);
      for (const s of got) {
        contest.yankAt = t; contest.happyUntil = t + 1.6;
        const sp = spinoSpecies(s.name);
        if (spino) {
          const from = new THREE.Vector3(spot.wx, spot.wy, spot.wz);
          const head = () => _hand.set(spot!.x, spot!.y + 2.0, spot!.z);
          h.splash(spot.wx, spot.wy, spot.wz, 1.2);
          leap(sp, from, head);
        }
        game.ui.toast(`🦖 돛등이가 ${s.name}(★${s.rarity})을(를) 낚았다! +${s.points} (나 ${c.me} : ${c.spino})`);
        game.audio?.sfx('splash', { x: spot.wx, z: spot.wz, vol: 0.6 });
      }
      if (t - contest.hudAt > 0.25 || ended) {
        contest.hudAt = t;
        game.hud?.gauge?.('fishing-contest', { label: `🦖 대결 ${K.clock(K.remaining(c, t))} · 나 ${c.me} : ${c.spino} 돛등이`, value: K.remaining(c, t) / c.dur, color: c.me >= c.spino ? '#ffd36b' : '#ffa24c', show: true });
      }
      if (ended) endContest();
    }
    if (spino) {
      const yank = t - contest.yankAt < 0.6 ? (t - contest.yankAt) / 0.6 : 0;
      animateSpino(spino, t, { waterY: spot.wy - spot.y + 0.02, yank, happy: t < contest.happyUntil });
    }
  }

  // ════════════════ ⑤ 협동 릴 돕기 ════════════════
  game.addProvider('fishing-coop-help', (pl) => {
    const pf = h.fight.coop.partnerFight;
    if (!pf || h.fight.active || busy() || !h.idle() || pl.mounted) return null;
    if (game.time - pf.at > 45) { h.fight.coop.partnerFight = null; return null; }
    return { id: 'fishing:coop-help', label: '친구의 릴을 같이 감기! 💞 (E 연타)', dist: 2.5, use: () => { h.fight.coop.send('help'); game.player.act('reel', 0.4); } };
  });

  // ════════════════ 공통 ════════════════
  /** P1 활동이 하나라도 진행 중인가(다른 것을 시작하지 않게) */
  const busy = () => !!troll.s || ice.on;
  game.onUpdate((t, dt) => {
    for (let i = leaps.length - 1; i >= 0; i--) {
      const lp = leaps[i];
      const k = Math.min(1, (t - lp.t0) / 0.45);
      const to = lp.to();
      lp.obj.position.copy(lp.from).lerp(to, k);
      lp.obj.position.y += Math.sin(k * Math.PI) * 1.4;
      lp.obj.rotation.set(0, Math.atan2(to.x - lp.from.x, to.z - lp.from.z) - Math.PI / 2, Math.sin(k * Math.PI * 3) * 0.6);
      if (k >= 1 || dt === 0 && t - lp.t0 > 5) {
        lp.obj.removeFromParent(); disposeModel(lp.obj);
        leaps.splice(i, 1);
        lp.done?.();
      }
    }
    updateTroll(t, dt);
    updateSand(t, dt);
    updateIce(t, dt);
    updateSpino(t);
    h.fight.coop.poll();
  });
  game.onWorld(() => { stopTroll(); endIce(); if (contest.c) endContest(true); dropSpino(); });

  // ── 디버그 ──
  const debug = {
    /** 트롤링 바로 시작(배 위에서) — 꾹까지 바로 가려면 strike=true */
    troll: (strike = false) => {
      if (!troll.s) startTroll();
      if (strike && troll.s) { troll.s.moved = troll.s.wait; troll.force = true; }
      return troll.s ? troll.s.phase : null;
    },
    trollState: () => (troll.s ? { phase: troll.s.phase, moved: Math.round(troll.s.moved * 10) / 10, wait: Math.round(troll.s.wait * 10) / 10, fight: troll.fight, zone: troll.zone, id: troll.roll?.species?.id } : null),
    stopTroll: () => stopTroll(),
    holes: () => holes.map((q) => ({ id: q.id, x: Math.round(q.x), z: Math.round(q.z), open: isOpen(q.id) })),
    /** 얼음 구멍 가장자리로 가서 바로 시작. i = 구멍 번호, phase = 'drill'|'timing'(그 단계에서 멈춘 그림) */
    icehole: (i = 0, phase?: 'drill' | 'timing' | 'bite') => {
      const q = holes[Math.max(0, Math.min(holes.length - 1, i))];
      if (!q) return false;
      if (game.world !== 'earth') game.setWorld('earth');
      endIce();
      game.player.teleport(q.x + q.r + 0.6, q.z);
      startIce(q);
      if (phase === 'drill') { ice.drill = 0.55; chipAt = game.time; ice.frozen = true; }
      if (phase === 'bite' || phase === 'timing') {
        fl().ice = I.openHole(iceF(), day(), q.id); refreshLids();
        const pool = h.pool('icehole', 'ice');
        ice.roll = pool.length ? h.roll({ activity: 'fish', pool, junk: false, commit: false }) : null;
        if (!ice.roll?.species) return 'no fish';
        if (phase === 'bite') { iceGo('bite'); ice.frozen = true; }
        else { ice.timing = I.newTiming(Math.max(3, ice.roll.rarity), game.time, h.rng); ice.timing.hits = 1; iceGo('timing'); ice.frozen = true; }
      }
      return ice.phase;
    },
    iceState: () => (ice.on ? { phase: ice.phase, drill: ice.drill, hole: ice.hole?.id, timing: ice.timing ? { ...ice.timing } : null, id: ice.roll?.species?.id } : null),
    stopIce: () => endIce(),
    /** 돛등이 자리로 가서 본다 */
    spino: (camSide = 0.6) => {
      if (spot === undefined) spot = findSpot();
      if (!spot) return false;
      if (game.world !== 'earth') game.setWorld('earth');
      const s = spot;
      // 돛등이 옆(돛이 보이게 비스듬히 뒤쪽)에 서서 돛등이를 본다
      const px = s.x + Math.sin(s.yaw + 1.35) * 4.2, pz = s.z + Math.cos(s.yaw + 1.35) * 4.2;
      game.player.teleport(px, pz);
      game.player.yaw = Math.atan2(-(s.x - px), -(s.z - pz));
      game.cam.yaw = game.player.yaw + camSide;
      spinoCheck = -99;
      updateSpino(game.time);
      return { x: Math.round(s.x), z: Math.round(s.z) };
    },
    spinoSpot: () => (spot === undefined ? (spot = findSpot()) : spot),
    /** 대결 시작 · 점수 넣기 · 끝내기 */
    contest: (on = true) => { if (on) { if (!spino) { spinoCheck = -99; updateSpino(game.time); } startContest(); } else endContest(); return contest.c ? { me: contest.c.me, spino: contest.c.spino } : null; },
    contestState: () => (contest.c ? { me: contest.c.me, spino: contest.c.spino, mine: contest.c.mine, his: contest.c.his, left: Math.round(K.remaining(contest.c, game.time)) } : null),
    contestAdd: (rarity = 3) => { const c = contest.c; return c ? K.addCatch(c, rarity) : 0; },
    /** 대결 시계를 sec 초 앞으로(돛등이 일정·끝 판정 시험) */
    contestSkip: (sec = 60) => { if (contest.c) contest.c.t0 -= sec; return debug.contestState(); },
    sandRoamers: () => sandRoam.filter((s) => s.g.visible).map((s) => ({ x: Math.round(s.g.position.x), z: Math.round(s.g.position.z) })),
    /** 협동: 친구 신호 흉내 */
    coopFake: (phase: 'mash' | 'start' | 'end' = 'mash') => { h.fight.coop.receive({ phase, from: 'friend', seq: Math.floor(game.time * 1000) }); return h.fight.coop.active(game.time); },
  };
  W.__fishingP1 = debug;
  // 낚시 대결 돛등이 자리 — dinos 가 같은 늪에 떠도는 돛등이를 겹쳐 세우지 않게 읽는다
  (game.ext as Record<string, unknown>).spinoContest = { spot: () => { if (spot === undefined) spot = findSpot(); return spot ? { x: spot.x, z: spot.z } : null; } };
  return { onCatch, busy, nearHole: (x: number, z: number) => nearestHole(x, z, 3) !== null, debug, contestActive: () => !!contest.c };
}
