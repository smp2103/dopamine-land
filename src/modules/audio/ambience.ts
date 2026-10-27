// 환경음 고리 — 바다·비·폭풍·바람·귀뚜라미·달 울림·배 엔진·활공 바람·물속. 전부 소음/발진기 합성.
// 크기가 0 이면 3초 뒤 노드를 멈추고 버린다(안 들리는 고리에 CPU 를 쓰지 않게). 다시 필요하면 새로 만든다.
import type { Synth } from './synth';
import type { AmbienceName } from './mix';

interface Loop {
  out: GainNode;
  srcs: AudioScheduledSourceNode[];
  /** 크기·속도에 따라 소리 모양 바꾸기(선택) */
  shape?: (level: number, now: number) => void;
}
interface Slot { loop: Loop | null; level: number; quietSince: number }

/** 고리 하나 만들기 — 출력(out)은 크기 0 에서 시작 */
type Make = (s: Synth) => Loop;

function noiseSrc(s: Synth, offset: number): AudioBufferSourceNode {
  const src = s.ac.createBufferSource();
  src.buffer = s.noiseBuf;
  src.loop = true;
  src.start(s.ac.currentTime, offset);
  return src;
}
function filter(s: Synth, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = s.ac.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  return f;
}
function gain(s: Synth, v: number): GainNode { const g = s.ac.createGain(); g.gain.value = v; return g; }
/** 느린 흔들개: param 에 ±depth 를 더한다 */
function lfo(s: Synth, rate: number, depth: number, param: AudioParam, type: OscillatorType = 'sine'): OscillatorNode {
  const o = s.ac.createOscillator();
  o.type = type; o.frequency.value = rate;
  const g = gain(s, depth);
  o.connect(g); g.connect(param);
  o.start();
  return o;
}

const MAKE: Record<AmbienceName, Make> = {
  // 파도: 낮게 거른 소음이 9초 주기로 밀려왔다 빠지고, 위에 거품 쉬익
  sea: (s) => {
    const out = gain(s, 0);
    const n1 = noiseSrc(s, 0.1), n2 = noiseSrc(s, 0.9);
    const lp = filter(s, 'lowpass', 520);
    const swell = gain(s, 0.55);
    const hp = filter(s, 'bandpass', 2600, 0.6);
    const foam = gain(s, 0.08);
    n1.connect(lp); lp.connect(swell); swell.connect(out);
    n2.connect(hp); hp.connect(foam); foam.connect(out);
    const l1 = lfo(s, 0.11, 0.42, swell.gain);
    const l2 = lfo(s, 0.11, 0.07, foam.gain);
    const l3 = lfo(s, 0.07, 180, lp.frequency);
    out.connect(s.amb);
    return { out, srcs: [n1, n2, l1, l2, l3] };
  },
  // 비: 높게 거른 쏴아 + 낮은 웅웅
  rain: (s) => {
    const out = gain(s, 0);
    const n = noiseSrc(s, 0.4), m = noiseSrc(s, 1.2);
    const hp = filter(s, 'highpass', 1400), lp = filter(s, 'lowpass', 7000);
    const hiss = gain(s, 0.5);
    const low = filter(s, 'lowpass', 700), lowG = gain(s, 0.25);
    n.connect(hp); hp.connect(lp); lp.connect(hiss); hiss.connect(out);
    m.connect(low); low.connect(lowG); lowG.connect(out);
    const l = lfo(s, 0.23, 0.08, hiss.gain);
    out.connect(s.amb);
    return { out, srcs: [n, m, l] };
  },
  // 폭풍: 아주 낮은 우르릉(천둥은 audio.ts 가 따로 때린다)
  storm: (s) => {
    const out = gain(s, 0);
    const n = noiseSrc(s, 0.7);
    const lp = filter(s, 'lowpass', 220, 1.2);
    const g = gain(s, 0.8);
    n.connect(lp); lp.connect(g); g.connect(out);
    const l1 = lfo(s, 0.05, 0.4, g.gain);
    const l2 = lfo(s, 0.031, 80, lp.frequency);
    out.connect(s.amb);
    return { out, srcs: [n, l1, l2] };
  },
  // 바람: 띠 통과 소음, 주파수·크기가 천천히 흔들림
  wind: (s) => {
    const out = gain(s, 0);
    const n = noiseSrc(s, 1.6);
    const bp = filter(s, 'bandpass', 480, 0.9);
    const g = gain(s, 0.6);
    n.connect(bp); bp.connect(g); g.connect(out);
    const l1 = lfo(s, 0.07, 260, bp.frequency);
    const l2 = lfo(s, 0.13, 0.35, g.gain);
    out.connect(s.amb);
    return { out, srcs: [n, l1, l2] };
  },
  // 귀뚜라미 둘: 4.3·4.8 kHz 사인을 빠른 사각 떨림 × 느린 찌르르 문으로
  crickets: (s) => {
    const out = gain(s, 0);
    const srcs: AudioScheduledSourceNode[] = [];
    for (const [fr, trem, chirp, pan] of [[4300, 32, 1.4, -0.5], [4820, 27, 1.05, 0.55]] as const) {
      const o = s.ac.createOscillator();
      o.frequency.value = fr;
      const g1 = gain(s, 0.5), g2 = gain(s, 0.5), lvl = gain(s, 0.06);
      o.connect(g1); g1.connect(g2); g2.connect(lvl);
      let tail: AudioNode = lvl;
      if (typeof s.ac.createStereoPanner === 'function') { const p = s.ac.createStereoPanner(); p.pan.value = pan; lvl.connect(p); tail = p; }
      tail.connect(out);
      o.start();
      srcs.push(o, lfo(s, trem, 0.5, g1.gain, 'square'), lfo(s, chirp, 0.5, g2.gain, 'square'));
    }
    out.connect(s.amb);
    return { out, srcs };
  },
  // 달 울림: 낮은 사인 셋(살짝 어긋나 맥놀이) + 아주 느린 숨
  'moon-hum': (s) => {
    const out = gain(s, 0);
    const lp = filter(s, 'lowpass', 420);
    const g = gain(s, 0.7);
    const srcs: AudioScheduledSourceNode[] = [];
    for (const [fr, v] of [[55, 0.5], [82.6, 0.3], [110.4, 0.18], [220.9, 0.05]] as const) {
      const o = s.ac.createOscillator();
      o.frequency.value = fr;
      const og = gain(s, v);
      o.connect(og); og.connect(lp);
      o.start();
      srcs.push(o);
    }
    lp.connect(g); g.connect(out);
    srcs.push(lfo(s, 0.045, 0.25, g.gain));
    out.connect(s.music); // 달에선 음악 버스 쪽 — 음악 크기를 따라간다
    return { out, srcs };
  },
  // 배 엔진: 톱니 + 통통통 떨림. 속도(level)에 따라 음높이·떨림 빠르기가 오른다
  'boat-engine': (s) => {
    const out = gain(s, 0);
    const o = s.ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 48;
    const lp = filter(s, 'lowpass', 360, 1.4);
    const chug = gain(s, 0.6);
    o.connect(lp); lp.connect(chug); chug.connect(out);
    const tr = s.ac.createOscillator();
    tr.frequency.value = 8;
    const trG = gain(s, 0.4);
    tr.connect(trG); trG.connect(chug.gain);
    tr.start();
    const n = noiseSrc(s, 0.3);
    const nf = filter(s, 'bandpass', 900, 0.8), ng = gain(s, 0.1);
    n.connect(nf); nf.connect(ng); ng.connect(out);
    o.start();
    out.connect(s.amb);
    return {
      out, srcs: [o, tr, n],
      shape: (lv, now) => {
        o.frequency.setTargetAtTime(38 + lv * 46, now, 0.25);
        tr.frequency.setTargetAtTime(6 + lv * 10, now, 0.25);
        lp.frequency.setTargetAtTime(280 + lv * 380, now, 0.25);
      },
    };
  },
  // 활공 바람: 더 높고 빠른 바람, 속도에 따라 밝아진다
  'glide-wind': (s) => {
    const out = gain(s, 0);
    const n = noiseSrc(s, 1.1);
    const bp = filter(s, 'bandpass', 1000, 1.1);
    const g = gain(s, 0.55);
    n.connect(bp); bp.connect(g); g.connect(out);
    const l = lfo(s, 0.4, 0.2, g.gain);
    out.connect(s.amb);
    return { out, srcs: [n, l], shape: (lv, now) => bp.frequency.setTargetAtTime(700 + lv * 1300, now, 0.3) };
  },
  // 물속: 먹먹한 저음 + 가끔 웅
  underwater: (s) => {
    const out = gain(s, 0);
    const n = noiseSrc(s, 0.2);
    const lp = filter(s, 'lowpass', 320, 2);
    const g = gain(s, 0.8);
    n.connect(lp); lp.connect(g); g.connect(out);
    const l = lfo(s, 0.09, 120, lp.frequency);
    out.connect(s.amb);
    return { out, srcs: [n, l] };
  },
};

