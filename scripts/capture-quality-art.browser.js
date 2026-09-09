// Isolated artwork review at the normal camera scale. Gameplay is verified separately.
(() => {
  const game = globalThis.n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], startedAt: new Date().toISOString() };
  report.promise = (async () => {
    let scene, facility, traps, sites, arena;
    try {
      for (const s of game.scene.getScenes(false)) {
        if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
      }
      await wait(100);
      scene = new Phaser.Scene({ key: 'quality-art' }); game.scene.add('quality-art', scene, true); await wait(100);
      scene.cameras.main.setBackgroundColor('#02050b');
      const capture = async (label, detail = {}) => {
        await wait(120);
        const png = await new Promise(resolve => game.renderer.snapshot(img => resolve(img.src)));
        report.cases.push({ label, ...detail, png });
      };
      const { createHeistFacility } = await import('/src/game/anomalies/heist/HeistFacility.ts');
      const { HeistTrapSystem } = await import('/src/game/anomalies/heist/HeistTrapSystem.ts');
      facility = createHeistFacility(scene, 550055);
      traps = new HeistTrapSystem(scene, facility.trapPlacements, { round: 68, protocol: 'normal' },
        { damagePlayer() {}, snarePlayer() {}, playSfx() {} });
      const camera = scene.cameras.main;
      let presentationTime = 0;
      camera.setBounds(0, 0, 5200, 3320);
      const positions = [ ['entry', facility.layout.entryPoint], ['vault', facility.layout.nodes.at(-1)],
        ...['fire', 'spike', 'snag'].map(type => [type, facility.trapPlacements.find(t => t.type === type)]) ];
      for (const [label, p] of positions) {
        camera.setZoom(.9).centerOn(p.x, p.y);
        for (let i = 0; i < 30; i++) facility.update(presentationTime += 100, p.x, p.y);
        traps.update(0, -1000, -1000, 1);
        await capture(`heist-${label}`, { point: p, diagnostics: facility.diagnostics });
      }
      facility.setAlertLighting(true);
      for (let i = 0; i < 30; i++) facility.update(presentationTime += 100, 2600, 1660);
      camera.setZoom(.24).centerOn(2600, 1660); await capture('heist-map', { layout: facility.layout });
      traps.destroy(); traps = null; facility.destroy(); facility = null;
      const { Enemy, baseEnemyStats } = await import('/src/game/enemies/Enemy.ts');
      const { ENEMY_ROBOT_FRAMES } = await import('/src/game/enemies/EnemyRobotFrames.ts');
      camera.removeBounds().setZoom(1).setScroll(0, 0);
      scene.add.rectangle(0, 0, 6000, 4000, 0x163142).setOrigin(0);
      Object.keys(baseEnemyStats).forEach((type, col) => {
        scene.add.text(140 + col * 245, 72, type.toUpperCase(), { fontSize: '20px', color: '#c5f8ff' }).setOrigin(.5);
        [0, Math.PI / 4, Math.PI / 2, Math.PI].forEach((angle, row) => {
          const enemy = new Enemy(scene, 140 + col * 245, 190 + row * 175, ENEMY_ROBOT_FRAMES[type].textureKey, baseEnemyStats[type]);
          enemy.setRotation(angle); enemy.body.moves = false;
        });
      });
      await capture('enemies-heading'); scene.children.removeAll(true);
      const { ArenaGenerator } = await import('/src/game/systems/ArenaGenerator.ts');
      const { ArenaVisualRenderer } = await import('/src/game/arena/ArenaVisualRenderer.ts');
      const { BombSiteManager } = await import('/src/game/systems/BombSiteManager.ts');
      const { BombSiteState } = await import('/src/game/types.ts');
      ArenaGenerator.resetHistory(); ArenaGenerator.forceArenaType('islands');
      const layout = ArenaGenerator.generate(550055, 'islands', 68, 3); ArenaGenerator.forceArenaType(null);
      arena = new ArenaVisualRenderer(scene, layout);
      camera.setBounds(0, 0, 2400, 1600).setZoom(.5).centerOn(1200, 800);
      await capture('arena-venue');
      camera.setZoom(1).centerOn(1200, layout.generation.bounds.y - 20); await capture('arena-advertisements');
      sites = new BombSiteManager('open', 3);
      sites.initialize(scene, [new Phaser.Math.Vector2(1020, 800), new Phaser.Math.Vector2(1380, 800)], layout.theme);
      sites.sites[1].state = BombSiteState.Armed; sites.refreshVisuals(layout.theme);
      sites.updateAmbient(1380, 800, 3000, true);
      camera.setZoom(1).centerOn(1200, 800); await capture('bombsites');
      report.finishedAt = new Date().toISOString();
    } catch (e) { report.errors.push(String(e.stack ?? e)); }
    finally {
      traps?.destroy(); facility?.destroy(); sites?.destroy(); arena?.destroy();
      if (scene) { game.scene.stop(scene.scene.key); game.scene.remove(scene.scene.key); }
      report.running = false;
    }
  })();
  return { started: true };
})();
