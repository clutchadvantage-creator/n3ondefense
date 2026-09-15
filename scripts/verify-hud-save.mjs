import { writeFile } from 'node:fs/promises';
const targets = await fetch('http://127.0.0.1:9225/json/list').then(r => r.json());
const target = targets.find(t => t.type === 'page' && /^http:\/\/(localhost|127\.0\.0\.1):/.test(t.url));
if (!target) throw Error('Isolated DEV browser required');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
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
const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
try {
  if (await evaluate('Boolean(globalThis.__n3onLayoutAudit?.running || globalThis.__n3onMixedSoak?.running)')) throw Error('Fixture running');
  const before = await evaluate(`(async () => {
    const url = performance.getEntriesByType('resource').findLast(e => e.name.includes('/src/game/systems/SaveSystem.ts?t='))?.name ?? '/src/game/systems/SaveSystem.ts';
    const { SaveSystem } = await import(url);
    return { profileId: SaveSystem.getActiveProfileSummary().id, hud: SaveSystem.get().settings.hud };
  })()`);
  if (before.hud.tacticalInformation !== false || before.hud.tacticalTextSize !== 'large') throw Error('Run audit-hud-information first');
  await call('Page.reload');
  let after;
  for (let attempt = 0; attempt < 100 && !after; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    try {
      after = await evaluate(`(async () => {
        if (globalThis.__n3onLayoutAudit || !globalThis.n3onGame?.scene?.getScene('arena')) return null;
        const live = path => performance.getEntriesByType('resource').findLast(e => e.name.includes(path + '?t='))?.name ?? path;
        const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
        const { LocalSaveManager } = await import(live('/src/game/save/LocalSaveManager.ts'));
        const disk = JSON.parse(LocalSaveManager.getActiveProfileSaveRaw());
        return { profileId: disk.profile.id, hud: SaveSystem.get().settings.hud, diskHud: disk.settings.hud };
      })()`);
    } catch { /* Page execution context can be replaced during reload. */ }
  }
  if (!after || after.profileId !== before.profileId || after.hud.tacticalInformation !== false
    || after.hud.tacticalTextSize !== 'large' || JSON.stringify(after.hud) !== JSON.stringify(after.diskHud)) throw Error('HUD persistence mismatch');
  const report = { passed: true, verifiedAt: new Date().toISOString(), before, after };
  await writeFile(process.argv[2] ?? 'artifacts/hud-save-reload.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { socket.close(); }
