// 사진 모드 화면 — 위 안내 띠 · 아래 한 줄 도구 막대(필터·액자·스티커·포즈는 지금 고른 것 + 눌러서 펼치는 말풍선,
// 타이머·카메라) · 셔터 · 카운트다운 · 찰칵 번쩍 ·
// 찍은 결과 카드 · 앨범(최근 12장). 꾸미기 미리보기는 겹친 2D 캔버스(draw.ts 와 같은 그림).
// 글씨 색 #4a3b2a, 바탕 #fff8e8(계약 v2 0장). HUD(#dl)는 사진 모드 동안 숨으니 여기 창은 따로 띄운다.
import { FILTERS, FRAMES, POSES, STICKERS, filterById, gameTimeText, type FilterId, type FrameId, type PhotoMeta, type PlacedSticker, type PoseDef } from './logic';
import { drawFrame, drawGrain, drawStickers } from './draw';
import type { PhotoRecord } from './album';

const CSS = `
#photo-ui { position: fixed; inset: 0; z-index: 30; pointer-events: none; font-family: 'Jua', system-ui, sans-serif; color: #4a3b2a; -webkit-font-smoothing: antialiased; }
#photo-ui[hidden] { display: none; }
#photo-ui .pdeco, #photo-ui .pgrain { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
#photo-ui .pgrain { mix-blend-mode: overlay; opacity: 0; }
#photo-ui.placing .pdeco { pointer-events: auto; cursor: copy; }
#photo-ui .pcard { background: linear-gradient(180deg, #fffdf6 0%, #fff8e8 100%); border: 3px solid #fff; border-radius: 22px; box-shadow: 0 5px 0 #ead6ad, 0 12px 26px #6b4a2b2e; }
#photo-ui .ptop { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 6px 16px; font-size: 17px; white-space: nowrap; }
#photo-ui .ptop b { font-weight: normal; color: #ff7fa3; font-size: 19px; }
#photo-ui .ptop .k { display: inline-block; min-width: 20px; padding: 0 6px; border-radius: 8px; background: #f6e7c8; color: #8a6b48; font-size: 14px; text-align: center; box-shadow: 0 2px 0 #e2c99c; }
#photo-ui .pmsg { position: absolute; top: 62px; left: 50%; transform: translateX(-50%); padding: 5px 16px; font-size: 16px; opacity: 0; transition: opacity .25s; white-space: nowrap; }
#photo-ui .pmsg.on { opacity: 1; }
#photo-ui .pspot { position: absolute; top: 104px; left: 50%; transform: translateX(-50%); padding: 4px 14px; font-size: 15px; background: #fff3c8; border-radius: 999px; border: 2px solid #fff; box-shadow: 0 3px 0 #ecd28a; display: none; }
#photo-ui .pspot.on { display: block; }
#photo-ui .pbar { position: absolute; left: 0; right: 0; bottom: 14px; margin: 0 auto; width: max-content; max-width: calc(100vw - 32px); box-sizing: border-box; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px; padding: 8px 14px; pointer-events: auto; }
#photo-ui .pgrp { position: relative; flex: none; display: flex; flex-direction: column; gap: 3px; }
#photo-ui .pgrp > i { font-style: normal; font-size: 12px; color: #a88a66; padding-left: 4px; white-space: nowrap; }
#photo-ui .pgrp .k, #photo-ui .pb .k { display: inline-block; min-width: 14px; padding: 0 4px; border-radius: 6px; background: #fff3dc; color: #a88a66; font-size: 11px; text-align: center; }
#photo-ui .pcur { min-width: 92px; text-align: left; }
#photo-ui .pcur::after { content: ''; display: inline-block; margin-left: 6px; vertical-align: 2px; border: 4px solid transparent; border-bottom: 5px solid currentColor; border-top: 0; opacity: .6; }
#photo-ui .pgrp.open .pcur { background: #ffe2a8; box-shadow: 0 2px 0 #e9c57c; }
#photo-ui .pcur.on { background: #ff9fb8; color: #fff; box-shadow: 0 2px 0 #e07d98; }
#photo-ui .ppop { position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%); display: none; gap: 5px; padding: 8px 10px; grid-template-columns: repeat(2, max-content); }
#photo-ui .pgrp.open .ppop { display: grid; animation: pp-in .16s ease-out; }
#photo-ui .ppop[data-g="sticker"] { grid-template-columns: repeat(6, max-content); }
#photo-ui .ppop[data-g="pose"] { grid-template-columns: repeat(1, max-content); }
#photo-ui .ppop::after { content: ''; position: absolute; left: 50%; bottom: -9px; margin-left: -8px; border: 8px solid transparent; border-top-color: #fff; border-bottom: 0; }
@keyframes pp-in { from { opacity: 0; transform: translate(-50%, 6px) } }
#photo-ui .pb { font-family: inherit; font-size: 14px; padding: 3px 9px; border-radius: 999px; border: 2px solid #fff; background: #f6e7c8; color: #8a6b48; cursor: pointer; box-shadow: 0 2px 0 #e2c99c; transition: transform .12s; white-space: nowrap; }
#photo-ui button { outline: none; }
#photo-ui .pb:hover { transform: translateY(-1px); }
#photo-ui .pb.on { background: #ff9fb8; color: #fff; box-shadow: 0 2px 0 #e07d98; }
#photo-ui .pb.st { font-size: 18px; padding: 0 5px; line-height: 26px; }
#photo-ui .pshut { flex: none; width: 62px; height: 62px; border-radius: 50%; border: 5px solid #fff; background: radial-gradient(circle at 38% 34%, #fff 0 12%, #ffb3c6 13% 100%); box-shadow: 0 5px 0 #e07d98, 0 0 0 4px #ffd6e1; cursor: pointer; font-size: 22px; font-family: inherit; color: #fff; align-self: center; transition: transform .1s; }
#photo-ui .pshut:active { transform: scale(.94); }
#photo-ui .pside { flex: none; display: flex; flex-direction: column; gap: 5px; align-self: center; }
#photo-ui .pcount { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); font-size: 150px; color: #fff; text-shadow: 0 6px 0 #ff9fb8, 0 0 30px #ff9fb8aa; display: none; }
#photo-ui .pcount.on { display: block; animation: pc-pop .9s ease-out infinite; }
@keyframes pc-pop { 0% { transform: translate(-50%, -50%) scale(1.35); opacity: 0.4 } 25% { transform: translate(-50%, -50%) scale(1); opacity: 1 } 100% { transform: translate(-50%, -50%) scale(0.92); opacity: 0.9 } }
#photo-ui .pflash { position: absolute; inset: 0; background: #fffdf6; opacity: 0; pointer-events: none; }
#photo-ui .pflash.on { animation: pf-flash .55s ease-out; }
@keyframes pf-flash { 0% { opacity: .95 } 100% { opacity: 0 } }
#photo-ui .pres, #photo-ui .palbum { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: auto; padding: 16px 18px; display: none; }
#photo-ui .pres.on, #photo-ui .palbum.on { display: block; animation: pr-in .25s ease-out; }
@keyframes pr-in { from { transform: translate(-50%, -46%) scale(.9); opacity: 0 } }
#photo-ui .pres { width: min(440px, 86vw); text-align: center; }
#photo-ui .pres img { width: 100%; border-radius: 12px; border: 3px solid #fff; box-shadow: 0 3px 0 #ead6ad; transform: rotate(-1.5deg); }
#photo-ui .pres h3, #photo-ui .palbum h3 { margin: 4px 0 8px; font-weight: normal; font-size: 22px; color: #b07a3a; }
#photo-ui .pres .meta { font-size: 15px; color: #8a6b48; margin: 8px 0 4px; }
#photo-ui .pres .new { font-size: 16px; color: #3f9a57; margin: 4px 0; }
#photo-ui .pres .bonus { font-size: 16px; color: #c58a12; margin: 4px 0; }
#photo-ui .pbtns { display: flex; gap: 8px; justify-content: center; margin-top: 10px; flex-wrap: wrap; }
#photo-ui .pbig { font-family: inherit; font-size: 16px; padding: 6px 16px; border-radius: 999px; border: 3px solid #fff; background: #7ccf8a; color: #fff; cursor: pointer; box-shadow: 0 3px 0 #4ea562; }
#photo-ui .pbig.pink { background: #ff9fb8; box-shadow: 0 3px 0 #e07d98; }
#photo-ui .pbig.sky { background: #6cc3ef; box-shadow: 0 3px 0 #3d97c6; }
#photo-ui .pbig.cream { background: #f6e7c8; color: #8a6b48; box-shadow: 0 3px 0 #e2c99c; }
#photo-ui .palbum { width: min(760px, 92vw); max-height: 82vh; overflow: auto; }
#photo-ui .pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
#photo-ui .pcell { background: #fff; border: 3px solid #fff; border-radius: 14px; box-shadow: 0 3px 0 #ecd9b4; cursor: pointer; padding: 4px; text-align: center; font-size: 13px; color: #8a6b48; transition: transform .12s; }
#photo-ui .pcell:hover { transform: translateY(-2px) rotate(-1deg); }
#photo-ui .pcell img { width: 100%; border-radius: 10px; display: block; aspect-ratio: 16 / 10; object-fit: cover; background: #f6e7c8; }
#photo-ui .pempty { padding: 26px; text-align: center; color: #a88a66; font-size: 17px; }
#photo-ui .pbig-view img { width: 100%; border-radius: 12px; border: 3px solid #fff; }
#photo-ui.clean .pbar, #photo-ui.clean .ptop, #photo-ui.clean .pspot { display: none; }
`;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 화면이 바깥(photo.ts)에 알리는 것 */
export interface PhotoUiHandlers {
  filter(id: FilterId): void;
  frame(id: FrameId): void;
  /** 스티커 고르기(null = 붙이기 끝) */
  pickSticker(e: string | null): void;
  /** 꾸미기 캔버스 클릭(0..1 좌표) */
  decoClick(x: number, y: number): void;
  clearStickers(): void;
  pose(id: PoseDef['id']): void;
  timer(): void;
  camMode(): void;
  shutter(): void;
  album(): void;
  exit(): void;
  /** 결과 카드: PNG 저장 */
  save(): void;
  closeResult(): void;
  /** 앨범에서 한 장: 저장·지우기 */
  albumSave(id: number): void;
  albumDelete(id: number): void;
  albumClose(): void;
}

