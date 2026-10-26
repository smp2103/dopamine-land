// 대기: 하늘(뭉게구름)·시간 흐름(tod=auto)·섬별 날씨/분위기·비와 무지개·물속 안개와 빛줄기·나비/꽃가루/반딧불이.
// 하늘 그라디언트·별·은하수·조명·후처리 값은 core/engine·presets, 안개 셰이더는 atmosphere/fogChunks.
//
// URL(게임 모드):  tod=auto(기본: tod 를 안 주면 auto) · hour=17.5(auto 시작 시각, 기본 9.5) · weather=rain|rainbow|clear
// 시간: 게임 1분 = 1시간(하루 24분). 비는 15분마다 2분쯤, 그친 뒤 무지개.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import { TOD, lerpPreset, lerpHex, type TodPreset } from '../core/presets';
import type { Engine } from '../core/engine';
import { buildClouds } from './atmosphere/clouds';
import { buildLife } from './atmosphere/life';
import { KINDS, makeLayer, makeBirds, makeRainbow, makeGodRays, weatherCenter, type WeatherLayer } from './atmosphere/weather';

// 다른 모듈이 자리를 잡은 뒤에 나비·반딧불이 위치를 정한다
export const order = 50;

/** 하루 흐름: [시각, 프리셋] — 사이를 부드럽게 보간 */
const DAY_KEYS: Array<[number, string]> = [
  [0, 'night'], [4.6, 'night'], [6.2, 'morning'], [8.6, 'day'], [16.2, 'day'], [18.0, 'sunset'], [19.4, 'night'], [24, 'night'],
];

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
  const engine = (game?.engine ?? (window as unknown as { __engine?: Engine }).__engine) as Engine | undefined;
  if (!engine) return g;
  const todParam = q.get('tod');
  let auto = todParam === 'auto' || (!!game && todParam === null);
  // 룩 테스트(마을 고정 장면)는 정적 프리셋 그대로 — 시간 흐름만 auto 일 때
  if (!game && !auto) return g;

  const hour0 = Number(q.get('hour') ?? 9.5);
  const forced = q.get('weather');

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
  const st = { rain: 0, bow: 0, dive: 0, theme: {} as Record<string, number> };
  const fwd = new THREE.Vector3(), flock = new THREE.Vector3();
  let lastSig = '';
  let lastEnv = -1e9;
  let fixedName = TOD[todParam ?? ''] && todParam !== 'auto' ? todParam! : 'day';
  let started = false;
  // 다른 곳(GUI·main)이 applyTod 로 프리셋을 덮으면: 다음 프레임에 다시 적용하고, 시작 뒤라면 그 시간대로 고정(auto 고르면 다시 흐름)
  ctx.onTod((n, p) => {
    if (p === work) return;
    lastFull = '';
    if (started) {
      if (n === 'auto') auto = true;
      else if (TOD[n]) { auto = false; fixedName = n; }
    }
  });

  ctx.onUpdate((t, dt) => {
    started = true;
    const now = performance.now();
    const p = game?.player;
    const space = game?.world === 'space';
    // 1) 기본 프리셋: 우주 / 시간 흐름 / 고정
    let name: string;
    if (space) { copyPreset(TOD.space, base); name = 'space'; }
    else if (auto) { name = blendDay((((hour0 + t / 60) % 24) + 24) % 24, base); }
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

    // 3) 비·무지개 일정(결정적)
    let rainT = 0, bowT = 0;
    if (forced === 'rain') rainT = 1;
    else if (forced === 'rainbow') bowT = 1;
    else if (forced !== 'clear' && game) {
      const ph = (t + 300) % 900;
      rainT = smooth(600, 615, ph) * (1 - smooth(705, 720, ph));
      bowT = smooth(705, 730, ph) * (1 - smooth(820, 850, ph));
    }
    const dry = Math.max(st.theme.desert ?? 0, st.theme.ice ?? 0);
    rainT *= 1 - dry;
    bowT *= 1 - dry;
    if (space) { rainT = 0; bowT = 0; }
    st.rain += (rainT - st.rain) * (dt > 0 ? Math.min(1, dt * 0.5) : 1);
    st.bow += (bowT - st.bow) * (dt > 0 ? Math.min(1, dt * 0.3) : 1);
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
      const grey = night > 0.5 ? '#2c3a5a' : '#9fb0c2';
      work.skyTop = lerpHex(work.skyTop, night > 0.5 ? '#1a2440' : '#8195ab', 0.65 * r);
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
    // 얼음 섬에선 비 대신 눈이 펑펑
    if ((st.theme.ice ?? 0) > 0.01) layers.snow.set(Math.min(1.4, (st.theme.ice ?? 0) * (1 + 0.6 * rainT)) * under);
    layers.rain.set(r * under);
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
    // 물속 빛줄기·거품은 ocean 모듈이 그린다(겹치지 않게 여기선 안개·색만). 필요하면 rays 를 켠다.
    rays.update(t, ctx.camera.position, p && Number.isFinite(p.waterY) ? p.waterY : 0, 0);
  });
  return g;
}
