// 큰 지도(M, 패널 'map') — GDD 3.11 P1 지도. 군도 전체를 한 장에: 가 본 섬은 제 색, 안 가 본 섬은 안개 실루엣 + 구름(geo.discovered).
// 등대(ext.village.lighthouses — 켜지면 노란 빛) · 우체통(ext.village.positions.mailbox) · 가 본 랜드마크(geo.landmarks) ·
// 다른 모듈이 등록한 지도 층(game.hud.registerMapLayer) · 플레이어 화살표. 우주에 있으면 달 지도.
// 오른쪽 목록: 섬마다 발견 여부 + 그 섬 도감 %(100% 왕관) — 누르면 지도에서 반짝, '도감 보기'로 그 섬 도감 페이지.
import type { PanelDef, PanelCtx, MapLayerDef, ToPx } from '../../../core/api';
import { ISLANDS, WORLD_BOUNDS } from '../../../core/world';
import { SPACE_ORIGIN } from '../../../core/game';
import { ISLAND_LOOK } from '../../economy/data';
import { fitMap, fogSet, islandProgress, PLANET_NAME } from '../logic';
import { drawArrow, drawFogPuffs, drawIsland, drawLabel, drawPin, drawSea, landmarkIcon, visibleLandmarks } from '../map';
import { bind, type PanelEnv } from './common';

export const MAP_PANEL = { kind: 'map', title: '지도', icon: '🗺️', color: '#6cc3ef' } as const;

/** 보이는 범위: 섬들을 감싸는 사각형 + 여백(세계 끝까지 다 그리면 섬이 너무 작다) — 세계 경계 밖으론 안 나간다 */
const VIEW = (() => {
  const pad = 450;
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const d of ISLANDS) {
    b.minX = Math.min(b.minX, d.x - d.r - pad); b.maxX = Math.max(b.maxX, d.x + d.r + pad);
    b.minZ = Math.min(b.minZ, d.z - d.r - pad); b.maxZ = Math.max(b.maxZ, d.z + d.r + pad);
  }
  return {
    minX: Math.max(WORLD_BOUNDS.minX, b.minX), maxX: Math.min(WORLD_BOUNDS.maxX, b.maxX),
    minZ: Math.max(WORLD_BOUNDS.minZ, b.minZ), maxZ: Math.min(WORLD_BOUNDS.maxZ, b.maxZ),
  };
})();

type Village = { lighthouses?: Record<string, { x: number; z: number; lit: boolean }>; positions?: { mailbox?: { x: number; z: number } } };

export interface MapPanel extends PanelDef { tick(): void }

