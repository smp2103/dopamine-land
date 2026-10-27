// characters-npc: 대사 고르기(첫 만남 → 평소 · 시간대 · 꽥사장 인기 생물 · 펭박사 부품 · 몽실 뗏목) · 쪽 나누기 · 타자기,
// 우정(상한 100 · 하루 첫 대화 +1 · 저장 유지 · 부탁 +5~10 · 하트 늘면 befriend) · 선물 점수(생일 ×3) · 선물 범주,
// npc-talk 의 id · 대화 끝나면 open-shop/open-museum/주민 메뉴 · 반응(박수 15 m · 손 흔들기) · flags.npc 옛 id 옮기기.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { makeFakeGame, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import {
  selectDialog, paginate, typedCount, pageDuration, isBlipChar, blipPitch, josa, hotLine, rocketLine, RAFT_HINT,
  migrateNpcFlags, normalizeFlag, addFriend, heartsOf, talkGain, requestGain, giftDelta, giftCategory, giftable, isBirthdayToday,
  GIFTS_PER_DAY, F_MAX, type TalkDef,
} from '../src/modules/characters/dialog';
import { createNpcService, type NpcActor, type NpcInfo, type NpcReaction } from '../src/modules/characters/npc';
import { FACILITY_NPCS, RESIDENTS } from '../src/modules/characters/data';
import { rngFor } from '../src/core/rng';
import type { Game } from '../src/core/game';
import type { Species } from '../src/core/state';

const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
const QUACK = FACILITY_NPCS.find((n) => n.id === 'npc_quack')!;
const PENG = FACILITY_NPCS.find((n) => n.id === 'npc_peng')!;
const MONG = FACILITY_NPCS.find((n) => n.id === 'npc_mongsil')!;
const SLOW = FACILITY_NPCS.find((n) => n.id === 'npc_slow')!;
const talkOf = (n: typeof QUACK): TalkDef => ({ id: n.id, catchphrase: n.catchphrase, first: n.first, usual: n.usual, tod: n.tod, role: n.role });
const infoOf = (n: typeof QUACK): NpcInfo => ({
  id: n.id, name: n.name, island: n.island, accent: n.accent, kind: 'facility',
  social: { birthday: n.birthday, likes: n.likes, dislikes: n.dislikes, voice: n.voice }, talk: talkOf(n), after: n.after,
});
const NABI = RESIDENTS.find((r) => r.id === 'nabi')!;
const nabiInfo: NpcInfo = {
  id: NABI.id, name: NABI.name, island: 'home', accent: NABI.accent, kind: 'resident',
  social: { birthday: NABI.birthday, likes: NABI.likes, dislikes: NABI.dislikes, voice: NABI.voice },
  talk: { id: NABI.id, catchphrase: NABI.catchphrase, first: ['안녕!'], usual: NABI.lines ?? [] }, after: { type: 'menu' },
};

/** 기록하는 가짜 자리 */
function actor(id: string, x: number, z: number, key = id) {
  const log: Array<{ page: string | null; shown: number }> = [];
  const reacts: NpcReaction[] = [];
  const st = { news: false, talking: false };
  const p = new THREE.Vector3(x, 0, z);
  const a: NpcActor = {
    key, id, pos: () => p, present: () => true,
    say: (page, shown) => log.push({ page, shown }),
    setTalking: (on) => { st.talking = on; }, setNews: (on) => { st.news = on; },
    react: (r) => reacts.push(r), moveTo: (nx, nz) => p.set(nx, 0, nz),
  };
  return { a, log, reacts, st, p };
}

function setup(o: { day?: number; hour?: number; econ?: Record<string, unknown>; load?: boolean } = {}) {
  const game = makeFakeGame({ pos: [0, 0], day: o.day ?? 0, hour: o.hour ?? 10, load: o.load });
  if (o.econ) (game as unknown as { econ: unknown }).econ = o.econ;
  const svc = createNpcService(game.asGame() as unknown as Game, {
    infos: [infoOf(QUACK), infoOf(SLOW), infoOf(PENG), infoOf(MONG), nabiInfo],
    rng: (k) => rngFor(k),
  });
  const ev = recordEvents(game);
  return { game, svc, ev };
}
/** 대화가 끝날 때까지 시간 보내기 */
const runOut = (game: FakeGame, sec = 30) => game.tick(1 / 30, Math.ceil(sec * 30));

beforeEach(() => { stubLocalStorage(); });

