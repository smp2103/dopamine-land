// 섬 특산 시설(GDD 3.12 P1 · 4.7 ③): 짓기 전엔 작은 노점(계산대 + 차양), facility:<id> 가 열리면 시설 외형.
// 비눗방울 정류장(등대 옆, 복구되면 큰 방울이 뜬다)과 마을 상태 맞추기(해금 → 등대·발사탑·집·시설)도 여기.
// 원점 = 땅, 앞 = +z. front = 원점에서 계산대·문 앞까지(시설 자리 = 상호작용 점에 앞을 맞춘다).
import * as THREE from 'three';
import { add, cap, cyl, sph, dome, rbox, blob, label, stripesA, stripesY, roundExtrude, roundRectShape, compactLive, mergeParts, V, WOOD, WOOD_DARK, BONE, type Built, type Col } from './common';
import { houseKeyStage, houseStageFromUnlocks } from './house';

// ───────── 시설 id ─────────
export const FACILITY_IDS = ['apiary', 'divingCenter', 'fireflyGarden', 'fossilLab', 'iceHut', 'bazaar', 'observatory', 'potionShop', 'skiLift'] as const;
export type FacilityId = (typeof FACILITY_IDS)[number];

export const FACILITY_INFO: Record<FacilityId, { island: string; name: string; stall: string; kind: string; color: string }> = {
  apiary: { island: 'home', name: '꿀벌 농장 · 꽃시장', stall: '꽃·꿀 노점', kind: 'apiary', color: '#ffbe2a' },
  divingCenter: { island: 'coral', name: '뽀글 다이빙 센터', stall: '뽀글 다이빙 숍', kind: 'divingcenter', color: '#4fd1c5' },
  fireflyGarden: { island: 'mushroom', name: '반딧불 정원', stall: '반딧불 노점', kind: 'fireflygarden', color: '#b6e86a' },
  fossilLab: { island: 'dino', name: '화석 연구소 · 부화장', stall: '화석 감정 노점', kind: 'fossillab', color: '#7cc96b' },
  iceHut: { island: 'ice', name: '얼음낚시 오두막', stall: '얼음낚시 노점', kind: 'icehut', color: '#7fb8ff' },
  bazaar: { island: 'desert', name: '오아시스 바자르', stall: '모래 바자르', kind: 'bazaar', color: '#ffb347' },
  observatory: { island: 'launch', name: '별빛 천문대', stall: '별보기 노점', kind: 'observatory', color: '#7f8cff' },
  potionShop: { island: 'mushroom', name: '보글 물약 가게', stall: '물약 가게', kind: 'potionshop', color: '#c58cff' },
  skiLift: { island: 'ice', name: '스키 리프트', stall: '리프트 매표소', kind: 'skilift', color: '#ff7a8a' },
};

