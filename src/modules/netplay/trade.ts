// 교환 창 상태 기계 — 순수 함수(되돌려 주는 새 상태). 네트워크·가방은 session 이 붙인다.
//
//   idle ─invite(내가)→ inviting ─remote accept→ open
//   idle ─remote invite→ invited ─accept(내가)→ open
//   open: 서로 offer(물건 묶음, rev 가 1씩 오른다) — 어느 쪽이든 바꾸면 두 사람 '좋아요'가 다 풀린다
//         confirm = "내 rev·네 rev 를 보고 좋아요". 상대 confirm 은 rev 가 지금 것과 맞을 때만 받는다(옛 확인 무시)
//   open + 둘 다 좋아요 → (방장이) commit → committing ─done ok→ done / ─done fail→ open(다시 고르기)
//   어디서든 cancel·decline·끊김 → cancelled
//
// 원자성: 방장이 심판이다. 방장은 commit 을 보내기 전에 자기 물건을 먼저 맡겨 두고(escrow, spend),
// 손님은 commit 을 받아 묶음이 자기가 본 것과 같은지 확인한 뒤 한 번에(내 것 빼기 + 받기) 처리하고 done 을 돌려준다.
// 방장은 done ok 면 손님 물건을 받고, fail 이면 맡긴 것을 되돌린다.
import { type Items, TRADE_SLOTS, ITEM_N_MAX } from './protocol';

export type TradePhase = 'idle' | 'inviting' | 'invited' | 'open' | 'committing' | 'done' | 'cancelled';
export interface TradeSide { items: Items; rev: number; ok: boolean }
export interface TradeState {
  tid: string;
  phase: TradePhase;
  mine: TradeSide;
  theirs: TradeSide;
  /** 끝난 까닭(cancelled·done) */
  reason?: string;
}

export type TradeEvent =
  | { k: 'invite'; tid: string }
  | { k: 'remote-invite'; tid: string }
  | { k: 'accept' }
  | { k: 'remote-accept' }
  | { k: 'offer'; items: Items }
  | { k: 'remote-offer'; items: Items; rev: number }
  | { k: 'confirm' }
  | { k: 'remote-confirm'; rev: number; theirRev: number }
  | { k: 'unconfirm' }
  | { k: 'remote-unconfirm' }
  | { k: 'commit' }
  | { k: 'done'; ok: boolean; reason?: string }
  | { k: 'cancel'; reason?: string };

const side = (): TradeSide => ({ items: {}, rev: 0, ok: false });
export const idleTrade = (): TradeState => ({ tid: '', phase: 'idle', mine: side(), theirs: side() });

/** 두 묶음이 같은가(0 개는 없는 것과 같다) */
export function sameItems(a: Items, b: Items): boolean {
  const ka = Object.keys(a).filter((k) => a[k] > 0), kb = Object.keys(b).filter((k) => b[k] > 0);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
}
/** 묶음 다듬기: 0 이하 빼기, 개수 정수·상한, 최대 TRADE_SLOTS 종류 */
export function normItems(v: Items): Items {
  const out: Items = {};
  for (const [id, n] of Object.entries(v)) {
    if (Object.keys(out).length >= TRADE_SLOTS) break;
    const c = Math.min(ITEM_N_MAX, Math.floor(n));
    if (c > 0) out[id] = c;
  }
  return out;
}
export const isEmpty = (v: Items) => !Object.values(v).some((n) => n > 0);

/** 둘 다 좋아요 — 이제 commit 해도 된다(빈 교환은 안 된다) */
export const isReady = (s: TradeState) => s.phase === 'open' && s.mine.ok && s.theirs.ok && (!isEmpty(s.mine.items) || !isEmpty(s.theirs.items));
/** 창이 떠 있어야 하는 단계 */
export const isActive = (s: TradeState) => s.phase === 'inviting' || s.phase === 'invited' || s.phase === 'open' || s.phase === 'committing';

