// 캐릭터 스튜디오 URL 파라미터(순수 함수 — 테스트가 node 에서 바로 부른다).
// rig=player | animal:<kind> | npc:<id> | villager:<id> | concept:<name>
// pose=idle|walk|run|jump|glide|swim|dive|mounted|<PLAYER_POSES 동작>  expr=neutral|blink|smile|happy|surprised|sad
// t=초  angle=카메라 방위(도, 0 = 캐릭터 정면, 180 = 등 뒤)  dist=m  h=카메라 높이(m)  fov=도
// bg=studio|grass  lineup=1(+part=0|1, sil=1 실루엣)  game=1(게임 카메라 + 풀밭 + 소품, cam=adventure|cozy, pitch=라디안)
// lod=far  frame=body|face  zoom=게임 컷 확대 배율  size=가로x세로(렌더 크기)  tod=시간대  orbit=0(마우스 끄기)

export type RigType = 'player' | 'animal' | 'npc' | 'villager' | 'concept';
export interface RigRef { type: RigType; id: string }

export type Expr = 'neutral' | 'blink' | 'smile' | 'happy' | 'surprised' | 'sad';
export const EXPRS: readonly Expr[] = ['neutral', 'blink', 'smile', 'happy', 'surprised', 'sad'];
/** 이동 상태 포즈(동작이 아닌 것) */
export const LOCOMOTION = ['idle', 'walk', 'run', 'jump', 'glide', 'swim', 'dive', 'mounted'] as const;
export type Locomotion = (typeof LOCOMOTION)[number];

export interface StudioParams {
  rig: RigRef;
  pose: string;
  expr: Expr | null;
  t: number;
  angle: number;
  dist: number | null;
  h: number | null;
  fov: number | null;
  bg: 'studio' | 'grass';
  lineup: boolean;
  /** 줄 세우기 몇 번째 줄(null = 전부 한 줄) */
  part: number | null;
  /** 실루엣만(검은 그림자) */
  sil: boolean;
  game: boolean;
  cam: 'adventure' | 'cozy';
  pitch: number | null;
  lod: 'near' | 'far';
  frame: 'body' | 'face';
  zoom: number;
  size: { w: number; h: number } | null;
  tod: string;
  orbit: boolean;
}

export const DEFAULTS: StudioParams = {
  rig: { type: 'player', id: 'player' }, pose: 'idle', expr: null, t: 1, angle: 0, dist: null, h: null, fov: null,
  bg: 'studio', lineup: false, part: null, sil: false, game: false, cam: 'adventure', pitch: null, lod: 'near',
  frame: 'body', zoom: 1, size: null, tod: 'day', orbit: true,
};

const ID = /^[a-z0-9_-]{1,40}$/i;

/** 'animal:bear' → { type: 'animal', id: 'bear' }. 모르는 꼴이면 null */
export function parseRig(s: string | null | undefined): RigRef | null {
  if (!s) return null;
  const v = s.trim();
  if (v === 'player') return { type: 'player', id: 'player' };
  const m = /^(animal|npc|villager|concept):(.+)$/.exec(v);
  if (!m || !ID.test(m[2])) return null;
  return { type: m[1] as RigType, id: m[2] };
}

export function rigKey(r: RigRef): string {
  return r.type === 'player' ? 'player' : `${r.type}:${r.id}`;
}

function num(v: string | null, lo: number, hi: number): number | null {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}
const flag = (v: string | null) => v === '1' || v === 'true' || v === 'on';

/** 도(°)를 0..360 으로 */
export function normAngle(a: number): number {
  return ((a % 360) + 360) % 360;
}

export function parseStudioParams(input: string | URLSearchParams | Record<string, string | number | boolean | null | undefined>): StudioParams {
  const q = typeof input === 'string' ? new URLSearchParams(input.replace(/^\?/, ''))
    : input instanceof URLSearchParams ? input
      : new URLSearchParams(Object.entries(input).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)]));
  const p: StudioParams = { ...DEFAULTS, rig: { ...DEFAULTS.rig } };
  p.rig = parseRig(q.get('rig')) ?? p.rig;
  const pose = (q.get('pose') ?? '').trim().toLowerCase();
  if (/^[a-z]{2,16}$/.test(pose)) p.pose = pose;
  const expr = (q.get('expr') ?? '').trim().toLowerCase();
  p.expr = (EXPRS as readonly string[]).includes(expr) ? expr as Expr : null;
  p.t = num(q.get('t'), 0, 1e5) ?? p.t;
  const a = num(q.get('angle'), -1e4, 1e4);
  p.angle = a === null ? p.angle : normAngle(a);
  p.dist = num(q.get('dist'), 0.2, 200);
  p.h = num(q.get('h'), -5, 100);
  p.fov = num(q.get('fov'), 5, 120);
  p.bg = q.get('bg') === 'grass' ? 'grass' : 'studio';
  p.lineup = flag(q.get('lineup'));
  const part = num(q.get('part'), 0, 9);
  p.part = part === null ? null : Math.floor(part);
  p.sil = flag(q.get('sil'));
  p.game = flag(q.get('game'));
  // 게임 화면은 늘 풀밭(소품 포함) — bg 를 따로 주면 그것을 따른다
  if (p.game && !q.has('bg')) p.bg = 'grass';
  p.cam = q.get('cam') === 'cozy' ? 'cozy' : 'adventure';
  p.pitch = num(q.get('pitch'), -1.4, 1.5);
  p.lod = q.get('lod') === 'far' ? 'far' : 'near';
  p.frame = q.get('frame') === 'face' ? 'face' : 'body';
  p.zoom = num(q.get('zoom'), 0.25, 16) ?? 1;
  const sz = /^(\d{2,4})x(\d{2,4})$/.exec(q.get('size') ?? '');
  p.size = sz ? { w: Math.min(4096, +sz[1]), h: Math.min(4096, +sz[2]) } : null;
  const tod = q.get('tod');
  if (tod && /^[a-z]{2,16}$/.test(tod)) p.tod = tod;
  p.orbit = q.get('orbit') !== '0';
  return p;
}

