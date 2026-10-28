// '꾸미기' 창(말랑 주머니에 방울로 뜬다): 왼쪽 = 빙글 도는 미리보기(게임 렌더러로 작은 판에 그려 옮긴다), 오른쪽 = 고르기.
// 고르는 즉시 섬에 있는 내 캐릭터도 바뀐다(rig.setLook). 저장은 flags.look — 저장·전달은 부르는 쪽(characters.ts)이 한다.
import * as THREE from 'three';
import type { PanelDef } from '../../../core/api';
import { buildPlayer, type PlayerRig } from './rig';
import {
  SKINS, HAIR_STYLES, HAIR_COLORS, EYE_COLORS, OUTFITS, OUTFIT_COLORS, HATS, LOOK_PRESETS, cleanLook, sameLook, type PlayerLook,
} from './look';

export const LOOK_KIND = 'look';

const CSS = `
#dl .lk { display: grid; grid-template-columns: 250px 1fr; gap: 14px; color: #4a3b2a; }
#dl .lk .lk-view { background: radial-gradient(circle at 50% 38%, #fff8fb, #ffe3ee 70%, #ffd2e4); border: 4px solid #fff; border-radius: 26px; box-shadow: 0 4px 0 #f0c9d8; position: relative; overflow: hidden; height: 330px; }
#dl .lk .lk-view canvas { width: 100%; height: 100%; display: block; }
#dl .lk .lk-view .lk-hint { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; font-size: 13px; color: #c48aa2; }
#dl .lk .lk-wrap { position: relative; min-width: 0; }
#dl .lk .lk-side { display: flex; flex-direction: column; gap: 6px; max-height: min(480px, calc(100vh - 280px)); min-height: 200px; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; scrollbar-color: #ffb6c9 transparent; }
#dl .lk .lk-more { position: absolute; left: 0; right: 8px; bottom: 0; height: 46px; pointer-events: none; display: flex; align-items: flex-end; justify-content: center;
  background: linear-gradient(rgba(255,253,246,0), #fffdf6 75%); border-radius: 0 0 20px 20px; font-size: 13px; color: #d07a98; padding-bottom: 3px; transition: opacity .2s; }
#dl .lk .lk-more span { background: #fff; border: 2px solid #ffd6e2; border-radius: 999px; padding: 1px 10px; animation: lkbob 1.4s ease-in-out infinite; }
#dl .lk .lk-more.off { opacity: 0; }
@keyframes lkbob { 50% { transform: translateY(-3px); } }
#dl .lk .lk-card { background: #fff8e8; border: 3px solid #fff; border-radius: 18px; padding: 6px 10px; box-shadow: 0 3px 0 #f0dcb4; }
#dl .lk h4 { margin: 0 0 4px; font-size: 15px; font-weight: normal; color: #b07a3a; }
#dl .lk .lk-row { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
#dl .lk .lk-sw { width: 26px; height: 26px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 0 #0002; cursor: pointer; padding: 0; transition: transform .12s; }
#dl .lk .lk-sw:hover { transform: translateY(-2px) scale(1.06); }
#dl .lk .lk-sw.on { outline: 3px solid #ff9fb8; outline-offset: 1px; }
#dl .lk .lk-pill { font-family: inherit; font-size: 13px; color: #8a6b48; padding: 3px 10px; border-radius: 999px; border: 3px solid #fff; background: #f6e7c8; cursor: pointer; box-shadow: 0 2px 0 #e2c99c; transition: transform .12s; }
#dl .lk .lk-pill:hover { transform: translateY(-2px); }
#dl .lk .lk-pill.on { background: #ff9fb8; color: #fff; box-shadow: 0 2px 0 #e07a96; }
#dl .lk .lk-pre { font-family: inherit; font-size: 13px; color: #4a3b2a; padding: 3px 10px; border-radius: 16px; border: 3px solid #ffd6e2; background: #fff; cursor: pointer; }
#dl .lk .lk-pre:hover { background: #fff0f4; }
`;

export interface LookPanelOpts {
  renderer: THREE.WebGLRenderer | null;
  get(): PlayerLook;
  set(l: PlayerLook): void;
}

