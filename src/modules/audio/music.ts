// 음악 재생기 — theory.barNotes 를 8분음표 칸마다 앞서(0.25초) 예약한다. 곡이 바뀌면 3초 겹쳐 바꾼다(크로스페이드).
// 한 칸의 음표들은 목소리 하나로 묶는다(동시 24 안에서 음악이 자리를 덜 먹게). 탭이 숨었다 돌아오면 박자를 지금으로 다시 맞춘다.
import type { Synth } from './synth';
import { barNotes, parseTrack, stepSec, STEPS_PER_BAR, TRACKS, type Note, type TrackDef } from './theory';
import { playNote } from './patches';

export const CROSSFADE = 3;
const LOOKAHEAD = 0.25;
/** 곡 줄 → 음악 잔향 보내기 */
export const MUSIC_SEND = 0.4;

interface Lane {
  key: string;
  def: TrackDef;
  night: boolean;
  gain: GainNode;
  /** 잔향 보내기(gain 뒤) */
  send: GainNode;
  /** 다음에 예약할 칸(곡 시작부터 센 칸 번호) */
  step: number;
  /** 그 칸의 시각 */
  at: number;
  stepSec: number;
  /** 그 마디 음표(칸별로 묶어 둔 것) */
  barCache: { bar: number; bySteps: Note[][] } | null;
  /** 지우는 중이면 그 시각에 버린다 */
  dieAt: number | null;
}

export class MusicPlayer {
  private lanes: Lane[] = [];
  /** 지금 들리는(또는 들어오는) 곡 키 */
  current: string | null = null;
  constructor(private s: Synth) {}

  /** 곡 바꾸기(null = 조용히). 같은 곡이면 그대로 */
  set(key: string | null, fade = CROSSFADE) {
    if (key === this.current) return;
    const now = this.s.ac.currentTime;
    for (const L of this.lanes) {
      if (L.dieAt !== null) continue;
      const g = L.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.0001, now + fade);
      L.dieAt = now + fade + 0.1;
    }
    this.current = key;
    if (!key) return;
    const tr = parseTrack(key);
    if (!tr) return;
    const def = TRACKS[tr.id];
    const gain = this.s.ac.createGain();
    // 밤 변주는 더 작게
    const level = tr.night ? 0.72 : 1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + fade);
    gain.connect(this.s.music);
    // 잔향은 줄 크기 뒤에서 보낸다 → 크로스페이드·밤 크기·음악 음소거가 젖은 소리에도 걸린다
    const send = this.s.ac.createGain();
    send.gain.value = MUSIC_SEND;
    gain.connect(send);
    send.connect(this.s.musicVerb);
    this.lanes.push({ key, def, night: tr.night, gain, send, step: 0, at: now + 0.08, stepSec: stepSec(def, tr.night), barCache: null, dieAt: null });
  }

  /** 매 프레임: 앞으로 0.25초 안의 칸을 예약 */
  update(now = this.s.ac.currentTime) {
    if (!this.lanes.length) return;
    const keep: Lane[] = [];
    for (const L of this.lanes) {
      if (L.dieAt !== null && now >= L.dieAt) { try { L.gain.disconnect(); L.send.disconnect(); } catch { /* */ } continue; }
      keep.push(L);
      // 멈췄다 돌아옴(탭 숨김) — 밀린 칸은 건너뛰고 지금부터
      if (L.at < now - 0.2) {
        const skip = Math.ceil((now - L.at) / L.stepSec);
        L.step += skip;
        L.at += skip * L.stepSec;
      }
      let guard = 0;
      while (L.at < now + LOOKAHEAD && guard++ < 16) {
        if (L.dieAt === null || L.at < L.dieAt) this.schedule(L, L.step, L.at);
        L.step++;
        L.at += L.stepSec;
      }
    }
    this.lanes = keep;
  }

  private schedule(L: Lane, step: number, at: number) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    if (!L.barCache || L.barCache.bar !== bar) {
      const by: Note[][] = Array.from({ length: STEPS_PER_BAR }, () => []);
      for (const n of barNotes(L.def.id, bar, L.night)) by[n.step].push(n);
      L.barCache = { bar, bySteps: by };
    }
    const notes = L.barCache.bySteps[s];
    if (!notes.length) return;
    const patch = L.def.patch;
    const sec = L.stepSec;
    this.s.play({
      name: `music:${L.def.id}`, kind: 'music', dest: L.gain, vol: 1, when: at,
      build: (k) => { for (const n of notes) playNote(k, patch, n, sec); },
    });
  }

  /** 살아 있는 곡 줄(디버그) */
  lanesInfo() { return this.lanes.map((L) => ({ key: L.key, step: L.step, fading: L.dieAt !== null })); }

  stopAll() {
    for (const L of this.lanes) { try { L.gain.disconnect(); L.send.disconnect(); } catch { /* */ } }
    this.lanes = [];
    this.current = null;
  }
}
