import { writeFile } from 'node:fs/promises';

const ending = process.argv.includes('--ending');
const output = process.argv[2] ?? 'artifacts/lyra-settings-reload.json';
const port = Number(process.env.N3ON_CDP_PORT ?? 9225);
const target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()))
  .find(t => t.type === 'page' && /^http:\/\/(127\.0\.0\.1|localhost):/.test(t.url));
if (!target) throw Error('Isolated DEV browser required');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let id = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const request = ++id;
  const timeout = setTimeout(() => { socket.removeEventListener('message', handler); reject(Error('CDP timeout: ' + method)); }, 30000);
  const handler = event => {
    const response = JSON.parse(event.data);
    if (response.id !== request) return;
    clearTimeout(timeout); socket.removeEventListener('message', handler);
    response.error ? reject(Error(JSON.stringify(response.error))) : resolve(response.result);
  };
  socket.addEventListener('message', handler);
  socket.send(JSON.stringify({ id: request, method, params }));
});
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
};
const snapshot = `(async () => {
  if (!globalThis.n3onGame?.scene?.keys.arena || n3onGame.scene.keys.boot.sys.isActive()) return null;
  const live = p => performance.getEntriesByType('resource').findLast(e => e.name.includes(p + '?t='))?.name ?? p;
  const { PlayerProfileStore } = await import(live('/src/game/state/PlayerProfileStore.ts'));
  const { LocalSaveManager } = await import(live('/src/game/save/LocalSaveManager.ts'));
  const { LyraComms } = await import(live('/src/game/lyra/LyraComms.ts'));
  const save = PlayerProfileStore.getActiveSave(), disk = JSON.parse(LocalSaveManager.getActiveProfileSaveRaw());
  const pick = s => ({ profileId: s.profile.id, highest: s.progress.supremeHighestRound,
    completed: s.progress.supremeOverdriveCompleted, lyra: s.settings.lyra, tutorial: s.tutorials });
  return { runtime: pick(save), disk: pick(disk), active: LyraComms.get().diagnostics().active };
})()`;
try {
  await evaluate(`(() => {
    const r = ${ending ? 'globalThis.__n3onMixedSoak' : 'globalThis.__n3onLayoutAudit'};
    if (!r || r.running || r.errors.length ${ending ? '|| !r.finale?.finishedAt' : '|| !r.profileId'}) throw Error('Completed isolated fixture required');
  })()`);
  const before = await evaluate(snapshot);
  if (!before) throw Error('Profile not ready');
  if (ending && (before.runtime.highest !== 148 || !before.runtime.completed)) throw Error('Ending not saved');
  await call('Page.reload');
  let after;
  const started = Date.now();
  while (Date.now() - started < 30000) {
    await new Promise(r => setTimeout(r, 250));
    try {
      if (!await evaluate('!globalThis.__n3onLayoutAudit && !globalThis.__n3onMixedSoak')) continue;
      after = await evaluate(snapshot);
      if (after) break;
    } catch { /* Page replaces its execution context during reload. */ }
  }
  if (!after || JSON.stringify(after.runtime) !== JSON.stringify(before.runtime)
    || JSON.stringify(after.disk) !== JSON.stringify(before.disk) || after.active) {
    throw Error('Reload mismatch or stale speech: ' + JSON.stringify({ before, after }));
  }
  const environment = await evaluate(`(() => {
    const gl = n3onGame.renderer.gl, ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return { viewport: { width: innerWidth, height: innerHeight }, game: { width: n3onGame.scale.width, height: n3onGame.scale.height },
      devicePixelRatio, userAgent: navigator.userAgent, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null };
  })()`);
  const report = { passed: true, ending, verifiedAt: new Date().toISOString(), before, after, environment };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { socket.close(); }
