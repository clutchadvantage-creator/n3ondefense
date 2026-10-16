// Actual Arena -> Heist -> Arena flow in an isolated profile, with assisted damage/placement probes.
(() => {
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], checks: [], errors: [], samples: [] };
  const check = (ok, label) => { report.checks.push({ ok: !!ok, label }); if (!ok) throw Error(label); };
  report.promise = (async () => {
    let restore;
    try {
      const { kineticAuditArena } = await import('/scripts/kinetic-audit-setup.js');
      const { a, game, wait, until, restoreInput } = await kineticAuditArena({ round: 26, protocol: 'supreme-leo' }); restore = restoreInput;
      const { ANOMALY_BY_ID } = await import('/src/game/anomalies/AnomalyRegistry.ts');
      game.scene.resume('arena'); a.player.invulnUntil = Infinity;
      a.beginAnomalyTransition({ anomalyId: 'heist', definition: ANOMALY_BY_ID.get('heist'), sessionId: 'repair-heist-' + Date.now(), cost: 60, portal: { x: a.player.x, y: a.player.y } });
      await until(() => game.scene.isActive('anomaly-heist') && game.scene.keys['anomaly-heist'].sentryRooms, 'Heist');
      const h = game.scene.keys['anomaly-heist']; globalThis.__repairHeist = h;
      h.session.inputBridge = undefined; h.inputController.adoptDevice('gamepad'); h.player.invulnUntil = Infinity;
      game.scene.pause(h.scene.key); h.physics.pause();
      const rooms = h.sentryRooms.rooms, vault = h.facility.layout.vaultBounds;
      check(rooms.length === 3, 'three independently planned rooms');
      check(game.scene.isSleeping('arena'), 'Arena remains suspended');
      const move = (x, y) => { h.player.body.reset(x, y); h.facility.update(h.time.now, x, y); };
      const tick = ms => { h.time.now += ms; h.sentryRooms.update(ms); h.updateEnemies(h.time.now, ms / 1000); };
      for (const r of rooms) { move(r.plan.sentry.x - 70, r.plan.sentry.y); tick(2000); }
      check(rooms.every(r => r.state.phase === 'dormant'), 'entering rooms without damage leaves every sentry concealed');
      const e0 = h.enemies[0]; h.damageEnemy(e0, 1);
      check(rooms.every(r => r.state.phase === 'dormant'), 'unrelated patrol damage outside rooms triggers nothing');
      const prop = h.environmentSmashables.props.find(p => p.placement.id === rooms[0].plan.propId);
      h.environmentSmashables.damageArea(prop.placement.x, prop.placement.y, 5, 1);
      check(rooms[0].state.phase === 'deploying' && rooms[1].state.phase === 'dormant', 'actual smashable hit deploys only its room');
      tick(400); check(!rooms[0].enemy && rooms[0].turret.sprite.alpha > 0, 'deployment visible before combat entity appears');
      const elapsed = rooms[0].state.elapsedMs; h.sentryRooms.update(0);
      check(elapsed === rooms[0].state.elapsedMs, 'pause freezes deployment');
      tick(600); const sentry = rooms[0].enemy;
      check(sentry?.active && rooms[0].state.phase === 'active', 'sentry becomes a live combat entity only after rise');
      const node = h.facility.layout.nodes.find(n => n.id === rooms[1].plan.nodeId);
      h.spawnEnemy('grunt', node.x, node.y, false); const enemy = h.enemies.at(-1); h.damageEnemy(enemy, 1);
      check(rooms[1].state.phase === 'deploying' && rooms[2].state.phase === 'dormant', 'enemy damage inside second room triggers only second room');
      move(sentry.x - 80, sentry.y); const projectileCount = h.projectiles.length; tick(1400);
      check(h.projectiles.length > projectileCount, 'active sentry fires through existing projectile pipeline');
      const { heistEnemyStats } = await import('/src/game/anomalies/heist/HeistEnemyStats.ts');
      const mini = heistEnemyStats('tank', h.campaignPositions.difficultyPosition, h.session.protocol, true, h.session.difficulty?.loadout);
      check(sentry.stats.hp === mini.hp * .5, 'Supreme26 health exactly half applicable mini-boss');
      const hp = sentry.hp; h.damageEnemy(sentry, 7); check(sentry.hp === hp - 7, 'existing damage pipeline damages sentry');
      const count = h.lootPickups.activeCount, rewardCalls = []; const spawn = h.lootPickups.spawn.bind(h.lootPickups);
      h.lootPickups.spawn = (x,y,r,s) => { rewardCalls.push({x,y,r}); spawn(x,y,r,s); };
      h.damageEnemy(sentry, 1e9); h.updateEnemies(h.time.now, .016);
      check(rooms[0].state.phase === 'destroyed' && !sentry.active, 'sentry destruction retires combat entity');
      check(rewardCalls.length === 1 && rewardCalls[0].x === rooms[0].plan.sentry.x && h.lootPickups.activeCount > count, 'one provisional loot reward at sentry position');
      h.sentryRooms.killed(sentry); h.sentryRooms.damageAt(sentry.x,sentry.y); tick(150);
      check(rewardCalls.length === 1 && rooms[0].breakupPlayed, 'repeat death/trigger cannot duplicate loot; secondary mechanical breakup plays');
      report.samples.push({ miniBossHp: mini.hp, sentryHp: sentry.stats.hp, debris: h.sentryRooms.destruction.stats() });
      // Physical stacks settle and collect into the same provisional pending loot.
      const pendingBefore = JSON.stringify(h.pendingLoot);
      move(rooms[0].plan.sentry.x,rooms[0].plan.sentry.y);
      game.scene.resume(h.scene.key);h.physics.resume();await wait(1500);
      // Earlier deterministic probes advanced Clock.now; let the real scene clock
      // catch up before checking actual pickup cooldowns without bypassing them.
      await until(()=>h.lootPickups.pickups.every(p=>h.time.now>=p.collectibleAt),'physical loot cooldown');
      for(const pickup of [...h.lootPickups.pickups])if(pickup.root.active){move(pickup.root.x,pickup.root.y);await wait(150);}
      game.scene.pause(h.scene.key);h.physics.pause();
      check(JSON.stringify(h.pendingLoot) !== pendingBefore, 'sentry physical loot is collectible and provisional');
      h.facility.setVaultDoorOpen(true);
      h.spawnEnemy('tank', vault.x+vault.w/2, vault.y+vault.h/2, true); const relocated = h.enemies.at(-1);
      check(!h.facility.isInsideVault(relocated.x,relocated.y,-relocated.body.halfWidth), 'spawn request inside open vault relocates safely outside');
      const safe = {x:relocated.x,y:relocated.y}; relocated.body.reset(vault.x+vault.w/2,vault.y+vault.h/2); h.updateEnemies(h.time.now,.016);
      check(relocated.x===safe.x&&relocated.y===safe.y, 'forced hostile relocation into vault restores prior safe position');
      move(vault.x+vault.w/2,vault.y+vault.h/2); h.facility.prepareNavigationTarget(h.player.x,h.player.y);
      for(const e of h.enemies) { const n=h.facility.navigationTarget(e.x,e.y,h.player.x,h.player.y); check(!h.facility.isInsideVault(n.x,n.y),'hostile route target stays outside open vault'); }
      const door=h.facility.layout.vaultDoors[0], approach=h.facility.layout.nodes.find(n=>n.id===door.approachNodeId);
      h.spawnEnemy('grunt',approach.x,approach.y,false);const walker=h.enemies.at(-1);
      for(let i=0;i<180;i++){walker.body.setVelocity((h.player.x-walker.x)*2,(h.player.y-walker.y)*2);walker.body.preUpdate(true,1/60);h.physics.world.collide(walker,h.facility.hostileVaultBarrier);walker.body.postUpdate();h.containHeistHostile(walker);}
      check(!h.facility.isInsideVault(walker.x,walker.y,-walker.body.halfWidth),'real hostile physics cannot cross open vault doorway');
      check(!h.physics.world.collide(h.player,h.facility.vaultDoors), 'opened vault remains accessible to player');
      const c=h.containers[0];h.createContainerBurst(c);
      const arc=h.children.list.findLast(o=>o.type==='Graphics'&&o.x===c.root.x&&o.y===c.root.y);
      check(!!arc,'container electrical burst has a local origin at the destroyed container');
      h.tweens.update(h.time.now,100);check(arc.x===c.root.x&&arc.y===c.root.y,'scaling destruction does not translate its origin');
      report.cases.push({name:'Heist room combat, vault containment, local destruction and provisional loot',passed:true});
      if(globalThis.__n3onLayoutAuditOptions?.capture){move(rooms[1].plan.sentry.x-70,rooms[1].plan.sentry.y+50);h.cameras.main.stopFollow();h.cameras.main.setZoom(1.25).centerOn(h.player.x,h.player.y);h.facility.setAlertLighting(true);for(let i=0;i<30;i++)h.facility.update(h.time.now+i*100,h.player.x,h.player.y);return;}
      game.scene.resume(h.scene.key);h.physics.resume();h.onDevInstantReturn();
      await until(()=>game.scene.isActive('arena')&&!game.scene.isActive('anomaly-heist'),'Arena return');
      check(!h.sentryRooms&&h.enemies.length===0,'shutdown retires room state and hostile references');
      check(a.player.active&&a.roundRuntime.phase==='active','original Arena resumes');game.scene.pause('arena');
    } catch(e) { report.errors.push(String(e.stack??e)); }
    finally { restore?.(); report.running=false; }
  })();return {started:true};
})();
