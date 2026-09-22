(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], layouts: [], spawns: 0 };
  const check = (ok, label, detail) => { report.cases.push({ ok: !!ok, label, detail }); if (!ok) throw Error(label + ': ' + JSON.stringify(detail)); };
  report.promise = (async () => {
    const { ArenaGenerator } = await import('/src/game/systems/ArenaGenerator.ts');
    try {
      const { ARENA_ARCHETYPES } = await import('/src/game/config/arenaGeneration.ts');
      const { ArenaValidator } = await import('/src/game/systems/ArenaValidator.ts');
      const { clearOfBombsites } = await import('/src/game/arena/EnemySpawnSafety.ts');
      const { SaveSystem } = await import('/src/game/systems/SaveSystem.ts');
      check(SaveSystem.createProfile('Spawn Safety ' + Date.now().toString().slice(-6)).ok, 'Isolated test profile');
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; p.arenaCompleted = true; });
      for (const s of game.scene.getScenes(false)) game.scene.stop(s.scene.key);
      for (const type of ARENA_ARCHETYPES) for (const round of [1, 30, 68, 137, 148]) for (let seed = 1; seed <= 10; seed++) {
        ArenaGenerator.resetHistory(); ArenaGenerator.forceArenaType(type);
        const layout = ArenaGenerator.generate(seed * 7919, type, round, 5);
        const validation = ArenaValidator.validateDetailed(layout, 2400, 1600);
        const minimum = Math.min(...layout.enemySpawns.flatMap(p => layout.bombSites.map(s => Math.hypot(p.x - s.x, p.y - s.y))));
        check(validation.valid && layout.enemySpawns.length > 0 && minimum >= 320, 'Generated entrance safety', { type, accepted: layout.template, round, seed, minimum, failures: validation.failures });
        report.layouts.push({ type, accepted: layout.template, round, seed, minimum, entrances: layout.enemySpawns.length });
        if (seed === 10) await wait(0);
      }
      for (const type of ARENA_ARCHETYPES) {
        ArenaGenerator.resetHistory(); ArenaGenerator.forceArenaType(type);
        game.scene.start('arena', { baseSeed: 550055, round: 68, objectiveMode: 'open', protocol: 'normal', runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null });
        await wait(400);
        const scene = game.scene.keys.arena; game.scene.pause('arena');
        check(!!scene.player && !!scene.layout, 'Live arena initialized', type);
        for (const enemy of [...scene.enemies]) scene.removeArcadeEnemy(enemy);
        const kinds = ['grunt', 'shooter', 'defuser', 'tank', 'disruptor', 'star', 'drone'];
        for (const site of scene.layout.bombSites) for (const kind of kinds) {
          for (const requested of [undefined, site, { x: site.x + 100, y: site.y }]) {
            const enemy = scene.spawnEnemy(kind, true, requested);
            check(enemy && clearOfBombsites(enemy, scene.layout.bombSites), 'Actual spawn rejects unsafe requests', { type, kind, requested, actual: enemy && { x: enemy.x, y: enemy.y } });
            report.spawns++; scene.removeArcadeEnemy(enemy);
          }
        }
        const entrances = scene.layout.enemySpawns, drone = scene.findDroneEntrance;
        scene.layout.enemySpawns = [scene.layout.bombSites[0]];
        scene.findDroneEntrance = () => scene.layout.bombSites[0];
        const count = scene.enemies.length;
        for (const kind of kinds) check(scene.spawnEnemy(kind, true, scene.layout.bombSites[0]) === null, 'Exhausted unsafe entrances fail closed', { type, kind });
        check(scene.enemies.length === count, 'Rejected requests create no enemies', type);
        scene.layout.enemySpawns = entrances; scene.findDroneEntrance = drone;
        game.scene.stop('arena'); await wait(50);
      }
    } catch (e) { report.errors.push(String(e.stack ?? e)); }
    finally { ArenaGenerator.forceArenaType(null); ArenaGenerator.resetHistory(); game.scene.stop('arena'); report.running = false; }
  })();
  return { started: true };
})();
