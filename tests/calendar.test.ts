// calendar — 아침 우편(날짜 시드 고정)·읽음 상태·요일 이벤트(배율·강제 날씨)·부표 편지 배달·꽃잎비·하루 루틴을 가짜 게임으로 확인한다.
// econ·ext.npc·ext.travel 은 기록하는 작은 대역 — calendar 가 선물은 econ.give, 배달은 econ.fulfill/deliverLetter, 정류장은 travel.addNode 로 하는지 본다.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame, type FakeEnv } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import { rngFor } from '../src/core/rng';
import { DAY_SEC, HOUR_SEC, type EconApi } from '../src/core/api';
import { WEEKDAY_EVENTS } from '../src/core/events';
import * as Island from '../src/core/island';
import buildCalendar from '../src/modules/calendar';
import { BUOY_LINKS, ROUTINE, RC } from '../src/modules/calendar/data';
import {
  morningMail, ensureCalFlags, addMails, claimMail, unreadCount, eventOf, boostsFor, forcePlans, buoyAccepts, buoyGift,
  routineRows, petalSpots, tierOf, type MailWorld, type Mail,
} from '../src/modules/calendar/logic';

// ───────────── 대역 ─────────────
interface LetterRq { id: string; kind: string; item: string; to: string; npc: string; n: number; reward: number; done: boolean }
interface FakeEcon { given: Array<[string, number]>; fulfilled: string[]; stars: number; letters: LetterRq[]; full: boolean; api: EconApi }
function fakeEcon(game: FakeGame, o: { deliverLetter?: boolean } = {}): FakeEcon {
  const fe: FakeEcon = { given: [], fulfilled: [], stars: 0, letters: [], full: false, api: null as unknown as EconApi };
  const fulfill = (rid: string) => {
    const rq = fe.letters.find((r) => r.id === rid);
    if (!rq || rq.done || !game.state.has(rq.item)) return false;
    rq.done = true;
    fe.fulfilled.push(rid);
    game.state.addItem(rq.item, -1);
    game.state.emit({ type: 'request-done', id: rid, coins: rq.reward, npc: rq.npc });
    return true;
  };
  fe.api = {
    give: (id: string, n: number) => { if (fe.full) return 0; fe.given.push([id, n]); game.state.addItem(id, n); return n; },
    addStars: (n: number) => { fe.stars += n; },
    market: () => ({ day: 0, hot: ['f_carp', 'b_bee', 'f_koi'], mult: { f_carp: 2, b_bee: 1.5, f_koi: 1.8 } }),
    guest: () => ({ id: 'b_ladybug' }),
    day: () => Math.floor(game.env?.day ?? 0),
    requests: () => [],
    requestsFor: (npc: string) => fe.letters.filter((r) => r.npc === npc),
    fulfill,
    ...(o.deliverLetter ? { deliverLetter: (idOrItem: string) => { const rq = fe.letters.find((r) => r.id === idOrItem || r.item === idOrItem); return rq ? fulfill(rq.id) : false; } } : {}),
  } as unknown as EconApi;
  game.econ = fe.api;
  return fe;
}
const NPCS = [
  { id: 'npc_a', name: '토끼 이웃', island: 'home', kind: 'resident', birthday: 3 },
  { id: 'npc_b', name: '공룡 친구', island: 'dino', kind: 'resident', birthday: 9 },
  { id: 'npc_c', name: '펭귄 이웃', island: 'ice', kind: 'resident', birthday: 15 },
  { id: 'npc_shop', name: '꽥사장', island: 'home', kind: 'facility', birthday: 20 },
];
function fakeNpc(game: FakeGame, f: Record<string, number> = { npc_a: 45, npc_b: 85, npc_c: 10 }) {
  game.ext.npc = {
    list: () => NPCS.map((n) => ({ ...n })),
    friendship: (id: string) => f[id] ?? 0,
    name: (id: string) => NPCS.find((n) => n.id === id)?.name ?? null,
  };
}
function fakeTravel(game: FakeGame) {
  const nodes: Array<{ id: string; x: number; z: number; kind: string; label: string }> = [];
  game.ext.travel = {
    addNode: (id: string, x: number, z: number, kind = 'station', label = id) => { const i = nodes.findIndex((n) => n.id === id); const n = { id, x, z, kind, label }; if (i >= 0) nodes[i] = n; else nodes.push(n); return n; },
    nodes: () => nodes.slice(),
  };
  return nodes;
}

