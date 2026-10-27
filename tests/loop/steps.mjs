// GDD 4.9 P0 10단계 소비 루프 — 한 판을 처음부터 끝까지 모는 단계 정의(정본 하나).
//   tests/loop.test.ts(node, 가짜 게임 + 진짜 모듈)와 scripts/loop.mjs(브라우저, 진짜 게임)가 같은 단계를 돌린다.
//   단계 함수는 window.__* 디버그 훅(계약 v2 9장)과 __dl 만 쓴다 — 브라우저에선 함수 소스를 그대로 페이지에 넘기므로
//   바깥 변수·import 를 쓰면 안 된다(필요한 건 전부 W 와 h 로).
//
//   step.run(W, h): W = window(훅들), h = makeHelpers 가 만든 도우미. 돌려준 값은 보고서에 붙는다.
//   h.check(이름, 참/거짓, 실제값) 로 단계 안의 조건을 적는다 — 하나라도 거짓이면 그 단계는 FAIL.
//   h.ctx 는 단계 사이에 남는 메모(잡은 물고기 id 등).

/**
 * 도우미 만들기(브라우저에서도 소스째 넘어간다 — 자기 완결).
 * @param {any} W 창(훅이 달린 전역)
 * @param {{ wait: (sec: number) => Promise<void>, ctx?: Record<string, any>, snap?: (label: string) => Promise<void> }} env
 *   시간 흘리기(node = 가짜 게임 tick, 브라우저 = 실제 대기) · 중간 스크린샷(브라우저만)
 */
export function makeHelpers(W, env) {
  const checks = [];
  const notes = [];
  const start = { coins: W.__dl.game.state.coins, stars: W.__dl.game.econ?.stars ?? 0, mark: W.__dl.mark() };
  const h = {
    ctx: env.ctx ?? {},
    checks,
    notes,
    wait: env.wait,
    get dl() { return W.__dl; },
    get game() { return W.__dl.game; },
    get econ() { return W.__dl.game.econ; },
    get st() { return W.__dl.game.state; },
    /** 조건 하나 적기 */
    check(name, ok, got) { checks.push({ name, ok: !!ok, got: got === undefined ? undefined : JSON.parse(JSON.stringify(got ?? null)) }); return !!ok; },
    /** 단계 중간 스크린샷(브라우저만 — node 에선 아무것도 안 함) */
    async snap(label) { if (env.snap) await env.snap(String(label)); },
    /** 메모 한 줄(대신 지급 등 정직하게 적어 둘 것) */
    note(text) { notes.push(String(text)); },
    /** 종(id 또는 GDD id) */
    sp(id) { const s = W.__dl.game.state; return s.species.get(id) ?? (typeof s.byGdd === 'function' ? s.byGdd(id) : undefined); },
    /** 이 단계 시작 뒤 이벤트(type 만) */
    ev(type) { return W.__dl.events(h.ctx.mark ?? 0, type); },
    /** 마지막 그 이벤트 */
    last(type) { const a = h.ev(type); return a[a.length - 1] ?? null; },
    coins() { return W.__dl.game.state.coins; },
    /** 기증하려고 남겨 둘 가방 키(지금까지 처음 잡은 것 — 변이면 변이 키) */
    keep() { return [h.ctx.fishKey, h.ctx.bugKey, h.ctx.seaKey].filter(Boolean); },
    /** 방금 잡은 종의 가방 키(collect 이벤트의 변이까지) */
    keyOf(id) { const c = h.ev('collect').filter((e) => e.species === id).pop(); return c?.variant ? `${id}@${c.variant}` : id; },
    bag(id) { return W.__dl.game.state.bag[id] ?? 0; },
    /** 조건이 될 때까지 기다리기(초 단위 제한) */
    async until(fn, sec = 10, stepSec = 0.25) {
      for (let t = 0; t <= sec; t += stepSec) {
        let v = null;
        try { v = fn(); } catch { v = null; }
        if (v) return v;
        await env.wait(stepSec);
      }
      try { return fn(); } catch { return null; }
    },
    /** 상호작용 id 자리 옆으로 가서 카메라가 그쪽을 보게(스크린샷에 가게·작업대가 나오게) */
    goto(id, back) {
      const at = W.__dl.goto(id, back);
      const p = W.__dl.where(id);
      const g = W.__dl.game;
      if (at && p && g.cam) { g.cam.yaw = Math.atan2(-(p.x - at.x), -(p.z - at.z)); g.cam.pitch = Math.max(g.cam.pitch ?? 0.3, 0.3); }
      return at;
    },
    /** 플레이어 자리 */
    pos() { const p = W.__dl.game.player.pos; return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10 }; },
    /**
     * 장부 맞추기(단계 끝에 러너가 부른다): 이 단계의 coins 이벤트 delta 합 = 코인 변화, stars 이벤트 delta 합 = 반짝별 변화.
     * 상점·상자·판매·제작·기증이 이벤트 없이 몰래 돈을 바꾸면 여기서 걸린다.
     */
    ledger() {
      const e = W.__dl.events(start.mark);
      const sum = (t) => e.filter((x) => x.type === t).reduce((a, x) => a + (Number(x.delta) || 0), 0);
      const dc = W.__dl.game.state.coins - start.coins, ds = (W.__dl.game.econ?.stars ?? 0) - start.stars;
      h.check('장부: coins 이벤트 합 = 코인 변화', sum('coins') === dc, { events: sum('coins'), change: dc });
      h.check('장부: stars 이벤트 합 = 반짝별 변화', sum('stars') === ds, { events: sum('stars'), change: ds });
    },
    /** 생물만 골라 팔기(재료·도구는 남긴다, keep 에 든 종은 한 마리 남김) — 판 코인 */
    sellCreatures(shop = 'quack', keep = []) {
      const s = W.__dl.game.state, e = W.__dl.game.econ;
      let got = 0;
      for (const k of Object.keys(s.bag)) {
        const base = k.split('@')[0];
        const sp = s.species.get(base);
        if (!sp || !['fish', 'bug', 'sea', 'space'].includes(sp.category)) continue;
        // keep 에 든 종은 한 마리 남긴다(박물관 기증용)
        const n = s.bag[k] - (keep.includes(k) ? 1 : 0);
        if (n <= 0) continue;
        const before = s.coins;
        e.sell(k, n, shop);
        got += s.coins - before;
      }
      return got;
    },
  };
  return h;
}

