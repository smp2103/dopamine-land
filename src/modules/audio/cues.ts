// 이벤트 → 효과음 표(순수). state 이벤트 하나를 받아 "무슨 소리를, 어디서, 언제" 목록으로 바꾼다.
// WebAudio 를 모른다 → tests/audio.test.ts 가 그대로 확인한다. 실제로 울리는 건 audio.ts 가.
import type { LooseEvent } from '../../core/events';
import { hashString } from '../../core/rng';

export interface Cue {
  sfx: string;
  vol?: number;
  pitch?: number;
  /** 소리 난 자리(있으면 거리로 줄어든다) */
  x?: number;
  z?: number;
  /** 몇 초 뒤에 */
  delay?: number;
}

/** 주민별 말소리 높이(배율). 표에 없으면 이름 해시로 0.8~1.35 */
export const NPC_PITCH: Readonly<Record<string, number>> = {
  npc_quack: 1.25, // 꽥사장 — 꽥꽥 높게
  npc_slow: 0.62, // 느릿 관장 — 낮고 느릿
  npc_peng: 1.1,
  npc_mongsil: 0.85, // 곰 — 둥글게
  npc_tongtong: 1.05,
  npc_peli: 0.78,
  npc_bodeul: 1.3, // 수다쟁이 수달
  npc_pro: 0.92,
  npc_toto: 1.5, // 삐융!
  npc_grandma: 0.7,
  npc_camel: 0.8,
  npc_raccoon: 1.15,
  npc_tteoksun: 1.35,
  npc_kkumul: 0.95,
  npc_sheep: 1.2,
};
export function npcPitch(npc: string | undefined | null): number {
  if (!npc) return 1;
  const p = NPC_PITCH[npc];
  if (p !== undefined) return p;
  return 0.8 + (hashString(`npc:${npc}`) % 1000) / 1000 * 0.55;
}

/** 희귀도 → 잡았다 소리 */
export const catchSfx = (rarity: number) => `catch-${Math.max(1, Math.min(5, Math.round(rarity) || 1))}`;

/** 상자 등급 → 흔들림 횟수(5.4: 나무 1 · 은 2 · 금 이상 3) */
export const CHEST_SHAKES: Readonly<Record<string, number>> = { wood: 1, silver: 2, gold: 3, rainbow: 3, space: 3 };
export const CHEST_TIERS = ['wood', 'silver', 'gold', 'rainbow', 'space'] as const;

/** 채집 종류 → 소리 */
export const HARVEST_SFX: Readonly<Record<string, string>> = {
  chop: 'chop', rock: 'rock-break', shake: 'shake-leaves', fruit: 'fruit-drop', dig: 'dig', crater: 'dig',
  balloon: 'balloon-pop', bottle: 'bottle', honey: 'bee-buzz', seaweed: 'bubbles', coral: 'bubbles', pearl: 'shiny',
  meteor: 'star', stardust: 'star', moonrock: 'rock-hit', junk: 'pick',
};
export const harvestSfx = (kind: string) => HARVEST_SFX[kind] ?? 'pick';

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const at = (e: LooseEvent): Pick<Cue, 'x' | 'z'> =>
  typeof e.x === 'number' && typeof e.z === 'number' ? { x: e.x, z: e.z } : {};

