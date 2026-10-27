// story — 챕터 고르기 · 체인 상태 기계 · 이벤트로 도는 체인 7개 · 별조각 한 번씩 · 엔딩 발동(가짜 게임, 화면 없이).
// econ 은 기록하는 작은 대역(give·해금·기증·화석 골격·로켓), ext.npc 는 주인 이름만 아는 대역을 쓴다.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFakeGame, makeCtx, recordEvents, type FakeGame, type FakeEnv } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import type { EconApi } from '../src/core/api';
import type { Species } from '../src/core/state';
import buildStory from '../src/modules/story';
import { CHAINS, CHAPTERS, PIECES_TOTAL, TOTO_ID } from '../src/modules/story/data';
import { chainProgress, talkStep, tickStep, zodiacNeed, type ChainFacts } from '../src/modules/story/chains';
import {
  deriveChapter, nextChapter, chapterGoals, ensureStory, endingStep, introReady, pickTarget, type ChapterFacts,
} from '../src/modules/story/logic';

// ───────────── 대역 ─────────────
interface FakeEcon { given: Array<[string, number]>; unlocks: Set<string>; donated: Set<string>; skeletons: string[]; parts: number; api: EconApi }
function fakeEcon(game: FakeGame): FakeEcon {
  const fe: FakeEcon = { given: [], unlocks: new Set(), donated: new Set(), skeletons: [], parts: 0, api: null as unknown as EconApi };
  fe.api = {
    give: (id: string, n: number) => { fe.given.push([id, n]); game.state.addItem(id, n); return n; },
    isUnlocked: (k: string) => fe.unlocks.has(k),
    unlock: (k: string) => { fe.unlocks.add(k); game.state.emit({ type: 'unlock', key: k }); },
    isDonated: (id: string) => fe.donated.has(id),
    skeletonsDone: () => fe.skeletons,
    rocket: () => {
      const n = fe.parts;
      return { blueprint: fe.unlocks.has('rocket:blueprint'), parts: { body: n > 0, engine: n > 1, window: n > 2, wing: n > 3, fuel: n > 4, chip: n > 5 }, count: n, pad: fe.unlocks.has('rocket:pad') };
    },
    day: () => Math.floor(game.env?.day ?? 0),
  } as unknown as EconApi;
  game.econ = fe.api;
  return fe;
}
const OWNERS = new Map([['npc_mongsil', '곰 몽실'], ['npc_bodeul', '보들'], ['npc_owl_prof', '부엉 교수'], ['npc_grandma', '목길이 할머니'],
  ['npc_snow_elder', '흰눈 영감'], ['npc_saltstar', '소금별'], ['npc_ppippo', '삐뽀']]);
function fakeNpc(game: FakeGame, present = true) {
  const dialogs = new Map<string, string[]>();
  game.ext.npc = {
    name: (id: string) => (present || id === 'npc_mongsil' ? OWNERS.get(id) ?? null : null),
    addDialog: (id: string, lines: string[]) => { dialogs.set(id, [...(dialogs.get(id) ?? []), ...lines]); },
  };
  return dialogs;
}

type Story = {
  chapter(): number; pieces(): number; restored(): boolean; ended(): boolean; met(): boolean; playing(): string | null;
  chains(): Array<{ no: number; owner: string; status: string; have: number; need: number }>;
  target(): { x: number; z: number; name: string; id: string } | null;
};
type Dbg = { intro(): boolean; meet(): boolean; state(): Record<string, unknown> };

function boot(o: { owners?: boolean; hour?: number } = {}) {
  const game = makeFakeGame({ hour: o.hour ?? 12 });
  const econ = fakeEcon(game);
  const dialogs = fakeNpc(game, o.owners !== false);
  const ev = recordEvents(game);
  const ctx = makeCtx(game);
  buildStory(ctx as never);
  const story = game.ext.story as Story;
  const dbg = (globalThis as unknown as { __story: Dbg }).__story;
  const step = (sec = 0.5) => game.tick(0.1, Math.round(sec / 0.1));
  return { game, econ, ev, story, step, dbg, dialogs, env: game.env as FakeEnv };
}
/** 인트로 → 토토 만나기까지(연출 끝까지 돌린다) */
function meetToto(b: ReturnType<typeof boot>) {
  b.dbg.meet();
  b.step(5);
  expect(b.story.met()).toBe(true);
}
const talk = (b: ReturnType<typeof boot>, npc: string) => { b.game.state.emit({ type: 'npc-talk', npc }); b.step(0.4); };
const status = (b: ReturnType<typeof boot>, no: number) => b.story.chains().find((c) => c.no === no)!.status;
const zodiacFish = (n: number): Species[] => Array.from({ length: n }, (_, i) => ({ id: `f_zodiac_${i}`, name: `별자리${i}`, category: 'fish', rarity: 3, tags: ['set:zodiac'] }));

