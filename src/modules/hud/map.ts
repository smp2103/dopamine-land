// 지도 그리기 공용 — 미니맵(오른쪽 아래 동그라미)과 큰 지도(M)가 같은 안개(fog of war)·같은 섬 모양을 쓴다.
// 섬 모양: Island.heightAt 를 섬마다 격자로 재서 2D 캔버스에 구워 둔다(해안 거품 · 땅 · 안개 실루엣 세 장).
// 굽기는 비싸서(섬 하나 ~10ms) 쉬는 시간(requestIdleCallback)에 조금씩 — 큰 지도를 처음 열 때나 놀기 시작하고 한참 뒤에.
// 다 굽기 전엔 동글동글 원으로 그린다.
import type { IslandDef } from '../../core/world';
import type { Landmark, ToPx } from '../../core/api';
import { ISLAND_LOOK } from '../economy/data';

/** 굽힌 섬 한 장 */
interface Baked { foam: HTMLCanvasElement; land: HTMLCanvasElement; fog: HTMLCanvasElement; x0: number; z0: number; size: number }
interface Job { d: IslandDef; n: number; row: number; step: number; x0: number; z0: number; foam: ImageData; land: ImageData; fog: ImageData }

const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})/i.exec(c);
  const v = m ? parseInt(m[1], 16) : 0xa8e06a;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const SAND = hex('#f6e3b0'), FOAM = hex('#ffffff'), FOG = hex('#a9c3d6');
/** 높이 → 땅 색: 모래 해변 → 섬 색 → 높은 곳은 밝게(눈섬은 하얗게) */
function landColor(theme: string, h: number, base: [number, number, number]): [number, number, number] {
  if (h < 1.6) return SAND;
  const up = Math.min(1, Math.max(0, (h - 4) / 40));
  if (theme === 'ice') return mix(base, FOAM, 0.35 + up * 0.5);
  if (theme === 'desert') return mix(SAND, base, 0.4 + up * 0.4);
  return mix(base, mix(base, FOAM, 0.55), up * 0.6);
}

export class IslandShapes {
  private baked = new Map<string, Baked>();
  private jobs: Job[] = [];
  private idleId = 0;
  private started = false;

  constructor(private islands: readonly IslandDef[], private heightAt: (x: number, z: number) => number) {}

  get(id: string): Baked | undefined { return this.baked.get(id); }
  done() { return this.baked.size >= this.islands.length; }
  progress() { return this.baked.size / Math.max(1, this.islands.length); }

  /** 굽기 시작(여러 번 불러도 한 번). 가까운 섬부터 */
  start(near?: { x: number; z: number }) {
    if (this.started) return;
    this.started = true;
    const list = [...this.islands];
    if (near) list.sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z));
    for (const d of list) {
      const n = d.theme === 'islet' ? 40 : 84;
      const half = d.r * 1.3;
      this.jobs.push({
        d, n, row: 0, step: (half * 2) / n, x0: d.x - half, z0: d.z - half,
        foam: new ImageData(n, n), land: new ImageData(n, n), fog: new ImageData(n, n),
      });
    }
    this.schedule();
  }

  private schedule() {
    if (!this.jobs.length) return;
    const w = window as unknown as { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) this.idleId = w.requestIdleCallback((dl) => this.work(() => dl.timeRemaining() > 1), { timeout: 400 });
    else this.idleId = window.setTimeout(() => { const t = performance.now(); this.work(() => performance.now() - t < 3); }, 32);
  }

  /** 쉬는 시간 동안 줄 단위로 굽는다 */
  private work(more: () => boolean) {
    let rows = 0;
    while (this.jobs.length && (rows < 2 || more())) {
      const j = this.jobs[0];
      this.row(j);
      rows++;
      if (j.row >= j.n) { this.finish(j); this.jobs.shift(); }
    }
    this.schedule();
  }

  private row(j: Job) {
    const { n, step, x0, z0, d } = j;
    const base = hex(ISLAND_LOOK[d.theme]?.color ?? ISLAND_LOOK.islet.color);
    const zz = z0 + (j.row + 0.5) * step;
    for (let i = 0; i < n; i++) {
      const xx = x0 + (i + 0.5) * step;
      let h = -99;
      try { h = this.heightAt(xx, zz); } catch { h = -99; }
      const o = (j.row * n + i) * 4;
      if (h > -2.2) { j.foam.data[o] = FOAM[0]; j.foam.data[o + 1] = FOAM[1]; j.foam.data[o + 2] = FOAM[2]; j.foam.data[o + 3] = Math.min(255, (h + 2.2) * 200); }
      if (h > 0.2) {
        const c = landColor(d.theme, h, base);
        j.land.data[o] = c[0]; j.land.data[o + 1] = c[1]; j.land.data[o + 2] = c[2]; j.land.data[o + 3] = 255;
        // 안개 실루엣: 고른 하늘빛 + 줄무늬 살짝(구름 낀 느낌)
        const st = ((i + j.row) % 7 === 0) ? 14 : 0;
        j.fog.data[o] = FOG[0] + st; j.fog.data[o + 1] = FOG[1] + st; j.fog.data[o + 2] = FOG[2] + st; j.fog.data[o + 3] = 255;
      }
    }
    j.row++;
  }

  private finish(j: Job) {
    const mk = (img: ImageData) => { const c = document.createElement('canvas'); c.width = c.height = j.n; c.getContext('2d')!.putImageData(img, 0, 0); return c; };
    this.baked.set(j.d.id, { foam: mk(j.foam), land: mk(j.land), fog: mk(j.fog), x0: j.x0, z0: j.z0, size: j.step * j.n });
  }

  dispose() {
    const w = window as unknown as { cancelIdleCallback?: (id: number) => void };
    if (w.cancelIdleCallback) w.cancelIdleCallback(this.idleId); else clearTimeout(this.idleId);
    this.jobs = [];
  }
}

