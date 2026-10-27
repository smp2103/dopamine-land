// 소리 서비스(AudioApi 구현) — 게임과 떨어져 있어 테스트가 가짜 AudioContext 로 그대로 돌린다.
// AudioContext 는 첫 keydown·pointerdown 에서야 만든다(그 전엔 sfx 를 조용히 버린다). allowed=false(촬영·헤드리스)면 끝까지 안 만든다.
import type { AudioApi, AudioChannel, SfxOpts } from '../../core/api';
import { Synth } from './synth';
import { SFX, hasSfx } from './sfx';
import { MusicPlayer } from './music';
import { AmbienceBank } from './ambience';
import { AMBIENCES, isAmbience, spatialize, type AmbienceName } from './mix';
import { loadSettings, saveSettings, isChannel, type AudioSettings } from './settings';
import { parseTrack, themeTrack, trackKey } from './theory';
import type { Cue } from './cues';

type Ctor = new (opts?: AudioContextOptions) => AudioContext;

export interface ServiceOpts {
  /** false 면 AudioContext 를 절대 만들지 않는다(?shot=1 · 헤드리스) */
  allowed: boolean;
  /** 몸짓을 들을 곳(기본 globalThis) */
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  /** AudioContext 생성자(기본 globalThis.AudioContext ?? webkitAudioContext) */
  ctor?: Ctor | null;
}

export interface LogRow { t: number; name: string; played: boolean; why?: string; vol?: number; pan?: number }

const GESTURES = ['keydown', 'pointerdown'] as const;

export class AudioService implements AudioApi {
  readonly settings: AudioSettings;
  ac: AudioContext | null = null;
  synth: Synth | null = null;
  musicP: MusicPlayer | null = null;
  amb: AmbienceBank | null = null;
  /** 바깥(모듈)이 정해 준 자동 곡 */
  private autoTrack: string | null = null;
  /** music() 로 고정한 곡(undefined = 자동을 따른다, null = 조용히) */
  private forced: string | null | undefined = undefined;
  private autoAmb = new Map<AmbienceName, number>();
  private manualAmb = new Map<AmbienceName, number>();
  private last = new Map<string, number>();
  private warned = new Set<string>();
  /** 듣는 자리 + 카메라 오른쪽 */
  private ear = { x: 0, z: 0, rx: 1, rz: 0, set: false };
  /** 최근 요청 40개(디버그·테스트) */
  readonly log: LogRow[] = [];
  private armed = false;
  private onGesture = () => { this.unlock(); };
  /** AudioContext 가 없을 때 gap·기록에 쓰는 시계(초) */
  private clock = 0;

  constructor(private o: ServiceOpts) {
    this.settings = loadSettings();
  }

  // ───────────── 몸짓 → AudioContext ─────────────
  /** 몸짓 듣기 시작(한 번만) */
  arm() {
    if (this.armed || !this.o.allowed) return;
    const tgt = this.o.target === undefined ? (globalThis as unknown as EventTarget) : this.o.target;
    if (!tgt || typeof tgt.addEventListener !== 'function') return;
    this.armed = true;
    for (const g of GESTURES) tgt.addEventListener(g, this.onGesture, { capture: true } as AddEventListenerOptions);
  }
  private disarm() {
    if (!this.armed) return;
    const tgt = this.o.target === undefined ? (globalThis as unknown as EventTarget) : this.o.target;
    for (const g of GESTURES) tgt?.removeEventListener(g, this.onGesture, { capture: true } as EventListenerOptions);
    this.armed = false;
  }

  /** 몸짓 처리기에서만 부른다. 만들었거나 이미 있으면 true */
  private unlock(): boolean {
    if (!this.o.allowed) return false;
    if (this.ac) { if (this.ac.state === 'suspended') void this.ac.resume().catch(() => {}); return true; }
    const g = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    const C = this.o.ctor ?? g.AudioContext ?? g.webkitAudioContext ?? null;
    if (!C) { this.disarm(); return false; }
    try {
      this.ac = new C({ latencyHint: 'interactive' });
    } catch (e) {
      console.warn('[audio] AudioContext 를 만들 수 없어요', e);
      this.disarm();
      return false;
    }
    this.synth = new Synth(this.ac);
    this.musicP = new MusicPlayer(this.synth);
    this.amb = new AmbienceBank(this.synth);
    this.applyVolumes(true);
    if (this.ac.state === 'suspended') void this.ac.resume().catch(() => {});
    this.disarm();
    // 이미 정해진 곡·환경음을 바로 깐다
    this.musicP.set(this.effectiveTrack(), 1.5);
    this.flushAmbience();
    return true;
  }

