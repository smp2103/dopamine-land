// netplay-play — 친구 놀이 규칙(순수)과, 가짜 친구 둘(메모리 쪽지 끈)로 돌리는 진행:
// 방문객 상자 하루 1번 · 친구 섬 시세 · 레이스 체크포인트 순서 · 협동 보스 HP 맞추기 · 도감 교환 "○○가 준 친구" 표시,
// 그리고 쪽지 거르기·하트 짝·낚시 대회·★5 알림·칭호·2인 탈것 뒷자리.
import { describe, it, expect, beforeEach } from 'vitest';
import * as Island from '../src/core/island';
import { DAY_SEC } from '../src/core/api';
import type { Species } from '../src/core/state';
import { makeFakeGame, recordEvents, makeCtx, type FakeGame } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';
import buildEconomy from '../src/modules/economy';
import buildNetplayPlay from '../src/modules/netplayplay';
import { NetPlay, type NetLike, type PeerPose } from '../src/modules/netplayplay/play';
import {
  decodeMsg, claimVisitorChest, guestMayOpen, marketRows, friendSale, RaceTrack, raceWinner, COURSES, FishContest, contestWinner,
  BossFight, BOSSES, DUO_WINDOW, bossPlaceOk, markDexGift, dexGiftable, heartBoost, waterKey, HEART_TAG, takeDaily, ensurePlay, grantTitle,
  peerNoiseRate, sharedGauge, VISITOR_CHEST, APP_KIND, warmth, catchCm,
} from '../src/modules/netplayplay/logic';

// ───────────── 가짜 친구 둘(쪽지는 JSON 으로 건너가고 pump 때 닿는다) ─────────────
type Fn = (data: unknown, kind: string) => void;
interface FakeNet extends NetLike { connected: boolean; role: 'host' | 'guest'; listeners: Map<string, Set<Fn>>; sent: Array<{ kind: string; data: unknown }> }
function netPair(host: FakeGame, guest: FakeGame, names = { host: '방장', guest: '손님' }) {
  const q: Array<() => void> = [];
  const pose = (g: FakeGame): PeerPose => ({ x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z, yaw: g.player.yaw, m: g.player.mode, a: null, w: g.world === 'space' ? 'space:moon' : 'earth', s: g.player.speed });
  const mk = (role: 'host' | 'guest', other: () => FakeNet, otherGame: FakeGame, peerName: string): FakeNet => {
    const n: FakeNet = {
      connected: true, role, visiting: false, boostTags: {}, listeners: new Map(), sent: [],
      get peer() { return n.connected ? { name: peerName } : null; },
      send(kind, data) {
        if (!n.connected) return false;
        const wire = JSON.parse(JSON.stringify(data ?? null));
        n.sent.push({ kind, data: wire });
        q.push(() => { const o = other(); for (const fn of [...(o.listeners.get(kind) ?? [])]) fn(wire, kind); });
        return true;
      },
      on(kind, fn) { let s = n.listeners.get(kind); if (!s) { s = new Set(); n.listeners.set(kind, s); } s.add(fn); return () => { s!.delete(fn); }; },
      peerPose: () => (n.connected ? pose(otherGame) : null),
    } as FakeNet;
    return n;
  };
  let a: FakeNet, b: FakeNet;
  a = mk('host', () => b, guest, names.guest);
  b = mk('guest', () => a, host, names.host);
  host.ext.net = a; guest.ext.net = b;
  const pump = () => { let k = 0; while (q.length && k < 10000) { q.shift()!(); k++; } return k; };
  return { a, b, pump };
}
const sp = (id: string, category: string, rarity: number, extra: Partial<Species> = {}): Species => ({ id, name: id, category, rarity, price: 1000, ...extra });

