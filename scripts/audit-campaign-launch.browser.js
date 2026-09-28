// Real menu controls, mocked authorization and loading handoff. No network scores.
(() => {
  const report = globalThis.__n3onLayoutAudit = { running: true, current: 'launch menu', cases: [], errors: [] };
  const game = globalThis.n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const check = (ok, label) => { report.cases.push({ ok: !!ok, label }); if (!ok) throw Error(label); };
  const dependency = async (url, symbol) => (await fetch(url).then(r => r.text())).match(new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*["']([^"']+)`))[1];
  report.promise = (async () => {
    const menuUrl = '/src/game/scenes/MainMenuScene.ts';
    const { SaveSystem: Save } = await import(await dependency(menuUrl, 'SaveSystem'));
    const { OnlineRunManager: Runs } = await import(await dependency(menuUrl, 'OnlineRunManager'));
    const { RunTransitionManager: Transitions } = await import(await dependency(menuUrl, 'RunTransitionManager'));
    const uiUrl = await dependency(menuUrl, 'createButton');
    const { AudioManager } = await import(await dependency(uiUrl, 'AudioManager'));
    const audio = AudioManager.get(), sounds = [], requests = [], issued = [];
    const original = { begin: Runs.beginRun, identity: Runs.initializeIdentity, flush: Runs.flushQueue, request: Transitions.requestArenaTransition, sound: audio.playSfx };
    let policy = 'online', resolvePending;
    const stop = async () => { for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key); await wait(70); };
    const button = (scene, label) => {
      const walk = list => { for (const o of list) { if (o.list?.some(c => c.name === 'button-label' && c.text === label)) return o; const found = o.list && walk(o.list); if (found) return found; } };
      const found = walk(scene.children.list); if (!found) throw Error('Missing control ' + label); return found;
    };
    const open = async () => { await stop(); game.scene.start('menu'); await wait(180); return game.scene.keys.menu; };
    try {
      await stop(); check(Save.createProfile('Launch ' + Date.now().toString().slice(-6)).ok, 'isolated launch profile');
      Save.setSettings({ masterVolume: 0, contextualTutorials: false });
      Save.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; });
      Runs.initializeIdentity = async () => 'none'; Runs.flushQueue = async () => {};
      audio.playSfx = name => sounds.push(name);
      Transitions.requestArenaTransition = (scene, request) => { requests.push(request); return true; };
      Runs.beginRun = async (...args) => { issued.push(args); if (policy === 'pending') return new Promise(r => { resolvePending = r; }); return policy === 'online' ? { ok: true, seed: 112233, state: 'started' } : { ok: false, state: 'unavailable' }; };
      let menu = await open();
      const battle = button(menu, 'BATTLE // COMING SOON');
      battle.getByName('button-hit').emit('pointerdown');
      check(issued.length === 0 && requests.length === 0, 'Battle cannot launch or authorize a run');
      check(sounds.at(-1) === 'itemLocked' && battle.list[0].fillColor === 0x521927, 'Battle flashes red and dispatches unavailable sound');
      button(menu, 'START GAME').getByName('button-hit').emit('pointerdown'); await wait(50);
      check(issued.length === 1 && requests.length === 1, 'Start Game automatically requests one authorization');
      check(requests[0].session.baseSeed === 112233 && requests[0].session.round === 1, 'authorized seed and selected local round reach Loading');
      policy = 'offline'; menu = await open();
      button(menu, 'START GAME').getByName('button-hit').emit('pointerdown'); await wait(50);
      check(requests.length === 2 && requests[1].session.baseSeed > 0, 'offline service still launches playable campaign');
      check(!Runs.isOnlineRunActive() && Runs.lastSubmissionStatus() === 'local', 'offline starts stay local');
      policy = 'pending'; menu = await open();
      button(menu, 'START GAME').getByName('button-hit').emit('pointerdown'); await wait(20);
      await stop(); resolvePending({ ok: true, seed: 445566, state: 'started' }); await wait(30);
      check(requests.length === 2, 'leaving menu cancels pending deployment handoff');
    } catch (e) { report.errors.push(String(e.stack ?? e)); }
    finally { await stop(); Runs.beginRun = original.begin; Runs.initializeIdentity = original.identity; Runs.flushQueue = original.flush; Transitions.requestArenaTransition = original.request; audio.playSfx = original.sound; Runs.beginLocalRun(); report.running = false; }
  })().catch(e => { report.errors.push(String(e.stack ?? e)); report.running = false; });
  return 'Short automatic-launch review started';
})();
