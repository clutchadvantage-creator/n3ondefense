// Real SweptPlayerBody integration and Arcade wall separation, with controlled input.
(() => {
  const game = globalThis.n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], startedAt: new Date().toISOString() };
  report.promise = (async () => {
    let scene;
    try {
      const { generateHeistFacilityLayout } = await import('/src/game/anomalies/heist/HeistFacilityLayout.ts');
      const { normalizeHeistWallJunctions } = await import('/src/game/anomalies/heist/HeistWallRuntime.ts');
      const { SweptPlayerBody } = await import('/src/game/physics/SweptPlayerBody.ts');
      for (const s of game.scene.getScenes(true)) game.scene.stop(s.scene.key);
      await wait(100);
      scene = new Phaser.Scene({ key: 'heist-movement-audit' }); game.scene.add('heist-movement-audit', scene, true); await wait(100);
      scene.physics.disableUpdate(); scene.physics.world.setBounds(0, 0, 5200, 3320);
      const sprite = scene.add.sprite(0, 0, 'player-spaceship');
      const body = sprite.body = new SweptPlayerBody(scene.physics.world, sprite); scene.physics.world.add(body);
      body.setCircle(12, (sprite.width - 24) / 2, (sprite.height - 24) / 2);
      for (const seed of [17, 81337, 550055]) {
        const layout = generateHeistFacilityLayout(seed), rects = normalizeHeistWallJunctions(layout.wallRects);
        const walls = scene.physics.add.staticGroup();
        for (const r of rects) walls.create(r.x + r.w / 2, r.y + r.h / 2, 'pixel').setVisible(false).setDisplaySize(r.w, r.h).refreshBody();
        const traverse = (start, end, steps) => {
          body.reset(start.x, start.y);
          const vx = (end.x - start.x) * 60 / steps, vy = (end.y - start.y) * 60 / steps;
          for (let i = 0; i < steps; i++) {
            body.velocity.set(vx, vy); body.preUpdate(true, 1 / 60);
            scene.physics.world.collide(sprite, walls); body.postUpdate();
          }
          return { x: body.center.x, y: body.center.y, error: Math.hypot(body.center.x - end.x, body.center.y - end.y) };
        };
        const clear = (a, b) => a.x > 90 && a.y > 90 && b.x < 5110 && b.y < 3230 && rects.every(r => {
          for (let i = 0; i <= 40; i++) {
            const x = a.x + (b.x - a.x) * i / 40, y = a.y + (b.y - a.y) * i / 40;
            if (Math.hypot(Math.max(r.x-x, 0, x-r.x-r.w), Math.max(r.y-y, 0, y-r.y-r.h)) < 12) return false;
          } return true;
        });
        const corners = [];
        for (const r of rects) {
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            const x = sx < 0 ? r.x : r.x+r.w, y = sy < 0 ? r.y : r.y+r.h;
            const start = { x: x+sx*20, y:y+sy*10 }, end = { x:x+sx*8, y:y+sy*10 };
            if (clear(start,end)) corners.push({ start, end, ...traverse(start,end,4) });
          }
        }
        const byId = new Map(layout.nodes.map(n => [n.id,n])), corridors = [];
        for (const [a,b] of layout.edges) {
          const first=byId.get(a), second=byId.get(b), horizontal=first.y===second.y;
          for (const offset of [-65,0,65]) for (const reverse of [false,true]) {
            const start={x:first.x+(horizontal?0:offset),y:first.y+(horizontal?offset:0)};
            const end={x:second.x+(horizontal?0:offset),y:second.y+(horizontal?offset:0)};
            const length=Math.hypot(end.x-start.x,end.y-start.y);
            corridors.push({a,b,offset,reverse,...traverse(reverse?end:start,reverse?start:end,Math.ceil(length/4))});
          }
        }
        report.cases.push({seed,wallBodies:rects.length,cornerCount:corners.length,
          blockedCorners:corners.filter(c=>c.error>0.6),corridorCount:corridors.length,
          blockedCorridors:corridors.filter(c=>c.error>0.6)});
        walls.destroy(true); await wait(10);
      }
      report.finishedAt = new Date().toISOString();
    } catch(e) { report.errors.push(String(e.stack??e)); }
    finally { report.running=false; if(scene?.sys?.scene){game.scene.stop('heist-movement-audit');game.scene.remove('heist-movement-audit');} }
  })();
  return { started: true };
})();
