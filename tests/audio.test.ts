// audio — 시퀀서 결정성 · 이벤트→효과음 표 · 크기 저장 · 몸짓 전엔 AudioContext 없음 · 동시 24 · 크로스페이드.
// WebAudio 는 아래 가짜 AudioContext(값 검사 포함)로 돌린다.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeFakeGame, makeCtx } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import { barNotes, trackFor, parseTrack, TRACKS, TRACK_IDS, MAJOR_PENT, MINOR_PENT, stepSec } from '../src/modules/audio/theory';
import { cuesFor, CUE_EVENTS, npcPitch, stepSurface, modeCue, catchSfx } from '../src/modules/audio/cues';
import { SFX, SFX_NAMES, hasSfx } from '../src/modules/audio/sfx';
import { ambienceLevels, spatialize, AMBIENCES } from '../src/modules/audio/mix';
import { AUDIO_KEY, loadSettings, DEFAULT_SETTINGS } from '../src/modules/audio/settings';
import { AudioService } from '../src/modules/audio/service';
import { POLYPHONY } from '../src/modules/audio/synth';
import buildAudio, { audioAllowed, order } from '../src/modules/audio';

// ───────────── 가짜 WebAudio ─────────────
const bad = (v: number) => typeof v !== 'number' || !Number.isFinite(v);
class FParam {
  value: number;
  events = 0;
  constructor(v = 0) { this.value = v; }
  private chk(v: number, t: number) { if (bad(v) || bad(t) || t < 0) throw new Error(`bad param ${v} @ ${t}`); this.events++; }
  setValueAtTime(v: number, t: number) { this.chk(v, t); this.value = v; return this; }
  linearRampToValueAtTime(v: number, t: number) { this.chk(v, t); this.value = v; return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.chk(v, t); if (v <= 0) throw new Error('exp ramp to <= 0'); this.value = v; return this; }
  setTargetAtTime(v: number, t: number, c: number) { this.chk(v, t); if (bad(c) || c <= 0) throw new Error('bad tc'); this.value = v; return this; }
  cancelScheduledValues(t: number) { if (bad(t)) throw new Error('bad cancel'); return this; }
}
class FNode {
  outs = new Set<unknown>();
  constructor(public ctx: FakeAC, public kind: string) { ctx.created[kind] = (ctx.created[kind] ?? 0) + 1; }
  connect(d: unknown) { if (!d) throw new Error('connect to nothing'); this.outs.add(d); return d; }
  disconnect() { this.outs.clear(); }
}
class FSource extends FNode {
  started = -1; stopped = -1;
  start(t = 0, off = 0) { if (bad(t) || bad(off)) throw new Error('bad start'); if (this.started >= 0) throw new Error('started twice'); this.started = t; }
  stop(t = 0) { if (bad(t)) throw new Error('bad stop'); if (this.started < 0) throw new Error('stop before start'); this.stopped = t; }
}
class FakeAC {
  static made = 0;
  created: Record<string, number> = {};
  currentTime = 0;
  sampleRate = 8000; // 작게 — 버퍼 만들기 빠르게
  state: AudioContextState = 'suspended';
  destination = new FNode(this, 'dest');
  constructor() { FakeAC.made++; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createGain() { const n = new FNode(this, 'gain') as FNode & { gain: FParam }; n.gain = new FParam(1); return n; }
  createOscillator() { const n = new FSource(this, 'osc') as FSource & Record<string, unknown>; n.frequency = new FParam(440); n.detune = new FParam(0); n.type = 'sine'; return n; }
  createBufferSource() { const n = new FSource(this, 'buf') as FSource & Record<string, unknown>; n.buffer = null; n.loop = false; n.playbackRate = new FParam(1); return n; }
  createBiquadFilter() { const n = new FNode(this, 'biquad') as FNode & Record<string, unknown>; n.type = 'lowpass'; n.frequency = new FParam(350); n.Q = new FParam(1); n.gain = new FParam(0); return n; }
  createDynamicsCompressor() { const n = new FNode(this, 'comp') as FNode & Record<string, unknown>; for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FParam(0); return n; }
  createConvolver() { const n = new FNode(this, 'conv') as FNode & Record<string, unknown>; n.buffer = null; return n; }
  createStereoPanner() { const n = new FNode(this, 'pan') as FNode & { pan: FParam }; n.pan = new FParam(0); return n; }
  createBuffer(ch: number, len: number, sr: number) {
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: (i: number) => data[i] };
  }
}
const asCtor = () => FakeAC as unknown as new () => AudioContext;
/** 몸짓 한 번 내서 컨텍스트 만든 서비스 */
function liveService() {
  const target = new EventTarget();
  const svc = new AudioService({ allowed: true, target, ctor: asCtor() });
  svc.arm();
  target.dispatchEvent(new Event('pointerdown'));
  return { svc, ac: svc.ac as unknown as FakeAC };
}

