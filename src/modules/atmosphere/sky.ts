// 하늘 연출 — (1) 순수 고르기·섞기(테스트 대상: tests/atmosphere-weather.test.ts) (2) 하늘 물건들.
//   순수: THEMES(섬 분위기 표) · blendToward(5초 섞기) · layerAmounts(날씨별 켜질 층과 세기) · SEASON_TINT(계절 색)
//         · moonLook(달 위상 → 크기·밝기) · wishYield(일요일 ×2) · nightVisionBoost(밤눈 특전)
//   물건: 보름달(위상 그림자) · 별똥별 줄(유성우) · 폭풍 구름 지붕 · 파스텔 번개 · 별똥별섬 소원 반짝이(E → 별가루)
// DOM 없이 불러도 된다(three 객체는 build* 를 부를 때만 만든다).
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import { CURVE_GLSL_HEAD, curveUniforms } from '../../core/curve';
import { HOUR_SEC, WEATHERS, type Season, type Weather } from '../../core/api';

// ───────────────────────── 순수: 섬 분위기 표 ─────────────────────────

export interface ThemeDef {
  /** 안개·지평선 색(낮) */
  fog: string;
  /** 안개 색을 섞는 세기(기본 1 — 말랑섬은 기본 하늘 그대로라 0) */
  fogK?: number;
  /** 섬 파티클: 낮·밤 세기 */
  kinds: Array<{ k: string; day: number; night: number }>;
  birds?: boolean;
  /** 밤하늘(별똥별섬: 맑은 남색 + 별 ×2) */
  night?: { skyTop: string; skyHorizon: string; stars: number; milky: number };
}

/** 섬 분위기: 플레이어가 있는 섬에 따라 5초에 걸쳐 섞인다(GDD 3.13 P0-4) */
export const THEMES: Record<string, ThemeDef> = {
  // 말랑섬: 기본(맑은 하늘빛) — 다른 섬에서 돌아오면 이쪽으로 섞여 돌아온다
  home: { fog: '#cbe9fb', fogK: 0, kinds: [] },
  ice: { fog: '#e6f3ff', kinds: [{ k: 'snow', day: 1, night: 0.8 }] },
  mushroom: { fog: '#e6caf2', kinds: [{ k: 'spores', day: 0.6, night: 1 }] },
  desert: { fog: '#f4dbab', kinds: [{ k: 'sand', day: 1, night: 0 }] },
  dino: { fog: '#dfcbb8', kinds: [{ k: 'ash', day: 0.8, night: 0.6 }, { k: 'embers', day: 0.5, night: 1 }], birds: true },
  coral: { fog: '#bff4ee', kinds: [{ k: 'sparkle', day: 1, night: 0.7 }] },
  // 별똥별섬: 낮은 맑고 높은 하늘, 밤은 맑은 남색 + 별 촘촘함 ×2
  launch: { fog: '#d3e2fb', kinds: [], night: { skyTop: '#0a1448', skyHorizon: '#2c3f8e', stars: 2, milky: 0.35 } },
};

// ───────────────────────── 순수: 섞기 ─────────────────────────

/** 날씨·섬 분위기가 바뀔 때 섞이는 시간(초) — GDD "5초에 걸쳐 섞임" */
export const BLEND_SEC = 5;

/** cur → target 으로 1/sec 씩 곧게 다가간다(정확히 sec 초에 도착). dt<=0(촬영 모드·첫 프레임)이면 바로 target */
export function blendToward(cur: number, target: number, dt: number, sec = BLEND_SEC): number {
  if (!(dt > 0) || sec <= 0) return target;
  const step = dt / sec;
  const d = target - cur;
  return Math.abs(d) <= step + 1e-9 ? target : cur + Math.sign(d) * step;
}

export const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** 밤 전용 연출(유성우·오로라)의 문: 하늘이 충분히 어두울 때만 0 → 1 */
export const nightGate = (night: number) => smooth(0.45, 0.85, night);

// ───────────────────────── 순수: 날씨별 층 ─────────────────────────

/** 화면 층 이름(오브젝트 이름은 LAYER_OBJECT) */
export const LAYERS = [
  'rain', 'snow', 'sand', 'glow', 'spores', 'ash', 'embers', 'sparkle',
  'mist', 'dust', 'blizzard', 'whiteout', 'petals', 'frost',
  'meteor', 'wishes', 'aurora', 'storm-deck', 'bolt', 'rainbow',
] as const;
export type LayerName = typeof LAYERS[number];

/** 층 → 장면 오브젝트 이름(디버그·스크린샷 확인용) */
export const LAYER_OBJECT: Record<LayerName, string> = {
  rain: 'weather-rain', snow: 'weather-snow', sand: 'weather-sand', glow: 'weather-glow', spores: 'weather-spores',
  ash: 'weather-ash', embers: 'weather-embers', sparkle: 'weather-sparkle',
  mist: 'weather-mist', dust: 'weather-dust', blizzard: 'weather-blizzard', whiteout: 'weather-whiteout',
  petals: 'weather-petals', frost: 'weather-frost',
  meteor: 'atmo-meteors', wishes: 'atmo-wishes', aurora: 'atmo-aurora', 'storm-deck': 'atmo-storm-deck', bolt: 'atmo-bolt',
  rainbow: 'rainbow',
};

