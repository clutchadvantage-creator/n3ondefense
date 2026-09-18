// Isolated DEV browser only; cold boot to Splash before running.
(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], screenshots: [], startedAt: new Date().toISOString() };
  const check = (ok, label, detail) => { report.cases.push({ ok: !!ok, label, detail }); if (!ok) throw Error(label); };
  const until = async (fn, label, timeout = 20000) => { const at = performance.now(); while (!fn()) { if (performance.now() - at > timeout) throw Error(label); await wait(25); } };
  const active = key => game.scene.isActive(key);
  const live = path => performance.getEntriesByType('resource').findLast(e => e.name.includes(path + '?t='))?.name ?? path;
  const objects = scene => { const out = []; const visit = o => { out.push(o); o.list?.forEach(visit); }; scene.children.list.forEach(visit); return out; };
  const click = (scene, label) => {
    const button = objects(scene).find(o => o.type === 'Container' && o.getByName('button-label')?.text === label);
    if (!button) throw Error('Missing button: ' + label);
    button.getByName('button-hit').emit('pointerdown');
  };
  const runtimeError = e => report.errors.push(String(e.error?.stack ?? e.reason ?? e.message));
  window.addEventListener('error', runtimeError); window.addEventListener('unhandledrejection', runtimeError);
  report.promise = (async () => {
    try {
      await until(() => active('splash'), 'Cold boot Splash');
      const { AudioManager } = await import(live('/src/game/systems/AudioManager.ts'));
      const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
      const { RunTransitionManager } = await import(live('/src/game/flow/RunTransitionManager.ts'));
      const { TUTORIAL_SEQUENCES } = await import('/src/game/tutorial/TutorialRegistry.ts');
      const audio = AudioManager.get();
      const count = () => audio.musicDiagnostics().voices.filter(v => v.playing).length;
      await until(() => audio.musicContext === 'menu' && audio.menuMusicAudio?.currentTime > .1, 'Splash menu audio playback');
      const firstVoice = audio.menuMusicAudio, firstTime = firstVoice.currentTime;
      check(firstVoice.src.includes('Neon%20Serenity.mp3') && count() === 1, 'Splash starts Neon Serenity with one music voice');
      const splash = game.scene.getScene('splash');
      splash.input.keyboard.emit('keydown', { key: 'Enter' });
      await until(() => active('profile-loading'), 'Profile loading begins');
      const loading = game.scene.getScene('profile-loading'), started = performance.now(), portrait = loading.portrait;
      check(!active('local-profiles') && !document.querySelector('#local-profiles-ui'), 'Profile DOM is absent during presentation');
      await wait(900);
      check(loading.progress > .35 && loading.progress < .65, 'Staged progress reaches its middle phase', loading.progress);
      check(portrait.displayWidth > 350 && portrait.x === game.scale.width / 2, 'One large centered authored enemy', { width: portrait.displayWidth, x: portrait.x });
      report.screenshots.push({ label: 'profile-loading', png: await new Promise(r => game.renderer.snapshot(img => r(img.src))) });
      await until(() => active('local-profiles'), 'Profile appears');
      const duration = performance.now() - started;
      check(duration >= 1850 && duration <= 2400, 'Profile presentation lasts approximately two seconds', duration);
      check(!portrait.scene && !active('profile-loading'), 'Loading artwork and scene retire at handoff');
      check(!!document.querySelector('#local-profiles-ui'), 'Profile DOM mounts at handoff');
      check(audio.menuMusicAudio === firstVoice && firstVoice.currentTime > firstTime && count() === 1, 'Splash to Profile preserves song and playhead');
      check(SaveSystem.createProfile('Menu audit ' + Date.now().toString().slice(-6)).ok, 'Isolated menu profile created');
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; p.completedSequences = TUTORIAL_SEQUENCES.map(s => s.id); });
      const profile = game.scene.getScene('local-profiles');
      profile.selectedProfileId = SaveSystem.getActiveProfileSummary().id; profile.refreshUi();
      [...document.querySelectorAll('#game-ui-root button')].find(b => b.textContent === 'CONTINUE').click();
      await until(() => active('menu'), 'Profile Continue enters Main Menu');
      const menuTime = firstVoice.currentTime;
      const navigate = async (key, data = {}) => {
        for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key);
        game.scene.start(key, data); await until(() => active(key), key + ' active'); await wait(150);
        check(audio.musicContext === 'menu' && audio.menuMusicAudio === firstVoice && count() === 1, key + ' preserves menu voice');
      };
      for (const key of ['garage', 'mods', 'upgrades', 'cosmetics', 'options', 'menu']) await navigate(key, { returnScene: 'menu' });
      await navigate('garage');
      click(game.scene.getScene('garage'), 'CURRENCY EXCHANGE'); await wait(100);
      check(audio.menuMusicAudio === firstVoice && firstVoice.currentTime > menuTime && count() === 1, 'Currency exchange continues the same playlist');
      await navigate('options', { returnScene: 'menu' });
      const options = game.scene.getScene('options'); options.selectTab('audio');
      const { UiNavigationController } = await import(live('/src/game/input/UiNavigationController.ts'));
      const layer = UiNavigationController.get().layers.find(l => l.id === 'phaser:options');
      const master = [...layer.manager.controls.values()].find(c => /MASTER VOLUME/i.test(layer.labels.get(c.id)));
      layer.manager.focus(master.id); layer.manager.adjust(1); await wait(400);
      const settings = SaveSystem.get().settings;
      check(Math.abs(firstVoice.volume - settings.masterVolume * settings.musicVolume) < .001, 'Actual Options slider controls menu volume', firstVoice.volume);
      firstVoice.currentTime = firstVoice.duration - .08;
      await until(() => audio.menuPlaylistIndex === 1 && audio.menuMusicAudio?.currentTime > .05, 'Natural end advances to Neon Dub Pulse');
      check(audio.menuMusicAudio.src.includes('Neon%20Dub%20Pulse.mp3') && count() === 1 && firstVoice.paused && !firstVoice.getAttribute('src'), 'First track releases its source; second track plays alone');
      const second = audio.menuMusicAudio; second.currentTime = second.duration - .08;
      await until(() => audio.menuPlaylistIndex === 0 && audio.menuMusicAudio?.currentTime > .05, 'Second natural end loops to Neon Serenity');
      check(count() === 1 && second.paused && !second.getAttribute('src'), 'Playlist wraps without duplicate sources');
      // Exercise the actual deployment owner and existing confirmation flow.
      game.scene.stop('options'); game.scene.start('menu'); await wait(150);
      const session = { baseSeed: 550055, round: 68, protocol: 'overdrive', objectiveMode: 'open', runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null };
      check(RunTransitionManager.requestArenaTransition(game.scene.getScene('menu'), { reason: 'continue-next-round', session }), 'Existing run transition accepts deployment');
      await until(() => active('arena') && game.scene.getScene('arena').roundRuntime?.phase === 'active', 'Arena activated');
      const arena = game.scene.getScene('arena'); arena.player.invulnUntil = Infinity; arena.pointerLockInitialGate = false; arena.playerInput.adoptDevice('gamepad');
      if (arena.state.state === 'Paused') arena.resumeGameplay();
      await until(() => audio.musicContext === 'gameplay' && audio.musicAudio?.currentTime > .1, 'Gameplay soundtrack takes control');
      check(audio.menuMusicAudio.paused && count() === 1, 'Arena forbids the menu voice');
      const gameplay = audio.musicAudio;
      game.scene.pause('arena'); arena.scene.launch('options', { returnScene: 'arena', resumeGameplay: true });
      await until(() => active('options'), 'Paused Options opens'); await wait(200);
      check(audio.musicContext === 'gameplay' && audio.menuMusicAudio.paused && audio.musicAudio === gameplay && count() === 1, 'Paused Arena retains gameplay music under Options');
      click(game.scene.getScene('options'), 'BACK'); await until(() => active('arena'), 'Options returns to Arena');
      // Existing HEIST owner retains its dedicated track and the Arena playhead.
      audio.enterHeistMusic(); await wait(180);
      check(gameplay.paused && audio.menuMusicAudio.paused && count() === 1, 'HEIST dedicated music excludes both playlists');
      audio.pauseEventPresentationLoops(); await wait(30);
      check(count() === 0 && audio.musicContext === 'gameplay', 'HEIST pause stays silent without starting menu music');
      audio.resumeEventPresentationLoops(); await wait(100);
      check(count() === 1 && !audio.heistMusicAudio.paused, 'HEIST resume restores its own voice');
      audio.exitHeistMusic(); await wait(100);
      check(!gameplay.paused && audio.heistMusicAudio.paused && count() === 1, 'HEIST exit restores the retained gameplay track');
      arena.quitToMenu(); await until(() => active('menu') && audio.musicContext === 'menu', 'Actual quit returns menu soundtrack');
      await wait(300);
      check(gameplay.paused && count() === 1, 'Quit retires gameplay audio before menu resumes');
      const retained = audio.menuMusicAudio, listenerBaseline = game.events.listenerCount('poststep');
      for (let i = 0; i < 12; i++) {
        game.scene.stop(i % 2 ? 'options' : 'menu'); game.scene.start(i % 2 ? 'menu' : 'options', { returnScene: 'menu' }); await wait(55);
        check(audio.menuMusicAudio === retained && count() === 1, 'Rapid menu navigation keeps one voice ' + i);
      }
      check(game.events.listenerCount('poststep') === listenerBaseline && !active('profile-loading'), 'Repeated navigation adds no music observers or loading overlays');
      const parent = game.scale.parent, savedStyle = { width: parent.style.width, height: parent.style.height };
      const savedSize = { width: game.scale.width, height: game.scale.height };
      try {
        for (const [width, height] of [[1280, 720], [960, 600], [1280, 720], [960, 600]]) {
          for (const s of game.scene.getScenes(true)) game.scene.stop(s.scene.key);
          parent.style.width = width + 'px'; parent.style.height = height + 'px'; game.scale.resize(width, height); game.scale.refresh();
          game.scene.start('profile-loading'); await wait(350);
          const view = game.scene.getScene('profile-loading'), gpu = view.portrait.texture.getWebGLTexture().webGLTexture;
          check(game.renderer.gl.isTexture(gpu) && view.portrait.x === width / 2 && view.portrait.displayWidth >= 350, 'Compact presentation retains a large centered enemy ' + width);
          if (width === 960) report.screenshots.push({ label: 'profile-loading-compact', png: await new Promise(r => game.renderer.snapshot(img => r(img.src))) });
          game.scene.stop('profile-loading'); await wait(40);
          check(!game.renderer.gl.isTexture(gpu) && view.children.length === 0 && Phaser.Display.Canvas.CanvasPool.pool.filter(e => e.parent?.scene === view).length === 0, 'Interrupted presentation releases GPU artwork and Text canvases ' + width);
          game.scene.start('menu'); await wait(100);
        }
      } finally { parent.style.width = savedStyle.width; parent.style.height = savedStyle.height; game.scale.resize(savedSize.width, savedSize.height); game.scale.refresh(); }
      game.scene.stop('menu'); sessionStorage.removeItem('n3on-defense.splash.played'); game.scene.start('splash'); await wait(1200);
      const splashLayer = UiNavigationController.get().layers.find(l => l.id === 'phaser:splash');
      const continueId = [...splashLayer.labels].find(([, label]) => label === 'PRESS ANY BUTTON')?.[0];
      check(continueId && splashLayer.manager.focus(continueId), 'Shared controller resolver focuses Splash Continue');
      splashLayer.manager.activate(); await until(() => active('profile-loading'), 'Controller Continue opens profile presentation');
      check(audio.menuMusicAudio === retained && count() === 1, 'Controller Splash handoff preserves the same menu voice');
      await until(() => active('local-profiles'), 'Controller route reaches Profile');
      check(!!document.querySelector('#local-profiles-ui') && !active('profile-loading'), 'Controller route retires overlay and mounts Profile');
      report.music = audio.musicDiagnostics();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally { window.removeEventListener('error', runtimeError); window.removeEventListener('unhandledrejection', runtimeError); report.running = false; }
  })();
  return 'Menu presentation audit started';
})();
