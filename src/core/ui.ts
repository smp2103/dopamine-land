// 기본 UI(돔 오버레이): 행동 안내(두 줄), 토스트, 잡았다 배너, 코인. hud 담당이 꾸미고 넓힌다(도감·상점 창 등).
// 계약 v2 3장: showCatch 가 크기·변이·활동·keep 을 넘기고, 들어 올리기는 0.55m(거대종 1.1m)로 맞추고, 왕관 변이는 금관을 씌운다.
import * as THREE from 'three';
import type { Game } from './game';
import type { Species } from './state';
import { holdLen, type Activity, type Variant } from './api';
import { crownMesh } from './art';

export interface CatchShow {
  species: Species;
  /** 크기 표시(예: "32.5cm") */
  sizeText?: string;
  /** 머리 위로 들어 올릴 모델(없으면 배너만) */
  model?: THREE.Object3D;
  /** 한 줄 대사(동숲식 말장난) */
  line?: string;
  /** 크기(cm) — 없으면 sizeText 에서 읽는다 */
  size?: number;
  /** 반짝이·왕관·꼬마 */
  variant?: Variant;
  /** fish·bug·dive … */
  activity?: Activity | string;
  /** false = 목격(도감만, 가방엔 안 넣음). 기본 true */
  keep?: boolean;
}

/** 변이 배너 꼬리표 */
export const VARIANT_LABEL: Record<Variant, string> = { shiny: '✨ 반짝이', crown: '👑 왕관', tiny: '🐣 꼬마' };

export interface HoldOpts {
  /** 정규화 길이를 고르는 데 쓴다(shadow·len) */
  species?: Pick<Species, 'shadow' | 'len'>;
  variant?: Variant;
  /** false = 크기 맞추지 않기(예전 동작) */
  normalize?: boolean;
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * 모델을 들어 올리기 크기로 감싼다: 가장 긴 변 = target(m), 가로는 가운데·바닥은 0 에 맞춘다(손 위에 얹히게).
 * 원본 모델의 변환은 건드리지 않는다.
 * 돌려주는 바깥 그룹에 왕관 등 장식을 붙인다(크기 배율을 받지 않게).
 */
export function wrapForHold(obj: THREE.Object3D, target: number): { outer: THREE.Group; inner: THREE.Group; height: number } {
  const outer = new THREE.Group();
  outer.name = 'held';
  const inner = new THREE.Group();
  inner.name = 'held-scale';
  outer.add(inner);
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  let height = target;
  if (!_box.isEmpty()) {
    _box.getSize(_size);
    _box.getCenter(_center);
    const longest = Math.max(_size.x, _size.y, _size.z);
    if (Number.isFinite(longest) && longest > 1e-6) {
      const k = target / longest;
      inner.scale.setScalar(k);
      inner.position.set(-_center.x * k, -_box.min.y * k, -_center.z * k);
      height = _size.y * k;
    }
  }
  inner.add(obj);
  return { outer, inner, height };
}

export class GameUI {
  el!: HTMLDivElement;
  prompt!: HTMLDivElement;
  private promptMain!: HTMLDivElement;
  private promptAlt!: HTMLDivElement;
  toasts!: HTMLDivElement;
  banner!: HTMLDivElement;
  coins!: HTMLDivElement;
  held: { obj: THREE.Object3D; until: number; model: THREE.Object3D } | null = null;
  /** hud 담당이 덮어쓸 수 있는 훅 */
  renderCatch: ((c: CatchShow, isNew: boolean) => void) | null = null;
  /** 지금 떠 있는 안내(디버그·테스트) */
  promptState: { primary: string | null; alt: string | null } = { primary: null, alt: null };

  constructor(private game: Game) {}

  mount() {
    const css = document.createElement('style');
    css.textContent = `
      #ui { position: fixed; inset: 0; pointer-events: none; font-family: 'Jua', system-ui, sans-serif; color: #4a3b2a; }
      #ui .prompt { position: absolute; left: 50%; bottom: 14%; transform: translateX(-50%); background: #fff8e8ee; border-radius: 18px;
        padding: 8px 16px; font-size: 18px; box-shadow: 0 3px 0 #e2cfa8; display: none; text-align: center; white-space: nowrap; }
      #ui .prompt .alt { font-size: 15px; opacity: 0.8; margin-top: 2px; display: none; }
      #ui .toasts { position: absolute; left: 50%; top: 9%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; }
      #ui .toast { background: #fffdf6f0; border-radius: 14px; padding: 6px 14px; font-size: 16px; box-shadow: 0 2px 0 #e9d9b5; }
      #ui .banner { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); text-align: center; display: none; }
      #ui .banner .name { font-size: 34px; color: #fff; -webkit-text-stroke: 6px #6b4a2b; paint-order: stroke fill; }
      #ui .banner .sub { font-size: 18px; margin-top: 4px; background: #fff8e8ee; border-radius: 12px; padding: 4px 12px; display: inline-block; }
      #ui .banner .var { font-size: 16px; margin: 4px 0 0; color: #b5761f; }
      #ui .coins { position: absolute; right: 18px; top: 14px; background: #fff8e8ee; border-radius: 16px; padding: 6px 14px; font-size: 18px; box-shadow: 0 2px 0 #e2cfa8; }
    `;
    document.head.appendChild(css);
    this.el = document.createElement('div');
    this.el.id = 'ui';
    this.el.innerHTML = '<div class="prompt"><div class="main"></div><div class="alt"></div></div><div class="toasts"></div><div class="banner"></div><div class="coins"></div>';
    document.body.appendChild(this.el);
    this.prompt = this.el.querySelector('.prompt')!;
    this.promptMain = this.prompt.querySelector('.main')!;
    this.promptAlt = this.prompt.querySelector('.alt')!;
    this.toasts = this.el.querySelector('.toasts')!;
    this.banner = this.el.querySelector('.banner')!;
    this.coins = this.el.querySelector('.coins')!;
    this.game.state.on((e) => { if (e.type === 'coins') this.refreshCoins(); });
    this.refreshCoins();
  }

