// 캐릭터 접촉 시트 — 스튜디오(/studio.html)를 머리 없는 크롬으로 열어 리그 하나당 PNG 한 장을 뽑는다.
// 사용:
//   node scripts/charshot.mjs <rig> <outDir> [--poses]     rig = player | animal:bear | npc:quack | villager:nabi | concept:<이름>
//   node scripts/charshot.mjs lineup <outDir>               플레이어 + 동물 종 전부(정면 · 게임 각도 · 실루엣)
//   여러 개: node scripts/charshot.mjs player,animal:bear,lineup <outDir>
// 시트: 1줄 돌려 보기 8 · 2줄 포즈 8 · 3줄 얼굴 6 + 게임 거리 + 먼 LOD. --poses 면 모든 동작 포즈 시트를 한 장 더.
// 통계(메시·드로콜·삼각형, 먼 LOD)는 JSON 으로 찍는다. 이 맥에선 d3d11 이 멈추므로 metal 각도로 띄운다.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const pos = args.filter((a) => !a.startsWith('--'));
if (pos.length < 2) {
  console.error('사용: node scripts/charshot.mjs <rig|lineup>[,…] <outDir> [--poses]');
  process.exit(1);
}
const targets = pos[0].split(',').map((s) => s.trim()).filter(Boolean);
const outDir = path.resolve(pos[1]);
fs.mkdirSync(outDir, { recursive: true });

execFileSync(process.execPath, [path.join(root, 'scripts/ensure-dev.mjs')], { cwd: root, stdio: 'inherit' });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

await page.goto('http://127.0.0.1:5180/studio.html?orbit=0', { waitUntil: 'load' });
await page.waitForFunction(() => window.__studio?.ready === true, null, { timeout: 180000 });

const safe = (s) => s.replace(/[^a-z0-9_-]+/gi, '_');
const report = {};
for (const tgt of targets) {
  const jobs = tgt === 'lineup' ? [['lineup', undefined, 'lineup']] : [['rig', tgt, safe(tgt)], ...(flags.has('--poses') ? [['poses', tgt, `${safe(tgt)}-poses`]] : [])];
  for (const [kind, rig, name] of jobs) {
    const t0 = Date.now();
    const r = await page.evaluate(([k, rg]) => window.__studio.sheet(k, rg), [kind, rig]);
    const file = path.join(outDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
    const st = r.stats;
    report[name] = {
      file,
      near: st?.rigs?.[0] ? { meshes: st.rigs[0].meshes, drawCalls: st.rigs[0].drawCalls, tris: st.rigs[0].tris } : null,
      far: st?.rigs?.[0]?.far ?? null,
      total: st ? { meshes: st.meshes, drawCalls: st.drawCalls, tris: st.tris } : null,
      notes: r.notes,
      ms: Date.now() - t0,
    };
    console.log(`→ ${file} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
}
const errs = await page.evaluate(() => window.__studio.errors);
console.log(JSON.stringify({ stats: report, errors: errs }, null, 2));
if (logs.length) console.log('console:\n ' + [...new Set(logs)].slice(0, 30).join('\n '));
await browser.close();
