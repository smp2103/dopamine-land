// 가구 배치 격자(GDD 4.12 — 0.5 m 칸). 부수효과 없는 순수 모듈 — 다른 모듈도 read-only 로 import 해도 된다(계약 v2 0장 예외).
// 칸 좌표: 방 왼쪽 앞(-x, -z) 모서리가 (0, 0). gx 는 +x 로, gz 는 +z 로 는다. 가구 하나 = 왼쪽 위 칸(gx, gz) + 돌림(0~3) + 발자국(w×d 칸).
// 층: floor(러그처럼 바닥에 까는 것) · solid(서는 가구) — floor 끼리, solid 끼리만 겹치면 안 된다(러그 위에 의자는 된다).
//
//   const room = { w: 16, d: 14 };
//   const p = anchorAt(cursorGx, cursorGz, foot, rot);                 // 커서 칸을 가운데로
//   const r = canPlace(layout, { uid, item, ...p, rot }, room, footOf); // {ok} | {ok:false, why}
//   if (r.ok) layout = placeItem(layout, cand);
//   restoreLayout(saved, room, footOf)                                  // 저장값 검사(범위 밖·겹침·모르는 값 버림)

/** 한 칸 = 0.5 m */
export const GRID = 0.5;

/** 0 = 그대로, 1 = 90°, 2 = 180°, 3 = 270° (위에서 볼 때 반시계) */
export type Rot = 0 | 1 | 2 | 3;
export type Layer = 'floor' | 'solid';

/** 발자국(칸 수) */
export interface Footprint { w: number; d: number; layer?: Layer }
/** 놓인 가구 한 개 */
export interface Placed {
  /** 같은 종류를 여러 개 놓아도 구분되는 이름 */
  uid: string;
  /** 아이템 id(f_*) */
  item: string;
  gx: number;
  gz: number;
  rot: Rot;
  /** 안에 든 것(수조의 물고기 종 id 등) */
  arg?: string;
}
/** 방 크기(칸 수) */
export interface RoomGrid { w: number; d: number }
export type FootOf = (item: string) => Footprint;
export type PlaceCheck = { ok: true } | { ok: false; why: 'bounds' | 'overlap' | 'blocked'; with?: Placed };

/** 가장 가까운 격자 점으로(기본 0.5 m) */
export const snap = (v: number, grid = GRID) => Math.round(v / grid) * grid;
/** 돌림 정리(음수·4 이상·이상한 값도 받는다) */
export const normRot = (r: unknown): Rot => ((((Math.round(Number(r)) || 0) % 4) + 4) % 4) as Rot;
/** 다음 돌림(R 키) */
export const nextRot = (r: Rot): Rot => normRot(r + 1);
/** 돌림 → 라디안(Y 축) */
export const rotRad = (r: Rot) => (r * Math.PI) / 2;

/** 돌린 발자국: 90°·270° 면 가로세로가 바뀐다 */
export function rotFoot(f: Footprint, rot: Rot): Footprint {
  const w = Math.max(1, Math.round(f.w)), d = Math.max(1, Math.round(f.d));
  return rot % 2 === 1 ? { w: d, d: w, layer: f.layer } : { w, d, layer: f.layer };
}
const layerOf = (f: Footprint): Layer => f.layer ?? 'solid';

/** 칸 이름 */
export const cellKey = (gx: number, gz: number) => `${gx},${gz}`;

/** 가구가 차지하는 칸들 */
export function cellsOf(p: Pick<Placed, 'gx' | 'gz' | 'rot' | 'item'>, footOf: FootOf): Array<[number, number]> {
  const f = rotFoot(footOf(p.item), p.rot);
  const out: Array<[number, number]> = [];
  for (let x = 0; x < f.w; x++) for (let z = 0; z < f.d; z++) out.push([p.gx + x, p.gz + z]);
  return out;
}

/** 방 안에 다 들어가나 */
export function inBounds(p: Pick<Placed, 'gx' | 'gz' | 'rot' | 'item'>, room: RoomGrid, footOf: FootOf): boolean {
  const f = rotFoot(footOf(p.item), p.rot);
  return Number.isInteger(p.gx) && Number.isInteger(p.gz) && p.gx >= 0 && p.gz >= 0 && p.gx + f.w <= room.w && p.gz + f.d <= room.d;
}

/** 두 가구의 칸이 겹치나(같은 층일 때만 부딪힌다) */
export function overlaps(a: Pick<Placed, 'gx' | 'gz' | 'rot' | 'item'>, b: Pick<Placed, 'gx' | 'gz' | 'rot' | 'item'>, footOf: FootOf): boolean {
  const fa = rotFoot(footOf(a.item), a.rot), fb = rotFoot(footOf(b.item), b.rot);
  if (layerOf(fa) !== layerOf(fb)) return false;
  return a.gx < b.gx + fb.w && b.gx < a.gx + fa.w && a.gz < b.gz + fb.d && b.gz < a.gz + fa.d;
}

/**
 * 놓을 수 있나 — 방 밖·막힌 칸(붙박이 보관함·문 앞)·같은 층 겹침을 본다.
 * 같은 uid 는 자기 자신이라 무시한다(옮기기·돌리기 검사).
 */
