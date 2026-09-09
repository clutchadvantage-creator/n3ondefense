// Isolated DEV profile. Exercise real callbacks and controller focus routing.
(() => {
  const game = globalThis.n3onGame;
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], startedAt: new Date().toISOString() };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, label) => { const start = performance.now(); while (!fn()) { if (performance.now() - start > 15000) throw new Error(label); await wait(50); } };
  const check = (ok, label, detail) => { report.cases.push({ ok: Boolean(ok), label, detail }); if (!ok) throw new Error(label); };
  const objects = scene => { const result = []; const visit = o => { result.push(o); if (o.type === 'Container') o.list.forEach(visit); }; scene.children.list.forEach(visit); return result; };
  const click = (scene, label) => {
    const button = objects(scene).find(o => o.type === 'Container' && o.getByName('button-label')?.text === label);
    if (!button) throw new Error(`Missing button ${label} in ${scene.scene.key}`);
    button.getByName('button-hit').emit('pointerdown');
  };
  const active = key => game.scene.getScene(key).sys.isActive();
  const pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 1, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), timestamp: 0 };
  const originalPads = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => { pad.timestamp = performance.now(); return [pad]; } });
  const runtimeErrors = e => report.errors.push(String(e.error?.stack ?? e.reason ?? e.message));
  window.addEventListener('error', runtimeErrors); window.addEventListener('unhandledrejection', runtimeErrors);
  report.promise = (async () => {
    try {
      const { SaveSystem } = await import('/src/game/systems/SaveSystem.ts');
      const { LocalSaveManager } = await import('/src/game/save/LocalSaveManager.ts');
      const { TUTORIAL_SEQUENCES } = await import('/src/game/tutorial/TutorialRegistry.ts');
      const { UiNavigationController } = await import('/src/game/input/UiNavigationController.ts');
      const { shakeGameplayCamera } = await import('/src/game/vfx/GameplayCameraShake.ts');
      SaveSystem.createProfile(`Polish ${Date.now().toString().slice(-7)}`);
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; p.completedSequences = TUTORIAL_SEQUENCES.map(s => s.id); });
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
      await wait(100);
      const openOptions = async source => {
        const key = source.scene.key;
        if (key === 'arena') source.togglePause(); else source.pauseHeist();
        source.scene.launch('options', { returnScene: key, resumeGameplay: key === 'arena', resumePausedScene: key !== 'arena' });
        source.scene.pause();
        await until(() => active('options'), 'Options opened'); await wait(100);
        return game.scene.getScene('options');
      };
      const startArena = async () => {
        game.scene.start('arena', { baseSeed: 550055, round: 68, protocol: 'normal', objectiveMode: 'open', runStartedAt: Date.now() });
        const arena = game.scene.getScene('arena');
        await until(() => arena.roundRuntime?.phase === 'active' && active('arena'), 'Arena active');
        arena.playerInput.adoptDevice('gamepad'); arena.player.invulnUntil = Infinity;
        arena.pointerLockInitialGate = false; arena.resumeGameplay();
        return arena;
      };
      const arena = await startArena();
      let options = await openOptions(arena);
      options.selectTab('interface'); options.scrollActiveTab(10000);
      const nav = UiNavigationController.get().layers.find(l => l.id === 'phaser:options');
      const shakeControl = [...nav.manager.controls.values()].find(c => nav.labels.get(c.id) === 'CAMERA SHAKE: ON');
      check(shakeControl && nav.manager.focus(shakeControl.id), 'camera shake is controller focusable');
      nav.manager.activate();
      check(!SaveSystem.get().settings.screenShake, 'controller toggles camera shake off');
      let calls = 0; const camera = { cameras: { main: { shake: () => { calls++; } } } };
      check(!shakeGameplayCamera(camera, 100, .01) && calls === 0, 'disabled setting suppresses authored camera motion');
      // Change a genuine slider through its controller adjust callback.
      options.selectTab('audio');
      const volume = [...nav.manager.controls.values()].find(c => /MASTER VOLUME/i.test(nav.labels.get(c.id)));
      check(volume && nav.manager.focus(volume.id), 'volume slider is controller focusable');
      nav.manager.adjust(-1);
      const changedVolume = SaveSystem.get().settings.masterVolume;
      options.selectTab('profile');
      const profileBefore = SaveSystem.getActiveProfileSummary().id;
      for (const label of ['Switch Profile', 'Import Save', 'Restore Backup', 'Reset Progress']) {
        click(options, label); await wait(30);
        check(active('options') && SaveSystem.getActiveProfileSummary().id === profileBefore, `in-run ${label} cannot replace the deployment profile`);
      }
      click(options, 'BACK');
      await until(() => active('arena') && !active('options'), 'Arena options return');
      check(arena.roundManager.round === 68 && !arena.physics.world.isPaused, 'Options returns to the same live Arena');
      let disk = JSON.parse(LocalSaveManager.getActiveProfileSaveRaw());
      check(disk.settings.screenShake === false && disk.settings.masterVolume === changedVolume, 'Options controls persist to disk on return');
      options = await openOptions(arena);
      check(!SaveSystem.get().settings.screenShake, 'camera setting survives Options reopen');
      options.selectTab('interface'); options.scrollActiveTab(10000); click(options, 'CAMERA SHAKE: OFF');
      check(shakeGameplayCamera(camera, 100, .01) && calls === 1, 're-enabling camera shake restores authored effect');
      options.handleEscReturn(); await until(() => active('arena') && !active('options'), 'Arena resume');
      check(globalThis.forceAnomaly('heist'), 'HEIST portal starts'); globalThis.forceAnomalyCharge();
      await until(() => arena.anomalyController.visual?.readyForInteraction, 'HEIST portal ready');
      arena.player.body.reset(arena.anomalyController.visual.x, arena.anomalyController.visual.y);
      check(arena.anomalyController.tryEnterDevBypass(), 'HEIST entry accepted');
      await until(() => active('anomaly-heist'), 'HEIST active');
      const heist = game.scene.getScene('anomaly-heist'); heist.inputController.adoptDevice('gamepad'); heist.player.invulnUntil = Infinity;
      await until(() => !heist.physics.world.isPaused, 'HEIST input active');
      options = await openOptions(heist); options.selectTab('system'); click(options, 'Replay Splash Screen');
      await until(() => active('splash'), 'replayed Splash active');
      game.scene.getScene('splash').input.keyboard.emit('keydown', { code: 'Enter', key: 'Enter' });
      await until(() => active('options') && !active('splash'), 'Splash returns to Options');
      options = game.scene.getScene('options');
      check(options.resumePausedSceneOnEsc, 'Splash preserves HEIST resume route');
      click(options, 'BACK');
      await until(() => active('anomaly-heist') && !heist.manuallyPaused, 'Splash Options returns to preserved HEIST');
      check(!heist.physics.world.isPaused && heist === game.scene.getScene('anomaly-heist'), 'HEIST resumes without restarting its world');
      options = await openOptions(heist); options.selectTab('system'); click(options, 'Back to Main Menu');
      check(active('options') && heist.sys.isPaused(), 'quit confirmation preserves paused run before approval');
      UiNavigationController.get().layers.find(l => l.id === 'phaser:options').back();
      check(active('options') && !options.quitConfirmation, 'controller Back cancels quit and keeps Options');
      click(options, 'Back to Main Menu'); click(options, 'End Deployment');
      await until(() => active('menu') && !active('options'), 'quit returns to menu'); await wait(200);
      for (const scene of [arena, heist]) check(!scene.sys.isActive() && !scene.sys.isPaused() && !scene.sys.isSleeping(), `${scene.scene.key} retires on Options quit`, scene.sys.settings.status);
      check(!game.registry.has('arena-session'), 'quit clears deployment session');
      check(Phaser.Display.Canvas.CanvasPool.pool.filter(e => e.parent?.scene === arena || e.parent?.scene === heist).length === 0, 'quit retires Arena and HEIST Text canvases');
      // Menu navigation goes through registered controller Back handlers.
      for (const key of ['garage', 'options', 'mods', 'upgrades', 'cosmetics', 'leaderboards']) {
        game.scene.stop('menu'); game.scene.start(key, { returnScene: 'menu', resumeGameplay: false, resumePausedScene: false });
        await until(() => active(key), `${key} opens`); await wait(180);
        const layers = UiNavigationController.get().layers.filter(l => l.isAvailable());
        check(layers.some(l => l.manager.size > 0), `${key} has controller controls`);
        check(layers.sort((a, b) => b.priority - a.priority).some(layer => layer.back()), `${key} accepts controller Back`);
        await until(() => active('menu') && !active(key), `${key} returns to menu`);
      }
      report.finishedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally {
      if (originalPads) Object.defineProperty(navigator, 'getGamepads', originalPads); else delete navigator.getGamepads;
      window.removeEventListener('error', runtimeErrors); window.removeEventListener('unhandledrejection', runtimeErrors);
      report.running = false;
    }
  })();
  return { started: true };
})();