describe('대사 고르기(GDD 4.6.3)', () => {
  it('첫 만남엔 첫 만남 대사를 전부, 그다음엔 평소 대사 하나', () => {
    const first = selectDialog(talkOf(QUACK), { met: false, firstToday: true, tod: 'day', rnd: seq(0) });
    expect(first.first).toBe(true);
    expect(first.pages.join(' ')).toContain('꽥! 새 얼굴이구먼!');
    expect(first.pages.join(' ')).toContain('오늘 인기 생물은 게시판에 붙여 놨어!');
    const usual = selectDialog(talkOf(QUACK), { met: true, firstToday: false, tod: 'day', rnd: seq(0) });
    expect(usual.first).toBe(false);
    expect(QUACK.usual).toContain(usual.line);
    expect(usual.pages).toEqual([usual.line]);
  });
  it('같은 평소 대사를 연달아 하지 않는다', () => {
    const a = selectDialog(talkOf(QUACK), { met: true, firstToday: false, tod: 'day', rnd: seq(0) });
    const b = selectDialog(talkOf(QUACK), { met: true, firstToday: false, tod: 'day', rnd: seq(0), last: a.line });
    expect(b.line).not.toBe(a.line);
  });
  it('시간대 대사는 지금 tod 에서 고른다', () => {
    const lines = new Set<string>();
    for (let i = 0; i < 40; i++) lines.add(selectDialog(talkOf(QUACK), { met: true, firstToday: false, tod: 'night', rnd: rngFor(`t${i}`) }).line!);
    expect([...lines].some((l) => QUACK.tod!.night!.includes(l))).toBe(true);
    expect([...lines].some((l) => QUACK.tod!.morning!.includes(l))).toBe(false);
  });
  it('꽥사장: 오늘 첫 대화엔 인기 생물 줄("오늘은 고등어가 인기래!")', () => {
    const p = selectDialog(talkOf(QUACK), { met: true, firstToday: true, tod: 'day', rnd: seq(0.5), hot: ['고등어', '장수풍뎅이', '해파리'] });
    expect(p.pages[0]).toContain('오늘은 고등어가 인기래!');
    expect(p.pages.join(' ')).toContain('고등어·장수풍뎅이·해파리');
    expect(hotLine('고등어')).toBe('오늘은 고등어가 인기래!');
    expect(hotLine('잉어')).toBe('오늘은 잉어가 인기래!');
    expect(hotLine('장수풍뎅이')).toBe('오늘은 장수풍뎅이가 인기래!');
    expect(hotLine('해달')).toBe('오늘은 해달이 인기래!');
    expect(josa('곰', '이', '가')).toBe('이');
  });
  it('펭박사: 첫 만남엔 로켓 꿈 + 부품 수, 평소에도 부품 수', () => {
    const p = selectDialog(talkOf(PENG), { met: false, firstToday: true, tod: 'day', rnd: seq(0), rocket: { count: 2, blueprint: true } });
    const all = p.pages.join(' ');
    expect(all).toContain('난 날개는 있는데 날 줄은 몰라. 그래서 로켓을 만들지!');
    expect(all).toContain('부품 여섯 개만 모아 주게');
    expect(all).toContain('2/6');
    const u = selectDialog(talkOf(PENG), { met: true, firstToday: false, tod: 'day', rnd: seq(0), rocket: { count: 6, blueprint: true } });
    expect(u.pages[u.pages.length - 1]).toBe(rocketLine({ count: 6, blueprint: true }));
    expect(rocketLine(null)).toContain('0/6');
  });
  it('몽실: 뗏목이 없으면 하루 첫 대화에 뗏목 힌트', () => {
    const p = selectDialog(talkOf(MONG), { met: true, firstToday: true, tod: 'day', rnd: seq(0), hasRaft: false });
    expect(p.pages).toContain(RAFT_HINT);
    const q = selectDialog(talkOf(MONG), { met: true, firstToday: true, tod: 'day', rnd: seq(0.99), hasRaft: true });
    expect(q.pages).not.toContain(RAFT_HINT);
    expect(MONG.usual).toContain('왔구나! 오늘은 뭐 잡았어?');
  });
  it('생일엔 생일 인사가 먼저, {c} 는 말버릇으로', () => {
    const d: TalkDef = { id: 'x', catchphrase: '냐옹', usual: ['좋아, {c}!'] };
    const p = selectDialog(d, { met: true, firstToday: true, tod: 'day', rnd: seq(0), birthday: true });
    expect(p.pages[0]).toContain('생일');
    expect(p.pages.join(' ')).toContain('좋아, 냐옹!');
    expect(p.pages.join(' ')).not.toContain('{c}');
  });
  it('쪽 나누기: 문장 단위로 36 글자 안쪽', () => {
    const pages = paginate('오오…… 어서…… 오세요…… 처음 보는…… 생물을…… 가져오면…… 전시해…… 드리죠……');
    expect(pages.length).toBeGreaterThan(1);
    for (const pg of pages) expect(Array.from(pg).length).toBeLessThanOrEqual(36);
    expect(pages.join(' ').replace(/\s+/g, '')).toBe('오오……어서……오세요……처음보는……생물을……가져오면……전시해……드리죠……');
    expect(paginate('짧아!')).toEqual(['짧아!']);
  });
  it('타자기: 한 글자씩, 소리는 글자에만, 높이는 목소리 ±8%', () => {
    expect(typedCount('안녕하세요', 0)).toBe(0);
    expect(typedCount('안녕하세요', 0.1)).toBe(2);
    expect(typedCount('안녕하세요', 99)).toBe(5);
    expect(pageDuration('안녕')).toBeGreaterThan(1);
    expect(isBlipChar('가')).toBe(true);
    expect(isBlipChar(' ')).toBe(false);
    expect(isBlipChar('!')).toBe(false);
    const p = blipPitch(1.2, '가');
    expect(p).toBeGreaterThanOrEqual(1.2 * 0.92);
    expect(p).toBeLessThanOrEqual(1.2 * 1.08);
  });
});

