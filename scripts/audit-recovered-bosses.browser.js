// Brief actual-Arena rendering/ownership check; assisted, not a campaign soak.
(() => {
  const report = globalThis.__n3onLayoutAudit = { running: true, current: 'boss setup', cases: [], errors: [], frames: [], screenshots: [] };
  const game = globalThis.n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const check = (ok, label) => { report.cases.push({ ok: !!ok, label }); if (!ok) throw Error(label); };
  const until = async fn => { const end = performance.now() + 12000; while (!fn()) { if (performance.now() > end) throw Error('Boss initialization timed out'); await wait(30); } };
  const stop = async () => { for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key); await wait(80); };
  report.promise = (async () => {
    try {
      const dependency = async (url, symbol) => (await fetch(url).then(r => r.text())).match(new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*["']([^"']+)`))[1];
      const { SaveSystem: Save } = await import(await dependency('/src/game/scenes/ArenaScene.ts', 'SaveSystem'));
      await stop(); check(Save.createProfile('Boss review ' + Date.now().toString().slice(-6)).ok, 'isolated review profile');
      Save.setSettings({ masterVolume: 0, contextualTutorials: false });
      Save.updateTutorialProgress(p => { p.firstRunStage = 'complete'; p.firstRunWelcomePending = false; });
      for (const round of [5, 10, 15]) {
        report.current = 'boss ' + round;
        game.scene.start('arena', { baseSeed: 550055 + round, round, protocol: 'normal', objectiveMode: 'open', equippedMods: [], modsEarned: [] });
        const arena = game.scene.keys.arena;
        await until(() => arena.bossIntroOverlay?.ready);
        arena.player.invulnUntil = Infinity; arena.playerInput.adoptDevice('gamepad'); arena.pointerLockInitialGate = false;
        arena.bossIntroOverlay.ready.element.click();
        await until(() => arena.bossFlowPhase === 'combat');
        const boss = arena.bossEncounter.boss;
        check(boss.texture.key === `rwg-${boss.archetype}-chassis`, `${boss.archetype}: recovered chassis loaded`);
        check(Math.abs(boss.body.halfWidth - 34) < .01, `${boss.archetype}: 68-pixel world collider`);
        check(arena.cameras.main.zoom === .9, `${boss.archetype}: unchanged gameplay zoom`);
        const roots = arena.children.list.length;
        arena.cameras.main.stopFollow(); arena.cameras.main.centerOn(boss.x, boss.y);
        const intervals = []; let previous = performance.now();
        const tick = () => { const now = performance.now(); intervals.push(now - previous); previous = now; };
        game.events.on('step', tick);
        try { await wait(4000); } finally { game.events.off('step', tick); }
        const sorted = intervals.slice(1).sort((a,b) => a-b);
        report.frames.push({ archetype: boss.archetype, round, roots, frames: sorted.length, meanMs: sorted.reduce((a,b) => a+b,0)/sorted.length, p95Ms: sorted[Math.ceil(sorted.length*.95)-1], maxMs: sorted.at(-1) });
        check(sorted.length > 30 && boss.active && boss.hp > 0, `${boss.archetype}: live combat and presentation`);
        await new Promise(resolve => game.renderer.snapshot(img => { report.screenshots.push({ archetype: boss.archetype, data: img.src }); resolve(); }));
        await stop();
        check(arena.children.list.length === 0 && !boss.active, `${boss.archetype}: scene objects retired`);
      }
    } catch (e) { report.errors.push(String(e.stack ?? e)); }
    finally { await stop(); report.running = false; }
  })(); return 'Brief restored-boss review started';
})();