/** 작은 미리보기 무대: 게임 렌더러로 그려 2D 캔버스에 옮긴다(따로 WebGL 컨텍스트를 만들지 않는다) */
class Preview {
  readonly canvas = document.createElement('canvas');
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 250 / 330, 0.1, 20);
  private rt: THREE.WebGLRenderTarget | null = null;
  private rig: PlayerRig | null = null;
  private raf = 0;
  private t0 = 0;
  private buf: Uint8Array | null = null;
  private img: ImageData | null = null;
  private lut = new Uint8ClampedArray(256);
  constructor(private renderer: THREE.WebGLRenderer | null) {
    // 1.5배면 판 크기(250×330)에서 충분히 또렷 — 2배보다 GPU→CPU 읽기가 절반 가까이 준다
    this.canvas.width = 375;
    this.canvas.height = 495;
    this.cam.position.set(0, 0.95, 3.3);
    this.cam.lookAt(0, 0.72, 0);
    this.scene.add(new THREE.HemisphereLight('#fff4f8', '#ffd9c8', 1.6));
    const sun = new THREE.DirectionalLight('#fff1e0', 2.4);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#d8e4ff', 1.2);
    rim.position.set(-3, 2, -3);
    this.scene.add(rim);
    // 선형 → sRGB 근사(렌더 타깃은 색 공간 변환·톤 매핑을 안 거친다)
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      const tm = v / (1 + v * 0.25) * 1.25;
      this.lut[i] = Math.round(255 * (tm <= 0.0031308 ? tm * 12.92 : 1.055 * Math.pow(Math.min(1, tm), 1 / 2.4) - 0.055));
    }
  }
  setLook(l: PlayerLook) {
    if (!this.rig) {
      this.rig = buildPlayer(l);
      this.rig.root.scale.setScalar(1);
      this.scene.add(this.rig.root);
    } else this.rig.setLook?.(l);
  }
  start() {
    if (this.raf || !this.renderer) return;
    this.t0 = performance.now();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.canvas.isConnected) return;
      this.draw((performance.now() - this.t0) / 1000);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
  private last = -1;
  private draw(t: number) {
    const r = this.renderer;
    if (!r || !this.rig) return;
    // 20 fps 면 충분(읽어 오기가 동기라 무겁다) · 탭이 가려지면 쉰다
    if (t - this.last < 1 / 20 || (typeof document !== 'undefined' && document.hidden)) return;
    const dt = this.last < 0 ? 0 : t - this.last;
    this.last = t;
    const w = this.canvas.width, h = this.canvas.height;
    this.rt ??= new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.UnsignedByteType });
    this.rig.root.rotation.y = 0.5 * Math.sin(t * 0.6) + 0.15;
    this.rig.animate({ speed: 0, mode: 'ground', action: Math.floor(t / 6) % 3 === 2 ? 'wave' : null, t, dt });
    const prev = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor('#000000', 0);
    r.autoClear = true;
    r.clear();
    r.render(this.scene, this.cam);
    this.buf ??= new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(this.rt, 0, 0, w, h, this.buf);
    r.setRenderTarget(prev);
    r.autoClear = prevAuto;
    r.setClearColor(prevColor, prevAlpha);
    const g = this.canvas.getContext('2d');
    if (!g) return;
    this.img ??= g.createImageData(w, h);
    const d = this.img.data, b = this.buf, L = this.lut;
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4, dst = y * w * 4;
      for (let x = 0; x < w * 4; x += 4) {
        const a = b[src + x + 3];
        // 미리 곱해진 알파를 풀고 감마
        const k = a > 0 ? 255 / a : 0;
        d[dst + x] = L[Math.min(255, Math.round(b[src + x] * k))];
        d[dst + x + 1] = L[Math.min(255, Math.round(b[src + x + 1] * k))];
        d[dst + x + 2] = L[Math.min(255, Math.round(b[src + x + 2] * k))];
        d[dst + x + 3] = a;
      }
    }
    g.putImageData(this.img, 0, 0);
  }
  dispose() {
    this.stop();
    this.rt?.dispose();
    this.rt = null;
    this.rig?.dispose?.();
    this.rig = null;
  }
}

const sw = (k: string, v: string, color: string, on: boolean, title: string) =>
  `<button class="lk-sw${on ? ' on' : ''}" style="background:${color}" data-k="${k}" data-v="${v}" title="${title}"></button>`;
const pill = (k: string, v: string, label: string, on: boolean) => `<button class="lk-pill${on ? ' on' : ''}" data-k="${k}" data-v="${v}">${label}</button>`;

