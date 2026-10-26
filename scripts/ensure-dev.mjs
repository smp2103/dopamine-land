// 개발 서버(127.0.0.1:5180)가 죽어 있으면 분리 실행한다. 여러 번 불러도 안전(strictPort).
import { spawn } from 'node:child_process';
import net from 'node:net';
const up = await new Promise((res) => {
  const s = net.connect(5180, '127.0.0.1', () => { s.end(); res(true); });
  s.on('error', () => res(false));
});
if (up) { console.log('dev server: up'); process.exit(0); }
const p = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { cwd: process.cwd(), detached: true, stdio: 'ignore', windowsHide: true });
p.unref();
await new Promise((r) => setTimeout(r, 2500));
console.log('dev server: started');
