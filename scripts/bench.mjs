// 성능 벤치 — 품질 단계(높음·보통·낮음) × 정류장(장소 URL)마다 프레임 시간·draw call·삼각형·청크 대기·JS 힙을 잰다.
// 사용: node scripts/bench.mjs                         표 출력만
//      node scripts/bench.mjs --write-baseline        shots/bench-baseline.json 기록(기준선)
//      node scripts/bench.mjs --compare               기준선과 비교 — 넘으면 exit 1
//      --presets high,low   --only home-village,moon   --stops extra.json(정류장 추가·교체)
//      --frames 120  --settle 3000  --w 1600 --h 900 --dpr 1  --base http://127.0.0.1:5180/
//      --baseline <파일>  --out <파일>(이번 측정 JSON 저장)  --json(JSON 출력)  --frozen(shot 고정 시간, 기본은 live=1)
//      --calls-tol 0.10  --ms-tol 0.10  --ms-floor 1.0(ms 는 이만큼(ms)도 안 늘면 잡음으로 본다)
// --stops 파일: [{ "id": "ice-cave", "label": "얼음 동굴", "q": "spawn=ice", "eval": "await …" }]
//             또는 { "replace": true, "stops": [...] } — replace 면 기본 정류장을 버리고 이것만.
//      --base-only(웨이브 0 기준 정류장 8곳만)  --retries 2(측정 실패 다시 — 다른 작업의 HMR 새로고침에 걸리면)
// 범인 보고: 청크 레이어(키별) + 청크가 아닌 모듈 덩어리(mod:<모듈 이름>, 보이는 메시만) — 높음이 한도를 넘거나 기준선보다 늘면 같이 찍는다.
// 아래 '순수 함수' 구간은 tests/bench-parse.test.ts · tests/perf.test.ts 가 불러 쓴다(브라우저 없이 시험).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ───────────────────────── 순수 함수(시험 대상) ─────────────────────────

/** 성능 목표(CONTRACT.md: 1600×900, 높음 기준) */
export const LIMITS = { calls: 900, tris: 4_000_000 };
/** 기준선 대비 허용 증가(CONTRACT2: 정류장마다 +10%) */
export const DEFAULT_TOL = { calls: 0.1, ms: 0.1, msFloor: 1.0 };
export const PRESETS = ['high', 'medium', 'low'];

/** 오늘의 정류장. 이후 웨이브가 --stops 로 섬·행성 정류장을 더한다. */
export const DEFAULT_STOPS = [
  // spawn=home 은 섬 스폰 지점(마을 밖 들판)이라 마을은 상점 앞 좌표로 간다(PLACES.shop 근처)
  { id: 'home-village', label: '시작 마을', q: 'spawn=4,-4' },
  { id: 'home-wild', label: '시작 섬 들판', q: 'spawn=home' },
  { id: 'dino-valley', label: '공룡 골짜기', q: 'spawn=dino' },
  { id: 'coral-coast', label: '산호 해변', q: 'spawn=560,1260' },
  { id: 'mushroom-night', label: '버섯 섬 밤', q: 'spawn=mushroom&hour=22' },
  { id: 'desert', label: '사막 오아시스', q: 'spawn=desert' },
  { id: 'launch-pad', label: '발사대', q: 'spawn=300,-2360' },
  { id: 'moon', label: '달', q: 'world=space' },
];

/** 페이지 안 기다림(정류장 eval 에서 씀) */
const SLEEP = 'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));';

/**
 * 웨이브 6 정류장 — 기준선(웨이브 0)엔 없다(비교 땐 '새 정류장' 경고, 높음 한도는 본다).
 * 훅이 없으면(모듈이 빠짐) eval 이 던져서 '측정 실패'로 남는다. need = 그 훅이 없으면 건너뛰기(행성처럼 있을 때만).
 */
