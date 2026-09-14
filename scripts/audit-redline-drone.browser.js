(() => {
 const game=n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms)),options=globalThis.__n3onLayoutAuditOptions??{};
 const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[],screenshots:[],frames:[]};
 const check=(ok,label,detail)=>{report.cases.push({ok:!!ok,label,detail});globalThis.__n3onSaveLayoutCheckpoint?.(JSON.stringify({...report,promise:undefined}));if(!ok)throw new Error(label);};
 const until=async(fn,label,timeout=25000)=>{const start=performance.now();while(!fn()){if(performance.now()-start>timeout)throw new Error(label);await wait(50);}};
 const screenshot=async(label)=>report.screenshots.push({label,png:await new Promise(r=>game.renderer.snapshot(img=>r(img.src)))});
 const oldPads=Object.getOwnPropertyDescriptor(navigator,'getGamepads');
 const pad={id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',index:0,connected:true,mapping:'standard',axes:[0,0,1,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})),timestamp:0};
 Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{pad.timestamp=performance.now();return [pad];}});
 const onError=e=>report.errors.push(String(e.error?.stack??e.message??e.reason));
 window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onError);
 let arena,originalUpdate;
 const frames=async(label,ms)=>{
  const values=[];let previous=null;
  const record=()=>{const now=performance.now();if(previous!==null)values.push(now-previous);previous=now;};
  game.events.on('step',record);try{await wait(ms);}finally{game.events.off('step',record);}
  values.sort((a,b)=>a-b);report.frames.push({label,count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values[Math.floor(values.length*.95)],max:values.at(-1)});
 };
 report.promise=(async()=>{
  try{
   await until(()=>game.scene.getScene('arena'),'DEV Arena registered');
   const {SaveSystem}=await import('/src/game/systems/SaveSystem.ts');
   const {TUTORIAL_SEQUENCES}=await import('/src/game/tutorial/TutorialRegistry.ts');
   const {getSpawnProfile,ENEMY_BALANCE}=await import('/src/game/config/balance/index.ts');
   const {Mine}=await import('/src/game/abilities/Mine.ts');
   const {Fence}=await import('/src/game/abilities/Fence.ts');
   const {Turret}=await import('/src/game/abilities/Turret.ts');
   SaveSystem.createProfile('Drone audit '+Date.now().toString().slice(-5));
   SaveSystem.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;p.completedSequences=TUTORIAL_SEQUENCES.map(s=>s.id);});
   for(const s of game.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
   const matrix=options.matrix??(options.focused ? [['supreme-delphinus',148]] : [['normal',1],['normal',30],['normal',148],['overdrive',5],['overdrive',25],['overdrive-pegasus',50],['supreme-leo',51],['supreme-delphinus',148]]);
   report.options={...options,matrix};
   for(const [caseIndex,[protocol,round]] of matrix.entries()){
    report.current=protocol+'/'+round;
    game.scene.start('arena',{baseSeed:550055,round,protocol,objectiveMode:'open',runStartedAt:Date.now(),modsEarned:[],modFocus:null,contract:null,creditsSpentBeforeRun:0,upgradeCompletionPercentage:0,accountProgressionTier:'endgame',runCreditsEarned:0});
    arena=game.scene.getScene('arena');await until(()=>arena.roundRuntime?.phase==='active','Arena active');
    arena.pointerLockInitialGate=false;arena.playerInput.adoptDevice('gamepad');if(arena.state.state==='Paused')arena.state.set('PrePlant');arena.physics.resume();arena.player.invulnUntil=Infinity;
    arena.arcadeController.options.enabled=false;arena.anomalyController.options.enabled=false;
    const family=arena.currentModeFamily(),profile=getSpawnProfile(round,0,family),selections={};
    for(let i=0;i<2000;i++){const type=arena.pickEnemyType(profile,arena.time.now+100000,false);selections[type]=(selections[type]??0)+1;}
    check(protocol==='normal'?!selections.drone:selections.drone>0,'Natural composition '+report.current,selections);
    const random=Math.random;
    try{Math.random=()=>0;for(let i=0;i<5;i++){arena.nextSpawnAt=0;arena.updateRelentlessSpawns(arena.time.now,false);}}finally{Math.random=random;}
    const drones=arena.enemies.filter(e=>e.airborne);
    check(drones.length===(family==='normal'?0:profile.droneCountCap),'Wave spawner respects drone cap '+report.current,drones.length);
    for(const drone of drones)check(!arena.enemyColliders.has(drone)&&!arena.navState.has(drone),'Drone has no ground colliders or path state');
    for(let i=0;i<70;i++){arena.nextSpawnAt=0;arena.updateRelentlessSpawns(arena.time.now,false);}
    await frames(report.current,options.sampleMs??(round===148&&family!=='normal'?10000:2500));
    if(options.matrixOnly&&family==='normal'){
     // The preceding wave check fills the shared budget. Reserve room for this
     // separate event check; Redline correctly refuses to exceed a full budget.
     for(const enemy of [...arena.enemies])arena.removeArcadeEnemy(enemy);
     check(arena.arcadeController.force('redline'),'Normal mode permits Redline activation');
     const event=arena.arcadeController.active;for(let i=0;i<9;i++)event.momentum.kill();
     arena.arcadeController.activeElapsedMs+=7000;arena.arcadeController.update(16);
     const owned=[...event.owned.keys()];
     check(owned.length>0&&owned.every(e=>e.airborne&&e.getData('n3onArcadeEvent')==='redline'),'Normal mode permits event-owned flying pressure');
     arena.arcadeController.stop('round-ended');
     check(owned.every(e=>!e.active)&&!arena.enemies.some(e=>e.airborne),'Normal event retirement leaves no flying enemy');
    }
    if(!options.matrixOnly&&caseIndex===matrix.length-1)break;
    game.scene.stop('arena');await wait(100);
    check(Phaser.Display.Canvas.CanvasPool.pool.filter(e=>e.parent?.scene===arena).length===0,'Scene retirement releases Text canvases '+report.current);
   }
   if(options.matrixOnly)return;
   report.current='flight and defense interactions';
   originalUpdate=arena.sys.sceneUpdate;arena.sys.sceneUpdate=()=>{};arena.physics.pause();
   const clear=()=>{for(const e of [...arena.enemies])arena.removeArcadeEnemy(e);for(const p of arena.projectiles)arena.retireProjectile(p);arena.projectiles.length=0;};clear();
   const drone=arena.spawnEnemy('drone',false);drone.setAlpha(1);drone.hp=10000;
   const wall=arena.wallRects.find(w=>w.w>60&&w.h>60)??arena.wallRects[0];
   drone.body.reset(wall.x+wall.w/2,wall.y+wall.h/2);
   check(arena.hitWall(drone.x,drone.y),'Flight test begins over solid wall');
   const ground=arena.findDroneLootGround(drone.x,drone.y);
   check(!arena.hitWall(ground.x,ground.y)&&!arena.isNearBombSite(ground.x,ground.y,42),'Drone loot resolves onto collectible ground');
   const site=arena.bombSites.sites[0];arena.bombSites.armSite(site,75000,arena.time.now);
   drone.body.reset(site.x,site.y);arena.refreshDefuseAssignments([site],arena.time.now);
   check(!arena.defuseAssignees.has(drone),'Drone never inherits bombsite defusing');
   const point=arena.findDroneLootGround(arena.player.x+120,arena.player.y);drone.body.reset(point.x,point.y);arena.enemySeparationGrid.rebuild(arena.enemies);
   const hp=drone.hp;
   const mine=new Mine(arena,point.x,point.y,0xff9933,0,72,82);arena.mines.push(mine);
   arena.updateAbilities(arena.time.now+10,1/60);
   check(mine.detonateAt===0&&drone.hp===hp,'Ground mine does not trigger on drone');
   mine.beginDetonation(arena.time.now,0);arena.updateAbilities(arena.time.now+20,1/60);
   check(drone.hp===hp,'Ground mine blast excludes drone');
   const fence=new Fence(arena,point.x,point.y,0,0x59e5ff,90,16000,110,30,.68);arena.fences.push(fence);
   arena.updateAbilities(arena.time.now+30,1);
   check(drone.hp===hp,'Fence field excludes airborne drone');
   fence.destroy();arena.fences.length=0;
   check(arena.findProjectileHitEnemy(drone.x,drone.y)===drone,'Player projectile hit detection includes drone');
   const shot=()=>arena.obtainProjectile({x:drone.x,y:drone.y,texture:'circle',width:7,height:7,tint:0xffffff,rotation:0,velocityX:0,velocityY:0,depth:9,damage:16,from:'player',lifeMs:1000,trailColor:0xffffff});
   let projectile=shot();arena.projectiles.push(projectile);arena.updateProjectiles(16);
   check(drone.hp<hp,'Actual pooled player bullet damages drone');
   const beforeGrenade=drone.hp;projectile=shot();arena.detonateGrenadeRound(projectile,drone.x,drone.y,drone);arena.retireProjectile(projectile);
   check(drone.hp<beforeGrenade,'Grenade direct and splash pipeline hits drone');
   const turret=new Turret(arena,point.x-55,point.y,0x59e5ff,145,13,2.5,215);turret.telemetryId='drone-audit';arena.turrets.push(turret);
   const beforeShots=arena.projectiles.length;arena.updateAbilities(arena.time.now+2000,1/60);
   check(arena.projectiles.length>beforeShots&&arena.projectiles.some(p=>p.from==='turret'),'Turret acquires drone and fires pooled volley');
   const laser=arena.laserSecurity, originalTouch=laser.touchesAnySegment;
   const {LASER_HAZARD_BALANCE:laserBalance}=await import('/src/game/config/laserHazards.ts');
   const groundEnemy=arena.spawnEnemy('grunt',false,{x:drone.x,y:drone.y});groundEnemy.hp=10000;
   const beforeLaser=drone.hp;
   try{laser.touchesAnySegment=()=>true;laser.update(laser.createdAt+laserBalance.initialDelayMs+laserBalance.telegraphMs+1,1,arena.player,[drone,groundEnemy],true,false);}finally{laser.touchesAnySegment=originalTouch;}
   check(drone.hp===beforeLaser&&groundEnemy.hp<10000,'Floor laser damages ground enemies and passes under drone');arena.removeArcadeEnemy(groundEnemy);
   const blastMarker=arena.add.circle(drone.x,drone.y,1),bomb=arena.add.circle(drone.x,drone.y,1);
   arena.bombletHazard.detonate({x:drone.x,y:drone.y,marker:blastMarker,bomb,explosionPalette:[0xffffff,0xffaa33,0xff5533,0xff2244]},arena.player,[drone]);blastMarker.destroy();bomb.destroy();
   check(drone.hp<beforeLaser,'Bomblet airstrike blast reaches drone');
   const enemyShot=shot();enemyShot.from='enemy';enemyShot.sprite.body.reset(arena.player.x,arena.player.y);arena.player.invulnUntil=0;
   const hpBeforeShot=arena.player.hp;arena.projectiles.push(enemyShot);arena.updateProjectiles(16);
   check(arena.player.hp<hpBeforeShot,'Enemy projectile pipeline can damage player');arena.player.invulnUntil=Infinity;
   const playerHp=arena.player.hp;drone.body.reset(arena.player.x,arena.player.y);arena.player.invulnUntil=0;arena.physics.world.step(1/60);
   check(arena.player.hp===playerHp,'Airborne overlap has no ground contact damage');arena.player.invulnUntil=Infinity;
   const beforeCredits=arena.roundCredits,beforeKills=arena.pendingProgressEnemyKills;
   const modSources=[],mod=arena.tryAwardMod,drop=arena.dropPickup;let dropped;
   arena.tryAwardMod=(...args)=>{modSources.push(args[0]);return mod.apply(arena,args);};arena.dropPickup=(x,y)=>{dropped={x,y};return drop.call(arena,x,y);};
   drone.body.reset(wall.x+wall.w/2,wall.y+wall.h/2);const random=Math.random;
   try{Math.random=()=>0;drone.hp=0;arena.updateEnemies(arena.time.now,0);}finally{Math.random=random;arena.tryAwardMod=mod;arena.dropPickup=drop;}
   check(arena.roundCredits>beforeCredits&&arena.pendingProgressEnemyKills===beforeKills+1,'Drone kill awards standard currency and kill progress');
   check(modSources.includes('normalEnemy'),'Drone uses ordinary Mod eligibility');
   check(dropped&&!arena.hitWall(dropped.x,dropped.y),'Actual drone death pickup lands off wall',dropped);
   for(const m of arena.mines)m.destroy();arena.mines.length=0;for(const f of arena.fences)f.destroy();arena.fences.length=0;for(const t of arena.turrets)t.destroy();arena.turrets.length=0;
   clear();
   report.current='Redline lifecycle';
   const controller=arena.arcadeController;
   const ordinary=arena.spawnEnemy('drone',false);ordinary.hp=10000;
   check(controller.force('redline'),'Redline activates with ordinary drone alive');
   check(arena.audio.activeArcadeLoop==='overloadEvent','Existing Redline activation audio starts immediately');
   const event=controller.active;
   for(let i=0;i<9;i++)event.momentum.kill();
   controller.activeElapsedMs+=7000;controller.update(16);
   check(event.momentum.stage===3,'Critical RPM reached');
   check(event.owned.size>=1,'Critical spawns bounded event drone pressure');
   let target=[...event.owned.keys()].find(e=>e.getData('redlineTarget'));
   check(target,'Priority target uses shared drone family');
   const marker=target.marker,beforeEscapeKills=arena.pendingProgressEnemyKills;
   event.owned.set(target,controller.activeElapsedMs-1);event.nextTargetAt=Infinity;controller.update(16);
   check(!target.active&&!marker.scene&&arena.pendingProgressEnemyKills===beforeEscapeKills&&event.momentum.targetKills===0,'Escaped target removes marker without kills, loot, or RPM bonus');
   event.nextTargetAt=0;controller.update(16);target=[...event.owned.keys()].find(e=>e.getData('redlineTarget'));
   check(target,'Target can be regenerated within cap');target.hp=0;arena.updateEnemies(arena.time.now,0);
   check(event.momentum.targetKills===1,'Priority kill reaches normal death and event score pipelines');
   event.nextTargetAt=0;controller.update(16);
   check([...event.owned.keys()].some(e=>e.getData('redlineTarget')),'Active target present at termination');
   const owned=[...event.owned.keys()],root=arena.children.getByName('redline-rpm');
   controller.activeElapsedMs=event.startedAt+event.definition.durationMs;controller.update(16);
   check(owned.every(e=>!e.active)&&ordinary.active&&event.owned.size===0,'Timer retires only Redline-owned reinforcements and targets');
   controller.activeElapsedMs+=700;controller.update(16);await screenshot('redline-result');
   controller.activeElapsedMs+=3000;controller.update(16);
   check(!controller.activeEventId&&!root.scene&&ordinary.active,'Completion retires gauge and keeps encounter drone');
   check(arena.audio.activeArcadeLoop===null,'Completion stops Redline loop');
   for(let cycle=0;cycle<3;cycle++){
    check(controller.force('redline'),'Repeated event starts '+cycle);
    const active=controller.active;for(let n=0;n<9;n++)active.momentum.kill();controller.activeElapsedMs+=7000;controller.update(16);
    const owned=[...active.owned.keys()],hud=arena.children.getByName('redline-rpm');controller.stop(cycle===0?'player-dead':cycle===1?'round-ended':'replaced');
    check(owned.every(e=>!e.active)&&!hud.scene&&ordinary.active,'Stop reason clears only event ownership '+cycle);
   }
   clear();
   arena.sys.sceneUpdate=originalUpdate;originalUpdate=null;arena.physics.resume();
   game.scene.stop('arena');await wait(150);
   game.scene.start('arena',{baseSeed:550055,round:30,protocol:'overdrive',objectiveMode:'open',runStartedAt:Date.now(),modsEarned:[],modFocus:null,contract:null,creditsSpentBeforeRun:0,upgradeCompletionPercentage:0,accountProgressionTier:'endgame',runCreditsEarned:0});
   arena=game.scene.getScene('arena');await until(()=>arena.roundRuntime?.phase==='active','Fresh sustained arena');
   arena.pointerLockInitialGate=false;arena.playerInput.adoptDevice('gamepad');if(arena.state.state==='Paused')arena.state.set('PrePlant');arena.physics.resume();
   arena.arcadeController.options.enabled=false;arena.anomalyController.options.enabled=false;
   arena.player.invulnUntil=Infinity;
   report.current='sustained Redline';
   const liveController=arena.arcadeController;check(liveController.force('redline'),'Live Redline starts in fresh encounter');const sustained=liveController.active;
   // Assisted kills maintain critical pressure; gameplay, pooled fire, and event timers remain live.
   const moving=setInterval(()=>{pad.axes[0]=Math.cos(performance.now()*.0008);pad.axes[1]=Math.sin(performance.now()*.0008);},120);
   const assist=setInterval(()=>{
    if(!arena.sys.isActive()||arena.roundRuntime.phase!=='active')return;
    arena.player.energy=arena.player.energyStats.max;arena.player.invulnUntil=Infinity;
    const enemy=arena.enemies.find(e=>e.active&&!e.isDead()&&!e.getData('redlineTarget'));
    if(enemy)enemy.takeDamage(100000,'weapon');
    else arena.spawnEnemy('grunt',false);
   },1400);
   try{
    await frames('Redline first 20 seconds',20000);await screenshot('redline-live');
    await frames('Redline middle 20 seconds',20000);
    await frames('Redline final 16 seconds',16000);
   }finally{clearInterval(assist);clearInterval(moving);pad.axes[0]=0;pad.axes[1]=0;}
   check(!liveController.activeEventId,'Full live Redline timer completes');report.result=sustained.result;
   check(sustained.result?.rank&&sustained.result.score>0,'Live result records score and rank',sustained.result);
   check(!arena.enemies.some(e=>e.getData('n3onArcadeEvent')==='redline'),'Live completion leaves no owned drone');
   game.scene.stop('arena');await wait(150);
   check(Phaser.Display.Canvas.CanvasPool.pool.filter(e=>e.parent?.scene===arena).length===0,'Final scene shutdown releases all Text canvas owners');
  }catch(e){report.errors.push(String(e.stack??e));}
  finally{
   if(originalUpdate&&arena)arena.sys.sceneUpdate=originalUpdate;
   if(oldPads)Object.defineProperty(navigator,'getGamepads',oldPads);else delete navigator.getGamepads;
   window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);
   report.running=false;
  }
 })();return 'Drone and Redline gameplay audit started';
})();
