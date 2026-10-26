// 사용: node scripts/shot.mjs --q "cam=ac&tod=day" --out shots/x.png [--w 1600 --h 900] [--timeout 60000]
//      node scripts/shot.mjs --set base --label v1   (표준 세트: 카메라 6 × 낮 + ac × 시간대 3 → shots/<label>/)
//      --eval "await __game.player.teleport(1750,-900); __game.setWorld('space')"   준비 후 페이지에서 실행(async 본문)
//      --after 1500   eval 뒤 기다릴 ms(live=1 이면 그동안 게임이 진행된다)
// 서버: npm run dev (127.0.0.1:5180) 가 떠 있어야 한다.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return a;
}, []));
const W = Number(args.w ?? 1600), H = Number(args.h ?? 900);
const BASE = args.base ?? 'http://127.0.0.1:5180/';
const TIMEOUT = Number(args.timeout ?? 90000);

const jobs = [];
if (args.set) {
  const label = args.label ?? args.set;
  const extra = args.q ? '&' + args.q : '';
  for (const cam of ['ac', 'close', 'river', 'beach', 'low', 'wide']) jobs.push({ q: `cam=${cam}&tod=day${extra}`, out: `shots/${label}/${cam}-day.png` });
  for (const tod of ['morning', 'sunset', 'night']) jobs.push({ q: `cam=ac&tod=${tod}${extra}`, out: `shots/${label}/ac-${tod}.png` });
} else {
  jobs.push({ q: args.q ?? '', out: args.out ?? 'shots/shot.png' });
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
let ok = true;
for (const j of jobs) {
  const url = BASE + '?shot=1&' + j.q;
  const t0 = Date.now();
  await page.goto(url);
  try {
    await page.waitForFunction(() => window.__ready === true || (window.__errors && window.__errors.length > 0 && window.__modules), null, { timeout: TIMEOUT });
  } catch {
    logs.push(`timeout waiting for ready: ${url}`);
    ok = false;
  }
  await page.waitForTimeout(300);
  if (args.eval) {
    try { await page.evaluate(`(async () => { ${args.eval} })()`); }
    catch (e) { logs.push(`eval error: ${e.message}`); ok = false; }
  }
  if (args.after) await page.waitForTimeout(Number(args.after));
  if (args.bench) await page.waitForTimeout(2500);
  const info = await page.evaluate(() => ({ gpu: window.__gpu, modules: window.__modules, errors: window.__errors, ms: window.__frameMs, stats: window.__stats }));
  if (args.bench) console.log(`  bench: ${info.ms?.toFixed(2)} ms/frame (${(1000 / info.ms).toFixed(0)} fps, headless — 참고용), last-pass calls=${info.stats?.calls} tris=${info.stats?.triangles}`);
  fs.mkdirSync(path.dirname(j.out), { recursive: true });
  await page.screenshot({ path: j.out });
  console.log(`${j.out}  ${Date.now() - t0}ms  gpu=${info.gpu}  modules=${(info.modules ?? []).join(',')}`);
  if (info.errors?.length) { ok = false; console.log('  ERRORS:\n  ' + info.errors.join('\n  ')); }
}
if (logs.length) console.log('console:\n  ' + [...new Set(logs)].slice(0, 30).join('\n  '));
await browser.close();
process.exit(ok ? 0 : 1);
