// netplay — 코드 접기·펴기(누르기 포함), 통신 약속 검사, 교환 상태 기계, 자세 보간, 세이브 코드, 메모리 끈 위 두 사람(인사·자세·선물·교환·방명록·app),
// 그리고 모듈을 가짜 게임에 띄워 ext.net·패널·데모 친구·WebRTC 없는 환경을 본다.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encodeCode, decodeCode, toB64url, fromB64url, canCompress, hash32 } from '../src/modules/netplay/codec';
import {
  encodeMsg, decodeMsg, cleanChat, cleanItems, cleanName, PROTO, CHAT_MAX, CHAT_PRESETS, GUESTBOOK_MAX, TRADE_SLOTS,
  type Msg, type Items, type GuestEntry,
} from '../src/modules/netplay/protocol';
import { idleTrade, tradeStep, isReady, isActive, sameItems, applyTrade, canReceive, type TradeState, type BagOps } from '../src/modules/netplay/trade';
import { InterpBuffer, lerpAngle, DELAY, EXTRAP, type PoseSample } from '../src/modules/netplay/interp';
import { exportSave, importSave } from '../src/modules/netplay/save';
import { memoryLinkPair } from '../src/modules/netplay/link';
import { Session, SILENCE_MS, HELLO_MS, POSE_MS, GB_PER_SESSION, COMMIT_MS, type SessionHost, type SessionEvent } from '../src/modules/netplay/session';
import { rtcAvailable, cleanStun, RtcSignal } from '../src/modules/netplay/rtc';
import { migrateSave, SAVE_VERSION, type SaveData } from '../src/core/state';
import { makeFakeGame, makeCtx, recordEvents } from './kit/fakeGame';
import { stubLocalStorage } from './kit/storage';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// ───────────── 코드 ─────────────
describe('코드 접기·펴기', () => {
  it('base64url 왕복(0~255 바이트 전부, = 없음)', () => {
    const b = new Uint8Array(256).map((_, i) => i);
    const s = toB64url(b);
    expect(s).not.toMatch(/[+/=]/);
    expect([...fromB64url(s)]).toEqual([...b]);
  });
  it('누른 코드(z) 왕복 + 줄어든다', async () => {
    expect(canCompress()).toBe(true);
    const v = { k: 'offer', sdp: 'v=0\r\n' + 'a=candidate:1 1 udp 2122260223 192.168.0.2 54321 typ host\r\n'.repeat(30), name: '하루', n: [1, 2, 3] };
    const code = await encodeCode(v);
    expect(code.startsWith('DL1z.')).toBe(true);
    expect(code.length).toBeLessThan(JSON.stringify(v).length / 2);
    const r = await decodeCode(code);
    expect(r).toEqual({ ok: true, value: v });
  });
  it('누르개 없이(j)도 왕복, 잡글·줄바꿈이 섞여도 읽는다', async () => {
    const v = { hello: '안녕 🌸', x: 1.5 };
    const code = await encodeCode(v, { compress: false });
    expect(code.startsWith('DL1j.')).toBe(true);
    const messy = `친구 코드야!\n  ${code.slice(0, 10)}\n${code.slice(10)}  \n고마워`;
    expect(await decodeCode(messy)).toEqual({ ok: true, value: v });
  });
  it('빈 칸·딴 글·깨진 코드는 까닭과 함께 실패', async () => {
    expect(await decodeCode('')).toEqual({ ok: false, err: 'empty' });
    expect(await decodeCode('그냥 글이에요')).toEqual({ ok: false, err: 'format' });
    const code = await encodeCode({ a: 'b'.repeat(200) });
    const broken = code.slice(0, 20) + 'AAAA' + code.slice(24, -6);
    const r = await decodeCode(broken);
    expect(r.ok).toBe(false);
  });
  it('hash32 는 8자 16진수, 글이 다르면 다르다', () => {
    expect(hash32('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(hash32('abc')).not.toBe(hash32('abd'));
  });
});

// ───────────── 통신 약속 ─────────────
describe('통신 약속(버전·검사)', () => {
  const round = (m: Msg) => decodeMsg(encodeMsg(m));
  it('모든 쪽지 종류가 왕복한다', () => {
    const msgs: Msg[] = [
      { t: 'hello', v: PROTO, name: '하루', colors: { tee: '#7cc8f0', hair: '#784a2e' }, summary: { dex: 3, total: 300, stars: 2, coins: 100, day: 4 }, role: 'host' },
      { t: 'bye', reason: 'leave' },
      { t: 'ping', ts: 12 }, { t: 'pong', ts: 12 },
      { t: 'pose', ts: 100, x: 1.5, y: 2, z: -3, yaw: 0.5, m: 'swim', a: 'wave', w: 'earth', s: 3 },
      { t: 'emote', id: 'heart' },
      { t: 'chat', text: '안녕!' }, { t: 'chat', text: CHAT_PRESETS[2], preset: 2 },
      { t: 'gift', gid: 'gh1', id: 'm_apple', n: 3 }, { t: 'gift-ack', gid: 'gh1', got: 2 },
      { t: 'trade', op: 'offer', tid: 't1', items: { m_apple: 2, 'fish_a@shiny': 1 }, rev: 3 },
      { t: 'gb-sign', text: '또 올게!' },
      { t: 'gb', entries: [{ name: '하루', text: '안녕', day: 1, at: 5, tee: '#ff8e86' }] },
      { t: 'app', kind: 'race:start', data: { lap: 2, cp: [1, 2] } },
    ];
    for (const m of msgs) {
      const r = round(m);
      expect(r.ok, m.t).toBe(true);
      if (r.ok) expect(r.msg).toEqual(m);
    }
  });
  it('버전이 높거나 없는 쪽지는 version 으로 거절', () => {
    expect(decodeMsg(JSON.stringify({ v: PROTO + 1, t: 'ping', ts: 1 }))).toMatchObject({ ok: false, err: 'version' });
    expect(decodeMsg(JSON.stringify({ t: 'ping', ts: 1 }))).toMatchObject({ ok: false, err: 'version' });
    expect(decodeMsg('{나쁜 json')).toMatchObject({ ok: false, err: 'parse' });
    expect(decodeMsg(JSON.stringify({ v: PROTO, t: 'mystery' }))).toMatchObject({ ok: false, err: 'type' });
    expect(decodeMsg('x'.repeat(70000))).toMatchObject({ ok: false, err: 'size' });
  });
  it('채팅은 40자, 조절 글자 제거, 이름은 10자', () => {
    const long = '가'.repeat(60);
    expect(Array.from(cleanChat(long)).length).toBe(CHAT_MAX);
    expect(cleanChat('  안\n녕\u0000\u200b  하세요 ')).toBe('안 녕 하세요');
    expect(cleanChat('🌸'.repeat(50))).toBe('🌸'.repeat(CHAT_MAX)); // 이모지는 한 글자
    expect(cleanName('')).toBe('친구');
    expect(Array.from(cleanName('아주아주아주긴이름이에요')).length).toBe(10);
    const r = decodeMsg(JSON.stringify({ v: PROTO, t: 'chat', text: long }));
    expect(r.ok && r.msg.t === 'chat' && Array.from(r.msg.text).length).toBe(CHAT_MAX);
    expect(decodeMsg(JSON.stringify({ v: PROTO, t: 'chat', text: '   ' })).ok).toBe(false);
  });
  it('이상한 아이템·개수·좌표는 걸러진다', () => {
    expect(cleanItems({ m_apple: 2, 'bad id!': 1, m_shell: 0, m_x: 1.5, m_y: 1000, '<script>': 1 })).toEqual({ m_apple: 2 });
    const many: Items = {};
    for (let i = 0; i < 10; i++) many[`m_${i}`] = 1;
    expect(Object.keys(cleanItems(many)).length).toBe(TRADE_SLOTS);
    expect(decodeMsg(JSON.stringify({ v: PROTO, t: 'gift', gid: 'g1', id: 'm_apple', n: 0 })).ok).toBe(false);
    expect(decodeMsg(JSON.stringify({ v: PROTO, t: 'pose', ts: 1, x: 'a', y: 0, z: 0, yaw: 0 })).ok).toBe(false);
    const p = decodeMsg(JSON.stringify({ v: PROTO, t: 'pose', ts: 1, x: 1, y: 0, z: 0, yaw: 0, m: 'teleport', a: 'DROP TABLE', w: 'earth' }));
    expect(p.ok && p.msg.t === 'pose' && [p.msg.m, p.msg.a]).toEqual(['ground', null]);
    expect(decodeMsg(JSON.stringify({ v: PROTO, t: 'emote', id: 'nope' })).ok).toBe(false);
    const gb = decodeMsg(JSON.stringify({ v: PROTO, t: 'gb', entries: Array.from({ length: 80 }, (_, i) => ({ name: 'a', text: `글${i}`, day: 1, at: 1, tee: 'red' })) }));
    expect(gb.ok && gb.msg.t === 'gb' && gb.msg.entries.length).toBe(GUESTBOOK_MAX);
    expect(gb.ok && gb.msg.t === 'gb' && gb.msg.entries[0].tee).toBe('#ff8e86');
  });
});

// ───────────── 교환 상태 기계 ─────────────
describe('교환 상태 기계', () => {
  const open = (): TradeState => tradeStep(tradeStep(idleTrade(), { k: 'invite', tid: 't1' }), { k: 'remote-accept' });
  it('초대 → 수락 → 열림, 받은 초대 → 수락', () => {
    let s = tradeStep(idleTrade(), { k: 'invite', tid: 't1' });
    expect(s.phase).toBe('inviting');
    expect(tradeStep(s, { k: 'remote-invite', tid: 't2' })).toBe(s); // 이미 진행 중
    s = tradeStep(s, { k: 'remote-accept' });
    expect(s.phase).toBe('open');
    let r = tradeStep(idleTrade(), { k: 'remote-invite', tid: 'x' });
    expect(r.phase).toBe('invited');
    r = tradeStep(r, { k: 'accept' });
    expect(r.phase).toBe('open');
    expect(isActive(r)).toBe(true);
  });
  it('물건을 바꾸면 두 사람 좋아요가 풀리고, 옛 rev 확인은 무시', () => {
    let s = open();
    s = tradeStep(s, { k: 'offer', items: { m_apple: 2 } });
    expect(s.mine).toEqual({ items: { m_apple: 2 }, rev: 1, ok: false });
    s = tradeStep(s, { k: 'remote-offer', items: { m_shell: 1 }, rev: 1 });
    s = tradeStep(s, { k: 'confirm' });
    // 상대가 내 rev 1 · 자기 rev 1 을 보고 좋아요
    s = tradeStep(s, { k: 'remote-confirm', rev: 1, theirRev: 1 });
    expect(isReady(s)).toBe(true);
    // 내가 바꾸면 둘 다 풀린다
    s = tradeStep(s, { k: 'offer', items: { m_apple: 3 } });
    expect([s.mine.ok, s.theirs.ok, s.mine.rev]).toEqual([false, false, 2]);
    // 상대의 옛 확인(내 rev 1 을 본 것)은 무시
    const same = tradeStep(s, { k: 'remote-confirm', rev: 1, theirRev: 1 });
    expect(same).toBe(s);
    s = tradeStep(s, { k: 'remote-confirm', rev: 1, theirRev: 2 });
    expect(s.theirs.ok).toBe(true);
    // 옛 rev 의 상대 offer 도 무시
    expect(tradeStep(s, { k: 'remote-offer', items: { m_x: 9 }, rev: 1 })).toBe(s);
    // 같은 묶음 다시 내기는 아무 일 없음
    expect(tradeStep(s, { k: 'offer', items: { m_apple: 3 } })).toBe(s);
  });
  it('빈 교환은 준비 안 됨 · commit → done / 실패하면 다시 열림 · 취소', () => {
    let s = open();
    s = tradeStep(tradeStep(s, { k: 'confirm' }), { k: 'remote-confirm', rev: 0, theirRev: 0 });
    expect(isReady(s)).toBe(false);
    s = tradeStep(s, { k: 'offer', items: { m_apple: 1 } });
    s = tradeStep(tradeStep(s, { k: 'confirm' }), { k: 'remote-confirm', rev: 0, theirRev: 1 });
    expect(isReady(s)).toBe(true);
    const c = tradeStep(s, { k: 'commit' });
    expect(c.phase).toBe('committing');
    expect(tradeStep(c, { k: 'offer', items: { m_apple: 5 } })).toBe(c); // 처리 중엔 못 바꾼다
    const fail = tradeStep(c, { k: 'done', ok: false });
    expect([fail.phase, fail.mine.ok, fail.theirs.ok]).toEqual(['open', false, false]);
    expect(tradeStep(c, { k: 'done', ok: true }).phase).toBe('done');
    expect(tradeStep(s, { k: 'cancel' }).phase).toBe('cancelled');
    expect(tradeStep(idleTrade(), { k: 'cancel' }).phase).toBe('idle');
  });
  it('applyTrade 는 전부 되거나 하나도 안 된다', () => {
    const bag: Record<string, number> = { m_apple: 2, tool_rod: 1 };
    let cap = 99;
    const ops: BagOps = {
      count: (id) => bag[id] ?? 0,
      canAdd: (id, n) => (bag[id] ?? 0) + n <= cap,
      tradable: (id) => !id.startsWith('tool_'),
      spend: (it) => { for (const [id, n] of Object.entries(it)) if ((bag[id] ?? 0) < n) return false; for (const [id, n] of Object.entries(it)) bag[id] -= n; return true; },
      give: (id, n) => { bag[id] = (bag[id] ?? 0) + n; return n; },
    };
    expect(applyTrade(ops, { m_apple: 3 }, { m_shell: 1 }).ok).toBe(false);
    expect(applyTrade(ops, { tool_rod: 1 }, { m_shell: 1 }).ok).toBe(false);
    expect(bag).toEqual({ m_apple: 2, tool_rod: 1 });
    cap = 0;
    expect(canReceive(ops, { m_shell: 1 })).toBe(false);
    // 사과를 통째로 주면 한 칸이 빈다 → 받을 수 있다
    expect(canReceive(ops, { m_shell: 1 }, { m_apple: 2 })).toBe(true);
    cap = 99;
    expect(applyTrade(ops, { m_apple: 2 }, { m_shell: 4 })).toEqual({ ok: true, overflow: {} });
    expect(bag.m_apple).toBe(0);
    expect(bag.m_shell).toBe(4);
    expect(sameItems({ a: 1, b: 0 }, { a: 1 })).toBe(true);
  });
});

// ───────────── 자세 보간 ─────────────
describe('자세 보간', () => {
  const S = (ts: number, x: number, o: Partial<PoseSample> = {}): PoseSample => ({ ts, x, y: 0, z: 0, yaw: 0, m: 'ground', a: null, w: 'earth', s: 1, ...o });
  it('DELAY 만큼 늦게 사이를 잇는다(보낸 쪽 시계가 달라도)', () => {
    const b = new InterpBuffer();
    const skew = 50_000; // 상대 시계가 50초 앞서 있다
    for (let i = 0; i <= 5; i++) b.push(S(skew + i * 100, i), 1000 + i * 100 + 20);
    // 지금 1520: 상대 시각으로 ~ 50500 - 20(지연) - DELAY
    const o = b.sample(1520)!;
    // 시계 차 = skew - 1020 → 재생 시각 = 1520 + 시계 차 - DELAY = skew + 350 → x 3.5
    const want = (1520 - 1020 - DELAY) / 100;
    expect(o.x).toBeCloseTo(want, 1);
    expect(o.extrapolating).toBe(false);
  });
  it('끝을 넘으면 EXTRAP 까지만 앞으로 밀고 멈춘다', () => {
    const b = new InterpBuffer();
    b.push(S(0, 0), 0);
    b.push(S(100, 1), 100);
    const o = b.sample(100 + DELAY + 50)!;
    expect(o.extrapolating).toBe(true);
    expect(o.x).toBeCloseTo(1.5, 5);
    const far = b.sample(100 + DELAY + 5000)!;
    expect(far.x).toBeCloseTo(1 + EXTRAP / 100, 5);
  });
  it('멀리 순간이동·세계 바뀜은 미끄러지지 않고 끊는다, 늦게 온 옛 쪽지는 버린다', () => {
    const b = new InterpBuffer();
    b.push(S(0, 0), 0);
    b.push(S(100, 500), 100);
    expect(b.size).toBe(1);
    b.push(S(50, 7), 110);
    expect(b.latest()!.x).toBe(500);
    b.push(S(200, 501, { w: 'space:moon' }), 200);
    expect(b.size).toBe(1);
    expect(b.sample(400)!.w).toBe('space:moon');
  });
  it('각도는 짧은 쪽으로 돈다', () => {
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI, 5);
    const b = new InterpBuffer();
    b.push(S(0, 0, { yaw: 3.0 }), 0);
    b.push(S(100, 1, { yaw: -3.0 }), 100);
    const o = b.sample(50 + DELAY)!;
    expect(Math.abs(Math.cos(o.yaw) - Math.cos(Math.PI))).toBeLessThan(0.01);
  });
  it('비었으면 null', () => { expect(new InterpBuffer().sample(10)).toBeNull(); });
});

// ───────────── 세이브 코드 ─────────────
describe('세이브 코드', () => {
  const snap: SaveData = {
    v: SAVE_VERSION, coins: 12345,
    bag: { m_apple: 3, 'fish_carp@shiny': 1 },
    dex: { fish_carp: { count: 2, best: 31, first: 100, variants: { shiny: 1 } } },
    flags: { net: { name: '하루', guestbook: [{ name: '꼬마', text: '안녕', day: 1, at: 2, tee: '#ff8e86' }] }, econ: { stars: 9 } },
  };
  it('내보내기 → 불러오기 왕복', async () => {
    const code = await exportSave(snap, 777);
    expect(code.startsWith('DL1')).toBe(true);
    const r = await importSave(`  ${code}\n`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual(migrateSave(snap));
    expect(r.at).toBe(777);
    expect(r.summary).toEqual({ coins: 12345, dex: 1, items: 4 });
  });
  it('옛(v1) 모양도 다듬어 들어온다', async () => {
    const old = { coins: 5, bag: { 'fruit-apple': 2 }, dex: {}, flags: {} } as unknown as SaveData;
    const r = await importSave(await exportSave(old));
    expect(r.ok && r.data.bag).toEqual({ m_apple: 2 });
  });
  it('딴 코드·깨진 코드·해시 안 맞음은 거절', async () => {
    const notSave = await encodeCode({ k: 'offer', sdp: 'v=0' });
    expect(await importSave(notSave)).toMatchObject({ ok: false, err: 'kind' });
    expect((await importSave('엉뚱한 글')).ok).toBe(false);
    const tampered = await encodeCode({ k: 'save', v: SAVE_VERSION, at: 1, h: '00000000', d: { ...snap, coins: 99999999 } });
    expect(await importSave(tampered)).toMatchObject({ ok: false, err: 'hash' });
    const newer = await encodeCode({ k: 'save', v: SAVE_VERSION + 5, at: 1, h: 'x', d: snap });
    expect(await importSave(newer)).toMatchObject({ ok: false, err: 'newer' });
  });
});

// ───────────── 메모리 끈 위의 두 사람 ─────────────
interface Peer { host: SessionHost; bag: Record<string, number>; gb: GuestEntry[]; events: SessionEvent[]; pos: { x: number; z: number }; cap: number }
let clock = 0;
function peer(name: string, bag: Record<string, number> = {}): Peer {
  const p: Peer = {
    bag: { ...bag }, gb: [], events: [], pos: { x: 0, z: 0 }, cap: 99,
    host: null as unknown as SessionHost,
  };
  p.host = {
    now: () => clock,
    profile: () => ({ name, colors: { tee: '#7cc8f0', hair: '#784a2e' } }),
    summary: () => ({ dex: 5, total: 300, stars: 1, coins: 10, day: 2 }),
    pose: () => ({ x: p.pos.x, y: 0, z: p.pos.z, yaw: 0, m: 'ground', a: null, w: 'earth', s: 1 }),
    bag: {
      count: (id) => p.bag[id] ?? 0,
      canAdd: (id, n) => (p.bag[id] ?? 0) + n <= p.cap,
      tradable: (id) => !id.startsWith('tool_'),
      spend: (it) => { for (const [id, n] of Object.entries(it)) if ((p.bag[id] ?? 0) < n) return false; for (const [id, n] of Object.entries(it)) { p.bag[id] -= n; if (!p.bag[id]) delete p.bag[id]; } return true; },
      give: (id, n) => { const room = Math.max(0, Math.min(n, p.cap - (p.bag[id] ?? 0))); if (room) p.bag[id] = (p.bag[id] ?? 0) + room; return room; },
    },
    guestbook: { list: () => p.gb, add: (e) => { p.gb.push(e); } },
    day: () => 2,
  };
  return p;
}
function pair(aBag: Record<string, number> = {}, bBag: Record<string, number> = {}) {
  const link = memoryLinkPair({ auto: false });
  const A = peer('방장', aBag), B = peer('손님', bBag);
  const sa = new Session(link.a, 'host', A.host, (e) => A.events.push(e));
  const sb = new Session(link.b, 'guest', B.host, (e) => B.events.push(e));
  link.pump();
  return { A, B, sa, sb, pump: link.pump, link };
}

describe('두 사람(메모리 끈)', () => {
  beforeEach(() => { clock = 1000; });

  it('인사(hello) — 서로 이름·요약을 알고 connected, 방장은 방명록을 보여 준다', () => {
    const { A, B, sa, sb } = pair();
    expect(sa.status).toBe('connected');
    expect(sb.status).toBe('connected');
    expect(sa.peer).toMatchObject({ name: '손님', role: 'guest', summary: { dex: 5 } });
    expect(sb.peer).toMatchObject({ name: '방장', role: 'host' });
    expect(A.events.some((e) => e.k === 'hello')).toBe(true);
    expect(B.events.some((e) => e.k === 'guestbook')).toBe(true);
  });

  it('자세 10Hz → 상대 보간 버퍼, 그대로면 1초에 한 번만', () => {
    const { A, sa, sb, pump, link } = pair();
    let sent = 0;
    const orig = link.a.send.bind(link.a);
    link.a.send = (t: string) => { if (t.includes('"pose"')) sent++; return orig(t); };
    for (let i = 0; i < 10; i++) { A.pos.x = i * 0.5; clock += POSE_MS; sa.tick(); pump(); }
    expect(sent).toBe(10);
    expect(sb.interp.latest()!.x).toBeCloseTo(4.5);
    const o = sb.interp.sample(clock)!;
    expect(o.x).toBeGreaterThan(2.5);
    expect(o.x).toBeLessThan(4.5);
    sent = 0;
    for (let i = 0; i < 20; i++) { clock += POSE_MS; sa.tick(); pump(); }
    expect(sent).toBe(2); // 멈춰 있으면 keepalive 만
  });

  it('선물: 보낸 쪽 빼고 받은 쪽 넣고, 가방이 차면 남은 만큼 돌아온다', () => {
    const { A, B, sa, pump } = pair({ m_apple: 5, tool_rod: 1 });
    expect(sa.gift('m_apple', 2)).toEqual({ ok: true });
    expect(A.bag.m_apple).toBe(3);
    pump();
    expect(B.bag.m_apple).toBe(2);
    expect(B.events.find((e) => e.k === 'gift-in')).toMatchObject({ id: 'm_apple', n: 2, got: 2 });
    expect(A.events.find((e) => e.k === 'gift-ack')).toMatchObject({ got: 2, refunded: 0 });
    // 도구·없는 것은 못 보낸다
    expect(sa.gift('tool_rod', 1).ok).toBe(false);
    expect(sa.gift('m_pear', 1).ok).toBe(false);
    // 받는 쪽 가방이 2개만 더 들어가면
    B.cap = 4;
    expect(sa.gift('m_apple', 3).ok).toBe(true);
    pump();
    expect(B.bag.m_apple).toBe(4);
    expect(A.bag.m_apple).toBe(1); // 3 - 3 + 1 돌려받음
  });

  it('교환: 둘 다 좋아요 → 한 번에 바뀐다(방장 맡김 → 손님 처리 → 방장 받기)', () => {
    const { A, B, sa, sb, pump } = pair({ m_apple: 4 }, { m_shell: 6, m_pearl: 1 });
    expect(sb.tradeInvite()).toBe(true);
    pump();
    expect(sa.trade.phase).toBe('invited');
    sa.tradeAccept(); pump();
    expect(sb.trade.phase).toBe('open');
    expect(sa.tradeOffer({ m_apple: 3 }).ok).toBe(true);
    expect(sb.tradeOffer({ m_shell: 5, m_pearl: 1 }).ok).toBe(true);
    pump();
    expect(sa.trade.theirs.items).toEqual({ m_shell: 5, m_pearl: 1 });
    sa.tradeConfirm(); pump();
    expect(A.bag.m_apple).toBe(4); // 아직
    // 손님이 마지막에 물건을 바꾸면 방장 좋아요도 풀린다
    sb.tradeOffer({ m_shell: 4, m_pearl: 1 }); pump();
    expect(sa.trade.mine.ok).toBe(false);
    sb.tradeConfirm(); pump();
    expect(A.bag.m_apple).toBe(4);
    sa.tradeConfirm(); pump();
    expect(sa.trade.phase).toBe('done');
    expect(sb.trade.phase).toBe('done');
    expect(A.bag).toEqual({ m_apple: 1, m_shell: 4, m_pearl: 1 });
    expect(B.bag).toEqual({ m_shell: 2, m_apple: 3 });
    expect(A.events.find((e) => e.k === 'trade-result')).toMatchObject({ ok: true, got: { m_shell: 4, m_pearl: 1 } });
  });

  it('교환: 손님 가방 사정이 바뀌면 실패 — 방장은 맡긴 걸 돌려받고 아무것도 안 바뀐다', () => {
    const { A, B, sa, sb, pump } = pair({ m_apple: 2 }, { m_shell: 2 });
    sa.tradeInvite(); pump(); sb.tradeAccept(); pump();
    sa.tradeOffer({ m_apple: 2 }); sb.tradeOffer({ m_shell: 2 }); pump();
    sb.tradeConfirm(); pump();
    // 손님이 좋아요 뒤 몰래 조개를 써 버림(다른 데서 팔기 등)
    B.bag.m_shell = 1;
    sa.tradeConfirm(); pump();
    expect(A.bag).toEqual({ m_apple: 2 });
    expect(B.bag).toEqual({ m_shell: 1 });
    expect(sa.trade.phase).toBe('open');
    expect(A.events.some((e) => e.k === 'trade-result' && !e.ok)).toBe(true);
  });

  it('교환 중 끊기면 방장이 맡긴 건 돌아온다 · done 이 안 오면 시간 초과로 돌려받는다', () => {
    const { A, sa, sb, pump, link } = pair({ m_apple: 2 }, { m_shell: 2 });
    sa.tradeInvite(); pump(); sb.tradeAccept(); pump();
    sa.tradeOffer({ m_apple: 2 }); pump();
    sb.tradeConfirm(); pump();
    // 손님 쪽으로 가는 쪽지를 막는다(commit 이 사라짐)
    link.b.onmessage = () => {};
    sa.tradeConfirm();
    expect(A.bag.m_apple ?? 0).toBe(0); // 맡김
    expect(sa.trade.phase).toBe('committing');
    clock += COMMIT_MS + 10;
    sa.tick();
    expect(A.bag.m_apple).toBe(2);
    expect(sa.trade.phase).toBe('cancelled');
  });

  it('방명록: 손님이 쓰면 방장 flags 에 남고 손님에게도 보인다(세션당 3줄)', () => {
    const { A, sa, sb, pump } = pair();
    expect(sa.signGuestbook('내 섬').ok).toBe(false); // 방장은 안 씀
    for (let i = 0; i < GB_PER_SESSION; i++) { expect(sb.signGuestbook(`놀다 가요 ${i}`).ok).toBe(true); pump(); }
    expect(sb.signGuestbook('하나 더').ok).toBe(false);
    expect(A.gb.map((e) => e.text)).toEqual(['놀다 가요 0', '놀다 가요 1', '놀다 가요 2']);
    expect(A.gb[0]).toMatchObject({ name: '손님', day: 2 });
    expect(sb.remoteGuestbook.length).toBe(3);
  });

  it('이모트·채팅(정해진 말 + 40자)·app 통로', () => {
    const { B, sa, sb, pump } = pair();
    const got: unknown[] = [];
    const off = sb.onApp('race', (d) => got.push(d));
    const all: string[] = [];
    sb.onApp('*', (_d, k) => all.push(k));
    expect(sa.emote('heart')).toBe(true);
    expect(sa.emote('nope')).toBe(false);
    expect(sa.say(3)).toBe(true);
    expect(sa.say('가'.repeat(80))).toBe(true);
    expect(sa.sendApp('race', { cp: 2 })).toBe(true);
    expect(sa.sendApp('bad kind!', 1)).toBe(false);
    pump();
    expect(B.events.find((e) => e.k === 'emote')).toMatchObject({ from: 'peer', id: 'heart' });
    expect(sb.chat.map((l) => l.text)).toEqual([CHAT_PRESETS[3], '가'.repeat(CHAT_MAX)]);
    expect(got).toEqual([{ cp: 2 }]);
    off();
    sa.sendApp('race', 3); sa.sendApp('fish', 1); pump();
    expect(got.length).toBe(1);
    expect(all).toEqual(['race', 'race', 'fish']);
  });

  it('끊김: bye → 상대 closed, 소식 없음 → timeout, 인사 없음 → hello-timeout, 같은 역할 → role', () => {
    const p = pair();
    p.sa.close('leave'); p.pump();
    expect(p.sb.status).toBe('closed');
    expect(p.sb.closeReason).toBe('bye');

    const q = pair();
    clock += SILENCE_MS + 1;
    q.sa.tick();
    expect(q.sa.status).toBe('closed');
    expect(q.sa.closeReason).toBe('timeout');

    const link = memoryLinkPair({ auto: false });
    const lonely = new Session(link.a, 'host', peer('혼자').host);
    clock += HELLO_MS + 1;
    lonely.tick();
    expect(lonely.closeReason).toBe('hello-timeout');

    const l2 = memoryLinkPair({ auto: false });
    const h1 = new Session(l2.a, 'host', peer('a').host);
    const h2 = new Session(l2.b, 'host', peer('b').host);
    l2.pump();
    expect([h1.status, h2.status]).toEqual(['closed', 'closed']);
  });

  it('버전이 다른 쪽지가 오면 끊는다', () => {
    const { sa, link, pump } = pair();
    link.b.send(JSON.stringify({ v: PROTO + 1, t: 'ping', ts: 1 }));
    pump();
    expect(sa.status).toBe('closed');
    expect(sa.closeReason).toBe('version');
  });

  it('자동(마이크로태스크) 끈으로도 인사가 오간다', async () => {
    const link = memoryLinkPair();
    const a = new Session(link.a, 'host', peer('a').host);
    const b = new Session(link.b, 'guest', peer('b').host);
    await flush();
    expect([a.status, b.status]).toEqual(['connected', 'connected']);
  });
});

// ───────────── WebRTC 없는 환경 ─────────────
describe('WebRTC 가 없을 때', () => {
  it('rtcAvailable=false, host/join 은 던지지 않고 실패 글을 준다', async () => {
    expect(rtcAvailable()).toBe(false);
    const s = new RtcSignal('');
    const r = await s.host('나');
    expect(r).toMatchObject({ ok: false, err: 'nortc' });
    const offer = await encodeCode({ k: 'offer', v: PROTO, sdp: 'v=0\r\n', name: 'x', at: Date.now() });
    expect(await new RtcSignal('').join(offer, '나')).toMatchObject({ ok: false, err: 'nortc' });
    expect((await new RtcSignal('').join('엉뚱', '나')).ok).toBe(false);
    expect(await new RtcSignal('').finish(offer)).toMatchObject({ ok: false });
  });
  it('STUN 주소는 stun: 으로 시작하는 것만', () => {
    expect(cleanStun('stun:stun.example.org:3478')).toBe('stun:stun.example.org:3478');
    expect(cleanStun('https://evil')).toBe('');
    expect(cleanStun('')).toBe('');
  });
});

// ───────────── 모듈(가짜 게임) ─────────────
type G = Record<string, unknown>;
const gl = globalThis as unknown as G;
function stubDocument() {
  const had = 'document' in gl;
  const prev = gl.document;
  const ctx2d = new Proxy({}, {
    get: (_t, k) => (k === 'measureText' ? (s: string) => ({ width: String(s).length * 10 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}),
    set: () => true,
  });
  const el = (tag: string) => ({
    tagName: tag, style: {}, dataset: {}, width: 0, height: 0, textContent: '', innerHTML: '',
    getContext: () => ctx2d, appendChild() {}, addEventListener() {}, setAttribute() {},
  });
  gl.document = { head: { appendChild() {} }, body: { appendChild() {} }, createElement: el, activeElement: null, addEventListener() {}, removeEventListener() {} };
  return () => { if (had) gl.document = prev; else delete gl.document; };
}

describe('netplay 모듈', () => {
  let undoDoc: () => void;
  beforeEach(() => { stubLocalStorage(); undoDoc = stubDocument(); });
  afterEach(() => { undoDoc(); delete (gl as { __net?: unknown }).__net; });

  it('ext.net·패널·칩·단축키·__net 을 건다', async () => {
    const game = makeFakeGame();
    const { default: build, order } = await import('../src/modules/netplay');
    expect(order).toBe(60);
    build(makeCtx(game));
    const net = game.ext.net;
    expect(net).toBeTruthy();
    expect(net.status).toBe('idle');
    expect(net.visiting).toBe(false);
    expect(net.send('x', 1)).toBe(false);
    expect(typeof net.on('x', () => {})).toBe('function');
    expect(game.hud.panel('friends')).toBeTruthy();
    expect(game.hud.panel('save')).toBeTruthy();
    expect(game.hud.chips().some((c) => c.id === 'netplay:friends')).toBe(true);
    expect(game.hud.hotkeys().some((k) => k.code === 'KeyT')).toBe(true);
    const dbg = gl.__net as { status(): string; host(): Promise<string>; ctl: { note: string; status: string } };
    expect(dbg.status()).toBe('idle');
    // WebRTC 없는 node — 방 만들기는 실패 안내로 끝난다(던지지 않음)
    await dbg.host();
    expect(dbg.ctl.status).toBe('failed');
    expect(dbg.ctl.note).toContain('WebRTC');
  });

  it('데모 친구(메모리 끈): 연결 → net-peer 이벤트 · 아바타 · 선물 · app → net-coop · 끊으면 visiting 해제', async () => {
    const game = makeFakeGame();
    const ev = recordEvents(game);
    const { default: build } = await import('../src/modules/netplay');
    build(makeCtx(game));
    game.state.addItem('m_apple', 3);
    const dbg = gl.__net as { demo(): string; ctl: { session: Session | null; avatar: unknown; bot: { session: Session } | null; tick(): void } };
    dbg.demo();
    await flush();
    const net = game.ext.net;
    expect(net.status).toBe('connected');
    expect(net.role).toBe('host');
    expect(net.peer.name).toBe('꼬마친구');
    expect(net.visiting).toBe(false); // 방장
    expect(ev.of('net-peer').map((e) => e.state)).toContain('connected');
    expect(dbg.ctl.avatar).toBeTruthy();
    game.tick(1 / 60, 3);
    // 선물(econ 없음 → 코어 가방)
    expect(net.gift('m_apple', 2)).toBe(true);
    expect(game.state.bag.m_apple).toBe(1);
    await flush();
    // 봇이 app 쪽지를 보내면 ext.net.on 과 net-coop 으로 온다
    const got: unknown[] = [];
    net.on('coop', (d: unknown) => got.push(d));
    dbg.ctl.bot!.session.sendApp('coop', { kind: 'reel' });
    await flush();
    expect(got).toEqual([{ kind: 'reel' }]);
    expect(ev.of('net-coop')).toEqual([expect.objectContaining({ kind: 'coop', data: { kind: 'reel' } })]);
    // 방명록 flags
    dbg.ctl.bot!.session.signGuestbook('또 올게요!');
    await flush();
    expect((game.state.flags.net as { guestbook: GuestEntry[] }).guestbook.map((e) => e.text)).toEqual(['또 올게요!']);
    net.leave();
    await flush();
    expect(net.status).toBe('closed');
    expect(net.connected).toBe(false);
    ev.off();
  });
});
