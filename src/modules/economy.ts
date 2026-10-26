// economy — 재화·상점·제작·박물관·부탁·보물상자(GDD 3.1). game.econ 을 붙이고, 상자는 청크로 섬마다 흩뿌린다.
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import type { Species } from '../core/state';
import { PLACES } from '../core/world';
import { BASE, round10, MATERIALS, MAT, MATERIAL_SPECIES, SHOP_ITEMS, RECIPES, TIERS, PITY, type ChestTier } from './economy/data';
import { buildChestLayer, spawnChestFx, type LiveChest } from './economy/chests';

export const order = 9;

export interface EconFlags {
  stars: number; keys: Record<string, number>; unlocks: string[]; donated: Record<string, number>;
  pity: { epic: number; legend: number }; combo: number; opened: Record<string, ChestTier>;
  sold: Record<string, number>; soldDay: number; requestsDone: Record<string, number>; stamps: number;
}

export interface Request { id: string; species: Species; n: number; reward: number; stars: number; done: boolean }

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const st = game.state;
  st.register(MATERIAL_SPECIES);

  const q = new URLSearchParams(location.search);
  const F = (): EconFlags => {
    const f = (st.flags.econ ??= {}) as Partial<EconFlags>;
    f.stars ??= 0; f.keys ??= {}; f.unlocks ??= []; f.donated ??= {}; f.pity ??= { epic: 0, legend: 0 };
    f.combo ??= 0; f.opened ??= {}; f.sold ??= {}; f.soldDay ??= 0; f.requestsDone ??= {}; f.stamps ??= 0;
    return f as EconFlags;
  };
  if (q.get('cheat') === '1') {
    if (st.coins < 1_000_000) st.coins = 1_000_000;
    F().stars = 999;
    for (const m of MATERIALS) st.bag[m.id] = Math.max(st.bag[m.id] ?? 0, 99);
  }
  const p0 = q.get('p0') !== '0';
  const day = () => Math.floor(game.env?.day ?? 0);
  const emit = (type: string, extra: Record<string, unknown>) => st.emit({ type, ...extra });

  // ── 오늘의 시세
  let mk: { day: number; hot: string[]; mult: Record<string, number> } | null = null;
  const market = () => {
    const d = day();
    if (mk && mk.day === d && mk.hot.length) return mk;
    const r = ctx.rng(`market:${d}`);
    const pool = (cats: string[]) => [...st.species.values()].filter((s) => cats.includes(s.category));
    const hot: string[] = [];
    for (const cats of [['fish'], ['bug', 'insect'], ['sea', 'dino']]) {
      const p = pool(cats);
      if (p.length) hot.push(p[Math.floor(r() * p.length)].id);
    }
    const mult: Record<string, number> = {};
    for (const id of hot) mult[id] = 2;
    MATERIALS.forEach((m, i) => { mult[m.id] = 1 + 0.2 * Math.sin((d / 5) * Math.PI * 2 + i * 1.7); });
    mk = { day: d, hot, mult };
    return mk;
  };

  const priceOf = (id: string, size?: number, variant?: 'shiny' | 'crown' | 'tiny') => {
    const s = st.species.get(id);
    const m = MAT.get(id);
    let p = m ? m.price : s?.price ?? BASE[s?.rarity ?? 1] ?? 60;
    p *= market().mult[id] ?? 1;
    if (size && st.dex[id]?.best) p *= 0.85 + 0.3 * Math.min(1, size / Math.max(size, st.dex[id].best));
    if (variant === 'shiny') p *= 5; else if (variant === 'crown') p *= 3; else if (variant === 'tiny') p *= 0.8;
    // 판매 포화: 하루 10마리 넘으면 −5%씩(최저 50%)
    const f = F();
    if (f.soldDay !== day()) { f.sold = {}; f.soldDay = day(); }
    const over = Math.max(0, (f.sold[id] ?? 0) - 10);
    p *= Math.max(0.5, 1 - over * 0.05);
    return round10(p);
  };

  const sell = (id: string, n: number, shop = 'quack') => {
    n = Math.min(n, st.bag[id] ?? 0);
    if (n <= 0) return 0;
    let total = 0;
    const f = F();
    for (let i = 0; i < n; i++) { total += priceOf(id); f.sold[id] = (f.sold[id] ?? 0) + 1; }
    st.addItem(id, -n);
    st.addCoins(total, 'sell');
    emit('sell', { id, n, coins: total, shop });
    return total;
  };

  const buy = (shopItemId: string) => {
    const it = SHOP_ITEMS.find((s) => s.id === shopItemId);
    if (!it) return false;
    const cost = p0 ? Math.round(it.price / 5) : it.price;
    if (st.coins < cost) { game.ui.toast('코인이 모자라요… 🥲'); return false; }
    st.addCoins(-cost, 'buy');
    for (const [k, v] of Object.entries(it.gives)) st.addItem(k, v);
    emit('buy', { id: shopItemId, n: 1, coins: -cost });
    return true;
  };

  const canCraft = (rid: string) => {
    const r = RECIPES.find((x) => x.id === rid);
    return !!r && Object.entries(r.needs).every(([k, v]) => st.has(k, v));
  };
  const craft = (rid: string) => {
    const r = RECIPES.find((x) => x.id === rid);
    if (!r || !canCraft(rid)) return false;
    for (const [k, v] of Object.entries(r.needs)) st.addItem(k, -v);
    st.addItem(r.gives, 1);
    emit('craft', { id: rid, n: 1, coins: 0 });
    return true;
  };

  const isDonated = (id: string) => !!F().donated[id];
  const donate = (id: string) => {
    const s = st.species.get(id);
    if (!s || s.category === 'item' || isDonated(id) || !st.has(id)) return false;
    const f = F();
    st.addItem(id, -1);
    f.donated[id] = Date.now();
    f.stamps++;
    const coins = 100 * s.rarity * s.rarity;
    st.addCoins(coins, 'donate');
    addStars(s.rarity >= 4 ? 3 : 1, 'donate');
    emit('donate', { id, n: 1, coins });
    return true;
  };

  const addStars = (n: number, why: string) => { F().stars += n; st.save(); emit('stars', { delta: n, why }); };
  const isUnlocked = (key: string) => F().unlocks.includes(key) || q.get('cheat') === '1';
  const unlock = (key: string) => { const f = F(); if (!f.unlocks.includes(key)) { f.unlocks.push(key); st.save(); emit('unlock', { key }); } };

  // 잡기 확률(5.2 간이) — 콤보·천장 포함
  const rollCatch = (qr: { pool?: Species[]; activity?: string; luck?: number }) => {
    const pool = qr.pool ?? [];
    if (!pool.length) return { species: null, combo: F().combo };
    const r = ctx.rng(`roll:${game.time.toFixed(3)}:${F().combo}:${Object.keys(st.dex).length}`);
    const f = F();
    const luck = (qr.luck ?? 1) * (1 + Math.min(10, f.combo) * 0.05);
    const w = pool.map((s) => Math.pow(0.42, s.rarity - 1) * (s.rarity >= 3 ? luck : 1));
    const sum = w.reduce((a, b) => a + b, 0);
    let x = r() * sum, pick = pool[0];
    for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) { pick = pool[i]; break; } }
    f.combo++;
    return { species: pick, combo: f.combo, variant: r() < 1 / 256 ? 'shiny' : undefined };
  };
  st.on((e) => { if (e.type === 'catch-fail') F().combo = 0; });

  // 보물상자
  const rollTier = (): ChestTier => {
    const f = F();
    f.pity.epic++; f.pity.legend++;
    const r = ctx.rng(`chest:${f.pity.legend}:${Object.keys(f.opened).length}:${st.coins}`);
    let tier: ChestTier = 'common';
    if (f.pity.legend >= PITY.legend) tier = 'legend';
    else if (f.pity.epic >= PITY.epic) tier = 'epic';
    else {
      const tot = Object.values(TIERS).reduce((a, t) => a + t.weight, 0);
      let x = r() * tot;
      for (const [k, t] of Object.entries(TIERS) as Array<[ChestTier, typeof TIERS.common]>) { x -= t.weight; if (x <= 0) { tier = k; break; } }
    }
    if (tier === 'legend') { f.pity.legend = 0; f.pity.epic = 0; }
    else if (tier === 'epic') f.pity.epic = 0;
    return tier;
  };

  const openChest = (tier?: ChestTier, where = '') => {
    const t = tier ?? rollTier();
    const T = TIERS[t];
    const r = ctx.rng(`loot:${where}:${t}`);
    const coins = round10(T.coins[0] + r() * (T.coins[1] - T.coins[0]));
    const loot: Array<{ id: string; n: number; name: string }> = [{ id: 'coins', n: coins, name: '도파코인' }];
    st.addCoins(coins, 'chest');
    const mats = MATERIALS.filter((m) => (t === 'common' ? m.price < 200 : t === 'rare' ? m.price < 800 : true));
    for (let i = 0; i < T.mats; i++) {
      const m = mats[Math.floor(r() * mats.length)];
      const n = 1 + Math.floor(r() * (t === 'common' ? 3 : 2));
      st.addItem(m.id, n);
      loot.push({ id: m.id, n, name: m.name });
    }
    if (T.stars) { addStars(T.stars, 'chest'); loot.push({ id: 'stars', n: T.stars, name: '반짝별' }); }
    emit('chest-loot', { tier: t, loot, at: where });
    return { tier: t, loot };
  };

  // ── 주민 부탁(게시판)
  let reqCache: { day: number; list: Request[] } | null = null;
  const requests = () => {
    const d = day();
    if (reqCache && reqCache.day === d && reqCache.list.length) {
      for (const rq of reqCache.list) rq.done = !!F().requestsDone[rq.id];
      return reqCache.list;
    }
    const r = ctx.rng(`req:${d}`);
    const pool = [...st.species.values()].filter((s) => s.category !== 'item' && s.rarity <= 3);
    const list: Request[] = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const s = pool.splice(Math.floor(r() * pool.length), 1)[0];
      const n = s.rarity >= 3 ? 1 : 1 + Math.floor(r() * 2);
      const id = `req:${d}:${s.id}`;
      list.push({ id, species: s, n, reward: round10((s.price ?? BASE[s.rarity]) * n * 1.6 + 100), stars: s.rarity, done: !!F().requestsDone[id] });
    }
    reqCache = { day: d, list };
    return list;
  };
  const fulfill = (rid: string) => {
    const rq = requests().find((x) => x.id === rid);
    if (!rq || rq.done || !st.has(rq.species.id, rq.n)) return false;
    st.addItem(rq.species.id, -rq.n);
    st.addCoins(rq.reward, 'request');
    addStars(rq.stars, 'request');
    F().requestsDone[rid] = Date.now();
    rq.done = true;
    emit('request-done', { id: rid, coins: rq.reward });
    return true;
  };

  const econ = {
    priceOf, sell, buy, canCraft, craft, donate, isDonated, isUnlocked, unlock, rollCatch, openChest, addStars, market,
    requests, fulfill,
    get stars() { return F().stars; },
    get stamps() { return F().stamps; },
    flags: F,
    p0,
    shopPrice: (id: string) => { const it = SHOP_ITEMS.find((s) => s.id === id); return it ? (p0 ? Math.round(it.price / 5) : it.price) : 0; },
  };
  game.econ = econ;

  // ── 마을 시설(E): 상점·박물관·작업대·게시판 → HUD 가 창을 연다
  const placeY = (x: number, z: number) => new THREE.Vector3(x, ctx.island.heightAt(x, z), z);
  const facility = (id: string, place: { x: number; z: number }, label: string, ev: string, extra: Record<string, unknown> = {}) => {
    const pos = placeY(place.x, place.z);
    game.addInteractable({ id: `econ-${id}`, position: () => pos, radius: 4.2, label, onUse: () => emit(ev, extra) });
  };
  facility('shop', PLACES.shop, '꽥꽥상회 들르기', 'open-shop', { shop: 'quack' });
  facility('museum', PLACES.museum, '박물관 기증하기', 'open-museum');
  facility('workbench', PLACES.workbench, '작업대에서 만들기', 'open-craft');
  facility('board', PLACES.townBoard, '게시판 보기', 'open-board');

  // ── 보물상자 청크
  const live = new Map<string, LiveChest>();
  const root = new THREE.Group();
  root.name = 'economy';
  buildChestLayer(ctx, game, live, (key) => F().opened[key]);

  game.addProvider('econ-chest', (p) => {
    let best: LiveChest | null = null, bd = 3.4;
    for (const c of live.values()) {
      if (c.opened) continue;
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d < bd && Math.abs(c.y - p.pos.y) < 3) { bd = d; best = c; }
    }
    if (!best) return null;
    const c = best;
    return { label: '보물상자 열기', dist: bd, use: () => openLive(c) };
  });

  const openLive = (c: LiveChest) => {
    c.opened = true;
    c.hide();
    const res = openChest(undefined, c.key);
    F().opened[c.key] = res.tier;
    st.save();
    spawnChestFx(game, root, new THREE.Vector3(c.x, c.y, c.z), res.tier, c.rotY);
    emit('chest-open', { tier: res.tier, at: c.key, loot: res.loot });
  };
  (econ as Record<string, unknown>).openNearest = () => {
    let best: LiveChest | null = null, bd = Infinity;
    for (const c of live.values()) {
      if (c.opened) continue;
      const d = Math.hypot(c.x - game.player.pos.x, c.z - game.player.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) openLive(best);
    return best;
  };
  (econ as Record<string, unknown>).chests = live;
  /** 촬영·테스트: 플레이어 앞에 상자 열기 연출 */
  (econ as Record<string, unknown>).demoChest = (tier: ChestTier = 'legend', ahead = 5) => {
    const p = game.player.pos, f = new THREE.Vector3();
    ctx.camera.getWorldDirection(f); f.y = 0; f.normalize();
    const x = p.x + f.x * ahead, z = p.z + f.z * ahead;
    const res = openChest(tier, 'demo');
    spawnChestFx(game, root, new THREE.Vector3(x, ctx.island.heightAt(x, z), z), tier, 0);
    emit('chest-open', { tier, at: 'demo', loot: res.loot });
  };
  return root;
}

