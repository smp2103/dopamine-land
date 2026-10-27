// 대기: 하늘(뭉게구름)·시간 흐름(tod=auto)·섬별 날씨/분위기·비와 무지개·물속 안개와 빛줄기·나비/꽃가루/반딧불이.
// 하늘 그라디언트·별·은하수·조명·후처리 값은 core/engine·presets, 안개 셰이더는 atmosphere/fogChunks.
//
// URL(게임 모드):  tod=auto(기본: tod 를 안 주면 auto) · tod=morning|day|sunset|night(시간대 고정) · hour=17.5(시작 시각)
//                  weather=rain|storm|fog|meteor|snow|blizzard|rainbow|aurora|sandstorm|clear(모든 지역 강제)
// 시간: 게임 1시간 = 75초(하루 30분, atmosphere/clock.ts 하나가 정본). 날씨는 게임 4시간마다 지역별로 굴린다(atmosphere/weatherRoll.ts).
// game.env(EnvApi)를 채우고 env·day·tod·weather 이벤트를 쏜다. 저장: flags.env.sec(게임 1시간마다·pagehide).
// 디버그: window.__env = { advance(sec), setHour(h), force(w, region?, hours?), forecast(region, h), state(), env }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { TOD, lerpPreset, lerpHex, type TodPreset } from '../core/presets';
import type { Engine } from '../core/engine';
import { WEATHERS, type Weather, type RegionId } from '../core/api';
import { buildClouds } from './atmosphere/clouds';
import { buildLife } from './atmosphere/life';
import { KINDS, makeLayer, makeBirds, makeRainbow, makeGodRays, weatherCenter, type WeatherLayer } from './atmosphere/weather';
import { createEnv, parseEnvQuery, type EnvService } from './atmosphere/clock';
import { REGIONS } from './atmosphere/weatherRoll';

// 다른 모듈이 자리를 잡은 뒤에 나비·반딧불이 위치를 정한다
export const order = 50;

/**
 * 하루 흐름: [시각, 프리셋] — 사이를 부드럽게 보간. GDD 블록(아침 05~09 · 낮 09~17 · 저녁 17~21 · 밤 21~05)에 맞춰
 * 넘어가는 구간의 한가운데가 블록 경계(5·9·17·21시)라 프리셋 이름 바뀜 = env.tod 바뀜.
 */
const DAY_KEYS: Array<[number, string]> = [
  [0, 'night'], [4.5, 'night'], [5.5, 'morning'], [8.4, 'morning'], [9.6, 'day'],
  [16.4, 'day'], [17.6, 'sunset'], [20.2, 'sunset'], [21.8, 'night'], [24, 'night'],
];

/** wave 3 날씨 연출(유성우·오로라·번개 등)이 끼울 자리 — amount 는 그 날씨의 부드러운 가중치 0..1 */
export interface KindFrame { t: number; dt: number; night: number; under: number; work: TodPreset; at: THREE.Vector3 }
export type KindHook = (amount: number, f: KindFrame) => void;
/** 날씨 연출 훅 모음 — 다른 모듈(유성우·오로라 …)이 registerWeatherKind 로 끼운다 */
const KIND_HOOKS: Partial<Record<Weather, KindHook>> = {};
/** 날씨 w 가 섞여 있는 동안 매 프레임 hook(양 0..1, 프레임) 을 부른다. 해제 함수를 돌려준다 */
export function registerWeatherKind(w: Weather, hook: KindHook): () => void {
  KIND_HOOKS[w] = hook;
  return () => { if (KIND_HOOKS[w] === hook) delete KIND_HOOKS[w]; };
}

/** 날씨 지역: 가까운 큰 섬(반경 ×1.4 안), 아니면 'sea'(기본 표) — 섬 분위기 가중치와 같은 기준이라 값싸다 */
function makeRegionAt(islands: ReadonlyArray<{ id: string; x: number; z: number; r: number }>) {
  const big = islands.filter((d) => REGIONS.includes(d.id));
  return (x: number, z: number): RegionId => {
    let best: RegionId = 'sea', bd = Infinity;
    for (const d of big) {
      const k = Math.hypot(x - d.x, z - d.z) / (d.r * 1.4);
      if (k < 1 && k < bd) { bd = k; best = d.id; }
    }
    return best;
  };
}