/** 방장·손님 게임 + 경제 + 놀이(진짜 모듈 대신 NetPlay 를 바로) */
function boot(o: { world?: 'earth' | 'space'; econ?: boolean; pos?: [number, number] } = {}) {
  const A = makeFakeGame({ load: false, world: o.world, pos: o.pos, search: '?p0=0' });
  const B = makeFakeGame({ load: false, world: o.world, pos: o.pos, search: '?p0=0' });
  if (o.econ !== false) { buildEconomy(makeCtx(A) as never); buildEconomy(makeCtx(B) as never); }
  const net = netPair(A, B);
  const pa = new NetPlay(A as never), pb = new NetPlay(B as never);
  pa.wire(); pb.wire();
  A.onUpdate((t, dt) => pa.update(t, dt));
  B.onUpdate((t, dt) => pb.update(t, dt));
  /** 둘 다 n 프레임 + 쪽지 건네기 */
  const step = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) { A.tick(dt); B.tick(dt); net.pump(); } };
  step(2);
  return { A, B, pa, pb, ...net, step };
}

beforeEach(() => { stubLocalStorage(); });

// ───────────── 쪽지 거르기 ─────────────
describe('쪽지 모양 검사', () => {
  it('모르는 종류·틀린 모양은 버리고, 숫자는 범위로 막는다', () => {
    expect(decodeMsg(null)).toBeNull();
    expect(decodeMsg({ t: 'nope' })).toBeNull();
    expect(decodeMsg({ t: 'chest' })).toBeNull();
    expect(decodeMsg({ t: 'chest', on: true, day: 3 })).toEqual({ t: 'chest', on: true, day: 3 });
    expect(decodeMsg({ t: 'boss-hit', id: 'b1', n: 1e6 })).toBeNull();
    expect(decodeMsg({ t: 'boss', id: 'b1', kind: 'kraken', hp: 1, max: 2, left: 3, x: 0, y: 0, z: 0, st: 'on' })).toBeNull();
    expect(decodeMsg({ t: 'boss', id: 'b1', kind: 'whale', hp: 999, max: 300, left: 3, x: 0, y: 0, z: 0, st: 'on' })).toMatchObject({ hp: 300 });
    expect(decodeMsg({ t: 'inv', g: 'race-ufo', id: 'x' })).toBeNull();
    expect(decodeMsg({ t: 'dex-offer', xid: 'x1', give: '<script>' })).toBeNull();
    const q = decodeMsg({ t: 'quote-r', q: 1, prices: { f_a: 120, 'bad id': 3, f_b: -5, f_c: 'x' }, hot: ['f_a', 7] });
    expect(q).toEqual({ t: 'quote-r', q: 1, prices: { f_a: 120 }, hot: ['f_a'] });
  });
});

// ───────────── 방문객 상자 ─────────────
describe('방문객 상자(하루 1번)', () => {
  it('규칙: 같은 날 두 번은 안 되고 다음 날은 된다', () => {
    const c = { day: -1, by: '' };
    expect(claimVisitorChest(c, 4, '손님')).toBe(true);
    expect(claimVisitorChest(c, 4, '다른손님')).toBe(false);
    expect(c.by).toBe('손님');
    expect(claimVisitorChest(c, 5, '손님')).toBe(true);
    expect(guestMayOpen({ 방장: 5 }, '방장', 5)).toBe(false);
    expect(guestMayOpen({ 방장: 5 }, '방장', 6)).toBe(true);
  });
  it('방장이 띄우고 → 손님이 열면 econ.openChest(wood, visitor) → 그날은 끝, 다음 날 다시', () => {
    const { A, B, pa, pb, step } = boot();
    const evB = recordEvents(B);
    expect(pa.chestOn).toBe(true);
    expect(pb.chestOn).toBe(true);
    // 멀면 방장이 거절
    expect(pb.openVisitorChest()).toBe(true);
    step(2);
    expect(evB.of('chest-open')).toHaveLength(0);
    // 상자 앞으로
    B.player.teleport(VISITOR_CHEST.x + 1, VISITOR_CHEST.z);
    step(1);
    expect(B.listInteractions().some((r) => r.id === 'netplayplay-chest')).toBe(true);
    expect(pb.openVisitorChest()).toBe(true);
    step(3);
    const opened = evB.of('chest-open');
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ tier: 'wood', at: 'visitor' });
    expect(pa.flags().chest.by).toBe('손님');
    expect(pa.chestOn).toBe(false);
    expect(pb.chestOn).toBe(false);
    // 같은 날 또는 안 된다
    expect(pb.openVisitorChest()).toBe(false);
    step(3);
    expect(evB.of('chest-open')).toHaveLength(1);
    // 방장이 직접 열 수는 없다(손님 전용)
    expect(pa.openVisitorChest()).toBe(false);
    // 다음 날
    A.env!.advance(DAY_SEC); B.env!.advance(DAY_SEC);
    step(3);
    expect(pa.chestOn).toBe(true);
    expect(pb.chestOn).toBe(true);
    expect(pb.openVisitorChest()).toBe(true);
    step(3);
    expect(evB.of('chest-open')).toHaveLength(2);
  });
});