export interface LayerInput {
  /** 날씨별 부드러운 가중치 0..1 */
  mix: Record<Weather, number>;
  /** 밤 정도 0..1(프리셋 별 밝기) */
  night: number;
  /** 섬 분위기 가중치(테마 이름 → 0..1) */
  theme: Record<string, number>;
  season: Season;
  /** 물 밖 정도(잠수 중 0) */
  under: number;
  space: boolean;
}

/** 날씨별로 켜지는 층(가중치 1 일 때) — 섬 분위기 층(snow·sand …)은 따로 */
export const WEATHER_LAYERS: Record<Weather, LayerName[]> = {
  clear: [],
  rain: ['rain', 'storm-deck'],
  storm: ['rain', 'storm-deck', 'bolt'],
  fog: ['mist'],
  meteor: ['meteor', 'wishes'],
  snow: ['snow'],
  blizzard: ['snow', 'blizzard', 'whiteout'],
  rainbow: ['rainbow'],
  aurora: ['aurora'],
  sandstorm: ['sand', 'dust'],
};

/** 비 + 폭풍 세기(폭풍도 비가 온다) */
export const rainOf = (mix: Record<Weather, number>) => Math.min(1, mix.rain + mix.storm);

/**
 * 층마다 세기(0 = 꺼짐). 기존 wave 2 식(눈·모래·비·밤빛)은 그대로, 새 층(안개 덩이·모래 안개·눈보라 줄·꽃잎·서리·유성·오로라·폭풍 지붕)을 더했다.
 * 우주·잠수 중엔 모두 0. 유성우·오로라는 밤에만.
 */
export function layerAmounts(i: LayerInput): Record<LayerName, number> {
  const out = {} as Record<LayerName, number>;
  for (const l of LAYERS) out[l] = 0;
  if (i.space) return out;
  const m = i.mix, u = i.under, th = (k: string) => i.theme[k] ?? 0;
  const set = (l: LayerName, v: number) => { out[l] = Math.max(out[l], Math.max(0, v)); };
  const r = rainOf(m);
  const stormK = m.storm;
  const snowK = m.snow + m.blizzard * 2;
  const sandK = m.sandstorm;
  const ice = th('ice');
  // 섬 파티클(낮·밤 세기 사이)
  for (const [name, def] of Object.entries(THEMES)) {
    const w = th(name);
    if (w <= 0) continue;
    for (const kd of def.kinds) set(kd.k as LayerName, w * (kd.day + (kd.night - kd.day) * i.night) * u);
  }
  // 얼음 섬: 눈 날씨면 펑펑, 눈보라면 더 세게
  if (ice > 0.01 || snowK > 0.01) set('snow', Math.min(1.8, Math.max(ice, snowK * 0.8) * (1 + 0.6 * snowK)) * u);
  // 모래폭풍: 모래 알갱이 몇 배 + 살구빛 모래 안개 덩이
  if (sandK > 0.01) {
    set('sand', Math.min(4, Math.max(th('desert'), sandK) * (1 + 3 * sandK)) * u);
    set('dust', sandK * u);
  }
  // 폭풍 = 빗줄기 ×1.6
  set('rain', r * (1 + 0.6 * stormK) * u);
  // 밤 풀숲 따뜻한 빛 점
  set('glow', Math.max(0, i.night - 0.35) / 0.65 * (1 - r) * u * (1 - 0.6 * ice));
  // 비구름 지붕(비 = 옅게, 폭풍 = 짙은 파스텔 보라) · 번개(폭풍만)
  set('storm-deck', Math.min(1, 0.5 * r + 0.6 * stormK) * u);
  set('bolt', stormK * u);
  // 안개: 땅을 기는 하얀 안개 덩이
  set('mist', m.fog * u);
  // 눈보라: 옆으로 날리는 눈 줄 + 하얀 시야
  set('blizzard', m.blizzard * u);
  set('whiteout', m.blizzard * 0.85 * u);
  // 무지개(낮에만 보인다)
  set('rainbow', m.rainbow * (1 - i.night) * u);
  // 밤 전용: 유성우(별똥별 줄 + 소원 반짝이) · 오로라(솜눈섬 — 오로라 날씨, 맑은 밤에도 옅게)
  const ng = nightGate(i.night);
  set('meteor', m.meteor * ng * u);
  set('wishes', m.meteor * ng * u);
  set('aurora', Math.min(1, m.aurora + 0.22 * m.clear * ice) * ng * u);
  // 계절: 봄 꽃잎(섬 위, 비·눈 아닐 때) · 겨울 서리 반짝(땅 가까이)
  const tint = SEASON_TINT[i.season];
  const land = Math.max(0, ...Object.keys(THEMES).filter((k) => k !== 'ice' && k !== 'desert').map(th));
  if (tint.petals > 0) set('petals', tint.petals * land * (1 - r) * (1 - Math.min(1, snowK)) * (1 - sandK) * (1 - 0.6 * i.night) * u);
  if (tint.frost > 0) set('frost', tint.frost * Math.max(land, ice) * (1 - r) * (1 - sandK) * u);
  return out;
}

/** 켜진 층 이름(세기 > 0.01) — 디버그·테스트 */
export function activeLayers(i: LayerInput): LayerName[] {
  const a = layerAmounts(i);
  return LAYERS.filter((l) => a[l] > 0.01);
}