export const EXTRA_STOPS = [
  {
    // 산호섬 둘레에서 잠수 구역이 '산호초'인 첫 자리를 찾아 잠수
    id: 'reef-dive', label: '산호초 잠수', q: 'spawn=coral',
    eval: `${SLEEP}
      const p = __game.player.pos, cx = p.x, cz = p.z; let hit = null;
      for (let r = 30; r < 1200 && !hit; r += 15) for (let a = 0; a < 6.283 && !hit; a += 12 / r) {
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (__ocean.zoneAt(x, z).dive === 'reef') hit = [x, z];
      }
      if (!hit) throw new Error('산호초 자리를 못 찾았어요');
      __ocean.dive(hit[0], hit[1]); await sleep(600);`,
  },
  { id: 'desert-sandstorm', label: '사막 모래폭풍', q: 'spawn=desert', eval: `${SLEEP} __env.force('sandstorm'); await sleep(5500);` },
  { id: 'planet', label: '행성(사탕별)', q: 'world=space', need: '__planets', eval: `${SLEEP} __planets.go('sugar'); await sleep(1500);` },
  {
    id: 'boat-band', label: '해류 띠 위 배', q: 'spawn=home',
    eval: `${SLEEP} __seaworld.goBand(120); await sleep(300); const p = __game.player.pos;
      __vehicles.show('raft', p.x, p.z, 0); await sleep(1200);`,
  },
  { id: 'house-interior', label: '내 집 실내', q: 'spawn=4,-4', eval: `${SLEEP} if (!__interiors.enter('house')) throw new Error('집에 못 들어갔어요'); await sleep(1200);` },
  { id: 'moon-village', label: '달 토끼 마을', q: 'world=space', eval: `${SLEEP} __space.go('village'); await sleep(1200);` },
];

/** 기본 정류장 = 기준 8곳 + 웨이브 6 정류장 */
export const ALL_STOPS = [...DEFAULT_STOPS, ...EXTRA_STOPS];

/** `--a b --flag` → { a: 'b', flag: '1' } (shot.mjs 와 같은 규칙) */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (!v.startsWith('--')) continue;
    const next = argv[i + 1];
    out[v.slice(2)] = next !== undefined && !next.startsWith('--') ? next : '1';
  }
  return out;
}

/** 정류장 하나가 쓸 만한가 */
function validStop(s) {
  return s && typeof s === 'object' && typeof s.id === 'string' && /^[a-z0-9][a-z0-9:_-]*$/i.test(s.id)
    && (s.q === undefined || typeof s.q === 'string') && (s.eval === undefined || typeof s.eval === 'string')
    && (s.need === undefined || typeof s.need === 'string');
}

/**
 * 기본 정류장 + --stops JSON 을 합친다. 같은 id 는 뒤엣것이 덮는다.
 * extra: 배열 | { replace?, stops } | null
 */
export function mergeStops(base, extra) {
  if (extra == null) return base.map((s) => ({ ...s }));
  const list = Array.isArray(extra) ? extra : extra.stops;
  if (!Array.isArray(list)) throw new Error('--stops: 배열 또는 { stops: [...] } 이어야 해요');
  for (const s of list) if (!validStop(s)) throw new Error(`--stops: 잘못된 정류장 ${JSON.stringify(s)}`);
  const out = !Array.isArray(extra) && extra.replace ? [] : base.map((s) => ({ ...s }));
  for (const s of list) {
    const i = out.findIndex((o) => o.id === s.id);
    const v = { label: s.id, q: '', ...s };
    if (i >= 0) out[i] = v; else out.push(v);
  }
  return out;
}

/** 정류장 URL — 촬영 모드(GUI 숨김·URL 품질)·저장 무시 */
export function stopUrl(base, preset, stop, o = {}) {
  const b = base.endsWith('/') ? base : base + '/';
  const parts = ['shot=1', o.frozen ? '' : 'live=1', 'fresh=1', `quality=${preset}`, stop.q ?? ''].filter(Boolean);
  return `${b}?${parts.join('&')}`;
}

export function median(xs) {
  if (!xs.length) return NaN;
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function percentile(xs, p) {
  if (!xs.length) return NaN;
  const a = [...xs].sort((u, v) => u - v);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1))];
}

