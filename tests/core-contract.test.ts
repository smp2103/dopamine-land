// 계약 v2 코어(api·events·registry·interact·art) — 큐/attach 순서·패널 중복·상호작용 고르기·단축키·시간대·변이 키·색 규칙.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  todOf, isNoon, isMidnight, splitVariant, variantKey, HOUR_SEC, DAY_SEC, START_HOUR, weekdayOf, seasonOf,
  moonPhaseOf, isFullMoon, isEclipse, holdLen,
  type HudRenderer, type PanelDef, type HotkeyDef,
} from '../src/core/api';
import { WEEKDAY_EVENTS, SECRET_IDS, HARVEST_KINDS, weekdayEventOf, onEvent, isEvent } from '../src/core/events';
import { HudRegistryStore, dispatchHotkeys, makeDexFacade } from '../src/core/registry';
import { selectInteractions, promptText } from '../src/core/interact';
import {
  PALETTE, PARTS, UI_TEXT, UI_BG, pastelize, parseHex, nearestPalette, breatheScale, breathe,
  addEyes, addBlush, blobShadow, crownMesh, eyeMaterial, blushMaterial, isPart,
} from '../src/core/art';
import { mulberry32 } from '../src/core/rng';

/** 부른 순서를 적는 가짜 렌더러 */
function fakeRenderer(log: string[]): HudRenderer {
  return {
    openPanel: (d) => log.push(`open:${d.kind}`),
    closePanel: () => log.push('close'),
    showBanner: (b) => log.push(`banner:${b.text}`),
    showCard: (c) => log.push(`card:${c.title}`),
    setGauge: (id, g) => log.push(`gauge:${id}:${g.value}`),
    refreshChips: () => log.push('chips'),
    toast: (t) => log.push(`toast:${t}`),
    showRegion: (n) => log.push(`region:${n}`),
    drawLayersHint: () => log.push('layersHint'),
    addPanel: (d) => log.push(`panel:${d.kind}`),
    addChip: (c) => log.push(`chip:${c.id}`),
    addHotkey: (h) => log.push(`hotkey:${h.code}`),
    addLayer: (l) => log.push(`layer:${l.id}`),
  };
}
const panel = (kind: string, extra: Partial<PanelDef> = {}): PanelDef => ({ kind, title: kind, color: '#ffcf4a', render: () => {}, ...extra });

