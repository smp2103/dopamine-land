// 렌더러·조명·하늘·후처리·모듈 로더. 룩 테스트의 공통 뼈대.
// 성능(웨이브 6): 적응형 픽셀 비율(22 ms 넘는 프레임이 3초 → 한 단계 내림, URL quality= 를 주면 끔) ·
//   작은 것 빼기(화면에서 아주 작은 메시는 그리지 않음, 품질별 QUALITY.cull·shadowCull) · 품질 → 청크(장식 반경·먼 고리·거리 숨김) 전달.
// 디버그: window.__perf = { state(), pixelRatio(v?), adaptive(on?), cull(k?, shadowK?) }
// 부팅(웨이브 7): 모듈은 한꺼번에 받아 오고(Engine.prefetchModules — 엔진 만들기 전에 미리 출발) 짓기는 order 순서 그대로 ·
//   loadModules(onProgress) 로 '친구들 부르는 중 n/m' 을 알린다(사람이 볼 때만 짓기 사이에 한 프레임 쉬어 화면을 그린다) ·
//   lil-gui(룩 테스트 패널)는 처음 열 때 받아 온다(buildGui/toggleGui). 캔버스 id = 'dl-world'(index.html 이 준비 전엔 숨긴다).
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect,
  ToneMappingEffect, ToneMappingMode, BrightnessContrastEffect, VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type GUI from 'lil-gui';
import * as Island from './island';
import { PALETTE } from './palette';
import { applyCurve, curveUniforms } from './curve';
import { rngFor } from './rng';
import { TOD, CAMS, CURVE_K, type TodPreset } from './presets';
import { QUALITY, QUALITY_ORDER, PixelRatioGovernor, bigEnough, isQuality, type QualityName } from './quality';
import { MiniDofEffect } from '../modules/atmosphere/miniDof';
import { SoftGradeEffect } from '../modules/atmosphere/grade';
import '../modules/atmosphere/fogChunks'; // 높이 안개·공기 원근(전역 fog 청크 교체)
import type { Ctx, ScatterOpts, ModuleBuild } from './types';
import type { Game } from './game';

export interface EngineOpts {
  solo: string[] | null;
  tod: string;
  cam: string;
  shot: boolean;
  /** 촬영 모드에서 고정할 시간(초) */
  freezeT: number | null;
  fx: Record<string, boolean>;
  curveK: number | null;
  quality: QualityName;
  /** 적응형 픽셀 비율(기본: 촬영 모드가 아니고 URL 에 quality= 가 없을 때만 켬) */
  adaptive?: boolean;
}

// ───────────── 작은 것 빼기(contribution culling) ─────────────
// 렌더러·그림자 패스 모두 Mesh.intersectsFrustum 으로 절두체 검사를 한다 → 거기에 '화면에서 너무 작으면 빼기'를 얹는다.
// 기준 = 눈(주 카메라)에서 본 경계 구의 (반지름 / 거리). 품질별 QUALITY.cull, fx=cull:0 이면 끔, userData.noCull 이면 늘 그림.
// 그림자 패스(그림자 맵 그리는 동안)는 더 센 기준 QUALITY.shadowCull — 작은 것의 그림자는 잘 안 보이는데 draw call 은 똑같다(shadowCull 0.02 ≈ 1900px 화면에서 지름 ~38px 아래).
// 본 화면을 그리는 동안(active)만 건다 — 환경광 굽기(PMREM)·사진·미니맵처럼 다른 카메라로 그리는 것은 그대로.
const CULL = { k: 0, shadowK: 0, active: false, inShadow: false, eye: new THREE.Vector3(), skipped: 0, skippedShadow: 0 };
const cullSphere = new THREE.Sphere();
let cullInstalled = false;
function installCull() {
  if (cullInstalled) return;
  cullInstalled = true;
  type Cullable = THREE.Mesh & { boundingSphere?: THREE.Sphere | null };
  const proto = THREE.Mesh.prototype as unknown as { intersectsFrustum: (this: Cullable, f: THREE.Frustum) => boolean };
  const base = proto.intersectsFrustum;
  proto.intersectsFrustum = function (this: Cullable, frustum: THREE.Frustum) {
    if (!base.call(this, frustum)) return false;
    if (!CULL.active) return true;
    const k = CULL.inShadow ? Math.max(CULL.k, CULL.shadowK) : CULL.k;
    if (k <= 0 || this.userData.noCull) return true;
    // 위 검사가 경계 구를 이미 계산해 두었다(InstancedMesh 는 자기 것, 나머지는 지오메트리 것)
    const bs = this.boundingSphere ?? this.geometry?.boundingSphere;
    if (!bs) return true;
    cullSphere.copy(bs).applyMatrix4(this.matrixWorld);
    if (bigEnough(cullSphere.radius, cullSphere.center.distanceTo(CULL.eye), k)) return true;
    if (CULL.inShadow) CULL.skippedShadow++; else CULL.skipped++;
    return false;
  };
}

/** 그림자 맵을 그리는 동안만 inShadow — 렌더러마다 한 번 감싼다 */
function wrapShadowPass(r: THREE.WebGLRenderer) {
  const sm = r.shadowMap as THREE.WebGLShadowMap & { render: (...a: unknown[]) => void };
  const base = sm.render;
  sm.render = function (...a: unknown[]) {
    CULL.inShadow = true;
    try { base.apply(this, a); } finally { CULL.inShadow = false; }
  };
}