beforeEach(() => { stubLocalStorage(); FakeAC.made = 0; });

// ───────────── 시퀀서 ─────────────
describe('음악 시퀀서(결정성)', () => {
  it('같은 섬·마디·밤이면 언제나 같은 음표, 16마디마다 되풀이', () => {
    for (const id of TRACK_IDS) {
      for (let bar = 0; bar < 16; bar++) {
        expect(barNotes(id, bar)).toEqual(barNotes(id, bar));
        expect(barNotes(id, bar + 16)).toEqual(barNotes(id, bar));
        expect(barNotes(id, bar, true)).toEqual(barNotes(id, bar, true));
      }
    }
  });
  it('섬마다 다른 곡, 선율은 그 섬 5음 음계 안', () => {
    const sig = (id: typeof TRACK_IDS[number]) => JSON.stringify(Array.from({ length: 8 }, (_, b) => barNotes(id, b).filter((n) => n.part === 'lead').map((n) => n.midi)));
    const sigs = new Set(TRACK_IDS.map(sig));
    expect(sigs.size).toBe(TRACK_IDS.length);
    for (const id of TRACK_IDS) {
      const def = TRACKS[id];
      const sc = (def.mode === 'major' ? MAJOR_PENT : MINOR_PENT) as readonly number[];
      for (let b = 0; b < 16; b++) {
        for (const n of barNotes(id, b)) {
          expect(Number.isFinite(n.midi) && n.dur > 0 && n.vel > 0 && n.vel <= 1).toBe(true);
          expect(n.step).toBeGreaterThanOrEqual(0);
          expect(n.step + n.dur).toBeLessThanOrEqual(8);
          if (n.part === 'lead') expect(sc).toContain((((n.midi - def.root) % 12) + 12) % 12);
        }
      }
    }
  });
  it('밤 변주: 느리고(칸이 길고) 작다', () => {
    for (const id of TRACK_IDS) {
      expect(stepSec(TRACKS[id], true)).toBeGreaterThan(stepSec(TRACKS[id], false));
      let dv = 0, nv = 0, dn = 0, nn = 0;
      for (let b = 0; b < 16; b++) {
        for (const n of barNotes(id, b)) if (n.part === 'lead') { dv += n.vel; dn++; }
        for (const n of barNotes(id, b, true)) if (n.part === 'lead') { nv += n.vel; nn++; }
      }
      expect(nv / Math.max(1, nn)).toBeLessThan(dv / dn);
      expect(nn).toBeLessThanOrEqual(dn);
    }
  });
  it('곡 고르기: 섬 테마 · 밤 · 우주 · 작은 섬', () => {
    expect(trackFor({ world: 'earth', theme: 'dino', tod: 'day' })).toBe('dino');
    expect(trackFor({ world: 'earth', theme: 'dino', tod: 'night' })).toBe('dino-night');
    expect(trackFor({ world: 'earth', theme: 'ice', tod: 'sunset' })).toBe('ice');
    expect(trackFor({ world: 'space', theme: 'home', tod: 'day' })).toBe('moon');
    expect(trackFor({ world: 'earth', theme: 'islet', tod: 'day' })).toBe('home');
    expect(parseTrack('coral-night')).toEqual({ id: 'coral', night: true });
    expect(parseTrack('nope')).toBeNull();
    expect(TRACKS.home.patch).toBe('pluck');
    expect(TRACKS.dino.patch).toBe('marimba');
    expect(TRACKS.ice.patch).toBe('bells');
    expect(TRACKS.mushroom.patch).toBe('musicbox');
    expect(TRACKS.coral.patch).toBe('steeldrum');
    expect(TRACKS.desert.patch).toBe('reed');
    expect(TRACKS.launch.patch).toBe('synth');
    expect(TRACKS.moon.patch).toBe('pad');
  });
});

