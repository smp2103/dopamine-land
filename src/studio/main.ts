// 캐릭터 스튜디오(개발 도구, /studio.html) — 리그 하나(또는 줄 세우기)를 게임과 같은 조명·톤매핑·후처리로 홀로 그린다.
// 엔진(core/engine)을 모듈 없이 그대로 띄워 쓴다 → 해·하늘빛·역광·AO·블룸·Neutral 톤매핑·색보정·틸트가 게임과 같은 값.
// window.__studio = { ready, params, set(q), render(), stats(), sheet(kind, rig?) } — scripts/charshot.mjs 가 접촉 시트를 뽑는다.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../core/engine';
import { applyCurve } from '../core/curve';
import {
  parseStudioParams, rigKey, rigSheet, posesSheet, lineupSheet, lineupParts, parseRig, GAME_VIEW, SHEET_W,
  type StudioParams, type SheetRow, type RigRef,
} from './params';
import { buildStudioRig, LINEUP_KINDS, type StudioRig, type StepResult } from './rigs';
import { cyclorama, grass, props, SIL_MAT } from './stage';
import { PLAYER_POSES } from '../modules/characters/player';

interface Stats { meshes: number; drawCalls: number; tris: number }
interface RigStats extends Stats { key: string; name: string; far: Stats | null }
interface SetResult { ok: boolean; error?: string; notes: string[]; labels: Array<{ x: number; y: number; text: string }> }

const q0 = parseStudioParams(location.search);
const urlHasT = new URLSearchParams(location.search).has('t');

const engine = new Engine({
  solo: [], tod: q0.tod, cam: 'adventure', shot: true, freezeT: null,
  fx: { curve: false }, curveK: 0, quality: 'high', adaptive: false,
});
// 게임과 같은 넓은 세계 안개(main.ts 가 게임 모드에서 거는 값)
engine.fogOverride = { near: 120, far: 2600 };
engine.applyTod(engine.todName);
const { renderer, scene, camera, composer } = engine;
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.left = renderer.domElement.style.top = '0';

const cyclo = cyclorama();
const field = grass();
const deco = props();
scene.add(cyclo, field, deco);
applyCurve(scene);

const stage = new THREE.Group();
stage.name = 'studio-stage';
scene.add(stage);

let params: StudioParams = q0;
let rigs: StudioRig[] = [];
let lastNotes: string[] = [];
const errors: string[] = [];
const target = new THREE.Vector3();
let controls: OrbitControls | null = null;
/** 스크립트가 set() 을 부르면 저절로 도는 화면 루프를 멈춘다(그림이 섞이지 않게) */
let manual = false;
let pr = Math.min(window.devicePixelRatio || 1, 2);

function setSize(w: number, h: number) {
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/** 줄 세우기: 리그마다 받침(돌려 세우기·자리 잡기용) */
let holders: THREE.Group[] = [];
function clearRigs() {
  for (const r of rigs) { r.root.removeFromParent(); r.dispose(); }
  for (const h of holders) h.removeFromParent();
  rigs = []; holders = [];
}

/** 포즈 잡기: t 직전 1.5 초를 60 fps 로 돌려 이차 움직임(스프링)까지 자리 잡게 */
function pose(r: StudioRig, p: StudioParams): StepResult {
  const dt = 1 / 60;
  let res: StepResult = { fallback: false, noExpr: false };
  for (let tt = Math.max(0, p.t - 1.5); tt < p.t; tt += dt) res = r.step(tt, dt, p.pose, p.expr);
  res = r.step(p.t, dt, p.pose, p.expr);
  return res;
}

function boxOf(o: THREE.Object3D): THREE.Box3 {
  o.updateWorldMatrix(true, true);
  const b = new THREE.Box3();
  o.traverseVisible((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || m.name.startsWith('studio-') || (m.material as THREE.Material)?.transparent && (m.material as THREE.MeshBasicMaterial).depthWrite === false) return;
    m.geometry.computeBoundingBox();
    b.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
  });
  if (b.isEmpty()) b.set(new THREE.Vector3(-0.4, 0, -0.4), new THREE.Vector3(0.4, 1.2, 0.4));
  return b;
}