describe('HudRegistryStore', () => {
  it('attach 전엔 큐에 쌓고, attach 때 정해진 순서로 비운다', () => {
    const hud = new HudRegistryStore();
    hud.banner({ text: 'b1' });
    hud.registerPanel(panel('dex'));
    hud.card({ title: 'c1', body: '' });
    hud.registerChip({ id: 'coins', order: 2, render: () => {} });
    hud.registerChip({ id: 'stars', order: 1, render: () => {} });
    hud.registerHotkey({ code: 'KeyB', label: '도감', run: () => {} });
    hud.registerMapLayer({ id: 'chests', draw: () => {} });
    hud.gauge('oxy', { label: '산소', value: 0.5, color: '#8fd3f4', show: true });
    hud.gauge('oxy', { label: '산소', value: 0.4, color: '#8fd3f4', show: true });
    hud.registerPanel(panel('bag'));
    hud.open('bag');
    hud.open('dex', 'fish'); // 마지막 요청만 남는다
    expect(hud.attached).toBe(false);
    expect(hud.isOpen()).toBe(false);
    expect(hud.pendingOpen()).toEqual({ kind: 'dex', tab: 'fish', arg: undefined });

    const log: string[] = [];
    hud.attach(fakeRenderer(log));
    expect(log).toEqual([
      'panel:dex', 'panel:bag',
      'chip:stars', 'chip:coins', 'chips',
      'hotkey:KeyB',
      'layer:chests', 'layersHint',
      'open:dex',
      'banner:b1',
      'card:c1',
      'gauge:oxy:0.4',
    ]);
    expect(hud.current()).toMatchObject({ kind: 'dex', tab: 'fish' });
    // 붙은 뒤엔 바로 그린다
    log.length = 0;
    hud.toast('안녕');
    hud.close();
    expect(log).toEqual(['toast:안녕', 'close']);
    expect(hud.isOpen()).toBe(false);
  });

  it('attach 전 close() 는 쌓인 열기를 지운다', () => {
    const hud = new HudRegistryStore();
    hud.registerPanel(panel('dex'));
    hud.open('dex');
    hud.close();
    const log: string[] = [];
    hud.attach(fakeRenderer(log));
    expect(log).not.toContain('open:dex');
  });

  it('같은 kind 패널은 replace 없으면 무시(warn), replace 면 바꿔 끼운다', () => {
    const hud = new HudRegistryStore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = panel('shop', { title: 'A' }), b = panel('shop', { title: 'B' }), c = panel('shop', { title: 'C' });
    expect(hud.registerPanel(a)).toBe(true);
    expect(hud.registerPanel(b)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(hud.panel('shop')?.title).toBe('A');
    expect(hud.registerPanel(c, { replace: true })).toBe(true);
    expect(hud.panel('shop')?.title).toBe('C');
    warn.mockRestore();
  });

  it('onOpen/onClose · 탭 기본값 · ctx.setTab · onChange', () => {
    const hud = new HudRegistryStore();
    const seen: string[] = [];
    let lastCtxTab: string | undefined;
    hud.registerPanel(panel('dex', {
      tabs: () => [{ id: 'fish', label: '물고기' }, { id: 'bug', label: '곤충' }],
      onOpen: (arg) => seen.push(`onOpen:${String(arg)}`),
      onClose: () => seen.push('onClose'),
    }));
    hud.onChange((k, p) => seen.push(`change:${k}<-${p}`));
    let ctxRef: any;
    hud.attach({ ...fakeRenderer([]), openPanel: (_d, ctx) => { ctxRef = ctx; lastCtxTab = ctx.tab; } });
    hud.open('dex', undefined, 7);
    expect(lastCtxTab).toBe('fish');
    ctxRef.setTab('bug');
    expect(lastCtxTab).toBe('bug');
    expect(hud.current()?.tab).toBe('bug');
    hud.close();
    expect(seen).toEqual(['onOpen:7', 'change:dex<-null', 'onClose', 'change:null<-dex']);
  });

  it('makeDexFacade 는 hud 로 넘긴다', () => {
    const hud = new HudRegistryStore();
    const dex = makeDexFacade(hud);
    dex.register(panel('dex'));
    dex.open();
    expect(hud.pendingOpen()?.kind).toBe('dex');
    const log: string[] = [];
    hud.attach(fakeRenderer(log));
    expect(log).toContain('open:dex');
    dex.toast('야호');
    dex.showRegion('말랑섬', '집', '#86d16f');
    dex.close();
    expect(log.slice(-3)).toEqual(['toast:야호', 'region:말랑섬', 'close']);
  });

  it('등록 해제 함수', () => {
    const hud = new HudRegistryStore();
    const off = hud.registerChip({ id: 'a', order: 0, render: () => {} });
    const offK = hud.registerHotkey({ code: 'KeyM', label: '지도', run: () => {} });
    off(); offK();
    expect(hud.chips()).toEqual([]);
    expect(hud.hotkeys()).toEqual([]);
  });
});

describe('늦게 등록된 패널·회색 파스텔', () => {
  it('attach 뒤 등록된 패널도 쌓인 열기 요청을 받는다', () => {
    const hud = new HudRegistryStore();
    hud.open('late', 't');
    hud.attach(fakeRenderer([]));
    expect(hud.isOpen()).toBe(false);
    hud.registerPanel(panel('late'));
    expect(hud.current()?.kind).toBe('late');
    expect(hud.pendingOpen()).toBe(null);
  });
  it('중간 회색은 갈색이 아니라 무채색 이름표로', () => {
    const neutral = [PALETTE.ink, PALETTE.slate, PALETTE.grey, PALETTE.silver, PALETTE.white, PALETTE.cream] as string[];
    for (const c of ['#777777', '#555555', '#999999', '#cccccc']) expect(neutral).toContain(pastelize(c));
  });
});

describe('dispatchHotkeys', () => {
  const hk = (code: string, o: Partial<HotkeyDef> = {}): HotkeyDef => ({ code, label: code, run: () => {}, ...o });
  const free = { typing: false, locked: false, openKind: null };

  it('눌린 키만, 차지된 키(consumed)는 건너뛴다', () => {
    const list = [hk('KeyB'), hk('KeyF'), hk('KeyM')];
    const out = dispatchHotkeys(list, ['KeyF', 'KeyB'], new Set(['KeyF']), free);
    expect(out.map((h) => h.code)).toEqual(['KeyB']);
  });

  it('글 입력 중엔 아무것도 안 돈다', () => {
    expect(dispatchHotkeys([hk('KeyB')], ['KeyB'], null, { ...free, typing: true })).toEqual([]);
  });

  it('잠금 중엔 열린 패널 자기 키와 Esc(*) 만', () => {
    const list = [hk('KeyB', { panel: 'dex' }), hk('Tab', { panel: 'bag' }), hk('Escape', { panel: '*' }), hk('KeyV')];
    const pressed = ['KeyB', 'Tab', 'Escape', 'KeyV'];
    const out = dispatchHotkeys(list, pressed, null, { typing: false, locked: true, openKind: 'dex' });
    expect(out.map((h) => h.code)).toEqual(['KeyB', 'Escape']);
    // 아무것도 안 열린 잠금(대화 등)이면 다 막힌다
    expect(dispatchHotkeys(list, pressed, null, { typing: false, locked: true, openKind: null })).toEqual([]);
  });

  it('when() 이 false 거나 던지면 건너뛴다', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const list = [hk('KeyC', { when: () => false }), hk('KeyC', { when: () => { throw new Error('x'); } }), hk('KeyC')];
    expect(dispatchHotkeys(list, new Set(['KeyC']), undefined, free)).toHaveLength(1);
    err.mockRestore();
  });
});