/** 이름(해금 키 꼬리)을 시설 id 들로: 'divingCenter'·'diving'·'fossillab'·'hatchery'·섬 id(launch 제외) … */
const ALIAS: Record<string, FacilityId[]> = {
  apiary: ['apiary'], bee: ['apiary'], beehive: ['apiary'], honey: ['apiary'], flower: ['apiary'], flowermarket: ['apiary'],
  divingcenter: ['divingCenter'], diving: ['divingCenter'], dive: ['divingCenter'],
  fireflygarden: ['fireflyGarden'], firefly: ['fireflyGarden'], garden: ['fireflyGarden'],
  fossillab: ['fossilLab'], fossil: ['fossilLab'], hatchery: ['fossilLab'], lab: ['fossilLab'],
  icehut: ['iceHut'], icefishing: ['iceHut'], fishinghut: ['iceHut'],
  skilift: ['skiLift'], ski: ['skiLift'], lift: ['skiLift'],
  bazaar: ['bazaar'], oasis: ['bazaar'], oasisbazaar: ['bazaar'],
  observatory: ['observatory'], telescope: ['observatory'],
  potionshop: ['potionShop'], potion: ['potionShop'],
  // 섬 id = 그 섬 ③단계 시설 전부(별똥별섬 facility:launch 는 발사장 개방 키라 천문대와 따로)
  home: ['apiary'], coral: ['divingCenter'], mushroom: ['fireflyGarden', 'potionShop'], dino: ['fossilLab'], ice: ['iceHut', 'skiLift'], desert: ['bazaar'],
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export function facilityIdsFor(name: string): FacilityId[] {
  return ALIAS[norm(name)] ?? [];
}
/** 섬의 ③단계 시설 */
export function facilitiesOfIsland(island: string): FacilityId[] {
  return FACILITY_IDS.filter((id) => FACILITY_INFO[id].island === island);
}
/** 이 시설을 여는 해금 키들 */
export function facilityKeys(id: FacilityId): string[] {
  const keys = new Set<string>([`facility:${id}`, `facility:${norm(id)}`]);
  for (const [a, ids] of Object.entries(ALIAS)) if (ids.includes(id)) keys.add(`facility:${a}`);
  const isl = FACILITY_INFO[id].island;
  for (let n = 3; n <= 5; n++) keys.add(`dev:${isl}:${n}`);
  return [...keys];
}
export function facilityUnlocked(id: FacilityId, isUnlocked: (key: string) => boolean): boolean {
  return facilityKeys(id).some((k) => isUnlocked(k));
}

// ───────── 마을 상태 맞추기(순수 배선 — 테스트가 가짜 게임으로 부른다) ─────────
export const ROCKET_PARTS = ['body', 'engine', 'window', 'wing', 'fuel', 'chip'] as const;
export interface VillageTargets {
  lighthouseIds: readonly string[];
  setLighthouse(id: string, lit: boolean): void;
  setTowerStage(n: number): void;
  setHouseStage(n: number): void;
  setFacility(id: string, on: boolean): void;
}
interface EconLike {
  isUnlocked(key: string): boolean;
  rocket?: () => { count: number };
  cheat?: boolean;
}
interface GameLike {
  econ: EconLike | null;
  state: { on(fn: (e: { type: string; [k: string]: unknown }) => void): unknown };
  onUpdate(fn: (t: number, dt: number) => void): unknown;
}
export interface VillageSync {
  /** econ 에서 처음부터 다시 읽는다 */
  resync(): void;
  readonly synced: boolean;
  /** 지금 상태(디버그) */
  snapshot(): { house: number; tower: number; facilities: string[]; lights: Record<string, boolean> };
}

/**
 * econ(order 9)은 village(order 4)보다 늦게 생기므로 첫 onUpdate 에서 한 번 맞추고, 그 뒤로는 이벤트만 듣는다.
 * cheat 면 시설을 전부 보인다. 집 단계는 내려가지 않는다(해금은 되돌리지 않는다).
 */
export function wireVillageSync(game: GameLike, T: VillageTargets, o: { cheat?: () => boolean } = {}): VillageSync {
  let synced = false;
  let house = 0, tower = 0;
  const fac = new Set<FacilityId>();
  const lights: Record<string, boolean> = {};
  const cheat = () => !!(o.cheat?.() ?? game.econ?.cheat);
  const isU = (k: string) => !!game.econ?.isUnlocked(k);
  const partCount = () => {
    const r = game.econ?.rocket?.();
    if (r && Number.isFinite(r.count)) return r.count;
    return ROCKET_PARTS.filter((p) => isU(`rocket:part:${p}`)).length;
  };
  const light = (id: string, lit: boolean) => { if (!T.lighthouseIds.includes(id)) return; lights[id] = lit; T.setLighthouse(id, lit); };
  const setTower = (n: number) => { tower = Math.max(0, Math.min(6, n)); T.setTowerStage(tower); };
  const setHouse = (n: number) => { if (n <= house && synced) return; house = Math.max(house, n); T.setHouseStage(house); };
  const facOn = (id: FacilityId) => { if (fac.has(id)) return; fac.add(id); T.setFacility(id, true); };

  const resync = () => {
    synced = true;
    // 실시간 처리와 같게 — 개발 단계 dev:<섬>:1..5 중 하나라도 열렸으면 등대도 켠다
    for (const id of T.lighthouseIds) light(id, isU(`lighthouse:${id}`) || [1, 2, 3, 4, 5].some((n) => isU(`dev:${id}:${n}`)));
    setTower(partCount());
    house = houseStageFromUnlocks(isU);
    T.setHouseStage(house);
    const all = cheat();
    for (const id of FACILITY_IDS) {
      const on = all || facilityUnlocked(id, isU);
      if (on) fac.add(id); else fac.delete(id);
      T.setFacility(id, on);
    }
  };

  game.onUpdate(() => { if (!synced && game.econ) resync(); });
  game.state.on((e) => {
    if (e.type === 'unlock' && typeof e.key === 'string') {
      const key = e.key;
      if (key.startsWith('lighthouse:')) light(key.slice(11), true);
      else if (key.startsWith('rocket:part:')) setTower(Math.max(partCount(), tower + (game.econ ? 0 : 1)));
      else if (key.startsWith('facility:')) for (const id of facilityIdsFor(key.slice(9))) facOn(id);
      else if (key.startsWith('dev:')) {
        const [, isl, n] = key.split(':');
        const st = Number(n);
        if (st >= 1) light(isl, true);
        if (st >= 3) for (const id of facilitiesOfIsland(isl)) facOn(id);
      } else {
        const h = houseKeyStage(key);
        if (h !== null) setHouse(h);
      }
    } else if (e.type === 'lighthouse' && typeof e.island === 'string') {
      light(e.island, e.lit !== false);
    } else if (e.type === 'dev-stage' && typeof e.island === 'string') {
      const st = Number(e.stage);
      if (st >= 1) light(e.island, true);
      if (st >= 3) for (const id of facilitiesOfIsland(e.island)) facOn(id);
    }
  });
  return {
    resync,
    get synced() { return synced; },
    snapshot: () => ({ house, tower, facilities: [...fac], lights: { ...lights } }),
  };
}

// ───────── 노점(짓기 전) ─────────
export function buildStall(name: string, color: string): Built {
  const g = new THREE.Group();
  add(g, rbox(3.0, 0.12, 2.2, 0.05, 3), 'wood', ['#b9834f', '#d6a571'], 0, 0.06, -0.5);
  const front = rbox(2.2, 0.9, 0.6, 0.12, 4);
  stripesY(front, [color, '#ffffff'], 0.22, 0);
  add(g, front, 'paint', null, 0, 0.57, 0);
  add(g, rbox(2.4, 0.1, 0.8, 0.05, 3), 'wood', ['#c8955f', '#e3b27c'], 0, 1.07, 0);
  for (const sx of [-1, 1]) add(g, cap(0.06, 2.1), 'wood', WOOD_DARK, sx * 1.25, 1.12, -0.35);
  const aw = new THREE.Group(), n = 5, AW = 2.9;
  for (let i = 0; i < n; i++) {
    const c = i % 2 ? '#ffffff' : color, sw = AW / n, x = -AW / 2 + sw * (i + 0.5);
    add(aw, rbox(sw + 0.01, 0.06, 1.0, 0.03, 3), 'cloth', c, x, 0, 0.5);
    add(aw, sph(sw / 2, 14, 8), 'cloth', c, x, -0.02, 1.0, undefined, [1, 0.5, 0.32]);
  }
  aw.position.set(0, 2.18, -0.5);
  aw.rotation.x = 0.3;
  g.add(aw);
  // 상자 두 개 + 작은 화분
  add(g, rbox(0.5, 0.45, 0.5, 0.07, 3), 'wood', ['#b9834f', '#d6a571'], 1.55, 0.23, -0.9);
  add(g, rbox(0.4, 0.36, 0.4, 0.06, 3), 'wood', ['#b9834f', '#d6a571'], 1.55, 0.64, -0.9, [0, 0.4, 0]);
  add(g, cyl(0.16, 0.2, 0.28, 16), 'paint', ['#d0704e', '#e98c63'], -1.55, 0.14, -0.3);
  add(g, sph(0.22, 16, 12), 'matte', '#6cc46a', -1.55, 0.4, -0.3, undefined, [1, 0.8, 1]);
  // 간판
  add(g, roundExtrude(roundRectShape(2.2, 0.5, 0.22), 0.08, 0.03), 'paint', '#fff7e2', 0, 2.75, -0.5);
  const lb = label(name, 2.0, 0.42, { fg: '#6a4a2a' });
  lb.position.set(0, 2.75, -0.42);
  g.add(lb);
  return { g, foot: 1.8, front: 0.6, cols: [{ kind: 'box', hx: 1.15, hy: 0.55, hz: 0.35, x: 0, y: 0.55, z: 0 }] };
}

/** 시설 간판(둥근 판 + 글씨) */
function sign(g: THREE.Group, text: string, x: number, y: number, z: number, w: number, fg = '#5a3a22', bg = '#fff7e2', ry = 0) {
  const s = new THREE.Group();
  add(s, roundExtrude(roundRectShape(w, 0.62, 0.26), 0.1, 0.035), 'paint', bg, 0, 0, 0);
  add(s, roundExtrude(roundRectShape(w + 0.18, 0.78, 0.33), 0.06, 0.025), 'wood', ['#b9834f', '#cf9a63'], 0, 0, -0.05);
  const lb = label(text, w - 0.15, 0.5, { fg });
  lb.position.set(0, 0, 0.08);
  s.add(lb);
  s.position.set(x, y, z);
  s.rotation.y = ry;
  g.add(s);
}

/** 둥근 윗변 문 */
function archDoor(g: THREE.Group, x: number, y: number, z: number, w: number, h: number, color: string) {
  const r = w / 2, hs = h - r;
  const ds = new THREE.Shape();
  ds.moveTo(-r, 0); ds.lineTo(r, 0); ds.lineTo(r, hs); ds.absarc(0, hs, r, 0, Math.PI, false); ds.lineTo(-r, 0);
  add(g, roundExtrude(ds, 0.08, 0.03, 28), 'matte', '#fffaf0', x, y, z + 0.01, undefined, [1.15, 1.08, 1]);
  add(g, roundExtrude(ds, 0.1, 0.035, 28), 'wood', [new THREE.Color(color).multiplyScalar(0.85), color], x, y + 0.01, z + 0.05);
  add(g, sph(0.045, 14, 10), 'gold', null, x + r * 0.6, y + h * 0.45, z + 0.12);
}

/** 둥근 창(테 + 유리) */
function porthole(g: THREE.Group, x: number, y: number, z: number, r: number, ry = 0, rim = '#ffffff') {
  const w = new THREE.Group();
  add(w, new THREE.TorusGeometry(r, r * 0.22, 12, 30), 'gloss', rim, 0, 0, 0.02);
  add(w, cyl(r * 0.95, r * 0.95, 0.05, 28).rotateX(Math.PI / 2), 'window', null, 0, 0, 0);
  w.position.set(x, y, z);
  w.rotation.y = ry;
  g.add(w);
}

function bush(g: THREE.Group, x: number, z: number, k: number, c: string) {
  add(g, sph(0.34 * k, 18, 12), 'matte', '#6cc46a', x, 0.26 * k, z, undefined, [1, 0.78, 1]);
  for (let i = 0; i < 4; i++) add(g, sph(0.07, 10, 8), 'matte', c, x + Math.cos(i * 1.7) * 0.24 * k, 0.36 * k, z + Math.sin(i * 1.7) * 0.24 * k);
}

// ───────── ① 꿀벌 농장 + 꽃시장(말랑섬) ─────────
function apiary(): Built {
  const g = new THREE.Group();
  const cols: Col[] = [];
  add(g, cyl(5.2, 5.2, 0.08, 40), 'matte', '#a8d88a', 0, 0.04, -1.2, undefined, [1, 1, 0.8]);
  // 꽃시장 노점(가운데 앞): 양동이에 꽃 다발
  const front = rbox(3.0, 0.8, 0.7, 0.14, 4);
  stripesY(front, ['#ffbe2a', '#ffffff'], 0.2, 0);
  add(g, front, 'paint', null, 0, 0.48, 0);
  add(g, rbox(3.2, 0.1, 0.9, 0.05, 3), 'wood', ['#c8955f', '#e3b27c'], 0, 0.92, 0);
  const fc = ['#ff8fb1', '#ffd34f', '#ffffff', '#b48cf0', '#ff6f61'];
  for (let i = 0; i < 5; i++) {
    const x = -1.2 + i * 0.6;
    add(g, cyl(0.17, 0.13, 0.3, 16), 'gloss', ['#8fc4e8', '#bfe0f5'], x, 1.12, 0);
    for (let k = 0; k < 5; k++) { const a = k * 1.26; add(g, sph(0.08, 12, 8), 'matte', fc[(i + k) % 5], x + Math.cos(a) * 0.08 * (k ? 1 : 0), 1.38 + (k ? 0 : 0.06), Math.sin(a) * 0.08 * (k ? 1 : 0)); }
  }
  for (const sx of [-1, 1]) add(g, cap(0.07, 2.3), 'wood', WOOD_DARK, sx * 1.6, 1.2, -0.4);
  const aw = new THREE.Group();
  for (let i = 0; i < 6; i++) { const c = i % 2 ? '#ffffff' : '#ffbe2a', sw = 3.6 / 6, x = -1.8 + sw * (i + 0.5); add(aw, rbox(sw + 0.01, 0.06, 1.1, 0.03, 3), 'cloth', c, x, 0, 0.55); add(aw, sph(sw / 2, 16, 10), 'cloth', c, x, -0.02, 1.1, undefined, [1, 0.5, 0.32]); }
  aw.position.set(0, 2.4, -0.55);
  aw.rotation.x = 0.3;
  g.add(aw);
  sign(g, '꿀벌 농장', 0, 3.05, -0.55, 2.4, '#b8741a');
  cols.push({ kind: 'box', hx: 1.5, hy: 0.5, hz: 0.4, x: 0, y: 0.5, z: 0 });
  // 벌통 셋(왼쪽 뒤): 노랑·흰 줄 상자 + 작은 지붕 + 입구
  for (let i = 0; i < 3; i++) {
    const x = -3.3 + i * 1.25, z = -2.6 + (i % 2) * 0.4;
    for (let k = 0; k < 3; k++) add(g, rbox(0.9, 0.36, 0.75, 0.08, 4), 'paint', k % 2 ? '#fff6dc' : '#ffcf4a', x, 0.3 + k * 0.37, z);
    add(g, rbox(1.05, 0.12, 0.9, 0.05, 3), 'paint', '#e8964a', x, 1.42, z);
    add(g, rbox(0.4, 0.06, 0.04, 0.02, 2), 'matte', '#5a3a22', x, 0.22, z + 0.38);
    add(g, rbox(0.8, 0.12, 0.7, 0.04, 2), 'wood', WOOD_DARK, x, 0.06, z);
    cols.push({ kind: 'box', hx: 0.48, hy: 0.75, hz: 0.42, x, y: 0.75, z });
  }
  // 커다란 꿀단지 표지(오른쪽)
  add(g, sph(0.75, 28, 20), 'gloss', ['#e8961a', '#ffc04a'], 3.0, 0.8, -1.4, undefined, [1, 0.9, 1]);
  add(g, cyl(0.42, 0.48, 0.25, 24), 'gloss', '#ffd36a', 3.0, 1.5, -1.4);
  add(g, cyl(0.5, 0.5, 0.12, 24), 'cloth', '#ff8f8f', 3.0, 1.63, -1.4);
  for (let k = 0; k < 4; k++) add(g, sph(0.1, 12, 10), 'gloss', '#ffb21a', 3.0 + Math.cos(k * 1.6) * 0.45, 1.35 - k * 0.12, -1.4 + Math.sin(k * 1.6) * 0.45 + 0.2, undefined, [0.8, 1.4, 0.8]);
  cols.push({ kind: 'cyl', r: 0.75, hh: 0.85, x: 3.0, y: 0.85, z: -1.4 });
  // 꽃밭(뒤 둘레)
  for (let i = 0; i < 9; i++) { const a = Math.PI + 0.25 + (i / 8) * (Math.PI - 0.5); bush(g, Math.cos(a) * 4.3, -1.2 + Math.sin(a) * 3.4, 0.9, fc[i % 5]); }
  // 꿀벌(살아 있는 조각 — 벌통 위를 빙빙). 다섯 마리를 메시 하나로 합치고 통째로 돌린다
  const bees = new THREE.Group();
  bees.position.set(-2.1, 1.9, -2.4);
  bees.userData.live = true;
  const swarm = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group();
    const a = (i / 5) * Math.PI * 2;
    b.position.set(Math.cos(a) * 1.1, Math.sin(a * 2) * 0.2, Math.sin(a) * 0.8);
    b.rotation.y = -a;
    const bd = sph(0.08, 12, 10);
    stripesY(bd, ['#ffcf3a', '#4a3b2a'], 0.04, -0.08);
    add(b, bd, 'matte', null, 0, 0, 0, undefined, [1, 1, 1.3]);
    for (const sx of [-1, 1]) add(b, sph(0.06, 10, 8), 'matte', '#ffffff', sx * 0.06, 0.07, 0, undefined, [1, 0.3, 1.3]);
    swarm.add(b);
  }
  bees.add(compactLive(swarm));
  g.add(bees);
  return {
    g, cols, foot: 5, front: 0.9,
    anim: [{ o: bees, fn: (o, b, t) => { o.quaternion.copy(b).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * 0.9)); swarm.position.y = Math.sin(t * 2.3) * 0.15; } }],
  };
}

