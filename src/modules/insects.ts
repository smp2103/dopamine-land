// 곤충(GDD 3.6 P0): 플레이어 주변 64m 청크(반경 100)마다 구역·시간·날씨 후보에서 econ.rollCatch 로 2~5마리.
// 같은 청크·같은 날·같은 4시간 묶음이면 같은 곤충, 시간대(날씨)가 바뀌면 다시 뽑는다.
// 달리면 4~8m, 걸으면 1.5~4m 에서 도망(경계심 ∝ ★·겁) · 메뚜기는 2~3m 폴짝 · 나무 흔들기/돌 두드리기에 숨은 곤충이 20초 나온다.
// E = 잠자리채 0.35초 휘두르기(앞 60° · 2.2m, 좋은 채 +30%) → 잡았다 / 놓치면 도망 + econ.catchFail('bug').
// 벌집 이벤트 → 벌떼가 5초 쫓아온다: 닿으면 act('stung', 3) + 'stung', 잡으면 꿀벌 + 꿀 3 + 은 열쇠 조각 1.
// 두근 게이지(pity('bug').gauge) 80% 를 넘으면 잠자리채가 분홍으로 반짝 — "곧 뭔가 온다".
// 그리기: 종마다 InstancedMesh(몸·날개)를 돌려 쓴다 → draw call 은 곤충 수가 아니라 '근처에 보이는 종 수'만큼.
// 규칙(숫자)은 insects/logic.ts, 벌떼는 insects/swarm.ts — 둘 다 순수(테스트가 바로 부른다).
// P1(insects/p1.ts 규칙 + insects/p1world.ts 연출): 반딧불 군무(버섯섬 늪 밤 30마리, 목요일 대축제 90) · 반딧불 놓아주기('insects-release' F)
//   · 곤충 씨름('insects-sumo' E, 말랑섬 마을 서쪽 그루터기) · 쇠똥구리 따라가기('insects-dung' E → 은상자) · 난초사마귀 위장(1.5m 안에서 들통).
// 저장: flags.insects = { released, sumo: {day, wins, streak, total, best, bouts}, dung: {섬: 판 날} }.
// 디버그: window.__insects = { spawnAt(id, x?, z?), catchNear(), bugs(), swing(), beehive(x?, z?), shake(x?, z?), hit(x?, z?),
//   swarm(), net(), reroll(), gallery(from, count),
//   P1: dance(), danceGo(festival?), festival(on), release(), released(), sumo(), sumoGo(), sumoTap(grade?), sumoState(),
//   dung(island?), dungSkip(), dungDig(), dungState(), arena(), orchid(x?, z?) }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import type { RollQuery, RollResult, ZoneInfo } from '../core/api';
import { applyCurve } from '../core/curve';
import { onEvent } from '../core/events';
import * as Data from './insects/data';
import { INSECTS, themeOf, type BugSpecies, type BugSpot, type BugTod, type BugIsland } from './insects/data';
import { makeBug, setWings, bugScale, type BugMesh } from './insects/model';
import { Bag, addPerch, type Anchor } from './insects/perch';
import * as L from './insects/logic';
import * as P1 from './insects/p1';
import { installP1 } from './insects/p1world';
import {
  makeSwarm, stepSwarm, catchSwarm, swarmActive, swarmFade, beePos, applySting, swarmRewards, SWARM,
  type Swarm, type StingSink, type RewardSink,
} from './insects/swarm';

export const order = 30;

/** 이 거리 안 곤충만 그리고 움직인다(멀리 있는 건 점 하나도 안 된다) */
const SHOW_DIST = 40;
/** 잡거나 도망간 자리를 다시 채우는 시간(초) */
const REFILL_SEC = 45;
/** 한 프레임에 다시 뽑는 청크 수(시간대가 바뀔 때 끊김 없게) */
const REROLL_PER_FRAME = 2;
/** 천장·오늘 첫 잡기로 올라간 곤충이 동시에 이만큼까지만 */
const MAX_SPECIAL = 2;

const SPOTS: readonly BugSpot[] = ['flower', 'tree', 'rock', 'ground', 'water', 'air'];
const PERCH_SPOTS = new Set<BugSpot>(['flower', 'tree', 'rock']);
const FLIERS = new Set(['butterfly', 'moth', 'dragonfly', 'damselfly', 'bee', 'firefly', 'wasp']);

/** data 가 새 자리 이름을 넣어도 버티게(모르면 땅) */
const normSpot = (s: string | undefined): BugSpot => (SPOTS as readonly string[]).includes(s ?? '') ? (s as BugSpot) : 'ground';

function todOfName(name: string): BugTod {
  return name === 'morning' || name === 'sunset' || name === 'night' ? name : 'day';
}
/** env 가 없을 때 시간대 → 대표 시각 */
const TOD_HOUR: Record<BugTod, number> = { morning: 7, day: 12, sunset: 19, night: 23 };

/** 을/를 */
function josa(word: string, a: string, b: string) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return b;
  return (c - 0xac00) % 28 ? a : b;
}

const LINES: Record<string, string[]> = {
  butterfly: ['팔랑팔랑~ 날개가 반짝반짝!', '꽃향기가 솔솔 나요!', '살금살금 작전 성공!'],
  moth: ['복슬복슬 솜뭉치 겟!', '밤 산책 친구를 만났다!'],
  dragonfly: ['하늘 순찰대장을 잡았다!', '눈이 엄청 커! 나를 보고 있어!'],
  damselfly: ['바늘처럼 가느다래!', '사뿐사뿐 잡았다!'],
  bee: ['붕붕~ 꿀 냄새가 나!', '쏘지 마~ 친구 하자!'],
  wasp: ['쏘지 않겠다고 약속했지?', '붕붕~ 순한 벌이었어!'],
  beetle: ['반질반질 보석 같아!', '오늘의 반짝이 챔피언!'],
  ladybug: ['행운이 왔다!', '점이 몇 개인지 세어 볼까?'],
  stag: ['집게가 멋져! 기사님 등장!', '힘자랑 대회 나가자!'],
  rhino: ['뿔이 우와~ 진짜 멋져!', '숲속의 장사를 잡았다!'],
  cicada: ['맴맴! 귀가 멍~', '여름 노래를 잡았다!'],
  grasshopper: ['폴짝! 이번엔 내가 빨랐지!', '풀숲의 점프왕 겟!'],
  cricket: ['귀뚤귀뚤~ 밤의 바이올린!', '폴짝! 잡았다!'],
  mantis: ['기도하는 손 귀여워!', '쿵후 고수를 잡았다!'],
  firefly: ['손안에 작은 등불이 생겼다!', '반짝반짝 밤의 별!'],
  ant: ['영차영차 일꾼 겟!', '작아도 힘은 장사!'],
  spider: ['눈이 반칙이야… 너무 귀여워!', '거미줄 건축가 등장!'],
  snail: ['느긋느긋 여행자 겟!', '집째로 따라왔네!'],
  strider: ['물 위의 스케이터!', '쓱쓱~ 잡았다!'],
  snowbug: ['차가워! 눈 결정이 반짝!', '똑같은 결정은 하나도 없대!'],
  sporebug: ['포자가 퐁퐁!', '버섯 모자 너무 귀여워!'],
  scorpion: ['집게 번쩍! 근데 순해!', '사막의 친구 겟!'],
  dungbeetle: ['영차! 공은 두고 가렴~', '힘센 공 굴리기 선수!'],
  pillbug: ['데구루루~ 공이 됐다!', '수줍음쟁이 겟!'],
  caterpillar: ['냠냠 잎사귀 먹보!', '언젠가 멋진 나비가 될 거야!'],
  stick: ['찾았다! 숨바꼭질 챔피언!', '나뭇가지인 줄 알았지?'],
  leaf: ['잎맥까지 똑같아! 대단해!', '바스락~ 잎사귀 친구!'],
  puff: ['몽글몽글 솜뭉치!', '톡톡! 눈밭의 점프왕!'],
  crust: ['집게가 쪼꼬미!', '새 집이 마음에 드니?'],
};

/** 곤충 하나(데이터 — 그리기는 종별 인스턴스가 한다) */
interface Bug {
  uid: number;
  sp: BugSpecies;
  res: RollResult;
  special: boolean;
  beh: L.Behavior;
  spot: BugSpot;
  theme: BugIsland;
  anchor: Anchor;
  /** 물 위면 수면 높이 */
  waterY: number;
  state: 'idle' | 'hop' | 'flee' | 'gone';
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  baseQ: THREE.Quaternion;
  /** 세로 숨쉬기(앉은 곤충) */
  sy: number;
  wing: number;
  ph: number;
  born: number;
  fleeT0: number;
  fleeFrom: THREE.Vector3;
  fleeDir: THREE.Vector3;
  hopT0: number;
  hopFrom: THREE.Vector3;
  hopTo: THREE.Vector3;
  hopCool: number;
  chunk: ChunkRec | null;
  /** 숨은 곤충: 나온 방식(나무·돌), 나온 시각 */
  hide: L.HideTrigger | null;
  hideBorn: number;
  /** 이 시각이 지나면 사라진다(숨은 곤충 20초·디버그 곤충) */
  until: number;
}

interface ChunkRec {
  cx: number; cz: number; x0: number; z0: number; size: number;
  group: THREE.Group;
  perch: THREE.Mesh | null;
  bugs: Bug[];
  /** 잡혀서 빈 자리(꽃·그루터기·바위) — 다시 채울 때 쓴다 */
  free: Array<{ spot: BugSpot; anchor: Anchor; theme: BugIsland }>;
  gen: string;
  dirty: boolean;
  refillAt: number;
  refills: number;
}

/** 종 하나 그리기: 템플릿 곤충의 메시마다 InstancedMesh 하나(같은 지오·재질은 묶는다 — 좌우 날개 = 1) */
interface DrawGroup {
  im: THREE.InstancedMesh;
  members: THREE.Mesh[];
  wing: boolean;
  /** 날개가 아닌 부품의 루트 기준 행렬 */
  fixed: THREE.Matrix4[];
}
interface Draw {
  sp: BugSpecies;
  tpl: BugMesh;
  groups: DrawGroup[];
  n: number;
  cap: number;
  hasWings: boolean;
}

