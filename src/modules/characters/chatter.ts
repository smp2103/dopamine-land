// 주민끼리 수다: 플레이어 근처(16 m)에서 서로 가까운(8 m) 두 주민이 마주 보고 두 줄을 주고받는다.
// 말풍선은 타자기(한 글자씩) — 그리는 건 모르고 say(key, page, shown)·face(key, x, z, until) 만 부른다(테스트 가능).
// 누가 바빠지면(플레이어와 대화) 그 수다는 바로 끝나고, 바쁜 쪽 말풍선은 건드리지 않는다.
import { CHATTER } from './data';
import { glyphs, typedCount, pageDuration, paginate } from './dialog';

export interface ChatActor {
  key: string;
  name: string;
  catchphrase: string;
  island: string;
  x: number;
  z: number;
  /** 플레이어와 대화 중 등 */
  busy: boolean;
}

export interface ChatterOpts {
  rng: (key: string) => () => number;
  say(key: string, page: string | null, shown: number): void;
  face?(key: string, x: number, z: number, until: number): void;
  /** 플레이어와 쌍 가운데 거리(m) */
  near?: number;
  /** 두 주민 사이 거리(m) */
  pair?: number;
  /** 한 번 끝나고 다음까지(초) */
  gap?: [number, number];
}

interface Talk { a: ChatActor; b: ChatActor; pages: Array<{ who: 'a' | 'b'; text: string }>; i: number; t0: number; shown: number }

/** {a}/{b}/{ca}/{cb} 채우기 */
export function fillChat(line: string, a: { name: string; catchphrase: string }, b: { name: string; catchphrase: string }): string {
  return line.replaceAll('{a}', a.name).replaceAll('{b}', b.name).replaceAll('{ca}', a.catchphrase).replaceAll('{cb}', b.catchphrase);
}

/** 섬 수다 + 공통 수다에서 하나 */
export function pickChat(rnd: () => number, island: string): readonly [string, string] {
  const pool = [...(CHATTER[island] ?? []), ...(CHATTER[island] ?? []), ...CHATTER.any];
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}

/** 플레이어에게 가장 가까운 수다 쌍(둘 다 한가하고 서로 pair m 안, 가운데가 near m 안) */
export function findPair(list: readonly ChatActor[], player: { x: number; z: number }, near = 16, pair = 8): [ChatActor, ChatActor] | null {
  let best: [ChatActor, ChatActor] | null = null, bd = near * near;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.busy) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.busy || (a.x - b.x) ** 2 + (a.z - b.z) ** 2 > pair * pair) continue;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const d = (mx - player.x) ** 2 + (mz - player.z) ** 2;
      if (d < bd) { bd = d; best = [a, b]; }
    }
  }
  return best;
}

export function createChatter(o: ChatterOpts) {
  let cur: Talk | null = null;
  let nextAt = 4;
  let n = 0;
  const gap = o.gap ?? [9, 16];

  function stop(t: number, abort: boolean) {
    const c = cur;
    if (!c) return;
    cur = null;
    // 바쁜 쪽(플레이어와 대화 시작) 말풍선은 대화가 쓰고 있으니 그대로 둔다
    if (!abort || !c.a.busy) o.say(c.a.key, null, 0);
    if (!abort || !c.b.busy) o.say(c.b.key, null, 0);
    const r = o.rng(`chatter:gap:${n}`)();
    nextAt = t + gap[0] + r * (gap[1] - gap[0]);
  }

  function start(t: number, a: ChatActor, b: ChatActor) {
    const rnd = o.rng(`chatter:${a.key}:${b.key}:${n++}`);
    const [la, lb] = pickChat(rnd, a.island);
    const pages: Talk['pages'] = [
      ...paginate(fillChat(la, a, b)).map((text) => ({ who: 'a' as const, text })),
      ...paginate(fillChat(lb, a, b)).map((text) => ({ who: 'b' as const, text })),
    ];
    cur = { a, b, pages, i: 0, t0: t, shown: -1 };
    const until = t + pages.reduce((s, p) => s + pageDuration(p.text), 0) + 0.5;
    o.face?.(a.key, b.x, b.z, until);
    o.face?.(b.key, a.x, a.z, until);
  }

  /** 매 프레임(list 는 지금 섬에 나와 있는 주민) */
  function update(t: number, dt: number, list: readonly ChatActor[], player: { x: number; z: number } | null) {
    if (cur) {
      const c = cur;
      // 둘 중 하나라도 바쁘거나 사라졌으면 끝
      const a = list.find((x) => x.key === c.a.key), b = list.find((x) => x.key === c.b.key);
      if (!a || !b || a.busy || b.busy) { if (a) c.a.busy = a.busy; if (b) c.b.busy = b.busy; stop(t, true); return; }
      const pg = c.pages[c.i];
      const who = pg.who === 'a' ? c.a : c.b;
      const total = glyphs(pg.text).length;
      const shown = dt <= 0 ? total : typedCount(pg.text, t - c.t0);
      if (shown !== c.shown) { c.shown = shown; o.say(who.key, pg.text, shown); }
      if (dt > 0 && t - c.t0 >= pageDuration(pg.text)) {
        // 다음 쪽 — 말하는 사람이 바뀌면 앞 사람 말풍선은 닫는다
        const nx = c.pages[c.i + 1];
        if (!nx) { stop(t, false); return; }
        if (nx.who !== pg.who) o.say(who.key, null, 0);
        c.i++;
        c.t0 = t;
        c.shown = -1;
      }
      return;
    }
    if (!player || t < nextAt) return;
    const p = findPair(list, player, o.near, o.pair);
    if (p) start(t, p[0], p[1]);
    else nextAt = t + 2;
  }

  return {
    update,
    /** 지금 수다(디버그) */
    current: () => (cur ? { a: cur.a.key, b: cur.b.key, page: cur.pages[cur.i]?.text ?? null, i: cur.i, n: cur.pages.length } : null),
    /** 바로 시작(디버그) */
    force(t: number, list: readonly ChatActor[], player: { x: number; z: number }) { if (cur) stop(t, false); nextAt = t; update(t, 1 / 60, list, player); return !!cur; },
    stop: (t: number) => stop(t, false),
  };
}
export type Chatter = ReturnType<typeof createChatter>;