/** 날씨 하나만 꽉 찬 가중치(테스트·디버그용) */
export function oneHot(w: Weather): Record<Weather, number> {
  const m = {} as Record<Weather, number>;
  for (const x of WEATHERS) m[x] = x === w ? 1 : 0;
  return m;
}

// ───────────────────────── 순수: 계절 · 달 · 소원 · 특전 ─────────────────────────

export interface SeasonTint {
  /** 밝은 곳에 곱하는 색(gradeGain 쪽으로 섞는다) */
  gain: string;
  /** 섞는 양 0..1(은은하게) */
  amount: number;
  /** 채도 더하기 */
  sat: number;
  /** 안개 색 살짝 */
  fog: string;
  fogAmount: number;
  /** 꽃잎·서리 층 세기 */
  petals: number;
  frost: number;
}

/** 계절 색(은은하게): 봄 꽃잎 · 여름 맑음 · 가을 따뜻 · 겨울 서리 */
export const SEASON_TINT: Record<Season, SeasonTint> = {
  spring: { gain: '#fff0f6', amount: 0.35, sat: 0.02, fog: '#f6e4f0', fogAmount: 0.12, petals: 0.8, frost: 0 },
  summer: { gain: '#fffbe6', amount: 0.15, sat: 0.03, fog: '#d2f0ff', fogAmount: 0.05, petals: 0, frost: 0 },
  autumn: { gain: '#ffe3c2', amount: 0.42, sat: 0.02, fog: '#f2dcc0', fogAmount: 0.15, petals: 0, frost: 0 },
  winter: { gain: '#e9f2ff', amount: 0.4, sat: -0.03, fog: '#e4eefc', fogAmount: 0.15, petals: 0, frost: 0.7 },
};

/** 달 모양: phase 0..1(0.5 = 보름) → 원반 반지름(라디안)·밝기·빛 비친 쪽 각도 */
export function moonLook(phase: number): { full: number; radius: number; bright: number; light: number } {
  const p = ((phase % 1) + 1) % 1;
  // 보름 창(0.45~0.55)은 꽉 찬 보름달
  const full = p >= 0.45 && p <= 0.55 ? 1 : 1 - Math.min(1, Math.abs(p - 0.5) / 0.45);
  const s = smooth(0, 1, full);
  return { full: s, radius: 0.034 + 0.014 * s, bright: 0.4 + 0.6 * s, light: p * Math.PI * 2 };
}

/** 소원 하나에 주는 별가루 — 일요일(weekday 6, 유성우 확정 날)은 ×2 */
export const WISH_BASE = 1;
export const wishYield = (weekday: number) => WISH_BASE * (weekday === 6 ? 2 : 1);

/** 밤눈 특전(meta perk 'nightvision'): 밤에만 노출을 살짝 올린다 */
export const nightVisionBoost = (perk: boolean, night: number) => (perk ? 0.14 * Math.min(1, Math.max(0, night)) : 0);

// ───────────────────────── 물건: 보름달 ─────────────────────────

const MOON_DIST = 8000;

