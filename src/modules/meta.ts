// meta — 업적 65(GDD 5.7) · 일일 미션 5/일(4.10) · 세트 수집 보너스 + 특전(4.11) · 숙련 별(중복 처리) · 섬 도감 %(4.1.1) · 모험 일지(J).
// 이벤트(catch·collect·sell·chest-open·harvest·discover·mount·befriend·tino …)를 세서 flags.meta 에 쌓고,
// 다음 프레임에 한 번 판정해 보상을 준다(반짝별·열쇠 조각·물건·해금은 전부 game.econ 을 거친다 — 없으면 밀려 뒀다가 준다).
// 날씨 조건 업적은 이벤트가 난 그 순간의 game.env(weather·tod)로 센다. 수영 거리·해류·모터보트 속도·달 점프는 4Hz 로 살펴본다.
// 한 번 받은 보상은 flags.meta.ach/sets/ms.done/mastery/isl 에 남아 다시 불러와도 두 번 주지 않는다.
// 업적·미션·세트를 끝내면 'achievement' · 'mission-done' · 'missions-all' · 'set-complete' 를 보낸다(소리는 audio 가 듣고 낸다).
//
// game.ext.meta (주인: meta) = {
//   progress() → {achievements:{done,total}, missions:{done,total,bonus}, sets:{done,total}, mastery:{registered,silver,gold}, stars, day}
//   missions() → Array<{id, text, icon, have, goal, done}>   오늘의 미션 5개
//   achievements() → Array<{id, name, desc, icon, group, stars, done, have, need}>
//   sets() → Array<{id, name, icon, desc, rewardText, done, have, need}>
//   mastery(id) → 0 미등록 · 1 등록 · 2 은별(10회) · 3 금별(왕관 개체)
//   perk(name) → boolean   'rainbowlure' · 'nightvision' · 'ranch' · 'shinynet' · 'greenhouse'
//   islandDex(id) → {got, total, pct, steps}
//   counter(key) → number   누적 카운터(meta/data.ts C)
//   check() → 지금 바로 판정(보통은 다음 프레임에 저절로)
// }
// 디버그: window.__meta { state(), check(), fire(e), missions(), achievements(), sets(), mastery(id), perk(name),
//   grant(achId), finishMission(i?), reroll(), open(tab?), fest(setId?), counters() }
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import type { Species } from '../core/state';
import { isEvent, type GameEvent } from '../core/events';
import {
  ACHIEVEMENTS, ACH_BY_ID, C, ISLAND_DEX_STEPS, ISLAND_KO, MAIN_ISLANDS, MASTERY_STARS, MISSION_BY_ID, MISSION_KEY, MISSION_STARS,
  MISSIONS_ALL_KEY, MISSIONS_ALL_STARS, REWARD_ITEMS, SETS, SET_BY_ID,
  type AchDef, type Reward, type SeenSet, type SetDef,
} from './meta/data';
import {
  achProgress, addSeen, bump, ensureMetaFlags, ensureMissions, islandDex, islandStepsAt, masteryLevel, masteryUps, mergeRewards, missionRows,
  newAchievements, newSets, rewardLine, rollDay, setMax, setProgress, isDexRow,
  type MetaFlags, type MetaView, type SpeciesLike,
} from './meta/logic';
import { journalPanel, JOURNAL } from './meta/panel';
import { showFest, ensureMetaStyle, festPending } from './meta/fest';

export const order = 46;

