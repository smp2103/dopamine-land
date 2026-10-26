// 기본 UI(돔 오버레이): 행동 안내, 토스트, 잡았다 배너, 코인. ui 담당이 꾸미고 넓힌다(도감·상점 창 등).
import * as THREE from 'three';
import type { Game } from './game';
import type { Species } from './state';

export interface CatchShow {
  species: Species;
  /** 크기 표시(예: "32.5cm") */
  sizeText?: string;
  /** 머리 위로 들어 올릴 모델(없으면 배너만) */
  model?: THREE.Object3D;
  /** 한 줄 대사(동숲식 말장난) */
  line?: string;
}

export class GameUI {
  el!: HTMLDivElement;
  prompt!: HTMLDivElement;
  toasts!: HTMLDivElement;
  banner!: HTMLDivElement;
  coins!: HTMLDivElement;
  held: { obj: THREE.Object3D; until: number } | null = null;
  /** ui 담당이 덮어쓸 수 있는 훅 */
  renderCatch: ((c: CatchShow, isNew: boolean) => void) | null = null;

  constructor(private game: Game) {}

  mount() {
    const css = document.createElement('style');
    css.textContent = `
      #ui { position: fixed; inset: 0; pointer-events: none; font-family: 'Jua', system-ui, sans-serif; color: #4a3b2a; }
      #ui .prompt { position: absolute; left: 50%; bottom: 14%; transform: translateX(-50%); background: #fff8e8ee; border-radius: 18px;
        padding: 8px 16px; font-size: 18px; box-shadow: 0 3px 0 #e2cfa8; display: none; }
      #ui .toasts { position: absolute; left: 50%; top: 9%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; }
      #ui .toast { background: #fffdf6f0; border-radius: 14px; padding: 6px 14px; font-size: 16px; box-shadow: 0 2px 0 #e9d9b5; }
      #ui .banner { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); text-align: center; display: none; }
      #ui .banner .name { font-size: 34px; color: #fff; -webkit-text-stroke: 6px #6b4a2b; paint-order: stroke fill; }
      #ui .banner .sub { font-size: 18px; margin-top: 4px; background: #fff8e8ee; border-radius: 12px; padding: 4px 12px; display: inline-block; }
      #ui .coins { position: absolute; right: 18px; top: 14px; background: #fff8e8ee; border-radius: 16px; padding: 6px 14px; font-size: 18px; box-shadow: 0 2px 0 #e2cfa8; }
    `;
    document.head.appendChild(css);
    this.el = document.createElement('div');
    this.el.id = 'ui';
    this.el.innerHTML = '<div class="prompt"></div><div class="toasts"></div><div class="banner"></div><div class="coins"></div>';
    document.body.appendChild(this.el);
    this.prompt = this.el.querySelector('.prompt')!;
    this.toasts = this.el.querySelector('.toasts')!;
    this.banner = this.el.querySelector('.banner')!;
    this.coins = this.el.querySelector('.coins')!;
    this.game.state.on((e) => { if (e.type === 'coins') this.refreshCoins(); });
    this.refreshCoins();
  }

  refreshCoins() { if (this.coins) this.coins.textContent = `코인 ${this.game.state.coins.toLocaleString()}`; }

  setPrompt(text: string | null) {
    if (!this.prompt) return;
    this.prompt.style.display = text ? 'block' : 'none';
    if (text && this.prompt.textContent !== text) this.prompt.textContent = text;
  }

  toast(text: string, ms = 2200) {
    if (!this.toasts) return;
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    this.toasts.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }

  /** 잡았다! — 도감 기록 + 머리 위로 들어 올리기 + 배너 */
  showCatch(c: CatchShow) {
    const isNew = this.game.state.collect({ species: c.species, size: c.sizeText ? parseFloat(c.sizeText) : undefined });
    if (this.renderCatch) this.renderCatch(c, isNew);
    else {
      const stars = '★'.repeat(c.species.rarity) + '☆'.repeat(Math.max(0, 5 - c.species.rarity));
      this.banner.innerHTML = `<div class="name">${c.species.name}${isNew ? ' (NEW!)' : ''}</div><div class="sub">${stars} ${c.sizeText ?? ''} ${c.line ?? ''}</div>`;
      this.banner.style.display = 'block';
      window.clearTimeout(this.bannerTimer);
      this.bannerTimer = window.setTimeout(() => { this.banner.style.display = 'none'; }, 2600);
    }
    if (c.model) this.hold(c.model, 2.6);
  }
  private bannerTimer = 0;

  /** 플레이어 머리 위(또는 손)에 잠깐 들고 있기 */
  hold(obj: THREE.Object3D, seconds: number) {
    if (this.held) this.held.obj.removeFromParent();
    const slot = this.game.player.avatar?.holdSlot;
    if (slot) { slot.add(obj); obj.position.set(0, 0, 0); }
    else this.game.root.add(obj);
    this.held = { obj, until: this.game.time + seconds };
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
