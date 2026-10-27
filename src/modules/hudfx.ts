// hudfx — HUD 특수 연출(GDD 3.11 · 5.1 · 5.3 · 4.4). hud(order 12)가 그린 화면 위에 '도파민'을 얹는다.
// 1) 잡았다 5단계: hud 의 renderCatch 를 감싸(원래 것을 먼저 부르고) ★1 퐁 · ★2 초록 반짝 · ★3 슬로모·파란 링·줌·색종이 ·
//    ★4 보라 비네트·회전 쇼케이스·무지개 링·박수 · ★5 금빛 하늘·정지 1초·빛기둥·코인 분수·전설 도장·cheer
//    + 반짝이(무지개 테두리·도장) · 왕관(금관·최대 크기 기록 줄) · NEW 쾅(회전 + 스케일 펀치). 본 변이는 flags.hud.variants.
// 2) 상자 쏟아짐: chest-open 뒤 흔들림 힌트(등급 × 0.38초)가 끝나면 내용물이 하나씩 튀어나와 지갑·가방으로.
// 3) 섬 발견: 가운데 큰 이름 카드(ISLAND_LOOK 색 · geo.islandName) + 'fanfare' 이벤트 + 지도 도장 층('discover').
// 4) 날씨 배너(플레이어 자리 날씨가 바뀔 때 한 번) · 해금 세리머니(아이콘 + 이름) · 'day' 마다 오늘의 인기 생물 토스트.
// 5) 게이지: 두근 낚시/곤충/잠수/상자를 상황에 맞게만(hud 가 같은 id 를 보내도 다시 맞춘다), 수영 힘 · 바다 산소 · 달 산소,
//    콤보 팝(5 이상에서 늘 때), 티노 게이지 꾸미기, 지갑 숫자 통통(.dl-countup).
// DOM 은 5Hz 이하로만 만지고(연출은 CSS 키프레임), 조각은 풀에서 빌려 쓴다.
//
// 내보내는 이벤트: fanfare{kind:'discover', place, name, island}
// flags.hud = { variants: {종 id: 본 변이[]}, hotDay: 인기 생물 토스트를 띄운 날 }   (hud 와 같은 이름칸, 키가 겹치지 않는다)
// window.__hudfx = { play(rarity, o?), chest(tier?, loot?), discover(place?), weather(w, prev?), unlock(key), hot(), gauges(), pool(), view }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { CatchShow } from '../core/ui';
import type { EconApi, GaugeOpts, Variant, Weather } from '../core/api';
import type { Species } from '../core/state';
import { FxView } from './hudfx/view';
import { makePillar } from './hudfx/pillar';
import {
  catchPlan, crownLine, recordVariant, gaugePlan, gaugeSig, crossedHot, comboPop, weatherBanner, WEATHER_REPEAT_SEC,
  discoverCard, ceremonyOf, stampPunch, hotToast, cascadeDelay, cascadePlan, coinBurst, TIER_COLOR, GAUGE_IDS, isFishing, isNetting,
  type CatchPlan, type VariantSeen, type CascadeItem,
} from './hudfx/logic';
import { ISLAND_LOOK, RARITY_COLOR, TIERS, MAT, GOODS, SHOP_ITEMS, RECIPES, ROCKET_PARTS, CAT_ICON } from './economy/data';

export const order = 13;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const holdNow = () => !!(window as unknown as { __hudHold?: boolean }).__hudHold;
const now = () => performance.now();

