// 모래 피라미드 안 퍼즐(GDD 2.2 피라미드 P1) — 방 3개 + 보물방. 밀 수 있는 돌 블록을 발판에 모두 올리면 다음 문이 열린다.
// 순수 상태 기계(THREE 없음): 지도 읽기 · 밀기 · 발판 판정(한 번 풀리면 잠긴 채로 열림) · 되돌리기 · 저장/불러오기 · 풀이 찾기(BFS).
// 격자: x = 열(왼→오, +x 동), y = 행(위→아래, 위가 북쪽 −z). 한 칸 = CELL m.
//   '#' 벽 · '.' 바닥 · 'B' 블록(바닥 위) · 'o' 발판 · '*' 발판 위 블록 · 'S' 들어오는 문(아래 벽 한가운데) · 'D' 나가는 문(위 벽) · 'P' 받침대(보물방, 벽처럼 막힘)
export const CELL = 2;

export type Dir = 'N' | 'S' | 'E' | 'W';
export const DIRS: Record<Dir, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

export interface Room {
  id: string;
  name: string;
  w: number;
  h: number;
  /** y*w + x → 막힘(벽·받침대) */
  walls: boolean[];
  plates: Array<[number, number]>;
  start: Array<[number, number]>;
  /** 들어오는 칸(아래 벽) */
  entry: [number, number];
  /** 나가는 문 칸(위 벽) — 보물방은 없다 */
  door: [number, number] | null;
  pedestals: Array<[number, number]>;
}
export interface RoomState { blocks: Array<[number, number]>; solved: boolean; moves: number }

/** 방 지도(위가 북쪽). 마지막은 보물방 */
export const ROOM_MAPS: Array<{ id: string; name: string; map: string[] }> = [
  {
    id: 'r1', name: '첫째 방 · 굴려 보기',
    map: [
      '###D###',
      '#.....#',
      '#..o..#',
      '#.....#',
      '#..B..#',
      '#.....#',
      '###S###',
    ],
  },
  {
    id: 'r2', name: '둘째 방 · 쌍둥이 발판',
    map: [
      '####D####',
      '#o.....o#',
      '#.......#',
      '#..#.#..#',
      '#..B.B..#',
      '#.......#',
      '####S####',
    ],
  },
  {
    id: 'r3', name: '셋째 방 · 풍뎅이 기둥',
    map: [
      '#####D#####',
      '#.........#',
      '#.o.#.#.o.#',
      '#...#.#...#',
      '#...B.B...#',
      '#....o....#',
      '#...#B#...#',
      '#.........#',
      '#####S#####',
    ],
  },
  {
    id: 'vault', name: '황금 보물방',
    map: [
      '#########',
      '#.......#',
      '#..P.P..#',
      '#.......#',
      '#.......#',
      '#.......#',
      '####S####',
    ],
  },
];

export function parseRoom(id: string, name: string, map: string[]): Room {
  const h = map.length, w = Math.max(...map.map((r) => r.length));
  const walls: boolean[] = new Array(w * h).fill(false);
  const plates: Array<[number, number]> = [], start: Array<[number, number]> = [], pedestals: Array<[number, number]> = [];
  let entry: [number, number] = [Math.floor(w / 2), h - 1], door: [number, number] | null = null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = map[y][x] ?? '#';
    switch (c) {
      case '#': walls[y * w + x] = true; break;
      case 'P': walls[y * w + x] = true; pedestals.push([x, y]); break;
      case 'B': start.push([x, y]); break;
      case 'o': plates.push([x, y]); break;
      case '*': plates.push([x, y]); start.push([x, y]); break;
      case 'S': entry = [x, y]; break;
      case 'D': door = [x, y]; break;
    }
  }
  return { id, name, w, h, walls, plates, start, entry, door, pedestals };
}

export const ROOMS: Room[] = ROOM_MAPS.map((r) => parseRoom(r.id, r.name, r.map));
/** 퍼즐 방(보물방 빼고) */
export const PUZZLE_ROOMS = ROOMS.filter((r) => r.door !== null);

export const initialState = (room: Room): RoomState => ({ blocks: room.start.map(([x, y]) => [x, y] as [number, number]), solved: room.plates.length === 0, moves: 0 });
const same = (a: [number, number], x: number, y: number) => a[0] === x && a[1] === y;