beforeEach(() => { stubLocalStorage(); (globalThis as { window?: unknown }).window ??= globalThis; });

// ───────────── 순수: 챕터 ─────────────
const facts = (o: Partial<ChapterFacts> & { keys?: string[]; disc?: string[] } = {}): ChapterFacts => ({
  isUnlocked: (k) => (o.keys ?? []).includes(k),
  discovered: (id) => (o.disc ?? []).includes(id),
  parts: 0, pad: false, blueprint: false, moon: false, planets: 0, lighthouses: 0, pieces: 0, mongsilDone: false, ended: false,
  ...o,
});

describe('챕터 고르기', () => {
  it('해금·발견에서 1~6장', () => {
    expect(CHAPTERS.map((c) => c.name)).toEqual(['정착', '첫 항해', '공룡과 눈', '사막', '발사', '우주']);
    expect(deriveChapter(facts())).toBe(1);
    expect(deriveChapter(facts({ keys: ['house:1', 'tool:shovel'] }))).toBe(1);
    expect(deriveChapter(facts({ keys: ['v:raft'] }))).toBe(2);
    expect(deriveChapter(facts({ disc: ['coral'] }))).toBe(2);
    expect(deriveChapter(facts({ keys: ['v:raft', 'v:tugboat'] }))).toBe(3);
    expect(deriveChapter(facts({ disc: ['coral', 'dino'] }))).toBe(3);
    expect(deriveChapter(facts({ disc: ['desert'] }))).toBe(4);
    expect(deriveChapter(facts({ keys: ['v:motorboat'], blueprint: true }))).toBe(5);
    expect(deriveChapter(facts({ parts: 2 }))).toBe(5);
    expect(deriveChapter(facts({ moon: true }))).toBe(6);
  });
  it('되돌아가지 않는다 · 목표 줄', () => {
    expect(nextChapter(4, facts())).toBe(4);
    expect(nextChapter(2, facts({ moon: true }))).toBe(6);
    const g1 = chapterGoals(1, facts({ keys: ['house:1', 'tool:rod', 'tool:net', 'tool:shovel', 'tool:hammer'] }));
    expect(g1.filter((g) => g.done).length).toBe(2);
    const g5 = chapterGoals(5, facts({ parts: 6, pad: true }));
    expect(g5.map((g) => g.done)).toEqual([true, true, false]);
    const g6 = chapterGoals(6, facts({ moon: true, planets: 3, pieces: 7, ended: true }));
    expect(g6.every((g) => g.done)).toBe(true);
  });
  it('수평선 목표: 토토 → 챕터 랜드마크 → 되살린 뒤 발사대', () => {
    const lms = [
      { id: 'lm:coral:lighthouse', kind: 'lighthouse', island: 'coral', name: '산호빛섬 등대', x: 500, z: 1200 },
      { id: 'lm:desert:pyramid', kind: 'pyramid', island: 'desert', name: '모래 피라미드', x: 2000, z: 900 },
      { id: 'lm:launch:launchpad', kind: 'launchpad', island: 'launch', name: '도파민 1호 발사대', x: 300, z: -2380 },
    ];
    const base = { landmarks: lms, islandCenter: () => ({ x: 1, z: 2 }), islandName: (id: string) => id, crater: { x: 5, z: 6 }, restored: false, ended: false };
    expect(pickTarget({ ...base, chapter: 1, intro: 'fell' })?.id).toBe('story:crater');
    expect(pickTarget({ ...base, chapter: 1, intro: 'met' })?.id).toBe('lm:coral:lighthouse');
    expect(pickTarget({ ...base, chapter: 2, intro: 'met' })?.id).toBe('island:dino'); // 화산 랜드마크가 없으면 섬 중심
    expect(pickTarget({ ...base, chapter: 3, intro: 'met' })?.id).toBe('lm:desert:pyramid');
    expect(pickTarget({ ...base, chapter: 3, intro: 'met', restored: true })?.id).toBe('lm:launch:launchpad');
    expect(pickTarget({ ...base, chapter: 6, intro: 'met' })).toBeNull();
    expect(pickTarget({ ...base, chapter: 6, intro: 'met', ended: true, restored: true })).toBeNull();
  });
  it('인트로 시작 조건: 첫 밤 · 지구 · 한가할 때', () => {
    const g = { intro: 'none' as const, earth: true, night: true, waited: 0, busy: false };
    expect(introReady(g, 120)).toBe(true);
    expect(introReady({ ...g, night: false }, 120)).toBe(false);
    expect(introReady({ ...g, busy: true }, 120)).toBe(false);
    expect(introReady({ ...g, earth: false }, 120)).toBe(false);
    expect(introReady({ ...g, intro: 'fell' as never }, 120)).toBe(false);
    expect(introReady({ ...g, night: null, waited: 10 }, 120)).toBe(false);
    expect(introReady({ ...g, night: null, waited: 130 }, 120)).toBe(true);
  });
  it('flags.story 고쳐 깔기', () => {
    const flags: Record<string, unknown> = { story: { intro: 'met', chapter: 9, pieces: [1, 1, 3, 12, 'x'], chains: { 1: { s: 'done' }, 2: { s: 'weird' } }, ending: 'playing' } };
    const s = ensureStory(flags);
    expect(s.chapter).toBe(6);
    expect(s.pieces).toEqual([1, 3]);
    expect(s.chains['1'].s).toBe('done');
    expect(s.chains['2'].s).toBe('idle');
    expect(s.ending).toBe('armed');
    expect(flags.story).toBe(s);
  });
});