// ───────── ② 뽀글 다이빙 센터(산호빛섬) ─────────
function divingCenter(): Built {
  const g = new THREE.Group();
  const W = 4.6, D = 3.6, H = 2.4;
  add(g, rbox(W + 1.6, 0.18, D + 2.4, 0.07, 3), 'wood', ['#b9834f', '#d6a571'], 0, 0.09, 0.5);
  add(g, rbox(W, H, D, 0.4, 6), 'matte', ['#5fd0c5', '#a8f0e6'], 0, 0.18 + H / 2, 0);
  add(g, rbox(W + 0.1, 0.32, D + 0.1, 0.14, 4), 'paint', '#ffffff', 0, 0.18 + 0.16, 0);
  // 둥근 지붕(납작 돔) + 커다란 잠수 헬멧
  add(g, dome(W * 0.62, 40, 14), 'gloss', ['#3a9fd8', '#7cc8f5'], 0, 0.18 + H - 0.05, 0, undefined, [1, 0.45, D / W * 1.05]);
  const hy = 0.18 + H + 1.75;
  add(g, sph(0.9, 32, 24), 'gold', null, 0, hy, 0);
  add(g, cyl(0.5, 0.5, 0.12, 28).rotateX(Math.PI / 2), 'window', null, 0, hy, 0.86);
  add(g, new THREE.TorusGeometry(0.5, 0.09, 12, 30), 'gold', null, 0, hy, 0.88);
  for (const sx of [-1, 1]) { add(g, cyl(0.28, 0.28, 0.1, 22).rotateZ(Math.PI / 2), 'window', null, sx * 0.86, hy, 0); add(g, new THREE.TorusGeometry(0.28, 0.06, 10, 24), 'gold', null, sx * 0.88, hy, 0, [0, Math.PI / 2, 0]); }
  add(g, cyl(0.7, 0.85, 0.5, 28), 'gold', null, 0, hy - 0.95, 0);
  archDoor(g, 0, 0.18, D / 2, 1.0, 1.75, '#2f8fb8');
  for (const sx of [-1, 1]) porthole(g, sx * 1.45, 1.45, D / 2 + 0.02, 0.34);
  for (const sx of [-1, 1]) porthole(g, sx * (W / 2 + 0.02), 1.45, 0, 0.32, sx * Math.PI / 2);
  sign(g, '뽀글 다이빙', 0, 2.3, D / 2 + 0.14, 2.2, '#1f6f9a');
  // 서핑보드 세 장(옆에 기대어)
  const boards: Array<[string, string]> = [['#ff8f8f', '#ffffff'], ['#ffd34f', '#ff9f5a'], ['#7ed38d', '#ffffff']];
  boards.forEach((c, i) => {
    const b = rbox(0.55, 2.1, 0.1, 0.27, 6);
    stripesY(b, c, 0.5, -1.05);
    add(g, b, 'gloss', null, W / 2 + 0.45, 1.1, -0.9 + i * 0.75, [0, 0, -0.18]);
  });
  // 산소통 + 구명 튜브 + 오리발
  for (let i = 0; i < 3; i++) { add(g, cap(0.18, 0.7, 16), 'gloss', '#ffcf3a', -W / 2 - 0.4, 0.58, 0.9 - i * 0.45); add(g, cyl(0.07, 0.07, 0.15, 10), 'gloss', '#8c98a8', -W / 2 - 0.4, 1.12, 0.9 - i * 0.45); }
  const ring = new THREE.TorusGeometry(0.34, 0.11, 14, 30);
  stripesA(ring, ['#ff5e57', '#ffffff'], 8);
  add(g, ring, 'gloss', null, 1.45, 0.8, D / 2 + 0.12);
  for (const sx of [-1, 1]) add(g, rbox(0.28, 0.05, 0.6, 0.06, 3), 'gloss', '#ff7a8a', -1.3 + sx * 0.18, 0.21, D / 2 + 1.3, [0, sx * 0.2, 0]);
  return { g, foot: 3.6, front: D / 2 + 0.9, cols: [{ kind: 'box', hx: W / 2 + 0.1, hy: 1.6, hz: D / 2 + 0.1, x: 0, y: 1.6, z: 0 }] };
}

