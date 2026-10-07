// Run after audit-skybreach.browser.js with __skyPreview=true, in an isolated DEV profile.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],errors:[],samples:[]};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  report.promise=(async()=>{try {
    const sky=globalThis.__sky,game=globalThis.n3onGame;
    check(sky?.sys.isActive()||sky?.sys.isPaused(),'SkyBreach active from actual Arena handoff');
    sky.scene.pause();sky.retireFlights();sky.clearThreats();
    sky.player.invulnUntil=Infinity;sky.inputController.held=()=>false;
    const diagnostics=sky.getScalingDiagnostics();report.scaling=diagnostics;
    sky.input.keyboard.emit('keydown-F6');sky.updateDevPerformanceOverlay(sky.time.now);
    check(sky.devPerformanceOverlay.text.includes(`Hardpoint ${diagnostics.hardpointHealth} each / Core ${diagnostics.coreHealth}`),'F6 shows actual scaling source and separate hardpoint/core health');
    sky.devPerformanceOverlay.setVisible(false);
    const {ENEMY_BALANCE,TANK_HOMING_MISSILE_BALANCE:T}=await import('/src/game/config/balance/index.ts');
    const {getProtocolModeBalance}=await import('/src/game/config/modeBalance.ts');
    const mode=getProtocolModeBalance(sky.session.protocol),curve=sky.session.difficulty,phase=curve.defensePhase?1:.9;
    for(const role of ['drone','tank','interceptor','strike','aa','zeppelin']) {
      const enemy=sky.spawnAircraft(role,sky.player.x+100,sky.player.y-220);
      const base=ENEMY_BALANCE[role==='drone'?'drone':['tank','aa','zeppelin'].includes(role)?'tank':'shooter'];
      check(enemy.stats.hp===Math.round(base.hp*(1+(curve.healthMultiplier-1)*phase)*curve.contractHealthMultiplier*mode.enemyHealthMultiplier*(role==='zeppelin'?7:1)),role+' actual HP matches captured Arena');
      check(enemy.stats.damage===Math.round(base.damage*(1+(curve.damageMultiplier-1)*phase)*mode.enemyDamageMultiplier),role+' actual damage matches captured Arena');
    }
    sky.retireFlights();
    const drone=sky.spawnAircraft('drone',sky.player.x,sky.player.y-240),df=sky.flights.get(drone);
    df.age=1;sky.updateEnemies(sky.time.now,.1);
    const droneShot=sky.projectiles.find(p=>p.owner==='enemy');
    check(df.volleys===1&&droneShot?.damage===drone.stats.damage,'drone acquires player and fires a scaled physical round');
    check(droneShot.sprite.texture.key==='sky-shot-kinetic','drone round has physical projectile artwork');
    check(droneShot.sprite.body.velocity.y>0,'drone shot travels toward player');
    const before=df.volleys;drone.disabledUntil=sky.time.now+5000;df.age=5;sky.updateEnemies(sky.time.now,.1);
    check(df.volleys===before,'disabled drone cannot fire');drone.disabledUntil=0;
    let hit=0;const originalDamage=sky.damagePlayer.bind(sky);sky.damagePlayer=value=>{hit+=value;};
    droneShot.sprite.body.reset(sky.player.x,sky.player.y);sky.updateProjectiles(sky.time.now,16);
    check(hit===drone.stats.damage,'actual drone projectile reaches shared player-damage path');sky.damagePlayer=originalDamage;
    sky.retireFlights();sky.clearThreats();
    const tank=sky.spawnAircraft('tank',sky.player.x-100,sky.player.y-180),tf=sky.flights.get(tank);
    sky.player.body.reset(tank.x+180,sky.player.y);
    tf.shotAt=0;sky.updateEnemies(sky.time.now,.016);
    check(sky.seekers.size===1,'ground tank launches Arena-style seeker');
    const missile=[...sky.seekers.keys()][0],firstAngle=missile.sprite.rotation;
    check(missile.sprite.texture.key==='tank-homing-missile'&&missile.lifeMs===T.lifetimeMs,'seeker reuses Arena artwork and lifetime');
    check(missile.damage===T.damage*mode.enemyDamageMultiplier,'tank missile retains Arena damage owner');
    sky.player.body.reset(sky.player.x+170,sky.player.y);sky.updateProjectiles(sky.time.now,100);
    check(missile.sprite.rotation!==firstAngle&&Math.abs(missile.sprite.rotation-firstAngle)<=T.turnRateRadiansPerSecond*.1+.001,'seeker turns toward moving player with Arena turn limit');
    tf.shotAt=0;sky.updateEnemies(sky.time.now,.016);check(sky.seekers.size===1,'tank cannot launch a second live seeker');
    sky.spawnPlayerAmmoProjectile('normal',missile.sprite.x,missile.sprite.y,0,1000,0xffffff,0xffffff,false,0);
    sky.updateProjectiles(sky.time.now,16);check(sky.seekers.size===0,'shared player projectile intercepts a tank seeker');
    const shooter=sky.spawnAircraft('interceptor',sky.player.x,250);
    for(let i=0;i<250;i++)sky.fireSkyShot('kinetic',shooter,Math.PI/2,300,1);
    check(sky.skyShots.size===160,'all ordinary and boss fire respects 160-shot ceiling');
    sky.clearThreats();
    for(let i=0;i<30;i++)sky.fireSkyShot('missile',shooter,Math.PI/2,220,1);
    check(sky.seekers.size===12,'seeker count capped at twelve');
    sky.clearThreats();check(!sky.skyShots.size&&!sky.seekers.size,'threat cleanup releases seeker and pooled projectile references');
    sky.retireFlights();
    const ship=sky.spawnAircraft('zeppelin',720,260),sf=sky.flights.get(ship),kinds=new Set();
    for(let i=0;i<3;i++){
      sf.shotAt=0;sky.updateEnemies(sky.time.now,.016);for(const kind of sky.skyShots.values())kinds.add(kind);sky.clearThreats();
    }
    check(['plasma','missile','flak'].every(kind=>kinds.has(kind)),'airship rotates heavy plasma, seekers and flak');
    sky.retireFlights();sky.airshipAt=0;
    sky.spawnFormation('interceptor','corkscrew',6);
    const fighters=[...sky.flights.keys()];
    check(new Set([...sky.flights.values()].map(f=>f.steering.group)).size===2,'Corkscrew Assault has opposing groups');
    for(const enemy of fighters)enemy.hp=enemy.stats.hp=1e8;
    const mission=sky.updateMission;sky.updateMission=()=>{};sky.scene.resume();
    await wait(4200);
    check(fighters.some(e=>Math.abs(sky.flights.get(e).steering.bank)>.3),'live fighters roll through corkscrew');
    check(fighters.some(e=>/bank-(?:-?[12])$/.test(e.texture.key)),'live fighters use cached perspective frames');
    check([...sky.flights.values()].every(f=>f.volleys>0),'both corkscrew groups fire while maneuvering');
    sky.scene.pause();sky.updateMission=mission;sky.retireFlights();sky.clearThreats();
    sky.missionTime=Math.max(10000,sky.missionTime);sky.bossStartedAt=sky.missionTime;sky.scheduler.nextAt=0;sky.scheduler.cursor=0;
    for(const h of sky.hardpoints)h.fired=0;
    sky.updateDreadnought();sky.missionTime+=450;sky.updateDreadnought();
    check(sky.hardpoints.slice(0,2).every(h=>h.fired>0),'both front cannons fire in the opening combination');
    const activeShots=sky.projectiles.length;
    const first=sky.hardpoints[0];sky.damageEnemy(first.enemy,1e12,{equivalentDamage:1e12,multiplier:.5});sky.updateDreadnought();
    check(first.wreck.visible&&first.wreck.texture.key==='sky-wreck','destroyed hardpoint shows torn machinery');
    sky.missionTime+=1000;sky.updateDreadnought();
    check(first.power.visible&&first.smoke.alpha>0,'electrical failures and smoke persist');
    check(!sky.bossBursts.some(b=>b.owner===first.enemy),'destroyed forward weapon cancels its remaining burst');
    check(!sky.bossOpen&&sky.core.hp===sky.core.stats.hp,'one destroyed hardpoint does not expose or damage core');
    report.cases.push({passed:true,firstForwardShots:sky.hardpoints.slice(0,2).map(h=>h.fired),activeShots});
    // A short bounded mixed-load measurement. Assisted invulnerability and raised enemy HP.
    sky.clearThreats();sky.airshipAt=0;
    const roles=['drone','interceptor','strike','tank','aa','zeppelin'];
    while(sky.flights.size<sky.difficulty.activeCap){const i=sky.flights.size;const e=sky.spawnAircraft(roles[i%roles.length],140+(i%7)*170,220+Math.floor(i/7)*140);e.hp=e.stats.hp=1e8;}
    const {HeistPerformanceProfiler}=await import('/src/game/anomalies/heist/HeistPerformanceProfiler.ts');
    sky.performanceProfiler=new HeistPerformanceProfiler();
    const frames=[];let last=performance.now();const frame=()=>{const now=performance.now();frames.push(now-last);last=now;};game.events.on('step',frame);sky.scene.resume();
    await wait(6000);sky.scene.pause();game.events.off('step',frame);
    const times=frames.filter(Number.isFinite).sort((a,b)=>a-b);
    report.samples.push({frames:times.length,mean:times.reduce((a,b)=>a+b,0)/times.length,p95:times[Math.floor(times.length*.95)],max:times.at(-1),activeEnemies:sky.flights.size,diagnostics:sky.getScalingDiagnostics(),profiler:sky.performanceProfiler?.snapshot()});
    check(sky.skyShots.size<=160&&sky.seekers.size<=12,'mixed combat remains within projectile bounds');
    check(sky.mechanicalDestruction.stats().fragmentCapacity<=168,'destruction retains existing fragment cap');
    check(sky.performanceProfiler.snapshot().renderWork.samples>0,'SkyBreach DEV profiler records actual renderer samples');
    // Leave the paused composition available for screenshot review.
  }catch(error){report.errors.push(String(error.stack??error));}finally{report.running=false;}})();
  return {started:true};
})();