// ───────────── 순수: 체인 ─────────────
const cf = (o: Partial<ChainFacts> = {}): ChainFacts => ({ secrets: [], released: {}, given: [], skeletons: 0, shown: [], zodiacDonated: 0, zodiacTotal: 12, ...o });
describe('체인 상태 기계', () => {
  it('7개 · 주인 id 고정 · 별조각 id', () => {
    expect(CHAINS.map((c) => c.owner)).toEqual(['npc_mongsil', 'npc_bodeul', 'npc_owl_prof', 'npc_grandma', 'npc_snow_elder', 'npc_saltstar', 'npc_ppippo']);
    expect(CHAINS.map((c) => c.piece)).toEqual(Array.from({ length: 7 }, (_, i) => `it_starpiece_${i + 1}`));
    expect(PIECES_TOTAL).toBe(7);
  });
  it('진행: 조건마다', () => {
    const [c1, c2, c3, c4, c5, c6, c7] = CHAINS;
    expect(chainProgress(c1, cf({ secrets: ['home-waterfall-cave'] })).met).toBe(true);
    expect(chainProgress(c2, cf({ given: ['d_spyglass'] })).met).toBe(true);
    expect(chainProgress(c3, cf({ released: { firefly: 29 } })).met).toBe(false);
    expect(chainProgress(c3, cf({ released: { firefly: 31 } })).have).toBe(30);
    expect(chainProgress(c4, cf({ secrets: ['dino-mural-cave'], skeletons: 4 })).met).toBe(false);
    expect(chainProgress(c4, cf({ secrets: [], skeletons: 5 })).met).toBe(false);
    expect(chainProgress(c4, cf({ secrets: ['dino-mural-cave'], skeletons: 5 })).met).toBe(true);
    expect(chainProgress(c5, cf({ shown: ['b_aurora_butterfly'] })).met).toBe(true);
    expect(chainProgress(c6, cf({ secrets: ['desert-temple'] })).met).toBe(true);
    expect(chainProgress(c7, cf({ zodiacDonated: 11 })).met).toBe(false);
    expect(chainProgress(c7, cf({ zodiacDonated: 12 })).met).toBe(true);
    expect(zodiacNeed(12, 0)).toBe(12);
    expect(zodiacNeed(12, 5)).toBe(5);
  });
  it('말 걸기 · 판정 단계', () => {
    expect(talkStep('idle', false)).toEqual({ status: 'asked', grant: false, say: 'ask' });
    expect(talkStep('asked', false)).toEqual({ status: 'asked', grant: false, say: 'wait' });
    expect(talkStep('idle', true)).toEqual({ status: 'done', grant: true, say: 'thanks' });
    expect(talkStep('ready', true).grant).toBe(true);
    expect(talkStep('done', true)).toEqual({ status: 'done', grant: false, say: 'after' });
    expect(tickStep({ claim: 'owner' }, 'asked', true, true)).toEqual({ status: 'ready', grant: false, say: 'ready' });
    expect(tickStep({ claim: 'owner' }, 'asked', true, false).grant).toBe(true); // 주인이 세상에 없으면 그 자리에서
    expect(tickStep({ claim: 'spot' }, 'idle', true, true).grant).toBe(true);
    expect(tickStep({ claim: 'owner' }, 'ready', true, true).say).toBeNull();
    expect(tickStep({ claim: 'owner' }, 'done', true, true).grant).toBe(false);
  });
});