/** 지금 상태(도구 막대 켜짐 표시용) */
export interface PhotoUiState {
  filter: FilterId;
  frame: FrameId;
  sticker: string | null;
  pose: string | null;
  timer: number;
  camMode: 'orbit' | 'free';
}

export class PhotoView {
  readonly root: HTMLDivElement;
  private deco: HTMLCanvasElement;
  private dg: CanvasRenderingContext2D | null;
  /** 필름 알갱이 미리보기(overlay 섞기는 CSS mix-blend-mode 로 — 저장본과 같은 섞기) */
  private grainEl: HTMLCanvasElement;
  private grainDrawn = false;
  private msgEl: HTMLElement;
  private msgTimer = 0;
  private countEl: HTMLElement;
  private flashEl: HTMLElement;
  private spotEl: HTMLElement;
  private resEl: HTMLElement;
  private albumEl: HTMLElement;
  private bar: HTMLElement;
  /** 앨범 크게 보기 그림 주소(바꿀 때 놓아준다) */
  private bigUrl = '';

  constructor(private h: PhotoUiHandlers) {
    if (!document.getElementById('photo-css')) {
      const st = document.createElement('style');
      st.id = 'photo-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const root = document.createElement('div');
    root.id = 'photo-ui';
    root.hidden = true;
    root.innerHTML = `
      <canvas class="pgrain"></canvas>
      <canvas class="pdeco"></canvas>
      <div class="pflash"></div>
      <div class="ptop pcard"><b>📷 사진 모드</b>
        <span><span class="k">WASD</span> 이동</span><span><span class="k">Q</span><span class="k">E</span> 높이</span>
        <span><span class="k">드래그</span> 시점</span><span><span class="k">휠</span> 줌</span>
        <span><span class="k">Space</span> 찰칵</span><span><span class="k">H</span> 숨기기</span><span><span class="k">P</span> 나가기</span></div>
      <div class="pmsg pcard"></div>
      <div class="pspot"></div>
      <div class="pcount"></div>
      <div class="pbar pcard">
        <div class="pgrp" data-p="filter"><i>필터 <span class="k">R</span></i><button class="pb pcur" data-c="filter"></button><div class="ppop pcard" data-g="filter"></div></div>
        <div class="pgrp" data-p="frame"><i>액자 <span class="k">B</span></i><button class="pb pcur" data-c="frame"></button><div class="ppop pcard" data-g="frame"></div></div>
        <div class="pgrp" data-p="sticker"><i>스티커 · 화면 콕!</i><button class="pb pcur" data-c="sticker"></button><div class="ppop pcard" data-g="sticker"></div></div>
        <div class="pgrp" data-p="pose"><i>포즈 <span class="k">1</span>~<span class="k">5</span></i><button class="pb pcur" data-c="pose"></button><div class="ppop pcard" data-g="pose"></div></div>
        <div class="pside">
          <button class="pb" data-a="timer"></button>
          <button class="pb" data-a="cam"></button>
        </div>
        <button class="pshut" data-a="shutter" title="찰칵! (Space)">📷</button>
        <div class="pside">
          <button class="pb" data-a="album">📒 앨범 <span class="k">L</span></button>
          <button class="pb" data-a="exit">🚪 나가기</button>
        </div>
      </div>
      <div class="pres pcard"></div>
      <div class="palbum pcard"></div>`;
    document.body.appendChild(root);
    this.root = root;
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    this.deco = $('.pdeco') as HTMLCanvasElement;
    this.dg = this.deco.getContext('2d');
    this.grainEl = $('.pgrain') as HTMLCanvasElement;
    this.msgEl = $('.pmsg');
    this.countEl = $('.pcount');
    this.flashEl = $('.pflash');
    this.spotEl = $('.pspot');
    this.resEl = $('.pres');
    this.albumEl = $('.palbum');
    this.bar = $('.pbar');

    const row = (g: string) => root.querySelector(`[data-g="${g}"]`) as HTMLElement;
    const btn = (parent: HTMLElement, html: string, data: string, on: () => void, cls = 'pb') => {
      const b = document.createElement('button');
      b.className = cls; b.innerHTML = html; b.dataset.v = data;
      b.addEventListener('click', (e) => { e.stopPropagation(); on(); });
      parent.appendChild(b);
    };
    // 필터·액자는 고른 뒤에도 말풍선을 열어 둔다(이것저것 바로 비교) · 스티커·포즈는 고르면 닫는다(화면 콕·찰칵)
    for (const f of FILTERS) btn(row('filter'), `${f.icon} ${esc(f.label)}`, f.id, () => h.filter(f.id));
    for (const f of FRAMES) btn(row('frame'), `${f.icon} ${esc(f.label)}`, f.id, () => h.frame(f.id));
    for (const s of STICKERS) btn(row('sticker'), s, s, () => { this.closePops(); h.pickSticker(s); }, 'pb st');
    btn(row('sticker'), '🧽', '__clear', () => { this.closePops(); h.clearStickers(); }, 'pb st');
    for (const p of POSES) btn(row('pose'), `${p.icon} ${esc(p.label)}`, p.id, () => { this.closePops(); h.pose(p.id); });
    // 지금 고른 것 버튼 → 그 묶음 말풍선 열고 닫기(하나만 열린다)
    for (const c of root.querySelectorAll<HTMLElement>('.pcur')) {
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        const grp = c.parentElement as HTMLElement;
        const was = grp.classList.contains('open');
        this.closePops();
        if (!was) grp.classList.add('open');
      });
    }
    const act = (a: string, fn: () => void) => $(`[data-a="${a}"]`).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    act('timer', () => h.timer());
    act('cam', () => h.camMode());
    act('shutter', () => h.shutter());
    act('album', () => h.album());
    act('exit', () => h.exit());
    // 버튼이 포커스를 잡지 않게 — 잡으면 Space(셔터)가 그 버튼까지 한 번 더 누른다
    root.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.deco.addEventListener('click', (e) => {
      // 말풍선이 열려 있으면 이번 콕은 닫기만
      if (this.closePops()) return;
      const r = this.deco.getBoundingClientRect();
      h.decoClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    });
  }

  /** 펼친 말풍선 닫기 → 닫은 게 있었나 */
  closePops(): boolean {
    let any = false;
    for (const g of this.root.querySelectorAll('.pgrp.open')) { g.classList.remove('open'); any = true; }
    return any;
  }

  show(on: boolean) {
    this.root.hidden = !on;
    if (!on) { this.closePops(); this.showResult(null); this.showAlbum(null); this.countdown(0); this.root.classList.remove('clean', 'placing'); }
  }
  get visible() { return !this.root.hidden; }
  /** H: 도구 막대 숨기기(깨끗한 화면) */
  toggleClean(): boolean { this.closePops(); return this.root.classList.toggle('clean'); }
  get clean() { return this.root.classList.contains('clean'); }

  /** 도구 막대 켜짐 표시 */
  sync(s: PhotoUiState) {
    const mark = (g: string, v: string | null) => {
      for (const b of this.root.querySelectorAll<HTMLElement>(`[data-g="${g}"] .pb`)) b.classList.toggle('on', b.dataset.v === v);
    };
    mark('filter', s.filter);
    mark('frame', s.frame);
    mark('sticker', s.sticker);
    mark('pose', s.pose);
    // 지금 고른 것(한 칸)
    const cur = (g: string, html: string, on = false) => {
      const b = this.root.querySelector(`[data-c="${g}"]`) as HTMLElement;
      if (b.innerHTML !== html) b.innerHTML = html;
      b.classList.toggle('on', on);
    };
    const fi = FILTERS.find((x) => x.id === s.filter) ?? FILTERS[0];
    const fr = FRAMES.find((x) => x.id === s.frame) ?? FRAMES[0];
    const po = POSES.find((x) => x.id === s.pose);
    cur('filter', `${fi.icon} ${esc(fi.label)}`);
    cur('frame', `${fr.icon} ${esc(fr.label)}`);
    cur('sticker', s.sticker ? `${esc(s.sticker)} 붙이는 중` : '🌸 고르기', !!s.sticker);
    cur('pose', po ? `${po.icon} ${esc(po.label)}` : '🙂 그냥', !!po);
    const tb = this.root.querySelector('[data-a="timer"]') as HTMLElement;
    tb.innerHTML = `⏱️ ${s.timer ? `${s.timer}초` : '타이머 끔'} <span class="k">T</span>`;
    tb.classList.toggle('on', s.timer > 0);
    const cb = this.root.querySelector('[data-a="cam"]') as HTMLElement;
    cb.innerHTML = `${s.camMode === 'orbit' ? '🎠 빙글 카메라' : '🕊️ 자유 카메라'} <span class="k">F</span>`;
    this.root.classList.toggle('placing', !!s.sticker);
  }

  /** 잠깐 알림 한 줄 */
  msg(text: string, ms = 1800) {
    this.msgEl.textContent = text;
    this.msgEl.classList.add('on');
    clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => this.msgEl.classList.remove('on'), ms);
  }
  /** 명소 안내(가까이 있을 때) */
  spot(text: string | null) {
    this.spotEl.classList.toggle('on', !!text);
    if (text && this.spotEl.textContent !== text) this.spotEl.textContent = text;
  }
  countdown(n: number) {
    this.countEl.classList.toggle('on', n > 0);
    const t = n > 0 ? String(n) : '';
    if (this.countEl.textContent !== t) this.countEl.textContent = t;
  }
  flash() {
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth; // 애니메이션 다시 걸기
    this.flashEl.classList.add('on');
  }
  /** 셔터 순간 도구 막대·안내를 잠깐 가린다(게임 캔버스엔 원래 안 찍히지만 눈에도 깔끔하게) */
  hideChrome(on: boolean) { this.bar.style.visibility = on ? 'hidden' : ''; }

  /** 꾸미기 미리보기 다시 그리기(화면 크기 캔버스) */
  drawDeco(frame: FrameId, filter: FilterId, stickers: readonly PlacedSticker[], caption: string, grain: HTMLCanvasElement | null) {
    const g = this.dg;
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(innerWidth * dpr)), h = Math.max(1, Math.round(innerHeight * dpr));
    if (this.deco.width !== w || this.deco.height !== h) { this.deco.width = w; this.deco.height = h; }
    g.clearRect(0, 0, w, h);
    // 알갱이: 따로 깐 캔버스에 무늬를 한 번 그리고 세기는 opacity 로(아래 게임 캔버스와 overlay 로 섞인다)
    const f = filterById(filter);
    if (f.grain > 0 && grain) {
      const ge = this.grainEl;
      if (ge.width !== w || ge.height !== h || !this.grainDrawn) {
        ge.width = w; ge.height = h;
        const gg = ge.getContext('2d');
        if (gg) { drawGrain(gg, w, h, grain, 1); this.grainDrawn = true; }
      }
      ge.style.opacity = String(f.grain);
    } else this.grainEl.style.opacity = '0';
    drawFrame(g, w, h, frame, caption);
    drawStickers(g, w, h, stickers);
  }

  /** 찍은 결과 카드(null = 닫기) */
  showResult(r: { url: string; meta: PhotoMeta; place: string; fresh: string[]; bonus: string | null; canSave: boolean } | null) {
    if (!r) { this.resEl.classList.remove('on'); this.resEl.innerHTML = ''; return; }
    const m = r.meta;
    this.resEl.innerHTML = `
      <h3>찰칵! 앨범에 꽂았어요 📒</h3>
      <img src="${r.url}" alt="방금 찍은 사진">
      <div class="meta">📍 ${esc(r.place)} · 🕰️ ${esc(gameTimeText(m.day, m.hour))}</div>
      ${r.fresh.length ? `<div class="new">📖 도감에 새로 적었어요: ${r.fresh.map(esc).join(', ')}</div>` : ''}
      ${r.bonus ? `<div class="bonus">${esc(r.bonus)}</div>` : ''}
      <div class="pbtns">
        ${r.canSave ? '<button class="pbig pink" data-r="save">💾 PNG 저장</button>' : ''}
        <button class="pbig sky" data-r="album">📒 앨범 보기</button>
        <button class="pbig" data-r="close">📷 계속 찍기</button>
      </div>`;
    const on = (k: string, fn: () => void) => this.resEl.querySelector(`[data-r="${k}"]`)?.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    on('save', () => this.h.save());
    on('album', () => this.h.album());
    on('close', () => this.h.closeResult());
    this.resEl.classList.add('on');
  }
  get resultOpen() { return this.resEl.classList.contains('on'); }

  /** 앨범(null = 닫기). sel 이 있으면 그 한 장을 크게 */
  showAlbum(a: { rows: PhotoRecord[]; metas: Map<number, PhotoMeta>; names: (id: string) => string; sel?: number; kind: 'idb' | 'memory' } | null) {
    if (this.bigUrl) { URL.revokeObjectURL(this.bigUrl); this.bigUrl = ''; }
    if (!a) { this.albumEl.classList.remove('on'); this.albumEl.innerHTML = ''; return; }
    const rows = [...a.rows].sort((x, y) => y.id - x.id);
    const pick = a.sel !== undefined ? rows.find((r) => r.id === a.sel) : undefined;
    if (pick) {
      const m = a.metas.get(pick.id);
      if (pick.blob) { try { this.bigUrl = URL.createObjectURL(pick.blob); } catch { this.bigUrl = ''; } }
      this.albumEl.innerHTML = `
        <h3>📒 사진 한 장</h3>
        <div class="pbig-view"><img src="${this.bigUrl || pick.thumb}" alt="사진"></div>
        <div class="meta" style="font-size:15px;color:#8a6b48;margin:8px 0">${m ? `📍 ${esc(m.place)} · 🕰️ ${esc(gameTimeText(m.day, m.hour))}${m.species.length ? ` · 🐾 ${m.species.map((s) => esc(a.names(s))).join(', ')}` : ''}` : esc(new Date(pick.at).toLocaleString())}</div>
        <div class="pbtns">
          ${pick.blob ? '<button class="pbig pink" data-x="save">💾 PNG 저장</button>' : ''}
          <button class="pbig cream" data-x="del">🗑️ 떼어내기</button>
          <button class="pbig sky" data-x="back">↩ 앨범으로</button>
        </div>`;
      const on = (k: string, fn: () => void) => this.albumEl.querySelector(`[data-x="${k}"]`)?.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      on('save', () => this.h.albumSave(pick.id));
      on('del', () => this.h.albumDelete(pick.id));
      on('back', () => this.showAlbum({ ...a, sel: undefined }));
    } else {
      this.albumEl.innerHTML = `
        <h3>📒 사진 앨범 <small style="font-size:14px;color:#a88a66">최근 ${rows.length}/12장${a.kind === 'memory' ? ' · 이번에만 보관' : ''}</small></h3>
        ${rows.length ? '<div class="pgrid"></div>' : '<div class="pempty">아직 사진이 없어요. 셔터를 눌러 첫 추억을 남겨 봐요! 📷</div>'}
        <div class="pbtns"><button class="pbig" data-x="close">닫기</button></div>`;
      const grid = this.albumEl.querySelector('.pgrid');
      for (const r of rows) {
        const m = a.metas.get(r.id);
        const cell = document.createElement('div');
        cell.className = 'pcell';
        cell.innerHTML = `<img src="${r.thumb}" alt="사진"><div>${esc(m?.place ?? '추억')}</div>`;
        cell.addEventListener('click', (e) => { e.stopPropagation(); this.showAlbum({ ...a, sel: r.id }); });
        grid?.appendChild(cell);
      }
      this.albumEl.querySelector('[data-x="close"]')?.addEventListener('click', (e) => { e.stopPropagation(); this.h.albumClose(); });
    }
    this.albumEl.classList.add('on');
  }
  get albumOpen() { return this.albumEl.classList.contains('on'); }

  dispose() { this.root.remove(); }
}
