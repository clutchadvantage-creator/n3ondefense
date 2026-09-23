// Isolated diagnostic prototype; production rendering is not patched by this fixture.
(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], screenshots: [] };
  report.promise = (async () => {
    const key = 'explosion-circle-audit'; let scene;
    try {
      const { MineExplosionVfx } = await import('/src/game/vfx/MineExplosionVfx.ts');
      for (const s of game.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()) game.scene.stop(s.scene.key);
      scene = new Phaser.Scene(key); game.scene.add(key, scene, true); await wait(100);
      const vfx = new MineExplosionVfx(scene, true), vertices = [1, 0];
      for (let t = .01; t < 1; t += .01) vertices.push(Math.cos(Math.PI * 2 * t), Math.sin(Math.PI * 2 * t));
      vertices.push(Math.cos(Math.PI * 2), Math.sin(Math.PI * 2));
      const fan = function(x, y, radius) {
        for (let i = 2; i < vertices.length - 2; i += 2)
          this.fillTriangle(x + radius, y, x + vertices[i] * radius, y + vertices[i + 1] * radius,
            x + vertices[i + 2] * radius, y + vertices[i + 3] * radius);
        return this;
      };
      const screenshot = () => Promise.race([new Promise(r => game.renderer.snapshot(img => r(img.src))), wait(10000).then(() => { throw Error('Capture timeout'); })]);
      for (const count of [1, 6, 18]) {
        for (const mode of ['paths', 'triangle-fan']) {
          for (const g of [vfx.graphics, vfx.smokeGraphics]) { if (mode === 'triangle-fan') g.fillCircle = fan; else delete g.fillCircle; }
          vfx.reset();
          for (let i = 0; i < count; i++) vfx.emitColors(125 + i % 6 * 240, 150 + Math.floor(i / 6) * 240, 90, 0xffffff, 0x63faff, 0xff5bd8, 0x845dff, 0, false);
          const start = performance.now(); vfx.update(120); const updateMs = performance.now() - start;
          await wait(100);
          const original = game.renderer.render, samples = [];
          game.renderer.render = function(...args) { const t = performance.now(); try { return original.apply(this, args); } finally { samples.push(performance.now() - t); } };
          try { await wait(1500); } finally { game.renderer.render = original; }
          report.cases.push({ count, mode, samples: samples.length, meanMs: samples.reduce((s, x) => s + x, 0) / samples.length, updateMs });
          if (count === 6) report.screenshots.push({ label: mode, png: await screenshot() });
        }
      }
      const pixels = async png => {
        const image = new Image(); image.src = png; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const a = await pixels(report.screenshots[0].png), b = await pixels(report.screenshots[1].png);
      let total = 0, max = 0, different = 0;
      for (let i = 0; i < a.length; i += 4) {
        let pixelMax = 0;
        for (let c = 0; c < 3; c++) { const d = Math.abs(a[i + c] - b[i + c]); total += d; pixelMax = Math.max(pixelMax, d); }
        max = Math.max(max, pixelMax); if (pixelMax > 40) different++;
      }
      report.art = { meanRgbDifference: total / (a.length / 4 * 3), maxChannelDifference: max, fractionAbove40: different / (a.length / 4) };
      vfx.destroy();
    } catch (e) { report.errors.push(String(e.stack ?? e)); }
    finally { if (scene) game.scene.remove(key); report.running = false; }
  })();
  return { started: true };
})();
