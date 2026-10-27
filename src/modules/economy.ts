// economy — 재화·가방·해금·상점·제작·박물관·시세·잡기 굴림·부탁·보물상자(GDD 4장·5.2·6.1, 계약 v2 6장). game.econ 을 붙인다.
// 돈·반짝별·열쇠·해금은 여기서만 바꾼다. 순수 계산은 economy/{progression,bag,price,currency,roll}.ts 에 있다.
// 저장: flags.econ(아래 EconFlags) — 바꿀 때마다 state.save()(코어가 묶어 쓴다).
// 디버그: window.__econ { give, unlock, state(), … }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Species } from '../core/state';
import { PLACES } from '../core/world';
import {
  splitVariant, type Activity, type Cost, type EconApi, type KeyColor, type RollEnv as ApiRollEnv, type RollQuery as ApiRollQuery,
  type RollResult, type SellWhere, type ShopItem as ApiShopItem, type Recipe as ApiRecipe, type Variant, type PityInfo,
} from '../core/api';
import {
  BASE, round10, MATERIALS, MATERIAL_SPECIES, SHOP_ITEMS, SHOP, RECIPES, TIERS, PITY, ANY_NEEDS, ROCKET_PARTS, NAV_CHIP,
  START_UNLOCKS, STARTER_KIT, P0_OPEN_KEYS, LEGACY_ITEMS, costOf, needsOf, recipeById, recipeGateOf, shopGateOf, anyMatches, itemDef,
  type ChestTier, type ShopItem, type Recipe,
} from './economy/data';
import { buildChestLayer, spawnChestFx, type LiveChest } from './economy/chests';
import {
  rollCatch as rollPure, commitCatch, catchFail as failPure, newRollState, PITY as ROLL_PITY,
  type RollState, type RollQuery as PureQuery, type RollEnv as PureEnv,
} from './economy/roll';
import { canLaunch, canMount, gateCheck, islandsVisited, visitedIslands, navChipNeed, requirementText, rocketStatus, type GateEnv, type GateResult } from './economy/progression';
import { bagSize, beltOf, isTool, stackMaxOf, usedSlots, addableCount, canAddTo, canAddAll, type BagRules } from './economy/bag';
import { unitPrice, unsellable, materialWave, rotatePick, HOT_MULT, type PriceSpecies } from './economy/price';
import {
  KEY_COLORS, PIECES_PER_KEY, KEY_NAME, KEY_ICON, normalizeKeys, keysFromPieces, canAffordWith, shortfallText, needsText,
  firstDexStars, donateStars, shinyFirstStars, donateCoins, obtainEffect, isKeyColor,
} from './economy/currency';

export const order = 9;

/** flags.econ — economy 혼자 쓴다 */
export interface EconFlags {
  stars: number;
  stamps: number;
  /** 열쇠 조각 수(3조각 = 열쇠 1) */
  keys: Record<KeyColor, number>;
  unlocks: string[];
  /** 기증한 종 → 시각 */
  donated: Record<string, number>;
  /** 잡기 굴림 상태(천장·콤보·오늘 첫 잡기·굴림 수) */
  roll: RollState;
  /** 보물상자 천장(epic·legend 까지 남은 수) */
  pity: { epic: number; legend: number };
  /** 연 보물상자 칸 → 등급 */
  opened: Record<string, ChestTier>;
  /** 오늘 판 수(종 id → 마리) — soldDay 가 바뀌면 비운다 */
  sold: Record<string, number>;
  soldDay: number;
  requestsDone: Record<string, number>;
  /** cond 조건 카운터(fish·bug·balloon·wish·visit_<섬>) */
  counters: Record<string, number>;
  /** 반짝이 첫 등록 반짝별을 받은 종 */
  shinySeen: Record<string, number>;
  /** 시작 도구를 받았나 */
  kit: boolean;
}

export interface Request { id: string; species: Species; n: number; reward: number; stars: number; done: boolean }

type PriceOpts = { size?: number; variant?: Variant; where?: SellWhere };
type RollQ = ApiRollQuery & Pick<PureQuery, 'commit' | 'place'>;