/** 고리별 크기 맞춤(크기 1 에서 음악과 어울리게 — 오프라인 렌더로 잰 RMS 기준) */
const TRIM: Record<AmbienceName, number> = {
  sea: 0.36, rain: 0.23, storm: 0.36, wind: 0.44, crickets: 0.8, 'moon-hum': 0.14, 'boat-engine': 0.22, 'glide-wind': 0.31, underwater: 0.39,
};

export class AmbienceBank {
  private slots = new Map<AmbienceName, Slot>();
  constructor(private s: Synth) {}

  /** 목표 크기로(부드럽게, 시간 상수 0.7초) */
  set(name: AmbienceName, level: number, now = this.s.ac.currentTime) {
    const lv = Math.max(0, Math.min(1, level));
    let slot = this.slots.get(name);
    if (!slot) { slot = { loop: null, level: 0, quietSince: now }; this.slots.set(name, slot); }
    if (lv > 0.001 && !slot.loop) slot.loop = MAKE[name](this.s);
    if (slot.loop && Math.abs(lv - slot.level) > 0.002) {
      slot.loop.out.gain.setTargetAtTime(lv * TRIM[name], now, 0.7);
      slot.loop.shape?.(lv, now);
    }
    if (lv > 0.001) slot.quietSince = Infinity;
    else if (slot.level > 0.001 || slot.quietSince === Infinity) slot.quietSince = now;
    slot.level = lv;
  }

  /** 오래 조용한 고리 버리기 */
  update(now = this.s.ac.currentTime) {
    for (const slot of this.slots.values()) {
      if (!slot.loop || slot.level > 0.001 || now - slot.quietSince < 3.5) continue;
      for (const src of slot.loop.srcs) { try { src.stop(); } catch { /* 이미 멈춤 */ } }
      try { slot.loop.out.disconnect(); } catch { /* 이미 끊김 */ }
      slot.loop = null;
    }
  }

  /** 지금 소리 내는(노드가 살아 있는) 고리와 크기 */
  live(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const [k, v] of this.slots) if (v.loop) o[k] = Math.round(v.level * 100) / 100;
    return o;
  }

  stopAll() {
    for (const slot of this.slots.values()) {
      if (!slot.loop) continue;
      for (const src of slot.loop.srcs) { try { src.stop(); } catch { /* */ } }
      try { slot.loop.out.disconnect(); } catch { /* */ }
      slot.loop = null;
      slot.level = 0;
    }
  }
}
