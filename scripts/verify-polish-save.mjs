import { writeFile } from 'node:fs/promises';
const targets = await fetch('http://127.0.0.1:9225/json/list').then(r => r.json());
const target = targets.find(t => t.type === 'page' && /^http:\/\/(localhost|127\.0\.0\.1):/.test(t.url));
if (!target) throw new Error('Isolated DEV browser required');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const request = ++id;
  const timer = setTimeout(() => { socket.removeEventListener('message', handler); reject(new Error(`Timeout: ${method}`)); }, 30000);
  const handler = event => {
    const result = JSON.parse(event.data); if (result.id !== request) return;
    clearTimeout(timer); socket.removeEventListener('message', handler);
    result.error ? reject(new Error(JSON.stringify(result.error))) : resolve(result.result);
  };
  socket.addEventListener('message', handler); socket.send(JSON.stringify({ id: request, method, params }));
});
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
};
try {
  if (await evaluate('Boolean(globalThis.__n3onMixedSoak?.running || globalThis.__n3onLayoutAudit?.running)')) throw new Error('A fixture is running');
  const before = await evaluate(`(async () => {
    const { SaveSystem } = await import('/src/game/systems/SaveSystem.ts');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (const scene of n3onGame.scene.getScenes(true)) n3onGame.scene.stop(scene.scene.key);
    n3onGame.scene.start('options', { returnScene: 'garage' }); await wait(300);
    const options = n3onGame.scene.getScene('options'); options.selectTab('interface'); options.scrollActiveTab(10000);
    const buttons = []; const visit = o => { if (o.type === 'Container') { buttons.push(o); o.list.forEach(visit); } };
    options.children.list.forEach(visit);
    const button = buttons.find(o => /^CAMERA SHAKE:/.test(o.getByName('button-label')?.text ?? ''));
    if (!button) throw new Error('Camera shake control missing');
    if (SaveSystem.get().settings.screenShake) button.getByName('button-hit').emit('pointerdown');
    options.handleEscReturn(); await wait(300);
    return { profileId: SaveSystem.getActiveProfileSummary().id, screenShake: SaveSystem.get().settings.screenShake };
  })()`);
  if (before.screenShake !== false) throw new Error('Options toggle did not apply');
  await call('Page.reload');
  let verification;
  const started = Date.now();
  while (Date.now() - started < 30000) {
    await new Promise(resolve => setTimeout(resolve, 250));
    try {
      verification = await evaluate(`(async () => {
        if (globalThis.__n3onMixedSoak || !globalThis.n3onGame?.scene?.getScene('arena')) return null;
        const { SaveSystem } = await import('/src/game/systems/SaveSystem.ts');
        const { LocalSaveManager } = await import('/src/game/save/LocalSaveManager.ts');
        const disk = JSON.parse(LocalSaveManager.getActiveProfileSaveRaw());
        return { reloaded: true, verifiedAt: new Date().toISOString(), profileId: disk.profile.id,
          highest: disk.progress.supremeHighestRound, completed: disk.progress.supremeOverdriveCompleted,
          screenShake: SaveSystem.get().settings.screenShake, diskScreenShake: disk.settings.screenShake };
      })()`);
      if (verification) break;
    } catch { /* Reload can temporarily replace the execution context. */ }
  }
  if (!verification?.reloaded || verification.profileId !== before.profileId || verification.highest !== 148
    || !verification.completed || verification.screenShake !== false || verification.diskScreenShake !== false)
    throw new Error(`Persistence verification failed: ${JSON.stringify(verification)}`);
  await writeFile(process.argv[2] ?? 'artifacts/polish-save-reload.json', JSON.stringify(verification, null, 2) + '\n');
  console.log(JSON.stringify(verification));
} finally { socket.close(); }