  /** 소리가 준비됐나(AudioContext 있음) */
  get ready() { return this.ac !== null; }

  // ───────────── AudioApi ─────────────
  sfx(name: string, o: SfxOpts = {}): void { this.play(name, o, 0); }

  /** cuesFor 결과 하나(지연 포함) */
  cue(c: Cue) { this.play(c.sfx, { x: c.x, z: c.z, vol: c.vol, pitch: c.pitch }, c.delay ?? 0); }

  private play(name: string, o: SfxOpts, delay: number) {
    const def = SFX[name];
    if (!def || !hasSfx(name)) {
      if (!this.warned.has(name)) { this.warned.add(name); console.warn(`[audio] 모르는 효과음 '${name}'`); }
      this.push({ name, played: false, why: 'unknown' });
      return;
    }
    // gap: 같은 소리를 너무 자주(이벤트 겹침) — 요청 시각 + 지연으로 판단
    const now = this.now();
    const at = now + delay;
    const prev = this.last.get(name);
    if (prev !== undefined && Math.abs(at - prev) < (def.gap ?? 0.04)) { this.push({ name, played: false, why: 'gap' }); return; }
    let vol = (def.vol ?? 0.6) * (o.vol ?? 1);
    let pan: number | undefined;
    if (o.x !== undefined && o.z !== undefined && this.ear.set) {
      const sp = spatialize(this.ear.x, this.ear.z, this.ear.rx, this.ear.rz, o.x, o.z);
      if (sp.gain < 0.01) { this.push({ name, played: false, why: 'far' }); return; }
      vol *= sp.gain;
      pan = sp.pan;
    }
    if (!this.synth || !this.ac) { this.push({ name, played: false, why: 'no-context' }); return; }
    if (this.settings.muted) { this.push({ name, played: false, why: 'muted' }); return; }
    this.last.set(name, at);
    const ok = this.synth.play({ name, kind: 'sfx', dest: this.synth.sfx, vol, pitch: o.pitch, pan, delay, send: def.send, build: def.build });
    this.push({ name, played: ok, vol: Math.round(vol * 100) / 100, pan });
  }

  music(track: string | null): void {
    if (track === null) this.forced = null;
    else if (track === 'auto' || track === '') this.forced = undefined;
    else {
      const p = parseTrack(track);
      if (p) this.forced = trackKey(p.id, p.night);
      else if (/^[a-z-]+$/.test(track)) {
        // 섬 테마 이름(islet 등)도 받는다
        const night = track.endsWith('-night');
        this.forced = trackKey(themeTrack(night ? track.slice(0, -6) : track), night);
      } else { console.warn(`[audio] 모르는 곡 '${track}'`); return; }
    }
    this.musicP?.set(this.effectiveTrack());
  }

  ambience(name: string, level: number): void {
    if (!isAmbience(name)) {
      if (!this.warned.has(`amb:${name}`)) { this.warned.add(`amb:${name}`); console.warn(`[audio] 모르는 환경음 '${name}' (있는 것: ${AMBIENCES.join(', ')})`); }
      return;
    }
    const lv = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    if (lv <= 0) this.manualAmb.delete(name); else this.manualAmb.set(name, lv);
    this.applyAmb(name);
  }

  setVolume(ch: AudioChannel, v: number): void {
    if (!isChannel(ch) || !Number.isFinite(v)) return;
    this.settings[ch] = Math.max(0, Math.min(1, v));
    saveSettings(this.settings);
    this.applyVolumes();
  }

  mute(on?: boolean): boolean {
    this.settings.muted = on === undefined ? !this.settings.muted : !!on;
    saveSettings(this.settings);
    this.applyVolumes();
    return this.settings.muted;
  }