/** 위상 그림자가 있는 달(엔진 달 원반 대신 — atmosphere 가 엔진 moon 은 0 으로 둔다) */
export function buildMoon() {
  const uniforms = {
    uAmount: { value: 0 }, uLight: { value: Math.PI }, uBright: { value: 1 },
    uDark: { value: new THREE.Color('#1a2050') }, uHalo: { value: new THREE.Color('#b9c6ff') },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vQ;
      void main() { vQ = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount; uniform float uLight; uniform float uBright; uniform vec3 uDark; uniform vec3 uHalo;
      varying vec2 vQ;
      float h21( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
      void main() {
        // 판 반지름 3 = 달 1 + 무리 2
        vec2 q = vQ;
        float r = length( q );
        float disc = 1.0 - smoothstep( 0.97, 1.0, r );
        // 구 법선 → 위상 빛(보름 = 정면에서 빛)
        vec3 n = vec3( q, sqrt( max( 1.0 - r * r, 0.0 ) ) );
        vec3 L = vec3( sin( uLight ), 0.0, -cos( uLight ) );
        float lit = smoothstep( -0.06, 0.1, dot( n, L ) );
        // 몽글몽글 바다 무늬(둥근 얼룩 몇 개, 파스텔)
        float spots = 0.0;
        spots += 1.0 - smoothstep( 0.18, 0.24, length( q - vec2( -0.3, 0.25 ) ) );
        spots += 1.0 - smoothstep( 0.12, 0.17, length( q - vec2( 0.28, 0.32 ) ) );
        spots += 1.0 - smoothstep( 0.2, 0.27, length( q - vec2( 0.1, -0.3 ) ) );
        spots += ( 1.0 - smoothstep( 0.07, 0.1, length( q - vec2( -0.42, -0.2 ) ) ) ) * 0.8;
        vec3 face = mix( vec3( 1.0, 0.97, 0.86 ), vec3( 0.93, 0.88, 0.86 ), clamp( spots, 0.0, 1.0 ) * 0.8 );
        face *= 0.94 + 0.08 * h21( floor( q * 40.0 ) );
        vec3 c = mix( uDark * 1.25, face * ( 0.68 + 0.12 * uBright ), lit );
        // 무리: 밝을수록(보름) 크고 진하게
        // 빛 비친 넓이(초승달이면 무리도 작게 — 둥근 고리처럼 보이지 않게)
        float frac = 0.5 - 0.5 * cos( uLight );
        float halo = pow( max( 1.0 - ( r - 1.0 ) / 2.0, 0.0 ), 3.0 ) * smoothstep( 0.96, 1.06, r ) * ( 0.25 + 0.55 * uBright ) * ( 0.12 + 0.88 * frac );
        // 그림자 쪽은 반쯤 비친다(하늘빛 + 지구빛) — 짙은 원판이 튀지 않게
        float a = disc * ( lit + ( 1.0 - lit ) * 0.6 ) + halo * ( 1.0 - disc );
        vec3 col = mix( uHalo * 1.2, c, disc );
        if ( a * uAmount < 0.003 ) discard;
        gl_FragColor = vec4( col, a * uAmount );
        #include <colorspace_fragment>
      }`,
  });
  mat.userData.noCurve = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat);
  mesh.name = 'atmo-moon';
  mesh.frustumCulled = false;
  mesh.userData.noCurve = true;
  mesh.renderOrder = -0.6;
  mesh.visible = false;
  /** dir = 달 방향(정규화), amount = 달 보임 0..1 */
  const update = (cam: THREE.Camera, dir: THREE.Vector3, amount: number, phase: number, dark: string) => {
    mesh.visible = amount > 0.01;
    if (!mesh.visible) return;
    const look = moonLook(phase);
    uniforms.uAmount.value = amount;
    uniforms.uLight.value = look.light;
    uniforms.uBright.value = look.bright;
    uniforms.uDark.value.set(dark);
    mesh.position.copy(cam.position).addScaledVector(dir, MOON_DIST);
    mesh.scale.setScalar(MOON_DIST * Math.tan(look.radius));
    mesh.quaternion.copy(cam.quaternion);
  };
  return { mesh, update };
}

// ───────────────────────── 물건: 별똥별 줄(유성우) ─────────────────────────

/** 하늘 높이에서 비스듬히 떨어지는 짧은 빛 줄 — 줄마다 몇 초에 한 번, 위치는 셰이더에서 굴린다(드로우콜 1) */
export function buildMeteors(ctx: Ctx, count = 56) {
  const rnd = ctx.rng('atmo:meteors');
  const corner: number[] = [], seed: number[] = [], idx: number[] = [];
  for (let i = 0; i < count; i++) {
    const s = [rnd(), rnd(), rnd(), rnd()];
    for (const [a, b] of [[0, -1], [0, 1], [1, -1], [1, 1]]) { corner.push(a, b); seed.push(...s); }
    const o = i * 4;
    idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 4 * 3), 3));
  geo.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
  geo.setIndex(idx);
  const uniforms = { uTime: { value: 0 }, uAmount: { value: 0 }, uHorizon: { value: 0 }, uFwd: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 aCorner;
      attribute vec4 aSeed;
      uniform float uTime; uniform float uHorizon; uniform float uFwd;
      varying vec2 vC; varying float vLife; varying float vTint;
      float h11( float x ) { return fract( sin( x * 127.1 ) * 43758.5453 ); }
      void main() {
        float period = 2.2 + aSeed.x * 4.5;
        float tt = uTime + aSeed.y * period;
        float cyc = floor( tt / period );
        float life = fract( tt / period ) / 0.3;   // 주기의 앞 30% 동안만 날아간다
        float k = cyc * 3.17 + aSeed.z * 91.7;
        // 셋 중 둘은 바라보는 쪽 하늘(±65°)에 — 밤하늘을 올려다보지 않아도 별똥별이 보이게
        float az = aSeed.w > 0.33 ? uFwd + ( h11( k ) - 0.5 ) * 2.3 : h11( k ) * 6.2831;
        float el = radians( 9.0 + h11( k + 1.3 ) * 38.0 ) + asin( clamp( uHorizon, -0.5, 0.5 ) );
        vec3 start = vec3( cos( el ) * cos( az ), sin( el ), cos( el ) * sin( az ) );
        vec3 side = normalize( cross( start, vec3( 0.0, 1.0, 0.0 ) ) ) * ( h11( k + 2.1 ) > 0.5 ? 1.0 : -1.0 );
        vec3 dir = normalize( side * ( 0.6 + 0.6 * h11( k + 3.3 ) ) - vec3( 0.0, 0.7, 0.0 ) );
        float len = 0.1 + 0.12 * aSeed.w;
        float L = clamp( life, 0.0, 1.0 );
        vec3 head = normalize( start + dir * len * 1.6 * L );
        vec3 tail = normalize( start + dir * len * 1.6 * max( L - 0.45, 0.0 ) );
        vec3 d = mix( head, tail, aCorner.x );
        vec3 across = normalize( cross( head - tail + dir * 1e-4, head ) );
        float w = 0.0032 * ( 1.0 - aCorner.x * 0.8 ) * ( 0.8 + 0.6 * aSeed.w );
        vec3 wp = cameraPosition + ( d + across * aCorner.y * w ) * 7000.0;
        vC = aCorner; vLife = life; vTint = aSeed.z;
        gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
        if ( life > 1.0 ) gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount;
      varying vec2 vC; varying float vLife; varying float vTint;
      void main() {
        float along = 1.0 - vC.x;
        float a = pow( along, 1.6 ) * ( 1.0 - vC.y * vC.y );
        // 태어날 땐 스르륵, 끝엔 톡 사라지게
        a *= smoothstep( 0.0, 0.12, vLife ) * ( 1.0 - smoothstep( 0.75, 1.0, vLife ) );
        vec3 tailC = mix( vec3( 0.75, 0.82, 1.0 ), vec3( 1.0, 0.78, 0.9 ), step( 0.5, vTint ) );
        vec3 c = mix( tailC, vec3( 1.0, 0.98, 0.9 ), pow( along, 3.0 ) ) * 3.0;
        gl_FragColor = vec4( c * a * uAmount, 1.0 );
        #include <colorspace_fragment>
      }`,
  });
  mat.userData.noCurve = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = LAYER_OBJECT.meteor;
  mesh.frustumCulled = false;
  mesh.userData.noCurve = true;
  mesh.renderOrder = -0.55;
  mesh.visible = false;
  const fwd = new THREE.Vector3();
  const update = (t: number, amount: number, horizon: number, half: boolean) => {
    mesh.visible = amount > 0.01;
    if (!mesh.visible) return;
    // 바라보는 방위(셰이더 각: x = cos, z = sin) — 한 주기 안에선 자리가 고정이라 고개를 돌려도 튀지 않게 천천히 따라간다
    ctx.camera.getWorldDirection(fwd);
    const want = Math.atan2(fwd.z, fwd.x);
    let dA = want - uniforms.uFwd.value;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    uniforms.uFwd.value += dA * 0.02;
    uniforms.uTime.value = t;
    uniforms.uAmount.value = amount;
    uniforms.uHorizon.value = horizon;
    geo.setDrawRange(0, (half ? Math.floor(count / 2) : count) * 6);
  };
  return { mesh, update };
}

// ───────────────────────── 물건: 비구름 지붕 + 번개 ─────────────────────────

/** 카메라 위를 덮는 몽실한 비구름 지붕(하늘 바로 앞, 땅·섬 뒤) — 폭풍엔 파스텔 보라, 번쩍이면 연보라로 */
export function buildStormDeck() {
  const uniforms = {
    uTime: { value: 0 }, uAmount: { value: 0 }, uFlash: { value: 0 }, uHorizon: { value: 0 },
    uLit: { value: new THREE.Color('#c9c4e6') }, uShade: { value: new THREE.Color('#7f7aa8') },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize( position );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_Position.z = gl_Position.w; // 하늘처럼 늘 가장 먼 곳(땅·섬이 앞에 선다)
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uAmount; uniform float uFlash; uniform float uHorizon;
      uniform vec3 uLit; uniform vec3 uShade;
      varying vec3 vDir;
      float h21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
      float vn( vec2 p ) {
        vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( h21( i ), h21( i + vec2( 1, 0 ) ), f.x ), mix( h21( i + vec2( 0, 1 ) ), h21( i + vec2( 1, 1 ) ), f.x ), f.y );
      }
      float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 5; i++ ) { s += a * vn( p ); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize( vDir );
        float y = ( d.y - uHorizon ) / ( 1.0 - uHorizon );
        if ( y < -0.02 ) discard;
        // 하늘 평면에 투영(머리 위는 크게, 지평선 쪽은 촘촘)
        vec2 p = d.xz / ( max( y, 0.0 ) + 0.18 ) * 1.6 + vec2( uTime * 0.035, uTime * 0.012 );
        float n = fbm( p );
        float n2 = fbm( p * 2.2 - 3.0 );
        // 몽글몽글 덩이: 밝은 위 테두리 + 그늘진 아랫배
        float puff = smoothstep( 0.32, 0.68, n );
        vec3 c = mix( uShade, uLit, smoothstep( 0.35, 0.8, n2 ) * 0.7 + puff * 0.3 );
        c += vec3( 0.86, 0.82, 1.0 ) * uFlash * ( 0.5 + 0.8 * n2 );
        float a = ( 0.62 + 0.38 * puff ) * smoothstep( -0.02, 0.22, y ) * uAmount;
        gl_FragColor = vec4( c, a );
        #include <colorspace_fragment>
      }`,
  });
  mat.userData.noCurve = true;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(430, 48, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
  mesh.name = LAYER_OBJECT['storm-deck'];
  mesh.frustumCulled = false;
  mesh.userData.noCurve = true;
  mesh.renderOrder = -0.9;
  mesh.visible = false;
  const update = (t: number, cam: THREE.Vector3, amount: number, flash: number, horizon: number, lit: string, shade: string) => {
    mesh.visible = amount > 0.01;
    if (!mesh.visible) return;
    mesh.position.copy(cam);
    uniforms.uTime.value = t;
    uniforms.uAmount.value = amount;
    uniforms.uFlash.value = flash;
    uniforms.uHorizon.value = horizon;
    uniforms.uLit.value.set(lit);
    uniforms.uShade.value.set(shade);
  };
  return { mesh, update };
}

/** 파스텔 번개 한 줄기(먼 하늘에서 바다로) — 번쩍일 때만, 번쩍마다 다른 모양(결정적) */
export function buildBolt(ctx: Ctx) {
  const SEG = 14;
  const geo = new THREE.BufferGeometry();
  // 줄기 SEG 마디 + 가지 6 마디, 마디마다 두 점(리본)
  const N = (SEG + 1 + 7) * 2;
  const pos = new Float32Array(N * 3), side = new Float32Array(N), fade = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
  const idx: number[] = [];
  const strip = (from: number, n: number) => { for (let i = 0; i < n - 1; i++) { const a = (from + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } };
  strip(0, SEG + 1);
  strip(SEG + 1, 7);
  geo.setIndex(idx);
  const uniforms = { uAmount: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aSide; attribute float aFade;
      varying float vS; varying float vF;
      void main() { vS = aSide; vF = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount;
      varying float vS; varying float vF;
      void main() {
        float core = 1.0 - smoothstep( 0.0, 1.0, abs( vS ) );
        vec3 c = mix( vec3( 0.78, 0.7, 1.0 ), vec3( 1.0, 0.96, 1.0 ), core * core );
        gl_FragColor = vec4( c * ( 0.35 + core ) * vF * uAmount * 1.8, 1.0 );
        #include <colorspace_fragment>
      }`,
  });
  mat.userData.noCurve = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = LAYER_OBJECT.bolt;
  mesh.frustumCulled = false;
  mesh.userData.noCurve = true;
  mesh.visible = false;
  let built = -1;
  const p = new THREE.Vector3(), q0 = new THREE.Vector3(), dir = new THREE.Vector3(), across = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const look = new THREE.Vector3();
  const shape = (slot: number, cam: THREE.Vector3) => {
    const rnd = ctx.rng(`atmosphere:bolt:${slot}`);
    // 바라보는 쪽 하늘(±60°)에 친다 — 등 뒤에서 번쩍이면 하늘만 밝아지고 줄기는 못 본다
    ctx.camera.getWorldDirection(look);
    const az = Math.atan2(look.z, look.x) + (rnd() - 0.5) * 2.1, D = 900 + rnd() * 700;
    dir.set(Math.cos(az), 0, Math.sin(az));
    across.crossVectors(dir, up).normalize();
    const base = new THREE.Vector3(cam.x + dir.x * D, 0, cam.z + dir.z * D);
    const top = 260 + rnd() * 120, W = 3.2;
    const pts: THREE.Vector3[] = [];
    let off = 0;
    for (let i = 0; i <= SEG; i++) {
      const k = i / SEG;
      off += (rnd() - 0.5) * 38;
      pts.push(new THREE.Vector3(base.x + across.x * off, top * (1 - k), base.z + across.z * off));
    }
    const write = (o: number, q: THREE.Vector3, w: number, f: number) => {
      for (let s = 0; s < 2; s++) {
        const j = (o * 2 + s);
        p.copy(q).addScaledVector(across, (s ? 1 : -1) * w);
        pos[j * 3] = p.x; pos[j * 3 + 1] = p.y; pos[j * 3 + 2] = p.z;
        side[j] = s ? 1 : -1; fade[j] = f;
      }
    };
    pts.forEach((q, i) => write(i, q, W * (1 - (i / SEG) * 0.4), 1));
    // 가지: 줄기 1/3 쯤에서 옆으로
    const b0 = pts[Math.floor(SEG * (0.25 + rnd() * 0.2))];
    let bo = 0;
    const dirB = rnd() < 0.5 ? -1 : 1;
    for (let i = 0; i < 7; i++) {
      bo += 9 + rnd() * 10;
      q0.set(b0.x + across.x * bo * dirB, b0.y - i * (14 + rnd() * 8), b0.z + across.z * bo * dirB);
      write(SEG + 1 + i, q0, W * 0.6 * (1 - i / 7), 1 - i / 7);
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.aSide as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.aFade as THREE.BufferAttribute).needsUpdate = true;
    geo.computeBoundingSphere();
  };
  const update = (slot: number, flash: number, cam: THREE.Vector3) => {
    mesh.visible = flash > 0.01;
    if (!mesh.visible) return;
    if (slot !== built) { built = slot; shape(slot, cam); }
    uniforms.uAmount.value = flash;
  };
  return { mesh, update };
}

