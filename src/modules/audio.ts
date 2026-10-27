// audio — 절차적 WebAudio 소리 서비스(order 1). game.audio: AudioApi 를 채운다. 바깥 소리 파일은 하나도 없다.
//  · 효과음 약 70가지(audio/sfx.ts) · 섬별 5음 음계 음악(audio/theory.ts + music.ts, 밤엔 느리고 작게, 3초 크로스페이드)
//  · 환경음(audio/ambience.ts: 바다·비·폭풍·바람·귀뚜라미·달 울림·배 엔진·활공·물속) · 생성 잔향 · 동시 24목소리
//  · state 이벤트 → 효과음(audio/cues.ts), 플레이어 이동·동작·탈것·env·세계를 살펴 발소리·첨벙·곡·환경음을 고른다.
// AudioContext 는 첫 keydown·pointerdown 에서 만든다. ?shot=1 · 헤드리스(navigator.webdriver)면 만들지 않는다(?audio=1 로 강제, ?audio=0 으로 끔).
// 크기 설정: localStorage 'dopamine-land:audio'. N = 음소거(hud 단축키).
//
// game.audio 사용법(다른 담당):
//   game.audio?.sfx('nibble')                         — 이름은 audio/sfx.ts SFX_NAMES
//   game.audio?.sfx('rock-hit', { x, z, pitch: 1.2 })  — x,z 를 주면 거리로 줄고 좌우로 갈린다(45m 밖 무음)
//   game.audio?.music('dino-night') · music('auto') 자동으로 돌아가기 · music(null) 조용히
//   game.audio?.ambience('rain', 0.6)                 — 자동 크기와 겹치면 큰 쪽. 0 이면 수동 값 해제
//   game.audio?.setVolume('music', 0.4) · game.audio?.mute()
// 디버그: window.__audio = { state(), play(name, o?), list(), log(), music(track), ambience(name, level), mute(on?), volume(ch, v), cues(event) }
import type { Ctx } from '../core/types';
import type { LooseEvent } from '../core/events';
import { rngFor } from '../core/rng';
import { AudioService } from './audio/service';
import { cuesFor, modeCue, stepSurface, stepInterval, ACTION_SFX } from './audio/cues';
import { ambienceLevels, PADDLE_BOATS, type MixInput } from './audio/mix';
import { trackFor } from './audio/theory';
import { SFX_NAMES } from './audio/sfx';

export const order = 1;

/** 환경(땅·곡·환경음) 다시 살피는 간격(초) */
const SAMPLE_EVERY = 0.5;

