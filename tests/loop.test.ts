// GDD 4.9 P0 10단계 소비 루프 — CI 관문(node). 가짜 게임(tests/kit) 위에 진짜 모듈 24개를 모듈 순서대로 올리고,
// 브라우저 스크립트(scripts/loop.mjs)와 같은 단계 정의(tests/loop/steps.mjs)를 window.__* 훅으로 몬다.
// 단계마다: 조건(이벤트·잔액) + 장부(coins·stars 이벤트 합 = 잔액 변화). 여기선 순수 로직(poolFor·canMount·canLaunch·표 값)으로 한 번 더 맞춘다.
// 그 밖에: ?cheat=1 단축 길(9~10), 계약 9장 디버그 훅, 모듈 순서(8장), 종 id 접두사 규칙.
import { describe, it, expect, beforeAll } from 'vitest';
import { bootLoop, steps, explain, LOOP_MODULES, type Booted, type StepReport } from './loop/boot';
import { poolFor } from '../src/modules/fishing/data';
import { canLaunch, canMount } from '../src/modules/economy/progression';
import { MATERIALS } from '../src/modules/economy/data';
import { PLACES } from '../src/core/world';
import type { EconApi } from '../src/core/api';

/** 계약 8장 모듈 순서 */
const ORDER: Record<string, number> = {
  audio: 1, worldterrain: 2, village: 4, flora: 6, vehicles: 6, economy: 9, hud: 12, ocean: 12, hudfx: 13, interiors: 14,
  characters: 20, treasure: 25, fishing: 30, insects: 30, dinos: 30, secrets: 30, hidden: 31, garden: 32, seaworld: 35, space: 40,
  planets: 42, flight: 43, calendar: 45, meta: 46, islanddev: 47, story: 48, atmosphere: 50, netplay: 60, netplayplay: 61, photo: 60,
};

/** 계약 9장 훅(가짜 게임에서 뜨는 것) → 꼭 있어야 하는 함수 */
const HOOKS: Record<string, string[]> = {
  __dl: ['give', 'coins', 'stars', 'teleport', 'world', 'hour', 'advance', 'list', 'interact', 'unlockAll', 'save'],
  __econ: ['give', 'unlock', 'state'],
  __geo: ['zoneAt', 'disc'],
  __flora: ['chopNearest', 'hitNearest', 'rocks'],
  __treasure: ['spawn', 'digs'],
  __village: ['stage', 'light'],
  __vehicles: ['mount', 'summon'],
  __space: ['goPad', 'pond'],
  __fishingDebug: ['catchNow', 'goto'],
  __insects: ['spawnAt', 'catchNear'],
  __dinos: ['feed', 'tino'],
  __ocean: ['dive', 'oxygen'],
  __chars: ['talk'],
};
/** P1 모듈 훅 — 이름만(모양은 각 모듈 머리말) */
const P1_HOOKS = ['__meta', '__calendar', '__interiors', '__seaworld', '__planets', '__flight', '__story', '__secrets', '__hidden', '__garden', '__islanddev'];