// ───────────────────────── 물건: 별똥별섬 소원 반짝이 ─────────────────────────

/** 소원 반짝이 한 게임시간에 떨어지는 수 · 플레이어가 이 거리 안이면 보인다 · E 거리 */
export const WISH_PER_HOUR = 6;
const WISH_SHOW = 900, WISH_REACH = 2.4;

export interface WishSpot { key: string; x: number; z: number; y: number; at: number }

/** 그 게임시간(hourAbs)에 떨어지는 소원 반짝이 자리(결정적) — 크레이터 둘레 마른 땅 */
export function wishSpots(ctx: Pick<Ctx, 'rng' | 'island'>, hourAbs: number): WishSpot[] {
  const c = ctx.island.PLACES.crater;
  const out: WishSpot[] = [];
  for (let i = 0; i < WISH_PER_HOUR; i++) {
    const rnd = ctx.rng(`atmosphere:wish:${hourAbs}:${i}`);
    for (let k = 0; k < 14; k++) {
      const a = rnd() * Math.PI * 2, r = c.r * (1.25 + rnd() * 2.2);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      const h = ctx.island.heightAt(x, z);
      const wl = ctx.island.waterLevelAt(x, z);
      if (h < 0.6 || (Number.isFinite(wl) && wl > h - 0.15)) continue;
      // 떨어지는 때: 그 시간 처음 60% 안에 흩어서
      out.push({ key: `${hourAbs}:${i}`, x, z, y: h, at: hourAbs * HOUR_SEC + (i / WISH_PER_HOUR) * HOUR_SEC * 0.6 + rnd() * 6 });
      break;
    }
  }
  return out;
}

