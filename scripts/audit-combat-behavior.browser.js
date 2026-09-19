(() => {
 const game=n3onGame, wait=ms=>new Promise(r=>setTimeout(r,ms));
 const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[],screenshots:[]};
 const check=(ok,label,detail)=>{report.cases.push({ok:!!ok,label,detail});if(!ok)throw Error(label);};
 const until=async(fn,label)=>{const start=performance.now();while(!fn()){if(performance.now()-start>30000)throw Error(label);await wait(50);}};
 const live=path=>performance.getEntriesByType('resource').findLast(e=>e.name.includes(path+'?t='))?.name??path;
 const all=scene=>{const out=[];const visit=o=>{out.push(o);o.list?.forEach(visit);};scene.children.list.forEach(visit);return out;};
 let arena,originalUpdate,config,boundsDefaults,gen,fire;
 const parent=game.scale.parent,originalStyle={width:parent.style.width,height:parent.style.height};
 const size={w:game.scale.width,h:game.scale.height};
 report.promise=(async()=>{
  try {
   const {SaveSystem}=await import(live('/src/game/systems/SaveSystem.ts'));
   const {TUTORIAL_SEQUENCES}=await import('/src/game/tutorial/TutorialRegistry.ts');
   const {SFX_CATEGORIES,SFX_DEFINITIONS}=await import(live('/src/game/config/audio.ts'));
   const profile=SaveSystem.createProfile('Combat '+Date.now().toString().slice(-6));
   check(profile.ok,'Isolated test profile',profile);
   SaveSystem.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;p.completedSequences=TUTORIAL_SEQUENCES.map(s=>s.id);});
   SaveSystem.setSettings({soundVolumes:{...SaveSystem.get().settings.soundVolumes,shot:.37,droneFlight:.61}});
   for(const s of game.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
   game.scene.getScene('options')?.expandedAudioCategories.clear();
   game.scene.start('options',{returnScene:'main-menu'});await until(()=>game.scene.getScene('options')?.sys.isActive(),'Options open');await wait(200);
   let options=game.scene.getScene('options');
   const toggle=id=>{
    const category=SFX_CATEGORIES.find(c=>c.id===id);
    const label=all(options).find(o=>typeof o.text==='string'&&o.text.includes(category.label.toUpperCase()));
    check(!!label,'Category header '+id);
    const target=options.scrollStates.get('audio').targets.find(t=>t.target===label.parentContainer);
    const state=options.scrollStates.get('audio');state.offset=Math.min(state.max,Math.max(0,target.centerY-options.audioCategoryTop-35));options.applyTabScroll('audio');
    const hit=label.parentContainer.getByName('button-hit');check(hit.input.enabled,'Category reachable '+id);hit.emit('pointerdown');
   };
   for(const cat of SFX_CATEGORIES)toggle(cat.id);
   check(SFX_DEFINITIONS.every(d=>all(options).some(o=>o.text===d.label.toUpperCase())),'Every individual channel is still present');
   options.selectTab('interface');options.selectTab('audio');
   check(options.expandedAudioCategories.size===8,'Expansion survives tab switching');
   options.updateSoundVolume('droneFlight',.42);
   check(SaveSystem.get().settings.soundVolumes.shot===.37&&SaveSystem.get().settings.soundVolumes.droneFlight===.42,'Changing drone gain preserves other saved channels');
   for(const [w,h] of [[1280,720],[960,600]]){
    parent.style.width=w+'px';parent.style.height=h+'px';game.scale.resize(w,h);game.scale.refresh();await wait(450);options=game.scene.getScene('options');
    check(options.expandedAudioCategories.size===8,'Expansion survives resize '+w);
    const state=options.scrollStates.get('audio');state.offset=state.max;options.applyTabScroll('audio');
    const master=all(options).find(o=>o.text==='MASTER VOLUME');
    const matrix=master.getWorldTransformMatrix();check(matrix.ty>options.viewport.top&&matrix.ty<options.viewport.bottom,'Global mixer remains pinned '+w);
    const target=state.targets.find(t=>t.centerY===options.viewport.top+89);check(target?.target.input.enabled,'Pinned master accepts input '+w);
    report.screenshots.push({label:'audio-categories-'+w,png:await new Promise(r=>game.renderer.snapshot(img=>r(img.src)))});
   }
   game.scene.stop('options');await wait(100);
   parent.style.width=originalStyle.width;parent.style.height=originalStyle.height;game.scale.resize(size.w,size.h);game.scale.refresh();
   ({ARENA_GENERATION_CONFIG:config}=await import('/src/game/config/arenaGeneration.ts'));
   ({ArenaGenerator:gen}=await import(live('/src/game/systems/ArenaGenerator.ts')));
   boundsDefaults={minWidth:config.minWidth,minHeight:config.minHeight};config.minWidth=config.maxWidth;config.minHeight=config.maxHeight;gen.resetHistory();gen.forceArenaType('open-field');
   game.scene.start('arena',{baseSeed:550055,round:148,protocol:'supreme-delphinus',objectiveMode:'open',runStartedAt:Date.now(),modsEarned:[],modFocus:null,contract:null});
   arena=game.scene.getScene('arena');await until(()=>arena.roundRuntime?.phase==='active','Arena active');
   Object.assign(config,boundsDefaults);gen.forceArenaType(null);
   arena.player.invulnUntil=Infinity;arena.pointerLockInitialGate=false;arena.playerInput.adoptDevice('gamepad');arena.state.set('PrePlant');
   originalUpdate=arena.sys.sceneUpdate;arena.sys.sceneUpdate=()=>{};arena.physics.pause();
   const bounds=arena.layout.generation.bounds;
   check(bounds.w===config.maxWidth&&bounds.h===config.maxHeight,'Largest production arena bounds',bounds);
   for(const e of [...arena.enemies])arena.removeArcadeEnemy(e);
   const playerPoint=arena.pathfinder.findNearestWalkableWorld(bounds.x+bounds.w-150,bounds.y+bounds.h-150,0,20);
   const spawn=arena.pathfinder.findNearestWalkableWorld(bounds.x+150,bounds.y+150,0,20);
   arena.player.body.reset(playerPoint.x,playerPoint.y);
   const enemies=['grunt','shooter','defuser','tank','disruptor','star','drone'].map(type=>arena.spawnEnemy(type,false));
   enemies.forEach((e,i)=>{e.body.reset(spawn.x,spawn.y+i*8);const nav=arena.navState.get(e);if(nav){nav.lastSampleX=e.x;nav.lastSampleY=e.y;nav.lastSampleAt=arena.time.now;}});
   const distances=enemies.map(e=>Math.hypot(e.x-arena.player.x,e.y-arena.player.y));
   arena.rebuildEnemySpatialIndex?.();arena.updateEnemies(arena.time.now,1/60);
   check(enemies.every(e=>e.body.velocity.length()>0),'Every type starts pursuing from opposite corner',enemies.map((e,i)=>({type:e.stats.type,distance:distances[i],speed:e.body.velocity.length()})));
   check(distances.every(d=>d>2000),'Acquisition tested beyond 2000 world pixels');
   arena.physics.resume();arena.sys.sceneUpdate=(time,delta)=>arena.updateEnemies(time,delta/1000);await wait(5000);arena.sys.sceneUpdate=()=>{};arena.physics.pause();
   check(enemies.every((e,i)=>Math.hypot(e.x-arena.player.x,e.y-arena.player.y)<distances[i]-100),'All types make sustained progress',enemies.map((e,i)=>({type:e.stats.type,progress:distances[i]-Math.hypot(e.x-arena.player.x,e.y-arena.player.y)})));
   const site=arena.bombSites.sites[0];arena.bombSites.armSite(site,90000,arena.time.now);arena.updateEnemies(arena.time.now,1/60);
   check(arena.navigationHasObjective&&arena.defuseAssignees.size>0,'Planted site retains defuser assignments');
   site.activeBomb=false;site.state='Detonated';arena.updateEnemies(arena.time.now+17,1/60);
   check(!arena.navigationHasObjective&&arena.defuseAssignees.size===0,'Objective completion immediately restores global pursuit');
   const blocked=enemies[0],nav=arena.navState.get(blocked);nav.lastSampleX=blocked.x;nav.lastSampleY=blocked.y;nav.lastSampleAt=arena.time.now-241;nav.stuckTicks=1;
   arena.updateEnemies(arena.time.now,1/60);check(nav.recoveryUntil>arena.time.now,'Sampled no-progress recovery activates');
   const query=arena.pathfinder.findPath;let queries=0;arena.pathfinder.findPath=function(...args){queries++;return query.apply(this,args);};
   for(let i=0;i<30;i++)arena.spawnEnemy('grunt',false);arena.updateEnemies(arena.time.now+1000,1/60);arena.pathfinder.findPath=query;
   check(queries<=8,'Path searches stay within per-update budget',queries);
   const audio=arena.audio;await audio.droneAudio.ready;
   const drone=enemies.find(e=>e.airborne);drone.body.reset(arena.player.x+70,arena.player.y);
   SaveSystem.setSettings({soundVolumes:{...SaveSystem.get().settings.soundVolumes,droneFlight:0}});audio.refreshMix();audio.updateDroneAudio(arena.time.now+2000,arena.enemies,arena.player.x,arena.player.y);await wait(120);
   check(audio.droneAudio.voices.every(v=>v.gain.gain.value<.00001),'Drone individual mute reaches actual spatial mixer');
   SaveSystem.setSettings({soundVolumes:{...SaveSystem.get().settings.soundVolumes,droneFlight:.42}});audio.refreshMix();audio.updateDroneAudio(arena.time.now+2300,arena.enemies,arena.player.x,arena.player.y);await wait(150);
   check(audio.droneAudio.voices.some(v=>v.gain.gain.value>0),'Drone volume restores actual spatial gain');audio.stopDroneAudio();
   for(const p of arena.projectiles)arena.retireProjectile(p);arena.projectiles.length=0;
   for(const e of [...arena.enemies])arena.removeArcadeEnemy(e);
   const victim=arena.spawnEnemy('tank',false);victim.body.reset(playerPoint.x,playerPoint.y);
   arena.enemySeparationGrid.rebuild(arena.enemies);
   const makeShot=(from,x,y,ammoMode)=>arena.obtainProjectile({x,y,texture:'pixel',width:8,height:3,tint:0x62eeff,rotation:0,velocityX:300,velocityY:0,depth:8,damage:3,from,lifeMs:1000,trailColor:0x62eeff,ammoMode,previousX:x-15,previousY:y});
   const originalShake=arena.cameras.main.shake;let shakes=0;arena.cameras.main.shake=function(...args){shakes++;return originalShake.apply(this,args);};
   for(const [from,mode] of [['player',undefined],['turret',undefined],['player','scattershot']]){
    arena.projectileImpactVfx.reset();const hp=victim.hp,p=makeShot(from,victim.x,victim.y,mode);arena.projectiles.push(p);arena.updateProjectiles(0);
    check(Math.abs(hp-victim.hp-3)<1e-8&&!p.sprite.active&&!arena.projectiles.includes(p),'Impact preserves damage and projectile retirement '+from+' '+mode);
    check(arena.projectileImpactVfx.stats(arena.time.now).impacts===1,'Actual collision emits one bounded impact '+from+' '+mode);
   }
   arena.projectileImpactVfx.reset();const wallShot=makeShot('player',bounds.x+5,bounds.y+bounds.h*.5);wallShot.previousX=bounds.x+60;wallShot.ricochetsRemaining=1;wallShot.sprite.setRotation(Math.PI);wallShot.sprite.setVelocity(-300,0);arena.projectiles.push(wallShot);arena.updateProjectiles(0);
   check(wallShot.ricochetsRemaining===0&&wallShot.sprite.active&&arena.projectiles.includes(wallShot),'Surface impact preserves ricochet and live pooled shot');
   check(arena.projectileImpactVfx.stats(arena.time.now).impacts===1,'Actual ricochet emits surface impact');
   check(shakes===0,'Normal and scattershot impacts add no camera shake');arena.cameras.main.shake=originalShake;
   arena.retireProjectile(wallShot);arena.projectiles.length=0;
   victim.body.reset(playerPoint.x-100,playerPoint.y);victim.lastShotMs=-Infinity;arena.updateTankHomingMissile(victim,arena.time.now);
   const missile=arena.homingMissiles.at(-1);check(!!missile,'Tank launches authored homing missile');
   missile.sprite.body.updateFromGameObject(); // Physics normally synchronizes art scale on its next step.
   check(missile.sprite.texture.key==='tank-homing-missile'&&Math.abs(missile.sprite.body.width-30)<.01&&Math.abs(missile.sprite.body.height-14/12*10)<.01,'New artwork preserves missile world collision size',{width:missile.sprite.body.width,height:missile.sprite.body.height});
   arena.projectileImpactVfx.reset();const missileClock=arena.time.now;arena.updateHomingMissiles(16);const firstTrail=arena.projectileImpactVfx.trails[0];
   const firstX=firstTrail.x;missile.sprite.body.reset(missile.sprite.x-20,missile.sprite.y-20);arena.time.now+=40;arena.updateHomingMissiles(16);
   check(arena.projectileImpactVfx.stats(arena.time.now).smoke===2&&firstTrail.x===firstX,'Trail retains world samples while missile turns');
   arena.detonateHomingMissile(missile,'intercepted');check(arena.projectileImpactVfx.stats(arena.time.now).impacts===1&&!missile.sprite.active,'Intercepted missile emits bounded explosion and retires');arena.time.now=missileClock;
   const {SharedFireTrapSystem}=await import(live('/src/game/hazards/SharedFireTrapSystem.ts'));
   const {getFireHazardDamageProfile}=await import(live('/src/game/config/fireHazards.ts'));
   for(const environment of ['arena','heist'])for(const fps of [15,30,60,144]){
    let damage=0,alive=true;const hits=[];const clockBefore=arena.time.now,start=clockBefore+100;
    arena.player.hp=arena.player.stats.maxHealth;arena.player.invulnUntil=0;
    fire=new SharedFireTrapSystem(arena,[{id:'fixture',x:playerPoint.x-100,y:playerPoint.y,rotation:0,kind:'wall'}],{environment,particlesEnabled:true,damageProfile:getFireHazardDamageProfile(1,'normal'),isPlayerAlive:()=>alive,onDamagePlayer:amount=>{damage+=amount;hits.push(amount);arena.player.takeDamage(amount);}});
    const advance=(time,target)=>{arena.time.now=time;fire.update(time,target);};
    const nozzle=fire.nozzles[0];nozzle.state='ignition';nozzle.stateStartedAt=start-140;fire.nextWallSelectionAt=Infinity;
    const target={x:playerPoint.x,y:playerPoint.y,velocityX:0,velocityY:0};
    for(let elapsed=0;elapsed<1100;elapsed+=1000/fps)advance(start+elapsed,target);
    check(Math.abs(damage-35.7)<1e-8,'Full active fire delivers 35.7 HP '+environment+' '+fps,{damage,hits});
    check(Math.abs(arena.player.stats.maxHealth-arena.player.hp-35.7)<1e-8,'Real Player invulnerability accepts all direct pulses '+environment+' '+fps,{lost:arena.player.stats.maxHealth-arena.player.hp});
    advance(start+1200,target);check(nozzle.state==='cooldown'&&!audio.fireVoices.has(nozzle),'Flame end stops direct damage and owned sound '+environment+' '+fps);
    for(let elapsed=1250;elapsed<2500;elapsed+=50)advance(start+elapsed,target);
    check(Math.abs(damage-39.7)<1e-8&&!fire.burning.isActive(start+2500),'Burn adds four HP and expires '+environment+' '+fps,{damage});
    check(Math.abs(arena.player.stats.maxHealth-arena.player.hp-39.7)<1e-8,'Real Player accepts post-contact burn '+environment+' '+fps);
    nozzle.state='ignition';nozzle.stateStartedAt=start+2500-140;advance(start+2500,target);check(audio.fireVoices.has(nozzle),'Active flame owns pooled audio');
    audio.pauseEventPresentationLoops();check(audio.fireVoices.get(nozzle).paused,'Pause suspends flame audio');audio.resumeEventPresentationLoops();
    alive=false;advance(start+2550,target);check(!fire.burning.isActive(start+2550)&&!audio.fireVoices.has(nozzle),'Death clears burn and voice');
    fire.destroy();fire=null;arena.time.now=clockBefore;
   }
   const vfx=arena.projectileImpactVfx,retained=[...vfx.impacts,...vfx.trails];
   for(let i=0;i<10000;i++){vfx.emit(playerPoint.x,playerPoint.y,i,0xffffff,arena.time.now);vfx.emitMissileTrail(playerPoint.x,playerPoint.y,i,arena.time.now);}
   check(vfx.stats(arena.time.now).impacts===48&&vfx.stats(arena.time.now).smoke===192,'Ten thousand emissions remain bounded',vfx.stats(arena.time.now));
   check(retained.every((slot,i)=>slot===(i<48?vfx.impacts[i]:vfx.trails[i-48])),'Hot emissions reuse all preallocated slots');
   vfx.update(arena.time.now+700);check(vfx.stats(arena.time.now+700).impacts===0&&vfx.stats(arena.time.now+700).smoke===0,'Impacts and smoke fully expire');
   const cx=1200,cy=800;arena.cameras.main.stopFollow();arena.cameras.main.setZoom(1.5).centerOn(cx,cy);
   for(let i=0;i<6;i++)arena.add.image(cx-200+i*75,cy-30,'tank-homing-missile').setDisplaySize(30,14).setRotation(i*.35).setDepth(9);
   for(let i=0;i<18;i++)vfx.emitMissileTrail(cx-220+i*5,cy+50+Math.sin(i*.16)*30,i*.1,arena.time.now-i*30);
   vfx.emit(cx,cy+50,0,0x62eeff,arena.time.now);vfx.emitMissileImpact(cx+120,cy+50,0,arena.time.now);vfx.update(arena.time.now+30);
   report.screenshots.push({label:'projectile-impact-layers',png:await new Promise(r=>game.renderer.snapshot(img=>r(img.src)))});
   arena.sys.sceneUpdate=originalUpdate;originalUpdate=null;game.scene.stop('arena');await wait(150);
   check(audio.fireVoices.size===0&&audio.roundAudioDiagnostics().activeCount===0,'Shutdown retains no owned combat audio');
   check(arena.children.list.length===0,'Shutdown retires all display roots');
  }catch(e){report.errors.push(String(e.stack??e));}
  finally{
   fire?.destroy();if(config&&boundsDefaults)Object.assign(config,boundsDefaults);gen?.forceArenaType(null);
   if(originalUpdate&&arena)arena.sys.sceneUpdate=originalUpdate;
   for(const key of ['arena','options'])if(game.scene.getScene(key)?.sys.isActive())game.scene.stop(key);
   parent.style.width=originalStyle.width;parent.style.height=originalStyle.height;game.scale.resize(size.w,size.h);game.scale.refresh();report.running=false;
  }
 })();return 'Combat behavior audit started';
})();
