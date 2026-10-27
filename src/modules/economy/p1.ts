// economy wave 4(econ-p1) 런타임 — 먹기·버프, 캡슐머신, 피규어, 보관함·놓아주기·버리기·전시·투자, 초대권, 재활용 포인트.
// economy.ts 가 build 안에서 installP1(deps) 를 한 번 부르고, 돌려받은 함수들을 game.econ 에 붙인다.
// 순수 계산은 buffs.ts · capsule.ts · keep.ts · merchants.ts 에 있다. 저장은 flags.econ 의 아래 칸(P1Flags).
// 이벤트(state.emit): use{id, kind, buff?} · buff{name, until, minutes} · buff-end{name} · capsule{id, grade, kind, dup, stars, pity}
//   figurine{species, id} · release{species, n, where} · drop{id, n} · storage{id, delta} · display{id, on} · invest{island, cost, total}
//   invite{island, npc} · recycle{points, stars}
import * as THREE from 'three';
import type { Ctx } from '../../core/types';
import type { Game } from '../../core/game';
import type { GameState, Species } from '../../core/state';
import { splitVariant, type Cost, type LootItem, type SellWhere } from '../../core/api';
import { GOODS, itemDef } from './data';
import { canAddAll, type BagRules } from './bag';
import { FOODS, FRUIT_POWER, applyBuff, activeBuffs, pruneBuffs, rollMods as modsOf, buffMult as multOf, buffDef, type BuffStore } from './buffs';
import { rollCapsule, dupStars, CAPSULE_BY_ID, GRADE_NAME, type CapsuleGrade, type CapsuleKind } from './capsule';
import {
  STORAGE_SIZE, figureId, figurePlan, figurePoints, figureCandidates, storageRules, storageUsed, storageFits, storageRoom,
  displayMax, displayCount, FIGURE_NEED,
} from './keep';
import { recycleToStars } from './merchants';
import { buildDropBundle } from './p1models';

/** flags.econ 에 wave 4 가 더하는 칸 */
export interface P1Flags {
  /** 버프 이름 → 끝나는 게임 시계 초 */
  buffs: BuffStore;
  /** 집 보관함(가방 키 → 수) */
  storage: Record<string, number>;
  /** 집 진열장(가방 키 → 마리) — interiors 가 그린다 */
  displayed: Record<string, number>;
  /** 섬 개발 투자 누계 */
  invested: Record<string, { coins: number; stars: number; items: Record<string, number>; n: number }>;
  /** 재활용 포인트(10 = 반짝별 1, 남은 것) */
  recycle: number;
  /** 모은 재활용 포인트 누계 */
  recycleTotal: number;
  /** 캡슐머신: 돌린 수 · 특별 천장 · 받은 상품 */
  capsule: { n: number; since3: number; got: Record<string, number> };
  /** 만든 피규어(종 → 수) */
  figures: Record<string, number>;
  /** 놓아준 생물(종 → 마리) */
  released: Record<string, number>;
}

export interface P1Deps {
  ctx: Ctx;
  game: Game;
  st: GameState;
  /** flags.econ(P1 칸을 채워 돌려준다) */
  flags(): Record<string, unknown>;
  save(): void;
  emit(type: string, extra?: Record<string, unknown>): void;
  toast(t: string): void;
  give(id: string, n?: number, why?: string, o?: { silent?: boolean }): number;
  giveGift(id: string, n: number, why: string): number;
  spend(c: Cost | undefined, why?: string): boolean;
  shortfall(c: Cost): string | null;
  addStars(n: number, why?: string): void;
  isUnlocked(key: string): boolean;
  here(): { where: SellWhere; island: string | null };
  rules(): BagRules;
  nameOf(id: string): string;
  hudCard(c: { title: string; body: string; icon?: string; color?: string; ms?: number }): void;
}

/** 캡슐 한 번 결과(LootItem + 연출용 덤) */
export interface CapsuleLoot extends LootItem { grade: CapsuleGrade; kind: CapsuleKind; icon: string; dup: boolean; stars: number; pity: boolean }