type Cal = {
  boosts(): Record<string, number>;
  today(): { day: number; weekday: number; id: string; active: boolean };
  unread(): number;
  mail(): Mail[];
  read(id?: string): number;
  claimAll(): number;
  open(tab?: string): void;
  routine(): Array<{ id: string; have: number; goal: number; done: boolean }>;
  letters(b?: string): Array<{ rid: string; to: string; ok: boolean }>;
  deliver(rid: string, b?: string): boolean;
  buoys(): Array<{ id: string; seen: boolean; x: number; z: number }>;
};

function boot(o: { day?: number; hour?: number; load?: boolean; deliverLetter?: boolean; npc?: Record<string, number>; pos?: [number, number] } = {}) {
  const game = makeFakeGame({ day: o.day, hour: o.hour, load: o.load, pos: o.pos });
  const econ = fakeEcon(game, { deliverLetter: o.deliverLetter });
  fakeNpc(game, o.npc);
  const nodes = fakeTravel(game);
  const ev = recordEvents(game);
  const ctx = makeCtx(game);
  buildCalendar(ctx as never);
  const cal = game.ext.calendar as Cal;
  const step = (n = 2) => { game.tick(0.5, n); };
  return { game, econ, ev, cal, nodes, step, env: game.env as FakeEnv };
}

const WORLD = (o: Partial<MailWorld> = {}): MailWorld => ({
  npcs: NPCS.map((n) => ({ ...n, f: n.id === 'npc_a' ? 45 : n.id === 'npc_b' ? 85 : 10 })),
  hot: ['f_carp', 'b_bee', 'f_koi'], guest: 'b_ladybug',
  forecast: [{ region: 'home', w: ['clear', 'rain', 'clear'] }], welcome: false, ...o,
});

beforeEach(() => { stubLocalStorage(); });