/** 이벤트 하나 → 울릴 소리들. 모르는 이벤트는 [] */
export function cuesFor(e: LooseEvent): Cue[] {
  switch (e.type) {
    case 'collect': {
      const sp = e.species as { rarity?: number } | undefined;
      const r = num(e.rarity, num(sp?.rarity, 1));
      const out: Cue[] = [{ sfx: catchSfx(r) }];
      if (e.isNew) out.push({ sfx: 'new-dex', delay: r >= 5 ? 1.4 : 0.45 });
      if (e.variant === 'shiny') out.push({ sfx: 'shiny', delay: 0.25 });
      else if (e.variant === 'crown') out.push({ sfx: 'star', delay: 0.3, pitch: 0.8 });
      return out;
    }
    case 'catch-fail': return [{ sfx: e.activity === 'bug' ? 'net-miss' : 'fail-splash' }];
    case 'coins': {
      const d = num(e.delta);
      if (d <= 0 || e.why === 'sell') return []; // 팔기는 sell 소리가 맡는다
      return [{ sfx: d >= 1000 ? 'coins-big' : 'coin' }];
    }
    case 'stars': return num(e.delta) > 0 ? [{ sfx: 'star' }] : [];
    case 'unlock': return [{ sfx: 'unlock' }];
    case 'craft': return [{ sfx: 'craft' }];
    case 'sell': return [{ sfx: num(e.coins) >= 1000 ? 'coins-big' : 'sell' }];
    case 'buy': return [{ sfx: 'buy' }];
    case 'donate': return [{ sfx: 'unlock', pitch: 1.2 }];
    case 'chest-open': {
      const tier = str(e.tier) || 'wood';
      const shakes = CHEST_SHAKES[tier] ?? 1;
      const out: Cue[] = [];
      for (let i = 0; i < shakes; i++) out.push({ sfx: 'chest-shake', delay: i * 0.38, pitch: 1 + i * 0.08 });
      const mimic = e.mimic === true || e.source === 'mimic';
      out.push({ sfx: mimic ? 'mimic' : `chest-open-${(CHEST_TIERS as readonly string[]).includes(tier) ? tier : 'wood'}`, delay: shakes * 0.38 + 0.1 });
      return out;
    }
    case 'harvest': {
      const kind = str(e.kind);
      if (kind === 'rock' || kind === 'shake') return []; // rock-hit·tree-shake 가 먼저 울렸다 → 부서질 때만
      return [{ sfx: harvestSfx(kind) }];
    }
    case 'rock-hit': {
      // 콤보마다 반음씩 올라간다(최대 한 옥타브)
      const c = Math.max(0, Math.min(12, num(e.combo)));
      return [{ sfx: 'rock-hit', pitch: Math.pow(2, c / 12), ...at(e) }];
    }
    case 'tree-shake': return [{ sfx: 'shake-leaves', ...at(e) }];
    case 'beehive': return [{ sfx: 'bee-buzz', ...at(e) }];
    case 'stung': return [{ sfx: 'stung' }];
    case 'npc-talk': return [{ sfx: 'talk-blip', pitch: npcPitch(str(e.npc)) }];
    case 'befriend': return [{ sfx: 'star', pitch: 1.25 }];
    case 'gift': return [{ sfx: 'pick', pitch: 1.2 }];
    case 'clap': return [{ sfx: 'clap', ...at(e) }];
    case 'discover': return [{ sfx: 'discover' }];
    case 'secret-found': return [{ sfx: 'discover', pitch: 1.12 }];
    case 'launch-wave':
      // 6.2: 0.5초에 손 흔들기 → 1~4초 "3·2·1" → 4초 발사
      return [{ sfx: 'rocket-countdown', delay: 0.5 }, { sfx: 'rocket-launch', delay: 3.5 }];
    case 'launch': return [{ sfx: 'glide-wind', vol: 0.8 }];
    case 'arrive': return [{ sfx: 'arrive' }];
    case 'mount': {
      const v = str(e.vehicle);
      if (/bike|scooter|kart|buggy/.test(v)) return [{ sfx: 'bike-bell' }];
      if (/^dino|dino_/.test(v)) return [{ sfx: 'dino-roar-cute' }];
      if (/raft|duck|boat|yacht|jetski|submarine|tug/.test(v)) return [{ sfx: 'splash', vol: 0.6 }];
      return [{ sfx: 'jump', pitch: 1.2 }];
    }
    case 'dismount': return [{ sfx: 'jump', pitch: 0.9, vol: 0.7 }];
    case 'summon': return [{ sfx: 'ui-open', pitch: 0.8 }];
    case 'weather': return e.weather === 'storm' ? [{ sfx: 'thunder', delay: 0.6 }] : e.weather === 'rainbow' ? [{ sfx: 'shiny', pitch: 0.7 }] : [];
    case 'achievement': return [{ sfx: 'achievement' }];
    case 'set-complete': return [{ sfx: 'achievement', pitch: 1.12 }];
    case 'mission-done': return [{ sfx: 'mission' }];
    case 'missions-all': return [{ sfx: 'achievement' }];
    case 'bag-full': return [{ sfx: 'bag-full' }];
    case 'tino': {
      const s = str(e.state);
      if (s === 'sleep') return [{ sfx: 'tino-snore' }];
      if (s === 'stir') return [{ sfx: 'tino-snore', pitch: 1.2 }];
      return [{ sfx: 'dino-roar-cute', pitch: s === 'chase' ? 0.85 : 1 }];
    }
    case 'swim-rescue': return [{ sfx: 'surface' }];
    case 'oxygen-out': return [{ sfx: 'bubbles', pitch: 0.8 }];
    case 'ui-open': return [{ sfx: 'ui-open' }];
    case 'ui-close': return [{ sfx: 'ui-close' }];
    case 'request-done': return [{ sfx: 'mission', pitch: 1.1 }];
    case 'mail': return [{ sfx: 'toast' }];
    case 'lighthouse': return e.lit ? [{ sfx: 'unlock', pitch: 0.9 }] : [];
    case 'dev-stage': return [{ sfx: 'achievement', pitch: 0.95 }];
    case 'place': return [{ sfx: 'pick', pitch: 0.9 }];
    case 'photo': return [{ sfx: 'ui-click', pitch: 1.4 }];
    case 'release': return [{ sfx: 'splash', vol: 0.5 }];
    case 'ending': return [{ sfx: 'discover', pitch: 0.9 }];
    default: return [];
  }
}