// ───────────── 친구 섬 시세 ─────────────
describe('친구 섬 시장', () => {
  it('줄 고르기·값 셈', () => {
    const rows = marketRows({ f_a: 2, f_b: 1, m_wood: 5, 'f_a@shiny': 1 }, { f_a: 100, f_b: 300, 'f_a@shiny': 900 }, ['f_a']);
    expect(rows.map((r) => r.id)).toEqual(['f_a@shiny', 'f_b', 'f_a']);
    expect(rows[0].hot).toBe(true);
    expect(friendSale(123.4, 3)).toBe(369);
  });
  it('손님은 방장의 priceOf(…, {where:friend}) 값으로 판다', () => {
    const { A, B, pa, pb, step } = boot();
    const fish = sp('f_test_koi', 'fish', 3, { len: 40 });
    A.state.register([fish]); B.state.register([fish]);
    B.state.addItem('f_test_koi', 3);
    const hostUnit = A.econ!.priceOf('f_test_koi', { where: 'friend' });
    expect(hostUnit).toBeGreaterThan(0);
    expect(pb.askQuote(true)).toBe(true);
    step(2);
    expect(pb.quote?.prices.f_test_koi).toBe(Math.round(hostUnit));
    const coins0 = B.state.coins;
    const ev = recordEvents(B);
    const got = pb.sellFriend('f_test_koi', 2);
    expect(got).toBe(Math.round(hostUnit) * 2);
    expect(B.state.coins - coins0).toBe(got);
    expect(B.state.bag.f_test_koi).toBe(1);
    expect(ev.of('sell')[0]).toMatchObject({ id: 'f_test_koi', n: 2, shop: 'friend' });
    step(1);
    expect(A.hudLog.toasts.some((t) => t.includes('팔았어요'))).toBe(true);
    // 방장은 친구 시장에서 팔 수 없다(자기 섬)
    expect(pa.sellFriend('f_test_koi', 1)).toBe(0);
  });
  it('판매 포화(4.4): 친구 섬에서도 11번째부터 −5% · 손님 오늘 판 수에 쌓인다 · 방장 포화는 시세에 안 묻는다', () => {
    expect(friendSale(100, 12)).toBe(100 * 10 + 95 + 90);
    expect(friendSale(100, 1, 30)).toBe(50); // 최저 50%
    const { A, B, pb, step } = boot();
    const fish = sp('f_test_koi', 'fish', 3, { len: 40 });
    A.state.register([fish]); B.state.register([fish]);
    // 방장이 자기 섬에서 15마리 판 뒤에도 손님 시세는 포화 전 값
    const base = A.econ!.priceOf('f_test_koi', { where: 'friend' });
    A.state.addItem('f_test_koi', 15); A.econ!.sell('f_test_koi', 15);
    B.state.addItem('f_test_koi', 25);
    pb.askQuote(true); step(2);
    const unit = pb.quote!.prices.f_test_koi;
    expect(unit).toBe(Math.round(base));
    const got = pb.sellFriend('f_test_koi', 20);
    expect(got).toBeLessThan(unit * 20);
    expect(got).toBe(friendSale(unit, 20, 0));
    expect((B.state.flags.econ as { sold: Record<string, number> }).sold.f_test_koi).toBe(20);
    // 다음 한 개는 이미 포화된 값으로 보인다
    expect(pb.marketRows().find((r) => r.id === 'f_test_koi')!.unit).toBe(friendSale(unit, 1, 20));
    // economy 쪽 값(집 꽥사장 포함)도 포화가 이어진다 — 21번째는 최저 50%
    expect(B.econ!.priceOf('f_test_koi', { where: 'friend' })).toBeLessThan(unit * 0.6);
  });
});