// ───────────── 이벤트 → 효과음 ─────────────
const names = (e: { type: string; [k: string]: unknown }) => cuesFor(e).map((c) => c.sfx);
describe('이벤트 → 효과음', () => {
  it('잡기: 희귀도별 + 새 종 도장 + 반짝이', () => {
    expect(names({ type: 'collect', species: { rarity: 2 }, isNew: false })).toEqual(['catch-2']);
    expect(names({ type: 'collect', species: { rarity: 1 }, rarity: 5, isNew: true, variant: 'shiny' })).toEqual(['catch-5', 'new-dex', 'shiny']);
    expect(names({ type: 'collect', species: {}, isNew: false })).toEqual(['catch-1']);
    expect(catchSfx(9)).toBe('catch-5');
    expect(names({ type: 'catch-fail', activity: 'fish' })).toEqual(['fail-splash']);
    expect(names({ type: 'catch-fail', activity: 'bug' })).toEqual(['net-miss']);
  });
  it('돈·진행: 코인(작게·크게), 팔 때는 sell 하나만', () => {
    expect(names({ type: 'coins', delta: 50, why: 'pickup' })).toEqual(['coin']);
    expect(names({ type: 'coins', delta: 5000, why: 'chest' })).toEqual(['coins-big']);
    expect(names({ type: 'coins', delta: -50, why: 'buy' })).toEqual([]);
    expect(names({ type: 'coins', delta: 200, why: 'sell' })).toEqual([]);
    expect(names({ type: 'sell', id: 'x', n: 1, coins: 200, shop: 'quack' })).toEqual(['sell']);
    expect(names({ type: 'stars', delta: 3, why: 'x' })).toEqual(['star']);
    expect(names({ type: 'unlock', key: 'v:bike' })).toEqual(['unlock']);
    expect(names({ type: 'craft', id: 'r', n: 1 })).toEqual(['craft']);
    expect(names({ type: 'buy', id: 'x', n: 1 })).toEqual(['buy']);
    expect(names({ type: 'achievement', id: 'a', stars: 5 })).toEqual(['achievement']);
    expect(names({ type: 'mission-done', id: 'm' })).toEqual(['mission']);
    expect(names({ type: 'bag-full', id: 'x' })).toEqual(['bag-full']);
  });
  it('상자: 등급만큼 흔들고 그 등급 소리, 미믹', () => {
    expect(names({ type: 'chest-open', tier: 'wood', at: 'x', loot: [] })).toEqual(['chest-shake', 'chest-open-wood']);
    expect(names({ type: 'chest-open', tier: 'gold', at: 'x', loot: [] })).toEqual(['chest-shake', 'chest-shake', 'chest-shake', 'chest-open-gold']);
    expect(names({ type: 'chest-open', tier: 'silver', at: 'x', loot: [], mimic: true })).toEqual(['chest-shake', 'chest-shake', 'mimic']);
    const c = cuesFor({ type: 'chest-open', tier: 'gold', at: 'x', loot: [] });
    expect(c.map((x) => x.delay ?? 0)).toEqual([...c.map((x) => x.delay ?? 0)].sort((a, b) => a - b));
  });
  it('채집·돌 콤보(높아진다)·주민 말소리(주민마다 높이)', () => {
    expect(names({ type: 'harvest', kind: 'chop', item: 'm_wood', n: 1, island: 'home' })).toEqual(['chop']);
    expect(names({ type: 'harvest', kind: 'fruit', item: 'm_apple', n: 1, island: 'home' })).toEqual(['fruit-drop']);
    expect(names({ type: 'harvest', kind: 'dig', item: 'x', n: 1, island: 'home' })).toEqual(['dig']);
    expect(names({ type: 'harvest', kind: 'balloon', item: 'x', n: 1, island: 'home' })).toEqual(['balloon-pop']);
    expect(names({ type: 'harvest', kind: 'flower', item: 'x', n: 1, island: 'home' })).toEqual(['pick']);
    const p = [0, 1, 2, 3, 4].map((combo) => cuesFor({ type: 'rock-hit', x: 1, z: 2, rock: 'r', combo, island: 'home' })[0]);
    for (let i = 1; i < p.length; i++) expect(p[i].pitch!).toBeGreaterThan(p[i - 1].pitch!);
    expect(p[0]).toMatchObject({ sfx: 'rock-hit', x: 1, z: 2 });
    const q = cuesFor({ type: 'npc-talk', npc: 'npc_quack' })[0], s = cuesFor({ type: 'npc-talk', npc: 'npc_slow' })[0];
    expect(q.sfx).toBe('talk-blip');
    expect(q.pitch).not.toBe(s.pitch);
    expect(npcPitch('someone_new')).toBe(npcPitch('someone_new'));
    expect(npcPitch('someone_new')).toBeGreaterThanOrEqual(0.8);
  });
  it('세상·이동·생물', () => {
    expect(names({ type: 'discover', place: 'dino', name: '공룡섬', kind: 'island' })).toEqual(['discover']);
    expect(names({ type: 'launch-wave' })).toEqual(['rocket-countdown', 'rocket-launch']);
    expect(names({ type: 'arrive', to: 'moon' })).toEqual(['arrive']);
    expect(names({ type: 'mount', vehicle: 'bike' })).toEqual(['bike-bell']);
    expect(names({ type: 'weather', region: 'home', weather: 'storm', prev: 'rain' })).toEqual(['thunder']);
    expect(names({ type: 'stung' })).toEqual(['stung']);
    expect(names({ type: 'tino', state: 'sleep' })).toEqual(['tino-snore']);
    expect(names({ type: 'tino', state: 'wake' })).toEqual(['dino-roar-cute']);
    expect(names({ type: 'clap', x: 0, z: 0 })).toEqual(['clap']);
    expect(names({ type: 'what-is-this' })).toEqual([]);
  });
  it('표의 모든 소리는 목록에 있다(이벤트마다 대표 모양으로)', () => {
    const sample: Record<string, Record<string, unknown>> = {
      collect: { species: { rarity: 3 }, isNew: true, variant: 'crown' }, coins: { delta: 10 }, stars: { delta: 1 }, sell: { coins: 10 },
      'chest-open': { tier: 'rainbow' }, harvest: { kind: 'honey' }, 'rock-hit': { combo: 3 }, mount: { vehicle: 'motorboat' },
      weather: { weather: 'rainbow' }, tino: { state: 'chase' }, lighthouse: { lit: true }, 'catch-fail': { activity: 'dive' },
    };
    for (const type of CUE_EVENTS) {
      const cs = cuesFor({ type, ...(sample[type] ?? {}) });
      expect(cs.length, type).toBeGreaterThan(0);
      for (const c of cs) expect(hasSfx(c.sfx), `${type} → ${c.sfx}`).toBe(true);
    }
    for (const k of ['chest-open-wood', 'chest-open-silver', 'chest-open-gold', 'chest-open-rainbow', 'chest-open-space']) expect(hasSfx(k)).toBe(true);
    expect(SFX_NAMES.length).toBeGreaterThanOrEqual(50);
  });
  it('발소리·이동 상태', () => {
    expect(stepSurface('grass', 0)).toBe('grass');
    expect(stepSurface('desert', 0)).toBe('sand');
    expect(stepSurface('snow', 0)).toBe('snow');
    expect(stepSurface('grass', 0.6)).toBe('wood');
    expect(stepSurface('rock', 0)).toBe('stone'); // 바위는 부두(나무)가 아니라 돌
    expect(stepSurface('cliff', 0)).toBe('stone');
    expect(modeCue('air', 'swim', -3)?.sfx).toBe('splash');
    expect(modeCue('swim', 'dive', 0)?.sfx).toBe('dive');
    expect(modeCue('dive', 'swim', 0)?.sfx).toBe('surface');
    expect(modeCue('ground', 'air', 6)?.sfx).toBe('jump');
    expect(modeCue('ground', 'air', -1)).toBeNull(); // 걸어서 떨어짐은 점프 아님
    for (const s of ['grass', 'sand', 'snow', 'wood', 'stone'] as const) expect(hasSfx(`step-${s}`)).toBe(true);
  });
});