// ───────── ③ 반딧불 정원(버섯섬) ─────────
function fireflyGarden(rng: () => number): Built {
  const g = new THREE.Group();
  const cols: Col[] = [];
  const R = 5.2;
  add(g, cyl(R, R, 0.08, 48), 'matte', '#7fc98a', 0, 0.04, -R + 0.6);
  // 둘레 울타리 덤불(앞은 열려 있다)
  const cz = -R + 0.6;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.42) continue;
    const x = Math.cos(a) * R, z = cz + Math.sin(a) * R;
    add(g, blob(0.75, 0.75, 0.15, i, 3), 'matte', ['#4f9a5a', '#7cc97a'], x, 0.55, z);
    cols.push({ kind: 'cyl', r: 0.7, hh: 0.6, x, y: 0.6, z });
  }
  // 잎 아치 문(+z 앞)
  for (const sx of [-1, 1]) add(g, cap(0.12, 2.2), 'wood', WOOD_DARK, sx * 1.2, 1.2, 0.6);
  add(g, new THREE.TorusGeometry(1.2, 0.13, 12, 32, Math.PI), 'wood', WOOD, 0, 2.3, 0.6);
  for (let i = 0; i < 11; i++) { const a = (i / 10) * Math.PI; add(g, sph(0.2, 12, 10), 'matte', i % 3 ? '#6cc46a' : '#ffd6f0', Math.cos(a) * 1.2, 2.3 + Math.sin(a) * 1.2, 0.6, undefined, [1, 0.8, 1]); }
  sign(g, '반딧불 정원', 0, 3.1, 0.65, 2.3, '#3e7a3a', '#f4ffe8');
  // 등불 기둥 6(밤에 켜짐) + 반딧불 병
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i / 5) * Math.PI, r = R - 1.6;
    const x = Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.9;
    add(g, cap(0.05, 1.3), 'wood', WOOD_DARK, x, 0.7, z);
    add(g, sph(0.17, 16, 12), 'lampGlow', null, x, 1.48, z);
    add(g, dome(0.19, 14, 8), 'gloss', '#3f5a52', x, 1.58, z, undefined, [1, 0.6, 1]);
  }
  // 연못(가운데) + 연잎
  add(g, cyl(1.6, 1.6, 0.06, 36), 'gloss', ['#4aa8d8', '#7cc8f0'], 0, 0.1, cz + 0.4);
  add(g, new THREE.TorusGeometry(1.62, 0.16, 10, 36), 'stone', ['#a9a094', '#cfc7b9'], 0, 0.1, cz + 0.4, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) { const a = rng() * Math.PI * 2, r = 0.4 + rng() * 0.8; add(g, cyl(0.22, 0.22, 0.03, 16), 'matte', '#6cc46a', Math.cos(a) * r, 0.15, cz + 0.4 + Math.sin(a) * r); }
  cols.push({ kind: 'cyl', r: 1.7, hh: 0.2, x: 0, y: 0.1, z: cz + 0.4 });
  // 벤치 + 반딧불 병(발광)
  add(g, rbox(1.6, 0.1, 0.45, 0.04, 3), 'wood', ['#b9834f', '#d6a571'], 2.4, 0.45, cz - 1.8, [0, -0.6, 0]);
  for (const sx of [-1, 1]) add(g, rbox(0.1, 0.42, 0.4, 0.03, 2), 'wood', WOOD_DARK, 2.4 + sx * 0.6 * Math.cos(0.6), 0.22, cz - 1.8 + sx * 0.6 * Math.sin(0.6), [0, -0.6, 0]);
  for (let i = 0; i < 3; i++) { add(g, cyl(0.11, 0.11, 0.24, 14), 'ice', '#e8fff0', 2.1 + i * 0.3, 0.62, cz - 1.6 - i * 0.2); add(g, sph(0.06, 10, 8), 'glow', null, 2.1 + i * 0.3, 0.62, cz - 1.6 - i * 0.2); }
  return { g, cols, foot: R, front: 1.4 };
}

