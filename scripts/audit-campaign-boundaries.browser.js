// Short assisted lifecycle checks. No campaign soak or performance claim.
(() => {
  const game = globalThis.n3onGame;
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], current: 'setup' };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok, label, detail) => {
    report.cases.push({ ok: !!ok, label, detail });
    if (!ok) throw Error(label);
  };
  const until = async (predicate, label, timeout = 12000) => {
    const start = performance.now();
    while (!predicate()) {
      if (performance.now() - start > timeout) {
        const arena = game.scene.keys.arena;
        report.timeout = { label, bossPhase: arena.bossFlowPhase, state: arena.state.state,
          lifecycle: arena.roundRuntime.snapshot(), now: arena.time.now, clockPaused: arena.time.paused,
          sceneStatus: arena.sys.settings.status, timers: arena.time._active?.length, bossVictoryHandled: arena.bossVictoryHandled };
        throw Error('Timed out: ' + label);
      }
      await wait(30);
    }
  };
  const onError = e => report.errors.push(String(e.error?.stack ?? e.reason?.stack ?? e.message ?? e.reason));
  window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onError);
  report.promise = (async () => {
    const stop = async () => {
      for (const scene of game?.scene.getScenes(false) ?? []) if (scene.sys.isActive() || scene.sys.isPaused() || scene.sys.isSleeping()) game.scene.stop(scene.scene.key);
      await wait(60);
    };
    try {
      // Vite may retain HMR query versions across reloads. Follow the same imports
      // as the production scene so this fixture cannot create a second save owner.
      const dependency = async (url, symbol) => {
        const source = await fetch(url).then(r => r.text());
        const path = source.match(new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*["']([^"']+)`))?.[1];
        if (!path) throw Error('Missing runtime import: ' + symbol);
        return path;
      };
      const saveUrl = await dependency('/src/game/scenes/ArenaScene.ts', 'SaveSystem');
      const profileUrl = await dependency(saveUrl, 'PlayerProfileStore');
      const { SaveSystem } = await import(saveUrl);
      const { PlayerProfileStore } = await import(profileUrl);
      const { LocalSaveManager } = await import(await dependency(profileUrl, 'LocalSaveManager'));
      const { getCampaignProtocol, getCampaignStartRounds, isCampaignModeUnlocked } = await import('/src/game/progression/CampaignProgression.ts');
      await stop();
      check(SaveSystem.createProfile('Campaign ' + Date.now().toString().slice(-7)).ok, 'isolated test profile');
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; });
      SaveSystem.setSettings({ masterVolume: 0, contextualTutorials: false });
      const save = PlayerProfileStore.getActiveSave();
      check(!isCampaignModeUnlocked(save.progress.campaign, 'overdrive') && !isCampaignModeUnlocked(save.progress.campaign, 'supreme'), 'fresh profile later modes locked');
      SaveSystem.completeCampaignTraining();
      const persist = PlayerProfileStore.save;
      PlayerProfileStore.save = () => false;
      try {
        check(SaveSystem.claimCampaignPackages().length === 0 && !save.progress.campaign.packages.training.claimed && save.mods.cards.length === 0, 'failed package persistence rolls back cards and claim');
      } finally { PlayerProfileStore.save = persist; }
      const training = SaveSystem.claimCampaignPackages();
      check(training.length === 1 && new Set(training[0].modIds).size === 3 && save.mods.cards.length === 3, 'training grants three distinct Commons');
      check(SaveSystem.claimCampaignPackages().length === 0 && save.mods.cards.length === 3, 'training reward cannot repeat');
      if (globalThis.__n3onLayoutAuditOptions?.legacyAccess) {
        save.progress.campaign.legacyModeAccess = { overdrive: true, supreme: true };
        PlayerProfileStore.save();
      }
      for (const [mode, round] of globalThis.__n3onLayoutAuditOptions?.cases ?? [['normal', 1], ['normal', 11], ['normal', 21], ['overdrive', 1], ['supreme', 1], ['normal', 5], ['normal', 10], ['normal', 30], ['overdrive', 30], ['supreme', 30]]) {
        report.current = `${mode}-${round}`;
        await stop();
        game.scene.start('arena', { baseSeed: 550055, objectiveMode: 'open', round, protocol: getCampaignProtocol(mode, round), equippedMods: [], modsEarned: [] });
        const arena = game.scene.keys.arena;
        await until(() => arena.player?.active && arena.layout, 'Arena initialization');
        arena.player.invulnUntil = Infinity;
        arena.playerInput.adoptDevice('gamepad'); arena.pointerLockInitialGate = false;
        await wait(120);
        check(arena.roundManager.round === round && arena.currentModeFamily() === mode, `${mode} ${round}: local round and family`);
        check(arena.currentCombatPosition() === (mode === 'supreme' ? 61 + (round - 1) * 3 : round + (mode === 'overdrive' ? 30 : 0)), `${mode} ${round}: combat position`);
        if (round % 5) {
          check(!arena.bossEncounter && arena.bombSites.sites.length >= 2, `${mode} ${round}: ordinary objectives`);
          check(!!arena.gasHazard === (mode !== 'normal' || round >= 11), `${mode} ${round}: gas availability`);
          check(!!arena.arenaFireTraps === (mode !== 'normal' || round >= 16), `${mode} ${round}: fire availability`);
          continue;
        }
        check(!!arena.bossEncounter && arena.bombSites.sites.length === 0 && !arena.supremeFinale, `${mode} ${round}: boss replaces ordinary arena`);
        if (round === 5 && mode === 'normal') {
          arena.triggerDefeat('playerDead');
          check(getCampaignStartRounds(save.progress.campaign, 'normal').length === 1, 'Boss 5 death cannot unlock starts');
          await stop();
          game.scene.start('arena', { baseSeed: 550055, objectiveMode: 'open', round, protocol: 'normal', equippedMods: [], modsEarned: [] });
          await until(() => !!arena.bossIntroOverlay, 'Boss 5 retry');
          arena.player.invulnUntil = Infinity;
          arena.playerInput.adoptDevice('gamepad'); arena.pointerLockInitialGate = false;
        }
        arena.bossIntroOverlay.ready.element.click();
        await until(() => arena.bossFlowPhase === 'combat', 'boss intro');
        // Verify progression/lifecycle with accelerated outcomes and presentation.
        // Reward persistence remains production code; visual reveal timing is not measured.
        arena.modAcquisitionPresenter.enqueue = () => {};
        arena.bossEncounter.boss.takeDamage(1e9);
        await until(() => arena.bossFlowPhase === 'loot-collection', 'physical boss loot');
        await until(() => arena.bossLootLaunchesPending === 0, 'boss loot landing');
        for (let i = 0; i < 20 && !arena.canFinishBossCollection(); i++) {
          for (const pickup of [...arena.pickups, ...arena.modPickups]) {
            pickup.collectibleAt = 0; pickup.sprite.setPosition(arena.player.x, arena.player.y);
            if (pickup.lootMotion) { pickup.lootMotion.settled = true; pickup.lootMotion.z = 0; }
          }
          arena.updatePickups(arena.time.now, 0); arena.updateModPickups(arena.time.now, 0); await wait(40);
        }
        check(arena.canFinishBossCollection(), `${mode} ${round}: physical rewards collected`);
        arena.finishBossCollection();
        check(getCampaignStartRounds(save.progress.campaign, mode).length === round, `${mode} ${round}: boss unlocks all earlier starts`);
        if (round !== 30) {
          await until(() => game.scene.isActive('round-finished'), 'ordinary boss debrief');
        } else if (mode !== 'supreme') {
          await until(() => game.scene.isActive('round-finished'), 'terminal debrief');
          check(game.registry.get('round-finished').modeCompletion, `${mode} 30: terminal debrief, no automatic next mode`);
          check(save.progress.campaign.modes[mode].completed && save.progress.campaign.packages[mode].claimed, `${mode}: completion and package persisted`);
          check(isCampaignModeUnlocked(save.progress.campaign, mode === 'normal' ? 'overdrive' : 'supreme'), `${mode}: next mode unlocked`);
          const beforeReplay = save.mods.cards.length;
          check(SaveSystem.claimCampaignPackages().length === 0 && save.mods.cards.length === beforeReplay, `${mode}: completion package cannot repeat`);
        } else {
          await until(() => !!arena.supremeFinaleOverlay, 'Trinity after ordinary boss');
          arena.playerInput.adoptDevice('gamepad');
          arena.supremeFinaleOverlay.ready.element.click();
          await until(() => arena.bossFlowPhase === 'combat', 'Trinity engagement');
          check(!SaveSystem.getCampaignProgress().modes.supreme.completed, 'Trinity starts incomplete');
          const bosses = [...arena.supremeFinale.bosses];
          for (let i = 0; i < 2; i++) {
            bosses[i].takeDamage(1e9);
            check(!SaveSystem.getCampaignProgress().modes.supreme.completed, `Trinity ${i + 1} deaths cannot complete campaign`);
          }
          bosses[2].takeDamage(1e9);
          await until(() => SaveSystem.getCampaignProgress().modes.supreme.completed, 'Trinity completion persistence');
          const disk = JSON.parse(LocalSaveManager.getActiveProfileSaveRaw());
          check(disk.progress.campaign.modes.supreme.completed, 'third Trinity death persists Supreme completion');
          if (globalThis.__n3onLayoutAuditOptions?.ending) {
            check(!!arena.supremeVictorySequence, 'authored ending and credits constructed after Trinity');
            await wait(500);
            arena.supremeVictorySequence.skipButton.element.click();
            await until(() => game.scene.isActive('round-finished'), 'authored credits Continue action');
            check(game.registry.get('round-finished').supremeCompletion, 'ending Continue reaches terminal Supreme debrief');
            check(getCampaignStartRounds(save.progress.campaign, 'supreme').length === 30, 'all Supreme starts remain replayable after credits');
          }
        }
        await stop();
        check(arena.children.list.length === 0, `${mode} ${round}: retired scene roots`);
      }
      const profileId = save.profile.id;
      const cardIds = save.mods.cards.map(card => card.instanceId);
      check(SaveSystem.selectProfile(profileId).ok, 'reload profile through persisted save');
      const reloaded = PlayerProfileStore.getActiveSave();
      check(JSON.stringify(reloaded.mods.cards.map(card => card.instanceId)) === JSON.stringify(cardIds), 'reload neither repeats nor loses package cards');
      check(Object.values(reloaded.progress.campaign.packages).every(p => !p.eligible || p.claimed), 'all eligible one-time package claims survive reload');
    } catch (e) { report.errors.push(String(e.stack ?? e)); }
    finally { await stop(); report.running = false; window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onError); }
  })();
  return { started: true };
})();