function statsOf(root: THREE.Object3D): Stats {
  let meshes = 0, drawCalls = 0, tris = 0;
  root.updateMatrixWorld(true);
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    const n = (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    drawCalls += Array.isArray(m.material) ? Math.max(1, g.groups.length) : 1;
    tris += Math.round(n * inst);
  });
  return { meshes, drawCalls, tris };
}

function rigStats(r: StudioRig): RigStats {
  const near = statsOf(r.root);
  let far: Stats | null = null;
  if (r.hasLod) {
    r.setLod('far');
    far = statsOf(r.root);
    r.setLod(params.lod);
  }
  return { key: r.key, name: r.name, ...near, far };
}

function placeCamera(p: StudioParams, res: SetResult) {
  camera.clearViewOffset();
  const w = renderer.domElement.width / pr, h = renderer.domElement.height / pr;
  const aspect = w / h;
  const rad = THREE.MathUtils.degToRad(p.angle);
  const dir = new THREE.Vector3(Math.sin(rad), 0, Math.cos(rad));
  engine.camName = 'adventure';

  if (p.lineup) {
    // 줄 세우기는 카메라 대신 캐릭터를 제자리에서 돌린다(angle) — 원근으로 줄이 비스듬해지지 않게, 모두 같은 크기로
    dir.set(0, 0, 1);
    stage.updateMatrixWorld(true);
    const b = new THREE.Box3();
    for (const hd of holders) b.union(boxOf(hd));
    const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    camera.fov = p.fov ?? 16;
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const span = Math.max(s.y * 1.35, (Math.max(s.x, s.z) * 1.04) / aspect);
    const d = p.dist ?? span / 2 / Math.tan(half) + s.z / 2;
    const el = p.pitch ?? 0.07;
    target.set(c.x, c.y, c.z);
    camera.position.copy(target).addScaledVector(dir, d * Math.cos(el)).add(new THREE.Vector3(0, d * Math.sin(el), 0));
    if (p.h !== null) camera.position.y = p.h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    camera.updateMatrixWorld();
    // 이름표: 발밑 바로 아래 화면 좌표
    for (const [i, r] of rigs.entries()) {
      const rb = boxOf(holders[i] ?? r.root);
      const v = new THREE.Vector3((rb.min.x + rb.max.x) / 2, rb.min.y, (rb.min.z + rb.max.z) / 2).project(camera);
      res.labels.push({ x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, text: r.name });
    }
    return;
  }

  const r = rigs[0];
  if (!r) return;
  const b = boxOf(r.root);
  const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  const restH = (r.root.userData.studioRestH as number | undefined) ?? s.y;

  if (p.game) {
    // 게임 카메라(game.ts CameraRig): 기준점 = 발 + 1.1 m, 모험 = pitch 0.3 · 7.5 m · fov 50, 아늑 = 0.72 · 15 m · 32
    const cozy = p.cam === 'cozy';
    const pitch = p.pitch ?? (cozy ? 0.72 : 0.3);
    const d = p.dist ?? (cozy ? 15 : 7.5);
    camera.fov = p.fov ?? (cozy ? 32 : 50);
    engine.camName = cozy ? 'cozy' : 'adventure';
    target.set(0, 1.1, 0);
    camera.position.set(dir.x * Math.cos(pitch) * d, 1.1 + Math.sin(pitch) * d, dir.z * Math.cos(pitch) * d);
    camera.aspect = GAME_VIEW.w / GAME_VIEW.h;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    camera.updateMatrixWorld();
    // 1600×900 게임 화면에서 캐릭터 둘레를 그 픽셀 크기 그대로 잘라 낸다(zoom > 1 이면 확대)
    const v = c.clone().project(camera);
    const px = (v.x + 1) / 2 * GAME_VIEW.w, py = (1 - v.y) / 2 * GAME_VIEW.h;
    const vw = w / p.zoom, vh = h / p.zoom;
    camera.setViewOffset(GAME_VIEW.w, GAME_VIEW.h, px - vw / 2, py - vh / 2, vw, vh);
    camera.updateProjectionMatrix();
    return;
  }

  if (p.frame === 'face') {
    const head = r.head();
    let hc: THREE.Vector3, hs: number;
    if (head) {
      const hb = boxOf(head);
      hc = hb.getCenter(new THREE.Vector3());
      const sz = hb.getSize(new THREE.Vector3());
      hs = Math.max(sz.x, sz.y);
    } else {
      // 머리를 못 찾으면: 키로 짐작(플레이어 2~2.5등신)
      // 동물은 머리가 더 크다(키의 ~60 %)
      const k = r.family === 'animal' ? { y: 0.31, s: 0.66 } : { y: 0.25, s: 0.56 };
      hc = new THREE.Vector3(c.x, b.max.y - restH * k.y, c.z);
      hs = restH * k.s;
      res.notes.push('머리 못 찾음(rig.head 없음) — 키로 짐작');
    }
    camera.fov = p.fov ?? 22;
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const d = p.dist ?? (hs * 1.3) / 2 / Math.tan(half) / Math.min(1, aspect);
    target.copy(hc);
    camera.position.copy(hc).addScaledVector(dir, d).add(new THREE.Vector3(0, d * 0.06, 0));
    if (p.h !== null) camera.position.y = p.h;
  } else {
    camera.fov = p.fov ?? 26;
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const span = Math.max(restH * 1.22, s.y * 1.1, (Math.max(s.x, s.z) * 1.15) / aspect);
    const d = p.dist ?? span / 2 / Math.tan(half);
    target.set(c.x, b.min.y + Math.max(s.y, restH) / 2, c.z);
    camera.position.copy(target).addScaledVector(dir, d * Math.cos(0.1)).add(new THREE.Vector3(0, d * Math.sin(0.1), 0));
    if (p.h !== null) camera.position.y = p.h;
  }
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
}

