// URL 파라미터:
//   solo=terrain,flora   이 모듈만 불러오기
//   tod=day|morning|sunset|night   cam=ac|close|wide|low|river|beach
//   shot=1   GUI 숨김·고정 시간(t=초, 기본 1.5)·준비되면 window.__ready
//   fx=ao:0,tilt:0   효과 끄기      curve=0.004   땅 휘는 정도
import { Engine } from './core/engine';

const q = new URLSearchParams(location.search);
const shot = q.get('shot') === '1';
const fx: Record<string, boolean> = {};
for (const kv of (q.get('fx') ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  fx[k] = v !== '0';
}
const w = window as unknown as { __ready?: boolean; __errors?: string[]; __gpu?: string; __modules?: string[] };
w.__errors = [];
window.addEventListener('error', (e) => w.__errors!.push(String(e.message)));

const engine = new Engine({
  solo: q.get('solo') ? q.get('solo')!.split(',') : null,
  tod: q.get('tod') ?? 'day',
  cam: q.get('cam') ?? 'ac',
  shot,
  freezeT: shot ? Number(q.get('t') ?? 1.5) : null,
  fx,
  curveK: q.get('curve') !== null ? Number(q.get('curve')) : null,
});

const gl = engine.renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
w.__gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';

const names = await engine.loadModules();
w.__modules = names;
w.__errors.push(...engine.errors);
if (!shot) {
  engine.enableControls();
  engine.buildGui();
  const hud = document.getElementById('hud')!;
  hud.textContent = `모듈: ${names.join(', ') || '(없음)'} · 드래그로 회전, 휠로 확대`;
}
// 프레임 시간(최근 60프레임 평균 ms)과 렌더 통계
const times: number[] = [];
let last = performance.now();
const ww = w as typeof w & { __frameMs?: number; __stats?: { calls: number; triangles: number } };
engine.start((n) => {
  const now = performance.now();
  times.push(now - last); last = now;
  if (times.length > 60) times.shift();
  ww.__frameMs = times.reduce((a, b) => a + b, 0) / times.length;
  const info = engine.renderer.info.render;
  ww.__stats = { calls: info.calls, triangles: info.triangles };
  if (n === 12) w.__ready = true;
});
