// 계약 v2 공용 타입·상수(docs/CONTRACT2.md 1·2·6장). 런타임 없이 타입과 순수 도우미만 — 누구나 import 해도 된다.
// 서비스 슬롯(game.env·econ·geo …)은 주인이 채우기 전엔 null 이다. 읽는 쪽은 늘 `?.` + 기본값으로.
import type * as THREE from 'three';
import type { Part } from './art';

// ───────────── 1. 시간 상수 ─────────────
/** 게임 1시간 = 75초 */
export const HOUR_SEC = 75;
/** 게임 하루 = 1800초(실제 30분) */
export const DAY_SEC = 1800;
/** 새 저장의 시작 시각(09시) */
export const START_HOUR = 9;
/** 달 주기(게임 일) */
export const MOON_DAYS = 8;
/** 계절 하나의 길이(게임 일) */
export const SEASON_DAYS = 7;

export type Tod = 'morning' | 'day' | 'sunset' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
export type Weather = 'clear' | 'rain' | 'storm' | 'fog' | 'meteor' | 'snow' | 'blizzard' | 'rainbow' | 'aurora' | 'sandstorm';
export const WEATHERS: readonly Weather[] = ['clear', 'rain', 'storm', 'fog', 'meteor', 'snow', 'blizzard', 'rainbow', 'aurora', 'sandstorm'];

/** 시각을 0..24 로 접는다(음수·24 이상도 받는다) */
const wrapHour = (h: number) => ((h % 24) + 24) % 24;

/** 시간대 블록: 아침 05~09 · 낮 09~17 · 저녁 17~21 · 밤 21~05 (시작 포함, 끝 미포함) */
export function todOf(h: number): Tod {
  const x = wrapHour(h);
  if (x >= 5 && x < 9) return 'morning';
  if (x >= 9 && x < 17) return 'day';
  if (x >= 17 && x < 21) return 'sunset';
  return 'night';
}
/** 정오 11~13시 */
export const isNoon = (h: number) => { const x = wrapHour(h); return x >= 11 && x < 13; };
/** 자정 00~02시 */
export const isMidnight = (h: number) => { const x = wrapHour(h); return x >= 0 && x < 2; };
/** 요일: 0 월 … 6 일 */
export const weekdayOf = (day: number) => ((Math.floor(day) % 7) + 7) % 7;
/** 계절: 7일마다 봄 → 여름 → 가을 → 겨울 */
export const seasonOf = (day: number): Season => SEASONS[Math.floor(((Math.floor(day) % 28) + 28) % 28 / SEASON_DAYS)];
/** 달 위상 0..1(0.5 = 보름) — 8일 주기, gameSec 기준으로 부드럽게 */
export const moonPhaseOf = (gameSec: number) => (((gameSec / (DAY_SEC * MOON_DAYS)) % 1) + 1) % 1;
/** 보름달 창 0.45~0.55 */
export const isFullMoon = (phase: number) => phase >= 0.45 && phase <= 0.55;
/** 삭·월식 창 <0.04 또는 >0.96 */
export const isEclipse = (phase: number) => phase < 0.04 || phase > 0.96;

// ───────────── 모드 ─────────────
/** P0(?p0, p0=0 이 아니면 켜짐) 가격: ceil(x/5). 명시 P0 값이 있으면 그걸 쓴다 */
export const p0Price = (x: number, explicit?: number) => explicit ?? Math.ceil(x / 5);

// ───────────── 변이 ─────────────
export type Variant = 'shiny' | 'crown' | 'tiny';
export const VARIANTS: readonly Variant[] = ['shiny', 'crown', 'tiny'];
export const isVariant = (v: unknown): v is Variant => v === 'shiny' || v === 'crown' || v === 'tiny';