describe('selectInteractions', () => {
  it('E 는 가장 가까운 KeyE, alt 는 우선순위 → 거리', () => {
    const r = selectInteractions([
      { id: 'talk', dist: 2 },
      { id: 'fish', key: 'KeyE', dist: 1 },
      { id: 'chop', key: 'KeyF', dist: 0.5, priority: 10 },
      { id: 'mount', key: 'KeyF', dist: 3, priority: 30 },
      { id: 'sling', key: 'KeyF', dist: 1, priority: 20 },
      { id: 'other', key: 'KeyF', dist: 0.1 },
    ], false);
    expect(r.current?.id).toBe('fish');
    expect(r.alt?.id).toBe('mount');
    expect([...r.consumed].sort()).toEqual(['KeyE', 'KeyF']);
  });

  it('같은 우선순위면 가까운 쪽, 동점이면 먼저 온 쪽', () => {
    const r = selectInteractions([
      { id: 'a', key: 'KeyF', dist: 2 }, { id: 'b', key: 'KeyF', dist: 1 }, { id: 'c', key: 'KeyF', dist: 1 },
    ], false);
    expect(r.alt?.id).toBe('b');
  });

  it('탑승 중엔 whileMounted 만 센다', () => {
    const cands = [
      { id: 'shop', dist: 0.5 },
      { id: 'dock', dist: 3, whileMounted: true },
      { id: 'chop', key: 'KeyF', dist: 0.5, priority: 10 },
    ];
    const r = selectInteractions(cands, true);
    expect(r.current?.id).toBe('dock');
    expect(r.alt).toBeNull();
    expect([...r.consumed]).toEqual(['KeyE']);
    const none = selectInteractions(cands.filter((c) => !c.whileMounted), true);
    expect(none.current).toBeNull();
    expect(none.consumed.size).toBe(0);
  });

  it('거리가 이상한 후보는 버린다 · 안내 글', () => {
    const r = selectInteractions([{ id: 'x', dist: NaN }, { id: 'y', dist: Infinity }], false);
    expect(r.current).toBeNull();
    expect(promptText({ key: 'KeyF', label: '타기' })).toBe('F 타기');
    expect(promptText({ label: '낚시하기' })).toBe('E 낚시하기');
  });
});

