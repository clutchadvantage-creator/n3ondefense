// Real isolated-profile Arena handoff, followed by deterministic assisted combat checks.
(() => {
  (async () => {
    const options=globalThis.__n3onLayoutAuditOptions??{};
    globalThis.__skyPreview=true;
    globalThis.__skyTestModes=[[options.mode??'normal',options.mode==='supreme'?26:9]];
    const {default:source}=await import('/scripts/audit-skybreach.browser.js?raw');(0,eval)(source);
    const report=globalThis.__n3onLayoutAudit;await report.promise;
    delete globalThis.__skyPreview;delete globalThis.__skyTestModes;
    if(report.errors.length)return;report.running=true;
    const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    try {
      const sky=globalThis.__sky,arena=globalThis.__skyArena,game=globalThis.n3onGame;
      sky.scene.pause();sky.physics.pause();sky.retireFlights();sky.clearThreats();
      sky.player.invulnUntil=Infinity;
      const rack=sky.mineChargeRack,cfg=sky.session.abilities.mine;
      check(rack===arena.mineChargeRack,'rockets retain the exact Arena charge-rack instance');
      sky.updateHud(sky.time.now);
      check(sky.hudPayload.abilities[2].label==='ROCKET','existing mine control is labeled ROCKET in flight');
      check(sky.hud.abilitySlots.get('mine').labelText.text==='ROCKET','rendered HUD honors the flight ability label');
      const tick=ms=>{sky.time.now+=ms;sky.missionTime+=ms;sky.activeDelta=ms/1000;sky.updateMines(sky.time.now);};
      const expire=()=>tick(15000);
      for(const count of [3,5]) {
        rack.reset(count);sky.player.energy=sky.player.energyStats.max;
        const energy=sky.player.energy;sky.placeMine(sky.time.now);
        check(rack.snapshot(sky.time.now,cfg.cooldownMs).currentCharges===count-1,`${count}-charge rack spends exactly one charge`);
        check(sky.player.energy===energy-cfg.energyCost&&sky.mines.length===0,'rocket preserves mine energy cost without deploying a ground mine');
        const rocket=sky.rockets.slots.find(s=>s.motion);
        check(rocket.damage===cfg.damage&&rocket.radius===cfg.radius&&Math.abs(rocket.motion.armAt-rocket.motion.launchAt-cfg.armMs)<.001,'rocket inherits equipped damage, radius and arming time');
        const remaining=rack.snapshot(sky.time.now,cfg.cooldownMs).currentCharges;
        sky.placeMine(sky.time.now);
        check(rack.snapshot(sky.time.now,cfg.cooldownMs).currentCharges===remaining,'deployment delay prevents duplicate charge spending');
        expire();
      }
      rack.reset(3);sky.player.energy=0;sky.placeMine(sky.time.now);
      check(rack.snapshot(sky.time.now,cfg.cooldownMs).currentCharges===3&&sky.rockets.available===32,'insufficient energy launches nothing and spends no charge');
      sky.player.energy=sky.player.energyStats.max;
      const enemy=sky.spawnAircraft('interceptor',sky.player.x+150,sky.player.y-180);enemy.hp=enemy.stats.hp=100000;
      sky.placeMine(sky.time.now);const rocket=sky.rockets.slots.find(s=>s.motion),before=enemy.hp;
      tick(16);check(rocket.motion.target===enemy,'rocket acquires closest aircraft instead of sealed reactor');
      for(let i=0;i<400&&enemy.hp===before;i++)tick(16);
      check(enemy.hp<before,'seeking rocket delivers existing radial damage to lateral target');
      expire();sky.retireFlights();
      sky.modRuntime.equipped.set('full-rack-salvo',3);sky.modRuntime.equipped.set('magnetic-payload',3);
      rack.reset(5);sky.player.energy=sky.player.energyStats.max;
      const energy=sky.player.energy,salvo=sky.modRuntime.fullRackSalvo();
      sky.placeFullRackSalvo(sky.time.now,-999,-999);
      check(sky.rockets.available===27&&rack.snapshot(sky.time.now,cfg.cooldownMs).currentCharges===0,'Full Rack Salvo launches all five charges without an aim placement');
      check(sky.player.energy===energy-cfg.energyCost*5*salvo.energyCostMultiplier,'salvo preserves equipped energy discount');
      check(sky.rockets.slots.filter(s=>s.motion).every(s=>s.magneticDelay>0),'magnetic payload detonation delay survives conversion');
      const pending=sky.rockets.slots.find(s=>s.motion),motion={...pending.motion},clock=sky.missionTime;
      sky.updateWorld(sky.time.now+20000,0);
      check(sky.missionTime===clock&&JSON.stringify(pending.motion)===JSON.stringify(motion),'paused world does not age rocket fuses or move rockets');
      const victim=sky.spawnAircraft('interceptor',sky.player.x+80,sky.player.y-150);victim.hp=victim.stats.hp=100000;
      let pulling=false;
      for(let i=0;i<500&&victim.hp===100000;i++){
        tick(16);if(sky.rockets.slots.some(s=>s.motion&&s.detonateAt>0))pulling=true;
      }
      check(pulling&&victim.hp<100000&&victim.slowedUntil>sky.time.now,'magnetic rocket pulls before exploding and applies rank-three slow');
      check(sky.hardpoints.every(h=>!h.enemy.active||h.enemy.body.velocity.length()===0),'magnetic rockets never displace Dreadnought hardpoints');
      expire();
      report.cases.push({name:'shared charge rack, rocket guidance and mine Mod parity',passed:true});

      const aa=sky.spawnAircraft('aa',210,380),site=sky.flights.get(aa).site,aaBody=aa.body;
      sky.world.update(.1,sky.pickupBounds.h);sky.updateEnemies(sky.time.now,.1);
      check(aa.x===site.image.x&&aa.y===site.image.y&&aa.body===aaBody,'live AA remains anchored to independently scrolling tower');
      sky.damageEnemy(aa,1e9);sky.updateEnemies(sky.time.now,.016);sky.world.update(0,sky.pickupBounds.h);
      check(!aa.active&&site.image.active&&site.shadow.active&&site.wreck.visible,'AA defeat destroys turret only and leaves rooftop wreck');
      const y=site.y;sky.world.update(.5,sky.pickupBounds.h);
      check(Math.abs(site.y-y-24.5)<.001&&site.image.visible,'destroyed AA building keeps scrolling at street speed');
      const h=sky.hardpoints[0],coreHp=sky.core.hp;
      sky.damageEnemy(h.enemy,1e10);sky.updateDreadnought();
      check(!h.enemy.active&&h.wreck.visible&&sky.core.hp===coreHp&&!sky.bossOpen,'hardpoint destruction preserves boss armor rules');
      check(sky.weaponDestruction.slots.some(s=>s.active)&&sky.weaponDestruction.slots.length===8,'premium AA/hardpoint celebrations use eight fixed slots');
      sky.weaponDestruction.update(sky.missionTime+200);
      check(sky.weaponDestruction.slots.some(s=>s.stage===1&&s.barrel.visible&&s.ring.visible),'weapon rupture stages include tumbling cannon, shockwave and secondary burst');
      const objects=sky.children.length,textures=game.textures.getTextureKeys().length;
      for(let i=0;i<100;i++)sky.weaponDestruction.emit(h.wreck,sky.missionTime+i,true);
      check(sky.children.length<=objects+20&&game.textures.getTextureKeys().length===textures,'crowded weapon destruction stays bounded and creates no textures');
      sky.weaponDestruction.update(sky.missionTime+3000);sky.mechanicalDestruction.update(sky.missionTime+3000,50);
      check(sky.weaponDestruction.slots.every(s=>!s.active&&!s.ring.visible&&!s.barrel.visible),'celebrations fully retire without timers');
      report.cases.push({name:'independent AA scenery and pooled weapon destruction',passed:true});

      for(const pickup of sky.pickups)pickup.root.destroy(true);sky.pickups.length=0;
      const {SkyBreachSupplies}=await import('/src/game/anomalies/skybreach/SkyBreachSupplies.ts');
      sky.supplies=new SkyBreachSupplies(42);sky.missionTime=0;
      sky.player.hp=sky.player.stats.maxHealth*.2;
      for(let i=0;i<=60;i++){sky.missionTime=i*100;sky.updateResourceSupplies();}
      const health=sky.pickups.find(p=>p.kind==='health');
      check(!!health&&Math.abs(health.root.x-sky.player.x)<=140&&Math.abs(health.root.y-sky.player.y)<=150,'critical no-kill drought offers reachable health within six seconds');
      const offscreen=sky.createGameplayPickup('health',-500,-500);
      check(Math.abs(offscreen.x-sky.player.x)<=140&&Math.abs(offscreen.y-sky.player.y)<=150,'ordinary offscreen enemy health drops cannot block relief from an unreachable location');
      offscreen.destroy(true);
      for(let i=0;i<300;i++)sky.spawnEnemyDrops({x:720,y:230,stats:{valueCredits:3,valueCoreTokens:0}});
      check(sky.pickups.filter(p=>p.kind==='health').length===1&&sky.pickups.filter(p=>p.kind==='energy').length<=1,'rapid kills cannot flood the screen with health or energy');
      const maxHp=sky.player.stats.maxHealth;sky.player.stats.maxHealth=1000;sky.player.hp=100;
      sky.collectGameplayPickup({kind:'health',source:'enemy'},sky.time.now);
      check(sky.player.hp===100+220*sky.modRuntime.multiplier('healthPickupValue'),'health relief scales to upgraded HP and retains pickup Mods');
      sky.player.stats.maxHealth=maxHp;sky.player.hp=maxHp;
      const highway=game.textures.get('sky-industrial').source[0];
      check(highway.width===512&&highway.height===2048,'continuous six-lane highway and signs use one cached repeat texture');
      report.cases.push({name:'need-aware health relief and cached highways',passed:true});

      // Short mixed-load stress: full combat cap, 32 rockets, 160 enemy rounds and eight weapon effects.
      sky.clearThreats();sky.retireFlights();
      for(const pickup of sky.pickups){sky.pickupMotion.delete(pickup.root);pickup.root.destroy(true);}sky.pickups.length=0;
      for(const slot of sky.rockets.slots)sky.rockets.retire(slot);
      // Return to the real Phaser clock after deterministic manual fuse checks.
      sky.scene.resume();sky.physics.resume();await wait(120);sky.scene.pause();
      for(let i=0;i<sky.difficulty.activeCap;i++) {
        const e=sky.spawnAircraft(['drone','interceptor','strike','tank','aa','zeppelin'][i%6],160+i%7*160,180+Math.floor(i/7)*120);
        e.hp=e.stats.hp=1e8;
      }
      const shooter=sky.flights.keys().next().value;
      for(let i=0;i<160;i++)sky.fireSkyShot('kinetic',shooter,Math.PI/2+i*.1,240,1);
      for(let i=0;i<32;i++)sky.rockets.launch(500+i*12,720,-Math.PI/2,sky.missionTime,cfg.armMs,cfg.damage,cfg.radius,0);
      const capCount=sky.children.length;for(let i=0;i<8;i++)sky.weaponDestruction.emit({x:250+i*130,y:300},sky.missionTime,true);
      const missionBefore=sky.missionTime,rocketStart=sky.rockets.slots[0].motion.y;
      const frames=[];let last=performance.now();const step=()=>{const now=performance.now();frames.push(now-last);last=now;};
      game.events.on('step',step);sky.physics.resume();sky.scene.resume();
      await wait(5000);sky.scene.pause();game.events.off('step',step);
      frames.sort((a,b)=>a-b);
      check(sky.missionTime>missionBefore+4000&&(!sky.rockets.slots[0].motion||sky.rockets.slots[0].motion.y!==rocketStart),'stress sample advances real gameplay and rocket flight');
      report.samples.push({mode:sky.session.protocol,frames:frames.length,p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],max:frames.at(-1),
        rockets:32-sky.rockets.available,objectsBefore:capCount,objectsAfter:sky.children.length,destruction:sky.mechanicalDestruction.stats()});
      check(sky.rockets.slots.length===32&&sky.weaponDestruction.slots.length===8&&sky.world.aaSites.length<=24,'combat stress retains rocket, destruction and scenery caps');
      if(options.capture){
        sky.retireFlights();sky.clearThreats();sky.healthBars.clear();
        for(const slot of sky.rockets.slots)sky.rockets.retire(slot);
        for(const site of sky.world.aaSites){site.active=false;for(const image of [site.image,site.shadow,site.wreck,site.smoke])image.setVisible(false);}
        for(const enemy of sky.enemies)enemy.setVisible(false);sky.hull.setVisible(false);
        for(const point of sky.hardpoints){point.wreck.setVisible(false);point.smoke.setVisible(false);point.power.setVisible(false);}
        for(const door of sky.coreDoors)door.setVisible(false);
        sky.spawnAircraft('aa',210,420);sky.spawnAircraft('aa',1230,280);
        sky.player.body.reset(720,720);sky.world.update(0,sky.pickupBounds.h);
      } else {
        const roots=sky.rockets.slots.flatMap(s=>[s.sprite,s.exhaust]);
        sky.scene.resume();sky.returnToArena(false,'scene-shutdown');await wait(1000);
        check(game.scene.isActive('arena')&&roots.every(r=>!r.scene),'anomaly return releases all rocket render objects');
        check(sky.rockets.slots.length===0&&sky.weaponDestruction.slots.length===0&&sky.world.aaSites.length===0,'scene retirement clears new retained references');
      }
    } catch(error) { report.errors.push(String(error.stack??error)); }
    finally { report.running=false; }
  })();return {started:true};
})();