describe('우정(flags.npc)', () => {
  it('0~100 으로 자르고 하트는 20 마다', () => {
    const s = addFriend({ f: 95, met: true, last: 0, gifts: 0 }, 30);
    expect(s.after).toBe(F_MAX);
    expect(addFriend(s.flag, -500).after).toBe(0);
    expect(heartsOf(39)).toBe(1);
    expect(heartsOf(40)).toBe(2);
    expect(heartsOf(100)).toBe(5);
    expect(talkGain({ f: 0, met: true, last: 3, gifts: 0 }, 3)).toBe(0);
    expect(talkGain({ f: 0, met: true, last: 2, gifts: 0 }, 3)).toBe(1);
    for (let i = 0; i < 30; i++) { const g = requestGain(rngFor(`r${i}`)); expect(g).toBeGreaterThanOrEqual(5); expect(g).toBeLessThanOrEqual(10); }
    expect(normalizeFlag({ f: 250, met: 'yes' })).toEqual({ f: 100, met: false, last: -1, gifts: 0 });
  });
  it('하루 첫 대화만 +1, 저장하고 다시 불러와도 남는다', () => {
    const { game, svc } = setup({ day: 4 });
    const q = actor('npc_quack', 1, 0);
    svc.register(q.a);
    svc.talk('npc_quack');
    svc.talk('npc_quack');
    const fl = (game.state.flags.npc as Record<string, { f: number; met: boolean; last: number }>).npc_quack;
    expect(fl).toMatchObject({ f: 1, met: true, last: 4 });
    expect(svc.api.friendship('npc_quack')).toBe(1);
    game.flushSave();
    const again = makeFakeGame({ day: 5 });
    const s2 = createNpcService(again.asGame() as unknown as Game, { infos: [infoOf(QUACK)], rng: (k) => rngFor(k) });
    expect(s2.api.friendship('npc_quack')).toBe(1);
    s2.register(actor('npc_quack', 0, 0).a);
    s2.talk('npc_quack');
    expect(s2.api.friendship('npc_quack')).toBe(2);
  });
  it('부탁을 들어주면 +5~10, 하트가 늘면 befriend', () => {
    const { game, svc, ev } = setup();
    const n = actor('nabi', 1, 1);
    svc.register(n.a);
    (game.state.flags.npc as Record<string, unknown>).nabi = { f: 17, met: true, last: -1, gifts: 0 };
    game.state.emit({ type: 'request-done', id: 'req:0:npc:nabi', coins: 300, npc: 'nabi' });
    const f = svc.api.friendship('nabi');
    expect(f).toBeGreaterThanOrEqual(22);
    expect(f).toBeLessThanOrEqual(27);
    expect(ev.of('befriend')).toEqual([expect.objectContaining({ id: 'nabi', hearts: 1, kind: 'npc' })]);
    expect(n.reacts.some((r) => r.kind === 'happy')).toBe(true);
  });
});

