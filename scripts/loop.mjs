// GDD 4.9 P0 10단계 루프를 진짜 브라우저(진짜 게임·WebGL·Rapier)에서 한 판 — 로컬 전용(CI 는 tests/loop.test.ts).
// 사용: node scripts/loop.mjs [--cheat] [--only 9,10] [--q "extra=1"] [--w 1600 --h 900] [--timeout 90000] [--out shots/loop] [--headed]
//   npm run loop
// - 서버 127.0.0.1:5180 이 없으면 scripts/ensure-dev.mjs 로 띄운다.
// - /?fresh=1&p0=1&live=1 을 열고 window.__ready 를 기다린 뒤, tests/loop/steps.mjs 의 단계를 window.__* 훅으로 몬다.
// - 단계마다 shots/loop/stepNN.png 를 찍고 PASS/FAIL(+ 틀린 조건)을 적는다. window.__errors 를 모은다. 하나라도 실패면 종료 코드 1.
// - GPU: mac 은 --use-angle=metal, 윈도는 d3d11(그 밖은 기본).
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { STEPS, makeHelpers } from '../tests/loop/steps.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return a;
}, []));
const W = Number(args.w ?? 1600), H = Number(args.h ?? 900);
const BASE = args.base ?? 'http://127.0.0.1:5180/';
const TIMEOUT = Number(args.timeout ?? 90000);
const OUT = args.out ?? 'shots/loop';
const cheat = !!args.cheat;
const only = args.only ? String(args.only).split(',').map(Number) : cheat ? [9, 10] : null;
const query = `fresh=1&p0=1&live=1${cheat ? '&cheat=1' : ''}${args.q ? '&' + args.q : ''}`;

/** 계약 9장 디버그 훅(브라우저에선 화면이 필요한 __env·__hud·__photo 까지) → 꼭 있어야 하는 함수 */
const HOOKS = {
  __dl: ['give', 'coins', 'stars', 'teleport', 'world', 'hour', 'advance', 'list', 'interact', 'unlockAll', 'save'],
  __env: ['advance', 'setHour', 'force'], __econ: ['give', 'unlock', 'state'], __hud: ['open', 'cards'], __geo: ['zoneAt', 'disc'],
  __flora: ['chopNearest', 'hitNearest', 'rocks'], __treasure: ['spawn', 'digs'], __village: ['stage', 'light'],
  __vehicles: ['mount', 'summon'], __space: ['goPad', 'pond'],
  __fishingDebug: ['catchNow', 'goto'], __insects: ['spawnAt', 'catchNear'], __dinos: ['feed', 'tino'], __ocean: ['dive', 'oxygen'], __chars: ['talk'],
  __meta: [], __calendar: [], __interiors: [], __seaworld: [], __planets: [], __flight: [], __story: [], __secrets: [], __hidden: [],
  __garden: [], __islanddev: [], __net: [], __photo: [],
};

// ── 서버
spawnSync(process.execPath, [path.join('scripts', 'ensure-dev.mjs')], { stdio: 'inherit' });

