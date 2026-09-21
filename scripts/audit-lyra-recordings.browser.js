(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], screenshots: [], recordings: [] };
  const live = p => performance.getEntriesByType('resource').findLast(e => e.name.includes(p + '?t='))?.name ?? p;
  const check = (ok, label, detail) => { report.cases.push({ ok: !!ok, label, detail }); if (!ok) throw Error(label); };
  const until = async (fn, label, timeout = 20000) => { const at = performance.now(); while (!fn()) { if (performance.now() - at > timeout) throw Error(label); await wait(30); } };
  report.promise = (async () => {
    try {
      await until(() => game.scene.keys.menu && game.scene.keys.arena && !game.scene.keys.boot.sys.isActive(), 'Boot completed');
      await wait(150);
      const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
      const { LyraComms } = await import(live('/src/game/lyra/LyraComms.ts'));
      const { LYRA_TUTORIAL_SCRIPT } = await import(live('/src/game/lyra/LyraTutorialScript.ts'));
      const { LYRA_MESSAGE_BY_ID } = await import(live('/src/game/lyra/LyraRegistry.ts'));
      const { TUTORIAL_SEQUENCES } = await import(live('/src/game/tutorial/TutorialRegistry.ts'));
      const { resolveTutorialCopy } = await import(live('/src/game/tutorial/TutorialCopy.ts'));
      const { DEFAULT_ABILITY_BINDINGS } = await import('/src/game/config/controls.ts');
      check(SaveSystem.createProfile('Lyra VO ' + Date.now().toString().slice(-6)).ok, 'Isolated recorded-voice profile');
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; });
      for (const scene of game.scene.getScenes(false)) if (scene.sys.isActive() || scene.sys.isPaused() || scene.sys.isSleeping()) game.scene.stop(scene.scene.key);
      game.scene.start('menu');
      const comms = LyraComms.get(); comms.refreshSettings();
      await until(() => comms.diagnostics().context.scene === 'menu', 'Menu communication context');
      for (const [id, line] of Object.entries(LYRA_TUTORIAL_SCRIPT)) {
        const audio = new Audio('/assets/audio/lyra/' + line.file); audio.preload = 'metadata';
        const metadata = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error('Metadata timed out: ' + line.file)), 10000);
          audio.onloadedmetadata = () => { clearTimeout(timer); resolve({ id, file: line.file, duration: audio.duration }); };
          audio.onerror = () => { clearTimeout(timer); reject(Error('Cannot decode ' + line.file + ': ' + audio.error?.message)); };
        });
        audio.onloadedmetadata = audio.onerror = null; audio.removeAttribute('src'); audio.load(); report.recordings.push(metadata);
        check(metadata.duration > 0, 'Authored file decodes: ' + line.file, metadata);
        const sequence = TUTORIAL_SEQUENCES.find(s => id.startsWith(s.id + '.'));
        const step = sequence.steps.find(s => id === `${sequence.id}.${s.id}`);
        const copy = resolveTutorialCopy(step, 'keyboardMouse', 'generic', DEFAULT_ABILITY_BINDINGS);
        check(copy.body === line.text, 'Exact authored subtitle: ' + id);
        comms.cancel(); comms.queue.resetCooldowns();
        comms.queue.submit({ ...LYRA_MESSAGE_BY_ID.get('tutorial.' + id), text: copy.body, tutorial: false, priority: 100 });
        await until(() => comms.diagnostics().speaking || comms.diagnostics().provider === 'text-only', 'Recording started: ' + id);
        check(comms.diagnostics().provider === 'recorded' && comms.diagnostics().voiceStarted, 'Recorded provider wins: ' + id);
        comms.cancel();
      }
      const longest = report.recordings.reduce((a, b) => a.duration > b.duration ? a : b);
      comms.queue.resetCooldowns();
      comms.queue.submit({ ...LYRA_MESSAGE_BY_ID.get('tutorial.' + longest.id), text: LYRA_TUTORIAL_SCRIPT[longest.id].text, tutorial: false, priority: 100 });
      await until(() => comms.diagnostics().speaking, 'Longest line starts');
      const start = performance.now();
      await until(() => !comms.diagnostics().speaking, 'Longest line reaches its real ending', (longest.duration + 8) * 1000);
      report.longestPlayback = { ...longest, observedMs: performance.now() - start };
      check(report.longestPlayback.observedMs > (longest.duration - .5) * 1000, 'Long recording is not truncated by watchdog', report.longestPlayback);
      const shield = TUTORIAL_SEQUENCES.find(s => s.id === 'onboarding.tactics').steps.find(s => s.id === 'shield');
      for (const [device, bindings] of [['gamepad', DEFAULT_ABILITY_BINDINGS], ['keyboardMouse', { ...DEFAULT_ABILITY_BINDINGS, shield: 'Keyboard:KeyZ' }]]) {
        const text = resolveTutorialCopy(shield, device, 'xbox', bindings).body;
        comms.cancel(); comms.queue.resetCooldowns();
        comms.queue.submit({ ...LYRA_MESSAGE_BY_ID.get('tutorial.onboarding.tactics.shield'), text, tutorial: false, priority: 100 });
        await until(() => comms.diagnostics().speaking || comms.diagnostics().provider === 'text-only', 'Alternate-control fallback starts');
        check(comms.diagnostics().provider === 'browser-tts', 'Accurate local speech replaces mismatched recording: ' + device);
      }
      comms.cancel();
      const link = document.querySelector('link[rel="icon"]');
      check(link?.href.endsWith('/ndfavicon.png') && link.type === 'image/png', 'Game favicon references ndfavicon.png');
      const response = await fetch(link.href); const bytes = new Uint8Array(await response.arrayBuffer());
      check(response.ok && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71, 'Favicon serves the actual PNG');
      game.scene.getScene('menu').tutorialDirector.replay('onboarding.menu-welcome'); await wait(400);
      check(document.querySelector('.tutorial-body').textContent === LYRA_TUTORIAL_SCRIPT['onboarding.menu-welcome.welcome'].text, 'Real welcome overlay uses exact recorded text');
      await until(() => comms.diagnostics().speaking, 'Welcome recording in real tutorial');
      check(comms.diagnostics().provider === 'recorded', 'Real tutorial chooses the supplied recording');
      report.completedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally { report.running = false; }
  })();
  return { started: true };
})();
