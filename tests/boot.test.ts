// 부팅 화면의 순수 부분 — 진행률(앞으로만), 타이틀 건너뛰기 규칙, 팁 순서(결정성), 카메라 길
import { describe, it, expect } from 'vitest';
import {
  BOOT_STAGES, BootProgress, pendingFraction, skipTitle, BOOT_TIPS, tipOrder, tipAt, TIP_PERIOD_MS, GROW_AT, growLevel,
  titlePrompt, isStartKey, easeInOut, fallEase, lerpAngle, titleOrbit, toCyl, fromCyl, glidePose, starPath,
} from '../src/core/boot';
import { WEEKDAY_EVENTS, type GameStartEvent, type EventOf } from '../src/core/events';

describe('boot — 단계와 진행률', () => {
  it('단계 구간은 0 에서 1 까지 빈틈없이 이어진다', () => {
    expect(BOOT_STAGES[0].from).toBe(0);
    for (let i = 1; i < BOOT_STAGES.length - 1; i++) expect(BOOT_STAGES[i].from).toBeCloseTo(BOOT_STAGES[i - 1].to, 6);
    expect(BOOT_STAGES[BOOT_STAGES.length - 1].to).toBe(1);
    for (const s of BOOT_STAGES) expect(s.label.length).toBeGreaterThan(0);
  });

  it('목표는 절대 뒤로 가지 않는다(앞 단계 호출·작은 비율은 무시)', () => {
    const p = new BootProgress();
    const seq: Array<[Parameters<BootProgress['set']>[0], number]> = [
      ['engine', 0.5], ['engine', 0.2], ['physics', 1], ['engine', 1], ['island', 0.5], ['friends', 0.1],
      ['friends', 0.05], ['friends', 0.9], ['decor', 0], ['decor', 0.6], ['island', 1], ['decor', 0.3], ['done', 1],
    ];
    let prev = -1;
    for (const [id, f] of seq) {
      const t = p.set(id, f);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(p.target).toBe(1);
    expect(p.stage).toBe('done');
  });

  it('앞 단계로 돌아가는 호출은 단계 이름도 바꾸지 않는다', () => {
    const p = new BootProgress();
    p.set('friends', 0.5, '친구들 부르는 중 3/10');
    p.set('engine', 1);
    expect(p.stage).toBe('friends');
    expect(p.label).toBe('친구들 부르는 중 3/10');
  });

  it('단계 안 비율은 그 구간으로 옮겨진다(잘못된 값은 0..1 로)', () => {
    const p = new BootProgress();
    const f = BOOT_STAGES.find((s) => s.id === 'friends')!;
    expect(p.set('friends', 0.5)).toBeCloseTo(f.from + (f.to - f.from) * 0.5, 6);
    expect(p.set('friends', 7)).toBeCloseTo(f.to, 6);
    const q = new BootProgress();
    expect(q.set('engine', Number.NaN)).toBe(0);
  });

  it('화면 값은 부드럽게 따라가며 줄지 않고 목표를 넘지 않는다, 끝엔 닿는다', () => {
    const p = new BootProgress();
    p.set('friends', 0.5);
    let prev = 0;
    for (let i = 0; i < 30; i++) {
      const v = p.step(1 / 60);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(p.target);
      prev = v;
    }
    expect(p.shown).toBeGreaterThan(0.1);
    expect(p.shown).toBeLessThan(p.target);
    p.set('done', 1);
    for (let i = 0; i < 120; i++) p.step(1 / 60);
    expect(p.shown).toBe(1);
    // 이상한 dt 에도 멀쩡
    expect(p.step(-5)).toBe(1);
    expect(p.step(Number.NaN)).toBe(1);
  });

  it('단계 시작 시각을 처음 한 번만 적는다', () => {
    const p = new BootProgress();
    p.set('engine', 0, undefined, 1);
    p.set('physics', 0, undefined, 50);
    p.set('physics', 1, undefined, 90);
    expect(p.times).toEqual({ engine: 1, physics: 50 });
  });

  it('청크 남은 수 → 비율', () => {
    expect(pendingFraction(0, 0)).toBe(1);
    expect(pendingFraction(50, 100)).toBe(0.5);
    expect(pendingFraction(0, 100)).toBe(1);
    expect(pendingFraction(150, 100)).toBe(0);
  });

  it('로딩 섬 조각은 진행률을 따라 차례로 핀다', () => {
    expect(growLevel(0)).toBe(0);
    expect(growLevel(1)).toBe(GROW_AT.length);
    let prev = 0;
    for (let v = 0; v <= 1; v += 0.01) { const g = growLevel(v); expect(g).toBeGreaterThanOrEqual(prev); prev = g; }
    for (let i = 1; i < GROW_AT.length; i++) expect(GROW_AT[i]).toBeGreaterThan(GROW_AT[i - 1]);
  });
});

describe('boot — 타이틀 건너뛰기 규칙(계약)', () => {
  const run = (search: string, webdriver = false, gameOn = true) => skipTitle({ webdriver, params: new URLSearchParams(search), gameOn });

  it('사람이 그냥 열면 타이틀', () => {
    expect(run('')).toEqual({ skip: false, why: null });
    expect(run('fresh=1&quality=low&spawn=dino')).toEqual({ skip: false, why: null });
  });
  it('자동 실행·shot=1·intro=0·cam=… 은 건너뛴다', () => {
    expect(run('', true)).toEqual({ skip: true, why: 'webdriver' });
    expect(run('shot=1')).toEqual({ skip: true, why: 'shot' });
    expect(run('intro=0')).toEqual({ skip: true, why: 'intro' });
    expect(run('cam=river')).toEqual({ skip: true, why: 'cam' });
    expect(run('game=0', false, false)).toEqual({ skip: true, why: 'nogame' });
  });
  it('intro=1 은 자동 실행에서도 타이틀을 보여 주지만 촬영·고정 카메라는 이긴다', () => {
    expect(run('intro=1', true)).toEqual({ skip: false, why: null });
    expect(run('intro=1&shot=1', true).skip).toBe(true);
    expect(run('intro=1&cam=ac').skip).toBe(true);
  });
  it('평범한 객체 파라미터도 받는다', () => {
    expect(skipTitle({ webdriver: false, params: { shot: '1' }, gameOn: true }).why).toBe('shot');
    expect(skipTitle({ webdriver: false, params: { shot: null }, gameOn: true }).skip).toBe(false);
  });
});

describe('boot — 졸린 별의 팁', () => {
  it('팁은 10개 넘고 모두 다르다', () => {
    expect(BOOT_TIPS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(BOOT_TIPS).size).toBe(BOOT_TIPS.length);
    for (const t of BOOT_TIPS) expect(t.length).toBeLessThan(60);
  });
  it('같은 시드 = 같은 순서, 순서는 모든 팁을 한 번씩', () => {
    const a = tipOrder(7), b = tipOrder(7), c = tipOrder(8);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(BOOT_TIPS.map((_, i) => i));
    expect(c).not.toEqual(a);
  });
  it('약 3초마다 바뀌고 한 바퀴 돌면 처음으로', () => {
    const o = tipOrder(3);
    expect(TIP_PERIOD_MS).toBeGreaterThanOrEqual(2500);
    expect(TIP_PERIOD_MS).toBeLessThanOrEqual(3500);
    expect(tipAt(o, 0)).toBe(o[0]);
    expect(tipAt(o, TIP_PERIOD_MS - 1)).toBe(o[0]);
    expect(tipAt(o, TIP_PERIOD_MS)).toBe(o[1]);
    expect(tipAt(o, TIP_PERIOD_MS * o.length)).toBe(o[0]);
    expect(tipAt(o, -100)).toBe(o[0]);
    expect(tipAt([], 5000)).toBe(0);
  });
});

describe('boot — 타이틀 글·시작 키', () => {
  it('처음이면 톡 눌러 시작, 저장이 있으면 이어하기 · N일째', () => {
    expect(titlePrompt({ cont: false }).main).toContain('시작');
    const c = titlePrompt({ cont: true, day: 3, dex: 12 });
    expect(c.main).toBe('이어하기 · 3일째');
    expect(c.sub).toContain('도감 12칸');
    expect(titlePrompt({ cont: true, day: 0 }).main).toBe('이어하기 · 1일째');
  });
  it('보조키·기능키·개발 키는 시작으로 치지 않는다', () => {
    for (const k of ['KeyE', 'Space', 'Enter', 'KeyW', 'ArrowUp', 'Digit1']) expect(isStartKey(k)).toBe(true);
    for (const k of ['ShiftLeft', 'ControlRight', 'AltLeft', 'MetaLeft', 'F5', 'F12', 'Backquote', 'Tab', '']) expect(isStartKey(k)).toBe(false);
  });
});

describe('boot — 카메라 길', () => {
  it('부드러운 곡선은 0 → 1, 낙하는 끝에서 살짝 눌렸다 1 로', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(fallEase(1)).toBeCloseTo(1, 6);
    expect(Math.abs(fallEase(0))).toBeLessThan(1e-9);
    // 착지 직후엔 1 을 조금 넘는다(말랑 눌림), 그러나 많이는 아니다
    const over = Math.max(...Array.from({ length: 20 }, (_, i) => fallEase(0.82 + i * 0.009)));
    expect(over).toBeGreaterThan(1);
    expect(over).toBeLessThan(1.05);
  });
  it('각도는 짧은 쪽으로 돈다', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1);
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5, 6);
    expect(lerpAngle(0.2, 0.2 + Math.PI * 4, 1)).toBeCloseTo(0.2, 6);
  });
  it('타이틀 궤도는 중심 위 높은 곳에서 중심을 본다', () => {
    const c = { x: 10, y: 2, z: -5 };
    for (const t of [0, 5, 30, 120]) {
      const o = titleOrbit(c, t);
      expect(o.pos.y - c.y).toBeGreaterThan(25);
      const d = Math.hypot(o.pos.x - c.x, o.pos.z - c.z);
      expect(d).toBeGreaterThan(50);
      expect(d).toBeLessThan(80);
      expect(o.look.x).toBe(c.x);
    }
    expect(titleOrbit(c, 10).pos).toEqual(titleOrbit(c, 10).pos);
  });
  it('미끄러져 내려오기는 시작 자리에서 출발해 끝 자리에 닿는다', () => {
    const c = { x: 0, y: 1, z: 0 };
    const a = { x: 50, y: 36, z: 30 }, b = { x: 0, y: 3.5, z: 7 };
    const p0 = glidePose(toCyl(a, c), toCyl(b, c), c, 0);
    const p1 = glidePose(toCyl(a, c), toCyl(b, c), c, 1);
    expect(p0.x).toBeCloseTo(a.x, 4); expect(p0.y).toBeCloseTo(a.y, 4); expect(p0.z).toBeCloseTo(a.z, 4);
    expect(p1.x).toBeCloseTo(b.x, 4); expect(p1.y).toBeCloseTo(b.y, 4); expect(p1.z).toBeCloseTo(b.z, 4);
    // 원통 좌표 왕복
    const q = fromCyl(toCyl(a, c), c);
    expect(q.x).toBeCloseTo(a.x, 6); expect(q.z).toBeCloseTo(a.z, 6);
    // 가운데쯤엔 높이가 둘 사이
    const m = glidePose(toCyl(a, c), toCyl(b, c), c, 0.5);
    expect(m.y).toBeLessThan(a.y);
    expect(m.y).toBeGreaterThan(b.y);
  });
  it('별 길은 출발점에서 도착점으로', () => {
    const f = { x: 0, y: 30, z: 0 }, t = { x: 10, y: 2, z: 4 };
    expect(starPath(f, t, 0)).toEqual(f);
    const e = starPath(f, t, 1);
    expect(e.x).toBeCloseTo(t.x, 6); expect(e.y).toBeCloseTo(t.y, 6); expect(e.z).toBeCloseTo(t.z, 6);
  });
});

describe('boot — 계약 이벤트', () => {
  it("'game:start' 이벤트 모양", () => {
    const e: GameStartEvent = { type: 'game:start', skipped: true };
    const f: EventOf<'game:start'> = e;
    expect(f.skipped).toBe(true);
    expect(WEEKDAY_EVENTS.length).toBe(7); // events.ts 는 덧붙이기만 했다
  });
});