// ── 브라우저
const angle = process.platform === 'darwin' ? ['--use-angle=metal'] : process.platform === 'win32' ? ['--use-angle=d3d11'] : [];
const browser = await chromium.launch({
  channel: 'chrome',
  headless: !args.headed,
  args: [...angle, '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

const url = `${BASE}?${query}`;
console.log(`loop: ${url}  (${process.platform}, ${angle[0] ?? 'default angle'})`);
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.__ready === true, null, { timeout: TIMEOUT });
} catch {
  const errs = await page.evaluate(() => window.__errors ?? []).catch(() => []);
  console.log(`FAIL  준비 시간 초과(${TIMEOUT}ms)\n  ${errs.join('\n  ')}`);
  await browser.close();
  process.exit(1);
}
const boot = await page.evaluate(() => ({ gpu: window.__gpu, modules: window.__modules, errors: [...(window.__errors ?? [])] }));
console.log(`ready ${Date.now() - t0}ms  gpu=${boot.gpu}\n  modules=${(boot.modules ?? []).join(',')}`);
// 오른쪽 위 개발 GUI 는 찍지 않는다
await page.addStyleTag({ content: '.lil-gui{display:none!important}' }).catch(() => {});
// 도우미를 페이지에 심는다(steps.mjs 의 makeHelpers 소스 그대로)
await page.evaluate((src) => { window.__loopMakeHelpers = (0, eval)(`(${src})`); window.__loopCtx = {}; }, makeHelpers.toString());
fs.mkdirSync(OUT, { recursive: true });
// 단계 중간 스크린샷(h.snap) → shots/loop/stepNN-<이름>.png
let snapStep = 0;
await page.exposeFunction('__loopSnap', async (label) => {
  const file = path.join(OUT, `step${String(snapStep).padStart(2, '0')}-${String(label).replace(/[^\w-]/g, '_')}.png`);
  await page.screenshot({ path: file }).catch((e) => logs.push(`screenshot: ${e.message}`));
  console.log(`  📸 ${file}`);
});

const results = [];
const fmt = (v) => { try { return JSON.stringify(v)?.slice(0, 300); } catch { return String(v); } };

// ── 0. 디버그 훅
{
  const missing = await page.evaluate((hooks) => {
    const out = [];
    for (const [name, fns] of Object.entries(hooks)) {
      const o = window[name];
      if (!o) { out.push(name); continue; }
      for (const f of fns) if (typeof o[f] !== 'function') out.push(`${name}.${f}`);
    }
    return out;
  }, HOOKS);
  const ok = missing.length === 0;
  results.push({ n: 0, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  0. 계약 9장 디버그 훅 ${Object.keys(HOOKS).length}개${ok ? '' : `\n  ✗ 없음: ${missing.join(', ')}`}`);
}

// ── 1~10
for (const step of STEPS) {
  if (only && !only.includes(step.n)) continue;
  const ts = Date.now();
  snapStep = step.n;
  const errBefore = await page.evaluate(() => (window.__errors ?? []).length);
  let rep;
  try {
    rep = await Promise.race([
      page.evaluate(async ({ src }) => {
        const obj = (0, eval)(`({${src}})`);
        const wait = (sec) => new Promise((r) => setTimeout(r, Math.max(0, sec) * 1000));
        window.__loopCtx.mark = window.__dl.mark();
        const h = window.__loopMakeHelpers(window, { wait, ctx: window.__loopCtx, snap: (label) => window.__loopSnap(label) });
        let result, error;
        try { result = await obj.run(window, h); } catch (e) { error = `${e?.message ?? e}\n${e?.stack ?? ''}`; }
        try { h.ledger(); } catch (e) { error ??= `장부: ${e?.message ?? e}`; }
        return { checks: h.checks, notes: h.notes, result: JSON.parse(JSON.stringify(result ?? null)), error };
      }, { src: step.run.toString() }),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`단계 시간 초과(${TIMEOUT}ms)`)), TIMEOUT)),
    ]);
  } catch (e) {
    rep = { checks: [], notes: [], result: null, error: String(e?.message ?? e) };
  }
  // 연출(잡았다·상자·발사 페이드)이 화면에 남아 있게 잠깐 두고 찍는다
  await page.waitForTimeout(700);
  const shot = path.join(OUT, `step${String(step.n).padStart(2, '0')}.png`);
  await page.screenshot({ path: shot }).catch((e) => logs.push(`screenshot: ${e.message}`));
  const newErrors = await page.evaluate((i) => (window.__errors ?? []).slice(i), errBefore).catch(() => []);
  const ok = !rep.error && rep.checks.length > 0 && rep.checks.every((c) => c.ok) && newErrors.length === 0;
  results.push({ n: step.n, ok });
  const bad = rep.checks.filter((c) => !c.ok).map((c) => `  ✗ ${c.name}: ${fmt(c.got)}`);
  console.log([
    `${ok ? 'PASS' : 'FAIL'}  ${step.n}. ${step.title}  (${Date.now() - ts}ms, 조건 ${rep.checks.length}개) → ${shot}`,
    ...bad,
    ...(rep.error ? [`  ! ${rep.error.slice(0, 1200)}`] : []),
    ...newErrors.map((e) => `  ! window.__errors: ${String(e).slice(0, 400)}`),
    ...rep.notes.map((x) => `  · ${x}`),
    `  = ${fmt(rep.result)}`,
  ].join('\n'));
}

const errors = await page.evaluate(() => window.__errors ?? []).catch(() => []);
await browser.close();
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} PASS  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (errors.length) console.log(`window.__errors(${errors.length}):\n  ${errors.slice(0, 20).join('\n  ')}`);
if (logs.length) console.log(`console:\n  ${[...new Set(logs)].slice(0, 30).join('\n  ')}`);
process.exit(pass === results.length && errors.length === 0 ? 0 : 1);
