// 구역 판정(순수) — 아무 좌표나 넣으면 {섬, 테마, 구역 코드, 바다 구역}. fishing·insects·ocean 이 game.geo.zoneAt 으로 읽는다.
// 구역 코드는 GDD 3.5(낚시)·3.6(곤충) 표의 '장소' 코드와 같다. 판정 순서:
//   ① 바다(해안 밖): 해구 → 가장자리 고리 → 산호초 고리·말랑섬 남쪽 만 → 해안 거리(0~20 shore, ~150 shallow, ~520 offshore, 그 밖 deep)
//   ② 섬 안 물: 호수 종류(world.ts LakeKind) → 석호·맹그로브 → 폭포·하구·강
//   ③ 땅: 등록된 랜드마크 둘레 → 지형 특징(화산·초원·협곡 …) → 섬마다 5구역(GDD 2.2)을 방위각·중심 거리로
// 주의: 해구는 .sea === 'trench' 로만 나온다(zone 은 'deep' — GDD 3.5.10 심해어). 세상 가장자리 고리도 deep.
//       땅에서도 곤충 표(GDD 3.6) 코드인 swamp·foglake·oasis·ruin·cave·dune·crater·shipwreck 가 나올 수 있다.
// 같은 좌표는 언제 물어도 같은 답(시드 고정 지형 + 한 번 계산한 특징 표). 랜드마크를 넘기면 그 둘레만 덮어쓴다.
import * as Island from '../../core/island';
import type { IslandDef, LakeInfo, WorldFeature } from '../../core/world';
import type { Landmark, SeaZone, ZoneInfo } from '../../core/api';

/** 물 구역 코드(낚시) */
export const WATER_ZONES = [
  'river', 'pond', 'waterfall', 'heartpond', 'estuary', 'shore', 'stream', 'mangrove', 'lagoon', 'reef', 'footprint', 'hotspring',
  'ancientlake', 'swamp', 'icehole', 'icelake', 'icesea', 'foglake', 'oasis', 'ruin', 'cave', 'dune', 'crater', 'offshore', 'deep', 'trench',
] as const;
/** 땅 구역 코드(곤충) */
export const LAND_ZONES = [
  'flower', 'tree', 'grass', 'rock', 'sakura', 'orchard', 'beach', 'jungle', 'palm', 'fern', 'ranch', 'volcano', 'lava', 'fossil', 'snow',
  'icecave', 'cabin', 'snowtree', 'aurorahill', 'mushroom', 'shade', 'giant', 'tower', 'desertgrass', 'sand', 'pit', 'cactus', 'pyramid',
  'hill', 'antenna', 'pad', 'meadow', 'telescope', 'wreckshore', 'shipwreck', 'swamp', 'foglake', 'oasis', 'ruin', 'cave', 'dune', 'crater',
] as const;

/** 바다 구역 경계(해안까지 m) */
export const SEA_SHORE = 20;
export const SEA_SHALLOW = 150;
export const SEA_DEEP = 520;
/** 산호초 고리: 산호빛섬 해안 바깥 80~250 m */
export const REEF_RING = { r0: 80, r1: 250 };
/** 말랑섬 남쪽 만 산호초(원점 남쪽 40~200 m) */
export const HOME_BAY = { z0: 40, z1: 200, halfX: 180 };
/** 얼음 바다: 솜눈섬 해안 바깥 이만큼 + 얼음 성 빙산 둘레 */
const ICESEA_R = 150;
const ICEBERG_SEA_R = 250;
/** 폭포 물 둘레(m) — 이 안의 강물은 waterfall */
const FALL_R = 30;
/** 하구: 해안에서 이만큼 안쪽 강물 + 강 어귀 바다 */
const ESTUARY_COAST = 70;
const ESTUARY_SEA_R = 80;

type P = { x: number; z: number; r: number };