/** 땅에 내려놓은 꾸러미(메모리만 — 10분 뒤 사라진다) */
interface Drop { key: string; id: string; n: number; x: number; y: number; z: number; t0: number; obj: THREE.Object3D | null }
const DROP_LIFE = 600, DROP_MAX = 16, DROP_PICK_R = 2.2;
/** 가방이 꽉 찼을 때 창을 다시 띄우기까지(초) */
const FULL_PROMPT_GAP = 6, FULL_PROMPT_DELAY = 1.4;

export function installP1(d: P1Deps) {
  const { ctx, game, st } = d;
  const F = (): P1Flags => {
    const f = d.flags() as Partial<P1Flags>;
    if (!f.buffs || typeof f.buffs !== 'object') f.buffs = {};
    if (!f.storage || typeof f.storage !== 'object') f.storage = {};
    if (!f.displayed || typeof f.displayed !== 'object') f.displayed = {};
    if (!f.invested || typeof f.invested !== 'object') f.invested = {};
    if (!f.capsule || typeof f.capsule !== 'object') f.capsule = { n: 0, since3: 0, got: {} };
    f.capsule.got ??= {}; f.capsule.n ??= 0; f.capsule.since3 ??= 0;
    if (!f.figures || typeof f.figures !== 'object') f.figures = {};
    if (!f.released || typeof f.released !== 'object') f.released = {};
    if (typeof f.recycle !== 'number') f.recycle = 0;
    if (typeof f.recycleTotal !== 'number') f.recycleTotal = 0;
    return f as P1Flags;
  };
  const sp = (id: string): Species | undefined => st.species.get(splitVariant(id).id);
  const isCreature = (id: string) => { const s = sp(id); return !!s && s.category !== 'item'; };
  const name = (id: string) => d.nameOf(splitVariant(id).id);

  // ── 피규어 이름표(GOODS 에 — HUD·가방이 읽는다) ──
  const nameFigures = () => {
    for (const s of st.species.values()) {
      if (s.category === 'item') continue;
      const fid = figureId(s.id);
      if (!GOODS[fid]) GOODS[fid] = { name: `${s.name} 피규어`, icon: '🧸' };
    }
  };
  nameFigures();

  // ── 버프(게임 분) ──
  /** 지금 게임 시계 초 — env 가 아직 없으면(경제가 날씨보다 먼저) 게임 시간 */
  const now = () => game.env?.gameSec ?? game.time ?? 0;
  // 게임 시계(env)가 붙기 전에 켠 버프는 기다렸다가 붙는 순간 켠다 — 끝 시각이 다른 시계로 저장되지 않게
  const pendBuffs: Array<[string, number]> = [];
  const addBuff = (nm: string, gameMinutes: number) => {
    if (!nm || !(gameMinutes > 0)) return;
    if (!game.env) { pendBuffs.push([String(nm), gameMinutes]); return; }
    const until = applyBuff(F().buffs, String(nm), gameMinutes, now());
    d.save();
    d.emit('buff', { name: nm, until, minutes: gameMinutes });
  };
  const buffs = () => activeBuffs(F().buffs, now());
  const names = () => buffs().map((b) => b.name);
  const rollMods = () => modsOf(names());
  const buffMult = (what: 'speed') => multOf(names(), what);
  /** 끝난 버프 정리 + 안내(1초에 한 번) */
  let pruneAt = 0;
  const pruneTick = (t: number) => {
    if (t - pruneAt < 1 && t >= pruneAt) return;
    pruneAt = t;
    // 시계가 붙기 전엔 끝내지 않는다(저장된 끝 시각은 게임 시계 기준)
    if (!game.env) return;
    while (pendBuffs.length) { const [nm, m] = pendBuffs.shift()!; addBuff(nm, m); }
    const gone = pruneBuffs(F().buffs, now());
    if (!gone.length) return;
    d.save();
    for (const g of gone) {
      d.emit('buff-end', { name: g });
      d.toast(`${buffDef(g).icon} ${buffDef(g).label} 효과가 끝났어요`);
    }
  };

  // ── 먹기·쓰기 ──
  const eat = () => { try { game.player?.act?.('eat', 1.2); } catch { /* 플레이어 없는 환경 */ } };
  const use = (raw: string): boolean => {
    const id = String(raw ?? '');
    if (!id) return false;
    if (id === 'it_capsule') return !!capsule.roll();
    if (id === 'it_invite') return useInvite();
    if (!st.has(id)) { d.toast('가방에 없어요 🎒'); return false; }
    const food = FOODS[id];
    if (food) {
      st.addItem(id, -1);
      addBuff(food.buff, food.minutes);
      eat();
      d.toast(`${name(id)} ${food.verb}! ${food.line}`);
      d.emit('use', { id, kind: id.startsWith('it_potion') ? 'potion' : 'food', buff: food.buff, minutes: food.minutes });
      d.save();
      return true;
    }
    if (itemDef(id)?.tags.includes('fruit')) {
      st.addItem(id, -1);
      addBuff(FRUIT_POWER.buff, FRUIT_POWER.minutes);
      eat();
      d.toast(`냠냠 ${name(id)}! 힘이 불끈 💪`);
      d.emit('use', { id, kind: 'fruit', buff: FRUIT_POWER.buff, minutes: FRUIT_POWER.minutes });
      d.save();
      return true;
    }
    d.toast('이건 먹거나 쓸 수 없어요 🙅');
    return false;
  };

  // ── 주민 초대권(it_invite → ext.npc.moveIn) ──
  const useInvite = (island?: string): boolean => {
    if (!st.has('it_invite')) { d.toast('주민 초대권이 없어요 🎟️ (꽥꽥상회 반짝별 50)'); return false; }
    const npc = game.ext?.npc as { moveIn?: (id: string | undefined, island: string) => unknown; nextResident?: (island: string) => string | null } | undefined;
    if (!npc || typeof npc.moveIn !== 'function') { d.toast('이사 올 친구들이 아직 짐을 싸는 중이에요… 초대권은 잘 간직해 둬요 💌'); return false; }
    const isl = island ?? d.here().island ?? 'home';
    let who: string | undefined;
    try { who = npc.nextResident?.(isl) ?? undefined; } catch { who = undefined; }
    let r: unknown;
    try { r = npc.moveIn(who, isl); } catch (err) { console.warn('[econ] moveIn', err); return false; }
    if (r === false || r === null) { d.toast('지금은 이사 올 자리가 없대요 🏠'); return false; }
    st.addItem('it_invite', -1);
    const moved = typeof r === 'string' ? r : who ?? null;
    d.emit('invite', { island: isl, npc: moved });
    d.toast(`🎟️ 초대장을 보냈어요! ${moved ? `${d.nameOf(moved)}이(가) ` : '새 친구가 '}이사 온대요 🏡`);
    d.save();
    return true;
  };

  // ── 캡슐머신 ──
  const capsule = {
    /** 티켓 1장으로 한 번(없으면 null). 상품은 가방(의상·스킨은 옷장 칸이라 늘 들어간다, 가구는 꽉 차면 맡아 둔다) */
    roll(): CapsuleLoot | null {
      if (!st.has('it_capsule')) { d.toast('캡슐 티켓이 없어요 🎫 (반짝별 20개로 바꿀 수 있어요)'); return null; }
      const f = F();
      const n = f.capsule.n;
      const r = rollCapsule(ctx.rng(`capsule:${n}`), f.capsule.since3);
      st.addItem('it_capsule', -1);
      f.capsule.n = n + 1;
      f.capsule.since3 = r.grade === 3 ? 0 : f.capsule.since3 + 1;
      const p = r.prize;
      const owned = p.kind !== 'furniture' && (st.has(p.id) || (f.storage[p.id] ?? 0) > 0);
      f.capsule.got[p.id] = (f.capsule.got[p.id] ?? 0) + 1;
      const stars = dupStars(p, owned);
      d.save();
      if (stars > 0) d.addStars(stars, 'capsule');
      else d.giveGift(p.id, 1, 'capsule');
      const loot: CapsuleLoot = { id: p.id, n: 1, name: p.name, grade: r.grade, kind: p.kind, icon: p.icon, dup: stars > 0, stars, pity: r.pityHit };
      d.emit('capsule', { id: p.id, grade: r.grade, kind: p.kind, dup: stars > 0, stars, pity: r.pityHit, n: n + 1 });
      return loot;
    },
    /** 반짝별 20 → 티켓 1(캡슐머신 가게 품목) */
    get tickets() { return st.bag.it_capsule ?? 0; },
    /** 다음 특별까지 남은 수 */
    get pityLeft() { return Math.max(1, 30 - F().capsule.since3); },
    get count() { return F().capsule.n; },
    /** 모은 상품 id → 받은 수 */
    got: () => ({ ...F().capsule.got }),
  };

  // ── 피규어 공방: 같은 종 5 → f_figure_<종> ──
  const figurine = (raw: string): boolean => {
    const id = splitVariant(String(raw ?? '')).id;
    const s = sp(id);
    if (!s || s.category === 'item') { d.toast('생물 친구만 피규어로 만들 수 있어요 🧸'); return false; }
    const plan = figurePlan(st.bag, id);
    if (!plan) {
      d.toast(`${s.name}이(가) ${FIGURE_NEED}마리 필요해요 (꼬마는 2마리로 쳐요) — 지금 ${figurePoints(st.bag, id)}/${FIGURE_NEED} 🧸`);
      return false;
    }
    const fid = figureId(id);
    GOODS[fid] ??= { name: `${s.name} 피규어`, icon: '🧸' };
    const after = { ...st.bag };
    for (const [k, v] of Object.entries(plan)) { after[k] = (after[k] ?? 0) - v; if (after[k] <= 0) delete after[k]; }
    if (!canAddAll(after, { [fid]: 1 }, d.rules())) { d.toast('가방이 꽉 찼어요! 🎒'); return false; }
    for (const [k, v] of Object.entries(plan)) st.addItem(k, -v);
    d.give(fid, 1, 'figurine', { silent: true });
    const f = F();
    f.figures[id] = (f.figures[id] ?? 0) + 1;
    d.save();
    d.hudCard({ title: `🧸 ${s.name} 피규어 완성!`, body: '반들반들 귀여운 피규어예요. 집 진열장에 놓아 봐요 ✨', icon: '🧸', color: '#ffd9e6' });
    d.emit('figurine', { species: id, id: fid, used: plan });
    d.emit('craft', { id: 'r_figure', gives: fid, n: 1 });
    return true;
  };
  const figureList = () => figureCandidates(st.bag, isCreature);

  // ── 가방 꽉 참: 놓아주기(생물) · 버리기(땅에 꾸러미) · 새로 잡은 친구 구해 주기 ──
  /** 가방이 꽉 차서 못 넣은 방금 잡은 친구(가방 키) */
  let rescue: { id: string; t: number } | null = null;
  let lastCollect: { id: string; kept: boolean; t: number } | null = null;
  const tryRescue = () => {
    if (!rescue) return false;
    const r = rescue;
    if (!st.canAdd || st.canAdd(r.id, 1)) {
      rescue = null;
      if (d.give(r.id, 1, 'rescue', { silent: true }) > 0) {
        d.toast(`${name(r.id)} 가방에 쏙! 🎒`);
        if (game.hud?.isOpen?.('bagfull')) game.hud.close();
        return true;
      }
    }
    return false;
  };
  const release = (raw: string): boolean => {
    let key = String(raw ?? '');
    if (!st.has(key)) key = Object.keys(st.bag).find((k) => (st.bag[k] ?? 0) > 0 && splitVariant(k).id === splitVariant(raw).id) ?? '';
    if (!key) { d.toast('가방에 없어요 🎒'); return false; }
    if (!isCreature(key)) { d.toast('생물 친구만 놓아줄 수 있어요 — 재료는 버리기 🧺'); return false; }
    const { id, variant } = splitVariant(key);
    st.addItem(key, -1);
    const f = F();
    f.released[id] = (f.released[id] ?? 0) + 1;
    d.save();
    d.emit('release', { species: id, n: 1, where: d.here().island ?? 'home', ...(variant ? { variant } : {}) });
    d.toast(`${name(id)} 바이바이~ 잘 지내! 🌿`);
    tryRescue();
    return true;
  };
  /** 놓아준 생물 그만 */
  const dismissRescue = (): string | null => {
    const r = rescue;
    rescue = null;
    if (!r) return null;
    const { id, variant } = splitVariant(r.id);
    const f = F();
    f.released[id] = (f.released[id] ?? 0) + 1;
    d.save();
    d.emit('release', { species: id, n: 1, where: d.here().island ?? 'home', ...(variant ? { variant } : {}) });
    d.toast(`${name(id)}을(를) 놓아줬어요. 또 만나! 🌿`);
    return r.id;
  };

  // 버린 꾸러미(땅에) — E 로 다시 줍는다
  const drops: Drop[] = [];
  let dropN = 0;
  const removeDrop = (dr: Drop) => {
    const i = drops.indexOf(dr);
    if (i >= 0) drops.splice(i, 1);
    dr.obj?.removeFromParent();
  };
  const drop = (raw: string, n?: number): boolean => {
    const id = String(raw ?? '');
    const have = st.bag[id] ?? 0;
    const k = Math.min(have, Math.floor(n ?? have));
    if (!(k > 0)) { d.toast('가방에 없어요 🎒'); return false; }
    if (id.startsWith('tool_')) { d.toast('도구는 버릴 수 없어요 🧰'); return false; }
    st.addItem(id, -k);
    const p = game.player?.pos;
    const key = `drop-${dropN++}`;
    if (p) {
      const r = ctx.rng(`econ-drop:${key}`);
      const a = r() * Math.PI * 2, rr = 0.8 + r() * 0.5;
      const x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
      let y = p.y;
      try { y = game.world === 'earth' ? (game.groundAt?.(x, z) ?? ctx.island.heightAt(x, z)) : p.y; } catch { y = p.y; }
      let obj: THREE.Object3D | null = null;
      if (game.root) {
        obj = buildDropBundle(itemColor(id));
        obj.position.set(x, y, z);
        obj.rotation.y = r() * Math.PI * 2;
        obj.name = `econ-drop:${id}`;
        (game.world === 'space' && game.spaceRoot ? game.spaceRoot : game.root).add(obj);
      }
      drops.push({ key, id, n: k, x, y, z, t0: game.time ?? 0, obj });
      while (drops.length > DROP_MAX) removeDrop(drops[0]);
    }
    d.emit('drop', { id, n: k });
    d.toast(`${name(id)} ${k > 1 ? `${k}개를 ` : ''}땅에 내려놨어요 — 다시 주우려면 E 🧺`);
    d.save();
    tryRescue();
    return true;
  };
  const itemColor = (id: string) => itemDef(splitVariant(id).id)?.color ?? '#ffd6a8';
  game.addProvider('econ-drop', (pl) => {
    let best: Drop | null = null, bd = DROP_PICK_R;
    for (const dr of drops) {
      const dd = Math.hypot(dr.x - pl.pos.x, dr.z - pl.pos.z);
      if (dd <= bd && Math.abs(dr.y - pl.pos.y) < 3) { bd = dd; best = dr; }
    }
    if (!best) return null;
    const dr = best;
    return {
      id: 'econ-drop', label: `${name(dr.id)} 줍기${dr.n > 1 ? ` ×${dr.n}` : ''} 🧺`, dist: bd,
      use: () => {
        const got = d.give(dr.id, dr.n, 'pickup');
        dr.n -= got;
        if (dr.n <= 0) removeDrop(dr);
        if (got > 0) try { game.player?.act?.('pick', 0.6); } catch { /* 없음 */ }
      },
    };
  });

  // ── 집 보관함(200칸) ──
  const sRules = () => storageRules(d.rules());
  const storage = {
    get size() { return STORAGE_SIZE; },
    get used() { return storageUsed(F().storage, sRules()); },
    get free() { return Math.max(0, STORAGE_SIZE - storageUsed(F().storage, sRules())); },
    list: () => Object.entries(F().storage).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n })).sort((a, b) => a.id.localeCompare(b.id)),
    /** 몇 개까지 더 넣을 수 있나 */
    room: (id: string, n = 1) => storageRoom(F().storage, id, n, sRules()),
    has: (id: string, n = 1) => (F().storage[id] ?? 0) >= n,
    /** 가방 → 보관함 */
    put(id: string, n = 1): boolean {
      n = Math.floor(n);
      if (!id || !(n > 0)) return false;
      if ((st.bag[id] ?? 0) < n) { d.toast('가방에 그만큼 없어요 🎒'); return false; }
      const f = F();
      if (!storageFits(f.storage, id, n, sRules())) { d.toast('보관함이 꽉 찼어요! 📦'); return false; }
      st.addItem(id, -n);
      f.storage[id] = (f.storage[id] ?? 0) + n;
      d.save();
      d.emit('storage', { id, delta: n });
      tryRescue();
      return true;
    },
    /** 보관함 → 가방 */
    take(id: string, n = 1): boolean {
      n = Math.floor(n);
      const f = F();
      if (!id || !(n > 0) || (f.storage[id] ?? 0) < n) { d.toast('보관함에 그만큼 없어요 📦'); return false; }
      if (st.canAdd && !st.canAdd(id, n)) { d.toast('가방이 꽉 찼어요! 🎒'); return false; }
      f.storage[id] -= n;
      if (f.storage[id] <= 0) delete f.storage[id];
      const got = d.give(id, n, 'storage', { silent: true });
      // 도구처럼 하나만 드는 건 남은 걸 도로 넣는다
      if (got < n) f.storage[id] = (f.storage[id] ?? 0) + (n - got);
      d.save();
      if (got > 0) d.emit('storage', { id, delta: -got });
      return got > 0;
    },
  };

  // ── 집 진열장 ──
  const houseLevel = () => [4, 3, 2, 1].find((k) => d.isUnlocked(`house:${k}`)) ?? 0;
  const display = (raw: string, on: boolean): boolean => {
    const key = String(raw ?? '');
    const f = F();
    if (on) {
      if (!isCreature(key)) { d.toast('생물 친구만 진열할 수 있어요 🏠'); return false; }
      const max = displayMax(houseLevel());
      if (displayCount(f.displayed) >= max) { d.toast(`진열장이 꽉 찼어요 (${max}칸) — 집을 넓히면 늘어나요 🏠`); return false; }
      if (st.has(key)) st.addItem(key, -1);
      else if ((f.storage[key] ?? 0) > 0) { f.storage[key] -= 1; if (f.storage[key] <= 0) delete f.storage[key]; }
      else { d.toast('가방에도 보관함에도 없어요 🎒'); return false; }
      f.displayed[key] = (f.displayed[key] ?? 0) + 1;
      d.save();
      d.emit('display', { id: key, on: true, n: f.displayed[key] });
      d.toast(`${name(key)}을(를) 진열장에 올렸어요 🏠✨`);
      tryRescue();
      return true;
    }
    if (!((f.displayed[key] ?? 0) > 0)) return false;
    let where: 'bag' | 'storage';
    if (!st.canAdd || st.canAdd(key, 1)) where = 'bag';
    else if (storageFits(f.storage, key, 1, sRules())) where = 'storage';
    else { d.toast('가방도 보관함도 꽉 찼어요! 🎒'); return false; }
    f.displayed[key] -= 1;
    if (f.displayed[key] <= 0) delete f.displayed[key];
    if (where === 'bag') st.addItem(key, 1); else f.storage[key] = (f.storage[key] ?? 0) + 1;
    d.save();
    d.emit('display', { id: key, on: false, n: f.displayed[key] ?? 0 });
    d.toast(`${name(key)}을(를) ${where === 'bag' ? '가방' : '보관함'}에 넣었어요`);
    return true;
  };
  const displayed = () => Object.entries(F().displayed).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n }));

  // ── 섬 개발 투자(islanddev 가 부른다) ──
  const invest = (island: string, cost: Cost): boolean => {
    if (!island || !cost) return false;
    const short = d.shortfall(cost);
    if (short) { d.toast(short); return false; }
    if (!d.spend(cost, 'invest')) return false;
    const f = F();
    const rec = (f.invested[island] ??= { coins: 0, stars: 0, items: {}, n: 0 });
    rec.coins += cost.coins ?? 0;
    rec.stars += cost.stars ?? 0;
    for (const [k, v] of Object.entries(cost.items ?? {})) if (v > 0) rec.items[k] = (rec.items[k] ?? 0) + v;
    rec.n += 1;
    d.save();
    d.emit('invest', { island, cost, total: { ...rec, items: { ...rec.items } } });
    let nm = island;
    try { nm = ctx.island.islandName(island) || island; } catch { nm = island; }
    d.toast(`🏗️ ${nm} 개발에 투자했어요! 섬이 쑥쑥 자라요`);
    return true;
  };
  const invested = (island?: string) => {
    const f = F();
    if (island) { const r = f.invested[island]; return r ? { ...r, items: { ...r.items } } : { coins: 0, stars: 0, items: {}, n: 0 }; }
    return Object.fromEntries(Object.entries(f.invested).map(([k, r]) => [k, { ...r, items: { ...r.items } }]));
  };

  // ── 재활용 포인트(너구리 고물상) ──
  const addRecycle = (points: number) => {
    if (!(points > 0)) return 0;
    const f = F();
    f.recycleTotal += points;
    const { stars, left } = recycleToStars(f.recycle + points);
    f.recycle = left;
    d.save();
    if (stars > 0) d.addStars(stars, 'recycle');
    d.emit('recycle', { points, stars, left });
    return stars;
  };

  // ── 이벤트: 가방이 꽉 차서 못 넣은 친구 → 잠깐 뒤 '놓아주기/버리기' 창 ──
  let promptAt = -Infinity;
  let promptPending: { id: string; at: number; rescue: boolean } | null = null;
  st.on((e) => {
    if (e.type === 'collect') {
      const s = e.species as Species | undefined;
      if (s) lastCollect = { id: e.variant ? `${s.id}@${e.variant}` : s.id, kept: e.kept !== false, t: game.time ?? 0 };
      return;
    }
    if (e.type === 'register') { nameFigures(); return; }
    if (e.type !== 'bag-full') return;
    const id = String(e.id ?? '');
    if (!id) return;
    const t = game.time ?? 0;
    const blocked = !!lastCollect && !lastCollect.kept && lastCollect.id === id && t - lastCollect.t < 0.5;
    if (blocked) rescue = { id, t };
    if (t - promptAt < FULL_PROMPT_GAP && t >= promptAt) return;
    promptPending = { id, at: t + FULL_PROMPT_DELAY, rescue: blocked };
  });
  const promptTick = (t: number) => {
    const pp = promptPending;
    if (!pp || t < pp.at) return;
    promptPending = null;
    // 선물(맡아 두기)로 넘어간 것·이미 자리가 난 것은 묻지 않는다
    const pend = (d.flags().pending ?? {}) as Record<string, number>;
    if (!pp.rescue && (pend[pp.id] ?? 0) > 0) return;
    if (pp.rescue && tryRescue()) return;
    if (game.hud?.isOpen?.()) return;
    promptAt = t;
    try { game.hud?.open?.('bagfull', undefined, { id: pp.id, rescue: pp.rescue }); } catch { /* HUD 없음 */ }
  };

  // 매 프레임: 버프 끝 · 꽉 참 창 · 오래된 꾸러미
  game.onUpdate((t) => {
    pruneTick(t);
    promptTick(t);
    if (rescue && t - rescue.t > 300) rescue = null;
    for (let i = drops.length - 1; i >= 0; i--) if (t - drops[i].t0 > DROP_LIFE) removeDrop(drops[i]);
  });

  return {
    use, addBuff, buffs, rollMods, buffMult, useInvite,
    capsule, figurine, figureList,
    release, drop, dismissRescue, rescuePending: () => rescue?.id ?? null, drops: () => drops.map((x) => ({ id: x.id, n: x.n, x: x.x, z: x.z })),
    storage, display, displayed, displayMax: () => displayMax(houseLevel()),
    invest, invested, addRecycle, recycle: () => ({ points: F().recycle, total: F().recycleTotal }),
    released: () => ({ ...F().released }),
    capsuleInfo: () => ({ ...F().capsule, got: { ...F().capsule.got } }),
    grades: GRADE_NAME, capsulePrize: (id: string) => CAPSULE_BY_ID.get(id) ?? null,
  };
}
export type P1Api = ReturnType<typeof installP1>;
