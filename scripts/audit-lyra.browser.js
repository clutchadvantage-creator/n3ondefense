(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const live = path => performance.getEntriesByType('resource').findLast(e => e.name.includes(path + '?t='))?.name ?? path;
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], screenshots: [] };
  const check = (ok, label, detail) => { report.cases.push({ ok: !!ok, label, detail }); if (!ok) throw Error(label); };
  const until = async (fn, label) => { const start = performance.now(); while (!fn()) { if (performance.now() - start > 25000) throw Error(label); await wait(40); } };
  const all = scene => { const out = []; const visit = o => { out.push(o); o.list?.forEach(visit); }; scene.children.list.forEach(visit); return out; };
  const stopScenes = () => { for (const scene of game.scene.getScenes(false)) if (scene.sys.isActive() || scene.sys.isPaused() || scene.sys.isSleeping()) game.scene.stop(scene.scene.key); };
  let arena, originalUpdate;
  const parent = game.scale.parent, oldSize = { width: game.scale.width, height: game.scale.height }, oldStyle = { width: parent.style.width, height: parent.style.height };
  const resize = async (w, h) => { parent.style.width = w + 'px'; parent.style.height = h + 'px'; game.scale.resize(w, h); game.scale.refresh(); await wait(400); };
  const manual = async () => { const b = document.querySelector('.tutorial-overlay:not([hidden]) .tutorial-continue'); check(b && !b.hidden, 'Visible training acknowledgement'); b.click(); await wait(250); };
  const step = () => arena?.tutorialDirector?.active?.steps[arena.tutorialDirector.stepIndex]?.id;
  const press = action => { const states = arena.playerInput.states; states.beginFrame(); if (action) states.setHeld(action, true); states.finishFrame('gameplay'); };
  report.promise = (async () => {
    try {
      const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
      const { LyraComms } = await import(live('/src/game/lyra/LyraComms.ts'));
      const { AudioManager } = await import(live('/src/game/systems/AudioManager.ts'));
      const { LYRA_RECORDINGS } = await import(live('/src/game/lyra/LyraRegistry.ts'));
      const { startArenaLoad } = await import('/src/game/utils/runFlow.ts');
      const { UiNavigationController } = await import(live('/src/game/input/UiNavigationController.ts'));
      const created = SaveSystem.createProfile('Lyra ' + Date.now().toString().slice(-6)); check(created.ok, 'Isolated new profile', created);
      SaveSystem.setSettings({ lyra: { ...SaveSystem.get().settings.lyra, voice: false, subtitles: false }, soundVolumes: { ...SaveSystem.get().settings.soundVolumes, shot: .37 } });
      const comms = LyraComms.get(); comms.configureDevelopment({}); comms.refreshSettings();
      stopScenes(); game.scene.start('menu');
      await until(() => document.querySelector('.tutorial-body')?.textContent.includes('I am LYRA'), 'First meeting');
      check(document.querySelector('.tutorial-body').textContent.includes('I am LYRA'), 'First profile meets LYRA with voice and subtitles disabled');
      await manual(); check(!document.querySelector('.lyra-monitor').hidden, 'Advanced monitor fallback mounted');
      check(document.querySelectorAll('.lyra-monitor video').length === 0, 'Missing footage creates no broken media request');
      await manual();
      const menu = game.scene.getScene('menu');
      const start = all(menu).find(o => o.text === 'START LOCAL')?.parentContainer?.getByName('button-hit');
      check(!!start, 'Actual Start Local control'); start.emit('pointerdown');
      await until(() => game.scene.getScene('loading')?.statusText?.text === 'DEPLOYMENT READY', 'Deployment confirmation ready');
      const deploy = all(game.scene.getScene('loading')).find(o => o.text === 'CLICK TO DEPLOY' || o.text === 'PRESS A TO DEPLOY')?.parentContainer?.getByName('button-hit');
      check(!!deploy, 'Actual deployment confirmation'); deploy.emit('pointerdown');
      await until(() => game.scene.getScene('arena')?.roundRuntime?.phase === 'active', 'Round one active');
      arena = game.scene.getScene('arena'); arena.player.invulnUntil = Infinity; arena.pointerLockInitialGate = false;
      if (arena.state.state === 'Paused') arena.restoreGameplayAfterPause();
      arena.tutorialDirector.startEligible();
      await until(() => step() === 'welcome', 'Basic welcome');
      originalUpdate = arena.sys.sceneUpdate; arena.sys.sceneUpdate = () => {}; arena.physics.pause();
      check(arena.tutorialHardPaused, 'Acknowledgement gates simulation');
      await manual(); check(step() === 'move', 'Movement is first live action');
      arena.physics.pause(); arena.updatePlayerMovement(arena.time.now);
      arena.playerInput.move.x = 1; arena.updatePlayerMovement(arena.time.now + 16); await wait(220);
      check(step() === 'move', 'Input without displacement cannot complete movement');
      arena.player.x += 12; arena.updatePlayerMovement(arena.time.now + 32); await wait(220);
      check(step() === 'aim', 'Actual displacement completes movement');
      const navigation = UiNavigationController.get();
      navigation.device = 'gamepad'; navigation.family = 'xbox'; navigation.notifyPresentation();
      check(document.querySelector('.tutorial-body').textContent.includes('RIGHT STICK'), 'Controller presentation updates the live aiming instruction');
      navigation.device = 'keyboardMouse'; navigation.notifyPresentation();
      check(document.querySelector('.tutorial-body').textContent.includes('MOUSE'), 'Keyboard presentation restores the live aiming instruction');
      let target = { x: arena.player.x + 100, y: arena.player.y };
      const originalAim = arena.getAimWorldPoint; arena.getAimWorldPoint = () => target;
      arena.updatePlayerMovement(arena.time.now + 48); target = { x: arena.player.x, y: arena.player.y + 100 };
      arena.updatePlayerMovement(arena.time.now + 64); await wait(220); check(step() === 'fire', 'Actual aim change completes aiming');
      press('fire'); const energy = arena.player.energy; arena.updatePlayerShooting(arena.time.now + 1000); press(null); await wait(220);
      check(arena.player.energy < energy && step() === 'vitals', 'Real shot consumes Energy and advances to vitals');
      await manual(); check(step() === 'bombsite', 'First round advances directly to planting');
      arena.bombSites.armSite(arena.bombSites.sites[0], 60000, arena.time.now); await wait(220);
      check(step() === 'enemy', 'Authoritative armed-site event advances training');
      // Actual projectile collision is exercised in the mixed fixture; this focused
      // check invokes the same damage signal after applying real damage to a hostile.
      const enemy = arena.spawnEnemy('grunt', true, { x: arena.player.x + 100, y: arena.player.y });
      enemy.takeDamage(1, 'weapon');
      const { TutorialEventBus } = await import(live('/src/game/tutorial/TutorialEventBus.ts'));
      TutorialEventBus.emit('combat.enemyDamaged', { type: 'grunt', damage: 1 }); await wait(300);
      check(!arena.tutorialDirector.isActive(), 'No ability tour follows first-round defense');
      arena.getAimWorldPoint = originalAim;
      arena.sys.sceneUpdate = originalUpdate; arena.physics.resume();
      const session = { baseSeed: arena.roundManager.seedBase, round: 1, protocol: 'normal', objectiveMode: 'open', runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null };
      const nextRound = async round => {
        arena.completeRound();
        await until(() => game.scene.getScene('round-finished')?.sys.isActive(), 'Teaching continues through actual debrief');
        check(SaveSystem.getTutorialProgress().trainingRoundsCompleted === round - 1, 'Training completion persists round ' + (round - 1));
        const finished = game.scene.getScene('round-finished'), payload = game.registry.get('round-finished');
        startArenaLoad(finished, { reason: 'continue-next-round', session: { ...session, round, equippedMods: payload.equippedMods, modsEarned: payload.modsEarned }, message: 'LYRA training validation' });
        await until(() => arena.sys.isActive() && arena.roundRuntime.phase === 'active', 'Round ' + round + ' active');
        arena.player.invulnUntil = Infinity; arena.pointerLockInitialGate = false;
        if (arena.state.state === 'Paused') arena.restoreGameplayAfterPause();
        arena.tutorialDirector.startEligible(); await wait(220);
        originalUpdate = arena.sys.sceneUpdate; arena.sys.sceneUpdate = () => {}; arena.physics.pause();
      };
      await nextRound(2); check(step() === 'shield', 'Second round starts defensive systems');
      for (const [w, h] of [[1280, 720], [960, 600]]) {
        await resize(w, h); arena.hud.update(arena.hudPayload); await wait(60);
        const bounds = arena.resolveTutorialTarget('hud.shield');
        const focus = document.querySelector('.tutorial-focus').getBoundingClientRect();
        check(Math.abs(focus.x - (bounds.x - 12)) < 3 && Math.abs(focus.width - (bounds.width + 24)) < 3, 'Shield highlight follows actual scaled target ' + w, { bounds, focus: { x: focus.x, width: focus.width } });
        report.screenshots.push({ label: 'training-shield-' + w, png: await new Promise(r => game.renderer.snapshot(img => r(img.src))) });
      }
      arena.player.energy = 1000; arena.activateShield(arena.time.now); await wait(220); check(step() === 'dash', 'Real shield activation advances');
      press('dash'); arena.updatePlayerMovement(arena.time.now + 100); press(null); await wait(220); check(step() === 'mine', 'Real dash advances');
      for (const type of ['mine', 'fence', 'turret']) {
        arena.player.energy = 1000;
        let location;
        for (let x = 150; x < arena.worldWidth - 150 && !location; x += 90) for (let y = 150; y < arena.worldHeight - 150; y += 90) if (arena.isValidPlacement(x, y)) { location = { x, y }; break; }
        // Fallback dimensions use the authored world bounds on older scene layouts.
        if (!location) for (let x = 150; x < 1800 && !location; x += 90) for (let y = 150; y < 1200; y += 90) if (arena.isValidPlacement(x, y)) { location = { x, y }; break; }
        check(!!location, 'Valid placement for ' + type); arena.getAimWorldPoint = () => location;
        arena.placeAbility(type, arena.time.now + 200); await wait(220);
        check(step() !== type, 'Real placement advances ' + type);
      }
      arena.getAimWorldPoint = originalAim; check(step() === 'awareness', 'Second round ends with field awareness'); await manual();
      arena.sys.sceneUpdate = originalUpdate; arena.physics.resume(); await nextRound(3);
      check(step() === 'release', 'Third round offers brief certification'); await manual();
      check(!arena.tutorialDirector.isActive(), 'Third round releases the operative to normal play');
      arena.state.set('PrePlant'); arena.playerInput.adoptDevice('gamepad');
      SaveSystem.setSettings({ lyra: { ...SaveSystem.get().settings.lyra, voice: true, subtitles: true, browserTts: true } }); comms.refreshSettings();
      const voice = comms.tts.selected(SaveSystem.get().settings.lyra);
      report.voice = voice ? { name: voice.name, lang: voice.lang, localService: voice.localService } : null;
      check(!!report.voice?.localService, 'Installed local development voice selected', report.voice);
      arena.player.hp = 1; await wait(300);
      await until(() => comms.diagnostics().active === 'warning.health', 'Low-health warning');
      check(arena.hudInformation.communication?.heading.startsWith('LYRA'), 'Warning uses existing notification console');
      await wait(700); report.speechObserved = comms.diagnostics().speaking;
      check(report.speechObserved && comms.diagnostics().provider === 'browser-tts', 'Local browser speech actually starts');
      check(AudioManager.get().lyraDuck > 0, 'Actual warning speech ducks music');
      arena.player.hp = arena.player.stats.maxHealth; await wait(300); check(comms.diagnostics().active === null, 'Recovered health cancels stale warning');
      check(AudioManager.get().lyraDuck === 0, 'Cancelled warning restores music');
      arena.legendaryRevealInProgress = true; await wait(100); check(!comms.say('context.pickup'), 'Mod reveal excludes LYRA');
      arena.legendaryRevealInProgress = false; await wait(100);
      SaveSystem.setSettings({ lyra: { ...SaveSystem.get().settings.lyra, voice: false } }); comms.refreshSettings();
      arena.collectPickup('health', 'enemy'); await wait(2100); check(comms.diagnostics().active === 'context.pickup', 'Real pickup provides text-only contextual teaching');
      arena.state.set('Paused'); await wait(100); check(comms.diagnostics().active === null && arena.hudInformation.communication === null, 'Pause clears voice and shared subtitle');
      arena.state.set('PrePlant'); comms.queue.resetCooldowns(); await wait(100);
      // A short existing local sound verifies recorded provider loading, not authored LYRA dialogue.
      LYRA_RECORDINGS['en-US']['tactical.planted'] = '../soundeffects/Laser.mp3';
      SaveSystem.setSettings({ lyra: { ...SaveSystem.get().settings.lyra, voice: true, browserTts: false } }); comms.refreshSettings();
      check(comms.say('tactical.planted'), 'Registered recording enters provider chain'); await wait(1000);
      check(comms.diagnostics().provider === 'recorded' && comms.diagnostics().voiceStarted, 'Local recorded file starts ahead of TTS');
      delete LYRA_RECORDINGS['en-US']['tactical.planted']; comms.cancel();
      LYRA_RECORDINGS['en-US']['tactical.planted'] = 'missing-test-recording.mp3'; comms.queue.resetCooldowns();
      check(comms.say('tactical.planted'), 'Missing recording still admits essential text'); await wait(700);
      check(comms.diagnostics().active === 'tactical.planted' && !comms.diagnostics().speaking, 'Missing recording falls back to readable text'); delete LYRA_RECORDINGS['en-US']['tactical.planted'];
      arena.sys.sceneUpdate = originalUpdate; stopScenes(); await wait(150);
      check(document.querySelectorAll('.tutorial-overlay').length === 0, 'Scene retirement removes tutorial overlay');
      check(comms.diagnostics().active === null, 'Scene retirement cancels speech');
      game.scene.start('options', { returnScene: 'menu' }); await wait(300);
      const options = game.scene.getScene('options');
      for (const label of ['LYRA VOICE VOLUME', 'LYRA SUBTITLES: ON', 'AMBIENT COMMENTS: ON']) check(all(options).some(o => o.text === label), 'Options exposes ' + label);
      check(SaveSystem.get().settings.soundVolumes.shot === .37, 'LYRA settings preserve individual SFX gain');
      report.profileId = SaveSystem.getActiveProfileSummary().id;
      report.completedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally {
      if (arena && originalUpdate) arena.sys.sceneUpdate = originalUpdate;
      parent.style.width = oldStyle.width; parent.style.height = oldStyle.height; game.scale.resize(oldSize.width, oldSize.height); game.scale.refresh();
      report.running = false;
    }
  })();
  return { started: true };
})();