  refreshCoins() { if (this.coins) this.coins.textContent = `코인 ${this.game.state.coins.toLocaleString()}`; }

  /** 행동 안내 두 줄: 위 = E(가장 가까운 것), 아래 = 다른 키(F 등). 둘 다 없으면 숨긴다. hud 가 감싸서 자기 칩으로 그려도 된다 */
  setPrompt(primary: string | null, alt?: string | null) {
    const a = alt ?? null;
    this.promptState = { primary, alt: a };
    if (!this.prompt) return;
    this.prompt.style.display = primary || a ? 'block' : 'none';
    const p = primary ?? '';
    if (this.promptMain.textContent !== p) this.promptMain.textContent = p;
    this.promptMain.style.display = primary ? 'block' : 'none';
    if (this.promptAlt.textContent !== (a ?? '')) this.promptAlt.textContent = a ?? '';
    this.promptAlt.style.display = a ? 'block' : 'none';
  }

  toast(text: string, ms = 2200) {
    if (!this.toasts) return;
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    this.toasts.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }

  /** 잡았다! — 도감 기록 + 머리 위로 들어 올리기 + 배너. keep:false 면 '만났다'(도감만). 처음이면 true */
  showCatch(c: CatchShow): boolean {
    const size = typeof c.size === 'number' && Number.isFinite(c.size) ? c.size : c.sizeText ? parseFloat(c.sizeText) : undefined;
    const isNew = this.game.state.collect({
      species: c.species, size: Number.isFinite(size) ? size : undefined, variant: c.variant, activity: c.activity, keep: c.keep,
    });
    if (this.renderCatch) this.renderCatch(c, isNew);
    else if (this.banner) {
      const stars = '★'.repeat(c.species.rarity) + '☆'.repeat(Math.max(0, 5 - c.species.rarity));
      const verb = c.keep === false ? ' 만났다!' : '';
      const v = c.variant ? `<div class="var">${VARIANT_LABEL[c.variant]}</div>` : '';
      this.banner.innerHTML = `<div class="name">${esc(c.species.name)}${verb}${isNew ? ' (NEW!)' : ''}</div>${v}<div class="sub">${stars} ${esc(c.sizeText ?? '')} ${esc(c.line ?? '')}${c.keep === false ? ' · 도감에 적었어요' : ''}</div>`;
      this.banner.style.display = 'block';
      window.clearTimeout(this.bannerTimer);
      this.bannerTimer = window.setTimeout(() => { this.banner.style.display = 'none'; }, 2600);
    }
    if (c.model) this.hold(c.model, 2.6, { species: c.species, variant: c.variant });
    return isNew;
  }
  private bannerTimer = 0;

  /**
   * 플레이어 머리 위(또는 손)에 잠깐 들고 있기.
   * 가장 긴 변을 0.55m(거대종 XL·XXL, 그림자 정보가 없으면 len ≥ 150 → 1.1m)로 맞춘다. 왕관 변이면 금관을 씌운다.
   */
  hold(obj: THREE.Object3D, seconds: number, o: HoldOpts = {}) {
    if (this.held) this.held.obj.removeFromParent();
    let shown: THREE.Object3D = obj;
    if (o.normalize !== false) {
      const target = holdLen(o.species ?? {});
      const w = wrapForHold(obj, target);
      if (o.variant === 'crown') {
        const crown = crownMesh(target * 0.42);
        crown.position.set(0, w.height - target * 0.02, 0);
        w.outer.add(crown);
      }
      shown = w.outer;
    }
    const slot = this.game.player.avatar?.holdSlot;
    if (slot) {
      slot.add(shown);
      shown.position.set(0, 0, 0);
      // 손 자리가 아바타 배율을 물려받으면 되돌려서 '세상 기준' 길이를 지킨다
      if (o.normalize !== false) {
        slot.updateWorldMatrix(true, false);
        const ws = slot.getWorldScale(_size).x;
        if (Number.isFinite(ws) && ws > 1e-6) shown.scale.setScalar(1 / ws);
      }
    } else this.game.root.add(shown);
    this.held = { obj: shown, until: this.game.time + seconds, model: obj };
  }

  update(_dt: number) {
    const h = this.held;
    if (!h) return;
    if (!this.game.player.avatar?.holdSlot) {
      h.obj.position.copy(this.game.player.pos).add(new THREE.Vector3(0, 2.1 + Math.sin(this.game.time * 4) * 0.05, 0));
      h.obj.rotation.y += 0.02;
    }
    if (this.game.time > h.until) { h.obj.removeFromParent(); this.held = null; }
  }
}