export function mapPanel(env: PanelEnv): MapPanel {
  const { game } = env;
  const st = game.state;
  let cv: HTMLCanvasElement | null = null;
  let hover: string | null = null;
  let t = 0, acc = 0;
  const islandName = (id: string) => { try { return game.geo?.islandName?.(id) || ISLANDS.find((d) => d.id === id)?.name || id; } catch { return id; } };
  const here = () => {
    if (game.world !== 'earth') return null;
    try { return game.geo?.zoneAt(game.player.pos.x, game.player.pos.z)?.island ?? null; } catch { return null; }
  };
  const lit = () => fogSet(ISLANDS.map((d) => d.id), game.geo?.discovered ? (id) => game.geo!.discovered(id) : null, here());
  const species = () => [...st.species.values()];
  const dexPct = (id: string) => islandProgress(species(), (s) => !!st.dex[s], id);

  /** 지도 캔버스 크기(CSS px) → 실제 픽셀(DPR ≤ 2) */
  const fitCanvas = (c: HTMLCanvasElement) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(200, Math.round(c.clientWidth || 600)), h = Math.max(200, Math.round(c.clientHeight || 520));
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    return { dpr, w, h };
  };

  const drawLayers = (g2: CanvasRenderingContext2D, toPx: ToPx, s: number, world: 'earth' | 'space') => {
    for (const l of game.hud.layers() as MapLayerDef[]) {
      g2.save();
      try { l.draw(g2, toPx, s, world); } catch (e) { console.error(`[hud] 지도 층 ${l.id}`, e); }
      g2.restore();
    }
  };

  const drawEarth = (g2: CanvasRenderingContext2D, W: number, H: number, k: number, sel: string | null) => {
    const m = fitMap(VIEW, W, H, 18 * k);
    drawSea(g2, W, H, false);
    // 바둑판 눈금(1 km)
    g2.strokeStyle = '#ffffff40'; g2.lineWidth = 1 * k;
    for (let v = WORLD_BOUNDS.minX; v <= WORLD_BOUNDS.maxX; v += 1000) {
      const [x0] = m.toPx(v, 0), [, y0] = m.toPx(0, v);
      g2.beginPath(); g2.moveTo(x0, 0); g2.lineTo(x0, H); g2.stroke();
      g2.beginPath(); g2.moveTo(0, y0); g2.lineTo(W, y0); g2.stroke();
    }
    const L = lit();
    for (const d of ISLANDS) drawIsland(g2, d, m.toPx, m.s, L.has(d.id), env.shapes ?? null, { minR: d.theme === 'islet' ? 3 * k : 6 * k });
    for (const d of ISLANDS) if (!L.has(d.id)) drawFogPuffs(g2, d, m.toPx, m.s, t);
    drawLayers(g2, m.toPx, m.s, 'earth');
    // 랜드마크(가 본 것만) · 등대 · 우체통
    const geo = game.geo;
    for (const lm of visibleLandmarks(geo?.landmarks, geo?.discovered ? (id) => geo.discovered(id) : undefined, L)) {
      if (lm.kind === 'lighthouse') continue;
      const [x, y] = m.toPx(lm.x, lm.z);
      drawPin(g2, landmarkIcon(lm.kind), x, y, 17 * k);
    }
    const V = game.ext?.village as Village | undefined;
    for (const [isl, lh] of Object.entries(V?.lighthouses ?? {})) {
      if (!L.has(isl)) continue;
      const [x, y] = m.toPx(lh.x, lh.z);
      drawPin(g2, '🗼', x, y, 19 * k, lh.lit ? { glow: `#ffe58a${Math.round(170 + Math.sin(t * 3) * 60).toString(16).padStart(2, '0')}` } : { dim: true });
    }
    const mb = V?.positions?.mailbox;
    if (mb) { const [x, y] = m.toPx(mb.x, mb.z); drawPin(g2, '📮', x + 10 * k, y - 10 * k, 16 * k); }
    // 섬 이름(가 본 섬) · ???(안 가 본 큰 섬)
    for (const d of ISLANDS) {
      const [x, y] = m.toPx(d.x, d.z);
      const r = d.r * m.s;
      const on = L.has(d.id);
      if (d.theme === 'islet' && !on) continue;
      const pct = on && d.theme !== 'islet' ? dexPct(d.id) : null;
      const label = on ? `${islandName(d.id)}${pct && pct.total ? ` ${pct.pct}%` : ''}${pct?.crown ? ' 👑' : ''}` : '???';
      drawLabel(g2, label, x, y + r + 12 * k, { size: (d.theme === 'islet' ? 11 : 14) * k, color: on ? '#4a3b2a' : '#7d8ea0', bg: on ? '#fffaf0f0' : '#eef4f8e0' });
    }
    // 고른 섬 · 마우스 올린 섬 반짝 테
    for (const id of [sel, hover]) {
      const d = id ? ISLANDS.find((x) => x.id === id) : null;
      if (!d) continue;
      const [x, y] = m.toPx(d.x, d.z);
      g2.save();
      g2.strokeStyle = id === sel ? '#ff7a9a' : '#ffffffcc'; g2.lineWidth = 3 * k; g2.setLineDash([8 * k, 6 * k]); g2.lineDashOffset = -t * 30;
      g2.beginPath(); g2.arc(x, y, Math.max(10 * k, d.r * m.s * 1.25), 0, Math.PI * 2); g2.stroke();
      g2.restore();
    }
    // 나침반
    drawLabel(g2, 'N', W - 26 * k, 26 * k, { size: 14 * k, color: '#fff', bg: '#ff8f8f' });
    const p = game.player.pos;
    const [px, py] = m.toPx(p.x, p.z);
    drawArrow(g2, px, py, game.player.yaw, '#ff7a9a', 0.85 * k);
    return m;
  };

  const drawSpace = (g2: CanvasRenderingContext2D, W: number, H: number, k: number) => {
    const sky = g2.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H / 2, Math.max(W, H) * 0.7);
    sky.addColorStop(0, '#3a3f8f'); sky.addColorStop(1, '#141838');
    g2.fillStyle = sky; g2.fillRect(0, 0, W, H);
    for (let i = 0; i < 140; i++) {
      const x = ((i * 137) % 997) / 997 * W, y = ((i * 263 + 71) % 991) / 991 * H;
      g2.fillStyle = i % 6 ? '#ffffff66' : '#fff3a8';
      g2.beginPath(); g2.arc(x, y, (i % 9 ? 1.2 : 2.6) * k, 0, Math.PI * 2); g2.fill();
    }
    const R = 320;
    const m = fitMap({ minX: SPACE_ORIGIN.x - R, maxX: SPACE_ORIGIN.x + R, minZ: SPACE_ORIGIN.z - R, maxZ: SPACE_ORIGIN.z + R }, W, H, 24 * k);
    const [ox, oy] = m.toPx(SPACE_ORIGIN.x, SPACE_ORIGIN.z);
    const mr = 280 * m.s;
    g2.fillStyle = '#ffffff22'; g2.beginPath(); g2.arc(ox, oy, mr * 1.06, 0, Math.PI * 2); g2.fill();
    const moon = g2.createRadialGradient(ox - mr * 0.3, oy - mr * 0.3, 10, ox, oy, mr);
    moon.addColorStop(0, '#f4f0ff'); moon.addColorStop(1, '#b9b0e8');
    g2.fillStyle = moon; g2.beginPath(); g2.arc(ox, oy, mr, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#a49bd955';
    for (const [dx, dy, r] of [[-0.34, 0.16, 0.18], [0.3, -0.25, 0.12], [0.16, 0.42, 0.08], [-0.16, -0.46, 0.1], [0.5, 0.25, 0.07]]) { g2.beginPath(); g2.arc(ox + dx * mr, oy + dy * mr, r * mr, 0, Math.PI * 2); g2.fill(); }
    for (const pd of game.space?.ponds ?? []) {
      const [x, y] = m.toPx(pd.x, pd.z);
      g2.fillStyle = '#8fd3f4cc'; g2.beginPath(); g2.arc(x, y, Math.max(5 * k, pd.r * m.s), 0, Math.PI * 2); g2.fill();
      drawPin(g2, '🐟', x, y, 14 * k);
    }
    const ls = game.space?.landingSpawn;
    if (ls) { const [x, y] = m.toPx(ls.x, ls.z); drawPin(g2, '🚀', x, y, 20 * k); }
    drawLayers(g2, m.toPx, m.s, 'space');
    drawLabel(g2, PLANET_NAME[game.space?.planet ?? ''] ?? '우주', ox, oy - mr - 16 * k, { size: 16 * k, color: '#3a3070' });
    const p = game.player.pos;
    const [px, py] = m.toPx(p.x, p.z);
    drawArrow(g2, px, py, game.player.yaw, '#ffd23f', 0.85 * k);
  };

  let lastM: ReturnType<typeof fitMap> | null = null;
  let selId: string | null = null;
  const paint = () => {
    if (!cv || !cv.isConnected) return;
    const g2 = cv.getContext('2d');
    if (!g2) return;
    const { dpr } = fitCanvas(cv);
    const W = cv.width, H = cv.height;
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.clearRect(0, 0, W, H);
    if (game.world === 'space') { lastM = null; drawSpace(g2, W, H, dpr); } else lastM = drawEarth(g2, W, H, dpr, selId);
  };
  /** 캔버스 좌표 → 가장 가까운 섬(반경 안) */
  const pickIsland = (ev: MouseEvent): string | null => {
    if (!cv || !lastM) return null;
    const rect = cv.getBoundingClientRect();
    const k = cv.width / Math.max(1, rect.width);
    const [wx, wz] = lastM.toWorld((ev.clientX - rect.left) * k, (ev.clientY - rect.top) * k);
    let best: string | null = null, bd = Infinity;
    for (const d of ISLANDS) {
      const dd = Math.hypot(d.x - wx, d.z - wz) / Math.max(d.r, 160);
      if (dd < 1.3 && dd < bd) { bd = dd; best = d.id; }
    }
    return best;
  };

  const side = (pc: PanelCtx) => {
    const { esc } = pc.h;
    const L = lit();
    const mains = ISLANDS.filter((d) => d.theme !== 'islet');
    const islets = ISLANDS.filter((d) => d.theme === 'islet');
    const sel = pc.sel ? ISLANDS.find((d) => d.id === pc.sel) : null;
    const row = (id: string) => {
      const d = ISLANDS.find((x) => x.id === id)!;
      const on = L.has(id);
      const p = dexPct(id);
      return `<button class="mrow${pc.sel === id ? ' on' : ''}${on ? '' : ' fog'}" data-isl="${esc(id)}"><i style="background:${on ? ISLAND_LOOK[d.theme]?.color ?? '#ffd23f' : '#a9c3d6'}"></i>
        <span class="mn">${on ? esc(islandName(id)) : '???'}</span><small>${on && p.total ? `${p.pct}%${p.crown ? ' 👑' : ''}` : on ? '' : '안 가 봤어요'}</small></button>`;
    };
    const selCard = sel ? (() => {
      const on = L.has(sel.id);
      const p = dexPct(sel.id);
      return `<div class="msel dl-card"><div class="mt">${on ? esc(islandName(sel.id)) : '??? 섬'}</div>
        <div class="ms2">${on ? esc(ISLAND_LOOK[sel.theme]?.sub ?? '') : '안개에 싸여 있어요. 배를 타고 가 볼까요?'}</div>
        ${on && p.total ? `<div class="bar${p.crown ? ' full' : ''}"><i style="width:${p.pct}%"></i></div><div class="ms2">도감 ${p.got}/${p.total}${p.crown ? ' · 섬 왕관 👑' : ''}</div>
        <button class="btn" data-dex="${esc(sel.id)}">📖 이 섬 도감 보기</button>` : ''}</div>`;
    })() : '';
    return `<div class="mside">${selCard}<div class="sec">🏝️ 섬 ${mains.filter((d) => L.has(d.id)).length}/${mains.length}</div>${mains.map((d) => row(d.id)).join('')}
      <div class="sec">✦ 쪼꼬미섬 ${islets.filter((d) => L.has(d.id)).length}/${islets.length}</div><div class="islets">${islets.map((d) => `<span class="ib${L.has(d.id) ? ' on' : ''}" title="${L.has(d.id) ? esc(islandName(d.id)) : '???'}">${L.has(d.id) ? '🏝️' : '☁️'}</span>`).join('')}</div></div>`;
  };

  return {
    kind: MAP_PANEL.kind, title: MAP_PANEL.title, icon: MAP_PANEL.icon, color: MAP_PANEL.color, wide: true,
    meta: () => {
      if (game.world === 'space') return `${PLANET_NAME[game.space?.planet ?? ''] ?? '우주'} 지도`;
      const L = lit();
      return `발견한 섬 ${ISLANDS.filter((d) => L.has(d.id)).length} / ${ISLANDS.length}`;
    },
    onOpen() {
      hover = null;
      // 처음 열 때 섬 모양 굽기 시작(가까운 섬부터)
      env.shapes?.start(game.player.pos);
    },
    onClose() { cv = null; hover = null; },
    render(body, pc) {
      selId = pc.sel;
      const space = game.world === 'space';
      body.innerHTML = `<div class="maplay${space ? ' space' : ''}"><div class="mwrap dl-card"><canvas class="bigmap"></canvas>
        <div class="legend">${space ? '<span>🐟 달 연못</span><span>🚀 착륙장</span><span>➤ 나</span>' : '<span>🗼 등대</span><span>📮 우체통</span><span>📍 가 본 곳</span><span>☁️ 안 가 본 섬</span>'}</div></div>${space ? '' : side(pc)}</div>`;
      cv = body.querySelector('canvas.bigmap');
      if (cv) {
        cv.onmousemove = (ev) => { const id = pickIsland(ev); if (id !== hover) { hover = id; cv!.style.cursor = id ? 'pointer' : 'default'; paint(); } };
        cv.onmouseleave = () => { if (hover) { hover = null; paint(); } };
        cv.onclick = (ev) => { const id = pickIsland(ev); pc.setSel(id && id !== pc.sel ? id : null); };
      }
      bind(body, 'isl', (id) => pc.setSel(pc.sel === id ? null : id));
      bind(body, 'dex', (id) => {
        const f = (st.flags.hud ??= {}) as { dexFilter?: string | null };
        f.dexFilter = id;
        st.save();
        game.hud.open('dex');
      });
      // 레이아웃이 잡힌 뒤 그린다
      paint();
      requestAnimationFrame(paint);
    },
    tick() {
      if (!cv) return;
      // 등대 반짝·고른 섬 테가 돌게 1/8초마다(섬 모양이 구워지는 동안에도 새로 그린다). 촬영 모드(dt=0)에서도 돌게 실제 시각으로
      const now = performance.now() / 1000;
      if (now - acc < 0.125) return;
      acc = now;
      t = now;
      paint();
    },
  };
}