/** 기본값과 다른 것만 쿼리 문자열로(되돌리면 같은 값) */
export function toQuery(p: Partial<StudioParams>): string {
  const full = { ...DEFAULTS, ...p };
  const out = new URLSearchParams();
  if (rigKey(full.rig) !== 'player') out.set('rig', rigKey(full.rig));
  if (full.pose !== DEFAULTS.pose) out.set('pose', full.pose);
  if (full.expr) out.set('expr', full.expr);
  if (full.t !== DEFAULTS.t) out.set('t', String(full.t));
  if (full.angle !== DEFAULTS.angle) out.set('angle', String(full.angle));
  for (const k of ['dist', 'h', 'fov', 'pitch'] as const) if (full[k] !== null) out.set(k, String(full[k]));
  if (full.lineup) out.set('lineup', '1');
  if (full.part !== null) out.set('part', String(full.part));
  if (full.sil) out.set('sil', '1');
  if (full.game) out.set('game', '1');
  // game=1 이면 풀밭이 기본이라 studio 를 원할 때만 적는다
  if (full.game ? full.bg !== 'grass' : full.bg !== 'studio') out.set('bg', full.bg);
  if (full.cam !== DEFAULTS.cam) out.set('cam', full.cam);
  if (full.lod !== DEFAULTS.lod) out.set('lod', full.lod);
  if (full.frame !== DEFAULTS.frame) out.set('frame', full.frame);
  if (full.zoom !== DEFAULTS.zoom) out.set('zoom', String(full.zoom));
  if (full.size) out.set('size', `${full.size.w}x${full.size.h}`);
  if (full.tod !== DEFAULTS.tod) out.set('tod', full.tod);
  if (!full.orbit) out.set('orbit', '0');
  return out.toString();
}

// ───────────── 포즈 → 아바타 상태 ─────────────
export type MoveMode = 'ground' | 'air' | 'glide' | 'swim' | 'dive' | 'mounted';
export interface PoseInput { speed: number; mode: MoveMode; action: string | null; hold: boolean }

/** 스튜디오 포즈 이름 → 플레이어 animate 입력. actions = 그 리그가 아는 동작(PLAYER_POSES). 모르면 fallback */
export function playerPose(pose: string, actions: readonly string[]): PoseInput & { fallback: boolean } {
  const base = { speed: 0, mode: 'ground' as MoveMode, action: null as string | null, hold: false, fallback: false };
  switch (pose) {
    case 'idle': return base;
    case 'walk': return { ...base, speed: 3.8 };
    case 'run': return { ...base, speed: 9 };
    case 'jump': return { ...base, mode: 'air', speed: 3 };
    case 'glide': return { ...base, mode: 'glide', speed: 6 };
    case 'swim': return { ...base, mode: 'swim', speed: 1.6 };
    case 'dive': return { ...base, mode: 'dive', speed: 1.2 };
    case 'mounted': return { ...base, mode: 'mounted' };
  }
  if (actions.includes(pose)) return { ...base, action: pose, hold: pose === 'hold' };
  return { ...base, fallback: true };
}

/** 동물 리그(AnimalPose)용 */
export interface AnimalPoseInput { walk: number; talk: boolean; wave: boolean; happy: boolean; clap: boolean; hop: number; fallback: boolean }
export function animalPose(pose: string, expr: Expr | null): AnimalPoseInput {
  const p: AnimalPoseInput = { walk: 0, talk: false, wave: false, happy: false, clap: false, hop: 0, fallback: false };
  switch (pose) {
    case 'idle': case 'sit': break;
    case 'walk': p.walk = 1.2; break;
    case 'run': p.walk = 2.6; break;
    case 'jump': p.hop = 0.28; break;
    case 'talk': p.talk = true; break;
    case 'wave': p.wave = true; break;
    case 'happy': p.happy = true; break;
    case 'cheer': case 'clap': p.clap = true; p.happy = true; break;
    case 'hold': p.happy = true; break;
    default: p.fallback = true;
  }
  if (expr === 'smile' || expr === 'happy') p.happy = true;
  if (pose === 'sit') p.fallback = true;
  return p;
}

