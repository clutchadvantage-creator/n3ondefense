import { writeFile } from 'node:fs/promises';
const targets = await fetch('http://127.0.0.1:9225/json/list').then(r => r.json());
const target = targets.find(t => t.type === 'page' && /^http:\/\/(127\.0\.0\.1|localhost):/.test(t.url));
if (!target) throw Error('Isolated DEV browser required');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => socket.addEventListener('open', r, { once: true }));
let nextId = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timeout = setTimeout(() => { socket.removeEventListener('message', handler); reject(Error(method + ' timed out')); }, 30000);
  const handler = event => {
    const result = JSON.parse(event.data);
    if (result.id !== id) return;
    clearTimeout(timeout); socket.removeEventListener('message', handler);
    result.error ? reject(Error(JSON.stringify(result.error))) : resolve(result.result);
  };
  socket.addEventListener('message', handler);
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
const report = { cases: [], screenshots: [], errors: [] };
try {
  await evaluate(`(async () => {
    if (globalThis.__n3onMixedSoak?.running || globalThis.__n3onLayoutAudit?.running) throw Error('Another fixture is active');
    const live = p => performance.getEntriesByType('resource').findLast(e => e.name.includes(p + '?t='))?.name ?? p;
    const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
    const { LyraComms } = await import(live('/src/game/lyra/LyraComms.ts'));
    if (!SaveSystem.createProfile('Lyra Compact ' + Date.now().toString().slice(-5)).ok) throw Error('Could not create isolated profile');
    SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; });
    SaveSystem.setSettings({ lyra: { ...SaveSystem.get().settings.lyra, voice: false, ambient: false } });
    LyraComms.get().cancel();
    for (const s of n3onGame.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) n3onGame.scene.stop(s.scene.key);
    n3onGame.scene.start('menu');
    const { TutorialOverlay } = await import(live('/src/game/tutorial/TutorialOverlay.ts'));
    const { TUTORIAL_SEQUENCES } = await import(live('/src/game/tutorial/TutorialRegistry.ts'));
    const { LYRA_TUTORIAL_SCRIPT } = await import(live('/src/game/lyra/LyraTutorialScript.ts'));
    const { resolveTutorialCopy } = await import(live('/src/game/tutorial/TutorialCopy.ts'));
    const { DEFAULT_ABILITY_BINDINGS } = await import(live('/src/game/config/controls.ts'));
    globalThis.__lyraCompact = { baselineRoots: document.querySelectorAll('.tutorial-overlay').length, Overlay: TutorialOverlay, steps: Object.entries(LYRA_TUTORIAL_SCRIPT).map(([id, line]) => {
      const sequence = TUTORIAL_SEQUENCES.find(s => id.startsWith(s.id + '.'));
      const step = sequence.steps.find(s => id === sequence.id + '.' + s.id);
      return { ...step, ...resolveTutorialCopy(step, 'keyboardMouse', 'xbox', DEFAULT_ABILITY_BINDINGS), fullId: id };
    }) };
  })()`);
  for (const [width, height] of [[1280, 720], [960, 600]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 500));
    for (let index = 0; index < 17; index++) {
      const result = await evaluate(`(async () => {
        const f = __lyraCompact, step = f.steps[${index}];
        f.overlay?.destroy(); f.overlay = new f.Overlay(() => {}, step.mode !== 'menu');
        const mount = document.querySelector('#game-ui-root').getBoundingClientRect();
        f.overlay.show(step, 0, 1, () => step.target ? { x: mount.x + mount.width * .55, y: mount.y + mount.height * .8, width: 65, height: 35 } : null, () => {}, true, step.mode === 'live' ? null : 'CONTINUE');
        await new Promise(r => setTimeout(r, 80));
        const el = document.querySelector('.tutorial-overlay:last-child .tutorial-callout') ?? document.querySelector('.tutorial-callout');
        const b = el.getBoundingClientRect();
        const hiddenVisible = [...el.querySelectorAll('[hidden]')].some(node => node.getClientRects().length > 0);
        return { id: step.fullId, viewport: { width: innerWidth, height: innerHeight }, bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
          clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
          hiddenVisible, ok: !hiddenVisible && b.x >= -1 && b.y >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1 && el.scrollHeight <= el.clientHeight + 1 };
      })()`);
      report.cases.push(result);
      if (!result.ok) report.errors.push('Clipped or scrolling transcript: ' + width + ' ' + result.id);
      if ([0, 1, 13, 16].includes(index)) {
        const image = await call('Page.captureScreenshot', { format: 'png' });
        const path = `artifacts/lyra-compact-${width}-${index}.png`;
        await writeFile(path, Buffer.from(image.data, 'base64')); report.screenshots.push(path);
      }
    }
  }
  report.retired = await evaluate(`(() => { const f = __lyraCompact; f.overlay.destroy();
    const retired = document.querySelectorAll('.tutorial-overlay').length === f.baselineRoots;
    delete globalThis.__lyraCompact; return retired; })()`);
  if (!report.retired) report.errors.push('Overlay retained after retirement');
} catch (error) { report.errors.push(String(error.stack ?? error)); }
finally {
  await call('Emulation.clearDeviceMetricsOverride'); socket.close();
  report.passed = report.errors.length === 0 && report.cases.length === 34;
  await writeFile('artifacts/lyra-compact.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, errors: report.errors }));
  if (!report.passed) process.exitCode = 1;
}
