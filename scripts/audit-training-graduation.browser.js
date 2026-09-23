(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], screenshots: [] };
  const onError = e => report.errors.push(String(e.error?.stack ?? e.reason?.stack ?? e.message ?? e.reason));
  window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onError);
  const check = (ok, label, detail) => { report.cases.push({ ok: !!ok, label, detail }); if (!ok) throw Error(label); };
  report.promise = (async () => {
    try {
      const { SaveSystem } = await import('/src/game/systems/SaveSystem.ts');
      const { LocalSaveManager } = await import('/src/game/save/LocalSaveManager.ts');
      const { TUTORIAL_SEQUENCES } = await import('/src/game/tutorial/TutorialRegistry.ts');
      const { completeFirstRunTeachingRound, completeTutorialSequence } = await import('/src/game/tutorial/TutorialProgress.ts');
      const stop = () => { for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key); };
      check(SaveSystem.createProfile('Training ' + Date.now().toString().slice(-6)).ok, 'Isolated profile'); stop();
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'arena-teaching'; p.firstRunWelcomePending = false; completeFirstRunTeachingRound(p, 1); completeFirstRunTeachingRound(p, 2); });
      game.scene.start('menu'); await wait(450);
      let menu = game.scene.keys.menu;
      check(menu.tutorialDirector.isActiveSequence('onboarding.menu-resume-training'), 'Two completed rounds still offer training');
      stop();
      // Persisted round outcome but interrupted reward presentation: counter is still two.
      SaveSystem.recordRoundCompletion(3, 'normal');
      game.scene.start('menu'); await wait(450); menu = game.scene.keys.menu;
      check(SaveSystem.getTutorialProgress().firstRunStage === 'waiting-for-store', 'Menu repairs interrupted third-round handoff');
      check(menu.tutorialDirector.isActiveSequence('onboarding.menu-store'), 'Third round leads to Store');
      check(!menu.tutorialDirector.awaits('ui.startLocalSelected'), 'No START LOCAL completion gate remains');
      const director = menu.tutorialDirector;
      director.finish(false);
      director.pending.push(TUTORIAL_SEQUENCES.find(s => s.id === 'onboarding.menu-resume-training'));
      director.startNext();
      check(director.isActiveSequence('onboarding.menu-store') && director.pending.length === 0, 'Stale queued training is discarded before presentation');
      const disk = JSON.parse(LocalSaveManager.getActiveProfileSaveRaw());
      check(disk.tutorials.firstRunStage === 'waiting-for-store' && disk.tutorials.trainingRoundsCompleted === 3, 'Graduation persisted to disk');
      check(disk.tutorials.completedSequences.includes('onboarding.tactics') && disk.tutorials.completedSequences.includes('onboarding.certification'), 'Later Arena teaching retired');
      let status = ''; const text = { setText: value => { status = value; return text; }, setColor: () => text };
      check(menu.allowTeachingMenuAction('store', text), 'Store navigation is allowed after graduation');
      menu.allowTeachingMenuAction('local', text);
      check(status.includes('STORE') && !status.includes('START LOCAL'), 'Menu guidance points toward Store');
      stop(); SaveSystem.updateTutorialProgress(p => completeTutorialSequence(p, 'onboarding.store'));
      game.scene.start('menu'); await wait(400);
      check(game.scene.keys.menu.tutorialDirector.isActiveSequence('onboarding.menu-garage'), 'Store teaching hands off to Garage');
      stop(); game.scene.start('splash', { replay: true, returnScene: 'menu' }); await wait(1300);
      const splash = game.scene.keys.splash, note = splash.developmentText;
      check(note?.text === 'IN DEVELOPMENT — Content and features may change at any time.', 'Splash development notice displayed');
      const b = note.getBounds();
      check(b.x >= 0 && b.right <= game.scale.width && b.y >= 0 && b.bottom < splash.creatorText.getBounds().top, 'Notice fits above footer credits');
      report.screenshots.push({ label: 'splash-development-notice', png: await Promise.race([
        new Promise(r => game.renderer.snapshot(img => r(img.src))),
        wait(10000).then(() => { throw Error('Splash capture timed out'); })
      ]) });
      stop(); game.scene.start('splash', { replay: true, returnScene: 'menu' }); await wait(100);
      check(game.scene.keys.splash.children.list.filter(o => o.text?.startsWith('IN DEVELOPMENT')).length === 1, 'Splash replay creates one notice');
      stop();
    } catch (e) { report.errors.push(String(e.stack ?? e)); }
    finally { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onError); report.running = false; }
  })();
  return { started: true };
})();
