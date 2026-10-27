// economy — 재화·가방·해금·상점·제작·박물관·시세·잡기 굴림·부탁·보물상자(GDD 4장·5.2~5.6·6.1, 계약 v2 6장). game.econ 을 붙인다.
// 돈·반짝별·열쇠·해금은 여기서만 바꾼다. 순수 계산은 economy/{progression,bag,price,currency,roll,loot,museum,requests}.ts 에 있다.
// 보물상자(5.4): 섬마다 고정 20 + 매일 20(쪼꼬미섬 포함) + 큰 섬 높은 곳 은상자 2, 나무 10% 는 은상자, 무지개 날씨엔 무지개상자.
//   흔들림 힌트(1 나무 / 2 은 / 3 + 빛기둥 금 이상)·미믹 상자게(3%, 쪼꼬미섬 15%)·상자 천장(나무 50 → 은)·개발 구역(addChestArea).
// 박물관(5.6): 동 5개 진행률·마일스톤 10/25/50/75/100%(반짝별 + 동 가구, 한 번씩)·화석 3부위 → 골격. 창은 HUD 가 museum() 으로 그린다.
// 부탁(4.6.1): 게시판 하루 3장 + 주민마다 하루 1장(requestsFor), 템플릿 ①~⑧. 오늘의 손님 생물(4.4): 값 ×5·기증 +5★.
// 저장: flags.econ(아래 EconFlags) — 바꿀 때마다 state.save()(코어가 묶어 쓴다).
// 디버그: window.__econ { give, unlock, state(), chests(), spawnChest(tier), shakeDemo(tier), mimicDemo(), museum(), requestsFor(npc), guest(), … }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Species } from '../core/state';
import { PLACES, type IslandDef } from '../core/world';
import {
  splitVariant, type Activity, type Cost, type EconApi, type KeyColor, type RollEnv as ApiRollEnv, type RollQuery as ApiRollQuery,
  type RollResult, type SellWhere, type ShopItem as ApiShopItem, type Recipe as ApiRecipe, type Variant, type PityInfo, type MuseumWing,
} from '../core/api';
import {
  BASE, MATERIALS, MATERIAL_SPECIES, SHOP_ITEMS, SHOP, RECIPES, TIERS, ANY_NEEDS, NAV_CHIP, GOODS,
  START_UNLOCKS, STARTER_KIT, P0_OPEN_KEYS, LEGACY_ITEMS, costOf, needsOf, recipeById, recipeGateOf, shopGateOf, anyMatches, itemDef,
  type ChestTier, type ShopItem, type Recipe,
} from './economy/data';
import { ChestField, MimicRunner, buildMimicCrab, buildStandaloneChest, hintShake, playOpen, spawnChestFx, type LiveChest, type MimicCrab } from './economy/chests';
import {
  CHEST_TIERS, CARD_RECIPES, SPACE_CARD_RECIPES, FIXED_PER_ISLAND, DAILY_PER_ISLAND, HIGH_SILVER, HELMET_SKIN,
  applyChestPity, chestGauge, rollLoot, rollMimic, toTier, planIslandSpots, planHighSpots, planAreaSpots, keyDay, isPlanKey,
  type ChestSpot, type LootPlan,
} from './economy/loot';
import {
  WINGS, WING_BY_ID, MILESTONE_PCTS, fossilPartOf, fossilSets, skeletonId, skeletonReady, wingOf, wingExhibits, reachedMilestones, newMilestones,
  type WingId,
} from './economy/museum';
import {
  boardRequests, residentRequest, matchesAny, pickGuest, GUEST_PRICE_MULT, GUEST_DONATE_STARS,
  type Req, type ReqNpc, type ReqSpecies, type ReqWorld,
} from './economy/requests';
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
  /** 상자 천장 — 마지막 은상자 확정 뒤 연 나무상자 수 */
  chestPity: { wood: number };
  /** 연 보물상자 키 → 등급(매일 상자는 그날 것만 남긴다) */
  opened: Record<string, ChestTier>;
  /** 박물관 동 → 받은 마일스톤 % */
  milestones: Partial<Record<WingId, number[]>>;
  /** 완성한 화석 골격(공룡 id → 시각) */
  skeletons: Record<string, number>;
  /** 가방이 꽉 차서 못 받은 선물(가구 등) — 자리가 나면 넣어 준다 */
  pending: Record<string, number>;
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

/** 부탁 한 장(requests.ts Req). 예전 이름 Request 는 종 부탁 모양 그대로(species 가 있는 것) */
export type Request = Req & { species: Species };
export type { Req as EconReq } from './economy/requests';

type PriceOpts = { size?: number; variant?: Variant; where?: SellWhere };
type RollQ = ApiRollQuery & Pick<PureQuery, 'commit' | 'place'>;