export function canPlace(layout: readonly Placed[], cand: Placed, room: RoomGrid, footOf: FootOf, blocked?: ReadonlySet<string>): PlaceCheck {
  if (!inBounds(cand, room, footOf)) return { ok: false, why: 'bounds' };
  if (blocked && blocked.size && layerOf(footOf(cand.item)) === 'solid') {
    for (const [x, z] of cellsOf(cand, footOf)) if (blocked.has(cellKey(x, z))) return { ok: false, why: 'blocked' };
  }
  for (const o of layout) {
    if (o.uid === cand.uid) continue;
    if (overlaps(o, cand, footOf)) return { ok: false, why: 'overlap', with: o };
  }
  return { ok: true };
}

/** 놓기(같은 uid 가 있으면 바꿔 끼운다). 검사는 canPlace 로 먼저 */
export function placeItem(layout: readonly Placed[], cand: Placed): Placed[] {
  return [...layout.filter((o) => o.uid !== cand.uid), { ...cand }];
}
/** 빼기 */
export function removeItem(layout: readonly Placed[], uid: string): Placed[] {
  return layout.filter((o) => o.uid !== uid);
}

/** 그 칸에 있는 가구(서는 가구가 러그보다 먼저 집힌다) */
export function pickAt(layout: readonly Placed[], gx: number, gz: number, footOf: FootOf): Placed | null {
  let rug: Placed | null = null;
  for (let i = layout.length - 1; i >= 0; i--) {
    const o = layout[i];
    const f = rotFoot(footOf(o.item), o.rot);
    if (gx < o.gx || gz < o.gz || gx >= o.gx + f.w || gz >= o.gz + f.d) continue;
    if (layerOf(f) === 'solid') return o;
    rug ??= o;
  }
  return rug;
}

/** 커서 칸이 발자국 가운데에 오도록 왼쪽 위 칸을 고른다 */
export function anchorAt(cx: number, cz: number, foot: Footprint, rot: Rot): { gx: number; gz: number } {
  const f = rotFoot(foot, rot);
  return { gx: Math.round(cx) - Math.floor((f.w - 1) / 2), gz: Math.round(cz) - Math.floor((f.d - 1) / 2) };
}
/** 방 안으로 밀어 넣기(발자국이 방보다 크면 0) */
export function clampAnchor(a: { gx: number; gz: number }, foot: Footprint, rot: Rot, room: RoomGrid): { gx: number; gz: number } {
  const f = rotFoot(foot, rot);
  return { gx: Math.max(0, Math.min(room.w - f.w, a.gx)), gz: Math.max(0, Math.min(room.d - f.d, a.gz)) };
}

/** 방 좌표(가운데 원점, m) → 칸(내림). 방 밖이면 범위 밖 값이 그대로 나온다 */
export function localToCell(lx: number, lz: number, room: RoomGrid, grid = GRID): { gx: number; gz: number } {
  return { gx: Math.floor((lx + (room.w * grid) / 2) / grid), gz: Math.floor((lz + (room.d * grid) / 2) / grid) };
}
/** 가구 가운데(방 좌표, m) — 발자국 중심 */
export function placedCenter(p: Pick<Placed, 'gx' | 'gz' | 'rot' | 'item'>, room: RoomGrid, footOf: FootOf, grid = GRID): { x: number; z: number } {
  const f = rotFoot(footOf(p.item), p.rot);
  return { x: (p.gx + f.w / 2) * grid - (room.w * grid) / 2, z: (p.gz + f.d / 2) * grid - (room.d * grid) / 2 };
}

/** 저장용(평범한 객체 배열) */
export function serializeLayout(layout: readonly Placed[]): Placed[] {
  return layout.map((o) => {
    const r: Placed = { uid: o.uid, item: o.item, gx: o.gx, gz: o.gz, rot: o.rot };
    if (o.arg) r.arg = o.arg;
    return r;
  });
}

/**
 * 저장값 되살리기 — 모양이 이상한 줄·방 밖(방이 작아진 옛 저장)·겹치는 줄은 버린다(버린 것은 dropped 로 — 가방에 돌려줄 수 있게).
 * known 을 주면 모르는 아이템도 버린다. 같은 uid 가 두 번 나오면 뒤엣것을 버린다.
 */
export function restoreLayout(raw: unknown, room: RoomGrid, footOf: FootOf, o: { known?: (item: string) => boolean; blocked?: ReadonlySet<string> } = {}): { layout: Placed[]; dropped: Placed[] } {
  const layout: Placed[] = [];
  const dropped: Placed[] = [];
  if (!Array.isArray(raw)) return { layout, dropped };
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    if (typeof x.item !== 'string' || !x.item) continue;
    const gx = Number(x.gx), gz = Number(x.gz);
    if (!Number.isFinite(gx) || !Number.isFinite(gz)) continue;
    const p: Placed = { uid: typeof x.uid === 'string' && x.uid ? x.uid : `${x.item}#${layout.length + dropped.length}`, item: x.item, gx: Math.round(gx), gz: Math.round(gz), rot: normRot(x.rot) };
    if (typeof x.arg === 'string' && x.arg) p.arg = x.arg;
    if (seen.has(p.uid) || (o.known && !o.known(p.item))) { dropped.push(p); continue; }
    if (!canPlace(layout, p, room, footOf, o.blocked).ok) { dropped.push(p); continue; }
    seen.add(p.uid);
    layout.push(p);
  }
  return { layout, dropped };
}

/** 새 uid(같은 아이템이 이미 몇 개 있어도 겹치지 않게) */
export function newUid(layout: readonly Placed[], item: string): string {
  const used = new Set(layout.map((o) => o.uid));
  for (let i = 1; ; i++) { const u = `${item}#${i}`; if (!used.has(u)) return u; }
}