describe('선물(GDD 4.6.1)', () => {
  const social = { likes: ['fish', 'sweet'] as const, dislikes: ['junk'] as const };
  const S = { likes: [...social.likes], dislikes: [...social.dislikes] };
  it('좋아함 +5 · 보통 +2 · 싫어함 −1 · 생일 ×3 · 하루 상한', () => {
    expect(giftDelta('fish', S)).toBe(5);
    expect(giftDelta('fruit', S)).toBe(2);
    expect(giftDelta('junk', S)).toBe(-1);
    expect(giftDelta('fish', S, { birthday: true })).toBe(15);
    expect(giftDelta('fruit', S, { birthday: true })).toBe(6);
    expect(giftDelta('junk', S, { birthday: true })).toBe(-3);
    expect(giftDelta('fish', S, { giftsToday: GIFTS_PER_DAY })).toBe(0);
  });
  it('선물 범주: 가방 키 → 범주', () => {
    expect(giftCategory('m_apple')).toBe('fruit');
    expect(giftCategory('m_honey')).toBe('sweet');
    expect(giftCategory('t_boot')).toBe('junk');
    expect(giftCategory('fos_trex_skull')).toBe('fossil');
    expect(giftCategory('m_wood')).toBe('material');
    expect(giftCategory('f_bench')).toBe('furniture');
    expect(giftCategory('f_carp@crown', { category: 'fish' })).toBe('fish');
    expect(giftCategory('b_bee', { category: 'bug' })).toBe('bug');
    expect(giftable('tool_rod')).toBe(false);
    expect(giftable('m_apple')).toBe(true);
    expect(isBirthdayToday(2, 30)).toBe(true);
    expect(isBirthdayToday(2, 31)).toBe(false);
  });
  it('서비스: 생일에 좋아하는 걸 주면 +15, 가방에서 빠지고 gift 이벤트', () => {
    const { game, svc, ev } = setup({ day: 28 + NABI.birthday });
    svc.register(actor('nabi', 1, 0).a);
    const fish: Species = { id: 'f_test', name: '테스트붕어', category: 'fish', rarity: 1 };
    game.state.register([fish]);
    game.state.addItem('f_test', 2);
    const r = svc.gift('nabi', 'f_test');
    expect(r?.delta).toBe(15);
    expect(game.state.bag.f_test).toBe(1);
    expect(ev.of('gift')).toEqual([expect.objectContaining({ npc: 'nabi', item: 'f_test', delta: 15 })]);
    expect(svc.api.friendship('nabi')).toBe(15);
    expect(svc.gift('nabi', 'tool_rod')).toBeNull();
    expect((game.state.flags.npc as Record<string, { gifts: number }>).nabi.gifts).toBe(1);
    expect(svc.api.birthdayOf('nabi')).toBe(NABI.birthday);
  });
});