/** 판정 간격(초) — 이벤트가 몰려도 이만큼에 한 번 */
const EVAL_EVERY = 0.2;
/** 세상 살피기 간격(초) */
const POLL_EVERY = 0.25;
/** 한 번 판정에서 업적 카드가 이보다 많으면 한 장으로 묶는다 */
const CARD_BURST = 3;
/** 해류: 이 세기 이상이면 '해류 위' */
const CURRENT_MIN = 0.2;
/** 순간이동으로 치는 한 번 이동 거리(m) */
const TELEPORT_M = 60;

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const g: Game = game;
  const st = g.state;
  const I = ctx.island;

  // ───────────── 저장 ─────────────
  let fl: MetaFlags | null = null;
  const F = (): MetaFlags => {
    if (!fl || st.flags.meta !== fl) fl = ensureMetaFlags(st.flags);
    return fl;
  };
  const save = () => st.save();
  const day = () => Math.max(0, Math.floor(g.env?.day ?? g.econ?.day?.() ?? 0));

  // 세트 보상 물건은 이름·아이콘이 보이도록 'item' 칸으로(도감 탭엔 안 나온다)
  st.register(REWARD_ITEMS.map((r): Species => ({ id: r.id, name: r.name, category: 'item', rarity: 3, desc: r.desc, tags: ['meta-reward'] })));

  // ───────────── 읽기 창 ─────────────
  let speciesCache: SpeciesLike[] | null = null;
  const speciesList = (): SpeciesLike[] => (speciesCache ??= [...st.species.values()] as SpeciesLike[]);
  const seenCount = (set: SeenSet): number => {
    const own = new Set(F().seen[set]);
    const geo = g.geo;
    if (set === 'island') for (const id of MAIN_ISLANDS) { if (geo?.discovered?.(id)) own.add(id); }
    else if (set === 'islet') for (const d of I.ISLANDS) { if (d.theme === 'islet' && geo?.discovered?.(d.id)) own.add(d.id); }
    else if (set === 'landmark') for (const l of geo?.landmarks ?? []) { if (geo?.discovered?.(l.id)) own.add(l.id); }
    else if (set === 'lighthouse') for (const id of I.LIGHTHOUSE_ISLANDS) { if (g.econ?.isUnlocked?.(`lighthouse:${id}`)) own.add(id); }
    return own.size;
  };
  const view: MetaView = {
    counter: (k) => F().c[k] ?? 0,
    max: (k) => F().max[k] ?? 0,
    get species() { return speciesList(); },
    rec: (id) => st.dex[id],
    byGdd: (id) => st.byGdd(id) as SpeciesLike | undefined,
    seen: seenCount,
    isUnlocked: (k) => { try { return !!g.econ?.isUnlocked?.(k); } catch { return false; } },
    isDonated: (id) => { try { return !!g.econ?.isDonated?.(id); } catch { return false; } },
    skeletons: () => { try { return g.econ?.skeletonsDone?.()?.length ?? 0; } catch { return 0; } },
    rocketParts: () => {
      try { const r = g.econ?.rocket?.(); return r ? Object.values(r.parts).filter(Boolean).length : 0; } catch { return 0; }
    },
  };

  // ───────────── 보상 ─────────────
  const perks = () => F().perks;
  const nameOf = (id: string) => st.species.get(id)?.name ?? id;
  /** 보상을 실제로 — econ 이 아직 없으면 밀려 둔다(특전은 바로) */
  const pay = (r: Reward, why: string) => {
    const f = F();
    if (r.perk && !f.perks.includes(r.perk)) f.perks.push(r.perk);
    const econ = g.econ;
    if (!econ) {
      const { perk: _p, ...rest } = r;
      if (Object.keys(rest).length) f.owed.push(rest);
      return;
    }
    if (r.stars) { econ.addStars(r.stars, why); f.stars += r.stars; }
    for (const k of r.keys ?? []) econ.addKeyPiece(k.color, k.n);
    for (const [id, n] of Object.entries(r.items ?? {})) {
      const got = econ.give(id, n, why, { silent: true });
      if (got < n) st.addItem(id, n - got); // 가방이 꽉 차도 기념품은 잃지 않게
    }
    for (const k of r.unlock ?? []) if (!econ.isUnlocked(k)) econ.unlock(k, why);
  };
  const flushOwed = () => {
    const f = F();
    if (!f.owed.length || !g.econ) return;
    const all = mergeRewards(f.owed);
    f.owed = [];
    pay(all, 'meta');
    save();
  };

  // ───────────── 보여 주기 ─────────────
  let selfEmit = 0;
  const emit = (e: GameEvent) => { selfEmit++; try { st.emit(e as never); } finally { selfEmit--; } };
  const card = (title: string, body: string, icon: string, color: string, ms = 3200) => g.hud.card({ title, body, icon, color, ms });
  const fest = (def: SetDef) => {
    const ok = showFest({ title: def.name, icon: def.icon, color: def.color, reward: def.rewardText, rng: ctx.rng(`meta:fest:${def.id}`) });
    g.hud.banner({ text: '세트 완성!', sub: `${def.name} — ${def.rewardText}`, icon: def.icon, color: def.color, ms: 3600 });
    if (!ok) card('🧩 세트 완성!', `${def.name} · ${def.rewardText}`, def.icon, def.color, 4200);
  };
  const rerenderJournal = () => { if (g.hud.isOpen(JOURNAL.kind)) g.hud.rerender(); };

  // ───────────── 판정 ─────────────
  let dirty = true;
  let evalAcc = EVAL_EVERY;
  /** 업적 하나 주기(이미 받았으면 false) */
  /** o.echo=false — 다른 모듈이 이미 'achievement' 를 보낸 경우(소리·리스너가 두 번 울리지 않게 다시 보내지 않는다) */
  const giveAch = (a: AchDef, o: { quiet?: boolean; stars?: number; echo?: boolean } = {}) => {
    const f = F();
    if (f.ach[a.id] !== undefined) return false;
    f.ach[a.id] = day();
    const stars = o.stars ?? a.stars;
    pay({ stars }, `ach:${a.id}`);
    if (o.echo !== false) emit({ type: 'achievement', id: a.id, stars });
    if (!o.quiet) card(`🏆 업적 달성! ${a.name}`, `${a.desc} · ⭐${stars}`, a.icon, '#ffbe3b');
    return true;
  };
  const evaluate = () => {
    const f = F();
    const d = day();
    rollDay(f, d);
    ensureMissions(f, d, ctx.rng);
    flushOwed();
    let changed = false;

    // 미션
    const ms = f.ms!;
    for (const row of missionRows(f)) {
      if (!row.ready) continue;
      ms.done.push(row.id);
      pay({ stars: MISSION_STARS, keys: [MISSION_KEY] }, `mission:${row.id}`);
      emit({ type: 'mission-done', id: row.id });
      card('📝 미션 완료!', `${row.tpl.text} · ⭐${MISSION_STARS} + 🗝️`, row.tpl.icon, '#8fdc9a', 2600);
      changed = true;
    }
    if (!ms.bonus && ms.ids.length && ms.ids.every((id) => ms.done.includes(id))) {
      ms.bonus = true;
      pay({ stars: MISSIONS_ALL_STARS, keys: [MISSIONS_ALL_KEY] }, 'missions-all');
      emit({ type: 'missions-all', day: ms.day });
      card('🏅 오늘의 미션 올클리어!', `다섯 개 모두 끝! 보너스 ⭐${MISSIONS_ALL_STARS} + 🔑 금열쇠 조각`, '🏅', '#ff9cb8', 3600);
      changed = true;
    }

    // 업적
    const achs = newAchievements(f, view);
    const burst = achs.length > CARD_BURST;
    for (const a of achs) giveAch(a, { quiet: burst });
    if (burst) {
      const stars = achs.reduce((s, a) => s + a.stars, 0);
      card(`🏆 업적 ${achs.length}개 달성!`, `${achs.slice(0, 4).map((a) => a.name).join(' · ')}${achs.length > 4 ? ' …' : ''} · ⭐${stars}`, '🏆', '#ffbe3b', 4200);
    }
    if (achs.length) changed = true;

    // 세트
    for (const s of newSets(f, view)) {
      f.sets[s.id] = d;
      pay(s.reward, `set:${s.id}`);
      emit({ type: 'set-complete', id: s.id });
      fest(s);
      changed = true;
    }

    // 숙련
    const ups = masteryUps(f, view);
    if (ups.length) {
      let stars = 0;
      const gold: string[] = [];
      for (const u of ups) {
        for (let lv = u.from + 1; lv <= u.to; lv++) stars += MASTERY_STARS[lv] ?? 0;
        if (u.to >= 3 && u.from < 3) gold.push(u.s.name ?? u.s.id);
        f.mastery[u.s.id] = u.to;
      }
      if (stars > 0) {
        pay({ stars }, 'mastery');
        const silver = ups.filter((u) => u.to === 2 && u.from < 2).map((u) => u.s.name ?? u.s.id);
        if (gold.length) card('🥇 금별 숙련!', `${gold.slice(0, 3).join(' · ')}${gold.length > 3 ? ' …' : ''} · ⭐${stars}`, '🥇', '#ffd36b');
        else if (silver.length) g.hud.toast(`🥈 ${silver.slice(0, 2).join(' · ')}${silver.length > 2 ? ' …' : ''} 은별 숙련! ⭐${stars}`);
      }
      changed = true;
    }

    // 섬 도감 %
    for (const id of MAIN_ISLANDS) {
      const dx = islandDex(view, id);
      if (dx.total <= 0) continue;
      const reached = islandStepsAt(dx.pct);
      const had = f.isl[id] ?? 0;
      if (reached <= had) continue;
      let stars = 0;
      for (let k = had; k < reached; k++) stars += ISLAND_DEX_STEPS[k].stars;
      f.isl[id] = reached;
      pay({ stars }, `island-dex:${id}`);
      const top = ISLAND_DEX_STEPS[reached - 1];
      card(`🗺️ ${ISLAND_KO(id)} 도감 ${top.pct}%!`, `${top.pct >= 100 ? '섬 왕관 👑 ' : ''}⭐${stars}`, top.pct >= 100 ? '👑' : '🗺️', '#7cc8ff');
      changed = true;
    }

    if (changed) { save(); rerenderJournal(); }
  };
  const check = () => { dirty = false; evalAcc = 0; evaluate(); };

  // ───────────── 이벤트 세기 ─────────────
  const env = () => g.env;
  const isNight = () => (env()?.tod ?? 'day') === 'night';
  const weatherNow = () => env()?.weather ?? 'clear';
  let raftFrom: string | null = null;
  let lastLand: string | null = null;

  const onEvent = (e: GameEvent) => {
    const f = F();
    rollDay(f, day());
    switch (e.type) {
      case 'register': speciesCache = null; break;
      case 'catch': if (isEvent(e, 'catch')) {
        const act = String(e.activity ?? '');
        const sp = e.species as Species | undefined;
        if (act === 'fish' || act === 'moonfish') {
          bump(f, C.fish);
          if (act === 'moonfish' || g.world === 'space') bump(f, C.moonfish);
          else if ((weatherNow() === 'rain' || weatherNow() === 'storm') && isNight()) bump(f, C.rainNightFish);
        } else if (act === 'bug') bump(f, C.bug);
        else if (act === 'dive') bump(f, C.dive);
        else if (act === 'space') bump(f, C.space);
        if ((e.rarity ?? sp?.rarity ?? 0) >= 3) bump(f, C.r3);
        if (typeof e.combo === 'number') setMax(f, C.combo, e.combo);
        try { if (sp && g.econ?.market?.().hot?.includes(sp.id)) bump(f, C.hot); } catch { /* 시세 없음 */ }
      } break;
      case 'catch-fail': bump(f, 'catch-fail'); break;
      case 'collect': if (isEvent(e, 'collect')) {
        const sp = e.species;
        if (sp && e.isNew && isDexRow(sp as SpeciesLike)) bump(f, C.newDex);
        if (sp?.id === 'd_mimic_crab' || sp?.gdd === 'd_mimic_crab') bump(f, C.mimic);
      } break;
      case 'sell': if (isEvent(e, 'sell')) {
        const coins = Math.max(0, Number(e.coins) || 0);
        bump(f, C.sold, coins);
        setMax(f, C.sellDay, f.d.c[C.sold] ?? 0);
      } break;
      case 'coins': if (isEvent(e, 'coins') && e.delta > 0) bump(f, C.earned, e.delta); break;
      case 'craft': bump(f, C.craft); break;
      case 'donate': bump(f, C.donate); break;
      case 'chest-open': {
        const src = String((e as { source?: unknown }).source ?? '');
        if (src === 'mimic' || (e as { mimic?: unknown }).mimic) break; // 상자게가 도망친 것 — 잡으면 collect 로 센다
        bump(f, C.chest);
        if ((e as { tier?: unknown }).tier === 'gold') bump(f, C.chestGold);
        if (src === 'wreck') bump(f, C.chestWreck);
        else if (src === 'tino') bump(f, C.chestTino);
        else if (src === 'treasure-map') bump(f, C.chestMap);
      } break;
      case 'harvest': if (isEvent(e, 'harvest')) {
        bump(f, `harvest:${e.kind}`);
        // 유성우 밤 별가루(하늘에서 떨어진 것·크레이터에서 주운 것 모두)
        if (e.item === 'm_stardust' && weatherNow() === 'meteor') bump(f, C.meteorDust, Math.max(1, Number(e.n) || 1));
      } break;
      case 'tree-shake': bump(f, C.shake); break;
      case 'rock-hit': bump(f, C.rock); break;
      case 'stung': bump(f, C.stung); break;
      case 'discover': if (isEvent(e, 'discover')) {
        const set: SeenSet = e.kind === 'islet' ? 'islet' : e.kind === 'landmark' ? 'landmark' : 'island';
        const place = String(e.place ?? '').replace(/^(island|isl)[:_]/, '');
        // 달·행성 장소(moon:… · planet:…)는 군도 랜드마크 업적에 넣지 않는다
        if (set === 'landmark' && /^(moon|planet)[:_]/.test(place)) break;
        if (set !== 'island' || (MAIN_ISLANDS as readonly string[]).includes(place)) addSeen(f, set, place);
      } break;
      case 'mount': if (isEvent(e, 'mount')) {
        const v = String(e.vehicle ?? '');
        if (v.startsWith('dino')) bump(f, C.dinoRide);
        bump(f, `mount:${v}`);
      } break;
      case 'launch': bump(f, C.launch); break;
      case 'arrive': if (isEvent(e, 'arrive') && e.to && e.to !== 'earth') bump(f, C.travel); break;
      case 'befriend': if (isEvent(e, 'befriend') && e.kind === 'dino') {
        setMax(f, C.dinoHearts, Number(e.hearts) || 0);
        if ((e as { why?: unknown }).why === 'feed') bump(f, C.feed);
      } break;
      case 'tino': if (isEvent(e, 'tino') && e.state === 'wake') bump(f, C.tinoWake); break;
      case 'unlock': if (isEvent(e, 'unlock')) {
        bump(f, C.unlock);
        if (e.key.startsWith('lighthouse:')) addSeen(f, 'lighthouse', e.key.slice(11));
      } break;
      case 'lighthouse': if (isEvent(e, 'lighthouse') && e.lit) addSeen(f, 'lighthouse', e.island); break;
      case 'release': if (isEvent(e, 'release')) bump(f, C.release, Math.max(1, Number(e.n) || 1)); break;
      case 'photo': bump(f, C.photo); break;
      case 'secret-found': bump(f, C.secret); break;
      case 'achievement': if (isEvent(e, 'achievement') && !selfEmit) {
        // 다른 모듈이 알린 업적(예: 탈것이 직접 잰 최고 속도) — 표에 있으면 meta 가 보상까지 맡는다
        const a = ACH_BY_ID.get(e.id);
        if (a) giveAch(a, { stars: a.stars, echo: false });
      } break;
      case 'day': rollDay(f, day()); break;
      default: return;
    }
    dirty = true;
    save();
  };
  st.on(onEvent);

  // ───────────── 세상 살피기(수영·해류·속도·여행·달 점프) ─────────────
  let pollAcc = 0;
  let lastPos: { x: number; z: number } | null = null;
  const poll = () => {
    const f = F();
    const p = g.player.pos;
    let touched = false;
    if (g.world === 'earth' && !g.focusOverride) {
      const s = I.worldSample(p.x, p.z);
      const coast = I.coastDistAt(p.x, p.z);
      const land = s.island && coast > 0 ? s.island.id : null;
      // 다른 섬 가기: 땅에 발을 디딘 섬이 바뀌었을 때
      lastLand ??= f.lastLand ?? null;
      if (land && lastLand && land !== lastLand) { bump(f, C.travel); touched = true; }
      if (land && land !== f.lastLand) { f.lastLand = land; touched = true; }
      if (land) lastLand = land;
      // 뗏목으로 다른 섬(해안 25m 안까지 오면)
      const veh = (() => { try { return g.vehicles?.current?.() ?? null; } catch { return null; } })();
      if (veh?.kind === 'raft') {
        raftFrom ??= lastLand ?? s.island?.id ?? null;
        if (s.island && coast > -25 && raftFrom && s.island.id !== raftFrom && !(f.c[C.raft] > 0)) { bump(f, C.raft); touched = true; }
      } else raftFrom = null;
      // 모터보트 최고 속도
      if (veh?.kind === 'motorboat' && setMax(f, C.speed, Math.floor(veh.speed * 10) / 10)) touched = true;
      // 탈것이 저장한 최고 속도(부스트 순간까지 잰다) — 폴링이 놓친 짧은 최고점
      const topBoat = (() => { try { return Number(g.vehicles?.stats?.().top?.motorboat) || 0; } catch { return 0; } })();
      if (topBoat > 0 && setMax(f, C.speed, Math.floor(topBoat * 10) / 10)) touched = true;
      // 해류 띠를 배로 탄 거리(seaworld 가 잰다) — 소용돌이를 빼고 띠만 센다
      const rode = (() => { try { return Number((g.ext as { currents?: { rode?(): number } }).currents?.rode?.()) || 0; } catch { return 0; } })();
      if (rode > (f.c[C.current] ?? 0)) { f.c[C.current] = rode; touched = true; }
      // 먼바다 수영(해안에서 잰 거리)
      const swimming = g.player.mode === 'swim' || g.player.mode === 'dive' || !!g.ocean?.swimming;
      if (swimming && coast < 0 && setMax(f, C.swim, Math.floor(-coast))) touched = true;
      // 해류 타기: 바다 위(수영·배)에서 해류 띠 안을 움직인 거리
      if (lastPos && coast < 0 && (swimming || veh?.boat)) {
        const cur = (() => { try { return g.geo?.currentAt?.(p.x, p.z) ?? null; } catch { return null; } })();
        const moved = Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
        if (cur && Math.hypot(cur.x, cur.z) >= CURRENT_MIN && moved < TELEPORT_M && moved > 0.05) { bump(f, C.current, moved); touched = true; }
      }
      lastPos = { x: p.x, z: p.z };
    } else lastPos = null;
    if (touched) { dirty = true; save(); }
  };
  /** 달 높이뛰기 — 우주에선 매 프레임(정점을 놓치지 않게) */
  const moonJump = () => {
    if (g.world !== 'space') return;
    const planet = g.space?.planet ?? 'moon';
    if (planet !== 'moon') return;
    const m = g.player.mode;
    if (m !== 'air' && m !== 'glide') return;
    const p = g.player.pos;
    const h = p.y - g.groundAt(p.x, p.z);
    if (h > 0.5 && setMax(F(), C.moonJump, Math.floor(h * 10) / 10)) dirty = true;
  };

  g.onUpdate((_t, dt) => {
    moonJump();
    pollAcc += dt;
    if (pollAcc >= POLL_EVERY) { pollAcc = 0; poll(); }
    if (F().d.day !== day()) dirty = true;
    evalAcc += dt;
    if (dirty && evalAcc >= EVAL_EVERY) check();
  });

  // ───────────── 공개 API ─────────────
  const achRows = () => ACHIEVEMENTS.map((def) => ({ def, done: F().ach[def.id] !== undefined, p: achProgress(def, view) }));
  const setRows = () => SETS.map((def) => ({ def, done: F().sets[def.id] !== undefined, p: setProgress(def, view) }));
  const masteryRows = () => speciesList().filter((s) => isDexRow(s) && st.dex[s.id]).map((s) => ({ s, level: masteryLevel(st.dex[s.id]) }));
  const islandRows = () => MAIN_ISLANDS.map((id) => {
    const dx = islandDex(view, id);
    return { id, name: ISLAND_KO(id), ...dx, steps: F().isl[id] ?? 0 };
  });
  const missionList = () => { const f = F(); rollDay(f, day()); ensureMissions(f, day(), ctx.rng); return missionRows(f); };

  const api = {
    progress: () => {
      const f = F();
      const ms = missionList();
      const mr = masteryRows();
      return {
        day: day(),
        achievements: { done: Object.keys(f.ach).filter((id) => ACH_BY_ID.has(id)).length, total: ACHIEVEMENTS.length },
        missions: { done: ms.filter((m) => m.done).length, total: ms.length, bonus: !!f.ms?.bonus },
        sets: { done: Object.keys(f.sets).filter((id) => SET_BY_ID.has(id)).length, total: SETS.length },
        mastery: { registered: mr.length, silver: mr.filter((r) => r.level >= 2).length, gold: mr.filter((r) => r.level >= 3).length },
        stars: f.stars,
      };
    },
    missions: () => missionList().map((m) => ({ id: m.id, text: m.tpl.text, icon: m.tpl.icon, have: m.have, goal: m.goal, done: m.done })),
    achievements: () => achRows().map(({ def, done, p }) => ({ id: def.id, name: def.name, desc: def.desc, icon: def.icon, group: def.group, stars: def.stars, done, have: p.have, need: p.need })),
    sets: () => setRows().map(({ def, done, p }) => ({ id: def.id, name: def.name, icon: def.icon, desc: def.desc, rewardText: def.rewardText, done, have: p.have, need: p.need })),
    mastery: (id: string) => masteryLevel(st.dex[st.byGdd(id)?.id ?? id]),
    perk: (name: string) => perks().includes(name),
    islandDex: (id: string) => ({ ...islandDex(view, id), steps: F().isl[id] ?? 0 }),
    counter: (key: string) => F().c[key] ?? 0,
    check,
  };
  g.ext.meta = api;

  // ───────────── 일지 창(J) ─────────────
  ensureMetaStyle();
  g.hud.registerPanel(journalPanel({
    day,
    missions: missionList,
    bonus: () => !!F().ms?.bonus,
    achievements: achRows,
    sets: setRows,
    masteryRows,
    islands: islandRows,
    starsEarned: () => F().stars,
    isGot: (def, id) => (def.mode === 'donate' ? view.isDonated(id) : !!st.dex[id]),
  }));
  g.hud.registerHotkey({
    id: 'meta:journal', code: 'KeyJ', label: '일지', hint: true, panel: JOURNAL.kind,
    run: () => g.hud.toggle(JOURNAL.kind),
  });
  // 창이 열려 있는 동안 진행이 바뀌면 다시 그린다(판정에서 바뀐 것 말고도 카운터 진행 막대)
  let redrawAcc = 0;
  g.onUpdate((_t, dt) => {
    if (!g.hud.isOpen(JOURNAL.kind)) return;
    redrawAcc += dt;
    if (redrawAcc > 1) { redrawAcc = 0; g.hud.rerender(); }
  });

  // ───────────── 디버그 ─────────────
  if (typeof window !== 'undefined') {
    (window as unknown as { __meta?: unknown }).__meta = {
      ...api,
      state: () => JSON.parse(JSON.stringify(F())) as MetaFlags,
      counters: () => ({ ...F().c }),
      /** 이벤트를 흉내 내 쏘고 바로 판정 */
      fire: (e: GameEvent) => { st.emit(e as never); check(); return api.progress(); },
      /** 업적 하나 바로 주기 */
      grant: (id: string) => { const a = ACH_BY_ID.get(id); const ok = a ? giveAch(a) : false; save(); return ok; },
      /** 오늘 미션 i번째(없으면 다음 남은 것)를 채운다 */
      finishMission: (i?: number) => {
        const rows = missionList();
        const r = i !== undefined ? rows[i] : rows.find((x) => !x.done);
        if (!r || r.done) return null;
        const f = F();
        f.d.c[r.tpl.key] = Math.max(f.d.c[r.tpl.key] ?? 0, r.goal);
        check();
        return r.id;
      },
      /** 오늘 미션을 새로 굴림(진행은 그대로) */
      reroll: () => { F().ms = null; check(); return api.missions(); },
      open: (tab?: string) => g.hud.open(JOURNAL.kind, tab),
      /** 세트 축하 미리 보기(보상 없음) */
      fest: (id = 'set-rainbow-guppy') => { const s = SET_BY_ID.get(id); if (s) fest(s); return festPending(); },
      missionTemplates: () => [...MISSION_BY_ID.keys()],
      rewardLine: (id: string) => { const s = SET_BY_ID.get(id); return s ? rewardLine(s.reward, nameOf) : null; },
    };
  }
}