type LoadedModule = { default: ModuleBuild; order?: number };
type Loader = () => Promise<LoadedModule>;

/** 모듈 불러오기 진행(loadModules 콜백) — import: 받아 옴, build: 지음 */
export interface ModuleProgress { phase: 'import' | 'build'; done: number; total: number; name: string }

/** 받아 오기 약속(이름 → import) — prefetchModules 가 먼저 출발시키면 loadModules 가 그대로 이어 쓴다 */
const fetching = new Map<string, Promise<LoadedModule>>();
function moduleEntries(solo: string[] | null) {
  const all = import.meta.glob<LoadedModule>('../modules/*.ts') as Record<string, Loader>;
  return Object.entries(all)
    .map(([path, load]) => ({ name: path.replace(/^.*\/(.*)\.ts$/, '$1'), load }))
    .filter((m) => !m.name.startsWith('_'))
    .filter((m) => !solo || solo.includes(m.name));
}
function fetchModule(m: { name: string; load: Loader }): Promise<LoadedModule> {
  let p = fetching.get(m.name);
  if (!p) { p = m.load(); fetching.set(m.name, p); p.catch(() => {}); }
  return p;
}
/** 화면을 한 번 그릴 틈(rAF 뒤 setTimeout). 숨은 탭에선 rAF 가 안 오니 60 ms 로 막는다 */
function yieldPaint(): Promise<void> {
  return new Promise((res) => {
    let done = false;
    const go = () => { if (!done) { done = true; res(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 60);
  });
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  controls: OrbitControls | null = null;
  sun = new THREE.DirectionalLight();
  /** 그림자 없는 약한 역광(카메라 반대편 위에서) */
  rim = new THREE.DirectionalLight();
  hemi = new THREE.HemisphereLight();
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  pmrem: THREE.PMREMGenerator;
  envRT: THREE.WebGLRenderTarget | null = null;
  updates: Array<(t: number, dt: number) => void> = [];
  /** 적응형 픽셀 비율 조절기(adaptive=false 면 쉰다) */
  pixelGov = new PixelRatioGovernor();
  adaptive: boolean;
  todHooks: Array<(name: string, p: TodPreset) => void> = [];
  /** 시간대 이름이 바뀔 때만(ctx.onTodChange) */
  todChangeHooks: Array<(name: string, prev: string) => void> = [];
  /** 마지막으로 알린 시간대 이름(onTodChange 비교용) */
  private todFired: string;
  /** 시간 배율(기본 1) — 프레임 dt 를 자른 뒤에 곱한다. 0 이면 dt 가 멈춤(t·game.time 은 실제 시간대로 흐른다. 촬영 모드의 고정 시간과는 별개) */
  timeScale = 1;
  occupied: Array<{ x: number; z: number; r: number }> = [];
  timer = new THREE.Timer();
  todName: string;
  private _game: Game | null = null;
  /** 게임을 붙이면 지금 품질의 청크 설정(장식 반경·먼 고리·거리 숨김 배율)을 바로 넘긴다 */
  get game(): Game | null { return this._game; }
  set game(g: Game | null) { this._game = g; if (g) this.applyChunkQuality(); }
  /** 게임 모드: 넓은 세계용 안개 거리 */
  fogOverride: { near: number; far: number } | null = null;
  errors: string[] = [];
  fx: Record<string, boolean>;
  quality: QualityName;
  effects: {
    ao: N8AOPostPass; bloom: BloomEffect; tilt: MiniDofEffect; smaa: SMAAEffect; tone: ToneMappingEffect;
    hue: SoftGradeEffect; bc: BrightnessContrastEffect; vig: VignetteEffect;
    passTilt: EffectPass; passSmaa: EffectPass; passGrade: EffectPass;
  };

  constructor(public opts: EngineOpts) {
    this.todName = TOD[opts.tod] ? opts.tod : 'day';
    this.todFired = this.todName;
    this.fx = { ao: true, bloom: true, tilt: true, smaa: true, grade: true, shadows: true, curve: true, cull: true, ...opts.fx };
    this.quality = opts.quality;
    // 사람이 URL 로 품질을 콕 집었으면 그 해상도를 지킨다(벤치·촬영도)
    const urlQ = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quality') : null;
    this.adaptive = opts.adaptive ?? (!opts.shot && !isQuality(urlQ));
    installCull();

    const r = new THREE.WebGLRenderer({
      antialias: false, stencil: false, depth: true, powerPreference: 'high-performance',
      preserveDrawingBuffer: opts.shot,
    });
    r.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[opts.quality].pixelRatio));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.info.autoReset = false; // 모든 패스(그림자·AO·후처리) 합산 통계
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.id = 'dl-world';
    document.body.appendChild(r.domElement);
    this.renderer = r;
    wrapShadowPass(r);
    this.pmrem = new THREE.PMREMGenerator(r);

    const cp = CAMS[opts.cam] ?? CAMS.ac;
    this.camera = new THREE.PerspectiveCamera(cp.fov, window.innerWidth / window.innerHeight, 0.1, 9000);
    this.setCam(opts.cam);

    // 하늘: 카메라를 따라다니는 큰 구 + 세로 그라디언트(곡률·안개 제외).
    // uHorizon = 휘는 땅 너머로 보이는 '겉보기 지평선'의 높이(sin) — 그라디언트·구름이 거기 맞춘다.
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
        uHorizon: { value: 0 }, uStars: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uSunGlow: { value: 0 },
        uMilky: { value: 0 }, uStarDensity: { value: 1 }, uSunDisc: { value: 0 }, uMoon: { value: 0 }, uHaze: { value: 0 },
        uHazeColor: { value: new THREE.Color('#ffffff') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize( position );
          vec4 p = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * p;
          gl_Position.z = gl_Position.w; // 항상 가장 먼 곳
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
        uniform float uHorizon; uniform float uStars;
        uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunGlow;
        uniform float uMilky; uniform float uStarDensity; uniform float uSunDisc; uniform float uMoon;
        uniform float uHaze; uniform vec3 uHazeColor;
        varying vec3 vDir;
        float hash13( vec3 p ) {
          p = fract( p * 0.1031 );
          p += dot( p, p.zyx + 31.32 );
          return fract( ( p.x + p.y ) * p.z );
        }
        float vnoise( vec3 p ) {
          vec3 i = floor( p ), f = fract( p );
          f = f * f * ( 3.0 - 2.0 * f );
          float n000 = hash13( i ), n100 = hash13( i + vec3( 1, 0, 0 ) ), n010 = hash13( i + vec3( 0, 1, 0 ) ), n110 = hash13( i + vec3( 1, 1, 0 ) );
          float n001 = hash13( i + vec3( 0, 0, 1 ) ), n101 = hash13( i + vec3( 1, 0, 1 ) ), n011 = hash13( i + vec3( 0, 1, 1 ) ), n111 = hash13( i + vec3( 1, 1, 1 ) );
          return mix( mix( mix( n000, n100, f.x ), mix( n010, n110, f.x ), f.y ), mix( mix( n001, n101, f.x ), mix( n011, n111, f.x ), f.y ), f.z );
        }
        float fbm3( vec3 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 4; i++ ) { s += a * vnoise( p ); p *= 2.07; a *= 0.5; } return s; }
        vec3 starLayer( vec3 d, float scale, float thr, float sizeK ) {
          vec3 p = d * scale;
          vec3 cell = floor( p );
          float h = hash13( cell );
          if ( h < thr ) return vec3( 0.0 );
          vec3 sp = cell + 0.5 + 0.35 * ( vec3( hash13( cell + 7.1 ), hash13( cell + 3.7 ), hash13( cell + 1.3 ) ) - 0.5 );
          float r = length( p - sp );
          float b = ( 1.0 - smoothstep( 0.0, ( 0.16 + 0.12 * fract( h * 91.0 ) ) * sizeK, r ) ) * ( 0.45 + 0.55 * fract( h * 57.0 ) );
          float tint = fract( h * 13.0 );
          vec3 col = tint < 0.33 ? vec3( 0.75, 0.85, 1.0 ) : tint < 0.66 ? vec3( 1.0, 0.97, 0.88 ) : vec3( 1.0, 0.85, 0.75 );
          return col * b;
        }
        void main() {
          vec3 d = normalize( vDir );
          // 겉보기 지평선 기준 높이(위 = 양수)
          float y = ( d.y - uHorizon ) / ( 1.0 - uHorizon );
          vec3 c = y > 0.0 ? mix( horizon, top, pow( smoothstep( 0.0, 0.75, y ), 0.7 ) )
                           : mix( horizon, bottom, smoothstep( 0.0, -0.2, y ) );
          // 지평선 바로 위 옅은 공기층(멀리 있는 것이 하늘에 녹는 띠)
          c = mix( c, uHazeColor, uHaze * exp( -abs( y ) * 14.0 ) );
          // 해 쪽 번짐(아침·노을)
          vec3 sdir = normalize( uSunDir );
          float sd = max( dot( d, sdir ), 0.0 );
          c += uSunColor * uSunGlow * ( pow( sd, 6.0 ) * 0.6 + pow( sd, 40.0 ) * 0.5 ) * ( 1.0 - smoothstep( 0.0, 0.6, y ) );
          // 해 원반(둥글고 부드럽게) + 후광
          if ( uSunDisc > 0.0 ) {
            float disc = smoothstep( 0.9986, 0.9992, sd );
            c = mix( c, vec3( 1.0, 0.98, 0.92 ) * 1.6, disc * uSunDisc );
            c += uSunColor * uSunDisc * ( pow( sd, 300.0 ) * 0.5 + pow( sd, 24.0 ) * 0.12 );
          }
          float night = smoothstep( 0.03, 0.3, y );
          // 은하수: 기울어진 큰 원을 따라 구름 같은 빛 띠
          if ( uMilky > 0.0 ) {
            vec3 axis = normalize( vec3( 0.35, 0.55, 0.76 ) );
            float band = 1.0 - abs( dot( d, axis ) );
            float core = pow( max( band, 0.0 ), 9.0 );
            float n = fbm3( d * 5.0 );
            float n2 = fbm3( d * 13.0 + 4.0 );
            float m = core * ( 0.45 + 0.9 * n ) * ( 0.7 + 0.5 * n2 );
            float dust = smoothstep( 0.55, 0.75, fbm3( d * 9.0 + 9.0 ) ) * pow( max( band, 0.0 ), 30.0 );
            vec3 mc = mix( vec3( 0.55, 0.45, 0.95 ), vec3( 1.0, 0.82, 0.92 ), n2 );
            c += mc * m * uMilky * 0.55 * night * ( 1.0 - dust * 0.7 );
            // 은하수 안쪽은 작은 별이 촘촘
            c += starLayer( d, 420.0, 1.0 - 0.18 * core, 1.4 ) * uMilky * core * 1.6 * night;
          }
          // 별: 방향 격자마다 하나, 지평선 근처는 옅게
          if ( uStars > 0.0 ) {
            vec3 s = starLayer( d, 140.0, 1.0 - 0.015 * uStarDensity, 1.0 ) * 2.2;
            s += starLayer( d, 260.0, 1.0 - 0.02 * uStarDensity, 1.1 ) * 1.1;
            c += s * uStars * night;
          }
          // 달: 해 방향(밤에는 달빛 방향)에 둥근 달 + 은은한 무리
          if ( uMoon > 0.0 ) {
            float md = dot( d, sdir );
            float disc = smoothstep( 0.99955, 0.9997, md );
            vec3 mcol = vec3( 1.0, 0.97, 0.86 ) * ( 0.9 + 0.25 * vnoise( d * 900.0 ) );
            c = mix( c, mcol * 1.5, disc * uMoon );
            c += vec3( 0.55, 0.65, 1.0 ) * uMoon * ( pow( max( md, 0.0 ), 60.0 ) * 0.35 + pow( max( md, 0.0 ), 8.0 ) * 0.08 );
          }
          gl_FragColor = vec4( c, 1.0 );
          #include <colorspace_fragment>
        }`,
    });
    this.skyMat.userData.noCurve = true;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 64, 32), this.skyMat);
    this.sky.name = 'sky';
    this.sky.userData.noCurve = true;
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(4096, 4096);
    sh.camera.left = -30; sh.camera.right = 30; sh.camera.top = 30; sh.camera.bottom = -30;
    sh.camera.near = 1; sh.camera.far = 180;
    sh.bias = -0.00025;
    sh.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.rim.castShadow = false;
    this.scene.add(this.rim, this.rim.target);
    this.scene.fog = new THREE.Fog(0xffffff, 40, 140);

    // 후처리
    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const ao = new N8AOPostPass(this.scene, this.camera, w, h);
    ao.configuration.aoRadius = 1.6;
    ao.configuration.distanceFalloff = 0.8;
    ao.configuration.intensity = 2.2;
    ao.configuration.halfRes = false;
    ao.configuration.gammaCorrection = false;
    ao.setQualityMode('High');
    this.composer.addPass(ao);
    const bloom = new BloomEffect({ mipmapBlur: true, intensity: 0.35, luminanceThreshold: 1.6, luminanceSmoothing: 0.2, radius: 0.7 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    this.composer.addPass(new EffectPass(this.camera, bloom, tone));
    const smaa = new SMAAEffect();
    const passSmaa = new EffectPass(this.camera, smaa);
    this.composer.addPass(passSmaa);
    // '틸트시프트' = 깊이 기준 미니어처 심도(초점 띠 선명, 먼 곳·바로 앞만 흐림)
    const tilt = new MiniDofEffect();
    const passTilt = new EffectPass(this.camera, tilt);
    this.composer.addPass(passTilt);
    const hue = new SoftGradeEffect();
    const bc = new BrightnessContrastEffect({ contrast: 0.04 });
    const vig = new VignetteEffect({ offset: 0.32, darkness: 0.25 });
    const passGrade = new EffectPass(this.camera, hue, bc, vig);
    this.composer.addPass(passGrade);
    this.effects = { ao, bloom, tilt, smaa, tone, hue, bc, vig, passTilt, passSmaa, passGrade };

    if (opts.curveK !== null) curveUniforms.uCurveK.value = opts.curveK;
    this.applyTod(this.todName);
    this.setQuality(this.quality);

    window.addEventListener('resize', () => this.resize());
  }

  setCam(name: string) {
    const cp = CAMS[name] ?? CAMS.ac;
    this.camName = CAMS[name] ? name : 'ac';
    this.camera.fov = cp.fov;
    this.camera.position.set(...cp.pos);
    this.viewTarget.set(...cp.target);
    this.camera.lookAt(this.viewTarget);
    this.camera.updateProjectionMatrix();
    if (this.controls) {
      this.controls.target.set(...cp.target);
      this.controls.update();
    }
    curveUniforms.uCurveOrigin.value.set(cp.target[0], 0, cp.target[2]);
    this.updateView();
  }

  camName = 'ac';
  private lastAoColor = '';
  viewTarget = new THREE.Vector3();
  sunDir = new THREE.Vector3(0, 1, 0);

  /** 카메라에 딸린 것들: 하늘 위치·겉보기 지평선·심도 초점·해/역광 위치 */
  updateView() {
    const cam = this.camera, tgt = this.viewTarget;
    this.sky?.position.copy(cam.position);
    // 겉보기 지평선: 휘는 땅을 앞으로 훑어 카메라에서 가장 높이 보이는 기울기
    if (this.skyMat) {
      const k = curveUniforms.uCurveK.value, o = curveUniforms.uCurveOrigin.value;
      const f = new THREE.Vector3();
      cam.getWorldDirection(f);
      f.y = 0;
      if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
      f.normalize();
      let best = -Infinity;
      // 높이 날면 지평선이 멀어진다 → 가까이는 촘촘히, 멀리는 성기게 4 km 까지
      for (let s = 2; s <= 4000; s = s < 120 ? s + 2 : s * 1.03) {
        const dx = cam.position.x + f.x * s - o.x, dz = cam.position.z + f.z * s - o.z;
        const yg = 0.6 - k * (dz * dz + 0.18 * dx * dx);
        best = Math.max(best, (yg - cam.position.y) / s);
      }
      this.skyMat.uniforms.uHorizon.value = Math.sin(Math.atan(best));
    }
    if (this.effects) {
      const cp = CAMS[this.camName] ?? CAMS.ac;
      const d = cp.dof ?? { nearSharp: 3, farSharp: 4, nearRamp: 3, farRamp: 14, nearMax: 0.5, farMax: 1 };
      // 초점 = 기준점까지 시선 방향 깊이
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      const focus = tgt.clone().sub(cam.position).dot(fwd);
      this.effects.tilt.setParams({ focus, ...d });
    }
    const focusG = new THREE.Vector3(tgt.x, 0, tgt.z);
    this.sun.position.copy(focusG).addScaledVector(this.sunDir, 80);
    this.sun.target.position.copy(focusG);
    // 역광: 카메라 반대편(시선 앞쪽) 위에서 카메라 쪽으로
    const back = new THREE.Vector3(tgt.x - cam.position.x, 0, tgt.z - cam.position.z).normalize();
    this.rim.position.copy(focusG).addScaledVector(back, 40).add(new THREE.Vector3(0, 28, 0));
    this.rim.target.position.copy(focusG);
  }

  applyTod(name: string) {
    this.applyPreset(name, TOD[name] ?? TOD.day, true);
  }

  /** 프리셋 값을 그대로 적용(시간 흐름·날씨가 보간한 값). env=false 면 환경광 굽기를 건너뛴다(매 프레임용) */
  applyPreset(name: string, p: TodPreset, env = true) {
    this.todName = name;
    const az = THREE.MathUtils.degToRad(p.sunAzimuth), el = THREE.MathUtils.degToRad(p.sunElevation);
    this.sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az));
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.sun.shadow.radius = p.shadowRadius;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.skyMat.uniforms.top.value.set(p.skyTop);
    this.skyMat.uniforms.horizon.value.set(p.skyHorizon);
    this.skyMat.uniforms.bottom.value.set(p.skyBottom);
    this.skyMat.uniforms.uSunDir.value.copy(this.sunDir);
    this.skyMat.uniforms.uSunColor.value.set(p.sunColor);
    this.skyMat.uniforms.uSunGlow.value = p.sunGlow;
    this.skyMat.uniforms.uStars.value = p.stars;
    this.skyMat.uniforms.uMilky.value = p.milky ?? 0;
    this.skyMat.uniforms.uStarDensity.value = p.starDensity ?? 1;
    this.skyMat.uniforms.uSunDisc.value = p.sunDisc ?? 0;
    this.skyMat.uniforms.uMoon.value = p.moon ?? 0;
    this.skyMat.uniforms.uHaze.value = p.hazeBand ?? 0;
    this.skyMat.uniforms.uHazeColor.value.set(p.fogColor);
    this.rim.color.set(p.rimColor);
    this.rim.intensity = p.rimIntensity;
    const fog = this.scene.fog as THREE.Fog;
    const gf = this.fogOverride ? (p.worldFog ?? this.fogOverride) : null;
    fog.color.set(p.fogColor); fog.near = gf?.near ?? p.fogNear; fog.far = gf?.far ?? p.fogFar;
    this.renderer.toneMappingExposure = p.exposure;

    // 하늘 그라디언트로 환경광(반사·은은한 하늘빛)을 굽는다
    // 환경광은 진짜 수평선 기준·별·해 원반 없이 굽는다
    if (env || !this.envRT) {
      const envScene = new THREE.Scene();
      const envGeo = new THREE.SphereGeometry(10, 32, 16);
      envScene.add(new THREE.Mesh(envGeo, this.skyMat));
      const u = this.skyMat.uniforms;
      const keep = [u.uHorizon.value, u.uStars.value, u.uMilky.value, u.uSunDisc.value, u.uMoon.value];
      u.uHorizon.value = 0; u.uStars.value = 0; u.uMilky.value = 0; u.uSunDisc.value = 0; u.uMoon.value = 0;
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(envScene, 0.04);
      old?.dispose();
      envGeo.dispose();
      [u.uHorizon.value, u.uStars.value, u.uMilky.value, u.uSunDisc.value, u.uMoon.value] = keep;
      this.scene.environment = this.envRT.texture;
    }
    this.scene.environmentIntensity = p.envIntensity;

    const e = this.effects;
    if (e) {
      e.bloom.intensity = p.bloomIntensity;
      e.bloom.luminanceMaterial.threshold = p.bloomThreshold;
      e.hue.set(p.gradeLift, p.gradeGain, p.saturation);
      e.bc.contrast = p.contrast;
      e.bc.brightness = p.brightness;
      e.vig.darkness = p.vignette;
      e.ao.configuration.intensity = p.aoIntensity;
      if (this.lastAoColor !== p.aoColor) { this.lastAoColor = p.aoColor; e.ao.configuration.color = new THREE.Color(p.aoColor); }
    }
    this.updateView();
    for (const fn of this.todHooks) fn(name, p);
    this.fireTodChange(name);
  }

  /** 이름이 바뀌었을 때만 onTodChange 를 부른다(한 리스너가 터져도 나머지는 돈다) */
  private fireTodChange(name: string) {
    if (name === this.todFired) return;
    const prev = this.todFired;
    this.todFired = name;
    for (const fn of [...this.todChangeHooks]) {
      try { fn(name, prev); } catch (e) { console.error('[onTodChange]', e); }
    }
  }

  /** 매 프레임 훅 등록 — 해제 함수를 돌려준다 */
  addUpdate(fn: (t: number, dt: number) => void): () => void {
    this.updates.push(fn);
    return () => { const i = this.updates.indexOf(fn); if (i >= 0) this.updates.splice(i, 1); };
  }

  /** 시간대 이름 바뀜 훅 등록 — 해제 함수를 돌려준다 */
  onTodChange(fn: (name: string, prev: string) => void): () => void {
    this.todChangeHooks.push(fn);
    return () => { const i = this.todChangeHooks.indexOf(fn); if (i >= 0) this.todChangeHooks.splice(i, 1); };
  }

  /** 그래픽 품질 단계: 효과 켜고 끄기·해상도·그림자 맵·장식 거리. URL fx= 는 그 위에 덮어쓴다 */
  setQuality(name: QualityName) {
    const q = QUALITY[name];
    this.quality = name;
    Object.assign(this.fx, { ao: q.ao !== 'off', bloom: q.bloom, tilt: q.tilt, smaa: q.smaa, shadows: q.shadows }, this.opts.fx);
    const ao = this.effects.ao;
    if (q.ao !== 'off') {
      ao.setQualityMode(q.ao === 'full' ? 'High' : 'Medium');
      ao.configuration.halfRes = q.ao === 'half';
    }
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== q.shadowMap) {
      sh.mapSize.set(q.shadowMap, q.shadowMap);
      sh.map?.dispose();
      sh.map = null;
    }
    const pr = Math.min(window.devicePixelRatio, q.pixelRatio);
    this.pixelGov.reset(pr, Math.min(pr, q.minPixelRatio));
    this.setPixelRatio(pr);
    this.applyChunkQuality();
    this.applyFx();
  }

  /** 렌더 픽셀 비율을 바꾼다(후처리 버퍼까지) */
  setPixelRatio(pr: number) {
    if (this.renderer.getPixelRatio() === pr) return;
    this.renderer.setPixelRatio(pr);
    this.resize();
  }

  /** 품질 → 청크: 장식 반경 배율·먼 고리·거리 숨김 배율 */
  applyChunkQuality() {
    const g = this._game;
    if (!g) return;
    const q = QUALITY[this.quality];
    g.chunks.detail = q.detail;
    g.chunks.farDetail = q.farDetail;
    g.chunks.lodScale = q.lod;
  }

  /** 다음 단계로(높음 → 보통 → 낮음 → 높음) */
  cycleQuality() {
    const i = QUALITY_ORDER.indexOf(this.quality);
    this.setQuality(QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length]);
    return this.quality;
  }

  applyFx() {
    const e = this.effects, f = this.fx;
    e.ao.enabled = f.ao;
    e.bloom.blendMode.opacity.value = f.bloom ? 1 : 0;
    // 중간 패스는 통째로 건너뛴다(불투명도 0 이어도 흐림·에지 검출은 돈다)
    e.passSmaa.enabled = f.smaa;
    e.passTilt.enabled = f.tilt;
    // 마지막 패스를 끄면 화면이 비므로 패스는 두고 효과 불투명도만 0 으로
    for (const g of [e.hue, e.bc, e.vig]) g.blendMode.opacity.value = f.grade ? 1 : 0;
    this.sun.castShadow = f.shadows;
    CULL.k = f.cull ? QUALITY[this.quality].cull : 0;
    CULL.shadowK = f.cull ? QUALITY[this.quality].shadowCull : 0;
    curveUniforms.uCurveK.value = f.curve ? (this.opts.curveK ?? CURVE_K) : 0;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  scatter(o: ScatterOpts) {
    const rnd = rngFor('scatter:' + o.key);
    const b = o.bounds ?? Island.ISLAND_BOUNDS;
    const pts: Array<{ x: number; z: number; y: number }> = [];
    const avoid = o.avoidOccupied !== false;
    let tries = 0;
    while (pts.length < o.count && tries < o.count * 60) {
      tries++;
      const x = b.minX + rnd() * (b.maxX - b.minX);
      const z = b.minZ + rnd() * (b.maxZ - b.minZ);
      if (pts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < o.minDist * o.minDist)) continue;
      if (avoid && this.occupied.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < p.r * p.r)) continue;
      if (!o.accept(x, z)) continue;
      pts.push({ x, z, y: Island.heightAt(x, z) });
    }
    const occ = o.occupy ?? o.minDist * 0.5;
    if (occ > 0) for (const p of pts) this.occupied.push({ x: p.x, z: p.z, r: occ });
    return pts;
  }

  ctx(): Ctx {
    return {
      scene: this.scene, renderer: this.renderer, camera: this.camera,
      island: Island, palette: PALETTE, rng: rngFor,
      onUpdate: (fn) => this.addUpdate(fn),
      onTod: (fn) => { this.todHooks.push(fn); },
      onTodChange: (fn) => this.onTodChange(fn),
      scatter: (o) => this.scatter(o),
      tod: this.todName,
      game: this.game,
    };
  }

  /** 모듈별 짓기 시간(ms) — 부팅 측정용 */
  moduleMs: Record<string, number> = {};

  /** 모듈 파일 받아 오기를 미리 출발시킨다(엔진을 만들기 전에 불러도 된다). 실행 순서·결과는 loadModules 와 같다 */
  static prefetchModules(solo: string[] | null) {
    for (const m of moduleEntries(solo)) fetchModule(m);
  }

  /** 모듈 받아 오기(한꺼번에) → order 순서로 짓기. onProgress 로 진행을 알린다 */
  async loadModules(onProgress?: (p: ModuleProgress) => void) {
    const entries = moduleEntries(this.opts.solo);
    const total = entries.length;
    const tell = (p: ModuleProgress) => { try { onProgress?.(p); } catch (e) { console.error('[loadModules progress]', e); } };
    // 받아 오기는 동시에(네트워크·변환 대기를 겹친다). 결과는 목록 순서 그대로 모아 정렬이 늘 같게
    let got = 0;
    const settled = await Promise.allSettled(entries.map((m) => fetchModule(m).then((mod) => {
      tell({ phase: 'import', done: ++got, total, name: m.name });
      return mod;
    })));
    const loaded: Array<{ name: string; mod: LoadedModule }> = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') loaded.push({ name: entries[i].name, mod: r.value });
      else this.fail(entries[i].name, r.reason);
    });
    loaded.sort((a, b) => (a.mod.order ?? 10) - (b.mod.order ?? 10));
    // 플레이어 주변은 기본으로 비워 둔다
    this.occupied.push({ x: Island.HERO.player.x, z: Island.HERO.player.z, r: Island.HERO.clearRadius });
    // 사람이 보는 로딩이면 짓기 사이사이 화면을 그려 진행 막대가 움직이게(촬영은 쉬지 않고 그대로)
    const paint = !!onProgress && !this.opts.shot;
    let lastPaint = performance.now();
    let built = 0;
    for (const { name, mod } of loaded) {
      const b0 = performance.now();
      try {
        const obj = await mod.default(this.ctx());
        if (obj) { obj.name = obj.name || name; this.scene.add(obj); }
      } catch (err) { this.fail(name, err); }
      this.moduleMs[name] = Math.round(performance.now() - b0);
      tell({ phase: 'build', done: ++built, total: loaded.length, name });
      if (paint && performance.now() - lastPaint > 40) { await yieldPaint(); lastPaint = performance.now(); }
    }
    applyCurve(this.scene);
    for (const fn of this.todHooks) fn(this.todName, TOD[this.todName]);
    return loaded.map((l) => l.name);
  }

  fail(name: string, err: unknown) {
    const msg = `[module ${name}] ${err instanceof Error ? err.stack ?? err.message : String(err)}`;
    console.error(msg);
    this.errors.push(msg);
  }

  enableControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    const cp = CAMS[this.opts.cam] ?? CAMS.ac;
    this.controls.target.set(...cp.target);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.update();
  }

  /** 룩 테스트 패널(lil-gui) — 처음 부를 때 받아 와 만든다. 이미 있으면 그것을 돌려준다 */
  async buildGui(): Promise<GUI> {
    if (this.gui) return this.gui;
    this.guiPending ??= this.makeGui();
    return this.guiPending;
  }

  /** 룩 테스트 패널 보이기/숨기기(on 생략 = 토글). 없으면 만든다. 지금 보이는지 돌려준다 */
  async toggleGui(on?: boolean): Promise<boolean> {
    const had = !!this.gui || !!this.guiPending;
    const gui = await this.buildGui();
    const show = on ?? (had ? gui._hidden : true);
    gui.show(show);
    return show;
  }

  gui: GUI | null = null;
  private guiPending: Promise<GUI> | null = null;

  private async makeGui(): Promise<GUI> {
    const { default: GUICtor } = await import('lil-gui');
    const gui = new GUICtor({ title: '룩 테스트' });
    this.gui = gui;
    const state = { quality: this.quality, tod: this.todName, cam: this.opts.cam, curveK: curveUniforms.uCurveK.value };
    const qNames = Object.fromEntries(QUALITY_ORDER.map((k) => [QUALITY[k].label, k]));
    gui.add(state, 'quality', qNames).name('그래픽 품질').onChange((v: QualityName) => {
      this.setQuality(v);
      this.onQualityChange?.(v);
      for (const c of gui.controllersRecursive()) c.updateDisplay();
    });
    this.guiSync = () => { state.quality = this.quality; for (const c of gui.controllersRecursive()) c.updateDisplay(); };
    gui.add(state, 'tod', Object.keys(TOD)).name('시간대').onChange((v: string) => this.applyTod(v));
    gui.add(state, 'cam', Object.keys(CAMS)).name('카메라').onChange((v: string) => this.setCam(v));
    const f = gui.addFolder('효과 켜고 끄기');
    const labels: Record<string, string> = {
      ao: '구석 그늘(AO)', bloom: '빛 번짐(블룸)', tilt: '틸트시프트', smaa: '안티에일리어싱', grade: '색보정·비네트', shadows: '그림자', curve: '휘는 땅',
      cull: '작은 것 빼기',
    };
    for (const k of Object.keys(labels)) {
      f.add(this.fx, k).name(labels[k]).onChange(() => this.applyFx());
    }
    const toneModes = { Neutral: ToneMappingMode.NEUTRAL, AgX: ToneMappingMode.AGX, ACES: ToneMappingMode.ACES_FILMIC };
    gui.add({ tone: 'Neutral' }, 'tone', Object.keys(toneModes)).name('톤매핑').onChange((v: keyof typeof toneModes) => {
      this.effects.tone.mode = toneModes[v];
    });
    gui.add(state, 'curveK', 0, 0.012, 0.0005).name('땅 휘는 정도').onChange((v: number) => {
      this.opts.curveK = v; this.applyFx();
    });
    return gui;
  }

  /** GUI 표시를 현재 값에 맞춘다(G 키로 품질을 바꿨을 때) */
  guiSync: (() => void) | null = null;
  /** 사람이 품질을 바꿨을 때(저장용) */
  onQualityChange: ((q: QualityName) => void) | null = null;

  /** 적응형 픽셀 비율: 실제 프레임 간격(ms)을 넣는다. 바뀌면 렌더러에 적용 */
  private adaptPixelRatio(frameMs: number) {
    if (!this.adaptive || document.hidden) return;
    const next = this.pixelGov.feed(frameMs, performance.now() / 1000);
    if (next === null) return;
    this.setPixelRatio(next);
    console.info(`[quality] 픽셀 비율 ${next} (평균 ${this.pixelGov.avg?.toFixed(1)} ms)`);
  }

  /** window.__perf — 벤치·디버그용 */
  private installPerfDebug() {
    const perf = {
      state: () => {
        const ch = this._game?.chunks;
        return {
          quality: this.quality, adaptive: this.adaptive, pixelRatio: this.renderer.getPixelRatio(),
          gov: { cap: this.pixelGov.cap, floor: this.pixelGov.floor, current: this.pixelGov.current, avg: this.pixelGov.avg, drops: this.pixelGov.drops },
          cull: { k: CULL.k, shadowK: CULL.shadowK, skipped: CULL.skipped, skippedShadow: CULL.skippedShadow },
          chunks: ch ? { budgetMs: ch.budgetMs, frameMs: ch.frameMs, pending: ch.pending, detail: ch.detail, farDetail: ch.farDetail, lodScale: ch.lodScale, lod: ch.lod.stats() } : null,
        };
      },
      /** 픽셀 비율을 직접(적응형은 끈다) */
      pixelRatio: (v?: number) => { if (typeof v === 'number' && v > 0) { this.adaptive = false; this.setPixelRatio(v); } return this.renderer.getPixelRatio(); },
      adaptive: (on?: boolean) => { if (typeof on === 'boolean') { this.adaptive = on; if (on) { this.pixelGov.reset(this.pixelGov.cap, this.pixelGov.floor); this.setPixelRatio(this.pixelGov.cap); } } return this.adaptive; },
      /** 작은 것 빼기 기준(r/d) — 0 이면 끔 */
      cull: (k?: number, shadowK?: number) => {
        if (typeof k === 'number' && k >= 0) CULL.k = k;
        if (typeof shadowK === 'number' && shadowK >= 0) CULL.shadowK = shadowK;
        return { k: CULL.k, shadowK: CULL.shadowK };
      },
    };
    (window as unknown as { __perf?: typeof perf }).__perf = perf;
  }

  start(onFrame?: (n: number) => void) {
    let n = 0;
    this.installPerfDebug();
    let lastFrame = -1;
    const loop = () => {
      const nowMs = performance.now();
      if (lastFrame >= 0) this.adaptPixelRatio(nowMs - lastFrame);
      lastFrame = nowMs;
      this.timer.update();
      // 긴 멈춤(탭 전환 등) 뒤 순간이동을 막으려 먼저 자르고, 그 다음 시간 배율을 곱한다
      const ts = Number.isFinite(this.timeScale) ? Math.max(0, this.timeScale) : 1;
      const rawDt = Math.min(this.timer.getDelta(), 0.05);
      const dt = rawDt * ts;
      const t = this.opts.freezeT ?? this.timer.getElapsed();
      if (this.controls) {
        this.controls.update();
        curveUniforms.uCurveOrigin.value.set(this.controls.target.x, 0, this.controls.target.z);
        this.viewTarget.copy(this.controls.target);
      }
      if (this.game) this.game.update(t, this.opts.freezeT !== null ? 0 : dt);
      this.updateView();
      // 복사본으로 돈다 — 훅 안에서 해제해도 이번 프레임 순서가 흔들리지 않게
      for (const fn of this.updates.slice()) fn(t, this.opts.freezeT !== null ? 0 : dt);
      this.renderer.info.reset();
      this.camera.getWorldPosition(CULL.eye);
      CULL.skipped = CULL.skippedShadow = 0;
      CULL.active = true;
      try { this.composer.render(rawDt); } finally { CULL.active = false; }
      onFrame?.(++n);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
