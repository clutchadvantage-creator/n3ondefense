// Run after a browser reload. This isolates debrief construction/rendering;
// it is not a substitute for the real encounter-completion transition.
(() => {
  const game = globalThis.n3onGame, wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], startedAt: new Date().toISOString() };
  report.promise = (async () => {
    const scene = game.scene.getScene('round-finished'), original = scene.create;
    const previousPayload = game.registry.get('round-finished');
    let row;
    const frames = [];
    let previousAt;
    const step = () => { const now = performance.now(); if (previousAt !== undefined) frames.push(now - previousAt); previousAt = now; };
    try {
      for (const current of game.scene.getScenes(true)) game.scene.stop(current.scene.key);
      await wait(150);
      scene.create = function (...args) { const start = performance.now(); try { return original.apply(this, args); } finally { row.createMs = performance.now() - start; } };
      game.registry.set('round-finished', { completedRound: 1, nextRound: 2, completedSeed: 550055, nextSeed: 550056,
        completedTemplate: 'islands', nextTemplate: 'fortress', protocol: 'normal', modsEarned: [], creditsGained: 250,
        coreTokensGained: 2, plasmaChipsGained: 0, fluxCoresGained: 0, bossDefeated: null });
      for (let repeat = 0; repeat < 5; repeat++) {
        row = { repeat }; frames.length = 0; previousAt = performance.now(); game.events.on('step', step);
        game.scene.start('round-finished'); await wait(700); game.events.off('step', step);
        row.frameMaxMs = Math.max(...frames); row.frameMeanMs = frames.reduce((n, v) => n + v, 0) / frames.length;
        game.scene.stop('round-finished'); await wait(100);
        row.canvasOwners = Phaser.Display.Canvas.CanvasPool.pool.filter(e => e.parent?.scene === scene).length;
        row.retiredObjects = scene.children.length;
        if (row.canvasOwners || row.retiredObjects) throw new Error('Debrief resources retained');
        report.cases.push(row);
      }
      report.finishedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally {
      game.events.off('step', step); scene.create = original; game.scene.stop('round-finished');
      if (previousPayload) game.registry.set('round-finished', previousPayload); else game.registry.remove('round-finished');
      report.running = false;
    }
  })();
  return { started: true };
})();