/** 미믹 상자게(GDD 3.3.1 d_mimic_crab) — 도감 칸 주인은 economy */
const MIMIC_SPECIES: Species = {
  id: 'd_mimic_crab', name: '상자게', category: 'sea', rarity: 3, price: BASE[3], len: 20, shadow: 'S',
  desc: '보물상자인 척하는 미믹. 잡으면 상자 2개를 토한다.', habitat: '쪼꼬미섬·난파선 보물상자',
  tags: ['mimic'], where: [{ island: 'islet', zone: 'chest' }],
};
/** 부탁 주민이 없을 때(characters 가 아직 없다) — P0 주민 */
const FALLBACK_NPCS: ReqNpc[] = [
  { id: 'npc_mongsil', name: '곰 몽실', island: 'home' }, { id: 'npc_quack', name: '꽥사장', island: 'home' },
  { id: 'npc_slow', name: '느릿 관장', island: 'home' }, { id: 'npc_peng', name: '펭박사', island: 'launch' },
];
/** 마일스톤을 세기 시작하는 최소 전시 칸 */
const MIN_EXHIBITS = 10;
/** 상자 놓을 땅 */
const CHEST_KIND = new Set(['sand', 'grass', 'rock', 'snow', 'jungle', 'desert']);
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
  st.register([MIMIC_SPECIES]);

  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const cheat = q.get('cheat') === '1';
  const p0 = q.get('p0') !== '0';
  /** 저장에 economy 칸이 아예 없었다 = 새 저장 */
  const fresh = !st.flags.econ || typeof st.flags.econ !== 'object';

  const F = (): EconFlags => {
    const f = ((st.flags.econ && typeof st.flags.econ === 'object') ? st.flags.econ : (st.flags.econ = {})) as Partial<EconFlags> & { combo?: number; pity?: unknown };
    f.stars ??= 0; f.stamps ??= 0; f.unlocks ??= []; f.donated ??= {};
    f.opened ??= {}; f.sold ??= {}; f.soldDay ??= -1; f.requestsDone ??= {}; f.counters ??= {}; f.shinySeen ??= {}; f.kit ??= false;
    f.milestones ??= {}; f.skeletons ??= {}; f.pending ??= {};
    if (!f.chestPity || typeof f.chestPity !== 'object' || typeof f.chestPity.wood !== 'number') {
      f.chestPity = { wood: 0 };
      // 예전 상자 천장(epic·legend)은 새 규칙과 맞지 않아 버린다. 예전 청크 배치 키도(자리가 바뀌었다) — 등급 이름은 새 이름으로
      delete f.pity;
      for (const [k, v] of Object.entries(f.opened)) {
        if (!isPlanKey(k)) { delete f.opened[k]; continue; }
        f.opened[k] = toTier(v) ?? 'wood';
      }
    }
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
  let mk: { day: number; hot: string[]; mult: Record<string, number>; guest: string | null } | null = null;
  let seenDay = day();
  /** 날이 바뀌었으면 시세·부탁·판매 포화를 새로 */
  const ensureDay = (force = false) => {
    const d = day();
    const f = F();
    if (force || d !== seenDay) { mk = null; seenDay = d; }
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
    // 레시피 카드(recipe:<rid>)를 얻었으면 원래 조건(시설·방문·우주 등)과 상관없이 만들 수 있다
    const g = hasKey(`recipe:${r.id}`) ? { ok: true } : gateCheck(recipeGateOf(r, p0), gateEnv, r.id);
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

  // ── 선물 맡아 두기(가방이 꽉 찼을 때) ──
  const hudCard = (c: { title: string; body: string; icon?: string; color?: string; ms?: number }) => { try { game.hud?.card(c); } catch { /* HUD 없는 환경 */ } };
  const hudBanner = (b: { text: string; sub?: string; icon?: string; color?: string; ms?: number }) => { try { game.hud?.banner(b); } catch { /* HUD 없는 환경 */ } };
  /** 선물(가구·덤)을 가방에 — 꽉 찼으면 맡아 두었다가 자리가 나면 넣는다 */
  const giveGift = (id: string, n: number, why: string) => {
    const got = give(id, n, why, { silent: true });
    if (got < n) {
      const f = F();
      f.pending[id] = (f.pending[id] ?? 0) + (n - got);
      save();
      toast('가방이 꽉 차서 선물은 맡아 둘게요! 자리가 나면 넣어 줄게요 🎁');
    }
    return got;
  };
  let flushing = false;
  const flushPending = () => {
    const f = F();
    if (flushing || !Object.keys(f.pending).length) return;
    flushing = true;
    try {
      for (const [id, n] of Object.entries(f.pending)) {
        if (!(n > 0)) { delete f.pending[id]; continue; }
        if (!bag.canAdd(id, 1)) continue;
        const got = give(id, n, 'pending', { silent: true });
        if (got <= 0) continue;
        if (n - got > 0) f.pending[id] = n - got; else delete f.pending[id];
        toast(`맡아 둔 선물 ${nameOf(id)}을(를) 가방에 넣었어요 🎁`);
        save();
      }
    } finally { flushing = false; }
  };

  // ── 박물관(5.6) ──
  const isDonated = (id: string) => !!F().donated[splitVariant(id).id];
  /** 가방에서 기증에 쓸 키(보통 개체 먼저, 없으면 변이 개체) */
  const donateKey = (id: string) => {
    if (st.has(id)) return id;
    return Object.keys(st.bag).find((k) => (st.bag[k] ?? 0) > 0 && splitVariant(k).id === id) ?? null;
  };
  const speciesList = () => [...st.species.values()];
  /** 공룡 → 부위 → 조각 id(데이터에서) */
  const fossilData = () => fossilSets(speciesList());
  const donateCheck = (raw: string): GateResult => {
    const id = splitVariant(raw).id;
    const s = st.species.get(id);
    if (!s || s.category === 'item') return { ok: false, why: '이건 기증할 수 없어요 🙅' };
    if (s.category === 'dino') return { ok: false, why: '공룡 친구는 기증 대신 친해져요 🦕' };
    if (isDonated(id)) return { ok: false, why: '이미 기증했어요! 🏛️' };
    const w = wingOf(s);
    if (!w) return { ok: false, why: '이건 기증할 수 없어요 🙅' };
    if (!isUnlocked(WING_BY_ID.get(w)!.key)) return { ok: false, why: '박물관 증축이 필요해요 🏛️' };
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
  /** 동 하나의 전시 칸 id */
  const exhibitIds = (w: (typeof WINGS)[number]) => wingExhibits(w, speciesList(), fossilData().keys());
  /** 골격 종(dinos 가 등록 안 했으면 조각 이름으로 만든다) */
  const skeletonSpecies = (dino: string, parts: ReadonlyMap<string, string>): Species => {
    const have = st.species.get(skeletonId(dino));
    if (have) return have;
    const ps = [...parts.values()].map((id) => st.species.get(id)).filter((x): x is Species => !!x);
    const dname = st.byGdd?.(dino)?.name ?? st.species.get(`dino-${dino}`)?.name ?? ps[0]?.name.split(' ')[0] ?? dino;
    const sp: Species = {
      id: skeletonId(dino), name: `${dname} 골격`, category: 'fossil', rarity: Math.max(1, ...ps.map((p) => p.rarity)), price: 0,
      desc: '화석 조각 세 개를 맞춘 늠름한 골격.',
    };
    st.register([sp]);
    return sp;
  };
  /** 마일스톤(10/25/50/75/100%) — 동마다 한 번씩: 반짝별 + 동 전용 가구 */
  const checkMilestones = (wid: WingId | null) => {
    if (!wid) return;
    const w = WING_BY_ID.get(wid)!;
    const ids = exhibitIds(w);
    const got = ids.filter((id) => isDonated(id)).length;
    const f = F();
    const awarded = (f.milestones[wid] ??= []);
    // 전시 칸이 너무 적으면(데이터가 덜 실린 상태) 마일스톤을 주지 않는다 — 한 마리로 100% 가 되지 않게
    if (ids.length < MIN_EXHIBITS) return;
    for (const m of newMilestones(wid, got, ids.length, awarded)) {
      awarded.push(m.pct);
      save();
      addStars(m.stars, 'museum');
      giveGift(m.furniture, 1, 'museum');
      hudCard({ title: `${w.icon} ${w.name} ${m.pct}% 달성!`, body: `반짝별 ${m.stars} + ${GOODS[m.furniture]?.name ?? m.furniture} 선물이에요 🎉`, icon: '🏛️', color: '#c59bff' });
      emit('museum-milestone', { wing: wid, pct: m.pct, stars: m.stars, item: m.furniture });
    }
  };
  /** 화석 부위를 다 기증했으면 골격 완성(도감엔 목격처럼 keep:false) */
  const checkSkeleton = (dino: string) => {
    const f = F();
    if (f.skeletons[dino]) return;
    const set = fossilData().get(dino);
    if (!set || !skeletonReady(set.parts, isDonated)) return;
    const sp = skeletonSpecies(dino, set.parts);
    f.skeletons[dino] = Date.now();
    f.donated[sp.id] = Date.now();
    save();
    st.collect({ species: sp, keep: false, activity: 'museum' });
    hudCard({ title: `🦴 ${sp.name} 완성!`, body: '조각 세 개가 모여서 화석관에 골격이 섰어요 ✨', icon: '🦴', color: '#e9c48f' });
    emit('skeleton', { dino, id: sp.id });
  };
  const skeletonsDone = () => Object.keys(F().skeletons).map(skeletonId);
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
    let stars = donateStars(s.rarity);
    // 오늘의 손님 생물을 기증하면 +5
    if (guest()?.id === id) { stars += GUEST_DONATE_STARS; toast(`오늘의 손님 ${s.name} 기증! 반짝별 +${GUEST_DONATE_STARS} ✨`); }
    st.addCoins(coins, 'donate');
    addStars(stars, 'donate');
    emit('donate', { id, n: 1, coins, stars });
    if (s.tags?.includes(NAV_CHIP.tag)) checkNavChip();
    const fp = fossilPartOf(s);
    if (fp) checkSkeleton(fp.dino);
    checkMilestones(wingOf(s));
    save();
    return true;
  };
  /** 박물관 창 데이터 — 동 5개 진행·마일스톤·골격·항법 칩 */
  const museum = () => {
    const fos = fossilData();
    const f = F();
    const wings = WINGS.map((w) => {
      const ids = exhibitIds(w);
      const got = ids.filter((id) => isDonated(id)).length;
      const reached = reachedMilestones(got, ids.length);
      const row: MuseumWing & Record<string, unknown> = {
        id: w.id, got, total: ids.length, milestones: [...MILESTONE_PCTS],
        name: w.name, icon: w.icon, open: isUnlocked(w.key), key: w.key,
        reached, awarded: [...(f.milestones[w.id] ?? [])], next: MILESTONE_PCTS.find((m) => !reached.includes(m)) ?? null,
      };
      if (w.id === 'fossil') {
        row.skeletons = [...fos.entries()].map(([dino, set]) => ({
          dino, id: skeletonId(dino), name: st.species.get(skeletonId(dino))?.name ?? `${dino} 골격`, done: !!f.skeletons[dino],
          parts: [...set.parts.entries()].map(([part, pid]) => ({ part, id: pid, donated: isDonated(pid), have: st.has(pid) })),
        }));
      }
      return row;
    });
    return { wings, navChip: { got: zodiacDonated(), need: navChipNeed(p0), done: hasKey(NAV_CHIP.key) }, guest: guest() };
  };

  // ── 오늘의 시세 ──
  const market = () => {
    ensureDay();
    const d = day();
    if (mk && mk.day === d) return mk;
    // 상자게(미믹)는 마음대로 잡을 수 없으니 인기 생물에서 뺀다
    const all = [...st.species.values()].filter((s) => !s.p1 && s.category !== 'item' && !s.tags?.includes('mimic'));
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
    // 오늘의 손님 생물(4.4) ×5
    const g = guest();
    if (g) mult[g.id] = Math.max(mult[g.id] ?? 1, GUEST_PRICE_MULT);
    mk = { day: d, hot, mult, guest: g?.id ?? null };
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
    guestId: guest()?.id,
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
      const w = F().chestPity.wood;
      return { since3: w, since4: w, since5: w, gauge: chestGauge(w) };
    }
    const p = F().roll.pity?.[activity] ?? { since3: 0, since4: 0, since5: 0 };
    return { since3: p.since3, since4: p.since4, since5: p.since5, gauge: Math.min(1, p.since5 / ROLL_PITY.gauge) };
  };

  // ── 보물상자(5.4) ──
  /** 아직 모르는 레시피 카드(상자·부탁 덤) */
  const unknownCards = () => CARD_RECIPES.filter((rid) => !hasKey(`recipe:${rid}`));
  const unknownSpaceCards = () => SPACE_CARD_RECIPES.filter((rid) => !hasKey(`recipe:${rid}`));
  /** 굴린 내용물을 실제로 — 코인·반짝별·열쇠 조각·레시피 카드·가방(꽉 차면 맡아 둔다) */
  const applyLoot = (plan: LootPlan) => {
    const loot: Array<{ id: string; n: number; name: string }> = [];
    for (const l of plan.lines) {
      switch (l.kind) {
        case 'coins': st.addCoins(l.n, 'chest'); loot.push({ id: 'coins', n: l.n, name: l.name }); break;
        case 'stars': addStars(l.n, 'chest'); loot.push({ id: 'stars', n: l.n, name: l.name }); break;
        case 'keypiece': addKeyPiece(l.color, l.n); loot.push({ id: `key:${l.color}`, n: l.n, name: l.name }); break;
        case 'unlock': unlock(l.key, 'chest'); loot.push({ id: l.key, n: 1, name: l.name }); break;
        case 'item':
          if (l.id === HELMET_SKIN) bump('helmet');
          giveGift(l.id, l.n, 'chest');
          loot.push({ id: l.id, n: l.n, name: l.name });
          break;
      }
    }
    return loot;
  };
  /** 상자 내용물 지급 + chest-open — 천장(나무 50 → 은)을 여기서 센다 */
  const openChestImpl = (tierIn: unknown, where: string, o: { island?: string | null; source?: string } = {}) => {
    const p = applyChestPity(F().chestPity, toTier(tierIn) ?? 'wood');
    const tier = p.tier;
    const n = counter('chests');
    bump('chests');
    const island = o.island !== undefined ? o.island : here().island;
    const plan = rollLoot(tier, ctx.rng(`loot:${where}:${tier}:${n}:${day()}`), {
      island, unknownCards: unknownCards(), unknownSpaceCards: unknownSpaceCards(), hasHelmet: counter('helmet') > 0 || st.has(HELMET_SKIN),
    });
    const loot = applyLoot(plan);
    if (p.pityHit) toast('두근 게이지 가득! 나무상자가 은상자로 변했어요 ✨');
    const source = o.source ?? (where.split(':')[0] || 'call');
    emit('chest-loot', { tier, loot, at: where });
    emit('chest-open', { tier, at: where, loot, source, ...(p.pityHit ? { pity: true } : {}) });
    save();
    return { tier, loot, outcome: plan.outcome, pity: p.pityHit };
  };
  /** 상자 열기(무료 지급) — 티노·보물지도·숨은 곳·우주·유령선이 부른다. 열쇠는 쓰지 않는다(열쇠로 여는 건 openLocked) */
  const openChest = (tierIn?: string, where = '') => openChestImpl(tierIn, where);
  /** 열쇠가 있으면 쓰고 true, 없으면 안내하고 false(무료 등급은 늘 true) */
  const tryKey = (tier: ChestTier): boolean => {
    const k = TIERS[tier].key;
    if (!k) return true;
    if (useKey(k)) { toast(`${KEY_ICON[k]} ${KEY_NAME[k]}로 철컥! ✨`); return true; }
    const pieces = (F().keys[k] ?? 0) % PIECES_PER_KEY;
    toast(`${KEY_ICON[k]} ${KEY_NAME[k]}가 필요해요! 조각 ${pieces}/${PIECES_PER_KEY} — 세 개 모이면 열쇠가 돼요`);
    return false;
  };
  /** 열쇠로 여는 상자(은·금·무지개) — 다른 모듈이 자기 상자에 쓰고 싶을 때. 열쇠가 없으면 null */
  const openLocked = (tierIn: string, where = '') => {
    const t = toTier(tierIn) ?? 'wood';
    return tryKey(t) ? openChestImpl(t, where) : null;
  };
  const chestPity = () => ({ wood: F().chestPity.wood, gauge: chestGauge(F().chestPity.wood) });

  // ── 상자 자리(고정 20 + 매일 20 + 높은 곳 은상자 + 개발 구역) ──
  const VB = ctx.island.ISLAND_BOUNDS;
  /** (x, z) 가 상자 놓을 마른 땅이면 높이. village=false 면 시작 마을(건물 많은 곳)은 뺀다 */
  const groundOk = (x: number, z: number, o: { island?: string; village?: boolean } = {}): number | null => {
    if (o.village) {
      // 개발 구역·디버그 상자: 시작 마을(반도)도 되도록 surfaceAt 으로 — 물·강·절벽·용암만 아니면 마른 땅
      const sf = ctx.island.surfaceAt(x, z);
      if (sf.kind === 'sea' || sf.kind === 'river' || sf.kind === 'cliff' || sf.kind === 'lava' || sf.coastDist <= 0.6) return null;
      const y = ctx.island.heightAt(x, z);
      if (ctx.island.waterLevelAt(x, z) > y - 0.1) return null;
      return y;
    }
    if (x > VB.minX - 12 && x < VB.maxX + 12 && z > VB.minZ - 12 && z < VB.maxZ + 12) return null;
    const s = ctx.island.worldSample(x, z);
    if (!s.island || (o.island && s.island.id !== o.island) || s.coast <= 1.5) return null;
    if (!CHEST_KIND.has(s.kind)) return null;
    if ((s.water ?? -Infinity) > s.h - 0.1) return null;
    const y = ctx.island.heightAt(x, z);
    if (ctx.island.waterLevelAt(x, z) > y - 0.1) return null;
    return y;
  };
  const fixedCache = new Map<string, ChestSpot[]>();
  let dailyCache: { day: number; m: Map<string, ChestSpot[]> } = { day: day(), m: new Map() };
  type Area = { id: string; island: string; x: number; z: number; r: number; n: number; tier?: ChestTier };
  const areas = new Map<string, { def: Area; day: number; spots: ChestSpot[] | null }>();
  const isletOf = (id: string) => ctx.island.islandById(id)?.theme === 'islet';
  const fixedSpots = (isl: IslandDef): ChestSpot[] => {
    let l = fixedCache.get(isl.id);
    if (!l) {
      const accept = (x: number, z: number) => groundOk(x, z, { island: isl.id });
      l = planIslandSpots(isl, FIXED_PER_ISLAND, ctx.rng(`chest:fixed:${isl.id}`), accept, { prefix: `f:${isl.id}`, daily: false });
      if (isl.theme !== 'islet') l.push(...planHighSpots(isl, HIGH_SILVER, ctx.rng(`chest:high:${isl.id}`), accept));
      fixedCache.set(isl.id, l);
    }
    return l;
  };
  const dailySpots = (isl: IslandDef): ChestSpot[] => {
    const d = day();
    if (dailyCache.day !== d) dailyCache = { day: d, m: new Map() };
    let l = dailyCache.m.get(isl.id);
    if (!l) {
      l = planIslandSpots(isl, DAILY_PER_ISLAND, ctx.rng(`chest:daily:${isl.id}:${d}`), (x, z) => groundOk(x, z, { island: isl.id }),
        { prefix: `d:${d}:${isl.id}`, daily: true, avoid: fixedSpots(isl) });
      dailyCache.m.set(isl.id, l);
    }
    return l;
  };
  const areaSpots = (a: { def: Area; day: number; spots: ChestSpot[] | null }): ChestSpot[] => {
    const d = day();
    if (!a.spots || a.day !== d) {
      a.day = d;
      const isl = ctx.island.islandById(a.def.island);
      const avoid = isl ? [...fixedSpots(isl), ...dailySpots(isl)] : [];
      a.spots = planAreaSpots(a.def, d, ctx.rng(`chest:area:${a.def.id}:${d}`), (x, z) => groundOk(x, z, { village: true }), isletOf(a.def.island), avoid);
    }
    return a.spots;
  };
  /** 이 칸 안의 상자 자리 전부 */
  const spotsIn = (x0: number, z0: number, size: number): ChestSpot[] => {
    const out: ChestSpot[] = [];
    const inside = (s: ChestSpot) => s.x >= x0 && s.x < x0 + size && s.z >= z0 && s.z < z0 + size;
    const hits = (cx: number, cz: number, r: number) => {
      const nx = Math.max(x0, Math.min(cx, x0 + size)), nz = Math.max(z0, Math.min(cz, z0 + size));
      return (nx - cx) ** 2 + (nz - cz) ** 2 <= r * r;
    };
    for (const isl of ctx.island.ISLANDS) {
      if (!hits(isl.x, isl.z, isl.r * 1.1 + 8)) continue;
      for (const s of fixedSpots(isl)) if (inside(s)) out.push(s);
      for (const s of dailySpots(isl)) if (inside(s)) out.push(s);
    }
    for (const a of areas.values()) {
      if (!hits(a.def.x, a.def.z, a.def.r + 2)) continue;
      for (const s of areaSpots(a)) if (inside(s)) out.push(s);
    }
    return out;
  };
  /** 오늘 놓인 상자 자리 전부(디버그·테스트) */
  const chestSpots = (island?: string): ChestSpot[] => {
    const out: ChestSpot[] = [];
    for (const isl of ctx.island.ISLANDS) if (!island || isl.id === island) out.push(...fixedSpots(isl), ...dailySpots(isl));
    for (const a of areas.values()) if (!island || a.def.island === island) out.push(...areaSpots(a));
    return out;
  };
  const field = new ChestField(game, {
    spotsIn,
    isOpened: (key) => !!F().opened[key],
    heightAt: (x, z) => ctx.island.heightAt(x, z),
  });
  let fieldDirty = false;
  /** 개발 구역 상자(islanddev) — 같은 id 면 바꾼다. 매일 다시 생긴다 */
  const addChestArea = (a: { id: string; island: string; x: number; z: number; r: number; n: number; tier?: ChestTier | string }) => {
    if (!a || !a.id || !Number.isFinite(a.x) || !Number.isFinite(a.z)) return;
    const def: Area = { id: String(a.id), island: String(a.island ?? ''), x: a.x, z: a.z, r: Math.max(1, Number(a.r) || 8), n: Math.max(0, Math.min(60, Math.floor(Number(a.n) || 0))) };
    const t = a.tier ? toTier(a.tier) : null;
    if (t) def.tier = t;
    const e = { def, day: day(), spots: null as ChestSpot[] | null };
    areas.set(def.id, e);
    fieldDirty = true;
    // 놓인 자리 수를 돌려준다 — 0 이면 그 구역이 다 물·절벽이라는 뜻(조용히 비지 않게 경고)
    const placed = areaSpots(e).length;
    if (def.n > 0 && placed === 0) console.warn(`[econ] 상자 구역 '${def.id}' 에 놓을 마른 땅이 없어요 (${def.x.toFixed(1)}, ${def.z.toFixed(1)}, r=${def.r})`);
    return placed;
  };
  /** 날이 바뀌면 어제 매일 상자 기록을 지우고 오늘 상자를 깐다 */
  let chestDay = day();
  const chestNewDay = () => {
    const d = day();
    if (d === chestDay) return;
    chestDay = d;
    const f = F();
    for (const k of Object.keys(f.opened)) { const kd = keyDay(k); if (kd !== null && kd !== d) delete f.opened[k]; }
    save();
    fieldDirty = true;
  };

  // ── 주민 부탁(4.6.1)·오늘의 손님(4.4) ──
  const reqSpecies = (): ReqSpecies[] => speciesList() as unknown as ReqSpecies[];
  let guestCache: { day: number; id: string | null } | null = null;
  /** 오늘의 손님 생물 — 하루 한 종, 값 ×5, 기증 +5★ */
  const guest = (): ({ id: string; name: string; rarity: number; category: string; mult: number; stars: number }) | null => {
    const d = day();
    if (!guestCache || guestCache.day !== d) guestCache = { day: d, id: pickGuest(reqSpecies(), d, (k) => ctx.rng(k)) };
    const s = guestCache.id ? st.species.get(guestCache.id) : undefined;
    return s ? { id: s.id, name: s.name, rarity: s.rarity, category: s.category, mult: GUEST_PRICE_MULT, stars: GUEST_DONATE_STARS } : null;
  };
  /** 주민 목록(characters 의 ext.npc.list(), 없으면 P0 주민) + 생일 */
  const npcList = (): ReqNpc[] => {
    let list: ReqNpc[] = [];
    try {
      const raw = game.ext?.npc?.list?.();
      if (Array.isArray(raw)) {
        list = raw.map((x: unknown) => (typeof x === 'string' ? { id: x } : x && typeof x === 'object' ? {
          id: String((x as { id?: unknown }).id ?? ''), name: (x as { name?: string }).name, island: (x as { island?: string }).island,
        } : { id: '' })).filter((x: ReqNpc) => !!x.id);
      }
    } catch { list = []; }
    if (!list.length) list = FALLBACK_NPCS.map((n) => ({ ...n }));
    for (const n of list) {
      let b: unknown = null;
      try { b = game.ext?.npc?.birthdayOf?.(n.id); } catch { b = null; }
      n.birthday = typeof b === 'number' ? b : b && typeof b === 'object' && typeof (b as { day?: unknown }).day === 'number' ? (b as { day: number }).day : null;
    }
    return list;
  };
  const reqWorld = (): ReqWorld => ({
    day: day(), hour: game.env?.hour ?? 12, tod: game.env?.tod ?? 'day', weather: game.env?.weather ?? 'clear',
    species: reqSpecies(), unknownCards: unknownCards(),
  });
  const rngOf = (k: string) => ctx.rng(k);
  /** 가방에서 '아무거나' 부탁에 맞는 것(흔한 것부터, 변이 개체는 빼고) */
  const anyMatchesInBag = (rq: Req): string[] => Object.keys(st.bag)
    .filter((k) => !k.includes('@') && (st.bag[k] ?? 0) > 0 && !!rq.any && matchesAny(rq.any, st.species.get(k) as ReqSpecies | undefined))
    .sort((a, b) => (st.species.get(a)?.rarity ?? 1) - (st.species.get(b)?.rarity ?? 1) || a.localeCompare(b));
  /** 지금 가진 수(게시판 막대) */
  const haveFor = (rq: Req): number => {
    switch (rq.kind) {
      case 'species': return st.bag[rq.species?.id ?? ''] ?? 0;
      case 'color': case 'rarity': return anyMatchesInBag(rq).reduce((a, k) => a + (st.bag[k] ?? 0), 0);
      case 'night': return game.env?.tod === 'night' && here().island === rq.at?.island ? 1 : 0;
      case 'letter': return st.has(rq.item ?? '') && here().island === rq.to ? 1 : 0;
      default: return st.bag[rq.item ?? ''] ?? 0;
    }
  };
  const refreshReq = (rq: Req) => { rq.done = !!F().requestsDone[rq.id]; rq.have = haveFor(rq); return rq; };
  let reqCache: { day: number; board: Req[] | null; npc: Map<string, Req | null> } | null = null;
  const reqDay = () => {
    ensureDay();
    const d = day();
    if (!reqCache || reqCache.day !== d) reqCache = { day: d, board: null, npc: new Map() };
    return reqCache;
  };
  /** 게시판 오늘의 부탁 3장 */
  const requests = (): Req[] => {
    const c = reqDay();
    c.board ??= boardRequests(reqWorld(), rngOf, npcList());
    return c.board.map(refreshReq);
  };
  /** 주민 한 명의 오늘 부탁(하루 1장, 생일엔 생일 선물) */
  const requestsFor = (npcId: string): Req[] => {
    if (!npcId) return [];
    const c = reqDay();
    if (!c.npc.has(npcId)) {
      const npc = npcList().find((n) => n.id === npcId) ?? { id: npcId };
      c.npc.set(npcId, residentRequest(reqWorld(), npc, rngOf));
    }
    const r = c.npc.get(npcId);
    return r ? [refreshReq(r)] : [];
  };
  const findReq = (rid: string): Req | undefined => {
    const b = requests().find((x) => x.id === rid);
    if (b) return b;
    const m = /^req:(-?\d+):npc:(.+)$/.exec(rid);
    if (m && Number(m[1]) === day()) return requestsFor(m[2]).find((x) => x.id === rid);
    return undefined;
  };
  /**
   * 부탁 들어주기 — 템플릿마다 조건을 보고, 되면 재료를 가져가고 코인·반짝별·덤.
   * o.here: 편지·밤 동행의 '그 섬에 있나' 를 부르는 쪽이 이미 확인했다(calendar 우체통 배달)
   */
  const fulfill = (rid: string, o: { here?: boolean } = {}) => {
    const rq = findReq(rid);
    if (!rq || rq.done) return false;
    const take: Record<string, number> = {};
    const isl = (id?: string) => (id ? ctx.island.islandName(id) : '');
    switch (rq.kind) {
      case 'species': {
        const id = rq.species?.id ?? '';
        if (!st.has(id, rq.n)) return false;
        take[id] = rq.n;
        break;
      }
      case 'color': case 'rarity': {
        const k = anyMatchesInBag(rq)[0];
        if (!k) return false;
        take[k] = 1;
        break;
      }
      case 'night':
        if (game.env?.tod !== 'night') { toast('밤이 되면 같이 가자! 🌙'); return false; }
        if (!o.here && here().island !== rq.at?.island) { toast(`${isl(rq.at?.island)}에서 만나자! 🌙`); return false; }
        break;
      case 'letter': {
        const item = rq.item ?? '';
        if (!st.has(item)) {
          // 편지를 먼저 받는다(가방에) — 옆 섬에 가서 다시 건네면 끝
          if (give(item, 1, 'request', { silent: true }) > 0) {
            toast(`편지를 받았어요! ${isl(rq.to)}에 전해 줘요 💌`);
            emit('letter-accept', { id: rid, item, to: rq.to, npc: rq.npc });
          }
          return false;
        }
        if (!o.here && here().island !== rq.to) { toast(`${isl(rq.to)}에 가서 전해 줘요 💌`); return false; }
        take[item] = 1;
        break;
      }
      default: {
        const item = rq.item ?? '';
        if (!st.has(item, rq.n)) return false;
        take[item] = rq.n;
      }
    }
    // 완료 표시를 먼저 — 아래 저장들에 같이 실려야 새로고침 뒤 보상을 또 받지 않는다
    F().requestsDone[rid] = Date.now();
    rq.done = true;
    save();
    for (const [k, v] of Object.entries(take)) st.addItem(k, -v);
    st.addCoins(rq.reward, 'request');
    if (rq.stars) addStars(rq.stars, 'request');
    const b = rq.bonus;
    if (b) {
      if (b.kind === 'recipe') { if (hasKey(b.id)) st.addCoins(500, 'request'); else unlock(b.id, 'request'); }
      else if (b.kind === 'keypiece') addKeyPiece(b.id === 'key:gold' ? 'gold' : 'silver', b.n);
      else giveGift(b.id, b.n, 'request');
    }
    emit('request-done', { id: rid, coins: rq.reward, npc: rq.npc, kind: rq.kind, ...(b ? { bonus: b } : {}) });
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
    openChest, requests, fulfill: (rid: string) => fulfill(rid),
    // wave 3A — 상자 등급·개발 구역·상자 천장·박물관·골격·주민 부탁·손님
    chestTiers: [...CHEST_TIERS],
    addChestArea, chestPity, museum, skeletonsDone, requestsFor, guest,
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
    /** 열쇠로 여는 상자(열쇠가 없으면 안내하고 null) */
    openLocked,
    /**
     * 편지 배달 완료(calendar 우체통·부표 우체통) — 오늘 편지 부탁(부탁 id 또는 편지 아이템 id)을 자리 확인 없이 끝낸다.
     * 편지가 가방에 있어야 한다. 끝냈으면 true
     */
    deliverLetter: (idOrItem: string) => {
      for (const n of npcList()) requestsFor(n.id);
      const all = [...requests(), ...[...reqDay().npc.values()].filter((x): x is Req => !!x).map(refreshReq)];
      const rq = all.find((r) => r.kind === 'letter' && !r.done && (r.id === idOrItem || r.item === idOrItem) && st.has(r.item ?? ''));
      return rq ? fulfill(rq.id, { here: true }) : false;
    },
    /** 오늘 놓인 상자 자리(섬별) */
    chestSpots,
    /** 지금 세상에 놓인(청크가 지은) 상자 */
    chests: field.live,
  };
  game.econ = econ;

  // ── 이벤트 ──
  st.on((e) => {
    switch (e.type) {
      case 'day': ensureDay(true); chestNewDay(); break;
      // 새 종이 등록되면(뒤 순서 모듈) 시세·손님·부탁을 다시 고른다
      case 'register': mk = null; guestCache = null; if (reqCache) reqCache = null; break;
      case 'sell': case 'donate': flushPending(); break;
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
        if (delta < 0) { if (!flushing) flushPending(); break; }
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
  game.onUpdate(() => { if (day() !== seenDay) ensureDay(); if (day() !== chestDay) chestNewDay(); });

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

  // ── 보물상자: 세상 속 상자 열기·흔들림 힌트·미믹·무지개 상자 ──
  const root = new THREE.Group();
  root.name = 'economy';
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const canShow = () => !!game.root;
  /** 상자 이름 + 열쇠 안내(E 프롬프트) */
  const chestLabel = (tier: ChestTier) => {
    const T = TIERS[tier];
    if (!T.key) return `${T.name}상자 열기`;
    return keyCount(T.key) > 0 ? `${T.name}상자 열기 (${KEY_ICON[T.key]} 1개)` : `${T.name}상자 — ${KEY_NAME[T.key]}가 필요해요 ${KEY_ICON[T.key]}`;
  };

  // 미믹 상자게
  const mimics: MimicRunner[] = [];
  const mimicGround = {
    heightAt: (x: number, z: number) => ctx.island.heightAt(x, z),
    dry: (x: number, z: number) => groundOk(x, z, { village: true }) !== null,
  };
  const startMimic = (crab: MimicCrab, at: THREE.Vector3, rotY: number, key: string, tier: ChestTier) => {
    const r = new MimicRunner(game, crab, at, rotY, mimicGround, key, tier);
    mimics.push(r);
    hudBanner({ text: '미믹 상자게다!', sub: '도망가기 전에 E 로 잡아요! 🦀', icon: '🦀', color: '#ff8f7a', ms: 2600 });
    emit('mimic', { at: key, tier });
  };
  /** 미믹 잡기: 도감 등록(+가방) + 상자 2개를 토한다 */
  const catchMimic = (r: MimicRunner) => {
    if (!r.alive) return;
    r.catch();
    const at = r.pos.clone();
    const model = buildMimicCrab(r.tier);
    model.eyes.setHappy(true);
    const size = Math.round(MIMIC_SPECIES.len! * (0.85 + ctx.rng(`mimic-size:${r.key}`)() * 0.3) * 10) / 10;
    try {
      game.ui.showCatch({ species: st.species.get(MIMIC_SPECIES.id) ?? MIMIC_SPECIES, model: model.root, size, sizeText: `${size}cm`, line: '속았지~? 상자 두 개 토해 줄게! 🦀', activity: 'chest' });
    } catch { st.collect({ species: MIMIC_SPECIES, size, activity: 'chest' }); }
    bump('mimic');
    emit('mimic-caught', { at: r.key });
    for (let i = 0; i < 2; i++) {
      const res = openChestImpl('wood', `mimic:${r.key}:${i}`, { island: here().island, source: 'mimic-reward' });
      if (canShow()) spawnChestFx(game, V(at.x + (i ? 1.3 : -1.3), at.y, at.z), res.tier, i * 1.7);
    }
  };

  /** 청크 상자 열기(E) — 열쇠 → 미믹 굴림 → 흔들고 열기 */
  const openLive = (c: LiveChest) => {
    if (c.busy || c.opened) return null;
    if (!tryKey(c.tier)) return null;
    c.busy = true;
    c.hide();
    F().opened[c.key] = c.tier;
    save();
    const at = V(c.x, c.y, c.z);
    if (rollMimic(c.tier, c.islet, ctx.rng(`mimic:${c.key}`)())) {
      c.opened = true;
      emit('chest-open', { tier: c.tier, at: c.key, loot: [], source: 'mimic', mimic: true });
      if (canShow()) playOpen(game, at, c.rot, c.tier, { mimic: true, onMimic: (crab) => startMimic(crab, at, c.rot, c.key, c.tier) });
      return { tier: c.tier, loot: [], mimic: true };
    }
    const res = openChestImpl(c.tier, c.key, { island: c.island, source: c.daily ? 'daily' : 'world' });
    if (res.tier !== c.tier) F().opened[c.key] = res.tier;
    c.opened = true;
    if (canShow()) playOpen(game, at, c.rot, res.tier);
    return { tier: res.tier, loot: res.loot };
  };

  // 무지개 날씨 상자 — 무지개가 뜨면 플레이어 근처에 하나(하루 한 번), 날씨가 끝나면 사라진다
  let rainbow: { key: string; x: number; y: number; z: number; rot: number; obj: ReturnType<typeof buildStandaloneChest> | null } | null = null;
  let rainbowCheck = -1;
  const dropRainbow = () => { if (rainbow?.obj) { rainbow.obj.pillar?.dispose(); rainbow.obj.root.removeFromParent(); } rainbow = null; };
  const placeRainbow = (key: string, near: { x: number; z: number }) => {
    const r = ctx.rng(`rainbow:${key}`);
    for (let i = 0; i < 30; i++) {
      const a = r() * Math.PI * 2, d = 12 + r() * 16;
      const x = near.x + Math.cos(a) * d, z = near.z + Math.sin(a) * d;
      const y = groundOk(x, z, { village: true });
      if (y === null) continue;
      const rot = r() * Math.PI * 2;
      let obj: ReturnType<typeof buildStandaloneChest> | null = null;
      if (canShow()) {
        obj = buildStandaloneChest('rainbow');
        obj.root.position.set(x, y - 0.03, z);
        obj.root.rotation.y = rot;
        game.root.add(obj.root);
      }
      rainbow = { key, x, y, z, rot, obj };
      toast('🌈 무지개 끝에 반짝이는 상자가 나타났어요!');
      emit('rainbow-chest', { at: key, x, z });
      return true;
    }
    return false;
  };
  const rainbowTick = (t: number) => {
    const onEarth = game.world === 'earth';
    const w = game.env?.weather;
    if (rainbow && (w !== 'rainbow' || !onEarth)) { dropRainbow(); return; }
    if (!rainbow && w === 'rainbow' && onEarth && t - rainbowCheck > 1) {
      rainbowCheck = t;
      const key = `rb:${day()}`;
      if (!F().opened[key] && game.player?.pos) placeRainbow(key, game.player.pos);
    }
    if (rainbow?.obj) hintShake(rainbow.obj.wob, t, rainbow.key, 'rainbow');
  };
  const openRainbow = () => {
    const rb = rainbow;
    if (!rb || !tryKey('rainbow')) return null;
    F().opened[rb.key] = 'rainbow';
    save();
    dropRainbow();
    const res = openChestImpl('rainbow', rb.key, { source: 'rainbow' });
    if (canShow()) playOpen(game, V(rb.x, rb.y, rb.z), rb.rot, 'rainbow');
    return res;
  };

  // E: 상자 열기 / 미믹 잡기(잡기가 먼저)
  game.addProvider('econ-chest', (p) => {
    if (game.world !== 'earth') return null;
    const n = field.nearest(p.pos, 2.8);
    const rd = rainbow ? Math.hypot(rainbow.x - p.pos.x, rainbow.z - p.pos.z) : Infinity;
    if (rainbow && rd < 2.8 && (!n || rd < n.d)) return { id: 'econ-chest', label: chestLabel('rainbow'), dist: rd, use: () => { openRainbow(); } };
    if (!n) return null;
    const c = n.c;
    return { id: 'econ-chest', label: chestLabel(c.tier), dist: n.d, use: () => { openLive(c); } };
  });
  game.addProvider('econ-mimic', (p) => {
    let best: MimicRunner | null = null, bd = 2.5;
    for (const r of mimics) {
      if (!r.alive) continue;
      const d = Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z);
      if (d <= bd) { bd = d; best = r; }
    }
    if (!best) return null;
    const r = best;
    return { id: 'econ-mimic', label: '미믹 상자게 잡기! 🦀', dist: bd, priority: 5, use: () => catchMimic(r) };
  });

  // 매 프레임: 가까운 상자 흔들림 힌트 · 무지개 상자 · 도망가는 미믹 — 모두 가까운 것만
  game.onUpdate((t, dt) => {
    if (fieldDirty) { fieldDirty = false; field.refresh(); }
    const pos = game.player?.pos;
    if (!pos) return;
    if (game.world === 'earth') field.updateHints(t, pos as THREE.Vector3);
    rainbowTick(t);
    for (let i = mimics.length - 1; i >= 0; i--) {
      const r = mimics[i];
      const was = r.status;
      const keep = r.update(t, dt, pos as THREE.Vector3);
      if (was !== 'gone' && r.status === 'gone') { toast('미믹 상자게가 도망갔어요… 다음엔 꼭! 🦀💨'); emit('mimic-escape', { at: r.key }); }
      if (!keep) mimics.splice(i, 1);
    }
  });

  // ── 촬영·테스트 도우미 ──
  /** 플레이어 앞 d m(+ 오른쪽 side m) 자리 */
  const ahead = (d: number, side = 0) => {
    const p = game.player.pos, fw = new THREE.Vector3();
    if (ctx.camera) { ctx.camera.getWorldDirection(fw); fw.y = 0; }
    if (fw.lengthSq() < 1e-6) fw.set(-Math.sin(game.player.yaw ?? 0), 0, -Math.cos(game.player.yaw ?? 0));
    fw.normalize();
    const x = p.x + fw.x * d - fw.z * side, z = p.z + fw.z * d + fw.x * side;
    return { x, z, y: ctx.island.heightAt(x, z), face: Math.atan2(-fw.x, -fw.z) };
  };
  let demoN = 0;
  const extra = econ as Record<string, unknown>;
  extra.openNearest = () => {
    let best: LiveChest | null = null, bd = Infinity;
    for (const c of field.live.values()) {
      if (c.opened || c.busy) continue;
      const d = Math.hypot(c.x - game.player.pos.x, c.z - game.player.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? openLive(best) : null;
  };
  /** 플레이어 앞에 상자 열기 연출(내용물도 준다) */
  extra.demoChest = (tier: string = 'gold', d = 5, side = 0) => {
    const a = ahead(d, side);
    const res = openChestImpl(toTier(tier) ?? 'gold', 'demo', { source: 'demo' });
    if (canShow()) playOpen(game, V(a.x, a.y, a.z), a.face, res.tier);
    return res;
  };
  /** 플레이어 앞에 진짜 상자 하나 놓기(개발 구역 1칸) */
  extra.spawnChest = (tier: string = 'wood', d = 4, side = 0) => {
    const a = ahead(d, side);
    const placed = addChestArea({ id: `debug-${demoN++}`, island: here().island ?? 'home', x: a.x, z: a.z, r: 0.6, n: 1, tier: toTier(tier) ?? 'wood' }) ?? 0;
    return { ...a, placed };
  };
  /** 흔들림 힌트만 보여 주는 상자(열리지 않는다) — 촬영용 */
  extra.shakeDemo = (tier: string = 'gold', d = 4, side = 0) => {
    const t = toTier(tier) ?? 'gold';
    const a = ahead(d, side);
    const ch = buildStandaloneChest(t);
    ch.root.position.set(a.x, a.y - 0.03, a.z);
    ch.root.rotation.y = a.face;
    game.root.add(ch.root);
    const key = `demo-shake-${demoN++}`;
    const off = game.onUpdate((tt) => hintShake(ch.wob, tt, key, t));
    return () => { off(); ch.pillar?.dispose(); ch.root.removeFromParent(); };
  };
  /** 플레이어 앞 상자가 미믹으로 깨어나 도망간다 — 촬영·테스트용 */
  extra.mimicDemo = (tier: string = 'wood', d = 4, side = 0) => {
    const t = (toTier(tier) === 'silver' ? 'silver' : 'wood') as ChestTier;
    const a = ahead(d, side);
    const at = V(a.x, a.y, a.z);
    const key = `demo-mimic-${demoN++}`;
    emit('chest-open', { tier: t, at: key, loot: [], source: 'mimic', mimic: true });
    playOpen(game, at, a.face, t, { mimic: true, onMimic: (crab) => startMimic(crab, at, a.face, key, t) });
    return key;
  };
  /** 제자리에서 꼼지락거리는 상자게(촬영용) — 치우는 함수를 돌려준다 */
  extra.crabDemo = (d = 3, side = 0, tier: string = 'wood') => {
    const a = ahead(d, side);
    const crab = buildMimicCrab(toTier(tier) === 'silver' ? 'silver' : 'wood');
    crab.root.position.set(a.x, a.y, a.z);
    crab.root.rotation.y = a.face;
    game.root.add(crab.root);
    const off = game.onUpdate((t) => crab.animate(t, 0.6));
    return () => { off(); crab.root.removeFromParent(); };
  };
  extra.mimics = mimics;
  /** 지금 떠 있는 무지개상자 */
  extra.rainbowChest = () => (rainbow ? { key: rainbow.key, x: rainbow.x, z: rainbow.z } : null);
  extra.chestField = field;
  extra.catchMimicNearest = () => { const r = mimics.find((m) => m.alive); if (r) catchMimic(r); return !!r; };

  // ── 디버그 훅 ──
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__econ = {
      give: (id: string, n = 1) => give(id, n, 'debug'),
      unlock: (key: string) => { unlock(key, 'debug'); return isUnlocked(key); },
      state: () => ({
        day: day(), coins: st.coins, stars: F().stars, keys: { ...F().keys }, combo: F().roll.combo,
        bag: { size: bag.size, used: bag.used, free: bag.free }, belt: bag.belt(),
        unlocks: [...F().unlocks], rocket: rocketStatus(isUnlocked), canLaunch: canLaunch({ isUnlocked }),
        market: market(), here: here(), p0, cheat, chestPity: chestPity(), guest: guest(), pending: { ...F().pending },
      }),
      buy, craft, sell, sellAll, donate, priceOf, requirement: econ.requirement, stars: (n: number) => { addStars(n, 'debug'); return F().stars; },
      // 활동에 맞는 종만(낚시에 반딧불이가 걸리지 않게) — 굴림 상태도 그 활동 것만 움직인다
      roll: (activity: Activity = 'fish') => {
        const cats = DEBUG_ROLL_CATS[activity] ?? ['fish'];
        return rollCatch({ activity, pool: [...st.species.values()].filter((s) => cats.includes(s.category)) });
      },
      // 상자
      chests: () => [...field.live.values()].filter((c) => !c.opened).map((c) => ({ key: c.key, tier: c.tier, x: Math.round(c.x), z: Math.round(c.z), d: Math.round(Math.hypot(c.x - game.player.pos.x, c.z - game.player.pos.z)) })).sort((a, b) => a.d - b.d),
      spots: chestSpots, openChest, openLocked, openNearest: extra.openNearest, demoChest: extra.demoChest, spawnChest: extra.spawnChest,
      shakeDemo: extra.shakeDemo, mimicDemo: extra.mimicDemo, crabDemo: extra.crabDemo, catchMimic: extra.catchMimicNearest, chestPity,
      setChestPity: (n: number) => { F().chestPity.wood = Math.max(0, Math.floor(n)); save(); return chestPity(); },
      keys: (color: KeyColor = 'silver', n = 3) => { addKeyPiece(color, n); return keyCount(color); },
      rainbow: extra.rainbowChest,
      // 박물관·부탁·손님
      museum, skeletonsDone, requests, requestsFor, fulfill: (rid: string) => fulfill(rid), guest, deliverLetter: econ.deliverLetter,
    };
  }
  return root;
}
