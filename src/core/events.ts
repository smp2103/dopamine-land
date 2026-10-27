// 계약 v2 이벤트(docs/CONTRACT2.md 4장). game.state.emit 으로 보내는 것들의 타입 모음 + 정해진 id 표.
// 모르는 이벤트도 흘러갈 수 있게 GameEvent 에는 느슨한 꼬리({type:string})가 붙어 있다 → 좁힐 땐 isEvent()/onEvent().
import type { Species } from './state';
import type { Activity, ChestTier, Cost, LootItem, Tod, Variant, Weather } from './api';

/** 이벤트 하나 정의: {type} + 필드 */
type Ev<T extends string, F = {}> = { type: T } & F;

// ── 기존(유지)
export type RegisterEvent = Ev<'register'>;
export type CollectEvent = Ev<'collect', {
  species: Species;
  size?: number;
  isNew: boolean;
  variant?: Variant;
  activity?: Activity | string;
  /** core v2 부터 채워진다(이전 저장 코드에선 없을 수 있다) */
  rarity?: number;
}>;
export type CoinsEvent = Ev<'coins', { delta: number; why: string }>;
export type BagEvent = Ev<'bag', { id: string; delta: number }>;
export type SellEvent = Ev<'sell', { id: string; n: number; coins: number; shop: string }>;
export type BuyEvent = Ev<'buy', { id: string; n: number; cost?: Cost; coins?: number }>;
export type CraftEvent = Ev<'craft', { id: string; /** 아이템 id 또는 해금 키 */ gives?: string; n: number }>;
export type DonateEvent = Ev<'donate', { id: string; n: number; coins: number; stars?: number }>;
export type StarsEvent = Ev<'stars', { delta: number; why: string }>;
export type UnlockEvent = Ev<'unlock', { key: string; why?: string }>;
export type ChestLootEvent = Ev<'chest-loot', { tier: ChestTier | string; loot: LootItem[]; at?: string }>;
export type ChestOpenEvent = Ev<'chest-open', { tier: ChestTier | string; at: string; loot: LootItem[]; source?: string }>;
export type RequestDoneEvent = Ev<'request-done', { id: string; coins: number; npc?: string }>;
export type OpenShopEvent = Ev<'open-shop', { shop: string }>;
export type OpenMuseumEvent = Ev<'open-museum'>;
export type OpenCraftEvent = Ev<'open-craft'>;
export type OpenBoardEvent = Ev<'open-board'>;

// ── 가방·시계
export type BagFullEvent = Ev<'bag-full', { id: string }>;
/** 게임 1시간마다 + 플레이어 자리 날씨가 바뀔 때 */
export type EnvEvent = Ev<'env', { tod: Tod; weather: Weather; hour: number; day: number }>;
export type DayEvent = Ev<'day', { day: number; prev: number }>;
export type TodEvent = Ev<'tod', { tod: Tod; prev: Tod }>;
export type WeatherEvent = Ev<'weather', { region: string; weather: Weather; prev: Weather }>;

// ── 잡기
export type CatchEvent = Ev<'catch', {
  activity: Activity | string;
  species: Species;
  rarity: number;
  variant?: Variant;
  size?: number;
  combo: number;
  firstOfDay?: boolean;
}>;
export type CatchFailEvent = Ev<'catch-fail', { activity: Activity | string }>;

// ── 채집
export const HARVEST_KINDS = [
  'chop', 'rock', 'shake', 'fruit', 'flower', 'petal', 'vine', 'mushroom', 'spore', 'glowcap', 'fern', 'shell', 'feather',
  'dig', 'balloon', 'bottle', 'moonrock', 'moonflower', 'stardust', 'meteor', 'seaweed', 'coral', 'pearl', 'honey', 'crater', 'junk',
] as const;
export type HarvestKind = typeof HARVEST_KINDS[number];
export const isHarvestKind = (k: unknown): k is HarvestKind => typeof k === 'string' && (HARVEST_KINDS as readonly string[]).includes(k);
export type HarvestEvent = Ev<'harvest', { kind: HarvestKind; item: string; n: number; island: string; combo?: number }>;

