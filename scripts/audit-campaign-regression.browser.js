// Short assisted training, combat and HEIST checks; not a campaign soak.
(() => {
  const game = globalThis.n3onGame;
  const report = globalThis.__n3onLayoutAudit = { running: true, current: 'training', cases: [], errors: [], frames: [] };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok, label) => { report.cases.push({ ok: !!ok, label }); if (!ok) throw Error(label); };
  const until = async (fn, label) => { const end = performance.now() + 15000; while (!fn()) { if (performance.now() > end) throw Error('Timeout: ' + label); await wait(30); } };
  const stop = async () => { for (const scene of game.scene.getScenes(false)) if (scene.sys.isActive() || scene.sys.isPaused() || scene.sys.isSleeping()) game.scene.stop(scene.scene.key); await wait(80); };
  const onError = event => report.errors.push(String(event.error?.stack ?? event.reason?.stack ?? event.message ?? event.reason));
  window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onError);
  report.promise = (async () => {
    try {
      const dependency = async (url, symbol) => (await fetch(url).then(r => r.text()))
        .match(new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*["']([^"']+)`))[1];
      const saveUrl = await dependency('/src/game/scenes/ArenaScene.ts', 'SaveSystem');
      const { SaveSystem: Save } = await import(saveUrl);
      const { PlayerProfileStore: Profiles } = await import(await dependency(saveUrl, 'PlayerProfileStore'));
      const { completeTutorialSequence, requestTutorialReplay } = await import('/src/game/tutorial/TutorialProgress.ts');
      const { getCampaignProtocol } = await import('/src/game/progression/CampaignProgression.ts');
      const { ANOMALY_BY_ID } = await import('/src/game/anomalies/AnomalyRegistry.ts');
      await stop();
      check(Save.createProfile('Campaign flow ' + Date.now().toString().slice(-6)).ok, 'new isolated training profile');
      Save.setSettings({ masterVolume: 0, contextualTutorials: false });
      Save.updateTutorialProgress(p => { p.firstRunStage = 'arena-teaching'; p.firstRunWelcomePending = false; });
      const launch = async (mode, round) => {
        await stop();
        game.scene.start('arena', { baseSeed: 550055, round, objectiveMode: 'open', protocol: getCampaignProtocol(mode, round), equippedMods: [], modsEarned: [] });
        const arena = game.scene.keys.arena;
        await until(() => arena.player?.active && arena.layout, 'Arena initialization');
        arena.player.invulnUntil = Infinity;
        arena.playerInput.adoptDevice('gamepad'); arena.pointerLockInitialGate = false;
        arena.tutorialDirector?.destroy(); arena.tutorialDirector = null;
        arena.modAcquisitionPresenter.enqueue = () => {};
        await until(() => arena.roundRuntime.phase === 'active', 'live Arena');
        return arena;
      };
      for (const round of [1, 2, 3]) {
        const arena = await launch('normal', round);
        arena.state.set('Victory'); arena.completeRound();
        check(Save.getTutorialProgress().trainingRoundsCompleted === round, `training ${round}: successful outcome persisted`);
        check(Save.getCampaignProgress().packages.training.claimed === (round === 3), `training ${round}: package timing`);
      }
      await until(() => game.scene.isActive('menu'), 'graduation menu');
      check(Save.getTutorialProgress().firstRunStage === 'waiting-for-garage', 'third round leads to Garage');
      check(!game.scene.keys.menu.tutorialDirector.awaits('ui.startLocalSelected'), 'graduated player is not forced into START LOCAL');
      const count = Profiles.getActiveSave().mods.cards.length;
      Save.updateTutorialProgress(p => completeTutorialSequence(p, 'onboarding.mod-collection'));
      check(Save.getTutorialProgress().firstRunStage === 'waiting-for-store', 'Mod teaching leads to Store');
      Save.updateTutorialProgress(p => completeTutorialSequence(p, 'onboarding.store'));
      check(Save.getTutorialProgress().firstRunStage === 'complete', 'Store teaching retires first-run forcing');
      Save.updateTutorialProgress(p => { requestTutorialReplay(p, 'onboarding.mod-collection'); completeTutorialSequence(p, 'onboarding.mod-collection'); });
      check(Save.getTutorialProgress().firstRunStage === 'complete' && Save.claimCampaignPackages().length === 0 && Profiles.getActiveSave().mods.cards.length === count, 'workstation replay neither reenrolls nor regrants');
      const progress = Save.getCampaignProgress();
      progress.legacyModeAccess.overdrive = true; progress.legacyModeAccess.supreme = true; // test access only
      Profiles.save();
      for (const [mode, round] of [['normal', 11], ['overdrive', 21], ['supreme', 29]]) {
        report.current = `${mode}-${round}`;
        const arena = await launch(mode, round);
        const intervals = []; let previous = performance.now();
        const clock = () => { const now = performance.now(); intervals.push(now - previous); previous = now; };
        game.events.on('step', clock);
        try { await wait(4000); } finally { game.events.off('step', clock); }
        const sorted = intervals.slice(1).sort((a,b) => a-b);
        report.frames.push({ mode, round, frames: sorted.length, meanMs: sorted.reduce((a,b) => a+b, 0) / sorted.length, p95Ms: sorted[Math.ceil(sorted.length * .95)-1], maxMs: sorted.at(-1) });
        check(sorted.length > 30 && arena.player.active, `${mode}: live update smoke sample`);
        if (mode !== 'supreme') continue;
        Save.addFluxCores(60);
        arena.refreshHudWallet();
        const before = Save.get().fluxCores;
        check(arena.spendAnomalyEntryCost(60), 'HEIST entry uses real 60-Flux wallet check');
        arena.beginAnomalyTransition({ anomalyId: 'heist', definition: ANOMALY_BY_ID.get('heist'), sessionId: 'campaign-heist-' + Date.now(), cost: 60, portal: { x: arena.player.x, y: arena.player.y } });
        await until(() => game.scene.isActive('anomaly-heist'), 'HEIST entry');
        const heist = game.scene.keys['anomaly-heist'];
        check(heist.campaignPositions.rewardPosition === 89 && heist.campaignPositions.difficultyPosition === 145, 'HEIST has independent late reward and difficulty positions');
        check(heist.session.cost === 60 && Save.get().fluxCores === before - 60, 'HEIST session fee equals deducted amount');
        check(heist.containers.length >= 5 && heist.containers.length <= 8, 'HEIST keeps container count');
        heist.player.invulnUntil = Infinity;
        heist.phase = 'looting';
        for (const container of heist.containers) heist.damageContainer(container, 1e9);
        check(heist.containersOpened === heist.containers.length, 'all HEIST containers opened through damage path');
        // Accelerated extraction outcome; traversal/45-second survival is not timed here.
        heist.completeHeist();
        await until(() => game.scene.isActive('arena') && !game.scene.isActive('anomaly-heist') && !arena.anomalyReturnAwaitingFirstUpdate, 'visible Arena return');
        check(arena.roundManager.round === round && arena.player.active, 'HEIST returns to same local round');
        await wait(120);
        check(heist.children.list.length === 0, 'HEIST retires its visual objects');
      }
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally { await stop(); window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onError); report.running = false; }
  })();
  return { started: true };
})();
