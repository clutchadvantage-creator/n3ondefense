(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], screenshots: [] };
  const live = p => performance.getEntriesByType('resource').findLast(e => e.name.includes(p + '?t='))?.name ?? p;
  const check = (ok, label, detail) => { report.cases.push({ ok: !!ok, label, detail }); if (!ok) throw Error(label); };
  const until = async (fn, label) => { const start = performance.now(); while (!fn()) { if (performance.now() - start > 25000) throw Error(label); await wait(40); } };
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'AltLeft' ? 'Alt' : code.replace('Key', ''), bubbles: true, cancelable: true }));
  const originalPads = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
  const originalSize = { width: game.scale.width, height: game.scale.height };
  report.promise = (async () => {
    try {
      await until(() => game.scene.keys.arena && !game.scene.keys.boot.sys.isActive(), 'Boot complete'); await wait(150);
      const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
      const { UiNavigationController } = await import(live('/src/game/input/UiNavigationController.ts'));
      const { DEFAULT_ABILITY_BINDINGS } = await import('/src/game/config/controls.ts');
      const { TUTORIAL_SEQUENCES } = await import('/src/game/tutorial/TutorialRegistry.ts');
      check(SaveSystem.createProfile('Echo Controls ' + Date.now().toString().slice(-6)).ok, 'Isolated controls profile');
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; p.completedSequences = TUTORIAL_SEQUENCES.map(s => s.id); });
      for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key);
      game.scene.start('options', { returnScene: 'menu' }); await wait(300);
      const options = game.scene.keys.options; options.selectTab('gameplay'); options.scrollActiveTab(10000);
      const layer = UiNavigationController.get().phaserLayer(options);
      const capture = async () => { check(layer.manager.focus('options:gameplay:binding:echo'), 'Echo binding is focusable'); layer.manager.activate(); await wait(40); };
      await capture(); key('KeyZ', true); key('KeyZ', false); await wait(40);
      check(SaveSystem.get().settings.abilityBindings.echo === 'Keyboard:KeyZ', 'Options keyboard capture persists Echo Z');
      await capture(); key('KeyW', true); key('KeyW', false); await wait(40);
      check(SaveSystem.get().settings.abilityBindings.echo === 'Keyboard:KeyZ', 'Core movement binding cannot be stolen');
      const pad = { index: 0, id: 'Xbox Wireless Controller', mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
      await capture(); pad.buttons[6] = { pressed: true, value: 1 }; await wait(100);
      check(SaveSystem.get().settings.abilityBindings.echo === 'Gamepad:6', 'Options captures unused controller LT');
      check(options.activeTab === 'gameplay', 'Controller capture does not switch Options tabs');
      pad.buttons[6] = { pressed: false, value: 0 }; await wait(60);
      await capture(); pad.buttons[7] = { pressed: true, value: 1 }; await wait(100);
      check(SaveSystem.get().settings.abilityBindings.echo === 'Gamepad:6', 'Controller fire remains reserved');
      pad.buttons[7] = { pressed: false, value: 0 }; await wait(60);
      check(layer.manager.focus('options:gameplay:reset-ability-bindings'), 'Reset binding control available'); layer.manager.activate();
      check(SaveSystem.get().settings.abilityBindings.echo === DEFAULT_ABILITY_BINDINGS.echo, 'Actual reset restores Left Alt');
      for (const [width, height] of [[1280, 720], [960, 600]]) {
        game.scale.resize(width, height); await wait(250); options.selectTab('gameplay'); options.scrollActiveTab(10000);
        const all = []; const visit = o => { all.push(o); o.list?.forEach(visit); }; options.children.list.forEach(visit);
        const echo = all.find(o => o.text === 'ECHO'), reset = all.find(o => o.text === 'RESET DEFAULTS');
        check(echo && reset && echo.getBounds().bottom < reset.getBounds().top, 'Echo and reset do not overlap at ' + width);
        report.screenshots.push({ label: 'echo-controls-' + width, png: await new Promise(r => game.renderer.snapshot(img => r(img.src))) });
      }
      game.scale.resize(originalSize.width, originalSize.height); await wait(200);
      // Resize rebuilds focus owners; use the current layer after settling.
      options.selectTab('gameplay'); options.scrollActiveTab(10000);
      const currentLayer = UiNavigationController.get().phaserLayer(options);
      currentLayer.manager.focus('options:gameplay:binding:echo'); currentLayer.manager.activate(); await wait(40);
      key('KeyZ', true); key('KeyZ', false); await wait(60);
      check(SaveSystem.get().settings.abilityBindings.echo === 'Keyboard:KeyZ', 'Final keyboard binding persisted');
      game.scene.stop('options'); game.scene.start('arena', { baseSeed: 550055, round: 1, objectiveMode: 'open', protocol: 'normal', runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null });
      const arena = game.scene.keys.arena;
      await until(() => arena.sys.isActive() && arena.roundRuntime?.phase === 'active', 'Arena active');
      arena.player.invulnUntil = Infinity; arena.pointerLockInitialGate = false; arena.playerInput.adoptDevice('gamepad');
      if (arena.state.state === 'Paused') arena.restoreGameplayAfterPause(); await wait(120);
      key('AltLeft', true); await wait(100); check(!arena.echo.timeline.recording, 'Old default no longer activates after rebind'); key('AltLeft', false);
      key('KeyZ', true); await until(() => arena.echo.timeline.recording, 'Rebound Z starts recording');
      await wait(300); arena.togglePause(); const recordedMs = arena.echo.timeline.elapsedMs;
      await wait(300); check(arena.echo.timeline.elapsedMs === recordedMs, 'In-game pause freezes recording');
      arena.playerInput.adoptDevice('gamepad'); arena.resumeGameplay(); await wait(300);
      check(arena.echo.timeline.recording && arena.echo.timeline.elapsedMs > recordedMs, 'Held key continues recording after resume');
      await until(() => arena.echo.timeline.replaying, 'Held Z reaches automatic four-second trigger');
      check(arena.echo.timeline.durationMs === 4000 && arena.echo.timeline.cooldownMs > 11500, 'Automatic trigger at four seconds starts cooldown');
      arena.togglePause(); const replayMs = arena.echo.timeline.replayMs, cooldownMs = arena.echo.timeline.cooldownMs;
      await wait(300); check(arena.echo.timeline.replayMs === replayMs && arena.echo.timeline.cooldownMs === cooldownMs, 'In-game pause freezes replay and cooldown');
      arena.playerInput.adoptDevice('gamepad'); arena.resumeGameplay();
      await until(() => arena.echo.timeline.cooldownMs === 0, 'Full cooldown expires');
      check(!arena.echo.timeline.recording, 'Continuously held Z cannot retrigger after cooldown');
      key('KeyZ', false); await wait(60); key('KeyZ', true);
      await until(() => arena.echo.timeline.recording, 'Release then fresh press rearms Echo'); key('KeyZ', false);
      arena.playerInput.adoptDevice('keyboardMouse');
      await wait(150); check(arena.echo.hud.keybind === 'Z', 'HUD displays actual rebound key');
      const owner = arena.echo; game.scene.stop('arena'); await wait(150);
      check(owner.destroyed, 'Menu departure destroys active Echo');
      report.savedBinding = SaveSystem.get().settings.abilityBindings.echo;
      report.profileId = SaveSystem.get().profileId;
      report.completedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally {
      key('KeyZ', false); key('AltLeft', false);
      if (originalPads) Object.defineProperty(navigator, 'getGamepads', originalPads); else delete navigator.getGamepads;
      game.scale.resize(originalSize.width, originalSize.height); report.running = false;
    }
  })();
  return { started: true };
})();