// ───────────── 환경음·거리 ─────────────
describe('환경음 섞기·거리', () => {
  const base = { world: 'earth' as const, coast: 200, kind: 'grass', y: 5, weather: 'clear', tod: 'day', mode: 'ground', speed: 0, vehicle: null };
  it('바닷가·비·폭풍·높은 곳·밤·달·배', () => {
    expect(ambienceLevels({ ...base, coast: 5 }).sea).toBeGreaterThan(0.6);
    expect(ambienceLevels(base).sea).toBe(0);
    expect(ambienceLevels({ ...base, weather: 'rain' }).rain).toBeGreaterThan(0);
    expect(ambienceLevels({ ...base, weather: 'storm' }).storm).toBeGreaterThan(0);
    expect(ambienceLevels({ ...base, y: 100 }).wind).toBeGreaterThan(0.5);
    expect(ambienceLevels({ ...base, tod: 'night' }).crickets).toBeGreaterThan(0);
    expect(ambienceLevels({ ...base, tod: 'night', kind: 'snow' }).crickets).toBe(0);
    expect(ambienceLevels({ ...base, world: 'space' })['moon-hum']).toBeGreaterThan(0);
    const slow = ambienceLevels({ ...base, coast: -50, vehicle: { kind: 'motorboat', speed: 1, boat: true } })['boat-engine'];
    const fast = ambienceLevels({ ...base, coast: -50, vehicle: { kind: 'motorboat', speed: 14, boat: true } })['boat-engine'];
    expect(fast).toBeGreaterThan(slow);
    expect(ambienceLevels({ ...base, vehicle: { kind: 'raft', speed: 5, boat: true } })['boat-engine']).toBe(0);
    expect(ambienceLevels({ ...base, mode: 'dive' }).underwater).toBeGreaterThan(0);
    for (const v of Object.values(ambienceLevels({ ...base, weather: 'storm', tod: 'night', y: 200, mode: 'glide', speed: 30 }))) expect(v).toBeLessThanOrEqual(1);
  });
  it('거리로 줄고 좌우로 갈린다', () => {
    expect(spatialize(0, 0, 1, 0, 1, 0).gain).toBe(1);
    expect(spatialize(0, 0, 1, 0, 20, 0).gain).toBeLessThan(spatialize(0, 0, 1, 0, 10, 0).gain);
    expect(spatialize(0, 0, 1, 0, 60, 0).gain).toBe(0);
    expect(spatialize(0, 0, 1, 0, 15, 0).pan).toBeGreaterThan(0.5);
    expect(spatialize(0, 0, 1, 0, -15, 0).pan).toBeLessThan(-0.5);
    expect(Math.abs(spatialize(0, 0, 1, 0, 0, 15).pan)).toBeLessThan(0.01);
  });
});