// ───────── ④ 화석 연구소 + 부화장(공룡섬) ─────────
function fossilLab(): Built {
  const g = new THREE.Group();
  const W = 5.2, D = 4.2, H = 2.6;
  add(g, rbox(W + 0.6, 0.3, D + 0.6, 0.12, 4), 'stone', ['#bfb5a6', '#ddd5c6'], 0, 0.15, 0);
  add(g, rbox(W, H, D, 0.3, 6), 'matte', ['#f2e2c4', '#fff6e4'], 0, 0.3 + H / 2, 0);
  add(g, rbox(W + 0.2, 0.28, D + 0.2, 0.12, 4), 'paint', '#7cc96b', 0, 0.3 + H, 0);
  add(g, dome(2.3, 40, 16), 'gloss', ['#5aa84a', '#9be08a'], 0, 0.3 + H + 0.1, -0.2, undefined, [1, 0.75, 0.9]);
  // 지붕 위 큰 뼈다귀
  const by = 0.3 + H + 2.0;
  add(g, cap(0.18, 2.0).rotateZ(Math.PI / 2), 'matte', BONE, 0, by, 0.2);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) add(g, sph(0.27, 18, 14), 'matte', BONE, sx * 1.15, by + sy * 0.2, 0.2);
  archDoor(g, 0, 0.3, D / 2, 1.0, 1.8, '#7d4f33');
  for (const sx of [-1, 1]) porthole(g, sx * 1.6, 1.6, D / 2 + 0.02, 0.38, 0, '#7cc96b');
  sign(g, '화석 연구소', 0, 0.3 + H + 0.05, D / 2 + 0.22, 2.4, '#3e7a3a');
  // 부화장(오른쪽): 지푸라기 둥지 + 점박이 알 셋 + 따뜻한 등
  const hx = W / 2 + 2.0, hz = 0.6;
  add(g, cyl(1.3, 1.4, 0.35, 32), 'wood', ['#b9834f', '#d6a571'], hx, 0.18, hz);
  add(g, new THREE.TorusGeometry(0.95, 0.3, 12, 32), 'matte', ['#e8c870', '#f5dc90'], hx, 0.5, hz, [Math.PI / 2, 0, 0]);
  const eggC = ['#fff3d6', '#d6f0ff', '#ffe0ec'];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3, x = hx + Math.cos(a) * 0.38, z = hz + Math.sin(a) * 0.38;
    add(g, sph(0.3, 20, 16), 'gloss', eggC[i], x, 0.72, z, undefined, [0.85, 1.15, 0.85]);
    for (let k = 0; k < 4; k++) add(g, sph(0.06, 10, 8), 'matte', '#8fd08a', x + Math.cos(k * 1.9) * 0.24, 0.72 + (k - 1.5) * 0.12, z + Math.sin(k * 1.9) * 0.24);
  }
  add(g, cap(0.05, 2.2), 'gloss', '#5a6f6a', hx + 1.25, 1.2, hz - 0.9);
  add(g, cap(0.04, 0.8).rotateZ(Math.PI / 2), 'gloss', '#5a6f6a', hx + 0.85, 2.35, hz - 0.9);
  add(g, dome(0.32, 18, 8), 'paint', '#ff8f5e', hx + 0.45, 2.25, hz - 0.9, [Math.PI, 0, 0]);
  add(g, sph(0.15, 14, 10), 'lampGlow', null, hx + 0.45, 2.12, hz - 0.9);
  // 발굴 도구(삽·솔)
  add(g, cap(0.04, 1.2), 'wood', WOOD, -W / 2 - 0.5, 0.75, 0.9, [0, 0, 0.15]);
  add(g, rbox(0.3, 0.36, 0.05, 0.08, 3), 'gloss', '#8c98a8', -W / 2 - 0.42, 0.2, 0.9, [0, 0, 0.15]);
  return {
    g, foot: 4.4, front: D / 2 + 0.9,
    cols: [{ kind: 'box', hx: W / 2 + 0.2, hy: 1.8, hz: D / 2 + 0.2, x: 0, y: 1.8, z: 0 }, { kind: 'cyl', r: 1.35, hh: 0.4, x: hx, y: 0.4, z: hz }],
  };
}

// ───────── ⑤ 얼음낚시 오두막(솜눈섬) ─────────
function iceHut(): Built {
  const g = new THREE.Group();
  const W = 3.4, D = 3.0, H = 2.0;
  add(g, rbox(W + 0.4, 0.2, D + 0.4, 0.08, 3), 'wood', ['#a77650', '#c08c5c'], 0, 0.1, 0);
  // 빨간 판자 벽(세로 판)
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + (W / 8) * i;
    add(g, rbox(W / 8 + 0.02, H, 0.14, 0.05, 3), 'paint', i % 2 ? '#e8564a' : '#ff6f61', x, 0.2 + H / 2, D / 2 - 0.07);
  }
  add(g, rbox(W, H, D - 0.1, 0.12, 4), 'paint', ['#d94c40', '#f06a5e'], 0, 0.2 + H / 2, -0.06);
  // 눈 덮인 지붕(통통한 눈 이불)
  for (const s of [-1, 1]) add(g, rbox(W + 0.8, 0.2, D * 0.66, 0.09, 5), 'wood', ['#7d5236', '#a8754b'], 0, 0.2 + H + 0.55, s * D * 0.3, [s * 0.6, 0, 0]);
  add(g, blob(1.0, 0.35, 0.12, 7, 4), 'matte', '#ffffff', 0, 0.2 + H + 1.0, 0, undefined, [2.4, 1, 1.5]);
  for (const s of [-1, 1]) add(g, cap(0.2, W + 0.4).rotateZ(Math.PI / 2), 'matte', '#ffffff', 0, 0.2 + H + 0.1, s * (D / 2 + 0.38));
  // 굴뚝 + 김(흰 공)
  add(g, rbox(0.38, 0.8, 0.38, 0.08, 3), 'stone', ['#a98f7c', '#c9b3a0'], 1.0, 0.2 + H + 1.1, -0.5);
  for (let i = 0; i < 3; i++) add(g, sph(0.2 + i * 0.07, 12, 10), 'matte', '#f4f8ff', 1.0 + i * 0.15, 0.2 + H + 1.75 + i * 0.4, -0.5 - i * 0.1);
  archDoor(g, 0, 0.2, D / 2, 0.8, 1.45, '#7d4f33');
  for (const sx of [-1, 1]) { add(g, rbox(0.62, 0.55, 0.08, 0.1, 3), 'matte', '#ffffff', sx * 1.05, 1.25, D / 2 + 0.03); add(g, rbox(0.5, 0.44, 0.06, 0.08, 3), 'window', null, sx * 1.05, 1.25, D / 2 + 0.06); }
  sign(g, '얼음낚시', 0, 1.98, D / 2 + 0.12, 1.5, '#2a5a9a', '#f0f8ff');
  // 얼음 구멍(앞) + 낚싯대 받침 + 물고기 표지
  const fz = D / 2 + 2.2;
  add(g, cyl(0.75, 0.75, 0.05, 28), 'gloss', ['#1f5f9a', '#3a8ad0'], -1.4, 0.04, fz);
  add(g, new THREE.TorusGeometry(0.8, 0.14, 10, 30), 'ice', '#dff2ff', -1.4, 0.06, fz, [Math.PI / 2, 0, 0]);
  add(g, rbox(0.1, 0.5, 0.1, 0.03, 2), 'wood', WOOD_DARK, -0.6, 0.25, fz);
  add(g, cap(0.025, 1.6), 'wood', WOOD, -0.95, 0.75, fz, [0, 0, 0.8]);
  const fish = new THREE.Group();
  add(fish, sph(0.26, 18, 12), 'gloss', '#7fb8ff', 0, 0, 0, undefined, [1.4, 0.8, 0.4]);
  add(fish, new THREE.ConeGeometry(0.18, 0.3, 12).rotateZ(Math.PI / 2), 'gloss', '#5aa0f0', -0.45, 0, 0);
  add(fish, sph(0.04, 8, 6), 'matte', '#3d3a4a', 0.2, 0.06, 0.1);
  fish.position.set(1.4, 1.0, fz - 0.4);
  g.add(fish);
  add(g, cap(0.04, 0.9), 'wood', WOOD_DARK, 1.4, 0.45, fz - 0.45);
  return { g, foot: 2.6, front: D / 2 + 0.8, cols: [{ kind: 'box', hx: W / 2 + 0.1, hy: 1.4, hz: D / 2 + 0.1, x: 0, y: 1.4, z: 0 }] };
}