// ───────────── 순수: 엔딩 ─────────────
describe('엔딩 상태 기계', () => {
  const C = { restored: true, fallbackSec: 14 };
  it('되살린 뒤 발사 → 우주 도착 → 연출 → 끝(한 번)', () => {
    expect(endingStep('none', { kind: 'launch' }, { ...C, restored: false }).state).toBe('none');
    let s = endingStep('none', { kind: 'launch' }, C);
    expect(s.state).toBe('armed');
    expect(endingStep('armed', { kind: 'arrive', to: 'earth' }, C).play).toBe(false);
    s = endingStep('armed', { kind: 'arrive', to: 'moon' }, C);
    expect(s).toEqual({ state: 'playing', play: true, emit: false });
    s = endingStep('playing', { kind: 'finish' }, C);
    expect(s).toEqual({ state: 'done', play: false, emit: true });
    expect(endingStep('done', { kind: 'launch' }, C).state).toBe('done');
    expect(endingStep('done', { kind: 'finish' }, C).emit).toBe(false);
  });
  it('우주에 있거나 한참 지나면(우주 모듈 없음) 그 자리에서', () => {
    expect(endingStep('armed', { kind: 'tick', world: 'space', sinceLaunch: 3 }, C).play).toBe(true);
    expect(endingStep('armed', { kind: 'tick', world: 'earth', sinceLaunch: 5 }, C).play).toBe(false);
    expect(endingStep('armed', { kind: 'tick', world: 'earth', sinceLaunch: 15 }, C).play).toBe(true);
  });
});

// ───────────── 모듈: 인트로 · 토토 ─────────────
describe('인트로와 토토', () => {
  it('첫 밤에 별똥별이 떨어지고, 구덩이에서 토토를 만난다', () => {
    const b = boot({ hour: 12 });
    b.step(2);
    expect(b.dbg.state().intro).toBe('none');
    b.env.setHour(22);
    b.step(1);
    expect(b.story.playing()).toBe('intro');
    b.step(8);
    expect(b.story.playing()).toBeNull();
    expect(b.dbg.state().intro).toBe('fell');
    expect(b.story.target()?.id).toBe('story:crater');
    // 구덩이에서 E
    const cr = (b.dbg.state().crater as { x: number; z: number });
    b.game.player.teleport(cr.x + 2, cr.z);
    b.step(0.2);
    expect(b.game.interact('story:crater')).toBe(true);
    expect(b.story.playing()).toBe('meet');
    expect(b.game.player.locked).toBe(true);
    b.step(5);
    expect(b.story.met()).toBe(true);
    expect(b.game.player.locked).toBe(false);
    expect(b.game.hudLog.banners.some((x) => x.text.includes('Toto를 집에 보내 주자'))).toBe(true);
    // 토토와 이야기
    const tp = (b.game.ext.story as { totoPos(): { x: number; z: number } }).totoPos();
    b.game.player.teleport(tp.x + 1, tp.z);
    b.step(0.2);
    expect(b.game.interact('story:toto')).toBe(true);
    expect(b.ev.of('npc-talk').some((e) => e.npc === TOTO_ID)).toBe(true);
    // 다시 불러와도 인트로는 다시 안 한다
    b.game.flushSave();
    const b2 = boot({ hour: 23 });
    b2.step(2);
    expect(b2.story.met()).toBe(true);
    expect(b2.story.playing()).toBeNull();
  });
  it('주인 대사에 체인 힌트를 섞는다', () => {
    const b = boot();
    b.step(0.3);
    for (const c of CHAINS) expect(b.dialogs.get(c.owner)?.[0]).toBe(c.hint);
  });
});