// ───────────── 크기 저장 ─────────────
describe('크기 저장(localStorage dopamine-land:audio)', () => {
  it('setVolume·mute 가 저장되고 새 서비스가 읽는다', () => {
    const ls = stubLocalStorage();
    const a = new AudioService({ allowed: false });
    expect(a.settings).toEqual(DEFAULT_SETTINGS);
    a.setVolume('music', 0.3);
    a.setVolume('sfx', 2); // 넘치면 1
    a.setVolume('master', Number.NaN); // 무시
    expect(a.mute()).toBe(true);
    expect(JSON.parse(ls.getItem(AUDIO_KEY)!)).toMatchObject({ music: 0.3, sfx: 1, master: DEFAULT_SETTINGS.master, muted: true });
    const b = new AudioService({ allowed: false });
    expect(b.settings).toMatchObject({ music: 0.3, sfx: 1, muted: true });
    expect(b.mute()).toBe(false);
    expect(b.mute(true)).toBe(true);
    expect(loadSettings().muted).toBe(true);
  });
  it('망가진 값·막힌 저장소에도 기본값으로 버틴다', () => {
    stubLocalStorage({ [AUDIO_KEY]: '{not json' });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    stubLocalStorage({ [AUDIO_KEY]: JSON.stringify({ music: 'loud', sfx: -3 }) });
    expect(loadSettings()).toMatchObject({ music: DEFAULT_SETTINGS.music, sfx: 0 });
    const ls = stubLocalStorage();
    ls.setItem = () => { throw new Error('QuotaExceeded'); };
    ls.getItem = () => { throw new Error('SecurityError'); };
    const s = new AudioService({ allowed: false });
    expect(() => s.setVolume('music', 0.2)).not.toThrow();
    expect(s.settings.music).toBe(0.2);
  });
});

