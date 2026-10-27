// game.geo — 구역 판정·랜드마크 등록부·발견 기록(worldterrain, order 2).
// 랜드마크는 PLACES 에서 씨앗을 심고(lm:<섬>:<종류>[:n]), village·flora 가 자기 것을 addLandmark 로 더한다(같은 id 는 무시).
// 0.5초마다 플레이어 자리를 보고: 섬에 처음 올라서면 discover{kind: island|islet}, 랜드마크 40 m 안에 처음 들면 discover{kind: landmark}.
// 발견 기록은 flags.world.disc[id] = 발견한 게임 날(1부터) — 저장되므로 다시 불러와도 같은 id 는 두 번 울리지 않는다.
import * as Island from '../../core/island';
import type { GeoApi, Landmark, ZoneInfo } from '../../core/api';
import type { Game } from '../../core/game';
import { zoneAt } from './zones';

/** 랜드마크 발견 반경(m) */
export const DISCOVER_R = 40;
/** 발견 검사 주기(초) */
export const DISCOVER_EVERY = 0.5;

export interface WorldFlags { disc: Record<string, number> }

/** worldterrain 이 내보내는 geo(계약 GeoApi + 디버그·갱신용 몇 가지) */
export interface GeoService extends GeoApi {
  /** 지금 자리로 발견 검사를 바로 한다(새로 발견한 id 목록) */
  check(x?: number, z?: number): string[];
  /** 발견 기록 사본 */
  disc(): Record<string, number>;
  /** id 로 랜드마크 찾기 */
  landmark(id: string): Landmark | undefined;
  /** onUpdate 해제 */
  dispose(): void;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** flags.world 를 읽는다(없거나 망가졌으면 고쳐 깐다) */
export function worldFlags(flags: Record<string, unknown>): WorldFlags {
  let w = flags.world;
  if (!isObj(w)) { w = {}; flags.world = w; }
  const o = w as Record<string, unknown>;
  if (!isObj(o.disc)) o.disc = {};
  return o as unknown as WorldFlags;
}

const FACILITY_NAMES: Record<string, string> = {
  apiary: '꿀벌 양봉장', divingCenter: '다이빙 센터', fireflyGarden: '반딧불 정원', fossilLab: '화석 연구소', iceHut: '얼음낚시 오두막',
  bazaar: '오아시스 바자르', observatory: '둥근 천문대', potionShop: '물약 가게', skiLift: '스키 리프트',
};
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];

/** PLACES 에서 고른 랜드마크 씨앗(마을 한복판 시설처럼 시작하자마자 닿는 것은 뺀다) */
export function seedLandmarks(): Landmark[] {
  const P = Island.PLACES;
  const nm = Island.islandName;
  const out: Landmark[] = [];
  const add = (island: string, kind: string, name: string, x: number, z: number, r: number, n?: number) => {
    out.push({ id: `lm:${island}:${kind}${n !== undefined ? `:${n}` : ''}`, kind, name, island, x, z, r });
  };
  for (const id of Island.LIGHTHOUSE_ISLANDS) { const p = P.lighthouses[id]; add(id, 'lighthouse', `${nm(id)} 등대`, p.x, p.z, 10); }
  add('home', 'museum', '말랑 박물관', P.museum.x, P.museum.z, 12);
  add('home', 'shipyard', '말랑 조선소', P.shipyard.x, P.shipyard.z, 14);
  add('home', 'house', '내 집 터', P.house.x, P.house.z, 12);
  add('launch', 'launchpad', '도파민 1호 발사대', P.launchPad.x, P.launchPad.z, 24);
  add('launch', 'penglab', '펭박사 연구소', P.pengLab.x, P.pengLab.z, 12);
  for (const [k, s] of Object.entries(P.facilities)) add(s.island, k.toLowerCase(), FACILITY_NAMES[k] ?? k, s.x, s.z, 10);
  const th = P.tinoHill; add('dino', 'tinohill', '티노 낮잠 언덕', th.x, th.z, th.r);
  const cr = P.crater; add('launch', 'crater', '은하수 크레이터 호수', cr.x, cr.z, cr.r);
  add('ice', 'iceberg', P.iceberg.name, P.iceberg.x, P.iceberg.z, P.iceberg.r);
  // 동굴 입구: PLACES 의 'cave:<섬>:<n>' 그대로 번호를 잇는다
  for (const c of P.caves) { const n = Number(c.id.split(':')[2]); add(c.island, 'cave', `${nm(c.island)} 동굴 ${CIRCLED[n - 1] ?? n}`, c.x, c.z, 8, n); }
  // 바다 랜드마크(GDD 2.4) — 섬 칸은 'sea'
  P.buoyMail.forEach((b, i) => add('sea', 'buoy', `부표 우체통 ${CIRCLED[i] ?? i + 1}`, b.x, b.z, 6, i + 1));
  add('sea', 'wreck', `해적 난파선 ${P.wreck.name}`, P.wreck.x, P.wreck.z, 30);
  add('sea', 'ghostship', `유령선 ${P.ghostShip.name}`, P.ghostShip.x, P.ghostShip.z, 35);
  add('sea', 'ufowreck', P.ufoWreck.name, P.ufoWreck.x, P.ufoWreck.z, 26);
  add('sea', 'whirlpool', P.whirlpool.name, P.whirlpool.x, P.whirlpool.z, P.whirlpool.r);
  return out;
}

