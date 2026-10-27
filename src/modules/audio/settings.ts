// 소리 크기 설정 — localStorage 'dopamine-land:audio'(계약 v2 7장). 저장소가 막혀 있어도(사생활 모드·테스트) 조용히 기본값.
import type { AudioChannel } from '../../core/api';

export const AUDIO_KEY = 'dopamine-land:audio';

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

export const DEFAULT_SETTINGS: Readonly<AudioSettings> = { master: 0.8, music: 0.5, sfx: 0.9, muted: false };

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** 아무 값이나 받아 고친 설정으로 */
export function sanitize(raw: unknown): AudioSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof AudioSettings, unknown>>;
  return {
    master: clamp01(o.master, DEFAULT_SETTINGS.master),
    music: clamp01(o.music, DEFAULT_SETTINGS.music),
    sfx: clamp01(o.sfx, DEFAULT_SETTINGS.sfx),
    muted: typeof o.muted === 'boolean' ? o.muted : DEFAULT_SETTINGS.muted,
  };
}

/** 저장된 설정 읽기(없거나 망가졌으면 기본값) */
export function loadSettings(): AudioSettings {
  try {
    const s = globalThis.localStorage?.getItem(AUDIO_KEY);
    if (!s) return { ...DEFAULT_SETTINGS };
    return sanitize(JSON.parse(s));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 설정 쓰기(실패해도 게임은 계속) */
export function saveSettings(s: AudioSettings): void {
  try { globalThis.localStorage?.setItem(AUDIO_KEY, JSON.stringify(sanitize(s))); } catch { /* 저장소 막힘 */ }
}

export const isChannel = (c: unknown): c is AudioChannel => c === 'master' || c === 'music' || c === 'sfx';
