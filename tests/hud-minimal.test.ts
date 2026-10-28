// hud-minimal(wave 7) — 비어 있는 화면 규칙(hud/present.ts): 칩 살짝 보이기(바뀜·쉬는 시간·자꾸 바뀜·쌓기), 큰 연출 자리(배너 하나·숨 고르기·
// 놀기 전/컷신 줄 서기·지역 이름 앞세우기·끼어들기), 토스트 한 줄, 말랑 주머니 방울 고르기·순서·고리 자리·무지개·키 이동, 안내 말풍선 줄,
// 키 모자 쪼개기, 놀기 시작 판단, 레지스트리 peek/hint 큐, Tab 동작.
import { describe, expect, it } from 'vitest';
import {
  Stage, ToastLine, PeekTracker, HintQueue, pocketApps, ringLayout, arcRows, pocketNav, hintParts, chipSig, startedOf, isCinematic,
  badgeText, controlRows, comboShown, STAGE_GAP, APP_ORDER, type StageItem,
} from '../src/modules/hud/present';
import { pocketKeyAction, POCKET_KIND, HUD_KEYS, TimedQueue } from '../src/modules/hud/logic';
import { Sequencer, GAUGE_LINGER } from '../src/modules/hudfx/logic';
import { HudRegistryStore } from '../src/core/registry';
import type { HudRenderer, HintOpts } from '../src/core/api';