// ───────────── 몸짓 전엔 컨텍스트 없음 ─────────────
describe('AudioContext 는 몸짓 뒤에만', () => {
  it('arm 만으로도, sfx·music 을 불러도 안 만든다 → keydown 에서 하나', () => {
    const target = new EventTarget();
    const svc = new AudioService({ allowed: true, target, ctor: asCtor() });
    svc.arm();
    svc.sfx('coin');
    svc.music('dino');
    svc.ambience('rain', 0.5);
    svc.update(1 / 60);
    expect(FakeAC.made).toBe(0);
    expect(svc.ready).toBe(false);
    expect(svc.log.at(-1)).toMatchObject({ name: 'coin', played: false, why: 'no-context' });
    target.dispatchEvent(new Event('keydown'));
    expect(FakeAC.made).toBe(1);
    expect(svc.ac!.state).toBe('running');
    target.dispatchEvent(new Event('pointerdown'));
    expect(FakeAC.made).toBe(1);
    // 몸짓 전에 정한 곡·환경음이 바로 깔린다
    expect(svc.state().track).toBe('dino');
    expect(svc.state().ambienceLive).toMatchObject({ rain: 0.5 });
    svc.sfx('coin');
    expect(svc.log.at(-1)).toMatchObject({ name: 'coin', played: true });
  });
  it('allowed=false(촬영·헤드리스)면 몸짓에도 안 만든다', () => {
    const target = new EventTarget();
    const svc = new AudioService({ allowed: false, target, ctor: asCtor() });
    svc.arm();
    target.dispatchEvent(new Event('keydown'));
    target.dispatchEvent(new Event('pointerdown'));
    expect(FakeAC.made).toBe(0);
  });
  it('audioAllowed: shot·webdriver·Headless 는 끄고 ?audio=1 은 강제로 켠다', () => {
    expect(audioAllowed('', { webdriver: false, userAgent: 'Chrome' })).toBe(true);
    expect(audioAllowed('?shot=1', {})).toBe(false);
    expect(audioAllowed('', { webdriver: true })).toBe(false);
    expect(audioAllowed('', { userAgent: 'Mozilla HeadlessChrome/140' })).toBe(false);
    expect(audioAllowed('?shot=1&audio=1', { webdriver: true })).toBe(true);
    expect(audioAllowed('?audio=0', {})).toBe(false);
  });
  it('모듈: ?shot=1 이면 keydown 을 쏴도 컨텍스트가 없다', () => {
    const g0 = globalThis as unknown as { AudioContext?: unknown };
    const prev = g0.AudioContext;
    g0.AudioContext = FakeAC;
    try {
      const game = makeFakeGame({ search: '?shot=1' });
      buildAudio(makeCtx(game) as never);
      expect(game.audio).toBeTruthy();
      globalThis.dispatchEvent(new Event('keydown'));
      expect(FakeAC.made).toBe(0);
    } finally { g0.AudioContext = prev; }
  });
});