interface EnvNow { day: number; hour: number; tod: BugTod; noon: boolean; midnight: boolean; weather: string; fullMoon: boolean }

/** data.poolFor({island, zone, spot, hour, tod, noon, midnight, weather, fullMoon, visiting}) — insects-data 가 채운다 */
type PoolQuery = {
  island: string | null; theme?: string; zone?: string | null; spot?: BugSpot; hour: number; tod: BugTod; noon: boolean; midnight: boolean;
  weather: string; fullMoon: boolean; visiting: boolean;
  /** 숨은 곤충 꺼내기(나무 흔들기 'tree' · 돌 두드리기 'rock' · 모래 구덩이 'pit') — 안 주면 숨는 종은 빠진다 */
  reveal?: string | null;
};
const poolFor = (Data as unknown as { poolFor?: (q: PoolQuery) => BugSpecies[] }).poolFor;

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return; // 룩 테스트 모드엔 곤충을 내보내지 않는다(마을 장면 그대로)
  const g: Game = game;
  const { island } = ctx;
  g.state.register(INSECTS);
  // 은퇴한 옛 곤충 id: 저장(가방·도감)에 남아 있는 것만 등록 — 이름·값이 계속 보이게(새로 나오진 않는다)
  {
    const held = Data.LEGACY_INSECTS.filter((s) => (g.state.bag[s.id] ?? 0) > 0 || !!g.state.dex[s.id]);
    if (held.length) g.state.register(held);
  }

  const root = new THREE.Group();
  root.name = 'insects';
  // P1 연출(군무·놓아주기·씨름·쇠똥구리·난초 꽃) — 자기 onUpdate·상호작용을 따로 건다
  const p1 = installP1({ ctx, g, root, byId: (id) => Data.insectOf(id) ?? Data.insectOf(id.replace(/^bug-/, '')) });
  let todName: BugTod = todOfName(ctx.tod);
  const chunks = new Set<ChunkRec>();
  const hidden: Bug[] = [];
  let uidN = 0;
  let catches = 0;
  let hideN = 0;
  let localCombo = 0;

  // ───────────── 지금 시각·날씨·구역 ─────────────
  const envNow = (): EnvNow => {
    const e = g.env;
    const tod = e?.tod ? todOfName(e.tod) : todName;
    const hour = typeof e?.hour === 'number' ? e.hour : TOD_HOUR[tod];
    return {
      day: e?.day ?? 0, hour, tod,
      noon: e?.noon ?? (hour >= 11 && hour < 13), midnight: e?.midnight ?? (hour >= 0 && hour < 2),
      weather: e?.weather ?? 'clear', fullMoon: !!e?.fullMoon,
    };
  };
  const genOf = (E: EnvNow) => `${E.day}:${L.blockOf(E.hour)}:${E.tod}:${E.weather}`;

  const zoneOf = (x: number, z: number, islandId: string | null): ZoneInfo => {
    try {
      const zi = g.geo?.zoneAt(x, z);
      if (zi) return zi;
    } catch (e) { console.error('[insects geo.zoneAt]', e); }
    const th = themeOf(islandId);
    return { island: islandId, theme: th ?? 'sea', zone: 'flower', sea: null };
  };

  const weatherOk = (sp: BugSpecies, w: string) => {
    const ws = sp.where;
    if (!ws || !ws.length) return true;
    return ws.some((r) => !r.weather?.only || !r.weather.only.length || (r.weather.only as string[]).includes(w));
  };
  let poolWarned = false;
  /** 이 자리·지금 시간·날씨에 나올 수 있는 종(미리 거른 후보). zone:null = 구역을 안 본다(섬 전체) */
  const poolAt = (zi: ZoneInfo, x: number, z: number, E: EnvNow, o: { zone?: string | null; reveal?: string } = {}): BugSpecies[] => {
    let weather = E.weather;
    try { weather = g.env?.regionWeather?.(x, z) ?? E.weather; } catch { /* 지역 날씨가 없으면 플레이어 날씨 */ }
    if (poolFor) {
      try {
        const r = poolFor({
          island: zi.island, theme: zi.theme, zone: o.zone === undefined ? zi.zone : o.zone, hour: E.hour, tod: E.tod, noon: E.noon, midnight: E.midnight,
          weather, fullMoon: E.fullMoon, visiting: !!g.ext?.net?.visiting, reveal: o.reveal ?? null,
        });
        if (Array.isArray(r)) return r;
      } catch (e) {
        if (!poolWarned) { poolWarned = true; console.error('[insects poolFor]', e); }
      }
    }
    // poolFor 가 아직 없으면: 섬 테마 + 시간대 + 날씨 전용만
    const th = themeOf(zi.island);
    if (!th) return [];
    return INSECTS.filter((s) => s.islands.includes(th) && s.tods.includes(E.tod) && weatherOk(s, weather)
      && (o.reveal ? L.hideTriggerOf(s) === o.reveal : true));
  };
  /** 청크 스포너 후보: 보통 종 + 모래 구덩이 종(개미귀신 — 구덩이에서 늘 고개를 내민다) */
  const spawnPool = (zi: ZoneInfo, x: number, z: number, E: EnvNow) => {
    const a = poolAt(zi, x, z, E);
    const pit = poolFor ? poolAt(zi, x, z, E, { reveal: 'pit' }) : [];
    return pit.length ? [...a, ...pit.filter((p) => !a.some((s) => s.id === p.id))] : a;
  };
  /** 높이 조건(왕관나비 15m+): 그 높이 이상인 땅에서만 */
  const altOk = (sp: BugSpecies, y: number) => !(typeof sp.minAlt === 'number' && sp.minAlt > 0) || y >= sp.minAlt;

  // ───────────── 잠자리채 등급·두근 게이지(0.5초마다) ─────────────
  let tier: L.NetTier = 'net';
  let gauge = 0;
  const readTier = () => {
    const econ = g.econ;
    tier = L.netTier(econ?.isUnlocked ? (k) => econ.isUnlocked(k) : null);
  };
  const readGauge = () => {
    try { gauge = g.econ?.pity?.('bug')?.gauge ?? 0; } catch { gauge = 0; }
  };

  // ───────────── 굴림 ─────────────
  let specialsLive = 0;
  /** 미리 굴리기(commit:false) — 잡았을 때 reportCatch 로 천장·콤보를 반영한다 */
  const roll = (pool: BugSpecies[], rnd: () => number, allowSpecial: boolean): { res: RollResult; sp: BugSpecies } | null => {
    if (!pool.length) return null;
    let res: RollResult | null = null;
    const econ = g.econ;
    if (econ?.rollCatch) {
      const q: RollQuery & { commit: boolean } = { activity: 'bug', pool, rng: rnd, luckMult: L.netLuck(tier), commit: false };
      try { res = econ.rollCatch(q); } catch (e) { console.error('[insects rollCatch]', e); res = null; }
      if (res && L.isSpecialRoll(res) && (!allowSpecial || specialsLive >= MAX_SPECIAL)) res = L.localRoll(pool, rnd);
    }
    if (!res || !res.species) res = L.localRoll(pool, rnd);
    const sp = res.species ? pool.find((s) => s.id === res!.species!.id) ?? null : null;
    if (!sp) return null;
    return { res: { ...res, species: sp }, sp };
  };

  // ───────────── 곤충 만들기 ─────────────
  const newBug = (sp: BugSpecies, res: RollResult, spot: BugSpot, theme: BugIsland, anchor: Anchor, waterY: number, rnd: () => number, chunk: ChunkRec | null): Bug => {
    const z = anchor.fwd.clone().normalize();
    const y = anchor.up.clone().normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    const z2 = new THREE.Vector3().crossVectors(x, y).normalize();
    const baseQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z2));
    const special = L.isSpecialRoll(res);
    if (special) specialsLive++;
    return {
      uid: ++uidN, sp, res, special, beh: L.behaviorOf(sp), spot, theme, anchor, waterY,
      state: 'idle', pos: anchor.pos.clone(), quat: baseQ.clone(), baseQ, sy: 1, wing: 0, ph: rnd() * 100, born: g.time,
      fleeT0: 0, fleeFrom: new THREE.Vector3(), fleeDir: new THREE.Vector3(),
      hopT0: 0, hopFrom: new THREE.Vector3(), hopTo: new THREE.Vector3(), hopCool: 0,
      chunk, hide: null, hideBorn: 0, until: Infinity,
    };
  };

  const VB = island.ISLAND_BOUNDS;
  const inVillage = (x: number, z: number) => x > VB.minX - 4 && x < VB.maxX + 4 && z > VB.minZ - 4 && z < VB.maxZ + 4;
  const slopeAt = (x: number, z: number) => {
    const e = 0.6;
    return Math.hypot(island.heightAt(x + e, z) - island.heightAt(x - e, z), island.heightAt(x, z + e) - island.heightAt(x, z - e)) / (2 * e);
  };

  /** 청크 안 한 자리에 한 마리 — 자리(물·땅)를 먼저 보고, 그 자리에 앉을 수 있는 종만 후보로 굴린다 */
  const spawnOne = (rec: ChunkRec, rnd: () => number, E: EnvNow, bag: Bag | null, allowSpecial: boolean): Bug | null => {
    const { x0, z0, size } = rec;
    const taken = new Set(rec.bugs.map((b) => b.sp.id));
    // ① 빈 자리(잡힌 곤충의 꽃·그루터기)가 있으면 거기부터
    if (!bag && rec.free.length) {
      const k = Math.floor(rnd() * rec.free.length);
      const f = rec.free[k];
      const zi = zoneOf(f.anchor.pos.x, f.anchor.pos.z, null);
      const pool = spawnPool(zi, f.anchor.pos.x, f.anchor.pos.z, E).filter((s) => L.spawnable(s) && normSpot(s.spot) === f.spot && altOk(s, f.anchor.pos.y));
      const r = roll(pool.filter((s) => !taken.has(s.id)).length ? pool.filter((s) => !taken.has(s.id)) : pool, rnd, allowSpecial);
      if (r) {
        rec.free.splice(k, 1);
        const a: Anchor = { pos: f.anchor.pos.clone(), up: f.anchor.up.clone(), fwd: f.anchor.fwd.clone() };
        return newBug(r.sp, r.res, f.spot, f.theme, a, -Infinity, rnd, rec);
      }
    }
    for (let tries = 0; tries < 10; tries++) {
      const x = x0 + 2 + rnd() * (size - 4), z = z0 + 2 + rnd() * (size - 4);
      if (Math.hypot(x - island.HERO.player.x, z - island.HERO.player.z) < 4) continue;
      if (rec.bugs.some((b) => Math.hypot(b.anchor.pos.x - x, b.anchor.pos.z - z) < 5)) continue;
      const s = island.surfaceAt(x, z);
      const theme = themeOf(s.island);
      if (!theme) continue;
      let allowed: BugSpot[];
      let waterY = -Infinity;
      if (s.kind === 'sea' || s.kind === 'river') {
        const wl = island.waterLevelAt(x, z);
        if (!Number.isFinite(wl)) continue;
        const depth = wl - s.h;
        if (depth < 0.12 || depth > 2.4) continue;
        if (s.kind === 'sea' && s.coastDist < -14) continue;
        allowed = ['water'];
        waterY = wl;
      } else if (s.kind === 'cliff') continue;
      else if (s.kind === 'lava') allowed = ['air'];
      else allowed = inVillage(x, z) ? ['air', 'ground'] : (bag ? ['flower', 'tree', 'rock', 'ground', 'air'] : ['ground', 'air']);
      const zi = zoneOf(x, z, s.island);
      const gy = island.heightAt(x, z);
      let pool = spawnPool(zi, x, z, E).filter((sp) => L.spawnable(sp) && allowed.includes(normSpot(sp.spot)) && altOk(sp, gy));
      if (!pool.length) continue;
      // 같은 청크엔 되도록 다른 종(후보가 남으면)
      const fresh = pool.filter((sp) => !taken.has(sp.id));
      if (fresh.length) pool = fresh;
      const spot0 = normSpot(pool[0].spot);
      if (spot0 !== 'air' && spot0 !== 'water' && slopeAt(x, z) > 0.45) continue;
      const r = roll(pool, rnd, allowSpecial);
      if (!r) continue;
      const spot = normSpot(r.sp.spot);
      if (spot !== 'air' && spot !== 'water' && slopeAt(x, z) > 0.45) continue;
      const y = spot === 'water' ? waterY : island.heightAt(x, z);
      let anchor: Anchor;
      if (PERCH_SPOTS.has(spot) && bag) {
        anchor = addPerch(bag, { type: spot as 'flower' | 'tree' | 'rock', x, y, z, theme, rnd });
      } else {
        const a = rnd() * Math.PI * 2;
        anchor = { pos: new THREE.Vector3(x, y, z), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) };
      }
      return newBug(r.sp, r.res, spot, theme, anchor, waterY, rnd, rec);
    }
    return null;
  };

  const dropBug = (b: Bug) => {
    if (b.special) { specialsLive = Math.max(0, specialsLive - 1); b.special = false; }
    b.state = 'gone';
  };

  /** 청크 채우기(처음·시간대가 바뀔 때) — 자리(꽃·그루터기·바위)도 새로 */
  const populate = (rec: ChunkRec) => {
    for (const b of rec.bugs) dropBug(b);
    rec.bugs = [];
    rec.free = [];
    if (rec.perch) {
      rec.perch.removeFromParent();
      rec.perch.geometry.dispose();
      rec.perch = null;
    }
    const E = envNow();
    rec.gen = genOf(E);
    rec.dirty = false;
    rec.refills = 0;
    rec.refillAt = Infinity;
    const rnd = ctx.rng(L.chunkSeed(rec.cx, rec.cz, E.day, E.hour, E.tod));
    const n = L.bugsPerChunk(rnd);
    const bag = new Bag();
    let special = false;
    for (let i = 0; i < n; i++) {
      const b = spawnOne(rec, rnd, E, bag, !special);
      if (!b) continue;
      if (b.special) special = true;
      rec.bugs.push(b);
    }
    const pm = bag.mesh();
    if (pm) {
      pm.name = 'insect-perches';
      applyCurve(pm);
      rec.group.add(pm);
      rec.perch = pm;
    }
  };

  /** 잡혔거나 도망간 자리를 하나 다시 채운다(같은 시간대 안에서) */
  const refill = (rec: ChunkRec) => {
    rec.refillAt = Infinity;
    rec.bugs = rec.bugs.filter((b) => b.state !== 'gone');
    if (rec.bugs.length >= L.PER_CHUNK[1]) return;
    const E = envNow();
    const rnd = ctx.rng(`${L.chunkSeed(rec.cx, rec.cz, E.day, E.hour, E.tod)}:refill:${rec.refills++}`);
    const b = spawnOne(rec, rnd, E, null, !rec.bugs.some((x) => x.special));
    if (b) rec.bugs.push(b);
  };

  g.chunks.add({
    key: 'insects', size: L.CHUNK, radius: L.RADIUS, detail: true,
    build: ({ cx, cz, x0, z0, size }) => {
      const group = new THREE.Group();
      group.name = `insects ${cx},${cz}`;
      const rec: ChunkRec = { cx, cz, x0, z0, size, group, perch: null, bugs: [], free: [], gen: '', dirty: false, refillAt: Infinity, refills: 0 };
      populate(rec);
      chunks.add(rec);
      group.userData.insectChunk = rec;
      return group;
    },
    dispose: (o) => {
      const rec = o.userData.insectChunk as ChunkRec | undefined;
      if (!rec) return;
      chunks.delete(rec);
      for (const b of rec.bugs) { if (swing?.target === b) swing.target = null; dropBug(b); }
      rec.bugs = [];
      rec.perch?.geometry.dispose();
      rec.perch = null;
    },
  });

  // 시간대가 바뀌면 그 시간대 곤충으로 다시 뽑는다(env 가 없을 때도 이 이름으로)
  ctx.onTodChange((name) => { todName = todOfName(name); checkGen(true); });
  let genNow = genOf(envNow());
  function checkGen(force = false) {
    const k = genOf(envNow());
    if (!force && k === genNow) return;
    genNow = k;
    for (const rec of chunks) if (rec.gen !== k) rec.dirty = true;
  }

  // ───────────── 종별 인스턴스 그리기 ─────────────
  const draws = new Map<string, Draw>();
  const drawRoot = new THREE.Group();
  drawRoot.name = 'insect-draws';
  root.add(drawRoot);

  const makeIM = (src: THREE.Mesh, cap: number) => {
    const im = new THREE.InstancedMesh(src.geometry, src.material, Math.max(1, cap));
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;
    im.castShadow = false; // 그림자는 동그란 블롭(아래) — 그림자 패스 draw call 을 아낀다
    im.receiveShadow = true;
    im.renderOrder = src.renderOrder;
    im.visible = false;
    applyCurve(im);
    drawRoot.add(im);
    return im;
  };

  const drawFor = (sp: BugSpecies): Draw => {
    const hit = draws.get(sp.id);
    if (hit) return hit;
    const tpl = makeBug(sp, 1);
    tpl.root.position.set(0, 0, 0);
    tpl.root.quaternion.identity();
    tpl.root.scale.set(1, 1, 1);
    tpl.root.updateMatrixWorld(true);
    const wingSet = new Set<THREE.Object3D>([tpl.wl, tpl.wr].filter((m): m is THREE.Mesh => !!m));
    const byKey = new Map<string, DrawGroup>();
    const cap = 4;
    tpl.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const wing = wingSet.has(m);
      const key = `${m.geometry.uuid}|${mats.map((x) => x.uuid).join(',')}|${wing ? 'w' : 's'}`;
      let gr = byKey.get(key);
      if (!gr) {
        gr = { im: null as unknown as THREE.InstancedMesh, members: [], wing, fixed: [] };
        byKey.set(key, gr);
      }
      gr.members.push(m);
      gr.fixed.push(m.matrixWorld.clone());
    });
    const groups = [...byKey.values()];
    for (const gr of groups) gr.im = makeIM(gr.members[0], cap * gr.members.length);
    const d: Draw = { sp, tpl, groups, n: 0, cap, hasWings: wingSet.size > 0 };
    draws.set(sp.id, d);
    return d;
  };

  const grow = (d: Draw) => {
    const cap = d.cap * 2;
    for (const gr of d.groups) {
      const old = gr.im;
      const im = makeIM(gr.members[0], cap * gr.members.length);
      (im.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      old.removeFromParent();
      old.dispose();
      gr.im = im;
    }
    d.cap = cap;
  };

  const touched = new Set<Draw>();
  const mW = new THREE.Matrix4(), mP = new THREE.Matrix4(), sV = new THREE.Vector3();
  /** 곤충 하나를 그 종 인스턴스에 넣는다(날개 각도는 템플릿에 걸어 읽는다) */
  const pushBug = (d: Draw, pos: THREE.Vector3, quat: THREE.Quaternion, sx: number, sy: number, sz: number, wing: number) => {
    if (d.n >= d.cap) grow(d);
    mW.compose(pos, quat, sV.set(sx, sy, sz));
    if (d.hasWings) {
      setWings(d.tpl, wing);
      d.tpl.root.updateMatrixWorld(true);
    }
    for (const gr of d.groups) {
      const k0 = d.n * gr.members.length;
      for (let k = 0; k < gr.members.length; k++) {
        mP.multiplyMatrices(mW, gr.wing ? gr.members[k].matrixWorld : gr.fixed[k]);
        gr.im.setMatrixAt(k0 + k, mP);
      }
    }
    d.n++;
    touched.add(d);
  };
  const finishDraws = () => {
    for (const d of touched) {
      for (const gr of d.groups) {
        gr.im.count = d.n * gr.members.length;
        gr.im.visible = d.n > 0;
        if (d.n > 0) gr.im.instanceMatrix.needsUpdate = true;
      }
      if (d.n === 0) touched.delete(d);
      d.n = 0;
    }
  };
  const modelOf = (sp: BugSpecies) => drawFor(sp).tpl.model;

  // ── 빛(반딧불이 꼬리·결정·포자): 점 하나 + 주변을 떠도는 작은 불빛들 ──
  const MAXP = 600;
  const gpos = new Float32Array(MAXP * 3), gcol = new Float32Array(MAXP * 3), gsize = new Float32Array(MAXP);
  const ggeo = new THREE.BufferGeometry();
  ggeo.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  ggeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
  ggeo.setAttribute('size', new THREE.BufferAttribute(gsize, 1));
  const gtex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = r; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const gmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { map: { value: gtex }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 color; varying vec3 vC;
      uniform float uScale;
      void main() {
        vC = color;
        vec3 transformed = position;
        #include <project_vertex>
        gl_PointSize = size * uScale / max( 0.5, -mvPosition.z );
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; varying vec3 vC;
      void main() {
        vec4 t = texture2D( map, gl_PointCoord );
        gl_FragColor = vec4( vC * t.a, t.a );
      }`,
  });
  const glowPts = new THREE.Points(ggeo, gmat);
  glowPts.frustumCulled = false;
  glowPts.renderOrder = 6;
  root.add(glowPts);

  // ── 블롭 그림자(땅·꽃·바위 위 곤충 아래 동그란 그림자 — 풀밭에서도 위치가 읽히게) ──
  const MAXS = 420;
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    // alphaMap 은 초록 채널을 읽는다 → 검정 바탕 위 회색 그라디언트(불투명)
    x.fillStyle = '#000'; x.fillRect(0, 0, 64, 64);
    r.addColorStop(0, 'rgb(175,175,175)');
    r.addColorStop(0.55, 'rgb(130,130,130)');
    r.addColorStop(1, 'rgb(0,0,0)');
    x.fillStyle = r; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  shadowGeo.userData.shared = true;
  const shadowMat = new THREE.MeshBasicMaterial({
    color: '#2c5a1e', alphaMap: shadowTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, MAXS);
  shadows.frustumCulled = false;
  shadows.renderOrder = 1;
  shadows.count = 0;
  applyCurve(shadows);
  root.add(shadows);
  let shN = 0;
  const shM = new THREE.Matrix4(), shQ = new THREE.Quaternion(), shS = new THREE.Vector3(), shP = new THREE.Vector3();
  const UPV = new THREE.Vector3(0, 1, 0);
  const pushShadow = (pos: THREE.Vector3, up: THREE.Vector3, size: number) => {
    if (shN >= MAXS) return;
    shQ.setFromUnitVectors(UPV, up);
    shS.set(size, 1, size * 0.86);
    shM.compose(pos, shQ, shS);
    shadows.setMatrixAt(shN++, shM);
  };

  // ── 반짝이(2~3초마다 곤충 머리 위에 별 하나 — "여기 있어요!") ──
  const MAXK = 300;
  const kpos = new Float32Array(MAXK * 3), kcol = new Float32Array(MAXK * 3), ksize = new Float32Array(MAXK), krot = new Float32Array(MAXK);
  const kgeo = new THREE.BufferGeometry();
  kgeo.setAttribute('position', new THREE.BufferAttribute(kpos, 3));
  kgeo.setAttribute('color', new THREE.BufferAttribute(kcol, 3));
  kgeo.setAttribute('size', new THREE.BufferAttribute(ksize, 1));
  kgeo.setAttribute('rot', new THREE.BufferAttribute(krot, 1));
  const ktex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const r = x.createRadialGradient(64, 64, 0, 64, 64, 40);
    r.addColorStop(0, 'rgba(255,255,255,0.9)');
    r.addColorStop(0.3, 'rgba(255,255,255,0.25)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = r; x.fillRect(0, 0, 128, 128);
    // 네 갈래 별
    x.fillStyle = '#ffffff';
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? 9 : 60;
      if (i === 0) x.moveTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr);
      else x.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr);
    }
    x.closePath(); x.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const kmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { map: { value: ktex }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute float rot; attribute vec3 color; varying vec3 vC; varying float vR;
      uniform float uScale;
      void main() {
        vC = color; vR = rot;
        vec3 transformed = position;
        #include <project_vertex>
        gl_PointSize = size * uScale / max( 0.5, -mvPosition.z );
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; varying vec3 vC; varying float vR;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float c = cos(vR), s = sin(vR);
        q = mat2(c, -s, s, c) * q + 0.5;
        vec4 t = texture2D( map, q );
        gl_FragColor = vec4( vC * t.a, t.a );
      }`,
  });
  const sparkPts = new THREE.Points(kgeo, kmat);
  sparkPts.frustumCulled = false;
  sparkPts.renderOrder = 7;
  root.add(sparkPts);
  let kN = 0;
  const sparkCol = new THREE.Color('#fff4c4');
  const pinkCol = new THREE.Color('#ff8fc8');
  const pushSpark = (pos: THREE.Vector3, size: number, k: number, rot: number, col: THREE.Color = sparkCol) => {
    if (kN >= MAXK) return;
    kpos[kN * 3] = pos.x; kpos[kN * 3 + 1] = pos.y; kpos[kN * 3 + 2] = pos.z;
    kcol[kN * 3] = col.r * k; kcol[kN * 3 + 1] = col.g * k; kcol[kN * 3 + 2] = col.b * k;
    ksize[kN] = size; krot[kN] = rot;
    kN++;
  };

  // ── 잠자리채(휘두를 때·곤충 앞에서 들고 있을 때 보인다). 등급마다 테 색, 두근 게이지 80%↑ 면 분홍 반짝 ──
  const net = new THREE.Group();
  net.name = 'insect-net';
  const HOOP_COL: Record<L.NetTier, string> = { none: '#ffd04a', net: '#ffd04a', good: '#7ec8ff', gold: '#ffcf3a' };
  const wood = new THREE.MeshPhysicalMaterial({ color: '#d79a5e', roughness: 0.55, clearcoat: 0.4 });
  const hoopM = new THREE.MeshPhysicalMaterial({ color: '#ffd04a', roughness: 0.35, clearcoat: 0.6, emissive: '#ff6fb5', emissiveIntensity: 0 });
  const bagM = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.8, side: THREE.DoubleSide, sheen: 1, depthWrite: false,
    emissive: '#ff8fc8', emissiveIntensity: 0,
  });
  const HOOP_C = new THREE.Vector3(0, 1.08, 0);
  {
    const stick = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.9, 4, 10), wood);
    stick.position.y = 0.45;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 10, 32), hoopM);
    hoop.position.copy(HOOP_C);
    const bagG = new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    bagG.scale(1, 1.6, 1);
    const bagMesh = new THREE.Mesh(bagG, bagM);
    bagMesh.position.copy(HOOP_C);
    bagMesh.rotation.x = Math.PI / 2;
    hoop.rotation.x = Math.PI / 2;
    for (const m of [stick, hoop]) m.castShadow = true;
    net.add(stick, hoop, bagMesh);
    net.visible = false;
    applyCurve(net);
  }
  let netHost: THREE.Object3D | null = null;
  let netTierShown: L.NetTier | null = null;
  let offeredAt = -1;

  // ───────────── 잡기 ─────────────
  let speedAvg = 0;
  let swing: { t0: number; target: Bug | null; swarm: boolean; hit: boolean; tier: L.NetTier } | null = null;
  let swarm: Swarm | null = null;
  let buzzAt = 0;

  const flee = (b: Bug, t: number) => {
    if (b.state === 'gone' || b.state === 'flee') return;
    b.state = 'flee';
    b.fleeT0 = t;
    b.fleeFrom.copy(b.pos);
    const p = g.player.pos;
    b.fleeDir.set(b.pos.x - p.x, 0, b.pos.z - p.z);
    if (b.fleeDir.lengthSq() < 1e-4) b.fleeDir.set(1, 0, 0);
    b.fleeDir.normalize();
  };

  const hop = (b: Bug, t: number) => {
    if (b.state !== 'idle' || t < b.hopCool) return;
    const p = g.player.pos;
    const rnd = ctx.rng(`insects:hop:${b.uid}:${Math.floor(t * 10)}`);
    let to = L.hopTarget(b.pos.x, b.pos.z, p.x, p.z, rnd);
    // 물·절벽으로는 뛰지 않는다 → 반대로 한 번 더
    const bad = (x: number, z: number) => {
      const s = island.surfaceAt(x, z);
      return s.kind === 'sea' || s.kind === 'river' || s.kind === 'cliff' || s.kind === 'lava';
    };
    if (b.spot !== 'water' && bad(to.x, to.z)) {
      to = { x: b.pos.x - (to.x - b.pos.x), z: b.pos.z - (to.z - b.pos.z), dist: to.dist };
      if (bad(to.x, to.z)) { flee(b, t); return; }
    }
    b.state = 'hop';
    b.hopT0 = t;
    b.hopFrom.copy(b.pos);
    b.hopTo.set(to.x, b.spot === 'water' ? b.waterY : island.heightAt(to.x, to.z), to.z);
  };

  /** 놀랐다: 메뚜기는 폴짝, 나머지는 도망 */
  const scare = (b: Bug, t: number) => {
    if (b.beh === 'hop' && b.state === 'idle') { hop(b, t); return; }
    if (b.state === 'idle' || b.state === 'hop') flee(b, t);
  };

  const removeBug = (b: Bug) => {
    dropBug(b);
    const rec = b.chunk;
    if (rec) {
      const i = rec.bugs.indexOf(b);
      if (i >= 0) rec.bugs.splice(i, 1);
      if (rec.refillAt === Infinity) rec.refillAt = g.time + REFILL_SEC;
    } else {
      const i = hidden.indexOf(b);
      if (i >= 0) hidden.splice(i, 1);
    }
  };

  const showModel = (sp: BugSpecies) => {
    const show = makeBug(sp, Math.min(1.1, Math.max(0.5, sp.size * 1.7)));
    if (show.model.wing) setWings(show, show.model.wing.rest * 0.4 + 0.2);
    show.root.rotation.y = Math.PI;
    applyCurve(show.root);
    return show.root;
  };

  const give = (id: string, n: number, why: string): number => {
    const econ = g.econ;
    if (econ?.give) {
      try { return econ.give(id, n, why); } catch (e) { console.error('[insects give]', e); }
    }
    g.state.addItem(id, n);
    return n;
  };

  /** 잡았다! — 미리 굴린 결과를 reportCatch 로 확정(천장·콤보·'catch') → 들어 올리기 */
  const catchBug = (b: Bug) => {
    const sp = b.sp;
    // 앉아 있던 자리(꽃·그루터기·바위)는 남겨 두고 다음에 다시 채운다
    if (b.chunk && PERCH_SPOTS.has(b.spot)) b.chunk.free.push({ spot: b.spot, anchor: b.anchor, theme: b.theme });
    removeBug(b);
    let res = b.res;
    const econ = g.econ;
    try {
      if (econ?.reportCatch) res = econ.reportCatch(b.res) ?? b.res;
      else g.state.emit({ type: 'catch', activity: 'bug', species: sp, rarity: sp.rarity, variant: res.variant, combo: ++localCombo });
    } catch (e) { console.error('[insects reportCatch]', e); }
    const rnd = ctx.rng(`insects:catch:${++catches}:${sp.id}`);
    const cm = L.sizeCm(res, sp.cm, rnd);
    const lines = LINES[sp.kind] ?? ['잡았다!'];
    const line = `${sp.name}${josa(sp.name, '을', '를')} 잡았다! ${lines[Math.floor(rnd() * lines.length)]}`;
    g.ui.showCatch({ species: sp, sizeText: `${cm.toFixed(1)}cm`, model: showModel(sp), line, size: cm, variant: res.variant, activity: 'bug' });
    // 덤(별가루나방 → 별가루 3 등, data 의 drop)
    const drop = (sp as { drop?: { id?: string; n?: number } }).drop;
    if (drop?.id) {
      const got = give(drop.id, drop.n ?? 1, 'bug-drop');
      if (got > 0) g.ui.toast(`덤으로 ${drop.id === 'm_stardust' ? '별가루' : '선물'} ×${got}!`);
    }
  };

  /** 놓쳤다 — 목표와 근처 친구들이 놀라 도망 + catch-fail */
  const miss = (target: Bug | null, t: number) => {
    const p = g.player.pos;
    if (target && target.state !== 'gone') {
      // 놓친 메뚜기도 이번엔 진짜 도망
      flee(target, t);
    }
    for (const b of liveBugs()) {
      if (b === target || b.state === 'gone') continue;
      if (Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < L.MISS_SCARE_R) scare(b, t);
    }
    L.reportFail(g as unknown as L.FailSink);
    g.ui.toast(speedAvg > L.MOVE.sneak ? '앗, 놓쳤다… 더 살금살금 다가가 보자!' : '앗, 놓쳤다…! 그물 안에 쏙 들어오게 휘둘러 봐요');
  };

  const liveBugs = function* (): Generator<Bug> {
    for (const rec of chunks) for (const b of rec.bugs) yield b;
    for (const b of hidden) yield b;
  };

  // ── 벌떼 ──
  let beeSp: BugSpecies | null | undefined;
  const honeybee = (): BugSpecies | null => {
    if (beeSp !== undefined) return beeSp;
    const s = g.state.byGdd?.('b_honeybee') as BugSpecies | undefined;
    beeSp = s && s.kind ? s : INSECTS.find((x) => x.gdd === 'b_honeybee' || x.id === 'b_honeybee') ?? INSECTS.find((x) => x.kind === 'bee') ?? null;
    return beeSp;
  };

  const startSwarm = (x: number, z: number) => {
    if (g.world !== 'earth' || swarmActive(swarm)) return;
    swarm = makeSwarm(x, island.heightAt(x, z), z, g.time);
    buzzAt = g.time + 0.8;
    g.ui.toast('벌떼다! 🐝 잠자리채로 잡거나 달려서 도망쳐요!');
  };

  const swarmCaught = () => {
    const bee = honeybee();
    const econ = g.econ;
    if (bee) {
      const res: RollResult = { species: bee, rarity: bee.rarity, combo: (econ?.combo ?? localCombo) + 1 };
      try {
        if (econ?.reportCatch) econ.reportCatch(res);
        else g.state.emit({ type: 'catch', activity: 'bug', species: bee, rarity: bee.rarity, combo: ++localCombo });
      } catch (e) { console.error('[insects reportCatch swarm]', e); }
      const rnd = ctx.rng(`insects:swarm:${++catches}`);
      const cm = L.sizeCm(null, bee.cm, rnd);
      g.ui.showCatch({
        species: bee, sizeText: `${cm.toFixed(1)}cm`, model: showModel(bee), size: cm, activity: 'bug',
        line: '벌떼를 몽땅 잡았다! 꿀 냄새가 솔솔~ 🍯',
      });
    }
    const isl = g.geo?.zoneAt(g.player.pos.x, g.player.pos.z)?.island ?? island.surfaceAt(g.player.pos.x, g.player.pos.z).island ?? 'home';
    const got = swarmRewards(g as unknown as RewardSink, isl);
    g.ui.toast(`꿀 ×${got.honey}${got.key ? ' · 은 열쇠 조각 +1 🔑' : ''}`);
  };

  const stung = () => {
    applySting(g as unknown as StingSink);
    g.ui.toast('아야! 벌에 쏘였어요… 얼굴이 퉁퉁 😵');
  };

  // ── 숨은 곤충(나무 흔들기·돌 두드리기) ──
  const spawnHidden = (trigger: L.HideTrigger, x: number, z: number, islandId: string | null) => {
    if (g.world !== 'earth') return null;
    const E = envNow();
    const zi = zoneOf(x, z, islandId);
    // 흔든 나무·두드린 돌이 어느 구역에 있든, 그 섬에서 이 계기로 나오는 종(구역은 안 본다)
    const pool = poolAt(zi, x, z, E, { zone: null, reveal: trigger });
    const p = g.player.pos;
    const rnd = ctx.rng(`insects:hide:${trigger}:${Math.round(x)},${Math.round(z)}:${E.day}:${hideN++}`);
    const plan = L.planHide(trigger, x, z, p.x, p.z, pool, rnd, {
      live: hidden.length,
      roll: (c, r) => roll(c as BugSpecies[], r, !hidden.some((h) => h.special))?.res ?? null,
    });
    if (!plan) return null;
    const sp = plan.species;
    const y = island.heightAt(plan.x, plan.z);
    const a = rnd() * Math.PI * 2;
    const anchor: Anchor = { pos: new THREE.Vector3(plan.x, y, plan.z), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) };
    const theme = themeOf(zi.island) ?? 'home';
    const b = newBug(sp, plan.res, 'ground', theme, anchor, -Infinity, rnd, null);
    b.hide = trigger;
    b.hideBorn = g.time;
    b.until = g.time + L.HIDE.sec;
    b.beh = 'hide';
    hidden.push(b);
    const known = !!g.state.dex[sp.id];
    const who = known ? sp.name : '무언가';
    g.ui.toast(trigger === 'tree' ? `나무에서 ${who}${josa(who, '이', '가')} 톡 떨어졌다! 얼른 잡자!` : `돌 밑에서 ${who}${josa(who, '이', '가')} 쏙 나왔다!`);
    return b;
  };

  onEvent(g.state, 'tree-shake', (e) => { spawnHidden('tree', e.x, e.z, e.island ?? null); });
  onEvent(g.state, 'rock-hit', (e) => { spawnHidden('rock', e.x, e.z, e.island ?? null); });
  onEvent(g.state, 'beehive', (e) => { startSwarm(e.x, e.z); });
  // 해금(잠자리채 사기·만들기)은 바로 반영
  g.state.on((e) => { if (e.type === 'unlock') readTier(); });

  // ── 휘두르기 ──
  const startSwing = (target: Bug | null, atSwarm: boolean) => {
    if (swing) return;
    readTier();
    if (tier === 'none') {
      g.ui.toast('잠자리채가 있어야 곤충을 잡을 수 있어요! 너굴 상점에 가 보자 🛒');
      return;
    }
    const p = g.player;
    const tx = atSwarm && swarm ? swarm.x : target?.pos.x;
    const tz = atSwarm && swarm ? swarm.z : target?.pos.z;
    if (tx !== undefined && tz !== undefined) p.yaw = Math.atan2(-(tx - p.pos.x), -(tz - p.pos.z));
    p.act('net', L.NET.swing + 0.25);
    p.lock('insects');
    swing = { t0: g.time, target, swarm: atSwarm, hit: false, tier };
  };
  const endSwing = () => {
    if (!swing) return;
    g.player.unlock('insects');
    swing = null;
  };

  g.addProvider('insects', (p) => {
    if (swing || g.world !== 'earth') return null;
    if (p.mode !== 'ground' || p.mounted) return null;
    // 안내는 정말 닿는 거리에서만 뜬다(E 를 눌렀는데 그물이 모자라면 억울하니까)
    const reach = Math.max(L.netRange(tier), L.NET.range);
    if (swarm && swarmActive(swarm)) {
      const d = Math.hypot(swarm.x - p.pos.x, swarm.z - p.pos.z);
      if (d < reach + SWARM.catchPad + 0.8) {
        if (tier !== 'none') offeredAt = g.time;
        return { label: L.netPrompt(tier, null, true), dist: d * 0.5, use: () => startSwing(null, true) };
      }
    }
    let best: Bug | null = null, bd = Infinity;
    for (const b of liveBugs()) {
      if (b.state !== 'idle' && b.state !== 'hop') continue;
      const dy = b.pos.y - p.pos.y;
      if (dy > L.NET.up || dy < -L.NET.down) continue;
      const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      if (d < reach && d < bd) { bd = d; best = b; }
    }
    if (!best) return null;
    const b = best;
    if (tier !== 'none') offeredAt = g.time;
    const known = !!g.state.dex[b.sp.id];
    // 꽃인 척하는 난초사마귀: 이름 대신 '수상한 꽃'
    const label = tier !== 'none' && P1.isOrchid(b.sp) && b.state === 'idle' ? P1.orchidPrompt(known) : L.netPrompt(tier, known ? b.sp.name : null);
    return { label, dist: bd + 0.3, use: () => startSwing(b, false) };
  });

  g.onWorld((w) => {
    if (w !== 'earth') {
      swarm = null; endSwing();
      // 숨어 있다 나온 곤충·디버그 곤충도 치운다(돌아왔을 때 그 자리에 다시 나타나지 않게)
      for (const b of hidden) dropBug(b);
      hidden.length = 0;
    }
  });

  // 사진 모드·인사 등록이 읽는 목격 목록(가까운 곤충만)
  g.witnesses?.add(() => {
    const out: Array<{ speciesId: string; pos: THREE.Vector3 }> = [];
    const p = g.player.pos;
    for (const b of liveBugs()) {
      if (b.state === 'gone') continue;
      // 꽃인 척하는 난초사마귀는 아직 '못 본' 것 — 들키기 전엔 사진·목격에 이름이 안 뜬다
      if (P1.isOrchid(b.sp) && b.state === 'idle') continue;
      if (Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 30) out.push({ speciesId: b.sp.id, pos: b.pos.clone() });
    }
    return out;
  });

  // ───────────── 움직임 ─────────────
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), qTmp = new THREE.Quaternion(), eul = new THREE.Euler();
  const lookQ = (dir: THREE.Vector3, bank = 0) => {
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = -Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 0.6;
    eul.set(pitch, yaw, bank, 'YXZ');
    return qTmp.setFromEuler(eul);
  };
  const groundY = (x: number, z: number) => {
    const wl = island.waterLevelAt(x, z);
    return Math.max(island.heightAt(x, z), Number.isFinite(wl) ? wl : -99);
  };

  /** 공중 경로(시간 t, 위상 ph) — 집 둘레 고리 */
  const airPath = (b: Bug, t: number, out: THREE.Vector3) => {
    const sp = b.sp;
    const kind = sp.kind;
    const hover = b.beh === 'hover';
    const fast = hover ? 0.55 : b.beh === 'glow' ? 0.22 : 0.32;
    const R = hover ? 3.2 : b.beh === 'glow' ? 1.6 : 2.2;
    let a = t * fast + b.ph;
    if (hover) {
      // 휙 날다가 멈추는 잠자리 비행
      const k = Math.floor(a), f = a - k;
      a = k + THREE.MathUtils.smootherstep(f, 0.15, 0.55);
    }
    const hx = b.anchor.pos.x, hz = b.anchor.pos.z;
    out.x = hx + Math.sin(a * 1.0) * R + Math.sin(a * 2.3 + 1) * R * 0.25;
    out.z = hz + Math.cos(a * 0.8) * R * 0.9 + Math.cos(a * 1.9) * R * 0.2;
    const baseH = b.beh === 'glow' ? 0.9 : hover ? 1.4 : 1.05;
    out.y = groundY(out.x, out.z) + baseH * (sp.size > 0.8 ? 2.2 : 1) + Math.sin(a * 1.7 + b.ph) * 0.35 + (kind === 'butterfly' ? Math.abs(Math.sin(t * 4.5 + b.ph)) * 0.12 : 0);
    return out;
  };

  const groundPath = (b: Bug, t: number, out: THREE.Vector3) => {
    const kind = b.sp.kind;
    const slow = kind === 'snail' ? 0.04 : b.beh === 'hop' ? 0.16 : b.hide ? 0.07 : 0.11;
    const R = kind === 'snail' ? 0.6 : b.hide ? 0.5 : 1.3;
    const a = t * slow + b.ph;
    out.x = b.anchor.pos.x + Math.sin(a) * R + Math.sin(a * 2.7) * 0.25 * (R / 1.3);
    out.z = b.anchor.pos.z + Math.cos(a * 0.85) * R;
    out.y = b.spot === 'water' ? b.waterY : island.heightAt(out.x, out.z);
    if (b.beh === 'hop') {
      const hp = (t * 0.7 + b.ph) % 1;
      out.y += hp < 0.3 ? Math.sin((hp / 0.3) * Math.PI) * 0.35 : 0;
    }
    return out;
  };

  /** 한 마리 자세 계산(b.pos·b.quat·b.sy·b.wing). 끝났으면(사라짐) false */
  const poseBug = (b: Bug, t: number): boolean => {
    const sp = b.sp;
    const w = modelOf(sp).wing;
    const flapT = t * (w?.hz ?? 0) * Math.PI * 2;
    b.sy = 1;
    if (b.state === 'flee') {
      const tau = t - b.fleeT0;
      const flier = FLIERS.has(sp.kind) || b.spot === 'air';
      tmp.copy(b.fleeFrom).addScaledVector(b.fleeDir, tau * (flier ? 5.5 : 2.6));
      if (flier) tmp.y += tau * 2.6 + tau * tau * 0.8;
      else tmp.y = b.spot === 'water' ? b.waterY : island.heightAt(tmp.x, tmp.z);
      b.pos.copy(tmp);
      tmp2.copy(b.fleeDir); if (flier) tmp2.y = 0.5;
      b.quat.copy(lookQ(tmp2));
      if (w) b.wing = w.rest * 0.2 + Math.sin(flapT) * Math.max(w.amp, 0.6);
      // 기는 곤충은 땅속으로 스르르(작아진다)
      b.sy = flier ? 1 : Math.max(0.01, 1 - Math.max(0, tau - 0.6) / 0.8);
      if (tau > 2.4) { removeBug(b); return false; }
      return true;
    }
    if (b.state === 'hop') {
      const k = (t - b.hopT0) / L.HOP.dur;
      const e = Math.min(1, k);
      tmp.lerpVectors(b.hopFrom, b.hopTo, e);
      tmp.y = (b.spot === 'water' ? b.waterY : island.heightAt(tmp.x, tmp.z)) + L.hopArc(e);
      b.pos.copy(tmp);
      tmp2.subVectors(b.hopTo, b.hopFrom); tmp2.y = 0;
      if (tmp2.lengthSq() > 1e-6) b.quat.copy(lookQ(tmp2.normalize()));
      if (w) b.wing = w.rest + Math.sin(flapT) * w.amp;
      if (k >= 1) {
        b.anchor.pos.copy(b.hopTo);
        b.state = 'idle';
        b.hopCool = t + L.HOP.cool;
      }
      return true;
    }
    // 대기 자세
    const kind = sp.kind;
    if (b.spot === 'air') {
      airPath(b, t, tmp);
      airPath(b, t + 0.06, tmp2);
      tmp2.sub(tmp);
      if (tmp2.lengthSq() < 1e-6) tmp2.set(0, 0, 1);
      b.pos.copy(tmp);
      b.quat.copy(lookQ(tmp2.normalize()));
      if (w) b.wing = kind === 'butterfly' || kind === 'moth' ? 0.12 + (0.5 + 0.5 * Math.sin(flapT)) * w.amp : w.rest + Math.sin(flapT) * w.amp;
    } else if ((b.spot === 'ground' || b.spot === 'water') && !P1.isOrchid(sp)) {
      // (난초사마귀는 땅에서도 꽃인 척 가만히 — 아래 '제자리' 갈래)
      groundPath(b, t, tmp);
      groundPath(b, t + 0.1, tmp2);
      tmp2.sub(tmp); tmp2.y = 0;
      if (tmp2.lengthSq() < 1e-8) tmp2.set(0, 0, 1);
      b.pos.copy(tmp);
      b.quat.copy(lookQ(tmp2.normalize()));
      // 걸음 통통
      b.pos.y += Math.abs(Math.sin(t * 9 + b.ph)) * 0.012;
      if (w) b.wing = w.rest + Math.sin(t * 1.4 + b.ph) * w.idleAmp;
    } else {
      // 꽃·그루터기·바위 위: 제자리 숨쉬기
      b.pos.copy(b.anchor.pos);
      if (kind === 'bee' && b.spot === 'flower') {
        // 꽃 위를 맴도는 벌
        const a = t * 1.4 + b.ph;
        b.pos.x += Math.cos(a) * 0.3;
        b.pos.z += Math.sin(a) * 0.3;
        b.pos.y += 0.22 + Math.sin(t * 2.3 + b.ph) * 0.06;
        tmp2.set(-Math.sin(a), 0, Math.cos(a));
        b.quat.copy(lookQ(tmp2));
        if (w) b.wing = w.rest + Math.sin(flapT) * w.amp;
      } else {
        b.quat.copy(b.baseQ);
        b.sy = 1 + Math.sin(t * 2.2 + b.ph) * 0.025;
        if (w) b.wing = w.rest + Math.sin(t * 1.4 + b.ph) * w.idleAmp;
      }
    }
    // 숨은 곤충: 나무에서 톡 떨어지고 / 돌 밑에서 쏙 — 20초 뒤 다시 숨는다
    if (t >= b.until) { removeBug(b); return false; }
    if (b.hide === 'tree') {
      const age = t - b.hideBorn;
      if (age < 0.4) b.pos.y += (1 - age / 0.4) * 1.6;
    }
    return true;
  };

  let ptsN = 0;
  const pushGlow = (p: THREE.Vector3, c: THREE.Color, size: number, k = 1) => {
    if (ptsN >= MAXP) return;
    gpos[ptsN * 3] = p.x; gpos[ptsN * 3 + 1] = p.y; gpos[ptsN * 3 + 2] = p.z;
    gcol[ptsN * 3] = c.r * k; gcol[ptsN * 3 + 1] = c.g * k; gcol[ptsN * 3 + 2] = c.b * k;
    gsize[ptsN] = size;
    ptsN++;
  };
  const swarmCol = new THREE.Color();
  const beeP = { x: 0, y: 0, z: 0 };
  const beeV = new THREE.Vector3(), beeQ = new THREE.Quaternion();
  let slowAt = 0;

  g.onUpdate((t, dt) => {
    const p = g.player;
    if (dt > 0) speedAvg += (p.speed - speedAvg) * Math.min(1, dt * 3);
    gmat.uniforms.uScale.value = ctx.renderer.domElement.height * 0.5;
    kmat.uniforms.uScale.value = ctx.renderer.domElement.height * 0.5;
    const tod = envNow().tod;
    const night = tod === 'night' ? 1 : tod === 'sunset' ? 0.55 : 0.25;

    // 0.5초마다: 해금·두근 게이지·시간대/날씨 묶음
    if (t >= slowAt || t < slowAt - 5) {
      slowAt = t + 0.5;
      readTier();
      readGauge();
      checkGen();
    }

    // 시간대가 바뀐 청크는 프레임마다 조금씩 다시 뽑는다(휘두르는 목표가 있는 청크는 끝날 때까지 기다린다)
    let rerolled = 0;
    for (const rec of chunks) {
      if (rerolled >= REROLL_PER_FRAME) break;
      if (rec.dirty) {
        if (swing?.target?.chunk === rec) continue;
        populate(rec);
        rerolled++;
      } else if (t >= rec.refillAt) refill(rec);
    }

    // ── 휘두르기 진행: 그물이 앞을 쓰는 동안 부채꼴에 들어온 첫 번째가 잡힌다 ──
    if (swing) {
      const ph = L.swingPhase(t - swing.t0);
      if (!swing.hit && ph.sweeping) {
        const range = L.netRange(swing.tier);
        if (swarm && swarmActive(swarm) && L.coneHit(p.pos, p.yaw, swarm, range + SWARM.catchPad) >= 0) {
          catchSwarm(swarm);
          swing.hit = true;
          swarmCaught();
        } else {
          const cands: Bug[] = [];
          for (const b of liveBugs()) if ((b.state === 'idle' || b.state === 'hop') && Math.abs(b.pos.x - p.pos.x) < range + 1 && Math.abs(b.pos.z - p.pos.z) < range + 1) cands.push(b);
          const i = L.pickInCone(p.pos, p.yaw, cands.map((b) => b.pos), range);
          if (i >= 0) { swing.hit = true; catchBug(cands[i]); }
        }
      }
      if (ph.done) {
        const s = swing;
        endSwing();
        if (!s.hit) miss(s.target, t);
      }
    }

    // ── 벌떼 ──
    if (swarm) {
      for (const ev of stepSwarm(swarm, t, dt, p.pos)) {
        // 탈것에 탄 동안은 벌이 따라와도 쏘지 못한다
        if (ev === 'stung') { if (!p.mounted) stung(); }
        else if (ev === 'leave' && !swarm.stung) g.ui.toast('휴~ 벌떼가 집으로 돌아갔어요');
      }
      if (swarmActive(swarm) && t >= buzzAt) {
        buzzAt = t + 1.1;
        g.audio?.sfx('bee-buzz', { x: swarm.x, z: swarm.z, vol: 0.8 });
      }
      if (swarm.phase === 'done') swarm = null;
    }

    // ── 잠자리채(휘두르기 / 곤충 앞에서 들고 있기) ──
    const host = p.avatar?.root ?? null;
    if (host && netHost !== host) { host.add(net); netHost = host; }
    if (netTierShown !== tier) {
      netTierShown = tier;
      hoopM.color.set(HOOP_COL[tier]);
      hoopM.metalness = tier === 'gold' ? 0.7 : 0;
    }
    const pink = L.netGlows(gauge);
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    hoopM.emissiveIntensity = pink ? 0.45 + pulse * 0.9 : 0;
    bagM.emissiveIntensity = pink ? 0.18 + pulse * 0.3 : 0;
    const ready = !swing && t - offeredAt < 0.2 && p.mode === 'ground';
    if (swing) {
      const k = THREE.MathUtils.clamp((t - swing.t0) / L.NET.swing, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      net.visible = true;
      net.position.set(0.22, 0.62, 0.05);
      net.rotation.set(-2.3 + e * 3.55, 0, -0.25 + e * 0.15);
    } else if (ready) {
      net.visible = true;
      net.position.set(0.28, 0.42, 0.02);
      net.rotation.set(-0.35 + Math.sin(t * 2.4) * 0.04, 0, -0.32);
    } else net.visible = false;

    ptsN = 0; shN = 0; kN = 0;
    // 분홍 반짝이(채 둘레)
    if (net.visible && pink && net.parent) {
      for (let i = 0; i < 3; i++) {
        const a = t * 2.2 + i * 2.1;
        tmp.set(Math.cos(a) * 0.28, 1.08 + Math.sin(a * 1.3) * 0.12, Math.sin(a) * 0.28);
        net.localToWorld(tmp);
        const e = 0.5 + 0.5 * Math.sin(t * 5 + i * 2);
        pushSpark(tmp, 0.22 + e * 0.18, 1.4 * e + 0.3, a, pinkCol);
      }
    }

    // ── 곤충들 ──
    p1.frameStart();
    for (const b of [...liveBugs()]) {
      if (b.state === 'gone') continue;
      const dist0 = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      const near = Math.hypot(b.anchor.pos.x - p.pos.x, b.anchor.pos.z - p.pos.z) < SHOW_DIST + 6 || dist0 < SHOW_DIST;
      if (!near && b.state === 'idle') {
        // 멀리 있는 반딧불이 빛만(밤 들판이 반짝이게)
        const gm = modelOf(b.sp);
        if (gm.glow && gm.glowColor && night > 0.5 && dist0 < L.RADIUS) {
          tmp.copy(b.anchor.pos); tmp.y += 1;
          const pk = 0.65 + 0.35 * Math.sin(t * 3.1 + b.ph);
          pushGlow(tmp, gm.glowColor, 1.6 * pk, 2.2 * night * pk);
        }
        continue;
      }
      // 겁: 달리면 4~8m, 걸으면 1.5~4m(살금살금은 더 가까이), 멈추면 괜찮다
      if ((b.state === 'idle') && !(swing && swing.target === b)) {
        if (P1.isOrchid(b.sp)) {
          // 난초사마귀: 걷든 뛰든 1.5 m 밖이면 꽃인 척, 안으로 들어오면 깜짝 도망
          if (P1.orchidReveals(dist0)) {
            flee(b, t);
            g.ui.toast('앗! 꽃이 아니라 난초사마귀였어! 🌸 (1.5m 밖에서 휘둘러 봐요)');
          }
        } else {
          const ms = L.moveStateOf(speedAvg, p.mode);
          const beh = b.beh === 'hide' ? 'perch' : b.beh;
          if (L.shouldFlee(dist0, ms, b.sp.rarity, b.sp.shy ?? 1, beh)) scare(b, t);
        }
      }
      if (!poseBug(b, t)) continue;
      const sp = b.sp;
      const wsc = bugScale(sp);
      let vis = Math.min(1, (t - b.born) / 0.5);
      if (b.hide) vis = Math.min(vis, L.hideScale(t - b.hideBorn));
      if (vis <= 0.01) continue;
      const dist = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      if (dist > SHOW_DIST) continue;
      const s = wsc * vis;
      if (b.state === 'idle' && P1.isOrchid(sp)) {
        // 위장 중: 사마귀 대신 난초 꽃(반짝이·그림자 없이 — 정말 꽃처럼)
        p1.orchidPush(b.pos, PERCH_SPOTS.has(b.spot) && !b.hide ? b.anchor.up : UPV, s, t, b.ph, p.pos);
        continue;
      }
      pushBug(drawFor(sp), b.pos, b.quat, s, s * b.sy, s, b.wing);

      // 블롭 그림자 + 반짝이
      const gm = modelOf(sp);
      const kind = sp.kind;
      const flier = b.spot === 'air' || (kind === 'bee' && b.spot === 'flower') || b.state === 'flee' || b.state === 'hop';
      if (b.spot === 'ground' || flier) {
        shP.set(b.pos.x, 0, b.pos.z);
        shP.y = groundY(shP.x, shP.z) + 0.03;
        const hAbove = Math.max(0, b.pos.y - shP.y);
        if (hAbove < 5) pushShadow(shP, UPV, s * 0.8 * (flier ? Math.max(0.35, 0.8 - hAbove * 0.12) : 1));
      } else if (b.spot !== 'water') {
        shP.copy(b.pos).addScaledVector(b.anchor.up, 0.012);
        pushShadow(shP, b.anchor.up, s * 0.75);
      }
      if (dist < 26 && b.state === 'idle') {
        const per = 2.2 + ((b.ph * 7.31) % 1) * 0.9;
        const ph = (t + b.ph) % per;
        if (ph < 0.75) {
          const e = Math.sin((ph / 0.75) * Math.PI);
          const perch = PERCH_SPOTS.has(b.spot) && !b.hide;
          // 천장·오늘 첫 잡기 곤충은 분홍 별(“이 친구가 그 친구!”)
          const col = b.special ? pinkCol : sparkCol;
          shP.copy(b.pos).addScaledVector(perch ? b.anchor.up : UPV, gm.height * s + 0.12 + ph * 0.18);
          shP.x += Math.sin(b.ph * 3.7) * s * 0.25;
          pushSpark(shP, (0.26 + s * 0.25) * e, 1.6 * e, ph * 1.8 + b.ph, col);
          if (ph > 0.15) {
            shP.x += Math.cos(b.ph * 5.1) * s * 0.45; shP.y -= s * 0.18;
            const e2 = Math.sin(((ph - 0.15) / 0.6) * Math.PI);
            pushSpark(shP, (0.14 + s * 0.12) * e2, 1.2 * e2, -ph * 2.4, col);
          }
        }
      }

      // 빛
      if (gm.glow && gm.glowColor) {
        tmp.copy(gm.glow).multiplyScalar(s).applyQuaternion(b.quat).add(b.pos);
        const pulseG = 0.65 + 0.35 * Math.sin(t * 3.1 + b.ph);
        pushGlow(tmp, gm.glowColor, 1.5 * pulseG * (0.5 + night), 2.6 * night * pulseG);
        if (b.beh === 'glow' && night > 0.5) {
          // 같이 떠도는 작은 반딧불(못 잡는 배경 무리)
          swarmCol.copy(gm.glowColor);
          for (let i = 0; i < 14; i++) {
            const a = t * (0.25 + i * 0.03) + i * 2.4 + b.ph;
            tmp.set(
              b.anchor.pos.x + Math.sin(a) * (1.5 + (i % 3)) + Math.sin(a * 2.1) * 0.6,
              0,
              b.anchor.pos.z + Math.cos(a * 0.9) * (1.5 + (i % 4) * 0.7),
            );
            tmp.y = island.heightAt(tmp.x, tmp.z) + 0.5 + ((i * 0.37) % 1) * 1.6 + Math.sin(a * 1.3) * 0.3;
            const pk = Math.max(0, Math.sin(t * (1.7 + i * 0.13) + i));
            pushGlow(tmp, swarmCol, 0.7 + pk * 0.45, 0.35 + 2.2 * pk);
          }
        }
      }
    }

    // ── 벌떼 그리기(꿀벌 인스턴스 10마리 + 그림자) ──
    if (swarm) {
      const bee = honeybee();
      const fade = swarmFade(swarm, t);
      if (bee && fade > 0.01) {
        const d = drawFor(bee);
        const w = modelOf(bee).wing;
        const s = bugScale(bee) * 0.8 * (0.4 + 0.6 * fade);
        for (let i = 0; i < SWARM.n; i++) {
          beePos(swarm, i, t, beeP);
          beeV.set(beeP.x, beeP.y, beeP.z);
          beePos(swarm, i, t + 0.05, beeP);
          tmp2.set(beeP.x - beeV.x, beeP.y - beeV.y, beeP.z - beeV.z);
          if (tmp2.lengthSq() < 1e-8) tmp2.set(0, 0, 1);
          beeQ.copy(lookQ(tmp2.normalize()));
          pushBug(d, beeV, beeQ, s, s, s, w ? w.rest + Math.sin(t * 40 + i) * Math.max(w.amp, 0.6) : 0);
        }
        shP.set(swarm.x, 0, swarm.z);
        shP.y = groundY(shP.x, shP.z) + 0.03;
        pushShadow(shP, UPV, 1.1 * fade);
      }
    }

    finishDraws();
    p1.frameEnd();
    // 빈 점은 치운다
    shadows.count = shN;
    shadows.instanceMatrix.needsUpdate = true;
    kgeo.setDrawRange(0, kN);
    for (const a of ['position', 'color', 'size', 'rot']) (kgeo.attributes[a] as THREE.BufferAttribute).needsUpdate = true;
    ggeo.setDrawRange(0, ptsN);
    (ggeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (ggeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (ggeo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  });

  // ───────────── 디버그 훅 ─────────────
  const findSpecies = (id: string): BugSpecies | null =>
    INSECTS.find((s) => s.id === id || s.gdd === id || s.id === `bug-${id}`) ?? (g.state.byGdd?.(id) as BugSpecies | undefined) ?? null;
  const ahead = (d = 2.5) => {
    const f = g.player.facing();
    return { x: g.player.pos.x + f.x * d, z: g.player.pos.z + f.z * d };
  };
  const bugRow = (b: Bug) => ({
    uid: b.uid, id: b.sp.id, name: b.sp.name, rarity: b.res.rarity || b.sp.rarity, beh: b.beh, spot: b.spot, state: b.state,
    hide: b.hide, special: b.special, x: +b.pos.x.toFixed(2), y: +b.pos.y.toFixed(2), z: +b.pos.z.toFixed(2),
    dist: +Math.hypot(b.pos.x - g.player.pos.x, b.pos.z - g.player.pos.z).toFixed(2),
  });

  // 촬영·디버그: 종 진열(플레이어 앞 격자) — node scripts/shot.mjs --eval "__insects.gallery(0, 12)"
  const gal = new THREE.Group();
  root.add(gal);
  (window as unknown as { __insects?: unknown }).__insects = {
    species: INSECTS,
    /** 살아 있는 곤충 목록(가까운 순) */
    bugs: () => [...liveBugs()].filter((b) => b.state !== 'gone').map(bugRow).sort((a, b) => a.dist - b.dist),
    chunks: () => [...chunks].map((r) => ({ cx: r.cx, cz: r.cz, n: r.bugs.length, gen: r.gen, dirty: r.dirty })),
    /** 종(id·GDD id) 하나를 x,z(기본: 플레이어 앞 2.5m)에 내놓는다 */
    spawnAt(id: string, x?: number, z?: number) {
      const sp = findSpecies(id);
      if (!sp) return null;
      const at = x === undefined || z === undefined ? ahead() : { x, z };
      const spot = normSpot(sp.spot) === 'water' ? 'ground' : PERCH_SPOTS.has(normSpot(sp.spot)) ? 'ground' : normSpot(sp.spot);
      const y = island.heightAt(at.x, at.z);
      const anchor: Anchor = { pos: new THREE.Vector3(at.x, y, at.z), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(1, 0, 0) };
      const s = island.surfaceAt(at.x, at.z);
      const b = newBug(sp, { species: sp, rarity: sp.rarity, combo: 0 }, spot, themeOf(s.island) ?? 'home', anchor, -Infinity, ctx.rng(`insects:dbg:${uidN}`), null);
      b.until = g.time + 600; // 디버그 곤충은 10분 동안
      if (b.beh === 'hide') b.beh = 'perch';
      hidden.push(b);
      return bugRow(b);
    },
    /** 가장 가까운 곤충을 바로 잡는다(성공 처리 그대로) */
    catchNear() {
      let best: Bug | null = null, bd = Infinity;
      for (const b of liveBugs()) {
        if (b.state === 'gone') continue;
        const d = Math.hypot(b.pos.x - g.player.pos.x, b.pos.z - g.player.pos.z);
        if (d < bd) { bd = d; best = b; }
      }
      if (!best) return null;
      const row = bugRow(best);
      catchBug(best);
      return row;
    },
    /** E 처럼 휘두르기(가장 가까운 곤충 쪽으로) */
    swing() {
      let best: Bug | null = null, bd = Infinity;
      for (const b of liveBugs()) {
        if (b.state === 'gone') continue;
        const d = Math.hypot(b.pos.x - g.player.pos.x, b.pos.z - g.player.pos.z);
        if (d < bd) { bd = d; best = b; }
      }
      startSwing(swarmActive(swarm) ? null : best, swarmActive(swarm));
      return !!swing;
    },
    beehive(x?: number, z?: number) {
      const at = x === undefined || z === undefined ? ahead(7) : { x, z };
      g.state.emit({ type: 'beehive', x: at.x, z: at.z });
      return swarm ? { ...swarm } : null;
    },
    shake(x?: number, z?: number) {
      const at = x === undefined || z === undefined ? ahead(2.5) : { x, z };
      const isl = island.surfaceAt(at.x, at.z).island ?? 'home';
      g.state.emit({ type: 'tree-shake', x: at.x, z: at.z, tree: 'debug', island: isl });
      return hidden.filter((b) => b.state !== 'gone').map(bugRow);
    },
    hit(x?: number, z?: number) {
      const at = x === undefined || z === undefined ? ahead(2.5) : { x, z };
      const isl = island.surfaceAt(at.x, at.z).island ?? 'home';
      g.state.emit({ type: 'rock-hit', x: at.x, z: at.z, rock: 'debug', combo: 1, island: isl });
      return hidden.filter((b) => b.state !== 'gone').map(bugRow);
    },
    swarm: () => (swarm ? { ...swarm } : null),
    net: () => ({ tier, range: L.netRange(tier), gauge, pink: L.netGlows(gauge), swinging: !!swing }),
    /** 모든 청크 다시 뽑기 */
    reroll() { for (const r of chunks) r.dirty = true; return chunks.size; },
    ...p1.debug,
    /** 난초사마귀(위장)를 플레이어 앞 x,z(기본 2.5m)에 */
    orchid(x?: number, z?: number) {
      const at = x === undefined || z === undefined ? ahead(2.5) : { x, z };
      return (window as unknown as { __insects: { spawnAt(id: string, x: number, z: number): unknown } }).__insects.spawnAt('b_orchid_mantis', at.x, at.z);
    },
    gallery(from = 0, count = 12, cols = 4, gap = 0.95, mag = 0) {
      gal.clear();
      const p = g.player.pos;
      const yaw = g.cam.yaw;
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      INSECTS.slice(from, from + count).forEach((sp, i) => {
        const sc = mag ? sp.size * mag : bugScale(sp);
        const b = makeBug(sp, sc);
        const r = Math.floor(i / cols), c = i % cols;
        const pos = p.clone().addScaledVector(fwd, 1.2 + r * gap).addScaledVector(right, (c - (cols - 1) / 2) * gap);
        pos.y = island.heightAt(pos.x, pos.z) + (FLIERS.has(sp.kind) && sp.kind !== 'firefly' ? 0.15 : 0.02);
        b.root.position.copy(pos);
        b.root.rotation.y = yaw + 0.35;
        if (b.model.wing) setWings(b, sp.kind === 'butterfly' || sp.kind === 'moth' ? 0.45 : b.model.wing.rest);
        const sh = new THREE.Mesh(shadowGeo, shadowMat);
        sh.position.set(pos.x, island.heightAt(pos.x, pos.z) + 0.03, pos.z);
        sh.scale.set(sc * 0.8, 1, sc * 0.7);
        applyCurve(sh);
        applyCurve(b.root);
        gal.add(sh, b.root);
      });
      return INSECTS.slice(from, from + count).map((s) => s.name).join(', ');
    },
  };

  return root;
}