describe('칩 살짝 보이기(PeekTracker)', () => {
  const auto = { auto: true, canPeek: true };
  it('처음 본 내용은 기준 — 바뀌면 뜬다, 같으면 그대로', () => {
    const p = new PeekTracker();
    expect(p.observe('bag', '가방 0/20칸', 0, auto)).toBeNull();
    expect(p.observe('bag', '가방 0/20칸', 100, auto)).toBeNull();
    expect(p.observe('bag', '가방 1/20칸', 200, auto)).toEqual({ start: 'bag' });
    expect(p.stack).toEqual(['bag']);
  });
  it('떠 있는 동안 또 바뀌면 늘린다(최대 maxHoldMs), 시간이 다 되면 내린다', () => {
    const p = new PeekTracker({ holdMs: 3000, maxHoldMs: 5000 });
    p.observe('w', '0', 0, auto);
    p.observe('w', '10', 1000, auto);
    expect(p.observe('w', '20', 3500, auto)).toEqual({ extend: 'w' });
    expect(p.update(3999)).toEqual([]);
    // 처음 뜬 1000 + 5000 = 6000 에서 끝(3500 + 3000 = 6500 이 아니라)
    expect(p.update(5999)).toEqual([]);
    expect(p.update(6000)).toEqual(['w']);
    expect(p.stack).toEqual([]);
  });
  it('내린 뒤 쉬는 시간(cooldown) 동안은 저절로 안 뜬다 — request 는 뜬다', () => {
    const p = new PeekTracker({ holdMs: 1000, cooldownMs: 5000 });
    p.observe('m', 'a', 0, auto);
    p.observe('m', 'b', 10, auto);
    expect(p.update(1010)).toEqual(['m']);
    expect(p.observe('m', 'c', 2000, auto)).toBeNull();
    expect(p.observe('m', 'd', 6100, auto)).toEqual({ start: 'm' });
    p.update(8000);
    expect(p.request('m', 2000, 8100)).toEqual({ start: 'm' });
  });
  it('자꾸 바뀌는 칩은 한동안 조용히, auto=false(시계)·canPeek=false(놀기 전)·빈 칩은 안 뜬다', () => {
    const p = new PeekTracker({ holdMs: 100, cooldownMs: 0, jitterN: 3, jitterWindow: 10000, jitterMute: 60000, burstMs: 500 });
    p.observe('j', '0', 0, auto);
    let started = 0;
    for (let i = 1; i <= 6; i++) { const r = p.observe('j', String(i), i * 1000, auto); if (r?.start) started++; p.update(i * 1000 + 500); }
    expect(started).toBe(3); // 4번째 바뀜부터 조용
    expect(p.observe('j', 'x', 30000, auto)).toBeNull();
    // 숫자가 촤르르 올라가는 건 한 번의 변화 — 몇 번 바뀌어도 지갑이 조용해지지 않는다
    const w = new PeekTracker();
    w.observe('wallet', '0', 0, auto);
    let ws = 0;
    for (let k = 0; k < 5; k++) {
      const t0 = 1000 + k * 10000;
      for (const [i, v] of ['7', '42', '120'].entries()) if (w.observe('wallet', `${v}-${k}`, t0 + i * 100, auto)?.start) ws++;
      w.update(t0 + 3500);
    }
    expect(ws).toBe(5);
    expect(w.info('wallet')!.muted).toBe(0);
    // 창이 열린 동안(canPeek=false) 바뀐 건 자꾸 바뀜으로 안 센다
    const q = new PeekTracker({ jitterN: 2, burstMs: 0 });
    q.observe('bag', '0', 0, auto);
    for (let i = 1; i <= 6; i++) q.observe('bag', String(i), i * 100, { auto: true, canPeek: false });
    expect(q.observe('bag', 'x', 1000, auto)).toEqual({ start: 'bag' });
    const c = new PeekTracker();
    c.observe('clock', '09:00', 0, { auto: false, canPeek: true });
    expect(c.observe('clock', '09:01', 1000, { auto: false, canPeek: true })).toBeNull();
    c.observe('bag', '1', 0, auto);
    expect(c.observe('bag', '2', 100, { auto: true, canPeek: false })).toBeNull();
    // 놀기 전에 바뀐 건 기준만 바뀐다 → 시작 뒤 같은 값이면 안 뜬다
    expect(c.observe('bag', '2', 200, auto)).toBeNull();
    c.observe('mail', '', 0, auto);
    expect(c.observe('mail', '', 10, auto)).toBeNull();
    c.observe('mail2', '새 편지 1', 0, auto);
    expect(c.observe('mail2', '', 10, auto)).toBeNull(); // 사라진 건 안 띄움
  });
  it('최대 3개 — 새 것이 위, 넘치면 가장 오래된 것을 내린다', () => {
    const p = new PeekTracker({ max: 3 });
    for (const id of ['a', 'b', 'c', 'd']) p.observe(id, '0', 0, auto);
    p.observe('a', '1', 10, auto); p.observe('b', '1', 20, auto); p.observe('c', '1', 30, auto);
    expect(p.stack).toEqual(['c', 'b', 'a']);
    expect(p.observe('d', '1', 40, auto)).toEqual({ start: 'd', evicted: ['a'] });
    expect(p.stack).toEqual(['d', 'c', 'b']);
    expect(p.clear(50)).toEqual(['d', 'c', 'b']);
    expect(p.stack).toEqual([]);
  });
  it('chipSig: 안 보이면 빈 글, 공백은 하나로', () => {
    expect(chipSig('  가방   1/20칸 ', true)).toBe('가방 1/20칸');
    expect(chipSig('가방', false)).toBe('');
  });
});