const r2 = (x) => Math.round(x * 100) / 100;

/** 페이지에서 모은 원시 표본 → 정류장 결과 */
export function summarize(raw) {
  return {
    ms: r2(median(raw.dts)),
    msP90: r2(percentile(raw.dts, 0.9)),
    fps: Math.round(1000 / median(raw.dts)),
    calls: Math.round(median(raw.calls)),
    callsMax: Math.max(...raw.calls),
    tris: Math.round(median(raw.tris)),
    trisMax: Math.max(...raw.tris),
    pending: Math.max(0, ...raw.pending),
    heapMB: raw.heap != null ? r2(raw.heap / 1048576) : null,
    layers: raw.layers ?? {},
    ...(raw.modules ? { modules: raw.modules } : {}),
    ...(raw.perf ? { perf: raw.perf } : {}),
  };
}

/**
 * 범인 모듈(청크가 아닌 덩어리, 보이는 메시만 센 것).
 * 기준선 정류장에 modules 가 있으면 늘어난 것만 증가량 순, 없으면 현재 메시 수 순.
 * @returns [{ key, meshes, tris, dMeshes, dTris }]
 */
export function offendingModules(cur, base, opts = {}) {
  const { top = 6, sortBy = 'meshes' } = opts;
  const C = cur?.modules ?? {}, B = base?.modules ?? null;
  const rows = Object.entries(C).map(([key, c]) => {
    const b = B?.[key];
    return { key, meshes: c.meshes, tris: c.tris, dMeshes: b ? c.meshes - b.meshes : B ? c.meshes : null, dTris: b ? c.tris - b.tris : B ? c.tris : null };
  });
  const k1 = sortBy === 'tris' ? 'tris' : 'meshes', k2 = k1 === 'tris' ? 'meshes' : 'tris';
  const v = (r, k) => (B ? (r[k === 'tris' ? 'dTris' : 'dMeshes'] ?? r[k]) : r[k]);
  return rows.filter((r) => (B ? (r.dMeshes ?? 0) > 0 || (r.dTris ?? 0) > 0 : r.meshes > 0 || r.tris > 0))
    .sort((a, b) => (v(b, k1) - v(a, k1)) || (v(b, k2) - v(a, k2))).slice(0, top);
}

/**
 * 범인 청크 레이어.
 * - growth(기본, 기준선이 있을 때): 기준선보다 늘어난 레이어만, 증가량 큰 순
 * - 기준선이 없거나 growth:false: 현재 값 큰 순(기준선이 있으면 증감도 붙여 줌)
 * sortBy: 'meshes'(draw call 문제) | 'tris'(삼각형 문제)
 * 세 번째 인자로 숫자를 주면 top 으로 받아요(예전 호출 호환).
 * @returns [{ key, objects, meshes, tris, dObjects, dMeshes, dTris }]
 */
export function offendingLayers(cur, base, opts = {}) {
  const { top = 6, sortBy = 'meshes', growth = true } = typeof opts === 'number' ? { top: opts } : opts;
  const keys = new Set([...Object.keys(cur?.layers ?? {}), ...Object.keys(base?.layers ?? {})]);
  const rows = [];
  for (const key of keys) {
    const c = cur?.layers?.[key] ?? { chunks: 0, objects: 0, meshes: 0, tris: 0 };
    const b = base?.layers?.[key];
    rows.push({
      key, chunks: c.chunks, objects: c.objects, meshes: c.meshes, tris: c.tris,
      dObjects: b ? c.objects - b.objects : null, dMeshes: b ? c.meshes - b.meshes : null, dTris: b ? c.tris - b.tris : null,
    });
  }
  // 정렬 열: 1순위 sortBy, 2순위 나머지(메시↔삼각형), 3순위 객체
  const order = sortBy === 'tris' ? ['tris', 'meshes', 'objects'] : ['meshes', 'objects', 'tris'];
  const dk = { meshes: 'dMeshes', objects: 'dObjects', tris: 'dTris' };
  const cmp = (useDelta) => (a, b) => {
    for (const k of order) {
      const va = useDelta ? (a[dk[k]] ?? a[k]) : a[k];
      const vb = useDelta ? (b[dk[k]] ?? b[k]) : b[k];
      if (vb !== va) return vb - va;
    }
    return 0;
  };
  if (base && growth) {
    return rows.filter((r) => (r.dMeshes ?? 0) > 0 || (r.dObjects ?? 0) > 0 || (r.dTris ?? 0) > 0 || !base.layers?.[r.key])
      .sort(cmp(true)).slice(0, top);
  }
  return rows.filter((r) => r.objects > 0 || r.meshes > 0 || r.tris > 0).sort(cmp(false)).slice(0, top);
}