// ───────────── 아침 우편 ─────────────
describe('아침 우편 — 날짜 시드 고정', () => {
  it('같은 날·같은 정보면 같은 편지, 다른 날이면 다른 편지', () => {
    const a = morningMail(12, WORLD(), rngFor);
    const b = morningMail(12, WORLD(), rngFor);
    expect(b).toEqual(a);
    const c = morningMail(13, WORLD(), rngFor);
    expect(c.map((m) => m.id)).not.toEqual(a.map((m) => m.id));
    // 요일 공지 + 오늘의 소식은 늘, 주민 편지는 하루 최대 2(시설 NPC 는 안 보낸다)
    expect(a.some((m) => m.kind === 'event' && m.event === eventOf(12))).toBe(true);
    const news = a.find((m) => m.kind === 'news')!;
    expect(news.news!.hot).toEqual(['f_carp', 'b_bee', 'f_koi']);
    expect(news.news!.guest).toBe('b_ladybug');
    expect(news.news!.forecast[0].w).toEqual(['clear', 'rain', 'clear']);
    for (let d = 0; d < 30; d++) {
      const ls = morningMail(d, WORLD(), rngFor).filter((m) => m.kind === 'letter');
      expect(ls.length).toBeLessThanOrEqual(2);
      expect(ls.every((m) => m.npc !== 'npc_shop')).toBe(true);
    }
  });

  it('우정이 높을수록 자주 오고, 단짝은 늘 선물을 넣는다 · 생일엔 초대장', () => {
    let a = 0, c = 0;
    for (let d = 0; d < 200; d++) {
      for (const m of morningMail(d, WORLD(), rngFor)) {
        if (m.kind !== 'letter') continue;
        if (m.npc === 'npc_b') { a++; expect(m.attach?.length).toBeGreaterThan(0); expect(m.title).toContain('단짝'); }
        if (m.npc === 'npc_c') c++;
      }
    }
    expect(tierOf(85)).toBe('best');
    expect(a).toBeGreaterThan(c);
    const bday = morningMail(3, WORLD(), rngFor).filter((m) => m.kind === 'birthday');
    expect(bday.map((m) => m.npc)).toEqual(['npc_a']);
  });

  it('모듈: 첫 우편은 바로(환영 편지 + 선물), 다음 날은 05시에, 다시 불러와도 같은 날은 두 번 안 온다', () => {
    const { game, econ, ev, cal, env, step } = boot({ hour: 9 });
    step();
    const box = cal.mail();
    expect(box.some((m) => m.kind === 'welcome')).toBe(true);
    expect(ev.of('mail').length).toBe(1);
    expect(cal.unread()).toBe(box.length);
    // 우편함 E → 'mail' 창
    const mb = Island.PLACES.mailbox;
    game.player.teleport(mb.x + 0.6, mb.z + 0.6);
    game.tick(1 / 60);
    expect(game.interact('calendar-mailbox')).toBe(true);
    expect(game.hud.isOpen('mail')).toBe(true);
    // 선물 받기 → econ.give
    expect(cal.claimAll()).toBeGreaterThan(0);
    expect(econ.given.some(([id]) => id === 'm_wood')).toBe(true);
    // 다음 날 새벽 2시: 아직, 5시: 온다
    const before = cal.mail().length;
    env.advance(DAY_SEC - 7 * HOUR_SEC); // 다음 날 02시
    step();
    expect(cal.mail().length).toBe(before);
    env.setHour(5.2);
    step();
    expect(cal.mail().length).toBeGreaterThan(before);
    expect(cal.mail().filter((m) => m.kind === 'welcome').length).toBe(1);
    const n = cal.mail().length;
    game.flushSave();
    game.dispose();
    // 같은 날 다시 불러오기
    const b = boot({ day: 1, hour: 6 });
    b.step();
    expect(b.cal.mail().length).toBe(n);
  });
});

// ───────────── 읽음 상태 ─────────────
describe('우편함 읽음 상태', () => {
  it('안 읽은 수 · 하나 읽기 · 전부 읽기 · 저장 후 그대로', () => {
    const { game, cal, step } = boot({ hour: 10 });
    step();
    const box = cal.mail();
    expect(cal.unread()).toBe(box.length);
    expect(cal.read(box[0].id)).toBe(box.length - 1);
    expect(cal.mail()[0].read).toBe(true);
    expect(cal.read()).toBe(0);
    game.flushSave();
    game.dispose();
    const b = boot({ hour: 10 });
    b.step();
    expect(b.cal.unread()).toBe(0);
    expect(b.cal.mail().length).toBe(box.length);
  });

  it('우편함 보관 수를 넘으면 오래된 다 읽은 편지부터 버린다 · 가방이 차면 선물이 남는다', () => {
    const f = ensureCalFlags({});
    const mk = (i: number, read: boolean): Mail => ({ id: `m${i}`, day: i, kind: 'letter', from: 'a', icon: '💌', title: 't', text: 'x', read });
    addMails(f, [mk(1, true), mk(2, false), mk(3, true)], 3);
    addMails(f, [mk(4, false)], 3);
    expect(f.box.map((m) => m.id)).toEqual(['m4', 'm1', 'm2']); // 오래된 쪽(뒤)에서 읽은 것 m3 먼저
    expect(unreadCount(f.box)).toBe(2);
    const m: Mail = { ...mk(9, false), attach: [{ id: 'm_wood', n: 3 }] };
    expect(claimMail(m, () => 1)).toEqual([{ id: 'm_wood', n: 1 }]);
    expect(m.claimed).toBeFalsy();
    expect(m.attach).toEqual([{ id: 'm_wood', n: 2 }]);
    claimMail(m, (_id, n) => n);
    expect(m.claimed).toBe(true);
  });
});

