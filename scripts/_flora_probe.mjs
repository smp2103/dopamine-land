import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
await p.goto('http://127.0.0.1:5180/?shot=1&solo=terrain,water,flora&cam=ac');
await p.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
console.log(JSON.stringify(await p.evaluate(() => window.__flora)));
await b.close();
