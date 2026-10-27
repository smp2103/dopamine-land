// npcs-p1: 섬 주인 7(id 고정 — story 가 쓴다) · 역할 NPC 대화 끝 이벤트(open-shop/open-craft/감정 창) ·
// 이주(섬 집 수 · 다음 주민 · 고정 주민 · 저장 유지 · list 에 안 온 이주민 빼기) · 우정 100 이사 제안 + 사진은 한 번만 ·
// 프로 박사 감정(300 코인 · P0 1/5 · 같은 조각 두 번 안 함) · addDialog key/pin · 통통 집 증축 대사 · 주민끼리 수다 · 특별 모델.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { makeFakeGame, recordEvents, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import { sceneStats, allFinite } from './kit/three';
import { createNpcService, photoItem, APPRAISE_COST, type NpcActor, type NpcInfo } from '../src/modules/characters/npc';
import {
  FACILITY_NPCS, RESIDENTS, MIGRANTS, ROSTER16, ISLAND_OWNERS, OWNER_IDS, ISLAND_CAP, CHATTER, type FacilityNpcDef, type ResidentDef,
} from '../src/modules/characters/data';
import { checkMoveIn, nextResident, capacityLeft, population, candidates, proposalIsland, type ResidentRow } from '../src/modules/characters/migration';
import { selectDialog, houseLine, normalizeFlag, migrateNpcFlags, PROP_PENDING, PROP_DONE, PROP_MOVED } from '../src/modules/characters/dialog';
import { createChatter, findPair, fillChat, pickChat, type ChatActor } from '../src/modules/characters/chatter';
import { buildSpecial, SPECIAL_KINDS, SPECIAL_ZOO } from '../src/modules/characters/special';
import { rngFor } from '../src/core/rng';
import type { Game } from '../src/core/game';

const infoOfFacility = (n: FacilityNpcDef): NpcInfo => ({
  id: n.id, name: n.name, island: n.island, accent: n.accent, kind: 'facility', owner: n.owner,
  social: { birthday: n.birthday, likes: n.likes, dislikes: n.dislikes, voice: n.voice },
  talk: { id: n.id, catchphrase: n.catchphrase, first: n.first, usual: n.usual, tod: n.tod, role: n.role }, after: n.after,
});
const infoOfResident = (r: ResidentDef, migrant = false): NpcInfo => ({
  id: r.id, name: r.name, island: r.island, accent: r.accent, kind: 'resident', migrant,
  social: { birthday: r.birthday, likes: r.likes, dislikes: r.dislikes, voice: r.voice },
  talk: { id: r.id, catchphrase: r.catchphrase, first: ['안녕!'], usual: r.lines ?? ['안녕!'] }, after: { type: 'menu' },
});
const ALL_INFOS = () => [...FACILITY_NPCS.map(infoOfFacility), ...RESIDENTS.map((r) => infoOfResident(r)), ...MIGRANTS.map((r) => infoOfResident(r, true))];

/** 플레이어 옆에 선 가짜 자리 */
function actor(id: string, at = new THREE.Vector3(0, 0, 0)): NpcActor {
  const p = at.clone();
  return { key: id, id, pos: () => p, present: () => true, say: () => {}, moveTo: (x, z) => p.set(x, 0, z) };
}

function setup(o: { here?: string; econ?: Record<string, unknown>; load?: boolean; game?: FakeGame } = {}) {
  const game = o.game ?? makeFakeGame({ pos: [0, 0], day: 0, hour: 10, load: o.load });
  if (o.econ) (game as unknown as { econ: unknown }).econ = o.econ;
  const moves: Array<{ id: string; island: string; x: number; z: number; from: string | null }> = [];
  let slot = 0;
  const svc = createNpcService(game.asGame() as unknown as Game, {
    infos: ALL_INFOS(),
    rng: (k) => rngFor(k),
    place: () => ({ x: 100 + (slot++) * 6, z: 50 }),
    onMove: (id, island, x, z, from) => moves.push({ id, island, x, z, from }),
    here: () => o.here ?? null,
  });
  const ev = recordEvents(game);
  return { game, svc, ev, moves };
}
const runOut = (game: FakeGame, sec = 40) => game.tick(1 / 30, Math.ceil(sec * 30));

beforeEach(() => { stubLocalStorage(); });