/** 가방 키 → {id, variant}. 'f_carp@crown' → {id:'f_carp', variant:'crown'}. 모르는 꼬리는 id 의 일부로 둔다 */
export function splitVariant(bagKey: string): { id: string; variant?: Variant } {
  const at = bagKey.lastIndexOf('@');
  if (at > 0) {
    const v = bagKey.slice(at + 1);
    if (isVariant(v)) return { id: bagKey.slice(0, at), variant: v };
  }
  return { id: bagKey };
}
/** {id, variant} → 가방 키. 변이가 없으면 id 그대로 */
export const variantKey = (id: string, v?: Variant | null) => (v ? `${id}@${v}` : id);

// ───────────── 2. 서비스 슬롯 타입 ─────────────
export type RegionId = string;

/** game.env — atmosphere(order 50). 늦게 생기니 꼭 lazily 읽기 */
export interface EnvApi {
  day: number;
  /** 0..24 실수 */
  hour: number;
  minute: number;
  tod: Tod;
  noon: boolean;
  midnight: boolean;
  /** 0 월 … 6 일 */
  weekday: number;
  season: Season;
  /** 0..1, 0.5 = 보름 */
  moonPhase: number;
  fullMoon: boolean;
  eclipse: boolean;
  /** 플레이어 자리 날씨 */
  weather: Weather;
  /** 플레이어가 있는 날씨 구역(가장 가까운 큰 섬, 아니면 'sea') */
  region: RegionId;
  regionWeather(x: number, z: number): Weather;
  weatherOf(region: RegionId): Weather;
  forecast(region: RegionId, hoursAhead: number): Weather;
  /** 파도 배율(평소 1, 폭풍 2) — ocean 이 읽는다 */
  waveMul: number;
  /** 저장 이후 누적 게임 초 */
  gameSec: number;
  /** region 또는 '*'(전부). w=null 이면 강제 해제 */
  forceWeather(region: RegionId | '*', w: Weather | null, hours?: number): void;
  advance(sec: number): void;
  setHour(h: number): void;
  /** flags.env 에 지금 시계(sec)를 쓰고 저장(있으면) */
  persist?(): void;
}

export type SeaZone = 'shore' | 'shallow' | 'reef' | 'offshore' | 'deep' | 'trench';
export interface ZoneInfo { island: string | null; theme: string; zone: string; sea: SeaZone | null }
export interface Landmark {
  /** 'lm:<island>:<kind>[:n]' */
  id: string;
  kind: string;
  name: string;
  island: string;
  x: number;
  z: number;
  r: number;
}
/** game.geo — worldterrain(order 2) */
export interface GeoApi {
  zoneAt(x: number, z: number): ZoneInfo;
  islandName(id: string): string;
  landmarks: Landmark[];
  /** 같은 id 면 무시(멱등) */
  addLandmark(l: Landmark): void;
  discovered(id: string): boolean;
  /** 해류 — seaworld 가 이 칸을 채우기 전엔 null 을 돌려준다 */
  currentAt(x: number, z: number): { x: number; z: number } | null;
}

/** game.ocean — 주인은 ocean 하나. 다른 담당은 읽기만 */
export interface OceanApi {
  /** env.waveMul 포함 */
  waveAt(x: number, z: number, t: number): number;
  stamina: number;
  staminaMax: number;
  oxygen: number;
  oxygenMax: number;
  swimming: boolean;
}

export interface SfxOpts { x?: number; z?: number; vol?: number; pitch?: number }
export type AudioChannel = 'master' | 'music' | 'sfx';
/** game.audio — audio(order 1). 소리는 전부 WebAudio 합성 */
export interface AudioApi {
  sfx(name: string, o?: SfxOpts): void;
  music(track: string | null): void;
  ambience(name: string, level: number): void;
  setVolume(ch: AudioChannel, v: number): void;
  /** on 생략 = 토글. 지금 음소거인지 돌려준다 */
  mute(on?: boolean): boolean;
}

