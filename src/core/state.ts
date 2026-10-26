// 수집·재화 상태 — 도감(종별 마리 수·최대 크기), 가방, 코인. 브라우저 저장(실패해도 게임은 돈다).
export type Category = string; // 'fish' | 'bug' | 'dino' | 'sea' | 'space' | 'fossil' | 'item' …

export interface Species {
  id: string;
  name: string;
  category: Category;
  /** 1(흔함) ~ 5(전설) */
  rarity: number;
  desc?: string;
  habitat?: string;
  /** 기본 판매가(코인) */
  price?: number;
}

export interface CollectEntry { species: Species; size?: number }

type Listener = (e: { type: string; [k: string]: unknown }) => void;

const KEY = 'dopamine-land-save-v1';

export class GameState {
  coins = 0;
  /** 가방: 아이템 id → 개수 */
  bag: Record<string, number> = {};
  /** 도감: 종 id → 기록 */
  dex: Record<string, { count: number; best: number; first: number }> = {};
  /** 등록된 모든 종(도감 칸) */
  species = new Map<string, Species>();
  flags: Record<string, unknown> = {};
  private listeners: Listener[] = [];

  on(fn: Listener) { this.listeners.push(fn); }
  emit(e: { type: string; [k: string]: unknown }) { for (const l of this.listeners) l(e); }

  /** 모듈이 자기 종 목록을 등록한다(도감 전체 칸 수가 여기서 정해진다) */
  register(list: Species[]) { for (const s of list) this.species.set(s.id, s); this.emit({ type: 'register' }); }

  /** 잡았다/주웠다: 도감 기록 + 가방에 넣기. 처음이면 true */
  collect(e: CollectEntry): boolean {
    const id = e.species.id;
    if (!this.species.has(id)) this.species.set(id, e.species);
    const rec = this.dex[id];
    const isNew = !rec;
    this.dex[id] = { count: (rec?.count ?? 0) + 1, best: Math.max(rec?.best ?? 0, e.size ?? 0), first: rec?.first ?? Date.now() };
    this.bag[id] = (this.bag[id] ?? 0) + 1;
    this.emit({ type: 'collect', species: e.species, size: e.size, isNew });
    this.save();
    return isNew;
  }

  addCoins(n: number, why = '') { this.coins = Math.max(0, this.coins + n); this.emit({ type: 'coins', delta: n, why }); this.save(); }
  addItem(id: string, n = 1) { this.bag[id] = (this.bag[id] ?? 0) + n; if (this.bag[id] <= 0) delete this.bag[id]; this.emit({ type: 'bag', id, delta: n }); this.save(); }
  has(id: string, n = 1) { return (this.bag[id] ?? 0) >= n; }

  dexCount(category?: Category) {
    let got = 0, total = 0;
    for (const s of this.species.values()) {
      if (category && s.category !== category) continue;
      total++;
      if (this.dex[s.id]) got++;
    }
    return { got, total };
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ coins: this.coins, bag: this.bag, dex: this.dex, flags: this.flags })); } catch { /* 저장 불가 환경 */ }
  }

  load() {
    try {
      if (new URLSearchParams(location.search).get('fresh') === '1') return;
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.coins = d.coins ?? 0; this.bag = d.bag ?? {}; this.dex = d.dex ?? {}; this.flags = d.flags ?? {};
    } catch { /* 무시 */ }
  }
}