/** 다섯 갈래 통통한 별(둘레 둥글게) */
function puffyStar(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = 5, R = 0.5, r = 0.27;
  for (let i = 0; i <= n * 2; i++) {
    const a = Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? R : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.09, bevelSegments: 4, curveSegments: 4 });
  g.center();
  g.userData.shared = true;
  return g;
}

/**
 * 유성우 밤, 별똥별섬 크레이터 둘레에 별똥별이 톡톡 떨어져 반짝인다. 가까이 가서 E → 소원 + 별가루(econ.give) + harvest{kind:'meteor'}.
 * 주운 것은 flags.env.wish.keys(열쇠에 게임시간이 들어 있어 시간으로 정리)에 적어 다시 줍지 못하게.
 */
export function buildWishes(ctx: Ctx) {
  const group = new THREE.Group();
  group.name = LAYER_OBJECT.wishes;
  group.visible = false;
  const MAX = WISH_PER_HOUR * 2;
  const starGeo = puffyStar();
  const starMat = new THREE.MeshBasicMaterial({ color: '#fff1a6', toneMapped: false });
  const stars = new THREE.InstancedMesh(starGeo, starMat, MAX);
  stars.name = 'atmo-wish-stars';
  stars.frustumCulled = false;
  stars.count = 0;
  group.add(stars);
  // 빛 무리(더하기 점) — 위치는 매 프레임 채운다
  const hp = new Float32Array(MAX * 3), hs = new Float32Array(MAX);
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  hg.setAttribute('aPulse', new THREE.BufferAttribute(hs, 1));
  const hu = { uPx: { value: 900 }, uTime: { value: 0 }, uCurveK: curveUniforms.uCurveK, uCurveOrigin: curveUniforms.uCurveOrigin };
  const hm = new THREE.ShaderMaterial({
    uniforms: hu, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${CURVE_GLSL_HEAD}
      attribute float aPulse;
      uniform float uPx; uniform float uTime;
      varying float vA;
      void main() {
        vec4 mv = viewMatrix * dlCurve( modelMatrix * vec4( position, 1.0 ) );
        gl_Position = projectionMatrix * mv;
        vA = aPulse * ( 0.75 + 0.25 * sin( uTime * 3.0 + position.x ) );
        gl_PointSize = clamp( 2.6 * uPx / max( -mv.z, 1.0 ), 2.0, 160.0 );
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r = length( q );
        float a = pow( max( 1.0 - r, 0.0 ), 2.4 );
        float arms = ( 1.0 - smoothstep( 0.0, 0.06, abs( q.x ) ) ) * ( 1.0 - abs( q.y ) ) + ( 1.0 - smoothstep( 0.0, 0.06, abs( q.y ) ) ) * ( 1.0 - abs( q.x ) );
        vec3 c = vec3( 1.0, 0.9, 0.6 ) * a + vec3( 1.0, 0.97, 0.85 ) * arms * 0.6;
        if ( vA < 0.003 ) discard;
        gl_FragColor = vec4( c * vA, 1.0 );
      }`,
  });
  hm.userData.noCurve = true;
  const halo = new THREE.Points(hg, hm);
  halo.name = 'atmo-wish-halo';
  halo.frustumCulled = false;
  halo.userData.noCurve = true;
  group.add(halo);

  const game = ctx.game;
  // 주운 반짝이 열쇠("hourAbs:i") — 날짜가 아니라 시간으로 정리한다.
  // (지난 시간 것도 한 시간 더 남으니, 자정을 넘겨도 23시에 주운 것은 계속 주운 것)
  const picked = new Set<string>();
  const hourOfKey = (k: string) => { const h = parseInt(k, 10); return Number.isFinite(h) ? h : -Infinity; };
  type WishFlag = { day?: number; keys?: string[] };
  let loaded = false;
  let curDay = 0;
  const loadPicked = () => {
    if (loaded || !game) return;
    loaded = true;
    const f = game.state.flags.env as { wish?: WishFlag } | undefined;
    const keys = f?.wish?.keys;
    if (Array.isArray(keys)) for (const k of keys) if (typeof k === 'string') picked.add(k);
  };
  /** 지금 시간 - 1 보다 오래된 열쇠는 버린다(그 반짝이는 이미 사라졌다) */
  const prunePicked = (hourAbs: number) => {
    for (const k of picked) if (hourOfKey(k) < hourAbs - 1) picked.delete(k);
  };
  const savePicked = (day: number) => {
    if (!game) return;
    const flags = game.state.flags as Record<string, unknown>;
    const f = (flags.env && typeof flags.env === 'object' ? flags.env : (flags.env = {})) as { sec?: number; wish?: WishFlag };
    f.wish = { day, keys: [...picked] };
    // 시계보다 먼저 저장돼도 flags.env 가 {sec, wish} 온전한 모양이 되게 — 시계 persist 가 있으면 그걸로(sec 쓰기 + 저장)
    const env = game.env as (typeof game.env & { clock?: { sec?: number } }) | null | undefined;
    if (typeof env?.persist === 'function') { env.persist(); return; }
    const sec = env?.clock?.sec ?? env?.gameSec;
    if (typeof f.sec !== 'number' && typeof sec === 'number' && Number.isFinite(sec)) f.sec = sec;
    game.state.save();
  };

  let live: WishSpot[] = [];
  let liveHour = -1;
  let spots: WishSpot[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const c = ctx.island.PLACES.crater;

  /** 지금 떨어져 있는(주울 수 있는) 반짝이 */
  const landed = (sec: number) => live.filter((s) => sec >= s.at + 1.2 && !picked.has(s.key));

  const pick = (s: WishSpot) => {
    if (!game || picked.has(s.key)) return 0;
    const env = game.env;
    const n = wishYield(env?.weekday ?? 0);
    const econ = game.econ;
    // 먼저 주고, 받았을 때만 "주운 것"으로 — 가방이 꽉 차면 반짝이는 그대로 남는다
    const got = econ ? econ.give('m_stardust', n, 'meteor-wish') : (game.state.addItem('m_stardust', n), n);
    if (!(got > 0)) return 0;
    picked.add(s.key);
    savePicked(curDay);
    game.state.emit({ type: 'harvest', kind: 'meteor', item: 'm_stardust', n: got, island: 'launch' });
    game.audio?.sfx('shiny', { x: s.x, z: s.z });
    game.player.act('peace', 1.4);
    if (got > 0) game.hud.toast(env?.weekday === 6 ? `별똥별에 소원을 빌었어요! 별가루 +${got} (일요일 두 배)` : `별똥별에 소원을 빌었어요! 별가루 +${got}`);
    return got;
  };

  if (game) {
    game.addProvider('atmosphere-wish', (pl) => {
      if (!group.visible) return null;
      const sec = game.env?.gameSec ?? 0;
      let best: WishSpot | null = null, bd = WISH_REACH;
      for (const s of landed(sec)) {
        const d = Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) return null;
      const s = best;
      return { id: 'atmosphere:wish', label: '별똥별에 소원 빌기', dist: bd, use: () => { pick(s); } };
    });
  }

  /** active = 별똥별섬이 유성우 밤인가 */
  const update = (t: number, active: boolean, cam: THREE.Vector3, sec: number, day: number, half: boolean) => {
    const near = Math.hypot(cam.x - c.x, cam.z - c.z) < WISH_SHOW;
    group.visible = active && near;
    if (!group.visible) return;
    loadPicked();
    curDay = day;
    const hourAbs = Math.floor(sec / HOUR_SEC);
    if (hourAbs !== liveHour) {
      liveHour = hourAbs;
      prunePicked(hourAbs);
      // 지난 시간 것 중 안 주운 것은 그대로 남는다(한 시간 더)
      spots = [...wishSpots(ctx, hourAbs - 1), ...wishSpots(ctx, hourAbs)];
    }
    live = spots.filter((s) => sec >= s.at);
    let n = 0;
    hu.uTime.value = t;
    hu.uPx.value = (ctx.renderer?.domElement?.height ?? 900) * 0.5 / Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov * 0.5));
    const cap = half ? Math.ceil(MAX / 2) : MAX;
    for (const s of live) {
      if (n >= cap || picked.has(s.key)) continue;
      // 하늘에서 1.2초 동안 톡 떨어져 땅 위 0.7 m 에서 둥실
      const fall = Math.max(0, 1 - (sec - s.at) / 1.2);
      const y = s.y + 0.7 + fall * fall * 45 + Math.sin(t * 2 + s.x) * 0.08;
      v.set(s.x, y, s.z);
      e.set(0, t * 1.4 + s.z, Math.sin(t * 1.7 + s.x) * 0.15);
      q.setFromEuler(e);
      sc.setScalar(0.62 * (1 + 0.08 * Math.sin(t * 5 + s.x)));
      m4.compose(v, q, sc);
      stars.setMatrixAt(n, m4);
      hp[n * 3] = s.x; hp[n * 3 + 1] = y; hp[n * 3 + 2] = s.z;
      hs[n] = fall > 0 ? 1.6 : 1;
      n++;
    }
    stars.count = n;
    stars.instanceMatrix.needsUpdate = true;
    hg.setDrawRange(0, n);
    (hg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (hg.attributes.aPulse as THREE.BufferAttribute).needsUpdate = true;
  };
  return {
    group, update,
    /** 디버그: 지금 주울 수 있는 반짝이 */
    landed: () => landed(game?.env?.gameSec ?? 0).map((s) => ({ key: s.key, x: +s.x.toFixed(1), z: +s.z.toFixed(1), y: +s.y.toFixed(1) })),
    /** 디버그: 가장 가까운(아니면 첫) 반짝이를 줍는다 → 받은 별가루 수 */
    pickAny: () => { const l = landed(game?.env?.gameSec ?? 0); return l.length ? pick(l[0]) : 0; },
  };
}