// ───────────── 레이스 ─────────────
describe('레이스 체크포인트', () => {
  it('순서대로만 센다 — 건너뛴 칸은 안 친다', () => {
    const tr = new RaceTrack(COURSES.run);
    const c = COURSES.run.cps;
    expect(tr.pass(c[2].x, c[2].z, 1)).toBeNull(); // 2번부터 가면 안 센다
    expect(tr.passed).toBe(0);
    expect(tr.pass(c[1].x, c[1].z, 2)).toBe('cp');
    expect(tr.pass(c[1].x, c[1].z, 2.1)).toBeNull(); // 같은 칸 두 번
    for (let i = 2; i < c.length - 1; i++) expect(tr.pass(c[i].x, c[i].z, i)).toBe('cp');
    expect(tr.pass(c[c.length - 1].x, c[c.length - 1].z, 99)).toBe('finish');
    expect(tr.done).toBe(true);
    expect(raceWinner(41000, 52000)).toBe('me');
    expect(raceWinner(null, 52000)).toBe('peer');
    expect(raceWinner(40000, 40020)).toBe('tie');
  });
  it('코스 자리: 자전거·달리기는 땅, 배는 바다', () => {
    for (const k of ['bike', 'run'] as const) {
      for (const c of COURSES[k].cps) expect(['grass', 'sand', 'rock']).toContain(Island.surfaceAt(c.x, c.z).kind);
    }
    for (const c of COURSES.boat.cps) expect(Island.surfaceAt(c.x, c.z).kind).toBe('sea');
    // 배 코스 칸 사이도 다 바다
    const cps = COURSES.boat.cps;
    for (let i = 1; i < cps.length; i++) {
      const a = cps[i - 1], b = cps[i], L = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s <= L; s += 2) expect(Island.surfaceAt(a.x + (b.x - a.x) * s / L, a.z + (b.z - a.z) * s / L).kind).toBe('sea');
    }
  });
  it('둘이 달리기 시합: 초대 → 출발선 → 3·2·1 → 순서대로 → 빠른 쪽 승', () => {
    const { A, B, pa, pb, step } = boot();
    const c = COURSES.run.cps;
    expect(pa.inviteTo('race-run')).toBe(true);
    step(1);
    expect(pb.invite?.from).toBe('peer');
    pb.answer(true);
    step(1);
    expect(pa.run?.kind).toBe('race');
    expect(pb.run?.kind).toBe('race');
    A.player.teleport(c[0].x, c[0].z); B.player.teleport(c[0].x + 2, c[0].z);
    step(3);
    expect((pa.run as { phase: string }).phase).toBe('count');
    expect((pb.run as { phase: string }).phase).toBe('count');
    expect(A.player.locked).toBe(true);
    step(100); // 3초 넘게
    expect((pa.run as { phase: string }).phase).toBe('go');
    expect(A.player.locked).toBe(false);
    // A 는 순서대로, B 는 2번부터(안 센다) 그다음 순서대로 — 늦게
    for (let i = 1; i < c.length; i++) { A.player.teleport(c[i].x, c[i].z); step(3); }
    const ra = pa.run as unknown as { myMs: number | null; track: RaceTrack };
    expect(ra.track.done).toBe(true);
    expect(ra.myMs).not.toBeNull();
    B.player.teleport(c[2].x, c[2].z); step(2);
    expect((pb.run as unknown as { track: RaceTrack }).track.passed).toBe(0);
    for (let i = 1; i < c.length; i++) { B.player.teleport(c[i].x, c[i].z); step(10); }
    expect(A.hudLog.banners.some((b) => b.text.includes('이겼다'))).toBe(true);
    expect(B.hudLog.banners.some((b) => b.text.includes('방장 승리'))).toBe(true);
    expect(pa.flags().titles).toContain('race-star');
    expect(pa.flags().wins.race).toBe(1);
  });
});

