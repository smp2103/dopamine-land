// 진행·해금 판정(GDD 4.8·6.1) — 부수효과 없는 순수 술어. 다른 모듈(vehicles·village·hud)도 읽기 전용으로 가져다 쓴다.
//   canMount(kind, econ) · canLaunch(econ) · islandsVisited(flags) · rocketStatus(isUnlocked) · gateCheck(…) · requirementText(…)
// 실제 해금을 바꾸는 건 economy.ts 의 econ.unlock 하나뿐이다.
import type { Cost, RocketStatus } from '../../core/api';
import {
  SHOP_ITEMS, RECIPES, ROCKET_PARTS, NAV_CHIP, GATE_COUNTERS, parseGate, costOf, needsOf, itemDef, GOODS,
  type ShopItem, type Recipe,
} from './data';
import { costText, needsText, fmt } from './currency';

/** isUnlocked 만 있으면 되는 econ 모양(가짜·진짜 둘 다) */
export interface EconLike { isUnlocked(key: string): boolean; p0?: boolean; cheat?: boolean }

/** 바깥 섬(말랑섬 빼고) — '섬 N곳 방문' 은 여기서 센다 */
export const OUTER_ISLANDS = ['dino', 'ice', 'mushroom', 'coral', 'desert', 'launch'] as const;

/** 탈것 짧은 이름(잠금 안내용) */
export const VEHICLE_NAME: Record<string, string> = {
  bike: '자전거', scooter: '스쿠터', kart: '꼬마 카트', raft: '뗏목', duck_tube: '오리튜브', tugboat: '통통배', yacht: '돛단요트',
  motorboat: '모터보트', jetski: '수상바이크', submarine: '잠수정', sled: '펭귄 썰매', buggy: '모래 버기', balloon: '열기구',
  plane: '꼬마비행기', rover: '달 로버', moon_rover: '달 로버', ufo: 'UFO', rocket: '로켓',
};
/** 상점 이름 */
export const SHOP_NAME: Record<string, string> = {
  quack: '꽥꽥상회', shipyard: '통통 조선소', peng: '펭박사 연구소', beach: '찰랑 해변 가게', bazaar: '모래 바자르', diving: '뽀글 다이빙 숍',
  potion: '몽글 물약 가게', moon: '떡순이네 떡집', junk: '너구리 고물상', station: '꾸물이 정거장', sheep: '보들 양 옷가게', capsule: '두근두근 캡슐머신',
};

// ── 탈것·로켓 ──

/** 이 탈것을 탈 수 있나 — v:<kind>, 면허(licence:<kind>), 공룡(dino:<id>), 로켓은 canLaunch */
export function canMount(kind: string, econ: EconLike | null | undefined): boolean {
  if (!econ) return true;
  const k = kind.replace(/^v[_:]/, '');
  if (k === 'rocket') return canLaunch(econ);
  if (econ.isUnlocked(`v:${k}`) || econ.isUnlocked(`licence:${k}`)) return true;
  if (k === 'moon_rover') return econ.isUnlocked('v:rover');
  const dino = /^dino_(.+)$/.exec(k);
  // 공룡은 v:dino_<짧은 id> 가 정본 — 친구 키 dino:<짧은 id> · dino:dino-<짧은 id>(dinos 의 spec.id) 도 받는다
  if (dino) return econ.isUnlocked(`dino:${dino[1]}`) || econ.isUnlocked(`dino:dino-${dino[1]}`);
  // 스쿠터: 계약 2 의 v:scooter 키(없으면 위에서 v:scooter 로 이미 봤다) — 자전거 키로도 탄다
  if (k === 'scooter') return econ.isUnlocked('v:bike');
  return false;
}

/** 로켓 부품·발사대 상태 */
export function rocketStatus(isUnlocked: (k: string) => boolean): RocketStatus {
  const parts = { body: false, engine: false, window: false, wing: false, fuel: false, chip: false };
  let count = 0;
  for (const p of ROCKET_PARTS) if (isUnlocked(p.key)) { parts[p.part] = true; count++; }
  return { blueprint: isUnlocked('rocket:blueprint'), parts, count, pad: isUnlocked('rocket:pad') };
}

/** 발사할 수 있나: 부품 6개 + 발사대 */
export function canLaunch(econ: EconLike | null | undefined): boolean {
  if (!econ) return false;
  const r = rocketStatus((k) => econ.isUnlocked(k));
  return r.count >= ROCKET_PARTS.length && r.pad;
}