interface Prep {
  falls: Array<{ x: number; z: number; island: string }>;
  estuary: P | null;
  coral: IslandDef;
  /** 호수 id → 구역 코드 덮어쓰기(모래시계섬 동쪽 오아시스 = 유적 연못) */
  lakeZone: Map<string, string>;
  /** 모래시계섬 서쪽 오아시스(야자 둘레 = oasis 땅) */
  oasis: LakeInfo[];
  heartpond: P | null;
  volcano: P | null;
  meadow: P | null;
  tinoHill: P | null;
  geyser: P | null;
  iceCaves: P[];
  mangrove: P | null;
  jungleHill: P | null;
  canyon: P | null;
  fossilCliff: P | null;
  crater: P | null;
  observatory: P | null;
  launchPad: P;
  pengLab: P;
}

let prepCache: Prep | null = null;

/** 특징 표를 한 번 읽어 판정용으로 정리한다(지형이 시드 고정이라 결과도 고정) */
function prep(): Prep {
  if (prepCache) return prepCache;
  const F = Island.worldFeatures();
  const feat = (id: string): P | null => { const f = F.find((q: WorldFeature) => q.id === id); return f ? { x: f.x, z: f.z, r: f.r } : null; };
  // 폭포: 강 마디에서 물 높이가 1.2 m 넘게 떨어지는 곳(world.ts riverQuery 와 같은 기준, 마디 67% 지점)
  const falls: Prep['falls'] = [];
  for (const R of Island.worldRivers()) {
    for (let i = 0; i < R.pts.length - 1; i++) {
      const a = R.pts[i], b = R.pts[i + 1];
      if (a.level - b.level > 1.2) falls.push({ x: a.x + (b.x - a.x) * 0.67, z: a.z + (b.z - a.z) * 0.67, island: R.island });
    }
  }
  const wf = feat('feat:home:waterfall');
  if (wf) falls.push({ x: wf.x, z: wf.z, island: 'home' });
  const lakes = Island.worldLakes();
  const desert = Island.islandById('desert')!;
  const lakeZone = new Map<string, string>();
  const oasis: LakeInfo[] = [];
  for (const L of lakes) {
    if (L.island !== 'desert' || L.kind !== 'oasis') continue;
    // 동쪽 반(피라미드 유적 쪽) 오아시스는 신전 연못(ruin), 서쪽은 바자르 오아시스
    if (L.x > desert.x) lakeZone.set(L.id, 'ruin');
    else oasis.push(L);
  }
  const hp = lakes.find((l) => l.kind === 'heartpond');
  const caves = Island.PLACES.caves.filter((c) => c.island === 'ice').map((c) => ({ x: c.x, z: c.z, r: 30 }));
  const hid = Island.PLACES.hidden;
  for (const k of ['ice-aurora-cave', 'ice-mammoth'] as const) caves.push({ x: hid[k].x, z: hid[k].z, r: 30 });
  const pad = Island.PLACES.launchPad, lab = Island.PLACES.pengLab;
  prepCache = {
    falls,
    estuary: feat('feat:home:estuary'),
    coral: Island.islandById('coral')!,
    lakeZone,
    oasis,
    heartpond: hp ? { x: hp.x, z: hp.z, r: hp.r } : null,
    volcano: feat('feat:dino:volcano'),
    meadow: feat('feat:dino:meadow'),
    tinoHill: feat('feat:dino:tinoHill'),
    geyser: feat('feat:ice:geyserValley'),
    iceCaves: caves,
    mangrove: feat('feat:coral:mangrove'),
    jungleHill: feat('feat:coral:jungleHill'),
    canyon: feat('feat:desert:canyon'),
    fossilCliff: feat('feat:desert:fossilCliff'),
    crater: feat('feat:launch:crater'),
    observatory: feat('feat:launch:observatoryHill'),
    launchPad: { x: pad.x, z: pad.z, r: 75 },
    pengLab: { x: lab.x, z: lab.z, r: 30 },
  };
  return prepCache;
}

const dist = (p: { x: number; z: number }, x: number, z: number) => Math.hypot(x - p.x, z - p.z);
const near = (p: P | null, x: number, z: number, k = 1) => !!p && dist(p, x, z) < p.r * k;
/** 방위각(도): 0 = 북(−z), 90 = 동(+x), 180 = 남, 270 = 서 */
export function bearing(cx: number, cz: number, x: number, z: number): number {
  const b = (Math.atan2(x - cx, -(z - cz)) * 180) / Math.PI;
  return b < 0 ? b + 360 : b;
}
/** 방위각이 [from, to) 안인가(360 을 넘어가는 구간 가능) */
const sector = (b: number, from: number, to: number) => (from <= to ? b >= from && b < to : b >= from || b < to);

