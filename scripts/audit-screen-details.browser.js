(() => {
  const game = globalThis.n3onGame, wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], startedAt: new Date().toISOString() };
  const check = (ok, label) => { report.cases.push({ ok: Boolean(ok), label }); if (!ok) throw new Error(label); };
  const all = scene => { const result = []; const visit = o => { result.push(o); if (o.type === 'Container') o.list.forEach(visit); }; scene.children.list.forEach(visit); return result; };
  report.promise = (async () => {
    const size = { width: game.scale.width, height: game.scale.height };
    try {
      const { SaveSystem } = await import('/src/game/systems/SaveSystem.ts');
      const { UiNavigationController } = await import('/src/game/input/UiNavigationController.ts');
      SaveSystem.addMod('split-current'); SaveSystem.addMod('nanite-fuel');
      const open = async (key, data = {}) => {
        for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
        game.scene.start(key, data); await wait(450);
        check(game.scene.isActive(key), `${key} opens`); return game.scene.getScene(key);
      };
      const garage = await open('garage', { returnScene: 'menu' });
      garage.showLibrary(); await wait(150);
      const layer = UiNavigationController.get().layers.find(l => l.id === 'phaser:garage');
      const dossier = [...layer.labels].find(([, label]) => label === 'Selected Mod Technical Dossier');
      check(dossier && layer.manager.focus(dossier[0]), 'Garage owned-card dossier is controller focusable');
      check(all(garage).some(o => o.type === 'Text' && /SPLIT|NANITE/i.test(o.text)), 'Garage displays the owned Mod description');
      layer.back(); await wait(150);
      check(garage.sys.isActive(), 'dossier Back returns within Garage');
      const mods = await open('mods', { returnScene: 'garage' });
      check(all(mods).some(o => o.type === 'Text' && /SPLIT|NANITE/i.test(o.text)), 'Mod Collection displays owned cards and details');
      UiNavigationController.get().layers.find(l => l.id === 'phaser:mods').back(); await wait(250);
      check(game.scene.isActive('garage'), 'Mod Collection restores Garage route');
      for (const [width, height] of [[1280, 720], [960, 600]]) {
        game.scale.resize(width, height);
        const options = await open('options', { returnScene: 'menu' });
        for (const tab of ['audio', 'gameplay', 'interface', 'profile', 'system']) {
          options.selectTab(tab); options.scrollActiveTab(10000);
          check(options.activeTab === tab && options.tabContainers.get(tab).visible, `Options ${tab} available at ${width}x${height}`);
        }
        options.selectTab('interface'); options.scrollActiveTab(10000);
        const cameraButton = all(options).find(o => o.type === 'Container' && /^CAMERA SHAKE:/.test(o.getByName('button-label')?.text ?? ''));
        const bounds = cameraButton.getBounds();
        check(bounds.top >= options.viewport.top && bounds.bottom <= options.viewport.bottom, `camera setting scrolls into view at ${width}x${height}`);
      }
      game.scale.resize(size.width, size.height);
      await open('local-profiles');
      const buttons = [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0);
      const continueButton = buttons.find(b => /CONTINUE/i.test(b.textContent));
      check(continueButton && !continueButton.disabled, 'selected local profile can continue');
      continueButton.click(); await wait(300);
      check(game.scene.isActive('menu'), 'local profile Continue restores Main Menu');
      const menu = game.scene.getScene('menu');
      check(all(menu).some(o => o.type === 'Text' && /LOCAL/.test(o.text)), 'Main Menu presents local deployment');
      check(all(menu).some(o => o.type === 'Text' && /ONLINE/.test(o.text)), 'Main Menu presents online deployment');
      report.finishedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally { game.scale.resize(size.width, size.height); report.running = false; }
  })();
  return { started: true };
})();