describe('섬 주인(GDD 4.6.2 — story 가 이 id 로 부른다)', () => {
  const STORY_IDS = ['npc_mongsil', 'npc_bodeul', 'npc_owl_prof', 'npc_grandma', 'npc_snow_elder', 'npc_saltstar', 'npc_ppippo'];
  it('일곱 섬 주인 id 가 고정이고 모두 NPC 표에 있다', () => {
    expect([...OWNER_IDS].sort()).toEqual([...STORY_IDS].sort());
    expect(Object.keys(ISLAND_OWNERS).sort()).toEqual(['coral', 'desert', 'dino', 'home', 'ice', 'launch', 'mushroom']);
    for (const [isl, id] of Object.entries(ISLAND_OWNERS)) {
      const n = FACILITY_NPCS.find((q) => q.id === id);
      expect(n, id).toBeTruthy();
      expect(n!.owner).toBe(isl);
      // 몽실만 기존 곰 모델(villager), 나머지는 모델이 있다
      if (id !== 'npc_mongsil') expect(n!.spec).toBeTruthy();
      expect(n!.first.length).toBeGreaterThan(0);
      expect(n!.usual.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('owners() 가 섬·id·이름을 돌려주고 addDialog 로 체인 대사를 붙일 수 있다', () => {
    const { svc } = setup();
    const owners = svc.api.owners();
    expect(owners).toHaveLength(7);
    expect(owners.find((o) => o.island === 'dino')).toEqual({ island: 'dino', id: 'npc_grandma', name: '목길이 할머니' });
    svc.register(actor('npc_grandma'));
    svc.talk('npc_grandma'); // 첫 만남
    svc.api.addDialog('npc_grandma', ['고대 벽화 동굴을 찾아 주렴…'], { key: 'chain', pin: true });
    expect(svc.talk('npc_grandma').join(' ')).toContain('고대 벽화 동굴');
    // 같은 key 는 바꿔 끼운다
    svc.api.addDialog('npc_grandma', ['고맙구나, 별조각이란다!'], { key: 'chain', pin: true });
    const pages = svc.talk('npc_grandma').join(' ');
    expect(pages).toContain('별조각');
    expect(pages).not.toContain('고대 벽화');
    svc.api.clearDialog('npc_grandma', 'chain');
    expect(svc.talk('npc_grandma').join(' ')).not.toContain('별조각');
  });
  it('떡순이는 여기서 세우지 않는다(space 몫), 토토도 story 몫', () => {
    expect(FACILITY_NPCS.some((n) => n.id === 'npc_tteoksun' || n.id === 'npc_toto')).toBe(false);
  });
});

describe('역할 NPC — 대화가 끝나면 그 창(GDD 3.10.1)', () => {
  const CASES: Array<[string, Record<string, unknown>]> = [
    ['npc_tongtong', { type: 'open-craft' }],
    ['npc_peli', { type: 'open-shop', shop: 'shipyard' }],
    ['npc_bodeul', { type: 'open-shop', shop: 'diving' }],
    ['npc_pro', { type: 'open-panel', kind: 'npc', tab: 'appraise' }],
    ['npc_camel', { type: 'open-shop', shop: 'bazaar' }],
    ['npc_raccoon', { type: 'open-shop', shop: 'junk' }],
    ['npc_kkumul', { type: 'open-shop', shop: 'station' }],
    ['npc_sheep', { type: 'open-shop', shop: 'sheep' }],
  ];
  for (const [id, want] of CASES) {
    it(`${id} → ${String(want.type)} ${String(want.shop ?? want.tab ?? '')}`, () => {
      const { game, svc, ev } = setup();
      svc.register(actor(id));
      expect(svc.talk(id).length).toBeGreaterThan(0);
      runOut(game);
      expect(ev.types()).toContain('npc-talk');
      const got = ev.of(String(want.type));
      expect(got.length, `${id} 이벤트`).toBe(1);
      expect(got[0]).toMatchObject(want);
    });
  }
  it('섬 주인(보들 빼고)은 주민 메뉴, 부탁이 있으면 부탁 탭부터', () => {
    const { game, svc } = setup({ econ: { requestsFor: (id: string) => (id === 'npc_owl_prof' ? [{ id: 'r1', text: '반딧불이 보고 싶어!', n: 1, reward: 300, done: false }] : []) } });
    svc.register(actor('npc_owl_prof'));
    svc.talk('npc_owl_prof');
    runOut(game);
    // 두 번째(평소) 대화엔 부탁 말풍선이 붙는다
    const pages = svc.talk('npc_owl_prof');
    expect(pages.join(' ')).toContain('반딧불이 보고 싶어!');
    runOut(game);
    const cur = game.hud.current();
    expect(cur?.kind).toBe('npc');
    expect(cur?.tab).toBe('req');
  });
  it('통통은 오늘 첫 대화에 집 증축 단계를 말한다', () => {
    const tt = FACILITY_NPCS.find((n) => n.id === 'npc_tongtong')!;
    const def = { id: tt.id, catchphrase: tt.catchphrase, first: tt.first, usual: tt.usual, role: tt.role };
    const p = selectDialog(def, { met: true, firstToday: true, tod: 'day', rnd: () => 0, house: 2 });
    expect(p.pages.join(' ')).toContain(houseLine(2));
    expect(houseLine(0)).toContain('텐트');
    expect(houseLine(4)).toContain('최고');
  });
});

describe('이주(GDD 3.10.1 이주민 16 · 4.7 ④)', () => {
  it('후보 16 명단: 몽실 고정 + 새 이주민 9(판다·개구리·코알라·햄스터·알파카·부엉이·고슴도치·티라미·삐리)', () => {
    expect(ROSTER16).toHaveLength(16);
    const all = new Set([...FACILITY_NPCS.map((n) => n.id), ...RESIDENTS.map((r) => r.id), ...MIGRANTS.map((m) => m.id)]);
    for (const r of ROSTER16) expect(all.has(r.id), r.id).toBe(true);
    expect(MIGRANTS.map((m) => m.spec.kind === 'bear' ? m.model : m.spec.kind)).toEqual(['panda', 'frog', 'koala', 'hamster', 'alpaca', 'owl', 'hedgehog', 'babydino', 'alien']);
    expect(ROSTER16.filter((r) => r.fixed).map((r) => r.id)).toEqual(['npc_mongsil']);
  });
  it('순수 규칙: 집 수 · 고정 · 모르는 섬 · 다음 주민', () => {
    const rows: ResidentRow[] = [
      { id: 'a', base: 'ice', movable: true }, { id: 'b', base: 'ice', movable: false }, { id: 'm', base: 'home', movable: true, fixed: true },
      { id: 'n1', base: null, movable: true }, { id: 'n2', base: null, movable: true },
    ];
    const flags: Record<string, { home?: string }> = {};
    const fl = (id: string) => flags[id];
    const cap = { ice: 3, home: 2, coral: 1 };
    expect(capacityLeft(rows, fl, 'ice', cap)).toBe(1);
    expect(checkMoveIn(rows, fl, 'n1', 'ice', cap)).toEqual({ ok: true, already: false, from: null });
    expect(checkMoveIn(rows, fl, 'm', 'ice', cap)).toEqual({ ok: false, why: 'fixed' });
    expect(checkMoveIn(rows, fl, 'm', 'home', cap)).toMatchObject({ ok: true, already: true });
    expect(checkMoveIn(rows, fl, 'b', 'coral', cap)).toEqual({ ok: false, why: 'unknown' });
    expect(checkMoveIn(rows, fl, 'n1', 'atlantis', cap)).toEqual({ ok: false, why: 'island' });
    expect(nextResident(rows, fl, 'coral', cap)).toBe('n1');
    flags.n1 = { home: 'coral' };
    expect(population(rows, fl, 'coral')).toEqual(['n1']);
    expect(checkMoveIn(rows, fl, 'n2', 'coral', cap)).toEqual({ ok: false, why: 'full' });
    expect(nextResident(rows, fl, 'coral', cap)).toBeNull();
    expect(candidates(rows, fl, 'ice')).toEqual(['n2', 'n1']);
  });
  it('섬 집 수만큼만 이사 온다(솜눈섬 4채 — 원래 주민 3)', () => {
    const { svc, ev, moves } = setup();
    expect(ISLAND_CAP.ice).toBe(4);
    expect(svc.api.capacity('ice')).toEqual({ used: 3, cap: 4, left: 1 });
    expect(svc.api.moveIn('res_panda', 'ice')).toBe('res_panda');
    expect(svc.api.capacity('ice').left).toBe(0);
    expect(svc.api.moveIn('res_frog', 'ice')).toBe(false);
    expect(svc.api.island('res_panda')).toBe('ice');
    expect(moves).toEqual([{ id: 'res_panda', island: 'ice', x: 100, z: 50, from: null }]);
    expect(ev.of('npc-movein')).toEqual([expect.objectContaining({ npc: 'res_panda', island: 'ice', from: null })]);
    // 같은 섬에 다시 부르면 그대로 성공(멱등)
    expect(svc.api.moveIn('res_panda', 'ice')).toBe('res_panda');
    expect(moves).toHaveLength(1);
  });
  it('id 없이 부르면 후보 순서대로(초대권·islanddev) — 다 오면 사람 많은 섬에서', () => {
    const { svc } = setup();
    expect(svc.api.nextResident('coral')).toBe('res_panda');
    expect(svc.api.moveIn(undefined, 'coral')).toBe('res_panda');
    expect(svc.api.moveIn(undefined, 'coral')).toBe('res_frog');
    expect(svc.api.candidates('coral')[0]).toBe('res_koala');
    // 몽실은 말랑섬을 떠나지 않는다
    expect(svc.api.moveIn('npc_mongsil', 'coral')).toBe(false);
    expect(svc.api.moveIn('res_koala', 'nowhere')).toBe(false);
  });
  it('list() 는 아직 안 온 이주민을 빼고, 이사 온 섬으로 알려 준다 · 저장 후 다시 불러도 그대로', () => {
    const a = setup();
    const ids = () => a.svc.api.list().map((r) => r.id);
    expect(ids()).not.toContain('res_piri');
    a.svc.api.moveIn('res_piri', 'launch');
    a.svc.api.moveIn('nabi', 'desert');
    expect(a.svc.api.list().find((r) => r.id === 'res_piri')?.island).toBe('launch');
    expect(a.svc.api.list().find((r) => r.id === 'nabi')?.island).toBe('desert');
    a.game.state.saveNow();
    const b = setup({ load: true });
    expect(b.svc.api.island('res_piri')).toBe('launch');
    expect(b.svc.api.island('nabi')).toBe('desert');
    expect(b.svc.flagOf('res_piri')).toMatchObject({ home: 'launch', hx: 100, hz: 50 });
    expect(b.svc.api.residents().find((r) => r.id === 'res_piri')).toMatchObject({ island: 'launch', movable: true });
  });
  it('flags.npc 이사 필드는 정리돼도 남는다', () => {
    const f = normalizeFlag({ f: 100, met: true, last: 3, gifts: 1, home: 'ice', hx: 1.5, hz: -2, prop: 1, pto: 'home', photo: true, memo: ['fos_a_skull', 7] });
    expect(f).toMatchObject({ home: 'ice', hx: 1.5, hz: -2, prop: 1, pto: 'home', photo: true, memo: ['fos_a_skull'] });
    expect(migrateNpcFlags({ toto: { f: 3, home: 'coral' } }).flags.res_toto_home).toMatchObject({ home: 'coral' });
  });
});

describe('우정 100 → 이사 제안 + 사진 선물(한 번만)', () => {
  it('주민: 100 이 되면 제안 1번 + 사진 f_photo_<id>, 더 올라도 다시 안 한다', () => {
    const { game, svc, ev } = setup({ here: 'ice' });
    svc.gain('nabi', 99);
    expect(ev.of('npc-propose')).toHaveLength(0);
    svc.gain('nabi', 5);
    expect(svc.flagOf('nabi').f).toBe(100);
    const props = ev.of('npc-propose');
    expect(props).toEqual([expect.objectContaining({ npc: 'nabi', island: 'ice' })]);
    expect(game.state.has(photoItem('nabi'))).toBe(true);
    expect(svc.api.proposal('nabi')).toEqual({ state: 'pending', island: 'ice' });
    svc.gain('nabi', 10);
    svc.gain('nabi', 1);
    expect(ev.of('npc-propose')).toHaveLength(1);
    expect(game.state.bag[photoItem('nabi')]).toBe(1);
  });
  it('받아 주면 그 섬으로 이사, 거절하면 끝 — 어느 쪽이든 다시 제안하지 않는다', () => {
    const a = setup({ here: 'ice' });
    a.svc.gain('nabi', 100);
    expect(a.svc.api.acceptMove('nabi')).toBe('nabi');
    expect(a.svc.api.island('nabi')).toBe('ice');
    expect(a.svc.flagOf('nabi').prop).toBe(PROP_MOVED);
    expect(a.svc.api.acceptMove('nabi')).toBe(false);
    a.svc.gain('rex', 100);
    expect(a.svc.api.proposal('rex').state).toBe('pending');
    expect(a.svc.api.declineMove('rex')).toBe(true);
    expect(a.svc.flagOf('rex').prop).toBe(PROP_DONE);
    a.svc.gain('rex', 50);
    expect(a.ev.of('npc-propose').filter((e) => e.npc === 'rex')).toHaveLength(1);
  });
  it('대화가 끝나면 이사 탭이 먼저 열린다', () => {
    const { game, svc } = setup({ here: 'coral' });
    svc.register(actor('nabi'));
    svc.talk('nabi');
    runOut(game);
    svc.gain('nabi', 100);
    expect(svc.flagOf('nabi').prop).toBe(PROP_PENDING);
    expect(svc.talk('nabi').join(' ')).toContain('이사 가도 될까');
    runOut(game);
    expect(game.hud.current()).toMatchObject({ kind: 'npc', tab: 'move' });
  });
  it('가게 주인·섬 주인은 사진만(이사 없음)', () => {
    const { game, svc, ev } = setup({ here: 'ice' });
    svc.gain('npc_quack', 100);
    expect(svc.flagOf('npc_quack')).toMatchObject({ prop: PROP_DONE, photo: true });
    expect(ev.of('npc-propose')).toEqual([expect.objectContaining({ npc: 'npc_quack', island: null })]);
    expect(game.state.has(photoItem('npc_quack'))).toBe(true);
  });
  it('제안 섬: 지금 선 섬(자리 있음) → 아니면 말랑섬, 이미 거기 살면 다른 쪽', () => {
    const rows: ResidentRow[] = [{ id: 'x', base: 'home', movable: true }, { id: 'y', base: 'ice', movable: true }];
    const fl = () => undefined;
    expect(proposalIsland(rows[0], fl, 'ice', { ice: 2, home: 3 }, rows)).toBe('ice');
    expect(proposalIsland(rows[0], fl, 'home', { ice: 2, home: 3 }, rows)).toBeNull();
    expect(proposalIsland(rows[1], fl, null, { ice: 2, home: 3 }, rows)).toBe('home');
    expect(proposalIsland(rows[1], fl, 'coral', { coral: 0, home: 3 }, rows)).toBe('home');
  });
});

describe('프로 박사 화석 감정', () => {
  const fossils = {
    parse: (id: string) => { const m = /^fos_([a-z]+)_([a-z]+)$/.exec(id); return m ? { dino: m[1], part: m[2] } : null; },
    partsOf: (d: string) => [`fos_${d}_skull`, `fos_${d}_body`, `fos_${d}_tail`],
    skeletonOf: (id: string) => `fos_${id.split('_')[1]}`,
  };
  function withEcon(p0: boolean) {
    const spent: number[] = [];
    const game = makeFakeGame({ pos: [0, 0] });
    game.ext.fossils = fossils;
    const econ = { p0, spend: (c: { coins: number }) => { if (game.state.coins < c.coins) return false; game.state.coins -= c.coins; spent.push(c.coins); return true; } };
    const r = setup({ game, econ });
    return { ...r, spent };
  }
  it('300 코인을 내고 조각의 공룡·부위와 빠진 조각을 알려 준다, 같은 조각은 두 번 안 한다', () => {
    const { game, svc, ev, spent } = withEcon(false);
    game.state.coins = 1000;
    game.state.bag.fos_trike_skull = 1;
    game.state.bag.fos_trike_tail = 1;
    expect(svc.api.appraisable().sort()).toEqual(['fos_trike_skull', 'fos_trike_tail']);
    const r = svc.api.appraise('fos_trike_skull');
    expect(r).toMatchObject({ id: 'fos_trike_skull', dino: 'trike', part: 'skull', missing: ['fos_trike_body'], cost: APPRAISE_COST });
    expect(spent).toEqual([300]);
    expect(ev.of('appraise')).toHaveLength(1);
    expect(svc.api.appraise('fos_trike_skull')).toBeNull();
    expect(spent).toEqual([300]);
    expect(svc.api.appraisable()).toEqual(['fos_trike_tail']);
  });
  it('P0 는 1/5(60), 돈이 모자라면 안 한다', () => {
    const a = withEcon(true);
    a.game.state.coins = 100;
    a.game.state.bag.fos_rex_body = 1;
    expect(a.svc.api.appraise()?.cost).toBe(60);
    const b = withEcon(false);
    b.game.state.coins = 100;
    b.game.state.bag.fos_rex_body = 1;
    expect(b.svc.api.appraise()).toBeNull();
    expect(b.spent).toEqual([]);
  });
});

describe('주민끼리 수다', () => {
  const A = (key: string, x: number, z: number, busy = false): ChatActor => ({ key, name: key.toUpperCase(), catchphrase: '냥', island: 'home', x, z, busy });
  it('플레이어 가까이, 서로 가까운 한가한 두 주민을 고른다', () => {
    expect(findPair([A('a', 0, 0), A('b', 3, 0), A('c', 40, 0)], { x: 2, z: 2 })?.map((q) => q.key)).toEqual(['a', 'b']);
    expect(findPair([A('a', 0, 0), A('b', 3, 0, true)], { x: 2, z: 2 })).toBeNull();
    expect(findPair([A('a', 0, 0), A('b', 3, 0)], { x: 60, z: 0 })).toBeNull();
    expect(fillChat('{b}! 안녕, {ca}', { name: '나비', catchphrase: '냐옹' }, { name: '토리', catchphrase: '깡총' })).toBe('토리! 안녕, 냐옹');
    for (const isl of Object.keys(CHATTER)) expect(pickChat(() => 0.5, isl)).toHaveLength(2);
  });
  it('두 줄을 번갈아 타자기로 말하고 끝나면 말풍선을 닫는다 · 바빠지면 바로 끝(바쁜 쪽은 안 건드림)', () => {
    const log: Array<[string, string | null]> = [];
    const faces: string[] = [];
    const c = createChatter({ rng: rngFor, say: (k, p) => log.push([k, p]), face: (k) => faces.push(k), gap: [5, 5] });
    const list = [A('a', 0, 0), A('b', 3, 0)];
    let t = 0;
    c.update(t, 0.1, list, { x: 1, z: 1 });
    t = 5;
    c.update(t, 0.1, list, { x: 1, z: 1 });
    expect(c.current()).toMatchObject({ a: 'a', b: 'b', i: 0 });
    expect(faces.sort()).toEqual(['a', 'b']);
    for (let i = 0; i < 600 && c.current(); i++) { t += 0.05; c.update(t, 0.05, list, { x: 1, z: 1 }); }
    expect(c.current()).toBeNull();
    const spoke = new Set(log.filter(([, p]) => p).map(([k]) => k));
    expect([...spoke].sort()).toEqual(['a', 'b']);
    expect(log.at(-1)?.[1]).toBeNull();
    // 바빠지면 끝 — 바쁜 a 의 말풍선은 지우지 않는다
    t += 30;
    c.update(t, 0.05, list, { x: 1, z: 1 });
    expect(c.current()).not.toBeNull();
    log.length = 0;
    c.update(t + 0.05, 0.05, [A('a', 0, 0, true), A('b', 3, 0)], { x: 1, z: 1 });
    expect(c.current()).toBeNull();
    expect(log.some(([k, p]) => k === 'a' && p === null)).toBe(false);
    expect(log.some(([k, p]) => k === 'b' && p === null)).toBe(true);
  });
});

describe('특별 모델(브라키오·프로토·문어·로봇·외계인·아기공룡)', () => {
  it('귀여운 얼굴(art 눈 둘 + 볼터치) · 유한한 좌표 · 예산 안', () => {
    makeFakeGame();
    for (const k of SPECIAL_KINDS) {
      const rig = buildSpecial(k, SPECIAL_ZOO[k]);
      rig.update(1.2, 1 / 60, { walk: 0.8, talk: true, wave: true, happy: true });
      rig.update(2.4, 0, { walk: 0, talk: false, wave: false, happy: false, clap: true });
      rig.setFade(0.5);
      expect(allFinite(rig.root), k).toBe(true);
      const eyes: THREE.Object3D[] = [], blush: THREE.Object3D[] = [];
      rig.root.traverse((o) => { if (o.userData.eye) eyes.push(o); if (o.name.startsWith('blush-')) blush.push(o); });
      expect(eyes, k).toHaveLength(2);
      expect(blush, k).toHaveLength(2);
      const st = sceneStats(rig.root);
      expect(st.drawCalls, k).toBeLessThan(40);
      expect(st.triangles, k).toBeLessThan(150_000);
      expect(rig.top, k).toBeGreaterThan(0.8);
    }
  });
});
