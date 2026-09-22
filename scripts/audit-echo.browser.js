(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], screenshots: [] };
  const live = p => performance.getEntriesByType('resource').findLast(e => e.name.includes(p + '?t='))?.name ?? p;
  const check = (ok, label, detail) => { report.cases.push({ ok: !!ok, label, detail }); if (!ok) throw Error(label + ' ' + JSON.stringify(detail)); };
  const until = async (fn, label) => { const start = performance.now(); while (!fn()) { if (performance.now() - start > 25000) throw Error(label); await wait(40); } };
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'AltLeft' ? 'Alt' : code.replace('Key', ''), bubbles: true, cancelable: true }));
  report.promise = (async () => {
    try {
      await until(() => game.scene.keys.arena && !game.scene.keys.boot.sys.isActive(), 'Boot complete'); await wait(150);
      const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
      const { stampEchoDamage } = await import(live('/src/game/echo/EchoRules.ts'));
      const { Boss } = await import(live('/src/game/bosses/Boss.ts'));
      check(SaveSystem.createProfile('Echo Audit ' + Date.now().toString().slice(-6)).ok, 'Isolated Echo test profile');
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; p.arenaCompleted = true; });
      for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key);
      game.scene.start('arena', { baseSeed: 550055, round: 68, objectiveMode: 'open', protocol: 'normal', runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null });
      const arena = game.scene.keys.arena;
      await until(() => arena.sys.isActive() && arena.roundRuntime?.phase === 'active', 'Arena active');
      arena.player.invulnUntil = Infinity; arena.pointerLockInitialGate = false; arena.playerInput.adoptDevice('gamepad');
      if (arena.state.state === 'Paused') arena.restoreGameplayAfterPause();
      arena.tutorialDirector?.destroy(); arena.tutorialDirector = null;
      await wait(150);
      key('AltRight', true); await wait(100); check(!arena.echo.timeline.recording, 'Right Alt does not activate default Echo'); key('AltRight', false);
      key('AltLeft', true); await until(() => arena.echo.timeline.recording, 'Left Alt records'); key('AltLeft', false);
      const start = { x: arena.player.x, y: arena.player.y };
      await wait(1000); check(arena.echo.timeline.recording, 'Recording continues after first tap is released'); key('AltLeft', true); await wait(30); key('AltLeft', false);
      await until(() => arena.echo.timeline.replaying, 'Second press snaps and replays');
      check(arena.echo.timeline.durationMs >= 900 && arena.echo.timeline.durationMs < 1250, 'Two real presses record one second', arena.echo.timeline.durationMs);
      check(Math.hypot(arena.player.x - start.x, arena.player.y - start.y) < 1, 'Second press returns to origin');
      check(arena.echo.timeline.cooldownMs > 11500, 'Live cooldown starts at second press');
      await until(() => !arena.echo.timeline.replaying, 'One-second replay completes');
      await wait(200); check(!arena.echo.root.visible && arena.echo.timeline.shotCount === 0, 'Hologram and recording clear after exit');
      arena.scene.pause();
      async function exercise(scene, label) {
        report.current = label;
        const echo = scene.echo, player = scene.player, input = scene.playerInput ?? scene.inputController;
        const originalHeld = input.held, fire = scene === arena ? now => scene.updatePlayerShooting(now) : now => scene.updatePlayerCombat(now);
        const safe = { x: player.x, y: player.y };
        const step = (dt, held, pressed = false, dx = 0, dy = 0) => {
          player.body.reset(safe.x + dx, safe.y + dy);
          echo.update(dt, { held: () => held, pressed: () => pressed, prompt: () => 'L ALT' }, scene.time.now);
        };
        const finish = (dt, dx = 0, dy = 0) => { step(dt, false, false, dx, dy); step(0, true, true, dx, dy); };
        const clearProjectiles = () => {
          if (scene === arena) { for (const p of scene.projectiles) scene.retireProjectile(p); scene.projectiles.length = 0; }
          else for (let i = scene.projectiles.length - 1; i >= 0; i--) scene.retireProjectile(scene.projectiles[i], i);
        };
        echo.reset(); step(0, false); step(0, true, true);
        check(echo.timeline.recording, label + ' valid origin starts recording');
        const now = scene.time.now;
        input.held = action => action === 'fire';
        const modes = ['scattershot', 'grenade', 'normal'];
        const recorded = [];
        for (let i = 0; i < modes.length; i++) {
          const mode = modes[i]; step(400, true, false, i * 4, 0);
          scene.temporaryAmmo.reset(); if (mode !== 'normal') scene.temporaryAmmo.activate(mode, now, false);
          player.energy = 1000; player.heat = 0; scene.lastPlayerShotMs = -Infinity; scene.nextPlayerShotAt = 0;
          fire(now); recorded.push({ ...echo.timeline.shots[echo.timeline.shotCount - 1] });
          const expected = mode === 'scattershot' ? 7 : 1;
          check(scene.projectiles.filter(p => !p.echo && (p.from === 'player' || p.owner === 'player')).length === expected, label + ' live ' + mode + ' count');
          clearProjectiles();
        }
        input.held = originalHeld; scene.temporaryAmmo.reset();
        const energy = player.energy, heat = player.heat;
        const deployables = [scene.mines.length, scene.fences.length, scene.turrets.length];
        finish(400, 12, 0);
        check(echo.timeline.replaying && echo.timeline.cooldownMs === 12000, label + ' snap starts replay and full cooldown');
        check(Math.hypot(player.x - safe.x, player.y - safe.y) < .01, label + ' body reset at origin');
        for (let i = 0; i < modes.length; i++) {
          echo.update(400, { held: () => false, pressed: () => false, prompt: () => 'L ALT' }, now);
          const shots = scene.projectiles.filter(p => p.echo), mode = modes[i];
          check(shots.length === (mode === 'scattershot' ? 7 : 1), label + ' Echo ' + mode + ' projectile count', shots.length);
          check(shots.every(p => p.ammoMode === mode && Math.abs(p.damage - p.echo.equivalentDamage * .5) < .00001), label + ' shot-time ammo and 50% damage ' + mode);
          check(shots.every(p => Object.isFrozen(p.echo)), label + ' immutable attack provenance ' + mode);
          if (mode === 'grenade') check(shots[0].grenadeBouncesRemaining >= 2 && shots[0].grenadeFuseAt > now, label + ' grenade bounce and fuse configured');
          clearProjectiles();
        }
        check(player.energy === energy && player.heat === heat && scene.temporaryAmmo.activeMode(now) === 'normal', label + ' replay leaves energy, heat and expired ammo untouched');
        check(JSON.stringify(deployables) === JSON.stringify([scene.mines.length, scene.fences.length, scene.turrets.length]), label + ' no deployable duplication');
        check(echo.ghosts.every(g => g.texture.key === player.texture.key && g.frame.name === player.frame.name), label + ' hologram matches equipped operative frame');
        scene.updateHud(now);
        report.screenshots.push({ label: label + '-echo-hud', png: await new Promise(r => game.renderer.snapshot(img => r(img.src))) });
        echo.update(500, { held: () => false, pressed: () => false, prompt: () => 'L ALT' }, now);
        const listeners = scene.events.listenerCount('shutdown'), roots = scene.children.list.length;
        const sampleReserve = echo.timeline.samples, weaponReserve = echo.timeline.shots;
        for (let i = 0; i < 100; i++) {
          echo.reset(); step(0, false); step(0, true, true); finish(100); step(300, false);
        }
        check(scene.children.list.length === roots && scene.events.listenerCount('shutdown') === listeners, label + ' 100 cycles retain stable roots/listeners');
        check(echo.timeline.samples === sampleReserve && echo.timeline.shots === weaponReserve, label + ' 100 cycles reuse bounded buffers');
        echo.reset(); step(0, false); step(0, true, true); step(200, true);
        const elapsed = echo.timeline.elapsedMs; await wait(200);
        check(echo.timeline.elapsedMs === elapsed, label + ' paused scene does not advance recording');
        const obstacle = scene.add.rectangle(safe.x, safe.y, 30, 30, 0xffffff, 0);
        scene.physics.add.existing(obstacle, true);
        finish(100, 70, 0);
        check(echo.timeline.replaying && echo.valid(player.x, player.y) && Math.hypot(player.x - safe.x, player.y - safe.y) > 25,
          label + ' new collision at origin selects nearby full-body safe return', { x: player.x - safe.x, y: player.y - safe.y });
        obstacle.destroy(); echo.reset(); player.body.reset(safe.x, safe.y);
        const bounds = scene.physics.world.bounds;
        check(!echo.valid(bounds.left + 1, safe.y) && !echo.valid(bounds.right - 1, safe.y), label + ' bounds validate full body');
        const stamp = stampEchoDamage(100, .95);
        let enemy;
        if (scene === arena) enemy = scene.spawnEnemy('shooter', false, { x: safe.x + 60, y: safe.y });
        else { scene.spawnEnemy('shooter', safe.x + 60, safe.y, false); enemy = scene.enemies.at(-1); }
        enemy.hp = 1000;
        check(enemy.takeDamage(9999, 'echo', stamp) === 70 && enemy.hp === 930, label + ' actual enemy health boundary caps future modifiers at 70%');
        enemy.hp = 10; check(enemy.takeDamage(50, 'echo', stamp) === 10 && enemy.takeDamage(50, 'echo', stamp) === 0, label + ' dead enemy cannot receive a duplicate lethal hit');
        if (scene === arena) {
          const before = scene.roundCredits; scene.updateEnemies(now, 0); const awarded = scene.roundCredits;
          scene.updateEnemies(now, 0); check(awarded > before && scene.roundCredits === awarded, label + ' Echo kill awards exactly once through enemy retirement');
        } else scene.updateEnemies(now, 0);
        clearProjectiles(); echo.reset();
        const spawnTarget = (dx, dy = 0) => {
          let target;
          if (scene === arena) target = scene.spawnEnemy('shooter', false, { x: safe.x + dx, y: safe.y + dy });
          else { scene.spawnEnemy('shooter', safe.x + dx, safe.y + dy, false); target = scene.enemies.at(-1); }
          target.hp = 1000; return target;
        };
        for (const mode of ['normal', 'scattershot', 'grenade']) {
          const target = spawnTarget(60);
          (scene.enemySpatialGrid ?? scene.enemySeparationGrid).rebuild(scene.enemies);
          const snapshot = { ...recorded.find(s => s.mode === mode), damage: 100 };
          scene.replayEchoShot(snapshot, 0, 0, .5);
          const projectiles = scene.projectiles.filter(p => p.echo);
          if (mode === 'grenade') {
            const splash = spawnTarget(75); (scene.enemySpatialGrid ?? scene.enemySeparationGrid).rebuild(scene.enemies);
            const p = projectiles[0], bounce = p.grenadeBouncesRemaining;
            scene.consumeGrenadeBounce(p, now);
            check(p.grenadeBouncesRemaining === bounce - 1, label + ' actual Echo grenade bounce uses existing flight');
            p.sprite.setPosition(target.x, target.y);
            if (scene === arena) scene.detonateGrenadeRound(p, target.x, target.y, target);
            else scene.detonateGrenade(p, target);
            check(Math.abs(target.hp - 950) < .00001 && Math.abs(splash.hp - 982.5) < .00001, label + ' actual grenade direct/splash damage remains 50%');
            splash.hp = 0;
          } else {
            for (const p of projectiles) { p.sprite.setPosition(target.x, target.y); p.previousX = target.x; p.previousY = target.y; p.sprite.setVelocity(0, 0); }
            if (scene === arena) scene.updateProjectiles(0); else scene.updateProjectiles(now, 0);
            check(Math.abs(target.hp - (mode === 'normal' ? 950 : 895)) < .00001, label + ' actual ' + mode + ' collision damages enemy', target.hp);
            check(target.lastDamageSource === 'echo', label + ' collision retains explicit Echo source');
          }
          target.hp = 0; clearProjectiles(); scene.updateEnemies(now, 0);
        }
        // Premium projectile art has a normalized collision footprint. Spectral
        // tint must not replace that footprint with the wider artwork bounds.
        const oldPalette = scene.projectileNativePalette, oldWidth = scene.projectileWidth, oldHeight = scene.projectileHeight;
        scene.projectileNativePalette = true; scene.projectileWidth = 22; scene.projectileHeight = 6;
        echo.reset(); step(0, false); step(0, true, true); scene.temporaryAmmo.reset();
        input.held = action => action === 'fire'; player.energy = 1000; player.heat = 0; scene.lastPlayerShotMs = -Infinity; scene.nextPlayerShotAt = 0;
        fire(now); input.held = originalHeld;
        const liveProjectile = scene.projectiles.at(-1);
        const footprint = [liveProjectile.sprite.body.sourceWidth, liveProjectile.sprite.body.sourceHeight];
        clearProjectiles(); finish(100);
        const replayProjectile = scene.projectiles.find(p => p.echo);
        check(replayProjectile && replayProjectile.nativePalette && footprint[0] === replayProjectile.sprite.body.sourceWidth
          && footprint[1] === replayProjectile.sprite.body.sourceHeight, label + ' premium projectile collision footprint survives spectral tint');
        scene.projectileNativePalette = oldPalette; scene.projectileWidth = oldWidth; scene.projectileHeight = oldHeight;
        clearProjectiles(); echo.reset();
        return { roots, listeners };
      }
      await exercise(arena, 'Arena round 68');
      const boss = { hp: 1000, defeated: false, scene: { time: { delayedCall() {} } }, setTintFill() {}, onDamaged() {} };
      check(Boss.prototype.takeDamage.call(boss, 9999, 'echo', stampEchoDamage(100, .95)) === 70 && boss.hp === 930, 'Actual boss damage method enforces 70% final cap');
      arena.echo.timeline.advance(0, false, false, arena.player.x, arena.player.y, 0, false);
      arena.echo.timeline.advance(0, true, true, arena.player.x, arena.player.y, 0, false);
      arena.scene.resume();
      arena.beginAnomalyTransition({ anomalyId: 'heist', sessionId: 'echo-audit-' + Date.now(), cost: 35, portal: { x: arena.player.x, y: arena.player.y } });
      await until(() => game.scene.keys['anomaly-heist']?.echo, 'HEIST creates Echo owner');
      check(!arena.echo.timeline.recording && !arena.echo.timeline.replaying && !arena.projectiles.some(p => p.echo), 'Anomaly entry clears Arena Echo and projectiles');
      const heist = game.scene.keys['anomaly-heist']; heist.player.invulnUntil = Infinity; heist.scene.pause();
      await exercise(heist, 'HEIST');
      heist.echo.timeline.advance(0, false, false, heist.player.x, heist.player.y, 0, false);
      heist.echo.timeline.advance(0, true, true, heist.player.x, heist.player.y, 0, false);
      heist.failHeist('player-dead'); check(!heist.echo.timeline.recording && !heist.echo.timeline.replaying, 'HEIST failure immediately cancels Echo');
      const oldHeistEcho = heist.echo; game.scene.stop('anomaly-heist');
      await wait(150); check(oldHeistEcho.destroyed && !oldHeistEcho.root.scene, 'HEIST shutdown destroys presentation owner');
      arena.scene.wake(); arena.echo.timeline.advance(0, false, false, arena.player.x, arena.player.y, 0, false);
      arena.echo.timeline.advance(0, true, true, arena.player.x, arena.player.y, 0, false);
      arena.triggerDefeat('playerDead'); check(!arena.echo.timeline.recording && !arena.echo.timeline.replaying, 'Arena death immediately cancels Echo');
      const oldEcho = arena.echo; game.scene.stop('arena'); await wait(150);
      check(oldEcho.destroyed && !oldEcho.root.scene && !oldEcho.trail.scene, 'Arena shutdown destroys presentation owner');
      report.completedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally { report.running = false; }
  })();
  return { started: true };
})();
