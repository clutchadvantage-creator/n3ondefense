// Isolated DEV browser only. Test campaign metadata never enters production config.
(() => {
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], checks: [], samples: [], errors: [], screenshots: [] };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok, label) => { report.checks.push({ ok: !!ok, label }); if (!ok) throw Error(label); };
  const importDependency = async (path, name) => {
    const source = await fetch(path).then(response => response.text());
    const url = source.match(new RegExp('import\\s*\\{[^}]*\\b' + name + '\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
    return import(url);
  };
  report.promise = (async () => {
    let campaigns, originalCampaigns, originalSetItem, originalMatchMedia, originalGetGamepads, originalHasFocus;
    try {
      const game = globalThis.n3onGame;
      // DEV-only Voice Lab controls can claim DOM focus; production omits them.
      document.querySelectorAll('.lyra-dev').forEach(element => element.remove());
      check(game && location.hostname === '127.0.0.1', 'isolated DEV game is available');
      const { SaveSystem: S } = await importDependency('/src/game/scenes/MainMenuScene.ts', 'SaveSystem');
      const { PlayerProfileStore: Store } = await importDependency('/src/game/systems/SaveSystem.ts', 'PlayerProfileStore');
      const { UiNavigationController } = await importDependency('/src/game/utils/ui.ts', 'registerUiFocusable');
      // Resolve the exact campaign module used by the Store under Vite HMR.
      const campaignModule = await importDependency('/src/game/state/PlayerProfileStore.ts', 'earnWeeklyCampaignRewards');
      campaigns = campaignModule.WEEKLY_REWARD_CAMPAIGNS;
      originalCampaigns = [...campaigns];
      check(!campaigns.length, 'no production special rewards configured');
      for (const scene of game.scene.getScenes(false)) game.scene.stop(scene.scene.key);
      await wait(80);
      check(S.createProfile('Weekly ' + Date.now().toString().slice(-7)).ok, 'isolated test profile created');
      S.setSettings({ masterVolume: 0, contextualTutorials: false, buttonJiggle: 0 });
      S.updateTutorialProgress(progress => { progress.firstRunStage = 'complete'; progress.firstRunWelcomePending = false; });
      const save = Store.getActiveSave();
      save.progress.highestRound = 10;
      save.progress.campaign.packages.training.eligible = true;
      save.progress.campaign.legacyModeAccess.overdrive = true;
      save.progress.campaign.legacyModeAccess.supreme = true;
      Store.save();
      const first = S.getWeeklyOperations();
      game.scene.keys.menu.operationDeck = 'regular';
      game.scene.start('menu'); await wait(700);
      let menu = game.scene.keys.menu;
      let root = menu.children.getByName('weekly-operations-panel');
      check(root?.active, 'existing mission panel mounted');
      const layer = UiNavigationController.get().phaserLayer(menu);
      check(layer.manager.focus('weekly-next'), 'stable arrow focus ID registered');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(280);
      check(menu.operationDeck === 'overdrive', 'focused arrow switches to Overdrive');
      check(menu.children.getByName('weekly-operations-panel') === root, 'arrow preserves outer panel instance');
      const before = JSON.stringify(Store.getActiveSave().progress.weeklyOperations);
      const children = menu.children.length, rootChildren = root.length, tweenCount = menu.tweens.getTweens().length;
      let shutdowns = 0; menu.events.on('shutdown', () => shutdowns++);
      for (let index = 0; index < 51; index++) layer.manager.activate();
      await wait(400);
      check(menu.operationDeck === 'regular' && shutdowns === 0, '51 rapid switches retain correct deck without restarting scene');
      check(root.active && root.alpha === 1 && layer.manager.currentId === 'weekly-next', 'panel visibility and controller focus remain stable');
      check(menu.children.length === children && root.length === rootChildren, 'cached page switches do not accumulate objects');
      check(menu.tweens.getTweens().length <= tweenCount, 'rapid switching cancels obsolete page tweens');
      check(before === JSON.stringify(Store.getActiveSave().progress.weeklyOperations), 'switching never mutates mission progress');
      check(root.list.filter(item => item.name.startsWith('weekly-page-') && item.visible).length === 1, 'exactly one selected page visible');
      originalGetGamepads = navigator.getGamepads;
      originalHasFocus = document.hasFocus;
      document.hasFocus = () => true;
      const pad = { id: 'Xbox 360 Controller', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })), timestamp: 1 };
      navigator.getGamepads = () => [pad];
      await wait(150);
      pad.buttons[5] = { pressed: true, value: 1, touched: true }; pad.timestamp++;
      await wait(150);
      pad.buttons[5] = { pressed: false, value: 0, touched: false }; pad.timestamp++;
      await wait(100);
      check(menu.operationDeck === 'overdrive', 'gamepad shoulder advances weekly page through live input');
      layer.manager.focus('weekly-next'); layer.manager.activate(); await wait(280);
      navigator.getGamepads = originalGetGamepads; originalGetGamepads = undefined;
      document.hasFocus = originalHasFocus; originalHasFocus = undefined;
      const page = root.getByName('weekly-page-regular');
      check(page.list.some(item => item.text?.includes(first.regular.objectives[0].title)), 'creative title displayed');
      check(page.list.some(item => item.text === first.regular.objectives[0].description), 'separate objective displayed');
      check(page.list.some(item => item.name === 'weekly-reward-credits'), 'individual currency entry rendered with shared pickup art');
      check(!page.list.some(item => item.name.startsWith('weekly-featured-')), 'no empty featured slots');
      report.screenshots.push({ label: `regular-${game.scale.width}x${game.scale.height}`, png: await new Promise(resolve => game.renderer.snapshot(image => resolve(image.src))) });
      // Real authoritative event adapters; Regular counts all modes, harder only non-Normal.
      S.recordRoundCompletion(5, 'normal', 'boss');
      S.recordRoundCompletion(5, 'overdrive', 'boss');
      S.recordAnomalyCompletion('heist', 'normal');
      const { getCampaignProtocol } = await import('/src/game/progression/CampaignProgression.ts');
      const supremeProtocol = getCampaignProtocol('supreme', 30);
      S.recordAnomalyCompletion('skybreach', supremeProtocol);
      const tracked = Store.getActiveSave().progress;
      check(tracked.bossesDefeated === 2 && tracked.overdriveWeeklyProgress.bossesDefeated === 1, 'boss victories use existing difficulty eligibility');
      S.recordRoundCompletion(30, supremeProtocol, 'boss');
      S.recordSupremeCompletion();
      check(tracked.bossesDefeated === 4 && tracked.overdriveWeeklyProgress.bossesDefeated === 3, 'Trinity finale counts as a harder-deck boss victory');
      check(tracked.heistsCompleted === 1 && tracked.overdriveWeeklyProgress.heistsCompleted === 0, 'Normal Heist completion stays out of harder deck');
      check(tracked.skyBreachesCompleted === 1 && tracked.overdriveWeeklyProgress.skyBreachesCompleted === 1, 'Supreme SkyBreach feeds harder deck');
      const { MOD_DEFINITIONS } = await import('/src/game/mods/definitions.ts');
      const mod = MOD_DEFINITIONS.find(item => item.rarity === 'common');
      S.addCredits(100000); S.addCoreTokens(100);
      check(S.addMod(mod.id).ok && S.rankUpMod(mod.id).ok, 'real Mod inventory upgrade succeeds');
      check(!S.rankUpMod('missing-test-mod').ok, 'failed Mod upgrade rejected');
      check(S.exchangeCurrency('credits', 'coreTokens', 200).ok, 'real currency exchange succeeds');
      check(!S.exchangeCurrency('credits', 'credits', 200).ok, 'invalid currency exchange rejected');
      check(Store.getActiveSave().progress.modUpgrades === 1 && Store.getActiveSave().progress.currencyExchanges === 1,
        'only successful workshop transactions advance weekly counters');
      check(Store.getActiveSave().progress.overdriveWeeklyProgress.modUpgrades === 0 && Store.getActiveSave().progress.overdriveWeeklyProgress.currencyExchanges === 0,
        'menu transactions never invent harder-deck protocol attribution');
      // Start campaign cases from incomplete controlled counters, regardless of today's selected metrics.
      const seeded = Store.getActiveSave();
      for (const deck of ['regular', 'overdrive']) {
        const track = deck === 'regular' ? seeded.progress.weeklyOperations : seeded.progress.weeklyOperations.overdrive;
        const progress = deck === 'regular' ? seeded.progress : seeded.progress.overdriveWeeklyProgress;
        for (const key of Object.keys(track.baselines)) track.baselines[key] = progress[key] ?? 0;
        delete track.completedAt; track.rewardClaimed = false;
      }
      Store.save();
      // Inject a three-week TEST campaign with existing currency art and inventories.
      const now = Date.now();
      const shared = { rewardId: 'shared-test', type: 'cosmetic', inventoryRef: 'player-pink', displayName: 'Rose Strike', iconRef: 'player-circle', amount: 1, enabled: true };
      const bonus = { rewardId: 'bonus-test', type: 'fluxCores', inventoryRef: 'fluxCores', displayName: 'Flux Core', iconRef: 'pickup:fluxCore', amount: 1, enabled: true };
      campaigns.push({ campaignId: 'dev-weekly-test', title: 'DEV ONLY', description: 'Browser fixture', enabled: true,
        startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 21 * 86400000).toISOString(), sharedReward: shared, overdriveBonus: bonus });
      let snapshots = S.getWeeklyOperations();
      check(snapshots.regular.featuredRewards.length === 1 && snapshots.overdrive.featuredRewards.length === 2, 'Regular shared / Overdrive shared plus exclusive bonus');
      menu.scene.restart(); await wait(700); menu = game.scene.keys.menu; root = menu.children.getByName('weekly-operations-panel');
      const nav = UiNavigationController.get().phaserLayer(menu); nav.manager.focus('weekly-next');
      if (menu.operationDeck !== 'overdrive') nav.manager.activate(); await wait(300);
      const bonusPage = root.getByName('weekly-page-overdrive');
      check(bonusPage.list.filter(item => item.name.startsWith('weekly-featured-')).length === 2, 'two configured reward cards display');
      check(bonusPage.getByName('weekly-campaign-countdown')?.text.includes('FEATURED REWARDS END IN'), 'campaign countdown distinct from weekly clock');
      const detailId = 'weekly-page-overdrive:dev-weekly-test:bonus-test';
      check(nav.manager.focus(detailId), 'featured reward details are keyboard/controller focusable');
      nav.manager.activate();
      check(bonusPage.list.some(item => item.name === 'weekly-reward-details' && item.visible), 'reward details open without changing scene');
      nav.manager.activate(); nav.manager.focus('weekly-next');
      report.screenshots.push({ label: `overdrive-featured-${game.scale.width}x${game.scale.height}`, png: await new Promise(resolve => game.renderer.snapshot(image => resolve(image.src))) });
      // Complete with genuine metric entry points; drive only the selected target counters.
      const complete = deck => {
        const snap = S.getWeeklyOperations()[deck];
        const current = Store.getActiveSave();
        const progress = deck === 'regular' ? current.progress : current.progress.overdriveWeeklyProgress;
        const state = deck === 'regular' ? current.progress.weeklyOperations : current.progress.weeklyOperations.overdrive;
        for (const objective of snap.objectives) progress[objective.statKey] = (objective.progressMode === 'absolute' ? 0 : state.baselines[objective.statKey]) + objective.target;
        // The fixture sets counters; this actual event commit observes completion and persists reservations.
        Store.recordCombatProgress(0, 0, deck === 'regular' ? 'normal' : 'overdrive');
      };
      complete('regular');
      let ledger = Store.getActiveSave().progress.weeklyRewardCampaigns;
      check(ledger.receipts.length === 1 && !ledger.receipts[0].claimedAt, 'live completion persists EARNED before menu delivery');
      const walletBefore = structuredClone(Store.getActiveSave().wallet);
      const failedWalletEvents = [];
      const unsubscribeWallet = S.subscribeWalletChanges(wallet => failedWalletEvents.push(wallet.credits), false);
      originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (/\.profile\.[^.]+$/.test(key)) throw Error('TEST storage unavailable'); return originalSetItem.call(this, key, value); };
      snapshots = S.getWeeklyOperations();
      check(!snapshots.regular.rewardClaimed && snapshots.regular.featuredRewards[0].status === 'EARNED', 'failed persistent grant remains unclaimed and retryable');
      check(JSON.stringify(Store.getActiveSave().wallet) === JSON.stringify(walletBefore), 'failed grant rolls back currency');
      unsubscribeWallet();
      check(failedWalletEvents.every(credits => credits === walletBefore.credits), 'failed grant never publishes an uncommitted wallet');
      check(!Store.getActiveSave().cosmetics.owned.includes('player-pink'), 'failed grant rolls back cosmetic ownership');
      Storage.prototype.setItem = originalSetItem; originalSetItem = undefined;
      snapshots = S.getWeeklyOperations();
      check(snapshots.regular.rewardClaimed && snapshots.regular.featuredRewards[0].status === 'CLAIMED', 'successful retry commits weekly + featured reward');
      const credits = Store.getActiveSave().wallet.credits;
      S.getWeeklyOperations(); S.getWeeklyOperations();
      check(Store.getActiveSave().wallet.credits === credits && Store.getActiveSave().cosmetics.owned.filter(id => id === 'player-pink').length === 1, 'repeated menu claims are idempotent');
      const profileId = Store.getActiveSave().profile.id;
      Store.bootstrap();
      check(Store.getActiveSave().profile.id === profileId && Store.getActiveSave().progress.weeklyRewardCampaigns.receipts[0].claimedAt, 'durable claims survive profile reload');
      complete('overdrive'); S.getWeeklyOperations();
      check(Store.getActiveSave().progress.weeklyRewardCampaigns.receipts.length === 2, 'harder completion later earns only missing bonus');
      check(S.createProfile('Other ' + Date.now().toString().slice(-7)).ok, 'second isolated profile');
      check(Store.getActiveSave().progress.weeklyRewardCampaigns.receipts.length === 0, 'campaign claims isolated by profile');
      Store.selectProfile(profileId);
      originalMatchMedia = window.matchMedia;
      window.matchMedia = query => query.includes('prefers-reduced-motion') ? { matches: true } : originalMatchMedia.call(window, query);
      menu.scene.restart(); await wait(400); menu = game.scene.keys.menu; root = menu.children.getByName('weekly-operations-panel');
      const reducedNav = UiNavigationController.get().phaserLayer(menu); reducedNav.manager.focus('weekly-next');
      reducedNav.manager.activate();
      check(root.list.find(item => item.name === `weekly-page-${menu.operationDeck}`).alpha === 1, 'reduced-motion deck switches instantly');
      check(root.alpha === 1 && !menu.tweens.getTweensOf(root.list.find(item => item.name === `weekly-page-${menu.operationDeck}`)).length, 'reduced-motion page has no transition tween');
      window.matchMedia = originalMatchMedia; originalMatchMedia = undefined;
      report.cases.push({ name: 'mission deck navigation, layouts, authoritative metrics, campaign eligibility, atomic grants and profile reload' });
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally {
      if (originalSetItem) Storage.prototype.setItem = originalSetItem;
      if (originalMatchMedia) window.matchMedia = originalMatchMedia;
      if (originalGetGamepads) navigator.getGamepads = originalGetGamepads;
      if (originalHasFocus) document.hasFocus = originalHasFocus;
      if (campaigns && originalCampaigns) campaigns.splice(0, campaigns.length, ...originalCampaigns);
      report.running = false;
    }
  })();
  return { started: true };
})();
