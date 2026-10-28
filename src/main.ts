// URL 파라미터:
//   game=0          룩 테스트 모드(게임 없이 고정 장면 + 궤도 카메라)
//   spawn=x,z | spawn=<섬 id>   시작 위치      style=adventure|cozy   카메라 방식
//   world=space     우주에서 시작
//   cam=<프리셋>     고정 카메라(촬영용, 게임 카메라 끔)
//   solo=a,b        이 모듈만      tod=day|morning|sunset|night
//   shot=1          GUI 숨김·고정 시간(t=초)·준비되면 window.__ready   live=1  촬영 모드에서도 시간이 흐름
//   quality=high|medium|low   그래픽 품질(기본: 저장된 선택 → 없으면 첫 실행 때 자동 측정)
//   fx=ao:0,tilt:0  효과 끄기      curve=0.004   땅 휘는 정도      fresh=1  저장 무시
//   intro=0         타이틀 건너뛰기(자동 실행·shot=1·cam=… 도 건너뜀)   intro=1  자동 실행에서도 타이틀 보기
//   dev=1           룩 테스트 패널(lil-gui)을 처음부터 — 없어도 ` 키로 열고 닫는다
//
// 부팅 순서(로딩 화면 단계): 엔진 준비 → 물리 깨우는 중 → 섬 만드는 중 → 친구들 부르는 중 n/m → 주변 꾸미는 중 → 다 됐어요
//   → 타이틀(살아 있는 세계 위를 천천히 도는 카메라 + 별똥별 로고) → 아무 키 → 별과 함께 떨어지는 카메라(2.2초) → game.started + 'game:start'.
// 이 파일은 boot.ts 만 바로 부르고 나머지(three·엔진·게임·물리 wasm·모듈 파일)는 한꺼번에 받아 온다 — 로딩 화면이 먼저 살아 움직이게.
// 디버그: window.__boot = { mode(), stage(), progress(), times, skip, start() }
import {
  BootScreen, TitleScreen, skipTitle, pendingFraction, titleOrbit, toCyl, glidePose, lerp3, starPath, easeInOut, isStartKey,
  GLIDE_SEC, type V3,
} from './core/boot';
import { rngFor } from './core/rng';
import { SAVE_KEY } from './core/state';
import type * as THREENS from 'three';
import type { Engine } from './core/engine';
import type { Game } from './core/game';
import type { QualityName } from './core/quality';