// ───────────── 모듈: 체인 7개(이벤트로) ─────────────
describe('체인 7개는 이벤트로 돌고 별조각은 한 번씩', () => {
  it('①~⑦ 모두', () => {
    const b = boot();
    meetToto(b);
    const st = b.game.state;
    // ① 폭포 뒤 동굴 → 그 자리에서
    st.emit({ type: 'secret-found', id: 'home-waterfall-cave' });
    b.step(0.5);
    expect(status(b, 1)).toBe('done');
    expect(st.bag.it_starpiece_1).toBe(1);
    st.emit({ type: 'secret-found', id: 'home-waterfall-cave' });
    talk(b, 'npc_mongsil');
    expect(st.bag.it_starpiece_1).toBe(1);

    // ② 보들: 부탁 듣고 → 망원경을 가방에 넣고 말 걸면 건넨다
    talk(b, 'npc_bodeul');
    expect(status(b, 2)).toBe('asked');
    expect(b.game.hudLog.cards.some((c) => c.title.includes('보들'))).toBe(true);
    st.addItem('d_spyglass', 1);
    talk(b, 'npc_bodeul');
    expect(status(b, 2)).toBe('done');
    expect(st.bag.d_spyglass ?? 0).toBe(0);
    expect(st.bag.it_starpiece_2).toBe(1);

    // ③ 반딧불이 30마리 놓아주기(release) → ready → 부엉 교수에게
    for (let i = 0; i < 3; i++) st.emit({ type: 'release', species: 'bug-firefly', n: 10, where: 'mushroom' });
    st.emit({ type: 'release', species: 'f_carp', n: 50, where: 'home' }); // 반딧불이 아님
    b.step(0.5);
    expect(status(b, 3)).toBe('ready');
    expect(st.bag.it_starpiece_3 ?? 0).toBe(0);
    talk(b, 'npc_owl_prof');
    expect(st.bag.it_starpiece_3).toBe(1);

    // ④ 벽화 동굴 + 화석 골격 5
    st.emit({ type: 'secret-found', id: 'dino-mural-cave' });
    b.econ.skeletons = ['a', 'b', 'c', 'd'];
    b.step(2.5);
    expect(status(b, 4)).not.toBe('ready');
    b.econ.skeletons.push('e');
    b.step(2.5);
    expect(status(b, 4)).toBe('ready');
    talk(b, 'npc_grandma');
    expect(st.bag.it_starpiece_4).toBe(1);

    // ⑤ 오로라 밤 오로라나비: 맑은 날 잡으면 안 되고, 오로라 때 잡으면
    const aurora: Species = { id: 'b_aurora_butterfly', name: '오로라나비', category: 'bug', rarity: 5 };
    st.emit({ type: 'catch', activity: 'bug', species: aurora, rarity: 5, combo: 1 });
    b.step(0.5);
    expect(status(b, 5)).toBe('idle');
    b.env.forceWeather('*', 'aurora');
    st.emit({ type: 'catch', activity: 'bug', species: aurora, rarity: 5, combo: 1 });
    b.step(0.5);
    talk(b, 'npc_snow_elder');
    expect(st.bag.it_starpiece_5).toBe(1);

    // ⑥ 사막 신전
    talk(b, 'npc_saltstar');
    expect(status(b, 6)).toBe('asked');
    st.emit({ type: 'secret-found', id: 'desert-temple' });
    b.step(0.5);
    expect(status(b, 6)).toBe('ready');
    talk(b, 'npc_saltstar');
    expect(st.bag.it_starpiece_6).toBe(1);

    // ⑦ 별자리 물고기 12종 기증
    st.register(zodiacFish(12));
    for (let i = 0; i < 11; i++) b.econ.donated.add(`f_zodiac_${i}`);
    st.emit({ type: 'donate', id: 'f_zodiac_10', n: 1, coins: 0 });
    b.step(1.5);
    expect(status(b, 7)).not.toBe('ready');
    b.econ.donated.add('f_zodiac_11');
    st.emit({ type: 'donate', id: 'f_zodiac_11', n: 1, coins: 0 });
    b.step(1.5);
    expect(status(b, 7)).toBe('ready');
    talk(b, 'npc_ppippo');
    expect(st.bag.it_starpiece_7).toBe(1);

    // 한 번씩만: 다 받은 뒤 또 말 걸고 또 이벤트가 와도
    for (const c of CHAINS) talk(b, c.owner);
    st.emit({ type: 'secret-found', id: 'desert-temple' });
    b.step(1);
    for (let n = 1; n <= 7; n++) expect(st.bag[`it_starpiece_${n}`]).toBe(1);
    expect(b.econ.given.filter(([id]) => id.startsWith('it_starpiece_')).length).toBe(7);
    expect(b.story.pieces()).toBe(7);
    expect(b.story.restored()).toBe(true);
  });
  it('주인 NPC 가 없으면 다 모은 순간 그 자리에서 준다 · 보들 선물(gift) 이벤트도', () => {
    const b = boot({ owners: false });
    meetToto(b);
    const st = b.game.state;
    st.emit({ type: 'secret-found', id: 'desert-temple' });
    b.step(0.5);
    expect(status(b, 6)).toBe('done');
    expect(st.bag.it_starpiece_6).toBe(1);
    st.emit({ type: 'gift', npc: 'npc_bodeul', item: 'd_spyglass@shiny', delta: 2 });
    b.step(0.5);
    expect(st.bag.it_starpiece_2).toBe(1);
  });
});