function applyBg(p: StudioParams) {
  const sil = p.sil;
  cyclo.visible = !sil && p.bg === 'studio';
  field.visible = !sil && p.bg === 'grass';
  deco.visible = !sil && p.game && (p.dist ?? 0) < 15;
  engine.sky.visible = !sil;
  scene.background = sil ? new THREE.Color('#ffffff') : null;
}

async function makeRigs(p: StudioParams): Promise<StudioRig[]> {
  if (!p.lineup) return [await buildStudioRig(p.rig)];
  const parts = p.part === null ? [LINEUP_KINDS] : lineupParts(LINEUP_KINDS, 2);
  const kinds = parts[Math.min(p.part ?? 0, parts.length - 1)];
  const out: StudioRig[] = [await buildStudioRig({ type: 'player', id: 'player' })];
  for (const k of kinds) out.push(await buildStudioRig({ type: 'animal', id: k }));
  return out;
}

async function set(input: string | Partial<StudioParams> | Record<string, unknown>): Promise<SetResult> {
  manual = true;
  const p = typeof input === 'string' ? parseStudioParams(input) : normalize(input as Partial<StudioParams>);
  const res: SetResult = { ok: true, notes: [], labels: [] };
  if (p.tod !== engine.todName) engine.applyTod(p.tod);
  params = p;
  applyBg(p);
  clearRigs();
  try {
    rigs = await makeRigs(p);
  } catch (e) {
    res.ok = false;
    res.error = e instanceof Error ? e.message : String(e);
    errors.push(res.error);
    lastNotes = [res.error];
    return res;
  }
  let x = 0;
  for (const r of rigs) {
    applyCurve(r.root);
    stage.add(r.root);
    // 가만히 선 키(돌려 보기·포즈 칸 크기를 맞추는 기준)
    r.step(0, 1 / 60, 'idle', null);
    r.root.userData.studioRestH = boxOf(r.root).getSize(new THREE.Vector3()).y;
    if (p.lod === 'far' && !r.setLod('far')) res.notes.push(`${r.name}: 먼 LOD 훅 없음(setLod)`);
    const st = pose(r, p);
    if (st.fallback) res.notes.push(`${r.name}: '${p.pose}' 포즈 없음 → 가만히`);
    if (st.noExpr) res.notes.push(`${r.name}: 표정 훅 없음(setExpression)`);
    if (p.lineup) {
      const hold = new THREE.Group();
      hold.name = `studio-hold-${r.key}`;
      stage.add(hold);
      hold.add(r.root);
      hold.rotation.y = -THREE.MathUtils.degToRad(p.angle);
      holders.push(hold);
      const b = boxOf(hold);
      hold.position.x = x - b.min.x;
      x += b.max.x - b.min.x + 0.32;
    }
    if (p.sil) r.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if ((m.material as THREE.Material)?.transparent) m.visible = false; else m.material = SIL_MAT;
    });
  }
  if (p.lineup) for (const h of holders) h.position.x -= x / 2;
  if (p.size) setSize(p.size.w, p.size.h);
  placeCamera(p, res);
  if (controls) { controls.target.copy(target); controls.update(); }
  lastNotes = res.notes;
  render();
  return res;
}