// ───────────── 요일 이벤트 ─────────────
describe('요일 이벤트', () => {
  it('weekday = day % 7 → 고정 id, 월요일 배율 {petal: 2}', () => {
    for (let d = 0; d < 21; d++) expect(eventOf(d)).toBe(WEEKDAY_EVENTS[d % 7]);
    expect(boostsFor('petalrain', true)).toEqual({ petal: 2 });
    expect(boostsFor('meteor', true)).toEqual({});
    expect(boostsFor('petalrain', false)).toEqual({});
  });

  it('모듈: 월요일 boosts() = {petal:2}, 화요일엔 비고, weekday-event 를 켜고 끈다(+배너)', () => {
    const { cal, ev, env, step, game } = boot({ day: 7, hour: 10 });
    const banners: string[] = [];
    (game.hud as unknown as { banner: (b: { text: string }) => void }).banner = (b) => { banners.push(b.text); };
    step(10);
    expect(cal.today().id).toBe('petalrain');
    expect(cal.boosts()).toEqual({ petal: 2 });
    expect(ev.of('weekday-event')).toEqual([expect.objectContaining({ id: 'petalrain', active: true })]);
    expect(banners.some((t) => t.includes('꽃잎비'))).toBe(true);
    env.advance(DAY_SEC);
    step();
    expect(cal.today().id).toBe('migration');
    expect(cal.boosts()).toEqual({});
    const we = ev.of('weekday-event');
    expect(we.slice(-2)).toEqual([expect.objectContaining({ id: 'petalrain', active: false }), expect.objectContaining({ id: 'migration', active: true })]);
  });

  it('수요일: 모래시계섬 모래폭풍 6시간(하루 한 번) · 일요일 21시: 모든 곳 유성우(새벽 5시까지)', () => {
    const { env, step } = boot({ day: 2, hour: 9 });
    step();
    const sand = env.forced.get('desert');
    expect(sand?.w).toBe('sandstorm');
    expect(sand!.until! - env.gameSec).toBeCloseTo(6 * HOUR_SEC, 0);
    // 폭풍이 끝난 뒤 같은 날엔 다시 안 건다
    env.advance(7 * HOUR_SEC);
    step();
    expect(env.forced.get('desert')).toBeUndefined();
    // 일요일 20시: 아직 / 21시 넘으면 '*' 유성우
    env.advance(6 * DAY_SEC + 20 * HOUR_SEC - env.gameSec); // 일요일 20시
    expect(env.weekday).toBe(6);
    expect(Math.floor(env.hour)).toBe(20);
    step();
    expect(env.forced.get('*')).toBeUndefined();
    env.setHour(21.2);
    step();
    const met = env.forced.get('*');
    expect(met?.w).toBe('meteor');
    expect(met!.until).toBe(6 * DAY_SEC + 29 * HOUR_SEC);
  });

  it('강제 날씨는 저장된 기한으로 다시 불러오면 남은 만큼 다시 건다 · 월요일 새벽에 처음 봐도 일요일 밤 유성우', () => {
    const a = boot({ day: 2, hour: 10 });
    a.step();
    const until = a.env.forced.get('desert')!.until!;
    a.game.flushSave();
    a.game.dispose();
    const b = boot({ day: 2, hour: 12 });
    b.step();
    expect(b.env.forced.get('desert')?.w).toBe('sandstorm');
    expect(b.env.forced.get('desert')!.until!).toBeCloseTo(until, 0);
    // 순수: 월요일 03시 → 전날(일) 밤 유성우 꼬리
    const p = forcePlans(7 * DAY_SEC + 3 * HOUR_SEC);
    expect(p).toEqual([expect.objectContaining({ key: 'meteor:6', region: '*', w: 'meteor', until: 6 * DAY_SEC + 29 * HOUR_SEC })]);
    expect(forcePlans(7 * DAY_SEC + 6 * HOUR_SEC)).toEqual([]);
    expect(forcePlans(9 * DAY_SEC + 3 * HOUR_SEC)).toEqual([]); // 수요일 새벽 3시는 아직
  });

  it('월요일 꽃잎 소용돌이: 말랑섬 꽃 언덕 청크에 생기고, 지나가면 꽃잎(m_petal) + harvest', () => {
    const { game, econ, ev, step } = boot({ day: 0, hour: 10 });
    step();
    const home = Island.islandById('home')!;
    let found: { x: number; z: number; key: string } | null = null;
    const size = 64;
    for (let cx = Math.floor((home.x - home.r) / size); cx <= Math.floor((home.x + home.r) / size) && !found; cx++) {
      for (let cz = Math.floor((home.z - home.r) / size); cz <= Math.floor((home.z + home.r) / size) && !found; cz++) {
        const o = game.chunks.buildAt('calendar-petals', cx, cz);
        if (!o) continue;
        const sp = petalSpots(cx, cz, size, rngFor, () => true, 5); // 결정성 확인용으로 같은 시드
        expect(sp.length).toBeGreaterThan(0);
        const pc = o.userData.calendarPetals as { spots: Array<{ x: number; z: number; key: string }> };
        found = pc.spots[0];
      }
    }
    expect(found).not.toBeNull();
    // 진짜 스트리밍처럼 살아 있는 청크로 — buildAt 이 이미 liveChunks 에 넣었다
    game.player.teleport(found!.x, found!.z);
    step(1);
    game.tick(1 / 60, 3);
    expect(econ.given.some(([id]) => id === 'm_petal')).toBe(true);
    expect(ev.of('harvest').some((e) => e.kind === 'petal' && e.item === 'm_petal')).toBe(true);
    const n = econ.given.filter(([id]) => id === 'm_petal').length;
    game.tick(1 / 60, 10);
    expect(econ.given.filter(([id]) => id === 'm_petal').length).toBe(n); // 같은 자리는 하루 한 번
  });
});