/** 항법 칩에 필요한 별자리 물고기 기증 수(P0 3 · 정식 12) */
export const navChipNeed = (p0: boolean) => (p0 ? NAV_CHIP.p0 : NAV_CHIP.full);

// ── 방문한 섬 ──

/**
 * 방문한 바깥 섬 수 — flags.world.disc(worldterrain 발견 기록: 배열이든 {id:…} 든)와
 * flags.econ.counters.visit_<섬>(economy 가 discover 이벤트로 센 것)을 합친다. 'island:dino' 꼴 id 도 받는다.
 */
export function islandsVisited(flags: Record<string, unknown> | null | undefined): number {
  return visitedIslands(flags).length;
}
export function visitedIslands(flags: Record<string, unknown> | null | undefined): string[] {
  const got = new Set<string>();
  const f = (flags ?? {}) as Record<string, any>;
  const see = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const id = raw.replace(/^(island|isl|visit)[:_]/, '');
    if ((OUTER_ISLANDS as readonly string[]).includes(id)) got.add(id);
  };
  const disc = f.world?.disc;
  if (Array.isArray(disc)) disc.forEach(see);
  else if (disc && typeof disc === 'object') for (const [k, v] of Object.entries(disc)) if (v) see(k);
  const ctr = f.econ?.counters;
  if (ctr && typeof ctr === 'object') for (const [k, v] of Object.entries(ctr)) if (k.startsWith('visit_') && Number(v) > 0) see(k.slice(6));
  return [...got];
}

// ── 조건(gate) ──

/** 조건 판정에 필요한 것 */
export interface GateEnv {
  isUnlocked(key: string): boolean;
  /** cond 카운터 값(fish·bug·islands·homeDex·parts·visit_ice …) */
  counter(name: string): number;
  p0: boolean;
}
/** P0 에서 빼는 조건(섬 방문·도감 %) */
const P0_DROPPED = (counter: string) => counter === 'islands' || counter === 'homeDex' || counter.startsWith('visit_');

export interface GateResult { ok: boolean; why?: string }

/** gate 문자열 하나 판정 + 안 될 때 사람 말 */
export function gateCheck(gate: string | undefined | null, env: GateEnv, rid?: string): GateResult {
  const g = parseGate(gate, rid);
  switch (g.type) {
    case 'base': return { ok: true };
    case 'card': return env.isUnlocked(g.key) ? { ok: true } : { ok: false, why: `레시피 카드가 필요해요 (⭐${g.stars}) 📇` };
    case 'key': return env.isUnlocked(g.key) ? { ok: true } : { ok: false, why: keyNeedText(g.key) };
    case 'cond': {
      if (env.p0 && P0_DROPPED(g.counter)) return { ok: true };
      const have = env.counter(g.counter);
      if (have >= g.n) return { ok: true };
      return { ok: false, why: condText(g.counter, g.n, have) };
    }
  }
}

/** 'cond' 안내: '낚시 횟수 12/30' · '로켓 부품 3/6' */
function condText(counter: string, n: number, have: number): string {
  if (counter === 'parts') return `로켓 부품 ${Math.min(have, n)}/${n}개를 먼저 모아요 🚀`;
  if (counter === 'homeDex') return `말랑섬 도감 ${Math.floor(have)}/${n}% 🐟`;
  if (counter === 'islands') return `섬 ${have}/${n}곳 방문 🏝️`;
  if (counter.startsWith('visit_')) return `${GATE_COUNTERS[counter] ?? '그 섬'}이 필요해요 🏝️`;
  return `${GATE_COUNTERS[counter] ?? counter} ${fmt(have)}/${fmt(n)}`;
}

/** 해금 키가 없을 때 한 줄 */
function keyNeedText(key: string): string {
  if (key === 'rocket:blueprint') return '펭박사의 로켓 설계도가 필요해요 📜';
  if (key.startsWith('facility:')) return '그 시설이 생기면 열려요 🏗️';
  if (key.startsWith('recipe:')) return '레시피 카드가 필요해요 📇';
  if (key.startsWith('wing:')) return '박물관 증축이 필요해요 🏛️';
  if (key.startsWith('space:')) return '우주에 다녀오면 열려요 🚀';
  if (/^(bag|house):\d$/.test(key)) return '앞 단계를 먼저 사요 🎒';
  return `${labelOf(key)}이(가) 필요해요 🔒`;
}

// ── 잠금 안내(requirement) ──