/** 섬 분위기: 안개·지평선 색, 파티클 */
const THEMES: Record<string, { fog: string; kinds: Array<{ k: string; day: number; night: number }>; birds?: boolean }> = {
  ice: { fog: '#e6f3ff', kinds: [{ k: 'snow', day: 1, night: 0.8 }] },
  mushroom: { fog: '#e6caf2', kinds: [{ k: 'spores', day: 0.6, night: 1 }] },
  desert: { fog: '#f4dbab', kinds: [{ k: 'sand', day: 1, night: 0 }] },
  dino: { fog: '#dfcbb8', kinds: [{ k: 'ash', day: 0.8, night: 0.6 }, { k: 'embers', day: 0.5, night: 1 }], birds: true },
  coral: { fog: '#bff4ee', kinds: [{ k: 'sparkle', day: 1, night: 0.7 }] },
};

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function blendDay(hour: number, out: TodPreset): string {
  let i = 0;
  while (i < DAY_KEYS.length - 2 && hour >= DAY_KEYS[i + 1][0]) i++;
  const [h0, a] = DAY_KEYS[i], [h1, b] = DAY_KEYS[i + 1];
  const s = smooth(0, 1, (hour - h0) / Math.max(1e-3, h1 - h0));
  lerpPreset(TOD[a], TOD[b], s, out);
  return s < 0.5 ? a : b;
}

function copyPreset(src: TodPreset, out: TodPreset) {
  Object.assign(out, src);
  if (src.worldFog) out.worldFog = { ...src.worldFog };
  return out;
}