export interface VehicleNow { kind: string; speed: number; boat: boolean; seats?: number; riders?: number }
/** registerKind 로 넣는 탈것 종류(세부 모양은 vehicles 가 정한다) */
export interface VehicleKindDef {
  kind: string;
  name: string;
  boat?: boolean;
  seats?: number;
  /** 해금 키(기본 `v:<kind>`) */
  unlock?: string;
  [k: string]: unknown;
}
/** game.vehicles — vehicles */
export interface VehiclesApi {
  current(): VehicleNow | null;
  owned(): string[];
  summon(kind: string): boolean;
  isBoat(kind: string): boolean;
  registerKind(def: VehicleKindDef): void;
  // ── wave 4 (vehicles-p1) — 호출하는 쪽은 `?.`
  /** 2인승이면 뒷자리 Object3D(손님 아바타를 붙인다), 아니면 null */
  setPassenger?(o: { on: boolean; pedal?: boolean }): THREE.Object3D | null;
  seat?(i: number): THREE.Object3D | null;
  /** 로켓 발사대 자리 */
  padPose?(): { x: number; y: number; z: number; rotY: number } | null;
  /** 저장된 최고 속도(종류별)·스턴트 수 */
  stats?(): { top: Record<string, number>; stunts: number };
}

export interface PlanetDef {
  id: string;
  name: string;
  origin: THREE.Vector3;
  radius: number;
  gravity: number;
  heightAt(x: number, z: number): number;
  build(): THREE.Object3D;
  onEnter?(): void;
  onExit?(): void;
}
export interface PlanetSpawner {
  id: string;
  build(root: THREE.Object3D): void;
  update?(t: number, dt: number): void;
}
export interface Pond { x: number; z: number; r: number; y: number }
/** game.space — space */
export interface SpaceApi {
  planet: string;
  ponds: Pond[];
  pondAt(x: number, z: number): { y: number } | null;
  oxygen: { value: number; max: number };
  landingSpawn: THREE.Vector3;
  returnSpawn: THREE.Vector3;
  registerPlanet(def: PlanetDef): void;
  goPlanet(id: string, spawn?: THREE.Vector3): void;
  addSpawn(planetId: string, spawner: PlanetSpawner): void;
}

export interface Witness { speciesId: string; pos: THREE.Vector3 }
export type WitnessSource = () => Witness[];
/** game.witnesses — 코어. 사진 모드·인사 등록이 읽는다 */
export interface WitnessRegistry {
  /** 등록 해제 함수를 돌려준다 */
  add(fn: WitnessSource): () => void;
  list(): Witness[];
}