/** 이벤트 종류가 cuesFor 에서 다뤄지나(테스트·디버그) */
export const CUE_EVENTS = [
  'collect', 'catch-fail', 'coins', 'stars', 'unlock', 'craft', 'sell', 'buy', 'donate', 'chest-open', 'harvest', 'rock-hit',
  'tree-shake', 'beehive', 'stung', 'npc-talk', 'befriend', 'gift', 'clap', 'discover', 'secret-found', 'launch-wave', 'launch',
  'arrive', 'mount', 'dismount', 'summon', 'weather', 'achievement', 'set-complete', 'mission-done', 'missions-all', 'bag-full',
  'tino', 'swim-rescue', 'oxygen-out', 'ui-open', 'ui-close', 'request-done', 'mail', 'lighthouse', 'dev-stage', 'place', 'photo',
  'release', 'ending',
] as const;

// ───────────── 발소리·움직임(순수) ─────────────
export type StepSurface = 'grass' | 'sand' | 'snow' | 'wood' | 'stone';
/** 땅 종류 → 발소리. 땅보다 25cm 넘게 위(부두·다리·마루)면 나무 */
export function stepSurface(kind: string | null | undefined, aboveGround: number, world: 'earth' | 'space' = 'earth'): StepSurface {
  if (world === 'space') return 'sand';
  if (aboveGround > 0.25) return 'wood';
  switch (kind) {
    case 'sand': case 'desert': case 'sea': return 'sand';
    case 'snow': return 'snow';
    case 'rock': case 'cliff': case 'lava': return 'stone';
    default: return 'grass';
  }
}
/** 발소리 간격(초): 걷기 0.42 → 달리기 0.26 */
export const stepInterval = (speed: number) => Math.max(0.24, Math.min(0.5, 0.42 - (speed - 3) * 0.035));

export type MoveMode = 'ground' | 'air' | 'glide' | 'swim' | 'dive' | 'mounted';
/** 이동 상태가 바뀔 때 한 번 울릴 소리 */
export function modeCue(prev: MoveMode | string, next: MoveMode | string, vy: number): Cue | null {
  if (prev === next) return null;
  if (next === 'swim' && (prev === 'air' || prev === 'ground' || prev === 'glide')) return { sfx: 'splash' };
  if (next === 'dive' && prev === 'swim') return { sfx: 'dive' };
  if (next === 'swim' && prev === 'dive') return { sfx: 'surface' };
  if (next === 'air' && prev === 'ground' && vy > 2) return { sfx: 'jump' };
  if (next === 'ground' && (prev === 'air' || prev === 'glide')) return { sfx: 'step-land' };
  return null;
}
/** 동작(포즈)이 새로 시작될 때 울릴 소리 */
export const ACTION_SFX: Readonly<Record<string, string>> = {
  cast: 'cast', reel: 'reel', net: 'net-swing', dig: 'dig', shake: 'shake-leaves', pick: 'pick', cheer: 'clap', stung: 'stung',
};