/** 섬 하나 그리기 — 밝혀졌으면 색, 아니면 안개 실루엣 */
export function drawIsland(g2: CanvasRenderingContext2D, d: IslandDef, toPx: ToPx, s: number, lit: boolean, shapes: IslandShapes | null, o: { minR?: number } = {}) {
  const [x, y] = toPx(d.x, d.z);
  const r = Math.max(o.minR ?? 4, d.r * s);
  const W = g2.canvas.width, H = g2.canvas.height;
  if (x < -r * 1.4 || y < -r * 1.4 || x > W + r * 1.4 || y > H + r * 1.4) return;
  const b = shapes?.get(d.id);
  const look = ISLAND_LOOK[d.theme] ?? ISLAND_LOOK.islet;
  if (b && d.r * s >= 3) {
    const [px, py] = toPx(b.x0, b.z0);
    const sz = b.size * s;
    g2.imageSmoothingEnabled = true;
    // 해안 거품은 살짝 크게(테두리처럼)
    g2.globalAlpha = lit ? 0.95 : 0.55;
    g2.drawImage(b.foam, px - sz * 0.02, py - sz * 0.02, sz * 1.04, sz * 1.04);
    g2.globalAlpha = 1;
    g2.drawImage(lit ? b.land : b.fog, px, py, sz, sz);
    return;
  }
  // 아직 안 구웠으면 동글 원
  g2.fillStyle = lit ? '#fff6d8' : '#e4eef4';
  g2.beginPath(); g2.arc(x, y, r + Math.max(2, r * 0.08), 0, Math.PI * 2); g2.fill();
  if (lit) {
    const gr = g2.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    gr.addColorStop(0, '#ffffffaa'); gr.addColorStop(0.35, look.color); gr.addColorStop(1, look.color);
    g2.fillStyle = gr;
  } else g2.fillStyle = '#a9c3d6';
  g2.beginPath(); g2.arc(x, y, r, 0, Math.PI * 2); g2.fill();
}

/** 안 밝혀진 섬 위 구름 몇 덩이(안개) */
export function drawFogPuffs(g2: CanvasRenderingContext2D, d: IslandDef, toPx: ToPx, s: number, t: number) {
  const [x, y] = toPx(d.x, d.z);
  const r = Math.max(6, d.r * s);
  g2.save();
  g2.fillStyle = '#ffffffcc';
  for (let i = 0; i < 5; i++) {
    const a = i * 1.37 + d.seed * 0.1 + Math.sin(t * 0.3 + i) * 0.05;
    const rr = r * (0.28 + ((i * 37 + d.seed) % 5) * 0.05);
    g2.beginPath(); g2.arc(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.38, rr, 0, Math.PI * 2); g2.fill();
  }
  g2.restore();
}

/** 이름표(둥근 흰 알약) */
export function drawLabel(g2: CanvasRenderingContext2D, text: string, x: number, y: number, o: { size?: number; color?: string; bg?: string } = {}) {
  const fs = o.size ?? 15;
  g2.save();
  g2.font = `${fs}px Jua, system-ui, sans-serif`;
  g2.textAlign = 'center'; g2.textBaseline = 'middle';
  const w = g2.measureText(text).width + fs * 1.1, h = fs * 1.55;
  g2.fillStyle = o.bg ?? '#fffaf0f0';
  g2.shadowColor = '#6b4a2b33'; g2.shadowBlur = 4; g2.shadowOffsetY = 2;
  g2.beginPath();
  const rr = h / 2;
  g2.roundRect(x - w / 2, y - h / 2, w, h, rr);
  g2.fill();
  g2.shadowColor = 'transparent';
  g2.fillStyle = o.color ?? '#4a3b2a';
  g2.fillText(text, x, y + 1);
  g2.restore();
}