/** 마을 영향 범위(island.ts villageW > 0 과 같은 사각형 + 30 m) */
function nearVillage(x: number, z: number): boolean {
  const B = Island.ISLAND_BOUNDS;
  return x > B.minX - 30 && x < B.maxX + 30 && z > B.minZ - 30 && z < B.maxZ + 30;
}

/** 랜드마크 종류 → 그 둘레 땅 구역(다른 담당이 addLandmark 로 넣는 대표 건물·나무) */
const LANDMARK_ZONE: Array<[RegExp, string, string | null]> = [
  [/pyramid/, 'pyramid', null],
  [/halmi|sakura|cherry/, 'sakura', null],
  [/giant/, 'giant', null],
  [/mushtower|mushroom-?tower|^tower$/, 'tower', 'mushroom'],
  [/launchtower|rockettower|^tower$/, 'tower', 'launch'],
  [/observ|telescope/, 'telescope', null],
  [/antenna|penglab/, 'antenna', null],
  [/icehut|cabin|snowman/, 'cabin', null],
  [/coconut|palm/, 'palm', null],
];
function landmarkZone(lms: readonly Landmark[] | undefined, island: string, x: number, z: number): string | null {
  if (!lms || !lms.length) return null;
  let best: string | null = null, bd = Infinity;
  for (const lm of lms) {
    if (lm.island !== island) continue;
    const r = Math.min(40, Math.max(15, lm.r * 1.2));
    const d = dist(lm, x, z);
    if (d >= r || d >= bd) continue;
    for (const [re, zone, only] of LANDMARK_ZONE) {
      if (only && only !== island) continue;
      if (re.test(lm.kind)) { best = zone; bd = d; break; }
    }
  }
  return best;
}

/** 바다 구역 + 그 자리 낚시 구역 */
function seaZone(x: number, z: number, off: number, isl: IslandDef | null): { sea: SeaZone; zone: string } {
  if (Island.trenchAt(x, z) > 0.5) return { sea: 'trench', zone: 'deep' };
  if (Math.hypot(x, z) > Island.EDGE_RING.r0) return { sea: 'deep', zone: 'deep' };
  const Z = prep();
  const cc = -Island.islandCoast(Z.coral, x, z);
  if ((cc >= REEF_RING.r0 && cc <= REEF_RING.r1) || (z >= HOME_BAY.z0 && z <= HOME_BAY.z1 && Math.abs(x) < HOME_BAY.halfX)) {
    return { sea: 'reef', zone: 'reef' };
  }
  const sea: SeaZone = off < SEA_SHORE ? 'shore' : off < SEA_SHALLOW ? 'shallow' : off < SEA_DEEP ? 'offshore' : 'deep';
  let zone = off < SEA_SHALLOW ? 'shore' : 'offshore';
  if (Z.estuary && dist(Z.estuary, x, z) < ESTUARY_SEA_R) zone = 'estuary';
  if (isl?.theme === 'ice' && off < ICESEA_R) zone = 'icesea';
  if (dist(Island.ICEBERG, x, z) < ICEBERG_SEA_R) zone = 'icesea';
  return { sea, zone };
}

/**
 * 해안까지 거리(m). worldSample 은 섬에서 멀면(1.5r 밖) 대충 값(1.5r − 거리)을 주고 아주 멀면 섬을 아예 안 본다 —
 * 먼바다/심해를 가르려고 섬 중심 거리에서 가장 큰 해안 반경(1.25r)을 뺀 아래 한계와 견줘 큰 쪽을 쓴다.
 */
function seaOff(x: number, z: number, near: number): number {
  let lo = Infinity;
  for (const d of Island.ISLANDS) lo = Math.min(lo, Math.hypot(x - d.x, z - d.z) - d.r * 1.25);
  return Math.max(near, lo);
}

/** 호수 안 구역(언 호수는 얼음 구멍이면 icehole) */
function lakeZone(L: LakeInfo, x: number, z: number): string {
  if (L.frozen) {
    for (const q of L.holes) if (dist(q, x, z) < q.r + 0.3) return 'icehole';
    return 'icelake';
  }
  return prep().lakeZone.get(L.id) ?? L.kind;
}