const q = new URLSearchParams(location.search);
const shot = q.get('shot') === '1';
const live = q.get('live') === '1';
const gameOn = q.get('game') !== '0';
const fixedCam = q.get('cam');
const solo = q.get('solo') ? q.get('solo')!.split(',') : null;
const devGui = q.get('dev') === '1';
const fx: Record<string, boolean> = {};
for (const kv of (q.get('fx') ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  fx[k] = v !== '0';
}
type W = { __ready?: boolean; __errors?: string[]; __gpu?: string; __modules?: string[]; __frameMs?: number;
  __stats?: { calls: number; triangles: number }; __game?: Game; __engine?: Engine; THREE?: typeof THREENS; __boot?: unknown };
const w = window as unknown as W;
w.__errors = [];
window.addEventListener('error', (e) => w.__errors!.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => w.__errors!.push(String(e.reason)));

const boot = new BootScreen();
const title = new TitleScreen();
const skip = skipTitle({ webdriver: navigator.webdriver === true, params: q, gameOn });
const html = document.documentElement;
// 저장이 있었나(이어하기) — 게임이 불러오며 곧바로 다시 저장하므로 제일 먼저 본다
const hadSave = (() => {
  try { return q.get('fresh') !== '1' && !!localStorage.getItem(SAVE_KEY); } catch { return false; }
})();

// ───── 먼저 출발: 코드·물리 wasm 을 동시에 받아 온다(제일 큰 것들이 서로 기다리지 않게) ─────
const threeP = import('three');
const engineP = import('./core/engine');
const qualityP = import('./core/quality');
const presetsP = import('./core/presets');
const islandP = import('./core/island');
const gameP = gameOn ? import('./core/game') : null;
// Rapier wasm 은 내려받고 컴파일하는 데 오래 걸린다 → 엔진을 만드는 동안 미리 깨운다(physics.init 은 이미 깬 것을 그대로 쓴다)
const rapierP = gameOn ? import('@dimforge/rapier3d-compat').then((m) => m.default.init()) : null;
rapierP?.catch(() => {});
engineP.then(({ Engine }) => Engine.prefetchModules(solo)).catch(() => {});

main().catch((err) => {
  console.error('[boot]', err);
  w.__errors!.push(`[boot] ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  boot.fail(err);
});

async function main() {
  boot.stage('engine', 0);
  const [THREE, { Engine }, { QUALITY, QUALITY_ORDER, isQuality, loadQuality, saveQuality }, { CAMS }, Island] =
    await Promise.all([threeP, engineP, qualityP, presetsP, islandP]);
  boot.stage('engine', 0.5);

  // 촬영은 저장값에 흔들리지 않게 URL 만 본다
  const qParam = q.get('quality');
  const savedQ = shot ? null : loadQuality();
  const quality: QualityName = isQuality(qParam) ? qParam : savedQ ?? 'high';
  let autoQuality = !shot && !isQuality(qParam) && savedQ === null;

  const engine = new Engine({
    solo,
    tod: q.get('tod') ?? 'day',
    cam: fixedCam ?? (gameOn ? 'adventure' : 'ac'),
    shot,
    freezeT: shot && !live ? Number(q.get('t') ?? 1.5) : null,
    fx,
    curveK: q.get('curve') !== null ? Number(q.get('curve')) : null,
    quality,
  });
  engine.onQualityChange = saveQuality;
  w.__engine = engine;
  w.THREE = THREE;
  boot.stage('engine', 1);

  const gl = engine.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  w.__gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';

  let game: Game | null = null;
  let intro: Intro | null = null;
  if (gameOn) {
    boot.stage('physics', 0);
    await rapierP;
    boot.stage('physics', 1);
    boot.stage('island', 0.1);
    const { Game } = await gameP!;
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
    const g = new Game(engine, { spawn, style: (q.get('style') as 'adventure' | 'cozy') ?? 'adventure' });
    game = g;
    g.started = false;
    engine.game = g;
    g.chunks.detail = QUALITY[engine.quality].detail;
    engine.fogOverride = { near: 120, far: 2600 };
    await g.init();
    boot.stage('island', 1);
    w.__game = g;
    if (fixedCam && CAMS[fixedCam]) {
      // 촬영용 고정 카메라: 게임 카메라가 덮어쓰지 않게
      g.cam.update = () => { engine.setCam(fixedCam); };
    }
    // 타이틀 카메라는 세계가 보이기 전부터 — 첫 그림부터 하늘 위 궤도
    if (!skip.skip) intro = new Intro(THREE, engine, g);
  }

  boot.stage('friends', 0, '친구들 찾는 중');
  const names = await engine.loadModules((p) => {
    if (p.phase === 'import') boot.stage('friends', 0.3 * p.done / Math.max(1, p.total), `친구들 찾는 중 ${p.done}/${p.total}`);
    else boot.stage('friends', 0.3 + 0.7 * p.done / Math.max(1, p.total), `친구들 부르는 중 ${p.done}/${p.total}`);
  });
  w.__modules = names;
  w.__errors!.push(...engine.errors);
  engine.applyTod(engine.todName);
  if (game && q.get('world') === 'space') game.setWorld('space');
  if (!gameOn && !shot) {
    engine.enableControls();
    const hud = document.getElementById('hud');
    if (hud) hud.textContent = `모듈: ${names.join(', ') || '(없음)'} · 드래그로 회전, 휠로 확대 · \` 키로 룩 테스트 패널`;
  }
  // 룩 테스트 패널: ?dev=1 이면 바로, 아니면 ` 키로 처음 열 때 만든다(촬영엔 없음)
  if (!shot) {
    if (devGui) void engine.buildGui();
    addEventListener('keydown', (e) => {
      if (e.code !== 'Backquote' || e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      void engine.toggleGui();
    });
  }
  // 모듈이 다 붙은 뒤에 타이틀 입력을 잡는다(소리 모듈의 '첫 몸짓' 듣기가 먼저 받게)
  intro?.arm();

  // 첫 실행 자동 품질: 준비된 뒤 잠깐 재서 느리면 한 단계씩 내린다(결과는 저장 — 이후엔 G 키로만 바뀐다)
  // 알림은 놀이가 시작된 뒤에(타이틀 위에 뜨지 않게)
  const AUTO_WARM = 1500, AUTO_SPAN = 2500, AUTO_SLOW_MS = 1000 / 40;
  let autoFrom = -1;
  const autoSamples: number[] = [];
  let qualityNote: string | null = null;
  const note = (text: string) => {
    if (!game) return;
    if (game.started) game.ui.toast(text, 4500);
    else qualityNote = text;
  };
  function autoStep(now: number, ms: number) {
    if (autoFrom < 0) autoFrom = now + AUTO_WARM;
    if (now < autoFrom || document.hidden) return;
    autoSamples.push(ms);
    if (now < autoFrom + AUTO_SPAN) return;
    const med = autoSamples.sort((a, b) => a - b)[autoSamples.length >> 1];
    autoSamples.length = 0;
    const i = QUALITY_ORDER.indexOf(engine.quality);
    if (med > AUTO_SLOW_MS && i < QUALITY_ORDER.length - 1) {
      engine.setQuality(QUALITY_ORDER[i + 1]);
      engine.guiSync?.();
      autoFrom = now + AUTO_WARM; // 바뀐 단계로 다시 잰다
      return;
    }
    autoQuality = false;
    saveQuality(engine.quality);
    if (engine.quality !== quality) note(`버벅임이 있어 그래픽 품질을 '${QUALITY[engine.quality].label}'(으)로 맞췄어요 · G 로 바꾸기`);
  }

  /** 놀이 시작 — 페이지마다 한 번 */
  let played = false;
  const play = (skipped: boolean) => {
    if (played || !game) return;
    played = true;
    game.started = true;
    html.classList.add('dl-playing');
    try { game.state.emit({ type: 'game:start', skipped }); } catch (e) { console.error('[game:start]', e); }
    if (qualityNote) { const t = qualityNote; qualityNote = null; setTimeout(() => game?.ui.toast(t, 4500), 1600); }
  };
  if (intro) intro.onPlay = () => play(false);

  /** 준비됨 → 로딩 화면을 걷고 세계를 보인다(건너뛰기면 그 자리에서 바로) */
  const reveal = () => {
    if (skip.skip) {
      html.classList.add('dl-instant', 'dl-live');
      void boot.finish(true);
      title.remove();
      play(true);
      return;
    }
    html.classList.add('dl-live');
    void boot.finish(false);
    intro?.showTitle(title);
  };

  // 프레임 시간(최근 60프레임 평균 ms)과 렌더 통계
  const times: number[] = [];
  let last = performance.now();
  let maxPending = 0;
  boot.stage('decor', 0);
  // 로딩 화면 뒤(아직 아무도 안 보는 동안)엔 주변 청크를 한 프레임에 많이 짓는다 → 준비되면 원래 예산(적응형)으로
  const chunkBudget = game ? { adaptive: game.chunks.adaptive, ms: game.chunks.budgetMs } : null;
  if (game) { game.chunks.adaptive = false; game.chunks.budgetMs = BOOT_CHUNK_MS; }
  // 셰이더를 미리 굽는다(병렬 컴파일 확장이 있으면 메인 스레드를 막지 않는다) — 첫 프레임의 긴 멈춤을 줄인다
  try { await engine.renderer.compileAsync(engine.scene, engine.camera); } catch (e) { console.warn('[boot] compileAsync', e); }
  engine.start((n) => {
    const now = performance.now();
    if (autoQuality && w.__ready) autoStep(now, now - last);
    times.push(now - last); last = now;
    if (times.length > 60) times.shift();
    w.__frameMs = times.reduce((a, b) => a + b, 0) / times.length;
    const info = engine.renderer.info.render;
    w.__stats = { calls: info.calls, triangles: info.triangles };
    if (w.__ready) return;
    const pending = game?.chunks.pending ?? 0;
    maxPending = Math.max(maxPending, pending);
    boot.stage('decor', Math.min(pendingFraction(pending, maxPending), n / 12), pending > 0 ? `주변 꾸미는 중 · ${Math.round(pendingFraction(pending, maxPending) * 100)}%` : '주변 꾸미는 중 · 거의 다 왔어요');
    if (n >= 12 && (!game || pending === 0)) {
      if (game && shot) game.chunks.update(game.player.pos, true);
      if (game && chunkBudget) { game.chunks.adaptive = chunkBudget.adaptive; game.chunks.budgetMs = chunkBudget.ms; }
      reveal();
      w.__ready = true;
    }
  });

  w.__boot = {
    mode: () => intro?.mode ?? (played ? 'play' : 'boot'),
    stage: () => boot.progress.stage,
    progress: () => ({ target: boot.progress.target, shown: boot.progress.shown }),
    times: boot.progress.times,
    skip,
    /** 타이틀에서 시작 누른 것처럼(테스트용) */
    start: () => intro?.begin(),
    /** 인트로 속도(1 = 보통) */
    introSpeed: (v?: number) => { if (intro && typeof v === 'number' && v > 0) intro.speed = v; return intro?.speed ?? 1; },
  };
}

/** 로딩 중 청크 짓기 예산(ms/프레임) — 화면이 가려져 있으니 끊김보다 빨리 끝내는 게 낫다 */
const BOOT_CHUNK_MS = 45;

// ───────────── 타이틀 카메라 + 별과 함께 떨어지는 인트로 ─────────────
type Mode = 'title' | 'glide' | 'play';
const PALE = ['#ffb3cf', '#ffe066', '#9fd4ff', '#a8f0a0', '#ffc38a', '#c9b5ff'];

class Intro {
  mode: Mode = 'title';
  onPlay: (() => void) | null = null;
  private T: typeof THREENS;
  private follow: Game['cam']['update'];
  private t0 = performance.now();
  private glideAt = 0;
  /** 인트로 속도 배율(디버그 — 느리게 찍어 보기: __boot.introSpeed(0.25)) */
  speed = 1;
  private glideSec() { return (performance.now() - this.glideAt) / 1000 * this.speed; }
  private armedAt = Infinity;
  private titleEl: TitleScreen | null = null;
  private from = { pos: { x: 0, y: 0, z: 0 } as V3, look: { x: 0, y: 0, z: 0 } as V3, fov: 42 };
  private star: { root: THREENS.Group; head: THREENS.Mesh; trail: THREENS.InstancedMesh; hist: V3[]; landed: boolean } | null = null;
  private burst: { mesh: THREENS.InstancedMesh; vel: V3[]; pos: V3[]; spin: number[]; t: number } | null = null;
  private tmp: THREENS.Object3D;
  private removeUpd: (() => void) | null = null;

  constructor(T: typeof THREENS, private engine: Engine, private game: Game) {
    this.T = T;
    this.tmp = new T.Object3D();
    game.player.lock('title');
    const rig = game.cam;
    this.follow = rig.update.bind(rig);
    rig.update = (input, dt) => this.camUpdate(input, dt);
    this.removeUpd = game.onUpdate((_t, dt) => this.fxUpdate(dt));
  }

  /** 모듈이 다 붙은 뒤: 그동안 쌓인 키는 버리고 타이틀 입력을 잡는다 */
  arm() {
    const inp = this.game.input;
    inp.pressed.clear(); inp.keys.clear();
    addEventListener('keydown', this.onKey, { capture: true });
    addEventListener('pointerdown', this.onPointer, { capture: true });
  }

  showTitle(el: TitleScreen) {
    this.titleEl = el;
    const g = this.game;
    const cont = hadSave;
    const env = g.env as { day?: number } | null | undefined;
    const day = typeof env?.day === 'number' ? env.day + 1 : 1;
    const dex = Object.keys(g.state.dex ?? {}).length;
    // 로딩 화면이 녹는 동안 살짝 기다렸다가
    setTimeout(() => el.show({ cont, day, dex }), 450);
    // '톡! 눌러서 시작' 방울이 뜰 즈음(0.45 + 2.5초)부터 입력을 받는다 — 로고도 못 본 채 넘어가지 않게.
    // 그 전에 누르면 방울만 바로 불러내고(빨리 감기), 한 번 더 누르면 시작
    this.armedAt = performance.now() + 450 + 2500;
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.mode === 'play') return;
    if (e.code === 'Backquote') return; // 개발 패널은 그대로
    // 타이틀·인트로 동안 키는 게임에 새지 않는다(점프·패널·품질 바꾸기 등)
    e.stopImmediatePropagation();
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.code)) e.preventDefault();
    if (this.mode === 'title' && !e.repeat && isStartKey(e.code)) this.begin();
  };
  private onPointer = (e: PointerEvent) => {
    if (this.mode !== 'title') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.begin();
  };

  /** 시작! — 별이 떨어지고 카메라가 뒤따른다 */
  begin() {
    if (this.mode !== 'title') return;
    if (performance.now() < this.armedAt) {
      const t = document.getElementById('title');
      if (t && !t.classList.contains('tt-ff')) { t.classList.add('tt-ff'); this.armedAt = Math.min(this.armedAt, performance.now() + 400); }
      return;
    }
    this.mode = 'glide';
    this.glideAt = performance.now();
    const cam = this.engine.camera;
    this.from = { pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, look: this.lookOf(), fov: cam.fov };
    this.titleEl?.go();
    setTimeout(() => this.titleEl?.hide(), 500);
    this.game.audio?.sfx('star', { vol: 0.8 });
    this.spawnStar();
  }

  private lookOf(): V3 {
    const p = this.game.player.pos;
    return { x: p.x, y: p.y + 3.5, z: p.z };
  }

  private camUpdate(input: Parameters<Game['cam']['update']>[0], dt: number) {
    if (this.mode === 'play') { this.follow(input, dt); return; }
    const cam = this.engine.camera, rig = this.game.cam, p = this.game.player.pos;
    // 곡률·그림자·심도의 기준점은 계속 플레이어
    rig.target.set(p.x, p.y + 1.1, p.z);
    if (this.mode === 'title') {
      const o = titleOrbit(p, (performance.now() - this.t0) / 1000);
      const gy = this.game.groundAt(o.pos.x, o.pos.z) + 8;
      cam.position.set(o.pos.x, Math.max(o.pos.y, gy), o.pos.z);
      cam.fov = 42;
      cam.updateProjectionMatrix();
      cam.lookAt(o.look.x, o.look.y, o.look.z);
      this.engine.camName = 'title';
      input.mouseDX = 0; input.mouseDY = 0; input.wheel = 0;
      return;
    }
    // 미끄러져 내려오기: 따라가는 카메라 자리를 먼저 구하고(그대로 두면 그게 끝 자리) 거기까지 길을 그린다
    this.follow(input, dt);
    const end = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    const endFov = cam.fov;
    const tgt = { x: rig.target.x, y: rig.target.y, z: rig.target.z };
    const k = Math.min(1, this.glideSec() / GLIDE_SEC);
    const pos = glidePose(toCyl(this.from.pos, tgt), toCyl(end, tgt), tgt, k);
    const gy = this.game.groundAt(pos.x, pos.z) + 0.8;
    const look = lerp3(this.from.look, tgt, easeInOut(Math.min(1, k * 1.25)));
    cam.position.set(pos.x, Math.max(pos.y, gy), pos.z);
    cam.fov = this.from.fov + (endFov - this.from.fov) * easeInOut(k);
    cam.updateProjectionMatrix();
    cam.lookAt(look.x, look.y, look.z);
    if (k >= 1) this.land();
  }

  /** 착지 — 놀이 시작 */
  private land() {
    if (this.mode === 'play') return;
    this.mode = 'play';
    const g = this.game;
    g.player.unlock('title', true);
    try { g.player.act('cheer', 1.1); } catch { /* 포즈가 없으면 그냥 */ }
    removeEventListener('keydown', this.onKey, { capture: true });
    removeEventListener('pointerdown', this.onPointer, { capture: true });
    g.input.pressed.clear();
    this.onPlay?.();
  }

  // ───── 별똥별과 반짝 터짐 ─────
  private spawnStar() {
    const T = this.T, cam = this.engine.camera;
    const geo = this.starGeo(4);
    const head = new T.Mesh(geo, new T.MeshStandardMaterial({ color: '#ffe37a', emissive: '#ffc94a', emissiveIntensity: 0.85, roughness: 0.35, fog: false }));
    head.userData.noCull = true;
    const N = 26;
    // 꼬리: 더하기 섞기 + 뒤로 갈수록 어두운 색 = 저절로 스르륵 사라지는 빛 꼬리
    const trail = new T.InstancedMesh(new T.SphereGeometry(0.5, 10, 8), new T.MeshBasicMaterial({ color: '#ffffff', fog: false, transparent: true, blending: T.AdditiveBlending, depthWrite: false }), N);
    trail.frustumCulled = false;
    trail.userData.noCull = true;
    const c = new T.Color();
    for (let i = 0; i < N; i++) trail.setColorAt(i, c.set(PALE[i % PALE.length]).multiplyScalar(0.9 * (1 - i / N) ** 1.4));
    const root = new T.Group();
    root.name = 'intro-star';
    root.add(head, trail);
    head.position.copy(cam.position);
    head.scale.setScalar(0.8);
    this.engine.scene.add(root);
    this.star = { root, head, trail, hist: [], landed: false };
  }

  private fxUpdate(dtIn: number) {
    const dt = Math.min(0.05, Math.max(0.001, dtIn || 1 / 60));
    const s = this.star;
    if (s) {
      const k = Math.min(1, this.glideSec() / (GLIDE_SEC * 0.9));
      const p = this.game.player.pos;
      const to = { x: p.x, y: p.y + 2.2, z: p.z };
      // 별은 늘 카메라와 플레이어 사이 시선 위에서 앞장선다(카메라가 돌아도 화면 밖으로 안 빠진다) — 처음엔 코앞, 끝엔 머리 위
      const cp = this.engine.camera.position;
      const lead = 0.1 + 0.9 * (k * k * (3 - 2 * k));
      const onLine = starPath({ x: cp.x, y: cp.y, z: cp.z }, to, lead);
      const wob = Math.sin(k * Math.PI * 2.2) * 1.4 * (1 - k);
      const at = { x: onLine.x + wob, y: onLine.y + 0.8 * (1 - k) - 6 * lead * (1 - lead) * 0.6, z: onLine.z - wob * 0.5 };
      s.head.position.set(at.x, at.y, at.z);
      s.head.rotation.z += dt * 9;
      s.head.rotation.y += dt * 3;
      s.head.scale.setScalar(0.75 + Math.sin(performance.now() / 70) * 0.07);
      s.hist.unshift(at);
      if (s.hist.length > s.trail.count) s.hist.length = s.trail.count;
      for (let i = 0; i < s.trail.count; i++) {
        const h = s.hist[Math.min(i, s.hist.length - 1)];
        const sc = i < s.hist.length ? 0.62 * (1 - i / s.trail.count) ** 0.7 : 0;
        this.tmp.position.set(h.x, h.y, h.z);
        this.tmp.scale.setScalar(sc);
        this.tmp.updateMatrix();
        s.trail.setMatrixAt(i, this.tmp.matrix);
      }
      s.trail.instanceMatrix.needsUpdate = true;
      if (k >= 1 && !s.landed) {
        s.landed = true;
        this.spawnBurst(to);
        this.game.audio?.sfx('shiny', { vol: 0.9 });
        this.dispose(s.root);
        this.star = null;
      }
    }
    const b = this.burst;
    if (b) {
      b.t += dt;
      const life = 1.25;
      for (let i = 0; i < b.pos.length; i++) {
        const v = b.vel[i], q = b.pos[i];
        v.y -= 11 * dt;
        v.x *= 1 - dt * 1.5; v.z *= 1 - dt * 1.5;
        q.x += v.x * dt; q.y += v.y * dt; q.z += v.z * dt;
        this.tmp.position.set(q.x, q.y, q.z);
        // 늘 카메라를 보게(옆에서 보면 별이 막대처럼 보인다) + 제자리 빙글
        this.tmp.quaternion.copy(this.engine.camera.quaternion);
        this.tmp.rotateZ(b.t * b.spin[i]);
        this.tmp.scale.setScalar(Math.max(0, 0.16 * (1 - (b.t / life) ** 2)) * (1 + 0.25 * Math.sin(b.t * 18 + i)));
        this.tmp.updateMatrix();
        b.mesh.setMatrixAt(i, this.tmp.matrix);
      }
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.t >= life) { this.dispose(b.mesh); this.burst = null; }
    }
    if (!this.star && !this.burst && this.mode === 'play') { this.removeUpd?.(); this.removeUpd = null; }
  }

  /** 통통한 별 지오메트리(반지름 1, 가운데 정렬) */
  private starGeo(bevelSegments: number) {
    const T = this.T;
    const shape = new T.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.42 : 1;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const geo = new T.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.18, bevelSegments, curveSegments: 6 });
    geo.center();
    return geo;
  }

  /** 착지 반짝: 별 조각들이 퐁 터져 흩어진다 */
  private spawnBurst(at: V3) {
    const T = this.T, N = 34;
    const mesh = new T.InstancedMesh(this.starGeo(1), new T.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff0c0', emissiveIntensity: 0.55, roughness: 0.4, fog: false }), N);
    mesh.frustumCulled = false;
    mesh.userData.noCull = true;
    mesh.name = 'intro-burst';
    // 무작위는 시드 고정(결정성) — 같은 착지는 늘 같은 반짝임
    const rnd = rngFor('intro-burst');
    const c = new T.Color();
    const vel: V3[] = [], pos: V3[] = [], spin: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, up = 2 + rnd() * 3.5, out = 2 + rnd() * 3;
      vel.push({ x: Math.cos(a) * out, y: up, z: Math.sin(a) * out });
      pos.push({ x: at.x, y: at.y - 1.2, z: at.z });
      spin.push(4 + rnd() * 8);
      mesh.setColorAt(i, c.set(PALE[i % PALE.length]));
    }
    this.engine.scene.add(mesh);
    this.burst = { mesh, vel, pos, spin, t: 0 };
  }

  private dispose(o: THREENS.Object3D) {
    o.removeFromParent();
    o.traverse((x) => {
      const m = x as THREENS.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREENS.Material | THREENS.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((y) => y.dispose()); else mat?.dispose();
    });
  }
}