/**
 * 판정. current/baseline = { presets: { high: { stops: { id: StopResult | { error } } } } }
 * - 높음: calls ≥ 900 또는 tris ≥ 4M 이면 실패(기준선 없이도)
 * - 모든 단계: 기준선 대비 calls 가 +tol.calls 넘게, ms 가 +tol.ms 넘게(그리고 msFloor ms 넘게) 늘면 실패
 * - 측정 실패(error)는 실패, 기준선에 없는 정류장·단계는 경고
 * @returns { ok, failures: [{preset, stop, kind, cur, base?, limit?, layers}], warnings: string[] }
 */
export function compareRuns(current, baseline, tol = DEFAULT_TOL, limits = LIMITS) {
  const t = { ...DEFAULT_TOL, ...tol };
  const failures = [];
  const warnings = [];
  for (const [preset, P] of Object.entries(current?.presets ?? {})) {
    const BP = baseline?.presets?.[preset];
    if (baseline && !BP) warnings.push(`기준선에 '${preset}' 단계가 없어요`);
    for (const [id, cur] of Object.entries(P.stops ?? {})) {
      const base = BP?.stops?.[id];
      const okBase = base && !base.error ? base : null;
      if (cur.error) { failures.push({ preset, stop: id, kind: 'error', cur: cur.error, layers: [] }); continue; }
      if (cur.skipped) { warnings.push(`'${preset}/${id}' 건너뜀: ${cur.skipped}`); continue; }
      if (preset === 'high') {
        if (cur.calls >= limits.calls) failures.push({ preset, stop: id, kind: 'calls-limit', cur: cur.calls, limit: limits.calls, hasBase: !!okBase, layers: offendingLayers(cur, okBase, { growth: false, sortBy: 'meshes' }), modules: offendingModules(cur, null, { sortBy: 'meshes' }) });
        if (cur.tris >= limits.tris) failures.push({ preset, stop: id, kind: 'tris-limit', cur: cur.tris, limit: limits.tris, hasBase: !!okBase, layers: offendingLayers(cur, okBase, { growth: false, sortBy: 'tris' }), modules: offendingModules(cur, null, { sortBy: 'tris' }) });
      }
      if (!baseline) continue;
      if (!okBase) { warnings.push(`기준선에 '${preset}/${id}' 가 없어요(새 정류장)`); continue; }
      if (cur.calls > okBase.calls * (1 + t.calls)) {
        failures.push({ preset, stop: id, kind: 'calls-regress', cur: cur.calls, base: okBase.calls, hasBase: true, layers: offendingLayers(cur, okBase, { sortBy: 'meshes' }), modules: offendingModules(cur, okBase, { sortBy: 'meshes' }) });
      }
      if (cur.ms > okBase.ms * (1 + t.ms) && cur.ms - okBase.ms > t.msFloor) {
        failures.push({ preset, stop: id, kind: 'ms-regress', cur: cur.ms, base: okBase.ms, hasBase: true, layers: offendingLayers(cur, okBase, { sortBy: 'meshes' }), modules: offendingModules(cur, okBase, { sortBy: 'meshes' }) });
      }
    }
  }
  if (baseline && current?.env && baseline.env) {
    const a = current.env, b = baseline.env;
    if (a.w !== b.w || a.h !== b.h || a.dpr !== b.dpr) warnings.push(`해상도가 기준선과 달라요: ${a.w}×${a.h}@${a.dpr} ↔ ${b.w}×${b.h}@${b.dpr}`);
    if (a.gpu && b.gpu && a.gpu !== b.gpu) warnings.push(`GPU 가 기준선과 달라요 — ms 비교는 참고만: ${a.gpu} ↔ ${b.gpu}`);
    if (a.live !== b.live) warnings.push('live/frozen 모드가 기준선과 달라요');
  }
  return { ok: failures.length === 0, failures, warnings };
}