/** 섬 안 물(호수 말고): 산호빛섬은 석호·맹그로브·정글 개울, 나머지는 폭포·하구·강 */
function flowZone(d: IslandDef, x: number, z: number, coast: number): string {
  const Z = prep();
  if (d.theme === 'coral') {
    if (near(Z.jungleHill, x, z)) return 'stream';
    return dist(d, x, z) / d.r < 0.47 ? 'lagoon' : 'mangrove';
  }
  for (const f of Z.falls) if (f.island === d.id && dist(f, x, z) < FALL_R) return 'waterfall';
  if (d.id === 'home' && coast < ESTUARY_COAST) return 'estuary';
  return 'river';
}

/** 땅 구역: 섬마다 5구역(GDD 2.2) + 지형 특징 */
function landZone(d: IslandDef, x: number, z: number, kind: string, coast: number): string {
  const Z = prep();
  const b = bearing(d.x, d.z, x, z);
  const rc = dist(d, x, z) / d.r;
  const steep = kind === 'cliff' || kind === 'rock';
  switch (d.theme) {
    case 'home': {
      // ① 말랑마을 반도(남) ② 폭포 강 숲(중앙) ③ 꽃잎 언덕(북동) ④ 과수원 평원(서) ⑤ 등대 곶(북, 절벽)
      if (steep) return 'rock';
      if (kind === 'sand') return 'beach';
      if (sector(b, 15, 85) && rc > 0.25) return near(Z.heartpond, x, z, 3) ? 'sakura' : 'flower';
      if (sector(b, 325, 15) && rc > 0.55) return 'rock';
      if (sector(b, 215, 325) && rc > 0.3) return 'orchard';
      if (sector(b, 130, 215) && rc > 0.6) return 'flower';
      if (rc < 0.4) return 'tree';
      return 'grass';
    }
    case 'dino': {
      // ① 해안 정글(남·서) ② 초원 계곡(중앙) ③ 화산 기슭(북·동) ④ 늪(동남) ⑤ 둥지 절벽(북서 해안)
      if (kind === 'lava') return 'lava';
      const V = Z.volcano;
      if (V) {
        const rv = dist(V, x, z) / d.r;
        if (rv < 0.11) return 'crater';
        if (rv < 0.42 * 0.92) return 'volcano';
      }
      if (near(Z.tinoHill, x, z, 1.3) || near(Z.meadow, x, z)) return 'ranch';
      if (sector(b, 280, 345) && rc > 0.55) return 'fossil';
      if (steep) return 'rock';
      return 'fern';
    }
    case 'ice': {
      // ① 펭귄 해변(남동) ② 눈사람 마을·간헐천(중앙) ③ 얼음 호수(서) ④ 설산 슬로프(북) ⑤ 오로라 언덕(북서)
      for (const c of Z.iceCaves) if (dist(c, x, z) < c.r) return 'icecave';
      if (near(Z.geyser, x, z, 1.2)) return 'cabin';
      if (kind === 'sand') return 'beach';
      if (sector(b, 280, 335) && rc > 0.35) return 'aurorahill';
      if (sector(b, 320, 60) && rc < 0.85) return steep ? 'snow' : 'snowtree';
      return 'snow';
    }
    case 'mushroom': {
      // ① 버섯 마을(동) ② 거대 버섯숲(중앙) ③ 반딧불 늪(남) ④ 안개 호수(서) ⑤ 뿌리 계곡(북)
      if (rc < 0.1) return 'tower';
      if (sector(b, 205, 250) && coast < 35) return 'shipwreck';
      if (kind === 'sand') return 'beach';
      if (sector(b, 130, 235) && rc > 0.35) return 'swamp';
      if (sector(b, 235, 305) && rc > 0.35) return 'foglake';
      if (sector(b, 315, 45) && rc > 0.3) return 'giant';
      if (sector(b, 45, 130) && rc > 0.45) return 'mushroom';
      return 'shade';
    }
    case 'coral': {
      // ① 야자 해변(북) ② 무지개 석호(중앙) ③ 정글 폭포(서) ④ 맹그로브 수로(동) ⑤ 산호초 고리(바다)
      if (near(Z.jungleHill, x, z)) return 'jungle';
      if (sector(b, 45, 135) && rc > 0.3) return 'mangrove';
      if (kind === 'sand') return 'beach';
      if (kind === 'jungle') return 'jungle';
      return 'palm';
    }
    case 'desert': {
      // ① 오아시스 바자르(서) ② 모래 언덕(중앙) ③ 협곡 미로(북) ④ 피라미드 유적(동) ⑤ 화석층 절벽(남)
      if (near(Z.canyon, x, z)) return 'cave';
      if (near(Z.fossilCliff, x, z) || (sector(b, 140, 220) && rc > 0.6)) return 'fossil';
      for (const L of Z.oasis) {
        const dd = dist(L, x, z);
        if (dd < L.r + 25) return 'oasis';
        if (dd < L.r + 90) return 'desertgrass';
      }
      if (sector(b, 230, 310)) return 'desertgrass';
      if (sector(b, 60, 130) && rc > 0.3) return 'ruin';
      if (rc < 0.3) return 'dune';
      if (sector(b, 130, 230)) return 'cactus';
      if (sector(b, 20, 60)) return 'pit';
      return 'sand';
    }
    case 'launch': {
      // ① 바람개비 초원(남) ② 발사장 메사(중앙) ③ 크레이터 호수(동) ④ 천문대 언덕(북) ⑤ 운석 정원(서)
      if (dist(Z.launchPad, x, z) < 30) return 'tower';
      if (near(Z.launchPad, x, z)) return 'pad';
      if (near(Z.pengLab, x, z)) return 'antenna';
      if (near(Z.crater, x, z)) return 'crater';
      if (near(Z.observatory, x, z)) return 'telescope';
      if (sector(b, 20, 90) && coast < 60) return 'wreckshore';
      if (sector(b, 135, 225) && rc > 0.35) return 'meadow';
      return 'hill';
    }
    default:
      return kind === 'sand' ? 'beach' : 'palm';
  }
}