/** 랜드마크 모양이 맞는가(다른 담당이 넣는 값 확인) */
function validLandmark(l: Landmark): boolean {
  return !!l && typeof l.id === 'string' && l.id.length > 0 && Number.isFinite(l.x) && Number.isFinite(l.z);
}

/** 육지 위 섬(바다·마을 앞바다면 null) */
function landIsland(x: number, z: number): Island.IslandDef | null {
  const s = Island.worldSample(x, z);
  if (s.coast > 0 && s.island) return s.island;
  // 마을 반도(세계 섬 해안 밖이지만 마을 땅) = 말랑섬
  const B = Island.ISLAND_BOUNDS;
  const nearVillage = x > B.minX - 30 && x < B.maxX + 30 && z > B.minZ - 30 && z < B.maxZ + 30;
  if (nearVillage && Island.coastDistAt(x, z) > 0) return Island.islandById('home') ?? null;
  return null;
}

/**
 * game.geo 를 만들어 붙이고 발견 검사를 onUpdate 에 건다.
 * 테스트는 가짜 게임(tests/kit)에 바로 부른다 — 화면·WebGL 없이 돈다.
 */
export function installGeo(game: Game): GeoService {
  const list: Landmark[] = [];
  const byId = new Map<string, Landmark>();
  const flags = () => worldFlags(game.state.flags);
  const dayNo = () => Math.max(1, Math.floor(game.env?.day ?? 0) + 1);

  const addLandmark = (l: Landmark) => {
    if (!validLandmark(l) || byId.has(l.id)) return;
    const lm: Landmark = { id: l.id, kind: l.kind ?? 'landmark', name: l.name ?? l.id, island: l.island ?? 'sea', x: l.x, z: l.z, r: Number.isFinite(l.r) ? l.r : 10 };
    byId.set(lm.id, lm);
    list.push(lm);
  };
  for (const l of seedLandmarks()) addLandmark(l);

  const mark = (id: string, name: string, kind: 'island' | 'islet' | 'landmark', out: string[]) => {
    const d = flags().disc;
    if (d[id]) return;
    d[id] = dayNo();
    out.push(id);
    game.state.emit({ type: 'discover', place: id, name, kind });
  };

  const check = (px?: number, pz?: number): string[] => {
    const out: string[] = [];
    if (game.world !== 'earth') return out;
    // 실내·행성처럼 초점이 따로 있으면 그 자리는 지구 지도가 아니다
    if (px === undefined && game.focusOverride) return out;
    const x = px ?? game.player.pos.x, z = pz ?? game.player.pos.z;
    const isl = landIsland(x, z);
    if (isl) mark(isl.id, Island.islandName(isl.id), isl.theme === 'islet' ? 'islet' : 'island', out);
    for (const lm of list) {
      if (Math.abs(x - lm.x) > DISCOVER_R || Math.abs(z - lm.z) > DISCOVER_R) continue;
      if (Math.hypot(x - lm.x, z - lm.z) <= DISCOVER_R) mark(lm.id, lm.name, 'landmark', out);
    }
    if (out.length) game.state.save();
    return out;
  };

  let acc = DISCOVER_EVERY; // 첫 프레임에 바로 한 번
  const off = game.onUpdate((_t, dt) => {
    acc += dt;
    if (acc < DISCOVER_EVERY) return;
    acc = 0;
    check();
  });

  const geo: GeoService = {
    zoneAt: (x: number, z: number): ZoneInfo => zoneAt(x, z, list),
    islandName: (id: string) => Island.islandName(id),
    landmarks: list,
    addLandmark,
    discovered: (id: string) => !!flags().disc[id],
    // 해류는 seaworld 가 이 칸을 덮어쓴다
    currentAt: () => null,
    check,
    disc: () => ({ ...flags().disc }),
    landmark: (id: string) => byId.get(id),
    dispose: () => { if (typeof off === 'function') off(); },
  };
  game.geo = geo;
  return geo;
}
