// Review artifacts; intended graffiti changes are not pixel-identity checks.
(() => {
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], startedAt: new Date().toISOString() };
  const game = globalThis.n3onGame, wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  report.promise = (async () => {
    let scene;
    try {
      const { ArenaVisualRenderer: Before } = await import('/artifacts/polish-baseline/ArenaVisualRenderer.ts');
      const { ArenaVisualRenderer: After } = await import('/src/game/arena/ArenaVisualRenderer.ts');
      const { createArenaFloorDecalPlan } = await import('/src/game/rendering/EnvironmentDecalLibrary.ts');
      const { createArenaDressingPlan } = await import('/src/game/arena/ArenaVisualTheme.ts');
      const baseline = await fetch('/artifacts/layout-after.json').then(r => r.json());
      for (const current of game.scene.getScenes(true)) game.scene.stop(current.scene.key);
      scene = new Phaser.Scene({ key: 'polish-art' }); game.scene.add('polish-art', scene, true); await wait(100);
      const snapshot = () => new Promise(resolve => game.renderer.snapshot(image => resolve(image.src)));
      for (const template of ['islands', 'fortress']) {
        const layout = baseline.cases.find(c => c.kind === 'arena' && c.template === template).layout;
        const plan = createArenaDressingPlan(layout);
        const floors = createArenaFloorDecalPlan(layout, plan.panelWidth, plan.panelHeight);
        for (const [view, zoom, center] of [['whole', .5, { x: 1200, y: 800 }], ['floor', .9, floors[0] ?? { x: 1200, y: 800 }]]) {
          const row = { template, view, zoom, floors };
          for (const [name, Renderer] of [['before', Before], ['after', After]]) {
            const visuals = new Renderer(scene, layout);
            for (const tween of visuals.tweens) tween.remove();
            for (const target of visuals.ambientPulseTargets) target.setAlpha(.6);
            scene.cameras.main.setBounds(0, 0, 2400, 1600).setZoom(zoom).centerOn(center.x, center.y);
            await wait(120); row[name] = await snapshot(); visuals.destroy(); await wait(50);
          }
          report.cases.push(row);
        }
      }
      report.finishedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally { if (scene) { game.scene.stop(scene.scene.key); game.scene.remove(scene.scene.key); } report.running = false; }
  })();
  return { started: true };
})();
