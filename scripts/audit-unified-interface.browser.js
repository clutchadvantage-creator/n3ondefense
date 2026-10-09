// Run only in the isolated local DEV browser. Never use a player's browser profile.
(() => {
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], checks: [], errors: [], screenshots: [] };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const browserError = event => report.errors.push(String(event.error?.stack ?? event.reason ?? event.message));
  window.addEventListener('error', browserError); window.addEventListener('unhandledrejection', browserError);
  const check = (ok, label) => { report.checks.push({ ok: !!ok, label }); if (!ok) throw Error(label); };
  const dependency = async (path, name) => {
    const source = await fetch(path).then(r => r.text());
    return import(source.match(new RegExp('import\\s*\\{[^}]*\\b' + name + '\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1]);
  };
  report.promise = (async () => {
    let originalSetItem;
    try {
      const game = globalThis.n3onGame;
      const walk = objects => objects.flatMap(object => [object, ...(object.list ? walk(object.list) : [])]);
      check(game && location.hostname === '127.0.0.1', 'isolated game available');
      document.querySelectorAll('.lyra-dev').forEach(element => element.remove());
      const { SaveSystem: S } = await dependency('/src/game/scenes/OperatorGarageScene.ts', 'SaveSystem');
      const { PlayerProfileStore: Store } = await dependency('/src/game/systems/SaveSystem.ts', 'PlayerProfileStore');
      const { UiNavigationController } = await dependency('/src/game/utils/ui.ts', 'registerUiFocusable');
      const { MOD_DEFINITIONS } = await import('/src/game/mods/definitions.ts');
      const { recordCampaignVictory } = await import('/src/game/progression/CampaignProgression.ts');
      for (const scene of game.scene.getScenes(false)) game.scene.stop(scene.scene.key);
      await wait(100);
      check(S.createProfile('Config QA ' + Date.now().toString().slice(-5)).ok, 'isolated configuration test profile');
      S.setSettings({ masterVolume: 0, contextualTutorials: false, buttonJiggle: 0 });
      S.updateTutorialProgress(progress => { progress.firstRunStage = 'complete'; progress.firstRunWelcomePending = false; });
      const save = Store.getActiveSave(); save.wallet.credits = 100000; save.wallet.coreTokens = 500;
      for (const mode of ['normal', 'overdrive', 'supreme']) recordCampaignVictory(save.progress.campaign, mode, 30, 'boss');
      for (const slot of ['weapon', 'player', 'defense', 'bombSite', 'wildcard']) {
        const definition = MOD_DEFINITIONS.find(item => item.category === (slot === 'wildcard' ? 'utility' : slot) && !['legendary', 'supreme'].includes(item.rarity));
        S.addMod(definition.id); check(S.equipMod(slot, definition.id).ok, `${slot} fixture equipped`);
      }
      Store.getActiveSave().mods.cards[0].infusionId = 'arcade-pop';
      Store.getActiveSave().cosmetics.owned.push('player-pink'); S.equipCosmetic('playerColor', 'player-pink');
      S.setOperationsCheckpoint('supreme-leo', 17);
      S.setNextRunSetupSelection({ contract: 'elite-hunt', modFocus: 'defense' }); S.setSavedDeploymentEnabled(true);
      Store.save();
      const expected = structuredClone(Store.getActiveSave());
      const screenshot = async label => report.screenshots.push({ label: `${label}-${game.scale.width}x${game.scale.height}`,
        png: await new Promise(resolve => game.renderer.snapshot(image => resolve(image.src))) });
      game.scene.start('garage', { returnScene: 'menu' }); await wait(500);
      let garage = game.scene.keys.garage;
      await screenshot('garage');
      garage.showPresets(); await wait(200);
      let manager = UiNavigationController.get().phaserLayer(garage).manager;
      const activate = id => { check(manager.focus(id), `${id} focusable`); manager.activate(); };
      const submitName = (name) => {
        const input = document.querySelector('input[name="preset-name"]'); check(input, 'preset name input visible');
        input.value = name; input.closest('form').requestSubmit();
      };
      const shell = garage.overlay;
      activate('config-a-save'); submitName('TURRET KING'); await wait(100);
      check(!document.querySelector('.terminal-dialog-overlay') && garage.input.enabled, 'save closes dialog and restores scene input');
      check(S.getGarageState().presets[0].name === 'TURRET KING', 'custom name saved through actual dialog');
      check(Object.keys(S.getGarageState().presets[0].cosmetics).length === 10, 'all current cosmetic categories captured');
      check(S.getGarageState().presets[0].infusionIds.weapon === 'arcade-pop', 'equipped infusion link captured');
      activate('config-a-rename'); submitName('BOSS KILLER'); await wait(100);
      check(S.getGarageState().presets[0].name === 'BOSS KILLER', 'rename changes selected slot');
      const saved = JSON.stringify(S.getGarageState().presets[0]);
      activate('config-a-save');
      check(document.querySelector('.terminal-dialog button[type="submit"]').textContent === 'OVERWRITE CONFIG', 'existing preset explicitly asks to overwrite');
      document.querySelector('.terminal-dialog button[type="button"]').click();
      check(JSON.stringify(S.getGarageState().presets[0]) === saved, 'cancelled overwrite keeps saved configuration intact');
      const paged = game.scale.width < 1000 || game.scale.height < 650;
      if (paged) activate('preset-page-right');
      activate('config-b-save'); submitName('FLUX FARMER');
      activate('config-b-rename'); submitName('FLUX FARMER II');
      check(S.getGarageState().presets[0].name === 'BOSS KILLER', 'editing the second slot preserves the first name');
      activate('config-b-save'); submitName('FARMING KIT');
      check(S.getGarageState().presets[1].name === 'FARMING KIT', 'confirmed overwrite replaces only the chosen slot');
      if (paged) activate('preset-page-left');
      S.unequipMod('weapon'); S.equipCosmetic('playerColor', 'player-cyan'); S.setOperationsCheckpoint('normal', 1);
      S.setNextRunSetupSelection({ contract: null, modFocus: null }); S.setSavedDeploymentEnabled(false);
      activate('config-a-load'); await wait(150);
      check(JSON.stringify(Store.getActiveSave().mods.loadouts) === JSON.stringify(expected.mods.loadouts), 'load restores all five exact Mod instances');
      check(JSON.stringify(Store.getActiveSave().cosmetics) === JSON.stringify(expected.cosmetics), 'load restores cosmetics without adding ownership');
      check(JSON.stringify(Store.getActiveSave().wallet) === JSON.stringify(expected.wallet), 'loading never charges or grants currency');
      check(S.getOperationsConfiguration().mode === 'supreme' && S.getOperationsConfiguration().startingRound === 17, 'mode and checkpoint restored');
      check(S.getGaragePresetState('config-a').status === 'active', 'last loaded preset marked active');
      check(garage.overlay === shell, 'saving and loading preserve the outer workstation');
      S.unequipMod('weapon'); check(S.getGaragePresetState('config-a').status === 'modified', 'manual equipment change marks preset modified');
      activate('config-a-load');
      const profileId = Store.getActiveSave().profile.id; Store.bootstrap();
      check(Store.getActiveSave().profile.id === profileId && S.getGarageState().presets[0].name === 'BOSS KILLER', 'name survives persisted profile reload');
      check(S.getGaragePresetState('config-a').status === 'active', 'active preset survives profile reload');
      S.unequipMod('weapon'); S.equipCosmetic('playerColor', 'player-cyan'); S.setOperationsCheckpoint('normal', 1);
      const configuration = () => JSON.stringify({ garage: Store.getActiveSave().garage, mods: Store.getActiveSave().mods, cosmetics: Store.getActiveSave().cosmetics, protocol: Store.getActiveSave().protocol });
      const beforeFailure = configuration();
      originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (/\.profile\.[^.]+$/.test(key)) throw Error('TEST storage failure'); return originalSetItem.call(this, key, value); };
      check(!S.renameGaragePreset('config-a', 'MUST NOT COMMIT').ok, 'persistent save failure reported');
      check(configuration() === beforeFailure, 'persistent failure rolls back the rename');
      check(!S.loadGaragePreset('config-a').ok, 'load reports persistent save failure');
      check(configuration() === beforeFailure, 'failed load rolls back Mods, cosmetics, mode and active preset together');
      Storage.prototype.setItem = originalSetItem; originalSetItem = undefined;
      activate('config-a-load');
      const infused = Store.getActiveSave().mods.cards[0];
      const infusionId = infused.infusionId; delete infused.infusionId;
      const beforeInvalid = configuration(); activate('config-a-load');
      check(document.querySelector('.terminal-dialog-issues')?.textContent.includes('Infusion linkage changed'), 'failed load explains the unavailable saved component');
      check(configuration() === beforeInvalid, 'UI validation failure preserves the full setup');
      document.querySelector('.terminal-dialog button').click(); infused.infusionId = infusionId;
      if (game.scale.height < 650) {
        activate('config-a-section-mods'); await screenshot('preset-mods');
        check(walk(garage.overlay.list).some(object => /INFUSION/.test(object.text ?? '')), 'short screen exposes saved Mods and Infusions');
        activate('config-a-section-cosmetics'); await screenshot('preset-cosmetics');
        activate('config-a-cosmetic-playerColor');
        activate('config-a-section-deployment');
      }
      await screenshot('presets');
      garage.showOperations('normal'); await wait(100);
      const operationsShell = garage.overlay;
      garage.showOperations('supreme'); await wait(100);
      check(garage.overlay === operationsShell, 'deployment mode changes retain the outer frame');
      const objectCount = walk(garage.overlay.list).length;
      for (let i = 0; i < 4; i++) { garage.showOperations('overdrive'); garage.showOperations('supreme'); }
      check(walk(garage.overlay.list).length === objectCount, 'repeated mode changes retire the old page objects');
      const items = walk(garage.overlay.list);
      const tiles = items.filter(item => item.name === 'button-label' && /ROUND \d/.test(item.text));
      const pager = items.find(item => item.name === 'button-label' && item.text === '<');
      check(tiles.every(item => !pager || item.parentContainer.getBounds().bottom <= pager.parentContainer.getBounds().top), 'checkpoint tiles stay above pagination controls');
      await screenshot('deployment');
      garage.showOverdrive('overdrive'); await wait(100); const constellationShell = garage.overlay;
      garage.showOverdrive('supreme'); await wait(100);
      check(garage.overlay === constellationShell, 'constellation tabs retain the outer frame');
      await screenshot('constellations');
      garage.exchangeSource = 'credits'; garage.exchangeTarget = 'coreTokens'; garage.exchangeAmount = 200;
      garage.economyConsoleTabIndex = 0; garage.compactEconomyPage = 0;
      garage.exchangeConfirmationArmed = true; garage.exchangeConfirmLockedUntil = 0;
      for (let i = 0; i < 4; i++) garage.showCurrencyExchange();
      await wait(150);
      const walletBefore = S.getWalletSnapshot();
      const exchangeLayer = UiNavigationController.get().phaserLayer(garage);
      const confirmId = [...exchangeLayer.labels].find(([, label]) => label === 'CONFIRM SECURE EXCHANGE')?.[0];
      check(confirmId && exchangeLayer.manager.focus(confirmId), 'exchange confirmation reachable after repeated page refreshes');
      exchangeLayer.manager.activate(); await wait(150);
      check(S.getWalletSnapshot().credits === walletBefore.credits - 200 && S.getWalletSnapshot().coreTokens === walletBefore.coreTokens + 1, 'exchange still charges and grants the existing fixed rate exactly once');
      await screenshot('exchange');
      check(walk(garage.overlay.list).filter(item => item.type === 'Text').every(item => Number.isFinite(item.getBounds().width)), 'financial labels have valid rendered dimensions');
      if (game.scale.width < 1000 || game.scale.height < 640) {
        for (const page of [1, 2]) { activate(`economy-page-${page}`); await wait(50); await screenshot(`economy-market-${page}`); }
        for (const tab of [1, 2, 3]) {
          garage.economyConsoleTabIndex = tab; garage.compactEconomyPage = 0; garage.showCurrencyExchange();
          for (const page of [0, 1, 2]) { activate(`economy-page-${page}`); await wait(25); }
        }
        check(walk(garage.overlay.list).some(item => item.text === 'SCROLL DATA'), 'dense financial data exposes scroll controls');
        const scrollContent = walk(garage.overlay.list).find(item => item.type === 'Container' && item.mask);
        const downId = [...exchangeLayer.labels].find(([, label]) => label === 'DOWN')?.[0];
        check(scrollContent && downId && exchangeLayer.manager.focus(downId), 'financial scroll control is keyboard/controller reachable');
        exchangeLayer.manager.activate();
        check(scrollContent.y < 0, 'financial scroll control reveals the remaining data');
      }
      garage.showCosmetics(); await wait(150); await screenshot('locker');
      garage.showLibrary(); await wait(150); await screenshot('library');
      garage.closeOverlay(); game.scene.stop('garage'); game.scene.start('mods', { returnScene: 'garage' }); await wait(600);
      check(walk(game.scene.keys.mods.children.list).some(item => item.text === 'MOD COLLECTION'), 'collection uses requested title');
      check(!walk(game.scene.keys.mods.children.list).some(item => item.text === 'MOD CARD COLLECTION'), 'old title removed');
      await screenshot('collection');
      game.scene.stop('mods'); game.scene.start('options', { returnScene: 'menu' }); await wait(300); await screenshot('options');
      game.scene.stop('options'); game.scene.start('menu'); await wait(500); await screenshot('menu');
      report.cases.push({ name: 'complete configuration UI → validation → local persistence → restored UI, plus workstation layouts' });
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally { if (originalSetItem) Storage.prototype.setItem = originalSetItem;
      window.removeEventListener('error', browserError); window.removeEventListener('unhandledrejection', browserError); report.running = false; }
  })();
  return { started: true };
})();