function normalize(o: Partial<StudioParams>): StudioParams {
  // 객체로 주면: 키 이름 그대로 덮어쓰고, rig 는 문자열('animal:bear')도 받는다
  const base = parseStudioParams('');
  const rig = typeof (o as { rig?: unknown }).rig === 'string' ? parseRig((o as unknown as { rig: string }).rig) : (o.rig as RigRef | undefined);
  const p: StudioParams = { ...base, ...o, rig: rig ?? base.rig };
  if (p.game && o.bg === undefined) p.bg = 'grass';
  return p;
}

function render() {
  engine.viewTarget.copy(target);
  engine.updateView();
  renderer.info.reset();
  if (params.sil) renderer.render(scene, camera);
  else composer.render(1 / 60);
}

function stats() {
  const per = rigs.map(rigStats);
  const sum = per.reduce((a, s) => ({ meshes: a.meshes + s.meshes, drawCalls: a.drawCalls + s.drawCalls, tris: a.tris + s.tris }), { meshes: 0, drawCalls: 0, tris: 0 });
  return { ...sum, rigs: per, frame: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles } };
}

// ───────────── 접촉 시트(캔버스로 합치기) ─────────────
const FONT = "'Jua', 'Apple SD Gothic Neo', system-ui, sans-serif";
async function fontsReady() {
  try { await Promise.race([document.fonts.load(`20px Jua`), new Promise((r) => setTimeout(r, 3000))]); } catch { /* 둥근 시스템 글꼴로 */ }
}