// ───────────── 합성(가짜 컨텍스트) ─────────────
describe('합성·목소리·음악', () => {
  it('모든 효과음이 값 오류 없이 울린다(높이·위치 바꿔도)', () => {
    const { svc } = liveService();
    svc.setListener(0, 0, 1, 0);
    for (const n of SFX_NAMES) {
      for (const pitch of [0.5, 1, 2]) {
        expect(() => svc.sfx(n, { pitch, x: 4, z: 1 }), n).not.toThrow();
        (svc as unknown as { last: Map<string, number> }).last.clear();
      }
    }
    expect(Object.keys(SFX).length).toBe(SFX_NAMES.length);
  });
  it(`동시 ${POLYPHONY} 목소리: 넘치면 오래된 걸 뺏는다`, () => {
    const { svc } = liveService();
    for (let i = 0; i < 40; i++) { (svc as unknown as { last: Map<string, number> }).last.clear(); svc.sfx('rocket-launch'); }
    const st = svc.state();
    expect(st.voices).toBeLessThanOrEqual(POLYPHONY);
    expect(st.stolen).toBeGreaterThanOrEqual(40 - POLYPHONY);
  });
  it('같은 소리는 gap 안에 한 번만, 먼 소리는 안 낸다, 음소거면 안 낸다', () => {
    const { svc } = liveService();
    svc.setListener(0, 0, 1, 0);
    svc.sfx('coin'); svc.sfx('coin');
    expect(svc.log.slice(-2).map((r) => r.why ?? 'ok')).toEqual(['ok', 'gap']);
    svc.sfx('clap', { x: 500, z: 0 });
    expect(svc.log.at(-1)!.why).toBe('far');
    svc.mute(true);
    svc.sfx('star');
    expect(svc.log.at(-1)!.why).toBe('muted');
    svc.sfx('nope-not-a-sound');
    expect(svc.log.at(-1)!.why).toBe('unknown');
  });
  it('곡을 바꾸면 3초 크로스페이드 뒤 한 줄만 남는다, 칸마다 음표 예약', () => {
    const { svc, ac } = liveService();
    svc.setAutoTrack('home');
    const osc0 = ac.created.osc ?? 0;
    for (let i = 0; i < 120; i++) { ac.currentTime += 1 / 60; svc.update(1 / 60); }
    expect((ac.created.osc ?? 0)).toBeGreaterThan(osc0);
    svc.setAutoTrack('home-night');
    expect(svc.state().lanes.length).toBe(2);
    for (let i = 0; i < 60 * 3.5; i++) { ac.currentTime += 1 / 60; svc.update(1 / 60); }
    expect(svc.state().lanes).toEqual([expect.objectContaining({ key: 'home-night', fading: false })]);
    // music() 로 고정하면 자동을 이긴다, 'auto' 로 돌아간다, null 은 조용히
    svc.music('ice');
    expect(svc.state().track).toBe('ice');
    svc.setAutoTrack('dino');
    expect(svc.state().track).toBe('ice');
    svc.music('auto');
    expect(svc.state().track).toBe('dino');
    svc.music(null);
    expect(svc.state().track).toBeNull();
  });
  it('잔향도 음악·효과음 버스를 지난다(크기 0 이면 젖은 소리까지 꺼짐)', () => {
    const { svc, ac } = liveService();
    const synth = svc.synth!;
    // 이 뒤로 만든 노드를 모두 모은다
    const made: FNode[] = [];
    const mk = ac.createGain.bind(ac);
    ac.createGain = () => { const n = mk(); made.push(n); return n; };
    svc.setListener(0, 0, 1, 0);
    svc.sfx('coin');
    svc.sfx('thunder', { x: 8, z: 2 }); // 좌우(panner) 길
    svc.setAutoTrack('home');
    for (let i = 0; i < 60; i++) { ac.currentTime += 1 / 60; svc.update(1 / 60); }
    expect(made.length).toBeGreaterThan(5);
    // 버스(music·sfx)를 막으면 새 노드 어디서도 스피커에 닿지 않아야 한다
    const blocked = new Set<unknown>([synth.music, synth.sfx]);
    const leaks = (start: unknown): boolean => {
      const seen = new Set<unknown>();
      const st = [start];
      while (st.length) {
        const n = st.pop();
        if (n === ac.destination) return true;
        if (!n || seen.has(n) || blocked.has(n)) continue;
        seen.add(n);
        const outs = (n as { outs?: Set<unknown> }).outs;
        if (outs) for (const o of outs) st.push(o);
      }
      return false;
    };
    for (const n of made) expect(leaks(n)).toBe(false);
    expect(leaks(synth.verb) || leaks(synth.musicVerb)).toBe(false);
    // 음악 크기 0 → 버스 gain 0(잔향도 그 뒤라 같이 꺼진다)
    svc.setVolume('music', 0);
    for (let i = 0; i < 30; i++) { ac.currentTime += 1 / 60; svc.update(1 / 60); }
    expect((synth.music.gain as unknown as FParam).value).toBeLessThan(0.01);
  });
  it('환경음: 크기 0 이 오래 가면 노드를 버린다, 수동·자동은 큰 쪽', () => {
    const { svc, ac } = liveService();
    svc.setAutoAmbience({ sea: 0.4 });
    svc.ambience('sea', 0.7);
    expect(svc.state().ambienceLive.sea).toBe(0.7);
    svc.ambience('sea', 0);
    expect(svc.state().ambienceLive.sea).toBe(0.4);
    svc.setAutoAmbience({});
    for (let i = 0; i < 60 * 4; i++) { ac.currentTime += 1 / 60; svc.update(1 / 60); }
    expect(svc.state().ambienceLive.sea).toBeUndefined();
    for (const n of AMBIENCES) expect(() => svc.ambience(n, 0.5)).not.toThrow();
    expect(() => svc.ambience('bogus', 1)).not.toThrow();
  });
});