describe('말 걸기 흐름', () => {
  it('npc-talk 에 NPC id 가 실린다', () => {
    const { svc, ev } = setup();
    svc.register(actor('npc_quack', 1, 0).a);
    const pages = svc.talk('npc_quack');
    expect(pages.length).toBeGreaterThan(0);
    expect(ev.of('npc-talk')).toEqual([expect.objectContaining({ npc: 'npc_quack' })]);
  });
  it('E 로 말 걸면 말풍선이 한 글자씩 차고, 다 끝나면 open-shop(quack)', () => {
    const { game, svc, ev } = setup();
    const q = actor('npc_quack', 1.2, 0);
    svc.register(q.a);
    game.tick(1 / 30, 1);
    expect(game.listInteractions().find((r) => r.id === 'characters-talk')?.label).toBe('꽥사장에게 말 걸기');
    game.input.press('KeyE');
    game.tick(1 / 30, 1);
    expect(ev.of('npc-talk')).toHaveLength(1);
    game.tick(1 / 30, 6);
    const shown = q.log.filter((l) => l.page).map((l) => l.shown);
    expect(shown.length).toBeGreaterThan(2);
    expect(shown[shown.length - 1]).toBeLessThan(Array.from(q.log[q.log.length - 1].page!).length);
    expect(game.listInteractions().find((r) => r.id === 'characters-talk')?.label).toBe('다음 ▶');
    expect(ev.of('open-shop')).toHaveLength(0);
    runOut(game);
    expect(ev.of('open-shop')).toEqual([expect.objectContaining({ shop: 'quack' })]);
    expect(q.log[q.log.length - 1].page).toBeNull();
    expect(svc.conv()).toBeNull();
  });
  it('E 를 누르면 치는 중엔 다 보이고, 그다음 쪽으로', () => {
    const { game, svc, ev } = setup();
    const q = actor('npc_quack', 1.2, 0);
    svc.register(q.a);
    const pages = svc.talk('npc_quack');
    game.tick(1 / 30, 2);
    svc.advance();
    game.tick(1 / 30, 1);
    const last = q.log[q.log.length - 1];
    expect(last.shown).toBe(Array.from(pages[0]).length);
    for (let i = 0; i < pages.length; i++) { svc.advance(); svc.advance(); game.tick(1 / 30, 1); }
    expect(ev.of('open-shop')).toHaveLength(1);
  });
  it('느릿 관장은 open-museum, 주민은 메뉴 창(npc)', () => {
    const { game, svc, ev } = setup();
    svc.register(actor('npc_slow', 1, 0).a);
    svc.talk('npc_slow');
    runOut(game, 60);
    expect(ev.of('open-museum')).toHaveLength(1);
    svc.register(actor('nabi', 1, 1).a);
    svc.talk('nabi');
    runOut(game);
    expect(game.hud.current()).toMatchObject({ kind: 'npc', tab: 'talk' });
    expect((game.hud.current()?.arg as { id: string }).id).toBe('nabi');
  });
  it('멀리 걸어가면 대화가 끊기고 창은 안 열린다', () => {
    const { game, svc, ev } = setup();
    svc.register(actor('npc_quack', 1, 0).a);
    svc.talk('npc_quack');
    game.player.pos.set(40, 0, 40);
    runOut(game);
    expect(ev.of('open-shop')).toHaveLength(0);
  });
  it('꽥사장 오늘 첫 대화: 인기 생물을 말하고 HUD 토스트', () => {
    const econ = { day: () => 4, market: () => ({ day: 4, hot: ['f_mackerel'], mult: {} }), rocket: () => ({ count: 1, blueprint: true }) };
    const { game, svc } = setup({ econ });
    game.state.register([{ id: 'f_mackerel', name: '고등어', category: 'fish', rarity: 1 }]);
    (game.state.flags.npc as Record<string, unknown>).npc_quack = { f: 5, met: true, last: 1, gifts: 0 };
    svc.register(actor('npc_quack', 1, 0).a);
    const pages = svc.talk('npc_quack');
    expect(pages[0]).toContain('오늘은 고등어가 인기래!');
    expect(game.hudLog.toasts.some((t: string) => t.includes('오늘은 고등어가 인기래!'))).toBe(true);
  });
  it('펭박사: 가장 가까운 자리가 말하고 부품 수를 말한다', () => {
    const econ = { day: () => 0, rocket: () => ({ count: 3, blueprint: true }) };
    const { svc } = setup({ econ });
    const far = actor('npc_peng', 300, -2300, 'npc_peng@pengLab');
    const near = actor('npc_peng', 2, 0, 'npc_peng@pier');
    svc.register(far.a); svc.register(near.a);
    const pages = svc.talk('npc_peng');
    expect(pages.join(' ')).toContain('3/6');
    expect(near.log.length).toBeGreaterThan(0);
    expect(far.log.length).toBe(0);
    expect(svc.api.spawnAt('npc_peng', 5, 5)).toBe(true);
  });
  it('부탁이 있으면 \'!\'(requestsFor)', () => {
    const econ = { day: () => 0, requestsFor: (id: string) => (id === 'nabi' ? [{ id: 'r', n: 1, reward: 1, done: false }] : []) };
    const { game, svc } = setup({ econ });
    const n = actor('nabi', 1, 0), q = actor('npc_quack', 2, 0);
    svc.register(n.a); svc.register(q.a);
    game.tick(1 / 30, 2);
    expect(n.st.news).toBe(true);
    expect(q.st.news).toBe(false);
  });
  it('ext.npc 모양 · addDialog', () => {
    const { svc } = setup();
    expect(svc.api.list().map((x) => x.id)).toEqual(expect.arrayContaining(['npc_quack', 'npc_slow', 'npc_peng', 'npc_mongsil', 'nabi']));
    svc.api.addDialog('nabi', ['새 대사야, {c}!']);
    svc.register(actor('nabi', 1, 0).a);
    (svc as unknown as { flagOf: (id: string) => unknown }).flagOf('nabi');
    expect(svc.api.name('npc_quack')).toBe('꽥사장');
  });
});