// ───────────── 모듈: 엔딩 ─────────────
describe('엔딩', () => {
  it('별조각 7개 → 발사 → 우주 도착 → 엔딩 이벤트 한 번', () => {
    const b = boot();
    meetToto(b);
    const st = b.game.state;
    // 별조각 없이 발사하면 엔딩 없음
    st.emit({ type: 'launch', to: 'moon' });
    b.step(1);
    expect(b.dbg.state().ending).toBe('none');
    expect(b.story.chapter()).toBe(6); // 달에 갔으니 우주 챕터
    const dbg = (globalThis as unknown as { __story: { grant(no: number): boolean } }).__story;
    for (let n = 1; n <= 7; n++) dbg.grant(n);
    expect(b.story.restored()).toBe(true);
    st.emit({ type: 'launch', to: 'moon' });
    b.step(0.3);
    expect(b.dbg.state().ending).toBe('armed');
    b.game.setWorld('space');
    st.emit({ type: 'arrive', to: 'moon' });
    b.step(0.3);
    expect(b.story.playing()).toBe('ending');
    expect(b.game.player.locked).toBe(true);
    b.step(14);
    expect(b.story.playing()).toBeNull();
    expect(b.story.ended()).toBe(true);
    expect(b.ev.of('ending').length).toBe(1);
    expect(b.game.player.locked).toBe(false);
    // 또 발사해도 다시 안 한다
    b.game.setWorld('earth');
    st.emit({ type: 'launch', to: 'moon' });
    b.game.setWorld('space');
    st.emit({ type: 'arrive', to: 'moon' });
    b.step(16);
    expect(b.ev.of('ending').length).toBe(1);
    expect(b.story.target()).toBeNull();
  });
  it('우주 모듈이 없으면 발사 뒤 지구에서라도', () => {
    const b = boot();
    meetToto(b);
    const dbg = (globalThis as unknown as { __story: { grant(no: number): boolean } }).__story;
    for (let n = 1; n <= 7; n++) dbg.grant(n);
    b.game.state.emit({ type: 'launch', to: 'moon' });
    b.step(15);
    expect(b.story.playing()).toBe('ending');
    b.step(14);
    expect(b.ev.of('ending').length).toBe(1);
  });
});