// ───────────── 접촉 시트(contact sheet) 배치 ─────────────
export interface SheetCell { label: string; q: Partial<StudioParams>; w: number }
export interface SheetRow { title: string; h: number; cells: SheetCell[] }

export const SHEET_W = 2720;
export const TURN_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;
export const SHEET_POSES = ['idle', 'walk', 'run', 'jump', 'swim', 'cheer', 'hold', 'sit'] as const;
const POSE_KO: Record<string, string> = {
  idle: '가만히', walk: '걷기', run: '달리기', jump: '점프', swim: '수영', cheer: '만세', hold: '들어 올리기', sit: '앉기',
  glide: '활공', dive: '잠수', mounted: '탑승',
};
const EXPR_KO: Record<Expr, string> = { neutral: '기본', blink: '깜빡', smile: '웃음', happy: '> <', surprised: '깜짝', sad: '시무룩' };
/** 게임 화면 기준(1600×900 창) — 게임 컷은 이 해상도 그대로 잘라 낸다 */
export const GAME_VIEW = { w: 1600, h: 900 } as const;

/** 한 리그의 접촉 시트: 돌려 보기 8 · 포즈 8 · 얼굴 6 + 게임 거리 + 먼 LOD */
export function rigSheet(rig: RigRef): SheetRow[] {
  const turnW = SHEET_W / 8;
  const face = 260, gameW = 760, farW = SHEET_W - face * 6 - gameW;
  return [
    { title: '돌려 보기', h: 440, cells: TURN_ANGLES.map((a) => ({ label: `${a}°`, w: turnW, q: { rig, angle: a, pose: 'idle', expr: 'neutral', t: 1 } })) },
    { title: '포즈', h: 440, cells: SHEET_POSES.map((p, i) => ({ label: POSE_KO[p] ?? p, w: turnW, q: { rig, pose: p, angle: 28, t: 1.15 + i * 0.07 } })) },
    {
      title: '얼굴 · 게임 거리 · 먼 LOD', h: 440, cells: [
        ...EXPRS.map((e) => ({ label: EXPR_KO[e], w: face, q: { rig, frame: 'face' as const, expr: e, angle: 18, t: 1 } })),
        { label: '게임 거리(7.5 m, 1600×900 그대로)', w: gameW, q: { rig, game: true, pose: 'walk', angle: 150, t: 1.3 } },
        { label: '먼 LOD 30 m (×3)', w: farW, q: { rig, game: true, lod: 'far' as const, dist: 30, zoom: 3, angle: 150, t: 1 } },
      ],
    },
  ];
}

/** 모든 동작 포즈 시트(플레이어 21 동작 + 이동 상태) — 8칸씩 줄 */
export function posesSheet(rig: RigRef, actions: readonly string[]): SheetRow[] {
  const all = [...LOCOMOTION.filter((p) => p !== 'idle'), ...actions];
  const rows: SheetRow[] = [];
  for (let i = 0; i < all.length; i += 8) {
    const chunk = all.slice(i, i + 8);
    rows.push({
      title: i === 0 ? '모든 포즈' : '', h: 440,
      cells: chunk.map((p, j) => ({ label: POSE_KO[p] ?? p, w: SHEET_W / 8, q: { rig, pose: p, angle: 28, t: 1.2 + (i + j) * 0.05 } })),
    });
  }
  return rows;
}

/** 줄 세우기 시트: 정면 · 게임 각도(뒤 위) · 실루엣, 각각 두 줄 */
export function lineupSheet(): SheetRow[] {
  const views: Array<{ title: string; q: Partial<StudioParams> }> = [
    { title: '정면', q: { angle: 0 } },
    { title: '게임 각도(뒤·위에서)', q: { angle: 160, pitch: 0.3 } },
    { title: '실루엣(정면 3/4)', q: { angle: 30, sil: true } },
  ];
  const rows: SheetRow[] = [];
  for (const v of views) for (const part of [0, 1]) {
    rows.push({ title: part === 0 ? v.title : '', h: 470, cells: [{ label: '', w: SHEET_W, q: { lineup: true, part, t: 1, ...v.q } }] });
  }
  return rows;
}

/** 줄 세우기 순서: 플레이어(키 기준)를 두 줄 모두 맨 앞에 두고 동물을 반씩 */
export function lineupParts<T>(kinds: readonly T[], parts = 2): T[][] {
  const n = Math.ceil(kinds.length / parts);
  return Array.from({ length: parts }, (_, i) => kinds.slice(i * n, (i + 1) * n));
}