/** 상태 한 걸음. 맞지 않는 사건은 상태를 그대로 돌려준다(같은 객체 — 바뀌었나는 !== 로 본다) */
export function tradeStep(s: TradeState, e: TradeEvent): TradeState {
  switch (e.k) {
    case 'invite':
      if (isActive(s)) return s;
      return { tid: e.tid, phase: 'inviting', mine: side(), theirs: side() };
    case 'remote-invite':
      if (isActive(s)) return s;
      return { tid: e.tid, phase: 'invited', mine: side(), theirs: side() };
    case 'accept':
      return s.phase === 'invited' ? { ...s, phase: 'open' } : s;
    case 'remote-accept':
      return s.phase === 'inviting' ? { ...s, phase: 'open' } : s;
    case 'offer': {
      if (s.phase !== 'open') return s;
      const items = normItems(e.items);
      if (sameItems(items, s.mine.items)) return s;
      return { ...s, mine: { items, rev: s.mine.rev + 1, ok: false }, theirs: { ...s.theirs, ok: false } };
    }
    case 'remote-offer': {
      if (s.phase !== 'open' || e.rev <= s.theirs.rev) return s;
      return { ...s, theirs: { items: normItems(e.items), rev: e.rev, ok: false }, mine: { ...s.mine, ok: false } };
    }
    case 'confirm':
      if (s.phase !== 'open' || s.mine.ok) return s;
      return { ...s, mine: { ...s.mine, ok: true } };
    case 'remote-confirm':
      // 상대가 본 내 rev 와 상대 자기 rev 가 지금 것과 같아야 — 아니면 옛 확인
      if (s.phase !== 'open' || e.rev !== s.theirs.rev || e.theirRev !== s.mine.rev) return s;
      return s.theirs.ok ? s : { ...s, theirs: { ...s.theirs, ok: true } };
    case 'unconfirm':
      return s.phase === 'open' && s.mine.ok ? { ...s, mine: { ...s.mine, ok: false } } : s;
    case 'remote-unconfirm':
      return s.phase === 'open' && s.theirs.ok ? { ...s, theirs: { ...s.theirs, ok: false } } : s;
    case 'commit':
      return isReady(s) ? { ...s, phase: 'committing' } : s;
    case 'done':
      if (s.phase !== 'committing') return s;
      return e.ok
        ? { ...s, phase: 'done', reason: e.reason ?? 'ok' }
        : { ...s, phase: 'open', mine: { ...s.mine, ok: false }, theirs: { ...s.theirs, ok: false }, reason: e.reason ?? 'fail' };
    case 'cancel':
      if (!isActive(s)) return s;
      return { ...s, phase: 'cancelled', reason: e.reason ?? 'cancel' };
  }
}

/** 가방 대역 — 원자 교환을 실행할 때 쓴다 */
export interface BagOps {
  /** 지금 가진 개수 */
  count(id: string): number;
  /** 이만큼 더 넣을 수 있나 */
  canAdd(id: string, n: number): boolean;
  /** 보낼 수 있는 물건인가(도구·탈것 등은 안 된다) */
  tradable(id: string): boolean;
  /** 빼기(모자라면 false, 아무것도 안 뺀다) */
  spend(items: Items): boolean;
  /** 넣기 — 실제로 넣은 수 */
  give(id: string, n: number): number;
}

/** 내가 보낼 묶음을 낼 수 있나 */
export function canPay(bag: BagOps, items: Items): boolean {
  return Object.entries(items).every(([id, n]) => bag.tradable(id) && bag.count(id) >= n);
}
/** 받을 묶음이 가방에 다 들어가나 — 바로 안 들어가는 종류 수가, 보낼 것으로 통째로 비는 칸 수 이하면 된다 */
export function canReceive(bag: BagOps, get: Items, give: Items = {}): boolean {
  const freed = Object.entries(give).filter(([id, n]) => n > 0 && bag.count(id) <= n).length;
  let need = 0;
  for (const [id, n] of Object.entries(get)) if (n > 0 && !bag.canAdd(id, n)) need++;
  return need <= freed;
}

/**
 * 한 번에 교환: give 를 빼고 get 을 넣는다. 미리 확인해서 하나라도 안 되면 아무것도 안 바꾸고 false.
 * 넣다가 가방이 넘치면 못 넣은 만큼 돌려준다(overflow).
 */
export function applyTrade(bag: BagOps, give: Items, get: Items): { ok: boolean; overflow: Items } {
  if (!canPay(bag, give) || !canReceive(bag, get, give)) return { ok: false, overflow: {} };
  if (!isEmpty(give) && !bag.spend(give)) return { ok: false, overflow: {} };
  const overflow: Items = {};
  for (const [id, n] of Object.entries(get)) {
    const got = bag.give(id, n);
    if (got < n) overflow[id] = n - got;
  }
  return { ok: true, overflow };
}