// ───────────── 협동 보스 ─────────────
describe('협동 보스 HP', () => {
  it('규칙: 둘이 같이 쳐야 깎이고, 혼자면 회복', () => {
    const b = new BossFight('b1', 'oarfish', 0, 0, 0);
    b.hit('me', 10, 0);
    expect(b.hp).toBe(BOSSES.oarfish.hp); // 혼자는 안 깎인다
    b.hit('peer', 10, 0.5);
    expect(b.hp).toBe(BOSSES.oarfish.hp - 10);
    b.step(1, 0.5 + DUO_WINDOW + 1);
    expect(b.hp).toBeGreaterThan(BOSSES.oarfish.hp - 10); // 둘 다 멈추면 회복
    expect(bossPlaceOk('whale', { world: 'earth', sea: null, tod: 'day', weather: 'clear' }).ok).toBe(false);
    expect(bossPlaceOk('mosasaur', { world: 'earth', sea: 'deep', tod: 'day', weather: 'clear' }).ok).toBe(true);
    expect(bossPlaceOk('oarfish', { world: 'earth', sea: 'offshore', tod: 'day', weather: 'clear' }).ok).toBe(false);
    expect(bossPlaceOk('oarfish', { world: 'earth', sea: 'offshore', tod: 'night', weather: 'clear' }).ok).toBe(true);
  });
  it('손님 화면 HP = 방장 HP, 다 깎으면 둘 다 잡는다', () => {
    const { A, B, pa, pb, step } = boot({ world: 'space', econ: false });
    const whale = sp('space-whale', 'space', 5, { gdd: 's_sky_whale' });
    A.state.register([whale]); B.state.register([whale]);
    // 혼자서는 안 나온다
    const solo = new NetPlay(makeFakeGame({ load: false, world: 'space' }) as never);
    expect(solo.callBoss('whale')).toBe(false);
    // 손님이 부르면 방장이 확인하고 띄운다
    expect(pb.callBoss('whale')).toBe(true);
    step(2);
    expect(pa.boss).not.toBeNull();
    expect(pb.bossView?.kind).toBe('whale');
    const max = BOSSES.whale.hp;
    expect(pb.bossView?.hp).toBe(max);
    // 둘이 같이 연타
    for (let i = 0; i < 20; i++) { pa.bossMash(); pb.bossMash(); }
    step(12);
    const hostHp = pa.boss!.hp;
    expect(hostHp).toBeLessThan(max);
    step(8); // 스냅숏 한 번 더(0.2초)
    expect(pb.bossView!.hp).toBeCloseTo(Math.round(pa.boss!.hp * 10) / 10, 0);
    expect(pb.bossView!.max).toBe(max);
    // 끝까지
    for (let k = 0; k < 60 && pa.boss; k++) { for (let i = 0; i < 10; i++) { pa.bossMash(); pb.bossMash(); } step(7); }
    step(4);
    expect(pa.boss).toBeNull();
    expect(pb.bossView).toBeNull();
    expect(A.state.dex['space-whale']).toBeTruthy();
    expect(B.state.dex['space-whale']).toBeTruthy();
    expect(pa.flags().titles).toContain('boss-duo');
    expect(pb.flags().titles).toContain('boss-duo');
    // 하루 한 번
    expect(pa.callBoss('whale')).toBe(false);
  });
  it('보스 곁(40m)에서만 연타가 센다 — 손님이 멀리서 보낸 boss-hit 은 방장이 버린다', () => {
    const { A, B, pa, pb, b: nb, step } = boot({ world: 'space', econ: false });
    expect(pa.callBoss('whale')).toBe(true);
    step(2);
    const v = pb.bossView!;
    // 손님이 멀리 가면 E 연타 자체가 안 된다
    B.player.teleport(v.x + 120, v.z);
    step(1);
    expect(pb.bossMash()).toBe(false);
    // 억지로 보낸 쪽지도 방장이 버린다
    const max = pa.boss!.max;
    for (let i = 0; i < 10; i++) { pa.bossMash(); nb.send('np', { t: 'boss-hit', id: v.id, n: 20 }); step(1); }
    expect(pa.boss!.hp).toBe(max);
    expect(pa.boss!.hits.peer).toBe(0);
    void A;
  });
  it('보스는 둘이 바라보는 쪽 앞에서 나온다', () => {
    const { A, B, pa, step } = boot({ world: 'space', econ: false });
    A.player.yaw = 0; B.player.yaw = 0; // 둘 다 −z 를 본다
    B.player.teleport(A.player.pos.x + 4, A.player.pos.z);
    step(1);
    expect(pa.callBoss('whale')).toBe(true);
    const b = pa.boss!;
    const mz = (A.player.pos.z + B.player.pos.z) / 2;
    expect(b.z).toBeLessThan(mz - 15);
  });
});