// ── 세상 반응
export type TreeShakeEvent = Ev<'tree-shake', { x: number; z: number; tree: string; island: string }>;
export type RockHitEvent = Ev<'rock-hit', { x: number; z: number; rock: string; combo: number; island: string }>;
export type BeehiveEvent = Ev<'beehive', { x: number; z: number }>;
export type StungEvent = Ev<'stung'>;

// ── 주민
export type NpcTalkEvent = Ev<'npc-talk', { npc: string }>;
export type BefriendEvent = Ev<'befriend', { id: string; hearts: number; kind: 'npc' | 'dino' }>;
export type GiftEvent = Ev<'gift', { npc: string; item: string; delta: number }>;
/** ★4 잡기 — 근처 주민이 박수 */
export type ClapEvent = Ev<'clap', { x: number; z: number }>;

// ── 세상·이동
export type DiscoverEvent = Ev<'discover', { place: string; name: string; kind: 'island' | 'landmark' | 'islet' }>;
export type MountEvent = Ev<'mount', { vehicle: string }>;
export type DismountEvent = Ev<'dismount', { vehicle: string }>;
export type SummonEvent = Ev<'summon', { vehicle: string }>;
/** 로켓 발사 0.5초 — 주민이 손을 흔든다 */
export type LaunchWaveEvent = Ev<'launch-wave'>;
export type LaunchEvent = Ev<'launch', { to: string }>;
export type ArriveEvent = Ev<'arrive', { to: string }>;

// ── 생존
export type SwimRescueEvent = Ev<'swim-rescue'>;
export type OxygenOutEvent = Ev<'oxygen-out', { where: 'sea' | 'space' }>;

// ── UI
export type OpenPanelEvent = Ev<'open-panel', { kind: string; tab?: string; arg?: unknown }>;
export type OpenShipyardEvent = Ev<'open-shipyard'>;
export type UiOpenEvent = Ev<'ui-open', { kind: string }>;
export type UiCloseEvent = Ev<'ui-close', { kind: string }>;

// ── 메타·달력
export type MissionDoneEvent = Ev<'mission-done', { id: string }>;
export type MissionsAllEvent = Ev<'missions-all', { day: number }>;
export type AchievementEvent = Ev<'achievement', { id: string; stars: number }>;
export type SetCompleteEvent = Ev<'set-complete', { id: string }>;
export type WeekdayEventEvent = Ev<'weekday-event', { id: WeekdayEventId; active: boolean }>;
export type MailEvent = Ev<'mail', { id: string }>;

// ── 배치·개발
export type PlaceEvent = Ev<'place', { item: string; where: string }>;
export type DevStageEvent = Ev<'dev-stage', { island: string; stage: number }>;
export type LighthouseEvent = Ev<'lighthouse', { island: string; lit: boolean }>;

// ── 이야기·P1·네트워크
export type TinoEvent = Ev<'tino', { state: 'sleep' | 'stir' | 'wake' | 'chase' }>;
export type ReleaseEvent = Ev<'release', { species: string; n: number; where: string }>;
export type SecretFoundEvent = Ev<'secret-found', { id: SecretId }>;
export type EndingEvent = Ev<'ending'>;
export type PhotoEvent = Ev<'photo', { spot?: string; species?: string[] }>;
export type NetPeerEvent = Ev<'net-peer', { state: string }>;
export type NetCoopEvent = Ev<'net-coop', { kind: string; data: unknown }>;