// ───────── ⑥ 오아시스 바자르(모래시계섬) ─────────
function bazaar(): Built {
  const g = new THREE.Group();
  const R = 3.0, H = 2.2;
  add(g, cyl(R + 1.2, R + 1.2, 0.06, 40), 'cloth', '#e8a060', 0, 0.03, 0);
  // 천막 몸통(줄무늬 원통) + 양파 지붕
  const wall = new THREE.CylinderGeometry(R, R, H, 40, 6, true);
  stripesA(wall, ['#ff8f5e', '#fff1dc', '#ffcf4a', '#fff1dc'], 16, 0.12);
  add(g, wall, 'cloth', null, 0, H / 2 + 0.05, 0);
  const onion = new THREE.SphereGeometry(R + 0.35, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.62);
  stripesA(onion, ['#e86b4a', '#ffd34f'], 16, 0.2);
  add(g, onion, 'cloth', null, 0, H - 0.5, 0, undefined, [1, 0.9, 1]);
  add(g, cyl(0.12, 0.3, 0.6, 16), 'gold', null, 0, H + 2.7, 0);
  add(g, sph(0.2, 14, 10), 'gold', null, 0, H + 3.1, 0);
  // 앞 입구: 걷어 올린 휘장 + 계산대 + 양탄자
  add(g, rbox(2.0, 1.9, 0.1, 0.4, 5), 'matte', '#7a4a3a', 0, 1.0, R - 0.02);
  for (const sx of [-1, 1]) add(g, cap(0.2, 1.5), 'cloth', '#ffcf4a', sx * 1.1, 1.1, R + 0.1, [0, 0, sx * 0.25]);
  add(g, rbox(2.4, 0.75, 0.65, 0.14, 4), 'wood', ['#a77650', '#c8955f'], 0, 0.42, R + 0.7);
  add(g, rbox(2.6, 0.1, 0.85, 0.05, 3), 'paint', ['#c94338', '#ff7b6b'], 0, 0.84, R + 0.7);
  const rugs: Array<[number, number, string, string, number]> = [[-2.4, 1.8, '#b04a8a', '#ffd34f', 0.4], [2.5, 1.6, '#3a7ab0', '#ff8f5e', -0.3], [0.2, R + 2.2, '#c94338', '#fff1dc', 0.05]];
  for (const [x, z, a, b, r] of rugs) {
    const rug = rbox(1.6, 0.04, 2.2, 0.03, 2);
    stripesY(rug, [a, a], 1, 0);
    add(g, rug, 'cloth', null, x, 0.08, z, [0, r, 0]);
    add(g, rbox(1.2, 0.045, 1.8, 0.03, 2), 'cloth', b, x, 0.09, z, [0, r, 0]);
  }
  // 항아리(회전체) + 방석 + 등불
  const vase = (x: number, z: number, k: number, c: string) => {
    const pts = [[0.02, 0], [0.32, 0.06], [0.42, 0.3], [0.36, 0.58], [0.18, 0.74], [0.2, 0.86], [0.24, 0.9]].map(([r, y]) => new THREE.Vector2(r * k, y * k));
    add(g, new THREE.LatheGeometry(pts, 24), 'gloss', [new THREE.Color(c).multiplyScalar(0.8), c], x, 0, z);
  };
  vase(-1.9, R + 0.9, 1.1, '#e8964a'); vase(-2.4, R + 0.3, 0.8, '#5aaef0'); vase(1.9, R + 1.0, 1.0, '#ff8f8f'); vase(2.5, R + 0.2, 1.25, '#e8c870');
  for (const [x, z, c] of [[-2.3, 1.4, '#ffcf4a'], [2.6, 1.3, '#ff7fa8']] as const) add(g, sph(0.4, 18, 12), 'cloth', c, x, 0.2, z, undefined, [1, 0.45, 1]);
  for (const sx of [-1, 1]) {
    add(g, cap(0.04, 0.5), 'gold', null, sx * 1.4, H + 0.15, R + 0.25);
    add(g, sph(0.17, 16, 12), 'lampGlow', null, sx * 1.4, H - 0.2, R + 0.25, undefined, [1, 1.25, 1]);
  }
  sign(g, '오아시스 바자르', 0, H + 0.4, R + 0.45, 2.7, '#a0441a', '#fff3d6');
  return { g, foot: R + 1.2, front: R + 1.4, cols: [{ kind: 'cyl', r: R, hh: H / 2 + 0.6, x: 0, y: H / 2 + 0.6, z: 0 }, { kind: 'box', hx: 1.2, hy: 0.45, hz: 0.33, x: 0, y: 0.45, z: R + 0.7 }] };
}

// ───────── ⑦ 별빛 천문대(별똥별섬) ─────────
function observatory(): Built {
  const g = new THREE.Group();
  const R = 3.2, H = 3.0;
  add(g, cyl(R + 0.8, R + 1.0, 0.4, 40), 'stone', ['#bfb5a6', '#ddd5c6'], 0, 0.2, 0);
  add(g, cyl(R, R, H, 48), 'matte', ['#e8ecff', '#ffffff'], 0, 0.4 + H / 2, 0);
  add(g, cyl(R + 0.15, R + 0.15, 0.3, 48), 'paint', '#7f8cff', 0, 0.4 + H, 0);
  // 은빛 돔 + 열린 틈 + 망원경
  const dy = 0.4 + H + 0.1;
  add(g, dome(R + 0.05, 48, 20), 'gloss', ['#c8d2e8', '#f4f6ff'], 0, dy, 0);
  add(g, rbox(1.0, 0.25, R + 0.2, 0.1, 3), 'matte', '#2a3060', 0, dy + R * 0.72, R * 0.42, [-0.95, 0, 0]);
  add(g, rbox(1.0, 0.25, R * 0.8, 0.1, 3), 'matte', '#2a3060', 0, dy + R * 0.96, -0.05, [-0.08, 0, 0]);
  const tel = new THREE.Group();
  add(tel, cyl(0.42, 0.34, 3.0, 24), 'gloss', ['#3a4a9a', '#5a6ad0'], 0, 1.5, 0);
  add(tel, new THREE.TorusGeometry(0.43, 0.08, 10, 24), 'gold', null, 0, 3.0, 0, [Math.PI / 2, 0, 0]);
  add(tel, cyl(0.38, 0.38, 0.05, 20), 'window', null, 0, 3.02, 0);
  tel.position.set(0, dy + 1.3, 0.4);
  tel.rotation.x = 0.85;
  g.add(tel);
  // 별 장식(벽) + 문 + 둥근 창
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    add(g, new THREE.OctahedronGeometry(0.2, 0), 'gold', null, Math.sin(a) * (R + 0.04), 2.6 + (i % 2) * 0.5, Math.cos(a) * (R + 0.04), [0, a, Math.PI / 4], [1, 1.3, 0.4]);
  }
  archDoor(g, 0, 0.4, R - 0.05, 1.0, 1.8, '#3a4a9a');
  for (const a of [-0.9, 0.9]) porthole(g, Math.sin(a) * (R + 0.01), 2.0, Math.cos(a) * (R + 0.01), 0.36, a, '#7f8cff');
  sign(g, '별빛 천문대', 0, 0.4 + H - 0.4, R + 0.45, 2.5, '#3a3a9a', '#f4f4ff');
  // 계단
  for (let i = 0; i < 2; i++) add(g, rbox(1.6, 0.2, 0.45, 0.06, 3), 'stone', ['#cfc6b8', '#efe9de'], 0, 0.1 + i * 0.2, R + 0.9 - i * 0.4);
  return { g, foot: R + 1.0, front: R + 1.3, cols: [{ kind: 'cyl', r: R + 0.1, hh: (H + R) / 2 + 0.3, x: 0, y: (H + R) / 2 + 0.3, z: 0 }] };
}

