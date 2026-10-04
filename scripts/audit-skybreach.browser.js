// Isolated DEV profile. Short assisted integration checks, not an unassisted campaign.
(() => {
  if(globalThis.__n3onLayoutAudit?.running||globalThis.__n3onMixedSession?.running)throw Error('Another fixture is running');
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],samples:[],errors:[],startedAt:new Date().toISOString()};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  const until=async(fn,label)=>{const end=performance.now()+18000;while(!fn()){if(performance.now()>end)throw Error('Timeout: '+label);await wait(40);}};
  const game=globalThis.n3onGame;
  report.promise=(async()=>{
    try{
      const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
      const dep=name=>source.match(new RegExp('import\\s*\\{[^}]*\\b'+name+'\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
      const {SaveSystem:S}=await import(dep('SaveSystem'));
      const {RunTransitionManager:T}=await import(dep('RunTransitionManager'));
      const {getCampaignProtocol}=await import('/src/game/progression/CampaignProgression.ts');
      for(const s of game.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
      await wait(150);
      check(S.createProfile('Sky '+Date.now().toString().slice(-7)).ok,'isolated profile');
      S.setSettings({masterVolume:0,contextualTutorials:false});
      S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
      S.addFluxCores(1000);
      S.addCredits(200000);
      check(S.purchaseAccessCard('heist').ok&&S.purchaseAccessCard('skybreach').ok&&S.purchaseAccessCard('skybreach').ok,'both card types purchased');
      check(S.get().credits===50000,'three cards charge 150,000 Credits');
      check(!S.purchaseAccessCard('heist').ok,'combined purchase cap rejects fourth');
      check(S.getAccessCards().owned.heist===1&&S.getAccessCards().owned.skybreach===2,'owned counts');
      const cases=globalThis.__skyPreview?[['normal',4]]:globalThis.__skyTestModes??[['normal',4],['overdrive',16],['supreme',26]];
      for(const [mode,round] of cases){
        for(const s of game.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
        await wait(100);game.scene.start('menu');await wait(100);
        const menu=game.scene.keys.menu;T.clearForMenu(menu);
        const session={baseSeed:550055,round,protocol:getCampaignProtocol(mode,round),objectiveMode:'open',
          equippedMods:(mode==='supreme'?['calibrated-barrel','sentry-dominion','magnetic-service','supreme-crown-of-stars','supreme-singularity-chamber']:
            ['split-current','sentry-dominion','magnetic-service','calibrated-barrel','cycling-servo']).map(id=>({id,rank:3})),modsEarned:[]};
        T.requestArenaTransition(menu,{reason:'new-run',session});
        await until(()=>game.scene.isActive('loading')&&T.snapshot(game.scene.keys.loading).lastStep==='awaiting-user-deploy-confirmation','deployment');
        game.scene.keys.loading.confirmDeployment(session,'new-run');
        await until(()=>game.scene.isActive('arena')&&game.scene.keys.arena.roundRuntime?.phase==='active','Arena');
        const a=game.scene.keys.arena;globalThis.__skyArena=a;
        a.pointerLock.hidePrompt();a.player.invulnUntil=Infinity;
        // Hold a real simulated controller so the headless capture gate can stay open.
        const pads=navigator.getGamepads;
        const pad={id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),timestamp:performance.now()};
        navigator.getGamepads=()=>[pad];a.playerInput.adoptDevice('gamepad');
        if(a.state.state==='Paused')a.resumeGameplay();
        await wait(160);
        const controller=a.anomalyController;
        check(controller.force(mode==='normal'?'heist':'skybreach'),mode+': force eligible opportunity');
        controller.setForcedCost(35);controller.forceCharge();
        await until(()=>controller.visual?.readyForInteraction,'portal opening');
        a.player.setPosition(controller.visual.x,controller.visual.y);a.player.body.reset(a.player.x,a.player.y);
        const fluxBefore=S.get().fluxCores+a.roundFluxCores;
        if(mode==='normal'){
          const before=JSON.stringify(S.getAccessCards());
          pad.buttons[0]={pressed:true,value:1,touched:true};await wait(160);
          pad.buttons[0]={pressed:false,value:0,touched:false};await wait(80);
          check(game.scene.isPaused('arena')&&!!document.querySelector('.anomaly-entry-dialog'),'entry choices pause Arena');
          check(controller.state==='portal-ready','opening controller input does not also confirm entry');
          const frozen=a.time.now;await wait(200);check(a.time.now===frozen,'entry dialog freezes Arena timer');
          document.querySelector('.anomaly-entry-dialog button:last-child').click();await wait(100);
          check(JSON.stringify(S.getAccessCards())===before&&S.get().fluxCores+a.roundFluxCores===fluxBefore,'cancel spends neither cards nor Flux');
          controller.openEntryChoices();await wait(80);
          [...document.querySelectorAll('.anomaly-entry-dialog button')].find(b=>b.textContent.startsWith('USE SkyBreach')).click();
          await wait(100);
          check(controller.state==='transitioning'&&!document.querySelector('.anomaly-entry-dialog'),'confirmed card begins entry');
          check(S.getAccessCards().owned.skybreach===1&&S.getAccessCards().uses===1,'entry consumes one card and daily use');
          check(a.worldEventRotation.snapshot.lastStarted==='anomaly:skybreach','actual redirected destination recorded');
        }else check(controller.tryEnter(),mode+': paid portal entry');
        controller.launchActive();
        await until(()=>game.scene.isActive('anomaly-skybreach')&&game.scene.keys['anomaly-skybreach'].inputController,'SkyBreach entry');
        const sky=game.scene.keys['anomaly-skybreach'];globalThis.__sky=sky;
        sky.session.inputBridge=undefined;sky.inputController.adoptDevice('gamepad');
        check(fluxBefore-(S.get().fluxCores+a.roundFluxCores)===(mode==='normal'?0:35),mode+': correct card bypass or Flux charge');
        check(game.scene.isSleeping('arena'),mode+': Arena sleeps');
        check(sky.modRuntime===a.modRuntime&&sky.temporaryAmmo===a.temporaryAmmo,mode+': shared authoritative build');
        check(JSON.stringify(sky.player.weapon)===JSON.stringify(a.player.weapon)&&sky.player.hp===a.player.hp,mode+': player stats preserved');
        const arenaTime=a.time.now,body=a.player.body,camera=JSON.stringify(a.anomalySuspensionState.camera);
        const arenaResize=a.anomalySuspensionState.resourceBaseline?.listeners?.resize;
        sky.player.invulnUntil=Infinity;
        await wait(600);
        check(a.time.now===arenaTime&&a.player.body===body,mode+': suspended clock and player remain intact');
        check(sky.player.texture.key==='sky-player'&&sky.player.body.radius*sky.player.scaleX===12,mode+': aircraft keeps 12px collision radius');
        if(globalThis.__skyPreview){sky.startDreadnought();sky.spawnAircraft('zeppelin',200,220);report.samples.push({preview:true});return;}
        const beforeMove=sky.player.x;pad.axes[0]=1;await wait(180);pad.axes[0]=0;
        check(sky.player.x>beforeMove+5,mode+': responsive controller movement');
        pad.axes[2]=1;pad.axes[3]=1;await wait(80);
        check(sky.getAimPoint().y===sky.player.y-180&&sky.getAimPoint().x===sky.player.x,mode+': independent aim input cannot turn forward fire');
        check(!sky.crosshair.visible,mode+': crosshair hidden');pad.axes[2]=0;pad.axes[3]=0;
        sky.player.energy=sky.player.energyStats.max;
        const oldPressed=sky.inputController.pressed.bind(sky.inputController);
        sky.inputController.pressed=action=>action==='dash';sky.updatePlayerMovement(sky.time.now);sky.inputController.pressed=oldPressed;
        check(sky.player.dashUntil>sky.time.now,mode+': dash executes');
        sky.player.energy=sky.player.energyStats.max;sky.abilityState.shieldCooldownUntil=0;sky.activateShield(sky.time.now);
        check(sky.abilityState.shieldActiveUntil>sky.time.now,mode+': shield executes');
        sky.player.energy=sky.player.energyStats.max;sky.abilityState.cooldownUntil.turret=0;sky.placeTurret(sky.time.now);
        check(sky.turrets.length>0,mode+': authoritative turret placed');
        sky.player.energy=sky.player.energyStats.max;sky.placeMine(sky.time.now);
        check(sky.mines.length>0,mode+': mine rack launches');
        sky.player.energy=sky.player.energyStats.max;sky.abilityState.cooldownUntil.fence=0;sky.placeFence(sky.time.now);
        check(sky.fences.length===0&&sky.player.energy===sky.player.energyStats.max,mode+': fence disabled without spending energy');
        sky.updateHud(sky.time.now);check(sky.hudPayload.abilities[0].status==='OFFLINE',mode+': fence HUD explicitly says offline');
        for(const ammo of ['normal','scattershot','grenade']){
          const before=sky.projectiles.length;
          sky.spawnPlayerAmmoProjectile(ammo,sky.player.x,sky.player.y,-Math.PI/2,sky.player.weapon.damage,0x55eeff,0x55eeff,false,0);
          check(sky.projectiles.length>before&&sky.projectiles.at(-1).ammoMode===ammo,mode+': '+ammo+' uses shared projectile pool');
        }
        const oldRate=sky.player.fireRate;sky.player.buffs.rapidFireUntil=sky.time.now+4000;
        check(sky.player.fireRate>oldRate,mode+': Rapid Fire remains active');
        const oldHeld=sky.inputController.held.bind(sky.inputController);
        sky.inputController.held=action=>action==='fire';sky.player.energy=sky.player.energyStats.max;sky.nextPlayerShotAt=0;sky.updatePlayerCombat(sky.time.now);sky.inputController.held=oldHeld;
        check(sky.nextPlayerShotAt>sky.time.now,mode+': shared fire cadence advances');
        sky.retireFlights();
        for(const role of ['drone','tank','interceptor','strike','zeppelin','aa'])sky.spawnAircraft(role,180+sky.flights.size*160,210);
        check(sky.flights.size===6,mode+': all six aircraft/ground roles');
        const aa=[...sky.flights.keys()].find(e=>e.name==='sky-aa');
        const aaShot=sky.flights.get(aa).shotAt;
        sky.scheduleStrike(sky.player.x,sky.player.y,64,12,null);
        check(sky.strikes.length>0,mode+': shared artillery telegraph');
        const frames=[];let last=performance.now();const frame=()=>{const now=performance.now();frames.push(now-last);last=now;};game.events.on('step',frame);
        await wait(3000);game.events.off('step',frame);
        check(sky.flights.get(aa)?.shotAt>aaShot,mode+': AA fires after telegraph');
        report.samples.push({mode,round,difficulty:sky.difficulty,frames:frames.length,mean:frames.reduce((a,b)=>a+b,0)/frames.length,p95:frames.sort((a,b)=>a-b)[Math.floor(frames.length*.95)]});
        const hp=sky.player.hp;sky.player.hp=Math.max(1,hp-20);
        sky.collectGameplayPickup({kind:'health',source:'enemy'},sky.time.now);
        check(sky.player.hp>Math.max(1,hp-20),mode+': health pickup restores');
        sky.player.energy=0;sky.collectGameplayPickup({kind:'energy',source:'enemy'},sky.time.now);
        check(sky.player.energy>0,mode+': energy pickup restores');
        if(mode==='supreme'){
          check(sky.weaponContextMultiplier(sky.time.now)>1,mode+': Crown of Stars pickup surge');
          const target=sky.flights.keys().next().value;target.setPosition(sky.player.x+50,sky.player.y);
          sky.supremeEffects.nextSuppressionScanAt=0;sky.updateEnemies(sky.time.now,.016);
          check(target.slowedUntil>sky.time.now,mode+': Singularity suppression field');
        }
        // Elevated cadence is an explicit fixture control; the real weapon path still owns costs and ammo.
        const fireRate=sky.player.weapon.fireRate;sky.player.weapon.fireRate=45;
        sky.inputController.held=action=>action==='fire';
        let emitted=0;const obtain=sky.projectilePool.obtain.bind(sky.projectilePool);
        sky.projectilePool.obtain=spec=>{if(spec.owner==='player')emitted++;return obtain(spec);};
        const supply=setInterval(()=>{sky.player.energy=sky.player.energyStats.max;sky.player.heat=0;},40);
        await wait(850);clearInterval(supply);sky.projectilePool.obtain=obtain;sky.inputController.held=oldHeld;sky.player.weapon.fireRate=fireRate;
        check(emitted>=12&&emitted<=20,mode+': high fire-rate build respects existing 22/sec ceiling');
        report.samples.at(-1).highRatePlayerProjectiles=emitted;
        if(mode==='normal'){
          const {SKY_FLIGHT}=await import('/src/game/anomalies/skybreach/SkyBreachDirector.ts');
          let boundary=0;
          sky.zeppelinDeployed=false;
          for(let i=0;i<SKY_FLIGHT.length;i++){
            sky.director.elapsed=boundary+.001;sky.director.index=-1;
            await wait(80);sky.director.nextWave=0;await wait(100);
            check(sky.director.index===i,`authored module ${i+1}: ${SKY_FLIGHT[i].name}`);
            if(SKY_FLIGHT[i].role)check([...sky.flights.values()].some(f=>f.role===SKY_FLIGHT[i].role),`module ${i+1} spawns its authored role`);
            sky.retireFlights();boundary+=SKY_FLIGHT[i].duration;
          }
          sky.director.elapsed=boundary+.001;await wait(100);
          check(sky.bossStarted,'final approach automatically starts Dreadnought');
        }
        const wallet=S.get().credits;
        sky.collectLoot({kind:'credits',amount:321},sky.player.x,sky.player.y);
        check(S.get().credits===wallet&&sky.pendingLoot.credits>=321,mode+': loot remains provisional');
        for(const turret of sky.turrets)turret.damage=0;
        for(let i=sky.projectiles.length-1;i>=0;i--)if(sky.projectiles[i].owner!=='enemy')sky.retireProjectile(sky.projectiles[i],i);
        sky.startDreadnought();const coreHp=sky.core.hp;
        if(mode==='normal'){
          const attacks=[];const next=sky.scheduler.next.bind(sky.scheduler);
          sky.scheduler.next=(...args)=>{const attack=next(...args);if(attack)attacks.push(attack);return attack;};
          for(let i=0;i<5;i++){sky.scheduler.nextAt=0;await wait(1800);}
          check(['cannon','missile','broadside','artillery','escorts'].every(a=>attacks.includes(a)),'all five boss attack families execute in live updates');
          sky.scheduler.next=next;
        }
        sky.damageEnemy(sky.core,1e12);check(sky.core.hp===coreHp,mode+': core rejects early damage');
        sky.damageEnemy(sky.core,1e12,{equivalentDamage:1e12,multiplier:.5});check(sky.core.hp===coreHp,mode+': core rejects Echo before opening');
        const cannon=sky.hardpoints[0].enemy;
        sky.bossBursts.push({owner:cannon,remaining:7,at:sky.missionTime,angle:1,step:.1,damage:1});
        for(const h of sky.hardpoints){
          check(sky.findEnemyHit(h.enemy.x,h.enemy.y)===h.enemy,mode+': targetable '+h.id);
          // Echo applies real damage without triggering the equipped Split Current's secondary kill chain.
          sky.damageEnemy(h.enemy,1e12,{equivalentDamage:1e12,multiplier:.5});sky.updateDreadnought();
          check(!sky.aliveWeapons.has(h.id)&&!h.enemy.active,mode+': disabled '+h.id);
        }
        check(sky.bossBursts.length===0&&sky.strikes.length===0,mode+': destroyed weapons cancel queued fire');
        check(sky.bossOpen,mode+': all seven hardpoints expose core');
        const volleyAt=sky.nextCoreVolley;await wait(1700);
        check(sky.nextCoreVolley>volleyAt,mode+': exposed core fires defensive volley');
        sky.damageEnemy(sky.core,1e12);
        await until(()=>sky.rewardDropped,'staged destruction and boss loot');
        check(sky.lootPickups.activeCount>0&&S.get().credits===wallet,mode+': physical boss burst stays pending');
        await wait(900);
        // Move over each actual pickup; do not bypass collection or award directly.
        while(sky.lootPickups.activeCount){
          const p=sky.lootPickups.pickups[0];sky.player.body.reset(p.root.x,p.root.y);await wait(60);
        }
        await until(()=>!!sky.extractionPortal,'return portal after collection');
        const haul={...sky.pendingLoot,modIds:[...sky.pendingLoot.modIds]},roots=sky.children.list.slice();
        const target=sky.missionObjectiveTarget();sky.player.body.reset(target.x,target.y);
        sky.inputController.pressed=action=>action==='interact';sky.updateMission(sky.time.now);sky.inputController.pressed=oldPressed;
        await until(()=>game.scene.isActive('arena')&&!game.scene.isActive('anomaly-skybreach'),'Arena return');
        check(S.get().credits===wallet+haul.credits,mode+': successful haul committed once');
        check(sky.children.length===0&&sky.projectiles.length===0&&sky.flights.size===0,mode+': scene objects and combat references retired');
        check(roots.every(r=>!r.scene),mode+': captured visual roots destroyed');
        check(a.player.body===body&&a.player.active,mode+': same Arena player restored');
        check(a.anomalySuspensionState===null,mode+': suspension snapshot retired');
        check(a.cameras.main.zoom===JSON.parse(camera).zoom&&a.input.enabled,mode+': camera zoom and input restored');
        if(arenaResize!==undefined)check(a.scale.listenerCount('resize')===arenaResize,mode+': resize listeners return to baseline');
        report.samples.at(-1).cameraBefore=camera;
        const paid=S.get().credits;
        if(mode==='normal'){
          a.createAnomalyController(round,550056);const offered=a.anomalyController;
          check(offered.force('heist'),'post-SkyBreach portal offer');offered.forceCharge();
          await until(()=>offered.visual?.readyForInteraction,'card repeat portal');
          offered.openEntryChoices();await wait(80);
          check([...document.querySelectorAll('.anomaly-entry-dialog button')].some(b=>b.textContent.startsWith('SkyBreach CARD')&&b.disabled),'last actual anomaly card is unavailable');
          document.querySelector('.anomaly-entry-dialog button:last-child').click();await wait(80);
        }
        // A second entry uses the same real handoff; opportunity cooldown bypass is a test control.
        // Simulate an intervening Arcade start so this lifecycle test respects repeat protection.
        a.worldEventRotation.state.lastStarted='arcade:redline';
        a.createAnomalyController(round,550056);const second=a.anomalyController;
        check(second.force('skybreach'),mode+': second opportunity');second.forceCharge();
        await until(()=>second.visual?.readyForInteraction,'second portal');
        a.player.body.reset(second.visual.x,second.visual.y);
        check(second.tryEnter(mode==='normal'?{card:'skybreach'}:{}),mode+': second entry begins');second.launchActive();
        await until(()=>game.scene.isActive('anomaly-skybreach'),'second entry');
        const failed=game.scene.keys['anomaly-skybreach'];failed.session.inputBridge=undefined;
        failed.collectLoot({kind:'credits',amount:9999},failed.player.x,failed.player.y);
        failed.player.hp=0;
        await until(()=>game.scene.isActive('arena')&&!game.scene.isActive('anomaly-skybreach'),'failure returns');
        check(S.get().credits===paid,mode+': failure discards only pending earnings');
        check(a.player.hp>=1,mode+': established failure ejection restores playable Arena');
        if(mode==='normal')check(S.getAccessCards().owned.skybreach===0&&S.getAccessCards().uses===2,'failed anomaly still spends access card');
        if(mode==='normal'){
          a.player.invulnUntil=Infinity;a.createAnomalyController(round,550058);const h=a.anomalyController;
          a.worldEventRotation.state.lastStarted='arcade:redline';
          check(h.force('skybreach'),'portal for HEIST card redirect');h.forceCharge();await until(()=>h.visual?.readyForInteraction,'HEIST card portal');
          a.player.body.reset(h.visual.x,h.visual.y);
          const flux=S.get().fluxCores+a.roundFluxCores;
          check(h.tryEnter({card:'heist'}),'HEIST card redirects SkyBreach offer');h.launchActive();
          await until(()=>game.scene.isActive('anomaly-heist'),'HEIST entry');
          const heist=game.scene.keys['anomaly-heist'];heist.session.inputBridge=undefined;
          check(S.get().fluxCores+a.roundFluxCores===flux&&S.getAccessCards().uses===3,'HEIST redirect bypasses Flux and consumes third combined use');
          check(a.worldEventRotation.snapshot.lastStarted==='anomaly:heist','HEIST redirect recorded as actual history');
          check(heist.containers.length>=5&&!!heist.facility,'HEIST facility and containers retain existing initialization');
          check(heist.supportsFences&&heist.getAimPoint!==sky.getAimPoint,'HEIST retains fences and independent aim implementation');
          const saved=S.get().credits;heist.collectLoot({kind:'credits',amount:123},heist.player.x,heist.player.y);
          check(S.get().credits===saved,'HEIST escrow unchanged');heist.completeHeist();
          await until(()=>game.scene.isActive('arena')&&!game.scene.isActive('anomaly-heist'),'HEIST return');
          check(S.get().credits===saved+123,'HEIST commit and return remain functional');
        }
        navigator.getGamepads=pads;
      }
      report.finishedAt=new Date().toISOString();
    }catch(error){report.errors.push(String(error.stack??error));}
    finally{report.running=false;}
  })();
  return {started:true};
})();
