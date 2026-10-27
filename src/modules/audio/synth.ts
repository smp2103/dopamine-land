// 합성 엔진 — AudioContext 하나 위에 버스(음악·효과음·환경음)·압축기·생성 잔향(임펄스도 rngFor 로 만든다)·목소리 풀(동시 24).
// 잔향은 버스마다 하나씩(음악·효과음) 두고, 젖은 소리를 그 버스로 되돌린다 → 음악/효과음 크기를 0 으로 하면 잔향까지 같이 꺼진다.
// 소리 조각(tone·noise·fm)은 Kit 으로 묶어 sfx.ts·patches.ts 가 쓴다. 바깥 파일·샘플은 하나도 없다(CONTRACT 규칙 4).
import { rngFor } from '../../core/rng';

/** 동시에 울리는 일회성 목소리 수(효과음 + 음악 음표). 넘치면 음악부터 빠지고, 그다음 오래된 효과음을 뺏는다 */
export const POLYPHONY = 24;

export type VoiceKind = 'sfx' | 'music';
interface Voice {
  kind: VoiceKind;
  gain: GainNode;
  pan: StereoPannerNode | null;
  srcs: AudioScheduledSourceNode[];
  start: number;
  end: number;
  name: string;
}

export interface ToneOpts {
  type?: OscillatorType;
  /** 시작 주파수(Hz) */
  f: number;
  /** 끝 주파수(주면 지수로 미끄러진다) */
  f2?: number;
  /** 시작(초, 목소리 시작 기준) */
  at?: number;
  /** 길이(초) — 붙임(a)·뗌 포함 */
  len: number;
  /** 붙임 시간 */
  a?: number;
  /** 최고 세기 */
  peak?: number;
  /** 감쇠 곡선: exp(기본, 툭 떨어짐) · lin · hold(평평하다 끝에서만 뗌) */
  curve?: 'exp' | 'lin' | 'hold';
  detune?: number;
  /** 저역 통과(Hz) */
  lp?: number;
  /** 비브라토 [Hz, 센트] */
  vib?: [number, number];
  /** 연결할 곳(기본 목소리 출력) */
  to?: AudioNode;
}
export interface NoiseOpts {
  at?: number;
  len: number;
  a?: number;
  peak?: number;
  curve?: 'exp' | 'lin' | 'hold';
  filter?: BiquadFilterType;
  /** 필터 주파수(시작) */
  f?: number;
  /** 필터 주파수(끝) */
  f2?: number;
  q?: number;
  to?: AudioNode;
}
export interface FmOpts {
  f: number;
  /** 변조기/반송파 비 */
  ratio: number;
  /** 변조 깊이(반송파 Hz 배율) */
  index: number;
  at?: number;
  len: number;
  a?: number;
  peak?: number;
  to?: AudioNode;
}

/** 소리 하나를 만드는 동안 쓰는 도구 상자 */
export interface Kit {
  ac: BaseAudioContext;
  /** 목소리 시작 시각(ac.currentTime 기준 절대) */
  t: number;
  /** 목소리 출력 */
  out: AudioNode;
  /** 높이 배율(sfx o.pitch) */
  p: number;
  /** 이 소리 전용 결정적 난수 */
  rng: () => number;
  tone(o: ToneOpts): OscillatorNode;
  noise(o: NoiseOpts): AudioBufferSourceNode;
  fm(o: FmOpts): void;
  /** MIDI 음을 차례로(아르페지오): 간격 step 초 */
  arp(midis: number[], step: number, o: Omit<ToneOpts, 'f' | 'at'> & { at?: number }): void;
  /** 이 소리의 끝(초, 상대) — 조각들이 저절로 늘린다 */
  end: number;
}

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** 발진기 주파수는 1Hz~18kHz 로(높이 배율이 커도 나이퀴스트를 넘지 않게) */
const fq = (f: number) => (f < 1 ? 1 : f > 18000 ? 18000 : f);

/** 엔벨로프: 0 → peak(a) → 감쇠(len) */
function envelope(g: AudioParam, t: number, a: number, len: number, peak: number, curve: 'exp' | 'lin' | 'hold') {
  const pk = Math.max(0.0002, peak);
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(pk, t + a);
  const tEnd = t + Math.max(a + 0.005, len);
  if (curve === 'exp') g.exponentialRampToValueAtTime(0.0001, tEnd);
  else if (curve === 'lin') g.linearRampToValueAtTime(0.0001, tEnd);
  else {
    const rel = Math.min(0.08, (len - a) * 0.4);
    g.setValueAtTime(pk, tEnd - rel);
    g.linearRampToValueAtTime(0.0001, tEnd);
  }
}

