// Isolated DEV profile. Uses real store transactions, portal UI and anomaly transitions.
(() => {
  if (globalThis.__n3onLayoutAudit?.running) throw Error('Another fixture is running');
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], checks: [], errors: [] };
  const game = globalThis.n3onGame;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok, label) => { report.checks.push({ ok: !!ok, label }); if (!ok) throw Error(label); };
  const until = async (fn, label) => {
    const end = performance.now() + 20000;
    while (!fn()) { if (performance.now() > end) throw Error('Timeout: ' + label); await wait(40); }
  };
  const savedPads = navigator.getGamepads;
  const pad = { id: 'Xbox 360 Controller', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })), timestamp: performance.now() };
  const press = async index => {
    pad.buttons[index] = { pressed: true, value: 1, touched: true }; await wait(100);
    pad.buttons[index] = { pressed: false, value: 0, touched: false }; await wait(100);
  };
  const cardButton = id => document.querySelector(`[data-controller-focus-id="anomaly-entry-card-${id}"]`);
  const paidButton = () => document.querySelector('[data-controller-focus-id="anomaly-entry-flux"]');
  const cancel = () => document.querySelector('.anomaly-entry-dialog button:last-child').click();
  report.promise = (async () => {
    try {
      const source = await fetch('/src/game/scenes/ArenaScene.ts').then(r => r.text());
      const dep = name => source.match(new RegExp('import\\s*\\{[^}]*\\b' + name + '\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
      const { SaveSystem: S } = await import(dep('SaveSystem'));
      const { RunTransitionManager: T } = await import(dep('RunTransitionManager'));
      for (const scene of game.scene.getScenes(false))
        if (scene.sys.isActive() || scene.sys.isPaused() || scene.sys.isSleeping()) game.scene.stop(scene.scene.key);
      await wait(120);
      check(S.createProfile('Portal ' + Date.now().toString().slice(-7)).ok, 'isolated portal profile');
      S.setSettings({ masterVolume: 0, contextualTutorials: false });
      S.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; });
      S.addFluxCores(500); S.addCredits(150000);
      const profile = S.getActiveProfileSummary().id;
      const persisted = () => S.exportProfile(profile).file.save.accessCards;
      navigator.getGamepads = () => [pad];
      game.scene.start('menu'); await wait(100);
      const menu = game.scene.keys.menu; T.clearForMenu(menu);
      const session = { baseSeed: 550055, round: 9, protocol: 'normal', objectiveMode: 'open', equippedMods: [], modsEarned: [] };
      T.requestArenaTransition(menu, { reason: 'new-run', session });
      await until(() => game.scene.isActive('loading') && T.snapshot(game.scene.keys.loading).lastStep === 'awaiting-user-deploy-confirmation', 'deployment');
      game.scene.keys.loading.confirmDeployment(session, 'new-run');
      await until(() => game.scene.isActive('arena') && game.scene.keys.arena.roundRuntime?.phase === 'active', 'Arena');
      const a = game.scene.keys.arena;
      a.pointerLock.hidePrompt(); a.playerInput.adoptDevice('gamepad'); a.pointerLockInitialGate = false;
      if (a.state.state === 'Paused') a.resumeGameplay();
      a.player.invulnUntil = Infinity;
      const controller = a.anomalyController;
      const flux = () => S.get().fluxCores + a.roundFluxCores;
      const portal = async () => {
        check(controller.force('heist'), 'eligible portal created');
        controller.setForcedCost(60); controller.forceCharge();
        await until(() => controller.visual?.readyForInteraction, 'portal opening');
        a.player.setPosition(controller.visual.x, controller.visual.y); a.player.body.reset(a.player.x, a.player.y);
      };
      const visitAndReturn = async id => {
        await until(() => game.scene.isActive('anomaly-' + id) && game.scene.keys['anomaly-' + id].inputController, id + ' entry');
        check(!document.querySelector('.anomaly-entry-dialog'), id + ' entry closes dialog');
        game.scene.keys['anomaly-' + id].returnToArena(false, 'scene-shutdown');
        await until(() => game.scene.isActive('arena') && !a.anomalyReturnLifecycle.blocksExternalPause, id + ' return');
        a.pointerLock.hidePrompt(); a.playerInput.adoptDevice('gamepad'); a.player.invulnUntil = Infinity;
      };
      await portal(); await press(0);
      check(game.scene.isPaused('arena') && !!paidButton(), 'controller interaction opens paused portal dialog');
      check(controller.state === 'portal-ready', 'opening input does not auto-confirm');
      for (const id of ['heist', 'skybreach']) {
        const b = cardButton(id);
        check(b?.disabled && b.textContent.includes('0 OWNED') && b.textContent.includes('NO CARD OWNED'), id + ': unpurchased card explicitly disabled');
        b.click(); b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        check(!controller.tryEnter({ card: id }), id + ': authoritative entry rejects absent inventory');
      }
      check(controller.state === 'portal-ready' && persisted().uses === 0 && flux() === 500, 'denied actions spend no card, daily use or Flux');
      for (let i = 0; i < 4; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', bubbles: true, cancelable: true }));
        check(document.activeElement === paidButton() || document.activeElement.textContent === 'CANCEL', 'keyboard skips unowned cards ' + i);
      }
      for (let i = 0; i < 3; i++) {
        await press(13);
        check(document.activeElement !== cardButton('heist') && document.activeElement !== cardButton('skybreach'), 'controller skips unowned cards ' + i);
      }
      check(!paidButton().disabled, 'Flux entry remains enabled without cards');
      paidButton().click();
      check(controller.state === 'transitioning' && flux() === 440 && persisted().uses === 0, 'paid entry deducts Flux without inventing or consuming cards');
      await visitAndReturn('heist');
      report.cases.push({ name: 'empty inventory, input gating and paid entry', passed: true });

      check(S.purchaseAccessCard('skybreach').ok && S.purchaseAccessCard('skybreach').ok, 'purchase two SkyBreach cards');
      check(S.selectProfile(profile).ok && S.getAccessCards().owned.skybreach === 2, 'purchased inventory survives reload');
      await portal(); controller.openEntryChoices();
      check(cardButton('heist').disabled && !cardButton('skybreach').disabled, 'only purchased card type is selectable');
      check(cardButton('skybreach').textContent.includes('2 OWNED'), 'popup shows real owned count');
      cancel(); await wait(120);
      check(persisted().owned.skybreach === 2 && persisted().uses === 0, 'cancel consumes no card');
      controller.openEntryChoices(); const before = flux();
      cardButton('skybreach').click();
      check(controller.state === 'transitioning' && persisted().owned.skybreach === 1 && persisted().uses === 1, 'card entry atomically persists consumption of exactly one card');
      check(flux() === before, 'owned card entry costs no Flux');
      await visitAndReturn('skybreach');
      report.cases.push({ name: 'purchased card entry and persisted consumption', passed: true });

      check(S.purchaseAccessCard('heist').ok && persisted().purchases === 3, 'mixed third purchase remains allowed');
      await portal(); controller.openEntryChoices();
      check(!cardButton('heist').disabled && cardButton('skybreach').disabled, 'owned cards retain last-event protection');
      const stale = cardButton('heist');
      check(S.useAccessCard('heist', 'anomaly:skybreach').ok, 'fixture consumes last HEIST card after dialog opens');
      const stateBefore = JSON.stringify(persisted()), fluxBefore = flux();
      stale.click();
      check(controller.state === 'portal-ready' && stale.disabled && stale.textContent.includes('0 OWNED'), 'stale enabled action refreshes and rejects depleted card');
      check(document.querySelector('.access-entry-message').textContent === 'NO CARD OWNED', 'depleted card explains rejection');
      check(JSON.stringify(persisted()) === stateBefore && flux() === fluxBefore, 'stale action does not consume resources or fall back to Flux');
      cancel(); await wait(120);
      check(S.selectProfile(profile).ok && S.getAccessCards().owned.heist === 0, 'consumed card stays absent after reload');
      controller.openEntryChoices();
      check(cardButton('heist').disabled && cardButton('heist').textContent.includes('NO CARD OWNED'), 'reopened dialog cannot reuse spent card');
      check(!S.purchaseAccessCard('heist').ok && !S.purchaseAccessCard('skybreach').ok, 'all card types share exhausted purchase cap');
      report.cases.push({ name: 'stale inventory, reload and combined purchase cap', passed: true });
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally { navigator.getGamepads = savedPads; report.running = false; }
  })();
  return { started: true };
})();