describe('큰 연출 자리(Stage) — 배너는 하나씩', () => {
  type B = StageItem & { t: string };
  const b = (t: string, ms = 1000): B => ({ kind: 'banner', ms, t });
  it('한 번에 하나, 내린 뒤 숨 고르기(0.6초) 다음에 다음 것', () => {
    const s = new Stage<B>();
    s.push(b('1')); s.push(b('2')); s.push(b('3'));
    expect(s.update(0)?.show?.t).toBe('1');
    expect(s.update(500)).toBeNull();
    expect(s.update(1000)?.hide?.t).toBe('1');
    expect(s.busy(1300)).toBe(true);
    expect(s.update(1000 + STAGE_GAP - 1)).toBeNull();
    expect(s.update(1000 + STAGE_GAP)?.show?.t).toBe('2');
  });
  it('gate=false(놀기 전·컷신)면 줄만 선다 — 열리면 차례로', () => {
    const s = new Stage<B>();
    s.push(b('a')); s.push(b('b'));
    expect(s.update(0, false)).toBeNull();
    expect(s.update(5000, false)).toBeNull();
    expect(s.pending().length).toBe(2);
    expect(s.update(6000, true)?.show?.t).toBe('a');
  });
  it('지역 이름은 줄 앞에 서되 떠 있는 배너는 밀어내지 않는다(같은 지역 이름은 하나)', () => {
    const s = new Stage<B>();
    s.push(b('x'));
    s.update(0);
    s.push(b('y'));
    s.push({ kind: 'region', ms: 1000, t: 'R1' });
    s.push({ kind: 'region', ms: 1000, t: 'R2' });
    expect(s.cur?.t).toBe('x');
    expect(s.pending().map((x) => x.t)).toEqual(['R2', 'y']);
    s.update(1000);
    expect(s.update(1000 + STAGE_GAP)?.show?.t).toBe('R2');
  });
  it('claim(남의 가운데 카드) 동안 + 숨 고르기는 기다린다', () => {
    const s = new Stage<B>();
    s.claim(2000, 0);
    s.push(b('z'));
    expect(s.busy(100)).toBe(true);
    expect(s.update(2000 + STAGE_GAP - 1)).toBeNull();
    expect(s.update(2000 + STAGE_GAP)?.show?.t).toBe('z');
  });
  it('interrupt(잡았다!): 떠 있는 배너를 내리고, 막 떴던 거면 끝난 뒤 다시', () => {
    const s = new Stage<B>();
    s.push(b('just', 3000));
    s.update(0);
    expect(s.interrupt(1500, 400)?.t).toBe('just');
    expect(s.cur).toBeNull();
    expect(s.pending()[0].t).toBe('just');
    expect(s.update(1000)).toBeNull();
    expect(s.update(400 + 1500 + STAGE_GAP)?.show?.t).toBe('just');
    // 오래 떠 있던 건 버린다
    const t = new Stage<B>();
    t.push(b('old', 5000)); t.update(0);
    t.interrupt(1000, 2500);
    expect(t.pending()).toHaveLength(0);
  });
  it('hold(__hudHold) 면 안 내린다 · 넘치면 오래 기다린 배너부터 버린다', () => {
    const s = new Stage<B>(600, 2);
    s.push(b('h', 100)); s.update(0);
    expect(s.update(5000, true, true)).toBeNull();
    s.push(b('1')); s.push(b('2')); s.push(b('3'));
    expect(s.pending().map((x) => x.t)).toEqual(['2', '3']);
    expect(s.dropped).toBe(1);
  });
});

describe('토스트 한 줄(ToastLine)', () => {
  it('새 토스트가 앞 것을 바꿔 친다 — 단 0.9초는 읽히게', () => {
    const t = new ToastLine(900);
    t.push({ text: 'A', ms: 2000 });
    expect(t.update(0)?.show?.text).toBe('A');
    t.push({ text: 'B', ms: 2000 });
    expect(t.update(500)).toBeNull();
    expect(t.update(900)?.show?.text).toBe('B');
    expect(t.update(2899)).toBeNull();
    expect(t.update(2900)?.hide?.text).toBe('B');
  });
  it('놀기 전엔 줄만(같은 글은 하나, 최대 4) — 열리면 차례로', () => {
    const t = new ToastLine(900, 4);
    for (const x of ['1', '2', '2', '3', '4', '5']) t.push({ text: x, ms: 1000 });
    expect(t.update(0, false)).toBeNull();
    expect(t.pending().map((x) => x.text)).toEqual(['2', '3', '4', '5']);
    expect(t.update(10, true)?.show?.text).toBe('2');
    expect(t.update(910, true)?.show?.text).toBe('3');
  });
});

