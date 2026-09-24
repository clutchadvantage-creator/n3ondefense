import { writeFile } from 'node:fs/promises';
const targets = await fetch('http://127.0.0.1:9225/json/list').then(r => r.json());
const target = targets.find(t => t.type === 'page' && /^http:\/\/(127\.0\.0\.1|localhost):/.test(t.url));
if (!target) throw Error('Isolated DEV browser required');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => socket.addEventListener('open', r, { once: true }));
let next = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++next, timeout = setTimeout(() => { socket.removeEventListener('message', handler); reject(Error(method + ' timeout')); }, 30000);
  const handler = event => { const r = JSON.parse(event.data); if (r.id !== id) return;
    clearTimeout(timeout); socket.removeEventListener('message', handler);
    r.error || r.result?.exceptionDetails ? reject(Error(JSON.stringify(r))) : resolve(r.result); };
  socket.addEventListener('message', handler); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
const report = { cases: [], errors: [], screenshots: [] };
const check = (ok, label, detail) => { report.cases.push({ ok, label, detail }); if (!ok) throw Error(label); };
try {
  if (await evaluate('Boolean(globalThis.__n3onMixedSoak?.running || globalThis.__n3onLayoutAudit?.running)')) throw Error('Another fixture is active');
  await evaluate(`(async () => {
    const live = p => performance.getEntriesByType('resource').findLast(e => e.name.includes(p + '?t='))?.name ?? p;
    const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
    const { TUTORIAL_SEQUENCES } = await import(live('/src/game/tutorial/TutorialRegistry.ts'));
    if (!SaveSystem.createProfile('HUD Sizes ' + Date.now().toString().slice(-6)).ok) throw Error('Test profile');
    SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; p.completedSequences = TUTORIAL_SEQUENCES.map(s => s.id); });
    SaveSystem.setSettings({ ...SaveSystem.get().settings, lyra: { ...SaveSystem.get().settings.lyra, voice: false, subtitles: false } });
    for (const s of n3onGame.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) n3onGame.scene.stop(s.scene.key);
    n3onGame.scene.start('arena', { baseSeed: 550055, round: 68, objectiveMode: 'open', protocol: 'normal', runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null });
    const s = n3onGame.scene.keys.arena, start = performance.now();
    while (s.roundRuntime?.phase !== 'active') { if (performance.now() - start > 25000) throw Error('Arena'); await new Promise(r => setTimeout(r, 30)); }
    s.player.invulnUntil = Infinity; s.playerInput.adoptDevice('gamepad'); s.pointerLockInitialGate = false;
    if (s.state.state === 'Paused') s.restoreGameplayAfterPause(); s.pointerLock?.hidePrompt(); s.scene.pause();
    await new Promise(r => setTimeout(r, 100));
  })()`);
  for (const [width, height] of [[1280, 720], [960, 600], [640, 480], [1920, 800]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 350));
    for (const zoom of [.65, .9, 1.15]) {
      const result = await evaluate(`(() => {
        const a = n3onGame.scene.keys.arena, h = a.hudInformation, v = h.view;
        a.cameras.main.setZoom(${zoom}); a.hud.syncCamera?.(); h.clear(); h.setDisarm('A', .65); h.update(0); h.update(320); h.update(16);
        const anchor = v.root.getData('anchor');
        const texts = [v.heading, v.message, v.secondary, v.readout].map(t => ({ text: t.text, bottom: t.y + t.displayHeight, right: t.x + t.displayWidth * (1 - t.originX), size: t.style.fontSize }));
        return { viewport: [innerWidth, innerHeight], canvas: [n3onGame.scale.width, n3onGame.scale.height], anchor, texts,
          top: anchor.y - 220 * anchor.scale, right: anchor.x + 400 * anchor.scale,
          rootX: v.root.x, rootY: v.root.y, rootScale: v.root.scaleX,
          deck: a.hud.getTutorialTargetBounds('abilities'), slots: [...a.hud.abilitySlots.keys()], progress: v.progressBar.scaleY };
      })()`);
      check(result.canvas[0] === width && result.canvas[1] === height, `Actual canvas ${width} at zoom ${zoom}`, result);
      check(result.anchor.x >= 0 && result.right <= width && result.top > 0 && Math.abs(result.anchor.y - result.deck.y - 2) < 1,
        `Panel stays above its deck ${width} at zoom ${zoom}`);
      check(result.texts.every(t => t.bottom <= 214 && t.right <= 390), `Text remains inside frame ${width} at zoom ${zoom}`, result.texts);
      check(result.slots.length === 5 && result.progress === .65, `Five abilities and real progress retained ${width} at zoom ${zoom}`);
      if (zoom === .9) {
        await new Promise(r => setTimeout(r, 40));
        const png = await call('Page.captureScreenshot', { format: 'png' });
        const path = `artifacts/mechanical-hud-${width}.png`; await writeFile(path, Buffer.from(png.data, 'base64')); report.screenshots.push(path);
      }
    }
  }
  await evaluate("void n3onGame.scene.stop('arena')");
} catch (e) { report.errors.push(String(e.stack ?? e)); }
finally {
  await call('Emulation.clearDeviceMetricsOverride'); socket.close();
  report.passed = !report.errors.length;
  await writeFile('artifacts/mechanical-hud-compact.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, errors: report.errors }));
  if (!report.passed) process.exitCode = 1;
}
