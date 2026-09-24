(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], measurements: [] };
  report.promise = (async () => {
    let scene;
    try {
      const live = p => performance.getEntriesByType('resource').findLast(e => e.name.includes(p + '?t='))?.name ?? p;
      const { HudInformationSystem } = await import(live('/src/game/ui/HudInformationSystem.ts'));
      for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key);
      scene = new Phaser.Scene('mechanical-cost'); game.scene.add('mechanical-cost', scene, true); await wait(100);
      const count = () => ({ resize: game.scale.listenerCount('resize'), scene: scene.events.eventNames().reduce((sum, name) => sum + scene.events.listenerCount(name), 0) });
      const before = count(); let retired = 0;
      for (let i = 0; i < 30; i++) {
        if (!scene.sys.isActive()) { game.scene.start(scene.scene.key); await wait(30); }
        const h = HudInformationSystem.forScene(scene);
        for (const key of ['gas', 'laser', 'bomblet', 'flux']) h.createTacticalText(key, '#ffffff').setText('TEST').setAlpha(1);
        h.notify({ category: 'redline', heading: 'REDLINE' }); h.update(0); h.update(320); await wait(20);
        const handles = [];
        const visit = o => { if (o.type === 'RenderTexture') handles.push(o.texture.getWebGLTexture().webGLTexture); o.list?.forEach(visit); }; visit(h.view.root);
        if (!handles.length || handles.some(t => !game.renderer.gl.isTexture(t))) throw Error('Textures were not live');
        if (i % 2) game.scene.stop(scene.scene.key); else h.destroy(); await wait(30);
        const roots = scene.children.list.length, canvasOwners = Phaser.Display.Canvas.CanvasPool.pool.filter(e => e.parent?.scene === scene).length;
        const remaining = handles.filter(t => game.renderer.gl.isTexture(t)).length;
        const ok = !roots && !canvasOwners && !remaining && game.scale.listenerCount('resize') === before.resize;
        report.cases.push({ ok, label: 'Retirement ' + i, mode: i % 2 ? 'shutdown' : 'destroy', roots, canvasOwners, remaining, textures: handles.length });
        if (!ok) throw Error('Resource retirement failure'); retired += handles.length;
      }
      report.retiredTextures = retired;
      if (!scene.sys.isActive()) { game.scene.start(scene.scene.key); await wait(50); }
      const h = HudInformationSystem.forScene(scene);
      for (const animation of ['hidden', 'redline', 'supply', 'thief', 'hunt', 'boss', 'circuit', 'disarm', 'anomaly', 'hazard', 'reward', 'console']) {
        h.clear();
        if (animation !== 'hidden') h.queue.setLive('sample', { category: 'system', heading: animation.toUpperCase(), message: 'TACTICAL SYSTEMS // LIVE STATUS', animation, priority: 100, progress: .65, rpm: 95 });
        h.update(0); h.update(320); await wait(100);
        const original = game.renderer.render, render = [], update = [], raw = []; let last;
        const step = (_time, delta) => { const now = performance.now(); if (last) raw.push(now - last); last = now;
          const start = performance.now(); h.update(delta); update.push(performance.now() - start); };
        scene.events.on('preupdate', step);
        game.renderer.render = function(...args) { const start = performance.now(); try { return original.apply(this, args); } finally { render.push(performance.now() - start); } };
        try { await wait(1500); } finally { game.renderer.render = original; scene.events.off('preupdate', step); }
        const stats = a => { a.sort((x, y) => x - y); return { n: a.length, mean: a.reduce((s, n) => s + n, 0) / a.length, p95: a[Math.floor(a.length * .95)], max: a.at(-1) }; };
        const sample = { animation, render: stats(render), update: stats(update), raw: stats(raw) }; report.measurements.push(sample);
        const ok = sample.raw.n > 60 && sample.raw.mean < 20 && sample.update.mean < .5 && sample.render.mean < 2;
        report.cases.push({ ok, label: 'Isolated display cost ' + animation }); if (!ok) throw Error(JSON.stringify(sample));
      }
      h.destroy();
    } catch (e) { report.errors.push(String(e.stack ?? e)); }
    finally { report.running = false; if (scene?.scene) game.scene.remove(scene.scene.key); }
  })();
  return { started: true };
})();
