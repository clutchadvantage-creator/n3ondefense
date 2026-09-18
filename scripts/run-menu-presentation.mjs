import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const port = Number(process.env.N3ON_CDP_PORT ?? 9225);
const output = process.argv[2] ?? 'artifacts/menu-presentation-browser.json';
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
const target = targets.find(t => t.type === 'page' && /^http:\/\/(localhost|127\.0\.0\.1):/.test(t.url));
if (!target) throw Error('Isolated DEV browser required');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let id = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const request = ++id;
  const timer = setTimeout(() => { socket.removeEventListener('message', handler); reject(Error('CDP timeout')); }, 30000);
  const handler = event => {
    const result = JSON.parse(event.data); if (result.id !== request) return;
    clearTimeout(timer); socket.removeEventListener('message', handler);
    result.error || result.result?.exceptionDetails ? reject(Error(JSON.stringify(result))) : resolve(result.result);
  };
  socket.addEventListener('message', handler); socket.send(JSON.stringify({ id: request, method, params }));
});
const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true })).result.value;
try {
  if (await evaluate('Boolean(globalThis.__n3onLayoutAudit?.running || globalThis.__n3onMixedSoak?.running)')) throw Error('Fixture running');
  await evaluate("sessionStorage.removeItem('n3on-defense.splash.played')");
  await call('Page.reload');
  const started = Date.now();
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 250));
    try { if (await evaluate("Boolean(globalThis.n3onGame?.scene?.isActive('splash'))")) break; }
    catch { /* The execution context is replaced during reload. */ }
    if (Date.now() - started > 30000) throw Error('Splash did not become ready');
  }
} finally { socket.close(); }
try {
  const result = await promisify(execFile)(process.execPath, ['scripts/run-layout-audit.mjs', output, './audit-menu-presentation.browser.js'], { maxBuffer: 1024 * 1024 });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
} catch (error) {
  process.stdout.write(error.stdout ?? ''); process.stderr.write(error.stderr ?? String(error)); process.exitCode = 1;
}