export default function build(ctx: Ctx) {
  const g = new THREE.Group();
  g.name = 'atmosphere';
  g.add(buildClouds(ctx));
  g.add(buildLife(ctx));

  const game = ctx.game;
  const q = new URLSearchParams(location.search);
  const todParam = q.get('tod');
  const eq = parseEnvQuery(location.search);

  // ── game.env: 시계·날씨 서비스(화면이 없어도 먼저 만든다 — 읽는 쪽은 lazily)
  let env: EnvService | null = null;
  if (game) {
    const state = game.state;
    const regionAt = makeRegionAt(ctx.island.ISLANDS);
    env = createEnv({
      emit: (e) => state.emit(e),
      flags: () => state.flags,
      save: () => state.save(),
      regionAt,
      playerPos: () => game.player.pos,
      world: () => game.world,
      startHour: eq.startHour,
      pinTod: eq.pinTod,
      weather: eq.weather,
    });
    game.env = env;
    // 시계는 엔진 t 가 아니라 게임 dt 로(촬영 모드는 dt=0 → live=1 일 때만 흐른다)
    const e = env;
    game.onUpdate((_t, dt) => e.tick(dt));
    const leave = () => { e.persist(); state.saveNow(); };
    addEventListener('pagehide', leave);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
    (window as unknown as { __env?: unknown }).__env = {
      env: e,
      advance: (sec: number) => { e.advance(sec); return e.snapshot(); },
      setHour: (h: number) => { e.setHour(h); return e.snapshot(); },
      /** force('storm') = 모든 지역, force('rain','home',2) = 말랑섬 2시간, force(null) = 해제 */
      force: (w: Weather | null, region: RegionId | '*' = '*', hours?: number) => { e.forceWeather(region, w, hours); return e.snapshot(); },
      forecast: (region: RegionId, h: number) => e.forecast(region, h),
      pin: (tod: Parameters<EnvService['pin']>[0]) => { e.pin(tod); return e.snapshot(); },
      state: () => e.snapshot(),
    };
  }

  const engine = (game?.engine ?? (window as unknown as { __engine?: Engine }).__engine) as Engine | undefined;
  if (!engine) return g;
  let auto = todParam === 'auto' || (!!game && todParam === null);
  // 룩 테스트(마을 고정 장면)는 정적 프리셋 그대로 — 시간 흐름만 auto 일 때
  if (!game && !auto) return g;
  // 룩 테스트 + auto: 게임이 없으니 혼자 쓰는 시계(저장·이벤트 없음)를 엔진 dt 로 돌린다
  const clockEnv: EnvService = env ?? createEnv({ startHour: eq.startHour, weather: eq.weather });
  if (!env) ctx.onUpdate((_t, dt) => clockEnv.tick(dt));

  // 날씨 층
  const layers: Record<string, WeatherLayer> = {};
  for (const k of Object.values(KINDS)) {
    const l = makeLayer(ctx, k);
    layers[k.key] = l;
    g.add(l.pts);
  }
  const birds = makeBirds(ctx);
  birds.mesh.visible = false;
  g.add(birds.mesh);
  const bow = makeRainbow();
  g.add(bow.holder);
  const rays = makeGodRays(ctx);
  g.add(rays.group);

  let lastFull = '';
  const base = { ...TOD.day } as TodPreset;
  const work = { ...TOD.day } as TodPreset;
  // mix: 날씨별 부드러운 가중치(바뀔 때 몇 초에 걸쳐 섞인다) · kinds: wave 3 날씨 연출 훅
  const mix = {} as Record<Weather, number>;
  for (const w of WEATHERS) mix[w] = 0;
  const st = { rain: 0, bow: 0, dive: 0, theme: {} as Record<string, number>, mix, kinds: KIND_HOOKS };
  // 번개: 폭풍 동안 몇 초에 한 번 부드럽게 번쩍(결정적)
  let flashSlot = -1, flashAt = 0;
  const fwd = new THREE.Vector3(), flock = new THREE.Vector3();
  let lastSig = '';
  let lastEnv = -1e9;
  let fixedName = TOD[todParam ?? ''] && todParam !== 'auto' ? todParam! : 'day';
  let started = false;
  // 다른 곳(GUI·main)이 applyTod 로 프리셋을 덮으면: 다음 프레임에 다시 적용하고, 시작 뒤라면 그 시간대로 고정(auto 고르면 다시 흐름).
  // 단, 세계 전환(우주 ↔ 지구) 때 space 모듈이 부르는 applyTod 는 무시 — 다음 프레임에 판단한다(onWorld 순서와 상관없게)
  let pendingTod: string | null = null, worldAt = -1e9, lastWorld = game?.world ?? 'earth';
  game?.onWorld(() => { worldAt = performance.now(); });
  ctx.onTod((n, p) => {
    if (p === work) return;
    lastFull = '';
    if (started) pendingTod = n;
  });

  ctx.onUpdate((t, dt) => {
    // 첫 프레임은 날씨를 바로(불러오자마자 비가 서서히 '시작'되지 않게)
    const first = !started;
    started = true;
    const now = performance.now();
    const p = game?.player;
    const space = game?.world === 'space';
    if ((game?.world ?? 'earth') !== lastWorld) { lastWorld = game?.world ?? 'earth'; worldAt = now; }
    if (pendingTod !== null) {
      const n = pendingTod;
      pendingTod = null;
      if (now - worldAt > 1000 && n !== 'space') {
        if (n === 'auto') auto = true;
        else if (TOD[n]) { auto = false; fixedName = n; }
      }
    }
    // 1) 기본 프리셋: 우주 / 시간 흐름(env.hour, 1/60 게임시간으로 잘라 같은 분이면 같은 값) / 고정
    let name: string;
    if (space) { copyPreset(TOD.space, base); name = 'space'; }
    else if (auto) { name = blendDay(Math.round(clockEnv.hour * 60) / 60, base); }
    else { copyPreset(TOD[fixedName], base); name = fixedName; }
    copyPreset(base, work);
    const night = Math.min(1, base.stars);

    weatherCenter.y = p ? p.pos.y : NaN;
    // 2) 섬 분위기 가중치(플레이어 위치 기준)
    const k = dt > 0 ? Math.min(1, dt * 0.8) : 1;
    const at = p?.pos ?? ctx.camera.position;
    const tw: Record<string, number> = {};
    if (!space) {
      for (const d of ctx.island.ISLANDS) {
        if (!THEMES[d.theme]) continue;
        const dist = Math.hypot(at.x - d.x, at.z - d.z);
        tw[d.theme] = Math.max(tw[d.theme] ?? 0, 1 - smooth(d.r * 0.8, d.r * 1.3, dist));
      }
    }
    for (const th of Object.keys(THEMES)) st.theme[th] = (st.theme[th] ?? 0) + ((tw[th] ?? 0) - (st.theme[th] ?? 0)) * k;

    // 3) 날씨: 플레이어 자리의 env.weather(지역 변환은 weatherRoll 이 이미 했다) → 날씨별 가중치를 부드럽게
    const cur: Weather = space ? 'clear' : clockEnv.weather;
    const km = dt > 0 && !first ? Math.min(1, dt * 0.5) : 1;
    // 잘게 흔들리는 값이 프리셋 비교를 매 프레임 깨지 않게 잘라 둔다(가중치 1/1000, 쓰는 값 1/100)
    for (const w of WEATHERS) mix[w] = Math.round((mix[w] + ((w === cur ? 1 : 0) - mix[w]) * km) * 1000) / 1000;
    const qz = (x: number) => Math.round(x * 100) / 100;
    const stormK = qz(mix.storm);
    const rainT = Math.min(1, mix.rain + mix.storm);
    st.rain = qz(rainT);
    st.bow = qz(mix.rainbow);
    const snowK = qz(mix.snow + mix.blizzard * 2);
    const blizK = qz(mix.blizzard);
    const sandK = qz(mix.sandstorm);
    const fogK = qz(mix.fog);
    const diveT = p && p.mode === 'dive' ? 1 : 0;
    st.dive += (diveT - st.dive) * (dt > 0 ? Math.min(1, dt * 3) : 1);

    // 4) 분위기 적용
    const dayK = 1 - night * 0.7;
    for (const [th, def] of Object.entries(THEMES)) {
      const w = st.theme[th] ?? 0;
      if (w < 0.01) continue;
      work.fogColor = lerpHex(work.fogColor, def.fog, 0.5 * w * dayK);
      work.skyHorizon = lerpHex(work.skyHorizon, def.fog, 0.3 * w * dayK);
    }
    const r = st.rain;
    if (r > 0.001) {
      // 폭풍은 더 어둡게 — 무섭지 않게 파스텔 보라 쪽으로
      const grey = lerpHex(night > 0.5 ? '#2c3a5a' : '#9fb0c2', night > 0.5 ? '#2e2a52' : '#8f8fb6', stormK);
      work.skyTop = lerpHex(work.skyTop, lerpHex(night > 0.5 ? '#1a2440' : '#8195ab', night > 0.5 ? '#1e1a3c' : '#6f6f9c', stormK), 0.65 * r);
      work.skyHorizon = lerpHex(work.skyHorizon, grey, 0.5 * r);
      work.fogColor = lerpHex(work.fogColor, grey, 0.55 * r);
      work.cloudLit = lerpHex(work.cloudLit, night > 0.5 ? '#4a5878' : '#e1e7ee', r);
      work.cloudShade = lerpHex(work.cloudShade, night > 0.5 ? '#222c48' : '#8a9bb0', r);
      work.sunIntensity *= 1 - 0.5 * r;
      work.rimIntensity *= 1 - 0.5 * r;
      work.saturation -= 0.06 * r;
      work.sunDisc = (work.sunDisc ?? 0) * (1 - r);
      work.sunGlow *= 1 - r;
      work.pollen *= 1 - r;
      work.butterflies *= 1 - r;
      work.exposure -= 0.04 * r;
      if (work.worldFog) { work.worldFog.far *= 1 - 0.45 * r; work.worldFog.near *= 1 - 0.8 * r; }
    }
    if (stormK > 0.001) {
      work.sunIntensity *= 1 - 0.25 * stormK;
      work.exposure -= 0.05 * stormK;
      work.saturation -= 0.03 * stormK;
      if (work.worldFog) work.worldFog.far *= 1 - 0.2 * stormK;
      // 번개: 6~10초마다 한 번, 0.35초 동안 하늘이 연보라로 번쩍
      const slot = Math.floor(t / 8);
      if (slot !== flashSlot) { flashSlot = slot; flashAt = slot * 8 + ctx.rng(`atmosphere:flash:${slot}`)() * 6; }
      const ft = t - flashAt;
      const flash = ft > 0 && ft < 0.35 ? qz(Math.sin((ft / 0.35) * Math.PI) * stormK) : 0;
      if (flash > 0) {
        work.exposure += 0.35 * flash;
        work.skyTop = lerpHex(work.skyTop, '#d9d2ff', 0.5 * flash);
        work.skyHorizon = lerpHex(work.skyHorizon, '#e8e2ff', 0.4 * flash);
      }
    }
    // 안개: 가까운 안개 + 부드러운 빛
    if (fogK > 0.001) {
      const mist = night > 0.5 ? '#46506e' : '#e4e8ee';
      work.fogColor = lerpHex(work.fogColor, mist, 0.75 * fogK);
      work.skyHorizon = lerpHex(work.skyHorizon, mist, 0.55 * fogK);
      work.sunIntensity *= 1 - 0.3 * fogK;
      work.saturation -= 0.04 * fogK;
      work.butterflies *= 1 - 0.5 * fogK;
      work.fogNear *= 1 - 0.9 * fogK;
      work.fogFar *= 1 - 0.7 * fogK;
      if (work.worldFog) { work.worldFog.far *= 1 - 0.88 * fogK; work.worldFog.near *= 1 - 0.95 * fogK; }
    }
    // 눈보라·모래폭풍: 시야를 하얗게 / 살구빛으로 좁힌다
    if (blizK > 0.001) {
      work.fogColor = lerpHex(work.fogColor, night > 0.5 ? '#7d8cab' : '#f2f7ff', 0.6 * blizK);
      work.skyHorizon = lerpHex(work.skyHorizon, '#eef4ff', 0.5 * blizK);
      work.sunIntensity *= 1 - 0.35 * blizK;
      if (work.worldFog) { work.worldFog.far *= 1 - 0.55 * blizK; work.worldFog.near *= 1 - 0.8 * blizK; }
    }
    if (sandK > 0.001) {
      const dust = night > 0.5 ? '#6e5a48' : '#e6c690';
      work.fogColor = lerpHex(work.fogColor, dust, 0.65 * sandK);
      work.skyHorizon = lerpHex(work.skyHorizon, dust, 0.55 * sandK);
      work.skyTop = lerpHex(work.skyTop, '#d8c3a0', 0.3 * sandK);
      work.sunIntensity *= 1 - 0.3 * sandK;
      work.butterflies *= 1 - sandK;
      work.pollen *= 1 - sandK;
      if (work.worldFog) { work.worldFog.far *= 1 - 0.55 * sandK; work.worldFog.near *= 1 - 0.85 * sandK; }
    }
    if (st.bow > 0.01) {
      // 비 갠 뒤: 공기가 맑고 촉촉하게
      work.saturation += 0.04 * st.bow;
      work.exposure += 0.02 * st.bow;
    }
    const d = st.dive;
    if (d > 0.001) {
      work.fogColor = lerpHex(work.fogColor, night > 0.5 ? '#0c3358' : '#1d82b2', d);
      work.skyTop = lerpHex(work.skyTop, '#0e5a8c', d);
      work.skyHorizon = lerpHex(work.skyHorizon, '#2a9ccb', d);
      work.skyBottom = lerpHex(work.skyBottom, '#17699c', d);
      work.hemiSky = lerpHex(work.hemiSky, '#8fe0ff', d);
      work.hemiGround = lerpHex(work.hemiGround, '#1d5f86', d);
      work.gradeGain = lerpHex(work.gradeGain, '#d6f4ff', d);
      work.gradeLift = lerpHex(work.gradeLift, '#062a48', d);
      work.sunColor = lerpHex(work.sunColor, '#bff0ff', d);
      work.cloudOpacity *= 1 - d;
      work.sunDisc = (work.sunDisc ?? 0) * (1 - d);
      work.stars *= 1 - d;
      work.milky = (work.milky ?? 0) * (1 - d);
      work.moon = (work.moon ?? 0) * (1 - d);
      work.butterflies *= 1 - d;
      work.pollen *= 1 - d;
      work.fireflies *= 1 - d;
      work.vignette += 0.15 * d;
      if (d > 0.5) work.worldFog = { near: 1, far: 58 };
      work.fogNear = 1; work.fogFar = 58;
    }

    // 5) 엔진에 적용(환경광 굽기는 하늘색이 바뀌었을 때만 — 시간 흐름 중엔 2.5초에 한 번)
    const sig = work.skyTop + work.skyHorizon + work.skyBottom + work.sunColor + Math.round(work.sunElevation) + Math.round(work.sunAzimuth / 4);
    const wantEnv = sig !== lastSig && now - lastEnv > (auto ? 2500 : 300);
    if (wantEnv) { lastSig = sig; lastEnv = now; }
    // 값이 그대로면 건너뛴다(고정 시간대·맑은 날엔 첫 프레임만)
    const full = name + JSON.stringify(work);
    if (full !== lastFull || wantEnv) { lastFull = full; engine.applyPreset(name, work, wantEnv); }

    // 6) 파티클·새·무지개·빛줄기
    const under = 1 - d;
    for (const [th, def] of Object.entries(THEMES)) {
      const w = st.theme[th] ?? 0;
      for (const kd of def.kinds) layers[kd.k].set(w * (kd.day + (kd.night - kd.day) * night) * under);
    }
    // 얼음 섬: 눈 날씨면 펑펑, 눈보라면 더 세게(지역 변환으로 비는 이미 눈이 됐다)
    if ((st.theme.ice ?? 0) > 0.01 || snowK > 0.01) layers.snow.set(Math.min(1.8, Math.max(st.theme.ice ?? 0, snowK * 0.8) * (1 + 0.6 * snowK)) * under);
    // 모래시계섬 모래폭풍: 모래 알갱이 몇 배
    if (sandK > 0.01) layers.sand.set(Math.min(4, Math.max(st.theme.desert ?? 0, sandK) * (1 + 3 * sandK)) * under);
    // 폭풍 = 빗줄기 ×1.6
    layers.rain.set(r * (1 + 0.6 * stormK) * under);
    // 밤: 모든 섬 풀숲에 따뜻한 빛 점(반딧불·등불 느낌) — 장면에 광원 포인트가 있어야 밤이 포근하다
    layers.glow.set(Math.max(0, night - 0.35) / 0.65 * (1 - r) * under * (space ? 0 : 1) * (1 - 0.6 * (st.theme.ice ?? 0)));
    // 모래바람은 장면 빛을 받은 모래색으로(비조명 주황이 밤·노을에 튀지 않게)
    if (layers.sand.pts.visible) {
      const u = (layers.sand.pts.material as THREE.ShaderMaterial).uniforms;
      u.uColor.value.set(lerpHex('#dcc290', work.fogColor, 0.45));
      u.uColor2.value.set(lerpHex('#efdcb4', work.fogColor, 0.35));
    }
    const bw = (st.theme.dino ?? 0) * (1 - night) * under * (1 - r);
    birds.mesh.visible = bw > 0.3 && !space;
    if (birds.mesh.visible) {
      // 시선 앞쪽 하늘(카메라 앞 60 m, 높이 26 m)
      ctx.camera.getWorldDirection(fwd);
      fwd.y = 0; fwd.normalize();
      flock.set(at.x + fwd.x * 75, at.y + 17, at.z + fwd.z * 75);
      birds.update(t, flock);
    }
    bow.update(ctx.camera.position, engine.sunDir, st.bow * (1 - night) * under);
    // wave 3 날씨 연출 훅(유성우·오로라 …)
    for (const w of WEATHERS) {
      const hook = st.kinds[w];
      if (hook) hook(mix[w] * (space ? 0 : 1), { t, dt, night, under, work, at });
    }
    // 물속 빛줄기·거품은 ocean 모듈이 그린다(겹치지 않게 여기선 안개·색만). 필요하면 rays 를 켠다.
    rays.update(t, ctx.camera.position, p && Number.isFinite(p.waterY) ? p.waterY : 0, 0);
  });
  return g;
}