const fmtN = (n) => (n == null || Number.isNaN(n) ? '-' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(0) + 'k' : String(n));
const pad = (s, n) => { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); };
const lpad = (s, n) => { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; };
const pct = (c, b) => (b ? `${c >= b ? '+' : ''}${(((c - b) / b) * 100).toFixed(0)}%` : '');

/** 결과 표(기준선이 있으면 증감 % 도) */
export function formatTable(current, baseline) {
  const head = [pad('단계', 7), pad('정류장', 16), lpad('ms', 7), lpad('p90', 7), lpad('fps', 4), lpad('calls', 6), lpad('Δ', 5), lpad('tris', 7), lpad('Δms', 5), lpad('대기', 4), lpad('힙MB', 6)].join(' ');
  const lines = [head, '-'.repeat(head.length + 4)];
  for (const [preset, P] of Object.entries(current.presets ?? {})) {
    for (const [id, s] of Object.entries(P.stops ?? {})) {
      if (s.error) { lines.push(`${pad(preset, 7)} ${pad(id, 16)} 오류: ${s.error}`); continue; }
      if (s.skipped) { lines.push(`${pad(preset, 7)} ${pad(id, 16)} 건너뜀: ${s.skipped}`); continue; }
      const b = baseline?.presets?.[preset]?.stops?.[id];
      const ok = b && !b.error;
      const f2 = (x) => (typeof x === 'number' ? x.toFixed(2) : '-');
      lines.push([pad(preset, 7), pad(id, 16), lpad(f2(s.ms), 7), lpad(f2(s.msP90), 7), lpad(s.fps ?? '-', 4),
        lpad(s.calls, 6), lpad(ok ? pct(s.calls, b.calls) : '', 5), lpad(fmtN(s.tris), 7), lpad(ok ? pct(s.ms, b.ms) : '', 5),
        lpad(s.pending ?? '-', 4), lpad(s.heapMB ?? '-', 6)].join(' '));
    }
  }
  return lines.join('\n');
}

const KIND_TEXT = {
  'error': '측정 실패', 'calls-limit': 'draw call 한도', 'tris-limit': '삼각형 한도', 'calls-regress': 'draw call 증가', 'ms-regress': '프레임 시간 증가',
};

/** 실패 목록 + 범인 레이어 */
export function formatFailures(res) {
  const out = [];
  for (const f of res.failures) {
    const what = f.kind === 'error' ? f.cur
      : f.limit != null ? `${fmtN(f.cur)} ≥ ${fmtN(f.limit)}`
      : `${f.cur} ← 기준선 ${f.base} (${pct(f.cur, f.base)})`;
    // 정류장 자체가 기준선에 없으면 레이어 증감 꼬리표는 생략(새 정류장 표시만)
    const hasBase = f.hasBase ?? f.base != null;
    out.push(`✗ ${f.preset}/${f.stop}  ${KIND_TEXT[f.kind] ?? f.kind}: ${what}${hasBase || f.kind === 'error' ? '' : '  (새 정류장)'}`);
    const sg = (n) => `${n >= 0 ? '+' : '-'}${fmtN(Math.abs(n))}`;
    for (const L of f.layers ?? []) {
      const d = !hasBase ? ''
        : L.dMeshes != null ? `  (메시 ${sg(L.dMeshes)}, 객체 ${sg(L.dObjects)}, 삼각형 ${sg(L.dTris)})` : '  (기준선에 없는 레이어)';
      out.push(`    · ${pad(L.key, 18)} 청크 ${lpad(L.chunks, 3)}  객체 ${lpad(L.objects, 5)}  메시 ${lpad(L.meshes, 4)}  삼각형 ${lpad(fmtN(L.tris), 6)}${d}`);
    }
    for (const M of f.modules ?? []) {
      const d = M.dMeshes != null ? `  (메시 ${sg(M.dMeshes)}, 삼각형 ${sg(M.dTris)})` : '';
      out.push(`    ◦ ${pad(M.key, 18)} 보이는 메시 ${lpad(M.meshes, 4)}  삼각형 ${lpad(fmtN(M.tris), 6)}${d}`);
    }
  }
  for (const w of res.warnings) out.push(`! ${w}`);
  return out.join('\n');
}

