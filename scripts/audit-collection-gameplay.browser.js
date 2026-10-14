(() => {
  const report = globalThis.__n3onLayoutAudit = { running: true, current: 'Arena floor and saving', checks: [], cases: [], errors: [], samples: [] };
  const check = (ok, name, detail) => { report.checks.push({ pass: !!ok, name, detail }); if (!ok) throw Error(name + ': ' + JSON.stringify(detail)); };
  report.promise = (async () => {
    const { kineticAuditArena } = await import('/scripts/kinetic-audit-setup.js');
    const { RELICS } = await import('/src/game/collection/CollectionCatalog.ts');
    const { createCollectionState } = await import('/src/game/collection/CollectionProgress.ts');
    let setup = await kineticAuditArena();
    let { a, game, S, wait, until } = setup;
    const saveSource = await fetch(setup.dep('SaveSystem')).then(r => r.text());
    const storeDep = saveSource.match(/import\s*\{[^}]*\bPlayerProfileStore\b[^}]*\}\s*from\s*['"]([^'"]+)/)[1];
    const { PlayerProfileStore: P } = await new Function('path', 'return import(path)')(storeDep);
    check(P.getActiveSave().collection === S.getCollection(), 'same save singleton');
    const f = a.dynamicFloor, drops = a.relicPickups;
    check(f.startEvent(), 'floor event available');
    const panel = f.panels.find(p => p.phase === 'warning');
    const gx = panel.x + panel.w / 2, gy = panel.y + panel.h / 2;
    drops.spawn('core-housing', gx, gy); const rider = drops.floorActors[0];
    for (let i = 0; i < 220; i++) a.updateDynamicFloor(20);
    check(Math.abs(rider.root.x - gx - panel.offset) < 1, 'fragment rides moving cassette', { x: rider.root.x, gx, offset: panel.offset });
    for (let i = 0; i < 80; i++) a.updateDynamicFloor(20);
    check(panel.phase === 'open', 'lava exposed');
    drops.spawn('core-reactor', gx, gy); const falling = drops.floorActors.find(p => p.id === 'core-reactor');
    a.updateDynamicFloor(20);
    check(a.floorFalling(falling), 'fragment uses existing lava fall driver');
    for (let i = 0; i < 35; i++) a.updateDynamicFloor(20);
    drops.update(.1, gx, gy, 100, undefined, false);
    check(!drops.floorActors.some(p => p.id === 'core-reactor') && !S.getCollection().fragments.includes('core-reactor'), 'lost fragment is removed without grant');
    drops.destroy();
    drops.spawn('cipher-crown', a.player.x, a.player.y);
    const saveMethod = P.save;
    P.save = persistent => persistent ? false : saveMethod.call(P);
    try { for (let i = 0; i < 3; i++) drops.update(.1, a.player.x, a.player.y, 90); }
    finally { P.save = saveMethod; }
    check(!S.getCollection().fragments.length && !S.getCollection().pending.length && drops.floorActors.length === 1, 'failed durable write rolls ownership back and retains physical pickup');
    for (let i = 0; i < 25; i++) drops.update(.1, a.player.x, a.player.y, 90);
    check(S.getCollection().fragments.includes('cipher-crown') && !drops.floorActors.length, 'durable pickup retries successfully');
    const before = S.getCollection().progress.flawless;
    a.player.invulnUntil = 0; a.player.takeDamage(1, true); a.completeRound();
    check(S.getCollection().progress.flawless === before, 'damaged completed round does not award flawless');
    report.cases.push({ name: 'floor, failed save, flawless', passed: true });
    for (const id of ['heist', 'skybreach']) {
      report.current = id;
      setup = await kineticAuditArena(); ({ a, game, S, wait, until } = setup);
      a.player.invulnUntil = Infinity; game.scene.resume('arena'); a.pointerLock.hidePrompt(); await wait(180);
      // Seed run-held Flux; menu wallet notifications are intentionally suppressed while our fixture pauses Arena.
      a.roundFluxCores = 1000;
      const controller = a.anomalyController;
      check(controller.force(id), id + ' opportunity'); controller.setForcedCost(35); controller.forceCharge();
      await until(() => controller.visual?.readyForInteraction, id + ' portal');
      a.player.body.reset(controller.visual.x, controller.visual.y);
      check(controller.tryEnter(), id + ' confirmed entry', { state: controller.state, eligible: controller.context.isGameplayEligible(), flux: controller.context.availableFluxCores(), savedFlux: S.get().fluxCores, last: controller.context.lastStartedEvent?.(), profile: S.getActiveProfileSummary().id, pProfile: P.getActiveSave().profile.id }); controller.launchActive();
      await until(() => game.scene.isActive('anomaly-' + id) && game.scene.keys['anomaly-' + id].inputController, id + ' scene');
      const scene = game.scene.keys['anomaly-' + id]; scene.session.inputBridge = undefined; scene.inputController.adoptDevice('gamepad');
      await wait(120); game.scene.pause('anomaly-' + id);
      check(S.getCollection().progress.portals === 1, id + ' entry counted once');
      const relics = scene.relicPickups;
      check(!!relics, id + ' installs shared fragment system');
      relics.chances.set('normalEnemy', 1); relics.chances.set('anomaly', 1); relics.chances.set('boss', 1);
      let enemy;
      if (id === 'skybreach') enemy = scene.spawnAircraft('interceptor', scene.player.x, scene.player.y - 100);
      else { scene.spawnEnemy('grunt', scene.player.x + 100, scene.player.y, false); enemy = scene.enemies.at(-1); }
      enemy.hp = 0; const index = scene.enemies.indexOf(enemy);
      scene.removeEnemy(enemy, index);
      check(relics.floorActors.length === 1, id + ' real enemy reward hook spawns fragment');
      const pickup = relics.floorActors[0];
      for (let i = 0; i < 3; i++) relics.update(.1, pickup.root.x, pickup.root.y, 80);
      check(S.getCollection().fragments.length === 1 && S.getCollection().pending.length === 1, id + ' immediate ownership despite provisional anomaly haul');
      const originalAim = scene.getAimPoint; scene.getAimPoint = () => ({ x: scene.player.x + 30, y: scene.player.y });
      scene.player.energy = scene.player.energyStats.max; scene.abilityState.cooldownUntil.turret = 0;
      const previousTurrets = S.getCollection().progress.turrets;
      scene.placeTurret(scene.time.now); scene.getAimPoint = originalAim;
      check(S.getCollection().progress.turrets === previousTurrets + 1, id + ' successful turret placement counted');
      if (id === 'skybreach') {
        scene.dropBossLoot(); check(relics.floorActors.some(p => p.boss), 'Dreadnought haul includes elevated-chance fragment');
      } else {
        scene.phase = 'looting'; const container = scene.containers.find(c => !c.opened);
        scene.damageContainer(container, 1e9); check(relics.floorActors.length > 0, 'Heist security container uses anomaly fragment odds');
      }
      check(!scene.data.get('collection-reveal'), id + ' no combat celebration');
      scene.player.invulnUntil = 0; scene.damagePlayer(1);
      const revision = a.player.damageRevision;
      scene.returnToArena(false, 'player-dead');
      await until(() => !game.scene.isActive('anomaly-' + id) && game.scene.isActive('arena'), id + ' return');
      game.scene.pause('arena');
      check(S.getCollection().fragments.length === 1 && S.getCollection().pending.length === 1, id + ' failed extraction retains collected relic permanently');
      check(S.getCollection().progress.enemies >= 1, id + ' enemy counters flush at shutdown');
      check(a.player.damageRevision > revision, id + ' damage disqualifies enclosing round');
      report.cases.push({ name: id, fragments: S.getCollection().fragments.slice(), pending: S.getCollection().pending.length });
    }
    report.current = 'Supreme 26 bounded pickup workload';
    const { getCampaignProtocol } = await import('/src/game/progression/CampaignProgression.ts');
    setup = await kineticAuditArena({ round: 26, protocol: getCampaignProtocol('supreme', 26) });
    ({ a, game, S, wait, until } = setup);
    P.getActiveSave().collection = createCollectionState(); P.save();
    const timers = () => a.time._active.length + a.time._pendingInsertion.length;
    const beforeObjects = a.children.list.length, beforeBodies = a.physics.world.bodies.entries.length, beforeTimers = timers();
    for (const [i, fragment] of RELICS.flatMap(r => r.fragments).entries()) a.relicPickups.spawn(fragment.id, a.player.x + 160 + i * 30, a.player.y + 100);
    const addedDisplayRoots = a.children.list.length - beforeObjects;
    check(a.relicPickups.floorActors.length === 6, 'six-piece physical limit');
    check(a.physics.world.bodies.entries.length === beforeBodies && timers() === beforeTimers, 'pickups allocate no bodies or timers');
    const costs = []; for (let i = 0; i < 1000; i++) { const start = performance.now(); a.relicPickups.update(.016, -999, -999, 10); costs.push(performance.now() - start); }
    costs.sort((x,y) => x-y);
    a.player.invulnUntil = Infinity;
    const frames = [], originals = a.relicPickups.update.bind(a.relicPickups);
    const frame = (_time, dt) => { if (dt > 0) frames.push(dt); };
    for (const enabled of [false, true]) {
      a.relicPickups.update = enabled ? originals : () => {};
      frames.length = 0; game.events.on('step', frame); game.scene.resume('arena');
      await wait(4000); game.scene.pause('arena'); game.events.off('step', frame);
      const sorted = frames.slice().sort((x,y)=>x-y);
      report.samples.push({ enabled, frames: sorted.length, mean: sorted.reduce((x,y)=>x+y,0)/sorted.length, p95: sorted[Math.floor(sorted.length*.95)], max: sorted.at(-1) });
    }
    report.cases.push({ name: 'bounded workload', addedDisplayRoots, updateP95: costs[950], updateMax: costs.at(-1), renderer: setup.renderer });
    a.relicPickups.destroy(); check(!a.relicPickups.floorActors.length, 'pickup retirement releases all references');
    globalThis.__collectionGameplay = setup;
  })().catch(error => report.errors.push(error.stack ?? String(error))).finally(() => { report.running = false; });
  return 'Collection gameplay audit started';
})();
