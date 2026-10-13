// Isolated-profile integration: actual deployment, pooled projectile spawns, physical floor drivers and cosmetics.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,checks:[],cases:[],errors:[],samples:[]};
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async(fn,label)=>{const end=performance.now()+20000;while(!fn()){if(performance.now()>end)throw Error('Timeout '+label);await wait(40);}};
  const game=n3onGame,savedPads=navigator.getGamepads;
  report.promise=(async()=>{try{
    const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
    const dep=name=>source.match(new RegExp('import\\s*\\{[^}]*\\b'+name+'\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
    const {SaveSystem:S}=await import(dep('SaveSystem')),{RunTransitionManager:T}=await import(dep('RunTransitionManager'));
    const {COSMETICS}=await import('/src/data/cosmetics.ts');
    for(const scene of game.scene.getScenes(false))if(scene.sys.isActive()||scene.sys.isPaused()||scene.sys.isSleeping())game.scene.stop(scene.scene.key);await wait(100);
    check(S.createProfile('Floor '+Date.now().toString().slice(-6)).ok,'isolated profile');
    S.setSettings({masterVolume:0,contextualTutorials:false});S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
    S.addCredits(3000000);S.addCoreTokens(30000);S.addPlasmaChips(30000);
    for(const item of ['projectile-halloween-pumpkin','fence-halloween-pumpkin'])check(S.purchaseAndEquipCosmetic(item).ok,'purchase/equip '+item);
    navigator.getGamepads=()=>[{id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),timestamp:performance.now()}];
    game.scene.start('menu');await wait(100);const menu=game.scene.keys.menu;T.clearForMenu(menu);
    const session={baseSeed:550055,round:9,protocol:'normal',objectiveMode:'open',equippedMods:[],modsEarned:[]};
    T.requestArenaTransition(menu,{reason:'new-run',session});await until(()=>game.scene.isActive('loading')&&T.snapshot(game.scene.keys.loading).lastStep==='awaiting-user-deploy-confirmation','loading');
    game.scene.keys.loading.confirmDeployment(session,'new-run');await until(()=>game.scene.isActive('arena')&&game.scene.keys.arena.roundRuntime?.phase==='active','arena');
    const a=game.scene.keys.arena;globalThis.__floorArena=a;a.pointerLock.hidePrompt();a.playerInput.adoptDevice('gamepad');if(a.state.state==='Paused')a.resumeGameplay();await wait(100);game.scene.pause('arena');
    const f=a.dynamicFloor;check(f&&f.panels.length>0,'round nine installs mechanical floor');
    check(f.activeCount===0,'new round starts stable');
    for(const item of COSMETICS.filter(i=>i.category==='fenceStyle'))check(game.textures.exists('pylon-'+item.id),'cached pylon '+item.id);
    for(const mode of ['normal','grenade','scattershot']){
      a.spawnPlayerAmmoProjectile(mode,a.player.x,a.player.y,0,500,100,0xff00ff,0x52ffff,false,0);
      const p=a.projectiles.at(-1);p.sprite.body.updateFromGameObject();check(p.sprite.texture.key===a.projectileTextureKey,mode+' inherits equipped texture');
      check(p.nativePalette&&!p.sprite.isTinted,mode+' keeps native palette');
      check(Math.abs(p.sprite.displayWidth-a.projectileWidth)<.01,mode+' keeps authored width');
      check(Math.abs(p.sprite.body.width-(mode==='grenade'?14:mode==='scattershot'?7:8))<.01,mode+' retains behavior collision width');
      check(p.damage===(mode==='scattershot'?30:100),mode+' damage unchanged');
      if(mode==='grenade'){check(p.grenadeBouncesRemaining>=2,'grenade bounce budget retained');check(p.grenadeNextBounceAt>a.time.now,'grenade first arc scheduled');}
      a.retireProjectile(p);a.projectiles.pop();
    }
    const checkVolleys=(scene,label)=>{
      const release=p=>scene===a?scene.retireProjectile(p):scene.projectilePool.release(p);
      for(const mode of ['grenade','scattershot'])for(const kind of ['echo','weapon-sync']){
        const before=scene.projectiles.length;
        if(kind==='echo')scene.replayEchoShot({time:0,x:scene.player.x,y:scene.player.y,angle:.2,mode,speed:500,damage:100,critical:false,ricochets:0,grenadeSequence:2,
          texture:scene.projectileTextureKey,width:scene.projectileWidth,height:scene.projectileHeight,nativePalette:true},0,0,.5);
        else scene.spawnTurretAmmoVolley({sprite:scene.player,telemetryId:'floor-audit'},mode,.2,100,scene.time.now);
        const volley=scene.projectiles.slice(before);
        check(volley.length===(mode==='scattershot'?7:1),label+' '+kind+' '+mode+' pellet count');
        check(volley.every(p=>p.sprite.texture.key===scene.projectileTextureKey&&p.nativePalette),label+' '+kind+' '+mode+' equipped art');
        check(volley.every(p=>Math.abs(p.damage-100*(mode==='scattershot'?.3:1)*(kind==='echo'?.5:1))<.001),label+' '+kind+' '+mode+' damage');
        if(mode==='scattershot')check(new Set(volley.map(p=>p.sprite.rotation.toFixed(3))).size===7,label+' '+kind+' spread preserved');
        for(const p of volley)release(p);scene.projectiles.length=before;
      }
    };
    checkVolleys(a,'Arena');
    const aim=a.getAimWorldPoint;let placement;
    for(let y=200;y<1300&&!placement;y+=35)for(let x=200;x<2100&&!placement;x+=35)if(a.isValidPlacement(x,y))placement={x,y};
    a.getAimWorldPoint=()=>placement;a.player.energy=a.player.energyStats.max;a.abilityCooldownUntil.fence=0;a.placeAbility('fence',a.time.now);a.getAimWorldPoint=aim;
    check(a.fences.length===1&&a.fences[0].appearance.id==='fence-halloween-pumpkin','real fence placement uses equipped family');
    check(a.fences[0].pylons.every(p=>p.texture.key==='pylon-fence-halloween-pumpkin'),'both physical fence pylons use cached set artwork');
    const fence=a.fences[0],coords=[fence.x1,fence.y1,fence.x2,fence.y2];fence.markShock(a.time.now);fence.updateCosmetic(a.time.now+70,true);check(coords.join() === [fence.x1,fence.y1,fence.x2,fence.y2].join(),'shock and Rail presentation preserve endpoints');
    for(const item of COSMETICS.filter(i=>i.bombExplosionEffect)){
      const v=a.bombExplosionCosmeticVfx;v.reset();check(v.emitEquipped(item.id,a.player.x,a.player.y,300,0)===item.bombExplosionEffect,'effect catalog '+item.id);v.update(900);check(v.activeEffectCount===1,'live celebration '+item.id);
      for(const visual of v.legacy.values())check(visual.hero.displayWidth<=270,'legacy hero uses authored dimensions '+item.id);
    }
    a.bombExplosionCosmeticVfx.reset();
    check(f.startEvent(),'validated event can start in actual generated Arena');const p=f.panels.find(p=>p.phase==='warning');
    a.player.body.reset(p.x+p.w/2,p.y+p.h/2);a.floorPlayerRelocated();const initial=a.player.x,riderHealth=a.player.hp;
    for(let i=0;i<220;i++)a.updateDynamicFloor(20);
    check(Math.abs(p.offset)>0&&Math.abs(p.offset)<p.w,'actual panel is partway through a slide');
    check(Math.abs(a.player.x-initial-p.offset)<1,'live Arcade player rides translating deck');
    for(let i=0;i<80;i++)a.updateDynamicFloor(20);
    check(p.phase==='open','real floor exposes lava');
    check(a.player.hp===riderHealth&&!a.floorFalling(a.player),'rider steps completely onto fixed receiver floor');
    const gx=p.x+p.w/2,gy=p.y+p.h/2;
    a.player.body.reset(gx,gy);a.floorPlayerRelocated();const hp=a.player.hp,maxHp=a.player.stats.maxHealth,combatInvulnerability=a.player.invulnUntil;
    a.updateDynamicFloor(20);check(a.floorFalling(a.player),'live player enters fall state');check(!a.player.body.enable,'fall suspends Arcade movement');
    for(let i=0;i<75;i++)a.updateDynamicFloor(20);
    check(Math.abs(a.player.hp-(hp-maxHp*.35))<.01,'live lava damage follows max-health tuning');
    check(a.player.body.enable&&!a.floorFalling(a.player),'surviving player body resumes');
    check(f.isSupported(a.player.x,a.player.y,a.player.combatRadius,true),'live player ejected onto safe supported floor');
    check(a.player.invulnUntil===combatInvulnerability,'lava recovery did not add global combat invulnerability');
    const tank=a.spawnEnemy('tank',false,{x:gx,y:gy}),drone=a.spawnEnemy('drone',false);
    check(tank&&drone,'actual ground and flying enemies created');
    tank.body.reset(gx,gy);tank.stats.hp=1000;tank.hp=1000;drone.body.reset(gx,gy);
    const {Mine}=await import(dep('Mine')),{Turret}=await import(dep('Turret'));
    const mine=new Mine(a,gx,gy,0x55ffff,10000,100,100),turret=new Turret(a,gx,gy,0x55ffff,100,10,1,300);
    a.mines.push(mine);a.turrets.push(turret);
    a.updateDynamicFloor(20);
    check(a.floorFalling(tank)&&a.floorFalling(mine)&&a.floorFalling(turret),'real enemy and deployables lose support');
    check(!a.floorFalling(drone),'real flying drone ignores opening');
    for(let i=0;i<75;i++)a.updateDynamicFloor(20);
    check(tank.hp===370&&!a.floorFalling(tank)&&tank.body.enable,'durable ground enemy takes damage and ejects');
    check(f.isSupported(tank.x,tank.y,tank.hazardRadius,true),'large enemy recovery validates full footprint');
    check(!mine.sprite.active&&turret.hp===0,'unsupported mine retires and turret loses health');
    a.mines.splice(a.mines.indexOf(mine),1);a.turrets.splice(a.turrets.indexOf(turret),1);turret.destroy();
    a.spawnPlayerAmmoProjectile('grenade',gx,gy,0,500,100,0xff00ff,0xffffff,false,0);
    const grenade=a.projectiles.at(-1);grenade.grenadeNextBounceAt=a.time.now;const bounces=grenade.grenadeBouncesRemaining;
    check(a.updateGrenadeFlight(grenade,a.time.now,16),'grenade landing in gap requests existing detonation');check(grenade.grenadeBouncesRemaining===bounces,'no invisible floor bounce is consumed');a.retireProjectile(grenade);a.projectiles.pop();
    check(!a.isValidPlacement(gx,gy),'placement rejects lava');check(!a.infusionLandingValid({x:gx,y:gy}),'Relay landing rejects lava');
    check(a.beginPossession(a.player,a.time.now+60000),'player boss possession remains available');
    const boss=a.possession.boss,bossHp=boss.hp,operativeHp=a.player.hp;
    boss.body.reset(gx,gy);boss.shielded=true;a.updateDynamicFloor(20);
    check(a.floorFalling(a.player)&&boss.getData('floorFalling'),'controlled boss uses player floor driver');
    for(let i=0;i<75;i++)a.updateDynamicFloor(20);
    check(Math.abs(boss.hp-(bossHp-boss.maxHp*.35))<.01,'controlled boss shield does not grant lava immunity');
    check(!a.floorFalling(a.player)&&boss.body.enable&&boss.visualRoot.scaleX===1&&boss.legRig.root.scaleX===1,'boss body and layered art recover');
    check(a.player.hp===operativeHp,'boss damage is not charged twice to operative');a.endPossession(false);
    const elapsed=f.elapsed;await wait(200);check(f.elapsed===elapsed,'paused live scene freezes floor time');
    for(let i=0;i<650;i++)a.updateDynamicFloor(20);
    check(f.activeCount===0&&f.panels.every(p=>p.offset===0),'all live panels reconstruct and relock');check(f.isSupported(gx,gy,34),'restored large actor support');
    report.samples.push({cassettes:f.panels.length,navUpdates:f.navigationUpdates,displayObjects:a.floorVisual.displayObjectCount});
    const beforeHeist=f.elapsed;
    const {ANOMALY_BY_ID}=await import(dep('ANOMALY_BY_ID'));
    a.beginAnomalyTransition({anomalyId:'heist',definition:ANOMALY_BY_ID.get('heist'),sessionId:'floor-audit-'+Date.now(),cost:60,portal:{x:a.player.x,y:a.player.y}});
    await until(()=>game.scene.isActive('anomaly-heist')&&game.scene.keys['anomaly-heist'].player,'Heist handoff');
    const heist=game.scene.keys['anomaly-heist'];game.scene.pause('anomaly-heist');
    checkVolleys(heist,'Heist');await wait(100);
    check(a.dynamicFloor===f&&f.elapsed===beforeHeist,'Heist suspension preserves floor model and clock');
    heist.returnToArena(false,'scene-shutdown');
    await until(()=>game.scene.isActive('arena')&&!a.anomalyReturnLifecycle.blocksExternalPause,'Arena restored from Heist');
    game.scene.pause('arena');
    check(a.dynamicFloor===f&&!a.floorFalling(a.player),'Heist return retains floor and safely relocates player');
    check(f.isSupported(a.player.x,a.player.y,a.player.combatRadius,true),'Heist return lands on supported floor');
    a.destroyDynamicFloor();check(!a.dynamicFloor&&!a.floorActors&&!a.floorVisual,'round teardown releases floor owners');
    a.createDynamicFloor(3);check(!a.dynamicFloor,'training round does not create floor hazard');
    a.createDynamicFloor(9);check(a.dynamicFloor&&a.dynamicFloor!==f&&a.dynamicFloor.elapsed===0,'new round gets fresh stable geometry and clock');
    // Keep a paused, warning/opening overview for screenshot inspection.
    a.dynamicFloor.startEvent();for(let i=0;i<275;i++)a.updateDynamicFloor(20);
    const hero=a.dynamicFloor.panels.find(p=>p.phase==='open')??p;a.cameras.main.stopFollow();a.cameras.main.centerOn(hero.x+50,hero.y+50);a.cameras.main.setZoom(1.5);
  }catch(error){report.errors.push(error.stack??String(error));}finally{navigator.getGamepads=savedPads;report.running=false;}})();return 'Dynamic floor integration started';
})()
