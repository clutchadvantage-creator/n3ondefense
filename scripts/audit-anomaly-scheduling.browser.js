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
      check(S.createProfile('Portal '+Date.now().toString().slice(-7)).ok,'isolated profile');
      S.setSettings({masterVolume:0,contextualTutorials:false});
      S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
      S.addFluxCores(1000);
      const cases=[['normal',1],['overdrive',1],['supreme',1]];
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
        const a=game.scene.keys.arena;
        a.pointerLock.hidePrompt();a.player.invulnUntil=Infinity;
        // Hold a real simulated controller so the headless capture gate can stay open.
        const pads=navigator.getGamepads;
        const pad={id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),timestamp:performance.now()};
        navigator.getGamepads=()=>[pad];a.playerInput.adoptDevice('gamepad');
        if(a.state.state==='Paused')a.resumeGameplay();
        await wait(160);
        a.scene.pause();
        S.updateTutorialProgress(p=>{p.firstRunStage='arena-teaching';p.trainingRoundsCompleted=0;p.replaySequenceId=null;});
        const freshClock=JSON.stringify(a.worldEventRotation.snapshot);
        for(let i=0;i<240;i++)a.updateWorldEventRotation(250);
        check(JSON.stringify(a.worldEventRotation.snapshot)===freshClock,mode+': new-player training holds events and countdown');
        S.updateTutorialProgress(p=>{p.trainingRoundsCompleted=3;p.firstRunStage='waiting-for-garage';p.replaySequenceId='onboarding.tactics';});
        a.createArcadeController(round,550055);a.createAnomalyController(round,550055);
        const {WorldEventRotation}=await import(dep('WorldEventRotation'));
        const {ARCADE_EVENT_DEFINITIONS}=await import(dep('ARCADE_EVENT_DEFINITIONS'));
        const {ANOMALY_DEFINITIONS}=await import(dep('ANOMALY_DEFINITIONS'));
        const pool=[...ARCADE_EVENT_DEFINITIONS.map(({id})=>({kind:'arcade',id})),...ANOMALY_DEFINITIONS.map(({id})=>({kind:'anomaly',id}))];
        check(pool.length===8,mode+': all eight entries in shared pool');
        const seeds={};
        for(let seed=1;seed<1000&&Object.keys(seeds).length<pool.length;seed++){
          new WorldEventRotation(seed,pool,{remainingMs:0,drawIndex:1}).update(1,true,false,choice=>{seeds[choice.id]??=seed;return true;});
        }
        for(const choice of pool){
          a.arcadeController.stop('replaced');a.anomalyController.stop('round-ended');
          a.worldEventRotation=new WorldEventRotation(seeds[choice.id],pool,{remainingMs:0,drawIndex:1});
          a.updateWorldEventRotation(16);
          for(let i=0;i<20&&a.worldEventRotation.snapshot.pending;i++)a.updateWorldEventRotation(250);
          const active=choice.kind==='arcade'?a.arcadeController.activeEventId:a.anomalyController.activeAnomalyId;
          check(active===choice.id,mode+': shared draw starts '+choice.id+' at round 1 after combat training with unfinished/replayed menu teaching');
          check(a.worldEventRotation.snapshot.remainingMs===105000,mode+': common cooldown for '+choice.id);
          const before=JSON.stringify(a.worldEventRotation.snapshot);
          a.updateWorldEventRotation(250);
          check(JSON.stringify(a.worldEventRotation.snapshot)===before,mode+': '+choice.id+' blocks overlapping events');
          if(choice.kind==='anomaly'){
            const c=a.anomalyController;
            for(let k=0;k<c.chargeTarget;k++)c.handleEnemyKilled(c.visual.x,c.visual.y);
            check(c.state==='portal-ready'&&c.cost>=35&&c.cost<=90,mode+': '+choice.id+' keeps kill charge and valid pricing');
          }
          report.cases.push({mode,round,id:choice.id,seed:seeds[choice.id]});
        }
        a.arcadeController.stop('replaced');a.anomalyController.stop('round-ended');
        a.worldEventRotation=new WorldEventRotation(550055,pool,{remainingMs:40000,drawIndex:5,pending:'anomaly:skybreach'});
        const oldBoss=a.bossEncounter;a.bossEncounter={};a.updateWorldEventRotation(250);a.bossEncounter=oldBoss;
        check(a.worldEventRotation.snapshot.remainingMs===40000,mode+': boss holds shared timer');
        S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.replaySequenceId=null;});
        const def=a.roundManager.currentDefinition();
        const payload={...session,runStartedAt:a.runStartedAt,completedRound:1,completedSeed:def.seed,completedTemplate:def.template,
          nextRound:2,nextSeed:def.seed+1,nextTemplate:def.template,creditsGained:0,coreTokensGained:0,plasmaChipsGained:0,fluxCoresGained:0,
          bossDefeated:null,modFocus:null,contract:null,creditsSpentBeforeRun:0,upgradeCompletionPercentage:0,accountProgressionTier:'new',runCreditsEarned:0};
        a.presentCompletedRound(payload);
        await until(()=>game.scene.isActive('round-finished'),'debrief');
        const finish=game.scene.keys['round-finished'];
        const saved=game.registry.get('round-finished').worldEventRotation;
        check(saved.remainingMs===40000&&saved.pending==='anomaly:skybreach'&&saved.drawIndex===5,mode+': full rotation snapshot reaches debrief');
        const flatten=o=>[o,...(o.list||[]).flatMap(flatten)];
        const label=finish.children.list.flatMap(flatten).find(o=>o.text==='CONTINUE TO NEXT ROUND');
        check(!!label,mode+': actual Continue action found');
        const button=label.parentContainer;
        (button.list.find(o=>o.input?.enabled)||button).emit('pointerdown');
        await until(()=>game.scene.isActive('arena')&&game.scene.keys.arena.roundManager?.round===2,'Continue to round 2');
        const next=game.scene.keys.arena.worldEventRotation.snapshot;
        check(next.remainingMs>39000&&next.remainingMs<=40000&&next.pending==='anomaly:skybreach'&&next.drawIndex===5,
          mode+': Continue/Loading/Arena preserve delay, selection and random cursor');
        game.scene.stop('arena');navigator.getGamepads=pads;
      }
    }catch(error){report.errors.push(String(error.stack||error));}
    finally{report.running=false;report.finishedAt=new Date().toISOString();}
  })();
})();