/** 계약에 있는 모든 이벤트 */
export type KnownEvent =
  | RegisterEvent | CollectEvent | CoinsEvent | BagEvent | SellEvent | BuyEvent | CraftEvent | DonateEvent | StarsEvent
  | UnlockEvent | ChestLootEvent | ChestOpenEvent | RequestDoneEvent | OpenShopEvent | OpenMuseumEvent | OpenCraftEvent | OpenBoardEvent
  | BagFullEvent | EnvEvent | DayEvent | TodEvent | WeatherEvent
  | CatchEvent | CatchFailEvent | HarvestEvent
  | TreeShakeEvent | RockHitEvent | BeehiveEvent | StungEvent
  | NpcTalkEvent | BefriendEvent | GiftEvent | ClapEvent
  | DiscoverEvent | MountEvent | DismountEvent | SummonEvent | LaunchWaveEvent | LaunchEvent | ArriveEvent
  | SwimRescueEvent | OxygenOutEvent
  | OpenPanelEvent | OpenShipyardEvent | UiOpenEvent | UiCloseEvent
  | MissionDoneEvent | MissionsAllEvent | AchievementEvent | SetCompleteEvent | WeekdayEventEvent | MailEvent
  | PlaceEvent | DevStageEvent | LighthouseEvent
  | TinoEvent | ReleaseEvent | SecretFoundEvent | EndingEvent | PhotoEvent | NetPeerEvent | NetCoopEvent;

export type EventType = KnownEvent['type'];
/** 이름으로 이벤트 모양 찾기: EventOf<'catch'> */
export type EventOf<T extends EventType> = Extract<KnownEvent, { type: T }>;
/** 모르는 이벤트(모듈이 따로 쓰는 것) */
export type LooseEvent = { type: string; [k: string]: unknown };
export type GameEvent = KnownEvent | LooseEvent;

/** 좁히기: if (isEvent(e, 'catch')) e.species … */
export const isEvent = <T extends EventType>(e: { type: string }, type: T): e is EventOf<T> => e.type === type;

/** state.on/off 만 있으면 되는 최소 모양(코어 v1·v2 둘 다 맞는다) */
export interface EventSource {
  on(fn: (e: LooseEvent) => void): unknown;
  off?(fn: (e: LooseEvent) => void): void;
  emit(e: LooseEvent): void;
}

/** 한 종류만 듣기. 해제 함수를 돌려준다(v1 state 처럼 on 이 해제를 안 주면 off 로, 그것도 없으면 리스너를 무력화) */
export function onEvent<T extends EventType>(src: EventSource, type: T, fn: (e: EventOf<T>) => void): () => void {
  let live = true;
  const l = (e: LooseEvent) => { if (live && e.type === type) fn(e as unknown as EventOf<T>); };
  const r = src.on(l);
  return () => {
    if (!live) return;
    live = false;
    if (typeof r === 'function') (r as () => void)();
    else src.off?.(l);
  };
}

/** 타입이 맞는 emit(필드 빠뜨림을 컴파일 때 잡는다) */
export const emitEvent = (src: EventSource, e: KnownEvent) => src.emit(e as unknown as LooseEvent);

// ───────────── 정해진 id 표 ─────────────
/** 요일 이벤트(게임 날짜 % 7, 0 = 월) */
export const WEEKDAY_EVENTS = ['petalrain', 'migration', 'sandtemple', 'firefly', 'whaleroad', 'pirate', 'meteor'] as const;
export type WeekdayEventId = typeof WEEKDAY_EVENTS[number];
export const weekdayEventOf = (day: number): WeekdayEventId => WEEKDAY_EVENTS[((Math.floor(day) % 7) + 7) % 7];

/** 섬마다 숨은 곳 3개 × 7섬 = 21 */
export const SECRET_IDS = [
  'home-waterfall-cave', 'home-cliff-beach', 'home-fairy-ring',
  'dino-lava-garden', 'dino-mural-cave', 'dino-bubble-cave',
  'ice-mammoth', 'ice-aurora-cave', 'ice-avalanche',
  'mush-moon-deck', 'mush-swamp-hut', 'mush-tree-room',
  'coral-clam', 'coral-pirate-cave', 'coral-sandbar',
  'desert-temple', 'desert-water-cave', 'desert-trex',
  'launch-meteorite', 'launch-glide', 'launch-probe',
] as const;
export type SecretId = typeof SECRET_IDS[number];
export const isSecretId = (s: unknown): s is SecretId => typeof s === 'string' && (SECRET_IDS as readonly string[]).includes(s);