/** 블록이 설 수 있는 칸인가(방 안 바닥 — 벽·문·입구·받침대가 아니고 다른 블록이 없다) */
export function blockFree(room: Room, st: RoomState, x: number, y: number, ignore = -1): boolean {
  if (x <= 0 || y <= 0 || x >= room.w - 1 || y >= room.h - 1) return false;
  if (room.walls[y * room.w + x]) return false;
  return !st.blocks.some((b, i) => i !== ignore && same(b, x, y));
}
/** 플레이어가 설 수 있는 칸(벽·블록 아님. 입구 칸은 된다) */
export function walkable(room: Room, st: RoomState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= room.w || y >= room.h) return false;
  if (room.entry && same(room.entry, x, y)) return true;
  if (room.walls[y * room.w + x]) return false;
  if (x === 0 || y === 0 || x === room.w - 1 || y === room.h - 1) return false;
  return !st.blocks.some((b) => same(b, x, y));
}
export const blockAt = (st: RoomState, x: number, y: number) => st.blocks.findIndex((b) => same(b, x, y));
/** 발판이 전부 블록으로 덮였나 */
export const covered = (room: Room, st: RoomState) => room.plates.every(([x, y]) => st.blocks.some((b) => same(b, x, y)));
/** 덮인 발판 수 */
export const coveredCount = (room: Room, st: RoomState) => room.plates.filter(([x, y]) => st.blocks.some((b) => same(b, x, y))).length;

export interface PushResult { ok: boolean; state: RoomState; block: number; from?: [number, number]; to?: [number, number]; solvedNow: boolean; why?: 'none' | 'blocked' | 'solved' }
/**
 * 플레이어가 (px,py) 에서 dir 쪽으로 민다: 바로 앞 칸의 블록이 한 칸 밀려난다(그 너머가 비어 있어야).
 * 풀린 방은 더 바뀌지 않는다(발판 위 블록이 그대로). 새 상태 객체를 돌려준다.
 */
export function push(room: Room, st: RoomState, px: number, py: number, dir: Dir): PushResult {
  if (st.solved) return { ok: false, state: st, block: -1, solvedNow: false, why: 'solved' };
  const [dx, dy] = DIRS[dir];
  const bx = px + dx, by = py + dy;
  const i = blockAt(st, bx, by);
  if (i < 0) return { ok: false, state: st, block: -1, solvedNow: false, why: 'none' };
  const tx = bx + dx, ty = by + dy;
  if (!blockFree(room, st, tx, ty, i)) return { ok: false, state: st, block: i, solvedNow: false, why: 'blocked' };
  const blocks = st.blocks.map((b, k) => (k === i ? [tx, ty] as [number, number] : [b[0], b[1]] as [number, number]));
  const next: RoomState = { blocks, solved: false, moves: st.moves + 1 };
  next.solved = covered(room, next);
  return { ok: true, state: next, block: i, from: [bx, by], to: [tx, ty], solvedNow: next.solved };
}
/** 되돌리기(풀린 방은 그대로) */
export const resetRoom = (room: Room, st: RoomState): RoomState => (st.solved ? st : initialState(room));

/** 문이 열렸나: 방 k 의 문은 방 k 가 풀리면 열린다 */
export const doorOpen = (states: RoomState[], k: number) => !!states[k]?.solved;
/** 보물방까지 열렸나 */
export const allSolved = (states: RoomState[]) => PUZZLE_ROOMS.every((_, k) => !!states[k]?.solved);

/** 저장 값 → 상태(블록 수·자리가 맞지 않으면 처음으로) */
export function loadStates(saved: unknown): RoomState[] {
  const arr = Array.isArray(saved) ? saved : [];
  return PUZZLE_ROOMS.map((room, k) => {
    const s = arr[k] as Partial<RoomState> | undefined;
    const init = initialState(room);
    if (!s || !Array.isArray(s.blocks) || s.blocks.length !== room.start.length) return init;
    const blocks = s.blocks.map((b) => [Number(b?.[0]), Number(b?.[1])] as [number, number]);
    const tmp: RoomState = { blocks: [], solved: false, moves: 0 };
    for (const b of blocks) {
      if (!Number.isInteger(b[0]) || !Number.isInteger(b[1]) || !blockFree(room, tmp, b[0], b[1])) return init;
      tmp.blocks.push(b);
    }
    const st: RoomState = { blocks, solved: !!s.solved, moves: Math.max(0, Math.floor(Number(s.moves) || 0)) };
    // 풀렸다고 적혀 있어도 발판이 안 덮였으면 믿지 않는다
    if (st.solved && !covered(room, st)) st.solved = false;
    if (!st.solved && covered(room, st)) st.solved = true;
    return st;
  });
}
export const saveStates = (states: RoomState[]) => states.map((s) => ({ blocks: s.blocks.map((b) => [b[0], b[1]] as [number, number]), solved: s.solved, moves: s.moves }));

