// Compare production circle batching against the unchanged Phaser path renderer.
(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], screenshots: [] };
  report.promise = (async () => {
    const key = 'explosion-circle-audit'; let scene;
    try {
      const { MineExplosionVfx } = await import('/src/game/vfx/MineExplosionVfx.ts');
      const { useCircleFillPipeline } = await import('/src/game/rendering/CircleFillPipeline.ts');
      for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key);
      scene = new Phaser.Scene(key); game.scene.add(key, scene, true); await wait(100);
      const vfx = new MineExplosionVfx(scene, true);
      const screenshot = () => Promise.race([new Promise(r => game.renderer.snapshot(img => r(img.src))), wait(10000).then(() => { throw Error('Capture timeout'); })]);
      for (const count of [1, 6, 18]) {
        for (const mode of ['paths', 'circle-pipeline']) {
          for (const g of [vfx.graphics, vfx.smokeGraphics]) {
            if (mode === 'circle-pipeline') useCircleFillPipeline(g); else g.setPipeline('MultiPipeline'); }
          vfx.reset(); vfx.sequence = 0;
          for (let i = 0; i < count; i++) vfx.emitColors(125 + i % 6 * 240, 150 + Math.floor(i / 6) * 240, 90, 0xffffff, 0x63faff, 0xff5bd8, 0x845dff, 0, false);
          const start = performance.now(); vfx.update(120); const updateMs = performance.now() - start;
          await wait(100);
          const original = game.renderer.render, samples = [], updates = [];
          const redraw = () => { const t = performance.now(); vfx.update(120); updates.push(performance.now() - t); };
          scene.events.on('preupdate', redraw);
          game.renderer.render = function(...args) { const t = performance.now(); try { return original.apply(this, args); } finally { samples.push(performance.now() - t); } };
          try { await wait(1500); } finally { game.renderer.render = original; scene.events.off('preupdate', redraw); }
          report.cases.push({ count, mode, samples: samples.length, meanMs: samples.reduce((s, x) => s + x, 0) / samples.length,
            meanUpdateMs: updates.reduce((s, x) => s + x, 0) / updates.length, updateMs });
          if (count === 6) report.screenshots.push({ label: mode, png: await screenshot() });
        }
      }
      const pixels = async png => {
        const image = new Image(); image.src = png; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const compare = async (before, after) => {
        const a = await pixels(before), b = await pixels(after);
        let total = 0, max = 0, different = 0;
        for (let i = 0; i < a.length; i += 4) {
          let pixelMax = 0;
          for (let c = 0; c < 3; c++) { const d = Math.abs(a[i + c] - b[i + c]); total += d; pixelMax = Math.max(pixelMax, d); }
          max = Math.max(max, pixelMax); if (pixelMax > 40) different++;
        }
        const result = { meanRgbDifference: total / (a.length / 4 * 3), maxChannelDifference: max, fractionAbove40: different / (a.length / 4) };
        if (result.meanRgbDifference > .05 || result.fractionAbove40 > .001) throw Error('Circle artwork regression: ' + JSON.stringify(result));
        return result;
      };
      report.art = await compare(report.screenshots[0].png, report.screenshots[1].png);
      report.artStages = [];
      for (const style of ['standard', 'bomblet']) for (const elapsed of [40, 120, 360, 620]) for (const zoom of [1, .9, .65]) {
        scene.cameras.main.setZoom(zoom); vfx.reset(); vfx.sequence = 0;
        for (let i = 0; i < 6; i++) {
          const x = 300 + (i % 3) * 320, y = 280 + Math.floor(i / 3) * 250;
          if (style === 'bomblet') vfx.emitBomblet(x, y, 90, [0xffffff, 0x63faff, 0xff5bd8, 0x845dff], 0);
          else vfx.emitColors(x, y, 90, 0xffffff, 0x63faff, 0xff5bd8, 0x845dff, 0, false);
        }
        vfx.update(elapsed);
        for (const g of [vfx.graphics, vfx.smokeGraphics]) g.setPipeline('MultiPipeline');
        const before = await screenshot();
        for (const g of [vfx.graphics, vfx.smokeGraphics]) useCircleFillPipeline(g);
        report.artStages.push({ style, elapsed, zoom, ...await compare(before, await screenshot()) });
      }
      vfx.destroy();
      const shared = game.renderer.pipelines.get('n3on-circle-fill'), textures = game.textures.getTextureKeys().length;
      for (let i = 0; i < 30; i++) { const next = new MineExplosionVfx(scene, true); next.destroy(); }
      report.lifetime = { cycles: 30, roots: scene.children.list.length, samePipeline: shared === game.renderer.pipelines.get('n3on-circle-fill'), texturesUnchanged: textures === game.textures.getTextureKeys().length };
      if (report.lifetime.roots || !report.lifetime.samePipeline || !report.lifetime.texturesUnchanged) throw Error('Circle pipeline lifetime regression');
    } catch (e) { report.errors.push(String(e.stack ?? e)); }
    finally { if (scene) game.scene.remove(key); report.running = false; }
  })();
  return { started: true };
})();
