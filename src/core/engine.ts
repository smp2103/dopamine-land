// 렌더러·조명·하늘·후처리·모듈 로더. 룩 테스트의 공통 뼈대.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, TiltShiftEffect, SMAAEffect,
  ToneMappingEffect, ToneMappingMode, HueSaturationEffect, BrightnessContrastEffect, VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import * as Island from './island';
import { PALETTE } from './palette';
import { applyCurve, curveUniforms } from './curve';
import { rngFor } from './rng';
import { TOD, CAMS, type TodPreset } from './presets';
import type { Ctx, ScatterOpts, ModuleBuild } from './types';

export interface EngineOpts {
  solo: string[] | null;
  tod: string;
  cam: string;
  shot: boolean;
  /** 촬영 모드에서 고정할 시간(초) */
  freezeT: number | null;
  fx: Record<string, boolean>;
  curveK: number | null;
}

type Loader = () => Promise<{ default: ModuleBuild; order?: number }>;

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  controls: OrbitControls | null = null;
  sun = new THREE.DirectionalLight();
  hemi = new THREE.HemisphereLight();
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  pmrem: THREE.PMREMGenerator;
  envRT: THREE.WebGLRenderTarget | null = null;
  updates: Array<(t: number, dt: number) => void> = [];
  todHooks: Array<(name: string, p: TodPreset) => void> = [];
  occupied: Array<{ x: number; z: number; r: number }> = [];
  timer = new THREE.Timer();
  todName: string;
  errors: string[] = [];
  fx: Record<string, boolean>;
  effects: {
    ao: N8AOPostPass; bloom: BloomEffect; tilt: TiltShiftEffect; smaa: SMAAEffect; tone: ToneMappingEffect;
    hue: HueSaturationEffect; bc: BrightnessContrastEffect; vig: VignetteEffect;
    passTilt: EffectPass; passSmaa: EffectPass; passGrade: EffectPass;
  };

  constructor(public opts: EngineOpts) {
    this.todName = TOD[opts.tod] ? opts.tod : 'day';
    this.fx = { ao: true, bloom: true, tilt: true, smaa: true, grade: true, shadows: true, curve: true, ...opts.fx };

    const r = new THREE.WebGLRenderer({
      antialias: false, stencil: false, depth: true, powerPreference: 'high-performance',
      preserveDrawingBuffer: opts.shot,
    });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(r.domElement);
    this.renderer = r;
    this.pmrem = new THREE.PMREMGenerator(r);

    const cp = CAMS[opts.cam] ?? CAMS.ac;
    this.camera = new THREE.PerspectiveCamera(cp.fov, window.innerWidth / window.innerHeight, 0.1, 600);
    this.setCam(opts.cam);

    // 하늘: 큰 구 + 세로 그라디언트(곡률·안개 제외)
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
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
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 c = y > 0.0 ? mix( horizon, top, pow( smoothstep( 0.0, 0.75, y ), 0.8 ) )
                           : mix( horizon, bottom, smoothstep( 0.0, -0.25, y ) );
          gl_FragColor = vec4( c, 1.0 );
          #include <colorspace_fragment>
        }`,
    });
    this.skyMat.userData.noCurve = true;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), this.skyMat);
    this.sky.userData.noCurve = true;
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(4096, 4096);
    sh.camera.left = -34; sh.camera.right = 34; sh.camera.top = 34; sh.camera.bottom = -34;
    sh.camera.near = 1; sh.camera.far = 160;
    sh.bias = -0.0004;
    sh.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);
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
    const tilt = new TiltShiftEffect({ offset: 0.06, rotation: 0, focusArea: 0.42, feather: 0.32, kernelSize: 3 });
    const passTilt = new EffectPass(this.camera, tilt);
    this.composer.addPass(passTilt);
    const hue = new HueSaturationEffect({ saturation: 0.1 });
    const bc = new BrightnessContrastEffect({ contrast: 0.04 });
    const vig = new VignetteEffect({ offset: 0.32, darkness: 0.25 });
    const passGrade = new EffectPass(this.camera, hue, bc, vig);
    this.composer.addPass(passGrade);
    this.effects = { ao, bloom, tilt, smaa, tone, hue, bc, vig, passTilt, passSmaa, passGrade };

    if (opts.curveK !== null) curveUniforms.uCurveK.value = opts.curveK;
    this.applyTod(this.todName);
    this.applyFx();

    window.addEventListener('resize', () => this.resize());
  }

  setCam(name: string) {
    const cp = CAMS[name] ?? CAMS.ac;
    this.camera.fov = cp.fov;
    this.camera.position.set(...cp.pos);
    this.camera.lookAt(new THREE.Vector3(...cp.target));
    this.camera.updateProjectionMatrix();
    if (this.controls) {
      this.controls.target.set(...cp.target);
      this.controls.update();
    }
    curveUniforms.uCurveOrigin.value.set(cp.target[0], 0, cp.target[2]);
  }

  applyTod(name: string) {
    const p = TOD[name] ?? TOD.day;
    this.todName = name;
    const az = THREE.MathUtils.degToRad(p.sunAzimuth), el = THREE.MathUtils.degToRad(p.sunElevation);
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az));
    const focus = new THREE.Vector3(-4, 0, -4);
    this.sun.position.copy(focus).addScaledVector(dir, 70);
    this.sun.target.position.copy(focus);
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.sun.shadow.radius = p.shadowRadius;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.skyMat.uniforms.top.value.set(p.skyTop);
    this.skyMat.uniforms.horizon.value.set(p.skyHorizon);
    this.skyMat.uniforms.bottom.value.set(p.skyBottom);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(p.fogColor); fog.near = p.fogNear; fog.far = p.fogFar;
    this.renderer.toneMappingExposure = p.exposure;

    // 하늘 그라디언트로 환경광(반사·은은한 하늘빛)을 굽는다
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMat));
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = p.envIntensity;

    const e = this.effects;
    if (e) {
      e.bloom.intensity = p.bloomIntensity;
      e.bloom.luminanceMaterial.threshold = p.bloomThreshold;
      e.hue.saturation = p.saturation;
      e.bc.contrast = p.contrast;
      e.bc.brightness = p.brightness;
      e.vig.darkness = p.vignette;
      e.ao.configuration.intensity = p.aoIntensity;
      e.ao.configuration.color = new THREE.Color(p.aoColor);
    }
    for (const fn of this.todHooks) fn(name, p);
  }

  applyFx() {
    const e = this.effects, f = this.fx;
    // 마지막 패스를 끄면 화면이 비므로 패스는 두고 효과 불투명도만 0 으로
    e.ao.enabled = f.ao;
    e.bloom.blendMode.opacity.value = f.bloom ? 1 : 0;
    e.smaa.blendMode.opacity.value = f.smaa ? 1 : 0;
    e.tilt.blendMode.opacity.value = f.tilt ? 1 : 0;
    for (const g of [e.hue, e.bc, e.vig]) g.blendMode.opacity.value = f.grade ? 1 : 0;
    this.sun.castShadow = f.shadows;
    curveUniforms.uCurveK.value = f.curve ? (this.opts.curveK ?? 0.0045) : 0;
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
      onUpdate: (fn) => { this.updates.push(fn); },
      onTod: (fn) => { this.todHooks.push(fn); },
      scatter: (o) => this.scatter(o),
      tod: this.todName,
    };
  }

  async loadModules() {
    const all = import.meta.glob<{ default: ModuleBuild; order?: number }>('../modules/*.ts') as Record<string, Loader>;
    const entries = Object.entries(all)
      .map(([path, load]) => ({ name: path.replace(/^.*\/(.*)\.ts$/, '$1'), load }))
      .filter((m) => !m.name.startsWith('_'))
      .filter((m) => !this.opts.solo || this.opts.solo.includes(m.name));
    const loaded: Array<{ name: string; mod: { default: ModuleBuild; order?: number } }> = [];
    for (const m of entries) {
      try { loaded.push({ name: m.name, mod: await m.load() }); }
      catch (err) { this.fail(m.name, err); }
    }
    loaded.sort((a, b) => (a.mod.order ?? 10) - (b.mod.order ?? 10));
    // 플레이어 주변은 기본으로 비워 둔다
    this.occupied.push({ x: Island.HERO.player.x, z: Island.HERO.player.z, r: Island.HERO.clearRadius });
    for (const { name, mod } of loaded) {
      try {
        const obj = await mod.default(this.ctx());
        if (obj) { obj.name = obj.name || name; this.scene.add(obj); }
      } catch (err) { this.fail(name, err); }
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

  buildGui() {
    const gui = new GUI({ title: '룩 테스트' });
    const state = { tod: this.todName, cam: this.opts.cam, curveK: curveUniforms.uCurveK.value, ...this.fx };
    gui.add(state, 'tod', Object.keys(TOD)).name('시간대').onChange((v: string) => this.applyTod(v));
    gui.add(state, 'cam', Object.keys(CAMS)).name('카메라').onChange((v: string) => this.setCam(v));
    const f = gui.addFolder('효과 켜고 끄기');
    const labels: Record<string, string> = {
      ao: '구석 그늘(AO)', bloom: '빛 번짐(블룸)', tilt: '틸트시프트', smaa: '안티에일리어싱', grade: '색보정·비네트', shadows: '그림자', curve: '휘는 땅',
    };
    for (const k of Object.keys(labels)) {
      f.add(state, k as keyof typeof state).name(labels[k]).onChange((v: boolean) => { this.fx[k] = v; this.applyFx(); });
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

  start(onFrame?: (n: number) => void) {
    let n = 0;
    const loop = () => {
      this.timer.update();
      const dt = Math.min(this.timer.getDelta(), 0.05);
      const t = this.opts.freezeT ?? this.timer.getElapsed();
      if (this.controls) {
        this.controls.update();
        curveUniforms.uCurveOrigin.value.set(this.controls.target.x, 0, this.controls.target.z);
      }
      for (const fn of this.updates) fn(t, this.opts.freezeT !== null ? 0 : dt);
      this.composer.render(dt);
      onFrame?.(++n);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