// ───────────────────────── 측정(브라우저) ─────────────────────────

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'shots/bench-baseline.json');

/** 플랫폼별 GPU 백엔드(이 맥에서 d3d11 은 멈춘다) */
export function chromiumArgs(platform = process.platform) {
  const angle = platform === 'darwin' ? ['--use-angle=metal'] : platform === 'win32' ? ['--use-angle=d3d11'] : [];
  // vsync·프레임 제한을 풀어야 60fps 아래로 숨은 비용이 ms 에 보인다
  return [...angle, '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'];
}

/** 페이지 안: N 프레임 표본(rAF 간격·renderer 통계·청크 대기) */
function samplePage(N) {
  return new Promise((resolve) => {
    const w = window;
    const dts = [], calls = [], tris = [], pending = [];
    let last = -1, n = 0;
    const step = (now) => {
      if (last >= 0) {
        dts.push(now - last);
        const s = w.__stats ?? { calls: 0, triangles: 0 };
        calls.push(s.calls); tris.push(s.triangles);
        pending.push(w.__game?.chunks?.pending ?? 0);
      }
      last = now;
      if (++n <= N) requestAnimationFrame(step);
      else resolve({ dts, calls, tris, pending });
    };
    requestAnimationFrame(step);
  });
}

/** 페이지 안: 청크 레이어별 객체·메시·삼각형(키가 겹치면 합산) */
function layerCensus() {
  const g = window.__game;
  const out = {};
  if (!g?.chunks?.layers) return out;
  for (const L of g.chunks.layers) {
    const key = L.layer.key;
    const r = out[key] ?? (out[key] = { chunks: 0, objects: 0, meshes: 0, tris: 0 });
    for (const v of L.live.values()) {
      if (!v.obj) continue;
      r.chunks++;
      v.obj.traverse((o) => {
        r.objects++;
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
        r.meshes++;
        if (!o.isMesh || !o.geometry) return;
        const geo = o.geometry;
        const c = geo.index ? geo.index.count : geo.attributes?.position?.count ?? 0;
        const inst = o.isInstancedMesh ? o.count : 1;
        r.tris += Math.floor(c / 3) * inst;
      });
    }
  }
  return out;
}

/**
 * 페이지 안: 청크가 아닌 덩어리를 모듈 이름별로(보이는 메시만 — 숨긴 실내·다른 세계는 안 센다).
 * 장면 최상위(모듈이 돌려준 Group = 모듈 이름) + game.root / spaceRoot 의 자식(이름 없으면 '(이름 없음)').
 */