describe('말랑 주머니 — 방울 고르기·순서', () => {
  const P = (kind: string, o: Partial<{ app: false | { order?: number }; when: boolean }> = {}) => ({ kind, title: kind, ...o });
  it('아는 창은 정해진 순서, 상황 창(상점·작업대·박물관·게시판·NPC…)은 빼고, 모르는 창은 뒤에', () => {
    const list = [P('shop'), P('settings'), P('map'), P('craft'), P('mystery'), P('bag'), P('dex'), P('museum'), P('board'), P('npc'), P('mail'), P('journal'), P('@photo'), P('controls'), P(POCKET_KIND)];
    expect(pocketApps(list).map((a) => a.kind)).toEqual(['dex', 'bag', 'map', 'mail', 'journal', '@photo', 'mystery', 'settings', 'controls']);
  });
  it('app:false 는 빼고, app:{order} 는 상황 창이라도 넣는다 · when:false 는 지금 숨김 · 같은 kind 는 하나', () => {
    const list = [P('dex', { app: false }), P('shop', { app: { order: 15 } }), P('letter', { when: false }), P('bag'), P('bag')];
    expect(pocketApps(list).map((a) => a.kind)).toEqual(['shop', 'bag']);
    expect(APP_ORDER.dex).toBeLessThan(APP_ORDER.settings);
  });
  it('뱃지 글: 0·null 은 없음, 99+, 글은 3자', () => {
    expect(badgeText(0)).toBe(''); expect(badgeText(null)).toBe(''); expect(badgeText(-2)).toBe('');
    expect(badgeText(3)).toBe('3'); expect(badgeText(150)).toBe('99+'); expect(badgeText('NEW!')).toBe('NEW');
  });
});