describe('GDD 4.9 P0 루프 — ?p0=1 새 저장으로 한 판', () => {
  let b: Booted;
  const done: StepReport[] = [];
  const run = async (n: number) => {
    const s = steps.find((x) => x.n === n)!;
    // 앞 단계가 넘어졌으면 이어서 돌리지 않는다(원인은 앞 단계 보고에)
    const prevBad = done.find((r) => !r.ok);
    if (prevBad) throw new Error(`앞 단계가 실패: ${explain(prevBad)}`);
    const r = await b.run(s);
    done.push(r);
    expect(r.ok, explain(r)).toBe(true);
    return r;
  };
  const econ = () => b.game.econ as unknown as EconApi & { cheat: boolean };

  beforeAll(async () => { b = await bootLoop('?p0=1&fresh=1'); }, 60_000);

  it('새 저장: P0 · 치트 꺼짐 · 0 코인 · 낚싯대와 잠자리채', () => {
    const e = econ();
    expect(e.p0).toBe(true);
    expect(e.cheat).toBe(false);
    expect(b.game.state.coins).toBe(0);
    expect(e.stars).toBe(0);
    expect(e.isUnlocked('tool:rod') && e.isUnlocked('tool:net')).toBe(true);
    expect(e.isUnlocked('v:raft') || e.isUnlocked('v:bike') || e.isUnlocked('rocket:pad')).toBe(false);
  });

  it('계약 9장 디버그 훅이 다 있다(화면이 필요한 __env·__hud·__photo 는 scripts/loop.mjs 가 본다)', () => {
    const W = globalThis as Record<string, any>;
    for (const [name, fns] of Object.entries(HOOKS)) {
      expect(W[name], name).toBeTruthy();
      for (const f of fns) expect(typeof W[name][f], `${name}.${f}`).toBe('function');
    }
    expect(Array.isArray(W.__vehicles.list), '__vehicles.list').toBe(true);
    for (const name of P1_HOOKS) expect(W[name], name).toBeTruthy();
  });

  it('종 id 접두사: GDD id(f_ d_ b_ z_ s_ fos_ …) 또는 gdd 표시, 아니면 v1 부터 있던 옛 id', () => {
    const CAT_PREFIX: Record<string, string> = { fish: 'f_', bug: 'b_', sea: 'd_', dino: 'z_', space: 's_', fossil: 'fos_' };
    // 아이템 칸(재료·쓰레기·탈것·도구·미끼·씨앗·기타·꾸미기·스킨·부품·가구·화석·레시피) — 계약 8장
    const ITEM = /^(m|t|v|tool|bait|seed|it|cos|skin|p|f|fos|r|ach)_/;
    // v1 에서 그대로 옮겨 온 옛 id(계약 3장: 기존 id 는 바꾸지 않는다) — 새 종은 이 모양을 쓰면 안 된다
    const LEGACY = /^(fish|sea|bug|dino|fossil)-[a-z0-9-]+$/;
    const LEGACY_SPACE = new Set(['alien-slime', 'meteor-fish', 'comet-chick', 'nebula-cat', 'ring-snail', 'astro-penguin', 'gold-bunny']);
    const bad: string[] = [];
    let n = 0;
    for (const s of b.game.state.species.values()) {
      n++;
      const want = CAT_PREFIX[s.category];
      const ok = want
        ? s.id.startsWith(want) || (s.gdd ?? '').startsWith(want) || LEGACY.test(s.id) || LEGACY_SPACE.has(s.id)
        : ITEM.test(s.id) || LEGACY.test(s.id);
      if (!ok) bad.push(`${s.category}:${s.id}${s.gdd ? `(${s.gdd})` : ''}`);
    }
    expect(n).toBeGreaterThan(400);
    expect(bad).toEqual([]);
  });

  it('1. 말랑섬 강 낚시 → 잡았다·도감 NEW', async () => {
    const r = await run(1);
    const res = r.result as { fish: string };
    // 낚시 훅의 후보 = fishing/data poolFor(말랑섬 강, 지금 시각) — 잡힌 종은 그 안에 있다
    const env = b.game.env!;
    const pool = poolFor({ island: 'home', zone: 'river', hour: env.hour, weather: env.weather, moonPhase: env.moonPhase }).map((s) => s.id);
    expect(pool).toContain(res.fish);
    expect(new Set((globalThis as any).__fishingDebug.pool())).toEqual(new Set(pool));
    expect(b.game.state.coins).toBe(0); // 아직 판 게 없다
  });

  it('2. 꽃밭 곤충', async () => {
    const r = await run(2);
    const id = (r.result as { bug: string }).bug;
    expect(b.game.state.species.get(id)?.category).toBe('bug');
  });

  it('3. 상자 열기 → 코인·재료', async () => {
    const c0 = b.game.state.coins;
    const r = await run(3);
    const coins = r.checks.find((c) => c.name.startsWith('장부: coins'))!;
    expect(coins.ok).toBe(true);
    expect(b.game.state.coins).toBeGreaterThanOrEqual(c0);
  });

  it('4. 흔들기·베기·두드리기 → 과일·나무·돌·철광석', async () => {
    const r = await run(4);
    const res = r.result as { wood: number; stone: number; iron: number; vine: number; fruit: string[] };
    expect(res.fruit.length).toBeGreaterThan(0);
    expect(res.wood).toBeGreaterThanOrEqual(4);
    expect(res.stone).toBeGreaterThan(0);
    expect(res.iron).toBeGreaterThan(0);
    expect(res.vine).toBeGreaterThanOrEqual(1); // 곰 몽실 환영 우편
    expect(econ().isUnlocked('tool:hammer')).toBe(true);
  });

  it('5. 꽥꽥상회 팔기 — 오늘의 인기 ×2', async () => {
    const c0 = b.game.state.coins;
    const r = await run(5);
    const m = econ().market();
    for (const id of m.hot) expect(m.mult[id]).toBe(2);
    const sold = (r.result as { sold: number }).sold;
    expect(b.game.state.coins).toBe(c0 + sold);
  });

  it('6. 자전거 1,600 → v:bike', async () => {
    await run(6);
    expect(econ().isUnlocked('v:bike')).toBe(true);
    expect(canMount('bike', econ())).toBe(true);
    expect(b.game.state.bag.v_bike).toBeUndefined();
  });

  it('7. 뗏목(나무 4 + 덩굴 1) → v:raft', async () => {
    expect(canMount('raft', econ())).toBe(false);
    await run(7);
    expect(econ().isUnlocked('v:raft')).toBe(true);
    expect(canMount('raft', econ())).toBe(true);
  });

  it('8. 뗏목 → 산호빛섬 → 잠수 → 바다 생물', async () => {
    const r = await run(8);
    const sea = (r.result as { sea: string }).sea;
    expect(b.game.state.species.get(sea)?.category).toBe('sea');
    expect(b.game.state.flags.world && (b.game.state.flags.world as { disc: Record<string, unknown> }).disc.coral).toBeTruthy();
  });

  it('9. 기증 → 반짝별 → 설계도 → 부품 6 → 발사대 → canLaunch', async () => {
    expect(canLaunch(econ())).toBe(false);
    const r = await run(9);
    expect(canLaunch(econ())).toBe(true);
    const rk = econ().rocket();
    expect(rk).toMatchObject({ blueprint: true, count: 6, pad: true });
    // 대신 넣어 준 것은 섬 일주 재료와 발사대 코인뿐(반짝별은 기증·도감으로 모았다)
    expect(r.notes.some((n) => n.includes('__dl.stars'))).toBe(false);
    // 별자리 물고기는 크레이터에서 굴려 낚아야 한다(굴림 풀이 깨져 '바로 낚음' 으로 메우면 실패)
    expect(r.notes.filter((n) => n.includes('바로 낚음')), r.notes.join(' / ')).toEqual([]);
  });

  it('10. 발사 → 달 → 떡붕어·반짝가루나방·월석 → 귀환 → 월석 ×1.8', async () => {
    const r = await run(10);
    const res = r.result as { earth: number; space: number; moonrock: number };
    const mult = econ().market().mult.m_moonrock ?? 1;
    const base = MATERIALS.find((m) => m.id === 'm_moonrock')!.price;
    expect(Math.abs(res.earth - Math.round(base * 1.8 * mult))).toBeLessThanOrEqual(1);
    expect(Math.abs(res.space - Math.round(base * mult))).toBeLessThanOrEqual(1);
    expect(res.moonrock).toBeGreaterThan(0);
    expect(r.notes.filter((n) => n.includes('바로 낚음')), r.notes.join(' / ')).toEqual([]);
    expect(b.game.world).toBe('earth');
    const p = b.game.player.pos;
    expect(Math.hypot(p.x - PLACES.shop.x, p.z - PLACES.shop.z)).toBeLessThan(10); // 월석은 꽥꽥상회에서 팔았다
    for (const id of ['f_mochi_crucian', 's_glitter_moth']) expect(b.game.state.dex[b.game.state.byGdd(id)!.id]).toBeTruthy();
  });

  it('한 판 전체: 10단계 PASS, 이벤트 순서(launch → arrive moon → arrive earth)', () => {
    expect(done.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const ev = (globalThis as any).__dl.events(0) as Array<{ type: string; to?: string }>;
    const iL = ev.findIndex((e) => e.type === 'launch');
    const iM = ev.findIndex((e) => e.type === 'arrive' && e.to === 'moon');
    const iE = ev.findIndex((e) => e.type === 'arrive' && e.to === 'earth');
    expect(iL).toBeGreaterThan(0);
    expect(iM).toBeGreaterThan(iL);
    expect(iE).toBeGreaterThan(iM);
    for (const t of ['collect', 'catch', 'chest-open', 'harvest', 'sell', 'buy', 'craft', 'unlock', 'donate', 'stars', 'mount', 'summon', 'discover', 'launch-wave', 'launch']) {
      expect(ev.some((e) => e.type === t), t).toBe(true);
    }
  });
});

describe('?cheat=1 단축 길(GDD 4.9: 9~10 만 빠르게)', () => {
  let b: Booted;
  beforeAll(async () => { b = await bootLoop('?p0=1&cheat=1&fresh=1'); }, 60_000);

  it('코인 100만 · 반짝별 999 · 재료 99 · 전부 해금', () => {
    const e = b.game.econ as unknown as EconApi & { cheat: boolean };
    expect(e.cheat).toBe(true);
    expect(b.game.state.coins).toBeGreaterThanOrEqual(1_000_000);
    expect(e.stars).toBeGreaterThanOrEqual(999);
    for (const id of ['m_iron', 'm_hardwood', 'm_stardust', 'm_wood', 'm_vine']) expect(b.game.state.bag[id]).toBeGreaterThanOrEqual(99);
    expect(canLaunch(e)).toBe(true);
    expect(canMount('raft', e)).toBe(true);
  });

  it('9 → 10 을 대신 지급 없이 바로', async () => {
    for (const n of [9, 10]) {
      const r = await b.run(steps.find((s) => s.n === n)!);
      expect(r.ok, explain(r)).toBe(true);
      // 치트는 다 갖고 시작한다 — __dl 로 채운 게 없어야 한다
      expect(r.notes.filter((x) => x.includes('__dl') || x.includes('대신 넣어')), r.notes.join(' / ')).toEqual([]);
    }
    expect(b.game.world).toBe('earth');
  });
});

describe('통합 규칙', () => {
  it('모듈 순서 = 계약 8장', async () => {
    for (const [name, want] of Object.entries(ORDER)) {
      const mod = await import(`../src/modules/${name}.ts?raw`);
      const m = /export const order\s*=\s*(\d+)/.exec(mod.default as string);
      expect(m && Number(m[1]), name).toBe(want);
    }
    // 루프가 올리는 순서도 계약 순서
    const orders = LOOP_MODULES.map((n) => ORDER[n]);
    expect([...orders].sort((x, y) => x - y)).toEqual(orders);
  });
});