  // ───────────── 모듈이 매 프레임 넣어 주는 것 ─────────────
  /** 자동 곡(섬·시간대·세계로 정한 것) */
  setAutoTrack(key: string | null) {
    if (key === this.autoTrack) return;
    this.autoTrack = key;
    if (this.forced === undefined) this.musicP?.set(this.effectiveTrack());
  }
  /** 자동 환경음 크기들 */
  setAutoAmbience(levels: Partial<Record<AmbienceName, number>>) {
    for (const n of AMBIENCES) {
      const v = levels[n] ?? 0;
      if (Math.abs((this.autoAmb.get(n) ?? 0) - v) < 0.005) continue;
      this.autoAmb.set(n, v);
      this.applyAmb(n);
    }
  }
  /** 듣는 자리(플레이어)와 카메라 오른쪽 방향 */
  setListener(x: number, z: number, rx: number, rz: number) {
    this.ear.x = x; this.ear.z = z; this.ear.rx = rx; this.ear.rz = rz; this.ear.set = true;
  }
  /** 매 프레임 */
  update(dt: number) {
    this.clock += Math.max(0, dt);
    if (!this.ac) return;
    const now = this.ac.currentTime;
    this.musicP?.update(now);
    this.amb?.update(now);
  }

  /** 탭이 숨으면 쉬고, 돌아오면 다시 */
  setHidden(hidden: boolean) {
    if (!this.ac) return;
    if (hidden && this.ac.state === 'running') void this.ac.suspend().catch(() => {});
    else if (!hidden && this.ac.state === 'suspended') void this.ac.resume().catch(() => {});
  }

  // ───────────── 안쪽 ─────────────
  effectiveTrack(): string | null { return this.forced !== undefined ? this.forced : this.autoTrack; }
  private ambLevel(n: AmbienceName) { return Math.max(this.autoAmb.get(n) ?? 0, this.manualAmb.get(n) ?? 0); }
  private applyAmb(n: AmbienceName) { this.amb?.set(n, this.ambLevel(n)); }
  private flushAmbience() { for (const n of AMBIENCES) this.applyAmb(n); }
  ambienceTargets(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const n of AMBIENCES) { const v = this.ambLevel(n); if (v > 0) o[n] = Math.round(v * 100) / 100; }
    return o;
  }

  private applyVolumes(instant = false) {
    const s = this.synth;
    if (!s || !this.ac) return;
    const now = this.ac.currentTime;
    const set = (p: AudioParam, v: number) => {
      if (instant) { p.cancelScheduledValues(now); p.setValueAtTime(v, now); } else p.setTargetAtTime(v, now, 0.05);
    };
    set(s.master.gain, this.settings.muted ? 0 : this.settings.master);
    set(s.music.gain, this.settings.music);
    set(s.sfx.gain, this.settings.sfx);
    set(s.amb.gain, this.settings.sfx * 0.85);
  }

  private now() { return this.ac ? this.ac.currentTime : this.clock; }
  private push(r: Omit<LogRow, 't'>) {
    this.log.push({ t: Math.round(this.now() * 1000) / 1000, ...r });
    if (this.log.length > 40) this.log.shift();
  }

  /** 디버그 상태 */
  state() {
    return {
      allowed: this.o.allowed,
      context: this.ac ? this.ac.state : 'none',
      armed: this.armed,
      settings: { ...this.settings },
      track: this.effectiveTrack(),
      forced: this.forced === undefined ? 'auto' : this.forced,
      lanes: this.musicP?.lanesInfo() ?? [],
      voices: this.synth?.active() ?? 0,
      stolen: this.synth?.stolen ?? 0,
      dropped: this.synth?.dropped ?? 0,
      ambience: this.ambienceTargets(),
      ambienceLive: this.amb?.live() ?? {},
    };
  }

  dispose() {
    this.disarm();
    this.musicP?.stopAll();
    this.amb?.stopAll();
    this.synth?.stopAll();
    if (this.ac) void this.ac.close().catch(() => {});
    this.ac = null; this.synth = null; this.musicP = null; this.amb = null;
  }
}