export function lookPanel(o: LookPanelOpts): PanelDef {
  let pv: Preview | null = null;
  let styled = false;
  let scrollY = 0;
  const apply = (l: PlayerLook) => {
    const next = cleanLook(l);
    if (sameLook(next, o.get())) return;
    o.set(next);
    pv?.setLook(next);
  };
  return {
    kind: LOOK_KIND,
    title: '꾸미기',
    color: '#ff9fb8',
    icon: '🎀',
    app: { order: 70 },
    meta: () => `${HAIR_STYLES[o.get().hair].label} · ${OUTFITS[o.get().outfit].label}`,
    onOpen() {
      pv ??= new Preview(o.renderer);
      pv.setLook(o.get());
      pv.start();
    },
    onClose() { pv?.dispose(); pv = null; },
    render(body, ctx) {
      if (!styled && typeof document !== 'undefined') {
        const st = document.createElement('style');
        st.textContent = CSS;
        document.head.appendChild(st);
        styled = true;
      }
      const l = o.get();
      const rows = (k: keyof PlayerLook, table: Record<string, { label: string }>) =>
        Object.entries(table).map(([v, d]) => pill(k, v, d.label, l[k] === v)).join('');
      body.innerHTML = `<div class="lk">
        <div class="lk-view"><div class="lk-hint">${o.renderer ? '말랑말랑 미리보기' : ''}</div></div>
        <div class="lk-wrap"><div class="lk-side">
          <div class="lk-card"><h4>추천 모습</h4><div class="lk-row">${LOOK_PRESETS.map((p) => `<button class="lk-pre" data-pre="${p.id}">${p.label}</button>`).join('')}</div></div>
          <div class="lk-card"><h4>머리 모양</h4><div class="lk-row">${rows('hair', HAIR_STYLES)}</div>
            <div class="lk-row" style="margin-top:6px">${Object.entries(HAIR_COLORS).map(([v, d]) => sw('hairColor', v, d.base, l.hairColor === v, d.label)).join('')}</div></div>
          <div class="lk-card"><h4>얼굴</h4><div class="lk-row">${Object.entries(SKINS).map(([v, d]) => sw('skin', v, d.base, l.skin === v, d.label)).join('')}</div>
            <div class="lk-row" style="margin-top:6px">${Object.entries(EYE_COLORS).map(([v, d]) => sw('eyes', v, `radial-gradient(circle at 50% 70%, ${d.light}, ${d.dark})`, l.eyes === v, `눈 ${d.label}`)).join('')}
            ${pill('freckles', l.freckles ? '0' : '1', l.freckles ? '주근깨 ✓' : '주근깨', l.freckles)}</div></div>
          <div class="lk-card"><h4>옷</h4><div class="lk-row">${rows('outfit', OUTFITS)}</div>
            <div class="lk-row" style="margin-top:6px">${Object.entries(OUTFIT_COLORS).map(([v, d]) => sw('outfitColor', v, d.main, l.outfitColor === v, d.label)).join('')}</div></div>
          <div class="lk-card"><h4>모자 · 핀</h4><div class="lk-row">${rows('hat', HATS)}</div></div>
        </div><div class="lk-more"><span>아래에 더 있어요 ▾</span></div></div></div>`;
      // 더 내릴 게 남았을 때만 '더 있어요' 안내(다시 그려도 스크롤 자리는 지킨다)
      const side = body.querySelector('.lk-side') as HTMLElement | null, more = body.querySelector('.lk-more') as HTMLElement | null;
      if (side && more) {
        side.scrollTop = scrollY;
        const upd = () => { scrollY = side.scrollTop; more.classList.toggle('off', side.scrollTop + side.clientHeight >= side.scrollHeight - 6); };
        side.onscroll = upd;
        upd();
        requestAnimationFrame(upd);
      }
      if (pv) body.querySelector('.lk-view')!.prepend(pv.canvas);
      body.onclick = (ev) => {
        const b = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
        if (!b) return;
        const cur = o.get();
        if (b.dataset.pre) {
          const p = LOOK_PRESETS.find((x) => x.id === b.dataset.pre);
          if (p) apply({ ...p.look });
        } else if (b.dataset.k) {
          const k = b.dataset.k as keyof PlayerLook;
          apply({ ...cur, [k]: k === 'freckles' ? b.dataset.v === '1' : b.dataset.v } as PlayerLook);
        }
        ctx.rerender();
      };
    },
  };
}
