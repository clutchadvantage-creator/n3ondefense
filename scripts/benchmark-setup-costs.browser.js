// DEV-only inclusive setup timings. No production instrumentation or lifecycle changes.
(() => {
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], startedAt: new Date().toISOString() };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  report.promise = (async () => {
    const restores = [];
    let scene;
    try {
      const game = globalThis.n3onGame;
      const { ArenaVisualRenderer } = await import(globalThis.__n3onLayoutAuditOptions?.rendererModule ?? '/src/game/arena/ArenaVisualRenderer.ts');
      const { ArenaGenerator } = await import('/src/game/systems/ArenaGenerator.ts');
      let current;
      const wrap = (target, key, label) => {
        const original = target[key];
        if (typeof original !== 'function') return;
        target[key] = function (...args) {
          const start = performance.now();
          try { return original.apply(this, args); }
          finally {
            if (current) {
              const row = current.costs[label] ??= { calls: 0, ms: 0, maxMs: 0 };
              const elapsed = performance.now() - start;
              row.calls++; row.ms += elapsed; row.maxMs = Math.max(row.maxMs, elapsed);
            }
          }
        };
        restores.push(() => { target[key] = original; });
      };
      for (const key of Object.getOwnPropertyNames(ArenaVisualRenderer.prototype)) {
        if (key.startsWith('draw') || key.startsWith('create')) wrap(ArenaVisualRenderer.prototype, key, `visuals.${key}`);
      }
      wrap(Phaser.GameObjects.Text.prototype, 'updateText', 'text.updateText');
      wrap(Phaser.GameObjects.RenderTexture.prototype, 'draw', 'texture.draw');
      wrap(Phaser.Textures.DynamicTexture.prototype, 'beginDraw', 'texture.beginDraw');
      wrap(Phaser.Textures.DynamicTexture.prototype, 'endDraw', 'texture.endDraw');
      wrap(Phaser.GameObjects.Graphics.prototype, 'renderWebGL', 'graphics.renderWebGL');
      wrap(Phaser.Renderer.WebGL.Pipelines.MultiPipeline.prototype, 'batchFillPath', 'pipeline.fillPath');
      wrap(Phaser.Renderer.WebGL.Pipelines.MultiPipeline.prototype, 'batchStrokePath', 'pipeline.strokePath');
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.scene.key);
      await wait(150);
      scene = new Phaser.Scene({ key: 'setup-audit' });
      game.scene.add('setup-audit', scene, true);
      await wait(150);
      for (const round of [1, 68, 148]) for (const template of ['open-field', 'islands', 'maze', 'fortress']) {
        ArenaGenerator.resetHistory(); ArenaGenerator.forceArenaType(template);
        const layout = ArenaGenerator.generate((550055 ^ Math.imul(round, 0x9e3779b1)) >>> 0, template, round, 4);
        ArenaGenerator.forceArenaType(null);
        current = { round, template: layout.template, requestedTemplate: template, costs: {} };
        const start = performance.now();
        const visuals = new ArenaVisualRenderer(scene, layout);
        current.setupMs = performance.now() - start;
        report.cases.push(current); current = null;
        await wait(120);
        visuals.destroy();
        await wait(60);
      }
      report.finishedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally {
      for (const restore of restores.reverse()) restore();
      if (scene) { scene.game.scene.stop('setup-audit'); scene.game.scene.remove('setup-audit'); }
      report.running = false;
    }
  })();
  return { started: true };
})();