// ───────────── 5. HUD 레지스트리 타입 ─────────────
export interface PanelTab { id: string; label: string; icon?: string; /** 탭 옆 작은 숫자 뱃지(예: '12') */ badge?: string }
export interface HudHelpers {
  /** HTML 이스케이프 */
  esc(s: unknown): string;
  /** 숫자 1,234 */
  fmt(n: number): string;
  /** 아이템·종 아이콘(이모지 또는 HTML) */
  ico(id: string): string;
  /** 표시 이름 */
  name(id: string): string;
  /** 대표 색 */
  color(id: string): string;
  confetti(el: HTMLElement, colors: string[], n: number): void;
  button(html: string, onClick: () => void): HTMLElement;
  /** 종 모델 썸네일(data URL) — 렌더러가 지원할 때만 */
  thumb?(id: string): string | null;
}
export interface PanelCtx {
  tab: string | undefined;
  /** 패널 안 선택(칸 클릭 등) */
  sel: string | null;
  arg: unknown;
  setSel(sel: string | null): void;
  /** 탭 바꾸기(계약 추가분 — 다시 그린다) */
  setTab(tab: string): void;
  rerender(): void;
  close(): void;
  h: HudHelpers;
}
export interface PanelDef {
  kind: string;
  title: string;
  color: string;
  icon?: string;
  defaultTab?: string;
  /** true 면 넓은 창(도감처럼 칸이 많은 패널) */
  wide?: boolean;
  tabs?(): PanelTab[];
  /** 제목 옆 작은 글(예: '12/20칸') */
  meta?(): string;
  render(body: HTMLElement, ctx: PanelCtx): void;
  onOpen?(arg: unknown): void;
  onClose?(): void;
}
export interface ChipDef {
  id: string;
  /** 작을수록 위 */
  order: number;
  render(el: HTMLElement): void;
  update?(el: HTMLElement, dt: number): void;
}
export interface HotkeyDef {
  /** KeyboardEvent.code (예: 'KeyB', 'Tab', 'Escape') */
  code: string;
  label: string;
  /** true 면 키 안내 칩에 보인다 */
  hint?: boolean;
  when?(): boolean;
  run(): void;
  /** 이 키가 여는 패널 kind. '*' = 열린 패널 아무거나(Esc). 잠금 중에도 자기 패널이 열려 있으면 돈다 */
  panel?: string;
  /** 같은 id 로 다시 등록하면 바꿔 끼운다 */
  id?: string;
}
export type ToPx = (x: number, z: number) => [number, number];
export interface MapLayerDef {
  id: string;
  /** 작을수록 먼저(아래에) 그린다 */
  order?: number;
  draw(g2: CanvasRenderingContext2D, toPx: ToPx, scale: number, world: 'earth' | 'space'): void;
}
export interface BannerOpts { text: string; sub?: string; icon?: string; color?: string; ms?: number }
export interface CardOpts { title: string; body: string; icon?: string; color?: string; ms?: number }
export interface GaugeOpts { label: string; /** 0..1 */ value: number; color: string; show: boolean }
export interface PanelState { kind: string; tab: string | undefined; arg: unknown; sel: string | null }

/** hud 모듈이 붙이는 실제 그리기 구현 */
export interface HudRenderer {
  openPanel(def: PanelDef, ctx: PanelCtx): void;
  closePanel(): void;
  showBanner(b: BannerOpts): void;
  showCard(c: CardOpts): void;
  setGauge(id: string, g: GaugeOpts): void;
  refreshChips(): void;
  toast(text: string): void;
  showRegion(name: string, sub: string, color: string, dark?: string): void;
  drawLayersHint?(): void;
  /** 같은 패널 다시 그리기(없으면 openPanel 을 다시 부른다) */
  renderPanel?(def: PanelDef, ctx: PanelCtx): void;
  /** 등록 알림(선택) — attach 때 큐 순서대로, 그 뒤엔 등록할 때마다 */
  addPanel?(def: PanelDef): void;
  addChip?(def: ChipDef): void;
  addHotkey?(def: HotkeyDef): void;
  addLayer?(def: MapLayerDef): void;
  /** 등록 해제(렌더러가 add* 로 따로 들고 있을 때 지우라고) */
  removeChip?(id: string): void;
  removeHotkey?(def: HotkeyDef): void;
  removeLayer?(id: string): void;
  /** 기본 도우미를 덮어쓸 것(썸네일·아이콘 등) */
  helpers?: Partial<HudHelpers>;
}

/** game.hud — 코어가 늘 만들어 둔다(src/core/registry.ts HudRegistryStore) */
export interface HudRegistry {
  registerPanel(def: PanelDef, opts?: { replace?: boolean }): boolean;
  open(kind: string, tab?: string, arg?: unknown): void;
  close(): void;
  isOpen(kind?: string): boolean;
  current(): PanelState | null;
  registerChip(def: ChipDef): () => void;
  registerHotkey(def: HotkeyDef): () => void;
  registerMapLayer(def: MapLayerDef): () => void;
  banner(b: BannerOpts): void;
  card(c: CardOpts): void;
  gauge(id: string, g: GaugeOpts): void;
  toast(text: string): void;
  showRegion(name: string, sub: string, color: string, dark?: string): void;
  attach(impl: HudRenderer): void;
  readonly attached: boolean;
  // ── 렌더러·다른 모듈이 쓰는 것(계약 추가분)
  /** 열려 있으면 닫고, 아니면 연다 */
  toggle(kind: string, tab?: string, arg?: unknown): void;
  /** 열린 패널이 바뀔 때. 해제 함수를 돌려준다 */
  onChange(fn: (kind: string | null, prev: string | null) => void): () => void;
  panel(kind: string): PanelDef | null;
  /** 열린 패널 다시 그리기 */
  rerender(): void;
  chips(): ChipDef[];
  hotkeys(): readonly HotkeyDef[];
  layers(): MapLayerDef[];
  readonly gauges: Map<string, GaugeOpts>;
}