describe('말랑 주머니 — 고리 자리(플레이어 둘레)', () => {
  it('플레이어 화면 자리를 가운데로, 12시부터 시계 방향', () => {
    const L = ringLayout({ n: 4, px: 800, py: 520, W: 1600, H: 900, bubble: 86, arcH: 120 });
    expect(L.cx).toBe(800); expect(L.cy).toBe(520);
    expect(L.pts[0].x).toBeCloseTo(800); expect(L.pts[0].y).toBeCloseTo(520 - L.r);
    expect(L.pts[1].x).toBeCloseTo(800 + L.r); expect(L.pts[1].y).toBeCloseTo(520);
  });
  it('화면 끝에 있으면 고리 + 무지개 + 이름표가 들어오게 민다', () => {
    const W = 1600, H = 900, arcH = 150;
    const L = ringLayout({ n: 10, px: 30, py: 40, W, H, bubble: 86, arcH });
    for (const p of L.pts) { expect(p.x - 43).toBeGreaterThanOrEqual(0); expect(p.y - 43).toBeGreaterThanOrEqual(0); expect(p.x + 43).toBeLessThanOrEqual(W); }
    expect(L.top).toBeGreaterThanOrEqual(16 - 0.01);
    const R = ringLayout({ n: 10, px: 1590, py: 890, W, H, bubble: 86, arcH });
    expect(R.bottom).toBeLessThanOrEqual(H - 16 + 0.01);
    for (const p of R.pts) expect(p.x + 43).toBeLessThanOrEqual(W);
  });
  it('작은 화면이면 줄인다(scale) · 방울이 많으면 반지름이 커진다 · 플레이어가 화면 밖(NaN)이면 가운데', () => {
    const small = ringLayout({ n: 10, px: 400, py: 300, W: 640, H: 480, arcH: 100 });
    expect(small.scale).toBeLessThan(1);
    expect(small.top).toBeGreaterThanOrEqual(15.9);
    expect(small.bottom).toBeLessThanOrEqual(480 - 15.9);
    expect(ringLayout({ n: 14, px: 800, py: 500, W: 1920, H: 1080 }).r).toBeGreaterThan(ringLayout({ n: 6, px: 800, py: 500, W: 1920, H: 1080 }).r);
    const c = ringLayout({ n: 6, px: NaN, py: NaN, W: 1600, H: 900 });
    expect(c.cx).toBe(800);
  });
  it('상태 무지개: 폭에 맞춰 줄을 나누고 가장자리는 아래로·기울게, 폭 0 칩은 뺀다', () => {
    const a = arcRows([200, 200, 0, 200, 200, 200], 700, { gap: 10, rowH: 50, bend: 20, tilt: 6 });
    expect(a.rows).toBe(2);
    expect(a.items.map((x) => x.i)).toEqual([0, 1, 3, 4, 5]);
    const r0 = a.items.filter((x) => x.row === 0);
    expect(r0).toHaveLength(3);
    expect(r0[1].x).toBeCloseTo(0);
    expect(r0[0].y).toBeGreaterThan(r0[1].y); // 가장자리가 더 아래
    expect(r0[0].rot).toBeLessThan(0); expect(r0[2].rot).toBeGreaterThan(0);
    expect(a.height).toBe(2 * 50 + 20);
    expect(arcRows([], 500).height).toBe(0);
  });
  it('키 이동: 화살표 한 칸(돌아감) · 숫자는 바로 고르기 · Enter 고르기', () => {
    expect(pocketNav(-1, 5, 'ArrowRight')).toEqual({ focus: 0, pick: false });
    expect(pocketNav(4, 5, 'ArrowRight')).toEqual({ focus: 0, pick: false });
    expect(pocketNav(0, 5, 'ArrowLeft')).toEqual({ focus: 4, pick: false });
    expect(pocketNav(-1, 5, 'Digit3')).toEqual({ focus: 2, pick: true });
    expect(pocketNav(-1, 5, 'Digit9')).toBeNull();
    expect(pocketNav(-1, 12, 'Digit0')).toEqual({ focus: 9, pick: true });
    expect(pocketNav(2, 5, 'Enter')).toEqual({ focus: 2, pick: true });
    expect(pocketNav(-1, 5, 'Enter')).toEqual({ focus: 0, pick: false });
    expect(pocketNav(0, 5, 'KeyQ')).toBeNull();
    expect(pocketNav(0, 0, 'ArrowRight')).toBeNull();
  });
  it('Tab: 주머니면 닫기 · 파는 가게/박물관이면 그 자리 가방 · 다른 창·없음이면 주머니', () => {
    expect(pocketKeyAction({ kind: POCKET_KIND, arg: null })).toEqual({ do: 'close' });
    expect(pocketKeyAction({ kind: 'shop', arg: { shop: 'quack' } })).toEqual({ do: 'bag', arg: { from: 'shop', shop: 'quack' } });
    expect(pocketKeyAction({ kind: 'museum', arg: null })).toEqual({ do: 'bag', arg: { from: 'museum' } });
    expect(pocketKeyAction({ kind: 'shop', arg: { shop: 'shipyard' } })).toEqual({ do: 'pocket' });
    expect(pocketKeyAction({ kind: 'dex', arg: null })).toEqual({ do: 'pocket' });
    expect(pocketKeyAction(null)).toEqual({ do: 'pocket' });
    expect(HUD_KEYS.find((k) => k.code === 'Tab')?.action).toBe('pocket');
  });
});