describe('반응', () => {
  it('clap: 15 m 안의 NPC 만 박수, ★4 잡기도 박수', () => {
    const { game, svc } = setup();
    const a = actor('nabi', 5, 0), b = actor('npc_quack', 40, 0);
    svc.register(a.a); svc.register(b.a);
    game.tick(1 / 30, 1);
    game.state.emit({ type: 'clap', x: 0, z: 0 });
    expect(a.reacts.map((r) => r.kind)).toEqual(['clap']);
    expect(b.reacts).toHaveLength(0);
    game.tick(1 / 30, 60);
    game.state.emit({ type: 'catch', activity: 'fish', species: 'x', rarity: 4, combo: 0 });
    expect(a.reacts.filter((r) => r.kind === 'clap')).toHaveLength(2);
  });
  it('launch-wave: 발사대 근처·내 근처 NPC 가 로켓 쪽을 보고 손 흔들기', () => {
    const { game, svc } = setup();
    const a = actor('nabi', 3, 0), far = actor('npc_quack', 1500, 1500);
    svc.register(a.a); svc.register(far.a);
    game.state.emit({ type: 'launch-wave' });
    expect(a.reacts[0]).toMatchObject({ kind: 'wave' });
    expect(typeof a.reacts[0].x).toBe('number');
    expect(far.reacts).toHaveLength(0);
  });
});

describe('저장 옮기기(flags.npc)', () => {
  it('toto → res_toto_home, bori → npc_mongsil, 둘 다 있으면 합친다', () => {
    const m = migrateNpcFlags({ toto: { f: 30, met: true, last: 2, gifts: 1 }, bori: { f: 10, met: true, last: 5, gifts: 2 }, npc_mongsil: { f: 25, met: false, last: 1, gifts: 1 }, nabi: { f: 3, met: true, last: 0, gifts: 0 } });
    expect(m.changed).toBe(true);
    expect(m.flags.toto).toBeUndefined();
    expect(m.flags.bori).toBeUndefined();
    expect(m.flags.res_toto_home).toEqual({ f: 30, met: true, last: 2, gifts: 1 });
    expect(m.flags.npc_mongsil).toEqual({ f: 25, met: true, last: 5, gifts: 3 });
    expect(m.flags.nabi).toEqual({ f: 3, met: true, last: 0, gifts: 0 });
    expect(migrateNpcFlags(m.flags).changed).toBe(false);
    expect(migrateNpcFlags(undefined)).toEqual({ flags: {}, changed: true });
  });
  it('서비스가 켜질 때 옮겨서 저장한다', () => {
    const g0 = makeFakeGame();
    g0.state.flags.npc = { toto: { f: 40, met: true, last: 1, gifts: 0 }, bori: { f: 12, met: true, last: 1, gifts: 0 } };
    g0.flushSave();
    const game = makeFakeGame();
    const svc = createNpcService(game.asGame() as unknown as Game, { infos: [infoOf(MONG)], rng: (k) => rngFor(k) });
    expect(Object.keys(game.state.flags.npc as object).sort()).toEqual(['npc_mongsil', 'res_toto_home']);
    expect(svc.api.friendship('npc_mongsil')).toBe(12);
    const raw = JSON.parse(localStorage.getItem('dopamine-land-save-v1') ?? '{}');
    expect(raw.flags.npc.res_toto_home.f).toBe(40);
  });
  it('주민 데이터: toto 는 res_toto_home(토리), 모두 생일·좋아하는 것', () => {
    expect(RESIDENTS.find((r) => r.id === 'toto')).toBeUndefined();
    expect(RESIDENTS.find((r) => r.id === 'res_toto_home')?.name).toBe('토리');
    for (const r of [...RESIDENTS, ...FACILITY_NPCS]) {
      expect(r.birthday).toBeGreaterThanOrEqual(0);
      expect(r.birthday).toBeLessThan(28);
      expect(r.likes.length).toBeGreaterThan(0);
    }
    expect(FACILITY_NPCS.map((n) => n.id)).toEqual(expect.arrayContaining(['npc_quack', 'npc_slow', 'npc_peng', 'npc_mongsil', 'npc_peli']));
  });
});
