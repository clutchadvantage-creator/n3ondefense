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
    const result = JSON.parse(event.data); if (result.id !== id) return;
    clearTimeout(timeout); socket.removeEventListener('message', handler);
    result.error || result.result?.exceptionDetails ? reject(Error(JSON.stringify(result))) : resolve(result.result);
  };
  socket.addEventListener('message', handler); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
const report = { cases: [], errors: [], screenshots: [] };
const check = (ok, label, detail) => { report.cases.push({ ok, label, detail }); if (!ok) throw Error(label); };
try {
  if (await evaluate('Boolean(globalThis.__n3onMixedSoak?.running || globalThis.__n3onLayoutAudit?.running)')) throw Error('Another fixture is active');
  await evaluate(`(async () => {
    const { SaveSystem } = await import('/src/game/systems/SaveSystem.ts');
    const { TUTORIAL_SEQUENCES } = await import('/src/game/tutorial/TutorialRegistry.ts');
    if (!SaveSystem.createProfile('Echo Compact ' + Date.now().toString().slice(-6)).ok) throw Error('Test profile');
    SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; p.completedSequences = TUTORIAL_SEQUENCES.map(s => s.id); });
    for (const s of n3onGame.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) n3onGame.scene.stop(s.scene.key);
  })()`);
  for (const [width, height] of [[1280, 720], [960, 600]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 500));
    const controls = await evaluate(`(async () => {
      const game = n3onGame; for (const s of game.scene.getScenes(true)) game.scene.stop(s.scene.key);
      game.scene.start('options', { returnScene: 'menu' }); await new Promise(r => setTimeout(r, 300));
      const s = game.scene.keys.options; s.selectTab('gameplay'); s.scrollActiveTab(10000);
      const all = []; const visit = o => { all.push(o); o.list?.forEach(visit); }; s.children.list.forEach(visit);
      const echo = all.find(o => o.text === 'ECHO'), reset = all.find(o => o.text === 'RESET DEFAULTS');
      const instructions = all.find(o => o.text?.startsWith('ECHO: Press once'));
      s.scrollActiveTab(echo.getBounds().y - s.viewport.top - 140);
      const bounds = o => { const b = o.getBounds(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; };
      return { viewport: [innerWidth, innerHeight], canvas: [game.scale.width, game.scale.height],
        echo: bounds(echo), reset: bounds(reset), instructions: bounds(instructions), clip: s.viewport };
    })()`);
    check(controls.viewport[0] === width && controls.viewport[1] === height && controls.canvas[0] === width && controls.canvas[1] === height,
      'Actual browser and canvas size ' + width, controls);
    check(controls.echo.bottom < controls.reset.y && controls.reset.bottom < controls.instructions.y, 'Binding/reset/help separation ' + width);
    check(controls.echo.y >= controls.clip.top && controls.reset.bottom <= controls.clip.bottom, 'Echo binding and reset scroll fully into view ' + width);
    check(controls.instructions.right <= width && controls.instructions.bottom <= controls.clip.bottom, 'Echo instructions fit ' + width);
    let png = await call('Page.captureScreenshot', { format: 'png' });
    let path = `artifacts/echo-compact-controls-${width}.png`; await writeFile(path, Buffer.from(png.data, 'base64')); report.screenshots.push(path);
    const hud = await evaluate(`(async () => {
      const game = n3onGame; game.scene.stop('options'); game.scene.start('arena', { baseSeed: 550055, round: 68, objectiveMode: 'open', protocol: 'normal', runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null });
      const s = game.scene.keys.arena, started = performance.now();
      while (!s.echo || s.roundRuntime.phase !== 'active') { if (performance.now() - started > 20000) throw Error('Arena activation'); await new Promise(r => setTimeout(r, 40)); }
      s.player.invulnUntil = Infinity; s.pointerLockInitialGate = false; s.playerInput.adoptDevice('gamepad'); if (s.state.state === 'Paused') s.restoreGameplayAfterPause();
      s.pointerLock?.hidePrompt();
      s.scene.pause(); const t = s.echo.timeline;
      t.advance(0, false, false, s.player.x, s.player.y, 0, false); t.advance(0, true, true, s.player.x, s.player.y, 0, false);
      t.advance(1200, false, false, s.player.x + 50, s.player.y, 0, false); s.echo.syncHud(s.playerInput); s.updateHud(s.time.now);
      const slots = [...s.hud.abilitySlots.entries()].map(([id, v]) => { const b = s.hud.getTutorialTargetBounds(id); return { x: b.x, right: b.x + b.width, y: b.y, bottom: b.y + b.height, key: v.keyText.text, status: v.statusText.text, label: v.labelText.text }; });
      return { viewport: [innerWidth, innerHeight], canvas: [game.scale.width, game.scale.height], slots };
    })()`);
    check(hud.canvas[0] === width && hud.canvas[1] === height, 'Actual HUD canvas size ' + width, hud);
    check(hud.slots.length === 5 && hud.slots.every(s => s.x >= -1 && s.right <= width + 1 && s.y >= -1 && s.bottom <= height + 1), 'Five ability modules stay within viewport ' + width);
    check(hud.slots.at(-1).label === 'ECHO' && hud.slots.at(-1).status === '1.2s', 'Echo recording status appears ' + width);
    png = await call('Page.captureScreenshot', { format: 'png' }); path = `artifacts/echo-compact-hud-${width}.png`;
    await writeFile(path, Buffer.from(png.data, 'base64')); report.screenshots.push(path);
    await evaluate("void n3onGame.scene.stop('arena')");
  }
} catch (error) { report.errors.push(String(error.stack ?? error)); }
finally {
  await call('Emulation.clearDeviceMetricsOverride'); socket.close();
  report.passed = report.errors.length === 0 && report.cases.length === 14;
  await writeFile('artifacts/echo-compact.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, errors: report.errors }));
  if (!report.passed) process.exitCode = 1;
}