/** game.dex — 예전 이름. hud 위의 얇은 외관 */
export interface DexFacade {
  open(kind?: string, tab?: string, arg?: unknown): void;
  close(): void;
  toast(text: string): void;
  showRegion(name: string, sub: string, color: string, dark?: string): void;
  register(def: PanelDef, opts?: { replace?: boolean }): boolean;
}

// ───────────── 6. 경제 ─────────────
export type Activity = 'fish' | 'bug' | 'dive' | 'space' | 'moonfish';
export type KeyColor = 'silver' | 'gold' | 'rainbow';
/** 5.4 상자 등급 */
export type ChestTier = 'wood' | 'silver' | 'gold' | 'rainbow' | 'space';
export type SellWhere = 'home' | 'island' | 'farsea' | 'space' | 'friend';
export type ShopId = 'quack' | 'shipyard' | 'peng' | 'beach' | 'bazaar' | 'diving' | 'potion' | 'moon' | 'junk' | 'station' | 'sheep' | 'capsule';

export interface Cost { coins?: number; stars?: number; items?: Record<string, number> }

export interface ShopItem {
  id: string;
  name: string;
  icon: string;
  shop: ShopId | string;
  cost: Cost;
  /** P0 명시 가격(없으면 ceil(x/5)) */
  p0Cost?: Cost;
  /** 사면 가방에 들어오는 것 */
  gives?: Record<string, number>;
  /** 사면 풀리는 해금 키 */
  unlock?: string;
  /** 살 수 있는 조건 키('islands3', 'parts6', 'homeDex30' …) */
  gate?: string;
  /** 한 번만 */
  once?: boolean;
  /** 순서대로 사야 하는 묶음(가방 30→40→50) */
  seq?: string | number;
  kind: string;
  desc?: string;
}

export interface Recipe {
  id: string;
  name: string;
  icon: string;
  needs: Record<string, number>;
  /** P0 재료(없으면 needs) */
  p0Needs?: Record<string, number>;
  /** 아이템 id 또는 해금 키 */
  gives: string;
  n?: number;
  /** 만들면 풀리는 해금 키 */
  unlock?: string;
  kind: string;
  desc?: string;
}

export interface LootItem { id: string; n: number; name?: string }
export interface ChestResult { tier: ChestTier | string; loot: LootItem[]; mimic?: boolean }

export interface RollWhere {
  island?: string;
  zone?: string;
  time?: string | string[];
  weather?: { only?: Weather[] | string[]; boost?: Weather[] | string[]; x?: number };
  /** 이 해금 키가 있어야 나온다 */
  dev?: string;
}
/** rollCatch 가 읽는 종 모양(Species + SpeciesExt 의 부분집합) */
export interface RollSpecies { id: string; name?: string; rarity: number; category?: string; tags?: string[]; len?: number; where?: RollWhere[] }