// ───────────── 도감 교환 ─────────────
describe('도감 교환 "○○가 준 친구"', () => {
  it('규칙', () => {
    const from: Record<string, { name: string; day: number }> = {};
    expect(markDexGift(from, {}, 'f_a', '방장', 2)).toBe(true);
    expect(from.f_a).toEqual({ name: '방장', day: 2 });
    expect(markDexGift(from, { f_b: {} }, 'f_b', '방장', 2)).toBe(false);
    expect(dexGiftable('f_a', { f_a: {} }, new Set(), () => 'fish')).toBe(true);
    expect(dexGiftable('f_a', { f_a: {} }, new Set(['f_a']), () => 'fish')).toBe(false);
    expect(dexGiftable('v_bike', { v_bike: {} }, new Set(), () => 'item')).toBe(false);
  });
  it('제안 → 돌려주며 수락 → 양쪽 도감 + flags.net.dexFrom 표시', () => {
    const { A, B, pa, pb, step } = boot({ econ: false });
    const x = sp('f_gift_x', 'fish', 3), y = sp('b_gift_y', 'insect', 2);
    A.state.register([x, y]); B.state.register([x, y]);
    A.state.collect({ species: x, keep: false });
    B.state.collect({ species: y, keep: false });
    step(120); // 새 도감 → hi 다시
    expect(pa.dexGiftList().map((s) => s.id)).toContain('f_gift_x');
    expect(pa.offerDex('f_gift_x')).toBe(true);
    step(1);
    expect(pb.dexIn?.give).toBe('f_gift_x');
    expect(pb.acceptDex('b_gift_y')).toBe(true);
    step(2);
    expect(B.state.dex.f_gift_x).toBeTruthy();
    expect(A.state.dex.b_gift_y).toBeTruthy();
    expect((B.state.flags.net as { dexFrom: Record<string, { name: string }> }).dexFrom.f_gift_x.name).toBe('방장');
    expect((A.state.flags.net as { dexFrom: Record<string, { name: string }> }).dexFrom.b_gift_y.name).toBe('손님');
    // 가방엔 안 들어온다(박물관 기증은 직접 잡아야)
    expect(B.state.bag.f_gift_x ?? 0).toBe(0);
    expect(pa.flags().titles).toContain('dex-pal');
    expect(B.hudLog.cards.some((c) => c.title.includes('방장가 준 친구'))).toBe(true);
    // 이제 친구가 가진 종 → 다시 못 준다
    expect(pa.offerDex('f_gift_x')).toBe(false);
  });
  it('받는 쪽도 하루 3번까지만 — 넘으면 dex-no', () => {
    const { A, B, pa, pb, step } = boot({ econ: false });
    const list = [0, 1, 2, 3, 4].map((i) => sp(`f_lim_${i}`, 'fish', 2));
    A.state.register(list); B.state.register(list);
    for (const s of list) A.state.collect({ species: s, keep: false });
    step(120);
    // 받는 쪽 하루 칸을 이미 다 썼다고 치고(다른 데서 3번)
    const p = pb.flags(); p.daily.day = pb.day(); p.daily.n['dex:방장'] = 3;
    expect(pb.dexLeft()).toBe(0);
    expect(pa.offerDex('f_lim_0')).toBe(true);
    step(2);
    expect(pb.dexIn).toBeNull();
    expect(pa.dexOut).toBeNull();
    expect(B.state.dex.f_lim_0).toBeFalsy();
  });
});