function moduleCensus() {
  const g = window.__game, e = window.__engine;
  const out = {};
  if (!e?.scene) return out;
  const chunksRoot = g?.chunks?.root;
  const add = (key, obj) => {
    const r = out[key] ?? (out[key] = { meshes: 0, tris: 0 });
    const walk = (o) => {
      if (!o.visible) return;
      if (o.isMesh && o.geometry) {
        r.meshes++;
        const geo = o.geometry;
        const c = geo.index ? geo.index.count : geo.attributes?.position?.count ?? 0;
        r.tris += Math.floor(c / 3) * (o.isInstancedMesh ? o.count : 1);
      } else if (o.isPoints || o.isLine || o.isSprite) r.meshes++;
      for (const ch of o.children) walk(ch);
    };
    walk(obj);
    if (!r.meshes) delete out[key];
  };
  for (const o of e.scene.children) {
    if (o === chunksRoot || o.name === 'sky' || !o.visible) continue;
    if (g && (o === g.root || o === g.spaceRoot)) {
      const pre = o === g.root ? 'root' : 'space';
      for (const ch of o.children) add(`mod:${pre}/${ch.name || '(이름 없음)'}`, ch);
      continue;
    }
    if (o.isLight || o.isCamera) continue;
    add(`mod:${o.name || o.type}`, o);
  }
  return out;
}

async function measureStop(page, url, stop, o) {
  await page.goto(url, { timeout: o.timeout });
  await page.waitForFunction(() => window.__ready === true || (window.__errors?.length > 0 && window.__modules), null, { timeout: o.timeout });
  const errs0 = await page.evaluate(() => window.__errors ?? []);
  if (!(await page.evaluate(() => window.__ready === true))) throw new Error('준비 실패: ' + errs0.slice(0, 3).join(' / '));
  if (stop.need && !(await page.evaluate((k) => k in window, stop.need))) return { skipped: `${stop.need} 없음` };
  if (stop.eval) {
    await page.evaluate(`(async () => { ${stop.eval} })()`);
    // eval 로 옮겼으면 새 청크가 다 만들어질 때까지
    await page.waitForFunction(() => (window.__game?.chunks?.pending ?? 0) === 0, null, { timeout: o.timeout }).catch(() => {});
  }
  await page.waitForTimeout(o.settle);
  const raw = await page.evaluate(samplePage, o.frames);
  raw.layers = await page.evaluate(layerCensus);
  raw.modules = await page.evaluate(moduleCensus);
  raw.perf = await page.evaluate(() => window.__perf?.state?.() ?? null);
  raw.heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  const errs = await page.evaluate(() => window.__errors ?? []);
  const res = summarize(raw);
  if (errs.length) res.errors = errs.slice(0, 5);
  return res;
}

