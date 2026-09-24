(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const live = p => performance.getEntriesByType('resource').findLast(e => e.name.includes(p + '?t='))?.name ?? p;
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], screenshots: [], audio: [] };
  const check = (ok, label, detail) => { report.cases.push({ ok: !!ok, label, detail }); if (!ok) throw Error(label); };
  const until = async (fn, label) => { const start = performance.now(); while (!fn()) { if (performance.now() - start > 25000) throw Error(label); await wait(30); } };
  const snapshot = async label => report.screenshots.push({ label, png: await new Promise(r => game.renderer.snapshot(img => r(img.src))) });
  const onError = e => report.errors.push(String(e.error?.stack ?? e.reason?.stack ?? e.message ?? e.reason));
  window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onError);
  report.promise = (async () => {
    try {
      const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
      const { TUTORIAL_SEQUENCES } = await import(live('/src/game/tutorial/TutorialRegistry.ts'));
      const { HudInformationSystem } = await import(live('/src/game/ui/HudInformationSystem.ts'));
      const { LYRA_RECORDINGS } = await import(live('/src/game/lyra/LyraRegistry.ts'));
      const { OBJECTIVE_CONFIG } = await import('/src/game/config/gameplay.ts');
      check(SaveSystem.createProfile('Mechanical ' + Date.now().toString().slice(-6)).ok, 'Isolated test profile');
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; p.completedSequences = TUTORIAL_SEQUENCES.map(s => s.id); });
      SaveSystem.setSettings({ ...SaveSystem.get().settings, lyra: { ...SaveSystem.get().settings.lyra, voice: false, subtitles: false } });
      for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key);
      game.scene.start('arena', { baseSeed: 550055, round: 68, objectiveMode: 'open', protocol: 'normal', runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null });
      const arena = game.scene.keys.arena;
      await until(() => arena.roundRuntime?.phase === 'active', 'Arena activation');
      arena.player.invulnUntil = Infinity; arena.playerInput.adoptDevice('gamepad'); arena.pointerLockInitialGate = false;
      if (arena.state.state === 'Paused') arena.restoreGameplayAfterPause();
      arena.pointerLock?.hidePrompt(); arena.scene.pause(); await wait(100);
      const hud = arena.hudInformation, q = hud.queue;
      check(HudInformationSystem.forScene(arena) === hud, 'One notification owner per scene');
      const step = dt => hud.update(dt);
      const finish = () => { step(6000); step(300); };
      hud.clear(); hud.notify({ category: 'redline', heading: 'REDLINE', message: 'MOVE. DASH. CHAIN KILLS.', key: 'redline:test' });
      step(0); check(q.phase === 'DEPLOYING' && hud.view.panel.y === 0, 'Panel starts fully behind the deck');
      step(160); check(hud.view.panel.y < 0 && hud.view.panel.y > -220, 'Panel mechanically travels upward');
      await snapshot('deploying'); step(160); step(1100);
      const needle = hud.view.needle.rotation; step(300);
      check(hud.view.needle.visible && needle !== hud.view.needle.rotation, 'Redline RPM needle animates');
      await snapshot('redline'); finish();
      check(q.phase === 'HIDDEN' && !hud.view.root.visible, 'Redline fully retracts');
      for (const [heading, animation] of [['HOT PACKAGE INBOUND', 'supply'], ['PACKET SNATCHER', 'thief'], ['GOLDEN HUNT', 'hunt'], ['MINI-BOSS DETECTED', 'boss'], ['NEON CIRCUIT', 'circuit']]) {
        hud.clear(); hud.notify({ category: 'arcade', heading, message: animation === 'supply' ? 'Hold the drop zone and crack the Supply Pod.' : 'ARCADE OBJECTIVE ONLINE', key: animation });
        step(0); step(320); step(900);
        check(hud.view.motifs.get(animation).visible && !hud.view.needle.visible, heading + ' uses its own treatment');
        await snapshot(animation); finish(); check(q.phase === 'HIDDEN', heading + ' retracts');
      }
      hud.clear();
      for (let i = 0; i < 20; i++) hud.notify({ category: 'weekly', heading: 'Outcome ' + i, key: 'outcome:' + i });
      for (let i = 0; i < 200; i++) hud.notify({ category: 'system', heading: 'Repeated signal', key: 'repeat' });
      check(q.pending.length === 21, 'Distinct burst retained; repetitive burst coalesced');
      const seen = []; step(0);
      while (q.active) { seen.push(q.active.heading); step(320); finish(); }
      check(seen.length === 21 && new Set(seen).size === 21, 'Every queued outcome displays once');
      check(arena.children.list.filter(o => o.name === 'hud-mechanical-notification').length === 1, 'Burst does not duplicate the display');
      hud.clear(); hud.notify({ category: 'weekly', heading: 'WEEKLY CHALLENGE COMPLETE', message: 'Outcome survives interruption', key: 'weekly:test' }); step(0); step(320); step(700);
      const { getEnemyDefuseDuration } = await import('/src/game/config/modeBalance.ts');
      const requiredMs = getEnemyDefuseDuration(OBJECTIVE_CONFIG.defuseRequiredMs, arena.protocol);
      const site = arena.bombSites.sites[0]; site.state = 'BeingDefused'; site.timerMs = 30000; site.defuseMs = requiredMs * .25;
      arena.updateHud(arena.time.now); step(0); step(300); step(320);
      check(q.active?.key === 'bomb-disarm' && hud.view.progressBar.scaleY === .25, 'Arena real defuse progress drives the vertical bar');
      site.defuseMs = requiredMs * .75; arena.updateHud(arena.time.now); step(16);
      check(hud.view.progressBar.scaleY === .75, 'Live progress changes without redeploying'); await snapshot('disarm');
      site.state = 'Armed'; arena.updateHud(arena.time.now); step(0); step(300); step(320);
      check(q.active?.key === 'weekly:test', 'Stopped disarm resumes the interrupted outcome');
      hud.clear(); hud.setDisarm(site.letter, .4); step(0); step(320); hud.clear();
      check(q.phase === 'HIDDEN' && !q.live.size && !q.pending.length && !hud.view.root.visible, 'Encounter clear retires warning, queue, and animation');
      const roots = arena.children.list.length, textures = Object.keys(game.textures.list).length;
      for (let i = 0; i < 100; i++) { hud.notify({ category: 'redline', heading: 'REDLINE', key: 'cycle:' + i }); step(0); step(320); step(3500); step(300); }
      check(arena.children.list.length === roots && Object.keys(game.textures.list).length === textures, '100 cycles reuse roots and textures');
      hud.notify({ category: 'system', heading: 'Pre-HEIST notice', key: 'old-arena' }); step(0); step(320);
      arena.scene.resume();
      arena.beginAnomalyTransition({ anomalyId: 'heist', sessionId: 'mechanical-' + Date.now(), cost: 35, portal: { x: arena.player.x, y: arena.player.y } });
      await until(() => game.scene.keys['anomaly-heist']?.hudInformation && game.scene.keys['anomaly-heist'].sys.isActive(), 'HEIST starts');
      const heist = game.scene.keys['anomaly-heist'], heistHud = heist.hudInformation;
      heist.player.invulnUntil = Infinity;
      check(!hud.view.root.visible && !q.pending.length && !q.live.size, 'Anomaly transition clears Arena notification state');
      check(heistHud !== hud && heistHud.view.root.scene === heist, 'HEIST owns an independent screen');
      heistHud.notify({ category: 'anomaly', heading: 'Before failure', key: 'old-heist' }); heistHud.update(0); heistHud.update(320);
      heist.failHeist('player-dead');
      check(!heistHud.view.root.visible && !heistHud.queue.pending.some(n => n.key === 'old-heist'), 'HEIST failure clears prior animation and queued work');
      await until(() => arena.sys.isActive() && !heist.sys.isActive(), 'HEIST return');
      check(!heistHud.view.root.scene && !q.pending.some(n => n.key === 'old-heist' || n.key === 'old-arena'), 'Return destroys HEIST display and retains no old messages');
      arena.scene.pause(); await wait(100); hud.clear();
      const canvases = [];
      const visit = o => { if (o.type === 'Text') canvases.push(o); o.list?.forEach(visit); }; visit(hud.view.root);
      hud.notify({ category: 'system', heading: 'Ending' }); step(0); step(320);
      arena.state.set('Victory'); arena.completeRound();
      check(!hud.view.root.visible && !q.live.size && q.pending.every(n => n.heading === 'ALL TARGETS DESTROYED'), 'Actual completion clears prior presentation before its fresh result');
      game.scene.stop('arena'); await wait(40);
      check(!hud.view.root.scene && canvases.every(t => !t.scene), 'Shutdown destroys screen and text owners');
      const context = new AudioContext();
      try {
        for (const [id, file] of Object.entries(LYRA_RECORDINGS['en-US'])) {
          const response = await fetch('/assets/audio/lyra/' + file); check(response.ok, 'Recording loads: ' + id);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          check(buffer.duration > .1 && buffer.numberOfChannels > 0, 'Recording decodes: ' + id);
          report.audio.push({ id, file, seconds: buffer.duration, channels: buffer.numberOfChannels });
        }
      } finally { await context.close(); }
    } catch (e) { report.errors.push(String(e.stack ?? e)); }
    finally { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onError); report.running = false; }
  })();
  return { started: true };
})();