// ───────────── 부표 우체통 ─────────────
describe('부표 우체통 — 편지 배달 · 정류장', () => {
  const LETTER: LetterRq = { id: 'req:0:npc:npc_a', kind: 'letter', item: 'it_letter_42', to: 'dino', npc: 'npc_a', n: 1, reward: 2000, done: false };

  it('들른 부표는 travel.addNode(buoy), E → 부표 탭, 잇는 섬 편지는 econ.fulfill 로 배달 완료', () => {
    const { game, econ, nodes, cal, ev, step } = boot({ hour: 10 });
    econ.letters.push({ ...LETTER });
    game.state.addItem('it_letter_42', 1);
    const b1 = Island.PLACES.buoyMail[0];
    game.player.teleport(b1.x + 3, b1.z + 2);
    step();
    expect(nodes.map((n) => n.id)).toContain('buoy-1');
    expect(nodes.find((n) => n.id === 'buoy-1')!.kind).toBe('buoy');
    expect(cal.buoys().find((b) => b.id === 'buoy-1')!.seen).toBe(true);
    // 배 위(탑승)에서도
    game.player.mount({ name: 'raft' });
    game.tick(1 / 60);
    expect(game.interact('calendar-buoy')).toBe(true);
    expect(game.hud.isOpen('mail')).toBe(true);
    expect(game.hud.current()?.tab).toBe('buoy');
    // ① 은 말랑↔공룡 — 공룡섬 편지 OK, ③(말랑↔버섯)은 안 된다
    expect(BUOY_LINKS['buoy-1']).toContain('dino');
    expect(cal.letters('buoy-1')).toEqual([expect.objectContaining({ rid: LETTER.id, to: 'dino', ok: true })]);
    expect(cal.deliver(LETTER.id, 'buoy-3')).toBe(false);
    expect(econ.fulfilled).toEqual([]);
    expect(cal.deliver(LETTER.id, 'buoy-1')).toBe(true);
    expect(econ.fulfilled).toEqual([LETTER.id]);
    expect(game.state.has('it_letter_42')).toBe(false);
    expect(ev.of('request-done').length).toBe(1);
    expect(cal.mail().some((m) => m.id.includes(':thanks:'))).toBe(true);
    expect(cal.letters('buoy-1')).toEqual([]);
  });

  it('econ.deliverLetter 가 있으면 그걸 쓴다 · 다시 불러오면 들른 부표를 정류장에 다시 넣는다', () => {
    const a = boot({ hour: 10, deliverLetter: true });
    a.econ.letters.push({ ...LETTER, id: 'req:0:npc:npc_b', npc: 'npc_b', to: 'desert', item: 'it_letter_7' });
    a.game.state.addItem('it_letter_7', 1);
    const b5 = Island.PLACES.buoyMail[4];
    a.game.player.teleport(b5.x + 2, b5.z + 2);
    a.step();
    expect(a.cal.deliver('req:0:npc:npc_b', 'buoy-5')).toBe(true);
    a.game.flushSave();
    a.game.dispose();
    const b = boot({ hour: 11 });
    b.step();
    expect(b.nodes.map((n) => n.id)).toEqual(['buoy-5']);
  });

  it('부표 선물·받는 규칙(순수)', () => {
    expect(buoyGift('buoy-2', 4, rngFor)).toEqual(buoyGift('buoy-2', 4, rngFor));
    expect(buoyGift('buoy-2', 4, rngFor).attach[0].n).toBeGreaterThan(0);
    expect(buoyAccepts('buoy-5', 'desert')).toBe(true);
    expect(buoyAccepts('buoy-2', 'desert')).toBe(false);
    expect(buoyAccepts('buoy-2', null)).toBe(false);
  });
});