async function sheet(kind: 'rig' | 'poses' | 'lineup', rigStr?: string) {
  await fontsReady();
  const rig = parseRig(rigStr ?? 'player') ?? { type: 'player' as const, id: 'player' };
  let rows: SheetRow[];
  if (kind === 'lineup') rows = lineupSheet();
  else if (kind === 'poses') {
    const acts = rig.type === 'player' || rig.type === 'concept' ? PLAYER_POSES : ['talk', 'wave', 'happy', 'cheer', 'hold'];
    rows = posesSheet(rig, acts);
  } else rows = rigSheet(rig);
  const keepPr = pr;
  pr = 1;
  const HEAD = 96, TITLE = 34, LABEL = 30;
  const H = HEAD + rows.reduce((a, r) => a + r.h + LABEL + (r.title ? TITLE : 0), 0) + 16;
  const cv = document.createElement('canvas');
  cv.width = SHEET_W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fbf6ef'; g.fillRect(0, 0, SHEET_W, H);
  const notes = new Set<string>();
  let y = HEAD;
  let st: ReturnType<typeof stats> | null = null;
  for (const row of rows) {
    if (row.title) {
      g.fillStyle = '#6b4f7a'; g.font = `26px ${FONT}`; g.textBaseline = 'middle';
      g.fillText(row.title, 14, y + TITLE / 2);
      y += TITLE;
    }
    let x = 0;
    for (const cell of row.cells) {
      const res = await set({ ...cell.q, size: { w: Math.round(cell.w), h: row.h }, orbit: false });
      if (!st && res.ok) st = stats();
      if (res.ok) g.drawImage(renderer.domElement, x, y, Math.round(cell.w), row.h);
      else { g.fillStyle = '#ffdede'; g.fillRect(x, y, cell.w, row.h); g.fillStyle = '#b03030'; g.font = `20px ${FONT}`; g.fillText(res.error ?? '오류', x + 12, y + 30); }
      // 이름표(줄 세우기)
      g.font = `20px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'top';
      for (const l of res.labels) {
        const lx = x + l.x, ly = Math.min(y + row.h - 26, y + l.y + 6);
        g.fillStyle = '#ffffffcc'; const tw = g.measureText(l.text).width;
        g.fillRect(lx - tw / 2 - 6, ly - 2, tw + 12, 26);
        g.fillStyle = '#4a3b2a'; g.fillText(l.text, lx, ly);
      }
      g.textAlign = 'left';
      // 칸 테두리 + 라벨
      g.strokeStyle = '#e6dccf'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, cell.w - 2, row.h - 2);
      const warn = res.notes.length > 0;
      g.fillStyle = warn ? '#c0504d' : '#4a3b2a';
      g.font = `21px ${FONT}`; g.textBaseline = 'middle';
      const lab = cell.label + (warn ? ' ⚠' : '');
      if (lab) g.fillText(lab, x + 10, y + row.h + LABEL / 2);
      for (const n of res.notes) notes.add(n);
      x += cell.w;
    }
    y += row.h + LABEL;
  }
  // 머리말: 이름 · 통계 · 경고
  const r0 = st?.rigs[0];
  g.fillStyle = '#4a3b2a'; g.font = `34px ${FONT}`; g.textBaseline = 'top';
  const title = kind === 'lineup' ? '줄 세우기 — 플레이어 + 동물 전부' : `${r0?.name ?? rigKey(rig)}  (${rigKey(rig)})${kind === 'poses' ? ' · 모든 포즈' : ''}`;
  g.fillText(title, 14, 12);
  g.font = `22px ${FONT}`; g.fillStyle = '#6b5a48';
  const s = (x: { meshes: number; drawCalls: number; tris: number }) => `메시 ${x.meshes} · 드로콜 ${x.drawCalls} · 삼각형 ${x.tris.toLocaleString()}`;
  if (kind !== 'lineup' && r0) g.fillText(`가까이: ${s(r0)}   |   먼 LOD: ${r0.far ? s(r0.far) : '없음(setLod 훅 없음)'}`, 14, 56);
  else if (st) g.fillText(`첫 줄 합계: ${s(st)}`, 14, 56);
  if (notes.size) {
    g.fillStyle = '#c0504d'; g.font = `18px ${FONT}`; g.textAlign = 'right';
    g.fillText([...notes].slice(0, 3).join('  ·  ') + (notes.size > 3 ? `  외 ${notes.size - 3}` : ''), SHEET_W - 14, 60);
    g.textAlign = 'left';
  }
  pr = keepPr;
  return { png: cv.toDataURL('image/png'), stats: st, notes: [...notes] };
}

// ───────────── 화면 위 안내 + 직접 볼 때 루프 ─────────────
const info = document.getElementById('studio-info');
function updateInfo() {
  if (!info) return;
  const s = stats();
  info.textContent = `캐릭터 스튜디오 · ${rigs.map((r) => r.name).join(', ') || '—'} · 메시 ${s.meshes} · 드로콜 ${s.drawCalls} · 삼각형 ${s.tris.toLocaleString()}`
    + (lastNotes.length ? `  ⚠ ${lastNotes.join(' / ')}` : '');
}

async function boot() {
  if (q0.size) setSize(q0.size.w, q0.size.h); else setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => { if (!q0.size && !manual) { setSize(window.innerWidth, window.innerHeight); placeCamera(params, { ok: true, notes: [], labels: [] }); } });
  await set(q0);
  manual = false;
  updateInfo();
  if (q0.orbit) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.update();
  }
  let t = params.t;
  let last = performance.now();
  const loop = () => {
    requestAnimationFrame(loop);
    if (manual) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // t 를 URL 에 주면 그 순간에 멈춰 둔다(마우스로 돌려 보기만)
    if (!urlHasT) { t += dt; for (const r of rigs) r.step(t, dt, params.pose, params.expr); }
    if (controls) { controls.update(); target.copy(controls.target); }
    render();
  };
  requestAnimationFrame(loop);
  setInterval(updateInfo, 1000);
}

const api = {
  ready: false,
  get params() { return params; },
  set, render, stats, sheet, errors,
  /** 렌더 픽셀 비율(시트는 1) */
  pixelRatio(v?: number) { if (typeof v === 'number' && v > 0) pr = v; return pr; },
};
(window as unknown as { __studio: typeof api }).__studio = api;
boot().then(() => { api.ready = true; }).catch((e) => { errors.push(String(e instanceof Error ? e.stack : e)); console.error('[studio]', e); api.ready = true; });