export class Synth {
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly amb: GainNode;
  /** 효과음 잔향 입력(보내기) — 젖은 소리는 sfx 버스로 돌아간다 */
  readonly verb: GainNode;
  /** 음악 잔향 입력 — 곡 줄(lane) 크기 뒤에서 보내고, 젖은 소리는 music 버스로 돌아간다 */
  readonly musicVerb: GainNode;
  readonly comp: DynamicsCompressorNode;
  readonly noiseBuf: AudioBuffer;
  private voices: Voice[] = [];
  /** 지금까지 뺏긴 목소리 수(디버그) */
  stolen = 0;
  /** 음악 음표를 못 낸 수(자리가 없어서) */
  dropped = 0;
  private seq = 0;

  constructor(readonly ac: AudioContext) {
    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.comp.connect(ac.destination);
    this.master = ac.createGain();
    this.master.connect(this.comp);
    this.music = ac.createGain();
    this.sfx = ac.createGain();
    this.amb = ac.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.amb.connect(this.master);

    // 공용 흰 소음 2초(결정적)
    const n = Math.floor(ac.sampleRate * 2);
    this.noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    const r = rngFor('audio:noise');
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;

    // 잔향: 스테레오 지수 감쇠 소음 임펄스 2.2초(한 번 만들어 두 버스가 같이 쓴다)
    const ir = this.impulse(2.2, 3.2);
    this.verb = this.reverb(ir, this.sfx);
    this.musicVerb = this.reverb(ir, this.music);
  }

  /** 잔향 한 벌: 입력 → 컨볼버 → 젖음 0.32 → 돌려보낼 버스(버스 크기·음소거가 잔향에도 걸린다) */
  private reverb(ir: AudioBuffer, bus: AudioNode): GainNode {
    const ac = this.ac;
    const conv = ac.createConvolver();
    conv.buffer = ir;
    const input = ac.createGain();
    input.gain.value = 1;
    const wet = ac.createGain();
    wet.gain.value = 0.32;
    input.connect(conv);
    conv.connect(wet);
    wet.connect(bus);
    return input;
  }

