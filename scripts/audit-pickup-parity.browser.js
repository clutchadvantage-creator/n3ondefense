// Short assisted Arena -> HEIST pickup check. Test profile, no network submissions.
(() => {
  const game = globalThis.n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, current: 'pickup parity', cases: [], errors: [] };
  const check = (ok, label) => { report.cases.push({ ok: !!ok, label }); if (!ok) throw Error(label); };
  const until = async (fn, label) => { const end = performance.now() + 15000; while (!fn()) { if (performance.now() > end) throw Error('Timeout: ' + label); await wait(30); } };
  const stop = async () => { for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key); await wait(80); };
  report.promise = (async () => {
    let audio, play, heistAudio, heistPlay;
    try {
      const dependency = async (url, symbol) => (await fetch(url).then(r => r.text())).match(new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*["']([^"']+)`))[1];
      const { SaveSystem: Save } = await import(await dependency('/src/game/scenes/ArenaScene.ts', 'SaveSystem'));
      const { ANOMALY_BY_ID } = await import('/src/game/anomalies/AnomalyRegistry.ts');
      await stop(); check(Save.createProfile('Pickup check ' + Date.now().toString().slice(-6)).ok, 'isolated profile');
      Save.setSettings({ masterVolume: 0, contextualTutorials: false });
      Save.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; });
      game.scene.start('arena', { baseSeed: 550055, round: 1, protocol: 'normal', objectiveMode: 'open', equippedMods: [], modsEarned: [] });
      const arena = game.scene.keys.arena;
      await until(() => arena.player?.active && arena.layout, 'Arena');
      arena.player.invulnUntil = Infinity; arena.playerInput.adoptDevice('gamepad'); arena.pointerLockInitialGate = false;
      await until(() => arena.roundRuntime.phase === 'active', 'active Arena');
      const sounds = []; audio = arena.audio; play = audio.playSfx; audio.playSfx = key => sounds.push(key);
      for (const p of arena.pickups) p.sprite.destroy(); arena.pickups.length = 0;
      const energy = arena.createPickupSprite('energy', arena.player.x, arena.player.y, 0x00ffff);
      arena.pickups.push({ type: 'energy', sprite: energy, source: 'enemy', expiresAt: Infinity });
      arena.player.energy = arena.player.energyStats.max; arena.updatePickups(arena.time.now, 0);
      check(arena.pickups.length === 1, 'Arena full-energy pickup remains available');
      arena.player.energy = arena.player.energyStats.max * .8; arena.updatePickups(arena.time.now, 0);
      check(arena.pickups.length === 0 && sounds.at(-1) === 'energyPickup', 'Arena collects energy at the existing threshold');
      Save.addFluxCores(60); arena.refreshHudWallet(); check(arena.spendAnomalyEntryCost(60), 'normal paid HEIST entry');
      arena.beginAnomalyTransition({ anomalyId: 'heist', definition: ANOMALY_BY_ID.get('heist'), sessionId: 'pickup-parity-' + Date.now(), cost: 60, portal: { x: arena.player.x, y: arena.player.y } });
      await until(() => game.scene.isActive('anomaly-heist'), 'HEIST');
      const heist = game.scene.keys['anomaly-heist']; heist.player.invulnUntil = Infinity;
      // Headless pickup fixture only: no physical pointer-lock gesture is available.
      heist.session.inputBridge = undefined;
      heist.inputController.adoptDevice('gamepad');
      await until(() => !heist.inputCapturePaused && !heist.manuallyPaused, 'live HEIST input');
      heistAudio = heist.audio; heistPlay = heistAudio.play; const specialSounds = [];
      heistAudio.play = key => specialSounds.push(key);
      for (const p of heist.pickups) p.root.destroy(); heist.pickups.length = 0;
      const root = heist.createGameplayPickup('energy', heist.player.x, heist.player.y);
      heist.pickups.push({ kind: 'energy', root, source: 'enemy', expiresAt: Infinity });
      heist.player.energy = heist.player.energyStats.max; heist.updatePickups(heist.time.now, 0);
      check(heist.pickups.length === 1, 'HEIST now preserves a full-energy pickup');
      heist.player.energy = heist.player.energyStats.max * .8; heist.updatePickups(heist.time.now, 0);
      check(heist.pickups.length === 0 && sounds.at(-1) === 'energyPickup', 'HEIST uses Arena energy collection threshold and sound');
      const originalField = heist.modRuntime.magneticServiceField;
      try {
        heist.modRuntime.magneticServiceField = () => ({ attractionRadius: 300, pullSpeed: 100 });
        const health = heist.createGameplayPickup('health', heist.player.x + 100, heist.player.y);
        heist.pickups.push({ kind: 'health', root: health, source: 'enemy', expiresAt: Infinity });
        const before = health.x; heist.updatePickups(heist.time.now, .1);
        check(Math.abs(health.x - (before - 10)) < .001, 'HEIST ordinary pickups receive magnetic attraction');
        health.destroy(); heist.pickups.length = 0;
      } finally { heist.modRuntime.magneticServiceField = originalField; }
      const walletBefore = Save.get().credits;
      heist.phase = 'looting'; heist.damageContainer(heist.containers[0], 1e9);
      heist.dropEnvironmentSmashableLoot('health', heist.player.x + 100, heist.player.y);
      check(!specialSounds.includes('loot-spawn') && specialSounds.includes('loot-container-break'), 'HEIST drop sound removed; container break sound retained');
      const loot = heist.lootPickups, origin = heist.containers[0].root;
      const initialCredits = loot.pickups.filter(p => p.reward.kind === 'credits').reduce((sum,p) => sum+p.reward.amount,0);
      for (let i = 0; i < 100; i++) loot.spawn(origin.x, origin.y, { kind: 'credits', amount: 1000 }, 9000+i);
      check(loot.pickups.filter(p => p.reward.kind === 'credits').length <= 12, 'currency visual capacity remains bounded');
      check(loot.pickups.filter(p => p.reward.kind === 'credits').reduce((sum,p) => sum+p.reward.amount,0) === initialCredits + 100000, 'overflow merges preserve all currency');
      await wait(1200);
      check(loot.pickups.every(p => p.settled), 'shared Arena launch finishes for HEIST loot');
      const floating = loot.pickups.find(p => p.reward.kind === 'credits');
      const beforeX = floating.root.x, beforeY = floating.root.y;
      await wait(120);
      report.motion = { beforeX, beforeY, x: floating.root.x, y: floating.root.y,
        state: heist.pickupMotion.get(floating.root), paused: heist.inputCapturePaused, roots: heist.pickupMotionRoots.length };
      check(Math.hypot(floating.root.x-beforeX,floating.root.y-beforeY) > .01, 'landed HEIST currency uses Arena floating motion');
      const amount = loot.pickups.filter(p => p.reward.kind === 'credits').reduce((sum,p) => sum+p.reward.amount,0);
      const pendingBefore = heist.pendingLoot.credits;
      loot.update(heist.time.now, 0, heist.player.x, heist.player.y, 1e6, 0, 0, (reward,x,y) => heist.collectLoot(reward,x,y));
      check(heist.pendingLoot.credits - pendingBefore === amount, 'each physical Credit stack grants its exact provisional amount');
      check(loot.activeCount === 0 && loot.diagnostics().collecting === 0, 'collection retires immediately without a HEIST-only flight');
      check(sounds.includes('creditPickup'), 'physical currency uses Arena collection sound');
      check(Save.get().credits === walletBefore, 'collected HEIST loot is not banked before extraction');
      const capacity = loot.diagnostics().currencyCapacity;
      loot.spawn(origin.x, origin.y, { kind: 'credits', amount: 1000 }, 10001);
      check(loot.diagnostics().currencyCapacity === capacity, 'currency roots are reused after collection');
      heist.returnToArena(false, 'extraction-timeout');
      await until(() => game.scene.isActive('arena') && !game.scene.isActive('anomaly-heist'), 'Arena return');
      check(Save.get().credits === walletBefore, 'failed extraction discards provisional loot');
      check(heist.children.list.length === 0 && heist.pickupMotionRoots.length === 0 && heist.lootPickups.diagnostics().currencyCapacity === 0, 'HEIST pickup roots, scratch references and pools retire');
    } catch (e) { report.errors.push(String(e.stack ?? e)); }
    finally { if (audio) audio.playSfx = play; if (heistAudio) heistAudio.play = heistPlay; await stop(); report.running = false; }
  })(); return 'Short pickup parity check started';
})();
