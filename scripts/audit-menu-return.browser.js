(() => {
  const game = n3onGame, wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [] };
  const check = (ok, label) => { report.cases.push({ ok: !!ok, label }); if (!ok) throw Error(label); };
  const until = async (fn, label) => { const at = performance.now(); while (!fn()) { if (performance.now() - at > 25000) throw Error(label); await wait(40); } };
  const objects = scene => { const result = []; const visit = o => { result.push(o); o.list?.forEach(visit); }; scene.children.list.forEach(visit); return result; };
  const active = key => game.scene.isActive(key);
  const click = (scene, label) => { const button = objects(scene).find(o => o.type === 'Container' && o.getByName('button-label')?.text === label); if (!button) throw Error('Missing ' + label); button.getByName('button-hit').emit('pointerdown'); };
  report.promise = (async () => {
    try {
      const live = path => performance.getEntriesByType('resource').findLast(e => e.name.includes(path + '?t='))?.name ?? path;
      const { SaveSystem } = await import(live('/src/game/systems/SaveSystem.ts'));
      const { RunTransitionManager } = await import(live('/src/game/flow/RunTransitionManager.ts'));
      const { TUTORIAL_SEQUENCES } = await import('/src/game/tutorial/TutorialRegistry.ts');
      check(SaveSystem.createProfile('Return ' + Date.now().toString().slice(-6)).ok, 'Isolated return profile created');
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; p.completedSequences = TUTORIAL_SEQUENCES.map(s => s.id); });
      SaveSystem.markInitialDeploymentBriefingSeen();
      for (const scene of game.scene.getScenes(false)) if (scene.sys.isActive() || scene.sys.isPaused() || scene.sys.isSleeping()) game.scene.stop(scene.scene.key);
      game.scene.start('menu'); await wait(200);
      for (const reason of ['playerDead', 'bombDefused']) {
        const menu = game.scene.getScene('menu');
        check(RunTransitionManager.requestArenaTransition(menu, { reason: 'continue-next-round', session: { baseSeed: 550055, round: 68, protocol: 'overdrive', objectiveMode: 'open', runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null } }), 'Deployment starts for ' + reason);
        await until(() => active('arena') && game.scene.getScene('arena').roundRuntime?.phase === 'active', 'Arena active');
        const arena = game.scene.getScene('arena'), audio = arena.audio;
        arena.pointerLockInitialGate = false; arena.player.invulnUntil = Infinity; arena.playerInput.adoptDevice('gamepad');
        if (arena.state.state === 'Paused') arena.resumeGameplay();
        await until(() => audio.musicContext === 'gameplay' && audio.isMusicPlaying(), 'Gameplay music active');
        const voice = audio.musicAudio;
        arena.triggerDefeat(reason); await until(() => active('results'), 'Actual failure reaches Results'); await wait(100);
        check(audio.musicContext === 'gameplay' && audio.musicAudio === voice && audio.menuMusicAudio.paused, reason + ' Results retain gameplay soundtrack');
        check(audio.musicDiagnostics().voices.filter(v => v.playing).length === 1, reason + ' Results have one music source');
        if (reason === 'playerDead') {
          click(game.scene.getScene('results'), 'MAIN MENU');
        } else {
          click(game.scene.getScene('results'), 'STORE');
          await until(() => active('upgrades') && audio.musicContext === 'menu', 'Out-of-run store permits menu soundtrack');
          check(voice.paused && audio.isMusicPlaying(), 'Store after defeat is out of run');
          const back = [...document.querySelectorAll('#game-ui-root button')].find(b => b.textContent.includes('BACK TO MAIN MENU'));
          check(!!back, 'Store has actual Main Menu return'); back.click();
        }
        await until(() => active('menu') && audio.musicContext === 'menu', 'Menu soundtrack restored'); await wait(100);
        check(voice.paused && audio.musicDiagnostics().voices.filter(v => v.playing).length === 1, reason + ' return resumes only menu music');
      }
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally { report.running = false; }
  })();
  return 'Failure return audit started';
})();