describe('시간·변이 도우미', () => {
  it('상수', () => {
    expect(HOUR_SEC).toBe(75);
    expect(DAY_SEC).toBe(1800);
    expect(DAY_SEC / HOUR_SEC).toBe(24);
    expect(START_HOUR).toBe(9);
  });

  it('todOf 경계: 시작 포함, 끝 미포함', () => {
    expect(todOf(4.99)).toBe('night');
    expect(todOf(5)).toBe('morning');
    expect(todOf(8.99)).toBe('morning');
    expect(todOf(9)).toBe('day');
    expect(todOf(16.99)).toBe('day');
    expect(todOf(17)).toBe('sunset');
    expect(todOf(20.99)).toBe('sunset');
    expect(todOf(21)).toBe('night');
    expect(todOf(0)).toBe('night');
    expect(todOf(24)).toBe('night');
    expect(todOf(-1)).toBe('night');
    expect(todOf(33)).toBe('day');
  });

  it('정오·자정', () => {
    expect([10.99, 11, 12.5, 13].map(isNoon)).toEqual([false, true, true, false]);
    expect([23.99, 0, 1.99, 2].map(isMidnight)).toEqual([false, true, true, false]);
  });

  it('달력', () => {
    expect(weekdayOf(0)).toBe(0);
    expect(weekdayOf(13)).toBe(6);
    expect(seasonOf(0)).toBe('spring');
    expect(seasonOf(7)).toBe('summer');
    expect(seasonOf(27)).toBe('winter');
    expect(seasonOf(28)).toBe('spring');
    expect(isFullMoon(moonPhaseOf(DAY_SEC * 4))).toBe(true);
    expect(isEclipse(moonPhaseOf(0))).toBe(true);
    expect(holdLen({ shadow: 'XL' })).toBe(1.1);
    expect(holdLen({ len: 160 })).toBe(1.1);
    expect(holdLen({ shadow: 'M', len: 200 })).toBe(0.55);
  });

  it('splitVariant / variantKey', () => {
    expect(splitVariant('f_carp@crown')).toEqual({ id: 'f_carp', variant: 'crown' });
    expect(splitVariant('f_carp@shiny')).toEqual({ id: 'f_carp', variant: 'shiny' });
    expect(splitVariant('f_carp')).toEqual({ id: 'f_carp' });
    expect(splitVariant('weird@thing')).toEqual({ id: 'weird@thing' });
    expect(splitVariant('@tiny')).toEqual({ id: '@tiny' });
    expect(variantKey('f_carp', 'tiny')).toBe('f_carp@tiny');
    expect(variantKey('f_carp')).toBe('f_carp');
    for (const v of ['shiny', 'crown', 'tiny'] as const) expect(splitVariant(variantKey('b_x', v))).toEqual({ id: 'b_x', variant: v });
  });
});

describe('이벤트 표', () => {
  it('정해진 id', () => {
    expect(WEEKDAY_EVENTS).toEqual(['petalrain', 'migration', 'sandtemple', 'firefly', 'whaleroad', 'pirate', 'meteor']);
    expect(weekdayEventOf(6)).toBe('meteor');
    expect(weekdayEventOf(7)).toBe('petalrain');
    expect(SECRET_IDS).toHaveLength(21);
    expect(new Set(SECRET_IDS).size).toBe(21);
    expect(HARVEST_KINDS).toContain('moonflower');
    expect(HARVEST_KINDS).toHaveLength(26);
  });

  it('onEvent 는 한 종류만 듣고 해제된다', () => {
    const fns = new Set<(e: any) => void>();
    const src = { on: (f: any) => { fns.add(f); return () => fns.delete(f); }, emit: (e: any) => fns.forEach((f) => f(e)) };
    const got: number[] = [];
    const off = onEvent(src, 'coins', (e) => got.push(e.delta));
    src.emit({ type: 'stars', delta: 9, why: '' });
    src.emit({ type: 'coins', delta: 5, why: 'sell' });
    off();
    src.emit({ type: 'coins', delta: 6, why: 'sell' });
    expect(got).toEqual([5]);
    expect(isEvent({ type: 'catch' }, 'catch')).toBe(true);
  });
});