// ───────────── 모듈 연결 ─────────────
describe('audio 모듈', () => {
  let prev: unknown;
  beforeEach(() => { prev = (globalThis as { AudioContext?: unknown }).AudioContext; (globalThis as { AudioContext?: unknown }).AudioContext = FakeAC; });
  afterEach(() => { (globalThis as { AudioContext?: unknown }).AudioContext = prev; });

  it('order 1, game.audio, N 음소거 단축키(hint), 디버그 훅', () => {
    expect(order).toBe(1);
    const game = makeFakeGame({ search: '?audio=1' });
    buildAudio(makeCtx(game) as never);
    expect(game.audio).toBeInstanceOf(AudioService);
    const hk = game.hud.hotkeys().find((h) => h.code === 'KeyN');
    expect(hk).toMatchObject({ hint: true });
    hk!.run();
    expect((game.audio as AudioService).settings.muted).toBe(true);
    expect(game.hudLog.toasts.at(-1)).toContain('N');
    const dbg = (globalThis as unknown as { __audio: { state(): { allowed: boolean }; list(): string[] } }).__audio;
    expect(dbg.state().allowed).toBe(true);
    expect(dbg.list()).toContain('catch-5');
  });
  it('state 이벤트가 효과음으로, 움직임을 살펴 첨벙·발소리', () => {
    const game = makeFakeGame({ search: '?audio=1' });
    buildAudio(makeCtx(game) as never);
    globalThis.dispatchEvent(new Event('keydown'));
    const svc = game.audio as AudioService;
    expect(svc.ready).toBe(true);
    game.state.emit({ type: 'unlock', key: 'v:bike' });
    game.state.emit({ type: 'npc-talk', npc: 'npc_quack' });
    expect(svc.log.slice(-2).map((r) => [r.name, r.played])).toEqual([['unlock', true], ['talk-blip', true]]);
    // 다른 섬 폭풍은 천둥 없음(내 자리 날씨가 아님)
    const n0 = svc.log.length;
    game.state.emit({ type: 'weather', region: 'ice', weather: 'storm', prev: 'clear' });
    expect(svc.log.length).toBe(n0);
    // 공중 → 수영 = 첨벙
    game.player.mode = 'air';
    game.tick(1 / 60);
    game.player.mode = 'swim';
    game.tick(1 / 60);
    expect(svc.log.some((r) => r.name === 'splash')).toBe(true);
    // 걷기 → 발소리
    game.player.mode = 'ground';
    game.player.speed = 4;
    game.tick(1 / 60, 60);
    expect(svc.log.filter((r) => r.name.startsWith('step-')).length).toBeGreaterThanOrEqual(2);
    // 곡: 시작 섬 낮 → home
    expect(svc.state().track).toBe('home');
    game.env!.setHour(23);
    (game as unknown as { tick(dt: number, n: number): void }).tick(1 / 60, 40);
    expect(svc.state().track).toBe('home-night');
  });
});