/** 해금 키 → 이름·아이콘(상점·레시피·로켓 부품 표) */
const UNLOCK_LOOK = new Map<string, { name: string; icon: string }>();
for (const p of ROCKET_PARTS) UNLOCK_LOOK.set(p.key, { name: `로켓 ${p.name}`, icon: p.icon });
for (const s of SHOP_ITEMS) if (s.unlock && !UNLOCK_LOOK.has(s.unlock)) UNLOCK_LOOK.set(s.unlock, { name: s.name, icon: s.icon });
for (const r of RECIPES) {
  if (r.unlock && !UNLOCK_LOOK.has(r.unlock)) UNLOCK_LOOK.set(r.unlock, { name: r.name, icon: r.icon });
  if (!UNLOCK_LOOK.has(`recipe:${r.id}`)) UNLOCK_LOOK.set(`recipe:${r.id}`, { name: r.name, icon: r.icon });
}

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const st = game.state;
  const econ = () => (game.econ as EconApi | null) ?? null;
  const SHOT = new URLSearchParams(location.search).get('shot') === '1';
  const view = new FxView(ctx.rng('hudfx:parts'));
  const pillar = makePillar(game.root);

  const hudF = (st.flags.hud ??= {}) as { variants?: VariantSeen; hotDay?: number };
  hudF.variants ??= {};

  // ───────────── 화면 자리 ─────────────
  const _v = new THREE.Vector3();
  /** 세상 점 → 화면 px(뒤에 있거나 화면 밖이면 null) */
  const project = (x: number, y: number, z: number) => {
    _v.set(x, y, z).project(game.engine.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    const px = (_v.x * 0.5 + 0.5) * window.innerWidth, py = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    if (px < -40 || py < -40 || px > window.innerWidth + 40 || py > window.innerHeight + 40) return null;
    return { x: px, y: py };
  };
  /** 플레이어 머리 위(들어 올린 생물 자리 — pos 는 발끝) */
  const head = () => {
    const p = game.player.pos;
    return project(p.x, p.y + 1.7, p.z) ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
  };
  const rectOf = (sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el || el.offsetParent === null) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  };

  // ───────────── 시간 느리게 · 멈춤(engine.timeScale — dt 만 곱한다) ─────────────
  let tsToken = 0;
  const timeWarp = (steps: Array<{ scale: number; ms: number }>) => {
    const tok = ++tsToken;
    let at = 0;
    for (const s of steps) {
      window.setTimeout(() => { if (tok === tsToken) game.engine.timeScale = s.scale; }, at);
      at += s.ms;
    }
    window.setTimeout(() => { if (tok === tsToken) game.engine.timeScale = 1; }, at);
  };

  // ───────────── 카메라 살짝 줌(cam.dist 에 곱하고 되돌린다 — 휠로 바꾼 거리는 지킨다) ─────────────
  let zoom: { t0: number; ms: number; k: number } | null = null;
  let zoomApplied = 1;
  const zoomAt = (t: number) => {
    if (!zoom) return 1;
    const u = (t - zoom.t0) / zoom.ms;
    if (u >= 1) return 1;
    // 0.2 들어가고 · 가운데 머물고 · 마지막 0.4 에 천천히 돌아온다
    const e = u < 0.2 ? u / 0.2 : u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1;
    const s = e * e * (3 - 2 * e);
    return 1 + (zoom.k - 1) * s;
  };

  // ───────────── 회전 쇼케이스(들어 올린 모델을 1초 한 바퀴) ─────────────
  let spin: { t0: number; ms: number; obj: THREE.Object3D | null; base: number } | null = null;

  // ───────────── 잡았다 ─────────────
  // 이전 최대 크기(왕관 기록 줄) — showCatch 가 도감을 고치기 전에 적어 둔다
  let prevBest: { id: string; best: number | undefined } | null = null;
  const coreShow = game.ui.showCatch.bind(game.ui);
  game.ui.showCatch = (c: CatchShow) => {
    prevBest = { id: c.species.id, best: st.dex[c.species.id]?.best };
    try { return coreShow(c); } finally { prevBest = null; }
  };
  let fxUntil = 0;

  /** 잡았다 상자 꾸미기: 도장·왕관·기록 줄·무지개 테두리. hud 상자가 없으면 내 예비 상자 */
  const decorateBox = (c: CatchShow, plan: CatchPlan) => {
    const live = document.querySelector('#dl .catch.on .box') as HTMLElement | null;
    let box = live;
    if (!box) {
      const s = c.species;
      box = view.fallbackCatch(`<div style="font-size:20px">${c.keep === false ? '만났다!' : '잡았다!'}</div><div class="nm">${esc(s.name)}</div>`
        + `<div style="color:${RARITY_COLOR[plan.tier]};font-size:24px">${'★'.repeat(plan.tier)}</div>${c.sizeText ? `<div>${esc(c.sizeText)}</div>` : ''}`, plan.ms);
    }
    box.querySelectorAll('.dlfx-stamp, .dlfx-bang, .dlfx-dust, .dlfx-crown, .dlfx-rec, .dlfx-rb').forEach((e) => e.remove());
    if (plan.rainbowBorder) box.insertAdjacentHTML('afterbegin', '<div class="dlfx-rb"></div>');
    if (c.variant === 'crown') {
      box.insertAdjacentHTML('beforeend', '<div class="dlfx-crown">👑</div>');
      const line = crownLine(c.size ?? (c.sizeText ? parseFloat(c.sizeText) : undefined), prevBest && prevBest.id === c.species.id ? prevBest.best : undefined);
      // 잡은 쪽이 이미 기록 줄(c.line)을 보냈으면 두 번 쓰지 않는다
      const said = /크기 (경신|기록)|왕관 크기/.test(c.line ?? '');
      if (line && !said) box.insertAdjacentHTML('beforeend', `<div><div class="dlfx-rec">${esc(line)}</div></div>`);
    }
    for (const s of plan.stamps) {
      const sd = `${(s.delay / 1000).toFixed(2)}s`;
      const sub = s.kind === 'new' ? '<small>첫 기록</small>' : '';
      box.insertAdjacentHTML('beforeend', `<div class="dlfx-stamp ${s.kind}" style="--sc:${s.color};--sd:${sd}">${esc(s.text)}${sub}</div>`);
      // 쾅! 충격 글 — NEW 와 전설만(도장이 많으면 시끄럽다)
      if (s.kind === 'new' || s.kind === 'legend') {
        const pos = s.kind === 'new' ? 'right:-84px;top:-66px' : 'left:-96px;top:-66px';
        box.insertAdjacentHTML('beforeend', `<div class="dlfx-bang" style="--sc:${s.color};--sd:${sd};${pos}">쾅!</div>`);
      }
      window.setTimeout(() => game.audio?.sfx('ui-click', { pitch: s.kind === 'legend' ? 0.5 : 0.62, vol: 1 }), s.delay + 180);
    }
  };

  let dryRun = false;
  /** 잡았다 단계 연출 한 번 */
  const playCatch = (c: CatchShow, isNew: boolean) => {
    const s = c.species;
    // 디버그 play() 는 저장을 건드리지 않는다(사본에 적어 보고 버린다)
    const variantNew = recordVariant(dryRun ? JSON.parse(JSON.stringify(hudF.variants ?? {})) : hudF.variants!, s.id, c.variant);
    if (variantNew && !dryRun) st.save();
    const size = typeof c.size === 'number' ? c.size : c.sizeText ? parseFloat(c.sizeText) : undefined;
    const plan = catchPlan({ rarity: s.rarity, variant: c.variant ?? null, isNew, keep: c.keep, size, variantNew });
    const t = now();
    fxUntil = t + plan.ms;
    const a = head();
    view.setAnchor(a.x, a.y);
    decorateBox(c, plan);
    const col = TIER_COLOR[plan.tier];
    if (plan.pong) {
      view.pop('퐁!', '#c98a12');
      view.burst('star', 3, { colors: ['#ffd23f', '#fff6b0', '#ffcf4a'], spread: 120, up: -60 });
    }
    if (plan.sparkle) {
      view.pop('반짝!', '#4ea562');
      view.burst('spark', 12, { colors: ['#8fe0a0', '#c9f7c0', '#fff'], spread: 150 });
      view.burst('note', 3, { colors: ['#6fcf7f', '#ff9fb8', '#7cc8ff'] });
    }
    if (plan.ring !== 'none') view.ring(plan.ring, plan.tier >= 4);
    if (plan.confetti) view.burst('confetti', plan.confetti, { colors: [col, '#ffffff', '#ffe58a', '#ffb3c8', '#a8e6ff'], spread: 320 });
    if (plan.zoom !== 1) zoom = { t0: t, ms: plan.tier >= 5 ? 2600 : 1500, k: plan.zoom };
    if (plan.slowmo) timeWarp([{ scale: plan.slowmo.scale, ms: plan.slowmo.ms }]);
    if (plan.freezeMs) timeWarp([{ scale: 0, ms: plan.freezeMs }]);
    if (plan.vignette) view.vignette('purple', Math.min(plan.ms, 2600));
    if (plan.showcaseMs) {
      view.rays_(col, plan.showcaseMs);
      // 들어 올리기는 renderCatch 다음에 붙는다 → 다음 프레임에 잡는다
      // 앞 회전이 아직 돌고 있으면 원래 각도(base)를 이어받는다 — 끝나고 엉뚱한 각도에 멈추지 않게
      spin = spin ? { t0: t, ms: plan.showcaseMs, obj: spin.obj, base: spin.base } : { t0: t, ms: plan.showcaseMs, obj: null, base: 0 };
    }
    if (plan.clap) { const p = game.player.pos; st.emit({ type: 'clap', x: p.x, z: p.z }); }
    if (plan.skyTint) { view.skyTint(Math.min(plan.ms, 3600)); view.flashOnce(); }
    if (plan.pillar) { const p = game.player.pos; pillar.play(new THREE.Vector3(p.x, p.y, p.z), 3400); }
    if (plan.coins) {
      // 정지 프레임이 풀릴 때 분수가 솟는다
      const d = plan.freezeMs ? plan.freezeMs - 150 : 0;
      view.burst('coin', plan.coins, { delay: d, spread: 260 });
      if (plan.tier === 5) view.pop('전설!', '#f0a020');
    }
    if (plan.cheer) window.setTimeout(() => game.player.act('cheer', 2.4), plan.freezeMs ? 200 : 0);
  };

  const prevRender = game.ui.renderCatch;
  game.ui.renderCatch = (c, isNew) => {
    if (prevRender) { try { prevRender(c, isNew); } catch (e) { console.error('[hudfx] hud renderCatch', e); } }
    try { playCatch(c, isNew); } catch (e) { console.error('[hudfx] 잡았다 연출', e); }
  };

  // ───────────── 상자 쏟아짐 ─────────────
  const lootLook = (id: string): { icon: string; color: string } => {
    if (id === 'coins') return { icon: '🪙', color: '#ffe58a' };
    if (id === 'stars') return { icon: '⭐', color: '#d9ccff' };
    if (id.startsWith('key:')) return { icon: '🗝️', color: '#e5ecf6' };
    const unl = UNLOCK_LOOK.get(id);
    if (unl) return { icon: unl.icon, color: '#c9f0c0' };
    const m = MAT.get(id);
    if (m) return { icon: m.icon, color: '#ffe2a8' };
    const g = GOODS[id];
    if (g) return { icon: g.icon, color: '#ffd9e6' };
    const sp = st.species.get(id);
    return { icon: sp ? CAT_ICON[sp.category] ?? '📦' : '🎁', color: '#ffe2a8' };
  };
  const flyTarget = (to: CascadeItem['to']) =>
    (to === 'wallet' ? rectOf('#dl .wallet .coinp') : to === 'star' ? rectOf('#dl .wallet .starp') : to === 'key' ? rectOf('#dl .wallet .keyp') ?? rectOf('#dl .wallet .starp') : rectOf('#dl [data-chip="hud:bag"]'))
    ?? (to === 'bag' ? { x: 120, y: 120 } : { x: window.innerWidth - 120, y: 36 });
  const countUp = () => {
    const el = document.querySelector('#dl .wallet .coinp .v') as HTMLElement | null;
    if (!el) return;
    el.classList.remove('dl-countup'); void el.offsetWidth; el.classList.add('dl-countup');
  };
  const playChest = (tierIn: string, loot: Array<{ id: string; n: number; name?: string }>, source?: string, pity?: boolean) => {
    const tier = (tierIn in TIERS ? tierIn : 'wood') as keyof typeof TIERS;
    const T = TIERS[tier];
    const delay = cascadeDelay(T.shakes, source);
    const p = game.player.pos, f = game.player.facing();
    const from = project(p.x + f.x * 1.4, p.y + 0.7, p.z + f.z * 1.4) ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.55 };
    const items = cascadePlan(loot, 0);
    window.setTimeout(() => {
      const coins = loot.find((l) => l.id === 'coins')?.n ?? 0;
      if (coins > 0) view.burst('coin', coinBurst(coins), { x: from.x, y: from.y, spread: 200 });
      view.burst('spark', T.pillar ? 18 : 10, { x: from.x, y: from.y - 20, colors: [T.color, T.glow, '#fff'], spread: 160 });
      if (T.pillar) view.burst('confetti', 30, { x: from.x, y: from.y - 40, colors: [T.color, T.glow, '#ffe58a', '#fff'], spread: 300 });
      if (pity) view.pityBurst();
      view.cascade(items, from, flyTarget, lootLook);
      if (coins > 0) window.setTimeout(countUp, 1300 + items.findIndex((i) => i.id === 'coins') * 160);
    }, delay);
  };

  // ───────────── 섬 발견 ─────────────
  const discAt = new Map<string, number>();
  const bornAt = now();
  const playDiscover = (place: string, name: string | undefined, kind: string | undefined) => {
    const geo = game.geo;
    const lm = kind === 'landmark' ? geo?.landmarks?.find((l) => l.id === place) : undefined;
    const islandId = lm?.island ?? (kind === 'landmark' ? null : place);
    const isl = islandId ? ctx.island.islandById(islandId) : undefined;
    let islandName: string | null = null;
    if (isl) { try { islandName = geo?.islandName?.(isl.id) || isl.name; } catch { islandName = isl.name; } }
    const look = isl ? ISLAND_LOOK[isl.theme] ?? ISLAND_LOOK.islet : place.startsWith('moon:') ? { sub: '둥실둥실 토끼달', color: '#a99bff' } : null;
    const card = discoverCard({ place, name, kind }, { islandName, island: isl?.id ?? null, theme: isl?.theme ?? null, color: look?.color ?? null, sub: look?.sub ?? null });
    // 시작하자마자(첫 섬에 서서 시작) 뜨는 발견은 조용히 — 도장만 찍는다
    if (now() - bornAt > 3000) view.discover(card, kind === 'landmark' ? 2800 : 3200, kind !== 'landmark' && !!isl);
    discAt.set(place, now());
    if (isl) discAt.set(isl.id, now());
    st.emit({ type: 'fanfare', kind: 'discover', place, name: card.name, island: isl?.id ?? null });
  };
  game.hud.registerMapLayer({
    id: 'discover', order: 50,
    draw(g2, toPx, scale, world) {
      if (world !== 'earth') return;
      const geo = game.geo;
      const W = g2.canvas.width, t = now();
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      for (const d of ctx.island.ISLANDS) {
        const [x, y] = toPx(d.x, d.z);
        const r = Math.max(6, d.r * scale);
        if (x < -r - 30 || y < -r - 30 || x > W + r + 30 || y > W + r + 30) continue;
        let disc = false;
        try { disc = !!geo?.discovered(d.id); } catch { disc = false; }
        if (!disc) {
          if (d.theme === 'islet') continue;
          // 아직 못 간 섬: 물음표
          g2.font = `${Math.max(16, Math.min(30, r * 0.8))}px Jua, system-ui`;
          g2.fillStyle = '#ffffffcc'; g2.strokeStyle = '#6b8fb0aa'; g2.lineWidth = 5;
          g2.strokeText('?', x, y); g2.fillText('?', x, y);
          continue;
        }
        // 발견 도장: 막 찍은 건 쾅(회전 + 스케일 펀치)
        const age = (t - (discAt.get(d.id) ?? -1e9)) / 1000;
        const k = age < 0.5 ? stampPunch(age) : 1;
        const sr = (d.theme === 'islet' ? 9 : 14) * k;
        const sx = x + Math.min(r, 40) * 0.6, sy = y - Math.min(r, 40) * 0.6;
        g2.save();
        g2.translate(sx, sy);
        g2.rotate(-0.3 + (age < 0.5 ? (1 - age / 0.5) * -0.8 : 0));
        g2.globalAlpha = age < 0.08 ? age / 0.08 : 1;
        g2.fillStyle = '#fffdf6'; g2.strokeStyle = '#ff6f8e'; g2.lineWidth = 3.5;
        g2.beginPath(); g2.arc(0, 0, sr, 0, Math.PI * 2); g2.fill(); g2.stroke();
        g2.lineWidth = 1.5; g2.beginPath(); g2.arc(0, 0, sr - 4, 0, Math.PI * 2); g2.stroke();
        g2.fillStyle = '#ff6f8e'; g2.font = `${Math.round(sr * 1.05)}px Jua, system-ui`;
        g2.fillText('✓', 0, 1);
        g2.restore();
      }
      // 발견한 명소: 작은 별
      for (const l of geo?.landmarks ?? []) {
        let disc = false;
        try { disc = !!geo?.discovered(l.id); } catch { disc = false; }
        if (!disc) continue;
        const [x, y] = toPx(l.x, l.z);
        if (x < -10 || y < -10 || x > W + 10 || y > W + 10) continue;
        const age = (t - (discAt.get(l.id) ?? -1e9)) / 1000;
        g2.font = `${Math.round(16 * (age < 0.5 ? stampPunch(age) : 1))}px Jua, system-ui`;
        g2.fillStyle = '#ffcf4a'; g2.strokeStyle = '#fff'; g2.lineWidth = 4;
        g2.strokeText('✦', x, y); g2.fillText('✦', x, y);
      }
    },
  });

  // ───────────── 날씨 배너 ─────────────
  let lastW: Weather | undefined;
  const lastBannerAt = new Map<string, number>();
  const showWeather = (w: Weather, prev?: Weather, force = false) => {
    const b = weatherBanner(w, prev);
    if (!b) return false;
    const t = now();
    if (!force && t - (lastBannerAt.get(w) ?? -1e9) < WEATHER_REPEAT_SEC * 1000) return false;
    lastBannerAt.set(w, t);
    game.hud.banner(b);
    return true;
  };
  const weatherTick = () => {
    const env = game.env;
    if (!env || game.world !== 'earth' || game.focusOverride) { lastW = undefined; return; }
    const w = env.weather;
    if (lastW === undefined) { lastW = w; return; } // 처음·돌아왔을 때는 조용히
    if (w === lastW) return;
    const prev = lastW;
    lastW = w;
    showWeather(w, prev);
  };

  // ───────────── 오늘의 인기 생물 ─────────────
  const speciesName = (id: string) => st.species.get(id)?.name ?? (st as unknown as { byGdd?(id: string): Species | undefined }).byGdd?.(id)?.name ?? MAT.get(id)?.name ?? id;
  const showHot = (force = false) => {
    const E = econ();
    if (!E || typeof E.market !== 'function') return false;
    let m: ReturnType<EconApi['market']>;
    try { m = E.market(); } catch { return false; }
    if (!force && hudF.hotDay === m.day) return false;
    const text = hotToast((m.hot ?? []).map(speciesName));
    if (!text) return false;
    hudF.hotDay = m.day;
    st.save();
    game.hud.toast(text);
    return true;
  };

  // ───────────── 게이지 ─────────────
  const gaugeLast: Record<string, number> = {};
  /** 지금 보내 둔 게이지(레지스트리에 들어간 같은 객체) */
  const sent = new Map<string, GaugeOpts>();
  const sentSig = new Map<string, string>();
  let want: Record<string, GaugeOpts> = {};
  let wantSig: Record<string, string> = {};
  const pityVal = (E: EconApi | null, act: 'fish' | 'bug' | 'dive') => { try { return Number(E?.pity?.(act)?.gauge) || 0; } catch { return 0; } };
  const prevPity: Record<string, number> = {};
  const computeGauges = () => {
    const E = econ();
    let chest: number | null = null;
    if (E && typeof E.chestPity === 'function') { try { chest = Number(E.chestPity()?.gauge) || 0; } catch { chest = 0; } }
    const o = game.ocean;
    const sp = game.space?.oxygen;
    want = gaugePlan({
      now: now() / 1000, world: game.world, action: game.player.action, mode: game.player.mode,
      current: game.current ? { id: game.current.id, label: game.current.label } : null,
      pity: { fish: pityVal(E, 'fish'), bug: pityVal(E, 'bug'), dive: pityVal(E, 'dive'), chest },
      ocean: o ? { stamina: o.stamina, staminaMax: o.staminaMax, oxygen: o.oxygen, oxygenMax: o.oxygenMax, swimming: o.swimming } : null,
      // 헬멧 산소는 달에서만 줄어든다 — 다른 행성(planets)에 있으면 게이지를 숨긴다
      moon: sp && game.world === 'space' && !(game.ext as { planets?: { current?(): string | null } }).planets?.current?.() ? sp : null,
    }, gaugeLast);
    wantSig = {};
    for (const [id, g] of Object.entries(want)) wantSig[id] = gaugeSig(g);
    // 두근이 막 80% 를 넘었으면 한 번 알려 준다(그 상황일 때만)
    for (const [k, id] of [['fish', GAUGE_IDS.fish], ['bug', GAUGE_IDS.bug], ['dive', GAUGE_IDS.dive]] as const) {
      const g = want[id];
      const v = g?.value ?? 0;
      if (g?.show && prevPity[k] !== undefined && crossedHot(prevPity[k], v)) game.hud.toast('💗 두근두근… 곧 뭔가 온다!');
      prevPity[k] = v;
    }
  };
  /** 레지스트리 값이 내 것과 다르면(hud 가 같은 id 로 보냈으면) 다시 보낸다 */
  const enforceGauges = () => {
    const reg = game.hud.gauges;
    for (const [id, g] of Object.entries(want)) {
      const cur = reg.get(id);
      const mine = sent.get(id);
      if (cur === mine && sentSig.get(id) === wantSig[id]) continue;
      // 숨긴 게이지를 처음부터 굳이 만들 필요는 없다
      if (!cur && !mine && !g.show) continue;
      const copy = { ...g };
      sent.set(id, copy);
      sentSig.set(id, wantSig[id]);
      game.hud.gauge(id, copy);
    }
  };
  /** 산소·힘 모자람 깜빡 · 티노 뒤척 — hud 게이지 칸에 클래스만 */
  const lowMarks = () => {
    for (const id of [GAUGE_IDS.stamina, GAUGE_IDS.oxygen, GAUGE_IDS.moon]) {
      const g = want[id];
      const el = document.querySelector(`#dl .gauge[data-g="${id}"]`);
      el?.classList.toggle('dlfx-low', !!g?.show && g.value < 0.25);
    }
  };

  // ───────────── 이벤트 ─────────────
  let lastCombo = 0;
  st.on((e) => {
    switch (e.type) {
      case 'catch': {
        const c = Number(e.combo) || 0;
        const pop = comboPop(lastCombo, c);
        lastCombo = c;
        if (pop) { const a = head(); view.setAnchor(a.x, a.y); view.comboPop(pop.text, pop.big); }
        computeGauges(); enforceGauges();
        break;
      }
      case 'catch-fail': lastCombo = 0; computeGauges(); enforceGauges(); break;
      case 'chest-open': {
        const loot = (e.loot as Array<{ id: string; n: number; name?: string }>) ?? [];
        if (e.mimic === true || e.source === 'mimic' || !loot.length) break;
        playChest(String(e.tier ?? 'wood'), loot, e.source as string | undefined, e.pity === true);
        computeGauges(); enforceGauges();
        break;
      }
      case 'coins': if ((Number(e.delta) || 0) > 0 && e.why !== 'chest') countUp(); break;
      case 'discover': playDiscover(String(e.place ?? ''), e.name as string | undefined, e.kind as string | undefined); break;
      case 'unlock': {
        const c = ceremonyOf(String(e.key ?? ''), e.why as string | undefined, (k) => UNLOCK_LOOK.get(k));
        if (c) view.ceremony(c);
        break;
      }
      case 'day': showHot(); break;
      case 'tino': {
        const s = e.state;
        if (s === 'stir') {
          const el = document.querySelector('#dl .gauge[data-g="tino"]') as HTMLElement | null;
          if (el) { el.classList.remove('dlfx-stir'); void el.offsetWidth; el.classList.add('dlfx-stir'); }
        } else if (s === 'wake') view.vignette('tino', 1400);
        else if (s === 'chase') view.vignette('tino', 2600);
        break;
      }
    }
  });

  // ───────────── 매 프레임 ─────────────
  let slowAt = -1;
  let startHotAt = SHOT ? Infinity : now() + 4500;
  game.onUpdate(() => {
    const t = now();
    const hold = holdNow();
    view.setHold(hold);
    // 3D(그리기만 — DOM 아님): 빛기둥 · 줌 · 쇼케이스
    pillar.update(t, hold);
    const zf = hold && zoom ? zoom.k : zoomAt(t);
    if (zf !== zoomApplied) {
      game.cam.dist = (game.cam.dist / zoomApplied) * zf;
      zoomApplied = zf;
      if (zf === 1) zoom = null;
    }
    if (spin) {
      const held = game.ui.held?.obj ?? null;
      if (held && spin.obj !== held) { spin.obj = held; spin.base = held.rotation.y; }
      const u = Math.min(1, (t - spin.t0) / spin.ms);
      if (spin.obj) spin.obj.rotation.y = spin.base + Math.PI * 2 * (1 - Math.pow(1 - u, 2.2));
      if (u >= 1 && !hold) { if (spin.obj) spin.obj.rotation.y = spin.base; spin = null; }
    }
    // hud 가 같은 게이지 id 를 보냈으면 바로 되돌린다(객체 비교라 싸다)
    enforceGauges();
    // ── 5Hz: DOM 손대는 일
    if (slowAt >= 0 && t - slowAt < 200) return;
    slowAt = t;
    view.sweep(t);
    view.pump(t);
    if (t < fxUntil || hold) { const a = head(); view.setAnchor(a.x, a.y); }
    computeGauges();
    enforceGauges();
    lowMarks();
    weatherTick();
    if (t >= startHotAt && econ() && game.env) { startHotAt = Infinity; showHot(); }
  });

  // ───────────── 디버그 훅 ─────────────
  const pickSpecies = (rarity: number): Species => {
    let best: Species | undefined;
    for (const s of st.species.values()) {
      if (s.rarity !== rarity) continue;
      if (!best || (s.category === 'fish' && best.category !== 'fish')) best = s;
      if (best.category === 'fish') break;
    }
    return best ?? ({ id: `fx_demo_${rarity}`, name: ['', '송사리', '붕어', '무지개송어', '보라 해마', '황금 고래상어'][rarity] ?? '물고기', rarity, category: 'fish' } as unknown as Species);
  };
  (window as unknown as { __hudfx: unknown }).__hudfx = {
    /** 잡았다 단계 연출만(도감에 안 적는다). o.variant 'shiny'|'crown'|'tiny', o.isNew, o.keep */
    play: (rarity: number, o: { variant?: Variant; isNew?: boolean; keep?: boolean; size?: number } = {}) => {
      const sp = pickSpecies(Math.min(5, Math.max(1, Math.round(rarity))));
      const size = o.size ?? Math.round(((sp as { len?: number }).len ?? 30) * 1.2 * 10) / 10;
      const c: CatchShow = { species: sp, size, sizeText: `${size}cm`, variant: o.variant, keep: o.keep, line: '두근두근 대성공!' };
      prevBest = { id: sp.id, best: st.dex[sp.id]?.best };
      dryRun = true;
      try { game.ui.renderCatch?.(c, o.isNew ?? true); } finally { dryRun = false; }
      prevBest = null;
      return { species: sp.id, plan: catchPlan({ rarity: sp.rarity, variant: o.variant ?? null, isNew: o.isNew ?? true, keep: o.keep }) };
    },
    /** 상자 쏟아짐만(재화는 안 준다) */
    chest: (tier = 'gold', loot?: Array<{ id: string; n: number; name?: string }>) => {
      const l = loot ?? [{ id: 'coins', n: 5200, name: '코인' }, { id: 'stars', n: 30, name: '반짝별' }, { id: 'm_gold', n: 3, name: '금광석' }, { id: 'key:rainbow', n: 1, name: '무지개 열쇠 조각' }];
      playChest(tier, l, 'world', false);
      return l;
    },
    discover: (place = 'coral') => {
      const isl = ctx.island.islandById(place);
      playDiscover(place, isl?.name ?? place, isl ? (isl.theme === 'islet' ? 'islet' : 'island') : 'landmark');
    },
    weather: (w: Weather, prev: Weather = 'clear') => showWeather(w, prev, true),
    unlock: (key: string) => { const c = ceremonyOf(key, 'debug-show', (k) => UNLOCK_LOOK.get(k)); if (c) view.ceremony(c); return c; },
    hot: () => showHot(true),
    gauges: () => ({ want, fishing: isFishing(game.player.action), netting: isNetting(game.player.action) }),
    pool: () => view.poolStats(),
    view,
  };
}

