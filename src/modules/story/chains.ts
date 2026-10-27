// 섬 주인 별조각 체인 상태 기계(순수) — idle(아직 안 만남) → asked(부탁 들음) → ready(다 모음, 주인에게 가면 됨) → done(별조각 받음).
// 진행 '사실'(숨은 곳 찾음 · 반딧불 놓아준 수 · 망원경 · 화석 골격 · 오로라나비 · 별자리 기증)은 story.ts 가 모아 넘긴다.
// 조건은 주인을 만나기 전에 채워도 된다(먼저 찾아도 말 걸면 바로 받는다 — 막히는 일이 없게).
// 주인 NPC 가 세상에 없으면(npc 서비스에 이름이 없으면) 다 모은 그 순간 그 자리에서 준다.
import { CHAINS, PIECES_TOTAL, type ChainDef, type ChainNo } from './data';

export type ChainStatus = 'idle' | 'asked' | 'ready' | 'done';

/** 체인 진행 사실(한 번에 모아서) */
export interface ChainFacts {
  /** 찾은 숨은 곳 id */
  secrets: ReadonlySet<string> | readonly string[];
  /** 놓아준 수(태그별: 'firefly' → 32) */
  released: Readonly<Record<string, number>>;
  /** 건넨 물건(체인 2 망원경) */
  given: ReadonlySet<string> | readonly string[];
  /** 박물관에 맞춘 화석 골격 수 */
  skeletons: number;
  /** 오로라 밤에 잡아 보여 준 종 */
  shown: ReadonlySet<string> | readonly string[];
  /** 기증한 별자리 물고기 수 · 등록된 별자리 물고기 종 수(0 = 모름) */
  zodiacDonated: number;
  zodiacTotal: number;
}

export interface ChainProgress {
  have: number;
  need: number;
  met: boolean;
  /** 진행 한 줄(체인 목록·대기 대사) */
  text: string;
}

const has = (s: ReadonlySet<string> | readonly string[], id: string) => (Array.isArray(s) ? s.includes(id) : (s as ReadonlySet<string>).has(id));
const fill = (s: string, m: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(m[k] ?? ''));

/** 별자리 체인 목표 수: 등록된 종이 12보다 적으면(데이터가 덜 들어온 판) 그만큼 */
export const zodiacNeed = (n: number, total: number) => (total > 0 ? Math.min(n, total) : n);

/** 체인 하나의 진행 */
export function chainProgress(def: ChainDef, f: ChainFacts): ChainProgress {
  const g = def.goal;
  switch (g.kind) {
    case 'secret': {
      const ok = has(f.secrets, g.secret);
      return { have: ok ? 1 : 0, need: 1, met: ok, text: ok ? '찾았어요!' : '아직 못 찾았어요' };
    }
    case 'give': {
      const ok = has(f.given, g.item);
      return { have: ok ? 1 : 0, need: 1, met: ok, text: ok ? '건넸어요!' : '아직 없어요' };
    }
    case 'release': {
      const have = Math.max(0, Math.floor(f.released[g.tag] ?? 0));
      return { have: Math.min(have, g.n), need: g.n, met: have >= g.n, text: `${Math.min(have, g.n)}/${g.n}마리` };
    }
    case 'secret+skeletons': {
      const cave = has(f.secrets, g.secret);
      const sk = Math.max(0, Math.floor(f.skeletons));
      // 동굴 1 + 골격 n 을 한 줄 막대로
      const have = (cave ? 1 : 0) + Math.min(sk, g.n);
      return { have, need: g.n + 1, met: cave && sk >= g.n, text: `벽화 동굴 ${cave ? '✔' : '✘'} · 골격 ${Math.min(sk, g.n)}/${g.n}` };
    }
    case 'show-aurora': {
      const ok = has(f.shown, g.species);
      return { have: ok ? 1 : 0, need: 1, met: ok, text: ok ? '보여 줄 수 있어요!' : '오로라 밤을 기다려요' };
    }
    case 'zodiac': {
      const need = zodiacNeed(g.n, f.zodiacTotal);
      const have = Math.max(0, Math.floor(f.zodiacDonated));
      return { have: Math.min(have, need), need, met: have >= need, text: `${Math.min(have, need)}/${need}종 기증` };
    }
  }
}

/** 대기 대사(진행 수치 치환) */
export function waitLine(def: ChainDef, p: ChainProgress, f: ChainFacts): string {
  const g = def.goal;
  const m: Record<string, string | number> = { have: p.have, need: p.need };
  if (g.kind === 'secret+skeletons') {
    m.cave = has(f.secrets, g.secret) ? '찾음' : '아직';
    m.have = Math.min(Math.floor(f.skeletons), g.n);
    m.need = g.n;
  }
  return fill(def.wait, m);
}

/** 체인 한 칸의 결과 */
export interface ChainStep {
  status: ChainStatus;
  /** 이번에 별조각을 줄 차례 */
  grant: boolean;
  /** 보여 줄 말: ask 부탁 · wait 아직 · ready 주인에게 가 보자 · thanks 고마워 · after 끝난 뒤 · null 없음 */
  say: 'ask' | 'wait' | 'ready' | 'thanks' | 'after' | null;
}

/**
 * 주인에게 말을 걸었을 때.
 * idle → 다 모았으면 바로 thanks(받음), 아니면 ask(부탁을 듣는다)
 * asked → 다 모았으면 thanks, 아니면 wait · ready → thanks · done → after
 * claim 'spot' 체인(폭포 동굴)은 주인이 주지 않는다 — 다 모았는데 아직이면(받침대에서 못 받은 옛 저장) 여기서라도 준다.
 */
export function talkStep(status: ChainStatus, met: boolean): ChainStep {
  if (status === 'done') return { status, grant: false, say: 'after' };
  if (met || status === 'ready') return { status: 'done', grant: true, say: 'thanks' };
  if (status === 'idle') return { status: 'asked', grant: false, say: 'ask' };
  return { status, grant: false, say: 'wait' };
}

/**
 * 진행 사실이 바뀐 뒤(매 판정).
 * 다 모았고 아직 안 받았으면: 그 자리에서 주는 체인 또는 주인이 세상에 없으면 → done(받음), 아니면 ready(알림 한 번).
 */
export function tickStep(def: Pick<ChainDef, 'claim'>, status: ChainStatus, met: boolean, ownerPresent: boolean): ChainStep {
  if (status === 'done' || status === 'ready' || !met) return { status, grant: false, say: null };
  if (def.claim === 'spot' || !ownerPresent) return { status: 'done', grant: true, say: 'thanks' };
  return { status: 'ready', grant: false, say: 'ready' };
}

/** 저장된 체인 상태 읽기(망가진 값은 idle) */
export const asStatus = (v: unknown): ChainStatus => (v === 'asked' || v === 'ready' || v === 'done' ? v : 'idle');

/** 받은 별조각 수 */
export const piecesOf = (chains: Partial<Record<string, { s?: unknown } | undefined>>, granted: readonly number[]): number => {
  const set = new Set<number>(granted.filter((n) => n >= 1 && n <= PIECES_TOTAL));
  for (const c of CHAINS) if (asStatus(chains[String(c.no)]?.s) === 'done') set.add(c.no);
  return set.size;
};

/** 체인 번호 목록 */
export const CHAIN_NOS: readonly ChainNo[] = CHAINS.map((c) => c.no);
