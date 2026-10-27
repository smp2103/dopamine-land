// 루프 테스트 부팅 — 가짜 게임(tests/kit) 위에 진짜 모듈들을 모듈 순서대로 올리고, 청크는 진짜 ChunkManager 로 돌린다.
// window.__* 훅과 __dl(코어 makeDebugApi)이 node 전역에 그대로 생기므로 tests/loop/steps.mjs 를 브라우저와 똑같이 몰 수 있다.
import * as THREE from 'three';
import { makeFakeGame, makeCtx, type FakeGame, type FakeCtx } from '../kit/fakeGame';
import { stubLocalStorage } from '../kit/storage';
import { ChunkManager } from '../../src/core/chunks';
import { makeDebugApi, type DebugHost } from '../../src/core/game';
import * as Island from '../../src/core/island';
import { installDom } from './dom';
// @ts-expect-error 순수 JS 단계 정의(브라우저와 같이 쓴다)
import { makeHelpers, STEPS } from './steps.mjs';

/** 루프에 필요한 모듈(계약 8장 순서). hud·hudfx·atmosphere·photo 는 진짜 화면이 있어야 해서 뺀다(env 는 가짜 시계) */
export const LOOP_MODULES = [
  'audio', 'worldterrain', 'village', 'flora', 'vehicles', 'economy', 'ocean', 'interiors', 'characters', 'treasure',
  'fishing', 'insects', 'dinos', 'secrets', 'hidden', 'garden', 'seaworld', 'space', 'planets', 'flight', 'calendar', 'meta',
  'islanddev', 'story',
] as const;

export interface LoopStep { n: number; key: string; title: string; run: (W: unknown, h: Helpers) => Promise<unknown> }
export interface Check { name: string; ok: boolean; got?: unknown }
export interface Helpers { ctx: Record<string, unknown>; checks: Check[]; notes: string[] }
export interface StepReport { n: number; key: string; title: string; ok: boolean; checks: Check[]; notes: string[]; result?: unknown; error?: string; ms: number }

export const steps = STEPS as LoopStep[];

export interface Booted {
  game: FakeGame;
  ctx: FakeCtx;
  W: Record<string, any>;
  /** 단계 하나 돌리기(시간은 가짜 게임 tick 으로 흐른다) */
  run(step: LoopStep): Promise<StepReport>;
  /** 실제 초만큼 게임 프레임(60fps) */
  wait(sec: number): Promise<void>;
}

/** 진짜 Physics.groundY 대역(마을 물리 청크가 바닥 높이를 묻는다) + 플레이어 몸체 대역(잠수 훅이 몸체를 옮긴다) */
function patchPhysics(game: FakeGame) {
  const ph = game.physics as unknown as { groundY?: (x: number, z: number) => number };
  ph.groundY ??= (x: number, z: number) => Island.heightAt(x, z);
  const pl = game.player as unknown as { body?: unknown; pos: THREE.Vector3; footOff: number };
  const v = { x: 0, y: 0, z: 0 };
  pl.body ??= {
    translation: () => ({ x: pl.pos.x, y: pl.pos.y + pl.footOff, z: pl.pos.z }),
    setTranslation: (q: { x: number; y: number; z: number }) => { pl.pos.set(q.x, q.y - pl.footOff, q.z); },
    setNextKinematicTranslation: (q: { x: number; y: number; z: number }) => { pl.pos.set(q.x, q.y - pl.footOff, q.z); },
    linvel: () => ({ ...v }),
    setLinvel: (q: { x: number; y: number; z: number }) => { Object.assign(v, q); },
  };
}

/** search(예: '?p0=1&fresh=1') 로 새 판을 연다 */
export async function bootLoop(search = '?p0=1&fresh=1'): Promise<Booted> {
  stubLocalStorage();
  installDom();
  const game = makeFakeGame({ search });
  // 진짜 청크 관리자: 순간이동·프레임마다 플레이어 주변 청크를 짓고 버린다(예산 없음 — 한 프레임에 다)
  const cm = new ChunkManager();
  cm.adaptive = false;
  cm.budgetMs = 1e9;
  (game as unknown as { chunks: ChunkManager }).chunks = cm;
  game.engine.scene.add(cm.root);
  patchPhysics(game);
  const ctx = makeCtx(game);
  // 곤충 반딧불 점 크기가 캔버스 높이를 읽는다
  (ctx as unknown as { renderer: unknown }).renderer = { domElement: { width: 1600, height: 900 }, getPixelRatio: () => 1 };
  const W = globalThis as unknown as Record<string, any>;
  W.__dl = makeDebugApi(game as unknown as DebugHost);
  for (const name of LOOP_MODULES) {
    const mod = await import(`../../src/modules/${name}.ts`);
    const obj = await mod.default(ctx);
    if (obj instanceof THREE.Object3D) game.engine.scene.add(obj);
  }
  const wait = async (sec: number) => { game.tick(1 / 60, Math.max(1, Math.round(sec * 60))); };
  // 첫 프레임들(청크·우편·요일 이벤트)
  await wait(0.5);
  const shared: Record<string, unknown> = {};
  const run = async (step: LoopStep): Promise<StepReport> => {
    shared.mark = W.__dl.mark();
    const h = makeHelpers(W, { wait, ctx: shared }) as Helpers;
    const t0 = performance.now();
    let result: unknown, error: string | undefined;
    try { result = await step.run(W, h); } catch (e) { error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e); }
    try { (h as unknown as { ledger(): void }).ledger(); } catch (e) { error ??= `장부: ${String(e)}`; }
    const ok = !error && h.checks.length > 0 && h.checks.every((c) => c.ok);
    return { n: step.n, key: step.key, title: step.title, ok, checks: h.checks, notes: h.notes, result, error, ms: Math.round(performance.now() - t0) };
  };
  return { game, ctx, W, run, wait };
}

/** 실패한 조건만 사람 말로 */
export function explain(r: StepReport): string {
  const bad = r.checks.filter((c) => !c.ok).map((c) => `  ✗ ${c.name}: ${JSON.stringify(c.got)?.slice(0, 400)}`);
  return [`${r.n}. ${r.title} — ${r.ok ? 'PASS' : 'FAIL'}`, ...bad, ...(r.error ? [`  ! ${r.error.slice(0, 1500)}`] : []), ...r.notes.map((n) => `  · ${n}`)].join('\n');
}
