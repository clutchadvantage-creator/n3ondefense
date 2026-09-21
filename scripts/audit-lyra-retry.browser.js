(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], screenshots: [] };
  const live = p => performance.getEntriesByType('resource').findLast(e => e.name.includes(p + '?t='))?.name ?? p;
  const check = (ok, label, detail) => { report.cases.push({ ok: !!ok, label, detail }); if (!ok) throw Error(label); };
  const until = async (fn, label) => { const start = performance.now(); while (!fn()) { if (performance.now() - start > 25000) throw Error(label); await wait(40); } };
  const all = scene => { const out = []; const visit = o => { out.push(o); o.list?.forEach(visit); }; scene.children.list.forEach(visit); return out; };
  report.promise = (async () => {
    try {
      await until(() => game.scene.keys.arena && !game.scene.keys.boot.sys.isActive(), 'Boot complete'); await wait(150);
      const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
      const { LyraComms } = await import(live('/src/game/lyra/LyraComms.ts'));
      const { AudioManager } = await import(live('/src/game/systems/AudioManager.ts'));
      check(SaveSystem.createProfile('Lyra Retry ' + Date.now().toString().slice(-5)).ok, 'Isolated retry profile');
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; });
      SaveSystem.setSettings({ lyra: { ...SaveSystem.get().settings.lyra, voice: true, subtitles: true } });
      for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key);
      game.scene.start('arena', { baseSeed: 550055, round: 1, objectiveMode: 'open', protocol: 'normal', runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null });
      const arena = game.scene.getScene('arena'), comms = LyraComms.get();
      const once = { id: 'fixture.once-per-run', text: 'Run communication check.', mode: 'SYSTEM', priority: 70, once: 'run', cooldownMs: 0 };
      const counts = () => ({ poststep: game.events.listenerCount('poststep'), shutdown: arena.events.listenerCount('shutdown'), pause: arena.events.listenerCount('pause'), roots: document.querySelectorAll('.lyra-comms').length });
      let baseline;
      for (let cycle = 0; cycle < 3; cycle++) {
        await until(() => arena.sys.isActive() && arena.roundRuntime?.phase === 'active', 'Arena active');
        arena.player.invulnUntil = Infinity; arena.pointerLockInitialGate = false; arena.playerInput.adoptDevice('gamepad');
        if (arena.state.state === 'Paused') arena.restoreGameplayAfterPause();
        arena.player.hp = arena.player.stats.maxHealth; await wait(300);
        comms.queue.resetCooldowns();
        check(comms.queue.submit(once), 'Run-once message accepted in attempt ' + cycle); comms.cancel();
        check(!comms.queue.submit(once), 'Run-once message suppressed inside attempt ' + cycle);
        const current = counts(); if (!baseline) baseline = current;
        check(JSON.stringify(current) === JSON.stringify(baseline) && current.roots === 1, 'Retry retains one comms owner and stable scene listeners ' + cycle, current);
        if (cycle === 2) break;
        arena.player.hp = 1; comms.queue.resetCooldowns();
        await until(() => comms.diagnostics().active === 'warning.health' && comms.diagnostics().speaking, 'Real warning playback');
        arena.player.hp = 0; arena.triggerDefeat('playerDead');
        await until(() => game.scene.keys.results?.sys.isActive(), 'Actual defeat debrief');
        check(comms.diagnostics().active === null && comms.diagnostics().pending.length === 0 && AudioManager.get().lyraDuck === 0, 'Defeat cancels voice, queue, and ducking ' + cycle);
        check(document.querySelectorAll('.tutorial-overlay').length === 0, 'Defeat retires tutorial owner ' + cycle);
        const result = game.scene.keys.results;
        const replay = all(result).find(o => o.text === 'REPLAY LOCAL'); check(!!replay, 'Actual replay action available ' + cycle);
        replay.parentContainer.getByName('button-hit').emit('pointerdown');
      }
      game.scene.stop('arena'); await wait(150);
      check(comms.diagnostics().active === null && AudioManager.get().lyraDuck === 0, 'Final retirement leaves no speech or ducking');
      report.completedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally { report.running = false; }
  })();
  return { started: true };
})();