export interface RollQuery {
  activity: Activity;
  pool: RollSpecies[];
  bait?: string;
  buffs?: string[];
  rng?: () => number;
  junk?: boolean;
  luckMult?: number;
}
/** economy 가 만든다 */
export interface RollEnv {
  day: number;
  hour: number;
  tod: Tod | string;
  weather: Weather | string;
  p0: boolean;
  guestId?: string;
  /** ext.calendar?.boosts() */
  boostTags?: Record<string, number>;
  isUnlocked(key: string): boolean;
  rng(key: string): () => number;
}
export interface RollResult {
  species: RollSpecies | null;
  rarity: number;
  junk?: string;
  size?: number;
  variant?: Variant;
  combo: number;
  pityHit?: boolean;
  firstOfDay?: boolean;
}
export interface PityInfo { since3: number; since4: number; since5: number; /** since5/400 */ gauge: number }

export interface BagApi {
  size: number;
  used: number;
  free: number;
  canAdd(id: string, n?: number): boolean;
  /** 생물 10 · 재료 30 · 도구 1 */
  stackMax(id: string): number;
  isTool(id: string): boolean;
  /** tool_* 는 5칸 벨트로 */
  belt(): string[];
}
export interface RocketStatus {
  blueprint: boolean;
  parts: { body: boolean; engine: boolean; window: boolean; wing: boolean; fuel: boolean; chip: boolean };
  count: number;
  pad: boolean;
}
export interface MuseumWing { id: string; got: number; total: number; milestones: number[] }
export interface StorageApi { size: number; list(): Array<{ id: string; n: number }>; put(id: string, n: number): boolean; take(id: string, n: number): boolean }
export interface EconRequest {
  id: string; npc?: string; species?: RollSpecies; item?: string; n: number; reward: number; stars?: number; done: boolean;
  /** 부탁 종류(편지 부탁은 'letter') */
  kind?: string;
  /** 편지 부탁 — 받는 섬/주민 */
  to?: string;
  /** 부탁 문구 */
  text?: string;
}

/** game.econ — economy(order 9). 돈·별·열쇠·해금은 여기만 바꾼다 */
export interface EconApi {
  // 재화
  stars: number;
  stamps: number;
  /** 열쇠 조각 수(3조각 = 열쇠 1) */
  keys: Record<KeyColor, number>;
  addStars(n: number, why: string): void;
  spendStars(n: number, why: string): boolean;
  addKeyPiece(color: KeyColor, n: number): void;
  keyCount(color: KeyColor): number;
  useKey(color: KeyColor): boolean;
  // 비용
  canAfford(c: Cost): boolean;
  spend(c: Cost, why: string): boolean;
  // 가방
  bag: BagApi;
  /** 가방 규칙을 지켜 넣고 실제로 넣은 수를 돌려준다(꽉 차면 '가방이 꽉 찼어요!') */
  give(id: string, n: number, why?: string, o?: { silent?: boolean }): number;
  // 날짜·시세
  day(): number;
  market(): { day: number; hot: string[]; mult: Record<string, number> };
  // 가격·판매·상점
  priceOf(id: string, o?: { size?: number; variant?: Variant; where?: SellWhere }): number;
  sell(id: string, n: number, shop?: string): number;
  sellAll(ids?: string[], shop?: string): number;
  shopItems(shop: string): ShopItem[];
  shopPrice(id: string): Cost;
  canBuy(id: string): { ok: boolean; why?: string };
  buy(id: string): boolean;
  // 제작
  recipes(): Recipe[];
  needsOf(rid: string): Record<string, number>;
  canCraft(rid: string): boolean;
  craft(rid: string): boolean;
  // 박물관
  isDonated(id: string): boolean;
  canDonate(id: string): boolean;
  donate(id: string): boolean;
  // 해금
  isUnlocked(key: string): boolean;
  unlock(key: string, why?: string): void;
  requirement(key: string): { ok: boolean; text: string };
  rocket(): RocketStatus;
  // 잡기
  rollCatch(q: RollQuery): RollResult;
  reportCatch(r: RollResult): void;
  catchFail(activity: Activity): void;
  pity(activity: Activity | 'chest'): PityInfo;
  combo: number;
  // 상자·부탁
  openChest(tier?: ChestTier, where?: string): ChestResult;
  requests(): EconRequest[];
  fulfill(rid: string): boolean;
  /** 편지 배달 완료(우체통·부표 우체통 — 자리 확인 없이). 끝냈으면 true */
  deliverLetter?(idOrItem: string): boolean;
  // 기타
  flags(): Record<string, unknown>;
  p0: boolean;
  cheat: boolean;