/** 랜드마크 종류 → 아이콘 */
const LM_ICON: Record<string, string> = {
  lighthouse: '🗼', pyramid: '🔺', mushtower: '🍄', launchtower: '🚀', volcano: '🌋', waterfall: '💧', cave: '🕳️', temple: '🏛️',
  windmill: '🌬️', shipwreck: '⚓', wreck: '⚓', bridge: '🌉', tower: '🗼', ruin: '🏺', oasis: '🌴', telescope: '🔭', antenna: '📡',
  hotspring: '♨️', nest: '🪺', igloo: '🛖', cabin: '🛖', pier: '⚓', statue: '🗿', tree: '🌳', giant: '🌳', crater: '🌑', glacier: '🧊',
  aurorahill: '🌌', fossil: '🦴', ranch: '🦕', mangrove: '🌿', reef: '🪸', lagoon: '🏝️', heartpond: '💗', sakura: '🌸', orchard: '🍎',
};
export const landmarkIcon = (kind: string) => LM_ICON[kind] ?? '📍';

/** 이모지 하나(흰 동그라미 받침) */
export function drawPin(g2: CanvasRenderingContext2D, icon: string, x: number, y: number, size = 18, o: { glow?: string; dim?: boolean } = {}) {
  g2.save();
  if (o.glow) {
    const gr = g2.createRadialGradient(x, y, 1, x, y, size * 1.6);
    gr.addColorStop(0, o.glow); gr.addColorStop(1, o.glow.slice(0, 7) + '00');
    g2.fillStyle = gr; g2.beginPath(); g2.arc(x, y, size * 1.6, 0, Math.PI * 2); g2.fill();
  }
  g2.fillStyle = o.dim ? '#efe6d6' : '#fffaf0';
  g2.shadowColor = '#6b4a2b44'; g2.shadowBlur = 3; g2.shadowOffsetY = 1.5;
  g2.beginPath(); g2.arc(x, y, size * 0.62, 0, Math.PI * 2); g2.fill();
  g2.shadowColor = 'transparent';
  g2.globalAlpha = o.dim ? 0.55 : 1;
  g2.font = `${size * 0.78}px system-ui, sans-serif`;
  g2.textAlign = 'center'; g2.textBaseline = 'middle';
  g2.fillText(icon, x, y + 1);
  g2.restore();
}

/** 플레이어 화살표(+ 흰 테) */
export function drawArrow(g2: CanvasRenderingContext2D, x: number, y: number, yaw: number, fill: string, size = 1) {
  g2.save();
  g2.translate(x, y);
  g2.rotate(-yaw + Math.PI);
  g2.scale(size, size);
  g2.fillStyle = fill; g2.strokeStyle = '#fff'; g2.lineWidth = 6; g2.lineJoin = 'round';
  g2.shadowColor = '#0004'; g2.shadowBlur = 6; g2.shadowOffsetY = 2;
  g2.beginPath(); g2.moveTo(0, -18); g2.lineTo(13, 13); g2.lineTo(0, 6); g2.lineTo(-13, 13); g2.closePath();
  g2.stroke(); g2.shadowColor = 'transparent'; g2.fill();
  g2.restore();
}

/** 바다 바탕(그라데이션 + 잔물결) */
export function drawSea(g2: CanvasRenderingContext2D, W: number, H: number, round: boolean) {
  const sea = round ? g2.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W / 2) : g2.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#c9f3ff'); sea.addColorStop(1, '#78c9ee');
  g2.fillStyle = sea; g2.fillRect(0, 0, W, H);
  g2.fillStyle = '#ffffff55';
  const n = round ? 40 : 90;
  for (let i = 0; i < n; i++) {
    const x = ((i * 137) % 997) / 997 * W, y = ((i * 263 + 71) % 991) / 991 * H;
    g2.beginPath(); g2.ellipse(x, y, 7, 2.5, 0, 0, Math.PI * 2); g2.fill();
  }
}

/** 밝혀진 랜드마크만 */
export function visibleLandmarks(list: readonly Landmark[] | undefined, discovered: ((id: string) => boolean) | undefined, lit: ReadonlySet<string>): Landmark[] {
  if (!list) return [];
  return list.filter((l) => {
    if (!lit.has(l.island)) return false;
    try { return discovered ? !!discovered(l.id) : true; } catch { return false; }
  });
}