// ───────────── 그 밖 ─────────────
describe('하트 짝·티노·대회·★5·칭호·뒷자리', () => {
  it('하트 짝: 같은 물가 + 30m 안이면 friend-boost ×2', () => {
    const probe = { lakeAt: (x: number) => (x < 50 ? { kind: 'heartpond', x: 10, z: 10 } : null), waterLevelAt: () => -Infinity, isSea: () => false, island: () => 'home' };
    const ka = waterKey(0, 0, probe), kb = waterKey(20, 0, probe);
    expect(ka).toBe(kb);
    expect(heartBoost({ x: 0, z: 0, key: ka }, { x: 20, z: 0, key: kb })).toEqual({ [HEART_TAG]: 2 });
    expect(heartBoost({ x: 0, z: 0, key: ka }, { x: 45, z: 0, key: kb })).toEqual({});
    expect(heartBoost({ x: 0, z: 0, key: ka }, { x: 20, z: 0, key: null })).toEqual({});
  });
  it('하트 짝이 ext.net.boostTags 를 채우고 떨어지면 지운다', () => {
    const { A, B, a, step } = boot({ econ: false });
    // 말랑섬 강가에 둘이
    const spot = Island.riverCenterline()[Math.floor(Island.riverCenterline().length / 2)];
    A.player.teleport(spot.x + 2, spot.z); B.player.teleport(spot.x - 2, spot.z);
    step(20);
    expect(a.boostTags[HEART_TAG]).toBe(2);
    B.player.teleport(spot.x - 200, spot.z - 200);
    step(20);
    expect(a.boostTags[HEART_TAG]).toBeUndefined();
  });
  it('티노: 친구 발소리 게이지(달리면 크게, 살금살금 0) · 같이 보는 게이지는 큰 쪽', () => {
    expect(peerNoiseRate(9, 5)).toBeGreaterThan(peerNoiseRate(4, 5));
    expect(peerNoiseRate(1, 5)).toBe(0);
    expect(peerNoiseRate(9, 50)).toBe(0);
    expect(sharedGauge(20, 70)).toBe(70);
  });
  it('티노: 내 티노 게이지에 친구 소리를 얹는다', () => {
    const A = makeFakeGame({ load: false }), B = makeFakeGame({ load: false });
    const net = netPair(A, B);
    const tino = { m: { state: 'sleep', gauge: 0 }, x: 100, z: 100 };
    const pa = new NetPlay(A as never, { tino: () => tino });
    A.onUpdate((t, dt) => pa.update(t, dt));
    B.player.teleport(103, 100); B.player.speed = 9; // 친구가 티노 옆에서 뛴다
    for (let i = 0; i < 30; i++) { A.tick(1 / 30); B.tick(1 / 30); net.pump(); }
    expect(tino.m.gauge).toBeGreaterThan(30);
  });
  it('티노가 없으면 둘 발소리를 직접 센다 — 뛰어 올라가면 꼭대기 보너스 없음, 살금살금이면 있음', () => {
    const hill = Island.PLACES.tinoHill;
    const run = boot({ econ: false });
    run.A.player.teleport(hill.x + 1, hill.z); run.B.player.teleport(hill.x - 1, hill.z);
    run.A.player.speed = 9; run.B.player.speed = 9;
    run.step(80);
    expect(run.pa.flags().duo).not.toBe(run.pa.day());
    const sneak = boot({ econ: false });
    sneak.A.player.teleport(hill.x + 1, hill.z); sneak.B.player.teleport(hill.x - 1, hill.z);
    sneak.A.player.speed = 1; sneak.B.player.speed = 1;
    sneak.step(80);
    expect(sneak.pa.flags().duo).toBe(sneak.pa.day());
  });
  it('낚시 대회: 길이 합 · 승자', () => {
    const c = new FishContest();
    c.add(30.24); c.add(0); c.add(12);
    expect(c.total).toBe(42.2);
    expect(c.n).toBe(2);
    expect(contestWinner(42.2, 40)).toBe('me');
    expect(catchCm(undefined, 55)).toBe(55);
    const { A, B, pa, pb, step } = boot({ econ: false });
    const f = sp('f_big', 'fish', 3, { len: 50 });
    pa.inviteTo('contest'); step(1); pb.answer(true); step(1);
    A.state.emit({ type: 'catch', activity: 'fish', species: f, rarity: 3, size: 61, combo: 0 } as never);
    B.state.emit({ type: 'catch', activity: 'fish', species: f, rarity: 3, size: 40, combo: 0 } as never);
    step(1);
    expect((pa.run as unknown as { peer: { total: number } }).peer.total).toBe(40);
    A.tick(601); B.tick(601); step(200);
    expect(A.hudLog.banners.some((b) => b.text.includes('우승'))).toBe(true);
    expect(pa.flags().titles).toContain('angler-king');
  });
  it('★5 잡으면 친구 화면에 배너, 친구와 첫 로켓 발사는 칭호', () => {
    const { A, B, pa, step } = boot({ econ: false });
    const leg = sp('f_legend', 'fish', 5);
    B.state.register([leg]);
    A.state.emit({ type: 'catch', activity: 'fish', species: leg, rarity: 5, size: 120, combo: 0 } as never);
    step(1);
    expect(B.hudLog.banners.some((b) => b.text.includes('★5'))).toBe(true);
    A.state.emit({ type: 'launch', to: 'moon' } as never);
    step(1);
    expect(pa.flags().titles).toContain('space-buddy');
    expect(pa.flags().launched).toBe(true);
    expect(grantTitle(pa.flags(), 'space-buddy')).toBe(false);
  });
  it('2인 탈것: 친구 2인승 곁에서 E → 뒷자리(유령 자리) · 둘 다 밟기 · 내리면 풀린다', () => {
    const { A, B, pa, pb, step } = boot({ econ: false });
    const calls: Array<{ on: boolean; pedal?: boolean } | null> = [];
    const seat2 = new (A.engine.scene.constructor as unknown as { new(): import('three').Object3D })();
    A.engine.scene.add(seat2);
    A.vehicles = {
      current: () => ({ kind: 'bike', speed: 3, boat: false, seats: 2 }), owned: () => ['bike'], summon: () => true, isBoat: () => false, registerKind: () => {},
      setPassenger: (o) => { calls.push(o); return seat2 as never; }, seat: () => seat2 as never,
    };
    A.player.mode = 'mounted';
    B.player.teleport(A.player.pos.x + 1.5, A.player.pos.z);
    step(20);
    expect(pb.peerDrive).toEqual({ kind: 'bike', seats: 2 });
    expect(B.listInteractions().some((r) => r.id === 'netplayplay-ride')).toBe(true);
    B.interact('netplayplay-ride');
    step(3);
    expect(pa.passenger).not.toBeNull();
    expect(calls[0]).toEqual({ on: true, pedal: false });
    expect(B.player.mounted).toBeTruthy();
    expect(pb.ride).not.toBeNull();
    // 둘 다 W
    B.input.hold('KeyW'); A.input.hold('KeyW');
    B.player.mounted && (B.player.mounted as unknown as { drive: (i: unknown, dt: number) => void }).drive(B.input, 1 / 30);
    step(3);
    expect(calls.some((c) => c?.pedal === true)).toBe(true);
    expect((A.ext.net as NetLike).coPedal).toBe(true);
    // 손님이 내리면 운전석도 뒷자리를 비운다
    B.player.dismount();
    step(3);
    expect(pb.ride).toBeNull();
    expect(pa.passenger).toBeNull();
  });
  it('끊기면 하던 놀이·뒷자리·태그를 다 접는다', () => {
    const { a, b, pa, pb, step } = boot({ econ: false });
    pa.inviteTo('hide'); step(1); pb.answer(true); step(2);
    expect(pa.run?.kind).toBe('hide');
    a.connected = false; b.connected = false;
    step(2);
    expect(pa.run).toBeNull();
    expect(pb.run).toBeNull();
  });
  it('하루 보상 횟수·숨바꼭질 힌트', () => {
    const p = ensurePlay({});
    expect([1, 2, 3, 4].map(() => takeDaily(p, 'race', 1))).toEqual([true, true, true, false]);
    expect(takeDaily(p, 'race', 2)).toBe(true);
    expect(warmth(5).v).toBeGreaterThan(warmth(60).v);
  });
});

describe('모듈 띄우기', () => {
  it('ext.net 이 없어도 돌고, 창·칩·단축키·디버그 손잡이를 단다', async () => {
    const g = makeFakeGame({ load: false });
    await buildNetplayPlay(makeCtx(g) as never);
    g.tick(1 / 30, 5);
    expect(g.hud.panel('netplayplay')).toBeTruthy();
    expect(g.hud.hotkeys().some((h) => h.code === 'KeyY')).toBe(true);
    expect((globalThis as { __netplayplay?: { state(): { connected: boolean } } }).__netplayplay?.state().connected).toBe(false);
    expect(APP_KIND).toBe('np');
  });
});
