(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], screenshots: [] };
  const live = p => performance.getEntriesByType('resource').findLast(e => e.name.includes(p + '?t='))?.name ?? p;
  const check = (ok, label, detail) => { report.cases.push({ ok: !!ok, label, detail }); if (!ok) throw Error(label); };
  const until = async (fn, label) => { const start = performance.now(); while (!fn()) { if (performance.now() - start > 20000) throw Error(label); await wait(50); } };
  const all = scene => { const result = []; const visit = o => { result.push(o); o.list?.forEach(visit); }; scene.children.list.forEach(visit); return result; };
  const stop = () => { for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key); };
  const parent = game.scale.parent, old = { width: parent.style.width, height: parent.style.height, w: game.scale.width, h: game.scale.height };
  report.promise = (async () => {
    try {
      await until(() => game.scene.keys.menu && game.scene.keys.arena && !game.scene.keys.boot.sys.isActive(), 'Boot completed');
      await wait(150);
      const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
      const { LyraComms } = await import(live('/src/game/lyra/LyraComms.ts'));
      const { PlayerProfileStore } = await import(live('/src/game/state/PlayerProfileStore.ts'));
      const result = SaveSystem.createProfile('Lyra UI ' + Date.now().toString().slice(-6)); check(result.ok, 'Isolated UI/profile fixture');
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; });
      SaveSystem.setSettings({ lyra: { ...SaveSystem.get().settings.lyra, voice: false, subtitles: true } });
      const comms = LyraComms.get(); comms.refreshSettings(); stop(); game.scene.start('garage');
      await until(() => comms.diagnostics().context.scene === 'garage', 'Garage context'); await wait(400);
      check(comms.ambient(), 'Ambient line starts only in safe Garage downtime');
      const ambient = comms.diagnostics().active;
      check(document.querySelector('.lyra-comms').textContent.includes('LYRA'), 'Menu comms use named compact presentation');
      comms.training('garage', 'tutorial.onboarding.garage.loadout', 'Training channel test.');
      check(comms.diagnostics().active !== ambient && comms.diagnostics().active.startsWith('tutorial.'), 'Required guidance preempts ambient');
      comms.endTraining('garage'); comms.queue.resetCooldowns();
      check(comms.say('system.ready'), 'Once-per-profile line accepted before completion');
      await until(() => SaveSystem.getTutorialProgress().lyraSeen?.includes('system.ready'), 'Completed text marked seen');
      check(!comms.say('system.ready'), 'Completed profile hint does not repeat');
      SaveSystem.setSettings({ contextualTutorials: false });
      check(!comms.say('context.recalibration'), 'Contextual guidance setting suppresses optional teaching');
      SaveSystem.setSettings({ lyra: { ...SaveSystem.get().settings.lyra, voice: false, subtitles: false, browserTts: false, ambient: false, volume: .43, ducking: .2, rate: .9, pitch: .95 } });
      comms.refreshSettings(); check(!comms.ambient(), 'Ambient OFF suppresses chatter');
      stop(); game.scene.start('options', { returnScene: 'menu' }); await wait(300);
      for (const [w, h] of [[1280, 720], [960, 600]]) {
        parent.style.width = w + 'px'; parent.style.height = h + 'px'; game.scale.resize(w, h); game.scale.refresh(); await wait(400);
        const options = game.scene.getScene('options'), state = options.scrollStates.get('audio');
        const text = all(options).find(o => o.text === 'LYRA SUBTITLES: OFF'); check(!!text, 'Subtitle setting is present ' + w);
        const target = state.targets.find(t => t.target === text.parentContainer); check(!!target, 'Subtitle toggle has scroll ownership ' + w);
        state.offset = Math.min(state.max, Math.max(0, target.centerY - options.audioCategoryTop - 35)); options.applyTabScroll('audio');
        const hit = text.parentContainer.getByName('button-hit'); check(hit.input.enabled, 'Scrolled subtitle setting is interactive ' + w);
        hit.emit('pointerdown'); check(SaveSystem.get().settings.lyra.subtitles, 'Actual subtitle toggle saves ON ' + w);
        hit.emit('pointerdown'); check(!SaveSystem.get().settings.lyra.subtitles, 'Actual subtitle toggle saves OFF ' + w);
        report.screenshots.push({ label: 'lyra-options-' + w, png: await new Promise(r => game.renderer.snapshot(img => r(img.src))) });
      }
      const options = game.scene.getScene('options'); options.selectTab('gameplay');
      const before = JSON.stringify({ wallet: PlayerProfileStore.getActiveSave().wallet, progress: PlayerProfileStore.getActiveSave().progress });
      const replay = all(options).find(o => o.text === 'REPLAY // DEFENSIVE ABILITIES'); check(!!replay, 'Existing replay UI includes second-round abilities');
      replay.parentContainer.getByName('button-hit').emit('pointerdown');
      check(SaveSystem.getTutorialProgress().replaySequenceId === 'onboarding.tactics', 'Replay schedules the selected tutorial');
      check(before === JSON.stringify({ wallet: PlayerProfileStore.getActiveSave().wallet, progress: PlayerProfileStore.getActiveSave().progress }), 'Replay preserves progression and currencies');
      SaveSystem.updateTutorialProgress(p => { p.replaySequenceId = null; });
      report.profileId = PlayerProfileStore.getActiveSave().profile.id;
      report.settings = { ...SaveSystem.get().settings.lyra };
      report.seen = [...SaveSystem.getTutorialProgress().lyraSeen];
      stop(); await wait(100); game.scene.start('menu'); await wait(400);
      check(!document.querySelector('.tutorial-overlay:not([hidden])'), 'Established profile is not forced through new onboarding');
      report.completedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally { parent.style.width = old.width; parent.style.height = old.height; game.scale.resize(old.w, old.h); game.scale.refresh(); report.running = false; }
  })();
  return { started: true };
})();