describe('art', () => {
  const isPureGrey = (hex: string) => { const [r, g, b] = parseHex(hex)!; return r === g && g === b; };

  it('pastelize 는 순수 검정·회색을 돌려주지 않는다', () => {
    expect(pastelize('#000000')).toBe(PALETTE.ink);
    expect(pastelize(0x000000)).toBe(PALETTE.ink);
    expect(pastelize('#ffffff')).toBe(PALETTE.white);
    expect(pastelize('#808080')).not.toBe('#808080');
    for (let v = 0; v <= 255; v++) {
      const hex = '#' + v.toString(16).padStart(2, '0').repeat(3);
      expect(isPureGrey(pastelize(hex))).toBe(false);
      expect(isPureGrey(pastelize(hex, { strong: true }))).toBe(false);
    }
    const rng = mulberry32(42);
    for (let i = 0; i < 2000; i++) {
      const c = Math.floor(rng() * 0x1000000);
      const out = pastelize(c), strong = pastelize(c, { strong: true });
      expect(out).toMatch(/^#[0-9a-f]{6}$/);
      expect(isPureGrey(out)).toBe(false);
      expect(isPureGrey(strong)).toBe(false);
    }
  });

  it('pastelize 는 맑은 색은 그대로 두고, 이름도 받는다', () => {
    expect(pastelize('#ff6b6b')).toBe('#ff6b6b');
    expect(pastelize('pink')).toBe(PALETTE.pink);
    expect(pastelize('분홍')).toBe(PALETTE.pink);
    expect(pastelize('엉망')).toBe(PALETTE.white);
    expect(nearestPalette('#ffd0df')).toBe('lightPink');
    for (const hex of Object.values(PALETTE)) expect(isPureGrey(hex)).toBe(false);
  });

  it('파츠 어휘·UI 색', () => {
    expect(PARTS).toContain('lantern-heart');
    expect(new Set(PARTS).size).toBe(PARTS.length);
    expect(isPart('crown')).toBe(true);
    expect(isPart('tail')).toBe(false);
    expect(UI_TEXT).toBe('#4a3b2a');
    expect(UI_BG).toBe('#fff8e8');
  });

  it('breathe 는 1.00↔1.05, 2초 주기', () => {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < 4; t += 0.01) { const s = breatheScale(t, 0.3); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    expect(lo).toBeGreaterThanOrEqual(1);
    expect(hi).toBeLessThanOrEqual(1.05 + 1e-9);
    expect(hi - lo).toBeGreaterThan(0.049);
    expect(breatheScale(0.7, 0.2)).toBeCloseTo(breatheScale(2.7, 0.2), 9);
    const o = new THREE.Object3D(); o.scale.set(2, 2, 2);
    breathe(o, 1, 0);
    expect(o.scale.y).toBeCloseTo(2 * 1.05, 6);
    breathe(o, 0, 0);
    expect(o.scale.y).toBeCloseTo(2, 6);
  });

  it('얼굴·그림자·왕관은 공용 지오메트리/재질을 쓴다', () => {
    const head = new THREE.Group();
    const eyes = addEyes(head, { size: 0.1, head: { r: 0.2 } });
    expect(head.children).toHaveLength(4); // 눈 2 + 볼 2
    expect(eyes.left.geometry).toBe(eyes.right.geometry);
    expect(eyes.left.geometry.userData.shared).toBe(true);
    expect(eyes.left.position.x).toBeLessThan(0);
    expect(eyes.right.position.x).toBeGreaterThan(0);
    expect(eyes.left.position.distanceTo(eyes.right.position)).toBeCloseTo(0.14, 2);
    expect(eyes.left.position.length()).toBeGreaterThan(0.2);
    const b = eyes.blush[0];
    expect((b.material as THREE.MeshBasicMaterial).opacity).toBe(0.55);
    expect(b.scale.x).toBeCloseTo(0.08, 6);
    expect(b.position.y).toBeLessThan(eyes.left.position.y);
    eyes.setHappy(true);
    expect(b.material).toBe(blushMaterial(true));
    expect(eyes.left.material).toBe(eyeMaterial('L', true));
    eyes.setHappy(false);
    expect(eyes.left.material).toBe(eyeMaterial('L'));

    const solo = new THREE.Group();
    expect(addBlush(solo, 0.05)).toHaveLength(2);

    const s1 = blobShadow(0.4), s2 = blobShadow(1);
    expect(s1.geometry).toBe(s2.geometry);
    expect(s1.geometry.userData.shared).toBe(true);
    expect((s1.material as THREE.Material).userData.shared).toBe(true);
    expect(s1.scale.x).toBe(0.4);

    const c = crownMesh(0.2);
    expect(c.userData.part).toBe('crown');
    c.traverse((m) => { if ((m as THREE.Mesh).isMesh) expect((m as THREE.Mesh).geometry.userData.shared).toBe(true); });
  });
});
