// 통로(Link) — 글 한 줄씩 주고받는 끈. WebRTC 데이터 채널(rtc.ts)과 시험·데모용 메모리 끈이 같은 모양이다.
// session.ts 는 이 모양만 안다(그래서 브라우저 없이도 두 사람 놀이를 시험할 수 있다).

export interface Link {
  /** 열려 있나 */
  readonly open: boolean;
  /** 보내기 — 닫혔거나 못 보내면 false */
  send(text: string): boolean;
  /** 닫기(두 번 불러도 된다) */
  close(reason?: string): void;
  /** 받은 글 */
  onmessage: ((text: string) => void) | null;
  /** 닫혔을 때(내가 닫았든 상대가 닫았든 한 번) */
  onclose: ((reason: string) => void) | null;
}

/**
 * 메모리 끈 한 쌍(a ↔ b). 보낸 글은 큐에 쌓였다가 pump() 때(auto 면 마이크로태스크로 저절로) 건너간다.
 * 잃어버리기·순서 바뀜은 없다(데이터 채널도 순서·전달 보장 모드라서).
 */
export function memoryLinkPair(o: { auto?: boolean } = {}): { a: Link; b: Link; pump(): number; pending(): number } {
  const auto = o.auto !== false;
  /** text=null 은 '상대가 닫았다' 알림(앞서 보낸 쪽지가 다 건너간 뒤에 닿는다) */
  const q: Array<{ to: MemLink; text: string | null }> = [];
  let scheduled = false;
  const pump = () => {
    let n = 0;
    // 건너가는 도중 새로 쌓인 것도 다 보낸다(대답의 대답까지)
    while (q.length) {
      const { to, text } = q.shift()!;
      if (!to.open) continue;
      n++;
      if (text === null) {
        to.open = false;
        try { to.onclose?.('peer-closed'); } catch (e) { console.error('[netplay link]', e); }
        continue;
      }
      try { to.onmessage?.(text); } catch (e) { console.error('[netplay link]', e); }
    }
    return n;
  };
  const schedule = () => {
    if (!auto || scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; pump(); });
  };
  class MemLink implements Link {
    open = true;
    peer: MemLink | null = null;
    onmessage: ((text: string) => void) | null = null;
    onclose: ((reason: string) => void) | null = null;
    send(text: string) {
      if (!this.open || !this.peer?.open) return false;
      q.push({ to: this.peer, text });
      schedule();
      return true;
    }
    close(reason = 'close') {
      if (!this.open) return;
      this.open = false;
      const p = this.peer;
      try { this.onclose?.(reason); } catch (e) { console.error('[netplay link]', e); }
      // 상대 쪽은 "끊겼어요" — 큐 맨 뒤에(먼저 보낸 bye 가 닿은 다음)
      if (p?.open) { q.push({ to: p, text: null }); schedule(); }
    }
  }
  const a = new MemLink(), b = new MemLink();
  a.peer = b; b.peer = a;
  return { a, b, pump, pending: () => q.length };
}