// ───────── ⑧ 보글 물약 가게(버섯섬) — 버섯 집 + 가마솥 ─────────
function potionShop(): Built & { pot: THREE.Object3D } {
  const g = new THREE.Group();
  const R = 1.9, H = 2.6;
  add(g, cyl(R, R + 0.15, H, 40), 'matte', ['#f2e4cc', '#fff8ea'], 0, H / 2, 0);
  const capG = new THREE.SphereGeometry(R + 1.5, 44, 22, 0, Math.PI * 2, 0, Math.PI * 0.55);
  add(g, capG, 'gloss', ['#e8455a', '#ff7a8a'], 0, H - 0.4, 0, undefined, [1, 0.72, 1]);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, el = 0.35 + (i % 3) * 0.28;
    const r = (R + 1.5) * Math.sin(el + 0.3), y = H - 0.4 + (R + 1.5) * 0.72 * Math.cos(el + 0.3);
    add(g, sph(0.32 - (i % 3) * 0.06, 16, 10), 'matte', '#ffffff', Math.cos(a) * r, y, Math.sin(a) * r, undefined, [1, 0.45, 1]);
  }
  archDoor(g, 0, 0.02, R + 0.08, 0.9, 1.6, '#8a4aa8');
  for (const a of [-0.85, 0.85]) porthole(g, Math.sin(a) * (R + 0.06), 1.5, Math.cos(a) * (R + 0.06), 0.3, a, '#c58cff');
  // 간판(버섯 갓 아래로 숨지 않게 문 옆 기둥에)
  add(g, cap(0.06, 1.7, 10), 'wood', WOOD_DARK, -1.75, 0.85, R + 1.15);
  sign(g, '보글 물약 가게', -1.75, 1.75, R + 1.22, 2.2, '#6a2a8a', '#fbf0ff', 0.35);
  // 선반 + 물약병
  add(g, rbox(1.8, 0.08, 0.36, 0.03, 2), 'wood', ['#b9834f', '#d6a571'], -R - 0.9, 0.95, 0.9, [0, 0.5, 0]);
  add(g, rbox(1.8, 0.08, 0.36, 0.03, 2), 'wood', ['#b9834f', '#d6a571'], -R - 0.9, 0.45, 0.9, [0, 0.5, 0]);
  const pc = ['#ff6f8f', '#7ed38d', '#5aaef0', '#ffd34f', '#c58cff', '#ff9f5a'];
  for (let i = 0; i < 6; i++) {
    const t = (i % 3) - 1, y = i < 3 ? 1.14 : 0.64;
    const x = -R - 0.9 + t * 0.5 * Math.cos(0.5), z = 0.9 - t * 0.5 * Math.sin(0.5);
    add(g, sph(0.13, 14, 10), 'gloss', pc[i], x, y, z);
    add(g, cyl(0.04, 0.05, 0.12, 8), 'ice', '#eef', x, y + 0.16, z);
    add(g, sph(0.045, 8, 6), 'wood', WOOD, x, y + 0.24, z);
  }
  // 가마솥(앞 오른쪽) + 장작 + 보글보글 거품(살아 있는 조각)
  const cx = 1.9, cz = R + 1.2;
  const bowl = new THREE.SphereGeometry(0.62, 28, 16, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65);
  add(g, bowl, 'gloss', '#3f3a4a', cx, 0.7, cz);
  add(g, new THREE.TorusGeometry(0.52, 0.07, 10, 28), 'gloss', '#5a5468', cx, 0.98, cz, [Math.PI / 2, 0, 0]);
  add(g, cyl(0.5, 0.5, 0.04, 26), 'gloss', '#8ae86a', cx, 0.96, cz);
  for (let i = 0; i < 3; i++) add(g, cap(0.05, 0.5).rotateZ(Math.PI / 2), 'wood', '#9a6a43', cx, 0.1, cz, [0, (i / 3) * Math.PI, 0]);
  add(g, sph(0.14, 12, 10), 'glow', null, cx, 0.15, cz);
  const pot = new THREE.Group();
  pot.position.set(cx, 1.0, cz);
  pot.userData.live = true;
  for (let i = 0; i < 4; i++) add(pot, sph(0.08 + (i % 2) * 0.04, 12, 10), 'gloss', i % 2 ? '#c8ffb0' : '#a8f08a', Math.cos(i * 1.6) * 0.22, 0.05 * i, Math.sin(i * 1.6) * 0.22);
  g.add(pot);
  return {
    g, pot, foot: R + 1.6, front: R + 1.1,
    cols: [{ kind: 'cyl', r: R + 0.15, hh: H / 2 + 0.6, x: 0, y: H / 2 + 0.6, z: 0 }, { kind: 'cyl', r: 0.62, hh: 0.5, x: cx, y: 0.5, z: cz }],
    anim: [{ o: pot, fn: (o, _b, t) => { o.children.forEach((c, i) => { const k = (t * 0.7 + i * 0.25) % 1; c.position.y = k * 0.45; c.scale.setScalar(1 - k * 0.6); }); } }],
  };
}