  // ── wave 3A (econ-chests) — 호출하는 쪽은 `?.`
  chestTiers?: ChestTier[];
  addChestArea?(a: { id: string; island: string; x: number; z: number; r: number; n: number; tier?: ChestTier }): number | void;
  chestPity?(): { wood: number; gauge: number };
  museum?(): { wings: MuseumWing[] };
  skeletonsDone?(): string[];
  requestsFor?(npcId: string): EconRequest[];
  guest?(): { id: string } | null;

  // ── wave 4 (econ-p1) — 호출하는 쪽은 `?.`
  use?(id: string): boolean;
  addBuff?(name: string, gameMinutes: number): void;
  buffs?(): Array<{ name: string; until: number }>;
  storage?: StorageApi;
  release?(id: string): boolean;
  /** 집 진열장에 넣기/빼기 — 됐으면 true */
  display?(id: string, on: boolean): boolean;
  displayed?(): Array<{ id: string; n: number }>;
  displayMax?(): number;
  /** 켜진 버프 배율('speed' 과일파이 1.2 등, 기본 1) */
  buffMult?(name: string): number;
  invest?(island: string, cost: Cost): boolean;
  capsule?: { roll(): LootItem | null };
  figurine?(id: string): boolean;
}

// ───────────── 3. Species 확장(state.ts 가 extends) ─────────────
export type ShadowSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
export interface SpeciesWhere {
  island?: string;
  zone?: string;
  time?: string | string[];
  weather?: { only?: Weather[]; boost?: Weather[]; x?: number };
  /** 필요한 해금 키 */
  dev?: string;
}
export interface SpeciesExt {
  /** 'set:rainbow' 'ancient' 'food:carni' 'rocket' 'witness' 'vehicle' 'junk' 'space-goods' 'fos:<dino>:<part>' … */
  tags?: string[];
  /** GDD 표의 id(기존 id 를 바꾸지 않을 때) */
  gdd?: string;
  where?: SpeciesWhere[];
  /** 잡지 않고 만나면 등록 */
  witness?: boolean;
  /** 평균 크기 cm */
  len?: number;
  shadow?: ShadowSize;
  /** 데이터만, 출현은 나중 */
  p1?: boolean;
  diet?: 'herb' | 'carni';
  look?: { parts?: Part[] };
}

/** 0.8 그림자 지름(m) */
export const SHADOW_M: Record<ShadowSize, number> = { XS: 0.35, S: 0.55, M: 0.8, L: 1.2, XL: 1.8, XXL: 2.8 };
/** 0.8 세상 속 모델 길이(m) = clamp(len/100, 0.18, 8) */
export const worldLen = (lenCm: number) => Math.min(8, Math.max(0.18, lenCm / 100));
/** 3.0 들어 올리기 정규화 길이: 0.55m, 거대종(XL·XXL, 그림자 없으면 len ≥ 150)은 1.1m */
export const holdLen = (s: { shadow?: ShadowSize; len?: number }) =>
  (s.shadow ? s.shadow === 'XL' || s.shadow === 'XXL' : (s.len ?? 0) >= 150) ? 1.1 : 0.55;

// ───────────── 2. 정해진 KeyF 우선순위 ─────────────
/** F(대체 상호작용) 우선순위: 공룡 타기 30 · 풍선 새총 20 · 베기 10 · 나머지 0 */
export const ALT_PRIORITY = { dinoMount: 30, slingshot: 20, chop: 10, other: 0 } as const;