// ───────────── 하루 루틴 ─────────────
describe('하루 루틴 10', () => {
  it('이벤트로 진행되고 다 하면 반짝별 보너스 · 날이 바뀌면 비운다', () => {
    const { game, econ, cal, env, step } = boot({ hour: 22 });
    step();
    expect(ROUTINE.length).toBe(10);
    const st = game.state;
    st.emit({ type: 'open-board' });
    for (let i = 0; i < 5; i++) st.emit({ type: 'rock-hit', x: 0, z: 0, rock: 'r', combo: i, island: 'home' });
    st.emit({ type: 'tree-shake', x: 0, z: 0, tree: 't', island: 'home' });
    for (let i = 0; i < 4; i++) st.emit({ type: 'harvest', kind: 'dig', item: 'fos_x', n: 1, island: 'home' });
    st.emit({ type: 'catch', activity: 'fish', species: { id: 'f' }, rarity: 3, combo: 1 }); // 밤 → 밤 채집도
    st.emit({ type: 'catch', activity: 'bug', species: { id: 'b' }, rarity: 3, combo: 1 });
    st.emit({ type: 'sell', id: 'f', n: 1, coins: 10, shop: 'quack' });
    st.emit({ type: 'donate', id: 'f', n: 1, coins: 0, stars: 1 });
    st.emit({ type: 'craft', id: 'r', gives: 'x', n: 1 });
    let rows = cal.routine();
    expect(rows.find((r) => r.id === 'mail')!.done).toBe(false);
    cal.open('inbox');
    expect(game.hud.isOpen('mail')).toBe(true);
    rows = cal.routine();
    expect(rows.find((r) => r.id === 'mail')!.done).toBe(true);
    expect(rows.find((r) => r.id === 'rock')!.done).toBe(true);
    expect(rows.find((r) => r.id === 'shake')!.have).toBe(5);
    expect(rows.find((r) => r.id === 'night')!.done).toBe(true);
    // 다른 섬 땅 위
    const dino = Island.islandSpawnPoints('dino', 1)[0];
    game.player.teleport(dino.x, dino.z);
    game.tick(0.5, 3);
    rows = cal.routine();
    expect(rows.find((r) => r.id === 'sail')!.done).toBe(true);
    expect(rows.every((r) => r.done)).toBe(true);
    expect(econ.stars).toBe(5);
    game.tick(0.5, 2);
    expect(econ.stars).toBe(5); // 보너스는 하루 한 번
    // 순수: 부분 진행
    expect(routineRows({ [RC.dig]: 9 }).find((r) => r.def.id === 'shake')!.have).toBe(4);
    // 다음 날: 비운다(지금 다른 섬에 서 있으니 '항해'만 다시 켜진다)
    env.advance(DAY_SEC);
    game.tick(0.5, 3);
    expect(cal.routine().filter((r) => r.done).map((r) => r.id)).toEqual(['sail']);
  });
});