// ───────── ⑨ 스키 리프트(솜눈섬): 매표소 + 오르막 철탑 + 움직이는 의자 ─────────
/** hLocal(lx, lz) = 로컬 좌표의 땅 높이(원점 땅 기준). +z 가 오르막 */
export function buildSkiLift(hLocal: (x: number, z: number) => number, maxLen = 72): Built {
  const g = new THREE.Group();
  const cols: Col[] = [];
  // 매표소(작은 오두막 + 바퀴)
  add(g, rbox(2.6, 0.2, 2.2, 0.08, 3), 'wood', ['#a77650', '#c08c5c'], 0, 0.1, -1.4);
  add(g, rbox(2.2, 1.9, 1.8, 0.2, 5), 'paint', ['#e8564a', '#ff7b6b'], 0, 1.15, -1.4);
  add(g, blob(0.9, 0.35, 0.1, 11, 4), 'matte', '#ffffff', 0, 2.25, -1.4, undefined, [1.5, 1, 1.25]);
  add(g, rbox(1.2, 0.6, 0.08, 0.12, 3), 'window', null, 0, 1.4, -0.48);
  add(g, rbox(1.5, 0.1, 0.4, 0.04, 2), 'wood', ['#c8955f', '#e3b27c'], 0, 1.0, -0.3);
  sign(g, '스키 리프트', 0, 2.75, -0.5, 2.1, '#a0302a', '#fff6f0');
  cols.push({ kind: 'box', hx: 1.15, hy: 1.1, hz: 0.95, x: 0, y: 1.1, z: -1.4 });
  // 철탑(오르막 20 m 마다) — 땅이 너무 낮아지면(내리막) 멈춘다
  const towers: THREE.Vector3[] = [];
  const TH = 6.5;
  const baseWheel = V(0, 3.2, 0.6);
  towers.push(baseWheel);
  for (let z = 14; z <= maxLen; z += 19) {
    const h = hLocal(0, z);
    if (towers.length > 1 && h < towers[towers.length - 1].y - TH - 0.5) break;
    const tw = rbox(0.4, TH, 0.4, 0.1, 3);
    stripesY(tw, ['#ffcf3a', '#ff8f5e'], 0.8, 0);
    add(g, tw, 'paint', null, 0, h + TH / 2, z);
    add(g, rbox(2.2, 0.22, 0.3, 0.08, 3), 'paint', '#3f5a52', 0, h + TH, z);
    for (const sx of [-1, 1]) add(g, cyl(0.18, 0.18, 0.12, 16).rotateZ(Math.PI / 2), 'gloss', '#8c98a8', sx * 0.95, h + TH - 0.15, z);
    add(g, cyl(0.45, 0.55, 0.3, 16), 'stone', ['#a9a094', '#cfc7b9'], 0, h + 0.1, z);
    cols.push({ kind: 'cyl', r: 0.35, hh: TH / 2, x: 0, y: h + TH / 2, z });
    towers.push(V(0, h + TH - 0.2, z));
  }
  // 바퀴(매표소 위)
  add(g, new THREE.TorusGeometry(0.85, 0.1, 10, 28), 'gloss', '#3f5a52', 0, 3.2, 0.6, [Math.PI / 2, 0, 0]);
  add(g, cap(0.1, 1.6), 'gloss', '#3f5a52', 0, 2.4, 0.6);
  // 줄(양쪽 두 가닥)
  for (const sx of [-1, 1]) {
    const pts = towers.map((p) => V(sx * 0.95, p.y, p.z));
    if (pts.length >= 2) add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05), pts.length * 12, 0.035, 6), 'matte', '#4a4a58', 0, 0, 0);
  }
  // 의자(줄을 따라 천천히 — 오른쪽은 오르고 왼쪽은 내려온다)
  // 의자 = 인스턴스 하나(draw call 1)
  const nC = Math.max(2, (towers.length - 1) * 2);
  const path = towers.length >= 2 ? new THREE.CatmullRomCurve3(towers, false, 'catmullrom', 0.05) : null;
  const chairG = new THREE.Group();
  add(chairG, cap(0.025, 1.0, 6), 'paint', '#5a6f6a', 0, -0.5, 0);
  add(chairG, rbox(0.75, 0.1, 0.45, 0.05, 2), 'paint', '#ffffff', 0, -1.05, 0.05);
  add(chairG, rbox(0.75, 0.45, 0.08, 0.05, 2), 'paint', '#ffffff', 0, -0.85, -0.18);
  add(chairG, cap(0.02, 0.6, 6).rotateZ(Math.PI / 2), 'paint', '#5a6f6a', 0, -0.72, 0.28);
  const chairGeo = mergeParts(chairG).get('paint')!;
  const chairs = new THREE.InstancedMesh(chairGeo, undefined, nC * 2);
  chairs.userData.live = true;
  chairs.userData.mk = 'paint';
  chairs.castShadow = true;
  chairs.frustumCulled = false;
  const chairCols = ['#ff7a8a', '#5aaef0', '#ffd34f', '#7ed38d'].map((c) => new THREE.Color(c));
  for (let i = 0; i < nC * 2; i++) chairs.setColorAt(i, chairCols[i % 4]);
  g.add(chairs);
  const tmp = new THREE.Vector3(), mtx = new THREE.Matrix4();
  const place = (t: number) => {
    if (!path) return;
    for (let i = 0; i < nC * 2; i++) {
      const up = i < nC;
      const k = (((t * 0.012 + (i % nC) / nC) % 1) + 1) % 1;
      path.getPointAt(up ? k : 1 - k, tmp);
      mtx.makeTranslation(up ? 0.95 : -0.95, tmp.y - 0.05, tmp.z);
      chairs.setMatrixAt(i, mtx);
    }
    chairs.instanceMatrix.needsUpdate = true;
  };
  place(0);
  return { g, cols, foot: 2, anim: path ? [{ o: chairs, fn: (_o, _b, t) => place(t) }] : [] };
}

export function buildFacility(id: Exclude<FacilityId, 'skiLift'>, rng: () => number): Built {
  switch (id) {
    case 'apiary': return apiary();
    case 'divingCenter': return divingCenter();
    case 'fireflyGarden': return fireflyGarden(rng);
    case 'fossilLab': return fossilLab();
    case 'iceHut': return iceHut();
    case 'bazaar': return bazaar();
    case 'observatory': return observatory();
    case 'potionShop': return potionShop();
  }
}

// ───────── 비눗방울 정류장(등대 옆) ─────────
let BUBBLE_MAT: THREE.MeshPhysicalMaterial | null = null;
/** 큰 비눗방울 재질(공유 — 정류장 7곳이 함께 쓴다) */
export function bubbleMaterial(): THREE.MeshPhysicalMaterial {
  return (BUBBLE_MAT ??= new THREE.MeshPhysicalMaterial({
    color: '#e6f8ff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false,
    iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 620], emissive: '#cfefff', emissiveIntensity: 0.18,
    clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide,
  }));
}
export function buildBubbleStation(): Built & { bubble: THREE.Object3D } {
  const g = new THREE.Group();
  add(g, cyl(1.7, 1.85, 0.3, 40), 'stone', ['#c6bcae', '#e6dfd2'], 0, 0.15, 0);
  add(g, cyl(1.35, 1.35, 0.06, 40), 'paint', ['#bfe6ff', '#e6f6ff'], 0, 0.32, 0);
  // 무지개 아치(뒤) — 7색 고리
  const rb = ['#ff8f8f', '#ffb36b', '#ffe27a', '#9be08a', '#7cc8f5', '#9a9cf0', '#d6a0f0'];
  rb.forEach((c, i) => add(g, new THREE.TorusGeometry(1.75 - i * 0.07, 0.045, 8, 40, Math.PI), 'gloss', c, 0, 0.3, -0.9));
  for (const sx of [-1, 1]) add(g, sph(0.2, 14, 10), 'cloth', '#ffffff', sx * 1.55, 0.35, -0.9, undefined, [1.4, 0.8, 1.2]);
  // 작은 방울 장식(아치 위)
  for (let i = 0; i < 5; i++) { const a = 0.4 + i * 0.58; add(g, sph(0.11 + (i % 2) * 0.05, 14, 10), 'ice', '#e6f8ff', Math.cos(a) * 1.95, 0.3 + Math.sin(a) * 1.95, -0.9); }
  // 표지 기둥
  add(g, cap(0.06, 1.5), 'wood', WOOD_DARK, 1.85, 0.8, 0.9);
  add(g, roundExtrude(roundRectShape(1.5, 0.46, 0.2), 0.07, 0.025), 'paint', '#f0faff', 1.85, 1.6, 0.95);
  const lb = label('비눗방울 정류장', 1.38, 0.36, { fg: '#2a6fa8' });
  lb.position.set(1.85, 1.6, 1.0);
  g.add(lb);
  // 큰 비눗방울(복구된 등대 옆에서만 뜬다) — 살아 있는 조각, 자기 재질
  const bubble = new THREE.Group();
  bubble.userData.live = true;
  bubble.position.set(0, 1.55, 0);
  const float = new THREE.Group(); // bake 뒤 bubble 은 월드 변환을 갖는다 → 흔들림은 안쪽 조각에
  bubble.add(float);
  const bm = new THREE.Mesh(new THREE.SphereGeometry(1.05, 40, 28), bubbleMaterial());
  bm.renderOrder = 3;
  float.add(bm);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }));
  shine.position.set(-0.45, 0.5, 0.65);
  shine.scale.set(1, 0.6, 0.5);
  float.add(shine);
  bubble.visible = false;
  g.add(bubble);
  return {
    g, bubble, foot: 1.9,
    cols: [{ kind: 'cyl', r: 1.8, hh: 0.17, x: 0, y: 0.17, z: 0 }],
    anim: [{ o: float, fn: (o, _b, t) => { o.position.y = Math.sin(t * 1.3) * 0.12; o.rotation.y = t * 0.3; const s = 1 + Math.sin(t * 2.1) * 0.025; o.scale.set(s, 1 / s, s); } }],
  };
}

export { WOOD };