/** 단계 목록 — n 은 GDD 4.9 번호 */
export const STEPS = [
  {
    n: 1, key: 'fish', title: '말랑섬 강 낚시 → 잡았다·도감 NEW',
    async run(W, h) {
      const F = W.__fishingDebug;
      h.check('강 낚시터로 이동', F.goto('river') === true, h.pos());
      const ids = F.pool();
      h.check('강 후보 물고기가 있다', ids.length > 0, ids);
      const pool = ids.map((id) => h.sp(id)).filter(Boolean);
      // 계약 6장 rollCatch — 쓰레기는 빼고(junk:false) 물고기 한 마리
      const r = h.econ.rollCatch({ activity: 'fish', pool, junk: false });
      h.check('rollCatch 가 강 후보 중 하나', !!r.species && ids.includes(r.species.id), r.species?.id);
      const sp = h.sp(r.species.id);
      h.econ.reportCatch(r, 'fish');
      const isNew = h.game.ui.showCatch({ species: sp, size: r.size, sizeText: r.size ? `${r.size.toFixed(1)}cm` : undefined, variant: r.variant, activity: 'fish', line: '첫 물고기!' });
      h.check('잡았다 → 도감 NEW', isNew === true, isNew);
      h.check('도감 기록', !!h.st.dex[sp.id], h.st.dex[sp.id]);
      h.check('collect 이벤트(isNew)', h.ev('collect').some((e) => e.species === sp.id && e.isNew === true), h.ev('collect'));
      h.check('catch 이벤트(fish)', h.ev('catch').some((e) => e.activity === 'fish' && e.species === sp.id), h.ev('catch'));
      h.check('가방에 들어감', h.bag(sp.id) + h.bag(`${sp.id}@${r.variant}`) >= 1, h.st.bag);
      h.ctx.fish = sp.id;
      h.ctx.fishKey = h.keyOf(sp.id);
      return { fish: sp.id, name: sp.name, rarity: sp.rarity, size: r.size };
    },
  },
  {
    n: 2, key: 'bug', title: '꽃밭에서 곤충 잡기',
    async run(W, h) {
      const I = W.__insects;
      const P = h.dl.places.HERO.player;
      h.dl.teleport(P.x + 2, P.z + 2);
      await h.wait(0.6);
      const zone = W.__geo?.zoneAt?.(h.game.player.pos.x, h.game.player.pos.z);
      h.check('말랑섬 꽃밭 구역', zone?.island === 'home', zone);
      // 근처(25m)에 날아다니는 곤충이 없으면 꽃밭 종 하나를 앞에 내놓는다
      let near = I.bugs().filter((b) => b.dist < 25 && b.spot !== 'water');
      if (!near.length) {
        const sp = I.species.find((s) => !s.p1 && s.rarity <= 2 && (s.where ?? []).some((w) => w.island === 'home' && w.zone === 'flower'));
        h.note(`근처 곤충이 없어 ${sp?.id} 를 꽃밭에 내놓음`);
        I.spawnAt(sp.id);
        near = I.bugs().filter((b) => b.dist < 25);
      }
      h.check('곤충이 보인다', near.length > 0, near.slice(0, 3));
      const row = I.catchNear();
      h.check('잠자리채로 잡음', !!row, row);
      const id = row?.id;
      h.check('collect 이벤트(곤충)', h.ev('collect').some((e) => e.species === id), h.ev('collect'));
      h.check('catch 이벤트(bug)', h.ev('catch').some((e) => e.activity === 'bug' && e.species === id), h.ev('catch'));
      h.check('도감에 곤충', !!h.st.dex[id], id);
      h.ctx.bug = id;
      h.ctx.bugKey = h.keyOf(id);
      return { bug: id, name: row?.name };
    },
  },
  {
    n: 3, key: 'chest', title: '보물상자 열기 → 코인·재료',
    async run(W, h) {
      const E = W.__econ;
      const P = h.dl.places.HERO.player;
      h.dl.teleport(P.x + 3, P.z - 2);
      const placed = E.spawnChest('wood', 3);
      h.check('나무상자 놓기', placed.placed >= 1, placed);
      const chest = await h.until(() => E.chests().find((c) => c.d <= 6 && c.tier === 'wood'), 5);
      h.check('상자가 세상에 나타남', !!chest, E.chests().slice(0, 3));
      const coins0 = h.coins(), bag0 = JSON.stringify(h.st.bag);
      // 가까이 가서 E — 상자 공급자가 잡히면 그걸로, 아니면 가장 가까운 상자 열기 훅
      const it = h.dl.list().find((x) => x.id === 'econ-chest');
      if (it) h.dl.game.interact('econ-chest'); else E.openNearest();
      const open = await h.until(() => h.last('chest-open'), 6);
      h.check('chest-open 이벤트(나무)', open?.tier === 'wood', open);
      if (open?.mimic) {
        // 3% 미믹 상자게 — 잡으면 내용물(5.4)
        h.note('미믹 상자게가 튀어나와 잡았음');
        await h.wait(1.2);
        E.catchMimic();
        await h.until(() => h.ev('chest-open').length > 1 || h.coins() > coins0, 4);
      }
      const gotCoins = h.coins() - coins0;
      const gotItems = JSON.stringify(h.st.bag) !== bag0;
      h.check('코인이나 재료를 받음', gotCoins > 0 || gotItems || (open?.loot?.length ?? 0) > 0, { gotCoins, open, all: h.ev('chest-open') });
      return { coins: gotCoins, loot: open?.loot };
    },
  },
  {
    n: 4, key: 'harvest', title: '나무 흔들기·베기·돌 두드리기 → 과일·나무·돌·철광석',
    async run(W, h) {
      const Fl = W.__flora, E = h.econ;
      // 첫 아침 우편(곰 몽실): 나무 5 + 덩굴 1 — 뗏목 재료의 시작
      // P0 7단계(뗏목 덩굴)가 이 우편에 기댄다 — 달력이 없으면 여기서 바로 실패시킨다
      const C = W.__calendar;
      h.check('달력(우편) 훅이 있다', !!C, null);
      if (C) {
        C.open?.('inbox');
        const n = C.claimAll?.() ?? 0;
        h.check('환영 우편 선물 받기', n > 0 || h.bag('m_vine') > 0, C.mail?.().map((m) => m.id));
        h.game.hud?.close?.();
      }
      // 흔들기: 열매 나무
      const fruitTree = Fl.trees().filter((t) => t.island === 'home' && t.fruit && !t.shaken)
        .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
      h.check('열매 나무가 있다', !!fruitTree, fruitTree);
      h.dl.teleport(fruitTree.x + 1.2, fruitTree.z + 0.6);
      const shook = Fl.shakeNearest();
      h.check('나무 흔들기', !!shook, shook);
      await h.wait(1.5); // 떨어진 열매가 굴러 멈춘다
      // 떨어진 과일 줍기(흔들기 결과 'fruit' 수확) — 줍는 훅이 따로 없으면 drops 목록으로 확인
      let fruits = h.ev('harvest').filter((e) => e.kind === 'fruit' || e.kind === 'shake');
      for (let i = 0; i < 8 && !fruits.some((e) => String(e.item).startsWith('m_')); i++) {
        Fl.pickDrop(8);
        await h.wait(0.4);
        fruits = h.ev('harvest').filter((e) => e.kind === 'fruit' || e.kind === 'shake');
      }
      h.check('과일을 얻음', fruits.some((e) => String(e.item).startsWith('m_')), h.ev('harvest'));
      // 베기·두드리기엔 돌망치 — 상자·과일로 번 코인으로 꽥꽥상회에서(P0 120)
      if (!E.isUnlocked('tool:hammer')) {
        const price = E.shopPrice('shop_hammer').coins ?? 0;
        if (h.coins() < price) {
          const got = h.sellCreatures('quack', h.keep());
          h.note(`돌망치 값이 모자라 ${got}코인어치 팔았음`);
        }
        if (h.coins() < price) {
          // 과일도 판다(열매는 다시 열린다)
          for (const e of fruits) if (h.bag(e.item) > 0) E.sell(e.item, h.bag(e.item), 'quack');
        }
        h.check('돌망치 사기', E.buy('shop_hammer') === true, { coins: h.coins(), price });
      }
      h.check('돌망치 해금', E.isUnlocked('tool:hammer'), E.isUnlocked('tool:hammer'));
      // 베기: 나무 재료가 4개 될 때까지(나무마다 하루 3번)
      const trees = Fl.trees().filter((t) => t.island === 'home' && t.chopsLeft > 0)
        .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      const wood0 = h.bag('m_wood');
      let chopped = 0;
      for (const t of trees) {
        if (h.bag('m_wood') - wood0 >= 4 || chopped > 12) break;
        h.dl.teleport(t.x + 1.2, t.z + 0.6);
        for (let k = 0; k < 3; k++) { if (Fl.chopNearest()) chopped++; await h.wait(0.7); }
      }
      h.check('나무 베기 → 나무', h.ev('harvest').some((e) => e.kind === 'chop' && (e.item === 'm_wood' || e.item === 'm_hardwood')), h.ev('harvest').filter((e) => e.kind === 'chop'));
      // 두드리기: 돌과 철광석이 다 나올 때까지(돌마다 하루 8번, 콤보로 철광석이 잘 나온다)
      const rocks = Fl.rocks().filter((r) => r.island === 'home' && !r.broken)
        .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      const got = () => { const hv = h.ev('harvest').filter((e) => e.kind === 'rock'); return { stone: hv.some((e) => e.item === 'm_stone'), iron: hv.some((e) => e.item === 'm_iron') }; };
      for (const r of rocks) {
        if (got().stone && got().iron) break;
        h.dl.teleport(r.x + 1.6, r.z + 0.8);
        await h.wait(0.2);
        for (let k = 0; k < 8 && !(got().stone && got().iron); k++) { Fl.hitNearest(6); await h.wait(0.3); }
      }
      h.check('돌 두드리기 → 돌', got().stone, h.ev('harvest').filter((e) => e.kind === 'rock'));
      h.check('돌 두드리기 → 철광석', got().iron, h.ev('harvest').filter((e) => e.kind === 'rock'));
      h.check('tree-shake·rock-hit 이벤트', h.ev('tree-shake').length > 0 && h.ev('rock-hit').length > 0, { shake: h.ev('tree-shake').length, rock: h.ev('rock-hit').length });
      return { wood: h.bag('m_wood'), stone: h.bag('m_stone'), iron: h.bag('m_iron'), vine: h.bag('m_vine'), fruit: fruits.map((e) => e.item) };
    },
  },
  {
    n: 5, key: 'sell', title: '꽥꽥상회에서 팔기 → 코인(오늘의 인기 ×2)',
    async run(W, h) {
      const E = h.econ;
      h.check('꽥꽥상회 앞으로', !!h.goto('econ-shop'), h.pos());
      h.check('E 꽥꽥상회 들르기', h.dl.game.interact('econ-shop'), h.dl.list().map((x) => x.id));
      h.check('open-shop{quack}', h.ev('open-shop').some((e) => e.shop === 'quack'), h.ev('open-shop'));
      const m = E.market();
      h.check('오늘의 인기 3개', Array.isArray(m.hot) && m.hot.length === 3, m.hot);
      h.check('인기 ×2 시세', m.hot.every((id) => m.mult[id] === 2), m.hot.map((id) => m.mult[id]));
      // 인기 품목 값이 실제로 ×2 로 매겨지나 — 시세 배율을 뺀 기본값과 비교
      const hot = m.hot[0];
      const p = E.priceOf(hot);
      h.check('인기 품목 값 > 0', p > 0, { hot, p });
      await h.wait(0.5);
      const c0 = h.coins();
      const got = h.sellCreatures('quack', h.keep());
      const sells = h.ev('sell');
      h.check('sell 이벤트(quack)', sells.length > 0 && sells.every((e) => e.shop === 'quack'), sells);
      h.check('판 만큼 코인', got > 0 && h.coins() === c0 + got, { got, coins: h.coins() });
      h.check('coins 이벤트(+)', h.ev('coins').some((e) => e.delta > 0), h.ev('coins').slice(-3));
      h.game.hud?.close?.();
      return { sold: got, coins: h.coins(), hot: m.hot };
    },
  },
  {
    n: 6, key: 'buy', title: '사기: 자전거(1,600)',
    async run(W, h) {
      const E = h.econ;
      h.check('자전거 값 1,600', E.shopPrice('shop_bike').coins === 1600, E.shopPrice('shop_bike'));
      // 모자라면 강에서 더 낚아 판다(진짜 낚시 결과 — 굴림·천장 그대로)
      let rounds = 0;
      while (h.coins() < 1600 && rounds < 80) {
        if (rounds === 0) W.__fishingDebug.goto('river');
        W.__fishingDebug.catchNow();
        rounds++;
        if (rounds % 5 === 0) h.sellCreatures('quack', h.keep());
        await h.wait(0.05);
      }
      h.sellCreatures('quack', h.keep());
      if (rounds) h.note(`자전거 값을 벌려고 강에서 ${rounds}번 더 낚아 팔았음`);
      h.check('1,600 코인 모음', h.coins() >= 1600, h.coins());
      h.goto('econ-shop');
      h.dl.game.interact('econ-shop');
      const c0 = h.coins();
      h.check('자전거 사기', E.buy('shop_bike') === true, E.canBuy('shop_bike'));
      h.check('1,600 빠짐', c0 - h.coins() === 1600, c0 - h.coins());
      h.check('v:bike 해금', E.isUnlocked('v:bike'), E.isUnlocked('v:bike'));
      h.check('buy 이벤트', h.ev('buy').some((e) => e.id === 'shop_bike' && e.cost?.coins === 1600), h.ev('buy'));
      h.check('unlock 이벤트(v:bike)', h.ev('unlock').some((e) => e.key === 'v:bike'), h.ev('unlock'));
      h.check('자전거 탈 수 있음', W.__vehicles.gate('bike')?.ok === true, W.__vehicles.gate('bike'));
      h.game.hud?.close?.();
      return { coins: h.coins(), fishedMore: rounds };
    },
  },
  {
    n: 7, key: 'craft', title: '작업대에서 뗏목(나무 4 + 덩굴 1)',
    async run(W, h) {
      const E = h.econ;
      h.check('뗏목 재료 = 나무 4 + 덩굴 1', JSON.stringify(E.needsOf('r_raft')) === JSON.stringify({ m_wood: 4, m_vine: 1 }), E.needsOf('r_raft'));
      h.check('재료가 있다', h.bag('m_wood') >= 4 && h.bag('m_vine') >= 1, { wood: h.bag('m_wood'), vine: h.bag('m_vine') });
      h.check('작업대 앞으로', !!h.goto('econ-workbench'), h.pos());
      h.check('E 작업대', h.dl.game.interact('econ-workbench'), null);
      h.check('open-craft', h.ev('open-craft').length > 0, h.ev('open-craft'));
      await h.wait(0.5);
      const w0 = h.bag('m_wood'), v0 = h.bag('m_vine');
      h.check('뗏목 만들기', E.craft('r_raft') === true, E.canCraft('r_raft'));
      h.check('재료가 빠짐', w0 - h.bag('m_wood') === 4 && v0 - h.bag('m_vine') === 1, { wood: h.bag('m_wood'), vine: h.bag('m_vine') });
      h.check('craft 이벤트 → v:raft', h.ev('craft').some((e) => e.id === 'r_raft' && e.gives === 'v:raft'), h.ev('craft'));
      h.check('v:raft 해금', E.isUnlocked('v:raft'), null);
      h.check('가방엔 v_raft 없음', h.bag('v_raft') === 0, h.bag('v_raft'));
      h.game.hud?.close?.();
      return { wood: h.bag('m_wood'), vine: h.bag('m_vine') };
    },
  },
  {
    n: 8, key: 'raft', title: 'F 뗏목 → 산호빛섬 → 잠수 → 바다 생물',
    async run(W, h) {
      const V = W.__vehicles;
      const gate = V.gate('raft');
      h.check("canMount('raft')", gate?.ok === true, gate);
      // 마을 부두 물가에서 F 로 부르기
      const dock = h.dl.places.PLACES.pier;
      h.dl.teleport(dock.x, dock.z);
      await h.wait(0.3);
      const called = V.summon('raft');
      h.check('F 뗏목 부르기', called === true || h.ev('summon').some((e) => e.vehicle === 'raft'), { called, at: h.pos() });
      h.check('summon 이벤트', h.ev('summon').some((e) => e.vehicle === 'raft'), h.ev('summon'));
      // 노 저어 1.7 km 는 너무 길다 — 산호빛섬 앞바다에서 뗏목을 탄 채로 이어 간다(같은 탈것 그대로)
      const isl = h.dl.places.ISLANDS.find((d) => d.id === 'coral');
      const cdock = h.dl.places.PLACES.docks.coral;
      const ang = Math.atan2(cdock.z - isl.z, cdock.x - isl.x);
      const sea = { x: cdock.x + Math.cos(ang) * 30, z: cdock.z + Math.sin(ang) * 30 };
      V.show('raft', sea.x, sea.z, ang);
      await h.wait(0.3);
      h.check('뗏목을 탔다', V.current()?.kind === 'raft', V.current());
      h.check('mount 이벤트(raft)', h.ev('mount').some((e) => e.vehicle === 'raft'), h.ev('mount'));
      // 내려서 섬으로 올라서기 → discover{coral}
      h.dl.game.player.dismount();
      h.dl.teleport(cdock.x - Math.cos(ang) * 25, cdock.z - Math.sin(ang) * 25);
      const disc = await h.until(() => h.ev('discover').find((e) => e.place === 'coral'), 4);
      h.check('산호빛섬 발견', !!disc || W.__geo?.disc?.().includes?.('coral'), disc ?? W.__geo?.disc?.());
      h.check('dismount 이벤트', h.ev('dismount').some((e) => e.vehicle === 'raft'), h.ev('dismount'));
      // 잠수: 섬 앞 산호초
      // 잠수: 섬 앞바다에서 바닥이 3 m 넘게 깊은 첫 물(얕은 모래톱은 건너뛴다) — 산호초 구역이면 더 좋다
      let reefAt = null;
      for (const want of ['reef', null]) {
        for (let d = 40; d <= 260 && !reefAt; d += 5) {
          const x = cdock.x + Math.cos(ang) * d, z = cdock.z + Math.sin(ang) * d;
          if (!W.__ocean.seaAt(x, z) || h.game.groundAt(x, z) > -3) continue;
          if (want && W.__ocean.zoneAt(x, z)?.dive !== want) continue;
          reefAt = { x, z, d };
        }
        if (reefAt) break;
      }
      h.check('잠수할 깊은 물', !!reefAt, reefAt);
      W.__ocean.dive(reefAt.x, reefAt.z);
      await h.wait(1);
      let list = W.__ocean.list();
      for (let i = 0; i < 8 && !list.some((s) => s.id); i++) { await h.wait(0.5); list = W.__ocean.list(); }
      h.check('잠수 중', ['dive', 'swim'].includes(h.game.player.mode), h.game.player.mode);
      h.check('바다 생물이 보인다', list.some((s) => s.id), list.slice(0, 4));
      const got = W.__ocean.catchNear();
      h.check('바다 생물 잡기', !!got, got);
      const c = h.ev('collect').find((e) => e.species === got);
      h.check('collect(sea)', !!c, h.ev('collect'));
      h.check('catch 이벤트(dive)', h.ev('catch').some((e) => e.activity === 'dive' && e.species === got), h.ev('catch'));
      h.ctx.sea = got;
      h.ctx.seaKey = h.keyOf(got);
      // 물 밖으로(부두)
      h.dl.teleport(cdock.x - Math.cos(ang) * 25, cdock.z - Math.sin(ang) * 25);
      return { sea: got, discovered: !!disc };
    },
  },
  {
    n: 9, key: 'rocket', title: '기증 → 반짝별 → 설계도(20) → 부품 6 → 발사대(30,000)',
    async run(W, h) {
      const E = h.econ;
      const cheat = !!E.cheat;
      // 박물관 기증: 지금까지 잡은 생물 — 반짝별
      h.check('박물관 앞으로', !!h.goto('econ-museum'), h.pos());
      h.check('E 박물관', h.dl.game.interact('econ-museum'), null);
      h.check('open-museum', h.ev('open-museum').length > 0, null);
      const s0 = E.stars;
      const donated = [];
      const donate = (key) => {
        const id = key.split('@')[0];
        if ((E.canDonate(key) && E.donate(key)) || (E.canDonate(id) && E.donate(id))) { donated.push(id); return true; }
        return false;
      };
      for (const key of h.keep()) {
        h.check(`기증할 ${key} 가 가방에 남아 있다`, h.bag(key) > 0, key);
        donate(key);
      }
      h.game.hud?.close?.();
      // 별자리 물고기 3종: 별똥별섬 크레이터 호수에서 낚는다(굴림 그대로 — 별자리 3종이 모일 때까지)
      // 별자리 물고기는 밤에만 나온다(GDD 3.5.8) — 밤 10시로 돌려 놓고, 끝나면 아침으로
      const hour0 = h.game.env?.hour ?? 10;
      h.dl.hour(22);
      h.check('크레이터 호수로', W.__fishingDebug.goto('crater') === true, h.pos());
      const isZod = (id) => (h.sp(id)?.tags ?? []).includes('set:zodiac');
      const zodGot = () => [...new Set(Object.keys(h.st.bag).map((k) => k.split('@')[0]).filter(isZod))];
      let rolls = 0;
      while (zodGot().length < 3 && rolls < 80) { W.__fishingDebug.catchNow(); rolls++; await h.wait(0.02); }
      if (zodGot().length < 3) {
        const more = [...h.st.species.values()].filter((sp) => isZod(sp.id) && !zodGot().includes(sp.id)).slice(0, 3 - zodGot().length);
        h.note(`크레이터에서 ${rolls}번 굴려 별자리 ${zodGot().length}종 — 나머지 ${more.map((x) => x.id)} 는 바로 낚음`);
        for (const z of more) W.__fishingDebug.catchNow(z.id);
      }
      const zod = zodGot().slice(0, 3);
      h.dl.hour(Math.max(9, Math.floor(hour0)));
      h.check('별자리 물고기 3종 낚음', zod.length === 3, { zod, rolls });
      h.goto('econ-museum');
      h.dl.game.interact('econ-museum');
      for (const z of zod) donate(Object.keys(h.st.bag).find((k) => k.split('@')[0] === z) ?? z);
      h.game.hud?.close?.();
      h.check('기증 → donate 이벤트', donated.length > 0 && h.ev('donate').length === donated.length, { donated, events: h.ev('donate') });
      h.check('기증 → 반짝별', cheat || E.stars > s0, { before: s0, after: E.stars });
      h.check('stars 이벤트(museum)', cheat || h.ev('stars').some((e) => e.delta > 0), h.ev('stars').slice(-3));
      h.check('항법 칩(별자리 3종 기증)', E.isUnlocked('rocket:part:chip'), E.rocket().parts);
      // 펭박사 연구소: 설계도 ⭐20
      h.check('펭박사 연구소로', !!h.goto('econ-peng'), h.pos());
      h.dl.game.interact('econ-peng');
      h.check('open-shop{peng}', h.ev('open-shop').some((e) => e.shop === 'peng'), null);
      h.check('설계도 = 반짝별 20', E.shopPrice('shop_blueprint').stars === 20, E.shopPrice('shop_blueprint'));
      if (E.stars < 20) { const need = 20 - E.stars; h.dl.stars(need); h.note(`반짝별 ${need}개 모자라 __dl.stars 로 채움(도감 더 채우기 대신)`); }
      if (!E.rocket().blueprint) h.check('설계도 사기', E.buy('shop_blueprint') === true, E.canBuy('shop_blueprint'));
      h.check('rocket:blueprint', E.rocket().blueprint, E.rocket());
      // 부품 5개 제작(P0 재료 1/5) — 재료는 섬 일주 대신 넣어 준다(치트면 이미 99개씩)
      const parts = ['r_rocket_body', 'r_rocket_engine', 'r_rocket_window', 'r_rocket_wing', 'r_rocket_fuel'];
      const lack = {};
      for (const rid of parts) for (const [k, n] of Object.entries(E.needsOf(rid))) { const miss = n - h.bag(k); if (miss > 0) { h.dl.give(k, miss); lack[k] = (lack[k] ?? 0) + miss; } }
      if (Object.keys(lack).length) h.note(`부품 재료는 섬 일주 대신 넣어 줌: ${JSON.stringify(lack)}`);
      h.goto('econ-workbench');
      for (const rid of parts) if (!E.isUnlocked(`rocket:part:${rid.replace('r_rocket_', '')}`) || !cheat) {
        const ok = E.craft(rid);
        h.check(`부품 제작 ${rid}`, ok === true || E.isUnlocked(`rocket:part:${rid.replace('r_rocket_', '')}`), E.craftCheck?.(rid) ?? E.canCraft(rid));
      }
      h.check('부품 6/6', E.rocket().count === 6, E.rocket());
      // 발사대 30,000
      h.goto('econ-peng');
      h.check('발사대 = 30,000', E.shopPrice('shop_launchpad').coins === 30000, E.shopPrice('shop_launchpad'));
      if (h.coins() < 30000 && !E.isUnlocked('rocket:pad')) { const need = 30000 - h.coins(); h.dl.coins(need); h.note(`발사대 코인 ${need} 모자라 __dl.coins 로 채움`); }
      if (!E.rocket().pad) h.check('발사대 짓기', E.buy('shop_launchpad') === true, E.canBuy('shop_launchpad'));
      h.check('rocket:pad', E.isUnlocked('rocket:pad'), E.rocket());
      h.check('canLaunch', W.__econ.state().canLaunch === true, W.__econ.state().rocket);
      h.check('로켓 탈 수 있음', W.__vehicles.gate('rocket')?.ok === true, W.__vehicles.gate('rocket'));
      h.game.hud?.close?.();
      return { stars: E.stars, coins: h.coins(), rocket: E.rocket() };
    },
  },
  {
    n: 10, key: 'moon', title: '발사 → 달 → 떡붕어·반짝가루나방·월석 → 귀환 → 월석 판매 ×1.8',
    async run(W, h) {
      const V = W.__vehicles, S = W.__space, E = h.econ;
      // 발사탑 앞에서 E
      V.goto('rocket');
      await h.wait(0.3);
      const ride = h.dl.list().find((x) => x.id === 'vehicles:ride');
      h.check('발사탑 E 가 잡힘', !!ride, h.dl.list().map((x) => x.id));
      h.dl.game.interact('vehicles:ride');
      h.check('로켓 탑승', V.current()?.kind === 'rocket', V.current());
      const wave = await h.until(() => h.last('launch-wave'), 3, 0.1);
      h.check('0.5초 launch-wave', !!wave, null);
      await h.wait(4.5);
      await h.snap('liftoff');
      const launch = await h.until(() => h.last('launch'), 14);
      h.check('launch 이벤트 → 달', launch?.to === 'moon', launch);
      const arrive = await h.until(() => h.ev('arrive').find((e) => e.to === 'moon'), 4);
      h.check('arrive{moon}', !!arrive, h.ev('arrive'));
      h.check('우주 세계', h.game.world === 'space', h.game.world);
      h.check('space:moon 해금', E.isUnlocked('space:moon'), null);
      await h.wait(0.5);
      // 떡붕어(달 연못) — 연못 후보에서 굴려 낚는다
      W.__fishingDebug.goto('moonpond', 0);
      await h.wait(0.3);
      const pool = W.__fishingDebug.pool('moonpond');
      const crucian = h.sp('f_mochi_crucian');
      h.check('달 연못 후보에 떡붕어', !!crucian && pool.includes(crucian.id), pool);
      let tries = 0;
      while (!h.st.dex[crucian.id] && tries < 40) { W.__fishingDebug.catchNow(); tries++; await h.wait(0.05); }
      if (!h.st.dex[crucian.id]) { h.note(`굴림 ${tries}번에 떡붕어가 안 나와 떡붕어를 바로 낚음`); W.__fishingDebug.catchNow(crucian.id); }
      h.check('떡붕어 낚음', !!h.st.dex[crucian.id], { tries });
      await h.wait(0.6);
      await h.snap('moonpond');
      h.check('catch{moonfish, 떡붕어}', h.ev('catch').some((e) => e.activity === 'moonfish' && e.species === crucian.id), h.ev('catch').slice(-3));
      // 반짝가루나방(잠자리채)
      const moth = h.sp('s_glitter_moth');
      const actors = S.actors().filter((a) => a.id.startsWith(`space:net:${moth.id}`) && a.ok);
      h.check('반짝가루나방이 있다', actors.length > 0, S.actors().filter((a) => a.id.startsWith('space:net')).slice(0, 3));
      if (actors[0]) { h.dl.teleport(actors[0].x + 1, actors[0].z + 1, actors[0].y + 0.5); S.use(actors[0].id); }
      await h.wait(0.6);
      h.check('반짝가루나방 채집', !!h.st.dex[moth.id], h.ev('collect').slice(-2));
      await h.snap('moth');
      // 월석(망치로 두드리기)
      S.go('field');
      await h.wait(0.3);
      const rock = S.actors().find((a) => a.id.startsWith('space:rock:') && a.ok);
      h.check('월석이 있다', !!rock, S.actors().filter((a) => a.id.startsWith('space:rock')));
      const mr0 = h.bag('m_moonrock');
      if (rock) { h.dl.teleport(rock.x + 1.2, rock.z + 1.2, rock.y + 0.3); S.use(rock.id); }
      h.check('월석 얻음', h.bag('m_moonrock') > mr0, h.ev('harvest').filter((e) => e.kind === 'moonrock'));
      h.check('harvest{moonrock}', h.ev('harvest').some((e) => e.kind === 'moonrock' && e.item === 'm_moonrock'), null);
      await h.wait(0.4);
      await h.snap('moonrock');
      // 귀환: 착륙장 로켓 E '지구로!'
      S.goPad();
      await h.wait(0.3);
      S.use('space:rocket');
      const back = await h.until(() => h.ev('arrive').find((e) => e.to === 'earth'), 6);
      h.check('arrive{earth}', !!back, h.ev('arrive'));
      h.check('지구 세계', h.game.world === 'earth', h.game.world);
      const pad = h.dl.places.PLACES.launchPad;
      const p = h.game.player.pos;
      h.check('발사대 앞에 내림', Math.hypot(p.x - pad.x, p.z - pad.z) < 60, { at: h.pos(), pad });
      // 월석 판매(지구 우주 보정 ×1.8)
      const n = h.bag('m_moonrock');
      const earth = E.priceOf('m_moonrock');
      const space = E.priceOf('m_moonrock', { where: 'space' });
      h.check('월석 지구 값 = 우주 값 ×1.8', space > 0 && Math.abs(earth / space - 1.8) < 0.02, { earth, space });
      h.goto('econ-shop');
      h.dl.game.interact('econ-shop');
      const c0 = h.coins();
      h.check('월석 팔기', E.sell('m_moonrock', n, 'quack') > 0 || h.coins() > c0, { n });
      const sale = h.ev('sell').find((e) => e.id === 'm_moonrock');
      // 같은 날 11개째부터는 포화로 −5%씩(4.4) — 앞 10개는 지구 값 그대로
      h.check('sell{m_moonrock} = 지구 값(앞 10개 그대로)', !!sale && sale.n === n && sale.coins === h.coins() - c0 && sale.coins >= earth * Math.min(n, 10) && sale.coins <= earth * n, { sale, earth, n });
      await h.wait(0.8);
      h.game.hud?.close?.();
      return { moonrock: n, earth, space, coins: h.coins() };
    },
  },
];