/** 이 창에서 소리를 켜도 되나: 촬영·헤드리스는 끈다(?audio=1 이면 강제로 켬, ?audio=0 이면 늘 끔) */
export function audioAllowed(search: string, nav: { webdriver?: boolean; userAgent?: string } | undefined): boolean {
  const q = new URLSearchParams(search);
  const a = q.get('audio');
  if (a === '0') return false;
  if (a === '1') return true;
  if (q.get('shot') === '1') return false;
  if (nav?.webdriver) return false;
  if (nav?.userAgent && /Headless/i.test(nav.userAgent)) return false;
  return true;
}

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;

  const loc = (globalThis as { location?: { search?: string } }).location;
  const nav = (globalThis as { navigator?: { webdriver?: boolean; userAgent?: string } }).navigator;
  const svc = new AudioService({ allowed: audioAllowed(loc?.search ?? '', nav) });
  svc.arm();
  game.audio = svc;

  // ── 이벤트 → 효과음
  const onEvent = (e: LooseEvent) => {
    // 날씨는 내 자리 것만(다른 섬 폭풍에 천둥 치지 않게)
    if (e.type === 'weather' && game.env && e.region !== game.env.region) return;
    for (const c of cuesFor(e)) svc.cue(c);
  };
  game.state.on(onEvent as (e: { type: string; [k: string]: unknown }) => void);

  // ── N 음소거
  game.hud.registerHotkey({
    id: 'audio:mute', code: 'KeyN', label: '소리', hint: true,
    run: () => {
      const m = svc.mute();
      game.hud.toast(m ? '쉿, 소리를 껐어요 · N 으로 다시 켜기' : '소리를 켰어요! 🎵');
    },
  });

  // ── 탭 숨김 → 쉬기
  const doc = (globalThis as { document?: Document }).document;
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => svc.setHidden(doc.visibilityState === 'hidden'));
  }

  // ── 살피기 상태
  let prevMode: string = game.player.mode;
  let prevAction: string | null = game.player.action;
  let stepT = 0;
  let stepN = 0;
  let bubbleT = 2;
  let paddleT = 0;
  let sampleT = SAMPLE_EVERY; // 첫 프레임에 바로 살핀다
  let tod: string = game.env?.tod ?? ctx.tod;
  let theme: string = 'home';
  let surf = { kind: 'grass', coast: 100, h: 0 };
  let thunderAt = -1;
  let thunderN = 0;
  const stepRng = rngFor('audio:steps');
  ctx.onTodChange((name) => { tod = name; });
  game.onWorld(() => { sampleT = SAMPLE_EVERY; });

  /** 땅·섬·곡·환경음 다시 정하기(0.5초마다) */
  function sample() {
    const p = game!.player;
    const world = game!.world;
    if (world === 'earth') {
      try {
        const s = ctx.island.surfaceAt(p.pos.x, p.pos.z);
        surf = { kind: s.kind, coast: s.coastDist, h: s.h };
        // 해안 150m 안이면 그 섬 곡, 먼바다에선 마지막 섬 곡을 그대로
        if (s.coastDist > -150) {
          const z = game!.geo?.zoneAt(p.pos.x, p.pos.z);
          const th = z?.theme ?? (s.island ? ctx.island.islandById(s.island)?.theme : null);
          if (th) theme = th;
        }
      } catch { /* 지형 함수가 아직 — 지난 값 유지 */ }
    }
    const envTod = game!.env?.tod ?? tod;
    svc.setAutoTrack(trackFor({ world, theme, tod: envTod }));
    const v = game!.vehicles?.current?.() ?? null;
    const mix: MixInput = {
      world, coast: surf.coast, kind: surf.kind, y: p.pos.y, weather: game!.env?.weather ?? 'clear', tod: envTod,
      mode: p.mode, speed: p.speed, vehicle: v ? { kind: v.kind, speed: v.speed, boat: v.boat } : null,
    };
    svc.setAutoAmbience(ambienceLevels(mix));
  }

  game.onUpdate((t, dt) => {
    const p = game.player;
    // 듣는 자리: 플레이어, 좌우: 카메라 오른쪽 벡터(행렬 0열)
    const m = ctx.camera.matrixWorld.elements;
    svc.setListener(p.pos.x, p.pos.z, m[0], m[2]);

    if (dt > 0) {
      // 이동 상태 바뀜(첨벙·잠수·떠오름·점프·착지)
      if (p.mode !== prevMode) {
        const c = modeCue(prevMode, p.mode, p.vel.y);
        if (c) svc.cue(c);
        prevMode = p.mode;
        stepT = 0;
      }
      // 동작 시작(던지기·감기·채 휘두르기·삽질 …)
      if (p.action !== prevAction) {
        const s = p.action ? ACTION_SFX[p.action] : undefined;
        if (s) svc.sfx(s);
        prevAction = p.action;
      }
      // 발소리
      if (p.mode === 'ground' && !p.mounted && p.speed > 0.6) {
        stepT += dt;
        if (stepT >= stepInterval(p.speed)) {
          stepT = 0;
          // 땅보다 높이 서 있으면(부두·다리·마루) 나무 발소리 — 지형 높이는 걸음마다 새로(빠른 heightAt)
          const above = game.world === 'earth' ? p.pos.y - ctx.island.heightAt(p.pos.x, p.pos.z) : 0;
          const kind = stepSurface(surf.kind, above, game.world);
          stepN++;
          svc.sfx(`step-${kind}`, { pitch: (game.world === 'space' ? 0.75 : 1) * (0.9 + stepRng() * 0.2), vol: Math.min(1, 0.6 + p.speed / 12) });
        }
      } else stepT = 0;
      // 잠수 중 보글보글
      if (p.mode === 'dive') { bubbleT -= dt; if (bubbleT <= 0) { svc.sfx('bubbles', { vol: 0.6 }); bubbleT = 2.4 + stepRng() * 2; } }
      // 노 젓는 배
      const v = game.vehicles?.current?.();
      if (v && PADDLE_BOATS.test(v.kind) && Math.abs(v.speed) > 0.5) {
        paddleT -= dt;
        if (paddleT <= 0) { svc.sfx('raft-paddle'); paddleT = 1.1 - Math.min(0.5, Math.abs(v.speed) / 12); }
      }
      // 폭풍 천둥: 7~20초마다(결정적 난수)
      if (game.world === 'earth' && game.env?.weather === 'storm') {
        if (thunderAt < 0) thunderAt = t + 4 + rngFor(`audio:thunder:${thunderN}`)() * 8;
        else if (t >= thunderAt) {
          const r = rngFor(`audio:thunder:${++thunderN}`);
          svc.sfx('thunder', { pitch: 0.8 + r() * 0.4, vol: 0.6 + r() * 0.4 });
          thunderAt = t + 7 + r() * 13;
        }
      } else thunderAt = -1;
    }

    sampleT += dt > 0 ? dt : 1 / 60;
    if (sampleT >= SAMPLE_EVERY) { sampleT = 0; sample(); }
    svc.update(dt);
  });

  // ── 디버그 훅
  (globalThis as unknown as { __audio?: unknown }).__audio = {
    state: () => ({ ...svc.state(), steps: stepN, theme }),
    play: (name: string, o?: { x?: number; z?: number; vol?: number; pitch?: number }) => svc.sfx(name, o),
    list: () => [...SFX_NAMES],
    log: () => svc.log.slice(),
    music: (track: string | null) => svc.music(track),
    ambience: (name: string, level: number) => svc.ambience(name, level),
    mute: (on?: boolean) => svc.mute(on),
    volume: (ch: 'master' | 'music' | 'sfx', v: number) => svc.setVolume(ch, v),
    cues: (e: LooseEvent) => cuesFor(e),
  };
}