/** 다 푼 모양(발판 위에 블록) — 디버그 '바로 풀기'·풀린 방 보여 주기 */
export function solvedState(room: Room, moves = 0): RoomState {
  return { blocks: room.plates.map(([x, y]) => [x, y] as [number, number]), solved: true, moves };
}

/** 플레이어가 (px,py) 에서 걸어갈 수 있는 칸 모두(블록은 못 지나간다) */
export function reach(room: Room, st: RoomState, px: number, py: number): Set<number> {
  const seen = new Set<number>();
  if (!walkable(room, st, px, py)) return seen;
  const q: Array<[number, number]> = [[px, py]];
  seen.add(py * room.w + px);
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const d of Object.values(DIRS)) {
      const nx = x + d[0], ny = y + d[1], k = ny * room.w + nx;
      if (seen.has(k) || !walkable(room, st, nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}

/**
 * 가장 적게 미는 풀이(BFS). 입구 칸에서 시작한다. 밀기 횟수, 못 풀면 -1.
 * 상태 = 블록 자리(정렬) + 플레이어가 닿는 칸 중 가장 작은 번호. 방이 작아 금방 끝난다(최대 maxStates).
 */
export function solve(room: Room, st0: RoomState = initialState(room), maxStates = 200000): number {
  if (covered(room, st0)) return 0;
  const key = (st: RoomState, reachMin: number) => st.blocks.map((b) => b[1] * room.w + b[0]).sort((a, b) => a - b).join(',') + '|' + reachMin;
  const [ex, ey] = room.entry;
  const start = { st: { ...st0, solved: false }, px: ex, py: ey, n: 0 };
  const r0 = reach(room, start.st, ex, ey);
  const seen = new Set<string>([key(start.st, Math.min(...r0))]);
  const q = [start];
  while (q.length) {
    const cur = q.shift()!;
    const r = reach(room, cur.st, cur.px, cur.py);
    for (const cell of r) {
      const x = cell % room.w, y = Math.floor(cell / room.w);
      for (const dir of Object.keys(DIRS) as Dir[]) {
        const res = push(room, cur.st, x, y, dir);
        if (!res.ok) continue;
        if (res.solvedNow) return cur.n + 1;
        const nx = res.from![0], ny = res.from![1];
        const nr = reach(room, res.state, nx, ny);
        const k = key(res.state, Math.min(...nr));
        if (seen.has(k)) continue;
        seen.add(k);
        if (seen.size > maxStates) return -1;
        q.push({ st: res.state, px: nx, py: ny, n: cur.n + 1 });
      }
    }
  }
  return -1;
}

// ───────────── 방 배치(월드 좌표, 피라미드 실내 원점 기준) ─────────────
/** 방 k 의 가운데 z(북쪽으로 쌓는다: 방 k 의 위 벽 바로 위가 방 k+1 의 아래 벽) */
export function roomCenterZ(k: number): number {
  let z = 0;
  for (let i = 1; i <= k; i++) z -= ((ROOMS[i - 1].h + ROOMS[i].h) / 2) * CELL;
  return z;
}
/** 칸 → 실내 원점 기준 (x, z) */
export function cellToLocal(k: number, x: number, y: number): { x: number; z: number } {
  const r = ROOMS[k];
  return { x: (x - (r.w - 1) / 2) * CELL, z: roomCenterZ(k) + (y - (r.h - 1) / 2) * CELL };
}
/** 실내 원점 기준 (x, z) → 방·칸(어느 방 상자에도 없으면 null) */
export function localToCell(lx: number, lz: number): { k: number; x: number; y: number } | null {
  for (let k = 0; k < ROOMS.length; k++) {
    const r = ROOMS[k];
    const x = Math.round(lx / CELL + (r.w - 1) / 2), y = Math.round((lz - roomCenterZ(k)) / CELL + (r.h - 1) / 2);
    if (x >= 0 && y >= 0 && x < r.w && y < r.h) return { k, x, y };
  }
  return null;
}
