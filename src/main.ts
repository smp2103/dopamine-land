// URL 파라미터:
//   game=0          룩 테스트 모드(게임 없이 고정 장면 + 궤도 카메라)
//   spawn=x,z | spawn=<섬 id>   시작 위치      style=adventure|cozy   카메라 방식
//   world=space     우주에서 시작
//   cam=<프리셋>     고정 카메라(촬영용, 게임 카메라 끔)
//   solo=a,b        이 모듈만      tod=day|morning|sunset|night
//   shot=1          GUI 숨김·고정 시간(t=초)·준비되면 window.__ready   live=1  촬영 모드에서도 시간이 흐름
//   fx=ao:0,tilt:0  효과 끄기      curve=0.004   땅 휘는 정도      fresh=1  저장 무시
import * as THREE from 'three';
import { Engine } from './core/engine';
import { Game } from './core/game';
import * as Island from './core/island';
import { CAMS } from './core/presets';

const q = new URLSearchParams(location.search);
const shot = q.get('shot') === '1';
const live = q.get('live') === '1';
const gameOn = q.get('game') !== '0';
const fixedCam = q.get('cam');
const fx: Record<string, boolean> = {};
for (const kv of (q.get('fx') ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  fx[k] = v !== '0';
}
type W = { __ready?: boolean; __errors?: string[]; __gpu?: string; __modules?: string[]; __frameMs?: number;
  __stats?: { calls: number; triangles: number }; __game?: Game; __engine?: Engine; THREE?: typeof THREE };
const w = window as unknown as W;
w.__errors = [];
window.addEventListener('error', (e) => w.__errors!.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => w.__errors!.push(String(e.reason)));

const engine = new Engine({
  solo: q.get('solo') ? q.get('solo')!.split(',') : null,
  tod: q.get('tod') ?? 'day',
  cam: fixedCam ?? (gameOn ? 'adventure' : 'ac'),
  shot,
  freezeT: shot && !live ? Number(q.get('t') ?? 1.5) : null,
  fx,
  curveK: q.get('curve') !== null ? Number(q.get('curve')) : null,
});
w.__engine = engine;
w.THREE = THREE;

const gl = engine.renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
w.__gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';

let game: Game | null = null;
if (gameOn) {
  let spawn: { x: number; z: number } | undefined;
  const sp = q.get('spawn');
  if (sp) {
    const [a, b] = sp.split(',');
    if (b !== undefined) spawn = { x: Number(a), z: Number(b) };
    else {
      const d = Island.islandById(a);
      if (d) spawn = Island.islandSpawnPoints(d.id, 1, 0.08)[0] ?? { x: d.x, z: d.z };
    }
  }
  game = new Game(engine, { spawn, style: (q.get('style') as 'adventure' | 'cozy') ?? 'adventure' });
  engine.game = game;
  engine.fogOverride = { near: 120, far: 2600 };
  await game.init();
  w.__game = game;
  if (fixedCam && CAMS[fixedCam]) {
    // 촬영용 고정 카메라: 게임 카메라가 덮어쓰지 않게
    game.cam.update = () => { engine.setCam(fixedCam); };
  }
}

const names = await engine.loadModules();
w.__modules = names;
w.__errors.push(...engine.errors);
engine.applyTod(engine.todName);
if (game && q.get('world') === 'space') game.setWorld('space');
if (!gameOn && !shot) {
  engine.enableControls();
}
if (!shot) {
  engine.buildGui();
  const hud = document.getElementById('hud')!;
  hud.textContent = gameOn
    ? 'WASD 이동 · Shift 달리기 · Space 점프/활공 · C 잠수 · E 상호작용 · 마우스 드래그 시점 · 휠 줌 · V 카메라(모험/아늑)'
    : `모듈: ${names.join(', ') || '(없음)'} · 드래그로 회전, 휠로 확대`;
}

// 프레임 시간(최근 60프레임 평균 ms)과 렌더 통계
const times: number[] = [];
let last = performance.now();
engine.start((n) => {
  const now = performance.now();
  times.push(now - last); last = now;
  if (times.length > 60) times.shift();
  w.__frameMs = times.reduce((a, b) => a + b, 0) / times.length;
  const info = engine.renderer.info.render;
  w.__stats = { calls: info.calls, triangles: info.triangles };
  if (n >= 12 && !w.__ready && (!game || game.chunks.pending === 0)) {
    if (game && shot) game.chunks.update(game.player.pos, true);
    w.__ready = true;
  }
});