function gitInfo() {
  try {
    const head = fs.readFileSync(path.join(ROOT, '.git/HEAD'), 'utf8').trim();
    const ref = head.startsWith('ref: ') ? head.slice(5) : null;
    let commit = ref ? null : head;
    if (ref) {
      const p = path.join(ROOT, '.git', ref);
      if (fs.existsSync(p)) commit = fs.readFileSync(p, 'utf8').trim();
      else {
        const packed = fs.readFileSync(path.join(ROOT, '.git/packed-refs'), 'utf8');
        commit = packed.split('\n').find((l) => l.endsWith(' ' + ref))?.split(' ')[0] ?? null;
      }
    }
    return { branch: ref?.replace('refs/heads/', '') ?? null, commit: commit?.slice(0, 12) ?? null };
  } catch { return { branch: null, commit: null }; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const W = Number(args.w ?? 1600), H = Number(args.h ?? 900), DPR = Number(args.dpr ?? 1);
  const BASE = args.base ?? 'http://127.0.0.1:5180/';
  const o = { frames: Number(args.frames ?? 120), settle: Number(args.settle ?? 3000), timeout: Number(args.timeout ?? 90000), frozen: !!args.frozen, retries: Number(args.retries ?? 2) };
  const presets = (args.presets ?? PRESETS.join(',')).split(',').filter((p) => PRESETS.includes(p));
  const extra = args.stops ? JSON.parse(fs.readFileSync(path.resolve(args.stops), 'utf8')) : null;
  let stops = mergeStops(args['base-only'] ? DEFAULT_STOPS : ALL_STOPS, extra);
  if (args.only) { const ids = args.only.split(','); stops = stops.filter((s) => ids.includes(s.id)); }
  const baselinePath = path.resolve(args.baseline ?? BASELINE);
  const baseline = args.compare ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : (fs.existsSync(baselinePath) && !args['write-baseline'] ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null);

  if (!args.base) {
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/ensure-dev.mjs')], { cwd: ROOT, stdio: 'inherit' });
  }

  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: chromiumArgs() });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

  const current = {
    version: 1,
    createdAt: new Date().toISOString(),
    git: gitInfo(),
    env: { w: W, h: H, dpr: DPR, platform: process.platform, gpu: null, live: !o.frozen, frames: o.frames, settleMs: o.settle },
    limits: LIMITS,
    tolerance: { calls: Number(args['calls-tol'] ?? DEFAULT_TOL.calls), ms: Number(args['ms-tol'] ?? DEFAULT_TOL.ms), msFloor: Number(args['ms-floor'] ?? DEFAULT_TOL.msFloor) },
    stops,
    presets: {},
  };
  for (const preset of presets) {
    current.presets[preset] = { stops: {} };
    for (const stop of stops) {
      const url = stopUrl(BASE, preset, stop, o);
      const t0 = Date.now();
      try {
        let r = null;
        for (let a = 0; ; a++) {
          try { r = await measureStop(page, url, stop, o); break; }
          catch (e) {
            if (a >= o.retries) throw e;
            console.log(`  ${preset}/${stop.id}  다시 재요(${a + 1}/${o.retries}): ${String(e.message ?? e).split('\n')[0]}`);
            await page.waitForTimeout(2000);
          }
        }
        if (!current.env.gpu) current.env.gpu = await page.evaluate(() => window.__gpu ?? null);
        current.presets[preset].stops[stop.id] = r;
        if (r.skipped) console.log(`  ${preset}/${stop.id}  건너뜀: ${r.skipped}`);
        else console.log(`  ${preset}/${stop.id}  ${r.ms} ms  calls=${r.calls} tris=${fmtN(r.tris)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      } catch (e) {
        current.presets[preset].stops[stop.id] = { error: String(e.message ?? e).split('\n')[0] };
        console.log(`  ${preset}/${stop.id}  오류: ${e.message}`);
      }
    }
  }
  await browser.close();

  console.log('\n' + formatTable(current, baseline));
  console.log(`(${W}×${H}@${DPR}, ${current.env.gpu}, ${o.frames}프레임 중앙값 · headless 라 ms 는 같은 기계끼리만 비교)`);
  if (logs.length) console.log('console:\n  ' + [...new Set(logs)].slice(0, 20).join('\n  '));

  if (args.out) { fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true }); fs.writeFileSync(path.resolve(args.out), JSON.stringify(current, null, 2) + '\n'); }
  if (args.json) console.log(JSON.stringify(current, null, 2));

  let exit = 0;
  if (args['write-baseline']) {
    const bad = Object.values(current.presets).flatMap((P) => Object.entries(P.stops).filter(([, s]) => s.error).map(([id]) => id));
    if (bad.length && !args.force) { console.log(`\n기준선을 쓰지 않았어요 — 측정 실패: ${bad.join(', ')} (--force 로 강제)`); exit = 1; }
    else { fs.mkdirSync(path.dirname(baselinePath), { recursive: true }); fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n'); console.log(`\n기준선 기록: ${path.relative(ROOT, baselinePath)}`); }
  }
  // 판정은 늘 찍는다(높음 한도 범인은 기준선 없이도 보인다). exit 1 은 --compare / --write-baseline 때만
  const judged = args.compare || args['write-baseline'];
  const res = compareRuns(current, args.compare ? baseline : null, current.tolerance);
  const text = formatFailures(res);
  if (text) console.log('\n' + text);
  if (judged) {
    console.log(res.ok ? '\n✓ 성능 기준 통과' : `\n✗ 성능 기준 실패 ${res.failures.length}건`);
    if (!res.ok) exit = 1;
  } else if (!res.ok) console.log(`\n(참고) 높음 한도 초과 ${res.failures.length}건 — --compare 로 기준선 비교`);
  process.exit(exit);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