/** 해금 키를 여는 상점 품목·레시피 */
export const shopForKey = (key: string): ShopItem | undefined => SHOP_ITEMS.find((s) => s.unlock === key && !s.p1) ?? SHOP_ITEMS.find((s) => s.unlock === key);
export const recipeForKey = (key: string): Recipe | undefined => RECIPES.find((r) => r.unlock === key && !r.extra);

/** 해금 키의 짧은 이름 */
export function labelOf(key: string): string {
  const v = /^(?:v|licence):(.+)$/.exec(key);
  if (v) return VEHICLE_NAME[v[1]] ?? v[1];
  if (key === 'rocket' || key === 'rocket:pad') return key === 'rocket' ? '로켓' : '발사대';
  if (key === 'rocket:blueprint') return '로켓 설계도';
  const part = ROCKET_PARTS.find((p) => p.key === key);
  if (part) return `로켓 ${part.name}`;
  const t = /^tool:(.+)$/.exec(key);
  if (t) return GOODS[`tool_${t[1]}`]?.name ?? t[1];
  const sh = shopForKey(key);
  if (sh) return sh.name.replace(/ ×\d+$/, '');
  const r = recipeForKey(key);
  if (r) return r.name;
  return itemDef(key)?.name ?? key;
}

/** 코인만이면 숫자만('1,600'), 아니면 '⭐20' · '30,000 · 통통 엔진 1' */
function priceShort(c: Cost): string {
  if (c.coins && !c.stars && !Object.keys(c.items ?? {}).length) return fmt(c.coins);
  return costText(c, nameOf).replace(/(\d)코인/g, '$1');
}

/** 안내에 쓰는 이름표 */
const nameOf = (id: string) => itemDef(id)?.name ?? GOODS[id]?.name ?? id;

/**
 * 잠금 안내 한 줄: '🔒 자전거 — 꽥꽥상회 1,600' · '🔒 로켓 — 부품 3/6 · 발사대' · '🔒 뗏목 — 작업대 나무 4 + 덩굴 밧줄 1'.
 * 열려 있으면 ok:true 와 '✅ 자전거'.
 */
export function requirementText(key: string, econ: EconLike, p0: boolean): { ok: boolean; text: string } {
  const k = key.startsWith('v_') ? `v:${key.slice(2)}` : key;
  const label = labelOf(k);
  if (k === 'rocket' || k === 'v:rocket') {
    const r = rocketStatus((x) => econ.isUnlocked(x));
    const ok = r.count >= ROCKET_PARTS.length && r.pad;
    if (ok) return { ok, text: '✅ 로켓 — 발사 준비 완료!' };
    const bits = [`부품 ${r.count}/${ROCKET_PARTS.length}`];
    if (!r.pad) bits.push('발사대');
    if (!r.blueprint) bits.unshift('설계도');
    return { ok, text: `🔒 로켓 — ${bits.join(' · ')}` };
  }
  if (econ.isUnlocked(k)) return { ok: true, text: `✅ ${label}` };
  if (k === NAV_CHIP.key) return { ok: false, text: `🔒 ${label} — 별자리 물고기 ${navChipNeed(p0)}종 기증` };
  if (k === 'rocket:pad') {
    const r = rocketStatus((x) => econ.isUnlocked(x));
    const it = shopForKey(k);
    const price = it ? priceShort(costOf(it, p0)) : '';
    return { ok: false, text: `🔒 발사대 — 부품 ${r.count}/${ROCKET_PARTS.length}${price ? ` · 펭박사 ${price}` : ''}` };
  }
  const it = shopForKey(k);
  if (it) return { ok: false, text: `🔒 ${label} — ${SHOP_NAME[it.shop] ?? it.shop} ${priceShort(costOf(it, p0))}` };
  const r = recipeForKey(k);
  if (r) return { ok: false, text: `🔒 ${label} — 작업대 ${needsText(needsOf(r, p0), nameOf)}` };
  if (k.startsWith('dino:') || k.startsWith('v:dino_')) return { ok: false, text: `🔒 ${label} — 공룡과 친해지기 💕` };
  if (k === 'space:moon') return { ok: false, text: '🔒 달 — 로켓을 쏘아 올려요 🚀' };
  if (k.startsWith('dev:') || k.startsWith('lighthouse:')) return { ok: false, text: `🔒 ${label} — 섬 개발로 열려요 🏗️` };
  return { ok: false, text: `🔒 ${label}` };
}
