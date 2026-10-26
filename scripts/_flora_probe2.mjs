import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
await p.goto('http://127.0.0.1:5180/?shot=1&solo=terrain&cam=beach');
await p.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
const out = await p.evaluate(async () => {
  const I = await import('/src/core/island.ts');
  const T = await import('/node_modules/.vite/deps/three.js').catch(() => null);
  const res = [];
  for (let x = 4; x <= 18; x += 1) for (let z = -6; z <= 12; z += 1) {
    const s = I.surfaceAt(x, z);
    if (s.kind === 'sand' && s.coastDist > 0.9 && s.coastDist < 3.4 && I.isBuildable(x, z, 0.4)) res.push([x, z, +s.coastDist.toFixed(1)]);
  }
  return res;
});
console.log(JSON.stringify(out));
await b.close();