describe('안내 말풍선(HintQueue) · 키 모자', () => {
  const H = (id: string, o: Partial<HintOpts> = {}): HintOpts => ({ id, text: `${id}!`, ...o });
  it('하나씩, priority 큰 것 먼저, 본 id 는 다시 안 받는다(저장 콜백)', () => {
    const saved: string[] = [];
    const q = new HintQueue(new Set(['old']), (id) => saved.push(id));
    expect(q.push(H('old'))).toBe(false);
    expect(q.push(H('a'))).toBe(true);
    expect(q.push(H('b', { priority: 5 }))).toBe(true);
    expect(q.update(0, true)?.show?.id).toBe('b');
    expect(q.update(10, true)).toBeNull();
    expect(saved).toEqual(['b']);
    expect(q.push(H('b'))).toBe(true); // 떠 있는 것과 같은 id → 내용만 바꿈
    expect(q.push(H('old', { again: true }))).toBe(true);
  });
  it('until 이 참이면 done, ttl 이 다 되면 timeout, 줄에서 이미 해낸 건 버린다', () => {
    let walked = false;
    const q = new HintQueue();
    q.push(H('walk', { until: () => walked }));
    q.push(H('run', { ttl: 1000 }));
    q.push(H('jump', { until: () => true }));
    expect(q.update(0, true)?.show?.id).toBe('walk');
    walked = true;
    expect(q.update(100, true)).toEqual({ hide: expect.objectContaining({ id: 'walk' }), why: 'done' });
    expect(q.update(200, true)?.show?.id).toBe('run');
    expect(q.update(1199, true)).toBeNull();
    expect(q.update(1200, true)?.why).toBe('timeout');
    expect(q.update(1300, true)).toBeNull(); // jump 은 이미 해냄
    expect(q.pending()).toHaveLength(0);
  });
  it('gate=false(창·컷신·놀기 전)면 잠깐 숨고 시간도 멈춘다', () => {
    const q = new HintQueue();
    q.push(H('x', { ttl: 1000 }));
    expect(q.update(0, false)).toBeNull(); // 놀기 전엔 안 띄움
    q.update(0, true);
    q.update(600, true);
    expect(q.update(700, false)?.why).toBe('suspend');
    expect(q.update(5000, false)).toBeNull();
    expect(q.update(5100, true)?.show?.id).toBe('x');
    expect(q.update(5450, true)).toBeNull();
    expect(q.update(5500, true)?.why).toBe('timeout');
    q.push(H('y'));
    expect(q.remove('y')).toBe(true);
  });
  it('hintParts: 글 속 키 글자를 키 모자로, WASD 는 네 개로, [E] 표기, 글에 없는 키는 앞에', () => {
    const k = (p: Array<{ t: string; v: string }>) => p.map((x) => (x.t === 'key' ? `[${x.v}]` : x.v)).join('');
    expect(k(hintParts('E 로 말을 걸어요', ['KeyE']))).toBe('[E] 로 말을 걸어요');
    expect(k(hintParts('WASD 로 걸어 봐요', ['W', 'A', 'S', 'D']))).toBe('[W][A][S][D] 로 걸어 봐요');
    expect(k(hintParts('Shift 를 누르면 달려요', ['ShiftLeft']))).toBe('[Shift] 를 누르면 달려요');
    expect(k(hintParts('[Space] 로 폴짝!'))).toBe('[Space] 로 폴짝!');
    expect(k(hintParts('잠수해 봐요', ['KeyC']))).toBe('[C] 잠수해 봐요');
    // 낱말 안의 글자는 키가 아니다
    expect(k(hintParts('Shift 달리기', ['KeyS', 'ShiftLeft']))).toBe('[S] [Shift] 달리기');
  });
});