/** 기증 범주 → 박물관 동 */
const WING_OF: Record<string, string> = { fish: 'wing:aquarium', bug: 'wing:bug', insect: 'wing:bug', fossil: 'wing:fossil', sea: 'wing:sea', space: 'wing:astro' };
/** 계약 상자 등급(wood·silver·gold·rainbow·space) → 지금 상자 표(common·rare·epic·legend). wave 3 에서 새 표로 바뀐다 */
const TIER_ALIAS: Record<string, ChestTier> = { wood: 'common', silver: 'rare', gold: 'epic', rainbow: 'legend', space: 'legend', common: 'common', rare: 'rare', epic: 'epic', legend: 'legend' };
/** 활동 → cond 카운터 */
const ACT_COUNTER: Record<string, string> = { fish: 'fish', moonfish: 'fish', bug: 'bug', insect: 'bug' };
/** 종 범주 → 활동(reportCatch 에 활동이 안 붙어 왔을 때) */
const ACT_OF_CAT: Record<string, Activity> = { fish: 'fish', bug: 'bug', insect: 'bug', sea: 'dive', space: 'space' };
/** 디버그 굴림(__econ.roll)이 고르는 종 분류 — 활동마다 */
const DEBUG_ROLL_CATS: Record<Activity, string[]> = { fish: ['fish'], moonfish: ['fish'], bug: ['bug', 'insect'], dive: ['sea'], space: ['space'] };

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const st = game.state;
  st.register(MATERIAL_SPECIES);

  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const cheat = q.get('cheat') === '1';
  const p0 = q.get('p0') !== '0';
  /** 저장에 economy 칸이 아예 없었다 = 새 저장 */
  const fresh = !st.flags.econ || typeof st.flags.econ !== 'object';

  const F = (): EconFlags => {
    const f = ((st.flags.econ && typeof st.flags.econ === 'object') ? st.flags.econ : (st.flags.econ = {})) as Partial<EconFlags> & { combo?: number };
    f.stars ??= 0; f.stamps ??= 0; f.unlocks ??= []; f.donated ??= {}; f.pity ??= { epic: 0, legend: 0 };
    f.opened ??= {}; f.sold ??= {}; f.soldDay ??= -1; f.requestsDone ??= {}; f.counters ??= {}; f.shinySeen ??= {}; f.kit ??= false;
    if (!f.keys || typeof f.keys !== 'object' || KEY_COLORS.some((c) => typeof f.keys![c] !== 'number')) f.keys = normalizeKeys(f.keys);
    if (!f.roll || typeof f.roll !== 'object') {
      f.roll = newRollState();
      // 예전 저장의 콤보는 굴림 상태로 옮긴다
      if (typeof f.combo === 'number') { f.roll.combo = f.combo; delete f.combo; }
    }
    return f as EconFlags;
  };
  const save = () => st.save();
  const emit = (type: string, extra: Record<string, unknown> = {}) => st.emit({ type, ...extra });
  const toast = (t: string) => { try { game.ui.toast(t); } catch { /* UI 가 없는 환경 */ } };

  // ── 해금 ──
  const p0Open = new Set(p0 ? P0_OPEN_KEYS : []);
  /** 진짜로 열렸나(치트 빼고) — '이미 가지고 있어요' 판정용 */
  const hasKey = (key: string) => F().unlocks.includes(key) || p0Open.has(key);
  const isUnlocked = (key: string) => cheat || hasKey(key);
  const unlock = (key: string, why = '') => {
    if (!key) return;
    const f = F();
    if (f.unlocks.includes(key)) return;
    f.unlocks.push(key);
    save();
    emit('unlock', { key, why });
  };
  /** 도구를 얻으면 그 도구 키도 */
  const toolKey = (id: string) => (isTool(id) ? `tool:${splitVariant(id).id.slice(5)}` : null);

  // ── 날짜·시세 캐시 ──
  const day = () => Math.floor(game.env?.day ?? 0);
  let mk: { day: number; hot: string[]; mult: Record<string, number> } | null = null;
  let reqCache: { day: number; list: Request[] } | null = null;
  let seenDay = day();
  /** 날이 바뀌었으면 시세·부탁·판매 포화를 새로 */
  const ensureDay = (force = false) => {
    const d = day();
    const f = F();
    if (force || d !== seenDay) { mk = null; reqCache = null; seenDay = d; }
    // 시계(env)가 아직 없으면(경제가 날씨보다 먼저 지어진다) 저장된 판매 포화를 건드리지 않는다 —
    // 새로고침으로 포화를 피하지 못하게. env 가 붙으면 onUpdate 가 날짜를 다시 본다
    if (!game.env) return;
    if (f.soldDay !== d) { f.sold = {}; f.soldDay = d; }
  };

  // ── 반짝별·열쇠 ──
  const addStars = (n: number, why = '') => {
    if (!(n > 0)) return;
    F().stars += Math.round(n);
    save();
    emit('stars', { delta: Math.round(n), why });
  };
  const spendStars = (n: number, why = '') => {
    const f = F();
    n = Math.round(n);
    if (n <= 0) return true;
    if (f.stars < n) return false;
    f.stars -= n;
    save();
    emit('stars', { delta: -n, why });
    return true;
  };
  const addKeyPiece = (color: KeyColor, n = 1) => {
    if (!isKeyColor(color) || !(n > 0)) return;
    const f = F();
    const before = keysFromPieces(f.keys[color]);
    f.keys[color] += Math.floor(n);
    save();
    emit('keys', { color, delta: Math.floor(n), pieces: f.keys[color] });
    if (keysFromPieces(f.keys[color]) > before) toast(`${KEY_ICON[color]} ${KEY_NAME[color]} 완성! 조각 ${PIECES_PER_KEY}개가 모였어요`);
  };
  const keyCount = (color: KeyColor) => keysFromPieces(F().keys[color] ?? 0);
  const useKey = (color: KeyColor) => {
    if (keyCount(color) < 1) return false;
    F().keys[color] -= PIECES_PER_KEY;
    save();
    emit('keys', { color, delta: -PIECES_PER_KEY, pieces: F().keys[color] });
    return true;
  };

  // ── 비용 ──
  const wallet = () => ({ coins: st.coins, stars: F().stars, has: (id: string, n: number) => st.has(id, n) });
  const canAfford = (c: Cost | undefined) => canAffordWith(c, wallet());
  const spend = (c: Cost | undefined, why = '') => {
    if (!c) return true;
    if (!canAfford(c)) return false;
    if (c.coins) st.addCoins(-c.coins, why);
    if (c.stars) spendStars(c.stars, why);
    for (const [k, v] of Object.entries(c.items ?? {})) if (v > 0) st.addItem(k, -v);
    save();
    return true;
  };

  // ── 가방 ──
  const rules = (): BagRules => ({
    size: cheat ? 999 : bagSize(isUnlocked),
    speciesOf: (id) => st.species.get(id),
    passThrough: (id) => !!obtainEffect(splitVariant(id).id),
  });
  st.canAdd = (id, n) => canAddTo(st.bag, id, n, rules());
  let fullAt = -Infinity;
  /** '가방이 꽉 찼어요!' — 한꺼번에 쏟아지지 않게 1.5초에 한 번 */
  const fullToast = () => {
    const t = game.time ?? 0;
    if (t - fullAt < 1.5 && t >= fullAt) return;
    fullAt = t;
    toast('가방이 꽉 찼어요! 🎒');
  };
  const bag = {
    get size() { return rules().size; },
    get used() { return usedSlots(st.bag, rules()); },
    get free() { const r = rules(); return Math.max(0, r.size - usedSlots(st.bag, r)); },
    canAdd: (id: string, n = 1) => canAddTo(st.bag, id, n, rules()),
    stackMax: (id: string) => stackMaxOf(id, (x) => st.species.get(x)),
    isTool,
    belt: () => beltOf(st.bag),
  };

  /** 아이템을 가방 규칙대로 넣는다 — 넣은 수를 돌려준다. 탈것·로켓 옛 아이템은 해금으로, 녹슨 열쇠는 은열쇠 조각으로 */
  const give = (id: string, n = 1, why = '', o: { silent?: boolean } = {}): number => {
    n = Math.floor(n);
    if (!id || !(n > 0)) return 0;
    const base = splitVariant(id).id;
    const legacy = LEGACY_ITEMS[base] ?? (base.startsWith('v_') ? `v:${base.slice(2)}` : null);
    if (legacy) { unlock(legacy, why || 'give'); return n; }
    const fx = obtainEffect(base);
    if (fx) {
      addKeyPiece(fx.color, n);
      if (!o.silent) toast(`${KEY_ICON[fx.color]} ${KEY_NAME[fx.color]} 조각 +${n}`);
      return n;
    }
    // 이미 가진 도구는 하나만 — 가방이 꽉 찬 게 아니다
    if (isTool(id) && st.has(id)) {
      if (!o.silent) toast('이미 가지고 있어요! ✨');
      return 0;
    }
    const k = addableCount(st.bag, id, n, rules());
    if (k > 0) {
      st.addItem(id, k);
      const tk = toolKey(id);
      if (tk) unlock(tk, why || 'give');
    }
    if (k < n) { fullToast(); emit('bag-full', { id }); }
    return k;
  };

  // ── 조건 카운터 ──
  const homeDexPct = () => {
    let got = 0, total = 0;
    for (const s of st.species.values()) {
      if (s.category === 'item' || s.p1) continue;
      if (!s.where?.some((w) => w.island === 'home')) continue;
      total++;
      if (st.dex[s.id]) got++;
    }
    return total ? (got / total) * 100 : 0;
  };
  const counter = (name: string): number => {
    if (name === 'islands') return islandsVisited(st.flags);
    if (name === 'homeDex') return homeDexPct();
    if (name === 'parts') return rocketStatus(isUnlocked).count;
    if (name.startsWith('visit_')) return visitedIslands(st.flags).includes(name.slice(6)) ? 1 : 0;
    return F().counters[name] ?? 0;
  };
  const bump = (name: string, n = 1) => { const c = F().counters; c[name] = (c[name] ?? 0) + n; save(); };
  const gateEnv: GateEnv = { isUnlocked, counter, p0 };

  // ── 제작 ──
  /** 재료 칸 채우기 — 정해진 재료 먼저, 'any:*' 칸은 조건에 맞는 가방 물건으로(변이 개체·벨트 도구는 쓰지 않는다, 흔한 것부터) */
  const planNeeds = (needs: Record<string, number>) => {
    const take: Record<string, number> = {};
    const left = (id: string) => (st.bag[id] ?? 0) - (take[id] ?? 0);
    for (const [k, v] of Object.entries(needs)) {
      if (k.startsWith('any:')) continue;
      if (left(k) < v) return null;
      take[k] = (take[k] ?? 0) + v;
    }
    const keys = Object.keys(st.bag).filter((id) => !id.includes('@') && !isTool(id)).sort((a, b) => {
      const ra = st.species.get(a)?.rarity ?? 1, rb = st.species.get(b)?.rarity ?? 1;
      return ra - rb || a.localeCompare(b);
    });
    const info = (id: string) => { const s = st.species.get(id); return { id, category: s?.category, rarity: s?.rarity, tags: s?.tags ?? itemDef(id)?.tags }; };
    for (const [k, v] of Object.entries(needs)) {
      if (!k.startsWith('any:')) continue;
      const a = ANY_NEEDS[k];
      const usable = (id: string) => Math.max(0, left(id) - (a?.dupOnly ? 1 : 0));
      const ok = keys.filter((id) => usable(id) > 0 && anyMatches(k, info(id)));
      if (a?.same) {
        // 전부 같은 종에서
        const one = ok.find((id) => usable(id) >= v);
        if (!one) return null;
        take[one] = (take[one] ?? 0) + v;
        continue;
      }
      let n = v;
      for (const id of ok) {
        if (n <= 0) break;
        const use = Math.min(n, usable(id));
        take[id] = (take[id] ?? 0) + use; n -= use;
      }
      if (n > 0) return null;
    }
    return take;
  };
  const nameOf = (id: string) => st.species.get(id)?.name ?? itemDef(id)?.name ?? ANY_NEEDS[id]?.name ?? id;
  /** 만들 수 있나 + 안 되면 왜 */
  const craftCheck = (rid: string): GateResult & { take?: Record<string, number>; recipe?: Recipe } => {
    const r = recipeById(rid);
    if (!r) return { ok: false, why: '그런 레시피는 없어요 🤔' };
    const g = gateCheck(recipeGateOf(r, p0), gateEnv, r.id);
    if (!g.ok) return { ...g, recipe: r };
    const gives = Object.keys(r.gives);
    if (r.unlock && hasKey(r.unlock) && !gives.length) return { ok: false, why: '이미 만들었어요! ✨', recipe: r };
    if (gives.some((id) => isTool(id) && st.has(id))) return { ok: false, why: '이미 가지고 있어요! ✨', recipe: r };
    const needs = needsOf(r, p0);
    const take = planNeeds(needs);
    if (!take) {
      const miss = Object.fromEntries(Object.entries(needs).filter(([k, v]) => k.startsWith('any:') || (st.bag[k] ?? 0) < v));
      return { ok: false, why: `재료가 모자라요… ${needsText(miss, nameOf)} 🧺`, recipe: r };
    }
    const after = { ...st.bag };
    for (const [k, v] of Object.entries(take)) { after[k] = (after[k] ?? 0) - v; if (after[k] <= 0) delete after[k]; }
    if (!canAddAll(after, r.gives, rules())) return { ok: false, why: '가방이 꽉 찼어요! 🎒', recipe: r };
    return { ok: true, take, recipe: r };
  };
  const canCraft = (rid: string) => craftCheck(rid).ok;
  const craft = (rid: string) => {
    const c = craftCheck(rid);
    if (!c.ok || !c.take || !c.recipe) { if (c.why) toast(c.why); return false; }
    const r = c.recipe;
    for (const [k, v] of Object.entries(c.take)) st.addItem(k, -v);
    for (const [k, v] of Object.entries(r.gives)) give(k, v, 'craft', { silent: true });
    if (r.unlock) unlock(r.unlock, 'craft');
    const gives = Object.keys(r.gives)[0] ?? r.unlock ?? '';
    emit('craft', { id: r.id, gives, n: Object.values(r.gives)[0] ?? 1 });
    save();
    return true;
  };

  // ── 상점 ──
  const shopItems = (shop: string): ShopItem[] => SHOP_ITEMS.filter((s) => s.shop === shop);
  const shopCost = (id: string): Cost => { const it = SHOP.get(id); return it ? costOf(it, p0) : {}; };
  const canBuy = (id: string): GateResult => {
    const it = SHOP.get(id);
    if (!it) return { ok: false, why: '그런 물건은 없어요 🤔' };
    if (it.p1) return { ok: false, why: '곧 만나요! 아직 준비 중이에요 🛠️' };
    const gives = Object.keys(it.gives);
    if (it.once && it.unlock && hasKey(it.unlock)) return { ok: false, why: '이미 가지고 있어요! ✨' };
    if (gives.some((g) => isTool(g) && st.has(g))) return { ok: false, why: '이미 가지고 있어요! ✨' };
    if (it.seq && it.seq > 1) {
      const prev = SHOP_ITEMS.find((s) => s.shop === it.shop && s.kind === it.kind && s.seq === it.seq! - 1);
      if (prev?.unlock && !isUnlocked(prev.unlock)) return { ok: false, why: '앞 단계를 먼저 사요 🎒' };
    }
    const g = gateCheck(shopGateOf(it, p0), gateEnv);
    if (!g.ok) return g;
    const cost = costOf(it, p0);
    const short = shortfallText(cost, wallet(), nameOf);
    if (short) return { ok: false, why: short };
    if (!canAddAll(st.bag, it.gives, rules())) return { ok: false, why: '가방이 꽉 찼어요! 🎒' };
    return { ok: true };
  };
  const buy = (id: string) => {
    const c = canBuy(id);
    if (!c.ok) { if (c.why) toast(c.why); return false; }
    const it = SHOP.get(id)!;
    const cost = costOf(it, p0);
    if (!spend(cost, 'buy')) return false;
    for (const [k, v] of Object.entries(it.gives)) give(k, v, 'buy', { silent: true });
    if (it.unlock) unlock(it.unlock, 'buy');
    emit('buy', { id, n: 1, cost, coins: -(cost.coins ?? 0) });
    save();
    return true;
  };

  // ── 박물관 ──
  const isDonated = (id: string) => !!F().donated[splitVariant(id).id];
  /** 가방에서 기증에 쓸 키(보통 개체 먼저, 없으면 변이 개체) */
  const donateKey = (id: string) => {
    if (st.has(id)) return id;
    return Object.keys(st.bag).find((k) => (st.bag[k] ?? 0) > 0 && splitVariant(k).id === id) ?? null;
  };
  const donateCheck = (raw: string): GateResult => {
    const id = splitVariant(raw).id;
    const s = st.species.get(id);
    if (!s || s.category === 'item') return { ok: false, why: '이건 기증할 수 없어요 🙅' };
    if (s.category === 'dino') return { ok: false, why: '공룡 친구는 기증 대신 친해져요 🦕' };
    if (isDonated(id)) return { ok: false, why: '이미 기증했어요! 🏛️' };
    const wing = WING_OF[s.category];
    if (wing && !isUnlocked(wing)) return { ok: false, why: '박물관 증축이 필요해요 🏛️' };
    if (!donateKey(id)) return { ok: false, why: '가방에 없어요 🎒' };
    return { ok: true };
  };
  const zodiacDonated = () => {
    let n = 0;
    for (const id of Object.keys(F().donated)) if (st.species.get(id)?.tags?.includes(NAV_CHIP.tag)) n++;
    return n;
  };
  /** 별자리 물고기를 충분히 기증했으면 항법 칩 */
  const checkNavChip = () => {
    if (hasKey(NAV_CHIP.key)) return;
    if (zodiacDonated() >= navChipNeed(p0)) {
      unlock(NAV_CHIP.key, 'donate');
      toast('📡 항법 칩 완성! 로켓 부품이 하나 늘었어요');
    }
  };
  const donate = (raw: string) => {
    const c = donateCheck(raw);
    if (!c.ok) { if (c.why) toast(c.why); return false; }
    const id = splitVariant(raw).id;
    const s = st.species.get(id)!;
    const key = donateKey(id)!;
    const f = F();
    st.addItem(key, -1);
    f.donated[id] = Date.now();
    f.stamps++;
    const coins = donateCoins(s.rarity);
    const stars = donateStars(s.rarity);
    st.addCoins(coins, 'donate');
    addStars(stars, 'donate');
    emit('donate', { id, n: 1, coins, stars });
    if (s.tags?.includes(NAV_CHIP.tag)) checkNavChip();
    save();
    return true;
  };

  // ── 오늘의 시세 ──
  const market = () => {
    ensureDay();
    const d = day();
    if (mk && mk.day === d) return mk;
    const all = [...st.species.values()].filter((s) => !s.p1 && s.category !== 'item');
    const hot: string[] = [];
    // 물고기 1 · 곤충 1 · 바다/공룡섬 1 — 날마다 돌아가며(어제와 같은 종은 안 나온다)
    for (const [gi, cats] of [['fish'], ['bug', 'insect'], ['sea', 'dino']].entries()) {
      const pool = all.filter((s) => cats.includes(s.category)).map((s) => s.id).sort();
      if (!pool.length) continue;
      const i = rotatePick(pool.length, d, (b) => ctx.rng(`market:${gi}:${b}`));
      hot.push(pool[i]);
    }
    const mult: Record<string, number> = {};
    for (const id of hot) mult[id] = HOT_MULT;
    MATERIALS.forEach((m, i) => { if (!m.noSell) mult[m.id] = materialWave(d, i); });
    mk = { day: d, hot, mult };
    return mk;
  };

  // ── 가격 ──
  const FAR_SEA = new Set(['offshore', 'deep', 'trench']);
  /** 지금 파는 곳(플레이어 자리) */
  const here = (): { where: SellWhere; island: string | null } => {
    if (game.world === 'space') return { where: 'space', island: 'moon' };
    const p = game.player?.pos;
    if (!p) return { where: 'home', island: 'home' };
    const z = game.geo?.zoneAt(p.x, p.z);
    let island = z ? z.island : null;
    if (!z) { try { island = ctx.island.islandAt?.(p.x, p.z)?.id ?? 'home'; } catch { island = 'home'; } }
    if (z?.sea && FAR_SEA.has(z.sea)) return { where: 'farsea', island };
    return { where: !island || island === 'home' ? 'home' : 'island', island };
  };
  const priceSpecies = (id: string): PriceSpecies | undefined => st.species.get(id) as PriceSpecies | undefined;
  /** 판매가 한 개. priceOf(id, {size, variant, where}) — 예전 모양 priceOf(id, size, variant) 도 받는다 */
  const priceOf = (raw: string, o?: PriceOpts | number, legacyVariant?: Variant) => {
    const opt: PriceOpts = typeof o === 'number' ? { size: o, variant: legacyVariant } : o ?? {};
    ensureDay();
    const { id } = splitVariant(raw);
    const h = opt.where ? { where: opt.where, island: here().island } : here();
    return unitPrice({
      id: raw, species: priceSpecies(id), size: opt.size, best: st.dex[id]?.best, variant: opt.variant,
      where: h.where, island: h.island, market: market().mult[id] ?? 1, soldBefore: F().sold[id] ?? 0,
    });
  };
  const sell = (raw: string, n = 1, shop = 'quack') => {
    n = Math.min(Math.floor(n), st.bag[raw] ?? 0);
    if (n <= 0) return 0;
    const { id } = splitVariant(raw);
    if (unsellable(raw, priceSpecies(id))) { toast('이건 팔 수 없어요 🙅'); return 0; }
    ensureDay();
    const f = F();
    const h = here();
    const sp = priceSpecies(id), mult = market().mult[id] ?? 1, best = st.dex[id]?.best;
    let total = 0;
    for (let i = 0; i < n; i++) {
      total += unitPrice({ id: raw, species: sp, best, where: h.where, island: h.island, market: mult, soldBefore: (f.sold[id] ?? 0) + i });
    }
    f.sold[id] = (f.sold[id] ?? 0) + n;
    st.addItem(raw, -n);
    st.addCoins(total, 'sell');
    emit('sell', { id: raw, n, coins: total, shop });
    save();
    return total;
  };
  /** 한꺼번에 팔기 — ids 를 안 주면 가방의 생물 전부 + 쓰레기(재료·도구·잡동사니는 남긴다) */
  const sellAll = (ids?: string[], shop = 'quack') => {
    const list = ids ?? Object.keys(st.bag).filter((k) => {
      const { id } = splitVariant(k);
      const s = st.species.get(id);
      if (unsellable(k, s as PriceSpecies | undefined)) return false;
      return (!!s && s.category !== 'item') || (itemDef(id)?.tags.includes('junk') ?? false);
    });
    let total = 0;
    for (const k of list) total += sell(k, st.bag[k] ?? 0, shop);
    return total;
  };

  // ── 잡기 굴림 ──
  const committed = new WeakSet<object>();
  const actOf = new WeakMap<object, Activity>();
  const boosts = (): Record<string, number> | undefined => {
    try {
      const b = game.ext?.calendar?.boosts?.();
      return b && typeof b === 'object' ? b as Record<string, number> : undefined;
    } catch { return undefined; }
  };
  const rollEnv = (): ApiRollEnv & PureEnv => ({
    day: day(),
    hour: game.env?.hour ?? 12,
    tod: game.env?.tod ?? 'day',
    weather: game.env?.weather ?? 'clear',
    p0,
    guestId: (econ as Partial<EconApi>).guest?.()?.id,
    boostTags: boosts(),
    isUnlocked,
    rng: (k: string) => ctx.rng(k),
  });
  const rollCatch = (qr: RollQ): RollResult => {
    const res = rollPure(qr as unknown as PureQuery, F().roll, rollEnv()) as RollResult;
    actOf.set(res, qr.activity);
    if (qr.commit !== false && res.species) committed.add(res);
    save();
    return res;
  };
  /** 정말 잡았다 — 미리 굴린 결과면 천장·콤보를 반영하고 'catch' 를 보낸다 */
  const reportCatch = (r: RollResult, activity?: Activity) => {
    if (!r || !r.species) return r;
    const sp = st.species.get(r.species.id);
    const act: Activity = activity ?? actOf.get(r) ?? (r as { activity?: Activity }).activity ?? ACT_OF_CAT[sp?.category ?? r.species.category ?? ''] ?? 'fish';
    const out = committed.has(r) ? r : commitCatch(F().roll, act, r, day()) as RollResult;
    committed.add(out);
    actOf.set(out, act);
    emit('catch', {
      activity: act, species: sp ?? r.species, rarity: out.rarity, variant: out.variant, size: out.size, combo: out.combo,
      ...(out.firstOfDay ? { firstOfDay: true } : {}),
    });
    save();
    return out;
  };
  let failing = false;
  const catchFail = (activity: Activity) => {
    failPure(F().roll, activity);
    save();
    failing = true;
    try { emit('catch-fail', { activity }); } finally { failing = false; }
  };
  const pity = (activity: Activity | 'chest'): PityInfo => {
    if (activity === 'chest') {
      const f = F();
      return { since3: f.pity.epic, since4: f.pity.epic, since5: f.pity.legend, gauge: Math.min(1, f.pity.legend / PITY.legend) };
    }
    const p = F().roll.pity?.[activity] ?? { since3: 0, since4: 0, since5: 0 };
    return { since3: p.since3, since4: p.since4, since5: p.since5, gauge: Math.min(1, p.since5 / ROLL_PITY.gauge) };
  };

  // ── 보물상자 ──
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
  const openChest = (tierIn?: string, where = '') => {
    const t = (tierIn && TIER_ALIAS[tierIn]) || rollTier();
    const T = TIERS[t];
    const r = ctx.rng(`loot:${where}:${t}:${F().stamps}:${Object.keys(F().opened).length}`);
    const coins = round10(T.coins[0] + r() * (T.coins[1] - T.coins[0]));
    const loot: Array<{ id: string; n: number; name: string }> = [{ id: 'coins', n: coins, name: '도파코인' }];
    st.addCoins(coins, 'chest');
    const mats = MATERIALS.filter((m) => !m.noSell && !m.tags.some((g) => g === 'junk' || g === 'misc' || g === 'space-goods'))
      .filter((m) => (t === 'common' ? m.price < 200 : t === 'rare' ? m.price < 800 : true));
    for (let i = 0; i < T.mats && mats.length; i++) {
      const m = mats[Math.floor(r() * mats.length)];
      const n = 1 + Math.floor(r() * (t === 'common' ? 3 : 2));
      const got = give(m.id, n, 'chest', { silent: true });
      if (got > 0) loot.push({ id: m.id, n: got, name: m.name });
    }
    if (T.stars) { addStars(T.stars, 'chest'); loot.push({ id: 'stars', n: T.stars, name: '반짝별' }); }
    emit('chest-loot', { tier: t, loot, at: where });
    save();
    return { tier: t, loot };
  };

  // ── 주민 부탁(게시판) ──
  const requests = (): Request[] => {
    ensureDay();
    const d = day();
    if (reqCache && reqCache.day === d && reqCache.list.length) {
      for (const rq of reqCache.list) rq.done = !!F().requestsDone[rq.id];
      return reqCache.list;
    }
    const r = ctx.rng(`req:${d}`);
    const pool = [...st.species.values()].filter((s) => s.category !== 'item' && s.category !== 'dino' && !s.p1 && s.rarity <= 3);
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
    // 완료 표시를 먼저 — 아래 저장들에 같이 실려야 새로고침 뒤 보상을 또 받지 않는다
    F().requestsDone[rid] = Date.now();
    rq.done = true;
    st.addItem(rq.species.id, -rq.n);
    st.addCoins(rq.reward, 'request');
    addStars(rq.stars, 'request');
    emit('request-done', { id: rid, coins: rq.reward });
    save();
    return true;
  };

  // ── game.econ ──
  const econ = {
    // 재화
    get stars() { return F().stars; },
    get stamps() { return F().stamps; },
    get keys() { return F().keys; },
    addStars, spendStars, addKeyPiece, keyCount, useKey,
    canAfford, spend,
    // 가방
    bag, give,
    // 날짜·시세·가격
    day, market, priceOf, sell, sellAll,
    shopItems: shopItems as (shop: string) => ApiShopItem[],
    shopPrice: shopCost,
    canBuy, buy,
    // 제작
    recipes: () => RECIPES as unknown as ApiRecipe[],
    needsOf: (rid: string) => { const r = recipeById(rid); return r ? needsOf(r, p0) : {}; },
    canCraft, craft,
    // 박물관
    isDonated, canDonate: (id: string) => donateCheck(id).ok, donate,
    // 해금
    isUnlocked, unlock,
    requirement: (key: string) => requirementText(key, { isUnlocked }, p0),
    rocket: () => rocketStatus(isUnlocked),
    // 잡기
    rollCatch, reportCatch, catchFail, pity,
    get combo() { return F().roll.combo; },
    // 상자·부탁
    openChest, requests, fulfill,
    // 기타
    flags: F as unknown as () => Record<string, unknown>,
    p0, cheat,
    // ── 덤(계약 밖 — HUD·디버그가 쓴다)
    /** 예전 이름: 상점 품목 값(Cost) */
    shopCost,
    /** 예전 이름: canAfford */
    canPay: canAfford,
    /** 만들기 안 되는 까닭(작업대 힌트) */
    craftCheck: (rid: string) => { const c = craftCheck(rid); return { ok: c.ok, why: c.why }; },
    donateCheck,
    /** cond 조건 카운터 값 */
    counter,
    canMount: (kind: string) => canMount(kind, { isUnlocked }),
    canLaunch: () => canLaunch({ isUnlocked }),
    /** 지금 파는 곳 */
    here,
  };
  game.econ = econ;

  // ── 이벤트 ──
  st.on((e) => {
    switch (e.type) {
      case 'day': ensureDay(true); break;
      case 'catch-fail':
        // 다른 모듈이 직접 보낸 catch-fail 도 콤보를 끊는다(econ.catchFail 이 보낸 건 이미 끊었다)
        if (!failing) { failPure(F().roll, (e.activity as Activity) ?? 'fish'); save(); }
        break;
      case 'collect': {
        const sp = e.species as Species | undefined;
        if (!sp) break;
        // 녹슨 열쇠처럼 줍는 즉시 바뀌는 것
        const fx = obtainEffect(sp.id);
        if (fx && e.kept !== false && (st.bag[sp.id] ?? 0) > 0) { st.addItem(sp.id, -1); addKeyPiece(fx.color, 1); }
        // 조건 카운터(낚시·곤충 횟수)
        const ctr = ACT_COUNTER[String(e.activity ?? '')];
        if (ctr) bump(ctr);
        // 도감 첫 등록 반짝별 — 재료 줄은 빼고(탈것 줄은 도감 탭이라 준다)
        const dexRow = sp.category !== 'item' || !!sp.tags?.includes('vehicle');
        if (e.isNew && dexRow) addStars(firstDexStars(sp.rarity), 'dex');
        // 반짝이 첫 등록 +10
        if (e.variant === 'shiny' && dexRow) {
          const f = F();
          if (!f.shinySeen[sp.id]) { f.shinySeen[sp.id] = Date.now(); addStars(shinyFirstStars(), 'shiny'); }
        }
        break;
      }
      case 'bag': {
        const id = String(e.id ?? '');
        const delta = Number(e.delta) || 0;
        if (delta <= 0 || !id) break;
        // 다른 모듈이 state.addItem 으로 넣은 옛 탈것·녹슨 열쇠도 규칙대로
        const base = splitVariant(id).id;
        const legacy = LEGACY_ITEMS[base] ?? (base.startsWith('v_') ? `v:${base.slice(2)}` : null);
        if (legacy) { st.addItem(id, -delta); unlock(legacy, 'migrate'); break; }
        const fx = obtainEffect(base);
        if (fx) { st.addItem(id, -delta); addKeyPiece(fx.color, delta); }
        break;
      }
      case 'harvest': if (e.kind === 'balloon') bump('balloon'); break;
      case 'wish': bump('wish'); break;
      case 'discover': {
        if (e.kind !== 'island') break;
        const place = String(e.place ?? '').replace(/^(island|isl)[:_]/, '');
        if (place) { const c = F().counters; if (!c[`visit_${place}`]) { c[`visit_${place}`] = 1; save(); } }
        break;
      }
    }
  });
  // env 대역·이벤트 없이 날이 넘어가도(디버그 advance 등) 시세를 새로
  game.onUpdate(() => { if (day() !== seenDay) ensureDay(); });

  // ── 저장 정리·시작 도구·치트 ──
  {
    const f = F();
    // 예전 제작이 남긴 '[object Object]' 칸
    if (st.bag['[object Object]'] !== undefined) delete st.bag['[object Object]'];
    // 바뀐 탈것·로켓 부품 아이템(v_raft·v_sled …) → 해금 키
    for (const k of Object.keys(st.bag)) {
      const base = splitVariant(k).id;
      const key = LEGACY_ITEMS[base] ?? (base.startsWith('v_') ? `v:${base.slice(2)}` : null);
      if (!key) continue;
      delete st.bag[k];
      if (!f.unlocks.includes(key)) f.unlocks.push(key);
    }
    // 가방에 남은 녹슨 열쇠 → 은열쇠 조각
    for (const k of Object.keys(st.bag)) {
      const fx = obtainEffect(splitVariant(k).id);
      if (!fx) continue;
      f.keys[fx.color] += st.bag[k] ?? 0;
      delete st.bag[k];
    }
    // 시작 도구(낚싯대·잠자리채 + 키) — 한 번만. 도구가 아이템이 되기 전 저장(키만 있던 때)도 이때 받는다.
    // 같은 계열의 더 좋은 도구가 이미 있으면 기본 도구는 넣지 않는다
    if (!f.kit) {
      for (const k of START_UNLOCKS) if (!f.unlocks.includes(k)) f.unlocks.push(k);
      const family = (id: string) => Object.keys(st.bag).some((k) => k.startsWith('tool_') && k.endsWith(id.slice(5)));
      for (const [id, n] of Object.entries(STARTER_KIT)) if (fresh || !family(id)) { if (!st.has(id)) st.bag[id] = n; }
      f.kit = true;
    }
    if (cheat) {
      if (st.coins < 1_000_000) st.coins = 1_000_000;
      f.stars = Math.max(f.stars, 999);
      for (const m of MATERIALS) if (!m.noSell && !m.onObtain) st.bag[m.id] = Math.max(st.bag[m.id] ?? 0, 99);
      for (const c of KEY_COLORS) f.keys[c] = Math.max(f.keys[c], 30);
    }
    checkNavChip();
    ensureDay(true);
    save();
  }

  // ── 시설(E): 상점·박물관·작업대·게시판·조선소·펭박사·섬 가게 → HUD 가 창을 연다 ──
  const facility = (id: string, place: () => { x: number; z: number }, label: string, ev: string, extra: Record<string, unknown> = {}) => {
    let pos: THREE.Vector3 | null = null;
    // 자리 계산(지형 탐색)은 처음 물어볼 때 한 번
    const at = () => (pos ??= (() => { const p = place(); return new THREE.Vector3(p.x, ctx.island.heightAt(p.x, p.z), p.z); })());
    game.addInteractable({ id: `econ-${id}`, position: at, radius: 4.2, label, onUse: () => emit(ev, extra), enabled: () => game.world !== 'space' });
  };
  facility('shop', () => PLACES.shop, '꽥꽥상회 들르기', 'open-shop', { shop: 'quack' });
  facility('museum', () => PLACES.museum, '박물관 기증하기', 'open-museum');
  facility('workbench', () => PLACES.workbench, '작업대에서 만들기', 'open-craft');
  facility('board', () => PLACES.townBoard, '게시판 보기', 'open-board');
  facility('shipyard', () => PLACES.shipyard, '조선소 들르기 ⚓', 'open-shop', { shop: 'shipyard' });
  facility('peng', () => PLACES.pengLab, '펭박사 연구소 들르기 🐧', 'open-shop', { shop: 'peng' });
  // P0 섬 가게(노점: 계산대 + 주인) — 품목은 wave 4 에서 채워진다(그전엔 빈 가게)
  facility('diving', () => PLACES.facilities.divingCenter, '다이빙 숍 들르기 🤿', 'open-shop', { shop: 'diving' });
  facility('bazaar', () => PLACES.facilities.bazaar, '모래 바자르 들르기 🏜️', 'open-shop', { shop: 'bazaar' });
  facility('potion', () => PLACES.facilities.potionShop, '물약 가게 들르기 🧪', 'open-shop', { shop: 'potion' });

  // ── 보물상자 청크 ──
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
    save();
    spawnChestFx(game, root, new THREE.Vector3(c.x, c.y, c.z), res.tier, c.rotY);
    emit('chest-open', { tier: res.tier, at: c.key, loot: res.loot });
  };
  const extra = econ as Record<string, unknown>;
  extra.openNearest = () => {
    let best: LiveChest | null = null, bd = Infinity;
    for (const c of live.values()) {
      if (c.opened) continue;
      const d = Math.hypot(c.x - game.player.pos.x, c.z - game.player.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) openLive(best);
    return best;
  };
  extra.chests = live;
  /** 촬영·테스트: 플레이어 앞에 상자 열기 연출 */
  extra.demoChest = (tier: ChestTier = 'legend', ahead = 5) => {
    const p = game.player.pos, fw = new THREE.Vector3();
    ctx.camera.getWorldDirection(fw); fw.y = 0; fw.normalize();
    const x = p.x + fw.x * ahead, z = p.z + fw.z * ahead;
    const res = openChest(tier, 'demo');
    spawnChestFx(game, root, new THREE.Vector3(x, ctx.island.heightAt(x, z), z), res.tier, 0);
    emit('chest-open', { tier: res.tier, at: 'demo', loot: res.loot });
  };

  // ── 디버그 훅 ──
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__econ = {
      give: (id: string, n = 1) => give(id, n, 'debug'),
      unlock: (key: string) => { unlock(key, 'debug'); return isUnlocked(key); },
      state: () => ({
        day: day(), coins: st.coins, stars: F().stars, keys: { ...F().keys }, combo: F().roll.combo,
        bag: { size: bag.size, used: bag.used, free: bag.free }, belt: bag.belt(),
        unlocks: [...F().unlocks], rocket: rocketStatus(isUnlocked), canLaunch: canLaunch({ isUnlocked }),
        market: market(), here: here(), p0, cheat,
      }),
      buy, craft, sell, sellAll, donate, priceOf, requirement: econ.requirement, stars: (n: number) => { addStars(n, 'debug'); return F().stars; },
      // 활동에 맞는 종만(낚시에 반딧불이가 걸리지 않게) — 굴림 상태도 그 활동 것만 움직인다
      roll: (activity: Activity = 'fish') => {
        const cats = DEBUG_ROLL_CATS[activity] ?? ['fish'];
        return rollCatch({ activity, pool: [...st.species.values()].filter((s) => cats.includes(s.category)) });
      },
    };
  }
  return root;
}