/**
 * 구역 판정. lms 를 주면 그 랜드마크 둘레(최대 40 m) 땅 구역을 덮어쓴다(피라미드·버섯 탑·할미벚 …).
 * 바다면 sea 가 채워지고, 섬 안(호수·강·땅)이면 sea = null.
 */
export function zoneAt(x: number, z: number, lms?: readonly Landmark[]): ZoneInfo {
  const s = Island.worldSample(x, z);
  let isl: IslandDef | null = s.island;
  let coast = s.coast;
  // 마을 반도: island.ts 가 마을 해안·강을 세계에 합친다
  if (nearVillage(x, z)) {
    const f = Island.fieldAt(x, z);
    coast = f.coast;
    if (coast >= 0 && s.coast < 0) {
      return {
        island: 'home', theme: 'home', sea: null,
        zone: f.river < Island.RIVER_HALF_W + 0.2 ? 'river' : landmarkZone(lms, 'home', x, z) ?? 'flower',
      };
    }
    if (coast >= 0 && f.river < Island.RIVER_HALF_W + 0.2 && isl?.id === 'home') return { island: 'home', theme: 'home', zone: 'river', sea: null };
  }
  if (!isl || coast < 0) {
    const { sea, zone } = seaZone(x, z, seaOff(x, z, isl ? -coast : 0), isl);
    return { island: isl?.id ?? null, theme: isl?.theme ?? 'sea', zone, sea };
  }
  const base = { island: isl.id, theme: isl.theme as string, sea: null };
  const L = Island.lakeAt(x, z);
  if (L && L.island === isl.id) return { ...base, zone: lakeZone(L, x, z) };
  if (s.water !== undefined && s.water > s.h) return { ...base, zone: flowZone(isl, x, z, coast) };
  return { ...base, zone: landmarkZone(lms, isl.id, x, z) ?? landZone(isl, x, z, s.kind, coast) };
}

/** 테스트·디버그: 미리 계산한 판정 표 비우기(지형 표가 바뀌는 일은 없지만 핫 리로드용) */
export function resetZoneCache() { prepCache = null; }