describe('놀기 시작 · 컷신 · 조작 안내 · 콤보', () => {
  it('game.started 는 false 일 때만 아직(없으면 시작한 셈)', () => {
    expect(startedOf(false)).toBe(false);
    expect(startedOf(true)).toBe(true);
    expect(startedOf(undefined)).toBe(true);
  });
  it('컷신 잠금 주인(story 등)만 컷신', () => {
    expect(isCinematic(['story'])).toBe(true);
    expect(isCinematic(['hud', 'fish'])).toBe(false);
    expect(isCinematic(null)).toBe(false);
  });
  it('조작 안내: 움직임 키 + 이름 있는 단축키(같은 키 하나, 움직임 키와 겹치면 뺌) + Tab·Esc', () => {
    const g = controlRows([
      { code: 'KeyB', label: '도감', hint: true }, { code: 'KeyB', label: '도감2', hint: true }, { code: 'KeyN', label: '소리', hint: true },
      { code: 'KeyF', label: '탈것 부르기', hint: true }, { code: 'KeyY', label: '같이 놀기', hint: false }, { code: 'Tab', label: '말랑 주머니', hint: true },
    ]);
    expect(g[0].rows.some((r) => r.caps.join('') === 'WASD')).toBe(true);
    const keys = g[1].rows.map((r) => `${r.caps.join('+')} ${r.label}`);
    expect(keys).toEqual(['Tab 말랑 주머니 열기·닫기', 'B 도감', 'N 소리', 'G 그래픽 품질', 'Esc 창 닫기']);
  });
  it('콤보: 5 이상 + 막 늘었을 때만', () => {
    expect(comboShown(6, 0, 1000)).toBe(true);
    expect(comboShown(6, 0, 10000)).toBe(false);
    expect(comboShown(3, 0, 10)).toBe(false);
  });
  it('게이지는 다 차거나 끝나면 1.5초 뒤 스르르(hudfx linger)', () => { expect(GAUGE_LINGER).toBe(1.5); });
});

describe('큐 allowShow(카드는 큰 배너가 끝날 때까지 기다린다)', () => {
  it('TimedQueue: allowShow=false 면 내리기만', () => {
    const q = new TimedQueue<{ t: string; ms?: number }>(1000);
    q.push({ t: 'a' }); q.push({ t: 'b' });
    expect(q.update(0, false, false)).toBeNull();
    expect(q.update(0)?.show?.t).toBe('a');
    expect(q.update(1000, false, false)?.hide?.t).toBe('a');
    expect(q.update(1100, false, true)?.show?.t).toBe('b');
  });
  it('hudfx Sequencer 도 같은 규칙', () => {
    const s = new Sequencer<{ ms: number; t: string }>();
    s.push({ ms: 500, t: 'x' });
    expect(s.update(0, false, false)).toBeNull();
    expect(s.update(0, false, true)?.show?.t).toBe('x');
  });
});

describe('레지스트리 peek / hint / 큰 연출 자리', () => {
  const base = (): HudRenderer => ({ openPanel() {}, closePanel() {}, showBanner() {}, showCard() {}, setGauge() {}, refreshChips() {}, toast() {}, showRegion() {} });
  it('붙기 전엔 hint·peek 를 쌓아 두고 attach 때 넘긴다(같은 hint id 는 마지막 것)', () => {
    const hud = new HudRegistryStore();
    const got: string[] = [];
    expect(hud.hint({ id: 'a', text: '1' })).toBe(true);
    hud.hint({ id: 'a', text: '2' });
    hud.hint({ id: 'b', text: '3' });
    hud.hideHint('b');
    hud.peek('hud:bag', 2000);
    expect(hud.stageBusy()).toBe(true);
    hud.attach({ ...base(), showHint: (h) => { got.push(`${h.id}:${h.text}`); return true; }, peekChip: (id, ms) => { got.push(`peek:${id}:${ms}`); } });
    expect(got).toEqual(['a:2', 'peek:hud:bag:2000']);
    expect(hud.pendingHints()).toHaveLength(0);
  });
  it('붙은 뒤엔 렌더러로 바로(없는 기능은 조용히)', () => {
    const hud = new HudRegistryStore();
    hud.attach(base());
    expect(hud.hint({ id: 'x', text: 'y' })).toBe(false);
    expect(hud.stageBusy()).toBe(false);
    hud.peek('a');
    let claimed = 0;
    const h2 = new HudRegistryStore();
    h2.attach({ ...base(), stageBusy: () => true, stageClaim: (ms) => { claimed = ms; } });
    expect(h2.stageBusy()).toBe(true);
    h2.stageClaim(1234);
    expect(claimed).toBe(1234);
  });
});