  private impulse(sec: number, decay: number): AudioBuffer {
    const ac = this.ac;
    const n = Math.floor(ac.sampleRate * sec);
    const buf = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const r = rngFor(`audio:reverb:${c}`);
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const x = i / n;
        // 앞쪽 18ms 는 비워 초기 반사와 분리, 뒤로 갈수록 어둡게(두 번 평균)
        d[i] = i < ac.sampleRate * 0.018 ? 0 : (r() * 2 - 1) * Math.pow(1 - x, decay);
      }
      for (let i = 1; i < n; i++) d[i] = d[i] * 0.6 + d[i - 1] * 0.4;
    }
    return buf;
  }

  /** 지금 살아 있는 목소리 수 */
  active(now = this.ac.currentTime): number { this.prune(now); return this.voices.length; }
  /** 끝난 목소리 정리 */
  prune(now = this.ac.currentTime) {
    if (!this.voices.length) return;
    const keep: Voice[] = [];
    for (const v of this.voices) {
      if (v.end + 0.05 < now) { try { v.gain.disconnect(); v.pan?.disconnect(); } catch { /* 이미 끊김 */ } }
      else keep.push(v);
    }
    this.voices = keep;
  }
  private steal(v: Voice, now: number) {
    const g = v.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.0001, now + 0.03);
    for (const s of v.srcs) { try { s.stop(now + 0.04); } catch { /* 이미 멈춤 */ } }
    v.end = now + 0.04;
    this.stolen++;
  }

  /**
   * 목소리 하나를 잡아 소리를 만든다. build 가 Kit 으로 조각을 깔면 끝 시각이 정해진다.
   * 자리가 없으면 음악은 포기(null), 효과음은 가장 오래된 음악 → 가장 오래된 효과음을 뺏는다.
   * send 는 그 종류의 잔향(효과음 → verb, 음악 → musicVerb)으로 간다. 음악은 곡 줄 크기를 타야 해서
   * 보통 목소리마다 보내지 않고 MusicPlayer 가 줄 뒤에서 보낸다.
   */
  play(o: {
    name: string; kind: VoiceKind; dest: AudioNode; vol: number; pitch?: number; pan?: number; delay?: number; send?: number; when?: number;
    build: (k: Kit) => void;
  }): boolean {
    const ac = this.ac;
    const now = ac.currentTime;
    this.prune(now);
    const live = this.voices.filter((v) => v.end > now);
    if (live.length >= POLYPHONY) {
      if (o.kind === 'music') { this.dropped++; return false; }
      const victim = live.find((v) => v.kind === 'music') ?? live.reduce((a, b) => (a.start <= b.start ? a : b));
      this.steal(victim, now);
      this.voices = this.voices.filter((v) => v !== victim);
    }
    const t = Math.max(now, o.when ?? now) + (o.delay ?? 0);
    const gain = ac.createGain();
    gain.gain.value = o.vol;
    let pan: StereoPannerNode | null = null;
    if (o.pan !== undefined && Math.abs(o.pan) > 0.02 && typeof ac.createStereoPanner === 'function') {
      pan = ac.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, o.pan));
      gain.connect(pan);
      pan.connect(o.dest);
    } else {
      gain.connect(o.dest);
    }
    if (o.send) {
      const s = ac.createGain();
      s.gain.value = o.send;
      (pan ?? gain).connect(s);
      s.connect(o.kind === 'music' ? this.musicVerb : this.verb);
    }
    const v: Voice = { kind: o.kind, gain, pan, srcs: [], start: t, end: t + 0.1, name: o.name };
    const kit = this.kit(gain, t, o.pitch ?? 1, `${o.name}:${this.seq++}`, v);
    o.build(kit);
    v.end = t + kit.end;
    this.voices.push(v);
    return true;
  }

  private kit(out: AudioNode, t: number, p: number, key: string, v: Voice): Kit {
    const ac = this.ac;
    const noiseBuf = this.noiseBuf;
    const k: Kit = {
      ac, t, out, p, rng: rngFor(`audio:sfx:${key}`), end: 0.05,
      tone(o) {
        const at = t + (o.at ?? 0);
        const osc = ac.createOscillator();
        osc.type = o.type ?? 'sine';
        osc.frequency.setValueAtTime(fq(o.f), at);
        if (o.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(fq(o.f2), at + o.len);
        if (o.detune) osc.detune.value = o.detune;
        const g = ac.createGain();
        envelope(g.gain, at, o.a ?? 0.005, o.len, o.peak ?? 0.3, o.curve ?? 'exp');
        let head: AudioNode = osc;
        if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); head = f; }
        head.connect(g);
        g.connect(o.to ?? out);
        if (o.vib) {
          const lfo = ac.createOscillator();
          const lg = ac.createGain();
          lfo.frequency.value = o.vib[0];
          lg.gain.value = o.vib[1];
          lfo.connect(lg); lg.connect(osc.detune);
          lfo.start(at); lfo.stop(at + o.len + 0.02);
          v.srcs.push(lfo);
        }
        osc.start(at);
        osc.stop(at + o.len + 0.02);
        v.srcs.push(osc);
        k.end = Math.max(k.end, (o.at ?? 0) + o.len + 0.02);
        return osc;
      },
      noise(o) {
        const at = t + (o.at ?? 0);
        const src = ac.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        const g = ac.createGain();
        envelope(g.gain, at, o.a ?? 0.003, o.len, o.peak ?? 0.3, o.curve ?? 'exp');
        let head: AudioNode = src;
        if (o.filter) {
          const f = ac.createBiquadFilter();
          f.type = o.filter;
          f.frequency.setValueAtTime(o.f ?? 1000, at);
          if (o.f2 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), at + o.len);
          f.Q.value = o.q ?? 0.8;
          src.connect(f); head = f;
        }
        head.connect(g);
        g.connect(o.to ?? out);
        // 같은 버퍼라도 시작점을 흩어 매번 다른 결
        src.start(at, k.rng() * 1.5);
        src.stop(at + o.len + 0.02);
        v.srcs.push(src);
        k.end = Math.max(k.end, (o.at ?? 0) + o.len + 0.02);
        return src;
      },
      fm(o) {
        const at = t + (o.at ?? 0);
        const car = ac.createOscillator();
        const mod = ac.createOscillator();
        const mg = ac.createGain();
        car.frequency.value = fq(o.f);
        mod.frequency.value = fq(o.f * o.ratio);
        // 변조 깊이도 감쇠 → 치는 순간만 쨍
        mg.gain.setValueAtTime(o.f * o.index, at);
        mg.gain.exponentialRampToValueAtTime(Math.max(0.01, o.f * o.index * 0.05), at + o.len);
        mod.connect(mg); mg.connect(car.frequency);
        const g = ac.createGain();
        envelope(g.gain, at, o.a ?? 0.002, o.len, o.peak ?? 0.25, 'exp');
        car.connect(g); g.connect(o.to ?? out);
        car.start(at); mod.start(at);
        car.stop(at + o.len + 0.02); mod.stop(at + o.len + 0.02);
        v.srcs.push(car, mod);
        k.end = Math.max(k.end, (o.at ?? 0) + o.len + 0.02);
      },
      arp(midis, step, o) {
        midis.forEach((m, i) => k.tone({ ...o, f: hz(m) * p, at: (o.at ?? 0) + i * step }));
      },
    };
    return k;
  }

  /** 모든 일회성 목소리 즉시 멈춤 */
  stopAll() {
    const now = this.ac.currentTime;
    for (const v of this.voices) this.steal(v, now);
    this.voices = [];
  }
  /** 디버그: 살아 있는 목소리 이름 */
  liveNames(): string[] { const now = this.ac.currentTime; return this.voices.filter((v) => v.end > now).map((v) => v.name); }
}

export { hz };
