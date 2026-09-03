// Evaluated inside an already-running DEV game by dev-cdp-eval.mjs. This uses
// actual Phaser scenes/resources; it is intentionally not a synthetic unit test.
(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const game = globalThis.n3onGame;
  const { SaveSystem } = await import('/src/game/systems/SaveSystem.ts');
  const { RoundManager } = await import('/src/game/systems/RoundManager.ts');
  const { selectBossArchetype } = await import('/src/game/config/bossBalance.ts');
  const { MOD_DEFINITIONS } = await import('/src/game/mods/definitions.ts');
  const { startArenaLoad } = await import('/src/game/utils/runFlow.ts');
  try { SaveSystem.get(); } catch { SaveSystem.createProfile('Lifecycle Benchmark'); }
  for (const scene of [...game.scene.getScenes(true)]) game.scene.stop(scene.scene.key);
  game.scene.start('arena', {
    baseSeed: 550055, round: 55, objectiveMode: 'open', protocol: 'supreme-leo',
    runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null,
    creditsSpentBeforeRun: 0, upgradeCompletionPercentage: 0,
    accountProgressionTier: 'endgame', runCreditsEarned: 0
  });
  await wait(700);
  let arena = game.scene.getScene('arena');
  arena.playerInput.adoptDevice('gamepad');
  arena.pointerLockInitialGate = false;
  arena.state.set('PrePlant');
  arena.physics.resume();
  const completed = arena.roundManager.currentDefinition();
  const bossCompletedSeed = Number.isFinite(globalThis.__n3onLifecycleBossSeed)
    ? globalThis.__n3onLifecycleBossSeed
    : completed.seed;
  const bossArchetype = selectBossArchetype(completed.round, bossCompletedSeed);
  const next = new RoundManager(arena.roundManager.seedBase, arena.roundManager.mode, completed.round + 1).currentDefinition();
  const payload = {
    baseSeed: arena.roundManager.seedBase, completedRound: completed.round,
    completedSeed: bossCompletedSeed, completedTemplate: completed.template,
    nextRound: next.round, nextSeed: next.seed, nextTemplate: next.template,
    objectiveMode: arena.roundManager.mode, creditsGained: 0, coreTokensGained: 0,
    plasmaChipsGained: 0, fluxCoresGained: 0, bossDefeated: null,
    protocol: arena.protocol, equippedMods: arena.modRuntime.snapshot(), modsEarned: [],
    runStartedAt: arena.runStartedAt, modFocus: null, contract: null,
    creditsSpentBeforeRun: 0, upgradeCompletionPercentage: 0,
    accountProgressionTier: 'endgame', runCreditsEarned: 0
  };
  arena.beginBossFight(payload, false);
  await wait(600);
  arena.playerInput.adoptDevice('gamepad');
  arena.startBossCombat();
  arena.player.invulnUntil = Number.POSITIVE_INFINITY;
  const boss = arena.bossEncounter.boss;
  const projectileBurst = Number.isFinite(globalThis.__n3onLifecycleProjectileBurst)
    ? Math.max(0, Math.floor(globalThis.__n3onLifecycleProjectileBurst))
    : 1_200;
  for (let index = 0; index < projectileBurst; index += 1) {
    const angle = index / projectileBurst * Math.PI * 2;
    arena.spawnBossProjectile({
      x: boss.x,
      y: boss.y,
      angle,
      speed: 36 + index % 18,
      damage: 1,
      color: index % 2 === 0 ? 0x55eeff : 0xff55dd,
      size: 7,
      attack: 'storm-super'
    });
  }
  await wait(300);

  const snap = (label) => {
    const activeArena = game.scene.getScene('arena');
    return {
      label, fps: game.loop.actualFps,
      activeScenes: game.scene.getScenes(true).map((scene) => scene.scene.key),
      lifecycle: activeArena.roundRuntime?.snapshot?.(),
      bossPhase: activeArena.bossFlowPhase,
      state: activeArena.state?.state,
      diagnostic: activeArena.captureRoundRuntimeDiagnostics?.(),
      heap: performance.memory?.usedJSHeapSize ?? null
    };
  };
  const checkpoints = [snap('boss-active')];
  globalThis.__staleGameplayCallback = 0;
  arena.scheduleRoundDelayedCall(240, () => { globalThis.__staleGameplayCallback += 1; });
  arena.completeBossFight();
  checkpoints.push(snap('boss-end-requested'));
  await wait(2_500);
  checkpoints.push(snap('boss-rewards'));

  // Make this a deterministic reproduction of the reported premium-reveal
  // route instead of depending on the ordinary boss Mod roll.
  for (const pickup of arena.modPickups) pickup.sprite.destroy();
  arena.modPickups.length = 0;
  const supremeDefinition = MOD_DEFINITIONS.find((definition) => definition.rarity === 'supreme');
  if (!supremeDefinition) throw new Error('No Supreme Mod definition is registered.');
  arena.spawnModPickup(supremeDefinition, 'boss', arena.player.x, arena.player.y);

  for (const pickup of arena.pickups) {
    pickup.collectibleAt = 0;
    pickup.sprite.setPosition(arena.player.x, arena.player.y);
  }
  for (const pickup of arena.modPickups) {
    pickup.collectibleAt = 0;
    pickup.sprite.setPosition(arena.player.x, arena.player.y);
  }
  arena.updatePickups(arena.time.now, 0);
  arena.updateModPickups(arena.time.now, 0);
  await wait(2_800);
  const reveal = game.scene.getScene('legendary-mod-reveal');
  let premiumRevealAcknowledged = false;
  if (reveal.scene.isActive() || reveal.scene.isPaused()) {
    premiumRevealAcknowledged = true;
    reveal.completeOwnerHandoff();
    reveal.scene.stop();
  }
  await wait(800);
  checkpoints.push(snap('reveal-dismissed'));
  arena.finishBossCollection();
  await wait(900);
  checkpoints.push(snap('round-finished'));

  const finished = game.scene.getScene('round-finished');
  const finishedPayload = game.registry.get('round-finished');
  const nextSession = {
    baseSeed: finishedPayload.baseSeed, round: finishedPayload.nextRound,
    objectiveMode: finishedPayload.objectiveMode,
    protocol: finishedPayload.nextProtocol ?? finishedPayload.protocol,
    runStartedAt: finishedPayload.runStartedAt,
    equippedMods: finishedPayload.equippedMods, modsEarned: finishedPayload.modsEarned,
    modFocus: finishedPayload.modFocus, contract: finishedPayload.contract,
    creditsSpentBeforeRun: finishedPayload.creditsSpentBeforeRun,
    upgradeCompletionPercentage: finishedPayload.upgradeCompletionPercentage,
    accountProgressionTier: finishedPayload.accountProgressionTier,
    runCreditsEarned: finishedPayload.runCreditsEarned
  };
  startArenaLoad(finished, { reason: 'continue-next-round', session: nextSession, message: 'Lifecycle benchmark' });
  await wait(1_700);
  arena = game.scene.getScene('arena');
  arena.playerInput.adoptDevice('gamepad');
  arena.pointerLockInitialGate = false;
  arena.state.set('PrePlant');
  arena.physics.resume();
  checkpoints.push(snap('next-initialized'));
  await wait(1_100);
  checkpoints.push(snap('next-active-1s'));
  await wait(4_100);
  checkpoints.push(snap('next-active-5s'));
  const boundaryHistory = globalThis.n3onRoundLifecycleReport?.() ?? [];
  return {
    bossArchetype,
    projectileBurst,
    premiumRevealAcknowledged,
    checkpoints: checkpoints.map((checkpoint) => ({
      label: checkpoint.label,
      fps: Number(checkpoint.fps.toFixed(2)),
      activeScenes: checkpoint.activeScenes,
      phase: checkpoint.lifecycle?.phase,
      generation: checkpoint.lifecycle?.generation,
      bossPhase: checkpoint.bossPhase,
      heapMB: checkpoint.heap === null ? null : Number((checkpoint.heap / 1_048_576).toFixed(1)),
      displayObjects: checkpoint.diagnostic?.displayObjects,
      updateListObjects: checkpoint.diagnostic?.updateListObjects,
      dynamicBodies: checkpoint.diagnostic?.dynamicBodies,
      activeDynamicBodies: checkpoint.diagnostic?.activeDynamicBodies,
      staticBodies: checkpoint.diagnostic?.staticBodies,
      pendingPhysicsBodies: checkpoint.diagnostic?.pendingPhysicsBodies,
      colliderCapacity: checkpoint.diagnostic?.colliderCapacity,
      timers: checkpoint.diagnostic?.timers,
      tweens: checkpoint.diagnostic?.tweens,
      activeProjectilePool: checkpoint.diagnostic?.activeProjectilePool,
      activeFxPool: checkpoint.diagnostic?.activeFxPool,
      activeTrails: checkpoint.diagnostic?.activeTrails,
      projectilePoolCapacity: checkpoint.diagnostic?.projectilePoolCapacity,
      fxPoolCapacity: checkpoint.diagnostic?.fxPoolCapacity,
      trailCapacity: checkpoint.diagnostic?.trailCapacity,
      roundAudioVoices: checkpoint.diagnostic?.roundAudioVoices,
      hudInstances: checkpoint.diagnostic?.hudInstances,
      premiumRevealScenes: checkpoint.diagnostic?.premiumRevealScenes,
      staleEncounterOwners: checkpoint.diagnostic?.staleEncounterOwners
    })),
    staleGameplayCallbackExecutions: globalThis.__staleGameplayCallback,
    boundaries: boundaryHistory.map((boundary) => ({
      from: boundary.from,
      generation: boundary.generation,
      reason: boundary.reason,
      after: {
        enemies: boundary.after.enemies,
        bosses: boundary.after.bossControllers,
        pickups: boundary.after.pickups,
        hazards: boundary.after.hazardControllers,
        staticBodies: boundary.after.staticBodies,
        pendingPhysicsBodies: boundary.after.pendingPhysicsBodies,
        colliderCapacity: boundary.after.colliderCapacity,
        timers: boundary.after.timers,
        tweens: boundary.after.tweens,
        activeProjectilePool: boundary.after.activeProjectilePool,
        activeFxPool: boundary.after.activeFxPool,
        activeTrails: boundary.after.activeTrails,
        hudInstances: boundary.after.hudInstances,
        staleEncounterOwners: boundary.after.staleEncounterOwners
      },
      frameAverageMs: Number(boundary.frameAverageMs.toFixed(2)),
      frameP99Ms: Number(boundary.frameP99Ms.toFixed(2))
    }))
  };
})()
